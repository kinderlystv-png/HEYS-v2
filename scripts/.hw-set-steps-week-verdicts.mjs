import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Шаги · Неделя · 01',
    '1) Корень — .widget-v4-stack.widget-v4-steps.widget-v4-steps--week, heys_widgets_ui_v1.js:5674. 2) Дефолт week 2×1, heys_widgets_variants_v4.js:134. 3) Не цвет. 4) «35» — .num клетки кадра :8745. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :5675. 2) space-between — 730:10708; baseline / gap 6 — 730:10802. 3) Не цвет. 4) Месяц ту же шапку делит, этот кадр — week. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 03',
    '1) Ключ — .widget-v4-kicker, v4Kicker(\'Шаги\') :1755 / :5676. 2) nowrap — 730:10974 .widget-v4-steps--week .widget-v4-kicker. 3) Слово, не цвет. 4) «Шаги · месяц» только у month. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 04',
    '1) Подпись — .widget-v4-row__meta, :5681, `в среднем ${formatRuThousands(avg)}`. 2) 600 9px/1 tabular — 730:10826. Figtree — body:has(.widgets-tab) .widgets-grid, 730:10473. 3) --v4-ink-data: песок 0.56 002:60; синий 0.64 002:455. 4) Состояние несут столбики, не шапка. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 05',
    '1) Ряд — .widget-v4-stepbars, v4StepsBars :5628. 2) flex-end / gap 3 / height 30 / margin-top auto — 730:10981. data-v «высота 30px». 3) Месяц берёт --month, gap другой. 4) Динамика C ряд 24 не делит. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 06',
    '1) Столбик — .widget-v4-stepbars__bar, :5634. 2) flex 1 / radius 2 2 0 0 — 730:10994; height value/max × 30, :5637. 3) Фон литерал #b7c29b: песок и синий светлый оба #b7c29b. 4) 26 px кадра — стенд, не хардкод. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 07',
    '1) Тот же .widget-v4-stepbars__bar, :5634. 2) 21 px кадра — стенд. 3) Фон тот же #b7c29b на двух светлых. 4) Не норма: без is-goal. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 08',
    '1) Тот же бар + is-goal при value >= goal, :5631 / :5636. 2) 30 px кадра — стенд, потолок ряда. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 730:11003. 4) Динамика E --c1 не делит. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 09',
    '1) Тот же .widget-v4-stepbars__bar, :5634. 2) 17 px кадра — стенд. 3) Фон #b7c29b на песке и синем светлом. 4) Не норма. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 10',
    '1) Тот же бар + is-goal, :5636. 2) 29 px кадра — стенд; height из данных. 3) --v4-ok-fill: песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) Соседей F/C/H не делит. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 11',
    '1) Тот же .widget-v4-stepbars__bar, :5634. 2) 25 px кадра — стенд. 3) Фон #b7c29b на двух светлых. 4) Не последний. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · 12',
    '1) Тот же .widget-v4-stepbars__bar, :5634. 2) 27 px кадра — стенд. 3) Фон #b7c29b на двух светлых. 4) Не норма. Смоук: widgets-steps-week-v4.test.js.',
  ],
  [
    'Шаги · Неделя · текст',
    '1) Слова: «Шаги» :5676; «в среднем N» — formatRuThousands(avgWeek). 2) «35» — номер клетки кадра (.num), не копия. 3) Не цвет. 4) Смоук: widgets-steps-week-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v !== '?',
  });
  if (result.skipped) {
    console.error(`${key} уже ${result.was.v}, не трогаю`);
    process.exit(1);
  }
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
