// Package 45 — computed sand+blue for cardShell (--v4-hero) and resume disc.
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

function applyTheme(palette) {
  document.documentElement.setAttribute('data-palette', palette);
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-theme-id', palette);
}

describe('registration q7 · hero role colors', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <style>${PALETTE_CSS}</style>
      <style>${LOGIN_CSS}</style>
      <div id="card" style="background: var(--v4-hero, #efe3cf); border-radius: 20px; padding: 14px 16px;"></div>
      <div class="registration-v4-endpoint-disc" aria-hidden="true"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
  });

  it('cardShell and resume disc follow --v4-hero on sand and blue', () => {
    const table = { card: {}, disc: {} };
    for (const palette of ['sand', 'blue']) {
      applyTheme(palette);
      table.card[palette] = normalizeColor(getComputedStyle(document.getElementById('card')).backgroundColor);
      table.disc[palette] = normalizeColor(getComputedStyle(document.querySelector('.registration-v4-endpoint-disc')).backgroundColor);
    }

    expect(table.card.sand).toBe('rgb(239, 227, 207)');
    expect(table.card.blue).toBe('rgb(226, 236, 246)');
    expect(table.disc.sand).toBe('rgb(239, 227, 207)');
    expect(table.disc.blue).toBe('rgb(226, 236, 246)');
    expect(table.card.sand).not.toBe(table.card.blue);
  });
});
