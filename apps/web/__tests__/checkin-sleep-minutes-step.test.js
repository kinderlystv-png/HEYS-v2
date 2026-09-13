// Колёса «Легли» и «Встали» крутят минуты по десять — кадр «Сон этой ночью»
// рисует 22:30 / 23:40 / 00:50, решение владельца 13 сентября. Шаг в пять
// минут давал точность, которой у времени отхода ко сну нет.
//
// Тест держит две вещи разом: сам набор значений и округление чужих минут к
// нему. Без округления колесо, получив сохранённые 23:35, встало бы на первую
// строку своего списка и молча подменило время — это хуже, чем мелкий шаг.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');

/** Достаёт из исходника тело функции округления и исполняет его. */
function loadSnap() {
  const match = STEPS_SRC.match(/function snapSleepMinutes\(hours, minutes\) \{[\s\S]*?\n  \}/);
  if (!match) throw new Error('функция округления минут сна не найдена');
  // eslint-disable-next-line no-new-func
  return new Function(`${match[0]}; return snapSleepMinutes;`)();
}

describe('чек-ин · шаг минут в колёсах сна', () => {
  it('колёса получают набор с шагом десять', () => {
    const declared = STEPS_SRC.match(/const SLEEP_MINUTES = \[([^\]]+)\]/);
    expect(declared, 'набор минут сна больше не объявлен').not.toBeNull();

    const values = declared[1].split(',').map((v) => Number(v.trim()));
    expect(values).toEqual([0, 10, 20, 30, 40, 50]);

    // Все четыре колеса сна (два в шаге «Сон» v4 и два в прежнем шаге) берут
    // этот набор: если новое колесо добавят мимо него, шаг разойдётся между
    // экранами одного и того же ввода.
    const used = STEPS_SRC.match(/minutesValues: SLEEP_MINUTES/g) || [];
    expect(used.length).toBe(4);
  });

  it('чужие минуты округляются к ближайшему шагу, а 55 переносит час', () => {
    const snap = loadSnap();

    expect(snap(23, 40)).toEqual({ hours: 23, minutes: 40 });
    expect(snap(23, 35)).toEqual({ hours: 23, minutes: 40 });
    expect(snap(23, 34)).toEqual({ hours: 23, minutes: 30 });
    expect(snap(7, 5)).toEqual({ hours: 7, minutes: 10 });
    // 55 → 60: минуты обнуляются, час растёт, полночь заворачивается.
    expect(snap(22, 56)).toEqual({ hours: 23, minutes: 0 });
    expect(snap(23, 57)).toEqual({ hours: 0, minutes: 0 });
    // Мусор вместо числа не должен давать NaN на колесе.
    expect(snap(undefined, undefined)).toEqual({ hours: 0, minutes: 0 });
  });
});
