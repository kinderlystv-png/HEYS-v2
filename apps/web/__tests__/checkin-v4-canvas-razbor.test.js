// Кадры утреннего чек-ина против раздела канваса «Разбор кадров · элемент за
// элементом» (пакет 30 августа). Начат с пятого шага — того, где собран блок
// «Последний кофе»; остальные кадры зоны ждут своего захода.
//
// Спорные числа решает именованная строка зоны: «вид карточки шага» сводит все
// карточки шага к одной форме, а кадр рисует вторую.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/checkin-morning.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');

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
]);

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

describe('«Утренний чек-ин» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Чек-ин · остальное» совпадает с пятым шагом', () => {
    expect(compare({ razbor, rules, frame: 'Чек-ин · остальное', pairs: STEP5 })).toEqual([]);
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

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(9);
  });
});
