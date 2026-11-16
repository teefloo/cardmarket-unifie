const test = require('node:test');
const assert = require('node:assert/strict');
const Runtime = require('../runtime-guard.js');
const Settings = require('../settings.js');

function makeDocument({ challenge = false, title = '', text = '' } = {}) {
  return {
    title,
    body: { innerText: text },
    documentElement: {},
    querySelector(selector) { return challenge && selector === Runtime.CHALLENGE_MARKERS ? {} : null; },
  };
}

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; this.disconnected = false; }
  observe(target, options) { this.target = target; this.options = options; }
  disconnect() { this.disconnected = true; }
  trigger() { this.callback(); }
}

test('recognizes Cloudflare challenge markers and verification copy', () => {
  assert.equal(Runtime.isCloudflareChallenge(makeDocument({ challenge: true })), true);
  assert.equal(Runtime.isCloudflareChallenge(makeDocument({ title: 'Just a moment...', text: 'Checking your browser before accessing Cardmarket. Cloudflare' })), true);
  assert.equal(Runtime.isCloudflareChallenge(makeDocument({ title: 'Pikachu | Cardmarket', text: 'Offers from sellers' })), false);
});

test('allows only Cardmarket Pokémon routes', () => {
  assert.equal(Runtime.isSupportedCardmarketPage('https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Pikachu', Settings), true);
  assert.equal(Runtime.isSupportedCardmarketPage('https://cardmarket.com/Pokemon/Products/Booster-Boxes/Example', Settings), true);
  assert.equal(Runtime.isSupportedCardmarketPage('https://www.cardmarket.com/foo/Pokemon/Products/Singles/Set/Card', Settings), false);
  assert.equal(Runtime.isSupportedCardmarketPage('https://www.cardmarket.com/fr/Magic/Products/Singles/Set/Card', Settings), false);
  assert.equal(Runtime.isSupportedCardmarketPage('https://www.cardmarket.com/fr/Pokemon/Orders/Buyer', Settings), false);
  assert.equal(Runtime.isSupportedCardmarketPage('https://example.com/fr/Pokemon/Products/Singles/Set/Card', Settings), false);
});

test('waits without changing the challenge and resumes after its markers disappear', () => {
  let challenge = true;
  let calls = 0;
  const documentRef = {
    title: 'Just a moment...',
    body: { innerText: 'Checking your browser | Cloudflare' },
    documentElement: {},
    querySelector(selector) { return challenge && selector === Runtime.CHALLENGE_MARKERS ? {} : null; },
  };
  const observers = [];
  class Observer extends FakeMutationObserver {
    constructor(callback) { super(callback); observers.push(this); }
  }
  const runtime = Runtime.createRuntime({
    documentRef,
    locationRef: { href: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Pikachu' },
    MutationObserverClass: Observer,
    settingsApi: Settings,
  });
  assert.equal(runtime.runWhenReady(() => { calls += 1; }), true);
  assert.equal(calls, 0);
  assert.equal(observers.length, 1);
  assert.equal(observers[0].target, documentRef.documentElement);
  assert.equal(observers[0].options.subtree, true);
  assert.equal(observers[0].options.characterData, true, 'text-only challenge resolution is observed');
  assert.equal(observers[0].disconnected, false);
  challenge = false;
  documentRef.title = 'Pikachu | Cardmarket';
  documentRef.body.innerText = 'Offres de vendeurs';
  observers[0].trigger();
  assert.equal(calls, 1);
  assert.equal(observers[0].disconnected, true);
  observers[0].trigger();
  assert.equal(calls, 1, 'the callback only runs once');
});

test('does not wait or initialize when a route is outside the supported product scope', () => {
  let calls = 0;
  let observes = 0;
  class Observer extends FakeMutationObserver {
    observe() { observes += 1; }
  }
  const runtime = Runtime.createRuntime({
    documentRef: makeDocument({ challenge: true }),
    locationRef: { href: 'https://www.cardmarket.com/fr/Pokemon/Orders/Buyer' },
    MutationObserverClass: Observer,
    settingsApi: Settings,
  });
  assert.equal(runtime.runWhenReady(() => { calls += 1; }), false);
  assert.equal(calls, 0);
  assert.equal(observes, 0);
});

test('content styles and features are deferred until the challenge guard opens', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.match(source, /CardmarketRuntime\.runWhenReady\(initializePokemonPage\)/);
  assert.ok(source.indexOf('function initializePokemonPage') < source.indexOf('CardmarketRuntime.runWhenReady(initializePokemonPage)'));
  assert.deepEqual(manifest.content_scripts[0].js, ['core.js', 'settings.js', 'runtime-guard.js', 'pokemon-offers.js', 'content.js']);
  assert.equal(manifest.content_scripts[0].css, undefined);
  assert.doesNotMatch(JSON.stringify(manifest), /kaiofcards|despelvogel|zycards|api-cardmarket\.mave/);
});
