// fingers-block-catalog-kernel.test.js — ПРОД-ПОРЯДОК загрузки: kernel-индекс
// грузится ПЕРЕД fingers block_catalog (как в бандлере). Регрессионный тест на
// баг, который не ловится при загрузке домена без kernel (fallback-ветка):
// validate() и atomsByBlock должны работать на kernel-индексе.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const evK = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(KERNEL_DIR, f), 'utf8')); };
  const evF = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  // production order: kernel FIRST
  evK('heys_kernel_catalog_v1.js');
  evF('heys_fingers_quality_catalog_v1.js');
  evF('heys_fingers_grips_catalog_v1.js');
  evF('heys_fingers_block_catalog_v1.js');
};

const BC = () => globalThis.HEYS.Fingers.blockCatalog;

describe('fingers block_catalog — kernel-индекс активен (прод-порядок)', () => {
  beforeAll(setupOnce);

  it('kernel загружен и используется', () => {
    expect(globalThis.HEYS.TrainingKernel.catalog).toBeTruthy();
  });

  it('validate() в kernel-порядке без ошибок (полная проверка)', () => {
    const res = BC().validate();
    expect(res).toBeTruthy();
    expect(res.errors).toEqual([]);
  });

  it('getAtom / atomsByBlock / atomsByQuality работают на kernel-индексе', () => {
    const firstId = BC().ATOMS[0].id;
    expect(BC().getAtom(firstId)).toBeTruthy();
    const blockWithAtoms = BC().BLOCKS.find((b) => BC().atomsByBlock(b.id).length > 0);
    expect(blockWithAtoms).toBeTruthy();
    expect(BC().getBlock(blockWithAtoms.id).atomIds.length).toBeGreaterThan(0);
  });
});
