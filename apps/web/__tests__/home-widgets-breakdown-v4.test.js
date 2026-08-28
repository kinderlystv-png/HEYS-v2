// Листы разбора плиток Главной — batch 1 (12 с данными) + batch 2 (6 stub).
// Контракт: home-widgets.v4.dc.html «каркас разбора», «разбор · …», «цель тапа».
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const VARIANTS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
const UI_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const CSS_SRC = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const DATA_SRC = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');

const BATCH1 = [
  'calories', 'water', 'weight', 'sleep', 'steps', 'insulinWave', 'macros',
  'dayScore', 'relapseRisk', 'healthTrend', 'heatmap', 'crashRisk'
];
const BATCH2_STUB = ['fiber', 'protein', 'sleepWindow', 'foodQuality', 'mealRhythm', 'sleepReady'];

function bootVariants() {
  const heys = window.HEYS || {};
  window.HEYS = heys;
  heys.Widgets = heys.Widgets || {};
  heys.Widgets.WeightDynamicsV4 = heys.Widgets.WeightDynamicsV4 || {
    compute: () => ({ windowSeries: [], weeklyBars: [] })
  };
  heys.Widgets.formatRuNumber = heys.Widgets.formatRuNumber
    || ((n, o) => Number(n).toLocaleString('ru-RU', o));
  heys.longPress = heys.longPress || { MS: 350 };
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

describe('home-widgets breakdown sheets v4', () => {
  afterEach(() => {
    delete window.HEYS;
    delete window.React;
    delete window.ReactDOM;
  });

  it('экспорт batch1/batch2 и wiring тапа в UI', () => {
    expect(VARIANTS_SRC).toContain('BREAKDOWN_BATCH1');
    expect(VARIANTS_SRC).toContain('BREAKDOWN_STUB_TYPES');
    expect(VARIANTS_SRC).toContain('buildBreakdownModel');
    expect(VARIANTS_SRC).toContain('WidgetBreakdownSheet');
    expect(VARIANTS_SRC).toContain('function bdSplinePath');
    expect(VARIANTS_SRC).toContain('bdTypicalCaloriesAtHour');
    expect(VARIANTS_SRC).toContain('sleepStrip');
    expect(VARIANTS_SRC).toContain('heroTracks');
    expect(VARIANTS_SRC).toContain('is-gap');
      expect(VARIANTS_SRC).toContain('function opensBreakdown');
    expect(VARIANTS_SRC).toContain('riskHourProfile');
    expect(VARIANTS_SRC).toContain('bdRelapseMonthProfile');
    expect(VARIANTS_SRC).toContain('bdHealthTrendMonthAnalysis');
    expect(VARIANTS_SRC).toContain('bdHeatmapBreakdownInsight');
    expect(VARIANTS_SRC).toContain('bdWeightPlateauBands');

    for (const t of [...BATCH1, ...BATCH2_STUB]) {
      expect(VARIANTS_SRC).toContain(`'${t}'`);
    }

    expect(UI_SRC).toContain('openBreakdownSheet');
    expect(UI_SRC).toContain('WidgetBreakdownSheet');
    expect(UI_SRC).toContain('openBreakdownSheet(widget)');
    expect(UI_SRC).not.toContain('openRelapseDetails(widget)');
    expect(UI_SRC).not.toMatch(/React\.createElement\(RelapseRiskDetailsModal/);
    expect(UI_SRC).not.toMatch(/React\.createElement\(DayScoreDetailsModal/);
    expect(UI_SRC).not.toMatch(/React\.createElement\(CrashRiskDetailsModal/);
  });

  it('каркас листа в CSS — поля 12, радиус 26, scrim без блюра, кнопка 48', () => {
    expect(CSS_SRC).toContain('.widget-bd-sheet {');
    expect(CSS_SRC).toMatch(/\.widget-bd-sheet[\s\S]*?left:\s*12px/);
    expect(CSS_SRC).toMatch(/\.widget-bd-sheet[\s\S]*?border-radius:\s*26px/);
    expect(CSS_SRC).toMatch(/\.widget-bd-sheet__grab[\s\S]*?width:\s*38px/);
    expect(CSS_SRC).toMatch(/\.widget-bd-sheet__action[\s\S]*?height:\s*48px/);
    expect(CSS_SRC).toMatch(/\.widget-bd-sheet__scrim[\s\S]*?backdrop-filter:\s*none/);
    expect(CSS_SRC).toMatch(/\.widget-bd-sheet__hero-val[\s\S]*?font-size:\s*44px/);
    expect(CSS_SRC).toContain('.widget-bd-sheet__sleep-strip');
    expect(CSS_SRC).toContain('.widget-bd-sheet__sleep-timeline-avg');
    expect(CSS_SRC).toContain('.widget-bd-sheet__sleep-axis');
    expect(CSS_SRC).toContain('.widget-bd-sheet__hero-tracks');
  });

  it('кегль плиток v4 — rem для системного масштаба', () => {
    expect(CSS_SRC).toMatch(/\.widget-v4-kicker[\s\S]*?font-size:\s*0\.5625rem/);
    expect(CSS_SRC).toMatch(/\.widget-v4-mini__value[\s\S]*?font-size:\s*1\.3125rem/);
    expect(CSS_SRC).toMatch(/\.widget-v4-unit[\s\S]*?font-size:\s*0\.625rem/);
    expect(CSS_SRC).toMatch(/\.widget-v4-hero-num__val[\s\S]*?font-size:\s*1\.625rem/);
  });

  describe('buildBreakdownModel', () => {
    let V4;

    beforeEach(() => {
      window.HEYS = { Widgets: { emit: () => {}, on: () => {} }, utils: { lsGet: (_, fb) => fb } };
      eval(DATA_SRC);
      const data = window.HEYS.Widgets.data;
      data._getDay = () => ({ date: '2025-12-12', waterMl: 1200, meals: [] });
      data._getDayByDate = () => null;
      data._getProfile = () => ({ stepsGoal: 9000, waterGoalMl: 2700 });
      data._calculateDayTotals = () => ({ kcal: 1500, prot: 80, fat: 60, carbs: 150 });
      V4 = bootVariants();
      window.HEYS.Widgets['data'] = data;
      window.HEYS.Widgets.WeightDynamicsV4 = {
        compute: () => ({
          delta: '−1,8',
          monthRateKg: -0.45,
          windowSeries: [{ smoothed: 85, date: '2025-12-01' }],
          weeklyBars: [{ label: '−0,4 кг' }],
          remainderLabel: 'Здоровый темп — до 1 % веса в неделю'
        })
      };
    });

    it('batch1 — полный лист с action и без stubOnly', () => {
      for (const type of BATCH1) {
        const model = V4.buildBreakdownModel({ id: 'w1', type, size: '2x2' });
        expect(model, type).toBeTruthy();
        expect(model.stubOnly, type).toBeFalsy();
        expect(model.title, type).toBeTruthy();
        expect(model.action?.label, type).toBeTruthy();
      }
    });

    it('batch2 — stub «за сегодня»', () => {
      for (const type of BATCH2_STUB) {
        expect(V4.opensBreakdown(type)).toBe(true);
        const model = V4.buildBreakdownModel({ id: 'w2', type, size: '1x1' });
        expect(model.stubOnly, type).toBe(true);
        expect(model.insight, type).toBeNull();
        expect(model.chart, type).toBeNull();
      }
    });

    it('status открывается как dayScore', () => {
      expect(V4.resolveBreakdownType({ type: 'status' })).toBe('dayScore');
      expect(V4.opensBreakdown('status')).toBe(true);
    });

    it('калории — медиана и norm, insight из истории, ужин из приёмов', () => {
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      const mkMeal = (time, kcal) => ({
        time,
        items: [{ kcal100: kcal, grams: 100 }]
      });
      d._getDay = () => ({
        date: todayIso,
        meals: [mkMeal('08:00', 400), mkMeal('13:00', 600)]
      });
      d._getDayByDate = (iso) => {
        if (iso === todayIso) return d._getDay();
        return {
          date: iso,
          meals: [mkMeal('08:00', 500), mkMeal('13:00', 700), mkMeal('19:00', 620)]
        };
      };
      d._getProfile = () => ({ stepsGoal: 9000, waterGoalMl: 2700 });
      d._calculateDayTotals = () => ({ kcal: 1000, prot: 80, fat: 60, carbs: 150 });
      const model = V4.buildBreakdownModel({ id: 'c', type: 'calories', size: '2x2' });
      expect(model.stats.some((r) => r.label.includes('Типичный') || r.label.includes('Разброс'))).toBe(true);
      expect(model.norm).toMatch(/Норма/);
      expect(model.action.kind).toBe('addMeal');
      expect(model.insight == null || model.insight.includes('Обычно к этому часу')).toBe(true);
      const dinnerRow = model.stats.find((r) => r.label === 'Обычно на ужин остаётся');
      expect(dinnerRow?.value).toBe('620 ккал');
      expect(VARIANTS_SRC).toContain('function bdTypicalDinnerKcal');
    });

    it('шаги — таблица дней недели с тонами', () => {
      const d = window.HEYS.Widgets.data;
      d._getDay = () => ({ date: '2025-12-12', steps: 8500 });
      d._getDayByDate = (iso) => {
        if (iso === '2025-12-11') return { date: iso, steps: 12000 };
        if (iso === '2025-12-10') return { date: iso, steps: 5000 };
        return null;
      };
      const model = V4.buildBreakdownModel({ id: 's', type: 'steps', size: '2x1' });
      expect(model.stats.some((r) => r.label === 'Цель закрыта')).toBe(true);
      expect(model.stats.some((r) => r.tone === 'bad' || r.tone === 'good')).toBe(true);
    });

    it('инсулин — лента 7 дней waveWeekStrip, stats недели, без waveDay', () => {
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      window.HEYS.InsulinWave = {
        calculate: () => ({
          waveHistory: [{ startMin: 480, endMin: 660, isActive: false }],
          overlaps: [{ overlapMinutes: 20 }],
          status: 'settling',
          endTime: '21:10'
        })
      };
      window.HEYS.Widgets.InsulinWaveV4 = {
        buildV4FromWave: () => ({
          dayBar: {
            segments: [
              { flex: 120, elevated: false },
              { flex: 180, elevated: true },
              { flex: 200, elevated: false }
            ]
          },
          calmWindowMinutes: 130,
          overlapCount: 1,
          mealCount: 2
        })
      };
      d._getDay = () => ({
        date: todayIso,
        meals: [{ time: '12:00', items: [{ kcal100: 100, grams: 100, carbs: 50 }] }]
      });
      d._getDayByDate = (iso) => (iso === todayIso ? d._getDay() : {
        date: iso,
        meals: [{ time: '13:00', items: [{ kcal100: 80, grams: 100, carbs: 40 }] }]
      });
      const model = V4.buildBreakdownModel({ id: 'iw', type: 'insulinWave', size: '2x2' });
      expect(model.chart?.kind).toBe('waveWeekStrip');
      expect(model.chart?.rows?.length).toBe(7);
      expect(model.chartLabel).toBeNull();
      expect(model.insight).toMatch(/Последняя волна закрывается в 21:10/);
      expect(model.stats.some((r) => r.label === 'Среднее окно')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Нахлёстов за неделю')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Волн сегодня')).toBe(true);
      expect(VARIANTS_SRC).toContain("chart.kind === 'waveWeekStrip'");
      expect(CSS_SRC).toContain('.widget-bd-sheet__wave-week-seg');
    });

    it('оценка дня — weakDays у факторов, insight по месяцу, stats без недели', () => {
      window.HEYS.DayScore = {
        calculateDayScore: () => ({
          score: 74,
          statusResult: {
            categoryScores: { food: 82, water: 63, sleep: 74, activity: 91, relapse: 100 }
          }
        })
      };
      window.HEYS.MorningCheckinUtils = { getMorningCheckinStatus: () => ({ sessionDone: true }) };
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      d._getDay = () => ({ date: todayIso, meals: [] });
      d._getDayByDate = (iso) => ({ date: iso, meals: [] });
      d._getDayTotals = () => ({});
      d._getNormAbs = () => ({});
      d._getWaterGoal = () => 2000;
      d._calculateDayTotals = () => ({});
      const model = V4.buildBreakdownModel({ id: 'ds', type: 'dayScore', size: '2x1' });
      expect(model.heroKicker).toBe('Сегодня');
      expect(model.factorBars?.length).toBe(5);
      expect(model.factorBars.every((f) => f.weakTotal === 30 && f.weakDays != null)).toBe(true);
      expect(model.insight).toMatch(/Чаще всего вниз тянет вода/);
      expect(model.stats.some((r) => r.label === 'Средняя за месяц')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Ниже 6' && /из 30$/.test(r.value))).toBe(true);
      expect(model.stats.some((r) => r.label === 'Средняя за неделю')).toBe(false);
      expect(model.action.label).toBe('Поправить ответы');
      expect(VARIANTS_SRC).toContain('weakDays');
      expect(CSS_SRC).toContain('.widget-bd-sheet__factor-share');
    });

    it('риск-радар — riskHourProfile, stats месяца, drivers с полосой', () => {
      window.HEYS.RelapseRisk = {
        calculate: ({ now }) => {
          const hour = new Date(now).getHours();
          return {
            score: hour >= 21 ? 65 : 22,
            primaryDrivers: [{ label: 'Вода 63 % от ожидаемого', impact: 12 }]
          };
        },
        getCurrentSnapshot: () => ({
          hasData: true,
          score: 45,
          level: 'elevated',
          primaryDrivers: [{ label: 'Клетчатка отстаёт на два приёма', impact: 16 }]
        }),
        CONFIG: { DEFAULT_PROFILE_KEY: 'v1_2' }
      };
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      const mkDay = () => ({ date: todayIso, meals: [{ time: '12:00', items: [{ kcal100: 100, grams: 100 }] }] });
      d._getDay = mkDay;
      d._getDayByDate = () => mkDay();
      d._getDayTotalsFor = () => ({ kcal: 1500, prot: 80, fat: 60, carbs: 150 });
      d._calculateDayTotals = () => ({ kcal: 1500, prot: 80, fat: 60, carbs: 150 });
      d._getNormAbs = () => ({ kcal: 2000, prot: 120, fat: 70, carbs: 200 });
      const model = V4.buildBreakdownModel({ id: 'rr', type: 'relapseRisk', size: '2x2' });
      expect(model.heroKicker).toBe('Сейчас');
      expect(model.heroValue).toBe('Средний');
      expect(model.chart?.kind).toBe('riskHourProfile');
      expect(model.chart?.monthAvg?.length).toBe(14);
      expect(model.chartLabel).toBeNull();
      expect(model.stats.some((r) => r.label === 'Срывов за месяц')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Опасный час')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Дней без риска' && /из 30$/.test(r.value))).toBe(true);
      expect(model.drivers?.[0]?.tone).toBeTruthy();
      expect(model.insight).toMatch(/21:00/);
      expect(VARIANTS_SRC).toContain('riskHourProfile');
      expect(CSS_SRC).toContain('.widget-bd-sheet__driver-row');
    });

    it('тренд здоровья — spline30, вклады с полосой, лучшая неделя', () => {
      window.HEYS.PredictiveInsights = {
        analyze: () => ({
          available: true,
          daysWithData: 30,
          healthScore: {
            total: 6,
            categories: { recovery: 4, activity: 3, nutrition: 2 }
          },
          patterns: [{ pattern: 'hydration', available: true, score: 38 }]
        })
      };
      window.HEYS.DayScore = {
        calculateDayScore: () => ({ score: 72 })
      };
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      d._getDay = () => ({ date: todayIso, meals: [{ time: '12:00', items: [] }] });
      d._getDayByDate = () => ({ date: todayIso, meals: [{ time: '12:00', items: [] }] });
      d._getNormAbs = () => ({});
      d._getWaterGoal = () => 2000;
      const model = V4.buildBreakdownModel({ id: 'ht', type: 'healthTrend', size: '2x2' });
      expect(model.heroKicker).toBe('За месяц');
      expect(model.heroUnit).toBe(' пунктов');
      expect(model.heroValue).toBe('+6');
      expect(model.chart?.kind).toBe('spline30');
      expect(model.chart?.spark?.length).toBe(30);
      expect(model.chartLabel).toBeNull();
      expect(model.chartAxis?.left).toBe('30 дней назад');
      expect(model.chartAxis?.right).toBe('сегодня');
      expect(model.contributions?.length).toBe(3);
      expect(model.contributions[0].barPct).toBeGreaterThan(0);
      expect(model.contributions.some((r) => r.label === 'Вода')).toBe(true);
      expect(model.insight).toMatch(/сон.*вода/i);
      expect(model.stats.some((r) => r.label === 'Лучшая неделя')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Дней в плюсе' && /из 30$/.test(r.value))).toBe(true);
      expect(model.stats.some((r) => r.label === 'Дней с данными')).toBe(false);
      expect(model.action.label).toBe('Открыть Инсайты');
      expect(VARIANTS_SRC).toContain('widget-bd-sheet__contrib-bar');
      expect(CSS_SRC).toContain('.widget-bd-sheet__contrib-row');
    });

    it('карта активности — grid7x5, is-gap, insight про недели без длинных пропусков', () => {
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      const activeDay = () => ({
        date: todayIso,
        householdMin: 35,
        trainings: [{ duration: 10 }]
      });
      d._getDay = activeDay;
      d._getDayByDate = activeDay;
      d._getProfile = () => ({ activityMinutesGoal: 30 });
      const model = V4.buildBreakdownModel({ id: 'hm', type: 'heatmap', size: '2x1' });
      expect(model.chart?.kind).toBe('grid7x5');
      expect(model.chart?.cells?.length).toBe(35);
      expect(model.chart?.gapFlags?.some(Boolean)).toBe(false);
      expect(model.insight).toBe('Пять недель подряд без пропусков дольше двух дней');
      expect(model.stats.some((r) => r.label === 'Дней в норме' && /из 35$/.test(r.value))).toBe(true);
      expect(CSS_SRC).toContain('.widget-bd-sheet__heat-cell.is-gap');
    });

    it('динамика веса — плато 10+ дней, недельная таблица, norm темпа', () => {
      const d = window.HEYS.Widgets.data;
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      d._getDayByDate = (iso) => {
        const dt = new Date(`${iso}T12:00:00`);
        const daysAgo = Math.round((today - dt) / 86400000);
        if (daysAgo < 0 || daysAgo > 89) return null;
        const weight = daysAgo <= 13 ? 82.0 : 82.0 + (daysAgo - 13) * 0.05;
        return { date: iso, weightMorning: weight };
      };
      d._getDay = () => d._getDayByDate(d._formatDate(today));
      d._getProfile = () => ({ weight: 90, weightGoal: 78 });
      window.HEYS.Widgets.WeightDynamicsV4 = { compute: () => ({ hasDynamics: true, delta: { sign: '−', text: '1,8' } }) };
      const model = V4.buildBreakdownModel({ id: 'cr', type: 'crashRisk', size: '2x1' });
      expect(model.chart?.kind).toBe('weightCurve');
      expect(model.chart?.spark?.length).toBe(90);
      expect(model.chart?.plateaus?.length).toBeGreaterThan(0);
      expect(model.insight).toMatch(/плато — вес стоит с/i);
      expect(model.stats?.length).toBe(4);
      expect(model.stats[3]?.tone).toBe('good');
      expect(model.stats[3]?.value).toMatch(/кг$/);
      expect(model.norm).toMatch(/Здоровый темп — до 1 % веса в неделю/);
      expect(CSS_SRC).toContain('.widget-bd-sheet__weight-plateau');
    });

    it('БЖУ — тройной hero с полосками, insight до hero, средние за 7 дней', () => {
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      const mkDay = (prot, fat, carbs) => ({
        date: todayIso,
        meals: [{ time: '12:00', items: [{ kcal100: 100, grams: 100, prot, fat, carbs }] }]
      });
      d._getDay = () => mkDay(96, 58, 132);
      d._getDayByDate = () => mkDay(80, 60, 150);
      d._getProfile = () => ({ stepsGoal: 9000, waterGoalMl: 2700 });
      d._calculateDayTotals = (day) => ({
        kcal: 1500,
        prot: day?.meals?.[0]?.items?.[0]?.prot ?? 80,
        fat: day?.meals?.[0]?.items?.[0]?.fat ?? 60,
        carbs: day?.meals?.[0]?.items?.[0]?.carbs ?? 150
      });
      window.HEYS.Widgets.data.getMacrosData = () => ({
        protein: 96,
        fat: 58,
        carbs: 132,
        proteinTarget: 128,
        fatTarget: 64,
        carbsTarget: 168
      });
      const model = V4.buildBreakdownModel({ id: 'm', type: 'macros', size: '3x2' });
      expect(model.heroValue).toBeNull();
      expect(model.heroTracks?.length).toBe(3);
      expect(model.heroTracks[0].name).toBe('Белок');
      expect(model.heroTracks[0].pct).toBeGreaterThan(0);
      expect(model.insightBeforeHero).toBe(true);
      expect(model.chartLabel).toBeNull();
      expect(model.chart?.kind).toBe('grid3x7');
      expect(model.stats.find((r) => r.label === 'Белок — % нормы в среднем')?.value).toMatch(/ %$/);
      expect(model.stats.find((r) => r.label === 'Жиры')?.value).toMatch(/ %$/);
      expect(VARIANTS_SRC).toContain('widget-bd-sheet__hero-track-bar');
      expect(CSS_SRC).toContain('.widget-bd-sheet__hero-track-bar');
    });

    it('вода — чипы, лист не закрывается по action kind', () => {
      const model = V4.buildBreakdownModel({ id: 'w', type: 'water', size: '1x1' });
      expect(model.waterChips).toBe(true);
      expect(model.action.kind).toBe('waterChips');
    });

    it('сон — горизонтальная лента 14 ночей, ось 21:00→09:00, риска среднего отбоя', () => {
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = d._formatDate(yesterday);
      d._getDay = () => ({
        date: todayIso,
        sleepHours: 6.2,
        sleepStart: '00:10',
        sleepEnd: '07:00'
      });
      d._getDayByDate = (iso) => {
        if (iso === todayIso) return d._getDay();
        if (iso === yesterdayIso) {
          return { date: iso, sleepHours: 7.1, sleepStart: '23:40', sleepEnd: '07:30' };
        }
        return null;
      };
      d._getProfile = () => ({ sleepHours: 7.5 });
      const model = V4.buildBreakdownModel({ id: 'sl', type: 'sleep', size: '1x1' });
      expect(model.chart?.kind).toBe('sleepStrip');
      expect(model.chart?.series?.length).toBe(14);
      expect(model.chart?.axisTicks).toEqual(['21:00', '00:00', '03:00', '06:00', '09:00']);
      expect(model.chart?.avgBedMin).toBeTruthy();
      expect(model.chartLabel).toBeNull();
      expect(model.insight).toMatch(/Ложитесь в среднем в \d{2}:\d{2}/);
      expect(model.stats.some((r) => r.label === 'Средняя длительность')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Норму набрали')).toBe(true);
      expect(model.action.kind).toBe('fixSleep');
    });

    it('вода — почасовой профиль месяца + сплайн сегодня', () => {
      const d = window.HEYS.Widgets.data;
      const todayIso = d._formatDate(new Date());
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = d._formatDate(yesterday);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysIso = d._formatDate(twoDaysAgo);
      const mkEntry = (hour, ml, baseIso) => {
        const ts = new Date(`${baseIso}T${String(hour).padStart(2, '0')}:15:00`).getTime();
        return { id: `w-${baseIso}-${hour}-${ml}`, ml, ts };
      };
      d._getDay = () => ({
        date: todayIso,
        waterMl: 1700,
        waterEntries: [
          mkEntry(7, 300, todayIso),
          mkEntry(10, 400, todayIso),
          mkEntry(14, 200, todayIso),
          mkEntry(18, 500, todayIso),
          mkEntry(20, 300, todayIso)
        ]
      });
      d._getDayByDate = (iso) => {
        if (iso === yesterdayIso) {
          return {
            date: iso,
            waterMl: 2800,
            waterEntries: [
              mkEntry(8, 700, iso),
              mkEntry(12, 900, iso),
              mkEntry(19, 1200, iso)
            ]
          };
        }
        if (iso === twoDaysIso) {
          return {
            date: iso,
            waterMl: 2600,
            waterEntries: [
              mkEntry(9, 800, iso),
              mkEntry(13, 600, iso),
              mkEntry(19, 1200, iso)
            ]
          };
        }
        return null;
      };
      d._getProfile = () => ({ waterGoalMl: 2700 });
      const model = V4.buildBreakdownModel({ id: 'w2', type: 'water', size: '2x1' });
      expect(model.chart?.kind).toBe('waterHourProfile');
      expect(model.chart?.monthAvg?.length).toBe(14);
      expect(model.chart?.todayCurve?.length).toBe(14);
      expect(typeof model.insight).toBe('string');
      expect(model.insight).toMatch(/Норму вы обычно набираете к \d{2}:\d{2}/);
      expect(model.stats.some((r) => r.label === 'Норма набрана')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Частый объём')).toBe(true);
      expect(model.heroUnit).toMatch(/из .+ л/);
      expect(VARIANTS_SRC).toContain("chart.kind === 'waterHourProfile'");
      expect(CSS_SRC).toContain('.widget-bd-sheet__water-profile');
    });

    it('вес — dual curve 30d, insight темпа, norm с куратором, разброс дня', () => {
      const d = window.HEYS.Widgets.data;
      const today = new Date();
      const todayIso = d._formatDate(today);
      const series = [];
      for (let i = 29; i >= 0; i -= 1) {
        const dt = new Date(today);
        dt.setDate(dt.getDate() - i);
        const iso = d._formatDate(dt);
        const weight = 84 - (29 - i) * 0.06;
        const smoothed = 84 - (29 - i) * 0.06;
        series.push({ date: iso, weight, hasWeight: true, smoothed });
      }
      window.HEYS.Widgets.WeightDynamicsV4 = {
        compute: () => ({ windowSeries: series, weeklyBars: [] })
      };
      d._getDay = () => ({ date: todayIso, weightMorning: series[series.length - 1].weight });
      d._getDayByDate = (iso) => {
        const row = series.find((w) => w.date === iso);
        return row ? { date: iso, weightMorning: row.weight } : null;
      };
      d._getProfile = () => ({ weightGoal: 78, weight: 84 });
      const model = V4.buildBreakdownModel({ id: 'wt', type: 'weight', size: '1x1' });
      expect(model.chart?.kind).toBe('weightDualCurve');
      expect(model.chart?.series?.length).toBe(30);
      expect(model.chartLabel).toBeNull();
      expect(model.insight).toMatch(/Темп [−-]?\d+[,.]\d+ кг в неделю — к цели в/i);
      expect(model.stats.some((r) => r.label === 'За 30 дней')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Замеров')).toBe(true);
      expect(model.stats.some((r) => r.label === 'Разброс дня')).toBe(true);
      expect(model.norm).toMatch(/Цель 78 кг — поставлена с куратором/);
      expect(model.norm).toMatch(/срок до/i);
      expect(model.action.kind).toBe('recordWeight');
      expect(VARIANTS_SRC).toContain("chart.kind === 'weightDualCurve'");
      expect(CSS_SRC).toContain('.widget-bd-sheet__weight-chart');
    });
  });
});
