/**
 * Unified palette stand — 14 zones × 4 palette sets (computed, root attrs).
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  formatFindingsTable,
  mountPaletteSet,
  readModuleCss,
  readWebCss,
  runPaletteStand,
  unmountPaletteSet,
  V4_PALETTE_SETS,
} from './helpers/v4-palette-stand.mjs';

const BASE = ['001-design-tokens.css', '002-ui-v4-palette-roles.css'];
const baseGamification = readModuleCss(...BASE, '000-base-and-gamification.css');
const loginCss = readModuleCss(...BASE, '733-ui-v4-login-theme.css');
const pwaCss = readModuleCss(...BASE, '500-pwa-and-offline.css');
const bootMarkCss = readWebCss('styles/heys-boot-mark.css');
const componentsCss = readWebCss('styles/heys-components.css');
const subscriptionCss = readModuleCss(...BASE, '735-ui-v4-subscription.css');
const messengerCss = readModuleCss(...BASE, '1000-messenger.css');
const waterCss = readModuleCss(...BASE, '400-water-and-hydration.css');
const productCss = readModuleCss(...BASE, '611-aps-product-card.css', '600-steps-and-aps.css');

/** @type {import('./helpers/v4-palette-stand.mjs').PaletteScreen[]} */
const ZONE_SCREENS = [
  {
    zone: 'login',
    css: [baseGamification, loginCss],
    html: `
      <div class="heys-auth-shell heys-auth-shell-client">
        <div class="heys-auth-card">
          <button type="button" class="heys-auth-key">1</button>
          <p class="heys-auth-error-slot"></p>
        </div>
      </div>`,
    probes: [
      { id: 'shell-bg', selector: '.heys-auth-shell', props: ['backgroundColor'], kind: 'surface' },
      { id: 'card-bg', selector: '.heys-auth-card', props: ['backgroundColor', 'color'], kind: 'surface' },
      { id: 'key-label', selector: '.heys-auth-key', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3 },
    ],
  },
  {
    zone: 'registration',
    css: [baseGamification, loginCss],
    html: `
      <div class="heys-consent-sign-sheet">
        <button type="button" class="heys-consent-sign-sheet__primary">Подписать</button>
        <p class="consent-doc-body">Юридический текст</p>
      </div>`,
    probes: [
      { id: 'primary-cta', selector: '.heys-consent-sign-sheet__primary', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3 },
      { id: 'legal-body', selector: '.consent-doc-body', props: ['color', 'backgroundColor'], kind: 'text', fgRole: '--v4-ink-2' },
    ],
  },
  {
    zone: 'questionnaire',
    css: [baseGamification, pwaCss],
    html: `
      <div id="intake-shell" style="background:var(--v4-chip,#efe3cf);color:var(--v4-ink,#201e1d);padding:16px;border-radius:20px">
        <div id="intake-warning" style="background:var(--v4-card,#f7efe2);color:var(--v4-ink-2,rgba(0,0,0,.56));padding:14px 16px;border-radius:18px">Предупреждение</div>
        <button type="button" class="mc-modal__cta" style="margin-top:12px;min-height:48px;width:100%;border:0;border-radius:14px;background:var(--v4-act,#c67139);color:var(--v4-btn-on-act,#2b1608)">Дальше</button>
      </div>`,
    probes: [
      { id: 'warning-block', selector: '#intake-warning', props: ['color', 'backgroundColor'], kind: 'text' },
      { id: 'shell', selector: '#intake-shell', props: ['backgroundColor', 'color'], kind: 'surface' },
    ],
  },
  {
    zone: 'first-run',
    css: [baseGamification, pwaCss],
    bodyStyle: 'margin:0;padding:24px 16px;background:var(--v4-hero,#efe3cf);color:var(--v4-ink,#201e1d)',
    html: `
      <div class="desktop-gate__url-row">
        <span class="desktop-gate__url">https://heys.app</span>
        <button type="button" class="desktop-gate__copy-btn">Скопировать</button>
      </div>`,
    probes: [
      { id: 'copy-btn', selector: '.desktop-gate__copy-btn', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3 },
    ],
  },
  {
    zone: 'app-splash',
    css: [baseGamification, bootMarkCss],
    html: '<div class="heys-boot-mark"><span class="heys-boot-mark__disc"></span></div>',
    probes: [
      { id: 'disc', selector: '.heys-boot-mark__disc', props: ['backgroundColor'], kind: 'surface' },
    ],
  },
  {
    zone: 'spinners',
    css: [baseGamification, bootMarkCss, componentsCss],
    html: '<div class="heys-wait-mark is-ok"><span class="heys-wait-mark__disc"></span></div>',
    probes: [
      { id: 'wait-disc', selector: '.heys-wait-mark__disc', props: ['backgroundColor'], kind: 'surface' },
    ],
  },
  {
    zone: 'pwa-update',
    css: [baseGamification, componentsCss],
    html: `
      <div class="heys-update-prompt">
        <div class="heys-update-prompt__backdrop"></div>
        <div class="heys-update-prompt__card">
          <div class="heys-update-modal__icon"><span class="heys-update-modal__glyph">↻</span></div>
          <div class="heys-update-prompt__title">Обновление</div>
          <p class="heys-update-prompt__text">Подождите</p>
        </div>
      </div>`,
    probes: [
      { id: 'card', selector: '.heys-update-prompt__card', props: ['backgroundColor', 'color', 'borderTopColor', 'borderTopWidth', 'borderTopStyle'], kind: 'surface' },
      { id: 'card-text', selector: '.heys-update-prompt__text', props: ['color', 'backgroundColor'], kind: 'text', fgRole: '--v4-ink' },
      { id: 'icon', selector: '.heys-update-modal__icon', props: ['backgroundColor', 'color'], kind: 'text', minContrast: 3 },
    ],
  },
  {
    zone: 'subscription',
    css: [baseGamification, subscriptionCss],
    html: `
      <div class="paywall-overlay">
        <div class="paywall-modal">
          <button type="button" class="paywall-cta">Оформить</button>
          <div class="sub-screen__status-card"></div>
        </div>
      </div>`,
    probes: [
      { id: 'modal', selector: '.paywall-modal', props: ['backgroundColor', 'color'], kind: 'surface' },
      { id: 'cta', selector: '.paywall-cta', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3 },
      { id: 'status-card', selector: '.sub-screen__status-card', props: ['backgroundColor'], kind: 'surface' },
    ],
  },
  {
    zone: 'settings-system',
    css: [baseGamification],
    html: `
      <div class="tab-settings-menu tab-settings-menu--v4-sheet">
        <div class="hdr-settings-sheet__card">
          <div class="hdr-settings-sheet__head">
            <div class="hdr-settings-sheet__title">Настройки</div>
            <button type="button" class="hdr-settings-sheet__close">×</button>
          </div>
        </div>
      </div>`,
    probes: [
      { id: 'sheet-card', selector: '.hdr-settings-sheet__card', props: ['backgroundColor'], kind: 'surface' },
      { id: 'close', selector: '.hdr-settings-sheet__close', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3, fgRole: '--v4-ink-3' },
    ],
  },
  {
    zone: 'service-curator',
    css: [waterCss],
    html: `
      <div class="advice-service-note">Раздел виден только по входу куратора.</div>
      <div class="advice-service-list">
        <button type="button" class="advice-service-row">
          <span class="advice-service-row__title">Техлог</span>
          <span class="advice-service-row__hint">Что сработало</span>
        </button>
      </div>`,
    probes: [
      { id: 'note', selector: '.advice-service-note', props: ['color', 'backgroundColor'], kind: 'text', fgRole: '--v4-ink-2', minContrast: 4 },
      { id: 'row-title', selector: '.advice-service-row__title', props: ['color'], kind: 'text', fgRole: '--v4-ink-2', minContrast: 4 },
      { id: 'row-divider', selector: '.advice-service-row', props: ['borderBottomColor', 'borderBottomWidth', 'borderBottomStyle', 'backgroundColor'], kind: 'border', borderRole: '--v4-line' },
    ],
  },
  {
    zone: 'messenger',
    css: [messengerCss],
    html: `
      <div class="messenger-empty">
        <div class="messenger-empty__text">Напишите куратору</div>
        <button type="button" class="messenger-empty__prompt">Фото завтрака</button>
      </div>
      <div class="msg-bubble msg-bubble-theirs">Привет</div>`,
    probes: [
      { id: 'empty-text', selector: '.messenger-empty__text', props: ['color'], kind: 'text', fgRole: '--v4-ink-2', minContrast: 3.8 },
      { id: 'prompt', selector: '.messenger-empty__prompt', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3 },
      { id: 'bubble', selector: '.msg-bubble-theirs', props: ['color', 'backgroundColor'], kind: 'text' },
    ],
  },
  {
    zone: 'undo-bar',
    css: [componentsCss],
    html: `
      <div class="heys-undo-bar heys-undo-bar--visible">
        <div class="heys-undo-bar__content">
          <span class="heys-undo-bar__label">Удалён приём</span>
          <button type="button" class="heys-undo-bar__btn">Вернуть</button>
        </div>
      </div>`,
    probes: [
      { id: 'bar', selector: '.heys-undo-bar', props: ['backgroundColor', 'color'], kind: 'surface' },
      { id: 'label', selector: '.heys-undo-bar__label', props: ['color', 'backgroundColor'], kind: 'text' },
      { id: 'btn', selector: '.heys-undo-bar__btn', props: ['color', 'backgroundColor'], kind: 'text', minContrast: 3 },
    ],
  },
  {
    zone: 'water-add',
    css: [waterCss],
    html: `
      <div class="water-review">
        <div class="water-review__chip">250 мл</div>
        <div class="water-custom-sheet__title">Свой объём</div>
      </div>`,
    probes: [
      { id: 'review-card', selector: '.water-review', props: ['backgroundColor'], kind: 'surface' },
      { id: 'sheet-title', selector: '.water-custom-sheet__title', props: ['color', 'backgroundColor'], kind: 'text' },
    ],
  },
  {
    zone: 'product-card',
    css: [productCss],
    html: `
      <div class="aps-product-card"><span class="aps-product-card__name">Молоко</span></div>
      <div class="aps-barcode-manual">
        <input class="aps-barcode-input" value="460123">
        <button type="button" class="aps-barcode-submit">→</button>
      </div>`,
    probes: [
      { id: 'card', selector: '.aps-product-card', props: ['backgroundColor', 'color'], kind: 'surface' },
      { id: 'barcode-input', selector: '.aps-barcode-input', props: ['color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderTopStyle'], kind: 'text' },
    ],
  },
];

