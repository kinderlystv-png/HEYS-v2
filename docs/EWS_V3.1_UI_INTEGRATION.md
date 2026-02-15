# EWS v3.1 — UI Integration Guide

> **Step-by-step guide** для интеграции EWS v3.1 в HEYS UI

## 🎯 Overview

EWS v3.1 возвращает enriched data:

- **warnings** — приоритизированные по formula
- **actions** — 2-3 конкретных шага для каждого warning
- **trends** — хронические проблемы за 30 дней
- **criticalPriority** — топ-3 для немедленного внимания

---

## 📦 Phase 1: Header Badge (15 min)

### File: `apps/web/heys_app_v12.js` or equivalent

```javascript
// Add badge to header
function renderEWSBadge() {
  const headerRight = document.querySelector('.header-right');
  const badge = document.createElement('div');
  badge.className = 'ews-badge';
  badge.innerHTML = '<span class="count">0</span>';
  badge.addEventListener('click', openEWSPanel);
  headerRight.prepend(badge);

  updateEWSBadge(); // Initial update
}

// Update badge based on warnings
async function updateEWSBadge() {
  const result = await getEWSWarnings();
  const badge = document.querySelector('.ews-badge .count');
  const container = document.querySelector('.ews-badge');

  if (!result.available) {
    container.style.display = 'none';
    return;
  }

  const criticalCount = result.criticalPriority?.length || 0;
  const totalCount = result.count || 0;

  if (criticalCount > 0) {
    badge.textContent = criticalCount;
    container.className = 'ews-badge critical';
    container.title = `${criticalCount} critical warnings`;
  } else if (totalCount > 0) {
    badge.textContent = totalCount;
    container.className = 'ews-badge warning';
    container.title = `${totalCount} warnings`;
  } else {
    badge.textContent = '✓';
    container.className = 'ews-badge ok';
    container.title = 'No warnings';
  }

  container.style.display = 'flex';
}

// Helper: Get warnings data
async function getEWSWarnings() {
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

  return HEYS.InsightsPI.EarlyWarning.detect(days, profile, pIndex, {
    currentPatterns: pIndex,
  });
}
```

### CSS: `styles/heys-components.css`

```css
/* EWS Badge */
.ews-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.ews-badge.ok {
  background: #10b981;
  color: white;
}

.ews-badge.warning {
  background: #f59e0b;
  color: white;
  animation: pulse-warning 2s infinite;
}

.ews-badge.critical {
  background: #ef4444;
  color: white;
  animation: pulse-critical 1s infinite;
}

@keyframes pulse-warning {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

@keyframes pulse-critical {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}
```

---

## 📦 Phase 2: Warnings Panel (30 min)

### Create Panel Component

