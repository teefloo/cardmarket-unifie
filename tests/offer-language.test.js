const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULTS,
  OFFER_LANGUAGES,
  getOfferLanguageId,
  isPokemonPath,
  isOfferLanguageProductPath,
  buildOfferLanguageUrl,
  migrateSettings,
  loadSettings,
} = require('../settings.js');

const base = 'https://www.cardmarket.com';
const singles = '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025';
const sealed = '/fr/Pokemon/Products/Booster-Boxes/Example-ETB';
const expected = {
  en: 1, fr: 2, de: 3, es: 4, it: 5, zh: 6, ja: 7, pt: 8,
  ru: 9, ko: 10, tw: 11, nl: 12, pl: 13, cs: 14, hu: 15,
};

test('maps each supported language to the native Cardmarket ID', () => {
  assert.equal(DEFAULTS.preferredLanguage, '');
  assert.equal(OFFER_LANGUAGES[0].code, '');
  for (const [language, id] of Object.entries(expected)) assert.equal(getOfferLanguageId(language), id);
  assert.equal(getOfferLanguageId(''), null);
  assert.equal(getOfferLanguageId('all'), null);
  assert.equal(getOfferLanguageId('unknown'), null);
});

test('recognizes Pokémon product details and excludes other games and category pages', () => {
  for (const route of [
    singles,
    sealed,
    '/en/Pokemon/Products/Boosters/Sample-Booster',
    '/en/Pokemon/Products/Blisters/Sample-Blister',
    '/Pokemon/Products/Lots/Sample-Lot',
  ]) assert.equal(isOfferLanguageProductPath(route), true, route);
  assert.equal(isPokemonPath('/fr/Pokemon/Products/Search'), true);
  assert.equal(isPokemonPath('/foo/Pokemon/Products/Singles/Set/Card'), false);
  assert.equal(isPokemonPath('/fr/Pokemon/Orders/Buyer'), false);
  assert.equal(isOfferLanguageProductPath('/en/Magic/Products/Booster-Boxes/Sample-Box'), false);
  assert.equal(isOfferLanguageProductPath('/fr/Pokemon/Products/Search?searchString=ETB'), false);
  assert.equal(isOfferLanguageProductPath('/fr/Pokemon/Products/Booster-Boxes'), false);
  assert.equal(isOfferLanguageProductPath('/fr/Pokemon/Cards/Sample-Card'), false);
  assert.equal(isOfferLanguageProductPath('/foo/Pokemon/Products/Singles/Set/Card'), false);
});

test('applies one native language while preserving the rest of the URL', () => {
  const target = new URL(buildOfferLanguageUrl(`${base}${singles}?foo=bar&language=3#offers`, 'fr'));
  assert.deepEqual(target.searchParams.getAll('language'), ['2']);
  assert.equal(target.searchParams.get('foo'), 'bar');
  assert.equal(target.hash, '#offers');
  assert.equal(buildOfferLanguageUrl(`${base}${singles}?language=2`, 'fr'), null);
  const canonical = new URL(buildOfferLanguageUrl(`${base}${singles}?language=2&language=7&keep=yes`, 'ja'));
  assert.deepEqual(canonical.searchParams.getAll('language'), ['7']);
  assert.equal(canonical.searchParams.get('keep'), 'yes');
});

test('applies the configured preference across Pokémon sealed product details', () => {
  const target = new URL(buildOfferLanguageUrl(`${base}${sealed}?sellerCountry=7`, 'ja'));
  assert.deepEqual(target.searchParams.getAll('language'), ['7']);
  assert.equal(target.searchParams.get('sellerCountry'), '7');
});

test('leaves native filtering untouched without a preference and restores only its own override', () => {
  const nativeUrl = `${base}${singles}?language=3&foo=bar#offers`;
  assert.equal(buildOfferLanguageUrl(nativeUrl, ''), null);
  const restored = new URL(buildOfferLanguageUrl(`${base}${singles}?language=2&foo=bar#offers`, '', {
    languageId: '2', previousLanguages: ['3'],
  }));
  assert.deepEqual(restored.searchParams.getAll('language'), ['3']);
  assert.equal(restored.searchParams.get('foo'), 'bar');
  assert.equal(restored.hash, '#offers');
  assert.equal(buildOfferLanguageUrl(`${base}${singles}?language=7`, '', {
    languageId: '2', previousLanguages: ['3'],
  }), null, 'a changed native filter is not overwritten');
  assert.equal(buildOfferLanguageUrl(nativeUrl, '', { manual: true }), null);
});

