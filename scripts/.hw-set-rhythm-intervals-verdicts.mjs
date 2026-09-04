import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Ритм приёмов · Интервалы · 01',
    '1) Корень intervals — .widget-v4-stack.widget-v4-rhythm.widget-v4-rhythm-intervals, heys_widgets_ui_v1.js:6123. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид mealRhythm.intervals 2×2, heys_widgets_variants_v4.js:167. «49» — .num клетки. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, heys_widgets_ui_v1.js:6124. 2) space-between — .widget-v4-row 730:10705; baseline — --tight 730:10802 (gap 6 px у --tight; кадр зазор шапки не назвал). 3) Не цвет. 4) Смоук widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 03',
    '1) Ключ рисует v4Kicker(\'Ритм · интервалы\'), heys_widgets_ui_v1.js:6125 / :1755. 2) .widget-v4-kicker 730:10518 одно; у интервалов не перебито. 3) Слово, не цвет. 4) Текст «Ритм · интервалы». Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 04',
    '1) Счётчик — .widget-v4-row__meta, :6126 `${count} ${ruMealsWord(count)}`; ruMealsWord(4) = «приёма» :6185. 2) 9px/600/1 — 730:10826. 3) --v4-ink-data: песок rgba(var(--v4-ink-rgb),.56) 002:60; синий .64 002:455. --count не ставил. 4) «4 приёма» при count === 4. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 05',
    '1) Герой — .widget-v4-rhythm-intervals__hero, heys_widgets_ui_v1.js:6130. 2) baseline, gap 5, margin-top 7 — 730:13017. Не общий goal-hero (gap 4 / margin-top auto). 3) Не цвет. 4) Рисует только intervals. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 06',
    '1) Число — .widget-v4-rhythm-intervals__value, :6131 formatHoursColon :5750. 2) 26px/600/.9/-.03em — 730:13025. 3) --v4-ink (--tx): песок #201e1d 002:176; синий #101826 002:480. Не goal-value 17 px. 4) «3:37» при 217 мин. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 07',
    '1) Столбец — .widget-v4-mealbars.widget-v4-rhythm-intervals__bars, :6139. 2) column, gap 6, margin-top auto — 730:13035. Общий .widget-v4-mealbars остаётся gap 5 / margin-top 8 730:12924. 3) Не цвет. 4) Три последних slice(-3). Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 08',
    '1) Ряд — .widget-v4-mealbars__row, :6142. 2) center, gap 7 — 730:12931. 3) Не цвет. 4) Тот же ряд у белка; scoped bars только высоту/кегль перебивают. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 09',
    '1) Время — .widget-v4-mealbars__time, :6144 `${from} → ${to}`. 2) flex none — 730:12937; ширина 74px / 8.5px/1 — 730:13040. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. Белок держит 34px 730:12994. 4) «8:40 → 13:05». Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 10',
    '1) Дорожка — .widget-v4-mealbars__track, :6145. 2) flex 1, 999 — 730:12946; высота 5px — 730:13046. Общий track 4 px жив. 3) --v4-line 8 %: песок и синий светлые rgba(0,0,0,.08) 002:191 / 002:488. 4) Смоук widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 11',
    '1) Заливка — .widget-v4-mealbars__fill, :6147 без val--good. 2) 5px, 999 — 730:13050 / 730:12954. 3) Фон #b7c29b — литерал контракта, на песке и синем одно значение (кадр синий рисует #a8cdb8; старше data-v #b7c29b). 4) Ширина 88 % — демо 265/360; продукт minutes/(6*60) ≈ 74 % для 4 ч 25 м. Формулу 6 ч не менял. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 12',
    '1) Длительность — .widget-v4-mealbars__num, :6151 formatHoursWords :5758. 2) flex none — 730:12961; 8.5px/1 — 730:13055. 3) --v4-ink (--tx): песок #201e1d 002:176; синий #101826 002:480. Общий num остаётся --v4-ink-data 10 px. 4) «4 ч 25 м» при 265 мин. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 13',
    '1) Вторая заливка — тот же .widget-v4-mealbars__fill :6147. 2) 5px, 999, #b7c29b — 730:13050. 3) Литерал, песок = синий. 4) 72 % — демо 215/360; продукт ≈ 60 % для 3 ч 35 м. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · 14',
    '1) Третья заливка — тот же fill :6147. 2) 5px, #b7c29b 730:13050. 3) Литерал, песок = синий. 4) 57 % — демо 170/360; продукт ≈ 47 % для 2 ч 50 м. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
  [
    'Ритм приёмов · Интервалы · текст',
    '1) Слова: «Ритм · интервалы» :6125; «N приёма» :6126; formatHoursColon / «в среднем между приёмами» :6131 / :6134; ряды `${from} → ${to}` и formatHoursWords. 2) «49» — .num клетки. 3) Не цвет. 4) Ширины полос — строки 11/13/14, не эта. Смоук: widgets-rhythm-intervals-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v === '=' && row.f === fact,
  });
  if (result.skipped) {
    console.log(`${key}  уже =`);
    continue;
  }
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
