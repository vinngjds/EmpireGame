'use strict';
// Interface mobile-first -------------------------------------------------------

const $ = s => document.querySelector(s);
const ui = { tab: 'painel', chart: 'gdp', polCat: 'Todas', busy: false };
const nf = (n, d = 0) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtGdp = bn => bn >= 1000 ? 'US$ ' + nf(bn / 1000, 2) + ' tri' : 'US$ ' + nf(bn, 0) + ' bi';
const fmtPop = m => m >= 1000 ? nf(m / 1000, 2) + ' bi' : m >= 10 ? nf(m, 0) + ' mi' : nf(m, 1) + ' mi';
const sign = (v, d = 1) => (v >= 0 ? '+' : '−') + nf(Math.abs(v), d);
const ratingLetter = r => r > 85 ? 'AAA' : r > 75 ? 'AA' : r > 65 ? 'A' : r > 55 ? 'BBB' : r > 45 ? 'BB' : r > 35 ? 'B' : r > 22 ? 'CCC' : 'D';
function sev(good) { return good > 0.66 ? 'good' : good > 0.33 ? 'mid' : 'bad'; } // good em 0..1
function esc(s) { return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

// ---------------------------------------------------------------- modais
function modal(html, buttons, opts) {
  return new Promise(res => {
    const o = document.createElement('div');
    o.className = 'overlay';
    const b = (buttons || []).map((x, i) => `<button class="btn ${x.cls || ''}" data-i="${i}"${x.dis ? ' disabled' : ''}>${x.label}${x.hint ? `<small>${x.hint}</small>` : ''}</button>`).join('');
    o.innerHTML = `<div class="sheet ${opts && opts.cls || ''}"><div class="sheet-body">${html}</div><div class="sheet-btns">${b}</div></div>`;
    document.body.appendChild(o);
    const sb = o.querySelector('.sheet-body'); sb.scrollTop = 0;
    o.addEventListener('click', e => {
      const btn = e.target.closest('button[data-i]');
      if (btn && !btn.disabled) { o.remove(); res(+btn.dataset.i); }
      else if (e.target === o && opts && opts.dismiss) { o.remove(); res(-1); }
    });
  });
}
function toast(text, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

// ---------------------------------------------------------------- gráficos
function spark(vals, color, w = 300, h = 90) {
  if (vals.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="spark"></svg>`;
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => [4 + i / (vals.length - 1) * (w - 8), h - 6 - (v - mn) / r * (h - 14)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none"><path d="${area}" fill="${color}" opacity=".16"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="3.5" fill="${color}"/></svg>`;
}
const bar = (v, max, cls) => `<div class="bar ${cls || ''}"><i style="width:${clamp(v / max * 100, 0, 100).toFixed(0)}%"></i></div>`;

// ---------------------------------------------------------------- tela principal
function render() {
  const g = Game, c = g.me, w = g.w;
  const next = TERM - (w.turn % TERM);
  const app = $('#app');
  app.innerHTML = `
    <header class="top">
      <div class="who"><span class="flag">${c.flag}</span><div><b>${c.name}</b><small>Meta Top ${c.goal} · ${w.streak}/${WIN_STREAK}</small></div></div>
      <div class="hud">
        <div class="pill" title="Ano"><b>${w.year}</b><small>${w.year >= END_YEAR ? 'último ano' : (END_YEAR - w.year) + ' anos restantes'}</small></div>
        <div class="pill" title="Posição no ranking de poder"><b>#${c.rank}</b><small>poder ${nf(c.power, 0)}</small></div>
        <div class="pill cp" title="Capital político: limita leis e acordos"><b>⭐ ${nf(c.cp, 1)}</b><small>capital pol.</small></div>
      </div>
    </header>
    <main id="view" class="view"></main>
    <button id="next" class="fab">Próximo ano ▶<small>eleição em ${next === TERM ? TERM : next} ${next === 1 ? 'ano' : 'anos'}</small></button>
    <nav class="tabs">
      ${[['painel', '📊', 'Painel'], ['orc', '💰', 'Orçamento'], ['leis', '📜', 'Leis'], ['povo', '👥', 'Povo'], ['mundo', '🌍', 'Mundo']].map(t => `<button data-tab="${t[0]}" class="${ui.tab === t[0] ? 'on' : ''}"><span>${t[1]}</span>${t[2]}</button>`).join('')}
    </nav>`;
  renderTab();
}
function refreshHud() {
  const c = Game.me, w = Game.w;
  const pills = document.querySelectorAll('.hud .pill');
  if (!pills.length) return;
  pills[1].innerHTML = `<b>#${c.rank}</b><small>poder ${nf(c.power, 0)}</small>`;
  pills[2].innerHTML = `<b>⭐ ${nf(c.cp, 1)}</b><small>capital pol.</small>`;
}
function renderTab() {
  const v = $('#view');
  if (!v) return;
  const y = v.scrollTop;
  ({ painel: tabPainel, orc: tabOrc, leis: tabLeis, povo: tabPovo, mundo: tabMundo })[ui.tab](v);
  window.scrollTo(0, 0);
}

// ---- Painel
function statCard(label, value, sub, good, tip) {
  return `<div class="stat ${good !== undefined ? sev(good) : ''}" title="${esc(tip || '')}"><small>${label}</small><b>${value}</b><em>${sub || ''}</em></div>`;
}
function tabPainel(v) {
  const c = Game.me, w = Game.w, b = c.lastBudget || budget(c, w);
  const pov = poverty(c);
  const charts = { gdp: ['PIB (US$ bi)', c.hist.gdp, '#5cc8ff'], gdpPc: ['PIB per capita (US$ mil)', c.hist.gdpPc, '#7ddc84'], pop: ['População (mi)', c.hist.pop, '#ffb15c'], approval: ['Aprovação (%)', c.hist.approval, '#ff7a8a'], power: ['Poder nacional', c.hist.power, '#c59bff'], rank: ['Posição no ranking', c.hist.rank, '#f5d76e'] };
  const ch = charts[ui.chart];
  const tips = Game.advise();
  v.innerHTML = `
    <section class="grid">
      ${statCard('PIB', fmtGdp(c.pop * c.gdpPc), `${sign(c.g)}% a.a.`, clamp((c.g + 1) / 5, 0, 1), 'Produto interno bruto')}
      ${statCard('PIB per capita', 'US$ ' + nf(c.gdpPc, 1) + ' mil', `#${c.gdpRank} maior economia`, clamp(c.gdpPc / 25, 0, 1))}
      ${statCard('População', fmtPop(c.pop), `natalidade ${nf(c.birth, 0)}‰ · mortalidade ${nf(c.deathRate || 7, 0)}‰`)}
      ${statCard('Aprovação', nf(c.approval, 0) + '%', `estabilidade ${nf(c.stab, 0)}`, c.approval / 70)}
      ${statCard('Inflação', nf(c.infl, 1) + '%', 'ao ano', 1 - clamp((c.infl - 3) / 15, 0, 1))}
      ${statCard('Dívida pública', nf(c.debt, 0) + '% PIB', `rating ${ratingLetter(c.rating)} · saldo ${sign(b.balance)}%`, 1 - clamp((c.debt - 40) / 100, 0, 1))}
      ${statCard('Empregos', nf(c.jobs, 0) + '/100', 'índice', c.jobs / 75)}
      ${statCard('Educação', nf(c.edu, 0), 'índice', c.edu / 80)}
      ${statCard('Saúde', nf(c.health, 0), 'índice', c.health / 80)}
      ${statCard('Tecnologia', nf(c.tech, 0), 'índice', c.tech / 80)}
      ${statCard('Infraestrutura', nf(c.infra, 0), 'índice', c.infra / 80)}
      ${statCard('Pobreza', nf(pov, 0) + '%', `desigualdade ${nf(c.ineq, 0)}`, 1 - clamp(pov / 50, 0, 1))}
      ${statCard('Corrupção', nf(c.corr, 0), 'índice (menor é melhor)', 1 - clamp((c.corr - 15) / 60, 0, 1))}
      ${statCard('Criminalidade', nf(c.crime, 0), 'índice', 1 - clamp(c.crime / 70, 0, 1))}
      ${statCard('Poluição', nf(c.pollution, 0), 'índice', 1 - clamp((c.pollution - 20) / 60, 0, 1))}
      ${statCard('Força militar', nf(c.mil, 0), 'índice', c.mil / 70)}
    </section>
    <section class="card">
      <div class="chips">${Object.entries(charts).map(([k, x]) => `<button class="chip ${ui.chart === k ? 'on' : ''}" data-chart="${k}">${x[0].split(' (')[0]}</button>`).join('')}</div>
      <div class="chart-title">${ch[0]} <small>${START_YEAR}–${w.year}</small></div>
      ${spark(ch[1], ch[2])}
    </section>
    <section class="card">
      <h3>Conselheiros</h3>
      ${tips.map(t => `<div class="advisor"><span class="av">${ADVISORS[t.who].icon}</span><div><b>${ADVISORS[t.who].name}</b><small>${ADVISORS[t.who].role}</small><p>${t.text}</p></div></div>`).join('')}
    </section>
    <section class="card">
      <h3>Jornal</h3>
      ${w.log.slice(-7).reverse().map(l => `<div class="news"><span>${l.icon}</span><div><small>${l.year}</small>${esc(l.text)}</div></div>`).join('') || '<p class="dim">Sem notícias ainda. Passe o primeiro ano.</p>'}
    </section>`;
}

// ---- Orçamento
function effLoss(c) { return 1 - c.corr / 170; }
function spendProjection(c, s) {
  const eff = effLoss(c), v = c.sp[s.id];
  const m = { edu: 'edu', health: 'health', infra: 'infra', rd: 'tech', def: 'mil' }[s.id];
  if (!m) return null;
  const k = { edu: 0.75, health: 0.75, infra: 0.8, rd: 1.2, def: 0.9 }[s.id];
  return grow(c[m], v, eff, s.maint, k);
}
function budgetSummary() {
  const c = Game.me, w = Game.w, b = budget(c, w);
  const gdp = c.pop * c.gdpPc;
  return `
    <div class="sumrow"><span>Receita</span><b>${nf(b.revenue, 1)}% PIB <small>(${fmtGdp(b.revenue / 100 * gdp)})</small></b></div>
    <div class="sumrow"><span>Despesas totais</span><b>${nf(b.expense, 1)}% PIB</b></div>
    <div class="sumrow sub"><span>↳ áreas escolhidas</span><b>${nf(b.spend, 1)}%</b></div>
    <div class="sumrow sub"><span>↳ previdência (obrigatória)</span><b>${nf(b.pens, 1)}%</b></div>
    <div class="sumrow sub"><span>↳ custo das leis</span><b>${nf(b.upk, 1)}%</b></div>
    <div class="sumrow sub"><span>↳ juros da dívida (${nf(b.rate, 1)}% a.a.)</span><b>${nf(b.interest, 1)}%</b></div>
    <div class="sumrow total ${b.balance < -3 ? 'bad' : b.balance < 0 ? 'mid' : 'good'}"><span>Saldo do ano</span><b>${sign(b.balance)}% PIB</b></div>`;
}
function tabOrc(v) {
  const c = Game.me;
  v.innerHTML = `
    <section class="card"><h3>Resumo das contas</h3><div id="bsum">${budgetSummary()}</div>
      <p class="dim">Déficit vira dívida; dívida alta eleva juros e derruba o rating. Corrupção desperdiça parte de cada gasto.</p></section>
    <section class="card">
      <h3>Impostos</h3>
      <div class="slider"><div class="srow"><span>🧾 Carga tributária</span><b id="v-tax">${nf(c.tax, 1)}% do PIB</b></div>
        <input type="range" min="8" max="50" step="0.5" value="${c.tax}" data-sp="tax"><small class="dim">Mais imposto = mais receita, mas menos crescimento e o empresariado reclama.</small></div>
    </section>
    <section class="card">
      <h3>Gastos por área</h3>
      ${SPEND.map(s => {
        const pr = spendProjection(c, s);
        return `<div class="slider"><div class="srow"><span>${s.icon} ${s.name}</span><b id="v-${s.id}">${nf(c.sp[s.id], 1)}%</b></div>
        <input type="range" min="0" max="${s.max}" step="0.1" value="${c.sp[s.id]}" data-sp="${s.id}">
        <small class="dim" id="p-${s.id}">${projText(c, s)}</small></div>`;
      }).join('')}
    </section>`;
}
function projText(c, s) {
  const gdp = c.pop * c.gdpPc;
  const pr = spendProjection(c, s);
  let t = `≈ ${fmtGdp(c.sp[s.id] / 100 * gdp)}/ano · manutenção ${nf(s.maint * (0.6 + 0.8 * ({ edu: c.edu, health: c.health, infra: c.infra, rd: c.tech, def: c.mil }[s.id] || 50) / 100), 1)}%. `;
  if (pr !== null) t += pr > 0.05 ? `<span class="good">▲ +${nf(pr, 1)}/ano</span>` : pr < -0.05 ? `<span class="bad">▼ ${nf(pr, 1)}/ano</span>` : '<span class="mid">estável</span>';
  else t += s.tip;
  return t;
}

// ---- Leis
const FXN = { edu: ['Educação', 1], health: ['Saúde', 1], infra: ['Infraestrutura', 1], tech: ['Tecnologia', 1], ineq: ['Desigualdade', -1], corr: ['Corrupção', -1], crime: ['Criminalidade', -1], pollution: ['Poluição', -1], jobs: ['Empregos', 1], mil: ['Força militar', 1], comm: ['Dependência de commodities', -1], infl: ['Inflação', -1], gBonus: ['Crescimento', 1], birthT: ['Natalidade', 0], migr: ['Imigração', 0], collect: ['Arrecadação', 1], pension: ['Gasto com previdência', -1], influence: ['Influência', 1], open: ['Abertura comercial', 0] };
const CATS = ['Todas', 'Ativas', 'Economia', 'Social', 'Demografia', 'Governança', 'Tecnologia', 'Defesa'];
function policyCard(c, p) {
  const act = c.pol[p.id], can = canEnact(c, p.id);
  const fx = Object.keys(p.fx || {}).map(k => { const [n, good] = FXN[k] || [k, 0]; const up = p.fx[k] > 0; const g = good === 0 ? 'neutral' : (up === (good > 0) ? 'good' : 'bad'); return `<span class="tag ${g}">${up ? '▲' : '▼'} ${n}</span>`; });
  if (p.tgt && p.tgt.open) fx.push(`<span class="tag neutral">${p.tgt.open > 50 ? '▲' : '▼'} Abertura comercial</span>`);
  if (p.once) for (const k in p.once) { if (k === 'debt') fx.push(`<span class="tag good">${p.once[k] < 0 ? '−' : '+'}${Math.abs(p.once[k])}% dívida (único)</span>`); }
  const fac = Object.entries(p.fac || {}).map(([f, v]) => `<span class="tag ${v > 0 ? 'good' : 'bad'}">${F[f]} ${v > 0 ? '+' : '−'}${Math.abs(v)}</span>`);
  const years = act ? Math.min(p.delay, Game.w.year - act.since + 1) : 0;
  return `<article class="policy ${act ? 'active' : ''}">
    <div class="ph"><span class="pi">${p.icon}</span><div><b>${p.name}</b><small>${p.cat} · ⭐ ${p.cp} · 💰 ${p.upkeep > 0 ? '−' : '+'}${nf(Math.abs(p.upkeep), 1)}% PIB/ano · ⏳ ${p.delay} anos</small></div>${act ? '<span class="badge">EM VIGOR</span>' : ''}</div>
    <p>${p.desc}</p>
    <div class="tags">${fx.join('')}</div>
    <div class="tags">${fac.join('')}</div>
    ${act ? `<div class="ramp">Efeito pleno: ${years}/${p.delay} anos${bar(years, p.delay, 'blue')}</div><button class="btn small ghost" data-repeal="${p.id}">Revogar (⭐1)</button>`
      : `<button class="btn small ${can.ok ? '' : 'dis'}" data-enact="${p.id}" ${can.ok ? '' : 'disabled'}>${can.ok ? 'Aprovar lei' : can.why}</button>`}
  </article>`;
}
function tabLeis(v) {
  const c = Game.me;
  let list = POLICIES.slice();
  if (ui.polCat === 'Ativas') list = list.filter(p => c.pol[p.id]);
  else if (ui.polCat !== 'Todas') list = list.filter(p => p.cat === ui.polCat);
  list.sort((a, b) => (!!c.pol[b.id] - !!c.pol[a.id]) || (canEnact(c, b.id).ok - canEnact(c, a.id).ok));
  v.innerHTML = `
    <section class="card tight"><p class="dim">Leis têm <b>efeito atrasado</b>: o benefício cresce ao longo dos anos, mas o custo e a reação das facções vêm logo. Cada lei custa capital político (⭐).</p>
    <div class="chips">${CATS.map(k => `<button class="chip ${ui.polCat === k ? 'on' : ''}" data-cat="${k}">${k}${k === 'Ativas' ? ' (' + Object.keys(c.pol).length + ')' : ''}</button>`).join('')}</div></section>
    ${list.map(p => policyCard(c, p)).join('') || '<p class="dim pad">Nenhuma lei nesta categoria.</p>'}`;
}

// ---- Povo
function tabPovo(v) {
  const c = Game.me, w = Game.w;
  const sh = c.shares || factionShares(c);
  const next = TERM - (w.turn % TERM);
  const le = 38 + 0.42 * c.health + 5 * (1 - Math.exp(-c.gdpPc / 8));
  const yS = c.young / c.pop * 100, wS = c.work / c.pop * 100, oS = c.old / c.pop * 100;
  const apprCls = c.approval >= 55 ? 'good' : c.approval >= 48 ? 'mid' : 'bad';
  v.innerHTML = `
    <section class="card">
      <div class="gauge ${apprCls}"><b>${nf(c.approval, 0)}%</b><small>aprovação do governo</small></div>
      <p class="center">🗳️ Próxima eleição em <b>${next} ${next === 1 ? 'ano' : 'anos'}</b> (${w.year + next}). Projeção de votos: <b>~${nf(clamp(c.approval + INCUMBENT, 0, 100), 0)}%</b> (precisa de 50%).</p>
      <p class="dim center">Estabilidade: ${nf(c.stab, 0)}/100 — abaixo de 25 o risco de golpe e revoltas cresce.</p>
    </section>
    <section class="card"><h3>Facções</h3>
      ${FACTIONS.map(f => `<div class="faction"><div class="fh"><span class="fi">${f.icon}</span><div><b>${f.name}</b><small>peso político ${nf(sh[f.id] * 100, 0)}%</small></div><span class="fs ${sat(c.sat[f.id])}">${nf(c.sat[f.id], 0)}%</span></div>
        ${bar(c.sat[f.id], 100, sat(c.sat[f.id]))}<small class="dim">${f.desc}</small></div>`).join('')}
    </section>
    <section class="card"><h3>Demografia</h3>
      <div class="agebar"><i class="y" style="width:${yS}%"></i><i class="w" style="width:${wS}%"></i><i class="o" style="width:${oS}%"></i></div>
      <div class="legend"><span><i class="y"></i>0–14: ${nf(yS, 0)}%</span><span><i class="w"></i>15–64: ${nf(wS, 0)}%</span><span><i class="o"></i>65+: ${nf(oS, 0)}%</span></div>
      <div class="grid2">
        ${statCard('População', fmtPop(c.pop), `${sign(c.workGrowth || 0)}% força de trabalho`)}
        ${statCard('Natalidade', nf(c.birth, 0) + '‰', c.birth < 12 ? 'envelhecimento' : c.birth > 30 ? 'jovem' : 'transição')}
        ${statCard('Mortalidade', nf(c.deathRate || 0, 0) + '‰', 'por mil')}
        ${statCard('Expectativa de vida', nf(le, 0) + ' anos', 'estimada')}
        ${statCard('Urbanização', nf(c.urban, 0) + '%', `agro ${nf(c.agro, 0)}% · indústria ${nf(c.ind, 0)}%`)}
        ${statCard('Pobreza', nf(poverty(c), 0) + '%', `desigualdade ${nf(c.ineq, 0)}`)}
      </div>
    </section>`;
}
const sat = x => x >= 55 ? 'good' : x >= 40 ? 'mid' : 'bad';

// ---- Mundo
function tabMundo(v) {
  const c = Game.me, w = Game.w;
  const sh = w.shock;
  v.innerHTML = `
    <section class="card tight">
      <div class="grid2">
        ${statCard('Preço das commodities', nf(w.commPrice, 0), w.commPrice > 110 ? 'em alta' : w.commPrice < 90 ? 'em baixa' : 'estável')}
        ${statCard('Crescimento global', nf(w.globalG, 1) + '%', sh ? sh.name : 'sem crise')}
      </div>
      <p class="dim">Poder = PIB 40% · tecnologia 20% · militar 15% · influência 10% · qualidade de vida 15%. Toque em um país para ver detalhes e diplomacia.</p>
    </section>
    <section class="card tight rank">
      ${w.rankList.map(o => { const d = (o.prevRank || o.rank) - o.rank; return `<div class="rrow ${o.id === c.id ? 'me' : ''} ${o.rank <= c.goal ? 'intop' : ''}" data-c="${o.id}"><b class="n">${o.rank}</b><span class="fl">${o.flag}</span><div class="nm">${o.name}<small>${fmtGdp(o.pop * o.gdpPc)} · tec ${nf(o.tech, 0)}</small></div><span class="pw">${nf(o.power, 0)}</span><span class="dl ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}">${d > 0 ? '▲' + d : d < 0 ? '▼' + -d : '–'}</span></div>`; }).join('')}
    </section>`;
}
async function countryModal(id) {
  const c = Game.me, w = Game.w, o = w.byId[id];
  const mine = id === c.id;
  const rel = mine ? 100 : w.rel[c.id][o.id];
  const deal = mine ? { ok: false } : dealCheck(c, w, o), tt = mine ? { ok: false } : techCheck(c, w, o);
  const html = `<div class="chead"><span class="flagbig">${o.flag}</span><div><h2>${o.name}</h2><small>#${o.rank} em poder · ${fmtGdp(o.pop * o.gdpPc)} · ${fmtPop(o.pop)}</small></div></div>
    <div class="grid2 s">${statCard('PIB per capita', 'US$ ' + nf(o.gdpPc, 1) + ' mil')}${statCard('Crescimento', sign(o.g) + '%')}${statCard('Tecnologia', nf(o.tech, 0))}${statCard('Força militar', nf(o.mil, 0))}${statCard('Educação', nf(o.edu, 0))}${statCard('Influência', nf(o.influence, 0))}</div>
    ${mine ? '' : `<p class="center">Relação com você: <b>${nf(rel, 0)}</b>/100 ${bar(rel, 100, rel > 55 ? 'good' : rel > 40 ? 'mid' : 'bad')}</p><p class="dim center">${c.ag.indexOf(o.id) >= 0 ? '🤝 Acordo comercial em vigor.' : ''}</p>`}`;
  const btns = mine ? [{ label: 'Fechar' }] : [
    { label: '🤝 Acordo comercial', hint: deal.ok ? '⭐2 · +crescimento, +influência' : deal.why, dis: !deal.ok },
    { label: '🔬 Transferência de tecnologia', hint: tt.ok ? '⭐3 · +4 tecnologia · dívida +1,5%' : tt.why, dis: !tt.ok },
    { label: 'Fechar', cls: 'ghost' }];
  const i = await modal(html, btns, { dismiss: true });
  if (mine) return;
  if (i === 0) { const r = makeDeal(c, w, o); if (r.ok) { toast('Acordo comercial assinado com ' + o.name, 'good'); w.log.push({ year: w.year, icon: '🤝', text: 'Acordo comercial com ' + o.name }); } renderTab(); refreshHud(); }
  if (i === 1) { const r = techTransfer(c, w, o); if (r.ok) toast('Tecnologia transferida: +4', 'good'); renderTab(); refreshHud(); }
}

// ---------------------------------------------------------------- fluxo do ano
function deltaTag(s) {
  if (s.f === 'rank') return s.d === 0 ? '–' : `<span class="${s.d > 0 ? 'good' : 'bad'}">${s.d > 0 ? '▲' : '▼'}${Math.abs(s.d)}</span>`;
  const good = s.inv ? s.d < 0 : s.d > 0;
  const v = s.f === 'pct' ? sign(s.d, 1) + ' pt' : sign(s.d, 1) + '%';
  return `<span class="${Math.abs(s.d) < 0.05 ? '' : good ? 'good' : 'bad'}">${v}</span>`;
}
async function showReport(r) {
  const val = s => s.f === 'gdp' ? fmtGdp(s.v) : s.f === 'pop' ? fmtPop(s.v) : s.f === 'rank' ? '#' + s.v : nf(s.v, 0) + '%';
  const html = `<div class="paper"><div class="mast">O DIÁRIO DA NAÇÃO<small>${r.year} · edição anual</small></div>
    <div class="headline"><span>${r.head.icon}</span><h2>${r.head.text}</h2></div>
    <div class="grid3">${r.stats.map(s => `<div class="rs"><small>${s.k}</small><b>${val(s)}</b>${deltaTag(s)}</div>`).join('')}</div>
    ${r.bullets.length ? `<ul class="blt">${r.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
    ${r.tips.slice(0, 2).map(t => `<div class="advisor"><span class="av">${ADVISORS[t.who].icon}</span><div><b>${ADVISORS[t.who].name}</b><p>${t.text}</p></div></div>`).join('')}</div>`;
  await modal(html, [{ label: 'Continuar' }]);
}
async function showEvent(ev) {
  const a = ADVISORS[ev.who];
  const html = `<div class="evt"><div class="advisor big"><span class="av">${a.icon}</span><div><b>${a.name}</b><small>${a.role}</small></div></div><h2>${ev.icon} ${ev.title}</h2><p>${ev.text}</p></div>`;
  const i = await modal(html, ev.ch.map(x => ({ label: x.t, hint: x.h })), { cls: 'event' });
  const res = Game.choose(ev, i);
  await modal(`<div class="evt"><h3>${ev.icon} ${ev.title}</h3><p class="result">${res}</p></div>`, [{ label: 'Entendido' }]);
}
async function showElection(e) {
  const c = Game.me;
  const html = `<div class="evt center"><div class="bigicon">🗳️</div><h2>Eleições ${e.year}</h2><p>Com a aprovação em ${nf(c.approval, 0)}%, os cidadãos ${de(c)} vão às urnas...</p></div>`;
  await modal(html, [{ label: 'Ver resultado' }]);
  const res = e.won ? `<div class="evt center win"><div class="bigicon">🎉</div><h2>Reeleito!</h2><p>Você conquistou <b>${nf(e.vote, 0)}%</b> dos votos e ganha mais ${TERM} anos de mandato.</p></div>` : `<div class="evt center lose"><div class="bigicon">💔</div><h2>Derrota nas urnas</h2><p>Você obteve apenas <b>${nf(e.vote, 0)}%</b> dos votos.</p></div>`;
  await modal(res, [{ label: 'Continuar' }]);
}
async function showEnd(summary) {
  const c = Game.me, w = Game.w;
  const html = `<div class="evt center ${summary.win ? 'win' : 'lose'}"><div class="bigicon">${summary.win ? '🏆' : '🏚️'}</div><h2>${summary.title}</h2><p>${summary.text}</p>
    <div class="grid2 s">${statCard('PIB final', fmtGdp(c.pop * c.gdpPc))}${statCard('Ranking', '#' + c.rank + ' de ' + w.countries.length)}${statCard('População', fmtPop(c.pop))}${statCard('Aprovação', nf(c.approval, 0) + '%')}</div>
    <div class="chart-title">Poder nacional ao longo do tempo</div>${spark(c.hist.power, '#c59bff')}</div>`;
  const i = await modal(html, [{ label: 'Novo jogo' }, { label: 'Menu principal', cls: 'ghost' }]);
  Game.clearSave();
  if (i === 0) showCountrySelect(); else showTitle();
}

async function playYear() {
  if (ui.busy) return;
  ui.busy = true;
  try {
    const r = Game.nextYear();
    await showReport(r);
    for (const ev of r.pending) await showEvent(ev);
    if (r.election) {
      await showElection(r.election);
      if (!r.election.won) { await showEnd(Game.summary(null, r.election)); ui.busy = false; return; }
    }
    const end = Game.end();
    if (end) { await showEnd(Game.summary(end)); ui.busy = false; return; }
    Game.save();
    render();
  } finally { ui.busy = false; }
}

// ---------------------------------------------------------------- telas iniciais
function showTitle() {
  $('#app').innerHTML = `<div class="title">
    <div class="globe">🌍</div><h1>NAÇÃO EM ASCENSÃO</h1><p>Governe um país real, enfrente crises, equilibre as facções e leve sua nação ao topo do mundo — de ${START_YEAR} a ${END_YEAR}.</p>
    <div class="menu">
      <button class="btn big" id="t-new">▶ Novo jogo</button>
      ${Game.hasSave() ? '<button class="btn big ghost" id="t-cont">⏩ Continuar</button>' : ''}
      <button class="btn big ghost" id="t-help">❓ Como jogar</button>
    </div><small class="dim">Dados aproximados e simplificados para fins de jogo.</small></div>`;
  $('#t-new').onclick = showCountrySelect;
  if ($('#t-cont')) $('#t-cont').onclick = () => { if (Game.load()) { ui.tab = 'painel'; render(); } else toast('Não foi possível carregar', 'bad'); };
  $('#t-help').onclick = showHelp;
}
function showHelp() {
  modal(`<h2>Como jogar</h2>
    <p><b>Objetivo:</b> levar seu país ao <b>Top N</b> do ranking de poder mundial e se manter lá por ${WIN_STREAK} anos (N depende do país). Em ${END_YEAR} o jogo termina.</p>
    <p><b>A cada ano:</b> ajuste o <b>Orçamento</b>, aprove <b>Leis</b> (custam ⭐ capital político), converse com os <b>conselheiros</b> e toque em <b>Próximo ano</b>. Eventos exigem decisões com ônus e bônus.</p>
    <p><b>Povo:</b> 6 facções avaliam seu governo. A cada ${TERM} anos há <b>eleição</b>: perder significa o fim do jogo. Cuidado também com golpes e colapso.</p>
    <p><b>Dicas:</b> educação, saúde e infraestrutura rendem a longo prazo; déficits viram dívida e inflação; leis têm efeito atrasado; corrupção desperdiça gastos; o <b>Mundo</b> tem acordos comerciais e transferência de tecnologia.</p>`, [{ label: 'Entendi' }], { dismiss: true });
}
function showCountrySelect() {
  const list = COUNTRIES.slice().sort((a, b) => b.diff - a.diff || b.pop * b.gdp - a.pop * a.gdp);
  $('#app').innerHTML = `<div class="select"><header class="sh"><button class="btn small ghost" id="back">←</button><div><h2>Escolha seu país</h2><small>Comece pelos países em desenvolvimento: o desafio é maior</small></div></header>
    <div class="clist">${list.map(c => `<article class="ccard" data-id="${c.id}"><span class="flagbig">${c.flag}</span><div class="ci"><b>${c.name}</b><small>${fmtPop(c.pop)} · US$ ${nf(c.gdp, 1)} mil per capita · meta Top ${c.goal}</small><p>${c.blurb}</p><div class="stars">${'★'.repeat(c.diff)}${'☆'.repeat(5 - c.diff)} <small>dificuldade</small></div></div></article>`).join('')}</div></div>`;
  $('#back').onclick = showTitle;
  $('.clist').onclick = async e => {
    const a = e.target.closest('.ccard'); if (!a) return;
    const id = a.dataset.id;
    const d = COUNTRIES.find(x => x.id === id);
    const b = Game.start(id);
    const c = Game.me;
    const html = `<div class="chead"><span class="flagbig">${c.flag}</span><div><h2>${c.name}, ${START_YEAR}</h2><small>Meta: Top ${c.goal} do mundo por ${WIN_STREAK} anos</small></div></div>
      <p>${b.blurb}</p><h3>Seus maiores desafios</h3>
      ${b.issues.map(i => `<div class="advisor"><span class="av">${ADVISORS[i.who].icon}</span><div><b>${ADVISORS[i.who].name}</b><p>${i.text}</p></div></div>`).join('')}`;
    const i = await modal(html, [{ label: 'Assumir o governo' }, { label: 'Escolher outro', cls: 'ghost' }]);
    if (i === 0) { ui.tab = 'painel'; Game.save(); render(); }
  };
}

// ---------------------------------------------------------------- eventos de interface
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t && $('#view')) { ui.tab = t.dataset.tab; document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b === t)); renderTab(); return; }
  if (e.target.closest('#next')) { playYear(); return; }
  const ch = e.target.closest('[data-chart]'); if (ch) { ui.chart = ch.dataset.chart; renderTab(); return; }
  const ct = e.target.closest('[data-cat]'); if (ct) { ui.polCat = ct.dataset.cat; renderTab(); return; }
  const en = e.target.closest('[data-enact]');
  if (en) { const r = enact(Game.me, Game.w, en.dataset.enact); if (r.ok) { toast('Lei aprovada: ' + POL[en.dataset.enact].name, 'good'); recalcStance(Game.me); computeSat(Game.me, Game.w); Game.save(); } else toast(r.why, 'bad'); renderTab(); refreshHud(); return; }
  const rp = e.target.closest('[data-repeal]');
  if (rp) { const r = repeal(Game.me, Game.w, rp.dataset.repeal); if (r.ok) { toast('Lei revogada', 'mid'); recalcStance(Game.me); computeSat(Game.me, Game.w); Game.save(); } else toast(r.why || 'Sem capital político', 'bad'); renderTab(); refreshHud(); return; }
  const rr = e.target.closest('.rrow'); if (rr) { countryModal(rr.dataset.c); return; }
});
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.sp;
  if (!k) return;
  const c = Game.me, v = parseFloat(e.target.value);
  if (k === 'tax') { c.tax = v; $('#v-tax').textContent = nf(v, 1) + '% do PIB'; }
  else { c.sp[k] = v; $('#v-' + k).textContent = nf(v, 1) + '%'; const s = SPEND.find(x => x.id === k); $('#p-' + k).innerHTML = projText(c, s); }
  $('#bsum').innerHTML = budgetSummary();
});
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.sp) Game.save(); });

window.addEventListener('load', showTitle);
