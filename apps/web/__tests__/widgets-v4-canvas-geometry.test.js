// Геометрия виджетов Главной против кадров data-demo="stop" канваса
// home-widgets.v4.dc.html на 375 px.
//
// Тот же приём, что у вкладки «Питание»: канвас держит геометрию в классах
// своего <style>, поэтому сверяем пары «класс кадра → класс продукта» числами,
// а не глазами. Тест читает сам канвас, поэтому расхождение всплывает при
// правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');

function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2].trim();
    for (const selector of match[1].split(',')) {
      const key = selector.trim();
      if (!rules.has(key)) rules.set(key, []);
      rules.get(key).push(body);
    }
  }
  return rules;
}

// Канвас пишет шрифт шорткатом `font: 600 9px/1.1 Figtree`, продуктовый CSS —
// раскладкой. Приводим обе формы к одному виду.
function declarations(bodies) {
  const out = {};
  for (const body of bodies || []) {
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const prop = decl.slice(0, at).trim();
      const value = decl.slice(at + 1).trim();
      if (prop === 'font') {
        const font = /^(\d+)\s+([\d.]+)px\/([\d.]+)/.exec(value);
        if (font) {
          out['font-weight'] = font[1];
          out['font-size'] = `${font[2]}px`;
          out['line-height'] = font[3];
          continue;
        }
      }
      out[prop] = value;
    }
  }
  return out;
}

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    // Кадр использует имена ролей канваса, а продукт — свои --v4-* роли с
    // песочным fallback. Для геометрического теста сравниваем вычисленный
    // песочный цвет; наличие продуктовой роли отдельно охраняет ui:v4:check.
    .replace(/var\(--c1\)/g, '#f7efe2')
    .replace(/var\(--bg\)/g, '#fffaf1')
    .replace(/var\(--tx\)/g, '#201e1d')
    .replace(/rgba\(var\(--ink\),\s*\.45\)/g, 'rgba(0,0,0,.45)')
    .replace(/rgba\(var\(--ink\),\s*\.35\)/g, 'rgba(0,0,0,.35)')
    .replace(/rgba\(var\(--ink\),\s*\.04\)/g, 'rgba(0,0,0,.04)')
    .replace(/rgba\(var\(--shadow\),\s*\.22\)/g, 'rgba(80,50,20,.22)')
    // Продукт пишет кегль rem для системного масштаба — сверяем с px канваса.
    .replace(/([\d.]+)rem/g, (_, n) => `${parseFloat(n) * 16}px`)
    // Канвас пишет цвет хексом, продукт — ролью с запасным значением.
    // Сверяем по запасному: за самими ролями следит ui:v4:check.
    .replace(/var\(--[a-z0-9-]+\s*,\s*([^)]+)\)/gi, '$1')
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .replace(/,\s*/g, ',')
    .toLowerCase();
}

// Пара может собирать несколько продуктовых правил: часть свойств плитки живёт
// в базовом `.widget`, часть — в v4-слое Главной. Браузер видит их вместе.
const PAIRS = [
  // Плитка и её типографика
  ['.w', ['.widget', 'body:has(.widgets-tab) .widget']],
  ['.k', '.widget-v4-kicker'],
  ['.v', '.widget-v4-mini__value'],
  ['.u', '.widget-v4-unit'],
  // Вход в расстановку кадром не сводится: дизайнер подтвердил, что строка
  // «Изменить экран» была ошибкой контракта, вход — кнопка настройки экрана.
  // Пара ['.editRow > span', '.widgets-tab__edit-btn'] снята вместе с мёртвым
  // продуктовым CSS этой строки.
  // Лист смены вида
  ['.sheet', '.widget-wd-sheet'],
  ['.sh1', '.widget-wd-sheet__title'],
  ['.sh2', '.widget-wd-sheet__subtitle'],
  ['.opt', '.widget-wd-sheet__opt'],
  ['.scrim', '.widget-wd-sheet__scrim'],
];

const CHECKED = [
  'padding', 'border-radius', 'gap', 'height', 'min-height',
  'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'background', 'color', 'align-items', 'justify-content', 'flex-direction',
  'box-shadow', 'backdrop-filter',
];

