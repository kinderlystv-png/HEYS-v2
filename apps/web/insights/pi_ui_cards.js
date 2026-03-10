/**
 * HEYS Predictive Insights — UI Card Components Module v3.0.2
 * Extracted UI card components for clean architecture
 * v3.0.2: Fixed analytics API access via getAnalyticsFn safe accessor
 */

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = HEYS.dev || global.HEYS?.dev || {};
  const devLog = DEV.log ? DEV.log.bind(DEV) : () => { };

  // React imports with retry mechanism for CDN loading
  function initModule() {
    const React = window.React;
    if (!React || !React.createElement) {
      // React not ready yet - retry in 50ms (CDN may still be loading)
      setTimeout(initModule, 50);
      return;
    }

    const { createElement: h, useState, useEffect, useMemo, Component } = React;

    const piStats = HEYS.InsightsPI?.stats || window.piStats || {};
    const piScience = HEYS.InsightsPI?.constants?.SCIENCE_INFO || window.piConst?.SCIENCE_INFO || HEYS.InsightsPI?.science || window.piScience || {};
    const piUIHelpers = HEYS.InsightsPI?.uiHelpers || window.piUIHelpers || {};

    // Safe accessor for analytics functions (may be in InsightsPI.analyticsAPI or PredictiveInsights)
    const getAnalyticsFn = (fnName) => {
      return HEYS.InsightsPI?.analyticsAPI?.[fnName] ||
        HEYS.InsightsPI?.[fnName] ||
        HEYS.PredictiveInsights?.[fnName] ||
        (() => ({ hasData: false, error: `${fnName} not loaded` }));
    };

    // Safe products index builder (buildIndex is not always available on HEYS.products)
    const getProductsList = (lsGet) => {
      let products = HEYS.products?.getAll?.() || [];
      if (!Array.isArray(products) || products.length === 0) {
        const storeGet = HEYS?.store?.get;
        if (storeGet) products = storeGet('heys_products', []);
        else if (lsGet) products = lsGet('heys_products', []);
        else products = HEYS?.utils?.lsGet?.('heys_products', []) || [];
      }
      if (products && !Array.isArray(products) && Array.isArray(products.products)) {
        products = products.products;
      }
      return Array.isArray(products) ? products : [];
    };

    const buildProductsIndex = (lsGet) => {
      const buildIndex = HEYS.dayUtils?.buildProductIndex || HEYS.models?.buildProductIndex;
      if (!buildIndex) return null;
      const products = getProductsList(lsGet);
      return buildIndex(products);
    };

    const getMetabolismDate = (lsGet, selectedDate) => {
      const getter = lsGet || window.HEYS?.utils?.lsGet;
      const today = HEYS.dayUtils?.todayISO?.() || new Date().toISOString().split('T')[0];
      const baseDate = selectedDate || today;
      const canFallback = !selectedDate || selectedDate === today;
      if (!getter || !canFallback) return baseDate;

      const hasMetabolismData = (day) => {
        if (!day || typeof day !== 'object') return false;
        if ((day.meals || []).length > 0) return true;
        if ((day.trainings || []).length > 0) return true;
        if (getDaySleepHours(day) > 0) return true;
        if (day.sleepStart || day.sleepEnd) return true;
        return false;
      };

      const baseDay = getter(`heys_dayv2_${baseDate}`, {});
      if (hasMetabolismData(baseDay)) return baseDate;

      for (let i = 1; i <= 14; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const day = getter(`heys_dayv2_${dateStr}`, {});
        if (hasMetabolismData(day)) return dateStr;
      }

      return baseDate;
    };

    const getDaySleepHours = (day) => {
      if (!day || typeof day !== 'object') return 0;
      const totalSleepHours = HEYS.dayUtils?.getTotalSleepHours?.(day);
      if (Number.isFinite(totalSleepHours) && totalSleepHours > 0) return totalSleepHours;
      const storedSleepHours = Number(day.sleepHours);
      if (Number.isFinite(storedSleepHours) && storedSleepHours > 0) return storedSleepHours;
      const fallbackSleepHours = HEYS.dayUtils?.sleepHours?.(day.sleepStart, day.sleepEnd);
      return Number.isFinite(fallbackSleepHours) && fallbackSleepHours > 0 ? fallbackSleepHours : 0;
    };

    // InfoButton is defined in pi_ui_dashboard.js which loads AFTER this module
    // Use lazy getter to defer resolution until runtime
    const getInfoButton = () => {
      if (typeof piUIHelpers.getInfoButton === 'function') {
        return piUIHelpers.getInfoButton(h);
      }
      return HEYS.InsightsPI?.uiDashboard?.InfoButton ||
        HEYS.PredictiveInsights?.components?.InfoButton ||
        // Fallback: simple button that does nothing if InfoButton not loaded
        function InfoButtonFallback({ infoKey, size }) {
          return h('span', {
            className: 'info-button-placeholder',
            title: infoKey,
            style: { cursor: 'help', opacity: 0.5 }
          }, 'ℹ️');
        };
    };

    // HealthRing is defined in pi_ui_rings.js - use lazy getter for load order
    const getHealthRing = () => {
      return HEYS.InsightsPI?.uiRings?.HealthRing ||
        function HealthRingFallback({ score, label, color }) {
          return h('div', { style: { color } }, label, ': ', score);
        };
    };
    // Create proxy to use HealthRing naturally in render
    const HealthRing = new Proxy({}, {
      apply: (_, thisArg, args) => h(getHealthRing(), args[0])
    });

    /**
     * CollapsibleSection — сворачиваемая секция (v2.1: с InfoButton)
     * CRITICAL FIX: Always render InfoButton unconditionally to avoid hooks count changes
     */
    function CollapsibleSection({ title, icon, badge, children, defaultOpen = false, compact = false, infoKey }) {
      const [isOpen, setIsOpen] = useState(defaultOpen);

      const InfoButtonComp = getInfoButton();

      return h('div', { className: `insights-collapsible ${isOpen ? 'insights-collapsible--open' : ''} ${compact ? 'insights-collapsible--compact' : ''}` },
        h('div', {
          className: 'insights-collapsible__header',
          onClick: () => setIsOpen(!isOpen)
        },
          h('div', { className: 'insights-collapsible__title' },
            icon && h('span', { className: 'insights-collapsible__icon' }, icon),
            h('span', { className: 'insights-collapsible__text' }, title),
            // ALWAYS render InfoButton (even if infoKey is falsy) — it will return null internally after hooks
            h(InfoButtonComp, { infoKey, size: 'small' })
          ),
          badge && h('span', { className: 'insights-collapsible__badge' }, badge),
          h('span', { className: 'insights-collapsible__chevron' }, '›')
        ),
        h('div', { className: 'insights-collapsible__content' }, children)
      );
    }

    /**
     * AdvancedAnalyticsCard — карточка продвинутой аналитики v3.0
     * Показывает: Scientific Confidence, Correlations, Patterns, Risk, Energy + 6 научных модулей
     */
    function AdvancedAnalyticsCard({ lsGet, profile, pIndex, selectedDate }) {
      const [activeTab, setActiveTab] = useState('overview');

      // Вычисляем все метрики включая научные v3.0
      const analytics = useMemo(() => {
        const opts = {
          lsGet: lsGet || window.HEYS?.utils?.lsGet,
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          pIndex: pIndex || buildProductsIndex(lsGet || window.HEYS?.utils?.lsGet),
          selectedDate
        };

        return {
          confidence: getAnalyticsFn('calculateConfidenceScore')(opts),
          correlations: getAnalyticsFn('calculateCorrelationMatrix')(opts),
          patterns: getAnalyticsFn('detectMetabolicPatterns')(opts),
          risk: getAnalyticsFn('calculatePredictiveRisk')(opts),
          energy: getAnalyticsFn('forecastEnergy')(opts),
          // === SCIENTIFIC v3.0 ===
          bayesian: getAnalyticsFn('calculateBayesianConfidence')(opts),
          timeLag: getAnalyticsFn('calculateTimeLaggedCorrelations')(opts),
          gvi: getAnalyticsFn('calculateGlycemicVariability')(opts),
          allostatic: getAnalyticsFn('calculateAllostaticLoad')(opts),
          ews: getAnalyticsFn('detectEarlyWarningSignals')(opts),
          twoProcess: getAnalyticsFn('calculate2ProcessModel')(opts)
        };
      }, [lsGet, profile, pIndex, selectedDate]);

      const { confidence, correlations, patterns, risk, energy, bayesian, timeLag, gvi, allostatic, ews, twoProcess } = analytics;

      // Tabs — расширенные
      const tabs = [
        { id: 'overview', label: '📊', title: 'Обзор' },
        { id: 'science', label: '🔬', title: 'Научная аналитика' },
        { id: 'correlations', label: '🔗', title: 'Связи' },
        { id: 'patterns', label: '🧬', title: 'Паттерны' },
        { id: 'risk', label: '⚠️', title: 'Риски' },
        { id: 'energy', label: '⚡', title: 'Энергия' }
      ];

      // Render Overview Tab
      const renderOverview = () => {
        return h('div', { className: 'adv-analytics__overview' },
          // Bayesian Confidence Badge (если есть данные)
          bayesian.hasData ? h('div', { className: `adv-analytics__confidence adv-analytics__confidence--${bayesian.qualityGrade}` },
            h('div', { className: 'adv-analytics__confidence-score' },
              h('span', { className: 'adv-analytics__confidence-emoji' }, bayesian.gradeEmoji),
              h('span', { className: 'adv-analytics__confidence-value' }, `${bayesian.confidencePercent}%`),
              h('span', { className: 'adv-analytics__confidence-label' }, 'Байесовская уверенность')
            ),
            h('div', { className: 'adv-analytics__confidence-factors' },
              bayesian.mape !== null && h('div', { className: 'adv-analytics__factor' },
                h('span', null, '📉 MAPE'),
                h('span', null, `${bayesian.mape}%`)
              ),
              h('div', { className: 'adv-analytics__factor' },
                h('span', null, '📊 Точность'),
                h('span', null, `${bayesian.components.mapeLikelihood}%`)
              ),
              h('div', { className: 'adv-analytics__factor' },
                h('span', null, '📈 Объём'),
                h('span', null, `${bayesian.components.nLikelihood}%`)
              )
            ),
            h('div', { className: 'adv-analytics__confidence-advice' }, bayesian.message)
          ) :
            // Fallback на старую confidence
            h('div', { className: `adv-analytics__confidence adv-analytics__confidence--${confidence.level}` },
              h('div', { className: 'adv-analytics__confidence-score' },
                h('span', { className: 'adv-analytics__confidence-emoji' }, confidence.levelEmoji),
                h('span', { className: 'adv-analytics__confidence-value' }, `${confidence.score}%`),
                h('span', { className: 'adv-analytics__confidence-label' }, confidence.levelLabel)
              ),
              h('div', { className: 'adv-analytics__confidence-factors' },
                h('div', { className: 'adv-analytics__factor' },
                  h('span', null, '📅 Данные'),
                  h('span', null, `${confidence.factors.volume}%`)
                ),
                h('div', { className: 'adv-analytics__factor' },
                  h('span', null, '📋 Полнота'),
                  h('span', null, `${confidence.factors.completeness}%`)
                ),
                h('div', { className: 'adv-analytics__factor' },
                  h('span', null, '📈 Регулярность'),
                  h('span', null, `${confidence.factors.consistency}%`)
                )
              ),
              h('div', { className: 'adv-analytics__confidence-advice' }, confidence.advice)
            ),

          // Quick Stats Row — расширенная
          h('div', { className: 'adv-analytics__quick-stats' },
            // EWS Score (если есть)
            ews.hasData && h('div', { className: `adv-analytics__stat adv-analytics__stat--${ews.criticalTransitionRisk}` },
              h('div', { className: 'adv-analytics__stat-icon' }, ews.riskEmoji),
              h('div', { className: 'adv-analytics__stat-value' }, `${ews.ewsScore}%`),
              h('div', { className: 'adv-analytics__stat-label' }, 'EWS риск')
            ),
            // Allostatic Load
            allostatic.hasData && h('div', { className: `adv-analytics__stat adv-analytics__stat--${allostatic.riskLevel}` },
              h('div', { className: 'adv-analytics__stat-icon' }, allostatic.riskEmoji),
              h('div', { className: 'adv-analytics__stat-value' }, allostatic.alScore),
              h('div', { className: 'adv-analytics__stat-label' }, 'AL нагрузка')
            ),
            // GVI
            gvi.hasData && h('div', { className: `adv-analytics__stat adv-analytics__stat--${gvi.riskCategory}` },
              h('div', { className: 'adv-analytics__stat-icon' }, gvi.riskEmoji),
              h('div', { className: 'adv-analytics__stat-value' }, `${gvi.gvi}%`),
              h('div', { className: 'adv-analytics__stat-label' }, 'GVI')
            ),
            // 2-Process Alertness
            twoProcess.hasData && h('div', { className: `adv-analytics__stat adv-analytics__stat--${twoProcess.alertnessLevel}` },
              h('div', { className: 'adv-analytics__stat-icon' }, twoProcess.alertnessEmoji),
              h('div', { className: 'adv-analytics__stat-value' }, `${twoProcess.alertness}%`),
              h('div', { className: 'adv-analytics__stat-label' }, 'Бодрость')
            )
          ),

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
              h(getInfoButton(), { infoKey: 'BAYESIAN_CONFIDENCE' })
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
              h(getInfoButton(), { infoKey: 'GLYCEMIC_VARIABILITY' })
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
              h(getInfoButton(), { infoKey: 'ALLOSTATIC_LOAD' })
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
              h(getInfoButton(), { infoKey: 'EARLY_WARNING_SIGNALS' })
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
              h(getInfoButton(), { infoKey: 'TWO_PROCESS_MODEL' })
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
              h(getInfoButton(), { infoKey: 'TIME_LAGGED_CORRELATIONS' })
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
            h(getInfoButton(), { infoKey: 'ADVANCED_ANALYTICS' })
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

      const InfoButtonComp = getInfoButton();

      return h('div', {
        className: `insights-metabolism-card insights-metabolism-card--${quality} ${showDetails ? 'insights-metabolism-card--expanded' : ''}`,
        onClick: () => setShowDetails(!showDetails)
      },
        h('div', { className: 'insights-metabolism-card__header' },
          h('div', { className: 'insights-metabolism-card__icon', style: { color } }, icon),
          h('div', { className: 'insights-metabolism-card__info' },
            h('div', { className: 'insights-metabolism-card__title' },
              title,
              // ALWAYS render InfoButton to avoid hooks count changes
              h(InfoButtonComp, { infoKey, debugData })
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
      const resolvedDate = useMemo(() => {
        return getMetabolismDate(lsGet || window.HEYS?.utils?.lsGet, selectedDate);
      }, [lsGet, selectedDate]);

      const metabolism = useMemo(() => {
        return getAnalyticsFn('analyzeMetabolism')({
          lsGet: lsGet || window.HEYS?.utils?.lsGet,
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          pIndex: pIndex || buildProductsIndex(lsGet || window.HEYS?.utils?.lsGet),
          selectedDate: resolvedDate
        });
      }, [lsGet, profile, pIndex, resolvedDate]);

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

      const today = HEYS.dayUtils?.todayISO?.() || new Date().toISOString().split('T')[0];
      const baseDate = selectedDate || today;
      const isFallbackDate = resolvedDate && resolvedDate !== baseDate;
      if (isFallbackDate) {
        const shortDate = resolvedDate.split('-').reverse().slice(0, 2).join('.');
        summaryParts.push(`данные за ${shortDate}`);
      }

      return h('div', { className: 'metabolism-section' },
        // Header с InfoButton
        h('div', { className: 'metabolism-section__header' },
          h('div', { className: 'metabolism-section__title' },
            h('span', { className: 'metabolism-section__icon' }, '🔥'),
            h('span', null, 'Метаболизм'),
            h(getInfoButton(), { infoKey: 'TEF' })
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
    function HealthRingsGrid({ healthScore, onCategoryClick, compact, lsGet }) {
      if (!healthScore || !healthScore.breakdown) return null;

      // 🆕 v3.22.0: Вычисляем emotionalRisk для Recovery overlay
      const emotionalRiskData = useMemo(() => {
        const U = window.HEYS?.utils;
        const getter = lsGet || U?.lsGet || ((k, d) => {
          try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
        });
        const profile = getter('heys_profile', {});
        const todayDate = new Date().toISOString().split('T')[0];
        const day = getter(`heys_dayv2_${todayDate}`, {});

        const stressAvg = day.stressAvg || 0;
        const factors = [];
        let bingeRisk = 0;

        if (stressAvg >= 6) { factors.push('Стресс'); bingeRisk += 35; }
        else if (stressAvg >= 4) { factors.push('Стресс'); bingeRisk += 15; }

        const hour = new Date().getHours();
        if (hour >= 20) bingeRisk += 20;

        const sleepDeficit = (profile.sleepHours || 8) - getDaySleepHours(day);
        if (sleepDeficit > 2) { factors.push('Недосып'); bingeRisk += 15; }

        return {
          hasRisk: bingeRisk >= 30,
          bingeRisk: Math.min(90, bingeRisk),
          factors,
          level: bingeRisk >= 60 ? 'high' : bingeRisk >= 40 ? 'medium' : 'low'
        };
      }, [lsGet]);

      const categories = [
        { key: 'nutrition', label: 'Питание', color: '#22c55e', infoKey: 'CATEGORY_NUTRITION' },
        { key: 'timing', label: 'Тайминг', color: '#3b82f6', infoKey: 'CATEGORY_TIMING' },
        { key: 'activity', label: 'Активность', color: '#f59e0b', infoKey: 'CATEGORY_ACTIVITY' },
        { key: 'recovery', label: 'Восстановление', color: '#8b5cf6', infoKey: 'CATEGORY_RECOVERY' },
        { key: 'metabolism', label: 'Метаболизм', color: '#f43f5e', infoKey: 'CATEGORY_METABOLISM' }
      ];

      // Compact mode: вертикальные мини-карточки в одну строку
      if (compact) {
        return h('div', { className: 'insights-rings-compact' },
          categories.map(cat => {
            const score = healthScore.breakdown[cat.key]?.score || 0;
            const radius = 15;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (score / 100) * circumference;

            // 🆕 emotionalRisk overlay для Recovery
            const hasEmotionalWarning = cat.key === 'recovery' && emotionalRiskData.hasRisk;

            // 🎨 Цветовая индикация "светофор" (динамический фон)
            const getScoreColor = (s) => {
              if (s >= 80) return 'excellent'; // Зеленый
              if (s >= 60) return 'good';      // Желтый
              if (s >= 40) return 'fair';      // Оранжевый
              return 'poor';                   // Красный
            };

            return h('div', {
              key: cat.key,
              className: 'insights-ring-mini-wrapper'
            },
              // Название сверху (без info-кнопки)
              h('div', { className: 'insights-ring-mini-header' },
                h('span', { className: 'insights-ring-mini-header__name' }, cat.label)
              ),
              // Карточка с кольцом + цветовая индикация
              h('div', {
                className: `insights-ring-mini insights-ring-mini--${cat.key} insights-ring-mini--${getScoreColor(score)} ${hasEmotionalWarning ? 'insights-ring-mini--warning' : ''}`,
                onClick: () => onCategoryClick && onCategoryClick(cat.key)
              },
                // Mini ring (36x36)
                h('div', { className: 'insights-ring-mini__ring' },
                  h('svg', { width: 36, height: 36, viewBox: '0 0 36 36' },
                    h('circle', {
                      cx: 18, cy: 18, r: radius,
                      fill: 'none',
                      stroke: 'rgba(0,0,0,0.06)',
                      strokeWidth: 3
                    }),
                    h('circle', {
                      cx: 18, cy: 18, r: radius,
                      fill: 'none',
                      stroke: hasEmotionalWarning ? '#f87171' : cat.color,
                      strokeWidth: 3,
                      strokeLinecap: 'round',
                      strokeDasharray: circumference,
                      strokeDashoffset: offset,
                      style: { transition: 'stroke-dashoffset 0.8s ease' }
                    })
                  ),
                  h('span', { className: 'insights-ring-mini__value' }, Math.round(score)),
                  hasEmotionalWarning && h('span', {
                    className: 'insights-ring-mini__badge',
                    title: `Эмоц. риск: ${emotionalRiskData.bingeRisk}%\n${emotionalRiskData.factors.join(', ')}`
                  }, '🧠')
                ),
                // Status (короткий эмодзи)
                h('div', { className: 'insights-ring-mini__status' },
                  hasEmotionalWarning
                    ? '⚠️'
                    : score >= 80 ? '✅' : score >= 60 ? '👍' : score >= 40 ? '➖' : '⚡'
                )
              ),
              // Info-кнопка снизу (под карточкой)
              h('div', { className: 'insights-ring-mini-footer' },
                h(getInfoButton(), { infoKey: cat.infoKey, size: 'small' })
              )
            );
          })
        );
      }

      // Full mode: стандартные кольца
      return h('div', { className: 'insights-rings' },
        categories.map(cat =>
          h(HealthRing, {
            key: cat.key,
            score: healthScore.breakdown[cat.key]?.score,
            category: cat.key,
            label: cat.label,
            color: cat.key === 'recovery' && emotionalRiskData.hasRisk ? '#f87171' : cat.color,
            onClick: onCategoryClick,
            infoKey: cat.infoKey,
            debugData: healthScore.breakdown[cat.key],
            emotionalWarning: cat.key === 'recovery' ? emotionalRiskData : null
          })
        )
      );
    }

    /**
     * Pattern Card — карточка одного паттерна (v2.0: с InfoButton)
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
        circadian: '🌅 Циркадные ритмы',
        nutrient_timing: '⏰ Тайминг нутриентов',
        insulin_sensitivity: '📉 Инсулин. чувств.',
        gut_health: '🦠 Здоровье ЖКТ',
        // v4.0: B1-B6 паттерны
        sleep_quality: '💤 Качество сна',
        wellbeing_correlation: '🌡️ Самочувствие',
        hydration: '💧 Гидратация',
        body_composition: '📐 Композиция тела',
        cycle_impact: '🔄 Влияние цикла',
        weekend_effect: '📅 Эффект выходных',
        // v4.0: C1-C6 паттерны
        nutrition_quality: '🥗 Качество питания',
        neat_activity: '🏃 NEAT-активность',
        mood_trajectory: '😊 Траектория настроения',
        // v5.0: C7-C12 паттерны
        micronutrient_radar: '🧪 Микронутриенты',
        omega_balancer: '🧈 Омега-баланс',
        heart_health: '❤️ Сердце и метаболизм',
        nova_quality: '🥫 Качество еды (NOVA)',
        training_recovery: '🏋️ Нагрузка и восстановление',
        hypertrophy: '💪 Гипертрофия',
        // v6.0: C13-C22 паттерны (Phase 1-4)
        vitamin_defense: '🛡️ Радар 11 витаминов',
        b_complex_anemia: '⚡ B-комплекс + анемия',
        glycemic_load: '🍚 Гликемическая нагрузка (GL)',
        protein_distribution: '🥩 Распределение белка',
        antioxidant_defense: '🛡️ Антиоксидантная защита',
        added_sugar_dependency: '🍬 Добавленный сахар',
        bone_health: '🦴 Здоровье костей',
        training_type_match: '🏋️ Питание под тип тренировки',
        electrolyte_homeostasis: '⚡ Электролитный баланс',
        nutrient_density: '🥗 Плотность нутриентов'
      };

      // v2.0: Маппинг pattern → SCIENCE_INFO ключ
      const patternToInfoKey = {
        // Core v2-v3 паттерны (12.02.2026 enrichment)
        meal_timing: 'MEAL_TIMING',
        wave_overlap: 'WAVE_OVERLAP',
        late_eating: 'LATE_EATING',
        meal_quality: 'MEAL_QUALITY_TREND',
        sleep_weight: 'SLEEP_WEIGHT',
        sleep_hunger: 'SLEEP_HUNGER',
        training_kcal: 'TRAINING_KCAL',
        steps_weight: 'STEPS_WEIGHT',
        protein_satiety: 'PROTEIN_SATIETY',
        fiber_regularity: 'FIBER_REGULARITY',
        stress_eating: 'STRESS_EATING',
        mood_food: 'MOOD_FOOD',
        // v2.0 extended
        circadian: 'CIRCADIAN',
        nutrient_timing: 'NUTRIENT_TIMING',
        insulin_sensitivity: 'INSULIN_SENSITIVITY',
        gut_health: 'GUT_HEALTH',
        // v4.0: B1-B6 паттерны
        sleep_quality: 'SLEEP_QUALITY',
        wellbeing_correlation: 'WELLBEING_CORRELATION',
        hydration: 'HYDRATION',
        body_composition: 'BODY_COMPOSITION',
        cycle_impact: 'CYCLE_IMPACT',
        weekend_effect: 'WEEKEND_EFFECT',
        // v4.0: C1-C6 паттерны
        nutrition_quality: 'NUTRITION_QUALITY',
        neat_activity: 'NEAT_ACTIVITY',
        mood_trajectory: 'MOOD_TRAJECTORY',
        // v5.0: C7-C12 паттерны
        micronutrient_radar: 'MICRONUTRIENT_RADAR',
        omega_balancer: 'OMEGA_BALANCER',
        heart_health: 'HEART_HEALTH',
        nova_quality: 'NOVA_QUALITY',
        training_recovery: 'TRAINING_RECOVERY',
        hypertrophy: 'HYPERTROPHY',
        // v6.0: C13-C22 паттерны (Phase 1-4)
        vitamin_defense: 'VITAMIN_DEFENSE',
        b_complex_anemia: 'B_COMPLEX_ANEMIA',
        glycemic_load: 'GLYCEMIC_LOAD',
        protein_distribution: 'PROTEIN_DISTRIBUTION',
        antioxidant_defense: 'ANTIOXIDANT_DEFENSE',
        added_sugar_dependency: 'ADDED_SUGAR_DEPENDENCY',
        bone_health: 'BONE_HEALTH',
        training_type_match: 'TRAINING_TYPE_MATCH',
        electrolyte_homeostasis: 'ELECTROLYTE_HOMEOSTASIS',
        nutrient_density: 'NUTRIENT_DENSITY'
      };

      const infoKey = patternToInfoKey[pattern.pattern];

      return h('div', { className: 'insights-pattern' },
        h('div', { className: `insights-pattern__icon insights-pattern__icon--${iconClass}` }, icon),
        h('div', { className: 'insights-pattern__content' },
          h('div', { className: 'insights-pattern__title' },
            patternLabels[pattern.pattern] || pattern.pattern
            // InfoButton removed — PatternCard is h()-factory (no hooks allowed)
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
    function ScenarioCard({ scenario }) {
      if (!scenario) return null;

      const diff = scenario.projectedScore - scenario.currentScore;
      const arrowClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';

      return h('div', { className: `insights-scenario insights-scenario--${scenario.id}` },
        h('div', { className: 'insights-scenario__icon' }, scenario.icon),
        h('div', { className: 'insights-scenario__content' },
          h('div', { className: 'insights-scenario__name' }, scenario.name),
          h('div', { className: 'insights-scenario__desc' }, scenario.description)
        ),
        h('div', { className: `insights-scenario__arrow insights-scenario__arrow--${arrowClass}` },
          scenario.currentScore, ' ', arrow, ' ', scenario.projectedScore
        )
      );
    }

    // ============================================================
    // 🧪 WHAT-IF SIMULATOR v1.0.0
    // Интерактивный симулятор: "Что если я съем X?"
    // ============================================================

    /**
     * Preset-продукты для быстрого выбора
     * Реальные нутриенты из базы или типичные значения
     */
    const WHATIF_PRESETS = [
      // Быстрые углеводы (высокий GI, короткая сытость)
      { id: 'pizza', name: 'Пицца', emoji: '🍕', kcal: 400, prot: 15, carbs: 45, fat: 18, gi: 65, category: 'fast' },
      { id: 'chocolate', name: 'Шоколад', emoji: '🍫', kcal: 250, prot: 3, carbs: 28, fat: 14, gi: 70, category: 'fast' },
      { id: 'cookie', name: 'Печенье', emoji: '🍪', kcal: 200, prot: 2, carbs: 30, fat: 8, gi: 75, category: 'fast' },
      { id: 'icecream', name: 'Мороженое', emoji: '🍨', kcal: 250, prot: 3, carbs: 30, fat: 12, gi: 62, category: 'fast' },
      { id: 'soda', name: 'Газировка 330мл', emoji: '🥤', kcal: 140, prot: 0, carbs: 35, fat: 0, gi: 90, category: 'fast' },

      // Здоровые опции (низкий GI, высокий белок/клетчатка)
      { id: 'salad', name: 'Салат', emoji: '🥗', kcal: 200, prot: 5, carbs: 15, fat: 12, gi: 25, fiber: 5, category: 'healthy' },
      { id: 'chicken', name: 'Куриная грудка', emoji: '🍗', kcal: 250, prot: 35, carbs: 0, fat: 10, gi: 0, category: 'healthy' },
      { id: 'eggs', name: 'Яйца (2 шт)', emoji: '🥚', kcal: 180, prot: 14, carbs: 1, fat: 12, gi: 0, category: 'healthy' },
      { id: 'cottage', name: 'Творог', emoji: '🧀', kcal: 180, prot: 25, carbs: 5, fat: 5, gi: 30, category: 'healthy' },
      { id: 'nuts', name: 'Орехи 50г', emoji: '🥜', kcal: 300, prot: 10, carbs: 10, fat: 28, gi: 15, fiber: 4, category: 'healthy' },

      // Комплексные приёмы
      { id: 'breakfast', name: 'Овсянка + банан', emoji: '🥣', kcal: 350, prot: 10, carbs: 55, fat: 8, gi: 55, fiber: 6, category: 'meal' },
      { id: 'lunch', name: 'Рис + курица + салат', emoji: '🍱', kcal: 500, prot: 35, carbs: 50, fat: 15, gi: 50, fiber: 5, category: 'meal' },
      { id: 'dinner', name: 'Рыба + овощи', emoji: '🐟', kcal: 400, prot: 30, carbs: 20, fat: 18, gi: 35, fiber: 8, category: 'meal' }
    ];

    /**
     * Категории preset-ов
     */
    const WHATIF_CATEGORIES = {
      fast: { name: 'Быстрые углеводы', emoji: '⚡', color: '#ef4444' },
      healthy: { name: 'Полезные опции', emoji: '💚', color: '#22c55e' },
      meal: { name: 'Полные приёмы', emoji: '🍽️', color: '#3b82f6' }
    };

    /**
     * Рассчитать эффект от еды (симуляция)
     * @param {Object} food - продукт { kcal, prot, carbs, fat, gi, fiber }
     * @param {Object} context - контекст { currentWave, currentRisk, dayTot, optimum, profile, trainings }
     * @returns {Object} результат симуляции
     */
    function simulateFood(food, context) {
      const { currentWave, currentRisk, dayTot, optimum, profile, trainings } = context;

      // 1. Расчёт новой инсулиновой волны
      const gl = ((food.gi || 50) * (food.carbs || 0)) / 100;
      const baseWaveHours = profile?.insulinWaveHours || 3;

      // Модификаторы волны (из InsulinWave module)
      let waveMultiplier = 1.0;

      // GI модификатор
      if (food.gi >= 70) waveMultiplier *= 1.2;
      else if (food.gi >= 55) waveMultiplier *= 1.1;
      else if (food.gi <= 35) waveMultiplier *= 0.85;

      // GL модификатор (плавная кривая)
      const glMult = 0.15 + (Math.min(gl, 40) / 40) ** 0.6 * 1.15;
      waveMultiplier *= Math.min(1.3, Math.max(0.2, glMult));

      // Белок удлиняет (инсулиногенный эффект)
      if (food.prot >= 30) waveMultiplier *= 1.10;
      else if (food.prot >= 20) waveMultiplier *= 1.05;

      // Клетчатка сокращает
      if (food.fiber >= 8) waveMultiplier *= 0.85;
      else if (food.fiber >= 5) waveMultiplier *= 0.92;

      // Жиры удлиняют
      if (food.fat >= 20) waveMultiplier *= 1.10;
      else if (food.fat >= 10) waveMultiplier *= 1.05;

      // Activity Context (если есть тренировка)
      let activityBonus = 0;
      if (trainings && trainings.length > 0) {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        for (const t of trainings) {
          const tMin = parseInt((t.time || '').split(':')[0]) * 60 + parseInt((t.time || '').split(':')[1] || 0);
          const gap = Math.abs(nowMin - tMin);
          if (gap <= 120) {
            activityBonus = -0.25; // POST-workout
            break;
          }
        }
      }
      waveMultiplier *= (1 + activityBonus);

      const newWaveMinutes = Math.round(baseWaveHours * 60 * waveMultiplier);
      const newWaveEndTime = new Date(Date.now() + newWaveMinutes * 60 * 1000);
      const newWaveEndStr = newWaveEndTime.toTimeString().slice(0, 5);

      // 2. Сравнение с текущей волной
      let waveImpact = 'neutral';
      let waveCompare = null;

      if (currentWave && currentWave.status !== 'lipolysis') {
        // Сейчас волна активна — добавление еды продлит её
        waveImpact = 'extends';
        waveCompare = {
          before: currentWave.remaining || 0,
          after: newWaveMinutes,
          diff: newWaveMinutes - (currentWave.remaining || 0)
        };
      } else if (currentWave && currentWave.status === 'lipolysis') {
        // Сейчас липолиз — еда прервёт его
        waveImpact = 'interrupts';
        waveCompare = {
          lipolysisLost: currentWave.lipolysisMinutes || 0,
          newWaveMinutes
        };
      }

      // 3. Расчёт влияния на риск срыва
      const newDayKcal = (dayTot?.kcal || 0) + food.kcal;
      const newRatio = optimum ? newDayKcal / optimum : 1;

      let riskDelta = 0;
      let riskReason = null;

      // Риск растёт если:
      if (food.gi >= 70) {
        riskDelta += 8; // Высокий GI → быстрый голод позже
        riskReason = 'Высокий ГИ → быстрый голод через 2-3ч';
      }
      if (newRatio > 1.1 && newRatio < 1.3) {
        riskDelta += 5; // Лёгкий перебор → психологический стресс
      } else if (newRatio >= 1.3) {
        riskDelta += 15; // Сильный перебор → стресс и "да гори оно всё"
        riskReason = 'Сильный перебор калорий → психологический срыв';
      }

      // Риск снижается если:
      if (food.prot >= 25 && food.gi <= 40) {
        riskDelta -= 10; // Белок + низкий GI = долгая сытость
        riskReason = 'Много белка + низкий ГИ → долгая сытость';
      }
      if (food.fiber >= 5) {
        riskDelta -= 5; // Клетчатка = сытость
      }

      const newRisk = Math.min(100, Math.max(0, (currentRisk || 0) + riskDelta));

      // 4. Советы на основе симуляции
      const advice = [];

      // Совет про тайминг
      if (currentWave && currentWave.status !== 'lipolysis' && currentWave.remaining >= 60) {
        advice.push({
          type: 'timing',
          icon: '⏳',
          text: `Подожди ${Math.round(currentWave.remaining / 60 * 10) / 10}ч до конца текущей волны`,
          priority: 1
        });
      }

      // Совет про замену
      if (food.gi >= 65 && food.category === 'fast') {
        const healthyAlt = WHATIF_PRESETS.find(p => p.category === 'healthy' && Math.abs(p.kcal - food.kcal) < 100);
        if (healthyAlt) {
          advice.push({
            type: 'alternative',
            icon: '💡',
            text: `Замени на ${healthyAlt.emoji} ${healthyAlt.name} — волна на ${Math.round((waveMultiplier - 0.85) / waveMultiplier * 100)}% короче`,
            priority: 2,
            altPreset: healthyAlt
          });
        }
      }

      // Совет про белок
      if (food.prot < 15 && food.kcal >= 300) {
        advice.push({
          type: 'add_protein',
          icon: '🥚',
          text: 'Добавь белок — дольше сытость',
          priority: 3
        });
      }

      // Совет про калории
      if (newRatio >= 1.3) {
        advice.push({
          type: 'warning',
          icon: '⚠️',
          text: 'Перебор калорий! Рассмотри меньшую порцию',
          priority: 0
        });
      } else if (newRatio >= 0.9 && newRatio <= 1.1) {
        advice.push({
          type: 'success',
          icon: '✅',
          text: 'Калории будут в норме',
          priority: 4
        });
      }

      // 5. Сатиация (насколько долго будет сыто)
      let satietyHours = 2; // базовая
      satietyHours += food.prot * 0.03; // +0.03ч на грамм белка
      satietyHours += (food.fiber || 0) * 0.05; // +0.05ч на грамм клетчатки
      satietyHours -= (food.gi - 50) * 0.01; // -0.01ч за каждый пункт GI выше 50
      satietyHours = Math.max(1, Math.min(6, satietyHours));

      return {
        food,
        wave: {
          minutes: newWaveMinutes,
          hours: Math.round(newWaveMinutes / 60 * 10) / 10,
          endTime: newWaveEndStr,
          impact: waveImpact,
          compare: waveCompare,
          multiplier: waveMultiplier,
          gl
        },
        risk: {
          before: currentRisk || 0,
          after: newRisk,
          delta: riskDelta,
          reason: riskReason
        },
        calories: {
          add: food.kcal,
          newTotal: newDayKcal,
          ratio: Math.round(newRatio * 100),
          optimum
        },
        satiety: {
          hours: Math.round(satietyHours * 10) / 10,
          desc: satietyHours >= 4 ? 'Долгая сытость' : satietyHours >= 2.5 ? 'Средняя сытость' : 'Быстро захочется есть'
        },
        advice: advice.sort((a, b) => a.priority - b.priority),
        verdict: newRatio <= 1.1 && riskDelta <= 0 ? 'good' : newRatio <= 1.2 && riskDelta <= 10 ? 'neutral' : 'bad'
      };
    }

    /**
     * WhatIfSimulator — главный компонент симулятора
     * @param {Object} props - { context, onClose }
     */
    function WhatIfSimulator({ context, onClose, expanded = false }) {
      const [selectedPreset, setSelectedPreset] = React.useState(null);
      const [customFood, setCustomFood] = React.useState(null);
      const [simulation, setSimulation] = React.useState(null);
      const [activeCategory, setActiveCategory] = React.useState('fast');
      const [isCustomMode, setIsCustomMode] = React.useState(false);
      const [customValues, setCustomValues] = React.useState({ kcal: 300, prot: 15, carbs: 30, fat: 10, gi: 50, name: '' });

      // Симуляция при выборе preset
      React.useEffect(() => {
        if (selectedPreset && context) {
          const result = simulateFood(selectedPreset, context);
          setSimulation(result);
        }
      }, [selectedPreset, context]);

      // Симуляция кастомной еды
      React.useEffect(() => {
        if (isCustomMode && customValues.kcal > 0 && context) {
          const food = {
            ...customValues,
            id: 'custom',
            emoji: '🍽️',
            category: 'custom'
          };
          const result = simulateFood(food, context);
          setSimulation(result);
        }
      }, [customValues, isCustomMode, context]);

      const handlePresetClick = (preset) => {
        setSelectedPreset(preset);
        setIsCustomMode(false);
      };

      const handleCustomToggle = () => {
        setIsCustomMode(!isCustomMode);
        setSelectedPreset(null);
        if (!isCustomMode) {
          setSimulation(null);
        }
      };

      const handleCustomChange = (field, value) => {
        setCustomValues(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
      };

      // Фильтрация по категории
      const filteredPresets = WHATIF_PRESETS.filter(p => p.category === activeCategory);

      return h('div', { className: `whatif-simulator ${expanded ? 'whatif-simulator--expanded' : ''}` },
        // Header
        h('div', { className: 'whatif-simulator__header' },
          h('div', { className: 'whatif-simulator__title' },
            h('span', { className: 'whatif-simulator__emoji' }, '🧪'),
            'Что если съесть?'
          ),
          h('div', { className: 'whatif-simulator__subtitle' },
            'Симуляция влияния еды на организм'
          )
        ),

        // Категории preset-ов
        h('div', { className: 'whatif-simulator__categories' },
          Object.entries(WHATIF_CATEGORIES).map(([key, cat]) =>
            h('button', {
              key,
              className: `whatif-simulator__category ${activeCategory === key ? 'whatif-simulator__category--active' : ''}`,
              onClick: () => setActiveCategory(key),
              style: activeCategory === key ? { borderColor: cat.color, color: cat.color } : {}
            },
              h('span', null, cat.emoji),
              h('span', null, cat.name)
            )
          ),
          h('button', {
            className: `whatif-simulator__category ${isCustomMode ? 'whatif-simulator__category--active' : ''}`,
            onClick: handleCustomToggle
          },
            h('span', null, '✏️'),
            h('span', null, 'Своё')
          )
        ),

        // Preset-ы или кастомный ввод
        !isCustomMode ? h('div', { className: 'whatif-simulator__presets' },
          filteredPresets.map(preset =>
            h('button', {
              key: preset.id,
              className: `whatif-preset ${selectedPreset?.id === preset.id ? 'whatif-preset--selected' : ''}`,
              onClick: () => handlePresetClick(preset)
            },
              h('span', { className: 'whatif-preset__emoji' }, preset.emoji),
              h('div', { className: 'whatif-preset__info' },
                h('div', { className: 'whatif-preset__name' }, preset.name),
                h('div', { className: 'whatif-preset__kcal' }, preset.kcal, ' ккал')
              )
            )
          )
        ) : h('div', { className: 'whatif-simulator__custom' },
          h('div', { className: 'whatif-custom__row' },
            h('label', { className: 'whatif-custom__field' },
              h('span', null, 'Ккал'),
              h('input', {
                type: 'number',
                value: customValues.kcal,
                onChange: (e) => handleCustomChange('kcal', e.target.value),
                min: 0,
                max: 2000
              })
            ),
            h('label', { className: 'whatif-custom__field' },
              h('span', null, 'Белок'),
              h('input', {
                type: 'number',
                value: customValues.prot,
                onChange: (e) => handleCustomChange('prot', e.target.value),
                min: 0,
                max: 100
              })
            )
          ),
          h('div', { className: 'whatif-custom__row' },
            h('label', { className: 'whatif-custom__field' },
              h('span', null, 'Углеводы'),
              h('input', {
                type: 'number',
                value: customValues.carbs,
                onChange: (e) => handleCustomChange('carbs', e.target.value),
                min: 0,
                max: 200
              })
            ),
            h('label', { className: 'whatif-custom__field' },
              h('span', null, 'Жиры'),
              h('input', {
                type: 'number',
                value: customValues.fat,
                onChange: (e) => handleCustomChange('fat', e.target.value),
                min: 0,
                max: 100
              })
            )
          ),
          h('div', { className: 'whatif-custom__row' },
            h('label', { className: 'whatif-custom__field whatif-custom__field--wide' },
              h('span', null, 'ГИ (0-100)'),
              h('input', {
                type: 'range',
                value: customValues.gi,
                onChange: (e) => handleCustomChange('gi', e.target.value),
                min: 0,
                max: 100
              }),
              h('span', { className: 'whatif-custom__gi-value' }, customValues.gi)
            )
          )
        ),

        // Результаты симуляции
        simulation && h('div', { className: 'whatif-simulator__results' },
          // Verdict banner
          h('div', { className: `whatif-result__verdict whatif-result__verdict--${simulation.verdict}` },
            simulation.verdict === 'good' ? '✅ Хороший выбор!' :
              simulation.verdict === 'neutral' ? '😐 Нормально' :
                '⚠️ Рискованно'
          ),

          // Metrics grid
          h('div', { className: 'whatif-result__grid' },
            // Инсулиновая волна
            h('div', { className: 'whatif-result__card' },
              h('div', { className: 'whatif-result__card-header' },
                h('span', { className: 'whatif-result__card-emoji' }, '🌊'),
                h('span', null, 'Волна')
              ),
              h('div', { className: 'whatif-result__card-value' },
                simulation.wave.hours, 'ч'
              ),
              h('div', { className: 'whatif-result__card-detail' },
                'до ', simulation.wave.endTime
              ),
              simulation.wave.impact === 'interrupts' && h('div', { className: 'whatif-result__card-warning' },
                '⚠️ Прервёт липолиз!'
              )
            ),

            // Риск срыва
            h('div', { className: 'whatif-result__card' },
              h('div', { className: 'whatif-result__card-header' },
                h('span', { className: 'whatif-result__card-emoji' }, '⚠️'),
                h('span', null, 'Риск')
              ),
              h('div', { className: `whatif-result__card-value ${simulation.risk.delta > 0 ? 'whatif-result__card-value--bad' : simulation.risk.delta < 0 ? 'whatif-result__card-value--good' : ''}` },
                simulation.risk.before, '%',
                simulation.risk.delta !== 0 && h('span', { className: 'whatif-result__delta' },
                  ' → ', simulation.risk.after, '%'
                )
              ),
              simulation.risk.delta !== 0 && h('div', { className: `whatif-result__card-detail ${simulation.risk.delta > 0 ? 'whatif-result__card-detail--bad' : 'whatif-result__card-detail--good'}` },
                simulation.risk.delta > 0 ? '+' : '', simulation.risk.delta, '%'
              )
            ),

            // Калории
            h('div', { className: 'whatif-result__card' },
              h('div', { className: 'whatif-result__card-header' },
                h('span', { className: 'whatif-result__card-emoji' }, '🔥'),
                h('span', null, 'Калории')
              ),
              h('div', { className: 'whatif-result__card-value' },
                '+', simulation.calories.add
              ),
              h('div', { className: `whatif-result__card-detail ${simulation.calories.ratio > 110 ? 'whatif-result__card-detail--bad' : simulation.calories.ratio >= 90 ? 'whatif-result__card-detail--good' : ''}` },
                simulation.calories.ratio, '% от нормы'
              )
            ),

            // Сытость
            h('div', { className: 'whatif-result__card' },
              h('div', { className: 'whatif-result__card-header' },
                h('span', { className: 'whatif-result__card-emoji' }, '😋'),
                h('span', null, 'Сытость')
              ),
              h('div', { className: 'whatif-result__card-value' },
                '~', simulation.satiety.hours, 'ч'
              ),
              h('div', { className: 'whatif-result__card-detail' },
                simulation.satiety.desc
              )
            )
          ),

          // Советы
          simulation.advice.length > 0 && h('div', { className: 'whatif-result__advice' },
            h('div', { className: 'whatif-result__advice-title' }, '💡 Советы'),
            simulation.advice.map((adv, i) =>
              h('div', {
                key: i,
                className: `whatif-result__advice-item whatif-result__advice-item--${adv.type}`,
                onClick: adv.altPreset ? () => handlePresetClick(adv.altPreset) : undefined
              },
                h('span', { className: 'whatif-result__advice-icon' }, adv.icon),
                h('span', null, adv.text)
              )
            )
          ),

          // Debug: GL и множитель
          h('div', { className: 'whatif-result__debug' },
            'GL: ', Math.round(simulation.wave.gl * 10) / 10,
            ' | Множитель: ×', Math.round(simulation.wave.multiplier * 100) / 100
          )
        ),

        // Footer с кнопкой
        expanded && onClose && h('div', { className: 'whatif-simulator__footer' },
          h('button', {
            className: 'whatif-simulator__close',
            onClick: onClose
          }, 'Закрыть')
        )
      );
    }

    /**
     * WhatIfCard — компактная карточка для вставки в Insights
     * Показывает мини-симулятор с популярными preset-ами
     */
    function WhatIfCard({ context }) {
      const [isExpanded, setIsExpanded] = React.useState(false);
      const [quickResult, setQuickResult] = React.useState(null);
      const [selectedQuick, setSelectedQuick] = React.useState(null);

      // Быстрые preset-ы для карточки
      const quickPresets = WHATIF_PRESETS.slice(0, 4);

      const handleQuickSelect = (preset) => {
        setSelectedQuick(preset);
        if (context) {
          const result = simulateFood(preset, context);
          setQuickResult(result);
        }
      };

      return h('div', { className: 'whatif-card' },
        h('div', { className: 'whatif-card__header' },
          h('div', { className: 'whatif-card__title' },
            h('span', null, '🧪'),
            ' Что если съесть?'
          ),
          h(getInfoButton(), { infoKey: 'WHATIF_SIMULATOR' }),
          h('button', {
            className: 'whatif-card__expand',
            onClick: () => setIsExpanded(true)
          }, 'Развернуть →')
        ),

        // Quick presets
        h('div', { className: 'whatif-card__quick' },
          quickPresets.map(preset =>
            h('button', {
              key: preset.id,
              className: `whatif-card__quick-btn ${selectedQuick?.id === preset.id ? 'whatif-card__quick-btn--selected' : ''}`,
              onClick: () => handleQuickSelect(preset)
            },
              h('span', null, preset.emoji),
              h('span', null, preset.kcal, ' ккал')
            )
          )
        ),

        // Quick result
        quickResult && h('div', { className: 'whatif-card__result' },
          h('div', { className: `whatif-card__verdict whatif-card__verdict--${quickResult.verdict}` },
            quickResult.verdict === 'good' ? '✅' : quickResult.verdict === 'neutral' ? '😐' : '⚠️',
            ' Волна ', quickResult.wave.hours, 'ч',
            ' | Риск ', quickResult.risk.delta > 0 ? '+' : '', quickResult.risk.delta, '%'
          ),
          quickResult.advice[0] && h('div', { className: 'whatif-card__advice' },
            quickResult.advice[0].icon, ' ', quickResult.advice[0].text
          )
        ),

        // Modal
        isExpanded && h('div', { className: 'whatif-modal-overlay', onClick: () => setIsExpanded(false) },
          h('div', { className: 'whatif-modal', onClick: (e) => e.stopPropagation() },
            h(WhatIfSimulator, {
              context,
              expanded: true,
              onClose: () => setIsExpanded(false)
            })
          )
        )
      );
    }

    /**
     * What-If Section (v2.0: с InfoButton)
     */
    function WhatIfSection({ scenarios }) {
      if (!scenarios || scenarios.length === 0) return null;

      return h('div', { className: 'insights-whatif' },
        h('div', { className: 'insights-whatif__header' },
          h('span', { className: 'insights-whatif__title' }, '🎯 Сценарии'),
          h(getInfoButton(), {
            infoKey: 'WHATIF',
            debugData: { scenariosCount: scenarios.length }
          })
        ),
        h('div', { className: 'insights-whatif__list' },
          scenarios.map((s, i) =>
            h(ScenarioCard, { key: s.id || i, scenario: s })
          )
        )
      );
    }

    /**
     * DataCompletenessCard — анализ полноты данных (v5.1.0)
     */
    function DataCompletenessCard({ days }) {
      if (!days || days.length === 0) return null;

      const analysis = React.useMemo(() => {
        const totalDays = days.length;
        const daysWithMeals = days.filter(d => d.meals && d.meals.length > 0).length;
        const daysWithWeight = days.filter(d => d.weight && d.weight > 0).length;
        const daysWithSleep = days.filter(d => getDaySleepHours(d) > 0).length;
        const daysWithSteps = days.filter(d => d.steps && d.steps > 0).length;
        const daysWithTraining = days.filter(d => d.hasTraining).length;

        return {
          totalDays,
          daysWithMeals,
          daysWithWeight,
          daysWithSleep,
          daysWithSteps,
          daysWithTraining,
          completeness: {
            meals: Math.round((daysWithMeals / totalDays) * 100),
            weight: Math.round((daysWithWeight / totalDays) * 100),
            sleep: Math.round((daysWithSleep / totalDays) * 100),
            activity: Math.round((daysWithSteps / totalDays) * 100)
          }
        };
      }, [days]);

      const { completeness } = analysis;
      const avgCompleteness = Math.round((completeness.meals + completeness.weight + completeness.sleep + completeness.activity) / 4);

      return h('div', { className: 'pi-card pi-card--low data-completeness-card' },
        h('div', { className: 'data-completeness-card__header' },
          h('h3', null, '📊 Полнота данных'),
          h('div', { className: 'data-completeness-card__score' },
            h('span', { className: `completeness-score completeness-score--${avgCompleteness >= 80 ? 'good' : avgCompleteness >= 60 ? 'medium' : 'low'}` },
              avgCompleteness, '%'
            )
          )
        ),
        h('div', { className: 'data-completeness-card__metrics' },
          [
            { key: 'meals', label: 'Приёмы пищи', value: completeness.meals, icon: '🍽️' },
            { key: 'weight', label: 'Вес', value: completeness.weight, icon: '⚖️' },
            { key: 'sleep', label: 'Сон', value: completeness.sleep, icon: '😴' },
            { key: 'activity', label: 'Активность', value: completeness.activity, icon: '👟' }
          ].map(metric =>
            h('div', { key: metric.key, className: 'completeness-metric' },
              h('div', { className: 'completeness-metric__bar-container' },
                h('div', { className: 'completeness-metric__bar-bg' }),
                h('div', {
                  className: `completeness-metric__bar completeness-metric__bar--${metric.value >= 80 ? 'good' : metric.value >= 60 ? 'medium' : 'low'}`,
                  style: { width: `${metric.value}%` }
                })
              ),
              h('div', { className: 'completeness-metric__label' },
                h('span', null, metric.icon, ' ', metric.label),
                h('span', { className: 'completeness-metric__value' }, metric.value, '%')
              )
            )
          )
        ),
        h('div', { className: 'data-completeness-card__suggestions' },
          completeness.weight < 80 && h('p', { className: 'completeness-suggestion' },
            '⚠️ Добавь вес — анализ композиции точнее на 35%'
          ),
          completeness.sleep < 70 && h('p', { className: 'completeness-suggestion' },
            '⚠️ Отмечай сон — раскроет 6 паттернов восстановления'
          ),
          completeness.meals < 90 && h('p', { className: 'completeness-suggestion' },
            '💡 Полный дневник питания = максимум инсайтов'
          )
        )
      );
    }

    // === EXPORT ===
    HEYS.InsightsPI = HEYS.InsightsPI || {};
    HEYS.InsightsPI.uiCards = {
      CollapsibleSection,
      AdvancedAnalyticsCard,
      MetabolismCard,
      MetabolismSection,
      HealthRingsGrid,
      PatternCard,
      PatternsList,
      ScenarioCard,
      WhatIfSimulator,
      WhatIfCard,
      WhatIfSection,
      DataCompletenessCard
    };

    // Backward compatibility fallback
    window.piUICards = HEYS.InsightsPI.uiCards;

    devLog('[PI UI Cards] v3.0.2 loaded —', Object.keys(HEYS.InsightsPI.uiCards).length, 'card components');
  }

  // Start initialization (will retry until React is available)
  initModule();

})(window);
