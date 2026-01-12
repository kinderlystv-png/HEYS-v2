/**
 * @fileoverview Critical tests for Insulin Wave Module (33 factors)
 * 
 * Проверяет:
 * 1. Continuous GL Multiplier (v3.0.0)
 * 2. Personal Baseline Wave (Age/BMI/Gender)
 * 3. Activity Contexts (Post-workout, etc.)
 * 4. Kcal-based wave reduction
 */

import fs from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';

// Mock global HEYS object
global.HEYS = {
  utils: {
    lsGet: () => null
  },
  Cycle: {
    getCyclePhase: () => ({ insulinWaveMultiplier: 1.0 }),
    getInsulinWaveMultiplier: () => 1.0
  }
};

// Mock window object for modules
global.window = global;

// Load constants module first (creates window.HEYS_IW namespace)
const constantsPath = path.resolve(__dirname, '../heys_iw_constants.js');
const constantsContent = fs.readFileSync(constantsPath, 'utf8');
eval(constantsContent);

// Load the main module (imports from window.HEYS_IW)
const mainPath = path.resolve(__dirname, '../heys_insulin_wave_v1.js');
const mainContent = fs.readFileSync(mainPath, 'utf8');
eval(mainContent);

describe('Insulin Wave Module (Critical)', () => {
  const IW = global.HEYS.InsulinWave;

  it('should be loaded correctly', () => {
    expect(IW).toBeDefined();
    expect(typeof IW.calculate).toBe('function');
  });

  describe('1. Continuous GL Multiplier (v3.0.0)', () => {
    it('should return correct multipliers for key GL points', () => {
      // GL=5 -> ~0.48 (v3.0.0 table)
      const gl5 = IW.calculateContinuousGLMultiplier(5);
      expect(gl5).toBeGreaterThan(0.4);
      expect(gl5).toBeLessThan(0.6);

      // GL=20 -> ~0.85 (actually ~0.91 in v3.5.6)
      const gl20 = IW.calculateContinuousGLMultiplier(20);
      expect(gl20).toBeGreaterThan(0.8);
      expect(gl20).toBeLessThan(0.95);

      // GL=40 -> 1.30 (max)
      const gl40 = IW.calculateContinuousGLMultiplier(40);
      expect(gl40).toBeCloseTo(1.3, 1);
    });
  });

  describe('2. Personal Baseline Wave', () => {
    it('should calculate baseline for standard profile', () => {
      const profile = { age: 25, weight: 70, height: 175, gender: 'Мужской' }; // BMI ~22.8 (Normal)
      const res = IW.calculatePersonalBaselineWave(profile);
      // Base 3.0 * (1 + 0.03 male) = 3.09
      expect(res.baseHours).toBeCloseTo(3.09, 1);
    });

    it('should increase wave for older age and high BMI', () => {
      const profile = { age: 50, weight: 100, height: 175, gender: 'Мужской' }; // BMI ~32.6 (Obese)
      // Age 45-59: +10%
      // BMI 30+: +15%
      // Male: +3%
      // Total: +28% -> 3.0 * 1.28 = 3.84
      const res = IW.calculatePersonalBaselineWave(profile);
      expect(res.baseHours).toBeGreaterThan(3.5);
    });
  });

  describe('3. Activity Contexts', () => {
    it('should detect POST-WORKOUT context', () => {
      const context = IW.calculateActivityContext({
        mealTimeMin: 14 * 60, // 14:00
        mealKcal: 500,
        trainings: [{ time: '13:00', type: 'cardio', duration: 45, kcal: 400 }],
        householdMin: 0,
        steps: 0
      });
      
      expect(context.type).toBe('post');
      expect(context.waveBonus).toBeLessThan(0); // Should reduce wave
    });

    it('should detect PERI-WORKOUT context', () => {
      const context = IW.calculateActivityContext({
        mealTimeMin: 13 * 60 + 15, // 13:15
        mealKcal: 200,
        trainings: [{ time: '13:00', type: 'strength', duration: 60, kcal: 300 }],
        householdMin: 0,
        steps: 0
      });
      
      expect(context.type).toBe('peri');
      expect(context.harmMultiplier).toBeLessThan(1.0); // Should reduce harm
    });
  });

  describe('4. Kcal-based Wave Reduction (v3.5.0)', () => {
    it('should reduce wave significantly for high-kcal workout (POST)', () => {
      // Mock internal helper if needed, or test via calculateActivityContext
      // But calculateActivityContext returns waveBonus based on kcal
      
      const context = IW.calculateActivityContext({
        mealTimeMin: 14 * 60 + 15, // 14:15 (15 min after workout)
        mealKcal: 500,
        trainings: [{ 
          time: '12:00', 
          type: 'cardio', 
          duration: 120, 
          z: [0, 0, 60, 60], // 120 min HIIT -> ~1200 kcal
          kcal: 1200 
        }], 
        householdMin: 0,
        steps: 0
      });

      // v3.7.7: Multiplicative model (not additive)
      // Tier 1 (0-30min) = -40% base
      // kcalMultiplier (1200 ккал) = ×1.50
      // typeBonus (cardio) = ×1.15
      // Combined: -40% × 1.50 × 1.15 = -69% → capped at -60%
      expect(context.waveBonus).toBeLessThanOrEqual(-0.5);
      expect(context.waveBonus).toBeGreaterThanOrEqual(-0.65);
    });
  });
});
