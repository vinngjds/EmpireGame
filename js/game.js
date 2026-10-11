'use strict';
// Núcleo do jogo: estado, jogadores, geração de entidades, economia, produção, visão e vitória

const STEP = 0.05; // passo fixo da simulação (20 Hz)

class Player {
  constructor(idx, o) {
    this.idx = idx;
    this.name = o.name;
    this.civ = o.civ;
    this.team = o.team;
    this.color = PLAYER_COLORS[o.color % PLAYER_COLORS.length].c;
    this.colorName = PLAYER_COLORS[o.color % PLAYER_COLORS.length].name;
    this.isHuman = !!o.human;
    this.aiLevel = o.ai || null;
    this.ai = null;
    this.res = { food: 0, wood: 0, gold: 0, stone: 0 };
    this.age = 0;
    this.techs = new Set();
    this.inProgress = new Set();
    this.effects = [];
    this.gm = {};            // multiplicadores de coleta
    this.carryBonus = 0;
    this.pop = 0; this.popCap = 0;
    this.units = []; this.blds = [];
    this.eliminated = false;
    this.start = { x: 0, y: 0 };
    this.stats = { kills: 0, lost: 0, built: 0, trained: 0, gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, techs: 0 };
  }
}

class Game {
  constructor(st) {
    this.st = st;
    this.time = 0; this.tickN = 0;
    this.seed = st.seed || ((Math.random() * 1e9) | 0);
    this.rng = mulberry32(this.seed);
    this.nextId = 1;
    this.ents = new Map();
    this.units = []; this.buildings = []; this.animals = []; this.projectiles = []; this.fx = [];
    this.events = [];
    this.over = null;
    this.mode = st.mode || 'conquest';
    this.humanIdx = st.players.findIndex(p => p.human);
    this.speedMul = 1;
    this.pathBudget = 0;
    this.dirty = false;

    const n = MAP_SIZES[st.mapSize || 'small'].n;
    this.n = n;
    const slots = st.players;
    const starts = startPositions(n, slots);
    this.world = generateTerrain(n, st.mapType || 'arabia', this.seed, starts);
    this.gridDyn = new Grid(n, 4);
    this.gridRes = new Grid(n, 4);
    this.expl = new Uint8Array(n * n);
    this.vis = new Uint8Array(n * n);
    this.visRev = 0;

    this.players = slots.map((o, i) => new Player(i, o));
    this.market = this.players.map(() => ({ food: 100, wood: 100, stone: 100 }));
    const base = (START_RES[st.startRes || 'standard'] || START_RES.standard).res;
    for (const p of this.players) {
      p.start = starts[p.idx];
      Object.assign(p.res, base);
      if (this.mode === 'deathmatch') p.res = { food: 20000, wood: 20000, gold: 20000, stone: 20000 };
      const civ = CIVS[p.civ];
      if (civ && civ.start && civ.start.res) for (const r in civ.start.res) p.res[r] = Math.max(0, p.res[r] + civ.start.res[r]);
      if (civ) this.addEffects(p, civ.effects || []);
    }
    this.populate(starts);
    for (const p of this.players) {
      if (p.aiLevel) {
        const lv = AI_LEVELS[p.aiLevel];
        this.addEffects(p, RESOURCES.concat(['berry', 'hunt', 'farm']).map(k => ({ t: 'gather', k, mul: lv.gatherMul })));
        p.ai = new AIPlayer(this, p, p.aiLevel);
      }
      this.recalcPop(p);
    }
    const startAge = st.startAge || (this.mode === 'deathmatch' ? 0 : 0);
    for (let a = 1; a <= startAge; a++) for (const p of this.players) this.setAge(p, a);
    this.updateVision(true);
    if (st.revealMap) this.expl.fill(1);
    this.humanTeam = this.humanIdx >= 0 ? this.players[this.humanIdx].team : -1;
    this.updateVision(true);
  }

  get human() { return this.players[this.humanIdx]; }
  ent(id) { const e = this.ents.get(id); return e && !e.dead ? e : null; }
  notify(pidx, text, kind, x, y) {
    if (pidx === this.humanIdx || (this.humanIdx >= 0 && this.players[pidx] && this.players[this.humanIdx] && pidx === this.humanIdx)) this.events.push({ text, kind: kind || 'info', x, y });
  }
  isAlly(a, b) { return a >= 0 && b >= 0 && this.players[a].team === this.players[b].team; }
  isEnemy(a, b) { return a >= 0 && b >= 0 && this.players[a].team !== this.players[b].team; }

