const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
const { initializePageTools } = require('../page-tools.js');

function makeNode(tagName, textContent = '') {
  const classes = new Set();
  return {
    tagName: String(tagName).toUpperCase(),
    textContent,
    children: [],
    attributes: {},
    listeners: {},
    className: '',
    style: {},
    get classList() {
      return {
        add: (name) => { classes.add(name); this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
        remove: (name) => { classes.delete(name); this.className = this.className.split(/\s+/).filter((part) => part && part !== name).join(' '); },
        contains: (name) => classes.has(name) || this.className.split(/\s+/).includes(name),
      };
    },
    append(...nodes) {
      for (const child of nodes) { child.parentElement = this; this.children.push(child); }
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
    querySelector(selector) {
      return this.children.find((child) => selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1))) || null;
    },
    querySelectorAll(selector) {
      if (selector === 'span') return this.children.filter((child) => child.tagName === 'SPAN');
      return this.children.filter((child) => selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1)));
    },
    insertAdjacentElement(position, child) {
      if ((position === 'afterend' || position === 'beforebegin') && this.parentElement) {
        const siblings = this.parentElement.children;
        const index = siblings.indexOf(this);
        child.parentElement = this.parentElement;
        siblings.splice(position === 'afterend' ? index + 1 : index, 0, child);
      } else {
        child.parentElement = this;
        this.children.push(child);
      }
    },
    remove() { this.removed = true; },
    cloneNode() {
      const clone = makeNode(this.tagName, this.textContent);
      clone.querySelectorAll = (selector) => selector === 'span' ? [] : [];
      return clone;
    },
  };
}

function withPageGlobals(t, { document, pathname, chrome = { storage: { local: { async get(defaults) { return defaults; }, async set() {} } } }, reload = () => {} }) {
  const keys = ['document', 'location', 'chrome'];
  const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  global.document = document;
  global.location = { pathname, origin: 'https://www.cardmarket.com', search: '', reload };
  global.chrome = chrome;
  t.after(() => {
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(global, key, previous[key]);
      else delete global[key];
    }
  });
}

function pageSettings(overrides = {}) {
  return {
    enabled: true,
    copyShipmentDetails: false,
    printOrders: false,
    showRecentOrderLinks: false,
    showConditionPrices: false,
    showOfferAttributes: false,
    showPokeMasterBallIndicators: false,
    showBlocklistShortcut: false,
    highlightTerms: false,
    forceGridView: false,
    hideSupportTickets: false,
    showGridColumns: false,
    highlightAuthor: false,
    ...overrides,
  };
}

test('recent sales and purchase links are injected with the correct product and action only when enabled', (t) => {
  const heading = makeNode('h1', 'Mega Charizard ex');
  const chartParent = makeNode('div');
  const chart = makeNode('div');
  chart.parentElement = chartParent;
  const searchForm = { getAttribute: (name) => name === 'action' ? '/en/Pokemon/Products/Search' : null };
  const document = {
    querySelector(selector) {
      if (selector === '#searchForm') return searchForm;
      if (selector === '.page-title-container h1') return heading;
      return null;
    },
    querySelectorAll(selector) { return selector === '.chart-wrapper' ? [chart] : []; },
    createElement: (tagName) => makeNode(tagName),
  };
  withPageGlobals(t, { document, pathname: '/en/Pokemon/Products/Singles/151/Mega-Charizard-ex-MEW056' });
  initializePageTools(pageSettings({ showRecentOrderLinks: true }));

  const links = chartParent.children.find((child) => child.className === 'cmu-recent-orders');
  assert.ok(links);
  assert.deepEqual(links.children.map((link) => link.textContent), ['Ventes récentes', 'Achats récents']);
  assert.deepEqual(links.children.map((link) => new URL(link.href).searchParams.get('userType')), ['seller', 'buyer']);
  for (const link of links.children) {
    assert.equal(new URL(link.href).searchParams.get('productName'), 'Mega Charizard ex');
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }

  chartParent.children.length = 0;
  initializePageTools(pageSettings({ showRecentOrderLinks: false }));
  assert.equal(chartParent.children.length, 0, 'disabled setting injects no links');
});

