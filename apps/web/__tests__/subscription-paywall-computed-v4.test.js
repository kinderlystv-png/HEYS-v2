/**
 * Task 113 — computed paywall/sub-screen geometry on sand + blue palettes.
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

function buildHost() {
  const host = document.createElement('div');
  host.id = 'ui-v4-subscription-screen-host';
  host.innerHTML = `
    <div class="paywall-overlay">
      <div class="paywall-modal">
        <div class="paywall-plans">
          <div class="paywall-plan selected">
            <div class="paywall-plan-main"><div class="paywall-plan-name">Pro</div></div>
            <div class="paywall-plan-price">7 990 ₽</div>
          </div>
        </div>
        <button type="button" class="paywall-cta">Оформить</button>
        <div class="paywall-trial paywall-trial--offer">
          <div class="paywall-trial-title">Место освободилось</div>
        </div>
      </div>
    </div>
    <div class="sub-screen">
      <div class="sub-screen__status-card"></div>
    </div>
  `;
  document.body.appendChild(host);
  return host;
}

describe('subscription paywall · computed sand/blue', () => {
  let paletteStyle;
  let paywallStyle;
  let host;

  afterEach(() => {
    paletteStyle?.remove();
    paywallStyle?.remove();
    host?.remove();
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  for (const themeId of ['sand', 'blue']) {
    it(`${themeId}: key paywall properties match v4 contract`, () => {
      mountPalette(themeId);
      paletteStyle = injectCss(PALETTE_CSS);
      paywallStyle = injectCss(PAYWALL_CSS);
      host = buildHost();

      const overlay = host.querySelector('.paywall-overlay');
      const modal = host.querySelector('.paywall-modal');
      const trial = host.querySelector('.paywall-trial');
      const cta = host.querySelector('.paywall-cta');
      const plan = host.querySelector('.paywall-plan');
      const card = host.querySelector('.sub-screen__status-card');

      const overlayCs = getComputedStyle(overlay);
      const modalCs = getComputedStyle(modal);
      const trialCs = getComputedStyle(trial);
      const ctaCs = getComputedStyle(cta);
      const planCs = getComputedStyle(plan);
      const cardCs = getComputedStyle(card);

      expect(modalCs.padding).toBe('22px 18px 18px');
      expect(modalCs.borderRadius).toBe('26px');
      expect(overlayCs.backdropFilter).toMatch(/blur\(2\.5px\)/);
      expect(trialCs.borderRadius).toBe('18px');
      expect(trialCs.padding).toBe('14px');
      expect(ctaCs.minHeight).toBe('48px');
      expect(planCs.borderRadius).toBe('18px');
      expect(cardCs.borderRadius).toBe('20px');
      expect(cardCs.padding).toBe('16px');

      const cardColor = normColor(cardCs.backgroundColor);
      const modalBg = normColor(modalCs.backgroundColor);
      if (themeId === 'sand') {
        expect(cardColor).toBe('#f7efe2');
        expect(modalBg).toBe('#fffaf1');
      } else {
        expect(cardColor).toBe('#eef3f9');
        expect(modalBg).toBe('#ffffff');
      }
    });
  }
});
