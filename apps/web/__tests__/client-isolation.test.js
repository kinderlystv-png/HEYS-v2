/**
 * Тесты для клиентской изоляции данных при переключении и синхронизации
 *
 * Проверяет:
 * - assertSyncWriteOwnership блокирует запись чужих ключей
 * - assertSyncWriteOwnership пропускает свои ключи
 * - detectPostSwitchAnomalies находит остаточные чужие ключи
 * - detectPostSwitchAnomalies не даёт false-positive при чистом состоянии
 * - isForeignClientScopedKey корректно определяет чужие ключи
 * - Интеграционные сценарии: switchClient → cleanup → anomaly check
 *
 * Создано: 2026-04-01 (P1+P2+P4 hardening)
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// Mock localStorage
// ═══════════════════════════════════════════════════════════════════
const createMockStorage = () => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] ?? null),
        setItem: vi.fn((key, value) => { store[key] = value; }),
        removeItem: vi.fn((key) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
        get length() { return Object.keys(store).length; },
        key: vi.fn((i) => Object.keys(store)[i] ?? null),
        get _store() { return store; },
    };
};

// ═══════════════════════════════════════════════════════════════════
// Чистые JS-реплики функций из heys_storage_supabase_v1.js
// Мы тестируем логику, а не модуль целиком (legacy IIFE не поддаётся импорту).
// ═══════════════════════════════════════════════════════════════════

/** Extract leading client UUID from a key like "heys_<uuid>_..." */
function getLeadingClientScopeId(key) {
    if (!key || typeof key !== 'string') return null;
    // Pattern: heys_<uuid>_<rest>
    const m = key.match(/^heys_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_/i);
    return m ? m[1] : null;
}

/** Check if a key belongs to a different client */
function isForeignClientScopedKey(key, clientId) {
    const leadId = getLeadingClientScopeId(key);
    // If no embedded UUID → not client-scoped → not foreign
    if (!leadId) return false;
    return leadId !== clientId;
}

/** Write-time isolation guard (replica of assertSyncWriteOwnership) */
let _syncWriteIsolationViolations = 0;
let _lastViolationEvent = null;

function assertSyncWriteOwnership(key, clientId, source) {
    if (!clientId || typeof key !== 'string') return true;
    if (isForeignClientScopedKey(key, clientId)) {
        _syncWriteIsolationViolations++;
        _lastViolationEvent = { key, clientId: clientId.slice(0, 8), source, count: _syncWriteIsolationViolations };
        return false;
    }
    return true;
}

/** Post-switch anomaly detection (replica of detectPostSwitchAnomalies) */
function detectPostSwitchAnomalies(newClientId, oldClientId, mockLs) {
    if (!newClientId) return null;
    const anomalies = [];
    const newPrefix = 'heys_' + newClientId + '_';

    let foreignDayKeys = 0;
    let foreignOtherKeys = 0;

    for (let i = 0; i < mockLs.length; i++) {
        const k = mockLs.key(i);
        if (!k || !k.startsWith('heys_')) continue;
        if (k === 'heys_client_current' || k.startsWith('heys_supabase_') ||
            k.startsWith('heys_pin_') || k === 'heys_session_token') continue;

        if (k.startsWith(newPrefix)) {
            continue;
        }

        const leadId = getLeadingClientScopeId(k);
        if (leadId && leadId !== newClientId) {
            if (k.includes('dayv2_')) foreignDayKeys++;
            else foreignOtherKeys++;
        }
    }

    if (foreignDayKeys > 0) {
        anomalies.push({ type: 'foreign_day_keys', count: foreignDayKeys, oldClient: oldClientId?.slice(0, 8) });
    }
    if (foreignOtherKeys > 0) {
        anomalies.push({ type: 'foreign_other_keys', count: foreignOtherKeys, oldClient: oldClientId?.slice(0, 8) });
    }

    return anomalies.length > 0 ? anomalies : null;
}

