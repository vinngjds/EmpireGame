'use strict';
// Renderização isométrica em canvas 2D com sprites desenhados proceduralmente

const HW = 32, HH = 16;
const isoX = (x, y) => (x - y) * HW;
const isoY = (x, y) => (x + y) * HH;

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function ell(ctx, x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.fillStyle = fill; ctx.fill();
}
function line(ctx, x0, y0, x1, y1, col, w) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.stroke();
}

// paletas de construção por era
const AGE_STYLE = [
  { wall: '#a37a4a', roof: '#c9a85a', trim: '#6e4f2c' },   // trevas: madeira e palha
  { wall: '#b69a6e', roof: '#a6523a', trim: '#7a5a38' },   // feudal: telhas
  { wall: '#bdb7a8', roof: '#7d4a3e', trim: '#8c8576' },   // castelos: pedra
  { wall: '#dcd8cf', roof: '#3f5f8c', trim: '#d4b14a' },   // imperial: mármore
];

const TYPE_ROOF = { barracks: '#9a3f35', archeryrange: '#3f7a40', stable: '#7a5430', blacksmith: '#555a64', market: '#8a4f8f', siegeworkshop: '#6a5232', tower: '#6b6f78', castle: '#58606e', mill: '#b89a58', lumbercamp: '#8a6236', miningcamp: '#7a7f88' };

