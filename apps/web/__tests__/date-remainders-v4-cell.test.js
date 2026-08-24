// Сверка строки контракта date-remainders «вид клетки» (двенадцатая сборка):
// «клетка 42×44 px, радиус 14; число 12,5 px/600 чернилами по центру,
// сегодняшнее — 700 тоном --ac. Точка факта 4 px под числом через 3, тон --gr2;
// выбранный день — заливка --c2. Заливки по доле нормы нет».
//
// Почему вычисленным стилем, а не грепом по CSS. Правило шторки может стоять
// правильно и всё равно проигрывать каскаду: базовые `.date-picker-day.today`
// и `.date-picker-day.selected` лежат ниже по файлу и красят клетку синим
// градиентом legacy-пикера. Грепом это не видно — видно только замером.
//
// Отступления от кадров «Календарь · легенда» названы вслух (контракт старше
// кадра):
//   · кадр рисует радиус 12, число 13 px, точку 5 px и зазор 4 — контракт
//     говорит 14 / 12,5 / 4 / 3;
//   · кадр заливает сегодняшний день терракотовой плашкой — контракт оставляет
//     ему только начертание 700 и тон --ac;
//   · кадр даёт выбранному дню обводку 2 px акцентом — контракт её не просит;
//   · точку кадры красят ролью --val-good (#7a8a5e / #8faa6d / #3e9a6b /
//     #4caf7d), а строка контракта называет --gr2 (#7a8a5e / #8a9a6a /
//     #4f9a78 / #6fbf9a). Совпадают только в песочной. Верна строка.
import fs from 'node:fs';
import path from 'node:path';

import React, { act } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

const CSS_FILES = [
  'styles/modules/002-ui-v4-palette-roles.css',
  'styles/modules/000-base-and-gamification.css',
];

const SETS = ['sand', 'sand-dark', 'blue', 'blue-dark'];
const PALETTE_OF = { sand: 'sand', 'sand-dark': 'sand', blue: 'blue', 'blue-dark': 'blue' };

// Роли канваса по наборам — v4-canvas.css пакета дизайна.
const TX = { sand: '#201e1d', 'sand-dark': '#f2ede6', blue: '#101826', 'blue-dark': '#eef3f8' };
const AC = { sand: '#8a4a20', 'sand-dark': '#e2a468', blue: '#1d5e96', 'blue-dark': '#7fbceb' };
const C1 = { sand: '#f7efe2', 'sand-dark': '#23201b', blue: '#eef3f9', 'blue-dark': '#182a3a' };
const C2 = { sand: '#efe3cf', 'sand-dark': '#2f2820', blue: '#e2ecf6', 'blue-dark': '#1e3448' };
const GR2 = { sand: '#7a8a5e', 'sand-dark': '#8a9a6a', blue: '#4f9a78', 'blue-dark': '#6fbf9a' };

function norm(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  // jsdom отдаёт незалитый фон то как `transparent`, то как `rgba(0, 0, 0, 0)`
  // и то как `initial` — для сверки это одно и то же «без заливки».
  if (raw === 'transparent' || raw === 'initial' || raw === 'rgba(0, 0, 0, 0)') return 'none';
  const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!rgb) return raw;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return '#' + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
}

/** Фон не нарисован ничем: ни цветом, ни градиентом. */
function noGradient(cs) {
  const img = String(cs.backgroundImage || '').trim();
  return img === '' || img === 'none' || img === 'initial';
}

function noFill(cs) {
  return noGradient(cs) && norm(cs.backgroundColor) === 'none';
}

function applySet(id) {
  document.documentElement.setAttribute('data-theme-id', id);
  document.documentElement.setAttribute(
    'data-theme',
    PALETTE_OF[id] + (id.endsWith('dark') ? '-dark' : ''),
  );
}

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

let roots = [];

// Дни августа 2026 с намеренно разной долей нормы: 0,15 · 1,00 · 1,80.
// Если бы заливка по доле нормы жила, эти три клетки разошлись бы по тону.
const ACTIVE_DAYS = new Map([
  ['2026-08-05', { kcal: 300, target: 2000, ratio: 0.15 }],
  ['2026-08-07', { kcal: 2000, target: 2000, ratio: 1 }],
  ['2026-08-12', { kcal: 3600, target: 2000, ratio: 1.8 }],
]);

function openSheet(host) {
  act(() => {
    host
      .querySelector('.date-picker-trigger-lbl')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  return document.querySelector('.date-picker-sheet');
}

function renderSheet(valueISO) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(window.HEYS.DatePicker, {
        valueISO,
        activeDays: ACTIVE_DAYS,
        onSelect: () => {},
      }),
    );
  });
  roots.push({ root, host });
  return { host, sheet: openSheet(host) };
}

function cellByDay(sheet, day) {
  return [...sheet.querySelectorAll('.date-picker-day')].find(
    (el) => (el.querySelector('.day-number') || {}).textContent === day,
  );
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.HEYS = window.HEYS || {};
  loadScript('heys_day_utils.js');
  loadScript('heys_day_pickers.js');

  const style = document.createElement('style');
  style.textContent = CSS_FILES.map((rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8')).join(
    '\n',
  );
  document.head.appendChild(style);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
  applySet('sand');
});

afterEach(() => {
  for (const { root, host } of roots) {
    act(() => root.unmount());
    host.remove();
  }
  roots = [];
  vi.useRealTimers();
});

