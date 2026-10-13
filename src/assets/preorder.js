// Pre-order form (fake door): sends the request to this site's own Apps Script. No payment, no card, no commitment.
(function () {
  var S = window.SITE || {};
  var f = document.getElementById('preorder');
  if (!f) return;
  var msg = document.getElementById('preorder-msg');
  var btn = f.querySelector('button[type=submit]');
  var siren = f.querySelector('[name=siren]');
  var country = f.querySelector('[name=country]');
  var sirenRow = document.getElementById('siren-row');
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var track = function (e, d) { try { window.mTrack(e, d); } catch (err) { /* measurement off */ } };
  var variant = function () { try { return (window.octaveCro && window.octaveCro.v(S.xp)) || 'a'; } catch (e) { return 'a'; } };

  function luhnSiren(v) {
    v = String(v || '').replace(/[\s.]/g, '');
    if (!/^\d{9}$/.test(v)) return false;
    if (v === '356000000') return true;
    var sum = 0;
    for (var i = 0; i < 9; i++) { var d = +v.charAt(8 - i); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
    return sum % 10 === 0;
  }
  function syncCountry() {
    var fr = !country || country.value === 'FR';
    if (sirenRow) sirenRow.hidden = !fr;
    if (siren) siren.required = fr;
    var eu = document.getElementById('eu-note');
    if (eu) eu.hidden = !(country && (country.value === 'EU' || country.value === 'BE' || country.value === 'LU' || country.value === 'MC'));
  }
  if (country) { country.addEventListener('change', syncCountry); syncCountry(); }

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    msg.className = 'msg';
    var fr = !country || country.value === 'FR';
    if (fr && !luhnSiren(siren.value)) {
      msg.className = 'msg err';
      msg.textContent = 'Ce numéro SIREN ne semble pas valide (9 chiffres). Vérifiez-le sur annuaire-entreprises.data.gouv.fr.';
      siren.focus();
      return;
    }
    var data = { action: 'preorder', variant: variant(), consent: f.consent.checked, consent_version: S.consent, page: location.pathname,
      ref_domain: (document.referrer.split('/')[2] || ''), utm_source: new URLSearchParams(location.search).get('utm_source') || '' };
    ['offer', 'email', 'company', 'siren', 'country', 'website', 'size', 'role', 'message', 'hp'].forEach(function (k) {
      var el = f.elements[k];
      if (!el) return;
      if (el.length && el[0] && el[0].type === 'radio') { for (var i = 0; i < el.length; i++) if (el[i].checked) data[k] = el[i].value; }
      else data[k] = el.value;
    });
    if (!fr) data.siren = '';
    btn.disabled = true;
    track('preorder_submit', data.offer);
    fetch(S.api, { method: 'POST', body: JSON.stringify(data), credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok) { var e = new Error(r.error || 'error'); e.field = r.field; throw e; }
        try { window.octaveCro && window.octaveCro.goal('preorder'); } catch (e) { /* off */ }
        msg.className = 'msg ok';
        msg.innerHTML = '<b>Pré-commande enregistrée.</b> Rien n\'a été débité. ' +
          (r.zone === 'eu-other'
            ? 'Nous ne facturons pas encore hors de France dans l\'Union européenne : nous vous écrirons à ' + esc(data.email) + ' si cela change.'
            : 'Nous vous écrirons à ' + esc(data.email) + ' si le service ouvre, avec le périmètre et la date proposés. Vous déciderez alors de commander ou non.');
        f.reset();
        syncCountry();
        btn.disabled = false;
      })
      .catch(function (e) {
        btn.disabled = false;
        msg.className = 'msg err';
        var field = { email: 'l\'adresse e-mail', siren: 'le SIREN', company: 'le nom de la société', website: 'l\'adresse du site', country: 'le pays' }[e.field];
        msg.innerHTML = field ? 'Vérifiez ' + field + ', puis renvoyez le formulaire.'
          : 'L\'envoi n\'a pas abouti. Réessayez dans une minute, ou écrivez à <a href="mailto:' + S.mail + '">' + S.mail + '</a>.';
      });
  });
})();
