const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../settings.js');
const {
  buildRecentOrderSearchUrl,
  getSpecialSearchTerms,
  matchesSpecialSearchTerms,
  getCopyableContact,
  findCardPreviewRow,
  isCardProductImageUrl,
  detectOfferAttributes,
  detectBallIndicators,
  addOfferAttributeBadges,
  observeOfferAttributeChanges,
  clampGridColumns,
  shouldRunPageTools,
  isPageToolEnabled,
  buildBlocklistUrl,
  getExpansionFromSinglesPath,
  groupOrderProgress,
  buildConditionPriceItems,
  removeShariffWidgets,
  isMagicSinglesListingPath,
  shouldForceSpoilerImageLoad,
  attachSpoilerImageLoadOnScroll,
  findMagicSummaryCardContainers,
  setMagicSummaryCardVisibility,
  observeMagicSummaryCardChanges,
  addMagicSummaryArtControl,
  initializePageTools,
  isEnhancedAuthorLink,
  addAuthorHighlight,
  isSellerOfferEditLink,
} = require('../page-tools.js');

test('builds explicit Cardmarket sales and purchase search links', () => {
  const url = buildRecentOrderSearchUrl(
    'https://www.cardmarket.com/en/Pokemon/Products/Search',
    'Pikachu V (SWSH 01)',
    'seller',
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/en/Pokemon/Orders/Search');
  assert.equal(parsed.searchParams.get('productName'), 'Pikachu V (SWSH 01)');
  assert.equal(parsed.searchParams.get('userType'), 'seller');
  assert.equal(parsed.searchParams.get('ehcmSubmit'), 'true');
});

test('recognizes only the Enhanced contributor account link and highlights it only on Singles when enabled', () => {
  assert.equal(isEnhancedAuthorLink('https://www.cardmarket.com/en/Pokemon/Users/maveeee'), true);
  assert.equal(isEnhancedAuthorLink('/en/Pokemon/Users/other-seller'), false);
  assert.equal(isEnhancedAuthorLink('https://example.com/en/Pokemon/Users/maveeee'), false);
  const author = { classList: { values: new Set(), add(name) { this.values.add(name); }, contains(name) { return this.values.has(name); } }, setAttribute(name, value) { this[name] = value; } };
  author.href = 'https://www.cardmarket.com/fr/Pokemon/Users/maveeee';
  const documentRef = { querySelectorAll(selector) { assert.equal(selector, 'a[href$="/Users/maveeee"]'); return [author]; } };
  assert.equal(addAuthorHighlight(documentRef, '/fr/Pokemon/Products/Singles/Set/Card-ABC123', true), 1);
  assert.equal(author.classList.contains('cmu-enhanced-author'), true);
  assert.equal(author.title, 'Auteur d’Enhanced Cardmarket');
  assert.equal(addAuthorHighlight(documentRef, '/fr/Pokemon/Products/Singles/Set/Card-ABC123', false), 0);
  assert.equal(addAuthorHighlight(documentRef, '/fr/Pokemon/Products/Search', true), 0);
});

test('detects the source Article_EditArticleModal trigger without treating arbitrary links as edit actions', () => {
  assert.equal(isSellerOfferEditLink({ getAttribute: (name) => name === 'data-modal' ? '/fr/Pokemon/Stock/Article_EditArticleModal?id=1' : null }), true);
  assert.equal(isSellerOfferEditLink({ getAttribute: (name) => name === 'data-modal' ? '/fr/Pokemon/Stock/Article_ViewModal?id=1' : null }), false);
  assert.equal(isSellerOfferEditLink({ getAttribute: () => null }), false);
});

test('builds recent-order links from a Singles page when its form action is not a product search', () => {
  const url = buildRecentOrderSearchUrl(
    '/en/Pokemon/Products/Singles/151/Sample-V1-ABC123',
    'Pikachu V',
    'buyer',
    '/en/Pokemon/Products/Singles/151/Sample-V1-ABC123',
  );
  assert.equal(new URL(url).pathname, '/en/Pokemon/Orders/Search');
  assert.equal(new URL(url).searchParams.get('userType'), 'buyer');
});

test('accepts card-preview links only inside product rows, excluding breadcrumbs and language menus', () => {
  const { row, link } = createPreviewLinkRow({ rowClass: 'article-row', containerClass: 'article-table' });
  assert.equal(findCardPreviewRow(link, { origin: 'https://www.cardmarket.com', pathname: '/fr/Pokemon/Products/Search' }), row);

  const breadcrumb = fakeNode(['breadcrumb']);
  const crumbLink = fakeNode([], breadcrumb);
  crumbLink.href = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123';
  assert.equal(findCardPreviewRow(crumbLink, { origin: 'https://www.cardmarket.com', pathname: '/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123' }), null);

  const menu = fakeNode(['dropdown-menu']);
  const languageLink = fakeNode([], menu);
  languageLink.href = crumbLink.href;
  assert.equal(findCardPreviewRow(languageLink, { origin: 'https://www.cardmarket.com', pathname: '/fr/Pokemon/Products/Search' }), null);
});

test('places grid card preview controls in the gallery column outside the galleryBox anchor', () => {
  const grid = fakeNode(['cmu-gallery-grid']);
  const column = fakeNode(['d-flex', 'col-sm-6'], grid);
  const cardLink = fakeNode(['galleryBox'], column, 'A');
  cardLink.href = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123';

  const previewRow = findCardPreviewRow(cardLink, { origin: 'https://www.cardmarket.com' });
  assert.equal(previewRow, column);
  assert.notEqual(previewRow, cardLink);
  assert.equal(previewRow.parentElement, grid);
});

test('accepts only Cardmarket product-image assets and rejects generic logos', () => {
  assert.equal(isCardProductImageUrl('https://product-images.s3.cardmarket.com/123/123.jpg'), true);
  assert.equal(isCardProductImageUrl('//product-images.s3.cardmarket.com/987654321/987654321.jpg?hash=abc'), true);
  assert.equal(isCardProductImageUrl('https://static.cardmarket.com/img/logos/cardmarket.png'), false);
  assert.equal(isCardProductImageUrl('https://www.cardmarket.com/img/logos/cardmarket.png'), false);
  assert.equal(isCardProductImageUrl('https://example.com/cards/123.jpg'), false);
});

test('removes only Shariff widgets on Products paths when the feature is enabled', () => {
  const makeDocument = () => {
    const selectors = [];
    const widgets = [{ removed: false, remove() { this.removed = true; } }, { removed: false, remove() { this.removed = true; } }];
    return { selectors, widgets, querySelectorAll(selector) { selectors.push(selector); return widgets; } };
  };
  const productDocument = makeDocument();
  assert.equal(removeShariffWidgets(productDocument, '/fr/Pokemon/Products/Singles/151/Pikachu', true), 2);
  assert.deepEqual(productDocument.selectors, ['.shariff']);
  assert.ok(productDocument.widgets.every((widget) => widget.removed));

  const disabledDocument = makeDocument();
  assert.equal(removeShariffWidgets(disabledDocument, '/fr/Pokemon/Products/Search', false), 0);
  assert.deepEqual(disabledDocument.selectors, []);
  assert.ok(disabledDocument.widgets.every((widget) => !widget.removed));

  const otherPageDocument = makeDocument();
  assert.equal(removeShariffWidgets(otherPageDocument, '/fr/Pokemon/Users/Seller', true), 0);
  assert.deepEqual(otherPageDocument.selectors, []);
});

test('recognizes only Magic Singles listings for the reversible Art and Summary control', () => {
  assert.equal(isMagicSinglesListingPath('/en/Magic/Products/Singles/Avatar-Extras'), true);
  assert.equal(isMagicSinglesListingPath('/fr/Magic/Products/Search'), false);
  assert.equal(isMagicSinglesListingPath('/en/Pokemon/Products/Singles/Set'), false);
  assert.equal(isMagicSinglesListingPath('/en/Magic/Products/Booster-Boxes/Set'), false);

  assert.equal(shouldForceSpoilerImageLoad('/en/Magic/Products/Singles/Avatar-Extras', false), true);
  assert.equal(shouldForceSpoilerImageLoad('/en/Magic/Products/Singles/Set', true), false, 'search forms are left alone');
  assert.equal(shouldForceSpoilerImageLoad('/en/Magic/Products/Search', false), false);
});

test('finds only explicit Art Series and Summary Card columns and restores only its own hiding class', () => {
  const row = { classes: new Set(['row']), classList: { contains(name) { return row.classes.has(name); } } };
  const makeColumn = (titleText, valid = true) => {
    const columnClasses = new Set(['d-flex', 'col-sm-3']);
    const column = {
      tagName: 'DIV', classes: columnClasses,
      classList: {
        contains(name) { return columnClasses.has(name); },
        add(name) { columnClasses.add(name); },
        remove(name) { columnClasses.delete(name); },
      },
      parentElement: row,
    };
    const card = { tagName: 'A', classList: { contains(name) { return name === 'card'; } }, parentElement: column };
    const title = { textContent: titleText, closest(selector) { return selector === 'a.card' && valid ? card : null; } };
    return { column, title };
  };
  const summary = makeColumn('Summary Card: Pikachu');
  const art = makeColumn('Art Series: Eevee');
  const normal = makeColumn('Pikachu V');
  const detached = makeColumn('Art Series: Orphan', false);
  const titles = [summary.title, art.title, normal.title, detached.title];
  const selectors = [];
  const documentRef = { querySelectorAll(selector) { selectors.push(selector); return titles; } };

  const targets = findMagicSummaryCardContainers(documentRef, '/en/Magic/Products/Singles/Avatar-Extras');
  assert.deepEqual(targets, [summary.column, art.column]);
  assert.ok(selectors.some((selector) => selector.includes('.card-title')));
  assert.equal(findMagicSummaryCardContainers(documentRef, '/en/Pokemon/Products/Singles/Set').length, 0);
  assert.equal(setMagicSummaryCardVisibility(targets, true), 2);
  assert.equal(summary.column.classList.contains('cmu-magic-art-summary-hidden'), true);
  assert.equal(setMagicSummaryCardVisibility(targets, false), 2);
  assert.equal(summary.column.classList.contains('cmu-magic-art-summary-hidden'), false);
});

test('reschedules a local scan when listing cards load dynamically', () => {
  let callback;
  let observed;
  class FakeMutationObserver {
    constructor(handler) { callback = handler; }
    observe(target, options) { observed = { target, options }; }
  }
  const scheduled = [];
  const grid = {};
  let scans = 0;
  const observer = observeMagicSummaryCardChanges(grid, () => { scans += 1; }, {
    MutationObserverClass: FakeMutationObserver,
    schedule: (fn) => scheduled.push(fn),
  });
  assert.ok(observer instanceof FakeMutationObserver);
  assert.deepEqual(observed, { target: grid, options: { childList: true, subtree: true } });
  callback([{ type: 'childList', target: grid, addedNodes: [{}], removedNodes: [] }]);
  callback([{ type: 'childList', target: grid, addedNodes: [{}], removedNodes: [] }]);
  assert.equal(scheduled.length, 1, 'several product insertions are coalesced');
  scheduled[0]();
  assert.equal(scans, 1);
  callback([{ type: 'attributes', target: grid, addedNodes: [], removedNodes: [] }]);
  assert.equal(scheduled.length, 1, 'class changes from our own hide class are not observed');
});

test('dynamic card insertion is rescanned and hidden only while the local toggle is enabled', () => {
  let callback;
  class FakeMutationObserver { constructor(handler) { callback = handler; } observe() {} }
  const scheduled = [];
  const makeCard = (text) => {
    const classes = new Set(['d-flex', 'col-md-3']);
    const column = { tagName: 'DIV', classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    } };
    const card = { tagName: 'A', classList: { contains: (name) => name === 'card' }, parentElement: column };
    return { column, title: { textContent: text, closest: (selector) => selector === 'a.card' ? card : null } };
  };
  let cards = [makeCard('Summary Card: First')];
  const documentRef = { querySelectorAll() { return cards.map((card) => card.title); } };
  let hidden = true;
  const scan = () => setMagicSummaryCardVisibility(
    findMagicSummaryCardContainers(documentRef, '/en/Magic/Products/Singles/Set'), hidden,
  );
  scan();
  assert.equal(cards[0].column.classList.contains('cmu-magic-art-summary-hidden'), true);
  observeMagicSummaryCardChanges({}, scan, { MutationObserverClass: FakeMutationObserver, schedule: (fn) => scheduled.push(fn) });

  const added = makeCard('Art Series: Second');
  cards.push(added);
  callback([{ type: 'childList', addedNodes: [{}], removedNodes: [] }]);
  scheduled.shift()();
  assert.equal(added.column.classList.contains('cmu-magic-art-summary-hidden'), true, 'new matching cards are hidden on the next scan');

  hidden = false;
  scan();
  assert.equal(cards[0].column.classList.contains('cmu-magic-art-summary-hidden'), false);
  assert.equal(added.column.classList.contains('cmu-magic-art-summary-hidden'), false, 'turning the toggle off restores dynamically added cards');
});

