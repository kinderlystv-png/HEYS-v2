import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectForeignViolations,
  formatForeignViolations,
  snapshotForeignRowStrings,
} from './handoff-apply-foreign-guard.mjs';
import {
  GUARD_FOREIGN_PREFIX,
  detectStaticWholesaleRisk,
} from './verdict-writer-discovery.mjs';

/**
 * @typedef {object} VerdictWriterMeta
 * @property {string} basename
 * @property {string} relPath
 * @property {string} absPath
 * @property {string|null} zoneId
 * @property {string} writeKind
 * @property {'SAFE'|'GUARDED'|'HIGH'} tier
 * @property {string[]} staticRisks
 * @property {boolean} hasForeignGuard
 * @property {string|null} skipReason
 * @property {string[]} runArgs
 * @property {number} scopeKeyCount
 */

/**
 * @typedef {object} WriterGuardResult
 * @property {VerdictWriterMeta} writer
 * @property {'pass'|'fail'|'skip'|'error'} status
 * @property {string} [detail]
 * @property {ReturnType<typeof collectForeignViolations>} [violations]
 * @property {number} [exitCode]
 */

const FOREIGN_ROW_TEMPLATE = Object.freeze({
  alpha: {
    v: '=',
    f: 'VERDICT_GUARD_INJECTED_FOREIGN_ALPHA_MUST_STAY_BYTE_IDENTICAL',
    h: 'guardalpha001',
  },
  beta: {
    v: '≠',
    f: 'VERDICT_GUARD_INJECTED_FOREIGN_BETA_MUST_STAY_BYTE_IDENTICAL',
    h: 'guardbeta002',
    reasonCode: 'canvas-conflict',
    decisionRef: 'docs/ui/UI_V4_HANDOFF_CODEX.md:1',
  },
});

/**
 * @returns {string[]}
 */
export function guardForeignKeys() {
  return [
    `${GUARD_FOREIGN_PREFIX}alpha`,
    `${GUARD_FOREIGN_PREFIX}beta`,
  ];
}

/**
 * @param {Record<string, unknown>} rows
 */
export function injectGuardForeignRows(rows) {
  const keys = guardForeignKeys();
  rows[keys[0]] = JSON.parse(JSON.stringify(FOREIGN_ROW_TEMPLATE.alpha));
  rows[keys[1]] = JSON.parse(JSON.stringify(FOREIGN_ROW_TEMPLATE.beta));
  return new Set(keys);
}

/**
 * @param {string} root
 * @param {string} zoneId
 */
export function zoneFilePath(root, zoneId) {
  return path.join(root, 'docs/ui/verdicts', `${zoneId}.json`);
}

/**
 * @param {string} scriptPath
 * @param {string[]} args
 * @param {{ cwd: string, timeoutMs?: number }} options
 */
export function runNodeScript(scriptPath, args, { cwd, timeoutMs = 180_000 }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        HEYS_VERDICT_GUARD_TEST: '1',
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : (code ?? 1),
        signal,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

/**
 * @param {string} root
 * @param {VerdictWriterMeta} writer
 * @returns {Promise<WriterGuardResult>}
 */
export async function testVerdictWriterForeignGuard(root, writer) {
  if (writer.tier === 'SAFE') {
    return testSafeSetVerdictCli(root, writer);
  }

  if (writer.skipReason === 'static-rebuild-zone-rows') {
    return {
      writer,
      status: 'fail',
      detail: 'static: rebuilds zone.rows from empty object without merging existing keys',
      violations: guardForeignKeys().map((key) => ({
        key,
        kind: 'deleted',
        before: JSON.stringify(FOREIGN_ROW_TEMPLATE.alpha),
      })),
    };
  }

  if (writer.skipReason === 'import-needs-revision-dir') {
    const source = fs.readFileSync(writer.absPath, 'utf8');
    const risks = detectStaticWholesaleRisk(source);
    if (risks.includes('rebuild-zone-rows-empty')) {
      return {
        writer,
        status: 'fail',
        detail: 'static: ui-v4-import-verdicts rebuilds rows from contract only (wholesale)',
      };
    }
    return { writer, status: 'skip', detail: writer.skipReason };
  }

  if (!writer.zoneId) {
    return { writer, status: 'skip', detail: writer.skipReason || 'zone-id-unknown' };
  }

  const zonePath = zoneFilePath(root, writer.zoneId);
  if (!fs.existsSync(zonePath)) {
    return { writer, status: 'skip', detail: `zone file missing: ${writer.zoneId}.json` };
  }

  const backupPath = path.join(os.tmpdir(), `heys-verdict-guard-${process.pid}-${writer.zoneId}.json`);
  fs.copyFileSync(zonePath, backupPath);

  try {
    const zone = JSON.parse(fs.readFileSync(zonePath, 'utf8'));
    if (!zone.rows || typeof zone.rows !== 'object') {
      return { writer, status: 'skip', detail: 'zone has no rows object' };
    }

    const injectedKeys = injectGuardForeignRows(zone.rows);
    const beforeSnap = snapshotForeignRowStrings(zone.rows, injectedKeys);
    fs.writeFileSync(zonePath, `${JSON.stringify(zone, null, 2)}\n`, 'utf8');

    const run = await runNodeScript(writer.absPath, writer.runArgs || [], { cwd: root });

    if (run.timedOut) {
      return { writer, status: 'error', detail: 'subprocess timeout', exitCode: run.code };
    }

    if (!fs.existsSync(zonePath)) {
      return {
        writer,
        status: 'fail',
        detail: `zone file deleted (exit ${run.code})`,
        violations: [...beforeSnap.entries()].map(([key, before]) => ({ key, kind: 'deleted', before })),
        exitCode: run.code,
      };
    }

    const afterZone = JSON.parse(fs.readFileSync(zonePath, 'utf8'));
    const violations = collectForeignViolations(beforeSnap, afterZone.rows || {});

    if (violations.length) {
      return {
        writer,
        status: 'fail',
        detail: formatForeignViolations(violations),
        violations,
        exitCode: run.code,
      };
    }

    if (run.code !== 0) {
      return {
        writer,
        status: 'pass',
        detail: `foreign rows preserved (script exited ${run.code}: ${truncate(run.stderr || run.stdout, 120)})`,
        exitCode: run.code,
      };
    }

    return { writer, status: 'pass', detail: 'foreign rows byte-identical', exitCode: 0 };
  } finally {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, zonePath);
      fs.unlinkSync(backupPath);
    }
  }
}

