import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тренд здоровья · мёртвая зона · 01',
    '1) Та же плитка compact 2×1, heys_widgets_variants_v4.js:122. 2) 143×64 — .widget-v4-catalog__preview--2x1 730:12263; ряд 64 730:86. 3) Фон --v4-ok-bg безусловен: песок #eaefe0 002:142; синий #e4efe7 002:460. 730:10504. Состояние несёт число, не фон. 4) Смоук widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · 02',
    '1) Шапка — .widget-trend-compact__head, heys_widgets_ui_v1.js:3294. 2) space-between, baseline, gap 6 — 730:14427. 3) Не цвет. 4) Общая с кадром «рост». Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · 03',
    '1) Ключ v4Kicker(`Тренд · ${formatRuUnit(periodDays, \'дней\')}`), :3295 / :1755. 2) .widget-v4-kicker 730:10518. 3) Слово, не цвет. 4) «Тренд · 14 дней» при 14. Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · 04',
    '1) Низ — .widget-trend-compact__row, :3297. 2) flex-end, space-between, gap 8, margin-top auto — 730:14434. 3) Не цвет. 4) Смоук widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · 05',
    '1) Число — .widget-trend-compact__value + v4ValueStateClass(\'neutral\') → widget-v4-val--neutral, :3298 / :2230 / v4HealthTrendState при |delta|≤2 :2361. 2) 26px/600/1 — 730:14442. 3) --v4-ink (--tx): песок #201e1d 002:176; синий #101826 002:480. Scoped 730:14453. Рост остаётся --v4-ok-text 730:14449. 4) «−1» — минус U+2212, :3288. Порог не менял. Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · 06',
    '1) SVG — .widget-trend-compact__spark.widget-v4-spark--flat, :3301 / v4HealthTrendSparkClass(\'neutral\') :2371. 2) flex none, margin-bottom 2 — 730:14457. 3) color --v4-ink-mark (чернила 30 %): :root 002:63; песок rgb 0,0,0 002:177; синий 16,24,38 002:481. Обёртка 730:14466; polyline 730:11953. 4) --ok (--gr2) не трогал. Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · рисунок 01',
    '1) Тот же SVG compact, :3301. 2) viewBox 0 0 58 24 — :3303. 3) Не цвет. 4) HEALTH_SPARK_BOX_COMPACT :3253, коробку не менял. Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · рисунок 02',
    '1) polyline :3309; точки из healthSparkGeometry(values, COMPACT), :3278. 2) stroke currentColor, 2.5 — :3311. 3) currentColor = --v4-ink-mark на --flat, 730:14466 / 730:11953. 4) Демо-точки кадра 2,13…56,13 — проекция других values, не хардкод; семь прогонов роста не открывал. Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · рисунок 03',
    '1) circle last, :3319. 2) r 3.5 — box.dotR :3253. 3) fill currentColor = --v4-ink-mark, 730:11959. 4) (56,13) — last этой серии, алгоритм не менял. Смоук: widgets-health-trend-dead-v4.test.js.',
  ],
  [
    'Тренд здоровья · мёртвая зона · текст',
    '1) «Тренд · N дней» :3295; compactHero «−1» при delta −1, :3288. 2) Не цвет. 3) Рост «+8» и падение не этот кадр. 4) Смоук widgets-health-trend-dead-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
