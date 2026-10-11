// Teste de navegador (mobile): joga alguns anos, abre abas e tira screenshots
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.screenshot({ path: '/tmp/n_title.png' });
  await page.click('#t-new'); await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/n_select.png' });
  await page.click('.ccard[data-id="BR"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/n_brief.png' });
  await page.click('button[data-i="0"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/n_painel.png' });
  for (const t of ['orc', 'leis', 'povo', 'mundo']) { await page.click(`[data-tab="${t}"]`); await page.waitForTimeout(200); await page.screenshot({ path: `/tmp/n_${t}.png` }); }
  // aprova uma lei
  await page.click('[data-tab="leis"]');
  await page.click('[data-enact]'); await page.waitForTimeout(200);
  // joga anos
  await page.click('[data-tab="painel"]');
  for (let i = 0; i < 6; i++) {
    if (!(await page.$('#next'))) { console.log('jogo terminou no ano', i); break; }
    await page.click('#next'); await page.waitForTimeout(150);
    if (i === 0) await page.screenshot({ path: '/tmp/n_report.png' });
    // percorre modais
    for (let k = 0; k < 12; k++) {
      if (i > 0 && k === 0) { /* continua */ }
      const btn = await page.$('.overlay .sheet-btns button:not([disabled])');
      if (!btn) break;
      if (i === 0 && k === 1) await page.screenshot({ path: '/tmp/n_event.png' });
      await btn.click(); await page.waitForTimeout(120);
    }
  }
  await page.screenshot({ path: '/tmp/n_after.png' });
  console.log('year:', await page.evaluate(() => Game.w.year), 'errors:', errors.length); errors.slice(0, 5).forEach(e => console.log(e));
  await browser.close();
})();
