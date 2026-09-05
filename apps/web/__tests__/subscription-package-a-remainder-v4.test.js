/**
 * Polosa 4 · task 87 remainder — 7 package-A «?» rows (static + settings-row drawings).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
  'utf8',
);
const SHELL_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const PAYWALL_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_paywall_v1.js'), 'utf8');
const PAYWALL_CSS = PAYWALL_SOURCE.match(/const PAYWALL_STYLES = `([\s\S]*?)`;/)?.[1] || '';

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

function extractRule(cssText, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const match = cssText.match(re);
  return match?.[1] || '';
}

describe('subscription package A remainder · static position', () => {
  it('settings row rule omits position (static matcher)', () => {
    const rule = extractRule(BASE_CSS, '.hdr-settings-sheet__row');
    expect(rule).not.toMatch(/position\s*:/);
  });

  it('sub-screen rule omits position (static matcher)', () => {
    expect(PAYWALL_CSS).toMatch(/\.sub-screen\s*\{/);
    const rule = extractRule(PAYWALL_CSS, '.sub-screen');
    expect(rule).not.toMatch(/position\s*:/);
  });

  let baseStyle;
  let paywallStyle;

  afterEach(() => {
    baseStyle?.remove();
    paywallStyle?.remove();
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.body.innerHTML = '';
  });

  for (const themeId of ['sand', 'blue']) {
    it(`${themeId}: settings row has no non-static position in computed style`, () => {
      mountPalette(themeId);
      baseStyle = injectCss(extractRule(BASE_CSS, '.hdr-settings-sheet__row'));
      const row = document.createElement('button');
      row.className = 'hdr-settings-sheet__row';
      document.body.appendChild(row);
      const position = getComputedStyle(row).position;
      expect(position === '' || position === 'static').toBe(true);
    });

    it(`${themeId}: sub-screen has no non-static position in computed style`, () => {
      mountPalette(themeId);
      paywallStyle = injectCss(PAYWALL_CSS);
      const screen = document.createElement('div');
      screen.className = 'sub-screen';
      document.body.appendChild(screen);
      const position = getComputedStyle(screen).position;
      expect(position === '' || position === 'static').toBe(true);
    });
  }
});

describe('subscription package A remainder · settings-row drawings', () => {
  it('chevron field 15×15 viewBox 0 0 24 24', () => {
    expect(SHELL_SOURCE).toMatch(/renderSettingsChevron[\s\S]*?width:\s*15[\s\S]*?height:\s*15[\s\S]*?viewBox:\s*'0 0 24 24'/);
  });

  it('settings sheet close path M18 6L6 18M6 6l12 12', () => {
    expect(SHELL_SOURCE).toContain("d: 'M18 6L6 18M6 6l12 12'");
  });

  it('row chevron path M9 6l6 6-6 6 when collapsed', () => {
    expect(SHELL_SOURCE).toContain(": 'M9 6l6 6-6 6'");
  });
});
