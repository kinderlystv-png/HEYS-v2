#!/usr/bin/env node
/**
 * Task 49a — pricing/tariff file inventory (read-only).
 *
 * Scans the repo for canonical tariff names and prices (not naive any-ruble
 * number). Classifies hits: in-gate, candidate canon, meta/quote, excluded,
 * unchecked remainder. Two discovery axes: by name (grep strings) and by
 * behavior (imports, paywall config consumers).
 *
 * Source of truth: apps/landing/src/config/pricing.ts
 *   base/Self 490, pro/Pro 7 990, proPlus/«Pro Спорт» 19 990
 *
 * Usage: node scripts/pricing-sync-inventory.mjs [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PRICING_TS = path.join(ROOT, 'apps/landing/src/config/pricing.ts');
const JSON_OUT = path.join(ROOT, 'scripts/.pricing-sync-inventory.json');

/** @typedef {'in_gate'|'candidate_canon'|'meta_quote'|'excluded'|'unchecked'} Bucket */

const GATE_REL = [
  'apps/landing/src/config/pricing.ts',
  'docs/legal/user-agreement.md',
  'apps/web/heys_paywall_v1.js',
  'apps/web/heys_subscriptions_v1.js',
  'yandex-cloud-functions/heys-api-payments/index.js',
];

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
  'TOOLS',
]);

const EXCLUDE_PATH_RE = [
  /^apps[/\\]web[/\\]public[/\\].*\.bundle\.[a-f0-9]+\.js$/,
  /^apps[/\\]web[/\\]public[/\\](boot|postboot)-.*\.js$/,
  /^\.cursor[/\\]/,
  /[/\\]pgAdmin 4[/\\]/,
  /[/\\]googleapiclient[/\\]/,
  /^playwright-report[/\\]/,
  /^security-reports[/\\]/,
  /^tmp[/\\]/,
  /^tmp-stable-pin[/\\]/,
  /^reports[/\\]performance[/\\]/,
  /^archive[/\\]root-cleanup/,
  /^ops[/\\]mcp-call/,
];

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.md', '.html', '.json', '.css',
  '.dc.html', '.txt', '.yml', '.yaml', '.sql',
]);

