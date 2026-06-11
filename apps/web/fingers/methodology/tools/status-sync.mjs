#!/usr/bin/env node
// status-sync.mjs — единый источник «Сводки готовности».
//
// Канон живёт в IMPLEMENTATION_MAP.md между маркерами STATUS:SOURCE.
// Скрипт переносит этот блок в METHODOLOGY.md и KICKOFF.md между маркерами
// STATUS:AUTO (содержимое там НЕ редактируется руками).
//
//   node tools/status-sync.mjs          — синкнуть (записать в таргеты)
//   node tools/status-sync.mjs --check  — проверить синк (exit 1 при дрейфе; для CI/pre-commit)
//
// Правило проекта: правишь сводку → правь ТОЛЬКО в IMPLEMENTATION_MAP (между
// STATUS:SOURCE) → прогони `node tools/status-sync.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FILE = path.join(DIR, 'IMPLEMENTATION_MAP.md');
const TARGETS = ['METHODOLOGY.md', 'KICKOFF.md'].map((f) => path.join(DIR, f));

const S_START = '<!-- STATUS:SOURCE:START -->';
const S_END = '<!-- STATUS:SOURCE:END -->';
const A_START = '<!-- STATUS:AUTO:START -->';
const A_END = '<!-- STATUS:AUTO:END -->';
const NOTE =
  '<!-- ⚙ Сгенерировано tools/status-sync.mjs из IMPLEMENTATION_MAP.md — НЕ редактировать вручную. -->';

function extractBetween(text, start, end, file) {
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < 0 || j < i) {
    console.error(`Маркеры ${start} … ${end} не найдены в ${path.basename(file)}`);
    process.exit(2);
  }
  return { i, j, inner: text.slice(i + start.length, j).trim() };
}

const check = process.argv.includes('--check');

const src = fs.readFileSync(SRC_FILE, 'utf8');
const block = extractBetween(src, S_START, S_END, SRC_FILE).inner;
const payload = NOTE + '\n\n' + block;

let drift = false;
for (const t of TARGETS) {
  const txt = fs.readFileSync(t, 'utf8');
  const { i, j, inner } = extractBetween(txt, A_START, A_END, t);
  if (inner === payload) continue;
  drift = true;
  if (check) {
    console.error(`DRIFT: ${path.basename(t)} рассинхронизирован со сводкой.`);
    continue;
  }
  const next = txt.slice(0, i + A_START.length) + '\n' + payload + '\n' + txt.slice(j);
  fs.writeFileSync(t, next);
  console.log(`synced → ${path.basename(t)}`);
}

if (check) {
  if (drift) {
    console.error('Запусти: node tools/status-sync.mjs');
    process.exit(1);
  }
  console.log('✅ Сводка готовности в синке (METHODOLOGY.md, KICKOFF.md).');
}
process.exit(0);
