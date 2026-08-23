#!/usr/bin/env node
/**
 * Preflight for agent E2E smokes — no secrets printed.
 *
 *   node scripts/e2e/verify.mjs
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { E2E_REPO_ROOT, runPsqlQuery } from './psql-exec.mjs';
import {
  ENV_LOCAL_FILE,
  formatSecretsActionBlock,
  hasCuratorSecrets,
} from './env-secrets.mjs';
import { hydrateCuratorSecretsFromLockbox } from './load-lockbox-curator-secrets.mjs';

loadEnv({ path: path.join(E2E_REPO_ROOT, '.env.local'), override: false });
hydrateCuratorSecretsFromLockbox();
loadEnv({ path: path.join(E2E_REPO_ROOT, '.env.local'), override: true });

const checks = [];

function ok(name, detail) {
  checks.push({ name, ok: true, detail });
}

function bad(name, detail) {
  checks.push({ name, ok: false, detail });
}

async function probe(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const curator = hasCuratorSecrets();
  curator
    ? ok('curator_creds', 'HEYS_TEST_CURATOR_* set')
    : bad('curator_creds', `fill HEYS_TEST_CURATOR_EMAIL/PASSWORD in ${ENV_LOCAL_FILE}`);

  const e2ePins =
    process.env.HEYS_TEST_PIN_E2E_ALEX === '1357' && process.env.HEYS_TEST_PIN_E2E_POPL === '9753';
  e2ePins ? ok('e2e_pins', '1357 / 9753') : bad('e2e_pins', 'expected 1357 and 9753 in .env.local');

  const web = process.env.HEYS_E2E_BASE_URL || 'http://localhost:3001';
  const api = process.env.HEYS_E2E_API_URL || 'http://localhost:4001';
  (await probe(web)) ? ok('web', web) : bad('web', `${web} not reachable — pnpm dev:local`);
  (await probe(api)) ? ok('api', api) : bad('api', `${api} not reachable — pnpm dev:local`);

  try {
    const count = runPsqlQuery(
      "SELECT count(*) FROM public.clients WHERE id IN ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid) AND access_code_hash IS NOT NULL;",
    ).trim();
    count === '2' ? ok('db_e2e_clients', '2 fixtures') : bad('db_e2e_clients', `count=${count || '0'} — node scripts/e2e/setup.mjs`);
  } catch (e) {
    bad('db_e2e_clients', e.message);
  }

  if (curator && (await probe(api))) {
    try {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.HEYS_TEST_CURATOR_EMAIL,
          password: process.env.HEYS_TEST_CURATOR_PASSWORD,
        }),
      });
      res.ok
        ? ok('curator_login', `HTTP ${res.status}`)
        : bad('curator_login', `HTTP ${res.status} — check ${ENV_LOCAL_FILE}`);
    } catch (e) {
      bad('curator_login', e.message);
    }
  }

  console.log('E2E verify:');
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  if (failed.some((c) => c.name === 'curator_creds' || c.name === 'curator_login')) {
    const reason = failed.find((c) => c.name.startsWith('curator'))?.detail;
    console.error(formatSecretsActionBlock(reason));
  }
  process.exit(failed.length ? 1 : 0);
}

main();
