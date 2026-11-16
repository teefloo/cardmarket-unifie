const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const historyUrl = 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=987654322&key=%2FPokemon%2FProducts%2FSingles%2FExample-Set%2FSample-Card-30C040';
const pokemonSender = { frameId: 0, url: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-30C040' };

function createBackgroundHarness({ allowed = true, permissionError = null, responseOK = true } = {}) {
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
    URL,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: responseOK, status: 503, json: async () => ({ preise: [['2026-11-14', 1.25]] }) };
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), sandbox);
  return { messageHandler: (...args) => messageHandler(...args), requests, permissionChecks };
}

async function sendRequest(harness, message = { type: 'service-request', url: historyUrl }, sender = pokemonSender) {
  let response;
  const pending = harness.messageHandler(message, sender, (value) => { response = value; });
  if (pending) await new Promise((resolve) => setTimeout(resolve, 0));
  return response;
}

test('accepts only a Pokémon Singles history request and omits credentials', async () => {
  const harness = createBackgroundHarness();
  const response = await sendRequest(harness);
  assert.equal(harness.requests.length, 1);
  const requested = new URL(harness.requests[0].url);
  assert.equal(requested.searchParams.get('spiel'), '6');
  assert.equal(requested.searchParams.get('id'), '987654322');
  assert.equal(requested.searchParams.get('key'), '/Pokemon/Products/Singles/Example-Set/Sample-Card-30C040');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.requests[0].options)), { credentials: 'omit', cache: 'no-store' });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.permissionChecks)), [{ origins: ['https://charts.matrastcg.de/*'] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { data: { preise: [['2026-11-14', 1.25]] } });
});

test('denied permission returns before any network request', async () => {
  const harness = createBackgroundHarness({ allowed: false });
  const response = await sendRequest(harness);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: 'Autorisation du service d’historique manquante.' });
});

test('permission API failure is handled without fetching', async () => {
  const harness = createBackgroundHarness({ permissionError: new Error('permission API unavailable') });
  const response = await sendRequest(harness);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: 'Vérification de l’autorisation impossible.' });
});

test('rejects malformed, cross-origin, non-Pokémon, and extended requests before fetch', async () => {
  const messages = [
    { type: 'service-request', url: 'https://example.com/api?spiel=6&id=2&key=%2FPokemon%2FProducts%2FSingles%2FA%2FB' },
    { type: 'service-request', url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=1&id=2&key=%2FMagic%2FProducts%2FSingles%2FA%2FB' },
    { type: 'service-request', url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=0&key=%2FPokemon%2FProducts%2FSingles%2FA%2FB' },
    { type: 'service-request', url: 'https://charts.matrastcg.de/api/v1/verlauf?spiel=6&id=2&key=%2Fnot-a-product' },
    { type: 'service-request', url: historyUrl, method: 'POST' },
    { type: 'service-request', url: `${historyUrl}&extra=1` },
    { type: 'service-request', url: `${historyUrl}&id=4` },
  ];
  for (const message of messages) {
    const harness = createBackgroundHarness();
    const response = await sendRequest(harness, message);
    assert.equal(harness.requests.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: 'Requête d’historique refusée.' });
  }

  for (const sender of [
    { frameId: 0, url: 'https://www.cardmarket.com/fr/Magic/Products/Singles/Set/Card' },
    { frameId: 0, url: 'https://example.com/fr/Pokemon/Products/Singles/Set/Card' },
    { frameId: 0, url: 'https://www.cardmarket.com/fr/Pokemon/Orders/Buyer' },
    { frameId: 1, url: pokemonSender.url },
  ]) {
    const harness = createBackgroundHarness();
    const response = await sendRequest(harness, { type: 'service-request', url: historyUrl }, sender);
    assert.equal(harness.requests.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: 'Requête d’historique refusée.' });
  }
});

test('does not expose provider errors or handle removed service message types', async () => {
  const failure = createBackgroundHarness({ responseOK: false });
  const response = await sendRequest(failure);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { error: 'Service d’historique indisponible.' });

  const removed = createBackgroundHarness();
  assert.equal(removed.messageHandler({ type: 'shipping-estimate' }, pokemonSender, () => {}), undefined);
  assert.equal(removed.messageHandler({ type: 'service-request', method: 'POST', url: 'https://api-cardmarket.mave.me/chart' }, pokemonSender, () => {}), undefined);
  assert.equal(removed.requests.length, 0);
});
