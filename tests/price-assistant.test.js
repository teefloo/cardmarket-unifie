const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CardmarketCore = require('../core.js');
const CardmarketSettings = require('../settings.js');

test('normalizes configurable price shortcut modes and keeps one canonical order', () => {
  assert.deepEqual(CardmarketCore.normalizePriceShortcuts(['trend7', 'from', 'lowest', 'min', 'avg', 'trend7', 'pro', null]), [
    'lowest', 'avg', 'trend7', 'from', 'min',
  ]);
  assert.deepEqual(CardmarketCore.normalizePriceShortcuts([]), []);
});

test('computes a display-only lot total from a rounded unit price and a positive integer quantity', () => {
  assert.equal(CardmarketCore.calculateLotTotal(1.235, 4), 4.96);
  assert.equal(CardmarketCore.calculateLotTotal(12.5, 1), 12.5);
  assert.equal(CardmarketCore.calculateLotTotal(12.5, 0), null);
  assert.equal(CardmarketCore.calculateLotTotal(12.5, 1.5), null);
  assert.equal(CardmarketCore.calculateLotTotal(NaN, 3), null);
});

test('calculates a preview-only percentage bulk adjustment with a per-unit floor', () => {
  assert.equal(CardmarketCore.calculateBulkLotTotal(10, 3, -5, 0), 28.5);
  assert.equal(CardmarketCore.calculateBulkLotTotal(10, 3, -50, 8), 24);
  assert.equal(CardmarketCore.calculateBulkLotTotal(10, 1, 0, 0), 10);
  assert.equal(CardmarketCore.calculateBulkLotTotal(10, 3, -100, 1), 3);
  assert.equal(CardmarketCore.calculateBulkLotTotal(10, 0, -5, 0), null);
  assert.equal(CardmarketCore.calculateBulkLotTotal(10, 3, -101, 0), null);
});

test('selects the first visible professional seller price, then the first offer, then the trend fallback', () => {
  assert.equal(CardmarketCore.selectProfessionalPrice([24, 29], [12, 18], 35), 24);
  assert.equal(CardmarketCore.selectProfessionalPrice([], [12, 18], 35), 12);
  assert.equal(CardmarketCore.selectProfessionalPrice([], [], 35), 35);
  assert.equal(CardmarketCore.selectProfessionalPrice([], [], null), null);
});

test('applies the source-compatible professional reduction and floor without changing the unit-price contract', () => {
  assert.equal(CardmarketCore.calculateProfessionalPrice([20], [10], 8, {
    adjustmentType: 'fixed', adjustmentValue: 0, floor: 1,
    proPriceReductionType: 'amount', proPriceReductionValue: 2,
  }), 18);
  assert.equal(CardmarketCore.calculateProfessionalPrice([20], [10], 8, {
    adjustmentType: 'fixed', adjustmentValue: 0, floor: 1,
    proPriceReductionType: 'percentage', proPriceReductionValue: 10,
  }), 18);
  assert.equal(CardmarketCore.calculateProfessionalPrice([20], [10], 8, {
    adjustmentType: 'fixed', adjustmentValue: 0, floor: 19,
    proPriceReductionType: 'amount', proPriceReductionValue: 5,
  }), 19);
  assert.equal(CardmarketCore.calculateProfessionalPrice([20], [10], 8, {
    adjustmentType: 'fixed', adjustmentValue: 1, floor: 0,
    proPriceReductionType: 'amount', proPriceReductionValue: 5,
  }), 21, 'the configured global adjustment takes precedence over the legacy pro reduction');
});

test('migration discards preferences for removed pricing tools', () => {
  const migrated = CardmarketSettings.migrateSettings({
    preferredLanguage: 'ja', priceMode: 'pro', priceShortcuts: ['min'], bulkPricePercent: -5,
    proPriceReductionType: 'percentage', proPriceReductionValue: '10',
  });
  assert.deepEqual(Object.keys(migrated), Object.keys(CardmarketSettings.DEFAULTS));
  assert.equal(migrated.preferredLanguage, 'ja');
  for (const key of ['priceMode', 'priceShortcuts', 'bulkPricePercent', 'proPriceReductionType', 'proPriceReductionValue']) {
    assert.equal(Object.hasOwn(migrated, key), false, `${key} is no longer an active preference`);
  }
});

test('options expose Pokémon controls without legacy pricing or lot controls', () => {
  const directory = path.join(__dirname, '..');
  const options = fs.readFileSync(path.join(directory, 'options.html'), 'utf8');
  const script = fs.readFileSync(path.join(directory, 'options.js'), 'utf8');
  const popup = fs.readFileSync(path.join(directory, 'popup.html'), 'utf8');
  assert.match(options, /id="preferredLanguage"/);
  assert.match(options, /id="showConditionPrices"/);
  assert.match(options, /id="showHistoricalChart"/);
  assert.match(popup, /id="enabled"/);
  assert.doesNotMatch(`${options}\n${script}\n${popup}`, /priceShortcuts|priceMode|bulkPricePercent|proPriceReduction|aperçu du lot/i);
});

test('removed price helpers and duplicate filter are absent from the Pokémon content runtime', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.doesNotMatch(content, /addPriceTool|addTableFilter|cmu-filter|priceShortcuts|cmu-price-mode-change/);
});
