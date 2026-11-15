(function (root) {
  const ACCESSORY_TERMS = Object.freeze([
    'Dragon Shield', 'Ultimate Guard', 'Deck Case', 'TCG Guru', 'Ultra Pro', 'Deck Box',
    'beyondTCG', '9-Pocket', '12-Pocket', '4-Pocket', 'Embroidered Design',
    'Clear Sleeves', 'Toploader', 'Design Sleeves',
  ]);
  const HIDDEN_CLASS = 'cmu-spoiler-accessory-hidden';

  function isSpoilersPage(pathname = root.location?.pathname || '') {
    return /\/spoilers\//i.test(String(pathname));
  }

  function isAccessoryText(text) {
    const normalized = String(text || '').toLocaleLowerCase();
    return ACCESSORY_TERMS.some((term) => normalized.includes(term.toLocaleLowerCase()));
  }

  function filterSpoilerCards(rows, hide = true) {
    if (!hide || !Array.isArray(rows)) return [];
    return rows.filter((row) => isAccessoryText(row?.text)).map((row) => row.text);
  }

  function createLoadOnScrollHandler({
    delayMs = 250,
    setTimeoutFn = root.setTimeout?.bind(root) || setTimeout,
    clearTimeoutFn = root.clearTimeout?.bind(root) || clearTimeout,
    dispatchLoad = () => root.dispatchEvent?.(new root.Event('load')),
  } = {}) {
    let timer = null;
    return function handleScroll() {
      if (timer !== null) clearTimeoutFn(timer);
      timer = setTimeoutFn(() => { timer = null; dispatchLoad(); }, delayMs);
    };
  }

  function getAccessoryRows(documentRef = root.document) {
    const rows = new Set();
    for (const paragraph of documentRef?.querySelectorAll?.('#SpoilersContainer .row > div:not(.d-none) p.card-text.d-block, #SpoilersContainer p.card-text.d-block') || []) {
      if (!isAccessoryText(paragraph.textContent)) continue;
      const card = paragraph.closest?.('div.card, .card');
      const wrapper = card?.closest?.('div.d-flex, .d-flex');
      if (wrapper) rows.add(wrapper);
    }
    return [...rows];
  }

  function applyAccessoryFilter(documentRef = root.document, hide = true, dispatchLoad = () => {}) {
    const hiddenRows = new Set(documentRef?.querySelectorAll?.(`#SpoilersContainer .${HIDDEN_CLASS}`) || []);
    if (!hide) {
      for (const row of hiddenRows) row.classList?.remove(HIDDEN_CLASS);
      dispatchLoad();
      return { hidden: 0, rows: [] };
    }
    const rows = getAccessoryRows(documentRef);
    for (const row of rows) row.classList?.add(HIDDEN_CLASS);
    dispatchLoad();
    return { hidden: rows.length, rows };
  }

  function installSpoilerTools(settings, {
    documentRef = root.document,
    windowRef = root,
    pathname = root.location?.pathname || '',
    storage = root.chrome?.storage?.local,
    MutationObserverClass = root.MutationObserver,
    setTimeoutFn = root.setTimeout?.bind(root) || setTimeout,
    clearTimeoutFn = root.clearTimeout?.bind(root) || clearTimeout,
    dispatchLoad = () => windowRef?.dispatchEvent?.(new root.Event('load')),
  } = {}) {
    const settingsApi = root.CardmarketSettings;
    if (!isSpoilersPage(pathname) || !documentRef?.body || settings?.enabled === false || !settingsApi?.isFeatureEnabled) {
      return { control: null, checkbox: null, scrollHandler: null, observer: null };
    }

    let scrollHandler = null;
    if (settingsApi.isFeatureEnabled(settings, 'forceSpoilerImageLoad') && windowRef?.addEventListener) {
      scrollHandler = createLoadOnScrollHandler({ delayMs: 250, setTimeoutFn, clearTimeoutFn, dispatchLoad });
      windowRef.addEventListener('scroll', scrollHandler, { passive: true });
    }

    let control = null, checkbox = null;
    const enabled = settingsApi.isFeatureEnabled(settings, 'hideSpoilerAccessories');
    if (enabled) {
      const headline = documentRef.querySelector('.headline-container .container');
      if (headline) {
        control = documentRef.createElement('div');
        control.className = 'cmu-spoiler-controls';
        const label = documentRef.createElement('label');
        checkbox = documentRef.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = settings.hideSpoilerAccessories !== false;
        const text = documentRef.createElement('span');
        text.textContent = 'Masquer les accessoires de jeu';
        const count = documentRef.createElement('small');
        count.className = 'cmu-spoiler-count';
        count.setAttribute('aria-live', 'polite');
        label.append(checkbox, text);
        control.append(label, count);
        headline.append(control);

        const update = () => {
          const result = applyAccessoryFilter(documentRef, checkbox.checked, dispatchLoad);
          count.textContent = checkbox.checked ? `${result.hidden} accessoire(s) masqué(s)` : '';
          void storage?.set?.({ hideSpoilerAccessories: checkbox.checked });
        };
        checkbox.addEventListener('change', update);
        const first = applyAccessoryFilter(documentRef, checkbox.checked, dispatchLoad);
        count.textContent = checkbox.checked ? `${first.hidden} accessoire(s) masqué(s)` : '';

        let observer = null;
        const container = documentRef.querySelector('#SpoilersContainer');
        if (MutationObserverClass && container) {
          observer = new MutationObserverClass(() => {
            if (!checkbox.checked) return;
            const result = applyAccessoryFilter(documentRef, true, dispatchLoad);
            count.textContent = `${result.hidden} accessoire(s) masqué(s)`;
          });
          observer.observe(container, { subtree: true, childList: true });
        }
        return { control, checkbox, scrollHandler, observer };
      }
    }
    return { control, checkbox, scrollHandler, observer: null };
  }

  const api = { ACCESSORY_TERMS, HIDDEN_CLASS, isSpoilersPage, isAccessoryText, filterSpoilerCards, createLoadOnScrollHandler, getAccessoryRows, applyAccessoryFilter, installSpoilerTools };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketSpoilerTools = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installSpoilerTools(settings))
      .catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
