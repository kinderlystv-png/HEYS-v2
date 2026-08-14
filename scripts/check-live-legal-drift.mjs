#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PSQL_WRAPPER = path.join(ROOT, 'scripts/db/psql.sh');
const MIGRATION_RUNNER = path.join(ROOT, 'scripts/db/migrate.mjs');

// Legal 1.11: only user_agreement + personal_data are active required consents.
// health_data 1.5 is retired; landing shows withdrawal banner, not an active registry row.
export const ACTIVE_CONSENT_TYPES = ['user_agreement', 'personal_data'];
/** @deprecated alias — health_data removed from active sync in legal 1.11 */
export const REQUIRED_CONSENT_TYPES = ACTIVE_CONSENT_TYPES;

export const DEFAULT_APP_BASE_URL = 'https://app.heyslab.ru';
export const DEFAULT_LANDING_BASE_URL = 'https://heyslab.ru';

const LANDING_PATHS = {
  user_agreement: '/legal/user-agreement/',
  personal_data: '/legal/personal-data-consent/',
  health_data: '/legal/health-data-consent/',
};

export const REGISTRY_SQL = `
  SELECT json_build_object(
    'type', consent_type,
    'version', document_version
  )::text
  FROM public.legal_consent_registry
  WHERE status = 'active'
    AND consent_type IN ('user_agreement', 'personal_data')
  ORDER BY consent_type, document_version;
`;

export const RETIRED_HEALTH_SQL = `
  SELECT document_version
  FROM public.legal_consent_registry
  WHERE consent_type = 'health_data' AND status = 'retired'
  ORDER BY effective_at DESC NULLS LAST, document_version DESC
  LIMIT 1;
`;

export const ACTIVE_HEALTH_SQL = `
  SELECT 1
  FROM public.legal_consent_registry
  WHERE consent_type = 'health_data' AND status = 'active'
  LIMIT 1;
`;

function fail(message) {
  throw new Error(message);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withCacheBust(baseUrl, pathname, nonce) {
  const url = new URL(pathname, `${String(baseUrl).replace(/\/$/, '')}/`);
  url.searchParams.set('legal_canary', String(nonce));
  return url;
}

async function fetchText(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(`${label} unavailable`);
  }
  if (!response?.ok) fail(`${label} returned HTTP ${response?.status || 'unknown'}`);
  return response.text();
}

export function parseBuildMeta(source) {
  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    fail('live build-meta.json is not valid JSON');
  }
  const hash = String(payload?.hash || '').trim();
  const version = String(payload?.version || '').trim();
  if (!/^[0-9a-f]{8,40}$/i.test(hash)) fail('live build-meta.json has an invalid hash');
  if (!version) fail('live build-meta.json has no version');
  return { hash, version };
}

export function extractBootCoreFile(indexHtml) {
  const match = String(indexHtml).match(/\b(boot-core\.bundle\.[0-9a-f]{8,64}\.js)\b/i);
  if (!match) fail('live index.html does not reference a hashed boot-core bundle');
  return match[1];
}

export function extractBundleVersions(bundleSource) {
  const objectMatch = String(bundleSource).match(/\bversions\s*=\s*\{([^}]+)\}/);
  if (!objectMatch) fail('live boot-core does not contain the legal versions contract');
  const versions = {};
  for (const type of ACTIVE_CONSENT_TYPES) {
    const match = objectMatch[1].match(new RegExp(`(?:^|,)\\s*${type}\\s*:\\s*["']([^"']+)["']`));
    if (!match) fail(`live boot-core is missing ${type}`);
    versions[type] = match[1];
  }
  return versions;
}

function assertRegistryVersions(rows) {
  const versions = {};
  for (const row of rows) {
    if (!ACTIVE_CONSENT_TYPES.includes(row?.type)) continue;
    if (versions[row.type]) fail(`registry has multiple active versions for ${row.type}`);
    versions[row.type] = String(row.version || '');
  }
  for (const type of ACTIVE_CONSENT_TYPES) {
    if (!versions[type]) fail(`registry has no active version for ${type}`);
  }
  return versions;
}

export function compareVersionSets(actualLabel, actual, expectedLabel, expected) {
  const drift = [];
  for (const type of ACTIVE_CONSENT_TYPES) {
    if (actual[type] !== expected[type]) {
      drift.push(`${type}: ${actualLabel}=${actual[type] || 'missing'}, ${expectedLabel}=${expected[type] || 'missing'}`);
    }
  }
  if (drift.length) fail(`legal version drift: ${drift.join('; ')}`);
}

