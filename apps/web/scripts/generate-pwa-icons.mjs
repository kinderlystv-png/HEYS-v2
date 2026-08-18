/**
 * PWA icons from icon-v4.svg (handoff app-splash.v4, variant B inset ring).
 * Embeds Caprasimo for sharp/librsvg. Run: node apps/web/scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const source = path.join(publicDir, 'icon-v4.svg');
const fontPath = path.join(publicDir, 'fonts/Caprasimo-Regular.ttf');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

if (!fs.existsSync(source)) {
  console.error('Missing', source);
  process.exit(1);
}
if (!fs.existsSync(fontPath)) {
  console.error('Missing', fontPath);
  process.exit(1);
}

const fontB64 = fs.readFileSync(fontPath).toString('base64');
let svg = fs.readFileSync(source, 'utf8');
svg = svg.replace(
  /src:\s*url\('fonts\/Caprasimo-Regular\.ttf'\)\s*format\('truetype'\);/,
  `src: url('data:font/ttf;base64,${fontB64}') format('truetype');`,
);

for (const { name, size } of sizes) {
  const out = path.join(publicDir, name);
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .flatten({ background: '#fffaf1' })
    .png()
    .toFile(out);
  console.log(`wrote ${name} (${size})`);
}
