#!/usr/bin/env node
// check-shared-file-authorship.mjs — предупреждение о чужой работе, попавшей
// в коммит вместе со своей.
//
// Зачем. `git commit -- <путь>` берёт файл целиком, а не изменения автора.
// Явный путь защищает от захвата чужих файлов, но не от чужих правок внутри
// одного файла. 31 августа так пять раз унесли чужую работу, причём каждый
// следующий раз — соблюдая правило, придуманное после предыдущего: сначала
// «ставить и коммитить одной командой» (защищает от того, что твоё полежит,
// но не от того, что чужое уже лежит), потом «сверить общий файл с HEAD»
// (общих файлов оказалось два, сверили один).
//
// Почему предупреждение, а не запрет. Снимок вердиктов один на зону по
// построению, и совместная правка в нём законна — блокирующая проверка на
// восьми параллельных сессиях остановит всех на первой же ложной тревоге, а
// гейт, который краснеет на законном, снимают в тот же день.
//
// Что печатает: по каждому общему файлу — имена изменённых сущностей (ключи
// строк контракта, заголовки записей), чтобы автор увидел именно чужое. Общую
// фразу «в файле есть ещё изменения» глаз проскакивает, список имён — нет.
import { execFileSync } from 'node:child_process';

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

/** Файлы, которые в этом проекте пишет больше одного агента разом. */
function isShared(file) {
  return file.startsWith('docs/ui/verdicts/')
    || file === 'docs/ui/ui-v4-contract-verdicts.json'
    || file.startsWith('docs/ui/UI_V4_FINDINGS');
}

/** Строки контракта внутри снимка: ключ плюс отпечаток вердикта и факта. */
function verdictEntries(text) {
  const entries = new Map();
  if (!text) return entries;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return entries;
  }
  const zones = data.zones || { _: data };
  for (const [zoneId, zone] of Object.entries(zones)) {
    for (const [key, row] of Object.entries((zone && zone.rows) || {})) {
      const name = zoneId === '_' ? key : `${zoneId} · ${key}`;
      entries.set(name, `${row && row.v}|${row && row.f}`);
    }
  }
  return entries;
}

/** Записи журнала расхождений: каждая начинается заголовком третьего уровня. */
function findingEntries(text) {
  const entries = new Map();
  if (!text) return entries;
  const parts = text.split(/^### /m).slice(1);
  for (const part of parts) {
    const cut = part.indexOf('\n');
    const title = (cut < 0 ? part : part.slice(0, cut)).trim();
    entries.set(title, String(part.length));
  }
  return entries;
}

function changedNames(file) {
  const before = file.endsWith('.json') ? verdictEntries : findingEntries;
  const a = before(git(['show', `HEAD:${file}`]));
  const b = before(git(['show', `:${file}`]));
  const touched = new Set();
  for (const [name, value] of b) if (a.get(name) !== value) touched.add(name);
  for (const name of a.keys()) if (!b.has(name)) touched.add(name);
  return [...touched];
}

const staged = git(['diff', '--cached', '--name-only'])
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const shared = staged.filter(isShared);
if (!shared.length) process.exit(0);

const lines = [];
for (const file of shared) {
  const touched = changedNames(file);
  if (!touched.length) continue;
  const shown = touched.slice(0, 8).map((name) => `«${name}»`).join(', ');
  const tail = touched.length > 8 ? ` и ещё ${touched.length - 8}` : '';
  lines.push(`  ${file} — меняется ${touched.length}: ${shown}${tail}`);
}

if (lines.length) {
  process.stderr.write('\n[общий файл] в коммит идут изменения, которые пишет не один агент:\n');
  process.stderr.write(`${lines.join('\n')}\n`);
  process.stderr.write('  Всё это ваше? Если нет — чужое уедет в ваш коммит без упоминания.\n');
  process.stderr.write('  Это предупреждение, а не запрет: совместная правка здесь законна.\n\n');
}
process.exit(0);
