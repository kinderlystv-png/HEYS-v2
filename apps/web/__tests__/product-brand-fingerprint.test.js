import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  await import('../heys_models_v1.js');
});

function makeProduct(brand) {
  return {
    name: 'Йогурт греческий',
    brand,
    simple100: 3,
    complex100: 1,
    protein100: 8,
    badFat100: 1,
    goodFat100: 0,
    trans100: 0,
    fiber100: 0,
    gi: 35,
    harm: 1
  };
}

describe('product brand fingerprint', () => {
  it('keeps legacy fingerprint brand-agnostic but brand fingerprint brand-aware', async () => {
    const a = makeProduct('Простоквашино');
    const b = makeProduct('Село Зелёное');

    const legacyA = await global.HEYS.models.computeProductFingerprint(a);
    const legacyB = await global.HEYS.models.computeProductFingerprint(b);
    const brandA = await global.HEYS.models.computeProductBrandFingerprint(a);
    const brandB = await global.HEYS.models.computeProductBrandFingerprint(b);

    expect(legacyA).toBe(legacyB);
    expect(brandA).not.toBe(brandB);
    expect(brandA).toMatch(/^[a-f0-9]{64}$/);
    expect(brandB).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not create a brand fingerprint for brandless products', async () => {
    await expect(global.HEYS.models.computeProductBrandFingerprint(makeProduct(''))).resolves.toBe('');
  });

  it('parses optional AI brand without making it required', () => {
    const parsed = global.HEYS.models.parseAIProductString(`Название: Йогурт греческий
Бренд: Простоквашино
Ккал: 74
Углеводы: 5
Простые: 5
Сложные: 0
Белок: 7
Жиры: 3
Вредные жиры: 1
Полезные жиры: 2
Транс-жиры: 0
Клетчатка: 0
ГИ: 30
Вред: 1`);

    expect(parsed.missingFields).toEqual([]);
    expect(parsed.product.name).toBe('Йогурт греческий');
    expect(parsed.product.brand).toBe('Простоквашино');

    const brandless = global.HEYS.models.parseAIProductString(`Название: Йогурт греческий
Ккал: 74
Углеводы: 5
Простые: 5
Сложные: 0
Белок: 7
Жиры: 3
Вредные жиры: 1
Полезные жиры: 2
Транс-жиры: 0
Клетчатка: 0
ГИ: 30
Вред: 1`);

    expect(brandless.missingFields).toEqual([]);
    expect(brandless.product.brand).toBeUndefined();
  });

  it('asks AI to split brand from product name', () => {
    const prompt = global.HEYS.models.generateAIProductStringPrompt('Йогурт Простоквашино 2%');

    expect(prompt).toContain('Бренд: X');
    expect(prompt).toContain('вынеси его в "Бренд"');
    expect(prompt).toContain('без бренда');
  });
});