  // ----------------------------------------------------------------- efeitos
  addEffects(p, list) {
    for (const e of list) p.effects.push(e);
    this.refreshPlayer(p);
  }
  refreshPlayer(p) {
    p.gm = {}; p.carryBonus = 0;
    for (const e of p.effects) {
      if ((e.minAge || 0) > p.age) continue;
      if (e.t === 'gather') p.gm[e.k] = (p.gm[e.k] || 1) * e.mul;
      if (e.t === 'carry') p.carryBonus += e.add;
    }
    for (const u of p.units) if (!u.dead) this.computeStats(u);
    for (const b of p.blds) if (!b.dead) this.computeBStats(b);
  }
  gatherMul(p, k) { return p.gm[k] || 1; }

  // Atributos finais de uma unidade (base + melhorias + efeitos)
  computeStats(u) {
    const p = this.players[u.owner];
    const def = UNITS[u.type];
    const s = { hp: def.hp, atk: def.atk, armorM: def.armor[0], armorP: def.armor[1], range: def.range, speed: def.speed, los: def.los, reload: def.reload, bonus: Object.assign({}, def.bonus), name: def.name, proj: def.proj, splash: def.splash, tier: 0 };
    if (def.tiers) {
      for (let i = 0; i < def.tiers.length; i++) {
        const tr = def.tiers[i];
        if (!p.techs.has(tr.tech)) continue;
        s.tier = i + 1; s.name = tr.name;
        if (tr.hp !== undefined) s.hp = tr.hp;
        if (tr.atk !== undefined) s.atk = tr.atk;
        if (tr.range !== undefined) s.range = tr.range;
        if (tr.armor) { s.armorM = tr.armor[0]; s.armorP = tr.armor[1]; }
        if (tr.bonus) Object.assign(s.bonus, tr.bonus);
      }
    }
    const cl = def.cls;
    const adds = {}, muls = {};
    for (const e of p.effects) {
      if ((e.minAge || 0) > p.age) continue;
      if (e.t !== 'cls') continue;
      if (e.cls !== 'all' && e.cls !== def.id && cl.indexOf(e.cls) < 0) continue;
      if (e.add) adds[e.stat] = (adds[e.stat] || 0) + e.add;
      if (e.mul) muls[e.stat] = (muls[e.stat] || 1) * e.mul;
    }
    for (const k of ['hp', 'atk', 'armorM', 'armorP', 'range', 'speed', 'los', 'reload']) {
      s[k] = (s[k] + (adds[k] || 0)) * (muls[k] || 1);
    }
    s.range = def.range > 0 ? Math.round(s.range) : 0;
    const oldMax = u.maxhp || 0;
    u.s = s; u.maxhp = Math.round(s.hp);
    if (u.hp === undefined) u.hp = u.maxhp; else if (u.maxhp > oldMax) u.hp += u.maxhp - oldMax; else u.hp = Math.min(u.hp, u.maxhp);
    u.radius = def.scale ? 0.45 : 0.3;
  }
  computeBStats(b) {
    const p = this.players[b.owner];
    const def = BUILDINGS[b.type];
    let hpm = 1, ar = 0, atkAdd = 0, los = 0;
    for (const e of p.effects) {
      if ((e.minAge || 0) > p.age) continue;
      if (e.t === 'bhp') hpm *= e.mul;
      if (e.t === 'barmor') ar += e.add;
      if (e.t === 'bldatk') atkAdd += e.add;
      if (e.t === 'bldlos') los += e.add;
    }
    const oldMax = b.maxhp || 0;
    b.maxhp = Math.round(def.hp * hpm);
    if (b.hp === undefined) b.hp = b.maxhp; else if (oldMax) b.hp = b.hp * (b.maxhp / oldMax);
    b.s = { armorM: def.armor[0] + ar, armorP: def.armor[1] + ar, los: def.los + los, atk: def.atk ? def.atk.dmg + atkAdd : 0, range: def.atk ? def.atk.range : 0, reload: def.atk ? def.atk.reload : 0, bonus: {}, proj: def.atk && def.atk.proj };
  }

  // ----------------------------------------------------------------- custos
  unitCost(p, id) {
    const def = UNITS[id];
    const c = Object.assign({}, def.cost);
    for (const e of p.effects) {
      if (e.t !== 'cost' || (e.minAge || 0) > p.age) continue;
      if (def.cls.indexOf(e.cls) < 0 && e.cls !== def.id) continue;
      for (const r in c) if (!e.res || e.res === r) c[r] = Math.round(c[r] * e.mul);
    }
    return c;
  }
  buildCost(p, id) {
    const c = Object.assign({}, BUILDINGS[id].cost);
    for (const e of p.effects) {
      if (e.t !== 'bcost' || (e.minAge || 0) > p.age) continue;
      if (e.id !== id && e.id !== 'all') continue;
      for (const r in c) c[r] = Math.round(c[r] * e.mul);
    }
    return c;
  }
  techCost(p, id) {
    const t = TECHS[id];
    const c = Object.assign({}, t.cost);
    for (const e of p.effects) {
      if (e.t !== 'tcost' || e.bld !== t.bld) continue;
      for (const r in c) c[r] = Math.round(c[r] * e.mul);
    }
    return c;
  }
  prodTime(p, bld, base) {
    let m = 1;
    for (const e of p.effects) if (e.t === 'time' && e.bld === bld && (e.minAge || 0) <= p.age) m *= e.mul;
    return base * m;
  }
  canAfford(p, c) { for (const r in c) if (p.res[r] + 1e-6 < c[r]) return false; return true; }
  pay(p, c) { for (const r in c) p.res[r] -= c[r]; }
  refund(p, c) { for (const r in c) p.res[r] += c[r]; }

