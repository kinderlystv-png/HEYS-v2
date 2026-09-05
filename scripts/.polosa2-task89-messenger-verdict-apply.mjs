#!/usr/bin/env node
/**
 * Task 89 — update «вид · тред» verdict after padding fix.
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const KEY = 'вид · тред';
const FACT =
  '1000-messenger.css:409-415 .messenger-thread padding 6px 14px 0; gap 8px; пузырь 561-583 без изменений — messenger-thread-padding.test.js sand+blue';

function main() {
  const zone = readZone('messenger');
  const foreignBefore = snapshotForeignRowStrings(zone.rows, new Set([KEY]));
  setVerdictKey('messenger', KEY, { verdict: '=', fact: FACT, options: {} });
  const live = readZone('messenger');
  assertForeignRowsUnchanged(foreignBefore, live.rows);
  console.log(JSON.stringify({ key: KEY, v: live.rows[KEY].v, f: live.rows[KEY].f }, null, 2));
}

main();
