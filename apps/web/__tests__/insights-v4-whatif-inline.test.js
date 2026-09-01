import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const engineSource = read('../insights/pi_whatif.js');
const uiSource = read('../insights/pi_ui_whatif_scenarios.js');
const dashboardSource = read('../insights/pi_ui_dashboard.js').replace(/\r\n/g, '\n');
const cssSource = read('../styles/modules/734-ui-v4-insights.css');

function loadEngine() {
  // The production file is an IIFE without imports. `globalThis.window` is
  // absent in the node test environment, so it binds to globalThis exactly as
  // it does to window in the browser.
  Function(engineSource)();
  return globalThis.HEYS.InsightsPI.whatif;
}

describe('Insights v4 inline «Что если»', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    globalThis.HEYS = { InsightsPI: {} };
  });

  afterEach(() => cleanup());

  it('uses supplied observed patterns and never fills the pair with moderate defaults', () => {
    const whatif = loadEngine();
    const days = Array.from({ length: 14 }, (_, index) => ({ date: `2026-08-${index + 1}` }));
    const result = whatif.simulate(
      whatif.ACTION_TYPES.ADD_PROTEIN,
      { proteinGrams: 30, mealIndex: 0 },
      days,
      {},
      {},
      {
        patterns: [
          { pattern: 'protein_satiety', available: true, score: 98 },
          { pattern: 'meal_quality', available: true, score: 52 },
          { pattern: 'nutrition_quality', available: false, score: 71 },
        ],
      },
    );

    expect(result.available).toBe(true);
    expect(result.baseline).toEqual({ protein_satiety: 98, meal_quality: 52 });
    expect(result.predicted.protein_satiety).toBe(100);
    expect(result.impact.map((item) => item.pattern)).toEqual(
      expect.arrayContaining(['protein_satiety', 'meal_quality']),
    );
    expect(result.impact.some((item) => item.pattern === 'nutrition_quality')).toBe(false);
    expect(result.baseline).not.toHaveProperty('fiber_regularity');
  });

  it('fails closed when the selected scenario has no confirmed pattern', () => {
    const whatif = loadEngine();
    const days = Array.from({ length: 14 }, (_, index) => ({ date: `2026-08-${index + 1}` }));
    const result = whatif.simulate(
      whatif.ACTION_TYPES.INCREASE_SLEEP,
      { targetSleepHours: 8 },
      days,
      {},
      {},
      { patterns: [{ pattern: 'meal_quality', available: true, score: 62 }] },
    );

    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('scenario_patterns_unavailable');
    expect(result.error).toContain('нет подтверждённых паттернов');
  });

  it('mounts the inline owner in «Подробно», not the legacy card/modal pair', () => {
    const detail = dashboardSource.slice(
      dashboardSource.indexOf('if (useInsightsV4 && showInsightsDetail)'),
      dashboardSource.indexOf('if (useInsightsV4) {\n        return h(InsightsErrorBoundary'),
    );

    expect(detail).toContain('WhatIfScenariosInline');
    expect(detail).toContain('patterns: insights.patterns');
    expect(detail).toContain('currentScore: insights.healthScore?.total');
    expect(detail).not.toContain('WhatIfScenariosCard');
    expect(detail).not.toContain('WhatIfScenariosPanel');
  });

  it('keeps the canvas structure and recomputes the pair through the score owner', () => {
    expect(uiSource).toContain('function WhatIfScenariosInline');
    expect(uiSource).toContain('PredictiveInsights?.calculateHealthScore');
    expect(uiSource).toContain("{ patterns, requireObserved: true }");
    expect(uiSource).toContain("'Оценка дня'");
    expect(uiSource).toContain('оценку дня из паттернов, а не HEYS Score');
    expect(uiSource).toContain("reasonCode: 'minimum_history'");
    expect(uiSource).not.toMatch(/scoreChange:\s*\{[^}]*72/s);
    expect(uiSource).not.toMatch(/scoreChange:\s*\{[^}]*75/s);
  });

  it('renders a real selectable scenario with one parameter and a live score pair', () => {
    const whatif = loadEngine();
    const patterns = [
      { pattern: 'protein_satiety', available: true, score: 50 },
      { pattern: 'meal_quality', available: true, score: 60 },
      { pattern: 'protein_distribution', available: true, score: 55 },
      { pattern: 'nutrition_quality', available: true, score: 65 },
      { pattern: 'training_recovery', available: true, score: 58 },
      { pattern: 'nutrient_density', available: true, score: 62 },
    ];
    globalThis.HEYS.InsightsPI.whatif = whatif;
    globalThis.HEYS.InsightsPI.calculations = {
      getDaysData: () => Array.from({ length: 14 }, (_, index) => ({ date: `2026-08-${index + 1}` })),
    };
    globalThis.HEYS.PredictiveInsights = {
      calculateHealthScore: (items) => ({
        total: Math.round(
          items.filter((item) => item.available).reduce((sum, item) => sum + item.score, 0)
          / items.filter((item) => item.available).length,
        ),
      }),
    };
    globalThis.window.React = React;
    Function(uiSource)();

    const Inline = globalThis.HEYS.InsightsPI.WhatIfScenariosInline;
    const view = render(React.createElement(Inline, {
      lsGet: () => ({}),
      profile: {},
      pIndex: {},
      patterns,
      currentScore: 58,
      historyDays: 14,
    }));
    const section = view.container.querySelector('.insights-v4-whatif__inline');
    const scoped = within(section);

    expect(scoped.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Питание', 'Тайминг', 'Сон', 'Активность',
    ]);
    expect(scoped.getByText('Добавить белок')).toBeTruthy();
    expect(scoped.getAllByRole('button').map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Снизить углеводы', 'Клетчатка +10 г']),
    );
    expect(scoped.getByText('Оценка дня')).toBeTruthy();
    expect(section.querySelectorAll('.insights-v4-whatif__parameter-value')).toHaveLength(1);
    expect(section.querySelector('.insights-v4-whatif__parameter-fill').style.width).toBe('55%');

    fireEvent.click(scoped.getByRole('tab', { name: 'Сон' }));
    expect(scoped.getByText('Увеличить сон')).toBeTruthy();
    expect(scoped.getByText('Оценка дня')).toBeTruthy();
    expect(section.querySelectorAll('.insights-v4-whatif__parameter-value')).toHaveLength(1);
    expect(scoped.queryAllByRole('slider')).toHaveLength(0);
  });

  it('renders all ten engine-backed actions because canvas does not identify an exclusion', () => {
    const actionKeys = [
      'add_protein', 'add_fiber', 'reduce_carbs',
      'increase_meal_gap', 'shift_meal_time', 'skip_late_meal',
      'increase_sleep', 'adjust_bedtime',
      'add_training', 'increase_steps',
    ];
    actionKeys.forEach((key) => expect(uiSource).toContain(`${key}: {`));
    expect(actionKeys).toHaveLength(10);
  });

  it('locks the live frame geometry to shared chips 44 and result numbers 22/800', () => {
    expect(cssSource).toContain('.insights-v4-whatif__inline');
    expect(cssSource).toMatch(/\.insights-v4-whatif__head\s*\{[\s\S]*?padding:\s*16px 18px 0/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__scroll\s*\{[\s\S]*?padding:\s*6px 18px 16px/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__chip\s*\{[\s\S]*?min-height:\s*44px/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__chip\.is-active\s*\{[\s\S]*?var\(--v4-act/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__scenario\s*\{[\s\S]*?padding:\s*18px[\s\S]*?border-radius:\s*22px/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__parameter-track\s*\{[\s\S]*?height:\s*6px[\s\S]*?border-radius:\s*999px/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__parameter-fill\s*\{[\s\S]*?height:\s*6px[\s\S]*?border-radius:\s*999px/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__score-before,[\s\S]*?font:\s*800 22px\/1/);
    expect(cssSource).toMatch(/\.insights-v4-whatif__explanation\s*\{[\s\S]*?font:\s*500 11px\/1\.5/);
  });
});
