#!/usr/bin/env node
/**
 * Lane 3 Task 45 — day-loop functional smoke inventory builder.
 * Counts leaf scenarios programmatically; writes scripts/.day-loop-functional-smoke-inventory.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'apps/web/__tests__');
const OUT = path.join(ROOT, 'scripts/.day-loop-functional-smoke-inventory.json');

/** @type {Array<{id:string, description:string, status:'COVERED'|'GAP', tests:string[], gapReason?:string, priority?:string}>} */
const leafScenarios = [
  // Check-in morning
  { id: 'ci-fill-resume', description: 'Чек-ин: дозаполнение journal после refresh/offline', status: 'COVERED', tests: ['apps/web/__tests__/morning-checkin-flow-resume.test.js'] },
  { id: 'ci-skip-measurements', description: 'Чек-ин: явный skip measurements в journal', status: 'COVERED', tests: ['apps/web/__tests__/morning-checkin-flow-resume.test.js:654'] },
  { id: 'ci-skip-first-login', description: 'Чек-ин: первый вход без skip/close-through', status: 'COVERED', tests: ['apps/web/__tests__/first-login-onboarding-guardrails.test.js'] },
  { id: 'ci-yesterday-feelings-pack', description: 'Вчера: pack/estimated_fill/confirm_real_data', status: 'COVERED', tests: ['apps/web/__tests__/yesterday-verify-v4-pack.test.js'] },
  { id: 'ci-yesterday-fill-later', description: 'Вчера: fill_later закрывает сегодня, спрашивает позже', status: 'COVERED', tests: ['apps/web/__tests__/yesterday-verify-fill-later.test.js'] },
  { id: 'ci-overdue-badge', description: 'Просрочка замеров: badge с 7-го дня', status: 'COVERED', tests: ['apps/web/__tests__/morning-checkin-v4-contract-geometry.test.js:122'] },
  { id: 'ci-overdue-open-layer', description: 'Просрочка замеров: openMeasurementsLayer переносит черновик', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:openMeasurementsLayer'], gapReason: 'closed in Task 52 smoke', priority: 'behavior', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },
  { id: 'ci-cloud-pending', description: 'Чек-ин: offline pending → cloud ack после drain', status: 'COVERED', tests: ['apps/web/__tests__/morning-checkin-flow-resume.test.js:1052'] },
  { id: 'ci-curator-blocked', description: 'Чек-ин: куратор не видит self-report flow', status: 'COVERED', tests: ['apps/web/__tests__/morning-checkin-flow-resume.test.js:878'] },

  // Meals
  { id: 'meal-add-product', description: 'Приём: add product → summary sheet', status: 'COVERED', tests: ['apps/web/__tests__/nutrition-v4-add-product-summary.test.js'] },
  { id: 'meal-edit-grams', description: 'Приём: setGrams меняет порцию и пишет в LS', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:setGrams'], gapReason: 'closed in Task 45 smoke', priority: 'data-corruption', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },
  { id: 'meal-remove-item', description: 'Приём: removeItem + deletedItemIds tombstone', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:removeItem'], gapReason: 'closed in Task 45 smoke', priority: 'data-corruption', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },
  { id: 'meal-remove-meal', description: 'Приём: removeMeal + deletedMealIds tombstone', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:removeMeal'], gapReason: 'closed in Task 45 smoke', priority: 'data-corruption', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },
  { id: 'meal-undo-restore', description: 'Приём: undo бара возвращает продукт и снимает tombstone', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:undo'], gapReason: 'closed in Task 45 smoke', priority: 'data-corruption', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },
  { id: 'meal-backdated-move', description: 'Приём: перенос на другую дату (executeMealMoveTransaction)', status: 'COVERED', tests: ['apps/web/__tests__/food-meal-transfer-v4.test.js'] },
  { id: 'meal-date-question', description: 'Лист «данные за день»: clear_day vs confirm_real_data', status: 'COVERED', tests: ['apps/web/__tests__/day-realdata-actions-pure.test.js'] },
  { id: 'meal-duplicate-guard', description: 'Приём: duplicate guard 10 мин / другой состав', status: 'COVERED', tests: ['apps/web/__tests__/meal-duplicate-guard.test.js'] },
  { id: 'meal-persist-fail', description: 'Приём: lsSet=false не показывает ложный успех', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:lsSet-fail'], gapReason: 'closed in Task 45 smoke', priority: 'data-corruption', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },

  // Water
  { id: 'water-add-persist', description: 'Вода: addWater до flush state', status: 'COVERED', tests: ['apps/web/__tests__/heys-day-water-persistence.test.js'] },
  { id: 'water-remove-journal', description: 'Вода: отрицательная запись журнала (cancel/убавление)', status: 'COVERED', tests: ['apps/web/__tests__/water-journal-v1.test.js:72'] },
  { id: 'water-daily-norm', description: 'Вода: единый computeWaterGoal', status: 'COVERED', tests: ['apps/web/__tests__/water-goal-single-source.test.js'] },
  { id: 'water-merge-devices', description: 'Вода: mergeWaterJournal двух устройств', status: 'COVERED', tests: ['apps/web/__tests__/water-journal-v1.test.js'] },

  // Norms
  { id: 'norm-correction-kcal', description: 'Норма: normCorrectionFactor в dayNorm.resolve', status: 'COVERED', tests: ['apps/web/__tests__/norm-correction-applied.test.js'] },
  { id: 'norm-display-chain', description: 'Норма: TDEE/stepsMissing видимая цепочка', status: 'COVERED', tests: ['apps/web/__tests__/heys-display-norms.test.js'] },
  { id: 'norm-cycle-correction', description: 'Норма: cycle correction engine', status: 'COVERED', tests: ['apps/web/__tests__/norm-correction.test.js'] },

  // Day ↔ cloud
  { id: 'day-merge-meals', description: 'Cloud: mergeDayData meals/items/tombstones', status: 'COVERED', tests: ['apps/web/__tests__/merge-day-data.test.js', 'apps/web/__tests__/sync-merge-shared.test.js'] },
  { id: 'day-mutation-guard', description: 'Cloud: dayMutationGuard stale snapshot', status: 'COVERED', tests: ['apps/web/__tests__/day-mutation-guard.test.js'] },
  { id: 'day-scoped-read', description: 'Cloud: scoped day read без foreign fallback', status: 'COVERED', tests: ['apps/web/__tests__/day-side-block-scoped-read.test.js'] },
  { id: 'day-cold-cache-training', description: 'Cold-cache: earlyStart refuse (strength #53 — не дублировать)', status: 'COVERED', tests: ['apps/web/__tests__/day-plan-early-start-v53.test.js:141'] },
  { id: 'day-known-empty-batch', description: 'Cold-cache: knownEmptyDates снимает unknown слота', status: 'GAP', tests: ['apps/web/__tests__/day-loop-functional-smoke.test.js:planSlot'], gapReason: 'closed in Task 45 smoke', priority: 'data-corruption', closedBy: 'apps/web/__tests__/day-loop-functional-smoke.test.js' },
  { id: 'day-checkin-cloud-ack', description: 'Cloud: check-in rows → explicit ack', status: 'COVERED', tests: ['apps/web/__tests__/morning-checkin-flow-resume.test.js:1052'] },

  // Date remainders / backdated UI
  { id: 'date-night-window', description: 'Капсула даты: ночь до 03:00', status: 'COVERED', tests: ['apps/web/__tests__/date-remainders-v4-smoke.test.js:75'] },
  { id: 'date-foreign-day', description: 'Капсула даты: чужой день + inline Сегодня', status: 'COVERED', tests: ['apps/web/__tests__/date-remainders-v4-smoke.test.js:169'] },

  // Edge cases
  { id: 'edge-part-vs-whole-meal', description: 'Part vs whole: merge не воскрешает tombstoned item', status: 'COVERED', tests: ['apps/web/__tests__/merge-day-data.test.js:421'] },
  { id: 'edge-reentry-yesterday', description: 'Re-entry: fill_later спрашивает на новый день', status: 'COVERED', tests: ['apps/web/__tests__/yesterday-verify-fill-later.test.js'] },
  { id: 'edge-empty-water-journal', description: 'Empty: waterMl=0 без выдуманного журнала', status: 'COVERED', tests: ['apps/web/__tests__/water-journal-v1.test.js:48'] },
  { id: 'edge-client-scope-day', description: 'Must-not: foreign day keys изолированы', status: 'COVERED', tests: ['apps/web/__tests__/dayv2-client-scope.test.js', 'apps/web/__tests__/client-isolation.test.js'] },
];

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel.split(':')[0]));
}

const validated = leafScenarios.map((s) => ({
  ...s,
  tests: s.tests.filter((t) => {
    const f = t.split(':')[0];
    if (!fileExists(f)) throw new Error(`Missing test ref: ${t}`);
    return true;
  }),
}));

const coveredBefore = validated.filter((s) => s.status === 'COVERED').length;
const gapsBeforeAll = validated.filter((s) => s.status === 'GAP').length;
const gapsClosed = validated.filter((s) => s.closedBy).length;

const out = {
  generatedAt: '2026-09-05',
  scope: 'Lane 3 Task 45 — main day loop functional smoke (check-in, meals, water, norms, sync)',
  excludeDuplicate: 'strength-builder-functional-smoke 16 scenarios / day-plan-early-start #53 not re-tested',
  leafScenarios: validated.map(({ closedBy, ...rest }) => {
    if (closedBy) {
      return {
        ...rest,
        status: 'COVERED',
        tests: [...rest.tests, closedBy],
      };
    }
    return rest;
  }),
  counts: {
    total: validated.length,
    coveredBefore,
    gapsBefore: gapsBeforeAll,
    gapsClosed,
  },
  gapsRemaining: validated.filter((s) => s.status === 'GAP' && !s.closedBy).map((s) => s.id),
  gapsToImplement: validated.filter((s) => s.status === 'GAP' && !s.closedBy).map((s) => `${s.id} — ${s.description}`),
};

fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.counts));
console.log(`wrote ${OUT}`);
