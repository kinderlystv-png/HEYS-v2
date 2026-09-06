/**
 * Messenger header + inbox · v4 palette (sand + blue jsdom + chromium @375).
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
    bg: '#fffaf1',
    c1: '#f7efe2',
    act: '#c67139',
    actText: '#8a4a20',
    accentBg: '#f0dcc6',
    ink2Raw: 'rgba(0,0,0,0.55)',
    inkDataRaw: 'rgba(0,0,0,0.56)',
    lineRaw: 'rgba(0,0,0,0.08)',
  },
  blue: {
    ink: '#101826',
    hero: '#e2ecf6',
    bg: '#ffffff',
    c1: '#eef3f9',
    act: '#1d5e96',
    actText: '#1d5e96',
    accentBg: '#d7e8f7',
    ink2Raw: 'rgba(0,0,0,0.55)',
    inkDataRaw: 'rgba(16,24,38,0.64)',
    lineRaw: 'rgba(0,0,0,0.08)',
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

function probeSelector(selector, text = 'Тест') {
  const host = document.createElement('div');
  host.className = selector;
  host.textContent = text;
  document.body.appendChild(host);
  const computed = getComputedStyle(host);
  const out = {
    backgroundColor: normColor(computed.backgroundColor),
    color: normColor(computed.color),
    borderTopColor: normColor(computed.borderTopColor),
    borderLeftColor: normColor(computed.borderLeftColor),
    colorRaw: computed.color.replace(/\s/g, ''),
    borderTopRaw: computed.borderTopColor.replace(/\s/g, ''),
  };
  host.remove();
  return out;
}

function extractScopedCss() {
  const headerBlock = MESSENGER_CSS.slice(
    MESSENGER_CSS.indexOf('.messenger-overlay {'),
    MESSENGER_CSS.indexOf('.messenger-thread {'),
  );
  const inboxBlock = MESSENGER_CSS.slice(
    MESSENGER_CSS.indexOf('.messenger-inbox {'),
    MESSENGER_CSS.indexOf('.msg-row.is-highlighted'),
  );
  const darkHeader = MESSENGER_CSS.slice(
    MESSENGER_CSS.indexOf('[data-theme$="dark"] .messenger-overlay {'),
    MESSENGER_CSS.indexOf('[data-theme$="dark"] .messenger-attach,'),
  );
  const darkInbox = MESSENGER_CSS.slice(
    MESSENGER_CSS.indexOf('[data-theme$="dark"] .messenger-inbox {'),
    MESSENGER_CSS.indexOf('[data-theme$="dark"] .messenger-inbox__badge {') +
      '[data-theme$="dark"] .messenger-inbox__badge {'.length +
      (MESSENGER_CSS.slice(MESSENGER_CSS.indexOf('[data-theme$="dark"] .messenger-inbox__badge {')).match(/^[\s\S]*?\n\}/) || [''])[0].length,
  );
  return `${headerBlock}\n${inboxBlock}\n${darkHeader}\n${darkInbox}`;
}

async function measureChromium(themeId) {
  const page = await (await getPlaywrightBrowser()).newPage({ viewport: { width: 375, height: 812 } });
  const scopedCss = extractScopedCss();
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PALETTE_CSS}\n${scopedCss}</style></head>
<body style="margin:0;width:375px">
  <div class="messenger-header">H</div>
  <div class="messenger-avatar">AP</div>
  <div class="messenger-title">T</div>
  <div class="messenger-subtitle">S</div>
  <div class="messenger-day-checklist__chip messenger-day-checklist__chip--missing">chip</div>
  <div class="messenger-inbox__row is-active">row</div>
  <div class="messenger-inbox__avatar">AV</div>
  <div class="messenger-inbox__empty">empty</div>
</body></html>`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ theme, palette, themeId: id }) => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-palette', palette);
    document.documentElement.setAttribute('data-theme-id', id);
  }, {
    theme: themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
    palette: themeId.startsWith('blue') ? 'blue' : 'sand',
    themeId,
  });
  const out = await page.evaluate(() => {
    const read = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const norm = (v) => String(v || '').replace(/\s/g, '');
    return {
      headerBg: read('.messenger-header', 'backgroundColor'),
      avatarBg: read('.messenger-avatar', 'backgroundColor'),
      avatarColor: read('.messenger-avatar', 'color'),
      titleColor: read('.messenger-title', 'color'),
      subtitleColorRaw: norm(read('.messenger-subtitle', 'color')),
      chipBg: read('.messenger-day-checklist__chip--missing', 'backgroundColor'),
      inboxActiveBg: read('.messenger-inbox__row.is-active', 'backgroundColor'),
      inboxActiveBorder: read('.messenger-inbox__row.is-active', 'borderLeftColor'),
      inboxAvatarBg: read('.messenger-inbox__avatar', 'backgroundColor'),
      inboxEmptyColorRaw: norm(read('.messenger-inbox__empty', 'color')),
    };
  });
  await page.close();
  return out;
}

describe('messenger header/inbox · v4 palette (sand + blue)', () => {
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

  it('шапка и инбокс на sand и blue — роли палитры', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${MESSENGER_CSS}`));

    for (const id of ['sand', 'blue']) {
      mountPalette(id);
      const exp = EXPECT[id];

      const header = probeSelector('messenger-header');
      expect(header.backgroundColor, `${id} header bg`).toBe(exp.bg);
      expect(header.color, `${id} header ink`).toBe(exp.ink);

      const avatar = probeSelector('messenger-avatar');
      expect(avatar.backgroundColor, `${id} avatar hero`).toBe(exp.hero);
      expect(avatar.color, `${id} avatar act-text`).toBe(exp.actText);

      const title = probeSelector('messenger-title');
      expect(title.color, `${id} title ink`).toBe(exp.ink);

      expect(MESSENGER_CSS, `${id} subtitle role in source`).toMatch(
        /\.messenger-subtitle\s*\{[\s\S]*?color:\s*var\(--v4-ink-data,\s*rgba\(0,\s*0,\s*0,\s*0\.56\)\)/,
      );

      const checklistMissing = probeSelector('messenger-day-checklist__chip messenger-day-checklist__chip--missing');
      expect(checklistMissing.backgroundColor, `${id} chip missing c1`).toBe(exp.c1);
      expect(checklistMissing.color, `${id} chip missing ink`).toBe(exp.ink);

      const inboxRow = probeSelector('messenger-inbox__row is-active');
      expect(inboxRow.backgroundColor, `${id} inbox active hero`).toBe(exp.hero);
      expect(inboxRow.borderLeftColor, `${id} inbox active act`).toBe(exp.act);

      const inboxAvatar = probeSelector('messenger-inbox__avatar');
      expect(inboxAvatar.backgroundColor, `${id} inbox avatar accent-bg`).toBe(exp.accentBg);
      expect(inboxAvatar.color, `${id} inbox avatar act-text`).toBe(exp.actText);
    }
  });

  it('chromium @375: sand и blue computed для шапки/инбокса', async () => {
    for (const id of ['sand', 'blue']) {
      const m = await measureChromium(id);
      const exp = EXPECT[id];
      expect(normColor(m.headerBg), `${id} chromium header`).toBe(exp.bg);
      expect(normColor(m.avatarBg), `${id} chromium avatar bg`).toBe(exp.hero);
      expect(normColor(m.avatarColor), `${id} chromium avatar ink`).toBe(exp.actText);
      expect(normColor(m.titleColor), `${id} chromium title`).toBe(exp.ink);
      expect(normColor(m.chipBg), `${id} chromium chip`).toBe(exp.c1);
      expect(normColor(m.inboxActiveBg), `${id} chromium inbox active`).toBe(exp.hero);
      expect(normColor(m.inboxActiveBorder), `${id} chromium inbox act border`).toBe(exp.act);
      expect(normColor(m.inboxAvatarBg), `${id} chromium inbox avatar`).toBe(exp.accentBg);
      if (id === 'sand') {
        expect(m.subtitleColorRaw, `${id} chromium subtitle raw`).toBe(exp.inkDataRaw);
        expect(m.inboxEmptyColorRaw, `${id} chromium empty raw`).toBe(exp.ink2Raw);
      } else {
        expect(m.subtitleColorRaw, `${id} chromium subtitle raw`).toBe(exp.inkDataRaw);
        expect(m.inboxEmptyColorRaw, `${id} chromium empty raw`).toBe(exp.ink2Raw);
      }
    }
  }, 60_000);

  it('scope CSS не держит старые системные литералы шапки/инбокса', () => {
    const headerBlock = MESSENGER_CSS.slice(
      MESSENGER_CSS.indexOf('.messenger-header {'),
      MESSENGER_CSS.indexOf('.messenger-thread {'),
    );
    const inboxBlock = MESSENGER_CSS.slice(
      MESSENGER_CSS.indexOf('.messenger-inbox {'),
      MESSENGER_CSS.indexOf('.msg-row.is-highlighted'),
    );

    for (const block of [headerBlock, inboxBlock]) {
      expect(block).not.toContain('#1d70b7');
      expect(block).not.toContain('#111827');
      expect(block).not.toContain('#434587');
      expect(block).not.toContain('#7c8a99');
      expect(block).not.toContain('#edebe5');
      expect(block).not.toContain('#f1f6fa');
      expect(block).not.toContain('#fff1f1');
      expect(block).not.toContain('#a33b3b');
      expect(block).not.toContain('#1b2430');
    }
  });
});
