// Кадры утреннего чек-ина против раздела канваса «Разбор кадров · элемент за
// элементом» (пакет 30 августа). Сведены: все пять шагов мастера в их
// состояниях и три экрана развилки разбора вчера. Остальные кадры зоны —
// добавки, замеры, «Записано», холод и особые дни — ждут своего захода.
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

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

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
  // Тона: у набора три чернильных тона (55 / 45 / 38), кадр просит 50 и 42.
  ['Чек-ин · остальное · 9|color', 'у набора нет тона 50 %, ближайший --v4-ink-2'],
  ['Чек-ин · остальное · 15|color', 'у набора нет тона 42 %, ближайший --v4-ink-3'],
  // Вес и тон пилюли-ответа: расхождение общее для всех пилюль чек-ина, вопрос
  // заведён в UI_V4_FINDINGS.md — вслепую пять шагов не перекрашиваем.
  ['Чек-ин · остальное · 11|fontWeight', 'вопрос по пилюлям-ответам, см. UI_V4_FINDINGS.md'],
  ['Чек-ин · остальное · 11|color', 'то же'],
  // Развилка разбора вчера: кадры рисуют дорожке высоту 24, а строка контракта
  // «вид дорожки» задаёт продукту одну дорожку высотой 26 и соседней строкой
  // «дорожка» относит сюда же оценку пачки. У мастера дорожка уже 26.
  ['Чек-ин · вчера по ощущениям · 19|height', 'контракт «вид дорожки»: одна дорожка 26'],
  ['Чек-ин · вчера по ощущениям · 20|height', 'та же строка'],
  ['Чек-ин · вчера по ощущениям · 22|marginTop', 'та же строка: засечки через 8, кадр рисует 7'],
  // Ступени цвета — своё решение продукта: заливка и значение красятся по тому,
  // куда уведён ползунок (норма · недобор · перебор). Кадр рисует один тон.
  ['Чек-ин · вчера по ощущениям · 20|background', 'три ступени заливки, кадр рисует одну'],
  // Тона: кадр просит 42 %, у набора такого нет.
  ['Чек-ин · вчера по ощущениям · 23|color', 'у набора нет тона 42 %, ближайший --v4-ink-3'],
  // Подвал развилки один на все её экраны: пять кадров из шести дают зазор 8.
  ['Чек-ин · сила для пачки · 24|gap', 'подвал развилки один: пять кадров из шести дают 8'],
  // Тона: 50 % и 42 % у набора нет, ближайшие --v4-ink-2 и --v4-ink-3.
  ['Чек-ин · цель по шагам · 9|color', 'у набора нет тона 50 %, ближайший --v4-ink-2'],
  ['Чек-ин · цель по шагам · 19|color', 'у набора нет тона 42 %, ближайший --v4-ink-3'],
  ['Чек-ин · цель по шагам · 26|color', 'то же'],
  // Строка «минимальная область нажатия»: всё нажимаемое не ниже 44, кроме
  // чипов в переносимых рядах. Кадр рисует пилюлям «Да»/«Нет» высоту 38.
  ['Чек-ин · цель по шагам · 24|minHeight', 'строка «минимальная область нажатия»: 44'],
  ['Чек-ин · цель по шагам · 25|minHeight', 'та же строка'],
  // Сноска стоит через 26, когда под дорожкой нет подсказки, и через 14, когда
  // под ней карточка или загрузочный день. Кадр «шаги своё число» просит 20 —
  // это третье состояние, и живёт оно в JS, а не в наборе правил.
  ['Чек-ин · шаги своё число · 19|marginTop', 'сноска шага: два состояния, 26 и 14'],
]);