/**
 * ui-v4-set-verdict.mjs — single-key CLI safe reference.
 * @param {string} root
 * @param {VerdictWriterMeta} writer
 */
async function testSafeSetVerdictCli(root, writer) {
  const zoneId = 'strength-builder';
  const zonePath = zoneFilePath(root, zoneId);
  const backupPath = path.join(os.tmpdir(), `heys-verdict-guard-safe-${process.pid}.json`);
  fs.copyFileSync(zonePath, backupPath);

  const targetKey = `${GUARD_FOREIGN_PREFIX}safe-target`;
  const foreignKey = `${GUARD_FOREIGN_PREFIX}safe-foreign`;

  try {
    const zone = JSON.parse(fs.readFileSync(zonePath, 'utf8'));
    zone.rows[targetKey] = { v: '?', f: 'before safe cli', h: 'safetarget01' };
    zone.rows[foreignKey] = JSON.parse(JSON.stringify(FOREIGN_ROW_TEMPLATE.alpha));
    const beforeForeign = JSON.stringify(zone.rows[foreignKey]);
    fs.writeFileSync(zonePath, `${JSON.stringify(zone, null, 2)}\n`, 'utf8');

    const script = path.join(root, 'scripts/ui-v4-set-verdict.mjs');
    const run = await runNodeScript(
      script,
      [zoneId, targetKey, '=', 'safe cli applied fact'],
      { cwd: root },
    );

    const afterZone = JSON.parse(fs.readFileSync(zonePath, 'utf8'));
    const foreignAfter = JSON.stringify(afterZone.rows[foreignKey]);
    const targetAfter = JSON.stringify(afterZone.rows[targetKey]);

    if (foreignAfter !== beforeForeign) {
      return {
        writer,
        status: 'fail',
        detail: `safe CLI mutated foreign row: ${beforeForeign} → ${foreignAfter}`,
      };
    }
    if (run.code !== 0) {
      return { writer, status: 'error', detail: `exit ${run.code}: ${truncate(run.stderr, 200)}` };
    }
    if (!targetAfter.includes('safe cli applied fact')) {
      return { writer, status: 'fail', detail: 'target key was not updated' };
    }
    return { writer, status: 'pass', detail: 'single-key CLI preserves foreign rows' };
  } finally {
    fs.copyFileSync(backupPath, zonePath);
    fs.unlinkSync(backupPath);
  }
}

/**
 * @param {string} text
 * @param {number} max
 */
function truncate(text, max) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

/**
 * @param {string} root
 * @param {VerdictWriterMeta[]} writers
 */
export async function runAllWriterGuards(root, writers) {
  const results = [];
  for (const writer of writers) {
    results.push(await testVerdictWriterForeignGuard(root, writer));
  }
  return results;
}

/**
 * @param {WriterGuardResult[]} results
 */
export function formatGuardReport(results) {
  const passed = results.filter((r) => r.status === 'pass');
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip');
  const errors = results.filter((r) => r.status === 'error');

  const lines = [
    `Pass: ${passed.length}`,
    `Fail: ${failed.length}`,
    `Skip: ${skipped.length}`,
    `Error: ${errors.length}`,
  ];
  if (passed.length) lines.push(`Passed scripts: ${passed.map((r) => r.writer.basename).join(', ')}`);
  if (failed.length) lines.push(`Failed scripts: ${failed.map((r) => r.writer.basename).join(', ')}`);
  if (skipped.length) {
    lines.push(`Skipped scripts: ${skipped.map((r) => `${r.writer.basename} (${r.detail})`).join('; ')}`);
  }
  if (errors.length) lines.push(`Error scripts: ${errors.map((r) => `${r.writer.basename} (${r.detail})`).join('; ')}`);

  return { passed, failed, skipped, errors, text: lines.join('\n') };
}
