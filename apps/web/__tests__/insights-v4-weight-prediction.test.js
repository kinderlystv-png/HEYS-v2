import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const statsSource = fs.readFileSync(path.join(webDir, 'insights/pi_stats.js'), 'utf8');
const advancedSource = fs.readFileSync(path.join(webDir, 'insights/pi_advanced.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(webDir, 'insights/pi_ui_dashboard.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(webDir, 'styles/modules/734-ui-v4-insights.css'), 'utf8');

describe('Инсайты v4 · прогноз веса', () => {
  beforeEach(() => {
    window.React = React;
    window.HEYS = { InsightsPI: {}, dev: { log: () => {}, warn: () => {} } };
    // eslint-disable-next-line no-eval
    (0, eval)(statsSource);
    // eslint-disable-next-line no-eval
    (0, eval)(advancedSource);
    // eslint-disable-next-line no-eval
    (0, eval)(dashboardSource);
  });

  afterEach(() => {
    cleanup();
    delete window.React;
    delete window.HEYS;
    delete window.piAdvanced;
    delete window.piUIDashboard;
  });

  it('владелец прогноза возвращает фактический ряд из фиксированного окна', () => {
    const days = Array.from({ length: 8 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      weightMorning: 92 - index * 0.2,
    }));
    const prediction = window.HEYS.InsightsPI.advanced.predictWeight(days, {});

    expect(prediction.available).toBe(true);
    expect(prediction.series).toHaveLength(7);
    expect(prediction.series[0]).toEqual({ date: '2026-08-02', weight: 91.8 });
    expect(prediction.series.at(-1)).toEqual({ date: '2026-08-08', weight: 90.6 });
    expect(prediction.monthlyChange).toBeCloseTo(-6, 6);
  });

  it('рендерит v4-карточку с реальными точками, недельным числом и месячным темпом', () => {
    const WeightPrediction = window.HEYS.InsightsPI.uiDashboard.WeightPrediction;
    const view = render(React.createElement(WeightPrediction, {
      variant: 'v4',
      prediction: {
        available: true,
        projectedWeight: 90.7,
        weeklyChange: -0.42,
        monthlyChange: -1.8,
        series: [91.2, 91, 91.1, 90.9, 90.8, 90.9].map((weight, index) => ({
          date: `2026-08-${index + 1}`,
          weight,
        })),
      },
    }));

    expect(view.getByText('Через неделю')).toBeTruthy();
    expect(view.getByText('90,7 кг')).toBeTruthy();
    expect(view.getByText('такими темпами −1,8 кг в месяц')).toBeTruthy();
    const svg = view.getByRole('img');
    expect(svg.getAttribute('viewBox')).toBe('0 0 292 66');
    expect(svg.querySelectorAll('polyline')).toHaveLength(2);
    expect(svg.querySelector('circle').getAttribute('r')).toBe('4.5');
    expect(svg.querySelector('polyline').getAttribute('points')).not.toContain('NaN');
  });

  it('fail-closed не рисует v4-прогноз без фактического ряда', () => {
    const WeightPrediction = window.HEYS.InsightsPI.uiDashboard.WeightPrediction;
    const view = render(React.createElement(WeightPrediction, {
      variant: 'v4',
      prediction: { available: true, projectedWeight: 90.7, weeklyChange: -0.42, monthlyChange: -1.8 },
    }));
    expect(view.container.innerHTML).toBe('');
  });

  it('fail-closed не подменяет отсутствующий месячный темп нулём', () => {
    const WeightPrediction = window.HEYS.InsightsPI.uiDashboard.WeightPrediction;
    const view = render(React.createElement(WeightPrediction, {
      variant: 'v4',
      prediction: {
        available: true,
        projectedWeight: 90.7,
        weeklyChange: 0,
        series: [91.2, 91].map((weight, index) => ({ date: `2026-08-0${index + 1}`, weight })),
      },
    }));
    expect(view.container.innerHTML).toBe('');
  });

  it('фиксирует геометрию и роли canvas без жёстко прошитых измерений', () => {
    expect(cssSource).toContain('.insights-v4-weight__tier');
    expect(cssSource).toContain('margin-top: 8px');
    expect(cssSource).toContain('.insights-v4-weight__spark');
    expect(cssSource).toContain('height: 66px');
    expect(cssSource).toContain('stroke-dasharray: 4 4');
    expect(dashboardSource).toContain('240 * (point.time - firstTime) / observedDuration');
    expect(dashboardSource).not.toContain("'такими темпами −1,8 кг в месяц'");
  });
});
