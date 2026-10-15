/* Fazenda Império — mini gráficos em SVG (sparklines e linhas) com dica ao passar o mouse.
   Cada ponto ganha uma área invisível com data-tip; ui.js mostra a dica. */
(function (root) {
  const FG = root.FG = root.FG || {};
  const Ch = FG.Charts = {};
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Sparkline de uma série. fmt formata o valor da dica; labels opcionais por ponto.
  Ch.spark = function (values, opts = {}) {
    const w = opts.w || 110, h = opts.h || 28, pad = 3;
    const v = values.slice(-(opts.last || values.length));
    if (v.length < 2) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const x = i => pad + i * (w - 2 * pad) / (v.length - 1);
    const y = val => h - pad - (val - min) / span * (h - 2 * pad);
    const d = v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
    const fmt = opts.fmt || (n => n.toFixed(2));
    const step = (w - 2 * pad) / (v.length - 1);
    const hits = v.map((val, i) => `<rect x="${(x(i) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${h}" fill="transparent" data-tip="${esc((opts.label ? opts.label(i, v.length) + ': ' : '') + fmt(val))}"/>`).join('');
    const up = v[v.length - 1] >= v[0];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tendência">
      <path d="${d}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2.5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="1"/>
      ${hits}<title>${up ? 'Alta' : 'Queda'} no período</title></svg>`;
  };

  // Gráfico de linhas (mesma escala, um eixo) com legenda e dica por coluna.
  Ch.lines = function (series, opts = {}) {
    const w = opts.w || 1000, h = opts.h || 260, padL = 84, padR = 12, padT = 12, padB = 24;
    const n = Math.max(...series.map(s => s.values.length));
    if (n < 2) return '<p class="muted">Dados insuficientes — avance alguns dias.</p>';
    const all = series.flatMap(s => s.values);
    let min = Math.min(0, ...all), max = Math.max(...all);
    if (max === min) max = min + 1;
    const x = i => padL + i * (w - padL - padR) / (n - 1);
    const y = v => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
    const fmt = opts.fmt || (v => v.toFixed(0));
    const ticks = 4;
    let grid = '';
    for (let k = 0; k <= ticks; k++) {
      const val = min + (max - min) * k / ticks;
      grid += `<line x1="${padL}" x2="${w - padR}" y1="${y(val)}" y2="${y(val)}" stroke="var(--grid)" stroke-width="1"/>
        <text x="${padL - 6}" y="${y(val) + 4}" text-anchor="end" class="axis">${fmt(val)}</text>`;
    }
    if (min < 0) grid += `<line x1="${padL}" x2="${w - padR}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)" stroke-width="1.5"/>`;
    const paths = series.map((s, si) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      return `<path d="${d}" fill="none" stroke="var(--series-${si + 1})" stroke-width="2" stroke-linejoin="round"/>`;
    }).join('');
    const step = (w - padL - padR) / (n - 1);
    const hits = Array.from({ length: n }, (_, i) => {
      const tip = (opts.xLabel ? opts.xLabel(i, n) + ' — ' : '') + series.map(s => `${s.name}: ${fmt(s.values[i] ?? 0)}`).join(' · ');
      return `<rect class="hit" x="${(x(i) - step / 2).toFixed(1)}" y="${padT}" width="${step.toFixed(1)}" height="${h - padT - padB}" fill="transparent" data-tip="${esc(tip)}"/>`;
    }).join('');
    const xl = opts.xLabel ? `<text x="${padL}" y="${h - 6}" class="axis">${opts.xLabel(0, n)}</text><text x="${w - padR}" y="${h - 6}" text-anchor="end" class="axis">${opts.xLabel(n - 1, n)}</text>` : '';
    const legend = series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span><i style="background:var(--series-${i + 1})"></i>${s.name}</span>`).join('')}</div>` : '';
    return `${legend}<svg class="linechart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || 'Gráfico')}">${grid}${paths}${hits}${xl}</svg>`;
  };

  // Barras horizontais simples (ex.: composição de custos)
  Ch.bars = function (items, opts = {}) {
    const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
    const fmt = opts.fmt || (v => v.toFixed(0));
    return `<div class="hbars">${items.map(i => `<div class="hbar" data-tip="${esc(i.label + ': ' + fmt(i.value))}">
      <span class="hbar-l">${i.label}</span><span class="hbar-t"><span style="width:${(Math.abs(i.value) / max * 100).toFixed(1)}%;background:${i.color || 'var(--series-1)'}"></span></span><span class="hbar-v">${fmt(i.value)}</span></div>`).join('')}</div>`;
  };

  // Rampa sequencial (azul) e divergente (azul ↔ cinza ↔ vermelho) para os mapas
  Ch.SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95'];
  Ch.seq = (t) => Ch.SEQ[Math.max(0, Math.min(Ch.SEQ.length - 1, Math.round(t * (Ch.SEQ.length - 1))))];
  const DIV_NEG = ['#2a78d6', '#6da7ec', '#b7d3f6'], DIV_POS = ['#f4c3bf', '#ea8a85', '#d03b3b'];
  Ch.div = function (t, dark) { // t em [-1, 1]
    if (Math.abs(t) < 0.12) return dark ? '#383835' : '#e4e2dc';
    const k = Math.min(2, Math.floor((Math.abs(t) - 0.12) / 0.3));
    return t < 0 ? DIV_NEG[2 - k] : DIV_POS[k];
  };
})(typeof window !== 'undefined' ? window : globalThis);