test('debounces the source-compatible scroll load event and skips search forms', () => {
  const listeners = {};
  const dispatched = [];
  const timers = new Map();
  let timerId = 0;
  const windowRef = {
    addEventListener(type, listener, options) { listeners[type] = { listener, options }; },
    dispatchEvent(event) { dispatched.push(event.type); },
  };
  const documentRef = { querySelector() { return null; } };
  class FakeEvent { constructor(type) { this.type = type; } }
  const handler = attachSpoilerImageLoadOnScroll('/en/Pokemon/Products/Singles/Set', documentRef, windowRef, {
    EventClass: FakeEvent,
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  assert.equal(typeof handler, 'function');
  assert.equal(listeners.scroll.options.passive, true);
  handler();
  handler();
  assert.equal(timers.size, 1, 'repeated scrolling leaves only one pending event');
  const [pending] = [...timers.values()];
  assert.equal(pending.delay, 250);
  pending.callback();
  assert.deepEqual(dispatched, ['load']);

  const searchWindow = { addEventListener() { throw new Error('must not bind on search form pages'); }, dispatchEvent() {} };
  assert.equal(attachSpoilerImageLoadOnScroll('/en/Magic/Products/Singles/Set', {
    querySelector(selector) { return selector === '.filter-form input[name="searchString"]' ? {} : null; },
  }, searchWindow), null);
  assert.equal(attachSpoilerImageLoadOnScroll('/en/Magic/Products/Search', documentRef, searchWindow), null);
});

test('Magic Art and Summary toggle starts from its saved gate and persists explicit show/hide changes', async () => {
  const previous = captureGlobals(['document', 'location', 'chrome']);
  const stored = [];
  const row = { classes: new Set(['row']) };
  const columnClasses = new Set(['d-flex', 'col-md-3']);
  const column = {
    tagName: 'DIV',
    classList: {
      contains(name) { return columnClasses.has(name); },
      add(name) { columnClasses.add(name); },
      remove(name) { columnClasses.delete(name); },
    },
    parentElement: row,
  };
  const card = { tagName: 'A', classList: { contains: (name) => name === 'card' }, parentElement: column };
  const title = { textContent: 'Art Series: Avatar', closest: (selector) => selector === 'a.card' ? card : null };
  const nodes = [];
  const createNode = (tagName) => {
    const classes = new Set();
    const node = {
      tagName: tagName.toUpperCase(), children: [], listeners: [], attributes: {}, checked: false, textContent: '',
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      set className(value) { this._className = value; value.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
      get className() { return this._className || ''; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(...children) { this.children.push(...children); },
      addEventListener(type, listener) { this.listeners.push({ type, listener }); },
    };
    nodes.push(node);
    return node;
  };
  const host = { inserted: null, insertAdjacentElement(position, element) { this.inserted = { position, element }; } };
  const hits = { parentElement: host };
  const grid = { insertAdjacentElement() {} };
  try {
    global.location = { pathname: '/en/Magic/Products/Singles/Avatar-Extras' };
    global.chrome = { storage: { local: { set(value) { stored.push(value); return Promise.resolve(); } } } };
    global.document = {
      createElement: createNode,
      querySelector(selector) {
        if (selector === '.cmu-magic-art-summary-controls') return null;
        if (selector === '.col-auto.d-none.d-md-block') return hits;
        if (selector === '.row[data-ehcm-grid-parent], .cmu-gallery-grid') return grid;
        return null;
      },
      querySelectorAll() { return [title]; },
    };
    const controls = addMagicSummaryArtControl({ enabled: true, hideMagicArtSummary: true });
    assert.ok(controls);
    assert.equal(host.inserted.position, 'afterend');
    const checkbox = nodes.find((node) => node.tagName === 'INPUT');
    assert.equal(checkbox.checked, true);
    assert.equal(column.classList.contains('cmu-magic-art-summary-hidden'), true);
    assert.deepEqual(stored, [], 'initialization never persists or changes the selected state');
    checkbox.checked = false;
    await checkbox.listeners[0].listener();
    assert.equal(column.classList.contains('cmu-magic-art-summary-hidden'), false, 'unchecking restores the cards');
    checkbox.checked = true;
    await checkbox.listeners[0].listener();
    assert.equal(column.classList.contains('cmu-magic-art-summary-hidden'), true, 'checking hides only the target card wrappers');
    assert.deepEqual(stored, [{ hideMagicArtSummary: false }, { hideMagicArtSummary: true }]);
  } finally {
    restoreGlobals(previous);
  }
});

test('the master switch prevents Magic listing controls and scroll listeners from initializing', () => {
  const previous = captureGlobals(['document', 'location', 'window']);
  try {
    global.document = { querySelector() { throw new Error('disabled extension must not inspect page DOM'); } };
    global.location = { pathname: '/en/Magic/Products/Singles/Avatar-Extras' };
    global.window = { addEventListener() { throw new Error('disabled extension must not bind scroll handlers'); } };
    assert.doesNotThrow(() => initializePageTools({ enabled: false, hideMagicArtSummary: true }));
  } finally {
    restoreGlobals(previous);
  }
});

function createPreviewLinkRow({ rowClass, containerClass }) {
  const container = fakeNode([containerClass]);
  const row = fakeNode([rowClass], container);
  const link = fakeNode([], row);
  link.href = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123';
  return { row, link };
}

test('finds only configured special terms and matches result names by token', () => {
  const terms = getSpecialSearchTerms('Pokémon EX V (GX)');
  assert.deepEqual(terms, ['ex', 'gx', 'v']);
  assert.equal(matchesSpecialSearchTerms('Charizard ex', terms), true);
  assert.equal(matchesSpecialSearchTerms('Charizard VSTAR', terms), false);
});

test('identifies only explicit sealed or graded offer claims', () => {
  assert.deepEqual(detectOfferAttributes('Factory sealed · PSA 10'), [
    { type: 'sealed', label: 'SCELLÉ' },
    { type: 'grade', brand: 'psa', brandName: 'PSA', grade: '10', label: 'PSA 10' },
  ]);
  assert.deepEqual(detectOfferAttributes('not sealed; possible PSA 10'), []);
  assert.deepEqual(detectOfferAttributes('Beckett 9.5'), [{ type: 'grade', brand: 'bgs', brandName: 'BGS', grade: '9.5', label: 'BGS 9.5' }]);
});

test('detects explicit multilingual sealed and grading tags without marking hypothetical or negative claims', () => {
  assert.deepEqual(detectOfferAttributes('Scellé sous blister · PCA 9'), [
    { type: 'sealed', label: 'SCELLÉ' },
    { type: 'grade', brand: 'pca', brandName: 'PCA', grade: '9', label: 'PCA 9' },
  ]);
  for (const claim of [
    'scellée', 'scellés', 'scellées', 'sellada', 'sellados', 'sigillata', 'sigillati',
    'versiegelte', 'eingeschweißte', 'verzegelde', 'seladas', 'lacrados',
  ]) {
    assert.deepEqual(detectOfferAttributes(claim), [{ type: 'sealed', label: 'SCELLÉ' }], claim);
  }
  assert.deepEqual(detectOfferAttributes('Versiegelt / CCC'), [
    { type: 'sealed', label: 'SCELLÉ' },
    { type: 'grade', brand: 'ccc', brandName: 'CCC', grade: '', label: 'CCC' },
  ]);
  assert.deepEqual(detectOfferAttributes('Sellado · PSA 10'), [
    { type: 'sealed', label: 'SCELLÉ' },
    { type: 'grade', brand: 'psa', brandName: 'PSA', grade: '10', label: 'PSA 10' },
  ]);
  assert.deepEqual(detectOfferAttributes('Sigillato, CGC 9.5'), [
    { type: 'sealed', label: 'SCELLÉ' },
    { type: 'grade', brand: 'cgc', brandName: 'CGC', grade: '9.5', label: 'CGC 9.5' },
  ]);
  assert.deepEqual(detectOfferAttributes('PCA9'), [{ type: 'grade', brand: 'pca', brandName: 'PCA', grade: '9', label: 'PCA 9' }]);
  assert.deepEqual(detectOfferAttributes('not sealed but factory sealed · PCA 9'), [
    { type: 'sealed', label: 'SCELLÉ' },
    { type: 'grade', brand: 'pca', brandName: 'PCA', grade: '9', label: 'PCA 9' },
  ]);
  for (const claim of [
    'not sealed · maybe PSA 10',
    'not PSA 10',
    'non scellé · pas encore gradé PCA 9',
    'nicht versiegelt · vielleicht CCC',
    'no está sellado · posible PSA 10',
    'non sigillato · probabilmente CGC 9',
    'ongezegeld · mogelijk BGS 9.5',
    'niet verzegeld',
    'não lacrado',
    'sealed? · PCA 9?',
    'seal of approval · card 151',
  ]) assert.deepEqual(detectOfferAttributes(claim), [], claim);
});

test('recognizes screenshot grading aliases, formats and decimal commas', () => {
  const cases = [
    ['Ccc 9', 'ccc', 'CCC', '9', 'CCC 9'],
    ['ccc 9.5', 'ccc', 'CCC', '9.5', 'CCC 9.5'],
    ['AGS 9,5', 'ags', 'AGS', '9.5', 'AGS 9.5'],
    ['Collect Aura 9.5/10', 'collect-aura', 'Collect Aura', '9.5/10', 'Collect Aura 9.5/10'],
    ['Collect-Aura:9,5 / 10', 'collect-aura', 'Collect Aura', '9.5/10', 'Collect Aura 9.5/10'],
    ['Pure grading 9.5', 'pure-grading', 'Pure Grading', '9.5', 'Pure Grading 9.5'],
    ['PSA 10', 'psa', 'PSA', '10', 'PSA 10'],
    ['CGC 10', 'cgc', 'CGC', '10', 'CGC 10'],
    ['BGS 9.5', 'bgs', 'BGS', '9.5', 'BGS 9.5'],
  ];
  for (const [claim, brand, brandName, grade, label] of cases) {
    assert.deepEqual(detectOfferAttributes(claim), [{ type: 'grade', brand, brandName, grade, label }], claim);
  }
  for (const claim of ['not AGS 9.5', 'possible Collect Aura 9.5', 'Pure grading 11', 'PCA 9,5?']) {
    assert.deepEqual(detectOfferAttributes(claim), [], claim);
  }
});

test('recognizes the short Collect Aura alias only with a plausible grading score', () => {
  for (const [claim, grade] of [['CA 9.5', '9.5'], ['CA10', '10'], ['ca 9,5/10', '9.5/10']]) {
    assert.deepEqual(detectOfferAttributes(claim), [{
      type: 'grade', brand: 'collect-aura', brandName: 'Collect Aura', grade, label: `Collect Aura ${grade}`,
    }], claim);
  }
  for (const claim of ['CA', 'CA 11', 'CA 0', 'CA 9.5?', 'CA 10abc', 'CA 9.5/100', 'CAs 10', 'not CA 9.5']) {
    assert.deepEqual(detectOfferAttributes(claim), [], claim);
  }
});

test('keeps historical grading wordmarks out of the Pokémon release package', () => {
  const brands = ['psa', 'cgc', 'bgs', 'pca', 'ccc', 'ags', 'collect-aura', 'pure-grading', 'ace', 'tag', 'sgc', 'graad', 'mnt', 'ars', 'ksa', 'gma', 'hga'];
  const assetsDir = path.join(__dirname, '..', 'assets', 'grading');
  for (const brand of brands) {
    const svg = fs.readFileSync(path.join(assetsDir, `${brand}.svg`), 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, /<text/);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.ok(manifest.web_accessible_resources.every((entry) => !entry.resources.includes('assets/grading/*.svg')));
});

function fakeNode(classes = [], parentElement = null, tagName = 'DIV') {
  const node = { nodeType: 1, classes: new Set(classes), parentElement, children: [], isConnected: true, tagName };
  node.classList = { contains: (name) => node.classes.has(name), [Symbol.iterator]: () => node.classes[Symbol.iterator]() };
  if (parentElement) parentElement.children.push(node);
  node.matches = (selector) => selector.split(',').some((part) => node.classes.has(part.trim().replace(/^\./, '')));
  node.closest = (selector) => {
    for (let current = node; current; current = current.parentElement) if (current.matches?.(selector)) return current;
    return null;
  };
  node.querySelectorAll = (selector) => {
    const found = [];
    const visit = (parent) => parent.children.forEach((child) => {
      if (child.matches?.(selector)) found.push(child);
      visit(child);
    });
    visit(node);
    return found;
  };
  return node;
}

test('observes changed offer rows once and ignores its own badge mutations', () => {
  let mutationCallback;
  let options;
  class FakeMutationObserver {
    constructor(callback) { mutationCallback = callback; }
    observe(target, observedOptions) { options = { target, ...observedOptions }; }
  }
  const scheduled = [];
  const scans = [];
  const table = fakeNode(['article-table']);
  const row = fakeNode(['article-row'], table);
  const comments = fakeNode(['product-comments'], row);
  const attributes = fakeNode(['product-attributes'], row);
  const observer = observeOfferAttributeChanges((rows) => scans.push(rows), {
    MutationObserverClass: FakeMutationObserver,
    schedule: (callback) => scheduled.push(callback),
    target: table,
  });
  assert.ok(observer instanceof FakeMutationObserver);
  assert.equal(options.target, table);
  assert.equal(options.characterData, true);
  assert.equal(options.attributes, true);
  assert.deepEqual(options.attributeFilter, ['aria-label', 'title']);

  const textNode = { nodeType: 3, parentElement: comments };
  mutationCallback([{ type: 'characterData', target: textNode, addedNodes: [], removedNodes: [] }]);
  mutationCallback([{ type: 'characterData', target: textNode, addedNodes: [], removedNodes: [] }]);
  assert.equal(scheduled.length, 1, 'several updates are coalesced into one frame');
  scheduled.shift()();
  assert.deepEqual(scans, [[row]]);

  const insertedRow = fakeNode(['article-row'], table);
  fakeNode(['product-comments'], insertedRow);
  mutationCallback([{ type: 'childList', target: table, addedNodes: [insertedRow], removedNodes: [] }]);
  assert.equal(scheduled.length, 1, 'a newly inserted offer schedules a scan');
  scheduled.shift()();
  assert.deepEqual(scans[1], [insertedRow]);

  const badge = fakeNode(['cmu-offer-attribute'], attributes);
  mutationCallback([{ type: 'childList', target: attributes, addedNodes: [badge], removedNodes: [] }]);
  assert.equal(scheduled.length, 0, 'badge insertion does not schedule another scan');
  mutationCallback([{ type: 'attributes', target: badge, attributeName: 'aria-label', addedNodes: [], removedNodes: [] }]);
  assert.equal(scheduled.length, 0, 'badge metadata updates do not schedule another scan');
});

test('rescans a CA 9.5 offer when Cardmarket updates its comment accessibility label', () => {
  const previous = { document: global.document, location: global.location, chrome: global.chrome };
  let mutationCallback;
  let observedOptions;
  class FakeMutationObserver {
    constructor(callback) { mutationCallback = callback; }
    observe(_target, options) { observedOptions = options; }
  }
  function element(className = '') {
    const result = {
      nodeType: 1, className, parentElement: null, childNodes: [], dataset: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(child) { child.parentElement = this; this.childNodes.push(child); },
      matches(selector) { return selector.split(',').some((part) => this.className.split(/\s+/).includes(part.trim().replace(/^\./, ''))); },
      closest(selector) {
        for (let current = this; current; current = current.parentElement) if (current.matches?.(selector)) return current;
        return null;
      },
      querySelectorAll(selector) {
        const found = [];
        const visit = (parent) => (parent.childNodes || []).forEach((child) => {
          if (child.matches?.(selector)) found.push(child);
          visit(child);
        });
        visit(this);
        return found;
      },
      remove() {
        if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this);
      },
    };
    Object.defineProperty(result, 'textContent', {
      get() { return this.childNodes.map((child) => child.textContent || '').join(''); },
      set(value) { this.childNodes = [{ nodeType: 3, textContent: String(value), parentElement: this }]; },
    });
    return result;
  }
  try {
    global.document = { createElement: () => element() };
    global.location = { pathname: '/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123' };
    global.chrome = { runtime: { getURL: (asset) => `chrome-extension://test/${asset}` } };
    const table = element('article-table');
    const row = element('article-row');
    row.parentElement = table;
    const comments = element('product-comments');
    comments.parentElement = row;
    comments.textContent = '';
    const attributes = element('product-attributes');
    attributes.parentElement = row;
    attributes.textContent = 'MT';
    row.querySelector = (selector) => selector === '.product-comments' ? comments : selector === '.product-attributes' ? attributes : null;

    addOfferAttributeBadges([row], { enabled: true, showOfferAttributes: false });
    assert.equal(attributes.dataset.cmuOfferSignature, '[]');
    const scheduled = [];
    observeOfferAttributeChanges((rows) => addOfferAttributeBadges(rows, { enabled: true, showOfferAttributes: true }), {
      MutationObserverClass: FakeMutationObserver,
      schedule: (callback) => scheduled.push(callback),
      target: table,
    });
    assert.equal(observedOptions.attributes, true);
    comments.textContent = 'CA 9.5';
    if (observedOptions.attributes && observedOptions.attributeFilter.includes('aria-label')) {
      mutationCallback([{ type: 'attributes', target: comments, attributeName: 'aria-label', addedNodes: [], removedNodes: [] }]);
    }
    assert.equal(scheduled.length, 1);
    scheduled.shift()();
    const badge = attributes.querySelectorAll('.cmu-grade-brand')[0];
    assert.ok(badge, 'dynamic comment gets a grading brand badge');
    assert.equal(badge.childNodes[0].alt, 'Collect Aura');
    assert.equal(badge.childNodes[1].textContent, '9.5');
  } finally {
    for (const key of ['document', 'location', 'chrome']) {
      if (previous[key] === undefined) delete global[key];
      else global[key] = previous[key];
    }
  }
});

test('renders local brand wordmarks in the attributes cell and replaces stale badges without duplicates', () => {
  const previous = { document: global.document, location: global.location, chrome: global.chrome };
  function element(tagName) {
    const result = {
      nodeType: 1, tagName: tagName.toUpperCase(), className: '', parentElement: null, childNodes: [], dataset: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(child) { child.parentElement = this; this.childNodes.push(child); },
      matches(selector) {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        return selector.split(',').some((part) => classes.has(part.trim().replace(/^\./, '')));
      },
      closest(selector) {
        for (let current = this; current; current = current.parentElement) if (current.matches?.(selector)) return current;
        return null;
      },
      querySelectorAll(selector) {
        const results = [];
        const visit = (parent) => (parent.childNodes || []).forEach((child) => {
          if (child.matches?.(selector)) results.push(child);
          visit(child);
        });
        visit(this);
        return results;
      },
      remove() {
        if (!this.parentElement) return;
        this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this);
        this.parentElement = null;
      },
    };
    Object.defineProperty(result, 'textContent', {
      get() { return this.childNodes.map((child) => child.textContent || '').join(''); },
      set(value) { this.childNodes = [{ nodeType: 3, textContent: String(value), parentElement: this }]; },
    });
    return result;
  }
  try {
    global.document = { createElement: (tagName) => element(tagName) };
    global.location = { pathname: '/en/Pokemon/Products/Singles/Set/Card' };
    global.chrome = { runtime: { getURL: (asset) => `chrome-extension://test/${asset}` } };
    const row = element('div');
    row.className = 'article-row';
    row.isConnected = true;
    const comments = element('div');
    comments.className = 'product-comments';
    comments.textContent = 'Ccc 9';
    const attributes = element('div');
    attributes.className = 'product-attributes';
    attributes.textContent = 'Near Mint';
    row.querySelector = (selector) => selector === '.product-comments' ? comments : selector === '.product-attributes' ? attributes : null;

    const renderGradingBadges = (rows) => addOfferAttributeBadges(rows, { enabled: true, showOfferAttributes: true });
    renderGradingBadges([row]);
    let badges = attributes.querySelectorAll('.cmu-offer-attribute');
    assert.equal(badges.length, 1);
    assert.match(badges[0].className, /cmu-grade-brand/);
    assert.equal(badges[0].attributes['aria-label'], 'CCC, note 9');
    assert.equal(badges[0].childNodes[0].alt, 'CCC');
    assert.equal(badges[0].childNodes[0].src, 'chrome-extension://test/assets/grading/ccc.svg');
    assert.equal(badges[0].childNodes[1].textContent, '9');

    renderGradingBadges([row]);
    assert.equal(attributes.querySelectorAll('.cmu-offer-attribute').length, 1, 'unchanged row is idempotent');
    comments.textContent = 'AGS 9.5';
    renderGradingBadges([row]);
    badges = attributes.querySelectorAll('.cmu-offer-attribute');
    assert.equal(badges.length, 1, 'updated comment replaces the previous brand badge');
    assert.equal(badges[0].childNodes[0].alt, 'AGS');
    comments.textContent = 'CA10';
    renderGradingBadges([row]);
    badges = attributes.querySelectorAll('.cmu-offer-attribute');
    assert.equal(badges.length, 1);
    assert.equal(badges[0].childNodes[0].alt, 'Collect Aura');
    assert.equal(badges[0].childNodes[0].src, 'chrome-extension://test/assets/grading/collect-aura.svg');
    assert.equal(badges[0].attributes['aria-label'], 'Collect Aura, note 10');
    comments.textContent = 'Factory sealed';
    renderGradingBadges([row]);
    badges = attributes.querySelectorAll('.cmu-offer-attribute');
    assert.equal(badges.length, 1);
    assert.match(badges[0].className, /cmu-sealed/);
    assert.equal(badges[0].textContent, 'SCELLÉ');
  } finally {
    for (const key of ['document', 'location', 'chrome']) {
      if (previous[key] === undefined) delete global[key];
      else global[key] = previous[key];
    }
  }
});

test('renders every mapped grading wordmark in the offer-attributes cell and applies its individual gate', () => {
  const previous = { document: global.document, location: global.location, chrome: global.chrome };
  function element(tagName) {
    const result = {
      nodeType: 1, tagName: tagName.toUpperCase(), className: '', parentElement: null, childNodes: [], dataset: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(child) { child.parentElement = this; this.childNodes.push(child); },
      matches(selector) { const names = new Set(this.className.split(/\s+/).filter(Boolean)); return selector.split(',').some((part) => names.has(part.trim().replace(/^\./, ''))); },
      querySelectorAll(selector) { return this.childNodes.filter((child) => child.matches?.(selector)); },
      remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this); },
    };
    Object.defineProperty(result, 'textContent', { get() { return this.childNodes.map((child) => child.textContent || '').join(''); }, set(value) { this.childNodes = [{ nodeType: 3, textContent: String(value), parentElement: this }]; } });
    return result;
  }
  try {
    global.document = { createElement: (tagName) => element(tagName) };
    global.location = { pathname: '/en/Pokemon/Products/Singles/Set/Card' };
    global.chrome = { runtime: { getURL: (asset) => `chrome-extension://test/${asset}` } };
    const comments = element('div'); comments.className = 'product-comments';
    const attributes = element('div'); attributes.className = 'product-attributes'; attributes.textContent = 'Near Mint';
    const row = { querySelector(selector) { return selector === '.product-comments' ? comments : selector === '.product-attributes' ? attributes : null; } };
    const brands = [
      ['PCA 9', 'pca', 'PCA'], ['PSA 10', 'psa', 'PSA'], ['CCC 9', 'ccc', 'CCC'], ['CGC 9.5', 'cgc', 'CGC'],
      ['BGS 9', 'bgs', 'BGS'], ['AGS 9.5', 'ags', 'AGS'], ['Collect Aura 9.5', 'collect-aura', 'Collect Aura'],
      ['Pure Grading 10', 'pure-grading', 'Pure Grading'], ['ACE 9', 'ace', 'ACE'], ['TAG 10', 'tag', 'TAG'],
      ['SGC 9', 'sgc', 'SGC'], ['GRAAD 9', 'graad', 'GRAAD'], ['MNT 9', 'mnt', 'MNT'], ['ARS 9', 'ars', 'ARS'],
      ['KSA 9', 'ksa', 'KSA'], ['GMA 9', 'gma', 'GMA'], ['HGA 9', 'hga', 'HGA'],
    ];
    for (const [claim, asset, alt] of brands) {
      comments.textContent = claim;
      addOfferAttributeBadges([row], { enabled: true, showOfferAttributes: true, showPokeMasterBallIndicators: false });
      const badge = attributes.querySelectorAll('.cmu-offer-attribute')[0];
      assert.ok(badge?.className.includes('cmu-grade-brand'), `${claim} badge is in the offer-attributes cell`);
      assert.equal(badge.childNodes[0].src, `chrome-extension://test/assets/grading/${asset}.svg`);
      assert.equal(badge.childNodes[0].alt, alt);
      assert.equal(badge.attributes['aria-label'].startsWith(alt), true);
      addOfferAttributeBadges([row], { enabled: true, showOfferAttributes: false, showPokeMasterBallIndicators: false });
      assert.equal(attributes.querySelectorAll('.cmu-offer-attribute').length, 0, `${claim} is removed with its flag off`);
    }
  } finally {
    for (const key of ['document', 'location', 'chrome']) {
      if (previous[key] === undefined) delete global[key];
      else global[key] = previous[key];
    }
  }
});

test('detects Poké Ball and Master Ball only on the source-supported Pokémon Singles sets', () => {
  assert.equal(typeof detectBallIndicators, 'function');
  assert.deepEqual(detectBallIndicators('Poké Ball', '/fr/Pokemon/Products/Singles/151/Mew-151-205'), [
    { type: 'ball', ball: 'poke', label: 'Poké Ball' },
  ]);
  assert.deepEqual(detectBallIndicators('Masterball', '/fr/Pokemon/Products/Singles/White-Flare/Reshiram'), [
    { type: 'ball', ball: 'master', label: 'Master Ball' },
  ]);
  assert.deepEqual(detectBallIndicators('Poke Ball · Master Ball', '/fr/Pokemon/Products/Singles/Black-Bolt/Zekrom'), [
    { type: 'ball', ball: 'poke', label: 'Poké Ball' },
    { type: 'ball', ball: 'master', label: 'Master Ball' },
  ]);
  assert.deepEqual(detectBallIndicators('Poké Ball', '/fr/Pokemon/Products/Singles/Example-Set/Pikachu'), []);
  assert.deepEqual(detectBallIndicators('Poké Ball', '/fr/Pokemon/Products/Booster-Boxes/151-Box'), []);
  for (const comment of ['not a Poké Ball', 'possible Master Ball', 'Poke Ball?', 'No Masterball included']) {
    assert.deepEqual(detectBallIndicators(comment, '/fr/Pokemon/Products/Singles/151/Mew'), [], comment);
  }
});

test('ball badges share offer attributes placement and obey their independent feature switch', () => {
  const previous = { document: global.document, location: global.location, chrome: global.chrome };
  function element(tagName) {
    const node = {
      tagName: tagName.toUpperCase(), className: '', childNodes: [], parentElement: null, dataset: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(child) { child.parentElement = this; this.childNodes.push(child); },
      matches(selector) { return selector.split(',').some((part) => this.className.split(/\s+/).includes(part.trim().replace(/^\./, ''))); },
      querySelectorAll(selector) { return this.childNodes.filter((child) => child.matches?.(selector)); },
      remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this); },
    };
    Object.defineProperty(node, 'textContent', { get() { return this.childNodes.map((child) => child.textContent || '').join(''); }, set(value) { this.childNodes = [{ textContent: String(value), parentElement: this }]; } });
    return node;
  }
  try {
    global.document = { createElement: (tag) => element(tag) };
    global.location = { pathname: '/fr/Pokemon/Products/Singles/151/Mew-151-205' };
    global.chrome = { runtime: { getURL: (name) => `chrome-extension://test/${name}` } };
    const comments = element('div'); comments.className = 'product-comments'; comments.textContent = 'Poke Ball';
    const attributes = element('div'); attributes.className = 'product-attributes'; attributes.textContent = 'NM';
    const row = { querySelector(selector) { return selector === '.product-comments' ? comments : selector === '.product-attributes' ? attributes : null; } };
    addOfferAttributeBadges([row], { enabled: true, showOfferAttributes: false, showPokeMasterBallIndicators: true });
    let badges = attributes.querySelectorAll('.cmu-offer-attribute');
    assert.equal(badges.length, 1);
    assert.match(badges[0].className, /cmu-poke-ball--poke/);
    assert.equal(badges[0].attributes['aria-label'], 'Poké Ball mentionnée dans le commentaire');
    addOfferAttributeBadges([row], { enabled: true, showOfferAttributes: false, showPokeMasterBallIndicators: false });
    badges = attributes.querySelectorAll('.cmu-offer-attribute');
    assert.equal(badges.length, 0, 'disabled ball setting removes the old badge');
  } finally {
    for (const key of ['document', 'location', 'chrome']) {
      if (previous[key] === undefined) delete global[key];
      else global[key] = previous[key];
    }
  }
});

