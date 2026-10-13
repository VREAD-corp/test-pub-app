// Break-even maths. node tests/calc.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../src/assets/calc-core.js', import.meta.url), 'utf8'), ctx);
const { compute, bucket } = ctx.window.AppSeuil;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} != ${b}`);
// 40 € TTC, VAT 20 %, store 15 %, refunds 4 % -> 40/1.2*0.85*0.96 = 27.2 € net per payer
// trial 6.5 % x 30 % = 1.95 % of installs pay -> 0.5304 € per install
let r = compute({ trial: true, trialRate: 6.5, trialToPaid: 30, arpu: 40, vat: 20, storeFee: 15, refund: 4, cpi: 2 });
near(r.netPerPayer, 27.2, 'net per payer');
near(r.installToPaid, 0.0195, 'install to paid');
near(r.breakEvenCpi, 0.5304, 'break-even CPI');
near(r.maxCostPerTrial, 0.5304 / 0.065, 'cost per trial');
near(r.roas, 0.2652, 'roas');
near(r.resultPer1000, 500 * 0.5304 - 1000, 'result per 1000');
assert.equal(r.profitable, false);
near(r.neededLift, 2 / 0.5304, 'lift');
// direct purchase model, no VAT (US price), Apple first-year 30 %
r = compute({ trial: false, directRate: 2, arpu: 60, vat: 0, storeFee: 30, refund: 3.4, cpi: 0.5 });
near(r.breakEvenCpi, 60 * 0.7 * 0.966 * 0.02, 'direct');
assert.equal(r.profitable, true);
assert.equal(r.maxCostPerTrial, null);
// guards
r = compute({ trial: true, trialRate: 150, trialToPaid: -5, arpu: 10, vat: 20, storeFee: 15, refund: 0, cpi: 0 });
assert.equal(r.installToPaid, 0);
assert.equal(r.roas, null);
assert.equal(bucket(0.53), 'seuil-0.5-1');
assert.equal(bucket(5), 'seuil-gt4');
assert.equal(bucket(0.1), 'seuil-lt0.5');
console.log('calc tests ok');
