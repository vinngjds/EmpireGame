'use strict';
// Utilitários gerais ---------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash determinístico 2D -> [0,1)
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Fila de prioridade (min-heap) usada no A*
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  clear() { this.k.length = 0; this.v.length = 0; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// Grade espacial simples para consultas por raio
class Grid {
  constructor(n, cell) {
    this.cell = cell;
    this.w = Math.ceil(n / cell);
    this.cells = new Array(this.w * this.w);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.stamp = 0;
  }
  clear() { for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0; }
  _c(v) { return clamp(Math.floor(v / this.cell), 0, this.w - 1); }
  add(e) {
    const x0 = this._c(e.rx0 !== undefined ? e.rx0 : e.x), x1 = this._c(e.rx1 !== undefined ? e.rx1 : e.x);
    const y0 = this._c(e.ry0 !== undefined ? e.ry0 : e.y), y1 = this._c(e.ry1 !== undefined ? e.ry1 : e.y);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.cells[cy * this.w + cx].push(e);
  }
  remove(e) {
    const x0 = this._c(e.rx0 !== undefined ? e.rx0 : e.x), x1 = this._c(e.rx1 !== undefined ? e.rx1 : e.x);
    const y0 = this._c(e.ry0 !== undefined ? e.ry0 : e.y), y1 = this._c(e.ry1 !== undefined ? e.ry1 : e.y);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.cells[cy * this.w + cx];
      const i = a.indexOf(e);
      if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
    }
  }
  // chama fn(e) para cada entidade (sem repetição) dentro do quadrado do raio
  query(x, y, r, fn) {
    const st = ++this.stamp;
    const x0 = this._c(x - r), x1 = this._c(x + r), y0 = this._c(y - r), y1 = this._c(y + r);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.cells[cy * this.w + cx];
      for (let i = 0; i < a.length; i++) {
        const e = a[i];
        if (e._q === st) continue;
        e._q = st;
        fn(e);
      }
    }
  }
}

function fmtTime(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
}

function shade(col, f) {
  let r, g, b;
  if (col.charCodeAt(0) === 35) { // '#rrggbb'
    const n = parseInt(col.slice(1), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {                         // 'rgb(r,g,b)'
    const m = col.match(/\d+/g);
    r = +m[0]; g = +m[1]; b = +m[2];
  }
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
