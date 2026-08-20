import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// До 2026-08-09 норму воды брали в четырёх местах через три разных имени
// (HEYS.utils.calculateWaterGoal, HEYS.Day.getWaterGoal, HEYS.utils.getWaterGoal),
// ни одно из которых не было определено. Optional chaining глушил промах, и
// каждое место жило на своём фолбэке: 2000 мл или «вес × 30». Тест держит
// инвариант «расчёт один» — и по формуле, и по списку call-site.

const WEB_DIR = path.resolve(__dirname, '..');
const WATER_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_water_state.js'), 'utf8');

const originalHEYS = global.HEYS;
const originalWindow = global.window;

function loadWaterState(heysSeed = {}) {
  global.window = global;
  global.HEYS = { ...heysSeed };
  // eslint-disable-next-line no-new-func
  new Function(WATER_SRC)();
  return global.HEYS.dayWaterState;
}

// Сезонная надбавка зависит от текущего месяца — считаем её так же, как модуль,
// иначе тест был бы зелёным только летом.
function expectedSeasonBonus() {
  const month = new Date().getMonth();
  return month >= 5 && month <= 7 ? 300 : 0;
}

afterEach(() => {
  global.HEYS = originalHEYS;
  global.window = originalWindow;
});

describe('computeWaterGoal — формула', () => {
  let water;

  beforeEach(() => {
    water = loadWaterState();
  });

  it('мужчина 90 кг без активности: 30 мл на кг плюс сезон', () => {
    const breakdown = water.computeWaterGoalBreakdown({
      day: {},
      profile: { weight: 90, age: 30, sex: 'male' },
    });
    expect(breakdown.coef).toBe(30);
    expect(breakdown.base).toBe(2700);
    expect(breakdown.stepsBonus).toBe(0);
    expect(breakdown.trainBonus).toBe(0);
    expect(breakdown.seasonBonus).toBe(expectedSeasonBonus());
    expect(breakdown.finalGoal).toBe(Math.round((2700 + expectedSeasonBonus()) / 100) * 100);
  });

  it('женщина считается по 28 мл на кг', () => {
    const breakdown = water.computeWaterGoalBreakdown({
      day: {},
      profile: { weight: 60, age: 30, sex: 'female' },
    });
    expect(breakdown.coef).toBe(28);
    expect(breakdown.base).toBe(1680);
  });

  it('возраст снижает базу: −5 % с 40 лет, −10 % с 60', () => {
    const young = water.computeWaterGoalBreakdown({ day: {}, profile: { weight: 80, age: 30 } });
    const middle = water.computeWaterGoalBreakdown({ day: {}, profile: { weight: 80, age: 45 } });
    const senior = water.computeWaterGoalBreakdown({ day: {}, profile: { weight: 80, age: 65 } });
    expect(young.ageFactor).toBe(1);
    expect(middle.ageFactor).toBe(0.95);
    expect(senior.ageFactor).toBe(0.9);
    expect(middle.base).toBe(Math.round(80 * 30 * 0.95));
    expect(senior.base).toBe(Math.round(80 * 30 * 0.9));
  });

  it('шаги дают по 250 мл за каждые полные 5000', () => {
    const none = water.computeWaterGoalBreakdown({ day: { steps: 4999 }, profile: { weight: 80 } });
    const one = water.computeWaterGoalBreakdown({ day: { steps: 5000 }, profile: { weight: 80 } });
    const two = water.computeWaterGoalBreakdown({ day: { steps: 12000 }, profile: { weight: 80 } });
    expect(none.stepsBonus).toBe(0);
    expect(one.stepsBonus).toBe(250);
    expect(two.stepsBonus).toBe(500);
  });

  it('вес утреннего взвешивания важнее веса из профиля', () => {
    const breakdown = water.computeWaterGoalBreakdown({
      day: { weightMorning: 95 },
      profile: { weight: 80 },
    });
    expect(breakdown.weight).toBe(95);
  });

  it('норма зажата в 1500…5000', () => {
    const tiny = water.computeWaterGoalBreakdown({ day: {}, profile: { weight: 30 } });
    const huge = water.computeWaterGoalBreakdown({ day: { steps: 200000 }, profile: { weight: 200 } });
    expect(tiny.finalGoal).toBe(1500);
    expect(huge.finalGoal).toBe(5000);
  });

  it('без данных не падает и даёт норму для 70 кг', () => {
    expect(water.computeWaterGoal()).toBeGreaterThanOrEqual(1500);
    expect(water.computeWaterGoal({})).toBeGreaterThanOrEqual(1500);
  });
});

