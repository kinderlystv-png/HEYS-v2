#!/usr/bin/env node
/**
 * Чинит протухшие адреса в доказательствах вердиктов.
 *
 * Берёт разбор от `ui-v4-check-verdict-addresses.mjs --json` и предлагает
 * замену для каждого случая. Правит **только однозначное**: где кандидат один.
 * Где кандидатов несколько или ни одного — печатает и оставляет человеку, а не
 * выбирает наугад: неверный адрес хуже отсутствующего, потому что выглядит
 * проверенным.
 *
 * Что чинится и по какому признаку:
 *
 *   `missing`   — имя файла записано сокращённо (`733-login-theme.css` вместо
 *                 `733-ui-v4-login-theme.css`). Ищем файл, чьё имя содержит все
 *                 куски сокращения; попутно поправляем и номер строки.
 *   `truncated` — имя оборвано многоточием (`400-...css`). Восстанавливаем по
 *                 видимому началу и расширению.
 *   `beyond`    — номер строки за концом файла. Ищем имя из доказательства в
 *                 этом же файле и ставим его строку.
 *   `absent`    — имени нет в названном файле. Ищем, в каком файле оно есть; при
 *                 единственном кандидате переписываем и файл, и строку.
 *
 * Два запрета, оба из ложных предложений 31.08 — их поймало чтение плана
 * глазами, а не сама чинилка:
 *
 *   1. **Несколько адресов в записи — не чиним.** Правило «имя нашлось ровно в
 *      одном файле» ничего не говорит о том, **какой** из адресов чинить.
 *      Семь предложений подряд привязывали найденное имя к соседнему адресу:
 *      `showForecast` относится к спарклайнам, а переписать предлагалось адрес
 *      точки на завтра, который верен.
 *   2. **Имя файла без проверки строки — не чиним.** Восстановить имя и
 *      оставить прежний номер значит перевести дефект из жёсткого в мягкий:
 *      адрес станет разрешимым и **перестанет падать**, оставаясь ложным.
 *      Пятнадцать предложений так уехали бы на 40–712 строк мимо.
 *
 * Сначала показывает план. Правит только с `--apply`.
 *
 * Использование:
 *   node scripts/ui-v4-fix-verdict-addresses.mjs            # план
 *   node scripts/ui-v4-fix-verdict-addresses.mjs --apply    # правка
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VERDICTS = 'docs/ui/verdicts';
const apply = process.argv.includes('--apply');

const report = JSON.parse(
  execFileSync('node', ['scripts/ui-v4-check-verdict-addresses.mjs', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'public', 'dist', 'build', 'coverage', 'tmp',
  '.next', '.turbo', 'TOOLS', 'security-reports',
]);
const allFiles = [];
(function walk(dir, depth) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.husky') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, depth + 1);
      continue;
    }
    if (!/\.(js|mjs|ts|tsx|css|html|sql)$/.test(e.name)) continue;
    allFiles.push(full.split(path.sep).join('/'));
  }
})('.', 0);

const productFiles = allFiles.filter(
  (f) => !/__tests__|TESTS|bundle|genda|hobby|\.min\./i.test(f),
);

const textCache = new Map();
function linesOf(file) {
  if (!textCache.has(file)) {
    try {
      textCache.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/));
    } catch {
      textCache.set(file, null);
    }
  }
  return textCache.get(file);
}

/** Первая строка файла, где встречается имя. 1-based, 0 если нет. */
function lineOfName(file, name) {
  const lines = linesOf(file);
  if (!lines) return 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(name)) return i + 1;
  }
  return 0;
}

/** Кандидаты файлов по сокращённому имени: все куски должны входить в имя. */
function filesByShorthand(shorthand) {
  const base = path.basename(shorthand);
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length).replace(/\.\.\./g, '');
  const parts = stem.split(/[-_.]+/).filter((p) => p.length >= 2);
  if (!parts.length) return [];
  return productFiles.filter((f) => {
    if (path.extname(f) !== ext) return false;
    const n = path.basename(f);
    return parts.every((p) => n.includes(p));
  });
}

const plan = [];
const unresolved = [];

/** Сколько адресов в доказательстве этой строки. Больше одного — не чиним. */
const ADDRESS_RE = /[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|mjs|ts|tsx|css|html|sql):\d+/g;
const evidenceCache = new Map();
function addressCount(zone, key) {
  const id = `${zone}::${key}`;
  if (!evidenceCache.has(id)) {
    const data = JSON.parse(fs.readFileSync(path.join(VERDICTS, `${zone}.json`), 'utf8'));
    const f = data.rows?.[key]?.f || '';
    evidenceCache.set(id, (f.match(ADDRESS_RE) || []).length);
  }
  return evidenceCache.get(id);
}

