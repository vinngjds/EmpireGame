'use strict';
// Controlador: turnos, relatório anual (jornal), conselheiros, fim de jogo, salvar/carregar

const SAVE_KEY = 'nacao_em_ascensao_save_v1';

const Game = {
  w: null,
  get me() { return this.w.byId[this.w.playerId]; },

  start(id, seed) {
    this.w = makeWorld(id, seed || ((Math.random() * 1e9) | 0));
    const c = this.me;
    c.cp = 8;
    this.w.news = [];
    this.w.stats0 = { gdp: c.pop * c.gdpPc, pop: c.pop, rank: c.rank };
    return this.briefing();
  },

  // desafios principais do país no início
  briefing() {
    const c = this.me;
    const issues = [];
    const add = (score, who, text) => issues.push({ score, who, text });
    add((c.corr - 40) / 4, 'pol', `A corrupção está em ${c.corr.toFixed(0)}/100 e drena o orçamento.`);
    add((50 - c.edu) / 3, 'soc', `A educação (${c.edu.toFixed(0)}) limita a produtividade e mantém a natalidade alta.`);
    add((50 - c.health) / 3, 'soc', `A saúde (${c.health.toFixed(0)}) é frágil: a mortalidade e as doenças pesam sobre a economia.`);
    add((50 - c.infra) / 3, 'eco', `A infraestrutura (${c.infra.toFixed(0)}) trava o crescimento e eleva custos.`);
    add((50 - c.tech) / 3, 'sci', `A tecnologia (${c.tech.toFixed(0)}) está distante da fronteira mundial.`);
    add((c.ineq - 45) / 3, 'soc', `A desigualdade é alta (${c.ineq.toFixed(0)}) e alimenta tensões sociais.`);
    add((c.comm - 50) / 3, 'eco', `A economia depende de commodities (${c.comm.toFixed(0)}%), vulnerável a oscilações de preço.`);
    add((c.birth - 28) / 3, 'soc', `A natalidade é alta (${c.birth.toFixed(0)}‰): muitos jovens para educar e empregar.`);
    add((14 - c.birth) / 2, 'eco', `A natalidade baixa (${c.birth.toFixed(0)}‰) anuncia o envelhecimento.`);
    add((c.debt - 70) / 8, 'eco', `A dívida pública é elevada (${c.debt.toFixed(0)}% do PIB).`);
    add((c.infl - 8) / 3, 'eco', `A inflação (${c.infl.toFixed(0)}%) corrói a renda das famílias.`);
    add((c.crime - 55) / 4, 'gen', `A violência está alta (${c.crime.toFixed(0)}/100).`);
    issues.sort((a, b) => b.score - a.score);
    return { blurb: c.blurb, issues: issues.slice(0, 3).filter(i => i.score > -2), goal: c.goal };
  },

  // conselheiros ---------------------------------------------------------------
  advise() {
    const c = this.me, w = this.w, b = c.lastBudget || budget(c, w);
    const tips = [];
    const add = (p, who, text) => tips.push({ p, who, text });
    if (b.balance < -3) add(9, 'eco', `O déficit está em ${(-b.balance).toFixed(1)}% do PIB. Juros e dívida vão pesar: corte gastos ou aumente a arrecadação.`);
    if (c.infl > 10) add(8, 'eco', `A inflação de ${c.infl.toFixed(0)}% corrói salários. Déficits altos alimentam preços.`);
    if (c.debt > 90) add(7, 'eco', `A dívida chegou a ${c.debt.toFixed(0)}% do PIB e o rating cai. Os juros já consomem ${b.interest.toFixed(1)}% do PIB.`);
    if (c.old / c.pop > 0.12 && b.pens > 5) add(6, 'eco', `A previdência já custa ${b.pens.toFixed(1)}% do PIB e vai crescer com o envelhecimento. Uma reforma custa caro politicamente, mas custa mais esperar.`);
    for (const f of FACTIONS) if (c.sat[f.id] < 32) add(8, 'pol', `${f.icon} ${f.name} estão em ${c.sat[f.id].toFixed(0)}% de satisfação — perigosamente baixo. ${f.desc}`);
    if ((w.turn + 1) % TERM === 0 && c.approval < 54) add(9, 'pol', `Há eleição no próximo ano e a aprovação é só ${c.approval.toFixed(0)}%. Precisamos de resultados visíveis.`);
    if (c.health < 50) add(6, 'soc', `A saúde (${c.health.toFixed(0)}) está abaixo do necessário. Saneamento e atenção básica são o melhor retorno.`);
    if (c.edu < 50) add(6, 'soc', `Educação em ${c.edu.toFixed(0)}: é o investimento mais lento e o que mais rende. Comece cedo.`);
    if (c.crime > 60) add(6, 'gen', `A criminalidade (${c.crime.toFixed(0)}) ameaça a ordem. Polícia e prevenção social ajudam; só repressão desgasta.`);
    if (c.sat.military < 40 || c.mil < 35) add(5, 'gen', `As Forças Armadas estão enfraquecidas (${c.mil.toFixed(0)}). Um país sem dissuasão atrai problemas.`);
    if (c.tech < 45) add(5, 'sci', `A tecnologia (${c.tech.toFixed(0)}) está distante da fronteira. P&D e abertura comercial aceleram o alcance.`);
    if (c.corr > 55) add(5, 'pol', `A corrupção (${c.corr.toFixed(0)}) reduz a eficiência de cada real gasto.`);
    if (c.pollution > 65) add(4, 'sci', `A poluição (${c.pollution.toFixed(0)}) já machuca a saúde e a imagem do país.`);
    if (c.birth < 11 && c.old / c.pop > 0.15) add(5, 'eco', `A população envelhece (${(c.old / c.pop * 100).toFixed(0)}% de idosos) e a força de trabalho encolhe. Produtividade e imigração viram prioridade.`);
    if (c.birth > 30) add(4, 'soc', `Natalidade de ${c.birth.toFixed(0)}‰: muitos jovens. Sem empregos e escolas, o dividendo vira desemprego.`);
    if (b.balance > 1 && c.debt < 60) add(3, 'eco', `As contas estão saudáveis. É um bom momento para investir em educação, infraestrutura ou ciência.`);
    if (!tips.length) add(1, 'pol', `Tudo sob controle, presidente. Mantenha o rumo e olhe o ranking dos rivais.`);
    tips.sort((a, b) => b.p - a.p);
    const seen = new Set(), out = [];
    for (const t of tips) { if (seen.has(t.who)) continue; seen.add(t.who); out.push(t); if (out.length === 3) break; }
    return out;
  },

  // um ano ------------------------------------------------------------------------
  nextYear() {
    const w = this.w, c = this.me;
    const prev = { gdp: c.pop * c.gdpPc, pop: c.pop, approval: c.approval, rank: c.rank, infl: c.infl, debt: c.debt, tech: c.tech, edu: c.edu, health: c.health, power: c.power };
    const prevRanks = {}; for (const o of w.countries) prevRanks[o.id] = o.rank;
    const events = stepWorld(w);
    const bullets = [];
    const gg = c.g;
    // manchete
    let head = { icon: '📰', text: `${c.name} fecha ${w.year - 1} sem grandes sobressaltos.` };
    if (w.shock && w.shock.left >= (SHOCKS[w.shock.type].years - 1) && events.length) { const d = SHOCKS[w.shock.type]; head = { icon: d.icon, text: d.name + ' atinge o mundo.' }; }
    else if (gg < -1) head = { icon: '📉', text: `Recessão: a economia ${de(c)} encolhe ${Math.abs(gg).toFixed(1)}%.` };
    else if (gg > 6) head = { icon: '🚀', text: `Boom: ${c.name} cresce ${gg.toFixed(1)}% e surpreende o mundo.` };
    else if (c.infl > 15) head = { icon: '💸', text: `Inflação de ${c.infl.toFixed(0)}% aperta o bolso dos cidadãos.` };
    else if (c.rank < prev.rank) head = { icon: '🏅', text: `${c.name} sobe para a ${c.rank}ª posição entre as potências.` };
    else if (c.rank > prev.rank) head = { icon: '⚠️', text: `${c.name} cai para a ${c.rank}ª posição no ranking de poder.` };
    else if (c.approval > prev.approval + 4) head = { icon: '👏', text: `Aprovação do governo sobe para ${c.approval.toFixed(0)}%.` };
    // notícias do mundo
    for (const o of w.countries) {
      if (o.id === c.id) continue;
      if (o.rank < prevRanks[o.id] && o.rank <= 5 && prevRanks[o.id] > 5) bullets.push(`🌍 ${o.flag} ${o.name} entra no Top 5 das potências.`);
    }
    const top = w.rankList[0];
    if (top.id !== (this._lastTop || top.id)) bullets.push(`👑 ${top.flag} ${top.name} assume a liderança mundial.`);
    this._lastTop = top.id;
    const gr = w.countries.slice().sort((a, b) => b.gdpRank - a.gdpRank);
    if (w.turn % 5 === 0) bullets.push(`📊 Maiores economias: ${w.countries.slice().sort((a, b) => a.gdpRank - b.gdpRank).slice(0, 3).map(o => o.flag + ' ' + o.name).join(', ')}.`);
    const stats = [
      { k: 'PIB', v: c.pop * c.gdpPc, d: (c.pop * c.gdpPc) / prev.gdp * 100 - 100, f: 'gdp' },
      { k: 'População', v: c.pop, d: c.pop / prev.pop * 100 - 100, f: 'pop' },
      { k: 'Aprovação', v: c.approval, d: c.approval - prev.approval, f: 'pct' },
      { k: 'Inflação', v: c.infl, d: c.infl - prev.infl, f: 'pct', inv: true },
      { k: 'Dívida/PIB', v: c.debt, d: c.debt - prev.debt, f: 'pct', inv: true },
      { k: 'Ranking', v: c.rank, d: prev.rank - c.rank, f: 'rank' },
    ];
    // eleição
    let election = null;
    if (electionYear(w)) { election = runElection(c, w); election.year = w.year; }
    // eventos
    const pending = [];
    for (const e of events) if (e.kind === 'global') { const g = GLOBAL_EVENTS[e.type]; pending.push({ id: 'g_' + e.type, who: g.who, icon: g.icon, title: g.title, text: SHOCKS[e.type].text + ` Como ${c.name} deve reagir?`, ch: g.ch }); }
    for (const e of drawEvents(c, w, 2)) pending.push({ id: e.id, who: e.who, icon: e.icon, title: e.title, text: e.text(c, w), ch: e.ch });
    this.w.log.push({ year: w.year, icon: head.icon, text: head.text });
    return { year: w.year, head, bullets, stats, election, pending, tips: this.advise() };
  },

  choose(ev, i) {
    const c = this.me, w = this.w;
    const res = ev.ch[i].do(c, w);
    recalcStance(c); computeSat(c, w); updateRanks(w);
    this.w.log.push({ year: w.year, icon: ev.icon, text: ev.title + ' → ' + ev.ch[i].t });
    return res;
  },

  end() {
    const w = this.w, c = this.me;
    const r = checkEnd(w);
    return r;
  },

  summary(r, election) {
    const c = this.me, w = this.w;
    let title, text;
    if (election && !election.won) { title = 'Derrota nas urnas'; text = `Com ${election.vote.toFixed(0)}% dos votos, você perdeu a eleição de ${election.year}. A oposição assume o governo e o seu projeto de nação termina aqui.`; }
    else if (r && r.why === 'goal') { title = 'Potência mundial!'; text = `${c.name} alcançou a ${c.rank}ª posição e se manteve entre as ${c.goal} maiores potências por ${WIN_STREAK} anos seguidos. Seu governo entra para a história.`; }
    else if (r && r.why === 'colapso') { title = 'Colapso do Estado'; text = `A estabilidade desmoronou. Greves, revoltas e crise institucional derrubaram o governo ${de(c)}.`; }
    else if (r && r.why === 'falencia') { title = 'Bancarrota'; text = `A dívida chegou a ${c.debt.toFixed(0)}% do PIB. Os credores tomaram o controle da economia.`; }
    else { title = r && r.win ? 'Meta alcançada' : `${tierOf(c.rank)} em 2050`; text = `Em ${END_YEAR}, ${c.name} termina na ${c.rank}ª posição (${tierOf(c.rank)}). ${c.rank <= c.goal ? 'Você cumpriu a meta.' : 'A meta era o Top ' + c.goal + '.'}`; }
    return { title, text, win: !!(r && r.win) };
  },

  // salvar/carregar -----------------------------------------------------------------
  save() {
    try {
      const s = JSON.stringify(this.w, (k, v) => (k === 'byId' || k === 'rankList' ? undefined : v));
      localStorage.setItem(SAVE_KEY, s);
    } catch (e) { /* ignore */ }
  },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  load() {
    try {
      const w = JSON.parse(localStorage.getItem(SAVE_KEY));
      w.byId = {}; for (const c of w.countries) w.byId[c.id] = c;
      this.w = w; updateRanks(w);
      return true;
    } catch (e) { return false; }
  },
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
};
