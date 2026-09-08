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
// Окно между свежим чтением зоны и записью. Прежде оно стояло 25 мс и потеря не
// воспроизводилась — но дело было не в ширине, а в МЕСТЕ: задержка вставлялась
// до writeZoneRowMutation, а он перечитывает зону перед записью и окно закрывал
// сам. Расширение до 800 мс не помогло ровно поэтому. Теперь задержка внутри
// мутации, и 200 мс с запасом перекрывают разброс старта двух процессов node.
const RMW_DELAY_MS = 200;
const RACE_ITERATIONS = 20;
const LOCKED_RACE_ITERATIONS = 12;
const RACE_MIN_COMPLETED = 5;

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

async function runParallelWriters(sandbox, extraEnv = {}, { requireSuccess = true } = {}) {
  const env = { ...sandbox.guardEnv(), ...extraEnv };
  const [runA, runB] = await Promise.all([
    runGuardNodeScript(SET_VERDICT, [ZONE_ID, KEY_A, '=', 'fact from writer a'], { cwd: ROOT, env }),
    runGuardNodeScript(SET_VERDICT, [ZONE_ID, KEY_B, '=', 'fact from writer b'], { cwd: ROOT, env }),
  ]);
  if (runA.code !== 0 || runB.code !== 0) {
    if (requireSuccess) {
      expect(runA.code, runA.stderr || runA.stdout).toBe(0);
      expect(runB.code, runB.stderr || runB.stdout).toBe(0);
    }
    return { completed: false, runA, runB };
  }
  let zone;
  try {
    zone = JSON.parse(fs.readFileSync(sandbox.zonePath(ZONE_ID), 'utf8'));
  } catch {
    if (requireSuccess) throw new Error('zone JSON not parseable after parallel writers');
    return { completed: false, runA, runB };
  }
  return { completed: true, zone, runA, runB };
}

describe('ui-v4 verdict zone atomic write', () => {
  let sandbox;

  afterEach(() => {
    sandbox?.cleanup();
    sandbox = null;
    delete process.env.HEYS_VERDICT_GUARD_TEST;
    delete process.env.HEYS_VERDICTS_DIR;
    delete process.env.HEYS_VERDICT_DISABLE_ZONE_LOCK;
    delete process.env.HEYS_VERDICT_DISABLE_WRITE_STAMP_GUARD;
    delete process.env.HEYS_VERDICT_RMW_DELAY_MS;
  });

  it('parallel setVerdictKey runs leave parseable JSON with both writer keys', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });
    const { completed, zone } = await runParallelWriters(sandbox);
    expect(completed).toBe(true);

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

  it('without zone lock or stamp guard, parallel RMW on different keys can lose an update', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });
    let lossCount = 0;
    let completedCount = 0;

    for (let i = 0; i < RACE_ITERATIONS; i += 1) {
      resetSandboxZone(sandbox);
      const result = await runParallelWriters(
        sandbox,
        {
          HEYS_VERDICT_DISABLE_ZONE_LOCK: '1',
          HEYS_VERDICT_DISABLE_WRITE_STAMP_GUARD: '1',
          HEYS_VERDICT_RMW_DELAY_MS: String(RMW_DELAY_MS),
        },
        { requireSuccess: false },
      );
      if (!result.completed) continue;
      completedCount += 1;
      if (!bothWritersApplied(result.zone)) lossCount += 1;
      if (lossCount > 0 && completedCount >= RACE_MIN_COMPLETED) break;
    }

    expect(completedCount).toBeGreaterThan(RACE_MIN_COMPLETED - 1);
    expect(lossCount).toBeGreaterThan(0);
  }, 45_000);

  it('in-process stamp guard without zone lock merges concurrent key updates', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });
    process.env.HEYS_VERDICT_GUARD_TEST = '1';
    process.env.HEYS_VERDICTS_DIR = sandbox.verdictsDir;
    process.env.HEYS_VERDICT_DISABLE_ZONE_LOCK = '1';
    process.env.HEYS_VERDICT_RMW_DELAY_MS = String(RMW_DELAY_MS);

    const libUrl = `${pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href}${importCacheBust()}`;
    const { setVerdictKey } = await import(libUrl);

    await Promise.all([
      Promise.resolve().then(() => setVerdictKey(ZONE_ID, KEY_A, { verdict: '=', fact: 'fact a', options: {} })),
      Promise.resolve().then(() => setVerdictKey(ZONE_ID, KEY_B, { verdict: '=', fact: 'fact b', options: {} })),
    ]);

    const zone = JSON.parse(fs.readFileSync(sandbox.zonePath(ZONE_ID), 'utf8'));
    expect(bothWritersApplied(zone)).toBe(true);
  });

  it('with zone lock, repeated parallel writers always keep both keys', async () => {
    sandbox = createVerdictGuardSandbox(ROOT, { [ZONE_ID]: fixtureZone() });

    for (let i = 0; i < LOCKED_RACE_ITERATIONS; i += 1) {
      resetSandboxZone(sandbox);
      const { completed, zone } = await runParallelWriters(sandbox, {
        HEYS_VERDICT_RMW_DELAY_MS: String(RMW_DELAY_MS),
      });
      expect(completed, `iteration ${i}`).toBe(true);
      expect(bothWritersApplied(zone), `iteration ${i}`).toBe(true);
    }
  }, 45_000);
});
