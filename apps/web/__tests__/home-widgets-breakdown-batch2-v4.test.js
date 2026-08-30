// Листы разбора шести видов пакета 22 августа — на живых днях, а не на пустом
// состоянии. До 30 августа все шесть открывались заглушкой; кадры канваса
// «Разбор · Клетчатка / Белок / Окно до сна / Качество еды / Ритм приёмов /
// Готовность ко сну» рисуют их целиком, и здесь проверяется, что модель даёт
// картинку, разбор числами, норму и действие из кадра.
//
// Пользователь такие стыки собрать не может: нужны семь дней с приёмами в
// разное время, отбой из чек-ина и продукты с клетчаткой и простыми углеводами.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const VARIANTS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
const DATA_SRC = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');

const PRODUCTS = [
  { id: 'p-veg', name: 'Овощи', fiber100: 6, simple100: 3, complex100: 5, protein100: 2, harm: 1 },
  { id: 'p-oat', name: 'Овсянка', fiber100: 4, simple100: 2, complex100: 60, protein100: 12, harm: 2 },
  { id: 'p-meat', name: 'Курица', fiber100: 0, simple100: 0, complex100: 0, protein100: 24, harm: 1 },
  { id: 'p-candy', name: 'Печенье', fiber100: 1, simple100: 45, complex100: 20, protein100: 6, harm: 8 }
];

// Один и тот же день на всю неделю: завтрак, обед, ужин и поздний перекус.
function makeDay(iso) {
  return {
    date: iso,
    waterMl: 2600,
    sleepStart: '23:30',
    steps: 9200,
    meals: [
      { time: '08:30', items: [{ id: 'p-oat', grams: 80 }] },
      { time: '13:00', items: [{ id: 'p-veg', grams: 200 }, { id: 'p-meat', grams: 150 }] },
      { time: '19:00', items: [{ id: 'p-meat', grams: 120 }, { id: 'p-veg', grams: 100 }] },
      { time: '21:30', items: [{ id: 'p-candy', grams: 60 }] }
    ]
  };
}

