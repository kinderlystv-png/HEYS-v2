// Кадры капсулы даты и календаря против раздела канваса «Разбор кадров ·
// элемент за элементом» (пакет 30 августа). Раздел даёт каждому нарисованному
// элементу собственные числа; здесь по ним сверяется продуктовый CSS.
//
// Особенность зоны: почти все расхождения кадра с кодом уже разобраны её
// именованными строками, и код следует им, а не кадру. Такие пары стоят в
// EXCEPTIONS с указанием строки контракта — так видно, что расхождение
// разобрано, а не пропущено. Живыми остаются числа, о которых именованной
// строки нет: там верен кадр.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/date-remainders.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css');

const V4 = '.date-picker--v4';
const S = '.date-picker-sheet';

// Осознанные отступления: кадр против именованной строки той же зоны. Контракт
// старше кадра, поэтому сверяется не всё. Список закрытый.
const EXCEPTIONS = new Map([
  // Строка «вид капсулы»: «ряд из трёх частей с зазором 7 px… капсула высотой
  // 36… иконка календаря 12 px… зазор 7». Кадры дают 8, 38 и 6.
  ['Дата · чужой день · 16|gap', 'строка «вид капсулы»: зазор ряда 7'],
  ['Дата · чужой день · 18|height', 'строка «вид капсулы»: высота капсулы 36'],
  ['Дата · чужой день · 19|gap', 'строка «вид капсулы»: зазор иконки и текста 7'],
  // Строка «вид чужого дня»: «„Сегодня" 11 px/700 тоном --ac». Кадр рисует
  // залитую терракотой пилюлю 10,5 px.
  ['Дата · чужой день · 20|background', 'строка «вид чужого дня»: без заливки'],
  ['Дата · чужой день · 20|fontSize', 'строка «вид чужого дня»: 11 px'],
  ['Дата · чужой день · 20|color', 'строка «вид чужого дня»: тон --ac'],
  // Строка «вид шторки календаря»: «ряд сокращений дней 9,5 px/700 прописными
  // тоном чернил 40 %». Кадр набирает 600 и 42 %.
  ['Календарь · легенда · 10|fontWeight', 'строка «вид шторки календаря»: 700'],
  ['Календарь · легенда · 10|color', 'строка «вид шторки календаря»: чернила 40 %'],
  // Строка «вид клетки»: «клетка 42×44 px, радиус 14; число 12,5 px/600…
  // Точка факта 4 px под числом через 3».
  ['Календарь · легенда · 11|radius', 'строка «вид клетки»: радиус 14'],
  ['Календарь · легенда · 11|gap', 'строка «вид клетки»: точка под числом через 3'],
  ['Календарь · легенда · 11|fontSize', 'строка «вид клетки»: число 12,5'],
  ['Календарь · легенда · 12|size', 'строка «вид клетки»: точка 4 px'],
  // Строка «снять в коде» плюс «вид клетки»: легенда показывает ровно то, что
  // нарисовано в сетке, а «сегодня» в сетке — начертание 700 тоном --ac, не
  // плашка. Кадр рисует плашку 11×11.
  ['Календарь · легенда · 25|*', 'строки «снять в коде» и «вид клетки»: «сегодня» — начертание, не плашка'],
  // Нижний радиус листа в кадре — угол телефона, а не самой шторки.
  ['Календарь · легенда · 3|radius', 'нижний радиус кадра — угол экрана'],
  // Инвариант product-модалок (CLAUDE.md, «подложка product-модалок»): dim и
  // блюр берутся из токенов набора. Кадр рисует чернила 34 % без блюра —
  // инвариант старше кадра, отступление названо в CSS у самого правила.
  ['Календарь · легенда · 2|background', 'подложка по инварианту product-модалок, не по кадру'],
  // Строка «вид чужого дня» называет заливку --tint, в наборе для капсулы
  // прошлого дня заведена отдельная роль --v4-past. В песочной они почти
  // совпадают, в синей расходятся сильно — вопрос дизайнеру заведён.
  ['Дата · чужой день · 18|background', 'роль --v4-past против --tint контракта, вопрос дизайнеру'],
]);