function visibleText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assertLandingVersion(type, html, expectedVersion) {
  const text = visibleText(html).slice(0, 1_200);
  const pattern = new RegExp(`Версия\\s*:?\\s*${escapeRegex(expectedVersion)}(?:\\s|·|$)`, 'u');
  if (!pattern.test(text)) {
    fail(`landing ${type} does not expose registry version ${expectedVersion}`);
  }
}

export function assertHealthDataWithdrawal(html) {
  const text = visibleText(html);
  if (!/изъят из обязательного набора/i.test(text)) {
    fail('landing health_data does not expose 1.11 withdrawal banner');
  }
}

function runPsqlScalar(sql, errorLabel) {
  const result = spawnSync(PSQL_WRAPPER, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) fail(errorLabel);
  return String(result.stdout || '').trim();
}

function assertRetiredHealthRegistry() {
  const active = runPsqlScalar(ACTIVE_HEALTH_SQL, 'production health_data active-state check failed');
  if (active) fail('registry still has active health_data after legal 1.11');
  const retired = runPsqlScalar(RETIRED_HEALTH_SQL, 'production retired health_data check failed');
  if (!retired) fail('registry has no retired health_data snapshot after legal 1.11');
}

export function readProductionRegistry() {
  const result = spawnSync(PSQL_WRAPPER, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', REGISTRY_SQL], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) fail('production legal registry unavailable');
  const rows = String(result.stdout || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        fail('production legal registry returned an invalid response');
      }
    });
  const versions = assertRegistryVersions(rows);
  assertRetiredHealthRegistry();
  return versions;
}

export function checkProductionMigrations() {
  const result = spawnSync(process.execPath, [MIGRATION_RUNNER, '--status', '--require-current'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) fail('production migration ledger is unavailable or not current');
}

async function runSingleCheck({
  fetchImpl,
  registryProvider,
  migrationCheck,
  appBaseUrl,
  landingBaseUrl,
  nonce,
}) {
  await migrationCheck();
  const registryVersions = await registryProvider();

  const buildMetaSource = await fetchText(
    fetchImpl,
    withCacheBust(appBaseUrl, '/build-meta.json', nonce),
    'live build-meta.json',
  );
  const buildMeta = parseBuildMeta(buildMetaSource);
  const indexHtml = await fetchText(
    fetchImpl,
    withCacheBust(appBaseUrl, '/', nonce),
    'live app index.html',
  );
  const bootCoreFile = extractBootCoreFile(indexHtml);
  const bundleSource = await fetchText(
    fetchImpl,
    withCacheBust(appBaseUrl, `/${bootCoreFile}`, nonce),
    'live boot-core bundle',
  );
  const bundleVersions = extractBundleVersions(bundleSource);
  compareVersionSets('bundle', bundleVersions, 'registry', registryVersions);

  await Promise.all(
    ACTIVE_CONSENT_TYPES.map(async (type) => {
      const html = await fetchText(
        fetchImpl,
        withCacheBust(landingBaseUrl, LANDING_PATHS[type], nonce),
        `landing ${type}`,
      );
      assertLandingVersion(type, html, registryVersions[type]);
    }),
  );

  const healthHtml = await fetchText(
    fetchImpl,
    withCacheBust(landingBaseUrl, LANDING_PATHS.health_data, nonce),
    'landing health_data',
  );
  assertHealthDataWithdrawal(healthHtml);

  return {
    buildHash: buildMeta.hash,
    buildVersion: buildMeta.version,
    bootCoreFile,
    versions: registryVersions,
  };
}

export async function runLegalDriftCanary({
  fetchImpl = globalThis.fetch,
  registryProvider = readProductionRegistry,
  migrationCheck = checkProductionMigrations,
  appBaseUrl = DEFAULT_APP_BASE_URL,
  landingBaseUrl = DEFAULT_LANDING_BASE_URL,
  attempts = 1,
  retryDelayMs = 5_000,
  sleepImpl = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  nonce = Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('fetch is unavailable');
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runSingleCheck({
        fetchImpl,
        registryProvider,
        migrationCheck,
        appBaseUrl,
        landingBaseUrl,
        nonce: `${nonce}-${attempt}`,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleepImpl(retryDelayMs);
    }
  }
  throw lastError;
}

async function main() {
  const result = await runLegalDriftCanary({ attempts: 3 });
  console.log(
    `Legal drift canary OK: build=${result.buildHash}, boot=${result.bootCoreFile}, ${Object.entries(result.versions)
      .map(([type, version]) => `${type}=${version}`)
      .join(', ')}, health_data=retired`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Legal drift canary failed: ${error.message}`);
    process.exitCode = 1;
  });
}
