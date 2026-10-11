const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const shot = async n => { await page.waitForTimeout(250); await page.screenshot({ path: '/tmp/m_' + n + '.png' }); };
  await page.click('button[data-a="custom"]'); await shot('custom');
  await page.click('button[data-a="back"]');
  await page.click('button[data-a="campaign"]'); await shot('campaign');
  await page.click('button[data-a="back"]');
  await page.click('button[data-a="civs"]'); await shot('civs');
  await page.click('button[data-t="tech"]'); await shot('techs');
  await page.click('button[data-a="back"]');
  await page.click('button[data-a="help"]'); await shot('help');
  await page.click('button[data-a="back"]');
  // tutorial
  await page.click('button[data-a="tutorial"]'); await page.waitForTimeout(1500); await shot('tutorial');
  await page.keyboard.press('Escape'); await shot('pausemenu');
  console.log('errors:', errors.length); errors.slice(0, 8).forEach(e => console.log(e));
  // campanha 1 + partida personalizada
  await page.evaluate(() => { document.querySelector('[data-a="quit"]').click(); });
  await page.waitForTimeout(300);
  await page.click('button[data-a="custom"]');
  await page.click('button[data-a="go"]');
  await page.waitForTimeout(1500);
  console.log('custom game started:', await page.evaluate(() => !!window.__session && window.__session.game.players.length));
  console.log('errors:', errors.length); errors.slice(0, 8).forEach(e => console.log(e));
  await browser.close();
})();
