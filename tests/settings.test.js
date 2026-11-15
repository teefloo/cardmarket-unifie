const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, FEATURE_FLAGS, migrateSettings, isFeatureEnabled } = require('../settings.js');

const expectedFlags = {
  showFloatingPanel: true, showCartSummary: false, showPriceHelper: true, showPriceDeviation: true, showConditionPrices: true, showMatrasChart: true,
  quickFilter: true, showGameSwitcher: true, showCardPreviews: true, rememberWantsList: true,
  showRecentOrderLinks: true, hideMagicArtSummary: false, showShippingEstimator: false, showPurchaseHistory: true, showDuplicateWarnings: true, hideSocial: true,
  showOrderChecklist: true, showTableCopy: true, showSessionTotal: true, applySignature: true,
  showCommentTemplates: true, multipleAttachments: true, hideSupportTickets: true, highlightTerms: true,
  showOfferAttributes: true, showPokeMasterBallIndicators: true, showPromos: true, forceGridView: false, showGridColumns: true, copyShipmentDetails: true,
  printOrders: false, showBlocklistShortcut: true, showPartnerLinks: true, reportPrices: false,
  showMessagePreviews: true, searchAllWants: true, showWantAlarmActions: true, showBulkWantActions: true,
  searchExtendedOrders: true, showTrackingCodePrompt: true,
  highlightAuthor: false,
  forceSpoilerImageLoad: true, hideSpoilerAccessories: true, trackPriceTrendShoppingPages: false, showBuyerHelp: true,
};

test('documents the default and current value of every individual feature switch', () => {
  assert.deepEqual(Object.fromEntries(FEATURE_FLAGS.map((key) => [key, DEFAULTS[key]])), expectedFlags);
});

test('migrates old settings without dropping user values or unknown stored keys', () => {
  const migrated = migrateSettings({
    enabled: false,
    theme: 'dark',
    priceMode: 'avg',
    adjustmentValue: 0.15,
    signature: 'Merci',
    commentTemplates: ['À bientôt'],
    favoriteGames: ['Pokemon'],
    oldExperimentalSetting: { retained: true },
  });
  assert.equal(migrated.enabled, false);
  assert.equal(migrated.theme, 'dark');
  assert.equal(migrated.priceMode, 'avg');
  assert.equal(migrated.adjustmentValue, 0.15);
  assert.equal(migrated.signature, 'Merci');
  assert.deepEqual(migrated.commentTemplates, ['À bientôt']);
  assert.deepEqual(migrated.favoriteGames, ['Pokemon']);
  assert.deepEqual(migrated.oldExperimentalSetting, { retained: true });
  assert.deepEqual(Object.fromEntries(FEATURE_FLAGS.map((key) => [key, migrated[key]])), expectedFlags);
});

test('normalizes invalid flag values and preserves the supported professional price mode', () => {
  const migrated = migrateSettings({ quickFilter: 'false', priceMode: 'pro' });
  assert.equal(migrated.quickFilter, true);
  assert.equal(migrated.priceMode, 'pro');
  assert.equal(migrated.proPriceReductionType, 'amount');
  assert.equal(migrated.proPriceReductionValue, 0);
  assert.equal(migrateSettings({ priceMode: 'unknown' }).priceMode, 'lowest');
});

test('feature gates respect each toggle and the master switch', () => {
  for (const key of FEATURE_FLAGS) {
    assert.equal(isFeatureEnabled({ enabled: true, [key]: true }, key), true, `${key} enabled`);
    assert.equal(isFeatureEnabled({ enabled: true, [key]: false }, key), false, `${key} disabled`);
    assert.equal(isFeatureEnabled({ enabled: false, [key]: true }, key), false, `${key} honors master`);
  }
  assert.equal(isFeatureEnabled({}, 'unknownFeature'), false);
});

test('loads and persists migrated defaults without losing existing or unrelated settings', async () => {
  const stored = { theme: 'dark', quickFilter: false, privateOldKey: 'keep-me' };
  const storage = {
    async get() { return { ...stored }; },
    async set(values) { Object.assign(stored, values); },
  };
  const migrated = await require('../settings.js').loadSettings(storage);
  assert.equal(migrated.theme, 'dark');
  assert.equal(migrated.quickFilter, false);
  assert.equal(migrated.showPriceHelper, DEFAULTS.showPriceHelper);
  assert.equal(stored.privateOldKey, 'keep-me');
  assert.equal(stored.showPriceHelper, DEFAULTS.showPriceHelper);
  assert.equal(stored.enabled, DEFAULTS.enabled);
});

