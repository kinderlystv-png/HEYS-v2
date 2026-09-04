import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Готовность ко сну · Разбор · 10',
    '1) Подпись — .widget-v4-checklist__label, :6291 item.label. 2) flex 1, 10px/600/1 — 730:13268. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. is-done не красит sand-ok (730:13264). 4) «Вода». Смоук: widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 11',
    '1) Значение — .widget-v4-checklist__value, :6292 sleepReadyItemText. 2) 8.5px/600/1 — 730:13276. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. Общий value остаётся --v4-ink. 4) «2,4 из 2,7 л» — formatLitersRu. Смоук: widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 12',
    '1) Точка открытого — тот же __dot без is-done, :6288. 2) 7×7, 999 — 730:13283. 3) --v4-line 8 %: песок и синий светлые rgba(0,0,0,.08) 002:191 / 002:488. 4) Смоук widgets-sleepready-review-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
