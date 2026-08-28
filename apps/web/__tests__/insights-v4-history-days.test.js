// Счётчик истории Инсайтов v4 не режется окном чипа.
// Баг до 2026-08-29: шапка и разблокировка «30д» брали daysWithData из
// analyze(daysBack=окно чипа), поэтому при окне 7д счётчик не мог превысить 7,
// а чип «30д» (порог daysWithData >= 30) был заблокирован навсегда.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(webDir, rel), 'utf8');

const calculationsSrc = read('insights/pi_calculations.js');
const dashboardSrc = read('insights/pi_ui_dashboard.js');

function isoDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

describe('insights v4 history days counter', () => {
  beforeEach(() => {
    window.React = React;
    window.HEYS = { dev: { log: () => { }, warn: () => { } } };
    // eslint-disable-next-line no-eval
    (0, eval)(calculationsSrc);
    // eslint-disable-next-line no-eval
    (0, eval)(dashboardSrc);
  });

  afterEach(() => {
    delete window.React;
    delete window.HEYS;
    delete window.piCalculations;
    delete window.piUIDashboard;
  });

  it('считает дни по всей 30-дневной истории независимо от окна чипа', () => {
    const counter = window.HEYS.InsightsPI.uiDashboard._test.countHistoryDaysWithData;
    expect(typeof counter).toBe('function');

    // 18 заполненных дней из последних 30 — больше любого окна 7/14
    const store = {};
    for (let i = 0; i < 18; i++) {
      store[`heys_dayv2_${isoDaysAgo(i)}`] = { meals: [{ time: '12:00' }] };
    }
    const lsGet = (key, fallback) => (key in store ? store[key] : fallback ?? null);

    expect(counter(lsGet)).toBe(18);
  });

  it('при полных 30 днях счётчик достигает порога разблокировки «30д»', () => {
    const counter = window.HEYS.InsightsPI.uiDashboard._test.countHistoryDaysWithData;
    const store = {};
    for (let i = 0; i < 30; i++) {
      store[`heys_dayv2_${isoDaysAgo(i)}`] = { meals: [] , weightMorning: 90 };
    }
    const lsGet = (key, fallback) => (key in store ? store[key] : fallback ?? null);
    expect(counter(lsGet)).toBe(30);
  });

  it('пустая история и отсутствие calculations не роняют счётчик', () => {
    const counter = window.HEYS.InsightsPI.uiDashboard._test.countHistoryDaysWithData;
    expect(counter(() => null)).toBe(0);
    const saved = window.HEYS.InsightsPI.calculations;
    delete window.HEYS.InsightsPI.calculations;
    expect(counter(() => null)).toBe(0);
    window.HEYS.InsightsPI.calculations = saved;
  });

  it('оба v4-пути передают в шапку общий счётчик, а не оконный', () => {
    // Шапка (и её проверка has30Days) должна получать historyDaysWithData.
    const headerCalls = dashboardSrc.match(/h\(InsightsV4Header, \{[^}]+\}/g) || [];
    expect(headerCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of headerCalls) {
      expect(call).toContain('daysWithData: historyDaysWithData');
    }
    // Оконный счётчик остаётся у паттернов («Что заметили») — они реально
    // считаются на выбранном окне.
    expect(dashboardSrc).toMatch(/InsightsV4Patterns, \{[^}]*daysWithData: insightsDaysWithData/s);
  });

  it('демо-баннер обещает порог экрана (7 дней), а не 3', () => {
    expect(dashboardSrc).not.toContain('реальная статистика появится через 3 дня');
    expect(dashboardSrc).toContain('после 7 дней дневника');
  });
});
