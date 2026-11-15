const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePrice, calculatePrice, parseProductPath, parseCardmarketIdentity, getMaveCardKeyFromPath, buildMavePayload, validateMaveRequest, joinVisibleRows, getChartRange, filterChartSeries, getChartDateBounds, getChartPointAt, calculateChartPriceAverages, formatChartPriceAverages, calculatePriceDeviation, resetChartSurface, hasRenderableChartSeries, getMatrasFailure, sanitizeChartData, hasRecentPurchase, recordSessionCalculation, collectQuickFilterRows, collectQuickFilterRowData, matchesQuickFilters, normalizeSellerCountryIds, buildSellerCountryUrl, getShippingCountryFromBackgroundPosition, normalizeShippingMethods, selectShippingMethod, buildShippingCostsUrl, shippingCacheKey, isShippingCacheFresh } = require('../core.js');

test('parses Cardmarket decimal prices in euros', () => {
  assert.equal(parsePrice('1,25 €'), 1.25);
  assert.equal(parsePrice('1.234,50 €'), 1234.5);
});

test('calculates a price with percentage adjustment and floor', () => {
  assert.equal(calculatePrice(10, { adjustmentType: 'percentage', adjustmentValue: -5, floor: 9.75 }), 9.75);
});

test('extracts a supported game and product id from Cardmarket singles URLs', () => {
  assert.deepEqual(parseProductPath('/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123'), { game: 6, id: 'ABC123' });
});

test('parses Pokemon collector numbers with digits before an embedded letter', () => {
  const path = '/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-30C040';
  assert.deepEqual(parseProductPath(path), { game: 6, id: '30C040' });
  assert.deepEqual(parseCardmarketIdentity(path, ['?idProduct=987654321'], []), {
    game: 6, productId: 987654321, key: '/Pokemon/Products/Singles/Example-Set/Sample-Card-30C040', collectorNumber: '30C040',
  });
});

test('keeps maximum historical range open ended', () => {
  assert.deepEqual(getChartRange('max', new Date('2026-11-12T00:00:00Z')), [null, '2026-11-12']);
});

test('filters Matras series to the selected calendar range and reports dates actually displayed', () => {
  const points = [
    ['2026-10-12', 1], ['2026-10-13', 1.2345], ['2026-10-14', 0],
    ['2026-11-12', 2.125], ['2026-11-13', 3], ['invalid', 4],
  ];
  const shown = filterChartSeries(points, '30d', new Date('2026-11-12T12:00:00Z'));
  assert.deepEqual(shown, [['2026-10-13', 1.2345], ['2026-10-14', 0], ['2026-11-12', 2.125]]);
  assert.deepEqual(getChartDateBounds(shown), { start: '2026-10-13', end: '2026-11-12' });
  assert.deepEqual(getChartDateBounds([['2026-11-12', 2.125]]), { start: '2026-11-12', end: '2026-11-12' });
  assert.equal(getChartDateBounds([]), null);
});

test('calculates Matras price averages over inclusive calendar windows anchored to the last finite observation', () => {
  const points = [
    ['2026-10-01', 2],
    ['2026-10-25', 2],
    ['2026-10-26', 3],
    ['2026-10-31', 5],
    ['2026-11-01', 9],
    ['2026-11-01', 0],
    ['2026-11-02', NaN],
    ['not-a-date', 100],
    ['2026-11-01', Infinity],
  ];
  assert.deepEqual(calculateChartPriceAverages(points), [
    { days: 1, start: '2026-11-01', end: '2026-11-01', mean: 9, count: 1 },
    { days: 7, start: '2026-10-26', end: '2026-11-01', mean: 17 / 3, count: 3 },
    { days: 30, start: '2026-10-03', end: '2026-11-01', mean: 4.75, count: 4 },
  ]);
});