// ═══════════════════════════════════════════════════════════════════
// Test constants
// ═══════════════════════════════════════════════════════════════════
const CLIENT_A = 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-4444-5555-6666-bbbbbbbbbbbb';

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('Client Isolation — isForeignClientScopedKey', () => {
    test('returns false for own client-scoped key', () => {
        expect(isForeignClientScopedKey(`heys_${CLIENT_A}_profile`, CLIENT_A)).toBe(false);
    });

    test('returns true for foreign client-scoped key', () => {
        expect(isForeignClientScopedKey(`heys_${CLIENT_B}_profile`, CLIENT_A)).toBe(true);
    });

    test('returns false for unscoped key (no UUID prefix)', () => {
        expect(isForeignClientScopedKey('heys_profile', CLIENT_A)).toBe(false);
        expect(isForeignClientScopedKey('heys_products', CLIENT_A)).toBe(false);
    });

    test('returns false for null/undefined key', () => {
        expect(isForeignClientScopedKey(null, CLIENT_A)).toBe(false);
        expect(isForeignClientScopedKey(undefined, CLIENT_A)).toBe(false);
    });

    test('correctly handles dayv2 keys', () => {
        expect(isForeignClientScopedKey(`heys_${CLIENT_A}_dayv2_2026-03-28`, CLIENT_A)).toBe(false);
        expect(isForeignClientScopedKey(`heys_${CLIENT_B}_dayv2_2026-03-28`, CLIENT_A)).toBe(true);
    });
});

describe('Client Isolation — assertSyncWriteOwnership', () => {
    beforeEach(() => {
        _syncWriteIsolationViolations = 0;
        _lastViolationEvent = null;
    });

    test('allows writes for own-client keys', () => {
        const result = assertSyncWriteOwnership(`heys_${CLIENT_A}_profile`, CLIENT_A, 'phase-a');
        expect(result).toBe(true);
        expect(_syncWriteIsolationViolations).toBe(0);
    });

    test('blocks writes for foreign-client keys', () => {
        const result = assertSyncWriteOwnership(`heys_${CLIENT_B}_profile`, CLIENT_A, 'delta-light');
        expect(result).toBe(false);
        expect(_syncWriteIsolationViolations).toBe(1);
        expect(_lastViolationEvent).toMatchObject({
            key: `heys_${CLIENT_B}_profile`,
            source: 'delta-light',
            count: 1,
        });
    });

    test('allows writes for unscoped keys (global)', () => {
        expect(assertSyncWriteOwnership('heys_profile', CLIENT_A, 'full-sync')).toBe(true);
        expect(assertSyncWriteOwnership('heys_products', CLIENT_A, 'full-sync')).toBe(true);
    });

    test('increments violation counter across calls', () => {
        assertSyncWriteOwnership(`heys_${CLIENT_B}_dayv2_2026-01-01`, CLIENT_A, 'full-sync');
        assertSyncWriteOwnership(`heys_${CLIENT_B}_dayv2_2026-01-02`, CLIENT_A, 'full-sync');
        assertSyncWriteOwnership(`heys_${CLIENT_B}_norms`, CLIENT_A, 'full-sync');
        expect(_syncWriteIsolationViolations).toBe(3);
    });

    test('allows write when clientId is null (safety fallback)', () => {
        // When clientId is null, assertion is a no-op — does not crash
        expect(assertSyncWriteOwnership(`heys_${CLIENT_B}_profile`, null, 'test')).toBe(true);
    });

    test('allows write when key is not a string (safety fallback)', () => {
        expect(assertSyncWriteOwnership(123, CLIENT_A, 'test')).toBe(true);
        expect(assertSyncWriteOwnership(null, CLIENT_A, 'test')).toBe(true);
    });

    test('tracks source correctly for each violation', () => {
        assertSyncWriteOwnership(`heys_${CLIENT_B}_profile`, CLIENT_A, 'phase-a');
        expect(_lastViolationEvent.source).toBe('phase-a');

        assertSyncWriteOwnership(`heys_${CLIENT_B}_norms`, CLIENT_A, 'delta-light');
        expect(_lastViolationEvent.source).toBe('delta-light');
    });
});

