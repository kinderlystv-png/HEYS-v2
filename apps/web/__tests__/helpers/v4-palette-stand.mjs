/**
 * Unified v4 palette stand — mount 4 sets on documentElement, probe computed UI.
 * Pattern: curator-sheet-palette, messenger-bubble-v4-palette, registration-wheel-v4-palette.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODULES_DIR = path.join(WEB_DIR, 'styles/modules');

/** @typedef {{ id: string, themeId: string, theme: string, palette: string, label: string, isDark: boolean }} V4PaletteSet */

/** @type {V4PaletteSet[]} */
export const V4_PALETTE_SETS = Object.freeze([
  { id: 'sand', themeId: 'sand', theme: 'sand', palette: 'sand', label: 'песочный', isDark: false },
  { id: 'sand-dark', themeId: 'sand-dark', theme: 'sand-dark', palette: 'sand', label: 'тёмный', isDark: true },
  { id: 'blue', themeId: 'blue', theme: 'blue', palette: 'blue', label: 'синий', isDark: false },
  { id: 'blue-dark', themeId: 'blue-dark', theme: 'blue-dark', palette: 'blue', label: 'сине-тёмный', isDark: true },
]);

/** Light sand surfaces that must not appear on dark sets. */
export const SAND_LIGHT_LEAK_HEX = Object.freeze(new Set([
  '#fffaf1', '#f7efe2', '#efe3cf', '#eaefe0', '#f0dcc6', '#f3e0d2', '#fef3c7', '#dfe6d1', '#f6e6dd',
]));

const BASE_CSS_FILES = Object.freeze(['001-design-tokens.css', '002-ui-v4-palette-roles.css']);

export function readModuleCss(...files) {
  return files.map((file) => fs.readFileSync(path.join(MODULES_DIR, file), 'utf8')).join('\n');
}

export function readWebCss(relativePath) {
  return fs.readFileSync(path.join(WEB_DIR, relativePath), 'utf8');
}

/** @param {Document} doc */
export function mountPaletteSet(doc, set) {
  doc.documentElement.setAttribute('data-theme-id', set.themeId);
  doc.documentElement.setAttribute('data-theme', set.theme);
  doc.documentElement.setAttribute('data-palette', set.palette);
}

/** @param {Document} doc */
export function unmountPaletteSet(doc) {
  doc.documentElement.removeAttribute('data-theme-id');
  doc.documentElement.removeAttribute('data-theme');
  doc.documentElement.removeAttribute('data-palette');
}

/** @param {Document} doc */
export function injectCss(doc, cssText) {
  const style = doc.createElement('style');
  style.textContent = cssText;
  doc.head.appendChild(style);
  return style;
}

export function normColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'initial' || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return '';
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return `#${full}`;
  }
  const rgba = raw.match(/^rgba\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+([\d.]+)\s*\)/);
  if (rgba) {
    const a = parseFloat(rgba[4]);
    if (a <= 0.01) return '';
    const blend = (c) => Math.round(Number(c) * a + 255 * (1 - a));
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `#${hex(blend(rgba[1]))}${hex(blend(rgba[2]))}${hex(blend(rgba[3]))}`;
  }
  const rgb = raw.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!rgb) return raw;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
}

function parseRgb(color) {
  const raw = String(color || '').trim();
  const hex = normColor(raw);
  if (hex.startsWith('#')) {
    const n = Number.parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = raw.match(/^rgba\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+([\d.]+)\s*\)/);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: parseFloat(rgba[4]),
    };
  }
  const rgb = raw.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: 1 };
  return null;
}

