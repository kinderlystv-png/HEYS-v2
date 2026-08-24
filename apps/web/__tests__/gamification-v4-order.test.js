/**
 * Отбор и порядок на экране достижений (канвас gamification.v4, строки
 * «порядок групп», «пустых групп нет», «на экране», «порядок закрытых»,
 * «Ближе всего», «длина таблицы»).
 *
 * Почему смоуком. Все шесть правил — про сравнение: что выше, что раньше, что
 * не показывается вовсе. Увидеть их глазами можно только на человеке, у
 * которого уже накоплена нужная картина достижений: группа с продвижением и
 * рядом полностью пройденная, закрытые с разным остатком. Такое состояние не
 * собирается по требованию.
 *
 * Проверяются чистые функции порядка, вынутые из модуля: они и есть решение,
 * а рендер их только показывает.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_gamification_screens_v1.js'),
  'utf8',
);

/** Вынуть тело функции из исходника и оживить его. */
function extract(name, deps = {}) {
  const at = SRC.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`нет функции ${name}`);
  let depth = 0;
  let end = -1;
  for (let i = SRC.indexOf('{', at); i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    if (SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const body = SRC.slice(at, end);
  const names = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `${body}; return ${name};`)(...names.map((n) => deps[n]));
}

const remainingOf = extract('remainingOf');
const remainingSort = extract('remainingSort', { remainingOf });
const categoryActivityScore = extract('categoryActivityScore');
const orderAchievements = extract('orderAchievements', {
  remainingOf,
  HEYS: { game: {} },
});

const ach = (id, { unlocked = false, current = 0, target = 0 } = {}) => ({
  id,
  unlocked,
  progress: target ? { current, target } : null,
});

describe('порядок групп: наверх та, где идёт продвижение', () => {
  const byId = {
    // Полностью пройденная: закрытых нет, продвижения нет.
    done1: ach('done1', { unlocked: true }),
    done2: ach('done2', { unlocked: true }),
    // Идёт работа: одно открыто, два в процессе.
    live1: ach('live1', { unlocked: true }),
    live2: ach('live2', { current: 3, target: 10 }),
    live3: ach('live3', { current: 1, target: 5 }),
  };

  it('группа с продвижением стоит выше полностью пройденной', () => {
    const finished = categoryActivityScore({ achievements: ['done1', 'done2'] }, byId);
    const moving = categoryActivityScore({ achievements: ['live1', 'live2', 'live3'] }, byId);
    expect(moving).toBeGreaterThan(finished);
  });

  it('группа без единого открытого не показывается вовсе', () => {
    const onlyProgress = { p1: ach('p1', { current: 2, target: 9 }) };
    // Не «0 из 5» серым, а отсутствие: счёт −1 выкидывает группу из списка.
    expect(categoryActivityScore({ achievements: ['p1'] }, onlyProgress)).toBe(-1);
  });
});

describe('порядок закрытых: по остатку, не по номеру каталога', () => {
  const byId = {
    a: ach('a', { unlocked: true }),
    // 90 из 100 — процент выше, а остаток больше.
    big: ach('big', { current: 90, target: 100 }),
    // 9 из 10 — процент ниже, но до цели ближе.
    near: ach('near', { current: 9, target: 10 }),
  };

  it('открытые идут первыми, закрытые — по возрастанию остатка', () => {
    const order = orderAchievements({ achievements: ['big', 'near', 'a'] }, byId);
    expect(order).toEqual(['a', 'near', 'big']);
  });

  it('«Ближе всего» берёт наименьший остаток, а не наибольший процент', () => {
    const sorted = remainingSort([byId.big, byId.near]);
    expect(sorted[0].id).toBe('near');
    expect(remainingOf(byId.near)).toBe(1);
    expect(remainingOf(byId.big)).toBe(10);
  });

  it('достижение без цели не притворяется ближайшим', () => {
    expect(remainingOf(ach('x'))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('числа на экране', () => {
  it('групп на экране три, не две', () => {
    expect(SRC).toMatch(/const VISIBLE_INITIAL = 3;/);
  });

  it('таблица XP показывает восемь строк и сортирует по убыванию номинала', () => {
    expect(SRC).toMatch(/const XP_ROWS_VISIBLE = 8;/);
    expect(SRC).toMatch(/\.sort\(\(a, b\) => \(xpActions\[b\]\.xp \|\| 0\) - \(xpActions\[a\]\.xp \|\| 0\)\)/);
  });
});
