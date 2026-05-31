/**
 * Wave A: curator namespace isolation tests.
 * Plan: curried-stirring-shell.md Wave A.
 *
 * Тестирует routing decision logic interceptor'а:
 * - isCuratorNamespace(k) корректно определяет 'heys_curator__*' prefix
 * - isCuratorSession() кэширует token, инвалидируется при смене
 * - Routing decision: только (flag ON) + namespace + curator session → namespace path
 * - PIN session + namespace key → существующий routing (НЕ namespace)
 *
 * Pattern: pure JS replicas (как в client-isolation.test.js — legacy IIFE
 * не поддаётся import'у).
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Mock localStorage
// ═══════════════════════════════════════════════════════════════════════════
const createMockStorage = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
    get _store() { return store; },
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// Pure JS replicas (mirror heys_storage_supabase_v1.js Wave A implementation)
// ═══════════════════════════════════════════════════════════════════════════

function isCuratorNamespace(k) {
  if (!k || typeof k !== 'string') return false;
  return k.startsWith('heys_curator__');
}

function makeCuratorSessionDetector(mockLs) {
  let cache = null; // { token, isCurator }
  function isCuratorSession() {
    try {
      const token = mockLs.getItem('heys_supabase_auth_token');
      if (!token) {
        if (!cache || cache.token !== null) cache = { token: null, isCurator: false };
        return false;
      }
      if (cache && cache.token === token) return cache.isCurator;
      let isCurator = false;
      try {
        const parsed = JSON.parse(token);
        isCurator = !!(parsed && parsed.user && parsed.access_token);
      } catch (_) { /* invalid → false */ }
      cache = { token, isCurator };
      return isCurator;
    } catch (_) {
      return false;
    }
  }
  return { isCuratorSession, _cache: () => cache };
}

/** Replicates the early-branch decision in interceptSetItem. */
function shouldRouteToCuratorNamespace(k, flagEnabled, isCuratorSessionFn) {
  if (!flagEnabled) return false;
  if (!isCuratorNamespace(k)) return false;
  if (!isCuratorSessionFn()) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('isCuratorNamespace', () => {
  test('matches heys_curator__ prefix', () => {
    expect(isCuratorNamespace('heys_curator__theme')).toBe(true);
    expect(isCuratorNamespace('heys_curator__widget_layout_v1')).toBe(true);
    expect(isCuratorNamespace('heys_curator__a')).toBe(true);
    expect(isCuratorNamespace('heys_curator__')).toBe(true); // empty suffix still matches
  });

  test('rejects non-namespace keys', () => {
    expect(isCuratorNamespace('heys_theme')).toBe(false);
    expect(isCuratorNamespace('heys_curator_session')).toBe(false); // single _
    expect(isCuratorNamespace('heys_curator_actions_feed')).toBe(false);
    expect(isCuratorNamespace('heys_clients')).toBe(false);
    expect(isCuratorNamespace('heys_a1b2c3d4-e5f6-7890-abcd-ef1234567890_dayv2_2026-01-01')).toBe(false);
    expect(isCuratorNamespace('curator__theme')).toBe(false); // missing heys_ prefix
  });

  test('handles invalid input', () => {
    expect(isCuratorNamespace(null)).toBe(false);
    expect(isCuratorNamespace(undefined)).toBe(false);
    expect(isCuratorNamespace('')).toBe(false);
    expect(isCuratorNamespace(123)).toBe(false);
    expect(isCuratorNamespace({})).toBe(false);
  });
});

describe('isCuratorSession (cached)', () => {
  let mockLs;
  let detector;

  beforeEach(() => {
    mockLs = createMockStorage();
    detector = makeCuratorSessionDetector(mockLs);
  });

  test('returns false when no token', () => {
    expect(detector.isCuratorSession()).toBe(false);
  });

  test('returns true for valid curator token (JSON with user + access_token)', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'curator-uuid' },
      access_token: 'jwt-string-abc',
    }));
    expect(detector.isCuratorSession()).toBe(true);
  });

  test('returns false for invalid JSON in token', () => {
    mockLs.setItem('heys_supabase_auth_token', 'not-valid-json{');
    expect(detector.isCuratorSession()).toBe(false);
  });

  test('returns false for JSON without user field', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({ access_token: 'x' }));
    expect(detector.isCuratorSession()).toBe(false);
  });

  test('returns false for JSON without access_token field', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({ user: { id: 'x' } }));
    expect(detector.isCuratorSession()).toBe(false);
  });

  test('caches result — no re-parse if token identical', () => {
    const token = JSON.stringify({ user: { id: 'c1' }, access_token: 'jwt' });
    mockLs.setItem('heys_supabase_auth_token', token);
    expect(detector.isCuratorSession()).toBe(true);
    const cacheAfterFirst = detector._cache();
    expect(detector.isCuratorSession()).toBe(true);
    // Cache identity preserved (same object reference)
    expect(detector._cache()).toBe(cacheAfterFirst);
  });

  test('invalidates cache when token string changes', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'c1' }, access_token: 'jwt1',
    }));
    expect(detector.isCuratorSession()).toBe(true);

    // New token → cache re-populates
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'c2' }, access_token: 'jwt2',
    }));
    expect(detector.isCuratorSession()).toBe(true);

    // Token removed → false
    mockLs.removeItem('heys_supabase_auth_token');
    expect(detector.isCuratorSession()).toBe(false);
  });

  test('handles transition from valid → invalid token', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'c1' }, access_token: 'jwt',
    }));
    expect(detector.isCuratorSession()).toBe(true);

    // Replace with invalid (PIN-only state?)
    mockLs.setItem('heys_supabase_auth_token', 'broken-string');
    expect(detector.isCuratorSession()).toBe(false);
  });
});