```javascript
// File: apps/web/insights/pi_ui_ews_panel.js

function openEWSPanel() {
    const result = await getEWSWarnings();

    if (!result.available) {
        alert('Недостаточно данных для анализа (минимум 7 дней)');
        return;
    }

    const panel = createEWSPanel(result);
    document.body.appendChild(panel);
}

function createEWSPanel(result) {
    const panel = document.createElement('div');
    panel.className = 'ews-panel-overlay';
    panel.innerHTML = `
        <div class="ews-panel">
            <div class="ews-header">
                <h2>⚠️ Early Warning System</h2>
                <button class="close-btn">✕</button>
            </div>

            ${renderSummary(result)}
            ${renderChronicWarnings(result)}
            ${renderWarningsList(result)}
        </div>
    `;

    // Close handler
    panel.querySelector('.close-btn').addEventListener('click', () => {
        panel.remove();
    });

    panel.addEventListener('click', (e) => {
        if (e.target === panel) panel.remove();
    });

    return panel;
}

function renderSummary(result) {
    return `
        <div class="ews-summary">
            <div class="summary-card critical">
                <div class="count">${result.criticalPriority?.length || 0}</div>
                <div class="label">🔥 Fix First</div>
            </div>
            <div class="summary-card high">
                <div class="count">${result.highSeverityCount || 0}</div>
                <div class="label">High Priority</div>
            </div>
            <div class="summary-card medium">
                <div class="count">${result.mediumSeverityCount || 0}</div>
                <div class="label">Medium</div>
            </div>
            <div class="summary-card total">
                <div class="count">${result.count || 0}</div>
                <div class="label">Total Warnings</div>
            </div>
        </div>
    `;
}

function renderChronicWarnings(result) {
    const chronic = result.trends?.chronicWarnings || [];

    if (chronic.length === 0) {
        return '';
    }

    return `
        <div class="chronic-section">
            <h3>🔄 Хронические проблемы (30 дней)</h3>
            <div class="chronic-list">
                ${chronic.map(w => `
                    <div class="chronic-item">
                        <div class="chronic-header">
                            <strong>${formatWarningType(w.type)}</strong>
                            <span class="frequency-badge">${w.frequency30d}x</span>
                        </div>
                        <div class="chronic-meta">
                            <span>За 14 дней: ${w.frequency14d}x</span>
                            <span>Последний раз: ${formatDate(w.lastOccurrence)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderWarningsList(result) {
    if (result.warnings.length === 0) {
        return `
            <div class="no-warnings">
                <div class="icon">✅</div>
                <h3>Всё отлично!</h3>
                <p>Негативных трендов не обнаружено</p>
            </div>
        `;
    }

    return `
        <div class="warnings-list">
            ${result.warnings.map(w => renderWarningCard(w)).join('')}
        </div>
    `;
}

function renderWarningCard(warning) {
    return `
        <div class="warning-card ${warning.criticalPriority ? 'critical-priority' : ''} severity-${warning.severity}">
            ${warning.criticalPriority ? '<div class="priority-badge">🔥 Fix First!</div>' : ''}

            <div class="warning-header">
                <h4>${formatWarningType(warning.type)}</h4>
                <span class="severity-badge ${warning.severity}">${warning.severity}</span>
            </div>

            <p class="warning-message">${warning.message}</p>

            ${warning.detail ? `<p class="warning-detail">${warning.detail}</p>` : ''}

            <div class="actions-section">
                <h5>📋 Что делать:</h5>
                <ol class="actions-list">
                    ${warning.actions.map((action, idx) => `
                        <li>
                            <span class="action-text">${action}</span>
                            <button class="action-btn" data-warning="${warning.type}" data-action="${idx}">
                                Выполнено ✓
                            </button>
                        </li>
                    `).join('')}
                </ol>
            </div>

            <div class="warning-meta">
                <span class="meta-item">Priority: ${warning.priorityScore}</span>
                <span class="meta-item">Частота: ${warning.frequency14d}/14d</span>
                <span class="meta-item">Impact: ${warning.healthImpact}/100</span>
            </div>
        </div>
    `;
}

// Helpers
function formatWarningType(type) {
    const names = {
        'SLEEP_DEBT': 'Недостаток сна',
        'CALORIC_DEBT': 'Дефицит калорий',
        'HEALTH_SCORE_DECLINE': 'Снижение Health Score',
        'STATUS_SCORE_DECLINE': 'Снижение Status Score',
        'WEIGHT_SPIKE': 'Резкий набор веса',
        'HYDRATION_DEFICIT': 'Недостаток воды',
        'PROTEIN_DEFICIT': 'Дефицит белка',
        'STRESS_ACCUMULATION': 'Накопление стресса',
        'MEAL_SKIP_PATTERN': 'Пропуски еды',
        'BINGE_RISK': 'Риск переедания',
        'MOOD_WELLBEING_DECLINE': 'Падение настроения',
        'WEIGHT_PLATEAU': 'Плато веса',
        'WEEKEND_PATTERN': 'Выходные срывы',
        'LOGGING_GAP': 'Пропуски в ведении дневника',
        'CRITICAL_PATTERN_DEGRADATION': 'Критичный паттерн'
    };
    return names[type] || type;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дн. назад`;
    return date.toLocaleDateString('ru-RU');
}
```

### CSS: `styles/heys-components.css`

```css
/* EWS Panel Overlay */
.ews-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.2s;
}

