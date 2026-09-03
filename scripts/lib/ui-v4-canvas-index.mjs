import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..');
export const CANVAS_PACK_DIR = path.join(
  ROOT,
  'docs',
  'ui',
  'handoff-v4',
  'canvas',
  'Переработка дизайна приложения',
  'design_handoff_heys_v4',
);
export const CANVAS_SUFFIX = '.v4.dc.html';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function duplicateIdentities(items, getIdentity = (item) => item.identity) {
  const occurrences = new Map();
  for (const item of items) {
    const identity = getIdentity(item);
    const list = occurrences.get(identity) || [];
    list.push(item);
    occurrences.set(identity, list);
  }
  return [...occurrences.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([identity, list]) => ({ identity, count: list.length }))
    .sort((a, b) => a.identity.localeCompare(b.identity, 'ru'));
}

function frameScope(element) {
  const scope = element.closest('[data-demo]');
  if (!scope) return { demo: 'none', product: true };

  const demo = normalizeText(scope.getAttribute('data-demo')).toLowerCase();
  if (demo === 'stop') return { demo, product: true };
  if (demo === 'protocol' || demo === 'loop') return { demo, product: false };
  return { demo: demo || 'empty', product: false };
}

const PALETTE_CLASS_IDS = Object.freeze([
  ['bldk', 'blue-dark'],
  ['bd', 'blue-dark'],
  ['bl', 'blue'],
  ['dk', 'sand-dark'],
  ['blue-dark', 'blue-dark'],
  ['blue', 'blue'],
  ['sand-dark', 'sand-dark'],
  ['sand', 'sand'],
]);

function framePalette(element) {
  let owner = element;
  while (owner) {
    if (owner.hasAttribute?.('data-palette')) {
      const value = owner.getAttribute('data-palette');
      if (normalizeText(value)) {
        return {
          id: value,
          inherited: owner !== element,
          source: 'data-palette',
        };
      }
    }
    for (const [className, paletteId] of PALETTE_CLASS_IDS) {
      if (owner.classList?.contains(className)) {
        return {
          id: paletteId,
          inherited: owner !== element,
          source: `class:${className}`,
        };
      }
    }
    owner = owner.parentElement;
  }
  return null;
}

function cssAttributeValue(value) {
  return JSON.stringify(String(value));
}

function frameLocatorSelector(sourceLabel, oid) {
  const labelSelector = `[data-screen-label=${cssAttributeValue(sourceLabel)}]`;
  return oid === null
    ? labelSelector
    : `${labelSelector}[data-oid=${cssAttributeValue(oid)}]`;
}

/**
 * Разрешает кадр канваса — по метке, а при наличии ещё и по data-oid.
 *
 * Требование обязательного `data-oid` снято 3 сентября: пакет дизайна приехал
 * без него во всех девяти канвасах, где он был, и привязка легла целиком — ни
 * один стенд не мог сняться. Ключ, который поставщик пакета вправе убрать
 * молча, не годится в единственные.
 *
 * Строгость при этом не потеряна, а перенесена на метку: кадр берётся только
 * когда метка в канвасе ровно одна. Дублирующиеся метки роняют привязку так же
 * fail-closed, как раньше ронял отсутствующий oid, — падать на неоднозначности
 * важнее, чем на отсутствии конкретного атрибута. Когда oid есть у обеих
 * сторон, он по-прежнему проверяется: разъехавшуюся пару он поймает раньше
 * метки.
 */
export function resolveCanvasFrame(canvas, { label, oid } = {}) {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) throw new Error('Canvas frame label is required.');

  const frames = Array.isArray(canvas?.frames) ? canvas.frames : [];
  const expectedOid = oid === undefined || oid === null || !normalizeText(oid)
    ? null
    : String(oid);

  if (expectedOid !== null) {
    const sameOid = frames.filter((frame) => frame.oid === expectedOid);
    if (sameOid.length > 1) {
      const match = sameOid.filter((frame) => frame.identity === normalizedLabel);
      if (match.length === 1) return match[0];
      if (match.length > 1) {
        throw new Error(
          `Canvas data-oid «${expectedOid}» and label «${normalizedLabel}» is ambiguous (${match.length} frames).`,
        );
      }
      const availableLabels = sameOid.map((frame) => frame.identity).join('», «');
      throw new Error(
        `Canvas data-oid «${expectedOid}» has no frame with label «${normalizedLabel}». Available: «${availableLabels}».`,
      );
    }
    if (sameOid.length === 1) {
      const frame = sameOid[0];
      if (frame.identity !== normalizedLabel) {
        throw new Error(
          `Canvas data-oid «${expectedOid}» belongs to «${frame.identity}», not «${normalizedLabel}».`,
        );
      }
      return frame;
    }
  }

  const sameLabel = frames.filter((frame) => frame.identity === normalizedLabel);
  if (!sameLabel.length) {
    throw new Error(`Canvas frame «${normalizedLabel}» was not found.`);
  }
  if (sameLabel.length > 1) {
    throw new Error(
      `Canvas frame «${normalizedLabel}» is ambiguous (${sameLabel.length} frames with this label).`,
    );
  }
  return sameLabel[0];
}

