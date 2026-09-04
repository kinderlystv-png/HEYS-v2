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
// 3 сентября четыре зоны опущены после пересъёмки отпечатков под пакет от
// 15:18: nutrition-tab 34→31, product-card 67→58 и 76→74, tab-activity 63→62,
// tips 462→447. Это НЕ прогресс, и читать так нельзя: строки не типизировали —
// дизайнер их переписал, вердикт снялся в «?», и untyped-долг ушёл из счёта
// вместе со знанием. Не «у ≠ появился reasonCode», а «самого ≠ больше нет».
// Настоящий долг при этом вырос: 3279 строк без вердикта в двадцати зонах.
// Затянуть заморозку всё равно обязаны — храповик считает текущее состояние.
export const LEGACY_SCHEMA_BASELINE = Object.freeze({
  'app-splash': Object.freeze({
    mismatch: [4, 'b3d70a6cb7d03136'],
    notApplicable: [42, 'bd8795aa1e28be3e'],
  }),
  // 3 сентября (вечер): числа те же, отпечаток другой. Пакет перевёл четыре
  // значения развилки на роль --ac2, они перестали нумероваться отдельно, и в
  // трёх кадрах сдвинулись номера — тот же долг переехал на другие строки.
  // Это не послабление: 19 и 47 не изменились.
  'checkin-morning': Object.freeze({
    // 04.09: одна legacy «≠» типизирована reasonCode — долг 19 → 18.
    mismatch: [18, '479d797f9bb9c2e5'],
    typedMismatch: [1, '3959d964b3a77b88'],
    notApplicable: [47, '19522329f4fb6522'],
  }),
  'curator-cabinet': Object.freeze({
    mismatch: [30, '5ccedfacff5f9596'],
    typedMismatch: [5, '45c28c49d17e23d8'],
    notApplicable: [17, '227a240a10a24074'],
  }),
  'curator-edits': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [1, 'b677dfbd0d3317c7'],
    notApplicable: [29, 'f7ac9fda9e37b790'],
  }),
  cycle: Object.freeze({
    // 04.09: typed-v1 gate — 4 typed «≠»; legacy 32 → 21 после типизации и снятия строк.
    // 04.09 (вечер): bde48fd79 закрыл последний «?» — legacy mismatch 21 → 20.
    mismatch: [20, '0ac57e2a54fd9cd3'],
    typedMismatch: [4, '73d74685b79f4e13'],
    notApplicable: [23, '7558e003ad93df9c'],
  }),
  'date-remainders': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    notApplicable: [271, '8cd18417a00fbfe4'],
  }),
  'food-meal': Object.freeze({
    // 03.09: пакет снял четыре отступления разом — «четыре вкладки», квадрат
    // камеры в подвале, требование убрать «Повторить сегодня», а свайп из
    // строки состава убран кодом. ≠ 40 → 31, «—» 90 → 89.
    // 03.09 (вечер): строка «что отложено» получила naKind handoff — это учёт
    // пакета, а не продуктовое правило. Долг типизирован на единицу: «—» 89 → 88.
    // 04.09: typed-v1 gate — 22 typed «≠»; legacy 31 → 27.
    mismatch: [27, '7d10bf59c493a48d'],
    typedMismatch: [22, 'bb3172c7428f6ff2'],
    notApplicable: [88, '8dc4e24923666a96'],
  }),
  gamification: Object.freeze({
    // 03.09: пакет перерисовал четыре кадра церемонии и лист уровней — 60 строк
    // ушли в «?» на пересмотр, 21 строка исчезла из контракта вовсе. Долг упал
    // сам собой: ≠ 52 → 25, «—» 74 → 38. База опущена вслед за ним.
    // 04.09: 683eb9da7 закрыл 60 «?» — часть сведена в «=», часть в «—» без
    // naKind. Долг вырос относительно пониженной базы 03.09: ≠ 25 → 32,
    // «—» 38 → 54.
    mismatch: [31, 'b27b28754bea5e3d'],
    notApplicable: [54, '5864600e16443fce'],
  }),
  'home-widgets': Object.freeze({
    // 2 сентября: 128 -> 110. Восемнадцать строк «Разбор · … · 78» стояли
    // отступлением по чужому обоснованию (про круг 30x30 и зону нажатия), а
    // сами описывают подпись листа. Замер на живом дереве показал совпадение
    // по всем свойствам после починки Figtree — вердикт стал «=».
    // 3 сентября: notApplicable 1358 -> 1356. Строки «Смена вида · лист выбора»
    // 33 и 36 стояли «—» как адресация разметки кадра; после пересъёмки кадра
    // они называют числа превью 2×2 и карточки «До цели» и сведены с кодом.
    mismatch: [72, 'c72c87c0eb292e47'],
    typedMismatch: [10, 'b67076eb4cbac395'],
    notApplicable: [1356, 'b439428088a4c3d6'],
  }),
  login: Object.freeze({
    mismatch: [47, '68f95f4b8789dcbd'],
    notApplicable: [301, '624bf9693c19435e'],
  }),
  'norm-correction': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [11, '49cc8221f457dea2'],
    notApplicable: [37, '3f2cfeaa0a205b26'],
  }),
  'nutrition-tab': Object.freeze({
    // 04.09: 9e3fc6c3d типизировал 26 legacy «≠» (31 → 5). «—» выросло 168 → 211:
    // закрытие ?-долга ea801dfbb и новые нетипизированные «—» без naKind.
    mismatch: [5, '24d0bbb594da3e3d'],
    notApplicable: [211, 'c56b7bc960bb40c0'],
  }),
  'product-card': Object.freeze({
    // 04.09: e96ffbe90 закрыл 16 «?» rehash-долга — 12→=, 2→—, 2→≠; legacy 58→60, «—» 74→76.
    mismatch: [60, '7fe9821f7ed05778'],
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
    // 04.09: Phase1-2 re-review — 2 audit «?» закрыты в «=» (8467957d7, 116a79e09); legacy 67→65.
    mismatch: [65, '1db0a216d57de58e'],
    notApplicable: [28, '1a861974e2dfd0f8'],
  }),
  'reports-insights': Object.freeze({
    // 03.09 (вечер): две строки получили naKind handoff — «сведение зоны ·
    // вердикт» и «канон в чужом файле», обе про состояние разбора, а не про
    // продукт. Долг типизирован на две: «—» 136 → 134.
    mismatch: [127, '84410b3594ff4c7e'],
    typedMismatch: [17, '3aab0453f4ac87a7'],
    notApplicable: [134, '0fcd6b63be04a0c0'],
  }),
  'service-curator': Object.freeze({
    mismatch: [2, 'b360becf15443345'],
    notApplicable: [10, '1a79551c98be8a55'],
  }),
  'settings-system': Object.freeze({
    // 04.09: ad762ae20 — 4 stale «≠» → «?», 2 «≠» typed reasonCode.
    // Legacy untyped: 13 → 9 (11 total «≠», из них 2 typed-v1).
    mismatch: [9, '10cb5edc5e12a1df'],
    typedMismatch: [2, '7924aa83ddb13146'],
    notApplicable: [23, '93658b5f26c8caeb'],
  }),
  spinners: Object.freeze({
    mismatch: [29, '91bfbbe641b4664f'],
    notApplicable: [33, '2f00fa5302804302'],
  }),
  'strength-builder': Object.freeze({
    // 3 сентября: notApplicable 98 -> 97. Строка «отношение к канону называет
    // сам кадр» типизирована naKind: 'handoff' — она про разметку пакета и его
    // собственную проверку, а не про продукт; новая строка того же долга
    // канваса заведена сразу типизированной.
    // 04.09: Г1 CycleScreen — 34 строк «Программа · цикл · 01–33» + «вид · экран цикла»
    // legacy mismatch 170→0; typedMismatch 169→136 после закрытия цикла;
    // 136→214 после G2 kernel handoff batch (typed-v1 ≠ без смены ключей).
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [214, 'ccc9d5b3d3d96f91'],
    notApplicable: [107, '13d5a59f2d87bb7f'],
  }),
  'tab-activity': Object.freeze({
    mismatch: [51, '9beed0acfd026056'],
    typedMismatch: [1, '96ec01bd55e41071'],
    notApplicable: [62, 'b3191bb9fbbd6910'],
  }),
  tips: Object.freeze({
    mismatch: [6, 'a288c63f94557aa0'],
    notApplicable: [448, 'c20d6000d1712d11'],
  }),
  'undo-bar': Object.freeze({
    // 03.09: пакет привёл кадры к продукту — во всех трёх «Отмена · … · 09»
    // кнопка теперь «Вернуть», как в коде. Два ≠ сняты, база 3 → 1.
    mismatch: [1, 'e79b034f829f4aa3'],
    notApplicable: [27, '35eb1b183e2143b5'],
  }),
  'water-add': Object.freeze({
    // Долг ушёл в ноль 2 сентября: обе строки «раскладка плитки» и
    // «вид · плитка воды 1×1» переведены в typed-v1 с reasonCode
    // owner-decision — решение владельца вернуло раскладку кадра.
    mismatch: [0, 'e3b0c44298fc1c14'],
    notApplicable: [44, 'fb9e183ce9fbbf1a'],
  }),
});

