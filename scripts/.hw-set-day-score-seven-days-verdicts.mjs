import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Оценка дня · Семь дней · 01',
    '1) Корень — .widget-day-score.widget-day-score--week.widget-v4-stack, heys_widgets_ui_v1.js:2583. 2) Вид week_chart 2×1, heys_widgets_variants_v4.js:105. 3) Не цвет. 4) «18» — .num клетки кадра. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :2590. 2) space-between — 730:10708; baseline — 730:14186 + 10802. 3) Не цвет. 4) factors делит row, не week. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 03',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Оценка · 7 дней\') :1755 / :2591. 2) Текст словом. 3) Не цвет. 4) «Оценка дня» только у factors. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 04',
    '1) Число — .widget-day-score__week-score, :2593 scoreOnTen. 2) 600 16px/1 inline; Figtree — body:has(.widgets-tab) .widgets-grid 730:10473. 3) --v4-sand-act-text (= --ac): песок #8a4a20 002:233; синий тот же на светлом. 4) Без «/ 10». Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 05',
    '1) Ряд — .widget-v4-week-bars.widget-v4-week-bars--inline, weekBarCols :2510. 2) flex-end / gap 4 / height 22 / margin-top auto — 730:14171. 3) Не цвет. 4) Шаги 30 px не делит. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 06',
    '1) Столбик — .widget-v4-week-bars__col.widget-v4-week-bars__col--past, :2516. 2) flex 1 / radius 2 — 730:14162; height score/max × 100 %, :2515. 3) --v4-track (≈ ink 13 %): песок rgba(0,0,0,.12) 002:192; синий rgba(238,243,248,.12) 002:627. 4) 13 px кадра — стенд. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 07',
    '1) Тот же .widget-v4-week-bars__col--past, :2516. 2) 17 px кадра — стенд. 3) --v4-track на двух наборах. 4) Не сегодня. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 08',
    '1) Тот же .widget-v4-week-bars__col--past, :2516. 2) 9 px кадра — стенд. 3) --v4-track. 4) Не сегодня. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 09',
    '1) Тот же .widget-v4-week-bars__col--past, :2516. 2) 20 px кадра — стенд. 3) --v4-track. 4) Не сегодня. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 10',
    '1) Тот же .widget-v4-week-bars__col--past, :2516. 2) 15 px кадра — стенд. 3) --v4-track. 4) Не сегодня. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 11',
    '1) Тот же .widget-v4-week-bars__col--past, :2516. 2) 18 px кадра — стенд. 3) --v4-track. 4) Не сегодня. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · 12',
    '1) Столбик — .widget-v4-week-bars__col--today, :2519. 2) 14 px кадра — стенд; isToday index === length-1, :2512. 3) --v4-sand-act (= --acs): песок #c67139 002:231; синий #c67139 002:521. 4) Последний день. Смоук: widgets-day-score-seven-days-v4.test.js.',
  ],
  [
    'Оценка дня · Семь дней · текст',
    '1) Слова: «Оценка · 7 дней» :2591; число — formatRuDecimal(score/10,1) :2486. 2) «18» — номер клетки кадра, не копия. 3) Не цвет. 4) Смоук: widgets-day-score-seven-days-v4.test.js.',
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
