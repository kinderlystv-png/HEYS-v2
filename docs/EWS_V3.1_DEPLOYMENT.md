# EWS v3.1 — Production Deployment Guide

> **Quick deployment checklist** для запуска v3.1 в production

## 🚀 Pre-deployment Checklist

### 1. Verify Files

```bash
# Check cache-bust version
grep "pi_early_warning.js?v=" apps/web/index.html
# Expected: v=15

# Check module version
grep "version: '3.1.0'" apps/web/insights/pi_early_warning.js
# Expected: 1 match

# Check file size
ls -lh apps/web/insights/pi_early_warning.js
# Expected: ~100KB, 2425 lines
```

### 2. No Syntax Errors

```bash
# Validate JavaScript syntax (if you have Node.js)
node --check apps/web/insights/pi_early_warning.js
# Expected: no output = success
```

### 3. Clear Browser Cache

```javascript
// Option A: Hard refresh
// Windows/Linux: Ctrl + Shift + R
// Mac: Cmd + Shift + R

// Option B: Clear cache programmatically (console)
caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
location.reload(true);
```

---

## 📦 Deployment Steps

### Step 1: Deploy to Production Server

```bash
# Copy updated files to production
scp apps/web/insights/pi_early_warning.js user@prod-server:/path/to/heys/insights/
scp apps/web/index.html user@prod-server:/path/to/heys/

# Or commit to git and deploy via CI/CD
git add apps/web/insights/pi_early_warning.js apps/web/index.html
git commit -m "feat(ews): upgrade to v3.1 - trends + priority + actions"
git push origin main
```

### Step 2: Verify Deployment

```javascript
// Open production site in browser
// F12 → Console → run:

// Check version
console.log('EWS version:', HEYS.InsightsPI.EarlyWarning.version);
// Expected: '3.1.0'

// Check API methods
console.log('API methods:', Object.keys(HEYS.InsightsPI.EarlyWarning));
// Expected: ['detect', 'trackTrends', 'prioritize', 'thresholds', 'healthImpact', 'version']
```

### Step 3: Run Production Test

```javascript
// In console (set filter to: ews / )
fetch('/insights/test_ews_v3.1.js')
  .then((r) => r.text())
  .then(eval);

// Expected output:
// ✅ Module loaded
// ✅ All API methods available
// ✅ Pipeline logs active
// ✅ All warnings have actionable steps
// ✅ Trends tracking working
// ✅ Priority queue operational
// 🎉 EWS v3.1 verification COMPLETE!
```

---

## 🔍 Smoke Tests (Manual)

### Test 1: Basic Detection (30 seconds)

```javascript
// Get real client data
const profile = HEYS.getProfile();
const pIndex = HEYS.InsightsPI?.patterns?.computeAll?.() || {};

// Load 30 days
const days = [];
for (let i = 29; i >= 0; i--) {
  const date = new Date();
  date.setDate(date.getDate() - i);
  const dayData = HEYS.Day.get(date);
  if (dayData) days.push(dayData);
}

// Run detection
const result = HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex, {
  currentPatterns: pIndex,
});

// Verify result structure
console.assert(result.available === true, '❌ Detection failed');
console.assert(Array.isArray(result.warnings), '❌ Warnings not array');
console.assert(result.trends !== null, '❌ Trends missing');
console.assert(Array.isArray(result.criticalPriority), '❌ Priority missing');
console.log('✅ Basic detection PASSED');
```

### Test 2: Pipeline Logging (10 seconds)

```javascript
// Set console filter to: ews /
// Run detection again (code from Test 1)
// Verify you see:
// ✅ ews / detect 🚀 start
// ✅ ews / detect 📥 input.valid
// ✅ ews / detect 🧮 compute
// ✅ ews / detect ✅ result
// ✅ ews / detect 🖥️ ui.summary [TABLE]
// ✅ ews / trends logs
// ✅ ews / priority logs
```

### Test 3: Actionable Steps (15 seconds)

```javascript
// Check first warning has actions
const firstWarning = result.warnings[0];
console.assert(Array.isArray(firstWarning.actions), '❌ Actions missing');
console.assert(firstWarning.actions.length >= 2, '❌ Not enough actions');
console.log('Actions:', firstWarning.actions);
console.log('✅ Actionable steps PASSED');
```

