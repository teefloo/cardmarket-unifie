const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');
const { shouldRunPartnerFeatures, getPartnerProductTitle, getPartnerPriceText, isPartnerProductCandidate, buildCardmarketSearchUrl } = require('../partner.js');

test('honors both the global switch and the individual partner-links switch', () => {
  assert.equal(shouldRunPartnerFeatures({ enabled: false, showPartnerLinks: true }), false);
  assert.equal(shouldRunPartnerFeatures({ enabled: true, showPartnerLinks: true }), true);
  assert.equal(shouldRunPartnerFeatures({ enabled: true, showPartnerLinks: false }), false);
  assert.equal(shouldRunPartnerFeatures({ enabled: false, showPartnerLinks: true }), false);
  assert.equal(shouldRunPartnerFeatures({}), false);
});

test('derives product titles from product heading and image metadata instead of generic link labels', () => {
  assert.equal(getPartnerProductTitle({ linkText: 'View', heading: 'Pokémon TCG: Sample Figure Collection' }), 'Pokémon TCG: Sample Figure Collection');
  assert.equal(getPartnerProductTitle({ linkText: '', imageAlt: 'Mega Charizard X ex - Mega Evolution Promo - MEP029' }), 'Mega Charizard X ex - Mega Evolution Promo - MEP029');
  assert.equal(getPartnerProductTitle({ linkText: 'Quick view' }), null);
});

test('only treats same-origin product links as partner products, excluding navigation, cart, footer and category links', () => {
  const product = {
    href: 'https://zycards.nl/products/mega-charizard-x-ex-mep029',
    pageUrl: 'https://zycards.nl/',
    title: 'Mega Charizard X ex - Mega Evolution Promo - MEP029',
    hasImage: true,
    hasPrice: true,
  };
  assert.equal(isPartnerProductCandidate(product), true);
  assert.equal(isPartnerProductCandidate({ ...product, insideNavigation: true }), false);
  assert.equal(isPartnerProductCandidate({ ...product, href: 'https://zycards.nl/cart', title: 'Cart' }), false);
  assert.equal(isPartnerProductCandidate({ ...product, href: 'https://zycards.nl/collections/riftbound-sealed', title: 'Riftbound Sealed' }), false);
  assert.equal(isPartnerProductCandidate({ ...product, href: 'https://example.com/products/card' }), false);
  assert.equal(isPartnerProductCandidate({ ...product, href: 'https://zycards.nl/', hasImage: false, hasPrice: false }), false);
});

test('builds partner searches for the detected product game, including Riftbound, Lorcana, Pokémon and One Piece', () => {
  assert.equal(
    buildCardmarketSearchUrl({ pathname: '/en/collections/riftbound-sealed', title: 'Riftbound Sealed Booster Box' }),
    'https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=Riftbound%20Sealed%20Booster%20Box',
  );
  assert.equal(
    buildCardmarketSearchUrl({ pathname: '/collections/lorcana', title: 'Disney Lorcana Illumineer’s Trove' }),
    'https://www.cardmarket.com/en/Lorcana/Products/Search?searchString=Disney%20Lorcana%20Illumineer%E2%80%99s%20Trove',
  );
  assert.equal(
    buildCardmarketSearchUrl({ pathname: '/nl/products/mega-charizard-x', title: 'Mega Charizard X ex - Mega Evolution Promo - MEP029' }),
    'https://www.cardmarket.com/nl/Pokemon/Products/Search?searchString=Mega%20Charizard%20X%20ex%20-%20Mega%20Evolution%20Promo%20-%20MEP029',
  );
  assert.equal(
    buildCardmarketSearchUrl({ pathname: '/products/ascended-heroes-elite-trainer-box', title: 'Ascended Heroes - Elite Trainer Box' }),
    'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Ascended%20Heroes%20-%20Elite%20Trainer%20Box',
  );
  assert.equal(
    buildCardmarketSearchUrl({ pathname: '/products/one-piece-op-01-box', title: 'One Piece Card Game OP-01 Booster Box' }),
    'https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=One%20Piece%20Card%20Game%20OP-01%20Booster%20Box',
  );
});

test('passes a visible partner price and site using the source-compatible escaped hash contract', () => {
  assert.equal(typeof getPartnerPriceText, 'function');
  assert.equal(getPartnerPriceText({ dataPrice: '12.95', text: '€12,95' }), '12.95');
  assert.equal(getPartnerPriceText({ text: 'Prix: 12,95 €' }), '12,95 €');
  assert.equal(getPartnerPriceText({ text: 'Card + €9.95', dataPrice: 'not-a-number' }), '€9.95');
  assert.equal(getPartnerPriceText({ text: 'No price available' }), '');
  const result = buildCardmarketSearchUrl({ pathname: '/nl/products/card', title: 'Pikachu <Promo>', price: '12,50 €', sourceSite: 'shop.example' });
  const parsed = new URL(result);
  assert.equal(parsed.searchParams.get('searchString'), 'Pikachu <Promo>');
  assert.equal(parsed.hash, '#ehcm---price--12%2C50%20%E2%82%AC---from--shop.example');
});
