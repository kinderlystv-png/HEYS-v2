/**
 * Полоса 4 · задача 53 · фаза 2 — warm literals зоны spinners.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(WEB_DIR, 'styles', 'modules');

const PALETTE_CSS = fs.readFileSync(path.join(MODULES, '002-ui-v4-palette-roles.css'), 'utf8');
const BOOT_MARK_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles', 'heys-boot-mark.css'), 'utf8');
const CONSENTS_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_consents_v1.js'), 'utf8');
const STEP_MODAL_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_step_modal_v1.js'), 'utf8');

const BARE_WARM =
  /(?<!var\([^)]*,\s*)#(?:fef3c7|f59e0b|92400e|a1471c|eab308|fbbf24|facc15|f97316)\b|rgba\(\s*234\s*,\s*179\s*,\s*8\s*,/i;

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

function probeBg(selector, html, root = document.body) {
  let el;
  if (selector === ':root') {
    el = document.documentElement;
  } else {
    const host = document.createElement('div');
    host.innerHTML = html;
    root.appendChild(host);
    el = host.querySelector(selector);
    const bg = normColor(getComputedStyle(el).backgroundColor);
    host.remove();
    return bg;
  }
  return normColor(getComputedStyle(el).backgroundColor);
}

describe('polosa4 task53 · bare literals spinners', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('heys-boot-mark.css · нет голых warm-литералов вне var fallback', () => {
    expect(bareWarmLines(BOOT_MARK_CSS)).toEqual([]);
    expect(BOOT_MARK_CSS).toMatch(/--boot-disc:\s*var\(--v4-hero/);
    expect(BOOT_MARK_CSS).toMatch(/--boot-ok-disc:\s*var\(--v4-ok-bg/);
    expect(BOOT_MARK_CSS).toMatch(/--boot-fail-stroke:\s*var\(--v4-warn-3/);
  });

  it('heys_consents_v1.js · marketing friendlySummary на v4 warn-ролях', () => {
    expect(bareWarmLines(CONSENTS_JS)).toEqual([]);
    expect(CONSENTS_JS).toMatch(/marketing:\s*\{[\s\S]*?color:\s*V4_WARN_SURFACE/);
    expect(CONSENTS_JS).toMatch(/marketing:\s*\{[\s\S]*?borderColor:\s*V4_WARN_BORDER/);
    expect(CONSENTS_JS).toMatch(/marketing:\s*\{[\s\S]*?textColor:\s*V4_WARN_TEXT/);
  });

  it('heys_step_modal_v1.js · daily footer reason на warn-text', () => {
    expect(bareWarmLines(STEP_MODAL_JS)).toEqual([]);
    expect(STEP_MODAL_JS).toMatch(/mc-daily-footer-reason[\s\S]*?var\(--v4-warn-text/);
  });

  it('boot mark discs · computed sand/blue', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${BOOT_MARK_CSS}`));

    const cases = [
      {
        theme: 'sand',
        disc: '#efe3cf',
        okDisc: '#eaefe0',
        failDisc: '#f6e6dd',
        pageBg: '#fffaf1',
      },
      {
        theme: 'blue',
        disc: '#e2ecf6',
        okDisc: '#e4efe7',
        failDisc: '#fbe6e2',
        pageBg: '#ffffff',
      },
    ];

    for (const c of cases) {
      mountPalette(c.theme);
      document.documentElement.setAttribute('data-theme', c.theme);

      expect(probeBg(':root', ''), `${c.theme} page bg`).toBe(c.pageBg);
      expect(
        probeBg('.heys-boot-mark__disc', '<div class="heys-boot-mark"><span class="heys-boot-mark__disc"></span></div>'),
        `${c.theme} default disc`,
      ).toBe(c.disc);
      expect(
        probeBg(
          '.heys-wait-mark__disc',
          '<div class="heys-wait-mark is-ok"><span class="heys-wait-mark__disc"></span></div>',
        ),
        `${c.theme} ok disc`,
      ).toBe(c.okDisc);
      expect(
        probeBg(
          '.heys-boot-mark__disc',
          '<div class="heys-boot-mark is-fail"><span class="heys-boot-mark__disc"></span></div>',
        ),
        `${c.theme} fail disc`,
      ).toBe(c.failDisc);
    }
  });
});
