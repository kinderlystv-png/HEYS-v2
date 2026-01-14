# Phases 11, 12, 14 Status Report

## Phase 11: Helper Functions ✅ COMPLETED

**File Created**: `heys_day_calculations.js` (231 lines)

### Extracted Functions:
1. **calculateDayTotals(day, pIndex)** - Calculate kcal, macros, GI, harm from meals
2. **computeDailyNorms(optimum, normPerc)** - Calculate absolute norms from percentages
3. **calculateDayAverages(meals, trainings, dayData)** - Calculate mood/wellbeing/stress averages + dayScore
4. **normalizeTrainings(trainings)** - Migrate quality/feelAfter to mood/wellbeing
5. **cleanEmptyTrainings(trainings)** - Filter out empty trainings (all zones = 0)
6. **sortMealsByTime(meals)** - Sort meals chronologically (latest first)
7. **parseTimeToMinutes(timeStr)** - Convert HH:MM to minutes
8. **formatMinutesToTime(minutes)** - Convert minutes to HH:MM
9. **getProductFromItem(item, pIndex)** - Helper to get product from item

### Export Structure:
```javascript
HEYS.dayCalculations = {
  calculateDayTotals,
  computeDailyNorms,
  calculateDayAverages,
  normalizeTrainings,
  cleanEmptyTrainings,
  sortMealsByTime,
  parseTimeToMinutes,
  formatMinutesToTime,
  getProductFromItem
};
```

### Status:
- ✅ Module created and syntax validated
- ✅ Added to index.html
- ⏸️ Integration into main file pending
- 📊 **Estimated lines in main file after integration: ~19,844 lines**

---

## Phase 12: Effects & Side Effects ⚠️ MOSTLY EXTRACTED

### Analysis:
Most effects are already extracted or are small inline effects that don't justify extraction.

### Already Extracted (in heys_day_hooks.js):
- ✅ `useDayAutosave` - Auto-save with debounce
- ✅ `useSmartPrefetch` - Prefetch adjacent days

### Inline Effects (Small, keep as-is):
1. **Date persistence** (line 631) - 1 line
   ```javascript
   useEffect(() => { lsSet('heys_dayv2_date', date); }, [date]);
   ```

2. **API exposure** (lines 599-617) - 18 lines
   - Exposes `HEYS.Day.requestFlush` and cloud sync blockers
   - Too tightly coupled to local state

3. **Advice module ready check** (lines 2938-2953) - 15 lines
   - Polls for HEYS.advice module availability
   - One-time initialization effect

4. **Badge updates** (lines 5011-5017) - 6 lines
   - Updates nav badge for advice count
   - Simple DOM manipulation

5. **Event listeners** (lines 5019-5041, 5044-5060) - 40 lines total
   - heysShowAdvice, heysProductAdded events
   - Small, focused effects

6. **Day averages calculation** (lines 994-1017) - 23 lines
   - Auto-updates mood/wellbeing/stress averages
   - Uses calculateDayAverages from Phase 11

7. **Date change sync** (lines 634-755) - 121 lines
   - Loads day data on date change
   - Complex sync logic, keep inline

8. **Day updated listener** (lines 762-874) - 112 lines
   - Handles heys:day-updated events
   - Complex merge logic, keep inline

### Total Inline Effects: ~336 lines
**Recommendation**: Keep inline - these effects are either:
- Too small to extract (<10 lines)
- Too tightly coupled to local state
- Already well-organized

### Phase 12 Status:
- ⚠️ **No new extraction needed** - main effects already modularized
- 📊 **No line count reduction from Phase 12**

---

## Phase 14: Bottom Sections & Modals ⏸️ DEFERRED

### Analysis:
Modals are complex inline JSX (React.createElement calls) that would be difficult to extract without breaking functionality.

### Identified Modals:
1. **Edit Grams Modal** (lines 18706-18750) - ~44 lines
   - Slider-based gram editor
   - Fallback when AddProductStep not loaded
   
2. **Zone Picker Modal** (lines 18975-19300) - ~325 lines
   - Training zone minutes picker
   - Complex nested structure

3. **Sleep Quality Picker** (lines 19306-19458) - ~152 lines
   - Sleep quality rating modal
   
4. **Day Score Picker** (lines 19459-19600+) - ~141+ lines
   - Day overall score picker

### Total Modal Lines: ~662+ lines

### Extraction Challenges:
1. **Deep state coupling** - Modals use many local state variables
2. **Event handlers** - Each modal has multiple inline handlers
3. **Conditional rendering** - Modals use showTimePicker, showZonePicker, etc.
4. **React.createElement** - Not JSX, harder to refactor
5. **Integration risk** - High chance of breaking UI

### Bottom Sections:
Most "bottom sections" are already extracted:
- ✅ TrainingsSection - Uses TrainingStep module
- ✅ Advice section - Uses AdviceCard module
- ✅ Meal section - Uses MealCard module

**Remaining inline sections**: ~1,000-1,500 lines of statsBlock detailed content (already analyzed in Phase 13)

### Phase 14 Status:
- ⏸️ **Deferred** - High risk, low ROI
- 📊 **Estimated extractable: ~1,662 lines** (662 modals + 1,000 sections)
- ⚠️ **Recommendation**: Keep inline until main file integration is complete and tested

---

## Summary

### Completed:
- ✅ **Phase 11**: 231 lines extracted (helper functions)

### Not Needed:
- ⚠️ **Phase 12**: Effects already modularized or too small

### Deferred:
- ⏸️ **Phase 14**: High complexity, recommend defer

### Total Progress:
- **Phase 10**: 1,066 lines (handlers)
- **Phase 13A**: 243 lines (render components)  
- **Phase 11**: 231 lines (calculations)
- **Total Extracted**: 1,540 lines
- **Target**: 16,000 lines (9.6% complete)

### Recommendation:
Focus on **integration** of existing modules (Phases 10, 11, 13A) into main file before extracting more. This will:
1. Validate extraction approach
2. Reduce main file size
3. Identify any issues with module architecture
4. Make remaining extractions easier to assess

### Next Steps:
1. Integrate Phase 10, 11, 13A modules into heys_day_v12.js
2. Test functionality thoroughly
3. Measure actual line count reduction
4. Reassess remaining phases based on results
