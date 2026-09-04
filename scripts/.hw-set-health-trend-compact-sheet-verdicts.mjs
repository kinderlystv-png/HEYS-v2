import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тренд здоровья · Компакт · 01',
    '1) Корень шторки — .widget-v4-stack.widget-trend-compact.widget-trend-compact--sheet, heys_widgets_ui_v1.js:3296; класс --sheet только при meta.preview :3295. 2) Хром превью .widget--healthTrend + widget-wd-sheet__preview--2x1, heys_widgets_variants_v4.js:419 / :122. 3) Фон --v4-ok-bg: песок #eaefe0 002:142; синий #e4efe7 002:460. 730:10504. 4) «26» — .num клетки. Живой 2×1 без --sheet. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · 02',
    '1) Шапка — .widget-trend-compact__head, :3300. 2) space-between / baseline — 730:14427; gap 6 у живого 2×1, эта строка зазор не просит. 3) Не цвет. 4) now 2×2 свой герой. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · 03',
    '1) Ключ рисует v4Kicker(`Тренд · ${formatRuUnit(periodDays, \'дней\')}`), :3301 / :1755. 2) .widget-v4-kicker 730:10518. 3) Слово, не цвет. 4) now пишет «Тренд здоровья», не этот кадр. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · 04',
    '1) Ряд — .widget-trend-compact__row, :3303. 2) flex-end / space-between / gap 8 / margin-top auto — 730:14434. 3) Не цвет. 4) Живой 2×1 тот же ряд, шторка не перебивает. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · 05',
    '1) Число — .widget-trend-compact__value + v4ValueStateClass, :3304 / :2230. 2) tabular-nums 730:14442; кегль 26 px у живого 2×1, строка кегль не просит. 3) --v4-ok-text (--gr): песок #5c6a45 002:148; синий #1f6e4d 002:468. 730:14449. 4) «+8» при delta 8. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · 06',
    '1) Спарклайн — .widget-trend-compact__spark, :3307. 2) flex none, margin-bottom 2px — 730:14461. 3) Не геометрия линии. 4) Живой 2×1 те же поля. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · рисунок 01',
    '1) svg 58×24, viewBox 0 0 58 24 — :3308. 2) Поле кадра. 3) Не цвет. 4) HEALTH_SPARK_BOX_COMPACT :3253 не менял; LARGE / now 130×40 не делят. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · рисунок 02',
    '1) polyline, :3315. 2) Шторка strokeWidth 2 — :3319 и 730:14487. Живой 2×1 остаётся compactSpark.strokeWidth || 2.5. 3) currentColor ← --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. .widget-v4-spark--ok 730:14466. 4) Демо 2,19…56,5 — стенд, не хардкод; семь прогонов не открывал. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · рисунок 03',
    '1) circle, :3326. 2) Шторка r 2.4 — :3330 и 730:14491. Живой 2×1 берёт last.r из COMPACT (3.5). 3) fill currentColor / --v4-ok-fill, те же два набора. 4) (56,5) кадра — демо. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
  [
    'Тренд здоровья · Компакт · текст',
    '1) «Тренд · N дней» :3301; «+8» :3304. 2) «26» — .num клетки. 3) Не цвет. 4) now «Тренд здоровья › за N дней» не этот кадр. Смоук: widgets-health-trend-compact-sheet-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
