#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * @file Strip console.log from insight modules for production
 * @description Удаляет console.log из pi_*.js файлов после копирования в dist
 * @version 1.0.0
 *
 * Запуск: node scripts/strip-console-logs.js
 * Или как postbuild hook в package.json
 *
 * Причина: viteStaticCopy копирует файлы без обработки terser,
 * поэтому console.log остаются в production. Этот скрипт решает проблему.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {string} Путь к dist/insights */
const DIST_INSIGHTS = resolve(__dirname, '../dist/insights');

/**
 * Удаляет console.log из содержимого файла
 * @param {string} content - Содержимое файла
 * @returns {{ content: string, removed: number }}
 */
function stripConsoleLogs(content) {
  let removed = 0;
  let result = content;

  // Паттерн 1: if (typeof console !== 'undefined' && console.log) { console.log(...); }
  result = result.replace(
    /if\s*\(\s*typeof\s+console\s*!==\s*['"]undefined['"]\s*&&\s*console\.log\s*\)\s*\{\s*console\.log\([^)]*\);\s*\}/g,
    () => {
      removed++;
      return '/* console.log removed for production */';
    },
  );

  // Паттерн 2: console.log(...);
  result = result.replace(/^\s*console\.log\([^)]*\);\s*$/gm, () => {
    removed++;
    return '/* console.log removed for production */';
  });

  return { content: result, removed };
}

/**
 * Обрабатывает все pi_*.js файлы в dist/insights
 */
function processInsightsFolder() {
  if (!existsSync(DIST_INSIGHTS)) {
    console.log('[strip-console] dist/insights not found, skipping...');
    return;
  }

  const files = readdirSync(DIST_INSIGHTS).filter((f) => f.startsWith('pi_') && f.endsWith('.js'));

  let totalRemoved = 0;
  const processed = [];

  for (const file of files) {
    const filePath = join(DIST_INSIGHTS, file);
    const content = readFileSync(filePath, 'utf-8');
    const { content: stripped, removed } = stripConsoleLogs(content);

    if (removed > 0) {
      writeFileSync(filePath, stripped, 'utf-8');
      totalRemoved += removed;
      processed.push(`${file}: ${removed}`);
    }
  }

  if (totalRemoved > 0) {
    console.log(`[strip-console] Removed ${totalRemoved} console.log statements:`);
    processed.forEach((p) => console.log(`  - ${p}`));
  } else {
    console.log('[strip-console] No console.log statements found');
  }
}

// Запуск
processInsightsFolder();
