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

/** Task 78: намерение сверить, а не результат. Включаются в gate после ревью владельца. */
export const PENDING_UNKNOWN_MARKERS = [
  {
    id: 'needs-line-by-line-review',
    re: /нужн[аоы]\s+построчн/,
    corpus: 'strength-builder 141× «Нужна построчная visual/runtime-сверка…»',
  },
  {
    id: 'not-checked-line-by-line',
    re: /не\s+проверено\s+построчн/,
    corpus: 'strength-builder 58× «Не проверено построчно: прежнее основание…»',
  },
  {
    id: 'prior-basis-unverified-match',
    re: /прежн\w+\s+основан\w+\s+описывал\w*\s+непроверенн/,
    corpus: 'strength-builder 80× непроверенное совпадение кадра',
  },
  {
    id: 'basis-described-match',
    re: /основан\w+\s+описывал\w*\s+совпаден/,
    corpus: 'strength-builder 58× «описывало совпадение кадра»',
  },
  {
    id: 'needs-source-review',
    re: /нужн[аоы]\s+построчн\w*\s+сверк[аи]\s+по\s+source/,
    corpus: 'strength-builder 3× source/tests сверка',
  },
  {
    id: 'returned-pending-measurement',
    re: /возвращен\w*\s+в\s+вопрос\s+до\s+замер/,
    corpus: 'strength-builder 58× метка возврата в ?',
  },
  {
    id: 'pending-verification',
    re: /предстоит\s+провер/,
    corpus: 'task-78 intent list',
  },
  {
    id: 'awaiting-line-review',
    re: /ожидает\s+(?:построчн\w*\s+)?сверк/,
    corpus: 'task-78 intent list',
  },
  {
    id: 'without-line-review',
    re: /без\s+(?:построчн\w*\s+)?(?:visual\/runtime-)?сверк/,
    corpus: 'task-78 intent list',
  },
  {
    id: 'not-yet-reviewed',
    re: /(?:еще|ещё)\s+не\s+сверен/,
    corpus: 'task-78 intent list',
  },
  {
    id: 'not-yet-measured',
    re: /(?:еще|ещё)\s+не\s+замерен/,
    corpus: 'task-78 intent list',
  },
  {
    id: 'review-not-done',
    re: /сверк[аи]\s+(?:еще|ещё)\s+не/,
    corpus: 'task-78 intent list',
  },
];

/** Подтверждённый результат сверки — не путать с долгом проверки. */
const VERIFICATION_RESULT_EXCLUSIONS = [
  /сверено\s+гейтом/,
  /проверено\s+замером/,
  /совпадает\s+с/,
  /подтвержден\w*\s+замером/,
  /гейтом\s+сверен/,
  /сверено\s+(?:с\s+)?кадр/,
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

function activeUnknownMarkers(options = {}) {
  const markers = [...UNKNOWN_MARKERS];
  if (options.includePending) markers.push(...PENDING_UNKNOWN_MARKERS);
  return markers;
}

function isVerificationResultClaim(text) {
  return VERIFICATION_RESULT_EXCLUSIONS.some((re) => re.test(text));
}

export function classifyUnknownMismatchReason(reason, options = {}) {
  const text = normalizeReason(reason);
  if (isVerificationResultClaim(text)) return null;
  for (const marker of activeUnknownMarkers(options)) {
    if (marker.re.test(text)) return marker.id;
  }
  if (VISUAL_MISMATCH.test(text) && !CONCRETE_VISUAL_EVIDENCE.test(text)) {
    return 'unsubstantiated-visual-mismatch';
  }
  return null;
}

export function findUnknownEvidenceMismatches(data, zoneIds = null, options = {}) {
  const problems = [];
  const verdicts = options.allVerdicts ? null : new Set(['≠']);
  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (verdicts && !verdicts.has(row?.v)) continue;
      const kind = classifyUnknownMismatchReason(row?.f, options);
      if (kind) {
        problems.push({
          zoneId,
          key,
          verdict: row?.v,
          kind,
          reason: row?.f || '',
          pending: PENDING_UNKNOWN_MARKERS.some((marker) => marker.id === kind),
        });
      }
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

function runReportPending(selected) {
  const allVerdicts = process.argv.includes('--all-verdicts');
  const rows = findUnknownEvidenceMismatches(readAllZones(), selected, {
    includePending: true,
    allVerdicts,
  });
  const pendingOnly = rows.filter((row) => row.pending);
  const enforced = rows.filter((row) => !row.pending);

  console.log(
    `Отчёт pending-unknown-intent: ${pendingOnly.length} строк по новым паттернам` +
      (allVerdicts ? ' (все вердикты)' : ' (только «≠», что сломает gate после включения)') +
      `.`,
  );
  if (enforced.length) {
    console.log(`Уже действующие паттерны: ${enforced.length} (не pending).`);
  }

  const byKind = new Map();
  for (const row of pendingOnly) {
    byKind.set(row.kind, (byKind.get(row.kind) || 0) + 1);
  }
  if (byKind.size) {
    console.log('По паттернам:');
    for (const [kind, count] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
      const marker = PENDING_UNKNOWN_MARKERS.find((item) => item.id === kind);
      console.log(`  ${kind}: ${count}${marker?.corpus ? ` — ${marker.corpus}` : ''}`);
    }
  }

  console.log('\nzone | key | verdict | kind | fact');
  for (const row of pendingOnly) {
    const snippet = String(row.reason || '').replace(/\s+/g, ' ').slice(0, 160);
    console.log(`${row.zoneId} | ${row.key} | ${row.verdict} | ${row.kind} | ${snippet}`);
  }

  if (!pendingOnly.length) {
    console.log('(пусто — ни одна строка не попала под pending-паттерны в выбранном scope)');
  }
}

function runCli() {
  const selected = process.argv.includes('--zone')
    ? new Set([process.argv[process.argv.indexOf('--zone') + 1]])
    : null;

  if (process.argv.includes('--report-pending')) {
    runReportPending(selected);
    return;
  }

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
