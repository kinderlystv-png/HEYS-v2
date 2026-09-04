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

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/gamification.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css');
const SCREENS = path.resolve(__dirname, '../heys_gamification_screens_v1.js');

const G = '.game-v4-sheet__';

const EXCEPTIONS = new Map([
  // Кадр .row — space-between; продуктовая лестница — center + flex 1 у титула.
  ['Уровни · 15|justify', 'кадр .row space-between; .game-v4-sheet__ladder-row — center, тот же вид'],
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
  [17, `${G}card-sub`, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [18, [`${G}near-card ${G}streak-bar-row`, `${G}streak-bar-row`], ['gap', 'marginTop']],
  [19, [`${G}streak-bar`, `${G}streak-bar.is-earned.is-ok`], ['height', 'radius', 'background']],
  [20, `${G}streak-bar`, ['height', 'radius', 'background']],
  [21, `${G}card-meta`, ['fontWeight', 'fontSize', 'color', 'marginTop']],
  [23, `${G}ach-row`, ['align', 'gap', 'padding']],
  [24, [`${G}ach-medal`, `${G}ach-row.is-unlocked ${G}ach-medal`],
    ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [14, `${G}card-head`, ['justify', 'align', 'gap']],
  [25, `${G}ach-body`, ['flex']],
  [26, `${G}ach-head`, ['align', 'justify', 'gap']],
  [27, `${G}ach-name`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [28, `${G}ach-xp`, ['flex', 'fontWeight', 'fontSize', 'color']],
  [29, `${G}ach-cond`, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [30, `${G}ach-row`, ['align', 'gap', 'padding']],
  [31, [`${G}ach-medal`, `${G}ach-row.is-locked ${G}ach-medal`],
    ['width', 'height', 'flex', 'radius', 'background', 'align', 'justify']],
  [35, `${G}more-groups`, ['fontWeight', 'fontSize', 'color']],
];

const LEVELS = [
  [8, `${G}hero-num`, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'tracking']],
  [9, `${G}hero-unit`, ['fontWeight', 'fontSize', 'color']],
  [10, [`${G}bar`, `${G}bar--thin`], ['height', 'radius', 'background', 'marginTop']],
  [15, `${G}ladder-row`, ['align', 'gap', 'padding']],
  [16, `${G}ladder-title`, ['fontSize', 'fontWeight', 'color']],
  [17, `${G}ladder-xp`, ['fontWeight', 'fontSize', 'color']],
  [18, [`${G}ladder-title`, `${G}ladder-row.is-current ${G}ladder-title`], ['fontWeight', 'color']],
  [19, `${G}ladder-mark`, ['width']],
  [2, `${G}header`, ['align', 'gap']],
  [5, `${G}hero--cream`, ['background', 'radius', 'padding', 'marginTop']],
  [7, `${G}hero-metric`, ['align', 'gap', 'marginTop']],
  [11, `${G}bar-fill`, ['radius', 'background']],
  [12, `${G}level-hero-meta`, ['justify', 'marginTop', 'fontWeight', 'fontSize', 'color']],
  [21, [`${G}card`, `${G}mult-card`], ['background']],
  [22, `${G}card-head`, ['justify', 'align', 'gap']],
  [23, `${G}card-title`, ['fontWeight', 'fontSize', 'color']],
  [24, [`${G}card-xp`, `${G}card-xp--ok`], ['flex', 'fontWeight', 'fontSize', 'color']],
  [25, `${G}card-sub--mult`, ['lineHeight', 'marginTop']],
  [27, `${G}xp-label`, ['color']],
  [28, `${G}xp-value`, ['fontWeight', 'fontSize', 'color']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 46;

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
    expect(rules.get(`${G}ladder-title`)['font-size']).toBe('12.5px');
    expect(rules.get(`${G}ladder-title`)['font-weight']).toBe('600');
    expect(rules.get(`${G}ladder-mark`).width).toBe('12px');
    expect(rules.get(`${G}ladder-mark`).height).toBe('12px');
    expect(rules.get(`${G}ladder-row.is-current ${G}ladder-title`)['font-weight']).toBe('700');
    const screens = fs.readFileSync(SCREENS, 'utf8');
    expect(screens).toContain('renderLadderCheckMark');
    expect(screens).toContain('game-v4-sheet__ladder-mark--spacer');
    expect(screens).toMatch(/\$\{lvl\} · \$\{t\.title/);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(1);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[геймификация] сверено ${covered} из ${total} строк разбора `
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
