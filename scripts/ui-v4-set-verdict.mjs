#!/usr/bin/env node
// Ставит вердикт одной строке контракта v4.
//
//   node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>" [typed options]
//
// Меняет `v`, `f` и обязательные typed-поля. Отпечаток `h` не трогает — он принадлежит тексту
// строки в канвасе, а не нашему мнению о ней. Если дизайнер текст правил,
// ui-v4-check-contract-drift.mjs скажет об этом, и тогда нужен пересчёт.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ALLOWED_MISMATCH_REASON_CODES,
  ALLOWED_NA_KINDS,
  listZoneIds,
  readZone,
  resolveDecisionRef,
  writeZone,
} from './lib/ui-v4-verdicts.mjs';

const VALID = new Set(['=', '≠', '?', '—']);
const REASON_CODES = new Set(ALLOWED_MISMATCH_REASON_CODES);
const NA_KINDS = new Set(ALLOWED_NA_KINDS);

export function parseVerdictArgs(argv) {
  const [zone, key, verdict, ...tail] = argv;
  const fact = [];
  const options = {};
  for (let index = 0; index < tail.length; index += 1) {
    const token = tail[index];
    if (!token.startsWith('--')) {
      fact.push(token);
      continue;
    }
    const name = token.slice(2);
    if (!['reason-code', 'decision-ref', 'na-kind'].includes(name)) {
      throw new Error(`Неизвестная опция --${name}`);
    }
    const value = tail[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Для --${name} нужно значение`);
    options[name] = value;
    index += 1;
  }
  return { zone, key, verdict, fact: fact.join(' ').trim(), options };
}

export function applyVerdictToRow(row, { verdict, fact, options }, root) {
  if (!VALID.has(verdict)) throw new Error(`Вердикт «${verdict}» не из набора = ≠ ? —`);
  if (!fact) throw new Error('Факт обязателен: назовите доказательство или причину неизвестности.');

  const reasonCode = options['reason-code'];
  const decisionRef = options['decision-ref'];
  const naKind = options['na-kind'];

  if (verdict === '≠') {
    if (!REASON_CODES.has(reasonCode)) {
      throw new Error(`Для ≠ нужен --reason-code: ${ALLOWED_MISMATCH_REASON_CODES.join(', ')}`);
    }
    const decision = resolveDecisionRef(decisionRef, root);
    if (!decision.ok) {
      throw new Error(`Для ≠ нужен разрешимый --decision-ref (получено: ${decisionRef || 'пусто'})`);
    }
    if (naKind) throw new Error('--na-kind допустим только для —');
  } else if (verdict === '—') {
    if (!NA_KINDS.has(naKind)) {
      throw new Error(`Для — нужен --na-kind: ${ALLOWED_NA_KINDS.join(', ')}`);
    }
    if (reasonCode || decisionRef) throw new Error('--reason-code/--decision-ref допустимы только для ≠');
  } else if (reasonCode || decisionRef || naKind) {
    throw new Error('Typed-поля допустимы только для ≠ или —');
  }

  row.v = verdict;
  row.f = fact;
  delete row.reasonCode;
  delete row.decisionRef;
  delete row.naKind;
  if (verdict === '≠') {
    row.reasonCode = reasonCode;
    row.decisionRef = decisionRef;
  } else if (verdict === '—') {
    row.naKind = naKind;
  }
  return row;
}

function usage() {
  console.error('Использование: node scripts/ui-v4-set-verdict.mjs <зона> "<ключ>" "<вердикт>" "<факт>" [опции]');
  console.error('Для ≠: --reason-code <код> --decision-ref <repo-path:line|repo-path#anchor>');
  console.error('Для —: --na-kind <handoff|foreign-zone|demo-only|designer-removed>');
}

function runCli() {
  let parsed;
  try {
    parsed = parseVerdictArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    return 1;
  }
  const { zone, key, verdict } = parsed;

  if (!zone || !key || !verdict) {
    usage();
    return 1;
  }

  const zoneData = readZone(zone);
  if (!zoneData) {
    console.error(`Зоны «${zone}» нет. Есть: ${listZoneIds().join(', ')}`);
    return 1;
  }
  const row = zoneData.rows[key];
  if (!row) {
    console.error(`Строки «${key}» в зоне «${zone}» нет.`);
    return 1;
  }

  const was = row.v;
  try {
    applyVerdictToRow(row, parsed);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  writeZone(zone, zoneData);
  console.log(`${zone} :: ${key}   ${was} → ${verdict}`);
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exit(runCli());
