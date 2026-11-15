const test = require('node:test');
const assert = require('node:assert/strict');
require('../settings.js');

let SpoilerTools = {};
try { SpoilerTools = require('../spoiler-tools.js'); } catch { /* RED before implementation. */ }

test('recognizes only the source-listed non-game accessory terms on spoiler cards', () => {
  assert.equal(typeof SpoilerTools.isSpoilersPage, 'function');
  assert.equal(typeof SpoilerTools.isAccessoryText, 'function');
  for (const title of ['Dragon Shield sleeves', 'Ultimate Guard Deck Case', 'TCG Guru deck box', 'Ultra Pro 9-Pocket binder', 'Toploader']) {
    assert.equal(SpoilerTools.isAccessoryText(title), true, title);
  }
  for (const title of ['Pikachu VMAX', 'Dragonite V', 'Pokémon deck strategy', 'Ultra Ball']) {
    assert.equal(SpoilerTools.isAccessoryText(title), false, title);
  }
  assert.equal(SpoilerTools.isSpoilersPage('/en/Pokemon/Spoilers/New-Products'), true);
  assert.equal(SpoilerTools.isSpoilersPage('/en/Pokemon/Products/Singles/Set/Card'), false);
});

test('filters rows reversibly without removing their card nodes', () => {
  assert.equal(typeof SpoilerTools.filterSpoilerCards, 'function');
  const rows = [
    { text: 'Dragon Shield Matte Sleeves', hidden: false },
    { text: 'Pikachu VMAX', hidden: false },
    { text: 'Ultra Pro Deck Box', hidden: false },
  ];
  assert.deepEqual(SpoilerTools.filterSpoilerCards(rows, true), ['Dragon Shield Matte Sleeves', 'Ultra Pro Deck Box']);
  assert.deepEqual(SpoilerTools.filterSpoilerCards(rows, false), []);
  assert.deepEqual(rows.map(({ hidden }) => hidden), [false, false, false], 'pure helper never mutates Cardmarket rows');
});

test('applies and clears a reversible class on matched Cardmarket d-flex rows', () => {
  const classNames = new Set();
  const wrapper = {
    classList: {
      add(name) { classNames.add(name); },
      remove(name) { classNames.delete(name); },
    },
  };
  const card = { closest(selector) { return selector.includes('d-flex') ? wrapper : null; } };
  const paragraph = { textContent: 'Ultra Pro Deck Box', closest(selector) { return selector.includes('.card') ? card : null; } };
  const documentRef = {
    querySelectorAll(selector) {
      if (selector.includes('.cmu-spoiler-accessory-hidden')) return classNames.has('cmu-spoiler-accessory-hidden') ? [wrapper] : [];
      if (selector.includes('p.card-text.d-block')) return [paragraph];
      return [];
    },
  };
  const dispatched = [];
  const hide = SpoilerTools.applyAccessoryFilter(documentRef, true, () => dispatched.push('load'));
  assert.equal(hide.hidden, 1);
  assert.equal(classNames.has('cmu-spoiler-accessory-hidden'), true);
  const show = SpoilerTools.applyAccessoryFilter(documentRef, false, () => dispatched.push('load'));
  assert.equal(show.hidden, 0);
  assert.equal(classNames.has('cmu-spoiler-accessory-hidden'), false);
  assert.deepEqual(dispatched, ['load', 'load']);
});

test('scroll image-load helper coalesces bursts and dispatches only the documented load event', () => {
  assert.equal(typeof SpoilerTools.createLoadOnScrollHandler, 'function');
  const timers = [];
  const dispatched = [];
  const handler = SpoilerTools.createLoadOnScrollHandler({
    delayMs: 250,
    setTimeoutFn(callback, delay) { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeoutFn(timer) { timer.cancelled = true; },
    dispatchLoad() { dispatched.push('load'); },
  });
  handler(); handler(); handler();
  assert.equal(timers.filter((timer) => !timer.cancelled).length, 1);
  assert.equal(timers.at(-1).delay, 250);
  timers.at(-1).callback();
  assert.deepEqual(dispatched, ['load']);
});

test('install gates image loading and accessory controls independently while honoring the master switch', () => {
  const listeners = [];
  const windowRef = {
    addEventListener(type, callback) { listeners.push({ type, callback }); },
    dispatchEvent() {},
    Event: class Event {},
  };
  const documentRef = {
    body: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const base = { enabled: true, forceSpoilerImageLoad: false, hideSpoilerAccessories: false };
  let result = SpoilerTools.installSpoilerTools(base, { documentRef, windowRef, pathname: '/en/Pokemon/Spoilers/New-Products' });
  assert.equal(result.scrollHandler, null);
  assert.equal(result.control, null);
  assert.deepEqual(listeners, []);

  result = SpoilerTools.installSpoilerTools({ ...base, forceSpoilerImageLoad: true }, { documentRef, windowRef, pathname: '/en/Pokemon/Spoilers/New-Products' });
  assert.equal(typeof result.scrollHandler, 'function');
  assert.equal(result.control, null);
  assert.deepEqual(listeners.map(({ type }) => type), ['scroll']);

  result = SpoilerTools.installSpoilerTools({ ...base, enabled: false, forceSpoilerImageLoad: true, hideSpoilerAccessories: true }, { documentRef, windowRef, pathname: '/en/Pokemon/Spoilers/New-Products' });
  assert.equal(result.scrollHandler, null);
  assert.equal(result.control, null);
  assert.equal(listeners.length, 1);
});
