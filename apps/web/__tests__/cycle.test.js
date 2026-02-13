/**
 * @fileoverview Critical tests for Menstrual Cycle Module
 * 
 * Проверяет:
 * 1. Фазы цикла (Menstrual, Follicular, etc.)
 * 2. Корректировки норм (Kcal, Water, Insulin)
 * 3. Задержка воды (Water Retention)
 */

import fs from 'fs';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;

// Mock global HEYS object
global.HEYS = {
  utils: {
    lsGet: () => null
  }
};

global.window = global;

// Load the legacy file
const filePath = path.resolve(__dirname, '../heys_cycle_v1.js');
const fileContent = fs.readFileSync(filePath, 'utf8');

// Execute the file in the global scope
eval(fileContent);

describe('Cycle Module (Critical)', () => {
  const Cycle = global.HEYS.Cycle;

  it('should be loaded correctly', () => {
    expect(Cycle).toBeDefined();
    expect(typeof Cycle.getCyclePhase).toBe('function');
  });

  describe('1. Cycle Phases', () => {
    it('should identify Menstrual phase (days 1-5)', () => {
      const phase = Cycle.getCyclePhase(1);
      expect(phase.id).toBe('menstrual');
      expect(phase.kcalMultiplier).toBeGreaterThan(1.0); // Should increase kcal
    });

    it('should identify Follicular phase (days 6-12)', () => {
      const phase = Cycle.getCyclePhase(8);
      expect(phase.id).toBe('follicular');
      expect(phase.kcalMultiplier).toBe(1.0); // Standard kcal
    });

    it('should identify Ovulation (days 13-14)', () => {
      const phase = Cycle.getCyclePhase(14);
      expect(phase.id).toBe('ovulation');
    });

    it('should return null for Luteal phase (days 15+ not tracked)', () => {
      const phase = Cycle.getCyclePhase(20);
      expect(phase).toBeNull();
    });
  });

  describe('2. Multipliers', () => {
    it('should return correct kcal multiplier', () => {
      // Menstrual: 1.05
      expect(Cycle.getKcalMultiplier(1)).toBe(1.05);
      // Follicular: 1.0
      expect(Cycle.getKcalMultiplier(10)).toBe(1.0);
    });

    it('should return correct water multiplier', () => {
      // Menstrual: 1.1 (+10%)
      expect(Cycle.getWaterMultiplier(1)).toBe(1.1);
    });
  });

  describe('3. Water Retention', () => {
    it('should detect water retention days', () => {
      // Days 1-3: High retention
      const info = Cycle.getWaterRetentionInfo(1);
      expect(info.hasRetention).toBe(true);
      expect(info.severity).toBe('high');
      expect(info.kgEstimate).toBeGreaterThan(0);
    });

    it('should not detect retention in follicular phase', () => {
      const info = Cycle.getWaterRetentionInfo(10);
      expect(info.hasRetention).toBe(false);
    });
  });
});

afterAll(() => {
  global.window = originalWindow;
  global.HEYS = originalHEYS;
});
