/* Tests de bout en bout : node tests/run.js [--live]  (sans --live, les API sont simulées). */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mock = require('./mock');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nope'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    }).listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

const live = process.argv.includes('--live');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };

(async () => {
  const { srv, url } = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (!live) await mock.install(page);
  const tests = require('./scenarios')({ page, url, check, live });
  for (const [name, fn] of Object.entries(tests)) {
    if (only && name !== only) continue;
    console.log('\n▶', name);
    try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); console.log('  ✗ exception', e.message); }
  }
  await page.screenshot({ path: path.join(__dirname, 'last.png'), fullPage: true }).catch(() => {});
  await browser.close(); srv.close();
  const relevant = errors.filter((e) => !/favicon|net::ERR|404|405 \(Method Not Allowed\)/.test(e));
  console.log('\nErreurs JS :', relevant.length ? relevant : 'aucune');
  if (relevant.length) failures.push(...relevant);
  console.log(failures.length ? `\n${failures.length} échec(s)` : '\nTout passe.');
  process.exit(failures.length ? 1 : 0);
})();
