/**
 * PWA icons from icon-v4.svg (крупная H на #fffaf1).
 * apple-touch-icon — icon-v4-apple.svg (180×180, без скругления в PNG).
 * maskable — тот же знак на полном грунте (Android ярлык + splash).
 * Run: node apps/web/scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const fontPath = path.join(publicDir, 'fonts/figtree/Figtree-Variable.ttf');

const jobs = [
  { source: 'icon-v4.svg', name: 'icon-192.png', size: 192, flatten: '#fffaf1' },
  { source: 'icon-v4.svg', name: 'icon-512.png', size: 512, flatten: '#fffaf1' },
  { source: 'icon-v4-apple.svg', name: 'apple-touch-icon.png', size: 180, flatten: '#fffaf1' },
  { source: 'icon-v4-apple.svg', name: 'icon-maskable-192.png', size: 192, flatten: '#fffaf1' },
  { source: 'icon-v4-apple.svg', name: 'icon-maskable-512.png', size: 512, flatten: '#fffaf1' },
];

if (!fs.existsSync(fontPath)) {
  console.error('Missing', fontPath);
  process.exit(1);
}

const fontB64 = fs.readFileSync(fontPath).toString('base64');
const fontDataUrl = `url('data:font/ttf;base64,${fontB64}') format('truetype');`;

function loadSvg(filename) {
  const file = path.join(publicDir, filename);
  if (!fs.existsSync(file)) {
    console.error('Missing', file);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8').replace(
    /src:\s*url\('fonts\/figtree\/Figtree-Variable\.ttf'\)\s*format\('truetype'\);/,
    `src: ${fontDataUrl} format('truetype');`,
  );
}

for (const { source, name, size, flatten } of jobs) {
  const svg = loadSvg(source);
  const out = path.join(publicDir, name);
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .flatten({ background: flatten })
    .png()
    .toFile(out);
  console.log(`wrote ${name} (${size}, flatten ${flatten})`);
}

