'use strict';
// IA do computador: economia, construção, pesquisa, treino e ataques

const RKEY_RES = { wood: 'wood', berry: 'food', hunt: 'food', farm: 'food', gold: 'gold', stone: 'stone' };

class AIPlayer {
  constructor(game, p, level) {
    this.g = game; this.p = p; this.level = level; this.lv = AI_LEVELS[level];
    this.t = Math.random() * 1.5;
    this.phase = 'build';
    this.waveSize = this.lv.wave;
    this.wave = 0;
    this.waveStart = 0;
    this.launched = 0;
    this.target = null;
    this.houseAng = Math.random() * 6.28;
    this.lastAgeTry = 0;
    this.planned = {};
    this.tcRebuild = 0;
    this.lastCmd = 0;
  }
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = this.lv.think * (0.8 + Math.random() * 0.4);
    if (this.p.eliminated) return;
    this.think();
  }

  // ------------------------------------------------------------------ análise
  scan() {
    const g = this.g, p = this.p;
    this.vils = []; this.mil = []; this.idle = []; this.builders = [];
    this.cnt = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const u of p.units) {
      if (u.dead) continue;
      if (u.type === 'villager') {
        this.vils.push(u);
        const o = u.order;
        if (!o) this.idle.push(u);
        else if (o.type === 'build') this.builders.push(u);
        else if (o.type === 'gather' && o.rkey) this.cnt[RKEY_RES[o.rkey]]++;
        else if (o.type === 'gather') this.cnt.food++;
        else if (!o.type || o.type === 'move') { /* em trânsito */ }
      } else if (u.type !== 'king') this.mil.push(u);
    }
    this.bt = {}; this.inc = {};
    for (const b of p.blds) {
      if (b.dead) continue;
      const m = b.complete ? this.bt : this.inc;
      (m[b.type] = m[b.type] || []).push(b);
    }
    this.tcs = this.bt.towncenter || [];
    this.base = this.tcs[0] || p.blds.find(b => !b.dead) || { x: p.start.x, y: p.start.y, w: 4, tx: p.start.x - 2, ty: p.start.y - 2 };
    // vilarejos na fila de treino
    this.queuedVils = 0;
    for (const t of this.tcs) for (const q of t.queue) if (q.id === 'villager') this.queuedVils++;
  }
  n(type) { return (this.bt[type] || []).length; }
  ninc(type) { return (this.inc[type] || []).length; }
  ntot(type) { return this.n(type) + this.ninc(type); }
  afford(cost, reserve) {
    const p = this.p;
    for (const r in cost) if (p.res[r] - ((reserve && reserve[r]) || 0) < cost[r]) return false;
    return true;
  }

  // ------------------------------------------------------------------ ciclo
  think() {
    const g = this.g, p = this.p;
    this.scan();
    const lv = this.lv;
    this.reserve = {};
    if (!this.tcs.length && !this.ninc('towncenter')) this.rebuildTC();
    this.manageAge();
    this.trainVillagers();
    this.manageHouses();
    this.manageEcoBuildings();
    this.ensureCamps();
    this.manageMilitaryBuildings();
    this.assignIdle();
    this.rebalance();
    this.researchTechs();
    this.trainMilitary();
    this.manageArmy();
    this.manageMarket();
  }

  vilTarget() {
    const lv = this.lv, p = this.p;
    const t = lv.vils;
    return Math.min(t, 18 + p.age * 12 + Math.floor(this.g.time / 60) * 1.5);
  }

  rebuildTC() {
    const p = this.p;
    if (!this.vils.length) return;
    const cost = this.g.buildCost(p, 'towncenter');
    if (p.age < 1 || !this.g.canAfford(p, cost)) return;
    this.tryBuild('towncenter', p.start.x, p.start.y, 3, 14, 1, 3);
  }

  // ------------------------------------------------------------------ evolução
  manageAge() {
    const g = this.g, p = this.p, lv = this.lv;
    if (p.age >= 3 || !this.tcs.length) return;
    const nxt = p.age + 1;
    const vils = this.vils.length;
    let want = false;
    if (nxt === 1) want = vils >= Math.min(lv.vils * 0.5, 22) && g.time > 120;
    if (nxt === 2) want = vils >= Math.min(lv.vils * 0.7, 36) && (this.n('barracks') + this.n('archeryrange') + this.n('stable')) >= 2;
    if (nxt === 3) want = vils >= lv.vils * 0.8 && this.mil.length >= 12 && this.p.pop > 90 && (g.time > 1500 || this.level !== 'easy');
    if (!want) return;
    const id = 'age' + nxt;
    // reserva recursos para a evolução
    const cost = g.techCost(p, id);
    for (const r in cost) this.reserve[r] = (this.reserve[r] || 0) + cost[r];
    if (!g.techAvailable(p, id)) return;
    if (!g.ageReqMet(p, nxt)) { this.buildForAge(nxt); return; }
    for (const tc of this.tcs) if (!tc.queue.length || tc.queue.length < 2) { if (g.queueTech(tc, id)) { this.reserve = {}; return; } }
  }
  buildForAge(nxt) {
    const rq = AGE_REQ[nxt];
    const have = new Set();
    for (const t of rq.from) if (this.ntot(t) > 0) have.add(t);
    if (have.size >= rq.n) return;
    const order = nxt === 1 ? ['house', 'mill', 'lumbercamp', 'barracks'] : nxt === 2 ? ['archeryrange', 'stable', 'blacksmith', 'market'] : ['siegeworkshop', 'castle'];
    for (const t of order) {
      if (this.ntot(t) === 0) { this.buildOne(t); return; }
    }
  }

  // ------------------------------------------------------------------ treino de aldeões
  trainVillagers() {
    const g = this.g, p = this.p;
    const target = this.vilTarget();
    const total = this.vils.length + this.queuedVils;
    if (total >= target) return;
    const cost = g.unitCost(p, 'villager');
    for (const tc of this.tcs) {
      if (tc.queue.length >= 2) continue;
      if (p.pop + tc.queue.length >= p.popCap) break;
      if (!this.afford(cost, this.reserve)) break;
      // prioridade: nunca deixe o treino parar
      g.queueUnit(tc, 'villager');
      this.queuedVils++;
      if (this.vils.length + this.queuedVils >= target) break;
    }
  }

  // ------------------------------------------------------------------ construção
  manageHouses() {
    const g = this.g, p = this.p;
    if (p.popCap >= 200) return;
    const pop = p.pop + this.queuedVils;
    const margin = pop < 30 ? 4 : pop < 70 ? 8 : 12;
    let incCap = 0;
    for (const b of this.inc.house || []) incCap += 5;
    if (p.popCap + incCap - pop > margin) return;
    const maxParallel = pop > 80 ? 3 : pop > 40 ? 2 : 1;
    if (this.ninc('house') >= maxParallel) return;
    if (!this.afford(g.buildCost(p, 'house'), null)) return;
    this.houseAng += 0.7;
    this.buildOne('house');
  }

  manageEcoBuildings() {
    const g = this.g, p = this.p;
    const vils = this.vils.length;
    // moinho / fazendas
    if (vils >= 6 && this.ntot('mill') === 0 && this.afford(g.buildCost(p, 'mill'), this.reserve)) {
      // moinho perto dos arbustos de frutas, se houver
      const bush = g.findResource(this.vils[0] || { owner: p.idx, bad: null }, 'berry', this.base.x, this.base.y, 16);
      if (bush) this.tryBuild('mill', bush.x, bush.y, 2, 5, 0, 1);
      else this.buildOne('mill');
    }
    // fazendas
    const farms = this.ntot('farm');
    const foodWorkers = this.cnt.food;
    const berries = g.findResource({ owner: p.idx, bad: null }, 'berry', this.base.x, this.base.y, 16);
    const wantFarms = this.wantedFarms(berries);
    if (farms < wantFarms && (this.ninc('farm') < 2) && this.afford(g.buildCost(p, 'farm'), this.reserve)) {
      const dr = this.n('mill') ? this.bt.mill[0] : this.base;
      this.tryBuild('farm', dr.x, dr.y, 2.5, 9, 0, 1, true);
    }
    // serraria e mineração são tratados em sendToResource()
    // torres de defesa
    if (p.age >= 1 && this.level !== 'easy' && this.ntot('tower') < Math.min(3, 1 + Math.floor(g.time / 900)) && this.afford(g.buildCost(p, 'tower'), this.reserve) && p.res.stone > 250) {
      this.tryBuild('tower', this.base.x, this.base.y, 6, 10, 1, 1);
    }
    // Castelo para unidade única / defesa
    if (p.age >= 2 && this.level !== 'easy' && this.ntot('castle') === 0 && p.res.stone >= 700 && vils > 30) this.buildOne('castle');
    // 2º Centro da Cidade em partidas longas
    if (p.age >= 2 && this.ntot('towncenter') < 2 && this.level !== 'easy' && p.res.wood > 600 && p.res.stone > 400 && vils > 40) this.tryBuild('towncenter', this.base.x, this.base.y, 14, 24, 1, 3);
  }
  wantedFarms(berries) {
    const food = this.vils.length * 0.42;
    if (this.n('mill') === 0 && !this.n('towncenter')) return 0;
    let w = berries ? Math.max(0, Math.round(food) - 6) : Math.round(food);
    if (this.vils.length < 10 && berries) w = 0;
    return Math.min(w, 28);
  }

  manageMilitaryBuildings() {
    const g = this.g, p = this.p;
    const vils = this.vils.length;
    const lv = this.lv;
    const early = vils < Math.min(lv.vils * 0.35, 14);
    if (early) return;
    const want = (type, n) => {
      if (BUILDINGS[type].age > p.age) return;
      if (this.ntot(type) >= n || this.ninc(type) >= 1) return;
      if (!this.afford(g.buildCost(p, type), this.reserve)) return;
      this.buildOne(type);
    };
    const mult = this.level === 'easy' ? 1 : this.level === 'moderate' ? 1.5 : 2;
    const scale = Math.max(1, Math.round(mult * (1 + vils / 40)));
    want('barracks', Math.min(1 + (p.age >= 1 ? 1 : 0) + (vils > 45 ? 1 : 0), scale + 1));
    want('archeryrange', Math.min(1 + (vils > 50 ? 1 : 0), scale));
    want('stable', Math.min(1 + (vils > 55 ? 1 : 0), scale));
    want('blacksmith', 1);
    if (p.age >= 2 && this.level !== 'easy') { want('siegeworkshop', 1); want('market', 1); }
  }

  // serrarias e acampamentos de mineração: construídos de forma proativa
  ensureCamps() {
    const g = this.g, p = this.p;
    if (this.vils.length < 7) return;
    const fake = { owner: p.idx, bad: null, id: -1 };
    const base = this.base;
    const need = (type, res, minWorkers) => {
      if (this.ninc(type) > 0) return;
      const t = g.findResource(fake, res, base.x, base.y, res === 'wood' ? 22 : 34);
      if (!t) return;
      const d = this.nearestDropDist(t.x, t.y, res);
      if (d <= 6 || this.hasPending(type, t)) return;
      if (res === 'wood' ? false : this.cnt[res] < minWorkers && p.res[res] > 400) return;
      const cost = g.buildCost(p, type);
      if (!g.canAfford(p, cost)) { this.reserve.wood = (this.reserve.wood || 0) + cost.wood; return; }
      const v = this.pickBuilder(t.x, t.y);
      if (v) this.planCamp(type, t, v);
    };
    need('lumbercamp', 'wood', 0);
    if (p.age >= 0 && this.vils.length >= 10) { need('miningcamp', 'gold', 1); }
    if (p.age >= 1 && p.res.stone < 400 && this.cnt.stone >= 1) need('miningcamp', 'stone', 1);
  }

  // escolhe um aldeão para construir
  pickBuilder(x, y, avoid) {
    let best = null, bd = 1e9;
    for (const v of this.vils) {
      if (v.dead || (v.order && v.order.type === 'build')) continue;
      if (avoid && avoid.has(v.id)) continue;
      let d = dist(v.x, v.y, x, y);
      if (v.order && v.order.type === 'gather' && v.carry && v.carry.n > 5) d += 8;
      if (!v.order) d -= 3;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  buildOne(type) {
    const b = this.base;
    const sz = BUILDINGS[type].size;
    let minR = 5, maxR = 18, gap = 1, nb = 2;
    if (type === 'house') { minR = 5; maxR = 20; gap = 0; nb = 1; }
    return this.tryBuild(type, b.x, b.y, minR, maxR, gap, nb, type === 'house');
  }
  tryBuild(type, cx, cy, minR, maxR, gap, nBuilders, clusterMode) {
    const g = this.g, p = this.p;
    const spot = this.findSpot(type, cx, cy, minR, maxR, gap, clusterMode);
    if (!spot) return null;
    const cost = g.buildCost(p, type);
    if (!g.canAfford(p, cost)) return null;
    const used = new Set();
    const builders = [];
    for (let i = 0; i < nBuilders; i++) {
      const v = this.pickBuilder(spot.x + BUILDINGS[type].size / 2, spot.y + BUILDINGS[type].size / 2, used);
      if (!v) break;
      used.add(v.id); builders.push(v);
    }
    if (!builders.length) return null;
    const b = g.cmdBuild(builders, type, spot.x, spot.y, false, p.idx);
    if (b) this.claim(builders);
    return b;
  }
  // remove aldeões já designados da lista de ociosos desta rodada
  claim(list) {
    for (const v of list) {
      const i = this.idle.indexOf(v);
      if (i >= 0) this.idle.splice(i, 1);
      if (this.builders.indexOf(v) < 0) this.builders.push(v);
    }
  }
  findSpot(type, cx, cy, minR, maxR, gap, clusterMode) {
    const g = this.g, w = g.world, p = this.p;
    const sz = BUILDINGS[type].size;
    let tries = 0;
    const ang0 = clusterMode ? this.houseAng : Math.random() * 6.28;
    for (let r = minR; r <= maxR; r += 1) {
      const steps = Math.max(8, Math.floor(r * 5));
      for (let k = 0; k < steps; k++) {
        const a = ang0 + (k / steps) * 6.2832;
        const tx = Math.round(cx + Math.cos(a) * r - sz / 2), ty = Math.round(cy + Math.sin(a) * r - sz / 2);
        if (++tries > 700) return null;
        if (!g.canPlace(p, type, tx, ty, true)) continue;
        if (gap > 0 && !this.clear(tx, ty, sz, gap)) continue;
        return { x: tx, y: ty };
      }
    }
    return null;
  }
  clear(tx, ty, sz, gap) {
    const w = this.g.world;
    for (let y = ty - gap; y < ty + sz + gap; y++) for (let x = tx - gap; x < tx + sz + gap; x++) {
      if (!w.inb(x, y)) return false;
      const i = w.idx(x, y);
      if (w.occ[i]) { const e = this.g.ents.get(w.occ[i]); if (!e || e.type !== 'farm') return false; }
      if (w.blk[i]) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ aldeões
  weights() {
    const p = this.p;
    let w;
    if (p.age === 0) w = { food: 0.5, wood: 0.45, gold: 0.05, stone: 0 };
    else if (p.age === 1) w = { food: 0.38, wood: 0.38, gold: 0.18, stone: 0.06 };
    else w = { food: 0.33, wood: 0.33, gold: 0.26, stone: 0.08 };
    // equilibra pelos estoques: o que está escasso ganha prioridade
    const half = { food: 700, wood: 450, gold: 500, stone: 350 };
    for (const r of RESOURCES) {
      const f = clamp(1.7 - p.res[r] / half[r], 0.12, 2.2);
      w[r] *= f;
    }
    for (const r in this.reserve) if (this.reserve[r] > p.res[r]) w[r] *= 1.4;
    if (this.n('towncenter') && p.age >= 1 && p.res.stone < 150 && this.level !== 'easy') w.stone = Math.max(w.stone, 0.05);
    if (p.age === 0 && this.vils.length < 9) { w.gold = 0; w.stone = 0; }
    const sum = w.food + w.wood + w.gold + w.stone || 1;
    for (const r of RESOURCES) w[r] /= sum;
    return w;
  }
  needRes() {
    const w = this.weights();
    const total = Math.max(1, this.vils.length - this.builders.length);
    let best = 'food', bd = -1e9;
    for (const r of RESOURCES) {
      const d = w[r] * total - this.cnt[r];
      if (d > bd) { bd = d; best = r; }
    }
    return best;
  }
  assignIdle() {
    let k = 0;
    for (const v of this.idle) {
      if (k++ > 12) break;
      if (!v.carry) v.carry = { res: null, n: 0 };
      if (v.carry && v.carry.n > 3) {
        // entrega primeiro o que carrega
        const d = this.g.dropoffFor(v, v.carry.res);
        if (d) { v.order = { type: 'gather', target: 0, rkey: null, lx: v.x, ly: v.y, stage: 'drop', drop: d.id }; this.g.resetNav(v); v.order.rkey = null; this.cnt[v.carry.res]++; continue; }
      }
      const res = this.needRes();
      if (this.sendToResource(v, res)) this.cnt[res]++;
      else {
        // tenta qualquer outro
        for (const r of RESOURCES) if (r !== res && this.sendToResource(v, r)) { this.cnt[r]++; break; }
      }
    }
  }
  rebalance() {
    // move aldeões de recursos em excesso para os que faltam
    if (this.vils.length < 12) return;
    const w = this.weights();
    const total = Math.max(1, this.vils.length - this.builders.length);
    let over = null, od = 0, under = null, ud = 0;
    for (const r of RESOURCES) {
      const d = this.cnt[r] - w[r] * total;
      if (d > od) { od = d; over = r; }
      if (-d > ud) { ud = -d; under = r; }
    }
    if (!over || !under || od < 2 || ud < 2) return;
    let moved = 0;
    for (const v of this.vils) {
      if (moved >= 2) break;
      const o = v.order;
      if (o && o.type === 'gather' && o.rkey && RKEY_RES[o.rkey] === over && (!v.carry || v.carry.n < 3)) {
        if (this.sendToResource(v, under)) { moved++; this.cnt[over]--; this.cnt[under]++; }
      }
    }
  }
  nearestDropDist(x, y, res) {
    let bd = 1e9;
    for (const b of this.p.blds) {
      if (b.dead) continue;
      const dr = BUILDINGS[b.type].drop;
      if (!dr || dr.indexOf(res) < 0) continue;
      bd = Math.min(bd, dist(x, y, b.x, b.y) - b.w / 2);
    }
    return bd;
  }
  sendToResource(v, res) {
    const g = this.g, p = this.p;
    const base = this.base;
    const gatherOrder = (t) => { g.setOrder(v, { type: 'gather', target: t.id, rkey: t.rkey, lx: t.x, ly: t.y, stage: 'go' }, false); return true; };
    const nearDrop = (t, r) => this.nearestDropDist(t.x, t.y, r);
    if (res === 'food') {
      // 1) frutas silvestres
      const bush = g.findResource(v, 'berry', base.x, base.y, 18);
      if (bush) {
        if (nearDrop(bush, 'food') > 6 && this.ntot('mill') < 3 && !this.hasPending('mill', bush)) { if (this.planCamp('mill', bush, v)) return true; }
        if (nearDrop(bush, 'food') < 14) return gatherOrder(bush);
      }
      // 2) fazendas livres
      const farm = g.findResource(v, 'farm', base.x, base.y, 22);
      if (farm) return gatherOrder(farm);
      // 3) caça
      const game = g.findResource(v, 'hunt', base.x, base.y, 16);
      if (game && this.vils.length < 18) return gatherOrder(game);
      // 4) nova fazenda
      if (this.afford(g.buildCost(p, 'farm'), null) && this.ninc('farm') < 3) {
        const dr = this.n('mill') ? this.bt.mill[0] : base;
        const b = this.tryBuild('farm', dr.x, dr.y, 2.5, 10, 0, 1, true);
        if (b) return true;
      }
      if (game) return gatherOrder(game);
      return false;
    }
    const rk = res;
    const anchor = base;
    let t = g.findResource(v, rk, anchor.x, anchor.y, rk === 'wood' ? 20 : 34);
    if (!t) t = g.findResource(v, rk, v.x, v.y, 40);
    if (!t) return false;
    if (nearDrop(t, res) > 7) {
      const campType = res === 'wood' ? 'lumbercamp' : 'miningcamp';
      if (!this.hasPending(campType, t) && this.planCamp(campType, t, v)) return true;
      if (nearDrop(t, res) > 30) return false;
    }
    return gatherOrder(t);
  }
  hasPending(type, t) {
    for (const b of this.inc[type] || []) if (dist(b.x, b.y, t.x, t.y) < 9) return true;
    return false;
  }
  planCamp(type, t, v) {
    const g = this.g, p = this.p;
    if (!this.afford(g.buildCost(p, type), null)) return false;
    // posição junto ao recurso
    const spot = this.findSpot(type, t.x, t.y, 2, 5, 0, false);
    if (!spot) return false;
    const b = g.cmdBuild([v], type, spot.x, spot.y, false, p.idx);
    if (b) this.claim([v]);
    return !!b;
  }

  // ------------------------------------------------------------------ pesquisas
  researchTechs() {
    const g = this.g, p = this.p;
    const prob = this.lv.upgrades;
    for (const b of p.blds) {
      if (b.dead || !b.complete || b.queue.length > 0) continue;
      const def = BUILDINGS[b.type];
      if (b.type === 'towncenter' && p.pop < 15) continue;
      const list = TECH_BY_BLD[b.type];
      if (!list) continue;
      for (const id of list) {
        const t = TECHS[id];
        if (t.ageUp) continue;
        if (!g.techAvailable(p, id)) continue;
        if (!this.isUseful(id)) continue;
        if (Math.random() > prob + 0.2) continue;
        const cost = g.techCost(p, id);
        if (!this.afford(cost, this.reserve)) continue;
        // não gaste tudo em tecnologia militar com pouco exército
        if (g.queueTech(b, id)) break;
      }
    }
  }
  isUseful(id) {
    const t = TECHS[id];
    const vils = this.vils.length;
    if (t.bld === 'lumbercamp') return this.cnt.wood >= 5;
    if (t.bld === 'miningcamp') return (t.id.indexOf('gold') === 0 ? this.cnt.gold : this.cnt.stone) >= 4;
    if (t.bld === 'mill') return this.n('farm') >= 5;
    if (t.bld === 'towncenter') return vils >= 12 || id === 'loom';
    if (t.bld === 'barracks' || t.bld === 'archeryrange' || t.bld === 'stable') return this.mil.length >= 8;
    if (t.bld === 'blacksmith') return this.mil.length >= 10 && !(id === 'masonry');
    if (t.bld === 'castle') return this.p.pop > 80;
    return true;
  }

  // ------------------------------------------------------------------ exército
  trainMilitary() {
    const g = this.g, p = this.p;
    const vils = this.vils.length;
    const lv = this.lv;
    const threatened = p.lastHit && g.time - p.lastHit < 20;
    if (vils < Math.min(lv.vils * 0.35, 12) && !threatened) return;
    if (p.pop >= p.popCap) return;
    // evita deixar a economia travada por exército demais
    const milCap = Math.floor(p.popCap * (this.level === 'easy' ? 0.5 : 0.65));
    if (this.mil.length > milCap && p.pop > 150) return;
    const choose = (b) => {
      const civ = CIVS[p.civ];
      switch (b.type) {
        case 'barracks': {
          const sp = p.age >= 1 && (Math.random() < 0.55);
          return sp ? 'spearman' : 'militia';
        }
        case 'archeryrange': return Math.random() < 0.8 ? 'archer' : 'skirmisher';
        case 'stable': return p.age >= 2 ? 'knight' : 'scout';
        case 'siegeworkshop': return this.mil.filter(u => u.type === 'ram' || u.type === 'mangonel').length < 2 + Math.floor(this.mil.length / 14) ? (Math.random() < 0.6 ? 'ram' : 'mangonel') : null;
        case 'castle': return civ.unique;
      }
      return null;
    };
    for (const b of p.blds) {
      if (b.dead || !b.complete || !BUILDINGS[b.type].units || b.type === 'towncenter') continue;
      if (b.queue.length >= 2) continue;
      if (p.pop + b.queue.length >= p.popCap) break;
      const id = choose(b);
      if (!id) continue;
      if (UNITS[id].age > p.age) continue;
      if (b.type === 'stable' && id === 'scout' && this.mil.filter(u => u.type === 'scout').length >= 3) continue;
      if (!this.afford(g.unitCost(p, id), this.reserve)) continue;
      g.queueUnit(b, id);
      if (!b.rally) this.setRally(b);
    }
  }
  setRally(b) {
    const g = this.g, p = this.p;
    const e = this.nearestEnemyStart();
    const base = this.base;
    let dx = 0, dy = 0;
    if (e) { dx = e.x - base.x; dy = e.y - base.y; const d = Math.hypot(dx, dy) || 1; dx = dx / d * 9; dy = dy / d * 9; }
    const pt = g.world.nearestFree(base.x + dx, base.y + dy, 8);
    b.rally = { x: pt.x, y: pt.y, target: 0 };
    this.staging = pt;
  }
  nearestEnemyStart() {
    const g = this.g, p = this.p;
    let best = null, bd = 1e9;
    for (const q of g.players) {
      if (q.eliminated || !g.isEnemy(p.idx, q.idx)) continue;
      const d = dist(q.start.x, q.start.y, p.start.x, p.start.y);
      if (d < bd) { bd = d; best = q.start; }
    }
    return best;
  }
  // inimigo-alvo (jogador) e posição
  pickTarget() {
    const g = this.g, p = this.p;
    let bestP = null, bd = 1e9;
    for (const q of g.players) {
      if (q.eliminated || !g.isEnemy(p.idx, q.idx)) continue;
      const d = dist(q.start.x, q.start.y, p.start.x, p.start.y) + (q.isHuman ? -6 : 0);
      if (d < bd) { bd = d; bestP = q; }
    }
    return bestP;
  }
  enemyPoint(q) {
    // posição de um edifício ou unidade do jogador q
    const me = this.base;
    let best = null, bd = 1e9;
    for (const b of q.blds) {
      if (b.dead) continue;
      const d = dist(b.x, b.y, me.x, me.y) - (b.type === 'towncenter' ? 12 : 0);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) for (const u of q.units) { if (!u.dead) { best = u; break; } }
    return best;
  }

  manageArmy() {
    const g = this.g, p = this.p, lv = this.lv;
    const army = this.mil;
    // defesa: unidades sendo atacadas
    if (p.lastHit && g.time - p.lastHit < 8 && this.phase === 'build' && p.lastHitPos) {
      for (const u of army) {
        if (!u.order || (u.order.type === 'move' && dist(u.x, u.y, p.lastHitPos.x, p.lastHitPos.y) < 30)) {
          if (dist(u.x, u.y, p.lastHitPos.x, p.lastHitPos.y) < 45) g.setOrder(u, { type: 'attackmove', x: p.lastHitPos.x, y: p.lastHitPos.y }, false);
        }
      }
    }
    if (this.phase === 'build') {
      const ready = army.length >= this.waveSize && g.time > lv.firstAttack * (this.level === 'easy' ? 1 : 0.8) && p.age >= 1;
      if (ready) {
        const tq = this.pickTarget();
        if (!tq) return;
        this.target = tq;
        this.phase = 'attack';
        this.waveStart = g.time;
        this.launched = army.length;
        this.wave++;
        const keep = Math.floor(army.length * lv.keepArmy * 0.3);
        const pt = this.enemyPoint(tq);
        if (!pt) return;
        const sel = army.slice(keep);
        // reunir primeiro em pontos intermediários não é necessário: o attack-move agrupa pelo caminho
        g.cmdAttackMove(sel, pt.x, pt.y, false);
        this.lastCmd = g.time;
        if (g.humanIdx >= 0 && tq.isHuman) g.events.push({ text: p.name + ' está atacando você!', kind: 'bad' });
      } else {
        // mantém as tropas agrupadas no ponto de encontro
        if (this.staging && g.tickN % 5 === 0) {
          const idle = army.filter(u => !u.order && dist(u.x, u.y, this.staging.x, this.staging.y) > 6);
          if (idle.length) g.cmdMove(idle.slice(0, 40), this.staging.x, this.staging.y, false);
        }
      }
    } else {
      const tq = this.target;
      if (!tq || tq.eliminated) {
        const nt = this.pickTarget();
        if (!nt) { this.phase = 'build'; return; }
        this.target = nt;
      }
      const alive = army.length;
      if (alive < this.launched * 0.25 || g.time - this.waveStart > 420) {
        this.phase = 'build';
        this.waveSize += lv.waveGrow;
        if (this.staging) g.cmdMove(army.slice(0, 80), this.staging.x, this.staging.y, false);
        return;
      }
      // tropas ociosas recebem novo alvo
      const idle = army.filter(u => !u.order);
      if (idle.length) {
        const pt = this.enemyPoint(this.target);
        if (pt) g.cmdAttackMove(idle, pt.x, pt.y, false);
      }
      // reforços chegam e se juntam
      if (g.time - this.lastCmd > 25) {
        this.lastCmd = g.time;
        const pt = this.enemyPoint(this.target);
        if (pt) g.cmdAttackMove(army.filter(u => !u.order || u.order.type === 'move'), pt.x, pt.y, false);
      }
    }
  }

  // ------------------------------------------------------------------ mercado
  manageMarket() {
    const g = this.g, p = this.p;
    if (!this.n('market') || g.tickN % 40 !== 0) return;
    // vende excesso, compra o que falta
    for (const r of ['food', 'wood', 'stone']) {
      if (p.res[r] > 1500) { g.marketTrade(p, r, true); return; }
    }
    if (p.res.gold < 100 && (p.res.food > 800 || p.res.wood > 800)) g.marketTrade(p, p.res.food > p.res.wood ? 'food' : 'wood', true);
  }
}

// índice de tecnologias por construção
const TECH_BY_BLD = {};
for (const id in TECHS) { const t = TECHS[id]; (TECH_BY_BLD[t.bld] = TECH_BY_BLD[t.bld] || []).push(id); }
