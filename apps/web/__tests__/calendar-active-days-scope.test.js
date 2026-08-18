import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readUtilsSource() {
  return fs.readFileSync(path.resolve(__dirname, '../heys_day_utils.js'), 'utf8');
}

function sliceGetActiveDaysForMonth(src) {
  const start = src.indexOf('function getActiveDaysForMonth');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('function compactMealsContentSignature', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('getActiveDaysForMonth training metadata scope', () => {
  it('declares hasTraining before HEYS.TDEE.calculate branch', () => {
    const body = sliceGetActiveDaysForMonth(readUtilsSource());
    const hasTrainingDecl = body.indexOf('const hasTraining =');
    const tdeeBranch = body.indexOf('HEYS.TDEE.calculate');

    expect(hasTrainingDecl).toBeGreaterThan(-1);
    expect(tdeeBranch).toBeGreaterThan(-1);
    expect(hasTrainingDecl).toBeLessThan(tdeeBranch);
  });

  it('declares steps before HEYS.TDEE.calculate branch', () => {
    const body = sliceGetActiveDaysForMonth(readUtilsSource());
    const stepsDecl = body.indexOf('const steps = (dayInfo.steps');
    const tdeeBranch = body.indexOf('HEYS.TDEE.calculate');

    expect(stepsDecl).toBeGreaterThan(-1);
    expect(tdeeBranch).toBeGreaterThan(-1);
    expect(stepsDecl).toBeLessThan(tdeeBranch);
  });
});