.ews-panel {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.ews-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
}

/* Summary Cards */
.ews-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 24px;
}

.summary-card {
  text-align: center;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid;
}

.summary-card.critical {
  background: #fef2f2;
  border-color: #ef4444;
}

.summary-card.high {
  background: #fef3c7;
  border-color: #f59e0b;
}

.summary-card.medium {
  background: #fef3e7;
  border-color: #fb923c;
}

.summary-card.total {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.summary-card .count {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 4px;
}

.summary-card .label {
  font-size: 14px;
  color: #6b7280;
}

/* Chronic Warnings */
.chronic-section {
  padding: 24px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.chronic-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.chronic-item {
  background: white;
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #f59e0b;
}

.chronic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.frequency-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

/* Warning Cards */
.warnings-list {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.warning-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  position: relative;
}

.warning-card.critical-priority {
  border-color: #ef4444;
  background: linear-gradient(to right, #fef2f2 0%, white 20%);
}

.priority-badge {
  position: absolute;
  top: -10px;
  right: 20px;
  background: #ef4444;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}

.warning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.severity-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-badge.high {
  background: #fef2f2;
  color: #dc2626;
}

.severity-badge.medium {
  background: #fef3c7;
  color: #d97706;
}

.severity-badge.low {
  background: #f0fdf4;
  color: #16a34a;
}

/* Actions Section */
.actions-section {
  margin-top: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.actions-section h5 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #374151;
}

.actions-list {
  margin: 0;
  padding-left: 20px;
}

.actions-list li {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.action-text {
  flex: 1;
  line-height: 1.5;
}

.action-btn {
  background: #10b981;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #059669;
  transform: translateY(-1px);
}

.action-btn.completed {
  background: #6b7280;
  cursor: default;
}

/* Warning Meta */
.warning-meta {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #6b7280;
}

/* No Warnings State */
.no-warnings {
  text-align: center;
  padding: 60px 24px;
}

.no-warnings .icon {
  font-size: 64px;
  margin-bottom: 16px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

---

## 📦 Phase 3: Action Tracking (10 min)

```javascript
// Track when user marks action as completed
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('action-btn')) {
    const warningType = e.target.dataset.warning;
    const actionIndex = e.target.dataset.action;

    // Mark as completed
    e.target.classList.add('completed');
    e.target.textContent = 'Выполнено ✓';

    // Track analytиcs
    trackActionCompletion(warningType, actionIndex);

    // Save to localStorage for persistence
    saveCompletedAction(warningType, actionIndex);
  }
});

function trackActionCompletion(warningType, actionIndex) {
  // Google Analytics
  if (typeof gtag !== 'undefined') {
    gtag('event', 'ews_action_completed', {
      warning_type: warningType,
      action_index: actionIndex,
    });
  }

  // Internal tracking
  console.info('[EWS] ✅ Action completed:', { warningType, actionIndex });
}

function saveCompletedAction(warningType, actionIndex) {
  const key = 'heys_ews_completed_actions';
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  const today = new Date().toISOString().split('T')[0];

  if (!stored[today]) {
    stored[today] = [];
  }

  stored[today].push({ warningType, actionIndex, timestamp: Date.now() });
  localStorage.setItem(key, JSON.stringify(stored));
}
```

---

## 🚀 Integration Checklist

- [ ] Header badge added and styled
- [ ] Panel opens on badge click
- [ ] Summary cards display correct counts
- [ ] Chronic warnings section renders (if data exists)
- [ ] Warning cards show all metadata
- [ ] Actions display with 2-3 steps each
- [ ] Priority badges show on top-3 warnings
- [ ] Action completion tracking works
- [ ] Panel closes with X button or overlay click
- [ ] CSS animations work smoothly
- [ ] Mobile responsive (test on phone)
- [ ] Console logs with `ews /` filter visible

---

**Next Steps:**

1. Deploy UI changes to staging
2. Test with real client data
3. Collect user feedback on actions
4. Iterate on UX based on analytics
5. Add curator dashboard integration

**Estimated Time:** 1-2 hours total implementation
