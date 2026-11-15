const test = require('node:test');
const assert = require('node:assert/strict');
const { getCartFingerprint, parseCartProducts, readCartProducts, getDuplicateSummary, renderDuplicateWarning, renderCartDuplicateWarnings } = require('../duplicate-warnings.js');

function fakeRow(productId, amount = 1) {
  const cell = { children: [], appendChild(child) { this.children.push(child); } };
  return { dataset: { productId, amount: String(amount) }, querySelector: (selector) => selector === 'td.info' ? cell : null, querySelectorAll: () => [], appendChild(child) { cell.appendChild(child); }, cell };
}

test('uses only a non-empty visible Cardmarket cart badge as a cache fingerprint', () => {
  const doc = { querySelector(selector) {
    if (selector === '#cart .main-nav-badge') return { textContent: '2' };
    if (selector === '#cart .small, #cart .text-success') return { textContent: ' (12,50 €) ' };
    return null;
  } };
  assert.equal(getCartFingerprint(doc), '2|(12,50 €)');
  assert.equal(getCartFingerprint({ querySelector: () => ({ textContent: '0' }) }), null);
});

test('parses product quantities from Cardmarket cart rows and aggregates repeated products', () => {
  const rows = [fakeRow('987654321', 2), fakeRow('987654321', 1), fakeRow('9', 3), fakeRow('../external', 5), fakeRow('11', 0)];
  const doc = { querySelectorAll: () => rows };
  assert.deepEqual(parseCartProducts(doc), { '987654321': 3, '9': 3 });
});

test('reads a non-empty cart once per fingerprint and never fetches when the badge is empty', async () => {
  const state = {};
  let fetches = 0;
  const storage = { async get(defaults) { return { ...defaults, ...state }; }, async set(values) { Object.assign(state, values); } };
  const options = {
    origin: 'https://www.cardmarket.com',
    pathname: '/fr/Pokemon/Products/Singles/Set/Card-ABC123',
    documentRef: { querySelector(selector) { return selector === '#cart .main-nav-badge' ? { textContent: '1' } : selector.startsWith('#cart') ? { textContent: '9,00 €' } : null; } },
    storage,
    fetcher: async (url, init) => {
      fetches += 1;
      assert.equal(url, 'https://www.cardmarket.com/fr/Pokemon/ShoppingCart');
      assert.deepEqual(init, { credentials: 'same-origin' });
      return { ok: true, text: async () => '<cart/>' };
    },
    DOMParserClass: class { parseFromString() { return { querySelectorAll: () => [fakeRow('987654321', 2)] }; } },
  };
  assert.deepEqual(await readCartProducts(options), { '987654321': 2 });
  assert.deepEqual(await readCartProducts(options), { '987654321': 2 });
  assert.equal(fetches, 1);
  const empty = { ...options, documentRef: { querySelector: () => ({ textContent: '0' }) } };
  assert.deepEqual(await readCartProducts(empty), {});
  assert.equal(fetches, 1);
});

test('invalidates cached cart IDs when the visible count/value fingerprint changes', async () => {
  let count = '1';
  let fetches = 0;
  const state = {};
  const storage = { async get(defaults) { return { ...defaults, ...state }; }, async set(values) { Object.assign(state, values); } };
  const options = {
    origin: 'https://www.cardmarket.com', pathname: '/en/Pokemon/Products/Singles/Set/Card', storage,
    documentRef: { querySelector(selector) { return selector === '#cart .main-nav-badge' ? { textContent: count } : selector.startsWith('#cart') ? { textContent: '8,00 €' } : null; } },
    fetcher: async () => ({ ok: true, text: async () => '<cart/>' }),
    DOMParserClass: class { parseFromString() { fetches += 1; const id = fetches === 1 ? '1' : '2'; return { querySelectorAll: () => [fakeRow(id)] }; } },
  };
  assert.deepEqual(await readCartProducts(options), { '1': 1 });
  count = '2';
  assert.deepEqual(await readCartProducts(options), { '2': 1 });
  assert.equal(fetches, 2);
});

test('combines local purchase and basket counts into a safe warning model', () => {
  assert.deepEqual(getDuplicateSummary({ recentPurchaseCount: 2, cartCount: 1 }), {
    recentPurchaseCount: 2, cartCount: 1, hasDuplicate: true,
  });
  assert.deepEqual(getDuplicateSummary({ recentPurchaseCount: 0, cartCount: 0 }), {
    recentPurchaseCount: 0, cartCount: 0, hasDuplicate: false,
  });
});

test('renders a product warning and cart-row warnings only for recent local purchases', () => {
  const parent = { insertAdjacentElement(position, node) { this.inserted = { position, node }; } };
  const documentRef = {
    querySelector(selector) { return selector === '.page-title-container' ? parent : null; },
    querySelectorAll() { return [fakeRow('987654321'), fakeRow('9')]; },
    createElement(tag) {
      const node = { tagName: tag, children: [], dataset: {}, attributes: {}, classList: { add() {} }, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k] ?? null; }, append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); }, textContent: '', className: '' };
      return node;
    },
  };
  const warning = renderDuplicateWarning({ documentRef, productId: '987654321', recentPurchaseCount: 1, cartProducts: { '987654321': 2 } });
  assert.equal(warning.className, 'cmu-duplicate');
  assert.equal(warning.getAttribute('role'), 'status');
  assert.equal(warning.children.some((child) => child.children?.some((nested) => nested.textContent?.includes('panier'))), true);
  const history = [{ productId: '987654321', purchasedAt: 1000 }, { productId: '9', purchasedAt: 1000 - 91 * 86400000 }];
  const rows = renderCartDuplicateWarnings({ documentRef, history, now: 1000, days: 90 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].className, 'cmu-duplicate-row');
});
