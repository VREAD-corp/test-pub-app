#!/usr/bin/env node
// Static build, no dependency: src/pages/*.html (+ site.config.mjs) -> docs/ (GitHub Pages, branch main, folder /docs).
// Each page starts with <!--meta {json}--> : { path, title, description, page, schema?, noindex?, nav? }.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import SITE from './site.config.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'docs');
const SRC = path.join(ROOT, 'src');
const ORIGIN = SITE.origin;   // site served at the root of its own subdomain (brand Jalonel)
const HOST = new URL(ORIGIN).hostname;
const BASE = '/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

// 1. Assets (fingerprinted with ?v=). mesure.js is generated per site from the shared template.
if (SITE.prebuild) await SITE.prebuild({ ROOT, SRC });
const mesure = fs.readFileSync(path.join(ROOT, 'tools/mesure.template.js'), 'utf8')
  .replace(/__BRAND__/g, SITE.brand).replace(/__SITE__/g, SITE.site).replace(/__API__/g, SITE.api).replace(/__XP__/g, SITE.variantXp).replace(/__HOST__/g, HOST);
fs.writeFileSync(path.join(SRC, 'assets/mesure.js'), mesure);
const ver = {};
for (const f of fs.readdirSync(path.join(SRC, 'assets'))) {
  const buf = fs.readFileSync(path.join(SRC, 'assets', f));
  fs.writeFileSync(path.join(OUT, 'assets', f), buf);
  ver[f] = hash(buf);
}
for (const f of SITE.static || []) { fs.mkdirSync(path.dirname(path.join(OUT, f[1])), { recursive: true }); fs.copyFileSync(path.join(ROOT, f[0]), path.join(OUT, f[1])); }
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
// Custom domain (GitHub Pages, legacy build from /docs) and IndexNow key, served at the site root.
fs.writeFileSync(path.join(OUT, 'CNAME'), HOST + '\n');
for (const k of SITE.indexNowKeys || []) fs.writeFileSync(path.join(OUT, k + '.txt'), k);

// 2. Pages.
const pages = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html')).sort().map((f) => {
  const raw = fs.readFileSync(path.join(SRC, 'pages', f), 'utf8');
  const m = raw.match(/^<!--meta\s*([\s\S]*?)-->\n?/);
  if (!m) throw new Error(f + ': missing <!--meta {...}--> header');
  return { file: f, ...JSON.parse(m[1]), body: raw.slice(m[0].length) };
});

const rel = (from, to) => {
  // relative link from page path `from` (e.g. /audit/) to site path `to` (e.g. /assets/x.css)
  const depth = from.split('/').filter(Boolean).length - (from.endsWith('/') ? 0 : 1);
  return ('../'.repeat(depth) || './') + to.replace(/^\//, '');
};
const asset = (p, f) => rel(p.path, 'assets/' + f) + '?v=' + ver[f];

function layout(p) {
  const url = ORIGIN + BASE + p.path.replace(/^\//, '');
  const R = (to) => rel(p.path, to);
  const body = p.body.replace(/\{\{([a-z_]+):([^}]*)\}\}/g, (all, k, v) => (k === 'href' ? R(v) : k === 'asset' ? asset(p, v) : all))
    .replace(/\{\{api\}\}/g, SITE.api);
  const nav = SITE.nav.map(([label, to]) => `<a href="${R(to)}"${to === p.path ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
  const schema = [].concat(p.schema || [], SITE.schema ? SITE.schema(p, url) : []).filter(Boolean)
    .map((s) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...s })}</script>`).join('\n');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
${p.noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}${p.path === '/404.html' ? '' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="${esc(SITE.brand)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta name="theme-color" content="${SITE.accent}">
<link rel="icon" href="${asset(p, 'icon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${asset(p, 'style.css')}">
<script>window.SITE = ${JSON.stringify({ site: SITE.site, api: SITE.api, xp: SITE.variantXp, consent: SITE.consentVersion, base: R('/'), mail: 'contact@jalonel.com' })};
window.OCTAVE_XP = ${JSON.stringify(SITE.xp)};</script>
<script src="${asset(p, 'cro.js')}" data-site="${SITE.site}" data-api="${SITE.api}" data-hosts="${HOST}" data-cta="a.btn,button.btn"></script>
<script src="${asset(p, 'mesure.js')}" defer></script>
${(SITE.scripts || []).concat(p.scripts || []).map((s) => `<script src="${asset(p, s)}" defer></script>`).join('\n')}
${schema}
</head>
<body data-page="${esc(p.page || '')}">
<a class="skip" href="#main">Aller au contenu</a>
<header class="top"><div class="wrap">
<a class="logo" href="${R('/')}">${SITE.logo}</a>
<nav aria-label="Navigation principale">${nav}</nav>
</div></header>
<main id="main" class="wrap">
${body.trim()}
</main>
<footer class="foot"><div class="wrap">
<p>${esc(SITE.brand)} est conçu et exploité par Octave, l’agent IA de READ FRANCE SAS, éditeur de la marque Jalonel. ${esc(SITE.footerNote || '')}</p>
<p><a href="https://jalonel.com/">Une marque Jalonel</a> · <a href="${R('/confidentialite/')}">Confidentialité</a> · <a href="${R('/mentions-legales/')}">Mentions légales</a> · <a href="mailto:contact@jalonel.com">contact@jalonel.com</a></p>
<p class="small">Aucun cookie. Mesure d'audience anonyme et agrégée, sans identifiant.</p>
</div></footer>
</body>
</html>
`;
}

for (const p of pages) {
  const target = p.path === '/404.html' ? path.join(OUT, '404.html') : path.join(OUT, p.path, 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, layout(p));
}

// 3. sitemap.xml, robots.txt
const today = new Date().toISOString().slice(0, 10);
const listed = pages.filter((p) => !p.noindex && p.path !== '/404.html');
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((p) => `  <url><loc>${ORIGIN + BASE + p.path.replace(/^\//, '')}</loc><lastmod>${p.updated || today}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN + BASE}sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'urls.txt'), listed.map((p) => ORIGIN + BASE + p.path.replace(/^\//, '')).join('\n') + '\n');
console.log(`built ${pages.length} pages -> docs/ (${listed.length} in sitemap)`);
