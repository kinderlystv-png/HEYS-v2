#!/usr/bin/env node
/**
 * One-time / repeat E2E smoke environment setup (all machines).
 *
 *   node scripts/e2e/setup.mjs
 *   node scripts/e2e/setup.mjs --skip-db
 *   node scripts/e2e/setup.mjs --skip-browsers
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

import { E2E_REPO_ROOT, runPsqlFile, runPsqlQuery } from './psql-exec.mjs';
import { hydrateCuratorSecretsFromLockbox } from './load-lockbox-curator-secrets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const E2E_MIGRATIONS = [
  'scripts/db/migrations/2026-05-31_create_e2e_test_clients.sql',
  'scripts/db/migrations/2026-08-23_e2e_test_clients_login_v2.sql',
  'scripts/db/migrations/2026-08-23_e2e_test_clients_consents.sql',
  'scripts/db/migrations/2026-08-23_e2e_test_clients_day_seed.sql',
  // dev_cleanup_smoke_clients.sql — manual only (destructive DELETE); see migration header.
];

function log(step, msg) {
  console.log(`[e2e:setup] ${step}: ${msg}`);
}

function fail(msg) {
  console.error(`[e2e:setup] FAILED: ${msg}`);
  process.exitCode = 1;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function ensureEnvLocal() {
  const example = path.join(E2E_REPO_ROOT, '.env.local.example');
  const target = path.join(E2E_REPO_ROOT, '.env.local');
  if (!fs.existsSync(target)) {
    if (!fs.existsSync(example)) {
      fail('.env.local missing and no .env.local.example');
      return false;
    }
    fs.copyFileSync(example, target);
    log('env', 'created .env.local from .env.local.example — fill HEYS_TEST_CURATOR_*');
  }
  loadEnv({ path: target, override: false });
  const hydrated = hydrateCuratorSecretsFromLockbox();
  if (hydrated.ok && hydrated.source === 'lockbox') {
    log('env', 'curator creds loaded from Lockbox → .env.local');
    loadEnv({ path: target, override: true });
  } else if (!hydrated.ok && hydrated.detail) {
    log('env', `Lockbox curator creds: ${hydrated.detail}`);
  }
  return true;
}

function checkCuratorCreds() {
  const email = process.env.HEYS_TEST_CURATOR_EMAIL?.trim();
  const password = process.env.HEYS_TEST_CURATOR_PASSWORD?.trim();
  if (!email || !password) {
    log('env', 'WARN: HEYS_TEST_CURATOR_* unset — curator-login-smoke will skip (PIN smokes still run)');
    return true;
  }
  log('env', `curator email ok (${email.length} chars)`);
  return true;
}

function checkE2ePinDefaults() {
  const required = [
    'HEYS_TEST_PHONE_E2E_ALEX',
    'HEYS_TEST_PIN_E2E_ALEX',
    'HEYS_TEST_PHONE_E2E_POPL',
    'HEYS_TEST_PIN_E2E_POPL',
    'HEYS_TEST_E2E_CLIENT_ALEX_ID',
    'HEYS_TEST_E2E_CLIENT_POPL_ID',
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    fail(`Missing in .env.local: ${missing.join(', ')} (see .env.local.example)`);
    return false;
  }
  if (process.env.HEYS_TEST_PIN_E2E_ALEX === '0000' || process.env.HEYS_TEST_PIN_E2E_POPL === '1111') {
    fail('E2E PINs must be 1357/9753 after login_v2 patch — update .env.local from .env.local.example');
    return false;
  }
  log('env', 'E2E PIN/client ids present');
  return true;
}

function applyDbFixtures() {
  for (const rel of E2E_MIGRATIONS) {
    log('db', `apply ${rel}`);
    runPsqlFile(rel);
  }
  const rows = runPsqlQuery(
    "SELECT count(*) FROM public.clients WHERE id IN ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid) AND access_code_hash IS NOT NULL AND pin_hash IS NOT NULL;",
  ).trim();
  if (rows !== '2') {
    fail(`E2E clients not ready in DB (expected 2 with pin+access_code, got ${rows || '0'})`);
    return false;
  }
  log('db', 'E2E clients verified (pin + access_code)');
  return true;
}

function installPlaywrightBrowsers() {
  log('playwright', 'install chromium (if missing)');
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'install', 'chromium'],
    { cwd: E2E_REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    fail('playwright install chromium failed');
    return false;
  }
  return true;
}

async function verifyCuratorApi() {
  const api = process.env.HEYS_E2E_API_URL || 'http://localhost:4001';
  const email = process.env.HEYS_TEST_CURATOR_EMAIL?.trim();
  const password = process.env.HEYS_TEST_CURATOR_PASSWORD?.trim();
  if (!email || !password) {
    log('api', 'curator login probe skipped (HEYS_TEST_CURATOR_* unset — PIN smokes still run)');
    return true;
  }
  try {
    const res = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      log('api', 'curator login probe ok');
      return true;
    }
    if (res.status === 401) {
      fail(`curator login probe ${api}/auth/login → HTTP 401 (invalid HEYS_TEST_CURATOR_* in .env.local)`);
      return false;
    }
    if (res.status >= 500) {
      log('api', `curator login probe skipped (API HTTP ${res.status}) — start pnpm dev:local, then node scripts/e2e/verify.mjs`);
      return true;
    }
    fail(`curator login probe ${api}/auth/login → HTTP ${res.status} (is pnpm dev:local running on ${api}?)`);
    return false;
  } catch (e) {
    log('api', `curator login probe skipped (${e.message}) — start pnpm dev:local, then node scripts/e2e/verify.mjs`);
    return true;
  }
}

async function main() {
  log('start', E2E_REPO_ROOT);
  if (!ensureEnvLocal()) return;
  if (!checkCuratorCreds()) return;
  if (!checkE2ePinDefaults()) return;

  if (!hasFlag('--skip-db')) {
    try {
      if (!applyDbFixtures()) return;
    } catch (e) {
      fail(`DB setup: ${e.message}\n  Windows: pnpm db:setup:windows + yc auth\n  Then re-run: node scripts/e2e/setup.mjs`);
      return;
    }
  } else {
    log('db', 'skipped (--skip-db)');
  }

  if (!hasFlag('--skip-browsers')) {
    if (!installPlaywrightBrowsers()) return;
  } else {
    log('playwright', 'skipped (--skip-browsers)');
  }

  await verifyCuratorApi();

  if (!process.exitCode) {
    console.log('\n[e2e:setup] OK — next: pnpm dev:local (if not up) → pnpm test:e2e:smoke');
  }
}

main().catch((e) => {
  fail(e.message);
});