test('migrates legacy scalar and multiple language settings to one value', () => {
  assert.equal(migrateSettings({}).preferredLanguage, '');
  assert.equal(migrateSettings({ offerLanguage: 'fr' }).preferredLanguage, 'fr');
  assert.equal(migrateSettings({ offerLanguage: 'all' }).preferredLanguage, '');
  assert.equal(migrateSettings({ offerLanguages: ['ja', 'fr', 'xx', 'fr'] }).preferredLanguage, 'fr');
  assert.equal(migrateSettings({ preferredLanguage: 'de', offerLanguages: ['fr'] }).preferredLanguage, 'de');
  assert.equal(migrateSettings({ preferredLanguage: '', offerLanguage: 'fr' }).preferredLanguage, '');
  assert.equal(migrateSettings({ preferredLanguage: 'xx', offerLanguage: 'fr' }).preferredLanguage, 'fr');
});

test('persists the migrated setting and removes the old language preferences', async () => {
  const stored = { offerLanguage: 'fr', offerLanguages: ['fr', 'ja'], showBuyerHelp: true, unrelated: 'keep' };
  const removed = [];
  const storage = {
    async get() { return { ...stored }; },
    async set(values) { Object.assign(stored, values); },
    async remove(keys) { removed.push(...keys); for (const key of keys) delete stored[key]; },
  };
  const settings = await loadSettings(storage);
  assert.equal(settings.preferredLanguage, 'fr');
  assert.equal(stored.preferredLanguage, 'fr');
  assert.equal(stored.unrelated, 'keep');
  assert.ok(removed.includes('offerLanguage'));
  assert.ok(removed.includes('offerLanguages'));
  assert.ok(removed.includes('showBuyerHelp'));
});

test('options expose a single preference and the content entry is gated before UI', () => {
  const directory = path.join(__dirname, '..');
  const options = fs.readFileSync(path.join(directory, 'options.html'), 'utf8');
  const content = fs.readFileSync(path.join(directory, 'content.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert.match(options, /id="preferredLanguage"/);
  assert.doesNotMatch(options, /name="offerLanguages"|id="offerLanguageAll"/);
  for (const language of Object.keys(expected)) assert.match(options, new RegExp(`value="${language}"`));
  assert.match(content, /CardmarketRuntime\.runWhenReady\(initializePokemonPage\)/);
  assert.match(content, /loadExtensionStyles\(\)/);
  assert.doesNotMatch(content.slice(content.lastIndexOf('function initializePokemonPage')), /addTableFilter\(\)|addGameNavigation\(\)/);
  const script = manifest.content_scripts[0];
  assert.deepEqual(script.matches, [
    'https://www.cardmarket.com/Pokemon/Products/*',
    'https://www.cardmarket.com/*/Pokemon/Products/*',
    'https://cardmarket.com/Pokemon/Products/*',
    'https://cardmarket.com/*/Pokemon/Products/*',
  ]);
  assert.deepEqual(manifest.web_accessible_resources[0].matches, [
    'https://www.cardmarket.com/Pokemon/Products/*',
    'https://www.cardmarket.com/*/Pokemon/Products/*',
    'https://www.cardmarket.com/Pokemon/Wants',
    'https://www.cardmarket.com/Pokemon/Wants/*',
    'https://www.cardmarket.com/*/Pokemon/Wants',
    'https://www.cardmarket.com/*/Pokemon/Wants/*',
    'https://cardmarket.com/Pokemon/Products/*',
    'https://cardmarket.com/*/Pokemon/Products/*',
    'https://cardmarket.com/Pokemon/Wants',
    'https://cardmarket.com/Pokemon/Wants/*',
    'https://cardmarket.com/*/Pokemon/Wants',
    'https://cardmarket.com/*/Pokemon/Wants/*',
  ]);
  assert.deepEqual(script.js, ['core.js', 'settings.js', 'runtime-guard.js', 'pokemon-offers.js', 'content.js']);
  assert.equal(script.css, undefined, 'styles are added only after the challenge guard passes');
});
