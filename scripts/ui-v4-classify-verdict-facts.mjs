#!/usr/bin/env node
/**
 * Классифицирует факты «=» без разбираемого file:line (остаток facts gate).
 *
 *   node scripts/ui-v4-classify-verdict-facts.mjs
 *   node scripts/ui-v4-classify-verdict-facts.mjs --json
 *   node scripts/ui-v4-classify-verdict-facts.mjs --zone=curator-edits --samples
 *
 * Вёдра:
 *   (a) legitimately-no-address — текст, presence, naKind, структура, не CSS/JS rule
 *   (b) code-missing-address    — про код, адреса нет
 *   (c) code-unparsed-address   — адрес есть, gate не парсит (shorthand, gate ref)
 *   (g) unclear
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { countShorthandAddresses } from './lib/ui-v4-addresses.mjs';
import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import { inspectVerdictFacts } from './ui-v4-check-verdict-facts.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = '(?:js|mjs|ts|tsx|css|html|sql|svg|json)';
const FULL_ADDRESS = new RegExp(`([A-Za-z0-9_][A-Za-z0-9_./-]*\\.${EXT}):(\\d+)`, 'g');
const SHORT_MODULE_REF = /\b(\d{3}):(\d{3,5})(?:-(\d{3,5}))?\b/g;
const CLASS_SELECTOR = /\.[a-z][a-z0-9_-]{2,}/gi;
const CSS_VAR = /--[a-z][a-z0-9-]{2,}/gi;
const CAMEL_ID = /\b[a-z][a-zA-Z0-9]{2,}(?:Ref|Html|Modal|Ms|Key)\b/g;
const FILE_BASENAME = /\b([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|mjs|css))\b/g;
const GATE_REF = /\b[a-z0-9][a-z0-9-]*-(?:canvas-razbor|canvas-geometry|canvas-copy|canvas-smoke)(?:\.test\.js)?\b/i;
const FUNC_LINE = /\b([A-Za-z_$][A-Za-z0-9_$]{2,})\s*:\s*(\d{2,5})\b/g;

const SHORTHAND_ALIASES = new Set([
  'banner', 'css', 'app_shell', 'widgets_ui', 'superset_ui', 'ui',
  '000-base', '400-water', '500-pwa', '002-ui-v4-palette-roles',
]);

const LEGIT_NO_ADDRESS = [
  'правило канваса',
  'правило чтения',
  'к коду не сводится',
  'data-screen-label',
  'кадр =',
  'кадр показывает',
  'не сводится',
  'semantic diff',
  'rpc ',
  'тесты ',
  'закрепляют payload',
  'sessionstorage',
  'localstorage',
  'changelog rpc',
  'в коде нет ни',
  'нет ни вибрации',
  'нет ни звука',
  'в файле нет',
  'заглушек в файле нет',
  'формат реализован',
  'полного продуктового вердикта',
  'слова на экране',
  'служебных слов',
  'owner contract',
  'owner decision',
  'owner-pending',
  'designer-removed',
  'foreign-zone',
  'demo-only',
  'handoff',
];

function parseGateAddresses(evidence) {
  const list = [];
  const seen = new Set();
  const text = String(evidence || '');
  for (const m of text.matchAll(FULL_ADDRESS)) {
    const key = `${m[1]}\u0000${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ kind: 'full', raw: m[0] });
  }
  for (const m of text.matchAll(SHORT_MODULE_REF)) {
    const key = `mod:${m[1]}\u0000${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ kind: 'module', raw: m[0] });
  }
  return list;
}

function hasUnparsedAddressCue(f) {
  if (countShorthandAddresses(f) > 0) return true;
  for (const m of f.matchAll(/\b([a-z0-9][a-z0-9_-]{0,40}):(\d{2,5})\b/gi)) {
    const pre = f.slice(Math.max(0, m.index - 2), m.index);
    if (pre.endsWith('.')) continue;
    const alias = m[1].toLowerCase();
    if (SHORTHAND_ALIASES.has(alias) || SHORTHAND_ALIASES.has(m[1])) return true;
    if (!m[1].includes('.') && !/^\d{3}$/.test(m[1])) return true;
  }
  if (GATE_REF.test(f)) return true;
  for (const m of f.matchAll(FUNC_LINE)) {
    const pre = f.slice(Math.max(0, m.index - 2), m.index);
    if (pre.endsWith('.')) continue;
    if (!/^[A-Z]/.test(m[1])) return true;
  }
  return false;
}

function looksLikeCodeEvidence(f) {
  if (CLASS_SELECTOR.test(f)) return true;
  CLASS_SELECTOR.lastIndex = 0;
  if (CSS_VAR.test(f)) return true;
  CSS_VAR.lastIndex = 0;
  if (CAMEL_ID.test(f)) return true;
  CAMEL_ID.lastIndex = 0;
  for (const m of f.matchAll(FILE_BASENAME)) {
    const after = f.slice(m.index + m[0].length);
    if (!/^\s*:\s*\d/.test(after)) return true;
  }
  if (/\b(?:min-height|max-height|font-size|line-height|border-radius|padding|margin|gap|flex|grid)\b/i.test(f)) {
    return true;
  }
  if (/\bheys_[a-z0-9_]+\b/i.test(f)) return true;
  if (/\b(?:render|mount|enqueue|flush|open)[A-Z][A-Za-z0-9]+\b/.test(f)) return true;
  return false;
}

function looksLegitimatelyNoAddress(row, f) {
  if (row?.naKind) return true;
  const lower = f.toLowerCase();
  if (!f.trim()) return true;
  if (LEGIT_NO_ADDRESS.some((needle) => lower.includes(needle))) return true;
  if (/^[^.:]{0,120}$/.test(f) && !looksLikeCodeEvidence(f)) return true;
  if (/сведено разбором/i.test(f) && !CLASS_SELECTOR.test(f)) return true;
  CLASS_SELECTOR.lastIndex = 0;
  return false;
}

/**
 * @param {ReturnType<typeof readAllZones>} data
 * @param {{ verdicts?: string[], zoneFilter?: Set<string>|null }} options
 */
