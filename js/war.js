'use strict';
// Guerra: camada tática por turnos (frente de batalha) e conflitos entre IAs -----

const WAR_ACTIONS = [
  { id: 'ofensiva', icon: '⚔️', name: 'Ofensiva total', desc: 'Avança a frente depressa, com muitas baixas e custo alto.', push: 1.0, cost: 2.4, cas: 1.0, fat: 12 },
  { id: 'defesa', icon: '🛡️', name: 'Defesa em profundidade', desc: 'Segura a linha com poucas baixas; avança pouco.', push: 0.35, cost: 1.1, cas: 0.45, fat: 5 },
  { id: 'guerrilha', icon: '🌲', name: 'Guerra de desgaste', desc: 'Barata e eficaz contra inimigos mais fortes; progresso lento.', push: 0.5, cost: 0.7, cas: 0.5, fat: 6, weak: true },
  { id: 'bloqueio', icon: '🚢', name: 'Bloqueio e sanções', desc: 'Sufoca a economia inimiga (exige tecnologia ≥ 45).', push: 0.3, cost: 0.9, cas: 0.2, fat: 4, foeEcon: 1.8, req: c => c.tech >= 45 },
  { id: 'mobilizar', icon: '📣', name: 'Mobilização geral', desc: 'Aumenta o esforço de guerra (até 2 níveis) à custa da economia e dos trabalhadores.', push: 0.15, cost: 1.4, cas: 0.3, fat: 8, mob: 1, req: c => (c.mobil || 0) < 2 },
  { id: 'cessar', icon: '🕊️', name: 'Negociar cessar-fogo', desc: 'Encerra a guerra. Os termos dependem da situação da frente.', peace: true },
];

function warStrength(c) { return c.mil * (0.55 + 0.45 * c.tech / 100) * Math.pow(Math.max(0.2, c.pop * c.gdpPc) / 1000, 0.25) * (1 + 0.25 * (c.mobil || 0)); }

