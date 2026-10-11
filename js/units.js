'use strict';
// Lógica de unidades: ordens, movimento, combate, coleta e construção.
// Estes métodos são adicionados ao protótipo de Game.

const AP_WAIT = 0, AP_IN = 1, AP_MOVING = 2, AP_FAIL = 3;
const G = Game.prototype;

// ------------------------------------------------------------------ geometria
G.rectOf = function (t) {
  if (t.kind === 'building' || t.kind === 'res') return { x0: t.tx, y0: t.ty, x1: t.tx + (t.w || 1), y1: t.ty + (t.h || 1) };
  return { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
};
G.edgeDist = function (u, t) {
  if (t.kind === 'building' || t.kind === 'res') {
    const w = t.w || 1, h = t.h || 1;
    const dx = Math.max(t.tx - u.x, 0, u.x - (t.tx + w)), dy = Math.max(t.ty - u.y, 0, u.y - (t.ty + h));
    return Math.hypot(dx, dy);
  }
  return Math.hypot(t.x - u.x, t.y - u.y) - (t.radius || 0.3);
};

// ------------------------------------------------------------------ ordens
G.resetNav = function (u) { u.path = null; u.pathKey = null; u.failN = 0; u.repathCd = 0; };
G.setOrder = function (u, o, queue) {
  if (queue && u.order) { u.orders.push(o); return; }
  u.orders.length = 0; u.order = o; this.resetNav(u);
};
G.nextOrder = function (u) {
  u.order = u.orders.shift() || null;
  this.resetNav(u);
};
G.isMilitary = function (u) { return u.type !== 'villager' && u.type !== 'king'; };

// formação simples: distribui destinos numa grade ao redor do ponto
G.cmdMove = function (units, x, y, queue, attackMove) {
  const n = units.length;
  const cols = Math.ceil(Math.sqrt(n));
  const sp = 0.85;
  let cx = 0, cy = 0;
  for (const u of units) { cx += u.x; cy += u.y; }
  cx /= n; cy /= n;
  const sorted = units.slice().sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
  const dirx = x - cx, diry = y - cy, dl = Math.hypot(dirx, diry) || 1;
  const fx = dirx / dl, fy = diry / dl, rxv = -fy, ryv = fx;
  sorted.forEach((u, i) => {
    if (n === 1) { var ox = 0, oy = 0; } else {
      const row = Math.floor(i / cols), col = i % cols;
      const a = (col - (cols - 1) / 2) * sp, b = row * sp;
      ox = rxv * a - fx * b; oy = ryv * a - fy * b;
    }
    let tx = clamp(x + ox, 0.5, this.n - 0.5), ty = clamp(y + oy, 0.5, this.n - 0.5);
    if (!this.world.freeAt(tx, ty)) { const f = this.world.nearestFree(tx, ty, 6); tx = f.x; ty = f.y; }
    this.setOrder(u, { type: attackMove ? 'attackmove' : 'move', x: tx, y: ty }, queue);
  });
};
G.cmdAttackMove = function (units, x, y, queue) { this.cmdMove(units, x, y, queue, true); };
G.cmdAttack = function (units, t, queue) {
  for (const u of units) this.setOrder(u, { type: 'attack', target: t.id }, queue);
};
G.cmdGather = function (units, t, queue) {
  for (const u of units) {
    if (u.type !== 'villager') { this.setOrder(u, { type: 'move', x: t.x, y: t.y }, queue); continue; }
    this.setOrder(u, { type: 'gather', target: t.id, rkey: t.rkey || (t.kind === 'animal' ? 'hunt' : null), lx: t.x, ly: t.y, stage: 'go' }, queue);
  }
};
G.cmdBuildOn = function (units, b, queue) {
  for (const u of units) {
    if (u.type !== 'villager') { this.setOrder(u, { type: 'move', x: b.x, y: b.y }, queue); continue; }
    this.setOrder(u, { type: 'build', target: b.id }, queue);
  }
};
// Posiciona e inicia a construção. Retorna a construção ou null.
G.cmdBuild = function (units, type, tx, ty, queue, owner) {
  const pidx = owner !== undefined ? owner : (units[0] && units[0].owner);
  const p = this.players[pidx];
  const def = BUILDINGS[type];
  if (def.age > p.age) return null;
  const cost = this.buildCost(p, type);
  if (!this.canAfford(p, cost)) { if (pidx === this.humanIdx) this.notify(pidx, 'Recursos insuficientes', 'warn'); return null; }
  if (!this.canPlace(p, type, tx, ty)) { if (pidx === this.humanIdx) this.notify(pidx, 'Não é possível construir aqui', 'warn'); return null; }
  this.pay(p, cost);
  const b = this.addBuilding(type, pidx, tx, ty, false);
  b.hp = 1;
  for (const u of units) if (u.type === 'villager') this.setOrder(u, { type: 'build', target: b.id }, queue);
  return b;
};
G.cmdSetRally = function (b, x, y, target) { b.rally = { x, y, target: target ? target.id : 0 }; };
G.cmdStop = function (units) { for (const u of units) { u.orders.length = 0; u.order = null; this.resetNav(u); } };

// ------------------------------------------------------------------ movimento
// retorna 1 se chegou, 0 se andando, -1 se bloqueado
G.followPath = function (u, dt) {
  if (!u.path) return 1;
  let step = u.s.speed * dt;
  const w = this.world;
  while (step > 1e-6 && u.pi < u.path.length) {
    const p = u.path[u.pi];
    const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
    if (d <= step) { u.x = p.x; u.y = p.y; step -= d; u.pi++; if (d > 0.01) u.face = Math.atan2(dy, dx); continue; }
    const nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    if (!w.freeAt(nx, ny) && w.freeAt(u.x, u.y)) {
      // tenta deslizar ao longo de um eixo antes de desistir
      if (w.freeAt(nx, u.y)) { u.x = nx; step = 0; u.moving = true; return 0; }
      if (w.freeAt(u.x, ny)) { u.y = ny; step = 0; u.moving = true; return 0; }
      u.path = null; u.blocked = (u.blocked || 0) + 1; return -1;
    }
    u.x = nx; u.y = ny; u.face = Math.atan2(dy, dx); step = 0;
  }
  u.moving = true;
  if (u.pi >= u.path.length) { u.path = null; return 1; }
  return 0;
};

G.approach = function (u, t, reach, dt) {
  const d = this.edgeDist(u, t);
  if (d <= reach) { u.path = null; u.failN = 0; return AP_IN; }
  const mobile = t.kind === 'unit' || t.kind === 'animal';
  u.repathCd -= dt;
  if (mobile && d < 7 && this.world.lineClear(u.x, u.y, t.x, t.y)) {
    u.path = [{ x: t.x, y: t.y }]; u.pi = 0; u.pathKey = 'direct';
  } else {
    const key = t.id + (mobile ? '@' + (t.x | 0) + ',' + (t.y | 0) : '');
    if (!u.path || (u.pathKey !== key && u.repathCd <= 0)) {
      if (this.pathBudget <= 0) return AP_WAIT;
      this.pathBudget--;
      const goalReach = t.kind === 'building' || t.kind === 'res' ? Math.max(reach - 0.02, 0.51) : reach + (t.radius || 0.3) - 0.1;
      const path = this.world.findPath(u.x, u.y, this.rectOf(t), goalReach);
      u.pathKey = key; u.repathCd = mobile ? 0.7 : 0;
      if (path === null || path.length === 0) { u.path = null; u.failN++; return u.failN > 2 ? AP_FAIL : AP_WAIT; }
      u.path = path; u.pi = 0;
    }
  }
  const r = this.followPath(u, dt);
  if (r === 1) { u.failN++; if (u.failN > 3) return AP_FAIL; }
  if (r === -1) { u.pathKey = null; u.failN++; if (u.failN > 6) return AP_FAIL; }
  return AP_MOVING;
};

// ------------------------------------------------------------------ atualização
G.updateUnit = function (u, dt) {
  u.cool = Math.max(0, u.cool - dt);
  u.hitT = Math.max(0, u.hitT - dt);
  u.atkT = Math.max(0, u.atkT - dt);
  u.moving = false;
  u.working = false;
  u.anim += dt;
  const o = u.order;
  if (!o) { this.idleUnit(u, dt); return; }
  switch (o.type) {
    case 'move': this.doMove(u, o, dt); break;
    case 'attackmove': this.doAttackMove(u, o, dt); break;
    case 'attack': this.doAttack(u, o, dt); break;
    case 'gather': this.doGather(u, o, dt); break;
    case 'build': this.doBuild(u, o, dt); break;
    default: this.nextOrder(u);
  }
};

G.doMove = function (u, o, dt) {
  if (!u.path && !o.pathed) {
    o.pathed = true;
    if (dist(u.x, u.y, o.x, o.y) < 0.2) { this.nextOrder(u); return; }
    if (this.world.lineClear(u.x, u.y, o.x, o.y)) { u.path = [{ x: o.x, y: o.y }]; u.pi = 0; }
    else {
      if (this.pathBudget <= 0) { o.pathed = false; return; }
      this.pathBudget--;
      const path = this.world.findPath(u.x, u.y, { x0: o.x, y0: o.y, x1: o.x, y1: o.y }, 0.8);
      if (path === null) { this.nextOrder(u); return; }
      if (this.world.freeAt(o.x, o.y) && dist(path.length ? path[path.length - 1].x : u.x, path.length ? path[path.length - 1].y : u.y, o.x, o.y) < 2) path.push({ x: o.x, y: o.y });
      u.path = path; u.pi = 0;
    }
  }
  const r = this.followPath(u, dt);
  if (r === 1) this.nextOrder(u);
  else if (r === -1) { o.pathed = false; if ((u.blocked || 0) > 6) { u.blocked = 0; this.nextOrder(u); } }
};

G.doAttackMove = function (u, o, dt) {
  u.scan -= dt;
  if (u.scan <= 0) {
    u.scan = 0.4;
    const t = this.findTarget(u, u.s.los + 1);
    if (t) {
      u.orders.unshift(o);
      u.order = { type: 'attack', target: t.id, auto: true, home: null };
      this.resetNav(u);
      return;
    }
  }
  this.doMove(u, o, dt);
};

G.idleUnit = function (u, dt) {
  if (!this.isMilitary(u)) return;
  u.scan -= dt;
  if (u.scan <= 0) {
    u.scan = 0.5;
    const t = this.findTarget(u, u.s.los);
    if (t) { u.order = { type: 'attack', target: t.id, auto: true, home: { x: u.x, y: u.y } }; this.resetNav(u); }
  }
};

// alvo hostil mais próximo dentro do raio
G.findTarget = function (u, r) {
  let best = null, bs = 1e9;
  const can = u.s.atk > 0;
  if (!can) return null;
  this.gridDyn.query(u.x, u.y, r, e => {
    if (e.dead || e.owner < 0 || !this.isEnemy(u.owner, e.owner)) return;
    if (e.kind === 'building' && !e.complete && false) return;
    const d = this.edgeDist(u, e);
    if (d > r) return;
    let sc = d;
    if (e.kind === 'building') sc += (e.s.atk > 0 ? 3 : 9);
    else if (e.type === 'villager') sc += 1.5;
    else if (e.type === 'king') sc += 4;
    // máquinas de cerco só atacam construções (não perdem tempo com unidades)
    if (u.type === 'ram' && e.kind === 'unit') return;
    if (sc < bs) { bs = sc; best = e; }
  });
  return best;
};

// ------------------------------------------------------------------ combate
G.reachOf = function (u) { return u.s.range > 0 ? u.s.range : 0.55; };

G.doAttack = function (u, o, dt) {
  const t = this.ent(o.target);
  if (!t || (t.kind !== 'animal' && !this.isEnemy(u.owner, t.owner))) { this.endAttack(u, o); return; }
  if (o.auto) {
    // não persegue muito longe
    const anchor = o.home || null;
    if (anchor && dist(u.x, u.y, anchor.x, anchor.y) > u.s.los + 6) { this.endAttack(u, o, true); return; }
    if (!anchor && dist(u.x, u.y, t.x, t.y) > u.s.los + 8) { this.endAttack(u, o, true); return; }
  }
  if (u.s.atk <= 0) { this.endAttack(u, o); return; }
  const reach = this.reachOf(u);
  const r = this.approach(u, t, reach, dt);
  if (r === AP_IN) {
    u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.cool <= 0) this.performAttack(u, t);
  } else if (r === AP_FAIL) {
    this.endAttack(u, o, true);
  }
};
G.endAttack = function (u, o, give) {
  if (o.auto && o.home && dist(u.x, u.y, o.home.x, o.home.y) > 3 && !u.orders.length) {
    u.order = { type: 'move', x: o.home.x, y: o.home.y }; this.resetNav(u);
    return;
  }
  this.nextOrder(u);
};

