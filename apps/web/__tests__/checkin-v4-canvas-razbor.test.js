// Кадры утреннего чек-ина против раздела канваса «Разбор кадров · элемент за
// элементом» (пакет 30 августа). Зона сведена целиком: тридцать пять кадров
// — пять шагов мастера во всех состояниях, восемь экранов развилки разбора
// вчера, слои холода, замеров, добавок и особых дней, плашка согласия и два
// экрана «Записано».
//
// Зона живёт в двух файлах: шаги мастера — 500-pwa-and-offline.css, развилка
// разбора вчера — 715-yesterday-verify.css.
//
// Спорные числа решает именованная строка зоны: «вид карточки шага» сводит все
// карточки шага к одной форме, «вид дорожки» — все ползунки к одной дорожке, а
// кадры рисуют по второму варианту.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/checkin-morning.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');
const YV_CSS = path.resolve(__dirname, '../styles/modules/715-yesterday-verify.css');

const EXCEPTIONS = new Map([
  // Строка «вид карточки шага»: «фон --c1, радиус 20, поля 16/17 px» — одна
  // форма у всех карточек шага. Кадр рисует добавкам и кофе вторую (радиус 16,
  // поля 12–13/14); контракт старше кадра, это записано и у самого правила.
  ['Чек-ин · остальное · 13|radius', 'строка «вид карточки шага»: радиус 20'],
  ['Чек-ин · остальное · 13|padding', 'строка «вид карточки шага»: поля 16/17'],
  ['Чек-ин · остальное · 20|radius', 'та же строка: одна форма у всех карточек шага'],
  ['Чек-ин · остальное · 20|padding', 'та же строка'],
  // Та же строка задаёт заголовку 16 px/700; кадр набирает карточке кофе 13/600.
  ['Чек-ин · остальное · 14|*', 'строка «вид карточки шага»: заголовок 16/700'],
  // Вес пилюли-ответа отступлением быть перестал: ответ дизайнера №17 — верны
  // кадры, продукт приведён к 700. Тон остаётся исключением по другой причине,
  // и она не про дизайн: сверка разворачивает `var(--v4-роль)` без запасного,
  // а роль 62 % чернил объявлена через `var(--v4-ink, …)` с запасным внутри —
  // до литерала эта цепочка не сворачивается. Цвет верный, сверить его нечем.
  ['Чек-ин · остальное · 11|color', 'роль --v4-mark-1 = 62 % чернил; сверка не разворачивает вложенный var с запасным'],
  // Развилка разбора вчера: кадры рисуют дорожке высоту 24, а строка контракта
  // «вид дорожки» задаёт продукту одну дорожку высотой 26 и соседней строкой
  // «дорожка» относит сюда же оценку пачки. У мастера дорожка уже 26.
  ['Чек-ин · вчера по ощущениям · 19|height', 'контракт «вид дорожки»: одна дорожка 26'],
  ['Чек-ин · вчера по ощущениям · 20|height', 'та же строка'],
  ['Чек-ин · вчера по ощущениям · 22|marginTop', 'та же строка: засечки через 8, кадр рисует 7'],
  // Ступени цвета — своё решение продукта: заливка и значение красятся по тому,
  // куда уведён ползунок (норма · недобор · перебор). Кадр рисует один тон.
  ['Чек-ин · вчера по ощущениям · 20|background', 'три ступени заливки, кадр рисует одну'],
  // Подвал развилки один на все её экраны: пять кадров из шести дают зазор 8.
  ['Чек-ин · сила для пачки · 24|gap', 'подвал развилки один: пять кадров из шести дают 8'],
  // Строка «минимальная область нажатия»: всё нажимаемое не ниже 44, кроме
  // чипов в переносимых рядах. Кадр рисует пилюлям «Да»/«Нет» высоту 38.
  ['Чек-ин · цель по шагам · 24|minHeight', 'строка «минимальная область нажатия»: 44'],
  ['Чек-ин · цель по шагам · 25|minHeight', 'та же строка'],
  // Сноска стоит через 26, когда под дорожкой нет подсказки, и через 14, когда
  // под ней карточка или загрузочный день. Кадр «шаги своё число» просит 20 —
  // это третье состояние, и живёт оно в JS, а не в наборе правил.
  ['Чек-ин · шаги своё число · 19|marginTop', 'сноска шага: два состояния, 26 и 14'],
  // Строки среднего веса — один ряд с одним отступом; кадр даёт первому 11,
  // второму 9. Двух видов строки ради двух пикселей не заводим.
  ['Чек-ин · расчётный вес · 13|marginTop', 'ряд строк среднего: один отступ 11'],
  // Заливка просроченной строки: у продукта своя роль подложки, и её
  // значение в песочном наборе на три ступени темнее канвасного --tint
  // (#f3e0d2 против #f6e6dd). Вопрос по паре ролей уже заведён дизайнеру.
  ['Чек-ин · замеры просрочены · 32|background', 'роль подложки продукта против --tint канваса'],
  // Метка просрочки: контракт «вид просроченной строки» ставит её справа
  // числом 10 px/700, кадр рисует кикером слева 9,5 px с точкой. Решение
  // записано у самого правила.
  ['Чек-ин · замеры просрочены · 34|*', 'контракт: метка справа, точки и кикера нет'],
  // Ряд действий под рутиной: кадр даёт ему 6/11, а такому же ряду под душем
  // (строка 10) — 8/12. Строки контракта про ряд действий нет, рассудить кадр
  // кадром нечем, и продукт держит обоим одно: 8/12. Строка целиком расходится
  // с кадром, поэтому в пары не идёт — здесь она и остаётся названной.
  ['Чек-ин · замеры просрочены · 30|gap', 'кадры спорят: 6 у рутины против 8 у душа, продукт держит 8'],
  ['Чек-ин · замеры просрочены · 30|marginTop', 'кадры спорят: 11 у рутины против 12 у душа, продукт держит 12'],
  // Кнопка «Сделал»: кадр рисует высоту 42 и кегль 11,5, но строка
  // «минимальная область нажатия» требует не ниже 44 для всего нажимаемого, а
  // кегль у всех таких кнопок один — 12,5. Контракт старше кадра.
  ['Чек-ин · замеры просрочены · 31|minHeight', 'контракт «минимальная область нажатия»: не ниже 44'],
  ['Чек-ин · замеры просрочены · 31|fontSize', 'кегль кнопки выбора один на все ряды: 12,5'],
  ['Чек-ин · замеры просрочены · 35|fontSize', 'контракт «вид просроченной строки»: 10 px'],
  // Отбивка яруса в списке добавок: у первого яруса кадр даёт 14, у второго
  // 13. Один отступ на ряд ярусов.
  ['Добавки · добавление · 8|marginTop', 'один отступ на ряд ярусов: 13'],
]);

