/**
 * Stale handoff must not downgrade a fresher live «=» to «≠».
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('sb-750 batch apply stale handoff guard', () => {
  it('does not apply stale «≠» over fresher live «=»', async () => {
    const zonePath = path.join(ROOT, 'docs/ui/verdicts/strength-builder.json');
    const backup = path.join(os.tmpdir(), `heys-sb-stale-test-${process.pid}.json`);
    fs.copyFileSync(zonePath, backup);

    const staleKey = 'Программа · цикл · 01';
    const handoffPath = path.join(os.tmpdir(), `heys-sb-stale-handoff-${process.pid}.json`);
    fs.writeFileSync(
      handoffPath,
      JSON.stringify({
        rows: [{
          key: staleKey,
          recommend: '≠',
          h: 'stale-handoff-hash',
          fDraft: 'stale neq-audit handoff must not win',
        }],
      }),
      'utf8',
    );

    try {
      const { readZone, writeZone } = await import(
        pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
      );
      const { buildBatchMap, applyBatchMap } = await import(
        pathToFileURL(path.join(ROOT, 'scripts/.sb-750-verdict-batch-apply.mjs')).href
      );

      const zone = readZone('strength-builder');
      zone.rows[staleKey] = {
        ...zone.rows[staleKey],
        v: '=',
        f: 'fresh parallel lane resolved this row',
        h: 'fresh-live-hash',
      };
      writeZone('strength-builder', zone);

      const ctx = buildBatchMap([handoffPath], { withInline: false, allowDowngrade: false, log: () => {} });
      const { applied, skippedStale } = applyBatchMap(ctx.batchMap, { allowDowngrade: false });

      expect(applied).toBe(0);
      expect(skippedStale).toBe(1);

      const after = readZone('strength-builder').rows[staleKey];
      expect(after.v).toBe('=');
      expect(after.f).toBe('fresh parallel lane resolved this row');
    } finally {
      fs.copyFileSync(backup, zonePath);
      fs.unlinkSync(backup);
      fs.unlinkSync(handoffPath);
    }
  });
});
