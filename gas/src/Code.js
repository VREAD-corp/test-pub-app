/**
 * Fake-door web app of one goal-v4 test site (READ FRANCE SAS). Standalone Apps Script with its own Sheet.
 * Separate from octave-checkout: nothing here takes a payment, creates a PaymentIntent or sends an e-mail.
 * The same Code.js runs for every v4 fake-door site; Config.js (APP) holds what differs.
 *
 * Actions (POST text/plain JSON, or GET with the same fields as query parameters):
 *   track        cookieless, anonymous daily counters (Stats tab), same pattern as octave-checkout Track.js.
 *                Hits flagged `excluded` by mesure.js (crawler or headless user agent, navigator.webdriver, our
 *                tests with octave_notrack=1) and hits without `v` (old snippet: `legacy`) go to the Exclus tab.
 *                With `kind: 'cro'` the hit is the shared cro.js batch (Cro.js, vendored byte-identical from
 *                octave-checkout): daily counters in the Comportement and Experiences tabs.
 *   preorder     pre-order request (fake door: no payment, no commitment) -> Preorders tab
 *   ping         health check
 *   summary      counts for the operator (admin key; never returns e-mails), with `cro` (today's behaviour and A/B)
 *   cro          aggregated behaviour and A/B summary for the weekly CRO report (key: Script Property CRO_KEY_SHA256)
 *   cro_init     POST only: stores the SHA-256 of the CRO read key once
 *   purge_tests  deletes Preorders rows created by automated tests (admin key)
 *
 * The spreadsheet is created on first use and its id kept in Script Properties (SHEET_ID). Only scope: spreadsheets.
 */

var PREORDER_HEADER = ['created_at', 'updated_at', 'site', 'offer', 'price_eur_ht', 'variant', 'email', 'company', 'siren', 'country', 'zone',
  'website', 'size', 'role', 'message', 'consent_version', 'page', 'source', 'status', 'test'];
var STATS_HEADER = ['date', 'site', 'page', 'event', 'variant', 'detail', 'source', 'medium', 'campaign', 'count', 'mobile', 'desktop', 'updated_at'];
var STATS_KEYS = 9;
var EXCL_HEADER = ['date', 'site', 'page', 'event', 'reason', 'count', 'mobile', 'desktop', 'updated_at'];
var EXCL_KEYS = 5;
var EXCL_REASONS = ['webdriver', 'bot', 'notrack', 'legacy'];
var OWN_HOSTS = [APP.host, 'jalonel.com'];   // Jalonel only: the reading sites are a separate brand (referrals from them are external)
// EU member states other than France: interest is recorded (demand signal) but cannot be invoiced today.
var EU_OTHER = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'MC', 'EU'];

// Shared cro.js counters (Cro.js): same spreadsheet, same day boundary and pages as the Stats tab.
var CRO_SITES_ = [APP.site];
var CRO_EXPERIMENTS_ = APP.xp;
var CRO_TZ_ = APP.tz;
function croBook_() { return ss_(); }
function croPage_(site, page) { return trackPage_(page); }

function doGet(e) { return handle_(e, (e && e.parameter) || {}); }

function doPost(e) {
  var req = {};
  e = e || {};
  e.isPost_ = true;
  try { req = JSON.parse((e.postData && e.postData.contents) || '{}') || {}; } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  if (typeof req !== 'object' || Array.isArray(req)) return json_({ ok: false, error: 'bad_json' });
  return handle_(e, req);
}