/**
 * Parses the primary canvas markup without executing its embedded DC script.
 * A frame inherits data-demo from the nearest ancestor (including itself).
 */
export function parseCanvasHtml(html, { file = '<inline>' } = {}) {
  const dom = new JSDOM(String(html));
  const { document } = dom.window;

  const malformedContractRows = [];
  const contractRows = [];
  for (const [index, row] of [...document.querySelectorAll('[data-contract] .spec')].entries()) {
    const keyNode = row.querySelector('b');
    const valueNode = row.querySelector('span[data-v]');
    if (!keyNode || !valueNode) {
      malformedContractRows.push({ index, hasKey: Boolean(keyNode), hasValue: Boolean(valueNode) });
      continue;
    }
    contractRows.push({
      identity: normalizeText(keyNode.textContent),
      value: valueNode.getAttribute('data-v') ?? '',
      index,
    });
  }

  const locatorMatches = new Map();
  const frames = [...document.querySelectorAll('[data-screen-label]')].map((element, index) => {
    const scope = frameScope(element);
    const sourceLabel = element.getAttribute('data-screen-label') ?? '';
    const identity = normalizeText(sourceLabel);
    const oid = element.hasAttribute('data-oid') ? element.getAttribute('data-oid') : null;
    const sourceDomId = element.hasAttribute('id') ? element.getAttribute('id') : null;
    const palette = framePalette(element);
    const selector = frameLocatorSelector(sourceLabel, oid);
    const matchOrdinal = locatorMatches.get(selector) || 0;
    locatorMatches.set(selector, matchOrdinal + 1);
    return {
      identity,
      demo: scope.demo,
      product: scope.product,
      index,
      label: identity,
      oid,
      sourceLabel,
      sourceOrdinal: index,
      sourceDomId,
      sourceIdentity: sourceDomId || (oid !== null ? `data-oid:${oid}` : `frame:${index}`),
      palette: palette?.id ?? null,
      paletteSource: palette?.source ?? null,
      paletteInherited: palette?.inherited ?? false,
      canonicalLocator: {
        selector,
        matchOrdinal,
        sourceOrdinal: index,
        key: `${file}::${selector}::${matchOrdinal}`,
      },
    };
  });

  dom.window.close();

  const productFrames = frames.filter((frame) => frame.product);
  const nonProductFrames = frames.filter((frame) => !frame.product);
  const unknownDemoFrames = frames.filter(
    (frame) => !['none', 'stop', 'protocol', 'loop'].includes(frame.demo),
  );

  return {
    file,
    contractRows,
    frames,
    productFrames,
    nonProductFrames,
    malformedContractRows,
    duplicateContractRows: duplicateIdentities(contractRows),
    duplicateProductFrames: duplicateIdentities(productFrames),
    unknownDemoFrames,
  };
}

