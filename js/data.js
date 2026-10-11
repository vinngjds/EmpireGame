'use strict';
// Dados do jogo: países, facções, políticas, conselheiros ----------------------

const START_YEAR = 2000, END_YEAR = 2050, TERM = 4, WIN_STREAK = 6;

const FACTIONS = [
  { id: 'workers', name: 'Trabalhadores', icon: '👷', desc: 'Querem empregos, salários e proteção social.' },
  { id: 'business', name: 'Empresariado', icon: '💼', desc: 'Querem crescimento, impostos baixos e instituições sólidas.' },
  { id: 'military', name: 'Militares', icon: '🎖️', desc: 'Querem orçamento de defesa, ordem e prestígio nacional.' },
  { id: 'religious', name: 'Tradicionalistas', icon: '⛪', desc: 'Defendem família, costumes e segurança.' },
  { id: 'rural', name: 'Setor Rural', icon: '🌾', desc: 'Querem infraestrutura, preços e menos impostos no campo.' },
  { id: 'youth', name: 'Jovens Urbanos', icon: '🎓', desc: 'Querem educação, empregos, tecnologia e meio ambiente.' },
];

// áreas do orçamento: manutenção = gasto (% PIB) necessário só para não perder o que já existe
const SPEND = [
  { id: 'edu', name: 'Educação', icon: '📚', max: 12, maint: 2.2, tip: 'Eleva a educação (produtividade, menor natalidade).' },
  { id: 'health', name: 'Saúde', icon: '🏥', max: 12, maint: 2.2, tip: 'Reduz mortalidade e aumenta a produtividade.' },
  { id: 'infra', name: 'Infraestrutura', icon: '🏗️', max: 10, maint: 1.6, tip: 'Estradas, energia, portos: base do crescimento.' },
  { id: 'rd', name: 'Ciência e P&D', icon: '🔬', max: 8, maint: 0.3, tip: 'Gera tecnologia nova e absorve a de fora.' },
  { id: 'def', name: 'Defesa', icon: '🛡️', max: 10, maint: 1.5, tip: 'Força militar e agrada os militares.' },
  { id: 'pol', name: 'Segurança pública', icon: '🚓', max: 6, maint: 1.2, tip: 'Reduz a criminalidade.' },
  { id: 'welf', name: 'Assistência social', icon: '🤝', max: 10, maint: 0.0, tip: 'Reduz pobreza e desigualdade; agrada trabalhadores.' },
];

const ADVISORS = {
  eco: { name: 'Helena Costa', role: 'Ministra da Economia', icon: '👩‍💼' },
  gen: { name: 'Gen. Duarte', role: 'Chefe das Forças Armadas', icon: '🎖️' },
  soc: { name: 'Dra. Amara', role: 'Ministra da Saúde e Assistência', icon: '👩‍⚕️' },
  sci: { name: 'Prof. Yuki', role: 'Conselheiro de Ciência', icon: '🧑‍🔬' },
  pol: { name: 'Marco Reis', role: 'Chefe de Gabinete', icon: '🕴️' },
};

