const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCartLines } = require('../cart-summary.js');

test('calculates a read-only basket item count and subtotal from visible unit prices', () => {
  assert.deepEqual(summarizeCartLines([
    { amount: 2, unitPrice: 1.25 },
    { amount: 1, unitPrice: 2.5 },
  ]), { itemCount: 3, lineCount: 2, pricedItemCount: 3, subtotal: 5, averageUnitPrice: 1.67 });
});

test('does not invent prices and ignores invalid quantities and monetary values', () => {
  assert.deepEqual(summarizeCartLines([
    { amount: 3, unitPrice: null },
    { amount: -2, unitPrice: 99 },
    { amount: 2, unitPrice: Number.NaN },
    { amount: 1, unitPrice: 0.1 },
  ]), { itemCount: 6, lineCount: 4, pricedItemCount: 1, subtotal: 0.1, averageUnitPrice: 0.1 });
});

test('recognizes the cart route and extracts only visible Cardmarket cart rows', () => {
  const { isCartPage, collectCartLines } = require('../cart-summary.js');
  assert.equal(isCartPage('/fr/Pokemon/ShoppingCart'), true);
  assert.equal(isCartPage('/fr/Pokemon/ShoppingCart/Checkout'), false);
  const price = { textContent: '1,25 €' };
  const row = {
    dataset: { productId: '987654321', amount: '2' },
    querySelector(selector) { return selector.includes('.price-container') ? price : null; },
    getAttribute() { return null; },
  };
  const documentRef = { querySelectorAll(selector) { return selector.includes('product-table') ? [row] : []; } };
  assert.deepEqual(collectCartLines(documentRef, (value) => Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''))), [
    { amount: '2', unitPrice: 1.25 },
  ]);
});

test('cart summary is gated and its panel only reads local visible line totals', () => {
  const { installCartSummary } = require('../cart-summary.js');
  const makeElement = (tagName) => ({
    tagName, children: [], attributes: {}, listeners: {}, dataset: {}, hidden: false,
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
    contains() { return false; },
  });
  const row = {
    dataset: { productId: 'p1', amount: '2' },
    querySelector(selector) { return selector.includes('.price-container') ? { textContent: '1,25 €' } : null; },
    getAttribute() { return null; },
  };
  const body = makeElement('body');
  const documentRef = {
    body,
    createElement: makeElement,
    querySelector(selector) { return selector === '.cmu-cart-summary' ? body.children.find((child) => child.className === 'cmu-cart-summary') || null : null; },
    querySelectorAll(selector) { return selector.includes('product-table') ? [row] : []; },
  };
  assert.equal(installCartSummary({ enabled: true, showCartSummary: false }, { documentRef, pathname: '/fr/Pokemon/ShoppingCart' }), null);
  assert.equal(body.children.length, 0);
  const installed = installCartSummary({ enabled: true, showCartSummary: true }, {
    documentRef,
    pathname: '/fr/Pokemon/ShoppingCart',
    parsePrice: (value) => Number(String(value).replace(',', '.').replace(/[^\d.]/g, '')),
  });
  assert.ok(installed);
  assert.match(installed.widget.children[0].textContent, /2,50/);
  assert.equal(installed.panel.hidden, true);
  installed.widget.children[0].listeners.click[0]();
  assert.equal(installed.panel.hidden, false);
  assert.match(installed.panel.children[1].textContent, /Articles : 2 sur 1 lignes/);
  assert.match(installed.panel.children[2].textContent, /2,50/);
});
