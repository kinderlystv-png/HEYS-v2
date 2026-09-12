// Шаг «Вес» утреннего чек-ина: кадры «Чек-ин · вес» и «Чек-ин · расчётный вес»
// канваса checkin-morning.v4.dc.html.
//
// Живьём эти состояния не собрать: плашка серии требует недели закрытых дней,
// строка «−0,8 кг за неделю» — взвешивания ровно семидневной давности, а список
// расчётного веса — трёх взвешиваний подряд. Поэтому симуляция.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const STEPS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_steps_v1.js'), 'utf8');
const PWA_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/500-pwa-and-offline.css'),
  'utf8',
);

const TODAY = '2026-08-16';

/**
 * Шаги чек-ина с подставленным хранилищем. `streakSource` выбирает, что из
 * источников серии вообще существует: 'canonical' — общий помощник
 * HEYS.utils.safeGetStreak, 'metrics' — только метрики календаря, 'daytab' —
 * только замыкание вкладки Дня (оно в цепочке чек-ина участвовать не должно).
 */
function loadSteps({ days = {}, profile = {}, streak = 0, streakSource = 'canonical' } = {}) {
  const configs = {};
  const store = {};
  Object.entries(days).forEach(([dateKey, data]) => {
    store[`heys_dayv2_${dateKey}`] = data;
  });
  store.heys_profile = { firstName: 'Александра', weight: 74.2, ...profile };

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
        getTodayKey: () => TODAY,
      },
    },
    utils: streakSource === 'canonical' ? { safeGetStreak: () => streak } : {},
    dayCalendarMetrics: streakSource === 'metrics' ? { getCurrentStreak: () => streak } : undefined,
    Day: streakSource === 'daytab' ? { getStreak: () => streak } : {},
  };

  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return { configs, store };
}

function renderWeight(configs, data = {}) {
  const Step = configs.weight.component;
  return renderToStaticMarkup(React.createElement(Step, {
    data,
    onChange: () => {},
    context: { dateKey: TODAY, dailyCheckin: true },
  }));
}

/** Дни кадра: взвешивания 13–15 августа и «неделю назад» 74,2 для динамики. */
const WEIGHT_DAYS = {
  '2026-08-15': { date: '2026-08-15', weightMorning: 73.4 },
  '2026-08-14': { date: '2026-08-14', weightMorning: 73.5 },
  '2026-08-13': { date: '2026-08-13', weightMorning: 73.9 },
  '2026-08-09': { date: '2026-08-09', weightMorning: 74.2 },
};

describe('чек-ин · шаг «Вес» против кадров v4', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
  });

  it('плашка серии живёт без вкладки Дня: число берётся каноническим путём', () => {
    // Кадр «Чек-ин · вес» рисует «5 дней подряд — отметьте сегодня…». Чек-ин
    // открывается слоем поверх любой вкладки, и HEYS.Day.getStreak (замыкание
    // вкладки Дня) в этот момент обычно не существует.
    const { configs } = loadSteps({ days: WEIGHT_DAYS, streak: 5 });
    const html = renderWeight(configs, { weightKg: 73, weightG: 4 });
    expect(html).toContain('дней подряд — отметьте сегодня, чтобы продолжить серию');
    expect(html).toContain('>5<');
  });

  it('без общего помощника число берётся у метрик календаря, а не у вкладки Дня', () => {
    // Порядок тот же, что у оболочки шагов: safeGetStreak → dayCalendarMetrics.
    // Замыкание вкладки Дня в цепочке не участвует — оно живёт только пока
    // вкладка смонтирована, и раньше давало ноль на любом другом экране.
    const { configs } = loadSteps({
      days: WEIGHT_DAYS, streak: 6, streakSource: 'metrics',
    });
    const html = renderWeight(configs, { weightKg: 73, weightG: 4 });
    expect(html).toContain('дней подряд');
    expect(html).toContain('>6<');
  });

  it('замыкание вкладки Дня больше не единственный источник серии', () => {
    // Ровно тот дефект, который сводили: HEYS.Day.getStreak есть, общего
    // помощника и метрик нет — плашка не должна держаться на замыкании.
    const { configs } = loadSteps({
      days: WEIGHT_DAYS, streak: 6, streakSource: 'daytab',
    });
    const html = renderWeight(configs, { weightKg: 73, weightG: 4 });
    expect(html).not.toContain('дней подряд');
  });

  it('первое утро серию не показывает', () => {
    const { configs } = loadSteps({ days: {}, streak: 5 });
    const html = renderWeight(configs, { weightKg: 74, weightG: 2 });
    expect(html).not.toContain('дней подряд');
    expect(html).toContain('первый день недели');
  });

  it('недельная динамика печатается знаком минуса, а не дефисом', () => {
    const { configs } = loadSteps({ days: WEIGHT_DAYS, streak: 5 });
    const html = renderWeight(configs, { weightKg: 73, weightG: 4 });
    // Кадр рисует «−0,8 кг за неделю» знаком минуса U+2212.
    expect(html).toContain('−0,8 кг за неделю');
    expect(html).not.toContain('-0,8 кг за неделю');
  });

  it('расчётный вес перечисляет взвешивания от старого к свежему', () => {
    // Кадр «Чек-ин · расчётный вес»: 13 августа → 14 августа → 15 августа.
    // Собираются они обратным ходом от сегодня, поэтому порядок показа — свой.
    const { configs } = loadSteps({ days: WEIGHT_DAYS, streak: 5 });
    const samples = [
      { date: '2026-08-15', weight: 73.4 },
      { date: '2026-08-14', weight: 73.5 },
      { date: '2026-08-13', weight: 73.9 },
    ];
    const html = renderWeight(configs, {
      estimated: true,
      estimateSource: 'estimated_avg',
      estimateSamples: samples,
      weightKg: 73,
      weightG: 6,
    });
    const order = ['13 августа', '14 августа', '15 августа'].map((d) => html.indexOf(d));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('цвета расчётного веса — роли палитры, а не литералы rgba', () => {
    // «Цвет — ролью»: литерал не следует набору, и карточка оставалась
    // песочной на тёмном экране.
    const { configs } = loadSteps({ days: WEIGHT_DAYS, streak: 5 });
    const html = renderWeight(configs, {
      estimated: true,
      estimateSource: 'estimated_avg',
      estimateSamples: [
        { date: '2026-08-15', weight: 73.4 },
        { date: '2026-08-14', weight: 73.5 },
        { date: '2026-08-13', weight: 73.9 },
      ],
      weightKg: 73,
      weightG: 6,
    });
    for (const role of ['--v4-c1', '--v4-ink-2', '--v4-ink-3', '--v4-ink-4']) {
      expect(html).toContain(role);
    }
    // Каждое значение цвета стоит внутри var(--роль, …): голого «color:rgba»
    // и голого «background:#» в блоке не осталось.
    expect(html).not.toMatch(/color:rgba\(/);
    expect(html).not.toMatch(/background:#/);
  });
});

describe('чек-ин · итог утра', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
  });

  function renderRecorded(configs) {
    return renderToStaticMarkup(React.createElement(configs.checkinRecorded.component, {
      stepData: {},
      context: { dateKey: TODAY },
    }));
  }

  it('печатает серию, а не «Утро закрыто», когда вкладка Дня не смонтирована', () => {
    // Кадр «Чек-ин · записано»: под заголовком стоит «Серия — N дней подряд».
    const { configs } = loadSteps({ days: WEIGHT_DAYS, streak: 5 });
    const html = renderRecorded(configs);
    expect(html).toContain('Чек-ин записан');
    expect(html).toContain('Серия — 5 дней подряд');
    expect(html).not.toContain('Утро закрыто');
  });

  it('галка итога красится ролью палитры', () => {
    const { configs } = loadSteps({ days: WEIGHT_DAYS, streak: 5 });
    const html = renderRecorded(configs);
    expect(html).toContain('--v4-ok-text');
    expect(html).not.toMatch(/stroke="#5c6a45"/);
  });
});