### Test 4: Trends Persistence (20 seconds)

```javascript
// Check localStorage
const trendsKey = 'heys_ews_trends_v1';
const stored = localStorage.getItem(trendsKey);
console.assert(stored !== null, '❌ Trends not saved');

const parsed = JSON.parse(stored);
console.assert(parsed.version === 1, '❌ Wrong version');
console.assert(typeof parsed.trends === 'object', '❌ Invalid structure');
console.log('Trends types:', Object.keys(parsed.trends));
console.log('✅ Trends persistence PASSED');
```

### Test 5: Priority Scoring (15 seconds)

```javascript
// Check top warning has priority data
const topWarning = result.warnings[0];
console.assert(
  typeof topWarning.priorityScore === 'number',
  '❌ Priority score missing',
);
console.assert(
  typeof topWarning.frequency14d === 'number',
  '❌ Frequency missing',
);
console.assert(
  typeof topWarning.healthImpact === 'number',
  '❌ Health impact missing',
);

// Verify formula: severity × frequency × health impact
const calculated =
  topWarning.severityWeight * topWarning.frequency14d * topWarning.healthImpact;
console.assert(
  Math.abs(calculated - topWarning.priorityScore) < 0.01,
  '❌ Formula mismatch',
);
console.log('Priority score:', topWarning.priorityScore);
console.log('✅ Priority scoring PASSED');
```

---

## 🎯 Integration Examples

### Example 1: Display Critical Warnings in Header Badge

```javascript
// Get warnings
const result = HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex);

// Count critical priority warnings
const criticalCount = result.criticalPriority?.length || 0;
const highSeverity = result.highSeverityCount || 0;

// Update badge UI
const badge = document.querySelector('.ews-badge');
if (criticalCount > 0) {
  badge.textContent = `🔥 ${criticalCount}`;
  badge.classList.add('critical');
} else if (highSeverity > 0) {
  badge.textContent = `⚠️ ${highSeverity}`;
  badge.classList.add('warning');
} else {
  badge.textContent = '✓';
  badge.classList.add('ok');
}
```

### Example 2: Render Warning Cards with Actions

```javascript
// Render warnings list
const container = document.querySelector('.warnings-list');
container.innerHTML = result.warnings
  .map(
    (w) => `
    <div class="warning-card ${w.criticalPriority ? 'critical' : ''}">
        <div class="warning-header">
            ${w.criticalPriority ? '<span class="badge">🔥 Fix First!</span>' : ''}
            <h3>${w.type}</h3>
            <span class="severity ${w.severity}">${w.severity}</span>
        </div>
        <p class="message">${w.message}</p>
        <div class="actions">
            <h4>Что делать:</h4>
            <ul>
                ${w.actions.map((a) => `<li>${a}</li>`).join('')}
            </ul>
        </div>
        <div class="meta">
            <span>Frequency: ${w.frequency14d}/14d</span>
            <span>Priority: ${w.priorityScore}</span>
        </div>
    </div>
`,
  )
  .join('');
```

### Example 3: Show Chronic Warnings Section

```javascript
// Render chronic warnings (top-3 by frequency)
const chronicContainer = document.querySelector('.chronic-warnings');
const chronic = result.trends.chronicWarnings || [];

if (chronic.length > 0) {
  chronicContainer.innerHTML = `
        <h3>🔄 Хронические проблемы (последние 30 дней)</h3>
        <div class="chronic-list">
            ${chronic
              .map(
                (w) => `
                <div class="chronic-item">
                    <strong>${w.type}</strong>
                    <div class="frequency">
                        <span>14 дней: ${w.frequency14d}x</span>
                        <span>30 дней: ${w.frequency30d}x</span>
                    </div>
                    <small>Последний: ${w.lastOccurrence}</small>
                </div>
            `,
              )
              .join('')}
        </div>
    `;
  chronicContainer.style.display = 'block';
} else {
  chronicContainer.style.display = 'none';
}
```

### Example 4: Export Warnings to Curator Dashboard

