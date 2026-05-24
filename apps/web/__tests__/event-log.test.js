/**
 * @fileoverview Tests for event-log SDK
 * Plan: plans/rustling-dazzling-bentley.md (Wave 5, F-EL7)
 *
 * Покрывает критичные контракты:
 * - Privacy sanitization (whitelist polей в payload)
 * - Sample rate gate
 *
 * Не тестируется здесь (требует full bundle + IIFE harness):
 * - Batching/debounce flow (полагается на realtime RPC)
 * - LS pending recovery
 * - beforeunload flush
 *
 * Pure-logic симуляция повторяет SAFE_PAYLOAD_KEYS + SAMPLE_RATES из
 * apps/web/heys_event_log_v1.js. Если контракт меняется — обновить параллельно.
 */

import { describe, expect, it } from 'vitest';

// === Реплика SAFE_PAYLOAD_KEYS (whitelist) ===
const SAFE_PAYLOAD_KEYS = new Set([
  'dateKey', 'date', 'productId', 'product_id', 'productIds', 'product_ids',
  'suppId', 'suppIds', 'fingerprint',
  'mealIndex', 'mealName', 'itemId',
  'name',
  'oldGrams', 'newGrams',
  'count', 'before', 'after',
  'tombstoneCovered', 'removedCount',
  'source', 'kind', 'reason',
  'allowShrink',
  '_oneTime',
  'sharedOriginId', 'shared_origin_id',
]);

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const out = {};
  for (const key of Object.keys(payload)) {
    if (SAFE_PAYLOAD_KEYS.has(key)) {
      const v = payload[key];
      if (typeof v === 'string' && v.length > 200) {
        out[key] = v.slice(0, 200) + '…';
      } else if (Array.isArray(v) && v.length > 20) {
        out[key] = v.slice(0, 20).concat(['…+' + (v.length - 20)]);
      } else {
        out[key] = v;
      }
    } else {
      out[key] = '<filtered>';
    }
  }
  return out;
}

const SAMPLE_RATES = {
  'sync-event': 0.2,
  'sync-products': 0.5,
  'setall-shrink': 1.0,
  'product-delete': 1.0,
  'product-create': 1.0,
  'supplement-mark': 1.0,
  'meal-add': 1.0,
  'meal-remove': 1.0,
};

function shouldSample(kind, randomFn = Math.random) {
  const rate = SAMPLE_RATES[kind];
  if (rate === undefined || rate >= 1) return true;
  if (rate <= 0) return false;
  return randomFn() < rate;
}

// === Tests ===

describe('eventLog: sanitizePayload (privacy guard per 152-ФЗ)', () => {
  it('фильтрует health-data fields на <filtered>', () => {
    const input = {
      kcal100: 1200,        // sensitive
      weightMorning: 75.5,  // sensitive
      moodMorning: 4,       // sensitive
      sleepHours: 7.5,      // sensitive
      waterMl: 1500,        // sensitive
      dateKey: '2026-05-24', // safe
      productId: 'p_xxx',   // safe
    };
    const result = sanitizePayload(input);
    expect(result.kcal100).toBe('<filtered>');
    expect(result.weightMorning).toBe('<filtered>');
    expect(result.moodMorning).toBe('<filtered>');
    expect(result.sleepHours).toBe('<filtered>');
    expect(result.waterMl).toBe('<filtered>');
    expect(result.dateKey).toBe('2026-05-24');
    expect(result.productId).toBe('p_xxx');
  });

  it('допускает whitelist payload keys', () => {
    const input = {
      dateKey: '2026-05-24',
      productIds: ['p1', 'p2'],
      suppIds: ['omega3'],
      mealIndex: 1,
      mealName: 'Ужин',
      name: 'Грудка Орион',
      oldGrams: 100,
      newGrams: 200,
      tombstoneCovered: 5,
    };
    const result = sanitizePayload(input);
    expect(result).toEqual(input);
  });

  it('обрезает длинные строки до 200 символов + ellipsis', () => {
    const long = 'A'.repeat(300);
    const result = sanitizePayload({ name: long });
    expect(result.name.length).toBe(201); // 200 + ellipsis
    expect(result.name.endsWith('…')).toBe(true);
  });

  it('обрезает большие массивы до 20 элементов + marker', () => {
    const big = Array.from({ length: 50 }, (_, i) => 'p' + i);
    const result = sanitizePayload({ productIds: big });
    expect(result.productIds.length).toBe(21); // 20 + marker
    expect(result.productIds[20]).toBe('…+30');
  });

  it('null/undefined payload → null', () => {
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeNull();
  });

  it('not-object payload → null', () => {
    expect(sanitizePayload('string')).toBeNull();
    expect(sanitizePayload(42)).toBeNull();
  });

  it('empty object → empty object', () => {
    expect(sanitizePayload({})).toEqual({});
  });

  it('фильтрует unknown поля даже если они невинные', () => {
    // Защита от "по умолчанию пропускаем" — whitelist строгий
    const input = { totallyHarmless: 'hello', dateKey: '2026-05-24' };
    const result = sanitizePayload(input);
    expect(result.totallyHarmless).toBe('<filtered>');
    expect(result.dateKey).toBe('2026-05-24');
  });
});

