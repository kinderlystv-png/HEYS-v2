import {
  inspectAssertionVerdictGate,
  validateContractAssertions,
} from './ui-v4-assertions.mjs';

export const UI_V4_DOM_EVIDENCE_VERSION = 'dom-evidence-v1';
export const UI_V4_DOM_EVIDENCE_STATUSES = Object.freeze([
  'matched',
  'mismatched',
  'inconclusive',
]);

const VALID_SOURCES = new Set(['runtime', 'canvas']);
const CSS_WIDE_VALUES = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return isObject(object) && Object.hasOwn(object, key) ? object[key] : undefined;
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function sameNumber(left, right) {
  return Math.abs(left - right) <= 1e-6;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\p{White_Space}\u200B]+/gu, ' ')
    .trim();
}

function normalizeFamily(value) {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase())
    .filter(Boolean);
}

function normalizeMeasure(value, fallbackUnit = null) {
  if (isObject(value) && Object.hasOwn(value, 'value')) {
    const numeric = number(value.value);
    if (numeric === null) return null;
    const unit = String(value.unit ?? fallbackUnit ?? (numeric === 0 ? 'number' : '')).toLowerCase();
    if (!['px', '%', 'number'].includes(unit)) return null;
    return { value: numeric, unit: numeric === 0 ? 'number' : unit };
  }
  if (typeof value === 'number') {
    return { value, unit: value === 0 ? 'number' : fallbackUnit ?? 'number' };
  }
  const match = String(value ?? '').trim().match(/^(-?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(px|%)?$/i);
  if (!match) return null;
  const numeric = number(match[1]);
  if (numeric === null) return null;
  const unit = match[2]?.toLowerCase() ?? fallbackUnit ?? (numeric === 0 ? 'number' : 'number');
  return { value: numeric, unit: numeric === 0 ? 'number' : unit };
}

function normalizeMeasureList(value, fallbackUnit = null) {
  if (isObject(value) && Array.isArray(value.values)) {
    const values = value.values.map((item) => normalizeMeasure(item, fallbackUnit));
    return values.every(Boolean) ? values : null;
  }
  if (Array.isArray(value)) {
    const values = value.map((item) => normalizeMeasure(item, fallbackUnit));
    return values.every(Boolean) ? values : null;
  }
  if (typeof value === 'number' || isObject(value)) {
    const item = normalizeMeasure(value, fallbackUnit);
    return item ? [item] : null;
  }
  const source = String(value ?? '').trim();
  if (!source || source.includes('/')) return null;
  const parts = source.split(/\s+/);
  const values = parts.map((item) => normalizeMeasure(item, fallbackUnit));
  return values.every(Boolean) ? values : null;
}

function expandBox(values) {
  if (!values || values.length < 1 || values.length > 4) return null;
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return values;
}

function compareMeasure(expected, actual) {
  if (!expected || !actual) return { conclusive: false, matched: false };
  if (expected.unit !== actual.unit) {
    if (expected.value === 0 && actual.value === 0) return { conclusive: true, matched: true };
    return { conclusive: false, matched: false };
  }
  return { conclusive: true, matched: sameNumber(expected.value, actual.value) };
}

function compareMeasureLists(expected, actual, property) {
  let left = expected;
  let right = actual;
  if (['padding', 'margin', 'border-radius'].includes(property)) {
    left = expandBox(left);
    right = expandBox(right);
  }
  if (!left || !right || left.length !== right.length) {
    return { conclusive: false, matched: false };
  }
  let matched = true;
  for (let index = 0; index < left.length; index += 1) {
    const result = compareMeasure(left[index], right[index]);
    if (!result.conclusive) return result;
    matched &&= result.matched;
  }
  return { conclusive: true, matched };
}

function normalizeCssExpression(value) {
  let source = String(value ?? '').trim().toLowerCase();
  if (!source) return '';
  if (/^--[a-z0-9-]+$/.test(source)) source = `var(${source})`;
  source = source
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),/])\s*/g, '$1')
    .replace(/(^|[^\d])\.([0-9]+)/g, '$10.$2');
  return source;
}

