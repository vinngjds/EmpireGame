// Teste no navegador (Playwright + Chromium): carrega o jogo, captura erros e tira screenshots
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url + '?autostart=1');
  await page.waitForTimeout(1500);
  // avança a simulação rapidamente
  const adv = async (sec) => page.evaluate((s) => { const g = window.__session.game; for (let i = 0; i < s * 20; i++) g.update(STEP); }, sec);
  await page.evaluate(() => { const g = window.__session.game; g.players[0].ai = new AIPlayer(g, g.players[0], 'hard'); });
  await adv(600);
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/shot_game2.png' });
  await adv(900);
  await page.evaluate(() => { const g = window.__session.game; const tc = g.players[0].blds.find(b => b.type === 'towncenter'); if (tc) window.__session.renderer.centerOn(tc.x, tc.y); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/shot_game3.png' });
  console.log('errors so far:', errors.length); errors.slice(0, 8).forEach(e => console.log(e));
  await browser.close();
})();
