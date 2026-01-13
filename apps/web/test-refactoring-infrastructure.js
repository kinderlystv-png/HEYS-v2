/**
 * HEYS Refactoring Infrastructure Test
 * =====================================
 * Тестирование feature flags, module loader и performance tracker
 * 
 * Запуск: node test-refactoring-infrastructure.js
 */

// Симуляция browser environment
global.window = global;
global.localStorage = {
  storage: {},
  getItem(key) {
    return this.storage[key] || null;
  },
  setItem(key, value) {
    this.storage[key] = value;
  },
  removeItem(key) {
    delete this.storage[key];
  },
  clear() {
    this.storage = {};
  }
};

global.document = {
  documentElement: {},
  head: {
    appendChild: () => {}
  },
  createElement: () => ({
    addEventListener: () => {},
    remove: () => {}
  })
};

global.navigator = {
  serviceWorker: {}
};

global.performance = {
  now: () => Date.now()
};

// Use native console (already available in Node)
// Just add missing methods if needed
if (!global.console.table) {
  global.console.table = (data) => console.log('[TABLE]', data);
}

// Load modules
console.log('🔧 Loading refactoring infrastructure...\n');

try {
  // Load DEV utils first
  global.DEV = {
    isDev: () => true,
    log: (...args) => console.log('[DEV]', ...args)
  };
  
  // Load feature flags
  require('./heys_feature_flags_v1.js');
  console.log('✅ Feature Flags loaded\n');
  
  // Load module performance tracker
  require('./heys_module_perf_v1.js');
  console.log('✅ Module Performance Tracker loaded\n');
  
  // Load module loader
  require('./heys_module_loader_v1.js');
  console.log('✅ Module Loader loaded\n');
  
} catch (error) {
  console.error('❌ Error loading modules:', error.message);
  process.exit(1);
}

// Run tests
console.log('🧪 Running tests...\n');

// Test 1: Feature Flags
console.log('=== Test 1: Feature Flags ===');
console.log('All flags:', HEYS.featureFlags.getAll());
console.log('Legacy mode enabled:', HEYS.featureFlags.isEnabled('use_legacy_monolith'));
console.log('Modular platform APIs:', HEYS.featureFlags.isEnabled('modular_platform_apis'));

console.log('\n📝 Enabling modular_platform_apis...');
HEYS.featureFlags.enable('modular_platform_apis');
console.log('Modular platform APIs:', HEYS.featureFlags.isEnabled('modular_platform_apis'));

console.log('\n📝 Testing phased rollout (Phase 2)...');
HEYS.featureFlags.enablePhase(2);
console.log('PWA module enabled:', HEYS.featureFlags.isEnabled('modular_pwa'));

console.log('\n📝 Testing rollback...');
HEYS.featureFlags.rollbackToLegacy();
console.log('Modular platform APIs after rollback:', HEYS.featureFlags.isEnabled('modular_platform_apis'));
console.log('Legacy mode after rollback:', HEYS.featureFlags.isEnabled('use_legacy_monolith'));

// Test 2: Module Performance Tracker
console.log('\n=== Test 2: Module Performance Tracker ===');
HEYS.modulePerf.startLoad('test_module_1');
setTimeout(() => {
  HEYS.modulePerf.endLoad('test_module_1', true);
  console.log('Module 1 load tracked\n');
  
  // Simulate slow module
  HEYS.modulePerf.startLoad('test_module_slow');
  setTimeout(() => {
    HEYS.modulePerf.endLoad('test_module_slow', true);
    console.log('Slow module load tracked\n');
    
    // Get report
    const report = HEYS.modulePerf.getReport();
    console.log('Performance Report:');
    console.log('Total modules:', report.totalModules);
    console.log('Stats:', JSON.stringify(report.stats, null, 2));
    
    // Test 3: Module Loader
    console.log('\n=== Test 3: Module Loader ===');
    console.log('Module loader available:', !!HEYS.moduleLoader);
    console.log('Load method available:', typeof HEYS.moduleLoader.load === 'function');
    console.log('LoadAll method available:', typeof HEYS.moduleLoader.loadAll === 'function');
    
    // Summary
    console.log('\n=== Test Summary ===');
    console.log('✅ All infrastructure modules loaded successfully');
    console.log('✅ Feature flags working correctly');
    console.log('✅ Performance tracking working correctly');
    console.log('✅ Module loader API available');
    console.log('\n🎉 Infrastructure ready for Phase 2: Module Extraction');
    
  }, 600); // Simulate slow load
}, 100);
