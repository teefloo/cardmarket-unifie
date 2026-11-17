const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, FEATURE_FLAGS, migrateSettings, loadSettings, isFeatureEnabled } = require('../settings.js');

test('defaults contain only Pokémon page preferences', () => {
  assert.deepEqual(DEFAULTS, {
    enabled: true,
    preferredLanguage: '',
    showConditionPrices: true,
    showHistoricalChart: true,
  });
  assert.deepEqual(FEATURE_FLAGS, ['showConditionPrices', 'showHistoricalChart']);
});

test('migrates a legacy language and normalizes current settings', () => {
  assert.deepEqual(migrateSettings({
    enabled: false,
    preferredLanguage: 'ja',
    offerLanguages: ['fr', 'de'],
    showConditionPrices: false,
    showHistoricalChart: 'false',
    favoriteGames: ['Magic'],
  }), {
    enabled: false,
    preferredLanguage: 'ja',
    showConditionPrices: false,
    showHistoricalChart: true,
  });
  assert.equal(migrateSettings({ offerLanguages: ['ja', 'fr'] }).preferredLanguage, 'fr');
  assert.equal(migrateSettings({ offerLanguage: 'fr' }).preferredLanguage, 'fr');
  assert.equal(migrateSettings({ showMatrasChart: false }).showHistoricalChart, false);
  assert.equal(migrateSettings({ preferredLanguage: 'xx' }).preferredLanguage, '');
});

test('feature gates respect the supported toggles and master switch', () => {
  for (const key of FEATURE_FLAGS) {
    assert.equal(isFeatureEnabled({ enabled: true, [key]: true }, key), true);
    assert.equal(isFeatureEnabled({ enabled: true, [key]: false }, key), false);
    assert.equal(isFeatureEnabled({ enabled: false, [key]: true }, key), false);
  }
  assert.equal(isFeatureEnabled({ enabled: true, showBuyerHelp: true }, 'showBuyerHelp'), true, 'unbundled module tests can exercise an explicitly supplied setting');
});

test('persists defaults, preserves unrelated keys, and deletes known obsolete preferences', async () => {
  const stored = { offerLanguages: ['fr'], showBuyerHelp: true, otherKey: 'preserved' };
  const removed = [];
  const storage = {
    async get() { return { ...stored }; },
    async set(values) { Object.assign(stored, values); },
    async remove(keys) { removed.push(...keys); for (const key of keys) delete stored[key]; },
  };
  const settings = await loadSettings(storage);
  assert.equal(settings.preferredLanguage, 'fr');
  assert.equal(stored.preferredLanguage, 'fr');
  assert.equal(stored.enabled, true);
  assert.equal(stored.otherKey, 'preserved');
  assert.ok(removed.includes('offerLanguages'));
  assert.ok(removed.includes('showBuyerHelp'));
});

test('options and popup expose only the focused controls and privacy information', () => {
  const root = path.join(__dirname, '..');
  const options = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const optionsJs = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  assert.match(options, /id="preferredLanguage"/);
  assert.match(options, /id="showConditionPrices"/);
  assert.match(options, /id="showHistoricalChart"/);
  assert.match(options, /href="privacy.html"/);
  assert.doesNotMatch(options, /Matras|Mave|Magic|YuGiOh|OnePiece|quickFilter|navigation entre jeux/i);
  assert.match(optionsJs, /chrome\.permissions\.request/);
  assert.match(popup, /Pokémon Cardmarket/);
  assert.match(popup, /id="enabled"/);
  assert.doesNotMatch(popup, /Companion|buymeacoffee|discord|community|matras|mave/i);
});

test('manifest limits injection and optional network access to the focused feature set', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.name, 'Pokémon Cardmarket');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['https://charts.matrastcg.de/*']);
  const content = manifest.content_scripts[0];
  assert.ok(content.matches.every((pattern) => pattern.includes('/Pokemon/')));
  assert.deepEqual(content.js, ['core.js', 'settings.js', 'runtime-guard.js', 'pokemon-offers.js', 'content.js']);
  assert.equal(content.css, undefined);
  assert.ok(manifest.web_accessible_resources.some((item) => item.resources.includes('pokemon.css')));
  assert.doesNotMatch(JSON.stringify(manifest), /Mave|help\.cardmarket|kaiofcards|despelvogel|zycards/);
});

test('privacy notices disclose Limited Use and the optional request accurately', () => {
  const privacy = fs.readFileSync(path.join(__dirname, '..', 'privacy.html'), 'utf8');
  const publicPolicySource = fs.readFileSync(path.join(__dirname, '..', 'PRIVACY.md'), 'utf8');
  assert.match(privacy, /chrome\.storage\.local/);
  assert.match(privacy, /charts\.matrastcg\.de/);
  assert.match(privacy, /n’inclut pas de cookie Cardmarket/);
  assert.match(privacy, /adresse IP/);
  assert.match(privacy, /respecte la politique des données utilisateur du Chrome Web Store, y compris ses exigences « Limited Use »/);
  assert.match(privacy, /aucune requête au service n’est envoyée sans l’autorisation facultative/);
  assert.doesNotMatch(privacy, /historique est désactivé par défaut/i);
  assert.match(publicPolicySource, /respecte la politique des données utilisateur du Chrome Web Store, y compris ses exigences « Limited Use »/);
  assert.match(publicPolicySource, /product-images\.s3\.cardmarket\.com/);
  assert.match(publicPolicySource, /aucune requête à ce service n’est envoyée sans l’autorisation facultative/);
  assert.doesNotMatch(publicPolicySource, /historique est désactivé par défaut/i);
  assert.doesNotMatch(privacy, /Mave|Companion/);
});
