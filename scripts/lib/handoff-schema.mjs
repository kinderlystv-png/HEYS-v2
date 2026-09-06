/**
 * Canonical verdict-handoff schema + strict validator.
 *
 * Normalizes legacy aliases (zone→zoneId, key|contractLine|contractKey→contractKey,
 * verdict|recommend|v→verdict, f|fact|fDraft→fact) and FAILs on missing required
 * fields — never silent skip.
 */
import fs from 'node:fs';

/** @typedef {'rows' | 'outOfScopeCssRows' | 'outOfScopeRuntimeRows'} HandoffRowSection */

export const HANDOFF_ROW_SECTIONS = ['rows', 'outOfScopeCssRows', 'outOfScopeRuntimeRows'];

export const CONTRACT_KEY_ALIASES = ['contractKey', 'key', 'contractLine'];
export const VERDICT_ALIASES = ['verdict', 'recommend', 'v'];
export const FACT_ALIASES = ['fact', 'f', 'fDraft'];
export const ZONE_ALIASES = ['zoneId', 'zone'];

const VALID_VERDICTS = new Set(['=', '≠', '?', '—', '!']);

export class HandoffValidationError extends Error {
  /**
   * @param {string} message
   * @param {{ path?: string, code?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'HandoffValidationError';
    this.path = meta.path ?? '';
    this.code = meta.code ?? 'handoff-invalid';
  }
}

function firstPresent(obj, names) {
  for (const name of names) {
    const value = obj?.[name];
    if (value != null && value !== '') return value;
  }
  return undefined;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {Record<string, unknown>} handoff
 * @param {{ zoneId?: string, filePath?: string }} [opts]
 * @returns {string}
 */
export function resolveHandoffZoneId(handoff, opts = {}) {
  if (opts.zoneId) return opts.zoneId;
  const top = firstPresent(handoff, ZONE_ALIASES);
  if (isNonEmptyString(top)) return top.trim();
  if (isNonEmptyString(handoff?.meta?.zone)) return handoff.meta.zone.trim();
  return '';
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string|undefined}
 */
export function pickContractKey(row) {
  return firstPresent(row, CONTRACT_KEY_ALIASES);
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string|undefined}
 */
export function pickVerdict(row) {
  const raw = firstPresent(row, VERDICT_ALIASES);
  return raw == null ? undefined : String(raw);
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string|undefined}
 */
export function pickFact(row) {
  const raw = firstPresent(row, FACT_ALIASES);
  return raw == null ? undefined : String(raw);
}

/**
 * @param {string} section
 * @param {number} index
 * @param {string} [filePath]
 */
function rowPath(section, index, filePath) {
  const base = `${section}[${index}]`;
  return filePath ? `${filePath}: ${base}` : base;
}

/**
 * @param {Record<string, unknown>} row
 * @param {HandoffRowSection} section
 * @param {number} index
 * @param {{ filePath?: string, requireFact?: boolean, requireVerdict?: boolean }} opts
 */
export function normalizeHandoffRow(row, section, index, opts = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new HandoffValidationError('row must be an object', {
      path: rowPath(section, index, opts.filePath),
      code: 'row-not-object',
    });
  }

  const contractKey = pickContractKey(row);
  if (!isNonEmptyString(contractKey)) {
    throw new HandoffValidationError(
      `missing contract key (expected one of: ${CONTRACT_KEY_ALIASES.join(', ')})`,
      { path: rowPath(section, index, opts.filePath), code: 'missing-contract-key' },
    );
  }

  const requireVerdict = opts.requireVerdict ?? section === 'rows';
  const requireFact = opts.requireFact ?? (section === 'rows' || section === 'outOfScopeRuntimeRows');

  const verdict = pickVerdict(row);
  if (requireVerdict && !isNonEmptyString(verdict)) {
    throw new HandoffValidationError(
      `missing verdict (expected one of: ${VERDICT_ALIASES.join(', ')})`,
      { path: `${rowPath(section, index, opts.filePath)}.verdict`, code: 'missing-verdict' },
    );
  }
  if (verdict != null && !VALID_VERDICTS.has(verdict)) {
    throw new HandoffValidationError(`invalid verdict «${verdict}»`, {
      path: `${rowPath(section, index, opts.filePath)}.verdict`,
      code: 'invalid-verdict',
    });
  }

  const fact = pickFact(row);
  if (requireFact && !isNonEmptyString(fact)) {
    throw new HandoffValidationError(
      `missing fact (expected one of: ${FACT_ALIASES.join(', ')})`,
      { path: `${rowPath(section, index, opts.filePath)}.fact`, code: 'missing-fact' },
    );
  }

  const normalized = {
    contractKey: contractKey.trim(),
    ...(verdict != null ? { verdict } : {}),
    ...(fact != null ? { fact } : {}),
    ...(row.h != null ? { h: String(row.h) } : {}),
    ...(row.note != null ? { note: String(row.note) } : {}),
    ...(row.reasonCode != null ? { reasonCode: String(row.reasonCode) } : {}),
    ...(row.decisionRef != null ? { decisionRef: String(row.decisionRef) } : {}),
    ...(row['na-kind'] != null ? { 'na-kind': String(row['na-kind']) } : {}),
    ...(row.options && typeof row.options === 'object' ? { options: row.options } : {}),
  };

  return normalized;
}

