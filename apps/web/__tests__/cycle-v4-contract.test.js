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

const BASE_CSS_SRC = fs
  .readFileSync(path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css'), 'utf8')
  .replace(/\r\n/g, '\n');

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

describe('cycle v4 · step height and week scroll', () => {
  it('week period moves cycle row to top and defers measurements', () => {
    expect(STEPS_SRC).toContain('const cycleWeekTop = !!(cycleOnWeek || cycleSuggested)');
    expect(STEPS_SRC).toContain("cycleWeekTop ? ' mc-rest-step--cycle-week' : ''");
    expect(STEPS_SRC).toContain('cycleWeekTop ? cycleRow : coldCard');
    expect(STEPS_SRC).toContain('const measurementsDeferred = cycleWeekTop');
    expect(STEPS_SRC).toContain('mc-rest-cycle-week-card');
    expect(STEPS_SRC).toContain('Замеры отложены');
  });

  it('week step reserves ~68px scroll slack via padding-bottom', () => {
    expect(CSS_SRC).toContain('.mc-rest-step--cycle-week');
    expect(CSS_SRC).toMatch(/\.mc-rest-step--cycle-week[\s\S]*padding-bottom:\s*70px/);
  });
});

describe('cycle v4 · ribbon contrast', () => {
  it('period ribbon uses palette-aware accent var(--v4-act)', () => {
    const periodRule = BASE_CSS_SRC.match(
      /\.date-picker-sheet \.date-picker-day\.cycle-ribbon--period::before,\n[\s\S]*?background: [^;]+;/
    );
    expect(periodRule?.[0]).toContain('background: var(--v4-act');
  });
});

describe('cycle v4 · norm pill on nutrition', () => {
  it('renders Нужно съесть row with +N% pill when multiplier > 1', () => {
    expect(CYCLE_UI_SRC).toContain('renderCycleNormRows');
    expect(CYCLE_UI_SRC).toContain('cycle-card-v4__norm-pill');
    expect(CYCLE_UI_SRC).toContain('Нужно съесть');
    expect(CYCLE_UI_SRC).toContain('cycleKcalMultiplier');
    expect(CSS_SRC).toContain('.cycle-card-v4__norm-pill');
    expect(CSS_SRC).toMatch(/\.cycle-card-v4__norm-value[\s\S]*gap:\s*7px/);
  });

  it('nutrition tab passes eaten and budget into cycle block', () => {
    const nutritionSrc = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
    expect(nutritionSrc).toContain('budgetKcal: displayOptimum');
    expect(nutritionSrc).toContain('cycleKcalMultiplier');
  });
});

describe('cycle v4 · calorie chart reports styling', () => {
  it('uses stepped goal line and reports-v4 classes in sparkline', () => {
    expect(SPARK_SRC).toContain('steppedPath');
    expect(SPARK_SRC).toContain('reportsV4 ? steppedPath(points, \'targetY\')');
    expect(SPARK_SRC).toContain('sparkline-goal--reports-v4');
    expect(SPARK_SRC).toContain('sparkline-line--reports-v4');
  });

  it('reports tab labels chart Съедено и норма with legend', () => {
    expect(STATS_SRC).toContain('Съедено и норма');
    expect(STATS_SRC).toContain('reports-v4-dynamics-card__legend');
    expect(STATS_SRC).toContain('reportsV4: useReportsV4');
  });
});

describe('cycle v4 · on-screen words', () => {
  it('v4 cycle UI and legacy registerStep avoid 🌸', () => {
    expect(CYCLE_UI_SRC).not.toContain('🌸');
    expect(STEPS_SRC).toContain("title: 'Особый период'");
    expect(STEPS_SRC).toContain("icon: ''");
    expect(STEPS_SRC).not.toMatch(/registerStep\('cycle'[\s\S]*icon:\s*'🌸'/);
    expect(CYCLE_UI_SRC).toContain('Особый период');
    expect(CYCLE_UI_SRC).toMatch(/особые дни/i);
    expect(CYCLE_UI_SRC).toContain("'начало'");
    expect(CYCLE_UI_SRC).toContain("'середина'");
    expect(CYCLE_UI_SRC).toContain("'конец'");
  });
});
