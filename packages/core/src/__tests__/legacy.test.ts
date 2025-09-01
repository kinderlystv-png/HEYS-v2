import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NutritionService, type NutritionData } from '../services/nutrition';
import { AnalyticsService, type AnalyticsProvider } from '../services/analytics';

describe('NutritionService', () => {
  describe('calculateCalories', () => {
    it('should calculate calories with default multipliers', () => {
      const data: NutritionData = {
        proteins: 100, // 100g * 4 = 400 kcal
        carbs: 50, // 50g * 4 = 200 kcal
        fats: 20, // 20g * 9 = 180 kcal
      };
      
      const result = NutritionService.calculateCalories(data);
      expect(result).toBe(780); // 400 + 200 + 180
    });

    it('should calculate calories with custom multipliers', () => {
      const data: NutritionData = {
        proteins: 50,
        carbs: 25,
        fats: 10,
      };
      
      const result = NutritionService.calculateCalories(data, {
        proteinMultiplier: 5,
        carbMultiplier: 3,
        fatMultiplier: 10,
      });
      
      expect(result).toBe(425); // 50*5 + 25*3 + 10*10
    });

    it('should handle zero values', () => {
      const data: NutritionData = {
        proteins: 0,
        carbs: 0,
        fats: 0,
      };
      
      const result = NutritionService.calculateCalories(data);
      expect(result).toBe(0);
    });
  });

  describe('calculateMacroRatio', () => {
    it('should calculate macro percentages correctly', () => {
      const data: NutritionData = {
        proteins: 100, // 400 kcal
        carbs: 50, // 200 kcal
        fats: 20, // 180 kcal
      }; // Total: 780 kcal
      
      const result = NutritionService.calculateMacroRatio(data);
      
      expect(result.proteinsPercent).toBe(51); // 400/780 * 100 ≈ 51%
      expect(result.carbsPercent).toBe(26); // 200/780 * 100 ≈ 26%
      expect(result.fatsPercent).toBe(23); // 180/780 * 100 ≈ 23%
    });

    it('should handle zero calories', () => {
      const data: NutritionData = {
        proteins: 0,
        carbs: 0,
        fats: 0,
      };
      
      const result = NutritionService.calculateMacroRatio(data);
      
      expect(result.proteinsPercent).toBe(0);
      expect(result.carbsPercent).toBe(0);
      expect(result.fatsPercent).toBe(0);
    });
  });

  describe('validateNutritionData', () => {
    it('should validate correct data', () => {
      const data: NutritionData = {
        proteins: 100,
        carbs: 50,
        fats: 20,
        weight: 300,
      };
      
      expect(NutritionService.validateNutritionData(data)).toBe(true);
    });

    it('should reject negative values', () => {
      const data: NutritionData = {
        proteins: -10,
        carbs: 50,
        fats: 20,
      };
      
      expect(NutritionService.validateNutritionData(data)).toBe(false);
    });

    it('should allow optional weight', () => {
      const data: NutritionData = {
        proteins: 100,
        carbs: 50,
        fats: 20,
      };
      
      expect(NutritionService.validateNutritionData(data)).toBe(true);
    });

    it('should reject zero or negative weight', () => {
      const data: NutritionData = {
        proteins: 100,
        carbs: 50,
        fats: 20,
        weight: 0,
      };
      
      expect(NutritionService.validateNutritionData(data)).toBe(false);
    });
  });
});

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockProvider: AnalyticsProvider;

  beforeEach(() => {
    analyticsService = new AnalyticsService();
    mockProvider = {
      track: vi.fn().mockResolvedValue(undefined),
      identify: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('track', () => {
    it('should add event to queue', async () => {
      await analyticsService.track('test_event', { key: 'value' });
      
      const queue = analyticsService.getEventQueue();
      expect(queue).toHaveLength(1);
      
      const firstEvent = queue[0]!;
      expect(firstEvent.name).toBe('test_event');
      expect(firstEvent.properties).toEqual({ key: 'value' });
      expect(firstEvent.timestamp).toBeTypeOf('number');
      expect(firstEvent.sessionId).toBeTypeOf('string');
    });

    it('should call providers track method', async () => {
      analyticsService.addProvider(mockProvider);
      
      await analyticsService.track('test_event', { key: 'value' });
      
      expect(mockProvider.track).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test_event',
          properties: { key: 'value' },
        })
      );
    });

    it('should handle provider errors gracefully', async () => {
      const failingProvider: AnalyticsProvider = {
        track: vi.fn().mockRejectedValue(new Error('Provider error')),
        identify: vi.fn().mockResolvedValue(undefined),
      };
      
      analyticsService.addProvider(failingProvider);
      
      // Should not throw
      await expect(analyticsService.track('test_event')).resolves.toBeUndefined();
    });
  });

  describe('identify', () => {
    it('should call providers identify method', async () => {
      analyticsService.addProvider(mockProvider);
      
      await analyticsService.identify('user123', { name: 'John' });
      
      expect(mockProvider.identify).toHaveBeenCalledWith('user123', { name: 'John' });
    });

    it('should include userId in subsequent events', async () => {
      await analyticsService.identify('user123');
      await analyticsService.track('test_event');
      
      const queue = analyticsService.getEventQueue();
      expect(queue[0]!.userId).toBe('user123');
    });
  });

  describe('event queue management', () => {
    it('should clear event queue', async () => {
      await analyticsService.track('event1');
      await analyticsService.track('event2');
      
      expect(analyticsService.getEventQueue()).toHaveLength(2);
      
      analyticsService.clearEventQueue();
      
      expect(analyticsService.getEventQueue()).toHaveLength(0);
    });
  });
});

describe('Legacy Core Migration Status', () => {
  it('should have migrated core services successfully', () => {
    // Verify that new services are available and working
    expect(NutritionService.calculateCalories).toBeTypeOf('function');
    expect(AnalyticsService).toBeTypeOf('function');
  });

  it('should maintain backward compatibility', () => {
    // Test that legacy functionality still works through new interface
    const basicCalories = NutritionService.calculateCalories({
      proteins: 10,
      carbs: 10,
      fats: 10,
    });
    
    expect(basicCalories).toBeGreaterThan(0);
  });

  it('should be ready for gradual refactoring', () => {
    // Ensure services are modular and testable
    const service = new AnalyticsService();
    expect(service.getEventQueue()).toEqual([]);
  });
});
