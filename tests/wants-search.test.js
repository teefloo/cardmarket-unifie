const test = require('node:test');
const assert = require('node:assert/strict');
const { isWantsPage, parseWantsOverview, parseWantsList, searchWantsLists, buildWantsListUrl, readAllWantsLists, readAndStoreWantsIndex, loadWantsSearchIndex, createWantsDocumentReader } = require('../wants-search.js');

function element({ textContent = '', attributes = {}, children = {}, className = '' } = {}) {
  return {
    textContent,
    className,
    getAttribute(name) { return attributes[name] ?? null; },
    querySelector(selector) { return children[selector] || null; },
  };
}

test('recognizes only Cardmarket Wants overview and list pages', () => {
  assert.equal(isWantsPage('/fr/Pokemon/Wants'), true);
  assert.equal(isWantsPage('/en/Magic/Wants/123456'), true);
  assert.equal(isWantsPage('/fr/Pokemon/Wants/Search'), false);
  assert.equal(isWantsPage('/fr/Pokemon/Products/Wants'), false);
});

test('extracts list IDs and labels from the Cardmarket wants overview cards', () => {
  const teaser = element({ children: {
    'a[href*="/Wants/"]': element({ textContent: 'Collection principale', attributes: { href: '/fr/Pokemon/Wants/42' } }),
    '.card-title': element({ textContent: 'Collection principale' }),
    '.card-subtitle': element({ textContent: '12 cartes' }),
  } });
  const malformed = element({ children: { 'a[href*="/Wants/"]': element({ textContent: 'No ID', attributes: { href: '/fr/Pokemon/Wants/Search' } }) } });
  const result = parseWantsOverview({ querySelectorAll: () => [teaser, malformed] }, 'https://www.cardmarket.com');
  assert.deepEqual(result, [{ id: '42', name: 'Collection principale', count: 12 }]);
});

