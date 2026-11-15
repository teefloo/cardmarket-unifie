(function (root) {
  const OFFER_LANGUAGES = Object.freeze([
    { code: 'all', label: 'Toutes les langues', id: null },
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

  const FEATURE_FLAGS = Object.freeze([
    'showFloatingPanel', 'showCartSummary', 'showPriceHelper', 'showPriceDeviation', 'showConditionPrices', 'showMatrasChart', 'quickFilter',
    'showGameSwitcher', 'showCardPreviews', 'rememberWantsList', 'showRecentOrderLinks', 'hideMagicArtSummary', 'showShippingEstimator',
    'showPurchaseHistory', 'showDuplicateWarnings', 'hideSocial', 'showOrderChecklist', 'showTableCopy',
    'showSessionTotal', 'applySignature', 'showCommentTemplates', 'multipleAttachments', 'showMessagePreviews',
    'searchAllWants', 'showWantAlarmActions', 'showBulkWantActions',
    'forceSpoilerImageLoad', 'hideSpoilerAccessories', 'trackPriceTrendShoppingPages', 'showBuyerHelp',
    'hideSupportTickets', 'highlightTerms', 'showOfferAttributes', 'showPokeMasterBallIndicators', 'showPromos', 'forceGridView', 'showGridColumns',
    'copyShipmentDetails', 'printOrders', 'showBlocklistShortcut', 'showPartnerLinks', 'reportPrices', 'searchExtendedOrders', 'showTrackingCodePrompt', 'highlightAuthor',
  ]);

  const DEFAULTS = Object.freeze({
    enabled: true,
    priceMode: 'lowest',
    priceShortcuts: [],
    proPriceReductionType: 'amount',
    proPriceReductionValue: 0,
    adjustmentType: 'fixed',
    adjustmentValue: 0,
    floor: 0,
    bulkPricePercent: 0,
    shipping: true,
    shippingDestinationCountry: '',
    theme: 'system',
    signature: '',
    commentTemplates: [],
    favoriteGames: ['Magic', 'Pokemon', 'OnePiece'],
    chartRange: '30d',
    chartTab: 'price',
    chartOff: [],
    offerLanguages: [],
    showFloatingPanel: true,
    showCartSummary: false,
    showPriceHelper: true,
    showPriceDeviation: true,
    showConditionPrices: true,
    showMatrasChart: true,
    quickFilter: true,
    showGameSwitcher: true,
    showCardPreviews: true,
    rememberWantsList: true,
    showRecentOrderLinks: true,
    hideMagicArtSummary: false,
    showShippingEstimator: false,
    showPurchaseHistory: true,
    showDuplicateWarnings: true,
    hideSocial: true,
    showOrderChecklist: true,
    showTableCopy: true,
    showSessionTotal: true,
    applySignature: true,
    showCommentTemplates: true,
    multipleAttachments: true,
    showMessagePreviews: true,
    searchAllWants: true,
    showWantAlarmActions: true,
    showBulkWantActions: true,
    forceSpoilerImageLoad: true,
    hideSpoilerAccessories: true,
    trackPriceTrendShoppingPages: false,
    showBuyerHelp: true,
    hideSupportTickets: true,
    highlightTerms: true,
    showOfferAttributes: true,
    showPokeMasterBallIndicators: true,
    searchExtendedOrders: true,
    showTrackingCodePrompt: true,
    showPromos: true,
    forceGridView: false,
    showGridColumns: true,
    copyShipmentDetails: true,
    printOrders: false,
    showBlocklistShortcut: true,
    showPartnerLinks: true,
    reportPrices: false,
    highlightAuthor: false,
  });

  const PRICE_MODES = new Set(['lowest', 'avg', 'trend1', 'trend7', 'trend30', 'pro', 'from', 'min']);
  const PRICE_SHORTCUT_MODES = ['lowest', 'avg', 'trend1', 'trend7', 'trend30', 'from', 'min'];
  const GAMES = new Set(['Magic', 'YuGiOh', 'Pokemon', 'OnePiece', 'Lorcana', 'Riftbound']);
  const SHIPPING_COUNTRY_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 35, 36, 37]);

  function getOfferLanguageId(language) {
    return Object.prototype.hasOwnProperty.call(OFFER_LANGUAGE_IDS, language) ? OFFER_LANGUAGE_IDS[language] : null;
  }

  function normalizeOfferLanguages(languages) {
    if (!Array.isArray(languages)) return [];
    return [...new Set(languages.filter((language) => getOfferLanguageId(language) !== null))]
      .sort((left, right) => getOfferLanguageId(left) - getOfferLanguageId(right));
  }

  function normalizeNativeLanguageCsv(values) {
    const ids = (Array.isArray(values) ? values : [values])
      .flatMap((value) => String(value ?? '').split(','))
      .map((value) => value.trim())
      .filter((value) => /^(?:[1-9]|1[0-5])$/.test(value));
    return [...new Set(ids)].sort((left, right) => Number(left) - Number(right)).join(',');
  }

  function isOfferLanguageProductPath(pathname) {
    let path;
    try { path = new URL(pathname, 'https://www.cardmarket.com').pathname; }
    catch { return false; }
    const segments = path.split('/').filter(Boolean).map((segment) => {
      try { return decodeURIComponent(segment).toLowerCase(); }
      catch { return segment.toLowerCase(); }
    });
    const productsIndex = segments.indexOf('products');
    if (productsIndex < 2 || productsIndex >= segments.length - 1) return false;

    const productType = segments[productsIndex + 1];
    const productPathSegments = segments.slice(productsIndex + 1);
    if (!productType || ['search', 'results', 'wants'].includes(productType)) return false;
    if (productType === 'singles') return productPathSegments.length >= 3;
    return productPathSegments.length >= 2
      && !['search', 'results', 'index', 'all'].includes(productPathSegments.at(-1));
  }

  function buildOfferLanguageUrl(currentUrl, languages, previousOverride = null) {
    let url;
    try { url = new URL(currentUrl, 'https://www.cardmarket.com'); }
    catch { return null; }
    if (!isOfferLanguageProductPath(url.pathname)) return null;
    if (previousOverride?.manual === true) return null;

    const selection = normalizeOfferLanguages(languages);
    if (!selection.length) {
      if (!previousOverride || typeof previousOverride !== 'object' || Array.isArray(previousOverride)) return null;
      const appliedCsv = previousOverride.languageIds ?? previousOverride.languageId;
      const currentLanguages = url.searchParams.getAll('language');
      if (!appliedCsv || currentLanguages.length !== 1 || currentLanguages[0] !== String(appliedCsv)) return null;
      url.searchParams.delete('language');
      const previousCsv = normalizeNativeLanguageCsv(previousOverride.previousLanguages);
      if (previousCsv) url.searchParams.set('language', previousCsv);
      return url.toString();
    }

    const csv = selection.map(getOfferLanguageId).join(',');
    const currentLanguages = url.searchParams.getAll('language');
    if (currentLanguages.length === 1 && currentLanguages[0] === csv) return null;
    url.searchParams.set('language', csv);
    return url.toString();
  }

  function migrateSettings(stored = {}) {
    const result = { ...DEFAULTS, ...stored };
    for (const key of FEATURE_FLAGS) {
      if (typeof stored[key] !== 'boolean') result[key] = DEFAULTS[key];
    }
    for (const key of ['enabled', 'shipping']) {
      if (typeof stored[key] !== 'boolean') result[key] = DEFAULTS[key];
    }
    const shippingDestinationCountry = Number(result.shippingDestinationCountry);
    result.shippingDestinationCountry = Number.isSafeInteger(shippingDestinationCountry) && SHIPPING_COUNTRY_IDS.has(shippingDestinationCountry)
      ? String(shippingDestinationCountry)
      : '';
    if (!PRICE_MODES.has(result.priceMode)) result.priceMode = DEFAULTS.priceMode;
    if (!['amount', 'percentage'].includes(result.proPriceReductionType)) result.proPriceReductionType = DEFAULTS.proPriceReductionType;
    if (!Number.isFinite(Number(result.proPriceReductionValue)) || Number(result.proPriceReductionValue) < 0) {
      result.proPriceReductionValue = DEFAULTS.proPriceReductionValue;
    } else result.proPriceReductionValue = Number(result.proPriceReductionValue);
    result.priceShortcuts = [...new Set((Array.isArray(result.priceShortcuts) ? result.priceShortcuts : [])
      .filter((mode) => PRICE_SHORTCUT_MODES.includes(mode)))];
    result.priceShortcuts = PRICE_SHORTCUT_MODES.filter((mode) => result.priceShortcuts.includes(mode));
    if (!['fixed', 'percentage'].includes(result.adjustmentType)) result.adjustmentType = DEFAULTS.adjustmentType;
    if (!['system', 'light', 'dark'].includes(result.theme)) result.theme = DEFAULTS.theme;
    if (Array.isArray(stored.offerLanguages)) result.offerLanguages = normalizeOfferLanguages(stored.offerLanguages);
    else if (typeof stored.offerLanguage === 'string' && getOfferLanguageId(stored.offerLanguage) !== null) result.offerLanguages = [stored.offerLanguage];
    else result.offerLanguages = [];
    delete result.offerLanguage;
    if (!Number.isFinite(Number(result.adjustmentValue))) result.adjustmentValue = DEFAULTS.adjustmentValue;
    if (!Number.isFinite(Number(result.floor)) || Number(result.floor) < 0) result.floor = DEFAULTS.floor;
    if (!Number.isFinite(Number(result.bulkPricePercent)) || Number(result.bulkPricePercent) < -100) result.bulkPricePercent = DEFAULTS.bulkPricePercent;
    else result.bulkPricePercent = Number(result.bulkPricePercent);
    if (typeof result.signature !== 'string') result.signature = DEFAULTS.signature;
    if (!Array.isArray(result.commentTemplates)) result.commentTemplates = [];
    if (!Array.isArray(result.favoriteGames)) result.favoriteGames = [...DEFAULTS.favoriteGames];
    else result.favoriteGames = result.favoriteGames.filter((game) => GAMES.has(game));
    if (!Array.isArray(result.chartOff)) result.chartOff = [];
    return result;
  }

  async function loadSettings(storage) {
    const stored = await storage.get(null);
    const settings = migrateSettings(stored);
    const additions = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (!Object.prototype.hasOwnProperty.call(stored, key) || settings[key] !== stored[key]) additions[key] = settings[key];
    }
    if (Object.keys(additions).length) await storage.set(additions);
    if (Object.prototype.hasOwnProperty.call(stored, 'offerLanguage') && typeof storage.remove === 'function') {
      await storage.remove('offerLanguage');
    }
    return settings;
  }

  function isFeatureEnabled(settings, key) {
    if (!FEATURE_FLAGS.includes(key)) return false;
    const current = migrateSettings(settings);
    return current.enabled && current[key];
  }

  const api = { DEFAULTS, FEATURE_FLAGS, OFFER_LANGUAGES, getOfferLanguageId, normalizeOfferLanguages, normalizeNativeLanguageCsv, isOfferLanguageProductPath, buildOfferLanguageUrl, migrateSettings, loadSettings, isFeatureEnabled };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