describe('date-remainders · «вид клетки»', () => {
  it('клетка — 44 px по высоте, семь колонок по ширине, радиус 14', () => {
    const { sheet } = renderSheet('2026-08-21');
    const grid = sheet.querySelector('.date-picker-days');
    const cell = cellByDay(sheet, '18');

    // Ширина 42 не задаётся числом: она выходит из семи колонок 1fr. Сузить
    // сетку до шести колонок ломает саму неделю (строка «нажатие и крупный
    // шрифт»), поэтому охраняется количество колонок, а не пиксели.
    expect(window.getComputedStyle(grid).gridTemplateColumns).toBe('repeat(7, 1fr)');
    expect(window.getComputedStyle(cell).minHeight).toBe('44px');
    expect(window.getComputedStyle(cell).borderRadius).toBe('14px');
  });

  it('число — 12,5 px/600 чернилами по центру', () => {
    const { sheet } = renderSheet('2026-08-21');
    const cell = cellByDay(sheet, '18');
    const cs = window.getComputedStyle(cell);

    expect(window.getComputedStyle(cell.querySelector('.day-number')).fontSize).toBe('12.5px');
    expect(cs.fontWeight).toBe('600');
    expect(cs.alignItems).toBe('center');
    expect(cs.justifyContent).toBe('center');
  });

  it.each(SETS)('%s: чернила числа и тон сегодняшнего дня — роли набора', (id) => {
    applySet(id);
    const { sheet } = renderSheet('2026-08-07');
    const plain = cellByDay(sheet, '18');
    const today = cellByDay(sheet, '21');

    expect(norm(window.getComputedStyle(plain).color)).toBe(TX[id]);
    expect(window.getComputedStyle(today).fontWeight).toBe('700');
    expect(norm(window.getComputedStyle(today).color)).toBe(AC[id]);
  });

  it('сегодняшний день не залит: контракт даёт ему только начертание и тон', () => {
    // 21 августа записей нет — клетка не подхватывает ни --c1 у has-data, ни
    // --c2 у выбранного, и остаётся один на один с базовым правилом
    // `.date-picker-day.today` legacy-пикера (синий градиент навигации).
    const { sheet } = renderSheet('2026-08-07');
    const today = cellByDay(sheet, '21');
    const cs = window.getComputedStyle(today);

    expect(today.className).not.toContain('has-data');
    expect(noFill(cs)).toBe(true);
    expect(cs.animation === '' || cs.animation.includes('none')).toBe(true);
  });

  it.each(SETS)('%s: выбранный день — заливка --c2', (id) => {
    applySet(id);
    const { sheet } = renderSheet('2026-08-07');
    const selected = sheet.querySelector('.date-picker-day.selected');
    const cs = window.getComputedStyle(selected);

    expect(selected.querySelector('.day-number').textContent).toBe('7');
    expect(norm(cs.backgroundColor)).toBe(C2[id]);
    expect(noGradient(cs)).toBe(true);
    expect(cs.boxShadow === '' || cs.boxShadow === 'none').toBe(true);
    // Число выбранного дня остаётся чернилами: white базового пикера на --c2
    // почти исчезал.
    expect(norm(cs.color)).toBe(TX[id]);
  });

  it.each(SETS)('%s: выбранный и сегодняшний одновременно — --c2 под тоном --ac', (id) => {
    // Стык двух правил равного веса: заливку даёт `.selected`, начертание и
    // тон — `.today`. Ни одно не выключает другое.
    applySet(id);
    const { sheet } = renderSheet('2026-08-21');
    const both = sheet.querySelector('.date-picker-day.selected.today');
    const cs = window.getComputedStyle(both);

    expect(both.querySelector('.day-number').textContent).toBe('21');
    expect(norm(cs.backgroundColor)).toBe(C2[id]);
    expect(noGradient(cs)).toBe(true);
    expect(cs.fontWeight).toBe('700');
    expect(norm(cs.color)).toBe(AC[id]);
  });

  it.each(SETS)('%s: точка факта — 4 px через 3, тон --gr2', (id) => {
    applySet(id);
    const { sheet } = renderSheet('2026-08-21');
    const cell = cellByDay(sheet, '5');
    const dot = cell.querySelector('.day-data-dot');
    const legendDot = sheet.querySelector('.legend-swatch--dot');

    expect(dot).not.toBeNull();
    expect(window.getComputedStyle(cell).gap).toBe('3px');
    expect(window.getComputedStyle(dot).width).toBe('4px');
    expect(window.getComputedStyle(dot).height).toBe('4px');
    expect(norm(window.getComputedStyle(dot).backgroundColor)).toBe(GR2[id]);
    // Легенда обязана показывать ровно то, что нарисовано в сетке.
    expect(norm(window.getComputedStyle(legendDot).backgroundColor)).toBe(GR2[id]);
  });

  it.each(SETS)('%s: заливки по доле нормы нет — три разные доли, один тон --c1', (id) => {
    applySet(id);
    const { sheet } = renderSheet('2026-08-21');
    const tones = ['5', '7', '12'].map((day) => {
      const cell = cellByDay(sheet, day);
      expect(cell.className).toContain('has-data');
      expect(cell.getAttribute('style')).toBeNull();
      return norm(window.getComputedStyle(cell).backgroundColor);
    });

    expect(new Set(tones).size).toBe(1);
    expect(tones[0]).toBe(C1[id]);
  });

  it('день без записей — без заливки и без точки (строка «пропущенный день»)', () => {
    const { sheet } = renderSheet('2026-08-21');
    const empty = cellByDay(sheet, '6');

    expect(empty.querySelector('.day-data-dot')).toBeNull();
    expect(noFill(window.getComputedStyle(empty))).toBe(true);
  });
});
