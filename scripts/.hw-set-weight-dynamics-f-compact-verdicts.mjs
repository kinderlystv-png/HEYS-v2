import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Динамика · F компакт · 01',
    '1) Корень — .widget-wd.widget-v4-stack, heys_widgets_ui_v1.js:7532; тело .widget-v4-mini :7509. 2) Вид compact 1×1, heys_widgets_variants_v4.js:185, sheet:false. 3) Не цвет. 4) «7» — .num клетки :6577. Смоук: widgets-weight-dynamics-f-compact-v4.test.js.',
  ],
  [
    'Динамика · F компакт · 02',
    '1) Ключ — v4Kicker(«Мес»), :7510 → .widget-v4-kicker. 2) Слово, не цвет. 3) Было «Динамика» — кадру не отвечало. 4) D «До цели» / C «Вес по неделям» не этот вид. Смоук: widgets-weight-dynamics-f-compact-v4.test.js.',
  ],
  [
    'Динамика · F компакт · 03',
    '1) Ряд — .widget-v4-mini__value--pair, :7511. 2) baseline / gap 2 — 730:11162; margin-top auto — .widget-v4-mini__value 730:11152. 3) Не цвет. 4) E chart-value auto снимает, не этот кадр. Смоук: widgets-weight-dynamics-f-compact-v4.test.js.',
  ],
  [
    'Динамика · F компакт · 04',
    '1) Число — .widget-wd__compact-val + stateClass, :7511. 2) 17 px — 730:13462; 600 / 1 / -.02em — 730:11154. Общий mini остаётся 1.3125 rem. 3) Good — --v4-sand-ok-text: песок и синий светлый оба #5c6a45 002:247 / :536. 730:11168. 4) E / D кегль не делит. Смоук: widgets-weight-dynamics-f-compact-v4.test.js.',
  ],
  [
    'Динамика · F компакт · текст',
    '1) «Мес» :7510; «−1,8» :7512; «кг» :7514. 2) «7» — .num клетки. 3) Не цвет. 4) E «Динамика · N дней» не этот кадр. Смоук: widgets-weight-dynamics-f-compact-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
