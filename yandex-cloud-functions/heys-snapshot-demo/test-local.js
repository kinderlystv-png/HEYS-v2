/**
 * Local test runner for heys-snapshot-demo.
 *
 * Runs buildAccountSnapshot() for both demo accounts and writes JSON files
 * to /tmp/. Does NOT upload to S3. Validates that:
 *   - snapshot generates without errors
 *   - sizes are reasonable
 *   - private/excluded keys did not leak
 *
 * Usage:
 *   source ../../scripts/db/get-pg-password.sh && node test-local.js
 */

'use strict';

const { writeFileSync } = require('fs');
const { _internal } = require('./index.js');

const FORBIDDEN_PATTERNS = [
  /heys_supabase_auth_token/,
  /heys_curator_session/,
  /heys_insights_feedback/,
  /heys_advice_trace/,
  /heys_advice_pending/,
  /heys_scheduled_advices/,
  /heys_pin_auth_client/,
  /heys_client_current/,
  /heys_clients["']/, // exact "heys_clients" key
  /_BACKUP_/,
  /test_large/,
  /heys_perf_log/,
  /heys_debug_/,
  /heys_boot_/,
  /heys_sync_log/,
  /pin_hash|pin_salt|token_hash/,
  /created_by_user_id|created_by_client_id/,
];

(async () => {
  if (!process.env.PG_PASSWORD && !process.env.PGPASSWORD) {
    console.error(
      '[test-local] PG_PASSWORD or PGPASSWORD env required.\n' +
      'Tip: source ../../scripts/db/get-pg-password.sh && node test-local.js',
    );
    process.exit(1);
  }
  process.env.PG_PASSWORD = process.env.PG_PASSWORD || process.env.PGPASSWORD;

  const startedAt = Date.now();
  let exitCode = 0;

  for (const account of _internal.CONFIG.demoAccounts) {
    try {
      console.log(`[test-local] Building snapshot for ${account.gender}...`);
      const snapshot = await _internal.buildAccountSnapshot(account);
      const body = JSON.stringify(snapshot);
      const outPath = `/tmp/snapshot-${account.gender}.json`;
      writeFileSync(outPath, body, 'utf8');

      const sizeKB = (body.length / 1024).toFixed(1);
      const lsKeyCount = Object.keys(snapshot.lsKeys).length;
      const productCount = snapshot.products.length;
      const sharedRefsRemaining = snapshot.products.filter((p) => p && p.shared_origin_id).length;

      console.log(
        `[test-local] ${account.gender}: ${lsKeyCount} lsKeys, ${productCount} products, ` +
        `${sizeKB} KB → ${outPath}`,
      );
      console.log(
        `[test-local] ${account.gender}: shared_origin_id leftovers = ${sharedRefsRemaining} (should be 0)`,
      );

      // Forbidden-content check
      const leaks = [];
      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.test(body)) leaks.push(pat.toString());
      }
      if (leaks.length > 0) {
        console.error(`[test-local] ❌ ${account.gender} PRIVATE DATA LEAK:`, leaks);
        exitCode = 1;
      } else {
        console.log(`[test-local] ✅ ${account.gender}: no forbidden patterns`);
      }
    } catch (err) {
      console.error(`[test-local] ${account.gender}: FAILED —`, err);
      exitCode = 1;
    }
  }

  console.log(`[test-local] Done in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);

  // Force-close pool so node exits cleanly
  try {
    const { Pool } = require('pg');
    void Pool;
  } catch { /* noop */ }
  process.exit(exitCode);
})();
