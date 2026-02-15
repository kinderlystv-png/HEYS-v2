# EWS v3.1 Testing & Verification Guide

> **Version:** 3.1.0  
> **Date:** February 15, 2026  
> **Status:** Production-ready

## Quick Test (2 minutes)

### 1. Open DevTools

- Press `F12` in browser
- Navigate to **Console** tab

### 2. Set Console Filter

```
ews /
```

This will show only EWS-related logs.

### 3. Run Test Script

```javascript
// Copy-paste this line:
fetch('/insights/test_ews_v3.1.js')
  .then((r) => r.text())
  .then(eval);
```

### 4. Expected Output

You should see:

```
🧪 EWS v3.1 Test Suite
========================================
✅ Module loaded
✅ All API methods available
✅ Pipeline logs active
✅ All warnings have actionable steps
✅ Trends tracking working
✅ Priority queue operational
🎉 EWS v3.1 verification COMPLETE!
```

---

## Manual Verification Checklist

### ✅ Feature 1: Pipeline Logging Standard

**Filter:** `ews / detect`

**Expected phases:**

```
ews / detect 🚀 start
ews / detect 📥 input.valid
ews / detect 🧮 compute
  ews / detect 🧮   ✅ check_1: { name: 'HealthScore', status: 'WARNING' }
  ews / detect 🧮   ➖ check_2: { name: 'Patterns', status: 'clean' }
  ...
ews / detect ✅ result
ews / detect 🖥️ ui.summary - All 15 Checks
  [TABLE]
ews / detect 🖥️ ui.complete
```

**Verification steps:**

1. Console filter shows `ews / detect` logs
2. All 5 phases present (🚀📥🧮✅🖥️)
3. Table is **expanded** by default (not collapsed)
4. All 15 checks logged with emojis (✅/➖/⏭️)

---

### ✅ Feature 2: Actionable Steps

**Check:** Each warning has `actions` array

**Expected structure:**

```javascript
warning.actions = [
  'Конкретное действие 1 с цифрами/временем',
  'Конкретное действие 2 с измеримыми параметрами',
  'Конкретное действие 3 связано с контекстом',
];
```

**Verification steps:**

1. Run: `result.warnings[0].actions`
2. Should return array with 2-3 strings
3. Each action should be client-friendly (no jargon)
4. Check random warning types: `SLEEP_DEBT`, `BINGE_RISK`, `WEIGHT_PLATEAU`

**Sample actions:**

- SLEEP_DEBT: "Установите будильник на отбой сон за 8 часов до подъёма"
- PROTEIN_DEFICIT: "Добавьте 20-40г белка к каждому приёму пищи"
- WEEKEND_PATTERN: "Включите выходные в недельный план: calorie cycling 80/20"

---

### ✅ Feature 3: Warning Trends Tracking

**Filter:** `ews / trends`

**Expected logs:**

```
ews / trends 🚀 load
ews / trends ✅ load.success: { warningTypes: 3, lastUpdated: '2026-02-15' }
ews / trends 📥 input
ews / trends 🧮 compute.frequencies
ews / trends ✅ result: { topChronicCount: 3 }
ews / trends 🖥️ ui.chronic_warnings - Top 3
  [TABLE]
```

**Verification steps:**

1. Open DevTools → Application → Local Storage
2. Find key: `heys_ews_trends_v1`
3. Structure should be:
   ```json
   {
     "version": 1,
     "trends": {
       "SLEEP_DEBT": {
         "occurrences": [
           {
             "date": "2026-02-15",
             "timestamp": 1739577600000,
             "severity": "high"
           }
         ],
         "frequency14d": 3,
         "frequency30d": 7
       }
     },
     "lastUpdated": "2026-02-15"
   }
   ```
4. Run `detectEarlyWarnings()` multiple times → frequencies should increment
5. Check `result.trends.chronicWarnings` → should return top-3 by frequency30d

**localStorage validation:**

```javascript
// Check trends are saved
const trends = JSON.parse(localStorage.getItem('heys_ews_trends_v1'));
console.table(
  Object.entries(trends.trends).map(([type, data]) => ({
    Type: type,
    '14d': data.frequency14d,
    '30d': data.frequency30d,
    Last: data.occurrences[data.occurrences.length - 1].date,
  })),
);
```

---

### ✅ Feature 4: Priority Queue

**Filter:** `ews / priority`

**Expected logs:**

```
ews / priority 🚀 start
ews / priority 🧮 compute: { formula: 'severity_weight × frequency14d × health_impact' }
ews / priority ✅ result: { top3Types: ['SLEEP_DEBT', 'STRESS_ACCUMULATION', ...] }
ews / priority 🖥️ ui.top3 - Critical Priority
  [TABLE]
```

**Verification steps:**

1. Check `result.warnings[0]` structure:
   ```javascript
   {
     type: 'SLEEP_DEBT',
     severity: 'high',
     priorityScore: 855,        // severity(3) × freq(3) × impact(95)
     frequency14d: 3,
     healthImpact: 95,
     severityWeight: 3,
     criticalPriority: true,   // Only top-3
     priorityLabel: '🔥 Fix First!',
     actions: [...]
   }
   ```
