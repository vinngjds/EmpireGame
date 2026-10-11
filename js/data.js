'use strict';
// Dados do jogo: eras, unidades, construções, tecnologias, civilizações ------

const RESOURCES = ['food', 'wood', 'gold', 'stone'];
const RES_NAME = { food: 'Comida', wood: 'Madeira', gold: 'Ouro', stone: 'Pedra' };
const RES_ICON = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
const RES_COLOR = { food: '#d8553b', wood: '#8a5a2b', gold: '#f0c63c', stone: '#9a9fa8' };

const AGES = [
  { name: 'Idade das Trevas', short: 'Trevas', icon: '🌑' },
  { name: 'Idade Feudal', short: 'Feudal', icon: '🏘️' },
  { name: 'Idade dos Castelos', short: 'Castelos', icon: '🏰' },
  { name: 'Idade Imperial', short: 'Imperial', icon: '👑' },
];

// Requisitos de construções para avançar de era (n tipos distintos da lista)
const AGE_REQ = {
  1: { from: ['house', 'mill', 'lumbercamp', 'miningcamp', 'barracks', 'farm'], n: 2 },
  2: { from: ['archeryrange', 'stable', 'blacksmith', 'market', 'tower'], n: 2 },
  3: { from: ['castle', 'siegeworkshop'], n: 1 },
};

const PLAYER_COLORS = [
  { name: 'Azul', c: '#3b7cf0' }, { name: 'Vermelho', c: '#e2433f' },
  { name: 'Verde', c: '#35b44f' }, { name: 'Amarelo', c: '#ecc92e' },
  { name: 'Ciano', c: '#27c6c9' }, { name: 'Roxo', c: '#a35ad8' },
  { name: 'Laranja', c: '#f08a1f' }, { name: 'Cinza', c: '#a8abb3' },
];