// ---------------------------------------------------------------------------
// Países (valores de 2000 aproximados e simplificados para fins de jogo)
// pop: milhões; gdp: PIB per capita (mil US$); goal: posição-alvo no ranking de poder
// ---------------------------------------------------------------------------
const COUNTRIES = [
  { id: 'BR', name: 'Brasil', flag: '🇧🇷', pop: 175, gdp: 7.5, birth: 20, urban: 81, tech: 38, edu: 55, health: 62, infra: 50, ineq: 60, corr: 55, comm: 45, mil: 45, agro: 8, ind: 27, debt: 60, infl: 7, goal: 5, diff: 3,
    blurb: 'Gigante agrícola e mineral, desigual e muito dependente de commodities. Tem escala, mas precisa de produtividade e instituições.' },
  { id: 'IN', name: 'Índia', flag: '🇮🇳', pop: 1050, gdp: 2.5, birth: 26, urban: 28, tech: 35, edu: 45, health: 48, infra: 38, ineq: 40, corr: 60, comm: 25, mil: 55, agro: 24, ind: 26, debt: 70, infl: 5, goal: 3, diff: 4,
    blurb: 'Bilhão de pessoas e uma geração jovem enorme. Dividendo demográfico ou bomba-relógio de desemprego?' },
  { id: 'NG', name: 'Nigéria', flag: '🇳🇬', pop: 125, gdp: 1.4, birth: 41, urban: 35, tech: 20, edu: 38, health: 35, infra: 25, ineq: 45, corr: 75, comm: 80, mil: 30, agro: 25, ind: 30, debt: 40, infl: 12, goal: 8, diff: 5,
    blurb: 'Petróleo, população explosiva e corrupção profunda. Escapar da maldição das commodities é o maior desafio.' },
  { id: 'VN', name: 'Vietnã', flag: '🇻🇳', pop: 78, gdp: 1.9, birth: 19, urban: 24, tech: 28, edu: 55, health: 58, infra: 38, ineq: 36, corr: 55, comm: 30, mil: 35, agro: 24, ind: 36, debt: 35, infl: 4, goal: 10, diff: 3,
    blurb: 'Economia em abertura, mão de obra educada e barata. Pode virar a próxima fábrica do mundo.' },
  { id: 'ID', name: 'Indonésia', flag: '🇮🇩', pop: 210, gdp: 3.0, birth: 22, urban: 42, tech: 30, edu: 50, health: 52, infra: 40, ineq: 38, corr: 65, comm: 50, mil: 35, agro: 16, ind: 40, debt: 90, infl: 9, goal: 7, diff: 4,
    blurb: 'Arquipélago de 200 milhões, rico em recursos, saindo de uma grande crise financeira.' },
  { id: 'MX', name: 'México', flag: '🇲🇽', pop: 98, gdp: 9.0, birth: 24, urban: 74, tech: 42, edu: 58, health: 65, infra: 52, ineq: 52, corr: 60, comm: 35, mil: 38, agro: 4, ind: 28, debt: 40, infl: 9, goal: 8, diff: 3,
    blurb: 'Vizinho dos EUA, integrado ao comércio norte-americano, mas refém da violência e da informalidade.' },
  { id: 'EG', name: 'Egito', flag: '🇪🇬', pop: 68, gdp: 3.8, birth: 27, urban: 43, tech: 30, edu: 50, health: 58, infra: 45, ineq: 38, corr: 62, comm: 40, mil: 52, agro: 16, ind: 32, debt: 70, infl: 3, goal: 10, diff: 4,
    blurb: 'Posição estratégica no Suez, população jovem crescente e pressão por empregos.' },
  { id: 'BD', name: 'Bangladesh', flag: '🇧🇩', pop: 130, gdp: 1.4, birth: 28, urban: 24, tech: 20, edu: 40, health: 45, infra: 25, ineq: 36, corr: 70, comm: 15, mil: 25, agro: 25, ind: 25, debt: 40, infl: 4, goal: 12, diff: 5,
    blurb: 'Muito povoado, vulnerável a enchentes, com uma indústria têxtil em ascensão.' },
  { id: 'PH', name: 'Filipinas', flag: '🇵🇭', pop: 77, gdp: 3.2, birth: 28, urban: 48, tech: 28, edu: 58, health: 55, infra: 38, ineq: 44, corr: 65, comm: 25, mil: 25, agro: 15, ind: 32, debt: 60, infl: 4, goal: 12, diff: 4,
    blurb: 'Povo jovem e anglófono, remessas de emigrantes e fortes desastres naturais.' },
  { id: 'ET', name: 'Etiópia', flag: '🇪🇹', pop: 66, gdp: 0.7, birth: 43, urban: 15, tech: 10, edu: 25, health: 30, infra: 15, ineq: 33, corr: 60, comm: 55, mil: 30, agro: 45, ind: 10, debt: 80, infl: 6, goal: 12, diff: 5,
    blurb: 'Um dos países mais pobres do mundo, com enorme potencial agrícola e hidrelétrico. Começar do zero.' },
  { id: 'TR', name: 'Turquia', flag: '🇹🇷', pop: 64, gdp: 8.5, birth: 22, urban: 65, tech: 40, edu: 60, health: 66, infra: 52, ineq: 43, corr: 50, comm: 20, mil: 55, agro: 12, ind: 28, debt: 60, infl: 45, goal: 8, diff: 3,
    blurb: 'Ponte entre Europa e Ásia, com economia industrial mas inflação crônica e instabilidade política.' },
  { id: 'PK', name: 'Paquistão', flag: '🇵🇰', pop: 140, gdp: 1.9, birth: 33, urban: 33, tech: 25, edu: 38, health: 42, infra: 30, ineq: 33, corr: 70, comm: 25, mil: 60, agro: 25, ind: 22, debt: 80, infl: 5, goal: 10, diff: 5,
    blurb: 'Potência nuclear com economia frágil, alta natalidade e tensões regionais.' },
  { id: 'CO', name: 'Colômbia', flag: '🇨🇴', pop: 40, gdp: 5.8, birth: 22, urban: 72, tech: 36, edu: 56, health: 62, infra: 40, ineq: 57, corr: 60, comm: 55, mil: 45, agro: 12, ind: 28, debt: 35, infl: 9, goal: 12, diff: 4,
    blurb: 'Saindo de um longo conflito interno, com café, petróleo e uma desigualdade profunda.' },
  { id: 'AR', name: 'Argentina', flag: '🇦🇷', pop: 37, gdp: 9.5, birth: 19, urban: 90, tech: 42, edu: 66, health: 72, infra: 55, ineq: 49, corr: 55, comm: 45, mil: 35, agro: 6, ind: 25, debt: 50, infl: 2, goal: 10, diff: 4,
    blurb: 'Povo educado e terra fértil, porém com histórico de crises de dívida e inflação.' },
  { id: 'ZA', name: 'África do Sul', flag: '🇿🇦', pop: 44, gdp: 7.5, birth: 24, urban: 57, tech: 40, edu: 58, health: 50, infra: 55, ineq: 63, corr: 50, comm: 55, mil: 45, agro: 4, ind: 30, debt: 40, infl: 6, goal: 10, diff: 4,
    blurb: 'Maior economia industrial da África, a mais desigual do mundo e com desemprego alto.' },
  { id: 'RU', name: 'Rússia', flag: '🇷🇺', pop: 146, gdp: 7.5, birth: 9, urban: 73, tech: 55, edu: 80, health: 65, infra: 55, ineq: 40, corr: 70, comm: 70, mil: 85, agro: 6, ind: 36, debt: 50, infl: 20, goal: 4, diff: 3,
    blurb: 'Arsenal imenso, energia e ciência herdadas, mas população em declínio e economia dependente do gás e petróleo.' },
  { id: 'CN', name: 'China', flag: '🇨🇳', pop: 1260, gdp: 3.8, birth: 14, urban: 36, tech: 42, edu: 55, health: 62, infra: 48, ineq: 40, corr: 50, comm: 15, mil: 70, agro: 15, ind: 45, debt: 25, infl: 1, goal: 1, diff: 2,
    blurb: 'Fábrica do mundo em ascensão rápida. O desafio é envelhecer antes de enriquecer.' },
  { id: 'JP', name: 'Japão', flag: '🇯🇵', pop: 127, gdp: 26, birth: 9, urban: 79, tech: 90, edu: 90, health: 92, infra: 88, ineq: 25, corr: 20, comm: 5, mil: 40, agro: 2, ind: 30, debt: 130, infl: 0, goal: 3, diff: 3,
    blurb: 'Tecnologia de ponta e uma população que envelhece rápido. Como manter o poder sem gente jovem?' },
  { id: 'DE', name: 'Alemanha', flag: '🇩🇪', pop: 82, gdp: 26, birth: 9, urban: 75, tech: 90, edu: 88, health: 90, infra: 90, ineq: 30, corr: 15, comm: 8, mil: 40, agro: 1, ind: 28, debt: 60, infl: 2, goal: 3, diff: 2,
    blurb: 'Potência industrial exportadora no centro da Europa, com população que encolhe.' },
  { id: 'US', name: 'Estados Unidos', flag: '🇺🇸', pop: 282, gdp: 36, birth: 14, urban: 79, tech: 98, edu: 87, health: 80, infra: 90, ineq: 41, corr: 25, comm: 10, mil: 95, agro: 1, ind: 22, debt: 55, infl: 3, goal: 1, diff: 1,
    blurb: 'Superpotência única. O desafio é manter a liderança diante dos que a alcançam.' },
  { id: 'GB', name: 'Reino Unido', flag: '🇬🇧', pop: 59, gdp: 25, birth: 11, urban: 79, tech: 90, edu: 88, health: 88, infra: 85, ineq: 35, corr: 15, comm: 12, mil: 60, agro: 1, ind: 20, debt: 40, infl: 2, goal: 4, diff: 2,
    blurb: 'Finanças, serviços e influência global, fora do centro do poder industrial.' },
  { id: 'FR', name: 'França', flag: '🇫🇷', pop: 60, gdp: 24, birth: 13, urban: 76, tech: 88, edu: 85, health: 91, infra: 88, ineq: 30, corr: 20, comm: 8, mil: 65, agro: 3, ind: 20, debt: 58, infl: 2, goal: 4, diff: 2,
    blurb: 'Estado forte, dissuasão nuclear e um modelo social caro de manter.' },
  { id: 'KR', name: 'Coreia do Sul', flag: '🇰🇷', pop: 47, gdp: 17, birth: 14, urban: 80, tech: 75, edu: 85, health: 85, infra: 80, ineq: 32, corr: 40, comm: 5, mil: 60, agro: 5, ind: 40, debt: 20, infl: 2, goal: 5, diff: 2,
    blurb: 'Milagre econômico em andamento: a tecnologia dá o salto, mas a natalidade desaba.' },
  { id: 'SA', name: 'Arábia Saudita', flag: '🇸🇦', pop: 21, gdp: 18, birth: 31, urban: 79, tech: 50, edu: 60, health: 72, infra: 65, ineq: 45, corr: 60, comm: 95, mil: 70, agro: 4, ind: 50, debt: 60, infl: 0, goal: 8, diff: 3,
    blurb: 'Riqueza imensa vinda do petróleo. Como diversificar antes que o recurso perca valor?' },
];
for (const c of COUNTRIES) { c.open = c.open || 50; }

