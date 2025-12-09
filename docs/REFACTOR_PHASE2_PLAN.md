# Phase 2 Refactoring Plan: Modal Extraction

**Date**: 2025-12-09  
**Status**: 🟡 READY TO START (awaiting Phase 1 validation)  
**Risk Level**: ⚡ LOW-MEDIUM - Modals have clear boundaries but share parent state  
**Estimated Time**: ~1-1.5 hours  
**Target Reduction**: ~1,000-1,200 lines

---

## 📊 Current State After Phase 1

| Metric | Value |
|--------|-------|
| **heys_day_v12.js** | 14,893 lines |
| **Reduction from Phase 1** | -754 lines (-4.8%) |
| **Remaining to target** | ~12,893 lines (target: 2,000) |
| **Phase 2 target** | Remove ~1,000 lines |

---

## 🎯 Modals to Extract

### Priority 1: Simple Self-Contained Modals (✅ LOW RISK)

#### 1. **SleepQualityPicker** (lines 14487-14637, ~150 lines)
**Props needed:**
```javascript
{
  isOpen: boolean,
  value: number,           // 0-10
  note: string,
  sleepHours: number,
  onConfirm: (value, note) => void,
  onCancel: () => void,
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd
}
```
**Dependencies**: Navigator.vibrate, haptic helpers
**State**: pendingSleepQuality, pendingSleepNote (local or prop)
**Complexity**: ⭐⭐ Medium (has slider, presets, mood-based UI)

#### 2. **DayScorePicker** (lines 14640-14763, ~123 lines)
**Props needed:**
```javascript
{
  isOpen: boolean,
  value: number,          // 0-10
  comment: string,
  autoScore: number,      // calculated from meals
  onConfirm: (value, comment) => void,
  onCancel: () => void,
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd
}
```
**Dependencies**: Navigator.vibrate
**State**: pendingDayScore, pendingDayComment (local or prop)
**Complexity**: ⭐⭐ Medium (similar to SleepQualityPicker)

#### 3. **ZoneMinutesPicker** (lines 14158-14191, ~33 lines)
**Props needed:**
```javascript
{
  isOpen: boolean,
  zoneIndex: number,      // 0-3
  value: number,          // minutes
  kcalPerMin: number,     // for zone
  onConfirm: (value) => void,
  onCancel: () => void,
  WheelColumn: Component,  // from heys_day_pickers
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd
}
```
**Dependencies**: WheelColumn component, r0 helper
**State**: pendingZoneMinutes (local or prop)
**Complexity**: ⭐ Low (simple wheel picker)

---

### Priority 2: Complex Modals (🟡 MEDIUM RISK)

#### 4. **EditGramsModal** (lines 14017-14155, ~138 lines)
**Props needed:**
```javascript
{
  isOpen: boolean,
  product: Product,
  initialGrams: number,
  portions: Array<{name, grams}>,
  lastPortionGrams: number | null,
  onConfirm: (grams) => void,
  onCancel: () => void,
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd,
  handleEditGramsDrag: (e) => void
}
```
**Dependencies**: haptic, editGramsInputRef
**State**: editGramsValue (controlled)
**Complexity**: ⭐⭐⭐ High (slider, drag, presets, portions, input)

#### 5. **TimePickerModal** (lines 13223-14016, ~793 lines) ⚠️
**DEFER TO LATER** - Too complex, multi-step, tightly coupled
- Step 1: Time selection
- Step 2: Mood/wellbeing/stress
- Meal type preview
- Multiple animations
- Night time detection

---

## 📁 Target File Structure

```
apps/web/heys_day_modals/
├── SleepQualityPicker.js      (~170 lines with wrapper)
├── DayScorePicker.js          (~140 lines with wrapper)
├── ZoneMinutesPicker.js       (~50 lines with wrapper)
└── EditGramsModal.js          (~160 lines with wrapper)
```

**Total**: ~520 lines in modules + ~50 lines imports = ~570 lines
**Net reduction**: ~1,000 lines removed - 50 lines imports = **-950 lines**

---

## 🔧 Extraction Pattern

### Template for Modal Component

```javascript
// heys_day_modals/SleepQualityPicker.js
;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  function SleepQualityPicker({
    isOpen,
    value,
    note,
    sleepHours,
    onConfirm,
    onCancel,
    handleSheetTouchStart,
    handleSheetTouchMove,
    handleSheetTouchEnd
  }) {
    if (!isOpen) return null;
    
    const [pendingValue, setPendingValue] = React.useState(value);
    const [pendingNote, setPendingNote] = React.useState(note || '');
    
    React.useEffect(() => {
      if (isOpen) {
        setPendingValue(value);
        setPendingNote(note || '');
      }
    }, [isOpen, value, note]);
    
    const handleConfirm = () => {
      onConfirm(pendingValue, pendingNote);
    };
    
    // Modal JSX here...
    return ReactDOM.createPortal(
      React.createElement('div', { className: 'time-picker-backdrop', onClick: onCancel },
        // Modal content...
      ),
      document.body
    );
  }
  
  HEYS.DayModals = HEYS.DayModals || {};
  HEYS.DayModals.SleepQualityPicker = SleepQualityPicker;
  
})(typeof window !== 'undefined' ? window : global);
```