function warStart(c, w, foe, kind) {
  w.war = { foe: foe.id, since: w.year, front: 0, kind, years: 0 };
  c.fatigue = 0; c.mobil = 0; c.war = true;
  c.shock.military += 8; c.shock.youth -= (kind === 'ataque' ? 6 : 1); c.shock.religious += kind === 'defesa' ? 3 : -1;
  w.rel[c.id][foe.id] = Math.max(0, w.rel[c.id][foe.id] - 40); w.rel[foe.id][c.id] = w.rel[c.id][foe.id];
  w.log.push({ year: w.year, icon: '⚔️', text: kind === 'ataque' ? 'Guerra declarada a ' + foe.name : foe.name + ' invade o país: começa a guerra' });
}
function warInfo(c, w) {
  const f = w.byId[w.war.foe];
  const R = warStrength(c) / Math.max(1, warStrength(f));
  return { foe: f, R, front: w.war.front, years: w.war.years };
}
function warEnd(c, w, outcome, text) {
  const f = w.byId[w.war.foe];
  const win = outcome === 'vitoria', lose = outcome === 'derrota';
  if (win) { E.pop(c, 2.0 * Math.min(2, f.pop / c.pop) * 1.2); E.gdp(c, 1.2); c.influence = Math.min(100, c.influence + 10); c.shock.military += 10; c.shock.workers += 3; f.influence = Math.max(0, f.influence - 8); f.mil = Math.max(0, f.mil - 10); }
  if (lose) { E.pop(c, -1.2); E.gdp(c, -2.5); c.influence = Math.max(0, c.influence - 10); c.shock.military -= 12; c.shock.workers -= 4; c.shock.youth -= 4; c.mil = Math.max(0, c.mil - 12); f.influence = Math.min(100, f.influence + 6); }
  if (outcome === 'empate') { c.influence = Math.max(0, c.influence - 1); }
  c.mobil = 0; c.fatigue = 0; c.war = false;
  w.log.push({ year: w.year, icon: win ? '🏅' : lose ? '🏳️' : '🕊️', text: 'Guerra contra ' + f.name + ' termina: ' + (win ? 'vitória' : lose ? 'derrota' : 'armistício') });
  w.rel[c.id][f.id] = Math.min(100, (w.rel[c.id][f.id] || 0) + 15); w.rel[f.id][c.id] = w.rel[c.id][f.id];
  w.war = null;
  return text;
}
// Um turno de guerra. Retorna { text, ended }
function warTurn(c, w, actionId) {
  const war = w.war, f = w.byId[war.foe];
  const a = WAR_ACTIONS.find(x => x.id === actionId);
  war.years++;
  if (a.peace) {
    let out, txt;
    if (war.front > 25) { out = 'vitoria'; txt = 'Com a vantagem no campo, você impôs os termos da paz. O país ganha território, prestígio e reparações.'; }
    else if (war.front < -25) { out = 'derrota'; txt = 'Em posição de fraqueza, você aceitou concessões duras para encerrar a guerra.'; }
    else { out = 'empate'; txt = 'As partes aceitaram um armistício sem vencedores claros.'; }
    return { text: warEnd(c, w, out, txt), ended: true, outcome: out };
  }
  const myS = warStrength(c), foeS = warStrength(f);
  let R = myS / Math.max(1, foeS);
  if (a.weak && R < 1) R = Math.sqrt(R);          // guerrilha ajuda o mais fraco
  const push = a.push * 46 * (Math.log(R) * 1.1 + gauss(w) * 0.35) + (a.push > 0 ? 4 : 0) * (R > 1 ? 1 : -0.5);
  war.front = clamp(war.front + push, -100, 100);
  if (a.mob) c.mobil = Math.min(2, (c.mobil || 0) + a.mob);
  // custos
  const upkeep = 0.6 + 0.5 * (c.mobil || 0);
  E.debt(c, a.cost + upkeep);
  const cas = a.cas * (0.10 + 0.14 * Math.min(2.5, Math.max(0.5, 1 / R))) * (c.pop > 400 ? 0.5 : 1);
  E.pop(c, -cas);
  f.pop *= 1 - (0.05 + 0.09 * Math.min(2.5, R)) * (a.cas || 0.3) / 100;
  if (a.foeEcon) { f.gdpPc *= 1 - a.foeEcon / 100; c.gdpPc *= 1 - 0.2 / 100; }
  f.mil = Math.max(0, f.mil - 0.6 * a.push);
  c.fatigue = Math.min(100, (c.fatigue || 0) + a.fat * (c.mobil ? 1.2 : 1));
  c.shock.workers -= (c.mobil ? 3 : 1) + c.fatigue * 0.03; c.shock.youth -= 1 + c.fatigue * 0.03;
  c.shock.military += war.front > 0 ? 1.5 : -1;
  c.gdpPc *= 1 - (0.3 + 0.4 * (c.mobil || 0)) / 100;
  let text = `A frente ${push > 3 ? 'avançou' : push < -3 ? 'recuou' : 'ficou estável'} (${push >= 0 ? '+' : ''}${push.toFixed(0)}). ${cas > 0.25 ? 'As baixas foram pesadas.' : 'As baixas foram moderadas.'}`;
  if (war.front >= 100) return { text: warEnd(c, w, 'vitoria', text + ' O inimigo colapsou: vitória completa!'), ended: true, outcome: 'vitoria' };
  if (war.front <= -100) return { text: warEnd(c, w, 'derrota', text + ' O exército foi desbaratado: derrota.'), ended: true, outcome: 'derrota' };
  if (war.years >= 7) return { text: warEnd(c, w, 'empate', text + ' Após anos de desgaste, ambos aceitam um armistício.'), ended: true, outcome: 'empate' };
  return { text, ended: false };
}
// escolha automática (bots e IA)
function warAuto(c, w, level) {
  const info = warInfo(c, w);
  const R = info.R, front = info.front;
  if (front > 55 && level !== 'novato') return 'cessar';
  if (front < -40) return R > 0.9 ? 'defesa' : 'cessar';
  if (R > 1.5) return 'ofensiva';
  if (R > 1.0) return (c.mobil || 0) < 1 && level === 'expert' ? 'mobilizar' : 'ofensiva';
  if (R > 0.7) return 'guerrilha';
  return front > -15 ? 'defesa' : 'cessar';
}

