const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULTS,
  OFFER_LANGUAGES,
  getOfferLanguageId,
  isOfferLanguageProductPath,
  buildOfferLanguageUrl,
  migrateSettings,
  loadSettings,
} = require('../settings.js');

const expected = {
  en: 1, fr: 2, de: 3, es: 4, it: 5, zh: 6, ja: 7, pt: 8,
  ru: 9, ko: 10, tw: 11, nl: 12, pl: 13, cs: 14, hu: 15,
};
const cardPath = '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025';
const etbPath = '/fr/Pokemon/Products/Elite-Trainer-Boxes/Example-ETB';
const boosterPath = '/en/Magic/Products/Booster-Boxes/Innistrad-Booster-Box';

test('maps each supported Cardmarket offer language to its native language ID', () => {
  assert.equal(OFFER_LANGUAGES[0].code, 'all');
  for (const [language, id] of Object.entries(expected)) assert.equal(getOfferLanguageId(language), id, `${language} maps to ${id}`);
  assert.deepEqual(Object.values(expected).sort((left, right) => left - right), Array.from({ length: 15 }, (_, index) => index + 1));
  assert.equal(getOfferLanguageId('all'), null);
  assert.equal(getOfferLanguageId('xx'), null);
});

test('shows an explicit All checkbox and one checkbox per language code', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
  const options = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
  assert.match(html, /id="offerLanguageAll"/);
  assert.match(html, /name="offerLanguages"/);
  assert.match(html, /fiches produit détaillées.*Singles.*ETB.*boosters/i);
  for (const { code } of OFFER_LANGUAGES.slice(1)) assert.match(html, new RegExp(`value="${code}"`));
  assert.match(options, /querySelectorAll\('input\[name="offerLanguages"\]:checked'\)/);
  assert.match(options, /allInput\.checked = settings\.offerLanguages\.length === 0/);
  assert.match(options, /allInput\.addEventListener\('change'/);
  assert.match(options, /input\.addEventListener\('change', \(\) => \{/);
});

test('applies the selected language array through one native URL parameter before pricing tools initialize', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.match(content, /settings\.offerLanguages/);
  assert.match(content, /CardmarketSettings\.buildOfferLanguageUrl\(location\.href, settings\.offerLanguages, previousOverride\)/);
  assert.match(content, /location\.replace\(target\)/);
  assert.match(content, /previousOverride\?\.languageIds \?\? previousOverride\?\.languageId/);
  assert.match(content, /preserveCurrentPathManualChoice\(\)/);
  assert.ok(content.indexOf('if (applyOfferLanguage()) return;') < content.indexOf('applyTheme();'));
});

test('migrates the old scalar setting and normalizes the new multiple selection', () => {
  assert.deepEqual(DEFAULTS.offerLanguages, []);
  assert.deepEqual(migrateSettings({}).offerLanguages, []);
  assert.deepEqual(migrateSettings({ offerLanguage: 'all' }).offerLanguages, []);
  assert.deepEqual(migrateSettings({ offerLanguage: 'fr' }).offerLanguages, ['fr']);
  assert.deepEqual(migrateSettings({ offerLanguage: 'bad', theme: 'dark' }).offerLanguages, []);
  assert.deepEqual(migrateSettings({ offerLanguages: ['ja', 'fr', 'xx', 'fr'] }).offerLanguages, ['fr', 'ja']);
  assert.equal(Object.hasOwn(migrateSettings({ offerLanguage: 'fr' }), 'offerLanguage'), false);
});

test('loads and migrates old stored language without losing other preferences', async () => {
  const data = { theme: 'dark', priceMode: 'avg', offerLanguage: 'fr' };
  const storage = {
    async get() { return { ...data }; },
    async set(values) { Object.assign(data, values); },
    async remove(key) { delete data[key]; },
  };
  const loaded = await loadSettings(storage);
  assert.deepEqual(loaded.offerLanguages, ['fr']);
  assert.equal(loaded.theme, 'dark');
  assert.equal(loaded.priceMode, 'avg');
  assert.deepEqual(data.offerLanguages, ['fr']);
  assert.equal(Object.hasOwn(data, 'offerLanguage'), false);
});

test('builds sorted stable CSV language filters and preserves unrelated query and fragment', () => {
  for (const [language, id] of Object.entries(expected)) {
    const url = new URL(buildOfferLanguageUrl(`https://www.cardmarket.com${cardPath}`, [language]));
    assert.equal(url.searchParams.get('language'), String(id), `${language} uses native id ${id}`);
  }
  for (const [selection, ids] of [[['ja', 'fr'], '2,7'], [['pt', 'en', 'fr'], '1,2,8'], [['ru', 'tw', 'ko'], '9,10,11']]) {
    const url = new URL(buildOfferLanguageUrl(`https://www.cardmarket.com${cardPath}?foo=bar&language=15#offers`, selection));
    assert.deepEqual(url.searchParams.getAll('language'), [ids]);
    assert.equal(url.searchParams.get('foo'), 'bar');
    assert.equal(url.hash, '#offers');
  }
});

test('recognizes detail routes for Singles, ETB and another product family, but not product listings', () => {
  assert.equal(isOfferLanguageProductPath(cardPath), true);
  assert.equal(isOfferLanguageProductPath(etbPath), true);
  assert.equal(isOfferLanguageProductPath(boosterPath), true);
  assert.equal(isOfferLanguageProductPath('/fr/Pokemon/Products/Search?searchString=ETB'), false);
  assert.equal(isOfferLanguageProductPath('/fr/Pokemon/Products/Elite-Trainer-Boxes'), false);
  assert.equal(isOfferLanguageProductPath('/fr/Pokemon/Cards/Sample-Mega-Card-ex'), false);
});

test('accepts the generic product-detail route shape across the requested Cardmarket families', () => {
  const families = {
    boosters: '/en/Pokemon/Products/Boosters/Example-Set-Booster',
    'booster boxes': '/en/Pokemon/Products/Booster-Boxes/Example-Booster-Bundle',
    blisters: '/fr/Pokemon/Products/Blisters/Scarlet-Violet-Booster-Blister',
    sealed: '/fr/Pokemon/Products/Sealed/Example-Set-ETB',
    sets: '/fr/Pokemon/Products/Sets/Example-Set-Set',
    lots: '/fr/Pokemon/Products/Lots/151-Collection-Lot',
    accessories: '/en/Magic/Products/Accessories/Dragon-Shield-Sleeves',
  };
  for (const [family, pathname] of Object.entries(families)) {
    assert.equal(isOfferLanguageProductPath(pathname), true, `${family} detail route`);
    const target = new URL(buildOfferLanguageUrl(`https://www.cardmarket.com${pathname}?foo=bar`, ['fr', 'ja']));
    assert.equal(target.searchParams.get('language'), '2,7', `${family} uses the shared native CSV`);
    assert.equal(target.searchParams.get('foo'), 'bar');
  }
  for (const productType of Object.keys(families)) {
    const category = `/en/Pokemon/Products/${productType}`;
    assert.equal(isOfferLanguageProductPath(category), false, `${productType} category root`);
  }
  assert.equal(isOfferLanguageProductPath('/en/Pokemon/Products/Search?searchString=booster'), false);
});

test('applies and restores the native filter on sealed and booster product detail routes', () => {
  for (const productPath of [etbPath, boosterPath]) {
    const selected = new URL(buildOfferLanguageUrl(`https://www.cardmarket.com${productPath}?foo=bar&language=15#offers`, ['ja', 'fr']));
    assert.deepEqual(selected.searchParams.getAll('language'), ['2,7']);
    assert.equal(selected.searchParams.get('foo'), 'bar');
    assert.equal(selected.hash, '#offers');
    const restored = new URL(buildOfferLanguageUrl(selected.toString(), [], {
      languageIds: '2,7', previousLanguages: ['15'],
    }));
    assert.deepEqual(restored.searchParams.getAll('language'), ['15']);
    assert.equal(restored.searchParams.get('foo'), 'bar');
    assert.equal(restored.hash, '#offers');
  }
});

test('keeps a manual language change on an ETB route and does not redirect an already matching selection', () => {
  const manualUrl = `https://www.cardmarket.com${etbPath}?language=3`;
  assert.equal(buildOfferLanguageUrl(manualUrl, ['fr'], { manual: true }), null);
  assert.equal(buildOfferLanguageUrl(`https://www.cardmarket.com${etbPath}?language=2,7`, ['ja', 'fr']), null);
});

test('empty selection leaves a native filter alone and clears only a matching extension override', () => {
  const current = `https://www.cardmarket.com${cardPath}?language=2,7&foo=bar#offers`;
  assert.equal(buildOfferLanguageUrl(current, []), null);
  const cleared = new URL(buildOfferLanguageUrl(current, [], { languageIds: '2,7', previousLanguages: [] }));
  assert.equal(cleared.searchParams.has('language'), false);
  const reset = new URL(buildOfferLanguageUrl(current, [], { languageIds: '2,7', previousLanguages: ['7'] }));
  assert.deepEqual(reset.searchParams.getAll('language'), ['7']);
  assert.equal(reset.searchParams.get('foo'), 'bar');
  assert.equal(reset.hash, '#offers');
  const resetMultiple = new URL(buildOfferLanguageUrl(current, [], { languageIds: '2,7', previousLanguages: ['7', '2'] }));
  assert.deepEqual(resetMultiple.searchParams.getAll('language'), ['2,7']);
});

test('migrates an old single-language session marker and preserves a changed manual filter', () => {
  const current = `https://www.cardmarket.com${cardPath}?language=2&foo=bar`;
  const restored = new URL(buildOfferLanguageUrl(current, [], { languageId: '2', previousLanguages: ['7'] }));
  assert.deepEqual(restored.searchParams.getAll('language'), ['7']);
  assert.equal(buildOfferLanguageUrl(`https://www.cardmarket.com${cardPath}?language=7`, [], { languageId: '2', previousLanguages: [] }), null);
});

test('preserves a manually changed native choice while the configured override is active', () => {
  const current = `https://www.cardmarket.com${cardPath}?language=7`;
  assert.equal(buildOfferLanguageUrl(current, ['fr'], { manual: true }), null);
  const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.match(content, /overrides\[location\.pathname\] = \{ manual: true \}/);
});

test('canonicalizes equal selections, does not duplicate language parameters, and ignores non-product pages', () => {
  assert.equal(buildOfferLanguageUrl(`https://www.cardmarket.com${cardPath}?language=2,7`, ['ja', 'fr']), null);
  const duplicate = new URL(buildOfferLanguageUrl(`https://www.cardmarket.com${cardPath}?language=2&language=7&foo=x`, ['ja', 'fr']));
  assert.deepEqual(duplicate.searchParams.getAll('language'), ['2,7']);
  assert.equal(duplicate.searchParams.get('foo'), 'x');
  assert.equal(buildOfferLanguageUrl('https://www.cardmarket.com/en/Pokemon/Products/Search?foo=bar', ['fr']), null);
  assert.equal(buildOfferLanguageUrl('https://www.cardmarket.com/fr/Pokemon/Products/Elite-Trainer-Boxes', ['fr']), null);
  assert.equal(buildOfferLanguageUrl('https://www.cardmarket.com/fr/Pokemon/Cards/Sample-Mega-Card-ex', ['fr']), null);
});
