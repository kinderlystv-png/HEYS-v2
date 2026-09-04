import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Готовность ко сну · Разбор · 01',
    '1) Корень review — .widget-v4-stack.widget-v4-sleepready.widget-v4-sleepready-review, heys_widgets_ui_v1.js:6263. 2) Хром .widget — пара .w в widgets-v4-canvas-geometry.test.js. 3) Не цвет. 4) Вид sleepReady.review «Разбор» 2×2, heys_widgets_variants_v4.js:171. «51» — .num клетки. Смоук: widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :6264. 2) space-between — .widget-v4-row 730:10705; baseline — --tight 730:10802. 3) Не цвет. 4) Смоук widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 03',
    '1) Ключ рисует v4Kicker(\'К вечеру\'), :6265 / :1755. 2) .widget-v4-kicker 730:10518 одно. 3) Слово, не цвет. 4) Текст «К вечеру». Смоук: widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 04',
    '1) Meta — .widget-v4-row__meta, :6267 `до отбоя ${formatHoursColon}`. 2) 9px/600/1 — 730:10826. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. 4) «до отбоя 2:40» при 160 мин. Смоук: widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 05',
    '1) Герой — .widget-v4-goal-hero, :6271. 2) baseline — общий 730:12517; gap 5, margin-top 7 — scoped 730:13242. Общий hero остаётся gap 4 / auto. 3) Не цвет. 4) Смоук widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 06',
    '1) Число — .widget-v4-goal-value, :6272 String(data.done). 2) 26px/.9/-.03em — 730:13247. Общий stack 19 px жив. 3) --v4-ink (--tx): песок #201e1d 002:176; синий #101826 002:480. Не шалфей. 4) Смоук widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 07',
    '1) Список — .widget-v4-checklist без --dots, :6282. 2) column — общий 730:13137; gap 8, margin-top auto — scoped 730:13254. Общий gap 5 / margin 8 жив. 3) Не цвет. 4) Только review. Смоук: widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 08',
    '1) Ряд — .widget-v4-checklist__row, :6285. 2) center, gap 7 — scoped 730:13259. Общий row baseline / gap 8 жив. 3) Не цвет. 4) Смоук widgets-sleepready-review-v4.test.js.',
  ],
  [
    'Готовность ко сну · Разбор · 09',
    '1) Точка закрытого — .widget-v4-sleepready-review__dot в is-done, :6288. 2) flex none, 7×7, 999 — 730:13283. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. 730:13291. Чип чек-листа остаётся 6 px. 4) Смоук widgets-sleepready-review-v4.test.js.',
  ],
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
