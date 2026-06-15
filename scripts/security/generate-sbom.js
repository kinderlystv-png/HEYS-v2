#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);
const packagePath = path.join(rootDir, 'package.json');
const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
const outputPath = path.join(rootDir, 'security-reports/sbom.cdx.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parsePackageKey(rawKey) {
  let key = rawKey.trim();
  if (!key.startsWith('/')) return null;

  key = key.slice(1);
  const peerSuffixIndex = key.indexOf('(');
  if (peerSuffixIndex !== -1) key = key.slice(0, peerSuffixIndex);

  const atIndex = key.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === key.length - 1) return null;

  return {
    name: key.slice(0, atIndex),
    version: key.slice(atIndex + 1).replace(/:$/, ''),
  };
}

function purlFor(component) {
  const name = component.name.startsWith('@')
    ? component.name.replace('@', '%40')
    : component.name;
  return `pkg:npm/${name}@${component.version}`;
}

function lockfileComponents(lockfile) {
  const components = new Map();
  const packageLine = /^ {2}(\/[^:]+):$/;

  for (const line of lockfile.split(/\r?\n/)) {
    const match = packageLine.exec(line);
    if (!match) continue;

    const parsed = parsePackageKey(match[1]);
    if (!parsed) continue;

    const key = `${parsed.name}@${parsed.version}`;
    components.set(key, {
      type: 'library',
      name: parsed.name,
      version: parsed.version,
      purl: purlFor(parsed),
      'bom-ref': `pkg:npm/${key}`,
    });
  }

  return [...components.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

function main() {
  const pkg = readJson(packagePath);
  const lockfile = fs.readFileSync(lockfilePath, 'utf8');
  const components = lockfileComponents(lockfile);

  if (components.length === 0) {
    throw new Error('No packages parsed from pnpm-lock.yaml');
  }

  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: 'HEYS',
          name: 'scripts/security/generate-sbom.js',
          version: '1.0.0',
        },
      ],
      component: {
        type: 'application',
        name: pkg.name,
        version: pkg.version,
        'bom-ref': `pkg:npm/${pkg.name}@${pkg.version}`,
      },
    },
    components,
  };

  bom.metadata.properties = [
    {
      name: 'heys:pnpm-lock-sha256',
      value: createHash('sha256').update(lockfile).digest('hex'),
    },
    {
      name: 'heys:component-count',
      value: String(components.length),
    },
  ];

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(bom, null, 2)}\n`);

  console.log(
    `CycloneDX SBOM written to ${path.relative(rootDir, outputPath)} (${components.length} components)`,
  );
}

main();
