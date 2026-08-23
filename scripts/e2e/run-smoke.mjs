#!/usr/bin/env node
/**
 * Agent entrypoint: bootstrap E2E env (idempotent) → Playwright smoke → summary.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import { E2E_REPO_ROOT } from './psql-exec.mjs';
import { formatSecretsActionBlock, hasCuratorSecrets, printSecretsActionBlock } from './env-secrets.mjs';

loadEnv({ path: path.join(E2E_REPO_ROOT, '.env.local'), override: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_REPORT = path.join(E2E_REPO_ROOT, 'test-results-reports', 'smoke-last.json');
let smokePlaywrightStartedAt = 0;

function ensureJsonReportDir() {
  fs.mkdirSync(path.dirname(JSON_REPORT), { recursive: true });
}

function run(cmd, args, label, extraEnv = {}) {
  console.log(`\n[e2e:smoke] ${label}`);
  const result = spawnSync(cmd, args, {
    cwd: E2E_REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`[e2e:smoke] FAILED at: ${label}`);
    if (!hasCuratorSecrets()) {
      printSecretsActionBlock('curator smoke requires HEYS_TEST_CURATOR_*');
    }
    printSmokeSummary();
    process.exit(result.status ?? 1);
  }
}

function printSmokeSummary() {
  if (!smokePlaywrightStartedAt) return;
  if (!fs.existsSync(JSON_REPORT)) return;
  if (smokePlaywrightStartedAt) {
    const reportMtime = fs.statSync(JSON_REPORT).mtimeMs;
    if (reportMtime + 500 < smokePlaywrightStartedAt) {
      console.warn('[e2e:smoke] JSON report predates this run — skipping summary (stale artifact)');
      return;
    }
  }
  try {
    const report = JSON.parse(fs.readFileSync(JSON_REPORT, 'utf8'));
    if (smokePlaywrightStartedAt && report?.stats?.startTime) {
      const reportStart = Date.parse(report.stats.startTime);
      if (Number.isFinite(reportStart) && reportStart + 500 < smokePlaywrightStartedAt) {
        console.warn('[e2e:smoke] JSON report stats.startTime predates this run — skipping summary');
        return;
      }
    }
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const walk = (suite) => {
      for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
          const status = t.results?.[0]?.status || t.status;
          if (status === 'passed' || status === 'expected') passed += 1;
          else if (status === 'skipped') skipped += 1;
          else failed += 1;
        }
      }
      for (const child of suite.suites || []) walk(child);
    };
    for (const suite of report.suites || []) walk(suite);
    const total = passed + failed + skipped;
    console.log(
      `\n[e2e:smoke] summary: ${passed} passed, ${failed} failed, ${skipped} skipped (total ${total})`,
    );
    if (skipped > 0 && !hasCuratorSecrets()) {
      console.error(formatSecretsActionBlock('curator-login-smoke skipped — для полного прогона нужны креды'));
    }
  } catch (err) {
    console.warn('[e2e:smoke] could not parse smoke JSON report:', err.message);
  }
}

run('node', [path.join(__dirname, 'setup.mjs')], 'bootstrap (setup.mjs)');

ensureJsonReportDir();
smokePlaywrightStartedAt = Date.now();
run(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.smoke.config.ts', '--reporter=list,json'],
  'playwright smoke suite',
  { PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_REPORT },
);

printSmokeSummary();

if (!hasCuratorSecrets()) {
  console.error(formatSecretsActionBlock('curator-login-smoke skipped — для 4/4 заполни креды'));
}