```javascript
// Prepare warnings data for curator view
const curatorData = {
  clientId: HEYS.cloud.currentClientId,
  timestamp: new Date().toISOString(),
  summary: {
    total: result.count,
    critical: result.criticalPriority.length,
    highSeverity: result.highSeverityCount,
    mediumSeverity: result.mediumSeverityCount,
  },
  warnings: result.warnings.map((w) => ({
    type: w.type,
    severity: w.severity,
    message: w.message,
    actions: w.actions,
    priority: w.priorityScore,
    isCritical: w.criticalPriority || false,
  })),
  chronicIssues: result.trends.chronicWarnings,
};

// Send to backend for curator notification
await fetch('/api/curator/warning-report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(curatorData),
});
```

---

## 📊 Monitoring & Analytics

### Track Warning Events (Google Analytics / Mixpanel)

```javascript
// Track warning detection
if (result.available && result.count > 0) {
  analytics.track('EWS_Warnings_Detected', {
    count: result.count,
    criticalCount: result.criticalPriority.length,
    types: result.warnings.map((w) => w.type),
    hasChronicIssues: result.trends.chronicWarnings.length > 0,
  });
}

// Track action clicks
document.querySelectorAll('.warning-action').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const warningType = e.target.dataset.warningType;
    const actionIndex = e.target.dataset.actionIndex;

    analytics.track('EWS_Action_Clicked', {
      warningType,
      actionIndex,
      actionText: e.target.textContent,
    });
  });
});
```

### Performance Monitoring

```javascript
// Measure detection performance
console.time('EWS Detection');
const result = HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex);
console.timeEnd('EWS Detection');
// Expected: <100ms for 30 days

// Check localStorage size
const trendsSize = new Blob([localStorage.getItem('heys_ews_trends_v1')]).size;
console.log('Trends storage:', trendsSize, 'bytes');
// Expected: <10KB

// Alert if performance degrades
if (performance.now() > 100) {
  console.warn('⚠️ EWS detection slow (>100ms)');
}
```

---

## 🐛 Rollback Plan

### If Issues Occur in Production

#### Option 1: Rollback to v1.0

```bash
# Revert index.html cache-bust
# Change: pi_early_warning.js?v=15 → v=12

# Or restore previous version from git
git checkout HEAD^ apps/web/insights/pi_early_warning.js apps/web/index.html
git push origin main --force
```

#### Option 2: Disable EWS Temporarily

```javascript
// Add this to heys_app_v12.js or equivalent
HEYS.InsightsPI.EarlyWarning.detect = function () {
  return {
    available: false,
    reason: 'temporarily_disabled',
    warnings: [],
    trends: null,
    criticalPriority: [],
  };
};
```

#### Option 3: Clear Client localStorage

```javascript
// If trends data causes issues
localStorage.removeItem('heys_ews_trends_v1');
location.reload();
```

---

## 📈 Success Metrics (Track after 1 week)

| Metric                    | Target       | How to Measure                                  |
| ------------------------- | ------------ | ----------------------------------------------- |
| Detection Rate            | >80% clients | % clients with warnings detected                |
| Action Click Rate         | >30%         | Clicks on action buttons / total warnings shown |
| Chronic Issues Identified | >20%         | % clients with chronic warnings (30d)           |
| Performance               | <100ms       | Average detection time                          |
| localStorage Size         | <10KB        | Average trends storage per client               |
| Error Rate                | <1%          | Failed detections / total attempts              |

---

## 🎉 Post-Deployment Checklist

- [ ] All smoke tests passed
- [ ] Console filter `ews /` shows logs
- [ ] localStorage has `heys_ews_trends_v1`
- [ ] No JavaScript errors in console
- [ ] Warnings render correctly in UI
- [ ] Actions display for all warning types
- [ ] Chronic warnings section visible (if data exists)
- [ ] Priority badges show on top-3
- [ ] Performance <100ms verified
- [ ] Analytics tracking configured
- [ ] Curator notifications working (if applicable)
- [ ] Documentation updated
- [ ] Team trained on new features

---

**Deployed:** {{ DATE }}  
**Version:** 3.1.0  
**Cache-bust:** v15  
**Deployed by:** {{ NAME }}  
**Status:** 🟢 Production
