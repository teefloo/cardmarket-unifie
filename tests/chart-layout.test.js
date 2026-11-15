const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

test('Matras chart releases Cardmarket info panes from their nested scroll height', () => {
  const layoutRule = styles.match(/(?:#tabContent-info:has\(\.cmu-chart\)|\.tab-content:has\(\.cmu-chart\))\s*\{([^}]+)\}/g) || [];
  assert.ok(layoutRule.length >= 2, 'both the info pane and its tab-content wrapper are scoped');
  const declarations = layoutRule.join(' ');
  assert.match(declarations, /max-height\s*:\s*none\s*!important/i);
  assert.match(declarations, /height\s*:\s*auto\s*!important/i);
  assert.match(declarations, /overflow\s*:\s*visible\s*!important/i);
});

test('Matras average summary is styled as a responsive secondary line', () => {
  const declaration = styles.match(/\.cmu-chart-averages\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(declaration, /flex\s*:\s*1\s+1\s+100%/);
  assert.match(declaration, /color\s*:\s*var\(--cmu-muted\)/);
  assert.match(declaration, /font-size\s*:\s*12px/);
});
