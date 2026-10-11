// Testa comandos do jogador via API (caça, reparo, rally, mercado, combate, cerco)
const fs = require('fs'), vm = require('vm'), path = require('path');
const files = ['util', 'data', 'map', 'game', 'units', 'ai'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8').replace(/^'use strict';/, '')).join('\n');
const ctx = vm.createContext({ console, Math, performance, Date });
vm.runInContext(src + '\nthis.Game=Game; this.STEP=STEP; this.UNITS=UNITS; this.BUILDINGS=BUILDINGS; this.TECHS=TECHS;', ctx);
const { Game, STEP } = ctx;
const players = [{ name: 'H', civ: 'britons', team: 1, color: 0, human: true }, { name: 'E', civ: 'franks', team: 2, color: 1, ai: 'easy' }];
const g = new Game({ players, mapType: 'arabia', mapSize: 'tiny', mode: 'conquest', startRes: 'high', seed: 7, fog: false });
const run = s => { for (let i = 0; i < s * 20; i++) { g.update(STEP); } g.events.length = 0; };
const h = g.human;
g.players[1].ai.noAttackUntil = 1e9;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const vils = h.units.filter(u => u.type === 'villager');
const tc = h.blds.find(b => b.type === 'towncenter');

// 1) caça
const deer = g.animals.reduce((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) < Math.hypot(b.x - tc.x, b.y - tc.y) ? a : b);
const hunters = [vils[0]];
g.cmdGather(hunters, deer, false);
const f0 = h.res.food;
run(120);
ok(h.res.food > f0 + 20 || h.stats.gathered.food > 20, 'caça rende comida (+' + Math.floor(h.res.food - f0) + ')');

// 2) construir casa, fazenda e coletar da fazenda
const v2 = vils[1];
const hb = g.cmdBuild([v2], 'house', tc.tx + 6, tc.ty, false, 0);
ok(!!hb, 'cmdBuild house');
run(60);
ok(hb && hb.complete, 'casa concluída');
ok(h.popCap >= 10, 'popCap aumentou: ' + h.popCap);
const fb = g.cmdBuild([v2], 'farm', tc.tx + 6, tc.ty + 4, false, 0);
run(60);
ok(fb && fb.complete, 'fazenda concluída');
ok(v2.order && v2.order.type === 'gather' && v2.order.rkey === 'farm', 'aldeão passa a cultivar automaticamente');
const f1 = h.stats.gathered.food; run(60);
ok(h.stats.gathered.food > f1 + 10, 'fazenda produz comida');

// 3) reparo
hb.hp = hb.maxhp * 0.5;
g.cmdBuildOn([vils[2]], hb, false); const w0 = h.res.wood; run(60);
ok(hb.hp > hb.maxhp * 0.9, 'reparo restaura PV');
ok(h.res.wood < w0, 'reparo custa recursos');

for (let i = 0; i < 4; i++) g.cmdBuild([vils[2]], 'house', tc.tx + 6 + (i % 2) * 3, tc.ty - 4 - Math.floor(i / 2) * 3, true, 0);
run(120);
// 4) rally + treino + pesquisa + era
g.cmdSetRally(tc, tc.x + 3, tc.y + 6, null);
ok(g.queueUnit(tc, 'villager'), 'treina aldeão'); run(40);
ok(h.units.filter(u => u.type === 'villager').length >= 4, 'aldeão treinado');
ok(g.queueTech(tc, 'loom'), 'pesquisa Tear'); run(40);
ok(h.techs.has('loom'), 'Tear concluído');
// construir mínimo para Feudal
const need = ['mill', 'lumbercamp', 'barracks'];
need.forEach((t, i) => g.cmdBuild(vils.slice(2, 4), t, tc.tx - 8 + i * 4, tc.ty + 7, true, 0));
run(240);
ok(h.blds.filter(b => b.complete).length >= 5, 'edifícios concluídos: ' + h.blds.filter(b => b.complete).map(b => b.type).join(','));
ok(g.queueTech(tc, 'age1'), 'inicia Feudal'); run(100); console.log('queue', JSON.stringify(tc.queue.map(q => [q.id, Math.round(q.t)]))); run(60);
ok(h.age === 1, 'avançou para Feudal');

console.log('blds', h.blds.map(b => b.type + (b.complete ? '' : '*') + '@' + b.tx + ',' + b.ty).join(' '), 'fx lost', h.stats.lost);
// 5) mercado
let mk = null; for (const [dx, dy] of [[-8, -8], [8, 8], [-10, 4], [10, -6], [0, 9], [-3, -9]]) { mk = g.cmdBuild(vils.slice(2, 4), 'market', tc.tx + dx, tc.ty + dy, false, 0); if (mk) break; } run(150);
if (mk && !mk.complete) console.log('market', mk.progress, mk.tx, mk.ty, vils.slice(2, 4).map(u => JSON.stringify(u.order) + ' @' + u.x.toFixed(1) + ',' + u.y.toFixed(1)));
ok(mk && mk.complete, 'mercado concluído');
console.log('market state', mk && [mk.progress, mk.hp, mk.builders]); const gold0 = h.res.gold; g.marketTrade(h, 'food', true); ok(h.res.gold > gold0, 'vender comida dá ouro');
const f2 = h.res.food; g.marketTrade(h, 'wood', false); ok(h.res.wood > 0, 'comprar madeira');

// 6) exército, combate e cerco
const barr = h.blds.find(b => b.type === 'barracks');
console.log('barr', !!barr, barr && barr.complete);
const qres = []; for (let i = 0; i < 10; i++) qres.push(g.queueUnit(barr, i % 2 ? 'spearman' : 'militia'));
console.log('queued', qres.join(','));
run(230);
const army = h.units.filter(u => u.type === 'militia' || u.type === 'spearman');
console.log('barracks queue', barr.queue.map(q=>q.id+':'+Math.round(q.t)), 'pop', h.pop, h.popCap, 'res', JSON.stringify(h.res));
ok(army.length >= 5, 'tropas treinadas: ' + army.length);
const en = g.players[1];
const etc = en.blds.find(b => b.type === 'towncenter');
g.players[1].ai = null;
g.cmdAttackMove(army, etc.x, etc.y - 4, false);
run(180);
const near = army.filter(u => !u.dead && Math.hypot(u.x - etc.x, u.y - etc.y) < 12).length;
ok(near > 0 || en.stats.lost > 0, 'tropas chegam à base inimiga (perto: ' + near + ', perdas inimigas ' + en.stats.lost + ')');
console.log('fails:', fails);
process.exit(fails ? 1 : 0);
