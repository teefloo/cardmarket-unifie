const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Offers = require('../pokemon-offers.js');

test('detects explicit French and English sealed wording, including common typos', () => {
  for (const wording of ['Scellé', 'scelé', 'Factory sealed', 'factory seald', 'sous blister', 'Unopened']) {
    assert.deepEqual(Offers.detectOfferTags(wording), [{ type: 'sealed', label: 'SCELLÉ' }], wording);
  }
});

test('recognizes grading companies and scores with accent and decimal variants', () => {
  assert.deepEqual(Offers.detectOfferTags('PSA 9,5'), [
    { type: 'grade', brand: 'psa', brandName: 'PSA', grade: '9.5', label: 'PSA 9.5' },
  ]);
  assert.deepEqual(Offers.detectOfferTags('Bécket 9,5'), [
    { type: 'grade', brand: 'bgs', brandName: 'BGS', grade: '9.5', label: 'BGS 9.5' },
  ]);
  assert.deepEqual(Offers.detectOfferTags('Collect Aura 9,5/10'), [
    { type: 'grade', brand: 'collect-aura', brandName: 'Collect Aura', grade: '9.5/10', label: 'Collect Aura 9.5/10' },
  ]);
});

test('does not bundle grading logos without confirmed licenses', () => {
  assert.equal(Offers.GRADING_LOGO_ASSETS, undefined);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const resources = new Set(manifest.web_accessible_resources.flatMap((entry) => entry.resources));
  const packageScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'package-webstore.mjs'), 'utf8');
  const provenance = fs.readFileSync(path.join(__dirname, '..', 'assets', 'grading', 'PROVENANCE.md'), 'utf8');
  const removedLogos = [
    'psa.jpg', 'bgs.jpg', 'cgc.png', 'collect-aura.png', 'pure-grading.svg', 'ccc.svg', 'ags.svg', 'ace.svg',
    'tag.png', 'graad.png', 'mnt.png', 'ars.png', 'ksa.jpg', 'gma.png', 'hga.svg', 'pca.png', 'sgc.png',
  ];
  for (const filename of removedLogos) {
    const asset = `assets/grading/logos/${filename}`;
    assert.ok(!fs.existsSync(path.join(__dirname, '..', asset)), `${asset} was removed from the source tree`);
    assert.ok(!resources.has(asset), `${asset} is not web accessible`);
    assert.ok(!packageScript.includes(`'${asset}'`), `${asset} is not copied into the package`);
    assert.ok(provenance.includes(`logos/${filename}`), `${filename} removal is documented`);
  }
  assert.match(provenance, /aucune licence d’utilisation n’a pu être confirmée/i);
  assert.deepEqual([...resources], ['pokemon.css']);
  assert.match(packageScript, /pokemon-offers\.js/);
});

test('rejects negated, hypothetical, and questioned tags', () => {
  for (const claim of [
    'not sealed', 'not yet sealed', 'pas encore scellé', 'non gradé PCA 9',
    'not sealed; maybe PSA 10', 'possible PSA 10', 'sealed? · PCA 9?',
  ]) assert.deepEqual(Offers.detectOfferTags(claim), [], claim);
});

