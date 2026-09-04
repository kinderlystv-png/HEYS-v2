import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Качество еды · Неделя · 01',
    '1) Корень week — .widget-v4-stack.widget-v4-foodquality.widget-v4-foodquality-week, heys_widgets_ui_v1.js:6036. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид foodQuality.week 2×2, heys_widgets_variants_v4.js:163. «47» — .num клетки. Смоук: widgets-food-week-v4.test.js.',
  ],
  [
    'Качество еды · Неделя · 02',
    '1) Ключ — v4Kicker(\'Качество · 7 дней\'), heys_widgets_ui_v1.js:6037 / :1755. 2) .widget-v4-kicker 730:10518, у week не перебито. 3) Слово, не цвет. 4) Текст «Качество · 7 дней».',
  ],
  [
    'Качество еды · Неделя · 03',
    '1) Ряд — .widget-v4-foodquality-week__head, :6038. 2) baseline / 5 px / margin-top 8 — 730:12862. Классы fiber-week__head (730:12805) не переиспользовал. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Качество еды · Неделя · 04',
    '1) Число — formatScoreRu :6042 + val--neutral :6041. 2) 26 px / 600 / .9 / -.03em — 730:12871, не stack 19 и не mini 21. 3) Кадр --tx; поставил --v4-ink 730:10888: песок #201e1d 002:176; синий #101826 002:480. Шалфей now (--v4-ok-text) не открывал. 4) «8» — formatScoreRu. Смоук: widgets-food-week-v4.test.js.',
  ],
  [
    'Качество еды · Неделя · 05',
    '1) Среднее — .widget-v4-foodquality-week__avg, :6045. 2) 9 px / 600 / 1 / margin-left auto — 730:12881. 3) --v4-ink-data: песок 56 % 002:60; синий 64 % 002:455. 4) «в среднем 7,3» — formatScoreRu(avgWeek).',
  ],
  [
    'Качество еды · Неделя · 06',
    '1) Поле — v4WeekBars :6048 / :5717, класс foodquality-week__bars. 2) flex-end / 4 px — общий .widget-v4-weekbars 730:12784; высота 44 / margin-top auto — 730:12892. Сюжет 40, без пунктира нормы. 3) Не цвет поля. 4) Общий weekbars 34 px не трогал.',
  ],
  [
    'Качество еды · Неделя · 07',
    '1) Первый прошлый — .widget-v4-weekbars__bar без is-today, :5737. 2) flex 1 — 730:12792; радиус 3px 3px 0 0 — 730:12898. 3) Фон литерал #b7c29b, наборы не красят. 4) 28 px кадра — демо 7/10×40; продукт round(value/max×40).',
  ],
  [
    'Качество еды · Неделя · 08',
    '1) Второй прошлый — тот же bar, другой день week[1]. 2) Тот же радиус 730:12898. 3) Тот же #b7c29b. 4) 32 px кадра — демо 8/10×40.',
  ],
  [
    'Качество еды · Неделя · 09',
    '1) Третий прошлый — week[2]. 2) Тот же радиус 730:12898. 3) Тот же #b7c29b. 4) 20 px кадра — демо 5/10×40.',
  ],
  [
    'Качество еды · Неделя · 10',
    '1) Четвёртый прошлый — week[3]. 2) Тот же радиус 730:12898. 3) Тот же #b7c29b. 4) 36 px кадра — демо 9/10×40.',
  ],
  [
    'Качество еды · Неделя · 11',
    '1) Пятый прошлый — week[4]. 2) Тот же радиус 730:12898. 3) Тот же #b7c29b. 4) 24 px кадра — демо 6/10×40. Шестой прошлый кадра (32 px) в контракте строки нет.',
  ],
  [
    'Качество еды · Неделя · 12',
    '1) Сегодня — .is-today, :5739. 2) Радиус тот же 730:12898. 3) --v4-ok-fill 730:12904: песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) 32 px кадра — 8/10×40. Смоук: widgets-food-week-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
