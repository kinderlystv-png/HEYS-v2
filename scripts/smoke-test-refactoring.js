/**
 * 🧪 HEYS Monolith Refactoring Smoke Test
 * 
 * Запуск: Вставить в консоль браузера на http://localhost:3001
 * 
 * Проверяет целостность HEYS.* namespace после каждого шага рефакторинга.
 * Запускать ПЕРЕД и ПОСЛЕ каждого изменения!
 * 
 * @version 1.0.0
 * @date 2026-01-10
 */

(function() {
  console.clear();
  console.log('%c🧪 HEYS Refactoring Smoke Test v1.0', 'font-size: 20px; font-weight: bold; color: #22c55e;');
  console.log('=' .repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    details: []
  };

  function test(name, condition, critical = true) {
    const status = condition ? '✅' : (critical ? '❌' : '⚠️');
    const passed = condition;
    
    if (passed) {
      results.passed++;
    } else if (critical) {
      results.failed++;
    } else {
      results.warnings++;
    }
    
    results.details.push({ name, status, passed, critical });
    console.log(`${status} ${name}`);
    return passed;
  }

  function testFunction(obj, path, fnName) {
    const fn = obj?.[fnName];
    return test(
      `${path}.${fnName}()`,
      typeof fn === 'function',
      true
    );
  }

  function testObject(obj, path, propName) {
    const prop = obj?.[propName];
    return test(
      `${path}.${propName}`,
      prop !== undefined && prop !== null,
      true
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 1. CORE NAMESPACE
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c📦 1. Core Namespace', 'font-weight: bold; color: #3b82f6;');
  
  test('window.HEYS exists', typeof window.HEYS === 'object');
  test('window.React exists', typeof window.React === 'object');
  test('window.ReactDOM exists', typeof window.ReactDOM === 'object');

  // ═══════════════════════════════════════════════════════════
  // 2. PREDICTIVE INSIGHTS (10,410 lines)
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c🔮 2. PredictiveInsights (10,410 lines)', 'font-weight: bold; color: #8b5cf6;');
  
  const PI = window.HEYS?.PredictiveInsights;
  test('HEYS.PredictiveInsights exists', !!PI);
  
  if (PI) {
    // Core functions
    testFunction(PI, 'PI', 'analyze');
    testFunction(PI, 'PI', 'getInsights');
    testFunction(PI, 'PI', 'calculateCrashRisk');
    testFunction(PI, 'PI', 'getWeightPrediction');
    testFunction(PI, 'PI', 'getPatterns');
    
    // UI Components
    test('PI.InsightsTab', typeof PI.InsightsTab === 'function', true);
    test('PI.CrashRiskCard', typeof PI.CrashRiskCard === 'function', false);
    test('PI.WeeklyWrapCard', typeof PI.WeeklyWrapCard === 'function', false);
    
    // Constants
    testObject(PI, 'PI', 'SCIENCE_INFO');
    testObject(PI, 'PI', 'PRIORITY_LEVELS');
  }

  // ═══════════════════════════════════════════════════════════
  // 3. INSULIN WAVE (8,741 lines)
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c🌊 3. InsulinWave (8,741 lines)', 'font-weight: bold; color: #06b6d4;');
  
  const IW = window.HEYS?.InsulinWave;
  test('HEYS.InsulinWave exists', !!IW);
  
  if (IW) {
    // Core calculation
    testFunction(IW, 'IW', 'calculate');
    testFunction(IW, 'IW', 'calculateMultiplier');
    testFunction(IW, 'IW', 'calculateMealMultiplier');
    testFunction(IW, 'IW', 'calculateActivityContext');
    testFunction(IW, 'IW', 'calculateNDTE');
    
    // Advanced features
    testFunction(IW, 'IW', 'calculateIRScore');
    testFunction(IW, 'IW', 'calculateMetabolicFlexibility');
    testFunction(IW, 'IW', 'calculateSatietyScore');
    testFunction(IW, 'IW', 'generateWaveCurve');
    
    // UI Components
    test('IW.InsulinWaveCard', typeof IW.InsulinWaveCard === 'function', false);
    
    // Constants
    testObject(IW, 'IW', 'CONFIG');
    testObject(IW, 'IW', 'GI_CATEGORIES');
  }

  // ═══════════════════════════════════════════════════════════
  // 4. STORAGE SUPABASE (6,010 lines)
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c☁️ 4. Storage/Cloud (6,010 lines)', 'font-weight: bold; color: #f59e0b;');
  
  const cloud = window.HEYS?.cloud;
  test('HEYS.cloud exists', !!cloud);
  
  if (cloud) {
    // Auth
    testFunction(cloud, 'cloud', 'signIn');
    testFunction(cloud, 'cloud', 'signOut');
    testFunction(cloud, 'cloud', 'getStatus');
    
    // Sync
    testFunction(cloud, 'cloud', 'syncClient');
    testFunction(cloud, 'cloud', 'syncProducts');
    
    // RPC
    testFunction(cloud, 'cloud', 'rpc');
    
    // Session
    test('cloud._pinAuthClientId accessible', cloud._pinAuthClientId !== undefined, false);
    test('cloud._rpcOnlyMode accessible', cloud._rpcOnlyMode !== undefined, false);
  }

  // ═══════════════════════════════════════════════════════════
  // 5. DAY (23,645 lines) 
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c📅 5. Day (23,645 lines)', 'font-weight: bold; color: #ef4444;');
  
  const Day = window.HEYS?.Day;
  test('HEYS.Day exists', !!Day);
  
  if (Day) {
    // Main component
    test('Day.DayTab', typeof Day.DayTab === 'function', true);
    
    // Meal components
    test('Day.MealCard', typeof Day.MealCard === 'function', false);
    test('Day.MealProductCard', typeof Day.MealProductCard === 'function', false);
    test('Day.SearchOverlay', typeof Day.SearchOverlay === 'function', false);
    
    // Stats components
    test('Day.MacrosGrid', typeof Day.MacrosGrid === 'function', false);
    test('Day.GoalProgressBar', typeof Day.GoalProgressBar === 'function', false);
    
    // Modals
    test('Day.StepModal', typeof Day.StepModal === 'function', false);
    test('Day.TrainingModal', typeof Day.TrainingModal === 'function', false);
    
    // Utils
    testFunction(Day, 'Day', 'formatTime');
    testFunction(Day, 'Day', 'calcMealTotals');
  }

  // ═══════════════════════════════════════════════════════════
  // 6. SUPPORTING MODULES
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c🔧 6. Supporting Modules', 'font-weight: bold; color: #64748b;');
  
  // Utils
  test('HEYS.utils exists', !!window.HEYS?.utils);
  testFunction(window.HEYS?.utils, 'utils', 'lsGet');
  testFunction(window.HEYS?.utils, 'utils', 'lsSet');
  
  // Products
  test('HEYS.products exists', !!window.HEYS?.products);
  testFunction(window.HEYS?.products, 'products', 'getAll');
  testFunction(window.HEYS?.products, 'products', 'search');
  
  // Ratio Zones
  test('HEYS.ratioZones exists', !!window.HEYS?.ratioZones);
  testFunction(window.HEYS?.ratioZones, 'ratioZones', 'getZone');
  testFunction(window.HEYS?.ratioZones, 'ratioZones', 'getColor');
  
  // Status
  test('HEYS.Status exists', !!window.HEYS?.Status);
  testFunction(window.HEYS?.Status, 'Status', 'calculate');
  
  // Advice
  test('HEYS.Advice exists', !!window.HEYS?.Advice);
  testFunction(window.HEYS?.Advice, 'Advice', 'getAdvice');
  
  // Models
  test('HEYS.models exists', !!window.HEYS?.models);

  // ═══════════════════════════════════════════════════════════
  // 7. FUNCTIONAL TESTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n%c⚡ 7. Functional Tests', 'font-weight: bold; color: #10b981;');
  
  // Test localStorage access
  try {
    const testKey = '_heys_smoke_test_' + Date.now();
    window.HEYS?.utils?.lsSet?.(testKey, { test: true });
    const retrieved = window.HEYS?.utils?.lsGet?.(testKey);
    window.localStorage.removeItem(testKey);
    test('localStorage read/write', retrieved?.test === true);
  } catch (e) {
    test('localStorage read/write', false);
  }
  
  // Test ratio zones calculation
  try {
    const zone = window.HEYS?.ratioZones?.getZone?.(0.95);
    test('ratioZones.getZone(0.95) returns zone', zone?.id === 'perfect' || zone?.id === 'good');
  } catch (e) {
    test('ratioZones.getZone works', false);
  }
  
  // Test InsulinWave calculation (if data available)
  try {
    test('InsulinWave.calculate exists', typeof IW?.calculate === 'function');
  } catch {
    test('InsulinWave.calculate exists', false);
  }

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  
  const total = results.passed + results.failed + results.warnings;
  const passRate = Math.round((results.passed / total) * 100);
  
  const summaryColor = results.failed === 0 ? '#22c55e' : '#ef4444';
  console.log(`%c📊 Results: ${results.passed}/${total} passed (${passRate}%)`, 
    `font-size: 16px; font-weight: bold; color: ${summaryColor};`);
  
  if (results.failed > 0) {
    console.log(`%c❌ FAILED: ${results.failed} critical tests`, 'color: #ef4444; font-weight: bold;');
  }
  if (results.warnings > 0) {
    console.log(`%c⚠️ WARNINGS: ${results.warnings} non-critical`, 'color: #f59e0b;');
  }
  if (results.failed === 0) {
    console.log('%c✅ ALL CRITICAL TESTS PASSED!', 'color: #22c55e; font-weight: bold; font-size: 14px;');
  }
  
  console.log('\n' + '═'.repeat(60));
  
  // Export results for programmatic access
  window._heysSmoke = results;
  console.log('💡 Results stored in window._heysSmoke');
  
  return results;
})();
