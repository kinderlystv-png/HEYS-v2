/**
 * Три состояния плитки «Инсулиновая волна» — канвас home-widgets.v4, строки
 * «волна · пустой день», «волна · ночная оценка», «волна · ночная оценка на
 * прошлом дне», «волна · тон в ночной оценке», «волна · озвучивание состояний».
 *
 * Почему смоуком, а не глазами. Состояние волны руками не собрать: нужно, чтобы
 * сегодня не было ни одного приёма, вчера они были, а календарь стоял ровно на
 * сегодня — и всё это в одну минуту суток. Дефект 22 августа («4 приёма» рядом
 * с нулём съеденного) как раз и жил в том стыке, который на локалке не
 * воспроизводится по желанию.
 *
 * Проверяем всю цепочку: день → канонический расчёт → widget_data → v4 → DOM
 * плитки, включая фразу для экранного диктора.
 */
import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(WEB_DIR, name), 'utf8');

// Канонический расчёт волны — тот же порядок файлов, что в проде.
const WAVE_STACK = [
  'heys_models_v1.js',
  'heys_iw_shim.js',
  'heys_iw_patterns.js',
  'heys_iw_constants.js',
  'heys_iw_utils.js',
  'heys_iw_lipolysis.js',
  'heys_iw_response_model.js',
  'heys_iw_calc.js',
  'heys_iw_graph.js',
  'heys_iw_ndte.js',
  'heys_insulin_wave_v1.js',
];

// 10:10 — подъём в 7:10 позади ровно на три часа, вчерашние волны закрыты.
const NOW = new Date(2025, 11, 13, 10, 10, 0);
const TODAY = '2025-12-13';
const YESTERDAY = '2025-12-12';

/** Продукт с углеводами: волна считается именно по ним. */
const PORRIDGE = { name: 'Овсянка', carbs100: 60, protein100: 12, fat100: 6, fiber100: 6, gi: 55 };

function meal(id, time) {
  return { id, time, items: [{ grams: 200, ...PORRIDGE }] };
}

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

/**
 * Поднимает продуктовую цепочку данных на подставленных днях.
 * `days` — карта «ISO → день»; `selected` — дата в капсуле.
 */
function boot({ days = {}, selected = TODAY } = {}) {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node,
  };

  window.HEYS = { utils: { lsGet: (key, fallback) => fallback, lsSet: () => {} } };
  globalThis.HEYS = window.HEYS;
  for (const file of WAVE_STACK) {
    // eslint-disable-next-line no-eval
    eval(read(file));
  }

  window.HEYS.Widgets = Object.assign(window.HEYS.Widgets || {}, {
    emit: () => {},
    on: () => () => {},
    off: () => {},
  });
  // eslint-disable-next-line no-eval
  eval(read('heys_widgets_insulin_wave_v4.js'));
  // eslint-disable-next-line no-eval
  eval(read('widgets/widget_data.js'));

  const data = window.HEYS.Widgets.data;
  data._selectedDate = selected;
  data._getDayByDate = (iso) => days[iso] || null;
  data._getDay = () => days[data._selectedDate] || null;
  data._getProfile = () => ({ age: 35, weight: 70, height: 175, gender: 'ж' });
  data._isDemoMode = () => false;
  return data;
}

