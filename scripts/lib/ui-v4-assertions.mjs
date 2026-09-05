import crypto from 'node:crypto';

import {
  ALLOWED_MISMATCH_REASON_CODES,
  ALLOWED_NA_KINDS,
  resolveDecisionRef,
} from './ui-v4-verdicts.mjs';

export const UI_V4_ASSERTION_PARSER_VERSION = 'typed-assertions-v2';
export const UI_V4_ASSERTION_KINDS = Object.freeze([
  'text',
  'layout',
  'typography',
  'color',
  'dimensions',
  'semantic',
]);
export const UI_V4_PARSE_STATUSES = Object.freeze(['parsed', 'partial', 'unsupported']);
export const UI_V4_EVIDENCE_STATUSES = Object.freeze(['matched', 'mismatched']);

const ASSERTION_KIND_SET = new Set(UI_V4_ASSERTION_KINDS);
const PARSE_STATUS_SET = new Set(UI_V4_PARSE_STATUSES);
const EVIDENCE_STATUS_SET = new Set(UI_V4_EVIDENCE_STATUSES);
const MISMATCH_REASON_CODE_SET = new Set(ALLOWED_MISMATCH_REASON_CODES);
const NA_KIND_SET = new Set(ALLOWED_NA_KINDS);

const NUMBER_SOURCE = String.raw`-?(?:\d+(?:[.,]\d+)?|[.,]\d+)`;
const CSS_COLOR_SOURCE = String.raw`(?:var\(--[a-z0-9-]+\)|--[a-z0-9-]+|#[0-9a-f]{3,8}|(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\))`;
const IGNORABLE_SOURCE = /^[\s,;:.·—–-]*$/u;

