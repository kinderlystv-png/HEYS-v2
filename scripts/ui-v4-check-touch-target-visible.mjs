#!/usr/bin/env node
/**
 * ui-v4-check-touch-target-visible.mjs — гейт видимых тач-целей ≥44px (полоса 4 · задача 69).
 *
 * Считает layout box элемента с видимым фоном/контентом. НЕ засчитывает:
 * - ::after/::before hit-area без видимого фона;
 * - отрицательный margin как расширитель;
 * - padding/area без видимого габарита кнопки.
 *
 * Флаги:
 *   --inventory          полный инвентарь → JSON + stdout summary
 *   --check              ratchet: падение на росте долга
 *   --update-baseline    перезаписать baseline после закрытия долга
 *   --json               машиночитаемый вывод
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const STYLES = path.join(ROOT, 'apps/web/styles');
const VERDICTS_DIR = path.join(ROOT, 'docs/ui/verdicts');
const INVENTORY_PATH = path.join(ROOT, 'scripts/.polosa4-task69-touch-target-inventory.json');
const BASELINE_PATH = path.join(ROOT, 'scripts/.polosa4-task69-touch-target-baseline.json');

export const MIN_TOUCH_PX = 44;

/** Frozen / вне product UI v4 — не сканируем. */
export const FROZEN_CSS = new Set([
  'fingers.css',
  'drums-finger-trainer.css',
  '002-ui-v4-palette-roles.css',
]);

/** Planning games — не product UI v4. */
export const SKIP_CSS_PREFIXES = ['908-planning', '909-planning', '910-planning', '911-planning', '912-planning'];

/**
 * Законные исключения дизайнера. Ложное срабатывание дороже пропуска —
 * каждая запись явно именует класс/тип и причину.
 */
export const EXEMPTION_REGISTRY = [
  {
    type: 'progress-dot',
    match: (sel) => /(?:^|\s)\.(?:[^.\s]*-(?:dot|dots|pager-dot|step-dot|progress-dot)|mc-progress-dot|step-modal-dot)/i.test(sel),
    reason: 'точка прогресса — декор шага, не полноразмерная кнопка',
  },
  {
    type: 'slider-node',
    match: (sel) => /(?:thumb|slider-handle|range-thumb|ma-habit-cal-thumb)/i.test(sel),
    reason: 'узел ползунка — отдельный контракт геометрии',
  },
  {
    type: 'bar',
    match: (sel) =>
      /(?:^|\s)\.(?:[^.\s]*-(?:bar-track|wave-bar|insulin-wave-bar|metrics-bar-fill)|progress-bar(?!\s*-btn))/i.test(sel) &&
      !/-btn\b/i.test(sel),
    reason: 'полоса/трек — не нажимаемая цель',
  },
  {
    type: 'check-indicator',
    match: (sel) =>
      /(?:publish-checkbox|check-indicator|tick-indicator|nova-check|pe-checkbox\b|aps-create-publish-checkbox)/i.test(sel),
    reason: 'галочка-индикатор, не полноразмерная кнопка',
  },
  {
    type: 'named-exception',
    selector: '.nutrition-v4-chip',
    reason: 'nutrition-tab task63: видимый чип 30px, ::after expander снят (контракт конфигурации)',
  },
  {
    type: 'named-exception',
    selector: '.pe-portions-remove-btn',
    reason: 'product-card task63: кадр правки ·26 — осознанно 40×40',
  },
  {
    type: 'named-exception',
    selector: '.pe-field--inline',
    reason: 'product-card: поле витаминов — не нажимают',
  },
  {
    type: 'named-exception',
    selector: '.aps-create-barcode-clear',
    reason: 'product-card: 38px внутри строки 44px — видимая иконка меньше ряда',
  },
  {
    type: 'named-exception',
    selector: '.aps-barcode-debug-dot',
    reason: 'product-card: debug-точка наведения, не prod CTA',
  },
  {
    type: 'named-exception',
    selector: '.date-picker-day',
    reason: 'date-remainders: ячейка календаря — сетка дней, не кнопка 44×44',
  },
  {
    type: 'named-exception',
    selector: '.widget-drag-handle',
    reason: 'home-widgets: ручка перетаскивания — не тач-CTA',
  },
];

