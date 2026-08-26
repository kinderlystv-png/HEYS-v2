import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');
const CYCLE_UI_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_cycle_ui_v1.js'), 'utf8');
const PICKERS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_pickers.js'), 'utf8');
const PROFILE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_user_tab_impl_v1.js'), 'utf8');
const CARD_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_cycle_card_v1.js'), 'utf8');
const CSS_SRC = fs.readFileSync(path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'), 'utf8');
const SPARK_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_sparklines_v1.js'), 'utf8');
const STATS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');

describe('cycle v4 · check-in step 5 inline', () => {
  it('cycle lives in morningRest, not separate registerStep flow in stack', () => {
    expect(STEPS_SRC).toContain('renderMorningRestCycleRow');
    expect(STEPS_SRC).toContain('mc-rest-cycle-week-card');
    expect(STEPS_SRC).toContain("'aria-label': 'Отметить особые дни'");
    expect(STEPS_SRC).toContain("role: 'radiogroup'");
    expect(STEPS_SRC).toContain("'aria-label': 'Какой день'");
    expect(STEPS_SRC).toContain('Замеры отложены');
    expect(STEPS_SRC).toContain('HEYS.CycleUI.pushCycleUndo');
  });

  it('week card exposes Верно / Закончились / Не идут', () => {
    expect(STEPS_SRC).toContain("'Верно'");
    expect(STEPS_SRC).toContain("'Закончились'");
    expect(STEPS_SRC).toContain("'Не идут'");
    expect(STEPS_SRC).toContain('Особые дни сняты');
    expect(STEPS_SRC).toContain('Особые дни закрыты');
  });
});

describe('cycle v4 · helpers', () => {
  it('CycleUI exposes ribbon + undo helpers', () => {
    expect(CYCLE_UI_SRC).toContain('buildCycleRibbonMeta');
    expect(CYCLE_UI_SRC).toContain('computeCycleForecastDates');
    expect(CYCLE_UI_SRC).toContain('pushCycleUndo');
    expect(CYCLE_UI_SRC).toContain('getSuggestedCycleDay');
    expect(CYCLE_UI_SRC).toContain('renderCycleMarkingPanel');
    expect(CYCLE_UI_SRC).toContain('shouldHideCycleForecast');
    expect(CYCLE_UI_SRC).toContain('Другой день');
    expect(CYCLE_UI_SRC).toContain('Это было сегодня');
  });
});

describe('cycle v4 · profile toggle', () => {
  it('profile norms group renders Особый период switch before insulin wave', () => {
    const normsAt = PROFILE_SRC.indexOf("id: 'norms', title: 'Нормы'");
    const insulinAt = PROFILE_SRC.indexOf('Инсулиновая волна', normsAt);
    const cycleAt = PROFILE_SRC.indexOf('profile-v4-cycle-toggle', normsAt);
    expect(cycleAt).toBeGreaterThan(normsAt);
    expect(cycleAt).toBeLessThan(insulinAt);
    expect(PROFILE_SRC).toContain("role: 'switch'");
  });
});

describe('cycle v4 · calendar ribbon + card', () => {
  it('date picker adds ribbon classes and spoken suffix', () => {
    expect(PICKERS_SRC).toContain('buildCycleRibbonMeta');
    expect(PICKERS_SRC).toContain('buildCycleForecastMeta');
    expect(PICKERS_SRC).toContain('weekday:');
    expect(PICKERS_SRC).toContain('CycleDatePickerSheet');
    expect(PICKERS_SRC).toContain('date-picker-forecast-line');
    expect(PICKERS_SRC).toContain('Когда это было');
  });

  it('nutrition cycle card delegates to CycleUI panel', () => {
    expect(CARD_SRC).toContain('renderCycleMarkingPanel');
    expect(CYCLE_UI_SRC).toContain('cycle-card-v4');
    expect(CYCLE_UI_SRC).toContain('Указать день');
    expect(CYCLE_UI_SRC).not.toContain('🌸');
  });
});

describe('cycle v4 · profile disable dialog', () => {
  it('toggle uses v4 dialog instead of window.confirm', () => {
    expect(PROFILE_SRC).toContain('cycle-v4-dialog');
    expect(PROFILE_SRC).toContain('cycleDisableOpen');
    expect(PROFILE_SRC).toContain('Выключить особый период?');
    expect(PROFILE_SRC).not.toMatch(/window\.confirm\([\s\S]*Особый период/);
  });
});

describe('cycle v4 · reports sparkline label', () => {
  it('retention tooltip names exclusion without emoji', () => {
    expect(SPARK_SRC).toContain('в тренд не входит');
    expect(SPARK_SRC).not.toContain('🌸 День');
  });

  it('long reports window gets footnote under weight sparkline', () => {
    expect(STATS_SRC).toContain('reports-v4-weight-cycle-footnote');
    expect(STATS_SRC).toContain('дни особого периода в тренд не входят');
  });
});

describe('cycle v4 · CSS tokens', () => {
  it('check-in cycle row uses role surfaces and 44px chips', () => {
    expect(CSS_SRC).toContain('.mc-rest-cycle-mark-chip');
    expect(CSS_SRC).toContain('min-height: 44px');
    expect(CSS_SRC).toContain('.mc-rest-cycle-week-card');
  });
});
