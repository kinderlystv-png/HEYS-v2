import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRazbor, readRules, compare, coverage } from './canvas-razbor-helpers.js';

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
  ['правка 30|тон «Удалить приём»', 'канвас зовёт --val-bad (#a8382b); роли под этот тон в наборе нет, ближайшая --v4-bad-text даёт #b4442a. Своей роли ради одного отличия в полтона не завожу — это опись владельца'],
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
        // Семантическая роль --v4-ink-data раскрывается по теме, поэтому её
        // точное назначение проверяем ниже, а здесь оставляем числовую типографику.
        [14, '.nutrition-v4-meal-row__items', ['flex', 'fontWeight', 'fontSize', 'lineHeight']],
        [15, '.nutrition-v4-meal-row__add',
          ['flex', 'minHeight', 'align', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
        [20, '.nutrition-v4-streak',
          ['background', 'radius', 'padding', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
      ],
    });
    expect(drift).toEqual([]);
    expect(rules.get('.nutrition-v4-meal-row__items').color)
      .toBe('var(--v4-ink-data, rgba(var(--ink),.56))');
  });

  it('числа листа правки совпадают с кадром', () => {
    // Тот же раздел ответственности: nutrition-tab строкой «лист правки приёма —
    // не здесь» отдаёт лист food-meal («при расхождении верен food-meal»), а
    // food-meal строкой «главный файл правки приёма» зовёт себя главным.
    const drift = compare({
      razbor,
      rules,
      frame: 'Приём · правка',
      pairs: [
        [22, ['.nutrition-v4-sheet__action', '.nutrition-v4-sheet__action b'],
          ['align', 'gap', 'fontWeight', 'fontSize', 'lineHeight']],
        // Тон «Удалить приём» — исключение: канвас зовёт --val-bad (#a8382b),
        // а роли под него в наборе нет; ближайшая --v4-bad-text даёт #b4442a.
        [30, '.nutrition-v4-sheet__delete',
          ['minHeight', 'align', 'justify', 'gap', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
      ],
    });
    expect(drift).toEqual([]);
  });

  // Охват называется вслух: без этого «сверено гейтом» в обосновании вердикта
  // проверить нельзя иначе как чтением этого файла, и ссылка живёт годами, не
  // будучи ничем подтверждённой. Счётчик полезен ровно тем, что его можно
  // сравнить с числом вердиктов, которые на гейт ссылаются.
  //
  // Знаменатель — строки двух СВОИХ кадров, а не всего канваса: остальные кадры
  // food-meal сверяют другие гейты и вердикты по элементам, и класть их сюда
  // значило бы называть чужую работу своим непокрытием.
  it('гейт называет свой охват', () => {
    const MINE = ['Приёмы дня · список', 'Приём · правка'];
    const { perFrame } = coverage({ razbor });
    const mine = perFrame.filter((f) => MINE.includes(f.frame));
    expect(mine.map((f) => f.frame).sort()).toEqual([...MINE].sort());
    const rows = mine.reduce((n, f) => n + f.rows, 0);
    const covered = mine.reduce((n, f) => n + f.covered, 0);
    console.info(
      `[список приёмов дня] сверено ${covered} из ${rows} строк разбора своих кадров `
      + `(${((covered / rows) * 100).toFixed(1)} %), кадров ${mine.length}: `
      + mine.map((f) => `${f.frame} — ${f.covered}/${f.rows}`).join(' · '),
    );
    expect(covered).toBeGreaterThan(0);
  });

  it('отступления названы поимённо и не разрослись', () => {
    expect([...EXCEPTIONS.keys()]).toEqual([
      '08|карточка на приём', '09|шапка строки', '13|низ строки',
      'рисунок 03|значок у пустого приёма', 'правка 30|тон «Удалить приём»',
    ]);
    for (const reason of EXCEPTIONS.values()) expect(reason.length).toBeGreaterThan(40);
  });
});