const FILE_ZONE_HINTS = {
  '600-steps-and-aps.css': 'food-meal',
  '610-aps-meal-flow.css': 'food-meal',
  '611-aps-product-card.css': 'product-card',
  '732-ui-v4-nutrition.css': 'nutrition-tab',
  '730-widgets-dashboard.css': 'home-widgets',
  '731-ui-v4-activity.css': 'tab-activity',
  '733-ui-v4-login-theme.css': 'login',
  '734-ui-v4-curator-panel.css': 'service-curator',
  '734-ui-v4-insights.css': 'reports-insights',
  '740-cascade-card.css': 'reports-insights',
  '750-strength-builder.css': 'strength-builder',
  '300-modals-and-day.css': 'checkin-morning',
  '400-water-and-hydration.css': 'water-add',
  '500-pwa-and-offline.css': 'pwa-update',
};

const args = process.argv.slice(2);
const wantInventory = args.includes('--inventory');
const wantCheck = args.includes('--check');
const updateBaseline = args.includes('--update-baseline');
const asJson = args.includes('--json');

/** @returns {string[]} */
export function listProductCssFiles() {
  const files = [];
  for (const name of fs.readdirSync(MODULES).sort()) {
    if (!name.endsWith('.css')) continue;
    if (FROZEN_CSS.has(name)) continue;
    if (SKIP_CSS_PREFIXES.some((p) => name.startsWith(p))) continue;
    files.push(path.join(MODULES, name));
  }
  const components = path.join(STYLES, 'heys-components.css');
  if (fs.existsSync(components)) files.push(components);
  return files;
}

/** @param {string} cssText */
export function stripCssComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * @param {string} cssText
 * @returns {{ selectors: string, block: string }[]}
 */
export function parseCssRules(cssText) {
  const cleaned = stripCssComments(cssText);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cleaned))) {
    const selectors = m[1].trim();
    if (!selectors || selectors.startsWith('@')) continue;
    rules.push({ selectors, block: m[2] });
  }
  return rules;
}

