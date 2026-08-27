/**
 * XP за прошлый день не начисляется.
 *
 * Строка контракта home-widgets «стопка на прошлом дне»: быстрые действия
 * пишут в тот день, который открыт капсулой, кнопка не прячется и не
 * предупреждает, но опыт за прошлый день не начисляется.
 *
 * Гейт один и стоит в геймификации (_addXPInternal), а не в виджетах: на
 * стороне виджетов он закрыл бы только воду с Главной и завёл второй источник
 * правды. Дату действия несёт само событие — `detail.date`, ключ дня
 * `YYYY-MM-DD`.
 *
 * Почему смоуком. Руками это не собрать: нужно открыть капсулой вчерашний
 * день, нажать быстрое действие и сравнить опыт до и после — и отдельно
 * повторить то же самое в час ночи, когда «эффективное сегодня» это вчерашняя
 * календарная дата. Здесь движок оживает в happy-dom, время идёт поддельными
 * таймерами, а часовой пояс намеренно не московский: в UTC+3 сдвиг пояса равен
 * порогу 03:00, и ошибка границы суток там не видна.
 *
 * Время в файле идёт строго вперёд от теста к тесту: dedup-guard движка
 * (200 мс, ключ = reason) срабатывает на любом шаге часов назад.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const DAY_UTILS_SRC = read('heys_day_utils.js');
const GAMIFICATION_SRC = read('heys_gamification_v1.js');

// Не Москва: там сдвиг пояса совпадает с порогом ночи и старая ошибка границы
// суток пряталась (см. day-boundary-timezones.test.js).
const TZ = 'America/New_York';

const DEBOUNCE_AND_FLUSH_MS = 300;

let tzBefore;
let game;
let warnSpy;

/** Ставит пояс и системное время на локальные стенные часы этого пояса. */
function setClock(year, month, day, hour, minute) {
  process.env.TZ = TZ;
  vi.setSystemTime(new Date(year, month - 1, day, hour, minute, 0, 0));
}

/** Быстрое действие «+вода» в конкретном дне; date=null — отправитель без даты. */
function tapWater(dateKey) {
  const normMet = { ml: 250, total: 2000, targetMl: 2000 };
  const detail = dateKey === null ? { ...normMet } : { ...normMet, date: dateKey };
  window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail }));
  vi.advanceTimersByTime(DEBOUNCE_AND_FLUSH_MS);
}

/** Строки журнала об отказе начислить опыт. */
function refusals() {
  return warnSpy.mock.calls
    .map((args) => args.map((a) => String(a)).join(' '))
    .filter((line) => line.includes('XP не начислен'));
}

describe('опыт за прошлый день', () => {
  beforeAll(() => {
    tzBefore = process.env.TZ;
    process.env.TZ = TZ;
    vi.useFakeTimers();
    globalThis.window.HEYS = globalThis.HEYS = {
      utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
      auth: { getSessionToken: () => null, isCuratorSession: () => false },
    };
    // eslint-disable-next-line no-eval
    eval(DAY_UTILS_SRC);
    // eslint-disable-next-line no-eval
    eval(GAMIFICATION_SRC);
    game = globalThis.HEYS.game;
    game.cancelAllPendingFlushes();
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    game.reset();
    game.cancelAllPendingFlushes();
    // Гасим и debounce прошлого теста, и отложенный на 2 с «loading phase»
    // движка: пока он включён, _addXPInternal выходит сразу и тест доказал бы
    // не гейт, а загрузку.
    vi.clearAllTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    game.cancelAllPendingFlushes();
    vi.clearAllTimers();
    vi.useRealTimers();
    // Пояс обязан вернуться: утёкший process.env.TZ отравляет соседние файлы.
    if (tzBefore === undefined) delete process.env.TZ;
    else process.env.TZ = tzBefore;
  });

  it('действие в сегодняшнем дне — опыт начисляется', () => {
    setClock(2026, 8, 25, 10, 0);
    expect(globalThis.HEYS.dayUtils.todayISO()).toBe('2026-08-25');

    const before = game.getTotalXP();
    tapWater('2026-08-25');

    expect(game.getTotalXP()).toBeGreaterThan(before);
    expect(refusals()).toEqual([]);
  });

  it('действие в прошлом дне — опыта нет, причина видна в журнале', () => {
    setClock(2026, 8, 25, 10, 5);

    const before = game.getTotalXP();
    tapWater('2026-08-24');

    expect(game.getTotalXP()).toBe(before);

    const lines = refusals();
    expect(lines).toHaveLength(1);
    // Журнал называет действие и обе даты — иначе «почему не начислилось»
    // неотлаживаемо.
    expect(lines[0]).toContain('water_added');
    expect(lines[0]).toContain('2026-08-24');
    expect(lines[0]).toContain('2026-08-25');
  });

  it('ночью до 03:00 опыт идёт за эффективное сегодня, а не за календарное', () => {
    setClock(2026, 8, 26, 1, 0);
    // Продуктовое правило дня: приём в час ночи пишется во вчерашний день.
    expect(globalThis.HEYS.dayUtils.todayISO()).toBe('2026-08-25');

    const before = game.getTotalXP();
    tapWater('2026-08-25');
    const afterEffectiveToday = game.getTotalXP();
    expect(afterEffectiveToday).toBeGreaterThan(before);
    expect(refusals()).toEqual([]);

    // И обратная сторона той же границы: календарное «сегодня» в час ночи —
    // это ещё не начавшийся день, опыт за него не идёт. Шаг часов вперёд —
    // чтобы не сработал dedup-guard движка на том же reason.
    vi.advanceTimersByTime(1000);
    tapWater('2026-08-26');
    expect(game.getTotalXP()).toBe(afterEffectiveToday);
    expect(refusals()).toHaveLength(1);
  });

  it('событие без даты начисляет как раньше', () => {
    setClock(2026, 8, 26, 1, 10);

    const before = game.getTotalXP();
    tapWater(null);

    expect(game.getTotalXP()).toBeGreaterThan(before);
    expect(refusals()).toEqual([]);
  });

  it('битая дата в событии не считается прошлым днём', () => {
    setClock(2026, 8, 26, 1, 20);

    const before = game.getTotalXP();
    tapWater('вчера');

    expect(game.getTotalXP()).toBeGreaterThan(before);
    expect(refusals()).toEqual([]);
  });
});

describe('отправители событий несут дату', () => {
  it('все heysMealAdded в day/_meals.js передают день приёма', () => {
    const src = read(path.join('day', '_meals.js'));
    const dispatches = src.match(/new CustomEvent\('heysMealAdded',[^\n]*\)/g) || [];
    expect(dispatches).toHaveLength(5);
    for (const line of dispatches) {
      expect(line).toMatch(/date(:\s*\w+)?\s*[},]/);
    }
  });

  it('heysTrainingAdded несёт день тренировки', () => {
    const src = read('heys_training_step_v1.js');
    expect(src).toMatch(/heysTrainingAdded[\s\S]{0,200}?date:\s*dateKey/);
  });
});
