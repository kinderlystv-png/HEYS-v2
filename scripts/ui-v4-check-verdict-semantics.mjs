#!/usr/bin/env node
// Не даёт неизвестности маскироваться под принятое расхождение.
//
// `≠` означает установленный факт: код делает иначе и причина названа.
// Фразы «не подтверждено», «не проверено», «нужен review» и общий вывод
// «кадр не воспроизводится один-в-один» описывают отсутствие проверки. Для них
// существует отдельный вердикт `?`.

import { pathToFileURL } from 'node:url';

import {
  ALLOWED_MISMATCH_REASON_CODES,
  ALLOWED_NA_KINDS,
  inspectVerdictSchema,
  readAllZones,
} from './lib/ui-v4-verdicts.mjs';

const UNKNOWN_MARKERS = [
  { id: 'not-confirmed', re: /не подтвержден(?:а|о|ы)?/ },
  { id: 'not-checked', re: /не провер(?:ен(?:а|о|ы)?|ял(?:ся|ась|ось|ись)?)/ },
  { id: 'review-required', re: /требует\s+(?:визуального\s+)?(?:pixel[- ]?)?review/ },
  {
    id: 'match-not-claimed',
    re: /(?:совпадение|соответствие)\s+не заявля(?:ется|лось|лся|лась|лись)/,
  },
  {
    id: 'generic-frame-non-reproduction',
    re: /(?:кадр|canvas-кадр)[^.]{0,120}не воспроизводится[^.]{0,80}(?:один-в-один|pixel-perfect)/,
  },
  {
    id: 'generic-frame-non-reproduction-reversed',
    re: /не воспроизводится[^.]{0,80}(?:один-в-один|pixel-perfect)/,
  },
];

const VISUAL_MISMATCH =
  /точн(?:ая|ое|ый|ые)[^.]{0,100}(?:композици|типографи|геометри)[^.]{0,100}не совпада/;
const CONCRETE_VISUAL_EVIDENCE =
  /(?:\b\d+(?:[.,]\d+)?\s*px\b|[\w./-]+\.(?:css|js|jsx|ts|tsx|mjs|html):\d+|\.[a-z][\w-]*|--[a-z][\w-]*|\bdata-[a-z][\w-]*\b)/i;

function normalizeReason(reason) {
  return (
    String(reason || '')
      .normalize('NFKC')
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replace(/[–—−]/g, '-')
      // Пользовательская копия внутри кавычек не описывает уверенность автора verdict.
      .replace(/«[^»]*»|"[^"]*"/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function classifyUnknownMismatchReason(reason) {
  const text = normalizeReason(reason);
  for (const marker of UNKNOWN_MARKERS) {
    if (marker.re.test(text)) return marker.id;
  }
  if (VISUAL_MISMATCH.test(text) && !CONCRETE_VISUAL_EVIDENCE.test(text)) {
    return 'unsubstantiated-visual-mismatch';
  }
  return null;
}

export function findUnknownEvidenceMismatches(data, zoneIds = null) {
  const problems = [];
  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (row?.v !== '≠') continue;
      const kind = classifyUnknownMismatchReason(row?.f);
      if (kind) problems.push({ zoneId, key, kind, reason: row?.f || '' });
    }
  }
  return problems;
}

const REQUIRED_CODE_AS_NA =
  /(?:нет|отсутству(?:ет|ют)|не\s+реализован(?:а|о|ы)?)\s+(?:в\s+)?(?:коде|runtime|приложении)|(?:в\s+)?(?:коде|runtime|приложении)\s+(?:нет|отсутству(?:ет|ют)|не\s+реализован(?:а|о|ы)?)/i;

/** `—` не является способом закрыть отсутствующий обязательный product flow. */
export function findMissingCodeMarkedNotApplicable(data, zoneIds = null) {
  const problems = [];
  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (row?.v !== '—' || !row?.naKind || row.naKind === 'foreign-zone') continue;
      if (REQUIRED_CODE_AS_NA.test(normalizeReason(row?.f))) {
        problems.push({
          zoneId,
          key,
          kind: 'required-code-marked-not-applicable',
          reason: row?.f || '',
        });
      }
    }
  }
  return problems;
}

