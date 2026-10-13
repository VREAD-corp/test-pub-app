/*! AppSeuil calc-core.js: break-even maths of paid installs. Runs in the browser; nothing typed is sent. */
window.AppSeuil = (function () {
  // All rates in percent (0-100). arpu = average amount paid per paying user over the chosen period, VAT included.
  function compute(i) {
    var pct = function (v) { return Math.max(0, Math.min(100, Number(v) || 0)) / 100; };
    var installToPaid = i.trial ? pct(i.trialRate) * pct(i.trialToPaid) : pct(i.directRate);
    var netPerPayer = Math.max(0, Number(i.arpu) || 0) / (1 + pct(i.vat)) * (1 - pct(i.storeFee)) * (1 - pct(i.refund));
    var revPerInstall = netPerPayer * installToPaid;
    var cpi = Math.max(0, Number(i.cpi) || 0);
    var out = {
      installToPaid: installToPaid,                 // share of installs that pay
      netPerPayer: netPerPayer,                     // what you keep per payer (after VAT, store fee, refunds)
      revPerInstall: revPerInstall,                 // = break-even CPI
      breakEvenCpi: revPerInstall,
      maxCostPerTrial: i.trial && pct(i.trialRate) > 0 ? revPerInstall / pct(i.trialRate) : null,
      maxCpa: netPerPayer,                          // max cost per paying user
      payersPer1000: installToPaid * 1000,
      roas: cpi > 0 ? revPerInstall / cpi : null,   // net revenue / ad spend over the period
      resultPer1000: cpi > 0 ? (1000 / cpi) * revPerInstall - 1000 : null,
      profitable: cpi > 0 ? revPerInstall >= cpi : null,
      neededLift: cpi > 0 && revPerInstall > 0 ? cpi / revPerInstall : null,   // conversion multiplier needed to break even
    };
    return out;
  }
  function bucket(v) { return v < 0.5 ? 'seuil-lt0.5' : v < 1 ? 'seuil-0.5-1' : v < 2 ? 'seuil-1-2' : v < 4 ? 'seuil-2-4' : 'seuil-gt4'; }
  return { compute: compute, bucket: bucket };
})();
