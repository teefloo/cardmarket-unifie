(function (root) {
  const CARDMARKET_HOSTS = new Set(['www.cardmarket.com', 'cardmarket.com']);
  const GAMES = new Set(['Magic', 'YuGiOh', 'Pokemon', 'OnePiece', 'Lorcana', 'Riftbound']);
  const PRODUCT_ANCHORS = '.row a.card[href*="/Singles/"], .row .col a[href*="/Singles/"]:not([class])';

  function getSafeOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && CARDMARKET_HOSTS.has(url.hostname.toLowerCase()) ? url.origin : null;
    } catch { return null; }
  }

  function validateWantEditUrl(href, origin = root.location?.origin || '') {
    const safeOrigin = getSafeOrigin(origin);
    if (!safeOrigin) return null;
    try {
      const target = new URL(href, safeOrigin);
      if (target.origin !== safeOrigin || !CARDMARKET_HOSTS.has(target.hostname.toLowerCase())
        || !/\/Wants\/\d+\/?$/i.test(target.pathname) || target.username || target.password) return null;
      return target.href;
    } catch { return null; }
  }

  function validateWantEditActionUrl(action, origin = root.location?.origin || '') {
    const safeOrigin = getSafeOrigin(origin);
    if (!safeOrigin) return null;
    try {
      const target = new URL(action, safeOrigin);
      if (target.origin !== safeOrigin || !CARDMARKET_HOSTS.has(target.hostname.toLowerCase())
        || !/\/WantsList_EditWant\/?$/i.test(target.pathname) || target.username || target.password) return null;
      return target.href;
    } catch { return null; }
  }

  function validateAddWantsActionUrl(action, origin = root.location?.origin || '') {
    const safeOrigin = getSafeOrigin(origin);
    if (!safeOrigin) return null;
    try {
      const target = new URL(action, safeOrigin);
      const ajaxAction = target.pathname.match(/\/AjaxAction\/([A-Za-z0-9_-]+)\/?$/i)?.[1] || '';
      const allowedPath = /\/WantsList_AddWants?\/?$/i.test(target.pathname)
        || (/\/AjaxAction\/[A-Za-z0-9_-]+\/?$/i.test(target.pathname) && /add.*want|want.*add/i.test(ajaxAction));
      if (target.origin !== safeOrigin || !CARDMARKET_HOSTS.has(target.hostname.toLowerCase())
        || !allowedPath || target.username || target.password || target.hash) return null;
      return target.href;
    } catch { return null; }
  }

  function getProductIdFromImageUrl(imageUrl, origin = root.location?.origin || 'https://www.cardmarket.com') {
    try {
      const image = new URL(imageUrl, origin);
      if (image.protocol !== 'https:' || image.hostname.toLowerCase() !== 'product-images.s3.cardmarket.com') return null;
      const file = image.pathname.split('/').at(-1) || '';
      const match = file.match(/^(\d+)\.(?:jpe?g|png|webp)$/i);
      return match ? match[1] : null;
    } catch { return null; }
  }

  function validateProductUrl(value, origin = root.location?.origin || '') {
    const safeOrigin = getSafeOrigin(origin);
    if (!safeOrigin) return null;
    try {
      const target = new URL(value, safeOrigin);
      const segments = target.pathname.split('/').filter(Boolean);
      const productsIndex = segments.findIndex((segment) => segment.toLowerCase() === 'products');
      const gameIndex = productsIndex - 1;
      if (target.origin !== safeOrigin || target.username || target.password || productsIndex < 2
        || segments[productsIndex + 1]?.toLowerCase() !== 'singles'
        || segments.length < productsIndex + 4 || !GAMES.has(segments[gameIndex])) return null;
      return target.href;
    } catch { return null; }
  }

  function getBulkProductCards(documentRef = root.document, origin = root.location?.origin || '') {
    if (!documentRef?.querySelectorAll || !getSafeOrigin(origin)) return [];
    const found = new Map();
    for (const anchor of documentRef.querySelectorAll(PRODUCT_ANCHORS)) {
      const productUrl = validateProductUrl(anchor.getAttribute?.('href') || anchor.href || '', origin);
      if (!productUrl) continue;
      const image = anchor.querySelector?.('img');
      const imageUrl = image?.getAttribute?.('data-echo') || image?.getAttribute?.('data-src') || image?.getAttribute?.('src') || image?.src;
      const id = getProductIdFromImageUrl(imageUrl, origin);
      if (!id || found.has(id)) continue;
      const name = anchor.querySelector?.('h2')?.textContent?.trim() || anchor.textContent?.replace(/\s+/g, ' ').trim() || id;
      found.set(id, { id, name, url: productUrl, anchor, container: anchor.parentElement || anchor });
    }
    return [...found.values()];
  }

  function getFormAttribute(form, name) {
    if (typeof form?.getAttribute === 'function') return form.getAttribute(name) || '';
    if (name === 'data-ajax-action') return form?.dataAjaxAction || '';
    return form?.[name] || '';
  }

  function wait(milliseconds) {
    return new Promise((resolve) => root.setTimeout(resolve, milliseconds));
  }

  function buildAddWantsAction(form, productUrl, origin) {
    const explicitAction = getFormAttribute(form, 'action');
    if (explicitAction) return validateAddWantsActionUrl(explicitAction, origin);
    const ajaxAction = getFormAttribute(form, 'data-ajax-action');
    if (!/^[A-Za-z0-9_-]+$/.test(ajaxAction)) return null;
    try {
      const product = new URL(productUrl);
      const segments = product.pathname.split('/').filter(Boolean);
      const productsIndex = segments.findIndex((segment) => segment.toLowerCase() === 'products');
      const locale = segments[0];
      const game = segments[productsIndex - 1];
      if (!/^[a-z]{2}$/i.test(locale) || !GAMES.has(game)) return null;
      return validateAddWantsActionUrl(`${product.origin}/${locale}/${game}/AjaxAction/${ajaxAction}`, origin);
    } catch { return null; }
  }

  function parseRemoteForm(html, selector, Parser = root.DOMParser) {
    if (typeof Parser !== 'function') return null;
    const documentRef = new Parser().parseFromString(String(html || ''), 'text/html');
    return documentRef.querySelector(selector);
  }

  function cloneFormData(source, FormDataCtor) {
    if (typeof FormDataCtor !== 'function' || typeof source?.entries !== 'function') throw new Error('Données de formulaire invalides.');
    const clone = new FormDataCtor();
    for (const [key, value] of source.entries()) clone.append(key, value);
    return clone;
  }

  async function prepareBulkWantForm({
    productUrl, origin = root.location?.origin || '', fetcher = root.fetch?.bind(root),
    parseForm = (html) => parseRemoteForm(html, 'form#AddWantsForm'), FormDataCtor = root.FormData,
  } = {}) {
    const safeOrigin = getSafeOrigin(origin);
    const safeProductUrl = validateProductUrl(productUrl, origin);
    if (!safeOrigin || !safeProductUrl) throw new Error('Fiche produit Cardmarket refusée.');
    if (typeof fetcher !== 'function' || typeof FormDataCtor !== 'function') throw new Error('Préparation Wants indisponible.');
    const response = await fetcher(safeProductUrl, { credentials: 'same-origin' });
    if (!response?.ok) throw new Error(`Fiche Cardmarket indisponible (${response?.status || 'erreur'}).`);
    const form = parseForm(await response.text());
    if (!form) throw new Error('Formulaire AddWantsForm absent de la fiche.');
    const actionUrl = buildAddWantsAction(form, safeProductUrl, safeOrigin);
    if (!actionUrl) throw new Error('Action Cardmarket refusée.');
    const baseData = new FormDataCtor(form);
    return { actionUrl, baseData, form, listChoices: getWantListChoices(form) };
  }

  function getWantListChoices(form) {
    const select = form?.querySelector?.('select[name="idWantsList"]');
    if (!select) return [];
    return [...(select.options || [])]
      .filter((option) => /^\d+$/.test(String(option.value || '')))
      .map((option) => ({ id: String(option.value), name: String(option.textContent || '').trim() }));
  }

  async function toggleWantEmailAlert({
    href, origin = root.location?.origin || '', label = 'cette carte',
    fetcher = root.fetch?.bind(root), parseForm = (html) => parseRemoteForm(html, 'form[action*="WantsList_EditWant"]'),
    FormDataCtor = root.FormData, confirmAction = (message) => typeof root.confirm === 'function' && root.confirm(message),
  } = {}) {
    const safeOrigin = getSafeOrigin(origin);
    const editUrl = validateWantEditUrl(href, origin);
    if (!safeOrigin || !editUrl) throw new Error('Lien Wants Cardmarket refusé.');
    if (typeof fetcher !== 'function' || typeof FormDataCtor !== 'function') throw new Error('Action Wants indisponible.');
    const getResponse = await fetcher(editUrl, { credentials: 'same-origin' });
    if (!getResponse?.ok) throw new Error(`Formulaire Wants indisponible (${getResponse?.status || 'erreur'}).`);
    const form = parseForm(await getResponse.text());
    if (!form) throw new Error('Formulaire WantsList_EditWant absent.');
    const actionUrl = validateWantEditActionUrl(getFormAttribute(form, 'action'), safeOrigin);
    if (!actionUrl) throw new Error('Action Wants Cardmarket refusée.');
    const formData = new FormDataCtor(form);
    const enabled = !formData.has('mailAlert');
    const verb = enabled ? 'activer' : 'désactiver';
    if (typeof confirmAction !== 'function' || !(await confirmAction(`Confirmer : ${verb} l’alerte e-mail pour ${label} ?`))) {
      return { ok: false, cancelled: true, enabled };
    }
    if (enabled) formData.append('mailAlert', '1');
    else formData.delete('mailAlert');
    const response = await fetcher(actionUrl, { method: 'POST', credentials: 'same-origin', redirect: 'manual', body: formData });
    if (!response || !(response.ok || (response.status >= 300 && response.status < 400))) {
      throw new Error(`Échec de mise à jour de l’alerte (${response?.status || 'erreur'}).`);
    }
    return { ok: true, enabled };
  }

  async function submitBulkWants({
    prepared, products, listId, listName = '', origin = root.location?.origin || '',
    fetcher = root.fetch?.bind(root), FormDataCtor = root.FormData,
    confirmAction = (message) => typeof root.confirm === 'function' && root.confirm(message), onProgress = () => {}, wait: waitFor = wait,
  } = {}) {
    const total = Array.isArray(products) ? products.length : 0;
    const actionUrl = validateAddWantsActionUrl(prepared?.actionUrl, origin);
    const productIds = [...new Set((Array.isArray(products) ? products : []).map((product) => String(product?.id || '')) )];
    if (!actionUrl || !prepared?.baseData || !/^\d+$/.test(String(listId || ''))
      || !productIds.length || productIds.some((id) => !/^\d+$/.test(id))) {
      return { ok: false, completed: 0, total, error: 'Action Cardmarket refusée.' };
    }
    if (Array.isArray(prepared.listChoices) && prepared.listChoices.length
      && !prepared.listChoices.some((choice) => String(choice.id) === String(listId))) {
      return { ok: false, completed: 0, total: productIds.length, error: 'Liste Wants refusée.' };
    }
    if (typeof fetcher !== 'function' || typeof FormDataCtor !== 'function') {
      return { ok: false, completed: 0, total, error: 'Action Wants indisponible.' };
    }
    const safeName = String(listName || 'la liste sélectionnée').replace(/[\r\n]+/g, ' ').trim();
    if (typeof confirmAction !== 'function' || !(await confirmAction(`Confirmer l’ajout de ${productIds.length} carte(s) à « ${safeName} » ?`))) {
      return { ok: false, cancelled: true, completed: 0, total: productIds.length };
    }
    let completed = 0;
    for (const idProduct of productIds) {
      const body = cloneFormData(prepared.baseData, FormDataCtor);
      body.delete('idMetacard');
      body.set('idWantsList', String(listId));
      body.set('idProduct', idProduct);
      try {
        const response = await fetcher(actionUrl, { method: 'POST', credentials: 'same-origin', body });
        if (!response?.ok) return { ok: false, completed, total: productIds.length, status: response?.status || 0 };
        completed += 1;
        onProgress({ completed, total: productIds.length, productId: idProduct });
        if (completed < productIds.length) await waitFor(3000);
      } catch (error) {
        return { ok: false, completed, total: productIds.length, error: String(error?.message || 'Échec réseau.') };
      }
    }
    return { ok: true, completed, total: productIds.length };
  }

  function createAlarmButton(documentRef, target, row, origin, { fetcher, confirmAction } = {}) {
    if (target.querySelector?.('.cmu-want-alarm-button')) return null;
    const editLink = row?.querySelector?.('a[href*="/Wants/"]');
    const href = editLink?.getAttribute?.('href') || editLink?.href;
    if (!validateWantEditUrl(href, origin)) return null;
    const buyPrice = row?.querySelector?.('.buyPrice');
    if (!buyPrice || /\bN\/?A\b/i.test(buyPrice.textContent || buyPrice.innerText || '')) return null;
    const label = row?.querySelector?.('.name a, td.name a, a[href*="/Products/"]')?.textContent?.trim() || 'cette carte';
    const button = documentRef.createElement('button');
    button.type = 'button'; button.className = 'cmu-button cmu-want-alarm-button';
    button.textContent = 'Modifier l’alerte e-mail';
    button.setAttribute('aria-label', `Modifier l’alerte e-mail pour ${label}`);
    const status = documentRef.createElement('small'); status.className = 'cmu-want-alarm-status'; status.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async () => {
      button.disabled = true; status.textContent = 'Lecture de l’alerte…';
      try {
        const result = await toggleWantEmailAlert({ href, origin, label, fetcher, confirmAction });
        status.textContent = result.cancelled ? 'Action annulée.' : `Alerte e-mail ${result.enabled ? 'activée' : 'désactivée'}.`;
      } catch (error) { status.textContent = String(error?.message || 'Échec de l’alerte.'); }
      finally { button.disabled = false; }
    });
    target.append(button, status);
    return button;
  }

  function installAlarmButtons(documentRef, origin, options = {}) {
    const buttons = [];
    for (const target of documentRef.querySelectorAll('td.mailAlert')) {
      const row = target.closest?.('tr');
      const button = createAlarmButton(documentRef, target, row, origin, options);
      if (button) buttons.push(button);
    }
    for (const want of documentRef.querySelectorAll('#MobileWantsList div[id^="Want"]')) {
      const alarmValue = want.querySelector?.('dd:last-child');
      const buyPrice = alarmValue?.previousElementSibling;
      const row = {
        querySelector(selector) {
          if (selector === '.buyPrice') return buyPrice;
          if (selector === 'a[href*="/Wants/"]') return want.querySelector?.('a[href*="/Wants/"]');
          if (selector === '.name a, td.name a, a[href*="/Products/"]') return want.querySelector?.('a[href*="/Products/"]');
          return null;
        },
      };
      const button = alarmValue && createAlarmButton(documentRef, alarmValue, row, origin, options);
      if (button) buttons.push(button);
    }
    return buttons;
  }

  function installBulkWants(documentRef, origin, options = {}) {
    const cards = getBulkProductCards(documentRef, origin);
    if (!cards.length || documentRef.querySelector('.cmu-bulk-wants-panel')) return { cards, checkboxes: [], panel: null };
    const panel = documentRef.createElement('section');
    panel.className = 'cmu-bulk-wants-panel';
    panel.setAttribute('aria-label', 'Ajout groupé à une liste Wants');
    const title = documentRef.createElement('strong'); title.textContent = 'Sélection multiple pour Wants';
    const count = documentRef.createElement('span'); count.className = 'cmu-bulk-wants-count'; count.textContent = '0 sélectionnée';
    const prepare = documentRef.createElement('button'); prepare.type = 'button'; prepare.className = 'cmu-button'; prepare.textContent = 'Préparer l’ajout'; prepare.disabled = true;
    const status = documentRef.createElement('output'); status.className = 'cmu-bulk-wants-status'; status.setAttribute('role', 'status');
    const list = documentRef.createElement('select'); list.className = 'cmu-bulk-wants-list'; list.setAttribute('aria-label', 'Liste Wants de destination'); list.hidden = true;
    const submit = documentRef.createElement('button'); submit.type = 'button'; submit.className = 'cmu-button cmu-bulk-wants-submit'; submit.textContent = 'Confirmer l’ajout'; submit.hidden = true;
    panel.append(title, count, prepare, list, submit, status);
    const host = documentRef.querySelector('.filter-form') || documentRef.querySelector('.article-header') || documentRef.querySelector('main') || documentRef.body;
    host?.insertAdjacentElement?.('beforebegin', panel) || host?.prepend?.(panel);

    const selected = new Map();
    const checkboxes = [];
    for (const product of cards) {
      const checkbox = documentRef.createElement('input');
      checkbox.type = 'checkbox'; checkbox.className = 'cmu-bulk-wants-checkbox';
      checkbox.setAttribute('aria-label', `Sélectionner ${product.name} pour Wants`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.set(product.id, product); else selected.delete(product.id);
        count.textContent = `${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}`;
        prepare.disabled = selected.size === 0;
        if (!selected.size) { list.hidden = true; submit.hidden = true; }
      });
      const label = documentRef.createElement('label'); label.className = 'cmu-bulk-wants-choice';
      label.append(checkbox, documentRef.createTextNode(' Ajouter à Wants'));
      if (product.container && product.container !== product.anchor) product.container.prepend?.(label);
      checkboxes.push(checkbox);
    }

    let prepared = null;
    prepare.addEventListener('click', async () => {
      if (!selected.size) return;
      prepare.disabled = true; status.textContent = 'Lecture du formulaire Cardmarket…';
      try {
        prepared = await prepareBulkWantForm({ productUrl: selected.values().next().value.url, origin, ...options });
        const choices = getWantListChoices(prepared.form);
        if (!choices.length) throw new Error('Aucune liste Wants reconnue dans le formulaire.');
        list.replaceChildren();
        for (const choice of choices) { const option = documentRef.createElement('option'); option.value = choice.id; option.textContent = choice.name || `Liste ${choice.id}`; list.append(option); }
        if (!list.value && choices[0]) list.value = choices[0].id;
        list.hidden = false; submit.hidden = false; status.textContent = `${selected.size} carte(s) prêtes. Choisis la liste puis confirme l’ajout.`;
      } catch (error) { status.textContent = String(error?.message || 'Préparation Wants impossible.'); }
      finally { prepare.disabled = selected.size === 0; }
    });

    submit.addEventListener('click', async () => {
      if (!prepared || !selected.size || !list.value) return;
      submit.disabled = true; prepare.disabled = true; list.disabled = true;
      const products = [...selected.values()];
      const listName = list.selectedOptions?.[0]?.textContent || list.options?.[list.selectedIndex]?.textContent || '';
      const result = await submitBulkWants({
        prepared, products, listId: list.value, listName, origin,
        fetcher: options.fetcher, FormDataCtor: options.FormDataCtor,
        confirmAction: options.confirmAction,
        onProgress: ({ completed, total }) => { status.textContent = `Ajout en cours : ${completed}/${total}…`; },
      });
      status.textContent = result.ok ? `${result.completed} carte(s) ajoutée(s) à « ${listName} ».`
        : result.cancelled ? 'Ajout annulé; aucune carte n’a été envoyée.'
          : `${result.completed}/${result.total} ajoutée(s); arrêt sans nouvelle tentative${result.status ? ` (HTTP ${result.status})` : ''}${result.error ? ` : ${result.error}` : ''}.`;
      submit.disabled = false; prepare.disabled = selected.size === 0; list.disabled = false;
      if (result.ok || (!result.cancelled && (result.status || result.error))) {
        selected.clear();
        checkboxes.forEach((checkbox) => { checkbox.checked = false; });
        count.textContent = '0 sélectionnée'; prepare.disabled = true; list.hidden = true; submit.hidden = true; prepared = null;
        if (!result.ok) status.textContent += ' Sélection vidée pour éviter un renvoi; vérifie Wants avant de recommencer.';
      }
    });
    return { cards, checkboxes, panel, selected };
  }

  function installWantsActions(settings, {
    documentRef = root.document, pathname = root.location?.pathname || '', origin = root.location?.origin || '',
    fetcher = root.fetch?.bind(root), FormDataCtor = root.FormData, confirmAction = (message) => typeof root.confirm === 'function' && root.confirm(message),
    MutationObserverClass = root.MutationObserver,
  } = {}) {
    const settingsApi = root.CardmarketSettings;
    if (!settingsApi?.isFeatureEnabled || settings?.enabled === false || !documentRef?.body) return { alarms: [], bulk: null, observer: null };
    const alarmEnabled = settingsApi.isFeatureEnabled(settings, 'showWantAlarmActions');
    const bulkEnabled = settingsApi.isFeatureEnabled(settings, 'showBulkWantActions');
    const isWants = /\/Wants(?:\/|$)/i.test(pathname);
    const isProducts = /\/Products\//i.test(pathname) && !/\/Products\/(?:Search|Results)(?:\/|$)/i.test(pathname);
    const actionOptions = { fetcher, FormDataCtor, confirmAction };
    const alarms = isWants && alarmEnabled ? installAlarmButtons(documentRef, origin, actionOptions) : [];
    const bulk = isProducts && bulkEnabled ? installBulkWants(documentRef, origin, actionOptions) : null;
    let observer = null;
    if (MutationObserverClass && (alarms.length || bulk?.cards.length)) {
      observer = new MutationObserverClass(() => {
        if (isWants && alarmEnabled) installAlarmButtons(documentRef, origin, actionOptions);
      });
      observer.observe(documentRef.body, { childList: true, subtree: true });
    }
    return { alarms, bulk, observer };
  }

  const api = {
    validateWantEditUrl, validateWantEditActionUrl, validateAddWantsActionUrl, getProductIdFromImageUrl,
    validateProductUrl, getBulkProductCards, buildAddWantsAction, getWantListChoices, prepareBulkWantForm, cloneFormData,
    toggleWantEmailAlert, submitBulkWants, installAlarmButtons, installBulkWants, installWantsActions,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketWantsActions = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local)
      .then((settings) => installWantsActions(settings))
      .catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
