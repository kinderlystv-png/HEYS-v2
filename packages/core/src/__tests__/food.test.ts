import { describe, it, expect } from 'vitest';
import { FoodProductSchema, FoodEntrySchema, calculateNutrition } from '../models/food.js';

describe('Food Models', () => {
  describe('FoodProductSchema validation', () => {
    it('should validate a complete food product', () => {
      const product = {
        id: 'test-product',
        name: 'Test Food',
        brand: 'Test Brand',
        category: 'fruits',
        nutrition: {
          calories: 100,
          protein: 5,
          carbs: 20,
          fat: 2,
          fiber: 3,
          sugar: 15,
          sodium: 50,
        },
        perUnit: {
          amount: 100,
          unit: 'g' as const,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = FoodProductSchema.parse(product);
      expect(result).toEqual(product);
    });

    it('should validate minimal food product', () => {
      const product = {
        id: 'test-product',
        name: 'Test Food',
        category: 'fruits',
        nutrition: {
          calories: 100,
          protein: 5,
          carbs: 20,
          fat: 2,
        },
        perUnit: {
          amount: 100,
          unit: 'g' as const,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = FoodProductSchema.parse(product);
      expect(result.name).toBe('Test Food');
      expect(result.nutrition.calories).toBe(100);
    });
  });

  describe('FoodEntrySchema validation', () => {
    it('should validate a food diary entry', () => {
      const entry = {
        id: 'test-entry',
        userId: 'user-123',
        productId: 'product-456',
        amount: 150,
        unit: 'g',
        date: new Date(),
        meal: 'breakfast' as const,
        createdAt: new Date(),
      };

      const result = FoodEntrySchema.parse(entry);
      expect(result).toEqual(entry);
    });

    it('should reject invalid meal type', () => {
      const entry = {
        id: 'test-entry',
        userId: 'user-123',
        productId: 'product-456',
        amount: 150,
        unit: 'g',
        date: new Date(),
        meal: 'invalid-meal',
        createdAt: new Date(),
      };

      expect(() => FoodEntrySchema.parse(entry)).toThrow();
    });
  });

  describe('calculateNutrition function', () => {
    const testProduct = {
      id: 'test-product',
      name: 'Test Food',
      category: 'test',
      nutrition: {
        calories: 100,
        protein: 10,
        carbs: 20,
        fat: 5,
        fiber: 3,
        sugar: 15,
        sodium: 200,
      },
      perUnit: {
        amount: 100,
        unit: 'g' as const,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should calculate nutrition for same amount', () => {
      const result = calculateNutrition(testProduct, 100);
      
      expect(result.calories).toBe(100);
      expect(result.protein).toBe(10);
      expect(result.carbs).toBe(20);
      expect(result.fat).toBe(5);
      expect(result.fiber).toBe(3);
      expect(result.sugar).toBe(15);
      expect(result.sodium).toBe(200);
    });

    it('should calculate nutrition for double amount', () => {
      const result = calculateNutrition(testProduct, 200);
      
      expect(result.calories).toBe(200);
      expect(result.protein).toBe(20);
      expect(result.carbs).toBe(40);
      expect(result.fat).toBe(10);
    });

    it('should calculate nutrition for half amount', () => {
      const result = calculateNutrition(testProduct, 50);
      
      expect(result.calories).toBe(50);
      expect(result.protein).toBe(5);
      expect(result.carbs).toBe(10);
      expect(result.fat).toBe(2.5);
    });

    it('should handle undefined optional fields', () => {
      const productWithoutOptionals = {
        ...testProduct,
        nutrition: {
          calories: 100,
          protein: 10,
          carbs: 20,
          fat: 5,
        },
      };

      const result = calculateNutrition(productWithoutOptionals, 100);
      
      expect(result.calories).toBe(100);
      expect(result.fiber).toBeUndefined();
      expect(result.sugar).toBeUndefined();
      expect(result.sodium).toBeUndefined();
    });

    it('should round to one decimal place', () => {
      const result = calculateNutrition(testProduct, 33);
      
      // 100 * 33/100 = 33
      expect(result.calories).toBe(33);
      // 10 * 33/100 = 3.3
      expect(result.protein).toBe(3.3);
      // 20 * 33/100 = 6.6
      expect(result.carbs).toBe(6.6);
    });
  });
});
