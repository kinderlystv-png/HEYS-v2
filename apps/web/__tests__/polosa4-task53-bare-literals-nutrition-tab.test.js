/**
 * Полоса 4 · задача 53 · фаза 2 — nutrition-tab warm literals (CSS scope).
 * JS bucket-2 остаётся в handoff polosa 3 (paywall, supplements, diary, iw_ui).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NUTRITION_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/732-ui-v4-nutrition.css'),
  'utf8',
);
const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);

const AMBER_LADDER = [
  '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#eab308', '#facc15',
  '#fde047', '#d97706', '#b45309', '#92400e', '#78350f', '#713f12', '#451a03',
  '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407', '#fdba74',
  '#fed7aa', '#ffedd5', '#fb923c', '#ca8a04', '#a16207', '#854d0e',
];
const BARE_AMBER = new RegExp(
  `(?<!var\\([^)]*,\\s*)#(?:${AMBER_LADDER.map((h) => h.slice(1)).join('|')})\\b`,
  'i',
);
const WARM_RGBA = /rgba\(\s*33\s*,\s*30\s*,\s*25\s*,/i;

function normColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'initial' || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return '';
  if (raw.startsWith('#')) return raw;
  const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!rgb) return raw;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
}

function mountPalette(themeId) {
  document.documentElement.setAttribute('data-theme-id', themeId);
  document.documentElement.setAttribute(
    'data-theme',
    themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
  );
  document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
}

function injectCss(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

function probeSheetShadow(themeId) {
  mountPalette(themeId);
  const host = document.createElement('div');
  host.innerHTML = '<div class="nutrition-v4-sheet"></div>';
  document.body.appendChild(host);
  const shadow = getComputedStyle(host.querySelector('.nutrition-v4-sheet')).boxShadow;
  host.remove();
  return shadow;
}

describe('polosa4 task53 · bare literals nutrition-tab (732 CSS)', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('732-ui-v4-nutrition.css: нет голых янтарных литералов вне --nut-dim', () => {
    const hits = NUTRITION_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/--nut-dim/.test(line))
      .filter((line) => BARE_AMBER.test(line) || WARM_RGBA.test(line));
    expect(hits).toEqual([]);
  });

  it('nutrition-v4-sheet shadow на роли ink (sand/blue computed)', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${NUTRITION_CSS}`));
    expect(NUTRITION_CSS).toMatch(
      /\.nutrition-v4-sheet\s*\{[^}]*box-shadow:[^}]*color-mix\([^}]*var\(--v4-ink/,
    );

    for (const theme of ['sand', 'blue']) {
      mountPalette(theme);
      const host = document.createElement('div');
      host.innerHTML = '<div class="nutrition-v4-sheet"></div>';
      document.body.appendChild(host);
      const shadow = getComputedStyle(host.querySelector('.nutrition-v4-sheet')).boxShadow;
      host.remove();
      expect(shadow, theme).not.toMatch(/rgba\(\s*33\s*,\s*30\s*,\s*25/i);
      expect(shadow, theme).toContain('rgb');
    }

    const sandShadow = probeSheetShadow('sand');
    const blueShadow = probeSheetShadow('blue');
    expect(sandShadow).not.toBe(blueShadow);
  });

  it('--nut-dim остаётся контрактным тоном канваса (sand)', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${NUTRITION_CSS}`));
    mountPalette('sand');
    const host = document.createElement('div');
    host.className = 'nutrition-v4';
    host.innerHTML = '<p class="nutrition-v4-verdict"><span>состав</span></p>';
    document.body.appendChild(host);
    const color = normColor(getComputedStyle(host.querySelector('span')).color);
    host.remove();
    expect(color).toBe('#6b5f4f');
  });
});
