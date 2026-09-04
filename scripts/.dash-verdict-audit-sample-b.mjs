#!/usr/bin/env node
// Sample B: independent audit of 50 «—» verdicts (no verdict file changes).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const VERDICTS_DIR = path.join(ROOT, 'docs/ui/verdicts');
const OUT_JSON = path.join(ROOT, 'scripts/.dash-verdict-audit-sample-b-report.json');
const OUT_MD = path.join(ROOT, 'scripts/.dash-verdict-audit-sample-b-report.md');

// Sample B zones — avoid strength-builder, cycle, home-widgets/tips/login (other strip pools).
const SAMPLE_ZONES = [
  'food-meal',
  'tab-activity',
  'checkin-morning',
  'nutrition-tab',
  'water-add',
  'spinners',
  'app-splash',
  'product-card',
  'pwa-update',
  'norm-correction',
];
const OFFSET = 2;
const STRIDE = 5;
const PER_ZONE = 5;

const META_KEY_RE =
  /^(экран|границы|источник|демо|адресация|палитры|номера видов|фича|цвета не из палитры|две вкладки|срок черновика)/i;
const WHY_STRONG_RE =
  /канвас|демо|protocol|адресац|границ|foreign|handoff|платформ|декорац|designer-removed|разметк|к коду не свод|в продукте отсутств|пробел канваса|чужая зон|вне границ|оболочк|обвязк|не про код|служебн|оглавлен|ответственност|data-demo|data-screen|design_handoff|не рисует|не задаёт/i;
const WHY_WEAK_RE = /^(то же|нет|не про код|—)$/i;
const CSS_PROP_RE =
  /\b(font|padding|margin|gap|width|height|border|radius|color|background|opacity|blur|line-height|font-size|font-weight|letter-spacing|box-shadow|transform)\s*[:=]/i;
const CLASS_RE = /(?:\.([a-zA-Z][\w-]*)|class="([^"]+)")/g;

function contractRows(html, contractOnly) {
  let slice = html;
  if (contractOnly) {
    const m = html.match(
      /<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/,
    );
    if (!m) return [];
    slice = m[1];
  }
  const rows = new Map();
  for (const m of slice.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.set(m[1], m[2]);
  }
  return rows;
}

function rgCount(pattern, glob = 'apps/web') {
  try {
    const out = execSync(`rg -l "${pattern.replace(/"/g, '\\"')}" "${path.join(ROOT, glob)}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.trim() ? out.trim().split('\n').length : 0;
  } catch {
    return 0;
  }
}

function rgFirst(pattern, glob = 'apps/web') {
  try {
    const out = execSync(`rg -m 1 -n "${pattern.replace(/"/g, '\\"')}" "${path.join(ROOT, glob)}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

function extractClasses(text) {
  const classes = new Set();
  let m;
  const re = CLASS_RE;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) classes.add(m[1]);
    if (m[2]) m[2].split(/\s+/).forEach((c) => c && classes.add(c));
  }
  return [...classes].filter((c) => !c.startsWith('v4-') && c.length > 2);
}

function fExplainsWhy(f, naKind, key) {
  if (naKind) return { ok: true, note: `naKind=${naKind}` };
  if (META_KEY_RE.test(key)) return { ok: true, note: 'meta-key' };
  if (f && WHY_STRONG_RE.test(f)) return { ok: true, note: 'f has explicit why' };
  if (!f || f.length < 12 || WHY_WEAK_RE.test(f.trim())) return { ok: false, note: 'vague or missing why' };
  if (/файл|\.css|\.js|:\d+/.test(f)) return { ok: true, note: 'f cites code location' };
  return { ok: f.length >= 40, note: f.length >= 40 ? 'f long enough' : 'short f without meta keywords' };
}