// AI ataca o jogador?
function aggressionEvent(c, w) {
  if (w.war || w.year < START_YEAR + 3 || (w.lastWar && w.year - w.lastWar < 10)) return null;
  if (rnd(w) > 0.035 * (D(w).skill)) return null;
  const myS = warStrength(c);
  const cands = w.countries.filter(o => o.id !== c.id && o.ai.hawk > 0.55 && w.rel[c.id][o.id] < 55 && c.ag.indexOf(o.id) < 0 && warStrength(o) > myS * 0.9 && o.stab > 35);
  if (!cands.length) return null;
  const foe = pick(w, cands);
  return { foe, ev: {
    id: 'invasao', who: 'gen', icon: '🚨', title: foe.name + ' invade o país',
    text: `${foe.flag} ${foe.name} lançou um ataque surpresa na fronteira ${de(c)}. Suas forças são estimadas em ${(warStrength(foe) / myS * 100).toFixed(0)}% das nossas. O general exige uma decisão imediata.`,
    ch: [
      { t: 'Resistir: guerra defensiva', h: '🎖️+ 🙏+ · guerra · custo alto', do(c) { warStart(c, w, foe, 'defesa'); w.lastWar = w.year; return 'O país está em guerra. Cada ano exigirá decisões táticas.'; } },
      { t: 'Pedir mediação internacional', h: 'Pode evitar a guerra · influência −', do(c) { if (rnd(w) < 0.4 + c.influence / 250) { c.shock.military -= 3; return 'A pressão internacional forçou o recuo do agressor. Por enquanto.'; } warStart(c, w, foe, 'defesa'); w.lastWar = w.year; c.influence = Math.max(0, c.influence - 3); return 'A mediação fracassou e a guerra começou assim mesmo.'; } },
      { t: 'Ceder a região disputada', h: 'Paz · perde território · 🎖️−−', do(c) { E.pop(c, -0.8); E.gdp(c, -1.0); c.influence = Math.max(0, c.influence - 8); c.shock.military -= 12; c.shock.religious -= 5; w.lastWar = w.year; return 'A paz foi comprada com território e orgulho nacional.'; } },
    ] } };
}

// Conflitos entre IAs (abstratos)
function aiWars(w) {
  for (const a of w.countries) {
    if (a.id === w.playerId || a.mil < 50 || a.ai.hawk < 0.7 || rnd(w) > 0.012 * D(w).skill) continue;
    const foes = w.countries.filter(o => o.id !== a.id && o.id !== w.playerId && w.rel[a.id][o.id] < 50 && warStrength(o) < warStrength(a) * 0.9);
    if (!foes.length) continue;
    const f = pick(w, foes);
    const r = warStrength(a) / warStrength(f) * Math.exp(gauss(w) * 0.25);
    const win = r > 1;
    const [W, L] = win ? [a, f] : [f, a];
    L.gdpPc *= 0.97; L.pop *= 0.995; L.stab = Math.max(0, L.stab - 8); L.influence = Math.max(0, L.influence - 5); L.mil = Math.max(0, L.mil - 6);
    W.influence = Math.min(100, W.influence + 4); W.gdpPc *= 1.005; a.mil = Math.max(0, a.mil - 2);
    w.rel[a.id][f.id] = w.rel[f.id][a.id] = 15;
    w.log.push({ year: w.year, icon: '⚔️', text: `${a.name} e ${f.name} entram em guerra; ${W.name} vence.` });
  }
}

// Declarar guerra a outro país (jogador)
function warCheck(c, w, o) {
  if (w.war) return { ok: false, why: 'Já em guerra' };
  if (c.cp < 4) return { ok: false, why: 'Precisa de 4 capital político' };
  if (c.ag.indexOf(o.id) >= 0) return { ok: false, why: 'Há acordo comercial' };
  if (c.mil < 15) return { ok: false, why: 'Força militar insuficiente' };
  return { ok: true };
}
function declareWar(c, w, o) {
  const r = warCheck(c, w, o); if (!r.ok) return r;
  c.cp -= 4; c.shock.religious -= 2; c.influence = Math.max(0, c.influence - 3);
  warStart(c, w, o, 'ataque'); w.lastWar = w.year;
  return { ok: true };
}
