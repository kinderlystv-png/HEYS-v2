#!/usr/bin/env node
/**
 * Polosa 4 · task 87 step 2 — apply package A verdicts only (4 frames, ~63 rows).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACTS = path.join(ROOT, 'scripts/.polosa4-subscription-facts.json');
const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:82';

const PACKAGE_A_FRAMES = [
  'Подписка · строка в настройках',
  'Подписка · экран · пробный период',
  'Подписка · экран · активна',
  'Подписка · экран · только чтение',
];

function isPackageAKey(key) {
  return PACKAGE_A_FRAMES.some((frame) => key === frame || key.startsWith(`${frame} ·`));
}

function buildFact(row) {
  const ref = row.codeRef || 'subscription';
  const fact = row.productFact || row.recommend?.reason || '';
  return `${ref}: ${fact}`.replace(/\s+/g, ' ').trim();
}

function buildOptions(row) {
  const symbol = row.recommend?.symbol;
  const options = {};
  if (symbol === '—') {
    options['na-kind'] = /инструкция|мета/i.test(row.productFact || '')
      ? 'handoff'
      : 'foreign-zone';
  }
  if (symbol === '≠') {
    options['reason-code'] = /владельц|owner|РЕШЕНИЕ/i.test(row.contractText || '')
      ? 'owner-decision'
      : 'canvas-conflict';
    options['decision-ref'] = DECISION_REF;
  }
  return options;
}

function main() {
  const handoff = JSON.parse(fs.readFileSync(FACTS, 'utf8'));
  const zone = readZone('subscription');
  if (!zone) throw new Error('subscription zone missing');

  const packageKeys = new Set(handoff.rows.filter((row) => isPackageAKey(row.contractKey)).map((r) => r.contractKey));
  const foreignBefore = snapshotForeignRowStrings(zone.rows, packageKeys);

  const counts = { applied: 0, skipped: 0, byV: {} };
  for (const row of handoff.rows) {
    const key = row.contractKey;
    if (!isPackageAKey(key)) continue;
    if (!zone.rows[key]) {
      console.warn(`skip missing key: ${key}`);
      counts.skipped += 1;
      continue;
    }
    const verdict = row.recommend?.symbol || '?';
    const fact = buildFact(row);
    const options = buildOptions(row);
    setVerdictKey('subscription', key, { verdict, fact, options });
    counts.applied += 1;
    counts.byV[verdict] = (counts.byV[verdict] || 0) + 1;
  }

  const live = readZone('subscription');
  assertForeignRowsUnchanged(foreignBefore, live.rows);
  const final = { '=': 0, '≠': 0, '?': 0, '—': 0 };
  for (const row of Object.values(live.rows)) final[row.v] = (final[row.v] || 0) + 1;
  console.log(JSON.stringify({ packageA: counts, final }, null, 2));
}

main();