class Renderer {
  constructor(canvas, game, ui) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.g = game; this.ui = ui;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.fogCv = document.createElement('canvas'); this.fogCv.width = this.fogCv.height = game.n;
    this.fogCtx = this.fogCv.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(game.n, game.n);
    this.fogTick = -1;
    this.time = 0;
    this.W = 0; this.H = 0;
    this.markers = [];
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = this.cv.clientWidth; this.H = this.cv.clientHeight;
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
  }
  // conversões ----------------------------------------------------------------
  screenToWorld(px, py) {
    const ix = (px - this.W / 2) / this.cam.zoom + this.cam.x;
    const iy = (py - this.H / 2) / this.cam.zoom + this.cam.y;
    return { x: (ix / HW + iy / HH) / 2, y: (iy / HH - ix / HW) / 2 };
  }
  worldToScreen(x, y, z) {
    return { x: (isoX(x, y) - this.cam.x) * this.cam.zoom + this.W / 2, y: (isoY(x, y) - (z || 0) - this.cam.y) * this.cam.zoom + this.H / 2 };
  }
  centerOn(x, y) { this.cam.x = isoX(x, y); this.cam.y = isoY(x, y); this.clampCam(); }
  clampCam() {
    const n = this.g.n;
    this.cam.x = clamp(this.cam.x, -n * HW, n * HW);
    this.cam.y = clamp(this.cam.y, 0, n * HH * 2);
  }

  // ---------------------------------------------------------------- frame
  draw(alpha, ts) {
    const g = this.g, ctx = this.ctx, cam = this.cam;
    this.time = ts / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(this.W / 2, this.H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
    // limites visíveis em coordenadas de tile
    const c = [this.screenToWorld(0, 0), this.screenToWorld(this.W, 0), this.screenToWorld(0, this.H), this.screenToWorld(this.W, this.H)];
    const n = g.n;
    this.tx0 = clamp(Math.floor(Math.min(c[0].x, c[1].x, c[2].x, c[3].x)) - 2, 0, n - 1);
    this.tx1 = clamp(Math.ceil(Math.max(c[0].x, c[1].x, c[2].x, c[3].x)) + 2, 0, n - 1);
    this.ty0 = clamp(Math.floor(Math.min(c[0].y, c[1].y, c[2].y, c[3].y)) - 2, 0, n - 1);
    this.ty1 = clamp(Math.ceil(Math.max(c[0].y, c[1].y, c[2].y, c[3].y)) + 2, 0, n - 1);
    this.view = { x0: cam.x - this.W / 2 / cam.zoom - 90, x1: cam.x + this.W / 2 / cam.zoom + 90, y0: cam.y - this.H / 2 / cam.zoom - 110, y1: cam.y + this.H / 2 / cam.zoom + 90 };

    this.drawTerrain();
    this.drawGroundMarks();
    this.drawEntities(alpha);
    this.drawProjectilesAndFx(alpha);
    this.drawFog();
    this.drawPlacement();
    ctx.restore();
    this.drawScreenOverlay();
  }

  // ---------------------------------------------------------------- terreno
  drawTerrain() {
    const g = this.g, w = g.world, ctx = this.ctx, n = g.n;
    const np = w.palette.length;
    if (!this.pbuf || this.pbuf.length !== np) this.pbuf = Array.from({ length: np }, () => []);
    const buf = this.pbuf;
    for (let k = 0; k < np; k++) buf[k].length = 0;
    const V = this.view;
    const deco = [];
    for (let ty = this.ty0; ty <= this.ty1; ty++) {
      for (let tx = this.tx0; tx <= this.tx1; tx++) {
        const i = ty * n + tx;
        const sx = isoX(tx, ty), sy = isoY(tx, ty);
        if (sx < V.x0 || sx > V.x1 || sy < V.y0 || sy > V.y1) continue;
        buf[w.cidx[i]].push(sx, sy);
        if (w.terrain[i] === T_WATER || w.tuft[i]) deco.push(i, sx, sy);
      }
    }
    for (let k = 0; k < np; k++) {
      const a = buf[k];
      if (!a.length) continue;
      ctx.fillStyle = w.palette[k];
      ctx.beginPath();
      for (let j = 0; j < a.length; j += 2) {
        const sx = a[j], sy = a[j + 1];
        ctx.moveTo(sx, sy - 0.5); ctx.lineTo(sx + HW + 0.6, sy + HH); ctx.lineTo(sx, sy + 2 * HH + 0.5); ctx.lineTo(sx - HW - 0.6, sy + HH); ctx.closePath();
      }
      ctx.fill();
    }
    // decoração: reflexos na água e tufos de grama
    ctx.beginPath(); ctx.strokeStyle = 'rgba(30,70,20,0.55)'; ctx.lineWidth = 1;
    for (let j = 0; j < deco.length; j += 3) {
      const i = deco[j], sx = deco[j + 1], sy = deco[j + 2];
      if (w.terrain[i] === T_WATER) continue;
      ctx.moveTo(sx - 4, sy + HH + 3); ctx.lineTo(sx - 5, sy + HH - 2); ctx.moveTo(sx - 2, sy + HH + 3); ctx.lineTo(sx - 2, sy + HH - 3); ctx.moveTo(sx, sy + HH + 3); ctx.lineTo(sx + 1, sy + HH - 2);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let j = 0; j < deco.length; j += 3) {
      const i = deco[j];
      if (w.terrain[i] !== T_WATER) continue;
      const tx = i % n, ty = (i / n) | 0;
      if (Math.sin(this.time * 1.5 + tx * 0.7 + ty * 0.5) > 0.6) ctx.fillRect(deco[j + 1] - 6, deco[j + 2] + HH - 1, 12, 2);
    }
  }

  drawGroundMarks() {
    const ctx = this.ctx, g = this.g;
    // marcadores de clique
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i]; m.t += 1 / 60;
      if (m.t > 0.7) { this.markers.splice(i, 1); continue; }
      const k = m.t / 0.7;
      ctx.strokeStyle = m.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(isoX(m.x, m.y), isoY(m.x, m.y), 6 + k * 14, 3 + k * 7, 0, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- entidades
  drawEntities(alpha) {
    const g = this.g, ctx = this.ctx, ui = this.ui;
    const list = this.list || (this.list = []);
    list.length = 0;
    const V = this.view;
    const sel = ui ? ui.selSet : null;
    const push = (e, x, y, d) => {
      const sx = isoX(x, y), sy = isoY(x, y);
      if (sx < V.x0 || sx > V.x1 || sy < V.y0 || sy > V.y1 + 60) return;
      list.push({ e, d, sx, sy });
    };
    for (const e of g.ents.values()) {
      if (e.dead) continue;
      if (e.kind === 'unit' || e.kind === 'animal') {
        if (!g.canSee(e)) continue;
        const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha);
        push(e, x, y, x + y);
      } else if (e.kind === 'building') {
        if (!g.canSee(e)) continue;
        // profundidade: canto frontal do prédio menos metade
        push(e, e.x, e.y, e.x + e.y + (e.w - 1) * 0.05);
      } else if (e.kind === 'res') {
        if (!g.canSee(e)) continue;
        push(e, e.x, e.y, e.x + e.y - (e.type === 'carcass' ? 0.2 : 0));
      }
    }
    list.sort((a, b) => a.d - b.d);
    this.bars = [];
    for (const it of list) {
      const e = it.e;
      const selected = sel && sel.has(e.id);
      if (e.kind === 'unit') this.drawUnit(e, it.sx, it.sy, alpha, selected);
      else if (e.kind === 'building') this.drawBuilding(e, selected);
      else if (e.kind === 'res') this.drawResource(e);
      else if (e.kind === 'animal') this.drawAnimal(e, it.sx, it.sy);
    }
    // pontos de encontro dos edifícios selecionados
    if (sel) for (const it of list) {
      const e = it.e;
      if (e.kind !== 'building' || !sel.has(e.id) || !e.rally || e.owner !== g.humanIdx) continue;
      ctx.setLineDash([5, 4]); line(ctx, isoX(e.x, e.y), isoY(e.x, e.y), isoX(e.rally.x, e.rally.y), isoY(e.rally.x, e.rally.y), 'rgba(120,210,255,0.8)', 1.5); ctx.setLineDash([]);
      this.flag(e.rally.x, e.rally.y, '#4fc3ff', 0);
    }
    // barras de vida
    for (const b of this.bars) {
      const w = b.w;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(b.x - w / 2 - 1, b.y - 1, w + 2, 5);
      ctx.fillStyle = b.f > 0.5 ? '#4cd964' : b.f > 0.25 ? '#e8c03a' : '#e5483c';
      if (b.col) ctx.fillStyle = b.col;
      ctx.fillRect(b.x - w / 2, b.y, w * b.f, 3);
    }
  }

  // ---- unidades
  drawUnit(u, sx, sy, alpha, selected) {
    const ctx = this.ctx, def = UNITS[u.type], p = this.g.players[u.owner];
    const col = p.color;
    const s = def.scale || 1;
    ctx.save();
    ctx.translate(sx, sy);
    if (selected) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 11 * s, 5.5 * s, 0, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = 'rgba(80,255,120,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 12 * s, 6 * s, 0, 0, 6.2832); ctx.stroke();
    }
    ell(ctx, 0, 1, 7.5 * s, 3.6 * s, 'rgba(0,0,0,0.28)');
    const fdx = Math.cos(u.face) - Math.sin(u.face);
    const dir = fdx >= 0 ? 1 : -1;
    const walk = u.moving ? Math.sin(u.anim * 10) : 0;
    const bob = u.moving ? Math.abs(walk) * 1.4 : 0;
    const swing = u.atkT > 0 ? Math.sin((1 - u.atkT / 0.35) * Math.PI) : 0;
    ctx.scale(dir, 1);
    const hit = u.hitT > 0;
    const cls = def.cls;
    const dark = shade(col, -0.35), light = shade(col, 0.25);
    if (cls.indexOf('cavalry') >= 0) this.spriteCavalry(ctx, u, def, col, walk, bob, swing, s);
    else if (u.type === 'ram') this.spriteRam(ctx, u, walk, swing);
    else if (u.type === 'mangonel') this.spriteMangonel(ctx, u, swing);
    else if (u.type === 'king') this.spriteKing(ctx, col, bob, walk);
    else if (u.type === 'villager') this.spriteVillager(ctx, u, col, walk, bob, swing);
    else this.spriteSoldier(ctx, u, def, col, dark, light, walk, bob, swing);
    ctx.restore();
    // barra de vida
    if (selected || u.hp < u.maxhp) this.bars.push({ x: sx, y: sy - 30 * s, w: 18, f: Math.max(0, u.hp / u.maxhp) });
  }
  spriteVillager(ctx, u, col, walk, bob, swing) {
    const y = -bob;
    // pernas
    line(ctx, -1.5, -5 + y, -1.5 + walk * 2, 0, '#4a3a2a', 2);
    line(ctx, 1.5, -5 + y, 1.5 - walk * 2, 0, '#4a3a2a', 2);
    // corpo
    ctx.fillStyle = col; ctx.fillRect(-3.5, -13 + y, 7, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-3.5, -13 + y, 2, 9);
    // cabeça
    ell(ctx, 0, -16.5 + y, 3.1, 3.3, '#e0b48c');
    ell(ctx, 0, -18 + y, 3.4, 2.2, '#6a4a2a');
    // braço + ferramenta
    const o = u.order;
    let tool = null, ang = 0;
    if (o && o.type === 'gather' && u.working) { tool = o.rkey; ang = Math.sin(u.anim * 9) * 0.9; }
    else if (o && o.type === 'build' && u.working) { tool = 'build'; ang = Math.sin(u.anim * 11) * 0.9; }
    else if (u.atkT > 0) { tool = 'sword'; ang = swing * 1.4; }
    if (tool) {
      const hx = 5 + Math.sin(ang) * 3, hy = -10 + Math.cos(ang) * 2 - Math.abs(Math.sin(ang)) * 4 + y;
      line(ctx, 3, -11 + y, hx, hy, '#e0b48c', 1.6);
      if (tool === 'wood') { line(ctx, hx, hy, hx + 3, hy - 5 - Math.sin(ang) * 2, '#6b4a2a', 1.5); poly(ctx, [hx + 2, hy - 6, hx + 6, hy - 5, hx + 4, hy - 2], '#b8bec6'); }
      else if (tool === 'gold' || tool === 'stone') { line(ctx, hx, hy, hx + 4, hy - 4, '#6b4a2a', 1.5); line(ctx, hx + 2, hy - 6, hx + 6, hy - 2, '#a8adb5', 2); }
      else if (tool === 'build') { line(ctx, hx, hy, hx + 3, hy - 3, '#6b4a2a', 1.5); ctx.fillStyle = '#7a7f87'; ctx.fillRect(hx + 1, hy - 6, 5, 3); }
      else if (tool === 'farm') { line(ctx, hx, hy, hx + 4, hy - 7, '#8a6a3a', 1.2); line(ctx, hx + 2, hy - 7, hx + 6, hy - 7, '#8a6a3a', 1.2); }
      else if (tool === 'sword') { line(ctx, hx, hy, hx + 6, hy - 6, '#d8dde4', 1.6); }
      else { line(ctx, hx, hy, hx + 3, hy - 4, '#6b4a2a', 1.5); }
    } else {
      line(ctx, 3, -11 + y, 4, -7 + y, '#e0b48c', 1.6);
    }
    // carga
    if (u.carry && u.carry.n > 1) {
      const rc = RES_COLOR[u.carry.res] || '#fff';
      ctx.fillStyle = rc; ctx.fillRect(-7, -13 + y, 4, 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; ctx.strokeRect(-7, -13 + y, 4, 5);
    }
    // cabeça do arco/fazendeiro etc. nenhuma
  }
  spriteSoldier(ctx, u, def, col, dark, light, walk, bob, swing) {
    const y = -bob;
    const cls = def.cls;
    const ranged = cls.indexOf('ranged') >= 0;
    const archer = cls.indexOf('archer') >= 0;
    const unique = cls.indexOf('unique') >= 0;
    const tier = u.s.tier || 0;
    line(ctx, -1.8, -5 + y, -1.8 + walk * 2.2, 0, '#3a3a40', 2.2);
    line(ctx, 1.8, -5 + y, 1.8 - walk * 2.2, 0, '#3a3a40', 2.2);
    // corpo/armadura
    const armorCol = archer ? shade(col, -0.1) : (tier >= 2 ? '#9aa1ad' : tier === 1 ? '#7d838f' : shade(col, -0.05));
    ctx.fillStyle = armorCol; ctx.fillRect(-4, -14 + y, 8, 10);
    ctx.fillStyle = col; ctx.fillRect(-4, -14 + y, 8, 3);       // tabardo na cor do jogador
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-4, -14 + y, 2, 10);
    // cabeça + elmo
    ell(ctx, 0, -17.5 + y, 3.1, 3.2, '#e0b48c');
    if (archer) { poly(ctx, [-3.5, -17 + y, 0, -23 + y, 3.5, -17 + y], shade(col, -0.2)); }
    else {
      ctx.fillStyle = unique ? '#d4b14a' : (tier >= 1 ? '#aeb4bf' : '#8a8f99');
      ctx.beginPath(); ctx.arc(0, -18 + y, 3.6, Math.PI, 0); ctx.fill();
      if (unique) { line(ctx, 0, -22 + y, 0, -26 + y, '#e04a3a', 2); }
    }
    // arma
    const sw = swing;
    if (def.id === 'spearman') {
      const ext = sw * 5;
      line(ctx, 3 - 2 + ext, -8 + y, 9 + ext, -26 + y + ext * 0.6, '#7a5a34', 1.6);
      poly(ctx, [8.5 + ext, -26 + y + ext * 0.6, 10 + ext, -30 + y + ext * 0.6, 11.5 + ext, -26 + y + ext * 0.6], '#cfd5dc');
    } else if (archer || ranged) {
      // arco
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(6, -11 + y, 7, -1.2, 1.2); ctx.stroke();
      const pull = u.atkT > 0 ? 3 * Math.sin((1 - u.atkT / 0.35) * Math.PI) : 0;
      line(ctx, 6 + 7 * Math.cos(-1.2), -11 + y + 7 * Math.sin(-1.2), 4 - pull, -11 + y, '#e8e4d8', 0.8);
      line(ctx, 6 + 7 * Math.cos(1.2), -11 + y + 7 * Math.sin(1.2), 4 - pull, -11 + y, '#e8e4d8', 0.8);
      if (def.id === 'janissary') { line(ctx, 2, -10 + y, 11, -13 + y, '#3a2a1a', 2); }
    } else {
      // espada + escudo
      const a = -1 + sw * 2.2;
      const hx = 5, hy = -10 + y;
      line(ctx, hx, hy, hx + Math.cos(a) * 9, hy + Math.sin(a) * 9 - 3, '#dfe4ea', 2);
      line(ctx, hx - 1, hy, hx + 2, hy, '#8a6a3a', 1.5);
      ell(ctx, -4.5, -9 + y, 3, 4.2, dark);
      ell(ctx, -4.5, -9 + y, 1.4, 2.2, light);
    }
  }
  spriteCavalry(ctx, u, def, col, walk, bob, swing, s) {
    const y = -bob * 1.2;
    const eleph = def.id === 'elephant';
    const horse = eleph ? '#7c7c86' : (def.id === 'scout' ? '#b88a52' : def.id === 'mangudai' ? '#8a6038' : '#5e3f27');
    const hd = shade(horse, -0.25);
    if (eleph) {
      const L = 1.4;
      line(ctx, -9, -8 + y, -9 + walk * 3, 0, hd, 5); line(ctx, 8, -8 + y, 8 - walk * 3, 0, hd, 5);
      line(ctx, -5, -8 + y, -5 - walk * 3, 0, hd, 5); line(ctx, 4, -8 + y, 4 + walk * 3, 0, hd, 5);
      ell(ctx, 0, -14 + y, 15, 9, horse);
      ell(ctx, 12, -16 + y, 6, 5.5, horse);
      line(ctx, 15, -15 + y, 18 + swing * 3, -6 + y, hd, 3.2);
      line(ctx, 14, -13 + y, 19, -11 + y, '#f2efe6', 2);
      ell(ctx, 3, -21 + y, 8, 3.5, col);
      // condutor
      ctx.fillStyle = col; ctx.fillRect(-1, -29 + y, 6, 8); ell(ctx, 2, -31 + y, 3, 3.2, '#e0b48c');
      line(ctx, 5, -26 + y, 11 + swing * 4, -34 + y, '#7a5a34', 1.6);
      return;
    }
    line(ctx, -7, -6 + y, -7 + walk * 3, 0, hd, 2); line(ctx, -4, -6 + y, -4 - walk * 3, 0, hd, 2);
    line(ctx, 5, -6 + y, 5 - walk * 3, 0, hd, 2); line(ctx, 8, -6 + y, 8 + walk * 3, 0, hd, 2);
    ell(ctx, 0, -9 + y, 10, 4.8, horse);
    poly(ctx, [7, -11 + y, 12, -17 + y, 15, -15 + y, 11, -8 + y], horse);
    ell(ctx, 14, -16 + y, 3, 2.1, hd);
    line(ctx, -10, -10 + y, -13, -6 + y + Math.abs(walk) * 2, hd, 1.8);
    if (def.id !== 'scout') { ctx.fillStyle = col; ctx.fillRect(-4, -9 + y, 8, 3); }
    // cavaleiro
    ctx.fillStyle = def.id === 'knight' ? '#8f95a1' : shade(col, -0.05); ctx.fillRect(-3, -19 + y, 6, 10);
    ctx.fillStyle = col; ctx.fillRect(-3, -19 + y, 6, 3);
    ell(ctx, 0, -22 + y, 3, 3.1, '#e0b48c');
    ctx.fillStyle = def.id === 'knight' ? '#aab0bb' : shade(col, -0.2); ctx.beginPath(); ctx.arc(0, -22.5 + y, 3.4, Math.PI, 0); ctx.fill();
    if (def.cls.indexOf('ranged') >= 0) {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(7, -17 + y, 6, -1.2, 1.2); ctx.stroke();
    } else {
      line(ctx, 4, -15 + y, 18 + swing * 6, -24 + y - swing * 2, '#7a5a34', 1.6);
      poly(ctx, [18 + swing * 6, -24.5 + y, 22 + swing * 6, -26 + y, 18.5 + swing * 6, -22.5 + y], '#d5dae1');
    }
  }
  spriteRam(ctx, u, walk, swing) {
    const ext = swing * 6;
    ell(ctx, 0, -2, 14, 5, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#6e4a2a'; poly(ctx, [-14, -14, 6, -16, 12, -8, -8, -6], '#7a5632');
    poly(ctx, [-14, -14, -8, -6, -8, -12, -14, -18], '#5a3c20');
    poly(ctx, [-14, -18, 6, -20, 6, -16, -14, -14], '#92683a');
    ell(ctx, -6, -1, 3, 1.8, '#3a2a1a'); ell(ctx, 8, -1, 3, 1.8, '#3a2a1a');
    line(ctx, -2 + ext, -11, 18 + ext, -6 + ext * 0.4, '#5a4026', 4);
    poly(ctx, [17 + ext, -9 + ext * 0.4, 22 + ext, -6 + ext * 0.4, 17 + ext, -3 + ext * 0.4], '#6d737c');
  }
  spriteMangonel(ctx, u, swing) {
    ell(ctx, 0, -2, 13, 5, 'rgba(0,0,0,0.2)');
    poly(ctx, [-12, -4, 10, -8, 14, -4, -8, 0], '#7a5632');
    ell(ctx, -5, -1, 4, 2.2, '#3a2a1a'); ell(ctx, 8, -3, 4, 2.2, '#3a2a1a');
    line(ctx, -2, -6, -2, -18, '#5a3c20', 3); line(ctx, 6, -8, 6, -18, '#5a3c20', 3);
    const a = -0.9 + swing * 1.9;
    line(ctx, 2, -17, 2 + Math.cos(a) * 13, -17 + Math.sin(a) * 13, '#a07a46', 2.4);
    ell(ctx, 2 + Math.cos(a) * 13, -17 + Math.sin(a) * 13, 2.6, 2.6, '#6e7178');
  }
  spriteKing(ctx, col, bob, walk) {
    const y = -bob;
    line(ctx, -1.8, -5 + y, -1.8 + walk * 2, 0, '#3a3a40', 2.2); line(ctx, 1.8, -5 + y, 1.8 - walk * 2, 0, '#3a3a40', 2.2);
    poly(ctx, [-5, -15 + y, 5, -15 + y, 7, -3 + y, -7, -3 + y], col);
    ctx.fillStyle = '#d9b23a'; ctx.fillRect(-4, -14 + y, 8, 8);
    ctx.fillStyle = '#7a1a1a'; ctx.fillRect(-4, -11 + y, 8, 2);
    ell(ctx, 0, -18 + y, 3.3, 3.4, '#e0b48c');
    poly(ctx, [-3.5, -20 + y, -3.5, -25 + y, -1.7, -22.5 + y, 0, -26 + y, 1.7, -22.5 + y, 3.5, -25 + y, 3.5, -20 + y], '#f2cf45');
  }
  drawAnimal(a, sx, sy) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(sx, sy);
    const fdx = Math.cos(a.face || 0) - Math.sin(a.face || 0);
    ctx.scale(fdx >= 0 ? 1 : -1, 1);
    const walk = a.moving ? Math.sin(this.time * 12 + a.id) : 0;
    ell(ctx, 0, 1, 8, 3.4, 'rgba(0,0,0,0.25)');
    const c = a.hitT > 0 ? '#e8b080' : '#a9743f';
    line(ctx, -5, -5, -5 + walk * 2.5, 0, '#6b4724', 1.6); line(ctx, -2, -5, -2 - walk * 2.5, 0, '#6b4724', 1.6);
    line(ctx, 3, -5, 3 - walk * 2.5, 0, '#6b4724', 1.6); line(ctx, 6, -5, 6 + walk * 2.5, 0, '#6b4724', 1.6);
    ell(ctx, 0, -8, 8, 4, c);
    poly(ctx, [5, -9, 8, -15, 10, -14, 8, -8], c);
    ell(ctx, 10, -15, 2.3, 1.7, '#8a5a2e');
    line(ctx, 9, -17, 8, -21, '#d9c9a0', 1); line(ctx, 10, -17, 11, -21, '#d9c9a0', 1);
    ctx.restore();
    if (a.hp < a.maxhp) this.bars.push({ x: sx, y: sy - 24, w: 14, f: a.hp / a.maxhp });
  }

  // ---- recursos
  drawResource(r) {
    const ctx = this.ctx;
    const sx = isoX(r.x, r.y), sy = isoY(r.x, r.y);
    ctx.save(); ctx.translate(sx, sy + 2);
    if (r.type === 'tree') {
      const v = r.v;
      const sc = r.amount < 40 ? 0.45 : 1;
      ell(ctx, 0, 1, 11 * sc, 5 * sc, 'rgba(0,0,0,0.25)');
      if (sc < 1) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2, -5, 4, 5); ell(ctx, 0, -5, 3, 1.5, '#8a6a3e'); }
      else {
        const pine = v % 2 === 0;
        ctx.fillStyle = '#5c3f22'; ctx.fillRect(-2, -12, 4, 12);
        if (pine) {
          const g1 = ['#1f5a2c', '#226632', '#2a7339', '#1d5428'][v];
          poly(ctx, [-11, -9, 0, -26, 11, -9], g1);
          poly(ctx, [-9, -17, 0, -36, 9, -17], shade(g1, 0.08));
          poly(ctx, [-6, -26, 0, -42, 6, -26], shade(g1, 0.16));
        } else {
          const g1 = ['#2d7a35', '#357f2c', '#3b8a3a', '#2a6f33'][v];
          ell(ctx, 0, -22, 12, 11, shade(g1, -0.15));
          ell(ctx, -3, -26, 10, 9, g1);
          ell(ctx, 3, -28, 7, 6, shade(g1, 0.14));
        }
      }
    } else if (r.type === 'gold' || r.type === 'stone') {
      const gold = r.type === 'gold';
      const f = Math.max(0.55, r.amount / r.max);
      ell(ctx, 0, 1, 14 * f, 6 * f, 'rgba(0,0,0,0.28)');
      const base = gold ? '#8d8576' : '#8e939c';
      poly(ctx, [-12 * f, 0, -9 * f, -12 * f, 0, -17 * f, 9 * f, -11 * f, 12 * f, 0, 0, 5], base);
      poly(ctx, [0, 5, 12 * f, 0, 9 * f, -11 * f, 0, -17 * f], shade(base, -0.2));
      poly(ctx, [-12 * f, 0, -9 * f, -12 * f, 0, -17 * f, -2, -6], shade(base, 0.18));
      if (gold) {
        for (const [px, py, s] of [[-5, -8, 3], [3, -11, 3.2], [5, -4, 2.6], [-2, -3, 2.4]]) {
          poly(ctx, [px * f, py * f - s, px * f + s, py * f, px * f, py * f + s, px * f - s, py * f], '#f5cd3a');
          poly(ctx, [px * f, py * f - s, px * f + s * 0.4, py * f - s * 0.2, px * f - s * 0.5, py * f - s * 0.2], '#fff0a0');
        }
      } else {
        poly(ctx, [-6, -4, -3, -9, 2, -7, 0, -2], '#b8bcc4');
        poly(ctx, [3, -3, 6, -8, 9, -4, 7, 0], '#a4a8b0');
      }
    } else if (r.type === 'berry') {
      ell(ctx, 0, 1, 10, 4.4, 'rgba(0,0,0,0.25)');
      const f = Math.max(0.5, r.amount / r.max);
      ell(ctx, 0, -5, 9 * f, 7 * f, '#2f6a2a'); ell(ctx, -3, -7, 6 * f, 5 * f, '#3d8236'); ell(ctx, 3, -6, 5 * f, 4.5 * f, '#357832');
      for (const [px, py] of [[-4, -6], [2, -9], [4, -4], [-1, -3], [-6, -3], [6, -8]]) { ctx.fillStyle = '#d8283a'; ctx.beginPath(); ctx.arc(px * f, py * f, 1.6, 0, 6.2832); ctx.fill(); }
    } else if (r.type === 'carcass') {
      ell(ctx, 0, 0, 9, 3.6, 'rgba(0,0,0,0.25)');
      ell(ctx, 0, -2.5, 8, 3.2, '#8a5d33'); ell(ctx, 7, -2, 2.4, 1.8, '#74492a');
      line(ctx, -4, -1, -6, 2, '#5a3a1e', 1.3); line(ctx, 2, -1, 4, 2, '#5a3a1e', 1.3);
    }
    ctx.restore();
  }

  // ---- construções
  box(x0, y0, w, h, H, top, left, right, lift) {
    const ctx = this.ctx, z = lift || 0;
    const ax = isoX(x0, y0), ay = isoY(x0, y0) - z;
    const bx = isoX(x0 + w, y0), by = isoY(x0 + w, y0) - z;
    const cx = isoX(x0 + w, y0 + h), cy = isoY(x0 + w, y0 + h) - z;
    const dx = isoX(x0, y0 + h), dy = isoY(x0, y0 + h) - z;
    poly(ctx, [dx, dy, cx, cy, cx, cy - H, dx, dy - H], left);
    poly(ctx, [bx, by, cx, cy, cx, cy - H, bx, by - H], right);
    poly(ctx, [ax, ay - H, bx, by - H, cx, cy - H, dx, dy - H], top);
    return { ax, ay, bx, by, cx, cy, dx, dy };
  }
  roof(x0, y0, w, h, H, R, colL, colR, lift) {
    // telhado em quatro águas simples (pirâmide achatada)
    const ctx = this.ctx, z = lift || 0;
    const mx = x0 + w / 2, my = y0 + h / 2;
    const apx = isoX(mx, my), apy = isoY(mx, my) - z - H - R;
    const bx = isoX(x0 + w, y0), by = isoY(x0 + w, y0) - z - H;
    const cx = isoX(x0 + w, y0 + h), cy = isoY(x0 + w, y0 + h) - z - H;
    const dx = isoX(x0, y0 + h), dy = isoY(x0, y0 + h) - z - H;
    const ax = isoX(x0, y0), ay = isoY(x0, y0) - z - H;
    poly(ctx, [dx, dy, cx, cy, apx, apy], colL);
    poly(ctx, [cx, cy, bx, by, apx, apy], colR);
    poly(ctx, [ax, ay, bx, by, apx, apy], shade(colR, 0.12));
    poly(ctx, [ax, ay, dx, dy, apx, apy], shade(colL, 0.1));
  }
  flag(x, y, col, lift) {
    const ctx = this.ctx;
    const sx = isoX(x, y), sy = isoY(x, y) - lift;
    line(ctx, sx, sy, sx, sy - 16, '#4a3a2a', 1.6);
    const wv = Math.sin(this.time * 4 + x) * 1.5;
    poly(ctx, [sx, sy - 16, sx + 11, sy - 13 + wv, sx, sy - 9], col);
  }
  stripe(x0, y0, w, h, col) {
    // faixa na cor do jogador na base das paredes
    const ctx = this.ctx, H = 4;
    const bx = isoX(x0 + w, y0), by = isoY(x0 + w, y0);
    const cx = isoX(x0 + w, y0 + h), cy = isoY(x0 + w, y0 + h);
    const dx = isoX(x0, y0 + h), dy = isoY(x0, y0 + h);
    poly(ctx, [dx, dy - 1, cx, cy - 1, cx, cy - 1 - H, dx, dy - 1 - H], col);
    poly(ctx, [bx, by - 1, cx, cy - 1, cx, cy - 1 - H, bx, by - 1 - H], shade(col, -0.25));
  }

  drawBuilding(b, selected) {
    const ctx = this.ctx, g = this.g;
    const p = g.players[b.owner];
    const def = BUILDINGS[b.type];
    const st = Object.assign({}, AGE_STYLE[p.age]);
    if (TYPE_ROOF[b.type]) st.roof = shade(TYPE_ROOF[b.type], p.age * 0.07);
    const x0 = b.tx, y0 = b.ty, w = b.w, h = b.h;
    const col = p.color;
    const prog = b.complete ? 1 : b.progress;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    poly(ctx, [isoX(x0, y0 + h) + 4, isoY(x0, y0 + h), isoX(x0 + w, y0 + h) + 6, isoY(x0 + w, y0 + h) + 3, isoX(x0 + w, y0) + 10, isoY(x0 + w, y0) + 4, isoX(x0 + w, y0 + h) + 2, isoY(x0 + w, y0 + h) - 2], 'rgba(0,0,0,0.16)');
    if (selected) {
      const pts = [isoX(x0, y0), isoY(x0, y0), isoX(x0 + w, y0), isoY(x0 + w, y0), isoX(x0 + w, y0 + h), isoY(x0 + w, y0 + h), isoX(x0, y0 + h), isoY(x0, y0 + h)];
      poly(ctx, pts, 'rgba(120,255,160,0.18)', 'rgba(255,255,255,0.95)');
    }
    const wall = st.wall, wl = shade(wall, -0.08), wr = shade(wall, -0.26), wt = shade(wall, 0.14);
    const t = this.time;
    const flash = b.hitT > 0;
    if (!b.complete) {
      // canteiro de obras: base e estacas crescem com o progresso
      const H = (def.size >= 3 ? 34 : 22) * Math.max(0.12, prog);
      poly(ctx, [isoX(x0, y0), isoY(x0, y0), isoX(x0 + w, y0), isoY(x0 + w, y0), isoX(x0 + w, y0 + h), isoY(x0 + w, y0 + h), isoX(x0, y0 + h), isoY(x0, y0 + h)], 'rgba(110,80,50,0.55)');
      ctx.globalAlpha = 0.92;
      if (b.type === 'farm') this.drawFarm(b, prog);
      else {
        this.box(x0 + 0.15, y0 + 0.15, w - 0.3, h - 0.3, H, shade(wall, 0.1), wl, wr);
        // andaimes
        ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.5;
        for (const [px, py] of [[x0, y0 + h], [x0 + w, y0 + h], [x0 + w, y0]]) { line(ctx, isoX(px, py), isoY(px, py), isoX(px, py), isoY(px, py) - H - 10, '#6b4a2a', 1.5); }
      }
      ctx.globalAlpha = 1;
      this.bars.push({ x: isoX(x0 + w / 2, y0 + h / 2), y: isoY(x0 + w / 2, y0 + h / 2) - 44, w: 30, f: prog, col: '#e8c03a' });
      if (selected || b.hp < b.maxhp) { }
      return;
    }
    switch (b.type) {
      case 'house': {
        this.box(x0 + 0.12, y0 + 0.12, w - 0.24, h - 0.24, 14, wt, wl, wr);
        this.stripe(x0 + 0.12, y0 + 0.12, w - 0.24, h - 0.24, col);
        this.roof(x0 - 0.05, y0 - 0.05, w + 0.1, h + 0.1, 14, 12, shade(st.roof, -0.1), shade(st.roof, -0.3));
        break;
      }
      case 'farm': this.drawFarm(b, 1); break;
      case 'mill': {
        this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 18, wt, wl, wr);
        this.stripe(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, col);
        this.roof(x0 + 0.1, y0 + 0.1, w - 0.2, h - 0.2, 18, 10, shade(st.roof, -0.1), shade(st.roof, -0.3));
        const mx = isoX(x0 + w / 2, y0 + h / 2), my = isoY(x0 + w / 2, y0 + h / 2) - 32;
        const ang = t * (b.queue.length ? 3 : 0.9);
        for (let i = 0; i < 4; i++) {
          const a = ang + i * Math.PI / 2;
          const ex = mx + Math.cos(a) * 20, ey = my + Math.sin(a) * 20 * 0.9;
          line(ctx, mx, my, ex, ey, '#6b4a2a', 2);
          poly(ctx, [mx + Math.cos(a) * 8, my + Math.sin(a) * 8 * 0.9, ex, ey, ex + Math.cos(a + 1.57) * 5, ey + Math.sin(a + 1.57) * 4.5, mx + Math.cos(a) * 8 + Math.cos(a + 1.57) * 5, my + Math.sin(a) * 8 * 0.9 + Math.sin(a + 1.57) * 4.5], '#e8e1c8');
        }
        ell(ctx, mx, my, 2.5, 2.5, '#4a3a2a');
        break;
      }
      case 'lumbercamp': {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        this.box(x0 + 0.1, y0 + 0.1, 1.2, 1.2, 10, '#7a5632', '#68472a', '#52371f');
        this.stripe(x0 + 0.1, y0 + 0.1, 1.2, 1.2, col);
        this.roof(x0 + 0.0, y0 + 0.0, 1.4, 1.4, 10, 6, '#8a6236', '#5e4226');
        // troncos empilhados
        for (let i = 0; i < 4; i++) { const lx = x0 + 1.3 + i * 0.12, ly = y0 + 1.3 + i * 0.12; ell(ctx, isoX(lx, ly), isoY(lx, ly) - 3 - i * 3, 9, 3, '#9a6e3e'); }
        break;
      }
      case 'miningcamp': {
        this.box(x0 + 0.1, y0 + 0.1, 1.2, 1.2, 10, '#7a5632', '#68472a', '#52371f');
        this.stripe(x0 + 0.1, y0 + 0.1, 1.2, 1.2, col);
        this.roof(x0 + 0.0, y0 + 0.0, 1.4, 1.4, 10, 6, '#8a8f98', '#62666e');
        const px = isoX(x0 + 1.5, y0 + 1.5), py = isoY(x0 + 1.5, y0 + 1.5);
        poly(ctx, [px - 9, py, px - 5, py - 9, px + 3, py - 11, px + 10, py - 3, px + 11, py + 1], '#7e838c');
        poly(ctx, [px - 4, py - 5, px, py - 8, px + 3, py - 5, px, py - 2], '#e8c33e');
        break;
      }
      case 'towncenter': {
        const hh = 24 + p.age * 2;
        this.box(x0 + 0.3, y0 + 0.3, w - 0.6, h - 0.6, hh, wt, wl, wr);
        this.stripe(x0 + 0.3, y0 + 0.3, w - 0.6, h - 0.6, col);
        this.roof(x0 + 0.1, y0 + 0.1, w - 0.2, h - 0.2, hh, 22 + p.age * 3, shade(st.roof, -0.1), shade(st.roof, -0.3));
        // torres de canto
        for (const [tx, ty] of [[x0, y0 + h - 1], [x0 + w - 1, y0 + h - 1], [x0 + w - 1, y0]]) {
          this.box(tx + 0.1, ty + 0.1, 0.85, 0.85, hh + 14, shade(wall, 0.2), wl, wr);
          this.roof(tx, ty, 1.05, 1.05, hh + 14, 10, shade(st.roof, -0.05), shade(st.roof, -0.28));
        }
        // porta
        const dx = isoX(x0 + w / 2, y0 + h - 0.3), dy = isoY(x0 + w / 2, y0 + h - 0.3);
        poly(ctx, [dx - 9, dy - 2, dx - 9, dy - 14, dx, dy - 20, dx + 9, dy - 14, dx + 9, dy - 2], '#3b2a1a');
        this.flag(x0 + w / 2, y0 + h / 2, col, hh + 22 + p.age * 3);
        break;
      }
      case 'barracks': {
        this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 24, wt, wl, wr);
        this.stripe(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, col);
        this.roof(x0 + 0.05, y0 + 0.05, w - 0.1, h - 0.1, 24, 14, shade(st.roof, -0.1), shade(st.roof, -0.3));
        // porta e espadas cruzadas
        const dx = isoX(x0 + w * 0.5, y0 + h - 0.2), dy = isoY(x0 + w * 0.5, y0 + h - 0.2);
        poly(ctx, [dx - 7, dy - 1, dx - 7, dy - 12, dx, dy - 16, dx + 7, dy - 12, dx + 7, dy - 1], '#33261a');
        line(ctx, dx - 10, dy - 22, dx + 6, dy - 12, '#dfe3e8', 1.8); line(ctx, dx + 10, dy - 22, dx - 6, dy - 12, '#dfe3e8', 1.8);
        this.flag(x0 + w - 0.6, y0 + 0.6, col, 38);
        break;
      }
      case 'archeryrange': {
        this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 20, wt, wl, wr);
        this.stripe(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, col);
        this.roof(x0 + 0.05, y0 + 0.05, w - 0.1, h - 0.1, 20, 10, shade(st.roof, -0.1), shade(st.roof, -0.3));
        // alvo
        const tx = isoX(x0 + w * 0.5, y0 + h + 0.2), ty = isoY(x0 + w * 0.5, y0 + h + 0.2) - 10;
        line(ctx, tx, ty + 10, tx, ty - 4, '#6b4a2a', 2);
        ell(ctx, tx, ty - 4, 8, 8, '#f0efe6'); ell(ctx, tx, ty - 4, 5.5, 5.5, '#c8372d'); ell(ctx, tx, ty - 4, 3, 3, '#f0efe6'); ell(ctx, tx, ty - 4, 1.2, 1.2, '#c8372d');
        break;
      }
      case 'stable': {
        this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 20, wt, wl, wr);
        this.stripe(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, col);
        this.roof(x0 + 0.05, y0 + 0.05, w - 0.1, h - 0.1, 20, 11, shade(st.roof, -0.05), shade(st.roof, -0.28));
        const hx = isoX(x0 + w + 0.1, y0 + h * 0.6), hy = isoY(x0 + w + 0.1, y0 + h * 0.6);
        poly(ctx, [hx - 8, hy, hx - 5, hy - 9, hx + 5, hy - 9, hx + 8, hy], '#d4b857');
        line(ctx, hx - 12, hy - 14, hx + 12, hy - 14, '#6b4a2a', 2);
        break;
      }
      case 'blacksmith': {
        this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 22, wt, wl, wr);
        this.stripe(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, col);
        this.roof(x0 + 0.05, y0 + 0.05, w - 0.1, h - 0.1, 22, 11, shade(st.roof, -0.15), shade(st.roof, -0.32));
        // chaminé com fumaça
        const cx = isoX(x0 + 0.9, y0 + 0.9), cy = isoY(x0 + 0.9, y0 + 0.9) - 38;
        ctx.fillStyle = '#6a6e76'; ctx.fillRect(cx - 3, cy - 12, 6, 14);
        for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3) % 1; ctx.fillStyle = 'rgba(210,210,210,' + (0.5 * (1 - k)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(cx + k * 6, cy - 14 - k * 22, 3 + k * 4, 0, 6.2832); ctx.fill(); }
        // bigorna
        const ax = isoX(x0 + w + 0.1, y0 + h - 0.4), ay = isoY(x0 + w + 0.1, y0 + h - 0.4);
        poly(ctx, [ax - 6, ay - 8, ax + 6, ay - 8, ax + 4, ay - 4, ax + 3, ay, ax - 3, ay, ax - 4, ay - 4], '#4a4e56');
        break;
      }
      case 'market': {
        this.box(x0 + 0.3, y0 + 0.3, w - 0.6, h - 0.6, 14, wt, wl, wr);
        this.stripe(x0 + 0.3, y0 + 0.3, w - 0.6, h - 0.6, col);
        // toldos listrados
        for (let i = 0; i < 4; i++) {
          const a = x0 + 0.2 + i * (w - 0.4) / 4, bb = x0 + 0.2 + (i + 1) * (w - 0.4) / 4;
          const z = 18;
          poly(ctx, [isoX(a, y0 + h - 0.1), isoY(a, y0 + h - 0.1) - z, isoX(bb, y0 + h - 0.1), isoY(bb, y0 + h - 0.1) - z, isoX(bb, y0 + h + 0.6), isoY(bb, y0 + h + 0.6) - z + 5, isoX(a, y0 + h + 0.6), isoY(a, y0 + h + 0.6) - z + 5], i % 2 ? '#f1ebd8' : col);
        }
        const kx = isoX(x0 + w * 0.5, y0 + h * 0.4), ky = isoY(x0 + w * 0.5, y0 + h * 0.4) - 14;
        ell(ctx, kx, ky, 7, 3.5, '#f0c63c'); ell(ctx, kx, ky - 3, 6, 3, '#f7d85a');
        break;
      }
      case 'siegeworkshop': {
        this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 24, wt, wl, wr);
        this.stripe(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, col);
        this.roof(x0 + 0.05, y0 + 0.05, w - 0.1, h - 0.1, 24, 12, shade(st.roof, -0.2), shade(st.roof, -0.35));
        const gx = isoX(x0 + w + 0.2, y0 + 0.9), gy = isoY(x0 + w + 0.2, y0 + 0.9);
        ctx.strokeStyle = '#5a3c20'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy - 6, 7, 0, 6.2832); ctx.stroke();
        line(ctx, gx - 7, gy - 6, gx + 7, gy - 6, '#5a3c20', 2); line(ctx, gx, gy - 13, gx, gy + 1, '#5a3c20', 2);
        break;
      }
      case 'tower': {
        const hh = 52;
        this.box(x0 + 0.25, y0 + 0.25, w - 0.5, h - 0.5, hh, wt, wl, wr);
        this.stripe(x0 + 0.25, y0 + 0.25, w - 0.5, h - 0.5, col);
        this.box(x0 + 0.05, y0 + 0.05, w - 0.1, h - 0.1, 8, shade(wall, 0.1), wl, wr, hh);
        this.roof(x0 + 0.15, y0 + 0.15, w - 0.3, h - 0.3, hh + 8, 10, shade(st.roof, -0.1), shade(st.roof, -0.3));
        // seteira
        const sx = isoX(x0 + w - 0.25, y0 + h * 0.5), sy = isoY(x0 + w - 0.25, y0 + h * 0.5) - 34;
        ctx.fillStyle = '#20180f'; ctx.fillRect(sx - 1.5, sy - 5, 3, 10);
        this.flag(x0 + w / 2, y0 + h / 2, col, hh + 18);
        break;
      }
      case 'castle': {
        const hh = 34;
        this.box(x0 + 0.5, y0 + 0.5, w - 1, h - 1, hh, wt, wl, wr);
        this.stripe(x0 + 0.5, y0 + 0.5, w - 1, h - 1, col);
        this.box(x0 + 1.1, y0 + 1.1, w - 2.2, h - 2.2, 18, shade(wall, 0.2), shade(wall, 0.02), shade(wall, -0.2), hh);
        this.roof(x0 + 1.0, y0 + 1.0, w - 2, h - 2, hh + 18, 18, shade(st.roof, -0.05), shade(st.roof, -0.28));
        for (const [tx, ty] of [[x0, y0], [x0 + w - 1.4, y0], [x0, y0 + h - 1.4], [x0 + w - 1.4, y0 + h - 1.4]]) {
          this.box(tx + 0.05, ty + 0.05, 1.3, 1.3, hh + 20, shade(wall, 0.12), wl, wr);
          this.roof(tx - 0.05, ty - 0.05, 1.5, 1.5, hh + 20, 12, shade(st.roof, 0.0), shade(st.roof, -0.25));
        }
        const dx = isoX(x0 + w / 2, y0 + h - 0.5), dy = isoY(x0 + w / 2, y0 + h - 0.5);
        poly(ctx, [dx - 10, dy - 2, dx - 10, dy - 16, dx, dy - 24, dx + 10, dy - 16, dx + 10, dy - 2], '#2b1f14');
        this.flag(x0 + w / 2, y0 + h / 2, col, hh + 40);
        break;
      }
      default: this.box(x0 + 0.2, y0 + 0.2, w - 0.4, h - 0.4, 20, wt, wl, wr);
    }
    // fogo em construções danificadas
    if (b.hp < b.maxhp * 0.45) {
      const n = b.hp < b.maxhp * 0.2 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const fx = x0 + (hash2(i, b.id, 1) * 0.8 + 0.1) * w, fy = y0 + (hash2(i, b.id, 2) * 0.8 + 0.1) * h;
        const px = isoX(fx, fy), py = isoY(fx, fy) - 22 - hash2(i, b.id, 3) * 12;
        const f = 0.7 + 0.3 * Math.sin(t * 14 + i * 2);
        poly(ctx, [px - 4, py, px - 1, py - 9 * f, px + 1, py - 5, px + 4, py - 12 * f, px + 5, py], 'rgba(255,120,30,0.9)');
        poly(ctx, [px - 2, py, px, py - 6 * f, px + 3, py], 'rgba(255,220,80,0.95)');
      }
    }
    if (flash) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; poly(ctx, [isoX(x0, y0), isoY(x0, y0), isoX(x0 + w, y0), isoY(x0 + w, y0), isoX(x0 + w, y0 + h), isoY(x0 + w, y0 + h), isoX(x0, y0 + h), isoY(x0, y0 + h)], 'rgba(255,255,255,0.18)'); }
    // produção em andamento: indicador
    if (b.queue.length && (selected || b.owner === g.humanIdx)) {
      const it = b.queue[0];
      this.bars.push({ x: isoX(x0 + w / 2, y0 + h / 2), y: isoY(x0 + w / 2, y0 + h / 2) + 6, w: 26, f: 1 - it.t / it.total, col: '#5aa9ff' });
    }
    if (selected || b.hp < b.maxhp) this.bars.push({ x: isoX(x0 + w / 2, y0 + h / 2), y: isoY(x0 + w / 2, y0 + h / 2) - (def.size >= 4 ? 64 : def.id === 'tower' ? 74 : 38), w: 30 + def.size * 6, f: Math.max(0, b.hp / b.maxhp) });
  }

  drawFarm(b, prog) {
    const ctx = this.ctx;
    const x0 = b.tx, y0 = b.ty, w = b.w;
    const f = b.complete ? Math.max(0.0, b.amount / b.max) : 1;
    poly(ctx, [isoX(x0, y0), isoY(x0, y0), isoX(x0 + w, y0), isoY(x0 + w, y0), isoX(x0 + w, y0 + w), isoY(x0 + w, y0 + w), isoX(x0, y0 + w), isoY(x0, y0 + w)], '#6e4b2a', 'rgba(60,35,15,0.9)');
    const rows = 5;
    for (let i = 0; i < rows; i++) {
      const a = x0 + 0.25 + i * (w - 0.5) / (rows - 1);
      const gcol = f > 0.5 ? '#c9b94a' : f > 0.15 ? '#9aa83a' : '#7a5a34';
      const hgt = 3 + 5 * f * prog;
      line(ctx, isoX(a, y0 + 0.2), isoY(a, y0 + 0.2) - 1, isoX(a, y0 + w - 0.2), isoY(a, y0 + w - 0.2) - 1, '#4a3016', 1.5);
      ctx.strokeStyle = gcol; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(isoX(a, y0 + 0.2), isoY(a, y0 + 0.2) - 1 - hgt); ctx.lineTo(isoX(a, y0 + w - 0.2), isoY(a, y0 + w - 0.2) - 1 - hgt); ctx.stroke();
    }
    // moldura na cor do jogador (canto)
    const pc = this.g.players[b.owner].color;
    ctx.fillStyle = pc;
    const cx = isoX(x0 + 0.1, y0 + w - 0.1), cy = isoY(x0 + 0.1, y0 + w - 0.1);
    ctx.fillRect(cx - 2, cy - 5, 4, 5);
    if (b.complete && b.hp < b.maxhp) this.bars.push({ x: isoX(x0 + w / 2, y0 + w / 2), y: isoY(x0 + w / 2, y0 + w / 2) - 10, w: 24, f: b.hp / b.maxhp });
  }

  // ---------------------------------------------------------------- projéteis e efeitos
  drawProjectilesAndFx(alpha) {
    const g = this.g, ctx = this.ctx;
    for (const p of g.projectiles) {
      const k = Math.min(1, p.t / p.dur);
      const arcH = Math.sin(k * Math.PI) * p.arc * 14;
      const sx = isoX(p.x, p.y), sy = isoY(p.x, p.y) - 12 - arcH;
      if (!g.canSee({ x: p.x, y: p.y, owner: p.owner, kind: 'unit' }) && p.owner !== g.humanIdx) continue;
      const k2 = Math.min(1, (p.t + 0.04) / p.dur);
      const ax = isoX(lerp(p.sx, p.tx, k2), lerp(p.sy, p.ty, k2)), ay = isoY(lerp(p.sx, p.tx, k2), lerp(p.sy, p.ty, k2)) - 12 - Math.sin(k2 * Math.PI) * p.arc * 14;
      if (p.kind === 'stone') { ell(ctx, sx, sy, 3.5, 3.5, '#4e4f55'); ell(ctx, sx, sy + 12 + arcH, 3, 1.5, 'rgba(0,0,0,0.25)'); }
      else if (p.kind === 'bullet') { ell(ctx, sx, sy, 1.6, 1.6, '#ffe28a'); }
      else if (p.kind === 'axe') { ell(ctx, sx, sy, 2.6, 2.6, '#aab'); }
      else {
        const dx = ax - sx, dy = ay - sy, d = Math.hypot(dx, dy) || 1;
        line(ctx, sx, sy, sx + dx / d * 7, sy + dy / d * 7, '#e6dcc0', 1.3);
        line(ctx, sx - dx / d * 1, sy - dy / d * 1, sx, sy, '#8a6a3a', 1.2);
      }
    }
    for (const f of g.fx) {
      const k = f.t / f.dur;
      const sx = isoX(f.x, f.y), sy = isoY(f.x, f.y);
      if (f.type === 'hit') { ctx.globalAlpha = 1 - k; poly(ctx, [sx - 4, sy - 12, sx, sy - 18, sx + 4, sy - 12, sx, sy - 7], '#ffe06a'); ctx.globalAlpha = 1; }
      else if (f.type === 'boom') { ctx.globalAlpha = 0.8 * (1 - k); ell(ctx, sx, sy - 4, 8 + k * 26, 5 + k * 14, '#ff9a3a'); ell(ctx, sx, sy - 4, 4 + k * 12, 3 + k * 7, '#ffe48a'); ctx.globalAlpha = 1; }
      else if (f.type === 'corpse') {
        if (!g.canSee({ x: f.x, y: f.y, owner: -1, kind: 'unit' })) continue;
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (f.t - 4) / 4));
        ell(ctx, sx, sy, 7, 3, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = f.color; ctx.fillRect(sx - 4, sy - 3, 8, 3);
        ctx.fillStyle = '#e0b48c'; ctx.fillRect(sx + 3, sy - 4, 3, 3);
        ctx.globalAlpha = 1;
      }
      else if (f.type === 'ruin') {
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (f.t - 8) / 6));
        const sz = f.size;
        poly(ctx, [isoX(f.x - sz * 0.4, f.y - sz * 0.4), isoY(f.x - sz * 0.4, f.y - sz * 0.4), isoX(f.x + sz * 0.4, f.y - sz * 0.4), isoY(f.x + sz * 0.4, f.y - sz * 0.4) - 5, isoX(f.x + sz * 0.4, f.y + sz * 0.4), isoY(f.x + sz * 0.4, f.y + sz * 0.4), isoX(f.x - sz * 0.4, f.y + sz * 0.4), isoY(f.x - sz * 0.4, f.y + sz * 0.4) - 3], '#4b4034');
        if (f.t < 5) { for (let i = 0; i < 3; i++) { const kk = (f.t * 0.6 + i / 3) % 1; ctx.fillStyle = 'rgba(60,60,60,' + (0.45 * (1 - kk)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(sx + (i - 1) * 8, sy - 10 - kk * 30, 5 + kk * 8, 0, 6.2832); ctx.fill(); } }
        ctx.globalAlpha = 1;
      }
      else if (f.type === 'debris') { ctx.globalAlpha = 1 - k; ctx.fillStyle = '#6a5a48'; ctx.fillRect(sx - 2, sy - 2 - (f.z || 0), 4, 4); ctx.globalAlpha = 1; }
    }
  }

  // ---------------------------------------------------------------- neblina
  drawFog() {
    const g = this.g, n = g.n;
    if (this.g.st.fog === false) return;
    if (this.fogTick !== g.tickN) {
      this.fogTick = g.tickN;
      const d = this.fogImg.data;
      for (let i = 0; i < n * n; i++) {
        const a = !g.expl[i] ? 255 : (!g.vis[i] ? 120 : 0);
        d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 10; d[i * 4 + 3] = a;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.transform(HW, HH, -HW, HH, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCv, 0, 0, n, n);
    ctx.restore();
  }

  // ---------------------------------------------------------------- construção (fantasma)
  drawPlacement() {
    const ui = this.ui;
    if (!ui || !ui.placing || !ui.mouseWorld) return;
    const g = this.g, ctx = this.ctx, pl = ui.placing, def = BUILDINGS[pl.type];
    const sz = def.size;
    const tx = Math.floor(ui.mouseWorld.x - sz / 2 + 0.5), ty = Math.floor(ui.mouseWorld.y - sz / 2 + 0.5);
    pl.tx = tx; pl.ty = ty;
    const p = g.human;
    const ok = g.canPlace(p, pl.type, tx, ty) && g.canAfford(p, g.buildCost(p, pl.type));
    pl.ok = ok;
    for (let y = ty; y < ty + sz; y++) for (let x = tx; x < tx + sz; x++) {
      const good = g.world.inb(x, y) && !g.world.occ[g.world.idx(x, y)] && g.world.terrain[g.world.idx(x, y)] !== T_WATER && (g.expl[g.world.idx(x, y)] || g.st.fog === false);
      poly(ctx, [isoX(x, y), isoY(x, y), isoX(x + 1, y), isoY(x + 1, y), isoX(x + 1, y + 1), isoY(x + 1, y + 1), isoX(x, y + 1), isoY(x, y + 1)], good && ok ? 'rgba(80,255,120,0.4)' : 'rgba(255,70,60,0.45)', 'rgba(255,255,255,0.4)');
    }
    ctx.globalAlpha = 0.65;
    const st = AGE_STYLE[p.age];
    if (pl.type === 'farm') this.drawFarm({ tx, ty, w: sz, complete: false, amount: 1, max: 1, owner: p.idx, hp: 1, maxhp: 1 }, 1);
    else {
      const H = pl.type === 'tower' ? 50 : sz >= 4 ? 40 : sz === 3 ? 28 : 16;
      this.box(tx + 0.2, ty + 0.2, sz - 0.4, sz - 0.4, H, shade(st.wall, 0.1), shade(st.wall, -0.08), shade(st.wall, -0.26));
      this.roof(tx + 0.05, ty + 0.05, sz - 0.1, sz - 0.1, H, sz * 4, shade(st.roof, -0.1), shade(st.roof, -0.3));
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- overlays de tela
  drawScreenOverlay() {
    const ctx = this.ctx, ui = this.ui;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (ui && ui.drag) {
      const d = ui.drag;
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      ctx.fillStyle = 'rgba(120,255,160,0.1)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(200,255,210,0.9)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
  }
}
