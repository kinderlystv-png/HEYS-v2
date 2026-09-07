/**
 * Messenger · пустой тред + тред с карточкой дня — geometry/CSS + palette @375.
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
const MESSENGER_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/1000-messenger.css'),
  'utf8',
);
const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const MESSENGER_JS = fs.readFileSync(path.join(WEB_DIR, 'heys_messenger_v1.js'), 'utf8');

const EXPECT = Object.freeze({
  sand: {
    ink: '#201e1d',
    hero: '#efe3cf',
    c1: '#f7efe2',
    act: '#c67139',
    inkDataRaw: 'rgba(0,0,0,0.56)',
    okText: '#5c6a45',
  },
  blue: {
    ink: '#101826',
    hero: '#e2ecf6',
    c1: '#eef3f9',
    act: '#1d5e96',
    inkDataRaw: 'rgba(0,0,0,0.61)',
    okText: '#1f6e4d',
  },
  'sand-dark': {
    ink: '#f2ede6',
    hero: '#2f2820',
    c1: '#23201b',
    act: '#cf8144',
    inkDataRaw: 'rgba(242,237,230,0.63)',
    okText: '#9fb981',
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

function parseRules(cssText) {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  const re = /([^{]+)\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(stripped))) {
    const body = match[2];
    for (const part of match[1].split(',')) {
      const sel = part.replace(/\s+/g, ' ').trim();
      if (sel && !sel.startsWith('@')) rules.set(sel, body);
    }
  }
  return rules;
}

async function measureFrame(themeId) {
  const page = await (await getPlaywrightBrowser()).newPage({ viewport: { width: 375, height: 812 } });
  const theme = themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId;
  const palette = themeId.startsWith('blue') ? 'blue' : 'sand';
  await page.setContent(`<!DOCTYPE html><html data-theme-id="${themeId}" data-palette="${palette}" data-theme="${theme}"><head><meta charset="utf-8"><style>${PALETTE_CSS}\n${MESSENGER_CSS}</style></head>
<body style="margin:0;width:375px">
  <div class="messenger-empty">
    <div class="messenger-empty__badge">i</div>
    <div class="messenger-empty__title">title</div>
    <div class="messenger-empty__text">text</div>
    <div class="messenger-empty__prompts"><button type="button" class="messenger-empty__prompt">Фото завтрака</button></div>
  </div>
  <div class="messenger-thread"><button type="button" class="messenger-show-older">older</button></div>
  <div class="msg-bubble msg-bubble-mine"><div class="msg-attachments msg-attachments-count-1"><div class="msg-attachment-item"><img alt=""></div></div></div>
  <div class="msg-applied-card">
    <div class="msg-applied-card__head"><span class="msg-applied-card__dot"></span><span class="msg-applied-card__title">t</span><span class="msg-applied-card__meta">m</span></div>
    <div class="msg-applied-card__items"><div class="msg-applied-card__item"><span class="msg-applied-card__name">n</span><span class="msg-applied-card__grams">180 г</span><span class="msg-applied-card__kcal">210 ккал</span></div></div>
    <div class="msg-applied-card__foot"><span class="msg-applied-card__total">540</span><button class="msg-applied-card__open">open</button></div>
  </div>
</body></html>`, { waitUntil: 'domcontentloaded' });
  const out = await page.evaluate(() => {
    const read = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const norm = (v) => String(v || '').replace(/\s/g, '');
    return {
      emptyPad: read('.messenger-empty', 'padding'),
      emptyTextMt: read('.messenger-empty__text', 'marginTop'),
      emptyTextFs: read('.messenger-empty__text', 'fontSize'),
      emptyTextLh: read('.messenger-empty__text', 'lineHeight'),
      emptyTextColor: norm(read('.messenger-empty__text', 'color')),
      promptsDir: read('.messenger-empty__prompts', 'flexDirection'),
      promptsGap: read('.messenger-empty__prompts', 'gap'),
      promptsMt: read('.messenger-empty__prompts', 'marginTop'),
      promptJc: read('.messenger-empty__prompt', 'justifyContent'),
      promptBg: read('.messenger-empty__prompt', 'backgroundColor'),
      badgeBg: read('.messenger-empty__badge', 'backgroundColor'),
      badgeColor: read('.messenger-empty__badge', 'color'),
      showOlderMinH: read('.messenger-show-older', 'minHeight'),
      showOlderPad: read('.messenger-show-older', 'padding'),
      showOlderBg: read('.messenger-show-older', 'backgroundColor'),
      showOlderColor: norm(read('.messenger-show-older', 'color')),
      photoW: read('.msg-attachments-count-1 .msg-attachment-item', 'width'),
      photoH: read('.msg-attachments-count-1 .msg-attachment-item', 'height'),
      cardHeadGap: read('.msg-applied-card__head', 'gap'),
      cardTitleFlex: read('.msg-applied-card__title', 'flexGrow'),
      cardItemsGap: read('.msg-applied-card__items', 'gap'),
      cardItemsMt: read('.msg-applied-card__items', 'marginTop'),
      cardKcalW: read('.msg-applied-card__kcal', 'width'),
      cardKcalAlign: read('.msg-applied-card__kcal', 'textAlign'),
      cardFootBt: read('.msg-applied-card__foot', 'borderTopWidth'),
      cardFootMt: read('.msg-applied-card__foot', 'marginTop'),
      cardFootPt: read('.msg-applied-card__foot', 'paddingTop'),
      cardBg: read('.msg-applied-card', 'backgroundColor'),
      cardTitleColor: read('.msg-applied-card__title', 'color'),
      cardMetaColor: norm(read('.msg-applied-card__meta', 'color')),
      cardOpenColor: read('.msg-applied-card__open', 'color'),
      cardDot: read('.msg-applied-card__dot', 'backgroundColor'),
    };
  });
  await page.close();
  return out;
}

describe('messenger empty thread + applied card geometry', () => {
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
  });

  it('CSS rules match canvas contract for empty thread + applied card', () => {
    const rules = parseRules(MESSENGER_CSS);
    expect(rules.get('.messenger-empty')).toMatch(/padding:\s*0\s+28px/);
    expect(rules.get('.messenger-empty__text')).toMatch(/margin-top:\s*8px/);
    expect(rules.get('.messenger-empty__text')).toMatch(/font-size:\s*12\.5px/);
    expect(rules.get('.messenger-empty__text')).toMatch(/line-height:\s*1\.5/);
    expect(rules.get('.messenger-empty__prompts')).toMatch(/flex-direction:\s*column/);
    expect(rules.get('.messenger-empty__prompts')).toMatch(/gap:\s*8px/);
    expect(rules.get('.messenger-empty__prompts')).toMatch(/margin-top:\s*20px/);
    expect(rules.get('.messenger-empty__prompt')).toMatch(/justify-content:\s*center/);
    expect(rules.get('.msg-applied-card__head')).toMatch(/gap:\s*7px/);
    expect(rules.get('.msg-applied-card__title')).toMatch(/flex:\s*1/);
    expect(rules.get('.msg-applied-card__items')).toMatch(/gap:\s*5px/);
    expect(rules.get('.msg-applied-card__items')).toMatch(/margin-top:\s*9px/);
    expect(rules.get('.msg-applied-card__kcal')).toMatch(/width:\s*56px/);
    expect(rules.get('.msg-applied-card__kcal')).toMatch(/text-align:\s*right/);
    expect(rules.get('.msg-applied-card__foot')).toMatch(/margin-top:\s*10px/);
    expect(rules.get('.msg-applied-card__foot')).toMatch(/padding-top:\s*9px/);
    expect(rules.get('.msg-attachments-count-1 .msg-attachment-item')).toMatch(/width:\s*170px/);
    expect(rules.get('.msg-attachments-count-1 .msg-attachment-item')).toMatch(/height:\s*118px/);
  });

  it('Icon viewBox 24×24 and canvas paths for frame controls', () => {
    expect(MESSENGER_JS).toContain("viewBox: '0 0 24 24'");
    expect(MESSENGER_JS).toContain("paths: ['M18 6L6 18M6 6l12 12']");
    expect(MESSENGER_JS).toContain("paths: ['M12 19V5M5 12l7-7 7 7']");
    expect(MESSENGER_JS).toContain("paths: ['M20 6L9 17l-5-5']");
    expect(MESSENGER_JS).toContain('cx: 5, cy: 12, r: 1.4');
    expect(MESSENGER_JS).toContain('M21 11.5a8.4 8.4 0 0 1-9 8.4');
  });

  it('chromium @375: sand, blue, sand-dark computed geometry + palette', async () => {
    for (const id of ['sand', 'blue', 'sand-dark']) {
      const m = await measureFrame(id);
      const exp = EXPECT[id] || EXPECT.sand;
      expect(m.emptyPad, `${id} empty pad`).toBe('0px 28px');
      expect(m.emptyTextMt, `${id} text mt`).toBe('8px');
      expect(m.emptyTextFs, `${id} text fs`).toBe('12.5px');
      expect(parseFloat(m.emptyTextLh), `${id} text lh`).toBeCloseTo(18.75, 1);
      expect(m.promptsDir, `${id} prompts dir`).toBe('column');
      expect(m.promptsGap, `${id} prompts gap`).toBe('8px');
      expect(m.promptsMt, `${id} prompts mt`).toBe('20px');
      expect(m.promptJc, `${id} prompt jc`).toBe('center');
      expect(m.showOlderMinH, `${id} show older`).toBe('44px');
      expect(m.photoW, `${id} photo w`).toBe('170px');
      expect(m.photoH, `${id} photo h`).toBe('118px');
      expect(m.cardHeadGap, `${id} card head gap`).toBe('7px');
      expect(m.cardTitleFlex, `${id} card title flex`).toBe('1');
      expect(m.cardItemsGap, `${id} card items gap`).toBe('5px');
      expect(m.cardItemsMt, `${id} card items mt`).toBe('9px');
      expect(m.cardKcalW, `${id} card kcal w`).toBe('56px');
      expect(m.cardKcalAlign, `${id} card kcal align`).toBe('right');
      expect(m.cardFootBt, `${id} card foot border`).toBe('1px');
      expect(m.cardFootMt, `${id} card foot mt`).toBe('10px');
      expect(m.cardFootPt, `${id} card foot pt`).toBe('9px');
      expect(normColor(m.promptBg), `${id} prompt bg`).toBe(exp.c1);
      expect(normColor(m.badgeBg), `${id} badge bg`).toBe(exp.hero);
      expect(normColor(m.badgeColor), `${id} badge ac`).toBe(exp.act);
      expect(normColor(m.showOlderBg), `${id} show older bg`).toBe(exp.c1);
      expect(m.showOlderColor, `${id} show older ink2`).toBe(exp.inkDataRaw);
      expect(normColor(m.cardBg), `${id} card bg`).toBe(exp.c1);
      expect(normColor(m.cardTitleColor), `${id} card title`).toBe(exp.ink);
      expect(m.cardMetaColor, `${id} card meta`).toBe(exp.inkDataRaw);
      expect(normColor(m.cardOpenColor), `${id} card open`).toBe(exp.act);
      expect(normColor(m.cardDot), `${id} card dot`).toBe(exp.okText);
      expect(m.emptyTextColor, `${id} empty text`).toBe(exp.inkDataRaw);
    }
  }, 90_000);
});
