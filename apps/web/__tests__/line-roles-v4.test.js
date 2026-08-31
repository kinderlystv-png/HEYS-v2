// Три роли линии v4 против строки контракта «роли линий · правило продукта»
// (home-widgets.v4.dc.html).
//
// Контракт говорит ровно три вещи: ролей на линию три, у каждой свой токен со
// своим процентом чернил, и в продуктовом коде линия задаётся именем токена —
// процентов там нет. Проценты читаются из самого канваса, поэтому расхождение
// всплывает при правке любой из сторон: и когда дизайнер меняет строку, и
// когда линию в продукте снова набирают литералом.
import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const MODULES = path.resolve(__dirname, '../styles/modules');
const PALETTE = path.join(MODULES, '002-ui-v4-palette-roles.css');

// Четыре набора палитры: каноничной больше нет, оговорок «кроме классики» тоже.
const PALETTES = ['sand', 'sand-dark', 'blue', 'blue-dark'];

/** Проценты чернил из строки контракта, а не из этого файла. */
function contractPercents() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  const row = /<b>роли линий · правило продукта<\/b><span data-v="([^"]*)"/.exec(html);
  if (!row) throw new Error('в канвасе нет строки «роли линий · правило продукта»');
  const out = new Map();
  for (const m of row[1].matchAll(/--v4-(line|track|edge)\s*—[^;.]*?чернила\s*(\d+)\s*%/g)) {
    out.set(`--v4-${m[1]}`, Number(m[2]) / 100);
  }
  return out;
}

function paletteBlocks() {
  const root = postcss.parse(fs.readFileSync(PALETTE, 'utf8'), { from: PALETTE });
  const blocks = new Map();
  root.walkRules((rule) => {
    for (const id of PALETTES) {
      if (!rule.selector.includes(`[data-theme-id="${id}"]`)) continue;
      const decls = blocks.get(id) || new Map();
      rule.walkDecls((decl) => decls.set(decl.prop, decl.value.trim()));
      blocks.set(id, decls);
    }
  });
  return blocks;
}

function rgba(value) {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  if (!m) return null;
  return { ink: `${m[1]}, ${m[2]}, ${m[3]}`, alpha: Number(m[4]) };
}

describe('роли линии v4 объявлены во всех четырёх наборах', () => {
  const percents = contractPercents();
  const blocks = paletteBlocks();

  it('контракт называет ровно три роли', () => {
    expect([...percents.keys()].sort()).toEqual(['--v4-edge', '--v4-line', '--v4-track']);
  });

  for (const id of PALETTES) {
    for (const [role, alpha] of percents) {
      it(`${id}: ${role} — чернила ${alpha * 100} %`, () => {
        const decls = blocks.get(id);
        expect(decls, `набор ${id} не найден в палитре`).toBeTruthy();
        const parsed = rgba(decls.get(role) || '');
        expect(parsed, `${role} не объявлена в наборе ${id} или задана не rgba()`).toBeTruthy();
        expect(parsed.alpha).toBe(alpha);
        // Чернила набора берутся оттуда же, откуда их берут соседние роли,
        // иначе линия молча перестаёт следовать набору.
        const neighbour = rgba(decls.get('--v4-ink-30') || '');
        expect(parsed.ink).toBe(neighbour.ink);
      });
    }
  }
});

// Продуктовые файлы, сведённые с канвасом v4. В 730 канвасу принадлежат только
// правила виджетов — остальной файл легаси и под контракт не заводился.
const SWEPT = [
  '731-ui-v4-activity.css',
  '732-ui-v4-nutrition.css',
  '733-ui-v4-reports.css',
  '734-ui-v4-insights.css',
  '730-widgets-dashboard.css',
];

const LINE_PROPS =
  /^(border|border-[a-z-]*|outline|outline-color|background|background-color|stroke|fill|box-shadow)$/;
