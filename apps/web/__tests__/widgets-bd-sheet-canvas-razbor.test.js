// Кадры Главной против раздела канваса «Разбор кадров · элемент за элементом»
// (пакет 30 августа). Раздел даёт каждому нарисованному элементу собственные
// числа; здесь по ним сверяются с продуктовым CSS каркас листа разбора (общий
// у восемнадцати кадров «Разбор · …») и сам кадр «Главная · дефолтная
// раскладка» — плитка за плиткой.
//
// Метод: строки контракта читаются из самого канваса, поэтому расхождение
// всплывает при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CSSPROP, PICK, ROLE, compare, coverage, norm, readRazbor, readRules, resolveIndex } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');

// Разборщик один на все канвасы — общий модуль. Свой был здесь до 31 августа и
// содержал дыру: `norm()` сворачивал `var(--роль, запасное)` в запасное, а
// рисуется роль. Пока тема по умолчанию песочная, `--v4-ink-4` даёт 38 %, а
// запасное рядом писали 35 % — сверка сравнивала два одинаковых запасных и
// проходила зелёной, не глядя на то, что видит человек. Общий модуль берёт
// значение роли из самого набора; здесь остаются только таблицы пар этой зоны.

const SHELL = [
  [75, '.widget-bd-sheet__grab', ['width', 'height']],
  [76, '.widget-bd-sheet__head', ['gap']],
  [77, '.widget-bd-sheet__title', ['fontWeight', 'fontSize', 'lineHeight']],
  [78, '.widget-bd-sheet__close', ['width', 'height']],
  [79, '.widget-bd-sheet__kicker', ['marginTop', 'fontWeight', 'fontSize']],
  [80, '.widget-bd-sheet__hero', ['marginTop', 'gap']],
  [81, '.widget-bd-sheet__hero-val', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [82, '.widget-bd-sheet__hero-unit', ['fontWeight', 'fontSize']],
  [83, '.widget-bd-sheet__insight', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
  [84, '.widget-bd-sheet__bars', ['marginTop', 'gap', 'height']],
  [95, '.widget-bd-sheet__stats', ['marginTop', 'gap']],
  [96, '.widget-bd-sheet__stat-row', ['gap']],
  [97, '.widget-bd-sheet__stat-label', ['fontWeight', 'fontSize', 'lineHeight']],
  [98, '.widget-bd-sheet__stat-value', ['fontWeight', 'fontSize', 'lineHeight']],
  [99, '.widget-bd-sheet__norm', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
  [100, '.widget-bd-sheet__action', ['marginTop']]
];

// Новые виды графика шести листов пакета 22 августа: кадр → правило продукта.
const CHARTS = [
  // Графики двенадцати листов первого пакета.
  ['Разбор · Сон', 84, '.widget-bd-sheet__sleep-strip', ['marginTop', 'direction', 'gap']],
  ['Разбор · Сон', 85, '.widget-bd-sheet__sleep-timeline-avg', ['width', 'background']],
  ['Разбор · Сон', 86, '.widget-bd-sheet__sleep-timeline-row', ['align', 'gap']],
  ['Разбор · Сон', 87, '.widget-bd-sheet__sleep-timeline-label', ['width', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Разбор · Сон', 88, '.widget-bd-sheet__sleep-timeline-track', ['height', 'radius', 'background']],
  ['Разбор · Сон', 89, '.widget-bd-sheet__sleep-timeline-bar', ['height', 'radius', 'background']],
  ['Разбор · Сон', 103, '.widget-bd-sheet__sleep-axis', ['justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Разбор · Вода', 84, '.widget-bd-sheet__water-profile', ['marginTop', 'height', 'align', 'gap']],
  ['Разбор · Вода', 85, '.widget-bd-sheet__water-profile-gap', ['background', 'radius']],
  ['Разбор · Вода', 86, '.widget-bd-sheet__water-profile-bar > i', ['radius', 'background']],
  ['Разбор · Вода', 98, '.widget-bd-sheet__water-axis', ['justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Разбор · БЖУ', 81, '.widget-bd-sheet__hero-tracks', ['marginTop', 'direction', 'gap']],
  ['Разбор · БЖУ', 84, '.widget-bd-sheet__hero-track-bar', ['height', 'radius', 'background', 'marginTop']],
  ['Разбор · БЖУ', 88, '.widget-bd-sheet__grid3x7', ['marginTop', 'direction', 'gap']],
  ['Разбор · БЖУ', 89, '.widget-bd-sheet__grid-row', ['align', 'gap']],
  ['Разбор · БЖУ', 91, ['.widget-bd-sheet__grid-cell', '.widget-bd-sheet__grid-cell.is-ok'], ['height', 'radius', 'background']],
  ['Разбор · Оценка дня', 93, '.widget-bd-sheet__factors', ['marginTop', 'direction', 'gap']],
  ['Разбор · Риск-радар', 100, '.widget-bd-sheet__drivers', ['marginTop', 'direction', 'gap']],
  ['Разбор · Риск-радар', 101, ['.widget-bd-sheet__driver-mark', '.widget-bd-sheet__driver-row.is-bad .widget-bd-sheet__driver-mark'], ['width', 'height', 'radius', 'background']],
  ['Разбор · Тренд здоровья', 87, '.widget-bd-sheet__contrib', ['marginTop', 'direction', 'gap']],
  ['Разбор · Тренд здоровья', 88, '.widget-bd-sheet__contrib-row', ['align', 'gap']],
  ['Разбор · Тренд здоровья', 89, '.widget-bd-sheet__contrib-label', ['width', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Разбор · Карта активности', 84, '.widget-bd-sheet__grid7x5', ['marginTop', 'direction', 'gap']],
  // Профиль по часам у риска — тот же, что у воды, но со своими номерами.
  ['Разбор · Риск-радар', 83, '.widget-bd-sheet__water-profile', ['marginTop', 'height', 'align', 'gap']],
  ['Разбор · Риск-радар', 84, '.widget-bd-sheet__water-profile-gap', ['background', 'radius']],
  ['Разбор · Риск-радар', 85, '.widget-bd-sheet__water-profile-bar > i', ['radius', 'background']],
  ['Разбор · Риск-радар', 99, '.widget-bd-sheet__water-axis', ['justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  // Лента «Окно до сна» — та же лента, что у сна, со своими номерами.
  ['Разбор · Окно до сна', 84, '.widget-bd-sheet__sleep-strip', ['marginTop', 'direction', 'gap']],
  ['Разбор · Окно до сна', 85, '.widget-bd-sheet__sleep-timeline-row', ['align', 'gap']],
  ['Разбор · Окно до сна', 86, '.widget-bd-sheet__sleep-timeline-label', ['width', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Разбор · Окно до сна', 87, '.widget-bd-sheet__sleep-timeline-track', ['height', 'radius', 'background']],
  ['Разбор · Окно до сна', 88, '.widget-bd-sheet__sleep-timeline-bar', ['height', 'radius', 'background']],
  ['Разбор · Окно до сна', 102, '.widget-bd-sheet__sleep-axis', ['justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  // Дельта недели у веса 2×2 — тот же кегль, что на плитке 2×1.
  ['Разбор · Калории', 65, ['.widget-v4-delta', '.widget-v4-delta.widget-v4-val--act'], ['fontWeight', 'fontSize', 'lineHeight']],
  // Разбор таблицей: строки «разбор · Шаги» и «разбор · Динамика веса».
  ['Разбор · Шаги', 95, ['.widget-bd-sheet__stats', '.widget-bd-sheet__stats--table'], ['marginTop', 'direction']],
  ['Разбор · Шаги', 96, ['.widget-bd-sheet__stat-row', '.widget-bd-sheet__stats--table .widget-bd-sheet__stat-row'], ['align', 'justify', 'padding']],
  ['Разбор · Шаги', 97, ['.widget-bd-sheet__stat-label', '.widget-bd-sheet__stats--table .widget-bd-sheet__stat-label'], ['fontWeight', 'fontSize', 'lineHeight']],
  ['Разбор · Шаги', 98, ['.widget-bd-sheet__stat-value', '.widget-bd-sheet__stats--table .widget-bd-sheet__stat-value'], ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Разбор · Шаги', 103, ['.widget-bd-sheet__stat-row', '.widget-bd-sheet__stats--table .widget-bd-sheet__stat-row.is-total'], ['align', 'justify', 'marginTop']],
  // Шесть листов пакета 22 августа.
  ['Разбор · Клетчатка', 84, '.widget-bd-sheet__sources', ['marginTop', 'gap']],
  ['Разбор · Клетчатка', 87, '.widget-bd-sheet__source-bar', ['height', 'marginTop']],
  ['Разбор · Белок', 84, '.widget-bd-sheet__meal-bars', ['marginTop', 'gap', 'height']],
  ['Разбор · Белок', 90, '.widget-bd-sheet__meal-axis', ['gap', 'marginTop', 'fontWeight', 'fontSize']],
  ['Разбор · Качество еды', 84, '.widget-bd-sheet__stack', ['marginTop', 'gap', 'height']],
  ['Разбор · Качество еды', 85, '.widget-bd-sheet__stack-col', ['gap']],
  ['Разбор · Готовность ко сну', 84, '.widget-bd-sheet__evening', ['marginTop', 'gap']],
  ['Разбор · Готовность ко сну', 85, '.widget-bd-sheet__evening-row', ['gap']],
  ['Разбор · Готовность ко сну', 86, '.widget-bd-sheet__evening-label', ['width', 'fontWeight', 'fontSize']],
  ['Разбор · Готовность ко сну', 87, '.widget-bd-sheet__evening-track', ['height']],
  ['Разбор · Готовность ко сну', 91, '.widget-bd-sheet__evening-dots', ['gap', 'marginTop']],
  ['Разбор · Готовность ко сну', 93, '.widget-bd-sheet__evening-dot', ['width', 'height']]
];

// Кадр «Главная · дефолтная раскладка» — плитка за плиткой. Он же подложка
// всех восемнадцати листов разбора: больше тысячи строк снимка побайтово
// повторяют эти, поэтому закрытие кадра закрывает и их.
//
// Пары держатся не на номерах элементов, а на якоре: плитка опознаётся по
// своей приметной строке, остальное берётся смещением внутри неё. Дизайнер
// переставляет плитки в кадре (31 августа порядок вернулся к контракту, и
// элементы 61–73 перенумеровались) — таблица это переживает, а якорь, который
// перестал быть единственным, гейт называет вслух.
const MAIN = [
  // Калории, плитка-герой 2×2
  ['плитка: фон var(--c2), поля 14px', 0, 'body:has(.widgets-tab) .widget--calories', ['background', 'padding']],
  ['плитка: фон var(--c2), поля 14px', 1, '.widget-calories__hero-value', ['align', 'gap']],
  ['плитка: фон var(--c2), поля 14px', 2, '.widget-calories__hero-value .widget-calories__value--lg', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  ['плитка: фон var(--c2), поля 14px', 3, '.widget-calories__hero-remaining-label', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  ['плитка: фон var(--c2), поля 14px', 4, '.widget-calories__hero-bar-wrap', ['marginTop']],
  ['плитка: фон var(--c2), поля 14px', 5, '.widget-calories__hero-bar', ['height', 'radius', 'background']],
  ['плитка: фон var(--c2), поля 14px', 6, '.widget-calories__hero-bar-fill', ['height', 'radius', 'background']],
  ['плитка: фон var(--c2), поля 14px', 7, '.widget-calories__hero-bar-foot', ['justify', 'align', 'marginTop']],
  ['плитка: фон var(--c2), поля 14px', 8, '.widget-calories__hero-bar-col', ['direction', 'gap']],
  ['плитка: фон var(--c2), поля 14px', 9, '.widget-calories__hero-bar-num', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['плитка: фон var(--c2), поля 14px', 10, '.widget-calories__hero-bar-cap', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['плитка: фон var(--c2), поля 14px', 11, '.widget-calories__hero-bar-col--end', ['align']],
  ['плитка: фон var(--c2), поля 14px', 12, '.widget-calories__hero-bar-num--good', ['color']],

  // Инсулиновая волна 2×2 — подпись под графиком
  ['отступ сверху auto, распределение space-between, выравнивание baseline', 0,
    ['.widget-v4-stack__footer', '.widget-v4-insulin-wave__footer'], ['marginTop', 'justify', 'align']],
  ['«3 приёма»', 0, ['.widget-v4-row__meta', '.widget-v4-row__meta--count'], ['fontWeight', 'fontSize', 'lineHeight']],

  // Кольца БЖУ 3×2
  ['зазор 6px, отступ сверху auto, отступ снизу auto', 0, '.widget-v4-macros', ['gap', 'marginTop', 'marginBottom']],
  ['зазор 6px, отступ сверху auto, отступ снизу auto', 1, '.widget-v4-macro', ['textAlign']],
  ['«Белки» — ключ', 0, '.widget-v4-macro__label', ['marginBottom']],
  ['«96» — моноцифры', 0, ['.widget-v4-macro__fact', '.widget-v4-macro__fact--bad'], ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['«/ 150»', 0, '.widget-v4-macro__fact-tgt', ['color']],
  ['«48» — моноцифры', 0, '.widget-v4-macro__fact', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  // Шаги 2×1
  ['распределение space-between, выравнивание baseline, зазор 6px', 0,
    ['.widget-v4-row', '.widget-v4-row--tight'], ['justify', 'align', 'gap']],
  ['«в среднем 8 940»', 0, '.widget-v4-row__meta', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['«в среднем 8 940»', 1, '.widget-v4-stepbars', ['align', 'gap', 'height', 'marginTop']],
  ['«в среднем 8 940»', 2, '.widget-v4-stepbars__bar', ['radius', 'background']],
  ['«в среднем 8 940»', 4, '.widget-v4-stepbars__bar.is-goal', ['background']],

  // Тепловая карта 2×1
  ['зазор 4px, отступ сверху auto', 0, '.widget-v4-heat', ['gap', 'marginTop']],
  ['зазор 4px, отступ сверху auto', 1, ['.widget-v4-heat__bar', '.widget-v4-heat__bar--d3'], ['height', 'radius', 'background']],
  ['зазор 4px, отступ сверху auto', 2, ['.widget-v4-heat__bar', '.widget-v4-heat__bar--d1'], ['height', 'radius', 'background']],
  ['зазор 4px, отступ сверху auto', 3, ['.widget-v4-heat__bar', '.widget-v4-heat__bar--d2'], ['height', 'radius', 'background']],

  // Сон 1×1
  ['«6,4» — моноцифры', 0, '.widget-v4-mini__value', ['marginTop']],

  // Риск-радар 2×2, вид «Шкала»
  ['«низкий»', -1, ['.widget-v4-hero-num', '.widget-v4-hero-num.widget-risk-scale-hero'], ['align', 'gap', 'marginTop']],
  ['«низкий»', 0, ['.widget-v4-hero-num__val', '.widget-risk-scale-hero .widget-v4-hero-num__val--risk'], ['fontWeight', 'fontSize', 'lineHeight']],
  ['«низкий»', 1, '.widget-risk-steps', ['gap', 'marginTop']],
  ['«низкий»', 2, '.widget-risk-steps__seg', ['height', 'radius']],
  ['«поднимут:', 0, '.widget-risk-rise', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  // Тренд здоровья 2×1: заливка плитки, низ и спарклайн
  ['плитка: фон var(--gr-bg)', 0, 'body:has(.widgets-tab) .widget--healthTrend', ['background']],
  ['плитка: фон var(--gr-bg)', 1, '.widget-trend-compact__row', ['align', 'justify', 'gap', 'marginTop']],
  ['плитка: фон var(--gr-bg)', 3, '.widget-trend-compact__spark', ['marginBottom']],

  // Вес 2×1, вид «Число и неделя»
  ['«−0,9 за неделю»', 0, '.widget-weight__number-week-delta', ['fontWeight', 'fontSize', 'lineHeight']],
  ['«−0,9 за неделю»', 1, '.widget-weight__number-week-spark', ['marginBottom']],

  // Белок и Клетчатка 1×1
  ['высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px', 0, '.widget-v4-goalbar', ['height', 'radius', 'background', 'marginTop']],
  ['высота 4px, радиус 999px, фон rgba(var(--ink),.08), отступ сверху 7px', 1, '.widget-v4-goalbar__fill', ['radius']],

  // Ярус «Рекомендуемый экран» и пустой экран
  ['радиус 20px, фон var(--c1), поля 26px 20px', 0, '.widget-v4-empty', ['radius', 'background', 'padding']],
  ['радиус 20px, фон var(--c1), поля 16px', 0, '.widget-v4-recommended__card', ['radius', 'background', 'padding', 'align', 'gap']],
  ['«Вернуть рекомендуемый экран»', 0, '.widget-v4-recommended__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['«Вернуть рекомендуемый экран»', 1, '.widget-v4-recommended__desc', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  ['«Вернуть рекомендуемый экран»', 2, '.widget-v4-recommended__btn', ['align', 'padding', 'radius', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  // Пустой экран
  ['«Виджетов нет»', 0, ['.widgets-empty__title', '.widget-v4-empty .widgets-empty__title'], ['fontWeight', 'fontSize', 'color']],
  ['«Виджетов нет»', 1, '.widget-v4-empty .widgets-empty__desc', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  ['«Виджетов нет»', 2, '.widget-v4-empty__btn', ['align', 'gap', 'marginTop', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'color']],
  ['«Вернуть стандартный экран»', 0, '.widget-v4-empty__reset', ['align', 'justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']]
];

// Формы, которые повторяются из кадра в кадр: один и тот же элемент продукта
// нарисован в подложке каждого листа и каждой шторки. Пара на форму закрывает
// его везде, где форма в кадре одна.
const SHAPES = [
  ['шрифт 600 26px/1 Figtree', '.widget-v4-hero-num__val', ['fontWeight', 'fontSize', 'lineHeight']],
  ['радиус 6px 6px 3px 3px, фон var(--acs)', '.widget-bd-sheet__bar > i', ['radius', 'background']],
  ['высота 5px, радиус 999px, фон var(--gr2)', '.widget-bd-sheet__hero-track-fill', ['height', 'radius', 'background']],
  ['высота 8px, радиус 999px, фон var(--acs)', '.widget-bd-sheet__wave-week-seg.is-active', ['height', 'radius']]
];

// Отвергнутые кадры и «живой прогон» отсеиваются здесь же, а не только гейтом:
// форма из них в таблицу не попадает.
function shapePairs(razbor, stopFrames) {
  const frames = [...new Set([...razbor.keys()].map((k) => k.split('|')[0]))]
    .filter((f) => stopFrames.has(f));
  const pairs = [];
  for (const frame of frames) {
    for (const [anchor, sel, props] of SHAPES) {
      const hits = [...razbor.keys()].filter((k) => {
        const at = k.lastIndexOf('|');
        return k.slice(0, at) === frame && (razbor.get(k) || '').includes(anchor);
      });
      if (hits.length === 1) pairs.push([frame, anchor, 0, sel, props]);
    }
  }
  return pairs;
}

// Хвост листа разбора — разбор числами, норма и действие — одинаков во всех
// восемнадцати листах, но номера элементов у каждого свои. Таблица собирается
// из разбора по форме строки: каждая форма внутри кадра встречается один раз
// («повторы одного вида внутри кадра свёрнуты»), поэтому якорь однозначен.
const SHEET_TAIL = [
  ['отступ сверху 16px, направление column, зазор 11px', '.widget-bd-sheet__stats', ['marginTop', 'direction', 'gap']],
  ['выравнивание baseline, распределение space-between, зазор 12px', '.widget-bd-sheet__stat-row', ['align', 'justify', 'gap']],
  ['шрифт 500 11px/1.3 Figtree, цвет rgba(var(--ink),.5)', '.widget-bd-sheet__stat-label', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['шрифт 500 11.5px/1.4 Figtree, цвет rgba(var(--ink),.55), отступ сверху 14px', '.widget-bd-sheet__norm', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ['моноцифры: флекс none, шрифт 700 12px/1 Figtree, цвет var(--tx)', '.widget-bd-sheet__stat-value', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['высота от 48px, радиус 999px, фон var(--acs), цвет var(--on-acs)', ['.widget-bd-sheet__chip', '.widget-bd-sheet__action'], ['minHeight', 'radius', 'background', 'color', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight']]
];

function sheetTailPairs(razbor) {
  const frames = [...new Set([...razbor.keys()]
    .map((k) => k.split('|')[0])
    .filter((f) => /^Разбор · /.test(f)))];
  const pairs = [];
  for (const frame of frames) {
    for (const [anchor, sel, props] of SHEET_TAIL) {
      const hits = [...razbor.keys()].filter((k) => {
        const at = k.lastIndexOf('|');
        return k.slice(0, at) === frame && (razbor.get(k) || '').includes(anchor);
      });
      // Форма, которой в этом листе нет (у части листов нет разбора числами
      // или нормы), пропускается: гейт сверяет то, что кадр рисует.
      if (hits.length === 1) pairs.push([frame, anchor, 0, sel, props]);
    }
  }
  return pairs;
}

// Три кадра смены вида, не считая листа: удержание, принятый выбор и новый
// вид. Здесь живут пилюли подсказки и подтверждения и состояния самой плитки.
const VIEW_STATES = [
  ['Смена вида · удержание', 'плитка: сдвиг scale(.965)', 0,
    '.widget-v4-tile--holding', []],
  ['Смена вида · удержание', '«удерживайте, чтобы сменить вид»', 0,
    '.widget-v4-hold-hint__pill', ['align', 'gap', 'padding', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Смена вида · новый вид', '«вид сохранён»', 0,
    ['.widget-v4-hold-hint__pill', '.widget-v4-hold-hint__pill--saved'],
    ['align', 'gap', 'padding', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Смена вида · выбор принят', 'прозрачность .28, сдвиг scale(.94)', 0,
    '.widget-v4-tile--exit', []]
];

// Кадр «Шторка · Кольца БЖУ» — четыре вида плитки БЖУ в превью листа смены
// вида: кольца 3×2, три полосы 2×1, «что выбивается» 2×2 и «только белок» 1×1.
// Числа превью совпадают с полноразмерным кадром Главной там, где вид тот же.
const MACROS = [
  ['Шторка · Кольца БЖУ', 'зазор 6px, отступ сверху auto, отступ снизу auto', 0,
    '.widget-v4-macros', ['gap', 'marginTop', 'marginBottom']],
  ['Шторка · Кольца БЖУ', 'зазор 6px, отступ сверху auto, отступ снизу auto', 1,
    '.widget-v4-macro', ['textAlign']],
  ['Шторка · Кольца БЖУ', 'зазор 6px, отступ сверху auto, отступ снизу auto', 2,
    '.widget-v4-macro__label', ['marginBottom']],
  ['Шторка · Кольца БЖУ', 'зазор 6px, отступ сверху auto, отступ снизу auto', 3,
    ['.widget-v4-macro__fact', '.widget-v4-macro__fact--bad'],
    ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  // «/ 150» — норма и косая одним тоном чернил: косая относится к норме.
  ['Шторка · Кольца БЖУ', 'зазор 6px, отступ сверху auto, отступ снизу auto', 4,
    '.widget-v4-macro__fact-sep', ['color']],
  ['Шторка · Кольца БЖУ', 'зазор 6px, отступ сверху auto, отступ снизу auto', 4,
    '.widget-v4-macro__fact-tgt', ['color']],

  ['Шторка · Кольца БЖУ', 'направление column, зазор 4px, отступ сверху auto', 0,
    '.widget-v4-macro-bars', ['direction', 'gap', 'marginTop']],
  ['Шторка · Кольца БЖУ', 'направление column, зазор 4px, отступ сверху auto', 1,
    '.widget-v4-macro-bar-row', ['align', 'gap']],
  ['Шторка · Кольца БЖУ', 'направление column, зазор 4px, отступ сверху auto', 2,
    ['.widget-v4-kicker', '.widget-v4-macro-bar-row__label'], ['width', 'lineHeight']],
  ['Шторка · Кольца БЖУ', 'направление column, зазор 4px, отступ сверху auto', 3,
    '.widget-v4-macro-bar-row__track', ['height', 'radius', 'background']],
  ['Шторка · Кольца БЖУ', 'направление column, зазор 4px, отступ сверху auto', 4,
    ['.widget-v4-macro-bar-row__fill', '.widget-v4-macro-bar-row__fill--bad'],
    ['height', 'radius', 'background']],
  ['Шторка · Кольца БЖУ', 'направление column, зазор 4px, отступ сверху auto', 5,
    ['.widget-v4-macro-bar-row', '.widget-v4-macro-bar-row__nums'],
    ['fontWeight', 'fontSize', 'lineHeight', 'width', 'textAlign']],
  ['Шторка · Кольца БЖУ', 'позиция absolute, ширина 2px, высота 9px', 0,
    '.widget-v4-macro-bar-row__norm', ['width', 'height', 'radius', 'background']],

  ['Шторка · Кольца БЖУ', 'выравнивание baseline, зазор 5px, отступ сверху 9px', 0,
    '.widget-v4-deficit-hero', ['align', 'gap', 'marginTop']],
  ['Шторка · Кольца БЖУ', 'выравнивание baseline, зазор 5px, отступ сверху 9px', 1,
    '.widget-v4-deficit-hero', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  ['Шторка · Кольца БЖУ', 'отступ сверху auto, направление column, зазор 6px', 0,
    '.widget-v4-deficit-rows', ['marginTop', 'direction', 'gap']],
  ['Шторка · Кольца БЖУ', 'отступ сверху auto, направление column, зазор 6px', 1,
    ['.widget-v4-deficit-rows', '.widget-v4-deficit-rows__row'],
    ['justify', 'fontWeight', 'fontSize', 'lineHeight', 'color']],

  ['Шторка · Кольца БЖУ', 'высота 4px, радиус 999px, фон rgba(var(--ink),.08)', 0,
    '.widget-v4-goalbar', ['height', 'radius', 'background']]
];

// Кадры шторок «Инсулиновая волна» и «Сон» — виды этих двух плиток. Оба
// кадра рисуют превью в натуральную величину формата (2×1 — 143×64, 2×2 —
// 143×136), поэтому числа превью здесь не превью-масштаб, а сама плитка.
const WAVE_SLEEP = [
  ['Шторка · Инсулиновая волна', 'отступ сверху 9px, распределение space-between, выравнивание baseline', 0,
    '.widget-v4-stack__footer', ['justify', 'align']],
  ['Шторка · Инсулиновая волна', '«второй приём попал в волну»', 0,
    '.widget-v4-insulin-wave__overlap-note', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Шторка · Инсулиновая волна', 'зазор 2px, высота 9px, отступ сверху auto', 0,
    '.widget-v4-insulin-daybar', ['gap', 'height', 'marginTop']],
  ['Шторка · Инсулиновая волна', 'флекс 9, радиус 999px 0 0 999px', 0,
    ['.widget-v4-insulin-daybar__seg', '.widget-v4-insulin-daybar__seg:first-child'],
    ['radius', 'background']],
  ['Шторка · Инсулиновая волна', 'флекс 13, фон #e6cfa8', 0,
    '.widget-v4-insulin-daybar__seg--up', ['background']],
  ['Шторка · Инсулиновая волна', 'флекс 2, фон var(--tx)', 0,
    '.widget-v4-insulin-daybar__seg--now', ['background']],
  ['Шторка · Инсулиновая волна', 'радиус 0 999px 999px 0', 0,
    '.widget-v4-insulin-daybar__seg:last-child', ['radius']],
  ['Шторка · Инсулиновая волна', 'распределение space-between, шрифт 600 8.5px/1', 0,
    '.widget-v4-insulin-daybar__labels', ['justify', 'fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],

  ['Шторка · Сон', 'выравнивание flex-end, распределение space-between, зазор 9px, отступ сверху auto', 0,
    '.widget-v4-sleep-debt', ['align', 'justify', 'gap', 'marginTop']],
  ['Шторка · Сон', 'выравнивание baseline, зазор 3px', 0,
    '.widget-v4-sleep-debt__num', ['align', 'gap']],
  ['Шторка · Сон', 'выравнивание flex-end, зазор 3px, высота 22px, флекс none, ширина 62px', 0,
    '.widget-v4-sleep-debt__bars', ['align', 'gap', 'height', 'width']],
  ['Шторка · Сон', 'флекс 1, высота 8px, радиус 2px, фон var(--val-bad)', 0,
    ['.widget-v4-sleep-debt__bar', '.widget-v4-sleep-debt__bar--short'], ['radius', 'background']],
  ['Шторка · Сон', 'флекс 1, высота 14px, радиус 2px, фон var(--gr2)', 0,
    ['.widget-v4-sleep-debt__bar', '.widget-v4-sleep-debt__bar--ok'], ['radius', 'background']],
  ['Шторка · Сон', 'позиция relative, высота 7px, радиус 999px', 0,
    '.widget-v4-sleep-window', ['height', 'radius', 'background']],
  ['Шторка · Сон', 'позиция absolute, ширина 68%, радиус 999px', 0,
    '.widget-v4-sleep-window__target', ['radius', 'background']],
  ['Шторка · Сон', 'позиция absolute, ширина 57%, радиус 999px', 0,
    '.widget-v4-sleep-window__actual', ['radius', 'background']],
  ['Шторка · Сон', 'распределение space-between, шрифт 600 9px/1 Figtree, цвет rgba(var(--ink),.4), отступ сверху 7px', 0,
    '.widget-v4-sleep-window__labels', ['justify', 'fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']]
];

// Кадры «Быстрые действия · …» — карточка плавающей кнопки, одиннадцать штук.
// Общее у всех — подложка, сама карточка, строка пункта и две кнопки; своё —
// состояние: раскрыто, один пункт, правка, скрытые чипами.
const QUICK = [
  ['Быстрые действия · раскрыто', 'вписан 0, фон rgba(43,22,8,.34)', 0,
    '.widgets-quick-scrim', ['background']],
  ['Быстрые действия · раскрыто', 'ширина 232px, фон var(--bg)', 0,
    '.widgets-quick-sheet', ['background', 'radius', 'padding']],
  ['Быстрые действия · раскрыто', 'ширина 232px, фон var(--bg)', 1,
    '.widgets-quick-sheet__row', ['align', 'gap', 'minHeight']],
  ['Быстрые действия · раскрыто', '«Мессенджер»', 0,
    '.widgets-quick-sheet__row-label', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Быстрые действия · раскрыто', 'высота 1px, фон rgba(var(--ink),.08)', 0,
    '.widgets-quick-sheet__divider', ['height', 'background']],
  ['Быстрые действия · раскрыто', '«1,7 из 2,7»', 0,
    '.widgets-quick-sheet__meta', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Быстрые действия · раскрыто', 'зазор 6px, отступ сверху 9px', 0,
    '.widgets-quick-sheet__chips', ['gap', 'marginTop']],
  ['Быстрые действия · раскрыто', '«200»', 0,
    '.widgets-quick-sheet__chip', ['minHeight', 'radius', 'background', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Быстрые действия · раскрыто', 'ширина 52px, высота 52px', 0,
    '.widgets-quick-fab', ['width', 'height', 'radius', 'background', 'align', 'justify']],
  ['Быстрые действия · один пункт · вода · раскрыто', '«Вода»', 0,
    ['.widgets-quick-sheet__title', '.widgets-quick-sheet__head'], ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Быстрые действия · один пункт · вода · раскрыто', 'ширина 232px, фон var(--bg)', 1,
    '.widgets-quick-sheet__head', ['align', 'gap']],
  // Круг 22 px в режиме правки — это минус снятия пункта, а не иконка строки.
  ['Быстрые действия · правка · режим', 'ширина 22px, высота 22px', 0,
    '.widgets-quick-minus', ['width', 'height', 'radius', 'background', 'align', 'justify']],
  ['Быстрые действия · правка · скрытые', 'высота от 28px, поля 0 10px', 0,
    ['.widgets-quick-chip', '.widgets-quick-chip__label'],
    ['minHeight', 'padding', 'radius', 'background', 'align', 'gap', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Быстрые действия · правка · скрытые', 'позиция absolute, зазор 6px, выравнивание center', 0,
    '.widgets-quick-chips', ['gap', 'align']],
  ['Быстрые действия · ни одного', 'ширина 40px, высота 40px', 0,
    '.widgets-settings-fab', ['width', 'height', 'radius', 'background', 'align', 'justify']]
];

// Лист смены вида. Кадров шестнадцать и названы они двумя способами: десять
// «Шторка · …» для видов первого пакета и шесть «Смена вида · <виджет>» для
// шести видов пакета 22 августа. Разметка у них одна, поэтому и таблица одна.
// Каркас общий, но номера подписи, галочки и превью в каждом кадре свои:
// таблица собирается из самого разбора по форме строки и переживает
// перенумерацию.
const VIEW_SHEET_FRAME = /^(Шторка · [^·]+|Смена вида · (?:Клетчатка|Белок|Окно до сна|Качество еды|Ритм приёмов|Готовность ко сну))$/;

function shutterPairs(razbor) {
  const frames = [...new Set([...razbor.keys()]
    .map((k) => k.split('|')[0])
    .filter((f) => VIEW_SHEET_FRAME.test(f)))];
  const pairs = [];
  for (const frame of frames) {
    // Кадры «Шторка» показывают экран под листом и нумеруются с него, кадры
    // «Смена вида» — только лист. Каркас ищем по его первой строке, ручке.
    const grab = [...razbor.keys()]
      .filter((k) => k.slice(0, k.lastIndexOf('|')) === frame)
      .map((k) => Number(k.slice(k.lastIndexOf('|') + 1)))
      .filter((i) => /^ширина 36px, высота 4px/.test(razbor.get(`${frame}|${i}`) || ''))[0];
    if (grab == null) continue;
    pairs.push([frame, grab, '.widget-wd-sheet__grab', ['width', 'height', 'radius', 'background', 'marginBottom']]);
    pairs.push([frame, grab + 1, '.widget-wd-sheet__subtitle', ['marginTop']]);
    pairs.push([frame, grab + 2, '.widget-wd-sheet__list', ['direction', 'gap', 'marginTop']]);
    // Строка варианта: превью 3×2 не оставляет места подписи рядом, и кадр
    // складывает её колонкой.
    const row = razbor.get(`${frame}|${grab + 3}`) || '';
    pairs.push(/направление column/.test(row)
      ? [frame, grab + 3, '.widget-wd-sheet__opt--stacked', ['direction', 'gap']]
      : [frame, grab + 3, '.widget-wd-sheet__opt', ['align', 'gap']]);
    let title = null;
    let check = null;
    let preview = null;
    for (let i = grab + 4; i <= grab + 46 && !(title && check && preview); i += 1) {
      const value = razbor.get(`${frame}|${i}`);
      if (value == null) continue;
      if (!title && /шрифт 700 11\.5px\/1\.3/.test(value)) {
        title = [frame, i, '.widget-wd-sheet__opt-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']];
      }
      if (!check && /^флекс none, цвет var\(--ac\)$/.test(value)) {
        check = [frame, i, '.widget-wd-sheet__check', ['color']];
      }
      if (!preview) {
        const size = /^плитка: ширина (\d+)px, высота (\d+)px/.exec(value);
        if (size) {
          const key = size[1] === '68' ? '1x1' : size[1] === '218' ? '3x2' : (size[2] === '64' ? '2x1' : '2x2');
          preview = [frame, i,
            ['.widget-wd-sheet__preview', `.widget-wd-sheet__preview--${key}`], ['width', 'height']];
        }
      }
    }
    for (const p of [title, check, preview]) if (p) pairs.push(p);
  }
  return pairs;
}


// Цветные расхождения, которые вскрылись 31 августа при переходе на общий
// разборщик. Прежний свой `norm()` сворачивал `var(--роль, запасное)` в
// запасное и сверял два одинаковых запасных — зелёным был не тот цвет, что
// видит человек. Оставшиеся расхождения системны и в этой зоне не решаются:
//
// 1. У чернил набора фиксированная лестница (38 / 42 / 45 / 50 / 55 %), а
//    канвас просит промежуточные 40 и 42 там, где ближайшая роль даёт 38 или
//    45. Соседняя зона назвала это вслух ещё раньше — 733-ui-v4-reports.css:
//    «контракт просит 42 %, ближайшая ступень 45 %». Красить литералом нельзя:
//    гейт ролей запрещает, и правильно.
// 2. У канваса два красных — --red (#b4442a) и --val-bad (#a8382b), — а в
//    наборе красный текстовой один. Пока второй роли нет, всё «плохое»
//    рисуется одним.
//
// Список закрытый: новая строка означает новое расхождение, а не продолжение
// этих двух. В снимке те же места стоят «≠» с той же причиной.
const COLOUR_LADDER = new Set([
  '.widget-calories__hero-bar|background',
  '.widget-calories__hero-bar-cap|color',
  '.widget-v4-deficit-rows__row|color',
  '.widget-v4-insulin-wave__overlap-note|color',
  '.widget-v4-macro-bar-row__fill--bad|background',
  '.widget-v4-macro__fact--bad|color',
  '.widget-v4-macro__fact-sep|color',
  '.widget-v4-macro__fact-tgt|color',
  '.widget-v4-row__meta|color',
  '.widget-v4-sleep-debt__bar--short|background',
  '.widget-v4-sleep-window__labels|color',
  '.widgets-quick-sheet__meta|color',
]);

// Отсев ровно этих пар: строка гейта остаётся о том, что обязано совпасть.
function sift(drift) {
  return drift.filter((line) => {
    const m = /^(\S+) \{ ([a-z-]+) \}/.exec(line);
    if (!m) return true;
    const prop = m[2] === 'background' ? 'background' : m[2];
    return !COLOUR_LADDER.has(`${m[1]}|${prop}`);
  });
}

const EXCEPTIONS = new Map([

  // Кадр рисует круг 30×30 без зоны нажатия. Палец меньше 44 px не ловит,
  // поэтому круг остался 30 px, а зона растянута псевдоэлементом ::before.
  ['.widget-bd-sheet__close|hit-area', 'зона нажатия 44 px псевдоэлементом'],
  // Кадр «Разбор · Готовность ко сну» рисует четвёртым фактором экранное
  // время. Владелец 30 августа решил его не заводить: это самоотчёт, а
  // чек-ин мы сознательно укорачивали. Четвёртым идёт вода.
  ['factorRows|экран', 'экранное время не заводим, решение владельца 30.08'],
  // Тот же кадр даёт «обработанное» третьей частью столбика качества еды.
  // Признак продукта в базе не размечен — столбик из двух частей.
  ['stackedDays|обработанное', 'третья часть ждёт разметки базы'],
  // Инвариант product-модалок (CLAUDE.md): dim подложки берётся из токена
  // --v4-modal-backdrop-dim (0.45), кадры шторки рисуют 0.42.
  ['.widget-wd-sheet__scrim|background', 'dim из токена набора, инвариант старше кадра'],
  // Лист стоит на нижнем крае экрана: без env(safe-area-inset-bottom) его низ
  // уезжает под домашний индикатор. Кадр рисует телефон без выреза.
  ['.widget-wd-sheet|padding', 'нижнее поле держит safe-area, кадр её не рисует']
]);

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 415;

describe('каркас листа разбора против разбора кадров канваса', () => {
  const source = fs.readFileSync(CANVAS, 'utf8');
  const razbor = readRazbor(source);
  const css = fs.readFileSync(CSS, 'utf8');
  const rules = readRules(css);

  // Кадры, годные для сверки геометрии: только data-demo="stop".
  const stopFrames = new Set();
  {
    const re = /data-demo="(stop|loop|protocol)"[^>]*data-screen-label="([^"]+)"|data-screen-label="([^"]+)"[^>]*data-demo="(stop|loop|protocol)"/g;
    let m;
    while ((m = re.exec(source))) if ((m[1] || m[4]) === 'stop') stopFrames.add(m[2] || m[3]);
  }

  it('раздел «Разбор кадров» в канвасе есть и покрывает восемнадцать листов', () => {
    expect(source).toContain('Разбор кадров · элемент за элементом');
    const sheets = new Set(
      [...razbor.keys()]
        .map((k) => k.split('|')[0])
        .filter((label) => label.startsWith('Разбор · '))
    );
    expect(sheets.size).toBe(18);
  });

  it('каркас листа совпадает с кадром «Разбор · Калории»', () => {
    expect(sift(compare({ razbor, rules, frame: 'Разбор · Калории', pairs: SHELL }))).toEqual([]);
  });

  it('новые виды графика совпадают со своими кадрами', () => {
    const drift = [];
    for (const [frame, index, sel, props] of CHARTS) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[index, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  // Кадр Главной — плитка за плиткой. Он же подложка восемнадцати листов
  // разбора, поэтому его закрытие закрывает 1 044 строки снимка следом.
  it('кадр «Главная · дефолтная раскладка» совпадает с плитками', () => {
    expect(sift(compare({
      razbor, rules, frame: 'Главная · дефолтная раскладка', pairs: MAIN
    }))).toEqual([]);
  });

  it('подложка листов разбора — тот же экран, что и кадр Главной', () => {
    // Строки 02…72 каждого листа повторяют строки 01…71 кадра Главной: под
    // шторкой стоит он же. Совпадение проверяется, чтобы закрытие кадра
    // Главной честно закрывало и подложку.
    const main = [];
    for (let i = 1; i <= 87; i += 1) {
      const v = razbor.get(`Главная · дефолтная раскладка|${i}`);
      if (v != null) main.push(v);
    }
    const frames = [...new Set([...razbor.keys()]
      .map((k) => k.split('|')[0])
      .filter((f) => f.startsWith('Разбор · ')))];
    let same = 0;
    for (const frame of frames) {
      for (let i = 2; i <= 72; i += 1) {
        if (razbor.get(`${frame}|${i}`) === main[i - 2]) same += 1;
      }
    }
    expect(same).toBeGreaterThanOrEqual(1000);
  });

  it('повторяющиеся формы совпадают в каждом кадре, где встречаются', () => {
    const pairs = shapePairs(razbor, stopFrames);
    expect(pairs.length).toBeGreaterThan(30);
    const drift = [];
    for (const [frame, anchor, offset, sel, props] of pairs) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[anchor, offset, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  it('хвост листа разбора одинаков во всех восемнадцати листах', () => {
    const pairs = sheetTailPairs(razbor);
    expect(new Set(pairs.map((p) => p[0])).size).toBe(18);
    const drift = [];
    for (const [frame, anchor, offset, sel, props] of pairs) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[anchor, offset, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  it('состояния смены вида совпадают со своими кадрами', () => {
    const drift = [];
    for (const [frame, anchor, offset, sel, props] of VIEW_STATES) {
      if (!props.length) {
        // Правило есть — числа его сверяет соседняя таблица; здесь важно, что
        // состояние вообще заведено и кадру есть что показать.
        expect(rules.has(Array.isArray(sel) ? sel[0] : sel), sel).toBe(true);
        continue;
      }
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[anchor, offset, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  it('четыре вида плитки БЖУ совпадают со своим кадром', () => {
    const drift = [];
    for (const [frame, anchor, offset, sel, props] of MACROS) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[anchor, offset, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  it('виды волны и сна совпадают со своими кадрами', () => {
    const drift = [];
    for (const [frame, anchor, offset, sel, props] of WAVE_SLEEP) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[anchor, offset, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  it('карточка быстрых действий совпадает со своими кадрами', () => {
    const drift = [];
    for (const [frame, anchor, offset, sel, props] of QUICK) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[anchor, offset, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  it('шестнадцать кадров листа смены вида совпадают с продуктом', () => {
    const pairs = shutterPairs(razbor);
    // Десять кадров: каркас, подпись, галочка и размер превью в каждом.
    expect(new Set(pairs.map((p) => p[0])).size).toBe(16);
    const drift = [];
    for (const [frame, index, sel, props] of pairs) {
      drift.push(...sift(compare({ razbor, rules, frame, pairs: [[index, sel, props]] })));
    }
    expect(drift).toEqual([]);
  });

  // Дефект, который нашло превью 30 августа: столбик недели рисовался
  // вложенным <i> с высотой в процентах внутри флекс-элемента, у которого
  // своей высоты нет, — проценты считать было не от чего, и все столбики
  // схлопывались в линию. Кадр рисует столбик одним элементом.
  it('высота столбика недели живёт на самом столбике, не на вложенном', () => {
    const variants = fs.readFileSync(
      path.resolve(__dirname, '../heys_widgets_variants_v4.js'), 'utf8'
    );
    expect(rules.has('.widget-bd-sheet__bar > i')).toBe(false);
    expect(rules.get('.widget-bd-sheet__bar')['border-radius']).toBe('6px 6px 3px 3px');
    expect(variants).not.toMatch(/widget-bd-sheet__bar'[\s\S]{0,200}createElement\('i'/);
  });

  // Кадр data-demo="protocol" — отвергнутый вариант, "loop" — петля, которая
  // живёт только на канвасе. Строка «демо» запрещает их реализовывать, и это
  // проверяется машиной: иначе следующий проход сведёт код с отказом дизайнера.
  it('ни одна таблица пар не сводит код с отвергнутым кадром', () => {
    const kind = new Map();
    const re = /data-demo="(stop|loop|protocol)"[^>]*data-screen-label="([^"]+)"|data-screen-label="([^"]+)"[^>]*data-demo="(stop|loop|protocol)"/g;
    let m;
    while ((m = re.exec(source))) kind.set(m[2] || m[3], m[1] || m[4]);
    const used = new Set([
      ...CHARTS.map((p) => p[0]),
      ...QUICK.map((p) => p[0]),
      ...MACROS.map((p) => p[0]),
      ...WAVE_SLEEP.map((p) => p[0]),
      ...shutterPairs(razbor).map((p) => p[0]),
      'Разбор · Калории',
      'Главная · дефолтная раскладка'
    ]);
    const rejected = [...used].filter((frame) => kind.get(frame) !== 'stop');
    expect(rejected).toEqual([]);
  });

  // Дефект, который нашёл стенд 31 августа: тон нахлёста у волны не доезжал до
  // числа. Одноклассовые .widget-v4-val--* объявлены выше по файлу, чем цвет
  // самих чисел, и при равном весе проигрывают ему — тон молча исчезает.
  // Правило: у героя и мини-числа парное правило есть на каждый тон набора.
  it('тон значения не теряется на весе селектора', () => {
    const tones = [...new Set(
      [...css.matchAll(/^\.widget-v4-val--([a-z]+)\s*\{/gm)].map((m) => m[1])
    )];
    expect(tones.length).toBeGreaterThan(4);
    const missing = [];
    for (const base of ['widget-v4-hero-num__val', 'widget-v4-mini__value']) {
      for (const tone of tones) {
        if (rules.has(`.${base}.widget-v4-val--${tone}`)) continue;
        missing.push(`.${base}.widget-v4-val--${tone}`);
      }
    }
    expect(missing).toEqual([]);
  });

  // Тот же дефект, вид сбоку: когда пара «свой класс + тон» написана в разметке
  // строкой, её видно статически. Если у базового класса есть свой color, а
  // парного правила на этот тон нет, тон исчезает молча — так пропал шалфей у
  // «+210 актив». Проверяются только пары, написанные в коде дословно.
  it('дословные пары «класс + тон» имеют парное правило', () => {
    const ui = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_ui_v1.js'), 'utf8');
    const pairs = new Set();
    for (const m of ui.matchAll(/'([^']*widget-v4-val--[a-z]+[^']*)'/g)) {
      const classes = m[1].trim().split(/\s+/);
      const tone = classes.find((c) => c.startsWith('widget-v4-val--'));
      if (!tone) continue;
      for (const base of classes) {
        if (base === tone || !base.startsWith('widget-')) continue;
        pairs.add(`${base}|${tone}`);
      }
    }
    expect(pairs.size).toBeGreaterThan(0);
    const missing = [];
    for (const pair of pairs) {
      const [base, tone] = pair.split('|');
      const own = rules.get(`.${base}`);
      if (!own || !own.color) continue;
      if (rules.has(`.${base}.${tone}`)) continue;
      missing.push(`.${base}.${tone}`);
    }
    expect(missing).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(5);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[лист БЖУ] сверено ${covered} из ${total} строк разбора `
      + `(${((covered / total) * 100).toFixed(1)} %), кадров ${perFrame.length}, `
      + `не тронуто целиком ${untouched}, вне пар ${missed}; `
      + `больше всего пропущено: ${worst.join(' · ') || 'нет'}`,
    );
    // Разбор долга «вердикт ссылается на гейт, который его строк не читает»:
    // по HEYS_RAZBOR_DUMP гейт выкладывает поимённо, какие строки он трогает.
    // Без него это знает только он сам, и сверить вердикты не с чем.
    if (process.env.HEYS_RAZBOR_DUMP) {
      const touched = [];
      for (const item of perFrame) {
        const all = [...razbor.keys()]
          .filter((key) => key.startsWith(`${item.frame}|`))
          .map((key) => key.slice(item.frame.length + 1));
        for (const index of all) {
          if (!item.missed.includes(index)) touched.push(`${item.frame} · ${index}`);
        }
      }
      fs.writeFileSync(process.env.HEYS_RAZBOR_DUMP, touched.join(String.fromCharCode(10)), 'utf8');
    }
    expect(covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (covered > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${covered} строк вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});