test('extracts only well-formed visible email and international phone values', () => {
  assert.equal(getCopyableContact('Email: buyer@example.org', 'email'), 'buyer@example.org');
  assert.equal(getCopyableContact('+33 6 12 34 56 78', 'phone'), '+33 6 12 34 56 78');
  assert.equal(getCopyableContact('contact the seller', 'email'), null);
  assert.equal(getCopyableContact('12345', 'phone'), null);
});

test('shipment copy controls copy only after an explicit click and respect their feature gate', async () => {
  const previous = captureGlobals(['document', 'location', 'navigator', 'window', 'setTimeout']);
  const copied = [];
  const makeNode = (tagName, textContent = '', queryMap = {}) => {
    const node = {
      tagName: tagName.toUpperCase(), textContent, children: [], listeners: {}, queryMap, attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      append(child) { child.parentElement = this; this.children.push(child); },
      insertAdjacentElement(_position, child) { this.append(child); },
      querySelector(selector) {
        if (selector === ':scope > .cmu-copy-button') return this.children.find((child) => child.className?.includes('cmu-copy-button')) || null;
        return this.queryMap[selector] || null;
      },
      querySelectorAll(selector) { return this.queryMap[selector] || []; },
    };
    return node;
  };
  try {
    const emailTarget = makeNode('span');
    const email = makeNode('span', 'buyer@example.org');
    email.nextElementSibling = emailTarget;
    const phone = makeNode('dd', '+33 6 12 34 56 78');
    const details = makeNode('div', '', { span: [email], dd: [phone] });
    const shippingLink = makeNode('a');
    shippingLink.closest = (selector) => selector === '.shipment-detail-collapse' ? details : null;
    const lineOne = makeNode('div', '12 rue des Cartes');
    const lineTwo = makeNode('div', '75000 Paris');
    const address = makeNode('div', '', { div: [lineOne, lineTwo] });
    const addressParent = makeNode('div', '', { '#ShippingAddress': address });
    const addressHeading = makeNode('h3', 'Adresse de livraison');
    addressHeading.parentElement = addressParent;
    const document = {
      body: makeNode('body'),
      createElement(tag) { return makeNode(tag); },
      querySelector(selector) {
        if (selector === 'a[href*="/ShippingCosts"]') return shippingLink;
        if (selector === '.shipping-address h3') return addressHeading;
        return null;
      },
    };
    global.document = document;
    global.location = { pathname: '/fr/Orders/123', origin: 'https://www.cardmarket.com' };
    Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: { clipboard: { async writeText(value) { copied.push(value); } } } });
    global.window = { print() { throw new Error('printing should not occur in a copy-only test'); } };
    global.setTimeout = () => 0;
    initializePageTools(pageToolsSettings({ copyShipmentDetails: true }));

    const allButtons = [emailTarget, phone, addressHeading, lineOne, lineTwo].flatMap((target) => target.children);
    const emailButton = allButtons.find((button) => button.textContent === 'Copier e-mail');
    const phoneButton = allButtons.find((button) => button.textContent === 'Copier téléphone');
    const addressButton = allButtons.find((button) => button.textContent === 'Copier l’adresse');
    assert.ok(emailButton && phoneButton && addressButton, 'copy controls are inserted for contact and address values');
    assert.deepEqual(copied, [], 'initialization does not copy or submit anything');
    await emailButton.listeners.click[0]();
    await phoneButton.listeners.click[0]();
    await addressButton.listeners.click[0]();
    assert.deepEqual(copied, ['buyer@example.org', '+33 6 12 34 56 78', '12 rue des Cartes\n75000 Paris']);

    const disabledDocument = { querySelector() { throw new Error('disabled feature must not inspect the page'); } };
    global.document = disabledDocument;
    initializePageTools(pageToolsSettings({ copyShipmentDetails: false, printOrders: false }));
  } finally {
    restoreGlobals(previous);
  }
});

