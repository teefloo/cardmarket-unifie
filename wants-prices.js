(function (root) {
  const CARDMARKET_HOSTS = new Set(['www.cardmarket.com', 'cardmarket.com']);
  const CONDITION_RANKS = Object.freeze({ MT: 1, NM: 2, EX: 3, GD: 4, LP: 5, PL: 6, PO: 7 });
  const CONDITION_LABELS = Object.freeze({
    MT: ['mint'], NM: ['near mint', 'nearmint'], EX: ['excellent'], GD: ['good'],
    LP: ['light played', 'lightly played'], PL: ['played'], PO: ['poor'],
  });
  const LANGUAGE_IDS = Object.freeze({
    en: 1, fr: 2, de: 3, es: 4, it: 5, zh: 6, ja: 7, pt: 8, ru: 9, ko: 10, tw: 11, nl: 12, pl: 13, cs: 14, hu: 15,
  });
  const LANGUAGE_LABELS = Object.freeze({
    english: 1, anglais: 1, french: 2, francais: 2, deutsch: 3, german: 3, allemand: 3,
    spanish: 4, espagnol: 4, espanol: 4, italiano: 5, italian: 5, italien: 5,
    chinese: 6, chinois: 6, japanese: 7, japonais: 7, portuguese: 8, portugais: 8,
    russian: 9, russe: 9, korean: 10, coreen: 10, "traditional chinese": 11,
    "chinese traditional": 11, "chinois traditionnel": 11, dutch: 12, neerlandais: 12,
    polish: 13, polonais: 13, czech: 14, tcheque: 14, hungarian: 15, hongrois: 15,
  });
  const IMAGE_SELECTOR = 'img[src], img[data-src], img[data-echo]';
  const PRODUCT_IMAGE_HOST = 'product-images.s3.cardmarket.com';
  const REQUEST_DELAY_MS = 350;
  const productRequestCache = new Map();

  function isPokemonWantsPage(pathname = root.location?.pathname || '') {
    return /^\/(?:[a-z]{2}\/)?Pokemon\/Wants(?:\/\d+)?\/?$/i.test(String(pathname || ''));
  }

  function safeCardmarketUrl(value, origin = root.location?.origin || '') {
    try {
      const base = new URL(origin);
      const target = new URL(String(value || ''), base);
      if (target.protocol !== 'https:' || target.origin !== base.origin
        || !CARDMARKET_HOSTS.has(target.hostname.toLowerCase()) || target.username || target.password) return null;
      return target;
    } catch { return null; }
  }

  function safeProductUrl(value, origin) {
    const url = safeCardmarketUrl(value, origin);
    if (!url || !/^\/(?:[a-z]{2}\/)?Pokemon\/Products\/Singles\/[^/]+\/[^/]+\/?$/i.test(url.pathname)) return null;
    return url;
  }

  function safeImageUrl(value, origin) {
    try {
      const url = new URL(String(value || ''), origin);
      return url.protocol === 'https:' && url.hostname.toLowerCase() === PRODUCT_IMAGE_HOST
        && /\.(?:jpe?g|png|webp)$/i.test(url.pathname) ? url.href : null;
    } catch { return null; }
  }

  function readImageSource(image, origin) {
    if (!image) return null;
    return [image.getAttribute?.('data-echo'), image.getAttribute?.('data-src'), image.getAttribute?.('src'), image.src]
      .map((value) => safeImageUrl(value, origin)).find(Boolean) || null;
  }

  function normalizeProductImageName(value) {
    const tokens = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [];
    while (tokens.length > 1 && /^[a-z]{2,8}\d{1,4}[a-z]*$/.test(tokens.at(-1))) tokens.pop();
    return tokens.join(' ');
  }

  function productIdsFromNode(node) {
    const values = [
      node?.getAttribute?.('data-product-id'), node?.getAttribute?.('data-id-product'),
      node?.getAttribute?.('data-modal'),
    ];
    return values.flatMap((value) => {
      const text = String(value || '');
      const ids = [...text.matchAll(/(?:idProduct|productId|data-product-id)[=:'"\s]+(\d+)/gi)].map((match) => match[1]);
      if (/^\d+$/.test(text)) ids.push(text);
      return ids;
    });
  }

  function productImageContext({ row, productLink, productUrl, documentRef } = {}) {
    const names = new Set();
    const addName = (value) => {
      const normalized = normalizeProductImageName(value);
      if (normalized) names.add(normalized);
    };
    addName(productLink?.textContent);
    addName(productLink?.getAttribute?.('title'));
    addName(productLink?.getAttribute?.('aria-label'));
    const slug = productUrl?.pathname?.split('/').filter(Boolean).at(-1);
    if (slug) {
      try { addName(decodeURIComponent(slug.replace(/-/g, ' '))); }
      catch { addName(slug.replace(/-/g, ' ')); }
    }
    addName(documentRef?.querySelector?.('h1')?.textContent);

    const ids = new Set([
      ...productIdsFromNode(row), ...productIdsFromNode(productLink),
      ...productIdsFromNode(productLink?.closest?.('[data-product-id], [data-id-product]')),
    ]);
    const queryId = productUrl?.searchParams?.get('idProduct');
    if (/^\d+$/.test(String(queryId || ''))) ids.add(String(queryId));
    const pageProductIds = new Set();
    for (const element of documentRef?.querySelectorAll?.('[data-modal*="idProduct="]') || []) {
      for (const id of productIdsFromNode(element)) pageProductIds.add(id);
    }
    if (pageProductIds.size === 1) ids.add([...pageProductIds][0]);
    return { names, ids, productUrl };
  }

  function imageProductMatch(image, source, context, origin) {
    const ids = new Set(productIdsFromNode(image));
    for (const id of productIdsFromNode(image?.closest?.('[data-product-id], [data-id-product], [data-modal*="idProduct="]'))) ids.add(id);
    const filenameId = new URL(source).pathname.split('/').at(-1)?.match(/^(\d+)\./)?.[1];
    if (filenameId && context.ids.has(filenameId)) return 'id';
    for (const id of ids) if (context.ids.has(id)) return 'id';
    if (context.ids.size && (filenameId || ids.size)) return null;

    const imageLink = image?.closest?.('a[href]');
    const imageLinkHref = imageLink?.getAttribute?.('href') || imageLink?.href;
    const linkedUrl = imageLinkHref ? safeCardmarketUrl(imageLinkHref, origin) : null;
    if (linkedUrl && context.productUrl) {
      if (linkedUrl.pathname === context.productUrl.pathname) return 'link';
      return null;
    }

    const labels = [image?.getAttribute?.('alt'), image?.getAttribute?.('title'), image?.getAttribute?.('aria-label')]
      .map(normalizeProductImageName).filter(Boolean);
    return labels.some((label) => context.names.has(label)) ? 'name' : null;
  }

  function getRowImage(row, origin, productUrl, productLink) {
    const context = productImageContext({ row, productUrl, productLink });
    const nameMatches = [];
    for (const image of row?.querySelectorAll?.(IMAGE_SELECTOR) || []) {
      if (image.closest?.('.cmu-wants-preview')) continue;
      const source = readImageSource(image, origin);
      if (!source) continue;
      const match = imageProductMatch(image, source, context, origin);
      if (match === 'id' || match === 'link') return source;
      if (match === 'name') nameMatches.push(source);
    }
    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  function findProductImage(documentRef, origin, productUrl, productLink, row) {
    const context = productImageContext({ row, productUrl, productLink, documentRef });
    const nameMatches = [];
    for (const image of documentRef?.querySelectorAll?.(IMAGE_SELECTOR) || []) {
      const source = readImageSource(image, origin);
      if (!source) continue;
      const match = imageProductMatch(image, source, context, origin);
      if (match === 'id' || match === 'link') return source;
      if (match === 'name') nameMatches.push(source);
    }
    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  function normalizeCondition(value) {
    const raw = String(value || '').trim();
    const numeric = raw.match(/^(?:CONDITION[-_ ]?)?([1-7])$/i);
    if (numeric) return Object.keys(CONDITION_RANKS).find((code) => CONDITION_RANKS[code] === Number(numeric[1])) || null;
    const normalized = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(?:≥|>=|minimum condition|condition minimum|min condition|min\.?|etat minimum|condition|etat)\s*:?[\s]*/, '')
      .trim();
    const code = normalized.match(/^(MT|NM|EX|GD|LP|PL|PO)(?:\b|$)/i)?.[1];
    if (code) return code.toUpperCase();
    for (const [condition, labels] of Object.entries(CONDITION_LABELS)) {
      if (labels.some((label) => normalized === label || normalized.startsWith(`${label} (`))) return condition;
    }
    return null;
  }

  function getCriteriaColumnIndex(row, pattern) {
    const table = row?.closest?.('table');
    let headers = [...(table?.querySelectorAll?.('thead th') || [])];
    if (!headers.length) {
      const headerRow = [...(table?.querySelectorAll?.('tr') || [])].find((candidate) => candidate.querySelector?.('th'));
      headers = [...(headerRow?.querySelectorAll?.('th') || [])];
    }
    const index = headers.findIndex((header) => pattern.test(String(header.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
    return index >= 0 ? index : null;
  }

  function getCellAt(row, index) {
    if (index === null) return null;
    return row?.cells?.[index] || row?.querySelectorAll?.('td')?.[index] || null;
  }

  function getConditionFromRow(row) {
    const selectors = [
      '#WantsMinCondition', '[data-min-condition]', '.want-min-condition', '.min-condition',
      'select[name*="minCondition" i]', 'input[name*="minCondition" i]',
    ];
    for (const selector of selectors) {
      for (const element of row?.querySelectorAll?.(selector) || []) {
        const selected = element.selectedOptions?.[0];
        const values = [
          element.getAttribute?.('data-min-condition'), element.value, selected?.textContent,
          element.getAttribute?.('title'), element.getAttribute?.('aria-label'), element.textContent,
        ];
        for (const value of values) {
          const condition = normalizeCondition(value);
          if (condition) return condition;
        }
      }
    }
    const criterionColumn = getCellAt(row, getCriteriaColumnIndex(row, /condition|etat/));
    const condition = normalizeCondition(criterionColumn?.textContent);
    if (condition) return condition;
    for (const cell of row?.querySelectorAll?.('td') || []) {
      if (cell.matches?.('.name, .expansion, .amount, .mailAlert, .buyPrice')) continue;
      if (cell.querySelector?.('.name a, a[href*="/Products/"]')) continue;
      const candidate = normalizeCondition(cell.textContent);
      if (candidate) return candidate;
    }
    return null;
  }

  function normalizeLanguageId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_IDS, raw)) return LANGUAGE_IDS[raw];
    const numeric = raw.match(/^(?:language[-_ ]?)?(\d{1,2})$/)?.[1];
    if (numeric && Number(numeric) >= 1 && Number(numeric) <= 15) return Number(numeric);
    const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [label, id] of Object.entries(LANGUAGE_LABELS)) {
      if (normalized === label || normalized.startsWith(`${label} `) || normalized.endsWith(` ${label}`)) return id;
    }
    return null;
  }

  function selectedLanguageIds(element) {
    const options = [...(element?.selectedOptions || [])];
    const values = options.length ? options.map((option) => option.value || option.textContent) : [
      element?.value, element?.getAttribute?.('data-language'), element?.getAttribute?.('lang'),
      element?.getAttribute?.('title'), element?.getAttribute?.('aria-label'), element?.getAttribute?.('alt'),
      element?.textContent,
    ];
    return [...new Set(values.flatMap((value) => String(value || '').split(/[;,\s]+/).map(normalizeLanguageId).filter(Boolean)))];
  }

  function getLanguagesFromRow(row) {
    const languageColumn = getCellAt(row, getCriteriaColumnIndex(row, /language|langue/));
    if (languageColumn) {
      const sources = [languageColumn, ...(languageColumn.querySelectorAll?.('[data-language], [lang], [title], [aria-label], img[alt]') || [])];
      return [...new Set(sources.flatMap(selectedLanguageIds))];
    }
    const selectors = ['[data-language]', 'select[name*="language" i]', 'input[name*="language" i]'];
    for (const selector of selectors) {
      const controls = [...(row?.querySelectorAll?.(selector) || [])];
      if (!controls.length) continue;
      const checked = controls.filter((element) => !['checkbox', 'radio'].includes(String(element.type || '').toLowerCase()) || element.checked);
      return [...new Set(checked.flatMap(selectedLanguageIds))];
    }
    return null;
  }

  function findWantEditUrl(row, origin) {
    const urls = [...(row?.querySelectorAll?.('a[href*="/Wants/"]') || [])]
      .map((link) => safeCardmarketUrl(link.getAttribute?.('href') || link.href, origin))
      .filter((url) => url && /^\/(?:[a-z]{2}\/)?Pokemon\/Wants\/\d+(?:\/[a-z0-9_-]+)?\/?$/i.test(url.pathname));
    return urls.find((url) => /\/Wants\/\d+\/[a-z0-9_-]+\/?$/i.test(url.pathname))?.href || urls[0]?.href || null;
  }

  function criteriaFromEditDocument(documentRef) {
    const form = [...(documentRef?.querySelectorAll?.('form') || [])]
      .find((candidate) => /WantsList_EditWant/i.test(candidate.getAttribute?.('action') || candidate.action || ''));
    if (!form) return { condition: null, languageIds: null };
    const minConditionWidget = form.querySelector?.('#WantsMinCondition');
    const selectedConditionWidget = minConditionWidget?.matches?.('select, input')
      ? minConditionWidget
      : minConditionWidget?.querySelector?.('select, input:checked, [aria-selected="true"], [aria-checked="true"], .selected, .active');
    const conditionElements = [
      ...(selectedConditionWidget ? [selectedConditionWidget] : []),
      ...(form.querySelectorAll?.('[name*="minCondition" i], [name*="minimumCondition" i], [name*="condition" i], [name*="state" i], [data-min-condition]') || []),
    ];
    conditionElements.sort((left, right) => {
      const leftName = String(left.getAttribute?.('name') || '').toLowerCase();
      const rightName = String(right.getAttribute?.('name') || '').toLowerCase();
      const priority = (element, name) => element === selectedConditionWidget || /mincondition|minimumcondition/.test(name) ? 0 : /condition/.test(name) ? 1 : 2;
      return priority(left, leftName) - priority(right, rightName);
    });
    let condition = null;
    for (const element of conditionElements) {
      const selected = element.selectedOptions?.[0];
      const values = [
        element.getAttribute?.('data-min-condition'), element.getAttribute?.('data-condition'),
        element.value, selected?.textContent, element.getAttribute?.('value'),
        element.getAttribute?.('aria-label'),
      ];
      for (const value of values) {
        condition = normalizeCondition(value);
        if (condition) break;
      }
      if (condition) break;
    }
    const languagesWidget = form.querySelector?.('#WantsLanguages');
    const languageControls = [
      ...(languagesWidget ? [languagesWidget] : []),
      ...(form.querySelectorAll?.('[name*="language" i], [data-language]') || []),
    ];
    let languageIds = null;
    if (languageControls.length) {
      const widgetControls = languagesWidget?.querySelectorAll?.('select, input[type="checkbox"], input[type="radio"], [aria-selected="true"], [aria-checked="true"], [data-selected="true"], .selected, .active') || [];
      const selectedWidgets = [...widgetControls].filter((element) => !['checkbox', 'radio'].includes(String(element.type || '').toLowerCase()) || element.checked);
      if (selectedWidgets.length) languageIds = [...new Set(selectedWidgets.flatMap(selectedLanguageIds))];
      else {
        const checked = languageControls.filter((element) => !['checkbox', 'radio'].includes(String(element.type || '').toLowerCase()) || element.checked);
        languageIds = [...new Set(checked.flatMap(selectedLanguageIds))];
      }
    }
    return { condition, languageIds };
  }

  function parsePrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const match = String(value || '').match(/\d[\d.,\s\u00a0\u202f]*/);
    if (!match) return null;
    const token = match[0].replace(/[\s\u00a0\u202f]/g, '');
    const comma = token.lastIndexOf(',');
    const dot = token.lastIndexOf('.');
    let normalized = token;
    if (comma >= 0 && dot >= 0) {
      normalized = comma > dot ? token.replace(/\./g, '').replace(',', '.') : token.replace(/,/g, '');
    } else if (comma >= 0) {
      const digitsAfter = token.length - comma - 1;
      normalized = digitsAfter > 0 && digitsAfter <= 2 ? token.replace(',', '.') : token.replace(/,/g, '');
    } else if (dot >= 0) {
      const digitsAfter = token.length - dot - 1;
      normalized = digitsAfter > 0 && digitsAfter <= 2 && token.indexOf('.') === dot
        ? token
        : token.replace(/\./g, '');
    }
    const price = Number(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function getOfferCondition(row) {
    for (const element of row?.querySelectorAll?.('.article-condition[class*="condition-"], [data-condition]') || []) {
      const data = element.getAttribute?.('data-condition');
      if (data) {
        const condition = normalizeCondition(data);
        if (condition) return condition;
      }
      for (const name of Array.from(element.classList || [])) {
        const match = name.match(/^condition[-_](.+)$/i);
        if (match) {
          const condition = normalizeCondition(match[1]);
          if (condition) return condition;
        }
      }
      const condition = normalizeCondition(element.textContent);
      if (condition) return condition;
    }
    return null;
  }

  function getMinimumPrice(documentRef, targetCondition) {
    const targetRank = CONDITION_RANKS[targetCondition];
    if (!targetRank) return null;
    const prices = [];
    const rows = documentRef?.querySelectorAll?.('.article-table .article-row, .article-table tr[id^="articleRow"]') || [];
    for (const row of rows) {
      const condition = getOfferCondition(row);
      const rank = CONDITION_RANKS[condition];
      if (!rank || rank > targetRank) continue;
      const price = parsePrice(row.querySelector?.('.price-container')?.textContent);
      if (price !== null) prices.push(price);
    }
    return prices.length ? Math.min(...prices) : null;
  }

  function buildOffersUrl(productUrl, languageIds, condition) {
    const url = new URL(productUrl.href);
    url.searchParams.delete('language');
    url.searchParams.delete('minCondition');
    const selectedLanguages = [...new Set((Array.isArray(languageIds) ? languageIds : [languageIds])
      .map(normalizeLanguageId).filter(Boolean))];
    if (selectedLanguages.length) url.searchParams.set('language', selectedLanguages.join(','));
    const rank = CONDITION_RANKS[condition];
    if (rank) url.searchParams.set('minCondition', String(rank));
    return url;
  }

  async function fetchDocument(url, { fetcher = root.fetch?.bind(root), DOMParserCtor = root.DOMParser } = {}) {
    if (typeof fetcher !== 'function' || typeof DOMParserCtor !== 'function') throw new Error('Lecture Cardmarket indisponible.');
    const response = await fetcher(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response?.ok) throw new Error(`Page Cardmarket indisponible (${response?.status || 'erreur'}).`);
    return new DOMParserCtor().parseFromString(await response.text(), 'text/html');
  }

  function money(value) {
    return `${value.toFixed(2).replace('.', ',')} €`;
  }

  function setPreviewImage(row, image, source) {
    if (!image || !source) return;
    image.src = source;
    const preview = row.querySelector?.('.cmu-wants-preview');
    if (preview) preview.hidden = false;
  }

  function ensureImageCell(row, documentRef) {
    const existing = row.querySelector?.('.cmu-wants-image-cell');
    if (existing) return existing;
    const nameCell = row.querySelector?.('td.name') || row.cells?.[0];
    const imageCell = documentRef.createElement('td');
    imageCell.className = 'cmu-wants-image-cell';
    imageCell.setAttribute('aria-label', 'Aperçu de la carte');
    imageCell.setAttribute('headers', 'cmu-wants-image-heading');
    if (nameCell?.parentElement === row) row.insertBefore(imageCell, nameCell);
    else row.prepend(imageCell);
    return imageCell;
  }

  function addImagePreview(row, imageCell, productUrl, productTitle, source, documentRef) {
    const existingPreview = row.querySelector?.('.cmu-wants-preview');
    if (existingPreview) {
      const existing = row.querySelector('.cmu-wants-preview img');
      if (existing && source && existing.src !== source) existing.src = source;
      if (existing && source) existingPreview.hidden = false;
      return existing;
    }
    const preview = documentRef.createElement('a');
    preview.className = 'cmu-wants-preview';
    preview.href = productUrl.href;
    preview.setAttribute('aria-label', `Ouvrir ${productTitle || 'la carte'}`);
    preview.title = productTitle || 'Aperçu de la carte';
    preview.hidden = !source;
    const image = documentRef.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (source) image.src = source;
    image.addEventListener?.('error', () => { preview.hidden = true; });
    preview.append(image);
    imageCell.append(preview);
    return image;
  }

  function addPriceColumn(table, rows, documentRef) {
    const header = table.querySelector('thead tr')
      || [...(table.querySelectorAll('tr') || [])].find((row) => row.querySelector('th'));
    if (header && !header.querySelector('.cmu-wants-image-heading')) {
      const cell = documentRef.createElement('th');
      cell.className = 'cmu-wants-image-heading';
      cell.id = 'cmu-wants-image-heading';
      cell.scope = 'col';
      cell.setAttribute('aria-label', 'Aperçu de la carte');
      const hiddenLabel = documentRef.createElement('span');
      hiddenLabel.className = 'visually-hidden';
      hiddenLabel.textContent = 'Aperçu de la carte';
      cell.append(hiddenLabel);
      const nameCell = rows[0]?.querySelector?.('td.name') || rows[0]?.cells?.[0];
      const nameIndex = nameCell ? [...(rows[0]?.cells || [])].indexOf(nameCell) : -1;
      const nameHeading = header.querySelector('th.name') || (nameIndex >= 0 ? header.cells?.[nameIndex] : null)
        || [...(header.querySelectorAll('th') || [])].find((heading) => /^(carte|card|name|nom|product)$/i.test(heading.textContent?.trim() || ''));
      if (nameHeading) header.insertBefore(cell, nameHeading);
      else header.prepend(cell);
    }
    if (header && !header.querySelector('.cmu-wants-min-price-heading')) {
      const cell = documentRef.createElement('th');
      cell.className = 'cmu-wants-min-price-heading';
      cell.scope = 'col';
      cell.textContent = 'Prix mini';
      header.append(cell);
    }
    for (const row of rows) {
      ensureImageCell(row, documentRef);
      if (row.querySelector('.cmu-wants-min-price')) continue;
      const cell = documentRef.createElement('td');
      cell.className = 'cmu-wants-min-price';
      cell.textContent = '…';
      cell.title = 'Calcul du prix minimum en cours';
      row.append(cell);
    }
  }

  function installWantsPrices({
    settings, documentRef = root.document, locationRef = root.location,
    fetcher = root.fetch?.bind(root), DOMParserCtor = root.DOMParser,
    MutationObserverClass = root.MutationObserver, IntersectionObserverClass = root.IntersectionObserver,
  } = {}) {
    if (settings?.enabled === false || !isPokemonWantsPage(locationRef?.pathname)
      || !CARDMARKET_HOSTS.has(String(locationRef?.hostname || '').toLowerCase())) {
      return { rows: [], observer: null, intersectionObserver: null };
    }
    const table = documentRef?.querySelector?.('#WantsListTable');
    if (!table) return { rows: [], observer: null, intersectionObserver: null };
    let scrollContainer = table.closest?.('.table-responsive, .cmu-wants-scroll');
    if (!scrollContainer && table.parentElement) {
      scrollContainer = documentRef.createElement('div');
      table.parentElement.insertBefore(scrollContainer, table);
      scrollContainer.append(table);
    }
    scrollContainer?.classList?.add('cmu-wants-scroll');
    const origin = locationRef.origin;
    const preferredLanguageId = root.CardmarketSettings?.getOfferLanguageId?.(settings?.preferredLanguage) ?? null;
    let styles = documentRef.querySelector('[data-cmu-wants-styles]');
    if (!styles && root.chrome?.runtime?.getURL) {
      styles = documentRef.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = root.chrome.runtime.getURL('pokemon.css');
      styles.dataset.cmuWantsStyles = 'true';
      (documentRef.head || documentRef.documentElement)?.append(styles);
    }

    const pending = [];
    const queued = new WeakSet();
    const finished = new WeakSet();
    let active = false;
    let observer = null;
    let intersectionObserver = null;
    const getRows = () => [...(table.querySelectorAll('tbody tr') || [])]
      .filter((row) => row.querySelector?.('td.name a[href*="/Products/"], td.name a'));

    const pause = () => new Promise((resolve) => root.setTimeout(resolve, REQUEST_DELAY_MS));
    const getSharedProductDocument = (url) => {
      const key = url.href;
      if (!productRequestCache.has(key)) {
        productRequestCache.set(key, fetchDocument(key, { fetcher, DOMParserCtor }));
      }
      return productRequestCache.get(key);
    };

    const processRow = async (row) => {
      const nameCell = row.querySelector('td.name') || row.cells?.[0];
      const productLink = nameCell?.querySelector?.('a[href*="/Products/"]:not(.cmu-wants-preview)')
        || row.querySelector('a[href*="/Products/"]:not(.cmu-wants-preview)');
      const productUrl = safeProductUrl(productLink?.getAttribute?.('href') || productLink?.href, origin);
      const priceCell = row.querySelector('.cmu-wants-min-price');
      if (!nameCell || !productLink || !productUrl || !priceCell) {
        if (priceCell) { priceCell.textContent = '—'; priceCell.title = 'Fiche produit Cardmarket introuvable'; }
        return;
      }
      let imageSource = getRowImage(row, origin, productUrl, productLink);
      const imageCell = ensureImageCell(row, documentRef);
      const image = addImagePreview(row, imageCell, productUrl, productLink.textContent?.trim(), imageSource, documentRef);
      try {
        let condition = getConditionFromRow(row);
        let wantLanguageIds = getLanguagesFromRow(row);
        const editUrl = findWantEditUrl(row, origin);
        if ((!condition || wantLanguageIds === null) && editUrl) {
          const editDocument = await fetchDocument(editUrl, { fetcher, DOMParserCtor });
          const criteria = criteriaFromEditDocument(editDocument);
          condition ||= criteria.condition;
          if (wantLanguageIds === null) wantLanguageIds = criteria.languageIds;
          await pause();
        }
        const selectedLanguages = wantLanguageIds?.length ? wantLanguageIds : preferredLanguageId === null ? [] : [preferredLanguageId];
        const offersUrl = buildOffersUrl(productUrl, selectedLanguages, condition);
        const productDocument = await getSharedProductDocument(offersUrl);
        if (!imageSource) {
          imageSource = findProductImage(productDocument, origin, productUrl, productLink, row);
          setPreviewImage(row, image, imageSource);
        }
        if (!condition) {
          priceCell.textContent = '—';
          priceCell.title = 'État minimum introuvable dans les paramètres de cette Want';
          return;
        }
        const minimum = getMinimumPrice(productDocument, condition);
        priceCell.textContent = minimum === null ? '—' : money(minimum);
        priceCell.title = minimum === null
          ? `Aucune offre disponible à partir de ${condition}${selectedLanguages.length ? ` · langue${selectedLanguages.length > 1 ? 's' : ''} ${selectedLanguages.join(', ')}` : ' · toutes langues'}`
          : `Minimum à partir de ${condition}${selectedLanguages.length ? ` · langue${selectedLanguages.length > 1 ? 's' : ''} ${selectedLanguages.join(', ')}` : ' · toutes langues'}`;
      } catch (error) {
        priceCell.textContent = '—';
        priceCell.title = String(error?.message || 'Lecture du prix impossible.');
        if (!imageSource) {
          try {
            const fallbackLanguages = preferredLanguageId === null ? [] : [preferredLanguageId];
            const imageDocument = await getSharedProductDocument(buildOffersUrl(productUrl, fallbackLanguages, null));
            imageSource = findProductImage(imageDocument, origin, productUrl, productLink, row);
            setPreviewImage(row, image, imageSource);
          } catch { /* La vignette reste vide si Cardmarket ne fournit pas l’image. */ }
        }
      }
    };

    const pump = async () => {
      if (active) return;
      active = true;
      while (pending.length) {
        const row = pending.shift();
        try { await processRow(row); }
        catch { /* Les autres lignes restent traitées même si une carte échoue. */ }
        finished.add(row);
        await pause();
      }
      active = false;
    };
    const enqueue = (row) => {
      if (!row || queued.has(row) || finished.has(row)) return;
      queued.add(row);
      pending.push(row);
      void pump();
    };

    const rows = getRows();
    addPriceColumn(table, rows, documentRef);
    for (const row of rows) {
      const nameCell = row.querySelector('td.name') || row.cells?.[0];
      const link = nameCell?.querySelector?.('a[href*="/Products/"]:not(.cmu-wants-preview)')
        || row.querySelector('a[href*="/Products/"]:not(.cmu-wants-preview)');
      const productUrl = safeProductUrl(link?.getAttribute?.('href') || link?.href, origin);
      if (!nameCell || !productUrl) continue;
      const productLink = nameCell.querySelector?.('a[href*="/Products/"]:not(.cmu-wants-preview)')
        || row.querySelector('a[href*="/Products/"]:not(.cmu-wants-preview)');
      const imageCell = ensureImageCell(row, documentRef);
      addImagePreview(row, imageCell, productUrl, productLink.textContent?.trim(), getRowImage(row, origin, productUrl, productLink), documentRef);
      if (IntersectionObserverClass) {
        if (!intersectionObserver) {
          intersectionObserver = new IntersectionObserverClass((entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              intersectionObserver.unobserve(entry.target);
              enqueue(entry.target);
            }
          }, { rootMargin: '320px 0px' });
        }
        intersectionObserver.observe(row);
      } else if (rows.indexOf(row) < 8) enqueue(row);
    }

    if (MutationObserverClass) {
      observer = new MutationObserverClass(() => {
        const addedRows = getRows();
        addPriceColumn(table, addedRows, documentRef);
        for (const row of addedRows) {
          if (queued.has(row) || finished.has(row)) continue;
          const nameCell = row.querySelector('td.name') || row.cells?.[0];
          const link = nameCell?.querySelector?.('a[href*="/Products/"]:not(.cmu-wants-preview)')
            || row.querySelector('a[href*="/Products/"]:not(.cmu-wants-preview)');
          const productUrl = safeProductUrl(link?.getAttribute?.('href') || link?.href, origin);
          if (!nameCell || !productUrl) continue;
          const productLink = nameCell.querySelector?.('a[href*="/Products/"]:not(.cmu-wants-preview)')
            || row.querySelector('a[href*="/Products/"]:not(.cmu-wants-preview)');
          const imageCell = ensureImageCell(row, documentRef);
          addImagePreview(row, imageCell, productUrl, productLink.textContent?.trim(), getRowImage(row, origin, productUrl, productLink), documentRef);
          if (intersectionObserver) intersectionObserver.observe(row);
          else if (addedRows.indexOf(row) < 8) enqueue(row);
        }
      });
      observer.observe(table, { childList: true, subtree: true });
    }
    return { rows, observer, intersectionObserver };
  }

  function initialize() {
    if (!root.chrome?.storage?.local || !root.CardmarketSettings || !isPokemonWantsPage(root.location?.pathname)) return;
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installWantsPrices({ settings }))
      .catch(() => {});
  }

  const api = {
    CONDITION_RANKS,
    isPokemonWantsPage,
    safeProductUrl,
    safeImageUrl,
    normalizeCondition,
    normalizeLanguageId,
    normalizeProductImageName,
    getRowImage,
    findProductImage,
    getConditionFromRow,
    getLanguagesFromRow,
    criteriaFromEditDocument,
    getMinimumPrice,
    buildOffersUrl,
    installWantsPrices,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketWantsPrices = api;
  initialize();
})(typeof globalThis !== 'undefined' ? globalThis : this);
