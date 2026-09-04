import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Готовность ко сну · пункт без данных · 01',
    '1) Тот же корень checklist — .widget-v4-stack.widget-v4-sleepready.widget-v4-sleepready-check, heys_widgets_ui_v1.js:6296. 2) 143×64 / flex none — клетка стенда 2×1, не правило тела. 3) Не цвет. 4) Вид sleepReady.checklist 2×1, heys_widgets_variants_v4.js:170. Смоук: widgets-sleepready-dropped-v4.test.js.',
  ],
  [
    'Готовность ко сну · пункт без данных · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :6297. 2) space-between — .widget-v4-row 730:10705; baseline — --tight 730:10802. 3) Не цвет. 4) Смоук widgets-sleepready-dropped-v4.test.js.',
  ],
  [
    'Готовность ко сну · пункт без данных · 03',
    '1) Ключ рисует v4Kicker(\'К вечеру\'), :6298 / :1755. 2) .widget-v4-kicker 730:10518 одно. 3) Слово, не цвет. 4) Текст «К вечеру». Смоук: widgets-sleepready-dropped-v4.test.js.',
  ],
  [
    'Готовность ко сну · пункт без данных · 04',
    '1) Счётчик — .widget-v4-row__meta, :6299 `${done} из ${total}`. 2) 9px/600/1 — 730:10826. 3) --v4-ink-data: песок rgba(ink,.56) 002:60; синий .64 002:455. 4) «1 из 2» когда шаги выпали (total===2). Смоук: widgets-sleepready-dropped-v4.test.js / widgets-new-six-v4.test.js.',
  ],
  [
    'Готовность ко сну · пункт без данных · 05',
    '1) Слот — .widget-v4-checklist--dots, :6303. 2) wrap, margin-top auto — общий --dots 730:13144; gap 10 — scoped 730:13206. 3) Не цвет. 4) Вместо чипов — __dropped. Смоук: widgets-sleepready-dropped-v4.test.js.',
  ],
  [
    'Готовность ко сну · пункт без данных · 06',
    '1) Строка — .widget-v4-sleepready-check__dropped, :6307 sleepReadyDroppedText :6248. 2) 8.5px/600/1 — 730:13233. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. Общий .widget-v4-muted остаётся 10/700 730:10942. 4) «шаги без цели — пункт выпал из счёта». Смоук: widgets-sleepready-dropped-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
