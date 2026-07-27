#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'docs/legal/legal-document-manifest.json';
const MIGRATION_PATH = 'database/2026-07-27_consent_proof_v2.sql';

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const digest = (relativePath) => crypto.createHash('sha256').update(read(relativePath)).digest('hex');

function fail(message) {
  throw new Error(message);
}

function extractPlainVersion(source, key) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`));
  if (!match) fail(`Cannot find ${key} version`);
  return match[1];
}

function extractLandingVersion(source, key) {
  const block = source.match(new RegExp(`${key}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  if (!block) fail(`Cannot find landing ${key} block`);
  return extractPlainVersion(block[1], 'version');
}

function parseRegistry(sql) {
  const entries = new Map();
  const rowPattern =
    /\('([^']+)',\s*'([^']+)',\s*'([0-9a-f]{64})',\s*'([^']+)',\s*'(active|candidate|retired)'/g;
  for (const match of sql.matchAll(rowPattern)) {
    entries.set(`${match[1]}:${match[2]}`, {
      type: match[1],
      version: match[2],
      sha256: match[3],
      path: match[4],
      status: match[5],
    });
  }
  return entries;
}

function assertEntry(registry, type, document, status = 'active') {
  const entry = registry.get(`${type}:${document.version}`);
  if (!entry) fail(`Registry is missing ${type}:${document.version}`);
  if (entry.status !== status) fail(`${type}:${document.version} status=${entry.status}, expected ${status}`);
  if (entry.sha256 !== document.sha256) {
    fail(`${type}:${document.version} registry hash ${entry.sha256} != manifest ${document.sha256}`);
  }
  const expectedPath = document.snapshotPath || document.canonicalPath;
  if (entry.path !== expectedPath) {
    fail(`${type}:${document.version} registry path ${entry.path} != ${expectedPath}`);
  }
}

function verifySourceContract() {
  const manifest = JSON.parse(read(MANIFEST_PATH));
  const migration = read(MIGRATION_PATH);
  const registry = parseRegistry(migration);

  for (const [type, document] of Object.entries(manifest.documents)) {
    if (digest(document.canonicalPath) !== document.sha256) {
      fail(`${type} canonical document hash does not match manifest`);
    }
    if (digest(document.snapshotPath) !== document.sha256) {
      fail(`${type} immutable snapshot hash does not match manifest`);
    }
  }

  for (const type of [
    'user_agreement',
    'personal_data',
    'health_data',
    'marketing',
    'payment_oferta',
    'push_notifications',
    'curator_access',
    'speech_transcription',
  ]) {
    assertEntry(registry, type, manifest.documents[type]);
  }

  const healthCandidate = manifest.candidates.health_data_2_0;
  assertEntry(registry, 'health_data', {
    version: healthCandidate.version,
    sha256: healthCandidate.sha256,
    snapshotPath: healthCandidate.canonicalPath,
  }, 'candidate');

  const webLegal = read('apps/web/heys_legal_versions_v1.js');
  const consentFallback = read('apps/web/heys_consents_v1.js');
  const landing = read('apps/landing/src/config/legal-versions.ts');
  const required = {
    user_agreement: manifest.documents.user_agreement.version,
    personal_data: manifest.documents.personal_data.version,
    health_data: manifest.documents.health_data.version,
  };
  const landingKeys = {
    user_agreement: 'userAgreement',
    personal_data: 'privacyPolicy',
    health_data: 'healthDataConsent',
  };

  for (const [type, version] of Object.entries(required)) {
    if (extractPlainVersion(webLegal, type) !== version) fail(`web legal ${type} is not ${version}`);
    if (extractPlainVersion(consentFallback, type) !== version) fail(`consent fallback ${type} is not ${version}`);
    if (extractLandingVersion(landing, landingKeys[type]) !== version) {
      fail(`landing ${type} is not ${version}`);
    }
  }

  for (const type of ['marketing', 'payment_oferta', 'speech_transcription']) {
    const version = manifest.documents[type].version;
    if (extractPlainVersion(webLegal, type) !== version) fail(`web legal ${type} is not ${version}`);
    if (extractPlainVersion(consentFallback, type) !== version) fail(`consent fallback ${type} is not ${version}`);
  }

  return required;
}

function verifyBundle(distPath, required) {
  const absoluteDist = path.resolve(ROOT, distPath);
  const bundleManifest = JSON.parse(fs.readFileSync(path.join(absoluteDist, 'bundle-manifest.json'), 'utf8'));
  const targets = [
    ['boot-core', 'versions'],
    ['postboot-1-game-lazy', 'CURRENT_VERSIONS'],
  ];

  for (const [bundleName, objectName] of targets) {
    const file = bundleManifest[bundleName]?.file;
    if (!file) fail(`Bundle manifest is missing ${bundleName}`);
    const source = fs.readFileSync(path.join(absoluteDist, file), 'utf8');
    const objectMatch = source.match(new RegExp(`${objectName}=\\{([^}]+)\\}`));
    if (!objectMatch) fail(`${file} does not contain ${objectName}`);
    for (const [type, version] of Object.entries(required)) {
      if (extractPlainVersion(objectMatch[1], type) !== version) {
        fail(`${file} contains stale ${type}; expected ${version}`);
      }
    }
  }
}

function main() {
  const distArg = process.argv.find((arg) => arg.startsWith('--dist='));
  const required = verifySourceContract();
  if (distArg) verifyBundle(distArg.slice('--dist='.length), required);
  console.log(`Legal release contract OK: ${Object.entries(required).map(([k, v]) => `${k}=${v}`).join(', ')}`);
}

try {
  main();
} catch (error) {
  console.error(`Legal release contract failed: ${error.message}`);
  process.exitCode = 1;
}