test('excludes zero prices from averages and reports zero samples when a window contains no positive quote', () => {
  const averages = calculateChartPriceAverages([
    ['2026-11-01', 2],
    ['2026-11-01', 0],
    ['2026-11-02', 0],
    ['2026-11-01', null],
  ]);
  assert.deepEqual(averages, [
    { days: 1, start: '2026-11-01', end: '2026-11-01', mean: 2, count: 1 },
    { days: 7, start: '2026-10-26', end: '2026-11-01', mean: 2, count: 1 },
    { days: 30, start: '2026-10-03', end: '2026-11-01', mean: 2, count: 1 },
  ]);
  const noQuotedPrice = calculateChartPriceAverages([['2026-11-02', 0]]);
  assert.deepEqual(noQuotedPrice.map(({ mean, count }) => ({ mean, count })), [
    { mean: null, count: 0 }, { mean: null, count: 0 }, { mean: null, count: 0 },
  ]);
});

test('reports an em dash and zero sample count when Matras has no finite price observations', () => {
  const averages = calculateChartPriceAverages([['invalid', 3], ['2026-11-01', null], ['2026-11-02', NaN]]);
  assert.deepEqual(averages, [
    { days: 1, start: null, end: null, mean: null, count: 0 },
    { days: 7, start: null, end: null, mean: null, count: 0 },
    { days: 30, start: null, end: null, mean: null, count: 0 },
  ]);
  assert.equal(formatChartPriceAverages(averages), 'Moyennes de prix Matras · aucun relevé · 1 j : — (n=0) · 7 j : — (n=0) · 30 j : — (n=0)');
});

test('formats Matras averages with the observation date and finite-observation count', () => {
  const averages = calculateChartPriceAverages([['2026-11-01', 1.2], ['2026-11-01', 2.8]]);
  assert.equal(formatChartPriceAverages(averages), 'Moyennes de prix Matras · ancrées au 2026-11-01 · 1 j : 2,00 € (n=2) · 7 j : 2,00 € (n=2) · 30 j : 2,00 € (n=2)');
});

test('detects a Cardmarket From price more than ten percent above the three latest positive chart observations', () => {
  const points = [
    ['2026-11-01', 8], ['2026-11-03', 10], ['2026-11-04', 12],
    ['2026-11-05', 0], ['2026-11-06', Infinity], ['invalid', 100],
  ];
  assert.deepEqual(calculatePriceDeviation(11.1, points), {
    currentPrice: 11.1, averagePrice: 10, percentageHigher: 11, thresholdPercent: 10,
    count: 3, sampleStart: '2026-11-01', sampleEnd: '2026-11-04', warning: true,
  });
  assert.equal(calculatePriceDeviation(11, points).warning, false, 'the source threshold is strictly greater than ten percent');
  assert.equal(calculatePriceDeviation(9, points).warning, false);
});

test('does not emit a price deviation result without three valid price observations', () => {
  assert.equal(calculatePriceDeviation(12, [['2026-11-01', 10], ['2026-11-02', 9]]), null);
  assert.equal(calculatePriceDeviation(12, [['2026-11-01', 0], ['invalid', 9], ['2026-11-03', NaN]]), null);
  assert.equal(calculatePriceDeviation(0, [['2026-11-01', 10], ['2026-11-02', 9], ['2026-11-03', 8]]), null);
});

test('returns the exact Matras point for a hover index without price rounding', () => {
  const points = [['2026-11-11', 1.2345], ['2026-11-12', 2.125]];
  assert.deepEqual(getChartPointAt(points, 1), { date: '2026-11-12', value: 2.125 });
  assert.equal(getChartPointAt(points, 2), null);
});

test('resets Matras canvas, tooltip and stale hover state before native fallback', () => {
  const cleared = [];
  const canvas = {
    width: 560, height: 240, hidden: false, _cmuChartState: { normalized: [['2026-11-12', 2]] },
    getContext() { return { clearRect(...args) { cleared.push(args); } }; },
  };
  const tooltip = { hidden: false };
  resetChartSurface(canvas, tooltip);
  assert.deepEqual(cleared, [[0, 0, 560, 240]]);
  assert.equal(canvas.hidden, true);
  assert.equal(canvas._cmuChartState, null);
  assert.equal(tooltip.hidden, true);
});

