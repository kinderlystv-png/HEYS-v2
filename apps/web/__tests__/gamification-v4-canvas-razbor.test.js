// Кадры геймификации против раздела канваса «Разбор кадров · элемент за
// элементом» (пакет 30 августа). Раздел даёт каждому нарисованному элементу
// собственные числа; здесь по ним сверяется лист достижений и уровней.
//
// Как и в соседних зонах, спорные числа решает именованная строка зоны, а не
// кадр: список уровней и тона чернил разбирались раньше. Такие пары стоят в
// EXCEPTIONS с указанием строки.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/gamification.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css');
const SCREENS = path.resolve(__dirname, '../heys_gamification_screens_v1.js');

const G = '.game-v4-sheet__';

const EXCEPTIONS = new Map([
  // Строка «вид строки уровня в списке»: «номер и титул слева 12,5 px/600…
  // пройденные гаснут до 45 %, текущий — чернилами с весом 700». Кадр «Уровни»
  // рисует номер квадратом 34×34 радиусом 12 с заливкой по состоянию — как
  // медаль достижения. Контракт старше кадра; вопрос дизайнеру заведён.
  ['Уровни · 16|*', 'строка «вид строки уровня в списке»: номер текстом 12,5/600, не квадратом'],
  ['Уровни · 17|fontWeight', 'та же строка: титул 600, вес 700 только у текущего уровня'],
  // Кадр просит чернила 40 %; у набора три тона — 55 / 45 / 38. Взят
  // ближайший --v4-ink-4.
  ['Достижения · 21|color', 'у набора нет тона 40 %, ближайший --v4-ink-4'],
  // Кадр даёт строкам списка межстрочный 1; в коде он не задан и наследуется.
  // Однострочные подписи от этого не меняются.
  ['Уровни · 17|lineHeight', 'межстрочный однострочной подписи не задан'],
  ['Уровни · 18|lineHeight', 'то же у номинала XP'],
]);

const ACHIEVEMENTS = [
  [2, `${G}header`, ['align', 'gap']],
  [3, `${G}header-title`, ['fontWeight', 'fontSize', 'color']],
  [5, `${G}hero--cream`, ['background', 'radius', 'padding', 'marginTop']],
  [7, `${G}hero-metric`, ['align', 'gap', 'marginTop']],
  [8, [`${G}hero-num`, `${G}hero-num--md`], ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [9, `${G}hero-unit`, ['fontWeight', 'fontSize', 'color']],
  [10, [`${G}bar`, `${G}bar--thin`], ['height', 'radius', 'background', 'marginTop']],
  [11, `${G}bar-fill`, ['radius', 'background']],
  [15, `${G}card-title`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [16, `${G}card-xp`, ['fontWeight', 'fontSize', 'color']],
  [17, `${G}card-sub`, ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [18, [`${G}streak-bars`, `${G}streak-bar-row`], ['gap', 'marginTop']],
  [19, [`${G}streak-bar`, `${G}streak-bar.is-earned.is-ok`], ['height', 'radius', 'background']],
  [20, `${G}streak-bar`, ['height', 'radius', 'background']],
  [21, `${G}card-meta`, ['fontWeight', 'fontSize', 'marginTop']],
  [23, `${G}ach-row`, ['align', 'gap', 'padding']],
  [24, [`${G}ach-medal`, `${G}ach-row.is-unlocked ${G}ach-medal`],
    ['width', 'height', 'radius', 'background', 'align', 'justify']],
];

const LEVELS = [
  [8, `${G}hero-num`, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [9, `${G}hero-unit`, ['fontWeight', 'fontSize', 'color']],
  [10, [`${G}bar`, `${G}bar--thin`], ['height', 'radius', 'background', 'marginTop']],
  [15, `${G}ladder-row`, ['align', 'gap', 'padding']],
  [17, `${G}ladder-title`, ['fontSize']],
  [18, `${G}ladder-xp`, ['fontWeight', 'fontSize']],
];

describe('«Геймификация» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Достижения» совпадает с листом достижений', () => {
    expect(compare({ razbor, rules, frame: 'Достижения', pairs: ACHIEVEMENTS })).toEqual([]);
  });

  it('кадр «Уровни» совпадает с листом уровней', () => {
    expect(compare({ razbor, rules, frame: 'Уровни', pairs: LEVELS })).toEqual([]);
  });

  // Кадр «Достижения», элемент 06: ключ героя — «Достигнуто». «Открыто»
  // говорило о доступе, а достижение — о сделанном (строка «слова на экране»).
  it('ключ героя достижений называет сделанное, а не доступ', () => {
    const screens = fs.readFileSync(SCREENS, 'utf8');
    expect(screens).toContain("'Достигнуто'");
    expect(screens).toMatch(/aria-label.*достигнуто \$\{stats\.unlockedCount\}/);
    expect(screens).not.toMatch(/game-v4-sheet__eyebrow' \}, 'Открыто'/);
  });

  // Число, которое называет строка зоны, а кадр рисует иначе.
  it('строка уровня следует своей строке, а не кадру', () => {
    expect(rules.get(`${G}ladder-num`)['font-size']).toBe('12.5px');
    expect(rules.get(`${G}ladder-num`)['font-weight']).toBe('600');
    expect(rules.get(`${G}ladder-num`).width).toBeUndefined();
    expect(rules.get(`${G}ladder-row.is-current ${G}ladder-num`)['font-weight']).toBe('700');
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(5);
  });
});
