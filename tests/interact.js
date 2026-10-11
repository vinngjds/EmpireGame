const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(300);
  // Partida rápida via clique
  await page.click('button[data-a="quick"]');
  await page.waitForTimeout(800);
  const st = () => page.evaluate(() => { const g = window.__session.game, p = g.human; return { food: Math.floor(p.res.food), wood: Math.floor(p.res.wood), pop: p.pop, queue: p.blds.filter(b => b.type === 'towncenter')[0].queue.length, vils: p.units.filter(u => u.type === 'villager').length, blds: p.blds.length, sel: window.__session.ui.sel.length }; });
  console.log('inicio', await st());
  await page.keyboard.press('q'); await page.keyboard.press('q');
  await page.waitForTimeout(200);
  console.log('apos Q,Q', await st());
  // seleciona aldeões com caixa em volta do TC
  const pos = await page.evaluate(() => { const r = window.__session.renderer, p = window.__session.game.human; return p.units.filter(u => u.type === 'villager').map(u => r.worldToScreen(u.x, u.y, 10)); });
  console.log('villager screen pos', pos.map(p => [Math.round(p.x), Math.round(p.y)]));
  const minx = Math.min(...pos.map(p => p.x)) - 20, maxx = Math.max(...pos.map(p => p.x)) + 20, miny = Math.min(...pos.map(p => p.y)) - 25, maxy = Math.max(...pos.map(p => p.y)) + 15;
  await page.mouse.move(minx, miny); await page.mouse.down(); await page.mouse.move(maxx, maxy, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(250);
  console.log('apos box', await st());
  // construir casa: botão Q do card de aldeões => placement
  await page.keyboard.press('q');
  await page.waitForTimeout(100);
  const placing = await page.evaluate(() => window.__session.ui.placing);
  console.log('placing', placing);
  await page.mouse.move(520, 300, { steps: 3 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/shot_place.png' });
  await page.mouse.click(520, 300);
  await page.waitForTimeout(200);
  console.log('apos casa', await st());
  // clique direito em árvore: encontra uma árvore visível
  const tree = await page.evaluate(() => { const g = window.__session.game, r = window.__session.renderer; let best = null, bd = 1e9; const p = g.human.start; for (const e of g.ents.values()) if (e.kind === 'res' && e.type === 'tree') { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } } const s = r.worldToScreen(best.x, best.y, 14); return { x: s.x, y: s.y, id: best.id }; });
  console.log('tree', tree);
  await page.mouse.click(tree.x, tree.y, { button: 'right' });
  await page.waitForTimeout(200);
  console.log('ordem', await page.evaluate(() => JSON.stringify(window.__session.ui.ownUnits().map(u => u.order && u.order.type + '/' + u.order.rkey))));
  await page.evaluate(() => { const g = window.__session.game; for (let i = 0; i < 20 * 120; i++) g.update(STEP); });
  await page.waitForTimeout(400);
  console.log('2 min depois', await st());
  await page.screenshot({ path: '/tmp/shot_interact.png' });
  console.log('errors:', errors.length); errors.slice(0, 8).forEach(e => console.log(e));
  await browser.close();
})();
