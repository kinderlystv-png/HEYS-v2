// ui-v4-verdicts.mjs — доступ к вердиктам контракта v4.
//
// Вердикты лежат по файлу на зону: `docs/ui/verdicts/<зона>.json`. Прежде это
// был один файл на все зоны, и он дважды за 31 августа уехал в чужой коммит
// целиком: путь в `git commit -- <путь>` указывался верно, но файл всегда
// содержал чужое незакоммиченное — снимок правится в середине разбора зоны, а
// коммитить середину нельзя. Теперь чужая работа физически не может попасть в
// чужой коммит.
//
// Путь спрятан здесь намеренно: на снимок ссылались 27 мест, и следующая
// перекладка не должна снова расходиться по ним.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const VERDICTS_DIR = path.join(ROOT, 'docs/ui/verdicts');

export const VERDICT_SCHEMA_VERSION = 'typed-v1';
export const ALLOWED_MISMATCH_REASON_CODES = Object.freeze([
  'logic-invariant',
  'accessibility',
  'platform',
  'canvas-conflict',
  'owner-decision',
]);
export const ALLOWED_NA_KINDS = Object.freeze([
  'handoff',
  'foreign-zone',
  'demo-only',
  'designer-removed',
]);

// Миграционный потолок, снятый перед вводом typed-v1. Он разрешает старый долг,
// но не разрешает ему расти: новая зона получает нулевой бюджет, а закрытая
// зона (`verdictSchema: "typed-v1"`) больше не может вернуться к legacy-строкам.
// При типизации зоны числа здесь только уменьшают; после полного сведения зоны
// ставят `verdictSchema: "typed-v1"` в её собственном verdict-файле.
export const LEGACY_SCHEMA_BASELINE = Object.freeze({
  'app-splash': Object.freeze({
    mismatch: [4, 'b3d70a6cb7d03136'],
    notApplicable: [21, '281f90ac6ab91423'],
  }),
  'checkin-morning': Object.freeze({
    mismatch: [19, '5ecfe313700e55d6'],
    notApplicable: [49, '83426bd81e5dc908'],
  }),
  'curator-cabinet': Object.freeze({
    mismatch: [36, '7db49fa8901a80cd'],
    notApplicable: [17, '227a240a10a24074'],
  }),
  'curator-edits': Object.freeze({
    mismatch: [1, 'b677dfbd0d3317c7'],
    notApplicable: [29, 'f7ac9fda9e37b790'],
  }),
  cycle: Object.freeze({
    mismatch: [34, '45502debb389a861'],
    notApplicable: [20, '3b7bbcb8dd0c379a'],
  }),
  'date-remainders': Object.freeze({
    mismatch: [3, '479a2a90cd8a2261'],
    notApplicable: [271, '8cd18417a00fbfe4'],
  }),
  'food-meal': Object.freeze({
    mismatch: [42, 'b2f6f39764333217'],
    notApplicable: [90, '6a63a2f0e841fe63'],
  }),
  gamification: Object.freeze({
    mismatch: [52, 'e702b616d44c1544'],
    notApplicable: [74, 'e25cf3e3560a00f1'],
  }),
  'home-widgets': Object.freeze({
    mismatch: [128, 'edf7bb7aa487450a'],
    notApplicable: [1358, 'a9b8ff121eab0f64'],
  }),
  login: Object.freeze({
    mismatch: [58, 'b2a0b42479a27547'],
    notApplicable: [301, '624bf9693c19435e'],
  }),
  'norm-correction': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    notApplicable: [37, '3f2cfeaa0a205b26'],
  }),
  'nutrition-tab': Object.freeze({
    mismatch: [34, 'ebbd9f2d98f04491'],
    notApplicable: [168, '8c3144d10251c301'],
  }),
  'product-card': Object.freeze({
    mismatch: [67, '271da61309679fe2'],
    notApplicable: [76, 'ea3054255c5fd126'],
  }),
  'pwa-update': Object.freeze({
    mismatch: [10, '5e473419ff0364c9'],
    notApplicable: [47, '55f97943665ec79d'],
  }),
  questionnaire: Object.freeze({
    mismatch: [44, 'e7f7d20da23b3877'],
    notApplicable: [8, '93d4d16668687118'],
  }),
  registration: Object.freeze({
    mismatch: [67, '453575158970e0b1'],
    notApplicable: [28, '1a861974e2dfd0f8'],
  }),
  'reports-insights': Object.freeze({
    mismatch: [127, '84410b3594ff4c7e'],
    notApplicable: [136, '8d334efef1c9bb8a'],
  }),
  'service-curator': Object.freeze({
    mismatch: [2, 'b360becf15443345'],
    notApplicable: [10, '1a79551c98be8a55'],
  }),
  'settings-system': Object.freeze({
    mismatch: [13, '153d48d206363a26'],
    notApplicable: [23, '93658b5f26c8caeb'],
  }),
  spinners: Object.freeze({
    mismatch: [29, '91bfbbe641b4664f'],
    notApplicable: [33, '2f00fa5302804302'],
  }),
  'strength-builder': Object.freeze({
    mismatch: [226, '28c24a4244192529'],
    notApplicable: [98, 'c10b7d88a606402e'],
  }),
  'tab-activity': Object.freeze({
    mismatch: [53, '54f0e457232e23d2'],
    notApplicable: [63, 'e6dd8ca1409490b5'],
  }),
  tips: Object.freeze({
    mismatch: [10, '4a80df6f080e4d6b'],
    notApplicable: [462, '2df42bb9abe312ed'],
  }),
  'undo-bar': Object.freeze({
    mismatch: [3, 'c6f0356cffa5528e'],
    notApplicable: [27, '35eb1b183e2143b5'],
  }),
  'water-add': Object.freeze({
    mismatch: [1, 'fc09bff7f42abe53'],
    notApplicable: [44, 'fb9e183ce9fbbf1a'],
  }),
});

