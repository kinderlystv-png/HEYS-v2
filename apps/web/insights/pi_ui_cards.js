// pi_ui_cards.js — Card UI Components v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 8)
// Карточные компоненты для отображения данных, инсайтов, метрик
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  
  // React imports
  const { createElement: h, useState, useEffect, useMemo } = window.React || {};
  const ReactDOM = window.ReactDOM || {};
  
  // Зависимости
  const U = HEYS.utils || {};
  const piStats = HEYS.InsightsPI?.stats || window.piStats || {};
  const SCIENCE_INFO = HEYS.InsightsPI?.science || window.piScience || {};
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};
  const piAdvanced = HEYS.InsightsPI?.advanced || window.piAdvanced || {};
  const piAnalyticsAPI = HEYS.InsightsPI?.analyticsAPI || window.piAnalyticsAPI || {};
  
  // Import constants
  const PRIORITY_LEVELS = piConst.PRIORITY_LEVELS || {};
  const CATEGORIES = piConst.CATEGORIES || {};
  const ACTIONABILITY = piConst.ACTIONABILITY || {};
  
  // Импорт статистических функций из pi_stats.js (централизовано)
  const { average } = piStats;
    
    const result = {
      available: true,
      daysAnalyzed: days.length,
      daysWithData: days.length,
      confidence: Math.round((days.length / CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) * 100),
      isFullAnalysis: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS,
      patterns,
      healthScore,
      whatIf,
      weightPrediction,
      weeklyWrap,
      generatedAt: new Date().toISOString(),
      version: CONFIG.VERSION
    };
    
    // Кэшируем
    _cache = {
      data: result,
      timestamp: now,
      clientId
    };
    
    return result;
  }

  /**
   * Очистить кэш (вызывать при добавлении продукта)
   */
  function clearCache() {
    _cache = { data: null, timestamp: 0, clientId: null };
  }

  // === ЭКСПОРТ ===
  HEYS.PredictiveInsights = {
    VERSION: CONFIG.VERSION,
    CONFIG,
    PATTERNS,
    
    // === СИСТЕМА ПРИОРИТЕТОВ v2.1 ===
    PRIORITY_LEVELS,
    CATEGORIES,
    ACTIONABILITY,
    SCIENCE_INFO,
    
    // Функции работы с приоритетами
    getMetricPriority,
    getAllMetricsByPriority,
    getMetricsByCategory,
    getMetricsByActionability,
    getCriticalMetrics,
    getPriorityStats,
    
    // Главные функции
    analyze,
    clearCache,
    
    // Утилиты (для тестирования)
    getDaysData,
    pearsonCorrelation,
    calculateTrend,
    average,
    stdDev,
    
    // Отдельные анализаторы
    analyzeMealTiming,
    analyzeWaveOverlap,
    analyzeLateEating,
    analyzeMealQualityTrend,
    analyzeSleepWeight,
    analyzeSleepHunger,
    analyzeTrainingKcal,
    analyzeStepsWeight,
    analyzeProteinSatiety,
    analyzeFiberRegularity,
    analyzeStressEating,
    analyzeMoodFood,
    
    // Композитные функции
    calculateHealthScore,
    generateWhatIfScenarios,
    predictWeight,
    generateWeeklyWrap,
    
    
    // === ПРОДВИНУТАЯ АНАЛИТИКА API ===
    // Делегируем в pi_analytics_api.js
    analyzeMetabolism: piAnalyticsAPI.analyzeMetabolism,
    calculateConfidenceScore: piAnalyticsAPI.calculateConfidenceScore,
    calculateCorrelationMatrix: piAnalyticsAPI.calculateCorrelationMatrix,
    detectMetabolicPatterns: piAnalyticsAPI.detectMetabolicPatterns,
    calculatePredictiveRisk: piAnalyticsAPI.calculatePredictiveRisk,
    forecastEnergy: piAnalyticsAPI.forecastEnergy,
    calculateBayesianConfidence: piAnalyticsAPI.calculateBayesianConfidence,
    calculateTimeLaggedCorrelations: piAnalyticsAPI.calculateTimeLaggedCorrelations,
    calculateGlycemicVariability: piAnalyticsAPI.calculateGlycemicVariability,
    calculateAllostaticLoad: piAnalyticsAPI.calculateAllostaticLoad,
    detectEarlyWarningSignals: piAnalyticsAPI.detectEarlyWarningSignals,
    
  // === REACT COMPONENTS ===
  const { createElement: h, useState, useEffect, useMemo } = window.React || {};
  const ReactDOM = window.ReactDOM || {};

  // === UI RING COMPONENTS (из pi_ui_rings.js) ===
  const HealthRing = piUIRings.HealthRing || function() { return h('div', {}, 'HealthRing not loaded'); };
  const TotalHealthRing = piUIRings.TotalHealthRing || function() { return h('div', {}, 'TotalHealthRing not loaded'); };
  const StatusProgressRing = piUIRings.StatusProgressRing || function() { return h('div', {}, 'StatusProgressRing not loaded'); };
  const MiniRiskMeter = piUIRings.MiniRiskMeter || function() { return h('div', {}, 'MiniRiskMeter not loaded'); };
  const MetabolicStateRing = piUIRings.MetabolicStateRing || function() { return h('div', {}, 'MetabolicStateRing not loaded'); };

  /**
   * Health Ring — кольцевой индикатор прогресса (v2.0: с InfoButton)
   */
  /**
   * HealthRing — кольцо здоровья для категории
   * v3.22.0: Поддержка emotionalWarning overlay для Recovery
   */
        
        // Legacy Quick Stats
        h('div', { className: 'adv-analytics__quick-stats' },
          // Risk Score
          h('div', { className: `adv-analytics__stat adv-analytics__stat--${risk.riskLevel}` },
            h('div', { className: 'adv-analytics__stat-icon' }, risk.riskEmoji),
            h('div', { className: 'adv-analytics__stat-value' }, `${risk.riskScore}%`),
            h('div', { className: 'adv-analytics__stat-label' }, 'Риск срыва')
          ),
          // Patterns Found
          h('div', { className: 'adv-analytics__stat' },
            h('div', { className: 'adv-analytics__stat-icon' }, '🧬'),
            h('div', { className: 'adv-analytics__stat-value' }, patterns.patterns.length),
            h('div', { className: 'adv-analytics__stat-label' }, 'Паттернов')
          ),
          // Correlations Found
          h('div', { className: 'adv-analytics__stat' },
            h('div', { className: 'adv-analytics__stat-icon' }, '🔗'),
            h('div', { className: 'adv-analytics__stat-value' }, correlations.correlations.filter(c => c.strength !== 'none').length),
            h('div', { className: 'adv-analytics__stat-label' }, 'Связей')
          ),
          // Causality
          timeLag.hasData && h('div', { className: 'adv-analytics__stat' },
            h('div', { className: 'adv-analytics__stat-icon' }, '⏳'),
            h('div', { className: 'adv-analytics__stat-value' }, timeLag.confirmedCount),
            h('div', { className: 'adv-analytics__stat-label' }, 'Причинностей')
          )
        )
      );
    };
    
    // === RENDER SCIENCE TAB (новый) ===
    const renderScience = () => {
      return h('div', { className: 'adv-analytics__science' },
        
        // Bayesian Section
        bayesian.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '📊 Байесовская уверенность'),
            h(InfoButton, { infoKey: 'BAYESIAN_CONFIDENCE' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${bayesian.qualityGrade}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, bayesian.gradeEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `${bayesian.confidencePercent}%`)
            ),
            bayesian.mape !== null && h('div', { className: 'adv-analytics__science-detail' },
              `MAPE: ${bayesian.mape}% | R²: ${bayesian.crossValidation?.r2?.toFixed(2) || 'N/A'}`
            ),
            h('div', { className: 'adv-analytics__science-insight' }, bayesian.message)
          )
        ),
        
        // GVI Section
        gvi.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '📈 Гликемическая волатильность'),
            h(InfoButton, { infoKey: 'GLYCEMIC_VARIABILITY' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${gvi.riskCategory}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, gvi.riskEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `CV ${gvi.gvi}%`)
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `CONGA: ${gvi.conga} | Mean GL: ${gvi.mealGLMean}`
            ),
            h('div', { className: 'adv-analytics__science-insight' }, gvi.riskLabel),
            gvi.recommendations.length > 0 && h('div', { className: 'adv-analytics__science-recs' },
              gvi.recommendations.map((r, i) => h('div', { key: i }, r))
            )
          )
        ),
        
        // Allostatic Load Section
        allostatic.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '🧠 Аллостатическая нагрузка'),
            h(InfoButton, { infoKey: 'ALLOSTATIC_LOAD' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${allostatic.riskLevel}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, allostatic.riskEmoji),
              h('span', { className: 'adv-analytics__science-value' }, allostatic.alScore)
            ),
            h('div', { className: 'adv-analytics__science-detail' }, allostatic.riskLabel),
            // Components
            h('div', { className: 'adv-analytics__science-components' },
              Object.entries(allostatic.components).map(([key, comp]) =>
                h('div', { 
                  key, 
                  className: `adv-analytics__al-component ${comp.status === 'elevated' ? 'adv-analytics__al-component--elevated' : ''}` 
                },
                  h('span', null, comp.label),
                  h('span', null, `${comp.score}%`)
                )
              )
            ),
            allostatic.recovery.length > 0 && h('div', { className: 'adv-analytics__science-recs' },
              allostatic.recovery.map((r, i) => h('div', { key: i }, r))
            )
          )
        ),
        
        // Early Warning Signals Section
        ews.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '⚠️ Ранние сигналы срыва'),
            h(InfoButton, { infoKey: 'EARLY_WARNING_SIGNALS' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${ews.criticalTransitionRisk}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, ews.riskEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `EWS ${ews.ewsScore}%`)
            ),
            h('div', { className: 'adv-analytics__science-detail' }, ews.prediction),
            // Signals
            h('div', { className: 'adv-analytics__ews-signals' },
              ews.signals.map((s, i) =>
                h('div', { 
                  key: i, 
                  className: `adv-analytics__ews-signal ${s.detected ? 'adv-analytics__ews-signal--active' : ''}` 
                },
                  h('span', null, s.label),
                  h('span', null, s.detected ? '⚠️' : '✅'),
                  h('div', { className: 'adv-analytics__ews-insight' }, s.insight)
                )
              )
            )
          )
        ),
        
        // 2-Process Model Section
        twoProcess.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '💤 Модель бодрости (Borbély)'),
            h(InfoButton, { infoKey: 'TWO_PROCESS_MODEL' })
          ),
          h('div', { className: `adv-analytics__science-card adv-analytics__science-card--${twoProcess.alertnessLevel}` },
            h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, twoProcess.alertnessEmoji),
              h('span', { className: 'adv-analytics__science-value' }, `${twoProcess.alertness}%`)
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `Process S: ${twoProcess.processS}% | Process C: ${twoProcess.processC}%`
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `Бодрствуешь: ${twoProcess.hoursAwake}ч | Долг сна: ${twoProcess.sleepDebt}ч`
            ),
            // Peak/Dip windows
            h('div', { className: 'adv-analytics__2p-windows' },
              h('div', { className: 'adv-analytics__2p-window adv-analytics__2p-window--peak' },
                '🔥 Пик: ', twoProcess.peakWindow.hour, ':00 (', twoProcess.peakWindow.alertness, '%)'
              ),
              h('div', { className: 'adv-analytics__2p-window adv-analytics__2p-window--dip' },
                '😴 Спад: ', twoProcess.dipWindow.hour, ':00 (', twoProcess.dipWindow.alertness, '%)'
              )
            ),
            twoProcess.recommendations.length > 0 && h('div', { className: 'adv-analytics__science-recs' },
              twoProcess.recommendations.map((r, i) => h('div', { key: i }, r))
            )
          )
        ),
        
        // Time-Lagged Correlations Section
        timeLag.hasData && h('div', { className: 'adv-analytics__science-section' },
          h('div', { className: 'adv-analytics__science-header' },
            h('span', null, '⏳ Причинность (Time-Lag)'),
            h(InfoButton, { infoKey: 'TIME_LAGGED_CORRELATIONS' })
          ),
          h('div', { className: 'adv-analytics__science-card' },
            timeLag.strongest && h('div', { className: 'adv-analytics__science-main' },
              h('span', { className: 'adv-analytics__science-emoji' }, 
                timeLag.strongest.hasCausality ? '✅' : '📊'
              ),
              h('span', { className: 'adv-analytics__science-value' }, timeLag.strongest.label)
            ),
            h('div', { className: 'adv-analytics__science-detail' },
              `Подтверждённых связей: ${timeLag.confirmedCount} из ${timeLag.totalAnalyzed}`
            ),
            // Causal Links
            h('div', { className: 'adv-analytics__causality-list' },
              timeLag.lagAnalysis.slice(0, 5).map((link, i) =>
                h('div', { 
                  key: i, 
                  className: `adv-analytics__causality-item ${link.hasCausality ? 'adv-analytics__causality-item--confirmed' : ''}` 
                },
                  h('div', { className: 'adv-analytics__causality-label' }, link.label),
                  h('div', { className: 'adv-analytics__causality-detail' },
                    `r=${link.bestCorrelation} (лаг ${link.bestLag}д)`
                  ),
                  h('div', { className: 'adv-analytics__causality-strength' }, 
                    link.causalStrength === 'confirmed' ? '✅ Подтверждено' :
                    link.causalStrength === 'possible' ? '📊 Возможно' : '⚪ Слабо'
                  )
                )
              )
            )
          )
        )
      );
    };
    
    // Render Correlations Tab
    const renderCorrelations = () => {
      if (!correlations.hasData) {
        return h('div', { className: 'adv-analytics__empty' },
          h('div', null, '📊'),
          h('div', null, 'Нужно минимум 7 дней данных')
        );
      }
      
      return h('div', { className: 'adv-analytics__correlations' },
        // Insights
        correlations.insights.map((insight, i) =>
          h('div', { key: i, className: 'adv-analytics__insight' }, insight)
        ),
        
        // Correlation List
        h('div', { className: 'adv-analytics__corr-list' },
          correlations.correlations.slice(0, 6).map((corr, i) =>
            h('div', { 
              key: i, 
              className: `adv-analytics__corr-item adv-analytics__corr-item--${corr.strength}` 
            },
              h('div', { className: 'adv-analytics__corr-label' }, corr.label),
              h('div', { className: 'adv-analytics__corr-bar' },
                h('div', { 
                  className: `adv-analytics__corr-fill adv-analytics__corr-fill--${corr.direction}`,
                  style: { width: `${Math.abs(corr.correlation) * 100}%` }
                })
              ),
              h('div', { className: 'adv-analytics__corr-value' }, 
                `${corr.correlation > 0 ? '+' : ''}${Math.round(corr.correlation * 100)}%`
              )
            )
          )
        )
      );
    };
    
    // Render Patterns Tab
    const renderPatterns = () => {
      if (!patterns.hasData) {
        return h('div', { className: 'adv-analytics__empty' },
          h('div', null, '🧬'),
          h('div', null, 'Продолжай вести учёт для выявления паттернов')
        );
      }
      
      return h('div', { className: 'adv-analytics__patterns' },
        patterns.patterns.map((pattern, i) =>
          h('div', { key: i, className: `adv-analytics__pattern adv-analytics__pattern--${pattern.level}` },
            h('div', { className: 'adv-analytics__pattern-header' },
              h('span', { className: 'adv-analytics__pattern-label' }, pattern.label),
              h('span', { className: 'adv-analytics__pattern-level' }, pattern.level)
            ),
            h('div', { className: 'adv-analytics__pattern-insight' }, pattern.insight)
          )
        ),
        
        // Recommendations
        patterns.recommendations.length > 0 && h('div', { className: 'adv-analytics__recommendations' },
          h('div', { className: 'adv-analytics__recommendations-title' }, '💡 Рекомендации'),
          patterns.recommendations.map((rec, i) =>
            h('div', { key: i, className: 'adv-analytics__recommendation' }, rec)
          )
        )
      );
    };
    
    // Render Risk Tab
    const renderRisk = () => {
      return h('div', { className: 'adv-analytics__risk' },
        // Main Risk Score
        h('div', { className: `adv-analytics__risk-main adv-analytics__risk-main--${risk.riskLevel}` },
          h('div', { className: 'adv-analytics__risk-score' },
            h('span', { className: 'adv-analytics__risk-emoji' }, risk.riskEmoji),
            h('span', { className: 'adv-analytics__risk-value' }, `${risk.riskScore}%`)
          ),
          h('div', { className: 'adv-analytics__risk-label' }, risk.riskLabel + ' риск'),
          h('div', { className: 'adv-analytics__risk-prediction' }, risk.prediction)
        ),
        
        // Risk Factors
        h('div', { className: 'adv-analytics__risk-factors' },
          risk.factors.map((factor, i) =>
            h('div', { 
              key: i, 
              className: `adv-analytics__risk-factor ${factor.risk > 50 ? 'adv-analytics__risk-factor--high' : ''}` 
            },
              h('div', { className: 'adv-analytics__risk-factor-header' },
                h('span', null, factor.name),
                h('span', null, `${factor.risk}%`)
              ),
              h('div', { className: 'adv-analytics__risk-factor-bar' },
                h('div', { 
                  className: 'adv-analytics__risk-factor-fill',
                  style: { width: `${factor.risk}%` }
                })
              ),
              h('div', { className: 'adv-analytics__risk-factor-insight' }, factor.insight)
            )
          )
        )
      );
    };
    
    // Render Energy Tab
    const renderEnergy = () => {
      const { hourlyForecast, currentHour, peakWindow, dipWindow, recommendations } = energy;
      
      // Показываем только будущие часы + текущий
      const visibleHours = hourlyForecast.filter(h => h.hour >= currentHour && h.hour <= 23);
      
      return h('div', { className: 'adv-analytics__energy' },
        // Energy Graph (simplified bar chart)
        h('div', { className: 'adv-analytics__energy-graph' },
          visibleHours.map((hr, i) =>
            h('div', { 
              key: i, 
              className: `adv-analytics__energy-bar adv-analytics__energy-bar--${hr.level}`,
              style: { height: `${hr.energy}%` },
              title: `${hr.hour}:00 — ${hr.energy}%`
            },
              h('span', { className: 'adv-analytics__energy-label' }, hr.hour)
            )
          )
        ),
        
        // Peak & Dip Windows
        h('div', { className: 'adv-analytics__energy-windows' },
          h('div', { className: 'adv-analytics__energy-window adv-analytics__energy-window--peak' },
            h('span', null, '🔥'),
            h('span', null, `Пик: ${peakWindow.hour}:00`),
            h('span', null, `${peakWindow.energy}%`)
          ),
          h('div', { className: 'adv-analytics__energy-window adv-analytics__energy-window--dip' },
            h('span', null, '😴'),
            h('span', null, `Спад: ${dipWindow.hour}:00`),
            h('span', null, `${dipWindow.energy}%`)
          )
        ),
        
        // Recommendations
        h('div', { className: 'adv-analytics__energy-recs' },
          recommendations.map((rec, i) =>
            h('div', { key: i, className: 'adv-analytics__energy-rec' }, rec)
          )
        )
      );
    };
    
    // Tab content mapping
    const tabContent = {
      overview: renderOverview,
      science: renderScience,
      correlations: renderCorrelations,
      patterns: renderPatterns,
      risk: renderRisk,
      energy: renderEnergy
    };
    
    return h('div', { className: 'adv-analytics-card' },
      // Header
      h('div', { className: 'adv-analytics-card__header' },
        h('div', { className: 'adv-analytics-card__title' },
          h('span', null, '🔬'),
          h('span', null, 'Научная аналитика v3'),
          h(InfoButton, { infoKey: 'ADVANCED_ANALYTICS' })
        ),
        // Confidence Badge (mini)
        h('div', { className: `adv-analytics-card__confidence-mini adv-analytics-card__confidence-mini--${bayesian.hasData ? bayesian.qualityGrade : confidence.level}` },
          bayesian.hasData ? bayesian.gradeEmoji : confidence.levelEmoji,
          ` ${bayesian.hasData ? bayesian.confidencePercent : confidence.score}%`
        )
      ),
      
      // Tabs
      h('div', { className: 'adv-analytics-card__tabs' },
        tabs.map(tab =>
          h('button', {
            key: tab.id,
            className: `adv-analytics-card__tab ${activeTab === tab.id ? 'adv-analytics-card__tab--active' : ''}`,
            onClick: () => setActiveTab(tab.id),
            title: tab.title
          }, tab.label)
        )
      ),
      
      // Content
      h('div', { className: 'adv-analytics-card__content' },
        tabContent[activeTab]?.()
      )
    );
  }

  /**
   * MetabolismCard — карточка одного метаболического показателя (v2.0: с InfoButton)
   */
  function MetabolismCard({ title, icon, value, unit, quality, insight, pmid, details, infoKey, debugData }) {
    const [showDetails, setShowDetails] = useState(false);
    
    const qualityColors = {
      excellent: '#22c55e',
      good: '#10b981',
      normal: '#3b82f6',
      low: '#f59e0b',
      warning: '#ef4444'
    };
    const color = qualityColors[quality] || qualityColors.normal;
    
    return h('div', { 
      className: `insights-metabolism-card insights-metabolism-card--${quality} ${showDetails ? 'insights-metabolism-card--expanded' : ''}`,
      onClick: () => setShowDetails(!showDetails)
    },
      h('div', { className: 'insights-metabolism-card__header' },
        h('div', { className: 'insights-metabolism-card__icon', style: { color } }, icon),
        h('div', { className: 'insights-metabolism-card__info' },
          h('div', { className: 'insights-metabolism-card__title' },
            title,
            // v2.0: InfoButton рядом с заголовком
            infoKey && h(InfoButton, { infoKey, debugData })
          ),
          h('div', { className: 'insights-metabolism-card__value' },
            h('span', { style: { color, fontWeight: 700 } }, value),
            unit && h('span', { className: 'insights-metabolism-card__unit' }, ' ', unit)
          )
        ),
        pmid && h('a', {
          className: 'insights-metabolism-card__pmid',
          href: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
          target: '_blank',
          rel: 'noopener',
          onClick: e => e.stopPropagation()
        }, '📚')
      ),
      showDetails && h('div', { className: 'insights-metabolism-card__details' },
        h('div', { className: 'insights-metabolism-card__insight' }, insight),
        details && h('div', { className: 'insights-metabolism-card__breakdown' }, details)
      )
    );
  }

  /**
   * MetabolismSection — секция научной аналитики (v2.0: с InfoButtons)
   */
  function MetabolismSection({ lsGet, profile, pIndex, selectedDate }) {
    const metabolism = useMemo(() => {
      return HEYS.PredictiveInsights.analyzeMetabolism({
        lsGet: lsGet || window.HEYS?.utils?.lsGet,
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        selectedDate
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    if (!metabolism || !metabolism.hasData) {
      return h('div', { className: 'insights-metabolism-empty' },
        h('div', { className: 'insights-metabolism-empty__icon' }, '📊'),
        'Добавь данные для анализа метаболизма'
      );
    }
    
    const { tefAnalysis, epocAnalysis, hormonalBalance, adaptiveThermogenesis } = metabolism;
    
    // Компактная сводка для заголовка
    const summaryParts = [];
    if (tefAnalysis.percent > 0) summaryParts.push(`TEF ${tefAnalysis.percent}%`);
    if (epocAnalysis.kcal > 0) summaryParts.push(`EPOC +${epocAnalysis.kcal}`);
    if (hormonalBalance.isDisrupted) summaryParts.push('⚠️ Гормоны');
    else summaryParts.push('✓ Гормоны');
    
    return h('div', { className: 'metabolism-section' },
      // Header с InfoButton
      h('div', { className: 'metabolism-section__header' },
        h('div', { className: 'metabolism-section__title' },
          h('span', { className: 'metabolism-section__icon' }, '🔥'),
          h('span', null, 'Метаболизм'),
          h(InfoButton, { infoKey: 'TEF' })
        ),
        h('div', { className: 'metabolism-section__badge' }, summaryParts.join(' • '))
      ),
      // Content
      h('div', { className: 'insights-metabolism' },
        // TEF — v2.0: добавлен infoKey и debugData
        h(MetabolismCard, {
          title: 'Термический эффект (TEF)',
          icon: '🔥',
          value: tefAnalysis.total,
          unit: 'ккал',
          quality: tefAnalysis.quality,
          insight: tefAnalysis.insight,
          pmid: tefAnalysis.pmid,
          details: `Белок: ${tefAnalysis.breakdown.protein} | Углеводы: ${tefAnalysis.breakdown.carbs} | Жиры: ${tefAnalysis.breakdown.fat}`,
          infoKey: 'TEF',
          debugData: {
            breakdown: tefAnalysis.breakdown,
            percent: tefAnalysis.percent,
            quality: tefAnalysis.quality
          }
        }),
        
        // EPOC — v2.0: добавлен infoKey и debugData
        epocAnalysis.hasTraining && h(MetabolismCard, {
          title: 'Дожиг после тренировки (EPOC)',
          icon: '⚡',
          value: epocAnalysis.kcal > 0 ? `+${epocAnalysis.kcal}` : '—',
          unit: 'ккал',
          quality: epocAnalysis.kcal > 50 ? 'excellent' : epocAnalysis.kcal > 20 ? 'good' : 'normal',
          insight: epocAnalysis.insight,
          pmid: epocAnalysis.pmid,
          details: `Тренировка: ${epocAnalysis.trainingKcal} ккал`,
          infoKey: 'EPOC',
          debugData: {
            epocKcal: epocAnalysis.kcal,
            trainingKcal: epocAnalysis.trainingKcal,
            hasTraining: epocAnalysis.hasTraining
          }
        }),
        
        // Гормоны — v2.0: добавлен infoKey и debugData
        h(MetabolismCard, {
          title: 'Гормональный баланс',
          icon: '😴',
          value: hormonalBalance.isDisrupted ? `+${hormonalBalance.ghrelinIncrease}%` : '✓',
          unit: hormonalBalance.isDisrupted ? 'голод' : 'норма',
          quality: hormonalBalance.ghrelinIncrease > 15 ? 'warning' : hormonalBalance.ghrelinIncrease > 0 ? 'low' : 'good',
          insight: hormonalBalance.insight,
          pmid: hormonalBalance.pmid,
          details: hormonalBalance.sleepDebt > 0 ? `Недосып: ${hormonalBalance.sleepDebt} ч` : 'Сон в норме',
          infoKey: 'HORMONES',
          debugData: {
            sleepDebt: hormonalBalance.sleepDebt,
            ghrelinIncrease: hormonalBalance.ghrelinIncrease,
            leptinDecrease: hormonalBalance.leptinDecrease
          }
        }),
        
        // Адаптивный термогенез — v2.0: добавлен infoKey и debugData
        adaptiveThermogenesis.isAdapted && h(MetabolismCard, {
          title: 'Адаптация метаболизма',
          icon: '📉',
          value: `-${Math.round(adaptiveThermogenesis.metabolicReduction * 100)}%`,
          unit: 'замедление',
          quality: 'warning',
          insight: adaptiveThermogenesis.insight,
          pmid: adaptiveThermogenesis.pmid,
          details: `Дней в жёстком дефиците: ${adaptiveThermogenesis.chronicDeficitDays}`,
          infoKey: 'ADAPTIVE',
          debugData: {
            chronicDeficitDays: adaptiveThermogenesis.chronicDeficitDays,
            metabolicReduction: adaptiveThermogenesis.metabolicReduction
          }
        })
      )
    );
  }

  /**
   * HealthRingsGrid — сетка колец здоровья
   * v3.22.0: Интеграция emotionalRisk overlay для Recovery
   */
  function PatternCard({ pattern }) {
    if (!pattern || !pattern.available) return null;
    
    const iconClass = pattern.score >= 70 ? 'good' : pattern.score >= 40 ? 'warn' : 'bad';
    const icon = pattern.score >= 70 ? '✓' : pattern.score >= 40 ? '!' : '✗';
    
    const patternLabels = {
      meal_timing: '⏱️ Тайминг еды',
      wave_overlap: '🌊 Перехлёст волн',
      late_eating: '🌙 Поздняя еда',
      meal_quality: '🍽️ Качество еды',
      sleep_weight: '💤 Сон → Вес',
      sleep_hunger: '😴 Сон → Голод',
      training_kcal: '🏋️ Тренировки',
      steps_weight: '👟 Шаги → Вес',
      protein_satiety: '🥩 Белок',
      fiber_regularity: '🥗 Клетчатка',
      stress_eating: '😰 Стресс → Еда',
      mood_food: '😊 Настроение',
      // v2.0: новые паттерны
      circadian_timing: '🌅 Циркадные ритмы',
      nutrient_timing: '⏰ Тайминг нутриентов',
      insulin_sensitivity: '📉 Инсулин. чувств.',
      gut_health: '🦠 Здоровье ЖКТ'
    };
    
    // v2.0: Маппинг pattern → SCIENCE_INFO ключ
    const patternToInfoKey = {
      circadian_timing: 'CIRCADIAN',
      nutrient_timing: 'NUTRIENT_TIMING',
      insulin_sensitivity: 'INSULIN_SENSITIVITY',
      gut_health: 'GUT_HEALTH'
    };
    
    const infoKey = patternToInfoKey[pattern.pattern];
    
    return h('div', { className: 'insights-pattern' },
      h('div', { className: `insights-pattern__icon insights-pattern__icon--${iconClass}` }, icon),
      h('div', { className: 'insights-pattern__content' },
        h('div', { className: 'insights-pattern__title' },
          patternLabels[pattern.pattern] || pattern.pattern,
          // v2.0: InfoButton для новых паттернов с формулами
          (infoKey || pattern.formula) && h(InfoButton, {
            infoKey: infoKey,
            debugData: pattern.debug || {
              formula: pattern.formula,
              score: pattern.score,
              confidence: pattern.confidence
            }
          })
        ),
        h('div', { className: 'insights-pattern__insight' }, pattern.insight),
        pattern.confidence && h('div', { className: 'insights-pattern__confidence' },
          `Уверенность: ${Math.round(pattern.confidence * 100)}%`
        )
      )
    );
  }

  /**
   * Patterns List — список всех паттернов
   */
  function PatternsList({ patterns }) {
    if (!patterns || patterns.length === 0) return null;
    
    const availablePatterns = patterns.filter(p => p.available);
    
    return h('div', { className: 'insights-patterns' },
      availablePatterns.map((p, i) =>
        h(PatternCard, { key: p.pattern || i, pattern: p })
      )
    );
  }

  /**
   * What-If Scenario Card
   */
  function WeeklyWrap({ wrap, lsGet }) {
    if (!wrap) return null;
    
    // 🆕 v3.22.0: Extended Analytics Summary за неделю
    const extendedSummary = useMemo(() => {
      const U = window.HEYS?.utils;
      const getter = lsGet || U?.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const profile = getter('heys_profile', {});
      const pIndex = window.HEYS?.products?.getIndex?.();
      
      let proteinDeficitDays = 0;
      let highStressDays = 0;
      let trainingDays = 0;
      let avgEmotionalRisk = 0;
      let totalDays = 0;
      
      // Анализ за 7 дней
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const day = getter(`heys_dayv2_${dateStr}`, {});
        
        if (!day.meals || day.meals.length === 0) continue;
        totalDays++;
        
        // Protein analysis
        let dayProtein = 0;
        let dayKcal = 0;
        
        for (const meal of day.meals) {
          for (const item of (meal.items || [])) {
            const product = pIndex?.byId?.get(item.product_id) || item;
            const grams = item.grams || 0;
            dayProtein += (product.protein100 || 0) * grams / 100;
            dayKcal += (product.kcal100 || 0) * grams / 100;
          }
        }
        
        const targetProtein = (dayKcal * 0.25) / 4;
        if (targetProtein > 0 && dayProtein < targetProtein * 0.8) {
          proteinDeficitDays++;
        }
        
        // Stress
        if (day.stressAvg >= 6) highStressDays++;
        
        // Training
        if (day.trainings?.length > 0) trainingDays++;
        
        // Emotional risk accumulator
        let dayRisk = 0;
        if (day.stressAvg >= 6) dayRisk += 35;
        else if (day.stressAvg >= 4) dayRisk += 15;
        const sleepDef = (profile.sleepHours || 8) - (day.sleepHours || 0);
        if (sleepDef > 2) dayRisk += 15;
        avgEmotionalRisk += dayRisk;
      }
      
      if (totalDays > 0) {
        avgEmotionalRisk = Math.round(avgEmotionalRisk / totalDays);
      }
      
      return {
        proteinDeficitDays,
        highStressDays,
        trainingDays,
        avgEmotionalRisk,
        totalDays,
        hasData: totalDays >= 3
      };
    }, [wrap, lsGet]);
    
    return h('div', { className: 'insights-wrap' },
      h('div', { className: 'insights-wrap__header' },
        h('span', { className: 'insights-wrap__title' }, '📋 Итоги'),
        h(InfoButton, {
          infoKey: 'WEEKLY_WRAP',
          debugData: {
            daysWithData: wrap.daysWithData,
            healthScore: wrap.healthScore,
            bestDay: wrap.bestDay,
            hiddenWinsCount: wrap.hiddenWins?.length || 0
          }
        })
      ),
      h('div', { className: 'insights-wrap__summary' },
        h('div', { className: 'insights-wrap__stat' },
          h('div', { className: 'insights-wrap__stat-value' }, wrap.daysWithData),
          h('div', { className: 'insights-wrap__stat-label' }, 'дней с данными')
        ),
        h('div', { className: 'insights-wrap__stat' },
          h('div', { className: 'insights-wrap__stat-value' }, wrap.healthScore),
          h('div', { className: 'insights-wrap__stat-label' }, 'Health Score')
        )
      ),
      
      // 🆕 v3.22.0: Extended Analytics Summary
      extendedSummary.hasData && h('div', { className: 'insights-wrap__extended' },
        h('div', { className: 'insights-wrap__extended-title' }, '🧠 Расширенная аналитика'),
        h('div', { className: 'insights-wrap__extended-grid' },
          // Protein Debt Days
          h('div', { 
            className: `insights-wrap__extended-item ${extendedSummary.proteinDeficitDays >= 3 ? 'insights-wrap__extended-item--warning' : ''}`
          },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.proteinDeficitDays === 0 ? '✅' : extendedSummary.proteinDeficitDays
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 
              extendedSummary.proteinDeficitDays === 0 ? 'Белок ОК' : 'дн. мало белка'
            ),
            extendedSummary.proteinDeficitDays >= 3 && h('a', {
              href: 'https://pubmed.ncbi.nlm.nih.gov/20095013/',
              target: '_blank',
              className: 'insights-wrap__extended-pmid',
              title: 'Mettler 2010 — белок при дефиците'
            }, '🔬')
          ),
          
          // High Stress Days
          h('div', { 
            className: `insights-wrap__extended-item ${extendedSummary.highStressDays >= 3 ? 'insights-wrap__extended-item--warning' : ''}`
          },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.highStressDays === 0 ? '😌' : extendedSummary.highStressDays
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 
              extendedSummary.highStressDays === 0 ? 'Стресс ОК' : 'дн. стресс ≥6'
            ),
            extendedSummary.highStressDays >= 3 && h('a', {
              href: 'https://pubmed.ncbi.nlm.nih.gov/11070333/',
              target: '_blank',
              className: 'insights-wrap__extended-pmid',
              title: 'Epel 2001 — стресс и переедание'
            }, '🔬')
          ),
          
          // Training Days
          h('div', { className: 'insights-wrap__extended-item insights-wrap__extended-item--positive' },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.trainingDays === 0 ? '—' : `💪 ${extendedSummary.trainingDays}`
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 'тренировок')
          ),
          
          // Avg Emotional Risk
          h('div', { 
            className: `insights-wrap__extended-item ${extendedSummary.avgEmotionalRisk >= 40 ? 'insights-wrap__extended-item--warning' : ''}`
          },
            h('span', { className: 'insights-wrap__extended-value' }, 
              extendedSummary.avgEmotionalRisk < 20 ? '🧘' : `${extendedSummary.avgEmotionalRisk}%`
            ),
            h('span', { className: 'insights-wrap__extended-label' }, 
              extendedSummary.avgEmotionalRisk < 20 ? 'Эмоц. ОК' : 'ср. эмоц.риск'
            )
          )
        )
      ),
      
      wrap.bestDay && h('div', { className: 'insights-wrap__highlight' },
        h('div', { className: 'insights-wrap__highlight-title' }, '🏆 Лучший день'),
        h('div', { className: 'insights-wrap__highlight-value' },
          wrap.bestDay.date, ' — ', wrap.bestDay.kcal, ' ккал'
        )
      ),
      wrap.hiddenWins && wrap.hiddenWins.length > 0 && h('div', { className: 'insights-wins' },
        h('div', { className: 'insights-wins__title' }, '🎯 Скрытые победы'),
        wrap.hiddenWins.map((win, i) =>
          h('div', { key: i, className: 'insights-win' }, win)
        )
      )
    );
  }

  /**
   * Empty State — нет данных
   */
  function EmptyState({ daysAnalyzed, minRequired }) {
    const progress = Math.min(100, Math.round((daysAnalyzed / minRequired) * 100));
    const daysLeft = Math.max(0, minRequired - daysAnalyzed);
    
    // Мотивирующие сообщения в зависимости от прогресса
    const getMessage = () => {
      if (daysAnalyzed === 0) return 'Начните вести дневник — и аналитика заработает!';
      if (progress < 50) return 'Отличное начало! Продолжайте вести дневник';
      if (progress < 100) return 'Почти готово! Осталось совсем немного';
      return 'Данные собраны! Анализируем...';
    };
    
    return h('div', { className: 'insights-empty' },
      // Анимированная иконка
      h('div', { className: 'insights-empty__icon' }, '🔮'),
      
      // Заголовок
      h('div', { className: 'insights-empty__title' }, 'Собираем данные для аналитики'),
      
      // Подзаголовок с мотивацией
      h('div', { className: 'insights-empty__subtitle' }, getMessage()),
      
      // Прогресс-бар
      h('div', { className: 'insights-empty__progress' },
        h('div', { 
          className: 'insights-empty__progress-fill',
          style: { width: `${progress}%` }
        })
      ),
      
      // Статистика
      h('div', { className: 'insights-empty__stats' },
        h('div', { style: { textAlign: 'center' } },
          h('div', { className: 'insights-empty__stat-value insights-empty__stat-value--primary' }, daysAnalyzed),
          h('div', { className: 'insights-empty__stat-label' }, 'дней есть')
        ),
        h('div', { style: { textAlign: 'center' } },
          h('div', { className: 'insights-empty__stat-value insights-empty__stat-value--secondary' }, daysLeft),
          h('div', { className: 'insights-empty__stat-label' }, 'осталось')
        )
      ),
      
      // Что будет доступно
      h('div', { className: 'insights-empty__features' },
        h('div', { className: 'insights-empty__features-title' }, '✨ Скоро будет доступно:'),
        h('div', { className: 'insights-empty__feature-list' },
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '📊'), 'Статус здоровья 0-100'
          ),
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '🧬'), 'Метаболический фенотип'
          ),
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '💡'), 'Персональные рекомендации'
          ),
          h('div', { className: 'insights-empty__feature-item' },
            h('span', null, '📈'), 'Прогнозы и паттерны'
          )
        )
      )
    );
  }

  /**
   * Main Insights Card — главный компонент
   */
  function InsightsCard({ lsGet, profile, pIndex, optimum }) {
    const [activeTab, setActiveTab] = useState('today');
    const [selectedCategory, setSelectedCategory] = useState(null);
    
    const insights = useMemo(() => {
      return analyze({
        daysBack: activeTab === 'today' ? 7 : 14,
        lsGet,
        profile,
        pIndex,
        optimum
      });
    }, [activeTab, lsGet, profile, pIndex, optimum]);
    
    // Собираем context для What-If симулятора
    const whatIfContext = useMemo(() => {
      if (!lsGet) return null;
      
      const todayKey = new Date().toISOString().slice(0, 10);
      const today = lsGet(`heys_dayv2_${todayKey}`, {});
      const dayTot = today.dayTot || { kcal: 0, prot: 0, carbs: 0, fat: 0 };
      
      // Текущая волна
      let currentWave = null;
      if (HEYS.InsulinWave?.calculate && today.meals?.length > 0) {
        try {
          currentWave = HEYS.InsulinWave.calculate({
            meals: today.meals,
            pIndex,
            getProductFromItem: (item) => pIndex?.byId?.get(item.product_id) || item,
            baseWaveHours: profile?.insulinWaveHours || 3,
            trainings: today.trainings || [],
            dayData: {
              sleepHours: today.sleepHours,
              sleepQuality: today.sleepQuality,
              waterMl: today.waterMl,
              stressAvg: today.stressAvg,
              householdMin: today.householdMin,
              steps: today.steps,
              profile
            }
          });
        } catch (e) {
          console.warn('[WhatIfSimulator] Failed to calculate wave:', e);
        }
      }
      
      // Текущий риск срыва
      let currentRisk = 0;
      if (HEYS.Metabolic?.calculateCrashRisk24h) {
        try {
          const riskData = HEYS.Metabolic.calculateCrashRisk24h({
            today,
            profile,
            kcalPct: optimum ? dayTot.kcal / optimum : 0,
            proteinPct: dayTot.prot ? dayTot.prot / ((optimum || 2000) * 0.25 / 4) : 0
          });
          currentRisk = riskData?.risk || 0;
        } catch (e) {}
      }
      
      return {
        currentWave,
        currentRisk,
        dayTot,
        optimum,
        profile,
        trainings: today.trainings || []
      };
    }, [lsGet, profile, pIndex, optimum]);
    
    if (!insights.available) {
      return h('div', { className: 'insights-card' },
        h('div', { className: 'insights-card__header' },
          h('div', { className: 'insights-card__title' }, '📊 Инсайты недели')
        ),
        h(EmptyState, {
          daysAnalyzed: insights.daysAnalyzed,
          minRequired: insights.minDaysRequired
        })
      );
    }
    
    return h('div', { className: 'insights-card' },
      h('div', { className: 'insights-card__header' },
        h('div', { className: 'insights-card__title' },
          '📊 Инсайты недели',
          h('span', { className: 'insights-card__badge' }, insights.healthScore.total)
        )
      ),
      h('div', { className: 'insights-card__tabs' },
        h('button', {
          className: `insights-card__tab ${activeTab === 'today' ? 'insights-card__tab--active' : ''}`,
          onClick: () => setActiveTab('today')
        }, 'Сегодня'),
        h('button', {
          className: `insights-card__tab ${activeTab === 'week' ? 'insights-card__tab--active' : ''}`,
          onClick: () => setActiveTab('week')
        }, 'Неделя')
      ),
      
      // Health Score кольца
      h(TotalHealthRing, { score: insights.healthScore.total }),
      h(HealthRingsGrid, {
        healthScore: insights.healthScore,
        onCategoryClick: setSelectedCategory
      }),
      
      // 🧪 What-If Simulator (новый!)
      activeTab === 'today' && whatIfContext && h(WhatIfCard, { context: whatIfContext }),
      
      // Старая What-If секция (сценарии на основе истории)
      h(WhatIfSection, { scenarios: insights.whatIf }),
      
      // Weight Prediction
      h(WeightPrediction, { prediction: insights.weightPrediction }),
      
      // Паттерны (сворачиваемый список)
      activeTab === 'week' && h(PatternsList, { patterns: insights.patterns }),
      
      // Weekly Wrap
      activeTab === 'week' && h(WeeklyWrap, { wrap: insights.weeklyWrap })
    );
  }

  // === PRIORITY UI COMPONENTS ===
  
  /**
   * PriorityBadge — визуализация приоритета с emoji и цветом
   */
  function PriorityBadge({ priority, showLabel = false, size = 'normal' }) {
    const config = PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.INFO;
    
    return h('span', {
      className: `priority-badge priority-badge--${priority?.toLowerCase() || 'info'} priority-badge--${size}`,
      style: { 
        '--priority-color': config.color,
        backgroundColor: config.color + '20',
        color: config.color,
        borderColor: config.color + '40'
      },
      title: config.description
    },
      h('span', { className: 'priority-badge__emoji' }, config.emoji),
      showLabel && h('span', { className: 'priority-badge__label' }, config.name)
    );
  }

  /**
   * CategoryBadge — бейдж категории
   */
  function CategoryBadge({ category, showLabel = true }) {
    const config = CATEGORIES[category] || CATEGORIES.STATISTICS;
    
    return h('span', {
      className: `category-badge category-badge--${category?.toLowerCase() || 'statistics'}`,
      style: {
        '--category-color': config.color,
        backgroundColor: config.color + '15',
        color: config.color
      },
      title: config.description
    },
      h('span', { className: 'category-badge__emoji' }, config.emoji),
      showLabel && h('span', { className: 'category-badge__label' }, config.name)
    );
  }

  /**
   * ActionabilityBadge — срочность действия
   */
  function ActionabilityBadge({ actionability }) {
    const config = ACTIONABILITY[actionability] || ACTIONABILITY.INFORMATIONAL;
    
    return h('span', {
      className: `actionability-badge actionability-badge--${actionability?.toLowerCase() || 'informational'}`,
      title: config.description
    },
      h('span', { className: 'actionability-badge__emoji' }, config.emoji),
      h('span', { className: 'actionability-badge__label' }, config.name)
    );
  }

  /**
   * CategoryFilterBar — фильтры по категориям
   */
  function SectionHeader({ title, icon, priority, infoKey, badge }) {
    const priorityConfig = PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.INFO;
    
    return h('div', { className: 'section-header section-header--with-priority' },
      h('div', { className: 'section-header__left' },
        icon && h('span', { className: 'section-header__icon' }, icon),
        h('span', { className: 'section-header__title' }, title),
        priority && h(PriorityBadge, { priority, size: 'small' })
      ),
      h('div', { className: 'section-header__right' },
        badge && h('span', { className: 'section-header__badge' }, badge),
        infoKey && h(InfoButton, { infoKey })
      )
    );
  }

  // === INSIGHTS TAB — Полноэкранная вкладка ===
  // Секции отсортированы по приоритету: CRITICAL → HIGH → MEDIUM → LOW
  // 🎭 Демо-данные для показа тура новым пользователям
  const DEMO_INSIGHTS = {
    available: true,
    isDemo: true,
    daysAnalyzed: 7,
    daysWithData: 7,
    confidence: 85,
    isFullAnalysis: false,
    patterns: [
      {
        id: 'demo_meal_timing',
        type: 'timing',
        name: 'Оптимальное время приёмов',
        priority: 'HIGH',
        confidence: 0.82,
        impact: 0.7,
        desc: 'Ваши завтраки в 8-9 утра идеально синхронизированы с циркадными ритмами',
        recommendation: 'Продолжайте завтракать в это время — метаболизм работает оптимально',
        trend: 'stable',
        science: { pmid: '9331550', category: 'TIMING' }
      },
      {
        id: 'demo_protein',
        type: 'nutrition',
        name: 'Распределение белка',
        priority: 'MEDIUM',
        confidence: 0.75,
        impact: 0.6,
        desc: 'Белок распределён равномерно: ~30г на приём',
        recommendation: 'Отличный баланс! Это оптимально для синтеза мышечного белка',
        trend: 'improving',
        science: { pmid: '23360586', category: 'NUTRITION' }
      }
    ],
    healthScore: {
      total: 78,
      trend: 'improving',
      categories: {
        nutrition: { score: 82, trend: 'stable' },
        timing: { score: 75, trend: 'improving' },
        recovery: { score: 72, trend: 'stable' },
        activity: { score: 80, trend: 'improving' }
      }
    },
    whatIf: [
      {
        id: 'demo_whatif_1',
        title: '+30 мин ходьбы',
        impact: '+5% к сжиганию',
        desc: 'Добавьте прогулку после обеда',
        priority: 'MEDIUM'
      }
    ],
    weightPrediction: {
      available: true,
      currentTrend: -0.3,
      weeklyRate: -0.3,
      projectedDays: 60,
      confidence: 0.7
    },
    weeklyWrap: {
      highlights: ['Стабильный режим питания', 'Хороший баланс БЖУ'],
      improvements: ['Добавьте больше клетчатки'],
      avgScore: 78
    }
  };

  // 🎭 Демо-статус для тура
  const DEMO_STATUS = {
    score: 78,
    level: {
      id: 'good',
      label: 'Хорошо',
      emoji: '✓',
      color: '#22c55e'
    },
    factorScores: {
      kcal: 85,
      protein: 80,
      timing: 70,
      steps: 75,
      training: 60,
      household: 50,
      sleep: 85,
      stress: 70,
      water: 90
    },
    categoryScores: {
      nutrition: { score: 78, label: 'Питание', icon: '🍽️', color: '#22c55e' },
      activity: { score: 62, label: 'Активность', icon: '🏃', color: '#eab308' },
      recovery: { score: 77, label: 'Восстановление', icon: '😴', color: '#22c55e' },
      hydration: { score: 90, label: 'Гидратация', icon: '💧', color: '#22c55e' }
    },
    topIssues: [
      { factor: { icon: '🏋️', label: 'Тренировки' }, score: 60 },
      { factor: { icon: '⏰', label: 'Тайминг' }, score: 70 }
    ],
    topActions: [
      'Добавьте тренировку',
      'Оптимизируйте время приёмов'
    ]
  };

  function InfoButton({ infoKey, debugData, size }) {
    const [isOpen, setIsOpen] = useState(false);
    
    const info = SCIENCE_INFO[infoKey];
    if (!info) return null;
    
    const handleButtonClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.vibrate) navigator.vibrate(10);
      setIsOpen(true);
    };
    
    const handleOverlayClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    
    const handleModalClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Не закрываем при клике внутри модалки
    };
    
    const handleCloseClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    
    // Рендерим модалку через Portal в body
    const modal = isOpen && ReactDOM.createPortal(
      h('div', { 
        className: 'info-modal-overlay', 
        onClick: handleOverlayClick,
        onTouchEnd: handleOverlayClick
      },
        h('div', { 
          className: 'info-modal', 
          onClick: handleModalClick,
          onTouchEnd: handleModalClick
        },
          // Header
          h('div', { className: 'info-modal__header' },
            h('span', { className: 'info-modal__title' }, info.name),
            h('button', { 
              className: 'info-modal__close', 
              onClick: handleCloseClick,
              onTouchEnd: handleCloseClick,
              type: 'button'
            }, '×')
          ),
          
          // Formula
          h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '📐 Формула'),
            h('pre', { className: 'info-modal__formula' }, info.formula)
          ),
          
          // Source
          info.source && h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '📚 Источник'),
            h('div', { className: 'info-modal__source' },
              info.pmid 
                ? h('a', {
                    href: `https://pubmed.ncbi.nlm.nih.gov/${info.pmid}/`,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    className: 'info-modal__link',
                    onClick: (e) => e.stopPropagation()
                  }, `${info.source} (PMID: ${info.pmid})`)
                : info.source
            )
          ),
          
          // Interpretation
          info.interpretation && h('div', { className: 'info-modal__section' },
            h('div', { className: 'info-modal__label' }, '💡 Интерпретация'),
            h('div', { className: 'info-modal__text' }, info.interpretation)
          ),
          
          // Debug data (for testing)
          debugData && h('div', { className: 'info-modal__section info-modal__section--debug' },
            h('div', { className: 'info-modal__label' }, '🔧 Debug'),
            h('pre', { className: 'info-modal__debug' },
              JSON.stringify(debugData, null, 2)
            )
          )
        )
      ),
      document.body
    );
    
    return h('span', { className: 'info-button-wrapper' },
      // Кнопка (?)
      h('button', {
        className: `info-button ${size === 'small' ? 'info-button--small' : ''}`,
        onClick: handleButtonClick,
        onTouchEnd: handleButtonClick,
        type: 'button',
        title: 'Как это считается?'
      }, '?'),
      modal
    );
  }

  /**
   * Метрика с кнопкой info — переиспользуемый компонент
   */
  function MetricWithInfo({ label, value, unit, infoKey, debugData, color, className }) {
    return h('div', { className: `metric-with-info ${className || ''}` },
      h('div', { className: 'metric-with-info__row' },
        h('span', { className: 'metric-with-info__label' }, label),
        h(InfoButton, { infoKey, debugData })
      ),
      h('div', { className: 'metric-with-info__value', style: color ? { color } : null },
        value,
        unit && h('span', { className: 'metric-with-info__unit' }, ` ${unit}`)
      )
    );
  }

  // === METABOLIC INTELLIGENCE UI COMPONENTS ===
  
  /**
   * StatusProgressRing — SVG кольцо прогресса 0-100 с count-up анимацией
   */
  function ConfidenceBadge({ confidence, completeness }) {
    const config = {
      high: { label: 'Высокая', color: '#22c55e', icon: '✓' },
      medium: { label: 'Средняя', color: '#eab308', icon: '~' },
      low: { label: 'Низкая', color: '#ef4444', icon: '?' }
    };
    
    const c = config[confidence] || config.low;
    
    return h('div', { 
      className: 'confidence-badge',
      style: { borderColor: c.color }
    },
      h('span', { 
        className: 'confidence-badge__icon',
        style: { backgroundColor: c.color }
      }, c.icon),
      h('span', { className: 'confidence-badge__label' }, 
        `${c.label} уверенность`
      ),
      completeness !== undefined && h('span', { className: 'confidence-badge__pct' },
        ` (${completeness}% данных)`
      )
    );
  }
  
  /**
   * MetabolicQuickStatus — компактная карточка статуса + риска
   * Показывает: Score 0-100, фазу метаболизма, риск срыва
   */
  function MetabolicStatusCard({ lsGet, profile, pIndex, selectedDate }) {
    const [showDetails, setShowDetails] = useState(false);
    
    // Получаем текущий статус
    const status = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      return HEYS.Metabolic.getStatus({
        dateStr: selectedDate || new Date().toISOString().split('T')[0],
        pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
        profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        forceRefresh: false
      });
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Получаем вчерашний статус для тренда
    const prevStatus = useMemo(() => {
      if (!HEYS.Metabolic?.getStatus) return null;
      
      const today = selectedDate || new Date().toISOString().split('T')[0];
      const prevDate = new Date(today);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      
      try {
        return HEYS.Metabolic.getStatus({
          dateStr: prevDateStr,
          pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          forceRefresh: false
        });
      } catch {
        return null;
      }
    }, [lsGet, profile, pIndex, selectedDate]);
    
    // Вычисляем breakdown по столпам из reasons
    const pillarScores = useMemo(() => {
      if (!status?.reasons?.length) return null;
      
      const pillars = { nutrition: 100, timing: 100, activity: 100, recovery: 100 };
      status.reasons.forEach(r => {
        if (r.pillar && pillars[r.pillar] !== undefined) {
          pillars[r.pillar] = Math.max(0, pillars[r.pillar] - (r.impact || 10));
        }
      });
      return pillars;
    }, [status]);
    
    if (!status || !status.available) {
      return h('div', { className: 'metabolic-status-card metabolic-status-card--empty' },
        h('div', { className: 'metabolic-status-card__icon' }, '📊'),
        h('div', { className: 'metabolic-status-card__message' },
          status?.message || 'Добавь данные для анализа статуса'
        )
      );
    }
    
    // Эмодзи по risk level
    const riskEmojis = {
      low: '✅',
      medium: '⚠️',
      high: '🚨'
    };
    
    return h('div', { className: `metabolic-status-card metabolic-status-card--v2 ${showDetails ? 'metabolic-status-card--expanded' : ''}` },
      // Заголовок с ring и trend
      h('div', { 
        className: 'metabolic-status-card__header metabolic-status-card__header--v2',
        onClick: () => setShowDetails(!showDetails)
      },
        h('div', { className: 'metabolic-status-card__ring-container' },
          h(StatusProgressRing, { score: status.score, size: 100, strokeWidth: 8 }),
          prevStatus?.available && h(StatusTrendBadge, { 
            currentScore: status.score, 
            prevScore: prevStatus.score 
          })
        ),
        h('div', { className: 'metabolic-status-card__info' },
          h('div', { className: 'metabolic-status-card__title-v2' }, 'Метаболический Статус'),
          // Metabolic Phase
          status.metabolicPhase && h('div', { className: 'metabolic-status-card__phase' },
            h('span', { className: 'metabolic-status-card__phase-emoji' }, status.metabolicPhase.emoji),
            h('span', { className: 'metabolic-status-card__phase-label' }, status.metabolicPhase.label),
            status.metabolicPhase.timeToLipolysis > 0 && h('span', { className: 'metabolic-status-card__phase-time' },
              ` → ${Math.round(status.metabolicPhase.timeToLipolysis * 60)} мин`
            )
          ),
          // Risk Level
          h('div', { className: `metabolic-status-card__risk metabolic-status-card__risk--${status.riskLevel}` },
            h('span', { className: 'metabolic-status-card__risk-emoji' }, riskEmojis[status.riskLevel]),
            h('span', { className: 'metabolic-status-card__risk-label' },
              status.riskLevel === 'low' ? 'Низкий риск' :
              status.riskLevel === 'medium' ? 'Средний риск' :
              'Высокий риск'
            )
          )
        ),
        h('span', { className: 'metabolic-status-card__chevron' }, showDetails ? '▼' : '▶')
      ),
      
      // Breakdown по столпам (всегда видим)
      pillarScores && h('div', { className: 'metabolic-status-card__breakdown' },
        h(PillarBreakdownBars, { pillars: pillarScores })
      ),
      
      // Детали (развернутые)
      showDetails && h('div', { className: 'metabolic-status-card__details' },
        // Причины снижения статуса
        status.reasons && status.reasons.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-header' },
            h('span', { className: 'metabolic-status-card__section-title' }, '📉 Что влияет на статус'),
            h(InfoButton, { infoKey: 'STATUS_INFLUENCES', size: 'small' })
          ),
          h('div', { className: 'metabolic-status-card__reasons' },
            status.reasons.map((reason, idx) =>
              h(ReasonCard, { key: reason.id || idx, reason })
            )
          )
        ),
        
        // Приоритизированные действия
        status.nextSteps && status.nextSteps.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-header' },
            h('span', { className: 'metabolic-status-card__section-title' }, '🎯 Приоритетные действия'),
            h(InfoButton, { infoKey: 'PRIORITY_ACTIONS', size: 'small' })
          ),
          h('div', { className: 'metabolic-status-card__steps' },
            status.nextSteps.slice(0, 3).map((step, idx) =>
              h(ActionCard, { key: step.id || idx, step })
            )
          )
        ),
        
        // Риск факторы
        status.riskFactors && status.riskFactors.length > 0 && h('div', { className: 'metabolic-status-card__section' },
          h('div', { className: 'metabolic-status-card__section-header' },
            h('span', { className: 'metabolic-status-card__section-title' }, 
              `${riskEmojis[status.riskLevel]} Факторы риска`
            ),
            h(InfoButton, { infoKey: 'STATUS_RISK_FACTORS', size: 'small' })
          ),
          h('div', { className: 'metabolic-status-card__risk-factors' },
            status.riskFactors.map((factor, idx) =>
              h('div', { key: factor.id || idx, className: 'metabolic-status-card__risk-factor' },
                h('span', { className: 'metabolic-status-card__risk-factor-label' }, factor.label),
                h('span', { className: 'metabolic-status-card__risk-factor-impact' }, `+${factor.impact}`)
              )
            )
          )
        ),
        
        // Confidence Badge
        h('div', { className: 'metabolic-status-card__confidence-section' },
          h(ConfidenceBadge, { 
            confidence: status.confidence,
            completeness: status.debug?.inventory?.completeness 
          })
        )
      )
    );
  }
  
  /**
   * ReasonCard — карточка причины снижения статуса
   */
  function ReasonCard({ reason }) {
    const [showScience, setShowScience] = useState(false);
    
    const pillarIcons = {
      nutrition: '🍽️',
      timing: '⏰',
      activity: '🏃',
      recovery: '😴'
    };
    
    return h('div', { className: `reason-card reason-card--${reason.pillar}` },
      h('div', { className: 'reason-card__header' },
        h('span', { className: 'reason-card__icon' }, pillarIcons[reason.pillar] || '📊'),
        h('span', { className: 'reason-card__label' }, reason.label),
        h('span', { className: 'reason-card__impact' }, `-${reason.impact}`)
      ),
      h('div', { className: 'reason-card__short' }, reason.short),
      reason.details && h('div', { className: 'reason-card__details' }, reason.details),
      reason.scientificBasis && h('div', { className: 'reason-card__science' },
        h('button', {
          className: 'reason-card__science-toggle',
          onClick: () => setShowScience(!showScience)
        }, showScience ? '📖 Скрыть обоснование' : '📖 Научное обоснование'),
        showScience && h('div', { className: 'reason-card__science-text' }, reason.scientificBasis)
      )
    );
  }
  
  /**
   * ActionCard — карточка приоритизированного действия
   */
  function ActionCard({ step }) {
    const priorityColors = {
      0: '#ef4444', // urgent
      1: '#f97316', // high
      2: '#eab308', // medium
      3: '#22c55e'  // low
    };
    
    const priorityLabels = {
      0: 'СРОЧНО',
      1: 'Важно',
      2: 'Желательно',
      3: 'Опционально'
    };
    
    return h('div', { className: 'action-card' },
      h('div', { className: 'action-card__header' },
        h('span', { className: 'action-card__label' }, step.label),
        h('span', { 
          className: 'action-card__priority',
          style: { backgroundColor: priorityColors[step.priority || 3] }
        }, priorityLabels[step.priority || 3])
      ),
      step.why && h('div', { className: 'action-card__why' }, step.why),
      h('div', { className: 'action-card__footer' },
        step.etaMin && h('span', { className: 'action-card__eta' },
          `⏱️ ${step.etaMin < 60 ? `${step.etaMin} мин` : `${Math.round(step.etaMin / 60)} ч`}`
        ),
        step.expectedEffect && h('span', { className: 'action-card__effect' },
          `💫 ${step.expectedEffect}`
        )
      )
    );
  }
  
  /**
   * PredictiveDashboard — предиктивная панель с табами (Risk | Forecast | Phenotype)
   * v3.0: Dual Risk Meter (сегодня + завтра), без timeline для risk и phenotype
   */

  // === ЭКСПОРТ ===
  HEYS.InsightsPI.uiCards = {
    CollapsibleSection,
    AdvancedAnalyticsCard,
    MetabolismCard,
    MetabolismSection,
    PatternCard,
    PatternsList,
    WeeklyWrap,
    EmptyState,
    InsightsCard,
    PriorityBadge,
    CategoryBadge,
    ActionabilityBadge,
    SectionHeader,
    InfoButton,
    MetricWithInfo,
    ConfidenceBadge,
    MetabolicStatusCard,
    ReasonCard,
    ActionCard
  };
  
  // Fallback для прямого доступа
  global.piUICards = HEYS.InsightsPI.uiCards;
  
  if (typeof console !== 'undefined' && console.log) {
    console.log('[PI UI Cards] v3.0.0 loaded — 19 card components');
  }
  
})(typeof window !== 'undefined' ? window : global);
