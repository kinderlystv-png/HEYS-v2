import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  [
    'Белок · По приёмам · 01',
    '1) Корень — .widget-v4-stack.widget-v4-protein.widget-v4-protein-meals, heys_widgets_ui_v1.js:5872. 2) Хром .widget — пара .w. 3) Не цвет. 4) Вид protein.by_meal 2×2, heys_widgets_variants_v4.js:154. Смоук: widgets-protein-meals-v4.test.js.',
  ],
  [
    'Белок · По приёмам · 02',
    '1) Шапка — .widget-v4-row.widget-v4-row--tight, :5873. 2) space-between — .widget-v4-row 730:10705; baseline — .widget-v4-row--tight 730:10802. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Белок · По приёмам · 03',
    '1) Ключ — v4Kicker(\'Белок · по приёмам\'), :5874 / :1755. 2) .widget-v4-kicker 730:10518, у meals не перебито. 3) Слово, не цвет. 4) Текст «Белок · по приёмам».',
  ],
  [
    'Белок · По приёмам · 04',
    '1) «из N» — .widget-v4-row__meta, :5876. 2) 9px/600/1 — 730:10826. 3) --v4-ink-data: песок rgba(0,0,0,.56) 002:60+177; синий rgba(16,24,38,.64) 002:455+481. 4) «из 140» — демо target.',
  ],
  [
    'Белок · По приёмам · 05',
    '1) Герой — .widget-v4-protein-meals__hero, :5879. Не .widget-v4-goal-hero (4 px / auto у add). 2) baseline, gap 5px, margin-top 7px — 730:12789. 3) Не цвет. 4) Смоук readRules.',
  ],
  [
    'Белок · По приёмам · 06',
    '1) Число — .widget-v4-protein-meals__value + val--neutral, :5880; «г» сосед :5884. 2) 26px/600/0.9/-.03em — 730:12797. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. 4) «112» — String(protein).',
  ],
  [
    'Белок · По приёмам · 07',
    '1) Поле полос — .widget-v4-mealbars.widget-v4-protein-meals__bars, :5888. 2) gap 6px, margin-top auto — 730:12806. Общий .widget-v4-mealbars 730:12741 остаётся gap 5 / margin-top 8 у ритма. 3) Не цвет. 4) Пустой день — muted, полос нет.',
  ],
  [
    'Белок · По приёмам · 08',
    '1) Строка — .widget-v4-mealbars__row, :5893. 2) align center, gap 7px — общий 730:12748; protein не перебивает. 3) Не цвет. 4) Ритм интервалов тем же рядом.',
  ],
  [
    'Белок · По приёмам · 09',
    '1) Время первого приёма — .widget-v4-mealbars__time, :5895, «8:40». 2) flex none — общий 730:12754; width 34px и 8.5px — 730:12811. 3) Цвет --v4-ink-data с общего 730:12754 (песок .56 / синий .64). 4) Остальные времена — тот же класс.',
  ],
  [
    'Белок · По приёмам · 10',
    '1) Дорожка — .widget-v4-mealbars__track, :5896. 2) flex 1, радиус 999 — общий 730:12763; высота 5px — 730:12817. Общий ритм остаётся 4 px. 3) Фон --v4-line 8 % 002:191 / 002:488, не --v4-track. 4) Смоук readRules.',
  ],
  [
    'Белок · По приёмам · 11',
    '1) Первая заливка — byMeal[0] 34 г, :5899, ширина grams/maxMeal. 2) height 5px, --v4-ok-fill — 730:12821. 3) Песок #7a8a5e 002:167; синий #4f9a78 002:477. Без порога 67 % — «вид · полоса цели» про вклад. 4) 68 % кадра — демо 34/50; продукт 34/maxMeal.',
  ],
  [
    'Белок · По приёмам · 12',
    '1) Число первого приёма — .widget-v4-mealbars__num, :5902, «34». 2) flex none — общий 730:12778; 8.5px — 730:12826. 3) --v4-ink: песок #201e1d 002:176; синий #101826 002:480. Общий num ритма остаётся --v4-ink-data 10 px. 4) Смоук.',
  ],
  [
    'Белок · По приёмам · 13',
    '1) Вторая заливка — byMeal[1] 42 г (макс дня в кадре). 2) Тот же fill 730:12821, --v4-ok-fill. 3) 84 % кадра — демо 42/50; продукт 42/42 = 100 %. 4) Не хардкод 84.',
  ],
  [
    'Белок · По приёмам · 14',
    '1) Третья заливка — byMeal[2] 12 г. 2) Тот же fill 730:12821. 3) 24 % кадра — демо 12/50; продукт 12/maxMeal. 4) Не путать с 34/140 от нормы.',
  ],
  [
    'Белок · По приёмам · 15',
    '1) Четвёртая заливка — byMeal[3] 24 г, «19:30». 2) Тот же fill 730:12821. 3) 48 % кадра — демо 24/50; продукт 24/maxMeal. 4) Четыре приёма кадра; продукт рисует сколько есть в byMeal.',
  ],
  [
    'Белок · По приёмам · текст',
    '1) Слова: «Белок · по приёмам» :5874; «из 140» :5876; «112» :5883; времена и граммы из byMeal :5895/:5902. 2) «42» — .num клетки. 3) Не цвет. 4) «г» в тексте контракта нет — сосед героя.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} });
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
