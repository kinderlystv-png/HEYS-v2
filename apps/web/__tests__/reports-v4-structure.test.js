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
  path.resolve(__dirname, '../heys_app_shell_v1.js'),
  'utf8',
);
const shellSourceLegacy = fs.readFileSync(
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

  // Контракт reports-insights.v4 «Дисциплина» и «мало данных» (2026-08-29).
  it('дисциплина: матрица без суммы между итогом и динамикой', () => {
    expect(statsSource).toContain('function ReportsV4Discipline');
    expect(statsSource).toContain('HEYS.DisciplineMatrix.compute');
    expect(statsSource).toContain('дней в норме · Δ к прошлому периоду');
    expect(statsSource).toContain('Сводной суммы у матрицы нет — дисциплину одним числом говорит Score выше.');
    expect(statsSource).toContain("'не ведётся'");
    // Дисциплина стоит до тира «Динамика»
    const top = statsSource.slice(
      statsSource.indexOf('function ReportsTabV4Top'),
      statsSource.indexOf('function ReportsV4Discipline'),
    );
    expect(top.indexOf('ReportsV4Discipline(')).toBeLessThan(top.indexOf("'Динамика'"));
  });

  it('заголовки следуют периоду, заглушка до 7 дней скрывает баланс и матрицу', () => {
    expect(statsSource).toContain("chartPeriod === 30 ? 'месяц'");
    expect(statsSource).toContain("'Баланс за ' + (periodMeta.periodWord");
    expect(statsSource).toContain('Итоги появятся с 7 дней');
    expect(statsSource).toContain('(periodMeta.historyDays || 0) < 7');
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

  it('stats block renders only on active stats mobile subtab', () => {
    expect(shellSourceLegacy).toMatch(/mobileSubTab === 'stats'\) && isTabActive && statsBlock/);
    expect(shellSourceLegacy).not.toMatch(/mobileSubTab === 'stats' \|\| mobileSubTab === 'activity'\) && statsBlock/);
  });

  it('period analytics tabs hide shell title and day calendar', () => {
    expect(shellSource).toContain('isPeriodAnalyticsTab = tab === \'stats\' || tab === \'insights\'');
    expect(shellSource).toContain('const showWidgetsDateRow = tab === \'widgets\'');
    // Капсула даты остаётся и в расстановке, но дни там не листаются
    // (канвас home-widgets v4, строка 61).
    expect(shellSource).toContain('const dateRowLocked = tab === \'widgets\' && !!widgetsEditMode');
    expect(shellSource).toMatch(/showDateRow = !isPeriodAnalyticsTab[\s\S]*showWidgetsDateRow[\s\S]*window\.HEYS\.DatePicker/);
    expect(shellSource).toMatch(/showHdrBottom = !isRpcMode[\s\S]*tab !== 'widgets' \|\| widgetsEditMode/);
    expect(statsSource).toContain('reports-v4-meta__title');
  });

  it('structure css is imported and uses v4 paint roles', () => {
    const mainCss = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
    expect(mainCss).toContain('733-ui-v4-reports.css');
    expect(cssSource).toContain('.reports-v4-hero');
    expect(cssSource).toContain('var(--v4-hero');
    expect(cssSource).toContain('var(--v4-act');
  });
});
