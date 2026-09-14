/**
 * Столбики вида «Ритм дня» у плитки воды.
 *
 * Строки контракта home-widgets.v4 «Вода · Ритм дня · 06–11» называют шесть
 * столбиков разной высоты: пять залитых и последний низкий серый — провал.
 * Прежде плитка делила дневной итог поровну, и все залитые выходили одной
 * высоты: «ритм» не показывал ритма, хотя почасовые записи лежали рядом — их
 * уже читает большой график в разборе.
 *
 * Живьём такое не собрать: нужен день с глотками в разные часы и подъёмом в
 * известное время. Поэтому симуляция на настоящем исходнике.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const DATA_SRC = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');

/** Модуль данных плиток на голом окне: нам нужен только счётчик столбиков. */
function loadData() {
  window.HEYS = { Widgets: { emit: () => {} } };
  // eslint-disable-next-line no-eval
  eval(DATA_SRC);
  return window.HEYS.Widgets.data;
}

/** Метка времени сегодняшнего дня в заданный час. */
function at(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

const WAKE = 7 * 60; // подъём 7:00
const SPAN = 16 * 60; // до отбоя 23:00 — по 160 минут на столбик

afterEach(() => {
  delete window.HEYS;
});

describe('ритм дня у плитки воды', () => {
  it('столбиков шесть, как в строках контракта', () => {
    const data = loadData();
    const bins = data._buildWaterRhythmBins({
      day: null, drunk: 1700, wakeMinutes: WAKE, awakeSpan: SPAN, nowMinutes: 18 * 60, hoursSinceWater: 3,
    });
    expect(bins).toHaveLength(6);
  });

  it('высота столбика — сколько выпито в этот кусок дня, а не итог поровну', () => {
    const data = loadData();
    const day = {
      waterEntries: [
        { ml: 300, ts: at(7, 30) }, // первый кусок: 7:00–9:40
        { ml: 900, ts: at(12, 0) }, // второй: 9:40–12:20 — самый высокий
        { ml: 200, ts: at(12, 30) }, // третий: 12:20–15:00
        { ml: 500, ts: at(15, 30) }, // четвёртый
      ],
    };
    const bins = data._buildWaterRhythmBins({
      day, drunk: 1900, wakeMinutes: WAKE, awakeSpan: SPAN, nowMinutes: 18 * 60, hoursSinceWater: 3,
    });
    expect(bins).toEqual([300, 900, 200, 500, 0, 0]);
    // Ровная раскладка дала бы одинаковые числа — ради этого всё и делалось.
    expect(new Set(bins.filter((ml) => ml > 0)).size).toBeGreaterThan(1);
  });

  it('глоток до подъёма идёт в первый столбик, а не пропадает', () => {
    const data = loadData();
    const day = { waterEntries: [{ ml: 250, ts: at(6, 15) }] };
    const bins = data._buildWaterRhythmBins({
      day, drunk: 250, wakeMinutes: WAKE, awakeSpan: SPAN, nowMinutes: 9 * 60, hoursSinceWater: 1,
    });
    expect(bins[0]).toBe(250);
    expect(bins.reduce((sum, ml) => sum + ml, 0)).toBe(250);
  });

  it('поздний глоток не выпадает за последний столбик', () => {
    const data = loadData();
    const day = { waterEntries: [{ ml: 400, ts: at(23, 50) }] };
    const bins = data._buildWaterRhythmBins({
      day, drunk: 400, wakeMinutes: WAKE, awakeSpan: SPAN, nowMinutes: 23 * 60 + 55, hoursSinceWater: 0,
    });
    expect(bins).toHaveLength(6);
    expect(bins[5]).toBe(400);
  });

  it('дня без журнала — ровная раскладка остаётся запасным путём', () => {
    const data = loadData();
    const bins = data._buildWaterRhythmBins({
      day: { waterEntries: [] }, drunk: 1200, wakeMinutes: WAKE, awakeSpan: SPAN,
      nowMinutes: 18 * 60, hoursSinceWater: 2,
    });
    expect(bins).toHaveLength(6);
    expect(bins.reduce((sum, ml) => sum + ml, 0)).toBeCloseTo(1200, 5);
    // Провал в конце: последние столбики пустые.
    expect(bins[5]).toBe(0);
  });

  it('без времени подъёма столбики пустые, а не выдуманные', () => {
    const data = loadData();
    const bins = data._buildWaterRhythmBins({
      day: { waterEntries: [{ ml: 500, ts: at(10) }] },
      drunk: 500, wakeMinutes: null, awakeSpan: null, nowMinutes: 10 * 60, hoursSinceWater: 1,
    });
    expect(bins).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
