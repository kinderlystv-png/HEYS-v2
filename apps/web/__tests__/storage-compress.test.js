/**
 * @fileoverview Тесты сжатия/разжатия и безопасного чтения стораджа
 */

import { beforeEach, describe, expect, it } from 'vitest';

// Копия логики из heys_storage_layer_v1.js (упрощённо)
function compress(obj) {
  try {
    const json = JSON.stringify(obj);
    let compressed = json
      .replace(/":"/g, '":"')
      .replace(/","/g, '","')
      .replace(/{""/g, '{"')
      .replace(/"}/g, '"}');
    const patterns = {
      '"name":"': '¤n¤',
      '"kcal100"': '¤k¤',
      '"protein100"': '¤p¤',
      '"carbs100"': '¤c¤',
      '"fat100"': '¤f¤',
      '"simple100"': '¤s¤',
      '"complex100"': '¤x¤',
      '"badFat100"': '¤b¤',
      '"goodFat100"': '¤g¤',
      '"trans100"': '¤t¤',
      '"fiber100"': '¤i¤',
      '"gi"': '¤G¤',
      '"harmScore"': '¤h¤',
    };
    for (const [pattern, code] of Object.entries(patterns)) {
      compressed = compressed.split(pattern).join(code);
    }
    if (compressed.length < json.length * 0.9) {
      return '¤Z¤' + compressed;
    }
    return json;
  } catch (e) {
    return JSON.stringify(obj);
  }
}

function decompress(str) {
  try {
    if (!str.startsWith('¤Z¤')) {
      return JSON.parse(str);
    }
    let compressed = str.substring(3);
    const patterns = {
      '¤n¤': '"name":"',
      '¤k¤': '"kcal100"',
      '¤p¤': '"protein100"',
      '¤c¤': '"carbs100"',
      '¤f¤': '"fat100"',
      '¤s¤': '"simple100"',
      '¤x¤': '"complex100"',
      '¤b¤': '"badFat100"',
      '¤g¤': '"goodFat100"',
      '¤t¤': '"trans100"',
      '¤i¤': '"fiber100"',
      '¤G¤': '"gi"',
      '¤h¤': '"harmScore"',
    };
    for (const [code, pattern] of Object.entries(patterns)) {
      compressed = compressed.split(code).join(pattern);
    }
    return JSON.parse(compressed);
  } catch (e) {
    return JSON.parse(str);
  }
}

function rawGet(k, def) {
  try {
    const v = global.localStorage.getItem(k);
    return v ? decompress(v) : def;
  } catch (e) {
    return def;
  }
}

const product = {
  id: 'prod_1',
  name: 'Овсянка',
  protein100: 12,
  carbs100: 65,
  fat100: 7,
  simple100: 3,
  complex100: 62,
  badFat100: 1,
  goodFat100: 5,
  trans100: 0,
  fiber100: 10,
  gi: 45,
  harm: 2,  // Canonical harm field
};

let store;

// Воспроизводим lsSet из heys_core_v12.js (Phase 5 Block A fix)
function makeLsSet(heysStore, localStorage) {
  return function lsSet(key, val) {
    try {
      if (heysStore?.set) {
        heysStore.set(key, val);
        return;
      }
      const serialized = JSON.stringify(val);
      try {
        const existing = localStorage.getItem(key);
        if (existing === serialized) return;
      } catch (_) {}
      localStorage.setItem(key, serialized);
    } catch (e) {}
  };
}

describe('lsSet — routing через Store.set (Phase 5 Block A)', () => {
  it('routing через Store.set когда доступен — не пишет в localStorage напрямую', () => {
    const lsSetMock = { calls: [] };
    const storeMock = { set: (k, v) => lsSetMock.calls.push({ k, v }) };
    const ls = { getItem: () => null, setItem: () => {} };
    const lsSetSpy = { setItemCalls: 0 };
    ls.setItem = (...args) => { lsSetSpy.setItemCalls++; };

    const lsSet = makeLsSet(storeMock, ls);
    lsSet('heys_insights_feedback_default', [{ id: 1 }]);

    expect(lsSetMock.calls).toHaveLength(1);
    expect(lsSetMock.calls[0].k).toBe('heys_insights_feedback_default');
    expect(lsSetSpy.setItemCalls).toBe(0); // НЕ должен писать напрямую
  });

  it('routing через localStorage когда Store недоступен (early boot)', () => {
    const ls = { getItem: () => null, setItemCalls: 0, setItem: function(k, v) { this.setItemCalls++; this[k] = v; } };
    const lsSet = makeLsSet(null, ls);
    lsSet('heys_insights_feedback_default', [{ id: 1 }]);

    expect(ls.setItemCalls).toBe(1);
  });

  it('insights_feedback_default теперь идёт через Store.set — без прямого localStorage.setItem', () => {
    // Ранее: heys_insights_feedback_default не был в clientSpecificKeys → падал в localStorage без сжатия
    // Теперь: Store.set вызывается для ЛЮБОГО ключа когда доступен
    const storeCalls = [];
    const storeMock = { set: (k, v) => storeCalls.push(k) };
    const ls = { getItem: () => null, setItem: () => { throw new Error('должен идти через Store'); } };
    const lsSet = makeLsSet(storeMock, ls);

    expect(() => lsSet('heys_insights_feedback_uuid-123', [])).not.toThrow();
    expect(storeCalls).toContain('heys_insights_feedback_uuid-123');
  });
});

describe('storage compress/decompress', () => {
  beforeEach(() => {
    store = {};
    global.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        store[k] = v;
      },
    };
  });

  it('делает roundtrip с префиксом ¤Z¤ или без него', () => {
    const packed = compress(product);
    const unpacked = decompress(packed);

    expect(unpacked).toEqual(product);
  });

  it('разбирает обычный JSON без префикса', () => {
    const plain = JSON.stringify(product);
    const unpacked = decompress(plain);

    expect(unpacked).toEqual(product);
  });

  it('rawGet возвращает default при битых данных', () => {
    store.bad = 'not-json';

    const value = rawGet('bad', { fallback: true });

    expect(value).toEqual({ fallback: true });
  });

  it('rawGet успешно читает сжатое значение', () => {
    const packed = compress(product);
    store.ok = packed;

    const value = rawGet('ok', null);

    expect(value).toEqual(product);
  });
});
