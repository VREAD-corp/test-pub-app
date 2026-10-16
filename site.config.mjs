// Site configuration read by build.mjs.
const ORG = { '@type': 'Organization', '@id': 'https://jalonel.com/#org', name: 'Jalonel', url: 'https://jalonel.com/', parentOrganization: { '@type': 'Organization', name: 'READ FRANCE SAS', identifier: 'SIREN 988741773' } };

export default {
  repo: 'test-pub-app',
  site: 'test-pub-app',
  origin: 'https://appseuil.jalonel.com',
  indexNowKeys: ['5be19f56d46ca3d2553bee28ebfa8edd'],
  brand: 'AppSeuil',
  logo: 'App<span>Seuil</span>',
  accent: '#1d4ed8',
  api: 'https://script.google.com/macros/s/AKfycbzw9sbyjdlMH0cxdrKj7xM895FmdH92d6uwDiQjIREQg-dRWAr4pjlA3-D9spMcRD_2/exec',
  consentVersion: 'pc-2026-10-13',
  variantXp: 'price',
  // A/B: which tier is shown first and marked "recommandé" (a: 690 € test, b: 390 € plan). ?offre=a|b forces one.
  xp: [{ id: 'price', variants: ['a', 'b'], mode: 'tab', param: 'offre' }],
  nav: [['Calculateur de seuil', '/'], ['Test publicitaire accompagné', '/test-accompagne/']],
  // Never promise a result: no guaranteed ROAS, profit or installs.
  claims: [/garanti/i, /rentabilité assurée/i, /résultats? assurés?/i],
  footerNote: 'Les chiffres de référence sont des médianes publiées par des tiers ; ils ne prédisent pas les résultats de votre application.',
  schema(p, url) {
    if (p.page === 'home') return { '@type': 'SoftwareApplication', name: 'AppSeuil, calculateur de seuil de rentabilité publicitaire', url, applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web', inLanguage: 'fr', description: p.description, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, publisher: ORG };
    if (p.page === 'offer') return { '@type': 'Service', name: 'Test publicitaire accompagné pour application', url, serviceType: 'Test de campagne publicitaire', inLanguage: 'fr', provider: ORG,
      description: p.description, offers: [
        { '@type': 'Offer', name: 'Test accompagné', price: '690', priceCurrency: 'EUR', availability: 'https://schema.org/PreOrder', url, priceSpecification: { '@type': 'PriceSpecification', price: '690', priceCurrency: 'EUR', valueAddedTaxIncluded: false } },
        { '@type': 'Offer', name: 'Plan de test seul', price: '390', priceCurrency: 'EUR', availability: 'https://schema.org/PreOrder', url, priceSpecification: { '@type': 'PriceSpecification', price: '390', priceCurrency: 'EUR', valueAddedTaxIncluded: false } }] };
    return null;
  },
};
