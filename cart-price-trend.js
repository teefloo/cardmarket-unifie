(function (root) {
  const STORAGE_KEY = 'shoppingPriceTrend';
  const TREND_LABELS = new Set([
    'price trend', 'preis-trend', 'tendance des prix', 'tendencia de precio', 'tendenza di prezzo',
  ]);
  const PAGE_TARGETS = Object.freeze([
    { path: /\/ShoppingCart\/?$/i, price: '.price', links: 'tr[data-article-id] td.name a[href]' },
    { path: /\/Wants\/(?!ShoppingWizard\/Results)/i, price: '.buyPrice', links: 'tr[role="row"] td.name a[href]' },
    { path: /\/Wants\/ShoppingWizard\/Results\//i, price: '.text-end', links: '.card-body td.card-name' },
  ]);

  function getPriceTrendItemKey(pathname) {
    let path;
    try { path = new URL(pathname, 'https://www.cardmarket.com').pathname; }
    catch { return null; }
    const segments = path.split('/').filter(Boolean);
    const productIndex = segments.findIndex((part) => part.toLowerCase() === 'products');
    if (productIndex < 2 || productIndex >= segments.length - 1) return null;
    const productPath = segments.slice(productIndex + 1);
    if (productPath[0].toLowerCase() === 'search' || productPath[0].toLowerCase() === 'results') return null;
    return productPath.join('/');
  }

  function cleanText(html) {
    return String(html || '')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&euro;/gi, '€')
      .replace(/&pound;/gi, '£')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function defaultParsePrice(text) {
    let normalized = String(text || '').replace(/\s/g, '').replace(/[€£]/g, '').replace(/[^\d.,]/g, '');
    const comma = normalized.lastIndexOf(',');
    const dot = normalized.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      normalized = comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
    } else if (comma >= 0) {
      const commaCount = (normalized.match(/,/g) || []).length;
      normalized = commaCount > 1 || normalized.length - comma - 1 === 3
        ? normalized.replace(/,/g, '')
        : normalized.replace(',', '.');
    } else if (dot >= 0) {
      const dotCount = (normalized.match(/\./g) || []).length;
      normalized = dotCount > 1 || normalized.length - dot - 1 === 3
        ? normalized.replace(/\./g, '')
        : normalized;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function extractPriceTrendFromHtml(html, parsePrice = defaultParsePrice) {
    if (typeof html !== 'string' || typeof parsePrice !== 'function') return null;
    const cells = [...html.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
      .map((match) => ({ tag: match[1].toLowerCase(), text: cleanText(match[2]) }));
    for (let index = 0; index < cells.length; index++) {
      if (cells[index].tag !== 'dt' || !TREND_LABELS.has(cells[index].text.toLocaleLowerCase())) continue;
      const value = cells.slice(index + 1).find((cell) => cell.tag === 'dd')?.text;
      if (!value || parsePrice(value) === null) return null;
      return value;
    }
    return null;
  }

  function getFreshPriceTrend(itemName, saved, now = new Date()) {
    const entry = saved && typeof saved === 'object' ? saved[itemName] : null;
    if (!entry || typeof entry.price !== 'string' || !entry.price.trim() || entry.price.length > 40 || defaultParsePrice(entry.price) === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) return null;
    const date = new Date(`${entry.date}T00:00:00Z`);
    const current = now instanceof Date ? now : new Date(now);
    const age = +current - +date;
    if (!Number.isFinite(+date) || !Number.isFinite(+current) || age < 0 || age > 48 * 60 * 60 * 1000) return null;
    return { price: entry.price.trim(), date: entry.date };
  }

  function pruneExpiredPriceTrends(saved, now = new Date()) {
    const output = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
    let removed = 0;
    for (const key of Object.keys(output)) {
      if (!getFreshPriceTrend(key, output, now)) {
        delete output[key];
        removed++;
      }
    }
    return { snapshots: output, removed };
  }

  async function readSnapshot(storage) {
    if (!storage?.get) return {};
    try {
      const result = await storage.get(STORAGE_KEY);
      const value = result?.[STORAGE_KEY];
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }

  async function writeSnapshot(storage, snapshots) {
    if (!storage?.set) return false;
    try { await storage.set({ [STORAGE_KEY]: snapshots }); return true; }
    catch { return false; }
  }

  function getSafeProductUrl(href, origin) {
    try {
      const url = new URL(href, origin);
      const base = new URL(origin);
      if (url.origin !== base.origin || !/^https?:$/.test(url.protocol) || !getPriceTrendItemKey(url.pathname)) return null;
      return url;
    } catch { return null; }
  }

  function normalizeItemText(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 -]/g, '')
      .trim().toLowerCase().replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-');
  }

  function findSnapshotKeyFromText(element, snapshots = {}) {
    const names = [];
    const tooltip = element?.nextElementSibling?.querySelector?.('span')?.getAttribute?.('data-bs-original-title');
    if (tooltip) names.push(tooltip);
    if (element?.textContent) names.push(element.textContent);
    const suffixes = names.map(normalizeItemText).filter(Boolean);
    if (!suffixes.length) return null;
    return Object.keys(snapshots).find((key) => {
      const normalizedKey = normalizeItemText(key);
      return suffixes.some((suffix) => normalizedKey.endsWith(suffix));
    }) || null;
  }

  function getCurrentTrend(documentRef, parsePrice) {
    const items = [...(documentRef?.querySelectorAll?.('.info-list-container dt, .info-list-container dd') || [])];
    for (let index = 0; index < items.length; index++) {
      if (!TREND_LABELS.has(String(items[index]?.textContent || '').trim().toLocaleLowerCase())) continue;
      const value = items.slice(index + 1).find((item) => item?.tagName?.toLowerCase() === 'dd');
      const price = String(value?.textContent || '').trim();
      return price && parsePrice(price) !== null ? price : null;
    }
    return null;
  }

  function addProductSubmitTracking(settings, {
    documentRef, pathname, storage, now = () => new Date(), parsePrice = root.CardmarketCore?.parsePrice || defaultParsePrice,
  }) {
    const itemName = getPriceTrendItemKey(pathname);
    if (!itemName) return 0;
    const priceTrend = getCurrentTrend(documentRef, parsePrice);
    if (!priceTrend) return 0;
    let count = 0;
    for (const form of documentRef.querySelectorAll('.actions-container form')) {
      if (form.hasAttribute?.('data-cmu-track-price-trend')) continue;
      form.setAttribute?.('data-cmu-track-price-trend', 'true');
      form.addEventListener('submit', () => {
        return (async () => {
          const snapshots = await readSnapshot(storage);
          const date = now();
          snapshots[itemName] = {
            price: priceTrend,
            date: (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10),
          };
          await writeSnapshot(storage, snapshots);
        })();
      });
      count++;
    }
    return count;
  }

  async function addPageTrends(settings, {
    documentRef, target, snapshots, storage, origin, now, fetchImpl, parsePrice, createElement,
  }) {
    let rows = 0;
    let buttons = 0;
    const anchors = [...(documentRef.querySelectorAll(target.links) || [])];
    for (const anchor of anchors) {
      const row = anchor.closest?.('tr');
      const priceElement = row?.querySelector?.(target.price);
      if (!row || !priceElement || priceElement.querySelector?.('.cmu-price-trend')) continue;
      const safeUrl = getSafeProductUrl(anchor.getAttribute?.('href') || '', origin);
      const itemName = safeUrl ? getPriceTrendItemKey(safeUrl.pathname) : findSnapshotKeyFromText(anchor, snapshots);
      if (!itemName) continue;
      const tag = createElement('span');
      tag.className = 'cmu-price-trend';
      const stored = getFreshPriceTrend(itemName, snapshots, now);
      if (stored) {
        tag.textContent = `Tendance : ${stored.price}`;
        tag.setAttribute('aria-label', `Tendance des prix enregistrée le ${stored.date} : ${stored.price}`);
      } else {
        if (!safeUrl) continue;
        tag.type = 'button';
        tag.setAttribute('role', 'button');
        tag.setAttribute('tabindex', '0');
        tag.textContent = 'Charger la tendance';
        const load = async () => {
          if (tag.disabled) return;
          if (!safeUrl) return;
          tag.disabled = true;
          tag.textContent = 'Lecture…';
          try {
            const response = await fetchImpl(safeUrl.href, { method: 'GET', credentials: 'same-origin' });
            if (!response?.ok) throw new Error('http');
            const price = extractPriceTrendFromHtml(await response.text(), parsePrice);
            if (!price) throw new Error('missing');
            const date = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
            snapshots[itemName] = { price, date };
            await writeSnapshot(storage, snapshots);
            tag.textContent = `Tendance : ${price}`;
            tag.setAttribute('aria-label', `Tendance des prix enregistrée le ${date} : ${price}`);
            tag.classList?.add('cmu-price-trend-cached');
          } catch {
            tag.textContent = 'Tendance indisponible';
            tag.setAttribute('aria-label', 'Lecture de tendance indisponible');
          } finally {
            tag.disabled = true;
          }
        };
        tag.addEventListener('click', load);
        tag.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void load(); }
        });
        buttons++;
      }
      priceElement.prepend(tag);
      rows++;
    }
    return { rows, buttons };
  }

  async function installCartPriceTrend(settings, {
    documentRef = root.document,
    pathname = root.location?.pathname || '',
    origin = root.location?.origin || '',
    storage = root.chrome?.storage?.local,
    fetchImpl = root.fetch?.bind(root),
    now = new Date(),
    parsePrice = root.CardmarketCore?.parsePrice || defaultParsePrice,
  } = {}) {
    const settingsApi = root.CardmarketSettings;
    if (!settingsApi?.isFeatureEnabled?.(settings, 'trackPriceTrendShoppingPages') || !documentRef?.querySelectorAll) {
      return { submitForms: 0, rows: 0, buttons: 0 };
    }
    const storedSnapshots = await readSnapshot(storage);
    const { snapshots, removed: expiredCount } = pruneExpiredPriceTrends(storedSnapshots, now);
    if (expiredCount) await writeSnapshot(storage, snapshots);
    const submitForms = /\/Products\//i.test(pathname)
      ? addProductSubmitTracking(settings, { documentRef, pathname, storage, now: () => now, parsePrice })
      : 0;
    const target = PAGE_TARGETS.find(({ path }) => path.test(pathname));
    if (!target) return { submitForms, rows: 0, buttons: 0 };
    const result = await addPageTrends(settings, {
      documentRef, target, snapshots, storage, origin, now, fetchImpl, parsePrice,
      createElement: (tag) => documentRef.createElement(tag),
    });
    return { submitForms, ...result };
  }

  const api = { STORAGE_KEY, TREND_LABELS, PAGE_TARGETS, getPriceTrendItemKey, extractPriceTrendFromHtml, getFreshPriceTrend, pruneExpiredPriceTrends, getSafeProductUrl, normalizeItemText, findSnapshotKeyFromText, addProductSubmitTracking, installCartPriceTrend };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketCartPriceTrend = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installCartPriceTrend(settings))
      .catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
