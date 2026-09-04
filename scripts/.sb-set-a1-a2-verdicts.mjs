// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
import { patchZoneRow, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const CALM = 'apps/web/__tests__/strength-builder-calm-canvas-contract.test.js';
const CSS = 'apps/web/styles/modules/750-strength-builder.css';
const BUILDER = 'apps/web/strength/heys_strength_builder_ui_v1.js';

const ITEMS = [
  ['Конструктор · тренировка идёт · спокойнее · 11', {
    verdict: '≠',
    fact: `Ручка «⠿» намеренно не рендерится: нет owner/persistence reorder-flow; А2 без ручки, декоративный affordance не считается — ${CALM}:243-244, docs/ui/UI_V4_CODEX_DESIGN_DISCREPANCIES.md.`,
    options: { 'reason-code': 'owner-decision', 'decision-ref': 'docs/ui/UI_V4_CODEX_DESIGN_DISCREPANCIES.md:1271' },
  }],
  ['вид · спокойный список', {
    verdict: '=',
    fact: `Кадр А1б: спокойные сигналы — номер/галочка без --gr-bg заливки карточки, .sb-ex-num на --bg с рамкой, .sb-ap-check/.vl капсулы 44px — ${CSS}:3020-3140, ${BUILDER}; 49 строк А1б + геометрия ${CALM}.`,
  }],
  ['вид · шапка сессии', {
    verdict: '=',
    fact: `Шапка активной сессии: .sb-head 16/18/0, имя 15px/700, .sb-head-sub 10.5px моно, пилюли .sb-stat и badge «идёт» — ${CSS}:sb-head/sb-stats; А1 protocol не реализуется, prod = А1б ${CALM} rows 01-10.`,
  }],
  ['вид · строка упражнения', {
    verdict: '=',
    fact: `Кадр А2 «список свёрнут»: свёрнутые .sb-ex без раскрытия, состояния is-complete/is-current/is-pending и нижняя панель — ${BUILDER}; 26 numbered rows ${CALM} describe('А2 · rendered Canvas contract').`,
  }],
];

let changed = 0;
for (const [key, { verdict, fact, options = {} }] of ITEMS) {
  const result = setVerdictKey('strength-builder', key, { verdict, fact, options }, {
    skipIf: (row) => row.v === verdict && row.f === fact,
  });
  if (result.skipped) {
    console.log(`${key}  skip`);
    continue;
  }
  patchZoneRow('strength-builder', key, (row) => {
    delete row.evidence;
  });
  changed += 1;
  console.log(`${key}  ${result.was.v} → ${verdict}`);
}
console.log(`updated ${changed} rows`);
