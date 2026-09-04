import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Динамика · D до цели · 01',
    '1) Корень — .widget-wd.widget-v4-stack, heys_widgets_ui_v1.js:7532. 2) Вид to_goal, heys_widgets_variants_v4.js:184. 3) Не цвет. 4) «6» — .num клетки :6570. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 02',
    '1) Шапка — .widget-wd__head, :7379. 2) space-between / baseline — 730:13532. 3) Не цвет. 4) C/G/H ту же шапку делят, этот кадр — to_goal. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 03',
    '1) Ключ — .widget-v4-kicker, :7380, литерал «До цели». 2) Слово, не цвет. 3) «Вес по неделям» / «Вес за месяц» не этот вид. 4) Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 04',
    '1) Темп — .widget-wd__side-delta + monthRate, :7382 / :7352. 2) 700 10px/1 tabular — 730:13551. Текст «N / мес». 3) Good — --v4-sand-ok-text: песок и синий светлый оба #5c6a45 002:247 / :536. 730:4312. 4) Строка цвет не просит. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 05',
    '1) Остаток — .widget-wd__goal-main, :7389. 2) margin-top auto — 730:13767. 3) Не цвет. 4) Канвас оборачивает число+полосу; продукт вешает auto на первое тело, полоса за ним. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 06',
    '1) Ряд числа — .widget-wd__goal-main, :7389. 2) baseline / gap 4 — 730:13765. 3) Не цвет. 4) C ряд 24 / H дельта gap 3 не этот класс. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 07',
    '1) «3,6» — formatRuDecimal(remainAbs) + .widget-v4-unit «кг», :7390. 2) tabular 730:13771. 3) Кадр без .good — stateClass на число не вешал. 4) 2×1 кегль 21/600 — 730:13463, строка кегль не просит. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 08',
    '1) Дорожка — .widget-wd__bar-track, WeightDynamicsProgressBar :7394 / :7250. 2) 5 px / 999 / margin-top 7 — 730:13671. Та же, что у H, не менял. 3) --v4-line: песок и синий светлый оба rgba(0,0,0,.08) 002:191 / :488. 4) Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · 09',
    '1) Заливка — .widget-wd__bar-fill, :7253; ширина --wd-bar-pct из goalProgressPct, не 62 % кадра. 2) height 100 % / 999 — 730:13681. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) C столбики / график --c1 не делит. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
  [
    'Динамика · D до цели · текст',
    '1) «До цели» :7380; «N / мес» :7355 / :7382; «3,6 кг» :7390. 2) «6» — .num клетки. 3) Не цвет. 4) C «Вес по неделям» / G «до цели N» не этот кадр. Смоук: widgets-weight-dynamics-d-goal-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