/** @param {string} selector */
export function primaryClassFromSelector(selector) {
  const parts = selector.split(',').map((s) => s.trim());
  for (const part of parts) {
    const classes = [...part.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((x) => x[1]);
    if (classes.length) return classes[classes.length - 1];
  }
  return null;
}

/** @param {string} selector */
export function matchesExemption(selector) {
  for (const row of EXEMPTION_REGISTRY) {
    if (row.selector && selector.includes(row.selector)) {
      return { type: row.type, reason: row.reason };
    }
    if (row.match && row.match(selector)) {
      return { type: row.type, reason: row.reason };
    }
  }
  return null;
}

/** @param {string} block */
export function isInteractiveBlock(block) {
  if (/cursor\s*:\s*pointer/i.test(block)) return true;
  if (/appearance\s*:\s*none/i.test(block) && /min-height|height|padding/i.test(block)) return true;
  return false;
}

/** @param {string} className */
export function defaultTagForClass(className) {
  if (/input|field|search/i.test(className)) return 'input';
  if (/link|anchor/i.test(className)) return 'a';
  return 'button';
}

/**
 * @param {string} cssText
 * @param {string} selector
 */
export function findPseudoExpander(cssText, selector) {
  const cleaned = stripCssComments(cssText);
  for (const pseudo of ['::after', '::before']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}${pseudo}\\s*\\{([^}]*)\\}`, 'i');
    const m = cleaned.match(re);
    if (!m) continue;
    const block = m[1];
    if (/content\s*:\s*none/i.test(block)) continue;
    if (!/content\s*:/i.test(block)) continue;
    const hasBg =
      /background(?:-color)?\s*:\s*(?!transparent\b|none\b)[^;]+/i.test(block) ||
      /box-shadow\s*:/i.test(block) ||
      /border\s*:\s*(?!none\b|0\b)/i.test(block);
    const hasInset =
      /inset\s*:\s*-?\d/i.test(block) ||
      /(?:top|left|right|bottom)\s*:\s*-/i.test(block) ||
      /width\s*:\s*\d{2,}/i.test(block);
    if (hasInset && !hasBg) {
      return { pseudo, kind: 'invisible-pseudo-hit-area', block: block.trim() };
    }
  }
  return null;
}

/** @param {string} block */
export function hasNegativeMarginExpander(block) {
  return /margin(?:-(?:top|right|bottom|left))?\s*:\s*-/i.test(block);
}

/** @param {string} value */
export function parsePx(value) {
  const n = Number.parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Видимый габарит: layout box элемента, не псевдо-hit-area.
 * jsdom часто даёт rect 0×0 — берём max(rect, height/minHeight, width/minWidth).
 * @param {number} rectVal
 * @param  {...string} computedCandidates
 */
export function visibleAxis(rectVal, ...computedCandidates) {
  const fromCss = computedCandidates.map(parsePx).filter((n) => n > 0);
  return Math.max(rectVal, ...fromCss, 0);
}

/**
 * @param {Window} window
 * @param {string} className
 * @param {string} [wrapClass]
 */
export function measureElement(window, className, wrapClass) {
  const { document } = window;
  let host;
  let target;
  const tag = defaultTagForClass(className);
  if (wrapClass) {
    host = document.createElement('div');
    host.className = wrapClass;
    target = document.createElement(tag);
    target.className = className;
    host.appendChild(target);
    document.body.appendChild(host);
  } else {
    target = document.createElement(tag);
    target.className = className;
    document.body.appendChild(target);
  }
  if (tag === 'button' || tag === 'a') {
    target.textContent = 'Текст';
  } else if (tag === 'input') {
    target.setAttribute('value', '123');
  }
  const rect = target.getBoundingClientRect();
  const cs = window.getComputedStyle(target);
  if (cs.display === 'none' || cs.visibility === 'hidden') {
    if (host) host.remove();
    else target.remove();
    return { width: 0, height: 0, display: cs.display, visibility: cs.visibility };
  }
  const width = visibleAxis(rect.width, cs.width, cs.minWidth);
  const height = visibleAxis(rect.height, cs.height, cs.minHeight);
  const result = {
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    minWidth: parsePx(cs.minWidth),
    minHeight: parsePx(cs.minHeight),
    display: cs.display,
    visibility: cs.visibility,
  };
  if (host) host.remove();
  else target.remove();
  return result;
}

/**
 * @param {{ width: number, height: number, minWidth?: number, minHeight?: number, display?: string }} size
 */
export function isVisibleTouchOk(size) {
  const h = Math.max(size.height, size.minHeight || 0);
  const w = Math.max(size.width, size.minWidth || 0);
  if (h >= MIN_TOUCH_PX && w >= MIN_TOUCH_PX) return true;
  // Пилюля/inline CTA: контракт task63 — min-height видимый, ширина от контента.
  if (h >= MIN_TOUCH_PX && /inline-flex|inline-block/i.test(size.display || '')) {
    return true;
  }
  return false;
}

function buildZoneMap() {
  const map = { ...FILE_ZONE_HINTS };
  if (!fs.existsSync(VERDICTS_DIR)) return map;
  for (const entry of fs.readdirSync(VERDICTS_DIR)) {
    if (!entry.endsWith('.json')) continue;
    const zone = entry.replace(/\.json$/, '');
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(VERDICTS_DIR, entry), 'utf8'));
    } catch {
      continue;
    }
    for (const row of Object.values(data.rows || {})) {
      for (const match of String(row?.f || '').matchAll(/([0-9a-zA-Z_.-]+\.css)/g)) {
        const file = match[1].replace(/^.*\//, '');
        if (!map[file]) map[file] = zone;
      }
    }
  }
  return map;
}

function loadCssBundleForFile(filePath) {
  const palette = path.join(MODULES, '002-ui-v4-palette-roles.css');
  const parts = [fs.readFileSync(palette, 'utf8')];
  parts.push(fs.readFileSync(filePath, 'utf8'));
  const components = path.join(STYLES, 'heys-components.css');
  if (filePath !== components && fs.existsSync(components)) {
    parts.push(fs.readFileSync(components, 'utf8'));
  }
  return parts.join('\n');
}

function createMeasureWindow(cssText) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const style = window.document.createElement('style');
  style.textContent = `${cssText}\nbody{font-family:Figtree,sans-serif;margin:0}`;
  window.document.head.appendChild(style);
  window.document.documentElement.setAttribute('data-theme-id', 'sand');
  window.document.documentElement.setAttribute('data-palette', 'sand');
  return window;
}

/**
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function collectInventory(opts = {}) {
  const files = opts.files || listProductCssFiles();
  const zoneMap = buildZoneMap();
  const cssByFile = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

  const seen = new Set();
  const entries = [];

  for (const file of files) {
    const base = path.basename(file);
    const zone = zoneMap[base] || null;
    const cssText = cssByFile.get(file);
    const rules = parseCssRules(cssText);
    const window = createMeasureWindow(loadCssBundleForFile(file));

    for (const rule of rules) {
      if (!isInteractiveBlock(rule.block)) continue;
      const selector = rule.selectors;
      const className = primaryClassFromSelector(selector);
      if (!className) continue;
      const key = `${base}::${selector}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const exemption = matchesExemption(selector);
      const pseudoExpander = findPseudoExpander(cssText, selector);
      const negMargin = hasNegativeMarginExpander(rule.block);

      let size = { width: 0, height: 0, minWidth: 0, minHeight: 0, display: '' };
      try {
        size = measureElement(window, className);
      } catch {
        /* invalid selector cascade in jsdom — оставляем 0 */
      }

      const visibleOk = isVisibleTouchOk(size);
      const tricks = [];
      if (pseudoExpander) tricks.push(pseudoExpander.kind);
      if (negMargin) tricks.push('negative-margin-expander');

      let bucket = 'violation';
      if (exemption) bucket = 'named-exception';
      else if (visibleOk && tricks.length === 0) bucket = 'pass';
      else if (tricks.length > 0) bucket = 'violation';

      if (bucket === 'pass') continue;

      entries.push({
        file: base,
        selector,
        className,
        zone,
        width: size.width,
        height: size.height,
        bucket,
        exemptionType: exemption?.type || null,
        exemptionReason: exemption?.reason || null,
        tricks,
      });
    }

    window.document.body.innerHTML = '';
  }

  const violations = entries.filter((e) => e.bucket === 'violation');
  const exceptions = entries.filter((e) => e.bucket === 'named-exception');
  const byZone = {};
  for (const e of [...violations, ...exceptions]) {
    const z = e.zone || '(unknown)';
    byZone[z] = byZone[z] || { violations: 0, exceptions: 0 };
    if (e.bucket === 'violation') byZone[z].violations += 1;
    else byZone[z].exceptions += 1;
  }

  const byFile = {};
  for (const v of violations) {
    byFile[v.file] = (byFile[v.file] || 0) + 1;
  }

  return {
    captured: new Date().toISOString().slice(0, 10),
    minTouchPx: MIN_TOUCH_PX,
    scannedFiles: files.map((f) => path.basename(f)),
    counts: {
      violations: violations.length,
      exceptions: exceptions.length,
      interactiveRules: seen.size,
    },
    byZone,
    byFile,
    violations,
    exceptions,
  };
}