/** Плитка целиком: WidgetCard → WidgetContent → тело инсулиновой волны. */
function renderTile(data, { size = '2x2', variantId = 'day_as_is' } = {}) {
  window.HEYS.Widgets.registry = {
    getType: () => ({ type: 'insulinWave', name: 'Инсулиновая волна', category: 'nutrition' }),
    getCategory: () => ({ id: 'nutrition', name: 'Питание' }),
    getSize: () => ({ id: size, label: size }),
    normalizeSizeId: (id) => id,
  };
  window.HEYS.Widgets.state = { isEditMode: () => false };
  window.HEYS.Widgets.VariantsV4 = {
    getCatalog: () => [],
    getDefaultVariant: () => ({ id: variantId }),
    getActiveVariant: () => ({ id: variantId }),
    getVariantById: () => ({ id: variantId }),
    useWidgetVariantTile: null,
  };
  window.HEYS.Widgets.data.getDataForWidget = () => data.getInsulinWaveData();

  // eslint-disable-next-line no-eval
  eval(read('heys_widgets_ui_v1.js'));
  const widget = {
    id: 'w1',
    type: 'insulinWave',
    size,
    cols: 2,
    rows: 2,
    settings: {},
    position: { col: 0, row: 0 },
  };
  return render(
    RealReact.createElement(window.HEYS.Widgets.WidgetCard, {
      widget,
      isEditMode: false,
      selectedDate: data._selectedDate,
    }),
  );
}

const meta = (c) => c.querySelector('.widget-v4-row__meta')?.textContent ?? null;
// Строка «волна · счётчик приёмов» (31 августа): счётчик стоит под графиком,
// а не в углу — угол занимает кружок удаления в расстановке.
const counter = (c) =>
  c.querySelector('.widget-v4-insulin-wave__footer > span')?.textContent ?? null;
const notes = (c) =>
  [...c.querySelectorAll('.widget-v4-insulin-wave__note')].map((n) => n.textContent);
const tileLabel = (c) => c.querySelector('.widget')?.getAttribute('aria-label') ?? null;

const DAYS_OVERNIGHT = {
  [YESTERDAY]: {
    date: YESTERDAY,
    meals: [meal('y1', '08:10'), meal('y2', '13:30'), meal('y3', '20:40')],
  },
  [TODAY]: { date: TODAY, meals: [] },
};
const DAYS_TODAY = {
  [YESTERDAY]: DAYS_OVERNIGHT[YESTERDAY],
  [TODAY]: { date: TODAY, meals: [meal('t1', '06:20')] },
};
const DAYS_EMPTY = {
  [YESTERDAY]: { date: YESTERDAY, meals: [] },
  [TODAY]: { date: TODAY, meals: [] },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.React = originalReact;
  globalThis.ReactDOM = originalReactDOM;
  window.HEYS = originalHEYS;
  globalThis.HEYS = originalHEYS;
});

