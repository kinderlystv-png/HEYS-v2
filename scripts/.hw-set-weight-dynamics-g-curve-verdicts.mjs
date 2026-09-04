import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Динамика · G сброшено и кривая · 01',
    '1) Корень — .widget-wd.widget-v4-stack, heys_widgets_ui_v1.js:7532 / :7542. 2) Дефолт curve, heys_widgets_variants_v4.js:176. 3) Не цвет. 4) «2» — .num клетки :6545. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 02',
    '1) Шапка — .widget-wd__head, :7470. 2) space-between / baseline — 730:13541. 3) Не цвет. 4) «Сброшено за месяц» / «Вес по неделям» — другие виды. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 03',
    '1) Ключ — .widget-v4-kicker + windowLabel, :7471 / :7335. 2) label «Вес за месяц» — heys_widgets_weight_dynamics_v4.js:82. 3) Слово, не цвет. 4) weightDynamicsDeltaKicker только у number_only :7408. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 04',
    '1) Остаток — .widget-wd__remainder, :7348 / :7472. 2) 600 9px/1 tabular — 730:13548. 3) --v4-ink-data: песок rgba(0,0,0,.56) 002:60 / :177; синий rgba(16,24,38,.64) 002:455 / :481. 4) Текст remainderLabel «до цели N», dynamics :270; curve не remainderShort. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 05',
    '1) Ряд — .widget-wd__curve-row, :7474. 2) flex-end / space-between / gap 8 / margin-top auto — 730:13567. 3) Не цвет. 4) .widget-wd__num-row ту же геометрию делит, вид number_only не открывал. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 06',
    '1) Число — .widget-wd__delta, :7341 / :7475. 2) baseline / gap 3 / tabular — 730:13576. 3) Не цвет этой строки. 4) 2×1 кегль 21/600 — 730:13462, строка кегль не просит. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 07',
    '1) «−1,8» — .widget-wd__delta + stateClass, :7341. 2) Моноцифры tabular 730:13576. 3) Good — --v4-sand-ok-text: песок и синий светлый оба #5c6a45 002:247 / :536. 730:13468. 4) --v4-ok-text на синем #1f6e4d не брал. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · 08',
    '1) Спарк — .widget-wd__spark, WeightDynamicsSparkSvg :7158. 2) flex none, margin-bottom 2px — 730:13650. 3) Не геометрия линии. 4) График 2×2 .widget-wd__chart --c1 не делит. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · рисунок 01',
    '1) svg 58×24, viewBox 0 0 58 24 — :7159. 2) Поле кадра. 3) Не цвет. 4) WeightDynamicsChartSvg 121×54 не этот кадр. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · рисунок 02',
    '1) path.widget-wd__spark-line, :7165; currentColor, strokeWidth 2 — :7170. 2) Точки из sparkline.points, не хардкод кадра. 3) currentColor ← --v4-sand-ok-text: песок и синий светлый #5c6a45 002:247 / :536. 730:13656. 4) Демо 2,6…56,19 — стенд. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · рисунок 03',
    '1) circle.widget-wd__spark-dot, :7176; r 2.4 — :7180; fill currentColor. 2) (last.x, last.y) из данных. 3) Та же роль --v4-sand-ok-text, два светлых набора #5c6a45. 4) (56,19) кадра — демо. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
  [
    'Динамика · G сброшено и кривая · текст',
    '1) «Вес за месяц» :7471 / dynamics :82; «до цели N» :7108 / :270; «−1,8 кг» :7341. 2) «2» — .num клетки. 3) Не цвет. 4) «Сброшено за месяц» / «Вес по неделям» не этот кадр. Смоук: widgets-weight-dynamics-g-curve-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