G.performAttack = function (u, t) {
  u.cool = u.s.reload;
  u.atkT = 0.35;
  const atk = { atk: u.s.atk, bonus: u.s.bonus, pierce: u.s.range > 0, proj: u.s.proj, splash: u.s.splash, owner: u.owner, srcId: u.id };
  if (u.s.range > 0) {
    this.fireProjectile(u, t, atk);
  } else {
    this.dealDamage(u, t, atk);
    this.events.push({ type: 'sfx', sfx: 'hit', x: u.x, y: u.y });
  }
};

G.calcDamage = function (atk, t) {
  let a = atk.atk;
  const cls = t.kind === 'building' ? ['building'] : (t.kind === 'unit' ? UNITS[t.type].cls : []);
  for (const c of cls) if (atk.bonus && atk.bonus[c]) a += atk.bonus[c];
  const armor = t.kind === 'animal' ? 0 : (atk.pierce ? t.s.armorP : t.s.armorM);
  return Math.max(1, a - armor);
};

G.dealDamage = function (src, t, atk) {
  if (t.dead) return;
  const dmg = this.calcDamage(atk, t);
  t.hp -= dmg;
  t.hitT = 0.15;
  if (t.kind === 'animal') { t.fleeT = 3; t.fleeFrom = { x: src.x, y: src.y }; }
  if (t.hp <= 0) { this.kill(t, src); return; }
  if (t.owner >= 0 && src.owner >= 0) {
    const tp = this.players[t.owner];
    tp.lastHit = this.time; tp.lastHitPos = { x: t.x, y: t.y };
    if (t.owner === this.humanIdx && (!this.lastAlert || this.time - this.lastAlert > 12)) {
      this.lastAlert = this.time;
      this.notify(t.owner, t.kind === 'building' ? 'Seus edifícios estão sendo atacados!' : (t.type === 'villager' ? 'Seus aldeões estão sendo atacados!' : 'Suas tropas estão sob ataque!'), 'bad', t.x, t.y);
      this.events.push({ type: 'sfx', sfx: 'alert' });
    }
    // reação: unidades militares ociosas revidam
    if (t.kind === 'unit' && this.isMilitary(t) && (!t.order || (t.order.type === 'attackmove')) && src.kind === 'unit' && t.s.atk > 0) {
      if (t.order) t.orders.unshift(t.order);
      t.order = { type: 'attack', target: src.id, auto: true, home: { x: t.x, y: t.y } }; this.resetNav(t);
    }
  }
};

