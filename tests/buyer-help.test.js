const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
let BuyerHelp = {};
try { BuyerHelp = require('../buyer-help.js'); } catch { /* RED before implementation. */ }

test('recognizes only product routes and identifies disabled Cardmarket offer rows', () => {
  assert.equal(typeof BuyerHelp.isProductPage, 'function');
  assert.equal(BuyerHelp.isProductPage('/fr/Pokemon/Products/Singles/Set/Card'), true);
  assert.equal(BuyerHelp.isProductPage('/fr/Pokemon/Products/Booster-Boxes/Box'), true);
  assert.equal(BuyerHelp.isProductPage('/fr/Pokemon/Products/Search'), true);
  assert.equal(BuyerHelp.isProductPage('/fr/Pokemon/Spoilers/New-Products'), false);
  const row = { classList: { add(name) { this.added = name; } } };
  const button = { closest(selector) { return selector === '.article-row' ? row : null; } };
  const documentRef = { querySelectorAll(selector) { return selector === '.actions-container > .btn.btn-grey' ? [button] : []; } };
  assert.deepEqual(BuyerHelp.getDisabledOfferRows(documentRef), [row]);
});

test('marks rows locally after initial scan and after Cardmarket load-more delay only when enabled', () => {
  assert.equal(typeof BuyerHelp.installBuyerHelp, 'function');
  const rowNames = new Set();
  const row = { classList: { add(name) { rowNames.add(name); } } };
  const button = { closest(selector) { return selector === '.article-row' ? row : null; } };
  const scheduled = [];
  const loadMoreListeners = {};
  const loadMore = { addEventListener(type, callback) { loadMoreListeners[type] = callback; } };
  const documentRef = {
    body: {},
    querySelectorAll(selector) { return selector === '.actions-container > .btn.btn-grey' ? [button] : []; },
    querySelector(selector) { return selector === '#loadMoreButton' ? loadMore : null; },
  };
  const deps = {
    documentRef, pathname: '/fr/Pokemon/Products/Singles/Set/Card',
    setTimeoutFn(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; },
  };
  const off = BuyerHelp.installBuyerHelp({ enabled: true, showBuyerHelp: false }, deps);
  assert.equal(off.marked, 0);
  assert.equal(rowNames.size, 0);
  const installed = BuyerHelp.installBuyerHelp({ enabled: true, showBuyerHelp: true }, deps);
  assert.equal(installed.marked, 1);
  assert.equal(rowNames.has('cmu-unavailable-offer'), true);
  assert.equal(scheduled.at(-1).delay, 3000);
  scheduled.at(-1).callback();
  assert.equal(installed.marked, 1);
  loadMoreListeners.click();
  assert.equal(scheduled.at(-1).delay, 2000);
  scheduled.at(-1).callback();
  assert.equal(installed.marked, 1);
});

test('the master switch and non-product routes prevent buyer-help scans', () => {
  const reads = [];
  const documentRef = {
    body: {},
    querySelectorAll(selector) { reads.push(selector); return []; },
    querySelector() { reads.push('query'); return null; },
  };
  assert.equal(BuyerHelp.installBuyerHelp({ enabled: false, showBuyerHelp: true }, { documentRef, pathname: '/Products/Singles/Card' }).marked, 0);
  assert.equal(BuyerHelp.installBuyerHelp({ enabled: true, showBuyerHelp: true }, { documentRef, pathname: '/fr/Pokemon/Spoilers/New-Products' }).marked, 0);
  assert.deepEqual(reads, []);
});

test('parses the source-compatible hash and query provenance without treating markup as HTML', () => {
  assert.equal(typeof BuyerHelp.parseExternalPriceNotice, 'function');
  assert.deepEqual(BuyerHelp.parseExternalPriceNotice('#ehcm---price--12%2C50%20%E2%82%AC---from--Kai%20Cards', ''), {
    site: 'Kai Cards', price: '12,50 €',
  });
  assert.deepEqual(BuyerHelp.parseExternalPriceNotice('#unrelated', '?ehcmFrom=Shop%20%3Cimg%3E&ehcmPrice=%3Cb%3E9.95%3C%2Fb%3E'), {
    site: 'Shop <img>', price: '<b>9.95</b>',
  });
  assert.deepEqual(BuyerHelp.parseExternalPriceNotice('', '?ehcmFrom=Shop'), { site: 'Shop', price: 'Unknown' });
  assert.equal(BuyerHelp.parseExternalPriceNotice('', '?ehcmPrice=9.95'), null);
  assert.equal(BuyerHelp.parseExternalPriceNotice('#ehcm---price--9.95', ''), null);
});

test('stores and expires source notices by current Cardmarket route for ten minutes', async () => {
  assert.equal(typeof BuyerHelp.buildExternalPriceCacheKey, 'function');
  assert.equal(typeof BuyerHelp.storeExternalPriceNotice, 'function');
  assert.equal(typeof BuyerHelp.readExternalPriceNotice, 'function');
  const key = BuyerHelp.buildExternalPriceCacheKey('/fr/Pokemon/Products/Search', '?searchString=Pikachu&ehcmFrom=Shop&ehcmPrice=9.95');
  assert.equal(key, '/fr/Pokemon/Products/Search?searchString=Pikachu');
  let stored = {};
  const storage = {
    async get(name) { return { [name]: stored[name] }; },
    async set(values) { stored = { ...stored, ...values }; },
  };
  const now = 1_800_000_000_000;
  await BuyerHelp.storeExternalPriceNotice(storage, key, { site: 'Shop', price: '9,95 €' }, now);
  assert.deepEqual(await BuyerHelp.readExternalPriceNotice(storage, key, now + 9 * 60_000), {
    site: 'Shop', price: '9,95 €', date: new Date(now).toISOString(), expiresAt: now + 10 * 60_000,
  });
  assert.equal(await BuyerHelp.readExternalPriceNotice(storage, key, now + 10 * 60_000), null);
  assert.equal(stored.externalSitePrices[key], undefined);
});

test('shows an escaped source notice on search/singles only and persists explicit sources locally', async () => {
  const created = [];
  const container = { children: [], append(node) { this.children.push(node); } };
  const documentRef = {
    body: {},
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === '#loadMoreButton') return null;
      if (selector === '.cmu-came-from') return null;
      if (selector.includes('H1_PageTitle') || selector === '#FilterToggle') return container;
      return null;
    },
    createElement(tag) { const node = { tagName: tag, children: [], append(...children) { this.children.push(...children); }, classList: { add() {} }, setAttribute() {}, textContent: '' }; created.push(node); return node; },
  };
  const written = {};
  const storage = { async get(key) { return { [key]: written[key] }; }, async set(values) { Object.assign(written, values); } };
  const result = BuyerHelp.installBuyerHelp({ enabled: true, showBuyerHelp: true }, {
    documentRef,
    pathname: '/fr/Pokemon/Products/Search',
    locationRef: { pathname: '/fr/Pokemon/Products/Search', search: '?searchString=Pikachu&ehcmFrom=Shop%3Cscript%3E&ehcmPrice=%3Cimg%3E', hash: '' },
    storage,
    now: () => 1_800_000_000_000,
    setTimeoutFn: () => 1,
  });
  assert.equal(typeof result.noticePromise?.then, 'function');
  await result.noticePromise;
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[0].textContent, 'Vous venez de Shop<script>, où le prix était <img>');
  assert.equal(written.externalSitePrices['/fr/Pokemon/Products/Search?searchString=Pikachu'].site, 'Shop<script>');
  assert.equal(created.some((node) => node.innerHTML), false);
});
