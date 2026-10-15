/* Fazenda Império — bateria de testes funcionais do motor.
   Roda no Node (node tests/run.js) e no navegador (teste.html) com o mesmo código. */
(function (root) {
  if (typeof require !== 'undefined' && !root.FG) { require('../js/data.js'); require('../js/engine.js'); require('./bots.js'); }
  const FG = root.FG, E = FG.Engine, P = FG.PRODUCTS;
  const T = [];
  const test = (group, name, fn) => T.push({ group, name, fn });
  function ok(cond, msg) { if (!cond) throw new Error(msg || 'condição falsa'); }
  function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`${msg || 'valor'}: esperado ≈${b}, obtido ${a}`); }
  const fresh = (o = {}) => { const s = E.newGame({ seed: 7, empty: true, ...o }); s.settings.autoHarvest = false; return s; };
  const freeTile = (s) => s.tiles.findIndex(t => t.owned && t.kind === 'land' && !t.crop);
  const adjTile = (s) => s.tiles.findIndex(t => !t.owned && s.tiles.some(o => o.owned && Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1));
  const mkOrder = (s, buyer, p, qty, extra = {}) => {
    const ref = E.cityPrice(s, p);
    const o = { id: s.nextId++, buyer, product: p, qty, ref, reserve: ref * 1.1, created: s.day, deadline: s.day + 5, pay: E.buyerInfo(buyer).pay, contract: false, weeks: 0, rounds: 0, maxRounds: 3, counter: null, bloc: null, ...extra };
    s.orders.push(o); return o;
  };

  // ---------------- início e calendário ----------------
  test('Início', 'Novo jogo começa com caixa, 9 lotes, picape e pedidos', () => {
    const s = E.newGame({ seed: 1 });
    ok(s.cash === 40000, 'caixa inicial');
    ok(s.tiles.filter(t => t.owned).length === 9, '9 lotes');
    ok(s.vehicles.picape === 1, 'picape');
    ok(s.orders.length > 0, 'pedidos iniciais');
    ok(Object.keys(P).every(p => E.nationalPrice(s, p) > 0), 'preços positivos');
    ok(s.tiles.some(t => t.crop), 'lavouras iniciais plantadas');
  });
  test('Início', 'Calendário: estações do hemisfério sul', () => {
    const s = fresh();
    ok(E.date(s).monthName === 'Janeiro' && E.date(s).season === 0, 'janeiro = verão');
    s.day = 180; ok(E.date(s).monthName === 'Julho' && E.date(s).season === 2, 'julho = inverno');
    s.day = 365; ok(E.date(s).year === 2, 'ano 2');
  });

  // ---------------- fazenda ----------------
  test('Fazenda', 'Comprar terra: só vizinha, debita o preço e encarece a próxima', () => {
    const s = fresh();
    const far = 0; // canto (0,0) não é vizinho
    ok(!E.buyTile(s, far).ok, 'lote distante recusado');
    const i = adjTile(s), p1 = E.landPrice(s), c0 = s.cash;
    ok(E.buyTile(s, i).ok, 'compra ok');
    near(s.cash, c0 - p1, 0.01, 'caixa');
    ok(E.landPrice(s) > p1, 'próximo lote mais caro');
  });
  test('Fazenda', 'Plantar: debita custo, respeita nível e lote ocupado', () => {
    const s = fresh(), i = freeTile(s), c0 = s.cash;
    ok(!E.plant(s, i, 'soja').ok, 'soja bloqueada no nível 1');
    const cost = E.plantCost(s, 'alface');
    ok(E.plant(s, i, 'alface').ok, 'plantou alface');
    near(s.cash, c0 - cost, 0.01, 'caixa');
    ok(!E.plant(s, i, 'milho').ok, 'lote ocupado');
    s.cash = 10; ok(!E.plant(s, freeTile(s), 'milho').ok, 'sem dinheiro');
  });
  test('Fazenda', 'Crescimento e colheita: alface fica pronta em 12 dias e vai ao estoque', () => {
    const s = fresh(), i = freeTile(s);
    E.plant(s, i, 'alface');
    E.advanceDays(s, 11); ok(!s.tiles[i].crop.ready, 'ainda não pronta no dia 11');
    E.advanceDay(s); ok(s.tiles[i].crop.ready, 'pronta no dia 12');
    const r = E.harvest(s, i);
    ok(r.ok && s.stock.alface.qty > 30, 'colheu ' + (r.qty || 0));
    ok(s.stock.alface.cost > 0, 'custo médio calculado');
    ok(!s.tiles[i].crop && s.tiles[i].kind === 'land', 'lote liberado');
  });
  test('Fazenda', 'Colheita automática e espera quando o armazém está cheio', () => {
    const s = fresh(); s.settings.autoHarvest = true;
    const i = freeTile(s); E.plant(s, i, 'alface');
    E.addStock(s, 'mel', E.storage(s).free, 1); // lota o armazém (mel não estraga)
    E.advanceDays(s, 13);
    ok(s.tiles[i].crop && s.tiles[i].crop.ready, 'esperou no campo');
    s.stock.mel.qty = 0; E.advanceDay(s);
    ok(!s.tiles[i].crop && s.stock.alface.qty > 0, 'colheu quando houve espaço');
  });
  test('Fazenda', 'Mão de obra: excesso de lotes reduz eficiência; contratar resolve', () => {
    const s = fresh(); s.cash = 1e6;
    for (let k = 0; k < 6; k++) E.plant(s, freeTile(s), 'milho');
    const l = E.labor(s);
    ok(l.demand === 6 && l.capacity === 3 && l.eff < 1, `eficiência ${l.eff}`);
    E.hire(s); ok(E.labor(s).eff === 1, 'eficiência 100% com 1 funcionário');
    ok(E.monthlyFixed(s).salaries > 0, 'salário entra nos custos fixos');
  });
  test('Fazenda', 'Armazém: excesso é perdido; silo amplia a capacidade', () => {
    const s = fresh(); s.cash = 1e6;
    const cap = E.storage(s).cap;
    const fit = E.addStock(s, 'milho', cap / 60 + 50, 10);
    near(fit, cap / 60, 0.01, 'coube só a capacidade');
    E.build(s, freeTile(s), 'silo');
    ok(E.storage(s).cap === cap + FG.BUILDINGS.silo.storage, 'silo +60 t');
  });
  test('Fazenda', 'Perecíveis estragam; câmara fria reduz a perda', () => {
    const a = fresh(); a.stock.alface = { qty: 100, cost: 5 };
    E.advanceDay(a); near(a.stock.alface.qty, 88, 0.5, 'alface −12%/dia');
    const b = fresh(); b.cash = 1e6; b.level = 2; E.build(b, freeTile(b), 'camara');
    b.stock.alface = { qty: 100, cost: 5 }; E.advanceDay(b);
    near(b.stock.alface.qty, 96.4, 0.5, 'com câmara fria −3,6%/dia');
  });
  test('Fazenda', 'Animais: exigem instalação, produzem e consomem ração (milho próprio primeiro)', () => {
    const s = fresh(); s.cash = 1e6;
    ok(!E.buyAnimals(s, 'galinha', 10).ok, 'sem galinheiro recusado');
    E.build(s, freeTile(s), 'galinheiro');
    ok(E.buyAnimals(s, 'galinha', 150).ok && s.animals.galinha === 100, 'limitado à capacidade');
    s.stock.milho = { qty: 10, cost: 30 };
    E.advanceDay(s);
    ok(s.stock.ovos.qty > 4, 'botou ovos: ' + s.stock.ovos.qty.toFixed(2));
    near(s.stock.milho.qty, 10 - 12 / 60, 0.01, 'consumiu 12 kg de milho');
    s.stock.milho.qty = 0; const feed0 = s.ledger.feed; E.advanceDay(s);
    ok(s.ledger.feed > feed0, 'sem milho, compra ração');
  });
  test('Fazenda', 'Agroindústria: moinho transforma trigo em farinha', () => {
    const s = fresh(); s.cash = 1e6; s.level = 3;
    E.build(s, freeTile(s), 'moinho');
    s.stock.trigo = { qty: 30, cost: 20 };
    E.advanceDay(s);
    near(s.stock.trigo.qty, 10, 0.1, 'processou 20 sc');
    ok(s.stock.farinha.qty > 35, 'farinha produzida');
    ok(s.stock.farinha.cost > 20 / 1.8, 'custo inclui o trigo');
  });
  test('Fazenda', 'Cultura perene (laranja) rebrota após a colheita', () => {
    const s = fresh(); s.cash = 1e6; s.level = 4;
    const i = freeTile(s); E.plant(s, i, 'laranja');
    E.advanceDays(s, 60); ok(s.tiles[i].crop.ready, 'pronta em 60 dias');
    E.harvest(s, i); ok(s.tiles[i].crop && !s.tiles[i].crop.ready, 'continua no lote');
    E.advanceDays(s, 30); ok(s.tiles[i].crop.ready, 'nova safra em 30 dias');
  });

  // ---------------- logística e negociação ----------------
  test('Negócios', 'Frete: viagens por peso, custo por distância, greve encarece', () => {
    const s = fresh();
    const a = E.freightCost(s, 900, 40, 'picape'), b = E.freightCost(s, 2500, 40, 'picape');
    ok(a.trips === 1 && b.trips === 3, 'viagens');
    ok(E.freightCost(s, 900, 80, 'picape').cost > a.cost * 1.9, 'dobra com a distância');
    ok(E.freightCost(s, 900, 40, 'frete').cost > a.cost, 'terceirizado mais caro na cidade');
    ok(E.bestFreight(s, 20000, 2000).vehicle === 'frete', 'longa distância: terceirizado');
    s.active.push({ id: 'greve', until: s.day + 5 });
    near(E.freightCost(s, 900, 40, 'picape').cost, a.cost * 1.6, 0.01, 'greve +60%');
  });
  test('Negócios', 'Cotação: lucro = receita − impostos − frete − custo; preço mínimo zera o lucro', () => {
    const s = fresh(); s.stock.tomate = { qty: 50, cost: 15 };
    const o = mkOrder(s, 'familia', 'tomate', 40);
    const q = E.quote(s, o, 80, 40);
    near(q.profit, q.gross - q.tax - q.freight - q.cogs, 0.001, 'fórmula');
    near(q.cogs, 600, 0.001, 'custo do estoque');
    const q2 = E.quote(s, o, q.breakEven, 40);
    near(q2.profit, 0, 0.01, 'break-even');
  });
  test('Negócios', 'Proposta dentro do limite é aceita: baixa estoque, paga frete e gera recebível', () => {
    const s = fresh(); s.stock.tomate = { qty: 50, cost: 15 };
    const o = mkOrder(s, 'familia', 'tomate', 40);
    const c0 = s.cash, rel0 = s.relations.familia;
    const r = E.propose(s, o.id, o.reserve * 0.99, 40);
    ok(r.result === 'accept', r.msg);
    near(s.stock.tomate.qty, 10, 0.001, 'estoque');
    ok(s.cash < c0, 'pagou o frete');
    ok(s.receivables.length === 1 && s.receivables[0].due === s.day + 21, 'recebe em 21 dias');
    ok(s.relations.familia > rel0, 'relacionamento melhora');
    ok(!s.orders.includes(o), 'pedido encerrado');
    E.advanceDays(s, 21); ok(s.receivables.length === 0, 'recebível liquidado');
  });
  test('Negócios', 'Preço alto gera contraproposta; exagero ou rodadas demais fazem desistir', () => {
    const s = fresh(); s.stock.tomate = { qty: 50, cost: 15 };
    const o = mkOrder(s, 'familia', 'tomate', 40);
    const r = E.propose(s, o.id, o.reserve * 1.1, 40);
    ok(r.result === 'counter' && r.counter <= o.reserve * 1.0001 && r.counter >= o.ref * 0.99, 'contraproposta entre oferta e limite');
    ok(E.acceptCounter(s, o.id).ok, 'aceitar contraproposta fecha negócio');
    const o2 = mkOrder(s, 'familia', 'tomate', 5);
    const rel = s.relations.familia;
    ok(E.propose(s, o2.id, o2.reserve * 1.5, 5).result === 'walkaway', 'preço absurdo: desiste');
    ok(s.relations.familia < rel, 'relacionamento piora');
    const o3 = mkOrder(s, 'familia', 'tomate', 5, { maxRounds: 1 });
    E.propose(s, o3.id, o3.reserve * 1.1, 5);
    ok(E.propose(s, o3.id, o3.reserve * 1.1, 5).result === 'walkaway', 'esgotou as rodadas');
  });
  test('Negócios', 'Regras de quantidade: mínimo 40% e estoque obrigatório em pedidos avulsos', () => {
    const s = fresh(); s.stock.tomate = { qty: 10, cost: 15 };
    const o = mkOrder(s, 'familia', 'tomate', 40);
    ok(E.propose(s, o.id, o.ref, 10).result === 'invalid', 'abaixo de 40%');
    ok(E.propose(s, o.id, o.ref, 20).result === 'invalid', 'sem estoque');
  });
  test('Negócios', 'Contrato: entrega semanal automática; falta de produto gera multa e cancelamento', () => {
    const s = fresh(); s.stock.ovos = { qty: 100, cost: 8 };
    const o = mkOrder(s, 'familia', 'ovos', 30, { contract: true, weeks: 4 });
    ok(E.propose(s, o.id, o.ref, 30).result === 'accept', 'contrato fechado');
    ok(s.contracts.length === 1 && s.stock.ovos.qty === 100, 'não entrega na assinatura');
    E.advanceDays(s, 3);
    ok(s.contracts[0].left === 3 && s.stock.ovos.qty < 75, '1ª entrega feita');
    s.stock.ovos.qty = 0; const pen0 = s.ledger.penalties;
    E.advanceDays(s, 7); ok(s.ledger.penalties > pen0 && s.contracts[0].failures === 1, 'multa por falta');
    E.advanceDays(s, 7); ok(s.contracts.length === 0, 'cancelado após 2 falhas');
  });
  test('Negócios', 'Ceasa: compra à vista abaixo do mercado e satura o preço local', () => {
    const s = fresh(); s.stock.alface = { qty: 400, cost: 5 };
    const p0 = E.cityPrice(s, 'alface');
    const q = E.spotQuote(s, 'alface', 400);
    ok(q.price < p0 * 0.85, 'preço de atacado com impacto');
    const c0 = s.cash; E.sellSpot(s, 'alface', 400);
    ok(s.cash > c0 && s.stock.alface.qty === 0, 'pago à vista');
    ok(E.cityPrice(s, 'alface') < p0 * 0.97, 'cidade saturada: preço caiu');
  });
  test('Negócios', 'Pedidos surgem e vencem com o tempo', () => {
    const s = fresh();
    const first = s.orders.map(o => o.id);
    E.advanceDays(s, 20);
    ok(!first.some(id => s.orders.find(o => o.id === id)), 'pedidos antigos venceram');
    ok(s.orders.length > 0, 'novos pedidos');
  });

  // ---------------- mercado ----------------
  test('Mercado', 'Choque global (seca nos EUA) eleva soja no mundo e no país', () => {
    const s = fresh(); const u0 = s.market.usd.soja, n0 = E.nationalPrice(s, 'soja');
    E.triggerEvent(s, 'secaEUA');
    E.advanceDays(s, 30);
    ok(s.market.usd.soja > u0 * 1.05, `US$ ${u0.toFixed(2)} → ${s.market.usd.soja.toFixed(2)}`);
    ok(E.nationalPrice(s, 'soja') > n0 * 1.03, 'preço nacional subiu');
  });
  test('Mercado', 'Dólar alto valoriza commodities e encarece insumos', () => {
    const a = fresh(), b = fresh();
    b.macro.dolar = 7;
    ok(E.plantCost(b, 'milho') > E.plantCost(a, 'milho'), 'adubo mais caro');
    E.advanceDays(a, 20); E.advanceDays(b, 20);
    ok(E.nationalPrice(b, 'soja') > E.nationalPrice(a, 'soja'), 'soja mais cara em reais');
  });
  test('Mercado', 'Preço regional e de exportação consistentes', () => {
    const s = fresh();
    ok(E.regionPrice(s, 'trigo', 'nordeste') > E.regionPrice(s, 'trigo', 'sul'), 'trigo mais caro no Nordeste que no Sul');
    ok(E.exportPrice(s, 'soja', 'china') > E.exportPrice(s, 'soja', 'eua'), 'China (importador) paga prêmio');
  });

  // ---------------- finanças ----------------
  test('Finanças', 'Fim do mês cobra custos fixos e fecha o DRE', () => {
    const s = fresh(); const f = E.monthlyFixed(s).total;
    E.advanceDays(s, 30);
    ok(s.history.months.length === 1, 'mês fechado');
    near(s.history.months[0].fixedCosts, f, f * 0.02, 'custos fixos');
    ok(s.ledger.revenue === 0, 'novo mês zerado');
  });
  test('Finanças', 'Empréstimo: limite, parcela (Price) e quitação', () => {
    const s = fresh();
    ok(!E.takeLoan(s, E.creditLimit(s) + 10000, 12).ok, 'acima do limite');
    const c0 = s.cash;
    ok(E.takeLoan(s, 20000, 12).ok && s.cash === c0 + 20000, 'crédito liberado');
    const l = s.loans[0], r = l.rate;
    near(l.installment, 20000 * r / (1 - Math.pow(1 + r, -12)), 0.01, 'parcela');
    E.advanceDays(s, 30);
    ok(s.loans[0].balance < 20000 && s.loans[0].left === 11, 'amortizou');
    ok(E.payLoan(s, l.id).ok && s.loans.length === 0, 'quitado');
  });
  test('Finanças', 'Cheque especial cobra juros diários', () => {
    const s = fresh(); s.cash = -10000;
    E.advanceDay(s);
    ok(s.cash < -10000 - 20 && s.ledger.interest > 20, 'juros: ' + s.ledger.interest.toFixed(2));
    ok(E.risk(s).level === 'critical', 'risco crítico');
  });
  test('Finanças', 'Falência: estourar o limite do cheque especial', () => {
    const s = fresh(); s.cash = -E.overdraftLimit(s) - 1000;
    E.advanceDay(s);
    ok(s.gameOver && /limite/.test(s.gameOver.reason), 'faliu');
    const d = s.day; E.advanceDay(s); ok(s.day === d, 'jogo parado após falência');
  });
  test('Finanças', 'Falência: 60 dias seguidos no vermelho', () => {
    const s = fresh(); s.cash = -5000;
    E.advanceDays(s, 59); ok(!s.gameOver, 'ainda não faliu no dia 59');
    E.advanceDay(s); ok(s.gameOver && /60 dias/.test(s.gameOver.reason), 'faliu no dia 60');
  });
  test('Finanças', 'Nível sobe com a receita e desbloqueia itens', () => {
    const s = fresh(); s.cash = 1e6;
    ok(!E.unlocked(s, 'animal', 'vaca'), 'vaca bloqueada');
    s.revenueTotal = 130000; E.updateLevel(s);
    ok(s.level === 3 && E.unlocked(s, 'crop', 'soja') && E.unlocked(s, 'animal', 'vaca'), 'nível 3');
  });
  test('Finanças', 'Exportação: licença exige nível 5 e gera pedidos internacionais', () => {
    const s = fresh(); s.cash = 1e6;
    ok(!E.buyLicense(s).ok, 'bloqueada');
    s.level = 5; ok(E.buyLicense(s).ok, 'licença comprada');
    for (let k = 0; k < 200 && !s.orders.some(o => o.buyer === 'export'); k++) E.generateOrders(s);
    const o = s.orders.find(x => x.buyer === 'export');
    ok(o && o.bloc && FG.TRADED.includes(o.product), 'pedido de exportação com destino');
  });

  // ---------------- sistema ----------------
  test('Sistema', 'Salvar e carregar preserva o jogo e segue determinístico', () => {
    const a = E.newGame({ seed: 99 }); E.advanceDays(a, 15);
    const b = E.deserialize(E.serialize(a));
    E.advanceDays(a, 20); E.advanceDays(b, 20);
    ok(a.cash === b.cash && a.day === b.day && a.orders.length === b.orders.length, 'mesmo resultado');
  });
  test('Sistema', 'Mesma semente = mesma partida', () => {
    const a = E.newGame({ seed: 5 }), b = E.newGame({ seed: 5 });
    E.advanceDays(a, 100); E.advanceDays(b, 100);
    ok(JSON.stringify(a.market.idx) === JSON.stringify(b.market.idx), 'mercado idêntico');
  });
  test('Equilíbrio', 'Bot com boa gestão cresce sem falir em 1 ano (3 sementes)', () => {
    for (const seed of [11, 12, 13]) {
      const s = FG.Bots.run(FG.Bots.smartBot, seed, 360);
      ok(!s.gameOver, `semente ${seed} faliu: ${s.gameOver && s.gameOver.reason}`);
      ok(s.netWorthCache > 160000 && s.level >= 3, `semente ${seed}: patrimônio ${E.fmt(s.netWorthCache)}, nível ${s.level}`);
    }
  });
  test('Equilíbrio', 'Fazenda parada (sem vender) vai à falência', () => {
    const s = FG.Bots.run(FG.Bots.idleBot, 21, 900);
    ok(s.gameOver, 'deveria falir');
  });
  test('Equilíbrio', 'Gastar sem vender leva à falência rápida', () => {
    const s = FG.Bots.run(FG.Bots.recklessBot, 22, 200);
    ok(s.gameOver && s.gameOver.day < 120, 'faliu no dia ' + (s.gameOver && s.gameOver.day));
  });

  FG.TestSuite = {
    tests: T,
    run() {
      return T.map(t => {
        const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
        let error = null;
        try { t.fn(); } catch (e) { error = e.message || String(e); }
        return { group: t.group, name: t.name, ok: !error, error, ms: (typeof performance !== 'undefined' ? performance : Date).now() - t0 };
      });
    },
  };
  if (typeof module !== 'undefined') module.exports = FG.TestSuite;
})(typeof window !== 'undefined' ? window : globalThis);
