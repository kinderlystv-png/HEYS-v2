import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тепловая карта · Как сейчас · 01',
    '1) Корень — .widget-heatmap.widget-heatmap--2x1.widget-v4-stack, heys_widgets_ui_v1.js:6893. 2) Вид week_bar 2×1, heys_widgets_variants_v4.js:108. 3) Не цвет. 4) «19» — .num клетки кадра. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :6894. 2) space-between — 730:10708; center — 730:10809–10810; stack space-between — 730:10813–10816. 3) Не цвет. 4) baseline у day-score week, не heatmap. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 03',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Тепловая карта\') :1755 / :6895. 2) Текст словом. 3) Не цвет. 4) «Месяц целиком» — другой вид. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 04',
    '1) Счёт — .widget-v4-row__meta--count, :6896–6899; v4HeatmapMetaState :2390. 2) 700 9.5px/1 — 730:10836–10838; Figtree — body:has(.widgets-tab) .widgets-grid 730:10473. 3) --v4-ok-text (= --gr): песок #5c6a45 002:148; синий #1f6e4d 002:468. 4) 5/7 ≥ 0,6 → good. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 05',
    '1) Ряд — .widget-v4-heat, :6901. 2) gap 4 / margin-top auto — 730:11878–11882. 3) Не цвет. 4) month-grid — другой вид. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 06',
    '1) Полоса — .widget-v4-heat__bar--d3, barTone green/ok :6888–6904. 2) flex 1 / height 9 / radius 3 — 730:11887–11891. 3) --v4-ok-fill (= --gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) Норма дня. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 07',
    '1) Полоса — .widget-v4-heat__bar--d1, barTone red/empty :6888–6904. 2) Те же размеры — 730:11887–11891. 3) --v4-line (≈ ink 8 %): песок rgba(0,0,0,.08) 002:191; синий тот же 002:488. 4) Промах. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · 08',
    '1) Полоса — .widget-v4-heat__bar--d2, barTone yellow/warn :6888–6904. 2) Те же размеры — 730:11887–11891. 3) --v4-wave-overlap (= --ovl): песок #d99a63 002:299; синий #b03a24 002:588. 4) Частично. Смоук: widgets-heatmap-now-v4.test.js.',
  ],
  [
    'Тепловая карта · Как сейчас · текст',
    '1) Слова: «Тепловая карта» :6895; счёт — `${filled} из 7` :6899. 2) «19» — номер клетки кадра, не копия. 3) Не цвет. 4) Смоук: widgets-heatmap-now-v4.test.js.',
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
