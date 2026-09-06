#!/usr/bin/env node
/**
 * ui-v4-classify-package-drift.mjs — разбор дрейфа пакета на «переименование» и
 * «смену смысла».
 *
 * Пакет 43 перевёл 4403 объявления цвета текста с долей на четыре ступени-роли и
 * утверждает, что вид изменился только у 49 узлов. Проверка этого утверждения не
 * делается чтением: 1655 строк дрейфа нельзя прочесть глазами, а поверить на
 * слово значит принять переписанный контракт не глядя. Здесь строки сравниваются
 * попарно — прежний текст из git-версии канваса против текущего — и делятся на
 * два ведра:
 *
 *   rename — отличие ТОЛЬКО в записи тона (доля → имя ступени), причём ступень
 *            берёт то же значение, что доля называла: тогда строка означает
 *            ровно прежнее, и вердикт по ней остаётся верным;
 *   review — всё остальное: сменилось значение, число, слово или структура.
 *
 * Ведро rename можно закрывать пересъёмкой отпечатка. Ведро review читается
 * построчно, как обычная приёмка.
 *
 * Запуск: node scripts/ui-v4-classify-package-drift.mjs <baseRef> [--rows] [--json] [--apply]
 *
 * `--apply` переснимает отпечаток ТОЛЬКО у строк ведра rename и оставляет их
 * вердикт: строка означает прежнее, значит и вердикт по ней прежний. Это не
 * послабление к `--rehash`, а его узкий случай — доказанный здесь же, а не
 * принятый на слово: то же сравнение прогоняется заново перед каждой записью,
 * и строка, которая по нему не rename, не трогается вовсе. Обычный `--rehash`
 * сбрасывает в «?» ЛЮБУЮ изменившуюся строку, и на пакете 43 это выбросило бы
 * 1413 верных вердиктов, заменив разбор смысла разбором записи.
 *
 * В факт дописывается пометка о переводе — иначе следующий читатель увидит
 * факт про долю рядом со строкой про ступень и решит, что факт устарел.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { patchZoneRow } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const VERDICTS = path.join(ROOT, 'docs/ui/verdicts');

/** Ступени чернил набора: имя роли → доля, которую она несёт. */
const INK_STEPS = new Map([
  ['--ink-2', 0.55],
  ['--ink-3', 0.45],
  ['--ink-4', 0.38],
  ['--ink-30', 0.3],
  ['--tx', 1],
]);

/** Сдвиг, при котором вид считается прежним. Дизайнер назвал 49 узлов со
 *  сдвигом 8 и больше; всё, что ниже 5 пунктов, в его же таблице помечено
 *  «неразличимо». Порог 5 — граница между этими двумя утверждениями. */
const SAME_LOOK_DELTA = 0.05;

/**
 * Строки контракта той же выборкой, что у гейта дрейфа
 * (`ui-v4-check-contract-drift.mjs`): при `contractOnly` берётся только блок
 * `[data-contract]`, иначе весь файл. Иначе счёт разойдётся с гейтом на
 * строках слепка, и число, которое пойдёт человеку, будет про другое
 * множество.
 */
function readContractRows(html, contractOnly) {
  let slice = html;
  if (contractOnly) {
    const m = html.match(
      /<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/,
    );
    if (!m) return null;
    slice = m[1];
  }
  const rows = new Map();
  for (const m of slice.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.set(decodeEntities(m[1]), decodeEntities(m[2]));
  }
  return rows;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Заменяет и доли, и имена ступеней на общий знак с числом — так две записи
 *  одного тона становятся одинаковой строкой, а разного тона — разными. */
function normalizeInk(text) {
  let out = text;
  // Порядок важен: сначала целая форма `var(--ink-2)`, иначе от неё останется
  // осиротевшая обёртка `var(…)`, и скелет строки разойдётся с прежней записью
  // `rgba(var(--ink),.56)`, у которой обёртки нет. Первый прогон 6 сентября дал
  // ровно это — ноль переименований на 1655 строках, чего не бывает.
  // Длинные имена первыми: иначе `--ink-3` съедает начало `--ink-30` и
  // тридцатипроцентная ступень читается как сорокапятипроцентная с хвостом.
  const names = [...INK_STEPS.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const share = INK_STEPS.get(name);
    const re = new RegExp(`var\\(\\s*${name}\\s*(?:,[^)]*)?\\)`, 'g');
    out = out.replace(re, `«ИНК:${share}»`);
  }
  out = out.replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(\.\d+|0\.\d+)\s*\)/gi, (_, a) => `«ИНК:${Number(a)}»`);
  out = out.replace(/rgba\(var\(--ink\)\s*,\s*(\.\d+|0\.\d+)\s*\)/gi, (_, a) => `«ИНК:${Number(a)}»`);
  out = out.replace(/чернил[а-я]*\s+(\d{1,3})\s*%/gi, (_, pct) => `«ИНК:${Number(pct) / 100}»`);
  for (const name of names) {
    out = out.split(name).join(`«ИНК:${INK_STEPS.get(name)}»`);
  }
  return out;
}

function inkValues(text) {
  return [...text.matchAll(/«ИНК:([\d.]+)»/g)].map((m) => Number(m[1]));
}

