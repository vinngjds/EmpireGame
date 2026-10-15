/* Bots de jogabilidade: simulam estratégias para verificar o equilíbrio econômico.
   Uso no Node: node tests/bots.js [partidas]. No navegador fica em FG.Bots (usado pelo teste.html). */
(function (root) {
if (typeof require !== 'undefined' && !root.FG) { require('../js/data.js'); require('../js/engine.js'); }
const FG = root.FG;
const E = FG.Engine;

function bestCrop(s) {
  let best = null, bv = -Infinity;
  for (const id in FG.CROPS) {
    const c = FG.CROPS[id];
    if (!E.unlocked(s, 'crop', id) || c.perennial) continue;
    const v = (c.yield * c.season[E.date(s).season] * E.cityPrice(s, c.product) * 0.8 - E.plantCost(s, id)) / c.days;
    const glut = s.stock[c.product].qty * FG.PRODUCTS[c.product].price / 3000; // evita encalhar
    if (v - glut * 20 > bv) { bv = v - glut * 20; best = id; }
  }
  return best;
}

function smartBot(s) {
  // vende: negocia pedidos que consegue atender, pedindo um pouco acima da referência
  for (const o of [...s.orders]) {
    const st = s.stock[o.product].qty;
    if (!o.contract && st < o.qty * 0.4) continue;
    if (o.contract && (st < o.qty * 3 || s.contracts.length >= 3)) continue;
    const qty = o.contract ? Math.max(o.qty * 0.4, Math.min(o.qty, st / 4)) : Math.min(o.qty, st);
    const q = E.quote(s, o, o.ref * 1.06, qty);
    if (q.profit <= 0) continue;
    const r = E.propose(s, o.id, o.ref * 1.06, qty);
    if (r.result === 'counter') E.acceptCounter(s, o.id);
  }
  // escoa excesso na Ceasa (perecíveis rápido, grãos acima de 20 t)
  for (const p in s.stock) {
    const st = s.stock[p], pr = FG.PRODUCTS[p];
    const keep = s.contracts.filter(c => c.product === p).reduce((a, c) => a + c.qty * 1.2, 0) + (p === 'milho' ? 50 : 0);
    const excess = st.qty - keep;
    if (excess <= 0) continue;
    if ((pr.spoil >= 0.02 && excess * pr.weight > 300) || excess * pr.weight > 15000 || E.storage(s).free < 2000) {
      const q = E.spotQuote(s, p, excess);
      if (q.profit > 0 || pr.spoil >= 0.05) E.sellSpot(s, p, excess);
    }
  }
  const fixed = E.monthlyFixed(s).total;
  // mão de obra
  const lab = E.labor(s);
  if (lab.demand > lab.capacity && s.cash > fixed * 1.5) E.hire(s);
  // planta
  s.tiles.forEach((t, i) => {
    if (t.owned && (t.kind === 'land' || t.kind === 'estufa') && !t.crop && s.cash > fixed + 3000) {
      const c = bestCrop(s); if (c) E.plant(s, i, c);
    }
  });
  // expande com folga de caixa
  if (s.cash > fixed * 3 + E.landPrice(s) + 8000) {
    const idx = s.tiles.findIndex(t => !t.owned && s.tiles.some(o => o.owned && Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1));
    if (idx >= 0) E.buyTile(s, idx);
  }
  // armazenagem
  const sto = E.storage(s);
  if (sto.free < sto.cap * 0.3 && s.cash > fixed * 2 + 16000) {
    const idx = s.tiles.findIndex(t => t.owned && t.kind === 'land' && !t.crop);
    if (idx >= 0) E.build(s, idx, 'silo');
  }
  // galinhas no nível 1 e vacas no 2
  if (s.cash > fixed * 3 + 12000 && !E.hasBuilding(s, 'galinheiro')) {
    const idx = s.tiles.findIndex(t => t.owned && t.kind === 'land' && !t.crop);
    if (idx >= 0) { E.build(s, idx, 'galinheiro'); E.buyAnimals(s, 'galinha', 100); }
  }
  if (s.level >= 2 && s.cash > fixed * 3 + 70000 && E.countBuilding(s, 'curral') < 2) {
    const idx = s.tiles.findIndex(t => t.owned && t.kind === 'land' && !t.crop);
    if (idx >= 0) { E.build(s, idx, 'curral'); E.buyAnimals(s, 'vaca', 10); if (!E.hasBuilding(s, 'camara')) { const j = s.tiles.findIndex(t => t.owned && t.kind === 'land' && !t.crop); if (j >= 0) E.build(s, j, 'camara'); } }
  }
}
function idleBot() {}
function recklessBot(s) {
  // gasta tudo em terra e animais sem vender — deve falir
  for (let k = 0; k < 3; k++) {
    const idx = s.tiles.findIndex(t => !t.owned && s.tiles.some(o => o.owned && Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1));
    if (idx >= 0 && s.cash > 0) { const p = E.landPrice(s); s.cash -= p; s.tiles[idx].owned = true; }
  }
  if (s.workers < 6) s.workers++;
}

function run(bot, seed, days) {
  const s = E.newGame({ seed });
  for (let d = 0; d < days && !s.gameOver; d++) { bot(s); E.advanceDay(s); }
  return s;
}

FG.Bots = { run, smartBot, idleBot, recklessBot };
if (typeof module !== 'undefined') module.exports = FG.Bots;
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const N = +(process.argv[2] || 20), DAYS = 720;
  for (const [name, bot] of [['inteligente', smartBot], ['parado', idleBot], ['imprudente', recklessBot]]) {
    let bankrupt = 0, worth = [], lvl = [], tiles = [], dayFail = [];
    for (let i = 0; i < N; i++) {
      const s = run(bot, 1000 + i, DAYS);
      if (s.gameOver) { bankrupt++; dayFail.push(s.gameOver.day); }
      worth.push(s.netWorthCache); lvl.push(s.level); tiles.push(s.tiles.filter(t => t.owned).length);
    }
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    console.log(`${name.padEnd(12)} falências ${bankrupt}/${N}  patrimônio médio ${E.fmt(avg(worth))}  nível médio ${avg(lvl).toFixed(1)}  lotes ${avg(tiles).toFixed(1)}  dia médio da falência ${avg(dayFail).toFixed(0)}`);
  }
}
})(typeof window !== 'undefined' ? window : globalThis);