export function classifyVerdictFacts(data, options = {}) {
  const verdicts = options.verdicts || ['='];
  const zoneFilter = options.zoneFilter || null;
  const verdictSet = new Set(verdicts);

  const factsReport = inspectVerdictFacts(data, zoneFilter);
  const buckets = { a: 0, b: 0, c: 0, g: 0 };
  const byZone = {};
  const rows = [];

  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneFilter && !zoneFilter.has(zoneId)) continue;
    byZone[zoneId] = { a: 0, b: 0, c: 0, g: 0, equals: 0, unparsed: 0 };

    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (!verdictSet.has(row?.v)) continue;
      byZone[zoneId].equals += 1;

      const f = String(row?.f || '').trim();
      const addresses = parseGateAddresses(f);
      const parsed = addresses.length > 0;
      if (parsed) continue;

      byZone[zoneId].unparsed += 1;

      let bucket;
      let reason;
      if (hasUnparsedAddressCue(f)) {
        bucket = 'c';
        reason = 'unparsed-address-form';
      } else if (looksLegitimatelyNoAddress(row, f)) {
        bucket = 'a';
        reason = 'non-code-evidence';
      } else if (looksLikeCodeEvidence(f)) {
        bucket = 'b';
        reason = 'code-without-address';
      } else {
        bucket = 'g';
        reason = 'unclear';
      }

      buckets[bucket] += 1;
      byZone[zoneId][bucket] += 1;
      rows.push({ zoneId, key, bucket, reason, f });
    }
  }

  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({ buckets, byZone }))
    .digest('hex')
    .slice(0, 16);

  return {
    verdicts,
    equalsRows: factsReport.equalsRows,
    parsedRows: factsReport.parsedRows,
    unparsedRows: factsReport.unparsedRows,
    buckets,
    byZone,
    digest,
    rows,
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const samples = args.includes('--samples');
  const zoneOnly = (args.find((a) => a.startsWith('--zone=')) || '').slice(7);
  const zoneFilter = zoneOnly ? new Set([zoneOnly]) : null;

  const report = classifyVerdictFacts(readAllZones(), { zoneFilter });

  if (asJson) {
    const payload = samples
      ? report
      : { ...report, rows: report.rows.length };
    process.stdout.write(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(
    `Факты «=»: ${report.equalsRows}; разобрано ${report.parsedRows}; ` +
      `остаток без file:line: ${report.unparsedRows}.`,
  );
  console.log(
    `Классификация остатка: (a) ${report.buckets.a} · (b) ${report.buckets.b} · ` +
      `(c) ${report.buckets.c} · (g) ${report.buckets.g} · digest ${report.digest}`,
  );

  const zoneEntries = Object.entries(report.byZone)
    .filter(([, z]) => z.unparsed > 0)
    .sort((a, b) => b[1].unparsed - a[1].unparsed)
    .slice(0, 12);
  if (zoneEntries.length) {
    console.log('\nТоп зон по остатку:');
    for (const [zoneId, z] of zoneEntries) {
      console.log(
        `  ${zoneId}: unparsed ${z.unparsed} — a ${z.a} b ${z.b} c ${z.c} g ${z.g}`,
      );
    }
  }

  if (samples) {
    console.log('\nПримеры (по одному на ведро):');
    for (const bucket of ['a', 'b', 'c', 'g']) {
      const item = report.rows.find((r) => r.bucket === bucket);
      if (!item) continue;
      console.log(`  (${bucket}) ${item.zoneId} · ${item.key}`);
      console.log(`      ${item.f.slice(0, 140)}${item.f.length > 140 ? '…' : ''}`);
    }
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
