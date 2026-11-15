((root) => {
  const EXCLUDED_PATH_PARTS = new Set([
    'account', 'accounts', 'basket', 'cart', 'category', 'categories', 'checkout', 'collection',
    'collections', 'contact', 'faq', 'home', 'login', 'pages', 'search', 'tag', 'tags', 'wishlist',
  ]);
  const GENERIC_LINK_LABELS = new Set([
    'add to cart', 'buy now', 'cart', 'home', 'quick view', 'read more', 'search', 'shop',
    'shop now', 'view', 'view all', 'view details', 'view product',
  ]);

  function shouldRunPartnerFeatures(settings) {
    return CardmarketSettings.isFeatureEnabled(settings, 'showPartnerLinks');
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getPartnerProductTitle({ dataTitle, heading, imageAlt, imageTitle, linkTitle, ariaLabel, linkText } = {}) {
    const candidates = [dataTitle, heading, imageAlt, imageTitle, linkTitle, ariaLabel, linkText]
      .map(cleanText)
      .filter(Boolean);
    return candidates.find((candidate) => {
      const normalized = candidate.toLocaleLowerCase().replace(/[.!?]+$/g, '').trim();
      return !GENERIC_LINK_LABELS.has(normalized) && !/^\d+(?:[.,]\d+)?\s*(?:€|eur|usd|gbp|£|\$)?$/i.test(normalized);
    }) || null;
  }

  function getPartnerPriceText({ dataPrice, content, text } = {}) {
    const explicit = cleanText(dataPrice || content);
    const numeric = explicit.match(/^(?:€|eur|usd|gbp|£|\$)?\s*\d[\d.,]*(?:\s*(?:€|eur|usd|gbp|£|\$))?$/i);
    if (numeric && /\d/.test(explicit)) return explicit.slice(0, 48);
    const visible = cleanText(text);
    const match = visible.match(/(?:\d[\d.,]*\s*(?:€|eur|usd|gbp|£|\$)|(?:€|eur|usd|gbp|£|\$)\s*\d[\d.,]*)/i);
    return match ? match[0].slice(0, 48) : '';
  }

  function isPartnerProductPath(pathname) {
    const parts = String(pathname || '').split('/').filter(Boolean).map((part) => part.toLowerCase());
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!['product', 'products', 'item', 'items'].includes(parts[index])) continue;
      const slug = parts[index + 1];
      if (slug && !EXCLUDED_PATH_PARTS.has(slug)) return true;
    }
    return false;
  }

  function isPartnerProductCandidate({ href, pageUrl, title, hasImage = false, hasPrice = false, insideNavigation = false } = {}) {
    if (!title || insideNavigation || !href || !pageUrl) return false;
    try {
      const page = new URL(pageUrl);
      const target = new URL(href, page);
      if (target.origin !== page.origin) return false;
      const pathParts = target.pathname.split('/').filter(Boolean).map((part) => part.toLowerCase());
      if (pathParts.some((part) => EXCLUDED_PATH_PARTS.has(part))) return false;
      return isPartnerProductPath(target.pathname) || (hasImage && hasPrice);
    } catch {
      return false;
    }
  }

  function detectCardmarketGame(text) {
    const value = cleanText(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/\brift[\s_-]*bound\b/.test(value)) return 'Riftbound';
    if (/\blorcana\b/.test(value)) return 'Lorcana';
    if (/\bone[\s_-]*piece\b|\bop[-\s]?\d{2}\b/.test(value)) return 'OnePiece';
    if (/\byu[\s_-]*gi[\s_-]*oh\b|\byugioh\b/.test(value)) return 'YuGiOh';
    if (/\bpokemon\b|\bpokemon\s+tcg\b|\bpok[eé]mon\b/.test(value)) return 'Pokemon';
    if (/\b(ascended heroes|mega evolution|destined rivals|journey together|prismatic evolutions|surging sparks|stellar crown|twilight masquerade|temporal forces|paldean fates|paradox rift|obsidian flames|paldea evolved|scarlet and violet|sword and shield)\b/.test(value)) return 'Pokemon';
    if (/\b(charizard|pikachu|mewtwo|lucario|gengar|eevee|mew|snorlax|dragonite|greninja|gardevoir|umbreon|arceus|rayquaza|bulbasaur|venusaur|charmander|charmeleon|squirtle|blastoise|mimikyu|lugia|gyarados|tyranitar|celebi|psyduck|lapras|magikarp|alakazam|metagross|sylveon|leafeon|glaceon|vaporeon|jolteon|flareon|piplup|zacian|zamazenta|koraidon|miraidon|terapagos|ogerpon)\b/.test(value)) return 'Pokemon';
    if (/\bmagic\s+the\s+gathering\b|\bmtg\b/.test(value)) return 'Magic';
    return null;
  }

  function inferCardmarketGame({ pathname = '', title = '', href = '', cardText = '' } = {}) {
    const candidates = [title, href, cardText, pathname];
    for (const candidate of candidates) {
      const game = detectCardmarketGame(candidate);
      if (game) return game;
    }
    return 'Magic';
  }

  function buildCardmarketSearchUrl({ pathname = '/', title = '', href = '', cardText = '', price = '', sourceSite = '' } = {}) {
    const parts = String(pathname).split('/').filter(Boolean);
    const language = parts.find((part) => /^[a-z]{2}$/i.test(part))?.toLowerCase() || 'en';
    const game = inferCardmarketGame({ pathname, title, href, cardText });
    const url = `https://www.cardmarket.com/${language}/${game}/Products/Search?searchString=${encodeURIComponent(cleanText(title))}`;
    const safePrice = cleanText(price).slice(0, 48);
    const safeSite = cleanText(sourceSite).slice(0, 100);
    if (safePrice && safeSite) return `${url}#ehcm---price--${encodeURIComponent(safePrice)}---from--${encodeURIComponent(safeSite)}`;
    return url;
  }

  function findClosestProductContainer(source) {
    return source.closest('article, .product-card, .product-item, .product, .card, li');
  }

  function hasVisiblePrice(container) {
    if (!container) return false;
    if (container.querySelector('[itemprop="price"], [data-price], [class*="price" i]')) return true;
    return /(?:\d[\d.,]*\s*(?:€|eur|usd|gbp|£|\$)|(?:€|eur|usd|gbp|£|\$)\s*\d[\d.,]*)/i.test(container.textContent || '');
  }

  function isNavigationSource(source) {
    return Boolean(source.closest([
      'nav', 'footer', '[role="navigation"]', 'header.site-header', '#site-header', '#site-footer',
      '.site-header', '.site-footer', '.main-navigation', '.navbar', '.navigation', '.quick-links',
      '.quicklinks', '.footer', '.cart', '.cart-drawer', '[class*="cart-widget"]',
    ].join(',')));
  }

  function addProductSearchLinks() {
    const pageUrl = location.href;
    const productAnchors = document.querySelectorAll('article a[href], .product-card a[href], .product-item a[href], .product a[href], .card a[href], li a[href]');
    productAnchors.forEach((source) => {
      const card = findClosestProductContainer(source);
      if (!card || card.querySelector('.cmu-market-link') || isNavigationSource(source)) return;

      const image = source.querySelector('img') || card.querySelector('img');
      const heading = card.querySelector('h1, h2, h3, h4, [itemprop="name"], [class*="product-title" i], [class*="product-name" i]');
      const title = getPartnerProductTitle({
        dataTitle: source.dataset?.productTitle || source.dataset?.title || card.dataset?.productTitle || card.dataset?.title || card.getAttribute('data-name'),
        heading: heading?.textContent,
        imageAlt: image?.getAttribute('alt'),
        imageTitle: image?.getAttribute('title'),
        linkTitle: source.getAttribute('title'),
        ariaLabel: source.getAttribute('aria-label'),
        linkText: source.textContent,
      });
      if (!isPartnerProductCandidate({
        href: source.href,
        pageUrl,
        title,
        hasImage: Boolean(image),
        hasPrice: hasVisiblePrice(card),
        insideNavigation: isNavigationSource(source),
      })) return;

      const link = document.createElement('a');
      link.className = 'cmu-market-link';
      const priceElement = card.querySelector('[itemprop="price"], [data-price], [class*="price" i]');
      const price = getPartnerPriceText({
        dataPrice: priceElement?.getAttribute('data-price') || priceElement?.getAttribute('content'),
        text: priceElement?.textContent,
      });
      link.href = buildCardmarketSearchUrl({
        pathname: location.pathname,
        title,
        href: source.href,
        cardText: card.textContent,
        price,
        sourceSite: price ? location.hostname : '',
      });
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Chercher sur Cardmarket';
      card.append(link);
    });
  }

  function initializePartnerFeatures() {
    addProductSearchLinks();
  }

  const api = {
    shouldRunPartnerFeatures,
    getPartnerProductTitle,
    getPartnerPriceText,
    isPartnerProductPath,
    isPartnerProductCandidate,
    detectCardmarketGame,
    inferCardmarketGame,
    buildCardmarketSearchUrl,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local) {
    CardmarketSettings.loadSettings(root.chrome.storage.local).then((settings) => {
      if (shouldRunPartnerFeatures(settings)) initializePartnerFeatures();
    }).catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