export function inspectVerdictSemantics(data, zoneIds = null, options = {}) {
  const schema = inspectVerdictSchema(data, { zoneIds, ...options });
  return {
    schemaProblems: schema.problems,
    legacyByZone: schema.legacyByZone,
    unknownMismatches: findUnknownEvidenceMismatches(data, zoneIds),
    missingCodeAsNotApplicable: findMissingCodeMarkedNotApplicable(data, zoneIds),
  };
}

function formatZoneDeviationSummary(zoneId, counts) {
  const totalMismatch = counts.mismatch + counts.typedMismatch;
  return `${zoneId}: «≠» ${totalMismatch} (legacy ${counts.mismatch} · typed-v1 ${counts.typedMismatch}) · «—» ${counts.notApplicable}`;
}

function runCli() {
  const selected = process.argv.includes('--zone')
    ? new Set([process.argv[process.argv.indexOf('--zone') + 1]])
    : null;
  const state = inspectVerdictSemantics(readAllZones(), selected);
  const problems = [
    ...state.schemaProblems,
    ...state.unknownMismatches,
    ...state.missingCodeAsNotApplicable,
  ];

  if (!problems.length) {
    const zones = Object.entries(state.legacyByZone)
      .filter(([zoneId]) => !selected || selected.has(zoneId))
      .map(([zoneId, counts]) => ({ zoneId, counts }))
      .filter(({ counts }) => counts.mismatch + counts.typedMismatch + counts.notApplicable > 0)
      .sort(
        (a, b) =>
          b.counts.mismatch +
          b.counts.typedMismatch +
          b.counts.notApplicable -
          (a.counts.mismatch + a.counts.typedMismatch + a.counts.notApplicable),
      );

    const legacyTotal = zones.reduce((sum, { counts }) => sum + counts.mismatch, 0);
    const typedTotal = zones.reduce((sum, { counts }) => sum + counts.typedMismatch, 0);
    const naTotal = zones.reduce((sum, { counts }) => sum + counts.notApplicable, 0);
    const mismatchTotal = legacyTotal + typedTotal;

    console.log('Семантика вердиктов чиста: typed-v1 валиден, неизвестность не записана как ≠.');
    console.log(
      `Подтверждённые отступления: «≠» ${mismatchTotal} (legacy ${legacyTotal} · typed-v1 ${typedTotal}) · «—» ${naTotal}.`,
    );

    if (zones.length) {
      const lines = zones.map(({ zoneId, counts }) => formatZoneDeviationSummary(zoneId, counts));
      if (selected && selected.size === 1) {
        for (const line of lines) console.log(line);
      } else {
        const top = lines.slice(0, 8).join(' · ');
        console.log(`По зонам: ${top}${lines.length > 8 ? ' …' : ''}`);
      }
    }
    return;
  }

  const byZone = new Map();
  for (const problem of problems) {
    const list = byZone.get(problem.zoneId) || [];
    list.push(problem);
    byZone.set(problem.zoneId, list);
  }

  console.error(`Семантика verdict typed-v1 нарушена: ${problems.length} проблем.`);
  for (const [zoneId, rows] of byZone) {
    console.error(`\n❌ ${zoneId}: ${rows.length}`);
    for (const row of rows.slice(0, 12)) {
      const at = row.key ? ` · ${row.key}` : '';
      const detail =
        row.reason ||
        row.value ||
        row.form ||
        (row.extraKeys?.length ? `keys: ${row.extraKeys.join(', ')}` : '') ||
        (row.kind === 'legacy-baseline-exceeded'
          ? `${row.category}: ${row.actual} > ${row.allowed}`
          : row.kind === 'legacy-baseline-must-decrease'
            ? `${row.category}: ${row.actual} < ${row.allowed}`
            : '');
      console.error(`  ${row.kind}${at}${detail ? ` · ${detail}` : ''}`);
    }
    if (rows.length > 12) console.error(`  … ещё ${rows.length - 12}`);
  }
  console.error(
    `\nДля ≠ обязательны reasonCode (${ALLOWED_MISMATCH_REASON_CODES.join(', ')}) и decisionRef.`,
  );
  console.error(
    `Для — обязателен naKind (${ALLOWED_NA_KINDS.join(', ')}); отсутствующий обязательный код остаётся ?.`,
  );
  process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
