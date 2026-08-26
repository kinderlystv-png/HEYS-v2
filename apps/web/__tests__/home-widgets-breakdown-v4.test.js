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
  window.HEYS = {
    Widgets: {
      data: {},
      WeightDynamicsV4: { compute: () => ({ windowSeries: [], weeklyBars: [] }) },
      formatRuNumber: (n, o) => Number(n).toLocaleString('ru-RU', o)
    },
    longPress: { MS: 350 }
  };
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

    it('калории — медиана и norm, insight из истории', () => {
      const model = V4.buildBreakdownModel({ id: 'c', type: 'calories', size: '2x2' });
      expect(model.stats.some((r) => r.label.includes('Типичный') || r.label.includes('Разброс'))).toBe(true);
      expect(model.norm).toMatch(/Норма/);
      expect(model.action.kind).toBe('addMeal');
      expect(model.insight == null || model.insight.includes('Обычно к этому часу')).toBe(true);
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

    it('БЖУ — heroTracks три дорожки', () => {
      const model = V4.buildBreakdownModel({ id: 'm', type: 'macros', size: '3x2' });
      expect(model.heroTracks?.length).toBe(3);
    });

    it('вода — чипы, лист не закрывается по action kind', () => {
      const model = V4.buildBreakdownModel({ id: 'w', type: 'water', size: '1x1' });
      expect(model.waterChips).toBe(true);
      expect(model.action.kind).toBe('waterChips');
    });
  });
});
