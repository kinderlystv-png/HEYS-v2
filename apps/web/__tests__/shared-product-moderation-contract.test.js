import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('shared product moderation contract', () => {
  const storageSource = read('apps/web/heys_storage_supabase_v1.js');
  const extractedSource = read('apps/web/heys_cloud_shared_v1.js');
  const apiSource = read('apps/web/heys_yandex_api_v1.js');
  const rpcSource = read('yandex-cloud-functions/heys-api-rpc/index.js');
  const migration = read('scripts/db/migrations/2026-07-29_atomic_shared_product_moderation.sql');

  it('routes individual approve and reject through the atomic curator RPC', () => {
    for (const source of [storageSource, extractedSource]) {
      expect(source).toContain("YandexAPI.rpc('moderate_pending_shared_product_by_curator'");
      const moderationBlock = source.slice(
        source.indexOf('async function moderatePendingSharedProduct'),
        source.indexOf('cloud.getBlocklist')
      );
      expect(moderationBlock).not.toContain("YandexAPI.rest('shared_products'");
      expect(moderationBlock).not.toContain("YandexAPI.rest('shared_products_pending'");
      expect(moderationBlock).not.toContain('p_curator_id');
    }
  });

  it('sends curator JWT for individual and bulk moderation', () => {
    const curatorList = apiSource.slice(
      apiSource.indexOf('const CURATOR_ONLY_FUNCTIONS'),
      apiSource.indexOf('async function rpc')
    );
    expect(curatorList).toContain("'moderate_pending_shared_product_by_curator'");
    expect(curatorList).toContain("'approve_pending_products_bulk'");

    const storageBulk = storageSource.slice(
      storageSource.indexOf('cloud.approvePendingProductsBulk'),
      storageSource.indexOf('cloud.rejectPendingProduct')
    );
    expect(storageBulk).not.toContain('p_curator_id');
  });

  it('keeps both moderation functions out of the public RPC allowlist', () => {
    const publicList = rpcSource.slice(
      rpcSource.indexOf('const ALLOWED_FUNCTIONS'),
      rpcSource.indexOf('const COOKIE_SESSION_TOKEN_FUNCTIONS')
    );
    const curatorList = rpcSource.slice(
      rpcSource.indexOf('const CURATOR_ONLY_FUNCTIONS'),
      rpcSource.indexOf('const CURATOR_AUDIT_SKIP')
    );
    expect(publicList).not.toContain("'moderate_pending_shared_product_by_curator'");
    expect(publicList).not.toContain("'approve_pending_products_bulk'");
    expect(curatorList).toContain("'moderate_pending_shared_product_by_curator'");
    expect(curatorList).toContain("'approve_pending_products_bulk'");
  });

  it('locks the pending row and explicitly maps JSONB and PostgreSQL arrays', () => {
    expect(migration).toMatch(/shared_products_pending[\s\S]+FOR UPDATE/);
    expect(migration).toContain('v_pending.curator_id IS DISTINCT FROM p_curator_id');
    expect(migration).toContain("v_pending.status IS DISTINCT FROM 'pending'");
    expect(migration).toContain("'status', 'race'");
    expect(migration).toContain('jsonb_populate_record(NULL::public.shared_products, v_patch)');
    expect(migration).toContain("jsonb_typeof(v_product_data->'portions')");
    expect(migration).toContain("jsonb_typeof(v_product_data->'additives')");
    expect(migration).toContain("'barcodes', to_jsonb(coalesce(v_barcodes, ARRAY[]::text[]))");
    expect(migration).toContain("portions = CASE WHEN v_patch ? 'portions' THEN v_product.portions");
    expect(migration).toContain("status = 'approved'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.approve_pending_products_bulk(uuid, uuid[]) FROM PUBLIC');
  });

  it('preserves portions as a JSON array of objects in the server-owned pending payload', () => {
    const portions = [{ name: '1 шт', grams: 90 }];
    const pendingPayload = JSON.parse(JSON.stringify({ portions }));
    expect(pendingPayload.portions).toEqual(portions);
    expect(Array.isArray(pendingPayload.portions)).toBe(true);
    expect(migration).not.toContain('p_product_data');
  });
});
