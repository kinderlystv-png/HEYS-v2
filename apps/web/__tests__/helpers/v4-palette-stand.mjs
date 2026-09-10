/**
 * Unified v4 palette stand — mount 4 sets on documentElement, probe computed UI.
 * Pattern: curator-sheet-palette, messenger-bubble-v4-palette, registration-wheel-v4-palette.
 */
import fs from 'node:fs';
import postcss from 'postcss';
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
/**
 * Выбросить из CSS правила, которые не могут совпасть ни с одним узлом стенда.
 *
 * Стенд одной зоны берёт до мегабайта CSS, а дорог здесь не разбор (2 мс) и не
 * разметка (12 мс), а первый getComputedStyle на узел: happy-dom примеряет к
 * нему КАЖДОЕ правило, и это 0,8 с на элемент. Отсюда сорок минут на инвентарь.
 *
 * Решает не число вставок, а объём примеряемого. Правило, у которого самый
 * правый компаунд требует класса, идентификатора или тега, которых в дереве
 * стенда нет, не может повлиять ни на один замер — его выбрасываем. Набор
 * палитры переключается атрибутами на КОРНЕ, состав узлов при этом не меняется,
 * поэтому один и тот же отбор верен для всех четырёх наборов.
 *
 * Отбор намеренно трусливый: всё, чего не разобрали уверенно — `:is()`, `*`,
 * `:root`, экранированные имена, любая неожиданная форма — остаётся. Замер на
 * входе: 959 → 244 КБ, 53,3 → 6,9 с, все 52 значения совпали до цифры.
 */
export function filterCssForDom(cssText, doc) {
  const inv = domInventory(doc);
  const root = postcss.parse(cssText);
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    const kept = rule.selectors.filter((selector) => selectorCanMatch(selector, inv));
    if (!kept.length) rule.remove();
    else if (kept.length !== rule.selectors.length) rule.selectors = kept;
  });
  root.walkAtRules((at) => {
    if (at.nodes && !at.nodes.length) at.remove();
  });
  return root.toString();
}

function domInventory(doc) {
  const classes = new Set();
  const ids = new Set();
  const tags = new Set(['html', 'head', 'body']);
  for (const el of doc.querySelectorAll('*')) {
    tags.add(el.tagName.toLowerCase());
    if (el.id) ids.add(el.id);
    for (const name of el.classList) classes.add(name);
  }
  return { classes, ids, tags };
}

const PSEUDO_RE = /::?[a-zA-Z-]+(\([^()]*\))?/g;
const BRACKET_RE = /\[[^\]]*\]/g;

