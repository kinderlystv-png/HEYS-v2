/**
 * @fileoverview Critical tests for Menstrual Cycle Module
 */

import fs from 'fs';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;

global.HEYS = {
  utils: { lsGet: () => null },
  currentClientId: '',
  healthFeatures: { isCycleFeatureAvailable: () => true }
};

global.window = global;

const filePath = path.resolve(__dirname, '../heys_cycle_v1.js');
eval(fs.readFileSync(filePath, 'utf8'));

describe('Cycle Module (Critical)', () => {
  const Cycle = global.HEYS.Cycle;

  it('should be loaded correctly', () => {
    expect(Cycle).toBeDefined();
    expect(typeof Cycle.getCyclePhase).toBe('function');
    expect(typeof Cycle.getCycleCountDay).toBe('function');
  });

  describe('1. Cycle Phases', () => {
    it('should identify menstrual phase (days 1-5)', () => {
      const phase = Cycle.getCyclePhase(1);
      expect(phase.id).toBe('menstrual');
      expect(phase.kcalMultiplier).toBe(1.0);
    });

    it('should identify follicular phase (days 6-14)', () => {
      const phase = Cycle.getCyclePhase(8);
      expect(phase.id).toBe('follicular');
      expect(phase.kcalMultiplier).toBe(1.0);
    });

    it('should identify early luteal (days 15-19)', () => {
      const phase = Cycle.getCyclePhase(17);
      expect(phase.id).toBe('early_luteal');
      expect(phase.kcalMultiplier).toBe(1.03);
    });

    it('should identify late luteal (days 20-28)', () => {
      const phase = Cycle.getCyclePhase(20);
      expect(phase).not.toBeNull();
      expect(phase.id).toBe('late_luteal');
      expect(phase.insulinWaveMultiplier).toBe(1.12);
    });
  });

  describe('2. Multipliers', () => {
    it('should return correct kcal multiplier', () => {
      expect(Cycle.getKcalMultiplier(1)).toBe(1.0);
      expect(Cycle.getKcalMultiplier(10)).toBe(1.0);
      expect(Cycle.getKcalMultiplier(20)).toBe(1.05);
    });

    it('should return correct water multiplier', () => {
      expect(Cycle.getWaterMultiplier(1)).toBe(1.10);
      expect(Cycle.getWaterMultiplier(10)).toBe(1.0);
    });
  });

  describe('3. Water Retention', () => {
    it('should detect water retention days 1-5', () => {
      const info = Cycle.getWaterRetentionInfo(1);
      expect(info.hasRetention).toBe(true);
      expect(info.excludeFromTrend).toBe(true);
    });

    it('should detect pre-menstrual retention 26-28', () => {
      const info = Cycle.getWaterRetentionInfo(27);
      expect(info.hasRetention).toBe(true);
      expect(info.excludeFromTrend).toBe(true);
    });

    it('should not detect retention in mid follicular', () => {
      const info = Cycle.getWaterRetentionInfo(10);
      expect(info.hasRetention).toBe(false);
      expect(info.excludeFromTrend).toBe(false);
    });
  });
});

afterAll(() => {
  global.window = originalWindow;
  global.HEYS = originalHEYS;
});
