import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тепловая карта · Серия · 01',
    '1) Корень — .widget-heatmap.widget-heatmap--micro.widget-v4-mini, heys_widgets_ui_v1.js streak :6862. 2) Вид streak 1×1, heys_widgets_variants_v4.js:109. 3) Не цвет. 4) «20» — .num кадра. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Серия · 02',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Серия\') :6863. 2) Текст словом. 3) Не цвет. 4) «Тепловая карта» — другой вид. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Серия · 03',
    '1) Ряд — .widget-v4-mini__value--pair в streak :6866. 2) baseline/gap 3/margin-top auto — 730:11206–11208 + .widget-v4-mini__value margin-top auto 730:11190. 3) Не цвет. 4) month_grid — другой вид. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Серия · 04',
    '1) Число — .widget-v4-mini__value, streak :6866. 2) 600 21px/1 / -.02em — 730:11189–11196; Figtree — body:has(.widgets-tab) .widgets-grid 730:10473. 3) --v4-ink (нейтраль): серия не good/bad. 4) Единица «дня» — .widget-v4-unit 9px 730:11210–11212. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Серия · текст',
    '1) Слова: «Серия» :6863; «дня» — .widget-v4-unit :6867. 2) «20» — номер клетки кадра. 3) Не цвет. 4) Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 01',
    '1) Корень — .widget-heatmap.widget-heatmap--2x2.widget-v4-stack, month_grid :6924. 2) Вид month_grid 2×2, heys_widgets_variants_v4.js:110. 3) Не цвет. 4) «21» — .num кадра. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 02',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Месяц целиком\') :6925. 2) Текст словом. 3) Не цвет. 4) week_bar — «Тепловая карта». Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 03',
    '1) Сетка — .widget-heatmap__month-grid, :6926. 2) repeat(7,minmax(0,1fr)) / gap 4 / margin-top 9 — 730:14200–14206. 3) Не цвет. 4) week_bar — полосы, не сетка. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 04',
    '1) Клетка — .widget-heatmap__cell--month.widget-v4-heat__bar--d3, barTone ok :6918–6933. 2) radius 3 / aspect-ratio 1 — 730:14212–14217. 3) --v4-ok-fill (= --gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) Норма дня. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 05',
    '1) Клетка — .widget-v4-heat__bar--d2, barTone yellow/warn :6918–6933. 2) radius 3 — 730:14216. 3) --v4-wave-overlap (= --ovl): песок #d99a63 002:299; синий #b03a24 002:588. 4) Частично. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 06',
    '1) Клетка — .widget-v4-heat__bar--d1/empty, barTone red/empty :6918–6933. 2) radius 3 — 730:14216. 3) --v4-line (≈ ink 8 %): песок rgba(0,0,0,.08) 002:191; синий тот же 002:488. 4) Промах. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 07',
    '1) Клетка — .widget-heatmap__cell--today, isToday :6928–6932. 2) radius 3 — 730:14216. 3) --v4-act (= --acs): песок #c67139 002:143; синий #2e7cc0 002:461. 4) Сегодня перекрывает тон дня. Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · 08',
    '1) Подпись — .widget-heatmap__month-meta, :6945–6947; `${filled28} из 28 дней в норме`. 2) 600 9.5px/1 / margin-top auto — 730:14812–14817. 3) --v4-ink-data (≈ ink 56 %): песок rgba(0,0,0,.56) 002:192; синий rgba(16,24,38,.56) 002:489. 4) Смоук: widgets-heatmap-series-month-v4.test.js.',
  ],
  [
    'Тепловая карта · Месяц целиком · текст',
    '1) Слова: «Месяц целиком» :6925; счёт — month-meta :6946. 2) «21» — номер клетки кадра. 3) Не цвет. 4) Смоук: widgets-heatmap-series-month-v4.test.js.',
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
