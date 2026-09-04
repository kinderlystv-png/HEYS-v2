import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Окно до сна · Как сейчас · 01',
    '1) Корень now — .widget-v4-mini.widget-v4-sleepwindow, heys_widgets_ui_v1.js:5998. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид sleepWindow.now 1×1, heys_widgets_variants_v4.js:157. «43» — .num клетки. Смоук: widgets-sleep-now-v4.test.js.',
  ],
  [
    'Окно до сна · Как сейчас · 02',
    '1) Ключ — v4Kicker(\'До сна\'), heys_widgets_ui_v1.js:5999 / :1755. 2) .widget-v4-kicker 730:10518, у sleep now не перебито. 3) Слово, не цвет. 4) Текст «До сна».',
  ],
  [
    'Окно до сна · Как сейчас · 03',
    '1) Ряд — .widget-v4-goal-hero, :6000; слово — сосед :6004, не вторая строка. 2) baseline и auto — общий hero 730:12518 / 730:12521; зазор 5 px — .widget-v4-mini.widget-v4-sleepwindow .widget-v4-goal-hero 730:12566. Общий 4 px и fiber/protein 3 px (730:12528 / 730:12533) не трогал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Окно до сна · Как сейчас · 04',
    '1) Число — formatHoursColon :5747 / :6003 + val--good при state good. 2) 21 px mini sleep 730:12570; 600/1/-.02em — .widget-v4-goal-value 730:12537. 3) Кадр пишет --gr (заливка); роли заливки текст не красят 730:4308. Поставил --v4-ok-text 730:12577: песок #5c6a45 002:148; синий #1f6e4d 002:468. Глобальный val--good (--v4-sand-ok-text) на синем остаётся песочным — его не открывал. 4) «2:40» — 160 мин. Смоук: widgets-sleep-now-v4.test.js.',
  ],
  [
    'Окно до сна · Как сейчас · 05',
    '1) Слово — .widget-v4-unit, data.word :6004. 2) 8.5 px / 500 / 1 — scoped 730:12582. Общий unit 10 px 730:10845 не трогал. 3) --v4-ink-data: :root 56 % 002:60; синий 64 % 002:455 (ступень набора, не новый процент). 4) «чисто» — widget_data.js:966 при ≥180 мин.',
  ],
  [
    'Окно до сна · Как сейчас · текст',
    '1) Слова: «До сна» :5999; «2:40» — formatHoursColon; «чисто» — data.word. 2) «43» — .num клетки. 3) Не цвет. 4) Второй строки под числом нет.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