function handle_(e, req) {
  var action = String((e && e.parameter && e.parameter.action) || req.action || '');
  try {
    switch (action) {
      case 'track': return json_(req.kind === 'cro' ? croTrack_(req) : track_(req));
      case 'cro': return json_(croAction_(req));
      case 'cro_init': return json_(e && e.isPost_ ? croInit_(req) : { ok: false, error: 'method_not_allowed' });
      case 'preorder': return json_(e && e.isPost_ ? preorder_(req) : { ok: false, error: 'method_not_allowed' });
      case 'summary': return json_(summary_(req));
      case 'purge_tests': return json_(purgeTests_(req));
      case 'ping': return json_({ ok: true, app: APP.name, site: APP.site, consentVersion: APP.consentVersion });
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    if (err && err.userError) return json_({ ok: false, error: err.code, field: err.field || '' });
    console.error(String((err && err.stack) || err));
    return json_({ ok: false, error: 'server_error' });
  }
}

/* ---------- helpers ---------- */

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function userError_(code, field) { var e = new Error(code); e.userError = true; e.code = code; e.field = field; return e; }
function now_() { return new Date(); }
function day_(d) { return Utilities.formatDate(d, APP.tz, 'yyyy-MM-dd'); }
/** Text cell: a leading quote stops formula injection (=, +, -, @). */
function txt_(v) { var s = String(v === undefined || v === null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
function cell_(v) { return v instanceof Date ? Utilities.formatDate(v, APP.tz, 'yyyy-MM-dd') : String(v); }
function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function clean_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function token_(v, max) { return String(v === undefined || v === null ? '' : v).toLowerCase().replace(/[^a-z0-9._ -]+/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
function pick_(v, list, dflt) { v = String(v === undefined || v === null ? '' : v); return list.indexOf(v) >= 0 ? v : dflt; }
function isTestEmail_(email) { return /@example\.(com|org)$/.test(email); }
function checkAdmin_(req) { if (!req.key || sha256Hex_(String(req.key)) !== APP.adminHash) throw userError_('forbidden'); }
function variants_() { return APP.xp[APP.variantXp] || ['a']; }

function ss_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    id = props.getProperty('SHEET_ID');
    if (id) return SpreadsheetApp.openById(id);
    var ss = SpreadsheetApp.create(APP.sheetTitle);
    ss.setSpreadsheetTimeZone(APP.tz);
    props.setProperty('SHEET_ID', ss.getId());
    return ss;
  } finally { lock.releaseLock(); }
}

function tab_(name, header) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Feuille 1');
    if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  }
  return sh;
}

function rateOk_(bucket, max) {
  var cache = CacheService.getScriptCache();
  var k = 'rl:' + bucket + ':' + Math.floor(now_().getTime() / 60000);
  var n = Number(cache.get(k) || 0);
  if (n >= max) return false;
  cache.put(k, String(n + 1), 120);
  return true;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw userError_('busy');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- tracking (cookieless, anonymous daily counters) ---------- */

function trackPage_(page) {
  var p = String(page === undefined || page === null ? '' : page).slice(0, 300).toLowerCase().replace(/[?#].*$/, '');
  if (!/^\/[a-z0-9\/._%~-]*$/.test(p)) return null;
  var base = '/' + APP.site;
  if (p === base || p.indexOf(base + '/') === 0) p = p.slice(base.length) || '/';
  p = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/{2,}/g, '/');
  return p.slice(0, 80) || '/';
}

function sourceOf_(req) {
  var ref = String(req.ref_domain || '').toLowerCase().replace(/^www\./, '');
  if (ref && !/^[a-z0-9.-]{1,100}$/.test(ref)) ref = '';
  if (OWN_HOSTS.indexOf(ref) >= 0) ref = '(internal)';
  return token_(req.utm_source, 50) || ref || '(direct)';
}

function validateTrack_(req) {
  if (String(req.site || '') !== APP.site) throw userError_('bad_request', 'site');
  var event = String(req.event || '');
  if (APP.events.indexOf(event) < 0) throw userError_('bad_request', 'event');
  var page = trackPage_(req.page);
  if (page === null) throw userError_('bad_request', 'page');
  if (req.ts !== undefined && req.ts !== null && req.ts !== '') {
    var ts = Number(req.ts);
    if (!isFinite(ts) || Math.abs(ts - now_().getTime()) > 2 * 86400 * 1000) throw userError_('bad_request', 'ts');
  }
  var detail = String(req.detail === undefined || req.detail === null ? '' : req.detail);
  if (!/^[a-z0-9.-]{0,24}$/.test(detail)) detail = '';
  return {
    date: day_(now_()), site: APP.site, page: page, event: event,
    variant: pick_(req.variant, variants_(), ''), detail: detail,
    source: sourceOf_(req), medium: token_(req.utm_medium, 30), campaign: token_(req.utm_campaign, 50),
    device: req.device === 'mobile' || req.device === 'desktop' ? req.device : '',
    reason: req.excluded ? (EXCL_REASONS.indexOf(String(req.excluded)) >= 0 ? String(req.excluded) : 'bot') : (req.v ? '' : 'legacy'),
  };
}

function track_(req) {
  var hit = validateTrack_(req);
  if (!rateOk_('track', 240)) return { ok: false, error: 'rate_limited' };
  withLock_(function () { if (hit.reason) incrementExcluded_(hit); else incrementStat_(hit); });
  return { ok: true };
}

/** Caller holds the script lock. */
function incrementStat_(h) {
  incrementRow_('Stats', STATS_HEADER, STATS_KEYS, [h.date, h.site, h.page, h.event, h.variant, h.detail, h.source, h.medium, h.campaign], h.device);
}

/** Hits that are not visits, keyed by reason. Caller holds the script lock. */
function incrementExcluded_(h) {
  incrementRow_('Exclus', EXCL_HEADER, EXCL_KEYS, [h.date, h.site, h.page, h.event, h.reason], h.device);
}

/** Daily counter row `keys` (first is the date) in tab `name`: incremented, or appended. */
function incrementRow_(name, header, nKeys, keys, device) {
  var sh = tab_(name, header);
  var key = keys.join('\u001f');
  var last = sh.getLastRow();
  var rowNum = 0;
  var n = Math.min(Math.max(last - 1, 0), 3000);
  if (n > 0) {
    var vals = sh.getRange(last - n + 1, 1, n, nKeys).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (cell_(vals[i][0]) < keys[0]) break;
      if (vals[i].map(cell_).join('\u001f') === key) { rowNum = last - n + 1 + i; break; }
    }
  }
  var stamp = now_().toISOString();
  if (!rowNum) {
    sh.appendRow(keys.map(txt_).concat([1, device === 'mobile' ? 1 : 0, device === 'desktop' ? 1 : 0, stamp]));
  } else {
    var c = sh.getRange(rowNum, nKeys + 1, 1, 3).getValues()[0];
    sh.getRange(rowNum, nKeys + 1, 1, 4).setValues([[Number(c[0] || 0) + 1, Number(c[1] || 0) + (device === 'mobile' ? 1 : 0), Number(c[2] || 0) + (device === 'desktop' ? 1 : 0), stamp]]);
  }
}

/* ---------- pre-order (fake door: nothing is charged, nothing is committed) ---------- */

function validEmail_(v) {
  var s = clean_(v, 254).toLowerCase();
  if (!/^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(s) || s.indexOf('..') >= 0) throw userError_('bad_request', 'email');
  return s;
}

/** SIREN: 9 digits, Luhn checksum (La Poste's 356000000 group is the documented exception). */
function validSiren_(v) {
  var s = String(v === undefined || v === null ? '' : v).replace(/[\s.]/g, '');
  if (!/^\d{9}$/.test(s)) return '';
  if (/^356000000$/.test(s)) return s;
  var sum = 0;
  for (var i = 0; i < 9; i++) {
    var d = Number(s.charAt(8 - i));
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0 ? s : '';
}

function validUrl_(v, required) {
  var s = clean_(v, 200);
  if (!s) { if (required) throw userError_('bad_request', 'website'); return ''; }
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  var m = s.match(/^https?:\/\/([a-z0-9.-]+\.[a-z]{2,24})(:\d+)?(\/[^\s]*)?$/i);
  if (!m) throw userError_('bad_request', 'website');
  return s;
}

function preorder_(req) {
  if (req.hp) return { ok: true }; // honeypot: silently ignore bots
  if (req.consent !== true && req.consent !== 'true') throw userError_('consent_required', 'consent');
  if (String(req.consent_version || '') !== APP.consentVersion) throw userError_('consent_outdated', 'consent_version');
  var offer = String(req.offer || '');
  if (!APP.offers[offer]) throw userError_('bad_request', 'offer');
  var variant = pick_(req.variant, variants_(), '');
  if (!variant) throw userError_('bad_request', 'variant');
  var email = validEmail_(req.email);
  var company = clean_(req.company, 120);
  if (company.length < 2) throw userError_('bad_request', 'company');
  var country = String(req.country || 'FR').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || (APP.countries && APP.countries.indexOf(country) < 0)) throw userError_('bad_request', 'country');
  var siren = '';
  if (country === 'FR') {
    siren = validSiren_(req.siren);
    if (!siren) throw userError_('bad_request', 'siren');
  }
  var zone = country === 'FR' ? 'fr' : EU_OTHER.indexOf(country) >= 0 ? 'eu-other' : 'non-eu';
  var rec = {
    offer: offer, price: APP.offers[offer][variant], variant: variant, email: email, company: company, siren: siren, country: country, zone: zone,
    website: validUrl_(req.website, !!APP.websiteRequired),
    size: APP.sizes ? pick_(req.size, APP.sizes, '') : '', role: APP.roles ? pick_(req.role, APP.roles, '') : '',
    message: clean_(req.message, 1000), page: trackPage_(req.page) || '', source: sourceOf_(req), test: isTestEmail_(email),
  };
  if (!rateOk_('preorder', 20)) throw userError_('rate_limited');
  var updated = withLock_(function () {
    var sh = tab_('Preorders', PREORDER_HEADER);
    var stamp = now_().toISOString();
    var last = sh.getLastRow();
    var row = 0;
    if (last >= 2) {
      var keys = sh.getRange(2, 4, last - 1, 4).getValues(); // offer, price, variant, email
      for (var i = keys.length - 1; i >= 0; i--) if (String(keys[i][3]) === email && String(keys[i][0]) === offer) { row = i + 2; break; }
    }
    var values = [APP.site, rec.offer, rec.price, rec.variant, txt_(rec.email), txt_(rec.company), txt_(rec.siren), rec.country, rec.zone,
      txt_(rec.website), rec.size, rec.role, txt_(rec.message), APP.consentVersion, txt_(rec.page), txt_(rec.source),
      zone === 'eu-other' ? 'hors_zone' : 'nouvelle', rec.test ? 'yes' : ''];
    if (row) sh.getRange(row, 2, 1, 1 + values.length).setValues([[stamp].concat(values)]);
    else sh.appendRow([stamp, stamp].concat(values));
    if (!row && !rec.test) incrementStat_({ date: day_(now_()), site: APP.site, page: rec.page || '/', event: 'preorder_ok', variant: rec.variant, detail: rec.offer, source: '(server)', medium: '', campaign: '', device: '' });
    return !!row;
  });
  return { ok: true, updated: updated, zone: zone };
}

/* ---------- operator views (admin key) ---------- */

function summary_(req) {
  checkAdmin_(req);
  var out = { ok: true, site: APP.site, sheetUrl: ss_().getUrl(), preorders: { real: 0, test: 0, byOffer: {}, byVariant: {}, byZone: {} }, stats: {} };
  var po = tab_('Preorders', PREORDER_HEADER);
  if (po.getLastRow() >= 2) po.getRange(2, 1, po.getLastRow() - 1, PREORDER_HEADER.length).getValues().forEach(function (r) {
    var test = r[19] === 'yes';
    out.preorders[test ? 'test' : 'real']++;
    if (test) return;
    out.preorders.byOffer[r[3]] = (out.preorders.byOffer[r[3]] || 0) + 1;
    var v = r[5] + ' (' + r[4] + ' € HT)';
    out.preorders.byVariant[v] = (out.preorders.byVariant[v] || 0) + 1;
    out.preorders.byZone[r[10]] = (out.preorders.byZone[r[10]] || 0) + 1;
  });
  var st = tab_('Stats', STATS_HEADER);
  if (st.getLastRow() >= 2) st.getRange(2, 1, st.getLastRow() - 1, STATS_HEADER.length).getValues().forEach(function (r) {
    var k = cell_(r[0]) + ' ' + r[3] + (r[4] ? ' ' + r[4] : '') + (r[5] ? ' ' + r[5] : '');
    out.stats[k] = (out.stats[k] || 0) + Number(r[9] || 0);
  });
  out.excluded = {};
  out.views = {};
  var dayOf = function (d) { return out.views[d] || (out.views[d] = { counted: 0, excluded: 0, raw: 0 }); };
  if (st.getLastRow() >= 2) st.getRange(2, 1, st.getLastRow() - 1, STATS_HEADER.length).getValues().forEach(function (r) {
    if (r[3] === 'view') { var d = dayOf(cell_(r[0])); d.counted += Number(r[9] || 0); d.raw += Number(r[9] || 0); }
  });
  var ex = tab_('Exclus', EXCL_HEADER);
  if (ex.getLastRow() >= 2) ex.getRange(2, 1, ex.getLastRow() - 1, EXCL_HEADER.length).getValues().forEach(function (r) {
    var d = cell_(r[0]);
    var k = d + ' ' + r[3] + ' ' + r[4];
    out.excluded[k] = (out.excluded[k] || 0) + Number(r[5] || 0);
    if (r[3] === 'view') { dayOf(d).excluded += Number(r[5] || 0); dayOf(d).raw += Number(r[5] || 0); }
  });
  var today = day_(now_());
  out.cro = croSummary_(today, today);
  if (req.email) out.hasEmail = po.getLastRow() >= 2 && po.getRange(2, 7, po.getLastRow() - 1, 1).getValues().some(function (r) { return String(r[0]) === String(req.email).toLowerCase(); });
  return out;
}

function purgeTests_(req) {
  checkAdmin_(req);
  return withLock_(function () {
    var n = 0;
    var sh = tab_('Preorders', PREORDER_HEADER);
    for (var r = sh.getLastRow(); r >= 2; r--) if (sh.getRange(r, 20).getValue() === 'yes') { sh.deleteRow(r); n++; }
    return { ok: true, deleted: n };
  });
}
