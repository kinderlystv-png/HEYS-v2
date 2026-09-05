// Task 121 · polosa 4 · registration revoke sheet destructive confirm (733:2270).
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PALETTE_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const LOGIN_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-login-theme.css'),
  'utf8',
);

const CONFIRM_RULE = /\.heys-supp-revoke-sheet__confirm\s*\{([^}]*)\}/s;

function normalizeColor(color) {
  if (!color) return color;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = Number.parseInt(full, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  return color;
}

function srgb(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const ch = (i) => srgb(Number.parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}

function contrastRatio(foreground, background) {
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function mountRevokeConfirm() {
  document.body.innerHTML = `
    <style>${PALETTE_CSS}</style>
    <style>${LOGIN_CSS}</style>
    <div class="heys-supp-revoke-sheet">
      <div class="heys-supp-revoke-sheet__actions">
        <button type="button" class="heys-supp-revoke-sheet__confirm">Отозвать и удалить</button>
      </div>
    </div>
  `;
}

function applyTheme(palette) {
  document.documentElement.setAttribute('data-palette', palette);
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-theme-id', palette);
}

describe('registration · revoke sheet destructive button colors', () => {
  beforeEach(() => {
    mountRevokeConfirm();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
  });

  it('uses bad-text on transparent surface, not red fill or btn-on-act', () => {
    const block = CONFIRM_RULE.exec(LOGIN_CSS)?.[1] ?? '';
    expect(block).toMatch(/color:\s*var\(--v4-bad-text,\s*#a83c22\)/);
    expect(block).toMatch(/background:\s*transparent/);
    expect(block).not.toMatch(/--v4-btn-on-act/);
    expect(block).not.toMatch(/background:\s*var\(--v4-bad-text/);
  });

  it('computed sand + blue · WCAG contrast ≥ 4.5:1 on sheet surface', () => {
    const ratios = {};
    for (const palette of ['sand', 'blue']) {
      applyTheme(palette);
      const button = document.querySelector('.heys-supp-revoke-sheet__confirm');
      const sheet = document.querySelector('.heys-supp-revoke-sheet');
      const buttonStyle = getComputedStyle(button);
      const sheetStyle = getComputedStyle(sheet);

      expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(buttonStyle.backgroundColor);
      expect(buttonStyle.minHeight).toBe('48px');
      expect(buttonStyle.borderRadius).toBe('999px');

      const fg = normalizeColor(buttonStyle.color);
      const bg = normalizeColor(sheetStyle.backgroundColor);
      if (palette === 'sand') {
        expect(fg).toBe('rgb(168, 60, 34)');
        expect(bg).toBe('rgb(255, 250, 241)');
      } else {
        expect(fg).toBe('rgb(176, 58, 36)');
        expect(bg).toBe('rgb(255, 250, 241)');
      }

      const hexFg = palette === 'sand' ? '#a83c22' : '#b03a24';
      ratios[palette] = contrastRatio(hexFg, '#fffaf1');
      expect(ratios[palette], `${palette} contrast`).toBeGreaterThanOrEqual(4.5);
    }

    expect(ratios.sand).toBe(6.06);
    expect(ratios.blue).toBe(5.81);
  });
});
