const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DEFAULTS, isFeatureEnabled, isOfferLanguageProductPath, buildOfferLanguageUrl, getOfferLanguageId } = require('../settings.js');
const CardmarketCore = require('../core.js');
const CardmarketPageTools = require('../page-tools.js');
const CardmarketDuplicateWarnings = require('../duplicate-warnings.js');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

class FakeElement {
  constructor(tagName = 'div', textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.textContent = textContent;
    this.innerText = textContent;
    this.value = '';
    this.hidden = false;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.className = '';
    this.parentElement = null;
  }
  get classList() {
    return {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.contains(name) : Boolean(force);
        if (enabled) this.classList.add(name); else this.classList.remove(name);
        return enabled;
      },
      [Symbol.iterator]: () => this.className.split(/\s+/).filter(Boolean)[Symbol.iterator](),
    };
  }
  get options() { return this.children.filter((child) => child.tagName === 'OPTION'); }
  matches(selector) {
    return selector.split(',').some((raw) => {
      const part = raw.trim();
      if (part.startsWith('.')) return part.slice(1).split('.').every((name) => this.classList.contains(name));
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('[aria-label="')) return this.getAttribute('aria-label') === part.slice(13, -2);
      if (part === '[role="navigation"]') return this.getAttribute('role') === 'navigation';
      return this.tagName.toLowerCase() === part.toLowerCase();
    });
  }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
  prepend(...nodes) { for (const node of nodes.reverse()) { this.children.unshift(node); node.parentElement = this; } }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatchEvent(event) { (this.dispatched ||= []).push(event); return true; }
  insertAdjacentElement(position, node) {
    this.inserted = { position, node };
    node.parentElement = this.parentElement;
    if (this.parentElement?.children && !this.parentElement.children.includes(node)) {
      const index = this.parentElement.children.indexOf(this);
      this.parentElement.children.splice(position === 'beforebegin' ? Math.max(0, index) : index + 1, 0, node);
    }
  }
  closest(selector) {
    if (selector === 'table') return this.tableElement || null;
    for (let current = this; current; current = current.parentElement) if (current.matches?.(selector)) return current;
    return null;
  }
  querySelector(selector) {
    if (selector.includes('input[name*="price"') || selector.includes('input[id*="price"')) return this.priceInput || null;
    if (selector.includes('input[name*="amount"') || selector.includes('input[id*="amount"') || selector.includes('input[name*="quantity"') || selector.includes('input[id*="quantity"')) return this.quantityInput || null;
    if (selector.includes('textarea[name*="message"') || selector.includes('textarea[name*="body"')) return this.messageTextarea || null;
    if (selector.includes('textarea[name*="comment"')) return this.commentTextarea || null;
    if (selector === '.cmu-comments') return this.children.find((child) => child.className === 'cmu-comments') || null;
    const visit = (parent) => {
      for (const child of parent.children || []) {
        if (child.matches?.(selector)) return child;
        const nested = visit(child);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this);
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (parent) => {
      for (const child of parent.children || []) {
        if (child.matches?.(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

class FakeEvent {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
}

function createDocument({ forms = [], editForms = [], files = [], wantsSelects = [], heading = null, tableBody = null, tableElement = null, articleTable = null, visibleRows = [], orderRows = [], visiblePrices = [], professionalRows = [], imageLinks = [], messageLinks = [], countryFilters = [], offerLanguageFilter = null, offerLanguageFilterSelector = '#articleFilterProductLanguage .form-check input', infoItems = [], infoList = null, chartScript = null } = {}) {
  const document = {
    documentElement: { dataset: {} },
    body: new FakeElement('body'),
    listeners: {},
    createElement(tagName) { return new FakeElement(tagName); },
    createTextNode(text) { return new FakeElement('#text', text); },
    querySelector(selector) {
      if (selector === 'h1') return heading;
      if (selector.startsWith('form[action') || selector === 'form#articleForm' || selector === 'form#ListProductForm') return forms[0] || null;
      if (selector === 'table tbody') return tableBody;
      if (selector === '.article-table') return articleTable;
      if (selector === '.info-list-container') return infoList;
      if (selector === '.cmu-price-deviation') return infoList?.inserted?.node?.className === 'cmu-price-deviation' ? infoList.inserted.node : null;
      if (selector === '.chart-wrapper script, .chart-container script') return chartScript;
      if (offerLanguageFilter && selector.split(',').some((part) => part.trim() === offerLanguageFilterSelector)) return offerLanguageFilter;
      if (selector === 'table tbody tr:not([hidden])') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'form') return forms;
      if (selector === 'form[id^="Edit"]') return editForms;
      if (selector === 'input[type="file"]') return files;
      if (selector === 'select[name*="want" i], select[id*="want" i]') return wantsSelects;
      if (selector === 'table tbody tr:not([hidden])') return visibleRows;
      if (selector === 'table tbody tr, .article-row') return orderRows;
      if (selector === '.info-list-container dt, .info-list-container dd') return infoItems;
      if (selector.includes('.article-row [class*="price"]') || selector.includes('.price-container')) return visiblePrices;
      if (selector === '[id^="articleRow"]') return professionalRows;
      if (selector === 'a[href*="/Products/Singles/"]') return imageLinks;
      if (selector === '.message-body a[href], #MessageContainer a[href]') return messageLinks;
      if (selector === '#articleFilterSellerLocation .form-check') return countryFilters;
      return [];
    },
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    dispatchEvent(event) { for (const listener of this.listeners[event.type] || []) listener(event); return true; },
  };
  if (tableBody) tableBody.tableElement = tableElement;
  return document;
}

async function runContent({ pathname, href = `https://www.cardmarket.com${pathname}`, settings: overrides = {}, document, storage = null, clipboard = async () => {}, darkSystem = false, fetcher = async () => ({ text: async () => '' }), productImageSource = null, ogImageSource = null, mutationObserverClass = undefined }) {
  const settings = { ...DEFAULTS, ...overrides };
  const cardmarketSettings = {
    DEFAULTS,
    isFeatureEnabled,
    isOfferLanguageProductPath,
    loadSettings: async () => settings,
    buildOfferLanguageUrl,
    getOfferLanguageId,
  };
  storage ||= { async get() { return {}; }, async set() {} };
  const session = new Map();
  const locationReplacements = [];
  class FakeDOMParser {
    parseFromString() {
      return {
        querySelector(selector) {
          if (selector.includes('#productImage img') || selector.includes('.product-image img')) {
            return productImageSource ? { getAttribute: (name) => name === 'src' ? productImageSource : null } : null;
          }
          if (selector === 'meta[property="og:image"]') return ogImageSource ? { content: ogImageSource } : null;
          return null;
        },
      };
    }
  }
  const sandbox = {
    CardmarketSettings: cardmarketSettings,
    CardmarketCore,
    CardmarketPageTools,
    CardmarketDuplicateWarnings,
    chrome: { storage: { local: storage }, runtime: { getURL: (value) => value, sendMessage: async () => ({}) } },
    document,
    location: { pathname: new URL(href).pathname, href, origin: 'https://www.cardmarket.com', replace(url) { locationReplacements.push(url); } },
    sessionStorage: { getItem(key) { return session.get(key) ?? null; }, setItem(key, value) { session.set(key, value); } },
    navigator: { clipboard: { writeText: clipboard } },
    fetch: fetcher,
    DOMParser: FakeDOMParser,
    MutationObserver: mutationObserverClass,
    matchMedia: () => ({ matches: darkSystem }),
    innerWidth: 1280,
    URL,
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(contentSource, sandbox, { filename: 'content.js' });
  await new Promise((resolve) => setImmediate(resolve));
  return { sandbox, settings, locationReplacements };
}

test('configured offer languages redirect once on Singles, ETB and booster product details', async () => {
  const paths = [
    '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025?foo=bar#offers',
    '/fr/Pokemon/Products/Elite-Trainer-Boxes/Example-ETB?foo=bar#offers',
    '/en/Magic/Products/Booster-Boxes/Innistrad-Booster-Box?foo=bar#offers',
  ];
  for (const pathname of paths) {
    const { locationReplacements } = await runContent({
      pathname,
      document: createDocument({ offerLanguageFilter: new FakeElement('div') }),
      settings: { offerLanguages: ['ja', 'fr'] },
    });
    assert.equal(locationReplacements.length, 1, `${pathname} should get a single canonical redirect`);
    const target = new URL(locationReplacements[0]);
    assert.equal(target.searchParams.get('language'), '2,7');
    assert.equal(target.searchParams.get('foo'), 'bar');
    assert.equal(target.hash, '#offers');
  }
});

test('Matras panel exposes price averages from the already loaded price series', () => {
  const chartImplementation = contentSource.slice(contentSource.indexOf('async function addHistoricalChart'), contentSource.indexOf('function showMatrasStatus'));
  assert.match(contentSource, /class="cmu-chart-averages"[^>]*aria-label="Moyennes de prix Matras/);
  assert.match(contentSource, /calculateChartPriceAverages\(points\)/);
  assert.match(contentSource, /formatChartPriceAverages\(averages\)/);
  assert.match(contentSource, /const points = Array\.isArray\(result\.data\?\.preise\) \? result\.data\.preise : \[\]/);
  assert.equal((chartImplementation.match(/requestService\(url\)/g) || []).length, 1, 'the averages do not add another service request');
});

test('price deviation warning is gated and reads only the embedded chart and visible From value', () => {
  const warningImplementation = contentSource.slice(contentSource.indexOf('function addPriceDeviationWarning'), contentSource.indexOf('function addPriceTool'));
  assert.match(warningImplementation, /featureEnabled\('showPriceDeviation'\)/);
  assert.doesNotMatch(warningImplementation, /product\.game|\[\s*6\s*,\s*18\s*\]/, 'warning eligibility must not add a game whitelist beyond supported Singles parsing');
  assert.match(warningImplementation, /config\?\.data\?\.datasets\?\.\[0\]\?\.data/);
  assert.match(warningImplementation, /querySelectorAll\('\.info-list-container dt, \.info-list-container dd'\)/);
  assert.match(warningImplementation, /calculatePriceDeviation\(currentPrice, points\)/);
  assert.match(warningImplementation, /insertAdjacentElement\('afterend', warning\)/);
  assert.doesNotMatch(warningImplementation, /fetch\(|storage\.local\.set|FormData|\.submit\(/);
});

test('price deviation warning works for every supported game on a Singles page', async () => {
  const supportedGames = [
    ['Magic', 1], ['YuGiOh', 3], ['Pokemon', 6],
    ['OnePiece', 18], ['Lorcana', 19], ['Riftbound', 22],
  ];
  const chartConfig = {
    data: {
      labels: ['01.11.2026', '02.11.2026', '03.11.2026'],
      datasets: [{ data: [10, 10, 10] }],
    },
  };
  for (const [gameName, gameId] of supportedGames) {
    const pathname = `/en/${gameName}/Products/Singles/Set/Card-ABC123`;
    assert.equal(CardmarketCore.parseProductPath(pathname)?.game, gameId, `${gameName} must be recognized as a supported Singles game`);
    const infoList = new FakeElement('div');
    const infoItems = [new FakeElement('dt', 'From'), new FakeElement('dd', '12,00 €')];
    const chartScript = new FakeElement('script', `new Chart(ctx, ${JSON.stringify(chartConfig)});`);
    const document = createDocument({ infoItems, infoList, chartScript });
    await runContent({
      pathname,
      document,
      settings: {
        showFloatingPanel: false,
        showPriceHelper: false,
        showPriceDeviation: true,
        showMatrasChart: false,
        quickFilter: false,
        showGameSwitcher: false,
        showSessionTotal: false,
        showTableCopy: false,
        showMessagePreviews: false,
        showCardPreviews: false,
        showConditionPrices: false,
        reportPrices: false,
      },
      storage: { async get(defaults = {}) { return defaults; }, async set() {} },
    });
    assert.equal(infoList.inserted?.node?.className, 'cmu-price-deviation', `${gameName} (id ${gameId}) should show the warning`);
  }
});

test('configured offer languages do not redirect a product-shaped route without native offer filters', async () => {
  const { locationReplacements } = await runContent({
    pathname: '/fr/Pokemon/Products/Elite-Trainer-Boxes/Example-ETB?foo=bar',
    document: createDocument(),
    settings: { offerLanguages: ['fr'] },
  });
  assert.deepEqual(locationReplacements, []);
});

test('manual native language changes on an ETB detail route are remembered for that path', async () => {
  const pathname = '/fr/Pokemon/Products/Elite-Trainer-Boxes/Example-ETB';
  const document = createDocument({ offerLanguageFilter: new FakeElement('div') });
  const { sandbox } = await runContent({
    pathname,
    document,
    settings: { offerLanguages: ['fr'] },
  });
  document.listeners.change[0]({ target: { matches: () => true } });
  const overrides = JSON.parse(sandbox.sessionStorage.getItem('cmu-offer-language-overrides'));
  assert.deepEqual(overrides[pathname], { manual: true });
});

test('Booster-Boxes details apply languages when the native filter exposes classless checkboxes', async () => {
  const pathname = '/fr/Pokemon/Products/Booster-Boxes/Example-Booster-Bundle?language=2';
  const document = createDocument({
    offerLanguageFilter: new FakeElement('input'),
    offerLanguageFilterSelector: '#articleFilterProductLanguage input[type="checkbox"]',
  });
  const { locationReplacements } = await runContent({
    pathname,
    document,
    settings: { offerLanguages: ['fr', 'ja'] },
  });
  assert.equal(locationReplacements.length, 1);
  const target = new URL(locationReplacements[0]);
  assert.equal(target.searchParams.get('language'), '2,7');
});

test('detects Cardmarket native language controls with legacy, classless, role and select markup', async () => {
  const selectors = [
    '#articleFilterProductLanguage .form-check input',
    '#articleFilterProductLanguage input[type="checkbox"]',
    '#articleFilterProductLanguage [role="checkbox"]',
    '#FilterOffersFormWrapper select[name="idLanguage"]',
    '.form-floating #IdLanguage',
  ];
  for (const offerLanguageFilterSelector of selectors) {
    const { locationReplacements } = await runContent({
      pathname: '/en/Magic/Products/Accessories/Dragon-Shield-Sleeves?language=3',
      document: createDocument({ offerLanguageFilter: new FakeElement('input'), offerLanguageFilterSelector }),
      settings: { offerLanguages: ['fr', 'ja'] },
    });
    assert.equal(locationReplacements.length, 1, `${offerLanguageFilterSelector} should enable the native override`);
    assert.equal(new URL(locationReplacements[0]).searchParams.get('language'), '2,7');
  }
});

test('message signature, comment templates and multiple attachments follow their toggles', async () => {
  const form = new FakeElement('form');
  const message = new FakeElement('textarea');
  message.value = 'Bonjour';
  message.dataset = {};
  const comment = new FakeElement('textarea');
  comment.value = 'ancien texte';
  form.messageTextarea = message;
  form.commentTextarea = comment;
  const file = new FakeElement('input');
  const document = createDocument({ forms: [form], files: [file] });
  await runContent({
    pathname: '/fr/Account/Messages', document,
    settings: {
      enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false,
      theme: 'dark', applySignature: true, signature: '— Esteban',
      showCommentTemplates: true, commentTemplates: ['Réponse enregistrée'], multipleAttachments: true,
    },
  });

  form.listeners.submit[0]();
  form.listeners.submit[0]();
  assert.equal(message.value, 'Bonjour\n\n— Esteban', 'signature is appended once on explicit submit');
  assert.equal(file.getAttribute('multiple'), '', 'file input accepts multiple attachments');
  assert.equal(document.documentElement.dataset.cmuTheme, 'dark');

  const templateButton = comment.inserted.node.children[0];
  templateButton.listeners.click[0]();
  assert.equal(comment.value, 'Réponse enregistrée');
  assert.equal(comment.dispatched[0].type, 'input');
  assert.equal(comment.dispatched[0].bubbles, true);
});

test('order checklist progress ignores saved entries that are no longer on the current page', async () => {
  const row = new FakeElement('tr', 'Current card row');
  const writes = [];
  const storage = {
    async get(defaults) { return { ...defaults, 'order-checks-123': ['removed-row-from-old-order-state'] }; },
    async set(value) { writes.push(value); },
  };
  const heading = new FakeElement('h1', 'Commande');
  const document = createDocument({ heading, orderRows: [row] });
  await runContent({
    pathname: '/fr/Orders/123', document, storage,
    settings: { enabled: true, showOrderChecklist: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false },
  });

  assert.equal(heading.inserted.node.className, 'cmu-checklist-status');
  assert.equal(heading.inserted.node.textContent, 'Préparation · 0 / 1 lignes');
  assert.equal(row.querySelector('.cmu-picked').checked, false);
  assert.deepEqual(writes, [], 'loading stale local state should not write or mutate an order');
});

test('order checklist groups visible rows locally and persists only the explicit checked state', async () => {
  const first = new FakeElement('tr', 'Pikachu 1,00 €');
  const second = new FakeElement('tr', 'SampleCard 2,00 €');
  for (const [row, href] of [
    [first, '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025'],
    [second, '/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-SSP203'],
  ]) {
    const nativeQuerySelector = row.querySelector.bind(row);
    row.querySelector = (selector) => selector.includes('a[href*="/Products/Singles/"]')
      ? { href }
      : nativeQuerySelector(selector);
  }
  const writes = [];
  const storage = { async get(defaults) { return defaults; }, async set(value) { writes.push(value); } };
  const heading = new FakeElement('h1', 'Commande');
  const document = createDocument({ heading, orderRows: [first, second] });
  await runContent({
    pathname: '/fr/Orders/123', document, storage,
    settings: { enabled: true, showOrderChecklist: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false },
  });

  const status = heading.inserted.node;
  const groups = status.inserted.node;
  assert.equal(status.textContent, 'Préparation · 0 / 2 lignes');
  assert.equal(groups.textContent, '151 0/1 · Example-Set 0/1');
  const checkbox = first.querySelector('.cmu-picked');
  checkbox.checked = true;
  checkbox.listeners.change[0]();
  document.listeners.change[0]({ target: checkbox });
  assert.equal(status.textContent, 'Préparation · 1 / 2 lignes');
  assert.equal(groups.textContent, '151 1/1 · Example-Set 0/1');
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{ 'order-checks-123': ['0-Pikachu 1,00 €'] }]);
});

test('favorite-game links preserve the current language and remaining route', async () => {
  const heading = new FakeElement('h1');
  const document = createDocument({ heading });
  await runContent({
    pathname: '/fr/Pokemon/Products/Search', document,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, favoriteGames: ['Magic', 'Pokemon'] },
  });

  const nav = heading.inserted.node;
  assert.equal(nav.className, 'cmu-games');
  assert.deepEqual(nav.children.map((link) => [link.textContent, link.href]), [
    ['Magic', '/fr/Magic/Products/Search'],
    ['Pokemon', '/fr/Pokemon/Products/Search'],
  ]);
});

test('copy action exports only visible non-empty rows and updates its label', async () => {
  let copiedText = null;
  const table = new FakeElement('table');
  const tbody = new FakeElement('tbody');
  tbody.tableElement = table;
  const document = createDocument({ tableBody: tbody, tableElement: table, visibleRows: [
    { innerText: '  visible card · 1,00 €  ' },
    { innerText: '' },
    { innerText: 'second visible card · 2,00 €' },
  ] });
  await runContent({
    pathname: '/fr/Pokemon/Users/Seller', document,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: true, showSessionTotal: false, hideSocial: false },
    clipboard: async (value) => { copiedText = value; },
  });

  const button = table.inserted.node;
  await button.listeners.click[0]({ currentTarget: button });
  assert.equal(copiedText, 'visible card · 1,00 €\nsecond visible card · 2,00 €');
  assert.equal(button.textContent, 'Liste copiée');
});

test('instant filter keeps a Cardmarket French NM offer visible from its CardCondition link', async () => {
  const articleTable = new FakeElement('div');
  articleTable.className = 'article-table';
  const row = new FakeElement('div', 'SampleCard seller 14,00 €');
  row.className = 'article-row';
  const language = new FakeElement('span');
  language.setAttribute('aria-label', 'Français');
  const conditionLink = new FakeElement('a', '');
  conditionLink.innerText = 'NM';
  conditionLink.setAttribute('href', 'https://help.cardmarket.com/fr/CardCondition');
  row.querySelectorAll = (selector) => {
    if (selector === '*') return [];
    assert.match(selector, /\[href\]/);
    return [language, conditionLink];
  };
  articleTable.querySelectorAll = (selector) => selector === '.article-row' ? [row] : [];
  const document = createDocument({ articleTable });
  await runContent({
    pathname: '/fr/Pokemon/Offers', document,
    settings: { enabled: true, quickFilter: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, hideSocial: false },
  });

  const filter = articleTable.inserted.node;
  const languageSelect = filter.children.find((element) => element.getAttribute('aria-label') === 'Langue');
  const conditionSelect = filter.children.find((element) => element.getAttribute('aria-label') === 'État');
  assert.ok(languageSelect);
  assert.ok(conditionSelect);
  languageSelect.value = 'French';
  conditionSelect.value = 'Near Mint';
  conditionSelect.listeners.change[0]();
  assert.equal(row.classList.contains('cmu-filter-hidden'), false);

  conditionSelect.value = 'Excellent';
  conditionSelect.listeners.change[0]();
  assert.equal(row.classList.contains('cmu-filter-hidden'), true);
});

test('quick filters expose native seller countries and apply/reset the multi-country URL explicitly', async () => {
  const articleTable = new FakeElement('div');
  articleTable.className = 'article-table';
  const countryFilters = ['7', '2'].map((id, index) => {
    const control = new FakeElement('div');
    control.className = 'form-check';
    const input = new FakeElement('input');
    input.value = id;
    const label = new FakeElement('label', index ? 'Français' : 'Japan');
    label.className = 'form-check-label';
    control.append(input, label);
    return control;
  });
  const { locationReplacements } = await runContent({
    pathname: '/fr/Pokemon/Products/Search',
    href: 'https://www.cardmarket.com/fr/Pokemon/Products/Search?foo=bar&sellerCountry=7#offers',
    document: createDocument({ articleTable, countryFilters }),
    settings: { showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, hideSocial: false },
  });
  const wrapper = articleTable.inserted?.node;
  const countrySelect = wrapper?.children.find((child) => child.getAttribute('aria-label') === 'Pays vendeur');
  assert.ok(countrySelect, 'country control appears when Cardmarket exposes native country filters');
  assert.deepEqual(countrySelect.options.map((option) => option.value), ['7', '2']);
  countrySelect.options[0].selected = true;
  countrySelect.options[1].selected = true;
  assert.equal(locationReplacements.length, 0, 'selecting countries does not navigate before applying the complete selection');
  const apply = wrapper.children.find((child) => child.textContent === 'Appliquer pays');
  assert.ok(apply, 'the filter exposes an explicit apply action');
  apply.listeners.click[0]();
  assert.equal(locationReplacements.length, 1);
  const target = new URL(locationReplacements[0]);
  assert.equal(target.searchParams.get('sellerCountry'), '2,7');
  assert.equal(target.searchParams.get('foo'), 'bar');
  assert.equal(target.hash, '#offers');
  const reset = wrapper.children.find((child) => child.textContent === 'Tous les pays');
  assert.ok(reset, 'the filter exposes an explicit reset action');
  reset.listeners.click[0]();
  assert.equal(locationReplacements.length, 2);
  assert.equal(new URL(locationReplacements[1]).searchParams.has('sellerCountry'), false);
});

test('Cardmarket message previews fetch only after click, render a validated image and obey their toggle', async () => {
  const link = new FakeElement('a', 'Pikachu V');
  link.href = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/151/Sample-V1-ABC123';
  const document = createDocument({ messageLinks: [link] });
  const requests = [];
  await runContent({
    pathname: '/fr/Account/Messages', document,
    settings: { showFloatingPanel: false, showMessagePreviews: true, showSocial: false, hideSocial: false },
    productImageSource: 'https://product-images.s3.cardmarket.com/987654321/987654321.jpg',
    fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => '<html></html>' }; },
  });
  const button = link.inserted?.node;
  assert.equal(button?.textContent, 'Afficher aperçu');
  assert.deepEqual(requests, [], 'a message is not fetched before an explicit click');
  await button.listeners.click[0]();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, link.href);
  assert.equal(requests[0].options.credentials, 'same-origin');
  const preview = button.inserted.node;
  assert.equal(preview.className, 'cmu-message-preview');
  assert.equal(preview.children.find((child) => child.tagName === 'IMG')?.src, 'https://product-images.s3.cardmarket.com/987654321/987654321.jpg');

  const disabledLink = new FakeElement('a', 'Pikachu V');
  disabledLink.href = link.href;
  await runContent({
    pathname: '/fr/Account/Messages', document: createDocument({ messageLinks: [disabledLink] }),
    settings: { showFloatingPanel: false, showMessagePreviews: false, hideSocial: false },
  });
  assert.equal(disabledLink.inserted, undefined);
});

test('message previews ignore external links and Cardmarket category/search URLs', async () => {
  const external = new FakeElement('a', 'site externe');
  external.href = 'https://example.com/product';
  const category = new FakeElement('a', 'recherche Cardmarket');
  category.href = 'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=Pikachu';
  const document = createDocument({ messageLinks: [external, category] });
  const requests = [];
  await runContent({
    pathname: '/fr/Account/Messages', document,
    settings: { showFloatingPanel: false, showMessagePreviews: true, hideSocial: false },
    fetcher: async (...args) => { requests.push(args); return { ok: true, text: async () => '' }; },
  });
  assert.equal(external.inserted, undefined);
  assert.equal(category.inserted, undefined);
  assert.deepEqual(requests, []);
});

test('configured price shortcuts fill the offer only on click and refresh the lot total preview', async () => {
  const form = new FakeElement('form');
  const priceInput = new FakeElement('input');
  const quantityInput = new FakeElement('input');
  quantityInput.value = '3';
  form.priceInput = priceInput;
  form.quantityInput = quantityInput;
  const price10 = new FakeElement('span', '10,00 €');
  const price20 = new FakeElement('span', '20,00 €');
  price10.getClientRects = () => [{}];
  price20.getClientRects = () => [{}];
  const document = createDocument({ forms: [form], heading: new FakeElement('h1', 'Pikachu'), visiblePrices: [price10, price20] });
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document,
    settings: { showFloatingPanel: false, showPriceHelper: true, priceMode: 'lowest', priceShortcuts: ['avg'], showSessionTotal: false, showPurchaseHistory: false, showDuplicateWarnings: false, showMatrasChart: false, hideSocial: false },
  });
  const controls = priceInput.inserted?.node;
  const mainButton = controls?.children.find((child) => child.className.includes('cmu-price-tool'));
  const shortcutList = controls?.children.find((child) => child.className === 'cmu-price-shortcut-list');
  const shortcut = shortcutList?.children.find((child) => child.className.includes('cmu-price-shortcut'));
  const lotPreview = controls?.children.find((child) => child.className === 'cmu-lot-preview');
  assert.ok(mainButton);
  assert.ok(shortcut, 'the configured average-price shortcut is present');
  assert.equal(shortcut.textContent, 'Moyenne visible');
  assert.ok(lotPreview);
  assert.equal(priceInput.value, '', 'building the controls never edits the offer');

  await shortcut.listeners.click[0]();
  assert.equal(priceInput.value, '15.00');
  assert.equal(shortcut.textContent, '15,00 € · moyenne');
  assert.equal(lotPreview.textContent, 'Total indicatif du lot · 3 · 45,00 €');

  quantityInput.value = '4';
  quantityInput.listeners.input[0]();
  assert.equal(lotPreview.textContent, 'Total indicatif du lot · 4 · 60,00 €');

  const disabledForm = new FakeElement('form');
  const disabledPrice = new FakeElement('input');
  disabledForm.priceInput = disabledPrice;
  const disabledDocument = createDocument({ forms: [disabledForm], heading: new FakeElement('h1', 'Pikachu') });
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document: disabledDocument,
    settings: { showFloatingPanel: false, showPriceHelper: false, priceShortcuts: ['avg'], showPurchaseHistory: false, showDuplicateWarnings: false, showMatrasChart: false, hideSocial: false },
  });
  assert.equal(disabledPrice.inserted, undefined, 'a configured shortcut cannot bypass the Assistant de prix toggle');
});

