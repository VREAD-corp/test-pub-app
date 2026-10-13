// Unit tests of the fake-door Apps Script (gas/src) under a minimal Apps Script mock. node tests/gas.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = new URL('../gas/src/', import.meta.url);

function load() {
  function Sheet(name) { this.name = name; this.rows = []; }
  Sheet.prototype = {
    getLastRow() { return this.rows.length; },
    getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); },
    appendRow(r) { this.rows.push(r.slice()); },
    deleteRow(n) { this.rows.splice(n - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      return {
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (sh.rows[r - 1 + i] ||= [])[c - 1 + j] = x; })); return this; },
        getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((sh.rows[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; },
        getValue() { return (sh.rows[r - 1] || [])[c - 1] ?? ''; },
        setValue(x) { (sh.rows[r - 1] ||= [])[c - 1] = x; return this; },
        setFontWeight() { return this; },
        setNumberFormat() { return this; },
        setNumberFormats() { return this; },
      };
    },
    setFrozenRows() {},
  };
  const sheets = {};
  const ss = { getId: () => 'sheet-id', getUrl: () => 'https://docs.google.com/spreadsheets/d/sheet-id', getSheets: () => Object.values(sheets), getSheetByName: (n) => sheets[n], insertSheet: (n) => (sheets[n] = new Sheet(n)), deleteSheet() {}, setSpreadsheetTimeZone() {} };
  const cache = {}, props = {};
  const ctx = {
    console, JSON, Date, Math, Number, String, Array, Object, RegExp, Error, isFinite,
    SpreadsheetApp: { openById: () => ss, create: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, getAll: (ks) => Object.fromEntries(ks.map((k) => [k, cache[k]])), putAll: (o) => Object.assign(cache, o) }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType() { return t; } }), MimeType: { JSON: 'json' } },
    Utilities: {
      formatDate: (d) => d.toISOString().slice(0, 10), DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      computeDigest: (a, t) => [...crypto.createHash('sha256').update(t).digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
  };
  vm.createContext(ctx);
  for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).sort()) vm.runInContext(fs.readFileSync(new URL(f, ROOT), 'utf8'), ctx, { filename: f });
  return { ctx, sheets };
}

const { ctx, sheets } = load();
const APP = ctx.APP;
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} }));
const get = (q) => JSON.parse(ctx.doGet({ parameter: q }));
const xpVar = APP.xp[APP.variantXp][0];
const offer = Object.keys(APP.offers)[0];
const base = { action: 'preorder', offer, variant: xpVar, email: 'buyer@example.com', company: 'Agence Test', country: 'FR', siren: '988741773',
  website: 'https://example.com', size: APP.sizes[0], role: APP.roles[0], consent: true, consent_version: APP.consentVersion, page: '/' + APP.site + '/' };

// ping
assert.equal(get({ action: 'ping' }).site, APP.site);

// track: counted, excluded, legacy, refused
assert.deepEqual(post({ action: 'track', v: 2, site: APP.site, page: '/' + APP.site + '/', event: 'view', device: 'mobile', variant: xpVar }), { ok: true });
assert.equal(sheets.Stats.rows.length, 2);
assert.equal(sheets.Stats.rows[1][2], '/');
assert.equal(sheets.Stats.rows[1][4], xpVar);
post({ action: 'track', v: 2, site: APP.site, page: '/' + APP.site + '/', event: 'view', device: 'mobile', variant: xpVar });
assert.equal(sheets.Stats.rows[1][9], 2, 'same key increments');
post({ action: 'track', v: 2, site: APP.site, page: '/x/', event: 'view', excluded: 'notrack' });
post({ action: 'track', site: APP.site, page: '/x/', event: 'view' });
assert.deepEqual(sheets.Exclus.rows.slice(1).map((r) => r[4]), ['notrack', 'legacy']);
assert.equal(post({ action: 'track', v: 2, site: 'other-site', page: '/', event: 'view' }).error, 'bad_request');
assert.equal(post({ action: 'track', v: 2, site: APP.site, page: '/', event: 'nope' }).field, 'event');
post({ action: 'track', v: 2, site: APP.site, page: '/', event: APP.events[2], detail: 'BAD VALUE!' });
assert.equal(sheets.Stats.rows.at(-1)[5], '', 'detail outside the slug pattern is dropped');

