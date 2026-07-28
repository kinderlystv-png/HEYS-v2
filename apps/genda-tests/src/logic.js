export const STORAGE_PREFIX = 'heys:genda-tests:v1';
export const THEME_STORAGE_KEY = `${STORAGE_PREFIX}:theme`;

export function normalizeThemePreference(value, systemPrefersDark = false) {
  return ['light', 'dark'].includes(value) ? value : (systemPrefersDark ? 'dark' : 'light');
}

export function resolveTheme(preference, systemPrefersDark) {
  return normalizeThemePreference(preference, systemPrefersDark);
}

export function storageKey(testNumber, mode) {
  return `${STORAGE_PREFIX}:test-${testNumber}:${mode}`;
}

export function shouldRevealAnswer(mode, selectedOptionId) {
  return mode === 'learn' || (mode === 'exam' && selectedOptionId !== null);
}

export function calculateResult(questions, answers) {
  const result = { correct: 0, incorrect: 0, skipped: 0, gradable: 0, details: [] };
  for (const question of questions) {
    if (question.status !== 'ready') continue;
    result.gradable += 1;
    const selected = answers[question.id] || null;
    const state = selected === null ? 'skipped' : selected === question.correctOptionId ? 'correct' : 'incorrect';
    result[state] += 1;
    result.details.push({ question, selectedOptionId: selected, state });
  }
  result.percent = result.gradable ? Math.round((result.correct / result.gradable) * 100) : 0;
  return result;
}

export function readProgress(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function writeProgress(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function clearProgress(storage, key) {
  storage.removeItem(key);
}
