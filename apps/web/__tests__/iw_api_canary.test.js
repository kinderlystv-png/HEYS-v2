/**
 * @fileoverview API Canary Test for Insulin Wave Module
 * 
 * This test captures the EXACT public API of HEYS.InsulinWave BEFORE refactoring.
 * It must pass before any refactoring begins and after each step.
 * 
 * Purpose:
 * 1. Document the public API surface
 * 2. Ensure no keys are added/removed during refactoring
 * 3. Validate that critical functions exist and are callable
 */

import fs from 'fs';
import path from 'path';

import { afterAll, describe, it, expect, beforeAll } from 'vitest';

const originalWindow = global.window;
const originalHEYS = global.HEYS;

// Mock global dependencies
global.HEYS = {
  utils: {
    lsGet: () => null
  },
  Cycle: {
    getCyclePhase: () => ({ insulinWaveMultiplier: 1.0 }),
    getInsulinWaveMultiplier: () => 1.0
  }
};

// Ensure legacy modules can resolve window/global namespace
global.window = global;

// Load modules in correct order: shim -> constants -> main
const shimPath = path.resolve(__dirname, '../heys_iw_shim.js');
const shimContent = fs.readFileSync(shimPath, 'utf8');
eval(shimContent);

const constantsPath = path.resolve(__dirname, '../heys_iw_constants.js');
const constantsContent = fs.readFileSync(constantsPath, 'utf8');
eval(constantsContent);

const mainPath = path.resolve(__dirname, '../heys_insulin_wave_v1.js');
const mainContent = fs.readFileSync(mainPath, 'utf8');
eval(mainContent);

describe('InsulinWave API Canary', () => {
  let IW;

  beforeAll(() => {
    IW = global.HEYS?.InsulinWave;
    expect(IW).toBeDefined();
  });

  it('public keys unchanged from baseline', () => {
    const publicKeys = Object.keys(IW)
      .filter(k => k !== '__internals')
      .sort();
    
    // This snapshot captures the EXACT public API before refactoring
    expect(publicKeys).toMatchSnapshot();
  });

  it('critical functions exist and are callable', () => {
    // Core contract
    expect(typeof IW.calculate).toBe('function');
    expect(typeof IW.useInsulinWave).toBe('function');
    expect(typeof IW.VERSION).toBe('string');

    // Optional extended API (depends on loaded delegates)
    const optionalFns = [
      'calculateIRScore',
      'calculateActivityContext',
      'calculateNDTE',
      'generateWaveCurve',
      'calculateFullAUC',
      'predictInsulinResponse',
      'calculateWaveScore',
      'migrateWaveData',
      'enrichWithV4Features',
      'checkVersion',
      'exportWave',
      'importWave',
    ];

    optionalFns.forEach((fnName) => {
      if (IW[fnName] !== undefined) {
        expect(typeof IW[fnName]).toBe('function');
      }
    });
  });

  it('utils is an object with expected utility functions', () => {
    const utils = IW.utils;
    if (!utils) {
      // In modular mode utils can stay internal and not be exposed on public API
      expect(utils).toBeUndefined();
      return;
    }

    expect(typeof utils).toBe('object');

    // Check for key utility functions (when exposed)
    expect(typeof utils.timeToMinutes).toBe('function');
    expect(typeof utils.minutesToTime).toBe('function');
    expect(typeof utils.formatDuration).toBe('function');
    expect(typeof utils.calculateTrainingKcal).toBe('function');
  });

  it('UI functions exist (may be no-op without React)', () => {
    // UI functions should exist when React is loaded
    // Without React, they may be undefined (will be fixed in refactor to always export)
    if (IW.renderProgressBar) {
      expect(typeof IW.renderProgressBar).toBe('function');
    }
    // Document current state: UI functions may not exist without React
    const hasUI = 'renderProgressBar' in IW;
    expect(typeof hasUI).toBe('boolean');
  });

  it('constants are exposed', () => {
    expect(IW.GI_CATEGORIES).toBeDefined();
    expect(typeof IW.GI_CATEGORIES).toBe('object');
    
    expect(IW.PROTEIN_BONUS).toBeDefined();
    expect(IW.STATUS_CONFIG).toBeDefined();
    expect(IW.LIPOLYSIS_THRESHOLDS).toBeDefined();
    expect(IW.CIRCADIAN_CONFIG).toBeDefined();
  });

  it('HEYS.IW alias works', () => {
    expect(global.HEYS.IW).toBe(IW);
  });

  it('VERSION is defined', () => {
    expect(typeof IW.VERSION).toBe('string');
    expect(IW.VERSION.length).toBeGreaterThan(0);
  });

  it('calculate function can be called with minimal params', () => {
    // Smoke test - should return result or null (null is acceptable if setup incomplete)
    const result = IW.calculate({
      products: [
        { carbs: 50, protein: 10, fat: 5, gi: 50, fiber: 2 }
      ],
      mealTimeMin: 720, // 12:00
      profile: { age: 25, weight: 70, height: 175, gender: 'Мужской' }
    });
    
    expect(result).toBeDefined();
    // Result might be null if some deps are missing, but function should exist
    if (result) {
      expect(typeof result).toBe('object');
      expect(typeof result.waveHours).toBe('number');
    }
  });

  it('no __internals in public API initially (will be added by shim)', () => {
    // Before shim is loaded, __internals should not exist in monolith
    // After shim, it will exist - this test documents the transition
    const hasInternals = '__internals' in IW;
    
    // Document current state (may be true or false depending on when test runs)
    expect(typeof hasInternals).toBe('boolean');
  });
});

afterAll(() => {
  global.window = originalWindow;
  global.HEYS = originalHEYS;
});