function push(kind, item, oldAddr, newAddr, why) {
  if (addressCount(item.zone, item.key) > 1) {
    unresolved.push({ ...item, kind, candidates: [], note: 'в записи несколько адресов' });
    return;
  }
  plan.push({ kind, zone: item.zone, key: item.key, oldAddr, newAddr, why });
}

// --- имя файла записано сокращённо или оборвано -----------------------------
for (const kind of ['missing', 'truncated']) {
  for (const item of report.problems[kind]) {
    const candidates = filesByShorthand(item.rel);
    if (candidates.length !== 1) {
      unresolved.push({ ...item, kind, candidates: candidates.slice(0, 5) });
      continue;
    }
    const target = candidates[0];
    // Имя без строки — половина адреса. Проверяем, что по этому номеру в новом
    // файле действительно стоит что-то из названного доказательством; если нет
    // — ищем имя и ставим его строку; если и это не вышло, отдаём человеку.
    const lines = linesOf(target);
    const names = item.names || [];
    let line = 0;
    let why = '';
    if (lines && item.line <= lines.length && names.some((n) => lines[item.line - 1]?.includes(n))) {
      line = item.line;
      why = 'имя файла восстановлено, строка сошлась';
    } else {
      for (const n of names) {
        const l = lineOfName(target, n);
        if (l) {
          line = l;
          why = `имя файла восстановлено, строка найдена по «${n}»`;
          break;
        }
      }
    }
    if (!line) {
      unresolved.push({ ...item, kind, candidates: [target], note: 'строка не подтверждается' });
      continue;
    }
    push(kind, item, `${item.rel}:${item.line}`, `${target}:${line}`, why);
  }
}

// --- строка за концом файла --------------------------------------------------
for (const item of report.problems.beyond) {
  const names = (item.names || []).length ? item.names : [];
  let found = 0;
  let usedName = null;
  for (const n of names) {
    const l = lineOfName(item.rel, n);
    if (l) {
      found = l;
      usedName = n;
      break;
    }
  }
  if (!found) {
    unresolved.push({ ...item, kind: 'beyond', candidates: [] });
    continue;
  }
  push(
    'beyond',
    item,
    `${item.rel}:${item.line}`,
    `${item.rel}:${found}`,
    `строка найдена по имени «${usedName}»`,
  );
}

// --- имени нет в названном файле ---------------------------------------------
for (const item of report.problems.absent) {
  const names = item.names || [];
  let best = null;
  for (const n of names) {
    const hits = productFiles.filter((f) => {
      const lines = linesOf(f);
      return lines && lines.some((l) => l.includes(n));
    });
    if (hits.length === 1) {
      best = { file: hits[0], name: n, line: lineOfName(hits[0], n) };
      break;
    }
  }
  if (!best || !best.line) {
    unresolved.push({ ...item, kind: 'absent', candidates: [] });
    continue;
  }
  push(
    'absent',
    item,
    `${item.rel}:${item.line}`,
    `${best.file}:${best.line}`,
    `имя «${best.name}» нашлось ровно в одном файле`,
  );
}

console.log(`План: ${plan.length} замен, ${unresolved.length} требуют человека.\n`);
for (const p of plan) {
  console.log(`  ${p.zone} · «${p.key}»`);
  console.log(`      ${p.oldAddr}  →  ${p.newAddr}   (${p.why})`);
}
if (unresolved.length) {
  console.log(`\nНе чиню — кандидат не один:`);
  for (const u of unresolved) {
    console.log(
      `  ${u.zone} · ${u.rel}:${u.line} · «${u.key}»` +
        (u.candidates?.length ? `\n      варианты: ${u.candidates.join(', ')}` : ''),
    );
  }
}

if (!apply) {
  console.log('\nЭто план. Правка — с --apply.');
  process.exit(0);
}

// --- применение ---------------------------------------------------------------
const byZone = new Map();
for (const p of plan) {
  if (!byZone.has(p.zone)) byZone.set(p.zone, []);
  byZone.get(p.zone).push(p);
}
let changed = 0;
for (const [zone, items] of byZone) {
  const file = path.join(VERDICTS, `${zone}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const p of items) {
    const row = data.rows[p.key];
    if (!row || typeof row.f !== 'string') continue;
    if (!row.f.includes(p.oldAddr)) continue;
    row.f = row.f.split(p.oldAddr).join(p.newAddr);
    changed += 1;
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
console.log(`\nПереписано доказательств: ${changed}.`);
console.log('Проверьте гейтом и перепишите заморозку:');
console.log('  node scripts/ui-v4-check-verdict-addresses.mjs');
