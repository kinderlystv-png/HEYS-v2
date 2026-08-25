// Одна граница суток для геймификации и серии, во всех поясах.
//
// Продуктовое правило дня живёт в heys_day_utils.js: NIGHT_HOUR_THRESHOLD = 3,
// приём в 00:00–02:59 пишется во вчерашний день (getEffectiveDate), а
// «эффективное сегодня» отдаёт HEYS.dayUtils.todayISO().
//
// Геймификация раньше брала день из new Date().toISOString().slice(0,10), а
// серия — из локальной полуночи (fmtDate). В UTC+3 первое совпадает с правилом
// по совпадению (сдвиг пояса = порогу 3 ч), поэтому в Москве расхождения не
// видно — оно вылезает в любом другом поясе. Тест гоняет четыре пояса, чтобы
// «совпало в Москве» больше не считалось доказательством.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const DAY_UTILS_SRC = read('heys_day_utils.js');
const GAMIFICATION_SRC = read('heys_gamification_v1.js');
const CALENDAR_METRICS_SRC = read('heys_day_calendar_metrics.js');

// Пояса подобраны так, чтобы порвать оба прежних способа: UTC (нулевой сдвиг),
// Москва (UTC+3 — единственная, где старый код был прав), Нью-Йорк (западнее
// UTC) и Владивосток (UTC+10, дальше порога).
const ZONES = ['UTC', 'Europe/Moscow', 'America/New_York', 'Asia/Vladivostok'];

// 2026-08-25, четыре часа вокруг обеих границ: полуночь и 03:00.
const MOMENTS = [
  { hour: 23, minute: 30, expected: '2026-08-25', why: 'до полуночи — сегодня' },
  { hour: 0, minute: 30, expected: '2026-08-24', why: 'после полуночи — ещё вчера' },
  { hour: 2, minute: 30, expected: '2026-08-24', why: 'за полчаса до 03:00 — ещё вчера' },
  { hour: 3, minute: 30, expected: '2026-08-25', why: 'после 03:00 — уже сегодня' },
];

let tzBefore;

/** Ставит пояс и системное время на локальные стенные часы этого пояса. */
function setClock(tz, hour, minute) {
  // V8 перечитывает пояс при присваивании process.env.TZ — только после этого
  // new Date(y, m, d, h) означает стенные часы нужного пояса.
  process.env.TZ = tz;
  vi.setSystemTime(new Date(2026, 7, 25, hour, minute, 0, 0));
}

describe('границы суток геймификации и серии', () => {
  beforeAll(() => {
    tzBefore = process.env.TZ;
    vi.useFakeTimers();
    globalThis.window.HEYS = globalThis.HEYS = {
      utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
      auth: { getSessionToken: () => null, isCuratorSession: () => false },
    };
    // eslint-disable-next-line no-eval
    eval(DAY_UTILS_SRC);
    // eslint-disable-next-line no-eval
    eval(CALENDAR_METRICS_SRC);
    // eslint-disable-next-line no-eval
    eval(GAMIFICATION_SRC);
    globalThis.HEYS.game.cancelAllPendingFlushes();
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.HEYS.game.reset();
    globalThis.HEYS.game.cancelAllPendingFlushes();
    vi.clearAllTimers();
  });

  afterAll(() => {
    globalThis.HEYS.game.cancelAllPendingFlushes();
    vi.clearAllTimers();
    vi.useRealTimers();
    // Пояс обязан вернуться: утёкший process.env.TZ отравляет соседние файлы.
    if (tzBefore === undefined) delete process.env.TZ;
    else process.env.TZ = tzBefore;
  });

  it('пояса действительно разные (иначе тест ничего не проверяет)', () => {
    const offsets = ZONES.map((tz) => {
      process.env.TZ = tz;
      return new Date(2026, 7, 25, 12, 0).getTimezoneOffset();
    });
    expect(offsets).toEqual([0, -180, 240, -600]);
    expect(new Set(offsets).size).toBe(ZONES.length);
  });

  for (const tz of ZONES) {
    describe(tz, () => {
      for (const { hour, minute, expected, why } of MOMENTS) {
        const at = `${String(hour).padStart(2, '0')}:${minute}`;

        it(`${at} — эталон правила даёт ${expected} (${why})`, () => {
          setClock(tz, hour, minute);
          expect(globalThis.HEYS.dayUtils.todayISO()).toBe(expected);
        });

        it(`${at} — миссии и дневной XP на ${expected}`, () => {
          setClock(tz, hour, minute);
          expect(globalThis.HEYS.game.getDailyMissions().date).toBe(expected);
        });

        it(`${at} — множитель активности на ${expected}`, () => {
          setClock(tz, hour, minute);
          globalThis.HEYS.game.incrementDailyActions();
          const stored = JSON.parse(globalThis.localStorage.getItem('heys_game') || '{}');
          expect(stored?.dailyActions?.date).toBe(expected);
        });

        it(`${at} — серия отсчитывается от ${expected}`, () => {
          setClock(tz, hour, minute);
          const seen = [];
          globalThis.HEYS.dayCalendarMetrics.computeStreakDetails({
            optimum: 2000,
            pIndex: null,
            fmtDate: globalThis.HEYS.dayUtils.fmtDate,
            lsGet: (key) => {
              seen.push(key);
              return null;
            },
            includeToday: true,
          });
          expect(seen[0]).toBe(`heys_dayv2_${expected}`);
        });
      }
    });
  }

  // Критерий приёмки владельца: перевод геймификации на правило не должен
  // сдвинуть день XP у нынешних (московских) пользователей ни на минуту.
  // Прежняя формула — new Date().toISOString().slice(0,10) — в UTC+3 совпадает
  // с правилом в каждом часе; здесь это совпадение проверяется поимённо, чтобы
  // «в Москве всё как было» не оставалось словами.
  it('в Москве день XP совпадает с прежней формулой во все 24 часа', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 1, 29, 59]) {
        setClock('Europe/Moscow', hour, minute);
        const legacy = new Date().toISOString().slice(0, 10);
        globalThis.localStorage.clear();
        globalThis.HEYS.game.reset();
        expect(globalThis.HEYS.game.getDailyMissions().date).toBe(legacy);
      }
    }
  });

  it('серия без includeToday начинает со вчера от эффективного дня', () => {
    setClock('Asia/Vladivostok', 2, 30);
    const seen = [];
    globalThis.HEYS.dayCalendarMetrics.computeStreakDetails({
      optimum: 2000,
      pIndex: null,
      fmtDate: globalThis.HEYS.dayUtils.fmtDate,
      lsGet: (key) => {
        seen.push(key);
        return null;
      },
      includeToday: false,
    });
    // Эффективное сегодня — 2026-08-24, значит стартуем с 2026-08-23.
    expect(seen[0]).toBe('heys_dayv2_2026-08-23');
  });

  it('серия и день геймификации всегда сходятся в одну дату', () => {
    for (const tz of ZONES) {
      for (const { hour, minute } of MOMENTS) {
        setClock(tz, hour, minute);
        globalThis.localStorage.clear();
        globalThis.HEYS.game.reset();
        const seen = [];
        globalThis.HEYS.dayCalendarMetrics.computeStreakDetails({
          optimum: 2000,
          pIndex: null,
          fmtDate: globalThis.HEYS.dayUtils.fmtDate,
          lsGet: (key) => {
            seen.push(key);
            return null;
          },
          includeToday: true,
        });
        expect(`heys_dayv2_${globalThis.HEYS.game.getDailyMissions().date}`).toBe(seen[0]);
      }
    }
  });
});
