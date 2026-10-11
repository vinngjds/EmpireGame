'use strict';
// Eventos narrativos: cada escolha tem ônus e bônus ----------------------------

const E = {
  add(c, k, v) { c[k] = (k === 'infl' || k === 'debt') ? Math.max(k === 'infl' ? -2 : 0, c[k] + v) : clamp(c[k] + v, k === 'corr' ? 8 : 0, 100); },
  fac(c, f, v) { c.shock[f] += v; c.sat[f] = clamp(c.sat[f] + v * 0.6, 0, 100); },
  debt(c, v) { c.debt = Math.max(0, c.debt + v); },
  gdp(c, pct) { c.gdpPc *= 1 + pct / 100; c.gdp = c.pop * c.gdpPc; },
  pop(c, pct) { const k = 1 + pct / 100; c.young *= k; c.work *= k; c.old *= k; c.pop = c.young + c.work + c.old; c.gdp = c.pop * c.gdpPc; },
  cp(c, v) { c.cp = clamp(c.cp + v, 0, 12); },
};
const F = { workers: '👷', business: '💼', military: '🎖️', religious: '⛪', rural: '🌾', youth: '🎓' };

const EVENTS = [
  { id: 'greve', who: 'pol', icon: '✊', title: 'Greve geral paralisa o país', w: 1.2, cd: 5,
    when: c => c.sat.workers < 42 && c.jobs < 58,
    text: c => `Sindicatos ${de(c)} convocam uma greve geral. Fábricas, portos e transportes estão parados. "Presidente, precisamos de uma resposta hoje", diz o chefe de gabinete.`,
    ch: [
      { t: 'Negociar reajuste salarial', h: '👷+ 💼− · inflação +', do(c) { E.fac(c, 'workers', 9); E.fac(c, 'business', -6); E.add(c, 'infl', 1.2); return 'O acordo foi fechado em duas noites. Os trabalhadores voltam ao trabalho, e o empresariado reclama do custo.'; } },
      { t: 'Reprimir com a polícia', h: '🎖️+ · 👷− 🎓− · estabilidade em risco', do(c) { E.fac(c, 'military', 4); E.fac(c, 'workers', -12); E.fac(c, 'youth', -6); E.add(c, 'crime', 3); return 'A greve foi dispersa, mas as imagens da repressão correram o mundo.'; } },
      { t: 'Esperar o movimento esfriar', h: 'Economia sofre · 👷−', do(c) { E.gdp(c, -0.8); E.fac(c, 'workers', -4); return 'A greve durou semanas e custou caro à economia, sem solução de fundo.'; } },
    ] },
  { id: 'corrupcao', who: 'pol', icon: '📰', title: 'Escândalo de corrupção no governo', w: 1.3, cd: 4,
    when: c => c.corr > 50,
    text: c => `Uma investigação revela desvios bilionários em obras públicas ${de(c)}, envolvendo aliados próximos. A imprensa exige explicações.`,
    ch: [
      { t: 'Apoiar a investigação até o fim', h: 'Corrupção − · 💼− 🎖️− · capital político −', do(c) { E.add(c, 'corr', -6); E.fac(c, 'youth', 6); E.fac(c, 'business', -4); E.fac(c, 'military', -3); E.cp(c, -1); return 'Ministros caem, e o país vê as instituições funcionando, ainda que a custo político.'; } },
      { t: 'Abafar o caso', h: 'Estabilidade agora · corrupção + · 🎓−', do(c) { E.add(c, 'corr', 4); E.fac(c, 'youth', -8); E.fac(c, 'religious', -4); return 'O caso sumiu das manchetes por um tempo. Ninguém acredita que acabou.'; } },
      { t: 'Culpar a oposição', h: 'Divide o país · capital político +', do(c) { E.cp(c, 1); E.fac(c, 'youth', -4); E.fac(c, 'religious', 3); E.add(c, 'corr', 1); return 'Seus apoiadores fecham fileiras; os demais ficam ainda mais céticos.'; } },
    ] },
  { id: 'estudantes', who: 'soc', icon: '📢', title: 'Estudantes tomam as ruas', w: 1, cd: 5,
    when: c => c.sat.youth < 40,
    text: c => `Milhares de jovens protestam ${em(c)} por empregos, educação e um futuro melhor. As redes sociais amplificam cada passo.`,
    ch: [
      { t: 'Anunciar um pacote para a educação', h: 'Educação + · 🎓+ · dívida +', do(c) { E.add(c, 'edu', 2); E.debt(c, 1.5); E.fac(c, 'youth', 10); return 'Bolsas e novas vagas acalmam os ânimos, e o orçamento sente.'; } },
      { t: 'Dialogar sem prometer', h: '🎓 levemente +', do(c) { E.fac(c, 'youth', 3); return 'As conversas ajudaram a baixar a tensão, mas pouco mudou.'; } },
      { t: 'Reprimir os protestos', h: '🎓−− · 🎖️+ 🙏+', do(c) { E.fac(c, 'youth', -12); E.fac(c, 'military', 4); E.fac(c, 'religious', 3); E.add(c, 'crime', 2); return 'As ruas esvaziaram, mas o ressentimento ficou.'; } },
    ] },
  { id: 'petroleo', who: 'eco', icon: '🛢️', title: 'Grande reserva de recursos descoberta', w: 0.7, cd: 15,
    when: c => c.comm < 60 && c.tech > 30,
    text: c => `Geólogos confirmam uma imensa jazida ${em(c)}. A Ministra da Economia alerta: "Pode ser bênção ou maldição."`,
    ch: [
      { t: 'Explorar via empresa estatal', h: 'Receita + · corrupção + · dependência +', do(c) { E.add(c, 'comm', 12); E.add(c, 'corr', 3); E.gdp(c, 2); E.fac(c, 'military', 3); E.fac(c, 'business', -2); return 'Os royalties começam a entrar. Também crescem os apetites de quem manda nos contratos.'; } },
      { t: 'Licitar para multinacionais', h: 'Investimento + · tecnologia + · 🎖️−', do(c) { E.add(c, 'comm', 8); E.add(c, 'tech', 2); E.gdp(c, 2.5); E.fac(c, 'business', 5); E.fac(c, 'military', -4); E.fac(c, 'workers', -3); return 'Empresas globais trazem capital e know-how, levando boa parte do lucro.'; } },
      { t: 'Preservar e investir em diversificação', h: 'Dependência segura · 🎓+ · crescimento adiado', do(c) { E.add(c, 'pollution', -2); E.add(c, 'tech', 1.5); E.fac(c, 'youth', 6); E.fac(c, 'business', -4); return 'Você abriu mão do dinheiro fácil para evitar a armadilha das commodities.'; } },
    ] },
  { id: 'epidemia_local', who: 'soc', icon: '🦠', title: 'Surto de doença infecciosa', w: 1, cd: 6,
    when: c => c.health < 60,
    text: c => `Um surto de febre hemorrágica se espalha pelas periferias ${de(c)}. Os hospitais estão lotados.`,
    ch: [
      { t: 'Emergência sanitária nacional', h: 'Saúde + · dívida +', do(c) { E.add(c, 'health', 3); E.debt(c, 1.5); E.fac(c, 'workers', 4); E.fac(c, 'business', -2); return 'O surto foi contido em meses, graças a hospitais de campanha e vacinação.'; } },
      { t: 'Pedir ajuda internacional', h: 'Barato · influência −', do(c) { E.add(c, 'health', 1.5); E.add(c, 'influence', -2); E.fac(c, 'military', -3); return 'A ajuda chegou, mas o país depende cada vez mais de fora.'; } },
      { t: 'Minimizar a crise', h: 'Saúde − · pop −', do(c) { E.add(c, 'health', -3); E.pop(c, -0.15); E.fac(c, 'workers', -8); E.fac(c, 'youth', -5); return 'O surto virou epidemia. A pressão popular é forte.'; } },
    ] },
  { id: 'inflacao', who: 'eco', icon: '💸', title: 'Preços disparam', w: 1.4, cd: 4,
    when: c => c.infl > 12,
    text: c => `A inflação ${em(c)} já corrói salários: ${c.infl.toFixed(0)}% ao ano. Supermercados remarcam preços toda semana.`,
    ch: [
      { t: 'Apertar juros e cortar gastos', h: 'Inflação −− · crescimento − · 👷−', do(c) { E.add(c, 'infl', -5); E.gdp(c, -1.2); E.fac(c, 'workers', -6); E.fac(c, 'business', 3); c.rating = Math.min(100, c.rating + 4); return 'A dor foi grande, mas a moeda recuperou a confiança.'; } },
      { t: 'Congelar preços', h: 'Alívio imediato · escassez · 💼−', do(c) { E.add(c, 'infl', -2); E.fac(c, 'workers', 5); E.fac(c, 'business', -8); E.gdp(c, -0.5); return 'As prateleiras ficaram mais vazias. O problema só foi empurrado.'; } },
      { t: 'Ignorar e torcer', h: 'Inflação persiste', do(c) { E.add(c, 'infl', 2); E.fac(c, 'workers', -5); return 'Os preços continuaram subindo.'; } },
    ] },
  { id: 'fdi', who: 'eco', icon: '🏭', title: 'Gigante estrangeira quer instalar uma fábrica', w: 1, cd: 6,
    when: c => c.infra > 35 && c.edu > 35,
    text: c => `Uma multinacional de tecnologia oferece uma fábrica de alta tecnologia ${em(c)}, mas exige isenções fiscais.`,
    ch: [
      { t: 'Aceitar com isenção total', h: 'Empregos + · tecnologia + · receita −', do(c) { E.add(c, 'jobs', 5); E.add(c, 'tech', 2); E.gdp(c, 1); E.debt(c, 1); E.fac(c, 'business', 4); return 'A fábrica abriu 20 mil vagas. O fisco abriu mão de bilhões.'; } },
      { t: 'Exigir transferência de tecnologia', h: 'Tecnologia ++ · risco de recusa', do(c, w) { if (rnd(w) < 0.55) { E.add(c, 'tech', 5); E.add(c, 'jobs', 3); E.fac(c, 'youth', 4); return 'A empresa aceitou e treina engenheiros locais.'; } E.fac(c, 'business', -3); return 'A empresa levou o investimento para um vizinho.'; } },
      { t: 'Recusar', h: 'Nacionalistas satisfeitos', do(c) { E.fac(c, 'military', 3); E.fac(c, 'workers', 2); E.fac(c, 'business', -4); return 'A fábrica foi para outro país.'; } },
    ] },
  { id: 'fronteira', who: 'gen', icon: '🪖', title: 'Tensão na fronteira', w: 0.9, cd: 6,
    when: c => c.mil > 20,
    text: c => `Tropas de um vizinho avançam sobre uma região disputada na fronteira ${de(c)}. O general pede ordens.`,
    ch: [
      { t: 'Mobilizar as tropas', h: 'Prestígio + · 🎖️+ · dívida +', do(c, w) { E.debt(c, 1.5); E.fac(c, 'military', 8); E.fac(c, 'youth', -3); if (c.mil > 50 || rnd(w) < 0.5) { E.add(c, 'influence', 4); return 'A demonstração de força fez o vizinho recuar. O país ganha respeito.'; } E.add(c, 'influence', -3); return 'O confronto terminou em impasse e o país gastou muito.'; } },
      { t: 'Buscar mediação diplomática', h: 'Barato · 🎖️−', do(c) { E.add(c, 'influence', 2); E.fac(c, 'military', -4); E.fac(c, 'youth', 3); return 'Uma mesa de negociação evitou o pior.'; } },
      { t: 'Ceder a região', h: 'Paz · 🎖️−− 🙏−', do(c) { E.add(c, 'influence', -4); E.fac(c, 'military', -10); E.fac(c, 'religious', -5); return 'A paz foi mantida ao custo da honra nacional.'; } },
    ] },
  { id: 'golpe', who: 'gen', icon: '🚨', title: 'Movimentação suspeita nos quartéis', w: 2, cd: 10,
    when: c => c.sat.military < 28 && c.stab < 50,
    text: c => `O general Duarte sussurra: oficiais descontentes conspiram contra o governo ${de(c)}. "É agora ou nunca, presidente."`,
    ch: [
      { t: 'Aumentar o orçamento militar', h: 'Golpe evitado · dívida +', do(c) { c.sp.def = Math.min(10, c.sp.def + 0.8); E.fac(c, 'military', 14); E.fac(c, 'youth', -3); return 'Os oficiais foram aplacados com verbas e promoções.'; } },
      { t: 'Purgar os conspiradores', h: 'Arriscado · 🎖️−', do(c, w) { if (rnd(w) < 0.6) { E.fac(c, 'military', -6); E.add(c, 'crime', 0); E.fac(c, 'youth', 4); return 'A purga foi rápida e limpa. O alto-comando agora teme você.'; } E.add(c, 'infl', 3); c.stab = Math.max(0, c.stab - 20); E.fac(c, 'military', -12); return 'A purga deu errado e abalou o regime: o país está à beira do caos.'; } },
      { t: 'Ignorar os boatos', h: 'Risco alto', do(c, w) { if (rnd(w) < 0.4) { c.stab = Math.max(0, c.stab - 40); E.fac(c, 'military', -10); return 'Uma tentativa de golpe falhou por pouco. O país está em choque.'; } return 'Nada aconteceu... dessa vez.'; } },
    ] },
  { id: 'desastre', who: 'soc', icon: '🌊', title: 'Enchentes devastam o país', w: 1, cd: 6,
    when: c => c.infra < 70,
    text: c => `Chuvas torrenciais deixaram milhares de desabrigados ${em(c)}. Pontes e estradas foram destruídas.`,
    ch: [
      { t: 'Reconstrução em larga escala', h: 'Infraestrutura + · dívida +', do(c) { E.debt(c, 2.5); E.add(c, 'infra', 3); E.fac(c, 'workers', 4); E.fac(c, 'rural', 4); return 'A reconstrução veio com obras modernas e resilientes.'; } },
      { t: 'Ajuda emergencial mínima', h: 'Barato · 👷− 🌾−', do(c) { E.add(c, 'infra', -3); E.gdp(c, -0.8); E.fac(c, 'workers', -5); E.fac(c, 'rural', -6); return 'Os desabrigados sentiram o abandono do governo.'; } },
    ] },
  { id: 'internet', who: 'sci', icon: '🌐', title: 'A economia digital chega', w: 0.9, cd: 12,
    when: c => c.tech > 30 && c.edu > 40,
    text: c => `O Prof. Yuki traz dados: startups explodem ${em(c)}, mas a internet ainda é cara e precária fora das capitais.`,
    ch: [
      { t: 'Investir em banda larga nacional', h: 'Tecnologia + · dívida +', do(c) { E.debt(c, 2); E.add(c, 'tech', 4); E.add(c, 'infra', 2); E.gdp(c, 1); E.fac(c, 'youth', 6); E.fac(c, 'business', 3); return 'Escolas e vilas conectadas formam uma nova geração de empreendedores.'; } },
      { t: 'Deixar o mercado resolver', h: 'Barato · desigualdade +', do(c) { E.add(c, 'tech', 1.5); E.add(c, 'ineq', 2); E.fac(c, 'business', 3); return 'O setor privado cresce rápido nas cidades grandes; o interior fica para trás.'; } },
    ] },
  { id: 'boom_commod', who: 'eco', icon: '📈', title: 'Boom das commodities', w: 1, cd: 6,
    when: (c, w) => c.comm > 35 && w.commPrice > 125,
    text: c => `Os preços dos produtos de exportação ${de(c)} disparam, e o caixa do governo está cheio.`,
    ch: [
      { t: 'Poupar em um fundo soberano', h: 'Dívida − · rating + · populares frustrados', do(c) { E.debt(c, -6); c.rating = Math.min(100, c.rating + 5); E.fac(c, 'workers', -2); return 'Você guardou para os tempos difíceis.'; } },
      { t: 'Distribuir benefícios', h: '👷+ 🌾+ · dívida estável · dependência +', do(c) { E.fac(c, 'workers', 8); E.fac(c, 'rural', 6); E.add(c, 'comm', 3); E.add(c, 'ineq', -2); return 'Os cidadãos adoraram. A conta chega depois.'; } },
      { t: 'Investir em infraestrutura', h: 'Infraestrutura + · 💼+', do(c) { E.add(c, 'infra', 4); E.fac(c, 'business', 5); return 'Obras bem planejadas aproveitaram a janela de dinheiro.'; } },
    ] },
  { id: 'queda_commod', who: 'eco', icon: '📉', title: 'Queda nos preços das commodities', w: 1, cd: 6,
    when: (c, w) => c.comm > 35 && w.commPrice < 80,
    text: c => `O preço dos produtos que ${c.name} exporta despencou. A arrecadação cai e o câmbio balança.`,
    ch: [
      { t: 'Cortar despesas', h: 'Dívida estável · 👷−', do(c) { E.debt(c, -1); E.fac(c, 'workers', -6); E.fac(c, 'business', 2); E.gdp(c, -0.5); return 'Cortes duros equilibraram as contas.'; } },
      { t: 'Emitir dívida', h: 'Suaviza a crise · dívida ++', do(c) { E.debt(c, 5); E.gdp(c, 0.8); return 'Você comprou tempo com dinheiro emprestado.'; } },
      { t: 'Acelerar a diversificação', h: 'Dívida + · tecnologia + · comm −', do(c) { E.debt(c, 2); E.add(c, 'comm', -5); E.add(c, 'tech', 2); E.fac(c, 'business', 2); return 'A crise virou impulso para uma economia menos dependente.'; } },
    ] },
  { id: 'fuga_cerebros', who: 'sci', icon: '🧳', title: 'Fuga de cérebros', w: 1, cd: 8,
    when: c => c.edu > 50 && c.gdpPc < 12,
    text: c => `Médicos, engenheiros e cientistas ${de(c)} estão partindo em massa para países ricos.`,
    ch: [
      { t: 'Bônus salarial e laboratórios', h: 'Tecnologia + · dívida +', do(c) { E.debt(c, 1.5); E.add(c, 'tech', 2); E.fac(c, 'youth', 4); return 'Parte dos talentos decidiu ficar.'; } },
      { t: 'Deixar partir (remessas)', h: 'Tecnologia − · 💼+', do(c) { E.add(c, 'tech', -2); E.add(c, 'edu', -1); E.gdp(c, 0.5); E.fac(c, 'youth', -5); return 'As remessas enviadas por quem foi embora ajudam, mas o país perde talento.'; } },
    ] },
  { id: 'crime_org', who: 'gen', icon: '🔫', title: 'Facções criminosas dominam bairros', w: 1.2, cd: 5,
    when: c => c.crime > 55,
    text: c => `A criminalidade ${em(c)} atingiu níveis alarmantes: facções controlam comunidades inteiras.`,
    ch: [
      { t: 'Ofensiva policial-militar', h: 'Crime −− · 🎓− · dívida +', do(c) { E.add(c, 'crime', -9); E.debt(c, 1); E.fac(c, 'military', 5); E.fac(c, 'religious', 5); E.fac(c, 'youth', -6); return 'As operações reduziram a violência, com denúncias de abusos.'; } },
      { t: 'Programas sociais nas comunidades', h: 'Crime − (lento) · 👷+ 🎓+', do(c) { E.add(c, 'crime', -4); E.add(c, 'ineq', -2); E.debt(c, 1.2); E.fac(c, 'workers', 5); E.fac(c, 'youth', 5); return 'Escolas e quadras tomaram o lugar do medo, devagar.'; } },
      { t: 'Negociar uma trégua', h: 'Paz frágil · corrupção +', do(c) { E.add(c, 'crime', -3); E.add(c, 'corr', 4); E.fac(c, 'religious', -5); return 'A violência baixou, e a reputação do Estado também.'; } },
    ] },
  { id: 'clima_ong', who: 'sci', icon: '🌍', title: 'Pressão ambiental internacional', w: 0.9, cd: 8,
    when: c => c.pollution > 55,
    text: c => `Relatórios internacionais apontam ${c.name} entre os maiores poluidores da região. Investidores e jovens cobram metas.`,
    ch: [
      { t: 'Metas ambientais rígidas', h: 'Poluição − · 🎓+ · 💼−', do(c) { E.add(c, 'pollution', -10); E.gdp(c, -0.4); E.fac(c, 'youth', 8); E.fac(c, 'business', -5); return 'A indústria reclamou, mas o ar ficou respirável.'; } },
      { t: 'Metas voluntárias', h: 'Meio-termo', do(c) { E.add(c, 'pollution', -3); E.fac(c, 'youth', 2); return 'Compromissos suaves, resultados modestos.'; } },
      { t: 'Ignorar', h: '🎓− · saúde −', do(c) { E.add(c, 'health', -1.5); E.fac(c, 'youth', -6); return 'A poluição segue cobrando seu preço.'; } },
    ] },
  { id: 'previdencia', who: 'eco', icon: '👴', title: 'Previdência sob pressão', w: 1.2, cd: 6,
    when: c => c.old / c.pop > 0.1 && c.lastBudget && c.lastBudget.balance < -1.5,
    text: c => `Com ${(c.old / c.pop * 100).toFixed(0)}% de idosos, a previdência ${de(c)} consome parte cada vez maior do orçamento.`,
    ch: [
      { t: 'Reformar a previdência', h: 'Gasto − · 👷−− 💼+', do(c) { c.pensionMod = Math.max(0.5, c.pensionMod - 0.15); E.fac(c, 'workers', -10); E.fac(c, 'business', 5); return 'A reforma passou no Congresso após meses de protestos.'; } },
      { t: 'Aumentar impostos sobre a folha', h: 'Receita + · 💼−', do(c) { c.tax = Math.min(48, c.tax + 1.5); E.fac(c, 'business', -6); E.fac(c, 'workers', -2); return 'A conta fechou por ora, com um custo maior sobre o trabalho.'; } },
      { t: 'Adiar o problema', h: 'Dívida +', do(c) { E.debt(c, 2.5); E.fac(c, 'workers', 2); return 'Você empurrou o problema para o próximo governo.'; } },
    ] },
  { id: 'olimpiada', who: 'pol', icon: '🏟️', title: 'Convite para sediar um megaevento', w: 0.6, cd: 20,
    when: c => c.gdpPc > 4 && c.rank <= 14,
    text: c => `${c.name} recebe o convite para sediar um grande evento esportivo mundial. Prestígio e turismo, mas obras caríssimas.`,
    ch: [
      { t: 'Aceitar o desafio', h: 'Influência ++ · dívida ++ · infra +', do(c, w) { E.debt(c, 4); E.add(c, 'influence', 8); E.add(c, 'infra', 3); E.fac(c, 'military', 3); E.fac(c, 'business', 4); if (rnd(w) < 0.3) { E.add(c, 'corr', 4); E.fac(c, 'youth', -5); return 'O evento foi um sucesso... e uma CPI revelou superfaturamento nas obras.'; } return 'O mundo olhou para o país com admiração.'; } },
      { t: 'Recusar', h: 'Sem custo', do(c) { return 'O dinheiro foi para outras prioridades.'; } },
    ] },
  { id: 'refugiados', who: 'soc', icon: '🧑‍🤝‍🧑', title: 'Onda de refugiados', w: 0.8, cd: 10,
    when: c => c.stab > 40,
    text: c => `Uma guerra no país vizinho empurra milhares de refugiados para as fronteiras ${de(c)}.`,
    ch: [
      { t: 'Acolher e integrar', h: 'Mão de obra + · custo · 🙏− 👷−', do(c) { E.pop(c, 0.4); E.debt(c, 1.2); E.add(c, 'influence', 3); E.fac(c, 'religious', -4); E.fac(c, 'workers', -4); E.fac(c, 'youth', 4); return 'O país ganhou gente trabalhadora e novos desafios de integração.'; } },
      { t: 'Fechar as fronteiras', h: '🙏+ 🎖️+ · influência −', do(c) { E.add(c, 'influence', -3); E.fac(c, 'religious', 5); E.fac(c, 'military', 4); E.fac(c, 'youth', -4); return 'A fronteira foi selada.'; } },
    ] },
  { id: 'seca', who: 'eco', icon: '☀️', title: 'Seca severa castiga o campo', w: 1, cd: 6,
    when: c => c.agro > 6,
    text: c => `A pior estiagem em décadas atinge a agricultura ${de(c)}. Colheitas perdidas e preços de alimentos em alta.`,
    ch: [
      { t: 'Socorrer os produtores', h: '🌾+ · dívida +', do(c) { E.debt(c, 1.5); E.fac(c, 'rural', 8); E.add(c, 'infl', 0.5); return 'Crédito emergencial manteve as fazendas de pé.'; } },
      { t: 'Importar alimentos', h: 'Preços estáveis · 🌾−', do(c) { E.fac(c, 'rural', -6); E.fac(c, 'workers', 3); E.debt(c, 1); return 'A mesa dos cidadãos foi garantida, o campo ficou ressentido.'; } },
      { t: 'Investir em irrigação', h: 'Infra + · dívida +', do(c) { E.debt(c, 2.5); E.add(c, 'infra', 2.5); E.fac(c, 'rural', 5); return 'Canais e reservatórios reduzem a vulnerabilidade futura.'; } },
    ] },
  { id: 'separatismo', who: 'gen', icon: '🏴', title: 'Movimento separatista cresce', w: 1, cd: 10,
    when: c => c.stab < 45 && c.ineq > 45,
    text: c => `Uma região pobre ${de(c)} exige autonomia e ameaça se separar.`,
    ch: [
      { t: 'Oferecer autonomia e investimentos', h: 'Estabilidade + · dívida +', do(c) { E.debt(c, 2); E.add(c, 'ineq', -2); E.fac(c, 'military', -4); c.stab = Math.min(100, c.stab + 6); return 'As lideranças regionais aceitaram o acordo.'; } },
      { t: 'Impor ordem pela força', h: '🎖️+ · crime + · 🎓−', do(c) { E.fac(c, 'military', 8); E.fac(c, 'youth', -8); E.add(c, 'crime', 4); return 'A revolta foi contida à força, e o ressentimento ficou.'; } },
    ] },
  { id: 'turismo', who: 'eco', icon: '🏖️', title: 'Boom do turismo', w: 0.7, cd: 10,
    when: c => c.infra > 40 && c.stab > 55,
    text: c => `${c.name} virou a moda entre os viajantes do mundo. Hotéis lotados e pedidos por mais voos.`,
    ch: [
      { t: 'Investir em aeroportos e hotéis', h: 'Crescimento + · dívida +', do(c) { E.debt(c, 1.5); E.gdp(c, 1.4); E.add(c, 'infra', 1.5); E.add(c, 'pollution', 1); E.fac(c, 'business', 4); return 'O turismo virou um novo pilar da economia.'; } },
      { t: 'Limitar o turismo para preservar', h: 'Meio ambiente + · crescimento −', do(c) { E.add(c, 'pollution', -2); E.fac(c, 'youth', 3); E.fac(c, 'business', -3); return 'Você escolheu o equilíbrio ao crescimento rápido.'; } },
    ] },
  { id: 'eleicoes_alerta', who: 'pol', icon: '🗳️', title: 'Pesquisas apontam eleições apertadas', w: 3, cd: 4,
    when: (c, w) => (w.turn + 1) % TERM === 0 && c.approval < 54,
    text: c => `As eleições se aproximam e a aprovação do governo ${em(c)} está em ${c.approval.toFixed(0)}%. O chefe de gabinete quer ações imediatas.`,
    ch: [
      { t: 'Lançar pacote de bondades', h: 'Aprovação ++ · dívida ++', do(c) { E.debt(c, 3.5); for (const f of ['workers', 'rural', 'youth']) E.fac(c, f, 6); E.add(c, 'infl', 0.8); return 'O pacote encheu as ruas de otimismo.'; } },
      { t: 'Apostar na boa gestão', h: 'Sem efeitos', do(c) { return 'Você confia que os resultados falem por si.'; } },
      { t: 'Campanha de comunicação', h: 'Aprovação + · custo baixo', do(c) { for (const f of FACTIONS) E.fac(c, f.id, 2.5); E.debt(c, 0.5); return 'A campanha melhorou a imagem do governo.'; } },
    ] },
];

