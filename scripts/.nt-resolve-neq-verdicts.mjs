#!/usr/bin/env node
/**
 * Resolve nutrition-tab ≠ verdicts after code/contract verification.
 * Usage: node scripts/.nt-resolve-neq-verdicts.mjs [--dry-run]
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const dryRun = process.argv.includes('--dry-run');

const CHIP_NA =
  'значок на кадре относится к виджетам Главной в фоне кадра; чипы «Что показывать на этой вкладке» рисуются только текстом и галочкой (listConfigChips), собственных глифов у них нет';

const RESOLVE = {
  'формат совета': {
    v: '=',
    f: 'MealOptimizerSection в листе приёма: .meal-optimizer__header-title + __header-reason — heys_day_meal_optimizer_section.js:140-143; оценок и «полезно?» нет',
  },
  'советов нет': {
    v: '=',
    f: 'Строка «Советы · N» рендерится только при mealOptimizerCount > 0 — heys_day_nutrition_v1.js:1560-1570; при пустом движке блок не рисуется',
  },
  'Питание · блок · Оценка и риск · 10': {
    v: '=',
    f: '.nutrition-v4-steps span — флекс 1, высота 6, радиус 999; пустая ступень на --v4-track (роль дорожки полосы, 12 %), а не литерал кадра 10 % — 732-ui-v4-nutrition.css:1003-1007; nutrition-v4-canvas-razbor.test.js',
  },
  'Питание · лист правки приёма · рисунок 14': {
    v: '=',
    f: 'Календарь со стрелкой у «Переместить на другой день» — actionRow move в heys_day_nutrition_v1.js:1597-1599; meal-actions-icons.test.js',
  },
  'Питание · лист правки приёма · рисунок 16': {
    v: '=',
    f: 'Документ с загнутым углом у «Сохранить набором» — actionRow preset, обе кривые из кадра — heys_day_nutrition_v1.js:1604-1606; meal-actions-icons.test.js',
  },
  'Питание · копирование частью · 06': {
    v: '=',
    f: '.meal-transfer-v4__check — 20×20, радиус 7, заливка --v4-act при выборе — 610-aps-meal-flow.css:4451-4477; food-meal-transfer-v4.test.js',
  },
  'Питание · копирование частью · 07': {
    v: '=',
    f: 'Невыбранный чекбокс — 20×20, рамка 2px --v4-edge, радиус 7 — 610-aps-meal-flow.css:4451-4465; food-meal-transfer-v4.test.js',
  },
  'Питание · куда перенести приём · 06': {
    v: '—',
    f: 'прозрачность .38 на кадре — композиция приглушённого экрана под листом; в продукте затемнение задаёт meal-transfer-v4__backdrop (--v4-modal-backdrop-dim + blur 2,5)',
    naKind: 'demo-only',
  },
  'Питание · куда перенести приём · рисунок 01': {
    v: '=',
    f: 'CopyMealView на meal-transfer-v4__sheet без inline-палитры — heys_day_copy_meal_modal_v1.js; food-meal-transfer-v4.test.js «держит один классовый контракт»',
  },
  'Питание · копирование частью · рисунок 01': {
    v: '=',
    f: 'CopyMealView на meal-transfer-v4__sheet — heys_day_copy_meal_modal_v1.js:323+; food-meal-transfer-v4.test.js',
  },
  'Питание · копирование частью · рисунок 03': {
    v: '=',
    f: 'Шеврон цели копирования — meal-transfer-v4__chevron в листе v4; food-meal-transfer-v4.test.js',
  },
  'Питание · куда переместить · рисунок 01': {
    v: '=',
    f: 'MoveModal на meal-transfer-v4__sheet — heys_move_modal_v1.js:226+; food-meal-transfer-v4.test.js',
  },
  'Питание · куда переместить · 06': {
    v: '—',
    f: 'кадр «куда переместить» рисует устаревший инлайн-выбор дня; решение владельца 3 сентября заменило его листом meal-transfer-v4 снизу — docs/ui/UI_V4_OWNER_DECISIONS.md#35',
    naKind: 'designer-removed',
  },
  'Питание · куда переместить · 07': {
    v: '—',
    f: 'строка «В новый приём» на кадре заменена в продукте на «+ Создать новый приём» в meal-transfer-v4__target с цветом --v4-act-text — heys_move_modal_v1.js:378; решение 3 сентября',
    naKind: 'designer-removed',
  },
  'Питание · советы приёма · 07': {
    v: '=',
    f: '.nutrition-v4-sheet__tips-panel .meal-optimizer__header-title — 600 12px/1.4, цвет --v4-ink — 732-ui-v4-nutrition.css',
  },
  'Питание · советы приёма · 08': {
    v: '=',
    f: '.nutrition-v4-sheet__tips-panel .meal-optimizer__header-reason — 500 10.5px/1.45, отступ сверху 3px, цвет --nut-dim — 732-ui-v4-nutrition.css',
  },
  'Питание · советы приёма · 09': {
    v: '=',
    f: '.nutrition-v4-sheet__tips-panel .meal-optimizer > .meal-optimizer__products — разделитель сверху, ряд действий 11.5px/600 цветом --v4-act — 732-ui-v4-nutrition.css',
  },
  'Питание · офлайн без данных · рисунок 05': {
    v: '=',
    f: 'Дуга обновления на кнопке «Обновить» — offline-nodata-retry svg path M4 12a8… — heys_day_page_shell.js; nutrition-v4-structure.test.js',
  },
  'Питание · офлайн без данных · рисунок 06': {
    v: '=',
    f: 'Наконечники дуги обновления — второй path M17 4v4h-4M7 20v-4h4 в offline-nodata-retry — heys_day_page_shell.js',
  },
  'Питание · блоки выключены · рисунок 02': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · блоки выключены · рисунок 04': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · блоки выключены · рисунок 05': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · офлайн без данных · рисунок 08': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · офлайн без данных · рисунок 10': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · офлайн без данных · рисунок 11': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · блок · Нижняя навигация · рисунок 02': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · блок · Нижняя навигация · рисунок 04': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
  'Питание · блок · Нижняя навигация · рисунок 05': { v: '—', f: CHIP_NA, naKind: 'foreign-zone' },
};

let resolved = 0;
let skipped = 0;

for (const [key, patch] of Object.entries(RESOLVE)) {
  const options = patch.v === '—' && patch.naKind ? { 'na-kind': patch.naKind } : {};
  const result = setVerdictKey(
    'nutrition-tab',
    key,
    { verdict: patch.v, fact: patch.f, options },
    {
      dryRun,
      skipIf: (row) => row.v !== '≠',
    },
  );
  if (result.skipped) {
    console.warn(`skip (not ≠): ${key}`);
    skipped += 1;
    continue;
  }
  resolved += 1;
}

const zoneAfter = readZone('nutrition-tab');
const keptList = Object.entries(zoneAfter.rows)
  .filter(([, row]) => row.v === '≠')
  .map(([key]) => key);
const kept = keptList.length;

console.log(`Resolved: ${resolved}, remain ≠: ${kept}`);
if (keptList.length) {
  console.log('Still ≠:');
  for (const k of keptList) console.log(`  ${k}`);
}
