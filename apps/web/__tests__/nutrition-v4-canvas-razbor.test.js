// Кадры «Питания» против раздела канваса «Разбор кадров · элемент за элементом»
// (пакет 30 августа) — в дополнение к `nutrition-v4-canvas-geometry.test.js`.
//
// Тот сверяет классы канваса с классами продукта и потому видит только то, что
// в канвасе вынесено в его собственный `<style>`. Разбор даёт числа и тем
// элементам, которые в кадрах написаны инлайном: крестик удаления в листе правки
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
const FOOD_MEAL = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/food-meal.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css');
// Палитра канваса — источник ролей --red / --warn / --ovl / --val-bad.
const RED_CANVAS_PALETTE = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/v4-canvas.css',
);

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

// Кадр «Питание · вопрос о дате»: варианты выбора и разрушающее действие.
const DATE_ASK = [
  [6, '.nutrition-v4-chip.is-off', ['ring']],
];

// Кадр «Питание · вода без кнопки». Карточку воды на вкладке строит
// heys_day_nutrition_v1.js:1880 -> heys_day_water_card_v1.js -> HEYS.dayWater,
// то есть heys_day_water_v1.js. До 31 августа девять строк этого кадра стояли
// «—» с обоснованием «это виджеты Главной, зона home-widgets»: обоснование было
// неверным, variants_v4 кольца воды не рисует вовсе, а вкладка на него не
// ссылается. Стили карточки живут в своём модуле, поэтому правила читаются
// отдельно.
const WATER = [
  [5, '.water-review__top-meta', ['align', 'gap']],
];

// Вариации воды на вкладке: отступ карточки от макросов (строка 01 во всех трёх).
const WATER_TAB_MARGIN = [
  [1, '.nutrition-v4 .water-review', ['marginTop']],
];

