import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Качество еды · нет данных · 01',
    '1) Плитку 1×1 рисует FoodQualityVariantBody ветка now (fallback), heys_widgets_ui_v1.js:6080. 2) Хром .widget — пара .w в widgets-v4-canvas-geometry.test.js. 3) Не цвет. 4) Вид foodQuality.now «Как сейчас» 1×1, heys_widgets_variants_v4.js:161. 68×64 flex none — размер клетки стенда, не правило тела. Смоук: widgets-food-empty-v4.test.js.',
  ],
  [
    'Качество еды · нет данных · 02',
    '1) Ключ рисует v4Kicker(\'Качество\'), heys_widgets_ui_v1.js:6081 / :1755. 2) .widget-v4-kicker 730:10518 одно; у foodquality empty не перебито. 3) Слово, не цвет. 4) Текст «Качество». Смоук: widgets-food-empty-v4.test.js.',
  ],
  [
    'Качество еды · нет данных · 03',
    '1) Auto несёт .widget-v4-goal-hero, heys_widgets_ui_v1.js:6082. 2) margin-top:auto 730:12521; позже не перебито. 3) Не цвет. 4) Смоук: widgets-food-empty-v4.test.js.',
  ],
  [
    'Качество еды · нет данных · 04',
    '1) Прочерк — .widget-v4-goal-value--empty при !hasData, heys_widgets_ui_v1.js:6085. Полосы нет :6089. 2) 21px у mini foodquality 730:12557; 600/1 у .widget-v4-goal-value 730:12545. 3) Кадр 42 %; лестница ступень не заводит — scoped foodquality --empty 730:12583 → --v4-ink-3. Песок и синий светлые rgba(0,0,0,.45) 002:180 / 002:484; тёмные 0.5 на своих чернилах 002:330 / 002:621. Правила клетчатки 730:12570 и белка 730:12576 не трогал. val--neutral / --v4-ok-text не ставил: это живые чернила числа now. 4) «—» при !hasData. Смоук: widgets-food-empty-v4.test.js.',
  ],
  [
    'Качество еды · нет данных · текст',
    '1) Слово «Качество» — ключ :6081. 2) Прочерк разобран в 04, в тексте кадра его нет. 3) Не цвет. 4) Смоук: widgets-food-empty-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
