import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const statsSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_stats_v1.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-reports.css'),
  'utf8',
);
const shellSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_page_shell.js'),
  'utf8',
);

describe('Reports tab v4 structure', () => {
  it('exports ReportsTabV4 helpers with tiered layout markers', () => {
    expect(statsSource).toContain('function ReportsTabV4Top');
    expect(statsSource).toContain('function ReportsTabV4Bottom');
    expect(statsSource).toContain('function buildReportsPeriodMeta');
    expect(statsSource).toContain('reports-v4-hero');
    expect(statsSource).toContain('reports-v4-tier');
    expect(statsSource).toContain('Итог периода');
    expect(statsSource).toContain('Сон и самочувствие');
  });

  it('hides day-hero metrics on reports v4', () => {
    expect(statsSource).toContain("mobileSubTab === 'stats'");
    expect(statsSource).toContain('!useReportsV4 && React.createElement(\'div\', { className: \'metrics-cards\'');
    expect(statsSource).not.toMatch(/!useReportsV4 && React\.createElement\('span', null, '📊 СТАТИСТИКА'/);
  });

  it('requires at least 3 days for wellbeing averages', () => {
    expect(statsSource).toContain('sleepVals.length >= 3');
    expect(statsSource).toContain('moodVals.length >= 3');
    expect(statsSource).toContain('wellbeingVals.length >= 3');
    expect(statsSource).toContain('showWellbeingBlock');
  });

  it('places score tile in period summary tier, not legacy tail', () => {
    expect(statsSource).toContain('reports-v4-score-slot');
    expect(statsSource).toContain('!useReportsV4 && HEYS.CascadeCard?.HeysScoreTile');
  });

  it('stats block renders only on stats mobile subtab', () => {
    expect(shellSource).toMatch(/mobileSubTab === 'stats'\) && statsBlock/);
    expect(shellSource).not.toMatch(/mobileSubTab === 'stats' \|\| mobileSubTab === 'activity'\) && statsBlock/);
  });

  it('structure css is imported and uses v4 paint roles', () => {
    const mainCss = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
    expect(mainCss).toContain('733-ui-v4-reports.css');
    expect(cssSource).toContain('.reports-v4-hero');
    expect(cssSource).toContain('var(--v4-hero');
    expect(cssSource).toContain('var(--v4-act');
  });
});
