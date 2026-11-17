const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'pokemon.css'), 'utf8');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');

test('minima and chart inherit Cardmarket light or dark theme colors without a forced white surface', () => {
  assert.match(styles, /--cmu-ink:\s*var\(--bs-body-color,\s*inherit\)/);
  assert.match(styles, /--cmu-card:\s*var\(--bs-body-bg,\s*transparent\)/);
  assert.match(styles, /--cmu-line:\s*var\(--bs-border-color,\s*currentColor\)/);
  assert.doesNotMatch(styles, /\.cmu-chart\s*\{[^}]*background:\s*#fff/i);
  assert.doesNotMatch(styles, /\.cmu-chart(?:-tooltip|-)?[^{}]*\{[^}]*color:\s*#212529/i);
  assert.match(content, /getComputedStyle\(canvas\)/);
  assert.match(content, /chartColor\('--bs-primary'/);
  assert.match(content, /chartColor\('--bs-body-color'/);
});

test('extension tags follow the offer language flag and use theme-aware colors', () => {
  assert.match(styles, /\.cmu-offer-tags\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(styles, /\.cmu-offer-tag\s*\{[^}]*--bs-tertiary-bg/s);
  const helper = fs.readFileSync(path.join(root, 'pokemon-offers.js'), 'utf8');
  assert.match(helper, /:scope > \.icon\.me-2/);
  assert.match(helper, /const insertionPoint = languageMarker \|\| condition/);
  assert.ok(helper.includes("insertionPoint?.insertAdjacentElement) insertionPoint.insertAdjacentElement('afterend', container)"));
  assert.match(helper, /badge\.textContent = tag\.label/);
  assert.doesNotMatch(helper, /<img|assets\/grading\/logos|cmu-offer-grade-logo/);
  assert.doesNotMatch(styles, /cmu-offer-grade-logo/);
  assert.match(content, /CardmarketPokemonOffers\.installOfferTags\(\)/);
});
