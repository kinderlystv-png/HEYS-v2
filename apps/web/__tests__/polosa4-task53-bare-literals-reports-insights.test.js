/**
 * Полоса 4 · задача 53 · фаза 2 — warm literals зоны reports-insights.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(WEB_DIR, 'styles', 'modules');

const PALETTE_CSS = fs.readFileSync(path.join(MODULES, '002-ui-v4-palette-roles.css'), 'utf8');
const CASCADE_CSS = fs.readFileSync(path.join(MODULES, '740-cascade-card.css'), 'utf8');
const PI_DASHBOARD_JS = fs.readFileSync(path.join(WEB_DIR, 'insights', 'pi_ui_dashboard.js'), 'utf8');
const WEEKLY_REPORTS_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_weekly_reports_v2.js'), 'utf8');

const BARE_WARM =
  /(?<!var\([^)]*,\s*)#(?:eab308|f59e0b|fbbf24|fef3c7|fde68a|facc15|f97316)\b|rgba\(\s*234\s*,\s*179\s*,\s*8\s*,/i;

function bareWarmLines(cssOrJs) {
  return cssOrJs
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => BARE_WARM.test(line));
}

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

function probeBg(selector, html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const el = host.querySelector(selector);
  document.body.appendChild(host);
  const bg = normColor(getComputedStyle(el).backgroundColor);
  host.remove();
  return bg;
}

describe('polosa4 task53 · bare literals reports-insights', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('740-cascade-card · нет голых warm-литералов вне var fallback', () => {
    expect(bareWarmLines(CASCADE_CSS)).toEqual([]);
  });

  it('pi_ui_dashboard.js · warm-литералы переведены на v4-роли', () => {
    expect(bareWarmLines(PI_DASHBOARD_JS)).toEqual([]);
    expect(PI_DASHBOARD_JS).toMatch(/const V4_WARN_SOFT = 'var\(--v4-warn-soft/);
    expect(PI_DASHBOARD_JS).toMatch(/const V4_WARN_2 = 'var\(--v4-warn-2/);
    expect(PI_DASHBOARD_JS).toMatch(/const V4_ACCENT_BG = 'var\(--v4-accent-bg/);
  });

  it('heys_weekly_reports_v2.js · fat-ring gradient без янтарной лестницы', () => {
    expect(bareWarmLines(WEEKLY_REPORTS_JS)).toEqual([]);
    expect(WEEKLY_REPORTS_JS).toMatch(/V4_WARN_SOFT, V4_WARN_2/);
    expect(WEEKLY_REPORTS_JS).toMatch(/HEYS\.MacroRings\?\.MACRO_COLORS\?\.amber/);
  });

  it('cascade dots · computed sand/blue', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${CASCADE_CSS}`));

    const cases = [
      { theme: 'sand', neutral: '#c9922e', household: '#d99a63' },
      { theme: 'blue', neutral: '#c0871c', household: '#e59ea8' },
    ];

    for (const c of cases) {
      mountPalette(c.theme);
      expect(probeBg('.cascade-dot--neutral', '<span class="cascade-dot cascade-dot--neutral"></span>'), `${c.theme} neutral`).toBe(
        c.neutral,
      );
      expect(
        probeBg('.cascade-dot--household', '<span class="cascade-dot cascade-dot--household"></span>'),
        `${c.theme} household`,
      ).toBe(c.household);
    }
  });
});