test('order printing is exposed as an explicit button and never runs during initialization', () => {
  const previous = captureGlobals(['document', 'location', 'window']);
  let printCalls = 0;
  try {
    const info = simplePageToolNode('div');
    const document = { querySelector(selector) { return selector === '#SellerBuyerInfo' ? info : null; }, createElement: (tag) => simplePageToolNode(tag) };
    global.document = document;
    global.location = { pathname: '/fr/Orders/123', origin: 'https://www.cardmarket.com' };
    global.window = { print() { printCalls += 1; } };
    initializePageTools(pageToolsSettings({ printOrders: true }));

    const button = info.children.find((child) => child.className.includes('cmu-print-button'));
    assert.ok(button, 'the print action is attached to the order details');
    assert.equal(button.type, 'button');
    assert.equal(printCalls, 0, 'the extension does not open printing automatically');
    button.listeners.click[0]();
    assert.equal(printCalls, 1, 'printing occurs only after the user click');

    const disabledInfo = simplePageToolNode('div');
    global.document = { querySelector() { return disabledInfo; }, createElement: (tag) => simplePageToolNode(tag) };
    initializePageTools(pageToolsSettings({ printOrders: false }));
    assert.equal(disabledInfo.children.length, 0, 'the print feature flag prevents insertion');
  } finally {
    restoreGlobals(previous);
  }
});

