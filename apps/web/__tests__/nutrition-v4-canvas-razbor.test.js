// Кадры «Питания» против раздела канваса «Разбор кадров · элемент за элементом»
// (пакет 30 августа) — в дополнение к `nutrition-v4-canvas-geometry.test.js`.
//
// Тот сверяет классы канваса с классами продукта и потому видит только то, что
// в канвасе вынесено в его собственный `<style>`. Разбор даёт числа и тем
// элементам, которые в кадрах написаны инлайном: действия свайпа в листе правки
// приёма и блок «Волна сейчас». Их прежняя сверка не покрывала.
//
// Большая часть разбора этой зоны — доли демонстрационных полос («ширина 22 %»)
// и сокращения вида «шапка», «имя экрана»; сверять там нечего, и в пары такие
// строки не идут.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/nutrition-tab.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css');

const S = '.nutrition-v4-sheet__swipe-actions button';

// Кадр «Питание · лист правки приёма»: три действия свайпа. Обратимые — тинтом,
// необратимое — сплошной заливкой (строка «цвет свайп-действий»).
const SWIPE = [
  [6, '.nutrition-v4-sheet__swipe', ['radius']],
  [7, '.nutrition-v4-sheet__swipe-actions', ['justify']],
  [8, [S, `${S}.is-copy`], ['align', 'padding', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [9, S, ['align', 'padding', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [10, [S, `${S}.is-danger`], ['align', 'padding', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Питание · блок · Волна сейчас»: время до спада и подпись рядом с ним.
const WAVE = [
  [5, '.nutrition-v4-wave-now', ['align', 'gap']],
  [6, '.nutrition-v4-wave-now b', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [7, '.nutrition-v4-wave-now span', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Питание · блок · Оценка и риск»: слово дня, риск словом и полоса из
// четырёх шагов. Сведён 31 августа.
const SCORE = [
  [5, '.nutrition-v4-verdict', ['align', 'gap']],
  [6, '.nutrition-v4-verdict b', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [7, '.nutrition-v4-verdict span', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [8, '.nutrition-v4-steps', ['gap', 'marginTop']],
  [9, '.nutrition-v4-steps span.is-on.is-ok', ['background']],
  // Тон незаполненного шага вынесен: кадр просит чернила 10 %, у набора
  // есть 8 и 12. Взята --v4-track — роль дорожки полосы, а не линии.
  [10, '.nutrition-v4-steps span', ['height', 'radius']],
];

// Кадры зон: «зона нейтральная», «зона предупреждения», «зона красная» — один
// и тот же герой в трёх состояниях. Сведены 31 августа: тон числа и заливка
// перебора меняются по data-zone, дорожка и высота полосы общие.
// Тон нейтрального числа вынесен из пар: демо-кадр зоны даёт --tx, а все
// основные кадры экрана — --ac, и парная сверка классов держит акцент. Спорят
// два кадра одного канваса; отступление названо в вердикте строки.
const ZONE_NEUTRAL = [];
const ZONE_WARN = [
  [4, `.nutrition-v4-hero[data-zone='warn'] .nutrition-v4-hero__value`, ['color']],
  [6, `.nutrition-v4-hero[data-zone='warn'] .nutrition-v4-hero__fill.is-over`, ['background']],
];
const ZONE_RED = [
  [4, `.nutrition-v4-hero[data-zone='red'] .nutrition-v4-hero__value`, ['color']],
  [6, `.nutrition-v4-hero[data-zone='red'] .nutrition-v4-hero__fill.is-over`, ['background']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 18;

describe('«Питание» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Питание · лист правки приёма» совпадает с действиями свайпа', () => {
    expect(compare({ razbor, rules, frame: 'Питание · лист правки приёма', pairs: SWIPE })).toEqual([]);
  });

  it('кадры зон совпадают с тоном числа и заливкой перебора', () => {
    expect(compare({ razbor, rules, frame: 'Питание · зона предупреждения', pairs: ZONE_WARN })).toEqual([]);
    expect(compare({ razbor, rules, frame: 'Питание · зона красная', pairs: ZONE_RED })).toEqual([]);
  });

  it('кадр «Питание · блок · Оценка и риск» совпадает со словом дня и полосой шагов', () => {
    expect(compare({ razbor, rules, frame: 'Питание · блок · Оценка и риск', pairs: SCORE })).toEqual([]);
  });

  it('кадр «Питание · блок · Волна сейчас» совпадает с блоком волны', () => {
    expect(compare({ razbor, rules, frame: 'Питание · блок · Волна сейчас', pairs: WAVE })).toEqual([]);
  });

  // Разбор зовёт приглушённые чернила --dim, продукт — --nut-dim; значение у
  // обоих одно, и разборщик сводит имена. Проверка держит это равенство: разойдись
  // они, сверка выше молча одобрила бы чужой тон.
  it('приглушённые чернила «Питания» — тот же тон, что в канвасе', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    const sand = css.slice(css.indexOf("[data-theme-id='sand'] .nutrition-v4"));
    expect(sand).toMatch(/--nut-dim:\s*#6b5f4f/);
    const canvas = fs.readFileSync(CANVAS, 'utf8');
    expect(canvas).toContain('--dim:#6b5f4f');
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[питание] сверено ${covered} из ${total} строк разбора `
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
