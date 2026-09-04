import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Качество еды · Что снизило · 01',
    '1) Корень why — .widget-v4-stack.widget-v4-foodquality.widget-v4-foodquality-why, heys_widgets_ui_v1.js:6055. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид foodQuality.why 2×1, heys_widgets_variants_v4.js:162. «46» — .num клетки. Смоук: widgets-food-why-v4.test.js.',
  ],
  [
    'Качество еды · Что снизило · 02',
    '1) Шапка — .widget-v4-foodquality-why__head, :6056. 2) space-between / baseline / 6 px — 730:12761. Классы fiber-add__head и protein-add__head (730:12712 / 730:12737) не переиспользовал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Качество еды · Что снизило · 03',
    '1) Ключ — v4Kicker(\'Качество еды\'), heys_widgets_ui_v1.js:6057 / :1755. 2) .widget-v4-kicker 730:10518, у why не перебито. 3) Слово, не цвет. 4) Текст «Качество еды».',
  ],
  [
    'Качество еды · Что снизило · 04',
    '1) Факт шапки — .widget-v4-foodquality-why__score, :6059. 2) 9 px / 600 / 1 — 730:12769. 3) --v4-ink-data: песок 56 % 002:60; синий 64 % 002:455 (ступень набора). Не герой и не шалфей now. 4) «8 из 10» — formatScoreRu(score). Смоук: widgets-food-why-v4.test.js.',
  ],
  [
    'Качество еды · Что снизило · 05',
    '1) Ряд — .widget-v4-goal-hero, :6062; причина — сосед .widget-v4-unit :6071, не hint. 2) baseline / 4 px / auto — общий hero 730:12517. Mini foodquality 3 px (730:12539) не трогал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Качество еды · Что снизило · 06',
    '1) Дельта — formatScoreRu :6066 + val--neutral. 2) 19 px — .widget-v4-stack .widget-v4-goal-value 730:12615; трекинг -.02em — .widget-v4-foodquality-why .widget-v4-goal-value 730:12779, не общий stack -.03em. 3) Кадр --tx; поставил --v4-ink 730:10888: песок #201e1d 002:176; синий #101826 002:480. Шалфей now (--v4-ok-text) не открывал. 4) «−2» при score 8. Смоук: widgets-food-why-v4.test.js.',
  ],
  [
    'Качество еды · Что снизило · текст',
    '1) Слова: «Качество еды» :6057; «8 из 10» — why__score; «−2» — formatScoreRu(delta); причина — сосед unit :6071. 2) «46» — .num клетки. 3) Не цвет. 4) Hint третьей строкой нет.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
