/**
 * Messenger thread/bubbles · v4 palette (sand + blue jsdom + chromium @375).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  getPlaywrightBrowser,
  releasePlaywrightBrowserForSuite,
  retainPlaywrightBrowserForSuite,
} from './helpers/playwright-browser.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const MESSENGER_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/1000-messenger.css'),
  'utf8',
);

const EXPECT = Object.freeze({
  sand: {
    ink: '#201e1d',
    hero: '#efe3cf',
    c1: '#f7efe2',
    act: '#c67139',
    tint: '#f6e6dd',
    inkDataRaw: 'rgba(0,0,0,0.56)',
    okText: '#5c6a45',
  },
  blue: {
    ink: '#101826',
    hero: '#e2ecf6',
    c1: '#eef3f9',
    act: '#1d5e96',
    tint: '#e8f0f8',
    inkDataRaw: 'rgba(16,24,38,0.64)',
    okText: '#1f6e4d',
  },
});

function normColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'initial' || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return '';
  if (raw.startsWith('#')) return raw;
  const rgba = raw.match(/^rgba\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+([\d.]+)\s*\)/);
  if (rgba) {
    const a = parseFloat(rgba[4]);
    const blend = (c) => Math.round(Number(c) * a + 255 * (1 - a));
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `#${hex(blend(rgba[1]))}${hex(blend(rgba[2]))}${hex(blend(rgba[3]))}`;
  }
  const rgb = raw.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
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

async function measureChromium(themeId) {
  const page = await (await getPlaywrightBrowser()).newPage({ viewport: { width: 375, height: 812 } });
  const theme = themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId;
  const palette = themeId.startsWith('blue') ? 'blue' : 'sand';
  await page.setContent(`<!DOCTYPE html><html data-theme-id="${themeId}" data-palette="${palette}" data-theme="${theme}"><head><meta charset="utf-8"><style>${PALETTE_CSS}\n${MESSENGER_CSS}</style></head>
<body style="margin:0;width:375px">
  <div class="messenger-thread">
  <button type="button" class="messenger-show-older">older</button>
  </div>
  <div class="msg-bubble msg-bubble-theirs">T</div>
  <div class="msg-bubble msg-bubble-mine">M</div>
  <span class="msg-meta">9:12</span>
  <div class="msg-date-label">Сегодня</div>
  <div class="msg-quote">quote</div>
  <div class="msg-applied-card"><span class="msg-applied-card__title">Внесено</span><button class="msg-applied-card__open">open</button></div>
  <div class="msg-intent"><div class="msg-intent__kicker">вес</div><div class="msg-intent__value">71,4 кг</div></div>
  <div class="messenger-search__field"><input class="messenger-search__input" value="q" /></div>
  <div class="messenger-search__snippet"><mark>hit</mark></div>
  <span class="msg-status msg-status--seen"><span class="msg-status__dot"></span>seen</span>
</body></html>`, { waitUntil: 'domcontentloaded' });
  const out = await page.evaluate(() => {
    const read = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const norm = (v) => String(v || '').replace(/\s/g, '');
    return {
      theirsBg: read('.msg-bubble-theirs', 'backgroundColor'),
      mineBg: read('.msg-bubble-mine', 'backgroundColor'),
      metaRaw: norm(read('.msg-meta', 'color')),
      showOlderBg: read('.messenger-show-older', 'backgroundColor'),
      quoteBorder: read('.msg-quote', 'borderLeftColor'),
      appliedBg: read('.msg-applied-card', 'backgroundColor'),
      appliedOpen: read('.msg-applied-card__open', 'color'),
      intentKicker: read('.msg-intent__kicker', 'color'),
      searchInputBg: read('.messenger-search__field', 'backgroundColor'),
      searchMark: read('.messenger-search__snippet mark', 'color'),
      seenDot: read('.msg-status__dot', 'backgroundColor'),
    };
  });
  await page.close();
  return out;
}

describe('messenger thread/bubbles · v4 palette (sand + blue)', () => {
  let styles = [];

  beforeAll(() => {
    retainPlaywrightBrowserForSuite();
  });

  afterAll(async () => {
    await releasePlaywrightBrowserForSuite();
  });

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('chromium @375: sand и blue computed для треда/пузырей', async () => {
    for (const id of ['sand', 'blue']) {
      const m = await measureChromium(id);
      const exp = EXPECT[id];
      expect(normColor(m.theirsBg), `${id} theirs`).toBe(exp.c1);
      expect(normColor(m.mineBg), `${id} mine`).toBe(exp.hero);
      expect(m.metaRaw, `${id} meta`).toBe(exp.inkDataRaw);
      expect(normColor(m.showOlderBg), `${id} show older`).toBe(exp.c1);
      expect(normColor(m.quoteBorder), `${id} quote ac`).toBe(exp.act);
      expect(normColor(m.appliedBg), `${id} applied card`).toBe(exp.c1);
      expect(normColor(m.appliedOpen), `${id} applied open`).toBe(exp.act);
      expect(normColor(m.intentKicker), `${id} intent kicker`).toBe(exp.act);
      expect(normColor(m.searchInputBg), `${id} search field`).toBe(exp.c1);
      expect(normColor(m.searchMark), `${id} search mark`).toBe(exp.act);
      expect(normColor(m.seenDot), `${id} status dot`).toBe(exp.okText);
    }
  }, 60_000);
});
