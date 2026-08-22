// Шесть виджетов пакета канваса 22 августа: клетчатка, белок, окно до сна,
// качество еды, ритм приёмов, готовность ко сну.
//
// Контракт home-widgets, строки «клетчатка…», «белок…», «окно до сна…»,
// «качество еды…», «ритм приёмов…», «готовность ко сну…», «новые в каталоге».
//
// Главное правило пакета — второго алгоритма нет нигде: нормы и индексы берутся
// у существующих расчётов. Живьём это не поймать, поэтому проверяем данные
// против дня, собранного руками.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const DATA_SRC = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
const REGISTRY_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_registry_v1.js'), 'utf8');
const VARIANTS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');

const NEW_TYPES = ['fiber', 'protein', 'sleepWindow', 'foodQuality', 'mealRhythm', 'sleepReady'];

function meal(time, items) {
  return { time, items };
}

/** Продукт: граммы плюс сотки нутриентов — как их хранит день. */
function item(grams, per100) {
  return Object.assign({ grams }, per100);
}

const DAY = {
  date: '2025-12-12',
  waterMl: 2400,
  steps: 9000,
  sleepStart: '23:00',
  meals: [
    meal('08:40', [item(200, { name: 'овсянка', kcal100: 350, protein100: 12, fiber100: 6, harm: 1 })]),
    meal('13:05', [item(300, { name: 'курица с рисом', kcal100: 160, protein100: 20, fiber100: 2, harm: 2 })]),
    meal('16:40', [item(100, { name: 'печенье', kcal100: 480, protein100: 6, fiber100: 1, harm: 8 })])
  ]
};

function boot(day = DAY, profile = {}) {
  window.HEYS = {
    Widgets: { emit: () => {}, on: () => {}, off: () => {} },
    utils: { lsGet: (key, fallback) => fallback },
    // Словарь «чем добрать» — тот же, что на «Питании».
    dayDiarySection: {
      getFiberSources: () => ([
        { title: 'Овощи', grams: '5–8 г' },
        { title: 'Бобовые', grams: '8–12 г' },
        { title: 'Цельные злаки', grams: '4–7 г' }
      ])
    }
  };
  // Вредность и ГИ умеет только dayCalculations: в проде именно он и считает.
  window.HEYS.dayCalculations = {
    calculateDayTotals: (d) => {
      const totals = { kcal: 0, prot: 0, fat: 0, carbs: 0, fiber: 0, harm: 0 };
      let grams = 0;
      let harmSum = 0;
      (Array.isArray(d?.meals) ? d.meals : []).forEach((m) => {
        (Array.isArray(m?.items) ? m.items : []).forEach((it) => {
          const g = (Number(it.grams) || 0) / 100;
          grams += Number(it.grams) || 0;
          totals.prot += (Number(it.protein100) || 0) * g;
          totals.fiber += (Number(it.fiber100) || 0) * g;
          harmSum += (Number(it.harm) || 0) * (Number(it.grams) || 0);
        });
      });
      totals.harm = grams ? harmSum / grams : 0;
      return totals;
    }
  };
  eval(DATA_SRC);
  const data = window.HEYS.Widgets.data;
  // День и профиль подставляем напрямую: облако и localStorage тут не нужны.
  data._getDay = () => day;
  data._getDayByDate = () => null;
  data._getProfile = () => Object.assign({ stepsGoal: 10000, waterGoalMl: 2700 }, profile);
  data._getOptimum = () => 2000;
  data._isDemoMode = () => false;
  return data;
}

