'use strict';
// Interface do jogo: HUD, minimapa, seleção, comandos e entrada do jogador

const HK = 'QWERTASDFGZXCVB';
const HK_CODES = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3, KeyT: 4, KeyA: 5, KeyS: 6, KeyD: 7, KeyF: 8, KeyG: 9, KeyZ: 10, KeyX: 11, KeyC: 12, KeyV: 13, KeyB: 14 };
const BUILD_ORDER = ['house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'barracks', 'archeryrange', 'stable', 'blacksmith', 'market', 'siegeworkshop', 'tower', 'castle', 'towncenter'];
const RES_LABEL = { tree: 'Árvore', gold: 'Mina de Ouro', stone: 'Mina de Pedra', berry: 'Arbusto de Frutas', carcass: 'Carcaça', deer: 'Veado' };

function costHtml(cost, p) {
  let s = '';
  for (const r of RESOURCES) if (cost[r]) s += '<span class="' + (p && p.res[r] < cost[r] ? 'bad' : '') + '">' + RES_ICON[r] + cost[r] + '</span> ';
  return s;
}

class UI {
  constructor(game, renderer, root, hooks) {
    this.g = game; this.r = renderer; this.root = root; this.hooks = hooks || {};
    renderer.ui = this;
    this.sel = [];             // entidades selecionadas
    this.selSet = new Set();
    this.groups = {};
    this.placing = null;
    this.cmdMode = null;
    this.drag = null;
    this.mouse = { x: 0, y: 0, inside: false };
    this.mouseWorld = null;
    this.keys = {};
    this.cells = [];
    this.hoverCell = -1;
    this.msgs = [];
    this.pings = [];
    this.hudTimer = 0;
    this.lastClick = { t: 0, id: 0 };
    this.cardSig = '';
    this.paused = false;
    this.cycle = { idleVil: 0, idleMil: 0 };
    this.mmDraw = 0;
    this.build();
    this.bind();
    const p = game.human;
    renderer.centerOn(p.start.x, p.start.y + 3);
    renderer.cam.zoom = 1;
    // seleciona o centro da cidade
    const tc = p.blds.find(b => b.type === 'towncenter');
    if (tc) this.setSel([tc]);
  }

  // ------------------------------------------------------------------ DOM
  build() {
    const root = this.root;
    root.innerHTML = `
      <canvas id="view"></canvas>
      <div id="topbar">
        <div class="res" id="r-food" title="Comida"><b>🍖</b><span>0</span><small>0</small></div>
        <div class="res" id="r-wood" title="Madeira"><b>🪵</b><span>0</span><small>0</small></div>
        <div class="res" id="r-gold" title="Ouro"><b>🪙</b><span>0</span><small>0</small></div>
        <div class="res" id="r-stone" title="Pedra"><b>🪨</b><span>0</span><small>0</small></div>
        <div class="res" id="r-pop" title="População"><b>👥</b><span>0/0</span></div>
        <div class="res wide" id="r-age" title="Era atual"></div>
        <div class="grow"></div>
        <button id="b-idle" title="Aldeão ocioso ( . )">👷<span>0</span></button>
        <button id="b-idlem" title="Soldado ocioso ( , )">⚔️<span>0</span></button>
        <div class="res" id="r-time">0:00</div>
        <button id="b-speed" title="Velocidade (+/-)">1.0x</button>
        <button id="b-pause" title="Pausa (P)">⏸</button>
        <button id="b-menu" title="Menu (Esc)">☰</button>
      </div>
      <div id="msgs"></div>
      <div id="objectives" hidden></div>
      <div id="hud">
        <div id="mmwrap"><canvas id="minimap" width="240" height="120"></canvas></div>
        <div id="info"></div>
        <div id="card"></div>
      </div>
      <div id="tip" hidden></div>
      <div id="banner" hidden></div>
      <div id="overlay" hidden></div>`;
    this.cv = root.querySelector('#view');
    this.mm = root.querySelector('#minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.mmTerr = document.createElement('canvas'); this.mmTerr.width = this.mmTerr.height = this.g.n;
    this.mmTerrCtx = this.mmTerr.getContext('2d');
    this.mmImg = this.mmTerrCtx.createImageData(this.g.n, this.g.n);
    this.el = {
      info: root.querySelector('#info'), card: root.querySelector('#card'), tip: root.querySelector('#tip'), msgs: root.querySelector('#msgs'),
      overlay: root.querySelector('#overlay'), banner: root.querySelector('#banner'), obj: root.querySelector('#objectives'),
    };
    this.r.cv = this.cv; this.r.ctx = this.cv.getContext('2d'); this.r.resize();
  }

  bind() {
    const root = this.root, cv = this.cv;
    this.onResize = () => { this.r.resize(); };
    window.addEventListener('resize', this.onResize);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => this.onMouseDown(e));
    window.addEventListener('mouseup', this.mu = e => this.onMouseUp(e));
    window.addEventListener('mousemove', this.mv = e => this.onMouseMove(e));
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
    cv.addEventListener('dblclick', e => this.onDblClick(e));
    window.addEventListener('keydown', this.kd = e => this.onKey(e, true));
    window.addEventListener('keyup', this.ku = e => this.onKey(e, false));
    const card = this.el.card;
    card.addEventListener('pointerdown', e => {
      const c = e.target.closest('.cell'); if (!c) return;
      e.preventDefault();
      this.pressCell(+c.dataset.i, e.shiftKey, e.button === 2);
    });
    card.addEventListener('mouseover', e => { const c = e.target.closest('.cell'); this.hoverCell = c ? +c.dataset.i : -1; this.showTip(c); });
    card.addEventListener('mouseleave', () => { this.hoverCell = -1; this.el.tip.hidden = true; });
    this.el.info.addEventListener('pointerdown', e => {
      const t = e.target.closest('[data-sel]');
      if (t) { const en = this.g.ent(+t.dataset.sel); if (en) { if (e.shiftKey) this.removeFromSel(en); else this.setSel([en]); } return; }
      const q = e.target.closest('[data-cancel]');
      if (q) { const b = this.g.ent(+q.dataset.b); if (b && b.owner === this.g.humanIdx) this.g.cancelQueue(b, +q.dataset.cancel); this.hudTimer = 0; }
    });
    const mmEv = e => {
      const rect = this.mm.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * 240 / rect.width, my = (e.clientY - rect.top) * 120 / rect.height;
      const k = 240 / (2 * this.g.n);
      const u = (mx - 120) / k, v = my / (k / 2);
      return { x: clamp((u + v) / 2, 0, this.g.n), y: clamp((v - u) / 2, 0, this.g.n) };
    };
    this.mm.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const w = mmEv(e);
      if (e.button === 2) { this.issueAt(w.x, w.y, null, e.shiftKey); return; }
      if (this.cmdMode === 'attackmove') { this.doAttackMove(w.x, w.y, e.shiftKey); return; }
      this.mmDrag = true; this.r.centerOn(w.x, w.y);
    });
    this.mm.addEventListener('mousemove', e => { if (this.mmDrag) { const w = mmEv(e); this.r.centerOn(w.x, w.y); } });
    window.addEventListener('mouseup', this.mmu = () => { this.mmDrag = false; });
    const q = s => this.root.querySelector(s);
    q('#b-idle').onclick = () => this.cycleIdle(true);
    q('#b-idlem').onclick = () => this.cycleIdle(false);
    q('#b-speed').onclick = () => this.changeSpeed(1);
    q('#b-pause').onclick = () => this.togglePause();
    q('#b-menu').onclick = () => this.openMenu();
    this.el.msgs.addEventListener('pointerdown', e => {
      const m = e.target.closest('[data-x]'); if (m) this.r.centerOn(+m.dataset.x, +m.dataset.y);
    });
  }
  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mouseup', this.mu); window.removeEventListener('mousemove', this.mv);
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
    window.removeEventListener('mouseup', this.mmu);
  }

  // ------------------------------------------------------------------ seleção
  setSel(list) {
    this.sel = list.filter(e => e && !e.dead);
    this.selSet = new Set(this.sel.map(e => e.id));
    this.cmdMode = null; this.placing = null;
    this.hudTimer = 0; this.cardSig = '';
  }
  removeFromSel(e) { this.setSel(this.sel.filter(x => x !== e)); }
  own() { return this.sel.filter(e => !e.dead && e.owner === this.g.humanIdx); }
  ownUnits() { return this.sel.filter(e => !e.dead && e.kind === 'unit' && e.owner === this.g.humanIdx); }
  ownBlds() { return this.sel.filter(e => !e.dead && e.kind === 'building' && e.owner === this.g.humanIdx); }

  // elemento sob um ponto da tela
  pickAt(px, py) {
    const g = this.g, r = this.r, z = r.cam.zoom;
    let best = null, bd = 1e9;
    for (const e of g.ents.values()) {
      if (e.dead || (e.kind !== 'unit' && e.kind !== 'animal') || !g.canSee(e)) continue;
      const s = r.worldToScreen(e.x, e.y, 10);
      const rad = (e.kind === 'unit' && UNITS[e.type].scale ? 20 : 11) * z;
      const dx = s.x - px, dy = (s.y - py) * 0.8;
      const d = Math.hypot(dx, dy);
      if (d < rad && d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    // construções: testa alturas do telhado
    for (const e of g.buildings) {
      if (e.dead || !g.canSee(e)) continue;
      const H = e.type === 'tower' ? 60 : e.w * 11 + 8;
      for (const f of (BUILDINGS[e.type].passable ? [0] : [0, 0.35, 0.7, 1])) {
        const w = r.screenToWorld(px, py + f * H * z);
        if (w.x >= e.tx && w.x <= e.tx + e.w && w.y >= e.ty && w.y <= e.ty + e.h) return e;
      }
    }
    // recursos
    const w0 = r.screenToWorld(px, py + 12 * z);
    let bestR = null, br = 1e9;
    g.gridRes.query(w0.x, w0.y, 2, e => {
      if (e.dead || !g.canSee(e)) return;
      const s = r.worldToScreen(e.x, e.y, 10);
      const d = Math.hypot(s.x - px, (s.y - py) * 0.9);
      if (d < 16 * z && d < br) { br = d; bestR = e; }
    });
    return bestR;
  }

  // ------------------------------------------------------------------ mouse
  rel(e) { const rc = this.cv.getBoundingClientRect(); return { x: e.clientX - rc.left, y: e.clientY - rc.top }; }
  onMouseDown(e) {
    if (this.paused || this.g.over && this.overlayOpen) return;
    const p = this.rel(e);
    this.mouse.x = p.x; this.mouse.y = p.y;
    if (e.button === 1) { this.pan = { x: p.x, y: p.y, cx: this.r.cam.x, cy: this.r.cam.y }; e.preventDefault(); return; }
    if (e.button === 2) { this.onRightClick(p.x, p.y, e.shiftKey); return; }
    if (e.button !== 0) return;
    if (this.placing) { this.placeBuilding(e.shiftKey); return; }
    if (this.cmdMode === 'attackmove') {
      const w = this.r.screenToWorld(p.x, p.y);
      this.doAttackMove(w.x, w.y, e.shiftKey); return;
    }
    this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey };
  }
  onMouseMove(e) {
    const p = this.rel(e);
    this.mouse.x = p.x; this.mouse.y = p.y;
    this.mouse.inside = e.clientX >= 0 && e.clientY >= 0 && e.clientX <= window.innerWidth && e.clientY <= window.innerHeight;
    this.mouseWorld = this.r.screenToWorld(p.x, p.y);
    if (this.pan) {
      this.r.cam.x = this.pan.cx - (p.x - this.pan.x) / this.r.cam.zoom;
      this.r.cam.y = this.pan.cy - (p.y - this.pan.y) / this.r.cam.zoom;
      this.r.clampCam();
    }
    if (this.drag) { this.drag.x1 = p.x; this.drag.y1 = p.y; }
  }
  onMouseUp(e) {
    if (e.button === 1) { this.pan = null; return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag; this.drag = null;
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (w < 6 && h < 6) {
      const ent = this.pickAt(d.x0, d.y0);
      if (ent) {
        if (d.shift && this.sel.length && ent.owner === this.g.humanIdx && this.sel[0].owner === this.g.humanIdx && ent.kind === 'unit' && this.sel[0].kind === 'unit') {
          if (this.selSet.has(ent.id)) this.removeFromSel(ent); else this.setSel(this.sel.concat([ent]));
        } else this.setSel([ent]);
        if (ent.owner === this.g.humanIdx) Sfx.play('select');
      } else if (!d.shift) this.setSel([]);
      return;
    }
    // seleção por caixa: unidades próprias
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const out = [];
    for (const u of this.g.units) {
      if (u.dead || u.owner !== this.g.humanIdx) continue;
      const s = this.r.worldToScreen(u.x, u.y, 10);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) out.push(u);
    }
    if (d.shift && this.sel.length && this.sel[0].kind === 'unit' && this.sel[0].owner === this.g.humanIdx) {
      const set = new Set(this.sel.map(e => e.id));
      for (const u of out) if (!set.has(u.id)) this.sel.push(u);
      this.setSel(this.sel);
    } else {
      // prioriza militares se houver mistura
      const mil = out.filter(u => u.type !== 'villager');
      this.setSel(out.length > 1 && mil.length && mil.length < out.length && this.keys['ControlLeft'] ? mil : out);
    }
    if (out.length) Sfx.play('select');
  }
  onDblClick(e) {
    const p = this.rel(e);
    const ent = this.pickAt(p.x, p.y);
    if (!ent || ent.owner !== this.g.humanIdx) return;
    const out = [];
    const list = ent.kind === 'unit' ? this.g.units : this.g.buildings;
    for (const o of list) {
      if (o.dead || o.owner !== ent.owner || o.type !== ent.type) continue;
      const s = this.r.worldToScreen(o.x, o.y);
      if (s.x >= 0 && s.x <= this.r.W && s.y >= 0 && s.y <= this.r.H) out.push(o);
    }
    this.setSel(out);
  }
  zoom(f, cx, cy) {
    const r = this.r, before = r.screenToWorld(cx, cy);
    r.cam.zoom = clamp(r.cam.zoom * f, 0.5, 1.7);
    const after = r.screenToWorld(cx, cy);
    // mantém o ponto sob o cursor
    r.cam.x += (isoX(before.x, before.y) - isoX(after.x, after.y));
    r.cam.y += (isoY(before.x, before.y) - isoY(after.x, after.y));
    r.clampCam();
  }

  // ------------------------------------------------------------------ comandos
  onRightClick(px, py, shift) {
    if (this.placing) { this.placing = null; return; }
    if (this.cmdMode) { this.cmdMode = null; return; }
    const w = this.r.screenToWorld(px, py);
    const ent = this.pickAt(px, py);
    this.issueAt(w.x, w.y, ent, shift);
  }
  marker(x, y, color) { this.r.markers.push({ x, y, t: 0, color: color || '#ffffff' }); }
  issueAt(x, y, ent, shift) {
    const g = this.g, me = g.humanIdx;
    x = clamp(x, 0.5, g.n - 0.5); y = clamp(y, 0.5, g.n - 0.5);
    const units = this.ownUnits();
    if (!units.length) {
      const blds = this.ownBlds();
      if (blds.length) {
        // ponto de encontro
        for (const b of blds) {
          if (b.type === 'farm') continue;
          const tg = ent && (ent.kind === 'res' || ent.kind === 'animal' || (ent.kind === 'building' && ent.owner === me)) ? ent : null;
          g.cmdSetRally(b, tg ? tg.x : x, tg ? tg.y : y, tg);
        }
        this.marker(ent ? ent.x : x, ent ? ent.y : y, '#6fd3ff');
        Sfx.play('click');
      }
      return;
    }
    Sfx.play('order');
    if (ent && ent.id !== undefined) {
      if ((ent.kind === 'unit' || ent.kind === 'building') && g.isEnemy(me, ent.owner)) {
        g.cmdAttack(units, ent, shift);
        this.marker(ent.x, ent.y, '#ff4a3a');
        return;
      }
      if (ent.kind === 'res' || ent.kind === 'animal') {
        const vil = units.filter(u => u.type === 'villager'), rest = units.filter(u => u.type !== 'villager');
        if (vil.length) g.cmdGather(vil, ent, shift);
        if (rest.length) g.cmdMove(rest, ent.x, ent.y, shift);
        this.marker(ent.x, ent.y, '#ffe36a');
        return;
      }
      if (ent.kind === 'building' && ent.owner === me) {
        const vil = units.filter(u => u.type === 'villager'), rest = units.filter(u => u.type !== 'villager');
        if (vil.length) {
          if (ent.type === 'farm' && ent.complete) g.cmdGather(vil, ent, shift);
          else if (!ent.complete || ent.hp < ent.maxhp - 1) g.cmdBuildOn(vil, ent, shift);
          else g.cmdMove(vil, ent.x, ent.y + ent.h / 2 + 0.5, shift);
        }
        if (rest.length) g.cmdMove(rest, x, y, shift);
        this.marker(ent.x, ent.y, '#7dff9a');
        return;
      }
    }
    g.cmdMove(units, x, y, shift);
    this.marker(x, y, '#ffffff');
  }
  doAttackMove(x, y, shift) {
    const units = this.ownUnits().filter(u => u.type !== 'villager' || true);
    this.cmdMode = null;
    if (!units.length) return;
    this.g.cmdAttackMove(units, x, y, shift);
    this.marker(x, y, '#ff6a4a');
    Sfx.play('order');
  }
  placeBuilding(shift) {
    const pl = this.placing, g = this.g;
    if (!pl) return;
    const vils = this.ownUnits().filter(u => u.type === 'villager');
    if (!pl.ok) { Sfx.play('error'); return; }
    if (!vils.length) { this.placing = null; return; }
    const b = g.cmdBuild(vils, pl.type, pl.tx, pl.ty, this.keys['ShiftLeft'] || this.keys['ShiftRight'] || shift, g.humanIdx);
    if (b) {
      Sfx.play('place');
      if (!(shift || this.keys['ShiftLeft'] || this.keys['ShiftRight'])) this.placing = null;
      else if (!g.canAfford(g.human, g.buildCost(g.human, pl.type))) this.placing = null;
    } else Sfx.play('error');
  }

  // ------------------------------------------------------------------ botões de comando
  getCells() {
    const g = this.g, p = g.human, cells = new Array(15).fill(null);
    const own = this.own();
    if (!own.length || p.eliminated) return cells;
    const units = this.ownUnits(), blds = this.ownBlds();
    if (this.placing) { cells[14] = { icon: '✖', label: 'Cancelar', tip: '<b>Cancelar</b> construção (Esc)', enabled: true, act: () => { this.placing = null; } }; return cells; }
    if (units.length) {
      const allVil = units.some(u => u.type === 'villager');
      if (allVil) {
        BUILD_ORDER.forEach((id, i) => {
          const def = BUILDINGS[id];
          const cost = g.buildCost(p, id);
          const locked = def.age > p.age;
          const ok = !locked && g.canAfford(p, cost);
          cells[i] = {
            icon: def.icon, name: def.name, enabled: ok, locked,
            tip: '<b>' + def.name + '</b> <i>[' + HK[i] + ']</i><br>' + costHtml(cost, p) + (locked ? '<br><span class="bad">Requer ' + AGES[def.age].name + '</span>' : '') + '<br><span class="dim">' + def.desc + '</span>',
            act: () => { if (!ok) { Sfx.play('error'); if (locked) g.notify(g.humanIdx, 'Requer ' + AGES[def.age].name, 'warn'); else g.notify(g.humanIdx, 'Recursos insuficientes', 'warn'); return; } this.placing = { type: id }; this.cmdMode = null; },
          };
        });
      } else {
        cells[0] = { icon: '⚔️', name: 'Atacar-mover', enabled: true, tip: '<b>Atacar-mover</b> <i>[Q]</i><br>As tropas avançam atacando tudo pelo caminho.', act: () => { this.cmdMode = 'attackmove'; } };
      }
      cells[14] = { icon: '⏹', name: 'Parar', enabled: true, tip: '<b>Parar</b> <i>[B]</i><br>Cancela as ordens atuais.', act: () => g.cmdStop(units) };
      cells[13] = allVil ? cells[13] : { icon: '🗑️', name: 'Excluir', enabled: true, tip: '<b>Excluir unidades</b> <i>[Del]</i>', act: () => this.deleteSel() };
      return cells;
    }
    // construções
    const b = blds[0];
    if (!b.complete) { cells[14] = { icon: '🗑️', name: 'Cancelar construção', enabled: true, tip: '<b>Cancelar construção</b><br>Devolve recursos.', act: () => this.deleteSel() }; return cells; }
    const def = BUILDINGS[b.type];
    let i = 0;
    const units2 = b.type === 'castle' ? [CIVS[p.civ].unique] : (def.units || []);
    for (const id of units2) {
      const ud = UNITS[id], cost = g.unitCost(p, id);
      const locked = ud.age > p.age, ok = !locked && g.canAfford(p, cost);
      const idx = i++;
      cells[idx] = {
        icon: ud.icon, name: ud.name, enabled: ok, locked,
        tip: '<b>' + (id === 'militia' && p.techs.has('manatarms') ? g.humanUnitName(p, id) : ud.name) + '</b> <i>[' + HK[idx] + ']</i> <small>(Shift: ×5)</small><br>' + costHtml(cost, p) + ' ⏱' + Math.round(g.prodTime(p, b.type, ud.time)) + 's' + (locked ? '<br><span class="bad">Requer ' + AGES[ud.age].name + '</span>' : '') + '<br><span class="dim">' + ud.desc + '</span><br>' + this.unitStatLine(ud),
        act: (shift) => { const n = shift ? 5 : 1; let c = 0; for (let k = 0; k < n; k++) { for (const bb of blds) if (bb.type === b.type) { if (g.queueUnit(bb, id)) { c++; break; } } } if (!c) Sfx.play('error'); else Sfx.play('click'); },
      };
    }
    if (def.market) {
      let k = 0;
      for (const r of ['food', 'wood', 'stone']) {
        const pr = g.market[p.idx][r];
        const buy = Math.ceil(pr * 1.3), sell = Math.floor(pr * 0.7);
        cells[k] = { icon: '🛒' + RES_ICON[r], name: 'Comprar ' + RES_NAME[r], enabled: p.res.gold >= buy, tip: '<b>Comprar 100 ' + RES_NAME[r] + '</b><br>Custo: 🪙' + buy, act: () => { if (g.marketTrade(p, r, false)) Sfx.play('click'); else Sfx.play('error'); } };
        cells[k + 5] = { icon: '💱' + RES_ICON[r], name: 'Vender ' + RES_NAME[r], enabled: p.res[r] >= 100, tip: '<b>Vender 100 ' + RES_NAME[r] + '</b><br>Ganho: 🪙' + sell, act: () => { if (g.marketTrade(p, r, true)) Sfx.play('click'); else Sfx.play('error'); } };
        k++;
      }
      return cells;
    }
    const techs = (TECH_BY_BLD[b.type] || []).filter(id => !p.techs.has(id) && !(TECHS[id].ageUp && TECHS[id].ageUp !== p.age + 1));
    for (const id of techs) {
      if (i >= 14) break;
      const t = TECHS[id], cost = g.techCost(p, id);
      const avail = g.techAvailable(p, id);
      const ok = avail && g.canAfford(p, cost);
      const idx = i++;
      let why = '';
      if (!avail) { if (p.inProgress.has(id)) why = 'Em pesquisa'; else if (t.req && t.req.some(r => !p.techs.has(r))) why = 'Requer ' + t.req.filter(r => !p.techs.has(r)).map(r => TECHS[r].name).join(', '); else if (p.age < t.age) why = 'Requer ' + AGES[t.age].name; }
      if (t.ageUp && avail && !g.ageReqMet(p, t.ageUp)) why = 'Requer: ' + AGE_REQ[t.ageUp].from.map(x => BUILDINGS[x].name).join(' / ') + ' (' + AGE_REQ[t.ageUp].n + ')';
      cells[idx] = {
        icon: t.icon, name: t.name, enabled: ok && !why, locked: !avail || !!why,
        tip: '<b>' + t.name + '</b> <i>[' + HK[idx] + ']</i><br>' + costHtml(cost, p) + ' ⏱' + t.time + 's' + (why ? '<br><span class="bad">' + why + '</span>' : '') + '<br><span class="dim">' + t.desc + '</span>',
        act: () => { if (!g.queueTech(b, id)) Sfx.play('error'); else Sfx.play('click'); },
      };
    }
    cells[14] = { icon: '🗑️', name: 'Excluir', enabled: true, tip: '<b>Excluir edifício</b> <i>[Del]</i>', act: () => this.deleteSel() };
    return cells;
  }
  unitStatLine(ud) {
    return '<span class="dim">PV ' + ud.hp + ' · Atq ' + ud.atk + ' · Arm ' + ud.armor[0] + '/' + ud.armor[1] + (ud.range ? ' · Alc ' + ud.range : '') + '</span>';
  }
  pressCell(i, shift, right) {
    const c = this.cells[i];
    if (!c) return;
    c.act(shift);
    this.hudTimer = 0; this.cardSig = '';
  }
  showTip(el) {
    const tip = this.el.tip;
    if (!el || !this.cells[+el.dataset.i]) { tip.hidden = true; return; }
    const c = this.cells[+el.dataset.i];
    tip.innerHTML = c.tip || c.name || '';
    tip.hidden = false;
    const rc = el.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(window.innerWidth - 270, rc.left - 120)) + 'px';
    tip.style.top = (rc.top - tip.offsetHeight - 8) + 'px';
  }

  deleteSel() {
    const g = this.g;
    for (const e of this.own()) {
      if (e.kind === 'building' && !e.complete) { g.refund(g.human, g.buildCost(g.human, e.type)); g.kill(e, null); this.events_noMsg = true; }
      else g.kill(e, null);
    }
    this.setSel([]);
  }

  cycleIdle(vil) {
    const g = this.g, p = g.human;
    const list = p.units.filter(u => !u.dead && !u.order && (vil ? u.type === 'villager' : (u.type !== 'villager' && u.type !== 'king')));
    if (!list.length) { g.notify(g.humanIdx, vil ? 'Nenhum aldeão ocioso' : 'Nenhum soldado ocioso', 'info'); return; }
    const k = vil ? 'idleVil' : 'idleMil';
    this.cycle[k] = (this.cycle[k] + 1) % list.length;
    const u = list[this.cycle[k]];
    this.setSel([u]);
    this.r.centerOn(u.x, u.y);
  }
  changeSpeed(dir) {
    const sp = [1, 1.7, 2.5, 4];
    let i = sp.indexOf(this.g.speedMul);
    if (i < 0) i = 1;
    i = (i + dir + sp.length) % sp.length;
    this.g.speedMul = sp[i];
    g_notify(this.g, 'Velocidade do jogo: ' + sp[i] + 'x');
  }
  togglePause() { this.paused = !this.paused; this.root.querySelector('#b-pause').textContent = this.paused ? '▶' : '⏸'; if (this.paused) this.showBanner('PAUSADO'); else this.el.banner.hidden = true; }
  showBanner(t) { this.el.banner.textContent = t; this.el.banner.hidden = false; }

  // ------------------------------------------------------------------ teclado
  onKey(e, down) {
    if (!this.root || this.root.hidden) return;
    this.keys[e.code] = down;
    if (!down) return;
    if (this.overlayOpen) { if (e.code === 'Escape' && this.menuOpen) this.closeOverlay(); return; }
    const g = this.g;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.code === 'Escape') {
      if (this.placing) this.placing = null;
      else if (this.cmdMode) this.cmdMode = null;
      else this.openMenu();
      e.preventDefault(); return;
    }
    if (this.paused && e.code !== 'KeyP') return;
    if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (ctrl) { this.groups[n] = this.own().map(x => x.id); e.preventDefault(); g.notify(g.humanIdx, 'Grupo ' + n + ' definido', 'info'); return; }
      const ids = (this.groups[n] || []).map(id => g.ent(id)).filter(Boolean);
      if (ids.length) {
        const now = performance.now();
        this.setSel(ids);
        if (this.lastGroup === n && now - this.lastGroupT < 400) this.r.centerOn(ids[0].x, ids[0].y);
        this.lastGroup = n; this.lastGroupT = now;
      }
      e.preventDefault(); return;
    }
    if (e.code in HK_CODES && !ctrl) {
      const c = this.cells[HK_CODES[e.code]];
      if (c) { this.pressCell(HK_CODES[e.code], e.shiftKey); e.preventDefault(); }
      return;
    }
    switch (e.code) {
      case 'Period': this.cycleIdle(true); break;
      case 'Comma': this.cycleIdle(false); break;
      case 'KeyH': { const tc = g.human.blds.find(b => b.type === 'towncenter' && !b.dead); if (tc) { this.setSel([tc]); this.r.centerOn(tc.x, tc.y); } break; }
      case 'KeyP': this.togglePause(); break;
      case 'Delete': this.deleteSel(); break;
      case 'Equal': case 'NumpadAdd': this.changeSpeed(1); break;
      case 'Minus': case 'NumpadSubtract': this.changeSpeed(-1); break;
      case 'Space': { const p = g.human.lastHitPos; if (p) this.r.centerOn(p.x, p.y); e.preventDefault(); break; }
      case 'KeyM': this.root.classList.toggle('nomm'); break;
      case 'KeyI': if (ctrl) { e.preventDefault(); } break;
      case 'Tab': e.preventDefault(); break;
      default:
    }
  }

  // ------------------------------------------------------------------ atualização por frame
  update(dt, ts) {
    const g = this.g, cam = this.r.cam;
    // rolagem
    const sp = 760 / cam.zoom * dt;
    let vx = 0, vy = 0;
    const k = this.keys;
    if (k.ArrowLeft) vx -= 1; if (k.ArrowRight) vx += 1; if (k.ArrowUp) vy -= 1; if (k.ArrowDown) vy += 1;
    if (this.mouse.inside && !this.drag && !this.paused && !this.overlayOpen && document.hasFocus()) {
      const m = this.mouse, W = this.r.W, H = this.r.H;
      if (m.x <= 3) vx -= 1; if (m.x >= W - 4) vx += 1; if (m.y <= 3) vy -= 1; if (m.y >= H - 4) vy += 1;
    }
    if (vx || vy) { cam.x += vx * sp * 1.6; cam.y += vy * sp * 1.0; this.r.clampCam(); }
    if (this.mouse.inside) this.mouseWorld = this.r.screenToWorld(this.mouse.x, this.mouse.y);
    // remove mortos da seleção
    if (this.sel.some(e => e.dead)) { this.sel = this.sel.filter(e => !e.dead); this.selSet = new Set(this.sel.map(e => e.id)); this.hudTimer = 0; }
    // eventos do jogo
    this.consumeEvents();
    this.hudTimer -= dt;
    this.updateTop();
    if (this.hudTimer <= 0) { this.hudTimer = 0.2; this.renderInfo(); this.renderCard(); }
    this.drawMinimap();
    this.updateMsgs(dt);
    if (this.hooks.update) this.hooks.update(dt);
  }

  updateTop() {
    const g = this.g, p = g.human, q = s => this.root.querySelector(s);
    const cnt = { food: 0, wood: 0, gold: 0, stone: 0 };
    let idle = 0, idleMil = 0;
    for (const u of p.units) {
      if (u.dead) continue;
      if (u.type === 'villager') {
        if (!u.order) idle++;
        else if (u.order.type === 'gather' && u.order.rkey) cnt[RKEY_RES[u.order.rkey]]++;
      } else if (u.type !== 'king' && !u.order) idleMil++;
    }
    for (const r of RESOURCES) {
      const el = q('#r-' + r);
      el.children[1].textContent = Math.floor(p.res[r]);
      el.children[2].textContent = cnt[r];
    }
    const pe = q('#r-pop');
    pe.children[1].textContent = p.pop + '/' + p.popCap;
    pe.classList.toggle('warnr', p.pop >= p.popCap);
    q('#r-age').textContent = AGES[p.age].icon + ' ' + AGES[p.age].name;
    q('#r-time').textContent = fmtTime(g.time);
    q('#b-idle').children[0].textContent = idle; q('#b-idle').classList.toggle('on', idle > 0);
    q('#b-idlem').children[0].textContent = idleMil;
    q('#b-speed').textContent = g.speedMul + 'x';
  }

  consumeEvents() {
    const g = this.g;
    const ev = g.events; g.events = [];
    for (const e of ev) {
      if (e.type === 'sfx') {
        if (e.x !== undefined) {
          const s = this.r.worldToScreen(e.x, e.y);
          if (s.x < 0 || s.y < 0 || s.x > this.r.W || s.y > this.r.H) continue;
        }
        if (e.owner !== undefined && e.owner !== g.humanIdx && e.sfx !== 'age') continue;
        Sfx.play(e.sfx);
      } else if (e.type === 'over') {
        this.showEnd(e.over);
      } else if (e.text) {
        this.addMsg(e.text, e.kind, e.x, e.y);
        if (e.x !== undefined && (e.kind === 'bad')) this.pings.push({ x: e.x, y: e.y, t: 0 });
      }
    }
  }
  addMsg(text, kind, x, y) {
    if (this.msgs.length && this.msgs[this.msgs.length - 1].text === text && this.msgs[this.msgs.length - 1].t < 2) return;
    this.msgs.push({ text, kind, x, y, t: 0 });
    if (this.msgs.length > 7) this.msgs.shift();
    this.msgDirty = true;
  }
  updateMsgs(dt) {
    let ch = this.msgDirty; this.msgDirty = false;
    for (const m of this.msgs) m.t += dt;
    const before = this.msgs.length;
    this.msgs = this.msgs.filter(m => m.t < 8);
    if (this.msgs.length !== before) ch = true;
    if (ch) {
      this.el.msgs.innerHTML = this.msgs.map(m => '<div class="m ' + (m.kind || '') + '"' + (m.x !== undefined ? ' data-x="' + m.x + '" data-y="' + m.y + '"' : '') + '>' + m.text + '</div>').join('');
    }
  }

  // ------------------------------------------------------------------ painel de informações
  renderInfo() {
    const g = this.g, p = g.human, el = this.el.info;
    const sel = this.sel;
    let html = '';
    if (!sel.length) {
      html = '<div class="idle"><h3>' + CIVS[p.civ].flag + ' ' + CIVS[p.civ].name + '</h3><p class="dim">' + CIVS[p.civ].bonuses.join('<br>') + '</p><p class="dim">Selecione unidades ou edifícios. Clique direito para comandar.</p></div>';
    } else if (sel.length === 1) {
      const e = sel[0];
      const own = e.owner === g.humanIdx;
      if (e.kind === 'unit') {
        const d = UNITS[e.type], s = e.s;
        const pl = g.players[e.owner];
        html = '<div class="one"><div class="portrait" style="border-color:' + pl.color + '">' + d.icon + '</div><div class="det"><h3>' + s.name + '</h3>'
          + '<div class="hpbar"><i style="width:' + Math.max(0, e.hp / e.maxhp * 100) + '%"></i><span>' + Math.ceil(e.hp) + ' / ' + e.maxhp + '</span></div>'
          + '<div class="stats">' + (s.atk > 0 ? '<span title="Ataque">⚔️ ' + Math.round(s.atk) + '</span>' : '') + '<span title="Armadura corpo a corpo / perfurante">🛡️ ' + s.armorM + '/' + s.armorP + '</span>'
          + (s.range ? '<span title="Alcance">🎯 ' + s.range + '</span>' : '') + '<span title="Visão">👁️ ' + Math.round(s.los) + '</span><span title="Velocidade">👟 ' + s.speed.toFixed(2) + '</span></div>'
          + (e.carry && e.carry.n > 0.5 ? '<div class="carry">Carregando: ' + RES_ICON[e.carry.res] + ' ' + Math.floor(e.carry.n) + '</div>' : '')
          + '<div class="own" style="color:' + pl.color + '">' + (own ? '' : pl.name + ' (' + CIVS[pl.civ].name + ')') + '</div></div></div>';
      } else if (e.kind === 'building') {
        const d = BUILDINGS[e.type], pl = g.players[e.owner];
        html = '<div class="one"><div class="portrait" style="border-color:' + pl.color + '">' + d.icon + '</div><div class="det"><h3>' + d.name + '</h3>'
          + '<div class="hpbar"><i style="width:' + Math.max(0, e.hp / e.maxhp * 100) + '%"></i><span>' + Math.ceil(e.hp) + ' / ' + e.maxhp + '</span></div>';
        if (!e.complete) html += '<div class="carry">Em construção: ' + Math.floor(e.progress * 100) + '%</div>';
        else if (e.type === 'farm') html += '<div class="carry">Comida restante: ' + RES_ICON.food + Math.ceil(e.amount) + '</div>';
        else if (d.pop) html += '<div class="carry">+' + d.pop + ' população</div>';
        if (e.s.atk > 0) html += '<div class="stats"><span>⚔️ ' + e.s.atk + '</span><span>🎯 ' + e.s.range + '</span><span>🛡️ ' + e.s.armorM + '/' + e.s.armorP + '</span></div>';
        if (!own) html += '<div class="own" style="color:' + pl.color + '">' + pl.name + ' (' + CIVS[pl.civ].name + ')</div>';
        html += '</div></div>';
        if (own && e.queue.length) {
          html += '<div class="queue">';
          e.queue.forEach((it, i) => {
            const ic = it.k === 'unit' ? UNITS[it.id].icon : TECHS[it.id].icon;
            const nm = it.k === 'unit' ? UNITS[it.id].name : TECHS[it.id].name;
            html += '<div class="qi" title="' + nm + ' (clique para cancelar)" data-cancel="' + i + '" data-b="' + e.id + '">' + ic + (i === 0 ? '<u style="width:' + (100 - it.t / it.total * 100) + '%"></u>' : '') + '</div>';
          });
          html += '</div>';
        }
      }
    } else {
      html = '<div class="multi">';
      for (const e of sel.slice(0, 40)) {
        const ic = e.kind === 'unit' ? UNITS[e.type].icon : BUILDINGS[e.type].icon;
        html += '<div class="mi" data-sel="' + e.id + '" title="' + (e.kind === 'unit' ? e.s.name : BUILDINGS[e.type].name) + '">' + ic + '<u style="width:' + Math.max(0, e.hp / e.maxhp * 100) + '%"></u></div>';
      }
      html += '</div><div class="dim" style="padding:2px 8px">' + sel.length + ' selecionados</div>';
    }
    if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
    // recurso / animal selecionado (informativo)
  }

  renderCard() {
    this.cells = this.getCells();
    const sig = this.cells.map(c => c ? (c.icon + (c.enabled ? 1 : 0) + (c.locked ? 'L' : '') + (c.name || '')) : '.').join('|') + (this.cmdMode || '') + (this.placing ? 'P' : '');
    if (sig !== this.cardSig) {
      this.cardSig = sig;
      this.el.card.innerHTML = this.cells.map((c, i) => c
        ? '<div class="cell ' + (c.enabled ? '' : 'dis') + (c.locked ? ' lock' : '') + (this.cmdMode === 'attackmove' && i === 0 ? ' active' : '') + '" data-i="' + i + '"><span class="ico">' + c.icon + '</span><span class="hk">' + HK[i] + '</span>' + (c.locked ? '<span class="lk">🔒</span>' : '') + '</div>'
        : '<div class="cell empty"></div>').join('');
    }
    if (this.hoverCell >= 0 && !this.el.tip.hidden) {
      const c = this.cells[this.hoverCell];
      if (c) this.el.tip.innerHTML = c.tip || c.name; else this.el.tip.hidden = true;
    }
  }

  // ------------------------------------------------------------------ minimapa
  drawMinimap() {
    const g = this.g, n = g.n, ctx = this.mmCtx;
    const W = 240, H = 120, k = W / (2 * n);
    if (this.mmDraw <= 0) {
      this.mmDraw = 0.5;
      const d = this.mmImg.data, w = g.world;
      for (let i = 0; i < n * n; i++) {
        let r, gg, b;
        const t = w.terrain[i];
        if (t === T_WATER) { r = 40; gg = 90; b = 160; }
        else if (t === T_DIRT) { r = 120; gg = 100; b = 60; }
        else { r = 52; gg = 110; b = 44; }
        const o = w.occ[i];
        if (o) {
          const e = g.ents.get(o);
          if (e) {
            if (e.kind === 'res') {
              if (e.type === 'tree') { r = 22; gg = 70; b = 28; } else if (e.type === 'gold') { r = 240; gg = 200; b = 50; } else if (e.type === 'stone') { r = 150; gg = 150; b = 160; } else if (e.type === 'berry') { r = 200; gg = 50; b = 70; }
            } else if (e.kind === 'building') {
              if (g.canSee(e)) { const c = parseInt(g.players[e.owner].color.slice(1), 16); r = c >> 16; gg = (c >> 8) & 255; b = c & 255; }
            }
          }
        }
        d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
      this.mmTerrCtx.putImageData(this.mmImg, 0, 0);
    }
    this.mmDraw -= 1 / 60;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(k, k / 2, -k, k / 2, W / 2, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mmTerr, 0, 0, n, n);
    if (g.st.fog !== false) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.r.fogCv, 0, 0, n, n); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const mp = (x, y) => [(x - y) * k + W / 2, (x + y) * k / 2];
    // unidades
    for (const u of g.units) {
      if (u.dead || !g.canSee(u)) continue;
      const [x, y] = mp(u.x, u.y);
      ctx.fillStyle = g.players[u.owner].color;
      ctx.fillRect(x - 1, y - 1, 2.2, 2.2);
    }
    // alertas
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]; p.t += 1 / 60;
      if (p.t > 3) { this.pings.splice(i, 1); continue; }
      const [x, y] = mp(p.x, p.y);
      ctx.strokeStyle = 'rgba(255,60,50,' + (1 - p.t / 3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 3 + (p.t * 8) % 12, 0, 6.2832); ctx.stroke();
    }
    // área visível
    const r = this.r;
    const cs = [r.screenToWorld(0, 0), r.screenToWorld(r.W, 0), r.screenToWorld(r.W, r.H), r.screenToWorld(0, r.H)];
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath();
    cs.forEach((c, i) => { const [x, y] = mp(clamp(c.x, 0, n), clamp(c.y, 0, n)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
  }

  // ------------------------------------------------------------------ fim de jogo / menu
  get overlayOpen() { return !this.el.overlay.hidden; }
  closeOverlay() { this.el.overlay.hidden = true; this.menuOpen = false; this.paused = this.wasPaused; this.el.banner.hidden = !this.paused; }
  openMenu() {
    if (this.overlayOpen) return;
    this.wasPaused = this.paused; this.paused = true; this.menuOpen = true;
    const o = this.el.overlay;
    o.hidden = false;
    o.innerHTML = '<div class="dlg"><h2>Menu do Jogo</h2>'
      + '<button data-a="resume">Continuar</button>'
      + '<div class="row"><label>Velocidade</label><select id="sp">' + [1, 1.7, 2.5, 4].map(s => '<option ' + (s === this.g.speedMul ? 'selected' : '') + ' value="' + s + '">' + s + 'x</option>').join('') + '</select></div>'
      + '<div class="row"><label>Som</label><input type="checkbox" id="snd" ' + (Sfx.enabled ? 'checked' : '') + '></div>'
      + '<div class="row"><label>Neblina de guerra</label><span class="dim">' + (this.g.st.fog === false ? 'desligada' : 'ligada') + '</span></div>'
      + '<button data-a="restart">Reiniciar partida</button><button data-a="quit" class="danger">Sair para o menu</button></div>';
    o.querySelector('#sp').onchange = e => { this.g.speedMul = +e.target.value; };
    o.querySelector('#snd').onchange = e => { Sfx.enabled = e.target.checked; };
    o.onclick = e => {
      const a = e.target.dataset.a;
      if (a === 'resume') this.closeOverlay();
      else if (a === 'restart') { if (this.hooks.restart) this.hooks.restart(); }
      else if (a === 'quit') { if (this.hooks.quit) this.hooks.quit(); }
    };
  }
  showEnd(over) {
    const g = this.g;
    const o = this.el.overlay;
    this.overlayOpen2 = true;
    this.wasPaused = false;
    this.menuOpen = false;
    o.hidden = false;
    let rows = '';
    const score = p => Math.round(p.stats.kills * 5 + p.stats.built * 3 + p.stats.trained + (p.stats.gathered.food + p.stats.gathered.wood + p.stats.gathered.gold + p.stats.gathered.stone) / 60 + p.stats.techs * 8);
    for (const p of g.players) {
      rows += '<tr style="color:' + p.color + '"><td>' + p.name + '</td><td>' + CIVS[p.civ].name + '</td><td>' + (p.eliminated ? '☠️' : '✔') + '</td><td>' + p.stats.kills + '</td><td>' + p.stats.lost + '</td><td>' + p.stats.built + '</td><td>' + p.stats.trained + '</td><td>' + Math.floor(p.stats.gathered.food + p.stats.gathered.wood + p.stats.gathered.gold + p.stats.gathered.stone) + '</td><td>' + score(p) + '</td></tr>';
    }
    o.innerHTML = '<div class="dlg wide ' + (over.win ? 'win' : 'lose') + '"><h1>' + (over.win ? '🏆 Vitória!' : '💀 Derrota') + '</h1>'
      + '<p class="dim">Duração: ' + fmtTime(over.time) + '</p>'
      + '<table><tr><th>Jogador</th><th>Civ.</th><th></th><th>Abates</th><th>Perdas</th><th>Construções</th><th>Treinadas</th><th>Recursos</th><th>Pontos</th></tr>' + rows + '</table>'
      + '<div class="btns"><button data-a="watch">Continuar observando</button><button data-a="again">Jogar novamente</button><button data-a="quit" class="danger">Menu principal</button></div></div>';
    o.onclick = e => {
      const a = e.target.dataset.a;
      if (a === 'watch') { o.hidden = true; this.g.over.reveal = true; this.g.over.watch = true; this.g.updateVision(true); this.hudTimer = 0; }
      else if (a === 'again') { if (this.hooks.restart) this.hooks.restart(); }
      else if (a === 'quit') { if (this.hooks.quit) this.hooks.quit(over); }
    };
    if (this.hooks.over) this.hooks.over(over);
    Sfx.play(over.win ? 'win' : 'lose');
  }
}

function g_notify(g, text) { g.events.push({ text, kind: 'info' }); }
Game.prototype.humanUnitName = function (p, id) { const u = this.units.find(x => x.type === id && x.owner === p.idx); return u ? u.s.name : UNITS[id].name; };
