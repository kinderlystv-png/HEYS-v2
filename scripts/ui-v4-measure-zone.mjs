#!/usr/bin/env node
// ui-v4-measure-zone.mjs — Task 77 MVP: contract row → live screen → JSON report.
//
// Pipeline:
//   parseContractAssertions → describeReads → openCase → READ_SCREEN_SOURCE
//   → matchRowAgainstScreen → evaluateDomEvidence → JSON report (proposals only)
//
// Does NOT write verdict files. Rows with strength < 2 are measured but excluded
// from verdict suggestions (proposal stays null).
//
// LIMITATION (honest):
//   Sand theme only (themeId: sand). canvasFrame.palette is required by the
//   visual-case validator but is NOT applied on the live screen — color checks
//   on one palette remain incomplete per project rules.
//
// Owner control (full zone — run locally, not in Cursor):
//   node scripts/ui-v4-measure-zone.mjs --zone=home-widgets --verdict== --json-out=scripts/.task77-hw-control.json
//   node scripts/ui-v4-measure-zone.mjs --zone=strength-builder --verdict== --json-out=scripts/.task77-sb-control.json
//   node scripts/.task77-summarize-control.mjs scripts/.task77-hw-control.json
//
// Smoke (agent may run):
//   node scripts/ui-v4-measure-zone.mjs --zone=home-widgets --verdict== --limit=3

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { readCanvasPackage } from './lib/ui-v4-canvas-index.mjs';
import { parseContractAssertions } from './lib/ui-v4-assertions.mjs';
import {
  describeReads,
  matchRowAgainstScreen,
  readScreenFromPage,
} from './lib/ui-v4-dom-measure.mjs';
import { evaluateDomEvidence } from './lib/ui-v4-dom-evidence.mjs';
import { readZone } from './lib/ui-v4-verdicts.mjs';
import {
  buildUiV4VisualSnapshot,
  UI_V4_VISUAL_CASES,
} from '../apps/web/scripts/ui-v4-visual-fixture.mjs';
import { ensureServer, openCase } from '../apps/web/scripts/ui-v4-visual-capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME_ID = 'sand';
const DOM_ELEMENT_LIMIT = 500;

export const MEASURE_LIMITATION =
  'Sand theme only (themeId: sand). canvasFrame.palette is not applied on the live screen; color verdicts on one palette are incomplete.';