  // ------------------------------------------------------------ criação
  _reg(e) { e.id = this.nextId++; e.dead = false; this.ents.set(e.id, e); return e; }

  addRes(type, tx, ty, amount) {
    const w = this.world;
    if (!w.inb(tx, ty) || w.occ[w.idx(tx, ty)] || w.blk[w.idx(tx, ty)]) return null;
    const map = { tree: ['wood', 'wood'], gold: ['gold', 'gold'], stone: ['stone', 'stone'], berry: ['food', 'berry'], carcass: ['food', 'hunt'] };
    const m = map[type];
    const e = this._reg({ kind: 'res', type, res: m[0], rkey: m[1], x: tx + 0.5, y: ty + 0.5, tx, ty, w: 1, h: 1, amount, max: amount, owner: -1, v: Math.floor(hash2(tx, ty, 5) * 4) });
    if (type !== 'carcass') { w.occ[w.idx(tx, ty)] = e.id; w.blk[w.idx(tx, ty)] = 1; }
    this.gridRes.add(e);
    return e;
  }
  addAnimal(type, x, y) {
    const e = this._reg({ kind: 'animal', type, x, y, px: x, py: y, hp: 8, maxhp: 8, food: 140, owner: -1, radius: 0.3, wanderCd: 2 + this.rng() * 6, fleeT: 0, dir: this.rng() * 6.28, order: null });
    this.animals.push(e);
    return e;
  }
  addUnit(type, owner, x, y) {
    const def = UNITS[type];
    const p = this.players[owner];
    const u = this._reg({ kind: 'unit', type, owner, x, y, px: x, py: y, order: null, orders: [], path: null, pi: 0, pathKey: null, cool: 0, face: 0.8, anim: this.rng() * 10, carry: null, scan: this.rng() * 0.5, repathCd: 0, failN: 0, hitT: 0, atkT: 0, radius: 0.3, moving: false, bad: null });
    this.computeStats(u);
    this.units.push(u); p.units.push(u); p.pop++;
    return u;
  }
  canPlace(p, type, tx, ty, ignoreFog) {
    const def = BUILDINGS[type], w = this.world, sz = def.size;
    if (tx < 1 || ty < 1 || tx + sz > this.n - 1 || ty + sz > this.n - 1) return false;
    const human = p.isHuman && this.st.fog !== false && !ignoreFog;
    for (let y = ty; y < ty + sz; y++) for (let x = tx; x < tx + sz; x++) {
      const i = w.idx(x, y);
      if (w.occ[i] || w.blk[i] || w.terrain[i] === T_WATER) return false;
      if (human && !this.expl[i]) return false;
    }
    return true;
  }
  addBuilding(type, owner, tx, ty, complete) {
    const def = BUILDINGS[type];
    const sz = def.size;
    const b = this._reg({ kind: 'building', type, owner, tx, ty, w: sz, h: sz, x: tx + sz / 2, y: ty + sz / 2, rx0: tx, rx1: tx + sz - 0.01, ry0: ty, ry1: ty + sz - 0.01,
      progress: complete ? 1 : 0, complete: !!complete, queue: [], rally: null, cool: 0, builders: 0, buildersNow: 0, hitT: 0, variant: Math.floor(hash2(tx, ty, 9) * 3) });
    this.computeBStats(b);
    if (!complete) b.hp = Math.max(1, b.maxhp * 0.1);
    if (type === 'farm') { b.amount = this.farmFood(this.players[owner]); b.max = b.amount; b.rkey = 'farm'; b.res = 'food'; b.worker = 0; }
    const w = this.world;
    for (let y = ty; y < ty + sz; y++) for (let x = tx; x < tx + sz; x++) {
      w.occ[w.idx(x, y)] = b.id;
      if (!def.passable) w.blk[w.idx(x, y)] = 1;
    }
    this.buildings.push(b);
    const p = this.players[owner];
    p.blds.push(b);
    this.evictUnits(b);
    if (complete) this.onBuildingComplete(b, true);
    return b;
  }
  farmFood(p) { return 175 + (p.techs.has('horsecollar') ? 0 : 0) + 75; }
  evictUnits(b) {
    const list = [];
    this.gridDyn.query(b.x, b.y, b.w, e => { if (e.kind === 'unit' || e.kind === 'animal') list.push(e); });
    for (const u of list) {
      if (u.x >= b.tx - 0.2 && u.x <= b.tx + b.w + 0.2 && u.y >= b.ty - 0.2 && u.y <= b.ty + b.h + 0.2 && !BUILDINGS[b.type].passable) {
        const sp = this.spawnPoint(b, u.x, u.y);
        u.x = sp.x; u.y = sp.y; u.px = u.x; u.py = u.y; u.path = null;
      }
    }
  }
  onBuildingComplete(b, silent) {
    const p = this.players[b.owner];
    b.complete = true; b.progress = 1; b.hp = b.hp >= b.maxhp * 0.9 ? b.maxhp : Math.min(b.hp, b.maxhp);
    this.recalcPop(p);
    p.stats.built++;
    if (!silent) {
      this.events.push({ type: 'sfx', sfx: 'build', owner: b.owner });
      if (b.owner === this.humanIdx) this.notify(b.owner, BUILDINGS[b.type].name + ' concluído', 'info', b.x, b.y);
    }
  }
  recalcPop(p) {
    let cap = 0;
    for (const b of p.blds) if (!b.dead && b.complete) cap += BUILDINGS[b.type].pop || 0;
    p.popCap = Math.min(200, cap);
  }