// Choques globais: eventos que o jogador precisa tratar
const GLOBAL_EVENTS = {
  crise_fin: { who: 'eco', icon: '📉', title: 'Crise financeira global', ch: [
    { t: 'Pacote de estímulo', h: 'Suaviza a recessão · dívida +', do(c) { E.gdp(c, 1.5); E.debt(c, 6); E.fac(c, 'workers', 4); E.fac(c, 'business', 3); c.rating = Math.max(0, c.rating - 3); return 'O governo injetou dinheiro na economia para amortecer a crise.'; } },
    { t: 'Austeridade', h: 'Contas em ordem · 👷−', do(c) { E.debt(c, -2); E.gdp(c, -1.5); E.fac(c, 'workers', -8); E.fac(c, 'business', 2); c.rating = Math.min(100, c.rating + 3); return 'Cortes profundos acalmaram os mercados e apertaram o povo.'; } },
    { t: 'Recorrer ao FMI', h: 'Crédito + · capital político −', do(c) { E.debt(c, 3); E.gdp(c, -0.5); c.rating = Math.min(100, c.rating + 2); E.fac(c, 'workers', -4); E.cp(c, -1); return 'O empréstimo veio com condicionalidades duras.'; } },
  ] },
  pandemia: { who: 'soc', icon: '🦠', title: 'Pandemia global', ch: [
    { t: 'Lockdown rígido', h: 'Vidas + · economia −−', do(c) { E.gdp(c, -2.5); E.add(c, 'health', 2); E.fac(c, 'business', -5); E.fac(c, 'youth', 2); return 'As ruas esvaziaram, e o número de mortes foi menor.'; } },
    { t: 'Imunidade de rebanho', h: 'Economia preservada · mortes ++', do(c) { E.pop(c, -0.5); E.add(c, 'health', -5); E.fac(c, 'workers', -6); E.fac(c, 'religious', 2); return 'A vida seguiu, ao custo de muitos mortos.'; } },
    { t: 'Vacinação em massa e testes', h: 'Saúde + · tecnologia + · dívida +', do(c) { E.debt(c, 3); E.add(c, 'health', 3); E.add(c, 'tech', 1); E.gdp(c, -1); E.fac(c, 'workers', 4); return 'A campanha de vacinação foi um sucesso logístico.'; } },
  ] },
  crise_energia: { who: 'eco', icon: '⛽', title: 'Crise energética', ch: [
    { t: 'Subsidiar combustíveis', h: 'Inflação − · dívida +', do(c) { E.debt(c, 4); E.add(c, 'infl', -1.5); E.fac(c, 'rural', 4); E.fac(c, 'business', 3); return 'O bolso do cidadão foi poupado, o do Tesouro não.'; } },
    { t: 'Deixar o mercado ajustar', h: 'Inflação + · 👷−', do(c) { E.add(c, 'infl', 2); E.fac(c, 'workers', -6); E.add(c, 'pollution', -1); return 'Os preços subiram e a economia se ajustou na marra.'; } },
    { t: 'Acelerar energias renováveis', h: 'Infra + · poluição − · dívida +', do(c) { E.debt(c, 3); E.add(c, 'infra', 2); E.add(c, 'pollution', -4); E.fac(c, 'youth', 6); return 'A crise virou oportunidade para a transição energética.'; } },
  ] },
  crise_clima: { who: 'sci', icon: '🌪️', title: 'Crise climática', ch: [
    { t: 'Plano nacional de adaptação', h: 'Infra + · dívida +', do(c) { E.debt(c, 4); E.add(c, 'infra', 3); E.add(c, 'pollution', -2); E.fac(c, 'rural', 4); E.fac(c, 'youth', 4); return 'Defesas contra enchentes e secas protegem as colheitas.'; } },
    { t: 'Ajuda emergencial', h: 'Alívio · dívida +', do(c) { E.debt(c, 2); E.fac(c, 'rural', 5); return 'O socorro foi suficiente por agora.'; } },
    { t: 'Ignorar', h: 'Economia −', do(c) { E.gdp(c, -1.5); E.fac(c, 'rural', -8); E.add(c, 'health', -3); return 'Os prejuízos se acumularam.'; } },
  ] },
  revolucao_ia: { who: 'sci', icon: '🤖', title: 'Revolução da inteligência artificial', ch: [
    { t: 'Investir em educação digital', h: 'Tecnologia ++ · dívida +', do(c) { E.debt(c, 3); E.add(c, 'tech', 4); E.add(c, 'edu', 3); E.fac(c, 'youth', 6); E.fac(c, 'workers', -3); return 'A nova geração aprende a trabalhar com a IA.'; } },
    { t: 'Deixar o mercado agir', h: 'Tecnologia + · empregos −', do(c) { E.add(c, 'tech', 2); E.add(c, 'jobs', -5); E.fac(c, 'workers', -6); E.fac(c, 'business', 5); return 'Empresas ganham produtividade e trabalhadores perdem postos.'; } },
    { t: 'Regular rigidamente', h: 'Empregos + · tecnologia −', do(c) { E.add(c, 'tech', -1); E.add(c, 'jobs', 2); E.fac(c, 'workers', 4); E.fac(c, 'business', -5); return 'As regras protegem empregos, mas travam a inovação.'; } },
  ] },
};

function drawEvents(c, w, max) {
  const out = [];
  const cand = EVENTS.filter(e => e.when(c, w) && (w.year - (w.evCd[e.id] || -99)) >= e.cd);
  while (out.length < max && cand.length) {
    let tot = 0; for (const e of cand) tot += e.w;
    let r = rnd(w) * tot * 1.6;
    let sel = null;
    for (const e of cand) { r -= e.w; if (r <= 0) { sel = e; break; } }
    if (!sel) break;
    out.push(sel); cand.splice(cand.indexOf(sel), 1); w.evCd[sel.id] = w.year;
  }
  return out;
}
