(function (root) {
  const DISABLED_ACTION_SELECTOR = '.actions-container > .btn.btn-grey';
  const DISABLED_ROW_CLASS = 'cmu-unavailable-offer';
  const EXTERNAL_PRICE_KEY = 'externalSitePrices';
  const EXTERNAL_PRICE_TTL_MS = 10 * 60 * 1000;

  function isProductPage(pathname = root.location?.pathname || '') {
    return /\/products\//i.test(String(pathname));
  }

  function getDisabledOfferRows(documentRef = root.document) {
    const rows = new Set();
    for (const action of documentRef?.querySelectorAll?.(DISABLED_ACTION_SELECTOR) || []) {
      const row = action.closest?.('.article-row');
      if (row) rows.add(row);
    }
    return [...rows];
  }

  function markDisabledOfferRows(documentRef = root.document) {
    const rows = getDisabledOfferRows(documentRef);
    for (const row of rows) row.classList?.add(DISABLED_ROW_CLASS);
    return rows.length;
  }

  function safeText(value, maxLength) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
  }

  function parseExternalPriceNotice(hash = '', search = '') {
    let explicit = null;
    const rawHash = String(hash || '');
    if (rawHash.startsWith('#ehcm---')) {
      const values = {};
      for (const part of rawHash.slice('#ehcm---'.length).split('---')) {
        const separator = part.indexOf('--');
        if (separator < 1) continue;
        const name = part.slice(0, separator);
        const raw = part.slice(separator + 2);
        try { values[name] = decodeURIComponent(raw.replace(/\+/g, ' ')); }
        catch { values[name] = raw; }
      }
      if (values.from && values.price) explicit = { site: values.from, price: values.price };
    }
    if (!explicit) {
      const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
      const site = params.get('ehcmFrom');
      if (site) explicit = { site, price: params.get('ehcmPrice') || 'Unknown' };
    }
    if (!explicit) return null;
    const site = safeText(explicit.site, 100);
    const price = safeText(explicit.price, 48) || 'Unknown';
    return site ? { site, price } : null;
  }

  function buildExternalPriceCacheKey(pathname = '', search = '') {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    params.delete('ehcmFrom');
    params.delete('ehcmPrice');
    const entries = [...params.entries()].sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
    const canonical = new URLSearchParams();
    for (const [name, value] of entries) canonical.append(name, value);
    return `${String(pathname || '').split('#')[0]}${canonical.size ? `?${canonical.toString()}` : ''}`;
  }

  async function storeExternalPriceNotice(storage, cacheKey, notice, now = Date.now()) {
    const site = safeText(notice?.site, 100);
    const price = safeText(notice?.price, 48);
    if (!storage?.get || !storage?.set || !cacheKey || !site || !price) return false;
    const stored = await storage.get(EXTERNAL_PRICE_KEY);
    const bucket = stored?.[EXTERNAL_PRICE_KEY] && typeof stored[EXTERNAL_PRICE_KEY] === 'object'
      ? { ...stored[EXTERNAL_PRICE_KEY] }
      : {};
    for (const [key, item] of Object.entries(bucket)) {
      const date = Date.parse(item?.date);
      if (!Number.isFinite(date) || date > now || now - date >= EXTERNAL_PRICE_TTL_MS) delete bucket[key];
    }
    bucket[cacheKey] = { site, price, date: new Date(now).toISOString() };
    await storage.set({ [EXTERNAL_PRICE_KEY]: bucket });
    return true;
  }

  async function readExternalPriceNotice(storage, cacheKey, now = Date.now()) {
    if (!storage?.get || !cacheKey) return null;
    const stored = await storage.get(EXTERNAL_PRICE_KEY);
    const bucket = stored?.[EXTERNAL_PRICE_KEY];
    const item = bucket?.[cacheKey];
    if (!item || typeof item !== 'object') return null;
    const date = Date.parse(item.date);
    const site = safeText(item.site, 100);
    const price = safeText(item.price, 48);
    if (!Number.isFinite(date) || date > now || now - date >= EXTERNAL_PRICE_TTL_MS || !site || !price) {
      const next = { ...bucket };
      delete next[cacheKey];
      await storage.set?.({ [EXTERNAL_PRICE_KEY]: next });
      return null;
    }
    return { site, price, date: new Date(date).toISOString(), expiresAt: date + EXTERNAL_PRICE_TTL_MS };
  }

  function noticeContainer(documentRef, isSearch) {
    if (isSearch) return documentRef.querySelector('#FilterToggle, .H1_PageTitle.page-header + section > div:first-child');
    return documentRef.querySelector('.H1_PageTitle.page-header + section > div:first-child, #tabs + .clearfix');
  }

  function renderExternalPriceNotice(documentRef, container, notice, minutesLeft = null) {
    if (!container || !notice || !documentRef?.createElement) return null;
    let banner = container.querySelector?.('.cmu-came-from');
    if (!banner) {
      const wrapper = documentRef.createElement('div');
      wrapper.className = 'cmu-site-from-container';
      banner = documentRef.createElement('h3');
      banner.className = 'cmu-came-from';
      wrapper.append(banner);
      container.append(wrapper);
    }
    const base = `Vous venez de ${notice.site}, où le prix était ${notice.price}`;
    banner.textContent = minutesLeft === null ? base : `${base} · expiration dans ${Math.max(1, minutesLeft)} min`;
    banner.setAttribute?.('role', 'status');
    return banner;
  }

  function installBuyerHelp(settings, {
    documentRef = root.document,
    pathname = root.location?.pathname || '',
    locationRef = root.location || {},
    storage = root.chrome?.storage?.local,
    now = Date.now,
    setTimeoutFn = root.setTimeout?.bind(root) || setTimeout,
  } = {}) {
    const settingsApi = root.CardmarketSettings;
    if (!settingsApi?.isFeatureEnabled?.(settings, 'showBuyerHelp') || !isProductPage(pathname) || !documentRef?.querySelectorAll) {
      return { marked: 0, scan: null, delayedScan: null, loadMore: null, noticePromise: Promise.resolve(null) };
    }

    const scan = () => markDisabledOfferRows(documentRef);
    const marked = scan();
    const delayedScan = setTimeoutFn(scan, 3000);
    const loadMoreButton = documentRef.querySelector?.('#loadMoreButton');
    let loadMore = null;
    if (loadMoreButton) {
      loadMore = () => setTimeoutFn(scan, 2000);
      loadMoreButton.addEventListener('click', loadMore);
    }
    const normalizedPath = String(pathname).toLowerCase();
    let noticePromise = Promise.resolve(null);
    if (normalizedPath.includes('/search') || normalizedPath.includes('/singles/')) {
      const isSearch = normalizedPath.includes('/search');
      const container = noticeContainer(documentRef, isSearch);
      if (container) {
        const cacheKey = buildExternalPriceCacheKey(locationRef.pathname || pathname, locationRef.search || '');
        const explicit = parseExternalPriceNotice(locationRef.hash || '', locationRef.search || '');
        noticePromise = (async () => {
          if (explicit) {
            await storeExternalPriceNotice(storage, cacheKey, explicit, now());
            return renderExternalPriceNotice(documentRef, container, explicit);
          }
          const cached = await readExternalPriceNotice(storage, cacheKey, now());
          if (!cached) return null;
          const minutesLeft = Math.ceil((cached.expiresAt - now()) / 60_000);
          return renderExternalPriceNotice(documentRef, container, cached, minutesLeft);
        })().catch(() => null);
      }
    }
    return { marked, scan, delayedScan, loadMore, noticePromise };
  }

  const api = {
    DISABLED_ACTION_SELECTOR, DISABLED_ROW_CLASS, EXTERNAL_PRICE_KEY, EXTERNAL_PRICE_TTL_MS,
    isProductPage, getDisabledOfferRows, markDisabledOfferRows, parseExternalPriceNotice,
    buildExternalPriceCacheKey, storeExternalPriceNotice, readExternalPriceNotice,
    renderExternalPriceNotice, installBuyerHelp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketBuyerHelp = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installBuyerHelp(settings))
      .catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
