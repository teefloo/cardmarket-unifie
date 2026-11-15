const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
const Core = require('../core.js');
const {
  getOfferRows,
  getSellerCountryId,
  getOfferPrice,
  requestShippingMethods,
  installShippingEstimator,
} = require('../shipping-estimator.js');

function makeRow({ backgroundPosition = '-64px -70px', price = '20,00 €', professional = false } = {}) {
  const output = [];
  const icon = { style: { backgroundImage: 'url("ssMain.png")', backgroundPosition } };
  const priceValue = { textContent: price };
  const priceContainer = {
    children: output,
    style: {},
    append(node) { output.push(node); },
    querySelector(selector) { return selector === 'span.fw-bold' ? priceValue : null; },
  };
  return {
    id: 'articleRow123',
    output,
    querySelectorAll(selector) { return selector === 'span.icon' ? [icon] : []; },
    querySelector(selector) {
      if (selector === '.price-container') return priceContainer;
      if (selector === '.fonticon-users-professional, .fonticon-users-powerseller') return professional ? {} : null;
      if (selector === '.cmu-shipping-estimate-button') return output.find((node) => node.className === 'cmu-shipping-estimate-button') || null;
      return null;
    },
  };
}

function makeDocument(row) {
  return {
    body: {},
    querySelectorAll(selector) {
      return selector === 'div[id^="articleRow"], .article-table .article-row' ? [row] : [];
    },
    querySelector() { return null; },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(), type: '', className: '', textContent: '', disabled: false,
        attributes: {}, listeners: {},
        setAttribute(name, value) { this.attributes[name] = String(value); },
        addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      };
    },
  };
}

test('recognizes Companion article rows and derives seller country and offer price from Cardmarket fields', () => {
  const row = makeRow({ backgroundPosition: ' -64px   -70px ', price: '20,00 €' });
  const documentRef = makeDocument(row);
  assert.deepEqual(getOfferRows(documentRef), [row]);
  assert.equal(getSellerCountryId(row), 4);
  assert.equal(getOfferPrice(row), 20);
  assert.equal(getSellerCountryId(makeRow({ backgroundPosition: '0px 0px' })), null);
});

test('shipping methods are fetched on demand then cached for 24 hours by route parameters', async () => {
  let requests = 0;
  const values = { shippingEstimates: {} };
  const storage = {
    async get(defaults) { return { ...defaults, ...values }; },
    async set(update) { Object.assign(values, update); },
  };
  const sendMessage = async (message) => {
    requests += 1;
    assert.deepEqual(message, { type: 'shipping-estimate', fromCountry: 4, toCountry: 12, locale: 'fr' });
    return { data: [{ name: 'Lettre suivie', price: 2.1, maxValue: 100, isTracked: true }] };
  };
  const args = { fromCountry: 4, toCountry: 12, locale: 'fr', storage, sendMessage, now: () => 1_800_000_000_000 };
  assert.deepEqual(await requestShippingMethods(args), [{
    name: 'Lettre suivie', price: 2.1, maxValue: 100, maxWeight: 0, isTracked: true, isLetter: false, isVirtual: false,
  }]);
  assert.equal(requests, 1);
  await requestShippingMethods(args);
  assert.equal(requests, 1, 'a successful result is reused from local storage');
  args.now = () => 1_800_086_400_001;
  await requestShippingMethods(args);
  assert.equal(requests, 2, 'expired results are refreshed only when asked again');
});

test('estimator inserts no widget when disabled and does not request until a user click', async () => {
  const row = makeRow();
  const documentRef = makeDocument(row);
  let requests = 0;
  const storage = { async get(defaults) { return defaults; }, async set() {} };
  const sendMessage = async () => {
    requests += 1;
    return { data: [{ name: 'Standard', price: 1.2, maxValue: 25, isTracked: false }] };
  };

  const disabled = installShippingEstimator({
    documentRef, pathname: '/fr/Pokemon/Products/Singles/151/Pikachu',
    settings: { enabled: true, showShippingEstimator: false, shippingDestinationCountry: '12' },
    storage, sendMessage, MutationObserverClass: null,
  });
  assert.equal(disabled.buttons.length, 0);
  assert.equal(row.output.length, 0);

  const installed = installShippingEstimator({
    documentRef, pathname: '/fr/Pokemon/Products/Singles/151/Pikachu',
    settings: { enabled: true, showShippingEstimator: true, shippingDestinationCountry: '12' },
    storage, sendMessage, MutationObserverClass: null,
  });
  assert.equal(installed.buttons.length, 1);
  assert.equal(requests, 0, 'page initialization never requests a quote');
  await installed.buttons[0].listeners.click[0]();
  assert.equal(requests, 1);
  assert.match(installed.buttons[0].status.textContent, /Standard · \+1,20 €/);
  assert.equal(Core.getShippingCountryFromBackgroundPosition('-64px -70px'), 4);
});

test('unknown origin or destination displays a local message and performs no request', async () => {
  for (const settings of [
    { enabled: true, showShippingEstimator: true, shippingDestinationCountry: '' },
    { enabled: true, showShippingEstimator: true, shippingDestinationCountry: '12' },
  ]) {
    const row = settings.shippingDestinationCountry
      ? makeRow({ backgroundPosition: '0px 0px' })
      : makeRow();
    const documentRef = makeDocument(row);
    let requests = 0;
    const installed = installShippingEstimator({
      documentRef, pathname: '/fr/Pokemon/Products/Singles/151/Pikachu', settings,
      storage: { async get(defaults) { return defaults; }, async set() {} },
      async sendMessage() { requests += 1; return { data: [] }; },
      MutationObserverClass: null,
    });
    await installed.buttons[0].listeners.click[0]();
    assert.equal(requests, 0);
    assert.match(installed.buttons[0].status.textContent, /pays/i);
  }
});