const BEHAVIOR_PATTERNS = [
  { id: 'import_pricing_ts', re: /from\s+['"]@\/config\/pricing['"]|from\s+['"][^'"]*config\/pricing['"]/ },
  { id: 'pricing_export', re: /\bPRICING\b|\bMARKET_CONSULTATION\b/ },
  { id: 'paywall_prices', re: /HEYS\.config\.prices/ },
  { id: 'check_pricing_sync', re: /check-pricing-sync/ },
  { id: 'plan_ids', re: /\b(base|pro|proPlus)\s*:\s*\{[^}]*price\s*:/i },
  { id: 'payments_plans', re: /\bproplus\s*:\s*\{[^}]*price\s*:/i },
  { id: 'quiz_plan', re: /planId|pricingPlan|PricingPlanId/ },
];

/** Tariff-specific names — not bare «Pro»/«Base» (CSS/code noise). */
const NAME_PATTERNS = [
  { id: 'name_self', re: /\bSelf\b(?:\s*\(?\s*490|\s*[—–-]\s*|\s+\d|\s*₽)/ },
  { id: 'name_self_plain', re: /\|\s*\*\*Self\*\*/ },
  { id: 'name_pro_tariff', re: /\|\s*\*\*Pro\*\*\s*\|/ },
  { id: 'name_pro_sport', re: /Pro\s*Спорт|«Pro\s*Спорт»/ },
  { id: 'name_pro_plus', re: /\bPro\+\b|\bproPlus\b/ },
  { id: 'name_base_legacy', re: /\|\s*\*\*Base\*\*\s*\||тариф\s+Base\b/i },
  { id: 'name_lite_solo', re: /\b(Lite|Solo)\s*\(/ },
];

/** Paths that must report stale even when bucket is meta/quote. */
const ALWAYS_REPORT_STALE = new Set([
  'docs/HEYS_BRIEF.md',
  'todo.md',
]);

const NEVER_STALE = new Set([
  'scripts/check-pricing-sync.cjs',
  'apps/landing/src/config/pricing.ts',
]);

const MARKETING_DIR_RE = /^маркетинг\//;

/** Canonical numeric prices from pricing.ts */
function readCanonical() {
  const src = fs.readFileSync(PRICING_TS, 'utf8');
  const plans = {};
  const reEntry = /(base|pro|proPlus):\s*\{\s*name:\s*'([^']+)'\s*,\s*price:\s*'([^']+)'\s*,\s*period:\s*'([^']+)'\s*\}/g;
  let m;
  while ((m = reEntry.exec(src)) !== null) {
    plans[m[1]] = {
      key: m[1],
      name: m[2],
      price: m[3],
      priceNum: Number(m[3].replace(/[\s\u00a0]/g, '')),
      period: m[4],
    };
  }
  for (const k of ['base', 'pro', 'proPlus']) {
    if (!plans[k]) throw new Error(`pricing.ts: missing "${k}"`);
  }
  return plans;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function isExcluded(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => EXCLUDE_DIR_NAMES.has(p))) return true;
  if (EXCLUDE_PATH_RE.some((re) => re.test(rel))) return true;
  if (rel.startsWith('scripts/.') && !rel.endsWith('pricing-sync-inventory.mjs')) {
    // scratch handoff json — noise, not tariff canon
    if (/scripts[/\\]\.[^/\\]+-handoff\.json$/.test(rel)) return true;
    if (/scripts[/\\]\.tmp-/.test(rel)) return true;
  }
  return false;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = toPosix(path.relative(ROOT, abs));
    if (ent.isDirectory()) {
      if (!isExcluded(rel + '/')) walkFiles(abs, out);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    const base = ent.name.toLowerCase();
    const okExt = TEXT_EXT.has(ext) || base.endsWith('.dc.html');
    if (!okExt) continue;
    if (isExcluded(rel)) continue;
    try {
      const st = fs.statSync(abs);
      if (st.size > 2_000_000) continue;
    } catch {
      continue;
    }
    out.push(rel);
  }
  return out;
}

function priceVariants(num) {
  const s = String(num);
  const spaced = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const nbsp = spaced.replace(/ /g, '\u00a0');
  return new Set([s, spaced, nbsp]);
}

function buildCanonicalPricePatterns(canonical) {
  const patterns = [];
  for (const plan of Object.values(canonical)) {
    for (const v of priceVariants(plan.priceNum)) {
      patterns.push({
        planKey: plan.key,
        planName: plan.name,
        variant: v,
        re: new RegExp(`(?<![\\d])${v.replace(/ /g, '[\\s\u00a0]?')}\\s*₽`, 'g'),
        rePlain: new RegExp(`(?<![\\d])${v.replace(/ /g, '[\\s\u00a0]?')}(?!\\s*₽)`, 'g'),
      });
    }
  }
  return patterns;
}

/** Known stale tariff price points (pre Pro-first / pre Pro Спорт rename). */
const STALE_PRICE_RE = [
  { label: 'base_1990', nums: [1990], re: /(?<![\d])1[\s\u00a0]?990\s*₽/g },
  { label: 'base_2990', nums: [2990], re: /(?<![\d])2[\s\u00a0]?990\s*₽/g },
  { label: 'pro_12990', nums: [12990], re: /(?<![\d])12[\s\u00a0]?990\s*₽/g },
  { label: 'pro_7990_old_context', nums: [7990], re: /(?<![\d])7[\s\u00a0]?990\s*₽/g },
  { label: 'proplus_14990', nums: [14990], re: /(?<![\d])14[\s\u00a0]?990\s*₽/g },
];

const META_PATH_RE = [
  /^docs[/\\]archive\//,
  /^docs[/\\]ui[/\\]verdicts\//,
  /^docs[/\\]ui[/\\]handoff-v4[/\\]canvas\//,
  /^apps[/\\]web[/\\]public[/\\]docs[/\\]v\d/,
  /COPY_VOICE_HISTORY\.md$/,
  /HEYS_BRIEF_ARCHIVED/,
  /маркетинг[/\\]29_/,
  /маркетинг[/\\]06_/,
  /маркетинг[/\\]12_/,
  /маркетинг[/\\]13_/,
];

const CANDIDATE_PATH_RE = [
  /^apps[/\\]landing\//,
  /^apps[/\\]web[/\\]heys_(paywall|subscriptions)_/,
  /^yandex-cloud-functions[/\\]heys-api-payments\//,
  /^docs[/\\]legal\//,
  /^docs[/\\]reference[/\\]systems[/\\]SUBSCRIPTION/,
  /^docs[/\\]release[/\\]/,
  /^docs[/\\]implementation[/\\].*PRICING/,
];

const META_CONTENT_RE = [
  /\b(было|ранее|старая цена|устарел|архив|конкурент|сосед|ориентир|аудит)\b/i,
  /\b(CalZen|MyFitnessPal|FatSecret|EatScan)\b/i,
  /\bLite\b|\bSolo\b/,
  /\bBase\b.*\b(1[\s\u00a0]?990|2[\s\u00a0]?990)\b/,
  /\bPro\+\b/,
  /\b12[\s\u00a0]?990\s*₽/,
  /\b14[\s\u00a0]?990\s*₽/,
];

function countMatches(re, text) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const r = new RegExp(re.source, flags);
  return [...text.matchAll(r)].length;
}

function scanFile(rel, canonical, pricePatterns) {
  const abs = path.join(ROOT, rel);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }

  const nameHits = NAME_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
  NAME_PATTERNS.forEach((p) => { p.re.lastIndex = 0; });

  const behaviorHits = BEHAVIOR_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
  BEHAVIOR_PATTERNS.forEach((p) => { p.re.lastIndex = 0; });

  const canonicalPriceHits = [];
  for (const p of pricePatterns) {
    const n = countMatches(p.re, text) + countMatches(p.rePlain, text);
    if (n > 0) canonicalPriceHits.push({ planKey: p.planKey, count: n, variant: p.variant });
  }

  const stalePriceHits = [];
  for (const s of STALE_PRICE_RE) {
    const n = countMatches(s.re, text);
    if (n > 0) stalePriceHits.push({ label: s.label, count: n });
  }

  if (rel === 'scripts/.pricing-sync-inventory.json') return null;

  const hasSignal =
    nameHits.length > 0 ||
    behaviorHits.length > 0 ||
    canonicalPriceHits.length > 0 ||
    stalePriceHits.length > 0;

  if (!hasSignal) return null;

  /** @type {Bucket} */
  let bucket = 'unchecked';
  const reasons = [];

  if (GATE_REL.includes(rel)) {
    bucket = 'in_gate';
    reasons.push('check-pricing-sync gate');
  } else if (MARKETING_DIR_RE.test(rel) && (canonicalPriceHits.length > 0 || nameHits.length > 0)) {
    bucket = 'meta_quote';
    reasons.push('marketing docs (manual sync, not gate)');
  } else if (META_PATH_RE.some((re) => re.test(rel))) {
    bucket = 'meta_quote';
    reasons.push('meta path');
  } else if (
    behaviorHits.includes('import_pricing_ts') ||
    behaviorHits.includes('paywall_prices') ||
    behaviorHits.includes('payments_plans') ||
    CANDIDATE_PATH_RE.some((re) => re.test(rel))
  ) {
    bucket = 'candidate_canon';
    reasons.push('behavior or canon path');
  }

  const metaContent = META_CONTENT_RE.some((re) => re.test(rel) || re.test(text));
  if (metaContent && bucket === 'unchecked') {
    bucket = 'meta_quote';
    reasons.push('historical/competitor content');
  }
  if (
    metaContent &&
    bucket === 'candidate_canon' &&
    !behaviorHits.includes('import_pricing_ts') &&
    !behaviorHits.includes('paywall_prices')
  ) {
    bucket = 'meta_quote';
    reasons.push('canon path but historical copy');
  }

  const staleIssues = [];
  const reportStale =
    !NEVER_STALE.has(rel) &&
    (ALWAYS_REPORT_STALE.has(rel) || (bucket !== 'meta_quote' && !rel.includes('archive')));
  if (stalePriceHits.length > 0 && reportStale) {
    for (const s of stalePriceHits) {
      if (s.label === 'pro_7990_old_context' && canonicalPriceHits.some((h) => h.planKey === 'pro')) {
        continue;
      }
      if (s.label === 'proplus_14990' && canonicalPriceHits.some((h) => h.planKey === 'proPlus')) {
        continue;
      }
      // 19 990 is current Pro Спорт — stale only alongside legacy Base/Pro+ naming
      if (s.label === 'proplus_14990' && ALWAYS_REPORT_STALE.has(rel)) {
        continue;
      }
      staleIssues.push(s.label);
    }
  }
  if (reportStale && nameHits.includes('name_base_legacy') && !nameHits.includes('name_self') && !nameHits.includes('name_self_plain')) {
    staleIssues.push('legacy_name_base');
  }
  if (reportStale && nameHits.includes('name_pro_plus') && !nameHits.includes('name_pro_sport')) {
    staleIssues.push('legacy_name_pro_plus');
  }
  if (ALWAYS_REPORT_STALE.has(rel) && !canonicalPriceHits.some((h) => h.planKey === 'base')) {
    staleIssues.push('missing_self_490');
  }
  if (ALWAYS_REPORT_STALE.has(rel) && !canonicalPriceHits.some((h) => h.planKey === 'pro')) {
    staleIssues.push('missing_pro_7990');
  }

  return {
    path: rel,
    bucket,
    reasons,
    discovery: {
      byName: nameHits,
      byBehavior: behaviorHits,
    },
    canonicalPriceHits,
    stalePriceHits,
    staleIssues,
    stale: staleIssues.length > 0,
  };
}