function selectorCanMatch(selector, inv) {
  // Скобки атрибутов гасим до разбиения: в них бывают пробелы и комбинаторы.
  const flat = selector.replace(BRACKET_RE, '\u0000');
  const parts = flat.split(/[\s>+~]+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return true;
  const bare = last.replace(PSEUDO_RE, '');
  // Осталась скобка или экранирование — разобрать не берёмся, правило оставляем.
  if (/[()\\]/.test(bare)) return true;
  for (const m of bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    if (!inv.classes.has(m[1])) return false;
  }
  const id = bare.match(/#(-?[_a-zA-Z][\w-]*)/);
  if (id && !inv.ids.has(id[1])) return false;
  const tag = bare.match(/^([a-zA-Z][\w-]*)/);
  if (tag && !inv.tags.has(tag[1].toLowerCase())) return false;
  return true;
}

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

/**
 * Порядок наборов, объявленный полосам как контракт стенда.
 *
 * Значимая пара для цвета — светлый против ТЁМНОГО, а не песочный против
 * синего: у ролей чернил светлые наборы совпадают по построению, и сравнение
 * двух светлых не различает ничего.
 */
export const SETS = Object.freeze(V4_PALETTE_SETS.map((set) => set.id));

const SET_BY_ID = new Map(V4_PALETTE_SETS.map((set) => [set.id, set]));

/** Свойства, по которым анализатор судит о читаемости, залипании и контуре. */
const WATCH_PROPS = Object.freeze(['fontSize', 'fontWeight', 'boxShadow', 'borderColor']);

const BORDER_SIDES = Object.freeze([
  'border-left-color', 'border-bottom-color', 'border-top-color', 'border-right-color',
]);

/**
 * Цвет контура, когда рамка задана одной стороной.
 *
 * jsdom отдаёт шорткат `borderColor` пустым, если в правиле стоит только
 * `border-left`, — а именно так нарисована цитата в мессенджере
 * (`border-left: 2px solid var(--v4-act)`). Пустая строка здесь читалась бы
 * как «контура нет», то есть проверка молчала бы на живом контуре.
 */
function borderColorOf(doc, el, shorthand) {
  if (shorthand && String(shorthand).trim()) return shorthand;
  const cs = doc.defaultView.getComputedStyle(el);
  for (const side of BORDER_SIDES) {
    const value = cs.getPropertyValue(side).trim();
    if (value) return value;
  }
  return shorthand ?? '';
}

/**
 * Сырой замер зоны на всех четырёх наборах — слой, на котором написаны
 * фикстуры `stands/<зона>.stand.mjs` и анализатор `-analyze.mjs`.
 *
 * Отделён от auditScreenOnSet намеренно: тот и меряет, и судит, а здесь суд
 * вынесен наружу, чтобы шесть полос не изобрели шесть разных критериев
 * читаемости. Общий движок один и тот же — mountPaletteSet, injectCss,
 * effectiveBackground/effectiveColor.
 *
 * Селектор, которого нет в разметке, попадает в notFound, а не отдаёт пустой
 * замер: молчание на ненайденном узле читается как «сошлось», хотя означает
 * только, что смотреть было не на что.
 *
 * @param {{ zone: string, cssFiles: string[], html: string, watch: Record<string,string>, bodyStyle?: string }} stand
 * @param {{ doc?: Document, width?: number }} [options]
 */
export function measureZone(stand, { doc = globalThis.document, width = 375, noFilter = false } = {}) {
  if (!doc) throw new Error('measureZone: нет document — стенд запускается в jsdom-среде');

  const rawCss = [readModuleCss(...BASE_CSS_FILES), ...stand.cssFiles.map((file) => readWebCss(file))];
  const keys = Object.entries(stand.watch || {});

  // Отбор правил делается один раз на зону: он зависит только от состава узлов,
  // а тот у всех четырёх наборов один. Разметку для отбора ставим и убираем
  // здесь же, чтобы цикл ниже начинал с чистого тела.
  doc.body.innerHTML = stand.html;
  const css = noFilter ? rawCss : rawCss.map((chunk) => filterCssForDom(chunk, doc));
  doc.body.innerHTML = '';

  /** @type {Set<string>} */
  const notFound = new Set();
  /** @type {Record<string, Record<string, object>>} */
  const sets = {};
  let rendered = false;

  // CSS вкладывается и разметка пересоздаётся ВНУТРИ цикла по наборам, и это не
  // расточительность, а условие правильного замера. 10 сентября вынос вставки за
  // цикл дал 644 → 197 с и неверные числа: happy-dom держит вычисленный стиль
  // элемента в кеше, который сбрасывают только мутации дерева, а смена
  // data-theme на <html> его не трогает. Наборы 2–4 возвращали числа первого —
  // кнопка входа на синем отдавала песочные чернила #2b1608 на синей заливке и
  // рождала ложную находку «контраст 2,53». Отцеп и прицеп <body> кеш корня
  // обновляет, но не кеш самих узлов, поэтому не годится тоже; проверено
  // замером на четырёх способах сброса.
  //
  // Дорога здесь не вставка CSS (2 мс) и не разбор разметки (12 мс), а первый
  // getComputedStyle на узел против ~1 МБ CSS — 0,8 с на элемент. Ускорять надо
  // объём CSS, который берёт стенд, а не число вставок; и любое такое ускорение
  // обязано доказать, что числа не изменились.
  for (const setId of SETS) {
    const styles = [];
    try {
      mountPaletteSet(doc, SET_BY_ID.get(setId));
      for (const chunk of css) styles.push(injectCss(doc, chunk));
      doc.body.setAttribute('style', stand.bodyStyle || `margin:0;width:${width}px;background:var(--v4-hero,#efe3cf)`);
      doc.body.innerHTML = stand.html;
      rendered = true;

      const measured = {};
      for (const [name, selector] of keys) {
        const el = doc.querySelector(selector);
        if (!el) {
          notFound.add(name);
          continue;
        }
        const probe = probeComputed(doc, selector, WATCH_PROPS);
        measured[name] = {
          ...probe,
          // Собственный фон узла часто прозрачен, и «мой цвет применился» ещё
          // не значит, что человек увидит именно его: считается то, что реально
          // лежит под текстом.
          color: effectiveColor(doc, el),
          background: effectiveBackground(doc, el),
          borderColor: borderColorOf(doc, el, probe.borderColor),
        };
      }
      sets[setId] = measured;
    } finally {
      for (const style of styles) style.remove();
      doc.body.innerHTML = '';
      unmountPaletteSet(doc);
    }
  }

  return { rendered, notFound: [...notFound], sets };
}

export { BASE_CSS_FILES, WEB_DIR, MODULES_DIR };
