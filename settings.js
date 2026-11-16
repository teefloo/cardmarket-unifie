(function (root) {
  const OFFER_LANGUAGES = Object.freeze([
    { code: '', label: 'Toutes les langues', id: null },
    { code: 'en', label: 'Anglais (EN)', id: 1 },
    { code: 'fr', label: 'Français (FR)', id: 2 },
    { code: 'de', label: 'Allemand (DE)', id: 3 },
    { code: 'es', label: 'Espagnol (ES)', id: 4 },
    { code: 'it', label: 'Italien (IT)', id: 5 },
    { code: 'zh', label: 'Chinois (CN)', id: 6 },
    { code: 'ja', label: 'Japonais (JP)', id: 7 },
    { code: 'pt', label: 'Portugais (PT)', id: 8 },
    { code: 'ru', label: 'Russe (RU)', id: 9 },
    { code: 'ko', label: 'Coréen (KR)', id: 10 },
    { code: 'tw', label: 'Chinois traditionnel (TW)', id: 11 },
    { code: 'nl', label: 'Néerlandais (NL)', id: 12 },
    { code: 'pl', label: 'Polonais (PL)', id: 13 },
    { code: 'cs', label: 'Tchèque (CZ)', id: 14 },
    { code: 'hu', label: 'Hongrois (HU)', id: 15 },
  ]);
  const OFFER_LANGUAGE_IDS = Object.freeze(Object.fromEntries(OFFER_LANGUAGES.map(({ code, id }) => [code, id])));
  const FEATURE_FLAGS = Object.freeze(['showConditionPrices', 'showHistoricalChart']);
  const DEFAULTS = Object.freeze({
    enabled: true,
    preferredLanguage: '',
    showConditionPrices: true,
    showHistoricalChart: true,
  });

  const LEGACY_SETTING_KEYS = Object.freeze([
    'offerLanguage', 'offerLanguages', 'favoriteGames', 'showFloatingPanel', 'showCartSummary', 'showMatrasChart',
    'showPriceHelper', 'showPriceDeviation', 'quickFilter', 'showGameSwitcher', 'showCardPreviews',
    'rememberWantsList', 'showRecentOrderLinks', 'hideMagicArtSummary', 'showShippingEstimator',
    'shippingDestinationCountry', 'showPurchaseHistory', 'showDuplicateWarnings', 'hideSocial',
    'showOrderChecklist', 'showTableCopy', 'showSessionTotal', 'applySignature', 'showCommentTemplates',
    'multipleAttachments', 'showMessagePreviews', 'searchAllWants', 'showWantAlarmActions',
    'showBulkWantActions', 'forceSpoilerImageLoad', 'hideSpoilerAccessories',
    'trackPriceTrendShoppingPages', 'showBuyerHelp', 'hideSupportTickets', 'highlightTerms',
    'showOfferAttributes', 'showPokeMasterBallIndicators', 'showPromos', 'forceGridView',
    'showGridColumns', 'copyShipmentDetails', 'printOrders', 'showBlocklistShortcut',
    'showPartnerLinks', 'reportPrices', 'searchExtendedOrders', 'showTrackingCodePrompt',
    'highlightAuthor', 'priceMode', 'priceShortcuts', 'proPriceReductionType', 'chartRange', 'chartTab', 'chartOff',
    'proPriceReductionValue', 'adjustmentType', 'adjustmentValue', 'floor', 'bulkPricePercent',
    'shipping', 'shippingDestinationCountry', 'theme', 'signature', 'commentTemplates',
    'sessionCount', 'sessionValue', 'lastMaveReport',
  ]);

  function getOfferLanguageId(language) {
    return Object.prototype.hasOwnProperty.call(OFFER_LANGUAGE_IDS, language) ? OFFER_LANGUAGE_IDS[language] : null;
  }

  function normalizeOfferLanguage(language) {
    return typeof language === 'string' && getOfferLanguageId(language) !== null ? language : '';
  }

  function normalizeOfferLanguages(languages) {
    if (!Array.isArray(languages)) return [];
    return [...new Set(languages.filter((language) => getOfferLanguageId(language) !== null && language !== ''))]
      .sort((left, right) => getOfferLanguageId(left) - getOfferLanguageId(right));
  }

  function normalizeNativeLanguageCsv(values) {
    return (Array.isArray(values) ? values : [values])
      .flatMap((value) => String(value ?? '').split(','))
      .map((value) => value.trim())
      .filter((value) => /^(?:[1-9]|1[0-5])$/.test(value))
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort((left, right) => Number(left) - Number(right))
      .join(',');
  }

  function getPathSegments(pathname) {
    try {
      return new URL(pathname, 'https://www.cardmarket.com').pathname.split('/').filter(Boolean).map((segment) => {
        try { return decodeURIComponent(segment); }
        catch { return segment; }
      });
    } catch { return []; }
  }

  function getPokemonProductsIndex(segments) {
    const normalized = segments.map((segment) => segment.toLowerCase());
    const pokemonIndex = normalized[0] === 'pokemon'
      ? 0
      : /^[a-z]{2}$/.test(normalized[0] || '') && normalized[1] === 'pokemon' ? 1 : -1;
    return pokemonIndex >= 0 && normalized[pokemonIndex + 1] === 'products' ? pokemonIndex + 1 : -1;
  }

  function isPokemonPath(pathname) {
    return getPokemonProductsIndex(getPathSegments(pathname)) >= 0;
  }

  function isOfferLanguageProductPath(pathname) {
    const segments = getPathSegments(pathname).map((segment) => segment.toLowerCase());
    const productsIndex = getPokemonProductsIndex(segments);
    if (productsIndex < 0 || segments.length < productsIndex + 3) return false;
    const productType = segments[productsIndex + 1];
    const detailSegments = segments.slice(productsIndex + 2);
    if (!productType || ['search', 'results', 'index', 'all', 'wants'].includes(productType)) return false;
    if (productType === 'singles') return detailSegments.length >= 2;
    return detailSegments.length >= 1 && !['search', 'results', 'index', 'all'].includes(detailSegments.at(-1));
  }

  function buildOfferLanguageUrl(currentUrl, language, previousOverride = null) {
    let url;
    try { url = new URL(currentUrl, 'https://www.cardmarket.com'); }
    catch { return null; }
    if (!isOfferLanguageProductPath(url.pathname)) return null;
    if (previousOverride?.manual === true) return null;

    const currentLanguages = url.searchParams.getAll('language');
    const appliedValue = previousOverride?.languageId ?? previousOverride?.languageIds;
    if (!language) {
      if (!appliedValue || currentLanguages.length !== 1 || currentLanguages[0] !== String(appliedValue)) return null;
      url.searchParams.delete('language');
      const previousCsv = normalizeNativeLanguageCsv(previousOverride.previousLanguages);
      if (previousCsv) url.searchParams.set('language', previousCsv);
      return url.toString();
    }

    const id = getOfferLanguageId(language);
    if (id === null) return null;
    if (currentLanguages.length === 1 && currentLanguages[0] === String(id)) return null;
    url.searchParams.set('language', String(id));
    return url.toString();
  }

  function migrateSettings(stored = {}) {
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const currentLanguageIsValid = typeof source.preferredLanguage === 'string'
      && (source.preferredLanguage === '' || getOfferLanguageId(source.preferredLanguage) !== null);
    let preferredLanguage = currentLanguageIsValid ? normalizeOfferLanguage(source.preferredLanguage) : '';
    if (!currentLanguageIsValid) {
      const legacyLanguages = normalizeOfferLanguages(source.offerLanguages);
      preferredLanguage = legacyLanguages[0] || normalizeOfferLanguage(source.offerLanguage);
    }
    const settings = {
      ...DEFAULTS,
      enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULTS.enabled,
      preferredLanguage,
      showConditionPrices: typeof source.showConditionPrices === 'boolean' ? source.showConditionPrices : DEFAULTS.showConditionPrices,
      showHistoricalChart: typeof source.showHistoricalChart === 'boolean'
        ? source.showHistoricalChart
        : typeof source.showMatrasChart === 'boolean' ? source.showMatrasChart : DEFAULTS.showHistoricalChart,
    };
    return settings;
  }

  async function loadSettings(storage) {
    const stored = await storage.get(null);
    const settings = migrateSettings(stored);
    const additions = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (!Object.prototype.hasOwnProperty.call(stored, key) || JSON.stringify(settings[key]) !== JSON.stringify(stored[key])) additions[key] = settings[key];
    }
    if (Object.keys(additions).length) await storage.set(additions);
    const oldKeys = LEGACY_SETTING_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(stored, key));
    if (oldKeys.length && typeof storage.remove === 'function') await storage.remove(oldKeys);
    return settings;
  }

  function isFeatureEnabled(settings, key) {
    return typeof key === 'string' && settings?.enabled !== false && settings?.[key] === true;
  }

  const api = {
    DEFAULTS,
    FEATURE_FLAGS,
    OFFER_LANGUAGES,
    getOfferLanguageId,
    normalizeOfferLanguage,
    normalizeOfferLanguages,
    normalizeNativeLanguageCsv,
    isPokemonPath,
    isOfferLanguageProductPath,
    buildOfferLanguageUrl,
    migrateSettings,
    loadSettings,
    isFeatureEnabled,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
