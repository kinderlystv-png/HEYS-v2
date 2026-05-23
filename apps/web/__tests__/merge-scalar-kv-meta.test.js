/**
 * @fileoverview Regression guard for mergeScalarKv nested _meta protection.
 *
 * Контекст. До 2026-05-23 в `mergeScalarKv` (yandex-cloud-functions/heys-api-rpc/
 * lib/heys_sync_merge_v1.cjs) nested objects сливались через `{ ...baseVal,
 * ...overlayVal }` — overlay затирал любые поля, включая `_meta` / `_sourceId`,
 * хотя на root-level эти ключи защищены skip'ом. Если бы кто-то в будущем
 * захотел хранить state-flag внутри nested `heys_game._meta.dailyRebuilt`
 * (что и пробовал v2.5 для XP cache) — overlay перезаписал бы его.
 *
 * Этот тест фиксирует контракт: nested `_meta` / `_sourceId` ведут себя как
 * root-level — overlay их не трогает, base-side вершит итог.
 */

import { describe, it, expect } from 'vitest';

const path = require('node:path');
const mergeModule = require(
  path.resolve(__dirname, '..', '..', '..', 'yandex-cloud-functions', 'heys-api-rpc', 'lib', 'heys_sync_merge_v1.cjs')
);

const { mergeScalarKv } = mergeModule;

describe('mergeScalarKv — _meta protection contract', () => {
  it('skips root-level _meta from overlay (pre-existing behavior)', () => {
    const base = { firstName: 'A', updatedAt: 1, _meta: { tag: 'base' } };
    const overlay = { firstName: 'B', updatedAt: 2, _meta: { tag: 'overlay' } };
    const merged = mergeScalarKv(overlay, base);
    expect(merged.firstName).toBe('B'); // overlay is newer, wins
    // Root _meta from base (older side) survives — overlay's metadata is dropped
    expect(merged._meta).toEqual({ tag: 'base' });
  });

  it('skips root-level _sourceId from overlay (pre-existing behavior)', () => {
    const base = { x: 1, updatedAt: 1, _sourceId: 'base-src' };
    const overlay = { x: 2, updatedAt: 2, _sourceId: 'overlay-src' };
    const merged = mergeScalarKv(overlay, base);
    expect(merged.x).toBe(2);
    expect(merged._sourceId).toBe('base-src');
  });

  it('skips nested _meta from overlay (FIX 2026-05-23)', () => {
    const base = {
      updatedAt: 1,
      game: {
        totalXP: 100,
        _meta: { dailyRebuilt: true, ts: 1000 },
      },
    };
    const overlay = {
      updatedAt: 2,
      game: {
        totalXP: 200,
        _meta: { dailyRebuilt: false, ts: 2000 },
      },
    };
    const merged = mergeScalarKv(overlay, base);
    expect(merged.game.totalXP).toBe(200); // overlay wins for regular field
    // Nested _meta protected — base value survives, NOT overlay
    expect(merged.game._meta).toEqual({ dailyRebuilt: true, ts: 1000 });
  });

  it('skips nested _sourceId from overlay (FIX 2026-05-23)', () => {
    const base = { updatedAt: 1, sub: { val: 1, _sourceId: 'local' } };
    const overlay = { updatedAt: 2, sub: { val: 2, _sourceId: 'remote' } };
    const merged = mergeScalarKv(overlay, base);
    expect(merged.sub.val).toBe(2);
    expect(merged.sub._sourceId).toBe('local');
  });

  it('regular nested fields still overlay normally', () => {
    const base = { updatedAt: 1, profile: { name: 'A', weight: 50 } };
    const overlay = { updatedAt: 2, profile: { name: 'B', height: 170 } };
    const merged = mergeScalarKv(overlay, base);
    // name overwritten, weight preserved from base, height added from overlay
    expect(merged.profile).toEqual({ name: 'B', weight: 50, height: 170 });
  });

  it('nested object: base has _meta, overlay does not — base _meta preserved', () => {
    const base = { updatedAt: 1, game: { totalXP: 100, _meta: { flag: 1 } } };
    const overlay = { updatedAt: 2, game: { totalXP: 200 } };
    const merged = mergeScalarKv(overlay, base);
    expect(merged.game.totalXP).toBe(200);
    expect(merged.game._meta).toEqual({ flag: 1 });
  });

  it('nested object: overlay has _meta, base does not — overlay _meta IGNORED', () => {
    // Симметрично root-level: overlay metadata всегда дропается, даже если base
    // его не имеет. Гарантирует что cloud не вводит «свои» metadata-флаги.
    const base = { updatedAt: 1, game: { totalXP: 100 } };
    const overlay = { updatedAt: 2, game: { totalXP: 200, _meta: { flag: 'remote' } } };
    const merged = mergeScalarKv(overlay, base);
    expect(merged.game.totalXP).toBe(200);
    expect(merged.game._meta).toBeUndefined();
  });
});

describe('mergeScalarKv — Phase A critical keys are listed in storage layer', () => {
  // Smoke-test для critical Phase A keys list. Если кто-то случайно удалит
  // heys_game / heys_subscription_status / heys_widget_layout_v1 из списка —
  // регрессия cold-start UX. Проверяем по исходнику (IIFE-bundle не имеет
  // exports для прямого assert'а).
  const fs = require('node:fs');
  const storageFile = path.resolve(__dirname, '..', 'heys_storage_supabase_v1.js');
  const source = fs.readFileSync(storageFile, 'utf8');

  const expectedKeys = [
    'heys_profile',
    'heys_norms',
    'heys_products',
    'heys_hr_zones',
    'heys_advice_settings',
    'heys_advice_read_today',
    'heys_game',
    'heys_subscription_status',
    'heys_widget_layout_v1',
  ];

  // Локализуем блок `const criticalBaseKeys = [...]` динамически — line-numbers
  // меняются при правках в файле, hardcoded range быстро дрейфует. Ищем по
  // маркеру `criticalBaseKeys = [` и берём ~50 строк после (где сам массив).
  const criticalKeysStart = source.indexOf('const criticalBaseKeys = [');
  if (criticalKeysStart < 0) {
    throw new Error('Test setup: `const criticalBaseKeys = [` not found in heys_storage_supabase_v1.js');
  }
  const phaseAArea = source.slice(criticalKeysStart, criticalKeysStart + 4000);

  expectedKeys.forEach((key) => {
    it(`criticalBaseKeys contains '${key}'`, () => {
      expect(phaseAArea).toContain(`'${key}'`);
    });
  });

  it("LOCAL_ONLY_STORAGE_PREFIXES contains 'heys_xp_cache_'", () => {
    const localOnlyArea = source.split('\n').slice(1795, 1830).join('\n');
    expect(localOnlyArea).toContain("'heys_xp_cache_'");
  });

  it('isLocalOnlyStorageKey covers heys_products_overlay_v2_BACKUP_*', () => {
    const localOnlyArea = source.split('\n').slice(1815, 1835).join('\n');
    expect(localOnlyArea).toMatch(/_products_overlay_v2_BACKUP_/);
  });
});
