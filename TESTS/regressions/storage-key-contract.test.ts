import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { LEGACY_BUNDLES } from '../../scripts/legacy-bundle-config.mjs';

const contractPath = path.resolve(process.cwd(), 'apps/web/heys_storage_key_contract_v1.js');
const contractSource = readFileSync(contractPath, 'utf8');

function loadContract() {
  const window: Record<string, unknown> = { HEYS: {} };
  const context = vm.createContext({ window, globalThis: window });
  vm.runInContext(contractSource, context, { filename: contractPath });
  return (window.HEYS as { storageKeyContract: Record<string, (...args: unknown[]) => unknown> })
    .storageKeyContract;
}

describe('storage key contract', () => {
  const ownId = '11111111-1111-4111-8111-111111111111';
  const foreignId = '22222222-2222-4222-8222-222222222222';

  it('normalizes repeated client scopes without losing the original owners', () => {
    const contract = loadContract();
    const result = contract.stripClientScopePrefixes(
      `heys_${ownId}_${foreignId}_profile`,
    ) as { key: string; strippedClientIds: string[] };

    expect(result).toEqual({
      key: 'heys_profile',
      strippedClientIds: [ownId, foreignId],
    });
  });

  it('rejects foreign ownership and recognizes scoped auth keys', () => {
    const contract = loadContract();

    expect(contract.isForeignClientScopedKey(`heys_${foreignId}_profile`, ownId)).toBe(true);
    expect(contract.isForeignClientScopedKey(`heys_${ownId}_profile`, ownId)).toBe(false);
    expect(contract.isSensitiveSessionStorageKey(`heys_${ownId}_session_token`)).toBe(true);
    expect(contract.isSensitiveSessionStorageKey(`heys_${ownId}_profile`)).toBe(false);
  });

  it('loads before the storage bridge and keeps manual exports off initial boot', () => {
    const bootCore = LEGACY_BUNDLES['boot-core'];
    const lazyUi = LEGACY_BUNDLES['postboot-3-ui-lazy'];

    expect(bootCore.indexOf('heys_storage_key_contract_v1.js')).toBeGreaterThanOrEqual(0);
    expect(bootCore.indexOf('heys_storage_key_contract_v1.js'))
      .toBeLessThan(bootCore.indexOf('heys_storage_supabase_v1.js'));
    expect(bootCore).not.toContain('heys_export_utils_v1.js');
    expect(bootCore).not.toContain('heys_shared_products_export_fields_v1.js');
    expect(lazyUi).toContain('heys_export_utils_v1.js');
    expect(lazyUi).toContain('heys_shared_products_export_fields_v1.js');
  });
});
