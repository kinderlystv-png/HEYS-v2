#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { LEGACY_BUNDLES, LEGACY_FULL_REBUILD_TRIGGERS } from './legacy-bundle-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = /^(apps\/web\/(?:public\/|dist\/|bundle-manifest\.json$|index\.html$))/;

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
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) {
    throw new Error('dist must contain bundle-manifest.json and index.html');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const index = fs.readFileSync(indexPath, 'utf8');
  const verifiedBundles = [];

  for (const bundle of plan.bundles) {
    const file = manifest[bundle]?.file || manifest[bundle];
    if (!file || !/\.bundle\.[0-9a-f]{8,64}\.js$/i.test(file)) {
      throw new Error(`manifest has no hashed file for ${bundle}`);
    }
    if (!fs.existsSync(path.join(distDir, file))) throw new Error(`dist is missing ${file}`);
    if (!index.includes(file)) throw new Error(`index.html does not reference ${file}`);
    verifiedBundles.push(file);
  }

  for (const source of plan.mutableFiles) {
    const file = path.basename(source);
    if (!fs.existsSync(path.join(distDir, file))) throw new Error(`dist is missing mutable source ${file}`);
  }
  return { ...plan, verifiedBundles };
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
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.command === 'snapshot') {
    process.stdout.write(`${createSourceSnapshot()}\n`);
    return;
  }
  const plan = planDeployScope(args.files);
  const result = args.command === 'verify' ? verifyDeployScope(plan, args.dist) : plan;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