describe('shouldRouteToCuratorNamespace (routing decision)', () => {
  let mockLs;
  let detector;

  beforeEach(() => {
    mockLs = createMockStorage();
    detector = makeCuratorSessionDetector(mockLs);
  });

  test('CURATOR session + namespace key + flag ON → routes to namespace', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'c1' }, access_token: 'jwt',
    }));
    expect(shouldRouteToCuratorNamespace('heys_curator__theme', true, detector.isCuratorSession)).toBe(true);
  });

  test('CURATOR session + namespace key + flag OFF → does NOT route', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'c1' }, access_token: 'jwt',
    }));
    expect(shouldRouteToCuratorNamespace('heys_curator__theme', false, detector.isCuratorSession)).toBe(false);
  });

  test('PIN session (no curator token) + namespace key + flag ON → does NOT route (falls through)', () => {
    // No heys_supabase_auth_token = PIN-only session
    expect(shouldRouteToCuratorNamespace('heys_curator__theme', true, detector.isCuratorSession)).toBe(false);
  });

  test('CURATOR session + non-namespace key + flag ON → does NOT route (existing path)', () => {
    mockLs.setItem('heys_supabase_auth_token', JSON.stringify({
      user: { id: 'c1' }, access_token: 'jwt',
    }));
    expect(shouldRouteToCuratorNamespace('heys_theme', true, detector.isCuratorSession)).toBe(false);
    expect(shouldRouteToCuratorNamespace('heys_clients', true, detector.isCuratorSession)).toBe(false);
    expect(shouldRouteToCuratorNamespace('heys_dayv2_2026-01-01', true, detector.isCuratorSession)).toBe(false);
  });

  test('PIN session + non-namespace key → no routing (PIN behaviour preserved)', () => {
    expect(shouldRouteToCuratorNamespace('heys_theme', true, detector.isCuratorSession)).toBe(false);
  });

  test('Invalid token JSON + namespace key → no routing (defence)', () => {
    mockLs.setItem('heys_supabase_auth_token', 'corrupted');
    expect(shouldRouteToCuratorNamespace('heys_curator__theme', true, detector.isCuratorSession)).toBe(false);
  });
});

describe('Queue dedup behaviour (LWW per key)', () => {
  // Replicates queueCuratorKvUpsert dedup logic — последняя запись для k
  // заменяет предыдущую, чтобы не отправлять stale значения.
  function makeQueue() {
    const queue = [];
    return {
      push(k, v) {
        const idx = queue.findIndex(item => item.k === k);
        const entry = { k, v };
        if (idx >= 0) queue[idx] = entry;
        else queue.push(entry);
      },
      get: () => queue,
    };
  }

  test('dedups same key — keeps latest value', () => {
    const q = makeQueue();
    q.push('heys_curator__theme', 'light');
    q.push('heys_curator__theme', 'dark');
    q.push('heys_curator__theme', 'auto');
    expect(q.get().length).toBe(1);
    expect(q.get()[0].v).toBe('auto');
  });

  test('keeps distinct keys separate', () => {
    const q = makeQueue();
    q.push('heys_curator__theme', 'dark');
    q.push('heys_curator__widget_layout_v1', [1, 2, 3]);
    expect(q.get().length).toBe(2);
  });
});
