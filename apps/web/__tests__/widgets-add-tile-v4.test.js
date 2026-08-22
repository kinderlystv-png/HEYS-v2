// Плитка добавления — раздел контракта «Плитка добавления» (22 августа).
//
// Она не виджет: в дефолт, в сброс и в потолок одиннадцати плиток не считается.
// Но живёт в сетке всегда, в обычном режиме тоже, и её ширина зависит от того,
// сколько клеток осталось в последнем ряду. Живьём это не поймать: нужно
// перебрать раскладки с разным хвостом, включая полностью занятый ряд.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

/** Достаём чистую функцию из исходника — она не экспортируется наружу. */
function loadAddTileSpan() {
  const start = UI_SRC.indexOf('function addTileSpan(');
  const end = UI_SRC.indexOf('function RecommendedScreenBlock', start);
  expect(start).toBeGreaterThan(-1);
  const body = UI_SRC.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return addTileSpan;`)();
}

const tile = (col, row, cols, rows = 1) => ({ position: { col, row }, cols, rows });

describe('плитка добавления · ширина по хвосту последнего ряда', () => {
  const addTileSpan = loadAddTileSpan();

  it('пустая раскладка — две колонки', () => {
    expect(addTileSpan([], 4)).toBe(2);
  });

  it('хвост в две клетки — две колонки', () => {
    // Последний ряд: одна плитка 2×1, свободно две клетки.
    expect(addTileSpan([tile(0, 0, 2)], 4)).toBe(2);
  });

  it('хвост в три клетки — всё равно две колонки, шире не бывает', () => {
    expect(addTileSpan([tile(0, 0, 1)], 4)).toBe(2);
  });

  it('хвост в одну клетку — одна колонка', () => {
    expect(addTileSpan([tile(0, 0, 3)], 4)).toBe(1);
  });

  it('последний ряд занят целиком — новый ряд на две колонки', () => {
    // Две клетки справа остаются пустыми: это конец сетки, а не дырка.
    expect(addTileSpan([tile(0, 0, 4)], 4)).toBe(2);
  });

  it('плитка высотой в два ряда считается занятой и в последнем из них', () => {
    // 3×2 стоит в рядах 0–1; в ряду 1 свободна одна клетка.
    expect(addTileSpan([tile(0, 0, 3, 2)], 4)).toBe(1);
  });

  it('считается только последний ряд, а не вся сетка', () => {
    expect(addTileSpan([tile(0, 0, 4), tile(0, 1, 2)], 4)).toBe(2);
  });
});

describe('плитка добавления · правила показа', () => {
  it('стоит в сетке всегда, а не только в расстановке', () => {
    const at = UI_SRC.indexOf("className: 'widget-v4-add");
    expect(at).toBeGreaterThan(-1);
    // Кусок перед кнопкой не должен вешать её на isEditMode.
    const head = UI_SRC.slice(at - 700, at);
    const call = head.slice(head.lastIndexOf('React.createElement'));
    expect(call).not.toContain('isEditMode &&');
  });

  it('в одну колонку слово не рисуется, знак крупнее', () => {
    const at = UI_SRC.indexOf("className: 'widget-v4-add");
    const block = UI_SRC.slice(at, at + 1200);
    expect(block).toContain('addTileSpanValue === 1 ? 18 : 14');
    expect(block).toContain("addTileSpanValue === 1 ? null : React.createElement('span', null, 'Добавить')");
  });

  it('нажатие открывает каталог, не включая расстановку', () => {
    const at = UI_SRC.indexOf("className: 'widget-v4-add");
    const block = UI_SRC.slice(at, at + 1200);
    expect(block).toContain('setCatalogOpen((open) => !open)');
    expect(block).not.toContain('enterEditMode');
    // Каталог рисуется и вне расстановки, иначе нажатие ничего не покажет.
    expect(UI_SRC).toContain('catalogOpen && React.createElement(CatalogStrip, {');
    expect(UI_SRC).not.toContain('isEditMode && catalogOpen && React.createElement(CatalogStrip');
  });

  it('в дефолтный набор и в потолок одиннадцати не входит', () => {
    const core = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
    const block = core.slice(core.indexOf('const DEFAULT_LAYOUT = ['), core.indexOf('\n  ];', core.indexOf('const DEFAULT_LAYOUT = [')));
    expect(block).not.toContain('widget-v4-add');
    expect((block.match(/type: '/g) || []).length).toBe(11);
  });
});
