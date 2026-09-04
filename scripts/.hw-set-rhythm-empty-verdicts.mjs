import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Ритм приёмов · нет данных · 01',
    '1) Корень empty — .widget-v4-stack.widget-v4-rhythm.widget-v4-rhythm-empty, heys_widgets_ui_v1.js:6186. 2) 143×64 / flex none — клетка стенда 2×1, не правило тела. 3) Не цвет. 4) Вид mealRhythm.day_line 2×1, heys_widgets_variants_v4.js:166. Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
  [
    'Ритм приёмов · нет данных · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, heys_widgets_ui_v1.js:6187. 2) space-between — .widget-v4-row 730:10705; baseline — --tight 730:10802. 3) Не цвет. 4) Meta справа нет. Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
  [
    'Ритм приёмов · нет данных · 03',
    '1) Ключ рисует v4Kicker(\'Ритм приёмов\'), heys_widgets_ui_v1.js:6188 / :1755. 2) .widget-v4-kicker 730:10518 одно. 3) Слово, не цвет. 4) Текст «Ритм приёмов». Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
  [
    'Ритм приёмов · нет данных · 04',
    '1) Поле — .widget-v4-rhythm-empty__line, :6190. 2) flex, center, 12px, margin-top auto — 730:13113. Живая лента остаётся 14px 730:13064. 3) Не цвет. 4) Рисует только empty. Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
  [
    'Ритм приёмов · нет данных · 05',
    '1) Дорожка — .widget-v4-rhythm-empty__track, :6191. 2) flex 1, 3px, 999 — 730:13120. 3) --v4-line 8 %: песок и синий светлые rgba(0,0,0,.08) 002:191 / 002:488. 4) Точек и риски нет. Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
  [
    'Ритм приёмов · нет данных · 06',
    '1) Подпись — .widget-v4-rhythm-empty__label, :6193 «приёмов не было». 2) 8px/600/1, margin-top 4 — 730:13127. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. 4) Не в шапке. Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
  [
    'Ритм приёмов · нет данных · текст',
    '1) Слова: «Ритм приёмов» :6188; «приёмов не было» :6193. 2) 143×64 — клетка стенда. 3) Не цвет. 4) «интервалов пока нет» — вид 49, не эта строка. Смоук: widgets-rhythm-empty-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
