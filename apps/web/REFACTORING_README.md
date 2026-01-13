# HEYS App v12 Refactoring

## 🎯 Overview

This refactoring aims to decompose the monolithic `heys_app_v12.js` (8407 LOC) into maintainable, modular components following the successful pattern used for `heys_insulin_wave_v1.js` refactoring (achieved 76% LOC reduction).

## 📚 Documentation

- **[REFACTORING_PLAN.md](./REFACTORING_PLAN.md)** - Comprehensive refactoring plan with line-by-line extraction map
- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - InsulinWave refactoring success story (reference pattern)

## ✅ Phase 1: Infrastructure (COMPLETE)

### Created Modules

1. **`heys_feature_flags_v1.js`** - Feature flag system
   - Safe module activation/deactivation
   - Phased rollout support (6 phases)
   - Emergency rollback capability
   
2. **`heys_module_perf_v1.js`** - Performance monitoring
   - Module load time tracking
   - History & statistics
   - Slow load warnings (>500ms)
   
3. **`heys_module_loader_v1.js`** - Dynamic module loading
   - Retry logic with exponential backoff
   - Feature flag integration
   - Timeout protection

### Testing

Open `test-infrastructure.html` in a browser to test the infrastructure:
```bash
# Start dev server
cd apps/web
python3 -m http.server 8000
# Open http://localhost:8000/test-infrastructure.html
```

Or use the legacy app:
```bash
cd apps/web
open index.html  # macOS
xdg-open index.html  # Linux
start index.html  # Windows
```

## 🔧 Usage Examples

### Feature Flags

```javascript
// Enable a single module
HEYS.featureFlags.enable('modular_platform_apis')

// Phased rollout (enables phases 1-2)
HEYS.featureFlags.enablePhase(2)

// Enable all modules at once (full migration)
HEYS.featureFlags.enableAllModules()

// Emergency rollback to legacy
HEYS.featureFlags.rollbackToLegacy()

// Check current flags
HEYS.featureFlags.getAll()
HEYS.featureFlags.isEnabled('modular_pwa')
```

### Performance Tracking

```javascript
// Manual tracking
HEYS.modulePerf.startLoad('my_module')
// ... module loads ...
HEYS.modulePerf.endLoad('my_module', success, error)

// Get report
HEYS.modulePerf.printReport()  // Console output
const report = HEYS.modulePerf.getReport()  // Programmatic

// Export for analysis
const json = HEYS.modulePerf.export()
```

### Module Loader

```javascript
// Load single module
await HEYS.moduleLoader.load('platform_apis', 'heys_platform_apis_v1.js', {
  required: false,
  retry: 2,
  timeout: 10000,
  flagName: 'modular_platform_apis'
})

// Batch load
await HEYS.moduleLoader.loadAll([
  { name: 'platform_apis', path: 'heys_platform_apis_v1.js', options: {...} },
  { name: 'pwa', path: 'heys_pwa_module_v1.js', options: {...} }
])

// Check status
HEYS.moduleLoader.printReport()
HEYS.moduleLoader.isLoaded('platform_apis')
```

## 🚀 Phase 2: Module Extraction (NEXT)

### Priority Order

1. **Platform APIs** (~1500 LOC) - Lines 481-2057
   - Service Worker, Device Capabilities, Barcode, Web Share, etc.
   
2. **PWA Module** (~1000 LOC) - Lines 18-479
   - Version management, Update UI, Network quality
   
3. **Auth Integration** (~500 LOC) - Scattered
   - Supabase auth, token management
   
4. **Navigation** (~800 LOC) - To be identified
   - Tab navigation, React root, routes
   
5. **Sync Machine** (~600 LOC) - To be identified
   - Cloud sync, conflict resolution
   
6. **Bootstrap** (~500 LOC) - To be identified
   - Init, boot logging, error boundaries

### Extraction Template

For each module, follow this pattern:

```javascript
/**
 * HEYS [Module Name] v1.0
 * Description
 */
(function() {
  'use strict';
  
  const HEYS = window.HEYS = window.HEYS || {};
  
  // Check feature flag
  if (HEYS.featureFlags?.isEnabled('use_legacy_monolith')) {
    console.log('[Module] Skipped (legacy mode)');
    return;
  }
  
  // Module code here...
  
  // Export to HEYS namespace
  HEYS.ModuleName = {
    // API surface
  };
  
  // Performance tracking
  HEYS.modulePerf?.endLoad('module_name', true);
})();
```

## 📋 Checklist for Each Module

- [ ] Create module file `heys_[name]_v1.js`
- [ ] Add feature flag check at top
- [ ] Extract relevant code from main file
- [ ] Add JSDoc documentation
- [ ] Export to HEYS namespace
- [ ] Add to `index.html` with correct load order
- [ ] Test with flag enabled
- [ ] Test with flag disabled (backward compat)
- [ ] Update `REFACTORING_PLAN.md` progress

## 🎯 Success Criteria

- ✅ Main file reduced from 8407 to ~2000 LOC (76%)
- ✅ All features work identically
- ✅ No breaking changes to public API
- ✅ Performance maintained or improved
- ✅ Feature flags allow safe rollout
- ✅ Complete rollback capability

## 🐛 Debugging

### Enable module logging
```javascript
HEYS.featureFlags.enable('dev_module_logging')
HEYS.featureFlags.enable('dev_performance_tracking')
```

### Check what's loaded
```javascript
HEYS.moduleLoader.printReport()
HEYS.modulePerf.printReport()
```

### View boot log (PWA)
```javascript
HEYS.showBootLog()
```

### Enable debug mode
```javascript
HEYS.enableDebug(true)  // Enables vConsole
```

## 🔄 Rollback Procedures

### Immediate Rollback
```javascript
// In browser console or localStorage
HEYS.featureFlags.rollbackToLegacy()
location.reload()
```

### Persistent Rollback
```javascript
// For all users, update default in heys_feature_flags_v1.js:
const DEFAULT_FLAGS = {
  'use_legacy_monolith': true,  // Force legacy mode
  // ... all module flags: false
}
```

## 📊 Monitoring

Track module performance in production:

```javascript
// Export metrics periodically
setInterval(() => {
  const metrics = {
    flags: HEYS.featureFlags.getAll(),
    perf: HEYS.modulePerf.getReport(),
    loader: HEYS.moduleLoader.getReport()
  };
  
  // Send to analytics
  HEYS.analytics?.trackEvent?.('refactoring_metrics', metrics);
}, 60000); // Every minute
```

## 👥 Contributing

1. Always work with feature flags
2. Test both enabled and disabled states
3. Maintain backward compatibility
4. Document all public APIs with JSDoc
5. Update `REFACTORING_PLAN.md` with progress
6. Run infrastructure test before committing

## 📞 Support

See `REFACTORING_PLAN.md` for:
- Detailed line numbers for extraction
- Export structure templates
- Testing procedures
- Next steps

---

**Status**: Phase 1 Complete ✅ | Phase 2 Ready to Start 🚀