/**
 * @param {object} inventory
 * @param {object} baseline
 */
export function compareRatchet(inventory, baseline) {
  const current = inventory.counts.violations;
  const frozen = baseline?.totalViolations ?? 0;
  const newKeys = [];
  const baselineKeys = new Set(baseline?.violationKeys || []);
  for (const v of inventory.violations) {
    const key = `${v.file}::${v.selector}`;
    if (!baselineKeys.has(key)) newKeys.push(key);
  }
  const fixed = baselineKeys.size
    ? [...baselineKeys].filter(
        (k) => !inventory.violations.some((v) => `${v.file}::${v.selector}` === k),
      )
    : [];

  return {
    current,
    baseline: frozen,
    delta: current - frozen,
    newKeys,
    fixed,
    fail: current > frozen || newKeys.length > 0,
  };
}

function violationKeys(inventory) {
  return inventory.violations.map((v) => `${v.file}::${v.selector}`).sort();
}

function writeJson(target, data) {
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function printSummary(inventory) {
  console.log(
    `Touch-target inventory: ${inventory.counts.violations} violations, ` +
      `${inventory.counts.exceptions} named exceptions, ` +
      `${inventory.scannedFiles.length} CSS files.`,
  );
  const zones = Object.entries(inventory.byZone).sort((a, b) => b[1].violations - a[1].violations);
  console.log('By zone (violations / exceptions):');
  for (const [zone, c] of zones.slice(0, 15)) {
    console.log(`  ${zone}: ${c.violations} / ${c.exceptions}`);
  }
  if (zones.length > 15) console.log(`  … +${zones.length - 15} zones`);
}

async function main() {
  const inventory = await collectInventory();

  if (wantInventory || (!wantCheck && !updateBaseline)) {
    writeJson(INVENTORY_PATH, inventory);
    if (asJson) {
      console.log(JSON.stringify(inventory, null, 2));
    } else {
      printSummary(inventory);
      console.log(`Inventory → ${path.relative(ROOT, INVENTORY_PATH)}`);
    }
  }

  if (updateBaseline) {
    const baseline = {
      captured: inventory.captured,
      totalViolations: inventory.counts.violations,
      byFile: inventory.byFile,
      violationKeys: violationKeys(inventory),
    };
    writeJson(BASELINE_PATH, baseline);
    console.log(
      `Baseline updated: ${baseline.totalViolations} violations, ` +
        `${baseline.violationKeys.length} keys → ${path.relative(ROOT, BASELINE_PATH)}`,
    );
    return;
  }

  if (wantCheck) {
    let baseline = { totalViolations: 0, violationKeys: [] };
    if (fs.existsSync(BASELINE_PATH)) {
      baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    }
    const ratchet = compareRatchet(inventory, baseline);
    if (asJson) {
      console.log(JSON.stringify({ inventory: inventory.counts, ratchet }, null, 2));
    } else {
      console.log(
        `Ratchet: ${ratchet.current} violations (baseline ${ratchet.baseline}, Δ ${ratchet.delta >= 0 ? '+' : ''}${ratchet.delta})`,
      );
      if (ratchet.newKeys.length) {
        console.error(`❌ Новые нарушения (${ratchet.newKeys.length}):`);
        for (const k of ratchet.newKeys.slice(0, 20)) console.error(`  ${k}`);
        if (ratchet.newKeys.length > 20) console.error(`  … +${ratchet.newKeys.length - 20}`);
      }
      if (ratchet.fixed.length) {
        console.log(`Исправлено с baseline (${ratchet.fixed.length}) — обновите baseline:`);
        for (const k of ratchet.fixed.slice(0, 10)) console.log(`  − ${k}`);
      }
    }
    if (ratchet.fail) process.exitCode = 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
