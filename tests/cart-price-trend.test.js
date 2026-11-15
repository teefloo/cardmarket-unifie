const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
let Trend = {};
try { Trend = require('../cart-price-trend.js'); } catch { /* RED before implementation. */ }

test('uses only stable product path keys and rejects non-product paths', () => {
  assert.equal(typeof Trend.getPriceTrendItemKey, 'function');
  assert.equal(Trend.getPriceTrendItemKey('/fr/Pokemon/Products/Singles/Set/Pikachu-V1'), 'Singles/Set/Pikachu-V1');
  assert.equal(Trend.getPriceTrendItemKey('/en/Pokemon/Products/Booster-Boxes/Example-Box'), 'Booster-Boxes/Example-Box');
  assert.equal(Trend.getPriceTrendItemKey('/en/Pokemon/Products/Search?searchString=pikachu'), null);
  assert.equal(Trend.getPriceTrendItemKey('/en/Pokemon/Wants/1'), null);
});

test('extracts only a labelled Cardmarket price trend and supports source locales', () => {
  assert.equal(typeof Trend.extractPriceTrendFromHtml, 'function');
  const parsePrice = (text) => {
    const parsed = Number(String(text).replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  assert.equal(Trend.extractPriceTrendFromHtml('<dl><dt>Price Trend</dt><dd>2,45 €</dd></dl>', parsePrice), '2,45 €');
  assert.equal(Trend.extractPriceTrendFromHtml('<dl><dt>Tendance des prix</dt><dd>3,10 €</dd></dl>', parsePrice), '3,10 €');
  assert.equal(Trend.extractPriceTrendFromHtml('<dl><dt>Price Trend</dt><dd>1.234,56 €</dd></dl>'), '1.234,56 €');
  assert.equal(Trend.extractPriceTrendFromHtml('<dl><dt>From</dt><dd>0,02 €</dd></dl>', parsePrice), null);
  assert.equal(Trend.extractPriceTrendFromHtml('<dl><dt>Price Trend</dt><dd>N/A</dd></dl>', parsePrice), null);
});

test('accepts local snapshots for at most two days and rejects malformed data', () => {
  assert.equal(typeof Trend.getFreshPriceTrend, 'function');
  const now = new Date('2026-11-15T12:00:00Z');
  assert.deepEqual(Trend.getFreshPriceTrend('Singles/Set/Pikachu', {
    'Singles/Set/Pikachu': { price: '2,50 €', date: '2026-11-14' },
  }, now), { price: '2,50 €', date: '2026-11-14' });
  assert.equal(Trend.getFreshPriceTrend('Singles/Set/Pikachu', {
    'Singles/Set/Pikachu': { price: '2,50 €', date: '2026-11-12' },
  }, now), null);
  assert.equal(Trend.getFreshPriceTrend('Singles/Set/Pikachu', {
    'Singles/Set/Pikachu': { price: '<img>', date: 'tomorrow' },
  }, now), null);
  assert.deepEqual(Trend.pruneExpiredPriceTrends({
    fresh: { price: '1 €', date: '2026-11-14' },
    stale: { price: '2 €', date: '2026-11-12' },
    malformed: { price: '<img>', date: '2026-11-14' },
  }, now), {
    snapshots: { fresh: { price: '1 €', date: '2026-11-14' } },
    removed: 2,
  });
});

function node(tagName) {
  const element = {
    tagName, children: [], attrs: {}, listeners: {}, dataset: {}, textContent: '',
    prepend(child) { this.children.unshift(child); child.parentElement = this; },
    append(...children) { this.children.push(...children); },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key] ?? null; },
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
    querySelector(selector) { return this.selectorMap?.[selector] || null; },
  };
  element.classList = { add(...names) { element.className = `${element.className || ''} ${names.join(' ')}`.trim(); } };
  return element;
}