function summarize(entries) {
  const buckets = {
    in_gate: [],
    candidate_canon: [],
    meta_quote: [],
    excluded: [],
    unchecked: [],
  };
  for (const e of entries) buckets[e.bucket].push(e);

  const staleFiles = entries
    .filter((e) => e.stale)
    .sort((a, b) => a.path.localeCompare(b.path));

  const actionableCanon = [
    ...buckets.in_gate,
    ...buckets.candidate_canon.filter((e) => {
      if (/\.(test|spec)\.(ts|tsx|js)$/.test(e.path)) return false;
      if (e.path.includes('/design/')) return false;
      if (e.path.endsWith('DEPLOY.md')) return false;
      if (e.path === 'scripts/check-pricing-sync.cjs') return false;
      if (/bundle\.[a-f0-9]+\.js$/.test(e.path)) return false;
      return (
        e.discovery.byBehavior.includes('import_pricing_ts') ||
        e.discovery.byBehavior.includes('paywall_prices') ||
        e.discovery.byBehavior.includes('payments_plans') ||
        GATE_REL.includes(e.path)
      );
    }),
  ];

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    sourceOfTruth: toPosix(path.relative(ROOT, PRICING_TS)),
    canonical: readCanonical(),
    hypothesis: '~10 files (user)',
    counts: {
      totalWithSignals: entries.length,
      actionableCanon: actionableCanon.length,
      in_gate: buckets.in_gate.length,
      candidate_canon: buckets.candidate_canon.length,
      meta_quote: buckets.meta_quote.length,
      unchecked: buckets.unchecked.length,
      staleCanonical: staleFiles.length,
    },
    actionableCanon: actionableCanon.map((e) => e.path).sort(),
    buckets: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, v.map((e) => e.path).sort()])
    ),
    staleFiles: staleFiles.map((e) => ({
      path: e.path,
      issues: e.staleIssues,
      stalePriceHits: e.stalePriceHits,
    })),
    files: entries.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function printReport(report) {
  const c = report.canonical;
  console.log('=== Pricing / tariff inventory (read-only) ===\n');
  console.log(`Source: ${report.sourceOfTruth}`);
  console.log(
    `Canon: Self ${c.base.price} | Pro ${c.pro.price} | Pro Спорт ${c.proPlus.price} ${c.base.period}\n`
  );

  console.log('| Bucket | Count |');
  console.log('|--------|------:|');
  console.log(`| **Total with signals** | ${report.counts.totalWithSignals} |`);
  console.log(`| **Actionable canon** (gate + pricing imports) | ${report.counts.actionableCanon} |`);
  console.log(`| In gate now | ${report.counts.in_gate} |`);
  console.log(`| Candidate canon | ${report.counts.candidate_canon} |`);
  console.log(`| Meta / quote | ${report.counts.meta_quote} |`);
  console.log(`| Unchecked remainder | ${report.counts.unchecked} |`);
  console.log(`| Stale canonical (detected) | ${report.counts.staleCanonical} |`);
  console.log(
    `\nHypothesis ~10 actionable: **${report.counts.actionableCanon}** ` +
    `(broad scan ${report.counts.totalWithSignals}: gate ${report.counts.in_gate} + candidates ${report.counts.candidate_canon} + meta ${report.counts.meta_quote} + unchecked ${report.counts.unchecked})\n`
  );

  if (report.actionableCanon?.length) {
    console.log('### Actionable canon files\n');
    for (const p of report.actionableCanon) console.log(`- ${p}`);
    console.log('');
  }

  const brief = report.staleFiles.find((f) => f.path === 'docs/HEYS_BRIEF.md');
  const briefEntry = report.files?.find((f) => f.path === 'docs/HEYS_BRIEF.md');
  if (brief || briefEntry) {
    console.log('### docs/HEYS_BRIEF.md — STALE (report only, do not edit here)');
    const issues = brief?.issues ?? briefEntry?.staleIssues ?? [];
    const hits = (brief?.stalePriceHits ?? briefEntry?.stalePriceHits ?? []).map((h) => h.label);
    console.log(`  canon today: Self 490 / Pro 7 990 / Pro Спорт 19 990`);
    console.log(`  brief has: Base 1 990 / Pro 12 990 / Pro+ 19 990`);
    console.log(`  issues: ${issues.join(', ') || 'see stalePriceHits'}`);
    console.log(`  stale price hits: ${hits.join(', ') || 'n/a'}\n`);
  } else {
    console.log('### docs/HEYS_BRIEF.md — not in scan (re-check manually)\n');
  }

  if (report.staleFiles.length > 0) {
    console.log('### Stale canonical price/name files (report only)\n');
    for (const f of report.staleFiles) {
      console.log(`- ${f.path} — ${f.issues.join(', ')}`);
    }
    console.log('');
  }

  for (const [bucket, paths] of Object.entries(report.buckets)) {
    if (paths.length === 0) continue;
    console.log(`### ${bucket} (${paths.length})\n`);
    for (const p of paths) console.log(`- ${p}`);
    console.log('');
  }
}

function main() {
  const canonical = readCanonical();
  const pricePatterns = buildCanonicalPricePatterns(canonical);
  const allFiles = walkFiles(ROOT);
  const entries = [];
  for (const rel of allFiles) {
    const hit = scanFile(rel, canonical, pricePatterns);
    if (hit) entries.push(hit);
  }
  const report = summarize(entries);
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
  printReport(report);
  console.log(`JSON: ${toPosix(path.relative(ROOT, JSON_OUT))}`);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  }
}

main();
