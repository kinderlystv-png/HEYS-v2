import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// HEYS Score: разложение current (сырой CRS тренда) на четыре группы факторов
// для разбора по тапу на плитке Отчётов. См. docs/implementation/
// UI_V4_SPEC_2026-08-09.md, «Вклады в разборе Score» — жёсткое требование:
// строки в сумме дают ровно current, включая случай обрезки потолком.

const originalHEYS = window.HEYS;

const modulePath = path.resolve(__dirname, '../heys_cascade_card_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadCascadeCard() {
  // eslint-disable-next-line no-eval
  eval(moduleSource);
  return window.HEYS.CascadeCard;
}

function dateOffset(todayStr, offset) {
  const d = new Date(todayStr + 'T12:00:00');
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

const TODAY = '2026-08-09';

describe('HEYS.CascadeCard.getCrsRawTrendBreakdown', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
    // Модуль на загрузке оборачивает свою карточку в React.memo — расчётной
    // части теста React не нужен, достаточно минимальной заглушки.
    window.React = {
      memo: (c) => c,
      createElement: () => null,
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useRef: (v) => ({ current: v }),
    };
  });

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
    delete window.React;
  });

  it('без day-объектов (только dcsHistory) — честный fallback: равные доли, сумма равна current', () => {
    const CascadeCard = loadCascadeCard();
    const dcsHistory = {};
    for (let i = 1; i <= 29; i++) dcsHistory[dateOffset(TODAY, i)] = 0.3;

    const result = CascadeCard.getCrsRawTrendBreakdown('c1', {
      dcsHistory,
      prevDays: [],
      todayDate: TODAY,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.groups).toHaveLength(4);
    const sum = result.groups.reduce((s, g) => s + g.value, 0);
    expect(sum).toBeCloseTo(result.current, 3);
    result.groups.forEach((g) => expect(g.value).toBeCloseTo(result.current / 4, 3));
  });

  it('с day-данными — сумма долей равна current, доминирует единственный активный фактор (сон)', () => {
    const CascadeCard = loadCascadeCard();
    const sleepOnlyDay = { sleepStart: '22:00', sleepHours: 8 };

    const dcsHistory = {};
    const prevDays = [];
    for (let i = 1; i <= 30; i++) {
      dcsHistory[dateOffset(TODAY, i)] = 0.35;
      prevDays.push(sleepOnlyDay);
    }

    const result = CascadeCard.getCrsRawTrendBreakdown('c2', {
      dcsHistory,
      prevDays,
      todayDate: TODAY,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.decomposedDays).toBeGreaterThan(0);

    const sum = result.groups.reduce((s, g) => s + g.value, 0);
    expect(sum).toBeCloseTo(result.current, 3);

    const byKey = Object.fromEntries(result.groups.map((g) => [g.key, g.value]));
    // Единственный ненулевой вход во всех днях истории — сон (отбой 22:00 + 8ч).
    expect(byKey.sleep).toBeGreaterThan(byKey.nutrition);
    expect(byKey.sleep).toBeGreaterThan(byKey.activity);
    expect(byKey.sleep).toBeGreaterThan(byKey.tracking);
  });

  it('сумма долей равна current и в случае обрезки потолком', () => {
    const CascadeCard = loadCascadeCard();
    const sleepOnlyDay = { sleepStart: '22:00', sleepHours: 8 };

    const dcsHistory = {};
    const prevDays = [];
    for (let i = 1; i <= 30; i++) {
      dcsHistory[dateOffset(TODAY, i)] = 1; // максимум допустимого DCS — до клампа потолком EMA даёт 1
      prevDays.push(sleepOnlyDay);
    }

    const result = CascadeCard.getCrsRawTrendBreakdown('c3', {
      dcsHistory,
      prevDays,
      todayDate: TODAY,
    });

    // current обрезан персональным потолком: без обрезки взвешенное среднее
    // DCS=1 по всем дням дало бы ровно 1.
    expect(result.current).toBeLessThan(1);
    expect(result.usedFallback).toBe(false);
    const sum = result.groups.reduce((s, g) => s + g.value, 0);
    expect(sum).toBeCloseTo(result.current, 3);
  });

  it('current вообще без данных (нет ни dcsHistory, ни prevDays) — четыре нулевых строки, сумма 0', () => {
    const CascadeCard = loadCascadeCard();
    const result = CascadeCard.getCrsRawTrendBreakdown('c4', {
      dcsHistory: {},
      prevDays: [],
      todayDate: TODAY,
    });

    expect(result.current).toBe(0);
    expect(result.usedFallback).toBe(true);
    const sum = result.groups.reduce((s, g) => s + g.value, 0);
    expect(sum).toBeCloseTo(0, 6);
  });
});

describe('HEYS.CascadeCard.formatHeysScoreDelta14', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
    window.React = {
      memo: (c) => c,
      createElement: () => null,
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useRef: (v) => ({ current: v }),
    };
  });

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
    delete window.React;
  });

  // «Фразы-прогнозы считаются из темпа или не показываются» — фраза обязана
  // быть чистой функцией фактического delta14, а не фиксированным текстом.
  it('строит фразу из фактического delta14, знак и число совпадают с входом', () => {
    const CascadeCard = loadCascadeCard();
    expect(CascadeCard.formatHeysScoreDelta14(0.40)).toBe('+40 за 2 недели');
    expect(CascadeCard.formatHeysScoreDelta14(-0.12)).toBe('-12 за 2 недели');
    expect(CascadeCard.formatHeysScoreDelta14(0.003)).toBe('Без изменений за 2 недели');
  });

  it('нет данных за 14 дней (delta14 = null) — фраза не показывается', () => {
    const CascadeCard = loadCascadeCard();
    expect(CascadeCard.formatHeysScoreDelta14(null)).toBeNull();
    expect(CascadeCard.formatHeysScoreDelta14(undefined)).toBeNull();
  });
});