describe('Client Isolation — detectPostSwitchAnomalies', () => {
    let mockLs;

    beforeEach(() => {
        mockLs = createMockStorage();
    });

    test('returns null for clean state (no foreign keys)', () => {
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{}';
        mockLs._store[`heys_${CLIENT_A}_dayv2_2026-03-28`] = '{}';
        mockLs._store['heys_client_current'] = `"${CLIENT_A}"`;

        const result = detectPostSwitchAnomalies(CLIENT_A, CLIENT_B, mockLs);
        expect(result).toBeNull();
    });

    test('detects foreign day keys after switch', () => {
        // New client data
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{}';
        mockLs._store[`heys_${CLIENT_A}_dayv2_2026-03-28`] = '{}';
        // Residual old client data — should be flagged
        mockLs._store[`heys_${CLIENT_B}_dayv2_2026-03-27`] = '{}';
        mockLs._store[`heys_${CLIENT_B}_dayv2_2026-03-26`] = '{}';

        const result = detectPostSwitchAnomalies(CLIENT_A, CLIENT_B, mockLs);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ type: 'foreign_day_keys', count: 2 });
    });

    test('detects foreign non-day keys after switch', () => {
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{}';
        // Old client non-day key
        mockLs._store[`heys_${CLIENT_B}_norms`] = '{}';

        const result = detectPostSwitchAnomalies(CLIENT_A, CLIENT_B, mockLs);
        expect(result).not.toBeNull();
        expect(result[0]).toMatchObject({ type: 'foreign_other_keys', count: 1 });
    });

    test('detects both foreign day and non-day keys', () => {
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{}';
        mockLs._store[`heys_${CLIENT_B}_dayv2_2026-03-28`] = '{}';
        mockLs._store[`heys_${CLIENT_B}_profile`] = '{}';
        mockLs._store[`heys_${CLIENT_B}_norms`] = '{}';

        const result = detectPostSwitchAnomalies(CLIENT_A, CLIENT_B, mockLs);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
        const types = result.map(a => a.type);
        expect(types).toContain('foreign_day_keys');
        expect(types).toContain('foreign_other_keys');
    });

    test('ignores global keys (no UUID prefix)', () => {
        mockLs._store['heys_profile'] = '{}';
        mockLs._store['heys_products'] = '[]';
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{}';

        const result = detectPostSwitchAnomalies(CLIENT_A, CLIENT_B, mockLs);
        expect(result).toBeNull();
    });

    test('ignores system keys (auth, pin, supabase)', () => {
        mockLs._store['heys_client_current'] = `"${CLIENT_A}"`;
        mockLs._store['heys_supabase_auth_token'] = '{}';
        mockLs._store['heys_pin_auth_client'] = CLIENT_A;
        mockLs._store['heys_session_token'] = 'token123';
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{}';

        const result = detectPostSwitchAnomalies(CLIENT_A, CLIENT_B, mockLs);
        expect(result).toBeNull();
    });

    test('returns null when newClientId is falsy', () => {
        expect(detectPostSwitchAnomalies(null, CLIENT_B, mockLs)).toBeNull();
        expect(detectPostSwitchAnomalies('', CLIENT_B, mockLs)).toBeNull();
    });
});