test('existing-offer price helper waits for the explicit Article_EditArticleModal click and never submits', async () => {
  const editForm = new FakeElement('form');
  editForm.id = 'EditArticle123';
  const priceInput = new FakeElement('input');
  editForm.priceInput = priceInput;
  let submitCount = 0;
  editForm.submit = () => { submitCount += 1; };
  const price = new FakeElement('span', '12,00 €');
  price.getClientRects = () => [{}];
  const document = createDocument({ heading: new FakeElement('h1', 'Pikachu'), editForms: [editForm], visiblePrices: [price] });
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document,
    settings: { showFloatingPanel: false, showPriceHelper: true, priceMode: 'lowest', showSessionTotal: false, showDuplicateWarnings: false, showPurchaseHistory: false, showMatrasChart: false },
    storage: { async get(defaults = {}) { return defaults; }, async set() {} },
  });
  assert.equal(priceInput.inserted, undefined, 'edit fields are untouched until the user opens the explicit edit modal');
  const trigger = { getAttribute: (name) => name === 'data-modal' ? '/fr/Pokemon/Stock/Article_EditArticleModal?id=123' : null };
  for (const listener of document.listeners.click || []) listener({ target: { closest: () => trigger } });
  const button = priceInput.inserted?.node.children.find((child) => child.className.includes('cmu-price-tool'));
  assert.ok(button, 'the existing offer modal gets the same price calculator after its edit trigger');
  assert.equal(priceInput.value, '', 'opening the modal does not change the current offer');
  await button.listeners.click[0]();
  assert.equal(priceInput.value, '12.00');
  assert.equal(submitCount, 0, 'the helper only fills the field and never saves the edited offer');
});