test('parses only safe product links from a Cardmarket wants table', () => {
  const card = element({ textContent: 'Pikachu V', attributes: { href: '/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123' } });
  const row = element({ children: {
    'td.name a': card,
    'td.amount': element({ attributes: { 'data-amount': '3' }, textContent: '3' }),
    'td.expansion .visually-hidden': element({ textContent: '151' }),
  } });
  const outside = element({ children: { 'td.name a': element({ textContent: 'external', attributes: { href: 'https://example.com/card' } }) } });
  assert.deepEqual(parseWantsList({ querySelectorAll: () => [row, outside] }, 'https://www.cardmarket.com'), [
    { name: 'Pikachu V', href: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123', amount: 3, expansion: '151' },
  ]);
});

test('searches all indexed lists by accent-insensitive card name and slug', () => {
  const index = {
    '42': { name: 'Collection principale', wants: [{ name: 'Pikachu V', href: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123', amount: 3, expansion: '151' }] },
    '77': { name: 'Dresseurs', wants: [{ name: 'Évoli', href: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Evoli-151', amount: 1, expansion: '151' }] },
  };
  assert.deepEqual(searchWantsLists(index, 'evoli').map((item) => [item.listId, item.want.name]), [['77', 'Évoli']]);
  assert.equal(searchWantsLists(index, 'pikachu').length, 1);
  assert.equal(searchWantsLists(index, '').length, 0);
});

test('builds a same-origin list URL only for numeric list IDs', () => {
  assert.equal(buildWantsListUrl('https://www.cardmarket.com/fr/Pokemon/Wants', '42'), 'https://www.cardmarket.com/fr/Pokemon/Wants/42');
  assert.equal(buildWantsListUrl('https://www.cardmarket.com/fr/Pokemon/Wants', '../Search'), null);
  assert.equal(buildWantsListUrl('https://example.com/fr/Pokemon/Wants', '42'), null);
});

test('reads each Wants list sequentially only through the supplied Cardmarket reader', async () => {
  const overview = { querySelectorAll: () => [
    element({ children: {
      'a[href*="/Wants/"]': element({ textContent: 'Principale', attributes: { href: '/fr/Pokemon/Wants/42' } }),
      '.card-title': element({ textContent: 'Principale' }),
      '.card-subtitle': element({ textContent: '1 carte' }),
    } }),
    element({ children: {
      'a[href*="/Wants/"]': element({ textContent: 'Échanges', attributes: { href: '/fr/Pokemon/Wants/77' } }),
      '.card-title': element({ textContent: 'Échanges' }),
      '.card-subtitle': element({ textContent: '1 carte' }),
    } }),
  ] };
  const makeList = (slug, name) => ({ querySelectorAll: () => [element({ children: {
    'td.name a': element({ textContent: name, attributes: { href: `/fr/Pokemon/Products/Singles/151/${slug}` } }),
    'td.amount': element({ attributes: { 'data-amount': '1' } }),
    'td.expansion .visually-hidden': element({ textContent: '151' }),
  } })] });
  const calls = [];
  const progress = [];
  const index = await readAllWantsLists({
    currentUrl: 'https://www.cardmarket.com/fr/Pokemon/Wants',
    currentDocument: overview,
    fetchDocument: async (url) => {
      calls.push(url);
      assert.equal(calls.length, 1 + progress.length, 'the next read starts after the previous list was parsed');
      return url.endsWith('/42') ? makeList('Pikachu-MEW025', 'Pikachu V') : makeList('Evoli-151', 'Évoli');
    },
    onProgress: (event) => progress.push(event),
    delayMs: 0,
  });
  assert.deepEqual(calls, [
    'https://www.cardmarket.com/fr/Pokemon/Wants/42',
    'https://www.cardmarket.com/fr/Pokemon/Wants/77',
  ]);
  assert.deepEqual(Object.keys(index), ['42', '77']);
  assert.deepEqual(progress.map(({ done, total }) => [done, total]), [[1, 2], [2, 2]]);
  assert.equal(index['77'].wants[0].name, 'Évoli');
});

test('loads the stored index for immediate search without a network refresh', async () => {
  const cached = { '42': { name: 'Principale', wants: [{ name: 'Pikachu V', href: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123' }] } };
  let writes = 0;
  const index = await loadWantsSearchIndex({
    async get(defaults) { return { ...defaults, cmuWantsSearchIndex: cached }; },
    async set() { writes += 1; },
  });
  assert.equal(searchWantsLists(index, 'Pikachu').length, 1);
  assert.equal(writes, 0, 'using the cache does not write or trigger a refresh');
});

test('preserves the previous Wants cache when a later list read fails with HTTP error', async () => {
  const overview = { querySelectorAll: () => [
    element({ children: {
      'a[href*="/Wants/"]': element({ textContent: 'A', attributes: { href: '/fr/Pokemon/Wants/42' } }),
      '.card-title': element({ textContent: 'A' }),
    } }),
    element({ children: {
      'a[href*="/Wants/"]': element({ textContent: 'B', attributes: { href: '/fr/Pokemon/Wants/77' } }),
      '.card-title': element({ textContent: 'B' }),
    } }),
  ] };
  const previousCache = { old: { name: 'Conservée', wants: [] } };
  let writes = 0;
  let calls = 0;
  const progress = [];
  const storage = {
    async set() { writes += 1; },
  };
  await assert.rejects(readAndStoreWantsIndex(storage, {
    currentUrl: 'https://www.cardmarket.com/fr/Pokemon/Wants',
    currentDocument: overview,
    fetchDocument: async () => {
      calls += 1;
      if (calls === 2) throw new Error('Page Cardmarket indisponible (503).');
      return { querySelectorAll: () => [] };
    },
    onProgress: (event) => progress.push(event),
    delayMs: 0,
  }), /503/);
  assert.deepEqual(previousCache, { old: { name: 'Conservée', wants: [] } });
  assert.equal(writes, 0, 'a partial read never replaces the previous cached index');
  assert.equal(calls, 2);
  assert.deepEqual(progress.map(({ done, total }) => [done, total]), [[1, 2]]);
});

test('Wants document reader uses same-origin credentials and rejects external/HTTP failures', async () => {
  const requests = [];
  class Parser {
    parseFromString(html, type) { return { html, type }; }
  }
  const reader = createWantsDocumentReader(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => '<html>Cardmarket</html>' };
  }, { origin: 'https://www.cardmarket.com', DOMParserCtor: Parser });
  const documentRef = await reader('https://www.cardmarket.com/fr/Pokemon/Wants/42');
  assert.equal(documentRef.html, '<html>Cardmarket</html>');
  assert.deepEqual(requests[0], {
    url: 'https://www.cardmarket.com/fr/Pokemon/Wants/42',
    options: { credentials: 'same-origin' },
  });
  await assert.rejects(reader('https://example.com/fr/Pokemon/Wants/42'), /refusée/);
  const failing = createWantsDocumentReader(async () => ({ ok: false, status: 503 }), { origin: 'https://www.cardmarket.com', DOMParserCtor: Parser });
  await assert.rejects(failing('https://www.cardmarket.com/fr/Pokemon/Wants/77'), /503/);
});