describe('v4 palette stand · 14 zones × 4 sets', () => {
  /** @type {ReturnType<typeof runPaletteStand> | null} */
  let report = null;

  afterEach(() => {
    report = null;
  });

  it('mounts palette attrs on documentElement (002-ui-v4-palette-roles.css)', () => {
    for (const set of V4_PALETTE_SETS) {
      mountPaletteSet(document, set);
      expect(document.documentElement.getAttribute('data-theme-id')).toBe(set.themeId);
      expect(document.documentElement.getAttribute('data-theme')).toBe(set.theme);
      expect(document.documentElement.getAttribute('data-palette')).toBe(set.palette);
      unmountPaletteSet(document);
    }
  });

  it('audits all configured zones and self-reports limitations', { timeout: 120000 }, () => {
    report = runPaletteStand(document, ZONE_SCREENS);
    expect(report.renderedScreens).toBe(14);
    expect(report.skippedScreens).toBe(0);
    expect(report.limitations[0]).toMatch(/^screens rendered: 14\/14/);
    if (report.unknownBlindness > 0) {
      expect(report.limitations.some((line) => line.includes('unknown'))).toBe(true);
    }
    const findings = formatFindingsTable(report);
    expect(findings, JSON.stringify({ limitations: report.limitations, findings }, null, 2)).toEqual([]);
  });
});

export { ZONE_SCREENS, report };
