// Рекомпозиция в C12 «Гипертрофия и композиция». Справка
// (pi_constants.js, HYPERTROPHY_COMPOSITION) обещает: «Рост обхватов при
// стабильном весе часто указывает на рекомпозицию». Движок этого не делал —
// все три ветки классификации требовали |weightTrend| > 0.05, и самый
// характерный случай рекомпозиции безусловно падал в «композиция стабильна».
// Талия — прямой признак жира — в расчёте не участвовала вовсе.
//
// Здесь проверяется и обратное: ложная рекомпозиция опаснее пропущенной, она
// оправдывает застой. Поэтому шум ленты не должен её включать.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, '../insights/patterns/body.js'), 'utf8');

function analyze(days, profile) {
  return window.HEYS.InsightsPI.patternModules.analyzeHypertrophy(days, profile || { weight: 90 });
}

// 9 дней без замеров + 5 дней с замерами = порог days.length >= 14 и
// measurements.length >= 5, тренды считаются от 3 точек.
function buildDays({ waist, biceps, thigh, weights, trainings } = {}) {
  const days = [];
  for (let i = 1; i <= 9; i++) {
    days.push({ date: `2026-08-0${i}`, meals: [], weightMorning: 90, trainings: [] });
  }
  for (let i = 0; i < 5; i++) {
    const m = {};
    if (waist) m.waist = waist[i];
    if (biceps) m.biceps = biceps[i];
    if (thigh) m.thigh = thigh[i];
    days.push({
      date: `2026-08-1${i}`,
      meals: [],
      measurements: m,
      weightMorning: weights ? weights[i] : 90,
      trainings: trainings || []
    });
  }
  return days;
}

describe('C12 · рекомпозиция', () => {
  beforeEach(() => {
    window.HEYS = {};
    // eslint-disable-next-line no-eval
    (0, eval)(src);
  });

  it('вес стоит, талия уходит — это рекомпозиция, а не «стабильно»', () => {
    const res = analyze(buildDays({ waist: [92, 91, 90, 89, 88] }));
    expect(res.available).toBe(true);
    expect(res.compositionQuality).toBe('recomposition');
    expect(res.waistTrend).toBeLessThan(0);
    expect(res.insight).toContain('талия уходит');
  });

  it('вес стоит, обхваты растут — тоже рекомпозиция', () => {
    const res = analyze(buildDays({ biceps: [34, 34.2, 34.5, 34.7, 35] }));
    expect(res.compositionQuality).toBe('recomposition');
    expect(res.insight).toContain('обхваты растут');
  });

  it('вес стоит и тело не меняется — по-прежнему «стабильно»', () => {
    const res = analyze(buildDays({ waist: [90, 90, 90, 90, 90] }));
    expect(res.compositionQuality).toBe('maintenance');
  });

  it('шум ленты не выдаётся за рекомпозицию', () => {
    // Разброс в пределах десятых: наклон около −0,02 см на замер, порог −0,1.
    const res = analyze(buildDays({ waist: [90, 90.05, 89.95, 90.02, 89.9] }));
    expect(res.waistTrend).toBeGreaterThan(-0.1);
    expect(res.compositionQuality).toBe('maintenance');
  });

  it('одной талии достаточно, чтобы разбор состоялся', () => {
    // Раньше при пустых бицепсе и бедре возвращалось no_measurements —
    // человек с замерами получал ответ «замеров нет».
    const res = analyze(buildDays({ waist: [92, 91, 90, 89, 88] }));
    expect(res.available).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('прежние ветки не сломаны: падение веса — fat_loss', () => {
    const res = analyze(buildDays({
      waist: [92, 91.5, 91, 90.5, 90],
      weights: [92, 91.4, 90.8, 90.2, 89.6]
    }));
    expect(res.compositionQuality).toBe('fat_loss');
  });

  it('прежние ветки не сломаны: рост веса с обхватами — muscle_gain', () => {
    const res = analyze(buildDays({
      biceps: [34, 34.2, 34.5, 34.7, 35],
      weights: [90, 90.4, 90.8, 91.2, 91.6]
    }));
    expect(res.compositionQuality).toBe('muscle_gain');
  });

  it('назначенная, но не выполненная силовая в счёт не идёт', () => {
    const performed = analyze(buildDays({
      waist: [92, 91, 90, 89, 88],
      trainings: [{ type: 'strength' }]
    }));
    const planned = analyze(buildDays({
      waist: [92, 91, 90, 89, 88],
      trainings: [{ type: 'strength', plan: { status: 'assigned' } }]
    }));
    expect(performed.strengthDays).toBe(5);
    expect(planned.strengthDays).toBe(0);
  });
});
