/**
 * Regression test для commit b30796f6.
 *
 * Bug: `_runForegroundHotKeySyncLegacy(clientId, keys, markerScopes)` — функция
 * не принимала `reason` параметром, но в success-логе использовала `${reason}`
 * → ReferenceError каждые 30с в console на PIN-flow с legacy fallback.
 *
 * Fix: добавили `reason` параметром И пробросили из caller'a
 * `runForegroundHotKeySync` → `_runForegroundHotKeySyncLegacy(clientId, keys, reason, markerScopes)`.
 *
 * Этот test читает source файл и verify'ит что signature правильная.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const SRC_PATH = path.resolve(
    process.cwd(),
    'apps/web/heys_storage_supabase_v1.js'
);

describe('Regression b30796f6: _runForegroundHotKeySyncLegacy missing reason param', () => {
    const source = readFileSync(SRC_PATH, 'utf8');

    it('signature должна включать `reason` параметром (3-й аргумент)', () => {
        // Match: async function _runForegroundHotKeySyncLegacy(clientId, keys, reason, ...)
        const sigMatch = source.match(
            /async function _runForegroundHotKeySyncLegacy\s*\(([^)]+)\)/
        );
        expect(sigMatch, '_runForegroundHotKeySyncLegacy signature не найдена').toBeTruthy();
        const params = sigMatch![1].split(',').map(s => s.trim().split(/[=\s]/)[0]);
        expect(params, `params: ${params.join(', ')}`).toContain('reason');
    });

    it('caller должен передавать `reason` третьим аргументом', () => {
        // Match: return _runForegroundHotKeySyncLegacy(clientId, keysToFetch, reason, ...)
        const callMatch = source.match(
            /return\s+_runForegroundHotKeySyncLegacy\s*\(([^)]+)\)/
        );
        expect(callMatch, 'call to _runForegroundHotKeySyncLegacy не найден').toBeTruthy();
        const args = callMatch![1].split(',').map(s => s.trim());
        expect(args.length, `args: ${args.join(', ')}`).toBeGreaterThanOrEqual(3);
        expect(args[2], 'третий аргумент должен быть `reason`').toBe('reason');
    });
});
