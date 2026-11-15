(function (root) {
  const CART_CACHE_KEY = 'cmuShoppingCartProductIndex';
  const recent = (entry, now, days) => Number(entry?.purchasedAt) >= now - days * 86400000 && Number(entry?.purchasedAt) <= now;

  function getCartFingerprint(documentRef) {
    const badge = String(documentRef?.querySelector?.('#cart .main-nav-badge')?.textContent || '').trim();
    const count = Number.parseInt(badge, 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    const total = String(documentRef.querySelector('#cart .small, #cart .text-success')?.textContent || '').replace(/\s+/g, ' ').trim();
    return `${count}|${total}`;
  }

  function parseCartProducts(documentRef) {
    const rows = documentRef?.querySelectorAll?.('section.shipment-block table.product-table tbody tr[data-product-id], table.product-table tbody tr[data-product-id]') || [];
    const products = Object.create(null);
    for (const row of rows) {
      const id = String(row.dataset?.productId || '').trim();
      if (!/^\d+$/.test(id)) continue;
      const amountField = row.querySelector?.('input[name*="amount" i], input[name*="quantity" i]');
      const amount = Number(row.dataset?.amount || amountField?.value || 1);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      products[id] = (products[id] || 0) + amount;
    }
    return { ...products };
  }

  function shoppingCartUrl(origin, pathname) {
    let base;
    try { base = new URL(origin); } catch { return null; }
    if (base.protocol !== 'https:' || !['www.cardmarket.com', 'cardmarket.com'].includes(base.hostname.toLowerCase())) return null;
    const parts = String(pathname || '').split('/').filter(Boolean);
    const locale = /^[a-z]{2}$/i.test(parts[0] || '') ? parts[0] : 'en';
    const game = /^[A-Za-z0-9-]+$/.test(parts[1] || '') ? parts[1] : 'Magic';
    return new URL(`/${locale}/${game}/ShoppingCart`, base.origin).toString();
  }

  async function readCartProducts({ documentRef, storage, fetcher = root.fetch, DOMParserClass = root.DOMParser, origin = root.location?.origin, pathname = root.location?.pathname } = {}) {
    const fingerprint = getCartFingerprint(documentRef);
    if (!fingerprint) return {};
    if (!storage?.get || !storage?.set || typeof fetcher !== 'function' || typeof DOMParserClass !== 'function') return {};
    let stored;
    try { stored = (await storage.get({ [CART_CACHE_KEY]: null }))[CART_CACHE_KEY]; } catch { stored = null; }
    if (stored?.fingerprint === fingerprint && stored.products && typeof stored.products === 'object') return stored.products;
    const url = shoppingCartUrl(origin, pathname);
    if (!url) return {};
    try {
      const response = await fetcher(url, { credentials: 'same-origin' });
      if (!response?.ok) return {};
      const html = await response.text();
      const cartDocument = new DOMParserClass().parseFromString(html, 'text/html');
      const products = parseCartProducts(cartDocument);
      await storage.set({ [CART_CACHE_KEY]: { fingerprint, products } });
      return products;
    } catch { return {}; }
  }

  function getDuplicateSummary({ recentPurchaseCount = 0, cartCount = 0 } = {}) {
    const recentCount = Number.isFinite(Number(recentPurchaseCount)) ? Math.max(0, Math.floor(Number(recentPurchaseCount))) : 0;
    const inCart = Number.isFinite(Number(cartCount)) ? Math.max(0, Math.floor(Number(cartCount))) : 0;
    return { recentPurchaseCount: recentCount, cartCount: inCart, hasDuplicate: recentCount > 0 || inCart > 0 };
  }

  function renderDuplicateWarning({ documentRef, productId, recentPurchaseCount = 0, cartProducts = {}, cartUrl } = {}) {
    const parent = documentRef?.querySelector?.('.page-title-container') || documentRef?.querySelector?.('h1');
    const summary = getDuplicateSummary({ recentPurchaseCount, cartCount: cartProducts?.[String(productId)] || 0 });
    if (!parent?.insertAdjacentElement || !summary.hasDuplicate) return null;
    documentRef.querySelector?.('#cmu-duplicate')?.remove?.();
    const notice = documentRef.createElement('div');
    notice.id = 'cmu-duplicate';
    notice.className = 'cmu-duplicate';
    notice.setAttribute('role', 'status');
    if (summary.recentPurchaseCount) {
      const line = documentRef.createElement('p');
      line.textContent = `Cette carte figure dans ton historique local des achats récents (${summary.recentPurchaseCount}).`;
      notice.appendChild(line);
    }
    if (summary.cartCount) {
      const line = documentRef.createElement('p');
      line.append('Cette carte est déjà dans ton panier ', String(summary.cartCount), ' fois. ');
      const anchor = documentRef.createElement('a');
      anchor.href = cartUrl || '/ShoppingCart';
      anchor.textContent = 'Ouvrir le panier';
      line.appendChild(anchor);
      notice.appendChild(line);
    }
    parent.insertAdjacentElement('afterend', notice);
    return notice;
  }

  function renderCartDuplicateWarnings({ documentRef, history = [], now = Date.now(), days = 90 } = {}) {
    const rows = documentRef?.querySelectorAll?.('section.shipment-block table.product-table tbody tr[data-product-id], table.product-table tbody tr[data-product-id]') || [];
    const recentIds = new Set(history.filter((entry) => entry?.productId && recent(entry, now, days)).map((entry) => String(entry.productId)));
    const rendered = [];
    for (const row of rows) {
      const id = String(row.dataset?.productId || '');
      if (!recentIds.has(id) || row.querySelector?.('.cmu-duplicate-row')) continue;
      const target = row.querySelector?.('td.info') || row;
      if (!target.appendChild) continue;
      const marker = documentRef.createElement('div');
      marker.className = 'cmu-duplicate-row';
      marker.textContent = 'Déjà acheté récemment (historique local).';
      target.appendChild(marker);
      rendered.push(marker);
    }
    return rendered;
  }

  const api = { CART_CACHE_KEY, getCartFingerprint, parseCartProducts, shoppingCartUrl, readCartProducts, getDuplicateSummary, renderDuplicateWarning, renderCartDuplicateWarnings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketDuplicateWarnings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