describe('eventLog: shouldSample (sample rate gate)', () => {
  it('unknown kind → всегда true (default 1.0)', () => {
    expect(shouldSample('arbitrary-kind', () => 0.99)).toBe(true);
    expect(shouldSample('arbitrary-kind', () => 0.01)).toBe(true);
  });

  it('rate=1.0 → всегда true', () => {
    expect(shouldSample('setall-shrink', () => 0.99)).toBe(true);
  });

  it('rate=0.2 — fires когда random < 0.2', () => {
    expect(shouldSample('sync-event', () => 0.1)).toBe(true);   // < 0.2
    expect(shouldSample('sync-event', () => 0.3)).toBe(false);  // > 0.2
  });

  it('rate=0.5 — fires когда random < 0.5', () => {
    expect(shouldSample('sync-products', () => 0.4)).toBe(true);
    expect(shouldSample('sync-products', () => 0.6)).toBe(false);
  });

  it('сritical kinds (product-delete, supplement-mark, meal-add) — всегда true', () => {
    const criticalKinds = ['product-delete', 'product-create', 'supplement-mark', 'meal-add', 'meal-remove'];
    for (const kind of criticalKinds) {
      expect(shouldSample(kind, () => 0.99)).toBe(true);
    }
  });

  it('rate=0 → всегда false (theoretical, не используется сейчас)', () => {
    // Не в SAMPLE_RATES, но симуляция: явный 0 → блок
    const localShould = (kind, rand) => {
      const rate = kind === 'never' ? 0 : 1;
      if (rate <= 0) return false;
      if (rate >= 1) return true;
      return rand() < rate;
    };
    expect(localShould('never', () => 0)).toBe(false);
    expect(localShould('never', () => 0.5)).toBe(false);
  });

  it('approx 20% sample rate за 1000 итераций ±10%', () => {
    let fired = 0;
    for (let i = 0; i < 1000; i++) {
      if (shouldSample('sync-event')) fired++;
    }
    expect(fired).toBeGreaterThan(150);  // 15% lower bound
    expect(fired).toBeLessThan(250);     // 25% upper bound
  });
});

describe('eventLog: integration of sanitization + sampling (contracts)', () => {
  it('критичные mutations всегда логируются и не фильтруют важные поля', () => {
    // meal-add event обязан пройти sample (rate=1) и сохранить dateKey, name, mealName
    const sampled = shouldSample('meal-add', () => 0.99);
    expect(sampled).toBe(true);
    const sanitized = sanitizePayload({
      dateKey: '2026-05-24',
      name: 'Грудка',
      mealName: 'Ужин',
      mealIndex: 1,
      grams: 200,         // НЕ в whitelist — будет filtered
      kcal100: 145,       // sensitive — filtered
    });
    expect(sanitized.dateKey).toBe('2026-05-24');
    expect(sanitized.name).toBe('Грудка');
    expect(sanitized.mealName).toBe('Ужин');
    expect(sanitized.grams).toBe('<filtered>');
    expect(sanitized.kcal100).toBe('<filtered>');
  });
});
