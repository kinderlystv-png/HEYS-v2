/**
 * Polosa 4 · task 87 step 2 · package A — subscription screens + settings meta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const PAYWALL_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/735-ui-v4-subscription.css'),
  'utf8',
);
const SUBS_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_subscriptions_v1.js'), 'utf8');

const EXPECT = Object.freeze({
  sand: { card: '#f7efe2', hero: '#efe3cf', actText: '#8a4a20' },
  blue: { card: '#eef3f9', hero: '#e2ecf6', actText: '#1d5e96' },
});

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

describe('subscription package A · settings meta', () => {
  it('formats trial meta as «Триал · до 10 сент» in source', () => {
    expect(SUBS_SOURCE).toContain('function getSettingsRowMeta');
    expect(SUBS_SOURCE).toContain('Триал · до ${shortDate}');
    expect(SUBS_SOURCE).toContain("return shortDate ? `Триал · до ${shortDate}`");
  });
});

describe('subscription package A · sub-screen colors sand/blue', () => {
  let paletteStyle;
  let paywallStyle;

  afterEach(() => {
    paletteStyle?.remove();
    paywallStyle?.remove();
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  for (const themeId of ['sand', 'blue']) {
    it(`${themeId}: status card and support link follow palette roles`, () => {
      mountPalette(themeId);
      paletteStyle = injectCss(PALETTE_CSS);
      paywallStyle = injectCss(PAYWALL_CSS);

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="sub-screen">
          <div class="sub-screen__status-card"></div>
          <div class="sub-screen__status-card sub-screen__status-card--readonly"></div>
          <span class="sub-screen__support-link">link</span>
        </div>
      `;
      document.body.appendChild(host);

      const card = host.querySelector('.sub-screen__status-card:not(.sub-screen__status-card--readonly)');
      const readonlyCard = host.querySelector('.sub-screen__status-card--readonly');
      const link = host.querySelector('.sub-screen__support-link');

      expect(normColor(getComputedStyle(card).backgroundColor)).toBe(EXPECT[themeId].card);
      expect(normColor(getComputedStyle(readonlyCard).backgroundColor)).toBe(EXPECT[themeId].hero);
      expect(normColor(getComputedStyle(link).color)).toBe(EXPECT[themeId].actText);

      host.remove();
    });
  }
});

describe('subscription package A · subscription CSS contract', () => {
  it('declares v4 sub-screen geometry', () => {
    expect(PAYWALL_CSS).toContain('.sub-screen__status-card');
    expect(PAYWALL_CSS).toMatch(/border-radius:\s*20px/);
    expect(PAYWALL_CSS).toMatch(/\.sub-screen__headline[\s\S]*font:\s*800 26px\/1\.1/);
    expect(PAYWALL_CSS).toContain('.sub-screen__kick--danger');
  });
});
