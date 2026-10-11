// Simulação headless: todos os países (inclusive o "jogador") governados pela IA
const fs = require('fs'), vm = require('vm'), path = require('path');
const files = ['data', 'sim'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8').replace(/^'use strict';/, '')).join('\n');
const ctx = vm.createContext({ console, Math });
vm.runInContext(src + '\nthis.api={makeWorld,stepWorld,COUNTRIES,END_YEAR,START_YEAR,powerOf,poverty,aiAct,stepCountry}', ctx);
const { makeWorld, stepWorld, END_YEAR, START_YEAR } = ctx.api;
const seed = +process.argv[2] || 1;
const w = makeWorld('BR', seed);
const MODE = process.argv[3] || 'passive', PID = process.argv[4] || 'BR';
w.playerId = PID; w.byId[PID].ai.skill = 1;
const rows = () => w.rankList.map(c => `${c.rank}.${c.id}`).join(' ');
for (let y = START_YEAR; y < END_YEAR; y++) {
  if (MODE === 'ai') { ctx.api.aiAct(w.byId[PID], w); }
  stepWorld(w);
  if ((y - START_YEAR) % 5 === 4) { const p = w.byId[PID]; console.log(w.year, PID, 'rank', p.rank, 'gdpPc', p.gdpPc.toFixed(1), 'g', p.g.toFixed(1), 'infl', p.infl.toFixed(0), 'debt', p.debt.toFixed(0), 'appr', p.approval.toFixed(0), 'tech', p.tech.toFixed(0)); }
  if ((y + 1 - START_YEAR) % 10 === 0) { console.log(w.year, rows()); }
}
const f = (n, d = 1) => (+n).toFixed(d);
console.log('\nid  pop   gdpPc  g    infl debt  tech edu hlth infr corr crime appr  rank');
for (const c of w.rankList) console.log(c.id.padEnd(3), f(c.pop, 0).padStart(5), f(c.gdpPc).padStart(6), f(c.g).padStart(5), f(c.infl).padStart(5), f(c.debt, 0).padStart(4), f(c.tech, 0).padStart(5), f(c.edu, 0).padStart(4), f(c.health, 0).padStart(4), f(c.infra, 0).padStart(4), f(c.corr, 0).padStart(4), f(c.crime, 0).padStart(5), f(c.approval, 0).padStart(4), c.rank);
