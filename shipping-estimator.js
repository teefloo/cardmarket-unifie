(function (root) {
  const CACHE_NAME = 'shippingEstimates';
  const SELECTOR = 'div[id^="articleRow"], .article-table .article-row';

  function getOfferRows(documentRef = root.document) {
    if (!documentRef?.querySelectorAll) return [];
    return [...new Set(documentRef.querySelectorAll(SELECTOR))];
  }

  function getSellerCountryId(row) {
    const icons = [...(row?.querySelectorAll?.('span.icon') || [])];
    for (const icon of icons) {
      const image = String(icon.style?.backgroundImage || icon.getAttribute?.('style') || '');
      if (!/ssMain\.png/i.test(image)) continue;
      const position = icon.style?.backgroundPosition || image.match(/background-position\s*:\s*([^;]+)/i)?.[1];
      const countryId = root.CardmarketCore?.getShippingCountryFromBackgroundPosition(position);
      if (countryId !== null && countryId !== undefined) return countryId;
    }
    return null;
  }

  function getOfferPrice(row) {
    const node = row?.querySelector?.('.price-container')?.querySelector?.('span.fw-bold');
    return root.CardmarketCore?.parsePrice(node?.textContent || '') ?? null;
  }

  async function storageGet(storage, key) {
    if (!storage?.get) return {};
    return storage.get({ [key]: {} });
  }

  async function storageSet(storage, value) {
    if (!storage?.set) return;
    await storage.set(value);
  }

  async function requestShippingMethods({ fromCountry, toCountry, locale, storage = root.chrome?.storage?.local, sendMessage = (message) => root.chrome.runtime.sendMessage(message), now = Date.now }) {
    const core = root.CardmarketCore;
    const key = core?.shippingCacheKey(fromCountry, toCountry, locale);
    if (!key) throw new Error('Pays ou langue inconnus.');
    const currentTime = typeof now === 'function' ? now() : Number(now);
    const stored = await storageGet(storage, CACHE_NAME);
    const cache = stored?.[CACHE_NAME] && typeof stored[CACHE_NAME] === 'object' ? stored[CACHE_NAME] : {};
    const cached = cache[key];
    if (core.isShippingCacheFresh(cached, currentTime)) return cached.methods;

    const response = await sendMessage({
      type: 'shipping-estimate',
      fromCountry: Number(fromCountry),
      toCountry: Number(toCountry),
      locale: String(locale).toLowerCase(),
    });
    if (!response || response.error) throw new Error(response?.error || 'Devis d’envoi indisponible.');
    const methods = core.normalizeShippingMethods(response.data);
    if (methods.length) {
      cache[key] = { fetchedAt: currentTime, methods };
      await storageSet(storage, { [CACHE_NAME]: cache });
    }
    return methods;
  }

  function pageLocale(pathname = root.location?.pathname || '', documentRef = root.document) {
    const pathLocale = String(pathname).split('/').filter(Boolean)[0]?.toLowerCase();
    const htmlLocale = String(documentRef?.documentElement?.lang || '').toLowerCase().split(/[-_]/)[0];
    const candidate = root.CardmarketCore?.normalizeShippingLocale(pathLocale)
      ? pathLocale
      : root.CardmarketCore?.normalizeShippingLocale(htmlLocale)
        ? htmlLocale
        : null;
    return candidate || null;
  }

  function formatEuro(value) {
    return `${Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  function installShippingEstimator(settingsOrOptions, options = {}) {
    let settings = settingsOrOptions;
    if (settingsOrOptions?.settings && arguments.length === 1) {
      settings = settingsOrOptions.settings;
      options = settingsOrOptions;
    }
    const {
      documentRef = root.document,
      pathname = root.location?.pathname || '',
      storage = root.chrome?.storage?.local,
      sendMessage = (message) => root.chrome.runtime.sendMessage(message),
      MutationObserverClass = root.MutationObserver,
    } = options;
    const settingsApi = root.CardmarketSettings;
    if (!settingsApi || typeof settingsApi.isFeatureEnabled !== 'function'
      || !settingsApi.isFeatureEnabled(settings, 'showShippingEstimator')) return { buttons: [], observer: null };
    if (!settingsApi.isOfferLanguageProductPath(pathname) || !documentRef?.body) return { buttons: [], observer: null };

    const destination = root.CardmarketCore?.normalizeShippingCountryId(settings.shippingDestinationCountry);
    const locale = pageLocale(pathname, documentRef);
    const buttons = [];
    const scan = (scope = documentRef) => {
      const rows = [];
      if (scope?.matches?.(SELECTOR)) rows.push(scope);
      rows.push(...(scope?.querySelectorAll?.(SELECTOR) || []));
      for (const row of new Set(rows)) {
        const container = row.querySelector?.('.price-container');
        if (!container || container.querySelector?.('.cmu-shipping-estimate-button')) continue;

        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'cmu-button cmu-shipping-estimate-button';
        button.textContent = 'Estimer l’envoi';
        button.setAttribute('aria-label', 'Estimer les frais d’envoi');
        const status = documentRef.createElement('small');
        status.className = 'cmu-shipping-estimate-status';
        status.setAttribute('aria-live', 'polite');
        button.status = status;
        container.append(button);
        container.append(status);
        buttons.push(button);

        button.addEventListener('click', async () => {
          if (!destination || !locale) {
            status.textContent = 'Choisis un pays de destination dans les options.';
            return;
          }
          const origin = getSellerCountryId(row);
          if (!origin) {
            status.textContent = 'Pays vendeur inconnu; estimation indisponible.';
            return;
          }
          const offerPrice = getOfferPrice(row);
          if (offerPrice === null) {
            status.textContent = 'Prix de l’offre illisible; estimation indisponible.';
            return;
          }

          button.disabled = true;
          status.textContent = 'Calcul du devis…';
          try {
            const methods = await requestShippingMethods({ fromCountry: origin, toCountry: destination, locale, storage, sendMessage });
            const selected = root.CardmarketCore.selectShippingMethod(methods, offerPrice);
            status.textContent = selected
              ? `${selected.name} · +${formatEuro(selected.price)}`
              : 'Aucun mode adapté à ce montant.';
          } catch (error) {
            status.textContent = String(error?.message || 'Devis d’envoi indisponible.');
          } finally {
            button.disabled = false;
          }
        });
      }
    };

    scan();
    let observer = null;
    if (MutationObserverClass && documentRef.body) {
      observer = new MutationObserverClass((records) => {
        for (const record of records) {
          for (const node of record.addedNodes || []) scan(node);
        }
      });
      observer.observe(documentRef.body, { subtree: true, childList: true });
    }
    return { buttons, observer };
  }

  const api = { getOfferRows, getSellerCountryId, getOfferPrice, requestShippingMethods, pageLocale, installShippingEstimator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketShippingEstimator = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installShippingEstimator(settings))
      .catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