test('shows cached trends without network and loads a missing one only after explicit click', async () => {
  assert.equal(typeof Trend.installCartPriceTrend, 'function');
  const price = node('td');
  price.textContent = '4,00 €';
  const anchor = node('a');
  anchor.setAttribute('href', '/fr/Pokemon/Products/Singles/Set/Pikachu');
  anchor.textContent = 'Pikachu';
  const row = node('tr');
  row.querySelector = (selector) => selector.includes('td.name') ? anchor : selector === '.price' ? price : null;
  anchor.closest = () => row;
  const created = [];
  const documentRef = {
    querySelectorAll(selector) { return selector === 'tr[data-article-id] td.name a[href]' ? [anchor] : []; },
    createElement(tag) { const element = node(tag); created.push(element); return element; },
  };
  const values = { shoppingPriceTrend: { 'Singles/Set/Pikachu': { price: '2,25 €', date: '2026-11-14' } } };
  const storage = { async get(key) { return { [key]: values[key] }; }, async set(update) { Object.assign(values, update); } };
  let fetchCount = 0;
  const installed = await Trend.installCartPriceTrend({ enabled: true, trackPriceTrendShoppingPages: true }, {
    documentRef, pathname: '/fr/Pokemon/ShoppingCart', origin: 'https://www.cardmarket.com', storage,
    now: new Date('2026-11-15T12:00:00Z'), fetchImpl: async () => { fetchCount++; return { ok: true, text: async () => '<dt>Price Trend</dt><dd>3,75 €</dd>' }; },
    parsePrice: (text) => Number(String(text).replace(',', '.').replace(/[^\d.]/g, '')) || null,
  });
  assert.equal(installed.rows, 1);
  assert.equal(fetchCount, 0);
  assert.match(price.children[0].textContent, /2,25/);

  values.shoppingPriceTrend = {};
  price.children = [];
  const missing = await Trend.installCartPriceTrend({ enabled: true, trackPriceTrendShoppingPages: true }, {
    documentRef, pathname: '/fr/Pokemon/ShoppingCart', origin: 'https://www.cardmarket.com', storage,
    now: new Date('2026-11-15T12:00:00Z'), fetchImpl: async () => { fetchCount++; return { ok: true, text: async () => '<dt>Price Trend</dt><dd>3,75 €</dd>' }; },
    parsePrice: (text) => Number(String(text).replace(',', '.').replace(/[^\d.]/g, '')) || null,
  });
  assert.equal(fetchCount, 0, 'no page read before user action');
  await price.children[0].listeners.click[0]();
  assert.equal(fetchCount, 1);
  assert.match(price.children[0].textContent, /3,75/);
  assert.equal(values.shoppingPriceTrend['Singles/Set/Pikachu'].price, '3,75 €');
});

test('captures a product trend locally only when the user submits a recognized add form', async () => {
  const form = node('form');
  const submitted = [];
  const storageValues = {};
  const documentRef = {
    querySelectorAll(selector) { return selector === '.actions-container form' ? [form] : []; },
    querySelectorAllInfo: [],
  };
  const item = { tagName: 'dt', textContent: 'Tendance des prix' };
  const value = { tagName: 'dd', textContent: '1,99 €' };
  documentRef.querySelectorAll = (selector) => {
    if (selector === '.info-list-container dt, .info-list-container dd') return [item, value];
    if (selector === '.actions-container form') return [form];
    return [];
  };
  form.classList = { contains() { return false; } };
  const storage = { async get(key) { return { [key]: storageValues[key] }; }, async set(update) { Object.assign(storageValues, update); } };
  const installed = await Trend.installCartPriceTrend({ enabled: true, trackPriceTrendShoppingPages: true }, {
    documentRef, pathname: '/fr/Pokemon/Products/Singles/Set/Pikachu', storage,
    now: new Date('2026-11-15T12:00:00Z'), parsePrice: (text) => Number(String(text).replace(',', '.').replace(/[^\d.]/g, '')) || null,
  });
  assert.equal(installed.submitForms, 1);
  assert.deepEqual(storageValues, {}, 'install does not persist a snapshot yet');
  await form.listeners.submit[0]({});
  assert.equal(storageValues.shoppingPriceTrend['Singles/Set/Pikachu'].price, '1,99 €');
  assert.equal(storageValues.shoppingPriceTrend['Singles/Set/Pikachu'].date, '2026-11-15');
});

test('matches a Shopping Wizard result without a product link only against a saved title suffix', async () => {
  const price = node('td');
  const cell = node('td');
  cell.textContent = 'Pikachu';
  const row = node('tr');
  row.querySelector = (selector) => selector === '.text-end' ? price : null;
  cell.closest = () => row;
  const documentRef = {
    querySelectorAll(selector) { return selector === '.card-body td.card-name' ? [cell] : []; },
    createElement: node,
  };
  const storage = { async get(key) { return { [key]: { 'Singles/Set/Pikachu': { price: '2,75 €', date: '2026-11-14' } } }; } };
  const result = await Trend.installCartPriceTrend({ enabled: true, trackPriceTrendShoppingPages: true }, {
    documentRef, pathname: '/fr/Pokemon/Wants/ShoppingWizard/Results/1', origin: 'https://www.cardmarket.com', storage,
    now: new Date('2026-11-15T12:00:00Z'),
  });
  assert.equal(result.rows, 1);
  assert.match(price.children[0].textContent, /2,75/);
  assert.equal(result.buttons, 0, 'no product request button is shown when there is no safe product URL');
});
