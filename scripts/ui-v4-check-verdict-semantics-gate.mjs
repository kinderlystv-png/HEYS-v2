#!/usr/bin/env node
// Gate wrapper: ratcheted typed-v1 baseline (без правки lib) + scope/remainder.

import { pathToFileURL } from 'node:url';

import {
  ALLOWED_MISMATCH_REASON_CODES,
  ALLOWED_NA_KINDS,
  LEGACY_SCHEMA_BASELINE,
  readAllZones,
} from './lib/ui-v4-verdicts.mjs';
import { inspectVerdictSemantics } from './ui-v4-check-verdict-semantics.mjs';

// Здесь стоял TYPED_BASELINE_OVERRIDE — второй порог, заведённый 05.09, чтобы
// затянуть strength-builder «без правки lib». Он перебивал библиотечный, и
// источников правды у храповика стало два. Разошлись они в тот же день:
// lib держала 181, обёртка — 113, и на один и тот же снимок vitest-гейт и
// CLI-гейт отвечали разное. Порог, который можно переопределить рядом, — это
// не храповик: ослабление становится незаметным, потому что второй файл никто
// не читает при правке первого. Порог живёт в одном месте — в
// LEGACY_SCHEMA_BASELINE, и меняется только там.
function buildGateBaseline() {
  return LEGACY_SCHEMA_BASELINE;
}

function countScope(data, zoneIds = null) {
  let rowsTotal = 0;
  let schemaScope = 0;
  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;
    for (const row of Object.values(zone?.rows || {})) {
      rowsTotal += 1;
      if (row?.v === '≠' || row?.v === '—') schemaScope += 1;
    }
  }
  const zones = zoneIds ? zoneIds.size : Object.keys(data?.zones || {}).length;
  return {
    zones,
    rowsTotal,
    schemaScope,
    remainder: rowsTotal - schemaScope,
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
  const data = readAllZones();
  const scope = countScope(data, selected);
  const state = inspectVerdictSemantics(data, selected, { baseline: buildGateBaseline() });
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

    console.log(
      `Охват: ${scope.zones} зон, ${scope.schemaScope}/${scope.rowsTotal} строк «≠»/«—» в scope typed-v1; ` +
        `вне scope (не проверяется на форму): ${scope.remainder}.`,
    );
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
  console.error(
    `Охват: ${scope.zones} зон, ${scope.schemaScope}/${scope.rowsTotal} строк в scope; вне scope: ${scope.remainder}.`,
  );
  process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
