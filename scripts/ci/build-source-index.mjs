#!/usr/bin/env node
/**
 * Срез текстовых исходников для коннектора: архив + манифест.
 *
 * Зачем. Куратор спрашивает в чате «как в приложении считается белок», и ответ
 * должен опираться на код, а не на пересказ. Репозиторий приватный, у облачной
 * сессии нет ни диска, ни ключей, поэтому исходники едут в приватный бакет
 * отдельным архивом, а коннектор ищет по нему (heys-mcp/lib/source-index.js).
 *
 * Что НЕ кладётся и почему:
 *  - собранные бандлы из public/ — это тот же код второй раз, и поиск по нему
 *    даёт десять одинаковых совпадений вместо одного нужного;
 *  - lock-файлы, карты исходников, минифицированное — шум без ответов;
 *  - бинарники (apk, aab, видео) — 400 МБ из 448 МБ веса репозитория.
 *
 * Запуск: node scripts/ci/build-source-index.mjs --out dist/source-index
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.sql', '.md',
  '.yml', '.yaml', '.css', '.html', '.sh', '.py', '.toml',
]);

/** Потолок файла: крупнее в исходниках не бывает, бывают артефакты. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const EXCLUDE = [
  /(^|\/)public\/[^/]*\.bundle\./,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const repoRoot = process.cwd();
const outDir = path.resolve(repoRoot, arg('out', 'dist/source-index'));

const tracked = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const picked = [];
let skippedBig = 0;
for (const file of tracked) {
  if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
  if (EXCLUDE.some((re) => re.test(file))) continue;
  let size = 0;
  try {
    size = fs.statSync(path.join(repoRoot, file)).size;
  } catch {
    continue; // файл в индексе, но не на диске — не наша забота
  }
  if (size > MAX_FILE_BYTES) { skippedBig += 1; continue; }
  picked.push({ file, size });
}

if (!picked.length) {
  console.error('Срез пуст: ни одного текстового файла не отобрано — проверь фильтры.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const listPath = path.join(outDir, 'files.txt');
fs.writeFileSync(listPath, picked.map((p) => p.file).join('\n'));

const archivePath = path.join(outDir, 'latest.tar.gz');
// Архив собирается из файлового списка: перечислять тысячи путей аргументами
// нельзя, а «взять всё и исключить» вернуло бы сюда те самые 400 МБ бинарников.
execFileSync('tar', ['-czf', archivePath, '-T', listPath], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString('utf8').trim();
const manifest = {
  commit,
  built_at: new Date().toISOString(),
  files: picked.length,
  bytes: picked.reduce((sum, p) => sum + p.size, 0),
  archive_bytes: fs.statSync(archivePath).size,
  skipped_big: skippedBig,
};
fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Срез собран: ${manifest.files} файлов, ${(manifest.bytes / 1e6).toFixed(1)} МБ текста, `
  + `архив ${(manifest.archive_bytes / 1e6).toFixed(1)} МБ, коммит ${commit.slice(0, 8)}`
  + (skippedBig ? `, пропущено крупных: ${skippedBig}` : ''),
);
