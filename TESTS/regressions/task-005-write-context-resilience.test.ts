import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_storage_supabase_v1.js'),
  'utf8',
);

describe('TASK-005: write-context upload resilience', () => {
  it('preserves captured _ctx when grouping RPC upload batches by client', () => {
    expect(source).toMatch(/byClientId\[cid\]\.push\(\{[^}]*_ctx:\s*item\._ctx[^}]*\}\)/s);
  });

  it('bounds issue_write_context RPC calls with an explicit timeout', () => {
    expect(source).toContain('const WRITE_CONTEXT_ISSUE_TIMEOUT_MS = 5000');
    expect(source).toMatch(/raceWithTimeout\(\s*api\.rpc\('issue_write_context_by_curator'/s);
    expect(source).toMatch(/raceWithTimeout\(\s*api\.rpc\('issue_write_context_by_session'/s);
    expect(source).toContain('write_context_issue_timeout');
  });

  it('does not let required-context uploads silently proceed without context', () => {
    expect(source).toContain('ensureWriteContextForUpload');
    expect(source).toContain('!contextState.itemsHaveContext');
    expect(source).toContain("return { success: false, error: 'write_context_unavailable' }");
    expect(source).toContain("global.dispatchEvent(new CustomEvent('heys:sync-error'");
  });
});