test('existing-offer helper observes the modal after an explicit edit click and disconnects once attached', async () => {
  const editForms = [];
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() { this.observed = true; }
    disconnect() { this.disconnected = true; }
  }
  const document = createDocument({ heading: new FakeElement('h1', 'Pikachu'), editForms });
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document, mutationObserverClass: FakeMutationObserver,
    settings: { showFloatingPanel: false, showPriceHelper: true, showSessionTotal: false, showDuplicateWarnings: false, showPurchaseHistory: false, showMatrasChart: false },
    storage: { async get(defaults = {}) { return defaults; }, async set() {} },
  });
  const trigger = { getAttribute: (name) => name === 'data-modal' ? 'Article_EditArticleModal?id=123' : null };
  for (const listener of document.listeners.click || []) listener({ target: { closest: () => trigger } });
  assert.equal(observers.length, 1);
  assert.equal(observers[0].observed, true);
  const form = new FakeElement('form');
  form.id = 'EditArticle123';
  form.priceInput = new FakeElement('input');
  form.priceInput.parentElement = form;
  editForms.push(form);
  observers[0].callback([{ type: 'childList' }]);
  assert.ok(form.priceInput.inserted?.node.children.some((child) => child.className.includes('cmu-price-tool')));
  assert.equal(observers[0].disconnected, true);
});

