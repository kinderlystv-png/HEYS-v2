#!/usr/bin/env node
// ui-v4-check-literal-lock-tests.mjs — инвентарь тестов, которые сторожат
// текущее состояние (литералы), а не инвариант.
//
// Фаза 1 (полоса 6): только инвентарь и храповик-allowlist. В ui:v4:check
// не входит — подключение запланировано на полосу 5 после ревью владельца.
//
// Использование:
//   node scripts/ui-v4-check-literal-lock-tests.mjs --list
//   node scripts/ui-v4-check-literal-lock-tests.mjs --json
//   node scripts/ui-v4-check-literal-lock-tests.mjs --update-allowlist
//   node scripts/ui-v4-check-literal-lock-tests.mjs            # сравнение с allowlist
//
// Полоса 5 (позже): добавить в pnpm ui:v4:check как
//   node scripts/ui-v4-check-literal-lock-tests.mjs
// с exit 1 при находках вне allowlist.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/.ui-v4-literal-lock-tests-allowlist.json');
const TEST_ROOTS = [
  path.join(ROOT, 'apps/web/__tests__'),
  path.join(ROOT, 'scripts/__tests__'),
];
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Имена файлов, где литералы — намеренный контракт канваса. */
const EXCLUDED_FILE_PATTERNS = [
  /-canvas-razbor\.test\.[cm]?js$/i,
  /-canvas-geometry\.test\.[cm]?js$/i,
  /-canvas-copy\.test\.[cm]?js$/i,
  /-canvas-contract\.test\.[cm]?js$/i,
  /v4-palette-roles-contract\.test\.[cm]?js$/i,
  /role-fallback-truth\.test\.[cm]?js$/i,
  /ui-v4-verdict-semantics\.test\.[cm]?js$/i, // fixture baseline/digest — отдельный контур
];

/** Строки с этими маркерами — осознанный контракт, не инвентарный литерал. */
const LINE_SAFE_MARKERS = [
  /legacyVerdictKeysDigest/,
  /toBeLessThan(?:OrEqual)?\(/,
  /\.toBe\(\s*[a-zA-Z_$][\w$]*\s*\)/, // сравнение с переменной, не литералом
  /\/\/.*invariant/i,
  /\/\/.*литерал/i,
];

/** Доменные числа — не инвентарь зон/вердиктов. */
const DOMAIN_VALUE_MARKERS =
  /\b(?:duration_ms|recommended|baseline|grams|kcal|percent|steps|waterMl|totalXP|windowDays|score|level|temp|updatedAt|intervalMs|rollMs|lineMs|returnMs|totalMs|weighIns|silentDays|snapQuickFill|sliderPercent|householdMin|savedDisplayOptimum|tonnage|plannedVolume|proteinGrams|avgGI|totalCarbs|totalGrams|eaten|delta)\b/i;

const INVENTORY_KEYWORDS =
  /\b(?:verdict|zoneId|legacy|typedMismatch|typed-v1|notApplicable|mismatch|zone\.rows|EXCEPTIONS|RAZBOR_EXCEPTIONS|bare literal|allowlist|moduleCount|ALL_RULES|registry\.size|frames\.size|canvasesCovered|canvasZones|rules\.length|files\.length|sites\.length|UI_V4_BARE)\b/i;

const KINDS = {
  EXPECT_INVENTORY_COUNT: 'expect-inventory-count',
  COLLECTION_SIZE_LITERAL: 'collection-size-literal',
  VERDICT_COUNT_OBJECT: 'verdict-count-object',
  LITERAL_HEX_IN_EXPECT: 'literal-hex-in-expect',
  LARGE_TO_EQUAL_ARRAY: 'large-to-equal-array',
  GREATER_THAN_INVENTORY: 'greater-than-inventory-floor',
};

function collectTestFiles() {
  const out = [];
  for (const root of TEST_ROOTS) {
    if (!fs.existsSync(root)) continue;
    walk(root, out);
  }
  return out.sort();
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEST_FILE_RE.test(entry.name)) out.push(full);
  }
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function isExcludedFile(file) {
  const name = path.basename(file);
  return EXCLUDED_FILE_PATTERNS.some((re) => re.test(name));
}

function contextWindow(lines, index, radius = 2) {
  const start = Math.max(0, index - radius);
  const end = Math.min(lines.length - 1, index + radius);
  return lines.slice(start, end + 1).join('\n');
}

function isSafeLine(line) {
  return LINE_SAFE_MARKERS.some((re) => re.test(line));
}

function findingId(file, line, kind) {
  return crypto.createHash('sha1').update(`${file}:${line}:${kind}`).digest('hex').slice(0, 12);
}

function pushFinding(findings, seen, file, line, kind, snippet, reason) {
  const r = rel(file);
  const lineKey = `${r}:${line}`;
  if (seen.has(lineKey)) return;
  seen.add(lineKey);
  const key = `${lineKey}:${kind}`;
  seen.add(key);
  findings.push({
    id: findingId(r, line, kind),
    file: r,
    line,
    kind,
    snippet: snippet.trim().slice(0, 160),
    reason,
  });
}

