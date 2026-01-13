# HEYS App v12 Refactoring Plan & Progress

## 📋 Executive Summary

**Objective**: Refactor `heys_app_v12.js` (8407 LOC, 421KB) into modular, maintainable components following the successful pattern used for `heys_insulin_wave_v1.js` refactoring (76% LOC reduction).

**Current Status**: Infrastructure complete, ready for module extraction

## ✅ Phase 1: Infrastructure Preparation (COMPLETED)

Created three foundational modules to support safe, gradual rollout:

### 1. `heys_feature_flags_v1.js`
- **Purpose**: Feature flag system for safe module activation
- **Key Features**:
  - Toggle individual modules on/off
  - Phased rollout support (6 phases)
  - Rollback to legacy monolith
  - Persistent flag storage in localStorage
- **API**:
  ```javascript
  HEYS.featureFlags.isEnabled('modular_platform_apis')
  HEYS.featureFlags.enable('modular_pwa')
  HEYS.featureFlags.enablePhase(2) // Enable phases 1-2
  HEYS.featureFlags.rollbackToLegacy() // Emergency rollback
  ```

### 2. `heys_module_perf_v1.js`
- **Purpose**: Performance monitoring for module loading
- **Key Features**:
  - Track module load times
  - Detect slow loads (>500ms warning)
  - Store history (last 10 loads)
  - Export metrics for analysis
- **API**:
  ```javascript
  HEYS.modulePerf.startLoad('module_name')
  HEYS.modulePerf.endLoad('module_name', success, error)
  HEYS.modulePerf.getReport() // Stats by module
  HEYS.modulePerf.printReport() // Console report
  ```

### 3. `heys_module_loader_v1.js`
- **Purpose**: Dynamic module loading with feature flag integration
- **Key Features**:
  - Retry logic (exponential backoff)
  - Timeout protection (10s default)
  - Feature flag checks
  - Parallel batch loading
- **API**:
  ```javascript
  await HEYS.moduleLoader.load('module', 'path.js', {
    required: false,
    retry: 2,
    timeout: 10000,
    flagName: 'modular_platform_apis'
  })
  ```

## 📦 Phase 2: Module Extraction (IN PROGRESS)

### Target Modules

Each module will follow the InsulinWave refactoring pattern:
- **Shim** for backward compatibility
- **Namespace** under `HEYS.PlatformAPIs`, `HEYS.PWA`, etc.
- **Feature flag** control
- **Performance tracking** integration

### Module 1: Platform APIs (`heys_platform_apis_v1.js`)
**Status**: 🔴 Not Started
**Target LOC**: ~1500
**Feature Flag**: `modular_platform_apis`

#### Sections to Extract (Line Numbers):
- **Service Worker Registration** (481-679)
  - SW registration & lifecycle
  - Update detection
  - Background sync
  - Periodic sync
- **Device Capabilities** (847-922)
  - Memory, CPU cores detection
  - Network quality
  - Performance level classification
- **Idle Detection** (924-1010)
  - User return detection
  - Auto-sync trigger
  - Idle time tracking
- **Window Controls Overlay** (1012-1054)
  - Desktop PWA titlebar integration
- **Barcode Detection** (1056-1194)
  - Product barcode scanning
  - Real-time video scanning
- **Web Share** (1196-1260)
  - Content sharing API
- **Contact Picker** (1262-1315)
  - Native contact selection
- **Speech Recognition** (1317-1426)
  - Voice input API
- **Launch Handler** (1428-1470)
  - PWA launch handling
- **Protocol Handler** (1472-1529)
  - Custom protocol registration
- **File System Access** (1531-1739)
  - File read/write APIs
- **Credential Management** (1741-1814)
  - WebAuthn, password management
- **Screen Orientation** (1816-1855)
  - Orientation lock API
- **Fullscreen** (1857-1924)
  - Fullscreen mode control
- **Vibration** (1926-1968)
  - Haptic feedback patterns
- **Web Animations** (1970-2057)
  - Animation utilities

#### Export Structure:
```javascript
HEYS.PlatformAPIs = {
  // Service Worker
  registerServiceWorker,
  triggerSkipWaiting,
  forceUpdateAndReload,
  
  // Storage
  requestPersistent: requestPersistentStorage,
  getEstimate: getStorageEstimate,
  
  // Device
  getDeviceCapabilities,
  
  // Idle Detection
  idle: { start, stop },
  
  // Barcode
  barcode: { isSupported, scanImage, startScanning },
  
  // Web Share
  share: shareContent,
  
  // ... (other APIs)
};
```

### Module 2: PWA Update Manager (`heys_pwa_module_v1.js`)
**Status**: 🔴 Not Started
**Target LOC**: ~1000
**Feature Flag**: `modular_pwa`

#### Sections to Extract (Line Numbers):
- **Version Management** (18-48)
  - Version tracking
  - Semantic version comparison
  - Update lock/unlock
- **Update Badge** (95-182)
  - Notification badge UI
  - Update available indicator
- **Network Quality** (184-236)
  - Connection type detection
  - Adaptive checks
- **Smart Periodic Checks** (204-236)
  - Exponential backoff
  - Network-aware checks
- **Update Modal** (238-397)
  - Update progress UI
  - Stage transitions
  - Reloading screen
- **Manual Refresh Prompt** (398-479)
  - iOS fallback UI
  - Manual update button