test('From and Min use their source values with adjustment and floor only after explicit action', async () => {
  const cases = [
    { mode: 'from', from: '4,00 €', settings: { adjustmentType: 'percentage', adjustmentValue: 10, floor: 4.5 }, expected: '4.50' },
    { mode: 'min', from: '4,00 €', settings: { adjustmentType: 'fixed', adjustmentValue: -0.5, floor: 0.25 }, expected: '0.25' },
  ];
  for (const item of cases) {
    const form = new FakeElement('form');
    const priceInput = new FakeElement('input');
    form.priceInput = priceInput;
    let submitCount = 0;
    form.submit = () => { submitCount += 1; };
    const visiblePrice = new FakeElement('span', '9,00 €');
    visiblePrice.getClientRects = () => [{}];
    const document = createDocument({
      forms: [form], heading: new FakeElement('h1', 'Pikachu'), visiblePrices: [visiblePrice],
      infoItems: [new FakeElement('dt', 'From'), new FakeElement('dd', item.from)],
    });
    await runContent({
      pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document,
      settings: {
        showFloatingPanel: false, showPriceHelper: true, showMatrasChart: false,
        showSessionTotal: false, showPurchaseHistory: false, showDuplicateWarnings: false,
        priceMode: item.mode, priceShortcuts: ['from', 'min'], ...item.settings,
      },
      storage: { async get(defaults = {}) { return defaults; }, async set() {} },
    });
    assert.equal(priceInput.value, '', 'the initial price field is never recalculated automatically');
    const controls = priceInput.inserted?.node;
    const shortcuts = controls?.children.find((child) => child.className === 'cmu-price-shortcut-list');
    const shortcut = shortcuts?.children.find((child) => child.dataset.priceMode === item.mode);
    assert.ok(shortcut, `${item.mode} has a visible configured shortcut`);
    await shortcut.listeners.click[0]();
    assert.equal(priceInput.value, item.expected);
    assert.equal(submitCount, 0, 'calculating a price never submits the offer');
  }
});