function scanExpectInventoryCount(lines, file, findings, seen) {
  const re = /expect\s*\([^)]*\)\.(?:toBe|toEqual)\s*\(\s*(\d{2,})\s*\)/g;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isSafeLine(line) || DOMAIN_VALUE_MARKERS.test(line)) continue;
    const ctx = contextWindow(lines, i);
    if (!INVENTORY_KEYWORDS.test(ctx)) continue;
    for (const m of line.matchAll(re)) {
      const n = Number(m[1]);
      if (n < 10) continue;
      pushFinding(
        findings,
        seen,
        file,
        i + 1,
        KINDS.EXPECT_INVENTORY_COUNT,
        line,
        `expect().toBe(${n}) при inventory-контексте — число устареет при закрытии зоны/строки`,
      );
    }
  }
}

function scanCollectionSizeLiteral(lines, file, findings, seen) {
  const re = /\.(?:length|size)\)\.(?:toBe|toEqual)\s*\(\s*(\d{2,})\s*\)/g;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isSafeLine(line)) continue;
    for (const m of line.matchAll(re)) {
      const n = Number(m[1]);
      if (n < 10) continue;
      const ctx = contextWindow(lines, i);
      const inventoryish =
        INVENTORY_KEYWORDS.test(ctx) ||
        /EXCEPTIONS|RAZBOR_EXCEPTIONS|frames\.size|registry\.size|ALL_RULES|moduleCount/.test(ctx);
      if (!inventoryish && n < 20) continue;
      pushFinding(
        findings,
        seen,
        file,
        i + 1,
        KINDS.COLLECTION_SIZE_LITERAL,
        line,
        `.length/.size).toBe(${n}) фиксирует размер коллекции, а не правило`,
      );
    }
  }
}

function scanVerdictCountObject(lines, file, findings, seen) {
  const re =
    /expect\s*\([^)]*\)\.(?:toEqual|toMatchObject)\s*\(\s*\{[^}]*(?:mismatch|typedMismatch|notApplicable)\s*:\s*(\d+)/g;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isSafeLine(line)) continue;
    for (const m of line.matchAll(re)) {
      pushFinding(
        findings,
        seen,
        file,
        i + 1,
        KINDS.VERDICT_COUNT_OBJECT,
        line,
        'объект с mismatch/typedMismatch/notApplicable — классический literal-lock вердиктов',
      );
    }
  }
  // многострочный toEqual({ mismatch: 72, ...})
  for (let i = 0; i < lines.length; i += 1) {
    const block = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
    if (!/expect\s*\(/.test(block) || !/toEqual\s*\(\s*\{/.test(block)) continue;
    if (!/(?:mismatch|typedMismatch|notApplicable)\s*:\s*\d{2,}/.test(block)) continue;
    if (isSafeLine(lines[i])) continue;
    pushFinding(
      findings,
      seen,
      file,
      i + 1,
      KINDS.VERDICT_COUNT_OBJECT,
      lines[i],
      'блок toEqual с числовыми полями вердикт-счётчика',
    );
    break;
  }
}

function scanLiteralHexInExpect(lines, file, findings, seen) {
  const re = /expect\s*\([^)]*\)\.(?:toBe|toEqual|toContain|toMatch|not\.toContain)\s*\([^)]*#([0-9a-fA-F]{3,8})\b/g;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/\/\/\s*v4-intentional|CANVAS\.|PALETTE\.|ЛЕСТНИЦА|palette injection/i.test(line)) continue;
    // var(--v4-role, #hex) в regex — проверка роли с запасным; отдельный гейт foreign-fallbacks.
    if (/var\(\s*--v4-[^)]*,\s*#[0-9a-fA-F]{3,8}\s*\)/.test(line) && /\.toMatch/.test(line)) continue;
    for (const m of line.matchAll(re)) {
      pushFinding(
        findings,
        seen,
        file,
        i + 1,
        KINDS.LITERAL_HEX_IN_EXPECT,
        line,
        `голый #${m[1]} в expect — при переводе на роль тест упадёт на починке`,
      );
    }
  }
}

function scanLargeToEqualArray(lines, file, findings, seen) {
  const re = /expect\s*\([^)]*\)\.toEqual\s*\(\s*\[[^\]]{120,}\]\s*\)/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!re.test(line)) continue;
    const elemCount = (line.match(/['"`]/g) || []).length;
    if (elemCount < 6) continue;
    pushFinding(
      findings,
      seen,
      file,
      i + 1,
      KINDS.LARGE_TO_EQUAL_ARRAY,
      line.slice(0, 120) + '…',
      'длинный toEqual([...]) — растущий снимок вместо проверки правила',
    );
  }
}

function scanGreaterThanInventoryFloor(lines, file, findings, seen) {
  const re = /\.toBeGreaterThan(?:OrEqual)?\s*\(\s*(\d{2,})\s*\)/g;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const ctx = contextWindow(lines, i);
    if (!/(?:frames\.size|EXCEPTIONS|RAZBOR_EXCEPTIONS|ALL_RULES|moduleCount|canvasesCovered|data-v=)/.test(ctx)) continue;
    for (const m of line.matchAll(re)) {
      const n = Number(m[1]);
      if (n < 15) continue;
      pushFinding(
        findings,
        seen,
        file,
        i + 1,
        KINDS.GREATER_THAN_INVENTORY,
        line,
        `пол нижней границы (${n}) в inventory-контексте — слабее, но всё ещё привязка к объёму`,
      );
    }
  }
}

