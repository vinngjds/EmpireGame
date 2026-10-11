// Mede custo de simulação e renderização em um mapa grande com 8 IAs
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.evaluate(() => {
    const civs = Object.keys(CIVS);
    const players = [{ human: true, civ: 'britons', team: 1 }];
    for (let i = 1; i < 8; i++) players.push({ ai: 'hard', civ: civs[i], team: i % 2 + 1 });
    startGame({ mapType: 'continental', mapSize: 'large', mode: 'conquest', startRes: 'standard', speed: 1.7, players });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__session.game; g.players[0].ai = new AIPlayer(g, g.players[0], 'hard'); for (let i = 0; i < 20 * 60 * 18; i++) g.update(STEP); });
  const res = await page.evaluate(() => {
    const s = window.__session, t0 = performance.now();
    for (let i = 0; i < 60; i++) s.renderer.draw(0.5, performance.now());
    const dr = (performance.now() - t0) / 60;
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) s.game.update(STEP);
    const up = (performance.now() - t1) / 100;
    return { drawMs: dr.toFixed(2), tickMs: up.toFixed(2), ents: s.game.ents.size, units: s.game.units.length, bld: s.game.buildings.length };
  });
  console.log(res);
  await page.screenshot({ path: '/tmp/shot_perf.png' });
  console.log('errors:', errors.length, errors.slice(0, 3));
  await browser.close();
})();