const MISMATCH_REASON_CODE_SET = new Set(ALLOWED_MISMATCH_REASON_CODES);
const NA_KIND_SET = new Set(ALLOWED_NA_KINDS);
const DECISION_REF_PLACEHOLDER =
  /^(?:-|—|none|null|n\/a|na|tbd|todo|pending|unknown|нет|неизвестно)$/i;

function hasOwn(row, field) {
  return Object.prototype.hasOwnProperty.call(row || {}, field);
}

function markdownAnchor(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * decisionRef — не произвольная метка, а проверяемый адрес решения в repo:
 * `path/to/file.md:42` либо `path/to/file.md#heading-anchor`.
 */
export function resolveDecisionRef(value, root = ROOT) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || DECISION_REF_PLACEHOLDER.test(text) || path.isAbsolute(text)) {
    return { ok: false, kind: 'invalid-format' };
  }

  const lineMatch = text.match(/^(.+):(\d+)$/);
  const anchorAt = lineMatch ? -1 : text.lastIndexOf('#');
  const relative = lineMatch ? lineMatch[1] : anchorAt > 0 ? text.slice(0, anchorAt) : '';
  const anchor = anchorAt > 0 ? text.slice(anchorAt + 1) : '';
  if (!relative || (!lineMatch && !anchor) || relative.includes('\\')) {
    return { ok: false, kind: 'invalid-format' };
  }

  const file = path.resolve(root, relative);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!file.startsWith(rootPrefix) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { ok: false, kind: 'missing-target' };
  }

  const source = fs.readFileSync(file, 'utf8');
  if (lineMatch) {
    const line = Number(lineMatch[2]);
    const lines = source.split(/\r?\n/).length;
    return line >= 1 && line <= lines
      ? { ok: true, kind: 'line', file, line }
      : { ok: false, kind: 'missing-line', file, line };
  }

  let decodedAnchor;
  try {
    decodedAnchor = decodeURIComponent(anchor);
  } catch {
    return { ok: false, kind: 'invalid-anchor' };
  }
  const headingExists = source.split(/\r?\n/).some((line) => {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    return match && markdownAnchor(match[1]) === decodedAnchor;
  });
  const htmlAnchorExists = new RegExp(
    `(?:id|name)=["']${escapeRegExp(decodedAnchor)}["']`,
    'i',
  ).test(source);
  return headingExists || htmlAnchorExists
    ? { ok: true, kind: 'anchor', file, anchor: decodedAnchor }
    : { ok: false, kind: 'missing-anchor', file, anchor: decodedAnchor };
}