test('bulk discount changes only the indicated lot total, never the unit price', async () => {
  const form = new FakeElement('form');
  const priceInput = new FakeElement('input');
  const quantityInput = new FakeElement('input');
  quantityInput.value = '4';
  form.priceInput = priceInput;
  form.quantityInput = quantityInput;
  let submitCount = 0;
  form.submit = () => { submitCount += 1; };
  const prices = [new FakeElement('span', '10,00 €'), new FakeElement('span', '20,00 €')];
  prices.forEach((price) => { price.getClientRects = () => [{}]; });
  const document = createDocument({ forms: [form], heading: new FakeElement('h1', 'Pikachu'), visiblePrices: prices });
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document,
    settings: {
      showFloatingPanel: false, showPriceHelper: true, priceMode: 'avg', bulkPricePercent: -5,
      showMatrasChart: false, showSessionTotal: false, showPurchaseHistory: false, showDuplicateWarnings: false,
    },
    storage: { async get(defaults = {}) { return defaults; }, async set() {} },
  });
  const controls = priceInput.inserted?.node;
  const button = controls?.children.find((child) => child.className.includes('cmu-price-tool'));
  const preview = controls?.children.find((child) => child.className === 'cmu-lot-preview');
  assert.equal(priceInput.value, '', 'the unit price remains untouched until an explicit calculation click');
  await button.listeners.click[0]();
  assert.equal(priceInput.value, '15.00', 'bulk discount does not modify the unit price field');
  assert.equal(preview.textContent, 'Total indicatif du lot · 4 · remise −5 % · 57,00 €');
  assert.equal(submitCount, 0, 'the discount preview never submits the offer');
  quantityInput.value = '2';
  quantityInput.listeners.change[0]();
  assert.equal(preview.textContent, 'Total indicatif du lot · 2 · remise −5 % · 28,50 €');
});