describe('Client Isolation — Sync Write Path Scenarios', () => {
    let mockLs;

    beforeEach(() => {
        mockLs = createMockStorage();
        _syncWriteIsolationViolations = 0;
        _lastViolationEvent = null;
    });

    /**
     * Scenario: Phase A fetches 5 critical keys for CLIENT_A.
     * One key is accidentally scoped to CLIENT_B (cloud contamination).
     * The assertion must block only the foreign key.
     */
    test('Phase A: blocks contaminated foreign key, allows own keys', () => {
        const phaseAData = [
            { k: `heys_${CLIENT_A}_profile`, v: { weight: 70 } },
            { k: `heys_${CLIENT_A}_norms`, v: { kcal: 2000 } },
            { k: `heys_${CLIENT_B}_dayv2_2026-03-28`, v: { meals: [] } }, // contaminated!
            { k: `heys_${CLIENT_A}_products`, v: [] },
        ];

        const writtenKeys = [];
        phaseAData.forEach(row => {
            if (row.v == null) return;
            // scopeKeyForClientStorage is identity for already-scoped keys in this test
            const pKey = row.k;
            if (isForeignClientScopedKey(pKey, CLIENT_A)) return;
            if (!assertSyncWriteOwnership(pKey, CLIENT_A, 'phase-a')) return;
            mockLs.setItem(pKey, JSON.stringify(row.v));
            writtenKeys.push(pKey);
        });

        // The foreign key should have been caught by isForeignClientScopedKey first
        expect(writtenKeys).toHaveLength(3);
        expect(writtenKeys).not.toContain(`heys_${CLIENT_B}_dayv2_2026-03-28`);
        expect(_syncWriteIsolationViolations).toBe(0); // first filter caught it
    });

    /**
     * Scenario: If isForeignClientScopedKey somehow misses a key (e.g. scoping bug),
     * assertSyncWriteOwnership must still catch it.
     */
    test('assertSyncWriteOwnership catches what isForeignClientScopedKey could miss', () => {
        // Simulate a key that bypassed the first filter (hypothetical bug scenario)
        const foreignKey = `heys_${CLIENT_B}_hr_zones`;

        // Directly call assertion without the first filter
        const allowed = assertSyncWriteOwnership(foreignKey, CLIENT_A, 'full-sync');
        expect(allowed).toBe(false);
        expect(_syncWriteIsolationViolations).toBe(1);
    });

    /**
     * Scenario: Delta Light processes <= 10 keys.
     * All keys belong to CLIENT_A — all should pass both filters.
     */
    test('Delta Light: all own-client keys pass through cleanly', () => {
        const deltaData = [
            { k: `heys_${CLIENT_A}_dayv2_2026-03-28`, v: { meals: [{ name: 'Lunch' }] } },
            { k: `heys_${CLIENT_A}_products`, v: [{ name: 'Apple' }] },
        ];

        let keysWritten = 0;
        deltaData.forEach(row => {
            const key = row.k;
            if (isForeignClientScopedKey(key, CLIENT_A)) return;
            if (!assertSyncWriteOwnership(key, CLIENT_A, 'delta-light')) return;
            mockLs.setItem(key, JSON.stringify(row.v));
            keysWritten++;
        });

        expect(keysWritten).toBe(2);
        expect(_syncWriteIsolationViolations).toBe(0);
    });

    /**
     * Scenario: Full sync dedup already filters, but a double-scoped key
     * might sneak through with wrong client prefix.
     */
    test('Full Sync: double-layer defense catches contaminated key', () => {
        const deduped = [
            { scopedKey: `heys_${CLIENT_A}_dayv2_2026-03-28`, row: { v: { meals: [] } } },
            { scopedKey: `heys_${CLIENT_A}_profile`, row: { v: { weight: 65 } } },
            { scopedKey: `heys_${CLIENT_B}_game`, row: { v: { totalXP: 100 } } }, // contaminated!
        ];

        const writtenKeys = [];
        deduped.forEach(({ scopedKey, row }) => {
            const key = scopedKey;
            if (!assertSyncWriteOwnership(key, CLIENT_A, 'full-sync')) return;
            mockLs.setItem(key, JSON.stringify(row.v));
            writtenKeys.push(key);
        });

        expect(writtenKeys).toHaveLength(2);
        expect(writtenKeys).not.toContain(`heys_${CLIENT_B}_game`);
        expect(_syncWriteIsolationViolations).toBe(1);
    });
});

