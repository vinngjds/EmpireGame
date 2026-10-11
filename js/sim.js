'use strict';
// Simulação: países, economia, demografia, política, mundo e IA ---------------

const D = w => DIFFS[w.diff || 'normal'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function rnd(w) { w.rs = (w.rs + 0x6d2b79f5) | 0; let t = Math.imul(w.rs ^ (w.rs >>> 15), 1 | w.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss(w) { return (rnd(w) + rnd(w) + rnd(w) - 1.5) * 2; }
function pick(w, arr) { return arr[Math.floor(rnd(w) * arr.length)]; }

const DEF_SP = (c) => ({ edu: 2.4 + c.edu * 0.034, health: 2.0 + c.health * 0.04, infra: 1.4 + c.infra * 0.02, rd: 0.2 + c.tech * 0.016, def: 1.0 + c.mil * 0.012, pol: 0.9 + 0.01 * c.crime, welf: Math.min(4, 0.4 + 0.12 * c.gdp) });

function makeCountry(d, w) {
  const c = Object.assign({}, d);
  c.gdpPc = d.gdp; delete c.gdp;
  c.gdp = 0;
  c.young = 0; c.work = 0; c.old = 0;
  const oldS = clamp(0.26 * Math.pow(Math.max(0, 1 - d.birth / 42), 2.5), 0.025, 0.3);
  const youngS = clamp(0.08 + 0.0085 * d.birth, 0.14, 0.45);
  c.young = c.pop * youngS; c.old = c.pop * oldS; c.work = c.pop - c.young - c.old;
  c.crime = d.crime || 45; c.pollution = d.poll || 35; c.jobs = 55; c.rating = 60; c.influence = 30;
  c.infl = d.infl || 5; c.debt = d.debt || 50;
  c.sp = DEF_SP(c);
  c.pol = {}; c.cp = 6; c.shock = {}; c.stance = {}; c.sat = {};
  for (const f of FACTIONS) { c.shock[f.id] = 0; c.stance[f.id] = 0; c.sat[f.id] = 50; }
  c.birthAdj = 0; c.migrPol = 0; c.gBonus = 0; c.collectB = 0; c.pensionMod = 1; c.g = 2; c.stab = 60; c.approval = 50;
  c.ag = []; // acordos comerciais (ids de países)
  c.lastTech = 0;
  c.hist = { gdp: [], pop: [], approval: [], power: [], gdpPc: [], rank: [] };
  c.ai = { hawk: rnd(w), skill: 0.35 + rnd(w) * 0.5 };
  c.birthBase = d.birth; c.birthOff = d.birth - birthFormula(c);
  c.tax = 20;
  c.sat = {}; for (const f of FACTIONS) c.sat[f.id] = 50;
  // imposto inicial: equilibra o orçamento com déficit leve
  const b0 = budget(c, w);
  c.tax = clamp((b0.expense - 1 - b0.rents) / b0.collect, 8, 48);
  return c;
}

function makeWorld(playerId, seed) {
  const w = { diff: 'normal', war: null, rs: seed | 0, year: START_YEAR, turn: 0, playerId, worldA: 1, commPrice: 100, globalG: 3, shock: null, news: [], over: null, streak: 0, rel: {}, log: [], evCd: {}, sched: [] };
  w.countries = COUNTRIES.map(d => makeCountry(d, w));
  w.byId = {}; for (const c of w.countries) w.byId[c.id] = c;
  for (const a of w.countries) { w.rel[a.id] = {}; for (const b of w.countries) if (a !== b) w.rel[a.id][b.id] = 40 + Math.floor(rnd(w) * 25); }
  w.sched = [
    { year: START_YEAR + 7 + Math.floor(rnd(w) * 4), type: 'crise_fin' },
    { year: START_YEAR + 19 + Math.floor(rnd(w) * 3), type: 'pandemia' },
    { year: START_YEAR + 26 + Math.floor(rnd(w) * 4), type: 'revolucao_ia' },
    { year: START_YEAR + 31 + Math.floor(rnd(w) * 4), type: 'crise_energia' },
    { year: START_YEAR + 39 + Math.floor(rnd(w) * 4), type: 'crise_clima' },
  ];
  updateRanks(w);
  for (const c of w.countries) { recordHist(c, w); c.startRank = c.rank; }
  return w;
}

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------
function pensionPct(c) { return (c.old / c.pop) * 100 * 0.5 * c.pensionMod; }
function upkeepPct(c) { let u = 0; for (const id in c.pol) u += POL[id].upkeep || 0; return u; }
function budget(c, w) {
  const collect = clamp(0.5 + 0.0028 * (100 - c.corr) + c.infra * 0.0012 + c.collectB, 0.45, 0.97);
  const rents = (c.comm / 100) * 0.055 * (w.commPrice / 100) * 100 / 10;
  let spend = 0; for (const s of SPEND) spend += c.sp[s.id];
  const pens = pensionPct(c), upk = upkeepPct(c);
  const rate = 2 + (100 - c.rating) * 0.08 + c.infl * 0.5;
  const interest = c.debt * rate / 100;
  const expense = spend + pens + upk + interest;
  const revenue = c.tax * collect + rents;
  return { collect, rents, spend, pens, upk, interest, rate, expense, revenue, balance: revenue - expense };
}

// ---------------------------------------------------------------------------
// Facções
// ---------------------------------------------------------------------------
function factionShares(c) {
  const urb = c.urban / 100;
  const raw = {
    workers: 0.18 + 0.22 * (c.ind + (100 - c.agro - c.ind) * 0.6) / 60,
    business: 0.10 + 0.08 * urb,
    military: 0.05 + 0.1 * c.mil / 100,
    religious: 0.22 - 0.1 * urb,
    rural: 0.04 + 0.9 * c.agro / 100 * (1 - urb * 0.3),
    youth: 0.08 + 0.18 * urb * clamp(c.young / c.pop * 3, 0.4, 1.4),
  };
  let s = 0; for (const k in raw) s += raw[k];
  for (const k in raw) raw[k] /= s;
  return raw;
}
function poverty(c) { return clamp(85 * Math.exp(-c.gdpPc * (1 - c.ineq / 130) / 3.5), 1, 90); }
function computeSat(c, w) {
  const b = c.lastBudget || budget(c, w);
  const pov = poverty(c);
  const S = c.sp;
  const t = {
    workers: 50 + 0.45 * (c.jobs - 50) - 0.30 * (c.ineq - 50) + 2.0 * (S.welf - 1.5) - 0.9 * Math.max(0, c.infl - 6) - 0.15 * (pov - 30) + 1.0 * (c.g - 3),
    business: 50 + 2.5 * (c.g - 3) - 0.9 * (c.tax - 24) - 0.25 * (c.corr - 40) + 0.12 * (c.infra - 50) + 0.1 * (c.open - 50) - 0.7 * Math.max(0, c.infl - 6) - 0.4 * Math.max(0, b.balance < -3 ? 3 : 0),
    military: 50 + 6 * (S.def - 1.8) + 0.2 * (c.mil - 50) - 0.2 * Math.max(0, 55 - c.stab) + 0.1 * (c.influence - 40),
    religious: 50 - 0.28 * (c.crime - 40) - 0.15 * (c.corr - 40) - 0.15 * (c.urban - 50) * 0.5,
    rural: 50 + 0.2 * (c.infra - 50) + 1.5 * (c.g - 3) - 0.4 * (c.tax - 24) + 0.08 * (c.comm - 40) - 0.4 * Math.max(0, c.infl - 8),
    youth: 50 + 0.18 * (c.edu - 50) + 0.4 * (c.jobs - 50) - 0.3 * (c.pollution - 40) + 0.12 * (c.tech - 50) - 0.2 * (c.corr - 40) + 0.8 * (S.edu - 4),
  };
  for (const f of FACTIONS) {
    let v = t[f.id] + c.stance[f.id] + c.shock[f.id];
    v = clamp(v, 0, 100);
    c.sat[f.id] = lerp(c.sat[f.id], v, 0.55);
  }
  const sh = factionShares(c);
  c.shares = sh;
  let a = 0; for (const f of FACTIONS) a += sh[f.id] * c.sat[f.id];
  c.approval = a;
  c.stab = clamp(0.5 * a + 0.3 * (100 - c.crime) + 0.2 * Math.min(100, c.rating + 20) - 3 * Math.max(0, c.infl - 15) * 0.3 + (c.pol.autoritarismo ? 14 : 0) - (c.war ? 0.2 * (c.fatigue || 0) : 0), 0, 100);
}

// ---------------------------------------------------------------------------
// Política: leis
// ---------------------------------------------------------------------------
function canEnact(c, id) {
  const p = POL[id];
  if (c.pol[id]) return { ok: false, why: 'Já em vigor' };
  if (c.cp < p.cp) return { ok: false, why: 'Capital político insuficiente' };
  if (p.excl) for (const e of p.excl) if (c.pol[e]) return { ok: false, why: 'Conflita com: ' + POL[e].name };
  if (p.req && !p.req(c)) return { ok: false, why: 'Requisito não atendido' };
  return { ok: true };
}
function enact(c, w, id) {
  const r = canEnact(c, id);
  if (!r.ok) return r;
  const p = POL[id];
  c.cp -= p.cp;
  c.pol[id] = { since: w.year };
  if (p.once) for (const k in p.once) { if (k === 'debt') c.debt = Math.max(0, c.debt + p.once[k]); else if (k === 'rating') c.rating = clamp(c.rating + p.once[k], 0, 100); else c[k] = clamp(c[k] + p.once[k], 0, 100); }
  for (const f in p.fac || {}) c.shock[f] += (p.fac[f] > 0 ? 0 : p.fac[f] * 0.6);
  return { ok: true };
}
function repeal(c, w, id) {
  if (!c.pol[id] || c.cp < 1) return { ok: false, why: c.pol[id] ? 'Precisa de 1 capital político' : '' };
  c.cp -= 1;
  const p = POL[id];
  delete c.pol[id];
  for (const f in p.fac || {}) c.shock[f] -= Math.max(0, p.fac[f]) * 0.8;
  return { ok: true };
}
function recalcStance(c) {
  for (const f of FACTIONS) c.stance[f.id] = 0;
  for (const id in c.pol) { const p = POL[id]; for (const f in p.fac || {}) c.stance[f] += p.fac[f]; }
}

// ---------------------------------------------------------------------------
// Passo anual de um país
// ---------------------------------------------------------------------------
function birthFormula(c) { return 8 + 30 * Math.pow(Math.max(0, 1 - (0.45 * c.edu + 0.30 * c.urban + 0.25 * Math.min(100, c.gdpPc * 4)) / 100), 1.4); }
function grow(stock, spend, eff, maint, k) {
  const m = maint * (0.6 + 0.8 * stock / 100);
  return (spend * eff - m) * k * (1 - Math.pow(stock / 94, 2)) - 0.25 * stock / 100;
}
function stepCountry(c, w) {
  const y = w.year;
  const prev = { gdp: c.pop * c.gdpPc, pop: c.pop, approval: c.approval, tech: c.tech, edu: c.edu, health: c.health, infl: c.infl, debt: c.debt, crime: c.crime };
  // --- efeitos das leis
  const acc = {};
  let birthT = 0, migr = 0, gB = 0;
  for (const id in c.pol) {
    const p = POL[id];
    const ramp = Math.min(1, (y - c.pol[id].since + 1) / Math.max(1, p.delay || 1));
    for (const k in p.fx || {}) {
      const v = p.fx[k] * ramp;
      if (k === 'birthT') birthT += v * 2; else if (k === 'migr') migr += v; else if (k === 'gBonus') gB += v; else acc[k] = (acc[k] || 0) + v;
    }
    for (const k in p.tgt || {}) c[k] += clamp(p.tgt[k] - c[k], -6, 6) * ramp;
  }
  c.birthAdj = lerp(c.birthAdj, birthT, 0.3); c.migrPol = migr; c.gBonus = gB;
  c.collectB = clamp(c.collectB + (acc.collect || 0) / 100, 0, 0.15);
  c.pensionMod = clamp(c.pensionMod + (acc.pension || 0), 0.5, 1.3);
  const direct = ['edu', 'health', 'infra', 'tech', 'ineq', 'corr', 'crime', 'pollution', 'jobs', 'mil', 'influence', 'comm', 'infl'];
  const sat = ['edu', 'health', 'infra', 'tech', 'mil', 'influence'];
  for (const k of direct) if (acc[k]) c[k] += (sat.indexOf(k) >= 0 && acc[k] > 0) ? acc[k] * Math.max(0.05, 1 - c[k] / 100) * 1.4 : acc[k];

  // --- gastos -> estoques
  const eff = 1 - c.corr / 170;
  const S = c.sp;
  c.edu += grow(c.edu, S.edu, eff, 2.2, 0.6);
  c.health += grow(c.health, S.health, eff, 2.2, 0.6) - 0.012 * Math.max(0, c.pollution - 50);
  c.infra += grow(c.infra, S.infra, eff, 1.6, 0.62);
  const absorb = Math.max(0, 94 - c.tech) * 0.013 * (0.25 + 0.75 * c.open / 100) * Math.pow(c.edu / 100, 1.5) * (1 + 0.1 * c.ag.length);
  c.tech += grow(c.tech, S.rd, eff, 0.3, 0.9) + absorb;
  c.mil += grow(c.mil, S.def, eff, 1.5, 0.8);
  c.influence += (0.5 * gdpScale(c) + 0.25 * c.mil + 0.25 * c.tech - c.influence) * 0.07;
  c.ineq += 0.12 * (c.comm - 40) / 40 + 0.05 * (c.g - 3) - (S.welf * eff) * 0.30 - 0.012 * (c.edu - 50);
  c.crime += 0.04 * (c.ineq - 45) - (S.pol * eff - 1.2) * 1.1 + 0.025 * (poverty(c) - 30) + 0.008 * (c.urban - 50);
  c.corr += 0.14 + 0.003 * (c.comm - 40) + (c.corr < 25 ? 0.25 : 0);
  c.pollution += 0.8 * c.ind / 30 + 0.04 * Math.min(c.gdpPc, 30) - 1.0;

  // --- economia
  const Z = 0.30 * c.tech + 0.20 * c.edu + 0.20 * c.infra + 0.15 * (100 - c.corr) + 0.15 * c.health;
  const pot = 48 * Math.pow(clamp(Z, 1, 100) / 100, 2.6) * w.worldA;
  const gap = pot / c.gdpPc - 1;
  let g = clamp(gap * 3.0, -3, 7);
  g += c.gBonus;
  g += ((c.open - 50) / 100) * (w.globalG - 2) * 0.4 + c.ag.length * 0.12;
  g -= 0.10 * (c.tax - 25);
  g -= 0.18 * Math.max(0, c.infl - 6);
  g -= 0.05 * Math.max(0, 50 - c.stab);
  g -= 0.02 * Math.max(0, c.pollution - 50);
  g -= 0.012 * Math.max(0, c.debt - 80);
  g -= 0.05 * Math.max(0, c.old / c.pop * 100 - 12);
  g += ((w.commPrice - 100) / 100) * (c.comm / 100) * 6;
  if (w.shock) g += w.shock.g * (0.5 + c.open / 200);
  g += gauss(w) * 0.8;
  g = clamp(g, -9, 11);
  c.g = g;
  c.gdpPc *= 1 + g / 100;
  c.gdp = c.pop * c.gdpPc;
  // setores
  c.ind += ((12 + 28 * Math.exp(-Math.pow(Math.log((c.gdpPc + 1) / 12), 2) / 1.5)) - c.ind) * 0.1;
  c.agro += ((38 * Math.exp(-c.gdpPc / 7) + 2) - c.agro) * 0.1;
  c.urban += ((20 + 75 * (1 - Math.exp(-c.gdpPc / 9))) - c.urban) * 0.05 + 0.02 * (c.infra - 50) / 10;
  c.urban = clamp(c.urban, 8, 98);

  // --- finanças
  const b = budget(c, w);
  const infT = 2.5 + 1.1 * Math.max(0, -b.balance - 1.5) + 0.12 * Math.max(0, g - 5) + (w.shock ? w.shock.infl : 0);
  c.infl += (infT - c.infl) * 0.4;
  c.debt = Math.max(0, c.debt / (1 + (g + c.infl) / 100) - b.balance);
  const ratT = 82 - 0.35 * Math.max(0, c.debt - 40) - 1.4 * Math.max(0, c.infl - 4) - 0.30 * (c.corr - 30) + 0.4 * (c.stab - 50);
  c.rating += (clamp(ratT, 0, 100) - c.rating) * 0.25;
  c.lastBudget = b;

  // --- demografia
  const hf = Math.max(0.5, 1.8 - c.health / 60);
  const dY = c.young * 0.005 * hf, dW = c.work * 0.0065 * hf, dO = c.old * 0.09 * hf;
  const bt = clamp(birthFormula(c) + c.birthOff * Math.pow(0.97, w.turn) + c.birthAdj, 6, 50);
  c.birth = lerp(c.birth, bt, 0.12);
  c.deathRate = (dY + dW + dO) / c.pop * 1000;
  const births = c.pop * c.birth / 1000;
  const mig = c.pop * clamp(c.migrPol / 100 + (c.stab - 55) / 9000 + (c.jobs - 55) / 9000, -0.004, 0.004);
  const workBefore = c.work;
  const y2w = c.young / 15, w2o = c.work / 50;
  c.young = Math.max(0.01, c.young + births - y2w - dY);
  c.work = Math.max(0.01, c.work + y2w - w2o - dW + mig);
  c.old = Math.max(0.01, c.old + w2o - dO);
  c.pop = c.young + c.work + c.old;
  c.gdp = c.pop * c.gdpPc;
  const wg = (c.work / workBefore - 1) * 100;
  c.workGrowth = wg;
  c.jobs += (clamp(52 + 4 * g - 6 * Math.max(0, wg), 5, 95) - c.jobs) * 0.35;

  // limites
  for (const k of ['edu', 'health', 'infra', 'tech', 'mil', 'influence', 'comm', 'jobs', 'crime', 'pollution', 'open', 'rating']) c[k] = clamp(c[k], 0, 100);
  c.ineq = clamp(c.ineq, 12, 85); c.corr = clamp(c.corr, 8, 95); c.infl = clamp(c.infl, -2, 200);

  // --- política
  for (const f of FACTIONS) c.shock[f.id] *= 0.55;
  recalcStance(c);
  computeSat(c, w);
  c.cp = Math.min(12, c.cp + 3 + (c.approval - 50) / 20 + (c.stab > 70 ? 0.5 : 0) + (c.id === w.playerId ? D(w).cp : 0));
  recordHist(c, w);
  return { prev };
}
function gdpScale(c) { return clamp(100 * (Math.log(Math.max(1, c.pop * c.gdpPc)) - Math.log(50)) / (Math.log(60000) - Math.log(50)), 0, 100); }
function quality(c) { return clamp(0.3 * c.edu + 0.3 * c.health + 0.4 * Math.min(100, c.gdpPc * 2.2), 0, 100); }
function powerOf(c) { return 0.4 * gdpScale(c) + 0.2 * c.tech + 0.15 * c.mil + 0.1 * c.influence + 0.15 * quality(c); }
function recordHist(c, w) {
  const h = c.hist;
  h.gdp.push(Math.round(c.pop * c.gdpPc)); h.pop.push(+c.pop.toFixed(1)); h.approval.push(Math.round(c.approval)); h.power.push(+powerOf(c).toFixed(1)); h.gdpPc.push(+c.gdpPc.toFixed(2)); h.rank.push(c.rank || 0);
}
function updateRanks(w) {
  const arr = w.countries.slice().sort((a, b) => powerOf(b) - powerOf(a));
  arr.forEach((c, i) => { c.prevRank = c.rank || i + 1; c.rank = i + 1; c.power = powerOf(c); });
  const g = w.countries.slice().sort((a, b) => b.pop * b.gdpPc - a.pop * a.gdpPc);
  g.forEach((c, i) => { c.gdpRank = i + 1; });
  w.rankList = arr;
}

// ---------------------------------------------------------------------------
// Mundo
// ---------------------------------------------------------------------------
const SHOCKS = {
  crise_fin: { name: 'Crise financeira global', g: -4.5, infl: -1, years: 2, icon: '📉', text: 'Bancos quebram em cadeia e o crédito mundial seca.' },
  pandemia: { name: 'Pandemia global', g: -5.5, infl: 0, years: 1, icon: '🦠', text: 'Um novo vírus paralisa fronteiras, fábricas e escolas.' },
  crise_energia: { name: 'Crise energética', g: -2.5, infl: 4, years: 2, icon: '⛽', text: 'O preço da energia dispara e a inflação se espalha pelo mundo.' },
  crise_clima: { name: 'Crise climática', g: -2, infl: 1.5, years: 3, icon: '🌪️', text: 'Secas, enchentes e ondas de calor devastam colheitas em vários continentes.' },
  revolucao_ia: { name: 'Revolução da inteligência artificial', g: 1.2, infl: 0, years: 6, icon: '🤖', text: 'A IA remodela empresas e empregos: quem tem educação e tecnologia sai na frente.', worldA: 1.012 },
};

function stepWorld(w, playerReport) {
  const events = [];
  w.year++; w.turn++;
  // commodities e crescimento global
  w.commPrice = clamp(100 + (w.commPrice - 100) * 0.8 + gauss(w) * 15, 50, 170);
  w.worldA *= 1 + 0.009 + (w.shock && w.shock.worldA ? w.shock.worldA - 1 : 0) + gauss(w) * 0.001;
  // choques
  if (w.shock) { w.shock.left--; if (w.shock.left <= 0) w.shock = null; }
  for (const s of w.sched) {
    if (!s.done && s.year <= w.year) {
      s.done = true;
      const d = SHOCKS[s.type];
      w.shock = { type: s.type, name: d.name, g: d.g * (d.g < 0 ? D(w).shock : 1), infl: d.infl, left: d.years, worldA: d.worldA };
      w.log.push({ year: w.year, icon: d.icon, text: d.name + ': ' + d.text });
      events.push({ kind: 'global', type: s.type });
    }
  }
  w.globalG = 3 + (w.shock ? w.shock.g : 0);
  // países
  for (const c of w.countries) {
    if (c.id !== w.playerId) aiAct(c, w);
    stepCountry(c, w);
  }
  if (typeof aiWars === 'function') aiWars(w);
  // acordos de IA
  for (const c of w.countries) {
    if (c.id === w.playerId) continue;
    if (c.ag.length < 4 && rnd(w) < 0.06) { const o = pick(w, w.countries); if (o !== c && c.ag.indexOf(o.id) < 0 && o.ag.length < 6) { c.ag.push(o.id); if (o.id !== w.playerId) o.ag.push(c.id); } }
  }
  const before = {}; for (const c of w.countries) before[c.id] = c.rank;
  updateRanks(w);
  return events;
}

// ---------------------------------------------------------------------------
// IA dos países
// ---------------------------------------------------------------------------
function policyScore(c, p) {
  const want = { edu: (80 - c.edu) / 40, health: (80 - c.health) / 40, infra: (80 - c.infra) / 40, tech: (85 - c.tech) / 40, corr: -(c.corr - 25) / 40, crime: -(c.crime - 35) / 40, pollution: -(c.pollution - 45) / 50, ineq: -(c.ineq - 35) / 40, jobs: (60 - c.jobs) / 40, mil: (60 - c.mil) / 60 * (0.4 + c.ai.hawk), gBonus: 1.2, infl: -(c.infl - 4) / 6, influence: 0.1, comm: -(c.comm - 30) / 50, collect: (c.debt - 50) / 100, pension: -(c.old / c.pop * 100 - 8) / 20, birthT: (c.birth < 12 ? 0.25 : c.birth > 30 ? -0.25 : 0), migr: c.work / c.pop < 0.6 ? 0.5 : 0 };
  let s = 0;
  for (const k in p.fx || {}) { const wgt = want[k] === undefined ? 0 : want[k]; s += p.fx[k] * wgt * (p.delay >= 5 ? 1.2 : 1) * 3; }
  if (p.tgt && p.tgt.open) s += (p.tgt.open - c.open) * 0.01;
  s -= (p.upkeep || 0) * (c.lastBudget && c.lastBudget.balance < -2 ? 1.6 : 0.5);
  for (const f in p.fac || {}) { const sat = c.sat[f]; if (p.fac[f] < 0 && sat < 40) s -= 0.15 * -p.fac[f]; if (p.fac[f] > 0 && sat < 45) s += 0.1 * p.fac[f]; }
  return s - p.cp * 0.1;
}
function aiAct(c, w) {
  const b = c.lastBudget || budget(c, w);
  // orçamento
  for (const s of SPEND) {
    let t = s.maint * 1.1 + 0.9;
    if (s.id === 'rd') t = 0.3 + (c.tech < 80 ? 1.3 : 0.9);
    if (s.id === 'def') t = s.maint + c.ai.hawk * 1.5;
    if (s.id === 'welf') t = Math.min(4.5, 0.5 + 0.12 * c.gdpPc + (c.ineq > 50 ? 0.7 : 0));
    if (s.id === 'pol') t = s.maint + (c.crime > 50 ? 1.0 : 0.3);
    if (s.id === 'health' && c.health > 85) t = s.maint + 0.8;
    if (s.id === 'edu' && c.edu > 85) t = s.maint + 0.9;
    if (b.balance < -2.5) t *= 0.85;
    c.sp[s.id] = clamp(c.sp[s.id] + clamp(t - c.sp[s.id], -0.5, 0.5), 0, s.max);
  }
  if (b.balance < -1.5) c.tax = Math.min(42, c.tax + 0.8); else if (b.balance > 1.2 && c.tax > 16) c.tax -= 0.5;
  // leis
  // erros e crises políticas das IAs
  if (rnd(w) < 0.05) { c.gdpPc *= 1 - (0.02 + rnd(w) * 0.04); c.corr += 3; c.stab = Math.max(0, c.stab - 5); for (const k in c.pol) if (rnd(w) < 0.2) delete c.pol[k]; }
  if (c.cp >= 3 && rnd(w) < (c.id === w.playerId ? 0.5 * c.ai.skill : 0.8 * c.ai.skill * D(w).skill)) {
    let best = null, bs = 0.45;
    for (const p of POLICIES) {
      if (!canEnact(c, p.id).ok) continue;
      if (Object.keys(c.pol).length >= 12) break;
      const s = policyScore(c, p) + rnd(w) * 0.3;
      if (s > bs) { bs = s; best = p; }
    }
    if (best) enact(c, w, best.id);
  }
}

// ---------------------------------------------------------------------------
// Resultado, eleição, derrota
// ---------------------------------------------------------------------------
function electionYear(w) { return w.turn > 0 && w.turn % TERM === 0 && !w.byId[w.playerId].pol.autoritarismo; }
function runElection(c, w) {
  const vote = clamp(c.approval + D(w).inc + gauss(w) * 2.5 + (c.g > 4 ? 2 : 0) - (c.infl > 12 ? 3 : 0), 0, 100);
  return { vote, won: vote >= 50 };
}
function checkEnd(w) {
  const p = w.byId[w.playerId];
  const goal = p.goal, climber = p.startRank > goal;
  if (p.rank <= goal) w.streak++; else w.streak = 0;
  // quem sobe: vitória antecipada após manter o Top N; quem já é potência precisa se manter até o fim
  if (climber && w.streak >= D(w).streak && w.year >= START_YEAR + 15) return { win: true, why: 'goal' };
  if (p.stab <= 8) return { win: false, why: 'colapso' };
  if (p.debt > 300) return { win: false, why: 'falencia' };
  if (w.year >= END_YEAR) return { win: p.rank <= goal, why: 'fim' };
  return null;
}
function tierOf(rank) { return rank <= 3 ? 'Superpotência' : rank <= 5 ? 'Grande potência' : rank <= 10 ? 'Potência regional' : rank <= 16 ? 'Potência emergente' : 'Nação em desenvolvimento'; }

// ---------------------------------------------------------------------------
// Diplomacia
// ---------------------------------------------------------------------------
function dealCheck(c, w, o) {
  if (c.ag.indexOf(o.id) >= 0) return { ok: false, why: 'Acordo já assinado' };
  if (c.ag.length >= 5) return { ok: false, why: 'Limite de 5 acordos' };
  if (c.cp < 2) return { ok: false, why: 'Precisa de 2 capital político' };
  if (w.rel[c.id][o.id] < 40) return { ok: false, why: 'Relação baixa' };
  return { ok: true };
}
function makeDeal(c, w, o) {
  const r = dealCheck(c, w, o); if (!r.ok) return r;
  c.cp -= 2; c.ag.push(o.id); if (o.ag.indexOf(c.id) < 0) o.ag.push(c.id);
  w.rel[c.id][o.id] = Math.min(100, w.rel[c.id][o.id] + 8); w.rel[o.id][c.id] = w.rel[c.id][o.id];
  c.shock.business += 3; c.influence = Math.min(100, c.influence + 1.5);
  return { ok: true };
}
function techCheck(c, w, o) {
  if (c.cp < 3) return { ok: false, why: 'Precisa de 3 capital político' };
  if (o.tech < c.tech + 10) return { ok: false, why: 'Parceiro não tem tecnologia superior' };
  if (w.rel[c.id][o.id] < 55) return { ok: false, why: 'Relação abaixo de 55' };
  if (c.lastTech && w.year - c.lastTech < 5) return { ok: false, why: 'Aguarde 5 anos' };
  return { ok: true };
}
function techTransfer(c, w, o) {
  const r = techCheck(c, w, o); if (!r.ok) return r;
  c.cp -= 3; c.debt += 1.5; c.tech = Math.min(100, c.tech + 4); c.lastTech = w.year;
  w.rel[c.id][o.id] -= 3;
  return { ok: true };
}
