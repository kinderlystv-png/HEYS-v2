import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkCanonicalLine,
  isMetaQuoteLine,
  readPricingFromTs,
  reportHeysBriefStale,
} from './check-pricing-sync.cjs';

const pricing = readPricingFromTs();

test('honest meta-quote about stale HEYS_BRIEF does not fail', () => {
  const line =
    '> `docs/HEYS_BRIEF.md` тарифы стоят старые (Pro 12 990, Pro+ 19 990) и экономика';
  assert.ok(isMetaQuoteLine(line));
  assert.deepEqual(checkCanonicalLine('fixture.md', 42, line, pricing), []);
});

test('canonical stale Pro+ tariff table row fails', () => {
  const line = '| Pro+ | **14 990 ₽** | Премиум сопровождение |';
  const errors = checkCanonicalLine('fixture.md', 7, line, pricing);
  assert.ok(errors.length >= 1);
  assert.ok(errors.some((e) => e.includes('Pro+') && e.includes('fixture.md:7')));
});

test('canonical launch line with Pro+ fails outside meta-quote', () => {
  const line = 'AI не меняет текущую сетку запуска **Self / Pro / Pro+**.';
  const errors = checkCanonicalLine('fixture.md', 3, line, pricing);
  assert.ok(errors.some((e) => e.includes('линия запуска')));
});

test('HEYS_BRIEF stale report finds known drift without editing docs', () => {
  const report = reportHeysBriefStale();
  assert.equal(typeof report.found, 'boolean');
  assert.ok(Array.isArray(report.lines));
});
