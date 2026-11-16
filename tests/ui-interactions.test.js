const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const settingsApi = require('../settings.js');

class UiElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.type = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
    this.dataset = {};
    this.listeners = {};
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

test('popup toggle stores only the activation preference after an explicit change', async () => {
  const state = { ...settingsApi.DEFAULTS, enabled: true };
  const writes = [];
  const storage = {
    async get() { return { ...state }; },
    async set(values) { writes.push({ ...values }); Object.assign(state, values); },
  };
  const nodes = new Map([
    ['enabled', new UiElement('input', 'enabled')],
    ['popupStatus', new UiElement('output', 'popupStatus')],
  ]);
  const sandbox = {
    CardmarketSettings: settingsApi,
    chrome: { storage: { local: storage } },
    document: { getElementById(id) { return nodes.get(id); } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8'), sandbox);
  await flush();
  assert.equal(nodes.get('enabled').checked, true);
  nodes.get('enabled').checked = false;
  await nodes.get('enabled').listeners.change[0]();
  assert.equal(state.enabled, false);
  assert.deepEqual(writes.at(-1), { enabled: false });
  assert.equal(nodes.get('popupStatus').textContent, 'Extension désactivée.');
});

test('popup links to local options and privacy pages', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  assert.match(html, /href="options\.html"/);
  assert.match(html, /href="privacy\.html"/);
  assert.doesNotMatch(html, /Companion|buymeacoffee|discord|Mave/i);
});

test('options autosave one language and display toggles without prompting for network access', async () => {
  const state = { ...settingsApi.DEFAULTS };
  const writes = [];
  const storage = {
    async get() { return { ...state }; },
    async set(values) { writes.push({ ...values }); Object.assign(state, values); },
  };
  const granted = new Set();
  const permissionCalls = [];
  const chrome = {
    storage: { local: storage },
    permissions: {
      async contains({ origins }) { return origins.every((origin) => granted.has(origin)); },
      async request({ origins }) { permissionCalls.push(['request', ...origins]); origins.forEach((origin) => granted.add(origin)); return true; },
      async remove({ origins }) { permissionCalls.push(['remove', ...origins]); origins.forEach((origin) => granted.delete(origin)); return true; },
    },
  };
  const nodes = new Map([
    ['preferredLanguage', new UiElement('select', 'preferredLanguage')],
    ['showConditionPrices', new UiElement('input', 'showConditionPrices')],
    ['showHistoricalChart', new UiElement('input', 'showHistoricalChart')],
    ['saved', new UiElement('output', 'saved')],
    ['historyPermissionStatus', new UiElement('small', 'historyPermissionStatus')],
    ['historyPermissionButton', new UiElement('button', 'historyPermissionButton')],
  ]);
  nodes.get('showConditionPrices').type = 'checkbox';
  nodes.get('showHistoricalChart').type = 'checkbox';
  const document = { getElementById(id) { return nodes.get(id) || null; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8'), {
    CardmarketSettings: settingsApi, chrome, document,
  });
  await flush();
  assert.equal(nodes.get('preferredLanguage').value, '');
  assert.equal(nodes.get('showConditionPrices').checked, true);
  assert.equal(nodes.get('showHistoricalChart').checked, true);
  assert.equal(nodes.get('historyPermissionButton').textContent, 'Autoriser l’accès');
  assert.deepEqual(permissionCalls, [], 'loading only checks access');

  nodes.get('preferredLanguage').value = 'fr';
  await nodes.get('preferredLanguage').listeners.change[0]();
  assert.equal(state.preferredLanguage, 'fr');
  assert.equal(writes.at(-1).preferredLanguage, 'fr');

  nodes.get('showConditionPrices').checked = false;
  await nodes.get('showConditionPrices').listeners.change[0]();
  assert.equal(state.showConditionPrices, false);
  nodes.get('showHistoricalChart').checked = false;
  await nodes.get('showHistoricalChart').listeners.change[0]();
  assert.equal(state.showHistoricalChart, false);
  assert.deepEqual(permissionCalls, [], 'preference and display controls do not prompt');

  await nodes.get('historyPermissionButton').listeners.click[0]();
  assert.deepEqual(permissionCalls, [['request', 'https://charts.matrastcg.de/*']]);
  assert.equal(nodes.get('historyPermissionStatus').textContent, 'Autorisé');
  assert.equal(nodes.get('historyPermissionButton').textContent, 'Retirer l’accès');
  await nodes.get('historyPermissionButton').listeners.click[0]();
  assert.deepEqual(permissionCalls.at(-1), ['remove', 'https://charts.matrastcg.de/*']);
  assert.equal(nodes.get('historyPermissionStatus').textContent, 'Non autorisé');
});
