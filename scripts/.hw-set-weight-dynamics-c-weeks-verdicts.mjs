import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Динамика · C столбики · 01',
    '1) Корень — .widget-wd.widget-v4-stack, heys_widgets_ui_v1.js:7532. 2) Вид weeks, heys_widgets_variants_v4.js:178. 3) Не цвет. 4) «5» — .num клетки :6564. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 02',
    '1) Шапка — .widget-wd__head, :7361. 2) space-between / baseline — 730:13532. 3) Не цвет. 4) G/H ту же шапку делят, этот кадр — weeks. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 03',
    '1) Ключ — .widget-v4-kicker, :7362, литерал «Вес по неделям». 2) Слово, не цвет. 3) Текст шапки уже =, не переписывал. 4) «Сброшено за месяц» только у number_only. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 04',
    '1) Боковая дельта — .widget-wd__side-delta + stateClass, :7364. 2) 700 10px/1 tabular — 730:13551. 3) Good — .widget-v4-val--good → --v4-sand-ok-text: песок и синий светлый оба #5c6a45 002:247 / :536. 730:4312. 4) Строка цвет не просит. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 05',
    '1) Ряд — .widget-wd__weeks, WeightDynamicsWeekBars :7265. 2) flex-end / gap 4 / height 24 / margin-top auto — 730:13715. data-v «высота 24px». 3) Снял оверрайд 2×1 22 px. 4) H-полоса 5/7 не делит. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 06',
    '1) Столбик — .widget-wd__week-col, :7268. 2) flex 1 / radius 2 — 730:13723; height var(--wd-week-h). 3) Фон rgba(0,0,0,.13) на светлых; 24 px кадра — стенд, не хардкод. 4) heightPct из buildWeeklyBars, dynamics :176. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 07',
    '1) Тот же .widget-wd__week-col, :7268. 2) 19 px кадра — стенд. 3) Фон тот же rgba(0,0,0,.13) на песке и синем светлом. 4) Не последний: state neutral. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 08',
    '1) Тот же .widget-wd__week-col, :7268. 2) 20 px кадра — стенд. 3) Фон тот же rgba(0,0,0,.13) на двух светлых. 4) Не последний. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
  [
    'Динамика · C столбики · 09',
    '1) Последний — .widget-wd__week-col + isLast → widget-v4-val--good, :7274. 2) 13 px кадра — стенд; heightPct из данных. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 730:13759. 4) График --c1 не делит. Смоук: widgets-weight-dynamics-c-weeks-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
