/**
 * Полоса 4 · задача 53 · фаза 2 — warm bucket-2 literals зоны home-widgets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(WEB_DIR, 'styles/modules');

const PALETTE_CSS = fs.readFileSync(path.join(MODULES, '002-ui-v4-palette-roles.css'), 'utf8');
const WIDGETS_CSS = fs.readFileSync(path.join(MODULES, '730-widgets-dashboard.css'), 'utf8');
const COMPONENTS_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');
const USER_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_user_v12.js'), 'utf8');
const DIARY_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_day_diary_section.js'), 'utf8');
const REGISTRY_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_registry_v1.js'), 'utf8');
const WIDGET_DATA_JS = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');

const AMBER_BARE = /(?<!var\([^)]*,\s*)#(?:eab308|facc15|f97316|f59e0b|b45309|92400e|fef3c7|78350f)\b|rgba\(\s*234\s*,\s*179\s*,\s*8\s*,|rgba\(\s*249\s*,\s*115\s*,\s*22\s*,|rgba\(\s*251\s*,\s*191\s*,\s*36\s*,|rgba\(\s*67\s*,\s*20\s*,\s*7\s*,/i;

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

function probeHtml(html, selector) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const el = host.querySelector(selector);
  document.body.appendChild(host);
  const computed = getComputedStyle(el);
  const out = {
    backgroundColor: normColor(computed.backgroundColor),
    color: normColor(computed.color),
  };
  host.remove();
  return out;
}

describe('polosa4 task53 · bare literals home-widgets', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('в зоне home-widgets нет голых янтарных литералов вне var fallback', () => {
    for (const [name, src] of [
      ['730-widgets-dashboard.css', WIDGETS_CSS],
      ['heys-components.css', COMPONENTS_CSS],
      ['heys_user_v12.js', USER_JS],
      ['heys_day_diary_section.js', DIARY_JS],
      ['heys_widgets_registry_v1.js', REGISTRY_JS],
      ['widget_data.js', WIDGET_DATA_JS],
    ]) {
      const hits = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => AMBER_BARE.test(line));
      expect(hits, name).toEqual([]);
    }
  });

  it('ключевые селекторы · sand/blue computed', () => {
    const scopedCss = `
.widget-cascade__dot--neutral { background: var(--v4-warn-soft, #eab308); }
.widget-insulin__status--almost {
  background: color-mix(in srgb, var(--v4-warn-soft, #eab308) 12%, transparent);
  color: var(--v4-warn-soft, #eab308);
}
.pct-badge--yellow {
  background: color-mix(in srgb, var(--v4-warn-soft, #eab308) 12%, transparent);
  color: var(--v4-warn-soft, #eab308);
}`;
    styles.push(injectCss(`${PALETTE_CSS}\n${scopedCss}`));

    const cases = [
      {
        theme: 'sand',
        cascadeDot: '#c9922e',
        warnSoft: '#c9922e',
      },
      {
        theme: 'blue',
        cascadeDot: '#c0871c',
        warnSoft: '#c0871c',
      },
    ];

    for (const c of cases) {
      mountPalette(c.theme);

      const cascade = probeHtml('<span class="widget-cascade__dot widget-cascade__dot--neutral"></span>', '.widget-cascade__dot--neutral');
      expect(cascade.backgroundColor, `${c.theme} cascade neutral`).toBe(c.cascadeDot);

      const insulin = probeHtml('<span class="widget-insulin__status widget-insulin__status--almost">скоро</span>', '.widget-insulin__status--almost');
      expect(insulin.color, `${c.theme} insulin almost color`).toBe(c.warnSoft);

      const pct = probeHtml('<span class="pct-badge pct-badge--yellow">42%</span>', '.pct-badge--yellow');
      expect(pct.color, `${c.theme} pct badge color`).toBe(c.warnSoft);
    }
  });

  it('CSS держит роли вместо янтарной лестницы', () => {
    expect(WIDGETS_CSS).toMatch(/\.widget-cascade__dot--neutral\s*\{[^}]*var\(--v4-warn-soft/);
    expect(WIDGETS_CSS).toMatch(/\.widget-insulin__status--almost\s*\{[^}]*color-mix\([^)]*--v4-warn-soft/);
    expect(WIDGETS_CSS).toMatch(/\.pct-badge--yellow\s*\{[^}]*color-mix\([^)]*--v4-warn-soft/);
    expect(WIDGETS_CSS).toMatch(/\.widget-streak__fire\s*\{[^}]*--v4-tint-warm/);
    expect(COMPONENTS_CSS).toMatch(/\.completeness-score--medium\s*\{[^}]*--v4-warn-text/);
    expect(USER_JS).toContain('const V4_WARN_SOFT');
    expect(DIARY_JS).toContain('const V4_WARN_SOFT');
    expect(REGISTRY_JS).toContain("color: 'var(--v4-warn-2");
    expect(WIDGET_DATA_JS).toContain("color: 'var(--v4-warn-soft");
  });
});