function pageToolsSettings(overrides) {
  return {
    enabled: true, copyShipmentDetails: false, printOrders: false,
    showRecentOrderLinks: false, showOfferAttributes: false, showPokeMasterBallIndicators: false, showConditionPrices: false,
    showBlocklistShortcut: false, highlightTerms: false, forceGridView: false,
    hideSupportTickets: false, showGridColumns: false,
    ...overrides,
  };
}

function simplePageToolNode(tagName) {
  return {
    tagName: tagName.toUpperCase(), children: [], listeners: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    append(child) { child.parentElement = this; this.children.push(child); },
    querySelector(selector) { return this.children.find((child) => child.className?.includes(selector.replace(/^\./, ''))) || null; },
  };
}

function captureGlobals(keys) {
  return Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
}

function restoreGlobals(descriptors) {
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(global, key, descriptor);
    else delete global[key];
  }
}

test('clamps configurable gallery columns to the supported range', () => {
  assert.equal(clampGridColumns(0, 1400), 2);
  assert.equal(clampGridColumns(13, 1400), 12);
  assert.equal(clampGridColumns(4, 600), 4);
});

test('honors the global extension switch before running page tools', () => {
  assert.equal(shouldRunPageTools({ enabled: false }), false);
  assert.equal(shouldRunPageTools({ enabled: true }), true);
  assert.equal(shouldRunPageTools({}), true);
});

