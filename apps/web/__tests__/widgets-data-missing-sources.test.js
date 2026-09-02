/**
 * Регрессия на «тихую деградацию в нули» в слое данных виджетов.
 *
 * Все три бага были одинаковыми: вызов через optional chaining уходил в
 * несуществующий метод, промах глушился, виджет молча показывал 0 / пусто.
 * Поэтому тесты гоняют НАСТОЯЩИЕ модули (widgets/widget_data.js и
 * heys_widgets_data_crash_risk_v1.js) против фейковых источников данных
 * и требуют, чтобы данные реально доехали.
 *
 * Живой слой данных — apps/web/widgets/widget_data.js. Второй файл, который
 * присваивал тот же HEYS.Widgets.data мимо бандлов, удалён 2026-08-09.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function loadLegacy(relPath, host) {
  const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(host);
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

describe('widget_data: streak берётся из живого калькулятора серии', () => {
  let data;

  beforeEach(() => {
    global.window = global;
    global.HEYS = {};
    loadLegacy('apps/web/widgets/widget_data.js', global);
    data = global.HEYS.Widgets.data;

    // Единая точка входа для серии (boot-day) — см.
    // widgets-streak-single-source.test.js, где она проверяется по-настоящему.
    global.HEYS.dayCalendarMetrics = {
      getCurrentStreak: () => 5,
    };
    // Рекорд живёт в геймификации как stats.bestStreak.
    global.HEYS.game = { getStats: () => ({ stats: { bestStreak: 9 } }) };
  });

  it('текущая серия доезжает до виджета, а не остаётся нулём', () => {
    expect(data.getStreakData().current).toBe(5);
  });

  it('рекорд берётся из геймификации', () => {
    expect(data.getStreakData().max).toBe(9);
  });

  it('рекорд не может оказаться меньше текущей серии', () => {
    // bestStreak пишется только при смонтированном DayTab и отстаёт.
    global.HEYS.game = { getStats: () => ({ stats: { bestStreak: 0 } }) };
    expect(data.getStreakData()).toEqual({ current: 5, max: 5 });
  });

  it('без геймификации виджет всё равно показывает серию', () => {
    delete global.HEYS.game;
    expect(data.getStreakData()).toEqual({ current: 5, max: 5 });
  });
});

describe('widget_data: виджет «Инсулин» получает канонический расчёт', () => {
  let data;

  beforeEach(() => {
    global.window = global;
    global.HEYS = {};
    loadLegacy('apps/web/widgets/widget_data.js', global);
    data = global.HEYS.Widgets.data;

    global.HEYS.Widgets.data._selectedDate = isoDaysAgo(0);
    // Единственный источник — HEYS.InsulinWave.calculate.
    global.HEYS.InsulinWave = {
      calculate: () => ({
        status: 'settling',
        remaining: 95,
        duration: 180,
        lastMealTimeDisplay: '13:20',
        endTimeDisplay: '16:20',
        waveShapeDesc: 'Пологая волна',
        currentPhase: 'settling',
      }),
    };
    global.HEYS.store = {
      get: (key) => (key.includes('dayv2') ? { meals: [{ time: '13:20', items: [] }] } : null),
    };
  });

  it('статус перестаёт быть unknown и кольцо получает длину волны', () => {
    const result = data.getInsulinData();
    expect(result.status).not.toBe('unknown');
    expect(result.totalWave).toBe(180);
    expect(result.remaining).toBe(95);
  });

  it('UI-словарь статусов заполняется по остатку времени', () => {
    const at = (remaining, status = 'settling') => {
      global.HEYS.InsulinWave.calculate = () => ({ status, remaining, duration: 180 });
      return data.getInsulinData().status;
    };
    expect(at(95)).toBe('active');
    expect(at(45)).toBe('soon');
    expect(at(25)).toBe('almost');
    expect(at(0, 'complete')).toBe('lipolysis');
  });

  it('phase не подменяется статусом — currentPhase === status и бесполезен', () => {
    expect(data.getInsulinData().phase).toBe('Пологая волна');
  });

  it('время последнего приёма доезжает до шапки виджета', () => {
    expect(data.getInsulinData().lastMealTime).toBe('13:20');
  });

  it('«приём ещё впереди» не уводит кольцо в минус', () => {
    global.HEYS.InsulinWave.calculate = () => ({ status: 'scheduled', remaining: 400, duration: 180 });
    const result = data.getInsulinData();
    expect(result.remaining).toBeLessThanOrEqual(result.totalWave);
  });
});

describe('crash risk: ранний прогноз (EWS) действительно считается', () => {
  let getCrashRiskData;
  let seenDays;
  let store;

  beforeEach(() => {
    global.window = global;
    global.HEYS = {};

    store = new Map();
    for (let i = 0; i < 20; i++) {
      store.set(isoDaysAgo(i), { weightMorning: 80 - i * 0.05, meals: [], steps: 5000 });
    }

    global.HEYS.utils = {
      lsGet: (key, fallback) => {
        const m = /^heys_dayv2_(.+)$/.exec(key);
        if (m) return store.get(m[1]) || fallback;
        if (key === 'heys_profile') return { weight: 80, height: 180 };
        return fallback;
      },
    };
    global.HEYS.dayUtils = { fmtDate: (d) => isoDaysAgo(Math.round((Date.now() - d.getTime()) / 86400000)) };
    global.HEYS.dayCache = { getDay: (dateStr) => store.get(dateStr) || null };

    seenDays = null;
    global.HEYS.InsightsPI = {
      earlyWarning: {
        detect: (daysArray) => {
          seenDays = daysArray;
          return { count: 3, signals: [] };
        },
      },
    };

    loadLegacy('apps/web/heys_widgets_weight_dynamics_v4.js', global);
    loadLegacy('apps/web/heys_widgets_data_crash_risk_v1.js', global);
    getCrashRiskData = global.HEYS.Widgets.DataProviders.crashRisk.getData;
  });

  it('EWS вызывается и виджет получает ненулевой ewsCount', () => {
    const result = getCrashRiskData({ days: 7 });
    expect(seenDays, 'detect не был вызван — массив дней снова пустой').not.toBeNull();
    expect(result.ewsCount).toBe(3);
    expect(result.ewsData).toBeTruthy();
    expect(result.dynamicsV4).toBeTruthy();
  });

  it('в EWS уходят полные dayv2-объекты с датой, а не пары {date, weight}', () => {
    getCrashRiskData({ days: 7 });
    expect(seenDays.length).toBeGreaterThanOrEqual(6);
    for (const day of seenDays) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day).toHaveProperty('steps');
    }
  });

  it('на 7-дневном периоде окно шире порога — пропуск дня не гасит прогноз', () => {
    getCrashRiskData({ days: 7 });
    expect(seenDays.length).toBeGreaterThan(7);
  });

  it('нехватка истории отличается от ошибки провайдера и сохраняет честный v4 placeholder', () => {
    store.clear();
    store.set(isoDaysAgo(0), { weightMorning: 80, meals: [], steps: 5000 });

    const result = getCrashRiskData({ days: 7 });

    expect(result.hasData).toBe(false);
    expect(result.emptyReason).toBe('insufficient_history');
    expect(result.dynamicsV4).toMatchObject({
      hasDynamics: false,
      placeholder: 'нужна неделя',
    });
  });
});

describe('home widgets: fail-closed empty states не маскируют ошибки данными', () => {
  it('crash-risk различает нехватку истории, недоступный provider и ошибку', () => {
    const dataSource = readSource('apps/web/widgets/widget_data.js');
    const uiSource = readSource('apps/web/heys_widgets_ui_v1.js');

    expect(dataSource).toContain("emptyReason: 'provider_unavailable'");
    expect(dataSource).toContain("emptyReason: 'provider_error'");
    expect(uiSource).toContain("data?.emptyReason === 'insufficient_history'");
    expect(uiSource).toContain("v4EmptyTile('Динамика веса', 'данные недоступны')");
  });

  it('Health Trend рисует линию только из фактического sparkline', () => {
    const uiSource = readSource('apps/web/heys_widgets_ui_v1.js');
    const start = uiSource.indexOf('function HealthTrendVariantBody');
    const end = uiSource.indexOf('function HealthTrendWidgetContent', start);
    const chunk = uiSource.slice(start, end);

    expect(uiSource).toContain('function normalizeHealthSparkPoints(value)');
    expect(chunk).toContain('compactSparkPoints ? React.createElement');
    // Сторожим правило, а не текст строки: точки берутся из данных, а не из
    // захардкоженной заглушки. Прежняя дословная проверка падала на любой
    // переписи вызова — так и вышло с 6fe9701bb, где линию научили считать
    // геометрией (trendGeom) и вызов стал многострочным, хотя источник данных
    // остался тем же. Тест на форму записи ломается на починке; две проверки
    // ниже, про отсутствие фиксированных координат, и есть суть этого теста.
    expect(chunk).toMatch(
      /const trendPts = normalizeHealthSparkPoints\([\s\S]{0,200}?data\?\.sparkline\?\.points/,
    );
    expect(chunk).not.toContain('2,18 11,16 20,17 29,12 38,9 47,6 56,4');
    expect(chunk).not.toContain("['4,32', '26,28', '48,30'");
  });
});

function readSource(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('виджет insulinWave: липолиз-режим спарклайна включается', () => {
  it('фолбэк isLipolysis сверяется со статусом, который расчёт реально отдаёт', () => {
    const ui = readSource('apps/web/heys_widgets_ui_v1.js');
    const wave = readSource('apps/web/heys_insulin_wave_v1.js');

    const m = /isLipolysis\s*=\s*data\?\.isLipolysis\s*\?\?\s*\(status === '(\w+)'\)/.exec(ui);
    expect(m, 'фолбэк isLipolysis исчез из InsulinWaveWidgetContent').toBeTruthy();

    // Канонический расчёт знает три статуса; фолбэк обязан ссылаться на один
    // из них, иначе режим липолиза в спарклайне мёртв.
    const produced = new Set([...wave.matchAll(/'(scheduled|settling|complete)'/g)].map((x) => x[1]));
    expect(produced.has(m[1]), `статус '${m[1]}' расчёт не производит`).toBe(true);
  });

  it('в компоненте не осталось чтений полей, которых никто не производит', () => {
    const ui = readSource('apps/web/heys_widgets_ui_v1.js');
    const start = ui.indexOf('function InsulinWaveWidgetContent');
    const body = ui.slice(start, start + 4000);
    for (const ghost of ['isNightTime', 'isOvernightLipolysis']) {
      expect(body.includes(ghost), `${ghost} читается, но не производится`).toBe(false);
    }
  });

  it('мёртвые компоненты ночного и прошлого дня удалены вместе с полями-призраками', () => {
    const ui = readSource('apps/web/heys_widgets_ui_v1.js');
    expect(ui).not.toMatch(/function InsulinWaveOvernightContent/);
    expect(ui).not.toMatch(/function InsulinWavePastDayContent/);
    expect(ui).not.toMatch(/fatBurningWindow/);
  });
});

describe('каскад: «точный» расчёт больше не обрывается о несуществующий метод', () => {
  let snapshot;

  beforeEach(() => {
    global.window = global;
    global.HEYS = {};
    global.HEYS.dayCalculations = {
      calculateDayTotals: () => ({ kcal: 1800, prot: 90, fat: 60, carbs: 200 }),
      computeDailyNorms: (optimum) => ({ optimum, kcal: optimum }),
    };
    global.HEYS.dayUtils = { buildProductIndex: () => ({ byId: new Map(), byName: new Map() }) };
    // getOptimumForDay намеренно отсутствует — ровно как в живом приложении.
    global.HEYS.products = { getAll: () => [] };
    global.HEYS.TDEE = { calculate: () => ({ optimum: 1868 }) };
    global.HEYS.utils = { lsGet: (k, f) => f };
    global.React = {
      createElement: () => null,
      memo: (c) => c,
      useState: () => [null, () => {}],
      useEffect: () => {},
      useMemo: (f) => f(),
      useRef: () => ({ current: null }),
      useCallback: (f) => f,
    };

    loadLegacy('apps/web/heys_cascade_card_v1.js', global);
    snapshot = global.HEYS.CascadeCard?.computeExactCascadeSnapshot;
  });

  it('без HEYS.dayUtils.getOptimumForDay расчёт всё равно доходит до результата', () => {
    expect(typeof snapshot).toBe('function');
    const day = { meals: [{ time: '09:00', items: [{ name: 'каша', grams: 200 }] }] };
    const result = snapshot(day, { weight: 80, height: 180, age: 35 }, { silent: true });
    expect(result, 'снимок каскада снова null — жёсткая проверка на призрака вернулась').not.toBeNull();
  });
});
