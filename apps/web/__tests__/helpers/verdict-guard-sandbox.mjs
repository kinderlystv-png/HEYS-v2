import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Isolated verdicts directory for guard tests — never writes docs/ui/verdicts/.
 *
 * @param {string} root Repo root (for copy-from-live source paths).
 * @param {Record<string, object|'copy-from-live'>} zones Zone id → fixture object or live copy.
 */
export function createVerdictGuardSandbox(root, zones) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-verdict-guard-'));
  const verdictsDir = path.join(sandboxRoot, 'verdicts');
  fs.mkdirSync(verdictsDir, { recursive: true });

  for (const [zoneId, zoneData] of Object.entries(zones)) {
    const dest = path.join(verdictsDir, `${zoneId}.json`);
    if (zoneData === 'copy-from-live') {
      const live = path.join(root, 'docs/ui/verdicts', `${zoneId}.json`);
      if (!fs.existsSync(live)) {
        throw new Error(`live zone missing for sandbox copy: ${zoneId}.json`);
      }
      fs.copyFileSync(live, dest);
    } else {
      fs.writeFileSync(dest, `${JSON.stringify(zoneData, null, 2)}\n`, 'utf8');
    }
  }

  return {
    verdictsDir,
    zonePath(zoneId) {
      return path.join(verdictsDir, `${zoneId}.json`);
    },
    guardEnv() {
      return {
        HEYS_VERDICT_GUARD_TEST: '1',
        HEYS_VERDICTS_DIR: verdictsDir,
        NODE_NO_WARNINGS: '1',
      };
    },
    cleanup() {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    },
  };
}

/** Bust Node ESM cache so ui-v4-verdicts.mjs re-reads HEYS_VERDICTS_DIR. */
export function importCacheBust() {
  return `?heysVerdictGuard=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * @param {string} scriptPath
 * @param {string[]} args
 * @param {{ cwd: string, env?: Record<string, string>, timeoutMs?: number }} options
 */
export function runGuardNodeScript(scriptPath, args, { cwd, env: extraEnv = {}, timeoutMs = 180_000 }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
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
