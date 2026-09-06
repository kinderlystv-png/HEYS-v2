#!/usr/bin/env node
/**
 * Zone-agnostic verdict handoff batch apply.
 *
 *   node scripts/ui-v4-verdict-batch-apply.mjs --zone=strength-builder --handoff=scripts/.sb-catalog-custom-exercise-handoff.json
 *   node scripts/ui-v4-verdict-batch-apply.mjs --zone=strength-builder --handoff=... --dry-run
 *
 * Validates handoff schema strictly (no silent skip for missing key/verdict/fact).
 * Reuses stale-handoff guard from scripts/lib/ui-v4-verdicts.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HandoffValidationError, validateHandoffFile } from './lib/handoff-schema.mjs';
import { countNormalizedRows, runBatchApply } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let zoneId = '';
  const handoffs = [];
  let dryRun = false;
  let withInline = false;
  let allowDowngrade = false;

  for (const arg of argv) {
    if (arg.startsWith('--zone=')) {
      zoneId = arg.slice('--zone='.length).trim();
      continue;
    }
    if (arg.startsWith('--handoff=')) {
      const rel = arg.slice('--handoff='.length);
      handoffs.push(path.isAbsolute(rel) ? rel : path.join(ROOT, rel));
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--with-inline') {
      withInline = true;
      continue;
    }
    if (arg === '--allow-downgrade') {
      allowDowngrade = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { zoneId, handoffs, dryRun, withInline, allowDowngrade };
}

function usage() {
  console.log(`Usage:
  node scripts/ui-v4-verdict-batch-apply.mjs --zone=<zoneId> --handoff=<path> [--handoff=...] [--dry-run] [--with-inline] [--allow-downgrade]

  --zone=...          Target docs/ui/verdicts/<zoneId>.json (required unless handoff has zoneId/zone).
  --handoff=...       Handoff JSON to apply (repeatable).
  --dry-run           Validate + queue without writing verdicts file.
  --with-inline       Reserved for zone-specific inline equals (strength-builder only).
  --allow-downgrade   Let neq-audit overwrite existing «=» with «≠».

Handoff must match scripts/handoff-schema.json; validator fails on missing contractKey/verdict/fact.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  if (!args.handoffs.length) {
    console.error('error: at least one --handoff= path is required');
    usage();
    return 1;
  }

  for (const filePath of args.handoffs) {
    if (!fs.existsSync(filePath)) {
      console.error(`error: handoff not found: ${filePath}`);
      return 1;
    }
  }

  let zoneId = args.zoneId;
  if (!zoneId) {
    try {
      zoneId = validateHandoffFile(args.handoffs[0]).zoneId;
    } catch (err) {
      if (err instanceof HandoffValidationError) {
        console.error(`error: ${err.message} (${err.path})`);
        return 1;
      }
      throw err;
    }
  }

  let inlineEquals;
  if (args.withInline && zoneId === 'strength-builder') {
    const { collectInlineEquals } = await import(
      pathToFileURL(path.join(ROOT, 'scripts/.sb-750-verdict-batch-apply.mjs')).href
    );
    if (typeof collectInlineEquals === 'function') {
      inlineEquals = collectInlineEquals();
    }
  }

  try {
    const {
      applied,
      skippedSame,
      skippedMissing,
      skippedNeqStale,
      skippedStale,
      counts,
      batchMap,
      perFileCounts,
      handoffRowCounts,
      loadedHandoffs,
      missingKeys,
    } = await runBatchApply({
      zoneId,
      files: args.handoffs,
      withInline: Boolean(inlineEquals?.length),
      inlineEquals,
      allowDowngrade: args.allowDowngrade,
      dryRun: args.dryRun,
      root: ROOT,
    });

    console.log(`zone: ${zoneId}${args.dryRun ? ' (dry-run)' : ''}`);
    console.log(`handoff files (${loadedHandoffs.length}):`);
    for (const name of loadedHandoffs) {
      const filePath = args.handoffs.find((p) => path.basename(p) === name);
      const expected = filePath ? countNormalizedRows(validateHandoffFile(filePath, { zoneId })) : handoffRowCounts[name];
      const queued = perFileCounts[name] || 0;
      console.log(`  ${name}: ${handoffRowCounts[name]} rows validated, ${queued} queued`);
      if (queued !== expected) {
        console.warn(`  warn: ${name} queued ${queued} rows (expected ${expected} after validation)`);
      }
    }
    console.log(`unique keys queued: ${batchMap.size}; applied ${applied}; skipped unchanged ${skippedSame}; skipped missing ${skippedMissing}; skipped stale neq ${skippedNeqStale}; skipped stale apply ${skippedStale || 0}`);
    if (missingKeys.length) {
      console.log(`missing keys (${missingKeys.length}):`);
      for (const key of missingKeys.slice(0, 20)) console.log(`  ${key}`);
      if (missingKeys.length > 20) console.log(`  … and ${missingKeys.length - 20} more`);
    }
    console.log(`totals: =${counts['=']} · ?=${counts['?']} · ≠=${counts['≠']} · —=${counts['—']} · всего ${Object.keys(counts).reduce((n, k) => n + counts[k], 0)} counted`);
    return missingKeys.length ? 2 : 0;
  } catch (err) {
    if (err instanceof HandoffValidationError) {
      console.error(`validation error: ${err.message} (${err.path})`);
      return 1;
    }
    console.error(err.message || err);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