  // ponto livre ao redor de um edifício, o mais próximo de (tx,ty)
  spawnPoint(b, tx, ty) {
    const w = this.world, sz = b.w;
    let best = null, bd = 1e9;
    for (let i = -1; i <= sz; i++) {
      const cand = [[b.tx + i, b.ty - 1], [b.tx + i, b.ty + sz], [b.tx - 1, b.ty + i], [b.tx + sz, b.ty + i]];
      for (const c of cand) {
        if (!w.free(c[0], c[1])) continue;
        const d = Math.hypot(c[0] + 0.5 - tx, c[1] + 0.5 - ty);
        if (d < bd) { bd = d; best = { x: c[0] + 0.5, y: c[1] + 0.5 }; }
      }
    }
    return best || w.nearestFree(b.x, b.y, 10);
  }

  // ------------------------------------------------------------- população do mapa
  populate(starts) {
    const w = this.world, n = this.n, rng = this.rng;
    const mt = MAP_TYPES[this.st.mapType || 'arabia'] || MAP_TYPES.arabia;
    const near = (x, y, r) => starts.some(s => dist(s.x, s.y, x, y) < r);

    // florestas (blobs) ----------------------------------------------------
    const target = Math.floor(n * n * mt.forest);
    let placed = 0, guard = 0;
    while (placed < target && guard++ < 4000) {
      const cx = Math.floor(rng() * n), cy = Math.floor(rng() * n);
      if (near(cx, cy, 13)) continue;
      const size = 14 + Math.floor(rng() * 40) + (mt.forest > 0.2 ? 60 : 0);
      let x = cx, y = cy;
      for (let k = 0; k < size; k++) {
        if (!near(x, y, 11) && this.addRes('tree', x, y, 100)) placed++;
        x += Math.floor(rng() * 3) - 1; y += Math.floor(rng() * 3) - 1;
        x = clamp(x, 1, n - 2); y = clamp(y, 1, n - 2);
      }
    }
    // agrupamentos de recursos neutros
    const cluster = (type, amt, cnt, minD, spread, arrangeN) => {
      for (let k = 0; k < cnt; k++) {
        let cx, cy, tries = 0;
        do { cx = 4 + Math.floor(rng() * (n - 8)); cy = 4 + Math.floor(rng() * (n - 8)); tries++; } while ((near(cx, cy, minD) || w.occ[w.idx(cx, cy)] || w.blk[w.idx(cx, cy)]) && tries < 60);
        if (tries >= 60) continue;
        const m = arrangeN + Math.floor(rng() * 3);
        for (let j = 0; j < m; j++) this.addRes(type, cx + Math.floor((rng() - 0.5) * spread), cy + Math.floor((rng() - 0.5) * spread), amt);
      }
    };
    const scale = (n * n) / (64 * 64);
    cluster('gold', 800, Math.round(3 * scale) + 1, 12, 3.2, 4);
    cluster('stone', 350, Math.round(3 * scale) + 1, 12, 3.2, 4);
    cluster('berry', 200, Math.round(2 * scale) + 1, 10, 3, 5);
    for (let k = 0; k < Math.round(7 * scale); k++) {
      let x = 3 + rng() * (n - 6), y = 3 + rng() * (n - 6);
      if (near(x, y, 9)) continue;
      const m = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < m; j++) { const ax = x + (rng() - 0.5) * 3, ay = y + (rng() - 0.5) * 3; if (w.freeAt(ax, ay)) this.addAnimal('deer', ax, ay); }
    }

