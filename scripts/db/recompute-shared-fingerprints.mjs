#!/usr/bin/env node
// Пересчёт fingerprint / brand_fingerprint для строк общего каталога.
//
// Зачем: отпечаток считается от названия и нутриентов и служит ключом
// дедупликации при публикации продукта. После правки состава он устаревает —
// и дедуп перестаёт узнавать продукт, то есть при следующей публикации того же
// товара в каталоге появится второй экземпляр.
//
// Алгоритм ОБЯЗАН совпадать с фронтом: apps/web/heys_models_v1.js,
// computeProductFingerprint / computeProductBrandFingerprint. Любое
// расхождение здесь снова разведёт два механизма дедупликации.
//
// Использование:
//   bash scripts/db/psql.sh -t -A -c "SELECT row_to_json(t)::text FROM (SELECT * FROM shared_products) t;" > catalog.json
//   node scripts/db/recompute-shared-fingerprints.mjs catalog.json > update.sql
//   bash scripts/db/psql.sh -f update.sql
//
// Скрипт ничего не пишет в базу сам — только печатает SQL, чтобы изменения
// можно было прочитать до применения.

import fs from 'node:fs';
import crypto from 'node:crypto';

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

// Порядок и состав полей — как в getProductFingerprintNutrientsPart.
// Значения в базе лежат в lowercase (badfat100), на фронте — в camelCase.
function nutrientsPart(row) {
  return [
    round1(row.simple100),
    round1(row.complex100),
    round1(row.protein100),
    round1(row.badfat100),
    round1(row.goodfat100),
    round1(row.trans100),
    round1(row.fiber100),
    round1(row.gi),
    round1(row.harm),
  ].join('|');
}

const normalizeName = (value) => String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function computeFingerprint(row) {
  return sha256(`${normalizeName(row.name)}::${nutrientsPart(row)}`);
}

function computeBrandFingerprint(row) {
  const brand = normalizeName(row.brand);
  if (!brand) return '';
  return sha256(`${normalizeName(row.name)}::${brand}::${nutrientsPart(row)}`);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Укажи путь к JSON-выгрузке shared_products (по строке на продукт).');
  process.exit(1);
}

const rows = fs
  .readFileSync(inputPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const statements = [];
const seen = new Map();
let unchanged = 0;

for (const row of rows) {
  const fingerprint = computeFingerprint(row);
  const brandFingerprint = computeBrandFingerprint(row);

  // Коллизия означала бы два одинаковых продукта — UNIQUE(fingerprint) такое
  // не примет, поэтому останавливаемся до записи, а не ловим ошибку в базе.
  if (seen.has(fingerprint)) {
    console.error(`Коллизия отпечатка: "${row.name}" и "${seen.get(fingerprint)}" — сначала схлопни дубль.`);
    process.exit(1);
  }
  seen.set(fingerprint, row.name);

  const brandChanged = (row.brand_fingerprint || '') !== brandFingerprint;
  if (row.fingerprint === fingerprint && !brandChanged) {
    unchanged += 1;
    continue;
  }

  const brandValue = brandFingerprint ? `'${brandFingerprint}'` : 'NULL';
  statements.push(
    `UPDATE public.shared_products SET fingerprint = '${fingerprint}', brand_fingerprint = ${brandValue} WHERE id = '${row.id}';`
  );
}

console.error(`Всего: ${rows.length}, без изменений: ${unchanged}, к обновлению: ${statements.length}`);

if (statements.length) {
  console.log('BEGIN;');
  for (const statement of statements) console.log(statement);
  console.log('COMMIT;');
}
