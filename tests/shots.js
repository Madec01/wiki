/* Captures d'écran (API simulées) : node tests/shots.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const mock = require('./mock');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => { const p = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' }); res.end(d); }); }).listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const out = process.argv[2] || '/tmp/shots';
  fs.mkdirSync(out, { recursive: true });
  for (const [name, w, dark, hash, prep] of [
    ['hub-mobile', 400, false, '#/', null], ['hub-dark', 1000, true, '#/', null],
    ['image-start', 400, false, '#/image', null],
    ['image-round', 400, false, '#/image?go=1', async (page) => { await page.waitForSelector('.image-frame img'); await page.click('.mode-btn:has-text("Lettres posées")'); }],
    ['caviarde', 400, true, '#/caviarde?go=1', async (page) => { await page.waitForSelector('.redacted'); await page.fill('.guess input', 'sujet'); await page.click('.guess .btn-primary'); }],
    ['frise', 400, false, '#/frise?go=1&theme=personnalites', async (page) => { await page.waitForSelector('.tl-gap'); }],
    ['vues', 400, false, '#/vues?go=1', async (page) => { await page.waitForSelector('.versus'); }],
    ['end', 400, false, '#/image?go=1', async (page) => { await page.waitForSelector('.image-frame img'); for (let i = 0; i < 12 && !(await page.locator('.end').count()); i++) { const b = page.locator('button:has-text("Je passe")'); if (await b.count()) await b.click(); const n = page.locator('.next'); if (await n.count()) await n.click(); await page.waitForTimeout(50); } }],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: 860 }, colorScheme: dark ? 'dark' : 'light' });
    await mock.install(page);
    await page.goto(url + hash); await page.waitForTimeout(300);
    if (prep) await prep(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: name.startsWith('hub') });
    await page.close();
  }
  await browser.close(); srv.close(); console.log('captures dans', out);
});
