#!/usr/bin/env node
/**
 * Read-only handoff: предлагает decisionRef из якорей в поле `f` вердикта.
 *
 * Не пишет docs/ui/verdicts/* — только scripts/.decision-ref-handoff.json.
 *
 *   node scripts/ui-v4-propose-decision-refs.mjs
 *   node scripts/ui-v4-propose-decision-refs.mjs --zone=strength-builder
 *   node scripts/ui-v4-propose-decision-refs.mjs --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANVAS_PACK_DIR } from './lib/ui-v4-canvas-index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERDICTS_DIR = path.join(ROOT, 'docs/ui/verdicts');
const OUTPUT = path.join(ROOT, 'scripts/.decision-ref-handoff.json');

const CANVAS_HANDOFF_PREFIX = path
  .join('docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4')
  .split(path.sep)
  .join('/');

const FILE_EXT = '(?:js|mjs|ts|tsx|css|html|sql|md)';
const RE_KANVAS = /(?:«|'|")?Канвас(?:»|'|")?\s*:+\s*(\d+)/i;
const RE_CONTRACT = /(?:«|'|")?Контракт(?:»|'|")?\s*:+\s*(\d+)/i;
const RE_CANVAS_FILE = /([a-z0-9-]+\.v4\.dc\.html)\s*:+\s*(\d+)/gi;
const RE_PATH_LINE = new RegExp(
  `([A-Za-z0-9_][A-Za-z0-9_./-]*\\.${FILE_EXT})\\s*:+\\s*(\\d+)`,
  'g',
);
const RE_PATH_ANCHOR = new RegExp(
  `([A-Za-z0-9_][A-Za-z0-9_./-]*\\.${FILE_EXT})#([A-Za-z0-9_\\p{L}\\p{N}-]+)`,
  'u',
);
const RE_BARE_CANVAS_LINE = /(?:^|[\s«"'])[:：]\s*(\d{3,5})\b/;

function parseArgs(argv) {
  const zoneArg = argv.find((a) => a.startsWith('--zone='));
  const zone = zoneArg ? zoneArg.slice('--zone='.length) : 'strength-builder';
  const all = argv.includes('--all');
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  return { zone, all };
}

function usage() {
  console.log(`Usage:
  node scripts/ui-v4-propose-decision-refs.mjs [--zone=<id>] [--all]

  --zone=<id>   Одна зона (default: strength-builder).
  --all         Все зоны, где есть decisionRef.`);
}

function canvasRepoPath(canvasFileName) {
  return `${CANVAS_HANDOFF_PREFIX}/${canvasFileName}`;
}

function normalizeRef(value) {
  return String(value ?? '')
    .trim()
    .split(path.sep)
    .join('/');
}

function zoneHasDecisionRef(data) {
  return Object.values(data?.rows || {}).some((row) => row && row.decisionRef);
}

function listZones({ zone, all }) {
  const files = fs.readdirSync(VERDICTS_DIR).filter((name) => name.endsWith('.json'));
  if (all) {
    return files
      .map((name) => name.replace(/\.json$/, ''))
      .filter((zoneId) => {
        const data = JSON.parse(fs.readFileSync(path.join(VERDICTS_DIR, `${zoneId}.json`), 'utf8'));
        return zoneHasDecisionRef(data);
      })
      .sort((a, b) => a.localeCompare(b, 'ru'));
  }
  const file = path.join(VERDICTS_DIR, `${zone}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Verdict zone not found: ${zone}`);
  }
  return [zone];
}

/**
 * Извлекает decisionRef-кандидата из доказательства `f`.
 * Приоритет: Канвас → Контракт → *.v4.dc.html → repo path:line → path#anchor.
 */
