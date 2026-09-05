// Polosa 6 · Task 106 · nutrition-tab — 5 строк пакета 36 (2 changed + 3 touch).
// «равный выбор…» / «след записи…» / «тач-цели» в канвасе нет (ffe15b5ef); UX — «Питание · вопрос о дате · текст».
import {
  assertForeignRowsUnchanged,
  snapshotForeignRowStrings,
} from './lib/handoff-batch-apply.mjs';
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ZONE = 'nutrition-tab';
const TEST = 'apps/web/__tests__/nutrition-tab-v4-contract-fixes.test.js';
const CSS = '732-ui-v4-nutrition.css';
const ITEMS = [
  [
    'вид чипа',
    '=',
    `${CSS}:1063 .nutrition-v4-chip — min-height 44px (:1068), ::after content:none (:1081-1083); видимая цель без расширителя; ${TEST} :620-625`,
  ],
  [
    'состав чипа',
    '=',
    `${CSS}:1608 .nutrition-v4-supplements__chip — min-height 44px (:1610), ::after content:none (:1629-1631); пакет 5 сент: 44 px видимым, не 30+expander; ${TEST} :612-618`,
  ],
  [
    'вход в настройку курса',
    '=',
    `${CSS}:1520 .nutrition-v4-supplements__pill.is-course — min-height 44px (:1523), inline-flex, обводка --v4-act; heys_day_nutrition_v1.js:912-916; ${TEST} :627-634`,
  ],
  [
    'Питание · вопрос о дате · текст',
    '=',
    `day/_meals.js:156-185 — лист «На какой день записать?» (:159, :162), два равных .nutrition-v4-sheet__row (:165-180), CTA .nutrition-v4-sheet__cta (:181-185); notifyRecordedInForeignDay (:106-115) — Undo «Записано в …», 6000 ms; ${TEST} :637-753`,
  ],
  [
    'Питание · вопрос о дате · 08',
    '=',
    `Пакет 5 сент: кнопки «Отмена» в листе нет — day/_meals.js:148-186 только head, два row и CTA; кадр ·08 data-v «высота 16px» — нижний зазор листа, не отдельная кнопка; ${TEST} :638-643`,
  ],
];

const scopeKeys = new Set(ITEMS.map(([key]) => key));
const beforeSnap = snapshotForeignRowStrings(readZone(ZONE).rows, scopeKeys);
let applied = 0;
for (const [key, verdict, fact] of ITEMS) {
  const row = readZone(ZONE).rows[key];
  if (!row) {
    console.error(`нет строки «${key}» — сначала --rehash nutrition-tab`);
    process.exit(1);
  }
  const result = setVerdictKey(ZONE, key, { verdict, fact, options: {} });
  console.log(`${key}  ${result.was.v} → ${verdict}`);
  applied += 1;
}
assertForeignRowsUnchanged(beforeSnap, readZone(ZONE).rows);
console.log(`готово: ${applied} строк, foreign guard ok`);