describe('данные шести виджетов · контракт home-widgets', () => {
  beforeEach(() => {
    delete window.HEYS;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  it('клетчатка: норма 14 г на 1000 ккал бюджета, округление до грамма', () => {
    const data = boot();
    const fiber = data.getFiberWidgetData();
    // Бюджет 2000 ккал → 28 г.
    expect(fiber.norm).toBe(28);
    // 200×6% + 300×2% + 100×1% = 12 + 6 + 1 = 19.
    expect(fiber.fiber).toBe(19);
    expect(fiber.remaining).toBe(9);
  });

  it('клетчатка: подсказка — категории словаря «чем добрать», без граммовок', () => {
    const fiber = boot().getFiberWidgetData();
    // Именно категории, а не продукты: словаря продуктов в коде нет, и заводить
    // второй контракт запретил (решение 22 августа).
    expect(fiber.sources).toEqual(['Овощи', 'Бобовые', 'Цельные злаки']);
    expect(fiber.sources.join(' ')).not.toMatch(/г\b/);
  });

  it('клетчатка: день без приёмов — прочерк, а не ноль', () => {
    const fiber = boot({ date: '2025-12-12', meals: [] }).getFiberWidgetData();
    expect(fiber.hasData).toBe(false);
    expect(fiber.fiber).toBeNull();
  });

  it('белок: норма — та же, что у кольца БЖУ, своей нет', () => {
    const data = boot();
    data.getMacrosData = () => ({ proteinTarget: 140 });
    const protein = data.getProteinWidgetData();
    expect(protein.target).toBe(140);
    // 200×12% + 300×20% + 100×6% = 24 + 60 + 6 = 90.
    expect(protein.protein).toBe(90);
    expect(protein.remaining).toBe(50);
  });

  it('белок: подсказки нет вовсе — словарь «чем добрать» про клетчатку', () => {
    const data = boot();
    data.getMacrosData = () => ({ proteinTarget: 140 });
    // Ни поля с источниками в данных, ни строки в виде «Добрать».
    expect(data.getProteinWidgetData().sources).toBeUndefined();
    const ui = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    const body = ui.slice(ui.indexOf('function ProteinVariantBody'), ui.indexOf('function ProteinWidgetContent'));
    expect(body).not.toContain('widget-v4-hint');
  });

  it('белок: вид «По приёмам» даёт время и граммы каждого приёма', () => {
    const data = boot();
    data.getMacrosData = () => ({ proteinTarget: 140 });
    expect(data.getProteinWidgetData().byMeal).toEqual([
      { time: '08:40', grams: 24 },
      { time: '13:05', grams: 60 },
      { time: '16:40', grams: 6 }
    ]);
  });

  it('окно до сна: считается от отбоя чек-ина', () => {
    const window_ = boot().getSleepWindowData();
    // Отбой 23:00, последний приём 16:40 → 6:20.
    expect(window_.bedtimeKnown).toBe(true);
    expect(window_.minutes).toBe(380);
    expect(window_.state).toBe('good');
    expect(window_.word).toBe('чисто');
  });

  it('окно до сна: без отбоя считает от 23:00 и говорит об этом', () => {
    const day = Object.assign({}, DAY);
    delete day.sleepStart;
    const window_ = boot(day).getSleepWindowData();
    expect(window_.bedtimeKnown).toBe(false);
    expect(window_.bedtime).toBe(23 * 60);
  });

  it('окно до сна: красным — только когда ел меньше чем за час до отбоя', () => {
    const late = boot(Object.assign({}, DAY, {
      meals: [meal('22:30', [item(100, { name: 'торт', kcal100: 400, harm: 9 })])]
    })).getSleepWindowData();
    expect(late.state).toBe('bad');
    expect(late.word).toBe('ел перед сном');
  });

  it('окно до сна: после отбоя показывает итог, а не отрицательное время', () => {
    const after = boot(Object.assign({}, DAY, {
      sleepStart: '23:00',
      meals: [meal('23:40', [item(100, { name: 'кефир', kcal100: 60, harm: 1 })])]
    })).getSleepWindowData();
    expect(after.minutes).toBe(0);
  });

  it('окно до сна: нет приёмов — прочерк и «не ел»', () => {
    const empty = boot({ date: '2025-12-12', meals: [], sleepStart: '23:00' }).getSleepWindowData();
    expect(empty.hasData).toBe(false);
    expect(empty.word).toBe('не ел');
  });

  it('качество еды: индекс — та же вредность, порог шалфея тот же (5 из 10)', () => {
    const quality = boot().getFoodQualityData();
    // Вредность взвешена по граммам: (200×1 + 300×2 + 100×8) / 600 = 2,67.
    expect(quality.score).toBeCloseTo(7.3, 1);
    expect(quality.delta).toBeCloseTo(2.7, 1);
    // «Что снизило» называет самый вредный вклад дня.
    expect(quality.reason).toBe('печенье');

    // Шалфей от 5 из 10, то есть вредность ≤ 5 — порог карточки «Питания»,
    // своего у виджета нет (решение 22 августа, прежний порог 8 отменён).
    const ui = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    expect(ui).toContain("const state = score >= 5 ? 'good' : 'neutral';");
  });

  it('ритм приёмов: интервалы считаются между соседними приёмами', () => {
    const rhythm = boot().getMealRhythmData();
    expect(rhythm.count).toBe(3);
    expect(rhythm.intervals.map((i) => i.minutes)).toEqual([265, 215]);
    expect(rhythm.avgMinutes).toBe(240);
  });

  it('ритм приёмов: один приём — интервалов нет, лента работает', () => {
    const rhythm = boot(Object.assign({}, DAY, {
      meals: [meal('09:00', [item(100, { name: 'кофе', kcal100: 10 })])]
    })).getMealRhythmData();
    expect(rhythm.hasData).toBe(true);
    expect(rhythm.intervals).toEqual([]);
    expect(rhythm.avgMinutes).toBeNull();
  });

  it('готовность ко сну: пороги берутся у своих виджетов', () => {
    const ready = boot().getSleepReadyData();
    const byKey = Object.fromEntries(ready.items.map((i) => [i.key, i]));
    // Вода 2400 из 2700 — это 89 %, порог 90 % не взят.
    expect(byKey.water.done).toBe(false);
    // Окно 6:20 ≥ 3 ч — взято.
    expect(byKey.food.done).toBe(true);
    // Шаги 9000 из 10000 — цель не закрыта.
    expect(byKey.steps.done).toBe(false);
    expect(ready.total).toBe(3);
    expect(ready.done).toBe(1);
  });

  it('готовность ко сну: пункт без данных выпадает из счётчика', () => {
    // Шагомер не отдал данные — пункт «Шаги» выпадает: «1 из 2», а не ноль в счёт.
    const day = Object.assign({}, DAY);
    delete day.steps;
    const ready = boot(day).getSleepReadyData();
    expect(ready.total).toBe(2);
    expect(ready.items.find((i) => i.key === 'steps').hasData).toBe(false);
  });
});

describe('реестр и каталог видов шести виджетов', () => {
  function registry() {
    const win = { HEYS: {} };
    new Function('window', 'globalThis', 'self', REGISTRY_SRC).call(win, win, win, win);
    return win.HEYS.Widgets.registry;
  }

  function variants() {
    delete window.HEYS;
    window.HEYS = { Widgets: { emit: () => {}, on: () => {}, off: () => {} } };
    eval(VARIANTS_SRC);
    return window.HEYS.Widgets.VariantsV4;
  }

  it('все шесть идут в каталог сразу, без строки «скоро»', () => {
    const reg = registry();
    NEW_TYPES.forEach((type) => {
      const def = reg.getType(type);
      expect(def, type).toBeTruthy();
      expect(def.comingSoon, type).toBeUndefined();
      expect(def.retired, type).toBeUndefined();
    });
    const available = reg.getAvailableTypes().map((t) => t.type);
    NEW_TYPES.forEach((type) => expect(available, type).toContain(type));
  });

  it('в дефолтный набор не входит ни один', () => {
    const core = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
    const block = core.slice(core.indexOf('const DEFAULT_LAYOUT = ['), core.indexOf('\n  ];', core.indexOf('const DEFAULT_LAYOUT = [')));
    NEW_TYPES.forEach((type) => {
      expect(block.includes(`type: '${type}'`), type).toBe(false);
    });
  });

  it('виды и дефолты — по кадрам 37–51', () => {
    const V4 = variants();
    const expected = {
      fiber: [['now', '1x1'], ['add', '2x1'], ['week', '2x2']],
      protein: [['now', '1x1'], ['add', '2x1'], ['by_meal', '2x2']],
      sleepWindow: [['now', '1x1'], ['evening', '2x1']],
      foodQuality: [['now', '1x1'], ['why', '2x1'], ['week', '2x2']],
      mealRhythm: [['day_line', '2x1'], ['intervals', '2x2']],
      sleepReady: [['checklist', '2x1'], ['review', '2x2']]
    };
    Object.entries(expected).forEach(([type, list]) => {
      expect(V4.getCatalog(type).map((v) => [v.id, v.size]), type).toEqual(list);
      // Дефолт помечен флагом, а не порядком карточек.
      expect(V4.getDefaultVariant(type).id, type).toBe(list[0][0]);
    });
  });

  it('размер вида совпадает с размером, объявленным в реестре', () => {
    const reg = registry();
    const V4 = variants();
    NEW_TYPES.forEach((type) => {
      const def = reg.getType(type);
      const sizes = V4.getCatalog(type).map((v) => v.size);
      sizes.forEach((size) => expect(def.availableSizes, `${type}/${size}`).toContain(size));
      expect(def.defaultSize, type).toBe(V4.getDefaultVariant(type).size);
    });
  });
});
describe('шаги · оба вида — тренды (переписаны 22 августа)', () => {
  beforeEach(() => {
    delete window.HEYS;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  /** День со steps на N дней назад. */
  function stepsHistory(map) {
    return (iso) => (map[iso] ? { date: iso, steps: map[iso] } : null);
  }

  function isoDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  it('ряды строятся на 7 и 30 дней, среднее считается только по дням с записями', () => {
    const history = {};
    history[isoDaysAgo(1)] = 8000;
    history[isoDaysAgo(2)] = 10000;
    const data = boot({ date: isoDaysAgo(0), steps: 12000, meals: [] });
    data._getDayByDate = stepsHistory(history);

    const steps = data.getStepsData();
    expect(steps.week).toHaveLength(7);
    expect(steps.month).toHaveLength(30);
    // Три дня с записями: (12000 + 8000 + 10000) / 3 = 10000.
    expect(steps.daysWithData).toBe(3);
    expect(steps.avgWeek).toBe(10000);
    expect(steps.avgMonth).toBe(10000);
  });

  it('день без записи в ряд не попадает — нулём не рисуется', () => {
    const data = boot({ date: isoDaysAgo(0), steps: 9000, meals: [] });
    data._getDayByDate = () => null;
    const steps = data.getStepsData();
    const empty = steps.week.filter((item) => !item.hasData);
    expect(empty).toHaveLength(6);
    empty.forEach((item) => expect(item.value).toBeNull());
  });

  it('сегодня до чек-ина в ряду отсутствует, а не стоит нулём', () => {
    const data = boot({ date: isoDaysAgo(0), meals: [] });
    data._getDayByDate = stepsHistory({ [isoDaysAgo(1)]: 8000 });
    const steps = data.getStepsData();
    const today = steps.week[steps.week.length - 1];
    expect(today.isToday).toBe(true);
    expect(today.hasData).toBe(false);
    expect(today.value).toBeNull();
  });

  it('дней с шагами меньше двух — тренда ещё нет', () => {
    const data = boot({ date: isoDaysAgo(0), steps: 9000, meals: [] });
    data._getDayByDate = () => null;
    expect(data.getStepsData().daysWithData).toBe(1);
  });

  it('вида «сейчас» в каталоге больше нет, дефолт — «Неделя» 2×1', () => {
    delete window.HEYS;
    window.HEYS = { Widgets: { emit: () => {}, on: () => {}, off: () => {} } };
    eval(VARIANTS_SRC);
    const V4 = window.HEYS.Widgets.VariantsV4;
    expect(V4.getCatalog('steps').map((v) => [v.id, v.size])).toEqual([
      ['week', '2x1'],
      ['month', '2x2']
    ]);
    expect(V4.getDefaultVariant('steps').id).toBe('week');
    // «Как сейчас» и «До цели» сняты: числа «сейчас» у шагов не существует.
    expect(V4.getCatalog('steps').some((v) => v.id === 'mini' || v.id === 'to_goal')).toBe(false);
  });
});
