#!/usr/bin/env node
/**
 * ui-v4-check-decision-refs.mjs — сторож «слепой штамповки» decisionRef.
 *
 * Проблема. Несколько строк вердикта делят один `decisionRef` (например
 * strength-builder.v4.dc.html:754), а поле `f` у каждой строки ссылается на
 * разные факты контракта. Так появляется пакетная метка решения без
 * построчной основы: одна строка канваса не может одновременно быть единственным
 * основанием для десятков разных расхождений.
 *
 * Порог: MAX_UNDECLARED_ROWS = 3.
 * Один и тот же `decisionRef` в пределах зоны может покрывать не больше трёх
 * строк без явного объявления общего решения. До трёх — допустимо для соседних
 * строк одного кадра; четвёртая и дальше требуют декларации, иначе это
 * batch-stamp.
 *
 * Легитимный общий ref (одно решение владельца на весь кадр/зону) объявляется
 * одним из способов:
 *
 *   1. На каждой строке кластера: `decisionRefScope` ∈
 *      `frame` | `zone` | `owner-batch`.
 *   2. В метаданных зоны: блок `sharedDecisionRefs` — объект ref → { scope, note? }
 *      или массив { ref, scope, note? }.
 *
 * «Объявленный batch» vs «слепая штамповка»: при count > 3 гейт смотрит только
 * на наличие декларации. Без неё — fail, даже если все `f` совпадают (как
 * reports-insights с 17 одинаковыми фактами).
 *
 * Использование:
 *   node scripts/ui-v4-check-decision-refs.mjs
 *   node scripts/ui-v4-check-decision-refs.mjs --zone strength-builder
 *   node scripts/ui-v4-check-decision-refs.mjs --list
 *   node scripts/ui-v4-check-decision-refs.mjs --json
 */

import { pathToFileURL } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

/** Строк с одним ref без декларации — максимум; четвёртая требует sharedDecisionRefs. */
export const MAX_UNDECLARED_ROWS = 3;

const ALLOWED_SCOPES = new Set(['frame', 'zone', 'owner-batch']);

function parseArgs(argv) {
  const options = { zones: new Set(), list: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--zone') {
      const zoneId = argv[index + 1];
      if (!zoneId || zoneId.startsWith('--')) throw new Error('После --zone нужен id зоны.');
      options.zones.add(zoneId);
      index += 1;
    } else if (arg.startsWith('--zone=')) {
      options.zones.add(arg.slice('--zone='.length));
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }
  return options;
}

function shortRef(ref) {
  const parts = String(ref || '').split('/');
  return parts[parts.length - 1] || ref;
}

/**
 * Нормализует zone.sharedDecisionRefs в Map<ref, { scope, note? }>.
 */
export function readSharedDecisionRefs(zone) {
  const map = new Map();
  const raw = zone?.sharedDecisionRefs;
  if (!raw) return map;

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry?.ref) continue;
      map.set(entry.ref, { scope: entry.scope, note: entry.note });
    }
    return map;
  }

  if (typeof raw === 'object') {
    for (const [ref, meta] of Object.entries(raw)) {
      if (typeof meta === 'string') {
        map.set(ref, { scope: meta });
      } else {
        map.set(ref, meta || {});
      }
    }
  }
  return map;
}

function isDeclaredShared(ref, zoneMeta, rowsInCluster) {
  const zoneDecl = readSharedDecisionRefs(zoneMeta).get(ref);
  if (zoneDecl?.scope && ALLOWED_SCOPES.has(zoneDecl.scope)) return true;

  return rowsInCluster.every((row) => {
    const scope = row?.decisionRefScope;
    return scope && ALLOWED_SCOPES.has(scope);
  });
}

/**
 * @returns {Array<{
 *   zoneId: string,
 *   decisionRef: string,
 *   rowCount: number,
 *   uniqueFacts: number,
 *   sampleKeys: string[],
 *   declared: boolean,
 * }>}
 */
export function findUndeclaredDecisionRefClusters(data, zoneFilter = null) {
  const problems = [];

  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneFilter && !zoneFilter.has(zoneId)) continue;

    const byRef = new Map();
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      const ref = row?.decisionRef;
      if (!ref) continue;
      const list = byRef.get(ref) || [];
      list.push({ key, row });
      byRef.set(ref, list);
    }

    for (const [ref, entries] of byRef) {
      if (entries.length <= MAX_UNDECLARED_ROWS) continue;

      const rows = entries.map((e) => e.row);
      const declared = isDeclaredShared(ref, zone, rows);
      if (declared) continue;

      const facts = new Set(entries.map((e) => String(e.row?.f || '').trim()));
      problems.push({
        zoneId,
        decisionRef: ref,
        rowCount: entries.length,
        uniqueFacts: facts.size,
        sampleKeys: entries.slice(0, 5).map((e) => e.key),
        declared: false,
      });
    }
  }

  problems.sort((a, b) => b.rowCount - a.rowCount);
  return problems;
}

export function runDecisionRefCheck(options = {}) {
  const data = readAllZones();
  const zoneFilter = options.zones?.size ? options.zones : null;
  return findUndeclaredDecisionRefClusters(data, zoneFilter);
}

function printList(problems) {
  if (!problems.length) {
    console.log(
      `decisionRef: кластеров без декларации нет (порог > ${MAX_UNDECLARED_ROWS} строк на ref).`,
    );
    return;
  }

  console.log(
    `decisionRef: ${problems.length} кластер(ов) без декларации (порог > ${MAX_UNDECLARED_ROWS}):`,
  );
  for (const p of problems) {
    console.log(
      `  ${p.zoneId} · ${shortRef(p.decisionRef)} · ${p.rowCount} строк · ${p.uniqueFacts} разных f`,
    );
  }
}

function printFailure(problems) {
  console.error(
    `decisionRef: ${problems.length} кластер(ов) без объявленного общего решения (порог > ${MAX_UNDECLARED_ROWS} строк на ref).`,
  );
  console.error(
    'Объявите batch: decisionRefScope на строках (frame|zone|owner-batch) или sharedDecisionRefs в метаданных зоны.',
  );

  const byZone = new Map();
  for (const p of problems) {
    const list = byZone.get(p.zoneId) || [];
    list.push(p);
    byZone.set(p.zoneId, list);
  }

  for (const [zoneId, rows] of byZone) {
    console.error(`\n❌ ${zoneId}: ${rows.length} ref(ов)`);
    for (const row of rows) {
      const samples = row.sampleKeys.map((k) => `«${k}»`).join(', ');
      console.error(
        `  ${shortRef(row.decisionRef)} · ${row.rowCount} строк · ${row.uniqueFacts} разных f · примеры: ${samples}`,
      );
    }
  }
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const problems = runDecisionRefCheck(options);

  if (options.json) {
    console.log(JSON.stringify({ maxUndeclared: MAX_UNDECLARED_ROWS, problems }, null, 2));
    if (problems.length) process.exitCode = 1;
    return;
  }

  if (options.list) {
    printList(problems);
    if (problems.length) process.exitCode = 1;
    return;
  }

  if (!problems.length) {
    console.log(
      `decisionRef чист: ни один ref не покрывает > ${MAX_UNDECLARED_ROWS} строк без декларации.`,
    );
    return;
  }

  printFailure(problems);
  process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