// ---------------------------------------------------------------------------
// Unidades. armor = [corpo a corpo, perfurante]. bonus = dano extra por classe.
// tiers = melhorias (pesquisas) que alteram os atributos de forma cumulativa.
// ---------------------------------------------------------------------------
const UNITS = {
  villager: { name: 'Aldeão', icon: '👷', cls: ['villager'], cost: { food: 50 }, time: 25, hp: 25, atk: 3, armor: [0, 0], range: 0, speed: 0.8, los: 4, reload: 2, bld: 'towncenter', age: 0,
    desc: 'Coleta recursos, constrói e repara edifícios.' },
  militia: { name: 'Milícia', icon: '🗡️', cls: ['infantry', 'melee'], cost: { food: 60, gold: 20 }, time: 21, hp: 40, atk: 4, armor: [0, 1], range: 0, speed: 0.9, los: 4, reload: 2, bld: 'barracks', age: 0,
    tiers: [{ tech: 'manatarms', name: 'Homem de Armas', hp: 45, atk: 6 }, { tech: 'longsword', name: 'Espadachim', hp: 60, atk: 9 }, { tech: 'twohanded', name: 'Espadachim de Duas Mãos', atk: 11, armor: [1, 1] }],
    desc: 'Infantaria básica. Boa contra arqueiros e prédios.' },
  spearman: { name: 'Lanceiro', icon: '🔱', cls: ['infantry', 'spear', 'melee'], cost: { food: 35, wood: 25 }, time: 22, hp: 45, atk: 3, bonus: { cavalry: 15 }, armor: [0, 0], range: 0, speed: 1.0, los: 4, reload: 3, bld: 'barracks', age: 1,
    tiers: [{ tech: 'pikeman', name: 'Piqueiro', hp: 55, atk: 4, bonus: { cavalry: 22 } }],
    desc: 'Barato e excelente contra cavalaria.' },
  archer: { name: 'Arqueiro', icon: '🏹', cls: ['archer', 'ranged'], cost: { wood: 25, gold: 45 }, time: 35, hp: 30, atk: 4, armor: [0, 0], range: 4, speed: 0.96, los: 6, reload: 2, bld: 'archeryrange', age: 1, proj: 'arrow',
    tiers: [{ tech: 'crossbow', name: 'Besteiro', hp: 35, atk: 5, range: 5 }],
    desc: 'Ataca de longe. Forte contra infantaria, fraco contra cavalaria.' },
  skirmisher: { name: 'Escaramuçador', icon: '🎯', cls: ['archer', 'ranged', 'skirm'], cost: { food: 25, wood: 35 }, time: 22, hp: 30, atk: 2, bonus: { archer: 3 }, armor: [0, 3], range: 4, speed: 0.96, los: 6, reload: 3, bld: 'archeryrange', age: 1, proj: 'dart',
    desc: 'Lança dardos. Especializado contra arqueiros.' },
  scout: { name: 'Cavalaria Exploradora', icon: '🐎', cls: ['cavalry', 'melee'], cost: { food: 80 }, time: 30, hp: 45, atk: 3, armor: [0, 2], range: 0, speed: 1.55, los: 8, reload: 2, bld: 'stable', age: 1,
    tiers: [{ tech: 'lightcav', name: 'Cavalaria Leve', hp: 60, atk: 7 }],
    desc: 'Rápida. Ótima para explorar e caçar.' },
  knight: { name: 'Cavaleiro', icon: '🐴', cls: ['cavalry', 'melee'], cost: { food: 60, gold: 75 }, time: 30, hp: 100, atk: 10, armor: [2, 2], range: 0, speed: 1.35, los: 4, reload: 1.8, bld: 'stable', age: 2,
    tiers: [{ tech: 'cavalier', name: 'Cavaleiro Pesado', hp: 120, atk: 12 }],
    desc: 'Cavalaria pesada. Destrói arqueiros, vulnerável a lanceiros.' },
  ram: { name: 'Aríete', icon: '🪵', cls: ['siege', 'melee'], cost: { wood: 160, gold: 75 }, time: 36, hp: 175, atk: 3, bonus: { building: 125 }, armor: [-3, 190], range: 0, speed: 0.5, los: 3, reload: 5, bld: 'siegeworkshop', age: 2,
    desc: 'Destrói edifícios. Imune a flechas, vulnerável a corpo a corpo.' },
  mangonel: { name: 'Mangonel', icon: '☄️', cls: ['siege', 'ranged'], cost: { wood: 160, gold: 135 }, time: 46, hp: 50, atk: 40, armor: [0, 6], range: 7, speed: 0.6, los: 7, reload: 6, bld: 'siegeworkshop', age: 2, proj: 'stone', splash: 1.4,
    desc: 'Arremessa pedras com dano em área.' },
  king: { name: 'Rei', icon: '🤴', cls: ['king'], cost: {}, time: 0, hp: 150, atk: 0, armor: [0, 0], range: 0, speed: 1.1, los: 6, reload: 2, bld: null, age: 0, noTrain: true,
    desc: 'Proteja-o! No modo Regicida, perder o rei significa a derrota.' },
  // Unidades únicas (Castelo) -------------------------------------------------
  longbowman: { name: 'Arqueiro Inglês', icon: '🏹', cls: ['archer', 'ranged', 'unique'], cost: { food: 35, wood: 40 }, time: 18, hp: 35, atk: 6, armor: [0, 0], range: 6, speed: 0.96, los: 8, reload: 2, bld: 'castle', age: 2, proj: 'arrow', desc: 'Arco longo de grande alcance.' },
  throwaxe: { name: 'Lançador de Machados', icon: '🪓', cls: ['infantry', 'ranged', 'unique'], cost: { food: 55, gold: 25 }, time: 17, hp: 50, atk: 7, armor: [0, 0], range: 4, speed: 1.0, los: 6, reload: 2, bld: 'castle', age: 2, proj: 'axe', desc: 'Infantaria que arremessa machados.' },
  mangudai: { name: 'Mangudai', icon: '🏇', cls: ['cavalry', 'ranged', 'unique'], cost: { wood: 55, gold: 65 }, time: 26, hp: 60, atk: 6, bonus: { siege: 8 }, armor: [0, 0], range: 4, speed: 1.4, los: 6, reload: 1.6, bld: 'castle', age: 2, proj: 'arrow', desc: 'Arqueiro montado veloz.' },
  chukonu: { name: 'Chu Ko Nu', icon: '🏹', cls: ['archer', 'ranged', 'unique'], cost: { wood: 40, gold: 45 }, time: 16, hp: 45, atk: 8, armor: [0, 0], range: 4, speed: 0.96, los: 6, reload: 1.1, bld: 'castle', age: 2, proj: 'arrow', desc: 'Besta de repetição de disparo rápido.' },
  huskarl: { name: 'Huskarl', icon: '🛡️', cls: ['infantry', 'melee', 'unique'], cost: { food: 52, gold: 36 }, time: 16, hp: 60, atk: 6, bonus: { archer: 6 }, armor: [0, 6], range: 0, speed: 1.05, los: 4, reload: 2, bld: 'castle', age: 2, desc: 'Guerreiro quase imune a flechas.' },
  elephant: { name: 'Elefante de Guerra', icon: '🐘', cls: ['cavalry', 'melee', 'unique'], cost: { food: 100, gold: 70 }, time: 25, hp: 450, atk: 15, armor: [1, 3], range: 0, speed: 0.9, los: 4, reload: 2, bld: 'castle', age: 2, scale: 1.7, desc: 'Gigante blindado. Lento e resistente.' },
  janissary: { name: 'Janízaro', icon: '💥', cls: ['infantry', 'ranged', 'unique'], cost: { food: 60, gold: 55 }, time: 21, hp: 35, atk: 17, armor: [0, 0], range: 8, speed: 0.96, los: 8, reload: 3.5, bld: 'castle', age: 2, proj: 'bullet', desc: 'Atirador de pólvora de longo alcance.' },
  samurai: { name: 'Samurai', icon: '⚔️', cls: ['infantry', 'melee', 'unique'], cost: { food: 60, gold: 30 }, time: 12, hp: 60, atk: 8, bonus: { unique: 10 }, armor: [1, 1], range: 0, speed: 1.0, los: 4, reload: 1.4, bld: 'castle', age: 2, desc: 'Espadachim de ataque muito rápido.' },
};
for (const id in UNITS) { UNITS[id].id = id; if (!UNITS[id].bonus) UNITS[id].bonus = {}; }

