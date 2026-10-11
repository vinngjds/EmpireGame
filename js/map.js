'use strict';
// Mundo: grade de tiles, geração procedural do mapa e pathfinding A* ---------

const T_GRASS = 0, T_DIRT = 1, T_WATER = 2;

class World {
  constructor(n) {
    this.n = n;
    this.terrain = new Uint8Array(n * n);
    this.blk = new Uint8Array(n * n);      // bloqueia movimento
    this.occ = new Int32Array(n * n);      // id da entidade que ocupa o tile (construção/recurso)
    this.cidx = new Uint8Array(n * n);     // índice da cor do tile na paleta
    this.palette = [];
    this._palMap = new Map();
    this.tuft = new Uint8Array(n * n);     // decoração
    // estruturas do A*
    this._g = new Float32Array(n * n);
    this._par = new Int32Array(n * n);
    this._stamp = new Uint32Array(n * n);
    this._closed = new Uint32Array(n * n);
    this._cur = 0;
    this._heap = new Heap();
  }
  palIndex(col) {
    let i = this._palMap.get(col);
    if (i === undefined) { i = this.palette.length; this.palette.push(col); this._palMap.set(col, i); }
    return i;
  }
  idx(tx, ty) { return ty * this.n + tx; }
  inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.n && ty < this.n; }
  free(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.n && ty < this.n && !this.blk[ty * this.n + tx]; }
  freeAt(x, y) { return this.free(Math.floor(x), Math.floor(y)); }

  // linha livre de obstáculos (amostragem, com folga lateral para não "raspar" quinas)
  lineClear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    const px = -dy / d * 0.2, py = dx / d * 0.2;
    const steps = Math.ceil(d / 0.25);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      if (!this.freeAt(x, y) || !this.freeAt(x + px, y + py) || !this.freeAt(x - px, y - py)) return false;
    }
    return true;
  }

  // Caminho A* até a região "rect" (em coords de tile contínuas) com tolerância "reach".
  // Retorna array de pontos {x,y} (centros) ou [] se já está no alvo, ou null se sem caminho nenhum.
  findPath(sx, sy, rect, reach, maxNodes) {
    const n = this.n;
    const stx = clamp(Math.floor(sx), 0, n - 1), sty = clamp(Math.floor(sy), 0, n - 1);
    const start = sty * n + stx;
    const cur = ++this._cur;
    const g = this._g, par = this._par, stamp = this._stamp, closed = this._closed;
    const heap = this._heap; heap.clear();
    const rx0 = rect.x0, rx1 = rect.x1, ry0 = rect.y0, ry1 = rect.y1;
    const hf = (tx, ty) => {
      const dx = Math.max(rx0 - (tx + 0.5), 0, (tx + 0.5) - rx1), dy = Math.max(ry0 - (ty + 0.5), 0, (ty + 0.5) - ry1);
      const a = Math.max(dx, dy), b = Math.min(dx, dy);
      return a + 0.414 * b;
    };
    const dRect = (tx, ty) => {
      const dx = Math.max(rx0 - (tx + 0.5), 0, (tx + 0.5) - rx1), dy = Math.max(ry0 - (ty + 0.5), 0, (ty + 0.5) - ry1);
      return Math.hypot(dx, dy);
    };
    g[start] = 0; par[start] = -1; stamp[start] = cur;
    heap.push(hf(stx, sty), start);
    let best = start, bestH = hf(stx, sty), goal = -1, expanded = 0;
    const limit = maxNodes || 9000;
    const blk = this.blk;
    while (heap.size) {
      const c = heap.pop();
      if (closed[c] === cur) continue;
      closed[c] = cur;
      const cx = c % n, cy = (c / n) | 0;
      if (dRect(cx, cy) <= reach) { goal = c; break; }
      const h = hf(cx, cy);
      if (h < bestH) { bestH = h; best = c; }
      if (++expanded > limit) break;
      for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (blk[ni]) continue;
        if (dx && dy && (blk[cy * n + nx] || blk[ny * n + cx])) continue;
        const ng = g[c] + (dx && dy ? 1.4142 : 1);
        if (stamp[ni] !== cur || ng < g[ni]) {
          stamp[ni] = cur; g[ni] = ng; par[ni] = c;
          heap.push(ng + hf(nx, ny), ni);
        }
      }
    }
    if (goal < 0) goal = best;
    if (goal === start) return dRect(stx, sty) <= reach ? [{ x: stx + 0.5, y: sty + 0.5 }] : null;
    const pts = [];
    for (let c = goal; c !== -1; c = par[c]) pts.push({ x: (c % n) + 0.5, y: ((c / n) | 0) + 0.5 });
    pts.reverse();
    pts.shift(); // remove o tile de partida
    // suavização por linha de visada
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineClear(ax, ay, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y; i = j + 1;
    }
    return out;
  }

  // tile livre mais próximo de (x,y) em espiral
  nearestFree(x, y, maxR) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (this.free(tx, ty)) return { x, y };
    for (let r = 1; r <= (maxR || 12); r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.free(tx + dx, ty + dy)) {
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { x: tx + dx + 0.5, y: ty + dy + 0.5 }; }
        }
      }
      if (best) return best;
    }
    return { x, y };
  }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// ---------------------------------------------------------------------------
