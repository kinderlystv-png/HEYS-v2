// Polosa 6 · Task 106 · nutrition-tab — тач 44 px (disclose/pill/group + cfg chip).
// 3 NEW-ключа пакета («тач-цели», «равный выбор…», «след записи…») в nutrition-tab.v4.dc.html
// на HEAD нет (734 строки; ffe15b5ef снял выдуманные ключи). Равный выбор и след — day/_meals.js
// + «Питание · вопрос о дате · текст» (= d4e77784b); тач foreign — date-remainders/water-add.
import {
  assertForeignRowsUnchanged,
  snapshotForeignRowStrings,
} from './lib/handoff-batch-apply.mjs';
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ZONE = 'nutrition-tab';
const TEST = 'apps/web/__tests__/nutrition-tab-v4-contract-fixes.test.js';
const ITEMS = [
  [
    'вид чипа',
    '=',
    `732-ui-v4-nutrition.css:1063 .nutrition-v4-chip — min-height 44px (:1068), ::after content:none (:1081-1083); видимая цель без расширителя, как «состав чипа» 5 сент; ${TEST} :620-625`,
  ],
  [
    'вход в настройку курса',
    '=',
    `732-ui-v4-nutrition.css:1520 .nutrition-v4-supplements__pill.is-course — min-height 44px, inline-flex, обводка --v4-act; heys_day_nutrition_v1.js:912-916; ${TEST} :627-634`,
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