test('requires at least two finite samples before hiding the native graph', () => {
  assert.equal(hasRenderableChartSeries([[1, 1], [2, 2]]), true);
  const normalizedPoints = [
    getChartPointAt([['2026-10-12', 1.25], ['2026-11-12', 2.5]], 0),
    getChartPointAt([['2026-10-12', 1.25], ['2026-11-12', 2.5]], 1),
  ];
  assert.equal(hasRenderableChartSeries(normalizedPoints), true, 'drawChart passes normalized {date, value} points');
  assert.equal(hasRenderableChartSeries([[1, 1]]), false);
  assert.equal(hasRenderableChartSeries([normalizedPoints[0]]), false, 'a single normalized sample still keeps the native graph');
  assert.equal(hasRenderableChartSeries([[1, null], [2, NaN]]), false);
  assert.equal(hasRenderableChartSeries([{ date: '2026-11-12', value: 'not-a-number' }]), false);
  assert.equal(hasRenderableChartSeries(null), false);
});

test('allows drawing a multi-point Matras price response after the chart normalization path', () => {
  const responsePrices = Array.from({ length: 16 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 28 + index));
    return [date.toISOString().slice(0, 10), 1.1 + index / 10];
  });
  const filtered = filterChartSeries(responsePrices, 'max', new Date('2026-11-12T00:00:00Z'));
  const drawChartPoints = filtered.map((_, index) => getChartPointAt(filtered, index)).filter(Boolean);
  assert.equal(filtered.length, 16);
  assert.equal(hasRenderableChartSeries(drawChartPoints), true);
});

test('classifies every Matras early-exit branch for visible page diagnostics', () => {
  assert.equal(getMatrasFailure({ enabled: false }), 'disabled');
  assert.equal(getMatrasFailure({ nativeFound: false }), 'native-missing');
  assert.equal(getMatrasFailure({ productIdFound: false }), 'id-missing');
  assert.equal(getMatrasFailure({ error: 'Autorisation réseau manquante. Active-la dans les options.' }), 'permission-missing');
  assert.equal(getMatrasFailure({ error: 'HTTP 503' }), 'request-failed');
  assert.equal(getMatrasFailure({ hasData: false }), 'empty');
  assert.equal(getMatrasFailure({}), null);
});

test('shares only valid numeric chart points with no labels or account data', () => {
  assert.deepEqual(sanitizeChartData({ labels: ['2026-11-11', '2026-11-12'], values: [1.5, 2] }), [
    ['2026-11-11', 1.5], ['2026-11-12', 2],
  ]);
  assert.deepEqual(sanitizeChartData({ labels: ['2026-13-40'], values: [1.5] }), []);
});

test('flags a matching purchase only inside the configured history window', () => {
  const day = 24 * 60 * 60 * 1000;
  const history = [{ key: 'Pokemon/MEW025', purchasedAt: 9 * day }];
  assert.equal(hasRecentPurchase(history, 'Pokemon/MEW025', 10 * day, 5), true);
  assert.equal(hasRecentPurchase(history, 'Pokemon/MEW025', 20 * day, 5), false);
});

test('records a calculated price and refreshes every rendered session total', async () => {
  const state = { sessionCount: 0, sessionValue: 0 };
  const writes = [];
  const storage = {
    async get(defaults) { return { ...defaults, ...state }; },
    async set(values) { Object.assign(state, values); writes.push({ ...values }); },
  };
  const displays = [{ textContent: '' }, { textContent: '' }];

  await recordSessionCalculation(storage, 35, displays);
  assert.deepEqual(state, { sessionCount: 1, sessionValue: 35 });
  assert.deepEqual(displays.map((element) => element.textContent), [
    'Total des calculs · 1 · 35,00 €',
    'Total des calculs · 1 · 35,00 €',
  ]);

  await recordSessionCalculation(storage, 1.5, displays);
  assert.deepEqual(state, { sessionCount: 2, sessionValue: 36.5 });
  assert.deepEqual(displays.map((element) => element.textContent), [
    'Total des calculs · 2 · 36,50 €',
    'Total des calculs · 2 · 36,50 €',
  ]);
  assert.equal(writes.length, 2);
});

