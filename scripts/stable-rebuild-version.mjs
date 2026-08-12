#!/usr/bin/env node
/**
 * stable-rebuild-version.mjs — version.json для пересборок stable.heyslab.ru
 *
 * hash остаётся базой эталона (36df9ce3), а stableRebuild описывает патчи
 * и артефакты — иначе version.json врёт о том, что реально на копии.
 *
 * Usage:
 *   node scripts/stable-rebuild-version.mjs \
 *     --base-hash=36df9ce3 \
 *     --rebuild-id=consent-readonly-20260812 \
 *     --patches=d75ec593d,3d1904513,4a7ced768
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_PUBLIC = path.join(__dirname, '..', 'apps', 'web', 'public');
const WEB_DIST = path.join(__dirname, '..', 'apps', 'web', 'dist');

function parseArgs(argv) {
  const out = {
    baseHash: '36df9ce3',
    rebuildId: '',
    patches: [],
  };
  for (const arg of argv) {
    if (arg.startsWith('--base-hash=')) out.baseHash = arg.slice('--base-hash='.length);
    else if (arg.startsWith('--rebuild-id=')) out.rebuildId = arg.slice('--rebuild-id='.length);
    else if (arg.startsWith('--patches=')) {
      out.patches = arg.slice('--patches='.length).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!out.rebuildId) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.rebuildId = `stable-${y}${m}${day}`;
  }
  return out;
}

function readBootAppHash(indexHtml) {
  const m = indexHtml.match(/boot-app\.bundle\.([a-f0-9]+)\.js/);
  return m ? m[1] : null;
}

function main() {
  const { baseHash, rebuildId, patches } = parseArgs(process.argv.slice(2));
  const indexPath = fs.existsSync(path.join(WEB_DIST, 'index.html'))
    ? path.join(WEB_DIST, 'index.html')
    : path.join(__dirname, '..', 'apps', 'web', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const bootAppHash = readBootAppHash(indexHtml);
  const buildTime = new Date().toISOString();

  const versionLabel = `${baseHash.slice(0, 8)}+${rebuildId}`;
  const meta = {
    version: versionLabel,
    buildTime,
    hash: baseHash.slice(0, 8),
    stableRebuild: {
      id: rebuildId,
      baseHash: baseHash.slice(0, 8),
      patches,
      bootAppBundle: bootAppHash ? `boot-app.bundle.${bootAppHash}.js` : null,
    },
  };

  for (const dir of [WEB_PUBLIC, WEB_DIST]) {
    if (!fs.existsSync(dir)) continue;
    fs.writeFileSync(path.join(dir, 'version.json'), `${JSON.stringify(meta, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'build-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  }

  console.log(`✅ stable version: ${versionLabel}`);
  console.log(JSON.stringify(meta, null, 2));
}

main();