const STEP5 = [
  [5, '.mc-rest-cold', ['radius', 'background', 'padding']],
  [6, '.mc-rest-cold-head', ['align', 'justify', 'gap']],
  [7, '.mc-rest-cold-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [8, '.mc-rest-cold-streak', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [9, '.mc-rest-cold-hint', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [10, '.mc-rest-cold-actions', ['gap', 'marginTop']],
  [11, ['.mc-pill', '.mc-pill--choice'], ['minHeight', 'radius', 'background', 'fontSize', 'lineHeight']],
  [13, ['.mc-rest-card', '.mc-rest-card--coffee'], ['background']],
  [15, '.mc-rest-coffee-note', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [16, '.mc-rest-coffee-actions', ['gap', 'marginTop']],
  [18, ['.mc-pill', '.mc-pill--choice.is-on'],
    ['minHeight', 'radius', 'background', 'color', 'fontWeight', 'fontSize', 'lineHeight']],
  [19, ['.mc-rest-card-hint', '.mc-rest-coffee-why'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [20, ['.mc-rest-card', '.mc-rest-card--supplements'], ['background']],
  [21, '.mc-rest-supp-head', ['align', 'justify', 'gap']],
  // Ширину чипу задаёт контекстное правило ряда, а не сам класс кнопки.
  [17, ['.mc-pill', '.mc-pill--choice', '.mc-rest-coffee-actions .mc-pill'],
  ['flex', 'minWidth', 'minHeight', 'radius', 'background', 'fontSize', 'lineHeight', 'ring']],
  [23, '.mc-rest-supp-list', ['direction', 'gap', 'marginTop']],
  [24, '.mc-rest-supp-name', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [25, '.mc-rest-supp-time', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [26, '.mc-rest-supp-add', ['align', 'gap', 'marginTop', 'minHeight']],
  [27, '.mc-rest-supp-add-icon',
  ['width', 'height', 'radius', 'background', 'align', 'justify', 'flex']],
  [28, '.mc-rest-supp-add', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [32, '.mc-rest-row', ['radius', 'background', 'padding', 'minHeight', 'align', 'justify', 'gap']],
  [34, '.mc-rest-chevron', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Шаг веса: приветствие, серия, крупное число и капсула колёс.
const WEIGHT = [
  [4, '.mc-modal--daily .mc-daily-greeting-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'textAlign']],
  [5, '.mc-modal--daily .mc-daily-greeting-date',
    ['fontWeight', 'fontSize', 'lineHeight', 'marginTop', 'textAlign']],
  [6, '.mc-modal--daily .mc-daily-streak-banner',
    ['align', 'gap', 'background', 'radius', 'padding', 'marginTop']],
  [7, '.mc-modal--daily .mc-daily-streak-count', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [8, '.mc-modal--daily .mc-daily-streak-text', ['fontWeight', 'fontSize', 'lineHeight']],
  [9, '.mc-weight-hero', ['direction', 'align', 'marginTop']],
  [10, '.mc-step-kicker', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [11, '.mc-weight-hero-row', ['align', 'gap', 'marginTop']],
  [12, '.mc-weight-hero-value', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [13, '.mc-weight-hero-unit', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [14, '.mc-weight-week-delta',
    ['align', 'gap', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
  [15, '.mc-weight-kilo-card', ['width', 'background', 'radius', 'padding']],
  [16, '.mc-kilo-label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color', 'textAlign']],
];

// Шаг сна: длительность, карточка оценки, заметка и два блока времени.
const SLEEP = [
  [5, '.mc-step-kicker', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [7, '.mc-hero-number', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [8, '.mc-sleep-norm', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [9, '.mc-scale-card', ['background', 'radius', 'padding', 'marginTop']],
  [10, '.mc-scale-head', ['align', 'justify']],
  [11, '.mc-scale-head', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [12, '.mc-scale-value', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [14, '.mc-v4-scale.mc-drag-slider', ['marginTop']],
  [17, '.mc-note-toggle', ['align', 'gap', 'marginTop', 'minHeight']],
  [18, '.mc-note-toggle-icon',
    ['width', 'height', 'radius', 'background', 'align', 'justify', 'flex']],
  [19, '.mc-note-toggle', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [20, '.mc-sleep-times--split', ['gap', 'marginTop']],
  [21, '.mc-sleep-block', ['flex', 'background', 'radius', 'padding']],
  [22, ['.mc-sleep-label', '.mc-modal--daily .mc-sleep-label'],
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color', 'textAlign']],
  [23, '.mc-modal--daily .mc-sleep-block .mc-time-pickers', ['align', 'justify', 'marginTop']],
  [25, ['.mc-modal--daily .mc-wheel-value--prev',
    '.mc-modal--daily .mc-sleep-combined .mc-wheel-value--prev'],
  ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [26, ['.mc-modal--daily .mc-wheel-value--current',
    '.mc-modal--daily .mc-sleep-combined .mc-wheel-value--current'],
  ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [27, ['.mc-modal--daily .mc-time-sep', '.mc-modal--daily .mc-sleep-combined .mc-time-sep'],
    ['fontWeight', 'fontSize', 'lineHeight', 'padding']],
];

// Развилка разбора вчера. Три кадра рисуют один и тот же набор управлений
// (renderQuickFillControls), поэтому пары общие — меняются только номера.
const yvPairs = (n) => [
  [n.title, '.yv-hero-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.sub, '.yv-hero-sub', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.sub, '.yv-step--feelings > .yv-hero-sub', ['marginTop']],
  [n.list, '.yv-force-list', ['direction', 'gap', 'marginTop']],
  [n.force, '.yv-force', ['background', 'radius', 'padding', 'minHeight', 'align', 'justify', 'gap']],
  [n.forceTitle, '.yv-force-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.forceKcal, '.yv-force-kcal', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.block, '.yv-slider-block', ['marginTop']],
  [n.head, '.yv-slider-header', ['align', 'justify', 'gap']],
  [n.label, '.yv-slider-label', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.value, ['.yv-slider-value', '.yv-slider-value--over'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  // Высота дорожки и заливки, отступ засечек и тон строки под ними — в списке
  // отступлений выше; в пары идёт то, что кадр и продукт держат одинаково.
  [n.track, '.yv-v4-slider-track-wrap', ['radius', 'background', 'marginTop']],
  [n.fill, '.yv-v4-slider-fill', ['radius']],
  [n.thumb, '.yv-v4-slider-thumb', ['width', 'height', 'radius', 'background']],
  [n.ticks, '.yv-slider-tick', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.note, '.yv-slider-note', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

// Выбранная сила: вторая поверхность с обводкой заливочным тоном, цифра —
// текстовым тоном акцента.
const yvOn = (row, kcal) => [
  [row, ['.yv-force', '.yv-force--on'], ['background', 'radius', 'padding', 'minHeight']],
  [kcal, ['.yv-force-kcal', '.yv-force--on .yv-force-kcal'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Шаг «Как вы сегодня»: три шкалы подряд.
const MOOD = [
  [5, '.mc-step-kicker', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [6, ['.mc-recorded-sub', '.mc-mood-step > .mc-recorded-sub'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [7, ['.mc-scale-card', '.mc-mood-step > .mc-recorded-sub + .mc-scale-card'],
    ['background', 'radius', 'padding', 'marginTop']],
  [8, '.mc-scale-head', ['align', 'justify']],
  [9, '.mc-scale-head', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [10, '.mc-scale-value', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [12, '.mc-v4-scale.mc-drag-slider', ['marginTop']],
  [15, ['.mc-scale-card', '.mc-mood-step > .mc-scale-card'],
    ['background', 'radius', 'padding', 'marginTop']],
  [18, ['.mc-recorded-hint', '.mc-mood-step > .mc-recorded-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

// Шаг «Цель по шагам» и шесть его состояний. Общая часть — крупное число,
// метка совета над дорожкой, засечки, подсказка под ними и сноска.
const stepsPairs = (n, withHint) => {
  const heroValue = ['.mc-steps-hero-value', '.mc-modal--daily .mc-steps-hero-value']
    .concat(n.custom ? ['.mc-modal--daily .mc-steps-hero--custom .mc-steps-hero-value'] : []);
  const rows = [
    [n.k, '.mc-step-kicker', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
    [n.h, '.mc-steps-hero', ['align', 'gap', 'marginTop']],
    [n.v, heroValue, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
    [n.u, ['.mc-steps-unit', '.mc-modal--daily .mc-steps-unit'],
      ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [n.s, ['.mc-recorded-sub', '.mc-steps-step > .mc-recorded-sub'],
      ['fontSize', 'lineHeight', 'color', 'marginTop']],
    [n.m, '.mc-steps-advice-mark',
      ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color']],
    [n.t, '.mc-steps-slider-labels',
      ['justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ];
  if (withHint) {
    rows.push([n.i, ['.mc-recorded-hint', '.mc-steps-slider-container > .mc-recorded-hint'],
      ['fontWeight', 'fontSize', 'lineHeight', 'color']]);
  }
  if (n.f) {
    rows.push([n.f, ['.mc-recorded-hint', '.mc-steps-step > .mc-recorded-hint'],
      ['fontWeight', 'fontSize', 'lineHeight', 'color']]);
  }
  if (n.card) {
    rows.push([n.card, '.mc-steps-info-card',
      ['background', 'radius', 'padding', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight']]);
  }
  return rows;
};

// Загрузочный день — карточка под дорожкой, а не блок за чертой.
const REFEED = [
  [20, '.mc-steps-refeed-row',
    ['radius', 'background', 'padding', 'marginTop', 'minHeight', 'align', 'justify', 'gap']],
  [21, '.mc-steps-refeed-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [22, '.mc-steps-refeed-hint', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [23, ['.mc-rest-yesno', '.mc-steps-refeed-row .mc-rest-yesno'], ['gap']],
  [24, ['.mc-pill', '.mc-pill--mini'], ['radius', 'fontWeight', 'fontSize', 'lineHeight']],
  [25, ['.mc-pill', '.mc-pill--mini', '.mc-pill--choice.is-on'],
    ['radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

const STD_STEPS = { k: 5, h: 6, v: 7, u: 8, s: 9, m: 13, t: 18, i: 19, f: 20 };

const STEPS_FRAMES = [
  ['Чек-ин · цель по шагам', { ...STD_STEPS, f: 26 }, true, REFEED],
  ['Чек-ин · шаги при коротком сне', STD_STEPS, true, []],
  ['Чек-ин · шаги без истории', STD_STEPS, true, []],
  ['Чек-ин · шаги после тренировки', STD_STEPS, true, []],
  ['Чек-ин · шаги на потолке', STD_STEPS, true, []],
  ['Чек-ин · шаги при тяжёлом утре', { ...STD_STEPS, f: null, card: 20 }, true, []],
  ['Чек-ин · шаги своё число',
    { k: 5, h: 6, v: 7, u: 8, s: 9, m: 13, t: 18, f: null, custom: true }, false, []],
];

// Развилка разбора вчера, вход и список дней. Карточка сводки и строки под ней
// описаны строкой контракта «вид карточки сводки», выходы — строкой «вид
// строк-ответов»; кадры их повторяют.
const forkSummary = (n) => [
  [n.title, '.yv-hero-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.sub, '.yv-hero-sub', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.card, '.yv-food-card', ['background', 'radius', 'padding', 'marginTop']],
  [n.row, '.yv-food-row', ['justify', 'align', 'fontWeight', 'fontSize', 'lineHeight']],
  [n.row2, ['.yv-food-row', '.yv-food-row + .yv-food-row'], ['marginTop']],
  [n.note, '.yv-pack-note', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [n.foot, '.yv-canvas-foot', ['direction', 'gap']],
  [n.row3, '.yv-pack-row', ['gap']],
  [n.a, '.yv-pack-secondary',
    ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.b, ['.yv-pack-secondary', n.wide],
    ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.later, '.yv-text-later', ['minHeight', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

const forkList = (n) => [
  [n.title, '.yv-hero-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.sub, '.yv-hero-sub', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [n.days, '.yv-days', ['direction', 'gap', 'marginTop']],
  [n.day, '.yv-pack-day', ['background', 'radius', 'padding', 'align', 'gap', 'minHeight']],
  [n.note, '.yv-pack-note', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [n.foot, '.yv-canvas-foot', ['direction', 'gap']],
];

const FORK_FRAMES = [
  ['Чек-ин · вчерашний день', forkSummary({
    title: 5, sub: 6, card: 7, row: 8, row2: 11, note: 13, foot: 14, row3: 16,
    a: 17, b: 18, wide: '.yv-pack-row .yv-pack-secondary--feelings', later: 19,
  })],
  ['Чек-ин · день из пачки', forkSummary({
    title: 6, sub: 7, card: 8, row: 9, row2: 12, note: 14, foot: 15, row3: 17,
    a: 18, b: 19, wide: '.yv-pack-row .yv-pack-secondary--feelings', later: 20,
  })],
  // Пустой день меняет ширины местами: подтверждение «ничего не ел» длиннее.
  // Нумерация на единицу больше, чем у дня с едой: во второй строке карточки
  // пакет 3 сентября развёл норму и подпись на два разбора вместо одного.
  ['Чек-ин · пустой день из пачки', forkSummary({
    title: 6, sub: 7, card: 8, row: 9, row2: 12, note: 15, foot: 16, row3: 18,
    a: 20, b: 19, wide: '.yv-pack-row .yv-pack-secondary--confirm-empty', later: 21,
  })],
  ['Чек-ин · пачка незакрытых дней', forkList({
    title: 5, sub: 6, days: 7, day: 8, note: 9, foot: 10,
  }).concat([[13, '.yv-pack-secondary',
    ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']]])],
  ['Чек-ин · пачка после очистки', forkList({
    title: 5, sub: 6, days: 7, day: 8, note: 9, foot: 10,
  }).concat([[12, '.yv-text-later',
    ['minHeight', 'fontWeight', 'fontSize', 'lineHeight', 'color']]])],
];

// Первое утро: серии ещё нет, плашка под приветствием не рисуется, и блок веса
// поднимается на 30. Капсула колёс тем же приёмом уже поднята на 36.
const WEIGHT_FIRST = [
  [4, '.mc-modal--daily .mc-daily-greeting-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'textAlign']],
  [5, '.mc-modal--daily .mc-daily-greeting-date',
    ['fontWeight', 'fontSize', 'lineHeight', 'marginTop', 'textAlign']],
  [6, ['.mc-weight-hero',
    '.mc-daily-greeting:not(:has(.mc-daily-streak-banner)) + .mc-weight-hero'],
  ['direction', 'align', 'marginTop']],
  [7, '.mc-step-kicker', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [8, '.mc-weight-hero-row', ['align', 'gap', 'marginTop']],
  [9, '.mc-weight-hero-value', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [10, '.mc-weight-hero-unit', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [11, ['.mc-recorded-hint', '.mc-weight-hero > .mc-recorded-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [12, ['.mc-weight-kilo-card',
    '.mc-weight-hero:not(:has(.mc-weight-week-delta)) + .mc-weight-kilo-card'],
  ['width', 'background', 'radius', 'padding', 'marginTop']],
  [13, '.mc-kilo-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color', 'textAlign']],
  [19, ['.mc-recorded-hint', '.mc-weight-step > .mc-recorded-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Слои и состояния пятого шага, экраны добавок и «Записано». Разбор у них
// плоский: карточка, её строки, ряд действий — поэтому пары перечислены
// таблицей, без общей выкройки.
const REST_FRAMES = [
  // Кадр «замеры просрочены» был самым непокрытым в зоне — 31 строка вне пар.
  // Ниже закрыты те, у которых в продукте есть свой класс: карточки шага,
  // заголовки, серия и подписи. Строки-ответы и просроченная метка уже стоят
  // в других группах.
  ['Чек-ин · замеры просрочены', [
    [5, '.mc-rest-cold', ['radius', 'background', 'padding']],
    [6, '.mc-rest-cold-head', ['align', 'justify', 'gap']],
    [7, ['.mc-rest-cold-title', '.mc-rest-card-title'],
    ['fontWeight', 'fontSize', 'lineHeight']],
    [8, '.mc-rest-cold-streak', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [9, ['.mc-rest-cold-hint', '.mc-rest-card-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    // Карточки добавок и рутины в пары не идут формой и заголовком: строка
    // «вид карточки шага» даёт всем карточкам «Остального» одну форму —
    // радиус 20, поля 16/17, заголовок 16/700, — а кадры рисуют для них вторую
    // (радиус 16, поля 13/14, заголовок 600 13). Отступление разобрано и
    // закреплено в morning-checkin-v4-contract-geometry.test.js; здесь
    // сверяется только фон.
    [13, '.mc-rest-card', ['background']],
    [10, '.mc-rest-cold-actions', ['gap', 'marginTop']],
    // Кнопка выбора: форма и кегль совпадают, а вес и тон надписи — нет.
    // Кадр набирает «Было» 700-м полным тоном чернил на 62 %, продукт — 600-м
    // и полным --v4-sand-ink. Обе разницы названы ниже отдельной проверкой,
    // чтобы «не вошло в пары» не читалось как «сошлось».
    // Центрирование в пары не идёт: кадр рисует его флексом, а в продукте это
    // сам <button> — он центрирует содержимое и без правил. Свойств в CSS нет,
    // но на экране надпись стоит там же.
    [11, ['.mc-pill', '.mc-pill--choice'],
    ['flex', 'minHeight', 'radius', 'background', 'fontSize', 'lineHeight']],
    [16, '.mc-rest-coffee-actions', ['gap', 'marginTop']],
    [19, ['.mc-rest-card-hint', '.mc-rest-coffee-why'],
    ['fontSize', 'lineHeight', 'marginTop']],
    [31, ['.mc-pill', '.mc-pill--choice'],
    ['flex', 'radius', 'background', 'lineHeight']],
  ]],
  ['Чек-ин · записано', [
    [4, '.mc-recorded',
    ['direction', 'align', 'justify']],
    [5, '.mc-recorded-check',
    ['width', 'height', 'radius', 'background', 'align', 'justify']],
    [6, '.mc-recorded-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [7, ['.mc-recorded-sub', '.mc-recorded .mc-recorded-sub'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [8, '.mc-recorded-card',
    ['background', 'radius', 'padding', 'marginTop']],
    [9, '.mc-recorded-row',
    ['justify', 'fontWeight', 'fontSize', 'lineHeight']],
    [10, '.mc-recorded-row > span:first-child',
    ['color']],
    [11, '.mc-recorded-row__kcal',
    ['color']],
    [12, ['.mc-recorded-row', '.mc-recorded-row'],
    ['marginTop']],
    [13, '.mc-recorded-row__value',
    ['color']],
    [14, ['.mc-recorded-hint', '.mc-recorded .mc-recorded-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop', 'textAlign']],
  ]],
  ['Чек-ин · записано с расчётным весом', [
    [9, '.mc-recorded-row',
    ['justify', 'align', 'fontWeight', 'fontSize', 'lineHeight']],
    [11, '.mc-recorded-row__value',
    ['color']],
    [12, '.mc-recorded-row__mark',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color']],
    [14, '.mc-recorded-row__kcal',
    ['color']],
    [15, ['.mc-recorded-hint', '.mc-recorded .mc-recorded-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop', 'textAlign']],
  ]],
  ['Чек-ин · холод тип', [
    [5, '.mc-rest-cold',
    ['radius', 'background', 'padding']],
    [6, '.mc-rest-cold-head',
    ['align', 'justify', 'gap']],
    [7, '.mc-rest-cold-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [8, '.mc-rest-cold-streak',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [9, '.mc-rest-cold-hint',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [10, '.mc-rest-cold-types',
    ['direction', 'gap', 'marginTop']],
    [11, ['.mc-rest-type', '.mc-rest-type.is-on'],
    ['background', 'radius', 'padding', 'align', 'justify', 'gap', 'minHeight']],
    [12, ['.mc-rest-type', '.mc-rest-type.is-on'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [13, ['.mc-rest-wave', '.mc-rest-type.is-on .mc-rest-wave'],
    ['fontWeight', 'fontSize', 'lineHeight']],
    [14, '.mc-rest-type',
    ['background', 'radius', 'padding', 'align', 'justify', 'gap', 'minHeight']],
    [15, '.mc-rest-type',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    // The generated data-v snapshot is truncated after row 15 and resumes with shifted keys.
  ]],
  ['Чек-ин · замеры', [
    [5, '.mc-rest-layer-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [6, '.mc-rest-layer-hint',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [7, '.mc-rest-measure-list',
    ['direction', 'gap', 'marginTop']],
    [8, '.mc-rest-measure-row',
    ['background', 'radius', 'padding', 'align', 'justify', 'gap', 'minHeight']],
    [9, '.mc-rest-measure-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [10, '.mc-rest-measure-input',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [11, '.mc-rest-measure-unit',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [12, '.mc-rest-measure-side',
    ['align', 'justify', 'gap', 'marginTop']],
    [13, '.mc-rest-measure-side-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [14, '.mc-rest-measure-side-pills',
    ['gap']],
    [15, ['.mc-rest-measure-side-pill', '.mc-rest-measure-side-pill.is-on'],
    ['minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [16, '.mc-rest-measure-side-pill',
    ['minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [17, '.mc-rest-clear-mark',
    ['align', 'justify', 'gap', 'marginTop', 'minHeight']],
    [18, '.mc-rest-clear-mark',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [19, ['.mc-recorded-hint', '.mc-rest-clear-mark-hint', '.mc-rest-measure-foot-hint'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ]],
  ['Чек-ин · курс добавок пуст', [
    [6, '.mc-supp-flow-empty-card',
    ['radius', 'background', 'padding', 'textAlign']],
    [7, '.mc-supp-flow-empty-icon',
    ['width', 'height', 'radius', 'background', 'align', 'justify']],
    [8, '.mc-supp-flow-empty-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [9, '.mc-supp-flow-empty-body',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [10, '.mc-supp-flow-note',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop', 'textAlign']],
    [13, '.mc-supp-flow-later',
    ['minHeight', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ]],
  ['Добавки · курс', [
    [6, '.mc-supp-flow-lead',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [7, '.mc-supp-flow-course-list',
    ['direction', 'gap', 'marginTop']],
    [8, '.mc-supp-flow-course-row',
    ['background', 'radius', 'padding', 'align', 'gap', 'minHeight']],
    [9, '.mc-supp-flow-add-row',
    ['align', 'gap', 'marginTop', 'minHeight', 'radius', 'background', 'padding']],
    [10, '.mc-supp-flow-add-icon',
    ['width', 'height', 'radius', 'background', 'align', 'justify', 'flex']],
    [11, '.mc-supp-flow-add-row',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [12, ['.mc-supp-flow-note', '.mc-supp-flow--course .mc-supp-flow-note'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ]],
  ['Добавки · добавление', [
    [6, '.mc-supp-flow-search',
    ['align', 'gap', 'background', 'radius', 'padding', 'minHeight']],
    [7, '.mc-supp-flow-search-input',
    ['fontWeight', 'fontSize', 'lineHeight']],
    [9, '.mc-supp-flow-chips',
    ['gap']],
    [10, ['.mc-supp-flow-chip', '.mc-supp-flow-chip.is-on'],
    ['minHeight', 'align', 'gap', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [11, '.mc-supp-flow-chip',
    ['minHeight', 'align', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [13, '.mc-supp-flow-foot',
    ['align', 'gap']],
    [14, '.mc-supp-flow-selected-count',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'flex']],
  ]],
  ['Добавки · доза и время', [
    [6, '.mc-supp-flow-dose-kicker',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
    [7, '.mc-supp-flow-dose-stepper',
    ['align', 'gap', 'marginTop']],
    [8, '.mc-supp-flow-dose-btn',
    ['width', 'height', 'radius', 'background', 'align', 'justify']],
    [9, '.mc-supp-flow-dose-value',
    ['align', 'gap']],
    [10, '.mc-supp-flow-dose-num',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
    [11, '.mc-supp-flow-dose-unit',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [12, '.mc-supp-flow-dose-hint',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop', 'textAlign']],
    [13, '.mc-supp-flow-timing-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color']],
    [15, ['.mc-supp-flow-note', '.mc-supp-flow-note--left'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ]],
  ['Чек-ин · замеры просрочены', [
    [23, '.mc-rest-supp-list',
    ['direction', 'gap', 'marginTop']],
    [24, '.mc-rest-supp-name',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [25, '.mc-rest-supp-time',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [26, '.mc-rest-supp-add',
    ['align', 'gap', 'marginTop', 'minHeight']],
    [27, '.mc-rest-supp-add-icon',
    ['width', 'height', 'radius', 'background', 'align', 'justify', 'flex']],
    [28, '.mc-rest-supp-add',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [32, ['.mc-rest-row', '.mc-rest-row.mc-rest-row--overdue'],
    ['radius', 'padding', 'minHeight', 'align', 'justify', 'gap']],
    [35, '.mc-rest-overdue-badge',
    ['fontWeight', 'color']],
    [38, ['.mc-rest-chevron', '.mc-rest-chevron--accent'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ]],
  ['Чек-ин · согласие не подписано', [
    [18, '.mc-rest-consent-card',
    ['radius', 'background', 'padding', 'marginTop']],
    [19, '.mc-rest-consent-card-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [20, '.mc-rest-consent-card-body',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [21, '.mc-rest-consent-primary',
    ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [22, '.mc-rest-consent-secondary',
    ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ]],
  ['Чек-ин · остальное минимум', [
    [18, '.mc-rest-empty-note',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ]],
  ['Чек-ин · остальное со строкой периода', [
    [19, '.mc-rest-cycle-mark-chip',
    ['flex', 'align', 'minHeight', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [21, '.mc-rest-chevron',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ]],
  ['Чек-ин · остальное на неделе периода', [
    [5, '.mc-rest-cycle-week-card',
    ['radius', 'background', 'padding']],
    [6, '.mc-rest-cycle-week-head',
    ['align', 'justify', 'gap']],
    [7, '.mc-rest-cycle-week-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [8, '.mc-rest-cycle-week-badge',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [9, '.mc-rest-cycle-week-hint',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
    [10, '.mc-rest-cycle-days',
    ['gap', 'marginTop']],
    [11, '.mc-rest-cycle-day-btn',
    ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [13, '.mc-rest-cycle-week-actions',
    ['gap', 'marginTop']],
  ]],
];

const YV_FRAMES = [
  ['Чек-ин · вчера по ощущениям', {
    title: 6, sub: 7, list: 8, force: 9, forceTitle: 10, forceKcal: 11,
    block: 15, head: 16, label: 17, value: 18, track: 19, fill: 20, thumb: 21,
    ticks: 22, note: 23,
  }, [12, 14]],
  ['Чек-ин · по ощущениям своё число', {
    title: 6, sub: 7, list: 8, force: 9, forceTitle: 10, forceKcal: 11,
    block: 12, head: 13, label: 14, value: 15, track: 16, fill: 17, thumb: 18,
    ticks: 19, note: 20,
  }, null],
  ['Чек-ин · сила для пачки', {
    title: 6, sub: 7, list: 8, force: 9, forceTitle: 10, forceKcal: 11,
    block: 15, head: 16, label: 17, value: 18, track: 19, fill: 20, thumb: 21,
    ticks: 22, note: 23,
  }, [12, 14]],
];

// Сколько строк разбора гейт реально берёт в пары. Заморожено: падение
// значит, что строка выпала из сверки и вердикт на неё больше ничем не
// подкреплён; рост — что охват расширили и число пора поднять.
// Five corrupted snapshot rows are deliberately excluded; visible content is asserted below.
const COVERAGE_FLOOR = 344;

describe('«Утренний чек-ин» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));
  const yv = readRules(fs.readFileSync(YV_CSS, 'utf8'));

  it('кадр «Чек-ин · остальное» совпадает с пятым шагом', () => {
    expect(compare({ razbor, rules, frame: 'Чек-ин · остальное', pairs: STEP5 })).toEqual([]);
  });

  it('кадр «Чек-ин · вес» совпадает с шагом веса', () => {
    expect(compare({ razbor, rules, frame: 'Чек-ин · вес', pairs: WEIGHT })).toEqual([]);
  });

  it('кадр «Чек-ин · сон» совпадает с шагом сна', () => {
    expect(compare({ razbor, rules, frame: 'Чек-ин · сон', pairs: SLEEP })).toEqual([]);
  });

  it('кадр «Чек-ин · как вы сегодня» совпадает с шагом трёх шкал', () => {
    expect(compare({ razbor, rules, frame: 'Чек-ин · как вы сегодня', pairs: MOOD })).toEqual([]);
  });

  it('семь кадров цели по шагам совпадают с шагом шагов', () => {
    for (const [frame, n, withHint, extra] of STEPS_FRAMES) {
      expect(compare({
        razbor, rules, frame, pairs: stepsPairs(n, withHint).concat(extra),
      })).toEqual([]);
    }
  });

  it('тринадцать кадров слоёв, добавок и итога совпадают с продуктом', () => {
    for (const [frame, pairs] of REST_FRAMES) {
      expect(compare({ razbor, rules, frame, pairs })).toEqual([]);
    }
  });

  it('слой холода сохраняет три видимых варианта и контекстный тон данных', () => {
    expect(STEPS_SRC).toContain("{ id: 'coldShower'");
    expect(STEPS_SRC).toContain("{ id: 'coldBath'");
    expect(STEPS_SRC).toContain("{ id: 'coldSwim'");
    const inkData = 'var(--v4-ink-data, rgba(var(--v4-ink-rgb, 0, 0, 0), 0.56))';
    expect(rules.get('.mc-rest-type.is-on .mc-rest-wave').color).toBe(inkData);
  });

  it('кадр «Чек-ин · первый вес» совпадает с первым утром', () => {
    expect(compare({ razbor, rules, frame: 'Чек-ин · первый вес', pairs: WEIGHT_FIRST })).toEqual([]);
  });

  it('пять кадров входа в развилку совпадают со сводкой и списком дней', () => {
    for (const [frame, pairs] of FORK_FRAMES) {
      expect(compare({ razbor, rules: yv, frame, pairs })).toEqual([]);
    }
  });

  it('гейт называет свой охват', () => {
    const calls = [
      { frame: 'Чек-ин · остальное', pairs: STEP5 },
      { frame: 'Чек-ин · вес', pairs: WEIGHT },
      { frame: 'Чек-ин · сон', pairs: SLEEP },
      { frame: 'Чек-ин · как вы сегодня', pairs: MOOD },
      { frame: 'Чек-ин · первый вес', pairs: WEIGHT_FIRST },
      ...STEPS_FRAMES.map(([frame, n, withHint, extra]) => ({
        frame, pairs: stepsPairs(n, withHint).concat(extra),
      })),
      ...REST_FRAMES.map(([frame, pairs]) => ({ frame, pairs })),
      ...FORK_FRAMES.map(([frame, pairs]) => ({ frame, pairs })),
      // Кадры развилки сверяются парами ниже, но в счёт охвата не попадали:
      // их не было в этом списке. Из-за этого «сила для пачки» держалась в
      // тройке самых непокрытых кадров — все 26 её строк числились вне пар,
      // хотя 17 из них сверялись. Отчёт, который врёт в свою пользу, ещё
      // терпим; этот врал против себя и посылал работать по уже сделанному.
      ...YV_FRAMES.map(([frame, n, on]) => ({
        frame, pairs: yvPairs(n).concat(on ? yvOn(on[0], on[1]) : []),
      })),
    ];
    const { total, covered, missed, perFrame } = coverage({ razbor, calls });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);

    console.info(
      `[чек-ин] сверено ${covered} из ${total} строк разбора `
      + `(${((covered / total) * 100).toFixed(1)} %), кадров ${perFrame.length}, `
      + `вне пар ${missed}; больше всего пропущено: ${worst.join(' · ') || 'нет'}`,
    );

    // Храповик охвата: строка, выпавшая из пар, больше не сверяется ничем, а
    // вердикт на неё продолжает ссылаться. Падение числа означает именно это.
    expect(covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (covered > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${covered} строк вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });

  // Расчётный вес размечен инлайном в исходнике шага: пар «класс кадра →
  // правило продукта» тут нет, поэтому числа читаются из самого исходника.
  it('расчётный вес набран числами своих кадров', () => {
    const block = STEPS_SRC.slice(STEPS_SRC.indexOf('if (estimated) {'));
    // Крупное число тоном чернил 45 %, а не акцентом: цифра не введена.
    expect(block).toMatch(/fontSize: 58, fontWeight: 600, lineHeight: 0\.9, color: 'rgba\(0,0,0,\.45\)'/);
    // Плашка «Расчётный» / «Из профиля» — вторая поверхность, тон акцента.
    expect(block).toMatch(/padding: '5px 12px', borderRadius: 999, background: '#efe3cf'/);
    expect(block).toMatch(/fontSize: 10\.5, fontWeight: 700, letterSpacing: '0\.08em'/);
    // Карточка объяснения: первая поверхность, радиус 20, поля 15/17.
    expect(block).toMatch(/background: '#f7efe2', borderRadius: 20, padding: '15px 17px', marginTop: 22/);
    // Ряд строк среднего — один отступ на все строки.
    expect(block).toMatch(/justifyContent: 'space-between', marginTop: 11, fontSize: 12, fontWeight: 600/);
    // Строка «вторичные тоны» (уточнение 2 сентября): строки прошлых
    // взвешиваний подняты с 50 % до дна тона — 56 %. Сторожим роль, а не
    // литерал: в песочном наборе у неё то же значение, но в тёмных она
    // считается от чернил набора, а литерал остался бы чёрным.
    expect(block).toMatch(
      /fontWeight: 600, lineHeight: 1, color: 'var\(--v4-ink-data, rgba\(0,0,0,\.56\)\)'/,
    );
  });

  it('три кадра развилки совпадают с экраном оценки по ощущениям', () => {
    for (const [frame, n, on] of YV_FRAMES) {
      const pairs = yvPairs(n).concat(on ? yvOn(on[0], on[1]) : []);
      expect(compare({ razbor, rules: yv, frame, pairs })).toEqual([]);
    }
  });

  // Строка 11 кадра «замеры просрочены» и её близнецы во всех кадрах
  // «Остального»: кнопка выбора. Вес и тон свело ответом дизайнера №17 —
  // «верны кадры». Проверка осталась отдельной, потому что тон в пару не
  // входит (см. исключение выше): без неё цвет не сверяется ничем.
  it('кнопка выбора набрана по кадру: 700 тоном чернил 62 %', () => {
    const pill = rules.get('.mc-pill--choice');
    // Кадр: 700 при приглушённом тоне читается как «вариант». Прежние 600
    // полными чернилами делали все пилюли одинаково громкими, и выбранная
    // переставала выделяться.
    expect(pill['font-weight']).toBe('700');
    // Кадр: rgba(var(--ink),.62). Роль с этим числом одна — --v4-mark-1.
    // Ближайшая ink-роль дала бы 55 %: светлее, чем дизайнер проверял.
    expect(pill.color).toBe('var(--v4-mark-1, rgba(0, 0, 0, 0.62))');
  });

  // Строка «вид карточки шага» — одна форма у всех карточек шага, включая те,
  // которым кадр рисует вторую.
  it('карточки шага одной формы: радиус 20, поля 16/17', () => {
    expect(rules.get('.mc-rest-card')['border-radius']).toBe('20px');
    expect(rules.get('.mc-rest-card').padding).toBe('16px 17px');
    expect(rules.get('.mc-rest-cold')['border-radius']).toBe('20px');
    expect(rules.get('.mc-rest-cold').padding).toBe('16px 17px');
  });

  // Строка «зачем спрашиваем» блока кофе мельче пояснения карточки: 11/1,45
  // тоном чернил 45 %. Своих чисел контракт ей не даёт, значит верен кадр.
  it('строка «зачем спрашиваем» набрана своим кеглем, а не пояснением карточки', () => {
    const why = rules.get('.mc-rest-coffee-why');
    expect(why['font-size']).toBe('11px');
    expect(why['line-height']).toBe('1.45');
    expect(why.color).toBe('var(--v4-ink-data, rgba(0, 0, 0, 0.56))');
  });

  // Подпись «Легли»/«Встали» перебивалась старым правилом той же силы ниже по
  // файлу — 14 px тоном слейта. Область модалки возвращает ей вид набора.
  it('подписи блоков сна набраны прописными 10 px, а не старым слейтом', () => {
    const label = rules.get('.mc-modal--daily .mc-sleep-label');
    expect(label['font-size']).toBe('10px');
    expect(label['text-transform']).toBe('uppercase');
    expect(label.color).toBe('var(--v4-ink-data, rgba(0, 0, 0, 0.56))');
  });

  // Строка «вид дорожки»: одна дорожка на продукт. Мастер и развилка держат
  // одну высоту, кадры развилки рисуют 24.
  it('дорожка одна на продукт: 26 и у мастера, и у развилки', () => {
    expect(yv.get('.yv-v4-slider-track-wrap').height).toBe('26px');
    expect(yv.get('.yv-v4-slider-fill').height).toBe('26px');
    expect(yv.get('.yv-v4-slider').height).toBe('26px');
  });

  // Зазор шага складывался с отступами блоков: между силами и дорожкой выходило
  // 36 вместо 16. Экраны с плоским содержимым живут разметкой кадра, экраны со
  // своей обёрткой (.yv-hero) зазор сохраняют.
  // Зазор шага складывался с отступами блоков кадра во всех четырёх видах
  // шага развилки: между карточкой сводки и строкой под ней выходило 36
  // вместо 12. Подвал прижат снизу своим margin-top: auto.
  it('шаги развилки размечены отступами блоков, а не общим зазором', () => {
    expect(yv.get('.yv-step').gap).toBe('0');
    expect(yv.get('.yv-food-card')['margin-top']).toBe('16px');
    expect(yv.get('.yv-pack-note')['margin-top']).toBe('12px');
    expect(yv.get('.yv-canvas-foot')['margin-top']).toBe('auto');
  });

  // Подвал развилки один на все её экраны — пять кадров из шести дают 8.
  it('подвал развилки один на все её экраны', () => {
    expect(yv.get('.yv-canvas-foot').gap).toBe('8px');
    expect(yv.get('.yv-text-later')['min-height']).toBe('44px');
  });

  // Загрузочный день был единственным блоком, отбитым чертой, на всех пяти
  // шагах; кадр делает его карточкой.
  it('загрузочный день — карточка, а не блок за чертой', () => {
    const row = rules.get('.mc-steps-refeed-row');
    expect(row['border-radius']).toBe('16px');
    expect(row.background).toBe('var(--v4-c1, #f7efe2)');
    expect(row['border-top']).toBeUndefined();
  });

  // Верхняя карточка недели периода стояла на фоне страницы без обводки —
  // то есть на экране её не было видно вовсе; клетки дня внутри стояли на
  // первой поверхности. Обе поверхности были взяты ступенью ниже кадра.
  it('карточка недели периода видна, клетки дня внутри неё — тоже', () => {
    expect(rules.get('.mc-rest-cycle-week-card').background).toBe('var(--v4-chip, #efe3cf)');
    expect(rules.get('.mc-rest-cycle-day-btn').background).toBe('var(--v4-bg, #fffaf1)');
    expect(rules.get('.mc-rest-cycle-mark-chip').background).toBe('var(--v4-chip, #efe3cf)');
  });

  // Волна и шеврон стояли одним правилом; кадры описывают их порознь.
  it('шеврон строки и волна набраны порознь', () => {
    expect(rules.get('.mc-rest-chevron')['font-size']).toBe('15px');
    expect(rules.get('.mc-rest-wave')['font-size']).toBe('11px');
  });

  it('осознанные отступления не разрослись', () => {
    // Именованная лестница чернил закрыла прежние допуски 50/42 %: data-текст
    // теперь имеет собственную роль 56 %. Список обязан уменьшаться вместе с
    // закрытием, а не оставаться с запасом.
    expect(EXCEPTIONS.size).toBe(23);
  });
});