// Осознанные отступления: у каждого — строка контракта или инвариант продукта,
// который старше кадра.
const EXCEPTIONS = new Set([
  // Строка контракта 8: «паддинг сетки 16 px, от ширины не зависит». Кадр
  // рисует экран с 14 px сверху — это паддинг всего экрана, а не сетки.
  'body:has(.widgets-tab) .widgets-grid|padding',
  // Инвариант product-модалок (CLAUDE.md): блюр подложки — 2.5 px из токена
  // --v4-modal-backdrop-blur. Канвас рисует 2 px.
  '.widget-wd-sheet__scrim|backdrop-filter',
  // Тот же инвариант: dim берётся из --v4-modal-backdrop-dim (0.45), канвас
  // рисует 0.42.
  '.widget-wd-sheet__scrim|background',
  // Цвет этих трёх нейтральных подписей теперь задаёт семантическая роль
  // --v4-ink-data. Её точное значение против строки «лестница чернил» сверяет
  // widgets-v4-ink-ladder-contract.test.js; этот геометрический гейт не умеет
  // разворачивать роль, которая объявлена через --v4-ink-rgb.
  '.widget-v4-kicker|color',
  '.widget-v4-unit|color',
  '.widget-wd-sheet__subtitle|color',
]);

// Сколько клеток «пара × свойство» гейт реально сверяет. Свойство читается,
// только если стоит в правиле класса канваса: если разбор кадра написан
// инлайном, `if (!(prop in want)) continue` молча пропускает его. Число
// заморожено — падение значит потерю пары или правила, рост просит поднять.
// Три проверки цвета переданы точному владельцу семантической лестницы чернил
// (widgets-v4-ink-ladder-contract.test.js), поэтому геометрический охват — 28.
const COVERAGE_FLOOR = 28;

// Свойства, которых нет ни в одном правиле класса канваса: гейт не читает их
// ни разу. Раскладка и высоты виджетов размечены инлайном в кадрах, поэтому
// на этот гейт нельзя ссылаться по строю ряда и по высоте плитки — он их не
// видит. Список именно проверяется: если появится пара с этими свойствами,
// тест попросит его сократить.
const BLIND_PROPS = ['align-items', 'gap', 'height', 'justify-content', 'min-height'];

