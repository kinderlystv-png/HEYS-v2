import fs from 'node:fs';
import path from 'node:path';

/** Injected row prefix — scripts must not delete or mutate these outside their scope. */
export const GUARD_FOREIGN_PREFIX = '__verdict_guard_foreign__';

const SAFE_BASENAMES = new Set(['ui-v4-set-verdict.mjs']);

const EXCLUDE_BASENAMES = new Set([
  'ui-v4-verdicts.mjs',
  'agent-commit-guards.test.mjs',
]);

const EXCLUDE_BASENAME_PATTERNS = [
  /selftest/i,
  /-extract-q\.mjs$/,
  /-diff-/,
  /-audit-sample/,
  /-check-rhythm/,
  /-progress-report/,
  /-check-verdict-addresses/,
  /-check-reverse-coverage/,
  /-kernel-handoff-gen/,
  /-kernel-scope-scan/,
  /-proposal-ui-handoff-gen/,
  /-finish-b3-report/,
];

/**
 * Detect scripts that write verdict zone JSON under docs/ui/verdicts/.
 * @param {string} scriptsDir
 * @returns {import('./verdict-writer-guard-runner.mjs').VerdictWriterMeta[]}
 */
export function discoverVerdictWriters(scriptsDir) {
  const writers = [];
  const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const absPath = path.join(scriptsDir, entry.name);
    const source = fs.readFileSync(absPath, 'utf8');
    const meta = classifyScript(entry.name, absPath, source);
    if (meta) writers.push(meta);
  }

  writers.sort((a, b) => a.basename.localeCompare(b.basename));
  return writers;
}

/**
 * @param {string} basename
 * @param {string} absPath
 * @param {string} source
 */
function classifyScript(basename, absPath, source) {
  if (EXCLUDE_BASENAMES.has(basename)) return null;
  if (EXCLUDE_BASENAME_PATTERNS.some((re) => re.test(basename))) return null;

  const writeKind = detectWriteKind(source, basename);
  if (!writeKind) return null;

  let zoneId = extractZoneId(source, basename);
  const staticRisks = detectStaticWholesaleRisk(source);
  const hasForeignGuard = staticRisks.includes('has-foreign-guard');
  const relPath = path.relative(path.resolve(path.dirname(absPath), '..'), absPath).replace(/\\/g, '/');

  let tier = 'HIGH';
  let skipReason = null;
  let runArgs = [];

  if (SAFE_BASENAMES.has(basename)) {
    tier = 'SAFE';
  } else if (hasForeignGuard) {
    tier = 'GUARDED';
  } else if (basename === '.sb-750-verdict-batch-apply.mjs' && /foreign rows must stay identical/i.test(source)) {
    tier = 'GUARDED';
  } else if (staticRisks.includes('rebuild-zone-rows-empty')) {
    tier = 'HIGH';
    skipReason = 'static-rebuild-zone-rows';
  } else if (basename === 'ui-v4-check-contract-drift.mjs') {
    tier = 'HIGH';
    const rehashZone = zoneId || 'strength-builder';
    runArgs = ['--rehash', rehashZone];
    zoneId = rehashZone;
  } else if (basename === 'ui-v4-import-verdicts.mjs') {
    tier = 'HIGH';
    skipReason = 'import-needs-revision-dir';
  } else if (basename === '.reports-insights-neq-audit.mjs') {
    tier = 'HIGH';
    runArgs = ['--apply'];
  } else if (basename === '.audit-neq-questionnaire-login.mjs') {
    tier = 'HIGH';
    zoneId = 'questionnaire-login';
  } else if (basename === '.sb-neq-audit.mjs' || basename === '.cycle-neq-audit.mjs') {
    return null;
  } else if (basename === '.hw-gamification-verdicts.mjs') {
    tier = 'HIGH';
    zoneId = 'gamification';
  }

  if (!zoneId && writeKind === 'writeFileSync-direct' && !skipReason) {
    skipReason = 'zone-id-unknown';
  }

  return {
    basename,
    relPath: relPath.startsWith('scripts/') ? relPath : `scripts/${basename}`,
    absPath,
    zoneId,
    writeKind,
    tier,
    staticRisks,
    hasForeignGuard,
    skipReason,
    runArgs,
    scopeKeyCount: estimateScopeKeyCount(source),
  };
}

/**
 * @param {string} source
 * @param {string} basename
 * @returns {'writeZone'|'writeFileSync-direct'|'writeFileSync-verdict-var'|null}
 */
