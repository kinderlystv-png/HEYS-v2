/**
 * Подтягивает HEYS_TEST_CURATOR_* из Yandex Lockbox (heys-app-secrets), если в .env.local пусто.
 *
 * Ключи в Lockbox (добавить один раз): heys_test_curator_email, heys_test_curator_password
 *   node scripts/e2e/lockbox-add-curator-test-secret.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { ENV_LOCAL_EXAMPLE, ENV_LOCAL_FILE } from './env-secrets.mjs';

const LOCKBOX_ID =
  process.env.HEYS_E2E_LOCKBOX_ID || process.env.HEYS_APP_LOCKBOX_ID || 'e6qrvefs3vn66jiamfk4';

const LOCKBOX_KEYS = {
  HEYS_TEST_CURATOR_EMAIL: 'heys_test_curator_email',
  HEYS_TEST_CURATOR_PASSWORD: 'heys_test_curator_password',
};

function fetchLockboxMap() {
  try {
    const raw = execFileSync('yc', ['lockbox', 'payload', 'get', '--id', LOCKBOX_ID, '--format', 'json'], {
      encoding: 'utf8',
      timeout: 25_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const payload = JSON.parse(raw);
    const map = new Map();
    for (const entry of payload.entries || []) {
      if (entry?.key && entry?.text_value) map.set(entry.key, String(entry.text_value).trim());
    }
    return map;
  } catch {
    return null;
  }
}

function mergeIntoEnvLocal(updates) {
  if (!fs.existsSync(ENV_LOCAL_FILE) && fs.existsSync(ENV_LOCAL_EXAMPLE)) {
    fs.copyFileSync(ENV_LOCAL_EXAMPLE, ENV_LOCAL_FILE);
  }
  if (!fs.existsSync(ENV_LOCAL_FILE)) return;

  const lines = fs.readFileSync(ENV_LOCAL_FILE, 'utf8').split(/\r?\n/);
  const touched = new Set();
  const out = lines.map((line) => {
    for (const [envKey, value] of Object.entries(updates)) {
      if (line.startsWith(`${envKey}=`)) {
        touched.add(envKey);
        return `${envKey}=${value}`;
      }
    }
    return line;
  });
  for (const [envKey, value] of Object.entries(updates)) {
    if (!touched.has(envKey)) out.push(`${envKey}=${value}`);
  }
  fs.writeFileSync(ENV_LOCAL_FILE, `${out.join('\n').replace(/\n*$/, '')}\n`, 'utf8');
}

/**
 * @returns {{ ok: boolean, source: 'env'|'lockbox'|'missing', detail?: string }}
 */
export function hydrateCuratorSecretsFromLockbox() {
  if (process.env.HEYS_TEST_CURATOR_EMAIL?.trim() && process.env.HEYS_TEST_CURATOR_PASSWORD?.trim()) {
    return { ok: true, source: 'env' };
  }

  const map = fetchLockboxMap();
  if (!map) {
    return { ok: false, source: 'missing', detail: 'yc lockbox unavailable or IAM timeout' };
  }

  const email = map.get(LOCKBOX_KEYS.HEYS_TEST_CURATOR_EMAIL) || '';
  const password = map.get(LOCKBOX_KEYS.HEYS_TEST_CURATOR_PASSWORD) || '';
  if (!email || !password) {
    return {
      ok: false,
      source: 'missing',
      detail: `keys ${LOCKBOX_KEYS.HEYS_TEST_CURATOR_EMAIL} / ${LOCKBOX_KEYS.HEYS_TEST_CURATOR_PASSWORD} not in lockbox ${LOCKBOX_ID}`,
    };
  }

  process.env.HEYS_TEST_CURATOR_EMAIL = email;
  process.env.HEYS_TEST_CURATOR_PASSWORD = password;
  mergeIntoEnvLocal({
    HEYS_TEST_CURATOR_EMAIL: email,
    HEYS_TEST_CURATOR_PASSWORD: password,
  });
  return { ok: true, source: 'lockbox' };
}