    // recursos iniciais de cada jogador ---------------------------------------
    for (const p of this.players) {
      const s = p.start;
      // limpa área
      for (const e of Array.from(this.ents.values())) {
        if (e.kind === 'res' && dist(e.x, e.y, s.x, s.y) < 8) this.removeRes(e);
      }
      const tcx = s.x - 2, tcy = s.y - 2;
      for (let y = tcy; y < tcy + 4; y++) for (let x = tcx; x < tcx + 4; x++) { const i = w.idx(x, y); if (w.terrain[i] === T_WATER) { w.terrain[i] = T_GRASS; w.blk[i] = 0; w.color[i] = 'hsl(100,45%,36%)'; } }
      // limpa água no entorno imediato
      for (let y = s.y - 9; y <= s.y + 9; y++) for (let x = s.x - 9; x <= s.x + 9; x++) { if (!w.inb(x, y)) continue; const i = w.idx(x, y); if (w.terrain[i] === T_WATER && dist(x, y, s.x, s.y) < 9) { w.terrain[i] = T_GRASS; w.blk[i] = 0; w.color[i] = 'hsl(100,45%,36%)'; } }
      const tc = this.addBuilding('towncenter', p.idx, tcx, tcy, true);
      tc.hp = tc.maxhp;
      const rnd = (a, b) => a + rng() * (b - a);
      const baseAng = Math.atan2(n / 2 - s.y, n / 2 - s.x);
      const put = (type, amt, ang, d, cnt, spread) => {
        const cx = s.x + Math.cos(ang) * d, cy = s.y + Math.sin(ang) * d;
        let k = 0, tries = 0;
        while (k < cnt && tries++ < 80) {
          const x = Math.round(cx + (rng() - 0.5) * spread), y = Math.round(cy + (rng() - 0.5) * spread);
          if (Math.abs(x - s.x) < 4 && Math.abs(y - s.y) < 4) continue;
          if (this.addRes(type, x, y, amt)) k++;
        }
      };
      // direções distintas para cada recurso (embaralhadas por jogador)
      const angs = [0, 1, 2, 3, 4, 5].map(i => i * 1.047 + rnd(-0.2, 0.2) + baseAng + 0.5);
      // sorteia
      for (let i = angs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [angs[i], angs[j]] = [angs[j], angs[i]]; }
      put('berry', 200, angs[0], 7.5, 6, 3.2);
      put('tree', 100, angs[1], 8.5, 10, 4.5);
      put('tree', 100, angs[2], 13, 28, 8);
      put('gold', 800, angs[3], 10, 5, 3.4);
      put('stone', 350, angs[4], 10, 4, 3.2);
      for (let i = 0; i < 5; i++) { const ax = s.x + Math.cos(angs[5]) * 13 + rnd(-2, 2), ay = s.y + Math.sin(angs[5]) * 13 + rnd(-2, 2); if (w.freeAt(ax, ay)) this.addAnimal('deer', ax, ay); }
      // unidades iniciais
      const civ = CIVS[p.civ];
      const nv = 3 + ((civ && civ.start && civ.start.villagers) || 0);
      for (let i = 0; i < nv; i++) {
        const sp = this.spawnPoint(tc, s.x + (i - nv / 2) * 1.2, s.y + 4);
        const v = this.addUnit('villager', p.idx, sp.x + (rng() - 0.5) * 0.6, sp.y + (rng() - 0.5) * 0.6);
        v.face = 1;
      }
      const sp = this.spawnPoint(tc, s.x, s.y + 4);
      if (this.mode !== 'deathmatch' || true) {
        if (this.mode === 'regicide') this.addUnit('king', p.idx, sp.x + 1, sp.y + 0.5);
        else this.addUnit('scout', p.idx, sp.x + 1, sp.y + 0.5);
      }
    }
  }

  removeRes(e) {
    if (e.dead) return;
    e.dead = true;
    const w = this.world;
    if (e.type !== 'carcass') { const i = w.idx(e.tx, e.ty); if (w.occ[i] === e.id) { w.occ[i] = 0; w.blk[i] = 0; } }
    this.gridRes.remove(e);
    this.ents.delete(e.id);
  }

  // ------------------------------------------------------------- produção
  queueUnit(b, id) {
    const p = this.players[b.owner], def = UNITS[id];
    if (!b.complete || b.queue.length >= 6) return false;
    if (def.age > p.age) return false;
    const ok = def.bld === b.type || (b.type === 'castle' && CIVS[p.civ].unique === id);
    if (!ok) return false;
    const cost = this.unitCost(p, id);
    if (!this.canAfford(p, cost)) { if (b.owner === this.humanIdx) this.notify(b.owner, 'Recursos insuficientes', 'warn'); return false; }
    this.pay(p, cost);
    const t = this.prodTime(p, b.type, def.time);
    b.queue.push({ k: 'unit', id, t, total: t, cost });
    return true;
  }
  techAvailable(p, id) {
    const t = TECHS[id];
    if (p.techs.has(id) || p.inProgress.has(id)) return false;
    if (t.ageUp) { if (p.age !== t.ageUp - 1) return false; for (const q of p.inProgress) if (TECHS[q].ageUp) return false; return true; }
    if (p.age < t.age) return false;
    if (t.req) for (const r of t.req) if (!p.techs.has(r)) return false;
    return true;
  }
  ageReqMet(p, ageIdx) {
    const rq = AGE_REQ[ageIdx];
    const have = new Set();
    for (const b of p.blds) if (!b.dead && b.complete) have.add(b.type);
    let c = 0;
    for (const t of rq.from) if (have.has(t)) c++;
    return c >= rq.n;
  }
  queueTech(b, id) {
    const p = this.players[b.owner], t = TECHS[id];
    if (!b.complete || b.queue.length >= 6 || t.bld !== b.type || !this.techAvailable(p, id)) return false;
    if (t.ageUp && !this.ageReqMet(p, t.ageUp)) { if (b.owner === this.humanIdx) this.notify(b.owner, 'Requisitos de construção não atendidos', 'warn'); return false; }
    const cost = this.techCost(p, id);
    if (!this.canAfford(p, cost)) { if (b.owner === this.humanIdx) this.notify(b.owner, 'Recursos insuficientes', 'warn'); return false; }
    this.pay(p, cost);
    p.inProgress.add(id);
    b.queue.push({ k: 'tech', id, t: t.time, total: t.time, cost });
    return true;
  }
  cancelQueue(b, i) {
    const it = b.queue[i];
    if (!it) return;
    const p = this.players[b.owner];
    this.refund(p, it.cost);
    if (it.k === 'tech') p.inProgress.delete(it.id);
    b.queue.splice(i, 1);
  }
  setAge(p, a) {
    p.age = a;
    this.refreshPlayer(p);
  }
  completeTech(p, id) {
    const t = TECHS[id];
    p.inProgress.delete(id);
    p.techs.add(id);
    p.stats.techs++;
    if (t.ageUp) {
      this.setAge(p, t.ageUp);
      this.events.push({ type: 'sfx', sfx: 'age', owner: p.idx });
      for (const q of this.players) if (this.humanIdx >= 0 && (q === p || this.isAlly(p.idx, this.humanIdx) || true)) { /* anúncio global */ }
      this.events.push({ text: p.name + ' avançou para a ' + AGES[t.ageUp].name + '!', kind: p.idx === this.humanIdx ? 'good' : 'info' });
    } else if (t.effects && t.effects.length) {
      this.addEffects(p, t.effects);
    } else {
      this.refreshPlayer(p);
    }
    if (p.idx === this.humanIdx && !t.ageUp) this.events.push({ text: 'Pesquisa concluída: ' + t.name, kind: 'info' });
  }

  updateBuilding(b, dt) {
    b.hitT = Math.max(0, b.hitT - dt);
    b.builders = b.buildersNow; b.buildersNow = 0;
    if (!b.complete) return;
    const p = this.players[b.owner];
    // fila de produção
    if (b.queue.length) {
      const it = b.queue[0];
      it.t -= dt;
      if (it.t <= 0) {
        if (it.k === 'tech') {
          this.completeTech(p, it.id);
          b.queue.shift();
        } else {
          if (p.pop >= p.popCap) {
            it.t = 0;
            if (!b.popWarn || this.time - b.popWarn > 15) { b.popWarn = this.time; if (b.owner === this.humanIdx) this.notify(b.owner, 'Limite de população atingido: construa casas!', 'warn'); }
          } else {
            b.queue.shift();
            this.spawnTrained(b, it.id);
          }
        }
      }
    }
    // ataque de torres/castelo/centro
    if (b.s.atk > 0) {
      b.cool -= dt;
      if (b.cool <= 0) {
        let best = null, bd = 1e9;
        const r = b.s.range + b.w / 2;
        this.gridDyn.query(b.x, b.y, r + 1, e => {
          if (e.dead || e.kind !== 'unit' || !this.isEnemy(b.owner, e.owner)) return;
          const d = dist(b.x, b.y, e.x, e.y);
          if (d <= r && d < bd) { bd = d; best = e; }
        });
        if (best) {
          b.cool = b.s.reload;
          this.fireProjectile(b, best, { atk: b.s.atk, bonus: {}, pierce: true, proj: 'arrow' });
        } else b.cool = 0.4;
      }
    }
  }

  spawnTrained(b, id) {
    const p = this.players[b.owner];
    const rl = b.rally;
    const tx = rl ? rl.x : b.x, ty = rl ? rl.y : b.y + b.h;
    const sp = this.spawnPoint(b, tx, ty);
    const u = this.addUnit(id, b.owner, sp.x, sp.y);
    p.stats.trained++;
    if (rl) {
      const tg = rl.target ? this.ent(rl.target) : null;
      if (tg && u.type === 'villager' && (tg.kind === 'res' || tg.kind === 'animal' || (tg.type === 'farm' && tg.owner === u.owner))) this.cmdGather([u], tg, false);
      else if (tg && tg.kind === 'building' && tg.owner === u.owner && u.type === 'villager' && (!tg.complete || tg.hp < tg.maxhp)) this.cmdBuildOn([u], tg, false);
      else this.cmdMove([u], rl.x, rl.y, false);
    }
    if (b.owner === this.humanIdx) this.events.push({ type: 'sfx', sfx: 'train', owner: b.owner });
  }

  // ----------------------------------------------------------------- mercado
  marketTrade(p, res, sell) {
    const m = this.market[p.idx];
    if (res === 'gold') return false;
    const pr = m[res];
    if (sell) {
      if (p.res[res] < 100) return false;
      p.res[res] -= 100; p.res.gold += Math.floor(pr * 0.7);
      m[res] = Math.max(20, m[res] - 3);
    } else {
      const cost = Math.ceil(pr * 1.3);
      if (p.res.gold < cost) return false;
      p.res.gold -= cost; p.res[res] += 100;
      m[res] = Math.min(300, m[res] + 3);
    }
    return true;
  }

  // ----------------------------------------------------------------- visão
  updateVision(force) {
    if (this.humanIdx < 0) { this.vis.fill(1); this.expl.fill(1); return; }
    const n = this.n;
    const vis = this.vis, expl = this.expl;
    if (this.st.fog === false || (this.over && this.over.reveal)) { vis.fill(1); expl.fill(1); return; }
    vis.fill(0);
    const team = this.players[this.humanIdx].team;
    const stamp = (x, y, r) => {
      const cx = Math.floor(x), cy = Math.floor(y), ri = Math.ceil(r), r2 = r * r;
      for (let dy = -ri; dy <= ri; dy++) {
        const yy = cy + dy; if (yy < 0 || yy >= n) continue;
        for (let dx = -ri; dx <= ri; dx++) {
          const xx = cx + dx; if (xx < 0 || xx >= n) continue;
          if (dx * dx + dy * dy <= r2) { const i = yy * n + xx; vis[i] = 1; expl[i] = 1; }
        }
      }
    };
    for (const p of this.players) {
      if (p.team !== team) continue;
      for (const u of p.units) if (!u.dead) stamp(u.x, u.y, u.s.los);
      for (const b of p.blds) if (!b.dead) stamp(b.x, b.y, b.s.los + b.w / 2);
    }
  }
  canSee(e) {
    if (this.humanIdx < 0) return true;
    if (e.owner >= 0 && this.isAlly(e.owner, this.humanIdx)) return true;
    const w = this.world;
    if (e.kind === 'building' || e.kind === 'res') {
      // construções e recursos permanecem visíveis uma vez explorados
      return this.expl[w.idx(clamp(Math.floor(e.x), 0, this.n - 1), clamp(Math.floor(e.y), 0, this.n - 1))] === 1;
    }
    return this.vis[w.idx(clamp(Math.floor(e.x), 0, this.n - 1), clamp(Math.floor(e.y), 0, this.n - 1))] === 1;
  }

  // ----------------------------------------------------------------- morte
  kill(e, killer) {
    if (e.dead) return;
    e.dead = true; this.dirty = true;
    const w = this.world;
    if (killer && killer.owner >= 0 && e.owner >= 0) this.players[killer.owner].stats.kills++;
    if (e.kind === 'unit') {
      const p = this.players[e.owner];
      p.pop--; p.stats.lost++;
      this.fx.push({ type: 'corpse', x: e.x, y: e.y, t: 0, dur: 8, color: p.color, cls: e.type });
      if (e.owner === this.humanIdx) this.events.push({ type: 'sfx', sfx: 'die', owner: e.owner });
    } else if (e.kind === 'building') {
      const sz = e.w;
      for (let y = e.ty; y < e.ty + sz; y++) for (let x = e.tx; x < e.tx + sz; x++) { const i = w.idx(x, y); if (w.occ[i] === e.id) { w.occ[i] = 0; w.blk[i] = 0; } }
      for (const q of e.queue) { if (q.k === 'tech') this.players[e.owner].inProgress.delete(q.id); }
      this.recalcPop(this.players[e.owner]);
      this.players[e.owner].stats.lost++;
      this.fx.push({ type: 'ruin', x: e.x, y: e.y, t: 0, dur: 14, size: sz });
      for (let i = 0; i < 6 + sz * 3; i++) this.fx.push({ type: 'debris', x: e.x + (this.rng() - 0.5) * sz, y: e.y + (this.rng() - 0.5) * sz, t: 0, dur: 1 + this.rng(), vx: (this.rng() - 0.5) * 2, vy: (this.rng() - 0.5) * 2, vz: 40 + this.rng() * 60 });
      this.events.push({ type: 'sfx', sfx: 'boom', x: e.x, y: e.y });
      if (e.owner === this.humanIdx) this.notify(e.owner, BUILDINGS[e.type].name + ' destruído!', 'bad', e.x, e.y);
    } else if (e.kind === 'animal') {
      const tx = Math.floor(e.x), ty = Math.floor(e.y);
      const c = this.addRes('carcass', tx, ty, e.food);
      if (!c) { /* tile ocupado: coloca carcaça deslocada */ }
    }
    this.ents.delete(e.id);
  }

  eliminate(p, reason) {
    if (p.eliminated) return;
    p.eliminated = true;
    this.events.push({ text: p.name + ' foi derrotado' + (reason ? ' (' + reason + ')' : '') + '!', kind: p.idx === this.humanIdx ? 'bad' : 'good' });
    for (const u of p.units.slice()) this.kill(u, null);
    for (const b of p.blds.slice()) this.kill(b, null);
    if (p.ai) p.ai = null;
  }

  checkVictory() {
    if (this.over) return;
    for (const p of this.players) {
      if (p.eliminated) continue;
      let blds = 0, vils = 0, mil = 0, king = false;
      for (const b of p.blds) if (!b.dead) blds++;
      for (const u of p.units) if (!u.dead) { if (u.type === 'villager') vils++; else if (u.type === 'king') king = true; else mil++; }
      if (this.mode === 'regicide') {
        if (this.time > 5 && !king) this.eliminate(p, 'rei caiu');
        continue;
      }
      if (blds === 0 && vils === 0) this.eliminate(p, 'sem edifícios nem aldeões');
      else if (blds === 0 && vils + mil === 0) this.eliminate(p);
    }
    const alive = this.players.filter(p => !p.eliminated);
    const teams = new Set(alive.map(p => p.team));
    const h = this.human;
    if (h && h.eliminated) {
      this.over = { win: false, time: this.time };
    } else if (teams.size <= 1) {
      const winTeam = alive.length ? alive[0].team : -1;
      this.over = { win: h ? h.team === winTeam : true, time: this.time, winTeam };
    }
    if (this.over) this.events.push({ type: 'over', over: this.over });
  }

  // ----------------------------------------------------------------- tick
  update(dt) {
    this.time += dt; this.tickN++;
    this.pathBudget = 16;
    this.gridDyn.clear();
    for (const u of this.units) { u.px = u.x; u.py = u.y; this.gridDyn.add(u); }
    for (const a of this.animals) { a.px = a.x; a.py = a.y; this.gridDyn.add(a); }
    for (const b of this.buildings) this.gridDyn.add(b);

    for (const b of this.buildings) if (!b.dead) this.updateBuilding(b, dt);
    const un = this.units, L = un.length, off = this.tickN % Math.max(1, L);
    for (let i = 0; i < L; i++) { const u = un[(i + off) % L]; if (!u.dead) this.updateUnit(u, dt); }
    for (const u of un) if (!u.dead) this.separate(u);
    for (const a of this.animals) if (!a.dead) this.updateAnimal(a, dt);
    this.updateProjectiles(dt);
    for (const f of this.fx) { f.t += dt; if (f.type === 'debris') { f.x += f.vx * dt; f.y += f.vy * dt; f.vz -= 140 * dt; f.z = (f.z || 0) + f.vz * dt; if (f.z < 0) { f.z = 0; f.vz = 0; f.vx = f.vy = 0; } } }
    if (this.fx.length) this.fx = this.fx.filter(f => f.t < f.dur);

    for (const p of this.players) if (p.ai) p.ai.update(dt);

    if (this.tickN % 4 === 0) this.updateVision();
    if (this.tickN % 20 === 0) this.checkVictory();

    if (this.dirty) {
      this.dirty = false;
      this.units = this.units.filter(e => !e.dead);
      this.buildings = this.buildings.filter(e => !e.dead);
      this.animals = this.animals.filter(e => !e.dead);
      for (const p of this.players) { p.units = p.units.filter(e => !e.dead); p.blds = p.blds.filter(e => !e.dead); }
    }
  }
}
