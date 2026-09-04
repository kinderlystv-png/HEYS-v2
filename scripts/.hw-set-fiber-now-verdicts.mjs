import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const rows = [
  ['Клетчатка · Как сейчас · 01', '=',
    '1) Плитку 1×1 рисует FiberVariantBody ветка now, heys_widgets_ui_v1.js:5814. 2) Хром .widget — пара .w в widgets-v4-canvas-geometry.test.js. 3) Не цвет. 4) Вид fiber.now «Как сейчас» 1×1, heys_widgets_variants_v4.js:147. data-v «плитка» — узел кадра без своих чисел. Смоук: widgets-fiber-now-v4.test.js.'],
  ['Клетчатка · Как сейчас · 02', '=',
    '1) Ключ рисует v4Kicker(\'Клетчатка\'), heys_widgets_ui_v1.js:5815 / :1755. 2) .widget-v4-kicker 730:10521 одно; у клетчатки не перебито. 3) Слово, не цвет. 4) Текст «Клетчатка». Смоук: widgets-fiber-now-v4.test.js.'],
  ['Клетчатка · Как сейчас · 03', '=',
    '1) Ряд числа — .widget-v4-goal-hero, heys_widgets_ui_v1.js:5816. 2) baseline и auto у общего hero 730:12517; зазор 3 px только у .widget-v4-mini.widget-v4-fiber .widget-v4-goal-hero 730:12527. Общий 4 px белка/2×1 не трогал. 3) Не цвет. 4) Смоук: widgets-fiber-now-v4.test.js.'],
  ['Клетчатка · Как сейчас · 04', '=',
    '1) Число — .widget-v4-goal-value + unit «г», :5818/:5822. 2) 21 px mini fiber 730:12540; 600/1/-.02em у .widget-v4-goal-value 730:12531. 3) Цвет --v4-ink через val--neutral (клетчатка · цвет: шалфей только от 100 %). --empty не ставил. 4) «18» — демо; продукт String(fiber). Смоук: widgets-fiber-now-v4.test.js.'],
  ['Клетчатка · Как сейчас · 05', '=',
    '1) Дорожка .widget-v4-goalbar, v4GoalBar :5705. 2) 4 px, 999, margin-top 7 730:12563. 3) Фон --v4-track по уже закрытой «вид · полоса цели», не 8 % кадра — комментарий 730:12560. 4) Смоук: widgets-fiber-now-v4.test.js / widgets-v4-goal-bar-contract.test.js.'],
  ['Клетчатка · Как сейчас · 06', '=',
    '1) Заливка .widget-v4-goalbar__fill, ширина из pct :5706. 2) height 100 %, радиус 999 730:12575. 3) От 67 % --v4-ok-fill (= --gr2), ниже --v4-overlay-fill. 4) 69 % кадра — демо 18/26; продукт не хардкодит. Смоук: widgets-fiber-now-v4.test.js / widgets-v4-goal-bar-contract.test.js.'],
  ['Клетчатка · Как сейчас · текст', '=',
    '1) Слова: «Клетчатка» :5815; «18» — String(fiber). 2) «37» — номер клетки кадра (.num), не копия. 3) Не цвет. 4) Смоук: widgets-fiber-now-v4.test.js.'],
];

for (const [key, verdict, fact, options = {}] of rows) {
  const result = setVerdictKey('home-widgets', key, { verdict, fact, options }, {
    skipIf: (row) => row.v !== '?',
  });
  if (result.skipped) throw new Error(`${key} уже ${result.was.v}, не трогаю`);
  console.log(`home-widgets :: ${key}   ? → ${verdict}`);
}
