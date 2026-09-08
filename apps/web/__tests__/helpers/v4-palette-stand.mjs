import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPlaywrightBrowser } from './playwright-browser.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SETS = ['sand', 'sand-dark', 'blue', 'blue-dark'];

export function normColor(value) {
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

export function mountPalette(themeId) {
  document.documentElement.setAttribute('data-theme-id', themeId);
  document.documentElement.setAttribute(
    'data-theme',
    themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
  );
  document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
}

export function injectCss(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

function readCssFiles(cssFiles) {
  return cssFiles.map((rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8')).join('\n');
}

function themeAttrs(themeId) {
  const theme = themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId;
  const palette = themeId.startsWith('blue') ? 'blue' : 'sand';
  return { themeId, theme, palette };
}

function buildDocHtml({ html, cssText, width, themeId }) {
  const { theme, palette } = themeAttrs(themeId);
  return `<!DOCTYPE html><html data-theme-id="${themeId}" data-palette="${palette}" data-theme="${theme}"><head><meta charset="utf-8"><style>${cssText}</style></head><body style="margin:0;width:${width}px">${html}</body></html>`;
}

/**
 * @param {{ html: string, cssFiles: string[], watch: Record<string, string>, width?: number }} opts
 * @returns {Promise<{ rendered: boolean, notFound: string[], sets: Record<string, Record<string, { color: string, background: string, borderColor: string, boxShadow: string, fontSize: string, fontWeight: string }>> }>}
 */
export async function measureZone({ html, cssFiles, watch, width = 375 }) {
  const cssText = readCssFiles(cssFiles);
  const watchEntries = Object.entries(watch);
  const page = await (await getPlaywrightBrowser()).newPage({ viewport: { width, height: 812 } });

  const probeSet = SETS[0];
  await page.setContent(buildDocHtml({ html, cssText, width, themeId: probeSet }), {
    waitUntil: 'domcontentloaded',
  });

  const probe = await page.evaluate((watchMap) => {
    const found = [];
    const missing = [];
    for (const [key, sel] of Object.entries(watchMap)) {
      if (document.querySelector(sel)) found.push(key);
      else missing.push(key);
    }
    const rendered = Boolean(
      document.body
      && document.body.children.length > 0
      && (found.length > 0 || document.body.offsetHeight > 0),
    );
    return { found, missing, rendered };
  }, watch);

  const sets = {};
  for (const setId of SETS) {
    await page.setContent(buildDocHtml({ html, cssText, width, themeId: setId }), {
      waitUntil: 'domcontentloaded',
    });
    sets[setId] = await page.evaluate(({ watchMap, foundKeys }) => {
      const readBorder = (cs) => {
        if (cs.borderLeftWidth && cs.borderLeftWidth !== '0px') return cs.borderLeftColor;
        if (cs.borderTopWidth && cs.borderTopWidth !== '0px') return cs.borderTopColor;
        return cs.borderColor;
      };
      const out = {};
      for (const key of foundKeys) {
        const el = document.querySelector(watchMap[key]);
        const cs = getComputedStyle(el);
        out[key] = {
          color: cs.color,
          background: cs.backgroundColor,
          borderColor: readBorder(cs),
          boxShadow: cs.boxShadow,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
        };
      }
      return out;
    }, { watchMap: watch, foundKeys: probe.found });
  }

  await page.close();

  return {
    rendered: probe.rendered,
    notFound: probe.missing,
    sets,
  };
}

export function readCss(...cssFiles) {
  return readCssFiles(cssFiles);
}