test('collects table and Cardmarket div offer rows once for the quick filter', () => {
  const tableRow = { tagName: 'TR' };
  const cardmarketRow = { tagName: 'DIV', className: 'article-row' };
  assert.deepEqual(
    collectQuickFilterRows([tableRow, cardmarketRow], [cardmarketRow]),
    [tableRow, cardmarketRow],
  );
});

test('combines quick-filter text, language and condition criteria', () => {
  const offerText = 'Sample Card ex English Near Mint 35,00 €';
  assert.equal(matchesQuickFilters(offerText, { query: 'sample', language: 'English', condition: 'Near Mint' }), true);
  assert.equal(matchesQuickFilters(offerText, { query: 'pikachu', language: 'English', condition: 'Near Mint' }), false);
  assert.equal(matchesQuickFilters(offerText, { query: 'sample', language: 'French', condition: 'Near Mint' }), false);
  assert.equal(matchesQuickFilters(offerText, { query: 'sample', language: 'English', condition: 'Played' }), false);
  assert.equal(matchesQuickFilters(offerText, { query: '', language: '', condition: '' }), true);
});

test('normalizes seller country selections and preserves the Cardmarket search query', () => {
  assert.deepEqual(normalizeSellerCountryIds(['7', 2, '02', 'x', 0, 7]), ['2', '7']);
  const filtered = new URL(buildSellerCountryUrl('https://www.cardmarket.com/en/Pokemon/Products/Search?foo=bar&sellerCountry=5#offers', ['7', 2]));
  assert.equal(filtered.searchParams.get('foo'), 'bar');
  assert.equal(filtered.searchParams.get('sellerCountry'), '2,7');
  assert.equal(filtered.hash, '#offers');
  const reset = new URL(buildSellerCountryUrl(filtered.toString(), []));
  assert.equal(reset.searchParams.has('sellerCountry'), false);
  assert.equal(reset.searchParams.get('foo'), 'bar');
  assert.equal(reset.hash, '#offers');
});

test('matches quick-filter language across Cardmarket locale labels and combines it with conditions', () => {
  assert.equal(matchesQuickFilters('SampleSeller Français Near Mint', { language: 'French' }), true);
  assert.equal(matchesQuickFilters('SampleSeller Anglais Near Mint', { language: 'English' }), true);
  assert.equal(matchesQuickFilters('SampleSeller Français Near Mint', { language: 'French', condition: 'Near Mint' }), true);
  assert.equal(matchesQuickFilters('SampleSeller Français Played', { language: 'French', condition: 'Near Mint' }), false);
  assert.equal(matchesQuickFilters('SampleSeller English Near Mint', { language: 'French' }), false);
});

