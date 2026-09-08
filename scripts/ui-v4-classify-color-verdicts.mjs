#!/usr/bin/env node
/**
 * Extended color verdict audit — classify contract rows into four buckets.
 *
 *   node scripts/ui-v4-classify-color-verdicts.mjs
 *   node scripts/ui-v4-classify-color-verdicts.mjs --json
 *   node scripts/ui-v4-classify-color-verdicts.mjs --eye-check
 *   node scripts/ui-v4-classify-color-verdicts.mjs --weak-sand
 *   node scripts/ui-v4-classify-color-verdicts.mjs --exclude=home-widgets,reports-insights
 *
 * Buckets:
 *   (a) color of element visible on dark palettes — needs sand+dark computed measure
 *   (b) color of element NOT shown on dark palettes at all
 *   (c) names role, no value to measure — declared in all sets or roles gate covers it
 *   (d) not about color — keyword false positive (copy-text, geometry, line refs)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAllZones, VERDICTS_DIR } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE = path.join(ROOT, 'apps/web/styles/modules/002-ui-v4-palette-roles.css');

/** Strong color candidacy — tuned to ~773 rows in 28 editable zones (parent est. ~801). */
export const COLOR_CANDIDATE =
  /\b(цвет|чернил|фон|заливк|background(?:-color)?|(?:^|[\s,{;])color\b|fill|stroke|border-color|акцент|--v4-(?:ink|act|hero|c1|c2|surface|card|ok|bad|warn|fab|btn|tint|accent|good|gr|sand|blue|water|line|track|edge|on-act|on-fab|on-ok|btn-on-act)|--c[12]|--acs|--gr|rgba?\(|#[0-9a-f]{3,8})\b/i;

const COPY_TEXT =
  /копия текста|копия кадра стоит|опорные фразы|не цвет — вне|Текст кадра, не цвет|копия кадра найдена в коде/i;
const GEOM =
  /\b(ширин|высот|padding|margin|gap|radius|радиус|поля|отступ|flex|align|min-height|touch|геометр|space-between|font-weight|font-size|line-height|начертание|кегль|tabular|viewBox|space-between|letter-spacing|text-transform)\b/i;
const NOT_ON_DARK =
  /\b(manifest\.json|theme-color|background_color|apple-touch|единственный песочный|не зависит от палитр|palette-independent|одинаково на все|один на всех наборах|values? one on all|константы дизайна.*одни на все|не подбирает|вне color-аудита палитр|вне color-аудита)\b/i;
const MANIFEST_ZONE = new Set(['pwa-update', 'app-splash']);
const DUAL_DARK =
  /Замер chromium 375 px:[\s\S]*?тёмн\S*\s+rgb[a]?(?:\(|\/)/i;
const ROLE_REF = /var\(\s*(--v4-[a-z0-9-]+|--c[12]|--acs|--gr[a-z-]*)/i;
const LITERAL_COLOR = /(?:rgba?\([^)]+\)|#[0-9a-f]{3,8})/i;
const DECLARATION_ONLY =
  /из объявлений набора|happy-dom color пустой|002-ui-v4-palette-roles\.css:\d+|002:?\d+\+|значение то же, вердикт сохранён|роль объявлена|computed песочная\/синяя/i;
const INK_ROLE = /^--v4-ink(?:-\d+|$|-data|-30)/;
const SAME_ALL_SETS_ROLES = new Set([
  '--v4-ok-fill',
  '--v4-good',
  '--v4-warn-soft',
  '--v4-sand-act-soft',
]);
const HIGH_RISK_ROLE =
  /--v4-(?:act|hero|c1|c2|surface|card|ok-bg|ok-fill|ok-tint|accent|fab|bad|warn|btn-on-act|on-act|on-fab|on-ok|tint|sand-|blue-)/i;
const WEAK_SAND = /песочн/i;

/** Fixed eye-check set — stratified across buckets; verify before trusting totals. */
export const EYE_CHECK_SAMPLES = [
  { zoneId: 'nutrition-tab', key: 'вид чипа', expect: 'a' },
  { zoneId: 'registration', key: 'Профиль · верх · 08', expect: 'd' },
  { zoneId: 'app-splash', key: 'Сплэш · знак v4 · 01', expect: 'b' },
  { zoneId: 'checkin-morning', key: 'Чек-ин · вчерашний день · 06', expect: 'c' },
  { zoneId: 'checkin-morning', key: 'Чек-ин · день из пачки · 10', expect: 'a' },
  { zoneId: 'food-meal', key: 'Добавление · самочувствие · 17', expect: 'd' },
  { zoneId: 'subscription', key: 'Подписка · проверьте заказ · 13', expect: 'a' },
  { zoneId: 'tips', key: 'третий бокс', expect: 'a' },
  { zoneId: 'strength-builder', key: 'Конструктор · итоги · 11', expect: 'a' },
  { zoneId: 'date-remainders', key: 'вид чужого дня', expect: 'a' },
];

function loadSameAllSetsRoles() {
  const src = fs.readFileSync(PALETTE, 'utf8');
  const blocks = [...src.matchAll(/\[data-theme-id="[^"]+"\][^{]*\{([^}]+)\}/g)];
  const values = new Map();
  for (const block of blocks) {
    for (const m of block[1].matchAll(/(--v4-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      const role = m[1];
      const val = m[2].trim().replace(/\s+/g, '');
      if (!values.has(role)) values.set(role, new Set());
      values.get(role).add(val);
    }
  }
  for (const [role, vals] of values) {
    if (vals.size === 1) SAME_ALL_SETS_ROLES.add(role);
  }
  return SAME_ALL_SETS_ROLES;
}

let sameAllSetsRolesCache;

function getSameAllSetsRoles() {
  if (!sameAllSetsRolesCache) sameAllSetsRolesCache = loadSameAllSetsRoles();
  return sameAllSetsRolesCache;
}

function extractRoles(f) {
  return [...f.matchAll(/var\(\s*(--v4-[a-z0-9-]+|--c[12]|--gr[a-z-]*)/g)].map((m) => m[1]);
}

function isLineNumberFalsePositive(f) {
  if (!COLOR_CANDIDATE.test(f)) return true;
  const stripped = f
    .replace(/\b[a-z0-9_.-]+\.(?:js|mjs|css|ts|tsx):\d+(?:-\d+)?/gi, ' ')
    .replace(/\b\d{3}:\d{3,5}(?:-\d{3,5})?\b/g, ' ')
    .replace(/\b:\d{3,5}\b/g, ' ');
  return !COLOR_CANDIDATE.test(stripped) && !ROLE_REF.test(stripped);
}

function isNotAboutColor(row, f) {
  if (row?.naKind) return true;
  if (COPY_TEXT.test(f)) return true;
  if (/копия кадра/i.test(f) && !/\b(color|background|fill|фон|заливк|чернил|--v4-)\b/i.test(f)) return true;
  if (/^Геометрия, не цвет/i.test(f)) return true;
  if (GEOM.test(f) && !COLOR_CANDIDATE.test(f.replace(GEOM, ''))) return true;
  if (isLineNumberFalsePositive(f)) return true;
  if (/^[^.:]{0,80}$/.test(f) && !ROLE_REF.test(f) && !LITERAL_COLOR.test(f)) return true;
  if (/buildHeroAriaLabel|role=switch|sr-only|aria-hidden/i.test(f) && !LITERAL_COLOR.test(f)) return true;
  return false;
}

function isNotOnDark(zoneId, f) {
  if (MANIFEST_ZONE.has(zoneId) && /manifest|theme-color|background_color|icon/i.test(f)) return true;
  if (NOT_ON_DARK.test(f)) return true;
  if (/--v4-ok-fill|--v4-good|--v4-warn-soft/.test(f) && /одни на все|константы дизайна|не подбирает/i.test(f)) {
    return true;
  }
  return false;
}

function isRoleOnlyNoMeasure(f, roles) {
  if (DUAL_DARK.test(f)) return false;
  if (LITERAL_COLOR.test(f) && /Замер chromium|computed sand|computed bg|песочный rgb/i.test(f)) {
    return false;
  }
  if (DECLARATION_ONLY.test(f) && ROLE_REF.test(f)) return true;
  if (roles.length && roles.every((r) => INK_ROLE.test(r) || getSameAllSetsRoles().has(r))) {
    if (/песочн.*син|sand.*blue|002:|из объявлений/i.test(f)) return true;
    if (roles.every((r) => INK_ROLE.test(r)) && !HIGH_RISK_ROLE.test(f)) return true;
  }
  if (roles.some((r) => getSameAllSetsRoles().has(r)) && !LITERAL_COLOR.test(f) && !DUAL_DARK.test(f)) {
    return true;
  }
  if (ROLE_REF.test(f) && !LITERAL_COLOR.test(f) && !/background|color|fill|фон|заливк|чернил/i.test(f)) {
    return true;
  }
  return false;
}

function riskScore(f, roles) {
  if (HIGH_RISK_ROLE.test(f) || roles.some((r) => !INK_ROLE.test(r) && !getSameAllSetsRoles().has(r))) {
    return 1;
  }
  if (roles.some((r) => INK_ROLE.test(r))) return 3;
  return 2;
}

/**
 * @param {string} zoneId
 * @param {string} key
 * @param {{ v?: string, f?: string, naKind?: string }} row
 */
export function classifyColorVerdictRow(zoneId, key, row) {
  const f = String(row?.f || '').trim();
  if (!COLOR_CANDIDATE.test(f)) return null;

  const roles = extractRoles(f);
  let bucket;
  let reason;

  if (isNotAboutColor(row, f)) {
    bucket = 'd';
    reason = 'not-color';
  } else if (isNotOnDark(zoneId, f)) {
    bucket = 'b';
    reason = 'not-on-dark';
  } else if (isRoleOnlyNoMeasure(f, roles)) {
    bucket = 'c';
    reason = 'role-only';
  } else {
    bucket = 'a';
    reason = DUAL_DARK.test(f) ? 'measured' : 'needs-measure';
  }

  return {
    zoneId,
    key,
    v: row?.v,
    bucket,
    reason,
    measured: DUAL_DARK.test(f),
    risk: bucket === 'a' ? riskScore(f, roles) : null,
    roles,
    fPreview: f.slice(0, 120) + (f.length > 120 ? '…' : ''),
  };
}

/**
 * @param {{ zones?: Record<string, { rows?: Record<string, object> }> }} data
 * @param {{ excludeZones?: Set<string> }} [options]
 */
export function classifyColorVerdicts(data, options = {}) {
  const exclude = options.excludeZones || new Set();
  const buckets = { a: 0, b: 0, c: 0, d: 0 };
  const byZone = {};
  const rows = [];
  const openA = [];
  const weakSand = [];

  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (exclude.has(zoneId)) continue;
    byZone[zoneId] = { a: 0, b: 0, c: 0, d: 0, total: 0 };

    for (const [key, row] of Object.entries(zone?.rows || {})) {
      const item = classifyColorVerdictRow(zoneId, key, row);
      if (!item) continue;

      buckets[item.bucket] += 1;
      byZone[zoneId][item.bucket] += 1;
      byZone[zoneId].total += 1;
      rows.push(item);

      if (item.bucket === 'a' && !item.measured) openA.push(item);
      if (WEAK_SAND.test(String(row?.f || '')) && COLOR_CANDIDATE.test(String(row?.f || ''))) {
        weakSand.push(item);
      }
    }
  }

  openA.sort((x, y) => (x.risk || 9) - (y.risk || 9));

  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({ buckets, byZone: Object.fromEntries(Object.entries(byZone).sort()) }))
    .digest('hex')
    .slice(0, 16);

  return {
    buckets,
    total: buckets.a + buckets.b + buckets.c + buckets.d,
    byZone,
    openA,
    weakSand,
    rows,
    digest,
  };
}

export function runEyeCheck(report, data) {
  const results = [];
  for (const sample of EYE_CHECK_SAMPLES) {
    const row = data?.zones?.[sample.zoneId]?.rows?.[sample.key];
    const item = row ? classifyColorVerdictRow(sample.zoneId, sample.key, row) : null;
    const got = item?.bucket || 'missing';
    results.push({
      ...sample,
      got,
      pass: got === sample.expect,
      reason: item?.reason || 'row-not-found-or-not-candidate',
    });
  }
  return results;
}

function parseExclude(argv) {
  const raw = (argv.find((a) => a.startsWith('--exclude=')) || '').slice('--exclude='.length);
  if (!raw) return new Set(['home-widgets', 'reports-insights', 'settings-system', 'curator-edits']);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function runCli() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const eyeCheck = argv.includes('--eye-check');
  const weakSandOnly = argv.includes('--weak-sand');
  const highRiskOnly = argv.includes('--high-risk');
  const exclude = parseExclude(argv);

  const data = readAllZones();
  const report = classifyColorVerdicts(data, { excludeZones: exclude });

  if (highRiskOnly) {
    const rows = report.openA.filter((r) => r.risk === 1);
    const payload = { highRiskOpen: rows.length, rows };
    process.stdout.write(`${JSON.stringify(asJson ? payload : { highRiskOpen: rows.length, rows: rows.length }, null, 2)}\n`);
    return;
  }

  if (weakSandOnly) {
    const c = report.weakSand.filter((r) => r.bucket === 'c').length;
    const open = report.weakSand.filter((r) => r.bucket === 'a' && !r.measured).length;
    const payload = {
      weakSandTotal: report.weakSand.length,
      bucketC: c,
      unfinishedA: open,
      other: report.weakSand.length - c - open,
      rows: report.weakSand,
    };
    process.stdout.write(`${JSON.stringify(asJson ? payload : { ...payload, rows: payload.rows.length }, null, 2)}\n`);
    return;
  }

  if (eyeCheck) {
    const checks = runEyeCheck(report, data);
    const failed = checks.filter((c) => !c.pass);
    for (const c of checks) {
      console.log(`${c.pass ? 'PASS' : 'FAIL'} (${c.expect}) ${c.zoneId} · ${c.key} → ${c.got} (${c.reason})`);
    }
    console.log(`\nEye-check: ${checks.length - failed.length}/${checks.length} pass`);
    if (failed.length) process.exitCode = 1;
    return;
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  console.log(
    `Color verdicts (${[...exclude].join(', ') || 'none'} excluded): ${report.total} candidates`,
  );
  console.log(
    `(a) visible dark ${report.buckets.a} · (b) not on dark ${report.buckets.b} · ` +
      `(c) role-only ${report.buckets.c} · (d) not color ${report.buckets.d} · digest ${report.digest}`,
  );
  console.log(
    `Bucket (a): measured ${report.rows.filter((r) => r.bucket === 'a' && r.measured).length}, ` +
      `open ${report.openA.length}`,
  );
  console.log(`Weak «песочная» color rows: ${report.weakSand.length}`);

  const top = Object.entries(report.byZone)
    .sort((a, b) => b[1].a - a[1].a)
    .slice(0, 8);
  console.log('\nTop zones by open bucket (a):');
  for (const [zoneId, z] of top) {
    if (!z.a) continue;
    console.log(`  ${zoneId}: a=${z.a} b=${z.b} c=${z.c} d=${z.d}`);
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
