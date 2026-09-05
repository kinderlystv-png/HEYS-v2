/**
 * Полоса 4 · задача 46 · фаза 1 — warm literals вне зон вердиктов (3 правимых файла).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = path.join(WEB_DIR, 'styles');
const MODULES = path.join(STYLES, 'modules');

const PALETTE_CSS = fs.readFileSync(path.join(MODULES, '002-ui-v4-palette-roles.css'), 'utf8');
const CRITICAL_CSS = fs.readFileSync(path.join(STYLES, 'critical.css'), 'utf8');
const TRAINING_CSS = fs.readFileSync(path.join(MODULES, '612-training-step.css'), 'utf8');
const METABOLIC_CSS = fs.readFileSync(path.join(MODULES, '725-metabolic-intelligence.css'), 'utf8');

const BARE_WARM = /(?<!var\([^)]*,\s*)#(?:eab308|f5ead8|f3e0d2)\b|rgba\(\s*234\s*,\s*179\s*,\s*8\s*,/i;

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

describe('polosa4 task46 · bare literals phase1 (outside verdict zones)', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('в правимых файлах нет голых warm-литералов вне var fallback', () => {
    for (const [name, css] of [
      ['critical.css', CRITICAL_CSS],
      ['612-training-step.css', TRAINING_CSS],
      ['725-metabolic-intelligence.css', METABOLIC_CSS],
    ]) {
      const hits = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => BARE_WARM.test(line));
      expect(hits, name).toEqual([]);
    }
  });

  it('critical · hdr-top dark ink + past-day tint + tone-yellow (sand/blue computed)', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${CRITICAL_CSS}`));

    const cases = [
      { theme: 'sand-dark', hdrColor: '#f2ede6', pastBg: '#3a2620' },
      { theme: 'blue-dark', hdrColor: '#eef3f8', pastBg: '#1b3a54' },
      { theme: 'sand', hdrColor: '#201e1d', pastBg: '#f3e0d2', yellowBg: '#fffaf1' },
      { theme: 'blue', hdrColor: '#101826', pastBg: '#f3e0d2', yellowBg: '#ffffff' },
    ];

    for (const c of cases) {
      mountPalette(c.theme);
      const hdr = probeHtml('<div class="hdr-top"></div>', '.hdr-top');
      expect(hdr.color, `${c.theme} hdr-top`).toBe(c.hdrColor);

      const past = probeHtml(
        '<div class="hdr-date-group"><div class="date-picker date-picker--v4"><button class="date-picker-trigger date-picker-trigger--not-today"></button></div></div>',
        '.date-picker-trigger--not-today',
      );
      expect(past.backgroundColor, `${c.theme} past-day`).toBe(c.pastBg);

      if (c.yellowBg) {
        const yellow = probeHtml('<div class="card tone-yellow"></div>', '.card.tone-yellow');
        expect(yellow.backgroundColor, `${c.theme} tone-yellow`).toBe(c.yellowBg);
      }
    }
  });

  it('sliders · middle stop на var(--v4-warn-soft)', () => {
    expect(TRAINING_CSS).toMatch(/\.ts-slider\s*\{[^}]*var\(--v4-warn-soft/);
    expect(TRAINING_CSS).toMatch(/\.ts-slider-negative\s*\{[^}]*var\(--v4-warn-soft/);
    expect(METABOLIC_CSS).toMatch(
      /\.whatif-custom__field input\[type="range"\]\s*\{[^}]*var\(--v4-warn-soft/,
    );
  });
});
