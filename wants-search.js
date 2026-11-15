(function (root) {
  const STORAGE_KEY = 'cmuWantsSearchIndex';
  const CARDMARKET_HOSTS = new Set(['www.cardmarket.com', 'cardmarket.com']);

  function isWantsPage(pathname = root.location?.pathname || '') {
    const parts = String(pathname).split('?')[0].split('/').filter(Boolean);
    return parts.length >= 3 && parts[2].toLowerCase() === 'wants'
      && (parts.length === 3 || (parts.length === 4 && /^\d+$/.test(parts[3])));
  }

  function getBasePath(pathname) {
    const parts = String(pathname).split('?')[0].split('/').filter(Boolean);
    if (parts.length < 3) return null;
    return `/${parts[0]}/${parts[1]}`;
  }

  function buildWantsListUrl(baseUrl, listId) {
    let url;
    try { url = new URL(baseUrl, 'https://www.cardmarket.com'); }
    catch { return null; }
    if (!CARDMARKET_HOSTS.has(url.hostname.toLowerCase()) || !/^\d+$/.test(String(listId || ''))) return null;
    const basePath = getBasePath(url.pathname);
    return basePath ? `${url.origin}${basePath}/Wants/${String(listId)}` : null;
  }

  function parseWantsOverview(documentRef, origin = root.location?.origin || 'https://www.cardmarket.com') {
    const lists = new Map();
    for (const teaser of documentRef?.querySelectorAll?.('.article-teaser-portrait') || []) {
      const anchor = teaser.querySelector('a[href*="/Wants/"]');
      if (!anchor) continue;
      let url;
      try { url = new URL(anchor.getAttribute('href') || anchor.href || '', origin); }
      catch { continue; }
      if (url.origin !== origin || !CARDMARKET_HOSTS.has(url.hostname.toLowerCase())) continue;
      const match = url.pathname.match(/\/Wants\/(\d+)\/?$/i);
      if (!match) continue;
      const name = teaser.querySelector('.card-title')?.textContent?.trim() || anchor.textContent?.trim();
      if (!name) continue;
      const countText = teaser.querySelector('.card-subtitle')?.textContent || '';
      const count = Number((String(countText).match(/\d+/) || [])[0]) || 0;
      lists.set(match[1], { id: match[1], name, count });
    }
    return [...lists.values()];
  }

  function parseWantsList(documentRef, origin = root.location?.origin || 'https://www.cardmarket.com') {
    const wants = [];
    for (const row of documentRef?.querySelectorAll?.('#WantsListTable tbody tr') || []) {
      const anchor = row.querySelector('td.name a');
      if (!anchor) continue;
      let url;
      try { url = new URL(anchor.getAttribute('href') || anchor.href || '', origin); }
      catch { continue; }
      if (url.origin !== origin || !CARDMARKET_HOSTS.has(url.hostname.toLowerCase()) || !/\/Products\//i.test(url.pathname)) continue;
      const name = anchor.textContent?.trim();
      if (!name) continue;
      const amountValue = Number(row.querySelector('td.amount')?.getAttribute('data-amount'));
      const expansion = row.querySelector('td.expansion .visually-hidden')?.textContent?.trim() || '';
      wants.push({ name, href: url.toString(), amount: Number.isFinite(amountValue) && amountValue > 0 ? amountValue : 1, expansion });
    }
    return wants;
  }

  function normalizeWantsText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function searchWantsLists(index, query) {
    const terms = normalizeWantsText(query).split(/\s+/).filter(Boolean);
    if (!terms.length || !index || typeof index !== 'object') return [];
    const results = [];
    for (const [listId, list] of Object.entries(index)) {
      if (!list || !Array.isArray(list.wants)) continue;
      for (const want of list.wants) {
        const slug = String(want.href || '').split('?')[0].split('/').pop().replace(/-/g, ' ');
        const searchable = normalizeWantsText(`${want.name || ''} ${slug}`);
        if (terms.every((term) => searchable.includes(term))) results.push({ listId, listName: String(list.name || ''), want });
      }
    }
    return results.sort((left, right) => left.want.name.localeCompare(right.want.name) || left.listName.localeCompare(right.listName));
  }

  function pause(milliseconds) {
    return new Promise((resolve) => root.setTimeout(resolve, milliseconds));
  }

  async function loadWantsSearchIndex(storage = root.chrome?.storage?.local) {
    const stored = await storage?.get?.({ [STORAGE_KEY]: {} });
    const index = stored?.[STORAGE_KEY];
    return index && typeof index === 'object' && !Array.isArray(index) ? index : {};
  }

  async function readAndStoreWantsIndex(storage, options) {
    const index = await readAllWantsLists(options);
    await storage?.set?.({ [STORAGE_KEY]: index });
    return index;
  }

  function createWantsDocumentReader(fetcher = root.fetch?.bind(root), {
    origin = root.location?.origin || 'https://www.cardmarket.com',
    DOMParserCtor = root.DOMParser,
  } = {}) {
    return async (url) => {
      let target;
      try { target = new URL(url, origin); }
      catch { throw new Error('URL de lecture Wants invalide.'); }
      if (target.origin !== origin || !CARDMARKET_HOSTS.has(target.hostname.toLowerCase())) throw new Error('Lecture Cardmarket refusée.');
      if (typeof fetcher !== 'function' || typeof DOMParserCtor !== 'function') throw new Error('Lecture impossible dans ce contexte.');
      const response = await fetcher(target.href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Page Cardmarket indisponible (${response.status || 'erreur'}).`);
      return new DOMParserCtor().parseFromString(await response.text(), 'text/html');
    };
  }

  async function readAllWantsLists({ currentUrl, currentDocument, fetchDocument, onProgress = () => {}, wait = pause, delayMs = 250 } = {}) {
    if (typeof fetchDocument !== 'function') throw new TypeError('Une lecture Cardmarket est requise.');
    const baseUrl = new URL(currentUrl || root.location?.href || '', 'https://www.cardmarket.com');
    if (!CARDMARKET_HOSTS.has(baseUrl.hostname.toLowerCase()) || !isWantsPage(baseUrl.pathname)) throw new Error('Ouvre une page Wants Cardmarket.');
    const basePath = getBasePath(baseUrl.pathname);
    const overviewPath = `${basePath}/Wants`;
    const currentListId = baseUrl.pathname.match(/\/Wants\/(\d+)\/?$/i)?.[1] || null;
    const overviewDocument = currentListId
      ? await fetchDocument(`${baseUrl.origin}${overviewPath}`)
      : currentDocument;
    const lists = parseWantsOverview(overviewDocument, baseUrl.origin);
    if (!lists.length) throw new Error('Aucune liste Wants reconnue sur la page.');

    const index = {};
    for (let position = 0; position < lists.length; position += 1) {
      const list = lists[position];
      const documentRef = currentListId === list.id
        ? currentDocument
        : await fetchDocument(buildWantsListUrl(baseUrl.href, list.id));
      index[list.id] = { name: list.name, count: list.count, wants: parseWantsList(documentRef, baseUrl.origin) };
      onProgress({ done: position + 1, total: lists.length, listName: list.name });
      if (position + 1 < lists.length && delayMs > 0) await wait(delayMs);
    }
    return index;
  }

  function createCell(row, text) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
    return cell;
  }

  function renderResults(container, index, query, baseUrl) {
    container.replaceChildren();
    const results = searchWantsLists(index, query);
    if (!normalizeWantsText(query)) {
      const hint = document.createElement('p');
      hint.className = 'cmu-wants-hint';
      hint.textContent = Object.keys(index || {}).length
        ? 'Saisis un nom de carte pour chercher dans les listes lues.'
        : 'Clique sur « Lire mes listes » pour construire un index local en lecture seule.';
      container.append(hint);
      return;
    }
    const summary = document.createElement('p');
    summary.className = 'cmu-wants-summary';
    summary.textContent = `${results.length} résultat${results.length === 1 ? '' : 's'} dans les listes lues`;
    container.append(summary);
    if (!results.length) return;
    const table = document.createElement('table');
    table.className = 'cmu-wants-results';
    const head = table.createTHead().insertRow();
    for (const title of ['Carte', 'Liste', 'Qté', 'Extension']) {
      const cell = document.createElement('th');
      cell.textContent = title;
      head.append(cell);
    }
    const body = table.createTBody();
    results.slice(0, 200).forEach(({ listId, listName, want }) => {
      const row = body.insertRow();
      const cardCell = row.insertCell();
      const cardLink = document.createElement('a');
      cardLink.href = want.href;
      cardLink.textContent = want.name;
      cardCell.append(cardLink);
      const listCell = row.insertCell();
      const listLink = document.createElement('a');
      listLink.href = buildWantsListUrl(baseUrl, listId) || '#';
      listLink.textContent = listName;
      listCell.append(listLink);
      createCell(row, String(want.amount || 1));
      createCell(row, want.expansion || '');
    });
    container.append(table);
  }

  function injectSearch(settings, { fetcher = root.fetch?.bind(root), storage = root.chrome?.storage?.local } = {}) {
    if (!CardmarketSettings.isFeatureEnabled(settings, 'searchAllWants') || !isWantsPage(root.location?.pathname)) return null;
    if (root.document.querySelector('.cmu-wants-search')) return null;
    const host = root.document.querySelector('#WantsListTable') || root.document.querySelector('main section > .row') || root.document.querySelector('main') || root.document.body;
    if (!host) return null;

    const panel = document.createElement('section');
    panel.className = 'cmu-wants-search';
    panel.setAttribute('aria-label', 'Recherche dans toutes les listes Wants');
    const title = document.createElement('strong');
    title.textContent = 'Rechercher dans mes listes Wants';
    const controls = document.createElement('div');
    controls.className = 'cmu-wants-controls';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Nom de carte, français ou anglais';
    input.setAttribute('aria-label', 'Carte à rechercher dans toutes les listes Wants');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cmu-button';
    button.textContent = 'Lire mes listes';
    const status = document.createElement('output');
    status.className = 'cmu-wants-status';
    status.setAttribute('role', 'status');
    const results = document.createElement('div');
    results.className = 'cmu-wants-results-wrap';
    controls.append(input, button, status);
    panel.append(title, controls, results);
    host.insertAdjacentElement('beforebegin', panel);

    let index = {};
    const render = () => renderResults(results, index, input.value, root.location.href);
    input.addEventListener('input', render);
    button.addEventListener('click', async () => {
      if (!fetcher || !root.DOMParser) { status.textContent = 'Lecture impossible dans ce contexte.'; return; }
      button.disabled = true;
      status.textContent = 'Lecture des listes…';
      const fetchDocument = createWantsDocumentReader(fetcher, { origin: root.location.origin, DOMParserCtor: root.DOMParser });
      try {
        index = await readAndStoreWantsIndex(storage, {
          currentUrl: root.location.href,
          currentDocument: root.document,
          fetchDocument,
          onProgress: ({ done, total }) => { status.textContent = `Lecture des listes ${done}/${total}…`; },
        });
        status.textContent = `${Object.keys(index).length} liste(s) lue(s).`;
        render();
      } catch (error) {
        status.textContent = error?.message || 'La lecture des listes a échoué.';
      } finally {
        button.disabled = false;
      }
    });
    loadWantsSearchIndex(storage).then((storedIndex) => {
      index = storedIndex;
      status.textContent = Object.keys(index).length ? `${Object.keys(index).length} liste(s) en cache local.` : 'La lecture démarre uniquement au clic.';
      render();
    }).catch(() => { status.textContent = 'La recherche reste disponible après lecture des listes.'; render(); });
    return panel;
  }

  const api = { isWantsPage, parseWantsOverview, parseWantsList, normalizeWantsText, searchWantsLists, buildWantsListUrl, readAllWantsLists, loadWantsSearchIndex, readAndStoreWantsIndex, createWantsDocumentReader, injectSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketWantsSearch = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local) {
    CardmarketSettings.loadSettings(root.chrome.storage.local).then((settings) => injectSearch(settings)).catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
