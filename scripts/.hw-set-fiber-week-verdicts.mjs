import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Клетчатка · Неделя · 01',
    '1) Корень week — .widget-v4-stack.widget-v4-fiber.widget-v4-fiber-week, heys_widgets_ui_v1.js:5793. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид fiber.week 2×2, heys_widgets_variants_v4.js:149. Смоук: widgets-fiber-week-v4.test.js.',
  ],
  [
    'Клетчатка · Неделя · 02',
    '1) Ключ — v4Kicker(\'Клетчатка · 7 дней\'), heys_widgets_ui_v1.js:5794 / :1755. 2) .widget-v4-kicker 730:10518, у week не перебито. 3) Слово, не цвет. 4) Текст «Клетчатка · 7 дней».',
  ],
  [
    'Клетчатка · Неделя · 03',
    '1) Ряд — .widget-v4-fiber-week__head, heys_widgets_ui_v1.js:5795. 2) baseline, gap 5px, margin-top 8px — 730:12654. Не .widget-v4-goal-hero (4 px / auto у add и now). 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Клетчатка · Неделя · 04',
    '1) Число — .widget-v4-fiber-week__value + val--neutral, :5797. 2) 26px/600/0.9/-.03em — 730:12663. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. 4) «18» — String(fiber). Смоук: widgets-fiber-week-v4.test.js.',
  ],
  [
    'Клетчатка · Неделя · 05',
    '1) «норма N» — .widget-v4-fiber-week__norm, :5802, margin-left auto. 2) 9px/600/1 — 730:12673. 3) --v4-ink-data: песок rgba(0,0,0,.56) 002:60+177; синий rgba(16,24,38,.64) 002:455+481. 4) «норма 26» — демо norm.',
  ],
  [
    'Клетчатка · Неделя · 06',
    '1) Поле столбиков — v4WeekBars class widget-v4-fiber-week__bars, :5805. 2) position relative, height 44px, margin-top auto — 730:12684; align flex-end и gap 4px — общий .widget-v4-weekbars 730:12633. 3) Не цвет. 4) Общий weekbars 34 px качества еды не трогал.',
  ],
  [
    'Клетчатка · Неделя · 07',
    '1) Пунктир — .widget-v4-weekbars__norm, v4WeekBars :5722. 2) absolute, 1.5px dashed rgba(--v4-ink-rgb,.22) — 730:12690. top = 4+(1-norm/max)*40. 3) Песок rgba(0,0,0,.22); синий rgba(16,24,38,.22). 4) Кадр top:4px — случай max=norm.',
  ],
  [
    'Клетчатка · Неделя · 08',
    '1) week[0] — .widget-v4-fiber-week__bars .widget-v4-weekbars__bar без is-today, v4WeekBars :5737. 2) flex 1, radius 3px 3px 0 0, #b7c29b — 730:12700. 3) Литерал как шаги вне нормы 730:10995; наборы не красят. 4) 34 px кадра — демо; продукт value/max×40.',
  ],
  [
    'Клетчатка · Неделя · 09',
    '1) week[1] — тот же __bar, индекс 1. 2) Те же radius и #b7c29b 730:12700. 3) Литерал, не роль. 4) 22 px кадра — демо второго дня, не правило высоты.',
  ],
  [
    'Клетчатка · Неделя · 10',
    '1) week[2] — __bar, индекс 2. 2) 40 px кадра = plotPx, день на пунктире (max). 3) Фон #b7c29b 730:12700. 4) Высота из value/max×40, не хардкод 40.',
  ],
  [
    'Клетчатка · Неделя · 11',
    '1) week[3] — __bar, индекс 3. 2) 14 px кадра — самый низкий демо-день. 3) Фон #b7c29b 730:12700. 4) Пустой день по-прежнему 2 px, не этот столбик.',
  ],
  [
    'Клетчатка · Неделя · 12',
    '1) week[4] — __bar, индекс 4. 2) 31 px кадра — демо. 3) Фон #b7c29b 730:12700. 4) Селектор тот же, факт — этот день ряда.',
  ],
  [
    'Клетчатка · Неделя · 13',
    '1) week[5] — __bar, индекс 5, последний прошлый. 2) 37 px кадра — демо. 3) Фон #b7c29b 730:12700. 4) is-today не ставится: правый столбик — 14.',
  ],
  [
    'Клетчатка · Неделя · 14',
    '1) Сегодня — __bar.is-today, правый week[6], :5739. 2) radius 3px 3px 0 0; фон var(--v4-ok-fill) — 730:12706. 3) Песок #7a8a5e 002:167; синий #4f9a78 002:477. 4) 28 px кадра = round(18/26×40).',
  ],
  [
    'Клетчатка · Неделя · текст',
    '1) Слова: «Клетчатка · 7 дней» :5794; «18» — String(fiber); «г сегодня» :5800; «норма 26» — \'норма \'+norm :5802. 2) «39» — .num клетки. 3) Не цвет. 4) Смоук data-v текст.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
