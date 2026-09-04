import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Окно до сна · Вечер · 01',
    '1) Корень evening — .widget-v4-stack.widget-v4-sleepwindow, heys_widgets_ui_v1.js:5970. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид sleepWindow.evening 2×1, heys_widgets_variants_v4.js:158. «44» — .num клетки. Смоук: widgets-sleep-evening-v4.test.js.',
  ],
  [
    'Окно до сна · Вечер · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :5971. 2) space-between — .widget-v4-row 730:10708; baseline и gap 6 — .widget-v4-row--tight 730:10802. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Окно до сна · Вечер · 03',
    '1) Ключ — v4Kicker(\'До сна\'), :5972 / :1755. 2) .widget-v4-kicker 730:10518, у evening не перебито. 3) Слово, не цвет. 4) Текст «До сна».',
  ],
  [
    'Окно до сна · Вечер · 04',
    '1) «отбой …» — .widget-v4-row__meta, :5973; время — formatHoursColon(bedtime) :5965. 2) 9 px / 600 / 1 — 730:10826. 3) --v4-ink-data: :root 56 % 002:60; синий 64 % 002:455. 4) «23:00» — 1380 мин, когда отбой задан.',
  ],
  [
    'Окно до сна · Вечер · 05',
    '1) Ряд — .widget-v4-goal-hero, :5977; слово — сосед :5981. 2) baseline / gap 4 / auto — общий hero 730:12518–12521. Mini sleep now 5 px (730:12566) не трогал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Окно до сна · Вечер · 06',
    '1) Число — formatHoursColon :5980 + val--good при state good. 2) 19 px — .widget-v4-stack .widget-v4-goal-value 730:12589; трекинг -.02em — scoped 730:12655 (общий stack -.03em жив). 3) Кадр пишет --gr; роли заливки текст не красят. Поставил --v4-ok-text 730:12659: песок #5c6a45 002:148; синий #1f6e4d 002:468. Mini now 21 px не трогал. 4) «2:40» — 160 мин.',
  ],
  [
    'Окно до сна · Вечер · 07',
    '1) Дорожка — .widget-v4-goalbar--marked, :5986. Это полоса вечера, не «вид · полоса цели». 2) flex / center / gap 0 / 5 px / 6 px / hidden — 730:12626. 3) Фон --v4-line 8 %: песок 002:191; синий 002:488. Общий .widget-v4-goalbar остаётся --v4-track 12 % 730:12600. 4) Смоук: widgets-sleep-evening-v4.test.js.',
  ],
  [
    'Окно до сна · Вечер · 08',
    '1) Заливка — .widget-v4-goalbar__fill, ширина minutes/max(span,minutes) :5969 / :5989. 2) height 5 px, без радиуса — 730:12636. 3) Кадр #b7c29b — «цвета не из палитры»; good → --v4-ok-fill 730:12642: песок #7a8a5e 002:167; синий #4f9a78 002:477. Порог 67 % is-on-track не ставил. 4) 68 % кадра — демо; при 2:40 от приёма до отбоя продукт даёт 100 %.',
  ],
  [
    'Окно до сна · Вечер · 09',
    '1) Метка — .widget-v4-goalbar__mark после заливки, :5991. 2) 2×5 px — 730:12646. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. 4) Рисуется только при hasData. Смоук: widgets-sleep-evening-v4.test.js.',
  ],
  [
    'Окно до сна · Вечер · текст',
    '1) Слова: «До сна» :5972; «отбой …» :5974; «2:40» — formatHoursColon; «окно чистое» :5982 при good. 2) «44» — .num клетки. 3) Не цвет. 4) Без отбоя шапка пишет «отбой не задан», не «23:00».',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
