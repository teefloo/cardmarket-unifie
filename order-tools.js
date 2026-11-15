(function (root) {
  const MAX_SEARCH_REQUESTS = 80;
  const RANGE_DAYS = 58;

  function parseIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), 12);
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 10) === value ? date : null;
  }

  function formatIsoDate(date) { return date.toISOString().slice(0, 10); }

  function getDateRangesFromForm(minDate, maxDate, chunkDays = RANGE_DAYS) {
    let start = parseIsoDate(minDate);
    const max = parseIsoDate(maxDate);
    const chunk = Number(chunkDays);
    if (!start || !max || max < start || !Number.isInteger(chunk) || chunk < 1 || chunk > 366) return [];
    const result = [];
    while (start <= max) {
      const end = new Date(Math.min(max.getTime(), start.getTime() + chunk * 86_400_000));
      result.push({ start: formatIsoDate(start), end: formatIsoDate(end), diffDays: Math.round((end - start) / 86_400_000) });
      start = new Date(end.getTime() + 86_400_000);
    }
    return result;
  }

  function normalizeStatuses(statuses) {
    const values = Array.isArray(statuses) ? statuses : String(statuses ?? '').split(',');
    return [...new Set(values.map((value) => String(value || '').trim()).filter((value) => /^\d{1,3}$/.test(value)))];
  }

  function buildOrderSearchRequests({ action, origin, method = 'get', entries = [], minDate, maxDate, statuses = [] } = {}) {
    if (String(method).toLowerCase() !== 'get') return null;
    let base;
    let current;
    try {
      current = new URL(origin);
      base = new URL(action || '', current);
    } catch { return null; }
    if (current.protocol !== 'https:' || !['www.cardmarket.com', 'cardmarket.com'].includes(current.hostname.toLowerCase())) return null;
    if (base.origin !== current.origin || !/\/Orders\/Search\/?$/i.test(base.pathname)) return null;
    const ranges = getDateRangesFromForm(minDate, maxDate);
    if (!ranges.length) return [];
    const selectedStatuses = normalizeStatuses(statuses);
    const statusVariants = selectedStatuses.length ? selectedStatuses : [''];
    if (ranges.length * statusVariants.length > MAX_SEARCH_REQUESTS) return null;
    const formEntries = Array.isArray(entries) ? entries : [];
    const requests = [];
    for (const range of ranges) {
      for (const status of statusVariants) {
        const url = new URL(base);
        const params = new URLSearchParams(url.search);
        for (const [key, value] of formEntries) params.set(String(key), String(value ?? ''));
        params.set('minDate', range.start);
        params.set('maxDate', range.end);
        if (status) params.set('shipmentStatus', status);
        else params.delete('shipmentStatus');
        url.search = params.toString();
        requests.push({ url: url.toString(), method: 'GET', range, status });
      }
    }
    return requests;
  }

  async function fetchOrderSearchBatch(requests, { fetchFn = root.fetch?.bind(root), origin = 'https://www.cardmarket.com', onResult = () => {}, delay = (ms) => new Promise((resolve) => root.setTimeout(resolve, ms)), delayMs = 750 } = {}) {
    const base = new URL(origin);
    if (base.protocol !== 'https:' || !['www.cardmarket.com', 'cardmarket.com'].includes(base.hostname.toLowerCase()) || !Array.isArray(requests) || typeof fetchFn !== 'function') return 0;
    let completed = 0;
    for (const request of requests) {
      let url;
      try { url = new URL(request.url); } catch { continue; }
      if (request.method !== 'GET' || url.origin !== base.origin || !/\/Orders\/Search\/?$/i.test(url.pathname)) continue;
      if (completed && delayMs > 0) await delay(delayMs);
      try {
        const response = await fetchFn(url.toString(), { method: 'GET', credentials: 'same-origin', redirect: 'follow' });
        const html = response?.ok ? await response.text() : null;
        await onResult(request, html, response?.ok ? null : `Réponse Cardmarket ${response?.status || 'indisponible'}`);
      } catch (error) {
        await onResult(request, null, `Lecture impossible : ${String(error?.message || error)}`);
      }
      completed += 1;
    }
    return completed;
  }

  function getDateShortcutRange(kind, now = new Date(), currentStart = '', currentEnd = '') {
    const today = parseIsoDate(formatIsoDate(now));
    if (!today) return null;
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const day = today.getUTCDate();
    const make = (year, month, date) => new Date(Date.UTC(year, month, date, 12));
    if (kind === 'thisMonth') return { start: formatIsoDate(make(y, m, 1)), end: formatIsoDate(today) };
    if (kind === 'lastMonth') return { start: formatIsoDate(make(y, m - 1, 1)), end: formatIsoDate(make(y, m, 0)) };
    if (kind === 'thisYear') return { start: formatIsoDate(make(y, 0, 1)), end: formatIsoDate(today) };
    if (kind === 'lastYear') return { start: formatIsoDate(make(y - 1, 0, 1)), end: formatIsoDate(make(y, 0, 0)) };
    const from = parseIsoDate(currentStart);
    const to = parseIsoDate(currentEnd);
    if (!from || !to || to < from) return null;
    const duration = to.getTime() - from.getTime();
    if (kind === 'previous') {
      const end = new Date(from);
      const start = new Date(from.getTime() - duration);
      return { start: formatIsoDate(start), end: formatIsoDate(end) };
    }
    if (kind === 'next') {
      const start = new Date(to);
      const end = new Date(Math.min(today.getTime(), to.getTime() + duration));
      return start > today ? null : { start: formatIsoDate(start), end: formatIsoDate(end) };
    }
    return null;
  }

  function installDateNavigation(form, documentRef, nowFn = () => new Date()) {
    const from = form.querySelector('input#minDate');
    const to = form.querySelector('input#maxDate');
    if (!from || !to || form.querySelector('.cmu-date-nav')) return null;
    const container = documentRef.createElement('div');
    container.className = 'cmu-date-nav';
    const labels = [['previous', '← Période précédente'], ['lastYear', 'Année précédente'], ['thisYear', 'Cette année'], ['lastMonth', 'Mois précédent'], ['thisMonth', 'Ce mois'], ['next', 'Période suivante →']];
    for (const [kind, label] of labels) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'cmu-date-shortcut';
      button.textContent = label;
      button.addEventListener('click', () => {
        const range = getDateShortcutRange(kind, nowFn(), from.value, to.value);
        if (!range) return;
        from.value = range.start;
        to.value = range.end;
        for (const input of [from, to]) input.dispatchEvent?.(new root.Event('change', { bubbles: true }));
      });
      container.append(button);
    }
    const reference = from.closest?.('.form-group') || from.parentElement;
    reference?.append(container);
    return container;
  }

  function isAllowedTrackingAction(action, origin = root.location?.origin || 'https://www.cardmarket.com') {
    try {
      const base = new URL(origin);
      const url = new URL(action, base);
      return base.protocol === 'https:'
        && ['www.cardmarket.com', 'cardmarket.com'].includes(base.hostname.toLowerCase())
        && url.origin === base.origin
        && /(?:^|\/)Shipment_SetTrackingNumber(?:\/|$)/i.test(url.pathname);
    } catch { return false; }
  }

  function mountTrackingPrompt(documentRef, modalBody, trackingForm, trackingInput, { confirmFn = root.confirm?.bind(root) || (() => false) } = {}) {
    if (!modalBody || !trackingForm || !trackingInput || modalBody.querySelector?.('.cmu-tracking-prompt')) return false;
    const wrapper = documentRef.createElement('section');
    wrapper.className = 'cmu-tracking-prompt';
    const label = documentRef.createElement('label');
    label.className = 'cmu-tracking-label';
    label.textContent = 'Numéro de suivi de cet envoi';
    const input = documentRef.createElement('input');
    input.type = 'text';
    input.maxLength = 100;
    input.autocomplete = 'off';
    input.className = 'form-control form-control-sm cmu-tracking-number';
    input.placeholder = 'Numéro de suivi';
    label.append(input);
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'button-primary cmu-tracking-submit';
    button.textContent = 'Enregistrer le suivi';
    const status = documentRef.createElement('p');
    status.className = 'cmu-tracking-status';
    status.setAttribute('role', 'status');
    wrapper.append(label, button, status);
    modalBody.append(wrapper);
    button.addEventListener('click', (event) => {
      event.preventDefault?.();
      const trackingNumber = input.value.trim();
      if (!trackingNumber || trackingNumber.length > 100) {
        status.textContent = 'Saisis un numéro de suivi valide.';
        return;
      }
      if (!confirmFn(`Envoyer le numéro de suivi « ${trackingNumber} » à Cardmarket ?`)) {
        status.textContent = 'Envoi annulé.';
        return;
      }
      if (typeof trackingForm.requestSubmit !== 'function') {
        status.textContent = 'Le formulaire Cardmarket ne peut pas être envoyé depuis cette page.';
        return;
      }
      trackingInput.value = trackingNumber;
      try {
        trackingForm.requestSubmit();
        button.disabled = true;
        status.textContent = 'Numéro envoyé à Cardmarket.';
      } catch {
        status.textContent = 'Cardmarket a refusé la soumission; vérifie le formulaire.';
      }
    });
    return true;
  }

  function installTrackingCodePrompt(settings, {
    documentRef = root.document,
    pathname = root.location?.pathname || '',
    origin = root.location?.origin || '',
    MutationObserverClass = root.MutationObserver,
    setTimeoutFn = root.setTimeout?.bind(root) || setTimeout,
    confirmFn = root.confirm?.bind(root) || (() => false),
  } = {}) {
    if (!root.CardmarketSettings?.isFeatureEnabled?.(settings, 'showTrackingCodePrompt') || !String(pathname).toLowerCase().includes('/orders/')) return { installed: false };
    const shippingInfo = documentRef?.querySelector?.('a[href*="/ShippingCosts"]')?.closest?.('dd');
    if (!shippingInfo?.querySelector?.('.text-success')) return { installed: false };
    const confirmShipment = documentRef.querySelector('form[action*="/Shipment_ConfirmShipment"] input[type="submit"]');
    const trackingForm = documentRef.querySelector('form[action*="/Shipment_SetTrackingNumber"]');
    const action = trackingForm?.getAttribute?.('action');
    const method = String(trackingForm?.getAttribute?.('method') || '').toLowerCase();
    const trackingInput = trackingForm?.querySelector?.('input[name="trackingNumber"]');
    if (!confirmShipment || !trackingInput || trackingInput.value || method !== 'post' || !isAllowedTrackingAction(action, origin)) return { installed: false };
    let observer = null;
    let timeout = null;
    const attach = () => {
      const modal = documentRef.querySelector('#modal[style*="block"], #modal.show, #modal[aria-hidden="false"]');
      const body = modal?.querySelector?.('.modal-body');
      if (!body) return false;
      const installed = mountTrackingPrompt(documentRef, body, trackingForm, trackingInput, { confirmFn });
      if (installed) {
        observer?.disconnect?.();
        if (timeout !== null) root.clearTimeout?.(timeout);
      }
      return installed;
    };
    const onConfirm = () => {
      if (attach()) return;
      if (MutationObserverClass && documentRef.body) {
        observer = new MutationObserverClass(attach);
        observer.observe(documentRef.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'aria-hidden'] });
        timeout = setTimeoutFn(() => observer?.disconnect?.(), 10_000);
      }
    };
    confirmShipment.addEventListener('click', onConfirm);
    return { installed: true, onConfirm, disconnect() { observer?.disconnect?.(); if (timeout !== null) root.clearTimeout?.(timeout); } };
  }

  function renderOrderSearchResult(documentRef, container, request, html, error, DOMParserClass = root.DOMParser, origin = root.location?.origin || 'https://www.cardmarket.com') {
    const section = documentRef.createElement('section');
    section.className = 'cmu-order-search-range';
    const heading = documentRef.createElement('h3');
    heading.textContent = `${request.range.start} – ${request.range.end}${request.status ? ` · statut ${request.status}` : ''}`;
    section.append(heading);
    if (error || typeof html !== 'string' || typeof DOMParserClass !== 'function') {
      const status = documentRef.createElement('p');
      status.textContent = error || 'Résultat Cardmarket illisible.';
      status.setAttribute('role', 'status');
      section.append(status);
      container.append(section);
      return false;
    }
    const parsed = new DOMParserClass().parseFromString(html, 'text/html');
    const sourceMain = parsed.querySelector('main');
    if (!sourceMain) {
      const status = documentRef.createElement('p');
      status.textContent = 'Cardmarket n’a pas renvoyé de zone de résultats.';
      section.append(status);
      container.append(section);
      return false;
    }
    const content = sourceMain.cloneNode(true);
    content.querySelectorAll('script,style,form,iframe,object,embed,button,input,select,textarea,link,meta').forEach((node) => node.remove());
    content.querySelectorAll('*').forEach((node) => {
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || attribute.name === 'srcdoc' || attribute.name === 'id') node.removeAttribute(attribute.name);
        if (attribute.name === 'href') {
          try {
            const target = new URL(attribute.value, origin);
            if (target.origin !== origin || target.protocol !== 'https:') node.removeAttribute('href');
            else { node.setAttribute('href', target.href); node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
          } catch { node.removeAttribute('href'); }
        }
        if (attribute.name === 'src') {
          try { if (new URL(attribute.value, origin).origin !== origin) node.removeAttribute('src'); }
          catch { node.removeAttribute('src'); }
        }
      }
    });
    section.append(content);
    container.append(section);
    return true;
  }

  function installExtendedOrderSearch(settings, {
    documentRef = root.document,
    locationRef = root.location || {},
    fetchFn = root.fetch?.bind(root),
    FormDataClass = root.FormData,
    DOMParserClass = root.DOMParser,
    nowFn = () => new Date(),
    delay,
  } = {}) {
    if (!root.CardmarketSettings?.isFeatureEnabled?.(settings, 'searchExtendedOrders') || !/\/Orders\/Search\/?$/i.test(String(locationRef.pathname || ''))) return { installed: false };
    const form = documentRef?.querySelector?.('form#OrderSearchForm');
    if (!form) return { installed: false };
    installDateNavigation(form, documentRef, nowFn);
    let output = documentRef.querySelector('.cmu-order-search-results');
    if (!output) {
      output = documentRef.createElement('div');
      output.className = 'cmu-order-search-results';
      form.parentNode?.insertBefore?.(output, form.nextSibling);
    }
    const submit = async (event) => {
      if (typeof FormDataClass !== 'function') return;
      let formData;
      try { formData = new FormDataClass(form); } catch { return; }
      const entries = [...formData.entries()];
      const minDate = form.querySelector('input#minDate')?.value || '';
      const maxDate = form.querySelector('input#maxDate')?.value || '';
      const ranges = getDateRangesFromForm(minDate, maxDate);
      if (!ranges.length) return;
      let statuses = new URLSearchParams(locationRef.search || '').get('ehcmShipmentStatus') || form.querySelector('#shipmentStatus')?.value || '';
      statuses = normalizeStatuses(statuses);
      if (ranges.length === 1 && statuses.length <= 1) return;
      const requestCount = ranges.length * Math.max(1, statuses.length);
      if (requestCount > MAX_SEARCH_REQUESTS) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        output.textContent = `Cette période créerait ${requestCount} requêtes. Réduis la période ou les statuts.`;
        return;
      }
      const action = form.getAttribute('action') || locationRef.href || '';
      const requests = buildOrderSearchRequests({ action, origin: locationRef.origin, method: form.getAttribute('method') || 'get', entries, minDate, maxDate, statuses });
      if (!requests) return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      output.replaceChildren?.();
      const trigger = form.querySelector('button[type="submit"]');
      if (trigger) trigger.disabled = true;
      const status = documentRef.createElement('p');
      status.className = 'cmu-order-search-status';
      status.setAttribute('role', 'status');
      status.textContent = `Recherche de ${requests.length} périodes…`;
      output.append(status);
      const completed = await fetchOrderSearchBatch(requests, {
        fetchFn,
        origin: locationRef.origin,
        delay,
        onResult(request, html, error) { renderOrderSearchResult(documentRef, output, request, html, error, DOMParserClass, locationRef.origin); },
      });
      status.textContent = `Recherches terminées : ${completed}/${requests.length}`;
      if (trigger) trigger.disabled = false;
    };
    form.addEventListener('submit', submit, true);
    return { installed: true, form, output, submit };
  }

  const api = {
    MAX_SEARCH_REQUESTS, RANGE_DAYS, getDateRangesFromForm, normalizeStatuses,
    buildOrderSearchRequests, fetchOrderSearchBatch, getDateShortcutRange, installDateNavigation,
    isAllowedTrackingAction, mountTrackingPrompt, installTrackingCodePrompt,
    renderOrderSearchResult, installExtendedOrderSearch,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketOrderTools = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.CardmarketSettings) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local).then((settings) => {
      installExtendedOrderSearch(settings);
      installTrackingCodePrompt(settings);
    }).catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