G.fireProjectile = function (src, t, atk) {
  const d = dist(src.x, src.y, t.x, t.y);
  const kind = atk.proj || 'arrow';
  const spd = kind === 'stone' ? 7 : kind === 'bullet' ? 14 : 11;
  this.projectiles.push({ x: src.x, y: src.y, sx: src.x, sy: src.y, tid: t.id, tx: t.x, ty: t.y, atk, srcId: src.id, owner: src.owner, kind, t: 0, dur: Math.max(0.12, d / spd), arc: kind === 'stone' ? 1.6 : 0.5 + d * 0.08 });
  this.events.push({ type: 'sfx', sfx: kind === 'bullet' ? 'shot' : 'bow', x: src.x, y: src.y });
};

G.updateProjectiles = function (dt) {
  const ps = this.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.t += dt;
    const t = this.ents.get(p.tid);
    if (t && !t.dead) { p.tx = t.x; p.ty = t.y; }
    const k = Math.min(1, p.t / p.dur);
    p.x = lerp(p.sx, p.tx, k); p.y = lerp(p.sy, p.ty, k);
    if (k >= 1) {
      ps.splice(i, 1);
      const src = this.ents.get(p.srcId) || { owner: p.owner, x: p.sx, y: p.sy, kind: 'unit' };
      if (p.atk.splash) {
        this.fx.push({ type: 'boom', x: p.tx, y: p.ty, t: 0, dur: 0.5 });
        const hits = [];
        this.gridDyn.query(p.tx, p.ty, p.atk.splash + 2, e => {
          if (e.dead || e.owner < 0 || !this.isEnemy(p.owner, e.owner)) return;
          if (this.edgeDist({ x: p.tx, y: p.ty }, e) <= p.atk.splash) hits.push(e);
        });
        for (const e of hits) this.dealDamage(src, e, p.atk);
      } else if (t && !t.dead) {
        // flechas podem errar alvos em movimento
        if (t.kind === 'unit' && t.moving && this.rng() < 0.18) { this.fx.push({ type: 'miss', x: t.x, y: t.y, t: 0, dur: 0.3 }); continue; }
        this.fx.push({ type: 'hit', x: t.x, y: t.y, t: 0, dur: 0.25 });
        this.dealDamage(src, t, p.atk);
      }
    }
  }
};

