import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тренд здоровья · падение · 01',
    '1) Та же плитка compact 2×1, heys_widgets_variants_v4.js:122. 2) 143×64 — .widget-v4-catalog__preview--2x1 730:12263; ряд 64 730:86. 3) Фон --v4-ok-bg безусловен: песок #eaefe0 002:142; синий #e4efe7 002:460. 730:10504. 4) Смоук widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · 02',
    '1) Шапка — .widget-trend-compact__head, heys_widgets_ui_v1.js:3294. 2) space-between, baseline, gap 6 — 730:14427. 3) Не цвет. 4) Общая с ростом и зоной. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · 03',
    '1) Ключ v4Kicker(`Тренд · ${formatRuUnit(periodDays, \'дней\')}`), :3295 / :1755. 2) .widget-v4-kicker 730:10518. 3) Слово, не цвет. 4) «Тренд · 14 дней» при 14. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · 04',
    '1) Низ — .widget-trend-compact__row, :3297. 2) flex-end, space-between, gap 8, margin-top auto — 730:14434. 3) Не цвет. 4) Смоук widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · 05',
    '1) Число — .widget-trend-compact__value + v4ValueStateClass(\'bad\') → widget-v4-val--bad, :3298 / :2230 / v4HealthTrendState при delta < −2 :2361. 2) 26px/600/1 — 730:14442. 3) --v4-val-bad, не --v4-bad-text: светлые песок и синий оба #a8382b 002:210 / 002:504; тёмный #e08a72 002:366. --v4-bad-text в светлых разный (#a83c22 / #b03a24) — общий .widget-v4-val--bad 730:10873 его держит, компакт перекрывает 730:14457. 4) «−6» при delta −6, минус U+2212 :3288. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · 06',
    '1) SVG — .widget-trend-compact__spark.widget-v4-spark--bad, :3301 / v4HealthTrendSparkClass(\'bad\') :2369. 2) flex none, margin-bottom 2 — 730:14461. 3) color --v4-val-bad 730:14474; polyline/circle 730:14478 / 730:14482 перекрывают --v4-bad-text с 730:11941. Светлые #a8382b, тёмный #e08a72. 4) --ok и --flat не трогал. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · рисунок 01',
    '1) Тот же SVG compact, :3301. 2) viewBox 0 0 58 24 — :3303. 3) Не цвет. 4) HEALTH_SPARK_BOX_COMPACT :3253, коробку не менял. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · рисунок 02',
    '1) polyline :3309; точки из healthSparkGeometry(values, COMPACT), :3278. 2) stroke currentColor, 2.5 — :3311. 3) currentColor = --v4-val-bad на --bad, 730:14474 / 730:14478. 4) Демо 2,5…56,20 — другие values, не хардкод; семь прогонов роста не открывал. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · рисунок 03',
    '1) circle last, :3319. 2) r 3.5 — box.dotR :3253. 3) fill currentColor = --v4-val-bad, 730:14482. 4) (56,20) — last этой серии, алгоритм не менял. Смоук: widgets-health-trend-fall-v4.test.js.',
  ],
  [
    'Тренд здоровья · падение · текст',
    '1) «Тренд · N дней» :3295; compactHero «−6» при delta −6, :3288. 2) Не цвет. 3) Рост «+8» и зона «−1» не этот кадр. 4) Смоук widgets-health-trend-fall-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
