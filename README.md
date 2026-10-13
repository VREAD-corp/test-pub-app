# AppSeuil

Free break-even calculator for paid app installs (CPI, trial rate, conversion, revenue per payer, VAT, store fee, refunds; runs in the browser, nothing typed is sent) with sourced benchmark ranges (AppsFlyer, RevenueCat 2026, Apple, Google Play), plus a fake door for a « test publicitaire accompagné » (690 € HT, or 390 € HT plan only; A/B on which tier comes first). No result is ever promised.

Live: https://outils.vread.fr/test-pub-app/ (GitHub Pages of `VREAD-corp/test-pub-app`, branch `main`, folder `/docs`). Goal-v4 experiment of READ FRANCE SAS, built and run by Octave (its AI agent). Independent of the Vread app and vread.fr. Journal: `VREAD-corp/octave-asset-ventures` (`experiments/`, `ventures/`).

**Fake door.** The paid offer is not on sale: the form records a pre-order (no card, no payment, no commitment) in this site's own Apps Script + Sheet. Nothing here uses octave-checkout.

## Layout

| Path | What |
|---|---|
| `src/pages/*.html` | Pages (`<!--meta {json}-->` header: path, title, description, scripts) |
| `site.config.mjs` | Brand, Apps Script URL, A/B config (`OCTAVE_XP`), JSON-LD, forbidden claims |
| `build.mjs` | Static build, no dependency -> `docs/` (sitemap, robots, fingerprinted assets) |
| `src/assets/cro.js` | Shared behaviour counters and A/B variants, byte-identical to `octave-checkout/gas/web/cro.js` |
| `tools/mesure.template.js` | Cookieless audience counter (`v:2`, bots/webdriver/`octave_notrack=1` counted apart), generated into `assets/mesure.js` |
| `src/assets/preorder.js` | Pre-order form -> `action=preorder` |
| `gas/src/` | Apps Script web app: `App.js` (site config), `Code.js` (track, preorder, summary, purge_tests, cro, cro_init), `Cro.js` (byte-identical to octave-checkout) |

## Backend

Apps Script project `test-pub-app-gas (READ FRANCE SAS)`, script id `1y78YeKYaEH-h9RN0APz6Qirardlu2vcmKmZXZVfMKhpHIe6ohscwJGnP`, owner vincent.cance@gmail.com, only scope `spreadsheets`. Web app `https://script.google.com/macros/s/AKfycbzw9sbyjdlMH0cxdrKj7xM895FmdH92d6uwDiQjIREQg-dRWAr4pjlA3-D9spMcRD_2/exec`. It creates its own Sheet on first use (tabs `Preorders`, `Stats`, `Exclus`, `Comportement`, `Experiences`). Redeploy: `bash gas/scripts/deploy.sh` (same deployment id). Admin key: `~/.config/octave/test-pub-app.env` (never committed; the code holds its SHA-256).

Read the numbers: `. ~/.config/octave/test-pub-app.env; curl -sL -d "{\"action\":\"summary\",\"key\":\"$KEY\"}" <exec url>` (counts only, no e-mails). Weekly CRO report: backend `test-pub-app` in `vread-revenue-lab/tools/cro-sources.json`.

## Commands

```bash
npm test                 # build + static checks (lint-ia >= 85 on every page, links, JSON-LD, claims) + backend unit tests
node tests/e2e.mjs       # browser test at 390 px and 1440 px against docs/ (Apps Script mocked)
BASE_URL=https://outils.vread.fr/test-pub-app/ node tests/e2e.mjs   # live: real form -> real Sheet (@example.com, purged)
```
