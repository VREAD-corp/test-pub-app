// AppSeuil scenario for tests/e2e.mjs.
export async function scenario({ page, go, noHScroll, requests, posted, vp, LIVE, KEY, SITE, assert, shot }) {
  // 1. Calculator: default example is not profitable at 2 € CPI; nothing typed is sent.
  await go('');
  await noHScroll('home');
  await page.fill('#cpi', '2.37');
  const before = requests.length;
  await page.click('#calc button[type=submit]');
  await page.waitForSelector('#calc-out .out');
  const t = await page.textContent('#calc-out');
  assert.match(t, /0,53 €/, 'break-even CPI of the example (0,5304 €)');
  assert.match(t, /ne se rembourse pas/);
  await page.waitForTimeout(400);
  for (const r of requests.slice(before)) assert.ok(!r.body.includes('2.37') && !r.url.includes('2.37'), 'typed value leaked');
  // direct model, profitable
  await page.check('input[name=model][value=direct]');
  await page.fill('#directRate', '5');
  await page.fill('#cpi', '0.5');
  await page.click('#calc button[type=submit]');
  await page.waitForFunction(() => /se rembourse, avec une marge/.test(document.querySelector('#calc-out').textContent));
  await shot('calc');
  await noHScroll('home after result');

  // 2. Offer page: both tiers, A/B order, pre-order.
  await go('test-accompagne/?offre=b');
  await noHScroll('offer');
  const first = await page.evaluate(() => [...document.querySelectorAll('.tiers .card')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0].className);
  assert.match(first, /tier-390/, 'variant b shows the 390 € plan first');
  const body = await page.textContent('main');
  assert.ok(body.includes('690 € HT') && body.includes('390 € HT') && body.includes('Aucun paiement') && body.includes('pas encore ouvert'));
  await page.check('input[name=offer][value=plan-390]');
  await page.selectOption('#country', 'US');
  assert.equal(await page.isVisible('#siren'), false, 'no SIREN outside France');
  await page.fill('#email', `e2e-${vp.width}@example.com`);
  await page.fill('#company', 'Studio E2E');
  await page.check('input[name=consent]');
  await page.click('#preorder button[type=submit]');
  await page.waitForSelector('#preorder-msg.ok', { timeout: 30000 });
  assert.match(await page.textContent('#preorder-msg'), /Rien n'a été débité/);
  if (!LIVE) {
    const p = posted.filter((x) => x.action === 'preorder').at(-1);
    assert.equal(p.offer, 'plan-390');
    assert.equal(p.country, 'US');
    assert.equal(p.siren, '');
    assert.equal(p.variant, 'b');
  } else if (KEY) {
    const s = await fetch(SITE.api, { method: 'POST', body: JSON.stringify({ action: 'summary', key: KEY, email: `e2e-${vp.width}@example.com` }) }).then((r) => r.json());
    assert.equal(s.hasEmail, true, 'pre-order row in the Sheet');
  }
  await shot('offer-sent');
}
