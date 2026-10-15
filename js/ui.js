/* Fazenda Império — interface (DOM). Visões: Fazenda, Cidade, Negócios, País, Mundo, Finanças, Diário. */
(function (root) {
  const FG = root.FG;
  const E = FG.Engine, Ch = FG.Charts, P = FG.PRODUCTS;
  const UI = FG.UI = {};
  let SAVE_KEY = 'fazendaImperio.save.v1';

  let S = null, rootEl = null, timer = null;
  const ui = {
    tab: 'farm', sel: null, cityProduct: 'all', countryProduct: 'milho', worldProduct: 'soja',
    buyer: null, district: null, region: null, bizTab: 'orders', logFilter: 'all',
    auto: false, speed: 900, modal: null, neg: null, spot: null, debug: false,
  };

  // ---------- utilidades ----------
  const fmt = E.fmt, num = E.num;
  const money = (v, d = 0) => `<span class="${v < 0 ? 'neg' : ''}">${fmt(v, d)}</span>`;
  const unitPrice = (v) => fmt(v, v < 10 ? 2 : 2);
  const pct = (v, d = 1) => `${v >= 0 ? '+' : ''}${num(v * 100, d)}%`;
  const trendTag = (v) => `<span class="trend ${v > 0.02 ? 'up' : v < -0.02 ? 'down' : ''}">${v > 0.02 ? '▲' : v < -0.02 ? '▼' : '■'} ${pct(v)}</span>`;
  const qtyFmt = (q) => num(q, q < 10 ? 1 : 0);
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const $ = (sel) => rootEl.querySelector(sel);
  const productChips = (sel, act, list) => `<div class="chips">${list.map(p => `<button class="chip ${sel === p ? 'on' : ''}" data-act="${act}" data-p="${p}">${p === 'all' ? '🧭 Todos' : P[p].emoji + ' ' + P[p].name}</button>`).join('')}</div>`;

  function toast(msg, type = 'info') {
    const box = $('#toasts');
    const d = document.createElement('div');
    d.className = `toast ${type}`; d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3700);
  }
  function result(r) { if (r && r.msg) toast(r.msg, r.ok ? 'good' : 'bad'); render(); return r; }

  // ---------- salvar / carregar ----------
  function save(silent) {
    try { localStorage.setItem(SAVE_KEY, E.serialize(S)); if (!silent) toast('Jogo salvo neste navegador.', 'good'); }
    catch (e) { if (!silent) toast('Não foi possível salvar (armazenamento bloqueado).', 'bad'); }
  }
  function load() {
    try { const j = localStorage.getItem(SAVE_KEY); return j ? E.deserialize(j) : null; } catch (e) { return null; }
  }

  // ---------- montagem ----------
  UI.mount = function (el, opts = {}) {
    rootEl = el;
    ui.debug = !!opts.debug;
    if (opts.saveKey) SAVE_KEY = opts.saveKey;
    S = opts.state || (opts.fresh ? null : load()) || E.newGame();
    el.innerHTML = `
      <header class="top">
        <div class="brand"><span class="logo">🌾</span><div><b>Fazenda Império</b><small id="farmName"></small></div></div>
        <div class="kpis" id="kpis"></div>
        <div class="clock" id="clock"></div>
      </header>
      <nav class="tabs" id="tabs"></nav>
      <div id="alert"></div>
      <main id="view"></main>
      <div id="modal" class="modal hidden"></div>
      <div id="toasts"></div>
      <div id="tip" class="tip hidden"></div>`;
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    el.addEventListener('mousemove', onTip);
    el.addEventListener('mouseleave', () => $('#tip').classList.add('hidden'));
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key === ' ') { e.preventDefault(); toggleAuto(); }
      if (e.key === 'Escape') closeModal();
    });
    render();
    if (S.day === 0 && !opts.state && !ui.debug) showHelp();
  };
  UI.state = () => S;
  UI.setState = (s) => { S = s; ui.sel = null; ui.buyer = null; closeModal(); render(); };
  UI.ui = ui;
  UI.render = () => render();
  UI.advance = (n) => { E.advanceDays(S, n); afterTick(); };
  UI.toast = (m, t) => toast(m, t);
  UI.go = (tab) => { ui.tab = tab; render(); };

  function onTip(e) {
    const t = e.target.closest('[data-tip]');
    const tip = $('#tip');
    if (!t) { tip.classList.add('hidden'); return; }
    tip.textContent = t.dataset.tip;
    tip.classList.remove('hidden');
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px';
  }

  // ---------- tempo ----------
  function toggleAuto() {
    ui.auto = !ui.auto;
    clearInterval(timer);
    if (ui.auto) timer = setInterval(tick, ui.speed);
    renderClock();
  }
  function tick() {
    if (ui.modal) return;
    E.advanceDay(S);
    afterTick();
  }
  function afterTick() {
    if (S.day % 10 === 0) save(true);
    if (S.gameOver) { ui.auto = false; clearInterval(timer); showGameOver(); }
    render();
  }

  // ---------- render ----------
  function render() {
    if (!S) return;
    renderHeader(); renderClock(); renderTabs(); renderAlert(); renderView();
    if (ui.modal === 'neg') refreshNeg();
  }

  function renderHeader() {
    $('#farmName').textContent = S.farmName;
    const r = E.risk(S);
    const next = FG.LEVELS[S.level] ? FG.LEVELS[S.level] * 1000 : null;
    const prev = FG.LEVELS[S.level - 1] * 1000;
    const lvlPct = next ? (S.revenueTotal - prev) / (next - prev) : 1;
    const L = S.ledger;
    const monthRes = L.revenue - (L.taxes + L.freight + L.seeds + L.feed + L.processing + L.salaries + L.upkeep + L.interest + L.other + L.penalties);
    const riskIcon = { good: '✅', warning: '⚠️', serious: '🟠', critical: '🚨' }[r.level];
    $('#kpis').innerHTML = `
      <div class="kpi"><small>Caixa</small><b>${money(S.cash)}</b></div>
      <div class="kpi"><small>Patrimônio líquido</small><b>${money(S.netWorthCache)}</b></div>
      <div class="kpi"><small>Resultado do mês</small><b>${money(monthRes)}</b></div>
      <div class="kpi lvl" data-tip="Receita acumulada ${fmt(S.revenueTotal)}${next ? ' · próximo nível em ' + fmt(next) : ''}"><small>Nível ${S.level}</small><div class="bar"><span style="width:${(lvlPct * 100).toFixed(0)}%"></span></div></div>
      <div class="kpi risk ${r.level}" data-tip="${r.text}"><small>Saúde financeira</small><b>${riskIcon} ${r.level === 'good' ? 'Saudável' : r.level === 'warning' ? 'Atenção' : r.level === 'serious' ? 'Risco' : 'Crítico'}</b></div>`;
  }

  function renderClock() {
    const d = E.date(S);
    const se = FG.SEASONS[d.season];
    const weather = E.isActive(S, 'seca') ? '🌵 Seca' : E.isActive(S, 'greve') ? '🚧 Greve' : E.isActive(S, 'festival') ? '🎪 Festival' : '';
    $('#clock').innerHTML = `
      <div class="date"><b>${d.dom} de ${d.monthName}</b><small>Ano ${d.year} · ${se.icon} ${se.name} ${weather ? '· ' + weather : ''}</small></div>
      <div class="ctrl">
        <button class="btn ${ui.auto ? 'on' : ''}" data-act="auto" title="Tempo automático (barra de espaço)">${ui.auto ? '⏸ Pausar' : '▶ Jogar'}</button>
        <button class="btn" data-act="speed" title="Velocidade">${ui.speed < 500 ? '⏩ Rápido' : '🐢 Normal'}</button>
        <button class="btn" data-act="day" data-n="1">+1 dia</button>
        <button class="btn" data-act="day" data-n="7">+7 dias</button>
        <button class="btn ghost" data-act="menu" title="Menu">☰</button>
      </div>`;
  }

  const TABS = [
    ['farm', '🏡 Fazenda'], ['city', '🏙️ Cidade'], ['biz', '🤝 Negócios'], ['country', '🇧🇷 País'], ['world', '🌎 Mundo'], ['finance', '💰 Finanças'], ['log', '📜 Diário'],
  ];
  function renderTabs() {
    const n = S.orders.length;
    $('#tabs').innerHTML = TABS.map(([id, label]) => `<button class="tab ${ui.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${label}${id === 'biz' && n ? ` <em>${n}</em>` : ''}</button>`).join('');
  }

  function renderAlert() {
    const r = E.risk(S);
    const parts = [];
    if (r.level === 'critical') parts.push(`🚨 <b>Risco de falência:</b> ${r.text}. Venda estoque, corte custos ou pegue um empréstimo em Finanças.`);
    else if (r.level === 'serious') parts.push(`🟠 <b>Atenção:</b> o caixa (${fmt(S.cash)}) não cobre os custos fixos do mês (${fmt(r.fixed)}).`);
    const lab = E.labor(S);
    if (lab.eff < 1) parts.push(`👷 Falta mão de obra: ${lab.demand} lotes exigem trabalho e a equipe cobre ${lab.capacity}. Produtividade em ${num(lab.eff * 100)}%.`);
    const st = E.storage(S);
    if (st.used / st.cap > 0.85) parts.push(`📦 Armazém ${num(st.used / st.cap * 100)}% cheio. Venda ou construa um silo.`);
    $('#alert').innerHTML = parts.map(p => `<div class="alert">${p}</div>`).join('');
  }

  function renderView() {
    const v = { farm: viewFarm, city: viewCity, biz: viewBiz, country: viewCountry, world: viewWorld, finance: viewFinance, log: viewLog }[ui.tab];
    $('#view').innerHTML = v();
  }

  // =====================================================================
  // FAZENDA
  // =====================================================================
  function isAdj(t) { return S.tiles.some(o => o.owned && Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1); }

  function tileHTML(t, i) {
    const sel = ui.sel === i ? ' sel' : '';
    if (!t.owned) {
      const adj = isAdj(t);
      return `<button class="tile locked ${adj ? 'adj' : ''}${sel}" data-act="tile" data-i="${i}" ${adj ? `data-tip="Comprar lote: ${fmt(E.landPrice(S))}"` : ''}>
        ${adj ? `<span class="ico">➕</span><small>${fmt(E.landPrice(S))}</small>` : '<span class="ico faint">🌳</span>'}</button>`;
    }
    if (t.crop) {
      const c = FG.CROPS[t.crop.id], pr = P[c.product];
      const prog = Math.min(1, t.crop.progress / c.days);
      const icon = t.crop.ready ? pr.emoji : prog < 0.34 ? '🌱' : prog < 0.67 ? '🌿' : pr.emoji;
      const warn = t.crop.health < 0.85 ? '<i class="warn" title="Lavoura prejudicada">⚠</i>' : '';
      const gh = t.kind === 'estufa' ? '<i class="gh">🏠</i>' : '';
      return `<button class="tile crop ${t.crop.ready ? 'ready' : ''} ${t.kind === 'estufa' ? 'estufa' : ''}${sel}" data-act="tile" data-i="${i}" data-tip="${pr.name}: ${t.crop.ready ? 'pronto para colher' : Math.max(0, c.days - t.crop.progress) + ' dias para colher'} · saúde ${num(t.crop.health * 100)}%">
        ${gh}${warn}<span class="ico ${prog < 0.67 && !t.crop.ready ? 'small' : ''}">${icon}</span>
        ${t.crop.ready ? '<small class="badge">Colher</small>' : `<span class="prog"><span style="width:${(prog * 100).toFixed(0)}%"></span></span>`}</button>`;
    }
    if (FG.BUILDINGS[t.kind]) {
      const b = FG.BUILDINGS[t.kind];
      let sub = b.name;
      if (b.animal) {
        const total = S.animals[b.animal], cap = E.animalCapacity(S, b.animal);
        sub = `${FG.ANIMALS[b.animal].emoji} ${total}/${cap}`;
      }
      return `<button class="tile bld b-${t.kind}${sel}" data-act="tile" data-i="${i}" data-tip="${b.name}"><span class="ico">${b.emoji}</span><small>${sub}</small></button>`;
    }
    return `<button class="tile land${sel}" data-act="tile" data-i="${i}" data-tip="Terra livre — clique para plantar ou construir"><span class="ico faint">＋</span><small>Livre</small></button>`;
  }

  function viewFarm() {
    const owned = S.tiles.filter(t => t.owned).length;
    const ready = S.tiles.filter(t => t.crop && t.crop.ready).length;
    const free = S.tiles.filter(t => t.owned && t.kind === 'land' && !t.crop).length;
    const grid = S.tiles.map(tileHTML).join('');
    return `<div class="layout farm">
      <section class="card mapcard">
        <div class="card-h"><h2>🏡 ${S.farmName}</h2><span class="muted">${owned} lotes · ${free} livres${ready ? ` · <b>${ready} prontos</b>` : ''}</span>
          ${ready ? '<button class="btn small" data-act="harvestAll">🧺 Colher tudo</button>' : ''}</div>
        <div class="farm-wrap"><div class="farm-grid" style="--n:${FG.GRID}">${grid}</div></div>
        <div class="legend-row"><span><i class="sw land"></i>Terra livre</span><span><i class="sw crop"></i>Lavoura</span><span><i class="sw bld"></i>Construção</span><span><i class="sw adj"></i>À venda</span></div>
      </section>
      <aside class="side">
        ${tilePanel()}
        ${stockCard()}
        ${laborCard()}
        ${animalsCard()}
        ${fleetCard()}
      </aside></div>`;
  }

  function tilePanel() {
    if (ui.sel === null) return `<section class="card"><h3>Selecione um lote</h3><p class="muted">Clique em um lote do mapa para plantar, construir, colher ou comprar terra. Lotes com ➕ estão à venda.</p>
      <p class="muted">Dica: cada lavoura, curral ou galinheiro exige mão de obra; sem funcionários suficientes a produtividade cai.</p></section>`;
    const t = S.tiles[ui.sel];
    if (!t.owned) {
      const adj = isAdj(t);
      return `<section class="card"><h3>Lote à venda</h3>
        ${adj ? `<p>Ampliar a fazenda com 1 lote (1 ha).</p><div class="row"><b>${fmt(E.landPrice(S))}</b><span class="muted">+ ${fmt(FG.COSTS.landTax * S.macro.priceLevel)}/mês de imposto</span></div>
        <button class="btn primary" data-act="buyTile" data-i="${ui.sel}">Comprar lote</button>` : '<p class="muted">Só é possível comprar lotes vizinhos à sua terra.</p>'}</section>`;
    }
    if (t.crop) {
      const c = FG.CROPS[t.crop.id], pr = P[c.product];
      const exp = E.expectedYield(S, t);
      const price = E.cityPrice(S, c.product);
      return `<section class="card"><div class="card-h"><h3>${pr.emoji} ${pr.name}${t.kind === 'estufa' ? ' (estufa)' : ''}</h3></div>
        <div class="stats">
          <div><small>Progresso</small><b>${Math.min(t.crop.progress, c.days)}/${c.days} dias</b></div>
          <div><small>Saúde</small><b>${num(t.crop.health * 100)}%</b></div>
          <div><small>Produção esperada</small><b>${qtyFmt(exp)} ${pr.unit}</b></div>
          <div><small>Valor na cidade</small><b>${fmt(exp * price)}</b></div>
        </div>
        ${c.perennial ? `<p class="muted">Cultura perene: após colher, produz de novo em ${c.regrow} dias. Manutenção ${fmt(c.upkeep)}/mês.</p>` : ''}
        <div class="btns">${t.crop.ready ? `<button class="btn primary" data-act="harvest" data-i="${ui.sel}">🧺 Colher</button>` : ''}
        <button class="btn danger ghost" data-act="clear" data-i="${ui.sel}" data-confirm="Arrancar esta lavoura? O investimento será perdido.">Arrancar</button></div></section>`;
    }
    if (FG.BUILDINGS[t.kind] && t.kind !== 'estufa') return buildingPanel(t);
    // terra livre ou estufa vazia
    const season = E.date(S).season;
    const rows = Object.entries(FG.CROPS).filter(([id, c]) => !(t.kind === 'estufa' && c.perennial)).map(([id, c]) => {
      const pr = P[c.product];
      const locked = !E.unlocked(S, 'crop', id);
      let mult = c.season[season];
      if (t.kind === 'estufa') mult = Math.max(1.15, mult);
      const y = c.yield * mult * (E.hasBuilding(S, 'poco') && t.kind !== 'estufa' ? 1.1 : 1) * E.labor(S).eff;
      const cost = E.plantCost(S, id);
      const rev = y * E.cityPrice(S, c.product);
      const perDay = (rev - cost) / c.days;
      const sTag = mult >= 1.1 ? '<span class="tag good">época boa</span>' : mult < 0.9 ? '<span class="tag bad">fora de época</span>' : '';
      return `<tr class="${locked ? 'locked' : ''}"><td>${pr.emoji} ${pr.name} ${sTag}</td><td>${c.days}d</td><td>${fmt(cost)}</td><td>${qtyFmt(y)} ${pr.unit}</td><td>${money(perDay)}/dia</td>
        <td>${locked ? `<span class="muted">nível ${c.level}</span>` : `<button class="btn small" data-act="plant" data-i="${ui.sel}" data-c="${id}">Plantar</button>`}</td></tr>`;
    }).join('');
    const bRows = t.kind === 'estufa' ? '' : Object.entries(FG.BUILDINGS).map(([id, b]) => {
      const locked = !E.unlocked(S, 'building', id);
      return `<tr class="${locked ? 'locked' : ''}"><td>${b.emoji} ${b.name}<div class="muted small">${b.desc}</div></td><td class="num">${fmt(E.buildingCost(S, id))}</td><td class="num">${fmt(b.upkeep * S.macro.priceLevel)}/mês</td>
        <td>${locked ? `<span class="muted">nível ${b.level}</span>` : `<button class="btn small" data-act="build" data-i="${ui.sel}" data-b="${id}">Construir</button>`}</td></tr>`;
    }).join('');
    return `<section class="card"><h3>${t.kind === 'estufa' ? '🏠 Estufa — plantar' : '🟫 Terra livre'}</h3>
      <p class="muted small">Estimativas com o preço atual da cidade e a mão de obra disponível. Lucro/dia = (receita − implantação) ÷ ciclo.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lavoura</th><th>Ciclo</th><th>Custo</th><th>Produção</th><th>Lucro</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${bRows ? `<h4>Construir</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Instalação</th><th>Custo</th><th>Manutenção</th><th></th></tr></thead><tbody>${bRows}</tbody></table></div>` : ''}
      ${t.kind === 'estufa' ? `<button class="btn danger ghost" data-act="clear" data-i="${ui.sel}" data-confirm="Demolir a estufa?">Demolir estufa</button>` : ''}
      </section>`;
  }

  function buildingPanel(t) {
    const b = FG.BUILDINGS[t.kind];
    let body = `<p class="muted">${b.desc}</p><div class="stats"><div><small>Manutenção</small><b>${fmt(b.upkeep * S.macro.priceLevel)}/mês</b></div><div><small>Mão de obra</small><b>${b.labor} lote(s)</b></div></div>`;
    if (b.animal) {
      const a = FG.ANIMALS[b.animal], n = S.animals[b.animal], cap = E.animalCapacity(S, b.animal);
      const prod = n * a.out * E.labor(S).eff;
      const feedDay = n * a.feed * E.feedPricePerKg(S);
      const room = cap - n;
      body += `<div class="stats">
        <div><small>${a.name}s</small><b>${n} / ${cap}</b></div>
        <div><small>Produção/dia</small><b>${qtyFmt(prod)} ${P[a.product].unit} ${P[a.product].emoji}</b></div>
        <div><small>Ração/dia</small><b>${fmt(feedDay)}</b></div>
        <div><small>Receita/dia</small><b>${fmt(prod * E.cityPrice(S, a.product))}</b></div></div>
        <p class="small muted">Preço: ${fmt(E.animalPrice(S, b.animal))} por ${a.name.toLowerCase()}. ${a.feed ? 'A ração usa o milho do seu estoque primeiro (configurável).' : ''}</p>
        <div class="btns">
          ${[10, 1].map(k => `<button class="btn small" data-act="buyAnimal" data-a="${b.animal}" data-n="${k}" ${room <= 0 ? 'disabled' : ''}>+${k}</button>`).join('')}
          <button class="btn small primary" data-act="buyAnimal" data-a="${b.animal}" data-n="${room}" ${room <= 0 ? 'disabled' : ''}>Lotar (+${room}) ${fmt(room * E.animalPrice(S, b.animal))}</button>
          <button class="btn small ghost" data-act="sellAnimal" data-a="${b.animal}" data-n="${Math.min(10, n)}" ${n <= 0 ? 'disabled' : ''}>Vender ${Math.min(10, n)}</button>
        </div>`;
    }
    if (b.process) {
      const pr = b.process;
      body += `<p>Processa até <b>${pr.max} ${P[pr.from].unit}</b> de ${P[pr.from].name} por dia → ${P[pr.to].name}. Estoque de ${P[pr.from].name}: <b>${qtyFmt(S.stock[pr.from].qty)}</b>.</p>`;
    }
    return `<section class="card"><h3>${b.emoji} ${b.name}</h3>${body}
      <button class="btn danger ghost" data-act="clear" data-i="${ui.sel}" data-confirm="Demolir ${b.name}? Você recupera 30% do custo.">Demolir</button></section>`;
  }

  function stockCard() {
    const st = E.storage(S);
    const cold = E.hasBuilding(S, 'camara');
    const rows = Object.keys(P).filter(p => S.stock[p].qty >= 0.05).map(p => {
      const s = S.stock[p], pr = P[p];
      const price = E.cityPrice(S, p);
      const loss = pr.spoil * (cold && pr.spoil >= FG.PERISHABLE_LIMIT ? 0.3 : 1);
      return `<tr><td>${pr.emoji} ${pr.name}</td><td class="num">${qtyFmt(s.qty)} <small class="muted">${pr.unit}</small></td><td class="num">${unitPrice(s.cost)}</td><td class="num">${unitPrice(price)}</td>
        <td class="num ${loss >= 0.05 ? 'neg' : ''}">${loss ? num(loss * 100, 1) + '%' : '—'}</td><td><button class="btn small ghost" data-act="spot" data-p="${p}" title="Vender na Ceasa">Vender</button></td></tr>`;
    }).join('');
    return `<section class="card"><div class="card-h"><h3>📦 Estoque</h3><span class="muted">${num(st.used / 1000, 1)} / ${num(st.cap / 1000, 0)} t</span></div>
      <div class="bar big ${st.used / st.cap > 0.85 ? 'hot' : ''}"><span style="width:${Math.min(100, st.used / st.cap * 100).toFixed(0)}%"></span></div>
      ${rows ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th>Qtd</th><th>Custo/un</th><th>Preço cidade</th><th>Perda/dia</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Armazém vazio. Colha ou aguarde a produção dos animais.</p>'}
      <p class="small muted">"Vender" = venda imediata na Ceasa (atacado, paga ~16% abaixo do mercado). Para margens melhores, negocie pedidos na Cidade.</p></section>`;
  }

  function laborCard() {
    const l = E.labor(S);
    return `<section class="card"><div class="card-h"><h3>👷 Mão de obra</h3><span class="muted">eficiência ${num(l.eff * 100)}%</span></div>
      <div class="bar big ${l.demand > l.capacity ? 'hot' : ''}"><span style="width:${Math.min(100, l.demand / Math.max(1, l.capacity) * 100).toFixed(0)}%"></span></div>
      <p class="small">${l.demand} lotes exigem trabalho · equipe cobre ${l.capacity} (você: ${FG.COSTS.ownerLabor} + ${S.workers} funcionário(s) × ${FG.COSTS.workerLabor}).</p>
      <div class="btns"><button class="btn small" data-act="hire">Contratar (${fmt(E.workerCost(S))}/mês)</button><button class="btn small ghost" data-act="fire" ${S.workers ? '' : 'disabled'}>Demitir</button></div>
      <div class="opts"><label><input type="checkbox" data-set="autoHarvest" ${S.settings.autoHarvest ? 'checked' : ''}> Colheita automática</label>
      <label><input type="checkbox" data-set="feedOwnCorn" ${S.settings.feedOwnCorn ? 'checked' : ''}> Usar milho próprio como ração</label></div></section>`;
  }

  function animalsCard() {
    const rows = Object.entries(FG.ANIMALS).map(([id, a]) => {
      const cap = E.animalCapacity(S, id);
      if (!cap && !S.animals[id]) return '';
      return `<tr><td>${a.emoji} ${a.name}</td><td class="num">${S.animals[id]}/${cap}</td><td class="num">${qtyFmt(S.animals[id] * a.out)} ${P[a.product].unit}/dia</td></tr>`;
    }).join('');
    return `<section class="card"><h3>🐾 Criação</h3>${rows ? `<table class="tbl"><tbody>${rows}</tbody></table>` : '<p class="muted small">Construa um galinheiro (nível 1) ou curral (nível 2) em um lote livre para começar a criar animais.</p>'}</section>`;
  }

  function fleetCard() {
    const rows = Object.entries(FG.VEHICLES).map(([id, v]) => {
      const own = S.vehicles[id] || 0;
      const locked = !E.unlocked(S, 'vehicle', id);
      const action = v.hired ? '<span class="muted small">sob demanda</span>' :
        locked ? `<span class="muted small">nível ${v.level}</span>` :
        `${v.price ? `<button class="btn small" data-act="buyVehicle" data-v="${id}">Comprar ${fmt(E.vehiclePrice(S, id))}</button>` : ''}${own && v.price ? ` <button class="btn small ghost" data-act="sellVehicle" data-v="${id}" data-confirm="Vender ${v.name} por 60% do valor de mercado?">Vender</button>` : ''}`;
      return `<tr><td>${v.emoji} ${v.name}${v.hired ? '' : ` <b>×${own}</b>`}</td><td class="small">${num(v.cap / 1000, 1)} t · ${fmt(v.perKm, 2)}/km${v.roundTrip ? ' (ida+volta)' : ''}${v.fixed ? ` + ${fmt(v.fixed)}/viagem` : ''}</td><td>${action}</td></tr>`;
    }).join('');
    return `<section class="card"><h3>🚚 Frota e logística</h3><div class="tbl-wrap"><table class="tbl"><tbody>${rows}</tbody></table></div>
      <p class="small muted">Diesel: ${fmt(S.macro.diesel, 2)}/L. Frota própria tem manutenção mensal; o frete terceirizado cobra por viagem.</p></section>`;
  }

  // =====================================================================
  // CIDADE
  // =====================================================================
  function viewCity() {
    const prods = ['all', ...Object.keys(P)];
    const sel = ui.cityProduct;
    const ds = Object.entries(FG.DISTRICTS);
    const vals = ds.map(([id, d]) => sel === 'all' ? d.pop : E.districtDemand(S, id, sel));
    const maxV = Math.max(...vals), minV = Math.min(...vals);
    const polys = ds.map(([id, d], k) => {
      const t = maxV === minV ? 0.5 : (vals[k] - minV) / (maxV - minV);
      const fill = Ch.seq(0.1 + t * 0.75);
      const tip = sel === 'all' ? `${d.name}: ${num(d.pop)} hab. · renda ${['baixa', 'média', 'alta'][d.income - 1]} · ${d.dist} km` : `${d.name}: demanda de ${num(vals[k])} ${P[sel].unit}/semana`;
      return `<polygon points="${d.poly}" fill="${fill}" class="district ${ui.district === id ? 'sel' : ''}" data-act="district" data-id="${id}" data-tip="${tip}"/>`;
    }).join('');
    const labels = ds.map(([id, d], k) => {
      const t = maxV === minV ? 0.5 : (vals[k] - minV) / (maxV - minV);
      return `<text x="${d.label[0]}" y="${d.label[1]}" class="dlabel ${t > 0.55 ? 'inv' : ''}" text-anchor="middle">${d.name}</text>
        <text x="${d.label[0]}" y="${d.label[1] + 16}" class="dsub ${t > 0.55 ? 'inv' : ''}" text-anchor="middle">${sel === 'all' ? num(d.pop / 1000) + ' mil hab.' : num(vals[k]) + ' /sem'}</text>`;
    }).join('');
    const pins = Object.entries(FG.BUYERS).map(([id, b]) => {
      const locked = (b.minLevel || 1) > S.level;
      const n = S.orders.filter(o => o.buyer === id).length;
      const buys = b.buys === 'all' || sel === 'all' || b.buys.includes(sel);
      return `<g class="pin ${locked ? 'locked' : ''} ${buys ? '' : 'dim'} ${ui.buyer === id ? 'sel' : ''}" data-act="buyer" data-id="${id}" data-tip="${b.name}${locked ? ` (a partir do nível ${b.minLevel})` : ''}${n ? ` · ${n} pedido(s)` : ''}" transform="translate(${b.pos[0]},${b.pos[1]})">
        <circle r="17"/><text y="6" text-anchor="middle">${b.emoji}</text>${n ? `<circle class="badge" cx="13" cy="-13" r="8"/><text class="badgetx" x="13" y="-9" text-anchor="middle">${n}</text>` : ''}</g>`;
    }).join('');
    const map = `<svg class="map city" viewBox="0 0 800 520" role="img" aria-label="Mapa da cidade">
      <rect x="0" y="0" width="800" height="520" class="ground"/>
      <path d="M0,420 C120,380 160,470 260,450 S420,500 520,505 S700,470 800,500" class="river"/>
      ${polys}
      <path d="M40,470 C80,400 110,260 140,170" class="road"/><path d="M140,170 L380,245 L600,255" class="road thin"/><path d="M380,245 L395,100" class="road thin"/><path d="M380,245 L510,400" class="road thin"/><path d="M270,320 L380,245" class="road thin"/>
      ${labels}
      <g class="farmpin" transform="translate(40,470)" data-act="tab" data-tab="farm" data-tip="Sua fazenda — clique para ver"><circle r="22"/><text y="7" text-anchor="middle">🏡</text></g>
      <text x="70" y="500" class="dsub">Sua fazenda · 34–60 km até os bairros</text>
      ${pins}</svg>`;
    const legend = `<div class="maplegend"><span>${sel === 'all' ? 'Menos habitantes' : 'Menor demanda'}</span><span class="ramp">${Ch.SEQ.map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${sel === 'all' ? 'Mais habitantes' : 'Maior demanda'}</span></div>`;
    return `<div class="layout city">
      <section class="card mapcard"><div class="card-h"><h2>🏙️ Metrópole — mapa de demanda</h2><span class="muted">1,06 milhão de habitantes</span></div>
        ${productChips(sel, 'cityProduct', prods)}${map}${legend}</section>
      <aside class="side">${ui.buyer ? buyerCard(ui.buyer) : ui.district ? districtCard(ui.district) : '<section class="card"><h3>Explore a cidade</h3><p class="muted">Clique em um bairro para ver a demanda ou em um comprador (ícones) para ver e negociar os pedidos. Filtre por produto para ver onde ele é mais procurado.</p></section>'}
      ${cityPricesCard()}</aside></div>`;
  }

  function buyerCard(id) {
    const b = E.buyerInfo(id);
    const raw = FG.BUYERS[id] || FG.NATIONAL_BUYERS[id] || {};
    const rel = S.relations[id] || 50;
    const locked = (raw.minLevel || 1) > S.level;
    const orders = S.orders.filter(o => o.buyer === id);
    const profile = b.tough > 0.6 ? 'Negociador duro' : b.tough > 0.4 ? 'Negociador equilibrado' : 'Negociador flexível';
    const priceProfile = b.pf >= 1.1 ? 'paga acima do mercado' : b.pf >= 0.98 ? 'paga preço de mercado' : 'paga abaixo do mercado';
    if (raw.spot) {
      return `<section class="card"><div class="card-h"><h3>${b.emoji} ${b.name}</h3><button class="btn ghost small" data-act="closeBuyer">✕</button></div>
        <p>Compra <b>qualquer produto</b>, à vista, a ~${num((1 - b.pf) * 100)}% abaixo do preço da cidade. Grandes volumes derrubam o preço.</p>
        <p class="muted small">Distância: ${b.dist} km. Use para escoar excedentes e perecíveis antes que estraguem.</p>
        <div class="btns">${Object.keys(P).filter(p => S.stock[p].qty >= 1).map(p => `<button class="btn small" data-act="spot" data-p="${p}">${P[p].emoji} Vender ${P[p].name}</button>`).join('') || '<span class="muted">Sem estoque para vender.</span>'}</div></section>`;
    }
    return `<section class="card"><div class="card-h"><h3>${b.emoji} ${b.name}</h3><button class="btn ghost small" data-act="closeBuyer">✕</button></div>
      <p class="muted small">${b.type} · ${b.place} · ${b.dist} km · paga em ${b.pay ? b.pay + ' dias' : 'à vista'}</p>
      <div class="stats"><div><small>Relacionamento</small><div class="bar"><span style="width:${rel}%"></span></div></div><div><small>Perfil</small><b class="small">${profile}, ${priceProfile}</b></div></div>
      <p class="small">Compra: ${(raw.buys || []).map(p => P[p].emoji + ' ' + P[p].name).join(', ')}</p>
      ${locked ? `<p class="tag bad">Só negocia com fazendas de nível ${raw.minLevel}+</p>` : orders.length ? orders.map(orderRow).join('') : '<p class="muted">Sem pedidos no momento. Novos pedidos surgem a cada poucos dias — relacionamento alto aumenta a frequência.</p>'}
    </section>`;
  }

  function orderRow(o) {
    const b = E.buyerInfo(o.buyer), pr = P[o.product];
    const st = S.stock[o.product].qty;
    const can = o.contract || st >= o.qty * 0.4;
    return `<div class="order ${o.contract ? 'contract' : ''}">
      <div><b>${pr.emoji} ${qtyFmt(o.qty)} ${pr.unit} de ${pr.name}</b> ${o.contract ? `<span class="tag">Contrato ${o.weeks} semanas</span>` : ''}${o.bloc ? `<span class="tag">${FG.BLOCS[o.bloc].flag} ${FG.BLOCS[o.bloc].name}</span>` : ''}
      <div class="small muted">${b.emoji} ${b.name} · oferta ${unitPrice(o.ref)}/un · ${b.dist} km · vence em ${o.deadline - S.day} dia(s)</div>
      <div class="small">${o.contract ? 'Entrega semanal; o estoque é cobrado a cada semana.' : `Seu estoque: <b class="${can ? '' : 'neg'}">${qtyFmt(st)}</b>`}${o.counter ? ` · <b>contraproposta ${unitPrice(o.counter.price)}</b>` : ''}</div></div>
      <button class="btn small ${can ? 'primary' : ''}" data-act="negotiate" data-id="${o.id}">Negociar</button></div>`;
  }

  function districtCard(id) {
    const d = FG.DISTRICTS[id];
    const top = Object.keys(P).map(p => ({ p, v: E.districtDemand(S, id, p) * E.cityPrice(S, p) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const buyers = Object.entries(FG.BUYERS).filter(([, b]) => b.district === id);
    return `<section class="card"><div class="card-h"><h3>📍 ${d.name}</h3><button class="btn ghost small" data-act="closeBuyer">✕</button></div>
      <div class="stats"><div><small>População</small><b>${num(d.pop)}</b></div><div><small>Renda</small><b>${['Baixa', 'Média', 'Alta'][d.income - 1]}</b></div><div><small>Distância</small><b>${d.dist} km</b></div></div>
      <h4>Maiores mercados do bairro (R$/semana)</h4>
      ${Ch.bars(top.map(x => ({ label: P[x.p].emoji + ' ' + P[x.p].name, value: x.v })), { fmt: v => fmt(v) })}
      <h4>Compradores</h4>${buyers.map(([bid, b]) => `<button class="linkrow" data-act="buyer" data-id="${bid}">${b.emoji} ${b.name} <span class="muted">${S.orders.filter(o => o.buyer === bid).length} pedido(s)</span></button>`).join('')}</section>`;
  }

  function cityPricesCard() {
    const rows = Object.keys(P).map(p => {
      const sat = S.market.sat[p];
      return `<tr><td>${P[p].emoji} ${P[p].name}</td><td class="num">${unitPrice(E.cityPrice(S, p))}</td><td>${trendTag(E.trend(S, p, 30))}</td>
        <td class="num">${num(E.cityWeekly(p))}</td><td><div class="bar sm ${sat > 0.5 ? 'hot' : ''}" data-tip="Saturação ${num(sat * 100)}% — vender muito derruba o preço local"><span style="width:${Math.min(100, sat * 100).toFixed(0)}%"></span></div></td></tr>`;
    }).join('');
    return `<section class="card"><h3>📊 Preços e demanda na cidade</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th>Preço/un</th><th>30 dias</th><th>Consumo/sem</th><th>Saturação</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">Preço por unidade (cx, sc, L, kg). A saturação sobe quando você (e a concorrência) vende muito e cai aos poucos.</p></section>`;
  }

  // =====================================================================
  // NEGÓCIOS
  // =====================================================================
  function viewBiz() {
    const tabs = [['orders', `📋 Pedidos (${S.orders.length})`], ['contracts', `📝 Contratos (${S.contracts.length})`], ['receivables', `🧾 A receber (${S.receivables.length})`], ['spot', '🏬 Venda rápida']];
    let body = '';
    if (ui.bizTab === 'orders') {
      const list = [...S.orders].sort((a, b) => (S.stock[b.product].qty >= b.qty * 0.4) - (S.stock[a.product].qty >= a.qty * 0.4) || a.deadline - b.deadline);
      body = list.length ? `<div class="tbl-wrap"><table class="tbl orders"><thead><tr><th>Comprador</th><th>Produto</th><th>Qtd</th><th>Oferta/un</th><th>Mercado/un</th><th>Distância</th><th>Prazo</th><th>Estoque</th><th></th></tr></thead><tbody>
        ${list.map(o => {
          const b = E.buyerInfo(o.buyer), pr = P[o.product], st = S.stock[o.product].qty;
          const mk = b.scope === 'export' ? E.exportPrice(S, o.product, o.bloc) : b.scope === 'national' ? E.regionPrice(S, o.product, b.region) : E.cityPrice(S, o.product);
          return `<tr><td>${b.emoji} ${b.name}<div class="small muted">${b.place}${o.bloc ? ' → ' + FG.BLOCS[o.bloc].flag + ' ' + FG.BLOCS[o.bloc].name : ''}</div></td>
            <td>${pr.emoji} ${pr.name}${o.contract ? `<div><span class="tag">Contrato ${o.weeks} sem.</span></div>` : ''}</td>
            <td class="num">${qtyFmt(o.qty)} <small class="muted">${pr.unit}</small></td><td class="num">${unitPrice(o.ref)}</td><td class="num muted">${unitPrice(mk)}</td><td class="num">${num(b.dist)} km</td>
            <td class="num">${o.deadline - S.day}d</td><td class="num ${o.contract || st >= o.qty * 0.4 ? '' : 'neg'}">${qtyFmt(st)}</td>
            <td><button class="btn small primary" data-act="negotiate" data-id="${o.id}">Negociar</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Nenhum pedido aberto. Avance alguns dias — compradores publicam pedidos com frequência.</p>';
      body = `<p class="muted small">Avulsos exigem estoque para entrega imediata (mínimo 40% da quantidade). Contratos têm entrega semanal com multa de 15% se faltar produto. Distância e prazo de pagamento mudam o resultado — confira a cotação antes de propor.</p>` + body;
    } else if (ui.bizTab === 'contracts') {
      body = S.contracts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Comprador</th><th>Produto</th><th>Qtd/semana</th><th>Preço</th><th>Entregas</th><th>Próxima</th><th>Estoque</th><th>Falhas</th></tr></thead><tbody>
        ${S.contracts.map(c => { const b = E.buyerInfo(c.buyer), pr = P[c.product]; const ok = S.stock[c.product].qty >= c.qty;
          return `<tr><td>${b.emoji} ${b.name}</td><td>${pr.emoji} ${pr.name}</td><td class="num">${qtyFmt(c.qty)} ${pr.unit}</td><td class="num">${unitPrice(c.price)}</td><td class="num">${c.total - c.left}/${c.total}</td>
          <td class="num">em ${c.next - S.day}d</td><td class="num ${ok ? '' : 'neg'}">${qtyFmt(S.stock[c.product].qty)} ${ok ? '✅' : '⚠️'}</td><td class="num">${c.failures}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<p class="muted">Sem contratos. Pedidos marcados como "Contrato" garantem vendas semanais a preço fixo.</p>';
    } else if (ui.bizTab === 'receivables') {
      const total = S.receivables.reduce((a, r) => a + r.amount, 0);
      body = S.receivables.length ? `<p>Total a receber: <b>${fmt(total)}</b></p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>De</th><th>Valor líquido</th><th>Vence</th></tr></thead><tbody>
        ${[...S.receivables].sort((a, b) => a.due - b.due).map(r => `<tr><td>${r.from}</td><td class="num">${fmt(r.amount)}</td><td class="num">em ${r.due - S.day} dia(s)</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nada a receber.</p>';
    } else {
      body = `<p>Venda imediata na <b>Ceasa</b>: pagamento à vista, sem negociação, preço de atacado.</p>
        <div class="btns">${Object.keys(P).filter(p => S.stock[p].qty >= 1).map(p => `<button class="btn" data-act="spot" data-p="${p}">${P[p].emoji} ${P[p].name} (${qtyFmt(S.stock[p].qty)})</button>`).join('') || '<span class="muted">Sem estoque.</span>'}</div>`;
    }
    return `<section class="card wide"><div class="card-h"><h2>🤝 Negócios</h2></div>
      <div class="subtabs">${tabs.map(([id, l]) => `<button class="chip ${ui.bizTab === id ? 'on' : ''}" data-act="bizTab" data-id="${id}">${l}</button>`).join('')}</div>${body}</section>`;
  }

  // ---------- modal de negociação ----------
  function openNeg(id) {
    const o = S.orders.find(x => x.id === id);
    if (!o) return;
    const st = S.stock[o.product].qty;
    const qty = o.contract ? o.qty : Math.min(o.qty, Math.floor(st * 100) / 100);
    ui.neg = { id, price: +(o.counter ? o.counter.price : o.ref * 1.06).toFixed(2), qty: Math.max(qty, 0), vehicle: null, chat: [] };
    ui.modal = 'neg';
    const b = E.buyerInfo(o.buyer);
    ui.neg.chat.push({ who: 'them', text: `Olá! Precisamos de ${qtyFmt(o.qty)} ${P[o.product].unit} de ${P[o.product].name}${o.contract ? ` toda semana por ${o.weeks} semanas` : ''}. Oferecemos ${unitPrice(o.ref)} por unidade${b.pay ? `, pagamento em ${b.pay} dias` : ', à vista'}.` });
    renderModal();
  }

  function negCalc() {
    const o = S.orders.find(x => x.id === ui.neg.id);
    if (!o) return '';
    const n = ui.neg, pr = P[o.product];
    const q = E.quote(S, o, n.price, Math.max(0.01, n.qty), n.vehicle);
    const v = FG.VEHICLES[q.vehicle];
    const chanceCls = { 'Alta': 'good', 'Média': 'warn', 'Baixa': 'bad', 'Muito baixa': 'bad' }[q.chance];
    return `<table class="calc">
      <tr><td>Receita bruta (${qtyFmt(n.qty)} × ${unitPrice(n.price)})</td><td class="num">${fmt(q.gross)}</td></tr>
      <tr><td>(−) Impostos sobre venda (${num(FG.COSTS.salesTax * 100, 1)}%)</td><td class="num neg">${fmt(-q.tax)}</td></tr>
      ${q.portFee ? `<tr><td>(−) Taxas portuárias</td><td class="num neg">${fmt(-q.portFee)}</td></tr>` : ''}
      <tr><td>(−) Frete: ${v.emoji} ${v.name}, ${q.trips} viagem(ns), ${num(q.km)} km, ${num(q.kg / 1000, 1)} t</td><td class="num neg">${fmt(-q.freight)}</td></tr>
      <tr><td>(−) Custo de produção (${unitPrice(q.unitCost)}/un${S.stock[o.product].qty > 0.5 ? ', custo médio do estoque' : ', estimado'})</td><td class="num neg">${fmt(-q.cogs)}</td></tr>
      <tr class="tot"><td>Lucro ${o.contract ? 'por entrega' : 'da operação'}</td><td class="num">${money(q.profit)}</td></tr>
      <tr><td>Margem líquida</td><td class="num ${q.margin < 0 ? 'neg' : ''}">${num(q.margin * 100, 1)}%</td></tr>
      ${o.contract ? `<tr class="tot"><td>Lucro total do contrato (${q.deliveries} entregas)</td><td class="num">${money(q.totalProfit)}</td></tr>` : ''}
      <tr><td>Preço mínimo sem prejuízo</td><td class="num">${unitPrice(q.breakEven)}</td></tr>
      <tr><td>Cobre dos custos fixos do mês (${fmt(E.monthlyFixed(S).total)})</td><td class="num">${num(q.fixedCover * 100)}%</td></tr>
    </table>
    <div class="row"><span>Referência de mercado: <b>${unitPrice(q.market)}</b></span><span class="tag ${chanceCls}">Chance de aceite: ${q.chance}</span></div>`;
  }

  function renderModal() {
    const m = $('#modal');
    if (!ui.modal) { m.classList.add('hidden'); m.innerHTML = ''; return; }
    m.classList.remove('hidden');
    if (ui.modal === 'neg') m.innerHTML = negHTML();
    else if (ui.modal === 'spot') m.innerHTML = spotHTML();
    else if (typeof ui.modal === 'object') m.innerHTML = `<div class="dialog ${ui.modal.cls || ''}">${ui.modal.html}</div>`;
  }
  function closeModal() { ui.modal = null; ui.neg = null; ui.spot = null; renderModal(); }

  function negHTML() {
    const o = S.orders.find(x => x.id === ui.neg.id);
    if (!o) return `<div class="dialog"><div class="card-h"><h2>🤝 Negociação encerrada</h2><button class="btn ghost small" data-act="closeModal">✕</button></div>${ui.neg.chat.map(c => `<div class="msg ${c.who}">${c.text}</div>`).join('')}<button class="btn" data-act="closeModal">Fechar</button></div>`;
    const b = E.buyerInfo(o.buyer), pr = P[o.product], rel = S.relations[o.buyer] || 50;
    const maxQty = o.contract ? o.qty : Math.min(o.qty, S.stock[o.product].qty);
    const veh = E.availableVehicles(S).map(v => {
      const f = E.freightCost(S, ui.neg.qty * pr.weight, b.dist, v);
      return `<option value="${v}" ${ui.neg.vehicle === v ? 'selected' : ''}>${FG.VEHICLES[v].emoji} ${FG.VEHICLES[v].name} — ${fmt(f.cost)} (${f.trips} viagem${f.trips > 1 ? 's' : ''})</option>`;
    }).join('');
    return `<div class="dialog negotiation">
      <div class="card-h"><h2>${b.emoji} ${b.name}</h2><button class="btn ghost small" data-act="closeModal">✕</button></div>
      <p class="muted small">${b.type} · ${b.place} · ${num(b.dist)} km · paga ${b.pay ? 'em ' + b.pay + ' dias' : 'à vista'} · relacionamento ${num(rel)}/100 · ${b.tough > 0.6 ? 'negociador duro' : b.tough > 0.4 ? 'negociador equilibrado' : 'negociador flexível'} · rodadas restantes: ${o.maxRounds - o.rounds + 1}</p>
      <div class="neg-grid">
        <div>
          <div class="order-sum"><b>${pr.emoji} ${qtyFmt(o.qty)} ${pr.unit} de ${pr.name}</b>${o.contract ? ` <span class="tag">Contrato: ${o.weeks} entregas semanais</span>` : ''}<div class="small muted">Vence em ${o.deadline - S.day} dia(s) · seu estoque: ${qtyFmt(S.stock[o.product].qty)}</div></div>
          <label>Preço por ${pr.unit} (R$)<input type="number" step="0.01" min="0" data-neg="price" value="${ui.neg.price}"></label>
          <input type="range" min="${(o.ref * 0.7).toFixed(2)}" max="${(o.ref * 1.4).toFixed(2)}" step="0.01" data-neg="price" value="${ui.neg.price}">
          <label>Quantidade (${pr.unit}) — mín. ${qtyFmt(o.qty * 0.4)}, máx. ${qtyFmt(maxQty)}<input type="number" step="1" min="0" max="${maxQty}" data-neg="qty" value="${ui.neg.qty}"></label>
          <label>Transporte<select data-neg="vehicle"><option value="">Mais barato automaticamente</option>${veh}</select></label>
          <div class="chat">${ui.neg.chat.map(c => `<div class="msg ${c.who}">${c.text}</div>`).join('')}</div>
        </div>
        <div id="negCalc">${negCalc()}</div>
      </div>
      <div class="btns end">
        <button class="btn ghost danger" data-act="declineOrder" data-id="${o.id}">Recusar pedido</button>
        ${o.counter ? `<button class="btn" data-act="acceptCounter" data-id="${o.id}">Aceitar contraproposta (${unitPrice(o.counter.price)})</button>` : ''}
        <button class="btn primary" data-act="propose" data-id="${o.id}">Propor ${unitPrice(ui.neg.price)}</button>
      </div></div>`;
  }
  function refreshNeg() { const el = $('#negCalc'); if (el) el.innerHTML = negCalc(); }

  // ---------- venda rápida (Ceasa) ----------
  function openSpot(p) {
    ui.spot = { p, qty: Math.floor(S.stock[p].qty * 100) / 100, vehicle: null };
    ui.modal = 'spot'; renderModal();
  }
  function spotCalc() {
    const sp = ui.spot, pr = P[sp.p];
    const q = E.spotQuote(S, sp.p, Math.max(0.01, sp.qty), sp.vehicle);
    return `<table class="calc"><tr><td>Preço médio (com impacto do volume)</td><td class="num">${unitPrice(q.price)}</td></tr>
      <tr><td>Receita bruta</td><td class="num">${fmt(q.gross)}</td></tr><tr><td>(−) Impostos</td><td class="num neg">${fmt(-q.tax)}</td></tr>
      <tr><td>(−) Frete ${FG.VEHICLES[q.vehicle].emoji} ${q.trips} viagem(ns)</td><td class="num neg">${fmt(-q.freight)}</td></tr>
      <tr><td>(−) Custo de produção</td><td class="num neg">${fmt(-q.cogs)}</td></tr><tr class="tot"><td>Lucro</td><td class="num">${money(q.profit)}</td></tr></table>`;
  }
  function spotHTML() {
    const sp = ui.spot, pr = P[sp.p], max = S.stock[sp.p].qty;
    return `<div class="dialog"><div class="card-h"><h2>🏬 Vender ${pr.emoji} ${pr.name} na Ceasa</h2><button class="btn ghost small" data-act="closeModal">✕</button></div>
      <p class="muted small">Preço da cidade: ${unitPrice(E.cityPrice(S, sp.p))} · Ceasa paga ${num(FG.BUYERS.ceasa.pf * 100)}% disso, menos o impacto de grandes volumes.</p>
      <label>Quantidade (${pr.unit}) — estoque ${qtyFmt(max)}<input type="number" min="0" max="${max}" step="1" data-spot="qty" value="${sp.qty}"></label>
      <input type="range" min="0" max="${max}" step="${max > 50 ? 1 : 0.1}" data-spot="qty" value="${sp.qty}">
      <label>Transporte<select data-spot="vehicle"><option value="">Mais barato automaticamente</option>${E.availableVehicles(S).map(v => `<option value="${v}" ${sp.vehicle === v ? 'selected' : ''}>${FG.VEHICLES[v].emoji} ${FG.VEHICLES[v].name}</option>`).join('')}</select></label>
      <div id="spotCalc">${spotCalc()}</div>
      <div class="btns end"><button class="btn primary" data-act="doSpot">Vender agora</button></div></div>`;
  }

  // =====================================================================
  // PAÍS
  // =====================================================================
  function viewCountry() {
    const sel = ui.countryProduct;
    const nat = E.nationalPrice(S, sel);
    const regs = Object.entries(FG.REGIONS);
    const dark = isDark();
    const polys = regs.map(([id, r]) => {
      const rp = E.regionPrice(S, sel, id);
      const t = Math.max(-1, Math.min(1, (rp / nat - 1) / 0.2));
      return `<polygon points="${r.poly}" fill="${Ch.div(t, dark)}" class="district ${ui.region === id ? 'sel' : ''}" data-act="region" data-id="${id}" data-tip="${r.name}: ${unitPrice(rp)} (${pct(rp / nat - 1)} vs média) · ${r.dist ? num(r.dist) + ' km' : 'sua região'}"/>`;
    }).join('');
    const rlabels = regs.map(([id, r]) => {
      const rp = E.regionPrice(S, sel, id);
      return `<text x="${r.label[0]}" y="${r.label[1]}" class="dlabel" text-anchor="middle">${r.home ? '🏡 ' : ''}${r.name}</text>
        <text x="${r.label[0]}" y="${r.label[1] + 16}" class="dsub" text-anchor="middle">${unitPrice(rp)}</text>`;
    }).join('');
    const routes = regs.filter(([, r]) => !r.home).map(([, r]) => `<line x1="350" y1="335" x2="${r.label[0]}" y2="${r.label[1] + 22}" class="route"/>`).join('');
    const map = `<svg class="map country" viewBox="0 0 500 500" role="img" aria-label="Mapa do país"><rect width="500" height="500" class="ocean"/>${polys}${routes}${rlabels}</svg>
      <div class="maplegend"><span>Mais barato</span><span class="ramp">${[-1, -0.6, -0.3, 0, 0.3, 0.6, 1].map(t => `<i style="background:${Ch.div(t, dark)}"></i>`).join('')}</span><span>Mais caro que a média</span></div>`;
    const m = S.macro;
    const macro = [
      ['💵 Dólar', fmt(m.dolar, 2), 'dolar', v => fmt(v, 2)],
      ['🏦 Selic', num(m.selic, 2) + '% a.a.', 'selic', v => num(v, 2) + '%'],
      ['📈 Inflação', num(m.inflation, 1) + '% a.a.', 'inflation', v => num(v, 1) + '%'],
      ['⛽ Diesel', fmt(m.diesel, 2) + '/L', 'diesel', v => fmt(v, 2)],
    ].map(([l, v, k, f]) => `<div class="macro"><small>${l}</small><b>${v}</b>${trendTag(E.macroTrend(S, k))}${Ch.spark(m.hist[k], { last: 90, w: 120, h: 26, fmt: f })}</div>`).join('');
    const rows = Object.keys(P).map(p => {
      const sf = E.seasonFactor(S, p);
      return `<tr class="${p === sel ? 'hl' : ''}"><td><button class="linkrow" data-act="countryProduct" data-p="${p}">${P[p].emoji} ${P[p].name}</button></td><td class="num">${unitPrice(E.nationalPrice(S, p))}</td><td>${trendTag(E.trend(S, p, 30))}</td>
        <td>${Ch.spark(S.market.hist[p], { last: 90, fmt: v => fmt(v, 2), label: (i, n) => `há ${n - 1 - i} dias` })}</td><td class="small">${sf > 1.05 ? '<span class="tag bad">entressafra</span>' : sf < 0.95 ? '<span class="tag good">safra</span>' : '—'}</td></tr>`;
    }).join('');
    const natOrders = S.orders.filter(o => FG.NATIONAL_BUYERS[o.buyer]);
    const reg = ui.region ? FG.REGIONS[ui.region] : null;
    const regCard = reg ? `<section class="card"><div class="card-h"><h3>📍 ${reg.name}</h3><button class="btn ghost small" data-act="closeRegion">✕</button></div>
      <p>${reg.home ? 'Sua região. A Metrópole e a Ceasa ficam aqui.' : `Distância: <b>${num(reg.dist)} km</b>. Frete terceirizado (27 t): <b>${fmt(E.freightCost(S, 27000, reg.dist, 'frete').cost)}</b> por carreta ≈ ${fmt(E.freightCost(S, 27000, reg.dist, 'frete').cost / 27)}/t.`}</p>
      <table class="tbl"><thead><tr><th>Produto</th><th>Preço regional</th><th>vs média</th></tr></thead><tbody>${Object.keys(P).filter(p => reg.bias[p]).map(p => `<tr><td>${P[p].emoji} ${P[p].name}</td><td class="num">${unitPrice(E.regionPrice(S, p, ui.region))}</td><td>${pct(reg.bias[p] - 1, 0)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Preços na média nacional.</td></tr>'}</tbody></table>
      ${Object.entries(FG.NATIONAL_BUYERS).filter(([, b]) => b.region === ui.region).map(([id, b]) => `<p class="small">${b.emoji} <b>${b.name}</b> compra ${b.buys.map(p => P[p].name).join(', ')}.</p>`).join('')}</section>` : '';
    return `<div class="layout country">
      <section class="card mapcard"><div class="card-h"><h2>🇧🇷 País — preços regionais</h2><span class="muted">média nacional: ${unitPrice(nat)}/${P[sel].unit}</span></div>
        ${productChips(sel, 'countryProduct', Object.keys(P))}${map}</section>
      <aside class="side">
        <section class="card"><h3>🏛️ Economia nacional</h3><div class="macros">${macro}</div>
          <p class="small muted">Dólar alto encarece adubo e ração, mas valoriza grãos e café. Selic define os juros dos empréstimos. Diesel pesa no frete.</p></section>
        ${regCard}
        <section class="card"><h3>🚛 Pedidos de outras regiões</h3>${S.level < 3 ? '<p class="muted">Distribuidoras de outras regiões negociam com fazendas a partir do nível 3. Volumes grandes, fretes longos.</p>' : natOrders.length ? natOrders.map(orderRow).join('') : '<p class="muted">Sem pedidos regionais no momento.</p>'}</section>
        <section class="card"><h3>📊 Preços nacionais (90 dias)</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th>Preço</th><th>30 dias</th><th>Tendência</th><th>Ciclo</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      </aside></div>`;
  }

  // =====================================================================
  // MUNDO
  // =====================================================================
  function viewWorld() {
    const sel = ui.worldProduct;
    const dark = isDark();
    const polys = Object.entries(FG.BLOCS).map(([id, b]) => {
      const role = b.role[sel] || 0;
      const t = Math.max(-1, Math.min(1, -role)); // importador = positivo (vermelho = demanda forte)
      const lbl = role > 0.3 ? 'exportador' : role < -0.3 ? 'importador' : 'neutro';
      return `<polygon points="${b.poly}" fill="${Ch.div(t, dark)}" class="district" data-tip="${b.name}: ${lbl} de ${P[sel].name}"/>
        <text x="${b.label[0]}" y="${b.label[1]}" class="dlabel" text-anchor="middle">${b.flag} ${b.name}</text>
        <text x="${b.label[0]}" y="${b.label[1] + 15}" class="dsub" text-anchor="middle">${lbl}</text>`;
    }).join('');
    const map = `<svg class="map world" viewBox="0 0 1000 500" role="img" aria-label="Mapa-múndi"><rect width="1000" height="500" class="ocean"/>${polys}
      <path d="M330,330 C420,330 470,260 500,150" class="route"/><path d="M330,330 C520,380 700,260 790,180" class="route"/></svg>
      <div class="maplegend"><span>Exporta (concorre com você)</span><span class="ramp">${[-1, -0.6, -0.3, 0, 0.3, 0.6, 1].map(t => `<i style="background:${Ch.div(t, dark)}"></i>`).join('')}</span><span>Importa (compra)</span></div>`;
    const rows = FG.TRADED.map(p => `<tr class="${p === sel ? 'hl' : ''}"><td><button class="linkrow" data-act="worldProduct" data-p="${p}">${P[p].emoji} ${P[p].name}</button></td>
      <td class="num">US$ ${num(E.usdPrice(S, p), 2)}</td><td class="num">${unitPrice(E.usdPrice(S, p) * S.macro.dolar)}</td>
      <td>${trendTag((S.market.usd[p] - 1))}</td><td>${Ch.spark(S.market.hist[p], { last: 90, fmt: v => fmt(v, 2) })}</td></tr>`).join('');
    const events = S.market.events.filter(e => e.until > S.day);
    const news = events.length ? events.map(ev => { const d = FG.EVENTS.find(x => x.id === ev.id);
      return `<div class="news"><span>${d.icon}</span><div><b>${d.title}</b><div class="small">${d.text}</div><div class="small muted">${Object.entries(ev.target).map(([p, v]) => `${P[p].emoji} ${pct(v - 1, 0)}`).join(' · ')} · mais ${ev.until - S.day} dias</div></div></div>`; }).join('')
      : '<p class="muted">Mercado internacional sem choques no momento. Preços tendem à média histórica.</p>';
    const exOrders = S.orders.filter(o => o.buyer === 'export');
    const L = FG.EXPORT_LICENSE;
    const exp = S.exportLicense ? (exOrders.length ? exOrders.map(orderRow).join('') : '<p class="muted">Sem pedidos de exportação agora.</p>')
      : `<p>Exportar exige <b>nível ${L.level}</b> e licença (${fmt(L.cost * S.macro.priceLevel)}). Volumes de ${num(10 * 8)} t+, preço em dólar, taxa portuária de ${num(L.portFee * 100, 1)}%, porto a ${L.portDist} km.</p>
        <button class="btn primary" data-act="license" ${S.level < L.level ? 'disabled' : ''}>Comprar licença de exportação</button>`;
    return `<div class="layout world">
      <section class="card mapcard"><div class="card-h"><h2>🌎 Mundo — comércio de commodities</h2><span class="muted">dólar ${fmt(S.macro.dolar, 2)}</span></div>
        ${productChips(sel, 'worldProduct', FG.TRADED)}${map}</section>
      <aside class="side">
        <section class="card"><h3>📰 Notícias do mercado global</h3>${news}</section>
        <section class="card"><h3>💹 Cotações internacionais</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Commodity</th><th>US$/un</th><th>Em reais</th><th>vs média</th><th>Preço no país (90d)</th></tr></thead><tbody>${rows}</tbody></table></div>
          <p class="small muted">O preço nacional de grãos, café, laranja e carne segue a cotação internacional × dólar. Choques lá fora chegam aqui em poucos dias.</p></section>
        <section class="card"><h3>🚢 Exportação</h3>${exp}</section>
      </aside></div>`;
  }

  // =====================================================================
  // FINANÇAS
  // =====================================================================
  function viewFinance() {
    const a = E.assets(S), d = E.debts(S), f = E.monthlyFixed(S), r = E.risk(S);
    const L = S.ledger;
    const cur = { label: 'Mês atual*', ...L, varCosts: L.taxes + L.freight + L.seeds + L.feed + L.processing, fixedCosts: L.salaries + L.upkeep + L.interest + L.other + L.penalties };
    cur.result = L.revenue - cur.varCosts - cur.fixedCosts;
    const months = [...S.history.months.slice(-5), cur];
    const line = (label, key, sign = -1, cls = '') => `<tr class="${cls}"><td>${label}</td>${months.map(m => `<td class="num">${money(sign * (m[key] || 0))}</td>`).join('')}</tr>`;
    const dre = `<div class="tbl-wrap"><table class="tbl dre"><thead><tr><th></th>${months.map(m => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>
      ${line('Receita bruta', 'revenue', 1, 'tot')}${line('Impostos sobre venda', 'taxes')}${line('Frete', 'freight')}${line('Sementes e insumos', 'seeds')}${line('Ração', 'feed')}${line('Processamento', 'processing')}
      ${line('Custos variáveis', 'varCosts', -1, 'sub')}${line('Salários', 'salaries')}${line('Manutenção', 'upkeep')}${line('Juros', 'interest')}${line('Custo de vida, energia e impostos', 'other')}${line('Multas contratuais', 'penalties')}
      ${line('Custos fixos', 'fixedCosts', -1, 'sub')}${line('Resultado', 'result', 1, 'tot')}
      <tr class="muted"><td>Investimentos (terra, construções, animais)</td>${months.map(m => `<td class="num">${fmt(-(m.investments || 0))}</td>`).join('')}</tr></tbody></table></div>`;
    const days = S.history.cash.length;
    const chart = Ch.lines([{ name: 'Caixa', values: S.history.cash.slice(-180) }, { name: 'Patrimônio líquido', values: S.history.worth.slice(-180) }],
      { fmt: v => fmt(v), xLabel: (i, n) => E.dateLabel(S, S.day - (n - 1 - i)), title: 'Caixa e patrimônio' });
    const limit = E.creditLimit(S);
    const loans = S.loans.length ? `<table class="tbl"><thead><tr><th>Saldo</th><th>Parcela</th><th>Restam</th><th>Juros a.a.</th><th></th></tr></thead><tbody>${S.loans.map(l => `<tr><td class="num">${fmt(l.balance)}</td><td class="num">${fmt(l.installment)}</td><td class="num">${l.left}x</td><td class="num">${num(l.rate * 1200, 1)}%</td><td><button class="btn small ghost" data-act="payLoan" data-id="${l.id}">Quitar</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nenhum empréstimo ativo.</p>';
    return `<div class="fin">
      <div class="tiles">
        <div class="stat"><small>Caixa</small><b>${money(S.cash)}</b><span class="muted small">+ ${fmt(a.receivables)} a receber</span></div>
        <div class="stat"><small>Patrimônio líquido</small><b>${money(S.netWorthCache)}</b><span class="muted small">ativos ${fmt(a.total)} − dívidas ${fmt(d.total)}</span></div>
        <div class="stat"><small>Custos fixos / mês</small><b>${fmt(f.total)}</b><span class="muted small">${fmt(f.total / 30)} por dia</span></div>
        <div class="stat risk ${r.level}"><small>Saúde financeira</small><b>${{ good: '✅ Saudável', warning: '⚠️ Atenção', serious: '🟠 Risco', critical: '🚨 Crítico' }[r.level]}</b><span class="small">${r.text}</span></div>
      </div>
      <section class="card wide"><div class="card-h"><h3>📈 Caixa e patrimônio (${Math.min(180, days)} dias)</h3></div>${chart}</section>
      <section class="card wide"><div class="card-h"><h3>📒 Demonstrativo de resultado (DRE)</h3><span class="muted small">*mês em andamento</span></div>${dre}</section>
      <div class="cols">
        <section class="card"><h3>🧾 Custos fixos mensais</h3>${Ch.bars([
          { label: 'Salários', value: f.salaries }, { label: 'Manutenção', value: f.upkeep }, { label: 'Custo de vida', value: f.living },
          { label: 'Energia e água', value: f.utilities }, { label: 'Imposto da terra', value: f.landTax }, { label: 'Parcelas', value: f.loans }], { fmt: v => fmt(v) })}
          <p class="small muted">Cobrados no último dia de cada mês. Se o caixa ficar negativo você entra no cheque especial (~8% ao mês). Falência: 60 dias no vermelho ou estouro de ${fmt(E.overdraftLimit(S))}.</p></section>
        <section class="card"><h3>⚖️ Balanço patrimonial</h3>${Ch.bars([
          { label: 'Terra', value: a.land }, { label: 'Construções', value: a.buildings }, { label: 'Animais', value: a.animals }, { label: 'Veículos', value: a.vehicles },
          { label: 'Estoque', value: a.stock }, { label: 'Lavouras', value: a.crops }, { label: 'Caixa + a receber', value: a.cash + a.receivables },
          { label: 'Dívidas', value: -d.total, color: 'var(--critical)' }], { fmt: v => fmt(v) })}</section>
        <section class="card"><h3>🏦 Banco</h3>
          <p class="small">Limite de crédito: <b>${fmt(limit)}</b> (garantia: 50% de terra, construções, animais e veículos).</p>
          <div class="loanform"><label>Valor<input type="number" id="loanAmt" min="1000" step="1000" value="${Math.min(limit, 20000)}"></label>
          <label>Prazo<select id="loanMonths">${[12, 24, 36].map(m => `<option value="${m}">${m} meses — ${num(E.loanRate(S, m) * 1200, 1)}% a.a.</option>`).join('')}</select></label></div>
          <div id="loanPreview" class="small muted">${loanPreview()}</div>
          <button class="btn primary" data-act="loan" ${limit < 1000 ? 'disabled' : ''}>Contratar empréstimo</button>
          <h4>Empréstimos ativos</h4>${loans}</section>
      </div></div>`;
  }
  function loanPreview() {
    const amtEl = rootEl.querySelector('#loanAmt'), mEl = rootEl.querySelector('#loanMonths');
    const amt = amtEl ? +amtEl.value : Math.min(E.creditLimit(S), 20000);
    const months = mEl ? +mEl.value : 12;
    const r = E.loanRate(S, months);
    const inst = amt * r / (1 - Math.pow(1 + r, -months));
    return amt > 0 ? `Parcela: <b>${fmt(inst)}</b>/mês · total pago ${fmt(inst * months)} (juros ${fmt(inst * months - amt)})` : '';
  }

  // =====================================================================
  // DIÁRIO
  // =====================================================================
  function viewLog() {
    const f = ui.logFilter;
    const list = S.log.filter(l => f === 'all' || l.type === f);
    return `<section class="card wide"><div class="card-h"><h2>📜 Diário da fazenda</h2></div>
      <div class="subtabs">${[['all', 'Tudo'], ['good', 'Conquistas e vendas'], ['bad', 'Problemas'], ['world', 'Mercado global'], ['info', 'Avisos']].map(([id, l]) => `<button class="chip ${f === id ? 'on' : ''}" data-act="logFilter" data-id="${id}">${l}</button>`).join('')}</div>
      <h3>🎯 Metas</h3><div class="goals">${FG.GOALS.map(g => `<div class="goal ${S.goals[g.id] !== undefined ? 'done' : ''}">${S.goals[g.id] !== undefined ? '✅' : '⬜'} ${g.text}</div>`).join('')}</div>
      <h3>Eventos</h3><div class="log">${list.map(l => `<div class="logrow ${l.type}"><span class="muted small">${E.dateLabel(S, l.day)}</span><span>${l.icon}</span><span>${l.text}</span></div>`).join('') || '<p class="muted">Nada por aqui.</p>'}</div></section>`;
  }

  // =====================================================================
  // MODAIS DIVERSOS
  // =====================================================================
  function showHelp() {
    ui.modal = { html: `<div class="card-h"><h2>🌾 Como jogar</h2><button class="btn ghost small" data-act="closeModal">✕</button></div>
      <ol class="help">
        <li><b>Fazenda:</b> clique nos lotes para plantar (custo de implantação), construir galinheiros, currais, silos e agroindústrias, ou comprar terra vizinha (➕).</li>
        <li><b>Produção:</b> lavouras crescem por dias; a estação muda a produtividade. Animais produzem todo dia e consomem ração (seu milho ou comprada).</li>
        <li><b>Mão de obra:</b> cada lavoura/instalação exige trabalho. Sem funcionários suficientes, a produção cai.</li>
        <li><b>Cidade:</b> veja no mapa a demanda dos bairros e os compradores. Cada um publica pedidos com preço de referência e prazo.</li>
        <li><b>Negociação:</b> proponha preço e quantidade e escolha o transporte. A cotação mostra impostos, frete, custo de produção, lucro, margem e preço mínimo. Peça demais e o comprador desiste.</li>
        <li><b>Contratos:</b> garantem vendas semanais a preço fixo, mas faltar produto gera multa.</li>
        <li><b>País e Mundo:</b> acompanhe dólar, juros, diesel, preços regionais e choques globais para decidir o que plantar e quando vender.</li>
        <li><b>Finanças:</b> custos fixos são cobrados no fim do mês. Caixa negativo = cheque especial. 60 dias no vermelho ou estourar o limite = <b>falência</b>.</li>
      </ol>
      <p class="muted small">Atalhos: espaço = jogar/pausar · Esc = fechar janela. O jogo salva sozinho a cada 10 dias neste navegador.</p>
      <div class="btns end"><button class="btn primary" data-act="closeModal">Começar</button></div>` };
    renderModal();
  }
  function showMenu() {
    ui.modal = { html: `<div class="card-h"><h2>☰ Menu</h2><button class="btn ghost small" data-act="closeModal">✕</button></div>
      <div class="menu">
        <button class="btn" data-act="save">💾 Salvar jogo</button>
        <button class="btn" data-act="load">📂 Carregar jogo salvo</button>
        <button class="btn" data-act="help">❓ Como jogar</button>
        <button class="btn" data-act="theme">🌓 Alternar tema claro/escuro</button>
        <label>Nome da fazenda<input type="text" id="farmNameIn" value="${S.farmName.replace(/"/g, '')}"></label>
        <button class="btn primary" data-act="newGame" data-confirm="Começar um novo jogo? O progresso não salvo será perdido.">🌱 Novo jogo</button>
      </div>` };
    renderModal();
  }
  function showGameOver() {
    const g = S.gameOver;
    ui.modal = { cls: 'over', html: `<h2>💀 Falência</h2><p>${g.reason}</p>
      <div class="stats"><div><small>Dias de operação</small><b>${g.day}</b></div><div><small>Nível alcançado</small><b>${S.level}</b></div><div><small>Receita acumulada</small><b>${fmt(S.revenueTotal)}</b></div><div><small>Negócios fechados</small><b>${S.stats.deals}</b></div></div>
      <p class="muted">Dica: acompanhe o DRE em Finanças, mantenha caixa para pelo menos um mês de custos fixos e não plante mais do que a cidade consegue comprar.</p>
      <div class="btns end"><button class="btn" data-act="closeModal">Ver a fazenda</button><button class="btn primary" data-act="newGame">Começar de novo</button></div>` };
    renderModal();
  }

  // =====================================================================
  // EVENTOS DE INTERFACE
  // =====================================================================
  function onClick(e) {
    if (e.target.id === 'modal') { closeModal(); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act, ds = { ...el.dataset };
    if (a === 'newGame') { const n = rootEl.querySelector('#farmNameIn'); if (n) ds.farmName = n.value.trim(); }
    if (a === 'confirmYes') { const p = ui.pending; ui.pending = null; closeModal(); if (p) doAction(p.a, p.ds); return; }
    if (ds.confirm) { askConfirm(a, ds); return; }
    doAction(a, ds);
  }

  // confirmação dentro da página (confirm() nativo não funciona em todos os ambientes)
  function askConfirm(a, ds) {
    const clean = { ...ds }; delete clean.confirm;
    ui.pending = { a, ds: clean };
    ui.modal = { html: `<h2>Confirmar</h2><p>${ds.confirm}</p><div class="btns end"><button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="confirmYes">Confirmar</button></div>` };
    renderModal();
  }

  function doAction(a, ds) {
    const i = ds.i !== undefined ? +ds.i : null;
    switch (a) {
      case 'tab': ui.tab = ds.tab; render(); window.scrollTo(0, 0); break;
      case 'auto': toggleAuto(); break;
      case 'speed': ui.speed = ui.speed < 500 ? 900 : 300; if (ui.auto) { clearInterval(timer); timer = setInterval(tick, ui.speed); } renderClock(); break;
      case 'day': E.advanceDays(S, +ds.n); afterTick(); break;
      case 'menu': showMenu(); break;
      case 'help': showHelp(); break;
      case 'save': save(); closeModal(); break;
      case 'load': { const s = load(); if (s) { UI.setState(s); toast('Jogo carregado.', 'good'); } else toast('Nenhum jogo salvo.', 'bad'); break; }
      case 'theme': { const d = isDark(); document.documentElement.dataset.theme = d ? 'light' : 'dark'; render(); break; }
      case 'newGame': {
        S = E.newGame({ farmName: ds.farmName || undefined });
        ui.sel = null; ui.buyer = null; ui.tab = 'farm'; closeModal(); save(true); render(); break;
      }
      case 'closeModal': closeModal(); render(); break;
      case 'tile': ui.sel = i; render(); break;
      case 'buyTile': result(E.buyTile(S, i)); break;
      case 'plant': result(E.plant(S, i, ds.c)); break;
      case 'build': result(E.build(S, i, ds.b)); break;
      case 'harvest': result(E.harvest(S, i)); break;
      case 'harvestAll': { let n = 0; S.tiles.forEach((t, k) => { if (t.crop && t.crop.ready && E.harvest(S, k).ok) n++; }); toast(`${n} lote(s) colhido(s).`, 'good'); render(); break; }
      case 'clear': result(E.clearTile(S, i)); break;
      case 'buyAnimal': result(E.buyAnimals(S, ds.a, +ds.n)); break;
      case 'sellAnimal': result(E.sellAnimals(S, ds.a, +ds.n)); break;
      case 'hire': result(E.hire(S)); break;
      case 'fire': result(E.fire(S)); break;
      case 'buyVehicle': result(E.buyVehicle(S, ds.v)); break;
      case 'sellVehicle': result(E.sellVehicle(S, ds.v)); break;
      case 'license': result(E.buyLicense(S)); break;
      case 'cityProduct': ui.cityProduct = ds.p; render(); break;
      case 'countryProduct': ui.countryProduct = ds.p; render(); break;
      case 'worldProduct': ui.worldProduct = ds.p; render(); break;
      case 'district': ui.district = ds.id; ui.buyer = null; render(); break;
      case 'buyer': ui.buyer = ds.id; render(); break;
      case 'closeBuyer': ui.buyer = null; ui.district = null; render(); break;
      case 'region': ui.region = ds.id; render(); break;
      case 'closeRegion': ui.region = null; render(); break;
      case 'bizTab': ui.bizTab = ds.id; render(); break;
      case 'logFilter': ui.logFilter = ds.id; render(); break;
      case 'negotiate': openNeg(+ds.id); break;
      case 'propose': {
        const n = ui.neg, o = S.orders.find(x => x.id === n.id);
        if (!o) break;
        n.chat.push({ who: 'me', text: `Proponho ${unitPrice(n.price)} por ${P[o.product].unit}, ${qtyFmt(n.qty)} ${P[o.product].unit}.` });
        const r = E.propose(S, n.id, n.price, n.qty, n.vehicle);
        n.chat.push({ who: r.result === 'accept' ? 'ok' : r.result === 'invalid' ? 'sys' : 'them', text: r.msg });
        if (r.result === 'counter') n.price = r.counter;
        if (r.result === 'accept') toast(r.msg, 'good');
        if (r.result === 'walkaway') toast(r.msg, 'bad');
        render(); renderModal(); break;
      }
      case 'acceptCounter': { const r = E.acceptCounter(S, +ds.id, ui.neg && ui.neg.vehicle); ui.neg.chat.push({ who: r.ok ? 'ok' : 'sys', text: r.msg }); toast(r.msg, r.ok ? 'good' : 'bad'); render(); renderModal(); break; }
      case 'declineOrder': E.declineOrder(S, +ds.id); closeModal(); render(); break;
      case 'spot': openSpot(ds.p); break;
      case 'doSpot': { const r = E.sellSpot(S, ui.spot.p, ui.spot.qty, ui.spot.vehicle); closeModal(); result(r); break; }
      case 'loan': { const amt = +rootEl.querySelector('#loanAmt').value, m = +rootEl.querySelector('#loanMonths').value; result(E.takeLoan(S, amt, m)); break; }
      case 'payLoan': result(E.payLoan(S, +ds.id)); break;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.set) { S.settings[t.dataset.set] = t.checked; return; }
    if (t.dataset.neg && ui.neg) {
      const k = t.dataset.neg;
      ui.neg[k] = k === 'vehicle' ? (t.value || null) : Math.max(0, +t.value || 0);
      if (k === 'price') rootEl.querySelectorAll('[data-neg="price"]').forEach(x => { if (x !== t) x.value = ui.neg.price; });
      const btn = rootEl.querySelector('[data-act="propose"]');
      if (btn) btn.textContent = `Propor ${unitPrice(ui.neg.price)}`;
      refreshNeg();
      return;
    }
    if (t.dataset.spot && ui.spot) {
      const k = t.dataset.spot;
      ui.spot[k] = k === 'vehicle' ? (t.value || null) : Math.min(S.stock[ui.spot.p].qty, Math.max(0, +t.value || 0));
      if (k === 'qty') rootEl.querySelectorAll('[data-spot="qty"]').forEach(x => { if (x !== t) x.value = ui.spot.qty; });
      const el = rootEl.querySelector('#spotCalc'); if (el) el.innerHTML = spotCalc();
      return;
    }
    if (t.id === 'loanAmt' || t.id === 'loanMonths') { const el = rootEl.querySelector('#loanPreview'); if (el) el.innerHTML = loanPreview(); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