test('force-grid adds a gallery form field and rewrites only same-origin product links behind its toggle', (t) => {
  const form = makeNode('form');
  form.querySelector = () => null;
  const internal = makeNode('a');
  internal.href = '/en/Pokemon/Products/Search?foo=bar';
  internal.getAttribute = () => internal.href;
  const alreadyGallery = makeNode('a');
  alreadyGallery.href = '/en/Magic/Products/Search?mode=list';
  alreadyGallery.getAttribute = () => alreadyGallery.href;
  const external = makeNode('a');
  external.href = 'https://example.org/Products/Search';
  external.getAttribute = () => external.href;
  const document = {
    querySelector(selector) { return selector === '#searchForm' ? form : null; },
    querySelectorAll(selector) { return selector === 'a[href*="/Products/"]' ? [internal, alreadyGallery, external] : []; },
    createElement: (tagName) => makeNode(tagName),
  };
  withPageGlobals(t, { document, pathname: '/en/Pokemon/Products/Search' });
  initializePageTools(pageSettings({ forceGridView: true }));
  assert.equal(form.children[0].name, 'mode');
  assert.equal(form.children[0].value, 'gallery');
  assert.equal(new URL(internal.href, 'https://www.cardmarket.com').searchParams.get('foo'), 'bar');
  assert.equal(new URL(internal.href, 'https://www.cardmarket.com').searchParams.get('mode'), 'gallery');
  assert.equal(alreadyGallery.href, '/en/Magic/Products/Search?mode=list');
  assert.equal(external.href, 'https://example.org/Products/Search');

  const disabledForm = makeNode('form');
  disabledForm.querySelector = () => null;
  const disabledDoc = { querySelector(selector) { return selector === '#searchForm' ? disabledForm : null; }, querySelectorAll: () => [] };
  global.document = disabledDoc;
  initializePageTools(pageSettings({ forceGridView: false }));
  assert.equal(disabledForm.children.length, 0, 'disabled setting leaves native search mode untouched');
});

