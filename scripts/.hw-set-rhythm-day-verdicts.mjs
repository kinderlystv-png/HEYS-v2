import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Ритм приёмов · Лента дня · 01',
    '1) Корень day_line — .widget-v4-stack.widget-v4-rhythm.widget-v4-rhythm-day, heys_widgets_ui_v1.js:6158. 2) Хром .widget — пара .w в widgets-v4-canvas-geometry.test.js. 3) Не цвет. 4) Вид mealRhythm.day_line «Лента дня» 2×1, heys_widgets_variants_v4.js:166. «48» — .num клетки. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, heys_widgets_ui_v1.js:6159. 2) space-between — .widget-v4-row 730:10707; baseline 730:10804, gap 6 — --tight 730:10805. 3) Не цвет. 4) Смоук widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 03',
    '1) Ключ рисует v4Kicker(\'Ритм приёмов\'), heys_widgets_ui_v1.js:6160 / :1755. 2) .widget-v4-kicker 730:10518 одно; у ленты не перебито. 3) Слово, не цвет. 4) Текст «Ритм приёмов». Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 04',
    '1) Счётчик — .widget-v4-row__meta, :6161 `${count} за день`. 2) 9px/600/1 — 730:10827. 3) --v4-ink-data: песок rgba(0,0,0,.56) 002:60; синий .64 002:455. --count (9.5/700) не ставил. 4) «4 за день» при count === 4. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 05',
    '1) Поле — .widget-v4-rhythm__line, heys_widgets_ui_v1.js:6165. 2) relative, 14px, margin-top:auto — 730:13018. 3) Не цвет. 4) Рисует только day_line, не интервалы. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 06',
    '1) Дорожка — .widget-v4-rhythm__track, :6166. 2) absolute, 3px, translateY(-50%), 999 — 730:13024. 3) --v4-line 8 %: песок и синий светлые rgba(0,0,0,.08) 002:191 / 002:488. Не --v4-track 12 %. 4) Смоук widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 07',
    '1) Точка — .widget-v4-rhythm__dot, :6174. 2) 8×8, translate(-50%,-50%), 999 — 730:13035. 3) --v4-ok-fill (--gr2): песок #7a8a5e 002:167; синий #4f9a78 002:477. Кадр синий рисует #3e9a6b (--v4-good); старше «фон var(--gr2)». Было --v4-sand-ok-fill. Красного нет. 4) left — rhythmLeftPct. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 08',
    '1) Риска — .widget-v4-rhythm__now, :6169. 2) absolute, 2px, top/bottom 0 — 730:13045. 3) --v4-ink (--tx): песок #201e1d 002:176; синий #101826 002:480. Не --v4-ink-3. 4) left — nowMinutes. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · 09',
    '1) Шкала — .widget-v4-rhythm__scale, :6178. 2) space-between, 8px/600/1, margin-top 4 — 730:13054. 3) --v4-ink-data: песок .56 002:60; синий .64 002:455. 4) «6:00» / «24:00» :6179. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
  [
    'Ритм приёмов · Лента дня · текст',
    '1) Слова: «Ритм приёмов» :6160; «N за день» :6162; «6:00» / «24:00» :6179. 2) «48» — .num клетки. 3) Не цвет. 4) Точки и риска — строки 07/08, не эта. Смоук: widgets-rhythm-day-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
