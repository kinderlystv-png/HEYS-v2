/**
 * Полоса 4 · задача 53 · фаза 2 — warm bare literals зона water-add.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(WEB_DIR, 'styles', 'modules');

const PALETTE_CSS = fs.readFileSync(path.join(MODULES, '002-ui-v4-palette-roles.css'), 'utf8');
const WIDGETS_CSS = fs.readFileSync(path.join(MODULES, '730-widgets-dashboard.css'), 'utf8');
const WATER_CSS = fs.readFileSync(path.join(MODULES, '400-water-and-hydration.css'), 'utf8');
const HANDLERS_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_day_day_handlers.js'), 'utf8');
const WIDGET_DATA_JS = fs.readFileSync(path.join(WEB_DIR, 'widgets', 'widget_data.js'), 'utf8');

const AMBER_BARE =
  /(?<!var\([^)]*,\s*)#(?:f59e0b|fbbf24|fcd34d|fde68a|fef3c7|eab308|facc15|fde047|d97706|b45309|92400e|78350f|713f12|451a03|f97316|ea580c|c2410c|9a3412|7c2d12|431407|fdba74|fed7aa|ffedd5|fb923c|ca8a04|a16207|854d0e|facc15)\b|rgba\(\s*249\s*,\s*115\s*,\s*22\s*,/i;

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

describe('polosa4 task53 · bare literals water-add', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('в зоне water-add нет голых янтарных литералов вне var fallback', () => {
    for (const [name, css] of [
      ['730-widgets-dashboard.css', WIDGETS_CSS],
      ['400-water-and-hydration.css', WATER_CSS],
      ['heys_day_day_handlers.js', HANDLERS_JS],
      ['widget_data.js', WIDGET_DATA_JS],
    ]) {
      const hits = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => AMBER_BARE.test(line));
      expect(hits, name).toEqual([]);
    }
  });

  it('water-add · sand/blue computed (плитка, бейдж, alarm)', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${WIDGETS_CSS}\n${WATER_CSS}`));

    const cases = [
      { theme: 'sand', normColor: '#6b5f4f', cascadeBg: '#c9922e' },
      { theme: 'blue', normColor: '#5a6474', cascadeBg: '#c0871c' },
    ];

    for (const c of cases) {
      mountPalette(c.theme);

      const norm = probeHtml(
        '<div class="widget-water--v4"><span class="widget-water__norm">из 2,7</span></div>',
        '.widget-water__norm',
      );
      expect(norm.color, `${c.theme} water norm`).toBe(c.normColor);

      const cascade = probeHtml(
        '<span class="widget-cascade__dot widget-cascade__dot--neutral"></span>',
        '.widget-cascade__dot--neutral',
      );
      expect(cascade.backgroundColor, `${c.theme} cascade neutral`).toBe(c.cascadeBg);
    }

    mountPalette('sand-dark');
    const alarmHost = document.createElement('div');
    alarmHost.innerHTML = '<div class="water-review"><span class="water-review__alarm">!</span></div>';
    document.body.appendChild(alarmHost);
    const alarmColor = normColor(getComputedStyle(alarmHost.querySelector('.water-review')).getPropertyValue('--wr-alarm'));
    alarmHost.remove();
    expect(alarmColor).toBe('#e0704f');
  });

  it('confetti и BMI overweight на ролях', () => {
    expect(HANDLERS_JS).toMatch(/var\(--v4-warn-1,\s*#d99a63\)/);
    expect(WIDGET_DATA_JS).toMatch(/var\(--v4-warn-soft,\s*#c9922e\)/);
    expect(WIDGETS_CSS).toMatch(/\.widget-cascade__dot--neutral\s*\{[^}]*var\(--v4-warn-soft/);
    expect(WIDGETS_CSS).toMatch(/\.pct-badge--yellow\s*\{[^}]*color-mix\(in srgb, var\(--v4-warn-soft/);
  });
});
