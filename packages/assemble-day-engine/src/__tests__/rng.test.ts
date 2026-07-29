import { describe, expect, it } from 'vitest';
import { canonicalJson, deterministicFloat, fnv1a32, fnv1a64, mulberry32Once } from '../rng.js';

describe('fnv1a-mulberry32-v1 golden vectors', () => {
  it('matches UTF-8 FNV-1a and Mulberry32 vectors', () => {
    expect(fnv1a32('')).toBe(2166136261);
    expect(fnv1a32('hello')).toBe(1335831723);
    expect(mulberry32Once(0)).toBe(0.26642920868471265);
    expect(deterministicFloat('golden', 'bonus', 0)).toBe(0.025019161868840456);
  });

  it('canonicalizes key order and hashes identically', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(fnv1a64(canonicalJson({ b: 2, a: 1 }))).toBe(fnv1a64(canonicalJson({ a: 1, b: 2 })));
    expect(canonicalJson({ '💩': 2, '\uE000': 1 })).toBe('{"":1,"💩":2}');
  });
});
