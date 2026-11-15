const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');

let WantsActions = {};
try { WantsActions = require('../wants-actions.js'); } catch { /* The RED phase starts before this module exists. */ }

class FakeFormData {
  constructor(source = []) {
    const entries = source instanceof FakeFormData ? source.entries()
      : Array.isArray(source) ? source
        : source?.fields || [];
    this.values = new Map(entries.map(([key, value]) => [String(key), String(value)]));
  }
  has(key) { return this.values.has(String(key)); }
  get(key) { return this.values.get(String(key)) ?? null; }
  delete(key) { this.values.delete(String(key)); }
  set(key, value) { this.values.set(String(key), String(value)); }
  append(key, value) { this.values.set(String(key), String(value)); }
  entries() { return [...this.values.entries()]; }
}

class BrowserLikeFormData extends FakeFormData {
  constructor(source) {
    if (source !== undefined && !source?.isForm) throw new TypeError('FormData accepts a form, not another FormData object.');
    super(source?.fields || []);
  }
}

function response({ status = 200, text = '<ok>' } = {}) {
  return { status, ok: status >= 200 && status < 300, async text() { return text; } };
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase(); this.children = []; this.listeners = {}; this.attributes = {};
    this.className = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.checked = false;
    this.value = ''; this.parentElement = null;
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { for (const node of [...nodes].reverse()) { node.parentElement = this; this.children.unshift(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  insertAdjacentElement(position, node) {
    if (position === 'beforebegin' && this.parentElement) {
      const index = this.parentElement.children.indexOf(this);
      node.parentElement = this.parentElement;
      this.parentElement.children.splice(index < 0 ? 0 : index, 0, node);
      return node;
    }
    if (position === 'afterbegin') { this.prepend(node); return node; }
    return null;
  }
  querySelector(selector) {
    const match = (node) => selector.startsWith('.') ? node.className.split(/\s+/).includes(selector.slice(1)) : false;
    for (const child of this.children) { if (match(child)) return child; const nested = child.querySelector?.(selector); if (nested) return nested; }
    return null;
  }
  get options() { return this.children.filter((child) => child.tagName === 'OPTION'); }
  get selectedIndex() { return Math.max(0, this.options.findIndex((option) => option.value === this.value)); }
  get selectedOptions() { return this.options[this.selectedIndex] ? [this.options[this.selectedIndex]] : []; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
}

test('only card-product S3 image filenames become IDs for bulk Wants actions', () => {
  assert.equal(typeof WantsActions.getProductIdFromImageUrl, 'function');
  assert.equal(WantsActions.getProductIdFromImageUrl('https://product-images.s3.cardmarket.com/6/123/987654.jpg'), '987654');
  assert.equal(WantsActions.getProductIdFromImageUrl('/img/logos/cardmarket.png'), null);
  assert.equal(WantsActions.getProductIdFromImageUrl('https://example.org/987654.jpg'), null);
  assert.equal(WantsActions.getProductIdFromImageUrl('https://product-images.s3.cardmarket.com/6/123/abc.jpg'), null);
});

test('bulk card discovery accepts only Cardmarket Singles with a numeric product image', () => {
  const anchor = ({ href, image, name }) => ({
    href, textContent: name, parentElement: { className: 'col' },
    getAttribute(key) { return key === 'href' ? href : null; },
    querySelector(selector) {
      if (selector === 'img') return { getAttribute(key) { return key === 'src' ? image : null; } };
      if (selector === 'h2') return { textContent: name };
      return null;
    },
  });
  const anchors = [
    anchor({ href: '/en/Pokemon/Products/Singles/Base-Set/Pikachu', image: 'https://product-images.s3.cardmarket.com/6/1/111.jpg', name: 'Pikachu' }),
    anchor({ href: 'https://evil.example/en/Pokemon/Products/Singles/Base-Set/Fake', image: 'https://product-images.s3.cardmarket.com/6/1/222.jpg', name: 'Fake' }),
    anchor({ href: '/en/Pokemon/Products/Singles/Base-Set/Logo', image: '/img/logos/cardmarket.png', name: 'Logo' }),
    anchor({ href: '/en/Pokemon/Products/Booster-Boxes/Box', image: 'https://product-images.s3.cardmarket.com/6/1/333.jpg', name: 'Box' }),
  ];
  const products = WantsActions.getBulkProductCards({ querySelectorAll(selector) { return selector.includes('/Singles/') ? anchors : []; } }, 'https://www.cardmarket.com');
  assert.deepEqual(products.map(({ id, name, url }) => [id, name, url]), [
    ['111', 'Pikachu', 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Pikachu'],
  ]);
});

test('bulk selector is outside the card link and no write occurs before the explicit submit and confirmation', async () => {
  const container = new FakeElement('div');
  const row = new FakeElement('div');
  row.append(container);
  const anchor = new FakeElement('a');
  anchor.href = '/en/Pokemon/Products/Singles/Base-Set/Pikachu'; anchor.textContent = 'Pikachu';
  anchor.getAttribute = (name) => name === 'href' ? anchor.href : null;
  anchor.querySelector = (selector) => selector === 'img'
    ? { getAttribute: (name) => name === 'src' ? 'https://product-images.s3.cardmarket.com/6/1/111.jpg' : null }
    : selector === 'h2' ? { textContent: 'Pikachu' } : null;
  container.append(anchor);
  const body = new FakeElement('body');
  const host = new FakeElement('div'); body.append(host);
  let requests = 0, accept = false;
  const documentRef = {
    body,
    querySelectorAll(selector) { return selector.includes('/Singles/') ? [anchor] : []; },
    querySelector(selector) { return selector === '.filter-form' ? host : null; },
    createElement(tagName) { return new FakeElement(tagName); },
    createTextNode(text) { const node = new FakeElement('#text'); node.textContent = text; return node; },
  };
  const options = {
    fetcher: async (_url, init) => { requests += 1; return response({ text: '<form id="AddWantsForm"></form>' }); },
    parseForm: () => ({
      isForm: true, action: '/en/Pokemon/AjaxAction/WantsList_AddWant',
      fields: [['csrf_token', 'token']],
      querySelector(selector) { return selector === 'select[name="idWantsList"]' ? { options: [{ value: '7', textContent: 'Ma liste' }] } : null; },
    }),
    FormDataCtor: FakeFormData,
    confirmAction: async () => accept,
  };
  const installed = WantsActions.installBulkWants(documentRef, 'https://www.cardmarket.com', options);
  assert.equal(requests, 0);
  assert.equal(installed.checkboxes.length, 1);
  const choice = container.children.find((child) => child.className === 'cmu-bulk-wants-choice');
  assert.ok(choice, 'the choice belongs in the card column');
  assert.equal(choice.parentElement, container);
  assert.equal(choice.children.includes(anchor), false, 'checkbox label is not nested in the product anchor');
  const checkbox = installed.checkboxes[0]; checkbox.checked = true; checkbox.listeners.change[0]();
  const prepare = installed.panel.querySelector('.cmu-button');
  await prepare.listeners.click[0]();
  assert.equal(requests, 1, 'preparing makes only the read-only product page request');
  const submit = installed.panel.querySelector('.cmu-bulk-wants-submit');
  await submit.listeners.click[0]();
  assert.equal(requests, 1, 'declining confirmation sends no write');
  accept = true;
  await submit.listeners.click[0]();
  assert.equal(requests, 2, 'one explicit confirmed click sends the single selected product');
});

test('Wants edit links and edit form actions are constrained to Cardmarket routes', () => {
  assert.equal(typeof WantsActions.validateWantEditUrl, 'function');
  assert.equal(WantsActions.validateWantEditUrl('/en/Pokemon/Wants/42', 'https://www.cardmarket.com'), 'https://www.cardmarket.com/en/Pokemon/Wants/42');
  assert.equal(WantsActions.validateWantEditUrl('https://evil.example/en/Pokemon/Wants/42', 'https://www.cardmarket.com'), null);
  assert.equal(WantsActions.validateWantEditActionUrl('/en/Pokemon/WantsList_EditWant', 'https://www.cardmarket.com'), 'https://www.cardmarket.com/en/Pokemon/WantsList_EditWant');
  assert.equal(WantsActions.validateWantEditActionUrl('https://evil.example/WantsList_EditWant', 'https://www.cardmarket.com'), null);
  assert.equal(WantsActions.validateAddWantsActionUrl('/en/Pokemon/AjaxAction/DeleteWant', 'https://www.cardmarket.com'), null);
  assert.equal(WantsActions.validateAddWantsActionUrl('/en/Pokemon/AjaxAction/AddWantToList', 'https://www.cardmarket.com'), 'https://www.cardmarket.com/en/Pokemon/AjaxAction/AddWantToList');
});

test('email alert toggle reads the form and posts its preserved fields only after confirmation', async () => {
  const calls = [];
  const form = { isForm: true, action: '/en/Pokemon/WantsList_EditWant', fields: [['idWant', '42'], ['csrf_token', 'safe-token']] };
  const result = await WantsActions.toggleWantEmailAlert({
    href: '/en/Pokemon/Wants/42', origin: 'https://www.cardmarket.com', label: 'Pikachu',
    fetcher: async (url, options) => { calls.push({ url, options }); return response(); },
    parseForm: () => form,
    FormDataCtor: FakeFormData,
    confirmAction: async (message) => message.includes('activer') && message.includes('Pikachu'),
  });

  assert.deepEqual(result, { ok: true, enabled: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://www.cardmarket.com/en/Pokemon/Wants/42');
  assert.deepEqual(calls[0].options, { credentials: 'same-origin' });
  assert.equal(calls[1].url, 'https://www.cardmarket.com/en/Pokemon/WantsList_EditWant');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.body.get('csrf_token'), 'safe-token');
  assert.equal(calls[1].options.body.get('idWant'), '42');
  assert.equal(calls[1].options.body.get('mailAlert'), '1');
});

test('declining the alarm confirmation never submits the edit form', async () => {
  const calls = [];
  const result = await WantsActions.toggleWantEmailAlert({
    href: '/en/Pokemon/Wants/42', origin: 'https://www.cardmarket.com',
    fetcher: async (url, options) => { calls.push({ url, options }); return response(); },
    parseForm: () => ({ isForm: true, action: '/en/Pokemon/WantsList_EditWant', fields: [['csrf_token', 'safe-token']] }),
    FormDataCtor: FakeFormData,
    confirmAction: async () => false,
  });
  assert.deepEqual(result, { ok: false, cancelled: true, enabled: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, undefined);
});

test('a present mailAlert field is removed only after the user confirms deactivation', async () => {
  const calls = [];
  const result = await WantsActions.toggleWantEmailAlert({
    href: '/en/Pokemon/Wants/42', origin: 'https://www.cardmarket.com', label: 'Pikachu',
    fetcher: async (url, options) => { calls.push({ url, options }); return response(); },
    parseForm: () => ({ isForm: true, action: '/en/Pokemon/WantsList_EditWant', fields: [['mailAlert', '1'], ['csrf_token', 'safe-token']] }),
    FormDataCtor: FakeFormData,
    confirmAction: async (message) => message.includes('désactiver'),
  });
  assert.deepEqual(result, { ok: true, enabled: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.body.has('mailAlert'), false);
  assert.equal(calls[1].options.body.get('csrf_token'), 'safe-token');
});

test('alarm toggle rejects an unexpected edit action before any POST', async () => {
  const calls = [];
  await assert.rejects(WantsActions.toggleWantEmailAlert({
    href: '/en/Pokemon/Wants/42', origin: 'https://www.cardmarket.com',
    fetcher: async (url, options) => { calls.push({ url, options }); return response(); },
    parseForm: () => ({ isForm: true, action: 'https://evil.example/WantsList_EditWant', fields: [] }),
    FormDataCtor: FakeFormData,
    confirmAction: async () => true,
  }), /refus/i);
  assert.equal(calls.length, 1);
});

test('bulk preparation reads only a Cardmarket Singles product form and validates its AddWants action', async () => {
  assert.equal(typeof WantsActions.prepareBulkWantForm, 'function');
  const calls = [];
  const prepared = await WantsActions.prepareBulkWantForm({
    productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Pikachu',
    origin: 'https://www.cardmarket.com',
    fetcher: async (url, options) => { calls.push({ url, options }); return response({ text: '<form id="AddWantsForm"></form>' }); },
    parseForm: (html) => html.includes('AddWantsForm') ? {
      isForm: true,
      action: '/en/Pokemon/AjaxAction/WantsList_AddWant',
      fields: [['idWantsList', '7'], ['csrf_token', 'bulk-token'], ['idMetacard', 'stale']],
      querySelector(selector) {
        return selector === 'select[name="idWantsList"]' ? { options: [{ value: '7', textContent: 'Ma liste' }] } : null;
      },
    } : null,
    FormDataCtor: FakeFormData,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Pikachu');
  assert.deepEqual(calls[0].options, { credentials: 'same-origin' });
  assert.equal(prepared.actionUrl, 'https://www.cardmarket.com/en/Pokemon/AjaxAction/WantsList_AddWant');
  assert.equal(prepared.baseData.get('csrf_token'), 'bulk-token');
  assert.deepEqual(prepared.listChoices, [{ id: '7', name: 'Ma liste' }]);
  assert.equal(WantsActions.validateAddWantsActionUrl('https://evil.example/AjaxAction/AddWant', 'https://www.cardmarket.com'), null);
});

test('bulk preparation supports only the Cardmarket AjaxAction fallback supplied by the form', () => {
  assert.equal(WantsActions.buildAddWantsAction(
    { action: '', dataAjaxAction: 'addWants' },
    'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Pikachu',
    'https://www.cardmarket.com',
  ), 'https://www.cardmarket.com/en/Pokemon/AjaxAction/addWants');
  assert.equal(WantsActions.buildAddWantsAction(
    { action: '', dataAjaxAction: 'deleteWants' },
    'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Pikachu',
    'https://www.cardmarket.com',
  ), null);
});

test('bulk Wants actions preserve the chosen list and CSRF fields and submit products sequentially after confirmation', async () => {
  const calls = [];
  const progress = [];
  const prepared = {
    actionUrl: 'https://www.cardmarket.com/en/Pokemon/AjaxAction/WantsList_AddWant',
    baseData: new FakeFormData([['idWantsList', '7'], ['csrf_token', 'bulk-token'], ['idMetacard', 'stale']]),
    listChoices: [{ id: '9', name: 'Collection' }],
  };
  const result = await WantsActions.submitBulkWants({
    prepared, products: [{ id: '111' }, { id: '222' }], listId: '9', listName: 'Collection',
    origin: 'https://www.cardmarket.com', FormDataCtor: BrowserLikeFormData,
    confirmAction: async (message) => message.includes('2') && message.includes('Collection'),
    onProgress: (event) => progress.push(event),
    fetcher: async (url, options) => { calls.push({ url, options }); return response(); },
  });
  assert.deepEqual(result, { ok: true, completed: 2, total: 2 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ options }) => options.body.get('idProduct')), ['111', '222']);
  for (const { options } of calls) {
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.body.get('idWantsList'), '9');
    assert.equal(options.body.get('csrf_token'), 'bulk-token');
    assert.equal(options.body.has('idMetacard'), false);
  }
  assert.deepEqual(progress.map((entry) => entry.completed), [1, 2]);
});

test('bulk submission spaces writes to avoid sending multiple Want actions back-to-back', async () => {
  const delays = [];
  await WantsActions.submitBulkWants({
    prepared: {
      actionUrl: 'https://www.cardmarket.com/en/Pokemon/AjaxAction/WantsList_AddWant',
      baseData: new FakeFormData([['csrf_token', 'safe']]),
    },
    products: [{ id: '111' }, { id: '222' }], listId: '9', listName: 'Collection', origin: 'https://www.cardmarket.com', FormDataCtor: FakeFormData,
    confirmAction: async () => true,
    wait: async (milliseconds) => delays.push(milliseconds),
    fetcher: async () => response(),
  });
  assert.deepEqual(delays, [3000]);
});

test('bulk Wants cancellation and non-success response do not send later items', async () => {
  const prepared = { actionUrl: 'https://www.cardmarket.com/en/Pokemon/AjaxAction/WantsList_AddWant', baseData: new FakeFormData([['csrf_token', 'safe']]) };
  let calls = 0;
  const cancelled = await WantsActions.submitBulkWants({
    prepared, products: [{ id: '111' }, { id: '222' }], listId: '9', listName: 'Collection', origin: 'https://www.cardmarket.com', FormDataCtor: BrowserLikeFormData,
    confirmAction: async () => false,
    fetcher: async () => { calls += 1; return response(); },
  });
  assert.deepEqual(cancelled, { ok: false, cancelled: true, completed: 0, total: 2 });
  assert.equal(calls, 0);

  const partial = await WantsActions.submitBulkWants({
    prepared, products: [{ id: '111' }, { id: '222' }], listId: '9', listName: 'Collection', origin: 'https://www.cardmarket.com', FormDataCtor: FakeFormData,
    confirmAction: async () => true,
    fetcher: async () => { calls += 1; return response({ status: 429 }); },
  });
  assert.deepEqual(partial, { ok: false, completed: 0, total: 2, status: 429 });
  assert.equal(calls, 1, 'the batch stops on the first failed response and does not retry');
});

test('bulk Wants submit refuses an external or unexpected action before confirmation or POST', async () => {
  let confirmations = 0, requests = 0;
  const result = await WantsActions.submitBulkWants({
    prepared: { actionUrl: 'https://evil.example/AjaxAction/AddWant', baseData: new FakeFormData([]) },
    products: [{ id: '111' }], listId: '9', listName: 'Collection', origin: 'https://www.cardmarket.com', FormDataCtor: FakeFormData,
    confirmAction: async () => { confirmations += 1; return true; },
    fetcher: async () => { requests += 1; return response(); },
  });
  assert.deepEqual(result, { ok: false, completed: 0, total: 1, error: 'Action Cardmarket refusée.' });
  assert.equal(confirmations, 0);
  assert.equal(requests, 0);
});

test('bulk submit refuses an unlisted destination before confirmation or POST', async () => {
  let confirmations = 0, requests = 0;
  const result = await WantsActions.submitBulkWants({
    prepared: {
      actionUrl: 'https://www.cardmarket.com/en/Pokemon/AjaxAction/WantsList_AddWant',
      baseData: new FakeFormData([['csrf_token', 'safe']]),
      listChoices: [{ id: '7', name: 'Ma liste' }],
    },
    products: [{ id: '111' }], listId: '9', listName: 'Other', origin: 'https://www.cardmarket.com', FormDataCtor: FakeFormData,
    confirmAction: async () => { confirmations += 1; return true; },
    fetcher: async () => { requests += 1; return response(); },
  });
  assert.deepEqual(result, { ok: false, completed: 0, total: 1, error: 'Liste Wants refusée.' });
  assert.equal(confirmations, 0);
  assert.equal(requests, 0);
});

test('Wants actions install nothing when the global switch or both feature gates are off', () => {
  const documentRef = {
    body: {},
    querySelectorAll() { throw new Error('disabled features must not scan or modify the page'); },
    querySelector() { throw new Error('disabled features must not scan or modify the page'); },
  };
  assert.deepEqual(WantsActions.installWantsActions(
    { enabled: false, showWantAlarmActions: true, showBulkWantActions: true },
    { documentRef, pathname: '/fr/Pokemon/Wants/42', origin: 'https://www.cardmarket.com', MutationObserverClass: null },
  ), { alarms: [], bulk: null, observer: null });
  assert.deepEqual(WantsActions.installWantsActions(
    { enabled: true, showWantAlarmActions: false, showBulkWantActions: false },
    { documentRef, pathname: '/fr/Pokemon/Wants/42', origin: 'https://www.cardmarket.com', MutationObserverClass: null },
  ), { alarms: [], bulk: null, observer: null });
});