test('support ticket hiding persists a local label and restore clears the stored list after an explicit click', async (t) => {
  const writes = [];
  const storageState = { cmuHiddenSupportTickets: [] };
  const chrome = { storage: { local: {
    async get(defaults) { return { ...defaults, ...storageState }; },
    async set(values) { writes.push(values); Object.assign(storageState, values); },
  } } };
  const container = makeNode('main');
  const carousel = makeNode('div');
  carousel.id = 'marketingCarousel';
  container.append(carousel);
  const row = makeNode('div');
  const ticket = makeNode('a', 'Ticket #123');
  ticket.href = '/fr/support/tickets/123';
  ticket.parentElement = row;
  row.querySelector = (selector) => selector === '.cmu-hide-ticket'
    ? row.children.find((child) => child.className === 'cmu-hide-ticket') || null
    : null;
  row.append(ticket);
  const document = {
    querySelector(selector) { return selector === '#marketingCarousel' ? carousel : null; },
    querySelectorAll(selector) { return selector === 'a[href*="/support/tickets/"]' ? [ticket] : []; },
    createElement: (tagName) => makeNode(tagName),
  };
  let reloadCalls = 0;
  withPageGlobals(t, { document, pathname: '/fr/Account/Support', chrome, reload: () => { reloadCalls += 1; } });
  initializePageTools(pageSettings({ hideSupportTickets: true }));
  await new Promise((resolve) => setImmediate(resolve));

  const hide = row.children.find((child) => child.className === 'cmu-hide-ticket');
  assert.ok(hide, 'a per-ticket local hide control is added');
  assert.deepEqual(writes, [], 'initialization does not mutate the saved ticket list');
  await hide.listeners.click[0]();
  assert.deepEqual(storageState.cmuHiddenSupportTickets, ['Ticket #123']);
  assert.equal(row.removed, true);
  const restore = container.children.find((child) => child.className === 'cmu-restore-tickets');
  assert.ok(restore);
  await restore.listeners.click[0]();
  assert.deepEqual(storageState.cmuHiddenSupportTickets, []);
  assert.equal(reloadCalls, 1, 'the page reload only follows the explicit restore click');

  const disabledRow = makeNode('div');
  const disabledTicket = makeNode('a', 'Ticket #disabled');
  disabledTicket.href = '/fr/support/tickets/disabled';
  disabledTicket.parentElement = disabledRow;
  disabledRow.append(disabledTicket);
  global.document = {
    querySelector(selector) { return selector === '#marketingCarousel' ? carousel : null; },
    querySelectorAll(selector) { return selector === 'a[href*="/support/tickets/"]' ? [disabledTicket] : []; },
    createElement: (tagName) => makeNode(tagName),
  };
  initializePageTools(pageSettings({ hideSupportTickets: false }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disabledRow.children.some((child) => child.className === 'cmu-hide-ticket'), false);
});

test('condition price summary is inserted after From from the first recognized offer of each state', (t) => {
  const infoList = makeNode('dl');
  const from = makeNode('dt', 'From');
  const fromPrice = makeNode('dd', '1,20 €');
  infoList.append(from, fromPrice);
  const rows = new Map();
  for (const [code, price] of [['mt', '1,20 €'], ['nm', '1,00 €'], ['ex', '0,80 €']]) {
    const row = makeNode('div');
    row.id = `articleRow-${code}`;
    const priceNode = makeNode('span', price);
    row.querySelector = (selector) => selector === '.price-container' ? priceNode : null;
    const condition = makeNode('a', code.toUpperCase());
    condition.closest = (selector) => selector === '.article-row' ? row : null;
    rows.set(code, condition);
  }
  const document = {
    querySelectorAll(selector) { return selector === '.info-list-container dt, .info-list-container dd' ? [from, fromPrice] : []; },
    querySelector(selector) {
      const match = selector.match(/condition-([a-z]+)/);
      return selector.includes('.article-table .article-row') && match ? rows.get(match[1]) || null : null;
    },
    createElement: (tagName) => makeNode(tagName),
  };
  withPageGlobals(t, { document, pathname: '/fr/Pokemon/Products/Singles/151/Pikachu-MEW025' });
  initializePageTools(pageSettings({ showConditionPrices: true }));

  const summary = infoList.children.find((child) => child.className === 'cmu-condition-prices');
  assert.ok(summary, 'summary is placed next to the visible From price');
  assert.deepEqual(summary.children.map((link) => link.textContent), ['MT · 1,20 €', 'NM · 1,00 €', 'EX · 0,80 €']);
  assert.deepEqual(summary.children.map((link) => link.href), ['#articleRow-mt', '#articleRow-nm', '#articleRow-ex']);
});

test('special search terms mark matching result rows only when the feature is enabled', (t) => {
  const resultRow = makeNode('div', 'Pikachu ex');
  resultRow.id = 'result-1';
  const resultLink = makeNode('a', 'Pikachu ex');
  resultLink.closest = (selector) => selector === 'div[id].row' ? resultRow : null;
  const calls = [];
  const document = {
    querySelectorAll(selector) {
      calls.push(selector);
      if (selector === '.table-body .col .row a[href*="Products"]') return [resultLink];
      return [];
    },
  };
  withPageGlobals(t, { document, pathname: '/en/Pokemon/Products/Search', chrome: global.chrome, });
  global.location.search = '?searchString=Pikachu%20ex';
  initializePageTools(pageSettings({ highlightTerms: true }));
  assert.equal(resultRow.classList.contains('cmu-special-term'), true);
  assert.match(resultRow.title, /EX/);
  assert.ok(calls.includes('.table-body .col .row a[href*="Products"]'));

  const untouched = makeNode('div', 'Pikachu ex');
  const disabledLink = makeNode('a', 'Pikachu ex');
  disabledLink.closest = () => untouched;
  global.document = { querySelectorAll() { throw new Error('disabled highlight must not scan results'); } };
  initializePageTools(pageSettings({ highlightTerms: false }));
  assert.equal(untouched.classList.contains('cmu-special-term'), false);
});

test('user profile receives a prefilled blocklist link after the memo row only when enabled', (t) => {
  const userRow = makeNode('div');
  const memo = makeNode('div');
  memo.closest = (selector) => selector === 'div' ? userRow : null;
  const headline = makeNode('h1', 'SellerExample');
  const document = {
    querySelector(selector) {
      if (selector === 'div#memoLink') return memo;
      if (selector === '#PublicProfileHeadline') return headline;
      return null;
    },
    createElement: (tagName) => makeNode(tagName),
  };
  withPageGlobals(t, { document, pathname: '/fr/Pokemon/Users/SellerExample' });
  initializePageTools(pageSettings({ showBlocklistShortcut: true }));
  const link = userRow.children.find((child) => child.className === 'cmu-blocklist-shortcut cmu-page-tool');
  assert.ok(link);
  assert.equal(new URL(link.href).searchParams.get('ehcmUser'), 'SellerExample');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.textContent, 'Ajouter à la liste de blocage');

  const disabledRow = makeNode('div');
  memo.closest = () => disabledRow;
  global.document = document;
  initializePageTools(pageSettings({ showBlocklistShortcut: false }));
  assert.equal(disabledRow.children.length, 0);
});