function normalizeNumber(value) {
  return Number(String(value).replace(',', '.'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sourceHash(identity, value) {
  return crypto
    .createHash('sha256')
    .update(String(identity))
    .update('\0')
    .update(String(value))
    .digest('hex');
}

export function hashContractRow(row) {
  return sourceHash(row?.identity ?? '', row?.value ?? '');
}

function sourceSpan(value, start, end) {
  return { start, end, text: value.slice(start, end) };
}

function assertionId(kind, property, start, end) {
  return `a:${kind}:${property}:${start}-${end}`;
}

function parseMeasureList(raw, defaultUnit = null) {
  const tokens = [];
  const matcher = new RegExp(`(${NUMBER_SOURCE})\\s*(px|%)?`, 'giu');
  for (const match of raw.matchAll(matcher)) {
    const value = normalizeNumber(match[1]);
    const unit = match[2]?.toLowerCase() || null;
    const resolvedUnit = unit || defaultUnit || (value === 0 ? 'number' : null);
    if (!resolvedUnit) return null;
    tokens.push({ value, unit: resolvedUnit });
  }
  return tokens.length ? tokens : null;
}

function parseSlashMeasureList(raw, defaultUnit = 'px') {
  if (!raw.includes('/')) return null;
  const tokens = [];
  for (const part of raw.split('/')) {
    const match = new RegExp(`^\\s*(${NUMBER_SOURCE})\\s*(px|%)?\\s*$`, 'iu').exec(part);
    if (!match) return null;
    const value = normalizeNumber(match[1]);
    tokens.push({ value, unit: match[2]?.toLowerCase() || defaultUnit });
  }
  return tokens.length ? tokens : null;
}

function normalizeMarginToken(token) {
  return String(token).replace(/[,;]+$/u, '').trim();
}

function parseMarginToken(token) {
  const cleaned = normalizeMarginToken(token);
  if (cleaned.toLowerCase() === 'auto') return { value: 0, unit: 'auto' };
  const parsed = parseMeasureList(cleaned.replace(/px$/i, ' px'), 'px');
  return parsed?.[0] ?? null;
}

function grabColor(value, word) {
  const at = value.indexOf(`${word} `);
  if (at < 0) return null;
  const index = at + word.length + 1;
  if (value[index] === '#') {
    const match = /^#[0-9a-f]{3,8}/i.exec(value.slice(index));
    return match ? match[0] : null;
  }
  if (!/^(var|rgba|rgb)\(/i.test(value.slice(index))) return null;
  let depth = 0;
  let end = index;
  for (; end < value.length; end += 1) {
    if (value[end] === '(') depth += 1;
    else if (value[end] === ')') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return value.slice(index, end);
}

function collectMatches(value) {
  const matches = [];

  function add(match, kind, property, expected) {
    const start = match.index;
    const end = start + match[0].length;
    if (matches.some((item) => start < item.end && end > item.start)) return;
    matches.push({
      start,
      end,
      assertion: {
        id: assertionId(kind, property, start, end),
        kind,
        property,
        expected,
        sourceSpan: sourceSpan(value, start, end),
      },
    });
  }

  function addColorSpan(start, end, keyword, css) {
    const text = value.slice(start, end);
    add(
      { index: start, 0: text },
      'color',
      {
        цвет: 'color',
        фон: 'background',
        заливка: 'fill',
        обводка: 'stroke',
        линия: 'stroke',
        тон: 'color',
        тоном: 'color',
      }[keyword],
      { css },
    );
  }

  // A leading quoted label followed by a dash is the exact visible copy in the
  // generated element rows (for example: «Эксперт» — шрифт ...).
  for (const match of value.matchAll(/[«“"]([^»”"]+)[»”"](?=\s*(?:—|$))/gu)) {
    add(match, 'text', 'content', match[1]);
  }

  // Elsewhere a quote is only treated as exact copy when the contract names
  // the UI text-bearing role. Ordinary prose quotes remain unsupported.
  for (const match of value.matchAll(
    /(?:текст|подпись|надпись|строка|кнопка|заголовок|метка|слово|фраза)\s+(?:—\s*)?[«“"]([^»”"]+)[»”"]/giu,
  )) {
    add(match, 'text', 'content', match[1]);
  }

  for (const match of value.matchAll(
    /поле рисунка\s+(\d+)\s*[×x]\s*(\d+)\s*\(viewBox\s+([^)]+)\)/giu,
  )) {
    add(match, 'dimensions', 'svg-viewport', {
      width: Number(match[1]),
      height: Number(match[2]),
      viewBox: match[3].trim(),
    });
  }

  for (const match of value.matchAll(
    /точка r\s+(\d+(?:[.,]\d+)?)\s+в\s+\(([^)]+)\)/giu,
  )) {
    add(match, 'semantic', 'svg-circle', {
      r: normalizeNumber(match[1]),
      center: match[2].trim(),
    });
  }

  for (const match of value.matchAll(
    /ломаная,\s*точки\s+(.+?),\s*линия\s+((?:var\(--[a-z0-9-]+\)|rgba?\([^)]+\)|#[0-9a-f]{3,8}|currentColor))/giu,
  )) {
    add(match, 'semantic', 'svg-polyline', {
      points: match[1].trim(),
      stroke: match[2].trim(),
    });
  }

  for (const match of value.matchAll(new RegExp(String.raw`толщина\s+(${NUMBER_SOURCE})`, 'giu'))) {
    add(match, 'dimensions', 'stroke-width', {
      values: [{ value: normalizeNumber(match[1]), unit: 'number' }],
    });
  }

  for (const match of value.matchAll(new RegExp(String.raw`пунктир\s+(${NUMBER_SOURCE})`, 'giu'))) {
    add(match, 'layout', 'stroke-dasharray', normalizeNumber(match[1]));
  }

  for (const match of value.matchAll(/перенос(?:\s+строк)?\s+(wrap|nowrap)/giu)) {
    add(match, 'layout', 'white-space', match[1].toLowerCase());
  }

  for (const match of value.matchAll(/выравнивание\s+по\s+baseline/giu)) {
    add(match, 'layout', 'align-items', 'baseline');
  }

  for (const match of value.matchAll(/отступы\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/giu)) {
    const values = [match[1], match[2], match[3], match[4]].map((token) => parseMarginToken(token));
    if (values.some((item) => !item)) continue;
    add(match, 'dimensions', 'margin', { values });
  }

  for (const match of value.matchAll(/отступы\s+(\S+)\s+(\S+)\s+(\S+)/giu)) {
    const values = [match[1], match[2], match[3]].map((token) => parseMarginToken(token));
    if (values.some((item) => !item)) continue;
    add(match, 'dimensions', 'margin', { values });
  }

  for (const match of value.matchAll(/отступы\s+(-?\d+(?:[.,]\d+)?px)\s+(\S+)/giu)) {
    const values = [match[1], match[2]].map((token) => parseMarginToken(token));
    if (values.some((item) => !item)) continue;
    add(match, 'dimensions', 'margin', { values });
  }

  for (const match of value.matchAll(/кривая,\s*точки\s+([^,]+(?:\([^)]*\)[^,]*)*)/giu)) {
    add(match, 'semantic', 'svg-path', match[1].trim());
  }

  for (const match of value.matchAll(/моноцифр(?:ами|ы)/giu)) {
    add(match, 'typography', 'font-variant-numeric', 'tabular-nums');
  }

  const uiRolePrefix = value.match(
    /^(ключ \+|ключ|имя экрана|главная кнопка|карточка \.grp|плитка|строка списка|ярус|сноска|список \.cd|пилюля \+|пилюля|вторичная кнопка|проза|аватар|подвал|лист снизу|заголовок|имя|состояние|вариант|шапка|сетка плиток)\s*[:—–-]\s*/iu,
  );
  if (uiRolePrefix) {
    add(uiRolePrefix, 'semantic', 'ui-role', uiRolePrefix[1].trim());
  }

  for (const match of value.matchAll(/прямоугольник\s+(\d+)\s*[×x]\s*(\d+)/giu)) {
    add(match, 'dimensions', 'svg-rect', {
      width: Number(match[1]),
      height: Number(match[2]),
    });
  }

  for (const match of value.matchAll(/размытие\s+blur\(([^)]+)\)/giu)) {
    add(match, 'layout', 'filter', `blur(${match[1].trim()})`);
  }

  for (const match of value.matchAll(/фон\s+transparent/giu)) {
    add(match, 'color', 'background', { css: 'transparent' });
  }

  const fontPattern = new RegExp(
    String.raw`шрифт\s+(\d{3})\s+(${NUMBER_SOURCE})\s*px\s*\/\s*(${NUMBER_SOURCE})(px|%)?\s+([\p{L}][\p{L}\p{N} -]*?)(?=\s*(?:,|;|$))`,
    'giu',
  );
  for (const match of value.matchAll(fontPattern)) {
    add(match, 'typography', 'font', {
      weight: Number(match[1]),
      size: { value: normalizeNumber(match[2]), unit: 'px' },
      lineHeight: {
        value: normalizeNumber(match[3]),
        unit: match[4]?.toLowerCase() || 'number',
      },
      family: match[5].trim(),
    });
  }

  for (const match of value.matchAll(new RegExp(String.raw`(${NUMBER_SOURCE})\s*px\/(\d{3})`, 'giu'))) {
    add(match, 'typography', 'font-size', { value: normalizeNumber(match[1]), unit: 'px' });
    add(match, 'typography', 'font-weight', Number(match[2]));
  }

  for (const match of value.matchAll(new RegExp(String.raw`интерлиньяж\s+(${NUMBER_SOURCE})`, 'giu'))) {
    add(match, 'typography', 'line-height', {
      value: normalizeNumber(match[1]),
      unit: 'number',
    });
  }

  for (const match of value.matchAll(new RegExp(String.raw`трекинг\s+(-?${NUMBER_SOURCE})\s*em`, 'giu'))) {
    add(match, 'typography', 'letter-spacing', {
      value: normalizeNumber(match[1]),
      unit: 'em',
    });
  }

  for (const match of value.matchAll(/поля\s+(\d+(?:\/\d+)+)\s*(?:px)?/giu)) {
    const values = parseSlashMeasureList(match[1]);
    if (!values) continue;
    add(match, 'dimensions', 'padding', { values });
  }

  const measureValue = String.raw`(?:${NUMBER_SOURCE}\s*(?:px|%)|${NUMBER_SOURCE}|0)`;
  const dimensionsPattern = new RegExp(
    String.raw`(?:ширина|высота|зазор|gap|радиус|border-radius|поля|padding|отступ\s+(?:сверху|снизу|слева|справа))\s*[:=]?\s*(${measureValue}(?:\s+${measureValue}){0,3})`,
    'giu',
  );
  const dimensionProperties = new Map([
    ['ширина', 'width'],
    ['высота', 'height'],
    ['зазор', 'gap'],
    ['gap', 'gap'],
    ['радиус', 'border-radius'],
    ['border-radius', 'border-radius'],
    ['поля', 'padding'],
    ['padding', 'padding'],
    ['отступ сверху', 'margin-top'],
    ['отступ снизу', 'margin-bottom'],
    ['отступ слева', 'margin-left'],
    ['отступ справа', 'margin-right'],
  ]);
  const implicitPxProperties = new Set(['width', 'height', 'border-radius', 'gap', 'padding']);
  for (const match of value.matchAll(dimensionsPattern)) {
    const keyword = match[0].slice(0, match[0].indexOf(match[1])).trim().toLowerCase();
    const property = dimensionProperties.get(keyword);
    const defaultUnit = implicitPxProperties.has(property) ? 'px' : null;
    const values = parseMeasureList(match[1], defaultUnit);
    if (!values) continue;
    add(match, 'dimensions', property, { values });
  }

  for (const match of value.matchAll(new RegExp(String.raw`высота от\s+(${NUMBER_SOURCE})\s*px`, 'giu'))) {
    add(match, 'dimensions', 'min-height', {
      values: [{ value: normalizeNumber(match[1]), unit: 'px' }],
    });
  }

  for (const match of value.matchAll(new RegExp(String.raw`высота не меньше\s+(${NUMBER_SOURCE})(?:\s*px)?`, 'giu'))) {
    add(match, 'dimensions', 'min-height', {
      values: [{ value: normalizeNumber(match[1]), unit: 'px' }],
    });
  }

  for (const match of value.matchAll(new RegExp(String.raw`ширина от\s+(${NUMBER_SOURCE})(?:\s*px)?`, 'giu'))) {
    add(match, 'dimensions', 'min-width', {
      values: [{ value: normalizeNumber(match[1]), unit: 'px' }],
    });
  }

  for (const match of value.matchAll(/отступ сверху auto/giu)) {
    add(match, 'dimensions', 'margin-top', { values: [{ value: 0, unit: 'auto' }] });
  }
  for (const match of value.matchAll(/отступ снизу auto/giu)) {
    add(match, 'dimensions', 'margin-bottom', { values: [{ value: 0, unit: 'auto' }] });
  }

  for (const match of value.matchAll(
    /(?:выравнивание|распределение)\s+(center|start|end|baseline|stretch|space-between|space-around|space-evenly|flex-start|flex-end)/giu,
  )) {
    const keyword = match[0].slice(0, match[0].lastIndexOf(match[1])).trim().toLowerCase();
    add(
      match,
      'layout',
      keyword === 'выравнивание' ? 'align-items' : 'justify-content',
      match[1].toLowerCase(),
    );
  }

  for (const match of value.matchAll(/направление\s+(\S+?)(?:,|$)/giu)) {
    add(match, 'layout', 'flex-direction', match[1].toLowerCase());
  }

  for (const match of value.matchAll(/выключка\s+(\S+?)(?:,|$)/giu)) {
    add(match, 'layout', 'text-align', match[1].toLowerCase());
  }

  for (const match of value.matchAll(/регистр\s+(\S+?)(?:,|$)/giu)) {
    add(match, 'typography', 'text-transform', match[1].toLowerCase());
  }

  for (const match of value.matchAll(/обрез\s+hidden/giu)) {
    add(match, 'layout', 'overflow', 'hidden');
  }

  for (const match of value.matchAll(/позиция\s+(absolute|relative|fixed|sticky)/giu)) {
    add(match, 'layout', 'position', match[1].toLowerCase());
  }

  for (const match of value.matchAll(/вписан\s+(\S+?)(?:,|$)/giu)) {
    add(match, 'layout', 'object-fit', match[1].toLowerCase());
  }

  for (const match of value.matchAll(/разделитель\s+(none|\S+?)(?:,|$)/giu)) {
    add(match, 'layout', 'border', match[1].toLowerCase());
  }

  for (const match of value.matchAll(new RegExp(String.raw`флекс\s+(none|${NUMBER_SOURCE})(?:,|$|\s)`, 'giu'))) {
    add(
      match,
      'layout',
      'flex',
      match[1].toLowerCase() === 'none' ? 'none' : normalizeNumber(match[1]),
    );
  }

  const opacityPattern = new RegExp(
    String.raw`(?:прозрачност(?:ь|ью)|opacity)\s+(${NUMBER_SOURCE})\s*(%)?`,
    'giu',
  );
  for (const match of value.matchAll(opacityPattern)) {
    add(match, 'color', 'opacity', {
      value: normalizeNumber(match[1]),
      unit: match[2] ? '%' : 'number',
    });
  }

  const inkPercentPattern = new RegExp(
    String.raw`(?:тоном\s+)?чернил(?:ами)?\s+(${NUMBER_SOURCE})\s*%`,
    'giu',
  );
  for (const match of value.matchAll(inkPercentPattern)) {
    const opacity = normalizeNumber(match[1]) / 100;
    add(match, 'color', 'color', { css: `rgba(var(--ink),${opacity})` });
  }

  const inkOpacityPattern = new RegExp(
    String.raw`тоном\s+чернил\s+(${NUMBER_SOURCE})\s*%`,
    'giu',
  );
  for (const match of value.matchAll(inkOpacityPattern)) {
    add(match, 'color', 'ink-opacity', {
      value: normalizeNumber(match[1]),
      unit: '%',
    });
  }

  for (const match of value.matchAll(/тоном\s+(--[a-z0-9-]+)/giu)) {
    addColorSpan(match.index, match.index + match[0].length, 'тоном', match[1]);
  }

  for (const word of ['фон', 'цвет']) {
    let searchFrom = 0;
    while (searchFrom < value.length) {
      const css = grabColor(value.slice(searchFrom), word);
      if (!css) break;
      const at = value.indexOf(`${word} `, searchFrom);
      if (at < 0) break;
      const start = at;
      const end = at + word.length + 1 + css.length;
      addColorSpan(start, end, word, css);
      searchFrom = end;
    }
  }

  for (const match of value.matchAll(
    new RegExp(String.raw`(?:заливка|обводка|линия)\s+(none|currentColor|${CSS_COLOR_SOURCE})`, 'giu'),
  )) {
    const keyword = match[0].slice(0, match[0].indexOf(match[1])).trim().toLowerCase();
    const property = {
      заливка: 'fill',
      обводка: 'stroke',
      линия: 'stroke',
    }[keyword];
    add(match, 'color', property, { css: match[1] });
  }

  const colorPattern = new RegExp(
    String.raw`(?:цвет|фон|заливка|обводка|линия|тон)\s+(${CSS_COLOR_SOURCE})`,
    'giu',
  );
  for (const match of value.matchAll(colorPattern)) {
    const keyword = match[0].slice(0, match[0].indexOf(match[1])).trim().toLowerCase();
    const property = {
      цвет: 'color',
      фон: 'background',
      заливка: 'fill',
      обводка: 'stroke',
      линия: 'stroke',
      тон: 'color',
    }[keyword];
    add(match, 'color', property, { css: match[1] });
  }

  const ringPattern = /рамка\s+(inset\s+(?:[^,()]+|\((?:[^()]|\([^()]*\))*\))+)/giu;
  for (const match of value.matchAll(ringPattern)) {
    add(match, 'layout', 'box-shadow', match[1].trim());
  }

  const shadowPattern = new RegExp(
    String.raw`рамка\s+((?:${NUMBER_SOURCE}|0)\s+(?:${NUMBER_SOURCE}|0)\s*px(?:\s+(?:${NUMBER_SOURCE}|0)\s*px)?\s+${CSS_COLOR_SOURCE}(?:,\s*(?:${NUMBER_SOURCE}|0)\s+(?:${NUMBER_SOURCE}|0)\s*px(?:\s+(?:${NUMBER_SOURCE}|0)\s*px)?\s+${CSS_COLOR_SOURCE})*)`,
    'giu',
  );
  for (const match of value.matchAll(shadowPattern)) {
    add(match, 'layout', 'box-shadow', match[1].trim());
  }

  for (const match of value.matchAll(/обводка\s+inset\s+([^,]+)/giu)) {
    add(match, 'layout', 'box-shadow', `inset ${match[1].trim()}`);
  }

  for (const match of value.matchAll(/role\s*=\s*['"]([a-z][a-z0-9-]*)['"]/giu)) {
    add(match, 'semantic', 'role', match[1].toLowerCase());
  }
  for (const match of value.matchAll(/область\s+прокрутки/giu)) {
    add(match, 'semantic', 'scroll-container', true);
  }

  return matches.sort((a, b) => a.start - b.start || a.end - b.end);
}

function unsupportedFragments(value, matches) {
  const fragments = [];

  function append(start, end) {
    while (start < end && /[\s,;:.·—–-]/u.test(value[start])) start += 1;
    while (end > start && /[\s,;:.·—–-]/u.test(value[end - 1])) end -= 1;
    if (start >= end) return;
    fragments.push({
      ...sourceSpan(value, start, end),
      reason: 'unrecognized-syntax',
    });
  }

  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      const raw = value.slice(cursor, match.start);
      if (!IGNORABLE_SOURCE.test(raw)) {
        append(cursor, match.start);
      }
    }
    cursor = Math.max(cursor, match.end);
  }
  if (cursor < value.length) {
    const raw = value.slice(cursor);
    if (!IGNORABLE_SOURCE.test(raw)) {
      append(cursor, value.length);
    }
  }
  return fragments;
}

/**
 * Parses only syntax whose meaning is deterministic. It never writes or
 * proposes a verdict: partial prose remains explicit debt.
 */
export function parseContractAssertions(row) {
  const identity = String(row?.identity ?? '');
  const value = String(row?.value ?? '');
  const matches = collectMatches(value);
  const assertions = matches.map((item) => item.assertion);
  const unsupported = unsupportedFragments(value, matches);

  if (!value.trim()) {
    unsupported.push({ start: 0, end: 0, text: '', reason: 'empty-source' });
  }

  const parseStatus = assertions.length === 0
    ? 'unsupported'
    : unsupported.length
      ? 'partial'
      : 'parsed';

  return {
    parserVersion: UI_V4_ASSERTION_PARSER_VERSION,
    identity,
    value,
    ...(Number.isInteger(row?.index) ? { index: row.index } : {}),
    ...(typeof row?.file === 'string' ? { file: row.file } : {}),
    sourceHash: sourceHash(identity, value),
    parseStatus,
    assertions,
    unsupportedFragments: unsupported,
  };
}

function validateSpan(document, span, path, problems) {
  if (
    !isPlainObject(span)
    || !Number.isInteger(span.start)
    || !Number.isInteger(span.end)
    || span.start < 0
    || span.end < span.start
    || span.end > document.value.length
  ) {
    problems.push({ path, kind: 'invalid-source-span' });
    return;
  }
  if (span.text !== document.value.slice(span.start, span.end)) {
    problems.push({ path, kind: 'source-span-drift' });
  }
}

export function validateContractAssertions(document) {
  const problems = [];
  if (!isPlainObject(document)) return { ok: false, problems: [{ path: '', kind: 'not-object' }] };
  if (document.parserVersion !== UI_V4_ASSERTION_PARSER_VERSION) {
    problems.push({ path: 'parserVersion', kind: 'unsupported-parser-version' });
  }
  if (typeof document.identity !== 'string') problems.push({ path: 'identity', kind: 'not-string' });
  if (typeof document.value !== 'string') problems.push({ path: 'value', kind: 'not-string' });
  if (
    typeof document.identity === 'string'
    && typeof document.value === 'string'
    && document.sourceHash !== sourceHash(document.identity, document.value)
  ) {
    problems.push({ path: 'sourceHash', kind: 'source-hash-drift' });
  }
  if (!PARSE_STATUS_SET.has(document.parseStatus)) {
    problems.push({ path: 'parseStatus', kind: 'invalid-parse-status' });
  }
  if (!Array.isArray(document.assertions)) {
    problems.push({ path: 'assertions', kind: 'not-array' });
  }
  if (!Array.isArray(document.unsupportedFragments)) {
    problems.push({ path: 'unsupportedFragments', kind: 'not-array' });
  }

  const ids = new Set();
  for (const [index, assertion] of (document.assertions || []).entries()) {
    const path = `assertions[${index}]`;
    if (!isPlainObject(assertion)) {
      problems.push({ path, kind: 'not-object' });
      continue;
    }
    if (typeof assertion.id !== 'string' || !assertion.id) {
      problems.push({ path: `${path}.id`, kind: 'invalid-id' });
    } else if (ids.has(assertion.id)) {
      problems.push({ path: `${path}.id`, kind: 'duplicate-id' });
    } else {
      ids.add(assertion.id);
    }
    if (!ASSERTION_KIND_SET.has(assertion.kind)) {
      problems.push({ path: `${path}.kind`, kind: 'invalid-assertion-kind' });
    }
    if (typeof assertion.property !== 'string' || !assertion.property) {
      problems.push({ path: `${path}.property`, kind: 'invalid-property' });
    }
    if (!Object.hasOwn(assertion, 'expected')) {
      problems.push({ path: `${path}.expected`, kind: 'missing-expected' });
    }
    validateSpan(document, assertion.sourceSpan, `${path}.sourceSpan`, problems);
  }
  for (const [index, fragment] of (document.unsupportedFragments || []).entries()) {
    validateSpan(document, fragment, `unsupportedFragments[${index}]`, problems);
    if (!fragment?.reason) {
      problems.push({ path: `unsupportedFragments[${index}].reason`, kind: 'missing-reason' });
    }
  }

  if (typeof document.value === 'string') {
    const coverage = [
      ...(document.assertions || []).map((item, index) => ({
        ...item?.sourceSpan,
        path: `assertions[${index}].sourceSpan`,
      })),
      ...(document.unsupportedFragments || []).map((item, index) => ({
        ...item,
        path: `unsupportedFragments[${index}]`,
      })),
    ]
      .filter((span) => Number.isInteger(span.start) && Number.isInteger(span.end))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = 0;
    for (const span of coverage) {
      if (span.start < cursor && span.end > span.start) {
        problems.push({ path: span.path, kind: 'overlapping-source-span' });
      }
      if (span.start > cursor && !IGNORABLE_SOURCE.test(document.value.slice(cursor, span.start))) {
        problems.push({
          path: span.path,
          kind: 'uncovered-source',
          start: cursor,
          end: span.start,
        });
      }
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < document.value.length && !IGNORABLE_SOURCE.test(document.value.slice(cursor))) {
      problems.push({
        path: 'value',
        kind: 'uncovered-source',
        start: cursor,
        end: document.value.length,
      });
    }
  }

  const assertionCount = document.assertions?.length || 0;
  const unsupportedCount = document.unsupportedFragments?.length || 0;
  if (document.parseStatus === 'parsed' && (assertionCount === 0 || unsupportedCount !== 0)) {
    problems.push({ path: 'parseStatus', kind: 'inconsistent-parsed-status' });
  }
  if (document.parseStatus === 'partial' && (assertionCount === 0 || unsupportedCount === 0)) {
    problems.push({ path: 'parseStatus', kind: 'inconsistent-partial-status' });
  }
  if (document.parseStatus === 'unsupported' && (assertionCount !== 0 || unsupportedCount === 0)) {
    problems.push({ path: 'parseStatus', kind: 'inconsistent-unsupported-status' });
  }

  return { ok: problems.length === 0, problems };
}

export function assertValidContractAssertions(document) {
  const result = validateContractAssertions(document);
  if (!result.ok) {
    const error = new Error(`Invalid UI v4 assertion document (${result.problems.length} problems).`);
    error.problems = result.problems;
    throw error;
  }
  return document;
}

/**
 * Fail-closed bridge between parsed assertions and a proposed row verdict.
 * Evidence is an array of { assertionId, status: matched|mismatched, ... }.
 */
export function inspectAssertionVerdictGate({ parsed, verdict, evidence = [], root } = {}) {
  const problems = [...validateContractAssertions(parsed).problems];
  const assertions = new Map((parsed?.assertions || []).map((item) => [item.id, item]));
  const evidenceByAssertion = new Map();

  if (!Array.isArray(evidence)) {
    problems.push({ path: 'evidence', kind: 'not-array' });
  } else {
    for (const [index, item] of evidence.entries()) {
      if (!isPlainObject(item)) {
        problems.push({ path: `evidence[${index}]`, kind: 'not-object' });
        continue;
      }
      if (!assertions.has(item.assertionId)) {
        problems.push({ path: `evidence[${index}].assertionId`, kind: 'unknown-assertion' });
      }
      if (evidenceByAssertion.has(item.assertionId)) {
        problems.push({ path: `evidence[${index}].assertionId`, kind: 'duplicate-evidence' });
      } else {
        evidenceByAssertion.set(item.assertionId, item);
      }
      if (!EVIDENCE_STATUS_SET.has(item.status)) {
        problems.push({ path: `evidence[${index}].status`, kind: 'invalid-evidence-status' });
      }
    }
  }

  const symbol = verdict?.v;
  if (symbol === '=') {
    if (parsed?.parseStatus !== 'parsed' || parsed?.unsupportedFragments?.length) {
      problems.push({ path: 'verdict.v', kind: 'equal-requires-fully-parsed-row' });
    }
    for (const assertion of assertions.values()) {
      if (evidenceByAssertion.get(assertion.id)?.status !== 'matched') {
        problems.push({
          path: 'evidence',
          kind: 'missing-matched-evidence',
          assertionId: assertion.id,
        });
      }
    }
  } else if (symbol === '≠') {
    if (![...evidenceByAssertion.values()].some((item) => item.status === 'mismatched')) {
      problems.push({ path: 'evidence', kind: 'mismatch-requires-mismatched-assertion' });
    }
    if (!MISMATCH_REASON_CODE_SET.has(verdict?.reasonCode)) {
      problems.push({ path: 'verdict.reasonCode', kind: 'invalid-reason-code' });
    }
    if (!resolveDecisionRef(verdict?.decisionRef, root).ok) {
      problems.push({ path: 'verdict.decisionRef', kind: 'invalid-decision-ref' });
    }
  } else if (symbol === '—') {
    if (!NA_KIND_SET.has(verdict?.naKind)) {
      problems.push({ path: 'verdict.naKind', kind: 'invalid-na-kind' });
    }
  } else if (symbol !== '?') {
    problems.push({ path: 'verdict.v', kind: 'invalid-verdict' });
  }

  return { ok: problems.length === 0, problems };
}

export function assertAssertionVerdictGate(input) {
  const result = inspectAssertionVerdictGate(input);
  if (!result.ok) {
    const error = new Error(`UI v4 assertion verdict gate failed (${result.problems.length} problems).`);
    error.problems = result.problems;
    throw error;
  }
  return input.verdict;
}