test('each page-tool flag and the master switch disable its page integration', () => {
  const keys = ['showRecentOrderLinks', 'showConditionPrices', 'showOfferAttributes', 'showPokeMasterBallIndicators', 'copyShipmentDetails', 'printOrders', 'showBlocklistShortcut', 'hideSupportTickets', 'highlightTerms', 'forceGridView', 'showGridColumns', 'hideMagicArtSummary'];
  for (const key of keys) {
    assert.equal(isPageToolEnabled({ enabled: true, [key]: false }, key), false, `${key} should be off`);
    assert.equal(isPageToolEnabled({ enabled: true, [key]: true }, key), true, `${key} should be on`);
    assert.equal(isPageToolEnabled({ enabled: false, [key]: true }, key), false, `${key} should honor master`);
  }
});

test('builds a safe, prefilled Cardmarket blocklist link without submitting it', () => {
  assert.equal(
    buildBlocklistUrl('/fr/Pokemon/Users/SellerName', 'Seller & Co'),
    'https://www.cardmarket.com/fr/Pokemon/Account/Settings/UserBlocklist?ehcmUser=Seller+%26+Co',
  );
});

test('groups checked order rows by expansion slug', () => {
  assert.deepEqual(groupOrderProgress([
    { expansion: '151', checked: true },
    { expansion: '151', checked: false },
    { expansion: 'Paldea-Evolved', checked: true },
  ]), [
    { expansion: '151', checked: 1, total: 2 },
    { expansion: 'Paldea-Evolved', checked: 1, total: 1 },
  ]);
  assert.equal(getExpansionFromSinglesPath('/en/Pokemon/Products/Singles/151/Pikachu-MEW025'), '151');
});

test('keeps the first visible price for each card condition', () => {
  assert.deepEqual(buildConditionPriceItems([
    { condition: 'NM', price: '1,20 €', href: '#row-1' },
    { condition: 'NM', price: '1,30 €', href: '#row-2' },
    { condition: 'EX', price: '0,95 €', href: '#row-3' },
  ]), [
    { condition: 'NM', price: '1,20 €', href: '#row-1' },
    { condition: 'EX', price: '0,95 €', href: '#row-3' },
  ]);
});