function parseCli(argv) {
  const zoneId = argv.find((arg) => arg.startsWith('--zone='))?.slice('--zone='.length) || '';
  if (!zoneId) {
    throw new Error(
      'Usage: node scripts/ui-v4-measure-zone.mjs --zone=<zone-id> [--verdict==] [--limit=N] [--json-out=path] [--json]',
    );
  }
  const limitRaw = argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length);
  const rowLimit = limitRaw ? Number(limitRaw) : null;
  if (rowLimit != null && (!Number.isFinite(rowLimit) || rowLimit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  const jsonOut = argv.find((arg) => arg.startsWith('--json-out='))?.slice('--json-out='.length) || '';
  const verdictEqOnly = argv.includes('--verdict==') || argv.includes('--confirm-eq-only');
  const jsonStdout = argv.includes('--json') || Boolean(jsonOut);
  const unknown = argv.filter(
    (arg) =>
      !['--json', '--help', '--verdict==', '--confirm-eq-only'].includes(arg)
      && !arg.startsWith('--zone=')
      && !arg.startsWith('--limit=')
      && !arg.startsWith('--json-out='),
  );
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  return { zoneId, rowLimit, jsonOut, verdictEqOnly, jsonStdout };
}

function frameLabelFromIdentity(identity) {
  const match = String(identity).match(/^(.+) · (\d{2})$/);
  return match ? match[1] : null;
}

function buildVisualCaseMap(zoneId, themeId = THEME_ID) {
  return new Map(
    UI_V4_VISUAL_CASES
      .filter(
        (item) =>
          item.zone === zoneId
          && item.canvasFrame?.label
          && (item.themeId || THEME_ID) === themeId
          && item.status === 'automated',
      )
      .map((item) => [item.canvasFrame.label, item]),
  );
}

function summarizeMeasured(actual) {
  if (actual == null) return '';
  if (typeof actual === 'string' || typeof actual === 'number' || typeof actual === 'boolean') {
    return String(actual);
  }
  try {
    return JSON.stringify(actual);
  } catch {
    return String(actual);
  }
}

function formatMeasured(matchResult) {
  if (matchResult.status === 'matched') {
    const where = matchResult.where?.length ? matchResult.where.join(', ') : 'screen';
    return `${matchResult.hits} hit(s) @ ${where}`;
  }
  if (matchResult.best?.diffs?.length) {
    return matchResult.best.diffs
      .map((diff) => `${diff.property}: expected ${summarizeMeasured(diff.expected)}, got ${summarizeMeasured(diff.actual)}`)
      .join('; ');
  }
  return matchResult.reason || matchResult.best?.unknown?.[0]?.reason || 'inconclusive';
}

function buildRowReport({ parsed, matchResult, existingVerdict }) {
  const strength = matchResult.strength || 0;
  const excludedStrength1 = strength < 2;
  const proposal = excludedStrength1
    ? null
    : matchResult.status === 'matched'
      ? '='
      : matchResult.status === 'mismatched'
        ? '≠'
        : '?';

  return {
    строка: parsed.identity,
    ожидание: parsed.value,
    измеренное: formatMeasured(matchResult),
    status: matchResult.status,
    strength,
    proposal,
    excludedStrength1,
    existingVerdict: existingVerdict?.v ?? null,
    confirmsExistingEq: existingVerdict?.v === '=' && matchResult.status === 'matched',
    mismatchesExistingEq: existingVerdict?.v === '=' && matchResult.status === 'mismatched',
  };
}

export { buildRowReport, frameLabelFromIdentity, groupRowsForMeasurement, summarizeReportRows };

function groupRowsForMeasurement({ contractRows, verdictRows, caseByLabel, verdictEqOnly = false }) {
  const groups = new Map();
  const skipped = {
    unmappedNoVisualCase: 0,
    filteredNonEq: 0,
    unsupportedParse: 0,
  };

  for (const row of contractRows) {
    const existingVerdict = verdictRows[row.identity];
    if (verdictEqOnly && existingVerdict?.v !== '=') {
      skipped.filteredNonEq += 1;
      continue;
    }

    const parsed = parseContractAssertions(row);
    if (!parsed.assertions.length) {
      skipped.unsupportedParse += 1;
      continue;
    }

    const frameLabel = frameLabelFromIdentity(row.identity);
    const visualCase = frameLabel ? caseByLabel.get(frameLabel) : null;
    if (!visualCase) {
      skipped.unmappedNoVisualCase += 1;
      continue;
    }

    if (!groups.has(visualCase.id)) {
      groups.set(visualCase.id, { visualCase, rows: [] });
    }
    groups.get(visualCase.id).rows.push({ row, parsed, existingVerdict });
  }

  return { groups, skipped };
}

function summarizeReportRows(rows, skipped, zoneId, rowLimit) {
  const existingEqRows = rows.filter((entry) => entry.existingVerdict === '=');
  const strength1Excluded = rows.filter((entry) => entry.excludedStrength1).length;
  return {
    zone: zoneId,
    themeId: THEME_ID,
    limitation: MEASURE_LIMITATION,
    rowLimit,
    measuredRows: rows.length,
    proposals: rows.filter((entry) => entry.proposal).length,
    strength1Excluded,
    unmappedNoVisualCase: skipped.unmappedNoVisualCase,
    unsupportedParse: skipped.unsupportedParse,
    filteredNonEq: skipped.filteredNonEq,
    confirmsExistingEq: rows.filter((entry) => entry.confirmsExistingEq).length,
    mismatchesExistingEq: rows.filter((entry) => entry.mismatchesExistingEq).length,
    existingEqMeasured: existingEqRows.length,
    byStatus: rows.reduce((counts, entry) => {
      counts[entry.status] = (counts[entry.status] || 0) + 1;
      return counts;
    }, {}),
  };
}

function inconclusiveRowReport(entry, reason) {
  const strength = entry.parsed?.assertions?.length || 0;
  return buildRowReport({
    parsed: entry.parsed,
    matchResult: { status: 'inconclusive', reason, strength, hits: 0 },
    existingVerdict: entry.existingVerdict,
  });
}

async function measureVisualCase(browser, visualCase, entries) {
  const snapshot = buildUiV4VisualSnapshot(visualCase);
  const session = await openCase(browser, visualCase, snapshot, { measureOnly: true });
  if (!session?.page || !session?.context) {
    const reason = session?.error || 'openCase did not return a live page';
    return entries.map((entry) => inconclusiveRowReport(entry, reason));
  }
  try {
    const parsedList = entries.map((entry) => entry.parsed);
    const readPlan = {
      ...describeReads(parsedList),
      rootSelector: session.measureRootSelector,
      limit: DOM_ELEMENT_LIMIT,
    };
    const screen = await readScreenFromPage(session.page, readPlan);
    if (!screen || typeof screen !== 'object') {
      throw new Error(`readScreenFromPage returned invalid payload for ${visualCase.id}`);
    }
    const evaluate = ({ parsed, evidence }) => evaluateDomEvidence({ parsed, evidence });

    return entries.map((entry) => {
      const matchResult = matchRowAgainstScreen({
        parsed: entry.parsed,
        elements: screen.missing ? [] : screen.elements,
        evaluate,
      });
      return buildRowReport({
        parsed: entry.parsed,
        matchResult,
        existingVerdict: entry.existingVerdict,
      });
    });
  } finally {
    await session.context.close();
  }
}

export async function measureZone({
  zoneId,
  verdictEqOnly = false,
  rowLimit = null,
  browser,
}) {
  const canvas = readCanvasPackage().find((entry) => entry.zoneId === zoneId);
  if (!canvas) throw new Error(`Unknown zone "${zoneId}" — no canvas file.`);

  const verdict = readZone(zoneId);
  if (!verdict) throw new Error(`Verdict file missing for zone "${zoneId}".`);

  const caseByLabel = buildVisualCaseMap(zoneId);
  const { groups, skipped } = groupRowsForMeasurement({
    contractRows: canvas.contractRows,
    verdictRows: verdict.rows || {},
    caseByLabel,
    verdictEqOnly,
  });

  let activeBrowser = browser;
  let shouldCloseBrowser = false;
  if (!activeBrowser) {
    await ensureServer();
    activeBrowser = await chromium.launch({ headless: true });
    shouldCloseBrowser = true;
  }

  const rows = [];
  let budget = rowLimit;
  try {
    for (const { visualCase, rows: entries } of groups.values()) {
      if (budget != null && budget <= 0) break;
      const batch = budget != null ? entries.slice(0, budget) : entries;
      const measured = await measureVisualCase(activeBrowser, visualCase, batch);
      rows.push(...measured);
      if (budget != null) budget -= batch.length;
    }
  } finally {
    if (shouldCloseBrowser) await activeBrowser.close();
  }

  return {
    summary: summarizeReportRows(rows, skipped, zoneId, rowLimit),
    rows,
  };
}

function formatTextReport(report) {
  const s = report.summary;
  const lines = [
    `zone: ${s.zone}`,
    `theme: ${s.themeId}`,
    `measured: ${s.measuredRows}`,
    `proposals: ${s.proposals}`,
    `strength1 excluded: ${s.strength1Excluded}`,
    `unmapped (no visual case): ${s.unmappedNoVisualCase}`,
    `confirms existing =: ${s.confirmsExistingEq}/${s.existingEqMeasured}`,
    `mismatches on existing =: ${s.mismatchesExistingEq}`,
    s.rowLimit != null ? `row limit: ${s.rowLimit}` : '',
    '',
    MEASURE_LIMITATION,
    '',
    'rows:',
  ].filter(Boolean);

  for (const entry of report.rows) {
    lines.push(
      `${entry.строка} · ${entry.ожидание} · ${entry.измеренное} · ${entry.status}` +
        (entry.proposal ? ` · proposal ${entry.proposal}` : entry.excludedStrength1 ? ' · strength1-excluded' : ''),
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function runCli(argv = process.argv.slice(2), io = process) {
  if (argv.includes('--help')) {
    io.stdout.write(
      [
        'Usage: node scripts/ui-v4-measure-zone.mjs --zone=<zone-id> [options]',
        '',
        'Options:',
        '  --verdict==          only rows with existing verdict =',
        '  --limit=N            measure at most N rows (smoke)',
        '  --json-out=path      write JSON report to file',
        '  --json               print JSON to stdout',
        '',
        MEASURE_LIMITATION,
        '',
      ].join('\n'),
    );
    return;
  }

  const { zoneId, rowLimit, jsonOut, verdictEqOnly, jsonStdout } = parseCli(argv);
  const report = await measureZone({ zoneId, verdictEqOnly, rowLimit });
  const payload = `${JSON.stringify(report, null, 2)}\n`;

  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, jsonOut), payload, 'utf8');
  }
  if (jsonStdout) io.stdout.write(payload);
  else if (!jsonOut) io.stdout.write(formatTextReport(report));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
