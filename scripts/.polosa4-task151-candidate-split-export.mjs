#!/usr/bin/env node
/**
 * Polosa 4 · task 151 — publish bulk-owner-decision candidates split into 3 review polosas.
 *
 * Does NOT write verdicts. Regenerates docs/ui/polosa4-task151-bulk-owner-decision-candidates.json
 * from the same selection logic as task 139 dry-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BULK_FACT,
  collectPlan,
  findDecisionRefFile,
} from './.polosa4-task139-bulk-owner-decision-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'docs/ui/polosa4-task151-bulk-owner-decision-candidates.json');
const DRY_RUN_CMD = 'node scripts/.polosa4-task139-bulk-owner-decision-apply.mjs';
const EXPORT_CMD = 'node scripts/.polosa4-task151-candidate-split-export.mjs';

function compoundKey(zoneId, key) {
  return `${zoneId}::${key}`;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const zoneCmp = a.zoneId.localeCompare(b.zoneId, 'ru');
    if (zoneCmp !== 0) return zoneCmp;
    return a.key.localeCompare(b.key, 'ru');
  });
}

function splitIntoThirds(entries) {
  const sorted = sortEntries(entries);
  const total = sorted.length;
  const base = Math.floor(total / 3);
  const remainder = total % 3;
  const sizes = [
    base + (remainder > 0 ? 1 : 0),
    base + (remainder > 1 ? 1 : 0),
    base,
  ];

  const polosa1 = sorted.slice(0, sizes[0]);
  const polosa2 = sorted.slice(sizes[0], sizes[0] + sizes[1]);
  const polosa3 = sorted.slice(sizes[0] + sizes[1]);

  return {
    sizes,
    polosa1,
    polosa2,
    polosa3,
  };
}

function summarizeExcludedByReason(excluded) {
  const byReason = {};
  for (const item of excluded) {
    byReason[item.reason] = (byReason[item.reason] || 0) + 1;
  }
  return byReason;
}

function summarizeByZone(entries) {
  const byZone = {};
  for (const { zoneId } of entries) {
    byZone[zoneId] = (byZone[zoneId] || 0) + 1;
  }
  return byZone;
}

function toKeyRecords(entries, polosa = null) {
  return entries.map(({ zoneId, key, reason, was }) => ({
    zoneId,
    key,
    id: compoundKey(zoneId, key),
    ...(polosa != null ? { polosa } : {}),
    ...(reason ? { excludeReason: reason } : {}),
    ...(was ? { currentVerdict: was } : {}),
  }));
}

function main() {
  const plan = collectPlan();
  const decisionRefFile = findDecisionRefFile();
  const split = splitIntoThirds(plan.wouldApply);

  const payload = {
    task: 151,
    sourceTask: 167,
    generatedAt: new Date().toISOString(),
    generationDate: new Date().toISOString().slice(0, 10),
    commands: {
      dryRun: DRY_RUN_CMD,
      export: EXPORT_CMD,
    },
    bulkFact: BULK_FACT,
    note:
      'Кандидаты на bulk owner-decision «≠» вне designer-risk (Task 167: действие / контраст / <44 / кегль<12). --apply task 139 только после exclude-list от всех трёх полос ревью.',
    decisionRef: {
      file: decisionRefFile,
      resolvable: Boolean(decisionRefFile),
      blocker: decisionRefFile
        ? null
        : 'ОТВЕТ-47-находок.md не найден в docs/ui/handoff-v4/canvas/**/ — decisionRef недоступен до появления файла',
    },
    dryRunTotals: {
      wouldApply: plan.wouldApply.length,
      excludedPolosa3: plan.excluded.length,
      skippedAlreadyClosed: plan.skipped.length,
      remainingAfterApply: 0,
    },
    splitTotals: {
      candidates: plan.wouldApply.length,
      polosa1: split.polosa1.length,
      polosa2: split.polosa2.length,
      polosa3: split.polosa3.length,
    },
    byZone: {
      candidates: summarizeByZone(plan.wouldApply),
      excludedPolosa3: summarizeByZone(plan.excluded),
    },
    excludedPolosa3: {
      count: plan.excluded.length,
      note: 'Уже исключены task 167 как designer-risk — не входят в кандидаты и не делятся на polosa 1–3.',
      byReason: summarizeExcludedByReason(plan.excluded),
      entries: toKeyRecords(sortEntries(plan.excluded)),
    },
    polosa1: {
      count: split.polosa1.length,
      keys: split.polosa1.map(({ zoneId, key }) => compoundKey(zoneId, key)),
      entries: toKeyRecords(split.polosa1, 1),
    },
    polosa2: {
      count: split.polosa2.length,
      keys: split.polosa2.map(({ zoneId, key }) => compoundKey(zoneId, key)),
      entries: toKeyRecords(split.polosa2, 2),
    },
    polosa3: {
      count: split.polosa3.length,
      keys: split.polosa3.map(({ zoneId, key }) => compoundKey(zoneId, key)),
      entries: toKeyRecords(split.polosa3, 3),
    },
    excludeListFormat: {
      description:
        'Каждая полоса присылает ключи, которые НЕ закрывать bulk-решением (оставить на разбор). Формат — массив compound id.',
      example: ['strength-builder::вид · карточка упражнения', 'home-widgets::вид · плитка веса'],
      fields: {
        id: 'zoneId::key — как в keys[] этого файла',
        polosa: '1 | 2 | 3 — какая полоса прислала исключение',
        reason: 'опционально: почему не bulk-close',
      },
    },
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(payload.dryRunTotals, null, 2));
  console.log(JSON.stringify(payload.splitTotals, null, 2));
  console.log(`output: ${path.relative(ROOT, OUT_PATH)}`);
  if (payload.decisionRef.blocker) {
    console.warn(`WARN: ${payload.decisionRef.blocker}`);
  }
}

main();
