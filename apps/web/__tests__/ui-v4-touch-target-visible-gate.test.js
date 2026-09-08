/**
 * Полоса 4 · задача 69 — логика гейта видимых тач-целей ≥44px.
 */
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXEMPTION_REGISTRY,
  MIN_TOUCH_PX,
  buildMeasurementStylesheet,
  compareRatchet,
  effectiveTouchSize,
  findPseudoExpander,
  hasNegativeMarginExpander,
  isVisibleTouchOk,
  lineBoxHeightFromBlock,
  matchesExemption,
  measureElement,
  measureFromDeclarations,
  parseCssRules,
  parsePx,
  resolveTouchZone,
  spansContainerWidth,
  spansContainerWidthFromBlock,
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

  it('findPseudoExpander · прозрачный ::after припуск по контракту', () => {
    const rules = parseCssRules(FIXTURE_CSS);
    const hostBlock = rules.find((r) => r.selectors.includes('.touch-after-trick')).block;
    const hit = findPseudoExpander(FIXTURE_CSS, '.touch-after-trick', hostBlock);
    expect(hit).toMatchObject({ pseudo: '::after', kind: 'pseudo-padding-expander', expand: { top: 7 } });
    const size = effectiveTouchSize(30, 30, hit);
    expect(size.width).toBe(44);
    expect(size.height).toBe(44);
    expect(isVisibleTouchOk({ width: size.width, height: size.height, display: 'inline-block' })).toBe(true);
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
    expect(resolveTouchZone('000-base-and-gamification.css', '.btn', 'btn')).toBe('shared');
    expect(resolveTouchZone('000-base-and-gamification.css', '.hdr-theme-btn', 'hdr-theme-btn')).toBe('shared');
    expect(resolveTouchZone('heys-components.css', '.monthly-reports-tab', 'monthly-reports-tab')).toBe(
      'reports-insights',
    );
  });

  it('resolveTouchZone · cycle-календарь из 500-pwa в cycle', () => {
    expect(
      resolveTouchZone('500-pwa-and-offline.css', '.cycle-date-picker-cell', 'cycle-date-picker-cell'),
    ).toBe('cycle');
  });

  it('spansContainerWidth · calc(100% - N) — полная ширина', () => {
    expect(spansContainerWidth({ display: 'flex', width: 'calc(100% - 36px)' })).toBe(true);
    expect(spansContainerWidthFromBlock('display: flex; width: calc(100% - 36px);')).toBe(true);
  });

  it('measureFromDeclarations · full-row padding даёт высоту ≥44', () => {
    const block = `
      display: flex;
      width: 100%;
      padding: 12px 16px;
      min-height: 44px;
      cursor: pointer;
    `;
    const size = measureFromDeclarations(block);
    expect(size.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    expect(size.heightChecked).toBe(true);
    expect(size.fromDeclarations).toBe(true);
  });

  it('lineBoxHeightFromBlock · padding + font-size без height', () => {
    const h = lineBoxHeightFromBlock('padding: 10px 13px; font-size: 13px; border: 1px solid #ccc;');
    expect(h).toBeGreaterThan(0);
  });

  it('buildMeasurementStylesheet · подтягивает ::after хоста', () => {
    const css = `
      .foo { position: relative; cursor: pointer; width: 30px; height: 30px; }
      .foo::after { content: ''; position: absolute; inset: -7px; }
    `;
    const sheet = buildMeasurementStylesheet(css, '.foo', 'position: relative; cursor: pointer; width: 30px; height: 30px;');
    expect(sheet).toContain('.foo::after');
  });

  it('matchesExemption · ios-toggle и mood-slider', () => {
    expect(matchesExemption('.ios-toggle')?.type).toBe('toggle-knob');
    expect(matchesExemption('.mood-slider')?.type).toBe('range-slider');
  });

  it('widgetTileTouchExempt · плитка, не shell .widgets-*', async () => {
    const { widgetTileTouchExempt } = await import('../../../scripts/ui-v4-check-touch-target-visible.mjs');
    expect(widgetTileTouchExempt('.widget')).toBe(true);
    expect(widgetTileTouchExempt('.widget__delete-btn')).toBe(true);
    expect(widgetTileTouchExempt('.widgets-grid--remove-pick .widget')).toBe(true);
    expect(widgetTileTouchExempt('.widgets-tab__btn')).toBe(false);
    expect(widgetTileTouchExempt('.widgets-catalog__close')).toBe(false);
  });

  it('EXEMPTION_REGISTRY · каждая запись именует тип и причину', () => {
    for (const row of EXEMPTION_REGISTRY) {
      expect(row.type).toBeTruthy();
      expect(row.reason).toBeTruthy();
      expect(row.selector || row.match).toBeTruthy();
    }
  });
});