// ---------------------------------------------------------------------------
// Construções
// ---------------------------------------------------------------------------
const BUILDINGS = {
  towncenter: { name: 'Centro da Cidade', icon: '🏛️', size: 4, cost: { wood: 275, stone: 100 }, hp: 2400, time: 150, age: 1, los: 9, pop: 5, drop: ['food', 'wood', 'gold', 'stone'], atk: { dmg: 5, range: 7, reload: 2, proj: 'arrow' }, armor: [3, 5],
    units: ['villager'], desc: 'Centro de sua cidade: treina aldeões, pesquisa eras e recebe recursos.' },
  house: { name: 'Casa', icon: '🏠', size: 2, cost: { wood: 25 }, hp: 550, time: 25, age: 0, los: 4, pop: 5, armor: [1, 6], desc: 'Aumenta o limite de população em 5.' },
  mill: { name: 'Moinho', icon: '🌾', size: 2, cost: { wood: 100 }, hp: 600, time: 35, age: 0, los: 5, drop: ['food'], armor: [1, 6], desc: 'Ponto de entrega de comida; pesquisa melhorias de fazendas.' },
  lumbercamp: { name: 'Serraria', icon: '🪓', size: 2, cost: { wood: 100 }, hp: 600, time: 35, age: 0, los: 5, drop: ['wood'], armor: [1, 6], desc: 'Ponto de entrega de madeira; pesquisa melhorias de corte.' },
  miningcamp: { name: 'Acampamento de Mineração', icon: '⛏️', size: 2, cost: { wood: 100 }, hp: 600, time: 35, age: 0, los: 5, drop: ['gold', 'stone'], armor: [1, 6], desc: 'Ponto de entrega de ouro e pedra.' },
  farm: { name: 'Fazenda', icon: '🌽', size: 3, cost: { wood: 60 }, hp: 480, time: 15, age: 0, los: 3, passable: true, armor: [0, 0], desc: 'Fonte de comida renovável (replantio automático por 60 de madeira).' },
  barracks: { name: 'Quartel', icon: '🏯', size: 3, cost: { wood: 175 }, hp: 1200, time: 50, age: 0, los: 6, armor: [2, 8], units: ['militia', 'spearman'], desc: 'Treina infantaria.' },
  archeryrange: { name: 'Campo de Arquearia', icon: '🎯', size: 3, cost: { wood: 175 }, hp: 1200, time: 50, age: 1, los: 6, armor: [2, 8], units: ['archer', 'skirmisher'], desc: 'Treina arqueiros e escaramuçadores.' },
  stable: { name: 'Estábulo', icon: '🐎', size: 3, cost: { wood: 175 }, hp: 1200, time: 50, age: 1, los: 6, armor: [2, 8], units: ['scout', 'knight'], desc: 'Treina cavalaria.' },
  blacksmith: { name: 'Ferraria', icon: '🔨', size: 3, cost: { wood: 150 }, hp: 1200, time: 40, age: 1, los: 6, armor: [2, 8], desc: 'Melhora ataque e armadura das tropas.' },
  market: { name: 'Mercado', icon: '⚖️', size: 3, cost: { wood: 175 }, hp: 1800, time: 60, age: 1, los: 6, armor: [2, 8], market: true, desc: 'Compre e venda recursos.' },
  siegeworkshop: { name: 'Oficina de Cerco', icon: '🛠️', size: 3, cost: { wood: 200 }, hp: 1500, time: 60, age: 2, los: 6, armor: [2, 8], units: ['ram', 'mangonel'], desc: 'Constrói máquinas de cerco.' },
  tower: { name: 'Torre de Vigia', icon: '🗼', size: 2, cost: { wood: 25, stone: 100 }, hp: 1020, time: 80, age: 1, los: 9, armor: [4, 8], atk: { dmg: 5, range: 8, reload: 2, proj: 'arrow' }, desc: 'Defesa que dispara flechas contra inimigos.' },
  castle: { name: 'Castelo', icon: '🏰', size: 4, cost: { stone: 650 }, hp: 4800, time: 200, age: 2, los: 11, pop: 20, armor: [8, 9], atk: { dmg: 12, range: 9, reload: 2, proj: 'arrow' }, units: ['_unique'], desc: 'Fortaleza: treina a unidade única da sua civilização.' },
};
for (const id in BUILDINGS) { BUILDINGS[id].id = id; }

