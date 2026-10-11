const fs = require('fs'), vm = require('vm'), path = require('path');
const files = ['util', 'data', 'map', 'game', 'units', 'ai'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8').replace(/^'use strict';/, '')).join('\n');
const ctx = vm.createContext({ console, Math, performance, Date });
vm.runInContext(src + '\nthis.Game=Game; this.STEP=STEP;', ctx);
const { Game, STEP } = ctx;
const civs = ['britons', 'franks', 'mongols', 'chinese'];
const players = [];
for (let i = 0; i < 4; i++) players.push({ name: 'IA' + i, civ: civs[i], team: i % 2 + 1, color: i, ai: 'hard' });
const g = new Game({ players, mapType:'arabia', mapSize:'small', mode:'conquest', startRes:'standard', seed: 1234 });
const T=+process.argv[2]||600, P=+process.argv[3]||2;
for (let i=0;i<20*T;i++){ g.update(STEP); g.events.length=0; }
const p=g.players[P];
console.log('t',g.time,'res',JSON.stringify(p.res,(k,v)=>typeof v==='number'?Math.floor(v):v),'pop',p.pop,p.popCap);
const cnt={}; for(const u of p.units){ const o=u.order; const k=u.type+':'+(o? o.type+(o.rkey?'/'+o.rkey:'')+(o.stage?'/'+o.stage:''):'idle'); cnt[k]=(cnt[k]||0)+1;}
console.log(cnt);
const bl={}; for(const b of p.blds){ const k=b.type+(b.complete?'':'*'); bl[k]=(bl[k]||0)+1;} console.log(bl);
for(const b of p.blds.filter(b=>!b.complete)) console.log('incomplete',b.type,b.tx,b.ty,b.progress.toFixed(2),'builders',b.builders, 'hp',b.hp);
for(const u of p.units.filter(u=>u.order&&u.order.type==='build')) console.log('builder',u.id,u.x.toFixed(1),u.y.toFixed(1),JSON.stringify(u.order),'path',u.path&&u.path.length,'fail',u.failN);
for(const u of p.units.filter(u=>!u.order&&u.type==='villager')) console.log('idle vil',u.id,u.x.toFixed(1),u.y.toFixed(1), JSON.stringify(u.carry));
console.log('ai', p.ai.phase, p.ai.waveSize);
