// Browser test (playwright-core + a local Chromium). Local: serves docs/ at the root and mocks the Apps Script.
// Live: BASE_URL=https://<sub>.jalonel.com/ node tests/e2e.mjs  (real form -> real Sheet with an @example.com
// address, flagged test and purged afterwards when <SITE>_ADMIN_KEY is set; measurement off via octave_notrack=1).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import SITE from '../site.config.mjs';
import { scenario } from './e2e.site.mjs';

const PW = process.env.PW_CORE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../octave-checkout/node_modules/playwright-core/index.mjs');
const { chromium } = await import(PW);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LIVE = process.env.BASE_URL || '';
const KEY = process.env[SITE.site.toUpperCase().replace(/-/g, '_') + '_ADMIN_KEY'] || '';
const SHOTS = process.env.SHOTS || '';

let server, base = LIVE;
if (!LIVE) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.pdf': 'application/pdf', '.txt': 'text/plain' };
  server = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(ROOT, 'docs', u);
    if (f.endsWith('/')) f += 'index.html';
    if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': types['.html'] }); return res.end(fs.readFileSync(path.join(ROOT, 'docs/404.html'))); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(0);
  base = `http://127.0.0.1:${server.address().port}/`;
}

const exe = process.env.CHROME || ['chromium-1248', 'chromium-1234', 'chromium-1228'].map((d) => path.join(process.env.HOME, '.cache/ms-playwright', d, 'chrome-linux/chrome')).find((p) => fs.existsSync(p))
  || ['chromium-1248', 'chromium-1234'].map((d) => path.join(process.env.HOME, '.cache/ms-playwright', d, 'chrome-linux64/chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const results = [];
const posted = [];
try {
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_BLOCKED|net::/.test(m.text())) errors.push(m.text()); });
    const requests = [];
    page.on('request', (r) => requests.push({ url: r.url(), body: r.postData() || '' }));
    if (!LIVE) {
      await page.route(SITE.api + '*', async (route) => {
        const body = route.request().postData() || '';
        let j = {}; try { j = JSON.parse(body); } catch { /* */ }
        posted.push(j);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j.action === 'preorder' ? { ok: true, updated: false, zone: j.country === 'FR' ? 'fr' : 'non-eu' } : { ok: true }) });
      });
    }
    const go = async (p) => { await page.goto(base + p + (p.includes('?') ? '&' : '?') + 'octave_notrack=1', { waitUntil: 'networkidle' }); };
    const noHScroll = async (label) => {
      const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(w <= 1, `${label}: horizontal scroll ${w}px at ${vp.width}`);
    };
    const t = { page, go, noHScroll, requests, posted, vp, LIVE, KEY, SITE, assert, shot: async (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${n}-${vp.width}.png`), fullPage: true }) };
    await scenario(t);
    assert.deepEqual(errors, [], 'console errors at ' + vp.width);
    results.push(vp.width + 'px ok');
    await ctx.close();
  }
} finally {
  await browser.close();
  server?.close();
}
if (LIVE && KEY) {
  const r = await fetch(SITE.api, { method: 'POST', body: JSON.stringify({ action: 'purge_tests', key: KEY }) }).then((x) => x.json());
  console.log('purged test rows:', r.deleted);
}
console.log('e2e', LIVE ? 'LIVE ' + LIVE : 'local', results.join(', '));
