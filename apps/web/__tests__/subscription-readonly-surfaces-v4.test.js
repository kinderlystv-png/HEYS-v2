/**
 * Task 124 — readonly banner, blocked toast, contact modal vs subscription canvas.
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
const PAYWALL_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_paywall_v1.js'), 'utf8');
const SUBS_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_subscriptions_v1.js'), 'utf8');
const CONTACT_CURATOR_SOURCE = SUBS_JS.slice(
  SUBS_JS.indexOf('function ContactCuratorScreen('),
  SUBS_JS.indexOf('function openCuratorContactModal('),
);

const HERO = Object.freeze({
  sand: '#efe3cf',
  blue: '#e2ecf6',
});

const TINT = Object.freeze({
  sand: '#f6e6dd',
  blue: '#fbe6e2',
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

function buildHost() {
  const host = document.createElement('div');
  host.id = 'ui-v4-subscription-screen-host';
  host.innerHTML = `
    <div class="readonly-banner readonly-banner--sticky">
      <div class="readonly-banner-content">
        <div class="readonly-banner-title">Доступ только для чтения</div>
        <div class="readonly-banner-text">Чтобы записывать — напишите в поддержку</div>
      </div>
      <button type="button" class="readonly-banner-pill">Подписка</button>
    </div>
    <div class="readonly-toast">
      <span class="readonly-toast-icon"></span>
      <span class="readonly-toast-label">Запись недоступна — только чтение</span>
      <button type="button" class="readonly-toast-action">Подписка</button>
    </div>
    <div class="paywall-overlay">
      <div class="paywall-modal sub-contact-modal">
        <div class="sub-contact__lock"></div>
        <a class="sub-contact__row" href="#">
          <span class="sub-contact__row-icon"></span>
          <span class="sub-contact__row-text"><b>Поддержка HEYS</b><small>@heys_support</small></span>
        </a>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  return host;
}

describe('subscription readonly surfaces · source anchors', () => {
  it('banner copy and pill use v4 classes', () => {
    expect(PAYWALL_JS).toContain('Доступ только для чтения');
    expect(PAYWALL_JS).toContain('Чтобы записывать — напишите в поддержку');
    expect(PAYWALL_JS).toContain('readonly-banner-pill');
    expect(PAYWALL_JS).toContain('readonly-banner--sticky');
    expect(PAYWALL_CSS).toMatch(/\.readonly-banner[\s\S]*var\(--v4-hero/);
  });

  it('blocked toast keeps lock svg path in source', () => {
    expect(PAYWALL_JS).toContain('Запись недоступна — только чтение');
    expect(PAYWALL_JS).toContain('M7 11V7a5 5 0 0 1 10 0v4');
    expect(PAYWALL_CSS).toMatch(/\.readonly-toast[\s\S]*border-radius:\s*12px/);
    expect(PAYWALL_CSS).toMatch(/\.readonly-toast[\s\S]*#1f2937/);
  });

  it('contact screen uses paywall modal rows without legacy gradient', () => {
    expect(CONTACT_CURATOR_SOURCE).toContain('sub-contact__row');
    expect(CONTACT_CURATOR_SOURCE).toContain('Поддержка HEYS');
    expect(CONTACT_CURATOR_SOURCE).not.toContain('linear-gradient(135deg, #2563eb');
    expect(CONTACT_CURATOR_SOURCE).not.toContain('👨‍⚕️');
    expect(PAYWALL_CSS).toContain('.sub-contact__lock');
  });
});

describe('subscription readonly surfaces · computed sand/blue', () => {
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
    it(`${themeId}: banner, toast and contact row colors`, () => {
      mountPalette(themeId);
      paletteStyle = injectCss(PALETTE_CSS);
      paywallStyle = injectCss(PAYWALL_CSS);
      host = buildHost();

      const banner = host.querySelector('.readonly-banner--sticky');
      const toast = host.querySelector('.readonly-toast');
      const row = host.querySelector('.sub-contact__row');
      const lock = host.querySelector('.sub-contact__lock');

      expect(normColor(getComputedStyle(banner).backgroundColor)).toBe(HERO[themeId]);
      expect(getComputedStyle(banner).padding).toBe('12px 14px');
      expect(getComputedStyle(toast).borderRadius).toBe('12px');
      expect(getComputedStyle(toast).padding).toBe('12px 20px');
      expect(normColor(getComputedStyle(lock).backgroundColor)).toBe(TINT[themeId]);
      expect(getComputedStyle(row).minHeight).toBe('52px');
      const scrim = getComputedStyle(document.documentElement).getPropertyValue('--scrim').trim();
      expect(scrim).toBeTruthy();
      expect(PAYWALL_CSS).toMatch(/background:\s*var\(--scrim/);
    });
  }
});