function detectWriteKind(source, basename) {
  if (basename === 'ui-v4-check-contract-drift.mjs' && /--rehash/.test(source) && /writeZone\(zoneId/.test(source)) {
    return 'writeZone';
  }

  if (/writeFileSync\s*\([^)]*docs\/ui\/verdicts/.test(source)) {
    return 'writeFileSync-direct';
  }

  if (/writeFileSync\s*\(\s*(?:VERDICT|verdictPath)\b/.test(source)) {
    return 'writeFileSync-verdict-var';
  }

  if (/['"]docs\/ui\/verdicts['"]/.test(source) && /writeFileSync\s*\(\s*file\b/.test(source)) {
    return 'writeFileSync-verdict-var';
  }

  if (/\bwriteZone\s*\(/.test(source) && !/export function writeZone/.test(source)) {
    return 'writeZone';
  }

  if (/\bsetVerdictKey\s*\(/.test(source)) {
    return 'writeZone';
  }

  return null;
}

/**
 * @param {string} source
 * @param {string} basename
 */
export function extractZoneId(source, basename) {
  const patterns = [
    /readZone\(\s*['"]([a-z0-9-]+)['"]/,
    /writeZone\(\s*['"]([a-z0-9-]+)['"]/,
    /(?:const|let)\s+ZONE(?:_ID)?\s*=\s*['"]([a-z0-9-]+)['"]/,
    /docs\/ui\/verdicts\/([a-z0-9-]+)\.json/,
    /verdicts\/([a-z0-9-]+)\.json/,
  ];

  for (const re of patterns) {
    const match = source.match(re);
    if (match) return match[1];
  }

  if (/^\.hw-set-/.test(basename) || basename === '.hw-gamification-verdicts.mjs') return 'home-widgets';
  if (/^\.sb-/.test(basename)) return 'strength-builder';
  if (/^\.ri-/.test(basename)) return 'reports-insights';
  if (/^\.nt-/.test(basename)) return 'nutrition-tab';
  if (/^\.checkin-block-/.test(basename)) return 'checkin-morning';

  const zoneMap = {
    '.fm-set-food-meal-verdicts.mjs': 'food-meal',
    '.dr-set-night-verdicts.mjs': 'date-remainders',
    '.nc-set-verdicts.mjs': 'norm-correction',
    '.wa-set-verdicts.mjs': 'water-add',
    '.tips-close-16-verdicts.mjs': 'tips',
    '.tab-activity-neq-audit.mjs': 'tab-activity',
    '.hw-gamification-verdicts.mjs': 'gamification',
    '.audit-neq-questionnaire-login.mjs': null,
  };
  if (basename in zoneMap) return zoneMap[basename];

  return null;
}

/**
 * @param {string} source
 */
export function detectStaticWholesaleRisk(source) {
  const risks = [];
  if (/const\s+zoneRows\s*=\s*\{\}/.test(source)) risks.push('rebuild-zone-rows-empty');
  if (/for\s*\([^)]*\bgone\b[^)]*\)[^{]*\{[^}]*delete\s+zone\.rows/.test(source)) {
    risks.push('rehash-delete-gone-rows');
  }
  if (/beforeForeign|foreignViolations|foreign key mutation blocked|assertForeignRowsUnchanged/.test(source)) {
    risks.push('has-foreign-guard');
  }
  if (/simulateWholesaleRowWipe|runPreFixBrokenApply/.test(source)) risks.push('test-helper-only');
  return risks;
}

/**
 * Rough count of explicit scope keys in ITEMS / CONTRACT / maps.
 * @param {string} source
 */
function estimateScopeKeyCount(source) {
  const keys = new Set();
  const tupleRe = /\[\s*['"]([^'"]{3,})['"]\s*,/g;
  let m;
  while ((m = tupleRe.exec(source)) !== null) keys.add(m[1]);
  const mapKeyRe = /^\s*['"]([^'"]{3,})['"]\s*:/gm;
  while ((m = mapKeyRe.exec(source)) !== null) {
    if (!/\.(mjs|css|js|json|html|md):/.test(m[1])) keys.add(m[1]);
  }
  return keys.size;
}

/**
 * @param {import('./verdict-writer-guard-runner.mjs').VerdictWriterMeta[]} writers
 */
export function summarizeDiscovery(writers) {
  const byTier = {};
  for (const w of writers) {
    byTier[w.tier] = (byTier[w.tier] || 0) + 1;
  }
  return {
    total: writers.length,
    byTier,
    highRisk: writers.filter((w) => w.tier === 'HIGH'),
    safe: writers.filter((w) => w.tier === 'SAFE'),
    guarded: writers.filter((w) => w.tier === 'GUARDED'),
  };
}
