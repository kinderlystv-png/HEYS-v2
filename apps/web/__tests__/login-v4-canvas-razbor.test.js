// Кадры входа против раздела канваса «Разбор кадров · элемент за элементом»
// (пакет 30 августа). Раздел даёт каждому нарисованному элементу собственные
// числа; здесь по ним сверяется тема входа.
//
// Как и в «Дате», спорные числа зоны решает не кадр, а её именованная строка:
// клавиатура, слот ошибки и поле телефона разбирались раньше. Такие пары стоят
// в EXCEPTIONS с указанием строки; живыми остаются числа, о которых строки нет.
//
// Синие и тёмные копии кадров (ключ с «(2)», «(3)», «(4)») в разбор не идут:
// геометрия у копий одна, отличаются только тона своих наборов.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/login.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/733-ui-v4-login-theme.css');

// Осознанные отступления: кадр против именованной строки той же зоны.
const EXCEPTIONS = new Map([
  // Строка «вид слота ошибки»: «высота фиксирована под одну строку 11,5 px/600».
  // Кадр набирает 12.
  ['Вход · Вход клиента · 17|fontSize', 'строка «вид слота ошибки»: 11,5 px'],
  // Та же строка не называет полей слота; в коде 11/16 — при них слот держит
  // фиксированные 38 px, кадровые 13/16 в них не помещаются.
  ['Вход · Вход клиента · 17|padding', 'поля 11/16 держат фиксированную высоту слота 38'],
  // Строка «вид своей клавиатуры»: «⌫ — тот же бокс», то есть фон --c1.
  // Кадр красит клавишу стирания во вторую поверхность.
  ['Вход · Вход клиента · 20|background', 'строка «вид своей клавиатуры»: тот же бокс --c1'],
  // Та же строка: «зазоры 7 по горизонтали и вертикали», «радиус 16». Кадр
  // даёт 8 и 14.
  ['Вход · Вход клиента · 18|gap', 'строка «вид своей клавиатуры»: зазоры 7'],
  ['Вход · Вход клиента · 19|radius', 'строка «вид своей клавиатуры»: радиус 16'],
  // Кадр ставит префикс и номер на общую базовую линию, но своей высоты у поля
  // не имеет. Строка «вид карточки и боксов кода» фиксирует высоту 44, и при
  // ней baseline прижимает строку к верху бокса — проверено в браузере.
  ['Вход · Вход клиента · 9|align', 'высота поля 44 из контракта: при ней baseline уводит текст вверх'],
  // Тон подписи поля: кадр просит чернила 42 %, у набора три тона — 55/45/38.
  ['Вход · Вход клиента · 8|color', 'у набора нет тона 42 %, ближайший --v4-ink-3'],
  ['Вход · Вход куратора · 7|color', 'тот же тон 42 % против 45 % набора'],
]);

