import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, '../insights/pi_ui_dashboard.js'),
  'utf8',
);

describe('Insights tab v4 structure', () => {
  it('exports v4 helpers and keeps CascadeInsightsSlot listener pattern', () => {
    expect(dashboardSource).toContain('function CascadeInsightsSlot');
    expect(dashboardSource).toContain("addEventListener('heys:cascade-ready'");
    expect(dashboardSource).toContain("addEventListener('heys:postboot-lazy-ready'");
    expect(dashboardSource).toContain('function InsightsV4Header');
    expect(dashboardSource).toContain('function InsightsTodayHero');
    expect(dashboardSource).toContain('function InsightsV4Attention');
    expect(dashboardSource).toContain('function InsightsV4Patterns');
    expect(dashboardSource).toContain('_test:');
  });

  it('uses curator-first screen order and v4 title', () => {
    expect(dashboardSource).toContain("className: 'insights-tab insights-v4'");
    expect(dashboardSource).toContain("insights-v4-meta__title' }, 'Инсайты'");
    expect(dashboardSource).toContain('insights-v4-hero');
    expect(dashboardSource).toContain('Стоит внимания');
    expect(dashboardSource).toContain('Что заметили');
    expect(dashboardSource).toContain('insights-v4-detail-link');
  });

  it('lifts PriorityActions to hero and v4 main path avoids archived rings', () => {
    expect(dashboardSource).toContain('variant: \'v4\'');
    expect(dashboardSource).toContain('if (useInsightsV4 && showInsightsDetail)');
    const v4MainStart = dashboardSource.indexOf('if (useInsightsV4) {\n        return h(InsightsErrorBoundary');
    const legacySectionStart = dashboardSource.indexOf('// Определяем какие секции показывать');
    const v4MainBlock = dashboardSource.slice(v4MainStart, legacySectionStart);
    expect(v4MainBlock).toContain('h(CascadeInsightsSlot');
    expect(v4MainBlock).not.toContain('TotalHealthRing');
    expect(v4MainBlock).not.toContain('HealthRingsGrid');
  });

  it('does not mount confidence footer or trend score ring on v4 main return', () => {
    const v4Block = dashboardSource.slice(
      dashboardSource.indexOf('if (useInsightsV4) {'),
      dashboardSource.indexOf('// Определяем какие секции показывать'),
    );
    expect(v4Block).not.toContain('insights-tab__confidence');
    expect(v4Block).not.toContain('TotalHealthRing');
    expect(v4Block).not.toContain('HealthRingsGrid');
    expect(v4Block).not.toContain('WhatIfScenariosCard');
    expect(v4Block).not.toContain('MetabolicQuickStatus');
  });

  it('detail layer includes weight forecast disclaimer and data completeness', () => {
    expect(dashboardSource).toContain('insights-v4--detail');
    expect(dashboardSource).toContain('Прогноз веса');
    expect(dashboardSource).toContain('insights-v4-detail__disclaimer');
    expect(dashboardSource).toContain('Полнота данных');
  });

  it('period pills use 7/14/30 days', () => {
    expect(dashboardSource).toContain('INSIGHTS_V4_PERIODS = [7, 14, 30]');
    expect(dashboardSource).toContain('insights-v4-period-pill');
  });
});