// ---------------------------------------------------------------------------
// Tecnologias. effects: ver Game.applyEffects
// ---------------------------------------------------------------------------
const TECHS = {};
function T(id, o) { o.id = id; o.age = o.age || 0; TECHS[id] = o; }
const cls = (c, stat, add) => ({ t: 'cls', cls: c, stat, add });
const clsMul = (c, stat, mul) => ({ t: 'cls', cls: c, stat, mul });

// Eras
T('age1', { name: 'Avançar para a Idade Feudal', icon: '🏘️', cost: { food: 500 }, time: 130, bld: 'towncenter', ageUp: 1, desc: 'Libera novas construções e unidades. Requer 2 tipos de construção da Idade das Trevas.' });
T('age2', { name: 'Avançar para a Idade dos Castelos', icon: '🏰', cost: { food: 800, gold: 200 }, time: 160, bld: 'towncenter', ageUp: 2, age: 1, desc: 'Libera castelos, cavalaria pesada e cerco. Requer 2 construções militares/comerciais da Era Feudal.' });
T('age3', { name: 'Avançar para a Idade Imperial', icon: '👑', cost: { food: 1000, gold: 800 }, time: 190, bld: 'towncenter', ageUp: 3, age: 2, desc: 'Melhorias finais. Requer um Castelo ou Oficina de Cerco.' });
// Centro da Cidade
T('loom', { name: 'Tear', icon: '🧵', cost: { gold: 50 }, time: 25, bld: 'towncenter', desc: 'Aldeões: +15 PV, +1/+2 armadura.', effects: [cls('villager', 'hp', 15), cls('villager', 'armorM', 1), cls('villager', 'armorP', 2)] });
T('wheelbarrow', { name: 'Carrinho de Mão', icon: '🛒', cost: { food: 175, wood: 50 }, time: 75, bld: 'towncenter', age: 1, desc: 'Aldeões: +10% velocidade, +3 de carga.', effects: [clsMul('villager', 'speed', 1.1), { t: 'carry', add: 3 }] });
T('handcart', { name: 'Carroça', icon: '🛻', cost: { food: 300, wood: 200 }, time: 90, bld: 'towncenter', age: 2, req: ['wheelbarrow'], desc: 'Aldeões: +10% velocidade, +7 de carga.', effects: [clsMul('villager', 'speed', 1.1), { t: 'carry', add: 7 }] });
T('townwatch', { name: 'Vigilância', icon: '👁️', cost: { food: 75 }, time: 25, bld: 'towncenter', age: 1, desc: 'Edifícios e unidades: +4 de visão.', effects: [{ t: 'bldlos', add: 4 }] });
// Serraria
T('doublebit', { name: 'Machado de Dois Gumes', icon: '🪓', cost: { food: 100, wood: 50 }, time: 25, bld: 'lumbercamp', desc: 'Lenhadores trabalham 20% mais rápido.', effects: [{ t: 'gather', k: 'wood', mul: 1.2 }] });
T('bowsaw', { name: 'Serra de Arco', icon: '🪚', cost: { food: 150, wood: 100 }, time: 50, bld: 'lumbercamp', age: 1, req: ['doublebit'], desc: 'Lenhadores trabalham 20% mais rápido.', effects: [{ t: 'gather', k: 'wood', mul: 1.2 }] });
T('twomansaw', { name: 'Serra de Dois Homens', icon: '🪚', cost: { food: 300, wood: 200 }, time: 100, bld: 'lumbercamp', age: 2, req: ['bowsaw'], desc: 'Lenhadores trabalham 20% mais rápido.', effects: [{ t: 'gather', k: 'wood', mul: 1.2 }] });
// Mineração
T('goldmining', { name: 'Mineração de Ouro', icon: '⛏️', cost: { food: 100, wood: 75 }, time: 30, bld: 'miningcamp', age: 1, desc: 'Mineradores de ouro +15%.', effects: [{ t: 'gather', k: 'gold', mul: 1.15 }] });
T('goldshaft', { name: 'Poço de Ouro', icon: '⛏️', cost: { food: 200, wood: 150 }, time: 75, bld: 'miningcamp', age: 2, req: ['goldmining'], desc: 'Mineradores de ouro +15%.', effects: [{ t: 'gather', k: 'gold', mul: 1.15 }] });
T('stonemining', { name: 'Mineração de Pedra', icon: '🪨', cost: { food: 100, wood: 75 }, time: 30, bld: 'miningcamp', age: 1, desc: 'Mineradores de pedra +15%.', effects: [{ t: 'gather', k: 'stone', mul: 1.15 }] });
T('stoneshaft', { name: 'Poço de Pedra', icon: '🪨', cost: { food: 200, wood: 150 }, time: 75, bld: 'miningcamp', age: 2, req: ['stonemining'], desc: 'Mineradores de pedra +15%.', effects: [{ t: 'gather', k: 'stone', mul: 1.15 }] });
// Moinho
T('horsecollar', { name: 'Coleira de Cavalo', icon: '🐴', cost: { food: 75, wood: 75 }, time: 20, bld: 'mill', age: 1, desc: 'Fazendas +20% de comida.', effects: [{ t: 'gather', k: 'farm', mul: 1.2 }] });
T('heavyplow', { name: 'Arado Pesado', icon: '🚜', cost: { food: 125, wood: 125 }, time: 40, bld: 'mill', age: 2, req: ['horsecollar'], desc: 'Fazendas +20% de comida.', effects: [{ t: 'gather', k: 'farm', mul: 1.2 }] });
T('croprotation', { name: 'Rotação de Culturas', icon: '🌱', cost: { food: 250, wood: 250 }, time: 70, bld: 'mill', age: 3, req: ['heavyplow'], desc: 'Fazendas +20% de comida.', effects: [{ t: 'gather', k: 'farm', mul: 1.2 }] });
// Quartel / Arquearia / Estábulo (melhorias de unidades)
T('manatarms', { name: 'Homem de Armas', icon: '🗡️', cost: { food: 100, gold: 40 }, time: 40, bld: 'barracks', age: 1, desc: 'Milícia evolui: +5 PV, +2 ataque.', effects: [] });
T('longsword', { name: 'Espadachim', icon: '⚔️', cost: { food: 150, gold: 65 }, time: 50, bld: 'barracks', age: 2, req: ['manatarms'], desc: 'Infantaria evolui: PV 60, ataque 9.', effects: [] });
T('twohanded', { name: 'Espadachim de Duas Mãos', icon: '⚔️', cost: { food: 300, gold: 100 }, time: 75, bld: 'barracks', age: 3, req: ['longsword'], desc: 'Infantaria evolui: ataque 11, +1/+1 armadura.', effects: [] });
T('pikeman', { name: 'Piqueiro', icon: '🔱', cost: { food: 215, wood: 90 }, time: 45, bld: 'barracks', age: 2, desc: 'Lanceiros evoluem: +10 PV e bônus contra cavalaria.', effects: [] });
T('crossbow', { name: 'Besteiro', icon: '🏹', cost: { food: 125, gold: 75 }, time: 35, bld: 'archeryrange', age: 2, desc: 'Arqueiros evoluem: +1 ataque, +1 alcance.', effects: [] });
T('lightcav', { name: 'Cavalaria Leve', icon: '🐎', cost: { food: 150, gold: 50 }, time: 45, bld: 'stable', age: 2, desc: 'Exploradores evoluem: PV 60, ataque 7.', effects: [] });
T('cavalier', { name: 'Cavaleiro Pesado', icon: '🐴', cost: { food: 300, gold: 300 }, time: 100, bld: 'stable', age: 3, desc: 'Cavaleiros evoluem: PV 120, ataque 12.', effects: [] });
T('bloodlines', { name: 'Linhagem', icon: '🧬', cost: { food: 150, gold: 100 }, time: 50, bld: 'stable', age: 1, desc: 'Cavalaria +20 PV.', effects: [cls('cavalry', 'hp', 20)] });
// Ferraria
T('forging', { name: 'Forja', icon: '🔥', cost: { food: 150 }, time: 50, bld: 'blacksmith', age: 1, desc: 'Infantaria e cavalaria: +1 ataque.', effects: [cls('infantry', 'atk', 1), cls('cavalry', 'atk', 1)] });
T('ironcasting', { name: 'Fundição de Ferro', icon: '🔥', cost: { food: 220, gold: 120 }, time: 75, bld: 'blacksmith', age: 2, req: ['forging'], desc: 'Infantaria e cavalaria: +1 ataque.', effects: [cls('infantry', 'atk', 1), cls('cavalry', 'atk', 1)] });
T('blastfurnace', { name: 'Alto-Forno', icon: '🔥', cost: { food: 275, gold: 225 }, time: 100, bld: 'blacksmith', age: 3, req: ['ironcasting'], desc: 'Infantaria e cavalaria: +2 ataque.', effects: [cls('infantry', 'atk', 2), cls('cavalry', 'atk', 2)] });
T('fletching', { name: 'Penas de Flecha', icon: '🪶', cost: { food: 100, gold: 50 }, time: 40, bld: 'blacksmith', age: 1, desc: 'Atiradores e torres: +1 ataque.', effects: [cls('ranged', 'atk', 1), { t: 'bldatk', add: 1 }] });
T('bodkin', { name: 'Ponta Bodkin', icon: '🪶', cost: { food: 200, gold: 100 }, time: 60, bld: 'blacksmith', age: 2, req: ['fletching'], desc: 'Atiradores e torres: +1 ataque, +1 alcance.', effects: [cls('ranged', 'atk', 1), cls('ranged', 'range', 1), { t: 'bldatk', add: 1 }] });
T('bracer', { name: 'Braçal', icon: '🪶', cost: { food: 300, gold: 200 }, time: 80, bld: 'blacksmith', age: 3, req: ['bodkin'], desc: 'Atiradores e torres: +1 ataque, +1 alcance.', effects: [cls('ranged', 'atk', 1), cls('ranged', 'range', 1), { t: 'bldatk', add: 1 }] });
T('scalemail', { name: 'Cota de Escamas', icon: '🛡️', cost: { food: 100 }, time: 40, bld: 'blacksmith', age: 1, desc: 'Infantaria: +1/+1 armadura.', effects: [cls('infantry', 'armorM', 1), cls('infantry', 'armorP', 1)] });
T('chainmail', { name: 'Cota de Malha', icon: '🛡️', cost: { food: 200, gold: 100 }, time: 55, bld: 'blacksmith', age: 2, req: ['scalemail'], desc: 'Infantaria: +1/+1 armadura.', effects: [cls('infantry', 'armorM', 1), cls('infantry', 'armorP', 1)] });
T('platemail', { name: 'Armadura de Placas', icon: '🛡️', cost: { food: 300, gold: 150 }, time: 70, bld: 'blacksmith', age: 3, req: ['chainmail'], desc: 'Infantaria: +1/+2 armadura.', effects: [cls('infantry', 'armorM', 1), cls('infantry', 'armorP', 2)] });
T('paddedarcher', { name: 'Armadura Acolchoada', icon: '🧥', cost: { food: 100 }, time: 40, bld: 'blacksmith', age: 1, desc: 'Arqueiros: +1/+1 armadura.', effects: [cls('archer', 'armorM', 1), cls('archer', 'armorP', 1)] });
T('leatherarcher', { name: 'Armadura de Couro', icon: '🧥', cost: { food: 200, gold: 100 }, time: 55, bld: 'blacksmith', age: 2, req: ['paddedarcher'], desc: 'Arqueiros: +1/+1 armadura.', effects: [cls('archer', 'armorM', 1), cls('archer', 'armorP', 1)] });
T('ringarcher', { name: 'Armadura de Anéis', icon: '🧥', cost: { food: 250, gold: 250 }, time: 70, bld: 'blacksmith', age: 3, req: ['leatherarcher'], desc: 'Arqueiros: +1/+2 armadura.', effects: [cls('archer', 'armorM', 1), cls('archer', 'armorP', 2)] });
T('scalebarding', { name: 'Barda de Escamas', icon: '🐴', cost: { food: 150 }, time: 40, bld: 'blacksmith', age: 1, desc: 'Cavalaria: +1/+1 armadura.', effects: [cls('cavalry', 'armorM', 1), cls('cavalry', 'armorP', 1)] });
T('chainbarding', { name: 'Barda de Malha', icon: '🐴', cost: { food: 250, gold: 150 }, time: 55, bld: 'blacksmith', age: 2, req: ['scalebarding'], desc: 'Cavalaria: +1/+1 armadura.', effects: [cls('cavalry', 'armorM', 1), cls('cavalry', 'armorP', 1)] });
T('platebarding', { name: 'Barda de Placas', icon: '🐴', cost: { food: 350, gold: 200 }, time: 70, bld: 'blacksmith', age: 3, req: ['chainbarding'], desc: 'Cavalaria: +1/+2 armadura.', effects: [cls('cavalry', 'armorM', 1), cls('cavalry', 'armorP', 2)] });
// Castelo / defesa
T('masonry', { name: 'Alvenaria', icon: '🧱', cost: { food: 150, wood: 175 }, time: 50, bld: 'castle', age: 2, desc: 'Edifícios: +10% PV e +1/+1 armadura.', effects: [{ t: 'bhp', mul: 1.1 }, { t: 'barmor', add: 1 }] });
T('hoardings', { name: 'Tapumes', icon: '🏰', cost: { wood: 400 }, time: 40, bld: 'castle', age: 2, desc: 'Castelos e torres: +2 ataque.', effects: [{ t: 'bldatk', add: 2 }] });

