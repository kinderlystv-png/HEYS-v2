import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CASCADE_PATH = path.join(WEB_DIR, 'heys_cascade_card_v1.js');
const CASCADE_SOURCE = fs.readFileSync(CASCADE_PATH, 'utf8');
const DASHBOARD_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'insights/pi_ui_dashboard.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/734-ui-v4-insights.css'), 'utf8');
const PALETTES = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');

const originalHEYS = window.HEYS;

function loadCascadeCard() {
  // eslint-disable-next-line no-eval
  eval(CASCADE_SOURCE);
  return window.HEYS.CascadeCard;
}

function rule(selector) {
  const start = CSS.indexOf(selector + ' {');
  expect(start, selector).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

beforeEach(() => {
  window.HEYS = {};
  window.React = {
    memo: (component) => component,
    createElement: () => null,
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
  };
});

afterEach(() => {
  window.HEYS = originalHEYS;
  delete window.React;
});

describe('Инсайты v4 · каскад дня', () => {
  it('строит canvas-модель из фактов движка, а не из fixture-чисел', () => {
    const CascadeCard = loadCascadeCard();
    const events = [
      { type: 'meal', time: '7:40', label: 'Завтрак', weight: 0.2 },
      { type: 'steps', time: '10:15', label: 'Шаги', weight: 0.8 },
      { type: 'pause', time: '12:00', label: 'Пауза', weight: 0 },
      { type: 'meal', time: '13:20', label: 'Обед', weight: 0.4 },
      { type: 'training', time: '18:00', label: 'Тренировка', weight: 1.8 },
      { type: 'meal', time: '19:20', label: 'Ужин', weight: 0.3 },
      { type: 'sleep', time: '23:10', label: 'Сон', weight: 1.2 },
    ];
    const model = CascadeCard.buildInsightsCascadeV4Model({
      events,
      dailyContribution: 0.4,
      crsTrend: 'up',
      daysAtPeak: 8,
      message: { short: 'fallback не должен победить серию' },
    }, {
      state: 'GROWING',
      current: 0.8325,
      ceiling: 1.125,
      delta14: 0.4,
    });

    expect(model.stateLabel).toBe('Держу ритм');
    expect(model.directionLabel).toBe('растёт');
    expect(model.fillPercent).toBeCloseTo(74, 5);
    expect(model.thresholdPercents[0]).toBeCloseTo(40, 8);
    expect(model.thresholdPercents[1]).toBeCloseTo(62.22222222222222, 8);
    expect(model.thresholdPercents[2]).toBeCloseTo(90, 8);
    expect(model.streakText).toBe('Восьмой день подряд без срывов — ритм держится.');
    expect(model.contributionText).toBe('+0,4');
    expect(model.firstTime).toBe('07:40');
    expect(model.delta14Text).toBe('+40');
    expect(model.dots.map((dot) => dot.size)).toEqual([9, 12, 7, 10, 11, 9, 13]);
    expect(model.dots.map((dot) => dot.tone)).toEqual([
      'good', 'great', 'neutral', 'good', 'peak', 'good', 'great',
    ]);
    expect(model.dots.at(-1).latest).toBe(true);
  });

  it('не перекрашивает отрицательный факт в успех и не выдумывает период без delta14', () => {
    const CascadeCard = loadCascadeCard();
    const model = CascadeCard.buildInsightsCascadeV4Model({
      events: [{ type: 'meal', label: 'Поздний приём', weight: -0.6 }],
      dailyContribution: -0.35,
      crsTrend: 'down',
      daysAtPeak: 0,
      message: { short: 'Сегодня ритм сбился.' },
    }, {
      state: 'ACCELERATING',
      current: 0.3,
      ceiling: 1,
      delta14: null,
    });

    expect(model.stateLabel).toBe('Набираю');
    expect(model.directionLabel).toBe('снижается');
    expect(model.contributionText).toBe('-0,3');
    expect(model.contributionTone).toBe('negative');
    expect(model.streakText).toBe('Сегодня ритм сбился.');
    expect(model.delta14Text).toBeNull();
    expect(model.dots[0].tone).toBe('bad');
  });

  it('подключает новый вид только к v4-пути, legacy остаётся на прежней карточке', () => {
    const calls = [...DASHBOARD_SOURCE.matchAll(/h\(CascadeInsightsSlot, \{([\s\S]*?)\}\)/g)]
      .map((match) => match[1]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('v4: true');
    expect(calls[1]).not.toContain('v4: true');
    expect(CASCADE_SOURCE).toContain('if (props.v4)');
    expect(CASCADE_SOURCE).toContain('buildInsightsCascadeV4Model(cascadeState, trend)');
  });
});

describe('Инсайты v4 · геометрия каскада и палитры', () => {
  it('совпадает с live HTML: карточка, шапка, шкала, засечки и подписи', () => {
    expect(rule('.insights-v4 .heys-score-insights-card--v4')).toMatch(/padding:\s*16px/);
    expect(rule('.insights-v4 .heys-score-insights-card--v4')).toMatch(/border-radius:\s*20px/);
    expect(rule('.heys-score-insights-v4__head')).toMatch(/align-items:\s*baseline/);
    expect(rule('.heys-score-insights-v4__state')).toMatch(/font:\s*700 13px\/1/);
    expect(rule('.heys-score-insights-v4__trend')).toMatch(/gap:\s*6px/);
    expect(rule('.heys-score-insights-v4__trend')).toMatch(/font:\s*700 11\.5px\/1/);

    const scale = rule('.heys-score-insights-v4__scale');
    expect(scale).toMatch(/height:\s*8px/);
    expect(scale).toMatch(/margin-top:\s*14px/);
    expect(scale).toMatch(/border-radius:\s*999px/);
    // Лестница чернил дизайнера (1 сентября): линии стоят на ступенях
    // 8 · 12 · 18 · 22 · 30 и задаются ролью, а не процентом в color-mix.
    // Здесь проверяется роль: литерал вывел бы место из-под охраны — при
    // переводе на роль тест падал бы на самой починке.
    expect(scale).toContain('var(--v4-line');
    expect(rule('.heys-score-insights-v4__scale-fill')).toContain('var(--v4-ok-fill');

    const threshold = rule('.heys-score-insights-v4__threshold');
    expect(threshold).toMatch(/width:\s*2px/);
    expect(threshold).toMatch(/height:\s*14px/);
    expect(threshold).toContain('var(--v4-track');
    expect(rule('.heys-score-insights-v4__threshold.is-maximum')).toContain('var(--v4-act');

    const legend = rule('.heys-score-insights-v4__legend');
    expect(legend).toMatch(/font:\s*600 9\.5px\/1/);
    expect(legend).toMatch(/margin-top:\s*9px/);
    expect(legend).toMatch(/letter-spacing:\s*0\.02em/);
  });

  it('совпадает с live HTML: рассказ, решения, точки, ось и уход в Отчёты', () => {
    const story = rule('.heys-score-insights-v4__story');
    expect(story).toMatch(/margin:\s*12px 0 0/);
    expect(story).toMatch(/font:\s*500 11\.5px\/1\.5/);

    const today = rule('.heys-score-insights-v4__today');
    expect(today).toMatch(/margin-top:\s*18px/);
    expect(today).toMatch(/padding-top:\s*16px/);
    expect(today).toContain('var(--v4-line');
    expect(rule('.heys-score-insights-v4__contribution')).toMatch(/font:\s*700 11\.5px\/1/);

    const dots = rule('.heys-score-insights-v4__dots');
    expect(dots).toMatch(/gap:\s*7px/);
    expect(dots).toMatch(/margin-top:\s*14px/);
    expect(dots).toMatch(/height:\s*16px/);
    expect(rule('.heys-score-insights-v4__axis')).toMatch(/font:\s*500 10\.5px\/1/);
    expect(rule('.heys-score-insights-v4__axis')).toMatch(/margin-top:\s*11px/);

    const reports = rule('.heys-score-insights-v4__reports-link');
    expect(reports).toMatch(/margin-top:\s*16px/);
    expect(reports).toMatch(/padding:\s*14px 0 0/);
    expect(reports).toMatch(/font:\s*600 12px\/1/);
    expect(reports).toContain('var(--v4-line');
  });

  it('использует четыре palette-sensitive роли вместо песочных литералов', () => {
    expect((PALETTES.match(/--v4-ok-fill:/g) || [])).toHaveLength(4);
    expect((PALETTES.match(/--v4-ok-text:/g) || [])).toHaveLength(4);
    expect((PALETTES.match(/--v4-act:/g) || [])).toHaveLength(4);
    expect((PALETTES.match(/--v4-act-text:/g) || [])).toHaveLength(4);

    const cascadeCss = CSS.slice(CSS.indexOf('/* Каскад дня —'));
    expect(cascadeCss).toContain('var(--v4-ok-fill');
    expect(cascadeCss).toContain('var(--v4-ok-text');
    expect(cascadeCss).toContain('var(--v4-act');
    expect(cascadeCss).toContain('var(--v4-act-text');
    expect(cascadeCss).not.toContain('--v4-sand-act');
  });
});
