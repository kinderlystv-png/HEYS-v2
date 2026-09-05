#!/usr/bin/env node
/**
 * Polosa 4 · task 87 remainder — close 7 package-A «?» rows only.
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const TARGET_KEYS = [
  [
    'Подписка · строка в настройках · 01',
    '=',
    'apps/web/styles/modules/000-base-and-gamification.css:10738: .hdr-settings-sheet__row без position — static по умолчанию',
  ],
  [
    'Подписка · строка в настройках · рисунок 01',
    '=',
    'apps/web/heys_app_shell_v1.js:4876: renderSettingsChevron svg 15×15 viewBox 0 0 24 24',
  ],
  [
    'Подписка · строка в настройках · рисунок 02',
    '=',
    'apps/web/heys_app_shell_v1.js:5405: settings sheet close path M18 6L6 18M6 6l12 12',
  ],
  [
    'Подписка · строка в настройках · рисунок 03',
    '=',
    'apps/web/heys_app_shell_v1.js:4892: row chevron path M9 6l6 6-6 6',
  ],
  [
    'Подписка · экран · пробный период · 01',
    '=',
    'apps/web/heys_paywall_v1.js:565: .sub-screen без position — static по умолчанию',
  ],
  [
    'Подписка · экран · активна · 01',
    '=',
    'apps/web/heys_paywall_v1.js:565: .sub-screen без position — static по умолчанию',
  ],
  [
    'Подписка · экран · только чтение · 01',
    '=',
    'apps/web/heys_paywall_v1.js:565: .sub-screen без position — static по умолчанию',
  ],
];

function main() {
  const zone = readZone('subscription');
  if (!zone) throw new Error('subscription zone missing');

  const packageKeys = new Set(TARGET_KEYS.map(([key]) => key));
  const foreignBefore = snapshotForeignRowStrings(zone.rows, packageKeys);

  const results = [];
  for (const [key, verdict, fact] of TARGET_KEYS) {
    const out = setVerdictKey('subscription', key, { verdict, fact, options: {} });
    results.push({ key, ...out });
  }

  const live = readZone('subscription');
  assertForeignRowsUnchanged(foreignBefore, live.rows);

  const summary = { applied: 0, skipped: 0, final: {} };
  for (const row of results) {
    if (row.skipped) summary.skipped += 1;
    else summary.applied += 1;
  }
  for (const row of Object.values(live.rows)) {
    summary.final[row.v] = (summary.final[row.v] || 0) + 1;
  }
  const targetQ = TARGET_KEYS.filter(([key]) => live.rows[key]?.v === '?').map(([key]) => key);
  console.log(JSON.stringify({ summary, targetQ, results }, null, 2));
  if (targetQ.length) process.exitCode = 1;
}

main();
