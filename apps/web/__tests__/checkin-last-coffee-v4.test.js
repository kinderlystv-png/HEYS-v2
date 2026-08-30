// Блок «Последний кофе» пятого шага чек-ина и пункт кофеина в «Готовности ко
// сну». Канвас checkin-morning.v4.dc.html, строки «последний кофе» и «кофе не
// обязателен»; кадр «Чек-ин · остальное».
//
// Живьём эти стыки не собрать: чтобы увидеть «2 из 3» вместо «2 из 4», нужен
// день с ответами на воду и шаги и без ответа про кофе, а чтобы увидеть перенос
// через полночь — отбой в час ночи. Поэтому симуляция.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const STEPS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_steps_v1.js'), 'utf8');
const DATA_SRC = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
const VARIANTS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
const UI_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

const TODAY = '2026-08-30';

/** Шаги чек-ина с подставленным localStorage: день лежит в карте, а не в облаке. */
function loadSteps(dayMap = {}) {
  const configs = {};
  const store = {};
  Object.entries(dayMap).forEach(([dateKey, data]) => {
    store[`heys_dayv2_${dateKey}`] = data;
  });

  window.React = React;
  window.HEYS = {
    StepModal: {
      WheelPicker: () => null,
      TimePicker: () => null,
      registerStep: (id, config) => { configs[id] = config; },
      utils: {
        lsGet: (key, fallback) => (
          Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback
        ),
        lsSet: (key, value) => { store[key] = value; },
        getTodayKey: () => TODAY
      }
    }
  };

  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return { configs, store, Steps: window.HEYS.Steps };
}

/** Разметка шага «Остальное» как её увидит человек. */
function renderStep(configs, data) {
  const Step = configs.morningRest.component;
  return renderToStaticMarkup(React.createElement(Step, {
    data: Object.assign({ _dateKey: TODAY, coldType: 'none', selected: [] }, data),
    onChange: () => {},
    context: { dateKey: TODAY }
  }));
}

/** Слой данных виджетов поверх готового дня. */
function loadWidgetData(day, profile = {}) {
  eval(DATA_SRC);
  const data = window.HEYS.Widgets.data;
  data._getDay = () => day;
  data._getDayByDate = () => null;
  data._getProfile = () => Object.assign({ stepsGoal: 10000, waterGoalMl: 2000 }, profile);
  data._isDemoMode = () => false;
  return data;
}

const FULL_DAY = {
  date: TODAY,
  waterMl: 2000,
  steps: 10000,
  sleepStart: '23:00',
  meals: [{ time: '18:00', items: [{ grams: 100, name: 'ужин' }] }]
};

describe('чек-ин · блок «Последний кофе»', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
  });

  it('разбор ответа: границы берутся с самой пилюли, «не пил» — это null', () => {
    const { Steps } = loadSteps();
    const at = (choice, time) => Steps.getLastCoffeeMinutes({ lastCoffee: { choice, time } });
    expect(at('before12')).toBe(12 * 60);
    expect(at('after17')).toBe(17 * 60);
    expect(at('exact', '14:30')).toBe(14 * 60 + 30);
    // «не пил» — ответ (null), «не отвечал» — его отсутствие (undefined).
    expect(at('none')).toBeNull();
    expect(Steps.getLastCoffeeMinutes({})).toBeUndefined();
    expect(Steps.getLastCoffeeMinutes(null)).toBeUndefined();
    // Своё время без времени — не ответ, а недоделанный ответ.
    expect(at('exact', null)).toBeUndefined();
  });

  it('ответ уезжает в день и читается обратно, снятие — удаляет поле', () => {
    const { configs, store } = loadSteps({ [TODAY]: { date: TODAY } });
    const rest = configs.morningRest;

    rest.save({ _dateKey: TODAY, coffeeChoice: 'exact', coffeeTime: '14:30' }, { dateKey: TODAY });
    const saved = store[`heys_dayv2_${TODAY}`];
    expect(saved.lastCoffee.choice).toBe('exact');
    expect(saved.lastCoffee.time).toBe('14:30');

    const back = rest.getInitialData({ dateKey: TODAY });
    expect(back.coffeeChoice).toBe('exact');
    expect(back.coffeeTime).toBe('14:30');

    rest.save({ _dateKey: TODAY, coffeeChoice: null }, { dateKey: TODAY });
    expect(store[`heys_dayv2_${TODAY}`].lastCoffee).toBeUndefined();
    expect(rest.getInitialData({ dateKey: TODAY }).coffeeChoice).toBeNull();
  });

  it('мусорный ответ в дне не становится выбранной пилюлей', () => {
    const { configs } = loadSteps({ [TODAY]: { date: TODAY, lastCoffee: { choice: 'вчера' } } });
    expect(configs.morningRest.getInitialData({ dateKey: TODAY }).coffeeChoice).toBeNull();
  });

  it('карточка рисуется первой из редких: до добавок и рутины', () => {
    const { configs } = loadSteps({ [TODAY]: { date: TODAY } });
    const html = renderStep(configs, { coffeeChoice: 'exact', coffeeTime: '14:30' });
    expect(html).toContain('mc-rest-card--coffee');
    expect(html).toContain('Последний кофе');
    expect(html).toContain('до отбоя 8 ч');
    ['до 12:00', '14:30', 'после 17', 'не пил'].forEach((label) => expect(html).toContain(label));
    // Выбранная пилюля одна, и это своё время.
    expect(html.match(/mc-pill--choice is-on/g)).toHaveLength(1);
    expect(html.indexOf('mc-rest-card--coffee')).toBeLessThan(html.indexOf('mc-rest-card--routine'));
  });

  it('без ответа выбранной пилюли нет, а средняя зовётся «своё время»', () => {
    const { configs } = loadSteps({ [TODAY]: { date: TODAY } });
    const html = renderStep(configs, {});
    expect(html).toContain('своё время');
    expect(html).not.toContain('mc-pill--choice is-on');
  });

  it('лист своего времени даёт стрелку назад — иначе из него не выйти', () => {
    const { configs } = loadSteps();
    const rest = configs.morningRest;
    expect(rest.showHeaderBack({ coffeeOpen: true })).toBe(true);
    expect(rest.applyHeaderBack({ coffeeOpen: true }).coffeeOpen).toBe(false);
  });
});

