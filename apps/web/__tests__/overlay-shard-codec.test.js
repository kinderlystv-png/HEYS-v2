// @vitest-environment node

import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');

function loadCodec() {
  const source = fs.readFileSync(path.join(webDir, 'heys_overlay_shard_codec_v1.js'), 'utf8');
  const context = { console };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'heys_overlay_shard_codec_v1.js' });
  return context.HEYS.OverlayShardCodec;
}

const codec = loadCodec();

function makeRows(count, payloadSize = 1400) {
  return Array.from({ length: count }, (_, index) => ({
    id: `product-${index}`,
    name: `Product ${index}`,
    notes: String(index).padEnd(payloadSize, 'x'),
    kcal100: index,
  }));
}

describe('versioned product overlay shards', () => {
  it('keeps hashes stable after jsonb reorders object keys', () => {
    expect(codec.hashRows([{ id: 'p1', nested: { z: 2, a: 1 } }])).toBe(
      codec.hashRows([{ nested: { a: 1, z: 2 }, id: 'p1' }]),
    );
  });

  it('round-trips an overlay well above the single-RPC payload budget', () => {
    const rows = makeRows(320);
    expect(JSON.stringify(rows).length).toBeGreaterThan(400 * 1024);

    const split = codec.splitRows(rows, {
      targetBytes: 42 * 1024,
      maxShards: 17,
      generation: 'large-generation',
    });

    expect(split.ok).toBe(true);
    expect(split.shards.length).toBeGreaterThan(1);
    const assembled = codec.assemble(split.shards[0], split.shards.slice(1), split.manifest);
    expect(assembled).toMatchObject({
      ok: true,
      status: 'complete',
      shardCount: split.shards.length,
    });
    expect(assembled.rows).toEqual(rows);
  });

  it('rejects a mixed generation and recovers when the manifest arrives last', () => {
    const oldRows = makeRows(12, 600);
    const nextRows = oldRows.map((row) => ({ ...row, kcal100: row.kcal100 + 10 }));
    const oldSplit = codec.splitRows(oldRows, {
      targetBytes: 1024,
      maxShards: 17,
      generation: 'old',
    });
    const nextSplit = codec.splitRows(nextRows, {
      targetBytes: 1024,
      maxShards: 17,
      generation: 'next',
    });
    expect(oldSplit.ok && nextSplit.ok).toBe(true);

    const partiallyUploaded = oldSplit.shards.slice(1);
    partiallyUploaded[0] = nextSplit.shards[1];
    expect(codec.assemble(oldSplit.shards[0], partiallyUploaded, oldSplit.manifest)).toMatchObject({
      ok: false,
      status: 'generation_mismatch',
      generation: 'old',
    });

    expect(
      codec.assemble(nextSplit.shards[0], nextSplit.shards.slice(1), nextSplit.manifest),
    ).toMatchObject({
      ok: true,
      status: 'complete',
      rows: nextRows,
    });
  });

  it('keeps add, update and delete semantics while ignoring stale extra tails', () => {
    const firstRows = makeRows(10, 500);
    const secondRows = firstRows
      .filter((row) => !['product-2', 'product-3', 'product-5'].includes(row.id))
      .map((row) => (row.id === 'product-4' ? { ...row, name: 'Updated' } : row))
      .concat({ id: 'product-new', name: 'Added', kcal100: 55 });
    const first = codec.splitRows(firstRows, {
      targetBytes: 1024,
      maxShards: 17,
      generation: 'first',
    });
    const second = codec.splitRows(secondRows, {
      targetBytes: 1024,
      maxShards: 17,
      generation: 'second',
    });

    const assembled = codec.assemble(
      second.shards[0],
      [...second.shards.slice(1), ...first.shards.slice(second.shards.length)],
      second.manifest,
    );

    expect(assembled.ok).toBe(true);
    expect(assembled.rows.some((row) => row.id === 'product-2')).toBe(false);
    expect(assembled.rows.find((row) => row.id === 'product-4')?.name).toBe('Updated');
    expect(assembled.rows.some((row) => row.id === 'product-new')).toBe(true);
  });

  it('reads legacy array shards during migration', () => {
    expect(codec.assemble([{ id: 'main' }], [[{ id: 'tail-1' }], [{ id: 'tail-2' }]])).toEqual({
      ok: true,
      status: 'legacy',
      rows: [{ id: 'main' }, { id: 'tail-1' }, { id: 'tail-2' }],
    });
  });
});

describe('overlay shard integration contract', () => {
  const storage = fs.readFileSync(path.join(webDir, 'heys_storage_supabase_v1.js'), 'utf8');
  const core = fs.readFileSync(path.join(webDir, 'heys_core_v12.js'), 'utf8');
  const bundleConfig = fs.readFileSync(
    path.resolve(webDir, '../../scripts/legacy-bundle-config.mjs'),
    'utf8',
  );

  it('loads the codec before cloud storage and publishes the main manifest last', () => {
    expect(bundleConfig.indexOf("'heys_overlay_shard_codec_v1.js'")).toBeLessThan(
      bundleConfig.indexOf("'heys_storage_supabase_v1.js'"),
    );
    expect(storage).toContain('const split = OverlayShardCodec.splitRows(arr');
    expect(storage.indexOf('const tr = await YandexAPI.saveKV(clientId, tailKey')).toBeLessThan(
      storage.indexOf('const tm = await YandexAPI.saveKV(clientId, it.k, mainShard'),
    );
    const shardedMainIndex = storage.indexOf(
      'const tm = await YandexAPI.saveKV(clientId, it.k, mainShard',
    );
    expect(shardedMainIndex).toBeLessThan(storage.indexOf('split.manifest', shardedMainIndex));
  });

  it('fetches the full overlay family whenever the products marker changes', () => {
    expect(storage).toContain('...OVERLAY_RPC_SYNC_KEYS');
    expect(storage).toContain("key === 'heys_products_overlay_v2'");
    expect(storage).toContain('isOverlayTailRpcKey(key)');
  });

  it('publishes a single-generation manifest for the direct product commit gate', () => {
    expect(core).toContain('OverlayShardCodec?.createSingle?.(nextRows)');
    expect(core).toContain("'heys_products_overlay_v2_rpc_manifest'");
  });
});