// preorder: validation
assert.equal(post({ ...base, consent: false }).error, 'consent_required');
assert.equal(post({ ...base, consent_version: 'old' }).error, 'consent_outdated');
assert.equal(post({ ...base, siren: '123456789' }).field, 'siren');
assert.equal(post({ ...base, email: 'nope' }).field, 'email');
assert.equal(post({ ...base, offer: 'other' }).field, 'offer');
assert.equal(post({ ...base, variant: 'z' }).field, 'variant');
assert.equal(post({ ...base, company: '' }).field, 'company');
assert.equal(post({ ...base, country: 'XY' }).field, 'country');
assert.deepEqual(post({ ...base, hp: 'bot' }), { ok: true });
assert.equal(sheets.Preorders, undefined, 'nothing written yet');
assert.equal(get({ ...base }).error, 'method_not_allowed', 'GET cannot write a pre-order');
if (APP.websiteRequired) assert.equal(post({ ...base, website: '' }).field, 'website');

// preorder: stored, deduplicated, test rows kept out of Stats
const r1 = post(base);
assert.equal(r1.ok, true);
assert.equal(r1.updated, false);
const row = sheets.Preorders.rows[1];
assert.equal(row[2], APP.site);
assert.equal(row[4], APP.offers[offer][xpVar]);
assert.equal(row[8], '988741773');
assert.equal(row[19], 'yes');
assert.equal(post({ ...base, message: '=HYPERLINK("x")' }).updated, true);
assert.equal(sheets.Preorders.rows.length, 2, 'same e-mail + offer updates the row');
assert.equal(sheets.Preorders.rows[1][14], '\'=HYPERLINK("x")', 'formula injection neutralised');
assert.ok(!sheets.Stats.rows.some((r) => r[3] === 'preorder_ok'), 'test e-mails are not counted');
const real = post({ ...base, email: 'contact@agence-reelle.fr' });
assert.equal(real.zone, 'fr');
assert.ok(sheets.Stats.rows.some((r) => r[3] === 'preorder_ok' && r[5] === offer && r[6] === '(server)'));
const eu = post({ ...base, email: 'info@agence.be', country: 'BE', siren: '' });
assert.equal(eu.zone, 'eu-other');
assert.equal(sheets.Preorders.rows.at(-1)[18], 'hors_zone');
assert.equal(sheets.Preorders.rows.at(-1)[8], '', 'no SIREN outside France');

// admin views
assert.equal(post({ action: 'summary' }).error, 'forbidden');
const key = (process.env[APP.site.toUpperCase().replace(/-/g, '_') + '_ADMIN_KEY'] || '');
if (key) {
  const s = post({ action: 'summary', key });
  assert.equal(s.preorders.real, 2);
  assert.equal(s.preorders.test, 1);
  assert.equal(post({ action: 'purge_tests', key }).deleted, 1);
}

// cro.js batch accepted for this site only
assert.equal(post({ action: 'track', kind: 'cro', v: 2, site: APP.site, page: '/' + APP.site + '/', device: 'desktop', e: [['pv', '', ''], ['scroll', '', '50'], ['xp', APP.variantXp, xpVar + '.n']] }).ok, true);
assert.ok(sheets.Comportement.rows.length >= 3);
assert.ok(sheets.Experiences.rows.length >= 2);
assert.notEqual(post({ action: 'track', kind: 'cro', v: 2, site: 'other', page: '/', e: [['pv', '', '']] }).ok, true);

console.log('gas tests ok (' + APP.site + ')');
