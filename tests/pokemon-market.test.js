const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core.js');

test('calculates the minimum visible offer for each card condition', () => {
  const minima = Core.buildConditionMinima([
    { condition: 'NM', price: '1,20 €', href: '#nm-1' },
    { condition: 'nm', price: '0,95 €', href: '#nm-2' },
    { condition: 'EX', price: '2,10 €', href: '#ex-1' },
    { condition: 'EX', price: '1,75 €', href: '#ex-2' },
    { condition: 'invalid', price: '0,01 €' },
  ]);
  assert.equal(minima.length, 7);
  assert.deepEqual(minima.filter((item) => item.price !== null), [
    { code: 'NM', label: 'Near Mint', price: 0.95, href: '#nm-2' },
    { code: 'EX', label: 'Excellent', price: 1.75, href: '#ex-2' },
  ]);
});

test('returns explicit empty states when no offers match the current Cardmarket filters', () => {
  const minima = Core.buildConditionMinima([]);
  assert.equal(minima.length, 7);
  assert.ok(minima.every((item) => item.price === null && item.href === ''));
});

test('content renders all condition states from visible offer rows without greying rows', () => {
  const root = path.join(__dirname, '..');
  const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'pokemon.css'), 'utf8');
  assert.match(content, /CardmarketCore\.buildConditionMinima\(entries\)/);
  assert.match(content, /item\.price === null \? '—' : money\(item\.price\)/);
  assert.match(content, /row\.getClientRects\(\)\.length > 0/);
  assert.match(content, /MutationObserver\(scheduleRender\)/);
  assert.doesNotMatch(styles, /cmu-unavailable-offer|opacity\s*:/);
});

test('history graph is added only to Pokémon Singles and uses the neutral public label', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.match(content, /if \(product\?\.game === 6 && featureEnabled\('showHistoricalChart'\)\)/);
  assert.match(content, /<strong>Historique<\/strong>/);
  assert.doesNotMatch(content, /Historique Matras/);
});
