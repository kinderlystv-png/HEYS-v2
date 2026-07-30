#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { LEGACY_BUNDLES, LEGACY_FULL_REBUILD_TRIGGERS } from './legacy-bundle-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = /^(apps\/web\/(?:public\/|dist\/|bundle-manifest\.json$|index\.html$))/;
const HASHED_BUNDLE = /\b[\w-]+\.bundle\.[0-9a-f]{8,64}\.js\b/gi;

export function normalizeFiles(files) {
  return [...new Set(files.map((file) => String(file).trim().replace(/\\/g, '/')).filter(Boolean))].sort();
}

export function planDeployScope(files) {
  const normalized = normalizeFiles(files).filter((file) => !GENERATED.test(file));
  let fullRebuild = normalized.some((file) => LEGACY_FULL_REBUILD_TRIGGERS.has(file));
  const bundles = new Set();

  for (const file of normalized) {
    if (!file.startsWith('apps/web/')) continue;
    const relative = file.slice('apps/web/'.length);
    for (const [bundle, sources] of Object.entries(LEGACY_BUNDLES)) {
      if (sources.includes(relative)) bundles.add(bundle);
    }
  }

  const mutableFiles = normalized.filter((file) => /^apps\/web\/heys_.*\.js$/.test(file));
  const deployRelevant = normalized.filter((file) =>
    file.startsWith('apps/web/') &&
    !file.startsWith('apps/web/__tests__/') &&
    !/\.(?:md|test\.[cm]?[jt]s)$/.test(file)
  );
  const mapped = new Set(mutableFiles);
  for (const file of deployRelevant) {
    const relative = file.slice('apps/web/'.length);
    if (Object.values(LEGACY_BUNDLES).some((sources) => sources.includes(relative))) mapped.add(file);
  }
  const unsupportedFiles = deployRelevant.filter((file) => !mapped.has(file));
  if (unsupportedFiles.length > 0) fullRebuild = true;
  return {
    files: normalized,
    fullRebuild,
    bundles: fullRebuild ? Object.keys(LEGACY_BUNDLES).sort() : [...bundles].sort(),
    mutableFiles,
    unsupportedFiles,
  };
}

export function verifyDeployScope(plan, distDir) {
  const manifestPath = path.join(distDir, 'bundle-manifest.json');
  const lazyManifestPath = path.join(distDir, 'lazy-manifest.json');
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(lazyManifestPath) || !fs.existsSync(indexPath)) {
    throw new Error('dist must contain bundle-manifest.json, lazy-manifest.json and index.html');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lazyManifest = JSON.parse(fs.readFileSync(lazyManifestPath, 'utf8'));
  const index = fs.readFileSync(indexPath, 'utf8');
  const verifiedBundles = [];
  const requiredBundles = [...new Set(
    [index, JSON.stringify(manifest), JSON.stringify(lazyManifest)]
      .flatMap((source) => source.match(HASHED_BUNDLE) || []),
  )].sort();

  for (const file of requiredBundles) {
    if (!fs.existsSync(path.join(distDir, file))) throw new Error(`dist is missing referenced bundle ${file}`);
  }

  for (const bundle of plan.bundles) {
    const file = manifest[bundle]?.file || manifest[bundle];
    if (!file || !/\.bundle\.[0-9a-f]{8,64}\.js$/i.test(file)) {
      throw new Error(`manifest has no hashed file for ${bundle}`);
    }
    if (!fs.existsSync(path.join(distDir, file))) throw new Error(`dist is missing ${file}`);
    if (!fs.existsSync(path.join(distDir, `${file}.gz`))) throw new Error(`dist is missing upload artifact ${file}.gz`);
    if (!index.includes(file)) throw new Error(`index.html does not reference ${file}`);
    verifiedBundles.push(file);
  }

  for (const source of plan.mutableFiles) {
    const file = path.basename(source);
    if (!fs.existsSync(path.join(distDir, file))) throw new Error(`dist is missing mutable source ${file}`);
  }
  return { ...plan, verifiedBundles, requiredBundles };
}

export function verifyBundleAvailability({ requiredBundles, verifiedBundles, buckets, hasRemoteBundle }) {
  const uploadSet = new Set(verifiedBundles);
  const missing = [];

  for (const bucket of buckets) {
    for (const file of requiredBundles) {
      if (!uploadSet.has(file) && !hasRemoteBundle(bucket, file)) missing.push(`${bucket}/${file}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`remote buckets are missing referenced bundles: ${missing.join(', ')}`);
  }
  return { checkedBuckets: buckets, requiredBundles };
}

function readStatusFiles() {
  const output = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' });
  return normalizeFiles(output.split('\n').filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, '')));
}

export function createSourceSnapshot() {
  const hash = createHash('sha256');
  for (const file of readStatusFiles().filter((item) => !GENERATED.test(item))) {
    const absolute = path.join(ROOT, file);
    hash.update(`${file}\0`);
    hash.update(fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? fs.readFileSync(absolute) : '<deleted>');
    hash.update('\0');
  }
  return hash.digest('hex');
}

function parseArgs(argv) {
  const command = argv[2] || 'plan';
  const option = (name) => (argv.find((arg) => arg.startsWith(`--${name}=`)) || '').slice(name.length + 3);
  const rawFiles = option('files');
  return {
    command,
    files: rawFiles ? rawFiles.split(',') : readStatusFiles(),
    dist: path.resolve(ROOT, option('dist') || 'apps/web/dist'),
    buckets: normalizeFiles((option('buckets') || '').split(',')),
    endpoint: option('endpoint') || 'https://storage.yandexcloud.net',
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.command === 'snapshot') {
    process.stdout.write(`${createSourceSnapshot()}\n`);
    return;
  }
  const plan = planDeployScope(args.files);
  const verified = args.command === 'verify' || args.command === 'verify-remote'
    ? verifyDeployScope(plan, args.dist)
    : null;
  if (args.command === 'verify-remote') {
    if (args.buckets.length === 0) throw new Error('verify-remote requires --buckets=<bucket,...>');
    verifyBundleAvailability({
      requiredBundles: verified.requiredBundles,
      verifiedBundles: verified.verifiedBundles,
      buckets: args.buckets,
      hasRemoteBundle: (bucket, file) => {
        try {
          execFileSync('aws', [
            's3api', 'head-object', '--bucket', bucket, '--key', file,
            '--endpoint-url', args.endpoint,
          ], { stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      },
    });
  }
  const result = verified || plan;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
