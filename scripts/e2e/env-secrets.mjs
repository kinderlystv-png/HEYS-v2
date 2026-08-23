import fs from 'node:fs';
import path from 'node:path';

import { E2E_REPO_ROOT } from './psql-exec.mjs';

/** Absolute path — агент даёт человеку ссылку на этот файл. */
export const ENV_LOCAL_FILE = path.join(E2E_REPO_ROOT, '.env.local');
export const ENV_LOCAL_EXAMPLE = path.join(E2E_REPO_ROOT, '.env.local.example');

const CURATOR_KEYS = ['HEYS_TEST_CURATOR_EMAIL', 'HEYS_TEST_CURATOR_PASSWORD'];

export function missingCuratorSecretKeys() {
  return CURATOR_KEYS.filter((key) => !process.env[key]?.trim());
}

export function hasCuratorSecrets() {
  return missingCuratorSecretKeys().length === 0;
}

/**
 * Текст для stderr: агент копирует человеку путь к файлу и список ключей.
 */
export function formatSecretsActionBlock(reason) {
  const missing = missingCuratorSecretKeys();
  const keys = missing.length ? missing : CURATOR_KEYS;
  const exists = fs.existsSync(ENV_LOCAL_FILE);
  const lines = [
    '',
    '══════════════════════════════════════════════════════════════',
    'E2E: нужны локальные секреты (один раз на машину)',
    reason ? `Причина: ${reason}` : '',
    '',
    `Открой и заполни: ${ENV_LOCAL_FILE}`,
    exists ? '(файл уже есть — допиши пустые строки)' : `(скопируй из ${ENV_LOCAL_EXAMPLE}, если файла нет)`,
    '',
    'Ключи:',
    ...keys.map((k) => `  ${k}=`),
    '',
    'После сохранения снова: pnpm test:e2e:smoke',
    '══════════════════════════════════════════════════════════════',
    '',
  ];
  return lines.filter((line) => line !== undefined).join('\n');
}

export function printSecretsActionBlock(reason) {
  console.error(formatSecretsActionBlock(reason));
}
