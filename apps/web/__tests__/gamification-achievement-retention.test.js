/**
 * Строка «снятое достижение» канваса gamification.v4.dc.html (решение владельца
 * 24 августа): достигнутое достижение остаётся достигнутым, даже если куратор
 * поправил данные и условие больше не выполняется — XP не отзывается, из списка
 * оно не уходит.
 *
 * Почему смоуком. Условие «куратор убрал приёмы, серия упала с 7 до 0» руками
 * не собрать: нужен второй клиент, правка чужого дня и повторный вход. В jsdom
 * это два синхронных вызова checkStreakAchievements с разной серией — тот же
 * стык, воспроизводимый детерминированно.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'heys_gamification_v1.js'), 'utf8');

const STREAK_IDS = ['streak_1', 'streak_2', 'streak_3', 'streak_5', 'streak_7'];

function unlockedIds() {
  return globalThis.HEYS.game
    .getAchievements()
    .filter((ach) => ach.unlocked)
    .map((ach) => ach.id);
}

describe('снятое достижение · достигнутое остаётся достигнутым', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    globalThis.window.HEYS = globalThis.HEYS = {
      utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
      auth: { getSessionToken: () => null, isCuratorSession: () => false },
    };
    // eslint-disable-next-line no-eval
    eval(SOURCE);
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
  });

  it('серия упала после правки куратора — ни одно достижение не снято и XP не отозван', () => {
    // Серия доросла до семи дней: открылись все пять ступеней.
    globalThis.HEYS.game.checkStreakAchievements(7);
    const afterUnlock = globalThis.HEYS.game.getStats();
    const unlockedBefore = unlockedIds();
    expect(afterUnlock.totalXP).toBeGreaterThan(0);
    for (const id of STREAK_IDS) {
      expect(unlockedBefore).toContain(id);
    }

    // Куратор поправил дни — условие больше не выполняется, серия ноль.
    globalThis.HEYS.game.checkStreakAchievements(0);

    const afterEdit = globalThis.HEYS.game.getStats();
    expect(afterEdit.totalXP).toBe(afterUnlock.totalXP);
    expect(afterEdit.level).toBe(afterUnlock.level);
    // Из списка оно не уходит — ровно тот же набор, что и до правки.
    expect(unlockedIds()).toEqual(unlockedBefore);
    for (const id of STREAK_IDS) {
      expect(unlockedIds()).toContain(id);
    }
  });

  it('в модуле нет пути, который переписывает список достижений на снятие', () => {
    // Три известных присваивания: объединение локального и облачного, разовая
    // миграция legacy-идентификаторов серии (новые добавляются до удаления
    // старых) и дедупликация. Появление четвёртого — повод перечитать строку
    // контракта, а не молча расширить список.
    const assignments = [...SOURCE.matchAll(/\w+\.unlockedAchievements\s*=\s*([^;]+);/g)].map((m) =>
      m[1].replace(/\s+/g, ' ').trim(),
    );
    expect(assignments).toEqual([
      'mergeUniqueArray(local.unlockedAchievements, cloud.unlockedAchievements)',
      'data.unlockedAchievements.filter((id) => !legacyStreakIds.has(id))',
      '[...new Set(data.unlockedAchievements)]',
    ]);
  });

  it('XP нигде не вычитается', () => {
    expect(SOURCE).not.toMatch(/totalXP\s*-=/);
  });
});