export function scanLiteralLockTests(testRoots = TEST_ROOTS) {
  const findings = [];
  const seen = new Set();
  const files = collectTestFiles();

  for (const file of files) {
    if (isExcludedFile(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);

    scanExpectInventoryCount(lines, file, findings, seen);
    scanCollectionSizeLiteral(lines, file, findings, seen);
    scanVerdictCountObject(lines, file, findings, seen);
    scanLiteralHexInExpect(lines, file, findings, seen);
    scanLargeToEqualArray(lines, file, findings, seen);
    scanGreaterThanInventoryFloor(lines, file, findings, seen);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
  return { findings, scannedFiles: files.filter((f) => !isExcludedFile(f)).length, excludedFiles: files.filter(isExcludedFile).length };
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return { version: 1, updatedAt: null, findings: [] };
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
}

function saveAllowlist(findings) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    note:
      'Замороженный инвентарь literal-lock тестов. Список может только уменьшаться; рост — новый долг.',
    findings: findings.map(({ id, file, line, kind, snippet, reason }) => ({
      id,
      file,
      line,
      kind,
      snippet,
      reason,
    })),
  };
  fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function compareAllowlist(findings, allowlist) {
  const allowed = new Map(allowlist.findings.map((f) => [`${f.file}:${f.line}:${f.kind}`, f]));
  const current = new Map(findings.map((f) => [`${f.file}:${f.line}:${f.kind}`, f]));
  const newFindings = findings.filter((f) => !allowed.has(`${f.file}:${f.line}:${f.kind}`));
  const resolved = allowlist.findings.filter((f) => !current.has(`${f.file}:${f.line}:${f.kind}`));
  return { newFindings, resolved };
}

function summarizeByKind(findings) {
  const byKind = {};
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  }
  return byKind;
}

function printList(report) {
  const { findings, scannedFiles, excludedFiles } = report;
  const byKind = summarizeByKind(findings);
  console.log(
    `Literal-lock tests: ${findings.length} находок в ${scannedFiles} файлах ` +
      `(исключено canvas-контрактов: ${excludedFiles}).`,
  );
  console.log('По категориям:');
  for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log('\nТоп примеры:');
  for (const f of findings.slice(0, 30)) {
    console.log(`  ${f.file}:${f.line} [${f.kind}]`);
    console.log(`    ${f.snippet}`);
    console.log(`    → ${f.reason}`);
  }
  if (findings.length > 30) {
    console.log(`\n  … ещё ${findings.length - 30} (полный список: --json)`);
  }
  console.log(
    '\nПолоса 5: после ревью добавить в pnpm ui:v4:check → node scripts/ui-v4-check-literal-lock-tests.mjs',
  );
}

function runCli() {
  const args = new Set(process.argv.slice(2));
  const report = scanLiteralLockTests();

  if (args.has('--update-allowlist')) {
    const saved = saveAllowlist(report.findings);
    console.log(`Allowlist обновлён: ${saved.findings.length} записей → ${path.relative(ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (args.has('--list')) {
    printList(report);
    return;
  }

  const allowlist = loadAllowlist();
  if (!allowlist.findings?.length) {
    console.log('Allowlist пуст. Сначала: node scripts/ui-v4-check-literal-lock-tests.mjs --update-allowlist');
    printList(report);
    return;
  }

  const { newFindings, resolved } = compareAllowlist(report.findings, allowlist);
  printList(report);
  if (newFindings.length) {
    console.error(`\n❌ Новые literal-lock находки вне allowlist: ${newFindings.length}`);
    for (const f of newFindings.slice(0, 10)) {
      console.error(`  ${f.file}:${f.line} [${f.kind}] ${f.snippet}`);
    }
    if (newFindings.length > 10) console.error(`  … ещё ${newFindings.length - 10}`);
    process.exitCode = 1;
  } else {
    console.log(`\nВ пределах allowlist (${allowlist.findings.length} заморожено).`);
  }
  if (resolved.length) {
    console.log(
      `Долг уменьшился: ${resolved.length} записей allowlist больше не находятся — обновите --update-allowlist.`,
    );
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) runCli();
