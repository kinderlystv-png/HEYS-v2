import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const curatorProductFunctions = [
  'publish_shared_product_by_curator',
  'add_shared_product_barcode_by_curator',
  'update_shared_product_portions_by_curator',
];

describe('curator product RPC auth contract', () => {
  const apiSource = read('apps/web/heys_yandex_api_v1.js');
  const rpcSource = read('yandex-cloud-functions/heys-api-rpc/index.js');

  it('sends curator JWT for all curator-suffixed product mutations', () => {
    const curatorList = apiSource.slice(
      apiSource.indexOf('const CURATOR_ONLY_FUNCTIONS'),
      apiSource.indexOf('async function rpc')
    );
    for (const fn of curatorProductFunctions) expect(curatorList).toContain(`'${fn}'`);
  });

  it('keeps curator product mutations out of the public server allowlist', () => {
    const publicList = rpcSource.slice(
      rpcSource.indexOf('const ALLOWED_FUNCTIONS'),
      rpcSource.indexOf('const COOKIE_SESSION_TOKEN_FUNCTIONS')
    );
    const curatorList = rpcSource.slice(
      rpcSource.indexOf('const CURATOR_ONLY_FUNCTIONS'),
      rpcSource.indexOf('const CURATOR_AUDIT_SKIP')
    );
    for (const fn of curatorProductFunctions) {
      expect(publicList).not.toContain(`'${fn}'`);
      expect(curatorList).toContain(`'${fn}'`);
    }
  });

  it('retains all active web callers on the common RPC transport', () => {
    const storageSource = read('apps/web/heys_storage_supabase_v1.js');
    const extractedSource = read('apps/web/heys_cloud_shared_v1.js');
    const addProductSource = read('apps/web/heys_add_product_step_v1.js');

    expect(storageSource).toContain("YandexAPI.rpc('publish_shared_product_by_curator'");
    expect(storageSource).toContain("'add_shared_product_barcode_by_curator'");
    expect(extractedSource).toContain("YandexAPI.rpc('publish_shared_product_by_curator'");
    expect(extractedSource).toContain("'add_shared_product_barcode_by_curator'");
    expect(addProductSource).toContain("'update_shared_product_portions_by_curator'");
    expect(addProductSource).toContain('HEYS.YandexAPI.rpc(rpcFn, rpcParams)');
  });

  it('overwrites browser curator id from verified JWT before SQL dispatch', () => {
    expect(rpcSource).toContain('params.p_curator_id = curatorId');
    expect(rpcSource).toContain("jwtResult.payload?.role !== 'curator'");
  });
});