test('price mode changes recalculate only after an explicit event and preserve manual entry beforehand', async () => {
  const form = new FakeElement('form');
  const priceInput = new FakeElement('input');
  form.priceInput = priceInput;
  const prices = [new FakeElement('span', '10,00 €'), new FakeElement('span', '20,00 €')];
  prices.forEach((price) => { price.getClientRects = () => [{}]; });
  const document = createDocument({ forms: [form], heading: new FakeElement('h1', 'Pikachu'), visiblePrices: prices });
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025', document,
    settings: { showFloatingPanel: false, showPriceHelper: true, showMatrasChart: false, priceMode: 'lowest', showSessionTotal: false, showPurchaseHistory: false, showDuplicateWarnings: false },
    storage: { async get(defaults = {}) { return defaults; }, async set() {} },
  });
  priceInput.value = '77.77';
  assert.equal(priceInput.value, '77.77', 'manual input remains untouched while the selected mode is unchanged');
  document.dispatchEvent({ type: 'cmu-price-mode-change', detail: { mode: 'avg' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(priceInput.value, '15.00', 'a deliberate mode change recalculates the price');
});

test('professional seller pricing chooses the first professional row and fills only after an explicit click', async () => {
  const form = new FakeElement('form');
  const priceInput = new FakeElement('input');
  form.priceInput = priceInput;
  const visiblePrices = [new FakeElement('span', '10,00 €'), new FakeElement('span', '25,00 €')];
  visiblePrices.forEach((price) => { price.getClientRects = () => [{}]; });
  const sellerPrice = new FakeElement('span', '20,00 €');
  const professionalIcon = new FakeElement('i');
  const row = new FakeElement('div');
  row.querySelector = (selector) => {
    if (selector === '.col-seller .fonticon-users-professional') return null;
    if (selector === '.col-seller .fonticon-users-powerseller') return professionalIcon;
    if (selector === '.price-container') return sellerPrice;
    return null;
  };
  const document = createDocument({ forms: [form], heading: new FakeElement('h1', 'SampleCard'), visiblePrices, professionalRows: [row] });
  let submitCount = 0;
  form.submit = () => { submitCount += 1; };
  await runContent({
    pathname: '/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123', document,
    settings: {
      showFloatingPanel: false, showPriceHelper: true, priceMode: 'pro',
      proPriceReductionType: 'amount', proPriceReductionValue: 2, adjustmentValue: 0,
      showSessionTotal: false, showPurchaseHistory: false, showDuplicateWarnings: false, showMatrasChart: false, hideSocial: false,
    },
  });
  assert.equal(priceInput.value, '', 'initializing the professional mode does not change the offer');
  const button = priceInput.inserted?.node.children.find((child) => child.className.includes('cmu-price-tool'));
  assert.ok(button);
  await button.listeners.click[0]();
  assert.equal(priceInput.value, '18.00');
  assert.equal(button.textContent, '18,00 € · vendeur professionnel');
  assert.equal(submitCount, 0, 'the calculator never submits the listing form');
});

test('instant filter reads NM from Cardmarket semantic condition nodes without matching row-wide text', async () => {
  const articleTable = new FakeElement('div');
  articleTable.className = 'article-table';
  const row = new FakeElement('div', 'SampleCard seller Français');
  row.className = 'article-row';
  const conditionNode = new FakeElement('span', '');
  conditionNode.className = 'article-condition';
  conditionNode.innerText = 'NM';
  conditionNode.setAttribute('role', 'link');
  conditionNode.setAttribute('href', 'https://help.cardmarket.com/fr/CardCondition');
  row.querySelectorAll = (selector) => {
    const selectsSemanticCondition = selector.includes('.article-condition');
    const selectsAnchor = conditionNode.tagName === 'A' && selector.includes('a[href]');
    const selectsAnyHref = /(?:^|,)\s*\[href\](?:,|$)/.test(selector);
    return selectsSemanticCondition || selectsAnchor || selectsAnyHref ? [conditionNode] : [];
  };
  articleTable.querySelectorAll = (selector) => selector === '.article-row' ? [row] : [];
  const document = createDocument({ articleTable });
  await runContent({
    pathname: '/fr/Pokemon/Offers', document,
    settings: { enabled: true, quickFilter: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, hideSocial: false },
  });

  const conditionSelect = articleTable.inserted.node.children.find((element) => element.getAttribute('aria-label') === 'État');
  conditionSelect.value = 'Near Mint';
  conditionSelect.listeners.change[0]();
  assert.equal(row.classList.contains('cmu-filter-hidden'), false);

  conditionSelect.value = 'Excellent';
  conditionSelect.listeners.change[0]();
  assert.equal(row.classList.contains('cmu-filter-hidden'), true);
});

test('instant filter reads Cardmarket condition links inside an open offer shadow root', async () => {
  const articleTable = new FakeElement('div');
  articleTable.className = 'article-table';
  const row = new FakeElement('div', 'SampleCard seller Français');
  row.className = 'article-row';
  const conditionLink = {
    tagName: 'A',
    textContent: 'NM',
    innerText: 'NM',
    parentElement: null,
    getAttribute: (name) => name === 'href' ? 'https://help.cardmarket.com/fr/CardCondition' : null,
    querySelectorAll: () => [],
  };
  const offerWidget = {
    shadowRoot: {
      querySelectorAll: (selector) => selector === '*' ? [] : [conditionLink],
    },
    querySelectorAll: () => [],
  };
  row.querySelectorAll = (selector) => selector === '*' ? [offerWidget] : [];
  articleTable.querySelectorAll = (selector) => selector === '.article-row' ? [row] : [];
  const document = createDocument({ articleTable });
  await runContent({
    pathname: '/fr/Pokemon/Offers', document,
    settings: { enabled: true, quickFilter: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, hideSocial: false },
  });

  const filter = articleTable.inserted.node;
  const languageSelect = filter.children.find((element) => element.getAttribute('aria-label') === 'Langue');
  const conditionSelect = filter.children.find((element) => element.getAttribute('aria-label') === 'État');
  languageSelect.value = 'French';
  conditionSelect.value = 'Near Mint';
  conditionSelect.listeners.change[0]();
  assert.equal(row.classList.contains('cmu-filter-hidden'), false);
});

test('card image preview fetches only on click and toggles a validated S3 card image outside gallery links', async () => {
  const { grid, column, link } = makeGalleryCard();
  const document = createDocument({ imageLinks: [link] });
  const requests = [];
  await runContent({
    pathname: '/fr/Pokemon/Products/Search', document,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, showCardPreviews: true, hideSocial: false },
    fetcher: async (url, options) => { requests.push({ url, options }); return { text: async () => '<product page>' }; },
    productImageSource: 'https://product-images.s3.cardmarket.com/987654321/987654321.jpg',
  });

  const button = column.querySelector('.cmu-image-button');
  assert.ok(button);
  assert.equal(button.parentElement, column);
  assert.notEqual(button.parentElement, link);
  assert.equal(requests.length, 0, 'no fetch occurs until the explicit click');

  await button.listeners.click[0]();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, link.href);
  assert.equal(requests[0].options.credentials, 'same-origin');
  const image = column.querySelector('.cmu-card-image');
  assert.equal(image.src, 'https://product-images.s3.cardmarket.com/987654321/987654321.jpg');
  assert.equal(image.alt, link.textContent);

  await button.listeners.click[0]();
  assert.equal(image.hidden, true);
  await button.listeners.click[0]();
  assert.equal(image.hidden, false);
  assert.equal(requests.length, 1, 'toggling does not fetch the product a second time');
  assert.equal(grid.children.includes(column), true);
});

