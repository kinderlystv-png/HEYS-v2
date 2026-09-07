#!/usr/bin/env node
/** gamification · «имя достижения — полные чернила» — package 48 verdict close. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey, writeZone } from './lib/ui-v4-verdicts.mjs';
import {
  snapshotForeignRowStrings,
  assertForeignRowsUnchanged,
  hashContractValue,
} from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONE = 'gamification';
const KEY = 'имя достижения — полные чернила';
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/gamification.v4.dc.html',
);

const FACT =
  '.game-v4-sheet__ach-name color var(--v4-ink, #201e1d) — apps/web/styles/modules/000-base-and-gamification.css:19146-19154; ' +
  'gamification-v4-ink-ladder-contract.test.js; ПОДТВЕРЖДЕНО 7 сентября: полные чернила --tx, не ступень';

function contractValue() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  const m = html.match(
    new RegExp(`<b>${KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</b><span data-v="([^"]*)"`),
  );
  if (!m) throw new Error(`Строка «${KEY}» не найдена в ${CANVAS}`);
  return m[1];
}

function ensureContractRow(zoneId, key, value) {
  const zone = readZone(zoneId);
  if (zone.rows[key]) return;
  zone.rows[key] = {
    v: '?',
    f: 'Строка добавлена дизайнером, вердикта нет',
    h: hashContractValue(value),
  };
  writeZone(zoneId, zone);
}

function main() {
  const value = contractValue();
  ensureContractRow(ZONE, KEY, value);

  const zone = readZone(ZONE);
  const scopeKeys = new Set([KEY]);
  const foreignBefore = snapshotForeignRowStrings(zone.rows, scopeKeys);

  const result = setVerdictKey(ZONE, KEY, { verdict: '=', fact: FACT, options: {} });
  if (result.skipped) {
    console.error('skipped', ZONE, KEY, result.reason, result.message);
    process.exit(1);
  }

  assertForeignRowsUnchanged(foreignBefore, readZone(ZONE).rows, scopeKeys);
  console.log(`${ZONE} · ${KEY} → =`);
}

main();