function parseHexColor(source) {
  const match = source.match(/^#([0-9a-f]{3,8})$/i);
  if (!match || ![3, 4, 6, 8].includes(match[1].length)) return null;
  let hex = match[1];
  if (hex.length <= 4) hex = [...hex].map((item) => `${item}${item}`).join('');
  const hasAlpha = hex.length === 8;
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hasAlpha ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbColor(source) {
  const match = source.match(/^rgba?\((.+)\)$/i);
  if (!match || match[1].includes('var(')) return null;
  const body = match[1].replace(/\s*\/\s*/, ',');
  const parts = body.split(/\s*,\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = parts.slice(0, 3).map(number);
  const alpha = parts[3] === undefined ? 1 : number(parts[3]);
  if (channels.some((item) => item === null) || alpha === null) return null;
  return { red: channels[0], green: channels[1], blue: channels[2], alpha };
}

function normalizeColor(value) {
  const css = normalizeCssExpression(value);
  const rgba = parseHexColor(css) || parseRgbColor(css);
  return { css, rgba };
}

function sameColor(left, right) {
  if (!left || !right) return false;
  if (left.css === right.css) return true;
  if (!left.rgba || !right.rgba) return false;
  return ['red', 'green', 'blue', 'alpha']
    .every((key) => sameNumber(left.rgba[key], right.rgba[key]));
}

function readBucket(actual, bucket, property) {
  if (!isObject(actual)) return undefined;
  const container = own(actual, bucket);
  if (!isObject(container)) return container;
  const camel = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return own(container, property) ?? own(container, camel) ?? own(container, 'value');
}

function readActual(item, assertion) {
  const actual = item.actual;
  if (!isObject(actual)) return actual;
  if (assertion.kind === 'text') {
    return own(actual, 'text') ?? own(actual, 'textContent') ?? own(actual, 'content');
  }
  if (assertion.kind === 'semantic') {
    return readBucket(actual, 'semantic', assertion.property)
      ?? own(actual, assertion.property)
      ?? own(actual, 'value');
  }
  if (assertion.kind === 'dimensions') {
    return readBucket(actual, 'computedStyle', assertion.property)
      ?? readBucket(actual, 'geometry', assertion.property)
      ?? own(actual, assertion.property)
      ?? own(actual, 'value');
  }
  if (assertion.kind === 'typography') {
    return own(actual, 'computedStyle') ?? own(actual, 'font') ?? actual;
  }
  return readBucket(actual, 'computedStyle', assertion.property)
    ?? own(actual, assertion.property)
    ?? own(actual, 'value');
}

function compareText(assertion, item) {
  const actual = readActual(item, assertion);
  if (typeof actual !== 'string') return { conclusive: false };
  const expected = normalizeText(assertion.expected);
  const normalizedActual = normalizeText(actual);
  return { conclusive: true, matched: expected === normalizedActual, expected, actual: normalizedActual };
}

function compareDimensions(assertion, item) {
  const rawActual = readActual(item, assertion);
  const expected = normalizeMeasureList(assertion.expected);
  const fallbackUnit = isObject(item.actual) && own(item.actual, 'geometry') !== undefined ? 'px' : null;
  const actual = normalizeMeasureList(rawActual, fallbackUnit);
  const comparison = compareMeasureLists(expected, actual, assertion.property);
  return { ...comparison, expected, actual };
}

function fontField(value, kebab, camel) {
  if (!isObject(value)) return undefined;
  return own(value, kebab) ?? own(value, camel);
}

function parseFontShorthand(value) {
  const source = String(value ?? '').trim();
  const match = source.match(/(?:^|\s)(normal|bold|[1-9]00)\s+(-?(?:\d+(?:[.,]\d+)?|[.,]\d+))px(?:\s*\/\s*(-?(?:\d+(?:[.,]\d+)?|[.,]\d+))(px|%)?)?\s+(.+)$/i);
  if (!match) return null;
  return {
    fontWeight: match[1],
    fontSize: `${match[2]}px`,
    lineHeight: match[3] ? `${match[3]}${match[4] || ''}` : undefined,
    fontFamily: match[5],
  };
}

function compareTypography(assertion, item) {
  if (assertion.property !== 'font' || !isObject(assertion.expected)) return { conclusive: false };
  let actual = readActual(item, assertion);
  if (typeof actual === 'string') actual = parseFontShorthand(actual);
  if (!isObject(actual)) return { conclusive: false };

  const weightRaw = fontField(actual, 'font-weight', 'fontWeight');
  const sizeRaw = fontField(actual, 'font-size', 'fontSize');
  const lineHeightRaw = fontField(actual, 'line-height', 'lineHeight');
  const familyRaw = fontField(actual, 'font-family', 'fontFamily');
  const weight = weightRaw === 'normal' ? 400 : weightRaw === 'bold' ? 700 : number(weightRaw);
  const size = normalizeMeasure(sizeRaw);
  const expectedSize = normalizeMeasure(assertion.expected.size);
  const expectedLineHeight = normalizeMeasure(assertion.expected.lineHeight);
  let lineHeight = normalizeMeasure(lineHeightRaw);
  if (!lineHeight && typeof lineHeightRaw === 'number') lineHeight = normalizeMeasure(lineHeightRaw);
  const families = normalizeFamily(familyRaw);
  const expectedFamilies = normalizeFamily(assertion.expected.family);
  if (weight === null || !size || !lineHeight || !families.length || !expectedFamilies.length) {
    return { conclusive: false, expected: assertion.expected, actual };
  }

  let lineComparison;
  if (expectedLineHeight?.unit === 'number' && lineHeight.unit === 'px' && size.unit === 'px') {
    lineComparison = { conclusive: true, matched: sameNumber(expectedLineHeight.value * size.value, lineHeight.value) };
  } else if (expectedLineHeight?.unit === '%' && lineHeight.unit === 'px' && size.unit === 'px') {
    lineComparison = { conclusive: true, matched: sameNumber((expectedLineHeight.value / 100) * size.value, lineHeight.value) };
  } else {
    lineComparison = compareMeasure(expectedLineHeight, lineHeight);
  }
  const sizeComparison = compareMeasure(expectedSize, size);
  if (!lineComparison.conclusive || !sizeComparison.conclusive) {
    return { conclusive: false, expected: assertion.expected, actual };
  }
  return {
    conclusive: true,
    matched: weight === assertion.expected.weight
      && sizeComparison.matched
      && lineComparison.matched
      && families[0] === expectedFamilies[0],
    expected: assertion.expected,
    actual: { weight, size, lineHeight, families },
  };
}

function compareColor(assertion, item) {
  if (assertion.property === 'opacity' || assertion.property === 'ink-opacity') {
    const expected = normalizeMeasure(assertion.expected);
    let actual = normalizeMeasure(readActual(item, assertion));
    if (expected?.unit === '%' && actual?.unit === 'number') {
      actual = { value: actual.value * 100, unit: '%' };
    } else if (expected?.unit === 'number' && actual?.unit === '%') {
      actual = { value: actual.value / 100, unit: 'number' };
    }
    const comparison = compareMeasure(expected, actual);
    return { ...comparison, expected, actual };
  }

  const expectedCss = assertion.expected?.css;
  if (typeof expectedCss !== 'string') return { conclusive: false };
  const actualObject = isObject(item.actual) ? item.actual : {};
  const rawActual = readActual(item, assertion);
  const declared = own(actualObject, 'declared') ?? own(actualObject, 'token') ?? rawActual;
  const resolved = own(actualObject, 'resolved') ?? own(actualObject, 'resolvedValue')
    ?? readBucket(actualObject, 'computedStyle', assertion.property);
  const expected = normalizeColor(expectedCss);
  const declaredColor = normalizeColor(declared);
  if (sameColor(expected, declaredColor)) {
    return { conclusive: true, matched: true, expected, actual: { declared: declaredColor, resolved } };
  }
  if (expected.rgba && resolved !== undefined) {
    const resolvedColor = normalizeColor(resolved);
    return {
      conclusive: true,
      matched: sameColor(expected, resolvedColor),
      expected,
      actual: { declared: declaredColor, resolved: resolvedColor },
    };
  }
  const expectedResolved = item.expectedResolved ?? own(actualObject, 'expectedResolved');
  if (!expected.rgba && expectedResolved !== undefined && resolved !== undefined) {
    const expectedResolvedColor = normalizeColor(expectedResolved);
    const resolvedColor = normalizeColor(resolved);
    return {
      conclusive: Boolean(expectedResolvedColor.rgba && resolvedColor.rgba),
      matched: sameColor(expectedResolvedColor, resolvedColor),
      expected: { token: expected, resolved: expectedResolvedColor },
      actual: { declared: declaredColor, resolved: resolvedColor },
    };
  }
  if (CSS_WIDE_VALUES.has(expected.css)) {
    return { conclusive: true, matched: expected.css === declaredColor.css, expected, actual: declaredColor };
  }
  return { conclusive: false, expected, actual: { declared: declaredColor, resolved } };
}

function compareLayout(assertion, item) {
  const rawActual = readActual(item, assertion);
  if (rawActual === undefined || rawActual === null) return { conclusive: false };
  if (assertion.property === 'flex' && typeof assertion.expected === 'number') {
    const normalized = String(rawActual).trim().replace(',', '.').replace(/\s+/g, ' ');
    const accepted = [String(assertion.expected), `${assertion.expected} 1 0%`];
    return { conclusive: true, matched: accepted.includes(normalized), expected: assertion.expected, actual: normalized };
  }
  const expected = normalizeText(assertion.expected).toLowerCase();
  const actual = normalizeText(rawActual).toLowerCase();
  return { conclusive: true, matched: expected === actual, expected, actual };
}

function compareSemantic(assertion, item) {
  const rawActual = readActual(item, assertion);
  if (rawActual === undefined || rawActual === null) return { conclusive: false };
  if (typeof assertion.expected === 'boolean') {
    if (typeof rawActual !== 'boolean') return { conclusive: false };
    return { conclusive: true, matched: rawActual === assertion.expected, expected: assertion.expected, actual: rawActual };
  }
  const expected = normalizeText(assertion.expected).toLowerCase();
  const actual = normalizeText(rawActual).toLowerCase();
  return { conclusive: true, matched: expected === actual, expected, actual };
}

function compareAssertion(assertion, item) {
  if (assertion.kind === 'text') return compareText(assertion, item);
  if (assertion.kind === 'dimensions') return compareDimensions(assertion, item);
  if (assertion.kind === 'typography') return compareTypography(assertion, item);
  if (assertion.kind === 'color') return compareColor(assertion, item);
  if (assertion.kind === 'layout') return compareLayout(assertion, item);
  if (assertion.kind === 'semantic') return compareSemantic(assertion, item);
  return { conclusive: false };
}

function inconclusive(assertion, reason, item) {
  return {
    assertionId: assertion.id,
    status: 'inconclusive',
    expected: assertion.expected,
    actual: item?.actual,
    reason,
    ...(item?.selector ? { selector: item.selector } : {}),
    ...(item?.source ? { source: item.source } : {}),
  };
}

/**
 * Compares typed assertions only with explicit, already collected DOM evidence.
 * It never derives selectors from contract prose and never reads a browser.
 */
export function evaluateDomEvidence({ parsed, evidence = [] } = {}) {
  const validation = validateContractAssertions(parsed);
  const problems = [...validation.problems];
  const assertions = new Map((parsed?.assertions || []).map((assertion) => [assertion.id, assertion]));
  const evidenceByAssertion = new Map();
  const duplicateIds = new Set();

  if (!Array.isArray(evidence)) {
    problems.push({ path: 'evidence', kind: 'not-array' });
    evidence = [];
  }
  for (const [index, item] of evidence.entries()) {
    const path = `evidence[${index}]`;
    if (!isObject(item)) {
      problems.push({ path, kind: 'not-object' });
      continue;
    }
    if (!assertions.has(item.assertionId)) {
      problems.push({ path: `${path}.assertionId`, kind: 'unknown-assertion' });
      continue;
    }
    if (evidenceByAssertion.has(item.assertionId)) {
      duplicateIds.add(item.assertionId);
      problems.push({ path: `${path}.assertionId`, kind: 'duplicate-evidence' });
      continue;
    }
    evidenceByAssertion.set(item.assertionId, item);
  }

  const results = [];
  for (const assertion of assertions.values()) {
    const item = evidenceByAssertion.get(assertion.id);
    if (!item) {
      problems.push({ path: 'evidence', kind: 'missing-evidence', assertionId: assertion.id });
      results.push(inconclusive(assertion, 'missing-evidence'));
      continue;
    }
    if (duplicateIds.has(assertion.id)) {
      results.push(inconclusive(assertion, 'duplicate-evidence', item));
      continue;
    }
    if (item.sourceHash !== parsed?.sourceHash) {
      const kind = item.sourceHash ? 'stale-source-hash' : 'missing-source-hash';
      problems.push({ path: 'evidence.sourceHash', kind, assertionId: assertion.id });
      results.push(inconclusive(assertion, kind, item));
      continue;
    }
    if (typeof item.selector !== 'string' || !item.selector.trim()) {
      problems.push({ path: 'evidence.selector', kind: 'missing-selector', assertionId: assertion.id });
      results.push(inconclusive(assertion, 'missing-selector', item));
      continue;
    }
    if (!VALID_SOURCES.has(item.source)) {
      problems.push({ path: 'evidence.source', kind: 'invalid-source', assertionId: assertion.id });
      results.push(inconclusive(assertion, 'invalid-source', item));
      continue;
    }
    if (item.property !== assertion.property) {
      problems.push({ path: 'evidence.property', kind: 'property-mismatch', assertionId: assertion.id });
      results.push(inconclusive(assertion, 'property-mismatch', item));
      continue;
    }
    if (!Object.hasOwn(item, 'actual')) {
      problems.push({ path: 'evidence.actual', kind: 'missing-actual', assertionId: assertion.id });
      results.push(inconclusive(assertion, 'missing-actual', item));
      continue;
    }

    const comparison = compareAssertion(assertion, item);
    if (!comparison.conclusive) {
      results.push({
        ...inconclusive(assertion, 'unsupported-or-incomparable-actual', item),
        expected: comparison.expected ?? assertion.expected,
        actual: comparison.actual ?? item.actual,
      });
      continue;
    }
    results.push({
      assertionId: assertion.id,
      status: comparison.matched ? 'matched' : 'mismatched',
      selector: item.selector,
      source: item.source,
      property: assertion.property,
      expected: comparison.expected ?? assertion.expected,
      actual: comparison.actual ?? item.actual,
    });
  }

  return {
    version: UI_V4_DOM_EVIDENCE_VERSION,
    sourceHash: parsed?.sourceHash,
    parseStatus: parsed?.parseStatus,
    evidence: results,
    problems,
    ok: validation.ok && problems.length === 0 && results.every((item) => item.status !== 'inconclusive'),
  };
}

/**
 * Applies the existing assertion verdict gate to conclusive evidence, while
 * preserving DOM collection failures as fail-closed problems.
 */
export function inspectDomEvidenceVerdictGate({ parsed, evidence, verdict, root } = {}) {
  const evaluated = evaluateDomEvidence({ parsed, evidence });
  const conclusiveEvidence = evaluated.evidence.filter((item) => item.status !== 'inconclusive');
  const gate = inspectAssertionVerdictGate({ parsed, verdict, evidence: conclusiveEvidence, root });
  const problems = [...evaluated.problems, ...gate.problems];
  if (verdict?.v === '=') {
    for (const item of evaluated.evidence.filter((entry) => entry.status === 'inconclusive')) {
      problems.push({
        path: 'evidence',
        kind: 'equal-requires-conclusive-evidence',
        assertionId: item.assertionId,
      });
    }
  }
  return { ok: problems.length === 0, problems, evaluated };
}
