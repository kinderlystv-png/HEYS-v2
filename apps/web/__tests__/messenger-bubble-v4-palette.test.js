/**
 * Messenger bubbles · canvas palette mapping (--c1 curator / --hero client).
 * Computed sand + blue — mandatory two-set measurement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

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
    theirsBg: '#f7efe2',
    mineBg: '#efe3cf',
    ink: '#201e1d',
    ink2Raw: 'rgba(0,0,0,0.56)',
  },
  blue: {
    theirsBg: '#eef3f9',
    mineBg: '#e2ecf6',
    ink: '#101826',
    ink2Raw: 'rgba(0,0,0,0.61)',
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

function probeBubble(className) {
  const host = document.createElement('div');
  host.className = className;
  host.textContent = 'Текст';
  document.body.appendChild(host);
  const computed = getComputedStyle(host);
  const out = {
    backgroundColor: normColor(computed.backgroundColor),
    color: normColor(computed.color),
    borderTopStyle: computed.borderTopStyle,
    borderTopLeftRadius: computed.borderTopLeftRadius,
    borderTopRightRadius: computed.borderTopRightRadius,
    borderBottomRightRadius: computed.borderBottomRightRadius,
    borderBottomLeftRadius: computed.borderBottomLeftRadius,
    maxWidth: computed.maxWidth,
    padding: computed.padding,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
  };
  host.remove();
  return out;
}

function probeMeta() {
  const host = document.createElement('span');
  host.className = 'msg-meta';
  document.body.appendChild(host);
  const computed = getComputedStyle(host);
  const out = {
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    color: normColor(computed.color),
    colorRaw: computed.color.replace(/\s/g, ''),
  };
  host.remove();
  return out;
}

describe('messenger bubbles · v4 palette (sand + blue)', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('куратор --v4-c1 слева, клиент --v4-hero справа; без рамки; радиус 18/6', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${MESSENGER_CSS}`));

    for (const id of ['sand', 'blue']) {
      mountPalette(id);
      const exp = EXPECT[id];
      const theirs = probeBubble('msg-bubble msg-bubble-theirs');
      const mine = probeBubble('msg-bubble msg-bubble-mine');
      const meta = probeMeta();

      expect(theirs.backgroundColor, `${id} theirs bg`).toBe(exp.theirsBg);
      expect(mine.backgroundColor, `${id} mine bg`).toBe(exp.mineBg);
      expect(theirs.color, `${id} theirs ink`).toBe(exp.ink);
      expect(mine.color, `${id} mine ink`).toBe(exp.ink);
      expect(theirs.borderTopStyle, `${id} theirs border`).not.toBe('solid');
      expect(mine.borderTopStyle, `${id} mine border`).not.toBe('solid');
      expect(theirs.borderTopLeftRadius, `${id} theirs tl`).toBe('18px');
      expect(theirs.borderBottomLeftRadius, `${id} theirs bl`).toBe('6px');
      expect(mine.borderTopLeftRadius, `${id} mine tl`).toBe('18px');
      expect(mine.borderBottomRightRadius, `${id} mine br`).toBe('6px');
      expect(theirs.maxWidth, `${id} max-width`).toBe('79%');
      expect(theirs.padding, `${id} padding`).toBe('10px 13px');
      expect(theirs.fontSize, `${id} font-size`).toBe('13px');
      expect(theirs.fontWeight, `${id} font-weight`).toBe('500');
      expect(theirs.lineHeight, `${id} line-height`).toBe('1.45');
      expect(meta.fontSize, `${id} meta size`).toBe('10.5px');
      expect(meta.fontWeight, `${id} meta weight`).toBe('500');
      expect(
        MESSENGER_CSS,
        `${id} meta ink-data role`,
      ).toMatch(/\.msg-meta,\s*\n\.msg-edited-marker \{[\s\S]*?color:\s*var\(--v4-ink-2\)/);
    }
  });

  it('CSS не держит литералы старой синей/серой заливки пузырей', () => {
    const bubbleBlock = MESSENGER_CSS.match(/\.msg-bubble-mine \{[\s\S]*?\}/)?.[0] || '';
    const theirsBlock = MESSENGER_CSS.match(/\.msg-bubble-theirs \{[\s\S]*?\}/)?.[0] || '';
    expect(bubbleBlock).not.toContain('#1d70b7');
    expect(bubbleBlock).not.toContain('#1b2430');
    expect(bubbleBlock).not.toContain('#edebe5');
    expect(theirsBlock).not.toContain('#1d70b7');
    expect(theirsBlock).not.toContain('#1b2430');
    expect(theirsBlock).not.toContain('#edebe5');
    expect(bubbleBlock).toContain('var(--v4-hero');
    expect(theirsBlock).toContain('var(--v4-c1');
  });
});
