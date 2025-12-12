/**
 * @fileoverview Тесты сжатия/разжатия и безопасного чтения стораджа
 */

import { describe, it, expect, beforeEach } from 'vitest';

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
  harmScore: 2,
};

let store;

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
