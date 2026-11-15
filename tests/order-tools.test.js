const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
let OrderTools = {};
try { OrderTools = require('../order-tools.js'); } catch { /* RED before implementation. */ }

test('splits an extended Orders/Search date range into contiguous source-compatible windows', () => {
  assert.equal(typeof OrderTools.getDateRangesFromForm, 'function');
  const ranges = OrderTools.getDateRangesFromForm('2026-01-01', '2026-04-15');
  assert.deepEqual(ranges, [
    { start: '2026-01-01', end: '2026-02-28', diffDays: 58 },
    { start: '2026-03-01', end: '2026-04-15', diffDays: 45 },
  ]);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = new Date(`${ranges[index - 1].end}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    assert.equal(previous.toISOString().slice(0, 10), ranges[index].start);
  }
  assert.deepEqual(OrderTools.getDateRangesFromForm('2026-04-15', '2026-04-15'), [
    { start: '2026-04-15', end: '2026-04-15', diffDays: 0 },
  ]);
  assert.deepEqual(OrderTools.getDateRangesFromForm('bad-date', '2026-04-15'), []);
});

test('date navigation shortcuts cover previous/current month and year without exceeding today', () => {
  assert.equal(typeof OrderTools.getDateShortcutRange, 'function');
  const now = new Date('2026-11-15T12:00:00Z');
  assert.deepEqual(OrderTools.getDateShortcutRange('lastMonth', now), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(OrderTools.getDateShortcutRange('thisMonth', now), { start: '2026-11-01', end: '2026-11-15' });
  assert.deepEqual(OrderTools.getDateShortcutRange('lastYear', now), { start: '2025-01-01', end: '2025-12-31' });
  assert.deepEqual(OrderTools.getDateShortcutRange('thisYear', now), { start: '2026-01-01', end: '2026-11-15' });
  assert.deepEqual(OrderTools.getDateShortcutRange('previous', now, '2026-08-01', '2026-09-01'), { start: '2026-07-01', end: '2026-08-01' });
  assert.equal(OrderTools.getDateShortcutRange('next', now, '2026-12-01', '2026-12-31'), null);
});

test('builds same-origin GETs for each date window and each selected shipment status', () => {
  assert.equal(typeof OrderTools.buildOrderSearchRequests, 'function');
  const requests = OrderTools.buildOrderSearchRequests({
    action: '/en/Pokemon/Orders/Search?existing=yes',
    origin: 'https://www.cardmarket.com',
    method: 'get',
    entries: [['userType', 'seller'], ['minDate', 'old'], ['maxDate', 'old'], ['searchString', 'Pikachu']],
    minDate: '2026-01-01', maxDate: '2026-04-15', statuses: ['101', '200'],
  });
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url, 'https://www.cardmarket.com/en/Pokemon/Orders/Search?existing=yes&userType=seller&minDate=2026-01-01&maxDate=2026-02-28&searchString=Pikachu&shipmentStatus=101');
  assert.equal(requests[1].status, '200');
  assert.equal(requests[2].range.start, '2026-03-01');
  assert.ok(requests.every((request) => request.method === 'GET'));
  assert.equal(OrderTools.buildOrderSearchRequests({ action: 'https://evil.example/Orders/Search', origin: 'https://www.cardmarket.com', method: 'get', entries: [], minDate: '2026-01-01', maxDate: '2026-04-15' }), null);
  assert.equal(OrderTools.buildOrderSearchRequests({ action: '/en/Pokemon/Orders/Search', origin: 'https://www.cardmarket.com', method: 'post', entries: [], minDate: '2026-01-01', maxDate: '2026-04-15' }), null);
});

test('refuses a search batch above the bounded request count before building or fetching it', () => {
  const requests = OrderTools.buildOrderSearchRequests({
    action: '/en/Pokemon/Orders/Search', origin: 'https://www.cardmarket.com', method: 'get', entries: [],
    minDate: '2000-01-01', maxDate: '2026-01-01', statuses: ['1', '2', '3', '4', '5'],
  });
  assert.equal(requests, null);
  let calls = 0;
  return OrderTools.fetchOrderSearchBatch(requests, { fetchFn: async () => { calls += 1; } }).then(() => assert.equal(calls, 0));
});

test('extended Orders/Search intercepts an over-limit long-range submit before any request or native submit', async () => {
  const listeners = {};
  const appended = [];
  const parent = { insertBefore(node) { appended.push(node); }, append(node) { appended.push(node); } };
  const from = { value: '2000-01-01', parentElement: parent, closest() { return parent; }, dispatchEvent() {} };
  const to = { value: '2026-01-01', parentElement: parent, dispatchEvent() {} };
  const submitButton = { disabled: false };
  const statusSelect = { value: '101,200,300,400,500' };
  const form = {
    parentNode: parent, nextSibling: null,
    getAttribute(name) { return name === 'action' ? '/en/Pokemon/Orders/Search' : 'get'; },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector(selector) {
      if (selector === 'input#minDate') return from;
      if (selector === 'input#maxDate') return to;
      if (selector === '#shipmentStatus') return statusSelect;
      if (selector === 'button[type="submit"]') return submitButton;
      if (selector === '.cmu-date-nav') return null;
      return null;
    },
  };
  const documentRef = {
    querySelector(selector) { return selector === 'form#OrderSearchForm' ? form : null; },
    createElement(tagName) { return { tagName, className: '', children: [], append(...children) { this.children.push(...children); }, addEventListener() {}, setAttribute() {} }; },
  };
  let fetchCalls = 0;
  const installed = OrderTools.installExtendedOrderSearch({ enabled: true, searchExtendedOrders: true }, {
    documentRef,
    locationRef: { pathname: '/en/Pokemon/Orders/Search', origin: 'https://www.cardmarket.com', search: '', href: 'https://www.cardmarket.com/en/Pokemon/Orders/Search' },
    FormDataClass: class { entries() { return [['minDate', from.value], ['maxDate', to.value], ['userType', 'seller']]; } },
    fetchFn: async () => { fetchCalls += 1; return { ok: true, text: async () => '' }; },
  });
  assert.equal(installed.installed, true);
  let prevented = false;
  let stopped = false;
  await listeners.submit({ preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.match(installed.output.textContent, /Réduis la période ou les statuts/);
  assert.equal(fetchCalls, 0);
});

test('loads long date searches sequentially only through the injected read-only GET client', async () => {
  assert.equal(typeof OrderTools.fetchOrderSearchBatch, 'function');
  const seen = [];
  const results = [];
  await OrderTools.fetchOrderSearchBatch([
    { url: 'https://www.cardmarket.com/en/Pokemon/Orders/Search?minDate=a', method: 'GET', range: { start: 'a', end: 'b' }, status: '101' },
    { url: 'https://www.cardmarket.com/en/Pokemon/Orders/Search?minDate=b', method: 'GET', range: { start: 'c', end: 'd' }, status: '200' },
  ], {
    fetchFn: async (url, init) => { seen.push([url, init]); return { ok: true, text: async () => `<main>${url}</main>` }; },
    onResult: (request, html) => results.push([request.status, html]),
    delay: async () => {},
  });
  assert.deepEqual(seen.map(([url, init]) => [url, init.method, init.credentials]), [
    ['https://www.cardmarket.com/en/Pokemon/Orders/Search?minDate=a', 'GET', 'same-origin'],
    ['https://www.cardmarket.com/en/Pokemon/Orders/Search?minDate=b', 'GET', 'same-origin'],
  ]);
  assert.deepEqual(results.map(([status]) => status), ['101', '200']);
});

test('tracking prompt does not touch a shipment until the injected final button and confirmation', () => {
  assert.equal(typeof OrderTools.isAllowedTrackingAction, 'function');
  assert.equal(OrderTools.isAllowedTrackingAction('/en/Pokemon/Shipment_SetTrackingNumber/42', 'https://www.cardmarket.com'), true);
  assert.equal(OrderTools.isAllowedTrackingAction('https://evil.example/Shipment_SetTrackingNumber', 'https://www.cardmarket.com'), false);
  assert.equal(OrderTools.isAllowedTrackingAction('/en/Pokemon/Shipment_ConfirmShipment/42', 'https://www.cardmarket.com'), false);
});

test('tracking prompt fills and submits only after a non-empty value and a positive final confirmation', () => {
  assert.equal(typeof OrderTools.mountTrackingPrompt, 'function');
  function node(tag) {
    return {
      tagName: tag.toUpperCase(), className: '', textContent: '', value: '', children: [], listeners: {}, attributes: {},
      append(...children) { children.forEach((child) => { child.parentElement = this; this.children.push(child); }); },
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      querySelector(selector) {
        const matches = (child) => selector.startsWith('.') ? child.className.split(/\s+/).includes(selector.slice(1)) : child.tagName.toLowerCase() === selector;
        for (const child of this.children) {
          if (matches(child)) return child;
          const nested = child.querySelector?.(selector);
          if (nested) return nested;
        }
        return null;
      },
    };
  }
  const body = node('div');
  const documentRef = { createElement: node };
  const trackingInput = node('input'); trackingInput.value = '';
  let submissions = 0;
  const form = { requestSubmit() { submissions += 1; } };
  const confirms = [];
  const mounted = OrderTools.mountTrackingPrompt(documentRef, body, form, trackingInput, {
    confirmFn(message) { confirms.push(message); return confirms.length > 1; },
  });
  assert.equal(mounted, true);
  const input = body.children[0].querySelector('.cmu-tracking-number');
  const button = body.children[0].querySelector('.cmu-tracking-submit');
  button.listeners.click[0]({ preventDefault() {} });
  assert.equal(submissions, 0, 'empty input cannot submit');
  input.value = 'TRACK-123';
  button.listeners.click[0]({ preventDefault() {} });
  assert.equal(submissions, 0, 'declining the final confirmation does not submit');
  assert.equal(trackingInput.value, '');
  button.listeners.click[0]({ preventDefault() {} });
  assert.equal(trackingInput.value, 'TRACK-123');
  assert.equal(submissions, 1, 'only the confirmed final click submits the native Cardmarket tracking form');
});

test('tracking helper installs only for a known tracked shipment and waits for the explicit prompt action', () => {
  const listeners = {};
  const makeNode = (tagName, className = '') => ({
    tagName: tagName.toUpperCase(), className, value: '', children: [], attributes: {},
    addEventListener(type, listener) { (this.listeners ||= {})[type] = listener; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    append(...children) { children.forEach((child) => this.children.push(child)); },
    querySelector(selector) {
      for (const child of this.children) {
        if (selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1))) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    },
  });
  const trackingInput = makeNode('input');
  let submissions = 0;
  const trackingForm = {
    getAttribute(name) { return name === 'action' ? '/en/Pokemon/Shipment_SetTrackingNumber/42' : 'post'; },
    querySelector(selector) { return selector === 'input[name="trackingNumber"]' ? trackingInput : null; },
    requestSubmit() { submissions += 1; },
  };
  const modalBody = makeNode('div', 'modal-body');
  const modal = { querySelector(selector) { return selector === '.modal-body' ? modalBody : null; } };
  const success = makeNode('span', 'text-success');
  const shippingInfo = { querySelector(selector) { return selector === '.text-success' ? success : null; } };
  const infoAnchor = { closest(selector) { return selector === 'dd' ? shippingInfo : null; } };
  const confirmButton = makeNode('input');
  const documentRef = {
    querySelector(selector) {
      if (selector === 'a[href*="/ShippingCosts"]') return infoAnchor;
      if (selector === 'form[action*="/Shipment_ConfirmShipment"] input[type="submit"]') return confirmButton;
      if (selector === 'form[action*="/Shipment_SetTrackingNumber"]') return trackingForm;
      if (selector.includes('#modal[')) return modal;
      return null;
    },
    createElement: (tag) => makeNode(tag),
  };
  const disabled = OrderTools.installTrackingCodePrompt({ enabled: true, showTrackingCodePrompt: false }, { documentRef, pathname: '/en/Pokemon/Orders/42', origin: 'https://www.cardmarket.com' });
  assert.equal(disabled.installed, false);
  assert.equal(confirmButton.listeners, undefined);

  const enabled = OrderTools.installTrackingCodePrompt({ enabled: true, showTrackingCodePrompt: true }, {
    documentRef, pathname: '/en/Pokemon/Orders/42', origin: 'https://www.cardmarket.com', confirmFn: () => true,
  });
  assert.equal(enabled.installed, true);
  confirmButton.listeners.click();
  assert.ok(modalBody.querySelector('.cmu-tracking-prompt'));
  assert.equal(submissions, 0, 'opening Cardmarket’s confirmation modal does not submit tracking data');
  const input = modalBody.querySelector('.cmu-tracking-number');
  input.value = 'TRACK-42';
  modalBody.querySelector('.cmu-tracking-submit').listeners.click({ preventDefault() {} });
  assert.equal(trackingInput.value, 'TRACK-42');
  assert.equal(submissions, 1, 'the explicit tracking button and confirmation send the existing Cardmarket form');
});

test('tracking prompt refuses a non-POST native tracking form', () => {
  const trackingForm = {
    getAttribute(name) {
      if (name === 'action') return '/en/Pokemon/Shipment_SetTrackingNumber/42';
      if (name === 'method') return 'get';
      return '';
    },
    querySelector(selector) { return selector === 'input[name="trackingNumber"]' ? { value: '' } : null; },
  };
  const documentRef = {
    querySelector(selector) {
      if (selector === 'a[href*="/ShippingCosts"]') return { closest() { return { querySelector() { return { className: 'text-success' }; } }; } };
      if (selector === 'form[action*="/Shipment_ConfirmShipment"] input[type="submit"]') return { addEventListener() {} };
      if (selector === 'form[action*="/Shipment_SetTrackingNumber"]') return trackingForm;
      return null;
    },
  };
  const result = OrderTools.installTrackingCodePrompt({ enabled: true, showTrackingCodePrompt: true }, {
    documentRef, pathname: '/en/Pokemon/Orders/42', origin: 'https://www.cardmarket.com',
  });
  assert.equal(result.installed, false);
});