#### Export Structure:
```javascript
HEYS.PWA = {
  version: APP_VERSION,
  checkVersion: checkServerVersion,
  showUpdateBadge,
  hideUpdateBadge,
  installUpdate,
  getNetworkQuality,
  smartVersionCheck
};
```

### Module 3: Auth Integration (`heys_auth_integration_v1.js`)
**Status**: 🔴 Not Started
**Target LOC**: ~500
**Feature Flag**: `modular_auth`

**Note**: Auth logic is scattered throughout the file. Need to identify and extract all auth-related code blocks including:
- Supabase token management
- Session handling
- Auth state listeners
- Logout flows

### Module 4: Navigation (`heys_navigation_v1.js`)
**Status**: 🔴 Not Started
**Target LOC**: ~800
**Feature Flag**: `modular_navigation`

**Note**: Needs extraction of:
- Tab navigation logic
- React root rendering
- Route management
- Navigation state

### Module 5: Sync State Machine (`heys_sync_machine_v1.js`)
**Status**: 🔴 Not Started
**Target LOC**: ~600
**Feature Flag**: `modular_sync`

**Note**: Needs extraction of:
- Cloud sync orchestration
- Conflict resolution
- Offline queue
- Sync status tracking

### Module 6: Bootstrap (`heys_bootstrap_v1.js`)
**Status**: 🔴 Not Started
**Target LOC**: ~500
**Feature Flag**: `modular_bootstrap`

**Note**: Needs extraction of:
- App initialization
- Boot logging
- Error boundaries
- Storage initialization

## 🎯 Phase 3: Integration & Testing (NOT STARTED)

### Tasks:
1. **Update `index.html`** with new script loading order:
   ```html
   <!-- Infrastructure (must load first) -->
   <script defer src="heys_dev_utils.js"></script>
   <script defer src="heys_feature_flags_v1.js"></script>
   <script defer src="heys_module_perf_v1.js"></script>
   <script defer src="heys_module_loader_v1.js"></script>
   
   <!-- Modules (conditional via feature flags) -->
   <script defer src="heys_platform_apis_v1.js"></script>
   <script defer src="heys_pwa_module_v1.js"></script>
   <script defer src="heys_auth_integration_v1.js"></script>
   <script defer src="heys_navigation_v1.js"></script>
   <script defer src="heys_sync_machine_v1.js"></script>
   <script defer src="heys_bootstrap_v1.js"></script>
   
   <!-- Main app (reduced size) -->
   <script defer src="heys_app_v12.js"></script>
   ```

2. **Test backward compatibility**:
   - Run with `use_legacy_monolith: true` (default)
   - Verify all features work as before
   
3. **Phased rollout testing**:
   - Phase 1: Enable Platform APIs only
   - Phase 2: Platform APIs + PWA
   - Phase 3-6: Gradual activation
   
4. **Performance benchmarking**:
   - Compare load times
   - Check memory usage
   - Validate cache efficiency

## 📚 Phase 4: Cleanup & Documentation (NOT STARTED)

### Tasks:
1. **Remove extracted code from `heys_app_v12.js`**
   - Conditional removal based on feature flags
   - Keep shims for backward compatibility
   
2. **Add JSDoc documentation**:
   - Document all public APIs
   - Add usage examples
   - Note breaking changes (if any)
   
3. **Update `ARCHITECTURE.md`**:
   - Document new module structure
   - Update file organization diagram
   - Add module dependency graph
   
4. **Create migration guide**:
   - Step-by-step activation instructions
   - Rollback procedures
   - Troubleshooting tips

## 🎉 Success Criteria

- [ ] Main file reduced from 8407 to ~2000 LOC (76% reduction)
- [ ] All existing functionality preserved
- [ ] No breaking changes to public API
- [ ] Feature flags allow safe gradual rollout
- [ ] Performance maintained or improved
- [ ] All tests passing
- [ ] Documentation complete

## 🚀 Next Steps

1. **Extract Module 1 (Platform APIs)**:
   - Create `heys_platform_apis_v1.js`
   - Extract all Platform API sections (see line numbers above)
   - Add feature flag checks
   - Test with `HEYS.featureFlags.enable('modular_platform_apis')`
   
2. **Extract Module 2 (PWA)**:
   - Create `heys_pwa_module_v1.js`
   - Extract PWA update logic
   - Test phased rollout: `HEYS.featureFlags.enablePhase(2)`
   
3. **Continue with remaining modules**...

## 📝 Notes

- **Pattern Reference**: See `REFACTORING_SUMMARY.md` for InsulinWave refactoring success story
- **Module Size**: Target 200-700 LOC per module (maintainable size)
- **Backward Compatibility**: Critical - all existing code must work unchanged
- **Feature Flags**: Use for safe rollout, NOT for long-term A/B testing
- **Performance**: Track with `HEYS.modulePerf`, aim for <100ms load per module

## 🔧 Developer Commands

```javascript
// Check current flags
HEYS.featureFlags.getAll()

// Enable module for testing
HEYS.featureFlags.enable('modular_platform_apis')

// Test full migration
HEYS.featureFlags.enableAllModules()

// Emergency rollback
HEYS.featureFlags.rollbackToLegacy()

// Check module load performance
HEYS.modulePerf.printReport()

// Check module load status
HEYS.moduleLoader.printReport()
```

---

**Last Updated**: 2026-01-13
**Author**: GitHub Copilot Agent
**Status**: Phase 1 Complete, Phase 2 Ready to Start
