(function (root) {
  const GRADING_BRANDS = Object.freeze([
    { id: 'collect-aura', name: 'Collect Aura', pattern: /\b(?:collect[\s-]*aura|ca)(?![a-z])/g },
    { id: 'pure-grading', name: 'Pure Grading', pattern: /\bpure[\s-]*grading(?![a-z])/g },
    { id: 'bgs', name: 'BGS', pattern: /\b(?:beckett|becket|bgs)(?![a-z])/g },
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
  const UNCERTAINTY = /\b(?:maybe|might|could be|may be|contender|chance|worthy|candidate|possible|possibly|probably|probable|perhaps|peut etre|eventuellement|vielleicht|moglicherweise|konnten|quizas|posible|forse|probabilmente|misschien|mogelijk|talvez|possivelmente)\b/;
  const NEGATIONS = new Set(['not', 'non', 'nicht', 'no', 'sin', 'niet', 'nao', 'nie', 'pas', 'sans', 'sem', 'ne', 'ungraded', 'unscored']);
  const NEGATION_BRIDGES = new Set([
    'a', 'an', 'the', 'by', 'factory', 'sealed', 'seald', 'sealled', 'scelle', 'scellee', 'scelles', 'scellees',
    'scele', 'scelee', 'sceles', 'scelees', 'versiegelt', 'eingeschweisst', 'originalverpackt', 'ovp', 'sellado',
    'sellada', 'sellados', 'selladas', 'sellad', 'precintado', 'precintada', 'precintados', 'precintadas',
    'sigillato', 'sigillata', 'sigillati', 'sigillate', 'verzegeld', 'selado', 'selada', 'selados', 'seladas',
    'lacrado', 'lacrada', 'lacrados', 'lacradas', 'graded', 'grade', 'grading', 'encore', 'yet', 'still', 'esta', 'mehr',
  ]);

  function normalizeText(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/,/g, '.');
  }

  function detectOfferTags(text) {
    const value = normalizeText(text);
    if (!value || UNCERTAINTY.test(value)) return [];
    const isNegated = (index) => {
      const context = value.slice(Math.max(0, index - 48), index);
      const boundary = Math.max(context.lastIndexOf('.'), context.lastIndexOf(';'), context.lastIndexOf(','), context.lastIndexOf('·'), context.lastIndexOf('/'), context.lastIndexOf('|'), context.lastIndexOf('\n'));
      const words = context.slice(boundary + 1).match(/[a-z0-9]+/g) || [];
      let negationIndex = -1;
      words.forEach((word, wordIndex) => { if (NEGATIONS.has(word)) negationIndex = wordIndex; });
      if (negationIndex < 0) return false;
      const bridge = words.slice(negationIndex + 1);
      return bridge.length <= 4 && bridge.every((word) => NEGATION_BRIDGES.has(word));
    };
    const isQuestioned = (match) => /^\s*\?/.test(value.slice(match.index + match[0].length));
    const tags = [];
    const sealedPattern = /\b(?:factory[\s-]+)?(?:sealed|seald|sealled|scell(?:e|ee|es|ees)?|scele(?:e|es|ees)?|sceller|versiegel(?:t|te|ten|ter|tes|tem)|eingeschweisst(?:e|en|er|es|em)?|originalverpackt|ovp|sellad[oa]s?|precintad[oa]s?|sigillat[oaie]|verzegeld(?:e|en)?|selad[oa]s?|lacrad[oa]s?|zafoliowan(?:y|a|e|i|ych)|zapieczetowan(?:y|a|e|i|ych)|unopened|unopend|sous\s+blister|in\s+blister)\b/g;
    const sealedMatch = [...value.matchAll(sealedPattern)].find((match) => !isNegated(match.index) && !isQuestioned(match));
    if (sealedMatch) tags.push({ type: 'sealed', label: 'SCELLÉ' });

    const seenBrands = new Set();
    const gradePattern = /^\s*(?:[:=#-]\s*)?(\d{1,2}(?:\.\d+)?(?:\s*\/\s*\d{1,2}(?:\.\d+)?)?)/;
    for (const { id, name, pattern } of GRADING_BRANDS) {
      for (const match of value.matchAll(pattern)) {
        if (seenBrands.has(id) || isNegated(match.index)) continue;
        const suffix = value.slice(match.index + match[0].length);
        const rating = suffix.match(gradePattern);
        const grade = rating ? rating[1].replace(/\s*\/\s*/, '/') : '';
        const afterGrade = suffix.slice(rating?.[0].length || 0);
        const shortCollectAuraAlias = id === 'collect-aura' && match[0] === 'ca';
        if (shortCollectAuraAlias) {
          if (!grade || /^[a-z0-9]/i.test(afterGrade)) continue;
          if (grade.split('/').map(Number).some((score) => !Number.isFinite(score) || score <= 0 || score > 10.5)) continue;
        }
        if (/^\s*\?/.test(afterGrade) || isQuestioned(match)) continue;
        if (grade && Number(grade.split('/')[0]) <= 0) continue;
        if (grade && Number(grade.split('/')[0]) > 10.5) continue;
        seenBrands.add(id);
        tags.push({ type: 'grade', brand: id, brandName: name, grade, label: grade ? `${name} ${grade}` : name });
        break;
      }
    }
    return tags;
  }

  function readOfferText(row) {
    const productAttributes = row.querySelector?.('.product-attributes')?.textContent || '';
    const productInfo = row.querySelector?.('.product-info, .article-name, .product-name, .article-description, [data-product-name]')?.textContent || '';
    const comment = row.querySelector?.('.product-comments')?.textContent || '';
    return [productInfo, productAttributes, comment].filter(Boolean).join(' · ');
  }

  function renderOfferTags(rows, { documentRef = root.document, getURL = root.chrome?.runtime?.getURL?.bind(root.chrome.runtime) } = {}) {
    if (!documentRef?.createElement) return 0;
    let updated = 0;
    for (const row of rows || []) {
      const attributes = row.querySelector?.('.product-attributes');
      const condition = row.querySelector?.('a.article-condition[class*="condition-"]') || row.querySelector?.('.article-condition');
      const target = condition || attributes;
      if (!target) continue;
      const tags = detectOfferTags(readOfferText(row));
      const signature = JSON.stringify(tags);
      if (row.dataset?.cmuOfferTagsSignature === signature) continue;
      const existing = row.querySelector?.('.cmu-offer-tags');
      existing?.remove?.();
      if (row.dataset) row.dataset.cmuOfferTagsSignature = signature;
      if (!tags.length) { updated += 1; continue; }

      const container = documentRef.createElement('span');
      container.className = 'cmu-offer-tags';
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'Détails explicites de l’offre');
      container.dataset.cmuOfferTagsSignature = signature;
      for (const tag of tags) {
        const badge = documentRef.createElement('span');
        badge.className = `cmu-offer-tag cmu-offer-tag--${tag.type}`;
        badge.title = tag.type === 'grade' ? `Société de gradation · ${tag.label}` : 'Mention explicite de produit scellé';
        badge.setAttribute('aria-label', tag.type === 'grade' ? `Carte gradée par ${tag.brandName}${tag.grade ? `, note ${tag.grade}` : ''}` : 'Produit scellé explicitement mentionné');
        if (tag.type === 'grade') {
          const image = documentRef.createElement('img');
          image.className = 'cmu-offer-grade-logo';
          image.src = getURL ? getURL(`assets/grading/${tag.brand}.svg`) : `assets/grading/${tag.brand}.svg`;
          image.alt = tag.brandName;
          image.decoding = 'async';
          badge.append(image);
          if (tag.grade) {
            const score = documentRef.createElement('span');
            score.className = 'cmu-offer-grade-score';
            score.textContent = tag.grade;
            badge.append(score);
          }
        } else {
          badge.textContent = tag.label;
        }
        container.append(badge);
      }
      if (condition?.insertAdjacentElement) condition.insertAdjacentElement('afterend', container);
      else target.append(container);
      updated += 1;
    }
    return updated;
  }

  function installOfferTags({
    documentRef = root.document,
    locationRef = root.location,
    settingsApi = root.CardmarketSettings,
    MutationObserverClass = root.MutationObserver,
    schedule = (callback) => root.requestAnimationFrame
      ? root.requestAnimationFrame(callback)
      : root.setTimeout(callback, 0),
    getURL = root.chrome?.runtime?.getURL?.bind(root.chrome.runtime),
  } = {}) {
    if (!documentRef || !settingsApi?.isOfferLanguageProductPath?.(locationRef?.pathname)) return null;
    let currentTable = null;
    let tableObserver = null;
    let pageObserver = null;
    let scheduled = false;
    const scan = () => renderOfferTags(documentRef.querySelectorAll('.article-table .article-row[id^="articleRow"]'), { documentRef, getURL });
    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;
      schedule(() => { scheduled = false; scan(); });
    };
    const isOwnTagMutation = (record) => {
      const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
      if (target?.closest?.('.cmu-offer-tags')) return true;
      const changes = [...(record.addedNodes || []), ...(record.removedNodes || [])];
      return changes.length > 0 && changes.every((node) => node.matches?.('.cmu-offer-tags'));
    };
    const attachTableObserver = () => {
      const table = documentRef.querySelector('.article-table');
      if (!table || table === currentTable) return Boolean(table);
      currentTable = table;
      tableObserver?.disconnect();
      if (typeof MutationObserverClass === 'function') {
        tableObserver = new MutationObserverClass((records) => {
          if (records.some((record) => !isOwnTagMutation(record))) scheduleScan();
        });
        tableObserver.observe(table, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['aria-label', 'title'],
        });
      }
      scan();
      pageObserver?.disconnect();
      return true;
    };
    if (!attachTableObserver() && typeof MutationObserverClass === 'function' && documentRef.body) {
      pageObserver = new MutationObserverClass(attachTableObserver);
      pageObserver.observe(documentRef.body, { childList: true, subtree: true });
    }
    return { scan, disconnect() { tableObserver?.disconnect(); pageObserver?.disconnect(); } };
  }

  const api = { GRADING_BRANDS, detectOfferTags, readOfferText, renderOfferTags, installOfferTags };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardmarketPokemonOffers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
