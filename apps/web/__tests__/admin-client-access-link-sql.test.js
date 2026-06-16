import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../../database/2026-06-16_admin_get_client_access_link.sql'),
  'utf8'
);

describe('admin_get_client_access_link SQL contract', () => {
  it('is curator-only, fail-closed, and does not expose expired links', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_get_client_access_link/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/p_curator_id IS NULL OR v_client\.curator_id IS DISTINCT FROM p_curator_id/);
    expect(sql).toMatch(/v_client\.pin_token_expires_at IS NOT NULL AND v_client\.pin_token_expires_at < NOW\(\)/);
    expect(sql).toMatch(/'link_available', false/);
    expect(sql).toMatch(/'reason', 'token_expired'/);
    expect(sql).toMatch(/'deep_link'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_get_client_access_link\(UUID, UUID\) FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_get_client_access_link\(UUID, UUID\) TO heys_rpc/);
  });
});
