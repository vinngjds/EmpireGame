// Simulação headless: IA vs IA, para validar lógica de jogo sem navegador.
// Uso: node tests/sim.js [minutos] [tamanho] [modo] [mapa]
const fs = require('fs'), vm = require('vm'), path = require('path');
const files = ['util', 'data', 'map', 'game', 'units', 'ai'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8').replace(/^'use strict';/, '')).join('\n');
const ctx = vm.createContext({ console, Math, performance, Date });
vm.runInContext(src + '\nthis.Game=Game; this.STEP=STEP; this.AGES=AGES; this.UNITS=UNITS; this.BUILDINGS=BUILDINGS;', ctx);
const { Game, STEP } = ctx;

const minutes = +process.argv[2] || 20;
const size = process.argv[3] || 'small';
const mode = process.argv[4] || 'conquest';
const mapType = process.argv[5] || 'arabia';
const lv = process.argv[6] || 'hard';
const civs = ['britons', 'franks', 'mongols', 'chinese', 'goths', 'persians', 'turks', 'japanese'];
const nP = { tiny: 2, small: 4, medium: 6, large: 8 }[size];
const players = [];
for (let i = 0; i < nP; i++) players.push({ name: 'IA' + i, civ: civs[i], team: i % 2 + 1, color: i, ai: lv });
const g = new Game({ players, mapType, mapSize: size, mode, startRes: mode === 'deathmatch' ? 'high' : 'standard', seed: 1234 });
const t0 = Date.now();
let ticks = 0, maxMs = 0;
const total = minutes * 60 / STEP;
for (let i = 0; i < total && !g.over; i++) {
  const a = process.hrtime.bigint();
  g.update(STEP); ticks++;
  const ms = Number(process.hrtime.bigint() - a) / 1e6;
  if (ms > maxMs) maxMs = ms;
  g.events.length = 0;
  if (ticks % (20 * 120) === 0) report();
}
function report() {
  const line = g.players.map(p => `${p.name}[${p.civ}] age${p.age} pop${p.pop}/${p.popCap} vil${p.units.filter(u => u.type === 'villager').length} mil${p.units.filter(u => u.type !== 'villager' && u.type !== 'king').length} b${p.blds.length} res(${Math.floor(p.res.food)},${Math.floor(p.res.wood)},${Math.floor(p.res.gold)},${Math.floor(p.res.stone)}) ${p.eliminated ? 'X' : ''}`);
  console.log('t=' + (g.time / 60).toFixed(1) + 'm\n  ' + line.join('\n  '));
}
report();
console.log('over:', JSON.stringify(g.over), 'ticks', ticks, 'wall', (Date.now() - t0) + 'ms', 'maxTick', maxMs.toFixed(1) + 'ms');