function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fgColor, bgColor) {
  const fg = parseRgb(fgColor);
  const bg = parseRgb(bgColor);
  if (!fg || !bg) return NaN;
  const fgL = relativeLuminance(fg);
  const bgL = relativeLuminance(bg);
  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isSandLeak(color, set) {
  if (!set?.isDark) return false;
  const hex = normColor(color);
  return hex ? SAND_LIGHT_LEAK_HEX.has(hex) : false;
}

/**
 * @param {Document} doc
 * @param {string} selector
 * @param {string[]} props
 */
export function probeComputed(doc, selector, props) {
  const el = doc.querySelector(selector);
  if (!el) return { missing: selector };
  const cs = doc.defaultView.getComputedStyle(el);
  const out = {};
  for (const prop of props) {
    const camel = prop.includes('-')
      ? prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      : prop;
    out[prop] = cs[camel] ?? cs.getPropertyValue(prop);
  }
  return out;
}

/** Walk ancestors for first non-transparent background. */
export function effectiveBackground(doc, el) {
  let node = el;
  while (node && node !== doc.documentElement) {
    const bg = doc.defaultView.getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
    node = node.parentElement;
  }
  return doc.defaultView.getComputedStyle(doc.body).backgroundColor;
}

/** Resolve text color; jsdom sometimes leaves literal `inherit`. */
export function effectiveColor(doc, el) {
  let node = el;
  while (node) {
    const color = doc.defaultView.getComputedStyle(node).color;
    if (color && color !== 'inherit') return color;
    node = node.parentElement;
  }
  return doc.defaultView.getComputedStyle(doc.body).color;
}

function readBorder(el, doc, probe) {
  const cs = doc.defaultView.getComputedStyle(el);
  let width = cs.borderBottomWidth;
  let style = cs.borderBottomStyle;
  let color = cs.borderBottomColor;
  if (!width || width === '0px' || width === 'initial' || style === 'none' || style === 'initial') {
    const w2 = cs.getPropertyValue('border-bottom-width').trim();
    const s2 = cs.getPropertyValue('border-bottom-style').trim();
    const c2 = cs.getPropertyValue('border-bottom-color').trim();
    if (w2) width = w2;
    if (s2) style = s2;
    if (c2) color = c2;
  }
  if ((!width || width === '0px' || width === 'initial' || style === 'none' || style === 'initial')
    && color && color !== 'rgba(0, 0, 0, 0)' && color !== 'none') {
    width = width && width !== '0px' && width !== 'initial' ? width : '1px';
    style = style === 'none' || style === 'initial' ? 'solid' : style;
  }
  if (probe?.borderRole && (!width || width === '0px' || width === 'initial' || style === 'none' || style === 'initial' || !color || color === 'none')) {
    const line = colorFromRootRole(doc, probe.borderRole);
    if (line) {
      width = '1px';
      style = 'solid';
      color = line;
    }
  }
  return {
    width,
    style,
    color,
    bg: effectiveBackground(doc, el),
  };
}

function colorFromRootRole(doc, role) {
  if (!role) return '';
  const raw = doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue(role).trim();
  if (!raw) return '';
  if (raw.startsWith('var(')) return '';
  return raw;
}

/**
 * @typedef {object} PaletteProbe
 * @property {string} id
 * @property {string} selector
 * @property {string[]} props
 * @property {'text'|'surface'|'border'} kind
 * @property {number} [minContrast]
 * @property {string} [fgRole] — when jsdom leaves color empty, read from :root
 */

/**
 * @typedef {object} PaletteScreen
 * @property {string} zone
 * @property {string} html
 * @property {string[]} css
 * @property {PaletteProbe[]} probes
 * @property {string} [bodyStyle]
 * @property {string} [skipReason]
 */

/**
 * @param {Document} doc
 * @param {PaletteScreen} screen
 * @param {V4PaletteSet} set
 */
export function auditScreenOnSet(doc, screen, set) {
  if (screen.skipReason) {
    return { status: 'skipped', reason: screen.skipReason, findings: [] };
  }

  mountPaletteSet(doc, set);
  const styles = [];
  try {
    styles.push(injectCss(doc, readModuleCss(...BASE_CSS_FILES)));
    for (const chunk of screen.css) styles.push(injectCss(doc, chunk));
    doc.body.innerHTML = '';
    doc.body.setAttribute('style', screen.bodyStyle || 'margin:0;padding:16px;background:var(--v4-hero,#efe3cf)');
    doc.body.innerHTML = screen.html;

    /** @type {Array<{ probe: string, kind: string, issue: string, detail?: string }>} */
    const findings = [];

    for (const probe of screen.probes) {
      const el = doc.querySelector(probe.selector);
      if (!el) {
        findings.push({ probe: probe.id, kind: 'unknown', issue: 'missing selector', detail: probe.selector });
        continue;
      }

      if (probe.kind === 'border') {
        const border = readBorder(el, doc, probe);
        const invisible = !border.width
          || border.width === '0px'
          || border.style === 'none'
          || normColor(border.color) === normColor(border.bg);
        if (invisible) {
          findings.push({
            probe: probe.id,
            kind: 'border',
            issue: 'divider missing',
            detail: `width=${border.width}, style=${border.style}, color=${border.color}`,
          });
        }
        if (isSandLeak(border.color, set)) {
          findings.push({ probe: probe.id, kind: 'sand-leak', issue: 'sand border on dark set', detail: border.color });
        }
        continue;
      }

      let fg = effectiveColor(doc, el);
      if ((!fg || fg === 'rgba(0, 0, 0, 0)') && probe.fgRole) {
        fg = colorFromRootRole(doc, probe.fgRole);
      }
      const bg = effectiveBackground(doc, el);

      if (probe.kind === 'surface') {
        const surface = probeComputed(doc, probe.selector, ['backgroundColor']).backgroundColor || bg;
        if (isSandLeak(surface, set)) {
          findings.push({ probe: probe.id, kind: 'sand-leak', issue: 'sand surface on dark set', detail: surface });
        }
        continue;
      }

      if (probe.kind === 'text') {
        const ratio = contrastRatio(fg, bg);
        const min = probe.minContrast ?? 4.5;
        if (!Number.isFinite(ratio)) {
          findings.push({ probe: probe.id, kind: probe.kind, issue: 'contrast unknown', detail: `${fg} on ${bg}` });
        } else if (ratio < min) {
          findings.push({
            probe: probe.id,
            kind: probe.kind,
            issue: 'low contrast',
            detail: `${ratio.toFixed(2)}:1 (${fg} on ${bg}, need ${min})`,
          });
        }
        if (isSandLeak(fg, set)) {
          findings.push({ probe: probe.id, kind: 'sand-leak', issue: 'sand ink on dark set', detail: fg });
        }
        if (isSandLeak(bg, set)) {
          findings.push({ probe: probe.id, kind: 'sand-leak', issue: 'sand text background on dark set', detail: bg });
        }
      }
    }

    return { status: findings.length ? 'failed' : 'ok', findings };
  } catch (error) {
    return { status: 'error', reason: error.message, findings: [] };
  } finally {
    styles.forEach((s) => s.remove());
    doc.body.innerHTML = '';
    doc.body.removeAttribute('style');
    unmountPaletteSet(doc);
  }
}

/**
 * @param {Document} doc
 * @param {PaletteScreen[]} screens
 */
export function runPaletteStand(doc, screens) {
  /** @type {Array<object>} */
  const rows = [];
  let rendered = 0;
  let failedScreens = 0;
  let skipped = 0;
  let errors = 0;

  for (const screen of screens) {
    if (screen.skipReason) {
      skipped += 1;
      rows.push({ zone: screen.zone, set: '*', status: 'skipped', reason: screen.skipReason });
      continue;
    }
    rendered += 1;
    for (const set of V4_PALETTE_SETS) {
      const result = auditScreenOnSet(doc, screen, set);
      if (result.status === 'error') {
        errors += 1;
        failedScreens += 1;
        rows.push({ zone: screen.zone, set: set.id, status: 'error', reason: result.reason });
        continue;
      }
      if (result.status === 'failed') {
        failedScreens += 1;
        for (const finding of result.findings) {
          rows.push({
            zone: screen.zone,
            set: set.id,
            status: 'failed',
            probe: finding.probe,
            issue: finding.issue,
            detail: finding.detail,
          });
        }
      } else if (result.status === 'ok') {
        rows.push({ zone: screen.zone, set: set.id, status: 'ok' });
      }
    }
  }

  const unknown = rows.filter((r) => r.issue === 'missing selector' || r.status === 'error');
  return {
    renderedScreens: rendered,
    skippedScreens: skipped,
    failedScreenRuns: failedScreens,
    errorRuns: errors,
    unknownBlindness: unknown.length,
    rows,
    limitations: buildStandLimitations({ rendered, skipped, failedScreens, errors, unknown: unknown.length, totalScreens: screens.length }),
  };
}

function buildStandLimitations(stats) {
  const lines = [
    `screens rendered: ${stats.rendered}/${stats.totalScreens}`,
    `screens skipped (explicit): ${stats.skipped}`,
    `failed screen×set runs: ${stats.failedScreens}`,
    `error runs: ${stats.errors}`,
    `unknown/blind probes: ${stats.unknown}`,
  ];
  if (stats.unknown > 0) lines.push('unknown = blindness, not green');
  return lines;
}

export function formatFindingsTable(report) {
  return report.rows.filter((r) => r.status === 'failed' || r.status === 'error');
}

export { BASE_CSS_FILES, WEB_DIR, MODULES_DIR };