function classify(before, after) {
  if (before === after) return { bucket: 'same' };
  const nb = normalizeInk(before);
  const na = normalizeInk(after);
  const skeletonB = nb.replace(/«ИНК:[\d.]+»/g, '«ИНК»');
  const skeletonA = na.replace(/«ИНК:[\d.]+»/g, '«ИНК»');
  if (skeletonB !== skeletonA) return { bucket: 'review', why: 'изменился не только тон' };
  const vb = inkValues(nb);
  const va = inkValues(na);
  if (vb.length !== va.length) return { bucket: 'review', why: 'число упоминаний тона разошлось' };
  let maxDelta = 0;
  for (let i = 0; i < vb.length; i += 1) maxDelta = Math.max(maxDelta, Math.abs(vb[i] - va[i]));
  if (maxDelta > SAME_LOOK_DELTA) {
    return { bucket: 'review', why: `тон сдвинулся на ${Math.round(maxDelta * 100)} пунктов` };
  }
  return { bucket: 'rename', maxDelta };
}

const baseRef = process.argv[2] || 'HEAD~1';
const summary = {};
const reviewRows = [];
const renameByZone = {};

for (const file of fs.readdirSync(PACK).filter((f) => f.endsWith('.v4.dc.html'))) {
  const zone = file.replace('.v4.dc.html', '');
  const verdictPath = path.join(VERDICTS, `${zone}.json`);
  if (!fs.existsSync(verdictPath)) continue;
  let beforeHtml;
  try {
    beforeHtml = execFileSync(
      'git',
      ['show', `${baseRef}:docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/${file}`],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 },
    );
  } catch {
    continue;
  }
  const zoneFile = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
  const contractOnly = zoneFile.contractOnly !== false;
  const before = readContractRows(beforeHtml, contractOnly);
  const after = readContractRows(fs.readFileSync(path.join(PACK, file), 'utf8'), contractOnly);
  if (!before || !after) {
    console.error(`${zone}: блок [data-contract] не найден — зона пропущена`);
    continue;
  }
  const verdicts = zoneFile.rows || {};

  const counts = { rename: 0, review: 0, new: 0, gone: 0 };
  for (const [key, text] of after) {
    if (!before.has(key)) {
      counts.new += 1;
      continue;
    }
    const res = classify(before.get(key), text);
    if (res.bucket === 'same') continue;
    counts[res.bucket] += 1;
    if (res.bucket === 'review') {
      reviewRows.push({ zone, key, why: res.why, verdict: verdicts[key]?.v ?? '—нет—' });
    } else if (res.bucket === 'rename') {
      (renameByZone[zone] ||= []).push({ key, beforeText: before.get(key), afterText: text });
    }
  }
  for (const key of before.keys()) if (!after.has(key)) counts.gone += 1;
  if (counts.rename || counts.review || counts.new || counts.gone) summary[zone] = counts;
}

const totals = { rename: 0, review: 0, new: 0, gone: 0 };
console.log('зона                 переименование  разбор  новых  исчезло');
for (const [zone, c] of Object.entries(summary).sort((a, b) => b[1].review - a[1].review)) {
  for (const k of Object.keys(totals)) totals[k] += c[k];
  console.log(`${zone.padEnd(20)} ${String(c.rename).padStart(14)} ${String(c.review).padStart(7)} ${String(c.new).padStart(6)} ${String(c.gone).padStart(8)}`);
}
console.log(`${'ИТОГО'.padEnd(20)} ${String(totals.rename).padStart(14)} ${String(totals.review).padStart(7)} ${String(totals.new).padStart(6)} ${String(totals.gone).padStart(8)}`);

if (process.argv.includes('--apply')) {
  const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
  const NOTE = 'Пакет 43 перевёл запись тона с доли на ступень набора; значение то же, вердикт сохранён.';
  let written = 0;
  let skipped = 0;
  for (const [zone, rows] of Object.entries(renameByZone)) {
    const before = snapshotForeignRowStrings(
      JSON.parse(fs.readFileSync(path.join(VERDICTS, `${zone}.json`), 'utf8')).rows || {},
      new Set(rows.map((r) => r.key)),
    );
    for (const row of rows) {
      let ok = false;
      patchZoneRow(zone, row.key, (live) => {
        // Пересчёт под локом: между разбором и записью зону мог переписать
        // кто угодно. Строка, переставшая быть rename, не трогается.
        if (classify(row.beforeText, row.afterText).bucket !== 'rename') return;
        if (live.h === hash(row.afterText)) return;
        live.h = hash(row.afterText);
        if (!String(live.f || '').includes(NOTE)) live.f = `${live.f} ${NOTE}`.trim();
        ok = true;
      });
      if (ok) written += 1;
      else skipped += 1;
    }
    assertForeignRowsUnchanged(
      before,
      JSON.parse(fs.readFileSync(path.join(VERDICTS, `${zone}.json`), 'utf8')).rows || {},
    );
  }
  console.log(`
Отпечатки пересняты у переименований: ${written}; пропущено ${skipped}.`);
  console.log('Остальное — обычной приёмкой: перечитать строку, поправить код, --rehash, вердикт.');
}

if (process.argv.includes('--rows')) {
  console.log('\nСтроки под разбор:');
  for (const r of reviewRows) console.log(`  ${r.zone} :: ${r.key} [${r.verdict}] — ${r.why}`);
}
if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(ROOT, 'scripts/.package-43-review-rows.json'), `${JSON.stringify(reviewRows, null, 2)}\n`, 'utf8');
  console.log(`\nСтроки под разбор → scripts/.package-43-review-rows.json (${reviewRows.length})`);
}
