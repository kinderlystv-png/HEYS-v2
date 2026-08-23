#!/usr/bin/env node
/**
 * Один раз: положить E2E кураторские креды в heys-app-secrets Lockbox.
 *
 *   HEYS_TEST_CURATOR_EMAIL=... HEYS_TEST_CURATOR_PASSWORD=... node scripts/e2e/lockbox-add-curator-test-secret.mjs
 *   node scripts/e2e/lockbox-add-curator-test-secret.mjs --dry-run
 */

import { execFileSync } from 'node:child_process';

const LOCKBOX_ID =
  process.env.HEYS_E2E_LOCKBOX_ID || process.env.HEYS_APP_LOCKBOX_ID || 'e6qrvefs3vn66jiamfk4';

const KEYS = [
  { lockbox: 'heys_test_curator_email', env: 'HEYS_TEST_CURATOR_EMAIL' },
  { lockbox: 'heys_test_curator_password', env: 'HEYS_TEST_CURATOR_PASSWORD' },
];

function run(...args) {
  return execFileSync('yc', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const payload = {};
  for (const { lockbox, env } of KEYS) {
    const value = process.env[env]?.trim();
    if (!value) {
      console.error(`Set ${env} in environment before running this script.`);
      process.exit(1);
    }
    payload[lockbox] = value;
  }

  const raw = run('lockbox', 'payload', 'get', '--id', LOCKBOX_ID, '--format', 'json');
  const current = JSON.parse(raw);
  const entries = [...(current.entries || [])];
  let changed = false;
  for (const [key, value] of Object.entries(payload)) {
    const idx = entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      if (entries[idx].text_value === value) continue;
      entries[idx] = { ...entries[idx], text_value: value };
      changed = true;
    } else {
      entries.push({ key, text_value: value });
      changed = true;
    }
  }
  if (!changed) {
    console.log(`Lockbox ${LOCKBOX_ID}: E2E curator keys already present — skip.`);
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] would update lockbox ${LOCKBOX_ID} keys: ${Object.keys(payload).join(', ')}`);
    return;
  }
  const versionPayload = JSON.stringify({ entries });
  run('lockbox', 'secret', 'add-version', '--id', LOCKBOX_ID, '--payload', versionPayload);
  console.log(`Lockbox ${LOCKBOX_ID}: E2E curator keys updated.`);
}

main();
