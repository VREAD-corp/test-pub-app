/** Site configuration read by Code.js (loaded first: file names are evaluated in alphabetical order). */
var APP = {
  name: 'AppSeuil',
  site: 'test-pub-app',
  host: 'appseuil.jalonel.com',               // public site (brand Jalonel)
  tz: 'Europe/Paris',
  sheetTitle: 'AppSeuil : pré-commandes et statistiques (READ FRANCE SAS)',
  consentVersion: 'pc-2026-10-13',
  adminHash: 'b20ca990ad88929b9175196bb12ce2fc36c773e1637286ac534e9cc4d9561548',
  events: ['view', 'cta_click', 'calc_start', 'calc_done', 'offer_view', 'preorder_submit', 'preorder_ok'],
  xp: { price: ['a', 'b'] },        // a: 690 € offer first, b: 390 € plan first
  variantXp: 'price',
  offers: { 'test-690': { a: 690, b: 690 }, 'plan-390': { a: 390, b: 390 } },   // € HT, pre-order only
  countries: ['FR', 'CH', 'GB', 'US', 'CA', 'AU', 'BE', 'LU', 'MC', 'EU', 'ZZ'],
  websiteRequired: false,
  sizes: ['0', 'lt1000', '1000-5000', 'gt5000'],
  roles: ['ios', 'android', 'both', 'web'],
};
