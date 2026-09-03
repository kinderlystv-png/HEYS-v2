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
// Палитра канваса — источник ролей --red / --warn / --ovl / --val-bad.
const RED_CANVAS_PALETTE = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/v4-canvas.css',
);

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

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 20;

describe('«Питание» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  // Отступление, названное поимённо · 3 сентября. Роль --v4-bad-text
  // (продуктовая копия канвасного --red) углублена с #b4442a до #a83c22 по
  // решению дизайнера: на --v4-hero прежний тон давал 4,36 при 11 px/600, стало
  // 4,97. Канвас с новым значением приезжает отдельным пакетом, и до его
  // прихода код опережает кадр ровно на этот один тон — в трёх местах зоны:
  // число героя и заливка перебора в кадре «зона красная», необратимое действие
  // свайпа в кадре «лист правки приёма».
  //
  // Исключение снимает себя само: как только пакет приедет, `canvasRed` станет
  // #a83c22, ветка ниже потребует полного совпадения, и блок можно будет
  // удалить. Пока канвас держит третье значение — это уже другое расхождение, и
  // проверка падает.
  const RED_SHIFT = 'кадр: #b4442a · код: #a83c22';
  const canvasRed = (() => {
    const src = fs.readFileSync(RED_CANVAS_PALETTE, 'utf8');
    const found = /--red:\s*(#[0-9a-f]{6})/i.exec(src);
    expect(found, 'канвасная роль --red не найдена').toBeTruthy();
    return found[1].toLowerCase();
  })();

  function withoutRedShift(diff, expectedCount) {
    if (canvasRed === '#a83c22') return diff; // пакет приехал — отступления нет
    expect(canvasRed, 'канвас держит третье значение — это уже не то отступление').toBe('#b4442a');
    const rest = diff.filter(entry => !String(entry).includes(RED_SHIFT));
    expect(diff.length - rest.length, 'число мест отступления не сходится').toBe(expectedCount);
    return rest;
  }

  it('кадр «Питание · лист правки приёма» совпадает с действиями свайпа', () => {
    const diff = compare({ razbor, rules, frame: 'Питание · лист правки приёма', pairs: SWIPE });
    expect(withoutRedShift(diff, 1)).toEqual([]);
  });

  it('кадр «Питание · вопрос о дате» совпадает с невыбранным вариантом', () => {
    expect(compare({ razbor, rules, frame: 'Питание · вопрос о дате', pairs: DATE_ASK })).toEqual([]);
  });

  // Сдвиг свайпа живёт числом в разметке, а не в CSS: пара его не достанет,
  // поэтому строка разбора сверяется с самой константой. Разойдись они —
  // действия из-под строки выглянут наполовину или спрячутся за край.
  it('сдвиг свайпа в листе равен ширине ряда действий из кадра', () => {
    const row = razbor.get('Питание · лист правки приёма|11');
    expect(row, 'строка 11 кадра «лист правки приёма» пропала из разбора').toBeTruthy();
    const shift = /translateX\(-(\d+)px\)/.exec(String(row));
    expect(shift, 'в строке разбора нет сдвига translateX').toBeTruthy();
    const js = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
    expect(js).toContain('SWIPE_ACTIONS_WIDTH = ' + shift[1]);
  });

  it('кадры зон совпадают с тоном числа и заливкой перебора', () => {
    expect(compare({ razbor, rules, frame: 'Питание · зона предупреждения', pairs: ZONE_WARN })).toEqual([]);
    const redDiff = compare({ razbor, rules, frame: 'Питание · зона красная', pairs: ZONE_RED });
    expect(withoutRedShift(redDiff, 2)).toEqual([]);
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

  it('кадр «Питание · вода без кнопки» совпадает с шапкой карточки воды', () => {
    const waterRules = readRules(
      fs.readFileSync(path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css'), 'utf8'),
    );
    expect(compare({ razbor, rules: waterRules, frame: 'Питание · вода без кнопки', pairs: WATER })).toEqual([]);
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