export function listRootCanvasFiles(packDir = CANVAS_PACK_DIR) {
  return fs
    .readdirSync(packDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(CANVAS_SUFFIX))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

export function readCanvasPackage(packDir = CANVAS_PACK_DIR) {
  return listRootCanvasFiles(packDir).map((file) => {
    const parsed = parseCanvasHtml(fs.readFileSync(path.join(packDir, file), 'utf8'), { file });
    return {
      zoneId: file.slice(0, -CANVAS_SUFFIX.length),
      ...parsed,
    };
  });
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasEvidence(entry) {
  if (!isObject(entry)) return false;
  const { evidence } = entry;
  if (Array.isArray(evidence)) return evidence.some((item) => normalizeText(item));
  return Boolean(normalizeText(evidence));
}

/**
 * Compares exact identities only. It deliberately does not infer a frame from
 * a similarly named contract row: the current verdict schema cannot prove
 * frame coverage until it gains explicit `frames` entries with evidence.
 */
export function compareCanvasToVerdict(canvas, verdict) {
  const verdictRows = isObject(verdict?.rows) ? verdict.rows : {};
  const verdictFrames = isObject(verdict?.frames) ? verdict.frames : null;
  const currentRowIds = new Set(canvas.contractRows.map((row) => row.identity));
  const currentFrameIds = new Set(canvas.productFrames.map((frame) => frame.identity));

  const missingContractRows = canvas.contractRows
    .filter((row) => !Object.hasOwn(verdictRows, row.identity))
    .map((row) => row.identity);
  const extraVerdictRows = Object.keys(verdictRows).filter((identity) => !currentRowIds.has(identity));

  const missingFrames = canvas.productFrames
    .filter((frame) => !verdictFrames || !Object.hasOwn(verdictFrames, frame.identity))
    .map((frame) => frame.identity);
  const extraVerdictFrames = verdictFrames
    ? Object.keys(verdictFrames).filter((identity) => !currentFrameIds.has(identity))
    : [];
  const framesMissingEvidence = verdictFrames
    ? canvas.productFrames
        .filter(
          (frame) =>
            Object.hasOwn(verdictFrames, frame.identity) && !hasEvidence(verdictFrames[frame.identity]),
        )
        .map((frame) => frame.identity)
    : [];

  const frameSchemaPresent = Boolean(verdictFrames);
  const evidenceSchemaPresent = frameSchemaPresent && Object.values(verdictFrames).some(hasEvidence);
  const canvasMatches = Boolean(verdict) && verdict.canvas === canvas.file;

  return {
    zoneId: canvas.zoneId,
    canvas: canvas.file,
    verdictPresent: Boolean(verdict),
    canvasMatches,
    contract: {
      total: canvas.contractRows.length,
      covered: canvas.contractRows.length - missingContractRows.length,
      missing: missingContractRows,
      extra: extraVerdictRows,
      duplicates: canvas.duplicateContractRows,
      malformed: canvas.malformedContractRows,
    },
    frames: {
      total: canvas.productFrames.length,
      covered: canvas.productFrames.length - missingFrames.length,
      frameSchemaPresent,
      evidenceSchemaPresent,
      missing: missingFrames,
      missingEvidence: framesMissingEvidence,
      extra: extraVerdictFrames,
      duplicates: canvas.duplicateProductFrames,
      unknownDemo: canvas.unknownDemoFrames,
      scope: canvas.frames.reduce((counts, frame) => {
        counts[frame.demo] = (counts[frame.demo] || 0) + 1;
        return counts;
      }, {}),
    },
    scaffold: {
      frames: missingFrames.map((identity) => ({ identity, evidence: [] })),
    },
    ok:
      Boolean(verdict) &&
      canvasMatches &&
      missingContractRows.length === 0 &&
      extraVerdictRows.length === 0 &&
      canvas.duplicateContractRows.length === 0 &&
      canvas.malformedContractRows.length === 0 &&
      frameSchemaPresent &&
      missingFrames.length === 0 &&
      framesMissingEvidence.length === 0 &&
      extraVerdictFrames.length === 0 &&
      canvas.duplicateProductFrames.length === 0 &&
      canvas.unknownDemoFrames.length === 0,
  };
}

export function buildReverseCoverageReport(canvases, verdictsByZone) {
  const zones = canvases.map((canvas) => compareCanvasToVerdict(canvas, verdictsByZone[canvas.zoneId]));
  const knownZoneIds = new Set(canvases.map((canvas) => canvas.zoneId));
  const verdictsWithoutCanvas = Object.keys(verdictsByZone)
    .filter((zoneId) => !knownZoneIds.has(zoneId))
    .sort();

  const totals = zones.reduce(
    (sum, zone) => {
      sum.contractRows += zone.contract.total;
      sum.contractCovered += zone.contract.covered;
      sum.productFrames += zone.frames.total;
      sum.framesCovered += zone.frames.covered;
      sum.duplicateContractIdentities += zone.contract.duplicates.length;
      sum.duplicateFrameIdentities += zone.frames.duplicates.length;
      for (const [demo, count] of Object.entries(zone.frames.scope)) {
        sum.frameScope[demo] = (sum.frameScope[demo] || 0) + count;
      }
      return sum;
    },
    {
      canvases: zones.length,
      contractRows: 0,
      contractCovered: 0,
      productFrames: 0,
      framesCovered: 0,
      duplicateContractIdentities: 0,
      duplicateFrameIdentities: 0,
      frameScope: {},
    },
  );

  return {
    ok: zones.every((zone) => zone.ok) && verdictsWithoutCanvas.length === 0,
    totals,
    verdictsWithoutCanvas,
    zones,
  };
}