// ------------------------------------------------------------------ separação
G.separate = function (u) {
  if (u.order && u.order.type === 'build') return;
  let px = 0, py = 0, c = 0;
  const minD = u.radius + 0.22;
  this.gridDyn.query(u.x, u.y, 0.8, e => {
    if (e === u || e.dead || e.kind === 'building') return;
    const dx = u.x - e.x, dy = u.y - e.y;
    const d2 = dx * dx + dy * dy;
    const md = minD + (e.radius || 0.3) - 0.3 + 0.1;
    if (d2 >= md * md) return;
    const d = Math.sqrt(d2) || 0.01;
    const push = (md - d) * 0.35;
    px += (dx / d || (e.id % 2 ? 1 : -1)) * push; py += (dy / d || 0.5) * push; c++;
  });
  if (c) {
    const nx = u.x + px, ny = u.y + py;
    if (this.world.freeAt(nx, ny)) { u.x = nx; u.y = ny; }
    else if (this.world.freeAt(nx, u.y)) u.x = nx;
    else if (this.world.freeAt(u.x, ny)) u.y = ny;
  }
};

// ------------------------------------------------------------------ animais
G.updateAnimal = function (a, dt) {
  a.hitT = Math.max(0, (a.hitT || 0) - dt);
  const w = this.world;
  let vx = 0, vy = 0, sp = 0;
  if (a.fleeT > 0) {
    a.fleeT -= dt;
    const f = a.fleeFrom;
    const dx = a.x - f.x, dy = a.y - f.y, d = Math.hypot(dx, dy) || 1;
    vx = dx / d; vy = dy / d; sp = 1.8;
  } else {
    a.wanderCd -= dt;
    if (a.wanderCd <= 0) { a.wanderCd = 3 + this.rng() * 8; a.walkT = 0.6 + this.rng() * 1.2; a.dir = this.rng() * 6.28; }
    if (a.walkT > 0) { a.walkT -= dt; vx = Math.cos(a.dir); vy = Math.sin(a.dir); sp = 0.5; }
  }
  a.moving = sp > 0;
  if (sp > 0) {
    const nx = a.x + vx * sp * dt, ny = a.y + vy * sp * dt;
    if (w.freeAt(nx, ny)) { a.x = nx; a.y = ny; a.face = Math.atan2(vy, vx); } else a.dir += 2;
  }
};

