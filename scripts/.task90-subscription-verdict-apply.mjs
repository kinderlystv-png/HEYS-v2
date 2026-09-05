#!/usr/bin/env node
/**
 * Task 90 — apply contract/behavior verdict handoff to subscription zone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANDOFF = path.join(ROOT, 'scripts/.task90-subscription-verdict-handoff.json');
const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:82';

function buildOptions(row) {
  const options = {};
  if (row.verdict === '≠') {
    options['reason-code'] = row.reasonCode || 'canvas-conflict';
    options['decision-ref'] = row.decisionRef || DECISION_REF;
  }
  return options;
}

function main() {
  const handoff = JSON.parse(fs.readFileSync(HANDOFF, 'utf8'));
  const zone = readZone('subscription');
  if (!zone) throw new Error('subscription zone missing');

  const handoffKeys = new Set(handoff.rows.map((row) => row.contractKey));
  const foreignBefore = snapshotForeignRowStrings(zone.rows, handoffKeys);

  const counts = { applied: 0, byV: {} };
  for (const row of handoff.rows) {
    const key = row.contractKey;
    if (!zone.rows[key]) {
      console.warn(`skip missing key: ${key}`);
      continue;
    }
    setVerdictKey('subscription', key, {
      verdict: row.verdict,
      fact: row.fact,
      options: buildOptions(row),
    });
    counts.applied += 1;
    counts.byV[row.verdict] = (counts.byV[row.verdict] || 0) + 1;
  }

  // lane 6 — explicitly excluded from task 90
  setVerdictKey('subscription', 'очередь · отмена заявки', {
    verdict: '?',
    fact: 'apps/web/heys_paywall_v1.js:946: lane 6 deferred — cancel confirm flow not re-verdicted in task 90',
  });

  const live = readZone('subscription');
  assertForeignRowsUnchanged(foreignBefore, live.rows);

  const final = { '=': 0, '≠': 0, '?': 0, '—': 0 };
  for (const row of Object.values(live.rows)) final[row.v] = (final[row.v] || 0) + 1;
  console.log(JSON.stringify({ applied: counts.applied, byV: counts.byV, final, sample: live.rows['слой — центральная модалка'] }, null, 2));
}

main();
