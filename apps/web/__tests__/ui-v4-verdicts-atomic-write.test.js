/**
 * Parallel etalon writers must never leave a half-written zone JSON on disk,
 * and concurrent read-modify-write on different keys must not lose updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it, afterEach } from 'vitest';

import {
  createVerdictGuardSandbox,
  importCacheBust,
  runGuardNodeScript,
} from './helpers/verdict-guard-sandbox.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ZONE_ID = 'atomic-write-parallel';
const KEY_A = 'writer-a · key';
const KEY_B = 'writer-b · key';
const SET_VERDICT = path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs');
const RMW_DELAY_MS = 25;
const RACE_ITERATIONS = 30;
const LOCKED_RACE_ITERATIONS = 15;

function fixtureZone() {
  return {
    zoneId: ZONE_ID,
    rows: {
      [KEY_A]: { v: '?', f: 'pending a', h: 'hash-a' },
      [KEY_B]: { v: '?', f: 'pending b', h: 'hash-b' },
    },
  };
}

function bothWritersApplied(zone) {
  return zone.rows[KEY_A]?.v === '=' && zone.rows[KEY_B]?.v === '=';
}

function resetSandboxZone(sandbox) {
  fs.writeFileSync(
    sandbox.zonePath(ZONE_ID),
    `${JSON.stringify(fixtureZone(), null, 2)}\n`,
    'utf8',
  );
  for (const file of fs.readdirSync(sandbox.verdictsDir)) {
    if (file.endsWith('.write.lock')) {
      fs.unlinkSync(path.join(sandbox.verdictsDir, file));
    }
  }
}

async function runParallelWriters(sandbox, extraEnv = {}) {
  const env = { ...sandbox.guardEnv(), ...extraEnv };
  const [runA, runB] = await Promise.all([
    runGuardNodeScript(SET_VERDICT, [ZONE_ID, KEY_A, '=', 'fact from writer a'], { cwd: ROOT, env }),
    runGuardNodeScript(SET_VERDICT, [ZONE_ID, KEY_B, '=', 'fact from writer b'], { cwd: ROOT, env }),
  ]);
  expect(runA.code, runA.stderr || runA.stdout).toBe(0);
  expect(runB.code, runB.stderr || runB.stdout).toBe(0);
  return JSON.parse(fs.readFileSync(sandbox.zonePath(ZONE_ID), 'utf8'));
}

describe('ui-v4 verdict zone atomic write', () => {
  let sandbox;

  afterEach(() => {
    sandbox?.cleanup();
    sandbox = null;
    delete process.env.HEYS_VERDICT_GUARD_TEST;
    delete process.env.HEYS_VERDICTS_DIR;
    delete process.env.HEYS_VERDICT_DISABLE_ZONE_LOCK;
    delete process.env.HEYS_VERDICT_RMW_DELAY_MS;
  });

  it('parallel setVerdictKey runs leave parseable JSON with both writer keys', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });
    const zone = await runParallelWriters(sandbox);

    expect(zone.rows[KEY_A]).toBeTruthy();
    expect(zone.rows[KEY_B]).toBeTruthy();
    expect(zone.rows[KEY_A].v).toBe('=');
    expect(zone.rows[KEY_B].v).toBe('=');
  });

  it('parallel in-process setVerdictKey calls keep JSON parseable with both keys', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });
    process.env.HEYS_VERDICT_GUARD_TEST = '1';
    process.env.HEYS_VERDICTS_DIR = sandbox.verdictsDir;

    const libUrl = `${pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href}${importCacheBust()}`;
    const { setVerdictKey } = await import(libUrl);

    await Promise.all([
      Promise.resolve().then(() => setVerdictKey(ZONE_ID, KEY_A, { verdict: '=', fact: 'fact a', options: {} })),
      Promise.resolve().then(() => setVerdictKey(ZONE_ID, KEY_B, { verdict: '=', fact: 'fact b', options: {} })),
    ]);

    const raw = fs.readFileSync(sandbox.zonePath(ZONE_ID), 'utf8');
    const zone = JSON.parse(raw);

    expect(zone.rows[KEY_A]).toBeTruthy();
    expect(zone.rows[KEY_B]).toBeTruthy();
    expect(zone.rows[KEY_A].v).toBe('=');
    expect(zone.rows[KEY_B].v).toBe('=');
  });

  it('without zone lock, parallel RMW on different keys can lose an update', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });
    let lossCount = 0;

    for (let i = 0; i < RACE_ITERATIONS; i += 1) {
      resetSandboxZone(sandbox);
      const zone = await runParallelWriters(sandbox, {
        HEYS_VERDICT_DISABLE_ZONE_LOCK: '1',
        HEYS_VERDICT_RMW_DELAY_MS: String(RMW_DELAY_MS),
      });
      if (!bothWritersApplied(zone)) lossCount += 1;
    }

    expect(lossCount).toBeGreaterThan(0);
  }, 30_000);

  it('with zone lock, repeated parallel writers always keep both keys', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });

    for (let i = 0; i < LOCKED_RACE_ITERATIONS; i += 1) {
      resetSandboxZone(sandbox);
      const zone = await runParallelWriters(sandbox, {
        HEYS_VERDICT_RMW_DELAY_MS: String(RMW_DELAY_MS),
      });
      expect(bothWritersApplied(zone), `iteration ${i}`).toBe(true);
    }
  }, 30_000);
});
