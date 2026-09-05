#!/usr/bin/env node
/**
 * Lane 3 Task 52 PIECE 2 — nutrition functional smoke inventory builder.
 * Writes scripts/.nutrition-functional-smoke-inventory.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts/.nutrition-functional-smoke-inventory.json');
const SMOKE = 'apps/web/__tests__/nutrition-functional-smoke.test.js';
const DAY_LOOP = 'apps/web/__tests__/day-loop-functional-smoke.test.js';

/** @type {Array<{id:string, scenario:string, description:string, status:'COVERED'|'GAP', tests:string[], gapReason?:string, priority?:string, closedBy?:string}>} */
const leafScenarios = [
  // add product to meal
  {
    id: 'nut-add-summary-flow',
    scenario: 'add-product',
    description: 'Добавление: лист → запись → итог приёма (multi)',
    status: 'COVERED',
    tests: ['apps/web/__tests__/nutrition-v4-add-product-summary.test.js'],
  },
  {
    id: 'nut-add-onadd-contract',
    scenario: 'add-product',
    description: 'Добавление: onAdd объект → позиционные (mi, product)',
    status: 'COVERED',
    tests: ['apps/web/__tests__/add-product-onadd-contract.test.js'],
  },
  {
    id: 'nut-add-persist-fail-single',
    scenario: 'add-product',
    description: 'Добавление: lsSet=false не сообщает успех (одиночное)',
    status: 'COVERED',
    tests: [`${DAY_LOOP}:addProductToMeal`, DAY_LOOP],
    gapReason: 'закрыто в day-loop Task 45 — не дублировать',
  },
  {
    id: 'nut-add-batch',
    scenario: 'add-product',
    description: 'Добавление: addProductsToMeal атомарно пишет N позиций с граммами',
    status: 'GAP',
    tests: [],
    gapReason: 'batch API есть в _meals.js; функциональной симуляции нет',
    priority: 'data-corruption',
    closedBy: SMOKE,
  },
  {
    id: 'nut-add-batch-persist-fail',
    scenario: 'add-product',
    description: 'Добавление: batch lsSet=false — без частичной записи',
    status: 'GAP',
    tests: [],
    gapReason: 'persist-honesty только source-scan; batch runtime не симулирован',
    priority: 'data-corruption',
    closedBy: SMOKE,
  },
  {
    id: 'nut-add-batch-commit-abort',
    scenario: 'add-product',
    description: 'Добавление: commit-gate на 2-м продукте отменяет весь batch',
    status: 'GAP',
    tests: ['apps/web/__tests__/product-commit-gate-contract.test.js'],
    gapReason: 'контракт в коде; abort до lsSet не симулирован',
    priority: 'data-corruption',
    closedBy: SMOKE,
  },
  {
    id: 'nut-add-mealid-resolve',
    scenario: 'add-product',
    description: 'Добавление: stale mealIndex, но mealId попадает в верный приём',
    status: 'GAP',
    tests: ['apps/web/__tests__/meal-preset-bulk-add.test.js'],
    gapReason: 'resolveMealIndex только в source; race не симулирован',
    priority: 'data-corruption',
    closedBy: SMOKE,
  },

  // portion
  {
    id: 'nut-portion-setGrams',
    scenario: 'portion',
    description: 'Порция: setGrams меняет граммы и пишет в LS',
    status: 'COVERED',
    tests: [`${DAY_LOOP}:setGrams`, DAY_LOOP],
    gapReason: 'закрыто в day-loop Task 45 — не дублировать',
  },
  {
    id: 'nut-portion-grams-on-add',
    scenario: 'portion',
    description: 'Порция: граммы с листа (75) не сбрасываются в 100 при записи',
    status: 'GAP',
    tests: ['apps/web/__tests__/add-product-onadd-contract.test.js'],
    gapReason: 'переходник в source; buildAddProductItem runtime не проверен',
    priority: 'data-corruption',
    closedBy: SMOKE,
  },
  {
    id: 'nut-portion-zero-normalize',
    scenario: 'portion',
    description: 'Порция: 0 г не заменяется на 100 (normalizeItemGrams)',
    status: 'COVERED',
    tests: ['apps/web/__tests__/item-grams-zero-contract.test.js'],
  },

  // edit
  {
    id: 'nut-edit-setGrams',
    scenario: 'edit',
    description: 'Редактирование: setGrams + updatedAt на item',
    status: 'COVERED',
    tests: [`${DAY_LOOP}:setGrams`, DAY_LOOP],
    gapReason: 'закрыто в day-loop Task 45 — не дублировать',
  },
  {
    id: 'nut-edit-snapshot-vs-card',
    scenario: 'edit',
    description: 'Редактирование: снимок позиции vs живая карточка каталога',
    status: 'COVERED',
    tests: ['apps/web/__tests__/meal-item-snapshot-vs-card.test.js'],
  },
  {
    id: 'nut-edit-grams-merge',
    scenario: 'edit',
    description: 'Редактирование: merge item.updatedAt при конфликте граммов',
    status: 'COVERED',
    tests: ['apps/web/__tests__/sync-grams-conflict-review.test.js'],
  },

  // delete
  {
    id: 'nut-delete-item',
    scenario: 'delete',
    description: 'Удаление: removeItem + deletedItemIds tombstone',
    status: 'COVERED',
    tests: [`${DAY_LOOP}:removeItem`, DAY_LOOP],
    gapReason: 'закрыто в day-loop Task 45 — не дублировать',
  },
  {
    id: 'nut-delete-meal',
    scenario: 'delete',
    description: 'Удаление: removeMeal + deletedMealIds tombstone',
    status: 'COVERED',
    tests: [`${DAY_LOOP}:removeMeal`, DAY_LOOP],
    gapReason: 'закрыто в day-loop Task 45 — не дублировать',
  },
  {
    id: 'nut-delete-undo',
    scenario: 'delete',
    description: 'Удаление: undo возвращает продукт и снимает tombstone',
    status: 'COVERED',
    tests: [`${DAY_LOOP}:undo`, DAY_LOOP],
    gapReason: 'закрыто в day-loop Task 45 — не дублировать',
  },

  // backdated entry
  {
    id: 'nut-backdated-move',
    scenario: 'backdated',
    description: 'Задняя дата: перенос приёма (executeMealMoveTransaction)',
    status: 'COVERED',
    tests: ['apps/web/__tests__/food-meal-transfer-v4.test.js'],
  },
  {
    id: 'nut-backdated-add-key',
    scenario: 'backdated',
    description: 'Задняя дата: добавление продукта пишет в scoped key прошлого дня',
    status: 'GAP',
    tests: ['apps/web/__tests__/date-remainders-v4-smoke.test.js'],
    gapReason: 'календарь/капсула покрыты; запись в LS прошлой даты — нет',
    priority: 'data-corruption',
    closedBy: SMOKE,
  },
  {
    id: 'nut-backdated-calendar',
    scenario: 'backdated',
    description: 'Задняя дата: шторка календаря и догрузка месяца',
    status: 'COVERED',
    tests: ['apps/web/__tests__/date-remainders-v4-smoke.test.js'],
  },
  {
    id: 'nut-backdated-night-window',
    scenario: 'backdated',
    description: 'Задняя дата: ночное окно до 03:00 (капсула «вчера»)',
    status: 'COVERED',
    tests: ['apps/web/__tests__/date-remainders-v4-smoke.test.js:75'],
  },

  // date-question sheet
  {
    id: 'nut-date-question-offer',
    scenario: 'date-question',
    description: 'Вопрос о дате: shouldOfferConfirmation пороги',
    status: 'COVERED',
    tests: ['apps/web/__tests__/day-realdata-actions-pure.test.js'],
  },
  {
    id: 'nut-date-question-clear',
    scenario: 'date-question',
    description: 'Вопрос о дате: clear_day очищает meals и estimated поля',
    status: 'COVERED',
    tests: ['apps/web/__tests__/day-realdata-actions-pure.test.js'],
  },
  {
    id: 'nut-date-question-confirm',
    scenario: 'date-question',
    description: 'Вопрос о дате: confirm_real_data сохраняет meals',
    status: 'COVERED',
    tests: ['apps/web/__tests__/day-realdata-actions-pure.test.js'],
  },
  {
    id: 'nut-date-question-yesterday-pack',
    scenario: 'date-question',
    description: 'Вопрос о дате: clear_day не затирает день с едой (yesterday pack)',
    status: 'COVERED',
    tests: ['apps/web/__tests__/yesterday-verify-v4-pack.test.js'],
  },
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
const gapsClosed = validated.filter((s) => s.closedBy && fileExists(s.closedBy)).length;

const out = {
  generatedAt: '2026-09-05',
  scope: 'Lane 3 Task 52 PIECE 2 — nutrition functional smoke (add, portion, edit, delete, backdate, date-question)',
  excludeDuplicate:
    'day-loop-functional-smoke: meal-edit-grams, remove, undo, persist-fail — COVERED, не дублировать',
  leafScenarios: validated.map(({ closedBy, ...rest }) => {
    if (closedBy && fileExists(closedBy)) {
      return {
        ...rest,
        status: 'COVERED',
        tests: [...rest.tests, closedBy],
        gapReason: rest.gapReason ? `${rest.gapReason}; closed in Task 52 smoke` : 'closed in Task 52 smoke',
      };
    }
    return rest;
  }),
  counts: {
    total: validated.length,
    coveredBefore,
    gapsBefore: gapsBeforeAll,
    gapsClosed,
    gapsRemaining: validated.filter((s) => s.status === 'GAP' && !(s.closedBy && fileExists(s.closedBy))).length,
  },
  gapsToImplement: validated
    .filter((s) => s.status === 'GAP' && !(s.closedBy && fileExists(s.closedBy)))
    .map((s) => `${s.id} — ${s.description}`),
};

fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.counts));
console.log(`wrote ${OUT}`);
