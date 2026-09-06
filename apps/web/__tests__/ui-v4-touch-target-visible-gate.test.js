/**
 * Полоса 4 · задача 69 — логика гейта видимых тач-целей ≥44px.
 */
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXEMPTION_REGISTRY,
  MIN_TOUCH_PX,
  compareRatchet,
  findPseudoExpander,
  hasNegativeMarginExpander,
  isVisibleTouchOk,
  matchesExemption,
  measureElement,
  parseCssRules,
  parsePx,
  resolveTouchZone,
  spansContainerWidth,
  visibleAxis,
} from '../../../scripts/ui-v4-check-touch-target-visible.mjs';

const FIXTURE_CSS = `
.touch-ok {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  cursor: pointer;
  background: #ccc;
}
.touch-short {
  display: inline-flex;
  min-height: 30px;
  cursor: pointer;
  background: #ccc;
}
.touch-after-trick {
  position: relative;
  width: 30px;
  height: 30px;
  cursor: pointer;
  background: #ccc;
}
.touch-after-trick::after {
  content: '';
  position: absolute;
  inset: -7px;
}
.touch-neg-margin {
  min-height: 44px;
  margin: -8px;
  cursor: pointer;
  background: #ccc;
}
.progress-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  cursor: pointer;
  background: #999;
}
`;

function mount(cssText = FIXTURE_CSS) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    pretendToBeVisual: true,
  });
  const style = dom.window.document.createElement('style');
  style.textContent = cssText;
  dom.window.document.head.appendChild(style);
  return dom.window;
}

describe('ui-v4 touch-target visible gate', () => {
  let window;

  afterEach(() => {
    window = undefined;
  });

  it('parsePx / visibleAxis', () => {
    expect(parsePx('44px')).toBe(44);
    expect(parsePx('auto')).toBe(0);
    expect(visibleAxis(0, 'auto', '44px')).toBe(44);
  });

  it('isVisibleTouchOk · видимая 44px inline-flex проходит', () => {
    window = mount();
    const size = measureElement(window, 'touch-ok');
    expect(size.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    expect(isVisibleTouchOk(size)).toBe(true);
  });

  it('isVisibleTouchOk · 30px без expander — нарушение', () => {
    window = mount();
    const size = measureElement(window, 'touch-short');
    expect(size.minHeight).toBe(30);
    expect(isVisibleTouchOk(size)).toBe(false);
  });

  it('findPseudoExpander · невидимый ::after hit-area', () => {
    const hit = findPseudoExpander(FIXTURE_CSS, '.touch-after-trick');
    expect(hit).toMatchObject({ pseudo: '::after', kind: 'invisible-pseudo-hit-area' });
  });

  it('findPseudoExpander · content:none не считается expander', () => {
    const css = `
      .chip::after { content: none; }
      .chip { cursor: pointer; min-height: 30px; }
    `;
    expect(findPseudoExpander(css, '.chip')).toBeNull();
  });

  it('hasNegativeMarginExpander · отрицательный margin', () => {
    const rules = parseCssRules(FIXTURE_CSS);
    const block = rules.find((r) => r.selectors.includes('.touch-neg-margin')).block;
    expect(hasNegativeMarginExpander(block)).toBe(true);
  });

  it('matchesExemption · progress-dot по типу', () => {
    const ex = matchesExemption('.step-modal-progress-dot');
    expect(ex?.type).toBe('progress-dot');
    expect(ex?.reason).toMatch(/точка прогресса/i);
  });

  it('matchesExemption · named nutrition-v4-chip', () => {
    const ex = matchesExemption('.nutrition-v4-chip.is-off');
    expect(ex?.type).toBe('named-exception');
    expect(ex?.reason).toMatch(/nutrition-tab/i);
  });

  it('compareRatchet · рост долга падает', () => {
    const inventory = {
      counts: { violations: 5 },
      violations: [{ file: 'a.css', selector: '.x' }],
    };
    const baseline = { totalViolations: 3, violationKeys: ['a.css::.y'] };
    const r = compareRatchet(inventory, baseline);
    expect(r.fail).toBe(true);
    expect(r.delta).toBe(2);
    expect(r.newKeys).toContain('a.css::.x');
  });

  it('compareRatchet · замороженный остаток зелёный', () => {
    const inventory = {
      counts: { violations: 3 },
      scope: { unknownViolations: 2 },
      violations: [{ file: 'a.css', selector: '.y' }],
    };
    const baseline = { totalViolations: 3, unknownViolations: 2, violationKeys: ['a.css::.y'] };
    expect(compareRatchet(inventory, baseline).fail).toBe(false);
  });

  it('resolveTouchZone · FAB не попадает в login', () => {
    expect(resolveTouchZone('730-widgets-dashboard.css', '.widgets-fab-global', 'widgets-fab-global')).toBe(
      'home-widgets',
    );
    expect(resolveTouchZone('733-ui-v4-login-theme.css', '.heys-login-theme__done', 'heys-login-theme__done')).toBe(
      'login',
    );
    expect(resolveTouchZone('000-base-and-gamification.css', '.btn', 'btn')).toBeNull();
  });

  it('resolveTouchZone · cycle-календарь из 500-pwa в cycle', () => {
    expect(
      resolveTouchZone('500-pwa-and-offline.css', '.cycle-date-picker-cell', 'cycle-date-picker-cell'),
    ).toBe('cycle');
  });

  it('spansContainerWidth · calc(100% - N) — полная ширина', () => {
    expect(spansContainerWidth({ display: 'flex', width: 'calc(100% - 36px)' })).toBe(true);
  });

  it('matchesExemption · ios-toggle и mood-slider', () => {
    expect(matchesExemption('.ios-toggle')?.type).toBe('toggle-knob');
    expect(matchesExemption('.mood-slider')?.type).toBe('range-slider');
  });

  it('EXEMPTION_REGISTRY · каждая запись именует тип и причину', () => {
    for (const row of EXEMPTION_REGISTRY) {
      expect(row.type).toBeTruthy();
      expect(row.reason).toBeTruthy();
      expect(row.selector || row.match).toBeTruthy();
    }
  });
});
