// home-widgets v4 — бюджет 32 клетки, FAB настройки, без плитки «Добавить»
// (контракт 23 августа: «Бюджет экрана», «Кнопка настройки экрана»).
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
const CSS_SRC = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');

const SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
  '3x2': { cols: 3, rows: 2 }
};

function defaultLayoutBlock() {
  const start = CORE_SRC.indexOf('const DEFAULT_LAYOUT = [');
  const end = CORE_SRC.indexOf('\n  ];', start);
  return CORE_SRC.slice(start, end);
}

function parseDefaultLayoutEntries(block) {
  const entries = [];
  const re = /type:\s*'([^']+)',\s*\n\s*size:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block))) {
    entries.push({ type: m[1], size: m[2] });
  }
  return entries;
}

function cellCount(size) {
  const si = SIZES[size] || { cols: 2, rows: 1 };
  return si.cols * si.rows;
}

let grid;

beforeAll(() => {
  global.window = global;
  global.HEYS = {};
  // eslint-disable-next-line no-new-func
  new Function('window', CORE_SRC)(global);
  global.HEYS.Widgets.registry = {
    getSize: (id) => SIZES[id] || null,
    getType: () => ({ type: 'x' }),
    createWidget: (type) => ({ id: `w_${type}`, type, size: '2x1' })
  };
  global.HEYS.Widgets.emit = () => {};
  global.HEYS.Widgets.state._debouncedSave = () => {};
  grid = global.HEYS.Widgets.grid;
});

