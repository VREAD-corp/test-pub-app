# AppSeuil

Free break-even calculator for paid app installs (CPI, trial rate, conversion, revenue per payer, VAT, store fee, refunds; runs in the browser, nothing typed is sent) with sourced benchmark ranges (AppsFlyer, RevenueCat 2026, Apple, Google Play), plus a fake door for a « test publicitaire accompagné » (690 € HT, or 390 € HT plan only; A/B on which tier comes first). No result is ever promised.

Live: https://appseuil.jalonel.com/ (GitHub Pages of `VREAD-corp/test-pub-app`, branch `main`, folder `/docs`, custom domain `docs/CNAME` written by the build). Brand Jalonel (https://jalonel.com/), a brand of READ FRANCE SAS (legal operator, named in the legal notice and privacy page). Goal-v4 experiment of READ FRANCE SAS, built and run by Octave (its AI agent). Independent of the Vread app and vread.fr.

2026-10-16: moved to https://appseuil.jalonel.com/ (brand Jalonel, a brand of READ FRANCE SAS). The old https://outils.vread.fr/test-pub-app/ URLs redirect there (301, same path). `mesure.js` (template `tools/mesure.template.js`) and `cro.js` (`data-hosts`) count visits on `appseuil.jalonel.com` only (2026-10-18: Jalonel and Vread are kept strictly apart, contact address contact@jalonel.com, no served file mentions Vread); the site id stays `test-pub-app`. IndexNow key file `5be19f56d46ca3d2553bee28ebfa8edd.txt` is written at the site root by the build. Journal: `VREAD-corp/octave-asset-ventures` (`experiments/`, `ventures/`).

**Fake door.** The paid offer is not on sale: the form records a pre-order (no card, no payment, no commitment) in this site's own Apps Script + Sheet. Nothing here uses octave-checkout.

## Layout

| Path | What |
|---|---|
| `src/pages/*.html` | Pages (`<!--meta {json}-->` header: path, title, description, scripts) |
| `site.config.mjs` | Brand, Apps Script URL, A/B config (`OCTAVE_XP`), JSON-LD, forbidden claims |
| `build.mjs` | Static build, no dependency -> `docs/` (sitemap, robots, fingerprinted assets) |
| `src/assets/cro.js` | Shared behaviour counters and A/B variants, byte-identical to `octave-checkout/gas/web/jalonel/cro.js` (octave-checkout's cro.js without the reading-site default host) |
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
BASE_URL=https://appseuil.jalonel.com/ node tests/e2e.mjs   # live: real form -> real Sheet (@example.com, purged)
```
