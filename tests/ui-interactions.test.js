const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const settingsApi = require('../settings.js');
const coreApi = require('../core.js');

class UiElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.type = '';
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.textContent = '';
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this.attributes = {};
  }
  get options() { return this.children.filter((child) => child.tagName === 'OPTION'); }
  append(...children) { this.children.push(...children); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

test('popup toggle and session reset operate on local storage only after explicit actions', async () => {
  const storageState = { enabled: true, showSessionTotal: true, sessionCount: 3, sessionValue: 102.5 };
  const writes = [];
  const storage = {
    async get(defaults) { return defaults == null ? { ...storageState } : { ...defaults, ...storageState }; },
    async set(values) { writes.push({ ...values }); Object.assign(storageState, values); },
  };
  const nodes = new Map([
    ['enabled', new UiElement('input', 'enabled')],
    ['sessionSection', new UiElement('section', 'sessionSection')],
    ['resetSession', new UiElement('button', 'resetSession')],
  ]);
  const sessionStrong = new UiElement('strong');
  const document = {
    getElementById(id) { return nodes.get(id); },
    querySelector(selector) { return selector === '#session strong' ? sessionStrong : null; },
  };
  const sandbox = {
    CardmarketSettings: settingsApi,
    chrome: { storage: { local: storage } },
    document,
    Intl,
    Date,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8'), sandbox, { filename: 'popup.js' });
  await flush();
  assert.equal(nodes.get('enabled').checked, true);
  assert.equal(nodes.get('sessionSection').hidden, false);
  assert.match(sessionStrong.textContent, /3 calculs · 102,50 €/);

  nodes.get('enabled').checked = false;
  await nodes.get('enabled').listeners.change[0]({ target: nodes.get('enabled') });
  assert.equal(storageState.enabled, false);
  assert.deepEqual(writes.at(-1), { enabled: false });
  assert.equal(nodes.get('sessionSection').hidden, true, 'the session section hides immediately when the master switch is disabled');

  nodes.get('enabled').checked = true;
  await nodes.get('enabled').listeners.change[0]({ target: nodes.get('enabled') });
  assert.equal(nodes.get('sessionSection').hidden, false, 'the session section reappears when the master switch is restored');

  await nodes.get('resetSession').listeners.click[0]();
  assert.equal(storageState.sessionCount, 0);
  assert.equal(storageState.sessionValue, 0);
  assert.match(sessionStrong.textContent, /0 calculs · 0,00 €/);
});

test('popup settings link stays local and opens separately from Cardmarket', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  assert.match(html, /<a class="primary" href="options\.html" target="_blank">Ouvrir les réglages<\/a>/);
});

test('options autosave a real preference and request optional access only after a button click', async () => {
  const storageState = { ...settingsApi.DEFAULTS, enabled: true, theme: 'system' };
  const writes = [];
  const storage = {
    async get(defaults) { return defaults == null ? { ...storageState } : { ...defaults, ...storageState }; },
    async set(values) { writes.push({ ...values }); Object.assign(storageState, values); },
  };
  const permissions = new Set();
  const permissionCalls = [];
  const chrome = {
    storage: { local: storage },
    permissions: {
      async contains({ origins }) { return origins.every((origin) => permissions.has(origin)); },
      async request({ origins }) { permissionCalls.push(['request', ...origins]); origins.forEach((origin) => permissions.add(origin)); return true; },
      async remove({ origins }) { permissionCalls.push(['remove', ...origins]); origins.forEach((origin) => permissions.delete(origin)); return true; },
    },
  };
  const nodes = new Map();
  for (const [key, value] of Object.entries(settingsApi.DEFAULTS)) {
    const tag = key === 'commentTemplates' ? 'textarea' : key === 'theme' || key === 'priceMode' || key === 'shippingDestinationCountry' || key.endsWith('Type') ? 'select' : 'input';
    const node = new UiElement(tag, key);
    if (typeof value === 'boolean') node.type = 'checkbox';
    else if (typeof value === 'number') node.type = 'number';
    nodes.set(key, node);
  }
  for (const id of ['saved', 'offerLanguageAll', 'matrasStatus', 'shippingStatus', 'maveStatus', 'partnerStatus', 'matrasPermission', 'shippingPermission', 'mavePermission', 'partnerPermission']) {
    if (!nodes.has(id)) nodes.set(id, new UiElement(id.endsWith('Status') || id === 'saved' ? 'output' : 'button', id));
  }
  const games = ['Magic', 'Pokemon', 'OnePiece'].map((value) => { const node = new UiElement('input'); node.value = value; node.checked = false; return node; });
  const offerLanguages = settingsApi.OFFER_LANGUAGES.slice(1).map(({ code }) => { const node = new UiElement('input'); node.value = code; node.type = 'checkbox'; return node; });
  const priceShortcuts = ['lowest', 'avg'].map((value) => { const node = new UiElement('input'); node.value = value; node.type = 'checkbox'; return node; });
  const document = {
    getElementById(id) { return nodes.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === '.cmu-game' || selector === '.cmu-game:checked') return selector.endsWith(':checked') ? games.filter((node) => node.checked) : games;
      if (selector === 'input[name="offerLanguages"]' || selector === 'input[name="offerLanguages"]:checked') return selector.endsWith(':checked') ? offerLanguages.filter((node) => node.checked) : offerLanguages;
      if (selector === 'input[name="priceShortcuts"]' || selector === 'input[name="priceShortcuts"]:checked') return selector.endsWith(':checked') ? priceShortcuts.filter((node) => node.checked) : priceShortcuts;
      return [];
    },
    createElement(tagName) { return new UiElement(tagName); },
  };
  const sandbox = { CardmarketSettings: settingsApi, CardmarketCore: coreApi, chrome, document, Intl, Date };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8'), sandbox, { filename: 'options.js' });
  await flush();
  assert.equal(nodes.get('theme').value, 'system');
  assert.equal(nodes.get('showPriceHelper').checked, true);
  assert.equal(nodes.get('saved').textContent, 'Réglages chargés');
  assert.deepEqual(permissionCalls, [], 'loading status checks permissions but does not prompt for access');

  nodes.get('theme').value = 'dark';
  await nodes.get('theme').listeners.change[0]();
  assert.equal(storageState.theme, 'dark');
  assert.equal(writes.at(-1).theme, 'dark');
  assert.equal(nodes.get('saved').dataset.state, 'saved');

  for (const flag of settingsApi.FEATURE_FLAGS) {
    const control = nodes.get(flag);
    assert.ok(control, `${flag} has an Options control in the fixture`);
    assert.equal(control.type, 'checkbox', `${flag} is presented as an individual checkbox`);
    const nextValue = !settingsApi.DEFAULTS[flag];
    control.checked = nextValue;
    await control.listeners.change[0]();
    assert.equal(storageState[flag], nextValue, `${flag} autosaves its own new value`);
    assert.equal(writes.at(-1)[flag], nextValue, `${flag} is included in the persisted settings`);
  }
  assert.equal(permissionCalls.length, 0, 'feature toggles never request a network permission');

  nodes.get('signature').value = '— Nouvelle signature';
  await nodes.get('signature').listeners.change[0]();
  assert.equal(storageState.signature, '— Nouvelle signature');
  nodes.get('floor').value = '0.17';
  await nodes.get('floor').listeners.change[0]();
  assert.equal(storageState.floor, 0.17, 'numeric inputs are saved as numbers');

  const fr = offerLanguages.find((input) => input.value === 'fr');
  const ja = offerLanguages.find((input) => input.value === 'ja');
  fr.checked = true;
  ja.checked = true;
  await fr.listeners.change[0]();
  await flush();
  assert.deepEqual(storageState.offerLanguages, ['fr', 'ja'], 'multiple selected languages persist as a list');
  assert.equal(nodes.get('offerLanguageAll').checked, false);
  const all = nodes.get('offerLanguageAll');
  all.checked = true;
  await all.listeners.change[0]();
  await flush();
  assert.deepEqual(storageState.offerLanguages, [], 'selecting all languages removes the explicit filters');
  assert.ok(offerLanguages.every((input) => !input.checked));

  await nodes.get('matrasPermission').listeners.click[0]();
  assert.deepEqual(permissionCalls, [['request', 'https://charts.matrastcg.de/*']]);
  assert.equal(nodes.get('matrasStatus').textContent, 'Autorisé');
});