2. Verify top-3 have `criticalPriority: true`
3. Check `result.criticalPriority` array contains exactly top-3
4. Verify sorting: warnings are ordered by `priorityScore` descending

**Priority formula validation:**

```javascript
// Manual calculation for first warning
const w = result.warnings[0];
const calculatedScore = w.severityWeight * w.frequency14d * w.healthImpact;
console.assert(w.priorityScore === calculatedScore, 'Priority score mismatch!');
```

---

## Production Verification (on real data)

### Step 1: Load real client data

```javascript
const clientId = HEYS.cloud.currentClientId;
const profile = HEYS.getProfile();
const pIndex = HEYS.InsightsPI?.patterns?.computeAll?.() || {};

// Load 30 days of real data
const days = [];
for (let i = 29; i >= 0; i--) {
  const date = new Date();
  date.setDate(date.getDate() - i);
  const dayData = HEYS.Day.get(date);
  if (dayData) days.push(dayData);
}
```

### Step 2: Run detection

```javascript
const result = HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex, {
  currentPatterns: pIndex,
});

console.log('Production test results:', {
  warnings: result.count,
  highSeverity: result.highSeverityCount,
  chronicIssues: result.trends.chronicWarnings.length,
  criticalPriority: result.criticalPriority.length,
});
```

### Step 3: Verify with filter `ews /`

- All pipeline phases should show
- Chronic warnings table should display top-3
- Priority queue should mark 🔥 Fix First!

---

## Integration Test: UI Panel

### Check if warnings display correctly

```javascript
// Warnings should be accessible in global scope
HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex);

// UI should render:
// 1. Warning count badge
// 2. List of warnings with actions
// 3. Chronic warnings section (if trends exist)
// 4. Priority badges (🔥 Fix First!)
```

### Expected UI elements:

- ⚠️ Warning count: "3 active warnings"
- 🔥 Critical priority badge on top-3
- 📊 Chronic warnings section with 14d/30d frequencies
- 📋 Actions list (2-3 bullets per warning)

---

## Performance Checks

### Timing benchmarks:

```javascript
console.time('EWS v3.1 full detection');
const result = HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex);
console.timeEnd('EWS v3.1 full detection');
// Expected: <100ms for 30 days
```

### localStorage size:

```javascript
const trendsSize = new Blob([localStorage.getItem('heys_ews_trends_v1')]).size;
console.log('Trends storage:', trendsSize, 'bytes');
// Expected: <10KB for 30 days of data
```

---

## Regression Tests

### Test backward compatibility:

```javascript
// Old API should still work
const oldResult = HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex);
console.assert(oldResult.available === true, 'Old API broken!');
console.assert(Array.isArray(oldResult.warnings), 'Warnings not array!');
console.assert(typeof oldResult.count === 'number', 'Count not number!');
```

### Test edge cases:

```javascript
// Empty data
const emptyResult = HEYS.InsightsPI.EarlyWarning.detect([], profile, pIndex);
console.assert(emptyResult.available === false, 'Should reject empty days');
console.assert(
  emptyResult.reason === 'insufficient_data',
  'Wrong error reason',
);

// Insufficient data (<7 days)
const fewDays = days.slice(0, 5);
const fewResult = HEYS.InsightsPI.EarlyWarning.detect(fewDays, profile, pIndex);
console.assert(fewResult.available === false, 'Should reject <7 days');
```

---

## Success Criteria

All tests must pass:

- ✅ Module loads without errors
- ✅ All 6 API methods exported (`detect`, `trackTrends`, `prioritize`,
  `thresholds`, `healthImpact`, `version`)
- ✅ Pipeline logs visible with `ews /` filter
- ✅ All 11 warning types have 2-3 actions
- ✅ Trends persist in localStorage
- ✅ Top-3 chronic warnings computed correctly
- ✅ Priority queue sorts by formula
- ✅ Top-3 marked with `criticalPriority: true`
- ✅ No console errors
- ✅ Performance <100ms for 30 days

---

## Troubleshooting

### Issue: No logs visible

**Solution:** Check console filter is set to `ews /` (not `ews/` without space)

### Issue: Trends not saving

**Solution:** Check localStorage quota not exceeded. Clear old data:
`localStorage.removeItem('heys_ews_trends_v1')`

### Issue: Priority scores all same

**Solution:** Run detection multiple times over several days to build frequency
data

### Issue: Actions field undefined

**Solution:** Hard-refresh page (Ctrl+Shift+R) to clear cache and load v15

---

## Support

**Version:** 3.1.0  
**Cache-bust:** v15  
**Module:** `apps/web/insights/pi_early_warning.js`  
**Docs:** `HEYS_Insights_v5_Deep_Analytics_c7.md` Section 9.1

**Report issues:** Include console output with filter `ews /` and localStorage
snapshot.
