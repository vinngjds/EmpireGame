// Bateria de jogabilidade: bots de vários níveis jogam partidas completas (sem interface)
// Uso: node tests/bots.js [seeds=6] [paises=todos|BR,IN] [dificuldade]
const fs = require('fs'), vm = require('vm'), path = require('path');
const files = ['data', 'sim', 'events', 'war', 'game'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8').replace(/^'use strict';/, '')).join('\n');
const ctx = vm.createContext({ console, Math, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } });
vm.runInContext(src + '\nthis.X={Game,POL:null,warTurn,warAuto,COUNTRIES,aiAct,enact,canEnact,computeSat,recalcStance,updateRanks,END_YEAR,START_YEAR,WIN_STREAK,POLICIES,rnd,FACTIONS};', ctx);
const { Game, COUNTRIES, aiAct, END_YEAR, START_YEAR, warTurn, warAuto } = ctx.X;

const SEEDS = +process.argv[2] || 6;
const ONLY = process.argv[3] && process.argv[3] !== 'todos' ? process.argv[3].split(',') : null;
const DIFF = process.argv[4] || null;

// avalia o estado do país para escolher respostas a eventos
const value = c => c.approval * 1.0 + c.g * 2 + c.stab * 0.3 - Math.max(0, c.debt - 60) * 0.1 - Math.max(0, c.infl - 8) * 0.8 + c.tech * 0.15 + c.edu * 0.1 + c.health * 0.1;
function chooseEvent(level, ev) {
  if (level === 'novato') return Math.floor(ctx.X.rnd(Game.w) * ev.ch.length);
  let best = 0, bv = -1e9;
  for (let i = 0; i < ev.ch.length; i++) {
    const w0 = JSON.stringify(Game.w, (k, v) => (k === 'byId' || k === 'rankList' ? undefined : v));
    const wc = JSON.parse(w0); wc.byId = {}; for (const c of wc.countries) wc.byId[c.id] = c;
    const c = wc.byId[wc.playerId];
    try { ev.ch[i].do(c, wc); } catch (e) { continue; }
    ctx.X.recalcStance(c); ctx.X.computeSat(c, wc);
    const v = value(c) + (level === 'expert' ? 0 : ctx.X.rnd(Game.w) * 4);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}
function play(id, level, seed) {
  Game.start(id, seed, DIFF || 'normal');
  const w = Game.w, c = Game.me;
  const skill = { novato: 0.3, medio: 0.65, expert: 1, autocrata: 1 }[level];
  c.ai.skill = skill;
  let end = null, election = null, wars = 0;
  for (let y = 0; y < 55 && !end; y++) {
    if (level === 'autocrata' && y === 1) { c.cp = Math.max(c.cp, 5); ctx.X.enact(c, w, 'autoritarismo'); }
    if (level !== 'novato' || y % 2 === 0) aiAct(c, w);
    const r = Game.nextYear();
    for (const ev of r.pending) { const i = chooseEvent(level, ev); Game.choose(ev, i); }
    if (w.war) { wars++; const wr = warTurn(c, w, warAuto(c, w, level === 'autocrata' ? 'expert' : level)); if (wr.ended) warOut[wr.outcome] = (warOut[wr.outcome] || 0) + 1; }
    if (r.election && !r.election.won) { election = r.election; end = { win: false, why: 'eleicao' }; break; }
    end = Game.end();
  }
  return { id, level, seed, year: w.year, rank: c.rank, goal: c.goal, win: !!(end && end.win), why: end ? end.why : 'fim', approval: c.approval, debt: c.debt, wars };
}
const levels = ['novato', 'medio', 'expert', 'autocrata'];
const results = [], warOut = {};
const ids = ONLY || COUNTRIES.map(c => c.id);
for (const id of ids) for (const lv of levels) for (let s = 1; s <= SEEDS; s++) results.push(play(id, lv, 1000 * s + id.charCodeAt(0) + id.charCodeAt(1)));
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
console.log('\n=== Resultados por nível (todas as partidas) ===');
for (const lv of levels) {
  const r = results.filter(x => x.level === lv), wins = r.filter(x => x.win);
  const why = {}; for (const x of r.filter(x => !x.win)) why[x.why] = (why[x.why] || 0) + 1;
  const avgYear = wins.length ? Math.round(wins.reduce((a, x) => a + x.year, 0) / wins.length) : '-';
  console.log(lv.padEnd(8), 'vitórias', pct(wins.length, r.length).padStart(4), '| ano médio da vitória', avgYear, '| derrotas:', JSON.stringify(why));
}
console.log('\nGuerras (turnos em guerra por partida):', (results.reduce((a, x) => a + x.wars, 0) / results.length).toFixed(2), '| partidas com guerra:', pct(results.filter(x => x.wars).length, results.length), '| desfechos:', JSON.stringify(warOut));
console.log('\n=== Vitórias por país (novato/médio/expert/autocrata) ===');
for (const id of ids) {
  const row = levels.map(lv => { const r = results.filter(x => x.id === id && x.level === lv); return pct(r.filter(x => x.win).length, r.length).padStart(4); });
  const d = COUNTRIES.find(c => c.id === id);
  console.log(id.padEnd(3), (d.name).padEnd(15), 'meta Top', String(d.goal).padStart(2), 'dif', d.diff, row.join(' '));
}
if (process.argv[5] === 'json') fs.writeFileSync('/tmp/bots.json', JSON.stringify(results));