const MISMATCH_REASON_CODE_SET = new Set(ALLOWED_MISMATCH_REASON_CODES);
const NA_KIND_SET = new Set(ALLOWED_NA_KINDS);
const LEGACY_MISMATCH_ROW_KEYS = Object.freeze(['v', 'f', 'h']);
const TYPED_MISMATCH_ROW_KEYS = Object.freeze([
  'v',
  'f',
  'h',
  'reasonCode',
  'decisionRef',
  'evidence',
]);
const TYPED_MISMATCH_ROW_KEY_SET = new Set(TYPED_MISMATCH_ROW_KEYS);
const DECISION_REF_PLACEHOLDER =
  /^(?:-|—|none|null|n\/a|na|tbd|todo|pending|unknown|нет|неизвестно)$/i;

function mismatchRowExtraKeys(row, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(row || {}).filter((key) => !allowed.has(key));
}

/**
 * Классифицирует строку с v === «≠» по форме записи.
 * Неизвестная форма не пропускается молча — возвращает kind для fail-closed.
 */
export function classifyMismatchVerdictRow(row) {
  const hasReasonCode = hasOwn(row, 'reasonCode');
  const hasDecisionRef = hasOwn(row, 'decisionRef');
  const hasNaKind = hasOwn(row, 'naKind');

  if (hasNaKind) {
    return { form: 'neq-with-naKind', extraKeys: hasNaKind ? ['naKind'] : [] };
  }

  if (hasReasonCode || hasDecisionRef) {
    const extraKeys = mismatchRowExtraKeys(row, TYPED_MISMATCH_ROW_KEYS);
    if (extraKeys.length) {
      return { form: 'typed-v1-extra-keys', extraKeys };
    }
    if (!hasReasonCode || !hasDecisionRef) {
      return {
        form: 'typed-v1-partial',
        missing: !hasReasonCode ? ['reasonCode'] : ['decisionRef'],
      };
    }
    if (hasOwn(row, 'evidence') && !Array.isArray(row.evidence)) {
      return { form: 'typed-v1-invalid-evidence', extraKeys: ['evidence'] };
    }
    return { form: 'typed-v1' };
  }

  const extraKeys = mismatchRowExtraKeys(row, LEGACY_MISMATCH_ROW_KEYS);
  if (extraKeys.length) {
    return { form: 'legacy-extra-keys', extraKeys };
  }
  if (!hasOwn(row, 'f')) {
    return { form: 'legacy-missing-f' };
  }
  return { form: 'legacy' };
}

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

    const legacyKeys = { mismatch: [], typedMismatch: [], notApplicable: [] };
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      const verdict = row?.v;
      const hasReasonCode = hasOwn(row, 'reasonCode');
      const hasDecisionRef = hasOwn(row, 'decisionRef');
      const hasNaKind = hasOwn(row, 'naKind');

      if (verdict === '≠') {
        const shape = classifyMismatchVerdictRow(row);
        if (shape.form === 'legacy' || shape.form === 'legacy-missing-f') {
          legacyKeys.mismatch.push(key);
        } else if (
          shape.form === 'typed-v1' ||
          shape.form === 'typed-v1-partial' ||
          hasReasonCode ||
          hasDecisionRef
        ) {
          if (shape.form === 'typed-v1-extra-keys' || shape.form === 'neq-with-naKind') {
            problems.push({
              zoneId,
              key,
              kind: 'unknown-mismatch-form',
              form: shape.form,
              extraKeys: shape.extraKeys,
              missing: shape.missing,
            });
            continue;
          }
          if (!hasReasonCode) {
            problems.push({ zoneId, key, kind: 'invalid-reason-code', value: row?.reasonCode });
          } else if (!MISMATCH_REASON_CODE_SET.has(row?.reasonCode)) {
            problems.push({ zoneId, key, kind: 'invalid-reason-code', value: row?.reasonCode });
          }
          if (!hasDecisionRef) {
            problems.push({
              zoneId,
              key,
              kind: 'invalid-decision-ref',
              value: row?.decisionRef,
              resolution: 'invalid-format',
            });
          } else {
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
          if (shape.form === 'typed-v1') {
            legacyKeys.typedMismatch.push(key);
          }
        } else {
          problems.push({
            zoneId,
            key,
            kind: 'unknown-mismatch-form',
            form: shape.form,
            extraKeys: shape.extraKeys,
            missing: shape.missing,
          });
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
      typedMismatch: legacyKeys.typedMismatch.length,
      notApplicable: legacyKeys.notApplicable.length,
    };
    legacyByZone[zoneId] = legacy;
    const empty = [0, legacyVerdictKeysDigest([])];
    const allowance = closed
      ? { mismatch: empty, typedMismatch: empty, notApplicable: empty }
      : {
          mismatch: empty,
          typedMismatch: empty,
          notApplicable: empty,
          ...(baseline[zoneId] || {}),
        };
    for (const field of ['mismatch', 'typedMismatch', 'notApplicable']) {
      if (closed && field === 'typedMismatch') continue;
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

const VALID_VERDICTS = new Set(['=', '≠', '?', '—']);

/** Mutate one row's verdict fields (does not read/write zone file). */
export function applyVerdictToRow(row, { verdict, fact, options = {} }, root = ROOT) {
  if (!VALID_VERDICTS.has(verdict)) throw new Error(`Вердикт «${verdict}» не из набора = ≠ ? —`);
  if (!fact) throw new Error('Факт обязателен: назовите доказательство или причину неизвестности.');

  const reasonCode = options['reason-code'];
  const decisionRef = options['decision-ref'];
  const naKind = options['na-kind'];

  if (verdict === '≠') {
    if (!MISMATCH_REASON_CODE_SET.has(reasonCode)) {
      throw new Error(`Для ≠ нужен --reason-code: ${ALLOWED_MISMATCH_REASON_CODES.join(', ')}`);
    }
    const decision = resolveDecisionRef(decisionRef, root);
    if (!decision.ok) {
      throw new Error(`Для ≠ нужен разрешимый --decision-ref (получено: ${decisionRef || 'пусто'})`);
    }
    if (naKind) throw new Error('--na-kind допустим только для —');
  } else if (verdict === '—') {
    if (!NA_KIND_SET.has(naKind)) {
      throw new Error(`Для — нужен --na-kind: ${ALLOWED_NA_KINDS.join(', ')}`);
    }
    if (reasonCode || decisionRef) throw new Error('--reason-code/--decision-ref допустимы только для ≠');
  } else if (reasonCode || decisionRef || naKind) {
    throw new Error('Typed-поля допустимы только для ≠ или —');
  }

  row.v = verdict;
  row.f = fact;
  delete row.reasonCode;
  delete row.decisionRef;
  delete row.naKind;
  if (verdict === '≠') {
    row.reasonCode = reasonCode;
    row.decisionRef = decisionRef;
  } else if (verdict === '—') {
    row.naKind = naKind;
  }
  return row;
}

export const STALE_HANDOFF_SKIP_MESSAGE = 'строка уже сведена позже, пропущена';

const SETTLED_VERDICTS = new Set(['=', '≠', '—']);

/**
 * Handoff apply guard: overwrite a live row only when it is still «?» or the handoff
 * snapshot `h` matches the live row (idempotent re-apply). Otherwise skip stale payload.
 *
 * @param {object|null|undefined} liveRow
 * @param {string} handoffVerdict verdict from handoff payload (`v` / recommend)
 * @param {{ allowDowngrade?: boolean, handoffH?: string|null, handoff?: boolean }} opts
 * @returns {{ skip: boolean, reason?: string, message?: string }}
 */
export function shouldSkipStaleHandoff(liveRow, handoffVerdict, {
  allowDowngrade = false,
  handoffH,
  handoff = handoffH != null,
} = {}) {
  if (allowDowngrade) return { skip: false };

  const liveV = liveRow?.v;
  if (liveV === '?') return { skip: false };

  const liveH = liveRow?.h;
  if (handoffH != null && handoffH === liveH) return { skip: false };

  if (handoff || handoffH != null) {
    if (SETTLED_VERDICTS.has(liveV)) {
      return {
        skip: true,
        reason: handoffH != null && handoffH !== liveH ? 'row-settled-later' : 'stale-handoff-settled',
        message: STALE_HANDOFF_SKIP_MESSAGE,
      };
    }
    return { skip: false };
  }

  // Legacy path (callers without handoff flag): neq-audit «≠» must not downgrade live «=».
  if (handoffVerdict === '≠' && liveV === '=') {
    return {
      skip: true,
      reason: 'stale-handoff-neq-over-eq',
      message: STALE_HANDOFF_SKIP_MESSAGE,
    };
  }
  return { skip: false };
}

/**
 * Etalon: fresh readZone → mutate one key → writeZone. Use for every batch verdict write.
 * Handoff re-runs: pass `{ handoff: true, handoffH }` — settled rows with a newer `h` are skipped.
 */
export function setVerdictKey(zoneId, key, patch, opts = {}) {
  const {
    root = ROOT,
    skipIf,
    dryRun = false,
    handoffH,
    handoff = handoffH != null,
    allowDowngrade = false,
  } = opts;
  const zone = readZone(zoneId);
  if (!zone) throw new Error(`Зоны «${zoneId}» нет.`);
  const row = zone.rows[key];
  if (!row) throw new Error(`Строки «${key}» в зоне «${zoneId}» нет.`);
  if (skipIf?.(row)) return { skipped: true, reason: 'skipIf', was: { v: row.v, f: row.f, h: row.h } };

  const guard = shouldSkipStaleHandoff(row, patch.verdict, { allowDowngrade, handoffH, handoff });
  if (guard.skip) {
    return {
      skipped: true,
      reason: guard.reason,
      message: guard.message,
      was: { v: row.v, f: row.f, h: row.h },
    };
  }

  const was = { v: row.v, f: row.f, h: row.h };
  applyVerdictToRow(row, patch, root);
  if (!dryRun) writeZone(zoneId, zone);
  return { skipped: false, was, now: { v: row.v, f: row.f, h: row.h } };
}

/**
 * Fresh read → mutate one row (any fields, e.g. rehash `h`) → write.
 */
export function patchZoneRow(zoneId, key, mutator, { dryRun = false } = {}) {
  const zone = readZone(zoneId);
  if (!zone?.rows?.[key]) throw new Error(`Строки «${key}» в зоне «${zoneId}» нет.`);
  const before = JSON.stringify(zone.rows[key]);
  mutator(zone.rows[key], zone);
  const changed = JSON.stringify(zone.rows[key]) !== before;
  if (changed && !dryRun) writeZone(zoneId, zone);
  return { changed, row: zone.rows[key] };
}

/** Delete one verdict row with fresh read before write (rehash «gone» keys). */
export function deleteZoneRow(zoneId, key, { dryRun = false } = {}) {
  const zone = readZone(zoneId);
  if (!zone?.rows?.[key]) return { deleted: false };
  delete zone.rows[key];
  if (!dryRun) writeZone(zoneId, zone);
  return { deleted: true };
}
