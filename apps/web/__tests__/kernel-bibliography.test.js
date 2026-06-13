// kernel-bibliography.test.js — общий реестр источников (механизм ядра).

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
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_bibliography_v1.js'), 'utf8'));
};

const KB = () => globalThis.HEYS.TrainingKernel.bibliography;

describe('kernel bibliography registry', () => {
  beforeAll(setupOnce);

  it('createRegistry из массива: get/resolve/missing/strengthOf', () => {
    const reg = KB().createRegistry([
      { id: 'a', strength: 'A' }, { id: 'b', strength: 'C' }
    ]);
    expect(reg.size).toBe(2);
    expect(reg.get('a').strength).toBe('A');
    expect(reg.get('zzz')).toBe(null);
    expect(reg.resolve(['a', 'zzz', 'b']).map((x) => x.id)).toEqual(['a', 'b']);
    expect(reg.missing(['a', 'zzz'])).toEqual(['zzz']);
    expect(reg.strengthOf('b')).toBe('C');
    expect(reg.strengthOf('zzz')).toBe(null);
  });

  it('createRegistry из map (объект id→item)', () => {
    const reg = KB().createRegistry({ x: { id: 'x' }, y: { id: 'y' } });
    expect(reg.size).toBe(2);
    expect(reg.get('y').id).toBe('y');
    expect(reg.missing(['x', 'q'])).toEqual(['q']);
  });

  it('кастомный idKey', () => {
    const reg = KB().createRegistry([{ key: 'k1' }], { idKey: 'key' });
    expect(reg.get('k1').key).toBe('k1');
  });
});
