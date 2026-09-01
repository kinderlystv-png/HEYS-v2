import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const DAILY_CSS = read('../styles/modules/500-pwa-and-offline.css');
const BASE_CSS = read('../styles/modules/000-base-and-gamification.css');
const REPORTS_CSS = read('../styles/modules/733-ui-v4-reports.css');
const STATS_UI = read('../heys_day_stats_v1.js');
const CYCLE_UI = read('../heys_cycle_ui_v1.js');

const rule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || '';
};

describe('cycle v4 · data ink ladder', () => {
  it.each([
    ['.mc-rest-cycle-none-btn', DAILY_CSS],
    ['.mc-rest-cycle-ended-note', DAILY_CSS],
    ['.cycle-card-v4__date-confirm-sub', DAILY_CSS],
    ['.cycle-card-v4__insight-text', DAILY_CSS],
    ['.cycle-date-picker-sheet__live', DAILY_CSS],
    ['.date-picker-forecast-line', DAILY_CSS],
    ['.date-picker--v4 .date-picker-sub--relative', BASE_CSS],
    ['.date-picker-sheet .date-picker-legend', BASE_CSS],
    ['.reports-v4-dynamics-card__label', REPORTS_CSS],
    ['.reports-v4-dynamics-card__legend-item', REPORTS_CSS],
    ['.reports-v4-dynamics-card__hint', REPORTS_CSS],
  ])('%s uses the 56%% data role', (selector, css) => {
    expect(rule(css, selector)).toContain('var(--v4-ink-data');
  });

  it('keeps the collapsed cycle hint compact', () => {
    const compactHint = rule(DAILY_CSS, '.mc-rest-row--cycle .mc-rest-card-hint');
    expect(compactHint).toContain('margin-top: 3px');
    expect(compactHint).toContain('font: 500 11px/1.4');
  });

  it('keeps the calorie period and chart explanation at the canvas sizes', () => {
    const cyclePeriod = rule(
      REPORTS_CSS,
      '.reports-v4-dynamics-card--cycle .reports-v4-dynamics-card__period',
    );
    const chartHint = rule(
      REPORTS_CSS,
      '.reports-v4-dynamics-card--cycle .reports-v4-dynamics-card__hint',
    );
    expect(cyclePeriod).toContain('font-size: 10px');
    expect(chartHint).toContain('margin-top: 7px');
    expect(chartHint).toContain('font-size: 10px');
    expect(chartHint).toContain('font-weight: 600');
    expect(chartHint).toContain('line-height: 1');
    expect(STATS_UI).toContain('reports-v4-dynamics-card--cycle');
    expect(STATS_UI).toContain('isCycleTrackingEnabled');
    expect(STATS_UI).toContain('ступенька — надбавка второй половины, зоны здесь нет');
    expect(STATS_UI).toContain('Столбик вверх — недобор, вниз — перебор. Пунктир это план.');
  });
});

describe('cycle v4 · unresolved day 29', () => {
  it('explains why base norms remain active until the answer', () => {
    expect(CYCLE_UI).toContain(
      'С последней отметки прошло 28 дней. Пока не ответите, нормы считаются базовыми.',
    );
    expect(CYCLE_UI).not.toContain(
      'Если да — отметьте первый день. Если нет — счёт останется без новой недели.',
    );
  });
});
