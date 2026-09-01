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

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

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
  [10, '.ca-modal__type-more-title', ['color']],
];

// Кадр «повторяющиеся правки»: строка с пилюлей повтора имеет собственные
// вертикальные поля и прижимает содержимое к верху.
const PAIRS_REPEAT = [
  [9, '.ca-modal__item--repeat', ['align', 'padding']],
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

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 5;

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
    const missing = [...PAIRS_ONE, ...PAIRS_TYPES, ...PAIRS_REPEAT]
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

  it('название свёрнутого типа остаётся в одной строке со счётчиком', () => {
    expect(rules.get('.ca-modal__type-title')?.['white-space']).toBe('nowrap');
  });

  it('иерархия тонов листа совпадает с численными контрактами канваса', () => {
    const ink = (percent) => `color-mix(in srgb, var(--v4-ink, #201e1d) ${percent}%, transparent)`;
    expect(rules.get('.ca-modal__header-subtitle')?.color).toBe(ink(50));
    expect(rules.get('.ca-modal__item-sub')?.color).toBe(ink(50));
    expect(rules.get('.ca-modal__item-sub--nowrap')?.['white-space']).toBe('nowrap');
    expect(rules.get('.ca-modal__type-more-title')?.color).toBe(ink(50));
    expect(rules.get('.ca-modal__close')?.color).toBe(ink(28));
    expect(rules.get('.ca-modal__chevron')?.color).toBe(ink(28));
    expect(rules.get('.ca-modal__date-label')?.color).toBe(ink(40));
    expect(rules.get('.ca-modal__meal-divider')?.background).toBe(ink(7));
    expect(rules.get('.ca-modal__later-btn')?.color).toBe(ink(58));
  });

  it('числа листа совпадают с кадром «повторяющиеся правки»', () => {
    expect(compare({ razbor, rules, frame: REPEAT, pairs: PAIRS_REPEAT })).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.length).toBe(4);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[правки куратора] сверено ${covered} из ${total} строк разбора `
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
