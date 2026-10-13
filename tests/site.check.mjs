// Static checks of docs/ (run after build.mjs). node tests/site.check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import SITE from '../site.config.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DOCS = path.join(ROOT, 'docs');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p); } })(DOCS);
const sitemap = fs.readFileSync(path.join(DOCS, 'sitemap.xml'), 'utf8');
const errors = [];
const err = (f, m) => errors.push(path.relative(DOCS, f) + ': ' + m);
const text = (h) => h.replace(/<(script|style|code)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  const is404 = f.endsWith('404.html');
  if (!/<title>[^<]{10,}<\/title>/.test(h)) err(f, 'title');
  const d = h.match(/<meta name="description" content="([^"]*)"/);
  if (!d || d[1].length < 50 || d[1].length > 200) err(f, 'description length ' + (d ? d[1].length : 0));
  if ((h.match(/<h1[\s>]/g) || []).length !== 1) err(f, 'exactly one h1');
  if (!is404) {
    const c = h.match(/<link rel="canonical" href="([^"]+)"/);
    if (!c) err(f, 'canonical'); else if (!sitemap.includes('<loc>' + c[1] + '</loc>')) err(f, 'not in sitemap: ' + c[1]);
  }
  if (!h.includes(`data-site="${SITE.site}"`) || !h.includes(`data-api="${SITE.api}"`)) err(f, 'cro.js tag');
  if (!/assets\/mesure\.js\?v=/.test(h)) err(f, 'mesure.js');
  if (!h.includes('window.OCTAVE_XP')) err(f, 'OCTAVE_XP');
  for (const m of h.matchAll(/<script[^>]+src="([^"]+)"/g)) if (/^(https?:)?\/\//.test(m[1])) err(f, 'third-party script ' + m[1]);
  for (const m of h.matchAll(/<link[^>]+href="(https?:[^"]+)"/g)) if (!m[0].includes('canonical')) err(f, 'external stylesheet/link ' + m[1]);
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch { err(f, 'JSON-LD parse'); continue; }
    if (/aggregateRating|"review"|ratingValue/i.test(m[1])) err(f, 'ratings or reviews in JSON-LD');
    if (!j['@type']) err(f, 'JSON-LD @type');
  }
  // internal links resolve to a built file
  for (const m of h.matchAll(/\shref="([^"#]+)(#[^"]*)?"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:)/.test(u)) continue;
    let t = u.startsWith('/') ? path.join(DOCS, u.replace('/' + SITE.repo + '/', '/')) : path.resolve(path.dirname(f), u.split('?')[0]);
    if (u.endsWith('/') || fs.existsSync(t) && fs.statSync(t).isDirectory()) t = path.join(t, 'index.html');
    if (!fs.existsSync(t)) err(f, 'broken link ' + u);
  }
  // claims that must never appear without a negation in the same sentence
  // quoted text (« … », e.g. the law itself) is not a claim of ours
  for (const s of text(h).replace(/«[^»]*»/g, ' ').split(/(?<=[.!?;:])\s+/)) for (const re of SITE.claims || []) {
    if (re.test(s) && !/\b(ne|n'|ni|aucun|aucune|non|pas|jamais|sans)\b|n’/i.test(s)) err(f, 'claim without negation: ' + s.trim().slice(0, 140));
  }
}
// anti-AI grid: every page >= 85 and no banned phrase / unverified claim (verdict OK)
const lint = JSON.parse(execFileSync('node', [path.join(ROOT, 'tools/lint-ia.mjs'), '--json', '--min', '0', DOCS], { encoding: 'utf8' }));
for (const r of lint) if (!r.skipped && r.file.endsWith('.html') && (r.score < 85 || r.verdict !== 'OK')) errors.push(r.file + ': lint-ia ' + r.score + ' ' + r.verdict);
// cro.js byte-identical to the master copy when it is available (local runs)
const master = path.join(ROOT, '../octave-checkout/gas/web/cro.js');
if (fs.existsSync(master)) assert.equal(fs.readFileSync(path.join(DOCS, 'assets/cro.js'), 'utf8'), fs.readFileSync(master, 'utf8'), 'cro.js differs from octave-checkout/gas/web/cro.js');
const mesure = fs.readFileSync(path.join(DOCS, 'assets/mesure.js'), 'utf8');
assert.ok(mesure.includes("v:2") && mesure.includes(`site:'${SITE.site}'`) && mesure.includes(SITE.api) && mesure.includes('octave_notrack'), 'mesure.js');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`site checks ok: ${files.length} pages, lint-ia >= 85 on all`);
