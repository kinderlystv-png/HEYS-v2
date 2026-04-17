# EWS v3.1 — Quick Verification Checklist

> **5-minute production check** — verify all features work

## 🚀 Quick Start

### 1. Open Browser DevTools (F12)

- **Console** tab
- **Filter:** `ews /`

### 2. Run Auto-Test (copy-paste to console)

```javascript
fetch('/insights/test_ews_v3.1.js')
  .then((r) => r.text())
  .then(eval);
```

### 3. Expected Output

```
✅ Module loaded
✅ All API methods available
✅ Pipeline logs active
✅ All warnings have actionable steps
✅ Trends tracking working
✅ Priority queue operational
🎉 EWS v3.1 verification COMPLETE!
```

---

## ✅ Manual Checklist

### Feature 1: Pipeline Logging

- [ ] Console filter `ews /` shows logs
- [ ] See phases: 🚀 📥 🧮 ✅ 🖥️
- [ ] Table **expanded** by default (not collapsed)
- [ ] All 15 checks visible with status

### Feature 2: Actionable Steps

- [ ] Run: `result.warnings[0].actions`
- [ ] Returns array with 2-3 strings
- [ ] Each action has concrete details (time/numbers)
- [ ] Test random types: SLEEP_DEBT, PROTEIN_DEFICIT, WEEKEND_PATTERN

### Feature 3: Warning Trends

- [ ] localStorage has key `heys_ews_trends_v1`
- [ ] Structure valid: `{ version, trends, lastUpdated }`
- [ ] Console shows `ews / trends` logs
- [ ] Top-3 chronic warnings table visible
- [ ] `result.trends.chronicWarnings` returns array

### Feature 4: Priority Queue

- [ ] Console shows `ews / priority` logs
- [ ] Top-3 priority table visible
- [ ] `result.warnings[0].priorityScore` is number
- [ ] Top-3 have `criticalPriority: true`
- [ ] Top-3 have `priorityLabel: '🔥 Fix First!'`

---

## 🐛 Troubleshooting

| Issue                | Solution                                                            |
| -------------------- | ------------------------------------------------------------------- |
| No logs visible      | Check filter is `ews /` (with space)                                |
| Trends not saving    | Clear localStorage: `localStorage.removeItem('heys_ews_trends_v1')` |
| Priority scores same | Run detection multiple times to build frequency data                |
| Actions undefined    | Hard-refresh (Ctrl+Shift+R) to load v15                             |

---

## 📊 Production Acceptance Criteria

All must pass:

- ✅ Module loads without errors
- ✅ 6 API methods exported
- ✅ Pipeline logs with `ews /` filter
- ✅ All 11 warning types have actions
- ✅ localStorage persistence works
- ✅ Top-3 chronic warnings computed
- ✅ Priority formula: severity × frequency × impact
- ✅ Performance <100ms for 30 days

---

## 🎯 Next Steps

After verification:

1. Test with real client data
2. Integrate UI panel with chronic warnings display
3. Add priority badges (🔥 Fix First!) to warning cards
4. Monitor localStorage size over time
5. Collect user feedback on actionable steps

---

**Version:** 3.1.0  
**Cache-bust:** v15  
**Date:** 15.02.2026
