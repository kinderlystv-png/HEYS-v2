import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Оценка дня · Из чего сложилась · 01',
    '1) Корень — .widget-day-score.widget-day-score--short.widget-v4-stack, heys_widgets_ui_v1.js:2570. 2) Вид factors 2×1, heys_widgets_variants_v4.js:104. 3) Не цвет. 4) «17» — .num клетки кадра. Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :2573. 2) space-between — 730:10708; baseline — 730:14186 + 10802. 3) Не цвет. 4) mini не делит row. Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 03',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Оценка дня\') :2574. 2) Текст словом. 3) Не цвет. 4) «Оценка» только у mini. Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 04',
    '1) Число — scoreSlashTen(\'widget-v4-row__value\', 16) :2575. 2) 600 16px/1; Figtree — 730:10473. 3) --v4-sand-act-text (= --ac): песок #8a4a20 002:233; синий тот же. 4) Без отдельного «/ 10» в row. Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 05',
    '1) Ряд — .widget-v4-factor-cols, :2577. 2) gap 5 / margin-top auto — 730:14675–14678. 3) Не цвет. 4) week bars не делит. Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 06',
    '1) Столбик — .widget-v4-factor-cols__item, :2580. 2) flex 1 / min-width 0 / text-align center — 730:14681–14684. 3) Не цвет. 4) Пять факторов из data.factorBars. Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 07',
    '1) Полоса — .widget-v4-factor-cols__bar--good, :2583 tone good. 2) height 5 / radius 999 — 730:14687–14690. 3) --v4-ok-fill (= --gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 08',
    '1) Подпись — .widget-v4-factor-cols__label, :2585. 2) 600 8px/1 / margin-top 5 — 730:14706–14710. 3) --v4-ink-data (≈ ink 56 %): песок rgba(0,0,0,.56) 002:192; синий rgba(16,24,38,.56) 002:489. 4) Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 09',
    '1) Полоса — .widget-v4-factor-cols__bar--warn, tone warn :2583. 2) height 5 / radius 999 — 730:14687–14690. 3) --v4-warn-1 (= --ovl): песок #d99a63 002:299; синий #e59ea8 002:588. 4) Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · 10',
    '1) Полоса — .widget-v4-factor-cols__bar--bad, tone bad :2583. 2) height 5 / radius 999 — 730:14687–14690. 3) --v4-val-bad: песок #a8382b 002:301; синий #b03a24 002:590. 4) Смоук: widgets-day-score-factors-v4.test.js.',
  ],
  [
    'Оценка дня · Из чего сложилась · текст',
    '1) Слова: «Оценка дня» :2574; scoreSlashTen; подписи bar.label :2585. 2) «17» — номер клетки кадра. 3) Не цвет. 4) Смоук: widgets-day-score-factors-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v !== '?',
  });
  if (result.skipped) {
    console.error(`${key} уже ${result.was.v}, не трогаю`);
    process.exit(1);
  }
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
