// activity-calendar-horizon.test.js — календарь зарядки после сведения с
// канвасом tab-activity.v4.dc.html (строки 16, 19, 20, 23, кадр «Календарь
// зарядки»).
//
// Три вещи, которые нельзя проверить глазами на одном дне: горизонт от первой
// отметки, знаменатель счёта и то, что листание месяцев вообще достижимо в
// раскладке вкладки.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

function loadCalendar() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_morning_activation_calendar_v1.js'), 'utf8'));
  return globalThis.HEYS.morningActivationCalendar;
}

const TODAY = '2026-08-31';

function daysBack(n, from = TODAY) {
  const d = new Date(from + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Дни с зарядкой задаются набором смещений назад от сегодня. */
function readerFor(doneOffsets) {
  const done = new Set(doneOffsets.map((n) => daysBack(n)));
  return (dateKey) => (done.has(dateKey)
    ? { date: dateKey, morningActivation: { status: 'done' } }
    : {});
}

afterEach(() => {
  cleanup();
  delete globalThis.HEYS;
  if (globalThis.window) delete globalThis.window.HEYS;
});

describe('Горизонт привычки', () => {
  it('дни до первой отметки серые «не вели», а не красные', () => {
    const cal = loadCalendar();
    // Привычку начали четыре дня назад — до этого записей нет.
    const data = cal.buildMorningActivationCalendarData(TODAY, 'last_28_days', readerFor([1, 2, 3, 4]));
    const cells = data.grid.filter((c) => !c.isEmpty);
    const none = cells.filter((c) => c.status === 'none');
    const missed = cells.filter((c) => c.status === 'missed');
    expect(none.length).toBeGreaterThan(20);
    expect(missed.length).toBe(0);
  });

  it('знаменатель считает дни от первой отметки, а не длину окна', () => {
    const cal = loadCalendar();
    const data = cal.buildMorningActivationCalendarData(TODAY, 'last_28_days', readerFor([1, 2, 3, 4]));
    // Четыре дня привычки + сегодня, которое ещё не решено.
    expect(data.trackedCount).toBeLessThan(28);
    expect(data.doneCount).toBe(4);
  });

  it('запись раньше окна снимает горизонт — считается всё окно', () => {
    const cal = loadCalendar();
    const data = cal.buildMorningActivationCalendarData(TODAY, 'last_28_days', readerFor([1, 40]));
    expect(data.horizonKey).toBeNull();
    const cells = data.grid.filter((c) => !c.isEmpty);
    expect(cells.some((c) => c.status === 'missed')).toBe(true);
  });

  it('записей нет вовсе — красных точек нет ни одной', () => {
    const cal = loadCalendar();
    const data = cal.buildMorningActivationCalendarData(TODAY, 'last_28_days', () => ({}));
    const cells = data.grid.filter((c) => !c.isEmpty);
    expect(cells.every((c) => c.status === 'none' || c.status === null)).toBe(true);
    expect(data.doneCount).toBe(0);
  });

  it('замена тренировкой считается сделанным днём', () => {
    const cal = loadCalendar();
    const reader = (dateKey) => (dateKey === daysBack(2)
      ? { date: dateKey, trainings: [{ source: 'morning_activation_replacement' }] }
      : (dateKey === daysBack(3) ? { date: dateKey, morningActivation: { status: 'done' } } : {}));
    const data = cal.buildMorningActivationCalendarData(TODAY, 'last_28_days', reader);
    expect(data.doneCount).toBe(2);
    expect(data.replacementCount).toBe(1);
  });
});

describe('Раскладка вкладки: легенда и листание', () => {
  function renderV4(reader) {
    const cal = loadCalendar();
    render(React.createElement(cal.MorningActivationHabitCalendar, {
      dateKey: TODAY,
      readDayData: reader,
      headingTitle: '⚡ Календарь зарядки',
      layoutClass: 'ma-habit-cal--activity-v4 ma-habit-cal--activity',
    }));
  }

  it('легенда подписывает все четыре тона', () => {
    renderV4(readerFor([1, 2]));
    for (const word of ['сделана', 'тренировкой', 'пропуск', 'не вели']) {
      expect(screen.getByText(word)).toBeTruthy();
    }
  });

  it('счёт в заголовке — «сделано из веденных»', () => {
    renderV4(readerFor([1, 2, 3, 4]));
    expect(screen.getByText(/^Зарядка · 4 из \d+$/)).toBeTruthy();
  });

  it('режим «Месяц» даёт подпись месяца и стрелки листания', () => {
    renderV4(readerFor([1]));
    fireEvent.click(screen.getByText('Месяц'));
    expect(screen.getByLabelText('Предыдущий месяц')).toBeTruthy();
    expect(screen.getByLabelText('Следующий месяц')).toBeTruthy();
    // Кадр просит «Август 2026»: без « г.» и с прописной.
    expect(document.querySelector('.ma-habit-cal-period-label--month').textContent)
      .toMatch(/^[А-Я][а-я]+ 2026$/);
  });

  it('стрелка листает месяц назад', () => {
    renderV4(readerFor([1]));
    fireEvent.click(screen.getByText('Месяц'));
    const before = document.querySelector('.ma-habit-cal-period-label--month').textContent;
    fireEvent.click(screen.getByLabelText('Предыдущий месяц'));
    const after = document.querySelector('.ma-habit-cal-period-label--month').textContent;
    expect(after).not.toBe(before);
  });

  it('в режиме 28 дней строки листания нет — листать нечего', () => {
    renderV4(readerFor([1]));
    expect(document.querySelector('.ma-habit-cal-period--month')).toBeNull();
  });
});
