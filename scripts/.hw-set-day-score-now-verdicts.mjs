import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Оценка дня · Как сейчас · 01',
    '1) Корень — .widget-day-score.widget-v4-mini, heys_widgets_ui_v1.js:2556. 2) Вид mini 1×1, heys_widgets_variants_v4.js:103. 3) Не цвет. 4) «16» — .num клетки кадра. Смоук: widgets-day-score-now-v4.test.js.',
  ],
  [
    'Оценка дня · Как сейчас · 02',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Оценка\') :2557. 2) Текст словом. 3) Не цвет. 4) «Оценка дня» только у factors. Смоук: widgets-day-score-now-v4.test.js.',
  ],
  [
    'Оценка дня · Как сейчас · 03',
    '1) Ряд — .widget-v4-mini__value.widget-day-score__score, :2558–2563. 2) flex/baseline/gap 3 — 730:11232–11235; margin-top auto — .widget-v4-mini__value 730:11190. 3) Не цвет. 4) factors/week не делит. Смоук: widgets-day-score-now-v4.test.js.',
  ],
  [
    'Оценка дня · Как сейчас · 04',
    '1) Число — .widget-day-score__score, :2560 scoreOnTen. 2) 600 21px/1 inline; Figtree — body:has(.widgets-tab) .widgets-grid 730:10473. 3) --v4-sand-act-text (= --ac): песок #8a4a20 002:233; синий тот же на светлом. 4) «/ 10» — .widget-v4-unit. Смоук: widgets-day-score-now-v4.test.js.',
  ],
  [
    'Оценка дня · Как сейчас · текст',
    '1) Слова: «Оценка» :2557; число — scoreOnTen :2562; «/ 10» — .widget-v4-unit :2563. 2) «16» — номер клетки кадра, не копия. 3) Не цвет. 4) Смоук: widgets-day-score-now-v4.test.js.',
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
