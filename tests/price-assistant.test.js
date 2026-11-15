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

test('migrates configured price shortcuts while preserving the current one-button default', () => {
  assert.deepEqual(CardmarketSettings.DEFAULTS.priceShortcuts, []);
  const migrated = CardmarketSettings.migrateSettings({ priceMode: 'lowest', priceShortcuts: ['min', 'from', 'trend30', 'avg', 'trend30', 'pro'] });
  assert.equal(migrated.priceMode, 'lowest');
  assert.deepEqual(migrated.priceShortcuts, ['avg', 'trend30', 'from', 'min']);
  assert.deepEqual(CardmarketSettings.migrateSettings({ priceMode: 'from' }).priceMode, 'from');
  assert.deepEqual(CardmarketSettings.migrateSettings({ priceMode: 'min' }).priceMode, 'min');
});

test('migrates the optional lot discount without changing the zero-discount default', () => {
  assert.equal(CardmarketSettings.DEFAULTS.bulkPricePercent, 0);
  assert.equal(CardmarketSettings.migrateSettings({ bulkPricePercent: '-5' }).bulkPricePercent, -5);
  assert.equal(CardmarketSettings.migrateSettings({ bulkPricePercent: '-101' }).bulkPricePercent, 0);
  assert.equal(CardmarketSettings.migrateSettings({ bulkPricePercent: 'nope', priceMode: 'avg' }).priceMode, 'avg');
});

test('professional price mode and legacy reduction preferences migrate without inventing a seller-country behavior', () => {
  const migrated = CardmarketSettings.migrateSettings({
    priceMode: 'pro', proPriceReductionType: 'percentage', proPriceReductionValue: '10', proSellerCountry: '12',
  });
  assert.equal(migrated.priceMode, 'pro');
  assert.equal(migrated.proPriceReductionType, 'percentage');
  assert.equal(migrated.proPriceReductionValue, 10);
  assert.equal(migrated.proSellerCountry, '12', 'the source key is preserved although Companion 0.11 does not consume it');
});

test('options expose configurable shortcut modes and explain the lot preview as non-submitting', () => {
  const directory = path.join(__dirname, '..');
  const options = fs.readFileSync(path.join(directory, 'options.html'), 'utf8');
  const script = fs.readFileSync(path.join(directory, 'options.js'), 'utf8');
  assert.match(options, /name=["']priceShortcuts["']/);
  for (const mode of ['lowest', 'avg', 'trend1', 'trend7', 'trend30', 'from', 'min']) {
    assert.match(options, new RegExp(`name=["']priceShortcuts["'][^>]*value=["']${mode}["']|value=["']${mode}["'][^>]*name=["']priceShortcuts["']`));
  }
  assert.match(script, /priceShortcuts/);
  assert.match(options, /aperçu du lot/i);
  const priceModeOptions = options.match(/<select id="priceMode">([\s\S]*?)<\/select>/)?.[1] || '';
  for (const mode of ['from', 'min', 'pro']) assert.match(priceModeOptions, new RegExp(`value=["']${mode}["']`));
  assert.match(options, /value=["']pro["']/i, 'the source-compatible professional mode is selectable');
  assert.match(options, /id=["']proPriceReductionType["']/);
  assert.match(options, /id=["']proPriceReductionValue["']/);
  assert.match(options, /id=["']bulkPricePercent["']/);
});

test('Cardmarket source offers quick From and Min price shortcuts without a write action', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.match(content, /priceMode === 'from'/);
  assert.match(content, /priceMode === 'min'/);
  assert.match(content, /0\.02/);
  const start = content.indexOf('function addPriceTool');
  const end = content.indexOf('\n  function addTableFilter', start);
  assert.ok(start >= 0 && end > start, 'the price tool implementation should be extractable');
  assert.doesNotMatch(content.slice(start, end), /\.submit\(|requestSubmit\(|submitButton\.click/);
  assert.match(content, /cmu-price-mode-change/, 'only the explicit mode-change event requests a recalculation');
  assert.match(content, /calculateBulkLotTotal/);
});