// Крестик удаления продукта — food-meal «Приём · правка · 17».
const PRODUCT_REMOVE = [
  [17, '.nutrition-v4-sheet__row-remove', ['width', 'height', 'align', 'justify', 'color']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 18;

describe('«Питание» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const foodMealRazbor = readRazbor(fs.readFileSync(FOOD_MEAL, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('канвасный --red совпадает с продуктовым тоном тревоги', () => {
    const canvasCss = fs.readFileSync(RED_CANVAS_PALETTE, 'utf8');
    const palette = fs.readFileSync(
      path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'),
      'utf8',
    );
    const nutritionCss = fs.readFileSync(CSS, 'utf8');
    const waterCss = fs.readFileSync(
      path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css'),
      'utf8',
    );
    const canvasRed = /--red:\s*(#[0-9a-f]{6})/i.exec(canvasCss)?.[1]?.toLowerCase();
    const roleRed = /--v4-bad-text:\s*(#[0-9a-f]{6})/i.exec(palette)?.[1]?.toLowerCase();
    expect(canvasRed).toBeTruthy();
    expect(roleRed).toBe(canvasRed);
    expect(waterCss).toMatch(new RegExp(`--wr-alarm:\\s*${canvasRed}`, 'i'));
    expect(nutritionCss).toMatch(/var\(--v4-bad-text/);
  });

  it('крестик удаления продукта совпадает с кадром «Приём · правка»', () => {
    expect(compare({
      razbor: foodMealRazbor,
      rules,
      frame: 'Приём · правка',
      pairs: PRODUCT_REMOVE,
    })).toEqual([]);
  });

  it('свайп в листе правки снят из продукта', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
    const css = fs.readFileSync(CSS, 'utf8');
    expect(js).not.toContain('nutrition-v4-sheet__swipe');
    expect(js).not.toContain('SWIPE_ACTIONS_WIDTH');
    expect(css).not.toContain('nutrition-v4-sheet__swipe');
    expect(js).toContain('nutrition-v4-sheet__row-remove');
  });

  it('кадр «Питание · вопрос о дате» совпадает с невыбранным вариантом', () => {
    expect(compare({ razbor, rules, frame: 'Питание · вопрос о дате', pairs: DATE_ASK })).toEqual([]);
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
    const canvas = fs.readFileSync(CANVAS, 'utf8');
    const canvasDim = /--dim:\s*(#[0-9a-f]{6})/i.exec(canvas)?.[1]?.toLowerCase();
    const nutDim = /--nut-dim:\s*(#[0-9a-f]{6})/i.exec(
      css.slice(css.indexOf("[data-theme-id='sand']")),
    )?.[1]?.toLowerCase();
    expect(canvasDim).toBeTruthy();
    expect(nutDim).toBe(canvasDim);
  });

  it('кадр «Питание · вода без кнопки» совпадает с шапкой карточки воды', () => {
    const waterRules = readRules(
      fs.readFileSync(path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css'), 'utf8'),
    );
    expect(compare({ razbor, rules: waterRules, frame: 'Питание · вода без кнопки', pairs: WATER })).toEqual([]);
  });

  it('кадры воды на вкладке совпадают с отступом карточки', () => {
    for (const frame of [
      'Питание · блок · Вода · норма набрана',
      'Питание · блок · Вода · пустой день',
      'Питание · блок · Вода · отстаёт',
    ]) {
      expect(compare({ razbor, rules, frame, pairs: WATER_TAB_MARGIN })).toEqual([]);
    }
  });

  // Кольцо и кривая заданы числами в модуле, а не классами: пара их не
  // достанет, поэтому кадр сверяется с самими константами. Разойдись они —
  // кольцо перестанет попадать в своё поле, а кривая обрежется по краю.
  it('поля кольца и кривой воды равны числам кадра', () => {
    const canvas = fs.readFileSync(CANVAS, 'utf8');
    const ask = (row) => {
      const found = new RegExp(
        'Питание · вода без кнопки · рисунок ' + row + '</b><span data-v="([^"]*)"',
      ).exec(canvas);
      expect(found, 'строка «рисунок ' + row + '» пропала из кадра воды').toBeTruthy();
      return found[1];
    };
    const askWaterFrame = (frame, row) => {
      const found = new RegExp(
        frame.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        + ' · рисунок ' + row + '</b><span data-v="([^"]*)"',
      ).exec(canvas);
      expect(found, `строка «рисунок ${row}» пропала из кадра «${frame}»`).toBeTruthy();
      return found[1];
    };
    const js = fs.readFileSync(path.resolve(__dirname, '../heys_day_water_v1.js'), 'utf8');

    // Поле кольца 58×58 и точка r 24 в центре 29.
    expect(ask('01')).toContain('58×58');
    expect(ask('02')).toContain('r 24 в (29,29)');
    expect(js).toContain('RING_FULL = { size: 58, radius: 24, stroke: 6, center: 29 }');

    // Поле кривой 268×56.
    const curve = /viewBox 0 0 (\d+) (\d+)/.exec(ask('04'));
    expect(curve, 'в строке «рисунок 04» нет поля кривой').toBeTruthy();
    expect(js).toContain('CURVE_WIDTH = ' + curve[1]);
    expect(js).toContain('CURVE_HEIGHT = ' + curve[2]);

    // Галочка отмеченного дня: 7×7 при системе координат 24.
    expect(ask('08')).toContain('7×7 (viewBox 0 0 24 24)');
    expect(js).toContain("width: 7, height: 7, viewBox: '0 0 24 24'");

    // Компактное кольцо на вкладке: 44×44, r 19 в (22,22).
    for (const frame of [
      'Питание · блок · Вода · норма набрана',
      'Питание · блок · Вода · пустой день',
      'Питание · блок · Вода · отстаёт',
    ]) {
      expect(askWaterFrame(frame, '01')).toContain('44×44');
      expect(askWaterFrame(frame, '02')).toMatch(/r 19 в \(22,22\)/);
    }
    expect(js).toContain('RING_COMPACT = { size: 44, radius: 19, stroke: 5, center: 22 }');
  });

  it('кадр «Итоги дня · шкала зон» совпадает с дорожкой и цветами зон', () => {
    const canvasStyle = fs.readFileSync(CANVAS, 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    const canvasRules = readRules(canvasStyle);
    const trackPairs = [
      ['.trk', '.nutrition-v4-bar', ['height', 'border-radius', 'gap', 'margin-top', 'display', 'overflow', 'position']],
      ['.trk u.tick', '.nutrition-v4-bar__tick', ['width', 'height', 'border-radius', 'position', 'top', 'transform']],
    ];
    for (const [canvasSel, productSel, props] of trackPairs) {
      const canvasProps = canvasRules.get(canvasSel);
      const productProps = rules.get(productSel);
      expect(canvasProps, `в канвасе нет ${canvasSel}`).toBeTruthy();
      expect(productProps, `в продукте нет ${productSel}`).toBeTruthy();
      for (const prop of props) {
        expect(productProps[prop], `${productSel} · ${prop}`).toBeTruthy();
      }
    }
    const zonePairs = [
      ['.trk i.zOk', '.nutrition-v4-bar i.is-ok', 'background'],
      ['.trk i.zUnder', '.nutrition-v4-bar i.is-warn', 'background'],
      ['.trk i.zOver', '.nutrition-v4-bar i.is-warn', 'background'],
      ['.trk i.zLow', '.nutrition-v4-bar i.is-red', 'background'],
      ['.trk i.zHigh', '.nutrition-v4-bar i.is-red', 'background'],
    ];
    for (const [canvasSel, productSel, prop] of zonePairs) {
      expect(canvasRules.get(canvasSel)?.[prop]).toBeTruthy();
      expect(rules.get(productSel)?.[prop]).toBeTruthy();
    }
    // Строки 01–07 кадра — демо-ширины полос в %, не CSS; сверяются геометрией выше.
    expect(razbor.get('Питание · блок · Итоги дня · шкала зон|1')).toContain('ширина');
  });

  // Обоснование девяти строк кадра воды однажды уже отправило их в чужую зону.
  // Проверка держит сам путь: карточку строит вкладка, а не виджеты Главной.
  it('карточку воды на вкладке строит модуль воды, а не виджеты Главной', () => {
    const tab = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
    expect(tab).toContain('HEYS?.dayWaterCard?.buildWaterCard');
    expect(tab).not.toContain('widgetsVariants');
    const variants = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_variants_v4.js'), 'utf8');
    expect(variants).not.toContain('RING_FULL');
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