describe('home-widgets v4 · бюджет экрана и вход в расстановку', () => {
  it('ядро: SCREEN_CELL_BUDGET = 32, вес в дефолте 2×1 «Число и неделя»', () => {
    expect(CORE_SRC).toContain('const SCREEN_CELL_BUDGET = 32');
    const block = defaultLayoutBlock();
    expect(block).toContain("type: 'weight'");
    expect(block).toContain("size: '2x1'");
    expect(block).toContain("displayVariant: 'number_week'");
    expect(block).not.toMatch(/type:\s*'weight'[\s\S]*?size:\s*'2x2'/);
  });

  it('дефолт: одиннадцать плиток, сумма клеток = 32, восемь рядов без дыр', () => {
    const block = defaultLayoutBlock();
    const entries = parseDefaultLayoutEntries(block);
    expect(entries).toHaveLength(11);
    const totalCells = entries.reduce((sum, e) => sum + cellCount(e.size), 0);
    expect(totalCells).toBe(32);

    const widgets = entries.map((e, i) => ({ id: `d${i}`, type: e.type, size: e.size }));
    const pos = grid.computeFlowLayout(widgets, 4);
    const rowsUsed = Math.max(...widgets.map((w) => {
      const p = pos[w.id];
      const rows = SIZES[w.size]?.rows || 1;
      return p.row + rows;
    }));
    expect(rowsUsed).toBe(8);
  });

  it('addWidget блокирует добавление при полном бюджете', () => {
    const st = global.HEYS.Widgets.state;
    st._widgets = parseDefaultLayoutEntries(defaultLayoutBlock()).map((e, i) => ({
      id: `full_${i}`,
      type: e.type,
      size: e.size,
      cols: SIZES[e.size].cols,
      rows: SIZES[e.size].rows,
      position: { col: 0, row: 0 },
      settings: {}
    }));
    st._autoPackWidgets();
    let blockedReason = null;
    const prevEmit = global.HEYS.Widgets.emit;
    global.HEYS.Widgets.emit = (ev, detail) => {
      if (ev === 'widget:add-blocked') blockedReason = detail?.reason;
    };
    const result = st.addWidget({ id: 'extra', type: 'steps', size: '2x1' });
    global.HEYS.Widgets.emit = prevEmit;
    expect(result).toBeNull();
    expect(blockedReason).toBe('budget');
  });

  it('UI: нет пунктирной плитки и строки «Изменить экран»', () => {
    expect(UI_SRC).not.toContain("className: 'widget-v4-add");
    expect(UI_SRC).not.toContain('widgets-tab__edit-row');
    expect(UI_SRC).not.toContain('Изменить экран');
    expect(UI_SRC).not.toContain('function addTileSpan(');
  });

  it('UI: FAB настройки 40 px и быстрые действия 52 px, скрыты в расстановке', () => {
    expect(UI_SRC).toContain('function WidgetsSettingsFab');
    expect(UI_SRC).toContain('function WidgetsQuickActionsFab');
    expect(UI_SRC).toContain('function QuickSheetSvgIcon');
    expect(UI_SRC).toContain("className: 'widgets-settings-fab'");
    expect(UI_SRC).toContain("className: 'widgets-quick-fab'");
    expect(UI_SRC).toContain('widgets-quick-fab__glyph');
    expect(UI_SRC).toContain('widgets-quick-sheet__row-icon');
    expect(UI_SRC).toContain('formatWaterCounterLiters');
    expect(UI_SRC).not.toContain('getQuickFabUseCount');
    expect(UI_SRC).not.toContain('bumpQuickFabUseCount');
    expect(UI_SRC).not.toContain('widgets_quick_fab_uses');
    expect(UI_SRC).not.toContain('is-pill');
    expect(UI_SRC).not.toContain('widgets-quick-fab__pill-label');
    expect(UI_SRC).not.toContain('＋ Записать');
    expect(UI_SRC).toContain('renderMobileFabs');
    expect(UI_SRC).toMatch(/!isMobile \|\| isEditMode\) return null/);
    expect(UI_SRC).not.toContain('QuickActionsFabGroup');
  });

  it('UI: каталог только в расстановке, счётчик над каталогом', () => {
    expect(UI_SRC).toContain('isEditMode && React.createElement(CatalogStrip');
    expect(UI_SRC).toContain('widget-v4-catalog__budget');
    expect(UI_SRC).toContain('hdr-widgets-edit-budget');
    expect(UI_SRC).toContain('onReplace: handleCatalogReplace');
    expect(UI_SRC).toContain('_catalogDropTargetId');
  });

  it('UI: каталог при полном бюджете — «Снять виджет» и режим снятия', () => {
    expect(UI_SRC).toContain('renderCatalogBlockedHint');
    expect(UI_SRC).toContain('Снять виджет');
    expect(UI_SRC).toContain('widget-v4-catalog__remove-btn');
    expect(UI_SRC).toContain('catalogRemovePick');
    expect(UI_SRC).toContain('widgets-grid--remove-pick');
    expect(UI_SRC).toContain('onStartRemovePick');
  });

  it('CSS: размеры FAB и правила прокрутки сетки', () => {
    expect(CSS_SRC).toContain('.widgets-settings-fab');
    expect(CSS_SRC).toMatch(/\.widgets-settings-fab[\s\S]*width:\s*40px/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-fab[\s\S]*width:\s*52px/);
    expect(CSS_SRC).not.toContain('.widgets-quick-fab.is-pill');
    expect(CSS_SRC).not.toContain('.widgets-quick-fab__pill-label');
    expect(CSS_SRC).toMatch(/\.widgets-quick-sheet__chip[\s\S]*min-height:\s*34px/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-sheet__row[\s\S]*min-height:\s*38px/);
    expect(CSS_SRC).toContain('.widgets-quick-fab__glyph.is-open');
    expect(CSS_SRC).toContain('.widgets-tab--legacy-overflow');
    expect(CSS_SRC).toContain('@media (max-height: 739px)');
    expect(CSS_SRC).toContain('@media (min-height: 740px)');
  });

  it('CSS: вид кнопки «+» — заливка акцентом, «+» 21 px, тени, без обводки', () => {
    expect(UI_SRC).toMatch(/width:\s*21,\s*height:\s*21/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-fab[\s\S]*background:\s*#c67139/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-fab[\s\S]*color:\s*#2b1608/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-fab[\s\S]*border:\s*none/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-fab[\s\S]*0 2px 4px/);
    expect(CSS_SRC).toMatch(/\.widgets-quick-fab[\s\S]*0 10px 22px/);
    expect(CSS_SRC).toMatch(/\[data-theme\$="dark"\] \.widgets-quick-fab[\s\S]*#cf8144/);
    expect(CSS_SRC).toMatch(/\[data-theme\$="dark"\] \.widgets-quick-fab[\s\S]*#1a0f04/);
    expect(CSS_SRC).toMatch(/\[data-theme-id="blue"\] \.widgets-quick-fab[\s\S]*#2e7cc0/);
    expect(CSS_SRC).toMatch(/\[data-theme-id="blue-dark"\] \.widgets-quick-fab[\s\S]*#2e7cc0/);
    expect(CSS_SRC).toMatch(/\.widgets-settings-fab[\s\S]*background:\s*var\(--v4-bg/);
  });
});
