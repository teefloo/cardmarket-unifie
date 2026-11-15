(() => {
  let settings;
  const offerLanguageOverridesKey = 'cmu-offer-language-overrides';
  const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const featureEnabled = (name) => CardmarketSettings.isFeatureEnabled(settings, name);

  function hasNativeOfferLanguageFilter() {
    return Boolean(document.querySelector(
      '#articleFilterProductLanguage .form-check input, #articleFilterProductLanguage input[type="checkbox"], #articleFilterProductLanguage [role="checkbox"], #FilterOffersFormWrapper select[name="idLanguage"], .form-floating #IdLanguage',
    ));
  }

  function applyOfferLanguage() {
    if (!CardmarketSettings.isOfferLanguageProductPath(location.pathname)) return false;
    if (settings.offerLanguages.length && !hasNativeOfferLanguageFilter()) return false;
    let overrides = {};
    try {
      const saved = sessionStorage.getItem(offerLanguageOverridesKey);
      overrides = saved ? JSON.parse(saved) : {};
      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {};
    } catch { overrides = {}; }
    const path = location.pathname;
    const previousOverride = overrides[path] ?? null;
    const currentLanguages = new URL(location.href).searchParams.getAll('language');
    const target = CardmarketSettings.buildOfferLanguageUrl(location.href, settings.offerLanguages, previousOverride);

    if (!settings.offerLanguages.length) delete overrides[path];
    else {
      const desiredCsv = settings.offerLanguages.map(CardmarketSettings.getOfferLanguageId).join(',');
      if (desiredCsv && target) {
        const previousAppliedCsv = previousOverride?.languageIds ?? previousOverride?.languageId;
        const currentWasExtensionOverride = Boolean(previousAppliedCsv)
          && currentLanguages.length === 1
          && currentLanguages[0] === String(previousAppliedCsv);
        const appliedCsv = new URL(target).searchParams.get('language') || desiredCsv;
        overrides[path] = {
          languageIds: appliedCsv,
          previousLanguages: currentWasExtensionOverride && Array.isArray(previousOverride.previousLanguages)
            ? previousOverride.previousLanguages
            : currentLanguages,
        };
      }
    }
    try {
      const recent = Object.entries(overrides).slice(-50);
      sessionStorage.setItem(offerLanguageOverridesKey, JSON.stringify(Object.fromEntries(recent)));
    } catch { /* The query preference still applies even when session storage is unavailable. */ }

    if (!target) return false;
    location.replace(target);
    return true;
  }

  function trackManualOfferLanguageChanges() {
    if (!CardmarketSettings.isOfferLanguageProductPath(location.pathname)) return;
    const preserveCurrentPathManualChoice = () => {
      try {
        const overrides = JSON.parse(sessionStorage.getItem(offerLanguageOverridesKey) || '{}');
        if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return;
        overrides[location.pathname] = { manual: true };
        const recent = Object.entries(overrides).slice(-50);
        sessionStorage.setItem(offerLanguageOverridesKey, JSON.stringify(Object.fromEntries(recent)));
      } catch { /* Manual Cardmarket filtering remains usable without session storage. */ }
    };
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('select[name*="language" i], input[name*="language" i]')) preserveCurrentPathManualChoice();
    }, true);
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('a[href*="language="], [data-language]')) preserveCurrentPathManualChoice();
    }, true);
  }

  function money(value) {
    return `${value.toFixed(2).replace('.', ',')} €`;
  }

  function productDetails() {
    const product = CardmarketCore.parseProductPath(location.pathname);
    if (!/\/Products\/Singles\//i.test(location.pathname)) return null;
    const slug = location.pathname.split('/').filter(Boolean).at(-1) || '';
    const identity = CardmarketCore.parseCardmarketIdentity(
      location.pathname,
      [...document.querySelectorAll('[data-modal*="idProduct="]')].map((element) => element.getAttribute('data-modal')),
      [...document.querySelectorAll('img[src*="product-images.s3.cardmarket.com"]')].map((image) => image.getAttribute('src') || image.src),
    );
    if (!product && !identity) return null;
    return {
      ...product,
      game: identity?.game ?? product?.game,
      id: product?.id ?? identity?.collectorNumber,
      productId: identity?.productId,
      key: identity?.key || slug,
      title: document.querySelector('h1')?.textContent.trim() || slug,
    };
  }

  function addGameNavigation() {
    const current = location.pathname.split('/').filter(Boolean);
    if (current.length < 2) return;
    const nav = document.createElement('nav');
    nav.className = 'cmu-games';
    const anchor = document.querySelector('h1');
    settings.favoriteGames.forEach((game) => {
      const link = document.createElement('a');
      link.href = `/${current[0]}/${game}${current.slice(2).length ? `/${current.slice(2).join('/')}` : ''}`;
      link.textContent = game;
      nav.append(link);
    });
    anchor?.insertAdjacentElement('afterend', nav);
  }

  function visiblePrices() {
    return [...document.querySelectorAll('.article-row [class*="price"], .price-container, .info-list .price')]
      .filter((element) => element.getClientRects().length)
      .map((element) => CardmarketCore.parsePrice(element.textContent))
      .filter((price) => price !== null && price < 100000);
  }

  function professionalVisiblePrices() {
    return [...document.querySelectorAll('[id^="articleRow"]')].flatMap((row) => {
      const isProfessional = row.querySelector('.col-seller .fonticon-users-professional')
        || row.querySelector('.col-seller .fonticon-users-powerseller');
      if (!isProfessional) return [];
      const price = CardmarketCore.parsePrice(row.querySelector('.price-container')?.textContent);
      return price === null ? [] : [price];
    });
  }

  function chartFallbackPrice(days = '7') {
    try {
      const config = pageChartConfig();
      const series = config?.data?.datasets?.find((dataset) => new RegExp(`avg\\s*${days}`).test(String(dataset.label).toLowerCase()));
      const value = [...(series?.data || [])].reverse().find((point) => Number.isFinite(Number(point)) && Number(point) > 0);
      return value === undefined ? null : Number(value);
    } catch { return null; }
  }

  function suggestedPrice(product, priceMode = settings.priceMode) {
    const prices = visiblePrices();
    if (priceMode === 'pro') {
      return CardmarketCore.calculateProfessionalPrice(
        professionalVisiblePrices(),
        prices,
        prices.length ? null : chartFallbackPrice('7'),
        settings,
      );
    }
    if (priceMode === 'min') return CardmarketCore.calculatePrice(0.02, settings);
    if (priceMode === 'from') {
      const items = [...document.querySelectorAll('.info-list-container dt, .info-list-container dd')];
      const fromLabels = new Set(['from', 'ab', 'de', 'desde', 'da']);
      const fromIndex = items.findIndex((item) => fromLabels.has(item.textContent.trim().toLowerCase()));
      const labeledPrice = fromIndex < 0 ? null : CardmarketCore.parsePrice(items[fromIndex + 1]?.textContent);
      const fromPrice = labeledPrice ?? prices[0] ?? null;
      return fromPrice === null ? null : CardmarketCore.calculatePrice(fromPrice, settings);
    }
    if (!prices.length) return null;
    if (priceMode.startsWith('trend')) {
      try {
        const config = pageChartConfig();
        const days = priceMode.match(/\d+/)?.[0] || '';
        const series = config?.data?.datasets?.find((dataset) => new RegExp(`avg\\s*${days}`).test(String(dataset.label).toLowerCase()));
        const guidePrice = [...(series?.data || [])].reverse().find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
        if (guidePrice) return CardmarketCore.calculatePrice(Number(guidePrice), settings);
      } catch { /* Utilise les prix d'offres visibles si le graphique natif n'est pas lisible. */ }
    }
    let price = prices.sort((left, right) => left - right)[0];
    if (priceMode === 'avg') price = prices.reduce((sum, current) => sum + current, 0) / prices.length;
    return CardmarketCore.calculatePrice(price, settings);
  }

  function priceModeName(mode) {
    return ({ lowest: 'première offre', avg: 'moyenne', trend1: 'tendance 1 j', trend7: 'tendance 7 j', trend30: 'tendance 30 j', pro: 'vendeur professionnel', from: 'prix From', min: 'prix minimum' })[mode] || mode;
  }

  function pageChartConfig() {
    const script = document.querySelector('.chart-wrapper script, .chart-container script');
    const source = script?.textContent || '';
    const call = source.slice(source.indexOf('new Chart'));
    if (!call) return null;
    const config = call.slice(call.indexOf(',') + 1).replace(');', '').replace(/(function ?\(.*?\) ?\{.*?})/g, 'false');
    return JSON.parse(config);
  }

  function addPriceDeviationWarning(product) {
    if (!featureEnabled('showPriceDeviation') || !product) return null;
    if (document.querySelector('.cmu-price-deviation')) return null;
    try {
      const config = pageChartConfig();
      const labels = config?.data?.labels;
      const values = config?.data?.datasets?.[0]?.data;
      if (!Array.isArray(labels) || !Array.isArray(values)) return null;
      const points = labels.map((label, index) => {
        const parts = String(label).split('.');
        const date = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(label);
        return [date, values[index]];
      });
      const infoItems = [...document.querySelectorAll('.info-list-container dt, .info-list-container dd')];
      const fromLabels = new Set(['from', 'ab', 'de', 'desde', 'da']);
      const fromIndex = infoItems.findIndex((item) => fromLabels.has(item.textContent.trim().toLowerCase()));
      if (fromIndex < 0) return null;
      const currentPrice = CardmarketCore.parsePrice(infoItems[fromIndex + 1]?.textContent);
      const comparison = CardmarketCore.calculatePriceDeviation(currentPrice, points);
      if (!comparison?.warning) return null;
      const infoList = document.querySelector('.info-list-container');
      if (!infoList) return null;

      const warning = document.createElement('aside');
      warning.className = 'cmu-price-deviation';
      warning.setAttribute('role', 'status');
      warning.textContent = `Prix « De » élevé : ${money(comparison.currentPrice)} dépasse de ${Math.round(comparison.percentageHigher)} % la moyenne des ${comparison.count} derniers relevés (${money(comparison.averagePrice)}).`;
      infoList.insertAdjacentElement('afterend', warning);
      return warning;
    } catch { return null; }
  }

  function addPriceTool(product, targetForm = null) {
    if (!/\/Products\//i.test(location.pathname)) return;
    const form = targetForm || document.querySelector('form[action*="PostGetAction"]:has(input[name*="price" i]), form#articleForm, form#ListProductForm');
    if (!form || form.querySelector('.cmu-price-tool')) return;
    const priceInput = form.querySelector('input[name*="price" i], input[id*="price" i]');
    if (!priceInput) return;

    const controls = document.createElement('div');
    controls.className = 'cmu-price-controls';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cmu-button cmu-price-tool';
    button.textContent = 'Calculer un prix';
    controls.append(button);

    const quantityInput = form.querySelector('input[name*="amount" i], input[id*="amount" i], input[name*="quantity" i], input[id*="quantity" i]');
    let lastCalculatedUnitPrice = null;
    let lotPreview = null;
    if (quantityInput) {
      lotPreview = document.createElement('output');
      lotPreview.className = 'cmu-lot-preview';
      lotPreview.textContent = 'Total indicatif du lot · calcule un prix pour voir le total';
      controls.append(lotPreview);
    }
    const updateLotPreview = () => {
      if (!lotPreview || lastCalculatedUnitPrice === null) return;
      const quantity = Number(quantityInput.value);
      const bulkPercent = Number(settings.bulkPricePercent) || 0;
      const total = CardmarketCore.calculateBulkLotTotal(lastCalculatedUnitPrice, quantity, bulkPercent, settings.floor);
      lotPreview.textContent = total === null
        ? 'Total indicatif du lot · quantité invalide'
        : `Total indicatif du lot · ${quantity}${bulkPercent === 0 ? '' : ` · ${bulkPercent < 0 ? 'remise' : 'ajustement'} ${bulkPercent < 0 ? '−' : '+'}${Math.abs(bulkPercent).toString().replace('.', ',')} %`} · ${money(total)}`;
    };
    quantityInput?.addEventListener('input', updateLotPreview);
    quantityInput?.addEventListener('change', updateLotPreview);

    const applyMode = async (mode, trigger) => {
      const price = suggestedPrice(product, mode);
      if (price === null) {
        trigger.textContent = mode === 'pro' ? 'Mode professionnel indisponible' : 'Aucun prix visible';
        return;
      }
      priceInput.value = price.toFixed(2);
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
      trigger.textContent = `${money(price)} · ${trigger === button && !['pro', 'from', 'min'].includes(mode) ? mode : priceModeName(mode)}`;
      lastCalculatedUnitPrice = price;
      updateLotPreview();
      await CardmarketCore.recordSessionCalculation(
        chrome.storage.local,
        price,
        document.querySelectorAll('.cmu-session'),
      );
    };
    button.addEventListener('click', () => applyMode(settings.priceMode, button));
    document.addEventListener('cmu-price-mode-change', (event) => {
      const mode = event.detail?.mode;
      if (!['lowest', 'avg', 'trend1', 'trend7', 'trend30', 'pro', 'from', 'min'].includes(mode)) return;
      applyMode(mode, button);
    });

    const shortcutModes = CardmarketCore.normalizePriceShortcuts(settings.priceShortcuts);
    if (shortcutModes.length) {
      const shortcuts = document.createElement('div');
      shortcuts.className = 'cmu-price-shortcut-list';
      for (const mode of shortcutModes) {
        const shortcut = document.createElement('button');
        shortcut.type = 'button';
        shortcut.className = 'cmu-button cmu-price-shortcut';
        shortcut.dataset.priceMode = mode;
        shortcut.textContent = ({ lowest: 'Première offre', avg: 'Moyenne visible', trend1: 'Tendance 1 j', trend7: 'Tendance 7 j', trend30: 'Tendance 30 j', from: 'From', min: 'Min' })[mode];
        shortcut.addEventListener('click', () => applyMode(mode, shortcut));
        shortcuts.append(shortcut);
      }
      controls.append(shortcuts);
    }
    priceInput.insertAdjacentElement('afterend', controls);
  }

  function installSellerPriceHelpers(product) {
    if (!featureEnabled('showPriceHelper') || !/\/Products\//i.test(location.pathname)) return;
    const context = product || { title: document.querySelector('h1')?.textContent.trim() || '', game: location.pathname.split('/')[2] || '' };
    const listingForm = document.querySelector('form#ListProductForm');
    if (listingForm) addPriceTool(context, listingForm);
    else addPriceTool(context);
    document.addEventListener('click', (event) => {
      const trigger = event.target?.closest?.('a[data-modal*="Article_EditArticleModal"]');
      if (!CardmarketPageTools.isSellerOfferEditLink(trigger)) return;
      const attach = () => {
        const forms = [...document.querySelectorAll('form[id^="Edit"]')];
        let attached = false;
        for (const form of forms) {
          const before = form.querySelector('.cmu-price-tool');
          if (!before) {
            addPriceTool(context, form);
            attached ||= Boolean(form.querySelector('.cmu-price-tool'));
          }
        }
        return attached;
      };
      if (attach() || typeof MutationObserver !== 'function' || !document.body) return;
      let timeout;
      const observer = new MutationObserver(() => {
        if (attach()) {
          observer.disconnect();
          clearTimeout(timeout);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = setTimeout(() => observer.disconnect(), 6000);
    }, true);
  }

  function addTableFilter() {
    if (!featureEnabled('quickFilter') || !/Offers|Products|Wants/.test(location.pathname)) return;
    const table = document.querySelector('table tbody');
    const articleTable = document.querySelector('.article-table');
    const filterHost = table?.closest('table') || articleTable;
    if (!filterHost || document.querySelector('.cmu-filter')) return;
    const getRows = () => CardmarketCore.collectQuickFilterRows(
      table?.querySelectorAll(':scope > tr') || [],
      articleTable?.querySelectorAll('.article-row') || [],
    );
    const wrapper = document.createElement('div');
    wrapper.className = 'cmu-filter';
    wrapper.append(document.createTextNode('Filtrer '));
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Carte, extension ou vendeur';
    wrapper.append(input);
    const language = document.createElement('select');
    language.setAttribute('aria-label', 'Langue');
    language.innerHTML = '<option value="">Toutes les langues</option><option>English</option><option>Japanese</option><option>French</option><option>German</option><option>Italian</option><option>Spanish</option>';
    wrapper.append(language);
    const condition = document.createElement('select');
    condition.setAttribute('aria-label', 'État');
    condition.innerHTML = '<option value="">Tous les états</option><option>Mint</option><option>Near Mint</option><option>Excellent</option><option>Good</option><option>Light Played</option><option>Played</option><option>Poor</option>';
    wrapper.append(condition);
    const countryControls = [...document.querySelectorAll('#articleFilterSellerLocation .form-check')]
      .filter((control) => !control.classList?.contains('hidden-country'))
      .map((control) => ({
        input: control.querySelector('input'),
        label: control.querySelector('.form-check-label'),
      }))
      .filter(({ input, label }) => input && label && CardmarketCore.normalizeSellerCountryIds([input.value]).length);
    let countrySelect = null;
    if (countryControls.length) {
      const countryLabel = document.createElement('span');
      countryLabel.className = 'cmu-filter-country-label';
      countryLabel.textContent = 'Pays vendeur';
      wrapper.append(countryLabel);
      countrySelect = document.createElement('select');
      countrySelect.multiple = true;
      countrySelect.size = Math.min(4, countryControls.length);
      countrySelect.setAttribute('aria-label', 'Pays vendeur');
      countrySelect.title = 'Sélection multiple; applique les pays avec le bouton dédié';
      const selectedCountries = CardmarketCore.normalizeSellerCountryIds(new URL(location.href).searchParams.get('sellerCountry') || '');
      const selectedSet = new Set(selectedCountries);
      for (const { input, label } of countryControls) {
        const id = CardmarketCore.normalizeSellerCountryIds([input.value])[0];
        const option = document.createElement('option');
        option.value = id;
        option.textContent = label.textContent.trim() || `Pays ${id}`;
        option.selected = selectedSet.has(id);
        countrySelect.append(option);
      }
      wrapper.append(countrySelect);
      const applyCountries = document.createElement('button');
      applyCountries.type = 'button';
      applyCountries.className = 'cmu-button cmu-country-apply';
      applyCountries.textContent = 'Appliquer pays';
      applyCountries.setAttribute('aria-label', 'Appliquer le filtre des pays vendeurs');
      wrapper.append(applyCountries);
      const resetCountries = document.createElement('button');
      resetCountries.type = 'button';
      resetCountries.className = 'cmu-button cmu-country-reset';
      resetCountries.textContent = 'Tous les pays';
      resetCountries.setAttribute('aria-label', 'Afficher les offres de tous les pays');
      wrapper.append(resetCountries);
      const navigateToCountries = (countries) => {
        const target = CardmarketCore.buildSellerCountryUrl(location.href, countries);
        if (target && target !== location.href) location.replace(target);
      };
      applyCountries.addEventListener('click', () => {
        const countries = [...countrySelect.options].filter((option) => option.selected).map((option) => option.value);
        navigateToCountries(countries);
      });
      resetCountries.addEventListener('click', () => navigateToCountries([]));
    }
    filterHost.insertAdjacentElement('beforebegin', wrapper);
    const filterStateKey = `cmu-quick-filters:${location.pathname}`;
    const saveFilterState = () => {
      try {
        sessionStorage.setItem(filterStateKey, JSON.stringify({ query: input.value, language: language.value, condition: condition.value }));
      } catch { /* Les filtres restent utilisables sans sessionStorage. */ }
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem(filterStateKey) || 'null');
      if (saved && typeof saved === 'object') {
        input.value = String(saved.query || '');
        language.value = String(saved.language || '');
        condition.value = String(saved.condition || '');
      }
    } catch { /* Ignore un état de filtre de session mal formé. */ }
    const filterRows = () => {
      const filters = { query: input.value, language: language.value, condition: condition.value };
      for (const row of getRows()) {
        const rowData = CardmarketCore.collectQuickFilterRowData(row);
        row.classList.toggle('cmu-filter-hidden', !CardmarketCore.matchesQuickFilters(rowData.text, {
          ...filters,
          conditionMetadata: rowData.conditionMetadata,
        }));
      }
    };
    input.addEventListener('input', () => { saveFilterState(); filterRows(); });
    language.addEventListener('change', () => { saveFilterState(); filterRows(); });
    condition.addEventListener('change', () => { saveFilterState(); filterRows(); });
    filterRows();
  }

  function addMessageSignature() {
    if (!featureEnabled('applySignature') || !settings.signature.trim()) return;
    for (const form of document.querySelectorAll('form')) {
      const message = form.querySelector('textarea[name*="message" i], textarea[name*="body" i]');
      if (!message || message.dataset.cmuSignature) continue;
      message.dataset.cmuSignature = 'true';
      form.addEventListener('submit', () => {
        const signature = `\n\n${settings.signature}`;
        if (!message.value.endsWith(signature)) message.value += signature;
      });
    }
  }

  function addMultipleAttachments() {
    if (!featureEnabled('multipleAttachments') || !/Account\/Messages/.test(location.pathname)) return;
    document.querySelectorAll('input[type="file"]').forEach((input) => input.setAttribute('multiple', ''));
  }

  function addMessagePreviews() {
    if (!featureEnabled('showMessagePreviews') || !/\/messages?(?:\/|$)/i.test(location.pathname)) return;
    for (const link of document.querySelectorAll('.message-body a[href], #MessageContainer a[href]')) {
      if (link.dataset.cmuMessagePreview) continue;
      let target;
      try { target = new URL(link.href || link.getAttribute('href') || '', location.origin); }
      catch { continue; }
      if (target.origin !== location.origin || !CardmarketSettings.isOfferLanguageProductPath(target.pathname)) continue;
      link.dataset.cmuMessagePreview = 'true';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cmu-button cmu-message-preview-button';
      button.textContent = 'Afficher aperçu';
      button.setAttribute('aria-label', `Afficher un aperçu de ${link.textContent.trim() || 'ce produit Cardmarket'}`);
      link.insertAdjacentElement('afterend', button);
      button.addEventListener('click', async () => {
        const existing = button.nextElementSibling?.classList?.contains('cmu-message-preview') ? button.nextElementSibling : null;
        if (existing) { existing.hidden = !existing.hidden; return; }
        button.disabled = true;
        button.textContent = 'Chargement…';
        try {
          const response = await fetch(target.href, { credentials: 'same-origin' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const productPage = new DOMParser().parseFromString(await response.text(), 'text/html');
          const pageTitle = productPage.querySelector('h1')?.textContent?.trim() || link.textContent.trim() || target.pathname.split('/').at(-1);
          const source = productPage.querySelector('#productImage img, .product-image img')?.getAttribute('src');
          const preview = document.createElement('aside');
          preview.className = 'cmu-message-preview';
          const title = document.createElement('strong');
          title.textContent = pageTitle;
          const productLink = document.createElement('a');
          productLink.href = target.href;
          productLink.target = '_blank';
          productLink.rel = 'noopener noreferrer';
          productLink.textContent = 'Ouvrir la fiche Cardmarket';
          preview.append(title);
          if (CardmarketPageTools.isCardProductImageUrl(source, location.origin)) {
            const image = document.createElement('img');
            image.src = new URL(source, location.origin).href;
            image.alt = `Image de ${pageTitle}`;
            image.loading = 'lazy';
            preview.append(image);
          }
          preview.append(productLink);
          button.insertAdjacentElement('afterend', preview);
          button.textContent = 'Masquer aperçu';
        } catch {
          button.textContent = 'Aperçu indisponible';
        } finally { button.disabled = false; }
      });
    }
  }

  function addCommentTemplates() {
    if (!featureEnabled('showCommentTemplates') || !settings.commentTemplates.length) return;
    for (const form of document.querySelectorAll('form')) {
      const textarea = form.querySelector('textarea[name*="comment" i]');
      if (!textarea || form.querySelector('.cmu-comments')) continue;
      const shortcuts = document.createElement('div');
      shortcuts.className = 'cmu-comments';
      settings.commentTemplates.forEach((template) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = template.slice(0, 32);
        button.title = template;
        button.addEventListener('click', () => {
          textarea.value = template;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        shortcuts.append(button);
      });
      textarea.insertAdjacentElement('beforebegin', shortcuts);
    }
  }

  function addCardImageButtons() {
    if (!featureEnabled('showCardPreviews')) return;
    if (!/Offers|Products|Wants|ShoppingWizard|Orders/.test(location.pathname)) return;
    const rowLinks = [...document.querySelectorAll('a[href*="/Products/Singles/"]')];
    rowLinks.forEach((link) => {
      const row = CardmarketPageTools.findCardPreviewRow(link, { origin: location.origin });
      if (!row || row.querySelector('.cmu-image-button')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cmu-button cmu-image-button';
      button.textContent = 'Image';
      button.addEventListener('click', async () => {
        const existing = row.querySelector('.cmu-card-image');
        if (existing) { existing.hidden = !existing.hidden; return; }
        const url = new URL(link.href, location.origin);
        if (url.origin !== location.origin) return;
        button.disabled = true;
        try {
          const response = await fetch(url.href, { credentials: 'same-origin' });
          const page = new DOMParser().parseFromString(await response.text(), 'text/html');
          const cardImage = page.querySelector('#productImage img, .product-image img');
          const socialImage = page.querySelector('meta[property="og:image"]')?.content;
          const source = cardImage?.getAttribute('src') || socialImage;
          if (!CardmarketPageTools.isCardProductImageUrl(source, location.origin)) { button.textContent = 'Image indisponible'; return; }
          const image = document.createElement('img');
          image.className = 'cmu-card-image';
          image.src = new URL(source, location.origin).href;
          image.alt = link.textContent.trim() || 'Carte Cardmarket';
          image.loading = 'lazy';
          row.append(image);
        } catch { button.textContent = 'Image indisponible'; }
        finally { button.disabled = false; }
      });
      row.append(button);
    });
  }

  function addWantsPreference() {
    if (!featureEnabled('rememberWantsList') || !/Wants/.test(location.pathname)) return;
    const selects = document.querySelectorAll('select[name*="want" i], select[id*="want" i]');
    const game = String(productDetails()?.game || location.pathname.split('/')[2] || 'default');
    const key = `last-wants-list-${game}`;
    chrome.storage.local.get({ [key]: '' }).then((stored) => {
      selects.forEach((select) => {
        if (stored[key] && [...select.options].some((option) => option.value === stored[key])) select.value = stored[key];
        select.addEventListener('change', () => chrome.storage.local.set({ [key]: select.value }));
      });
    });
  }

  async function addPurchaseHistory(product) {
    if (featureEnabled('showPurchaseHistory') && /\/Orders\//.test(location.pathname)) {
      const scan = document.createElement('button');
      scan.className = 'cmu-button';
      scan.type = 'button';
      scan.textContent = 'Enregistrer cette page dans mon historique d’achats';
      document.querySelector('h1')?.insertAdjacentElement('afterend', scan);
      scan.addEventListener('click', async () => {
        const existing = (await chrome.storage.local.get({ purchaseHistory: [] })).purchaseHistory;
        const additions = [...document.querySelectorAll('a[href*="/Products/Singles/"]')]
          .map((link) => {
            const item = CardmarketCore.parseProductPath(new URL(link.href).pathname);
            const row = link.closest?.('[data-product-id]');
            const productId = row?.dataset?.productId || link.dataset?.productId || '';
            return item ? { item, productId: /^\d+$/.test(String(productId)) ? String(productId) : '' } : null;
          })
          .filter(Boolean)
          .map(({ item, productId }) => ({ key: `${item.game}:${item.id}`, ...(productId ? { productId } : {}), purchasedAt: Date.now() }));
        const merged = [...new Map([...existing, ...additions].map((item) => [item.key, item])).values()];
        await chrome.storage.local.set({ purchaseHistory: merged });
        scan.textContent = `${additions.length} carte(s) enregistrée(s)`;
      });
    }
    if (!featureEnabled('showDuplicateWarnings')) return;
    const { purchaseHistory = [] } = await chrome.storage.local.get({ purchaseHistory: [] });
    if (/\/ShoppingCart(?:\/|$)/i.test(location.pathname)) {
      CardmarketDuplicateWarnings.renderCartDuplicateWarnings({ documentRef: document, history: Array.isArray(purchaseHistory) ? purchaseHistory : [], now: Date.now(), days: 90 });
      return;
    }
    if (!product) return;
    const safeHistory = Array.isArray(purchaseHistory) ? purchaseHistory : [];
    const key = `${product.game}:${product.id}`;
    const now = Date.now();
    const recentPurchases = safeHistory.filter((item) => item.key === key && Number(item.purchasedAt) >= now - 90 * 86400000 && Number(item.purchasedAt) <= now);
    let cartProducts = {};
    if (/^\d+$/.test(String(product.productId || ''))) {
      cartProducts = await CardmarketDuplicateWarnings.readCartProducts({
        documentRef: document,
        storage: chrome.storage.local,
        fetcher: fetch,
        DOMParserClass: DOMParser,
        origin: location.origin,
        pathname: location.pathname,
      });
    }
    CardmarketDuplicateWarnings.renderDuplicateWarning({
      documentRef: document,
      productId: product.productId,
      recentPurchaseCount: recentPurchases.length,
      cartProducts,
      cartUrl: CardmarketDuplicateWarnings.shoppingCartUrl(location.origin, location.pathname),
    });
  }

  function addSocialHide() {
    CardmarketPageTools.removeShariffWidgets(document, location.pathname, featureEnabled('hideSocial'));
  }

  async function copyVisibleRows(button) {
    const rows = [...document.querySelectorAll('table tbody tr:not([hidden])')];
    const text = CardmarketCore.joinVisibleRows(rows.map((row) => row.innerText));
    if (!text) { button.textContent = 'Aucune ligne visible'; return; }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-10000px';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) { button.textContent = 'Copie indisponible'; return; }
    }
    button.textContent = 'Liste copiée';
  }

  function addStandaloneTableCopyButton() {
    if (!featureEnabled('showTableCopy') || document.querySelector('.cmu-toolbox .cmu-copy')) return;
    const table = document.querySelector('table tbody');
    if (!table || document.querySelector('.cmu-standalone-copy')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cmu-button cmu-standalone-copy';
    button.textContent = 'Copier les lignes visibles';
    button.addEventListener('click', (event) => copyVisibleRows(event.currentTarget));
    table.closest('table').insertAdjacentElement('beforebegin', button);
  }

  function addStandaloneSessionTotal() {
    if (!featureEnabled('showSessionTotal') || document.querySelector('.cmu-toolbox .cmu-session')) return;
    const total = document.createElement('p');
    total.className = 'cmu-session cmu-standalone-session';
    document.querySelector('h1')?.insertAdjacentElement('afterend', total);
    chrome.storage.local.get({ sessionCount: 0, sessionValue: 0 }).then((session) => {
      CardmarketCore.renderSessionTotal(document.querySelectorAll('.cmu-session'), session);
    });
  }

  function addOrderChecklist() {
    if (!featureEnabled('showOrderChecklist') || !/Orders/.test(location.pathname)) return;
    const orderId = location.pathname.split('/').filter(Boolean).at(-1);
    const key = `order-checks-${orderId}`;
    chrome.storage.local.get({ [key]: [] }).then((saved) => {
      const rows = [...document.querySelectorAll('table tbody tr, .article-row')];
      const rowIds = rows.map((row, index) => `${index}-${row.textContent.trim().slice(0, 90)}`);
      const currentRowIds = new Set(rowIds);
      const savedRowIds = Array.isArray(saved[key]) ? saved[key] : [];
      const picked = new Set(savedRowIds.filter((id) => currentRowIds.has(id)));
      rows.forEach((row, index) => {
        if (row.querySelector('.cmu-picked')) return;
        const id = rowIds[index];
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'cmu-picked';
        checkbox.checked = picked.has(id);
        checkbox.setAttribute('aria-label', 'Carte préparée');
        if (row.tagName === 'TR') {
          const cell = document.createElement('td');
          cell.append(checkbox);
          row.prepend(cell);
        } else row.prepend(checkbox);
        row.classList.toggle('cmu-row-picked', checkbox.checked);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) picked.add(id);
          else picked.delete(id);
          row.classList.toggle('cmu-row-picked', checkbox.checked);
          chrome.storage.local.set({ [key]: [...picked] });
        });
      });
      if (rows.length) {
        const status = document.createElement('p');
        status.className = 'cmu-checklist-status';
        const grouped = document.createElement('small');
        grouped.className = 'cmu-checklist-groups';
        const update = () => {
          status.textContent = `Préparation · ${picked.size} / ${rows.length} lignes`;
          const groups = CardmarketPageTools.groupOrderProgress(rows.map((row) => ({
            expansion: CardmarketPageTools.getExpansionFromSinglesPath(row.querySelector('a[href*="/Products/Singles/"]')?.href),
            checked: Boolean(row.querySelector('.cmu-picked')?.checked),
          })));
          grouped.textContent = groups.map((group) => `${group.expansion} ${group.checked}/${group.total}`).join(' · ');
          grouped.hidden = !groups.length;
        };
        update();
        document.querySelector('h1')?.insertAdjacentElement('afterend', status);
        status.insertAdjacentElement('afterend', grouped);
        document.addEventListener('change', (event) => { if (event.target.matches('.cmu-picked')) update(); });
      }
    });
  }

  async function requestService(url) {
    return chrome.runtime.sendMessage({ type: 'service-request', url });
  }

  async function reportPublicPrices(product) {
    if (!product || !featureEnabled('reportPrices')) return;
    const script = document.querySelector('.chart-wrapper script, .chart-container script');
    if (!script?.textContent) return;
    try {
      const parsed = pageChartConfig();
      const labels = parsed.data?.labels?.map((label) => {
        const parts = String(label).split('.');
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(label);
      });
      const points = CardmarketCore.sanitizeChartData({ labels, values: parsed.data?.datasets?.[0]?.data });
      if (!points.length) return;
      const report = CardmarketCore.buildMavePayload(location.pathname, { labels, values: parsed.data?.datasets?.[0]?.data });
      if (!report) return;
      const result = await chrome.runtime.sendMessage({
        type: 'service-request', method: 'POST', url: 'https://api-cardmarket.mave.me/chart',
        cardKey: report.cardKey, payload: report.payload, headers: report.headers,
      });
      if (!result?.error) chrome.storage.local.set({ lastMaveReport: Date.now() });
    } catch { /* Graphique manquant ou mal formé, aucune donnée envoyée. */ }
  }

  function chartValueText(value, series) {
    const exact = String(value).replace('.', ',');
    return series === 'price' ? `${exact} €` : exact;
  }

  function chartDateText(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  }

  function drawChart(canvas, points, tooltip, seriesName) {
    const normalized = points.map((_, index) => CardmarketCore.getChartPointAt(points, index)).filter(Boolean);
    if (!CardmarketCore.hasRenderableChartSeries(normalized)) return false;
    const context = canvas.getContext('2d');
    const width = canvas.width = Math.max(560, canvas.clientWidth * 2);
    const height = canvas.height = 240;
    const padX = 20, padY = 30;
    const values = normalized.map((point) => point.value);
    const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
    const state = { normalized, width, height, padX, padY, low, high, span, seriesName };

    const pointPosition = (index) => ({
      x: padX + index * (width - padX * 2) / (normalized.length - 1),
      y: height - padY - (normalized[index].value - low) * (height - padY * 2) / span,
    });
    const paint = (hoveredIndex = -1) => {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = '#0d6efd';
      context.lineWidth = 3;
      context.beginPath();
      normalized.forEach((_, index) => {
        const { x, y } = pointPosition(index);
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.stroke();
      context.fillStyle = '#212529';
      context.font = '16px system-ui';
      context.fillText(`${chartValueText(low, seriesName)} – ${chartValueText(high, seriesName)}`, padX, 21);
      if (hoveredIndex >= 0) {
        const { x, y } = pointPosition(hoveredIndex);
        context.strokeStyle = '#6c757d';
        context.lineWidth = 1;
        context.setLineDash([5, 5]);
        context.beginPath();
        context.moveTo(x, padY);
        context.lineTo(x, height - padY);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = '#0d6efd';
        context.beginPath();
        context.arc(x, y, 6, 0, Math.PI * 2);
        context.fill();
      }
    };
    state.paint = paint;
    canvas._cmuChartState = state;
    paint();

    if (tooltip && canvas.dataset.cmuTooltipBound !== 'true') {
      canvas.dataset.cmuTooltipBound = 'true';
      canvas.addEventListener('pointermove', (event) => {
        const chart = canvas._cmuChartState;
        const rect = canvas.getBoundingClientRect();
        if (!chart || !rect.width) return;
        const pointerX = (event.clientX - rect.left) * chart.width / rect.width;
        const progress = Math.max(0, Math.min(1, (pointerX - chart.padX) / (chart.width - chart.padX * 2)));
        const index = Math.round(progress * (chart.normalized.length - 1));
        const point = CardmarketCore.getChartPointAt(chart.normalized, index);
        if (!point) return;
        chart.paint(index);
        tooltip.textContent = `${chartDateText(point.date)} · ${chart.seriesName === 'price' ? 'Prix' : chart.seriesName === 'availability' ? 'Disponibilité' : 'Ventes estimées'} : ${chartValueText(point.value, chart.seriesName)}`;
        tooltip.hidden = false;
        const wrapper = canvas.parentElement;
        const cursor = (event.clientX - rect.left) / rect.width * canvas.clientWidth;
        tooltip.style.left = `${Math.max(8, Math.min(wrapper.clientWidth - 8, cursor))}px`;
        tooltip.style.transform = cursor > wrapper.clientWidth * 0.72 ? 'translateX(-100%)' : 'translateX(-50%)';
      });
      canvas.addEventListener('pointerleave', () => {
        tooltip.hidden = true;
        const chart = canvas._cmuChartState;
        if (chart) chart.paint();
      });
    }
    return true;
  }

  async function addHistoricalChart(product) {
    if (!/\/Products\/Singles\//i.test(location.pathname)) return;
    const native = document.querySelector('.chart-container, .chart-wrapper');
    const failure = CardmarketCore.getMatrasFailure({
      enabled: featureEnabled('showMatrasChart'),
      nativeFound: Boolean(native),
      productIdFound: Number.isSafeInteger(product?.productId) && product.productId > 0,
    });
    if (failure) {
      showMatrasStatus(native, failure, product);
      return;
    }
    if (document.querySelector('.cmu-chart')) return;
    const url = `https://charts.matrastcg.de/api/v1/verlauf?spiel=${product.game}&id=${product.productId}&key=${encodeURIComponent(product.key)}`;
    let result;
    try {
      result = await requestService(url);
    } catch (error) {
      const reason = CardmarketCore.getMatrasFailure({ error: error?.message || 'Échec réseau' });
      showMatrasStatus(native, reason, product, error?.message);
      return;
    }
    if (!result || result.error) {
      const reason = CardmarketCore.getMatrasFailure({ error: result?.error || 'Réponse Matras absente' });
      showMatrasStatus(native, reason, product, result?.error);
      return;
    }
    const points = Array.isArray(result.data?.preise) ? result.data.preise : [];
    if (!CardmarketCore.filterChartSeries(points, 'max').length) {
      showMatrasStatus(native, CardmarketCore.getMatrasFailure({ hasData: false }), product);
      return;
    }

    const panel = document.createElement('section');
    panel.className = 'cmu-chart';
    panel.innerHTML = '<header class="cmu-chart-header"><strong>Historique Matras</strong><div class="cmu-chart-controls"><fieldset class="cmu-chart-group"><legend>Période</legend><div class="cmu-chart-ranges"><button class="cmu-button" type="button" data-range="30d">30 jours</button><button class="cmu-button" type="button" data-range="90d">90 jours</button><button class="cmu-button" type="button" data-range="1y">1 an</button><button class="cmu-button" type="button" data-range="max">Max</button></div></fieldset><fieldset class="cmu-chart-group"><legend>Série</legend><div class="cmu-chart-tabs"><button class="cmu-button" type="button" data-series="price">Prix</button><button class="cmu-button" type="button" data-series="availability">Disponibilité</button><button class="cmu-button" type="button" data-series="sales">Ventes estimées</button></div></fieldset><div class="cmu-chart-native"><span>Cardmarket</span><button class="cmu-button" type="button" data-native>Graphique natif</button></div></div></header><div class="cmu-chart-meta"><output class="cmu-chart-period" aria-live="polite"></output><output class="cmu-chart-averages" aria-label="Moyennes de prix Matras sur fenêtres calendaires" aria-live="polite"></output></div><div class="cmu-chart-plot"><canvas aria-label="Historique des prix" role="img" tabindex="0"></canvas><output class="cmu-chart-tooltip" hidden aria-live="polite"></output></div><p class="cmu-chart-empty" hidden></p>';
    native.insertAdjacentElement('afterend', panel);
    const canvas = panel.querySelector('canvas');
    const periodOutput = panel.querySelector('.cmu-chart-period');
    const averageOutput = panel.querySelector('.cmu-chart-averages');
    const tooltip = panel.querySelector('.cmu-chart-tooltip');
    const emptyMessage = panel.querySelector('.cmu-chart-empty');
    const averages = CardmarketCore.calculateChartPriceAverages(points);
    averageOutput.textContent = CardmarketCore.formatChartPriceAverages(averages);
    let selectedSeries = 'price';
    let selectedRange = '30d';
    const setActiveControl = (selector, key, value) => {
      panel.querySelectorAll(selector).forEach((button) => {
        const active = button.dataset[key] === value;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
      });
    };
    const showRange = (range) => {
      const series = selectedSeries === 'price' ? points : result.data?.[selectedSeries === 'availability' ? 'verfuegbar' : 'verkaufstage'] || [];
      const filtered = CardmarketCore.filterChartSeries(series, range);
      const bounds = CardmarketCore.getChartDateBounds(filtered);
      periodOutput.textContent = bounds
        ? `Période affichée : ${chartDateText(bounds.start)}${bounds.start === bounds.end ? '' : ` – ${chartDateText(bounds.end)}`}`
        : 'Aucune date disponible pour cette période';
      tooltip.hidden = true;
      emptyMessage.hidden = true;
      if (!drawChart(canvas, filtered, tooltip, selectedSeries)) {
        CardmarketCore.resetChartSurface(canvas, tooltip);
        emptyMessage.textContent = 'Pas assez de données dans cette période. Le graphique Cardmarket reste affiché.';
        emptyMessage.hidden = false;
        native.hidden = false;
        panel.hidden = false;
        return false;
      }
      canvas.hidden = false;
      canvas.setAttribute('aria-label', `Historique Matras · ${selectedSeries === 'price' ? 'prix' : selectedSeries === 'availability' ? 'disponibilité' : 'ventes estimées'} · ${periodOutput.textContent}`);
      native.hidden = true;
      panel.hidden = false;
      return true;
    };
    panel.querySelectorAll('[data-range]').forEach((button) => button.addEventListener('click', () => {
      selectedRange = button.dataset.range;
      setActiveControl('[data-range]', 'range', selectedRange);
      showRange(selectedRange);
    }));
    panel.querySelectorAll('[data-series]').forEach((button) => button.addEventListener('click', () => {
      selectedSeries = button.dataset.series;
      setActiveControl('[data-series]', 'series', selectedSeries);
      showRange(selectedRange);
    }));
    panel.querySelector('[data-native]').addEventListener('click', () => { native.hidden = false; panel.hidden = true; });
    setActiveControl('[data-range]', 'range', selectedRange);
    setActiveControl('[data-series]', 'series', selectedSeries);
    showRange('30d');
  }

  function showMatrasStatus(native, reason, product, detail = '') {
    document.querySelector('.cmu-chart-status')?.remove();
    const messages = {
      disabled: 'L’historique Matras est désactivé. Active-le dans les réglages puis recharge cette fiche.',
      'native-missing': 'Le graphique natif Cardmarket est introuvable sur cette fiche; aucun graphique Matras n’a été ajouté.',
      'id-missing': 'L’identifiant numérique du produit n’a pas été trouvé dans la fiche; le graphique natif reste disponible.',
      'permission-missing': 'L’accès réseau à Matras manque. Autorise-le dans les réglages, puis réessaie.',
      'request-failed': `Matras n’a pas répondu. Le graphique Cardmarket reste visible.${detail ? ` Détail : ${detail}` : ''}`,
      empty: 'Matras ne fournit pas d’historique pour ce produit. Le graphique Cardmarket reste visible.',
    };
    const status = document.createElement('aside');
    status.className = 'cmu-chart-status';
    const message = document.createElement('span');
    message.textContent = messages[reason] || messages['request-failed'];
    status.append(message);

    if (reason === 'disabled' || reason === 'permission-missing') {
      const settingsLink = document.createElement('a');
      settingsLink.href = `${chrome.runtime.getURL('options.html')}#network`;
      settingsLink.target = '_blank';
      settingsLink.rel = 'noopener noreferrer';
      settingsLink.textContent = 'Ouvrir les réglages';
      status.append(settingsLink);
    }

    if (['permission-missing', 'request-failed', 'empty'].includes(reason)) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'cmu-button';
      retry.textContent = 'Réessayer';
      retry.addEventListener('click', () => {
        status.remove();
        addHistoricalChart(product).catch((error) => {
          showMatrasStatus(native, 'request-failed', product, error?.message);
        });
      });
      status.append(retry);
    }

    (native || document.querySelector('h1'))?.insertAdjacentElement('afterend', status);
  }

  function applyTheme() {
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.cmuTheme = dark ? 'dark' : 'light';
  }

  function addToolbox(product) {
    if (document.querySelector('.cmu-toolbox')) return;
    const toolbox = document.createElement('aside');
    toolbox.className = 'cmu-toolbox';
    toolbox.innerHTML = `<button class="cmu-toggle" type="button" aria-expanded="false" aria-label="Ouvrir Cardmarket Unifié">CM</button><div class="cmu-body" hidden><strong>Cardmarket Unifié</strong><p>${product ? esc(product.title) : 'Outils de la page'}</p>${featureEnabled('showPriceHelper') ? '<label>Mode de prix<select class="cmu-mode"><option value="lowest">Première offre</option><option value="avg">Moyenne visible</option><option value="trend1">Tendance 1 jour</option><option value="trend7">Tendance 7 jours</option><option value="trend30">Tendance 30 jours</option><option value="pro">Vendeur professionnel</option><option value="from">Prix From</option><option value="min">Prix minimum (0,02 €)</option></select></label>' : ''}${featureEnabled('showTableCopy') && document.querySelector('table tbody') ? '<button class="cmu-button cmu-copy" type="button">Copier les lignes visibles</button>' : ''}${featureEnabled('showSessionTotal') ? '<p class="cmu-session"></p>' : ''}<a href="${chrome.runtime.getURL('options.html')}" target="_blank">Réglages</a></div>`;
    document.body.append(toolbox);
    toolbox.querySelector('.cmu-toggle').addEventListener('click', (event) => {
      const body = toolbox.querySelector('.cmu-body');
      body.hidden = !body.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
    });
    const modeSelector = toolbox.querySelector('.cmu-mode');
    if (modeSelector) {
      modeSelector.value = settings.priceMode;
      modeSelector.addEventListener('change', (event) => {
        settings.priceMode = event.target.value;
        chrome.storage.local.set({ priceMode: settings.priceMode });
        document.dispatchEvent(new CustomEvent('cmu-price-mode-change', { detail: { mode: settings.priceMode } }));
      });
    }
    toolbox.querySelector('.cmu-copy')?.addEventListener('click', (event) => copyVisibleRows(event.currentTarget));
    if (featureEnabled('showSessionTotal')) chrome.storage.local.get({ sessionCount: 0, sessionValue: 0 }).then((session) => {
      CardmarketCore.renderSessionTotal(document.querySelectorAll('.cmu-session'), session);
    });
  }

  CardmarketSettings.loadSettings(chrome.storage.local).then((stored) => {
    settings = stored;
    if (!settings.enabled) return;
    trackManualOfferLanguageChanges();
    if (applyOfferLanguage()) return;
    applyTheme();
    const product = productDetails();
    if (featureEnabled('showFloatingPanel')) addToolbox(product);
    else {
      addStandaloneTableCopyButton();
      addStandaloneSessionTotal();
    }
    addTableFilter();
    addMessageSignature();
    addCommentTemplates();
    addMultipleAttachments();
    addMessagePreviews();
    addCardImageButtons();
    addWantsPreference();
    if (featureEnabled('showGameSwitcher')) addGameNavigation();
    addSocialHide();
    addOrderChecklist();
    addPurchaseHistory(product).catch(() => {});
    installSellerPriceHelpers(product);
    if (/\/Products\/Singles\//i.test(location.pathname)) {
      if (product) {
        if (featureEnabled('showPriceDeviation')) addPriceDeviationWarning(product);
      }
      addHistoricalChart(product).catch((error) => {
        showMatrasStatus(document.querySelector('.chart-container, .chart-wrapper'), 'request-failed', product, error?.message);
      });
      if (product) reportPublicPrices(product).catch(() => {});
    }
  }).catch(() => {});
})();