/**
 * Validate + normalize a handoff payload for batch apply.
 *
 * @param {unknown} raw
 * @param {{ zoneId?: string, filePath?: string }} [opts]
 */
export function validateHandoff(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HandoffValidationError('handoff root must be a JSON object', {
      path: opts.filePath ?? '<root>',
      code: 'root-not-object',
    });
  }

  const handoff = /** @type {Record<string, unknown>} */ (raw);
  const zoneId = resolveHandoffZoneId(handoff, opts);
  if (!isNonEmptyString(zoneId)) {
    throw new HandoffValidationError(
      `missing zoneId (expected top-level ${ZONE_ALIASES.join(' or ')}, or pass --zone)`,
      { path: opts.filePath ? `${opts.filePath}: zoneId` : 'zoneId', code: 'missing-zone' },
    );
  }

  const normalized = {
    zoneId: zoneId.trim(),
    rows: [],
    outOfScopeCssRows: [],
    outOfScopeRuntimeRows: [],
    meta: handoff.meta && typeof handoff.meta === 'object' ? handoff.meta : undefined,
  };

  let rowCount = 0;
  for (const section of HANDOFF_ROW_SECTIONS) {
    const list = handoff[section];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i += 1) {
      const requireFact = section === 'rows' || section === 'outOfScopeRuntimeRows';
      const requireVerdict = section === 'rows';
      normalized[section].push(
        normalizeHandoffRow(list[i], section, i, {
          filePath: opts.filePath,
          requireFact,
          requireVerdict,
        }),
      );
      rowCount += 1;
    }
  }

  if (rowCount === 0) {
    throw new HandoffValidationError(
      `no apply rows (expected at least one of: ${HANDOFF_ROW_SECTIONS.join(', ')})`,
      { path: opts.filePath ?? '<root>', code: 'empty-handoff' },
    );
  }

  return normalized;
}

/**
 * @param {string} filePath
 * @param {{ zoneId?: string }} [opts]
 */
export function validateHandoffFile(filePath, opts = {}) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return validateHandoff(raw, { ...opts, filePath });
}

/**
 * Inventory fingerprint for a handoff JSON value (pre-normalize).
 * @param {Record<string, unknown>} handoff
 */
export function classifyHandoffForm(handoff) {
  const topKeys = Object.keys(handoff || {}).sort();
  const rowSections = [];
  for (const name of ['rows', 'entries', 'proposals', 'outOfScopeCssRows', 'outOfScopeRuntimeRows']) {
    if (Array.isArray(handoff?.[name]) && handoff[name].length) rowSections.push(name);
  }

  const zoneField = ZONE_ALIASES.find((k) => isNonEmptyString(handoff?.[k])) || (isNonEmptyString(handoff?.meta?.zone) ? 'meta.zone' : 'none');
  const sampleRow = handoff?.rows?.[0] || handoff?.entries?.[0] || handoff?.proposals?.[0] || {};
  const keyField = CONTRACT_KEY_ALIASES.find((k) => sampleRow?.[k] != null) || 'none';
  const verdictField = VERDICT_ALIASES.find((k) => sampleRow?.[k] != null) || 'none';
  const factField = FACT_ALIASES.find((k) => sampleRow?.[k] != null) || 'none';

  return {
    fingerprint: `zone:${zoneField}|sections:${rowSections.join('+') || 'none'}|key:${keyField}|verdict:${verdictField}|fact:${factField}`,
    topKeys,
    rowSections,
    zoneField,
    keyField,
    verdictField,
    factField,
  };
}

/**
 * Collect per-field alias usage across all rows in a handoff file.
 * @param {Record<string, unknown>} handoff
 */
export function scanHandoffKeyVariants(handoff) {
  const counts = {
    contractKey: { contractKey: 0, key: 0, contractLine: 0, missing: 0 },
    verdict: { verdict: 0, recommend: 0, v: 0, missing: 0 },
    fact: { fact: 0, f: 0, fDraft: 0, missing: 0 },
    zone: { zoneId: 0, zone: 0, metaZone: 0, rowZone: 0, missing: 0 },
  };

  if (isNonEmptyString(handoff?.zoneId)) counts.zone.zoneId += 1;
  else if (isNonEmptyString(handoff?.zone)) counts.zone.zone += 1;
  else if (isNonEmptyString(handoff?.meta?.zone)) counts.zone.metaZone += 1;
  else counts.zone.missing += 1;

  const allRows = [];
  for (const section of [...HANDOFF_ROW_SECTIONS, 'entries', 'proposals']) {
    if (Array.isArray(handoff?.[section])) allRows.push(...handoff[section]);
  }

  for (const row of allRows) {
    if (!row || typeof row !== 'object') continue;
    const keyHit = CONTRACT_KEY_ALIASES.find((k) => isNonEmptyString(row[k]));
    if (keyHit) counts.contractKey[keyHit] += 1;
    else counts.contractKey.missing += 1;

    const verdictHit = VERDICT_ALIASES.find((k) => row[k] != null && row[k] !== '');
    if (verdictHit) counts.verdict[verdictHit] += 1;
    else counts.verdict.missing += 1;

    const factHit = FACT_ALIASES.find((k) => row[k] != null && row[k] !== '');
    if (factHit) counts.fact[factHit] += 1;
    else counts.fact.missing += 1;

    if (isNonEmptyString(row.zone) || isNonEmptyString(row.zoneId)) counts.zone.rowZone += 1;
  }

  return counts;
}
