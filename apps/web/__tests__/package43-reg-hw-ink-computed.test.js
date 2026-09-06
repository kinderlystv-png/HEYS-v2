// Package 43 acceptance — computed ink on sand + blue (375px viewport irrelevant for role cascade).
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
const WIDGETS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

function normalizeColor(color) {
  if (!color) return color;
  const varFallback = /^var\([^,]+,\s*(.+)\)\s*$/.exec(color);
  if (varFallback) return normalizeColor(varFallback[1].trim());
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = Number.parseInt(full, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  return color;
}

function applyTheme(palette) {
  document.documentElement.setAttribute('data-palette', palette);
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-theme-id', palette);
}

describe('package 43 · registration + home-widgets computed ink', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
  });

  it('consent document body uses --v4-ink-2 on sand and blue', () => {
    expect(LOGIN_CSS).toMatch(
      /\.consent-doc-body\s*\{[^}]*color:\s*var\(--v4-ink-2,\s*rgba\(0,\s*0,\s*0,\s*0\.55\)\)/,
    );
    expect(PALETTE_CSS).toMatch(
      /\[data-palette="sand"\][\s\S]*--v4-ink-2:\s*rgba\(0,\s*0,\s*0,\s*0\.55\)/,
    );
    expect(PALETTE_CSS).toMatch(
      /\[data-palette="blue"\][\s\S]*--v4-ink-2:\s*rgba\(0,\s*0,\s*0,\s*0\.55\)/,
    );
    document.body.innerHTML = `
      <style>${PALETTE_CSS}</style>
      <style>${LOGIN_CSS}</style>
      <p class="consent-doc-body">Юридический текст</p>
    `;
    const el = document.querySelector('.consent-doc-body');
    for (const palette of ['sand', 'blue']) {
      applyTheme(palette);
      expect(getComputedStyle(el).fontSize).toBe('12.5px');
    }
  });

  it('calories foot «1 289» --ink modifier resolves to full --v4-ink on sand and blue', () => {
    document.body.innerHTML = `
      <style>${PALETTE_CSS}</style>
      <style>${WIDGETS_CSS}</style>
      <span class="widget-calories__hero-bar-num widget-calories__hero-bar-num--ink">1 289</span>
    `;
    const table = {};
    for (const palette of ['sand', 'blue']) {
      applyTheme(palette);
      table[palette] = normalizeColor(
        getComputedStyle(document.querySelector('.widget-calories__hero-bar-num--ink')).color,
      );
    }
    expect(table.sand).toBe('rgb(32, 30, 29)');
    expect(table.blue).toBe('rgb(16, 24, 38)');
  });
});