test('scans product information and comment, then adds tags after the language flag', () => {
  function element(tagName) {
    return {
      nodeType: 1,
      tagName: tagName.toUpperCase(),
      className: '',
      textContent: '',
      childNodes: [],
      children: [],
      dataset: {},
      attributes: {},
      parentElement: null,
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(child) {
        child.parentElement = this;
        this.childNodes.push(child);
        this.children.push(child);
      },
      remove() {
        if (!this.parentElement) return;
        this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this);
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        this.parentElement = null;
      },
      insertAdjacentElement(position, child) {
        assert.equal(position, 'afterend');
        const siblings = this.parentElement.childNodes;
        const index = siblings.indexOf(this);
        child.parentElement = this.parentElement;
        siblings.splice(index + 1, 0, child);
        this.parentElement.children = siblings.slice();
      },
      querySelector(selector) {
        return this.lookup?.[selector] || null;
      },
    };
  }

  const attributes = element('div');
  attributes.className = 'product-attributes';
  const condition = element('a');
  condition.className = 'article-condition condition-nm';
  condition.textContent = 'NM';
  attributes.append(condition);
  const languageFlag = element('span');
  languageFlag.className = 'icon me-2';
  languageFlag.setAttribute('aria-hidden', 'true');
  attributes.append(languageFlag);
  const comments = element('div');
  comments.className = 'product-comments';
  comments.textContent = 'PSA 9,5';
  const productInfo = element('div');
  productInfo.className = 'product-info';
  productInfo.textContent = 'Carte Pokémon scelé sous blister';
  const row = element('div');
  row.className = 'article-row';
  row.dataset = {};
  row.lookup = {
    '.product-attributes': attributes,
    '.product-info, .article-name, .product-name, .article-description, [data-product-name]': productInfo,
    '.product-comments': comments,
    'a.article-condition[class*="condition-"]': condition,
    '.article-condition': condition,
  };
  const queryRow = row.querySelector.bind(row);
  row.querySelector = (selector) => selector === '.cmu-offer-tags'
    ? attributes.children.find((child) => child.className === 'cmu-offer-tags') || null
    : queryRow(selector);
  const documentRef = { createElement: element };
  assert.equal(Offers.readOfferText(row), 'Carte Pokémon scelé sous blister · PSA 9,5');
  assert.equal(Offers.renderOfferTags([row], { documentRef }), 1);
  const tags = attributes.children.find((child) => child.className === 'cmu-offer-tags');
  assert.ok(tags, 'a tag group is inserted beside the condition code');
  assert.equal(attributes.children.indexOf(tags), attributes.children.indexOf(languageFlag) + 1);
  assert.equal(tags.children.length, 2);
  assert.equal(tags.children[0].textContent, 'SCELLÉ');
  assert.equal(tags.children[1].textContent, 'PSA 9.5');
  assert.equal(tags.children[1].children.length, 0, 'grading details are plain text, without an image element');
  assert.equal(Offers.renderOfferTags([row], { documentRef }), 0, 'unchanged rows are not re-rendered');

  comments.textContent = 'PSA 10?';
  assert.equal(Offers.renderOfferTags([row], { documentRef }), 1);
  const updated = attributes.children.find((child) => child.className === 'cmu-offer-tags');
  assert.equal(updated.children.length, 1, 'uncertain grades are omitted while product details remain scannable');
  assert.equal(updated.children[0].textContent, 'SCELLÉ');

  languageFlag.remove();
  delete row.dataset.cmuOfferTagsSignature;
  assert.equal(Offers.renderOfferTags([row], { documentRef }), 1);
  const fallback = attributes.children.find((child) => child.className === 'cmu-offer-tags');
  assert.equal(attributes.children.indexOf(fallback), attributes.children.indexOf(condition) + 1, 'missing language marker falls back to immediately after the condition');

  comments.textContent = 'SGC 9';
  delete row.dataset.cmuOfferTagsSignature;
  assert.equal(Offers.renderOfferTags([row], { documentRef }), 1);
  const sgcBadge = attributes.children.find((child) => child.className === 'cmu-offer-tags')
    .children.find((child) => child.className.includes('--grade'));
  assert.equal(sgcBadge.textContent, 'SGC 9');
  assert.equal(sgcBadge.children.length, 0);

  comments.textContent = 'PCA 9';
  delete row.dataset.cmuOfferTagsSignature;
  assert.equal(Offers.renderOfferTags([row], { documentRef }), 1);
  const pcaBadge = attributes.children.find((child) => child.className === 'cmu-offer-tags')
    .children.find((child) => child.className.includes('--grade'));
  assert.equal(pcaBadge.textContent, 'PCA 9');
  assert.equal(pcaBadge.children.length, 0);
});

test('installs offer tags only on supported Pokémon product details', () => {
  const observed = [];
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe(target, options) { observed.push({ target, options }); }
    disconnect() {}
  }
  const documentRef = {
    body: {},
    querySelector(selector) { return selector === '.article-table' ? {} : null; },
    querySelectorAll() { return []; },
  };
  const settingsApi = require('../settings.js');
  assert.ok(Offers.installOfferTags({
    documentRef,
    locationRef: { pathname: '/fr/Pokemon/Products/Singles/151/Mew' },
    settingsApi,
    MutationObserverClass: Observer,
  }));
  assert.equal(observed.length, 1);
  assert.equal(observed[0].options.characterData, true);
  assert.ok(Offers.installOfferTags({
    documentRef,
    locationRef: { pathname: '/fr/Pokemon/Products/Booster-Boxes/Example-ETB' },
    settingsApi,
    MutationObserverClass: Observer,
  }), 'sealed Pokémon product details also enable the tags');
  assert.equal(Offers.installOfferTags({
    documentRef,
    locationRef: { pathname: '/fr/Magic/Products/Singles/Set/Card' },
    settingsApi,
    MutationObserverClass: Observer,
  }), null);
});
