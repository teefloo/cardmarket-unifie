(function (root) {
  const gameIds = { Magic: 1, YuGiOh: 3, Pokemon: 6, OnePiece: 18, Lorcana: 19, Riftbound: 22 };
  const gameNames = Object.keys(gameIds);
  const SHIPPING_COUNTRIES = Object.freeze([
    { id: 1, name: 'Autriche' }, { id: 2, name: 'Belgique' }, { id: 3, name: 'Bulgarie' },
    { id: 35, name: 'Croatie' }, { id: 5, name: 'Chypre' }, { id: 6, name: 'Tchéquie' },
    { id: 8, name: 'Danemark' }, { id: 9, name: 'Estonie' }, { id: 11, name: 'Finlande' },
    { id: 12, name: 'France' }, { id: 7, name: 'Allemagne' }, { id: 14, name: 'Grèce' },
    { id: 15, name: 'Hongrie' }, { id: 37, name: 'Islande' }, { id: 16, name: 'Irlande' },
    { id: 17, name: 'Italie' }, { id: 36, name: 'Japon' }, { id: 21, name: 'Lettonie' },
    { id: 18, name: 'Liechtenstein' }, { id: 19, name: 'Lituanie' }, { id: 20, name: 'Luxembourg' },
    { id: 22, name: 'Malte' }, { id: 23, name: 'Pays-Bas' }, { id: 24, name: 'Norvège' },
    { id: 25, name: 'Pologne' }, { id: 26, name: 'Portugal' }, { id: 27, name: 'Roumanie' },
    { id: 29, name: 'Singapour' }, { id: 31, name: 'Slovaquie' }, { id: 30, name: 'Slovénie' },
    { id: 10, name: 'Espagne' }, { id: 28, name: 'Suède' }, { id: 4, name: 'Suisse' },
    { id: 13, name: 'Royaume-Uni' }, { id: 33, name: 'Canada' },
  ]);
  const SHIPPING_LOCALES = Object.freeze(['en', 'de', 'fr', 'es', 'it', 'jp', 'cn', 'pt', 'ru', 'kr', 'tw', 'nl', 'pl', 'cz', 'hu']);
  const SHIPPING_FLAG_COUNTRIES = Object.freeze({
    '-16px -70px': 1, '-32px -70px': 2, '-48px -70px': 3, '-64px -70px': 4,
    '-80px -70px': 4, '-96px -70px': 5, '-112px -70px': 6, '-128px -70px': 7,
    '-144px -70px': 8, '-160px -70px': 9, '-176px -70px': 10, '-208px -70px': 11,
    '-224px -70px': 12, '-240px -70px': 13, '-256px -70px': 14, '-272px -70px': 35,
    '-288px -70px': 15, '-304px -70px': 16, '-320px -70px': 0, '-336px -70px': 37,
    '-352px -70px': 17, '-368px -70px': 36, '-384px -70px': 18, '-400px -70px': 19,
    '-416px -70px': 20, '-432px -70px': 21, '-448px -70px': 22, '-464px -70px': 23,
    '-480px -70px': 24, '-496px -70px': 25, '-512px -70px': 26, '-528px -70px': 27,
    '-544px -70px': 0, '-560px -70px': 28, '-576px -70px': 29, '-592px -70px': 30,
    '-608px -70px': 31,
  });

  function parseCollectorNumber(slug) {
    const tokens = String(slug || '').match(/[A-Z0-9]{3,12}/gi) || [];
    return tokens.reverse().find((token) => /\d/.test(token))?.toUpperCase() || null;
  }

  function parsePrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const match = String(value).match(/-?\d[\d.\s]*(?:,\d{1,2}|\.\d{1,2})?/);
    if (!match) return null;
    const normalized = match[0].replace(/[.\s]/g, '').replace(',', '.');
    const price = Number(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function normalizeShippingCountryId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && SHIPPING_COUNTRIES.some((country) => country.id === id) ? id : null;
  }

  function getShippingCountryFromBackgroundPosition(position) {
    const parts = String(position || '').trim().split(/\s+/);
    if (parts.length < 2) return null;
    const x = Number.parseFloat(parts[0]), y = Number.parseFloat(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const id = SHIPPING_FLAG_COUNTRIES[`${x}px ${y}px`];
    return normalizeShippingCountryId(id);
  }

  function normalizeShippingLocale(locale) {
    const normalized = String(locale || '').trim().toLowerCase();
    return SHIPPING_LOCALES.includes(normalized) ? normalized : null;
  }

  function buildShippingCostsUrl(fromCountry, toCountry, locale) {
    const from = normalizeShippingCountryId(fromCountry);
    const to = normalizeShippingCountryId(toCountry);
    const language = normalizeShippingLocale(locale);
    if (from === null || to === null || language === null) return null;
    const query = new URLSearchParams({ locale: language, fromCountry: String(from), toCountry: String(to), preview: 'false' });
    return `https://help.cardmarket.com/api/shippingCosts?${query.toString()}`;
  }

  function parseShippingNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string') return NaN;
    return Number.parseFloat(value.replace(',', '.').replace(/[^\d.]/g, ''));
  }

  function normalizeShippingMethods(response) {
    const values = Array.isArray(response)
      ? response
      : response?.rows ?? response?.methods ?? response?.shippingMethods ?? [];
    if (!Array.isArray(values)) return [];
    const ignored = new Set(['virtual delivery', 'shipping cost estimation for courier parcel with full insurance']);
    return values.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const name = String(item.name ?? item.type ?? item.service ?? 'Unknown').trim();
      if (ignored.has(name.toLowerCase())) return [];
      const price = parseShippingNumber(item.price ?? item.minPrice ?? item.cost ?? item.ranges?.[0]?.price ?? item.value);
      if (!Number.isFinite(price) || price < 0) return [];
      const rawMaxValue = item.maxValue ?? item.maxOrderValue;
      const parsedMaxValue = rawMaxValue === undefined ? Infinity : parseShippingNumber(rawMaxValue);
      return [{
        name,
        price,
        maxValue: Number.isNaN(parsedMaxValue) ? Infinity : parsedMaxValue,
        maxWeight: Number(item.maxWeight ?? 0) || 0,
        isTracked: Boolean(item.isTracked),
        isLetter: Boolean(item.isLetter),
        isVirtual: Boolean(item.isVirtual),
      }];
    });
  }

  function selectShippingMethod(methods, orderValue) {
    const value = Number(orderValue);
    const amount = Number.isFinite(value) ? value : 0;
    const eligible = (Array.isArray(methods) ? methods : [])
      .filter((method) => method && Number(method.maxValue) >= amount && (!(amount > 25) || method.isTracked === true));
    return eligible.reduce((best, method) => !best || Number(method.price) < Number(best.price) ? method : best, null);
  }

  function shippingCacheKey(fromCountry, toCountry, locale) {
    const from = normalizeShippingCountryId(fromCountry), to = normalizeShippingCountryId(toCountry);
    const language = normalizeShippingLocale(locale);
    return from === null || to === null || language === null ? null : `${from}-${to}-${language}`;
  }

  function isShippingCacheFresh(entry, now = Date.now(), ttlMs = 24 * 60 * 60 * 1000) {
    const fetchedAt = Number(entry?.fetchedAt);
    return Array.isArray(entry?.methods) && entry.methods.length > 0
      && Number.isFinite(fetchedAt) && fetchedAt <= Number(now) && Number(now) - fetchedAt < ttlMs;
  }

  function calculatePrice(price, settings = {}) {
    if (!Number.isFinite(price) || price <= 0) return null;
    const amount = Number(settings.adjustmentValue) || 0;
    const adjusted = settings.adjustmentType === 'percentage' ? price * (1 + amount / 100) : price + amount;
    return Math.max(Number(settings.floor) || 0, adjusted, 0.01);
  }

  function selectProfessionalPrice(professionalPrices, visiblePrices, trendFallback = null) {
    const firstPositive = (values) => (Array.isArray(values) ? values : [])
      .map(Number).find((value) => Number.isFinite(value) && value > 0) ?? null;
    return firstPositive(professionalPrices) ?? firstPositive(visiblePrices) ?? firstPositive([trendFallback]);
  }

  function calculateProfessionalPrice(professionalPrices, visiblePrices, trendFallback = null, settings = {}) {
    const base = selectProfessionalPrice(professionalPrices, visiblePrices, trendFallback);
    if (base === null) return null;

    const globalAdjustment = Number(settings.adjustmentValue);
    const hasGlobalAdjustment = Number.isFinite(globalAdjustment) && globalAdjustment !== 0;
    let adjusted = base;
    if (hasGlobalAdjustment) {
      adjusted = settings.adjustmentType === 'percentage'
        ? base * (1 + globalAdjustment / 100)
        : base + globalAdjustment;
    } else {
      const reduction = Number(settings.proPriceReductionValue);
      if (Number.isFinite(reduction) && reduction > 0) {
        adjusted = settings.proPriceReductionType === 'percentage'
          ? base * (1 - reduction / 100)
          : base - reduction;
      }
    }

    const floor = Number(settings.floor);
    return Math.max(Number.isFinite(floor) && floor >= 0 ? floor : 0, adjusted, 0.01);
  }

  function normalizePriceShortcuts(values) {
    const allowed = ['lowest', 'avg', 'trend1', 'trend7', 'trend30', 'from', 'min'];
    const selected = new Set(Array.isArray(values) ? values.filter((value) => allowed.includes(value)) : []);
    return allowed.filter((mode) => selected.has(mode));
  }

  function calculateLotTotal(unitPrice, quantity) {
    const price = Number(unitPrice);
    const count = Number(quantity);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(count) || count < 1) return null;
    return Math.round(Math.round(price * 100) * count) / 100;
  }

  function calculateBulkLotTotal(unitPrice, quantity, bulkPricePercent = 0, floor = 0) {
    const price = Number(unitPrice);
    const count = Number(quantity);
    const percent = Number(bulkPricePercent);
    const minimum = Number(floor);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(count) || count < 1
      || !Number.isFinite(percent) || percent < -100) return null;
    const discountedUnit = price * (1 + percent / 100);
    if (!Number.isFinite(discountedUnit)) return null;
    const effectiveFloor = Number.isFinite(minimum) && minimum >= 0 ? minimum : 0;
    const roundedUnit = Math.max(Math.round(discountedUnit * 100) / 100, effectiveFloor, 0.01);
    return calculateLotTotal(roundedUnit, count);
  }

  function parseProductPath(path) {
    const parts = String(path).split('/').filter(Boolean);
    const gameIndex = parts.findIndex((part, index) => gameIds[part] !== undefined && parts[index + 1] === 'Products');
    if (gameIndex < 0 || parts[gameIndex + 1] !== 'Products' || parts[gameIndex + 2] !== 'Singles') return null;
    const product = parts.at(-1) || '';
    const id = parseCollectorNumber(product);
    return id ? { game: gameIds[parts[gameIndex]], id } : null;
  }

  function parseCardmarketIdentity(path, modalValues = [], imageUrls = []) {
    const parts = String(path).split('?')[0].split('/').filter(Boolean);
    if (/^[a-z]{2}$/i.test(parts[0] || '')) parts.shift();
    const game = gameIds[parts[0]];
    if (!game || parts[1] !== 'Products' || parts[2] !== 'Singles') return null;

    const modalIds = modalValues.flatMap((value) => [...String(value).matchAll(/[?&]idProduct=(\d+)/gi)].map((match) => Number(match[1])));
    const imageIds = imageUrls.flatMap((value) => {
      if (!String(value).includes('product-images.s3.cardmarket.com')) return [];
      const match = String(value).match(/\/(\d+)\/(\d+)\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i);
      return match && match[1] === match[2] ? [Number(match[1])] : [];
    });
    const ids = modalIds.length ? modalIds : imageIds;
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    let productId = null, count = 0;
    for (const [id, occurrences] of counts) {
      if (occurrences > count) { productId = id; count = occurrences; }
    }

    const productSlug = parts.at(-1) || '';
    const collectorNumber = parseCollectorNumber(productSlug);
    return { game, productId, key: `/${parts.join('/')}`, collectorNumber };
  }

  function getChartRange(range, now = new Date()) {
    const end = now.toISOString().slice(0, 10);
    const days = { '30d': 30, '90d': 90, '1y': 365 }[range];
    if (!days) return [null, end];
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - days);
    return [start.toISOString().slice(0, 10), end];
  }

  function normalizeChartPoint(point) {
    const date = Array.isArray(point) ? point[0] : point?.date;
    const value = Array.isArray(point) ? point[1] : point?.value;
    const numericValue = Number(value);
    if (!isIsoDate(String(date || '')) || value === null || value === '' || !Number.isFinite(numericValue) || numericValue < 0) return null;
    return [String(date), numericValue];
  }

  function filterChartSeries(values, range = 'max', now = new Date()) {
    if (!Array.isArray(values)) return [];
    const [from, to] = getChartRange(range, now);
    return values.map(normalizeChartPoint).filter((point) => point && (!from || point[0] >= from) && point[0] <= to)
      .sort((left, right) => left[0].localeCompare(right[0]));
  }

  function calculateChartPriceAverages(values, windows = [1, 7, 30]) {
    const points = Array.isArray(values)
      ? values.map(normalizeChartPoint).filter((point) => point && point[1] > 0).sort((left, right) => left[0].localeCompare(right[0]))
      : [];
    const end = points.at(-1)?.[0] || null;
    const endDate = end ? new Date(`${end}T00:00:00Z`) : null;
    return [...new Set((Array.isArray(windows) ? windows : [1, 7, 30])
      .map(Number).filter((days) => Number.isInteger(days) && days > 0))].map((days) => {
      if (!end || !endDate) return { days, start: null, end: null, mean: null, count: 0 };
      const startDate = new Date(endDate);
      startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
      const start = startDate.toISOString().slice(0, 10);
      const samples = points.filter(([date]) => date >= start && date <= end);
      let mean = null;
      let count = 0;
      for (const [, value] of samples) {
        count += 1;
        mean = mean === null ? value : mean + (value - mean) / count;
      }
      return { days, start, end, mean: Number.isFinite(mean) ? mean : null, count };
    });
  }

  function calculatePriceDeviation(currentPrice, values, { sampleCount = 3, thresholdPercent = 10 } = {}) {
    const current = Number(currentPrice);
    const count = Number(sampleCount);
    const threshold = Number(thresholdPercent);
    if (!Number.isFinite(current) || current <= 0 || !Number.isInteger(count) || count < 1
      || !Number.isFinite(threshold) || threshold < 0 || !Array.isArray(values)) return null;
    const latest = values.map(normalizeChartPoint).filter((point) => point && point[1] > 0)
      .sort((left, right) => right[0].localeCompare(left[0])).slice(0, count);
    if (latest.length !== count) return null;
    let averagePrice = 0;
    latest.forEach(([, value], index) => { averagePrice += (value - averagePrice) / (index + 1); });
    if (!Number.isFinite(averagePrice) || averagePrice <= 0) return null;
    const rawPercentage = (current - averagePrice) / averagePrice * 100;
    return {
      currentPrice: current,
      averagePrice,
      percentageHigher: Math.round((rawPercentage + Number.EPSILON) * 100) / 100,
      thresholdPercent: threshold,
      count,
      sampleStart: latest.at(-1)[0],
      sampleEnd: latest[0][0],
      warning: current > averagePrice * (1 + threshold / 100),
    };
  }

  function formatChartPriceAverages(averages) {
    const values = Array.isArray(averages) ? averages : [];
    const anchor = values.find((item) => item.end)?.end || null;
    const label = anchor ? `ancrées au ${anchor}` : 'aucun relevé';
    const price = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ranges = values.map(({ days, mean, count }) => `${days} j : ${Number.isFinite(mean) ? `${price.format(mean)} €` : '—'} (n=${Number.isInteger(count) && count >= 0 ? count : 0})`);
    return `Moyennes de prix Matras · ${label}${ranges.length ? ` · ${ranges.join(' · ')}` : ''}`;
  }

  function getChartDateBounds(values) {
    if (!Array.isArray(values)) return null;
    const points = values.map(normalizeChartPoint).filter(Boolean).sort((left, right) => left[0].localeCompare(right[0]));
    if (!points.length) return null;
    return { start: points[0][0], end: points.at(-1)[0] };
  }

  function getChartPointAt(values, index) {
    if (!Array.isArray(values) || !Number.isInteger(index) || index < 0 || index >= values.length) return null;
    const point = normalizeChartPoint(values[index]);
    return point ? { date: point[0], value: point[1] } : null;
  }

  function resetChartSurface(canvas, tooltip) {
    if (tooltip) tooltip.hidden = true;
    if (!canvas) return;
    const context = canvas.getContext?.('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas._cmuChartState = null;
    canvas.hidden = true;
  }

  function hasRenderableChartSeries(values) {
    if (!Array.isArray(values)) return false;
    const finiteValues = values.map((point) => {
      if (Array.isArray(point)) return Number(point[1]);
      if (point && typeof point === 'object') return Number(point.value);
      return Number(point);
    }).filter(Number.isFinite);
    return finiteValues.length >= 2;
  }

  function getMatrasFailure({ enabled = true, nativeFound = true, productIdFound = true, error = '', hasData = true } = {}) {
    if (!enabled) return 'disabled';
    if (!nativeFound) return 'native-missing';
    if (!productIdFound) return 'id-missing';
    if (error) return /autorisation réseau manquante|permission/i.test(String(error)) ? 'permission-missing' : 'request-failed';
    if (!hasData) return 'empty';
    return null;
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function sanitizeChartData({ labels, values } = {}) {
    if (!Array.isArray(labels) || !Array.isArray(values)) return [];
    return labels.map((label, index) => [String(label), Number(values[index])])
      .filter(([label, value]) => isIsoDate(label) && Number.isFinite(value) && value > 0)
      .map(([label, value]) => [label, Math.round(value * 10000) / 10000]);
  }

  function cyrb53(value) {
    let first = 0xdeadbeef, second = 0x41c6ce57;
    for (let index = 0; index < value.length; index += 1) {
      const character = value.charCodeAt(index);
      first = Math.imul(first ^ character, 2654435761);
      second = Math.imul(second ^ character, 1597334677);
    }
    first = Math.imul(first ^ (first >>> 16), 2246822507);
    first ^= Math.imul(second ^ (second >>> 13), 3266489909);
    second = Math.imul(second ^ (second >>> 16), 2246822507);
    second ^= Math.imul(first ^ (first >>> 13), 3266489909);
    return 4294967296 * (2097151 & second) + (first >>> 0);
  }

  function getMaveCardKeyFromPath(path) {
    const parts = String(path).split('?')[0].toLowerCase().split('/').filter(Boolean);
    if (/^[a-z]{2}$/.test(parts[0] || '')) parts.shift();
    if (!['pokemon', 'onepiece'].includes(parts[0]) || parts[1] !== 'products' || parts[2] !== 'singles' || parts.length < 5) return null;
    return `${parts.at(-2)}---${parts.at(-1)}`;
  }

  function validateMaveRequest(cardKey, payload, headers, now = new Date()) {
    if (!/^[a-z0-9._-]{1,120}---[a-z0-9._-]{1,160}$/i.test(cardKey || '')) return false;
    if (!headers || Object.keys(headers).sort().join(',') !== 'Expires,X-Idempotency-Key') return false;
    if (!payload || Object.keys(payload).sort().join(',') !== 'data,hash,version' || payload.version !== 1) return false;
    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return false;
    const entries = Object.entries(payload.data);
    if (!entries.length || entries.some(([day, price]) => !isIsoDate(day) || !Number.isFinite(price) || price <= 0)) return false;
    const expectedHash = `${cardKey}-${cyrb53(JSON.stringify(payload.data))}`;
    if (payload.hash !== expectedHash || headers?.['X-Idempotency-Key'] !== expectedHash) return false;
    const expiresHeader = headers.Expires;
    const expires = Date.parse(expiresHeader || '');
    const remaining = expires - now.getTime();
    return Number.isFinite(expires) && new Date(expires).toUTCString() === expiresHeader
      && remaining > 0 && remaining <= 12 * 60 * 60 * 1000;
  }

  function buildMavePayload(path, { labels, values } = {}, now = new Date()) {
    const cardKey = getMaveCardKeyFromPath(path);
    if (!cardKey) return null;
    const data = Object.fromEntries(sanitizeChartData({ labels, values }));
    if (!Object.keys(data).length) return null;
    const hash = `${cardKey}-${cyrb53(JSON.stringify(data))}`;
    const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000).toUTCString();
    return {
      cardKey,
      payload: { version: 1, hash, data },
      headers: { 'X-Idempotency-Key': hash, Expires: expires },
    };
  }

  function hasRecentPurchase(history, key, now = Date.now(), days = 90) {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return history.some((item) => item.key === key && Number(item.purchasedAt) >= cutoff && Number(item.purchasedAt) <= now);
  }

  function joinVisibleRows(rows) {
    return rows.map((row) => String(row).trim()).filter(Boolean).join('\n');
  }

  function normalizeSellerCountryIds(values) {
    const entries = Array.isArray(values) ? values : [values];
    return [...new Set(entries.map((value) => String(value ?? '').trim())
      .filter((value) => /^\d{1,4}$/.test(value))
      .map((value) => String(Number(value)))
      .filter((value) => Number(value) > 0))]
      .sort((left, right) => Number(left) - Number(right));
  }

  function buildSellerCountryUrl(currentUrl, countryIds) {
    let url;
    try { url = new URL(currentUrl, 'https://www.cardmarket.com'); }
    catch { return null; }
    if (!['www.cardmarket.com', 'cardmarket.com'].includes(url.hostname.toLowerCase())) return null;
    const countries = normalizeSellerCountryIds(countryIds);
    if (countries.length) url.searchParams.set('sellerCountry', countries.join(','));
    else url.searchParams.delete('sellerCountry');
    return url.toString();
  }

  function renderSessionTotal(elements, session = {}) {
    const count = Number(session.sessionCount) || 0;
    const value = Number(session.sessionValue) || 0;
    const label = `Total des calculs · ${count} · ${value.toFixed(2).replace('.', ',')} €`;
    for (const element of elements || []) element.textContent = label;
    return label;
  }

  async function recordSessionCalculation(storage, price, elements = []) {
    const amount = Number(price);
    if (!storage?.get || !storage?.set || !Number.isFinite(amount) || amount <= 0) return null;
    const current = await storage.get({ sessionCount: 0, sessionValue: 0 });
    const next = {
      sessionCount: (Number(current?.sessionCount) || 0) + 1,
      sessionValue: (Number(current?.sessionValue) || 0) + amount,
    };
    await storage.set(next);
    renderSessionTotal(elements, next);
    return next;
  }

  function collectQuickFilterRows(tableRows = [], articleRows = []) {
    return [...new Set([...tableRows, ...articleRows])];
  }

  function querySelectorAllOpenShadowRoots(root, selector) {
    const results = [];
    const seenElements = new Set();
    const seenRoots = new Set();
    const visit = (scope) => {
      if (!scope || seenRoots.has(scope)) return;
      seenRoots.add(scope);
      for (const element of scope.querySelectorAll?.(selector) || []) {
        if (!seenElements.has(element)) {
          seenElements.add(element);
          results.push(element);
        }
      }
      if (scope.shadowRoot) visit(scope.shadowRoot);
      for (const descendant of scope.querySelectorAll?.('*') || []) {
        if (descendant.shadowRoot) visit(descendant.shadowRoot);
      }
    };
    visit(root);
    return results;
  }

  function collectQuickFilterRowData(row) {
    const elements = row ? [row, ...querySelectorAllOpenShadowRoots(
      row,
      '[aria-label], [title], [data-language], [data-condition], [lang], [href], .article-condition',
    )] : [];
    const textMetadata = elements.flatMap((element) => ['aria-label', 'title', 'data-language', 'data-condition', 'lang', 'href']
      .map((name) => element.getAttribute?.(name))
      .filter(Boolean));
    const conditionMetadata = elements.flatMap((element) => {
      const labels = ['aria-label', 'title', 'data-condition'].map((name) => element.getAttribute?.(name)).filter(Boolean);
      const href = element.getAttribute?.('href') || element.href || element.getAttribute?.('data-href');
      const isProductLink = /\/Products\/Singles\//i.test(String(href || ''));
      if (href && !isProductLink && (String(href).includes('#') || /[?&](?:condition|state|idCondition)=/i.test(href))) labels.push(href);
      const hasConditionClass = element.classList?.contains('article-condition')
        || /(?:^|\s)article-condition(?:\s|$)/.test(String(element.className || ''));
      const isConditionLink = !isProductLink && (/\/CardCondition(?:\/|$|[?#])/i.test(String(href || ''))
        || hasConditionClass
        || Boolean(element.closest?.('.product-attributes, .article-condition, [data-condition]')));
      const visibleLabel = String(element.innerText || '').trim() || String(element.textContent || '').trim();
      if (isConditionLink && visibleLabel) labels.push(visibleLabel);
      return labels;
    });
    return {
      text: [row?.textContent || '', ...textMetadata].filter(Boolean).join(' '),
      conditionMetadata: conditionMetadata.join(' '),
    };
  }

  const QUICK_FILTER_LANGUAGE_ALIASES = [
    ['english', 'anglais', 'ingles', 'inglese', 'englisch', 'engels'],
    ['japanese', 'japonais', 'japones', 'giapponese', 'japanisch', 'japones'],
    ['french', 'francais', 'frances', 'franzosisch', 'francese', 'frans'],
    ['german', 'deutsch', 'allemand', 'aleman', 'tedesco', 'alemao', 'duits'],
    ['italian', 'italiano', 'italien', 'italienisch', 'italiano'],
    ['spanish', 'espanol', 'espagnol', 'spanisch', 'spagnolo', 'espanhol', 'spaans'],
  ];

  function normalizeQuickFilterLanguage(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  const QUICK_FILTER_CONDITION_ALIASES = [
    { labels: ['near mint'], codes: ['nm'] },
    { labels: ['mint'], codes: ['mt'] },
    { labels: ['excellent'], codes: ['ex'] },
    { labels: ['good'], codes: ['gd'] },
    { labels: ['light played', 'lightly played'], codes: ['lp'] },
    { labels: ['played'], codes: ['pl'] },
    { labels: ['poor'], codes: ['po'] },
  ];

  function normalizeQuickFilterCondition(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function matchesQuickFilterCondition(text, condition, conditionMetadata = '') {
    const selected = normalizeQuickFilterCondition(condition);
    if (!selected) return true;
    const group = QUICK_FILTER_CONDITION_ALIASES.find(({ labels, codes }) =>
      labels.some((label) => normalizeQuickFilterCondition(label) === selected) || codes.includes(selected));
    if (!group) return normalizeQuickFilterCondition(text).includes(selected);
    const normalizedText = ` ${normalizeQuickFilterCondition(text)} `;
    const normalizedMetadata = ` ${normalizeQuickFilterCondition(conditionMetadata)} `;
    const phraseMatch = group.labels.some((label) => normalizedText.includes(` ${normalizeQuickFilterCondition(label)} `)
      || normalizedMetadata.includes(` ${normalizeQuickFilterCondition(label)} `));
    const codeMatch = group.codes.some((code) => normalizedMetadata.includes(` ${code} `));
    if (selected === 'mint' && normalizedText.includes(' near mint ') && !normalizedMetadata.includes(' mt ')) return false;
    if (selected === 'played' && normalizedText.includes(' light played ') && !normalizedMetadata.includes(' pl ')) return false;
    return phraseMatch || codeMatch;
  }

  function matchesQuickFilterLanguage(text, selectedLanguage) {
    const selected = normalizeQuickFilterLanguage(selectedLanguage);
    if (!selected) return true;
    const aliases = QUICK_FILTER_LANGUAGE_ALIASES.find((group) => group.some((alias) => normalizeQuickFilterLanguage(alias) === selected)) || [selected];
    const normalizedText = ` ${normalizeQuickFilterLanguage(text)} `;
    return aliases.some((alias) => normalizedText.includes(` ${normalizeQuickFilterLanguage(alias)} `));
  }

  function matchesQuickFilters(text, { query = '', language = '', condition = '', conditionMetadata = '' } = {}) {
    const normalizedText = String(text || '').toLocaleLowerCase();
    const queryMatches = !String(query || '').trim() || normalizedText.includes(String(query).toLocaleLowerCase());
    const languageMatches = matchesQuickFilterLanguage(text, language);
    const conditionMatches = matchesQuickFilterCondition(text, condition, conditionMetadata);
    return queryMatches && languageMatches && conditionMatches;
  }

  const api = { SHIPPING_COUNTRIES, SHIPPING_LOCALES, normalizeShippingCountryId, getShippingCountryFromBackgroundPosition, normalizeShippingLocale, buildShippingCostsUrl, normalizeShippingMethods, selectShippingMethod, shippingCacheKey, isShippingCacheFresh, parsePrice, calculatePrice, selectProfessionalPrice, calculateProfessionalPrice, normalizePriceShortcuts, calculateLotTotal, calculateBulkLotTotal, parseProductPath, parseCardmarketIdentity, getMaveCardKeyFromPath, buildMavePayload, validateMaveRequest, joinVisibleRows, normalizeSellerCountryIds, buildSellerCountryUrl, getChartRange, filterChartSeries, getChartDateBounds, getChartPointAt, calculateChartPriceAverages, formatChartPriceAverages, calculatePriceDeviation, resetChartSurface, hasRenderableChartSeries, getMatrasFailure, sanitizeChartData, hasRecentPurchase, renderSessionTotal, recordSessionCalculation, collectQuickFilterRows, collectQuickFilterRowData, matchesQuickFilters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