test('card image preview rejects breadcrumb/menu links, generic social logos and a disabled toggle', async () => {
  const { breadcrumb, breadcrumbLink, menu, menuLink } = makeGalleryCard();
  const excludedDocument = createDocument({ imageLinks: [breadcrumbLink, menuLink] });
  await runContent({
    pathname: '/fr/Pokemon/Products/Search', document: excludedDocument,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, showCardPreviews: true, hideSocial: false },
  });
  assert.equal(breadcrumb.querySelector('.cmu-image-button'), null);
  assert.equal(menu.querySelector('.cmu-image-button'), null);

  const { column, link } = makeGalleryCard();
  const genericDocument = createDocument({ imageLinks: [link] });
  await runContent({
    pathname: '/fr/Pokemon/Products/Search', document: genericDocument,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, showCardPreviews: true, hideSocial: false },
    fetcher: async () => ({ text: async () => '<generic og image>' }),
    ogImageSource: 'https://static.cardmarket.com/img/logos/cardmarket.png',
  });
  const unavailableButton = column.querySelector('.cmu-image-button');
  await unavailableButton.listeners.click[0]();
  assert.equal(unavailableButton.textContent, 'Image indisponible');
  assert.equal(column.querySelector('.cmu-card-image'), null);

  const disabled = makeGalleryCard();
  const disabledDocument = createDocument({ imageLinks: [disabled.link] });
  await runContent({
    pathname: '/fr/Pokemon/Products/Search', document: disabledDocument,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, showCardPreviews: false, hideSocial: false },
  });
  assert.equal(disabled.column.querySelector('.cmu-image-button'), null);
});