// Ruído de valor suave
// ---------------------------------------------------------------------------
function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}
function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.55 + valueNoise(x * 2.1, y * 2.1, seed + 7) * 0.3 + valueNoise(x * 4.3, y * 4.3, seed + 13) * 0.15;
}

// Prepara terreno base (grama, terra, lagos). Retorna o World.
function generateTerrain(n, mapType, seed, starts) {
  const w = new World(n);
  const mt = MAP_TYPES[mapType] || MAP_TYPES.arabia;
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    const i = ty * n + tx;
    const nv = fbm(tx / 9, ty / 9, seed);
    let t = T_GRASS;
    if (nv < 0.3) t = T_DIRT;
    if (mt.lakes > 0) {
      const lv = fbm(tx / 11 + 40, ty / 11 + 40, seed + 99);
      let nearStart = false;
      for (const s of starts) if (dist(s.x, s.y, tx, ty) < 15) nearStart = true;
      if (!nearStart && lv > 0.66 - (mt.lakes - 0.5) * 0.04 && tx > 1 && ty > 1 && tx < n - 2 && ty < n - 2) t = T_WATER;
    }
    w.terrain[i] = t;
    if (t === T_WATER) w.blk[i] = 1;
    // cor (quantizada em uma paleta pequena para desenhar em lotes)
    const v = hash2(tx, ty, seed + 3);
    const vb = Math.floor(v * 6), nb = Math.floor(nv * 5);
    if (t === T_WATER) {
      w.cidx[i] = w.palIndex('hsl(205,55%,' + (38 + vb) + '%)');
    } else if (t === T_DIRT) {
      w.cidx[i] = w.palIndex('hsl(' + (38 + vb) + ',' + (32 + vb) + '%,' + (44 + vb * 0.8 + nb) + '%)');
    } else {
      w.cidx[i] = w.palIndex('hsl(' + (98 + vb * 2) + ',' + (42 + vb) + '%,' + (33 + vb * 0.7 + nb * 1.4).toFixed(1) + '%)');
      if (v > 0.8) w.tuft[i] = 1;
    }
  }
  // praias: tiles de terra ao lado da água
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    if (w.terrain[ty * n + tx] === T_WATER) continue;
    let near = false;
    for (const d of DIRS) { const nx = tx + d[0], ny = ty + d[1]; if (w.inb(nx, ny) && w.terrain[ny * n + nx] === T_WATER) near = true; }
    if (near) { w.terrain[ty * n + tx] = T_DIRT; w.cidx[ty * n + tx] = w.palIndex('hsl(45,45%,62%)'); w.tuft[ty * n + tx] = 0; }
  }
  return w;
}

// Posições iniciais em anel, agrupando aliados lado a lado
function startPositions(n, slots) {
  const cnt = slots.length;
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a].team - slots[b].team) || (a - b));
  const pos = new Array(cnt);
  const cx = n / 2, cy = n / 2;
  const rx = n * 0.34, ry = n * 0.34;
  const off = Math.PI * 0.25;
  for (let k = 0; k < cnt; k++) {
    const a = off + (k / cnt) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    pos[order[k]] = { x: clamp(x, 10, n - 11), y: clamp(y, 10, n - 11) };
  }
  return pos;
}