describe('computeWaterGoal — тренировки', () => {
  let water;

  beforeEach(() => {
    water = loadWaterState();
  });

  it('карточка воды передаёт калории: значима тренировка дороже 50 ккал', () => {
    const breakdown = water.computeWaterGoalBreakdown({
      day: {},
      profile: { weight: 80 },
      trainingKcals: [400, 50, 0],
    });
    expect(breakdown.trainCount).toBe(1);
    expect(breakdown.trainBonus).toBe(500);
  });

  it('снаружи калорий нет — значимость по длительности от 20 минут', () => {
    const breakdown = water.computeWaterGoalBreakdown({
      day: { trainings: [{ z: [30, 0, 0, 0] }, { z: [5, 0, 0, 0] }, { z: [10, 15, 0, 0] }] },
      profile: { weight: 80 },
    });
    expect(breakdown.trainCount).toBe(2);
    expect(breakdown.trainBonus).toBe(1000);
  });

  it('пустой список тренировок не даёт надбавки', () => {
    const breakdown = water.computeWaterGoalBreakdown({
      day: { trainings: [] },
      profile: { weight: 80 },
    });
    expect(breakdown.trainCount).toBe(0);
  });
});

describe('computeWaterGoal — источник один', () => {
  it('хук и прямой вызов дают одно число на одних данных', () => {
    const water = loadWaterState();
    const day = { weightMorning: 91, steps: 9640, trainings: [{ z: [40, 0, 0, 0] }] };
    const profile = { weight: 80, age: 35, sex: 'male' };
    // Хук передаёт калории тренировок, снаружи их нет. При одной тренировке
    // на 40 минут обе ветки должны сойтись на одном значении.
    const fromOutside = water.computeWaterGoal({ day, profile });
    const asHookWould = water.computeWaterGoal({ day, profile, trainingKcals: [444, 0, 0] });
    expect(fromOutside).toBe(asHookWould);
  });

  it('ни одна из трёх несуществующих функций больше не вызывается в живом коде', () => {
    const liveFiles = [
      'heys_day_diary_section.js',
      'widgets/widget_data.js',
      'heys_gamification_v1.js',
      'heys_day_caloric_balance_v1.js',
    ];
    for (const rel of liveFiles) {
      const src = fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');
      const calls = src
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .filter((line) => /\.(calculateWaterGoal|getWaterGoal)\s*\(/.test(line))
        .filter((line) => !/_getWaterGoal\s*\(/.test(line));
      expect(calls, `${rel} всё ещё зовёт несуществующую функцию`).toEqual([]);
    }
  });

  it('виджет и карточка «День» берут калории тренировок из одного TDEE-слота', () => {
    const water = loadWaterState({
      TDEE: {
        calculate: () => ({ train1k: 444, train2k: 0, train3k: 0 }),
      },
    });
    const day = { weightMorning: 91, steps: 9640, trainings: [{ z: [40, 0, 0, 0] }] };
    const profile = { weight: 80, age: 35, sex: 'male' };
    const fromHook = water.computeWaterGoal({
      day,
      profile,
      trainingKcals: [444, 0, 0],
    });
    const fromWidgetPath = water.computeWaterGoal(
      water.buildWaterGoalParams({ day, profile })
    );
    expect(fromWidgetPath).toBe(fromHook);
  });
});

describe('пересчёт нормы — подписка плитки', () => {
  it('виджет слушает heys:profile-updated и берёт норму через buildWaterGoalParams', () => {
    const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    expect(uiSrc).toContain("addEventListener('heys:profile-updated'");
    const widgetDataSrc = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
    expect(widgetDataSrc).toContain('buildWaterGoalParams');
  });

  it('_getWaterGoal читает день через _getDay, не через несуществующий DayData', () => {
    const widgetDataSrc = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
    const fnStart = widgetDataSrc.indexOf('_getWaterGoal() {');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBlock = widgetDataSrc.slice(fnStart, fnStart + 400);
    expect(fnBlock).toContain('this._getDay()');
    expect(fnBlock).not.toContain('getCurrentDay');
  });
});
