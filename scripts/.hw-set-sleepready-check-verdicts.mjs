import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Готовность ко сну · Чек-лист · 01',
    '1) Корень checklist — .widget-v4-stack.widget-v4-sleepready.widget-v4-sleepready-check, heys_widgets_ui_v1.js:6296. 2) Хром .widget — пара .w в widgets-v4-canvas-geometry.test.js. 3) Не цвет. 4) Вид sleepReady.checklist «Чек-лист» 2×1, heys_widgets_variants_v4.js:170. «50» — .num клетки. Смоук: widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :6297. 2) space-between — .widget-v4-row 730:10705; baseline, gap 6 — --tight 730:10802. 3) Не цвет. 4) Смоук widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 03',
    '1) Ключ рисует v4Kicker(\'К вечеру\'), :6298 / :1755. 2) .widget-v4-kicker 730:10518 одно; у чек-листа не перебито. 3) Слово, не цвет. 4) Текст «К вечеру». Смоук: widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 04',
    '1) Счётчик — .widget-v4-row__meta, :6299 `${done} из ${total}`. 2) 9px/600/1 — 730:10826. 3) --v4-ink-data: песок rgba(ink,.56) 002:60; синий .64 002:455. --count (9.5/700) не ставил. 4) «2 из 3» при done===2 && total===3. Смоук: widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 05',
    '1) Ряд — .widget-v4-checklist.widget-v4-checklist--dots, :6303. 2) wrap, margin-top auto — общий --dots 730:13144; gap 10 — scoped .widget-v4-sleepready-check 730:13206. 3) Не цвет. 4) Только checklist, не разбор. Смоук: widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 06',
    '1) Закрытый чип — .widget-v4-checklist__chip.is-done, :6310. 2) inline-flex, center — общий chip 730:13151; gap 4, 8.5/600/1 — scoped 730:13210. 3) --v4-ok-text (--gr): песок #5c6a45 002:148; синий #1f6e4d 002:468. Не --v4-sand-ok-text. 4) Класс is-done когда item.done. Смоук: widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 07',
    '1) Точка закрытого — .widget-v4-checklist__dot внутри is-done, :6314. 2) 6×6, 999 — общий 730:13169. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. Scoped 730:13226, без currentColor+opacity. 4) Смоук widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 08',
    '1) Открытый чип — тот же .widget-v4-checklist__chip без is-done, :6310. 2) center, gap 4, 8.5/600/1 — 730:13151 / 730:13210. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. 4) Смоук widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · 09',
    '1) Точка открытого — .widget-v4-checklist__dot, :6314. 2) 6×6, 999 — 730:13169. 3) --v4-line 8 %: песок и синий светлые rgba(0,0,0,.08) 002:191 / 002:488. Scoped 730:13221, не currentColor opacity .35. 4) Смоук widgets-sleepready-check-v4.test.js.',
  ],
  [
    'Готовность ко сну · Чек-лист · текст',
    '1) Слова: «К вечеру» :6298; «N из M» :6300; чипы item.label.toLowerCase() :6315 (вода / еда до сна / шаги). 2) «50» — .num клетки. 3) Не цвет. 4) Кофеин — четвёртый пункт продукта; в кадре не нарисован, в плитке появляется когда hasData. Выпавший пункт — кадр «пункт без данных», не эта строка. Смоук: widgets-sleepready-check-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
