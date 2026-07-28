import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateResult,
  clearProgress,
  readProgress,
  normalizeThemePreference,
  resolveTheme,
  shouldRevealAnswer,
  storageKey,
  writeProgress,
} from '../src/logic.js';

const questions = [
  { id: 'q1', status: 'ready', correctOptionId: 'o1' },
  { id: 'q2', status: 'ready', correctOptionId: 'o2' },
  { id: 'q3', status: 'ready', correctOptionId: 'o3' },
  { id: 'q4', status: 'unavailable', correctOptionId: null },
];

test('подсчитывает правильные, неправильные и пропущенные ответы', () => {
  const result = calculateResult(questions, { q1: 'o1', q2: 'o1' });
  assert.deepEqual(
    { correct: result.correct, incorrect: result.incorrect, skipped: result.skipped, gradable: result.gradable, percent: result.percent },
    { correct: 1, incorrect: 1, skipped: 1, gradable: 3, percent: 33 },
  );
});

test('не включает unavailable в знаменатель и детали результата', () => {
  const result = calculateResult(questions, { q4: 'o1' });
  assert.equal(result.gradable, 3);
  assert.equal(result.details.some(({ question }) => question.id === 'q4'), false);
});

test('сохраняет, восстанавливает и сбрасывает попытку в отдельном namespace', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const key = storageKey(2, 'exam');
  assert.equal(key, 'heys:genda-tests:v1:test-2:exam');
  writeProgress(storage, key, { index: 8, answers: { q1: 'o2' } });
  assert.deepEqual(readProgress(storage, key), { index: 8, answers: { q1: 'o2' } });
  clearProgress(storage, key);
  assert.equal(readProgress(storage, key), null);
});

test('обучение раскрывает ответ сразу', () => {
  assert.equal(shouldRevealAnswer('learn', null), true);
});

test('контрольная скрывает ответ до выбора и раскрывает после первого ответа', () => {
  assert.equal(shouldRevealAnswer('exam', null), false);
  assert.equal(shouldRevealAnswer('exam', 'o1'), true);
});

test('повреждённый localStorage не ломает запуск', () => {
  const storage = { getItem: () => '{broken' };
  assert.equal(readProgress(storage, 'key'), null);
});

test('нормализует сохранённую тему', () => {
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('unexpected'), 'light');
  assert.equal(normalizeThemePreference('system', true), 'dark');
});

test('при первом запуске система выбирает одну из двух тем', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
