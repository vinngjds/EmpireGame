// Partida completa no navegador (mobile) com o jogador governado pela IA para achar erros de fluxo
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const id = process.argv[2] || 'BR';
  await page.click('#t-new'); await page.click(`.ccard[data-id="${id}"]`); await page.waitForTimeout(200);
  await page.click('.overlay button[data-i="0"]'); await page.waitForTimeout(200);
  let years = 0, ended = null;
  for (let i = 0; i < 60 && !ended; i++) {
    if (!(await page.$('#next'))) break;
    await page.evaluate(() => { Game.me.ai.skill = 1; aiAct(Game.me, Game.w); aiAct(Game.me, Game.w); });
    await page.click('#next'); years++;
    for (let k = 0; k < 15; k++) {
      await page.waitForTimeout(30);
      const txt = await page.evaluate(() => { const o = document.querySelector('.overlay'); return o ? o.innerText : ''; });
      if (/Novo jogo/.test(txt)) { ended = txt.replace(/\n+/g, ' | ').slice(0, 300); break; }
      const btn = await page.$('.overlay .sheet-btns button:not([disabled])');
      if (!btn) break;
      await btn.click();
    }
  }
  console.log('anos jogados:', years, 'ano:', await page.evaluate(() => Game.w.year), 'rank:', await page.evaluate(() => Game.me.rank));
  console.log('fim:', ended);
  await page.screenshot({ path: '/tmp/n_end.png' });
  console.log('erros:', errors.length); errors.slice(0, 5).forEach(e => console.log(e));
  await browser.close();
})();