describe('чек-ин · ряд ответов «Последний кофе»', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
  });

  function renderRest(configs, data) {
    return renderToStaticMarkup(React.createElement(configs.morningRest.component, {
      data: { _dateKey: TODAY, coldType: 'none', selected: [], ...data },
      onChange: () => {},
      context: { dateKey: TODAY },
    }));
  }

  it('сноска зовёт среднюю пилюлю тем же словом, что на ней написано', () => {
    // Строка контракта «подпись средней пилюли»: до ответа — «своё время»,
    // после — само время. Сноска отсылает к пилюле, значит берёт ту же подпись.
    const { configs } = loadSteps({ days: WEIGHT_DAYS });
    const empty = renderRest(configs, {});
    expect(empty).toContain('тапом по «своё время»');

    const answered = renderRest(configs, { coffeeChoice: 'exact', coffeeTime: '14:30' });
    expect(answered).toContain('тапом по «14:30»');
    expect(answered).not.toContain('тапом по «своё время»');
  });

  it('пилюли ряда делят ширину поровну — строки разбора «· 17» и «· 18»', () => {
    const start = PWA_CSS.indexOf('.mc-rest-coffee-actions .mc-pill {');
    const rule = PWA_CSS.slice(start, PWA_CSS.indexOf('}', start));
    expect(start).toBeGreaterThan(0);
    expect(rule).toContain('flex: 1');
    expect(rule).toContain('min-width: 64px');
  });
});

describe('чек-ин · метка совета на шаге «Цель по шагам»', () => {
  it('метка прижата к низу своего ряда — она стоит НАД дорожкой', () => {
    // Ряд метки высотой 17 px, а цель нажатия у метки 44 px: без привязки к
    // низу ряда она свисала на 27 px вниз, текст совета ложился на заливку
    // дорожки, а стрелка уезжала под неё.
    const rule = PWA_CSS.slice(
      PWA_CSS.indexOf('.mc-steps-advice-mark {'),
      PWA_CSS.indexOf('.mc-steps-advice-mark::after'),
    );
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('bottom: 0');
    expect(rule).toContain('justify-content: flex-end');
    expect(rule).toContain('min-height: 44px');
    expect(rule).not.toMatch(/\btop:/);
  });

  it('подпись плашки серии набрана влево, а не по центру', () => {
    // Кадр «Чек-ин · вес», элемент 08. Выключка center наследовалась от
    // приветствия, и двухстрочная подпись вставала лесенкой.
    const start = PWA_CSS.indexOf('.mc-modal--daily .mc-daily-streak-text {');
    const rule = PWA_CSS.slice(start, PWA_CSS.indexOf('}', start));
    expect(start).toBeGreaterThan(0);
    expect(rule).toContain('text-align: left');
  });
});