// ---------------------------------------------------------------------------
// Civilizações (bônus aplicados como efeitos; minAge = era mínima do bônus)
// ---------------------------------------------------------------------------
const CIVS = {
  britons: { name: 'Britões', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', unique: 'longbowman', uniqueDesc: 'Arqueiro Inglês: arco longo de alcance 6.',
    bonuses: ['Centro da Cidade produz 20% mais rápido', 'Campos de Arquearia produzem 20% mais rápido', 'Arqueiros: +1 de alcance na Era dos Castelos e +1 na Imperial'],
    effects: [{ t: 'time', bld: 'towncenter', mul: 0.8 }, { t: 'time', bld: 'archeryrange', mul: 0.8 }, { minAge: 2, ...cls('archer', 'range', 1) }, { minAge: 3, ...cls('archer', 'range', 1) }] },
  franks: { name: 'Francos', flag: '🇫🇷', unique: 'throwaxe', uniqueDesc: 'Lançador de Machados: infantaria à distância.',
    bonuses: ['Cavaleiros têm +20% de PV', 'Castelos custam 25% menos', 'Coleta de frutas silvestres 25% mais rápida'],
    effects: [{ t: 'cls', cls: 'knight', stat: 'hp', mul: 1.2 }, { t: 'bcost', id: 'castle', mul: 0.75 }, { t: 'gather', k: 'berry', mul: 1.25 }] },
  mongols: { name: 'Mongóis', flag: '🇲🇳', unique: 'mangudai', uniqueDesc: 'Mangudai: arqueiro montado.',
    bonuses: ['Caça 40% mais rápida', 'Cavalaria Exploradora tem +2 de visão e +30% PV', 'Cavalaria +15% de velocidade de ataque'],
    effects: [{ t: 'gather', k: 'hunt', mul: 1.4 }, cls('scout', 'los', 2), clsMul('scout', 'hp', 1.3), clsMul('cavalry', 'reload', 0.87)] },
  chinese: { name: 'Chineses', flag: '🇨🇳', unique: 'chukonu', uniqueDesc: 'Chu Ko Nu: besta de repetição.',
    bonuses: ['Começa com +3 aldeões, porém -200 de madeira', 'Fazendas rendem 10% mais', 'Tecnologias de Ferraria 10% mais baratas'],
    start: { villagers: 3, res: { wood: -200 } }, effects: [{ t: 'gather', k: 'farm', mul: 1.1 }, { t: 'tcost', bld: 'blacksmith', mul: 0.9 }] },
  goths: { name: 'Godos', flag: '🛡️', unique: 'huskarl', uniqueDesc: 'Huskarl: resistente a flechas.',
    bonuses: ['Infantaria custa 25% menos', 'Infantaria ataca 15% mais rápido', 'Quartéis produzem 20% mais rápido'],
    effects: [{ t: 'cost', cls: 'infantry', mul: 0.75 }, clsMul('infantry', 'reload', 0.87), { t: 'time', bld: 'barracks', mul: 0.8 }] },
  persians: { name: 'Persas', flag: '🇮🇷', unique: 'elephant', uniqueDesc: 'Elefante de Guerra: monstro blindado.',
    bonuses: ['Começa com +100 de madeira e comida', 'Centro da Cidade produz 40% mais rápido', 'Cavalaria +10% de PV'],
    start: { res: { food: 100, wood: 100 } }, effects: [{ t: 'time', bld: 'towncenter', mul: 0.6 }, clsMul('cavalry', 'hp', 1.1)] },
  turks: { name: 'Turcos', flag: '🇹🇷', unique: 'janissary', uniqueDesc: 'Janízaro: atirador de pólvora.',
    bonuses: ['Mineração de ouro 20% mais rápida', 'Cavalaria Exploradora +25% PV e unidades únicas +10% PV', 'Pesquisas de Ferraria custam 15% menos'],
    effects: [{ t: 'gather', k: 'gold', mul: 1.2 }, clsMul('scout', 'hp', 1.25), clsMul('unique', 'hp', 1.1), { t: 'tcost', bld: 'blacksmith', mul: 0.85 }] },
  japanese: { name: 'Japoneses', flag: '🇯🇵', unique: 'samurai', uniqueDesc: 'Samurai: espadachim veloz.',
    bonuses: ['Moinho, Serraria e Mineração custam 50% menos', 'Infantaria ataca 25% mais rápido', 'Caça 5% mais rápida'],
    effects: [{ t: 'bcost', id: 'mill', mul: 0.5 }, { t: 'bcost', id: 'lumbercamp', mul: 0.5 }, { t: 'bcost', id: 'miningcamp', mul: 0.5 }, clsMul('infantry', 'reload', 0.8), { t: 'gather', k: 'hunt', mul: 1.05 }] },
};
for (const id in CIVS) CIVS[id].id = id;

