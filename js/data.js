/* Fazenda Império — catálogos do jogo (dados estáticos).
   Tudo aqui é configuração: o motor (engine.js) lê estes valores. */
(function (root) {
  const FG = root.FG = root.FG || {};

  // Calendário: 30 dias por mês, 12 meses por ano.
  FG.MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  // Estação (hemisfério sul) por mês: 0 verão, 1 outono, 2 inverno, 3 primavera
  FG.SEASON_OF_MONTH = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0];
  FG.SEASONS = [
    { name: 'Verão', icon: '☀️' },
    { name: 'Outono', icon: '🍂' },
    { name: 'Inverno', icon: '❄️' },
    { name: 'Primavera', icon: '🌸' },
  ];

  /* Produtos vendáveis.
     weight = kg por unidade (frete e armazenagem); price = preço base nacional (R$/unidade)
     spoil = fração perdida por dia em estoque; perishable = sofre perda acelerada sem câmara fria
     usd = preço internacional base em US$ (só para commodities negociadas no mundo) */
  FG.PRODUCTS = {
    alface:  { name: 'Alface',        emoji: '🥬', unit: 'cx 12un',  weight: 6,  price: 32,   spoil: 0.12,  cat: 'Hortaliça' },
    tomate:  { name: 'Tomate',        emoji: '🍅', unit: 'cx 20kg',  weight: 20, price: 72,   spoil: 0.05,  cat: 'Hortaliça' },
    batata:  { name: 'Batata',        emoji: '🥔', unit: 'sc 50kg',  weight: 50, price: 120,  spoil: 0.008, cat: 'Hortaliça' },
    milho:   { name: 'Milho',         emoji: '🌽', unit: 'sc 60kg',  weight: 60, price: 66,   spoil: 0.001, cat: 'Grão', usd: 4.4 * 2.36 },
    trigo:   { name: 'Trigo',         emoji: '🌾', unit: 'sc 60kg',  weight: 60, price: 86,   spoil: 0.001, cat: 'Grão', usd: 5.6 * 2.2 },
    soja:    { name: 'Soja',          emoji: '🫘', unit: 'sc 60kg',  weight: 60, price: 140,  spoil: 0.001, cat: 'Grão', usd: 11.5 * 2.2 },
    laranja: { name: 'Laranja',       emoji: '🍊', unit: 'cx 40kg',  weight: 40, price: 48,   spoil: 0.02,  cat: 'Fruta', usd: 9 },
    cafe:    { name: 'Café',          emoji: '☕', unit: 'sc 60kg',  weight: 60, price: 1400, spoil: 0.0005, cat: 'Grão', usd: 260 },
    ovos:    { name: 'Ovos',          emoji: '🥚', unit: 'bdj 30un', weight: 2,  price: 22,   spoil: 0.02,  cat: 'Animal' },
    leite:   { name: 'Leite',         emoji: '🥛', unit: 'L',        weight: 1,  price: 2.7,  spoil: 0.15,  cat: 'Animal' },
    suino:   { name: 'Carne suína',   emoji: '🥩', unit: 'kg',       weight: 1,  price: 15,   spoil: 0.04,  cat: 'Animal', usd: 2.7 },
    mel:     { name: 'Mel',           emoji: '🍯', unit: 'kg',       weight: 1,  price: 42,   spoil: 0,     cat: 'Animal' },
    farinha: { name: 'Farinha',       emoji: '🥖', unit: 'sc 25kg',  weight: 25, price: 78,   spoil: 0.002, cat: 'Processado' },
    queijo:  { name: 'Queijo',        emoji: '🧀', unit: 'kg',       weight: 1,  price: 46,   spoil: 0.01,  cat: 'Processado' },
  };
  FG.PERISHABLE_LIMIT = 0.02; // spoil >= isto é perecível (câmara fria reduz perdas)

  /* Lavouras. cost = custo de implantação por lote (sementes/mudas, adubo, defensivos);
     days = ciclo até a colheita; yield = unidades por lote; season = multiplicador por estação
     water = sensibilidade à seca (0..1); perennial = após colher, rebrota em `regrow` dias */
  FG.CROPS = {
    alface:  { product: 'alface',  cost: 260,  days: 12, yield: 60, season: [0.8, 1.0, 1.1, 1.0],   water: 0.9, level: 1 },
    milho:   { product: 'milho',   cost: 720,  days: 35, yield: 72, season: [1.2, 1.0, 0.7, 1.1],   water: 0.6, level: 1 },
    tomate:  { product: 'tomate',  cost: 950,  days: 28, yield: 70, season: [1.0, 1.1, 0.8, 1.1],   water: 0.7, level: 1 },
    batata:  { product: 'batata',  cost: 1250, days: 30, yield: 46, season: [0.8, 1.0, 1.15, 1.0],  water: 0.6, level: 2 },
    soja:    { product: 'soja',    cost: 1150, days: 40, yield: 46, season: [1.25, 0.9, 0.6, 1.1],  water: 0.6, level: 3 },
    trigo:   { product: 'trigo',   cost: 820,  days: 36, yield: 52, season: [0.6, 1.0, 1.25, 0.9],  water: 0.4, level: 3 },
    laranja: { product: 'laranja', cost: 3200, days: 60, yield: 80, season: [1, 1, 1, 1],           water: 0.5, level: 4, perennial: true, regrow: 30, upkeep: 120 },
    cafe:    { product: 'cafe',    cost: 6500, days: 90, yield: 12, season: [1.0, 1.1, 1.0, 1.0],   water: 0.5, level: 5, perennial: true, regrow: 60, upkeep: 300 },
  };

  /* Animais: price = compra por cabeça; feed = kg de milho/ração por dia;
     out = unidades do produto por cabeça/dia; house = instalação necessária */
  FG.ANIMALS = {
    galinha: { name: 'Galinha', emoji: '🐔', price: 40,   feed: 0.12, product: 'ovos',  out: 0.045, house: 'galinheiro', level: 1 },
    abelha:  { name: 'Colmeia', emoji: '🐝', price: 420,  feed: 0,    product: 'mel',   out: 0.085, house: 'apiario',    level: 2 },
    vaca:    { name: 'Vaca',    emoji: '🐄', price: 4500, feed: 6,    product: 'leite', out: 20,    house: 'curral',     level: 2 },
    porco:   { name: 'Porco',   emoji: '🐖', price: 600,  feed: 2.5,  product: 'suino', out: 0.7,   house: 'chiqueiro',  level: 3 },
  };

  /* Construções ocupam um lote. upkeep = manutenção mensal; labor = mão de obra exigida */
  FG.BUILDINGS = {
    galinheiro: { name: 'Galinheiro',     emoji: '🛖', cost: 6000,  upkeep: 150, labor: 1, level: 1, capacity: 100, animal: 'galinha', desc: 'Abriga até 100 galinhas poedeiras.' },
    apiario:    { name: 'Apiário',        emoji: '🐝', cost: 4000,  upkeep: 80,  labor: 1, level: 2, capacity: 20,  animal: 'abelha',  desc: 'Até 20 colmeias. Polinização: +5% nas lavouras.' },
    curral:     { name: 'Curral leiteiro', emoji: '🐄', cost: 18000, upkeep: 400, labor: 2, level: 2, capacity: 10,  animal: 'vaca',    desc: 'Até 10 vacas leiteiras com ordenha.' },
    chiqueiro:  { name: 'Chiqueiro',      emoji: '🐖', cost: 12000, upkeep: 300, labor: 2, level: 3, capacity: 20,  animal: 'porco',   desc: 'Até 20 porcos para corte.' },
    silo:       { name: 'Silo',           emoji: '🏗️', cost: 15000, upkeep: 200, labor: 0, level: 1, storage: 60000, desc: '+60 t de armazenagem.' },
    camara:     { name: 'Câmara fria',    emoji: '🧊', cost: 20000, upkeep: 600, labor: 0, level: 2, storage: 8000, desc: '+8 t e reduz 70% das perdas de perecíveis.' },
    poco:       { name: 'Poço e irrigação', emoji: '💧', cost: 14000, upkeep: 250, labor: 0, level: 2, desc: 'Protege da seca e +10% de produtividade nas lavouras.' },
    estufa:     { name: 'Estufa',         emoji: '🏠', cost: 25000, upkeep: 350, labor: 1, level: 4, desc: 'Lote protegido: planta sem efeito de estação ruim nem clima (+15%).' },
    moinho:     { name: 'Moinho',         emoji: '⚙️', cost: 22000, upkeep: 400, labor: 1, level: 3, process: { from: 'trigo', to: 'farinha', ratio: 1.8, max: 20, cost: 12 }, desc: 'Transforma até 20 sc de trigo/dia em farinha (1 sc → 1,8 sc 25kg).' },
    laticinio:  { name: 'Laticínio',      emoji: '🏭', cost: 30000, upkeep: 700, labor: 2, level: 4, process: { from: 'leite', to: 'queijo', ratio: 0.1, max: 400, cost: 0.3 }, desc: 'Transforma até 400 L de leite/dia em queijo (10 L → 1 kg).' },
  };

  /* Veículos. perKm = custo por km rodado (diesel a R$ 6,00); cap = carga por viagem (kg)
     roundTrip = frota própria volta vazia (cobra ida e volta) */
  FG.VEHICLES = {
    picape:   { name: 'Picape própria',      emoji: '🛻', price: 0,      cap: 1000,  perKm: 1.4, fixed: 0,   upkeep: 250,  roundTrip: true,  level: 1, owned: true },
    caminhao: { name: 'Caminhão 3/4 próprio', emoji: '🚚', price: 120000, cap: 6000,  perKm: 2.2, fixed: 0,   upkeep: 800,  roundTrip: true,  level: 3 },
    carreta:  { name: 'Carreta própria',      emoji: '🚛', price: 380000, cap: 30000, perKm: 2.8, fixed: 0,   upkeep: 2000, roundTrip: true,  level: 5 },
    frete:    { name: 'Frete terceirizado',   emoji: '📦', price: 0,      cap: 27000, perKm: 6.0, fixed: 280, upkeep: 0,    roundTrip: false, level: 1, hired: true },
  };
  FG.DIESEL_BASE = 6.0;

  /* Cidade: bairros com população, renda (1 baixa .. 3 alta) e distância da fazenda (km).
     poly = polígono no mapa SVG (viewBox 0 0 800 520). */
  FG.DISTRICTS = {
    norte:   { name: 'Zona Norte',          pop: 320000, income: 1, dist: 40, poly: '250,40 520,30 560,150 420,190 300,170 240,110', label: [395, 100] },
    centro:  { name: 'Centro',              pop: 180000, income: 2, dist: 48, poly: '300,170 420,190 470,280 380,320 300,280', label: [380, 245] },
    leste:   { name: 'Zona Leste',          pop: 260000, income: 2, dist: 56, poly: '420,190 560,150 720,180 740,320 600,340 470,280', label: [600, 255] },
    sul:     { name: 'Zona Sul',            pop: 150000, income: 3, dist: 60, poly: '380,320 470,280 600,340 640,470 450,490 380,420', label: [510, 400] },
    oeste:   { name: 'Zona Oeste / Universidade', pop: 120000, income: 2, dist: 44, poly: '180,200 300,170 300,280 380,320 380,420 220,410 170,300', label: [270, 320] },
    industrial: { name: 'Distrito Industrial', pop: 30000, income: 1, dist: 36, poly: '90,60 250,40 240,110 300,170 180,200 100,170', label: [175, 120] },
  };

  /* Compradores da cidade. buys = produtos que compram; vol = escala de volume;
     pf = disposição de preço (1 = preço de mercado); tough = dureza na negociação (0..1);
     pay = prazo de pagamento em dias. pos = posição do pino no mapa. */
  FG.BUYERS = {
    ceasa:      { name: 'Ceasa — Central de Abastecimento', emoji: '🏬', district: 'industrial', type: 'Atacado (venda imediata)', buys: 'all', vol: 0, pf: 0.84, tough: 0, pay: 0, pos: [140, 150], spot: true, dist: 34 },
    feiranorte: { name: 'Feira Livre da Zona Norte', emoji: '🧺', district: 'norte', type: 'Feira', buys: ['alface', 'tomate', 'batata', 'ovos', 'laranja', 'mel'], vol: 0.6, pf: 0.95, tough: 0.3, pay: 0, pos: [330, 90] },
    bompreco:   { name: 'Atacadão Bom Preço', emoji: '🛒', district: 'norte', type: 'Supermercado popular', buys: ['alface', 'tomate', 'batata', 'ovos', 'leite', 'farinha', 'laranja', 'suino'], vol: 1.6, pf: 0.9, tough: 0.7, pay: 30, pos: [470, 70] },
    mercadao:   { name: 'Mercado Municipal', emoji: '🏛️', district: 'centro', type: 'Mercado', buys: ['alface', 'tomate', 'batata', 'ovos', 'queijo', 'mel', 'laranja', 'suino', 'cafe'], vol: 0.9, pf: 1.02, tough: 0.4, pay: 7, pos: [350, 220] },
    sabor:      { name: 'Restaurante Sabor da Terra', emoji: '🍽️', district: 'centro', type: 'Restaurante', buys: ['alface', 'tomate', 'batata', 'ovos', 'queijo', 'suino', 'farinha'], vol: 0.35, pf: 1.1, tough: 0.35, pay: 15, pos: [420, 275] },
    familia:    { name: 'Supermercado Família', emoji: '🛒', district: 'leste', type: 'Supermercado', buys: ['alface', 'tomate', 'batata', 'ovos', 'leite', 'queijo', 'laranja', 'farinha', 'suino', 'mel'], vol: 1.2, pf: 0.97, tough: 0.55, pay: 21, pos: [620, 220] },
    paonosso:   { name: 'Padaria Pão Nosso', emoji: '🥐', district: 'leste', type: 'Padaria', buys: ['farinha', 'ovos', 'leite', 'queijo', 'trigo'], vol: 0.5, pf: 1.04, tough: 0.4, pay: 7, pos: [680, 290] },
    emporio:    { name: 'Empório Gourmet Jardins', emoji: '🧀', district: 'sul', type: 'Empório premium', buys: ['queijo', 'mel', 'cafe', 'ovos', 'tomate', 'alface'], vol: 0.3, pf: 1.28, tough: 0.5, pay: 15, pos: [470, 360] },
    bistro:     { name: 'Bistrô Vila Sul', emoji: '🍷', district: 'sul', type: 'Restaurante premium', buys: ['alface', 'tomate', 'queijo', 'suino', 'ovos', 'mel'], vol: 0.25, pf: 1.22, tough: 0.45, pay: 15, pos: [560, 440] },
    hortifruti: { name: 'Hortifruti Premium', emoji: '🥗', district: 'sul', type: 'Varejo premium', buys: ['alface', 'tomate', 'batata', 'laranja', 'mel', 'ovos'], vol: 0.6, pf: 1.15, tough: 0.5, pay: 15, pos: [420, 450] },
    ru:         { name: 'Restaurante Universitário', emoji: '🎓', district: 'oeste', type: 'Institucional', buys: ['alface', 'tomate', 'batata', 'ovos', 'leite', 'suino', 'farinha'], vol: 0.8, pf: 0.92, tough: 0.6, pay: 30, pos: [250, 280] },
    coop:       { name: 'Cooperativa Orgânica', emoji: '🌿', district: 'oeste', type: 'Cooperativa', buys: ['alface', 'tomate', 'mel', 'ovos', 'cafe', 'laranja'], vol: 0.4, pf: 1.12, tough: 0.3, pay: 15, pos: [300, 380] },
    nutrimax:   { name: 'NutriMax Alimentos', emoji: '🏭', district: 'industrial', type: 'Indústria', buys: ['milho', 'soja', 'trigo', 'leite', 'ovos', 'laranja'], vol: 3.0, pf: 0.9, tough: 0.75, pay: 30, pos: [180, 80], minLevel: 2 },
    frigorifico:{ name: 'Frigorífico Serra Azul', emoji: '🥩', district: 'industrial', type: 'Indústria', buys: ['suino'], vol: 2.5, pf: 0.93, tough: 0.7, pay: 21, pos: [215, 165], minLevel: 3 },
    racao:      { name: 'Fábrica de Rações Campo Forte', emoji: '🌾', district: 'industrial', type: 'Indústria', buys: ['milho', 'soja'], vol: 2.6, pf: 0.95, tough: 0.65, pay: 21, pos: [120, 110], minLevel: 2 },
  };

  /* Consumo urbano por 100 mil habitantes por semana (unidades), por produto.
     Base da demanda dos pedidos e do índice de demanda dos bairros. */
  FG.CONSUMPTION = {
    alface: 140, tomate: 70, batata: 40, milho: 120, trigo: 80, soja: 80, laranja: 50, cafe: 3,
    ovos: 260, leite: 3500, suino: 600, mel: 60, farinha: 70, queijo: 260,
  };
  // Preferência por renda (1, 2, 3): produtos premium vendem mais em bairros ricos.
  FG.INCOME_PREF = {
    alface: [1, 1.1, 1.3], tomate: [1, 1, 1.1], batata: [1.2, 1, 0.8], milho: [1, 1, 1], trigo: [1, 1, 1], soja: [1, 1, 1],
    laranja: [0.9, 1, 1.2], cafe: [0.6, 1, 1.6], ovos: [1.1, 1, 1], leite: [1.1, 1, 0.9], suino: [1.1, 1, 0.9],
    mel: [0.5, 1, 1.7], farinha: [1.2, 1, 0.8], queijo: [0.6, 1, 1.6],
  };

  /* País: regiões. dist = km até a fazenda (Sudeste). bias = diferença de preço regional por produto.
     poly = mapa estilizado (viewBox 0 0 500 500). */
  FG.REGIONS = {
    norte:   { name: 'Norte',        dist: 2800, poly: '50,140 90,80 170,50 270,40 340,80 325,170 260,205 200,245 120,235 70,195', label: [190, 140], bias: { trigo: 1.2, milho: 1.05, suino: 1.08, leite: 1.1 } },
    nordeste:{ name: 'Nordeste',     dist: 2000, poly: '340,80 410,105 475,160 465,235 410,272 352,282 322,232 325,170', label: [400, 190], bias: { trigo: 1.18, milho: 1.12, soja: 0.98, leite: 1.08, cafe: 1.04 } },
    centro:  { name: 'Centro-Oeste', dist: 1000, poly: '200,245 260,205 325,170 322,232 352,282 332,330 270,352 205,320', label: [270, 270], bias: { soja: 0.9, milho: 0.88, suino: 0.95, trigo: 1.08 } },
    sudeste: { name: 'Sudeste',      dist: 0,    poly: '332,330 352,282 410,272 425,330 385,382 312,388 270,352', label: [350, 335], bias: {}, home: true },
    sul:     { name: 'Sul',          dist: 800,  poly: '270,352 312,388 335,402 305,462 252,474 238,412', label: [285, 425], bias: { trigo: 0.92, suino: 0.92, soja: 0.97, leite: 0.95 } },
  };
  // Compradores nacionais (pedidos de grande volume, exigem nível 3+)
  FG.NATIONAL_BUYERS = {
    distNE:  { name: 'Distribuidora Nordeste', emoji: '🚛', region: 'nordeste', buys: ['milho', 'trigo', 'farinha', 'leite', 'queijo', 'cafe'], vol: 6, pf: 1.02, tough: 0.6, pay: 30 },
    agroCO:  { name: 'Agroindústria Cerrado', emoji: '🏭', region: 'centro', buys: ['milho', 'soja', 'suino'], vol: 7, pf: 0.98, tough: 0.65, pay: 30 },
    redeSul: { name: 'Rede Supermercados Sul', emoji: '🛒', region: 'sul', buys: ['cafe', 'laranja', 'queijo', 'mel', 'batata'], vol: 4, pf: 1.0, tough: 0.55, pay: 30 },
    norteAl: { name: 'Norte Alimentos', emoji: '📦', region: 'norte', buys: ['trigo', 'farinha', 'milho', 'suino', 'leite', 'queijo'], vol: 4, pf: 1.06, tough: 0.5, pay: 30 },
  };

  /* Mundo: blocos econômicos. role: +1 grande exportador (pressiona preço para baixo),
     -1 grande importador (sustenta preço). poly = mapa estilizado (viewBox 0 0 1000 500). */
  FG.BLOCS = {
    eua:      { name: 'EUA',              flag: '🇺🇸', poly: '70,90 170,60 290,70 310,130 270,190 190,215 120,180 80,140', label: [190, 140], role: { soja: 1, milho: 1, trigo: 1, suino: 1 } },
    brasil:   { name: 'Brasil (você)',    flag: '🇧🇷', poly: '255,250 340,250 370,300 335,370 290,372 258,315', label: [312, 305], role: { soja: 1, cafe: 1, laranja: 1, milho: 1, suino: 0.5 }, home: true },
    argentina:{ name: 'Argentina',        flag: '🇦🇷', poly: '258,315 290,372 330,372 302,430 278,470 258,420 250,350', label: [285, 400], role: { soja: 0.7, milho: 0.7, trigo: 0.8 } },
    ue:       { name: 'União Europeia',   flag: '🇪🇺', poly: '445,95 545,80 565,130 525,165 462,155', label: [505, 125], role: { cafe: -1, soja: -0.6, laranja: -0.8, trigo: 0.5, suino: 0.5 } },
    russia:   { name: 'Rússia/Ucrânia',   flag: '🌍', poly: '565,50 850,40 905,100 720,125 565,125', label: [720, 85], role: { trigo: 1, milho: 0.6 } },
    oriente:  { name: 'Oriente Médio',    flag: '🕌', poly: '565,165 640,160 662,222 605,245 560,212', label: [605, 205], role: { trigo: -0.8, milho: -0.6, suino: 0 , soja: -0.3 } },
    africa:   { name: 'África',           flag: '🌍', poly: '455,195 560,195 602,262 562,382 512,402 482,302 440,252', label: [515, 285], role: { trigo: -0.7, milho: -0.3 } },
    india:    { name: 'Índia',            flag: '🇮🇳', poly: '662,182 722,182 718,252 692,282 666,232', label: [692, 220], role: { soja: -0.3, cafe: 0.3, trigo: 0.2 } },
    china:    { name: 'China',            flag: '🇨🇳', poly: '725,128 842,115 862,182 792,222 724,192', label: [790, 165], role: { soja: -1.5, milho: -0.6, suino: -1, laranja: -0.3 } },
    oceania:  { name: 'Austrália',        flag: '🇦🇺', poly: '802,322 902,312 912,382 832,392', label: [857, 355], role: { trigo: 0.8 } },
  };
  FG.TRADED = ['soja', 'milho', 'trigo', 'cafe', 'laranja', 'suino'];

  // Níveis por receita acumulada (R$ mil)
  FG.LEVELS = [0, 40, 120, 300, 600, 1100, 2000, 3500, 6000, 10000];
  FG.LEVEL_UNLOCKS = {
    1: 'Alface, milho, tomate, galinheiro, silo',
    2: 'Batata, vacas, abelhas, câmara fria, poço, indústrias da cidade',
    3: 'Soja, trigo, porcos, moinho, caminhão, pedidos de outras regiões do país',
    4: 'Laranja, estufa, laticínio',
    5: 'Café, carreta, licença de exportação',
  };
  FG.EXPORT_LICENSE = { cost: 25000, level: 5, portDist: 120, portFee: 0.035 };

  // Custos gerais
  FG.COSTS = {
    worker: 2100,        // salário + encargos por funcionário/mês
    workerLabor: 4,      // lotes de mão de obra por funcionário
    ownerLabor: 3,       // mão de obra do próprio agricultor
    living: 1800,        // pró-labore / custo de vida do agricultor (mês)
    utilities: 350,      // energia, água, internet (mês)
    landTax: 25,         // imposto territorial por lote (mês)
    baseStorage: 25000,  // galpão inicial (kg)
    salesTax: 0.045,     // impostos sobre venda (Funrural + contribuições)
    landBase: 9000,      // preço de um lote novo
    landGrowth: 1.07,    // cada lote comprado encarece o próximo
    overdraftDaily: 0.0027, // juros do cheque especial (~8,4% a.m.)
    hireCost: 600,       // custo de contratação/treinamento
    fireCost: 2100,      // rescisão
  };
  FG.GRID = 8;           // mapa da fazenda 8x8 lotes
  FG.START_TILES = [[3, 3], [3, 4], [3, 5], [4, 3], [4, 4], [4, 5], [5, 3], [5, 4], [5, 5]];

  /* Eventos aleatórios. scope: farm | city | national | global.
     chance = probabilidade diária base; cond(state) opcional. Efeitos aplicados no motor. */
  FG.EVENTS = [
    { id: 'seca', scope: 'farm', chance: 0.006, title: 'Seca prolongada', icon: '🌵', text: 'Semanas sem chuva. Lavouras sem irrigação perdem produtividade.', days: 20 },
    { id: 'granizo', scope: 'farm', chance: 0.004, title: 'Chuva de granizo', icon: '🌨️', text: 'Granizo danificou lavouras em campo aberto.' },
    { id: 'praga', scope: 'farm', chance: 0.006, title: 'Ataque de pragas', icon: '🐛', text: 'Lagartas atacaram uma lavoura. Gaste com defensivo ou aceite a perda.' },
    { id: 'geada', scope: 'farm', chance: 0.02, season: 2, title: 'Geada', icon: '🥶', text: 'Geada forte atingiu as plantações sensíveis.' },
    { id: 'raposa', scope: 'farm', chance: 0.004, needs: 'galinha', title: 'Raposa no galinheiro', icon: '🦊', text: 'Uma raposa atacou as galinhas.' },
    { id: 'veterinario', scope: 'farm', chance: 0.004, needs: 'vaca', title: 'Vaca doente', icon: '💉', text: 'Visita do veterinário e medicamentos.' },
    { id: 'quebra', scope: 'farm', chance: 0.004, title: 'Picape quebrou', icon: '🔧', text: 'Conserto mecânico necessário.' },
    { id: 'festival', scope: 'city', chance: 0.006, title: 'Festival gastronômico na cidade', icon: '🎪', text: 'Restaurantes e empórios aumentam os pedidos por 10 dias.', days: 10 },
    { id: 'greve', scope: 'national', chance: 0.003, title: 'Greve dos caminhoneiros', icon: '🚧', text: 'Fretes 60% mais caros por 10 dias.', days: 10 },
    { id: 'diesel', scope: 'national', chance: 0.005, title: 'Reajuste do diesel', icon: '⛽', text: 'A estatal reajustou o preço do diesel.' },
    { id: 'selicUp', scope: 'national', chance: 0.004, title: 'Banco Central sobe juros', icon: '🏦', text: 'Selic sobe 1 ponto. Empréstimos novos ficam mais caros.' },
    { id: 'selicDown', scope: 'national', chance: 0.004, title: 'Banco Central corta juros', icon: '🏦', text: 'Selic cai 1 ponto.' },
    { id: 'dolarUp', scope: 'national', chance: 0.005, title: 'Dólar dispara', icon: '💵', text: 'Real se desvaloriza: exportações mais rentáveis, insumos mais caros.' },
    { id: 'dolarDown', scope: 'national', chance: 0.005, title: 'Real se valoriza', icon: '💵', text: 'Dólar cai: insumos mais baratos, exportação menos rentável.' },
    { id: 'secaEUA', scope: 'global', chance: 0.003, title: 'Seca no meio-oeste dos EUA', icon: '🇺🇸', text: 'Quebra de safra americana: soja e milho sobem no mundo.', target: { soja: 1.18, milho: 1.2 }, days: 45 },
    { id: 'chinaCompra', scope: 'global', chance: 0.003, title: 'China amplia importações', icon: '🇨🇳', text: 'Compras chinesas recordes de soja e carne suína.', target: { soja: 1.15, suino: 1.15 }, days: 40 },
    { id: 'guerraTrigo', scope: 'global', chance: 0.002, title: 'Conflito no Mar Negro', icon: '⚔️', text: 'Exportações de trigo da Rússia/Ucrânia travadas.', target: { trigo: 1.3, milho: 1.1 }, days: 60 },
    { id: 'geadaCafe', scope: 'global', chance: 0.003, title: 'Geada nos cafezais', icon: '☕', text: 'Oferta mundial de café cai.', target: { cafe: 1.3 }, days: 60 },
    { id: 'supersafra', scope: 'global', chance: 0.004, title: 'Supersafra mundial de grãos', icon: '📉', text: 'Colheitas recordes derrubam preços de grãos.', target: { soja: 0.86, milho: 0.84, trigo: 0.88 }, days: 50 },
    { id: 'pesteSuina', scope: 'global', chance: 0.002, title: 'Peste suína na Ásia', icon: '🐷', text: 'Rebanhos asiáticos reduzidos: carne suína dispara.', target: { suino: 1.25 }, days: 50 },
    { id: 'recessao', scope: 'global', chance: 0.002, title: 'Recessão global', icon: '📉', text: 'Demanda mundial desacelera: commodities em queda.', target: { soja: 0.9, milho: 0.92, cafe: 0.85, suino: 0.9, laranja: 0.9 }, days: 60 },
    { id: 'citrus', scope: 'global', chance: 0.003, title: 'Greening na Flórida', icon: '🍊', text: 'Doença nos pomares americanos: suco de laranja sobe.', target: { laranja: 1.25 }, days: 50 },
  ];

  FG.GOALS = [
    { id: 'firstSale', text: 'Faça sua primeira venda negociada', check: s => s.stats.deals >= 1 },
    { id: 'firstAnimal', text: 'Compre seus primeiros animais', check: s => Object.values(s.animals).some(n => n > 0) },
    { id: 'worker', text: 'Contrate um funcionário', check: s => s.workers >= 1 },
    { id: 'contract', text: 'Feche um contrato de fornecimento recorrente', check: s => s.stats.contracts >= 1 },
    { id: 'land15', text: 'Amplie a fazenda para 15 lotes', check: s => s.tiles.filter(t => t.owned).length >= 15 },
    { id: 'level3', text: 'Chegue ao nível 3', check: s => s.level >= 3 },
    { id: 'profit', text: 'Feche um mês com lucro acima de R$ 20 mil', check: s => s.history.months.some(m => m.result >= 20000) },
    { id: 'land30', text: 'Amplie a fazenda para 30 lotes', check: s => s.tiles.filter(t => t.owned).length >= 30 },
    { id: 'export', text: 'Exporte para outro país', check: s => s.stats.exports >= 1 },
    { id: 'million', text: 'Atinja patrimônio líquido de R$ 1 milhão', check: s => s.netWorthCache >= 1e6 },
    { id: 'empire', text: 'Império agrícola: patrimônio de R$ 5 milhões', check: s => s.netWorthCache >= 5e6 },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
