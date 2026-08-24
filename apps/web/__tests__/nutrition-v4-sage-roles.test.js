/**
 * Шалфейные тона вкладки «Питание»: тинт свайпа против сплошной заливки.
 *
 * Канвас различает четыре шалфейных токена, и два из них — тона ТЕКСТА:
 *   --sageTx  — на тинте --sage (свайп «Копировать»);
 *   --on-gr   — на сплошной заливке --gr2 (отмеченный чип добавок).
 * До 2026-08-24 продукт нёс оба одной ролью --v4-on-ok, то есть красил заливку
 * тоном, подобранным под тинт. Контракт «цвет свайп-действий» прямо запрещает
 * обратную подстановку («Это не --on-gr: тот тон рассчитан на сплошную
 * шалфейную заливку и на тинте выглядит грязным»), а контракт «цвета» блока
 * добавок требует для заливки именно --on-gr с контрастом не ниже 4,5:1.
 *
 * Глазами эта склейка не ловится: в песочной --sage и --gr-bg совпадают, и
 * ошибка видна только в трёх остальных наборах. Поэтому сверяем числами и
 * сразу во всех четырёх.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const HANDOFF = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const PALETTE = path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css');
const NUTRITION = path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css');

// Селекторы наборов канваса → идентификаторы наборов продукта.
const CANVAS_SETS = {
  ':root': 'sand',
  '.pal.dk': 'sand-dark',
  '.pal.bl': 'blue',
  '.pal.bldk': 'blue-dark',
};
const SETS = Object.values(CANVAS_SETS);

function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map();
  for (const block of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars = {};
    for (const v of block[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
      vars[v[1]] = v[2].trim().toLowerCase();
    }
    for (const sel of block[1].split(',')) {
      const key = sel.trim();
      out.set(key, { ...(out.get(key) || {}), ...vars });
    }
  }
  return out;
}

// Значения канваса по наборам: token → { sand, sand-dark, blue, blue-dark }.
function canvasToken(css, token) {
  const parsed = rules(css);
  const out = {};
  for (const [sel, id] of Object.entries(CANVAS_SETS)) {
    out[id] = parsed.get(sel)?.[token];
  }
  return out;
}

// Наборы продуктовой палитры: [data-theme-id="…"] → карта ролей.
function paletteSets() {
  const parsed = rules(fs.readFileSync(PALETTE, 'utf8'));
  const out = {};
  for (const [sel, vars] of parsed) {
    const id = sel.match(/data-theme-id="([a-z-]+)"/);
    if (id) out[id[1]] = { ...(out[id[1]] || {}), ...vars };
  }
  return out;
}

// Какую роль правило кладёт в свойство: var(--роль, запасное) → «--роль».
function roleOf(css, selector, prop) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = clean.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`),
  );
  expect(block, `правило ${selector} не найдено`).not.toBeNull();
  const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*var\\(\\s*(--[a-z0-9-]+)`, 'i').exec(block[1]);
  expect(decl, `${selector} { ${prop} } не берёт роль`).not.toBeNull();
  return decl[1];
}

function srgb(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => srgb(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const nutritionCss = fs.readFileSync(NUTRITION, 'utf8');
const canvasTab = fs.readFileSync(path.join(HANDOFF, 'nutrition-tab.v4.dc.html'), 'utf8');
const canvasPalette = fs.readFileSync(path.join(HANDOFF, 'v4-canvas.css'), 'utf8');

// --sage и --sageTx канвас держит в самом кадре вкладки, остальную шалфейную
// семью — в общей палитре пакета.
const SAGE = canvasToken(canvasTab, '--sage');
const SAGE_TX = canvasToken(canvasTab, '--sageTx');
const GR_BG = canvasToken(canvasPalette, '--gr-bg');
const GR2 = canvasToken(canvasPalette, '--gr2');
const ON_GR = canvasToken(canvasPalette, '--on-gr');

const COPY = '.nutrition-v4-sheet__swipe-actions button.is-copy';
const CHIP_ON = '.nutrition-v4-supplements__chip.is-on';

describe('шалфейные роли вкладки «Питание»', () => {
  const pals = paletteSets();

  it('канвас различает тинт свайпа и подложку шалфейной карточки', () => {
    // Если бы --sage совпадал с --gr-bg везде, одной роли хватало бы. Он
    // совпадает только в песочной — на этом склейка и держалась незамеченной.
    expect(SAGE.sand).toBe(GR_BG.sand);
    for (const id of ['sand-dark', 'blue', 'blue-dark']) {
      expect(SAGE[id], `${id}: --sage`).not.toBe(GR_BG[id]);
    }
  });

  it('канвас различает текст на тинте и текст на заливке', () => {
    for (const id of SETS) {
      expect(SAGE_TX[id], `${id}: --sageTx против --on-gr`).not.toBe(ON_GR[id]);
    }
  });

  it('роли продукта повторяют значения канваса во всех четырёх наборах', () => {
    for (const id of SETS) {
      expect(pals[id]['--v4-ok-tint'], `${id}: --v4-ok-tint = --sage`).toBe(SAGE[id]);
      expect(pals[id]['--v4-on-ok'], `${id}: --v4-on-ok = --sageTx`).toBe(SAGE_TX[id]);
      expect(pals[id]['--v4-on-ok-fill'], `${id}: --v4-on-ok-fill = --on-gr`).toBe(ON_GR[id]);
      expect(pals[id]['--v4-ok-fill'], `${id}: --v4-ok-fill = --gr2`).toBe(GR2[id]);
    }
  });

  it('роли заданы и в каноничных наборах — иначе в тёмной сработает светлый фолбэк', () => {
    for (const id of ['classic', 'classic-dark']) {
      expect(pals[id]['--v4-ok-tint'], `${id}: --v4-ok-tint`).toBeDefined();
      expect(pals[id]['--v4-on-ok-fill'], `${id}: --v4-on-ok-fill`).toBeDefined();
    }
  });

  it('свайп-действие и отмеченный чип берут разные роли текста', () => {
    expect(roleOf(nutritionCss, COPY, 'background')).toBe('--v4-ok-tint');
    expect(roleOf(nutritionCss, COPY, 'color')).toBe('--v4-on-ok');
    expect(roleOf(nutritionCss, CHIP_ON, 'background')).toBe('--v4-ok-fill');
    expect(roleOf(nutritionCss, CHIP_ON, 'color')).toBe('--v4-on-ok-fill');
    expect(roleOf(nutritionCss, COPY, 'color')).not.toBe(roleOf(nutritionCss, CHIP_ON, 'color'));
  });

  it.each(SETS)('%s: текст не сливается со своим фоном и держит 4,5:1', (id) => {
    const pairs = [
      ['свайп «Копировать»', pals[id]['--v4-on-ok'], pals[id]['--v4-ok-tint']],
      ['отмеченный чип', pals[id]['--v4-on-ok-fill'], pals[id]['--v4-ok-fill']],
    ];
    for (const [what, ink, bg] of pairs) {
      expect(ink, `${what}: тон текста`).not.toBe(bg);
      expect(contrast(ink, bg), `${what}: ${ink} на ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // И два текста между собой — разные тона, иначе развязка формальная.
    expect(pals[id]['--v4-on-ok']).not.toBe(pals[id]['--v4-on-ok-fill']);
  });
});
