(function (root) {
  const CART_ROW_SELECTORS = [
    'section.shipment-block table.product-table tbody tr[data-product-id]',
    'section.shipment-bloc table.product-table tbody tr[data-product-id]',
    '.article-table .article-row[data-product-id]',
  ];

  function isCartPage(pathname = root.location?.pathname || '') {
    return /\/ShoppingCart\/?$/i.test(String(pathname));
  }

  function summarizeCartLines(lines = []) {
    let itemCount = 0;
    let pricedItemCount = 0;
    let subtotal = 0;
    for (const line of lines) {
      const rawAmount = Number(line?.amount);
      const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.floor(rawAmount) : 0;
      itemCount += amount;
      const unitPrice = Number(line?.unitPrice);
      if (amount > 0 && Number.isFinite(unitPrice) && unitPrice > 0) {
        pricedItemCount += amount;
        subtotal += amount * unitPrice;
      }
    }
    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    return {
      itemCount,
      lineCount: Array.isArray(lines) ? lines.length : 0,
      pricedItemCount,
      subtotal,
      averageUnitPrice: pricedItemCount ? Math.round((subtotal / pricedItemCount + Number.EPSILON) * 100) / 100 : null,
    };
  }

  function collectCartLines(documentRef = root.document, parsePrice = root.CardmarketCore?.parsePrice) {
    if (!documentRef?.querySelectorAll || typeof parsePrice !== 'function') return [];
    const rows = new Set(CART_ROW_SELECTORS.flatMap((selector) => [...documentRef.querySelectorAll(selector)]));
    return [...rows].map((row) => {
      const amountInput = row.querySelector?.('input[name*="amount" i], input[id*="amount" i]');
      const amount = row.dataset?.amount || amountInput?.value || 1;
      const priceNode = row.querySelector?.('.price-container, .col-price, [data-unit-price]');
      const priceText = row.dataset?.unitPrice
        || row.getAttribute?.('data-unit-price')
        || priceNode?.getAttribute?.('data-unit-price')
        || priceNode?.textContent
        || '';
      return { amount, unitPrice: parsePrice(priceText) };
    });
  }

  function formatEuro(value) {
    return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function installCartSummary(settings, {
    documentRef = root.document,
    pathname = root.location?.pathname || '',
    parsePrice = root.CardmarketCore?.parsePrice,
    MutationObserverCtor = root.MutationObserver,
    setTimer = root.setTimeout?.bind(root),
  } = {}) {
    if (!settings?.enabled || settings.showCartSummary !== true || !isCartPage(pathname) || !documentRef?.body) return null;
    if (documentRef.querySelector('.cmu-cart-summary')) return null;
    const initialLines = collectCartLines(documentRef, parsePrice);
    if (!initialLines.length) return null;

    const widget = documentRef.createElement('aside');
    widget.className = 'cmu-cart-summary';
    widget.setAttribute('aria-label', 'Résumé local du panier Cardmarket');
    const toggle = documentRef.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cmu-button cmu-cart-summary-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    const panel = documentRef.createElement('section');
    panel.className = 'cmu-cart-summary-panel';
    panel.hidden = true;
    const title = documentRef.createElement('strong');
    title.textContent = 'Résumé du panier';
    const count = documentRef.createElement('p');
    const total = documentRef.createElement('p');
    const average = documentRef.createElement('p');
    const note = documentRef.createElement('small');
    note.textContent = 'Calcul local des lignes visibles; aucune action sur le panier.';
    panel.append(title, count, total, average, note);
    widget.append(toggle, panel);
    documentRef.body.append(widget);

    const update = () => {
      const summary = summarizeCartLines(collectCartLines(documentRef, parsePrice));
      toggle.textContent = `Panier · ${formatEuro(summary.subtotal)}`;
      count.textContent = `Articles : ${summary.itemCount} sur ${summary.lineCount} lignes`;
      total.textContent = `Sous-total visible : ${formatEuro(summary.subtotal)}`;
      average.textContent = summary.averageUnitPrice === null
        ? 'Prix moyen : indisponible'
        : `Prix moyen par article : ${formatEuro(summary.averageUnitPrice)}`;
      note.hidden = summary.pricedItemCount === summary.itemCount;
      if (!note.hidden) note.textContent = `Prix visibles pour ${summary.pricedItemCount} article(s) sur ${summary.itemCount}; le sous-total est incomplet.`;
    };
    update();
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    const refreshOnInput = (event) => {
      if (/amount/i.test(`${event.target?.name || ''} ${event.target?.id || ''}`)) update();
    };
    documentRef.body.addEventListener?.('input', refreshOnInput);
    documentRef.body.addEventListener?.('change', refreshOnInput);

    let timer = null;
    let observer = null;
    if (MutationObserverCtor && setTimer) {
      observer = new MutationObserverCtor((records) => {
        if (!records.some((record) => !widget.contains?.(record.target))) return;
        if (timer !== null) return;
        timer = setTimer(() => { timer = null; update(); }, 80);
      });
      observer.observe(documentRef.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-amount', 'data-unit-price', 'value'] });
    }
    return { widget, panel, update, observer };
  }

  const api = { isCartPage, summarizeCartLines, collectCartLines, installCartSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketCartSummary = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installCartSummary(settings))
      .catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
