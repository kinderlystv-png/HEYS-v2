// @vitest-environment node
//
// Регрессия 2026-08-02: автолинковка TypeB→TypeA связывала личную запись с
// карточкой каталога по одному лишь имени. 30.05.2026 в каталог попали 12
// повреждённых карточек (белок сохранился, углеводы и жиры обнулились), и у
// клиентов личные записи молча привязались к битым двойникам: «Торт Наполеон»
// стал считаться как 18 ккал/100 г вместо 300.
//
// Инвариант: склейка допустима только при совпадении состава. Расхождение —
// запись остаётся личной копией (TypeB). Потерять склейку безопасно, потерять
// состав — нет.

import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it, vi } from 'vitest';

const overlaySource = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_products_overlay_v1.js'),
  'utf8'
);

function createHarness(sharedIndex) {
  const storeData = new Map();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    HEYS: {
      currentClientId: 'client-1',
      store: {
        get: vi.fn((key, fallback) => storeData.get(key) ?? fallback),
        set: vi.fn((key, value) => storeData.set(key, value)),
      },
      cloud: {
        getCurrentClientId: vi.fn(() => 'client-1'),
        getSharedIndex: vi.fn(() => sharedIndex),
        saveClientKey: vi.fn(),
      },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(overlaySource, context);
  return { context, storeData };
}

// Личная запись клиента: полноценный «Торт Наполеон».
const localNapoleon = {
  id: 'local-1',
  _custom: true,
  in_my_list: true,
  name: 'Торт Наполеон',
  simple100: 30,
  complex100: 0,
  protein100: 6,
  badFat100: 12,
  goodFat100: 6,
  trans100: 0,
  fiber100: 0,
};

describe('OverlayStore TypeB→TypeA autolink', () => {
  it('не привязывает личную запись к одноимённой карточке с другим составом', () => {
    // Карточка каталога — та самая повреждённая: белок есть, жиры и углеводы нулевые.
    // Поля в lowercase, как приходят из базы.
    const shared = new Map([
      ['shared-broken', {
        id: 'shared-broken',
        name: 'Торт Наполеон',
        simple100: 0,
        complex100: 0,
        protein100: 6,
        badfat100: 0,
        goodfat100: 0,
        trans100: 0,
        fiber100: 0,
      }],
    ]);
    const { context, storeData } = createHarness(shared);

    context.HEYS.OverlayStore.applyCloudSnapshot([localNapoleon], { source: 'test' });

    const saved = storeData.get('heys_products_overlay_v2');
    const row = saved.find((r) => r.id === 'local-1');
    expect(row).toBeDefined();
    expect(row._custom).toBe(true);
    expect(row.shared_origin_id).toBeUndefined();
  });

  it('привязывает, когда состав совпадает (разный регистр полей не мешает)', () => {
    const shared = new Map([
      ['shared-ok', {
        id: 'shared-ok',
        name: 'Торт Наполеон',
        simple100: 30,
        complex100: 0,
        protein100: 6,
        badfat100: 12,
        goodfat100: 6,
        trans100: 0,
        fiber100: 0,
      }],
    ]);
    const { context, storeData } = createHarness(shared);

    context.HEYS.OverlayStore.applyCloudSnapshot([localNapoleon], { source: 'test' });

    const saved = storeData.get('heys_products_overlay_v2');
    const row = saved.find((r) => r.id === 'local-1');
    expect(row).toBeDefined();
    expect(row.shared_origin_id).toBe('shared-ok');
    expect(row._custom).toBeUndefined();
  });

  it('расхождение только по жирам тоже блокирует склейку', () => {
    // Тунец: белок совпадает, жиры потеряны — 71 ккал вместо 174.
    const shared = new Map([
      ['shared-tuna', {
        id: 'shared-tuna',
        name: 'Тунец',
        simple100: 0,
        complex100: 0,
        protein100: 23.6,
        badfat100: 0,
        goodfat100: 0,
        trans100: 0,
        fiber100: 0,
      }],
    ]);
    const { context, storeData } = createHarness(shared);

    context.HEYS.OverlayStore.applyCloudSnapshot(
      [{
        id: 'local-tuna',
        _custom: true,
        in_my_list: true,
        name: 'Тунец',
        simple100: 0,
        complex100: 0,
        protein100: 23.6,
        badFat100: 2,
        goodFat100: 9.5,
        trans100: 0,
        fiber100: 0,
      }],
      { source: 'test' }
    );

    const saved = storeData.get('heys_products_overlay_v2');
    const row = saved.find((r) => r.id === 'local-tuna');
    expect(row._custom).toBe(true);
    expect(row.shared_origin_id).toBeUndefined();
  });
});