// Те же два тона повторяются в каждом состоянии шага шагов: подпись под
// числом просит 50 %, подсказка под дорожкой и сноска — 42 %. У набора таких
// тонов нет, стоят ближайшие --v4-ink-2 и --v4-ink-3. Перечислено поимённо,
// чтобы отступление не пряталось за общим правилом.
for (const [frame, ...rows] of [
  ['Чек-ин · шаги при коротком сне', 9, 19, 20],
  ['Чек-ин · шаги без истории', 9, 19, 20],
  ['Чек-ин · шаги после тренировки', 9, 19, 20],
  ['Чек-ин · шаги на потолке', 9, 19, 20],
  ['Чек-ин · шаги при тяжёлом утре', 9, 19],
  ['Чек-ин · шаги своё число', 9],
]) {
  for (const row of rows) {
    EXCEPTIONS.set(`${frame} · ${row}|color`, 'у набора нет тонов 50 % и 42 %');
  }
}

const STEP5 = [
  [5, '.mc-rest-cold', ['radius', 'background', 'padding']],
  [6, '.mc-rest-cold-head', ['align', 'justify', 'gap']],
  [7, '.mc-rest-cold-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [8, '.mc-rest-cold-streak', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [9, '.mc-rest-cold-hint', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [10, '.mc-rest-cold-actions', ['gap', 'marginTop']],
  [11, ['.mc-pill', '.mc-pill--choice'], ['minHeight', 'radius', 'background', 'fontSize', 'lineHeight']],
  [13, ['.mc-rest-card', '.mc-rest-card--coffee'], ['background']],
  [15, '.mc-rest-coffee-note', ['fontWeight', 'fontSize', 'lineHeight']],
  [16, '.mc-rest-coffee-actions', ['gap', 'marginTop']],
  [18, ['.mc-pill', '.mc-pill--choice.is-on'],
    ['minHeight', 'radius', 'background', 'color', 'fontWeight', 'fontSize', 'lineHeight']],
  [19, ['.mc-rest-card-hint', '.mc-rest-coffee-why'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [20, ['.mc-rest-card', '.mc-rest-card--supplements'], ['background']],
  [21, '.mc-rest-supp-head', ['align', 'justify', 'gap']],
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
  [n.note, '.yv-slider-note', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
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
      ['fontSize', 'lineHeight', 'marginTop']],
    [n.m, '.mc-steps-advice-mark',
      ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color']],
    [n.t, '.mc-steps-slider-labels',
      ['justify', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ];
  if (withHint) {
    rows.push([n.i, ['.mc-recorded-hint', '.mc-steps-slider-container > .mc-recorded-hint'],
      ['fontWeight', 'fontSize', 'lineHeight']]);
  }
  if (n.f) {
    rows.push([n.f, ['.mc-recorded-hint', '.mc-steps-step > .mc-recorded-hint'],
      ['fontWeight', 'fontSize', 'lineHeight']]);
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

  it('три кадра развилки совпадают с экраном оценки по ощущениям', () => {
    for (const [frame, n, on] of YV_FRAMES) {
      const pairs = yvPairs(n).concat(on ? yvOn(on[0], on[1]) : []);
      expect(compare({ razbor, rules: yv, frame, pairs })).toEqual([]);
    }
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
    expect(why.color).toBe('var(--v4-ink-3, rgba(0, 0, 0, 0.45))');
  });

  // Подпись «Легли»/«Встали» перебивалась старым правилом той же силы ниже по
  // файлу — 14 px тоном слейта. Область модалки возвращает ей вид набора.
  it('подписи блоков сна набраны прописными 10 px, а не старым слейтом', () => {
    const label = rules.get('.mc-modal--daily .mc-sleep-label');
    expect(label['font-size']).toBe('10px');
    expect(label['text-transform']).toBe('uppercase');
    expect(label.color).toBe('rgba(0, 0, 0, 0.4)');
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
  it('шаги развилки с плоским содержимым не удваивают отступы', () => {
    expect(yv.get('.yv-step').gap).toBe('20px');
    expect(yv.get('.yv-step--feelings').gap).toBe('0');
    expect(yv.get('.yv-step--bulk-force').gap).toBe('0');
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

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(36);
  });
});
