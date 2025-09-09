#!/usr/bin/env node

/**
 * Simple Service Worker Copy Script
 * Копирует Service Worker файл в нужные места
 */

import { copyFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(__dirname);

const SOURCE = `${ROOT_DIR}/heys-sw.js`;
const DESTINATIONS = [
  `${ROOT_DIR}/apps/web/public/heys-sw.js`,
];

async function copySW() {
  console.log('📦 Copying Service Worker...');
  
  for (const dest of DESTINATIONS) {
    try {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(SOURCE, dest);
      console.log(`✅ Copied to: ${dest.replace(ROOT_DIR, '.')}`);
    } catch (error) {
      console.error(`❌ Failed to copy to ${dest}:`, error.message);
    }
  }
  
  console.log('✅ Service Worker copy complete!');
}

copySW().catch(console.error);
