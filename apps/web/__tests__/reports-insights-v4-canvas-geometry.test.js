// Тест сверки зоны «Отчёты и Инсайты» с канвасом reports-insights.v4.dc.html.
// Эталон метода — nutrition-v4-canvas-geometry.test.js: таблица пар
// «класс кадра → правило продуктового CSS», нормализация форм записи и
// поимённый список отступлений. Тест читает сам канвас, поэтому расхождение
// всплывает при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const canvasPath = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html'
);
const canvas = fs.readFileSync(canvasPath, 'utf8').replace(/\r\n/g, '\n');
const insightsCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/734-ui-v4-insights.css'), 'utf8');
const reportsCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-reports.css'), 'utf8');

// Правило класса из <style> канваса.
function canvasRule(className) {
  const m = canvas.match(new RegExp('\\n\\s*\\.' + className + '\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

// Значение свойства из продуктового CSS-блока по имени класса.
function cssBlock(css, selector) {
  const m = css.match(new RegExp('\\.' + selector + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

function prop(block, name) {
  if (!block) return null;
  const m = block.match(new RegExp('(?:^|;|\\n)\\s*' + name + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}

// Нормализация форм записи: «.16em» ↔ «0.16em» (и после «:», и после пробела).
const norm = (v) => (v == null ? null : String(v).replace(/(^|[\s:(])\.(\d)/g, '$10.$2').trim());

// Покадровый разбор: пары «элемент кадра → правило продукта». Ключи раздела
// «Разбор кадров» — «<метка кадра> · NN», то есть привязка идёт по
// data-screen-label, а не по классам: канвас этой зоны почти весь инлайновый, и
// сверка по классам его элементы не находит.
//
// Отступления здесь не молчат: то, что кадр и продукт держат по-разному, в пары
// не идёт и названо ниже в списке RAZBOR_EXCEPTIONS.
const RAZBOR_EXCEPTIONS = new Map([
  // У набора нет тона 42 %; ближайший --v4-ink-3 даёт 45 %.
  ['Визуал v4 · Отчёты · 61|color', 'у набора нет тона 42 %, ближайший --v4-ink-3'],
  // Ноль дельты: кадр просит 35 %, ближайшая роль --v4-ink-4 даёт 38 %.
  ['Визуал v4 · Отчёты · 59|color', 'у набора нет тона 35 %, ближайший --v4-ink-4'],
  // Дорожка полосы: кадр просит чернила 7 %, роль дорожки --v4-track даёт 12 %.
  // Роль выбрана по смыслу («дорожка полосы»), значение — вопрос набора.
  ['Визуал v4 · Отчёты · 50|background', 'роль дорожки --v4-track даёт 12 %, кадр просит 7 %'],
  // Падение показателя: кадр просит --val-bad (#a8382b), у продукта ближайшая
  // роль --v4-bad-text (#b4442a). См. спор «роли цвета» в списке выше.
  ['Визуал v4 · Отчёты · 56|color', 'у продукта нет роли --val-bad, ближайшая --v4-bad-text'],
  // Подписи колонок листа недель и пилюля частичной недели: тонов 35 % и 50 %
  // у набора нет, стоят ближайшие --v4-ink-4 (38 %) и --v4-ink-2 (55 %).
  ['Визуал v4 · Отчёты · 79|color', 'у набора нет тона 35 %, ближайший --v4-ink-4'],
  ['Визуал v4 · Отчёты · 80|color', 'то же'],
  ['Визуал v4 · Отчёты · 81|color', 'то же'],
  ['Визуал v4 · Отчёты · 82|color', 'то же'],
  ['Визуал v4 · Отчёты · 89|color', 'у набора нет тона 50 %, ближайший --v4-ink-2'],
  // Прочерки в незакрытых колонках и средняя доля нулевой строки просят 32 %;
  // ближайшая ступень набора --v4-ink-30 даёт 30 %.
  ['Неделя к неделе · одна закрытая · 18|color', 'у набора нет тона 32 %, ближайший --v4-ink-30'],
  ['Неделя к неделе · одна закрытая · 23|color', 'то же'],
  ['Неделя к неделе · одна закрытая · 24|color', 'то же'],
  // Штриховка нулевой строки: контракт «вид · нулевая строка» задаёт шаг 4 px,
  // кадр рисует 4 через 4 (период 8). Взят контракт.
  ['Отчёты · нулевая строка матрицы · 16|background', 'контракт «вид · нулевая строка»: шаг 4 px'],
  ['Отчёты · нулевая строка матрицы · 21|background', 'та же строка'],
  // Кадр «Отчёты · мало данных» отстал от контракта: рисует границы окна
  // 500 11px тоном 38 %, а строка «вид · шапка и период» просит 600 10,5
  // тоном 42 %. Контракт старше кадра.
  ['Отчёты · мало данных · 04|*', 'кадр отстал: контракт «вид · шапка и период» просит 600 10,5'],
  ['Мало калорий · подтверждение · 16|color', 'у набора нет ступени 58 %, ближайшая --v4-ink-2'],
  // Один класс подписи под графиком служит двум размерам: кадр главного экрана
  // даёт ей 11 px, кадры блока веса — 10,5. Держим 11: в продукте это одна
  // строка под графиком, а не две разные.
  ['Отчёты · нет веса · 16|fontSize', 'одна подпись под графиком, кадры дают ей 11 и 10,5'],
  // Три места, где верна строка контракта, а не кадр:
  // · 68 — «формат · вес и его подпись» держит значение 21 px/800, кадр даёт 12,5/700;
  // · 104 — «карточка · призыв о замерах» держит факт 12 px/1,55, кадр даёт 11/1,4;
  // · 105 — та же строка прямо говорит «кнопка не --acs: это напоминание, а не
  //   главное действие вкладки», кадр красит её заливкой акцента.
  ['Визуал v4 · Отчёты · 68|*', 'строка «формат · вес и его подпись»: 21 px/800'],
  ['Визуал v4 · Отчёты · 104|*', 'строка «карточка · призыв о замерах»: факт 12/1,55'],
  ['Визуал v4 · Отчёты · 105|*', 'та же строка: кнопка не на акценте, это напоминание'],
]);

const MATRIX = [
  [46, '.reports-v4-tier__note', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [48, '.reports-v4-discipline__row', ['align', 'gap', 'marginTop']],
  [49, '.reports-v4-discipline__name',
    ['flex', 'width', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [50, '.reports-v4-discipline__bar', ['flex', 'height', 'radius']],
  [51, '.reports-v4-discipline__bar-fill', ['background']],
  [52, '.reports-v4-discipline__score',
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [53, ['.reports-v4-discipline__delta', '.reports-v4-discipline__delta.is-up'],
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [59, '.reports-v4-discipline__delta',
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
  [61, '.reports-v4-discipline__footnote', ['fontWeight', 'fontSize', 'lineHeight']],
];

// Лист «Неделя к неделе»: шапка колонок и строки недель.
const WEEKS = [
  [78, '.reports-v4-weeks__head', ['align', 'gap', 'padding']],
  [79, ['.reports-v4-weeks__head', '.reports-v4-weeks__head-date'],
    ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform']],
  [80, ['.reports-v4-weeks__head', '.reports-v4-weeks__head-kcal'],
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'transform']],
  [81, ['.reports-v4-weeks__head', '.reports-v4-weeks__head-weight'],
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'transform']],
  [82, ['.reports-v4-weeks__head', '.reports-v4-weeks__head-score'],
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'transform']],
  [83, '.reports-v4-weeks__row', ['align', 'gap', 'padding']],
  [84, '.reports-v4-weeks__date', ['flex', 'align', 'gap']],
  [86, '.reports-v4-weeks__kcal',
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [87, '.reports-v4-weeks__weight', ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
  [88, '.reports-v4-weeks__score',
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [89, '.reports-v4-weeks__partial',
    ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'padding', 'radius', 'background']],
];

// Блок «Динамика», карточка самочувствия и призыв о замерах.
const DYNAMICS = [
  [62, '.reports-v4-dynamics-card__head', ['justify', 'align']],
  [66, '.reports-v4-dynamics-card__hint', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [67, '.reports-v4-wellbeing', ['marginTop']],
  [69, '.reports-v4-dynamics-card__delta', ['color']],
  [71, '.reports-v4-wellbeing__title', ['marginBottom']],
  [102, '.reports-v4-measure', ['marginTop']],
];

// Лента дней: строка и три состояния точки зоны.
const DAYS = [
  [95, '.reports-v4-days__left', ['align', 'gap', 'color']],
  [96, ['.reports-v4-days__dot', '.reports-v4-days__dot--over'],
    ['width', 'height', 'radius', 'background']],
  [98, ['.reports-v4-days__dot', '.reports-v4-days__dot--good'],
    ['width', 'height', 'radius', 'background']],
  [99, ['.reports-v4-days__dot', '.reports-v4-days__dot--warn'],
    ['width', 'height', 'radius', 'background']],
];

// Нулевая строка матрицы: полоса в рамке со штриховкой вместо заливки и
// средняя доля на месте дельты.
const ZERO_ROW = [
  [13, '.reports-v4-discipline__score',
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [14, ['.reports-v4-discipline__delta', '.reports-v4-discipline__delta.is-up'],
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [15, ['.reports-v4-discipline__bar', '.reports-v4-discipline__bar.is-zero'],
    ['flex', 'height', 'radius']],
  [17, ['.reports-v4-discipline__score', '.reports-v4-discipline__score.is-zero'],
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [19, '.reports-v4-discipline__avg', ['fontWeight', 'fontSize', 'lineHeight']],
  [26, '.reports-v4-discipline__delta',
    ['flex', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
  [28, '.reports-v4-discipline__footnote', ['fontWeight', 'fontSize', 'lineHeight']],
];

// Одна закрытая неделя: прочерки вместо чисел в незакрытых колонках.
const WEEK_ONE = [
  [9, '.reports-v4-weeks__head', ['align', 'gap', 'padding']],
  [14, '.reports-v4-weeks__row', ['align', 'gap', 'padding']],
  [15, '.reports-v4-weeks__date', ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [16, '.reports-v4-weeks__kcal',
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [18, ['.reports-v4-weeks__score', '.reports-v4-weeks__score.is-empty'],
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
  [20, '.reports-v4-weeks__date', ['flex', 'align', 'gap']],
  [22, '.reports-v4-weeks__partial',
    ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'padding', 'radius', 'background']],
  [23, ['.reports-v4-weeks__kcal', '.reports-v4-weeks__kcal.is-empty'],
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
  [24, ['.reports-v4-weeks__weight', '.reports-v4-weeks__weight.is-empty'],
    ['flex', 'width', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
];

// Карточка подтверждения чисел дня живёт в 100-metrics-and-graphs.css.
const REALDATA_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/100-metrics-and-graphs.css'), 'utf8');

const REALDATA_CONFIRM = [
  [10, '.kcal-realdata-card__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [11, '.kcal-realdata-card__text', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [12, '.kcal-realdata-card__actions', ['align', 'gap']],
  [13, '.kcal-realdata-card__badge',
    ['flex', 'align', 'height', 'padding', 'radius', 'background',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [15, '.kcal-realdata-card__button',
    ['align', 'justify', 'minHeight', 'radius', 'background',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [16, ['.kcal-realdata-card__button', '.kcal-realdata-card__button--secondary'],
    ['align', 'justify', 'minHeight', 'radius', 'background',
      'fontWeight', 'fontSize', 'lineHeight']],
  [17, '.kcal-realdata-card__recommendation',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

const REALDATA = [
  [6, '.kcal-realdata-card__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [7, '.kcal-realdata-card__text', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [8, '.kcal-realdata-card__actions', ['align', 'gap']],
  [9, '.kcal-realdata-card__badge',
    ['flex', 'align', 'height', 'padding', 'radius', 'background',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Пары «Инсайтов» переехали в `insights-v4-canvas-razbor.test.js`: над зоной
// работают две сессии, и общий файл гейта был вторым по частоте местом, где
// правка одной уезжала в коммит другой. Здесь остаётся отчётная половина плюс
// реестр отступлений и канон — они смотрят обе вкладки сразу.


// Кадр «Разбор Score». Сведено только то, о чём строка контракта «вид · экран
// разбора Score» молчит: кегли числа, дельты и фразы она задаёт сама и спорит
// с кадром (30/800 против 56/600), а раскладка строки каскада — открытый
// вопрос дизайнеру (см. UI_V4_FINDINGS.md).
const SCORE = [
  [2, '.heys-score-screen__head', ['align', 'gap']],
  [3, '.heys-score-screen__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, '.heys-score-screen__hero', ['background', 'radius', 'padding', 'marginTop']],
  [7, '.heys-score-screen__number-row', ['align', 'gap', 'marginTop']],
  [13, '.heys-score-screen__note', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [25, '.heys-score-screen__footnote', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
];

// Кадры состояний: нет веса и нулевая строка матрицы.
const STATES = [
  ['Отчёты · нет веса', [
    [15, '.reports-v4-noplot__cta',
      ['minHeight', 'radius', 'background', 'fontWeight', 'fontSize',
        'lineHeight', 'color', 'marginTop']],
    [16, '.reports-v4-dynamics-card__hint', ['fontWeight', 'lineHeight', 'marginTop']],
    [11, '.reports-v4-dynamics-card__head', ['justify', 'align', 'gap']],
    [12, '.reports-v4-dynamics-card__period', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [13, '.reports-v4-noplot', ['height', 'radius', 'align', 'justify', 'marginTop']],
    [14, '.reports-v4-noplot', ['fontWeight', 'fontSize', 'lineHeight']],
  ]],
  ['Отчёты · нулевая строка матрицы', [
    [7, '.reports-v4-tier__note', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
    [9, '.reports-v4-discipline__row', ['align', 'gap', 'marginTop']],
    [10, '.reports-v4-discipline__name',
      ['flex', 'width', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
    [11, '.reports-v4-discipline__bar', ['flex', 'height', 'radius']],
    [12, '.reports-v4-discipline__bar-fill', ['background']],
  ]],
];

// Кадр «Отчёты · мало данных»: заглушка до порога в семь дней.
const STUB = [
  [6, '.reports-v4-stub', ['background', 'radius', 'padding', 'marginTop']],
  [8, '.reports-v4-stub__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [9, '.reports-v4-stub__note', ['fontWeight', 'fontSize', 'lineHeight']],
  [10, '.reports-v4-stub__track', ['align', 'gap', 'marginTop']],
  [11, ['.reports-v4-stub__progress', '.reports-v4-stub__track .reports-v4-stub__progress'],
    ['flex', 'height', 'radius']],
  [12, '.reports-v4-stub__progress-fill', ['radius', 'background']],
  [13, '.reports-v4-stub__count', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

const HEADER = [
  [12, '.reports-v4-meta', ['marginTop']],
  [14, '.reports-v4-meta__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [15, '.reports-v4-meta__range', ['align', 'gap']],
  [20, '.reports-v4-hero', ['background', 'radius', 'padding', 'marginTop']],
  [22, '.reports-v4-hero__value-row', ['align', 'gap', 'marginTop']],
  [25, '.reports-v4-hero__phrase',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [26, '.reports-v4-hero__footer', ['justify', 'align', 'marginTop']],
];

describe('Отчёты · разбор кадров канваса', () => {
  const razbor = readRazbor(canvas);
  const rules = readRules(reportsCss);

  it('шапка и герой кадра «Визуал v4 · Отчёты» совпадают с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Визуал v4 · Отчёты', pairs: HEADER,
    })).toEqual([]);
  });

  // Карточка баланса стоит на ВТОРОЙ поверхности — так говорят и строка
  // контракта «вид · баланс за неделю», и кадр (элемент 20). Дважды подряд это
  // ломалось незаметно для парной сверки: сперва палитровое правило сводило
  // герою фон к первой поверхности во всех наборах, потом — роль с именем
  // набора держала песочный тон на синей вкладке. Ни то, ни другое сверка
  // «кадр → правило» не видит: она читает правило элемента, а не итог каскада.
  it('герой стоит на второй поверхности и следует за набором', () => {
    expect(rules.get('.reports-v4-hero').background).toBe('var(--v4-hero, #efe3cf)');
    const group = reportsCss.slice(
      reportsCss.indexOf('[data-palette="sand"] .reports-v4-dynamics-card'),
      reportsCss.indexOf('background: var(--v4-surface)'));
    expect(group).not.toContain('reports-v4-hero');
  });

  it('нулевая строка матрицы совпадает с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Отчёты · нулевая строка матрицы', pairs: ZERO_ROW,
    })).toEqual([]);
  });

  it('лист недель с одной закрытой совпадает с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Неделя к неделе · одна закрытая', pairs: WEEK_ONE,
    })).toEqual([]);
  });

  it('кнопки карточки подтверждения — пилюли 48 по строке зоны', () => {
    expect(compare({
      razbor,
      rules: readRules(REALDATA_CSS),
      frame: 'Мало калорий · подтверждение',
      pairs: REALDATA_CONFIRM,
    })).toEqual([]);
  });

  it('карточка подтверждения чисел дня совпадает с кадром', () => {
    expect(compare({
      razbor,
      rules: readRules(REALDATA_CSS),
      frame: 'Мало калорий · рекомендуем очистить',
      pairs: REALDATA,
    })).toEqual([]);
  });

  it('экран разбора Score совпадает там, где контракт молчит', () => {
    expect(compare({ razbor, rules, frame: 'Разбор Score', pairs: SCORE })).toEqual([]);
  });

  it('кадры состояний совпадают с продуктом', () => {
    for (const [frame, pairs] of STATES) {
      expect(compare({ razbor, rules, frame, pairs })).toEqual([]);
    }
  });

  // Реестр мёртвых правил зоны. Их девять: правило в CSS есть, а класс не
  // рендерит ни один исходник. Опасны они не тем, что лишние, а тем, что
  // выглядят реализацией: сверяя кадр с таким правилом, получаешь зелёный
  // результат про элемент, которого на экране нет. Я на этом уже попался —
  // поставил вердикт «сведено» элементу 63 против .reports-v4-dynamics-card__badge.
  //
  // Проверка держит список честным в обе стороны: начнут рендерить — упадёт и
  // потребует убрать из списка; добавят новое мёртвое правило — оно сюда не
  // попадёт молча, потому что список перечислен поимённо.
  //
  // Правила снятых блоков (средние числа самочувствия, действия нулевой строки
  // матрицы) удалены вместе со списком; здесь остаётся только то, что ждёт
  // решения дизайнера.
  it('мёртвые правила зоны названы поимённо и остаются мёртвыми', () => {
    const DEAD = [
      // Число справа в шапке графика: контракт его требует, продукт не выводит.
      // Правило держим до ответа дизайнера (docs/ui/UI_V4_FINDINGS.md, запись
      // про число в шапках графиков): сделают элемент — правило пригодится.
      'reports-v4-dynamics-card__badge',
    ];
    const src = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    for (const cls of DEAD) {
      expect(reportsCss, cls + ': правило пропало из CSS').toContain('.' + cls);
      expect(src, cls + ': класс начали рендерить — уберите его из списка')
        .not.toContain(cls);
    }
  });

  it('заглушка «мало данных» совпадает с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Отчёты · мало данных', pairs: STUB,
    })).toEqual([]);
  });

  it('лента дней и три состояния точки совпадают с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Визуал v4 · Отчёты', pairs: DAYS,
    })).toEqual([]);
  });

  it('блок «Динамика» и призыв о замерах совпадают с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Визуал v4 · Отчёты', pairs: DYNAMICS,
    })).toEqual([]);
  });

  it('лист «Неделя к неделе» совпадает с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Визуал v4 · Отчёты', pairs: WEEKS,
    })).toEqual([]);
  });

  it('матрица Дисциплины совпадает с продуктом построчно', () => {
    expect(compare({
      razbor, rules, frame: 'Визуал v4 · Отчёты', pairs: MATRIX,
    })).toEqual([]);
  });

  it('отступления разбора названы и не разрастаются молча', () => {
    expect(RAZBOR_EXCEPTIONS.size).toBe(20);
  });
});

describe('Отчёты и Инсайты v4 — сверка с канвасом', () => {
  it('канвас на месте и держит контракт зоны', () => {
    expect(canvas).toContain('data-contract');
    // Пакет 2026-08-29 (вторая пересборка): 59 строк — +демо-режим и пять
    // строк яруса «Неделя к неделе».
    expect(canvas.match(/data-v="/g).length).toBeGreaterThanOrEqual(59);
  });

  it('ярус «Неделя к неделе»: место, состав, неполные дни, вид', () => {
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    // место: между «Динамикой» и «Днями»
    expect(stats).toContain('function ReportsV4Weeks');
    const bottom = stats.slice(
      stats.indexOf('function ReportsTabV4Bottom'),
      stats.indexOf('function ReportsTabV4('),
    );
    expect(bottom.indexOf('ReportsV4Weeks(')).toBeLessThan(bottom.indexOf("'Дни'"));
    // состав и «не предсказывает»
    expect(stats).toContain('закрытые недели · только измеренное');
    expect(stats).toContain('function buildWeeklyRows');
    // Подпись под таблицей — из кадра: объясняет прочерк Score и счёт дней.
    expect(stats).toContain('Score считается по 30-дневной серии');
    // неполные дни — общим счётчиком зоны
    expect(stats).toContain('HEYS.DisciplineMatrix.hasAnyData');
    expect(stats).toContain("row.filledDays + ' из 7'");
    // вид: колонки 56 / 40 / 26, пилюля, разделители
    const kcal = cssBlock(reportsCss, 'reports-v4-weeks__head-kcal,\\s*\\n\\.reports-v4-weeks__kcal');
    expect(prop(kcal, 'width')).toBe('56px');
    const weight = cssBlock(reportsCss, 'reports-v4-weeks__head-weight,\\s*\\n\\.reports-v4-weeks__weight');
    expect(prop(weight, 'width')).toBe('40px');
    const score = cssBlock(reportsCss, 'reports-v4-weeks__head-score,\\s*\\n\\.reports-v4-weeks__score');
    expect(prop(score, 'width')).toBe('26px');
    const wrap = cssBlock(reportsCss, 'reports-v4-weeks');
    expect(prop(wrap, 'border-radius')).toBe('20px');
    expect(prop(wrap, 'padding')).toContain('2px 16px');
    const partial = cssBlock(reportsCss, 'reports-v4-weeks__partial');
    expect(prop(partial, 'padding')).toBe('3px 6px');
    expect(prop(partial, 'font')).toContain('9px');
  });

  it('ярус .tier: 10px/700, разрядка .16em — в обеих вкладках', () => {
    const tier = canvasRule('tier');
    expect(tier).toContain('font:700 10px');
    expect(norm(tier)).toContain('letter-spacing:0.16em');
    for (const [css, sel] of [[insightsCss, 'insights-v4-tier'], [reportsCss, 'reports-v4-tier']]) {
      const block = cssBlock(css, sel);
      expect(prop(block, 'font-size')).toBe('10px');
      expect(prop(block, 'font-weight')).toBe('700');
      expect(norm(prop(block, 'letter-spacing'))).toBe('0.16em');
      expect(prop(block, 'text-transform')).toBe('uppercase');
    }
  });

  it('карточка .grp: радиус 20, поля 16 — карточки яруса «Питание»', () => {
    const grp = canvasRule('grp');
    expect(grp).toContain('border-radius:20px');
    expect(grp).toContain('padding:16px');
    const card = cssBlock(insightsCss, 'insights-v4-nutrition__card');
    expect(prop(card, 'border-radius')).toBe('20px');
    expect(prop(card, 'padding')).toBe('16px');
  });

  it('список .cd: радиус 20, поля 2/16 — списки заглушки', () => {
    const cd = canvasRule('cd');
    expect(cd).toContain('padding:2px 16px');
    for (const sel of ['insights-v4-stub__fill', 'insights-v4-stub__ladder']) {
      const block = cssBlock(insightsCss, sel);
      expect(prop(block, 'border-radius')).toBe('20px');
      expect(prop(block, 'padding')).toContain('2px 16px');
    }
  });

  it('строка .row: 12.5px, поля 13/0, линия чернил 7%', () => {
    const row = canvasRule('row');
    expect(row).toContain('padding:13px 0');
    expect(row).toContain('12.5px');
    const fill = cssBlock(insightsCss, 'insights-v4-stub__fill-row');
    expect(prop(fill, 'padding')).toBe('13px 0');
    expect(prop(fill, 'font')).toContain('12.5px');
    const patterns = cssBlock(insightsCss, 'insights-v4-patterns__row');
    expect(prop(patterns, 'padding')).toBe('13px 0');
  });

  it('шапка карточки .mvH: 10.5px/600, чернила 55%, без капса', () => {
    const mvH = canvas.match(/\.mvH b\{([^}]*)\}/);
    expect(mvH && mvH[1]).toContain('10.5px');
    const head = cssBlock(insightsCss, 'insights-v4-nutrition__head');
    expect(prop(head, 'font')).toContain('10.5px');
    expect(prop(head, 'text-transform')).toBe(null);
    expect(prop(head, 'color')).toContain('0.55');
  });

  it('строка БЖУ .mrow: имя 96, число 58 вправо, полоса 8px', () => {
    const mrowB = canvas.match(/\.mrow b\{([^}]*)\}/);
    expect(mrowB && mrowB[1]).toContain('width:96px');
    const name = cssBlock(insightsCss, 'insights-v4-nutrition__bzhu-name');
    expect(prop(name, 'width')).toBe('96px');
    const kcal = cssBlock(insightsCss, 'insights-v4-nutrition__bzhu-kcal');
    expect(prop(kcal, 'min-width')).toBe('58px');
    const mbar = canvasRule('mbar');
    expect(mbar).toContain('height:8px');
    const bar = cssBlock(insightsCss, 'insights-v4-nutrition__bzhu-bar');
    expect(prop(bar, 'height')).toBe('8px');
  });

  it('чип окна: высота 34, радиус 999 (контракт «вид · окно и бейджи»)', () => {
    const chip = cssBlock(insightsCss, 'insights-v4-window__chip');
    expect(prop(chip, 'min-height')).toBe('34px');
    expect(prop(chip, 'border-radius')).toBe('999px');
  });

  it('бейдж зрелости: 9px/700 моноширинным, поля 4/7, радиус 999', () => {
    const badge = cssBlock(insightsCss, 'insights-v4-maturity');
    expect(prop(badge, 'font')).toContain('9px');
    expect(prop(badge, 'font')).toContain('ui-monospace');
    expect(prop(badge, 'padding')).toBe('4px 7px');
    expect(prop(badge, 'border-radius')).toBe('999px');
  });

  it('матрица дисциплины: имя 11px шириной 88, полоса 8px радиусом 999', () => {
    const name = cssBlock(reportsCss, 'reports-v4-discipline__name');
    expect(prop(name, 'width')).toBe('88px');
    expect(prop(name, 'font')).toContain('11px');
    const bar = cssBlock(reportsCss, 'reports-v4-discipline__bar');
    expect(prop(bar, 'height')).toBe('8px');
    expect(prop(bar, 'border-radius')).toBe('999px');
  });

  // Поимённый список отступлений — канон:
  // docs/implementation/REPORTS_INSIGHTS_V4_IMPLEMENTATION_2026-08-29.md.
  // Снятие любого пункта = правка кода + правка этого списка в одном заходе.
  it('отступления названы и не разрастаются молча', () => {
    // 2026-08-29, четвёртый заход: Δ питания снята (план прошлых дней
    // считается движком через HEYS.dayNorm), «лента дней» снята как
    // ошибочно записанная — спарклайн и так начинает с первого дня с едой
    // и периодом не ограничен (heys_day_sparkline_data_v1.js).
    // Пакет 2026-08-29 (четвёртая пересборка) принёс раздел копии.
    // Отступление одно: пять образцов переписаны, остальные 21 тип ждут
    // переписывания по ним — эмодзи в v4 срезается, но телеграфный тон
    // остаётся. Список обязан совпадать с вердиктами «≠» в снимке как
    // множество; порядок в нём свободный и удобен для чтения.
    // 2026-08-30: «одиннадцать дефектов» закрыто — дизайнер переписал строку
    // под факт. Два яруса, разошедшихся с контрактом, тоже сведены: «Что с
    // этим делать» перестал советовать про норму и зовёт записать замер,
    // «Сон и самочувствие» рисует две кривые вместо трёх средних чисел.
    //
    // Оставшиеся два отступления — про движок, а не про вид: у оси «жиры» нет
    // детектора, у «перебора дня» и «недосыпа» нет адаптивного порога. Оба
    // показаны честно и ждут своей задачи.
    const DEVIATIONS = [
      'состав фенотипа',
      // Отказ расчёта сведён 31 августа целиком: карточка «Разбор не собрался»,
      // две кнопки, ярус «Что осталось доступным». Отступление во второй
      // половине строки — скелетон, и причина уточнена в тот же день: он не
      // «собран классами прежней системы», его не было вовсе. SkeletonCard
      // объявили, экспортировали и ни разу не вызвали, а 110 строк CSS
      // держали вид того, что не рисуется. Снят целиком: знак ожидания у
      // продукта один — спиннер, и он с порогом. Про сам порог расхождения
      // нет: строка просит «без спиннера, расчёт занимает доли секунды», а
      // шкала spinners первой ступенью говорит «до 300 мс не показываем
      // ничего» — это одно и то же. Разошёлся только скелетон.
      'расчёт и отказ',
      // Тот же скелетон, вторая строка контракта, что его просит. Знак
      // ожидания в продукте один — спиннер (spinners.v4.dc.html, «второго
      // вида ожидания нет»), полос на #f4f4f3 у него не бывает. Мёртвый
      // SkeletonCard и 110 строк его CSS сняты 31 августа: компонент был
      // объявлен, экспортирован и ни разу не вызван — скелетона не было и
      // раньше, были только его стили.
      // Остальное в строке сведено: карточки состояний, кнопки 48, ярусы.
      'вид · панель и состояния',
      // Строка перечисляет шесть кеглей и говорит «других кеглей в зоне нет»,
      // но её же соседние строки требуют других: баланс за неделю 44/600,
      // карточки состояний 15–16/700, кнопки 13/700, ярус источников 11,5/600.
      // Названных ею 30/800 и 20–21/800 в зоне нет вовсе. Выполнить строку
      // буквально значит нарушить четыре соседние — взяты соседние.
      'шкала кеглей',
      // Рамка сведена 31 августа, отступление — вторая половина строки: тот
      // же скелетон, третья строка зоны, где его просят.
      'пустое место в блоке',
      // Строка просит полосу доли ПОД строкой высотой 4, собственный кадр
      // рисует её В СТРОКЕ высотой 8 (.mrow — флекс по центру, .mbar 8px), а
      // покадровый разбор высоты не называет вовсе. Реализована разметка:
      // проза расходится с кадром, из которого выведена, — тот же случай, что
      // в кабинете, где разбор называл кнопку «на --c2» при --acs в разметке.
      // Точка зоны: размер 8 из разметки кадра против 7 из прозы строки, и
      // недобор на роли --v4-warn-fill, которой в наборе нет — под её тоном
      // #f0d8c4 роли не заведено, а кадр в этом месте сам ставит литерал.
      'карточка · строка дня в ленте',
      'карточка · БЖУ по приёмам',
      // Ярус источников сведён 31 августа: подпись, порядок по силе, пустая
      // колонка вместо «неизвестно», ссылка у константы движка. Отступление
      // — форма строк: строка контракта описывает голые строки 11,5 px с
      // зазором 6, восемь кадров рисуют карточку со строками 12,5 px через
      // разделитель и колонкой силы справа. Выполнить оба нельзя — в «голых
      // строках» колонке силы, которую требует соседняя строка контракта,
      // некуда встать. Взята форма кадров; UI_V4_FINDINGS.md.
      'вид · ярус «На чём основано»',
      // Счётчик истории: строка просит «18 дней данных» тоном --ac и отдельное
      // «ещё 12», кадр и соседняя строка «счётчик в шапке» дают «18 дней
      // данных из 30» чернилами. Два источника из трёх сходятся.
      // Красный у падающего показателя: строка «роли цвета» запрещает красный
      // для плохого числа («он значит действие, которое не отменить»), а
      // «вид · матрица Дисциплины» той же поставки красит падение --val-bad.
      // Код следует матрице. Спор контракта с контрактом; UI_V4_FINDINGS.md.
      'роли цвета',
      'вид · шапка зрелости',
      // Минус вклада остаётся на чернилах, а не на --val-bad: строка «роли
      // цвета» той же зоны запрещает красный на числах — он занят под
      // необратимое действие. Поймано гейтом канона, который считает
      // обращения к --v4-bad-text и падает на третьем.
      'карточка · каскад разбора Score',
      // Строка описывает Score как первую из трёх равных плиток с числом
      // 30/800 и шевроном; кадр рисует его отдельным блоком .grp на --c2 —
      // подпись слева, «+40 за 2 недели» справа, — и уже под ним пару плиток.
      // Внутренности плитки достались от прежнего вида; сведение блока с
      // кадром названо в протоколе зоны отдельным заходом.
      'карточка · плитка Score',
      // Строка описывает действия строками с разделителями (точка 7, зазор 8,
      // высота 34), кадр — каждое действие отдельной карточкой на --bg
      // радиусом 16 с полями 13/15 и зазором 11, без разделителей вовсе.
      // Два источника несовместимы; переход на карточки — правка разметки
      // PriorityActions, общей с прежним видом.
      'карточка · действие в «Сделай сегодня»',
      // Две строки про лист расходятся с кадрами одинаково и в двух местах:
      // кнопка «Понятно» стоит на --acs (класс .btn канваса и все восемь
      // кадров листов), а не на --c2; ярус «На чём основано» в листе есть —
      // его рисуют те же кадры, и он собран из реестра библиографии, а
      // строки просят «ссылок на исследования нет».
      'вид · лист раскрывашки',
      'карточка · абзац раскрывашки',
      // Контракт просит полосы, пропорциональные длительности приёма;
      // карточка рисует ленту времён с перемычками. Форма выбрана по живым
      // данным: приёмов бывает 6 и 12, пропорциональные отрезки в 330 px
      // нечитаемы, поэтому при больше четырёх показываются края и счётчик
      // скрытых.
      'карточка · Ритм приёмов',
      // Строка запрещает центрирование вообще («текст по левому краю, числа
      // по правому»), но кадр центрирует два места: замыкающую строку ленты
      // «Ещё N» и подпись рамки на месте кривой. Оба — не строки с данными,
      // а закрывающие подписи блока.
      'сетка и грунт',
      // Метки вилок планера: три источника дают три разных вида. Строка
      // контракта — 26 высотой, радиус 8, фон --bg, 11/600. Класс .pchip
      // самого канваса — 34, радиус 999, фон #fffaf1, 11,5/700. Код — 26,
      // радиус 999, 10,5/600, то есть ни то ни другое целиком. Сведение
      // требует решения, какой из трёх верен.
      'карточка · планер «Что съесть сейчас»',
      // Число героя набрано 44/600 по строке «вид · баланс за неделю», а эта
      // строка просит 30/800 — тот же спор кеглей, что у «шкалы кеглей».
      'вид · Баланс за период',
      // Покадровый разбор, матрица Дисциплины. Три места, где кадр просит
      // тон или роль, которых у набора нет; взята ближайшая.
      // · 50 — дорожка полосы: кадр просит чернила 7 %, роль дорожки
      //   --v4-track даёт 12 %. Роль выбрана по смыслу, значение — вопрос
      //   набора, а не экрана.
      // · 56 — падение показателя: кадр просит --val-bad (#a8382b), у
      //   продукта ближайшая роль --v4-bad-text (#b4442a). Здесь же спор
      //   «роли цвета» против «вид · матрица Дисциплины» — см. ниже.
      // · 59 — ноль дельты: кадр просит 35 %, ближайший --v4-ink-4 даёт 38 %.
      'Визуал v4 · Отчёты · 50',
      'Визуал v4 · Отчёты · 56',
      'Визуал v4 · Отчёты · 59',
      // Лист «Неделя к неделе»: подписи колонок просят тон 35 %, пилюля
      // частичной недели — 50 %. Ни того ни другого у набора нет, стоят
      // ближайшие --v4-ink-4 (38 %) и --v4-ink-2 (55 %).
      'Визуал v4 · Отчёты · 79',
      'Визуал v4 · Отчёты · 80',
      'Визуал v4 · Отчёты · 81',
      'Визуал v4 · Отчёты · 82',
      'Визуал v4 · Отчёты · 89',
      // Три места, где верна строка контракта, а не кадр: значение веса
      // (21/800 против 12,5/700), факт призыва о замерах (12/1,55 против
      // 11/1,4) и его кнопка — строка прямо говорит «не --acs», кадр красит
      // её заливкой акцента.
      'Визуал v4 · Отчёты · 68',
      'Визуал v4 · Отчёты · 104',
      'Визуал v4 · Отчёты · 105',
      // Прочерки незакрытых колонок просят тон 32 %, ближайший --v4-ink-30
      // даёт 30 %. Штриховка нулевой строки: контракт задаёт шаг 4 px, кадр
      // рисует 4 через 4.
      'Неделя к неделе · одна закрытая · 18',
      'Неделя к неделе · одна закрытая · 23',
      'Неделя к неделе · одна закрытая · 24',
      'Отчёты · нулевая строка матрицы · 16',
      'Отчёты · нулевая строка матрицы · 21',
      // Кадр отстал от контракта по границам окна: 500 11px против 600 10,5.
      'Отчёты · мало данных · 04',
      // Тон вторичной кнопки карточки подтверждения: кадр и строка «кнопки и
      // области нажатия» просят чернила 58 %, ближайшая ступень набора 55 %.
      'Мало калорий · подтверждение · 16',
      // Подпись под графиком: кадры просят ей два размера, держим один.
      'Отчёты · нет веса · 16',
      // Третья строка зоны, где просят скелетон. Ответ тот же: знак ожидания
      // в продукте один — спиннер, полос на #f4f4f3 у него не бывает.
      'карточка · скелетон расчёта',
      // Три строки про «Что если» описывают одну несобранную форму: чипы
      // категорий с раскрытием по одному и строку «Оценка дня 72 → 75» на
      // месте. В продукте — карточка-вход в модалку, а сценарии со своими
      // числами живут внутри неё. Обязательная оговорка «не HEYS Score»
      // есть, но стоит на ярусе, а не под сценарием.
      'вид · панель «Что если»',
      'карточка · чипы «Что если»',
      'карточка · сценарий «Что если»'
    ];

    const verdicts = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../../docs/ui/verdicts/reports-insights.json'), 'utf8'));
    const notEqual = Object.entries(verdicts.rows)
      .filter(([, row]) => row.v === '≠')
      .map(([key]) => key);
    // Сверяем множества, а не последовательности. Порядок ключей в снимке —
    // деталь хранения: он менялся при расколе снимка по зонам, и сравнение
    // по порядку падало бы от переезда файла, а не от расхождения с макетом.
    // Красный тест, который нечем объяснить содержательно, снимают в первый
    // день — вместе с настоящей пользой.
    //
    // Что проверяется по существу: множества совпадают, то есть ни одно
    // отступление не появилось молча и ни одно не осталось в списке после
    // того, как его свели. Дубли в списке тоже ловятся — их не должно быть.
    expect([...new Set(DEVIATIONS)]).toHaveLength(DEVIATIONS.length);
    expect([...notEqual].sort()).toEqual([...DEVIATIONS].sort());
  });

  it('пакет 3: формы чисел планера, прочерк Score, «плановых», счётчик', () => {
    const card = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_meal_rec_card.js'), 'utf8');
    // белок — вилка ±5 с округлением до 5; углеводы — потолок; ккал — точка
    expect(card).toContain("'белок ' + lo + '–' + hi + ' г'");
    expect(card).toContain("'углеводы до '");
    expect(card).toContain("'≈ ' + round10(v4Kcal) + ' ккал'");
    expect(card).not.toContain('spread(');
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    expect(stats).toContain("' плановых'");
    expect(stats).toContain("reports-v4-weeks__score' + (row.score == null ? ' is-empty'");
    expect(stats).toContain('те, что вы сами отметили «не заполнял»');
    const empty = cssBlock(reportsCss, 'reports-v4-weeks__score\\.is-empty');
    expect(prop(empty, 'color')).toContain('v4-ink-30');
  });

  it('четвёртый заход: план прошлых дней и «N из M» у счётных', () => {
    const matrix = fs.readFileSync(
      path.resolve(__dirname, '../heys_discipline_matrix_v1.js'), 'utf8');
    expect(matrix).toContain('function resolveDayPlan');
    expect(matrix).toContain('HEYS.dayNorm && HEYS.dayNorm.resolve');
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    // План прошлого дня подставляется и в Δ матрицы, и в колонку недель
    expect(stats.match(/resolvePlan\(/g).length).toBeGreaterThanOrEqual(2);
    const timing = fs.readFileSync(
      path.resolve(__dirname, '../insights/patterns/timing.js'), 'utf8');
    expect(timing).toContain('matchedDays: lateDates.size');
  });

  it('третий заход: v4-планер, время в «Ритме», «Как посчитано»', () => {
    const card = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_meal_rec_card.js'), 'utf8');
    expect(card).toContain("variant === 'v4'");
    expect(card).toContain('Что съесть сейчас');
    expect(card).toContain('Как посчитано');
    expect(card).toContain('_lastPlan');
    const dashboard = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_dashboard.js'), 'utf8');
    expect(dashboard).toContain("variant: 'v4'");
    expect(dashboard).toContain('Следующий приём лучше до ');
    // Вид планера по кадру: чип 26px обводкой 1.5px, кнопка 44/14
    const chip = cssBlock(insightsCss, 'meal-rec-v4__chip');
    expect(prop(chip, 'height')).toBe('26px');
    expect(prop(chip, 'box-shadow')).toContain('1.5px');
    const cta = cssBlock(insightsCss, 'meal-rec-v4__cta');
    expect(prop(cta, 'min-height')).toBe('44px');
    expect(prop(cta, 'border-radius')).toBe('14px');
    const wrap = cssBlock(insightsCss, 'meal-rec-card--v4');
    expect(prop(wrap, 'border-radius')).toBe('20px');
    expect(prop(wrap, 'padding')).toBe('16px');
  });

  it('второй заход: экран Score, вес фикс-30, лист долга — в коде', () => {
    const cascade = fs.readFileSync(
      path.resolve(__dirname, '../heys_cascade_card_v1.js'), 'utf8');
    expect(cascade).toContain('heys-score-screen');
    expect(cascade).toContain('доли одного числа, сумма = ');
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    expect(stats).toContain("'Вес · 30 дней'");
    expect(stats).toContain('screenMode: true');
    expect(stats).toContain('дни особого периода в тренд не входят');
    expect(stats).toContain('!useReportsV4 && monthForecast');
    const dayImpl = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_tab_impl_v1.js'), 'utf8');
    expect(dayImpl).toContain('chartPeriod: 31');
    const dashboard = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_dashboard.js'), 'utf8');
    expect(dashboard).toContain('InsightsV4DebtSheet');
    expect(dashboard).toContain('Как считается долг');
  });
});
