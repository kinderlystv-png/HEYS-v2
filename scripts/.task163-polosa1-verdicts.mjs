#!/usr/bin/env node
/**
 * Task 163 — bulk owner-decision «≠» for polosa1 slice (4 keys only).
 *
 * Discovery 5133b570: cheap isolated keys from app-splash + cycle.
 * Does NOT run task139 --apply on all 222 candidates.
 */
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { BULK_FACT, isBulkTargetRow } from './.polosa4-task139-bulk-owner-decision-apply.mjs';

const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/ОТВЕТ-47-находок.md:1';

/** Task 163 scope — hardcoded, not full polosa1. */
const TARGETS = [
  { zoneId: 'app-splash', key: 'Стык · загрузчик · рисунок 01' },
  { zoneId: 'app-splash', key: 'уменьшенное движение' },
  { zoneId: 'cycle', key: 'Цикл · график веса · текст' },
  { zoneId: 'cycle', key: 'Цикл · профиль, выключение · текст' },
];

const MATCH_FACT =
  'heys_user_tab_impl_v1.js:1384-1387 — диалог «Выключить особый период?» с текстом «…цель вернётся к базовой…» как в контракте';

function applyBulk(zoneId, key, dryRun) {
  return setVerdictKey(
    zoneId,
    key,
    {
      verdict: '≠',
      fact: BULK_FACT,
      options: {
        'reason-code': 'owner-decision',
        'decision-ref': DECISION_REF,
      },
    },
    { dryRun },
  );
}

function main() {
  const dryRun = !process.argv.includes('--apply');
  const results = [];

  const byZone = new Map();
  for (const { zoneId, key } of TARGETS) {
    if (!byZone.has(zoneId)) byZone.set(zoneId, []);
    byZone.get(zoneId).push(key);
  }

  for (const [zoneId, keys] of byZone.entries()) {
    const zone = readZone(zoneId);
    const keySet = new Set(keys);
    const foreignBefore = snapshotForeignRowStrings(zone.rows, keySet);

    for (const key of keys) {
      const row = zone.rows[key];
      if (!row) {
        results.push({ zoneId, key, action: 'error', reason: 'missing-row' });
        continue;
      }

      // Product matches canvas — keep «=», do not bulk-close as deviation.
      if (key === 'Цикл · профиль, выключение · текст' && row.v === '=') {
        const result = setVerdictKey(
          zoneId,
          key,
          { verdict: '=', fact: MATCH_FACT, options: {} },
          { dryRun },
        );
        results.push({
          zoneId,
          key,
          action: 'keep-match',
          was: result.was,
          now: result.now,
        });
        continue;
      }

      if (!isBulkTargetRow(row)) {
        results.push({
          zoneId,
          key,
          action: 'skip',
          reason:
            row.v === '≠' && row.reasonCode === 'owner-decision' && row.f === BULK_FACT
              ? 'already-bulk-closed'
              : 'not-bulk-target',
          was: { v: row.v, reasonCode: row.reasonCode, f: row.f },
        });
        continue;
      }

      const result = applyBulk(zoneId, key, dryRun);
      results.push({
        zoneId,
        key,
        action: 'bulk-close',
        was: result.was,
        now: result.now,
      });
    }

    if (!dryRun) {
      const live = readZone(zoneId);
      assertForeignRowsUnchanged(foreignBefore, live.rows);
    }
  }

  console.log(JSON.stringify({ dryRun, bulkFact: BULK_FACT, decisionRef: DECISION_REF, results }, null, 2));
}

main();
