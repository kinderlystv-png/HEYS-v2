/**
 * Полоса 4 · задача 104 · пакет 36 · видимые тач-цели 44px в 5 зонах.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB_DIR, '..', '..');
const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const CSS_500 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/500-pwa-and-offline.css'), 'utf8');
const CSS_734 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/734-ui-v4-insights.css'), 'utf8');
const CSS_GAMIFICATION = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
  'utf8',
);
const GATES_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_app_gates_v1.js'), 'utf8');

const CANVASES = {
  'first-run': path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/first-run.v4.dc.html',
  ),
  cycle: path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/cycle.v4.dc.html',
  ),
  gamification: path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/gamification.v4.dc.html',
  ),
};

function readContractLine(canvasPath, key) {
  const html = fs.readFileSync(canvasPath, 'utf8');
  const re = new RegExp(`<b>${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</b><span data-v="([^"]*)"`, 'u');
  const match = html.match(re);
  return match?.[1] || '';
}

function ruleBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  return match?.[1] || '';
}

function prop(block, name) {
  const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match?.[1]?.trim() || '';
}

function mountProbe(className, extra = '') {
  const host = document.createElement('div');
  host.setAttribute('data-palette', 'sand');
  host.innerHTML = `<style>${PALETTE_CSS}\n${CSS_500}\n${CSS_734}\n${CSS_GAMIFICATION}</style>${extra}<div class="${className}"></div>`;
  document.body.appendChild(host);
  return host.querySelector(`.${className.split(' ').pop()}`);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('polosa4 task104 pkg36 · touch targets 44px', () => {
  it('first-run · контракт тач-цели требует видимую пилюлю «Скопировать» 44 px', () => {
    const touch = readContractLine(CANVASES['first-run'], 'тач-цели');
    expect(touch).toContain('44');
    expect(touch).toContain('Скопировать');
    expect(GATES_SRC).toContain('desktop-gate__copy-btn');
    expect(prop(ruleBlock(CSS_500, '.desktop-gate__copy-btn'), 'min-height')).toBe('44px');
    const btn = mountProbe('desktop-gate__copy-btn');
    expect(getComputedStyle(btn).minHeight).toBe('44px');
  });

  it('cycle · клетка календаря .cycle-date-picker-cell поднята до 44 px', () => {
    const touch = readContractLine(CANVASES.cycle, 'тач-цели');
    expect(touch).toContain('.cell');
    expect(touch).toContain('44');
    expect(prop(ruleBlock(CSS_500, '.cycle-date-picker-cell'), 'height')).toBe('44px');
    const cell = mountProbe('cycle-date-picker-cell');
    expect(getComputedStyle(cell).height).toBe('44px');
  });

  it('gamification · нажимается ряд, иконка 34 px — декор внутри цели', () => {
    const touch = readContractLine(CANVASES.gamification, 'тач-цели');
    expect(touch).toContain('поднимать нечего');
    const rowBlock = ruleBlock(CSS_GAMIFICATION, '.game-v4-sheet__ach-row');
    expect(prop(rowBlock, 'padding')).toBe('13px 0');
    const medalBlock = ruleBlock(CSS_GAMIFICATION, '.game-v4-sheet__ach-medal');
    expect(prop(medalBlock, 'height')).toBe('34px');
    expect(13 + 34 + 13).toBeGreaterThanOrEqual(44);
  });

  it('reports-insights · чип окна наблюдения min-height 44 px', () => {
    expect(prop(ruleBlock(CSS_734, '.insights-v4-window__chip'), 'min-height')).toBe('44px');
    const chip = mountProbe('insights-v4-window__chip');
    expect(getComputedStyle(chip).minHeight).toBe('44px');
  });
});
