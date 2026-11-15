const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
const {
  PROMO_SAMPLE,
  matchPokemonPromo,
  buildCardmarketPromoUrl,
  initializePromos,
} = require('../promos.js');

test('uses a small fact-based sample of Enhanced ETB and UPC promo mappings', () => {
  assert.deepEqual(PROMO_SAMPLE.map(({ name, number, collection, type, cardmarketPath }) => ({ name, number, collection, type, cardmarketPath })), [
    {
      name: 'Charizard V', number: 'SWSH050', collection: "Champion's Path", type: 'etb',
      cardmarketPath: '/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050',
    },
    {
      name: 'Charizard ex', number: '161', collection: 'Charizard ex', type: 'upc',
      cardmarketPath: '/Pokemon/Products/Singles/SV-Black-Star-Promos/Charizard-ex-SVP161',
    },
    {
      name: 'Mega Charizard X ex', number: '23', collection: 'Mega Charizard X ex', type: 'upc',
      cardmarketPath: '/Pokemon/Products/Singles/MEP-Black-Star-Promos/Mega-Charizard-X-ex-MEP023',
    },
  ]);
});

test('matches only known Pokémon Singles detail/product links by their set and card slugs', () => {
  assert.equal(matchPokemonPromo('/fr/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050?language=2').name, 'Charizard V');
  assert.equal(matchPokemonPromo('https://www.cardmarket.com/en/Pokemon/Products/Singles/SV-Black-Star-Promos/Charizard-ex-SVP161').type, 'upc');
  assert.equal(matchPokemonPromo('/fr/Magic/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050'), null);
  assert.equal(matchPokemonPromo('/fr/Pokemon/Products/Search?searchString=Charizard'), null);
  assert.equal(matchPokemonPromo('/fr/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Unknown-SWSH999'), null);
});

test('builds a same-origin localized Cardmarket promo target and rejects unsafe inputs', () => {
  const promo = matchPokemonPromo('/fr/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050');
  assert.equal(
    buildCardmarketPromoUrl('https://www.cardmarket.com/fr/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050?language=2', promo),
    'https://www.cardmarket.com/fr/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050',
  );
  assert.equal(buildCardmarketPromoUrl('https://evil.example/fr/Pokemon/Products/Singles/a/b', promo), null);
  assert.equal(buildCardmarketPromoUrl('https://www.cardmarket.com/fr/Pokemon/Products/Singles/a/b', { ...promo, cardmarketPath: '//evil.example/path' }), null);
});

test('adds promo badges to the card detail and matching seller rows only when enabled', () => {
  const makeNode = (tagName, textContent = '') => ({
    tagName: tagName.toUpperCase(), textContent, children: [], attributes: {}, listeners: {},
    append(child) { child.parentElement = this; this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    querySelector(selector) {
      if (selector === '.cmu-promo-badge') return this.children.find((child) => child.className === 'cmu-promo-badge') || null;
      return this.children.find((child) => child.matches?.(selector)) || null;
    },
  });
  const createDocument = ({ infoItems = [], rows = [] } = {}) => ({
    querySelectorAll(selector) {
      if (selector === '.info-list-container dt, .info-list-container dd') return infoItems;
      if (selector === '#UserOffersTable div.article-row') return rows;
      return [];
    },
    createElement: (tagName) => makeNode(tagName),
  });
  const current = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/SWSH-Black-Star-Promos/Charizard-V-SWSH050';
  const numberLabel = makeNode('dt', 'Nombre');
  const numberValue = makeNode('dd', 'SWSH050');
  const detailDocument = createDocument({ infoItems: [numberLabel, numberValue] });
  assert.equal(initializePromos({ enabled: true, showPromos: true }, {
    documentRef: detailDocument,
    locationRef: { href: current, pathname: new URL(current).pathname, origin: new URL(current).origin },
  }), true);
  const detailBadge = numberValue.children[0];
  assert.equal(detailBadge.className, 'cmu-promo-badge');
  assert.equal(detailBadge.textContent, 'ETB Promo');
  assert.equal(detailBadge.href, current);
  assert.equal(detailBadge.target, undefined, 'the safe same-origin link stays in the current tab');

  const attributeCell = makeNode('div');
  const row = makeNode('div');
  const link = makeNode('a');
  link.href = '/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Mega-Charizard-X-ex-MEP023';
  link.getAttribute = (name) => name === 'href' ? link.href : null;
  row.querySelector = (selector) => selector === 'a[href]' ? link : selector === '.product-attributes' ? attributeCell : null;
  const unrelatedCell = makeNode('div');
  const unrelatedRow = makeNode('div');
  const unrelatedLink = makeNode('a');
  unrelatedLink.href = '/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Unknown-MEP999';
  unrelatedLink.getAttribute = (name) => name === 'href' ? unrelatedLink.href : null;
  unrelatedRow.querySelector = (selector) => selector === 'a[href]' ? unrelatedLink : selector === '.product-attributes' ? unrelatedCell : null;
  const sellerDocument = createDocument({ rows: [row, unrelatedRow] });
  assert.equal(initializePromos({ enabled: true, showPromos: true }, {
    documentRef: sellerDocument,
    locationRef: { href: 'https://www.cardmarket.com/en/Pokemon/Users/Seller/Offers/Singles', pathname: '/en/Pokemon/Users/Seller/Offers/Singles', origin: 'https://www.cardmarket.com' },
  }), true);
  assert.equal(attributeCell.children[0].textContent, 'UPC Promo');
  assert.equal(unrelatedCell.children.length, 0);

  let touched = false;
  assert.equal(initializePromos({ enabled: true, showPromos: false }, {
    documentRef: { querySelectorAll() { touched = true; throw new Error('disabled promo feature must not inspect DOM'); } },
    locationRef: { href: current, pathname: new URL(current).pathname, origin: new URL(current).origin },
  }), false);
  assert.equal(touched, false);
  assert.equal(initializePromos({ enabled: false, showPromos: true }, {
    documentRef: { querySelectorAll() { touched = true; } },
    locationRef: { href: current, pathname: new URL(current).pathname, origin: new URL(current).origin },
  }), false);
  assert.equal(touched, false);
});
