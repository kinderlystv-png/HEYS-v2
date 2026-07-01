import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/push-safe.mjs');

describe('push-safe guardrails', () => {
  it('refuses real push pipeline without explicit confirmation', () => {
    const result = spawnSync('node', [SCRIPT_PATH, '--skip-tests'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('push:safe is deprecated');
    expect(result.stderr).toContain('pnpm push:preflight');
    expect(result.stderr).toContain('pnpm push:agent -- --confirm-push');
    expect(result.stderr).toContain('HUSKY=0 is not a normal push flow');
  });
});