// Кадр «Дата · чужой день» — капсула в прошлом дне. Остальные элементы кадра
// принадлежат вкладке «Питание», их сверяет своя зона.
const PAST = [
  [16, '.date-picker-row', ['align']],
  [17, `${V4} .date-picker-day-nav`, ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [18, `${V4} .date-picker-trigger`, ['radius', 'align']],
  [19, `${V4} .date-picker-lbl-inner`, ['align']],
  [20, `${V4} .date-picker-inline-today`, ['height', 'radius', 'fontWeight', 'lineHeight']],
];

// Кадр «Календарь · легенда» — нижний лист календаря целиком.
const SHEET = [
  [3, '.date-picker-sheet__card', ['background']],
  [4, '.date-picker-sheet-handle', ['width', 'height', 'radius', 'marginBottom']],
  [5, '.date-picker-header', ['align', 'justify']],
  [6, `${S} .date-picker-sheet-month-nav`, ['width', 'height', 'radius', 'background', 'align', 'justify', 'marginTop']],
  [9, `${S} .date-picker-days`, ['gap']],
  [10, [`.date-picker-weekday`, `${S} .date-picker-weekday`], ['textAlign', 'fontSize']],
  [11, ['.date-picker-day', `${S} .date-picker-day`, `${S} .date-picker-day.has-data:not(.selected)`],
    ['minHeight', 'direction', 'align', 'justify', 'fontWeight', 'background']],
  [12, `${S} .day-data-dot`, ['radius', 'background']],
  [16, `${S} .date-picker-day.selected`, ['background', 'fontWeight']],
  [21, `${S} .date-picker-legend`, ['gap', 'fontWeight', 'fontSize', 'color']],
  [22, [`.legend-item`, `${S} .legend-item`], ['gap']],
  [23, `${S} .legend-swatch--cycle`, ['width', 'height', 'radius']],
  [24, `${S} .legend-swatch--refeed`, ['width', 'height', 'radius']],
  [26, `${S} .legend-swatch--selected`, ['width', 'height', 'radius', 'background']],
  [27, ['.date-picker-btn', `${S} .date-picker-btn.today-btn`],
    ['radius', 'background', 'padding', 'fontWeight', 'fontSize', 'color']],
];

describe('«Дата и остатки» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Дата · чужой день» совпадает с капсулой прошлого дня', () => {
    expect(compare({ razbor, rules, frame: 'Дата · чужой день', pairs: PAST })).toEqual([]);
  });

  it('кадр «Календарь · легенда» совпадает с нижним листом календаря', () => {
    expect(compare({ razbor, rules, frame: 'Календарь · легенда', pairs: SHEET })).toEqual([]);
  });

  // Числа, которые называет именованная строка зоны, а кадр рисует иначе:
  // проверяются по строке контракта, а не по кадру.
  it('капсула следует строке «вид капсулы», а не кадру', () => {
    expect(rules.get('.date-picker-row').gap).toBe('7px');
    expect(rules.get(`${V4} .date-picker-trigger`).height).toBe('36px');
    expect(rules.get(`${V4} .date-picker-lbl-inner`).gap).toBe('7px');
    expect(rules.get(`${V4} .date-picker-day-nav`).width).toBe('34px');
  });

  it('клетка и точка следуют строке «вид клетки», а не кадру', () => {
    expect(rules.get(`${S} .date-picker-day`)['border-radius']).toBe('14px');
    expect(rules.get(`${S} .date-picker-day`).gap).toBe('3px');
    expect(rules.get(`${S} .day-number`)['font-size']).toBe('12.5px');
    expect(rules.get(`${S} .day-data-dot`).width).toBe('4px');
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(16);
  });
});
