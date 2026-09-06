#!/usr/bin/env node
/**
 * Inventory verdict handoff JSON files under scripts/ — counts files, forms, key variants.
 *
 *   node scripts/ui-v4-handoff-inventory.mjs
 *   node scripts/ui-v4-handoff-inventory.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_KEY_ALIASES,
  FACT_ALIASES,
  VERDICT_ALIASES,
  ZONE_ALIASES,
  classifyHandoffForm,
  scanHandoffKeyVariants,
  validateHandoff,
  HandoffValidationError,
} from './lib/handoff-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

function listHandoffFiles() {
  return fs.readdirSync(SCRIPTS)
    .filter((name) => /handoff/i.test(name) && name.endsWith('.json'))
    .sort()
    .map((name) => path.join(SCRIPTS, name));
}

function emptyCounts() {
  return {
    contractKey: { contractKey: 0, key: 0, contractLine: 0, missing: 0 },
    verdict: { verdict: 0, recommend: 0, v: 0, missing: 0 },
    fact: { fact: 0, f: 0, fDraft: 0, missing: 0 },
    zone: { zoneId: 0, zone: 0, metaZone: 0, rowZone: 0, missing: 0 },
  };
}

function mergeCounts(target, source) {
  for (const group of Object.keys(target)) {
    for (const key of Object.keys(target[group])) {
      target[group][key] += source[group][key] || 0;
    }
  }
}

function main() {
  const jsonOut = process.argv.includes('--json');
  const files = listHandoffFiles();
  const forms = new Map();
  const totals = emptyCounts();
  let applyValid = 0;
  let applyInvalid = 0;
  const invalidSamples = [];

  for (const filePath of files) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const form = classifyHandoffForm(raw);
    forms.set(form.fingerprint, (forms.get(form.fingerprint) || 0) + 1);
    mergeCounts(totals, scanHandoffKeyVariants(raw));

    try {
      validateHandoff(raw, { filePath });
      applyValid += 1;
    } catch (err) {
      applyInvalid += 1;
      if (invalidSamples.length < 8 && err instanceof HandoffValidationError) {
        invalidSamples.push({ file: path.basename(filePath), error: err.message, path: err.path });
      }
    }
  }

  const report = {
    handoffFiles: files.length,
    uniqueForms: forms.size,
    applySchemaValid: applyValid,
    applySchemaInvalid: applyInvalid,
    keyVariants: totals.contractKey,
    verdictVariants: totals.verdict,
    factVariants: totals.fact,
    zoneVariants: totals.zone,
    forms: Object.fromEntries([...forms.entries()].sort((a, b) => b[1] - a[1])),
    invalidSamples,
    aliasFields: {
      contractKey: CONTRACT_KEY_ALIASES,
      verdict: VERDICT_ALIASES,
      fact: FACT_ALIASES,
      zone: ZONE_ALIASES,
    },
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`handoff JSON files in scripts/: ${report.handoffFiles}`);
  console.log(`unique structural forms: ${report.uniqueForms}`);
  console.log(`apply-schema valid: ${report.applySchemaValid} · invalid (audit/other shapes): ${report.applySchemaInvalid}`);
  console.log('');
  console.log('contract key field usage (row-level):');
  console.log(`  contractKey: ${totals.contractKey.contractKey} · key: ${totals.contractKey.key} · contractLine: ${totals.contractKey.contractLine} · missing: ${totals.contractKey.missing}`);
  console.log('verdict field usage:');
  console.log(`  verdict: ${totals.verdict.verdict} · recommend: ${totals.verdict.recommend} · v: ${totals.verdict.v} · missing: ${totals.verdict.missing}`);
  console.log('fact field usage:');
  console.log(`  fact: ${totals.fact.fact} · f: ${totals.fact.f} · fDraft: ${totals.fact.fDraft} · missing: ${totals.fact.missing}`);
  console.log('zone field usage:');
  console.log(`  zoneId: ${totals.zone.zoneId} · zone: ${totals.zone.zone} · meta.zone: ${totals.zone.metaZone} · per-row zone: ${totals.zone.rowZone} · missing top: ${totals.zone.missing}`);
  console.log('');
  console.log('top forms:');
  for (const [fp, count] of [...forms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${count}× ${fp}`);
  }
  if (invalidSamples.length) {
    console.log('');
    console.log('sample non-apply handoffs (expected until migration):');
    for (const s of invalidSamples) console.log(`  ${s.file}: ${s.error}`);
  }
  return 0;
}

process.exit(main());
