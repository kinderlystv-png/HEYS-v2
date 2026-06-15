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

  // Regression 2026-06-15: PIN-сессии всегда били в curator-RPC → 401.
  // Причина — решение isCurator читало флаги lastIsCuratorAuth/lastIsPinAuth,
  // которые НИКОГДА не выставлялись (мертвы с a08ca222) → всегда true.
  it('routes the write-context RPC by real auth mode, not dead flags', () => {
    // Мёртвые флаги больше не читаются в коде (упоминание в комментарии ок).
    expect(source).not.toContain('global.HEYS?.lastIsCuratorAuth');
    expect(source).not.toContain('global.HEYS?.lastIsPinAuth');
    // Решение опирается на авторитетный module-state isPinAuthClient().
    expect(source).toMatch(/const isCurator = !cloud\.isPinAuthClient\?\.\(\)/);
  });
});