describe('данные: какое состояние выбирает расчёт', () => {
  it('сегодня есть приёмы — обычное состояние, ночного признака нет', () => {
    const d = boot({ days: DAYS_TODAY }).getInsulinWaveData();
    expect(d.hasData).toBe(true);
    expect(d.isOvernightEstimate).toBeUndefined();
    expect(d.v4.isOvernight).toBe(false);
    expect(d.v4.mealCountLabel).toBe('1 приём');
  });

  it('сегодня пусто, вчера были приёмы — ночная оценка с датой источника', () => {
    const d = boot({ days: DAYS_OVERNIGHT }).getInsulinWaveData();
    expect(d.hasData).toBe(true);
    expect(d.isOvernightEstimate).toBe(true);
    // Признак и его день ходят парой — как во втором расчёте на «Питании».
    expect(d.sourceDate).toBe(YESTERDAY);
    expect(d.v4.isOvernight).toBe(true);
    expect(d.v4.overnightNote).toBe('оценка по вчерашнему дню');
    expect(d.v4.overnightStateLabel).toMatch(/^покой \d+:\d\d · от вчерашнего$/);
    expect(d.v4.overnightSpoken).toMatch(
      /^Инсулиновая волна, оценка по вчерашнему дню, покой .+ от вчерашнего приёма$/,
    );
  });

  it('вчерашняя волна ещё идёт — строка называет её конец, а не покой', () => {
    // Поздний ужин и ночь на дворе: покоя ещё нет, и писать «покой 0:00» было
    // бы неправдой. Источник назван теми же словами.
    vi.setSystemTime(new Date(2025, 11, 13, 1, 30, 0));
    const days = {
      [YESTERDAY]: { date: YESTERDAY, meals: [meal('y1', '23:40')] },
      [TODAY]: { date: TODAY, meals: [] },
    };
    const d = boot({ days }).getInsulinWaveData();
    expect(d.isOvernightEstimate).toBe(true);
    expect(d.v4.overnightStateLabel).toMatch(/^под волной \d+:\d\d · от вчерашнего$/);
    expect(d.v4.overnightSpoken).toMatch(/под волной до \d+:\d\d от вчерашнего приёма$/);
  });

  it('ни сегодня, ни вчера приёмов нет — пустой день, а не ночная оценка', () => {
    const d = boot({ days: DAYS_EMPTY }).getInsulinWaveData();
    expect(d.hasData).toBe(false);
    expect(d.status).toBe('noData');
    expect(d.isOvernightEstimate).toBeUndefined();
  });

  it('прошлый день без приёмов — пустой день, цепочка на позавчера не строится', () => {
    // На самом дне приёмов нет, но у позавчерашнего они есть: подставить их
    // было бы ровно тем дефектом, только на день глубже.
    const days = {
      '2025-12-11': { date: '2025-12-11', meals: [meal('p1', '19:00')] },
      [YESTERDAY]: { date: YESTERDAY, meals: [] },
      [TODAY]: { date: TODAY, meals: [] },
    };
    const d = boot({ days, selected: YESTERDAY }).getInsulinWaveData();
    expect(d.hasData).toBe(false);
    expect(d.status).toBe('noData');
  });

  it('прошлый день с приёмами считается по самому этому дню', () => {
    const days = { [YESTERDAY]: DAYS_OVERNIGHT[YESTERDAY], [TODAY]: { date: TODAY, meals: [] } };
    const d = boot({ days, selected: YESTERDAY }).getInsulinWaveData();
    expect(d.hasData).toBe(true);
    expect(d.isPastDay).toBe(true);
    expect(d.isOvernightEstimate).toBeUndefined();
    expect(d.v4.mealCountLabel).toBe('3 приёма');
  });

  it('будущая дата без приёмов вчерашнее не тянет', () => {
    const days = {
      [YESTERDAY]: DAYS_OVERNIGHT[YESTERDAY],
      '2025-12-20': { date: '2025-12-20', meals: [] },
    };
    const d = boot({ days, selected: '2025-12-20' }).getInsulinWaveData();
    expect(d.hasData).toBe(false);
  });
});