function isoOf(daysAgo) {
  const dt = new Date();
  dt.setDate(dt.getDate() - daysAgo);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function bootVariants() {
  const heys = window.HEYS;
  heys.Widgets = heys.Widgets || {};
  heys.Widgets.WeightDynamicsV4 = { compute: () => ({ windowSeries: [], weeklyBars: [] }) };
  heys.Widgets.formatRuNumber = (n, o) => Number(n).toLocaleString('ru-RU', o);
  heys.longPress = { MS: 350 };
  window.React = {
    createElement: (t, p, ...c) => ({ t, p, c }),
    Fragment: 'Fragment',
    useState: () => [null, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: () => ({ current: null })
  };
  window.ReactDOM = { createPortal: (n) => n };
  eval(VARIANTS_SRC);
  return window.HEYS.Widgets.VariantsV4;
}

describe('листы разбора batch2 на живых днях', () => {
  let V4;

  beforeEach(() => {
    const byIso = new Map();
    for (let i = 0; i < 14; i += 1) byIso.set(isoOf(i), makeDay(isoOf(i)));
    const index = new Map(PRODUCTS.map((p) => [p.id, p]));

    window.HEYS = {
      Widgets: { emit: () => {}, on: () => {} },
      utils: { lsGet: (_, fb) => fb },
      products: { getAll: () => PRODUCTS },
      dayUtils: {
        buildProductIndex: () => index,
        getProductFromItem: (item) => index.get(item?.id) || null,
        // Типы приёмов канвасом не задаются — берём порядок дня, как продукт.
        getMealType: (i) => ({ type: ['breakfast', 'lunch', 'dinner', 'snack1'][i] || 'snack1' })
      },
      models: {
        mealTotals: (meal) => (meal.items || []).reduce((t, it) => {
          const p = index.get(it.id) || {};
          const g = Number(it.grams) || 0;
          t.simple += ((p.simple100 || 0) * g) / 100;
          t.fiber += ((p.fiber100 || 0) * g) / 100;
          t.prot += ((p.protein100 || 0) * g) / 100;
          t.kcal += (((p.simple100 || 0) + (p.complex100 || 0) + (p.protein100 || 0)) * 4 * g) / 100;
          return t;
        }, { simple: 0, fiber: 0, prot: 0, kcal: 0 })
      }
    };
    eval(DATA_SRC);
    const data = window.HEYS.Widgets.data;
    data._getDay = () => byIso.get(isoOf(0));
    data._getDayByDate = (iso) => byIso.get(iso) || null;
    data._getProfile = () => ({ stepsGoal: 9000, waterGoalMl: 2700, weight: 80 });
    data._getOptimum = () => 2000;
    // Норма белка приходит из колец БЖУ — у живого клиента она всегда есть.
    data.getMacrosData = () => ({ proteinTarget: 128, fatTarget: 62, carbsTarget: 180 });
    // Вредность дня считает слой еды; в фикстуре она задана прямо — герой
    // «Качества еды» показывает именно её, как карточка «Питания».
    const totalsOf = data._getDayTotalsFor.bind(data);
    data._getDayTotalsFor = (day) => ({ ...totalsOf(day), harm: 3.4 });
    data._getDayTotals = () => data._getDayTotalsFor(byIso.get(isoOf(0)));
    V4 = bootVariants();
  });

  afterEach(() => {
    delete window.HEYS;
    delete window.React;
    delete window.ReactDOM;
  });

  const build = (type) => V4.buildBreakdownModel({ id: 'w', type, size: '2x2' });

  it('клетчатка — источники строками, среднее и норма', () => {
    const model = build('fiber');
    expect(model.chart.kind).toBe('sourceRows');
    // Овощи 200 г × 6 г = 12 г — больше овсянки и печенья.
    expect(model.chart.rows[0].name).toBe('Овощи');
    expect(model.chart.rows[0].pct).toBe(100);
    expect(model.chart.rows.length).toBeLessThanOrEqual(5);
    // Кадр пишет «дают овощи» — согласование под множественное; имя продукта
    // приходит из каталога, поэтому формулировка обходится без глагола.
    expect(model.insight).toBe('Главный источник — овощи');
    expect(model.stats.find((r) => r.label === 'Среднее за неделю')).toBeTruthy();
    expect(model.norm).toMatch(/^Норма \d+ г — 14 г на 1 000 ккал вашей нормы$/);
    expect(model.action.label).toBe('Добавить приём');
  });

  it('белок — четыре столбика приёмов и риска равной доли', () => {
    const model = build('protein');
    expect(model.chart.kind).toBe('mealBars');
    expect(model.chart.bars.map((b) => b.label)).toEqual(['Завтрак', 'Обед', 'Ужин', 'Перекусы']);
    expect(model.chart.targetShare).toBeCloseTo(0.25, 5);
    // Обед даёт больше всех: 200 г овощей + 150 г курицы.
    const top = model.chart.bars.slice().sort((a, b) => b.value - a.value)[0];
    expect(top.label).toBe('Обед');
    expect(model.heroKicker).toBe('Сегодня');
  });

  it('окно до сна — лента 14 дней на оси 18:00 → 06:00', () => {
    const model = build('sleepWindow');
    expect(model.chart.kind).toBe('sleepStrip');
    expect(model.chart.series.length).toBe(14);
    expect(model.chart.axisTicks).toEqual(['18:00', '21:00', '00:00', '03:00']);
    expect(model.chart.axisStart).toBe(18 * 60);
    expect(model.chart.axisSpan).toBe(12 * 60);
    // Последний приём 21:30, отбой 23:30 — окно два часа.
    const row = model.chart.series.find((r) => r.start != null);
    expect(row.end - row.start).toBe(120);
    expect(model.stats.find((r) => r.label === 'Самый поздний приём')?.value).toBe('21:30');
    // Круглый час называется часом, а не «2 ч 0 мин».
    expect(model.insight).toBe('Обычно вы едите за 2 ч до сна');
  });

  it('качество еды — вредность героем и столбик из двух частей', () => {
    const model = build('foodQuality');
    expect(model.chart.kind).toBe('stackedDays');
    expect(model.chart.columns.length).toBe(7);
    const col = model.chart.columns.find((c) => c.hasData);
    expect(col.sweetPct).toBeGreaterThan(0);
    expect(col.sweetPct).toBeLessThan(100);
    expect(model.chartAxis.labels.length).toBe(7);
    // Герой — то же число, что на карточке «Питания»: вредность и её порог.
    expect(model.heroValue).toBe('3,4');
    expect(model.heroUnit).toBe(' из 10 · порог 5');
    expect(model.insight).toMatch(/^Простых углеводов — \d+ % рациона$/);
    // Высота столбика — калории дня, доля — состав.
    expect(col.heightPct).toBeGreaterThan(0);
    expect(col.heightPct).toBeLessThanOrEqual(100);
    expect(model.stats.find((r) => r.label === 'Средняя вредность')?.value).toBe('3,4');
    // Доли простых нормы нет — норма об этом говорит прямо.
    expect(model.norm).toContain('доли простых нормы нет');
  });

  it('ритм приёмов — циферблат суток, разрыв и первый приём', () => {
    const model = build('mealRhythm');
    expect(model.chart.kind).toBe('dayClock');
    expect(model.chart.today.length).toBe(4);
    expect(model.chart.past.length).toBe(24);
    expect(model.stats.find((r) => r.label === 'Первый приём обычно')?.value).toBe('08:30');
    // Самый большой разрыв — обед 13:00 → ужин 19:00.
    expect(model.stats.find((r) => r.label === 'Самый большой разрыв')?.value).toBe('6 ч');
    // Во фразе круглый час зовётся словом — кадр «Разбор · Ритм приёмов».
    expect(model.insight).toBe('Между обедом и ужином обычно 6 часов');
  });

  it('готовность ко сну — счётчик героем, кофеин четвёртым с «нет данных»', () => {
    const model = build('sleepReady');
    expect(model.chart.kind).toBe('factorRows');
    expect(model.chart.factors.map((f) => f.label))
      .toEqual(['Вода', 'Еда до сна', 'Шаги', 'Кофеин']);
    // Поля «последний кофе» в дневнике нет — пункт без тона и без полосы.
    const caffeine = model.chart.factors[3];
    expect(caffeine.tone).toBe('none');
    expect(caffeine.pct).toBe(0);
    // Герой — счётчик закрытых пунктов, балла продукт не считает.
    expect(model.heroValue).toBe('2');
    expect(model.heroUnit).toBe(' из 3 · кофеин ждёт данных');
    expect(model.stats.find((r) => r.label === 'Кофеин')?.value).toBe('нет данных');
    // Порог кофеина — от личного отбоя 23:30, а не от часа: 15:30.
    expect(model.norm).toContain('не позже восьми часов до отбоя');
    expect(model.norm).toContain('15:30');
    // Еда до сна: последний приём 21:30, отбой 23:30 — два часа, пункт открыт.
    expect(model.chart.factors[1].tone).toBe('warn');
    // Вода 2 600 из 2 700 и шаги 9 200 из 9 000 — оба пункта закрыты.
    expect(model.chart.factors[0].tone).toBe('good');
    expect(model.chart.factors[2].tone).toBe('good');
    expect(model.insight).toBe('Чаще всего открыты еда до сна');
    // Экранного времени в листе нет — решение владельца 30 августа.
    expect(JSON.stringify(model)).not.toContain('Экран');
    expect(model.chart.dots.length).toBe(7);
  });

  it('ни один из шести не открывается пустым', () => {
    for (const type of ['fiber', 'protein', 'sleepWindow', 'foodQuality', 'mealRhythm', 'sleepReady']) {
      const model = build(type);
      expect(model.chart, type).toBeTruthy();
      expect(model.stats.length, type).toBeGreaterThan(0);
      expect(model.norm, type).toBeTruthy();
      expect(model.action?.label, type).toBeTruthy();
    }
  });
});
