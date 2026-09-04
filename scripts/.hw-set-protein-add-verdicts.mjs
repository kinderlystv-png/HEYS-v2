import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Белок · Добрать · 01',
    '1) Корень add — .widget-v4-stack.widget-v4-protein.widget-v4-protein-add, heys_widgets_ui_v1.js:5915. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид protein.add 2×1, heys_widgets_variants_v4.js:153. Смоук: widgets-protein-add-v4.test.js.',
  ],
  [
    'Белок · Добрать · 02',
    '1) Шапка — .widget-v4-protein-add__head, :5916. 2) space-between, baseline, gap 6px — 730:12640. Классы fiber-add не брал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Белок · Добрать · 03',
    '1) Ключ — v4Kicker(\'Белок\'), :5917 / :1755. 2) .widget-v4-kicker 730:10518, у protein-add не перебито. 3) Слово, не цвет. 4) Текст «Белок».',
  ],
  [
    'Белок · Добрать · 04',
    '1) Факт — .widget-v4-protein-add__now, :5919, `${protein} из ${target} г`. 2) 9px/600/1 — 730:12648. 3) --v4-ink-data: песок rgba(0,0,0,.56) 002:60+177; синий rgba(16,24,38,.64) 002:455+481. 4) «112 из 140 г» — демо.',
  ],
  [
    'Белок · Добрать · 05',
    '1) Герой — .widget-v4-goal-hero, :5922. 2) baseline, gap 4px, margin-top auto — общий 730:12517. Mini protein 3 px (730:12533) не трогал. 3) Не цвет. 4) «+N» и «г добрать» — соседи, не muted.',
  ],
  [
    'Белок · Добрать · 06',
    '1) «+N» — .widget-v4-goal-value + val--neutral, :5924; сосед «г добрать» :5931. 2) 19 px stack 730:12558; трекинг -.02em — .widget-v4-protein-add .widget-v4-goal-value 730:12658. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. 4) «+28» — remaining.',
  ],
  [
    'Белок · Добрать · текст',
    '1) Слова: «Белок» :5917; «112 из 140 г» :5919; «+28» :5926; «г добрать» :5931. 2) «41» — .num клетки. 3) Не цвет. 4) Hint нет — решение 22 августа, в контракте нет 07.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