describe('плитка: что видно в каждом состоянии', () => {
  it('обычное состояние — счётчик приёмов стоит под графиком', () => {
    const data = boot({ days: DAYS_TODAY });
    const { container } = renderTile(data);
    expect(counter(container)).toBe('1 приём');
    // В углу его больше нет: место занимает кружок удаления в расстановке.
    expect(meta(container)).toBeNull();
    expect(container.querySelector('.widget-v4-insulin-wave--overnight')).toBeNull();
  });

  it('ночная оценка — счётчика нет вовсе, вместо него две подписи', () => {
    const data = boot({ days: DAYS_OVERNIGHT });
    const { container } = renderTile(data);
    // Счётчик про сегодня, а сегодня приёмов нет: под графиком его нет.
    expect(container.querySelector('.widget-v4-insulin-wave__footer')).toBeNull();
    expect(container.textContent).not.toMatch(/\d+ приём/);
    const [first, second] = notes(container);
    expect(first).toBe('оценка по вчерашнему дню');
    expect(second).toMatch(/^покой \d+:\d\d · от вчерашнего$/);
  });

  it('ночная оценка — силуэт приглушён, тёплой метки нахлёста нет', () => {
    const data = boot({ days: DAYS_OVERNIGHT });
    const { container } = renderTile(data);
    const svg = container.querySelector('.widget-v4-insulin-wave--overnight');
    expect(svg).not.toBeNull();
    // Заливка без опасити-атрибута: плотность задаёт правило состояния.
    expect(
      [...svg.querySelectorAll('.widget-v4-insulin-wave__fill')].every(
        (n) => !n.hasAttribute('opacity'),
      ),
    ).toBe(true);
    expect(
      svg.querySelectorAll('.widget-v4-insulin-wave__overnight-stroke').length,
    ).toBeGreaterThan(0);
    expect(svg.querySelector('.widget-v4-insulin-wave__overlap')).toBeNull();
    expect(svg.querySelector('.widget-v4-insulin-wave__brace')).toBeNull();
    // Базовой линии и рисок-разделителей в этом кадре нет.
    expect(svg.querySelector('line')).toBeNull();
  });

  it('ночная оценка — по роли не красится ни один узел плитки', () => {
    const data = boot({ days: DAYS_OVERNIGHT });
    const { container } = renderTile(data);
    for (const role of ['good', 'bad', 'warn', 'act', 'overlap']) {
      expect(container.querySelector(`.widget-v4-val--${role}`)).toBeNull();
    }
  });

  it('пустой день — ровная базовая линия, прочерк и покой от подъёма', () => {
    const data = boot({ days: DAYS_EMPTY });
    const { container } = renderTile(data);
    const flat = container.querySelector('.widget-v4-insulin-wave__flatline');
    expect(flat).not.toBeNull();
    // Кадр: от x=4 до x=126 на y=46, 1,2 px, концы скруглены.
    expect([flat.getAttribute('x1'), flat.getAttribute('x2'), flat.getAttribute('y1')]).toEqual([
      '4',
      '126',
      '46',
    ]);
    expect(flat.getAttribute('stroke-width')).toBe('1.2');
    expect(flat.getAttribute('stroke-linecap')).toBe('round');
    // Отступление от кадра названо вслух: холст здесь полоса вокруг основания,
    // а не все 52 px — иначе прочерк с подписью и график не помещаются в
    // продуктовую плитку 2×2. Под линией те же 6 px, что у холста волн.
    const flatSvg = flat.closest('svg');
    expect(flatSvg.getAttribute('viewBox')).toBe('0 34 130 18');
    expect(flatSvg.getAttribute('height')).toBe('18');
    expect(container.querySelector('.widget-v4-hero-num__val').textContent).toBe('—');
    expect(container.querySelector('.widget-v4-unit').textContent).toBe('приёмов не было');
    expect(container.querySelector('.widget-v4-row__meta')).toBeNull();
    expect(notes(container)).toEqual(['покой 3 ч от подъёма']);
  });

  it('вид 1×1 «Спокойное окно» в ночной оценке называет источник', () => {
    const data = boot({ days: DAYS_OVERNIGHT });
    const { container } = renderTile(data, { size: '1x1', variantId: 'calm_window' });
    // Подпись под числом переехала с подвала (.widget-v4-muted, 10px/700) на
    // единицу 31 августа: кадр «Шторка · Инсулиновая волна» кладёт её прямо
    // под числом, а не прижимает к низу плитки вторым marginTop:auto. Тот же
    // класс уже носит «приёмов не было» у пустого дня.
    expect(container.querySelector('.widget-v4-unit').textContent).toBe('от вчерашнего');
  });
});

describe('озвучивание состояний', () => {
  it('ночная оценка читается одной фразой с длительностью словами', () => {
    const data = boot({ days: DAYS_OVERNIGHT });
    const { container } = renderTile(data);
    const label = tileLabel(container);
    expect(label).toMatch(/^Инсулиновая волна, оценка по вчерашнему дню, покой /);
    expect(label).toMatch(/от вчерашнего приёма$/);
    // «5:50» диктор прочитал бы как время суток — в фразе часы и минуты словами.
    expect(label).not.toMatch(/\d:\d\d/);
  });

  it('пустой день читается фразой про подъём, а не прочерком', () => {
    const data = boot({ days: DAYS_EMPTY });
    const { container } = renderTile(data);
    expect(tileLabel(container)).toBe(
      'Инсулиновая волна, приёмов не было, покой 3 часа от подъёма',
    );
  });
});