function checkProductRule(contractValue, key) {
  const hits = [];
  const classes = extractClasses(contractValue);
  for (const cls of classes.slice(0, 6)) {
    const cssHit = rgFirst(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'apps/web/styles');
    const jsHit = rgFirst(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|['"]${cls}['"]`, 'apps/web');
    if (cssHit) hits.push({ type: 'css', cls, line: cssHit });
    else if (jsHit) hits.push({ type: 'js', cls, line: jsHit });
  }
  const hasCssProps = CSS_PROP_RE.test(contractValue);
  const quoted = [...contractValue.matchAll(/«([^»]{3,40})»/g)].map((m) => m[1]);
  for (const q of quoted.slice(0, 3)) {
    const hit = rgFirst(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'apps/web');
    if (hit) hits.push({ type: 'copy', text: q, line: hit });
  }
  return { hits, hasCssProps, classes };
}

function classify(row, contractValue, whyCheck, productCheck) {
  const { f, naKind, key, zone } = row;
  const isMetaKey = META_KEY_RE.test(key);
  const isProtocol =
    /protocol|data-demo="protocol"/i.test(f || '') || /data-demo="protocol"/i.test(contractValue || '');
  const isAddressing = /адресац/i.test(f || '') || /адресац/i.test(contractValue || '');
  const isForeignFrame = /вне границ|чужая зон|оболочк|обвязк|декорац/i.test(f || '');
  const isDesignerRemoved = naKind === 'designer-removed' || /снята|designer-removed/i.test(f || '');
  const isCanvasGap = /пробел канваса|не сказан|нужен/i.test(f || '');

  // MISPLACED: product rules found AND f does not explain why dash is still right
  const productHits = productCheck.hits.filter((h) => h.type === 'css');
  if (
    productHits.length > 0 &&
    productCheck.hasCssProps &&
    !isMetaKey &&
    !isProtocol &&
    !isAddressing &&
    !isForeignFrame &&
    !isDesignerRemoved &&
    !isCanvasGap
  ) {
    return {
      classification: 'MISPLACED',
      reason: `Contract has CSS props and product rules exist (${productHits.map((h) => h.cls).join(', ')})`,
    };
  }

  // STALE: f says absent but code found — only if f claims absence
  if (
    /нет в (коде|продукте|apps\/web)|отсутствует в продукте|не рисует/i.test(f || '') &&
    productCheck.hits.length > 0 &&
    !isProtocol &&
    !isDesignerRemoved
  ) {
    return {
      classification: 'MISPLACED',
      reason: `f claims absence but product code found: ${productCheck.hits[0].line}`,
    };
  }

  if (!whyCheck.ok && !isMetaKey && !naKind) {
    return { classification: 'WEAK', reason: whyCheck.note };
  }

  if (
    isMetaKey ||
    isProtocol ||
    isAddressing ||
    isForeignFrame ||
    isDesignerRemoved ||
    isCanvasGap ||
    naKind ||
    whyCheck.ok
  ) {
    return {
      classification: 'CONFIRMED',
      reason: [
        isMetaKey && 'meta-key',
        isProtocol && 'protocol frame',
        isAddressing && 'frame addressing',
        isForeignFrame && 'foreign frame/shell',
        isDesignerRemoved && 'designer-removed',
        isCanvasGap && 'canvas gap note',
        naKind && `naKind=${naKind}`,
        whyCheck.ok && whyCheck.note,
      ]
        .filter(Boolean)
        .join('; '),
    };
  }

  return { classification: 'WEAK', reason: 'dash plausible but f thin' };
}

function selectSamples() {
  const samples = [];
  for (const zone of SAMPLE_ZONES) {
    const file = path.join(VERDICTS_DIR, `${zone}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const dashKeys = Object.entries(data.rows)
      .filter(([, v]) => v.v === '—')
      .map(([k]) => k)
      .sort();
    for (let i = 0; i < PER_ZONE; i++) {
      const idx = OFFSET + i * STRIDE;
      if (idx >= dashKeys.length) continue;
      const key = dashKeys[idx];
      samples.push({
        zone,
        key,
        canvas: data.canvas,
        contractOnly: data.contractOnly ?? false,
        ...data.rows[key],
      });
    }
  }
  return samples;
}

function zoneInventory() {
  const files = fs.readdirSync(VERDICTS_DIR).filter((f) => f.endsWith('.json'));
  const counts = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(VERDICTS_DIR, f), 'utf8'));
    let dash = 0;
    let total = 0;
    for (const [, v] of Object.entries(data.rows || {})) {
      if (v && typeof v === 'object' && 'v' in v) {
        total++;
        if (v.v === '—') dash++;
      }
    }
    counts.push({ zone: f.replace('.json', ''), dash, total });
  }
  counts.sort((a, b) => b.dash - a.dash);
  return counts;
}

function main() {
  const inventory = zoneInventory();
  const samples = selectSamples();
  const canvasCache = new Map();

  const audited = samples.map((row, i) => {
    const cacheKey = row.canvas;
    if (!canvasCache.has(cacheKey)) {
      const htmlPath = path.join(PACK, row.canvas);
      const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
      canvasCache.set(cacheKey, contractRows(html, row.contractOnly));
    }
    const contractMap = canvasCache.get(cacheKey);
    const contractValue = contractMap.get(row.key) ?? '(key not in canvas contract)';

    const whyCheck = fExplainsWhy(row.f, row.naKind, row.key);
    const productCheck = checkProductRule(contractValue, row.key);
    const { classification, reason } = classify(row, contractValue, whyCheck, productCheck);

    return {
      n: i + 1,
      zone: row.zone,
      key: row.key,
      v: '—',
      f: row.f,
      naKind: row.naKind || null,
      contractValue: contractValue.length > 200 ? contractValue.slice(0, 197) + '…' : contractValue,
      checks: {
        fExplainsWhy: whyCheck,
        productRule: {
          classesFound: productCheck.classes,
          hits: productCheck.hits.slice(0, 4),
          hasCssProps: productCheck.hasCssProps,
        },
      },
      classification,
      reason,
    };
  });

  const summary = {
    sampleId: 'B',
    auditedAt: new Date().toISOString().slice(0, 10),
    method: `zones=${SAMPLE_ZONES.join(',')}; offset=${OFFSET}; stride=${STRIDE}; perZone=${PER_ZONE}`,
    excludedZones: ['strength-builder', 'cycle'],
    totalDashInRepo: inventory.reduce((s, z) => s + z.dash, 0),
    zoneInventory: inventory,
    zonesInSample: SAMPLE_ZONES,
    zoneCountsInSample: SAMPLE_ZONES.map((z) => ({
      zone: z,
      count: audited.filter((r) => r.zone === z).length,
    })),
    rowKeys: audited.map((r) => `${r.zone}::${r.key}`),
    counts: {
      total: audited.length,
      CONFIRMED: audited.filter((r) => r.classification === 'CONFIRMED').length,
      MISPLACED: audited.filter((r) => r.classification === 'MISPLACED').length,
      WEAK: audited.filter((r) => r.classification === 'WEAK').length,
    },
    rows: audited,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md = [];
  md.push('# Dash verdict audit — Sample B');
  md.push('');
  md.push(`**Date:** ${summary.auditedAt}`);
  md.push(`**Method:** ${summary.method}`);
  md.push(`**Excluded:** ${summary.excludedZones.join(', ')}`);
  md.push(`**Total — in repo:** ${summary.totalDashInRepo}`);
  md.push('');
  md.push('## Zones in sample');
  md.push('');
  md.push('| Zone | Rows in sample | Total — in zone |');
  md.push('|------|----------------|-----------------|');
  for (const zc of summary.zoneCountsInSample) {
    const inv = inventory.find((z) => z.zone === zc.zone);
    md.push(`| ${zc.zone} | ${zc.count} | ${inv?.dash ?? '?'} |`);
  }
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`| Metric | Count |`);
  md.push(`|--------|------:|`);
  md.push(`| Audited | ${summary.counts.total} |`);
  md.push(`| CONFIRMED | ${summary.counts.CONFIRMED} |`);
  md.push(`| MISPLACED | ${summary.counts.MISPLACED} |`);
  md.push(`| WEAK | ${summary.counts.WEAK} |`);
  md.push('');
  const misplaced = audited.filter((r) => r.classification === 'MISPLACED');
  const weak = audited.filter((r) => r.classification === 'WEAK');
  if (misplaced.length) {
    md.push('## MISPLACED examples');
    md.push('');
    for (const r of misplaced) {
      md.push(`- **${r.zone} · ${r.key}** — ${r.reason}`);
      md.push(`  - f: ${r.f.slice(0, 120)}`);
    }
    md.push('');
  }
  if (weak.length) {
    md.push('## WEAK examples');
    md.push('');
    for (const r of weak) {
      md.push(`- **${r.zone} · ${r.key}** — ${r.reason}`);
      md.push(`  - f: ${r.f.slice(0, 120)}`);
    }
    md.push('');
  }
  md.push('## Full table');
  md.push('');
  md.push('| # | Zone | Key | Class | Why check | Product hits |');
  md.push('|---|------|-----|-------|-----------|--------------|');
  for (const r of audited) {
    const hits = r.checks.productRule.hits.map((h) => h.line?.slice(0, 50) || h.cls).join('; ') || '—';
    md.push(
      `| ${r.n} | ${r.zone} | ${r.key.replace(/\|/g, '\\|')} | ${r.classification} | ${r.checks.fExplainsWhy.ok ? 'OK' : 'WEAK'} | ${hits.replace(/\|/g, '\\|').slice(0, 80)} |`,
    );
  }
  md.push('');
  md.push('## Row keys (deconflict)');
  md.push('');
  md.push('```');
  summary.rowKeys.forEach((k) => md.push(k));
  md.push('```');

  fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');

  console.log(JSON.stringify(summary.counts, null, 2));
  console.log('Wrote', OUT_JSON);
  console.log('Wrote', OUT_MD);
}

main();
