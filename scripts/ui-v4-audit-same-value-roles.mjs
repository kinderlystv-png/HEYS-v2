#!/usr/bin/env node
/** Find --v4-* roles with identical value in all 4 palette blocks. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = path.join(ROOT, 'apps/web/styles/modules/002-ui-v4-palette-roles.css');
const src = fs.readFileSync(CSS, 'utf8');

const BLOCKS = [
  { id: 'sand', re: /\[data-theme-id="sand"\][\s\S]*?\n\}/ },
  { id: 'sand-dark', re: /\[data-theme-id="sand-dark"\][\s\S]*?\n\}/ },
  { id: 'blue', re: /\[data-theme-id="blue"\][\s\S]*?\n\}/ },
  { id: 'blue-dark', re: /\[data-theme-id="blue-dark"\][\s\S]*?\n\}/ },
];

function parseRoles(blockText) {
  const roles = new Map();
  for (const m of blockText.matchAll(/^\s*(--v4-[\w-]+|--scrim):\s*([^;]+);/gm)) {
    roles.set(m[1], m[2].trim());
  }
  return roles;
}

const byBlock = {};
for (const b of BLOCKS) {
  const match = src.match(b.re);
  if (!match) {
    console.error(`block not found: ${b.id}`);
    process.exit(1);
  }
  byBlock[b.id] = parseRoles(match[0]);
}

const sandKeys = [...byBlock.sand.keys()];
const sameAll = [];
const namingFlags = [];

for (const key of sandKeys) {
  const vals = BLOCKS.map((b) => byBlock[b.id].get(key));
  if (vals.every((v) => v === vals[0])) {
    sameAll.push({ key, value: vals[0] });
    if (/sand|blue/i.test(key) && !key.includes('sand-act-soft')) {
      namingFlags.push({ key, value: vals[0], note: 'name contains palette token but value identical in all sets' });
    }
  }
}

const sandNamed = sameAll.filter((r) => /sand/i.test(r.key));
const blueNamed = sameAll.filter((r) => /blue/i.test(r.key));

console.log(JSON.stringify({
  totalRolesInSand: sandKeys.length,
  sameValueAllFourSets: sameAll.length,
  sameRoles: sameAll,
  sandInNameSameEverywhere: sandNamed.length,
  blueInNameSameEverywhere: blueNamed.length,
  namingContradictions: namingFlags.filter((r) => /sand|blue/i.test(r.key)),
}, null, 2));
