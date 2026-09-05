// Task 112/117 — computed colors for destructive revoke button (sand + blue).
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

function mountConfirmButton() {
  document.body.innerHTML = `
    <style>${PALETTE_CSS}</style>
    <style>${LOGIN_CSS}</style>
    <button type="button" class="heys-supp-revoke-sheet__confirm">Отозвать и удалить</button>
  `;
}

function applyTheme(palette) {
  document.documentElement.setAttribute('data-palette', palette);
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-theme-id', palette);
}

describe('registration · revoke sheet destructive button colors', () => {
  beforeEach(() => {
    mountConfirmButton();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
  });

  it('computed sand + blue · --v4-bad-text fill and label on destructive confirm', () => {
    const table = {};
    for (const palette of ['sand', 'blue']) {
      applyTheme(palette);
      const cs = getComputedStyle(document.querySelector('.heys-supp-revoke-sheet__confirm'));
      table[palette] = {
        backgroundColor: normalizeColor(cs.backgroundColor),
        color: normalizeColor(cs.color),
        minHeight: cs.minHeight,
        borderRadius: cs.borderRadius,
      };
    }
    expect(table.sand.backgroundColor).toBe('rgb(168, 60, 34)');
    expect(table.blue.backgroundColor).toBe('rgb(176, 58, 36)');
    expect(table.sand.color).toBe('rgb(43, 22, 8)');
    expect(table.blue.color).toBe('rgb(255, 255, 255)');
    expect(table.sand.minHeight).toBe('48px');
    expect(table.blue.borderRadius).toBe('999px');
  });
});
