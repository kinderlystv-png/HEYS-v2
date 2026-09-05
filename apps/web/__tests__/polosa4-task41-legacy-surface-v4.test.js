/**
 * Полоса 4 · задача 41 · класс legacy-v4 (поверхности вне v4).
 * Computed sand/blue — по образцу strength B3 badges contract.
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
const BASE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
  'utf8',
);
const NUTRITION_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/732-ui-v4-nutrition.css'),
  'utf8',
);
const INSIGHTS_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/734-ui-v4-insights.css'),
  'utf8',
);
const LEGACY_MEAL_REC_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/720-predictive-insights.css'),
  'utf8',
);

const EXPECT = Object.freeze({
  sand: {
    hero: '#efe3cf',
    card: '#f7efe2',
    actText: '#8a4a20',
    ink2: '#8c8c8c',
    handle: '#242424',
  },
  blue: {
    hero: '#e2ecf6',
    card: '#eef3f9',
    actText: '#1d5e96',
    ink2: '#8c8c8c',
    handle: '#cfd2d8',
  },
});

function ruleBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) return '';
  const brace = css.indexOf('{', start);
  const end = css.indexOf('}', brace);
  return css.slice(brace + 1, end);
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

function probe(className) {
  const host = document.createElement('div');
  host.className = className;
  document.body.appendChild(host);
  const computed = getComputedStyle(host);
  const out = {
    backgroundColor: normColor(computed.backgroundColor),
    color: normColor(computed.color),
    borderTopWidth: computed.borderTopWidth,
    boxShadow: computed.boxShadow,
  };
  host.remove();
  return out;
}

describe('polosa4 task41 · legacy surfaces → v4 roles', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('gamification · hero--cream на песочном и синем (sand-lock через --v4-hero)', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${BASE_CSS}`));

    for (const id of ['sand', 'blue']) {
      mountPalette(id);
      const sheet = document.createElement('div');
      sheet.className = 'game-v4-sheet';
      const hero = document.createElement('div');
      hero.className = 'game-v4-sheet__hero game-v4-sheet__hero--cream';
      sheet.appendChild(hero);
      document.body.appendChild(sheet);
      expect(normColor(getComputedStyle(hero).backgroundColor), id).toBe(EXPECT.sand.hero);
      sheet.remove();
    }
  });

  it('nutrition-tab · meal-row num следует палитре на sand и blue', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${NUTRITION_CSS}`));

    mountPalette('sand');
    const sandNum = probe('nutrition-v4-meal-row__num');
    mountPalette('blue');
    const blueNum = probe('nutrition-v4-meal-row__num');

    expect(sandNum.backgroundColor).toBe(EXPECT.sand.hero);
    expect(blueNum.backgroundColor).toBe(EXPECT.blue.hero);
    expect(sandNum.backgroundColor).not.toBe(blueNum.backgroundColor);
    expect(sandNum.color).toBe(EXPECT.sand.actText);
    expect(blueNum.color).toBe(EXPECT.blue.actText);
  });

  it('reports-insights · meal-rec-card--v4 сбрасывает legacy 720 и рисует v4-card', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${LEGACY_MEAL_REC_CSS}\n${INSIGHTS_CSS}`));

    mountPalette('sand');
    const sandCard = probe('meal-rec-card meal-rec-card--v4');
    mountPalette('blue');
    const blueCard = probe('meal-rec-card meal-rec-card--v4');

    expect(sandCard.backgroundColor).toBe(EXPECT.sand.card);
    expect(blueCard.backgroundColor).toBe(EXPECT.blue.card);
    expect(ruleBlock(INSIGHTS_CSS, '.meal-rec-card--v4 {')).toContain('border: none');
    expect(ruleBlock(INSIGHTS_CSS, '.meal-rec-card--v4 {')).toContain('box-shadow: none');
    expect(ruleBlock(INSIGHTS_CSS, '.meal-rec-v4__why {')).toContain('var(--v4-ink-2');
  });

  it('settings-system · notify handle и scroll padding', () => {
    const handleRule = ruleBlock(BASE_CSS, '.notify-detail__handle {');
    expect(handleRule).toContain('rgba(var(--v4-ink-rgb');
    expect(handleRule).not.toContain('--v4-track');
    expect(ruleBlock(BASE_CSS, '.hdr-settings-sheet__scroll {')).toContain(
      'padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px))',
    );
  });

  it('CSS source · handle не на --v4-track, hero на --v4-hero', () => {
    expect(ruleBlock(BASE_CSS, '.notify-detail__handle {')).toContain('rgba(var(--v4-ink-rgb');
    expect(ruleBlock(BASE_CSS, '.game-v4-sheet__hero--cream {')).toContain('var(--v4-hero');
    expect(ruleBlock(INSIGHTS_CSS, '.meal-rec-card--v4 {')).toContain('border: none');
    expect(ruleBlock(NUTRITION_CSS, '.nutrition-v4-meal-row__num {')).toContain('var(--v4-hero');
    expect(NUTRITION_CSS).not.toMatch(/nutrition-v4-meal-row__items[\s\S]{0,120}var\(--ink\)/);
  });
});