test('normalizes Cardmarket condition codes from accessible offer metadata', () => {
  const row = {
    textContent: 'SampleSeller',
    querySelectorAll(selector) {
      if (selector === '*') return [];
      assert.match(selector, /\[href\]/);
      return [
        { tagName: 'SPAN', getAttribute: (name) => name === 'aria-label' ? 'Français' : null },
        { tagName: 'SPAN', getAttribute: (name) => name === 'title' ? 'Near Mint' : null },
        { tagName: 'A', getAttribute: (name) => name === 'href' ? '#offer-condition-NM' : null },
        { tagName: 'A', getAttribute: (name) => name === 'href' ? '/fr/Pokemon/Products/Singles/Set/Sample-Mega-Card-ex' : null },
      ];
    },
  };
  const rowData = collectQuickFilterRowData(row);
  assert.equal(matchesQuickFilters(rowData.text, {
    query: 'SampleSeller', language: 'French', condition: 'Near Mint', conditionMetadata: rowData.conditionMetadata,
  }), true);
  assert.match(rowData.conditionMetadata, /Français/);
  assert.match(rowData.conditionMetadata, /#offer-condition-NM/);
  assert.doesNotMatch(rowData.conditionMetadata, /Sample-Mega-Card-ex/);
});

test('maps all Cardmarket condition abbreviations and avoids matching Pokémon ex as Excellent', () => {
  const states = [
    ['Near Mint', 'NM'], ['Mint', 'MT'], ['Excellent', 'EX'], ['Good', 'GD'],
    ['Light Played', 'LP'], ['Played', 'PL'], ['Poor', 'PO'],
  ];
  for (const [label, code] of states) {
    assert.equal(matchesQuickFilters('Seller', { condition: label, conditionMetadata: `#condition-${code}` }), true, `${label} ← ${code}`);
  }
  assert.equal(matchesQuickFilters('Sample Card ex', { condition: 'Excellent' }), false);
  assert.equal(matchesQuickFilters('Seller near mint', { condition: 'Mint' }), false);
  assert.equal(matchesQuickFilters('Seller light played', { condition: 'Played' }), false);
});

test('extracts NM text from Cardmarket CardCondition links without treating Pokémon ex as condition EX', () => {
  const row = {
    textContent: 'Pokémon ex Seller',
    getAttribute: (name) => ({ title: 'Near Mint', lang: 'fr' }[name] || null),
    querySelectorAll() {
      return [
        { tagName: 'A', textContent: 'NM', getAttribute: (name) => name === 'href' ? '/fr/CardCondition' : null },
        { tagName: 'A', textContent: 'Pokémon ex', getAttribute: (name) => name === 'href' ? '/fr/Pokemon/Products/Singles/Set/Pokemon-ex-123' : null },
      ];
    },
  };
  const rowData = collectQuickFilterRowData(row);
  assert.equal(matchesQuickFilters(rowData.text, { condition: 'Near Mint', conditionMetadata: rowData.conditionMetadata }), true);
  assert.match(rowData.text, /Near Mint/);
  assert.match(rowData.text, /fr/);
  assert.equal(matchesQuickFilters(rowData.text, { condition: 'Excellent', conditionMetadata: rowData.conditionMetadata }), false);
  assert.match(rowData.conditionMetadata, /NM/);
  assert.doesNotMatch(rowData.conditionMetadata, /Pokémon ex/);
});

test('matches a visibly rendered CardCondition label when its textContent is empty', () => {
  const row = {
    textContent: 'SampleCard seller Français',
    getAttribute: () => null,
    querySelectorAll() {
      return [
        { tagName: 'SPAN', textContent: '', getAttribute: (name) => name === 'aria-label' ? 'Français' : null },
        {
          tagName: 'A',
          textContent: '',
          innerText: 'NM',
          getAttribute: (name) => name === 'href' ? 'https://help.cardmarket.com/fr/CardCondition' : null,
        },
      ];
    },
  };
  const rowData = collectQuickFilterRowData(row);
  assert.equal(matchesQuickFilters(rowData.text, {
    language: 'French', condition: 'Near Mint', conditionMetadata: rowData.conditionMetadata,
  }), true);
  assert.match(rowData.conditionMetadata, /NM/);
});

test('uses the numeric Cardmarket product id and retains path key and collector number', () => {
  const product = parseCardmarketIdentity(
    '/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123',
    ['https://www.cardmarket.com/modal?idProduct=987654321'],
    [],
  );
  assert.deepEqual(product, {
    game: 6,
    productId: 987654321,
    key: '/Pokemon/Products/Singles/151/Sample-V1-ABC123',
    collectorNumber: 'ABC123',
  });
});

test('extracts the numeric product id from the Cardmarket S3 image fallback', () => {
  assert.equal(parseCardmarketIdentity('/de/Magic/Products/Singles/Set/Card-123', [], [
    'https://product-images.s3.cardmarket.com/123/123.jpg',
  ]).productId, 123);
});

test('builds the source-compatible Mave payload and idempotency headers', () => {
  const path = '/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123';
  const sourceKey = getMaveCardKeyFromPath(path);
  assert.equal(sourceKey, '151---sample-v1-abc123');
  const result = buildMavePayload(
    path,
    { labels: ['2026-11-11', '2026-11-12'], values: [1.25, 2] },
    new Date('2026-11-12T10:00:00Z'),
  );
  assert.deepEqual(result, {
    cardKey: '151---sample-v1-abc123',
    payload: { version: 1, hash: '151---sample-v1-abc123-8459814379693213', data: { '2026-11-11': 1.25, '2026-11-12': 2 } },
    headers: { 'X-Idempotency-Key': '151---sample-v1-abc123-8459814379693213', Expires: 'Thu, 12 Nov 2026 22:00:00 GMT' },
  });
  assert.equal(validateMaveRequest(result.cardKey, result.payload, result.headers, new Date('2026-11-12T10:00:00Z')), true);
  assert.equal(validateMaveRequest(result.cardKey, { ...result.payload, hash: 'tampered' }, result.headers, new Date('2026-11-12T10:00:00Z')), false);
  assert.equal(validateMaveRequest(result.cardKey, result.payload, { ...result.headers, Extra: 'unexpected' }, new Date('2026-11-12T10:00:00Z')), false);
});

test('exports only non-empty visible row text in page order', () => {
  assert.equal(joinVisibleRows(['  Card A · 1,00 €  ', '', ' Card B · 2,00 €']), 'Card A · 1,00 €\nCard B · 2,00 €');
});

test('maps Cardmarket flag sprites and validates shipping countries', () => {
  assert.equal(getShippingCountryFromBackgroundPosition(' -192px  -70px '), null);
  assert.equal(getShippingCountryFromBackgroundPosition('-64px -70px'), 4);
  assert.equal(getShippingCountryFromBackgroundPosition('-272px -70px'), 35);
  assert.equal(getShippingCountryFromBackgroundPosition('0px 0px'), null);
  assert.equal(buildShippingCostsUrl(1, 12, 'fr'), 'https://help.cardmarket.com/api/shippingCosts?locale=fr&fromCountry=1&toCountry=12&preview=false');
  assert.equal(buildShippingCostsUrl(34, 12, 'fr'), null);
  assert.equal(buildShippingCostsUrl(1, 12, 'xx'), null);
});

test('normalizes shipping API method shapes and selects the cheapest eligible method', () => {
  const methods = normalizeShippingMethods({ methods: [
    { name: 'Letter', price: '1,20 €', maxValue: 25, isTracked: false, isLetter: true },
    { type: 'Tracked parcel', cost: '4.00', maxOrderValue: 100, isTracked: true },
    { name: 'Virtual Delivery', price: 0.01 },
    { name: 'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance', price: 0.1 },
    { name: 'Invalid method', price: 'n/a' },
  ] });
  assert.deepEqual(methods, [
    { name: 'Letter', price: 1.2, maxValue: 25, maxWeight: 0, isTracked: false, isLetter: true, isVirtual: false },
    { name: 'Tracked parcel', price: 4, maxValue: 100, maxWeight: 0, isTracked: true, isLetter: false, isVirtual: false },
  ]);
  assert.equal(selectShippingMethod(methods, 25)?.name, 'Letter');
  assert.equal(selectShippingMethod(methods, 25.01)?.name, 'Tracked parcel');
  assert.equal(selectShippingMethod(methods, 101), null);
});

test('shipping cache freshness is bounded to 24 hours and keys include both countries and locale', () => {
  assert.equal(shippingCacheKey(7, 12, 'fr'), '7-12-fr');
  const now = 1_800_000_000_000;
  assert.equal(isShippingCacheFresh({ fetchedAt: now - 86_399_999, methods: [{ price: 1 }] }, now), true);
  assert.equal(isShippingCacheFresh({ fetchedAt: now - 86_400_000, methods: [{ price: 1 }] }, now), false);
  assert.equal(isShippingCacheFresh({ fetchedAt: now, methods: [] }, now), false);
});
