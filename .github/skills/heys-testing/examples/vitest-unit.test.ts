/**
 * 🧪 Пример unit-теста для HEYS (Vitest)
 * Паттерн: describe → it → expect
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Пример тестируемого модуля
const calculateKcal = (protein: number, carbs: number, fat: number) => {
  return protein * 3 + carbs * 4 + fat * 9; // NET Atwater: protein 3 kcal/g (TEF 25% built-in)
};

const validateProduct = (product: { name: string; kcal100: number }) => {
  if (!product.name || product.name.length < 2) {
    throw new Error('Invalid product name');
  }
  if (product.kcal100 < 0 || product.kcal100 > 900) {
    throw new Error('Invalid kcal value');
  }
  return true;
};

describe('Nutrition Calculations', () => {
  describe('calculateKcal', () => {
    it('should calculate calories correctly', () => {
      // Arrange
      const protein = 10; // 30 kcal
      const carbs = 20;   // 80 kcal
      const fat = 5;      // 45 kcal

      // Act
      const result = calculateKcal(protein, carbs, fat);

      // Assert
      expect(result).toBe(155);
    });

    it('should return 0 for zero macros', () => {
      expect(calculateKcal(0, 0, 0)).toBe(0);
    });

    it('should handle decimal values', () => {
      const result = calculateKcal(10.5, 20.5, 5.5);
      expect(result).toBeCloseTo(163, 1);
    });
  });

  describe('validateProduct', () => {
    it('should accept valid product', () => {
      const product = { name: 'Apple', kcal100: 52 };
      expect(validateProduct(product)).toBe(true);
    });

    it('should reject product with short name', () => {
      const product = { name: 'A', kcal100: 52 };
      expect(() => validateProduct(product)).toThrow('Invalid product name');
    });

    it('should reject product with negative kcal', () => {
      const product = { name: 'Apple', kcal100: -10 };
      expect(() => validateProduct(product)).toThrow('Invalid kcal value');
    });

    it('should reject product with too high kcal', () => {
      const product = { name: 'Oil', kcal100: 1000 };
      expect(() => validateProduct(product)).toThrow('Invalid kcal value');
    });
  });
});

describe('Mocking Example', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should call API with correct params', async () => {
    mockFetch.mockResolvedValueOnce({ data: [] });

    await mockFetch('/api/products', { method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith('/api/products', { method: 'GET' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
