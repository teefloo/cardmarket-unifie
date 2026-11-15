(function (root) {
  const TOOL_DEFAULTS = CardmarketSettings.DEFAULTS;
  const SPECIAL_TERMS = ['ex', 'gx', 'v', 'v.1', 'v.2', 'v.3', 'v.4', 'x'];
  const GRADING_BRANDS = Object.freeze([
    { id: 'collect-aura', name: 'Collect Aura', pattern: /\b(?:collect[\s-]*aura|ca)(?![a-z])/g },
    { id: 'pure-grading', name: 'Pure Grading', pattern: /\bpure[\s-]*grading(?![a-z])/g },
    { id: 'bgs', name: 'BGS', pattern: /\b(?:beckett|bgs)(?![a-z])/g },
    { id: 'psa', name: 'PSA', pattern: /\bpsa(?![a-z])/g },
    { id: 'cgc', name: 'CGC', pattern: /\bcgc(?![a-z])/g },
    { id: 'pca', name: 'PCA', pattern: /\bpca(?![a-z])/g },
    { id: 'ccc', name: 'CCC', pattern: /\bccc(?![a-z])/g },
    { id: 'ags', name: 'AGS', pattern: /\bags(?![a-z])/g },
    { id: 'ace', name: 'ACE', pattern: /\bace(?![a-z])/g },
    { id: 'tag', name: 'TAG', pattern: /\btag(?![a-z])/g },
    { id: 'sgc', name: 'SGC', pattern: /\bsgc(?![a-z])/g },
    { id: 'graad', name: 'GRAAD', pattern: /\bgraad(?![a-z])/g },
    { id: 'mnt', name: 'MNT', pattern: /\bmnt(?![a-z])/g },
    { id: 'ars', name: 'ARS', pattern: /\bars(?![a-z])/g },
    { id: 'ksa', name: 'KSA', pattern: /\bksa(?![a-z])/g },
    { id: 'gma', name: 'GMA', pattern: /\bgma(?![a-z])/g },
    { id: 'hga', name: 'HGA', pattern: /\bhga(?![a-z])/g },
  ]);
  const featureEnabled = (settings, name) => CardmarketSettings.isFeatureEnabled(settings, name);
  let offerAttributeObserver = null;
  const spoilerLoadWindows = new WeakSet();

  function buildRecentOrderSearchUrl(action, productName, userType, cardPath = '') {
    if (!['seller', 'buyer'].includes(userType) || !String(productName || '').trim()) return null;
    let url;
    try { if (action) url = new URL(action, root.location?.origin || 'https://www.cardmarket.com'); }
    catch { url = null; }
    const validHost = (candidate) => candidate && ['www.cardmarket.com', 'cardmarket.com'].includes(candidate.hostname.toLowerCase());
    if (!validHost(url) || !/\/Products\/Search$/i.test(url.pathname)) {
      const parts = String(cardPath).split('?')[0].split('/').filter(Boolean);
      const languages = new Set(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl']);
      const games = new Map(['Magic', 'YuGiOh', 'Pokemon', 'OnePiece', 'Lorcana', 'Riftbound'].map((game) => [game.toLowerCase(), game]));
      const language = languages.has((parts[0] || '').toLowerCase()) ? parts[0].toLowerCase() : 'en';
      const gamePart = parts.find((part) => games.has(part.toLowerCase()));
      if (!gamePart) return null;
      url = new URL(`/${language}/${games.get(gamePart.toLowerCase())}/Products/Search`, 'https://www.cardmarket.com');
    }
    url.pathname = url.pathname.replace(/\/Products\/Search$/i, '/Orders/Search');
    url.search = '';
    url.searchParams.set('productName', String(productName).trim());
    url.searchParams.set('userType', userType);
    url.searchParams.set('ehcmShipmentStatus', '101,200');
    url.searchParams.set('ehcmSubmit', 'true');
    return url.toString();
  }

  function isEnhancedAuthorLink(href, origin = root.location?.origin || 'https://www.cardmarket.com') {
    try {
      const url = new URL(String(href || ''), origin);
      return ['www.cardmarket.com', 'cardmarket.com'].includes(url.hostname.toLowerCase())
        && /^(?:\/[^/]+){1,2}\/Users\/maveeee\/?$/i.test(url.pathname);
    } catch { return false; }
  }

  function addAuthorHighlight(documentRef, pathname, enabled) {
    if (!enabled || !/\/products\/singles\//i.test(String(pathname || ''))) return 0;
    const links = [...(documentRef?.querySelectorAll?.('a[href$="/Users/maveeee"]') || [])];
    let count = 0;
    for (const link of links) {
      if (!isEnhancedAuthorLink(link.href || link.getAttribute?.('href'))) continue;
      link.classList?.add('cmu-enhanced-author');
      link.title = 'Auteur d’Enhanced Cardmarket';
      link.setAttribute?.('aria-label', `${link.textContent?.trim() || 'Maveeee'} · auteur d’Enhanced Cardmarket`);
      count += 1;
    }
    return count;
  }

  function isSellerOfferEditLink(link) {
    return /Article_EditArticleModal/.test(String(link?.getAttribute?.('data-modal') || ''));
  }

  function getSpecialSearchTerms(searchString) {
    const tokens = new Set(String(searchString || '').toLowerCase().split(/\s+/).map((token) => token.replace(/[()]/g, '')));
    return SPECIAL_TERMS.filter((term) => tokens.has(term));
  }

  function matchesSpecialSearchTerms(text, terms) {
    if (!Array.isArray(terms) || !terms.length) return false;
    const tokens = new Set(String(text || '').toLowerCase().split(/\s+/).map((token) => token.replace(/[()]/g, '')));
    return terms.some((term) => tokens.has(String(term).toLowerCase()));
  }

  function getCopyableContact(value, kind) {
    const text = String(value || '').trim();
    if (kind === 'email') return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
    if (kind === 'phone' && /^(?:00|\+)[\d\s().-]{7,22}$/.test(text) && (text.match(/\d/g) || []).length >= 8) return text;
    return null;
  }

  function findCardPreviewRow(link, { origin = root.location?.origin || 'https://www.cardmarket.com' } = {}) {
    if (!link?.closest) return null;
    let productUrl;
    try { productUrl = new URL(link.href || link.getAttribute?.('href') || '', origin); }
    catch { return null; }
    if (productUrl.origin !== origin || !/\/Products\/Singles\/[^/]+\/[^/]+/i.test(productUrl.pathname)) return null;
    if (link.closest('nav, .breadcrumb, [aria-label="breadcrumb"], [role="navigation"], .dropdown-menu')) return null;

    const galleryCard = link.closest('.galleryBox');
    if (galleryCard?.tagName?.toLowerCase() === 'a' && galleryCard.closest('.cmu-gallery-grid')) {
      const column = galleryCard.parentElement;
      const hasColumnClass = Array.from(column?.classList || []).some((name) => /^col-(?:[a-z]+-)?\d+$/i.test(name));
      if (column?.tagName?.toLowerCase() === 'div' && column.classList?.contains('d-flex') && hasColumnClass) return column;
    }

    const articleRow = link.closest('.article-row');
    if (articleRow?.closest('.article-table')) return articleRow;

    const orderRow = link.closest('tr[data-product-id]');
    if (orderRow?.closest('table.product-table')) return orderRow;

    const searchRow = link.closest('.table-body .row[id], .table-body [data-product-id]');
    if (searchRow && (searchRow.matches?.('[data-product-id]') || searchRow.querySelector?.('.thumbnail-icon, [data-product-id], .price-container'))) return searchRow;
    return null;
  }

  function isCardProductImageUrl(source, base = 'https://www.cardmarket.com') {
    let url;
    try { url = new URL(String(source || ''), base); }
    catch { return false; }
    if (url.hostname.toLowerCase() !== 'product-images.s3.cardmarket.com') return false;
    const match = url.pathname.match(/^\/(\d+)\/(\d+)\.(?:jpe?g|png|webp)$/i);
    return Boolean(match && match[1] === match[2]);
  }

  function removeShariffWidgets(documentRef, pathname, enabled) {
    if (!enabled || !documentRef?.querySelectorAll || !String(pathname || '').toLowerCase().includes('/products')) return 0;
    const widgets = [...documentRef.querySelectorAll('.shariff')];
    widgets.forEach((widget) => widget.remove?.());
    return widgets.length;
  }

  function detectOfferAttributes(text) {
    const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/,/g, '.');
    if (/\b(?:maybe|might|could be|may be|contender|chance|worthy|candidate|possible|possibly|probably|probable|perhaps|peut etre|eventuellement|vielleicht|moglicherweise|konnten|quizas|posible|forse|probabilmente|misschien|mogelijk|talvez|possivelmente)\b/.test(value)) return [];
    const negations = new Set(['not', 'non', 'nicht', 'no', 'sin', 'niet', 'nao', 'nie', 'pas', 'sans', 'sem', 'ne', 'ungraded']);
    const negationBridges = new Set(['a', 'an', 'the', 'by', 'factory', 'sealed', 'scelle', 'scellee', 'scelles', 'scellees', 'versiegelt', 'eingeschweisst', 'originalverpackt', 'ovp', 'sellado', 'sellada', 'sellados', 'selladas', 'sellad', 'precintado', 'precintada', 'precintados', 'precintadas', 'sigillato', 'sigillata', 'sigillati', 'sigillate', 'verzegeld', 'selado', 'selada', 'selados', 'seladas', 'lacrado', 'lacrada', 'lacrados', 'lacradas', 'graded', 'grade', 'encore', 'esta', 'mehr']);
    const isNegated = (index) => {
      const context = value.slice(Math.max(0, index - 48), index);
      const boundary = Math.max(context.lastIndexOf('.'), context.lastIndexOf(';'), context.lastIndexOf(','), context.lastIndexOf('·'), context.lastIndexOf('/'), context.lastIndexOf('|'), context.lastIndexOf('\n'));
      const words = context.slice(boundary + 1).match(/[a-z0-9]+/g) || [];
      let negationIndex = -1;
      words.forEach((word, wordIndex) => { if (negations.has(word)) negationIndex = wordIndex; });
      if (negationIndex < 0) return false;
      const bridge = words.slice(negationIndex + 1);
      return bridge.length <= 3 && bridge.every((word) => negationBridges.has(word));
    };
    const isQuestioned = (match) => /^\s*\?/.test(value.slice(match.index + match[0].length));
    const attributes = [];
    const sealedPattern = /\b(?:factory[\s-]+)?(?:sealed|scelle(?:e|s|es)?|versiegel(?:t|te|ten|ter|tes|tem)|eingeschweisst(?:e|en|er|es|em)?|originalverpackt|ovp|sellad[oa]s?|precintad[oa]s?|sigillat[oaie]|verzegeld(?:e|en)?|selad[oa]s?|lacrad[oa]s?|zafoliowan(?:y|a|e|i|ych)|zapieczetowan(?:y|a|e|i|ych))\b/g;
    const sealedMatch = [...value.matchAll(sealedPattern)].find((match) => !isNegated(match.index) && !isQuestioned(match));
    if (sealedMatch) {
      attributes.push({ type: 'sealed', label: 'SCELLÉ' });
    }
    const seenBrands = new Set();
    const gradePattern = /^\s*(?:[:=#-]\s*)?(\d{1,2}(?:\.\d+)?(?:\s*\/\s*\d{1,2}(?:\.\d+)?)?)/;
    for (const { id, name, pattern } of GRADING_BRANDS) {
      const candidates = [...value.matchAll(pattern)];
      for (const match of candidates) {
        if (seenBrands.has(id) || isNegated(match.index)) continue;
        const suffix = value.slice(match.index + match[0].length);
        const rating = suffix.match(gradePattern);
        const grade = rating ? rating[1].replace(/\s*\/\s*/, '/') : '';
        const afterGrade = suffix.slice(rating?.[0].length || 0);
        const shortCollectAuraAlias = id === 'collect-aura' && match[0] === 'ca';
        if (shortCollectAuraAlias) {
          if (!grade || /^[a-z0-9]/i.test(afterGrade)) continue;
          const gradeValues = grade.split('/').map(Number);
          if (gradeValues.some((score) => !Number.isFinite(score) || score <= 0 || score > 10.5)) continue;
        }
        if (/^\s*\?/.test(afterGrade) || isQuestioned(match)) continue;
        if (grade && (Number(grade.split('/')[0]) <= 0 || Number(grade.split('/')[0]) > 10.5)) continue;
        seenBrands.add(id);
        attributes.push({
          type: 'grade',
          brand: id,
          brandName: name,
          grade,
          label: grade ? `${name} ${grade}` : name,
        });
        break;
      }
    }
    return attributes;
  }

  function isBallIndicatorPath(pathname = '') {
    let path = String(pathname || '').split(/[?#]/)[0];
    try { path = decodeURIComponent(path); } catch { /* Use the literal path when malformed. */ }
    const parts = path.split('/').filter(Boolean).map((part) => part.toLowerCase());
    const gameIndex = parts.indexOf('pokemon');
    if (gameIndex < 0 || parts[gameIndex + 1] !== 'products' || parts[gameIndex + 2] !== 'singles') return false;
    return ['151', 'white-flare', 'black-bolt'].includes(parts[gameIndex + 3]);
  }

  function detectBallIndicators(text, pathname = root.location?.pathname || '') {
    if (!isBallIndicatorPath(pathname)) return [];
    const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const uncertain = /\b(?:maybe|might|could be|may be|possible|possibly|probably|perhaps|peut etre|eventuellement|vielleicht|moglicherweise|quizas|forse|misschien|mogelijk|talvez)\b/;
    const negations = new Set(['not', 'no', 'non', 'nicht', 'sin', 'niet', 'nao', 'nie', 'pas', 'sans', 'sem', 'without', 'w/o']);
    const bridges = new Set(['a', 'an', 'the', 'include', 'includes', 'included', 'contain', 'contains', 'contained', 'de', 'du', 'des', 'un', 'une', 'the', 'present', 'included']);
    const rejected = (match) => {
      if (/^\s*\?/.test(value.slice(match.index + match[0].length))) return true;
      const prefix = value.slice(Math.max(0, match.index - 56), match.index);
      const boundary = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf(';'), prefix.lastIndexOf(','), prefix.lastIndexOf('·'), prefix.lastIndexOf('/'), prefix.lastIndexOf('|'), prefix.lastIndexOf('\n'));
      const clause = prefix.slice(boundary + 1);
      if (uncertain.test(clause)) return true;
      const words = clause.match(/[a-z0-9]+/g) || [];
      let negationIndex = -1;
      words.forEach((word, index) => { if (negations.has(word)) negationIndex = index; });
      if (negationIndex < 0) return false;
      const bridge = words.slice(negationIndex + 1);
      return bridge.length <= 4 && bridge.every((word) => bridges.has(word));
    };
    const kinds = [
      { ball: 'poke', label: 'Poké Ball', pattern: /\b(?:poke[\s-]*balls?|pokeballs?)\b/g },
      { ball: 'master', label: 'Master Ball', pattern: /\bmaster[\s-]*balls?\b/g },
    ];
    const result = [];
    for (const kind of kinds) {
      const match = [...value.matchAll(kind.pattern)].find((candidate) => !rejected(candidate));
      if (match) result.push({ type: 'ball', ball: kind.ball, label: kind.label });
    }
    return result;
  }

  function clampGridColumns(value, viewportWidth = 1280) {
    const min = Number(viewportWidth) < 1024 ? 1 : 2;
    const numeric = Math.round(Number(value) || min);
    return Math.max(min, Math.min(12, numeric));
  }

  function buildBlocklistUrl(pathname, username) {
    const parts = String(pathname || '').split('/').filter(Boolean);
    const first = parts[0] || 'en';
    const language = /^[a-z]{2}$/i.test(first) ? first.toLowerCase() : 'en';
    const games = new Set(['magic', 'yugioh', 'pokemon', 'onepiece', 'lorcana', 'riftbound']);
    const gameSegment = games.has((parts[1] || '').toLowerCase()) ? `${parts[1]}/` : '';
    const url = new URL(`/${language}/${gameSegment}Account/Settings/UserBlocklist`, 'https://www.cardmarket.com');
    const user = String(username || '').trim();
    if (user) url.searchParams.set('ehcmUser', user);
    return url.toString();
  }

  function getExpansionFromSinglesPath(path) {
    const parts = String(path || '').split('?')[0].split('/').filter(Boolean);
    const index = parts.findIndex((part) => part.toLowerCase() === 'singles');
    if (index < 0 || !parts[index + 1]) return null;
    try { return decodeURIComponent(parts[index + 1]); }
    catch { return parts[index + 1]; }
  }

  function groupOrderProgress(items) {
    const groups = new Map();
    for (const item of items) {
      const expansion = String(item.expansion || '').trim();
      if (!expansion) continue;
      const group = groups.get(expansion) || { expansion, checked: 0, total: 0 };
      group.total += 1;
      if (item.checked) group.checked += 1;
      groups.set(expansion, group);
    }
    return [...groups.values()];
  }

  function buildConditionPriceItems(entries) {
    const validConditions = new Set(['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']);
    const seen = new Set();
    return entries.filter((entry) => {
      if (!validConditions.has(entry.condition) || !String(entry.price || '').trim() || seen.has(entry.condition)) return false;
      seen.add(entry.condition);
      return true;
    }).map(({ condition, price, href }) => ({ condition, price: String(price).trim(), href: href || '' }));
  }

  function shouldRunPageTools(settings) {
    return settings?.enabled !== false;
  }

  function isMagicSinglesListingPath(pathname) {
    return /\/magic\/products\/singles(?:\/|$)/i.test(String(pathname || '').split(/[?#]/)[0]);
  }

  function shouldForceSpoilerImageLoad(pathname, hasSearchInput = false) {
    const path = String(pathname || '').split(/[?#]/)[0];
    return /\/products\//i.test(path) && /\/singles\//i.test(path) && !hasSearchInput;
  }

  function attachSpoilerImageLoadOnScroll(pathname, documentRef = root.document, windowRef = root.window, {
    EventClass = root.Event,
    setTimer = root.setTimeout,
    clearTimer = root.clearTimeout,
  } = {}) {
    const hasSearchInput = Boolean(documentRef?.querySelector?.('.filter-form input[name="searchString"]'));
    if (!shouldForceSpoilerImageLoad(pathname, hasSearchInput)
      || !windowRef?.addEventListener || !windowRef?.dispatchEvent || typeof EventClass !== 'function'
      || typeof setTimer !== 'function' || typeof clearTimer !== 'function'
      || spoilerLoadWindows.has(windowRef)) return null;

    let timeout = null;
    const onScroll = () => {
      if (timeout !== null) clearTimer(timeout);
      timeout = setTimer(() => {
        timeout = null;
        windowRef.dispatchEvent(new EventClass('load'));
      }, 250);
    };
    windowRef.addEventListener('scroll', onScroll, { passive: true });
    spoilerLoadWindows.add(windowRef);
    return onScroll;
  }

  function isMagicSummaryArtTitle(text) {
    const title = String(text || '');
    return title.includes('Summary Card:') || title.includes('Art Series:');
  }

  function findMagicSummaryCardContainers(documentRef, pathname) {
    if (!isMagicSinglesListingPath(pathname) || !documentRef?.querySelectorAll) return [];
    const selectors = ['.row[data-ehcm-grid-parent] .card-title', '.cmu-gallery-grid .card-title'];
    const titles = new Set(selectors.flatMap((selector) => [...(documentRef.querySelectorAll(selector) || [])]));
    const targets = new Set();
    for (const title of titles) {
      if (!isMagicSummaryArtTitle(title?.textContent)) continue;
      let card = title.closest?.('a.card') || null;
      if (!card) {
        for (let current = title.parentElement; current; current = current.parentElement) {
          if (String(current.tagName || '').toLowerCase() === 'a' && current.classList?.contains('card')) {
            card = current;
            break;
          }
        }
      }
      if (!card) continue;
      let column = card.parentElement;
      if (!(String(column?.tagName || '').toLowerCase() === 'div' && column.classList?.contains('d-flex'))) {
        column = column?.closest?.('div.d-flex') || null;
      }
      if (column && String(column.tagName || '').toLowerCase() === 'div' && column.classList?.contains('d-flex')) targets.add(column);
    }
    return [...targets];
  }

  function setMagicSummaryCardVisibility(containers, hidden) {
    const targets = [...new Set(containers || [])];
    for (const container of targets) {
      if (hidden) container.classList?.add('cmu-magic-art-summary-hidden');
      else container.classList?.remove('cmu-magic-art-summary-hidden');
    }
    return targets.length;
  }

  function observeMagicSummaryCardChanges(target, scan, {
    MutationObserverClass = root.MutationObserver,
    schedule = null,
  } = {}) {
    if (!target || typeof scan !== 'function' || typeof MutationObserverClass !== 'function') return null;
    const enqueue = schedule || ((callback) => {
      if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(callback);
      else root.setTimeout(callback, 0);
    });
    let scheduled = false;
    const observer = new MutationObserverClass((records) => {
      const hasAddedContent = (records || []).some((record) => record.type === 'childList' && (record.addedNodes?.length || 0) > 0);
      if (!hasAddedContent || scheduled) return;
      scheduled = true;
      enqueue(() => {
        scheduled = false;
        scan();
      });
    });
    observer.observe(target, { childList: true, subtree: true });
    return observer;
  }

  function addMagicSummaryArtControl(options) {
    const pathname = location.pathname;
    if (!isMagicSinglesListingPath(pathname) || document.querySelector('.cmu-magic-art-summary-controls')) return null;
    const hits = document.querySelector('.col-auto.d-none.d-md-block');
    const grid = document.querySelector('.row[data-ehcm-grid-parent], .cmu-gallery-grid');
    const anchor = hits?.parentElement;
    if (!anchor && !grid) return null;

    const controls = document.createElement('div');
    controls.className = 'cmu-magic-art-summary-controls cmu-page-tool';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', 'Masquer Art Series et Summary Cards');
    checkbox.checked = featureEnabled(options, 'hideMagicArtSummary');
    const labelText = document.createElement('span');
    labelText.textContent = 'Masquer Art Series et Summary Cards';
    const count = document.createElement('small');
    count.className = 'cmu-magic-art-summary-count';
    label.append(checkbox, labelText);
    controls.append(label, count);

    if (anchor) anchor.insertAdjacentElement('afterend', controls);
    else grid.insertAdjacentElement('beforebegin', controls);

    const apply = () => {
      const targets = findMagicSummaryCardContainers(document, pathname);
      setMagicSummaryCardVisibility(targets, checkbox.checked);
      const status = checkbox.checked ? `${targets.length} masquée(s)` : 'Aucune carte masquée';
      if (count.textContent !== status) count.textContent = status;
    };
    checkbox.addEventListener('change', () => {
      apply();
      root.chrome?.storage?.local?.set({ hideMagicArtSummary: checkbox.checked })?.catch?.(() => {});
    });
    apply();
    if (grid) observeMagicSummaryCardChanges(grid, apply);
    return controls;
  }

  function createButton(text, className, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    if (title) button.title = title;
    return button;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* Utilise le repli local ci-dessous. */ }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.className = 'cmu-copy-buffer';
    document.body.append(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    field.remove();
    return copied;
  }

  function addCopyButton(target, text, label = 'Copier') {
    const value = String(text || '').trim();
    if (!target || !value || target.querySelector(':scope > .cmu-copy-button')) return;
    const button = createButton(label, 'cmu-copy-button', `Copier : ${value}`);
    button.setAttribute('aria-label', `Copier ${value}`);
    button.addEventListener('click', async () => {
      const copied = await copyText(value);
      button.textContent = copied ? 'Copié' : 'Échec';
      setTimeout(() => { if (button.isConnected) button.textContent = label; }, 1300);
    });
    target.insertAdjacentElement('beforeend', button);
  }

  function addShipmentCopyTools() {
    const detailLink = document.querySelector('a[href*="/ShippingCosts"]');
    const details = detailLink?.closest('.shipment-detail-collapse');
    if (details) {
      for (const span of details.querySelectorAll('span')) {
        const email = getCopyableContact(span.textContent, 'email');
        if (email) addCopyButton(span.nextElementSibling || span, email, 'Copier e-mail');
      }
      for (const definition of details.querySelectorAll('dd')) {
        const phone = getCopyableContact(definition.textContent, 'phone');
        if (phone) addCopyButton(definition, phone, 'Copier téléphone');
      }
    }
    const addressHeading = document.querySelector('.shipping-address h3');
    const address = addressHeading?.parentElement?.querySelector('#ShippingAddress');
    const addressLines = [...(address?.querySelectorAll('div') || [])].map((line) => line.textContent.trim()).filter(Boolean);
    if (addressHeading && addressLines.length) addCopyButton(addressHeading, addressLines.join('\n'), 'Copier l’adresse');
    for (const line of address?.querySelectorAll('div') || []) addCopyButton(line, line.textContent, 'Copier');
  }

  function addRecentOrderLinks() {
    if (!/\/singles\//i.test(location.pathname)) return;
    const action = document.querySelector('#searchForm')?.getAttribute('action');
    const heading = document.querySelector('.page-title-container h1');
    const title = heading?.cloneNode(true);
    title?.querySelectorAll('span').forEach((span) => span.remove());
    const productName = title?.textContent.trim();
    const salesUrl = buildRecentOrderSearchUrl(action, productName, 'seller', location.pathname);
    const purchasesUrl = buildRecentOrderSearchUrl(action, productName, 'buyer', location.pathname);
    if (!salesUrl || !purchasesUrl) return;
    for (const chart of document.querySelectorAll('.chart-wrapper')) {
      const parent = chart.parentElement;
      if (!parent || parent.querySelector('.cmu-recent-orders')) continue;
      const links = document.createElement('div');
      links.className = 'cmu-recent-orders';
      for (const [label, href] of [['Ventes récentes', salesUrl], ['Achats récents', purchasesUrl]]) {
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = label;
        links.append(anchor);
      }
      chart.insertAdjacentElement('beforebegin', links);
    }
  }

  function addBlocklistShortcut(parent, username, label = 'Ajouter à la liste de blocage') {
    const user = String(username || '').trim();
    if (!parent || !user || parent.querySelector('.cmu-blocklist-shortcut')) return;
    const anchor = document.createElement('a');
    anchor.className = 'cmu-blocklist-shortcut cmu-page-tool';
    anchor.href = buildBlocklistUrl(location.pathname, user);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = label;
    if (parent.tagName === 'LI') {
      const item = document.createElement('li');
      item.append(anchor);
      parent.insertAdjacentElement('afterend', item);
    } else {
      parent.insertAdjacentElement('afterend', anchor);
    }
  }

  function addBlocklistShortcuts() {
    const path = location.pathname.toLowerCase();
    if (path.includes('/orders/')) {
      if (document.querySelector('.timeline-box.notYetStatus')) return;
      const supportLink = document.querySelector('.action-bar a[href*="/tickets/"]');
      const seller = document.querySelector('.seller-name a[href*="/Users/"]')?.textContent;
      if (supportLink && seller) addBlocklistShortcut(supportLink.closest('div'), seller);
    }
    if (path.includes('/account/messages/')) {
      const firstItem = document.querySelector('#MessageDropdown ul li:first-child');
      const username = document.querySelector('.breadcrumb-item.active')?.textContent;
      if (firstItem && username) addBlocklistShortcut(firstItem, username);
    }
    if (path.includes('/users/')) {
      const memo = document.querySelector('div#memoLink');
      const username = document.querySelector('#PublicProfileHeadline')?.textContent;
      if (memo && username) addBlocklistShortcut(memo.closest('div'), username);
    }
    if (path.includes('/userblocklist')) {
      const username = new URLSearchParams(location.search).get('ehcmUser');
      const input = document.querySelector('input#UsernameSearch');
      if (input && username) {
        input.value = username;
        input.focus();
      }
    }
  }

  function addConditionPriceSummary() {
    if (!/\/products\//i.test(location.pathname)) return;
    const infoItems = [...document.querySelectorAll('.info-list-container dt, .info-list-container dd')];
    const fromLabels = new Set(['from', 'ab', 'de', 'desde', 'da']);
    const fromIndex = infoItems.findIndex((item) => fromLabels.has(item.textContent.trim().toLowerCase()));
    const insertionPoint = fromIndex >= 0 ? infoItems[fromIndex + 1] : null;
    if (!insertionPoint || insertionPoint.parentElement.querySelector('.cmu-condition-prices')) return;
    const entries = [];
    for (const code of ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']) {
      const condition = document.querySelector(`.article-table .article-row[id^="articleRow"] a.article-condition.condition-${code.toLowerCase()}`);
      const row = condition?.closest('.article-row');
      const price = row?.querySelector('.price-container')?.textContent;
      if (row?.id && price) entries.push({ condition: code, price, href: `#${row.id}` });
    }
    const prices = buildConditionPriceItems(entries);
    if (!prices.length) return;
    const summary = document.createElement('div');
    summary.className = 'cmu-condition-prices';
    for (const item of prices) {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = `${item.condition} · ${item.price}`;
      summary.append(link);
    }
    insertionPoint.insertAdjacentElement('afterend', summary);
  }

  function addSupportTicketControls() {
    if (!document.querySelector('#marketingCarousel') || !root.chrome?.storage?.local) return;
    const key = 'cmuHiddenSupportTickets';
    chrome.storage.local.get({ [key]: [] }).then((stored) => {
      const hidden = Array.isArray(stored[key]) ? stored[key] : [];
      const links = [...document.querySelectorAll('a[href*="/support/tickets/"]')];
      for (const link of links) {
        const label = link.textContent.trim();
        const row = link.parentElement;
        if (!row || !label) continue;
        if (hidden.includes(label)) {
          row.remove();
          continue;
        }
        if (row.querySelector('.cmu-hide-ticket')) continue;
        const button = createButton('Masquer', 'cmu-hide-ticket', 'Masquer ce ticket de support');
        button.addEventListener('click', async () => {
          hidden.push(label);
          await chrome.storage.local.set({ [key]: [...new Set(hidden)] });
          row.remove();
          showRestoreTicketsButton(key, hidden.length);
        });
        row.append(button);
      }
      if (hidden.length) showRestoreTicketsButton(key, hidden.length);
    }).catch(() => {});
  }

  function showRestoreTicketsButton(key, count) {
    const carousel = document.querySelector('#marketingCarousel');
    if (!carousel || carousel.parentElement.querySelector('.cmu-restore-tickets')) return;
    const button = createButton(`Réafficher les tickets masqués (${count})`, 'cmu-restore-tickets', 'Réafficher les tickets de support masqués');
    button.addEventListener('click', async () => {
      await chrome.storage.local.set({ [key]: [] });
      location.reload();
    });
    carousel.insertAdjacentElement('afterend', button);
  }

  function addSpecialTermHighlights() {
    if (!/\/search(?:\/|$)/i.test(location.pathname)) return;
    const terms = getSpecialSearchTerms(new URLSearchParams(location.search).get('searchString'));
    if (!terms.length) return;
    for (const anchor of document.querySelectorAll('.table-body .col .row a[href*="Products"]')) {
      const row = anchor.closest('div[id].row');
      if (row && matchesSpecialSearchTerms(anchor.textContent, terms)) {
        row.classList.add('cmu-special-term');
        row.title = `Terme spécial détecté : ${terms.join(', ').toUpperCase()}`;
      }
    }
    for (const title of document.querySelectorAll('section .row .card .card-title')) {
      const card = title.closest('a.card');
      if (card && matchesSpecialSearchTerms(title.textContent, terms)) {
        card.classList.add('cmu-special-term');
        card.title = `Terme spécial détecté : ${terms.join(', ').toUpperCase()}`;
      }
    }
  }

  function nodeElement(node) {
    return node?.nodeType === 1 ? node : node?.parentElement || null;
  }

  function isOfferBadgeNode(node) {
    const element = nodeElement(node);
    return Boolean(element?.matches?.('.cmu-offer-attribute') || element?.closest?.('.cmu-offer-attribute'));
  }

  function collectOfferRowsFromMutations(records) {
    const rows = new Set();
    for (const record of records || []) {
      const changedNodes = [...(record.addedNodes || []), ...(record.removedNodes || [])];
      const target = nodeElement(record.target);
      if (target?.closest?.('.cmu-offer-attribute')) continue;
      const ownBadgeUpdate = record.type === 'childList'
        && changedNodes.length > 0
        && changedNodes.every(isOfferBadgeNode)
        && target?.closest?.('.product-attributes');
      if (ownBadgeUpdate) continue;
      const relevantTarget = target?.closest?.('.product-comments, .product-attributes');
      const relevantChangedNode = changedNodes.some((node) => {
        const element = nodeElement(node);
        return element?.matches?.('.article-row, .product-comments, .product-attributes')
          || Boolean(element?.querySelector?.('.article-row, .product-comments, .product-attributes'));
      });
      if (!relevantTarget && !relevantChangedNode) continue;
      const candidates = [record.target, ...changedNodes];
      for (const [index, node] of candidates.entries()) {
        const element = nodeElement(node);
        if (element?.matches?.('.article-row')) rows.add(element);
        const row = element?.closest?.('.article-row');
        if (row) rows.add(row);
        if (index > 0) {
          for (const descendant of element?.querySelectorAll?.('.article-row') || []) rows.add(descendant);
        }
      }
    }
    return rows;
  }

  function observeOfferAttributeChanges(scanRows, {
    MutationObserverClass = root.MutationObserver,
    schedule = null,
    target = root.document?.querySelector?.('.article-table') || root.document?.body,
  } = {}) {
    if (typeof MutationObserverClass !== 'function' || !target || typeof scanRows !== 'function') return null;
    const enqueue = schedule || ((callback) => {
      if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(callback);
      else root.setTimeout(callback, 0);
    });
    const pendingRows = new Set();
    let scheduled = false;
    const observer = new MutationObserverClass((records) => {
      for (const row of collectOfferRowsFromMutations(records)) pendingRows.add(row);
      if (!pendingRows.size || scheduled) return;
      scheduled = true;
      enqueue(() => {
        scheduled = false;
        const rows = [...pendingRows].filter((row) => row.isConnected !== false);
        pendingRows.clear();
        if (rows.length) scanRows(rows);
      });
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title'],
    });
    return observer;
  }

  function addOfferAttributeBadges(rows = document.querySelectorAll('.article-table .article-row'), options = TOOL_DEFAULTS) {
    if (!/\/singles\//i.test(location.pathname)) return;
    const showOfferAttributes = featureEnabled(options, 'showOfferAttributes');
    const showBalls = featureEnabled(options, 'showPokeMasterBallIndicators');
    for (const row of rows) {
      const comments = row.querySelector('.product-comments')?.textContent || '';
      const attributes = row.querySelector('.product-attributes');
      if (!attributes) continue;
      const attributeText = [...(attributes.childNodes || [])]
        .filter((child) => !isOfferBadgeNode(child))
        .map((child) => child.textContent || '')
        .join(' ');
      const attributeSource = `${comments} ${attributeText}`;
      const badges = [
        ...(showOfferAttributes ? detectOfferAttributes(attributeSource) : []),
        ...(showBalls ? detectBallIndicators(attributeSource, location.pathname) : []),
      ];
      const signature = JSON.stringify(badges);
      if (attributes.dataset.cmuOfferSignature === signature) continue;
      for (const existing of attributes.querySelectorAll('.cmu-offer-attribute')) existing.remove();
      attributes.dataset.cmuOfferSignature = signature;
      for (const badge of badges) {
        const indicator = document.createElement('span');
        indicator.className = `cmu-offer-attribute cmu-${badge.type}${badge.type === 'grade' ? ' cmu-grade-brand' : ''}${badge.type === 'ball' ? ` cmu-poke-ball-badge cmu-poke-ball--${badge.ball}` : ''}`;
        indicator.title = badge.type === 'grade' ? `Carte gradée · ${badge.label}` : badge.type === 'sealed' ? 'Produit scellé explicitement mentionné' : `${badge.label} mentionnée dans le commentaire`;
        indicator.setAttribute('aria-label', badge.type === 'grade' ? `${badge.brandName}${badge.grade ? `, note ${badge.grade}` : ''}` : badge.type === 'sealed' ? 'Scellé explicitement mentionné' : `${badge.label} mentionnée dans le commentaire`);
        if (badge.type === 'grade') {
          const image = document.createElement('img');
          image.className = 'cmu-grade-logo';
          image.src = root.chrome?.runtime?.getURL
            ? root.chrome.runtime.getURL(`assets/grading/${badge.brand}.svg`)
            : `assets/grading/${badge.brand}.svg`;
          image.alt = badge.brandName;
          image.decoding = 'async';
          indicator.append(image);
          if (badge.grade) {
            const grade = document.createElement('span');
            grade.className = 'cmu-grade-score';
            grade.textContent = badge.grade;
            indicator.append(grade);
          }
        } else if (badge.type === 'ball') {
          const icon = document.createElement('span');
          icon.className = `cmu-poke-ball-icon cmu-poke-ball-icon--${badge.ball}`;
          icon.setAttribute('aria-hidden', 'true');
          indicator.append(icon);
        } else {
          indicator.textContent = badge.label;
        }
        attributes.append(indicator);
      }
    }
  }

  function enableGalleryMode() {
    const form = document.querySelector('#searchForm');
    if (form && !form.querySelector('input[name="mode"][value="gallery"]')) {
      const mode = document.createElement('input');
      mode.type = 'hidden';
      mode.name = 'mode';
      mode.value = 'gallery';
      form.append(mode);
    }
    for (const anchor of document.querySelectorAll('a[href*="/Products/"]')) {
      try {
        const url = new URL(anchor.getAttribute('href'), location.origin);
        if (url.origin === location.origin && !url.searchParams.has('mode')) {
          url.searchParams.set('mode', 'gallery');
          anchor.href = url.toString();
        }
      } catch { /* Laisse les liens non valides intacts. */ }
    }
  }

  async function addGalleryColumnControl() {
    if (/\/wants\/?$/i.test(location.pathname)) return;
    const galleryIcon = document.querySelector('a.btn.disabled > .fonticon-gallery');
    if (!galleryIcon || !root.chrome?.storage?.local) return;
    const candidates = [...document.querySelectorAll('.row > .d-flex[class*="col-sm-"][class*="col-md-"], #ReprintSection .flex-wrap > .card-column')];
    const groups = new Map();
    for (const item of candidates) {
      const group = groups.get(item.parentElement) || [];
      group.push(item);
      groups.set(item.parentElement, group);
    }
    const [grid, items] = [...groups.entries()].find(([, group]) => group.length > 1) || [];
    if (!grid || !items) return;
    const section = /\/singles\//i.test(location.pathname) ? 'singles' : /\/versions\//i.test(location.pathname) ? 'versions' : /\/spoilers\//i.test(location.pathname) ? 'spoilers' : 'products';
    const key = `cmuGridColumns:${section}`;
    const stored = await chrome.storage.local.get({ [key]: 4 });
    let columns = clampGridColumns(stored[key], innerWidth);
    const control = document.createElement('div');
    control.className = 'cmu-grid-columns cmu-page-tool';
    control.setAttribute('aria-label', 'Colonnes de la grille');
    const less = createButton('−', 'cmu-grid-step', 'Moins de colonnes');
    const value = document.createElement('span');
    const more = createButton('+', 'cmu-grid-step', 'Plus de colonnes');
    control.append(less, value, more);
    galleryIcon.parentElement.insertAdjacentElement('afterend', control);
    const apply = async () => {
      columns = clampGridColumns(columns, innerWidth);
      value.textContent = `${columns} colonnes`;
      grid.classList.add('cmu-gallery-grid');
      grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      await chrome.storage.local.set({ [key]: columns });
    };
    less.addEventListener('click', () => { columns -= 1; void apply(); });
    more.addEventListener('click', () => { columns += 1; void apply(); });
    await apply();
  }

  function addOrderPrintButton() {
    const info = document.querySelector('#SellerBuyerInfo');
    if (!info || info.querySelector('.cmu-print-button')) return;
    const button = createButton('Imprimer la commande', 'cmu-print-button cmu-page-tool', 'Ouvrir l’impression de cette page de commande');
    button.addEventListener('click', () => window.print());
    info.append(button);
  }

  function initializePageTools(settings = {}) {
    if (typeof document === 'undefined') return;
    const options = { ...TOOL_DEFAULTS, ...settings };
    if (!shouldRunPageTools(options)) return;
    const path = location.pathname.toLowerCase();
    if (/\/products\//.test(path) && /\/singles\//.test(path)) {
      attachSpoilerImageLoadOnScroll(path, document, root.window);
      if (isMagicSinglesListingPath(path)) addMagicSummaryArtControl(options);
    }
    if (path.includes('/orders/')) {
      if (featureEnabled(options, 'copyShipmentDetails')) addShipmentCopyTools();
      if (featureEnabled(options, 'printOrders')) addOrderPrintButton();
    }
    if (path.includes('/singles/')) {
      addAuthorHighlight(document, path, featureEnabled(options, 'highlightAuthor'));
      if (featureEnabled(options, 'showRecentOrderLinks')) addRecentOrderLinks();
      if (featureEnabled(options, 'showOfferAttributes') || featureEnabled(options, 'showPokeMasterBallIndicators')) {
        const scanOffers = (rows) => addOfferAttributeBadges(rows, options);
        scanOffers();
        if (!offerAttributeObserver) offerAttributeObserver = observeOfferAttributeChanges(scanOffers);
      }
    }
    if (path.includes('/products/') && featureEnabled(options, 'showConditionPrices')) addConditionPriceSummary();
    if (featureEnabled(options, 'showBlocklistShortcut')) addBlocklistShortcuts();
    if (featureEnabled(options, 'highlightTerms')) addSpecialTermHighlights();
    if (featureEnabled(options, 'forceGridView')) enableGalleryMode();
    if (featureEnabled(options, 'hideSupportTickets')) addSupportTicketControls();
    if (featureEnabled(options, 'showGridColumns')) void addGalleryColumnControl().catch(() => {});
  }

  const api = {
    buildRecentOrderSearchUrl,
    isEnhancedAuthorLink,
    addAuthorHighlight,
    isSellerOfferEditLink,
    getSpecialSearchTerms,
    matchesSpecialSearchTerms,
    getCopyableContact,
    findCardPreviewRow,
    isCardProductImageUrl,
    removeShariffWidgets,
    detectOfferAttributes,
    isBallIndicatorPath,
    detectBallIndicators,
    addOfferAttributeBadges,
    collectOfferRowsFromMutations,
    observeOfferAttributeChanges,
    clampGridColumns,
    shouldRunPageTools,
    isPageToolEnabled: featureEnabled,
    buildBlocklistUrl,
    getExpansionFromSinglesPath,
    groupOrderProgress,
    buildConditionPriceItems,
    isMagicSinglesListingPath,
    shouldForceSpoilerImageLoad,
    attachSpoilerImageLoadOnScroll,
    isMagicSummaryArtTitle,
    findMagicSummaryCardContainers,
    setMagicSummaryCardVisibility,
    observeMagicSummaryCardChanges,
    addMagicSummaryArtControl,
    initializePageTools,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketPageTools = api;
  if (typeof document !== 'undefined' && root.chrome?.storage?.local) {
    CardmarketSettings.loadSettings(chrome.storage.local).then(initializePageTools).catch(() => {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
