const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Settings = require('../settings.js');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function createContentSandbox({ supported = true, openGate = false } = {}) {
  let readyCallback = null;
  let storageReads = 0;
  const styles = [];
  const document = {
    querySelector() { return null; },
    createElement(tagName) { const node = { tagName, dataset: {}, rel: '', href: '' }; styles.push(node); return node; },
    head: { append(node) { styles.push(node); } },
    documentElement: { append(node) { styles.push(node); } },
  };
  const sandbox = {
    CardmarketCore: require('../core.js'),
    CardmarketSettings: Settings,
    CardmarketRuntime: {
      isSupportedCardmarketPage: () => supported,
      runWhenReady(callback) { readyCallback = callback; if (openGate) callback(); },
    },
    chrome: {
      storage: { local: { async get() { storageReads += 1; return { enabled: false }; }, async set() {} } },
      runtime: { getURL: (file) => `chrome-extension://test/${file}` },
    },
    document,
    location: { href: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Set/Card', pathname: '/fr/Pokemon/Products/Singles/Set/Card' },
    URL,
    URLSearchParams,
    setTimeout,
  };
  vm.runInNewContext(contentSource, sandbox, { filename: 'content.js' });
  return { sandbox, document, styles, get readyCallback() { return readyCallback; }, get storageReads() { return storageReads; } };
}

test('content registers behind the runtime gate and performs no work while it remains closed', () => {
  const app = createContentSandbox({ openGate: false });
  assert.equal(typeof app.readyCallback, 'function');
  assert.equal(app.storageReads, 0);
  assert.equal(app.styles.length, 0);
});

test('non-Pokémon pages do not register a content callback', () => {
  const app = createContentSandbox({ supported: false });
  assert.equal(app.readyCallback, null);
  assert.equal(app.storageReads, 0);
  assert.equal(app.styles.length, 0);
});

test('after the gate opens, a disabled extension creates no page styles or elements', async () => {
  const app = createContentSandbox({ openGate: false });
  app.readyCallback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.storageReads, 1);
  assert.equal(app.styles.length, 0);
});

test('the active page initializer contains only language, condition minima, Pokémon offer tags and history behavior', () => {
  const initializer = contentSource.slice(contentSource.lastIndexOf('function initializePokemonPage'));
  assert.match(initializer, /trackManualOfferLanguageChanges\(\)/);
  assert.match(initializer, /applyOfferLanguage\(\)/);
  assert.match(initializer, /installConditionPriceMinima\(\)/);
  assert.match(initializer, /CardmarketPokemonOffers\.installOfferTags\(\)/);
  assert.match(initializer, /product\?\.game === 6 && featureEnabled\('showHistoricalChart'\)/);
  for (const removed of ['addTableFilter()', 'addGameNavigation()', 'addToolbox(', 'reportPublicPrices(', 'addMessageSignature(']) {
    assert.doesNotMatch(initializer, new RegExp(removed.replace(/[()]/g, '\\$&')));
  }
});
