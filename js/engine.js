/* Fazenda Império — motor de simulação.
   Funções puras sobre o objeto de estado (sem DOM), para poder ser testado no Node.
   Toda ação do jogador retorna { ok, msg } e altera o estado recebido. */
(function (root) {
  const FG = root.FG = root.FG || {};
  const E = FG.Engine = {};
  const P = FG.PRODUCTS, C = FG.COSTS;

  // ---------- utilidades ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  E.clamp = clamp;
  function rand(s) { // mulberry32 com estado salvo no jogo (determinístico)
    let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (s, a, b) => a + (b - a) * rand(s);
  const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
  function gauss(s) { return (rand(s) + rand(s) + rand(s) + rand(s) - 2) / 0.8165; }
  E.rand = rand;

  E.fmt = function (v, dec = 0) {
    return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  E.num = (v, dec = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // ---------- calendário ----------
  E.date = function (s) {
    const d = s.day;
    const month = Math.floor(d / 30) % 12;
    return { dom: d % 30 + 1, month, monthName: FG.MONTHS[month], year: Math.floor(d / 360) + 1, season: FG.SEASON_OF_MONTH[month] };
  };
  E.dateLabel = function (s, day) {
    const d = day === undefined ? s.day : day;
    const m = Math.floor(d / 30) % 12;
    return `${d % 30 + 1}/${String(m + 1).padStart(2, '0')} · Ano ${Math.floor(d / 360) + 1}`;
  };

  // ---------- novo jogo ----------
  E.newGame = function (opts = {}) {
    const s = {
      version: 1,
      farmName: opts.farmName || 'Fazenda Boa Esperança',
      rng: (opts.seed === undefined ? Math.floor(Math.random() * 2 ** 31) : opts.seed) >>> 0,
      day: 0,
      cash: opts.cash === undefined ? 40000 : opts.cash,
      level: 1, revenueTotal: 0,
      tiles: [],
      animals: { galinha: 0, abelha: 0, vaca: 0, porco: 0 },
      stock: {},
      workers: 0,
      vehicles: { picape: 1, caminhao: 0, carreta: 0 },
      exportLicense: false,
      settings: { autoHarvest: true, feedOwnCorn: true },
      loans: [], receivables: [], orders: [], contracts: [],
      relations: {},
      market: { idx: {}, usd: {}, sat: {}, hist: {}, city: 1, events: [] },
      macro: { selic: 10.5, inflation: 4.5, dolar: 5.4, diesel: 6.0, priceLevel: 1, hist: { dolar: [], selic: [], diesel: [], inflation: [] } },
      active: [], // eventos com duração: {id, until}
      log: [],
      ledger: E.emptyLedger(),
      history: { months: [], cash: [], worth: [] },
      stats: { deals: 0, contracts: 0, exports: 0, failed: 0, spoiled: 0, lostStorage: 0 },
      negDays: 0, gameOver: null, goals: {}, nextId: 1, netWorthCache: 0,
    };
    for (let y = 0; y < FG.GRID; y++) for (let x = 0; x < FG.GRID; x++) s.tiles.push({ x, y, owned: false, kind: 'land' });
    FG.START_TILES.forEach(([x, y]) => { s.tiles[y * FG.GRID + x].owned = true; });
    for (const p in P) {
      s.stock[p] = { qty: 0, cost: 0 };
      s.market.idx[p] = 1; s.market.sat[p] = 0; s.market.hist[p] = [];
      if (FG.TRADED.includes(p)) s.market.usd[p] = 1;
    }
    for (const b in FG.BUYERS) s.relations[b] = 50;
    for (const b in FG.NATIONAL_BUYERS) s.relations[b] = 50;
    s.relations.export = 50;
    // ponto de partida: duas lavouras já plantadas e um pouco de milho no galpão
    if (!opts.empty) {
      const t1 = s.tiles[3 * FG.GRID + 3], t2 = s.tiles[3 * FG.GRID + 4];
      t1.kind = 'crop'; t1.crop = { id: 'alface', progress: 8, health: 1, effSum: 8, cost: FG.CROPS.alface.cost, season: 0, ready: false, readyAge: 0 };
      t2.kind = 'crop'; t2.crop = { id: 'milho', progress: 20, health: 1, effSum: 20, cost: FG.CROPS.milho.cost, season: 0, ready: false, readyAge: 0 };
      s.stock.milho = { qty: 25, cost: 12 };
      s.stock.tomate = { qty: 12, cost: 14 };
    }
    // pré-aquece preços e pedidos para o mapa já nascer vivo
    for (let i = 0; i < 30; i++) { updateMarket(s, true); }
    for (let i = 0; i < 6; i++) generateOrders(s);
    E.addLog(s, '🌱', `Bem-vindo à ${s.farmName}! Plante, cuide dos animais e negocie com a cidade. Atenção às contas: sem lucro, a fazenda vai à falência.`, 'info');
    s.netWorthCache = E.netWorth(s);
    return s;
  };

  E.emptyLedger = () => ({ revenue: 0, taxes: 0, freight: 0, seeds: 0, feed: 0, processing: 0, salaries: 0, upkeep: 0, interest: 0, penalties: 0, other: 0, investments: 0 });

  E.addLog = function (s, icon, text, type = 'info') {
    s.log.unshift({ day: s.day, icon, text, type });
    if (s.log.length > 200) s.log.length = 200;
  };

  function spend(s, amount, cat) {
    s.cash -= amount;
    if (cat) s.ledger[cat] = (s.ledger[cat] || 0) + amount;
  }

  // ---------- preços ----------
  E.seasonFactor = function (s, p) {
    const season = E.date(s).season;
    const crop = FG.CROPS[p];
    if (crop) return clamp(1 + 0.35 * (1 - crop.season[season]), 0.85, 1.25); // entressafra = mais caro
    if (p === 'leite' || p === 'queijo') return [0.97, 1, 1.1, 1.02][season];
    if (p === 'farinha') return E.seasonFactor(s, 'trigo') * 0.5 + 0.5;
    return 1;
  };
  E.nationalPrice = function (s, p) {
    return P[p].price * s.market.idx[p] * s.macro.priceLevel;
  };
  E.cityPrice = function (s, p) {
    const sat = s.market.sat[p];
    return E.nationalPrice(s, p) * (1 - 0.35 * clamp(sat, 0, 1.4)) * s.market.city;
  };
  E.usdPrice = (s, p) => P[p].usd * s.market.usd[p];
  E.exportPrice = function (s, p, blocId) {
    const role = (FG.BLOCS[blocId] && FG.BLOCS[blocId].role[p]) || 0;
    const premium = 1 + clamp(-role, -0.5, 1.5) * 0.04;
    return E.usdPrice(s, p) * s.macro.dolar * premium;
  };
  E.regionPrice = function (s, p, regionId) {
    return E.nationalPrice(s, p) * (FG.REGIONS[regionId].bias[p] || 1);
  };
  // Demanda semanal da cidade (unidades) — tamanho do mercado local
  E.cityWeekly = function (p) {
    let tot = 0;
    for (const d of Object.values(FG.DISTRICTS)) tot += FG.CONSUMPTION[p] * d.pop / 1e5 * FG.INCOME_PREF[p][d.income - 1];
    return tot;
  };
  E.districtDemand = function (s, dId, p) {
    const d = FG.DISTRICTS[dId];
    return FG.CONSUMPTION[p] * d.pop / 1e5 * FG.INCOME_PREF[p][d.income - 1] * (1 - 0.6 * clamp(s.market.sat[p], 0, 1.4)) * s.market.city;
  };
  function marketSize(p) { return E.cityWeekly(p) * (FG.TRADED.includes(p) ? 12 : 1); }

  function inputFactor(s) { return (0.6 + 0.4 * s.macro.dolar / 5.4) * s.macro.priceLevel; }
  E.plantCost = (s, cropId) => Math.round(FG.CROPS[cropId].cost * inputFactor(s));
  E.feedPricePerKg = (s) => E.nationalPrice(s, 'milho') / 60 * 1.35;
  E.buildingCost = (s, b) => Math.round(FG.BUILDINGS[b].cost * s.macro.priceLevel);
  E.animalPrice = (s, a) => Math.round(FG.ANIMALS[a].price * s.macro.priceLevel);
  E.vehiclePrice = (s, v) => Math.round(FG.VEHICLES[v].price * s.macro.priceLevel);
  E.workerCost = (s) => Math.round(C.worker * s.macro.priceLevel);
  E.landPrice = function (s) {
    const owned = s.tiles.filter(t => t.owned).length;
    return Math.round(C.landBase * Math.pow(C.landGrowth, owned - 9) * s.macro.priceLevel / 100) * 100;
  };

  function updateMarket(s, warm) {
    const m = s.market, mac = s.macro;
    // eventos globais: alvo multiplicativo por produto
    const target = {};
    for (const p of FG.TRADED) target[p] = 1;
    m.events = m.events.filter(ev => ev.until > s.day);
    for (const ev of m.events) for (const p in ev.target) target[p] *= ev.target[p];
    for (const p of FG.TRADED) {
      m.usd[p] += (target[p] - m.usd[p]) * 0.05 + gauss(s) * 0.012;
      m.usd[p] = clamp(m.usd[p], 0.55, 1.9);
    }
    const fx = Math.pow(mac.dolar / 5.4, 0.9);
    for (const p in P) {
      let tgt = E.seasonFactor(s, p);
      if (FG.TRADED.includes(p)) tgt = m.usd[p] * fx * Math.sqrt(E.seasonFactor(s, p));
      if (p === 'farinha') tgt = 0.5 + 0.5 * m.idx.trigo;
      if (p === 'queijo') tgt = 0.6 + 0.4 * m.idx.leite;
      m.idx[p] += (tgt - m.idx[p]) * 0.08 + gauss(s) * (P[p].spoil > 0.02 ? 0.02 : 0.01);
      m.idx[p] = clamp(m.idx[p], 0.5, 2.2);
      m.sat[p] *= 0.93; // mercado absorve a oferta extra
      m.hist[p].push(+E.nationalPrice(s, p).toFixed(2));
      if (m.hist[p].length > 180) m.hist[p].shift();
    }
    // macroeconomia
    mac.dolar += (5.4 - mac.dolar) * 0.004 + gauss(s) * 0.03;
    mac.dolar = clamp(mac.dolar, 3.8, 8);
    const infTarget = 4 + (mac.dolar / 5.4 - 1) * 8 + (mac.selic < 9 ? 1 : 0) - (mac.selic > 13 ? 1 : 0);
    mac.inflation += (infTarget - mac.inflation) * 0.01 + gauss(s) * 0.03;
    mac.inflation = clamp(mac.inflation, 1, 15);
    if (!warm) mac.priceLevel *= 1 + mac.inflation / 100 / 360;
    const dieselTarget = FG.DIESEL_BASE * mac.priceLevel * (0.7 + 0.3 * mac.dolar / 5.4);
    mac.diesel += (dieselTarget - mac.diesel) * 0.02 + gauss(s) * 0.015;
    mac.selic += (10.5 - mac.selic) * 0.002;
    for (const k of ['dolar', 'selic', 'diesel', 'inflation']) {
      mac.hist[k].push(+mac[k].toFixed(3)); if (mac.hist[k].length > 180) mac.hist[k].shift();
    }
    m.city = E.isActive(s, 'festival') ? 1.1 : 1;
  }
  E.isActive = (s, id) => s.active.some(a => a.id === id && a.until > s.day);

  // ---------- fazenda: lotes, mão de obra, armazenagem ----------
  E.tile = (s, x, y) => s.tiles[y * FG.GRID + x];
  E.hasBuilding = (s, b) => s.tiles.some(t => t.kind === b);
  E.countBuilding = (s, b) => s.tiles.filter(t => t.kind === b).length;

  E.unlocked = function (s, kind, id) {
    const def = kind === 'crop' ? FG.CROPS[id] : kind === 'animal' ? FG.ANIMALS[id] : kind === 'building' ? FG.BUILDINGS[id] : FG.VEHICLES[id];
    return s.level >= (def.level || 1);
  };

  E.labor = function (s) {
    let demand = 0;
    for (const t of s.tiles) {
      if (t.kind === 'crop' && t.crop) demand += 1;
      else if (FG.BUILDINGS[t.kind]) demand += FG.BUILDINGS[t.kind].labor + (t.kind === 'estufa' && t.crop ? 0 : 0);
    }
    const capacity = C.ownerLabor + s.workers * C.workerLabor;
    const eff = demand <= capacity ? 1 : Math.max(0.35, capacity / demand);
    return { demand, capacity, eff };
  };

  E.storage = function (s) {
    let cap = C.baseStorage;
    for (const t of s.tiles) if (FG.BUILDINGS[t.kind] && FG.BUILDINGS[t.kind].storage) cap += FG.BUILDINGS[t.kind].storage;
    let used = 0;
    for (const p in s.stock) used += s.stock[p].qty * P[p].weight;
    return { cap, used, free: Math.max(0, cap - used) };
  };

  // adiciona ao estoque com custo médio ponderado; devolve quanto coube
  E.addStock = function (s, p, qty, unitCost) {
    if (qty <= 0) return 0;
    const free = E.storage(s).free;
    const fits = Math.min(qty, free / P[p].weight);
    const lost = qty - fits;
    const st = s.stock[p];
    if (fits > 0) {
      st.cost = (st.qty * st.cost + fits * unitCost) / (st.qty + fits);
      st.qty += fits;
    }
    if (lost > 0.01) {
      s.stats.lostStorage += lost * E.nationalPrice(s, p);
      E.addLog(s, '📦', `Armazém lotado: ${E.num(lost)} ${P[p].unit} de ${P[p].name} foram perdidos. Construa silos ou venda mais.`, 'bad');
    }
    return fits;
  };
  function removeStock(s, p, qty) {
    s.stock[p].qty = Math.max(0, s.stock[p].qty - qty);
    if (s.stock[p].qty < 1e-6) s.stock[p].qty = 0;
  }

  E.buyTile = function (s, idx) {
    const t = s.tiles[idx];
    if (t.owned) return { ok: false, msg: 'Este lote já é seu.' };
    const adj = s.tiles.some(o => o.owned && Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1);
    if (!adj) return { ok: false, msg: 'Só é possível comprar lotes vizinhos à sua terra.' };
    const price = E.landPrice(s);
    if (s.cash < price) return { ok: false, msg: `Dinheiro insuficiente (precisa de ${E.fmt(price)}).` };
    spend(s, price, 'investments');
    t.owned = true;
    E.addLog(s, '🗺️', `Comprou um novo lote por ${E.fmt(price)}.`, 'good');
    return { ok: true, msg: 'Lote comprado.' };
  };

  E.plant = function (s, idx, cropId) {
    const t = s.tiles[idx], c = FG.CROPS[cropId];
    if (!t.owned) return { ok: false, msg: 'Lote não é seu.' };
    if (!(t.kind === 'land' || t.kind === 'estufa') || t.crop) return { ok: false, msg: 'Lote ocupado.' };
    if (!E.unlocked(s, 'crop', cropId)) return { ok: false, msg: `Disponível no nível ${c.level}.` };
    if (t.kind === 'estufa' && c.perennial) return { ok: false, msg: 'Culturas perenes não vão para a estufa.' };
    const cost = E.plantCost(s, cropId);
    if (s.cash < cost) return { ok: false, msg: `Dinheiro insuficiente (precisa de ${E.fmt(cost)}).` };
    spend(s, cost, 'seeds');
    if (t.kind === 'land') t.kind = 'crop';
    t.crop = { id: cropId, progress: 0, health: 1, effSum: 0, cost, season: E.date(s).season, ready: false, readyAge: 0, greenhouse: t.kind === 'estufa' };
    return { ok: true, msg: `${P[c.product].name} plantado (${E.fmt(cost)}).` };
  };

  E.expectedYield = function (s, t) {
    const cr = t.crop, c = FG.CROPS[cr.id];
    let mult = c.season[cr.season];
    if (cr.greenhouse) mult = Math.max(1.15, mult);
    const eff = cr.progress > 0 ? cr.effSum / Math.max(1, cr.progress) : E.labor(s).eff;
    let y = c.yield * mult * cr.health * eff;
    if (E.hasBuilding(s, 'poco') && !cr.greenhouse) y *= 1.1;
    if (s.animals.abelha > 0 && ['tomate', 'laranja', 'cafe'].includes(cr.id)) y *= 1.05;
    return y;
  };

  E.harvest = function (s, idx, auto) {
    const t = s.tiles[idx];
    if (!t.crop || !t.crop.ready) return { ok: false, msg: 'Nada pronto para colher.' };
    const cr = t.crop, c = FG.CROPS[cr.id];
    const qty = E.expectedYield(s, t) * rr(s, 0.92, 1.08);
    if (auto && E.storage(s).free < qty * P[c.product].weight) {
      if (!cr.warned) { cr.warned = true; E.addLog(s, '📦', `Sem espaço no armazém para colher ${P[c.product].name}. A lavoura espera no campo e começa a perder qualidade após 5 dias.`, 'bad'); }
      return { ok: false, msg: 'Armazém cheio.' };
    }
    const unitCost = cr.cost / Math.max(1, qty);
    const got = E.addStock(s, c.product, qty, unitCost);
    E.addLog(s, P[c.product].emoji, `${auto ? 'Colheita automática' : 'Colheita'}: ${E.num(got)} ${P[c.product].unit} de ${P[c.product].name} (custo ${E.fmt(unitCost, 2)}/un).`, 'good');
    if (c.perennial) {
      cr.ready = false; cr.readyAge = 0; cr.progress = c.days - c.regrow; cr.effSum = cr.progress * E.labor(s).eff; cr.cost = 0; cr.health = Math.min(1, cr.health + 0.3); cr.season = E.date(s).season;
    } else {
      t.crop = null;
      if (t.kind === 'crop') t.kind = 'land';
    }
    return { ok: true, msg: `Colheu ${E.num(got)} ${P[c.product].unit}.`, qty: got };
  };

  E.clearTile = function (s, idx) {
    const t = s.tiles[idx];
    if (t.crop) { t.crop = null; if (t.kind === 'crop') t.kind = 'land'; return { ok: true, msg: 'Lavoura removida.' }; }
    if (FG.BUILDINGS[t.kind]) {
      const b = FG.BUILDINGS[t.kind];
      if (b.animal) {
        const capLeft = (E.countBuilding(s, t.kind) - 1) * b.capacity;
        if (s.animals[b.animal] > capLeft) return { ok: false, msg: `Venda ${s.animals[b.animal] - capLeft} ${FG.ANIMALS[b.animal].name.toLowerCase()}(s) antes de demolir.` };
      }
      const refund = Math.round(E.buildingCost(s, t.kind) * 0.3);
      s.cash += refund;
      t.kind = 'land';
      return { ok: true, msg: `${b.name} demolido. Material revendido por ${E.fmt(refund)}.` };
    }
    return { ok: false, msg: 'Nada a remover.' };
  };

  E.build = function (s, idx, bId) {
    const t = s.tiles[idx], b = FG.BUILDINGS[bId];
    if (!t.owned) return { ok: false, msg: 'Lote não é seu.' };
    if (t.kind !== 'land' || t.crop) return { ok: false, msg: 'Lote ocupado. Libere-o antes.' };
    if (!E.unlocked(s, 'building', bId)) return { ok: false, msg: `Disponível no nível ${b.level}.` };
    const cost = E.buildingCost(s, bId);
    if (s.cash < cost) return { ok: false, msg: `Dinheiro insuficiente (precisa de ${E.fmt(cost)}).` };
    spend(s, cost, 'investments');
    t.kind = bId;
    E.addLog(s, b.emoji, `Construiu ${b.name} por ${E.fmt(cost)}.`, 'good');
    return { ok: true, msg: `${b.name} construído.` };
  };

  E.animalCapacity = function (s, a) {
    const house = FG.ANIMALS[a].house;
    return E.countBuilding(s, house) * FG.BUILDINGS[house].capacity;
  };
  E.buyAnimals = function (s, a, n) {
    const def = FG.ANIMALS[a];
    if (!E.unlocked(s, 'animal', a)) return { ok: false, msg: `Disponível no nível ${def.level}.` };
    const room = E.animalCapacity(s, a) - s.animals[a];
    if (room <= 0) return { ok: false, msg: `Sem espaço: construa um(a) ${FG.BUILDINGS[def.house].name}.` };
    n = Math.min(n, room);
    const cost = n * E.animalPrice(s, a);
    if (s.cash < cost) return { ok: false, msg: `Dinheiro insuficiente (precisa de ${E.fmt(cost)}).` };
    spend(s, cost, 'investments');
    s.animals[a] += n;
    E.addLog(s, def.emoji, `Comprou ${n} ${def.name.toLowerCase()}(s) por ${E.fmt(cost)}.`, 'good');
    return { ok: true, msg: `+${n} ${def.name}.` };
  };
  E.sellAnimals = function (s, a, n) {
    n = Math.min(n, s.animals[a]);
    if (n <= 0) return { ok: false, msg: 'Nenhum animal para vender.' };
    const value = Math.round(n * E.animalPrice(s, a) * 0.7);
    s.animals[a] -= n; s.cash += value;
    return { ok: true, msg: `Vendeu ${n} ${FG.ANIMALS[a].name.toLowerCase()}(s) por ${E.fmt(value)}.` };
  };

  E.hire = function (s) {
    const c = Math.round(C.hireCost * s.macro.priceLevel);
    if (s.cash < c) return { ok: false, msg: 'Sem caixa para contratar.' };
    spend(s, c, 'salaries'); s.workers++;
    return { ok: true, msg: `Funcionário contratado (custo de contratação ${E.fmt(c)}; salário ${E.fmt(E.workerCost(s))}/mês).` };
  };
  E.fire = function (s) {
    if (s.workers <= 0) return { ok: false, msg: 'Não há funcionários.' };
    const c = Math.round(C.fireCost * s.macro.priceLevel);
    spend(s, c, 'salaries'); s.workers--;
    return { ok: true, msg: `Funcionário demitido (rescisão ${E.fmt(c)}).` };
  };

  E.buyVehicle = function (s, v) {
    const def = FG.VEHICLES[v];
    if (def.hired) return { ok: false, msg: 'Frete terceirizado não se compra.' };
    if (!E.unlocked(s, 'vehicle', v)) return { ok: false, msg: `Disponível no nível ${def.level}.` };
    const price = E.vehiclePrice(s, v);
    if (s.cash < price) return { ok: false, msg: `Dinheiro insuficiente (precisa de ${E.fmt(price)}).` };
    spend(s, price, 'investments'); s.vehicles[v]++;
    E.addLog(s, def.emoji, `Comprou ${def.name} por ${E.fmt(price)}.`, 'good');
    return { ok: true, msg: `${def.name} comprado.` };
  };
  E.sellVehicle = function (s, v) {
    if (!s.vehicles[v]) return { ok: false, msg: 'Você não tem esse veículo.' };
    const value = Math.round(E.vehiclePrice(s, v) * 0.6 || 15000);
    s.vehicles[v]--; s.cash += value;
    return { ok: true, msg: `Vendeu ${FG.VEHICLES[v].name} por ${E.fmt(value)}.` };
  };

  E.buyLicense = function (s) {
    const L = FG.EXPORT_LICENSE;
    if (s.exportLicense) return { ok: false, msg: 'Você já tem licença.' };
    if (s.level < L.level) return { ok: false, msg: `Disponível no nível ${L.level}.` };
    const c = Math.round(L.cost * s.macro.priceLevel);
    if (s.cash < c) return { ok: false, msg: `Dinheiro insuficiente (precisa de ${E.fmt(c)}).` };
    spend(s, c, 'investments'); s.exportLicense = true;
    E.addLog(s, '🚢', 'Licença de exportação obtida! Tradings passam a enviar pedidos internacionais.', 'good');
    return { ok: true, msg: 'Licença de exportação obtida.' };
  };

  // ---------- frete ----------
  E.freightCost = function (s, kg, dist, vId) {
    const v = FG.VEHICLES[vId];
    const trips = Math.max(1, Math.ceil(kg / v.cap - 1e-9));
    const km = dist * (v.roundTrip ? 2 : 1);
    const fuelShare = v.hired ? 0.4 : 0.45;
    const perKm = v.perKm * ((1 - fuelShare) * s.macro.priceLevel + fuelShare * s.macro.diesel / FG.DIESEL_BASE);
    const strike = E.isActive(s, 'greve') ? 1.6 : 1;
    const cost = trips * (km * perKm + v.fixed * s.macro.priceLevel) * strike;
    return { trips, km: km * trips, cost, vehicle: vId };
  };
  E.availableVehicles = function (s) {
    return Object.keys(FG.VEHICLES).filter(v => FG.VEHICLES[v].hired || s.vehicles[v] > 0);
  };
  E.bestFreight = function (s, kg, dist) {
    let best = null;
    for (const v of E.availableVehicles(s)) {
      const f = E.freightCost(s, kg, dist, v);
      if (!best || f.cost < best.cost) best = f;
    }
    return best;
  };

  // ---------- custo de produção estimado (para cotações sem estoque) ----------
  E.estUnitCost = function (s, p) {
    if (s.stock[p] && s.stock[p].qty > 0.5 && s.stock[p].cost > 0) return s.stock[p].cost;
    const crop = FG.CROPS[p];
    if (crop) return E.plantCost(s, p) / (crop.yield * Math.max(0.6, crop.season[E.date(s).season]));
    const animal = Object.values(FG.ANIMALS).find(a => a.product === p);
    if (animal) return (animal.feed * E.feedPricePerKg(s)) / animal.out;
    const proc = Object.values(FG.BUILDINGS).find(b => b.process && b.process.to === p);
    if (proc) return (E.estUnitCost(s, proc.process.from) + proc.process.cost) / proc.process.ratio;
    return P[p].price * 0.5;
  };

  // ---------- compradores e pedidos ----------
  E.buyerInfo = function (id) {
    if (FG.BUYERS[id]) { const b = FG.BUYERS[id]; return { ...b, id, dist: b.dist || FG.DISTRICTS[b.district].dist, scope: 'city', place: FG.DISTRICTS[b.district].name }; }
    if (FG.NATIONAL_BUYERS[id]) { const b = FG.NATIONAL_BUYERS[id]; const r = FG.REGIONS[b.region]; return { ...b, id, dist: r.dist, scope: 'national', place: r.name, type: 'Distribuidor regional' }; }
    if (id === 'export') return { id, name: 'Trading Exportadora Atlântico', emoji: '🚢', type: 'Exportação', dist: FG.EXPORT_LICENSE.portDist, scope: 'export', place: 'Porto', tough: 0.6, pay: 15, pf: 1 };
    return null;
  };

  function productAvailableSoon(s, p) {
    const lvl = s.level + 1;
    if (FG.CROPS[p]) return FG.CROPS[p].level <= lvl;
    const a = Object.values(FG.ANIMALS).find(x => x.product === p);
    if (a) return a.level <= lvl;
    const b = Object.values(FG.BUILDINGS).find(x => x.process && x.process.to === p);
    if (b) return b.level <= lvl;
    return true;
  }

  function makeOrder(s, buyerId, p, qty, refUnit) {
    const b = E.buyerInfo(buyerId);
    const rel = s.relations[buyerId] || 50;
    const perishable = P[p].spoil >= FG.PERISHABLE_LIMIT;
    const ref = refUnit * rr(s, 0.9, 0.98);
    const reserve = refUnit * (1.03 + 0.13 * (1 - b.tough) * rr(s, 0.5, 1.2)) * (1 + (rel - 50) / 600);
    const contract = b.scope === 'city' && rand(s) < 0.22;
    return {
      id: s.nextId++, buyer: buyerId, product: p,
      qty: Math.max(P[p].weight >= 20 ? 5 : 20, Math.round(qty)),
      ref: +ref.toFixed(2), reserve: +reserve.toFixed(2),
      created: s.day, deadline: s.day + (perishable ? Math.floor(rr(s, 3, 6)) : Math.floor(rr(s, 6, 12))),
      pay: b.pay, contract, weeks: contract ? Math.floor(rr(s, 4, 9)) : 0,
      rounds: 0, maxRounds: b.tough > 0.6 ? 2 : 3, counter: null,
      bloc: null,
    };
  }

  function generateOrders(s) {
    const festival = E.isActive(s, 'festival');
    for (const id in FG.BUYERS) {
      const b = FG.BUYERS[id];
      if (b.spot || (b.minLevel || 1) > s.level + 0) continue;
      const open = s.orders.filter(o => o.buyer === id).length;
      if (open >= 2) continue;
      let chance = 0.09 * (0.6 + (s.relations[id] || 50) / 100);
      if (festival && ['Restaurante', 'Restaurante premium', 'Empório premium'].includes(b.type)) chance *= 2;
      if (rand(s) > chance) continue;
      const options = b.buys.filter(p => productAvailableSoon(s, p));
      if (!options.length) continue;
      const p = pick(s, options);
      const base = (FG.TRADED.includes(p) ? E.cityWeekly(p) * 3 : E.cityWeekly(p)) * 0.06 * b.vol;
      const qty = base * rr(s, 0.6, 1.4) * (1 - 0.5 * clamp(s.market.sat[p], 0, 1));
      const refUnit = E.cityPrice(s, p) * b.pf * (festival ? 1.05 : 1);
      s.orders.push(makeOrder(s, id, p, qty, refUnit));
    }
    if (s.level >= 3) {
      for (const id in FG.NATIONAL_BUYERS) {
        const b = FG.NATIONAL_BUYERS[id];
        if (s.orders.some(o => o.buyer === id) || rand(s) > 0.05) continue;
        const options = b.buys.filter(p => productAvailableSoon(s, p));
        const p = pick(s, options);
        const qty = b.vol * (8000 / P[p].weight) * rr(s, 0.5, 1.4);
        s.orders.push(makeOrder(s, id, p, qty, E.regionPrice(s, p, b.region) * b.pf));
      }
    }
    if (s.exportLicense && s.orders.filter(o => o.buyer === 'export').length < 2 && rand(s) < 0.07) {
      const p = pick(s, FG.TRADED);
      const blocs = Object.keys(FG.BLOCS).filter(k => (FG.BLOCS[k].role[p] || 0) < 0);
      const bloc = blocs.length ? pick(s, blocs) : 'china';
      const qty = 10 * (8000 / P[p].weight) * rr(s, 0.5, 1.5);
      const o = makeOrder(s, 'export', p, qty, E.exportPrice(s, p, bloc));
      o.bloc = bloc; o.deadline = s.day + Math.floor(rr(s, 10, 20));
      s.orders.push(o);
    }
  }
  E.generateOrders = generateOrders;

  // Cotação completa de um negócio: o coração da negociação "assertiva"
  E.quote = function (s, order, price, qty, vId) {
    const p = order.product, b = E.buyerInfo(order.buyer);
    const kg = qty * P[p].weight;
    const vehicle = vId && E.availableVehicles(s).includes(vId) ? vId : E.bestFreight(s, kg, b.dist).vehicle;
    const fr = E.freightCost(s, kg, b.dist, vehicle);
    const deliveries = order.contract ? order.weeks : 1;
    const gross = price * qty;
    const tax = gross * C.salesTax;
    const portFee = b.scope === 'export' ? gross * FG.EXPORT_LICENSE.portFee : 0;
    const unitCost = E.estUnitCost(s, p);
    const cogs = unitCost * qty;
    const profit = gross - tax - portFee - fr.cost - cogs;
    const breakEven = (cogs + fr.cost) / (qty * (1 - C.salesTax - (portFee ? FG.EXPORT_LICENSE.portFee : 0)));
    const fixed = E.monthlyFixed(s).total;
    const market = b.scope === 'export' ? E.exportPrice(s, p, order.bloc) : b.scope === 'national' ? E.regionPrice(s, p, b.region) : E.cityPrice(s, p);
    const ratio = price / (market * (b.pf || 1));
    const chance = ratio <= 1.0 ? 'Alta' : ratio <= 1.07 ? 'Média' : ratio <= 1.15 ? 'Baixa' : 'Muito baixa';
    return {
      vehicle, trips: fr.trips, km: fr.km, kg, gross, tax, portFee, freight: fr.cost, unitCost, cogs, profit,
      margin: gross > 0 ? profit / gross : 0, breakEven, deliveries,
      totalProfit: profit * deliveries, fixedCover: fixed > 0 ? profit * deliveries / fixed : 0,
      market, chance, stock: s.stock[p].qty,
    };
  };

  E.propose = function (s, orderId, price, qty, vId) {
    const o = s.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, result: 'gone', msg: 'Pedido não está mais disponível.' };
    const b = E.buyerInfo(o.buyer);
    qty = Math.round(qty * 100) / 100;
    if (qty < o.qty * 0.4) return { ok: false, result: 'invalid', msg: 'O comprador só aceita a partir de 40% da quantidade pedida.' };
    if (qty > o.qty) qty = o.qty;
    if (!o.contract && s.stock[o.product].qty + 1e-6 < qty) return { ok: false, result: 'invalid', msg: 'Estoque insuficiente para entregar agora.' };
    const reserve = o.reserve * (1 - 0.06 * (1 - qty / o.qty));
    if (price <= reserve + 1e-9) {
      E.closeDeal(s, o, price, qty, vId);
      const rel = price < reserve * 0.95 ? 3 : 2;
      s.relations[o.buyer] = clamp((s.relations[o.buyer] || 50) + rel, 0, 100);
      return { ok: true, result: 'accept', msg: `${b.name} aceitou! ${o.contract ? 'Contrato assinado.' : 'Mercadoria entregue.'}` };
    }
    o.rounds++;
    const gap = price / reserve - 1;
    if (o.rounds > o.maxRounds || gap > 0.3) {
      s.orders = s.orders.filter(x => x !== o);
      s.relations[o.buyer] = clamp((s.relations[o.buyer] || 50) - 4, 0, 100);
      return { ok: false, result: 'walkaway', msg: `${b.name} desistiu da negociação. "Seu preço está fora da realidade."` };
    }
    // contraproposta: o comprador se aproxima do limite dele a cada rodada
    const step = o.rounds / (o.maxRounds + 1);
    const counter = o.ref + (reserve - o.ref) * (0.45 + 0.5 * step) * (1 - 0.3 * b.tough * rand(s));
    o.counter = { price: +Math.min(counter, reserve).toFixed(2), qty };
    if (b.tough > 0.5) s.relations[o.buyer] = clamp((s.relations[o.buyer] || 50) - 1, 0, 100);
    return { ok: false, result: 'counter', counter: o.counter.price, msg: `${b.name} contrapropõe ${E.fmt(o.counter.price, 2)}/${P[o.product].unit}. Rodadas restantes: ${o.maxRounds - o.rounds + 1}.` };
  };
  E.acceptCounter = function (s, orderId, vId) {
    const o = s.orders.find(x => x.id === orderId);
    if (!o || !o.counter) return { ok: false, msg: 'Não há contraproposta.' };
    if (!o.contract && s.stock[o.product].qty + 1e-6 < o.counter.qty) return { ok: false, msg: 'Estoque insuficiente.' };
    E.closeDeal(s, o, o.counter.price, o.counter.qty, vId);
    s.relations[o.buyer] = clamp((s.relations[o.buyer] || 50) + 2, 0, 100);
    return { ok: true, msg: 'Negócio fechado na contraproposta.' };
  };
  E.declineOrder = function (s, orderId) {
    s.orders = s.orders.filter(o => o.id !== orderId);
    return { ok: true, msg: 'Pedido recusado.' };
  };

  E.closeDeal = function (s, o, price, qty, vId) {
    s.orders = s.orders.filter(x => x !== o);
    s.stats.deals++;
    if (o.contract) {
      s.stats.contracts++;
      s.contracts.push({ id: s.nextId++, buyer: o.buyer, product: o.product, qty, price, vehicle: vId || null, next: s.day + 3, left: o.weeks, total: o.weeks, failures: 0 });
      E.addLog(s, '📝', `Contrato: ${E.num(qty)} ${P[o.product].unit} de ${P[o.product].name} por semana, ${o.weeks} semanas, a ${E.fmt(price, 2)} — ${E.buyerInfo(o.buyer).name}.`, 'good');
      return;
    }
    deliver(s, o.buyer, o.product, qty, price, vId, o.pay);
    if (o.buyer === 'export') s.stats.exports++;
  };

  // entrega física + financeiro de uma venda
  function deliver(s, buyerId, p, qty, price, vId, payDays) {
    const b = E.buyerInfo(buyerId);
    const kg = qty * P[p].weight;
    const fr = vId && E.availableVehicles(s).includes(vId) ? E.freightCost(s, kg, b.dist, vId) : E.bestFreight(s, kg, b.dist);
    const gross = price * qty;
    const tax = gross * C.salesTax + (b.scope === 'export' ? gross * FG.EXPORT_LICENSE.portFee : 0);
    const cogs = s.stock[p].cost * qty;
    removeStock(s, p, qty);
    spend(s, fr.cost, 'freight');
    s.ledger.revenue += gross;
    s.ledger.taxes += tax;
    s.revenueTotal += gross;
    const net = gross - tax;
    if (payDays > 0) s.receivables.push({ due: s.day + payDays, amount: net, from: b.name });
    else s.cash += net;
    if (b.scope === 'city') s.market.sat[p] += qty / marketSize(p);
    else s.market.sat[p] += qty / marketSize(p) * 0.15;
    const profit = net - fr.cost - cogs;
    E.addLog(s, '💰', `Venda a ${b.name}: ${E.num(qty)} ${P[p].unit} de ${P[p].name} × ${E.fmt(price, 2)} = ${E.fmt(gross)} · frete ${E.fmt(fr.cost)} · lucro ${E.fmt(profit)}${payDays ? ` (recebe em ${payDays} dias)` : ''}.`, profit >= 0 ? 'good' : 'bad');
    updateLevel(s);
    return { gross, tax, freight: fr.cost, cogs, profit };
  }

  // Venda imediata na Ceasa (atacado): sempre compra, mas paga menos e o preço cai com o volume
  E.spotQuote = function (s, p, qty, vId) {
    const b = E.buyerInfo('ceasa');
    const p0 = E.cityPrice(s, p) * b.pf;
    const impact = qty / marketSize(p);
    const avg = p0 * (1 - 0.35 * Math.min(1.2, impact) / 2);
    const kg = qty * P[p].weight;
    const fr = vId && E.availableVehicles(s).includes(vId) ? E.freightCost(s, kg, b.dist, vId) : E.bestFreight(s, kg, b.dist);
    const gross = avg * qty, tax = gross * C.salesTax, cogs = s.stock[p].cost * qty;
    return { price: avg, gross, tax, freight: fr.cost, vehicle: fr.vehicle, trips: fr.trips, cogs, profit: gross - tax - fr.cost - cogs };
  };
  E.sellSpot = function (s, p, qty, vId) {
    qty = Math.min(qty, s.stock[p].qty);
    if (qty <= 0) return { ok: false, msg: 'Sem estoque.' };
    const q = E.spotQuote(s, p, qty, vId);
    const r = deliver(s, 'ceasa', p, qty, q.price, q.vehicle, 0);
    s.relations.ceasa = clamp(s.relations.ceasa + 0.5, 0, 100);
    return { ok: true, msg: `Vendido na Ceasa: ${E.fmt(r.gross)} (lucro ${E.fmt(r.profit)}).`, ...r };
  };

  // ---------- finanças ----------
  E.monthlyFixed = function (s) {
    const pl = s.macro.priceLevel;
    let upkeep = 0;
    for (const t of s.tiles) {
      if (FG.BUILDINGS[t.kind]) upkeep += FG.BUILDINGS[t.kind].upkeep;
      if (t.crop && FG.CROPS[t.crop.id].perennial) upkeep += FG.CROPS[t.crop.id].upkeep;
    }
    for (const v in s.vehicles) upkeep += (FG.VEHICLES[v].upkeep || 0) * s.vehicles[v];
    upkeep *= pl;
    const salaries = s.workers * E.workerCost(s);
    const living = C.living * pl, utilities = C.utilities * pl;
    const landTax = s.tiles.filter(t => t.owned).length * C.landTax * pl;
    const loans = s.loans.reduce((a, l) => a + l.installment, 0);
    return { upkeep, salaries, living, utilities, landTax, loans, total: upkeep + salaries + living + utilities + landTax + loans };
  };

  E.assets = function (s) {
    const pl = s.macro.priceLevel;
    const land = s.tiles.filter(t => t.owned).length * C.landBase * pl;
    let buildings = 0;
    for (const t of s.tiles) if (FG.BUILDINGS[t.kind]) buildings += E.buildingCost(s, t.kind) * 0.7;
    let animals = 0;
    for (const a in s.animals) animals += s.animals[a] * E.animalPrice(s, a) * 0.7;
    let vehicles = 0;
    for (const v in s.vehicles) vehicles += s.vehicles[v] * (FG.VEHICLES[v].price ? E.vehiclePrice(s, v) * 0.6 : 15000);
    let stock = 0;
    for (const p in s.stock) stock += s.stock[p].qty * E.nationalPrice(s, p) * 0.8;
    let crops = 0;
    for (const t of s.tiles) if (t.crop) crops += (t.crop.cost || 0) + (FG.CROPS[t.crop.id].perennial ? E.plantCost(s, t.crop.id) * 0.5 : 0);
    const receivables = s.receivables.reduce((a, r) => a + r.amount, 0);
    const cash = Math.max(0, s.cash);
    return { land, buildings, animals, vehicles, stock, crops, receivables, cash, total: land + buildings + animals + vehicles + stock + crops + receivables + cash };
  };
  E.debts = function (s) {
    const loans = s.loans.reduce((a, l) => a + l.balance, 0);
    const overdraft = Math.max(0, -s.cash);
    return { loans, overdraft, total: loans + overdraft };
  };
  E.netWorth = (s) => E.assets(s).total - E.debts(s).total;

  E.creditLimit = function (s) {
    const a = E.assets(s);
    const collateral = a.land + a.buildings + a.vehicles + a.animals;
    return Math.max(0, Math.round((collateral * 0.5 + 15000 - E.debts(s).loans) / 1000) * 1000);
  };
  E.overdraftLimit = (s) => Math.round(20000 + E.assets(s).total * 0.05);
  E.loanRate = (s, months) => (s.macro.selic + 5 + (months > 24 ? 1.5 : months > 12 ? 0.8 : 0)) / 100 / 12;

  E.takeLoan = function (s, amount, months) {
    amount = Math.round(amount);
    if (amount <= 0) return { ok: false, msg: 'Valor inválido.' };
    if (amount > E.creditLimit(s)) return { ok: false, msg: `O banco aprova no máximo ${E.fmt(E.creditLimit(s))}.` };
    const r = E.loanRate(s, months);
    const installment = amount * r / (1 - Math.pow(1 + r, -months));
    s.loans.push({ id: s.nextId++, principal: amount, balance: amount, rate: r, months, left: months, installment });
    s.cash += amount;
    E.addLog(s, '🏦', `Empréstimo de ${E.fmt(amount)} em ${months}x de ${E.fmt(installment)} (${E.num(r * 1200, 1)}% a.a.).`, 'info');
    return { ok: true, msg: 'Empréstimo aprovado.' };
  };
  E.payLoan = function (s, id) {
    const l = s.loans.find(x => x.id === id);
    if (!l) return { ok: false, msg: 'Empréstimo não encontrado.' };
    if (s.cash < l.balance) return { ok: false, msg: `Precisa de ${E.fmt(l.balance)} em caixa para quitar.` };
    s.cash -= l.balance;
    s.loans = s.loans.filter(x => x !== l);
    return { ok: true, msg: 'Empréstimo quitado.' };
  };

  function monthEnd(s) {
    const f = E.monthlyFixed(s);
    spend(s, f.upkeep, 'upkeep');
    spend(s, f.salaries, 'salaries');
    spend(s, f.living + f.utilities + f.landTax, 'other');
    for (const l of s.loans) {
      const interest = l.balance * l.rate;
      const principal = Math.min(l.balance, l.installment - interest);
      spend(s, interest, 'interest');
      s.cash -= principal;
      l.balance -= principal; l.left--;
    }
    s.loans = s.loans.filter(l => l.left > 0 && l.balance > 0.5);
    const L = s.ledger;
    const varCosts = L.taxes + L.freight + L.seeds + L.feed + L.processing;
    const fixedCosts = L.salaries + L.upkeep + L.interest + L.other + L.penalties;
    const d = E.date({ day: s.day - 1 });
    const rec = { label: `${FG.MONTHS[d.month].slice(0, 3)}/${d.year}`, ...L, varCosts, fixedCosts, result: L.revenue - varCosts - fixedCosts, cash: s.cash };
    s.history.months.push(rec);
    if (s.history.months.length > 36) s.history.months.shift();
    E.addLog(s, rec.result >= 0 ? '📈' : '📉', `Fechamento de ${rec.label}: receita ${E.fmt(rec.revenue)}, custos ${E.fmt(varCosts + fixedCosts)}, resultado ${E.fmt(rec.result)}.`, rec.result >= 0 ? 'good' : 'bad');
    s.ledger = E.emptyLedger();
  }

  function updateLevel(s) {
    let lvl = 1;
    FG.LEVELS.forEach((v, i) => { if (s.revenueTotal >= v * 1000) lvl = i + 1; });
    if (lvl > s.level) {
      s.level = lvl;
      E.addLog(s, '⭐', `Nível ${lvl}! Desbloqueado: ${FG.LEVEL_UNLOCKS[lvl] || 'mais reputação e pedidos maiores'}.`, 'good');
    }
  }
  E.updateLevel = updateLevel;

  // ---------- eventos ----------
  function rollEvents(s) {
    const season = E.date(s).season;
    for (const ev of FG.EVENTS) {
      if (ev.season !== undefined && ev.season !== season) continue;
      if (ev.needs && !(s.animals[ev.needs] > 0)) continue;
      if (ev.days && E.isActive(s, ev.id)) continue;
      if (rand(s) > ev.chance) continue;
      E.triggerEvent(s, ev.id);
    }
  }
  E.triggerEvent = function (s, id) {
    const ev = FG.EVENTS.find(e => e.id === id);
    if (!ev) return;
    let extra = '';
    const openCrops = s.tiles.filter(t => t.crop && !t.crop.greenhouse);
    switch (id) {
      case 'granizo': {
        const hit = openCrops.filter(() => rand(s) < 0.5);
        hit.forEach(t => { t.crop.health *= 0.65; });
        extra = hit.length ? ` ${hit.length} lote(s) atingido(s).` : ' Por sorte, nada foi atingido.';
        break;
      }
      case 'praga': {
        if (!openCrops.length) return;
        const t = pick(s, openCrops);
        const cost = Math.round(400 * s.macro.priceLevel);
        if (s.cash > cost) { spend(s, cost, 'seeds'); t.crop.health *= 0.92; extra = ` Defensivo aplicado (${E.fmt(cost)}).`; }
        else { t.crop.health *= 0.6; extra = ' Sem caixa para defensivo: perda de 40%.'; }
        break;
      }
      case 'geada': {
        const sens = ['cafe', 'tomate', 'laranja', 'milho', 'soja'];
        const hit = openCrops.filter(t => sens.includes(t.crop.id));
        if (!hit.length) return;
        hit.forEach(t => { t.crop.health *= 0.75; });
        extra = ` ${hit.length} lote(s) prejudicado(s).`;
        break;
      }
      case 'raposa': { const n = Math.min(s.animals.galinha, Math.ceil(rr(s, 3, 12))); s.animals.galinha -= n; extra = ` ${n} galinhas perdidas.`; break; }
      case 'veterinario': { const c = Math.round(rr(s, 600, 1800) * s.macro.priceLevel); spend(s, c, 'other'); extra = ` Custo: ${E.fmt(c)}.`; break; }
      case 'quebra': { const c = Math.round(rr(s, 800, 2500) * s.macro.priceLevel); spend(s, c, 'upkeep'); extra = ` Custo: ${E.fmt(c)}.`; break; }
      case 'diesel': s.macro.diesel *= rr(s, 1.05, 1.12); extra = ` Diesel agora a ${E.fmt(s.macro.diesel, 2)}/L.`; break;
      case 'selicUp': s.macro.selic = clamp(s.macro.selic + 1, 4, 18); extra = ` Selic: ${E.num(s.macro.selic, 1)}%.`; break;
      case 'selicDown': s.macro.selic = clamp(s.macro.selic - 1, 4, 18); extra = ` Selic: ${E.num(s.macro.selic, 1)}%.`; break;
      case 'dolarUp': s.macro.dolar *= rr(s, 1.05, 1.1); extra = ` Dólar: ${E.fmt(s.macro.dolar, 2)}.`; break;
      case 'dolarDown': s.macro.dolar *= rr(s, 0.91, 0.96); extra = ` Dólar: ${E.fmt(s.macro.dolar, 2)}.`; break;
    }
    if (ev.target) s.market.events.push({ id, target: ev.target, until: s.day + ev.days });
    if (ev.days) s.active.push({ id, until: s.day + ev.days });
    const type = ev.scope === 'global' ? 'world' : ['seca', 'granizo', 'praga', 'geada', 'raposa', 'veterinario', 'quebra', 'greve'].includes(id) ? 'bad' : 'info';
    E.addLog(s, ev.icon, `${ev.title}: ${ev.text}${extra}`, type);
  };

  // ---------- passagem do dia ----------
  E.advanceDay = function (s) {
    if (s.gameOver) return;
    s.day++;
    const labor = E.labor(s);
    const drought = E.isActive(s, 'seca') && !E.hasBuilding(s, 'poco');

    // lavouras
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!t.crop) continue;
      const cr = t.crop, c = FG.CROPS[cr.id];
      if (c.perennial) cr.cost += c.upkeep / 30 * s.macro.priceLevel;
      if (!cr.ready) {
        cr.progress++; cr.effSum += labor.eff;
        if (drought && !cr.greenhouse) cr.health = Math.max(0.2, cr.health - c.water * 0.015);
        if (cr.progress >= c.days) { cr.ready = true; cr.readyAge = 0; }
      } else {
        cr.readyAge++;
        if (cr.readyAge > 5) cr.health *= 0.92; // passou do ponto de colheita
      }
    }
    if (s.settings.autoHarvest) for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].crop && s.tiles[i].crop.ready) E.harvest(s, i, true);

    // animais: ração (milho próprio ou comprado) e produção
    for (const a in FG.ANIMALS) {
      const n = s.animals[a];
      if (!n) continue;
      const def = FG.ANIMALS[a];
      const needKg = n * def.feed;
      let feedCost = 0;
      if (needKg > 0) {
        const own = s.settings.feedOwnCorn ? Math.min(s.stock.milho.qty, needKg / 60) : 0;
        if (own > 0) { feedCost += own * s.stock.milho.cost; removeStock(s, 'milho', own); }
        const buyKg = needKg - own * 60;
        if (buyKg > 0) { const c = buyKg * E.feedPricePerKg(s); spend(s, c, 'feed'); feedCost += c; }
      }
      const out = n * def.out * labor.eff;
      E.addStock(s, def.product, out, out > 0 ? feedCost / out : 0);
    }

    // agroindústria
    for (const t of s.tiles) {
      const b = FG.BUILDINGS[t.kind];
      if (!b || !b.process) continue;
      const pr = b.process;
      const q = Math.min(s.stock[pr.from].qty, pr.max * labor.eff);
      if (q < 0.01) continue;
      const fromCost = s.stock[pr.from].cost;
      removeStock(s, pr.from, q);
      const pc = q * pr.cost * s.macro.priceLevel;
      spend(s, pc, 'processing');
      E.addStock(s, pr.to, q * pr.ratio, (fromCost * q + pc) / (q * pr.ratio));
    }

    // perdas no estoque
    const cold = E.hasBuilding(s, 'camara');
    for (const p in s.stock) {
      const st = s.stock[p];
      if (st.qty <= 0) continue;
      const rate = P[p].spoil * (cold && P[p].spoil >= FG.PERISHABLE_LIMIT ? 0.3 : 1);
      const lost = st.qty * rate;
      st.qty -= lost;
      s.stats.spoiled += lost * st.cost;
    }

    // recebimentos
    const due = s.receivables.filter(r => r.due <= s.day);
    for (const r of due) s.cash += r.amount;
    s.receivables = s.receivables.filter(r => r.due > s.day);

    // contratos com entrega semanal
    for (const c of s.contracts) {
      if (c.next > s.day) continue;
      const b = E.buyerInfo(c.buyer);
      if (s.stock[c.product].qty + 1e-6 >= c.qty) {
        deliver(s, c.buyer, c.product, c.qty, c.price, c.vehicle, b.pay);
        s.relations[c.buyer] = clamp(s.relations[c.buyer] + 1, 0, 100);
      } else {
        const penalty = c.qty * c.price * 0.15;
        spend(s, penalty, 'penalties');
        c.failures++; s.stats.failed++;
        s.relations[c.buyer] = clamp(s.relations[c.buyer] - 10, 0, 100);
        E.addLog(s, '⚠️', `Entrega do contrato com ${b.name} falhou (faltou ${P[c.product].name}). Multa de ${E.fmt(penalty)}.`, 'bad');
      }
      c.left--; c.next += 7;
      if (c.failures >= 2) { c.left = 0; E.addLog(s, '❌', `${b.name} cancelou o contrato após falhas repetidas.`, 'bad'); }
      else if (c.left === 0) E.addLog(s, '✅', `Contrato com ${b.name} concluído.`, 'good');
    }
    s.contracts = s.contracts.filter(c => c.left > 0);

    // pedidos vencidos e novos pedidos
    s.orders = s.orders.filter(o => o.deadline >= s.day);
    generateOrders(s);

    // mercado, macro e eventos
    updateMarket(s, false);
    rollEvents(s);
    s.active = s.active.filter(a => a.until > s.day);

    // juros do cheque especial
    if (s.cash < 0) spend(s, -s.cash * C.overdraftDaily, 'interest');

    if (s.day % 30 === 0) monthEnd(s);

    // saúde financeira
    s.netWorthCache = E.netWorth(s);
    s.history.cash.push(Math.round(s.cash)); s.history.worth.push(Math.round(s.netWorthCache));
    if (s.history.cash.length > 360) { s.history.cash.shift(); s.history.worth.shift(); }
    checkBankruptcy(s);
    updateLevel(s);
    for (const g of FG.GOALS) if (!s.goals[g.id] && g.check(s)) { s.goals[g.id] = s.day; E.addLog(s, '🏆', `Meta cumprida: ${g.text}`, 'good'); }
  };

  E.risk = function (s) {
    const limit = E.overdraftLimit(s);
    const fixed = E.monthlyFixed(s).total;
    const months = s.history.months.slice(-3);
    const avg = months.length ? months.reduce((a, m) => a + m.result, 0) / months.length : 0;
    let level = 'good', text = 'Saudável';
    if (s.cash < 0) { level = 'critical'; text = `Cheque especial há ${s.negDays} dia(s) — falência em ${Math.max(0, 60 - s.negDays)} dias ou ao estourar ${E.fmt(limit)}`; }
    else if (s.cash < fixed) { level = 'serious'; text = 'Caixa não cobre os custos fixos do próximo mês'; }
    else if (avg < 0) { level = 'warning'; text = 'Prejuízo médio nos últimos meses'; }
    return { level, text, limit, fixed, avg };
  };

  function checkBankruptcy(s) {
    if (s.cash < 0) s.negDays++; else s.negDays = 0;
    const limit = E.overdraftLimit(s);
    let reason = null;
    if (s.cash < -limit) reason = `O banco cortou seu crédito: o cheque especial passou do limite de ${E.fmt(limit)}.`;
    else if (s.negDays >= 60) reason = 'Você ficou 60 dias seguidos no vermelho e os credores pediram a falência.';
    else if (s.netWorthCache < 0 && s.cash < 0) reason = 'As dívidas superaram tudo o que a fazenda vale.';
    if (reason) {
      s.gameOver = { day: s.day, reason, worth: s.netWorthCache };
      E.addLog(s, '💀', `FALÊNCIA: ${reason}`, 'bad');
    } else if (s.negDays === 1) {
      E.addLog(s, '🚨', `Caixa negativo! Você está no cheque especial (juros de ~8% ao mês). Limite: ${E.fmt(limit)}.`, 'bad');
    }
  }

  E.advanceDays = function (s, n) { for (let i = 0; i < n && !s.gameOver; i++) E.advanceDay(s); };

  // ---------- análises para as visões ----------
  E.trend = function (s, p, days = 30) {
    const h = s.market.hist[p];
    if (h.length < 2) return 0;
    const a = h[Math.max(0, h.length - 1 - days)], b = h[h.length - 1];
    return b / a - 1;
  };
  E.macroTrend = function (s, k, days = 30) {
    const h = s.macro.hist[k];
    if (h.length < 2) return 0;
    return h[h.length - 1] / h[Math.max(0, h.length - 1 - days)] - 1;
  };
  // demanda do mundo por bloco: papel estrutural + choques ativos
  E.blocPressure = function (s, blocId, p) {
    const role = FG.BLOCS[blocId].role[p] || 0;
    return -role; // positivo = importa (puxa demanda), negativo = exporta (oferta)
  };

  // ---------- salvar ----------
  E.serialize = (s) => JSON.stringify(s);
  E.deserialize = function (json) {
    const s = JSON.parse(json);
    if (!s || s.version !== 1) throw new Error('Save incompatível');
    return s;
  };
})(typeof window !== 'undefined' ? window : globalThis);
