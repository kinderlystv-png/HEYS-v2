import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Тренд здоровья · Как сейчас · 01',
    '1) Корень 2×2 — .widget-v4-stack.widget-trend-now, heys_widgets_ui_v1.js:3349. 2) Хром .widget--healthTrend. 3) Фон --v4-ok-bg (--gr-bg): песок #eaefe0 002:142; синий #e4efe7 002:460. 730:10504. 4) Вид spark «Как сейчас» 2×2, heys_widgets_variants_v4.js:121. «25» — .num клетки. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · 02',
    '1) Ключ рисует v4Kicker(\'Тренд здоровья\'), :3350 / :1755. 2) .widget-v4-kicker 730:10518. 3) Слово, не цвет. 4) Компакт пишет «Тренд · N дней», не этот кадр. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · 03',
    '1) Ряд героя — .widget-v4-hero-num, :3351. 2) baseline, gap 5, margin-top 10 — scoped .widget-trend-now 730:14488; тот же общий герой 730:11011. 3) Не цвет. 4) Компакт __row не делит. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · 04',
    '1) Число — .widget-v4-hero-num__val + v4ValueStateClass(\'good\'), :3352 / :2230. 2) 26px = 1.625rem / 600 / 1 — 730:11035. 3) --v4-ok-text (--gr): песок #5c6a45 002:148; синий #1f6e4d 002:468. Scoped 730:14494. Общий герой --good остаётся --v4-sand-ok-text 730:11052 (синий светлый тоже #5c6a45). 4) «+8» при delta 8. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · рисунок 01',
    '1) WidgetV4DrawSparkSvg, :3357. 2) viewBox 0 0 130 40, width 100%, height 40 — :3359 / :2022. 3) Не цвет. 4) .widget-v4-spark 730:11137. HEALTH_SPARK_BOX_LARGE :3254, коробку не менял. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · рисунок 02',
    '1) path.widget-v4-spark__line, WidgetV4DrawSparkSvg :2030; точки из healthSparkGeometry(values, LARGE), :3332. 2) strokeWidth 2.5 — :2035. 3) stroke --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. .widget-v4-spark--ok :11915 / v4HealthTrendSparkClass(\'good\') :2368. 4) Демо 4,32…126,8 — стенд кадра, не хардкод; семь прогонов 2×1 не открывал. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · рисунок 03',
    '1) circle.widget-v4-spark__dot, :2040. 2) r 3.5 — dotR по умолчанию :2011 и box.dotR :3254. 3) fill --v4-ok-fill, 730:11920. 4) cx/cy last LARGE; (126,8) кадра — демо, алгоритм не менял. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
  [
    'Тренд здоровья · Как сейчас · текст',
    '1) «Тренд здоровья» :3350; «+8» hero :3340; «за N дней» :3355. 2) «25» — .num клетки. 3) Не цвет. 4) Компакт «Тренд · N дней» не этот кадр. Смоук: widgets-health-trend-now-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
