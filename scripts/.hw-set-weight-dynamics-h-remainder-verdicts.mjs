import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Динамика · H сброшено и остаток · 01',
    '1) Корень — .widget-wd.widget-v4-stack, heys_widgets_ui_v1.js:7532. 2) Вид bar_remainder, heys_widgets_variants_v4.js:177. 3) Не цвет. 4) «3» — .num клетки :6552. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 02',
    '1) Шапка — .widget-wd__head, :7427. 2) space-between / baseline — 730:13536. 3) Не цвет. 4) G-кривая ту же шапку делит, этот кадр — bar_remainder. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 03',
    '1) Ключ — .widget-v4-kicker + windowLabel, :7428 / :7335. 2) label «Вес за месяц» — heys_widgets_weight_dynamics_v4.js:82. 3) Слово, не цвет. 4) «Сброшено за месяц» только у number_only. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 04',
    '1) Остаток — .widget-wd__remainder, :7348 / :7429. 2) 600 9px/1 tabular — 730:13543. 3) --v4-ink-data: песок rgba(0,0,0,.56) 002:60 / :177; синий rgba(16,24,38,.64) 002:455 / :481. 4) Текст remainderShort «осталось N», dynamics :271; bar_remainder :7105. G пишет remainderLabel. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 05',
    '1) Ряд — .widget-wd__num-row, :7431; внутри .widget-wd__delta, :7341. 2) margin-top auto — 730:13563; baseline / gap 3 — 730:13571. 3) Не цвет. 4) G держит .widget-wd__curve-row, не этот ряд. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 06',
    '1) «−1,8» — .widget-wd__delta + stateClass, :7341 / :7431. 2) Моноцифры tabular 730:13571. 3) Good — --v4-sand-ok-text: песок и синий светлый оба #5c6a45 002:247 / :536. 730:13468. 4) 2×1 кегль 21/600 — 730:13462. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 07',
    '1) Дорожка — .widget-wd__bar-track, WeightDynamicsProgressBar :7250. 2) 5 px / 999 / margin-top 7 — 730:13675. 3) --v4-line: песок и синий светлый оба rgba(0,0,0,.08) 002:191 / :488. 4) Снял оверрайд 2×1 4 px / 5: живая плитка делила превью. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · 08',
    '1) Заливка — .widget-wd__bar-fill, :7253; ширина --wd-bar-pct из goalProgressPct, не 62 % кадра. 2) height 100 % / 999 — 730:13685. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) График --c1 / .widget-wd__chart не делит. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
  [
    'Динамика · H сброшено и остаток · текст',
    '1) «Вес за месяц» :7428 / :82; «осталось N» :7106 / :271; «−1,8 кг» :7341. 2) «3» — .num клетки. 3) Не цвет. 4) G «до цели N» / «Вес по неделям» не этот кадр. Смоук: widgets-weight-dynamics-h-remainder-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