export function legacyVerdictKeysDigest(keys) {
  return crypto
    .createHash('sha256')
    .update([...keys].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Проверяет typed-v1 и возвращает одновременно ошибки и измеримый legacy-долг.
 * `baseline` параметризован для unit-тестов; production всегда использует
 * зафиксированный LEGACY_SCHEMA_BASELINE.
 */
export function inspectVerdictSchema(
  data,
  { zoneIds = null, baseline = LEGACY_SCHEMA_BASELINE } = {},
) {
  const problems = [];
  const legacyByZone = {};

  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;

    const closed = zone?.verdictSchema === VERDICT_SCHEMA_VERSION;
    if (hasOwn(zone, 'verdictSchema') && !closed) {
      problems.push({
        zoneId,
        key: null,
        kind: 'invalid-schema-version',
        value: zone?.verdictSchema,
      });
    }

    const legacyKeys = { mismatch: [], notApplicable: [] };
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      const verdict = row?.v;
      const hasReasonCode = hasOwn(row, 'reasonCode');
      const hasDecisionRef = hasOwn(row, 'decisionRef');
      const hasNaKind = hasOwn(row, 'naKind');

      if (verdict === '≠') {
        if (!hasReasonCode && !hasDecisionRef) {
          legacyKeys.mismatch.push(key);
        } else {
          if (!MISMATCH_REASON_CODE_SET.has(row?.reasonCode)) {
            problems.push({ zoneId, key, kind: 'invalid-reason-code', value: row?.reasonCode });
          }
          const decision = resolveDecisionRef(row?.decisionRef);
          if (!decision.ok) {
            problems.push({
              zoneId,
              key,
              kind: 'invalid-decision-ref',
              value: row?.decisionRef,
              resolution: decision.kind,
            });
          }
        }
        if (hasNaKind) {
          problems.push({ zoneId, key, kind: 'unexpected-na-kind', value: row?.naKind });
        }
        continue;
      }

      if (verdict === '—') {
        if (!hasNaKind) {
          legacyKeys.notApplicable.push(key);
        } else if (!NA_KIND_SET.has(row?.naKind)) {
          problems.push({ zoneId, key, kind: 'invalid-na-kind', value: row?.naKind });
        }
        if (hasReasonCode || hasDecisionRef) {
          problems.push({ zoneId, key, kind: 'unexpected-mismatch-decision' });
        }
        continue;
      }

      if (hasReasonCode || hasDecisionRef || hasNaKind) {
        problems.push({ zoneId, key, kind: 'unexpected-schema-fields', verdict });
      }
    }

    const legacy = {
      mismatch: legacyKeys.mismatch.length,
      notApplicable: legacyKeys.notApplicable.length,
    };
    legacyByZone[zoneId] = legacy;
    const empty = [0, legacyVerdictKeysDigest([])];
    const allowance = closed
      ? { mismatch: empty, notApplicable: empty }
      : baseline[zoneId] || {
          mismatch: empty,
          notApplicable: empty,
        };
    for (const field of ['mismatch', 'notApplicable']) {
      const [allowedCount = 0, allowedDigest = empty[1]] = allowance[field] || empty;
      const actualDigest = legacyVerdictKeysDigest(legacyKeys[field]);
      if (legacy[field] !== allowedCount || actualDigest !== allowedDigest) {
        problems.push({
          zoneId,
          key: null,
          kind:
            legacy[field] > allowedCount
              ? 'legacy-baseline-exceeded'
              : legacy[field] < allowedCount
                ? 'legacy-baseline-must-decrease'
                : 'legacy-baseline-keys-changed',
          category: field,
          actual: legacy[field],
          allowed: allowedCount,
          actualDigest,
          allowedDigest,
        });
      }
    }
  }

  return { problems, legacyByZone };
}

/** Имя файла зоны. Зона — идентификатор канваса, без путей и расширений. */
export function zonePath(zoneId) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(zoneId || ''))) {
    throw new Error(`Недопустимый id зоны: «${zoneId}»`);
  }
  return path.join(VERDICTS_DIR, `${zoneId}.json`);
}

export function listZoneIds() {
  if (!fs.existsSync(VERDICTS_DIR)) return [];
  return fs
    .readdirSync(VERDICTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function readZone(zoneId) {
  const file = zonePath(zoneId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Все зоны разом — в той же форме, что отдавал прежний общий снимок
 * (`{ zones: { id: … } }`), чтобы читателям не пришлось менять код.
 */
export function readAllZones() {
  const zones = {};
  for (const id of listZoneIds()) {
    const zone = readZone(id);
    if (zone) zones[id] = zone;
  }
  return { zones };
}

export function writeZone(zoneId, zone) {
  fs.mkdirSync(VERDICTS_DIR, { recursive: true });
  fs.writeFileSync(zonePath(zoneId), `${JSON.stringify(zone, null, 2)}\n`, 'utf8');
}