### Usage in heys_day_v12.js

```javascript
// Import
const DayModals = HEYS.DayModals || {};
const SleepQualityPicker = DayModals.SleepQualityPicker;

// In DayTab component
return (
  <>
    {/* Existing content */}
    
    {SleepQualityPicker && React.createElement(SleepQualityPicker, {
      isOpen: showSleepQualityPicker,
      value: day.sleepQuality || 0,
      note: day.sleepNote || '',
      sleepHours: day.sleepHours || 0,
      onConfirm: (value, note) => {
        setDay(prev => ({ ...prev, sleepQuality: value, sleepNote: note }));
        setShowSleepQualityPicker(false);
        haptic('success');
      },
      onCancel: () => setShowSleepQualityPicker(false),
      handleSheetTouchStart,
      handleSheetTouchMove,
      handleSheetTouchEnd: () => handleSheetTouchEnd(() => setShowSleepQualityPicker(false))
    })}
  </>
);
```

---

## ⚠️ Challenges & Considerations

### 1. **Shared Touch Handlers**
**Issue**: `handleSheetTouchStart`, `handleSheetTouchMove`, `handleSheetTouchEnd` are defined in DayTab
**Solution**: Pass as props or extract to shared utility

### 2. **State Management**
**Issue**: Modals use `pendingSleepQuality`, `pendingDayScore`, etc. from parent
**Solution**: 
- Option A: Keep state in modal (local useState)
- Option B: Pass controlled state as props
- **Recommended**: Option A for encapsulation

### 3. **Haptic Feedback**
**Issue**: `haptic()` helper used throughout
**Solution**: Already available via `HEYS.dayUtils.haptic`

### 4. **Navigator.vibrate**
**Issue**: Direct browser API calls
**Solution**: Keep as-is, works in modals

---

## 🧪 Testing Checklist

After extraction, verify:

- [ ] Sleep Quality Picker opens and closes
- [ ] Sleep Quality value updates correctly
- [ ] Sleep Quality note saves
- [ ] Day Score Picker opens and closes
- [ ] Day Score value updates correctly
- [ ] Day Score comment saves
- [ ] Zone Minutes Picker updates training zones
- [ ] Edit Grams Modal updates product grams
- [ ] All sliders respond smoothly
- [ ] Touch gestures (swipe down to close) work
- [ ] Vibration/haptic feedback works
- [ ] Dark mode styling preserved

---

## 📋 Implementation Steps

### Step 1: Extract SleepQualityPicker (30 min)
1. Create `heys_day_modals/SleepQualityPicker.js`
2. Copy modal code (lines 14487-14637)
3. Wrap in IIFE with proper props
4. Add to index.html before heys_day_v12.js
5. Update heys_day_v12.js to use component
6. Remove old inline code
7. Test

### Step 2: Extract DayScorePicker (20 min)
1. Create `heys_day_modals/DayScorePicker.js`
2. Copy modal code (lines 14640-14763)
3. Similar process as Step 1
4. Test

### Step 3: Extract ZoneMinutesPicker (15 min)
1. Create `heys_day_modals/ZoneMinutesPicker.js`
2. Copy modal code (lines 14158-14191)
3. Similar process
4. Test

### Step 4: Extract EditGramsModal (25 min)
1. Create `heys_day_modals/EditGramsModal.js`
2. Copy modal code (lines 14017-14155)
3. Handle drag logic carefully
4. Test

### Step 5: Commit & Document (10 min)
1. Run syntax checks
2. Update progress report
3. Commit changes
4. Reply to user comment

---

## 🎯 Success Criteria

- [ ] All 4 modals extracted to separate files
- [ ] heys_day_v12.js reduced by ~950 lines
- [ ] No breaking changes to functionality
- [ ] All modals open/close correctly
- [ ] All state updates work as before
- [ ] Syntax checks pass
- [ ] HMR works for modal changes

---

## 🚫 Out of Scope (Phase 3+)

- **TimePickerModal** - Too complex, 800+ lines with multi-step logic
- **TrainingPickerModal** - Complex, depends on TimePickerModal pattern
- **Other modals** - Defer to later phases

---

## 📝 Notes

- Phase 2 focuses on **simple, self-contained modals**
- Complex modals (TimePicker, TrainingPicker) deferred to avoid risk
- Pattern established here will be reused for Phase 3 (charts) and Phase 4 (components)
- Each modal is independent - can extract one at a time safely

---

**Ready to proceed**: ✅ YES (after Phase 1 validation)  
**Blockers**: None (Phase 1 complete, modals are isolated)  
**Next**: Await user confirmation to continue
