# Phase 13: Render Components Analysis

## Discovered JSX Blocks

### 1. statsBlock (lines 12,024 - 15,653)
**Size**: ~3,629 lines (73% of Phase 13 target!)
**Complexity**: VERY HIGH

**Contents**:
- Metrics cards (TDEE, Goal, Eaten, Remaining)
- Caloric debt indicators with NDTE calculations
- BMI context and training day alerts
- Refeed day indicators
- Macro nutrients breakdowns (protein, carbs, fats)
- Fiber and water tracking
- Quality scores and bonuses
- Scientific references (PMID links)
- Interactive popups for each metric

**Dependencies**:
- State: `day`, `prof`, `caloricDebt`, `tdeeResult`, `displayRatioStatus`
- Handlers: `openExclusivePopup`, `haptic`, `openDeficitPicker`
- Calculations: `bmr`, `tdee`, `optimum`, `displayHeroEaten`, etc.
- External modules: `HEYS.Refeed`, `HEYS.TDEE`, `HEYS.CaloricDebt`

**Extraction Strategy**: 
- ⚠️ Too complex to extract as single component
- Better approach: Split into sub-components:
  1. MetricsCards (TDEE, Goal, Eaten, Remaining) - ~800 lines
  2. CaloricDebtAlerts - ~600 lines  
  3. MacroNutrientsSection - ~1,200 lines
  4. DailyGoalsSection (fiber, water, supplements) - ~500 lines
  5. ScientificReferences - ~300 lines

### 2. mealsUI (lines 4,794 - 4,896)
**Size**: ~102 lines (already uses MealCard component!)
**Complexity**: LOW

**Contents**:
- Maps over sortedMealsForDisplay
- Renders meal number badges
- Delegates to MealCard component (already extracted in Phase 2-8)
- "ТЕКУЩИЙ ПРИЁМ" label for current meal

**Dependencies**:
- State: `day`, `products`, `pIndex`
- Handlers: All meal handlers (from Phase 10 modules)
- Component: `MealCard` (already extracted)

**Extraction Strategy**:
- ✅ Can be easily extracted as renderMealsList factory
- Low risk, high value

### 3. goalProgressBar (lines 11,484 - 12,023)
**Size**: ~539 lines
**Complexity**: MEDIUM

**Contents**:
- Circular progress visualization
- Kcal eaten vs goal display
- Confetti animation on goal achievement
- Macro percentages display

**Dependencies**:
- State: `displayHeroEaten`, `displayHeroOptimum`, `currentRatio`, `showConfetti`
- Handlers: `openExclusivePopup`, `haptic`
- CSS animations

**Extraction Strategy**:
- ✅ Can be extracted as GoalProgressBar component
- Medium risk (animations, dynamic styles)

### 4. orphanAlert (lines 11,923 - 12,023)
**Size**: ~100 lines
**Complexity**: LOW

**Contents**:
- Warning about products not used in any meal
- Click to view list
- Dismiss button

**Dependencies**:
- State: `orphanCount`
- Handlers: `openExclusivePopup`, `haptic`

**Extraction Strategy**:
- ✅ Easy extraction
- Low risk

## Revised Phase 13 Strategy

Given the enormous size of statsBlock (3,629 lines), the original plan to extract "5,000 lines in 6-8 hours" is unrealistic for a single phase.

### Recommended Approach: Split Phase 13 into Sub-phases

#### Phase 13A: Easy Wins (2-3 hours)
- Extract `mealsUI` → `renderMealsList()` (~100 lines)
- Extract `orphanAlert` → `OrphanAlert` component (~100 lines)
- Extract `goalProgressBar` → `GoalProgressBar` component (~539 lines)
- **Total**: ~739 lines

#### Phase 13B: Metrics Cards (3-4 hours)
- Extract metrics cards section from statsBlock (~800 lines)
- Create `MetricsCards` component
- Includes: TDEE, Goal, Eaten, Remaining cards

#### Phase 13C: Macro Nutrients (3-4 hours)
- Extract macro section from statsBlock (~1,200 lines)
- Create `MacroNutrientsSection` component
- Includes: Protein, Carbs, Fats breakdown

#### Phase 13D: Daily Goals & Alerts (2-3 hours)
- Extract caloric debt alerts (~600 lines)
- Extract daily goals (fiber, water) (~500 lines)
- Create `CaloricDebtAlerts` and `DailyGoalsSection` components

**Total Phase 13**: ~3,839 lines (vs original 5,000 estimate)
**Time**: 10-14 hours (vs original 6-8 hours)

## Dependencies for Phase 13 Modules

All extracted components will need:
```javascript
{
  // State
  day, prof, date, isMobile,
  displayHeroEaten, displayHeroOptimum, displayHeroRemaining,
  currentRatio, optimum, tdee, bmr,
  caloricDebt, tdeeResult, displayRatioStatus,
  orphanCount, showConfetti,
  
  // Handlers
  openExclusivePopup, haptic,
  openDeficitPicker, setShowConfetti,
  
  // External modules
  HEYS.Refeed, HEYS.TDEE, HEYS.CaloricDebt, HEYS.Toast
}
```

## Next Steps

1. Start with Phase 13A (easy wins) - 739 lines
2. Test integration before moving to 13B
3. Consider whether full statsBlock extraction is worth the effort vs keeping it inline
   - statsBlock is tightly coupled with many calculations
   - Breaking it apart may reduce readability
   - Alternative: Keep as inline JSX, focus on other phases

## Recommendation

**Proceed with Phase 13A only** (mealsUI, orphanAlert, goalProgressBar).

Skip deep statsBlock refactoring for now. The statsBlock, while large, is actually well-organized inline JSX that's easy to navigate. Breaking it into 5+ sub-components may hurt maintainability.

After Phase 13A, move to:
- **Phase 11** (Helper Functions) - 1,500 lines, safer extraction
- **Phase 12** (Effects) - 1,000 lines
- **Phase 14** (Modals) - 3,000 lines

Then reassess if statsBlock refactoring is needed.
