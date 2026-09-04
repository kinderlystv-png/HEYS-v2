import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Белок · Как сейчас · 01',
    '1) Корень now — .widget-v4-mini.widget-v4-protein, heys_widgets_ui_v1.js:5928. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид protein.now 1×1, heys_widgets_variants_v4.js:152. Смоук: widgets-protein-now-v4.test.js.',
  ],
  [
    'Белок · Как сейчас · 02',
    '1) Ключ — v4Kicker(\'Белок\'), heys_widgets_ui_v1.js:5929 / :1755. 2) .widget-v4-kicker 730:10518, у protein now не перебито. 3) Слово, не цвет. 4) Текст «Белок».',
  ],
  [
    'Белок · Как сейчас · 03',
    '1) Ряд — .widget-v4-goal-hero, :5930; «г» — сосед :5935, не внутри числа. 2) baseline и auto — общий hero 730:12517; зазор 3 px — .widget-v4-mini.widget-v4-protein .widget-v4-goal-hero 730:12533. Общий 4 px и fiber 3 px (730:12527) не трогал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Белок · Как сейчас · 04',
    '1) Число — .widget-v4-goal-value + val--neutral, :5931. 2) 21 px mini protein 730:12546; 600/1/-.02em — .widget-v4-goal-value 730:12537. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. 4) «112» — String(protein). Смоук: widgets-protein-now-v4.test.js.',
  ],
  [
    'Белок · Как сейчас · 05',
    '1) Дорожка — .widget-v4-goalbar, v4GoalBar :5705. 2) 4 px, 999, margin-top 7 — 730:12569. 3) Фон --v4-track по закрытой «вид · полоса цели», не 8 % кадра (730:12566). Песок и синий track 12 % 002:192 / 002:489. 4) Смоук goal-bar-contract.',
  ],
  [
    'Белок · Как сейчас · 06',
    '1) Заливка — .widget-v4-goalbar__fill, ширина из pct :5706 / :5937. 2) height 100 %, радиус 999 — 730:12581. 3) От 67 % --v4-ok-fill: песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) 80 % кадра — демо 112/140; продукт Math.round(protein/target×100), widget_data.js:931.',
  ],
  [
    'Белок · Как сейчас · текст',
    '1) Слова: «Белок» :5929; «112» — String(protein). 2) «40» — .num клетки. 3) Не цвет. 4) Единица «г» в тексте кадра нет — сосед hero, не строка контракта.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