test('gallery column control injects, clamps, applies and persists explicit column changes', async (t) => {
  const toolbar = makeNode('div');
  const icon = makeNode('span');
  icon.parentElement = toolbar;
  const grid = makeNode('div');
  const first = makeNode('div');
  const second = makeNode('div');
  first.parentElement = grid;
  second.parentElement = grid;
  const saved = [];
  const chrome = { storage: { local: {
    async get(defaults) { return { ...defaults }; },
    async set(values) { saved.push(values); },
  } } };
  const document = {
    querySelector(selector) { return selector === 'a.btn.disabled > .fonticon-gallery' ? icon : null; },
    querySelectorAll(selector) {
      return selector === '.row > .d-flex[class*="col-sm-"][class*="col-md-"], #ReprintSection .flex-wrap > .card-column'
        ? [first, second]
        : [];
    },
    createElement: (tagName) => makeNode(tagName),
  };
  withPageGlobals(t, { document, pathname: '/fr/Pokemon/Products/Search', chrome });
  const previousWidth = Object.getOwnPropertyDescriptor(global, 'innerWidth');
  global.innerWidth = 1280;
  t.after(() => {
    if (previousWidth) Object.defineProperty(global, 'innerWidth', previousWidth);
    else delete global.innerWidth;
  });
  initializePageTools(pageSettings({ showGridColumns: true }));
  await new Promise((resolve) => setImmediate(resolve));

  const control = toolbar.children.find((child) => child.className === 'cmu-grid-columns cmu-page-tool');
  assert.ok(control);
  assert.equal(control.children[1].textContent, '4 colonnes');
  assert.equal(grid.style.gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
  assert.deepEqual(saved.at(-1), { 'cmuGridColumns:products': 4 });
  await control.children[2].listeners.click[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(control.children[1].textContent, '5 colonnes');
  assert.equal(grid.style.gridTemplateColumns, 'repeat(5, minmax(0, 1fr))');
  assert.deepEqual(saved.at(-1), { 'cmuGridColumns:products': 5 });
  await control.children[0].listeners.click[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(control.children[1].textContent, '4 colonnes');
  assert.equal(grid.style.gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
});
