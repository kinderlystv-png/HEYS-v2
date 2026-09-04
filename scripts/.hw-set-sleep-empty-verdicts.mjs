import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Окно до сна · нет данных · 01',
    '1) Плитку 1×1 рисует SleepWindowVariantBody now, heys_widgets_ui_v1.js:5999. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид sleepWindow.now 1×1, heys_widgets_variants_v4.js:157. 68×64 flex none — клетка стенда. Смоук: widgets-sleep-empty-v4.test.js.',
  ],
  [
    'Окно до сна · нет данных · 02',
    '1) Ключ — v4Kicker(\'До сна\'), :6000 / :1755. 2) .widget-v4-kicker 730:10518, у empty не перебито. 3) Слово, не цвет. 4) Текст «До сна».',
  ],
  [
    'Окно до сна · нет данных · 03',
    '1) Ряд — .widget-v4-goal-hero, :6001; «не ел» — сосед :6006. 2) baseline и auto — общий hero 730:12518 / 730:12521; зазор 5 px — scoped mini sleep 730:12566 (поставлен на «Как сейчас», empty его не менял). 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Окно до сна · нет данных · 04',
    '1) Прочерк — .widget-v4-goal-value--empty при !hasData, :6003. Полосы нет. 2) 21 px mini sleep 730:12570; 600/1 — .widget-v4-goal-value 730:12537. 3) Кадр 42 %; лестница ступень не заводит — scoped sleep --empty 730:12591 → --v4-ink-3. Песок и синий светлые rgba(0,0,0,.45) 002:180 / 002:484; тёмные 0.5 002:330 / 002:621. val--neutral не ставил: это живые чернила числа now. 4) «—» при !hasData. Смоук: widgets-sleep-empty-v4.test.js.',
  ],
  [
    'Окно до сна · нет данных · 05',
    '1) «не ел» — .widget-v4-unit--empty, :6006 / :6009. 2) 7.5 px — scoped 730:12595. Живое «чисто» остаётся 8.5 px 730:12582. 3) Цвет слова — --v4-ink-data того же unit: :root 56 % 002:60; синий 64 % 002:455. 4) Evening по-прежнему пишет «приёмов не было» :5982 — этот кадр 1×1, не 2×1.',
  ],
  [
    'Окно до сна · нет данных · текст',
    '1) Слова: «До сна» :6000; «не ел» :6009. 2) Прочерк разобран в 04, в тексте кадра его нет. 3) Не цвет. 4) Смоук: widgets-sleep-empty-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
