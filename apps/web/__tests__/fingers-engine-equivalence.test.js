// fingers-engine-equivalence.test.js — ПРОД-SAFETY ЖИВОГО ПРИЛОЖЕНИЯ ПАЛЬЦЕВ.
//
// Тяжёлые движки пальцев (periodization / progression / session_builder /
// engine_router) делегируют под-вычисления в ядро по схеме «kernel-first +
// локальный fallback». Этот тест строит домен ДВАЖДЫ — один раз С ядром, один
// раз БЕЗ ядра (чистый fallback) — и сверяет выходы байт-в-байт. Так мы ловим
// расхождение поведения между ядром и fallback'ом (класс бага, при котором живое
// приложение тихо меняет поведение в зависимости от того, загрузилось ли ядро).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const KERNEL = [
  'heys_kernel_stats_v1', 'heys_kernel_dates_v1', 'heys_kernel_calendar_v1',
  'heys_kernel_periodization_v1', 'heys_kernel_progression_v1', 'heys_kernel_session_v1',
  'heys_kernel_runner_v1', 'heys_kernel_router_v1', 'heys_kernel_assess_v1',
  'heys_kernel_catalog_v1', 'heys_kernel_gate_v1', 'heys_kernel_records_v1',
  'heys_kernel_onboarding_v1'
];

const FINGERS = [
  'heys_fingers_programs_catalog_v1', 'heys_fingers_quality_catalog_v1',
  'heys_fingers_grips_catalog_v1', 'heys_fingers_block_catalog_v1',
  'heys_fingers_assessment_v1', 'heys_fingers_validators_v1',
  'heys_fingers_progression_v1', 'heys_fingers_periodization_engine_v1',
  'heys_fingers_mix_engine_v1', 'heys_fingers_session_builder_v1',
  'heys_fingers_engine_router_v1'
];

// Собирает домен пальцев в изолированном глобале. withKernel=false → ядро не
// грузится, домен идёт по локальному fallback.
function buildFingers(withKernel) {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const evf = (dir, f) => {
    /* eslint-disable-next-line no-eval */
    eval(fs.readFileSync(path.join(WEB, dir, f + '.js'), 'utf8'));
  };
  if (withKernel) KERNEL.forEach((f) => evf('_kernel', f));
  FINGERS.forEach((f) => { try { evf('fingers', f); } catch (_e) { /* optional */ } });
  return globalThis.HEYS.Fingers;
}

// Детерминированная батарея: чистые входы, без Date.now/случайности.
function battery(F) {
  const out = {};
  const plan = F.periodization.buildPlan({ startedAt: '2026-06-01', weeks: 6, model: 'linear' });
  out.periodizationPlan = plan;
  out.periodizationCurrent = F.periodization.current(plan, '2026-06-20');
  out.plateau = F.progression.detectPlateau({
    series: [
      { ts: 1, value: 10 }, { ts: 2, value: 10.2 },
      { ts: 3, value: 10.1 }, { ts: 4, value: 10.15 }
    ],
    windowSessions: 4,
    threshold: 0.05
  });
  const opts = { equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max', variantSeed: 7 };
  out.recommendDay = F.sessionBuilder.recommendDay(opts);
  out.routerRecommendDay = F.engineRouter.recommendDay(opts);
  out.isValidSession = F.engineRouter.isValidSession(out.recommendDay);
  return JSON.parse(JSON.stringify(out));
}

describe('fingers engine equivalence (kernel-путь == fallback)', () => {
  const withKernel = battery(buildFingers(true));
  const withoutKernel = battery(buildFingers(false));

  it('kernel реально активен в первой сборке', () => {
    // sanity: пересобираем с ядром и проверяем что оно зарегистрировано
    buildFingers(true);
    expect(globalThis.HEYS.TrainingKernel && globalThis.HEYS.TrainingKernel.periodization).toBeTruthy();
  });

  it('periodization.buildPlan идентичен', () => {
    expect(withKernel.periodizationPlan).toEqual(withoutKernel.periodizationPlan);
  });
  it('periodization.current идентичен', () => {
    expect(withKernel.periodizationCurrent).toEqual(withoutKernel.periodizationCurrent);
  });
  it('progression.detectPlateau идентичен', () => {
    expect(withKernel.plateau).toEqual(withoutKernel.plateau);
  });
  it('sessionBuilder.recommendDay идентичен', () => {
    expect(withKernel.recommendDay).toEqual(withoutKernel.recommendDay);
  });
  it('engineRouter.recommendDay идентичен', () => {
    expect(withKernel.routerRecommendDay).toEqual(withoutKernel.routerRecommendDay);
  });
  it('engineRouter.isValidSession идентичен', () => {
    expect(withKernel.isValidSession).toEqual(withoutKernel.isValidSession);
  });
});