// ------------------------------------------------------------------ coleta
G.carryCap = function (u, rkey) {
  const p = this.players[u.owner];
  return (rkey === 'hunt' ? 20 : 10) + p.carryBonus;
};
G.gatherRate = function (u, rkey) {
  const p = this.players[u.owner];
  const base = { wood: 0.75, berry: 0.65, farm: 0.55, hunt: 1.15, gold: 0.7, stone: 0.65 }[rkey] || 0.5;
  return base * this.gatherMul(p, rkey);
};

G.dropoffFor = function (u, res) {
  let best = null, bd = 1e9;
  const p = this.players[u.owner];
  for (const b of p.blds) {
    if (b.dead || !b.complete) continue;
    const dr = BUILDINGS[b.type].drop;
    if (!dr || dr.indexOf(res) < 0) continue;
    const d = dist(u.x, u.y, b.x, b.y) - b.w / 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
};

G.farmFree = function (f, u) {
  if (f.dead || !f.complete || f.amount <= 0) return false;
  if (!f.worker || f.worker === u.id) return true;
  const w = this.ent(f.worker);
  return !w || !w.order || w.order.type !== 'gather' || w.order.target !== f.id;
};

G.findResource = function (u, rkey, x, y, radius) {
  let best = null, bd = 1e9;
  const bad = u.bad;
  const consider = e => {
    if (e.dead || (bad && bad.has(e.id) && bad.get(e.id) > this.time)) return;
    const d = dist(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  };
  if (rkey === 'farm') {
    this.gridDyn.query(x, y, radius, e => { if (e.kind === 'building' && e.type === 'farm' && e.owner === u.owner && this.farmFree(e, u)) consider(e); });
  } else if (rkey === 'hunt') {
    this.gridRes.query(x, y, radius, e => { if (e.rkey === 'hunt' && e.amount > 0) consider(e); });
    this.gridDyn.query(x, y, radius, e => { if (e.kind === 'animal') consider(e); });
  } else {
    this.gridRes.query(x, y, radius, e => { if (e.rkey === rkey && e.amount > 0) consider(e); });
  }
  return best;
};

G.doGather = function (u, o, dt) {
  const p = this.players[u.owner];
  if (!u.carry) u.carry = { res: null, n: 0 };
  // ---- entrega
  if (o.stage === 'drop') {
    let drop = this.ent(o.drop);
    if (!drop || !drop.complete) {
      drop = this.dropoffFor(u, u.carry.res);
      if (!drop) { this.nextOrder(u); return; }
      o.drop = drop.id;
    }
    const r = this.approach(u, drop, 0.6, dt);
    if (r === AP_IN) {
      p.res[u.carry.res] += u.carry.n;
      p.stats.gathered[u.carry.res] += u.carry.n;
      u.carry.n = 0;
      o.stage = 'go';
      o.drop = 0;
      u.pathKey = null; u.path = null;
    } else if (r === AP_FAIL) { u.failN = 0; o.drop = 0; this.nextOrder(u); }
    return;
  }
  // ---- ir ao recurso / coletar
  let t = this.ent(o.target);
  const exhausted = !t || (t.kind === 'res' && t.amount <= 0) || (t.type === 'farm' && (t.amount <= 0 || !this.farmFree(t, u)));
  if (exhausted) {
    // animal morto vira carcaça
    let nt = null;
    if (o.rkey && o.rkey !== 'hunt' || !o.rkey) nt = o.rkey ? this.findResource(u, o.rkey, o.lx, o.ly, 10) : null;
    else nt = this.findResource(u, 'hunt', o.lx, o.ly, 10);
    if (!nt && o.rkey === 'hunt') nt = this.findResource(u, 'hunt', u.x, u.y, 12);
    if (!nt) {
      if (u.carry.n > 0.5) { o.stage = 'drop'; return; }
      this.nextOrder(u); return;
    }
    o.target = nt.id; o.lx = nt.x; o.ly = nt.y; t = nt; u.pathKey = null; u.path = null;
  }
  o.rkey = t.rkey || o.rkey;
  const rkey = o.rkey;
  if (t.kind === 'animal') {
    // caça: mata o animal primeiro
    const r = this.approach(u, t, 0.6, dt);
    if (r === AP_IN) {
      u.face = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cool <= 0) { u.cool = 1.2; u.atkT = 0.3; this.dealDamage(u, t, { atk: 5, bonus: {}, pierce: false }); }
    } else if (r === AP_FAIL) this.markBad(u, t);
    return;
  }
  const cap = this.carryCap(u, rkey);
  if (u.carry.n > 0.5 && u.carry.res !== t.res) { o.stage = 'drop'; return; }
  const r = this.approach(u, t, t.type === 'farm' ? 0.75 : 0.6, dt);
  if (r === AP_IN) {
    if (t.type === 'farm') t.worker = u.id;
    u.face = Math.atan2(t.y - u.y, t.x - u.x);
    u.carry.res = t.res;
    const amt = Math.min(this.gatherRate(u, rkey) * dt, t.amount);
    t.amount -= amt; u.carry.n += amt;
    u.working = true; u.workT = (u.workT || 0) + dt;
    if (u.carry.n >= cap) { o.stage = 'drop'; o.lx = t.x; o.ly = t.y; u.path = null; u.pathKey = null; }
    if (t.amount <= 0.01) {
      t.amount = 0;
      if (t.kind === 'res') this.removeRes(t);
      else if (t.type === 'farm') this.farmDepleted(t);
    }
  } else if (r === AP_FAIL) {
    this.markBad(u, t);
  }
};
G.markBad = function (u, t) {
  if (!u.bad) u.bad = new Map();
  u.bad.set(t.id, this.time + 40);
  u.order.target = 0; u.failN = 0; u.path = null; u.pathKey = null;
};

// fazenda esgotada: replanta automaticamente se houver madeira
G.farmDepleted = function (f) {
  const p = this.players[f.owner];
  const cost = this.buildCost(p, 'farm');
  if (this.canAfford(p, cost)) {
    this.pay(p, cost);
    f.amount = this.farmFood(p); f.max = f.amount;
    if (f.owner === this.humanIdx) this.events.push({ text: 'Fazenda replantada', kind: 'info' });
  } else {
    f.worker = 0;
    this.kill(f, null);
  }
};

// ------------------------------------------------------------------ construção
G.doBuild = function (u, o, dt) {
  const b = this.ent(o.target);
  if (!b) { this.nextOrder(u); return; }
  const done = b.complete && b.hp >= b.maxhp - 0.5;
  if (done) { this.finishBuild(u, b); return; }
  const r = this.approach(u, b, 0.6, dt);
  if (r === AP_FAIL) { this.nextOrder(u); return; }
  if (r !== AP_IN) return;
  u.face = Math.atan2(b.y - u.y, b.x - u.x);
  u.working = true;
  const def = BUILDINGS[b.type];
  b.buildersNow++;
  if (!b.complete) {
    const n = Math.max(1, b.builders);
    const inc = dt / def.time * Math.pow(n, -0.3);
    b.progress = Math.min(1, b.progress + inc);
    b.hp = Math.min(b.maxhp, b.hp + inc * b.maxhp * 0.9);
    if (b.progress >= 1) { b.hp = Math.max(b.hp, b.maxhp * 0.1); this.onBuildingComplete(b); }
  } else {
    // reparo: custa metade do valor total proporcional ao PV recuperado
    const p = this.players[u.owner];
    const inc = dt / (def.time * 1.5) * b.maxhp;
    const cost = {};
    for (const rr in def.cost) cost[rr] = def.cost[rr] * 0.5 * inc / b.maxhp;
    if (!this.canAfford(p, cost)) { if (u.owner === this.humanIdx && (!this.lastRepWarn || this.time - this.lastRepWarn > 6)) { this.lastRepWarn = this.time; this.notify(u.owner, 'Sem recursos para reparar', 'warn'); } return; }
    this.pay(p, cost);
    b.hp = Math.min(b.maxhp, b.hp + inc);
  }
};

G.finishBuild = function (u, b) {
  const had = u.orders.length > 0;
  this.nextOrder(u);
  if (had) return;
  // tarefa automática depois de construir
  let t = null, rkey = null;
  const near = (key, r) => this.findResource(u, key, b.x, b.y, r);
  switch (b.type) {
    case 'farm': t = b; rkey = 'farm'; if (!this.farmFree(b, u)) t = near('farm', 8); break;
    case 'lumbercamp': rkey = 'wood'; t = near('wood', 10); break;
    case 'mill': rkey = 'berry'; t = near('berry', 10); if (!t) { rkey = 'farm'; t = near('farm', 10); } break;
    case 'miningcamp': rkey = 'gold'; t = near('gold', 10); if (!t) { rkey = 'stone'; t = near('stone', 10); } break;
    case 'towncenter': rkey = 'wood'; t = near('wood', 12); break;
    default: break;
  }
  if (t) this.setOrder(u, { type: 'gather', target: t.id, rkey: t.rkey || rkey, lx: t.x, ly: t.y, stage: 'go' }, false);
};