describe('«Готовность ко сну» · пункт кофеина', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
  });

  function ready(lastCoffee, day = FULL_DAY) {
    loadSteps();
    const data = loadWidgetData(Object.assign({}, day, lastCoffee ? { lastCoffee } : {}));
    const state = data.getSleepReadyData();
    return { state, caffeine: state.items.find((row) => row.key === 'caffeine') };
  }

  it('не ответил — пункт «нет данных», и счётчик читается «3 из 3», а не «3 из 4»', () => {
    const { state, caffeine } = ready(null);
    expect(caffeine.hasData).toBe(false);
    expect(state.total).toBe(3);
    expect(state.done).toBe(3);
  });

  it('ответил — пункт входит в счётчик четвёртым', () => {
    const { state } = ready({ choice: 'none' });
    expect(state.total).toBe(4);
    expect(state.done).toBe(4);
  });

  it('«не пил» закрывает пункт без всякого порога', () => {
    const { caffeine } = ready({ choice: 'none' });
    expect(caffeine.done).toBe(true);
    expect(caffeine.value).toBeNull();
  });

  it('порог — восемь часов до отбоя: «до 12:00» закрыт, «после 17» открыт', () => {
    expect(ready({ choice: 'before12' }).caffeine.done).toBe(true);
    expect(ready({ choice: 'after17' }).caffeine.done).toBe(false);
  });

  it('своё время режется ровно по восьми часам', () => {
    // Отбой 23:00: 15:00 — ровно восемь часов, закрыт; 15:01 — уже нет.
    expect(ready({ choice: 'exact', time: '15:00' }).caffeine.done).toBe(true);
    expect(ready({ choice: 'exact', time: '15:01' }).caffeine.done).toBe(false);
  });

  it('отбой после полуночи не делает утренний кофе поздним', () => {
    const night = Object.assign({}, FULL_DAY, { sleepStart: '01:00' });
    expect(ready({ choice: 'exact', time: '08:00' }, night).caffeine.done).toBe(true);
    expect(ready({ choice: 'after17' }, night).caffeine.done).toBe(true);
    expect(ready({ choice: 'exact', time: '18:00' }, night).caffeine.done).toBe(false);
  });

  it('отбоя в дне нет — считаем от 23:00, как и «Еда до сна»', () => {
    const noBed = Object.assign({}, FULL_DAY);
    delete noBed.sleepStart;
    expect(ready({ choice: 'before12' }, noBed).caffeine.done).toBe(true);
    expect(ready({ choice: 'after17' }, noBed).caffeine.done).toBe(false);
  });
});

describe('разбор «Готовности ко сну» · кофеин перестал ждать данных', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
  });

  it('пункт разбора считает тот же ответ и тот же порог, что плитка', () => {
    const { Steps } = loadSteps();
    // Разбор берёт разбор ответа у шага — второго чтения поля нет.
    expect(VARIANTS_SRC).toContain('HEYS.Steps?.getLastCoffeeMinutes?.(day)');
    expect(VARIANTS_SRC).toContain('BD_CAFFEINE_LEAD_MIN = 8 * 60');
    expect(Steps.getLastCoffeeMinutes({ lastCoffee: { choice: 'before12' } })).toBe(720);
    // Заглушки «пока негде отметить» в разборе больше нет.
    expect(VARIANTS_SRC).not.toContain('пока его негде отметить');
  });

  it('плитка называет кофеин временем, а не тысячами', () => {
    const body = UI_SRC.slice(
      UI_SRC.indexOf('function sleepReadyItemText'),
      UI_SRC.indexOf('function SleepReadyVariantBody')
    );
    expect(body).toContain("item.key === 'caffeine'");
    expect(body).toContain("'не пил'");
    // Ветка кофеина стоит до общей — иначе минуты ушли бы в формат тысяч.
    expect(body.indexOf("item.key === 'caffeine'"))
      .toBeLessThan(body.indexOf('formatRuThousands'));
  });
});
