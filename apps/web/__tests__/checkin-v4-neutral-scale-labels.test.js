import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');

function sourceBlock(startMarker, endMarker) {
  const start = SOURCE.indexOf(startMarker);
  const end = SOURCE.indexOf(endMarker, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe('morning check-in neutral scale labels', () => {
  it('uses non-judgmental wording for the 1–10 sleep-quality scale', () => {
    const labels = sourceBlock('const SLEEP_QUALITY_LABELS = [', 'const SLEEP_ADVICE =');

    expect(labels).toContain("'Так себе'");
    expect(labels).toContain("'Нормально'");
    expect(labels).toContain("'Выше обычного'");
    expect(labels).not.toMatch(/'Ужасно'|'Плохо'|'Отлично'|'Супер'|'Идеально'|'Божественно'/);
  });

  it('uses the same neutral vocabulary for mood and wellbeing while preserving factual stress intensity', () => {
    const scaleWord = sourceBlock('function scaleWord(value, kind)', 'function getColdExposureStreak');

    expect(scaleWord).toContain("return 'так себе'");
    expect(scaleWord).toContain("return 'нормально'");
    expect(scaleWord).toContain("return 'выше обычного'");
    expect(scaleWord).not.toMatch(/return 'плохо'|return 'хорошо'|return 'отлично'/);
    expect(scaleWord).toContain("return 'очень сильно'");
  });

  it('uses the current cold-exposure explanation instead of the removed insulin-wave copy', () => {
    expect(SOURCE).toContain("'Тридцать секунд в конце обычного душа — достаточно.'");
    expect(SOURCE).not.toContain('Выберите, что именно — от этого зависит инсулиновая волна дня');
  });
});
