/**
 * Handoff re-run must not overwrite rows settled later (h mismatch or v≠?).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE_ZONE = 'test-handoff-fixture';
const FIXTURE_PATH = path.join(ROOT, 'docs/ui/verdicts', `${FIXTURE_ZONE}.json`);

const libUrl = pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href;

function fixtureZone(rows) {
  return {
    zoneId: FIXTURE_ZONE,
    rows,
  };
}

describe('verdict handoff idempotent guard', () => {
  let shouldSkipStaleHandoff;
  let setVerdictKey;
  let readZone;
  let STALE_HANDOFF_SKIP_MESSAGE;

  beforeEach(async () => {
    const lib = await import(libUrl);
    shouldSkipStaleHandoff = lib.shouldSkipStaleHandoff;
    setVerdictKey = lib.setVerdictKey;
    readZone = lib.readZone;
    STALE_HANDOFF_SKIP_MESSAGE = lib.STALE_HANDOFF_SKIP_MESSAGE;

    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(
      FIXTURE_PATH,
      `${JSON.stringify(
        fixtureZone({
          'строка · 01': {
            v: '=',
            f: 'fresh parallel lane',
            h: 'fresh-hash-001',
          },
          'строка · 02': {
            v: '?',
            f: 'pending',
            h: 'pending-hash',
          },
          'строка · 03': {
            v: '=',
            f: 'already settled',
            h: 'settled-a',
          },
          'строка · 04': {
            v: '=',
            f: 'idempotent target',
            h: 'same-hash',
          },
        }),
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH);
  });

  it('shouldSkipStaleHandoff skips settled row when handoff h differs', () => {
    const guard = shouldSkipStaleHandoff(
      { v: '=', f: 'fresh', h: 'fresh-hash-001' },
      '≠',
      { handoff: true, handoffH: 'old-hash-999' },
    );
    expect(guard.skip).toBe(true);
    expect(guard.reason).toBe('row-settled-later');
    expect(guard.message).toBe(STALE_HANDOFF_SKIP_MESSAGE);
  });

  it('setVerdictKey leaves settled row unchanged when handoff h is stale', () => {
    const result = setVerdictKey(
      FIXTURE_ZONE,
      'строка · 01',
      {
        verdict: '≠',
        fact: 'stale neq-audit handoff must not win',
        options: {
          'reason-code': 'canvas-conflict',
          'decision-ref': 'docs/ui/UI_V4_FINDINGS.md:1',
        },
      },
      { handoff: true, handoffH: 'old-hash-999' },
    );

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('row-settled-later');
    expect(result.message).toBe('строка уже сведена позже, пропущена');

    const row = readZone(FIXTURE_ZONE).rows['строка · 01'];
    expect(row.v).toBe('=');
    expect(row.f).toBe('fresh parallel lane');
    expect(row.h).toBe('fresh-hash-001');
  });

  it('setVerdictKey applies handoff to unsettled «?» row', () => {
    const result = setVerdictKey(
      FIXTURE_ZONE,
      'строка · 02',
      { verdict: '=', fact: 'handoff resolved row', options: {} },
      { handoff: true, handoffH: 'pending-hash' },
    );

    expect(result.skipped).toBe(false);
    const row = readZone(FIXTURE_ZONE).rows['строка · 02'];
    expect(row.v).toBe('=');
    expect(row.f).toBe('handoff resolved row');
  });

  it('повторный прогон не меняет ни одной строки и считает skip', () => {
    const keys = ['строка · 01', 'строка · 03', 'строка · 04'];
    const handoffPayloads = [
      ['строка · 01', '≠', 'stale one', 'old-hash-999'],
      ['строка · 03', '=', 'stale two', 'settled-b-stale'],
      ['строка · 04', '=', 'stale three', 'same-hash-stale'],
    ];

    let applied = 0;
    let skipped = 0;

    for (const [key, verdict, fact, handoffH] of handoffPayloads) {
      const result = setVerdictKey(
        FIXTURE_ZONE,
        key,
        { verdict, fact, options: {} },
        { handoff: true, handoffH },
      );
      if (result.skipped) skipped += 1;
      else applied += 1;
    }

    expect(applied).toBe(0);
    expect(skipped).toBe(3);

    for (const key of keys) {
      const before = key === 'строка · 01'
        ? { v: '=', f: 'fresh parallel lane', h: 'fresh-hash-001' }
        : key === 'строка · 03'
          ? { v: '=', f: 'already settled', h: 'settled-a' }
          : { v: '=', f: 'idempotent target', h: 'same-hash' };
      const row = readZone(FIXTURE_ZONE).rows[key];
      expect(row.v).toBe(before.v);
      expect(row.f).toBe(before.f);
      expect(row.h).toBe(before.h);
    }
  });

  it('matching handoff h allows idempotent re-apply on settled row', () => {
    const result = setVerdictKey(
      FIXTURE_ZONE,
      'строка · 04',
      { verdict: '=', fact: 'updated fact same snapshot', options: {} },
      { handoff: true, handoffH: 'same-hash' },
    );

    expect(result.skipped).toBe(false);
    expect(readZone(FIXTURE_ZONE).rows['строка · 04'].f).toBe('updated fact same snapshot');
  });
});
