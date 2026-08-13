import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

function loadStorageModule() {
  if (typeof window.addEventListener !== 'function') window.addEventListener = vi.fn();
  if (typeof window.removeEventListener !== 'function') window.removeEventListener = vi.fn();
  if (typeof global.addEventListener !== 'function') global.addEventListener = window.addEventListener;
  if (typeof global.removeEventListener !== 'function') global.removeEventListener = window.removeEventListener;
  for (const file of [
    '../heys_pending_queue_pure_v1.js',
    '../heys_sync_queue_runtime_pure_v1.js',
    '../heys_write_context_health_v1.js',
    '../heys_storage_key_contract_v1.js',
  ]) {
    eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
  }
  eval(fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8'));
}

function setupCloud(rpcImpl) {
  localStorage.clear();
  localStorage.setItem('heys_pin_auth_client', 'client-1');
  localStorage.setItem('heys_client_current', 'client-1');
  localStorage.setItem('heys_session_token', JSON.stringify('session-token-1'));
  const yandexApi = { rpc: vi.fn(rpcImpl) };
  window.HEYS = {
    YandexAPI: yandexApi,
    cloud: {},
    models: {
      computeProductFingerprint: vi.fn(async () => 'fp-1'),
      normalizeProductName: vi.fn((name) => String(name || '').toLowerCase().trim()),
    },
  };
  global.YandexAPI = yandexApi;
  loadStorageModule();
}

describe('createPendingProduct RPC unwrap contract', () => {
  const storageSource = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');
  const cloudSharedSource = fs.readFileSync(path.resolve(__dirname, '../heys_cloud_shared_v1.js'), 'utf8');

  it('unwraps create_pending_product_by_session and avoids fail-open pending fallback', () => {
    const block = storageSource.slice(
      storageSource.indexOf('cloud.createPendingProduct = async function'),
      storageSource.indexOf('cloud.createPendingSharedProductChange = async function'),
    );
    expect(block).toContain('data?.create_pending_product_by_session ?? data');
    expect(block).toContain('status: inner?.status');
    expect(block).not.toMatch(/status:\s*data\?\.status\s*\|\|\s*'pending'/);
  });

  it('keeps extracted cloud_shared in sync with the same unwrap pattern', () => {
    const block = cloudSharedSource.slice(
      cloudSharedSource.indexOf('cloud.createPendingProduct = async function'),
      cloudSharedSource.indexOf('cloud.createPendingSharedProductChange = async function'),
    );
    expect(block).toContain('data?.create_pending_product_by_session ?? data');
    expect(block).toContain('status: inner?.status');
    expect(block).not.toMatch(/status:\s*data\?\.status\s*\|\|\s*'pending'/);
  });
});

describe('createPendingProduct runtime unwrap', () => {
  beforeEach(() => {
    global.window = window;
    global.document = window.document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete global.YandexAPI;
    window.HEYS = originalHEYS;
  });

  it('returns exists from wrapped RPC response without masquerading as pending', async () => {
    setupCloud(async () => ({
      data: {
        create_pending_product_by_session: {
          status: 'exists',
          message: 'Product already in shared base',
        },
      },
      error: null,
    }));

    const result = await window.HEYS.cloud.createPendingProduct('client-1', { name: 'Молокo 3.2' });

    expect(result.status).toBe('exists');
    expect(result.message).toBe('Product already in shared base');
    expect(result.error).toBeNull();
  });

  it('returns pending_dup from wrapped RPC response', async () => {
    setupCloud(async () => ({
      data: {
        create_pending_product_by_session: {
          status: 'pending_dup',
          message: 'Duplicate pending request',
        },
      },
      error: null,
    }));

    const result = await window.HEYS.cloud.createPendingProduct('client-1', { name: 'Test Product' });

    expect(result.status).toBe('pending_dup');
    expect(result.message).toBe('Duplicate pending request');
  });

  it('does not default missing status to pending', async () => {
    setupCloud(async () => ({
      data: { create_pending_product_by_session: { message: 'no status field' } },
      error: null,
    }));

    const result = await window.HEYS.cloud.createPendingProduct('client-1', { name: 'Test Product' });

    expect(result.status).toBeUndefined();
    expect(result.message).toBe('no status field');
  });

  it('returns error status from RPC transport failure', async () => {
    setupCloud(async () => ({
      data: null,
      error: { message: 'invalid_session' },
    }));

    const result = await window.HEYS.cloud.createPendingProduct('client-1', { name: 'Test Product' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('invalid_session');
  });
});