// Dificuldade das IAs ---------------------------------------------------------
const AI_LEVELS = {
  easy: { name: 'Fácil', think: 2.2, vils: 28, wave: 14, waveGrow: 6, firstAttack: 780, gatherMul: 0.85, upgrades: 0.35, keepArmy: 0.55 },
  moderate: { name: 'Moderada', think: 1.4, vils: 45, wave: 24, waveGrow: 8, firstAttack: 600, gatherMul: 1.0, upgrades: 0.7, keepArmy: 0.35 },
  hard: { name: 'Difícil', think: 0.9, vils: 62, wave: 34, waveGrow: 10, firstAttack: 480, gatherMul: 1.0, upgrades: 1.0, keepArmy: 0.2 },
  expert: { name: 'Especialista', think: 0.6, vils: 75, wave: 42, waveGrow: 12, firstAttack: 400, gatherMul: 1.2, upgrades: 1.0, keepArmy: 0.1 },
};

// Tipos de mapa ----------------------------------------------------------------
const MAP_TYPES = {
  arabia: { name: 'Planície (Arábia)', desc: 'Terreno aberto com bosques espalhados.', forest: 0.09, lakes: 0 },
  lagos: { name: 'Terra dos Lagos', desc: 'Lagos bloqueiam passagens e criam gargalos.', forest: 0.10, lakes: 1 },
  floresta: { name: 'Floresta Negra', desc: 'Florestas densas separam os impérios.', forest: 0.30, lakes: 0 },
  continental: { name: 'Continente', desc: 'Mistura de planícies, florestas e lagos.', forest: 0.15, lakes: 0.5 },
};
const MAP_SIZES = { tiny: { name: 'Minúsculo (2 jog.)', n: 48 }, small: { name: 'Pequeno (3-4 jog.)', n: 64 }, medium: { name: 'Médio (5-6 jog.)', n: 84 }, large: { name: 'Grande (7-8 jog.)', n: 104 } };

const GAME_MODES = {
  conquest: { name: 'Conquista', desc: 'Destrua todos os edifícios e aldeões inimigos.' },
  regicide: { name: 'Regicida', desc: 'Cada jogador tem um Rei. Se o seu cair, você perde.' },
  deathmatch: { name: 'Mata-Mata (Death Match)', desc: 'Começa com recursos enormes. Guerra total desde o início.' },
};

const START_RES = {
  standard: { name: 'Padrão (200 de cada)', res: { food: 200, wood: 200, gold: 100, stone: 200 } },
  medium: { name: 'Média (1.000 de cada)', res: { food: 1000, wood: 1000, gold: 1000, stone: 1000 } },
  high: { name: 'Alta (3.000 de cada)', res: { food: 3000, wood: 3000, gold: 3000, stone: 3000 } },
};
