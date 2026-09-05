// Task 111 — registration wheel shared layer: 22/700 --ac, 13/600 ink 22 %, row capsule.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PWA_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'),
  'utf8',
);
const PALETTE_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);

function mountWheelMarkup() {
  document.body.innerHTML = `
    <style>${PALETTE_CSS}</style>
    <style>${PWA_CSS}</style>
    <div class="mc-wheel-picker mc-wheel-picker--compact">
      <div class="mc-wheel-values">
        <div class="mc-wheel-value mc-wheel-value--prev n">167</div>
        <div class="mc-wheel-value mc-wheel-value--current n">168</div>
        <div class="mc-wheel-value mc-wheel-value--next n">169</div>
      </div>
    </div>
  `;
}

function normalizeColor(color) {
  if (!color) return color;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    const n = Number.parseInt(full, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  return color;
}

describe('registration wheel · shared mc-wheel layer', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-palette', 'sand');
    document.documentElement.setAttribute('data-theme', 'sand');
    document.documentElement.setAttribute('data-theme-id', 'sand');
    mountWheelMarkup();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
  });

  it('source: base current 22/700 --v4-act-text, neighbors 13/600 ink 22 %, no emerald', () => {
    expect(PWA_CSS).toMatch(/\.mc-wheel-value--current \{[^}]*font: 700 22px\/1\.35/s);
    expect(PWA_CSS).toMatch(/\.mc-wheel-value--current \{[^}]*var\(--v4-act-text/s);
    expect(PWA_CSS).toMatch(/\.mc-wheel-value--prev[\s\S]*?color: color-mix\(in srgb, var\(--v4-ink[^)]+\) 22%/s);
    expect(PWA_CSS).not.toMatch(/\.mc-wheel-value--current[^}]*--color-emerald-500/);
  });

  it('source: row highlight capsule on .mc-wheel-values::before', () => {
    expect(PWA_CSS).toMatch(/\.mc-wheel-values::before[\s\S]*?height: 32px[\s\S]*?var\(--v4-hero/s);
  });

  it('computed sand + blue · current and neighbors match registration contract', () => {
    const table = { sand: {}, blue: {} };
    for (const palette of ['sand', 'blue']) {
      document.documentElement.setAttribute('data-palette', palette);
      document.documentElement.setAttribute('data-theme', palette);
      document.documentElement.setAttribute('data-theme-id', palette);
      const current = getComputedStyle(document.querySelector('.mc-wheel-value--current'));
      const prev = getComputedStyle(document.querySelector('.mc-wheel-value--prev'));
      table[palette] = {
        currentSize: current.fontSize,
        currentWeight: current.fontWeight,
        currentColor: current.color,
        prevSize: prev.fontSize,
        prevWeight: prev.fontWeight,
        prevColor: prev.color,
      };
    }

    expect(table.sand.currentSize).toBe('22px');
    expect(table.blue.currentSize).toBe('22px');
    expect(table.sand.currentWeight).toBe('700');
    expect(table.sand.prevSize).toBe('13px');
    expect(table.sand.prevWeight).toBe('600');

    expect(normalizeColor(table.sand.currentColor)).toBe('rgb(138, 74, 32)');
    expect(normalizeColor(table.blue.currentColor)).toBe('rgb(29, 94, 150)');
    expect(table.sand.prevColor).not.toBe(table.sand.currentColor);
    expect(table.blue.prevColor).not.toBe(table.blue.currentColor);
  });
});
