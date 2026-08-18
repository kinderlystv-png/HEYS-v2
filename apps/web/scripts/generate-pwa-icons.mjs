/**
 * PWA icons from icon-v4.svg (handoff app-splash.v4).
 * Run: node apps/web/scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const source = path.join(publicDir, 'icon-v4.svg');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

if (!fs.existsSync(source)) {
  console.error('Missing', source);
  process.exit(1);
}

for (const { name, size } of sizes) {
  const out = path.join(publicDir, name);
  await sharp(source).resize(size, size).png().toFile(out);
  console.log(`wrote ${name} (${size})`);
}