const CLIENT = [
  [1, '.heys-auth-shell', ['background', 'direction', 'align', 'justify']],
  [4, '.heys-auth-card', ['background', 'radius', 'padding', 'direction', 'align']],
  [5, '.heys-auth-heading', ['direction', 'align']],
  [8, '.heys-auth-label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [9, '.heys-auth-field', ['justify', 'gap', 'radius', 'background']],
  [10, '.heys-auth-shell .heys-auth-field > .heys-auth-prefix',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [11, '.heys-auth-shell input.phone-input-large', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [14, ['.heys-auth-pin-grid', '.heys-auth-card .heys-auth-pin-grid'], ['gap', 'justify']],
  [15, '.heys-auth-pin-box', ['width', 'height']],
  [16, '.heys-auth-pin-box.is-complete::after', ['width', 'height', 'radius', 'background']],
  [17, '.heys-auth-error', ['marginTop', 'radius', 'textAlign']],
  [18, '.heys-auth-keypad', ['marginTop']],
  [19, ['.heys-auth-key', '.heys-auth-key-spacer'],
    ['height', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [20, 'html .heys-auth-key.heys-auth-key--delete', ['fontSize']],
  [21, '.heys-auth-support-line', ['fontWeight', 'fontSize', 'lineHeight', 'textAlign']],
];

// Кадр блокировки: карточка появилась 1 сентября по решению 31 августа
// («Блокировка входа — состояние экрана»). До неё продукт показывал отказ одной
// строкой в общем слоте ошибки, и три элемента кадра стояли в вердикте «≠».
const LOCKOUT = [
  [14, '.heys-auth-lockout', ['marginTop', 'radius', 'background', 'padding']],
  // Выключка у заголовка и строки не проверяется: одна center на карточке
  // правит обоими, а кадр печатает её каждому элементу отдельно — это разница
  // между вычисленным стилем и объявленным, а не расхождение.
  [15, '.heys-auth-lockout__title',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [16, '.heys-auth-lockout__body',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

const CURATOR = [
  [2, '.heys-auth-card', ['background', 'radius', 'padding', 'direction', 'align']],
  [5, '.heys-auth-subtitle', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'textAlign', 'marginTop']],
  [7, '.heys-auth-label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking']],
  [8, '.heys-auth-input', ['radius', 'background', 'padding', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [11, ['.heys-auth-btn', '.heys-auth-btn--primary'],
    ['marginTop', 'radius', 'background', 'padding', 'textAlign', 'fontWeight', 'fontSize', 'lineHeight']],
  [12, '.heys-auth-support-line', ['fontWeight', 'fontSize', 'lineHeight', 'textAlign']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 24;

describe('«Вход» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Вход · Вход клиента» совпадает с экраном входа', () => {
    expect(compare({ razbor, rules, frame: 'Вход · Вход клиента', pairs: CLIENT })).toEqual([]);
  });

  it('кадр «Вход · блокировка» совпадает с карточкой блокировки', () => {
    expect(compare({ razbor, rules, frame: 'Вход · блокировка', pairs: LOCKOUT })).toEqual([]);
  });

  it('кадр «Вход · Вход куратора» совпадает со служебным входом', () => {
    expect(compare({ razbor, rules, frame: 'Вход · Вход куратора', pairs: CURATOR })).toEqual([]);
  });

  // Числа, которые называет строка зоны, а кадр рисует иначе.
  it('клавиатура и слот ошибки следуют своим строкам, а не кадру', () => {
    // «вид своей клавиатуры»: зазоры 7, радиус 16, ⌫ тем же боксом --c1.
    expect(rules.get('.heys-auth-keypad').gap).toBe('7px');
    expect(rules.get('.heys-auth-key')['border-radius']).toBe('16px');
    // Роль, а не литерал: строка «палитры» просит полные ряды — песочный и
    // синий по шесть экранов один в один, и поверхность клавиши обязана
    // идти набором. До 31 августа здесь стоял голый #f7efe2, и тест его
    // же и сторожил — то есть закреплял песочную клавишу на синем наборе.
    expect(rules.get('html .heys-auth-key.heys-auth-key--delete').background)
      .toBe('var(--v4-surface, #f7efe2)');
    // «вид слота ошибки»: одна строка 11,5 px/600, без заливки и обводки.
    expect(rules.get('.heys-auth-error')['font-size']).toBe('11.5px');
    expect(rules.get('.heys-auth-error')['font-weight']).toBe('600');
    expect(rules.get('.heys-auth-error').background).toBe('transparent');
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(8);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[вход] сверено ${covered} из ${total} строк разбора `
      + `(${((covered / total) * 100).toFixed(1)} %), кадров ${perFrame.length}, `
      + `не тронуто целиком ${untouched}, вне пар ${missed}; `
      + `больше всего пропущено: ${worst.join(' · ') || 'нет'}`,
    );
    expect(covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (covered > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${covered} строк вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});