// ---------------------------------------------------------------------------
// Políticas (cartas). fx = efeito por ano com efeito pleno (sobe ao longo de "delay" anos)
// tgt = nível-alvo para o qual a variável converge; fac = opinião fixa enquanto estiver ativa
// upkeep = custo anual em % do PIB (negativo = receita)
// ---------------------------------------------------------------------------
const POLICIES = [
  // Economia
  { id: 'subsidio_ind', cat: 'Economia', icon: '🏭', name: 'Subsídio à indústria', cp: 2, upkeep: 0.8, delay: 3, desc: 'Crédito barato e proteção para fábricas nacionais.',
    fx: { gBonus: 0.5, infl: 0.4, comm: -0.6, pollution: 0.5, jobs: 0.8 }, fac: { business: 4, workers: 3, rural: -3 } },
  { id: 'abertura', cat: 'Economia', icon: '🌐', name: 'Abertura comercial', cp: 3, upkeep: 0, delay: 2, desc: 'Reduz tarifas e atrai concorrência e tecnologia de fora.', excl: ['protecao'],
    tgt: { open: 78 }, fx: { gBonus: 0.35, tech: 0.3, jobs: -0.4 }, fac: { business: 5, workers: -4, rural: -2 } },
  { id: 'protecao', cat: 'Economia', icon: '🚧', name: 'Protecionismo', cp: 2, upkeep: 0, delay: 2, desc: 'Tarifas altas protegem empregos locais, mas isolam a economia.', excl: ['abertura'],
    tgt: { open: 25 }, fx: { gBonus: -0.2, infl: 0.2, jobs: 0.5 }, fac: { workers: 3, business: -3, rural: 3 } },
  { id: 'zonas', cat: 'Economia', icon: '🏙️', name: 'Zonas econômicas especiais', cp: 3, upkeep: 0.4, delay: 4, desc: 'Polos com isenções para atrair investimento estrangeiro.',
    fx: { gBonus: 0.4, tech: 0.4, infra: 0.3, ineq: 0.25, pollution: 0.2 }, fac: { business: 4, workers: -2, rural: -1 } },
  { id: 'bc_indep', cat: 'Economia', icon: '🏦', name: 'Banco central independente', cp: 3, upkeep: 0.1, delay: 2, desc: 'Controle técnico da moeda: menos inflação, menos truques políticos.',
    fx: { infl: -0.6, gBonus: -0.05, corr: -0.1 }, once: { rating: 4 }, fac: { business: 4, workers: -2 } },
  { id: 'privatiza', cat: 'Economia', icon: '🏷️', name: 'Privatizações', cp: 3, upkeep: -0.4, delay: 2, desc: 'Vende estatais: entra caixa e eficiência, mas empregos e controle saem.', excl: ['estatiza'],
    once: { debt: -4, jobs: -4 }, fx: { gBonus: 0.25, corr: -0.2, ineq: 0.2 }, fac: { business: 6, workers: -6 } },
  { id: 'estatiza', cat: 'Economia', icon: '🏛️', name: 'Estatização estratégica', cp: 3, upkeep: 0.8, delay: 3, desc: 'O Estado assume energia, mineração e transportes.', excl: ['privatiza'],
    fx: { jobs: 0.5, corr: 0.3, tech: 0.1, gBonus: -0.1 }, fac: { workers: 4, military: 3, business: -6 } },
  { id: 'reforma_trib', cat: 'Economia', icon: '🧾', name: 'Reforma tributária progressiva', cp: 3, upkeep: 0, delay: 3, desc: 'Cobra mais de quem tem mais e fecha brechas de evasão.',
    fx: { ineq: -0.5, collect: 1.2 }, fac: { business: -4, workers: 4, youth: 2 } },
  { id: 'reforma_prev', cat: 'Economia', icon: '👴', name: 'Reforma da previdência', cp: 3, upkeep: 0, delay: 3, desc: 'Idade mínima maior e benefícios menores: alivia o orçamento no longo prazo.',
    fx: { pension: -0.06 }, fac: { workers: -8, business: 5 } },
  { id: 'reforma_agraria', cat: 'Economia', icon: '🌱', name: 'Reforma agrária', cp: 3, upkeep: 0.5, delay: 4, desc: 'Redistribui terras improdutivas a pequenos agricultores.',
    fx: { ineq: -0.5, jobs: 0.3 }, fac: { rural: -7, workers: 4, youth: 2 } },
  { id: 'agro_sub', cat: 'Economia', icon: '🚜', name: 'Subsídio ao agronegócio', cp: 2, upkeep: 0.6, delay: 2, desc: 'Crédito e seguros para a produção rural.',
    fx: { gBonus: 0.2, pollution: 0.2, comm: 0.5 }, fac: { rural: 6, youth: -2 } },
  { id: 'recursos', cat: 'Economia', icon: '⛏️', name: 'Exploração intensiva de recursos', cp: 2, upkeep: -0.6, delay: 2, desc: 'Mais petróleo e minérios: receita rápida, dependência e poluição.',
    fx: { comm: 1.2, pollution: 0.8, corr: 0.3, gBonus: 0.25 }, fac: { business: 4, rural: 2, youth: -4 } },
  { id: 'fundo_soberano', cat: 'Economia', icon: '💰', name: 'Fundo soberano', cp: 3, upkeep: 0.5, delay: 4, desc: 'Poupa parte da renda dos recursos para o futuro.', req: c => c.comm >= 35,
    fx: { comm: -0.8, corr: -0.2 }, once: { rating: 3 }, fac: { business: 2 } },
  // Social
  { id: 'edu_universal', cat: 'Social', icon: '📚', name: 'Educação básica universal', cp: 2, upkeep: 1.0, delay: 5, desc: 'Escola para todos: base de tudo, mas só dá retorno em anos.',
    fx: { edu: 1.2, ineq: -0.25, birthT: -0.5, crime: -0.2 }, fac: { youth: 5, workers: 3, religious: -1 } },
  { id: 'ensino_tec', cat: 'Social', icon: '🔧', name: 'Ensino técnico profissionalizante', cp: 2, upkeep: 0.6, delay: 4, desc: 'Forma mão de obra qualificada para a indústria.',
    fx: { edu: 0.6, tech: 0.3, jobs: 0.5 }, fac: { business: 3, workers: 3, youth: 2 } },
  { id: 'saude_univ', cat: 'Social', icon: '🏥', name: 'Saúde universal', cp: 3, upkeep: 1.2, delay: 4, desc: 'Atendimento público gratuito.',
    fx: { health: 1.3, ineq: -0.2 }, fac: { workers: 5, youth: 3, business: -2 } },
  { id: 'saneamento', cat: 'Social', icon: '🚰', name: 'Saneamento básico', cp: 2, upkeep: 0.8, delay: 4, desc: 'Água tratada e esgoto: salva vidas e reduz doenças.',
    fx: { health: 0.9, infra: 0.3, pollution: -0.2 }, fac: { workers: 3, youth: 2 } },
  { id: 'renda_basica', cat: 'Social', icon: '💳', name: 'Transferência de renda', cp: 3, upkeep: 1.2, delay: 2, desc: 'Renda mínima às famílias pobres.',
    fx: { ineq: -0.7, crime: -0.3, jobs: -0.15 }, fac: { workers: 6, rural: 3, business: -3 } },
  { id: 'habitacao', cat: 'Social', icon: '🏘️', name: 'Programa de habitação', cp: 2, upkeep: 0.8, delay: 4, desc: 'Moradia popular nas periferias.',
    fx: { crime: -0.3, ineq: -0.2, infra: 0.2 }, fac: { workers: 4, youth: 2 } },
  { id: 'planej_fam', cat: 'Demografia', icon: '👪', name: 'Planejamento familiar', cp: 2, upkeep: 0.2, delay: 4, desc: 'Acesso a contraceptivos e educação reprodutiva.', excl: ['incent_nat'],
    fx: { birthT: -2.5, edu: 0.1 }, fac: { youth: 3, religious: -8, rural: -2 } },
  { id: 'incent_nat', cat: 'Demografia', icon: '🍼', name: 'Incentivo à natalidade', cp: 2, upkeep: 0.8, delay: 3, desc: 'Bônus e creches para famílias com filhos.', excl: ['planej_fam'],
    fx: { birthT: 2.5 }, fac: { religious: 7, youth: -3 } },
  { id: 'imigra', cat: 'Demografia', icon: '🧳', name: 'Imigração qualificada', cp: 3, upkeep: 0.3, delay: 3, desc: 'Vistos para profissionais e estudantes estrangeiros.',
    fx: { migr: 0.25, tech: 0.3 }, fac: { business: 3, workers: -4, religious: -4, youth: 1 } },
  // Governança
  { id: 'anticorrupcao', cat: 'Governança', icon: '⚖️', name: 'Combate à corrupção', cp: 3, upkeep: 0.3, delay: 3, desc: 'Polícia federal e justiça independentes.',
    fx: { corr: -1.6 }, fac: { youth: 5, business: 2, military: -2 } },
  { id: 'transparencia', cat: 'Governança', icon: '🔍', name: 'Governo digital e transparência', cp: 2, upkeep: 0.3, delay: 3, desc: 'Serviços online e dados abertos.',
    fx: { corr: -0.7, tech: 0.2 }, fac: { youth: 3 } },
  { id: 'policia_com', cat: 'Governança', icon: '🚓', name: 'Policiamento comunitário', cp: 2, upkeep: 0.5, delay: 3, desc: 'Presença policial próxima às comunidades.',
    fx: { crime: -0.9 }, fac: { religious: 2, workers: 2 } },
  { id: 'lei_ordem', cat: 'Governança', icon: '🔒', name: 'Lei e ordem linha-dura', cp: 2, upkeep: 0.3, delay: 2, desc: 'Penas duras e patrulhamento ostensivo.',
    fx: { crime: -0.6 }, fac: { military: 5, religious: 4, youth: -6, workers: -2 } },
  // Infraestrutura e tecnologia
  { id: 'infra_nacional', cat: 'Tecnologia', icon: '🛤️', name: 'Plano nacional de infraestrutura', cp: 3, upkeep: 1.5, delay: 5, desc: 'Ferrovias, portos, rodovias e energia.',
    fx: { infra: 1.6, gBonus: 0.1 }, fac: { business: 4, rural: 3, workers: 3 } },
  { id: 'energia_renov', cat: 'Tecnologia', icon: '🌞', name: 'Energia renovável', cp: 3, upkeep: 1.0, delay: 6, desc: 'Solar, eólica e hidrelétrica: menos poluição.',
    fx: { pollution: -1.4, infra: 0.4, gBonus: 0.05 }, fac: { youth: 5, business: -1 } },
  { id: 'ciencia', cat: 'Tecnologia', icon: '🧪', name: 'Fundo nacional de ciência', cp: 3, upkeep: 1.0, delay: 5, desc: 'Bolsas, laboratórios e universidades de pesquisa.',
    fx: { tech: 1.1, edu: 0.3 }, fac: { youth: 3, business: 2 } },
  { id: 'digital', cat: 'Tecnologia', icon: '📡', name: 'Banda larga e digitalização', cp: 3, upkeep: 0.8, delay: 4, desc: 'Internet para todos e economia digital.',
    fx: { tech: 0.8, infra: 0.4, gBonus: 0.15, jobs: 0.2 }, fac: { youth: 3, business: 3 } },
  // Defesa
  { id: 'exercito_prof', cat: 'Defesa', icon: '🪖', name: 'Exército profissional', cp: 2, upkeep: 0.8, delay: 3, desc: 'Tropas treinadas e equipadas.',
    fx: { mil: 1.0, influence: 0.2 }, fac: { military: 6, youth: -1 } },
  { id: 'industria_def', cat: 'Defesa', icon: '🚀', name: 'Indústria de defesa', cp: 3, upkeep: 1.0, delay: 5, desc: 'Armamento nacional com spin-off tecnológico.',
    fx: { mil: 1.2, tech: 0.3, gBonus: 0.1 }, fac: { military: 5, business: 2, youth: -2 } },
  { id: 'serv_militar', cat: 'Defesa', icon: '🎽', name: 'Serviço militar obrigatório', cp: 2, upkeep: 0.2, delay: 2, desc: 'Convocação anual de jovens.',
    fx: { mil: 1.2, jobs: 0.3 }, fac: { military: 6, youth: -7, religious: 2 } },
];
const POL = {};
for (const p of POLICIES) POL[p.id] = p;

// Artigos dos nomes de países (para frases corretas: "do Brasil", "na Índia")
const ART = { BR: 'o', IN: 'a', NG: 'a', VN: 'o', ID: 'a', MX: 'o', EG: 'o', BD: '', PH: 'as', ET: 'a', TR: 'a', PK: 'o', CO: 'a', AR: 'a', ZA: 'a', RU: 'a', CN: 'a', JP: 'o', DE: 'a', US: 'os', GB: 'o', FR: 'a', KR: 'a', SA: 'a' };
const de = c => ({ '': 'de ', o: 'do ', a: 'da ', os: 'dos ', as: 'das ' }[ART[c.id] || '']) + c.name;
const em = c => ({ '': 'em ', o: 'no ', a: 'na ', os: 'nos ', as: 'nas ' }[ART[c.id] || '']) + c.name;
const para = c => ({ '': 'para ', o: 'para o ', a: 'para a ', os: 'para os ', as: 'para as ' }[ART[c.id] || '']) + c.name;
