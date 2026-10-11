// Teste de navegador do fluxo de guerra, regime autoritário e dificuldade
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
  await page.click('#t-new'); await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/w_select.png' });
  await page.click('[data-diff="dificil"]');
  await page.click('.ccard[data-id="TR"]'); await page.waitForTimeout(200);
  await page.click('.overlay button[data-i="0"]'); await page.waitForTimeout(200);
  console.log('dificuldade:', await page.evaluate(() => Game.w.diff));
  // declara guerra via modal do país
  await page.click('[data-tab="mundo"]'); await page.waitForTimeout(100);
  await page.click('.rrow[data-c="GR"], .rrow[data-c="EG"]'); await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/w_country.png' });
  const btns = await page.$$eval('.overlay .sheet-btns button', b => b.map(x => x.innerText.replace(/\n/g, ' ')));
  console.log('botões do país:', btns);
  await page.click('.overlay button[data-i="2"]:not([disabled])').catch(() => console.log('guerra indisponível'));
  await page.waitForTimeout(150);
  const hasConfirm = await page.$('.overlay');
  if (hasConfirm) { await page.click('.overlay button[data-i="0"]'); await page.waitForTimeout(250); }
  console.log('em guerra:', await page.evaluate(() => !!Game.w.war));
  await page.screenshot({ path: '/tmp/w_war_header.png' });
  // passa anos jogando a guerra
  for (let i = 0; i < 4; i++) {
    if (!(await page.$('#next'))) break;
    await page.click('#next'); await page.waitForTimeout(100);
    for (let k = 0; k < 15; k++) {
      const btn = await page.$('.overlay .sheet-btns button:not([disabled])');
      if (!btn) break;
      const t = await page.evaluate(() => document.querySelector('.overlay').innerText);
      if (/Novo jogo/.test(t)) { console.log('FIM:', t.replace(/\n+/g, ' | ').slice(0, 200)); break; }
      if (/Guerra contra/.test(t)) await page.screenshot({ path: '/tmp/w_turn.png' });
      await btn.click(); await page.waitForTimeout(80);
    }
  }
  if (await page.$('.overlay')) { console.log('overlay final aberto'); await page.screenshot({ path: '/tmp/w_end.png' }); await browser.close(); return; }
  if (!(await page.$('[data-tab="povo"]'))) { console.log('fim de jogo durante o teste:', (await page.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n/g, ' | ')); await browser.close(); return; }
  await page.click('[data-tab="povo"]'); await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/w_povo.png' });
  // autoritarismo
  await page.evaluate(() => { Game.me.cp = 10; });
  const r = await page.evaluate(() => enact(Game.me, Game.w, 'autoritarismo').ok);
  console.log('autoritarismo aprovado:', r);
  await page.click('[data-tab="povo"]'); await page.waitForTimeout(100);
  console.log('texto regime:', await page.$eval('.regime', e => e.innerText));
  console.log('erros:', errors.length); errors.slice(0, 5).forEach(e => console.log(e));
  await browser.close();
})();
