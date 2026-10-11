'use strict';
// Menus, configuração de partida, campanha, tutorial e laço principal

const AI_NAMES = ['Aelfric', 'Brunhilda', 'Cassian', 'Dagmar', 'Eirik', 'Fiora', 'Godric', 'Helena', 'Ivar', 'Jorah', 'Katarina', 'Leif', 'Mirela', 'Njal', 'Octavia', 'Pelagius'];

let session = null; // { game, renderer, ui, raf }

const $ = s => document.querySelector(s);
const civOptions = (sel, withRandom) => (withRandom ? '<option value="random">🎲 Aleatória</option>' : '') + Object.values(CIVS).map(c => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + c.flag + ' ' + c.name + '</option>').join('');

// ---------------------------------------------------------------------------
// Campanha
// ---------------------------------------------------------------------------
const CAMPAIGN = [
  { id: 1, title: 'Capítulo 1 — A Primeira Aldeia', intro: 'Após anos de peregrinação, seu povo encontra um vale fértil. Construa casas, colha o alimento e proteja sua nova aldeia de um vizinho hostil.',
    goal: 'Destrua o assentamento rival.', civ: 'britons',
    settings: { mapType: 'arabia', mapSize: 'tiny', mode: 'conquest', startRes: 'standard', players: [{ human: true, team: 1 }, { ai: 'easy', civ: 'franks', team: 2 }] } },
  { id: 2, title: 'Capítulo 2 — Aliança de Ferro', intro: 'Um reino vizinho oferece uma aliança contra os invasores. Lutem lado a lado: a economia dele é forte, mas as tropas precisam de apoio.',
    goal: 'Derrote ambos os impérios inimigos com seu aliado.', civ: 'franks',
    settings: { mapType: 'lagos', mapSize: 'small', mode: 'conquest', startRes: 'standard', players: [{ human: true, team: 1 }, { ai: 'moderate', civ: 'britons', team: 1 }, { ai: 'moderate', civ: 'mongols', team: 2 }, { ai: 'easy', civ: 'goths', team: 2 }] } },
  { id: 3, title: 'Capítulo 3 — A Queda do Rei', intro: 'A guerra é decidida pela coroa. Proteja seu rei a todo custo e capture o do inimigo antes que o seu seja morto.',
    goal: 'Regicida: mate o rei inimigo.', civ: 'mongols',
    settings: { mapType: 'continental', mapSize: 'small', mode: 'regicide', startRes: 'medium', startAge: 1, players: [{ human: true, team: 1 }, { ai: 'hard', civ: 'persians', team: 2 }, { ai: 'moderate', civ: 'turks', team: 2 }] } },
  { id: 4, title: 'Capítulo 4 — O Império Final', intro: 'Todas as potências se voltam contra você e seu último aliado. Evolua até a Idade Imperial, domine a economia e esmague os rivais.',
    goal: 'Sobreviva e derrote 3 impérios.', civ: 'chinese',
    settings: { mapType: 'floresta', mapSize: 'medium', mode: 'conquest', startRes: 'standard', players: [{ human: true, team: 1 }, { ai: 'hard', civ: 'japanese', team: 1 }, { ai: 'hard', civ: 'goths', team: 2 }, { ai: 'expert', civ: 'turks', team: 2 }, { ai: 'hard', civ: 'franks', team: 2 }] } },
];
function campaignProgress() { try { return +(localStorage.getItem('eg_campaign') || 1); } catch (e) { return 1; } }
function saveCampaign(n) { try { localStorage.setItem('eg_campaign', String(Math.max(campaignProgress(), n))); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------
function makeTutorial() {
  const done = (g, f) => f(g, g.human);
  const steps = [
    { t: 'Selecione seu <b>Centro da Cidade</b> (clique nele) e treine um <b>Aldeão</b> clicando no botão ou pressionando <kbd>Q</kbd>. Segure <kbd>Shift</kbd> para treinar 5.', ok: (g, p) => p.stats.trained >= 1 },
    { t: 'Arraste uma caixa sobre os aldeões e clique com o <b>botão direito</b> nos <b>arbustos vermelhos</b> (frutas) para coletar comida.', ok: (g, p) => p.units.some(u => u.order && u.order.type === 'gather' && u.order.rkey === 'berry') },
    { t: 'Envie alguns aldeões para cortar <b>madeira</b>: clique direito em uma árvore. Aldeões levam a carga até o Centro da Cidade.', ok: (g, p) => p.units.some(u => u.order && u.order.type === 'gather' && u.order.rkey === 'wood') },
    { t: 'Sua população está limitada. Selecione um aldeão e construa uma <b>Casa</b> (botão 🏠 ou <kbd>Q</kbd>). Posicione e clique para confirmar.', ok: (g, p) => p.blds.some(b => b.type === 'house' && b.complete) },
    { t: 'Construa um <b>Moinho</b> 🌾 perto das frutas para encurtar a viagem dos aldeões e depois uma <b>Serraria</b> 🪓 perto das árvores.', ok: (g, p) => p.blds.some(b => b.type === 'mill' && b.complete) && p.blds.some(b => b.type === 'lumbercamp' && b.complete) },
    { t: 'Construa um <b>Quartel</b> 🏯 e pesquise <b>Tear</b> 🧵 no Centro da Cidade. Depois avance para a <b>Idade Feudal</b> (500 de comida, requer 2 tipos de edifício).', ok: (g, p) => p.age >= 1 },
    { t: 'Na Idade Feudal, construa um <b>Campo de Arquearia</b> ou <b>Estábulo</b> e treine pelo menos <b>8 soldados</b>. Use <kbd>Shift</kbd> para treinar em lote.', ok: (g, p) => p.units.filter(u => u.type !== 'villager' && u.type !== 'scout').length >= 8 },
    { t: 'Selecione seus soldados e clique com o botão direito no <b>inimigo</b> (ou use <kbd>Q</kbd> para Atacar-mover). Destrua todos os edifícios inimigos para vencer! Dica: aríetes (Idade dos Castelos) derrubam construções rápido.', ok: () => false },
  ];
  return { steps, idx: 0 };
}

// ---------------------------------------------------------------------------
// Início da partida
// ---------------------------------------------------------------------------
function buildSettings(cfg) {
  // cfg.players: [{human?, ai?, civ?, team}]
  const used = [];
  const civKeys = Object.keys(CIVS);
  const players = cfg.players.map((p, i) => {
    let civ = p.civ;
    if (!civ || civ === 'random') civ = civKeys[Math.floor(Math.random() * civKeys.length)];
    return { name: p.human ? (cfg.playerName || 'Você') : AI_NAMES[(i * 3 + Math.floor(Math.random() * 3)) % AI_NAMES.length] + ' (IA ' + AI_LEVELS[p.ai].name + ')', civ, team: p.team, color: i, human: !!p.human, ai: p.human ? null : p.ai };
  });
  return Object.assign({}, cfg, { players });
}

function startGame(cfg, extra) {
  stopSession();
  const settings = buildSettings(cfg);
  settings.seed = cfg.seed || ((Math.random() * 1e9) | 0);
  $('#menu').hidden = true;
  const root = $('#game');
  root.hidden = false;
  const game = new Game(settings);
  game.speedMul = cfg.speed || 1.7;
  const hooks = {
    restart: () => startGame(Object.assign({}, cfg, { seed: settings.seed }), extra),
    quit: () => { stopSession(); showMenu('main'); },
    over: over => { if (extra && extra.campaign && over.win) saveCampaign(extra.campaign.id + 1); },
  };
  const renderer = new Renderer(root.querySelector('canvas') || document.createElement('canvas'), game, null);
  const ui = new UI(game, renderer, root, hooks);
  session = { game, renderer, ui, raf: 0, extra, last: performance.now(), acc: 0, tut: extra && extra.tutorial ? makeTutorial() : null, tutT: 0 };
  if (extra && extra.tutorial) {
    // IA do tutorial só ataca bem mais tarde
    for (const p of game.players) if (p.ai) p.ai.noAttackUntil = 1500;
  }
  if (extra && extra.campaign) { ui.addMsg('<b>' + extra.campaign.title + '</b>', 'good'); ui.addMsg('Objetivo: ' + extra.campaign.goal, 'info'); }
  updateObjectives();
  window.__session = session;
  session.raf = requestAnimationFrame(frame);
}

function stopSession() {
  if (!session) return;
  cancelAnimationFrame(session.raf);
  session.ui.destroy();
  session = null;
  $('#game').hidden = true;
  $('#game').innerHTML = '';
}

function updateObjectives() {
  if (!session) return;
  const el = session.ui.el.obj;
  const g = session.game;
  if (session.tut) {
    const t = session.tut;
    while (t.idx < t.steps.length - 1 && t.steps[t.idx].ok(g, g.human)) { t.idx++; g.events.push({ text: '✔ Objetivo concluído!', kind: 'good' }); Sfx.play('build'); }
    el.hidden = false;
    el.innerHTML = '<h4>📜 A Arte da Guerra — Passo ' + (t.idx + 1) + '/' + t.steps.length + '</h4><p>' + t.steps[t.idx].t + '</p>';
  } else if (session.extra && session.extra.campaign) {
    el.hidden = false;
    el.innerHTML = '<h4>📜 ' + session.extra.campaign.title + '</h4><p>' + session.extra.campaign.goal + '</p>';
  } else el.hidden = true;
}

function frame(ts) {
  const s = session;
  if (!s) return;
  const g = s.game, ui = s.ui;
  let dt = Math.min(0.1, (ts - s.last) / 1000);
  s.last = ts;
  if (!ui.paused) {
    s.acc += dt * g.speedMul;
    let steps = 0;
    while (s.acc >= STEP && steps < 14) { g.update(STEP); s.acc -= STEP; steps++; }
    if (steps >= 14) s.acc = 0;
  }
  s.tutT += dt;
  if (s.tutT > 0.7) { s.tutT = 0; updateObjectives(); }
  try {
    ui.update(dt, ts);
    s.renderer.draw(Math.min(1, s.acc / STEP), ts);
  } catch (err) { console.error(err); }
  s.raf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Telas de menu
// ---------------------------------------------------------------------------
function showMenu(screen, arg) {
  const m = $('#menu');
  m.hidden = false;
  const c = m.querySelector('.content');
  const screens = { main: menuMain, custom: menuCustom, campaign: menuCampaign, civs: menuCivs, help: menuHelp };
  (screens[screen] || menuMain)(c, arg);
}

function menuMain(c) {
  c.innerHTML = `
    <div class="logo"><div class="crown">👑</div><h1>EMPIRE GAME</h1><p>Estratégia · Economia · Conquista</p></div>
    <div class="mbtns">
      <button data-a="quick">⚔️ Partida Rápida <small>(COOP: você + aliado vs 2 IAs)</small></button>
      <button data-a="custom">🗺️ Partida Personalizada</button>
      <button data-a="campaign">📜 Campanha</button>
      <button data-a="tutorial">🎓 Tutorial: A Arte da Guerra</button>
      <button data-a="civs">🏛️ Civilizações e Tecnologias</button>
      <button data-a="help">❓ Como Jogar</button>
    </div>
    <p class="foot">Jogo offline em HTML5 — nenhuma instalação necessária</p>`;
  c.querySelector('.mbtns').onclick = e => {
    const a = e.target.closest('button'); if (!a) return;
    Sfx.init();
    switch (a.dataset.a) {
      case 'quick': {
        const civs = Object.keys(CIVS).sort(() => Math.random() - 0.5);
        startGame({ mapType: 'arabia', mapSize: 'small', mode: 'conquest', startRes: 'standard', speed: 1.7, players: [{ human: true, civ: civs[0], team: 1 }, { ai: 'moderate', civ: civs[1], team: 1 }, { ai: 'moderate', civ: civs[2], team: 2 }, { ai: 'moderate', civ: civs[3], team: 2 }] });
        break;
      }
      case 'custom': showMenu('custom'); break;
      case 'campaign': showMenu('campaign'); break;
      case 'tutorial':
        startGame({ mapType: 'arabia', mapSize: 'tiny', mode: 'conquest', startRes: 'standard', speed: 1.7, players: [{ human: true, civ: 'britons', team: 1 }, { ai: 'easy', civ: 'franks', team: 2 }] }, { tutorial: true });
        break;
      case 'civs': showMenu('civs'); break;
      case 'help': showMenu('help'); break;
    }
  };
}

function menuCampaign(c) {
  const prog = campaignProgress();
  c.innerHTML = '<h2>📜 Campanha: Ascensão do Império</h2><div class="camp">' + CAMPAIGN.map(m =>
    '<div class="mission ' + (m.id > prog ? 'locked' : '') + '"><h3>' + (m.id > prog ? '🔒 ' : '') + m.title + '</h3><p>' + m.intro + '</p><p class="goal">🎯 ' + m.goal + '</p>'
    + '<p class="dim">Civilização: ' + CIVS[m.civ].flag + ' ' + CIVS[m.civ].name + ' · ' + MAP_SIZES[m.settings.mapSize].name.split(' (')[0] + ' · ' + GAME_MODES[m.settings.mode].name + '</p>'
    + (m.id <= prog ? '<button data-m="' + m.id + '">Jogar</button>' : '') + '</div>').join('') + '</div><button class="back" data-a="back">← Voltar</button>';
  c.onclick = e => {
    if (e.target.dataset.a === 'back') showMenu('main');
    const id = e.target.dataset.m;
    if (id) {
      Sfx.init();
      const m = CAMPAIGN.find(x => x.id === +id);
      const s = JSON.parse(JSON.stringify(m.settings));
      s.players[0].civ = m.civ;
      s.speed = 1.7;
      startGame(s, { campaign: m });
    }
  };
}

function menuCivs(c) {
  const ids = Object.keys(CIVS);
  c.innerHTML = '<h2>🏛️ Civilizações e Tecnologias</h2><div class="tabs"><button data-t="civ" class="on">Civilizações</button><button data-t="age">Eras</button><button data-t="tech">Tecnologias</button></div><div id="tabc"></div><button class="back" data-a="back">← Voltar</button>';
  const tabc = c.querySelector('#tabc');
  const show = t => {
    c.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'civ') {
      tabc.innerHTML = '<div class="grid">' + ids.map(id => { const v = CIVS[id], u = UNITS[v.unique]; return '<div class="card"><h3>' + v.flag + ' ' + v.name + '</h3><ul>' + v.bonuses.map(b => '<li>' + b + '</li>').join('') + '</ul><p class="uu"><b>' + u.icon + ' ' + u.name + '</b> — ' + u.desc + '<br><span class="dim">PV ' + u.hp + ' · Atq ' + u.atk + ' · Alc ' + u.range + ' · ' + costHtml(u.cost) + '</span></p></div>'; }).join('') + '</div>';
    } else if (t === 'age') {
      let h = '';
      for (let a = 0; a < 4; a++) {
        const bl = Object.values(BUILDINGS).filter(b => b.age === a).map(b => b.icon + ' ' + b.name);
        const un = Object.values(UNITS).filter(u => u.age === a && !u.noTrain && !u.unique && !(u.cls.indexOf('unique') >= 0)).map(u => u.icon + ' ' + u.name);
        const tk = Object.values(TECHS).filter(x => x.age === a && !x.ageUp).map(x => x.icon + ' ' + x.name);
        const cost = a > 0 ? TECHS['age' + a].cost : null;
        h += '<div class="card"><h3>' + AGES[a].icon + ' ' + AGES[a].name + '</h3>' + (cost ? '<p>Custo: ' + costHtml(cost) + ' ⏱' + TECHS['age' + a].time + 's</p><p class="dim">' + TECHS['age' + a].desc + '</p>' : '<p class="dim">Era inicial.</p>')
          + '<p><b>Construções:</b> ' + (bl.join(' · ') || '—') + '</p><p><b>Unidades:</b> ' + (un.join(' · ') || '—') + '</p><p><b>Tecnologias:</b> ' + (tk.join(' · ') || '—') + '</p></div>';
      }
      tabc.innerHTML = '<div class="grid">' + h + '</div>';
    } else {
      const groups = {};
      Object.values(TECHS).forEach(x => { (groups[x.bld] = groups[x.bld] || []).push(x); });
      tabc.innerHTML = '<div class="grid">' + Object.keys(groups).map(b => '<div class="card"><h3>' + BUILDINGS[b].icon + ' ' + BUILDINGS[b].name + '</h3><ul>' + groups[b].map(x => '<li>' + x.icon + ' <b>' + x.name + '</b> <small>(' + AGES[x.age].short + ')</small> <span class="dim">' + costHtml(x.cost) + '</span><br><span class="dim">' + x.desc + '</span></li>').join('') + '</ul></div>').join('') + '</div>';
    }
  };
  show('civ');
  c.onclick = e => {
    if (e.target.dataset.a === 'back') showMenu('main');
    else if (e.target.dataset.t) show(e.target.dataset.t);
  };
}

function menuHelp(c) {
  c.innerHTML = `<h2>❓ Como Jogar</h2><div class="grid">
    <div class="card"><h3>🎯 Objetivo</h3><p>Colete <b>comida, madeira, ouro e pedra</b> com seus aldeões, construa e expanda sua cidade, avance pelas quatro eras (Trevas → Feudal → Castelos → Imperial), pesquise tecnologias, forme exércitos e derrote os impérios rivais controlados pelo computador. Jogue sozinho ou em <b>cooperação</b> com aliados da IA.</p></div>
    <div class="card"><h3>🖱️ Mouse</h3><ul><li><b>Clique esquerdo</b>: selecionar · arraste para selecionar várias unidades</li><li><b>Duplo clique</b>: seleciona todas do mesmo tipo na tela</li><li><b>Clique direito</b>: mover / atacar / coletar / construir / definir ponto de encontro</li><li><b>Shift + clique direito</b>: enfileirar ordens</li><li><b>Roda</b>: zoom · <b>botão do meio</b>: arrastar mapa · bordas da tela: rolagem</li><li>Clique no <b>minimapa</b> para mover a câmera; clique direito para dar ordens</li></ul></div>
    <div class="card"><h3>⌨️ Teclado</h3><ul><li><kbd>Q W E R T / A S D F G / Z X C V B</kbd>: botões do painel de comandos</li><li><kbd>Shift</kbd> + treinar: 5 unidades de uma vez</li><li><kbd>.</kbd> aldeão ocioso · <kbd>,</kbd> soldado ocioso · <kbd>H</kbd> Centro da Cidade</li><li><kbd>Ctrl</kbd>+<kbd>1-9</kbd> cria grupo · <kbd>1-9</kbd> seleciona (2× centraliza)</li><li><kbd>Del</kbd> exclui · <kbd>Esc</kbd> cancela/menu · <kbd>P</kbd> pausa · <kbd>+</kbd>/<kbd>-</kbd> velocidade · <kbd>Espaço</kbd> último alerta · <kbd>Setas</kbd> câmera</li></ul></div>
    <div class="card"><h3>🏗️ Economia</h3><ul><li>Aldeões coletam e levam recursos ao <b>ponto de entrega</b> mais próximo: Centro da Cidade, Moinho (comida), Serraria (madeira), Acampamento de Mineração (ouro/pedra).</li><li>Construa <b>Casas</b> para aumentar a população (limite 200).</li><li><b>Fazendas</b> são infinitas (replantam sozinhas por 60 de madeira). Frutas e caça acabam.</li><li>Pesquise melhorias nos pontos de coleta e use o <b>Mercado</b> para trocar recursos.</li></ul></div>
    <div class="card"><h3>⚔️ Combate</h3><ul><li><b>Lanceiros</b> vencem cavalaria · <b>Cavalaria</b> vence arqueiros · <b>Arqueiros</b> vencem infantaria.</li><li><b>Aríetes</b> destroem edifícios e resistem a flechas; use soldados para protegê-los.</li><li>Torres, Castelos e Centros da Cidade atiram em inimigos próximos.</li><li>Melhore armas e armaduras na <b>Ferraria</b>.</li></ul></div>
    <div class="card"><h3>🏆 Modos</h3><ul>${Object.values(GAME_MODES).map(m => '<li><b>' + m.name + '</b>: ' + m.desc + '</li>').join('')}</ul></div></div>
    <button class="back" data-a="back">← Voltar</button>`;
  c.onclick = e => { if (e.target.dataset.a === 'back') showMenu('main'); };
}

function menuCustom(c) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('eg_setup') || 'null'); } catch (e) { return null; } })();
  const def = saved || { mapType: 'arabia', mapSize: 'small', mode: 'conquest', startRes: 'standard', startAge: 0, speed: 1.7, revealMap: false, fog: true, slots: [{ t: 'human', civ: 'random', team: 1 }, { t: 'moderate', civ: 'random', team: 1 }, { t: 'moderate', civ: 'random', team: 2 }, { t: 'moderate', civ: 'random', team: 2 }, { t: 'none', civ: 'random', team: 3 }, { t: 'none', civ: 'random', team: 3 }, { t: 'none', civ: 'random', team: 4 }, { t: 'none', civ: 'random', team: 4 }] };
  const opt = (obj, sel) => Object.keys(obj).map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + obj[k].name + '</option>').join('');
  const teamOpt = sel => [1, 2, 3, 4].map(t => '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>Equipe ' + t + '</option>').join('');
  c.innerHTML = `<h2>🗺️ Partida Personalizada</h2>
    <div class="setup">
      <div class="col"><h3>Mapa</h3>
        <label>Tipo de mapa<select id="s-map">${opt(MAP_TYPES, def.mapType)}</select></label>
        <label>Tamanho<select id="s-size">${opt(MAP_SIZES, def.mapSize)}</select></label>
        <label>Modo de jogo<select id="s-mode">${opt(GAME_MODES, def.mode)}</select></label>
        <label>Recursos iniciais<select id="s-res">${opt(START_RES, def.startRes)}</select></label>
        <label>Era inicial<select id="s-age">${AGES.map((a, i) => '<option value="' + i + '"' + (i === def.startAge ? ' selected' : '') + '>' + a.name + '</option>').join('')}</select></label>
        <label>Velocidade<select id="s-speed">${[1, 1.7, 2.5, 4].map(s => '<option value="' + s + '"' + (s === def.speed ? ' selected' : '') + '>' + s + 'x' + (s === 1.7 ? ' (normal)' : '') + '</option>').join('')}</select></label>
        <label class="chk"><input type="checkbox" id="s-reveal" ${def.revealMap ? 'checked' : ''}> Revelar mapa</label>
        <label class="chk"><input type="checkbox" id="s-fog" ${def.fog !== false ? 'checked' : ''}> Neblina de guerra</label>
        <p class="dim" id="s-desc"></p>
      </div>
      <div class="col wide"><h3>Jogadores</h3>
        <table class="slots"><tr><th>#</th><th>Tipo</th><th>Civilização</th><th>Equipe</th></tr>
        ${def.slots.map((s, i) => '<tr><td style="color:' + PLAYER_COLORS[i].c + '">●</td><td>' + (i === 0 ? '<b>Você</b>' : '<select class="t" data-i="' + i + '"><option value="none"' + (s.t === 'none' ? ' selected' : '') + '>— Fechado —</option>' + Object.keys(AI_LEVELS).map(k => '<option value="' + k + '"' + (s.t === k ? ' selected' : '') + '>IA ' + AI_LEVELS[k].name + '</option>').join('') + '</select>') + '</td><td><select class="c" data-i="' + i + '">' + civOptions(s.civ, true) + '</select></td><td><select class="tm" data-i="' + i + '">' + teamOpt(s.team) + '</select></td></tr>').join('')}
        </table>
        <p class="dim">Dica: coloque você e uma IA na mesma equipe para jogar em <b>cooperação (COOP)</b> contra as demais.</p>
        <p class="warn" id="s-warn"></p>
      </div>
    </div>
    <div class="btns"><button class="back" data-a="back">← Voltar</button><button class="go" data-a="go">▶ Iniciar Partida</button></div>`;
  const upd = () => {
    $('#s-desc').textContent = MAP_TYPES[$('#s-map').value].desc + ' — ' + GAME_MODES[$('#s-mode').value].desc;
  };
  c.querySelectorAll('select').forEach(s => s.addEventListener('change', upd)); upd();
  c.onclick = e => {
    const a = e.target.dataset.a;
    if (a === 'back') showMenu('main');
    if (a === 'go') {
      const slots = [];
      c.querySelectorAll('tr').forEach((tr, i) => {
        if (i === 0) return;
        const idx = i - 1;
        const t = idx === 0 ? 'human' : tr.querySelector('.t').value;
        slots.push({ t, civ: tr.querySelector('.c').value, team: +tr.querySelector('.tm').value });
      });
      const players = [];
      slots.forEach(s => { if (s.t === 'none') return; players.push(s.t === 'human' ? { human: true, civ: s.civ, team: s.team } : { ai: s.t, civ: s.civ, team: s.team }); });
      const warn = $('#s-warn');
      if (players.length < 2) { warn.textContent = 'Adicione pelo menos 1 oponente.'; return; }
      if (new Set(players.map(p => p.team)).size < 2) { warn.textContent = 'É preciso ter ao menos duas equipes diferentes.'; return; }
      const size = $('#s-size').value, maxP = { tiny: 3, small: 5, medium: 7, large: 8 }[size];
      if (players.length > maxP) { warn.textContent = 'Este tamanho de mapa comporta no máximo ' + maxP + ' jogadores.'; return; }
      const cfg = { mapType: $('#s-map').value, mapSize: size, mode: $('#s-mode').value, startRes: $('#s-res').value, startAge: +$('#s-age').value, speed: +$('#s-speed').value, revealMap: $('#s-reveal').checked, fog: $('#s-fog').checked };
      try { localStorage.setItem('eg_setup', JSON.stringify(Object.assign({}, cfg, { slots }))); } catch (err) { /* ignore */ }
      Sfx.init();
      startGame(Object.assign(cfg, { players }));
    }
  };
}

window.addEventListener('load', () => {
  showMenu('main');
  const q = new URLSearchParams(location.search);
  if (q.get('autostart')) { // atalho para testes
    startGame({ mapType: q.get('map') || 'arabia', mapSize: q.get('size') || 'small', mode: q.get('mode') || 'conquest', startRes: 'standard', speed: 1.7, players: [{ human: true, civ: 'britons', team: 1 }, { ai: 'moderate', civ: 'franks', team: 1 }, { ai: 'moderate', civ: 'mongols', team: 2 }, { ai: 'moderate', civ: 'goths', team: 2 }] });
  }
});
