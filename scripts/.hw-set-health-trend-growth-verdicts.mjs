import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тренд здоровья · рост · 01',
    '1) Плитка — .widget.widget--healthTrend.widget--2x1, вид compact, heys_widgets_variants_v4.js:122. 2) 143×64 — превью .widget-v4-catalog__preview--2x1 730:12263; ряд сетки --widget-row-height 64 730:86. 3) Фон --v4-ok-bg (--gr-bg): песок #eaefe0 002:142; синий #e4efe7 002:460. body:has(.widgets-tab) .widget--healthTrend 730:10504. 4) Смоук widgets-health-trend-growth-v4.test.js.',
  ],
  [
    'Тренд здоровья · рост · 02',
    '1) Шапка — .widget-trend-compact__head, heys_widgets_ui_v1.js:3294. 2) space-between, baseline, gap 6 — 730:14427. 3) Не цвет. 4) Один ребёнок (ключ); ряд как в кадре. Смоук: widgets-health-trend-growth-v4.test.js.',
  ],
  [
    'Тренд здоровья · рост · 03',
    '1) Ключ рисует v4Kicker(`Тренд · ${formatRuUnit(periodDays, \'дней\')}`), :3295 / :1755. 2) .widget-v4-kicker 730:10518 одно; у компакта не перебито. 3) Слово, не цвет. 4) «Тренд · 14 дней» при periodDays 14 (nbsp). Пустое по-прежнему «Тренд здоровья · N дней». Смоук: widgets-health-trend-growth-v4.test.js.',
  ],
  [
    'Тренд здоровья · рост · 04',
    '1) Низ — .widget-trend-compact__row, :3297. 2) flex-end, space-between, gap 8, margin-top auto — 730:14434. 3) Не цвет. 4) Число слева, SVG справа. Смоук: widgets-health-trend-growth-v4.test.js.',
  ],
  [
    'Тренд здоровья · рост · 05',
    '1) Число — .widget-trend-compact__value + v4ValueStateClass(\'good\') → widget-v4-val--good, :3298 / :2230. 2) 26px/600/1 — 730:14442. 3) --v4-ok-text (--gr), не sand-ok: песок #5c6a45 002:148; синий #1f6e4d 002:468. Scoped 730:14449. Общий .widget-v4-val--good остаётся --v4-sand-ok-text (синий светлый тоже #5c6a45 002:536). 4) «+8» при delta 8. Смоук: widgets-health-trend-growth-v4.test.js.',
  ],
  [
    'Тренд здоровья · рост · 06',
    '1) Обёртка SVG — .widget-trend-compact__spark.widget-v4-spark--ok, :3301 / v4HealthTrendSparkClass(\'good\') :2368. 2) flex none, margin-bottom 2 — 730:14453. 3) color --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 730:14458 и polyline 730:11916. 4) Только рост; --flat/--bad не трогал. Смоук: widgets-health-trend-growth-v4.test.js.',
  ],
  [
    'Тренд здоровья · рост · рисунок 01',
    '1) SVG compact, :3301. 2) viewBox 0 0 58 24, width 58, height 24 — :3303. 3) Не цвет. 4) Коробка HEALTH_SPARK_BOX_COMPACT :3253. Смоук: widgets-health-trend-growth-v4.test.js + линия в widgets-v4-canvas-geometry.test.js.',
  ],
  [
    'Тренд здоровья · рост · рисунок 02',
    '1) polyline, :3309; точки из healthSparkGeometry(values, HEALTH_SPARK_BOX_COMPACT), :3278 / :3232. 2) stroke currentColor, strokeWidth 2.5 — :3311. 3) currentColor = --v4-ok-fill на --ok, 730:14458 / 730:11916. 4) Семь values стенда дают 2,18…56,4 — гейт geometry, точки не хардкодил. Смоук: widgets-v4-canvas-geometry.test.js.',
  ],
  [
    'Тренд здоровья · рост · рисунок 03',
    '1) circle на последнем дне, :3319. 2) r из box.dotR 3.5 — HEALTH_SPARK_BOX_COMPACT :3253; cx/cy last. 3) fill currentColor — тот же --v4-ok-fill, 730:11921. 4) Кадр (56,4) — last семи прогонов, алгоритм не менял. Смоук: widgets-v4-canvas-geometry.test.js.',
  ],
  [
    'Тренд здоровья · рост · текст',
    '1) Слова: «Тренд · N дней» :3295; знак и число compactHero :3288 («+8» при delta 8). 2) Не цвет. 3) Пустое и 2×2 («Тренд здоровья», «за N дней») не этот кадр. 4) Смоук widgets-health-trend-growth-v4.test.js; копия — BUILT «Тренд · 14 дней».',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