describe('геометрия виджетов Главной против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));

  const chainOf = (productSel) => (Array.isArray(productSel) ? productSel : [productSel]);
  const nameOf = (productSel) => chainOf(productSel)[chainOf(productSel).length - 1];

  it('каждый класс кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || chainOf(m).some((sel) => !product.has(sel)));
    expect(orphans).toEqual([]);
  });

  it('числа совпадают с кадрами', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      const got = declarations(chainOf(productSel).flatMap((sel) => product.get(sel) || []));
      const label = nameOf(productSel);
      for (const prop of CHECKED) {
        if (!(prop in want)) continue;
        if (EXCEPTIONS.has(`${label}|${prop}`)) continue;
        const expected = normalize(want[prop]);
        const actual = prop in got ? normalize(got[prop]) : '— нет —';
        if (expected !== actual) {
          drift.push(`${label} { ${prop} } — кадр: ${expected}, код: ${actual}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('сетка держит формулу контракта: 4 колонки, ряд 64, зазор 8', () => {
    // Канвас задаёт это числами в `.g`, продукт — переменными набора, поэтому
    // сравниваем значения переменных, а не текст правила.
    const grid = declarations(canvas.get('.g'));
    expect(grid['grid-auto-rows']).toBe('64px');
    expect(grid.gap).toBe('8px');
    expect(grid['grid-template-columns']).toBe('repeat(4,1fr)');

    const root = declarations(product.get(':root'));
    expect(root['--widget-row-height']).toBe('64px');
    expect(root['--widget-grid-gap']).toBe('8px');
    expect(root['--widget-grid-columns']).toBe('4');
  });

  it('паддинг сетки — 14 px сверху и 16 px по бокам/снизу', () => {
    const gridRule = declarations(product.get('body:has(.widgets-tab) .widgets-grid'));
    expect(gridRule.padding).toBe('14px 16px 16px');
    expect(gridRule['max-width']).toBe('480px');

    // Ни одна медиа-ширина не переопределяет зазор и высоту ряда:
    // одно значение на все экраны (строка контракта 11).
    const css = fs.readFileSync(CSS, 'utf8');
    const overrides = [...css.matchAll(/--widget-grid-gap:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(new Set(overrides)).toEqual(new Set(['8px']));
  });

  it('однозначные мини-графики совпадают с новой строкой вида', () => {
    const css = fs.readFileSync(CSS, 'utf8');

    expect(css).toMatch(/\.widget-v4-stepbars \{[\s\S]*?height:\s*30px/);
    expect(css).toMatch(/\.widget-v4-stepbars--month \{[\s\S]*?height:\s*30px/);
    expect(css).toMatch(/\.widget-v4-stepbars__bar \{[\s\S]*?background:\s*#b7c29b/);
    expect(css).toMatch(/\.widget-v4-stepbars__bar\.is-goal \{[\s\S]*?background:\s*var\(--v4-ok-fill, #7a8a5e\)/);

    expect(css).toMatch(/\.widget-v4-heat__bar--d1 \{[\s\S]*?background:\s*var\(--v4-line/);
    expect(css).toMatch(/\.widget-v4-heat__bar--d2 \{[\s\S]*?background:\s*var\(--v4-wave-overlap/);
    expect(css).toMatch(/\.widget-v4-heat__bar--d3 \{[\s\S]*?background:\s*var\(--v4-ok-fill/);
    expect(css).not.toContain('[data-theme$="dark"] .widget-v4-heat__bar--d1');

    expect(css).toMatch(/\.widget-v4-mini\.widget-v4-fiber \.widget-v4-goal-value,[\s\S]*?\.widget-v4-mini\.widget-v4-protein \.widget-v4-goal-value \{[\s\S]*?font-size:\s*21px/);
  });

  it('содержимое дефолтной сетки держит однозначные графические контракты Canvas', () => {
    const ui = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_ui_v1.js'), 'utf8');

    expect(ui).toContain("`Тренд здоровья · ${formatRuUnit(periodDays, 'дней')}`");
    expect(ui).toContain('compactSparkPoints ? React.createElement');
    expect(ui).toContain('points: compactSparkPoints');
    expect(ui).not.toContain("compactSpark.points || '2,18 11,16 20,17 29,12 38,9 47,6 56,4'");
    expect(ui).toContain('strokeWidth: compactSpark.strokeWidth || 2.5');
    expect(ui).toContain("className: 'widget-v4-macro__num-sign' }, '−'");
    expect(ui).toContain("day?.status === 'green' || day?.status === 'good' || day?.status === 'ok'");
    expect(ui).toContain("data?.emptyReason === 'insufficient_history'");
    expect(ui).toContain("v4EmptyTile('Первые дни', 'нужна неделя')");
    expect(ui).toContain("v4EmptyTile('Динамика веса', 'данные недоступны')");
  });

  it('вес 2×2 держит герой 26px и спарклайн 38px', () => {
    const heroVal = declarations(product.get('.widget-v4-hero-num__val'));
    expect(normalize(heroVal['font-size'])).toBe('26px');
    expect(heroVal['font-weight']).toBe('600');
    expect(heroVal['line-height']).toBe('1');

    const delta = declarations(
      (product.get('.widget-v4-delta.widget-v4-val--good') || [])
        .concat(product.get('.widget-v4-delta') || []),
    );
    expect(delta['margin-top']).toBe('7px');

    const ui = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_ui_v1.js'), 'utf8');
    const css = fs.readFileSync(CSS, 'utf8');
    expect(ui).toContain("viewBox = '0 0 130 38'");
    expect(ui).toContain('height = 38');
    expect(ui).toContain('widget-v4-mini__value--pair');
    expect(css).toMatch(/\.widget-weight--2x2 \.widget-v4-row__meta[\s\S]*?font-size:\s*10px/);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(6);
  });

  it('гейт называет свой охват', () => {
    let compared = 0;
    let skipped = 0;
    const blind = new Map();
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      for (const prop of CHECKED) {
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        if (prop in want) compared += 1;
        else {
          skipped += 1;
          blind.set(prop, (blind.get(prop) || 0) + 1);
        }
      }
    }
    const never = [...blind.entries()]
      .filter(([, n]) => n === PAIRS.length)
      .map(([prop]) => prop)
      .sort();
    console.info(
      `[виджеты] сверено ${compared} из ${compared + skipped} клеток `
      + `(${((compared / (compared + skipped)) * 100).toFixed(1)} %), пар ${PAIRS.length}; `
      + `не читается ни в одной паре: ${never.length ? never.join(', ') : 'нет'}`,
    );
    expect(never).toEqual(BLIND_PROPS);
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (compared > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${compared} клеток вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});

// Линия тренда здоровья: канвас держит её не классом, а готовой полилинией
// внутри кадра, поэтому пара строится иначе — от значений к точкам.
// Продукт отдаёт оценки, вид проецирует их в свою коробку; проверяем, что
// коробка воспроизводит полилинию кадра ровно, а не «примерно».
describe('линия тренда здоровья: значения продукта против полилинии кадра', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const ui = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_ui_v1.js'), 'utf8');
  const capture = fs.readFileSync(
    path.resolve(__dirname, '../scripts/ui-v4-visual-capture.mjs'),
    'utf8',
  );

  function boxFromSource(name) {
    const body = new RegExp(`const ${name} = \{([^}]*)\}`).exec(ui)?.[1];
    if (!body) return null;
    const box = {};
    for (const [, key, value] of body.matchAll(/(\w+):\s*(-?[\d.]+)/g)) box[key] = Number(value);
    return box;
  }

  function project(values, box) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const round = (n) => Math.round(n * 100) / 100;
    return values
      .map((value, index) => [
        round(box.left + ((box.right - box.left) * index) / (values.length - 1)),
        round(box.bottom - (box.bottom - box.top) * ((value - min) / span)),
      ])
      .map((point) => point.join(','))
      .join(' ');
  }

  it('коробка 2×1 повторяет полилинию кадра из значений стенда', () => {
    // Кадр «Тренд здоровья · рост» — канонический для состояния роста с
    // 3 сентября. Привязка по метке кадра, а не по подписи внутри него:
    // подпись переехала с «7 дней» на «14 дней» вместе с пакетом, и тест
    // сломался на переименовании, а не на геометрии.
    const growth = canvas.slice(canvas.indexOf('data-screen-label="Тренд здоровья · рост"'));
    const framePoints = /<polyline points="([^"]+)"[^>]*stroke-width="2\.5"/.exec(growth)?.[1];
    expect(framePoints, 'полилиния тренда найдена в кадре').toBeTruthy();

    const values = JSON.parse(
      /sparkline: \{ values: (\[[^\]]*\])/.exec(capture)[1],
    );
    expect(values).toHaveLength(7);

    const box = boxFromSource('HEALTH_SPARK_BOX_COMPACT');
    expect(box, 'коробка 2×1 объявлена в продукте').toBeTruthy();
    expect(project(values, box)).toBe(framePoints);
  });

  it('точка последнего дня — радиус кадра', () => {
    const growth = canvas.slice(canvas.indexOf('data-screen-label="Тренд здоровья · рост"'));
    const frameCircle = /<circle cx="56" cy="4" r="(\d+(?:\.\d+)?)"/.exec(growth)?.[1];
    expect(Number(frameCircle)).toBe(boxFromSource('HEALTH_SPARK_BOX_COMPACT').dotR);
    // Строка «вид · тренд здоровья»: у 2×2 точка радиусом 3,5.
    expect(boxFromSource('HEALTH_SPARK_BOX_LARGE').dotR).toBe(3.5);
  });

  it('продукт отдаёт оценки, а не готовые точки', () => {
    const data = fs.readFileSync(path.resolve(__dirname, '../widgets/widget_data.js'), 'utf8');
    expect(data).toContain('const sparkline = values.length >= 2 ? { values } : null;');
    // Заготовка точек мимо продукта вернула бы стенд к зелёному свету при
    // мёртвом рабочем пути — так эта линия и прожила незамеченной.
    expect(capture).not.toContain("points: '2,18 11,16");
  });
});
