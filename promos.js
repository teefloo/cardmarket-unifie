(function (root) {
  const CARDMARKET_HOSTS = new Set(['www.cardmarket.com', 'cardmarket.com']);
  const NUMBER_LABELS = new Set(['number', 'nummer', 'nombre', 'numero', 'número']);
  // A deliberately small local sample transcribed from Enhanced's promo data:
  // one ETB card and two UPC cards. No source bundle or image asset is reused.
  const PROMO_SAMPLE = Object.freeze([
    Object.freeze({
      name: 'Charizard V', number: 'SWSH050', collection: "Champion's Path", type: 'etb',
      cardmarketPath: '/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050',
    }),
    Object.freeze({
      name: 'Charizard ex', number: '161', collection: 'Charizard ex', type: 'upc',
      cardmarketPath: '/Pokemon/Products/Singles/SV-Black-Star-Promos/Charizard-ex-SVP161',
    }),
    Object.freeze({
      name: 'Mega Charizard X ex', number: '23', collection: 'Mega Charizard X ex', type: 'upc',
      cardmarketPath: '/Pokemon/Products/Singles/MEP-Black-Star-Promos/Mega-Charizard-X-ex-MEP023',
    }),
  ]);

  function parsePokemonSinglesPath(value, base = 'https://www.cardmarket.com') {
    let url;
    try { url = new URL(value, base); } catch { return null; }
    if (!CARDMARKET_HOSTS.has(url.hostname.toLowerCase())) return null;
    let segments;
    try { segments = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
    catch { return null; }
    const pokemonIndex = segments.findIndex((part) => part.toLowerCase() === 'pokemon');
    if (pokemonIndex < 0 || pokemonIndex > 1) return null;
    const locale = pokemonIndex === 1 ? segments[0] : null;
    if (locale && !/^[a-z]{2}$/i.test(locale)) return null;
    if (segments[pokemonIndex + 1]?.toLowerCase() !== 'products'
      || segments[pokemonIndex + 2]?.toLowerCase() !== 'singles'
      || segments.length !== pokemonIndex + 5) return null;
    const [set, card] = segments.slice(pokemonIndex + 3, pokemonIndex + 5);
    if (!set || !card) return null;
    return {
      url,
      locale: locale?.toLowerCase() || null,
      key: `/${set}/${card}`.toLowerCase(),
    };
  }

  function matchPokemonPromo(value, promos = PROMO_SAMPLE) {
    const parsed = parsePokemonSinglesPath(value);
    if (!parsed) return null;
    for (const promo of promos) {
      const mapped = parsePokemonSinglesPath(promo.cardmarketPath);
      if (mapped?.key === parsed.key) return promo;
    }
    return null;
  }

  function buildCardmarketPromoUrl(currentUrl, promo) {
    let current;
    try { current = new URL(currentUrl, 'https://www.cardmarket.com'); } catch { return null; }
    const locale = current.pathname.split('/').filter(Boolean)[0] || '';
    if (!CARDMARKET_HOSTS.has(current.hostname.toLowerCase()) || !/^[a-z]{2}$/i.test(locale)
      || !promo || !PROMO_SAMPLE.includes(promo) || !parsePokemonSinglesPath(promo.cardmarketPath)) return null;
    const target = new URL(promo.cardmarketPath, current.origin);
    const mappedPath = target.pathname.replace(/^\/[a-z]{2}(?=\/Pokemon\/)/i, '');
    target.pathname = `/${locale.toLowerCase()}${mappedPath}`;
    target.search = '';
    target.hash = '';
    if (!CARDMARKET_HOSTS.has(target.hostname.toLowerCase()) || !target.pathname.startsWith(`/${locale.toLowerCase()}/Pokemon/Products/Singles/`)) return null;
    return target.toString();
  }

  function isPokemonSellerSinglesOffers(pathname) {
    return /^\/[a-z]{2}\/Pokemon\/Users\/[^/]+\/Offers\/Singles\/?$/i.test(String(pathname || ''));
  }

  function findCardNumberValue(documentRef) {
    const items = [...documentRef.querySelectorAll('.info-list-container dt, .info-list-container dd')];
    const labelIndex = items.findIndex((item) => {
      const normalized = String(item.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      return NUMBER_LABELS.has(normalized);
    });
    return labelIndex >= 0 ? items[labelIndex + 1] || null : null;
  }

  function makeBadge(documentRef, currentUrl, promo) {
    const href = buildCardmarketPromoUrl(currentUrl, promo);
    if (!href) return null;
    const badge = documentRef.createElement('a');
    badge.className = 'cmu-promo-badge';
    badge.href = href;
    badge.textContent = `${promo.type.toUpperCase()} Promo`;
    badge.title = `${promo.name} · ${promo.collection}`;
    badge.setAttribute('aria-label', `${promo.name}, promotion ${promo.type.toUpperCase()} (${promo.collection})`);
    badge.rel = 'noopener noreferrer';
    return badge;
  }

  function initializePromos(settings, { documentRef = root.document, locationRef = root.location } = {}) {
    if (!root.CardmarketSettings?.isFeatureEnabled(settings, 'showPromos') || !documentRef || !locationRef) return false;
    const path = String(locationRef.pathname || '');
    if (/\/pokemon\/products\/singles\//i.test(path)) {
      const promo = matchPokemonPromo(locationRef.href || path);
      if (!promo) return false;
      const numberValue = findCardNumberValue(documentRef);
      if (!numberValue || numberValue.querySelector?.('.cmu-promo-badge')) return false;
      const badge = makeBadge(documentRef, locationRef.href || path, promo);
      if (!badge) return false;
      numberValue.append(badge);
      return true;
    }
    if (!isPokemonSellerSinglesOffers(path)) return false;
    let added = false;
    for (const row of documentRef.querySelectorAll('#UserOffersTable div.article-row')) {
      const link = row.querySelector('a[href]');
      const href = link?.getAttribute?.('href') || link?.href;
      const promo = matchPokemonPromo(href || '');
      const attributes = row.querySelector('.product-attributes');
      if (!promo || !attributes || attributes.querySelector?.('.cmu-promo-badge')) continue;
      const badge = makeBadge(documentRef, locationRef.href || path, promo);
      if (!badge) continue;
      attributes.append(badge);
      added = true;
    }
    return added;
  }

  const api = {
    PROMO_SAMPLE,
    parsePokemonSinglesPath,
    matchPokemonPromo,
    buildCardmarketPromoUrl,
    isPokemonSellerSinglesOffers,
    initializePromos,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketPromos = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local && root.location) {
    root.CardmarketSettings.loadSettings(root.chrome.storage.local).then((settings) => initializePromos(settings)).catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
