const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../core.js');

function createBackgroundHarness({ allowed = true, permissionError = null } = {}) {
  let messageHandler;
  const requests = [];
  const permissionChecks = [];
  const sandbox = {
    chrome: {
      runtime: { onMessage: { addListener(callback) { messageHandler = callback; } } },
      permissions: {
        contains: async (request) => {
          permissionChecks.push(request);
          if (permissionError) throw permissionError;
          return allowed;
        },
      },
    },
    importScripts(file) {
      assert.equal(file, 'core.js');
      sandbox.CardmarketCore = Core;
    },
    URL,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, json: async () => ({}) };
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), sandbox);
  return { messageHandler: (...args) => messageHandler(...args), requests, permissionChecks };
}

test('Matras authorization denial falls back without issuing a network request', async () => {
  const harness = createBackgroundHarness({ allowed: false });
  let response;
  harness.messageHandler({
    type: 'service-request', method: 'GET',
    url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=987654321&key=%2FPokemon%2FProducts%2FSingles%2F151%2FSample-V1-ABC123',
  }, {}, (value) => { response = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.requests.length, 0);
  assert.equal(response.error, 'Autorisation réseau manquante. Active-la dans les options.');
});

test('permission API failure returns a diagnostic and never leaves the request unanswered', async () => {
  const harness = createBackgroundHarness({ permissionError: new Error('permission API unavailable') });
  let response;
  harness.messageHandler({
    type: 'service-request', method: 'GET',
    url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=987654321&key=%2FPokemon%2FProducts%2FSingles%2F151%2FSample-V1-ABC123',
  }, {}, (value) => { response = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: 'Vérification de permission impossible.' });
});

test('accepts the read-only Matras product identity and forwards it without credentials', async () => {
  const harness = createBackgroundHarness();
  let response;
  harness.messageHandler({
    type: 'service-request', method: 'GET',
    url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=987654322&key=%2FPokemon%2FProducts%2FSingles%2FExample-Set%2FSample-Card-30C040',
  }, {}, (value) => { response = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.requests.length, 1);
  const requested = new URL(harness.requests[0].url);
  assert.equal(requested.searchParams.get('spiel'), '6');
  assert.equal(requested.searchParams.get('id'), '987654322');
  assert.equal(requested.searchParams.get('key'), '/Pokemon/Products/Singles/Example-Set/Sample-Card-30C040');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.requests[0].options)), { credentials: 'omit' });
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { data: {} });
});

test('rejects malformed Matras path keys before fetch', () => {
  const harness = createBackgroundHarness();
  let response;
  harness.messageHandler({
    type: 'service-request', method: 'GET',
    url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=987654322&key=%2Fnot-a-cardmarket-path',
  }, {}, (value) => { response = value; });
  assert.equal(harness.requests.length, 0);
  assert.equal(response.error, 'Requête refusée.');
});

test('Mave message handler sends validated source-compatible request headers and body', async () => {
  const harness = createBackgroundHarness();
  const now = new Date();
  const report = Core.buildMavePayload(
    '/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123',
    { labels: ['2026-11-11'], values: [1.25] },
    now,
  );
  let response;
  harness.messageHandler({
    type: 'service-request', method: 'POST', url: 'https://api-cardmarket.mave.me/chart',
    cardKey: report.cardKey, payload: report.payload, headers: report.headers,
  }, {}, (value) => { response = value; });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.requests[0].options.headers)), {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': report.payload.hash,
    Expires: report.headers.Expires,
  });
  assert.deepEqual(JSON.parse(harness.requests[0].options.body), report.payload);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { success: true });
});

test('Mave message handler rejects extra headers without making a request', () => {
  const harness = createBackgroundHarness();
  const report = Core.buildMavePayload(
    '/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123',
    { labels: ['2026-11-11'], values: [1.25] },
  );
  let response;
  harness.messageHandler({
    type: 'service-request', method: 'POST', url: 'https://api-cardmarket.mave.me/chart',
    cardKey: report.cardKey, payload: report.payload,
    headers: { ...report.headers, Authorization: 'must not pass' },
  }, {}, (value) => { response = value; });

  assert.equal(harness.requests.length, 0);
  assert.equal(response.error, 'Requête refusée.');
});

test('shipping estimate accepts only allowlisted country/locale parameters and performs a credential-free GET', async () => {
  const harness = createBackgroundHarness();
  let response;
  harness.messageHandler({ type: 'shipping-estimate', fromCountry: 7, toCountry: 12, locale: 'fr' }, {}, (value) => { response = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, 'https://help.cardmarket.com/api/shippingCosts?locale=fr&fromCountry=7&toCountry=12&preview=false');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.requests[0].options)), { credentials: 'omit' });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.permissionChecks)), [{ origins: ['https://help.cardmarket.com/*'] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { data: {} });
});

test('shipping estimate returns a permission diagnostic without fetching when access is denied', async () => {
  const harness = createBackgroundHarness({ allowed: false });
  let response;
  harness.messageHandler({ type: 'shipping-estimate', fromCountry: 7, toCountry: 12, locale: 'fr' }, {}, (value) => { response = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.requests.length, 0);
  assert.equal(response.error, 'Autorisation réseau manquante. Active-la dans les options.');
});

test('shipping estimate refuses malformed parameters and ignores caller-supplied URLs', () => {
  for (const message of [
    { type: 'shipping-estimate', fromCountry: 34, toCountry: 12, locale: 'fr' },
    { type: 'shipping-estimate', fromCountry: 7, toCountry: 12, locale: 'xx' },
    { type: 'shipping-estimate', fromCountry: 7, toCountry: 12, locale: 'fr', url: 'https://example.org/steal' },
  ]) {
    const harness = createBackgroundHarness();
    let response;
    harness.messageHandler(message, {}, (value) => { response = value; });
    assert.equal(harness.requests.length, 0);
    assert.equal(response.error, 'Requête refusée.');
  }
});
