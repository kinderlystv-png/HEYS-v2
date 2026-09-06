#!/usr/bin/env node
/**
 * Polosa 4 · task 139 — bulk owner-decision «≠» for small divergences (outside polosa 3).
 *
 * ЗАПУСК --apply только после полосы 3 (тон / высота / кегль выделены отдельно).
 * По умолчанию — --dry-run (счёт и handoff JSON, без записи вердиктов).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseContractAssertions } from './lib/ui-v4-assertions.mjs';
import {
  listZoneIds,
  readZone,
  resolveDecisionRef,
  setVerdictKey,
} from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANDOFF_PATH = path.join(ROOT, 'scripts/.polosa4-task139-bulk-owner-decision-handoff.json');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);

export const BULK_FACT =
  'Расхождение видно, принято без разбора. Решение дизайнера 6 сентября 2026.';

const ANSWER_BASENAME = 'ОТВЕТ-47-находок.md';

// --- polosa 3 exclusion (tone / height / kegl) — mirrors task138 buckets ---
const TON_PATTERNS = [
  /\bцвет\b/i,
  /\bтон\b/i,
  /\bфон\b/i,
  /\bзаливк/i,
  /\bbackground\b/i,
  /\bborder-color\b/i,
  /\bbox-shadow\b/i,
  /\bградиент/i,
  /\bgradient/i,
  /\bopacity\b/i,
  /\bпрозрачност/i,
  /\bполутон/i,
  /\bcurrentColor\b/,
  /\brgba?\(/i,
  /\bhsla?\(/i,
  /#[0-9a-f]{3,8}\b/i,
  /--v4-(ink|surface|act|scrim|sand|hero|c\d)/i,
  /--c[12]\b/,
  /--scrim\b/,
  /--gr\d\b/,
  /\bvar\(--[a-z0-9-]*(?:ink|surface|scrim|act|color|c\d|gr\d)/i,
  /\bрол[ьи]\s+(чернил|поверхност|акцент|scrim)/i,
  /\bink-\d\b/i,
  /\bцветом\b/i,
  /\bscrim\b/i,
];

const HEIGHT_PATTERNS = [
  /\bвысот[аыуе]\b/i,
  /\bheight\b/i,
  /\bmin-height\b/i,
  /\bmax-height\b/i,
  /\bpadding-top\b/i,
  /\bpadding-bottom\b/i,
  /\bmargin-top\b/i,
  /\bmargin-bottom\b/i,
  /\bвертикальн/i,
  /\bgap\b/i,
  /\b44\s*px\b/i,
  /\bзон[аы]\s+нажати/i,
  /\btouch\s*target/i,
  /\bдиаметр\b/i,
  /\bполе\s+рисунка\s+\d+×\d+/i,
  /\b\d+×\d+\s*px\b/i,
  /\bmin-h\b/i,
  /\bпаддинг/i,
];

const KEGL_PATTERNS = [
  /\bкегл/i,
  /\bfont-size\b/i,
  /\bfont:\s*[^;]*\d+(?:\.\d+)?px/i,
  /\bразмер\s+шрифт/i,
  /\bтипографик/i,
  /\bletter-spacing\b/i,
  /\bразрядк/i,
  /\b\d+(?:\.\d+)?px\/\d/i,
  /\b(?:^|[\s;])(9|10|11(?:\.\d+)?|12(?:\.\d+)?|13(?:\.\d+)?|14(?:\.\d+)?|15(?:\.\d+)?|16(?:\.\d+)?|17(?:\.\d+)?|18(?:\.\d+)?)px\b/,
  /\bначертани/i,
];

function scorePatterns(text, patterns) {
  let score = 0;
  for (const re of patterns) {
    if (re.test(text)) score += 1;
  }
  return score;
}

function classifyVisualBucket(key, canvasValue, fact) {
  const combined = `${key} ${canvasValue} ${fact}`;
  const notColor = /\bне\s+цвет\b/i.test(fact);

  let ton = scorePatterns(combined, TON_PATTERNS);
  let height = scorePatterns(combined, HEIGHT_PATTERNS);
  let kegl = scorePatterns(combined, KEGL_PATTERNS);

  if (notColor) ton = Math.max(0, ton - 3);
  if (/\bвысот/i.test(key)) height += 3;
  if (/\bкегл|font|типограф|шрифт/i.test(key)) kegl += 3;
  if (/^\s*height\s*[:=]/i.test(canvasValue) || /\bвысота\s+\d/i.test(canvasValue)) height += 4;
  if (/font-size|font:\s*\d|кегль|\d+px\/\d/i.test(canvasValue)) kegl += 4;
  if (/фон|цвет|тон|rgba|#|var\(--(?:v4-)?(?:ink|surface|c\d|gr)/i.test(canvasValue)) ton += 4;

  const visualMax = Math.max(ton, height, kegl);
  if (visualMax === 0) return null;

  if (kegl >= height && kegl >= ton && kegl === visualMax) return 'kegl';
  if (height >= ton && height >= kegl && height === visualMax) return 'height';
  if (ton === visualMax) return 'ton';
  if (kegl === height && kegl === visualMax) return 'kegl';
  if (ton === height && ton === visualMax) return /\bфон|цвет|тон\b/i.test(fact) ? 'ton' : 'height';
  if (kegl === ton && kegl === visualMax) return /\d+(?:\.\d+)?px/.test(fact) && /font/i.test(fact) ? 'kegl' : 'ton';
  return null;
}

function assertionPolosa3(parsed) {
  for (const assertion of parsed?.assertions || []) {
    if (assertion.kind === 'color') return 'tone';
    if (assertion.kind === 'typography') {
      const prop = String(assertion.property || '');
      if (/font-size|font-weight|letter-spacing|^font$/i.test(prop)) return 'kegl';
    }
    if (assertion.kind === 'dimensions') {
      const prop = String(assertion.property || '');
      if (/height|min-height|max-height|padding-top|padding-bottom|margin-top|margin-bottom/i.test(prop)) {
        return 'height';
      }
    }
  }
  return null;
}

export function isExcludedPolosa3(key, canvasValue, fact) {
  const parsed = parseContractAssertions({ identity: key, value: canvasValue });
  const fromAssertion = assertionPolosa3(parsed);
  if (fromAssertion) return { excluded: true, reason: `assertion-${fromAssertion}` };

  const bucket = classifyVisualBucket(key, canvasValue, fact || '');
  if (bucket === 'ton' || bucket === 'height' || bucket === 'kegl') {
    return { excluded: true, reason: `classify-${bucket}` };
  }

  if (/\b(тон|цвет|кегл|высот|font-size|min-height|letter-spacing)\b/i.test(key)) {
    return { excluded: true, reason: 'key-text' };
  }

  return { excluded: false };
}

export function isBulkTargetRow(row) {
  if (row?.v !== '≠') return false;
  if (row.reasonCode === 'owner-decision' && row.f === BULK_FACT) return false;
  return true;
}

function contractRows(html) {
  const rows = [];
  for (const m of html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.push({ key: m[1], value: m[2] });
  }
  return rows;
}

function loadCanvasMap(canvasFile) {
  const file = path.join(PACK, canvasFile);
  if (!fs.existsSync(file)) return new Map();
  const html = fs.readFileSync(file, 'utf8');
  return new Map(contractRows(html).map((row) => [row.key, row.value]));
}

export function findDecisionRefFile() {
  const hits = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (name.name === ANSWER_BASENAME) hits.push(full);
    }
  };
  walk(path.join(ROOT, 'docs/ui/handoff-v4/canvas'));
  if (hits.length === 1) return path.relative(ROOT, hits[0]).replace(/\\/g, '/');
  if (hits.length > 1) {
    throw new Error(`Найдено несколько ${ANSWER_BASENAME}: ${hits.join(', ')}`);
  }
  return null;
}

function resolveBulkDecisionRef() {
  const relative = findDecisionRefFile();
  if (!relative) {
    return {
      relative: null,
      ref: null,
      ok: false,
      kind: 'missing-target',
    };
  }
  const ref = `${relative}:1`;
  const decision = resolveDecisionRef(ref, ROOT);
  return { relative, ref, ok: decision.ok, kind: decision.kind };
}

function collectPlan() {
  const canvasCache = new Map();
  const wouldApply = [];
  const excluded = [];
  const skipped = [];

  for (const zoneId of listZoneIds()) {
    const zone = readZone(zoneId);
    if (!zone?.rows) continue;
    const canvasFile = zone.canvas;
    if (!canvasCache.has(canvasFile)) canvasCache.set(canvasFile, loadCanvasMap(canvasFile));
    const contract = canvasCache.get(canvasFile);

    for (const [key, row] of Object.entries(zone.rows)) {
      if (!isBulkTargetRow(row)) {
        if (row.v === '≠' && row.reasonCode === 'owner-decision' && row.f === BULK_FACT) {
          skipped.push({ zoneId, key, reason: 'already-bulk-closed' });
        }
        continue;
      }

      const canvasValue = contract.get(key) ?? '';
      const gate = isExcludedPolosa3(key, canvasValue, row.f || '');
      if (gate.excluded) {
        excluded.push({ zoneId, key, reason: gate.reason });
        continue;
      }

      wouldApply.push({ zoneId, key, was: { v: row.v, reasonCode: row.reasonCode, f: row.f } });
    }
  }

  return { wouldApply, excluded, skipped };
}

function summarizeByZone(entries) {
  const byZone = {};
  for (const { zoneId } of entries) {
    byZone[zoneId] = (byZone[zoneId] || 0) + 1;
  }
  return byZone;
}

function writeHandoff(payload) {
  fs.writeFileSync(HANDOFF_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function applyBulk(plan, decisionRef) {
  const byZone = new Map();
  for (const item of plan.wouldApply) {
    if (!byZone.has(item.zoneId)) byZone.set(item.zoneId, []);
    byZone.get(item.zoneId).push(item.key);
  }

  const applied = [];
  for (const [zoneId, keys] of byZone.entries()) {
    const zone = readZone(zoneId);
    const keySet = new Set(keys);
    const foreignBefore = snapshotForeignRowStrings(zone.rows, keySet);

    for (const key of keys) {
      const result = setVerdictKey(zoneId, key, {
        verdict: '≠',
        fact: BULK_FACT,
        options: {
          'reason-code': 'owner-decision',
          'decision-ref': decisionRef,
        },
      });
      applied.push({ zoneId, key, ...result });
    }

    const live = readZone(zoneId);
    assertForeignRowsUnchanged(foreignBefore, live.rows);
  }

  return applied;
}

function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;
  const decision = resolveBulkDecisionRef();
  const plan = collectPlan();
  const byZone = summarizeByZone(plan.wouldApply);

  const payload = {
    task: 139,
    mode: dryRun ? 'dry-run' : 'apply',
    generatedAt: new Date().toISOString(),
    bulkFact: BULK_FACT,
    decisionRefFile: decision.relative,
    decisionRef: decision.ref,
    decisionRefResolvable: decision.ok,
    applyAllowed: false,
    note: 'ЗАПУСК --apply только после полосы 3 (тон / высота / кегль).',
    totals: {
      wouldApply: plan.wouldApply.length,
      excludedPolosa3: plan.excluded.length,
      skippedAlreadyClosed: plan.skipped.length,
    },
    byZone,
    sampleWouldApply: plan.wouldApply.slice(0, 12).map(({ zoneId, key }) => ({ zoneId, key })),
    sampleExcludedPolosa3: plan.excluded.slice(0, 12).map(({ zoneId, key, reason }) => ({
      zoneId,
      key,
      reason,
    })),
  };

  if (apply) {
    if (!decision.ok || !decision.ref) {
      throw new Error(
        `decisionRef не разрешим (${decision.kind || 'missing'}): положите ${ANSWER_BASENAME} в docs/ui/handoff-v4/canvas/**/`,
      );
    }
    payload.applied = applyBulk(plan, decision.ref).length;
    payload.mode = 'apply';
  }

  writeHandoff(payload);
  console.log(JSON.stringify(payload.totals, null, 2));
  console.log(`byZone: ${JSON.stringify(byZone)}`);
  console.log(`handoff: ${path.relative(ROOT, HANDOFF_PATH)}`);
  if (!decision.relative) {
    console.warn(`WARN: ${ANSWER_BASENAME} не найден — decisionRef будет недоступен до появления файла`);
  }
}

main();
