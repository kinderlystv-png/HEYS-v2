import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Белок · нет данных · 01',
    '1) Плитку 1×1 рисует ProteinVariantBody ветка now (fallback), heys_widgets_ui_v1.js:5937. 2) Хром .widget — пара .w в widgets-v4-canvas-geometry.test.js. 3) Не цвет. 4) Вид protein.now «Как сейчас» 1×1, heys_widgets_variants_v4.js:152. 68×64 flex none — размер клетки стенда, не правило тела. Смоук: widgets-protein-empty-v4.test.js.',
  ],
  [
    'Белок · нет данных · 02',
    '1) Ключ рисует v4Kicker(\'Белок\'), heys_widgets_ui_v1.js:5938 / :1755. 2) .widget-v4-kicker 730:10518 одно; у protein empty не перебито. 3) Слово, не цвет. 4) Текст «Белок». Смоук: widgets-protein-empty-v4.test.js.',
  ],
  [
    'Белок · нет данных · 03',
    '1) Auto несёт .widget-v4-goal-hero, heys_widgets_ui_v1.js:5939. 2) margin-top:auto 730:12521; позже не перебито. 3) Не цвет. 4) Смоук: widgets-protein-empty-v4.test.js.',
  ],
  [
    'Белок · нет данных · 04',
    '1) Прочерк — .widget-v4-goal-value--empty при !hasData, heys_widgets_ui_v1.js:5941. Полосы нет :5946. 2) 21px у mini protein 730:12547; 600/1 у .widget-v4-goal-value 730:12537. 3) Кадр 42 %; лестница ступень не заводит — scoped protein --empty 730:12560 → --v4-ink-3. Песок и синий светлые rgba(0,0,0,.45) 002:180 / 002:484; тёмные 0.5 на своих чернилах 002:330 / 002:621. Правило клетчатки 730:12554 не трогал. val--neutral не ставил: это живые чернила числа. 4) «—» при !hasData. Смоук: widgets-protein-empty-v4.test.js.',
  ],
  [
    'Белок · нет данных · текст',
    '1) Слово «Белок» — ключ :5938. 2) Прочерк разобран в 04, в тексте кадра его нет. 3) Не цвет. 4) Смоук: widgets-protein-empty-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