test('system theme follows the supplied color-scheme preference', async () => {
  const document = createDocument();
  await runContent({
    pathname: '/fr/Pokemon/Users/Seller', document,
    settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, theme: 'system', hideSocial: false },
    darkSystem: true,
  });
  assert.equal(document.documentElement.dataset.cmuTheme, 'dark');
});

test('explicit light and dark themes override the system preference', async () => {
  for (const [theme, darkSystem, expected] of [['light', true, 'light'], ['dark', false, 'dark']]) {
    const document = createDocument();
    await runContent({
      pathname: '/fr/Pokemon/Users/Seller', document,
      settings: { enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, theme, hideSocial: false },
      darkSystem,
    });
    assert.equal(document.documentElement.dataset.cmuTheme, expected, `${theme} theme must override system=${darkSystem}`);
  }
});

test('remembered Wants selection restores and persists the list per game only when enabled', async () => {
  const select = new FakeElement('select');
  select.name = 'idWantsList';
  for (const [value, label] of [['', 'Choisir'], ['42', 'Collection'], ['7', 'À échanger']]) {
    const option = new FakeElement('option', label);
    option.value = value;
    select.append(option);
  }
  const values = { 'last-wants-list-Pokemon': '42' };
  const writes = [];
  const storage = {
    async get(defaults = {}) { return { ...defaults, ...values }; },
    async set(update) { writes.push(update); Object.assign(values, update); },
  };
  const document = createDocument({ wantsSelects: [select] });
  await runContent({
    pathname: '/fr/Pokemon/Wants', document, storage,
    settings: { enabled: true, rememberWantsList: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, hideSocial: false },
  });
  assert.equal(select.value, '42', 'saved list is restored when it is still an available option');
  select.value = '7';
  await select.listeners.change[0]();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]['last-wants-list-Pokemon'], '7');

  const disabled = new FakeElement('select');
  const disabledDocument = createDocument({ wantsSelects: [disabled] });
  await runContent({
    pathname: '/fr/Pokemon/Wants', document: disabledDocument,
    settings: { enabled: true, rememberWantsList: false, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false, hideSocial: false },
  });
  assert.equal(disabled.listeners.change, undefined, 'disabled feature does not bind a persistence action');
});

test('signature, template and multiple-file integrations stay off when individually disabled', async () => {
  const form = new FakeElement('form');
  form.messageTextarea = new FakeElement('textarea');
  form.commentTextarea = new FakeElement('textarea');
  const file = new FakeElement('input');
  const document = createDocument({ forms: [form], files: [file] });
  await runContent({
    pathname: '/fr/Account/Messages', document,
    settings: {
      enabled: true, showFloatingPanel: false, showTableCopy: false, showSessionTotal: false,
      applySignature: false, signature: '— Esteban', showCommentTemplates: false,
      commentTemplates: ['Réponse enregistrée'], multipleAttachments: false, hideSocial: false,
    },
  });
  assert.equal(form.listeners.submit, undefined);
  assert.equal(form.commentTextarea.inserted, undefined);
  assert.equal(file.getAttribute('multiple'), null);
});

function makeGalleryCard() {
  const grid = new FakeElement('div');
  grid.className = 'cmu-gallery-grid';
  const column = new FakeElement('div');
  column.className = 'd-flex col-sm-6';
  grid.append(column);
  const link = new FakeElement('a', 'SampleCard V2 · Surging Sparks');
  link.className = 'galleryBox';
  link.href = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Example-Set/Sample-Card-ABC123';
  column.append(link);
  const breadcrumb = new FakeElement('nav');
  breadcrumb.className = 'breadcrumb';
  const breadcrumbLink = new FakeElement('a', 'SampleCard');
  breadcrumbLink.href = link.href;
  breadcrumb.append(breadcrumbLink);
  const menu = new FakeElement('div');
  menu.className = 'dropdown-menu';
  const menuLink = new FakeElement('a', 'Français');
  menuLink.href = link.href;
  menu.append(menuLink);
  return { grid, column, link, breadcrumb, breadcrumbLink, menu, menuLink };
}