export function extractDecisionRefFromF(f, { zoneCanvasFile }) {
  const text = String(f ?? '');
  if (!text.trim()) return null;

  const canvasMatch = text.match(RE_KANVAS);
  if (canvasMatch) {
    const line = canvasMatch[1];
    return {
      ref: `${canvasRepoPath(zoneCanvasFile)}:${line}`,
      source: `f: Канвас :${line}`,
    };
  }

  const contractMatch = text.match(RE_CONTRACT);
  if (contractMatch) {
    const line = contractMatch[1];
    return {
      ref: `${canvasRepoPath(zoneCanvasFile)}:${line}`,
      source: `f: Контракт :${line}`,
    };
  }

  for (const match of text.matchAll(RE_CANVAS_FILE)) {
    const [, canvasFile, line] = match;
    return {
      ref: `${canvasRepoPath(canvasFile)}:${line}`,
      source: `f: ${canvasFile}:${line}`,
    };
  }

  const pathLines = [...text.matchAll(RE_PATH_LINE)].filter((match) => {
    const rel = match[1];
    if (!rel.includes('/')) return false;
    if (rel.endsWith('.v4.dc.html')) return false;
    return true;
  });
  if (pathLines.length === 1) {
    const [, rel, line] = pathLines[0];
    return {
      ref: `${normalizeRef(rel)}:${line}`,
      source: `f: ${rel}:${line}`,
    };
  }
  if (pathLines.length > 1) {
    const [, rel, line] = pathLines[0];
    return {
      ref: `${normalizeRef(rel)}:${line}`,
      source: `f: ${rel}:${line}`,
    };
  }

  const anchorMatch = text.match(RE_PATH_ANCHOR);
  if (anchorMatch) {
    const [, rel, anchor] = anchorMatch;
    return {
      ref: `${normalizeRef(rel)}#${anchor}`,
      source: `f: ${rel}#${anchor}`,
    };
  }

  const bareMatch = text.match(RE_BARE_CANVAS_LINE);
  if (bareMatch) {
    const line = bareMatch[1];
    return {
      ref: `${canvasRepoPath(zoneCanvasFile)}:${line}`,
      source: `f: :${line}`,
    };
  }

  return null;
}

function scanZone(zoneId) {
  const file = path.join(VERDICTS_DIR, `${zoneId}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const zoneCanvasFile = data.canvas || `${zoneId}.v4.dc.html`;
  const proposals = [];
  const noAnchorInF = [];
  let decisionRefRows = 0;

  for (const [key, row] of Object.entries(data.rows || {})) {
    if (!row || !row.decisionRef) continue;
    decisionRefRows += 1;

    const currentDecisionRef = normalizeRef(row.decisionRef);
    const extracted = extractDecisionRefFromF(row.f, { zoneCanvasFile });

    if (!extracted) {
      noAnchorInF.push({
        zone: zoneId,
        key,
        currentDecisionRef,
        f: row.f || '',
      });
      continue;
    }

    const proposedDecisionRef = normalizeRef(extracted.ref);
    if (proposedDecisionRef === currentDecisionRef) continue;

    proposals.push({
      zone: zoneId,
      key,
      currentDecisionRef,
      proposedDecisionRef,
      source: extracted.source,
    });
  }

  return { decisionRefRows, proposals, noAnchorInF };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const zones = listZones(args);
  const allProposals = [];
  const allNoAnchor = [];
  let totalDecisionRefRows = 0;

  for (const zoneId of zones) {
    const result = scanZone(zoneId);
    totalDecisionRefRows += result.decisionRefRows;
    allProposals.push(...result.proposals);
    allNoAnchor.push(...result.noAnchorInF);
  }

  allProposals.sort((a, b) => a.zone.localeCompare(b.zone, 'ru') || a.key.localeCompare(b.key, 'ru'));
  allNoAnchor.sort((a, b) => a.zone.localeCompare(b.zone, 'ru') || a.key.localeCompare(b.key, 'ru'));

  const payload = {
    meta: {
      generated: new Date().toISOString(),
      zone: args.all ? 'all' : args.zone,
      zones,
      decisionRefRows: totalDecisionRefRows,
      proposalCount: allProposals.length,
      noAnchorCount: allNoAnchor.length,
      canvasPackDir: path.relative(ROOT, CANVAS_PACK_DIR).split(path.sep).join('/'),
    },
    proposals: allProposals,
    noAnchorInF: allNoAnchor,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(
    `Wrote ${OUTPUT.split(path.sep).join('/')}\n` +
      `  zones: ${zones.length}\n` +
      `  decisionRef rows: ${totalDecisionRefRows}\n` +
      `  proposals: ${allProposals.length}\n` +
      `  noAnchorInF: ${allNoAnchor.length}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
