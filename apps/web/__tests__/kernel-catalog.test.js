// kernel-catalog.test.js — общий индекс каталога ядра (id + группировки).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_catalog_v1.js'), 'utf8'));
};

const C = () => globalThis.HEYS.TrainingKernel.catalog;

describe('kernel catalog index', () => {
  beforeAll(setupOnce);

  const items = [
    { id: 'a1', block: 'A', q: 'x' },
    { id: 'a2', block: 'A', q: 'y' },
    { id: 'b1', block: 'B', q: 'x' }
  ];

  it('get / size / ids', () => {
    const idx = C().createIndex(items, { idKey: 'id', groupBy: ['block', 'q'] });
    expect(idx.size).toBe(3);
    expect(idx.get('a2').block).toBe('A');
    expect(idx.get('zzz')).toBe(null);
    expect(idx.ids().sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('by(field, value) — фильтр-группа (fresh slice, порядок исходный)', () => {
    const idx = C().createIndex(items, { groupBy: ['block', 'q'] });
    expect(idx.by('block', 'A').map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(idx.by('q', 'x').map((x) => x.id)).toEqual(['a1', 'b1']);
    expect(idx.by('block', 'ZZ')).toEqual([]);
    expect(idx.by('unindexed', 'x')).toEqual([]);
  });

  it('принимает map (объект id→item)', () => {
    const idx = C().createIndex({ a1: { id: 'a1' }, b1: { id: 'b1' } }, { groupBy: [] });
    expect(idx.size).toBe(2);
    expect(idx.get('b1').id).toBe('b1');
  });
});
