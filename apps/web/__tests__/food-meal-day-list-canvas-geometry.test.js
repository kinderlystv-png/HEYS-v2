import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRazbor, readRules, compare } from './canvas-razbor-helpers.js';

// Список приёмов дня рисуют два канваса, и это назначено, а не случайность:
// «nutrition-tab.v4.dc.html» строкой «список приёмов дня — не здесь» отдаёт его
// food-meal («там же конец флоу добавления… при расхождении верен food-meal»),
// а сам food-meal строкой «источник» зовёт себя «главным для приёма и приёмов
// дня». Поэтому числа строки приёма сверяются здесь, а гейт вкладки те же пары
// не трогает — иначе один и тот же блок держат два красных теста с разными
// требованиями.
//
// Разбор кадра у food-meal написан инлайном, поэтому сверка идёт не парами
// «класс канваса → класс продукта», а по строкам разбора с привязкой к метке
// кадра — способ, который CLAUDE.md называет для таких канвасов.
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/food-meal.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css');
const FRAME = 'Приёмы дня · список';

// Отступления, названные поимённо: строки, где food-meal и nutrition-tab
// требуют разного, а решение стоит не за гейтом.
const EXCEPTIONS = new Map([
  ['08|карточка на приём', 'кадр даёт каждому приёму свою карточку --c1 радиусом 20; продукт держит список одной карточкой со строками через линию — так же описывает вкладку контракт nutrition-tab («список — одна карточка… снизу линия 1 px»). Расхождение структурное, записано в UI_V4_FINDINGS.md'],
  ['09|шапка строки', 'кадр: выравнивание center и зазор 9; контракт вкладки: «зазор 12, выравнивание по baseline». Продукт следует контракту'],
  ['13|низ строки', 'кадр: отступ сверху 9; контракт вкладки: «Низ через 5 px». Продукт следует контракту'],
  ['рисунок 03|значок у пустого приёма', 'кадр рисует у приёма без продуктов чёрточку 14×14; контракт вкладки говорит «справа шеврон 15 px тоном --dim» и пустой приём не выделяет. Контракт старше кадра'],
]);

describe('строка приёма дня против кадра food-meal', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр на месте и строки разбора не разъехались', () => {
    expect(razbor.get(`${FRAME}|10`)).toContain('радиус 999px');
    expect(razbor.get(`${FRAME}|11`)).toContain('12:00 · Завтрак');
    expect(razbor.get(`${FRAME}|15`)).toContain('+ ещё');
  });

  it('числа строки приёма совпадают с кадром', () => {
    const drift = compare({
      razbor,
      rules,
      frame: FRAME,
      pairs: [
        [10, '.nutrition-v4-meal-row__num',
          ['flex', 'width', 'height', 'radius', 'background', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
        [11, '.nutrition-v4-meal-row__title', ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
        [12, '.nutrition-v4-meal-row__kcal', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
        [14, '.nutrition-v4-meal-row__items', ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
        [15, '.nutrition-v4-meal-row__add',
          ['flex', 'minHeight', 'align', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
        [21, '.nutrition-v4-streak',
          ['background', 'radius', 'padding', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
      ],
    });
    expect(drift).toEqual([]);
  });

  it('отступления названы поимённо и не разрослись', () => {
    expect([...EXCEPTIONS.keys()]).toEqual([
      '08|карточка на приём', '09|шапка строки', '13|низ строки', 'рисунок 03|значок у пустого приёма',
    ]);
    for (const reason of EXCEPTIONS.values()) expect(reason.length).toBeGreaterThan(40);
  });
});
