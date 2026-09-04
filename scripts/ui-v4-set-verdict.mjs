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
  applyVerdictToRow,
  listZoneIds,
  readZone,
  setVerdictKey,
  writeZone,
} from './lib/ui-v4-verdicts.mjs';

export { applyVerdictToRow, setVerdictKey };

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

  if (!readZone(zone)) {
    console.error(`Зоны «${zone}» нет. Есть: ${listZoneIds().join(', ')}`);
    return 1;
  }

  try {
    const { was } = setVerdictKey(zone, key, {
      verdict: parsed.verdict,
      fact: parsed.fact,
      options: parsed.options,
    });
    console.log(`${zone} :: ${key}   ${was.v} → ${verdict}`);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exit(runCli());
