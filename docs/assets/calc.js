// AppSeuil calculator UI. Only a bucket of the break-even CPI is counted ("calc_done", e.g. seuil-1-2), never the values typed.
(function () {
  var A = window.AppSeuil, f = document.getElementById('calc');
  if (!A || !f) return;
  var out = document.getElementById('calc-out');
  var started = false, sent = 0;
  var track = function (e, d) { try { window.mTrack(e, d); } catch (err) { /* off */ } };
  var num = function (n) { return f.elements[n].value === '' ? NaN : Number(String(f.elements[n].value).replace(',', '.')); };
  var cur = function () { return f.elements.currency.value; };
  var money = function (v, d) { if (v === null || !isFinite(v)) return '–'; return v.toLocaleString('fr-FR', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }) + ' ' + cur(); };
  var unit = function () { return cur() === '$' ? 'dollar' : 'euro'; };
  var pc = function (v, d) { return (v * 100).toLocaleString('fr-FR', { maximumFractionDigits: d === undefined ? 2 : d }) + ' %'; };
  function syncModel() {
    var trial = f.elements.model.value === 'trial';
    document.getElementById('trial-fields').hidden = !trial;
    document.getElementById('direct-fields').hidden = trial;
  }
  f.elements.model.forEach(function (r) { r.addEventListener('change', syncModel); });
  syncModel();
  f.elements.storePreset.addEventListener('change', function () { if (f.elements.storePreset.value) f.elements.storeFee.value = f.elements.storePreset.value; });
  f.addEventListener('input', function () { if (!started) { started = true; track('calc_start'); } });
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var i = { trial: f.elements.model.value === 'trial', trialRate: num('trialRate'), trialToPaid: num('trialToPaid'), directRate: num('directRate'),
      arpu: num('arpu'), vat: num('vat'), storeFee: num('storeFee'), refund: num('refund'), cpi: num('cpi') };
    var bad = Object.keys(i).filter(function (k) { return k !== 'trial' && (i.trial ? k !== 'directRate' : k !== 'trialRate' && k !== 'trialToPaid') && !(i[k] >= 0); });
    if (bad.length) { out.hidden = false; out.innerHTML = '<p class="msg err" style="display:block">Renseignez tous les champs avec des nombres positifs.</p>'; return; }
    var r = A.compute(i);
    var verdict = r.profitable === null ? '' : r.profitable
      ? '<p class="verdict" style="color:var(--ok)">À ' + money(i.cpi) + ' l’installation, chaque ' + unit() + ' dépensé rapporte ' + r.roas.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + cur() + ' net sur la période. La publicité se rembourse, avec une marge de ' + pc(r.roas - 1, 0) + '.</p>'
      : '<p class="verdict" style="color:var(--bad)">À ' + money(i.cpi) + ' l’installation, la publicité ne se rembourse pas sur la période : chaque ' + unit() + ' dépensé rapporte ' + (r.roas || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + cur() + ' net. Il faudrait un coût par installation de ' + money(r.breakEvenCpi) + ' au plus, ou une conversion ' + (r.neededLift ? r.neededLift.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' fois plus forte' : 'non nulle') + '.</p>';
    out.hidden = false;
    out.innerHTML = '<h2>Résultat</h2>' + verdict +
      '<div class="out"><div><span>Coût par installation maximal (seuil)</span><b>' + money(r.breakEvenCpi) + '</b></div>' +
      '<div><span>Revenu net par payant</span><b>' + money(r.netPerPayer) + '</b></div>' +
      '<div><span>Payants pour 1 000 installations</span><b>' + r.payersPer1000.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + '</b></div>' +
      (r.maxCostPerTrial !== null ? '<div><span>Coût maximal par essai</span><b>' + money(r.maxCostPerTrial) + '</b></div>' : '') +
      '<div><span>Résultat net pour 1 000 ' + cur() + ' dépensés</span><b>' + money(r.resultPer1000, 0) + '</b></div></div>' +
      '<p class="small">Calcul : prix payé ÷ (1 + TVA) × (1 − commission du store) × (1 − remboursements) × taux d’installation à payant. Ce seuil couvre la seule période choisie pour le revenu moyen ; il ne compte ni vos coûts fixes ni la valeur des utilisateurs gratuits.</p>' +
      '<div class="card noprint"><p><b>Envie de vérifier ces hypothèses avec un vrai budget plafonné ?</b> Le test publicitaire accompagné prépare une campagne en pause dans votre compte, avec des règles d’arrêt écrites et un bilan au 7e jour.</p><a class="btn" href="' + window.SITE.base + 'test-accompagne/" data-mesure="cta_click" data-detail="result">Voir le test accompagné</a></div>';
    if (sent < 5) { sent++; track('calc_done', A.bucket(r.breakEvenCpi)); }
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