const INK_LITERAL =
  /color-mix\([^;]*var\(--v4-(?:ink|sand-ink)[^;]*?\)\s*(\d+)%|rgba\(\s*(?:0,\s*0,\s*0|32,\s*30,\s*29|15,\s*23,\s*42|16,\s*24,\s*38|242,\s*237,\s*230|238,\s*243,\s*248)\s*,\s*(0?\.\d+)\s*\)/;

// Поимённые исключения: линия, заданная процентом чернил напрямую, потому что
// её процент ни одной из трёх ролей не принадлежит. Округлять к ближайшей роли
// нельзя — это меняет рисунок, и решать должен владелец. Формат:
// «файл | селектор | свойство» → процент, зона канваса и строка контракта,
// которая этот процент просит.
// Три места зоны «Отчёты и Инсайты» ушли отсюда 31 августа. Причина у всех
// была одна — «блок песочно-залочен, --v4-line перевернётся в синем тёмном», —
// и она не выдержала проверки: песочный замок держит семейство тона, а не
// значение. --v4-sand-surface и --v4-sand-hero в тёмных наборах становятся
// #23201b и #2f2820, и чёрная линия литералом на них не видна вовсе.
// Прохладный оттенок линии в одном наборе — меньшая беда, чем отсутствующий
// разделитель в двух из четырёх.
const ALLOWED = new Map(
  Object.entries({
    '732-ui-v4-nutrition.css | .nutrition-v4-supplements__pill | border':
      '16 % · nutrition-tab, «цвета» — обводка обычного чипа, роли не имеет',
    // Дорожка прогресса заглушки — не линия-разделитель, а подложка полосы:
    // контракт reports-insights просит под ней чернила 9 %, и роли под этот
    // тон в наборе нет. Прежде обе брали var(--v4-chip), то есть цвет самой
    // карточки заглушки, и дорожки не было видно вовсе — только залитый кусок.
    // Заводить роль ради одного значения значило бы принять решение по
    // палитре побочным эффектом починки заглушки; появится третье-четвёртое
    // место — это будет отдельное решение владельца.
    // Рамка метки планера: кадр даёт inset 1.5px чернил 14 %, а в наборе есть
    // только 8 % (--v4-line), 12 % (--v4-track) и 18 % (--v4-edge). Подменить
    // тон ради роли значит разойтись с кадром на глаз; заводить роль под одно
    // значение — решение по палитре. Прежде здесь стояла --v4-border,
    // объявленная только в тёмных наборах: в светлых всегда рисовалось её
    // запасное, то есть роль не работала вовсе.
    '734-ui-v4-insights.css | .meal-rec-v4__chip | box-shadow':
      '14 % · рамка метки планера, роли под этот тон в наборе нет',
    '733-ui-v4-reports.css | .reports-v4-stub__progress | background':
      '9 % · дорожка заглушки Отчётов, роли под этот тон в наборе нет',
    '734-ui-v4-insights.css | .insights-v4-stub__progress | background':
      '9 % · дорожка заглушки Инсайтов, роли под этот тон в наборе нет',
    '730-widgets-dashboard.css | .widget-v4-insulin-wave__flatline | stroke':
      '14 % · home-widgets, «волна · пустой день»',
    '730-widgets-dashboard.css | .widget-v4-insulin-wave__overnight-stroke | stroke':
      '22 % · home-widgets, «волна · ночная оценка»',
    '730-widgets-dashboard.css | .widget-v4-insulin-wave--overnight .widget-v4-insulin-wave__stroke | stroke':
      '22 % · home-widgets, «волна · ночная оценка»',
    '730-widgets-dashboard.css | .widget-v4-insulin-daybar__seg | background':
      '9 % · пустой сегмент ленты дня, роли не имеет',
    '730-widgets-dashboard.css | .widget-v4-macro-bar-row__track | background':
      '9 % · дорожка макро-полосы, роли не имеет',
    '730-widgets-dashboard.css | .widget-v4-water-rhythm__bin | background':
      '10 % · пустая корзина ритма воды, роли не имеет',
    '730-widgets-dashboard.css | .widget-v4-sleep-window | background':
      '7 % · дорожка окна сна, роли не имеет',
    '730-widgets-dashboard.css | .widget-v4-sleep-window__target | background':
      '13 % · полоса цели поверх дорожки, роли не имеет',
  }),
);

function scanLiteralLines() {
  const found = new Map();
  for (const file of SWEPT) {
    const full = path.join(MODULES, file);
    const root = postcss.parse(fs.readFileSync(full, 'utf8'), { from: full });
    root.walkDecls((decl) => {
      if (!LINE_PROPS.test(decl.prop)) return;
      // Тень — не линия; внутренняя обводка через inset — линия.
      if (decl.prop === 'box-shadow' && !/inset/.test(decl.value)) return;
      // Значение через роль — это и есть искомая форма записи, даже если у
      // роли стоит запасное значение с процентом.
      if (/^var\(\s*--v4-/.test(decl.value.trim())) return;
      if (/\bvar\(\s*--v4-[a-z0-9-]+\s*,/.test(decl.value) && !/color-mix/.test(decl.value)) return;
      const m = INK_LITERAL.exec(decl.value);
      if (!m) return;
      const pct = m[1] ? Number(m[1]) : Number(m[2]) * 100;
      if (pct > 25) return; // плотные заливки — не линия
      const selector = (decl.parent.selector || '').replace(/\s+/g, ' ').trim();
      if (file.startsWith('730') && !selector.includes('widget-v4')) return;
      found.set(`${file} | ${selector} | ${decl.prop}`, `${pct} %`);
    });
  }
  return found;
}

describe('в сведённых с канвасом стилях линия задаётся ролью, не процентом', () => {
  const found = scanLiteralLines();

  it('новых линий литералом не появилось', () => {
    const extra = [...found.keys()].filter((key) => !ALLOWED.has(key));
    expect(extra, `эти линии заданы процентом чернил напрямую:\n${extra.join('\n')}`).toEqual([]);
  });

  it('список исключений не протух', () => {
    const stale = [...ALLOWED.keys()].filter((key) => !found.has(key));
    expect(
      stale,
      `этих мест в коде больше нет — уберите их из списка:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('пилюля группы и линия списка приёмов переведены на роли', () => {
    const css = fs.readFileSync(path.join(MODULES, '732-ui-v4-nutrition.css'), 'utf8');
    const root = postcss.parse(css, { from: '732' });
    const byRule = new Map();
    root.walkRules((rule) => {
      rule.walkDecls((decl) => byRule.set(`${rule.selector} | ${decl.prop}`, decl.value));
    });
    expect(byRule.get('.nutrition-v4-supplements__group-pill | box-shadow')).toContain(
      'var(--v4-edge',
    );
    expect(byRule.get('.nutrition-v4-meal-row | border-bottom')).toContain('var(--v4-line');
    expect(byRule.get('.nutrition-v4-scale i | background')).toContain('var(--v4-track');
  });
});