test('provides an options control and an implementation consumer for every feature flag', () => {
  const directory = path.join(__dirname, '..');
  const options = fs.readFileSync(path.join(directory, 'options.html'), 'utf8');
  const content = fs.readFileSync(path.join(directory, 'content.js'), 'utf8');
  const pageTools = fs.readFileSync(path.join(directory, 'page-tools.js'), 'utf8');
  const partner = fs.readFileSync(path.join(directory, 'partner.js'), 'utf8');
  const wantsSearch = fs.readFileSync(path.join(directory, 'wants-search.js'), 'utf8');
  const wantsActions = fs.readFileSync(path.join(directory, 'wants-actions.js'), 'utf8');
  const cartSummary = fs.readFileSync(path.join(directory, 'cart-summary.js'), 'utf8');
  const promos = fs.readFileSync(path.join(directory, 'promos.js'), 'utf8');
  const shippingEstimator = fs.readFileSync(path.join(directory, 'shipping-estimator.js'), 'utf8');
  const spoilerTools = fs.readFileSync(path.join(directory, 'spoiler-tools.js'), 'utf8');
  const cartPriceTrend = fs.readFileSync(path.join(directory, 'cart-price-trend.js'), 'utf8');
  const buyerHelp = fs.readFileSync(path.join(directory, 'buyer-help.js'), 'utf8');
  const orderTools = fs.readFileSync(path.join(directory, 'order-tools.js'), 'utf8');
  const duplicateWarnings = fs.readFileSync(path.join(directory, 'duplicate-warnings.js'), 'utf8');
  const contentFlags = new Set([
    'showFloatingPanel', 'showPriceHelper', 'showPriceDeviation', 'showMatrasChart', 'quickFilter', 'showGameSwitcher',
    'showCardPreviews', 'rememberWantsList', 'showPurchaseHistory', 'showDuplicateWarnings',
    'hideSocial', 'showOrderChecklist', 'showTableCopy', 'showSessionTotal', 'applySignature',
    'showCommentTemplates', 'multipleAttachments', 'reportPrices', 'showMessagePreviews',
  ]);
  const wantsSearchFlags = new Set(['searchAllWants']);
  const wantsActionsFlags = new Set(['showWantAlarmActions', 'showBulkWantActions']);
  const cartSummaryFlags = new Set(['showCartSummary']);
  const promoFlags = new Set(['showPromos']);
  const shippingFlags = new Set(['showShippingEstimator']);
  const spoilerFlags = new Set(['forceSpoilerImageLoad', 'hideSpoilerAccessories']);
  const cartPriceTrendFlags = new Set(['trackPriceTrendShoppingPages']);
  const buyerHelpFlags = new Set(['showBuyerHelp']);
  const ballIndicatorFlags = new Set(['showPokeMasterBallIndicators']);
  const orderToolsFlags = new Set(['searchExtendedOrders', 'showTrackingCodePrompt']);
  const pageToolFlags = new Set([
    'showConditionPrices', 'showRecentOrderLinks', 'hideSupportTickets', 'highlightTerms',
    'showOfferAttributes', 'forceGridView', 'showGridColumns', 'copyShipmentDetails', 'printOrders', 'hideMagicArtSummary',
    'showBlocklistShortcut', 'highlightAuthor',
  ]);
  assert.match(content, /featureEnabled\(['"]showDuplicateWarnings['"]\)/);
  assert.match(duplicateWarnings, /function readCartProducts/);
  for (const key of FEATURE_FLAGS) {
    assert.match(options, new RegExp(`id=["']${key}["']`), `${key} has an options control`);
    if (contentFlags.has(key)) {
      assert.match(content, new RegExp(`featureEnabled\\(['"]${key}['"]\\)`), `${key} is gated in content.js`);
    } else if (pageToolFlags.has(key)) {
      assert.match(pageTools, new RegExp(`featureEnabled\\(options,\\s*['"]${key}['"]\\)`), `${key} is gated in page-tools.js`);
    } else if (wantsSearchFlags.has(key)) {
      assert.match(wantsSearch, new RegExp(`isFeatureEnabled\\(settings,\\s*['"]${key}['"]\\)`), `${key} is gated in wants-search.js`);
    } else if (wantsActionsFlags.has(key)) {
      assert.match(wantsActions, new RegExp(`isFeatureEnabled\\(settings,\\s*['"]${key}['"]\\)`), `${key} is gated in wants-actions.js`);
    } else if (cartSummaryFlags.has(key)) {
      assert.match(cartSummary, /settings\?\.enabled\s*\|\|\s*settings\.showCartSummary\s*!==\s*true/, `${key} and the master switch gate the cart summary`);
    } else if (promoFlags.has(key)) {
      assert.match(promos, /isFeatureEnabled\(settings,\s*'showPromos'\)/, `${key} is gated in promos.js`);
    } else if (shippingFlags.has(key)) {
      assert.match(shippingEstimator, /isFeatureEnabled\(settings,\s*'showShippingEstimator'\)/, `${key} is gated in shipping-estimator.js`);
    } else if (spoilerFlags.has(key)) {
      assert.match(spoilerTools, new RegExp(`isFeatureEnabled\\([^,]+,\\s*['"]${key}['"]\\)`), `${key} is gated in spoiler-tools.js`);
    } else if (cartPriceTrendFlags.has(key)) {
      assert.match(cartPriceTrend, /isFeatureEnabled\?\.\(settings,\s*'trackPriceTrendShoppingPages'\)/, `${key} is gated in cart-price-trend.js`);
    } else if (buyerHelpFlags.has(key)) {
      assert.match(buyerHelp, /isFeatureEnabled\?\.\(settings,\s*'showBuyerHelp'\)/, `${key} is gated in buyer-help.js`);
    } else if (ballIndicatorFlags.has(key)) {
      assert.match(pageTools, /featureEnabled\(options,\s*'showPokeMasterBallIndicators'\)/, `${key} is gated in page-tools.js`);
    } else if (orderToolsFlags.has(key)) {
      assert.match(orderTools, new RegExp(`isFeatureEnabled\\?\\.\\(settings,\\s*['"]${key}['"]\\)`), `${key} is gated in order-tools.js`);
    } else {
      assert.equal(key, 'showPartnerLinks', `${key} must have an explicit gate owner`);
      assert.match(partner, /CardmarketSettings\.isFeatureEnabled\(settings,\s*['"]showPartnerLinks['"]\)/, `${key} is gated in partner.js`);
    }
  }
  assert.equal(contentFlags.size + pageToolFlags.size + wantsSearchFlags.size + wantsActionsFlags.size + cartSummaryFlags.size + promoFlags.size + shippingFlags.size + spoilerFlags.size + cartPriceTrendFlags.size + buyerHelpFlags.size + ballIndicatorFlags.size + orderToolsFlags.size + 1, FEATURE_FLAGS.length, 'every feature flag has one consumer owner');
});

test('loads the global Wants and cart modules as Cardmarket scripts after their dependencies', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const cardmarketScripts = manifest.content_scripts.find((entry) => entry.matches.includes('https://www.cardmarket.com/*')).js;
  assert.ok(cardmarketScripts.includes('wants-search.js'));
  assert.ok(cardmarketScripts.includes('wants-actions.js'));
  assert.ok(cardmarketScripts.includes('cart-summary.js'));
  assert.ok(cardmarketScripts.includes('cart-price-trend.js'));
  assert.ok(cardmarketScripts.includes('buyer-help.js'));
  assert.ok(cardmarketScripts.includes('order-tools.js'));
  assert.ok(cardmarketScripts.includes('duplicate-warnings.js'));
  assert.ok(cardmarketScripts.includes('promos.js'));
  assert.ok(cardmarketScripts.includes('shipping-estimator.js'));
  assert.ok(cardmarketScripts.includes('spoiler-tools.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('wants-search.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('wants-actions.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('cart-summary.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('promos.js'));
  assert.ok(cardmarketScripts.indexOf('core.js') < cardmarketScripts.indexOf('cart-summary.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('spoiler-tools.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('cart-price-trend.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('buyer-help.js'));
  assert.ok(cardmarketScripts.indexOf('settings.js') < cardmarketScripts.indexOf('order-tools.js'));
  assert.ok(cardmarketScripts.indexOf('duplicate-warnings.js') < cardmarketScripts.indexOf('content.js'));
  assert.deepEqual(manifest.host_permissions, ['https://www.cardmarket.com/*', 'https://cardmarket.com/*']);
  assert.ok(manifest.optional_host_permissions.includes('https://help.cardmarket.com/*'));
});

test('preserves the Companion public support, feedback, rating and community links without a private counter', () => {
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  for (const href of [
    'https://buymeacoffee.com/zagoadev',
    'https://docs.google.com/forms/d/e/1FAIpQLSeEiv-JxkFAsD_To7SPBu7LRDGFb-aceu3cyYQqv5hQSZDLUQ/viewform?usp=publish-editor',
    'https://chromewebstore.google.com/detail/cardmarket-companion/mpbncolfefkegmaccdejhngjcjkjoaep?hl=en',
    'https://discord.gg/FsA6juBujF',
  ]) assert.ok(popup.includes(href), `popup keeps public link ${href}`);
  assert.doesNotMatch(popup, /supporterCount|BMAC_SUPPORTER_COUNT_CACHE|api\.buymeacoffee/i);
});

test('shipping destination migrates only documented Cardmarket country IDs', () => {
  assert.equal(migrateSettings({ shippingDestinationCountry: 12 }).shippingDestinationCountry, '12');
  assert.equal(migrateSettings({ shippingDestinationCountry: '34' }).shippingDestinationCountry, '');
  assert.equal(migrateSettings({ shippingDestinationCountry: '12', showShippingEstimator: true }).showShippingEstimator, true);
});