describe('Client Isolation — switchClient Integration Scenario', () => {
    let mockLs;

    beforeEach(() => {
        mockLs = createMockStorage();
        _syncWriteIsolationViolations = 0;
    });

    /**
     * End-to-end scenario:
     * 1. CLIENT_A has data in localStorage
     * 2. Switch to CLIENT_B
     * 3. Cleanup removes CLIENT_A scoped keys
     * 4. Post-switch anomaly detection confirms clean state
     */
    test('clean switch: no anomalies after proper cleanup', () => {
        // Initial state: CLIENT_A data
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{"weight":70}';
        mockLs._store[`heys_${CLIENT_A}_dayv2_2026-03-28`] = '{"meals":[]}';
        mockLs._store[`heys_${CLIENT_A}_norms`] = '{"kcal":2000}';
        mockLs._store['heys_client_current'] = `"${CLIENT_A}"`;

        // Simulate switchClient cleanup: remove old client keys
        const keysToRemove = [];
        for (let i = 0; i < mockLs.length; i++) {
            const k = mockLs.key(i);
            if (k && k.includes(CLIENT_A) && !k.includes('_auth') && k !== 'heys_client_current') {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => mockLs.removeItem(k));

        // Simulate new client data loaded by sync
        mockLs._store['heys_client_current'] = `"${CLIENT_B}"`;
        mockLs._store[`heys_${CLIENT_B}_profile`] = '{"weight":55}';
        mockLs._store[`heys_${CLIENT_B}_dayv2_2026-03-28`] = '{"meals":[]}';

        // Post-switch check
        const anomalies = detectPostSwitchAnomalies(CLIENT_B, CLIENT_A, mockLs);
        expect(anomalies).toBeNull();
    });

    /**
     * Scenario: Cleanup partially fails — some old keys remain.
     * Post-switch detection must flag them.
     */
    test('dirty switch: detects residual old-client keys', () => {
        // Simulate: new client data present, but old client keys NOT cleaned up
        mockLs._store['heys_client_current'] = `"${CLIENT_B}"`;
        mockLs._store[`heys_${CLIENT_B}_profile`] = '{"weight":55}';
        mockLs._store[`heys_${CLIENT_B}_dayv2_2026-03-28`] = '{"meals":[]}';

        // Old client residual data (cleanup missed these)
        mockLs._store[`heys_${CLIENT_A}_dayv2_2026-03-27`] = '{"meals":[{"name":"old"}]}';
        mockLs._store[`heys_${CLIENT_A}_profile`] = '{"weight":70}';

        const anomalies = detectPostSwitchAnomalies(CLIENT_B, CLIENT_A, mockLs);
        expect(anomalies).not.toBeNull();
        expect(anomalies).toHaveLength(2);

        const dayAnomaly = anomalies.find(a => a.type === 'foreign_day_keys');
        const otherAnomaly = anomalies.find(a => a.type === 'foreign_other_keys');
        expect(dayAnomaly.count).toBe(1);
        expect(otherAnomaly.count).toBe(1);
    });

    /**
     * Scenario: Three-client situation — CLIENT_C data also present.
     * After switching to CLIENT_B, both CLIENT_A and CLIENT_C keys are foreign.
     */
    test('multi-client contamination: detects keys from multiple foreign clients', () => {
        const CLIENT_C = 'cccccccc-7777-8888-9999-cccccccccccc';

        mockLs._store['heys_client_current'] = `"${CLIENT_B}"`;
        mockLs._store[`heys_${CLIENT_B}_profile`] = '{}';

        // Foreign keys from two different clients
        mockLs._store[`heys_${CLIENT_A}_dayv2_2026-03-28`] = '{}';
        mockLs._store[`heys_${CLIENT_C}_dayv2_2026-03-27`] = '{}';
        mockLs._store[`heys_${CLIENT_C}_profile`] = '{}';

        const anomalies = detectPostSwitchAnomalies(CLIENT_B, CLIENT_A, mockLs);
        expect(anomalies).not.toBeNull();

        const dayAnomaly = anomalies.find(a => a.type === 'foreign_day_keys');
        expect(dayAnomaly.count).toBe(2); // one from A, one from C
    });
});

describe('Client Isolation — getLeadingClientScopeId', () => {
    test('extracts UUID from standard scoped key', () => {
        expect(getLeadingClientScopeId(`heys_${CLIENT_A}_profile`)).toBe(CLIENT_A);
    });

    test('returns null for unscoped key', () => {
        expect(getLeadingClientScopeId('heys_profile')).toBeNull();
        expect(getLeadingClientScopeId('heys_products')).toBeNull();
    });

    test('returns null for non-heys key', () => {
        expect(getLeadingClientScopeId('some_random_key')).toBeNull();
    });

    test('returns null for null/undefined', () => {
        expect(getLeadingClientScopeId(null)).toBeNull();
        expect(getLeadingClientScopeId(undefined)).toBeNull();
        expect(getLeadingClientScopeId('')).toBeNull();
    });

    test('extracts UUID from dayv2 key', () => {
        expect(getLeadingClientScopeId(`heys_${CLIENT_B}_dayv2_2026-03-28`)).toBe(CLIENT_B);
    });

    test('does not match partial UUID', () => {
        expect(getLeadingClientScopeId('heys_aaaaaaaa_profile')).toBeNull();
        expect(getLeadingClientScopeId('heys_not-a-uuid_profile')).toBeNull();
    });
});
