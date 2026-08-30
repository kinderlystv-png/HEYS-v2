// Лист правок куратора против раздела «Разбор кадров» канваса
// curator-edits.v4.dc.html.
//
// Метод выбран по канвасу: геометрия листа живёт в классах `.ca-modal*`
// (500-pwa-and-offline.css), значит работает сверка парами «элемент разбора →
// правило продукта». Строки читаются из самого канваса, поэтому расхождение
// всплывает при правке любой из сторон.
//
// Восемь кадров зоны показывают один и тот же лист с разным содержимым: кадр
// отличается тем, сколько правок в нём и как они свёрнуты, а не видом. Поэтому
// таблицы не восемь, а три — по кадрам, где элемент вообще появляется: один
// приём (продукты и «и ещё N»), свёрнуто по типам (счётчик типа), повторяющиеся
// правки (пилюля повтора). Остальные пять сверяются теми же правилами и своих
// таблиц не заводят.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/curator-edits.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');

const ONE = 'Куратор · один приём';
const TYPES = 'Куратор · свёрнуто по типам';
const REPEAT = 'Куратор · повторяющиеся правки';

// Кадр «один приём»: строка правки и хвост продуктов.
const PAIRS_ONE = [
  [7, '.ca-modal__item', ['align', 'gap']],
  [8, '.ca-modal__more-products', ['marginTop']],
];

// Кадр «свёрнуто по типам»: счётчик рядом с названием типа.
const PAIRS_TYPES = [
  [9, '.ca-modal__type-count', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Осознанные отступления — поимённо, иначе список молча растёт.
const EXCEPTIONS = [
  // 02 у всех кадров: «Питание» 19 px/700 — заголовок вкладки за листом, а не
  // самого листа. Строка «границы» отдаёт канвасу содержимое листа; вкладка —
  // чужая поверхность.
  'вкладка за листом | заголовок «Питание» не принадлежит листу',
  // 03 и 04 у всех кадров: блоки высотой 74 и 104 с радиусом 20. Таких высот в
  // продукте нет ни в одном модуле — это карточки вкладки под листом, нарисованные
  // в кадре ради контекста.
  'карточки вкладки | высоты 74 и 104 в продукте не существуют',
  // Кнопка «Позже»: кадр называет её вторичной, но чисел не даёт, и сверять
  // нечего. Её тон и место проверяет тест продуктовых правил зоны.
  '.ca-modal__later-btn | кадр не даёт чисел',
  // Кнопка «Понятно»: кадр даёт только «флекс 1». Общий разборщик флекс не
  // читает, а учить его этому дорого: «1» в CSS и «1 1 0» — одно и то же лишь
  // у самого flex, и слепое приведение ломает проверку высоты в 1 px у соседних
  // зон. Проверено в curator-edits-v4-product-rules.
  '.ca-modal__ack-btn | флекс общий разборщик не читает',
];

describe('лист правок куратора против разбора кадров канваса', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const razbor = readRazbor(canvas);
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('разбор кадров вообще прочитан', () => {
    const frames = new Set(
      [...razbor.keys()].map((k) => k.slice(0, k.lastIndexOf('|'))),
    );
    expect(frames.has(ONE)).toBe(true);
    expect(frames.has(TYPES)).toBe(true);
    expect(frames.has(REPEAT)).toBe(true);
  });

  it('каждая пара указывает на существующее правило', () => {
    const missing = [...PAIRS_ONE, ...PAIRS_TYPES]
      .map(([, sel]) => sel)
      .filter((s) => typeof s === 'string' && !rules.has(s));
    expect(missing).toEqual([]);
  });

  it('числа листа совпадают с кадром «один приём»', () => {
    expect(compare({ razbor, rules, frame: ONE, pairs: PAIRS_ONE })).toEqual([]);
  });

  it('числа листа совпадают с кадром «свёрнуто по типам»', () => {
    expect(compare({ razbor, rules, frame: TYPES, pairs: PAIRS_TYPES })).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.length).toBe(4);
  });
});
