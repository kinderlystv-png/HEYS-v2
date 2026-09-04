import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Качество еды · Как сейчас · 01',
    '1) Корень now — .widget-v4-mini.widget-v4-foodquality, heys_widgets_ui_v1.js:6071. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид foodQuality.now 1×1, heys_widgets_variants_v4.js:161. «45» — .num клетки. Смоук: widgets-food-now-v4.test.js.',
  ],
  [
    'Качество еды · Как сейчас · 02',
    '1) Ключ — v4Kicker(\'Качество\'), heys_widgets_ui_v1.js:6072 / :1755. 2) .widget-v4-kicker 730:10518, у foodquality now не перебито. 3) Слово, не цвет. 4) Текст «Качество».',
  ],
  [
    'Качество еды · Как сейчас · 03',
    '1) Ряд — .widget-v4-goal-hero, :6073; «из 10» — сосед :6077, не внутри числа. 2) baseline и auto — общий hero 730:12517; зазор 3 px — .widget-v4-mini.widget-v4-foodquality .widget-v4-goal-hero 730:12539. Общий 4 px и fiber/protein 3 px (730:12527 / 730:12533) не трогал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Качество еды · Как сейчас · 04',
    '1) Число — formatScoreRu :5768 / :6076 + val--good при score ≥ 5 (:6031). 2) 21 px mini foodquality 730:12557; 600/1/-.02em — .widget-v4-goal-value 730:12543. 3) Кадр пишет --tx; строка «качество еды · цвет» старше — шалфей от 5. Поставил --v4-ok-text 730:12563: песок #5c6a45 002:148; синий #1f6e4d 002:468. Глобальный val--good (--v4-sand-ok-text) на синем остаётся песочным — его не открывал. 4) «8» — formatScoreRu. Смоук: widgets-food-now-v4.test.js.',
  ],
  [
    'Качество еды · Как сейчас · 05',
    '1) Дорожка — .widget-v4-goalbar, v4GoalBar :5705 / :6079. 2) 4 px, 999, margin-top 7 — 730:12626. 3) Фон --v4-track по закрытой «вид · полоса цели», не 8 % кадра (730:12623). Песок и синий track 12 % 002:192 / 002:489. 4) Смоук widgets-food-now-v4.test.js.',
  ],
  [
    'Качество еды · Как сейчас · 06',
    '1) Заливка — .widget-v4-goalbar__fill, ширина (score/10)*100 :5706 / :6079. 2) height 100 %, радиус 999 — 730:12638. 3) От 67 % --v4-ok-fill 730:12645: песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) 80 % кадра — 8 из 10. Смоук: widgets-food-now-v4.test.js.',
  ],
  [
    'Качество еды · Как сейчас · текст',
    '1) Слова: «Качество» :6072; «8» — formatScoreRu; «из 10» — сосед hero :6077. 2) «45» — .num клетки. 3) Не цвет. 4) Полоса в тексте кадра нет — это 05/06, не строка текста.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
