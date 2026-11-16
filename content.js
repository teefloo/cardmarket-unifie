(() => {
  let settings;
  const offerLanguageOverridesKey = 'cmu-offer-language-overrides';
  const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const featureEnabled = (name) => CardmarketSettings.isFeatureEnabled(settings, name);

  function loadExtensionStyles() {
    if (document.querySelector('[data-cmu-styles]')) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('pokemon.css');
    stylesheet.dataset.cmuStyles = 'true';
    (document.head || document.documentElement).append(stylesheet);
  }

  function hasNativeOfferLanguageFilter() {
    return Boolean(document.querySelector(
      '#articleFilterProductLanguage .form-check input, #articleFilterProductLanguage input[type="checkbox"], #articleFilterProductLanguage [role="checkbox"], #FilterOffersFormWrapper select[name="idLanguage"], .form-floating #IdLanguage',
    ));
  }

  function applyOfferLanguage() {
    if (!CardmarketSettings.isOfferLanguageProductPath(location.pathname)) return false;
    let overrides = {};
    try {
      const saved = sessionStorage.getItem(offerLanguageOverridesKey);
      overrides = saved ? JSON.parse(saved) : {};
      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {};
    } catch { overrides = {}; }
    const path = location.pathname;
    const previousOverride = overrides[path] ?? null;
    const currentLanguages = new URL(location.href).searchParams.getAll('language');
    if (settings.preferredLanguage && !hasNativeOfferLanguageFilter()) return false;
    const target = CardmarketSettings.buildOfferLanguageUrl(location.href, settings.preferredLanguage, previousOverride);

    if (!settings.preferredLanguage) delete overrides[path];
    else if (target) {
      const previousAppliedLanguage = previousOverride?.languageId ?? previousOverride?.languageIds;
      const currentWasExtensionOverride = Boolean(previousAppliedLanguage)
        && currentLanguages.length === 1
        && currentLanguages[0] === String(previousAppliedLanguage);
      overrides[path] = {
        languageId: new URL(target).searchParams.get('language'),
        previousLanguages: currentWasExtensionOverride && Array.isArray(previousOverride.previousLanguages)
          ? previousOverride.previousLanguages
          : currentLanguages,
      };
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

  function installConditionPriceMinima() {
    if (!CardmarketSettings.isOfferLanguageProductPath(location.pathname)) return;
    let offerObserver;
    let pageObserver;
    let currentTable;
    let scheduled = false;

    const render = () => {
      scheduled = false;
      const table = document.querySelector('.article-table');
      if (!table) return false;
      const entries = [...table.querySelectorAll('.article-row[id^="articleRow"]')]
        .filter((row) => !row.hidden && row.getAttribute('aria-hidden') !== 'true'
          && (typeof row.getClientRects !== 'function' || row.getClientRects().length > 0))
        .flatMap((row) => {
          const condition = [...row.querySelectorAll('a.article-condition[class*="condition-"]')]
            .map((element) => [...element.classList].find((name) => /^condition-(?:mt|nm|ex|gd|lp|pl|po)$/i.test(name)))
            .find(Boolean)?.replace(/^condition-/i, '').toUpperCase();
          const price = CardmarketCore.parsePrice(row.querySelector('.price-container')?.textContent);
          return condition && price !== null ? [{ condition, price, href: row.id ? `#${row.id}` : '' }] : [];
        });
      const items = CardmarketCore.buildConditionMinima(entries);
      let summary = document.querySelector('.cmu-condition-prices');
      if (!summary) {
        summary = document.createElement('section');
        summary.className = 'cmu-condition-prices';
        summary.setAttribute('aria-label', 'Prix minimum par état');
        const heading = document.createElement('strong');
        heading.className = 'cmu-condition-prices-title';
        heading.textContent = 'Prix minimum';
        summary.append(heading);
        const values = document.createElement('div');
        values.className = 'cmu-condition-prices-values';
        summary.append(values);
        const info = document.querySelector('.info-list-container');
        if (info) info.insertAdjacentElement('afterend', summary);
        else table.insertAdjacentElement('beforebegin', summary);
      }
      const values = summary.querySelector('.cmu-condition-prices-values');
      values.replaceChildren();
      for (const item of items) {
        const value = document.createElement(item.price === null || !item.href ? 'span' : 'a');
        value.className = 'cmu-condition-price';
        if (item.href) value.setAttribute('href', item.href);
        value.setAttribute('aria-label', `${item.label} : ${item.price === null ? 'aucune offre' : money(item.price)}`);
        value.textContent = `${item.code} · ${item.price === null ? '—' : money(item.price)}`;
        values.append(value);
      }
      return true;
    };

    const scheduleRender = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(render, 0);
    };
    const attachTableObserver = () => {
      const table = document.querySelector('.article-table');
      if (!table || table === currentTable) return Boolean(table);
      currentTable = table;
      offerObserver?.disconnect();
      offerObserver = typeof MutationObserver === 'function' ? new MutationObserver(scheduleRender) : null;
      offerObserver?.observe(table, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      });
      render();
      pageObserver?.disconnect();
      return true;
    };

    if (!attachTableObserver() && typeof MutationObserver === 'function' && document.body) {
      pageObserver = new MutationObserver(() => attachTableObserver());
      pageObserver.observe(document.body, { childList: true, subtree: true });
    }
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

  async function requestService(url) {
    return chrome.runtime.sendMessage({ type: 'service-request', url });
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
    const styles = typeof getComputedStyle === 'function' ? getComputedStyle(canvas) : null;
    const chartColor = (name, fallback) => styles?.getPropertyValue(name)?.trim() || fallback;
    const primaryColor = chartColor('--bs-primary', '#0d6efd');
    const textColor = chartColor('--bs-body-color', styles?.color || '#212529');
    const mutedColor = chartColor('--bs-secondary-color', textColor);
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
      context.strokeStyle = primaryColor;
      context.lineWidth = 3;
      context.beginPath();
      normalized.forEach((_, index) => {
        const { x, y } = pointPosition(index);
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.stroke();
      context.fillStyle = textColor;
      context.font = '16px system-ui';
      context.fillText(`${chartValueText(low, seriesName)} – ${chartValueText(high, seriesName)}`, padX, 21);
      if (hoveredIndex >= 0) {
        const { x, y } = pointPosition(hoveredIndex);
        context.strokeStyle = mutedColor;
        context.lineWidth = 1;
        context.setLineDash([5, 5]);
        context.beginPath();
        context.moveTo(x, padY);
        context.lineTo(x, height - padY);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = primaryColor;
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
    const failure = CardmarketCore.getHistoryFailure({
      enabled: featureEnabled('showHistoricalChart'),
      nativeFound: Boolean(native),
      productIdFound: Number.isSafeInteger(product?.productId) && product.productId > 0,
    });
    if (failure) {
      showHistoryStatus(native, failure, product);
      return;
    }
    if (document.querySelector('.cmu-chart')) return;
    const url = `https://charts.matrastcg.de/api/v1/verlauf?spiel=${product.game}&id=${product.productId}&key=${encodeURIComponent(product.key)}`;
    let result;
    try {
      result = await requestService(url);
    } catch (error) {
      const reason = CardmarketCore.getHistoryFailure({ error: error?.message || 'Échec réseau' });
      showHistoryStatus(native, reason, product, error?.message);
      return;
    }
    if (!result || result.error) {
      const reason = CardmarketCore.getHistoryFailure({ error: result?.error || 'Réponse du service absente' });
      showHistoryStatus(native, reason, product, result?.error);
      return;
    }
    const points = Array.isArray(result.data?.preise) ? result.data.preise : [];
    if (!CardmarketCore.filterChartSeries(points, 'max').length) {
      showHistoryStatus(native, CardmarketCore.getHistoryFailure({ hasData: false }), product);
      return;
    }

    const panel = document.createElement('section');
    panel.className = 'cmu-chart';
    panel.innerHTML = '<header class="cmu-chart-header"><strong>Historique</strong><div class="cmu-chart-controls"><fieldset class="cmu-chart-group"><legend>Période</legend><div class="cmu-chart-ranges"><button class="cmu-button" type="button" data-range="30d">30 jours</button><button class="cmu-button" type="button" data-range="90d">90 jours</button><button class="cmu-button" type="button" data-range="1y">1 an</button><button class="cmu-button" type="button" data-range="max">Max</button></div></fieldset><fieldset class="cmu-chart-group"><legend>Série</legend><div class="cmu-chart-tabs"><button class="cmu-button" type="button" data-series="price">Prix</button><button class="cmu-button" type="button" data-series="availability">Disponibilité</button><button class="cmu-button" type="button" data-series="sales">Ventes estimées</button></div></fieldset><div class="cmu-chart-native"><span>Cardmarket</span><button class="cmu-button" type="button" data-native>Graphique natif</button></div></div></header><div class="cmu-chart-meta"><output class="cmu-chart-period" aria-live="polite"></output><output class="cmu-chart-averages" aria-label="Moyennes des prix historiques sur fenêtres calendaires" aria-live="polite"></output></div><div class="cmu-chart-plot"><canvas aria-label="Historique des prix" role="img" tabindex="0"></canvas><output class="cmu-chart-tooltip" hidden aria-live="polite"></output></div><p class="cmu-chart-empty" hidden></p>';
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
      canvas.setAttribute('aria-label', `Historique · ${selectedSeries === 'price' ? 'prix' : selectedSeries === 'availability' ? 'disponibilité' : 'ventes estimées'} · ${periodOutput.textContent}`);
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

  function showHistoryStatus(native, reason, product, detail = '') {
    document.querySelector('.cmu-chart-status')?.remove();
    const messages = {
      disabled: 'L’historique est désactivé. Active-le dans les réglages puis recharge cette fiche.',
      'native-missing': 'Le graphique natif Cardmarket est introuvable sur cette fiche; aucun historique n’a été ajouté.',
      'id-missing': 'L’identifiant numérique du produit n’a pas été trouvé dans la fiche; le graphique natif reste disponible.',
      'permission-missing': 'Autorise l’accès au service d’historique dans les réglages, puis réessaie.',
      'request-failed': `Le service d’historique n’a pas répondu. Le graphique Cardmarket reste visible.${detail ? ` Détail : ${detail}` : ''}`,
      empty: 'Aucun historique n’est disponible pour ce produit. Le graphique Cardmarket reste visible.',
    };
    const status = document.createElement('aside');
    status.className = 'cmu-chart-status';
    const message = document.createElement('span');
    message.textContent = messages[reason] || messages['request-failed'];
    status.append(message);

    if (reason === 'disabled' || reason === 'permission-missing') {
      const settingsLink = document.createElement('a');
      settingsLink.href = `${chrome.runtime.getURL('options.html')}#historique`;
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
          showHistoryStatus(native, 'request-failed', product, error?.message);
        });
      });
      status.append(retry);
    }

    (native || document.querySelector('h1'))?.insertAdjacentElement('afterend', status);
  }

  function initializePokemonPage() {
    CardmarketSettings.loadSettings(chrome.storage.local).then((stored) => {
      settings = stored;
      if (!settings.enabled || !CardmarketSettings.isOfferLanguageProductPath(location.pathname)) return;
      trackManualOfferLanguageChanges();
      if (applyOfferLanguage()) return;
      loadExtensionStyles();
      if (featureEnabled('showConditionPrices')) installConditionPriceMinima();
      const product = productDetails();
      if (product?.game === 6 && featureEnabled('showHistoricalChart')) {
        addHistoricalChart(product).catch((error) => {
          showHistoryStatus(document.querySelector('.chart-container, .chart-wrapper'), 'request-failed', product, error?.message);
        });
      }
    }).catch(() => {});
  }

  if (CardmarketRuntime?.isSupportedCardmarketPage(location.href)) {
    CardmarketRuntime.runWhenReady(initializePokemonPage);
  }
})();
