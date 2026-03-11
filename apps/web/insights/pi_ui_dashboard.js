/**
 * HEYS Predictive Insights — UI Dashboard Components Module v3.0.1
 * Extracted UI dashboard components for clean architecture
 * v3.0.1: Fixed React guard - retry mechanism instead of early return
 */

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = HEYS.dev || global.HEYS?.dev || {};
  const devLog = DEV.log ? DEV.log.bind(DEV) : () => { };
  const devWarn = DEV.warn ? DEV.warn.bind(DEV) : () => { };
  const trackError = HEYS.analytics?.trackError ? HEYS.analytics.trackError.bind(HEYS.analytics) : () => { };

  // React imports with retry mechanism for CDN loading
  function initModule() {
    const React = window.React;
    if (!React || !React.createElement) {
      // React not ready yet - retry in 50ms (CDN may still be loading)
      setTimeout(initModule, 50);
      return;
    }

    const { createElement: h, useState, useEffect, useMemo, Component, useCallback, useRef } = React;

    const piStats = HEYS.InsightsPI?.stats || window.piStats || {};
    const piAdvanced = HEYS.InsightsPI?.advanced || {};
    const piUICards = HEYS.InsightsPI?.uiCards || {};
    const piUIRings = HEYS.InsightsPI?.uiRings || {};
    const piConstants = HEYS.InsightsPI?.constants || {};
    const piUIHelpers = HEYS.InsightsPI?.uiHelpers || window.piUIHelpers || {};

    // Lazy getter для InfoButton с полной fallback цепочкой (fix load order)
    function getInfoButton() {
      if (typeof piUIHelpers.getInfoButton === 'function') {
        return piUIHelpers.getInfoButton(h);
      }
      return HEYS.InsightsPI?.uiDashboard?.InfoButton ||
        HEYS.PredictiveInsights?.components?.InfoButton ||
        HEYS.day?.InfoButton ||
        HEYS.InfoButton ||
        window.InfoButton ||
        (() => h('span', { className: 'info-btn-placeholder' }, '?'));
    }

    // Получаем UI компоненты из piUICards
    const {
      AdvancedAnalyticsCard,
      HealthRingsGrid,
      CollapsibleSection,
      MetabolismCard,
      MetabolismSection,
      PatternCard,
      PatternsList,
      ScenarioCard,
      WhatIfSimulator,
      WhatIfCard,
      WhatIfSection,
    } = piUICards;

    // Получаем Ring компоненты из piUIRings
    const { TotalHealthRing } = piUIRings;

    // Получаем константы через shared helpers (уменьшаем дублирование между модулями)
    const PRIORITY_LEVELS = typeof piUIHelpers.getPriorityLevels === 'function'
      ? piUIHelpers.getPriorityLevels(piConstants)
      : (piConstants.PRIORITY_LEVELS || {});
    const CATEGORIES = typeof piUIHelpers.getCategories === 'function'
      ? piUIHelpers.getCategories(piConstants)
      : (piConstants.CATEGORIES || {});
    const SCIENCE_INFO = piConstants.SCIENCE_INFO || {};
    const ACTIONABILITY = piConstants.ACTIONABILITY || {};
    const computeDynamicPriority = piConstants.computeDynamicPriority || ((opts) => {
      const section = piConstants.SECTIONS_CONFIG?.[opts?.sectionId];
      return section?.priority || 'INFO';
    });
    const PRIORITY_CONTEXT_LABELS = piConstants.PRIORITY_CONTEXT_LABELS || {};
    const DYNAMIC_LOG_PREFIX = 'priority /';
    const getAllMetricsByPriority = piConstants.getAllMetricsByPriority || function () {
      devWarn('[pi_ui_dashboard] getAllMetricsByPriority not available, returning empty array');
      return [];
    };

    /**
     * getMetabolismDate — fallback для показа последних доступных данных метаболизма
     * Если сегодня нет данных (0 meals/trainings/sleep), ищет последний день с данными (до 14 дней назад)
     */
    function getMetabolismDate(lsGet, selectedDate) {
      const getter = lsGet || window.HEYS?.utils?.lsGet;
      const today = HEYS.dayUtils?.todayISO?.() || new Date().toISOString().split('T')[0];
      const baseDate = selectedDate || today;
      // Fallback только для текущего дня (не для явно выбранной даты)
      const canFallback = !selectedDate || selectedDate === today;
      if (!getter || !canFallback) return baseDate;

      // Проверка, есть ли данные для метаболизма
      const hasMetabolismData = (day) => {
        if (!day || typeof day !== 'object') return false;
        if ((day.meals || []).length > 0) return true;
        if ((day.trainings || []).length > 0) return true;
        if (getDaySleepHours(day) > 0) return true;
        return false;
      };

      // Сначала проверяем базовую дату
      const baseDay = getter(`heys_dayv2_${baseDate}`, {});
      if (hasMetabolismData(baseDay)) return baseDate;

      // Fallback: ищем последний день с данными (до 14 дней назад)
      for (let i = 1; i <= 14; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const day = getter(`heys_dayv2_${dateStr}`, {});
        if (hasMetabolismData(day)) return dateStr;
      }

      return baseDate; // Если ничего не нашли, возвращаем базовую дату
    }

    function getDaySleepHours(day) {
      if (!day || typeof day !== 'object') return 0;
      const totalSleepHours = HEYS.dayUtils?.getTotalSleepHours?.(day);
      if (Number.isFinite(totalSleepHours) && totalSleepHours > 0) return totalSleepHours;
      const storedSleepHours = Number(day.sleepHours);
      if (Number.isFinite(storedSleepHours) && storedSleepHours > 0) return storedSleepHours;
      const fallbackSleepHours = HEYS.dayUtils?.sleepHours?.(day.sleepStart, day.sleepEnd);
      return Number.isFinite(fallbackSleepHours) && fallbackSleepHours > 0 ? fallbackSleepHours : 0;
    }

    function WeightPrediction({ prediction }) {
      if (!prediction || !prediction.available) return null;

      const changeClass = prediction.weeklyChange < -0.1 ? 'down'
        : prediction.weeklyChange > 0.1 ? 'up'
          : 'stable';
      const changeSign = prediction.weeklyChange > 0 ? '+' : '';

      return h('div', { className: 'insights-weight' },
        h('div', { className: 'insights-weight__header' },
          h('span', null, '⚖️ Прогноз веса')
        ),
        h('div', { className: 'insights-weight__body' },
          h('div', { className: 'insights-weight__current' },
            h('div', { className: 'insights-weight__label' }, 'Сейчас'),
            h('div', { className: 'insights-weight__value' }, prediction.currentWeight, ' кг')
          ),
          h('div', { className: 'insights-weight__arrow' },
            '→',
            h('div', { className: `insights-weight__change insights-weight__change--${changeClass}` },
              changeSign, Math.round(prediction.weeklyChange * 10) / 10, ' кг/нед'
            )
          ),
          h('div', { className: 'insights-weight__projected' },
            h('div', { className: 'insights-weight__label' }, 'Через неделю'),
            h('div', { className: 'insights-weight__value' }, prediction.projectedWeight, ' кг')
          )
        )
      );
    }

    class InsightsErrorBoundary extends Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError() {
        return { hasError: true };
      }

      componentDidCatch(error, errorInfo) {
        devWarn('[InsightsErrorBoundary] render failure:', error, errorInfo);
        trackError(error, {
          scope: 'PI UI Dashboard',
          action: 'render_boundary',
          componentStack: errorInfo?.componentStack
        });
      }

      render() {
        if (this.state.hasError) {
          return h('div', { className: 'insights-tab' },
            h('div', { className: 'insights-empty' },
              h('div', { className: 'insights-empty__icon' }, '⚠️'),
              h('div', { className: 'insights-empty__title' }, 'Не удалось отрисовать инсайты'),
              h('div', { className: 'insights-empty__subtitle' }, 'Обнови экран — данные сохранены')
            )
          );
        }

        return this.props.children;
      }
    }

    /**
     * Weekly Wrap — итоги недели (v2.0: с InfoButton)
     */
    /**
     * WeeklyWrap — итоги недели
     * v3.22.0: Интеграция Extended Analytics summary
     */
    function WeeklyWrap({ wrap, lsGet }) {
      if (!wrap) return null;

      // 🆕 v3.22.0: Extended Analytics Summary за неделю
      // NOTE: Removed useMemo — this is called via h(), not a real React component
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
        const sleepDef = (profile.sleepHours || 8) - getDaySleepHours(day);
        if (sleepDef > 2) dayRisk += 15;
        avgEmotionalRisk += dayRisk;
      }

      if (totalDays > 0) {
        avgEmotionalRisk = Math.round(avgEmotionalRisk / totalDays);
      }

      const extendedSummary = {
        proteinDeficitDays,
        highStressDays,
        trainingDays,
        avgEmotionalRisk,
        totalDays,
        hasData: totalDays >= 3
      };

      return h('div', { className: 'insights-wrap' },
        h('div', { className: 'insights-wrap__header' },
          h('span', { className: 'insights-wrap__title' }, '📋 Итоги')
        ),
        h('div', { className: 'insights-wrap__summary' },
          h('div', { className: 'insights-wrap__stat' },
            h('div', { className: 'insights-wrap__stat-value' }, wrap.daysWithData),
            h('div', { className: 'insights-wrap__stat-label' }, 'дней с данными')
          ),
          h('div', { className: 'insights-wrap__stat' },
            h('div', { className: 'insights-wrap__stat-container' },
              h('div', { className: 'insights-wrap__stat-value' }, wrap.healthScore),
              wrap.scoreChange !== 0 && h('span', {
                className: `insights-wrap__stat-change insights-wrap__stat-change--${wrap.scoreChange > 0 ? 'up' : 'down'}`,
                title: `Изменение за неделю: ${wrap.scoreChange > 0 ? '+' : ''}${wrap.scoreChange}`
              },
                wrap.scoreChange > 0 ? '📈' : '📉',
                ' ',
                wrap.scoreChange > 0 ? `+${wrap.scoreChange}` : wrap.scoreChange
              )
            ),
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

        // 🆕 v5.2.0: Scientific Week-Over-Week Analysis
        wrap.weekOverWeekStats && h('div', { className: 'insights-wrap__scientific' },
          h('div', { className: 'insights-wrap__scientific-header' },
            h('span', { className: 'insights-wrap__scientific-title' }, '📊 Научный анализ'),
            h('span', {
              className: `insights-wrap__significance-badge insights-wrap__significance-badge--${wrap.weekOverWeekStats.isSignificant ? 'sig' : 'nonsig'}`,
              title: `p-value: ${wrap.weekOverWeekStats.pValue.toFixed(3)}, t-статистика: ${wrap.weekOverWeekStats.tStat}`
            },
              wrap.weekOverWeekStats.isSignificant ? '✓ Значимо' : '— Не значимо'
            )
          ),

          h('div', { className: 'insights-wrap__scientific-grid' },
            // Change direction & magnitude
            h('div', { className: 'insights-wrap__scientific-item' },
              h('div', { className: 'insights-wrap__scientific-label' }, 'Изменение'),
              h('div', {
                className: `insights-wrap__scientific-value insights-wrap__scientific-value--${wrap.weekOverWeekStats.direction}`
              },
                wrap.weekOverWeekStats.direction === 'increase' ? '📈' : (wrap.weekOverWeekStats.direction === 'decrease' ? '📉' : '—'),
                ' ',
                wrap.weekOverWeekStats.change > 0 ? `+${wrap.weekOverWeekStats.change}` : wrap.weekOverWeekStats.change,
                ' ',
                h('span', { className: 'insights-wrap__scientific-percent' },
                  `(${wrap.weekOverWeekStats.changePercent > 0 ? '+' : ''}${wrap.weekOverWeekStats.changePercent}%)`
                )
              )
            ),

            // Effect size
            h('div', { className: 'insights-wrap__scientific-item' },
              h('div', { className: 'insights-wrap__scientific-label' }, 'Размер эффекта'),
              h('div', { className: 'insights-wrap__scientific-value' },
                `Cohen's d = ${wrap.weekOverWeekStats.effectSize}`,
                ' ',
                h('span', {
                  className: `insights-wrap__effect-badge insights-wrap__effect-badge--${wrap.weekOverWeekStats.effectSizeInterpretation}`,
                  title: 'small(<0.5) | medium(0.5-0.8) | large(≥0.8)'
                },
                  wrap.weekOverWeekStats.effectSizeInterpretation === 'large' ? '🔥' :
                    (wrap.weekOverWeekStats.effectSizeInterpretation === 'medium' ? '⚡' : '~')
                )
              )
            ),

            // Statistical power
            h('div', { className: 'insights-wrap__scientific-item' },
              h('div', { className: 'insights-wrap__scientific-label' }, 'Мощность теста'),
              h('div', { className: 'insights-wrap__scientific-value' },
                `${(wrap.weekOverWeekStats.power * 100).toFixed(0)}%`,
                ' ',
                wrap.weekOverWeekStats.power < 0.5 && h('span', {
                  className: 'insights-wrap__power-warning',
                  title: 'Низкая мощность теста - возможны ложноотрицательные результаты'
                }, '⚠️')
              )
            ),

            // p-value
            h('div', { className: 'insights-wrap__scientific-item' },
              h('div', { className: 'insights-wrap__scientific-label' }, 'p-значение'),
              h('div', { className: 'insights-wrap__scientific-value' },
                wrap.weekOverWeekStats.pValue < 0.001 ? '<0.001' : wrap.weekOverWeekStats.pValue.toFixed(3),
                ' ',
                h('a', {
                  href: 'https://en.wikipedia.org/wiki/P-value',
                  target: '_blank',
                  className: 'insights-wrap__scientific-link',
                  title: 'p < 0.05 = статистически значимо'
                }, 'ℹ️')
              )
            )
          ),

          // Confidence intervals visualization
          h('div', { className: 'insights-wrap__ci-comparison' },
            h('div', { className: 'insights-wrap__ci-title' }, 'Доверительные интервалы (95%)'),

            // Previous week CI
            h('div', { className: 'insights-wrap__ci-row' },
              h('div', { className: 'insights-wrap__ci-label' }, 'Прошлая неделя'),
              h('div', { className: 'insights-wrap__ci-bar' },
                h('div', {
                  className: 'insights-wrap__ci-range',
                  style: { width: `${Math.min(100, wrap.weekOverWeekStats.prevWeekCI.margin / 5 * 100)}%` },
                  title: `${wrap.weekOverWeekStats.prevWeekCI.lower}-${wrap.weekOverWeekStats.prevWeekCI.upper} (±${wrap.weekOverWeekStats.prevWeekCI.margin})`
                }),
                h('span', { className: 'insights-wrap__ci-value' },
                  `${wrap.weekOverWeekStats.prevWeekAvg} ± ${wrap.weekOverWeekStats.prevWeekCI.margin}`,
                  ' ',
                  h('span', { className: 'insights-wrap__ci-n' }, `(n=${wrap.weekOverWeekStats.prevWeekN})`)
                )
              )
            ),

            // Current week CI
            h('div', { className: 'insights-wrap__ci-row' },
              h('div', { className: 'insights-wrap__ci-label' }, 'Текущая неделя'),
              h('div', { className: 'insights-wrap__ci-bar' },
                h('div', {
                  className: 'insights-wrap__ci-range insights-wrap__ci-range--current',
                  style: { width: `${Math.min(100, wrap.weekOverWeekStats.currentWeekCI.margin / 5 * 100)}%` },
                  title: `${wrap.weekOverWeekStats.currentWeekCI.lower}-${wrap.weekOverWeekStats.currentWeekCI.upper} (±${wrap.weekOverWeekStats.currentWeekCI.margin})`
                }),
                h('span', { className: 'insights-wrap__ci-value' },
                  `${wrap.weekOverWeekStats.currentWeekAvg} ± ${wrap.weekOverWeekStats.currentWeekCI.margin}`,
                  ' ',
                  h('span', { className: 'insights-wrap__ci-n' }, `(n=${wrap.weekOverWeekStats.currentWeekN})`)
                )
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
     * EarlyWarningCard — компактная карточка с предупреждениями под Health Score Ring
     * 
     * Показывает summary warnings count с severity badges.
     * При клике открывает EarlyWarningPanel modal для детального просмотра.
     * 
     * @param {function} lsGet - localStorage getter (namespace-aware)
     * @param {object} profile - User profile
     * @param {object} pIndex - Product index
     */
    function EarlyWarningCard({ lsGet, profile, pIndex }) {
      const [warnings, setWarnings] = useState([]);
      const [loading, setLoading] = useState(true);
      const [panelOpen, setPanelOpen] = useState(false);

      // Load warnings on mount + day updates
      useEffect(() => {
        if (!HEYS.InsightsPI?.earlyWarning) {
          setLoading(false);
          return;
        }

        const checkWarnings = async () => {
          try {
            performance.mark('ews_card_detect_start');

            // Load 30 days of data (namespace-aware via lsGet)
            const days = [];
            const U = window.HEYS?.utils || {};
            const fmtDate = HEYS.dayUtils?.fmtDate || U.fmtDate;
            if (!fmtDate) {
              console.warn('[EarlyWarningCard] fmtDate not available');
              setLoading(false);
              return;
            }

            for (let i = 0; i < 30; i++) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const dateStr = fmtDate(d);
              const dayData = lsGet(`heys_dayv2_${dateStr}`);
              if (dayData) days.push({ ...dayData, date: dateStr });
            }

            if (days.length < 7) {
              console.info('[EarlyWarningCard] ⏸️ Insufficient data:', days.length, 'days');
              setLoading(false);
              return;
            }

            // Get current patterns (7 days) for context
            const currentInsights = HEYS.PredictiveInsights?.analyze?.({
              daysBack: 7,
              profile,
              pIndex,
              lsGet
            });

            console.info('[EarlyWarningCard] 📤 calling detect:', {
              daysCount: days.length,
              hasProfile: !!profile,
              pIndexCount: pIndex?.length || 0,
              hasCurrentPatterns: !!currentInsights?.patterns,
              patternsCount: currentInsights?.patterns ? Object.keys(currentInsights.patterns).length : 0
            });

            // Detect warnings
            const result = HEYS.InsightsPI.earlyWarning.detect(
              days,
              profile,
              pIndex,
              { currentPatterns: currentInsights?.patterns }
            );

            performance.mark('ews_card_detect_end');
            performance.measure('ews_card_detect', 'ews_card_detect_start', 'ews_card_detect_end');

            if (result.available && result.warnings) {
              setWarnings(result.warnings);

              console.info('[EarlyWarningCard] ✅ Warnings loaded:', {
                total: result.warnings.length,
                high: result.warnings.filter(w => w.severity === 'high').length,
                medium: result.warnings.filter(w => w.severity === 'medium').length,
                low: result.warnings.filter(w => w.severity === 'low').length
              });
            }

            setLoading(false);
          } catch (err) {
            console.error('[EarlyWarningCard] ❌ Detection failed:', err);
            setLoading(false);
          }
        };

        checkWarnings();
        window.addEventListener('day-updated', checkWarnings);
        window.addEventListener('heys-sync-complete', checkWarnings);

        return () => {
          window.removeEventListener('day-updated', checkWarnings);
          window.removeEventListener('heys-sync-complete', checkWarnings);
        };
      }, [lsGet, profile, pIndex]);

      // Don't show card if no module or no warnings
      if (!HEYS.InsightsPI?.earlyWarning) return null;
      if (loading) return null;
      if (warnings.length === 0) {
        // Show success state briefly
        return h('div', { className: 'early-warning-card early-warning-card--success' },
          h('div', { className: 'early-warning-card__icon' }, '✅'),
          h('div', { className: 'early-warning-card__text' }, 'Всё отлично! Нет активных предупреждений')
        );
      }

      // Group warnings by severity
      const severityCounts = {
        high: warnings.filter(w => w.severity === 'high').length,
        medium: warnings.filter(w => w.severity === 'medium').length,
        low: warnings.filter(w => w.severity === 'low').length
      };

      return h('div', null,
        // Compact warning card
        h('div', {
          className: 'early-warning-card early-warning-card--has-warnings',
          onClick: () => setPanelOpen(true)
        },
          h('div', { className: 'early-warning-card__header' },
            h('span', { className: 'early-warning-card__icon' }, '⚠️'),
            h('span', { className: 'early-warning-card__title' },
              `${warnings.length} ${warnings.length === 1 ? 'предупреждение' : warnings.length < 5 ? 'предупреждения' : 'предупреждений'}`
            )
          ),
          h('div', { className: 'early-warning-card__badges' },
            severityCounts.high > 0 && h('span', { className: 'early-warning-badge early-warning-badge--high' },
              '🚨 ', severityCounts.high
            ),
            severityCounts.medium > 0 && h('span', { className: 'early-warning-badge early-warning-badge--medium' },
              '⚠️ ', severityCounts.medium
            ),
            severityCounts.low > 0 && h('span', { className: 'early-warning-badge early-warning-badge--low' },
              'ℹ️ ', severityCounts.low
            )
          ),
          h('div', { className: 'early-warning-card__cta' },
            'Смотреть подробнее →'
          )
        ),

        // Early Warning Panel Modal
        panelOpen && HEYS.EarlyWarningPanel && h(HEYS.EarlyWarningPanel, {
          isOpen: panelOpen,
          onClose: () => setPanelOpen(false),
          warnings,
          mode: 'full'  // Insights dashboard shows comprehensive 30-day audit
        })
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
        // 🔧 v6.0.2: Динамический daysBack в зависимости от выбранного таба
        const daysBack = activeTab === 'today' ? 7 : 30;
        return HEYS.PredictiveInsights.analyze({
          daysBack,
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
                sleepHours: getDaySleepHours(today),
                sleepQuality: today.sleepQuality,
                waterMl: today.waterMl,
                stressAvg: today.stressAvg,
                householdMin: today.householdMin,
                steps: today.steps,
                profile
              }
            });
          } catch (e) {
            devWarn('[WhatIfSimulator] Failed to calculate wave:', e);
            trackError(e, { scope: 'PI UI Dashboard', action: 'calculate_wave' });
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
          } catch (e) { }
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
    function PriorityBadge({ priority, showLabel = false, size = 'normal', contextLabels = null }) {
      const config = PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.INFO;
      const label = contextLabels?.[priority] || config.name;
      const lastBadgeLogRef = useRef(null);

      useEffect(() => {
        if (typeof console === 'undefined' || !console.info || !contextLabels) return;

        const signature = `${priority || 'INFO'}|${label}|${config.color}|${size}|${showLabel ? '1' : '0'}`;
        if (lastBadgeLogRef.current === signature) return;

        lastBadgeLogRef.current = signature;
        console.info(`${DYNAMIC_LOG_PREFIX} 🏷️ badge:`, {
          priority: priority || 'INFO',
          label,
          color: config.color,
          size,
          showLabel
        });
      }, [priority, label, config.color, size, showLabel, contextLabels]);

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
        showLabel && h('span', { className: 'priority-badge__label' }, label)
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
    function CategoryFilterBar({ selectedCategory, onCategoryChange, metrics }) {
      // Подсчёт метрик в каждой категории
      const categoryCounts = useMemo(() => {
        const counts = {};
        for (const cat of Object.keys(CATEGORIES)) {
          counts[cat] = metrics?.filter(m => m.category === cat).length || 0;
        }
        return counts;
      }, [metrics]);

      return h('div', { className: 'category-filter-bar' },
        // All button
        h('button', {
          className: `category-filter-bar__btn ${!selectedCategory ? 'active' : ''}`,
          onClick: () => onCategoryChange(null)
        },
          h('span', { className: 'category-filter-bar__emoji' }, '📊'),
          h('span', { className: 'category-filter-bar__label' }, 'Все'),
          h('span', { className: 'category-filter-bar__count' }, metrics?.length || 0)
        ),

        // Category buttons
        Object.entries(CATEGORIES).map(([key, config]) => {
          const count = categoryCounts[key];
          if (count === 0) return null;

          return h('button', {
            key,
            className: `category-filter-bar__btn ${selectedCategory === key ? 'active' : ''}`,
            onClick: () => onCategoryChange(key),
            style: { '--cat-color': config.color }
          },
            h('span', { className: 'category-filter-bar__emoji' }, config.emoji),
            h('span', { className: 'category-filter-bar__label' }, config.name),
            h('span', { className: 'category-filter-bar__count' }, count)
          );
        })
      );
    }

    /**
     * PriorityFilterBar — фильтры по приоритету
     */
    function PriorityFilterBar({ selectedPriority, onPriorityChange, metrics }) {
      // Подсчёт метрик в каждом приоритете
      const priorityCounts = useMemo(() => {
        const counts = {};
        for (const pri of Object.keys(PRIORITY_LEVELS)) {
          counts[pri] = metrics?.filter(m => m.priority === pri).length || 0;
        }
        return counts;
      }, [metrics]);

      return h('div', { className: 'priority-filter-bar' },
        // All button
        h('button', {
          className: `priority-filter-bar__btn ${!selectedPriority ? 'active' : ''}`,
          onClick: () => onPriorityChange(null)
        },
          '🔮 Всё'
        ),

        // Priority buttons (только CRITICAL, HIGH, MEDIUM — остальные редко нужны как фильтр)
        ['CRITICAL', 'HIGH', 'MEDIUM'].map(key => {
          const config = PRIORITY_LEVELS[key];
          const count = priorityCounts[key];
          if (count === 0) return null;

          return h('button', {
            key,
            className: `priority-filter-bar__btn ${selectedPriority === key ? 'active' : ''}`,
            onClick: () => onPriorityChange(key),
            style: { '--pri-color': config.color }
          },
            h('span', null, config.emoji),
            h('span', null, ` ${config.name}`),
            h('span', { className: 'priority-filter-bar__count' }, count)
          );
        })
      );
    }

    /**
     * SectionHeader — заголовок секции с приоритетом
     * NOTE: This is a h()-factory (not a React component), so NO HOOKS allowed!
     * Using simple placeholder instead of InfoButton
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
          badge && h('span', { className: 'section-header__badge' }, badge)
          // infoKey removed — InfoButton has hooks, can't use in h()-factory
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

    function InsightsTab({ lsGet, profile, pIndex, optimum, selectedDate, dayData, dayTot, normAbs, waterGoal }) {
      const [activeTab, setActiveTab] = useState('today');
      const [selectedCategory, setSelectedCategory] = useState(null);
      const [priorityFilter, setPriorityFilter] = useState(null); // null = показать всё
      const [showPatternDebug, setShowPatternDebug] = useState(false); // Pattern Transparency Modal
      const [showPhenotypeClassifier, setShowPhenotypeClassifier] = useState(false); // Phenotype Classifier Panel
      const [showWhatIfScenarios, setShowWhatIfScenarios] = useState(false); // What-If Scenarios Panel
      const [ewsWarnings, setEwsWarnings] = useState([]);

      // 🎯 State для отслеживания прохождения тура (нужен для перерисовки после завершения)
      // 🔧 v1.13 FIX: Проверяем ОБА источника — scoped (HEYS.store) И unscoped (localStorage)
      const readInsightsTourCompleted = () => {
        try {
          const scopedValue = HEYS.store?.get?.('heys_insights_tour_completed');
          if (scopedValue === true || scopedValue === 'true') return true;
          if (scopedValue === false || scopedValue === 'false') return false;
          return localStorage.getItem('heys_insights_tour_completed') === 'true';
        } catch { return true; }
      };

      const [insightsTourCompleted, setInsightsTourCompleted] = useState(() => readInsightsTourCompleted());

      // Слушаем изменения localStorage для переключения из демо-режима
      useEffect(() => {
        const handleStorageChange = () => {
          try {
            // 🔧 v1.13: Проверяем оба источника
            const scopedValue = HEYS.store?.get?.('heys_insights_tour_completed');
            const unscopedValue = localStorage.getItem('heys_insights_tour_completed') === 'true';
            const completed = scopedValue === true || scopedValue === 'true' || scopedValue === false || scopedValue === 'false'
              ? scopedValue === true || scopedValue === 'true'
              : unscopedValue;
            if (completed !== insightsTourCompleted) {
              devLog('[InsightsTab] Tour status changed:', completed, '(scoped:', scopedValue, ', unscoped:', unscopedValue, ')');
              setInsightsTourCompleted(completed);
            }
          } catch { /* игнорируем */ }
        };

        // Слушаем storage event (work inside same tab thanks to dispatch in InsightsTour)
        window.addEventListener('storage', handleStorageChange);

        return () => {
          window.removeEventListener('storage', handleStorageChange);
        };
      }, [insightsTourCompleted]);

      // 🔧 Получаем недостающие данные из localStorage если они не переданы
      const effectiveData = useMemo(() => {
        const U = window.HEYS?.utils;
        const getter = lsGet || U?.lsGet || ((k, d) => {
          try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
        });

        // Получаем данные дня
        const currentDayData = dayData || getter(`heys_dayv2_${selectedDate}`, {});

        // Получаем профиль
        const currentProfile = profile || getter('heys_profile', {});

        // 🆕 Добавляем clientId в профиль (для кэша adaptive thresholds)
        if (currentProfile && !currentProfile.id) {
          const clientId = window.HEYS?.cloud?.getPinAuthClient?.();
          if (clientId) {
            currentProfile.id = clientId;
          }
        }

        // Получаем индекс продуктов
        let currentPIndex = pIndex || window.HEYS?.products?.getIndex?.();

        // Если getIndex не существует, строим индекс из массива продуктов
        if (!currentPIndex || !currentPIndex.byId) {
          const products = window.HEYS?.products?.getAll?.() || [];
          const buildIndex = window.HEYS?.dayUtils?.buildProductIndex
            || window.HEYS?.models?.buildProductIndex;
          if (buildIndex && products.length > 0) {
            currentPIndex = buildIndex(products);
          } else if (products.length > 0) {
            // Fallback: строим простой индекс вручную
            const byId = new Map();
            const byName = new Map();
            for (const p of products) {
              if (p.id) byId.set(String(p.id).toLowerCase(), p);
              if (p.name) byName.set(p.name.toLowerCase(), p);
            }
            currentPIndex = { byId, byName };
          }
        }

        // Вычисляем dayTot если не передан
        let currentDayTot = dayTot;
        if (!currentDayTot && currentDayData.meals?.length > 0 && window.HEYS?.Day?.computeDayTot) {
          currentDayTot = window.HEYS.Day.computeDayTot(currentDayData, currentPIndex);
        }

        // Вычисляем normAbs если не передан
        let currentNormAbs = normAbs;
        if (!currentNormAbs && currentProfile && window.HEYS?.Day?.calcNormAbs) {
          currentNormAbs = window.HEYS.Day.calcNormAbs(currentProfile);
        }

        // Вычисляем optimum если не передан
        const currentOptimum = optimum || currentNormAbs?.kcal || 2000;

        // Вычисляем waterGoal если не передан
        const currentWaterGoal = waterGoal || (currentProfile.weight ? currentProfile.weight * 30 : 2000);

        return {
          dayData: currentDayData,
          profile: currentProfile,
          pIndex: currentPIndex,
          dayTot: currentDayTot,
          normAbs: currentNormAbs,
          optimum: currentOptimum,
          waterGoal: currentWaterGoal
        };
      }, [dayData, profile, pIndex, dayTot, normAbs, optimum, waterGoal, selectedDate, lsGet]);

      // Анализ данных
      const realInsights = useMemo(() => {
        // 🔧 v6.0.2: Динамический daysBack в зависимости от выбранного таба
        const daysBack = activeTab === 'today' ? 7 : 30;
        const insightsDebugEnabled = (() => {
          try {
            return window.__HEYS_INSIGHTS_DEBUG === true ||
              window.localStorage?.getItem('heys_insights_debug') === '1' ||
              window.location?.search?.includes('heysInsightsDebug=1');
          } catch (_) {
            return false;
          }
        })();

        if (insightsDebugEnabled) {
          console.info('[HEYS.insights.debug] InsightsTab -> analyze() start', {
            activeTab,
            daysBack,
            hasLsGet: !!(lsGet || window.HEYS?.utils?.lsGet),
            profileId: effectiveData.profile?.id || null,
            pIndexSize: effectiveData.pIndex?.byId?.size || 0,
            optimum: effectiveData.optimum || null
          });
        }

        const analysis = HEYS.PredictiveInsights.analyze({
          lsGet: lsGet || (window.HEYS?.utils?.lsGet),
          daysBack,
          profile: effectiveData.profile,
          pIndex: effectiveData.pIndex,
          optimum: effectiveData.optimum
        });

        if (insightsDebugEnabled) {
          console.info('[HEYS.insights.debug] InsightsTab -> analyze() done', {
            available: analysis?.available,
            daysWithData: analysis?.daysWithData,
            healthScore: analysis?.healthScore?.total,
            patterns: Array.isArray(analysis?.patterns) ? analysis.patterns.length : 0
          });
        }

        return analysis;
      }, [lsGet, activeTab, selectedDate, effectiveData.profile, effectiveData.pIndex, effectiveData.optimum]);

      // 🎭 Используем демо-данные если тур не пройден И реальных данных нет
      const showDemoMode = !insightsTourCompleted && !realInsights.available;
      const insights = showDemoMode ? DEMO_INSIGHTS : realInsights;

      // 🆕 Расчёт статуса 0-100 (или демо)
      const status = useMemo(() => {
        if (showDemoMode) return DEMO_STATUS;
        if (!HEYS.Status?.calculateStatus) return null;
        return HEYS.Status.calculateStatus({
          dayData: effectiveData.dayData,
          profile: effectiveData.profile,
          dayTot: effectiveData.dayTot,
          normAbs: effectiveData.normAbs,
          waterGoal: effectiveData.waterGoal
        });
      }, [effectiveData, showDemoMode]);

      // 🆕 EWS warnings на уровне InsightsTab — для динамического priority badge
      useEffect(() => {
        let cancelled = false;

        const collectWarnings = () => {
          try {
            console.info(`${DYNAMIC_LOG_PREFIX} 🚀 start:`, { scope: 'InsightsTab', section: 'STATUS_SCORE' });

            const earlyWarning = HEYS.InsightsPI?.earlyWarning;
            const getter = lsGet || window.HEYS?.utils?.lsGet;
            const fmtDate = HEYS.dayUtils?.fmtDate || window.HEYS?.utils?.fmtDate;

            if (!earlyWarning || typeof earlyWarning.detect !== 'function' || !getter || !fmtDate) {
              if (!cancelled) setEwsWarnings([]);
              console.info(`${DYNAMIC_LOG_PREFIX} ⚠️ skipped:`, {
                reason: 'EWS module or storage utils unavailable',
                hasDetect: !!earlyWarning?.detect,
                hasGetter: !!getter,
                hasFmtDate: !!fmtDate
              });
              return;
            }

            const days = [];
            for (let i = 0; i < 30; i++) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const dateStr = fmtDate(d);
              const dayData = getter(`heys_dayv2_${dateStr}`);
              if (dayData) days.push({ ...dayData, date: dateStr });
            }

            if (days.length < 7) {
              if (!cancelled) setEwsWarnings([]);
              console.info(`${DYNAMIC_LOG_PREFIX} ⚠️ skipped:`, {
                reason: 'insufficient days for EWS',
                days: days.length
              });
              return;
            }

            const currentInsights = HEYS.PredictiveInsights?.analyze?.({
              daysBack: 7,
              profile: effectiveData.profile,
              pIndex: effectiveData.pIndex,
              lsGet: getter
            });

            const result = earlyWarning.detect(days, effectiveData.profile, effectiveData.pIndex, {
              currentPatterns: currentInsights?.patterns
            });

            const warnings = result?.available && Array.isArray(result?.warnings)
              ? result.warnings
              : [];

            if (!cancelled) setEwsWarnings(warnings);

            console.info(`${DYNAMIC_LOG_PREFIX} 📥 input:`, {
              score: insights?.healthScore?.total,
              warningsCount: warnings.length,
              highWarnings: warnings.filter(w => w.severity === 'high').length
            });
          } catch (error) {
            if (!cancelled) setEwsWarnings([]);
            console.error(`${DYNAMIC_LOG_PREFIX} ❌ failed:`, { scope: 'InsightsTab', error: error?.message || error });
          }
        };

        collectWarnings();
        const interval = setInterval(collectWarnings, 5 * 60 * 1000);
        window.addEventListener('day-updated', collectWarnings);
        window.addEventListener('heys-sync-complete', collectWarnings);

        return () => {
          cancelled = true;
          clearInterval(interval);
          window.removeEventListener('day-updated', collectWarnings);
          window.removeEventListener('heys-sync-complete', collectWarnings);
        };
      }, [lsGet, effectiveData.profile, effectiveData.pIndex, insights?.healthScore?.total]);

      // 1. Динамический приоритет для STATUS_SCORE (Метаболический статус)
      const statusSectionPriority = useMemo(() => {
        const score = insights?.healthScore?.total;
        const trend = insights?.healthScore?.trend7d ?? insights?.healthScore?.trend ?? null;
        return computeDynamicPriority({
          sectionId: 'STATUS_SCORE',
          score,
          trend,
          warnings: ewsWarnings,
          patterns: insights?.patterns ?? [] // #12 pattern degradation boost
        });
      }, [computeDynamicPriority, insights?.healthScore?.total, insights?.healthScore?.trend7d, insights?.healthScore?.trend, ewsWarnings, insights?.patterns]);

      // 2. Динамический приоритет для CRASH_RISK (Риск срыва)
      const crashRiskPriority = useMemo(() => {
        // Получаем сырой % риска из тех же метрик, что считает MetabolicQuickStatus
        // (упрощенная копия логики, так как сам компонент недоступен здесь)
        // Но лучше передать warnings релевантных типов!

        // Временное решение: считаем по warnings, так как crashRiskScore ещё не прокинут в props
        // TODO: Прокинуть crashRiskScore из родителя

        return computeDynamicPriority({
          sectionId: 'CRASH_RISK',
          crashRiskScore: null, // Пока нет данных, сработает fallback на warnings
          warnings: ewsWarnings
        });
      }, [computeDynamicPriority, ewsWarnings]);

      // 3. Динамический приоритет для PRIORITY_ACTIONS (Важные шаги)
      const actionsPriority = useMemo(() => {
        // Считаем количество High/Critical warnings
        const urgentCount = ewsWarnings ? ewsWarnings.filter(w => w.severity === 'high').length : 0;
        const totalCount = ewsWarnings ? ewsWarnings.length : 0;

        return computeDynamicPriority({
          sectionId: 'PRIORITY_ACTIONS',
          urgentActionsCount: urgentCount,
          actionsCount: totalCount
        });
      }, [computeDynamicPriority, ewsWarnings]);


      useEffect(() => {
        const urgentCount = ewsWarnings ? ewsWarnings.filter(w => w.severity === 'high').length : 0;
        console.info(`${DYNAMIC_LOG_PREFIX} 🖥️ sections_priority:`, {
          STATUS_SCORE: `${statusSectionPriority}  → "${PRIORITY_CONTEXT_LABELS?.STATUS_SCORE?.[statusSectionPriority] ?? ''}"`,
          CRASH_RISK: `${crashRiskPriority}  → "${PRIORITY_CONTEXT_LABELS?.CRASH_RISK?.[crashRiskPriority] ?? ''}"`,
          PRIORITY_ACTIONS: `${actionsPriority}  → "${PRIORITY_CONTEXT_LABELS?.PRIORITY_ACTIONS?.[actionsPriority] ?? ''}"`,
          filter: priorityFilter || 'ALL',
          ewsWarnings: ewsWarnings?.length ?? 0,
          urgentWarnings: urgentCount,
        });
      }, [statusSectionPriority, crashRiskPriority, actionsPriority, priorityFilter, ewsWarnings]);

      // Получить все метрики для фильтров
      const allMetrics = useMemo(() => getAllMetricsByPriority(), []);

      // 🎯 Автозапуск мини-тура при первом посещении Insights
      useEffect(() => {
        // Даём время на рендер секций перед запуском тура
        const timer = setTimeout(() => {
          if (HEYS.InsightsTour?.shouldShow?.() && HEYS.InsightsTour.start) {
            HEYS.InsightsTour.start();
          }
        }, 800);
        return () => clearTimeout(timer);
      }, []); // Только при первом монтировании

      // EmptyState если мало данных И тур уже пройден
      if (!insights.available && insightsTourCompleted) {
        return h(InsightsErrorBoundary, null,
          h('div', { className: 'insights-tab' },
            h('div', { className: 'insights-tab__hero' },
              h('div', { className: 'insights-tab__header' },
                h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика')
              )
            ),
            h('div', { className: 'insights-tab__content' },
              h(EmptyState, {
                daysAnalyzed: realInsights.daysAnalyzed || realInsights.daysWithData || 0,
                minRequired: realInsights.minDaysRequired || 3
              })
            )
          )
        );
      }

      // Определяем какие секции показывать на основе фильтров
      const shouldShowSection = (sectionPriority) => {
        if (!priorityFilter) return true;
        return sectionPriority === priorityFilter;
      };

      return h(InsightsErrorBoundary, null,
        h('div', { className: 'insights-tab' },
          // === HERO HEADER ===
          h('div', { className: 'insights-tab__hero' },
            h('div', { className: 'insights-tab__header' },
              h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика'),
              h('div', { className: 'insights-tab__subtitle' },
                activeTab === 'today'
                  ? `Анализ за ${insights.daysAnalyzed || 7} дней`
                  : `Глубокий анализ за ${insights.daysAnalyzed || 30} дней`
              )
            ),

            // Glass Tabs внутри hero
            h('div', { className: 'insights-tab__tabs' },
              h('button', {
                className: 'insights-tab__tab' + (activeTab === 'today' ? ' active' : ''),
                onClick: () => setActiveTab('today')
              }, '📅 7 дней'),
              h('button', {
                className: 'insights-tab__tab' + (activeTab === 'week' ? ' active' : ''),
                onClick: () => setActiveTab('week')
              }, '📊 30 дней')
            ),

            // 🎯 Demo Mode Banner — показываем только в демо режиме
            showDemoMode && h('div', {
              className: 'insights-tab__demo-banner'
            },
              h('span', { className: 'insights-tab__demo-banner-icon' }, '✨'),
              h('div', null,
                h('div', { className: 'insights-tab__demo-banner-title' },
                  'Демо-режим аналитики'
                ),
                h('div', { className: 'insights-tab__demo-banner-desc' },
                  'Это пример данных. После 3 дней использования появится ваша реальная статистика'
                )
              )
            ),

            // Priority Filter (compact)
            h('div', { className: 'insights-tab__filters' },
              h('button', {
                className: `insights-tab__filter-btn ${!priorityFilter ? 'active' : ''}`,
                onClick: () => setPriorityFilter(null)
              }, '🎯 Всё'),
              h('button', {
                className: `insights-tab__filter-btn ${priorityFilter === 'CRITICAL' ? 'active' : ''}`,
                onClick: () => setPriorityFilter(priorityFilter === 'CRITICAL' ? null : 'CRITICAL'),
                style: { '--filter-color': PRIORITY_LEVELS.CRITICAL.color }
              }, '🔴 Важное'),
              h('button', {
                className: `insights-tab__filter-btn ${priorityFilter === 'HIGH' ? 'active' : ''}`,
                onClick: () => setPriorityFilter(priorityFilter === 'HIGH' ? null : 'HIGH'),
                style: { '--filter-color': PRIORITY_LEVELS.HIGH.color }
              }, '🟠 Полезное')
            )
          ),

          // === MAIN CONTENT (отсортировано по приоритету) ===
          h('div', { className: 'insights-tab__content' },

            // L0: Status 0-100 Card (dynamic priority)
            shouldShowSection(statusSectionPriority) && h('div', {
              className: `insights-tab__section insights-tab__section--${statusSectionPriority.toLowerCase()}`,
              id: 'tour-insights-status' // 🎯 Mini-tour target
            },
              h('div', { className: 'insights-tab__section-badge' },
                h(PriorityBadge, {
                  priority: statusSectionPriority,
                  showLabel: true,
                  contextLabels: PRIORITY_CONTEXT_LABELS.STATUS_SCORE
                })
              ),

            // 🆕 StatusCard вместо TotalHealthRing + HealthRingsGrid
            /* status && HEYS.Status?.StatusCard
              ? h(HEYS.Status.StatusCard, { status })
              : */ h('div', { className: 'insights-tab__score-card' },
                h('div', { className: 'insights-tab__score' },
                  h(TotalHealthRing, {
                    score: insights.healthScore.total,
                    size: 140,
                    strokeWidth: 12,
                    debugData: insights.healthScore.debug || {
                      mode: insights.healthScore.mode,
                      weights: insights.healthScore.weights,
                      breakdown: insights.healthScore.breakdown
                    },
                    onClick: () => {
                      // 🆕 v3.5.0: Early Warning System Check при клике на Health Score
                      console.group('🚨 [HEYS Early Warning System] HEALTH SCORE CLICK');
                      try {
                        const earlyWarning = HEYS.InsightsPI?.earlyWarning;
                        if (earlyWarning && typeof earlyWarning.detect === 'function') {
                          const U = window.HEYS?.dayUtils || window.HEYS?.utils;
                          if (!U || !U.fmtDate || !U.lsGet) {
                            console.error('❌ HEYS.dayUtils not available for Early Warning');
                            console.groupEnd();
                            return;
                          }

                          // Функция для получения даты со смещением
                          const dateOffsetStr = (offset) => {
                            const d = new Date();
                            d.setDate(d.getDate() + offset);
                            return U.fmtDate(d);
                          };

                          // Собираем последние 30 дней через правильный lsGet (учитывает namespace)
                          const daysBack = 30;
                          const days = [];
                          for (let i = 0; i < daysBack; i++) {
                            const date = dateOffsetStr(-i);
                            const dayKey = `heys_dayv2_${date}`;
                            const dayData = U.lsGet(dayKey);
                            if (dayData) days.push({ ...dayData, date });
                          }

                          // Используем effectiveData для profile и pIndex (как в остальном коде)
                          const profile = effectiveData.profile;
                          const pIndex = effectiveData.pIndex;

                          console.log('🔍 Running Early Warning detection:', {
                            daysAvailable: days.length,
                            datesRange: days.length > 0 ? `${days[days.length - 1].date} → ${days[0].date}` : 'none',
                            hasProfile: !!profile,
                            profileId: profile?.id,
                            hasPIndex: !!pIndex,
                            pIndexSize: pIndex?.byId?.size || 0
                          });

                          // Get current patterns for warning detection
                          let currentPatterns = null;
                          let previousPatterns = null;

                          if (days.length >= 7 && HEYS.PredictiveInsights?.analyze) {
                            try {
                              // Get insights for last 7 days (current period)
                              const currentInsights = HEYS.PredictiveInsights.analyze({
                                daysBack: 7,
                                profile,
                                pIndex,
                                lsGet: U.lsGet
                              });
                              currentPatterns = currentInsights?.patterns || null;

                              // For health score decline detection, we'd need patterns from 2 different periods
                              // For now, focus on current low pattern scores (more actionable)
                              // TODO: Implement time-based pattern comparison when we have historical pattern data

                              console.log('ews / dashboard 📊 pattern data collected:', {
                                currentPatternsCount: currentPatterns ? currentPatterns.length : 0,
                                period: '7 days',
                                hasHealthScore: !!currentInsights?.healthScore
                              });
                            } catch (e) {
                              console.warn('ews / dashboard ⚠️ failed to get pattern data:', e.message);
                            }
                          }

                          const result = earlyWarning.detect(days, profile, pIndex, {
                            currentPatterns,
                            previousPatterns
                          });

                          console.log('✅ Early Warning result:', {
                            available: result.available,
                            warningCount: result.warnings?.length || 0,
                            highSeverity: result.warnings?.filter(w => w.severity === 'high').length || 0,
                            mediumSeverity: result.warnings?.filter(w => w.severity === 'medium').length || 0,
                            lowSeverity: result.warnings?.filter(w => w.severity === 'low').length || 0,
                            warnings: result.warnings
                          });

                          if (result.warnings && result.warnings.length > 0) {
                            console.log('⚠️ Detected warnings:');
                            result.warnings.forEach((w, i) => {
                              console.log(`  ${i + 1}. [${w.severity.toUpperCase()}] ${w.message}`);
                              console.log(`     ${w.detail}`);
                              if (w.action) console.log(`     → Action: ${w.action}`);
                            });
                          } else {
                            console.log('✅ No warnings detected - all metrics healthy!');
                          }
                        } else {
                          console.warn('⚠️ Early Warning module not loaded or not available');
                        }
                      } catch (err) {
                        console.error('❌ Early Warning detection error:', err);
                      }
                      console.groupEnd();

                      // 🔬 Автоматическая диагностика перед открытием модала
                      console.group('🩺 [HEYS Adaptive Thresholds] AUTO DIAGNOSTIC');

                      try {
                        // Проверка доступности HEYS.dayUtils
                        const U = HEYS.dayUtils || window.HEYS?.dayUtils;
                        if (!U || !U.fmtDate || !U.lsGet) {
                          console.error('❌ HEYS.dayUtils or required methods not available:', {
                            hasU: !!U,
                            hasFmtDate: !!U?.fmtDate,
                            hasLsGet: !!U?.lsGet
                          });
                          console.groupEnd();
                          setShowPatternDebug(true);
                          return;
                        }

                        // Функция для получения даты со смещением
                        const dateOffsetStr = (offset) => {
                          const d = new Date();
                          d.setDate(d.getDate() + offset);
                          return U.fmtDate(d);
                        };

                        // 1. Проверка данных дней
                        const daysBack = 7;
                        const days = [];
                        for (let i = 0; i < daysBack; i++) {
                          const date = dateOffsetStr(-i);
                          const dayKey = `heys_dayv2_${date}`;
                          const dayData = U.lsGet(dayKey);
                          if (dayData) days.push({ ...dayData, date });
                        }
                        console.log('📅 Days collected:', {
                          requested: daysBack,
                          found: days.length,
                          dates: days.map(d => d.date),
                          firstDay: days[0]
                        });

                        // 2. Проверка profile (используем effectiveData, а не HEYS.c)
                        const profile = effectiveData.profile;
                        const clientId = HEYS.cloud?.getPinAuthClient?.();
                        console.log('👤 Profile:', {
                          exists: !!profile,
                          id: profile?.id,
                          clientId: clientId,
                          weight: profile?.weight,
                          goal: profile?.goal,
                          allKeys: profile ? Object.keys(profile) : []
                        });

                        // 3. Проверка pIndex (используем effectiveData)
                        const pIndex = effectiveData.pIndex;
                        console.log('🗂️ Product Index:', {
                          exists: !!pIndex,
                          byIdSize: pIndex?.byId?.size || 0,
                          byNameSize: pIndex?.byName?.size || 0,
                          sampleIds: pIndex?.byId ? Array.from(pIndex.byId.keys()).slice(0, 3) : []
                        });

                        // 4. Проверка модуля thresholds
                        const hasThresholdsModule = typeof HEYS.InsightsPI?.thresholds?.get === 'function';
                        console.log('🧩 Thresholds Module:', {
                          loaded: hasThresholdsModule,
                          methods: HEYS.InsightsPI?.thresholds ? Object.keys(HEYS.InsightsPI.thresholds) : []
                        });

                        // 5. Автоматический вызов get (cascade strategy)
                        if (hasThresholdsModule) {
                          console.log('🔬 Calling thresholds.get() with cascade strategy...');
                          const result = HEYS.InsightsPI.thresholds.get(days, profile, pIndex);
                          console.log('✅ Thresholds result:', {
                            confidence: result.confidence,
                            daysUsed: result.daysUsed,
                            requestedDays: days.length,
                            thresholdsCount: Object.keys(result.thresholds || {}).length,
                            thresholds: result.thresholds,
                            meta: result.meta,
                            tier: result.meta?.partial ? 'PARTIAL (7-13d)' :
                              result.meta?.default ? 'DEFAULT (<7d)' :
                                result.confidence >= 1.0 ? 'FULL (14+d)' : 'UNKNOWN',
                            fromCache: result.meta?.dateRange ? '♻️ (possibly from cache)' : '✨ (freshly computed)'
                          });
                        } else {
                          console.warn('⚠️ Thresholds module not loaded');
                        }

                        // 6. Проверка что Pattern Debugger получит
                        console.log('🪟 Pattern Debugger will receive:', {
                          profile: !!profile,
                          profileId: profile?.id,
                          clientId: clientId,
                          lsGet: typeof U?.lsGet,
                          pIndex: !!pIndex,
                          dayUtils: !!HEYS.dayUtils,
                          fmtDate: typeof HEYS.dayUtils?.fmtDate
                        });

                      } catch (err) {
                        console.error('❌ Diagnostic error:', err);
                      }

                      console.groupEnd();

                      // Открыть модал
                      setShowPatternDebug(true);
                    } // 🔍 Открыть Pattern Transparency Modal с диагностикой
                  })
                ),
                h('div', { className: 'insights-tab__rings' },
                  h(HealthRingsGrid, {
                    healthScore: insights.healthScore,
                    onCategoryClick: setSelectedCategory,
                    compact: true
                  })
                )
              ),

              // Early Warning Card (под скором и кольцами)
              h(EarlyWarningCard, { lsGet, profile, pIndex }),

              // Phenotype Classifier Card
              HEYS.InsightsPI?.PhenotypeClassifierCard && h(HEYS.InsightsPI.PhenotypeClassifierCard, {
                onClick: () => setShowPhenotypeClassifier(true)
              }),

              // What-If Scenarios Card
              HEYS.InsightsPI?.WhatIfScenariosCard && h(HEYS.InsightsPI.WhatIfScenariosCard, {
                onClick: () => setShowWhatIfScenarios(true)
              })
            ),

            // Metabolic Status + Risk (CRITICAL) — собственный заголовок внутри
            shouldShowSection('CRITICAL') && h('div', {
              className: 'insights-tab__section insights-tab__section--critical insights-tab__section--no-header',
              id: 'tour-insights-metabolic' // 🎯 Mini-tour target
            },
              h(MetabolicQuickStatus, {
                lsGet,
                profile,
                pIndex,
                selectedDate
              })
            ),

            // Divider между критическими и важными
            shouldShowSection('CRITICAL') && h('div', { className: 'insights-tab__divider insights-tab__divider--priority' },
              h('span', null, '↓ Важные инсайты ↓')
            ),

            // ═══════════════════════════════════════════════════════════
            // 🟠 ВЫСОКИЙ ПРИОРИТЕТ — Важно для результата
            // ═══════════════════════════════════════════════════════════

            // Predictive Dashboard (HIGH) — собственный заголовок внутри
            shouldShowSection('HIGH') && h('div', {
              className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
              id: 'tour-insights-prediction' // 🎯 Mini-tour target
            },
              h(PredictiveDashboard, {
                lsGet,
                profile,
                selectedDate
              })
            ),

            // Phenotype Card (HIGH) — отдельная expandable карточка
            // В демо-режиме показываем placeholder если компонент ещё не загружен
            shouldShowSection('HIGH') && h('div', {
              className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
              id: 'tour-insights-phenotype' // 🎯 Mini-tour target
            },
              HEYS.Phenotype?.PhenotypeExpandableCard
                ? h(HEYS.Phenotype.PhenotypeExpandableCard, { profile })
                : showDemoMode && h('div', {
                  className: 'insights-card insights-tab__phenotype-placeholder'
                },
                  h('div', { className: 'insights-tab__phenotype-placeholder-header' },
                    h('span', { className: 'insights-tab__phenotype-placeholder-icon' }, '🧬'),
                    h('span', { className: 'insights-tab__phenotype-placeholder-title' }, 'Метаболический фенотип')
                  ),
                  h('div', { className: 'insights-tab__phenotype-placeholder-text' },
                    'После анализа ваших данных за 7+ дней система определит ваш метаболический тип и даст персональные рекомендации.'
                  )
                )
            ),

            // Advanced Analytics (HIGH) — собственный заголовок внутри
            shouldShowSection('HIGH') && h('div', {
              className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
              id: 'tour-insights-analytics' // 🎯 Mini-tour target
            },
              h(AdvancedAnalyticsCard, {
                lsGet,
                profile,
                pIndex,
                selectedDate
              })
            ),

            // Metabolism Section (HIGH) — собственный заголовок внутри
            shouldShowSection('HIGH') && h('div', {
              className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
              id: 'tour-insights-metabolism' // 🎯 Mini-tour target
            },
              h(MetabolismSection, {
                lsGet,
                profile,
                pIndex,
                selectedDate
              })
            ),

            // Meal Timing (HIGH) — собственный заголовок внутри
            shouldShowSection('HIGH') && h('div', {
              className: 'insights-tab__section insights-tab__section--high insights-tab__section--no-header',
              id: 'tour-insights-timing' // 🎯 Mini-tour target
            },
              h(MealTimingCard, {
                lsGet,
                profile,
                pIndex,
                selectedDate
              })
            ),

            // Divider между важными и средними
            (shouldShowSection('HIGH') || shouldShowSection('CRITICAL')) && shouldShowSection('MEDIUM') &&
            h('div', { className: 'insights-tab__divider insights-tab__divider--priority' },
              h('span', null, '↓ Дополнительно ↓')
            ),

            // ═══════════════════════════════════════════════════════════
            // 🟡 СРЕДНИЙ ПРИОРИТЕТ — Полезный контекст
            // ═══════════════════════════════════════════════════════════

            // What-If (MEDIUM)
            shouldShowSection('MEDIUM') && h(CollapsibleSection, {
              title: 'Что если...',
              icon: '🎯',
              badge: insights.whatIf?.length > 0 ? `${insights.whatIf.length} сценариев` : null,
              defaultOpen: true,
              infoKey: 'WHATIF',
              priority: 'MEDIUM'
            },
              h(WhatIfSection, { scenarios: insights.whatIf })
            ),

            // Patterns (MEDIUM)
            shouldShowSection('MEDIUM') && insights.patterns?.length > 0 && h(CollapsibleSection, {
              title: 'Паттерны',
              icon: '🔍',
              badge: `${insights.patterns.filter(p => p.available).length} найдено`,
              defaultOpen: false,
              infoKey: 'PATTERNS',
              priority: 'MEDIUM'
            },
              h(PatternsList, { patterns: insights.patterns })
            ),

            // Weight Prediction (MEDIUM)
            shouldShowSection('MEDIUM') && insights.weightPrediction && h(CollapsibleSection, {
              title: 'Прогноз веса',
              icon: '⚖️',
              badge: insights.weightPrediction.weeklyChange ?
                `${insights.weightPrediction.weeklyChange > 0 ? '+' : ''}${insights.weightPrediction.weeklyChange.toFixed(1)} кг/нед` : null,
              defaultOpen: false,
              infoKey: 'WEIGHT_PREDICTION',
              priority: 'MEDIUM'
            },
              h(WeightPrediction, { prediction: insights.weightPrediction })
            ),

            // ═══════════════════════════════════════════════════════════
            // 🟢 НИЗКИЙ ПРИОРИТЕТ — Дополнительная информация
            // ═══════════════════════════════════════════════════════════

            // Weekly Report Card (LOW — только на вкладке "Неделя")
            shouldShowSection('LOW') && activeTab === 'week' && HEYS.weeklyReports?.WeeklyReportCard && h('div', {
              className: 'insights-tab__section insights-tab__section--low'
            },
              h(HEYS.weeklyReports.WeeklyReportCard, {
                lsGet,
                profile,
                pIndex,
                anchorDate: selectedDate
              })
            ),

            // Weekly Wrap (LOW — только на вкладке "Неделя")
            shouldShowSection('LOW') && activeTab === 'week' && insights.weeklyWrap && h(CollapsibleSection, {
              title: 'Итоги недели',
              icon: '📋',
              defaultOpen: true,
              infoKey: 'WEEKLY_WRAP',
              priority: 'LOW'
            },
              h(WeeklyWrap, { wrap: insights.weeklyWrap })
            ),

            // Data Completeness (LOW)
            shouldShowSection('LOW') && h('div', { className: 'insights-tab__section insights-tab__section--low' },
              h(SectionHeader, {
                title: 'Полнота данных',
                icon: '📊',
                priority: 'LOW',
                infoKey: 'DATA_COMPLETENESS'
              }),
              h(DataCompletenessCard, { lsGet, profile })
            ),

            // ═══════════════════════════════════════════════════════════
            // 🔵 FOOTER — Информационные метрики
            // ═══════════════════════════════════════════════════════════

            // Footer: Confidence
            h('div', { className: 'insights-tab__confidence' },
              h('span', { className: 'insights-tab__confidence-icon' }, '📊'),
              h('span', { className: 'insights-tab__confidence-text' },
                `Уверенность: ${insights.confidence || 50}% (${insights.daysWithData || 0} дней данных)`
              ),
              h(getInfoButton(), {
                infoKey: 'CONFIDENCE',
                debugData: {
                  confidence: insights.confidence,
                  daysWithData: insights.daysWithData,
                  daysAnalyzed: insights.daysAnalyzed
                }
              })
            )

          ) // закрытие insights-tab__content
          ,

          // Pattern Debug Modal — показывается при клике на Health Score
          showPatternDebug && window.PatternDebugModal && h(window.PatternDebugModal, {
            lsGet: lsGet || (window.HEYS?.utils?.lsGet),
            profile: effectiveData.profile,
            pIndex: effectiveData.pIndex,
            optimum: effectiveData.optimum,
            onClose: () => setShowPatternDebug(false)
          }),

          // What-If Scenarios Panel
          showWhatIfScenarios && HEYS.InsightsPI?.WhatIfScenariosPanel && h(HEYS.InsightsPI.WhatIfScenariosPanel, {
            lsGet: lsGet || (window.HEYS?.utils?.lsGet),
            profile: effectiveData.profile,
            pIndex: effectiveData.pIndex,
            onClose: () => setShowWhatIfScenarios(false)
          }),

          // Phenotype Classifier Panel
          showPhenotypeClassifier && HEYS.InsightsPI?.PhenotypeClassifierPanel && h(HEYS.InsightsPI.PhenotypeClassifierPanel, {
            profile: effectiveData.profile,
            pIndex: effectiveData.pIndex,
            onClose: () => setShowPhenotypeClassifier(false)
          })

        )
      );
    }

    // === INFO BUTTON — Кнопка ? с объяснением формулы ===

    /**
     * InfoButton — маленькая кнопка (?) рядом с метрикой
     * @param {string} infoKey — ключ из SCIENCE_INFO
     * @param {Object} debugData — дополнительные данные для отладки (опционально)
     * @param {string} size — 'small' для маленькой кнопки (в кольцах)
     */
    function InfoButton({ infoKey, debugData, size }) {
      const [isOpen, setIsOpen] = useState(false);
      const [isDetailsOpen, setIsDetailsOpen] = useState(true);
      const [isFormulaOpen, setIsFormulaOpen] = useState(true);
      const [isSourcesOpen, setIsSourcesOpen] = useState(true);

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

      const categoryFallbackSources = {
        METABOLISM: [
          { label: 'Hall et al., 2012 — Energy balance and body weight dynamics', pmid: '22522362' }
        ],
        NUTRITION: [
          { label: 'WHO Healthy Diet guidance', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' }
        ],
        TIMING: [
          { label: 'Sutton et al., 2018 — Early Time-Restricted Feeding', pmid: '29754952' }
        ],
        RECOVERY: [
          { label: 'Walker, 2017 — Why We Sleep (overview)', url: 'https://www.sleepdiplomat.com/' }
        ],
        RISK: [
          { label: 'Marlatt & Gordon — Relapse prevention framework', url: 'https://psycnet.apa.org/record/1986-97729-000' }
        ],
        PREDICTION: [
          { label: 'Hyndman & Athanasopoulos — Forecasting principles', url: 'https://otexts.com/fpp3/' }
        ],
        PATTERNS: [
          { label: 'Zeevi et al., 2015 — Personalized nutrition by glycemic response', pmid: '26590418' }
        ],
        COMPOSITE: [
          { label: 'NASEM framework — integrated health behavior indicators', url: 'https://nap.nationalacademies.org/' }
        ],
        STATISTICS: [
          { label: 'Pearson correlation basics (NIST)', url: 'https://www.itl.nist.gov/div898/handbook/' }
        ]
      };

      const rawSources = Array.isArray(info.sources)
        ? info.sources
        : (info.source ? [{ label: info.source, pmid: info.pmid, url: info.url }] : []);

      const sources = rawSources.length > 0
        ? rawSources
        : (categoryFallbackSources[info.category] || categoryFallbackSources.STATISTICS || []);

      const simplifyText = (text) => {
        if (!text || typeof text !== 'string') return '';
        return text
          .replace(/\s+/g, ' ')
          .replace(/[;]+/g, ', ')
          .replace(/инсулинорезистентност[ьи]/gi, 'снижения чувствительности к инсулину')
          .replace(/кардиометаболическ[а-я]+/gi, 'сердечно-метаболических')
          .replace(/ультра[-\s]?переработанн[а-я]+/gi, 'сильно переработанные')
          .replace(/липолиз/gi, 'сжигание жира')
          .replace(/прокси/gi, 'косвенная оценка')
          .replace(/HbA1c/gi, 'долгосрочный сахар крови (HbA1c)')
          .replace(/LDL/gi, '«плохой» холестерин (LDL)')
          .replace(/HDL/gi, '«хороший» холестерин (HDL)')
          .replace(/TEF/gi, 'термический эффект пищи (TEF)')
          .replace(/\s+,/g, ',')
          .replace(/\s+\./g, '.')
          .trim();
      };

      const splitSentences = (text) => simplifyText(text)
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);

      const simplifyDetailedText = (text) => {
        if (!text || typeof text !== 'string') return '';
        return text
          .split(/\n+/)
          .map((line) => simplifyText(line))
          .filter(Boolean)
          .join('\n\n');
      };

      const capSentence = (sentence, maxLen = 170) => {
        if (!sentence) return '';
        if (sentence.length <= maxLen) return sentence;
        const sliced = sentence.slice(0, maxLen);
        const cutAt = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf(', '), sliced.lastIndexOf(' '));
        const base = cutAt > 60 ? sliced.slice(0, cutAt) : sliced;
        return `${base.trim()}…`;
      };

      const buildShortSummary = (meta) => {
        if (meta.short && typeof meta.short === 'string' && meta.short.trim()) {
          return capSentence(simplifyText(meta.short.trim()), 190);
        }

        const candidatePool = [meta.whyImportant, meta.interpretation, meta.formula]
          .flatMap(splitSentences)
          .filter(s => !/[=/*^]|>=|<=|\+\d+%|\b[A-Z]{3,}\b/.test(s))
          .map(s => capSentence(s))
          .filter(s => s.length >= 28);

        const unique = [];
        const seen = new Set();
        for (const sentence of candidatePool) {
          const key = sentence.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(sentence);
          if (unique.length >= 2) break;
        }

        if (unique.length > 0) {
          const summary = unique.join(' ').trim();
          return /[.!?]$/.test(summary) ? summary : `${summary}.`;
        }

        const fallbackName = simplifyText(meta.name || 'Этот показатель');
        return `${fallbackName} помогает оценить текущее состояние и подсказывает, что улучшить в повседневных привычках.`;
      };

      const shortText = buildShortSummary(info);

      const buildDetailsFallback = (meta) => {
        const interpretation = simplifyText(meta.interpretation || '');
        const whyImportant = simplifyText(meta.whyImportant || '');
        const formulaLead = meta.formula ? 'Метрика рассчитывается по формуле ниже и отражает совокупный эффект нескольких факторов.' : '';
        const actionLead = meta.actionability
          ? `Практический горизонт: ${meta.actionability.toLowerCase()}. Фокусируйтесь на одном-двух главных рычагах, а не на всём сразу.`
          : '';

        const paragraphOne = [
          shortText,
          whyImportant && whyImportant !== shortText ? whyImportant : ''
        ].filter(Boolean).join(' ');

        const paragraphTwo = [
          interpretation,
          formulaLead,
          actionLead
        ].filter(Boolean).join(' ');

        return [paragraphOne, paragraphTwo].filter(Boolean).join('\n\n');
      };

      const detailsText = simplifyDetailedText(
        info.details || info.interpretation || info.whyImportant || buildDetailsFallback(info)
      );

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

            // Short version
            shortText && h('div', { className: 'info-modal__section' },
              h('div', { className: 'info-modal__label' }, '🧠 Коротко и по делу'),
              h('div', { className: 'info-modal__text' }, shortText)
            ),

            // Detailed version (accordion)
            detailsText && detailsText !== shortText && h('div', { className: 'info-modal__section' },
              h('button', {
                className: `info-modal__accordion-trigger ${isDetailsOpen ? 'is-open' : ''}`,
                type: 'button',
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDetailsOpen(prev => !prev);
                }
              },
                h('span', { className: 'info-modal__accordion-title' }, '📖 Подробнее и научное обоснование'),
                h('span', { className: 'info-modal__accordion-chevron' }, isDetailsOpen ? '▾' : '▸')
              ),
              isDetailsOpen && h('div', { className: 'info-modal__accordion-content' },
                h('div', { className: 'info-modal__text', style: { whiteSpace: 'pre-line' } }, detailsText)
              )
            ),

            // Formula (accordion)
            info.formula && h('div', { className: 'info-modal__section' },
              h('button', {
                className: `info-modal__accordion-trigger ${isFormulaOpen ? 'is-open' : ''}`,
                type: 'button',
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsFormulaOpen(prev => !prev);
                }
              },
                h('span', { className: 'info-modal__accordion-title' }, '📐 Формула расчёта'),
                h('span', { className: 'info-modal__accordion-chevron' }, isFormulaOpen ? '▾' : '▸')
              ),
              isFormulaOpen && h('div', { className: 'info-modal__accordion-content' },
                h('pre', { className: 'info-modal__formula' }, info.formula)
              )
            ),

            // Sources (accordion)
            sources.length > 0 && h('div', { className: 'info-modal__section' },
              h('button', {
                className: `info-modal__accordion-trigger ${isSourcesOpen ? 'is-open' : ''}`,
                type: 'button',
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsSourcesOpen(prev => !prev);
                }
              },
                h('span', { className: 'info-modal__accordion-title' }, '📚 Научные источники'),
                h('span', { className: 'info-modal__accordion-chevron' }, isSourcesOpen ? '▾' : '▸')
              ),
              isSourcesOpen && h('div', { className: 'info-modal__accordion-content' },
                h('div', { className: 'info-modal__sources-list' },
                  sources.map((source, index) => {
                    const link = source.url || (source.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${source.pmid}/` : null);
                    const label = source.label || source.source || '';
                    return h('div', { key: `${label}_${index}`, className: 'info-modal__source-card' },
                      h('div', { className: 'info-modal__source-index' }, `${index + 1}`),
                      h('div', { className: 'info-modal__source-main' },
                        link
                          ? h('a', {
                            href: link,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            className: 'info-modal__link',
                            onClick: (e) => e.stopPropagation()
                          }, label)
                          : h('span', { className: 'info-modal__source-text' }, label),
                        source.pmid && h('span', { className: 'info-modal__source-pmid' }, `PMID: ${source.pmid}`)
                      )
                    );
                  })
                )
              )
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
     * NOTE: This is a h()-factory (not a React component), so NO HOOKS allowed!
     */
    function MetricWithInfo({ label, value, unit, infoKey, debugData, color, className }) {
      return h('div', { className: `metric-with-info ${className || ''}` },
        h('div', { className: 'metric-with-info__row' },
          h('span', { className: 'metric-with-info__label' }, label)
          // InfoButton removed — has hooks, can't use in h()-factory
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
    function StatusProgressRing({ score, size = 120, strokeWidth = 10 }) {
      const [displayScore, setDisplayScore] = useState(0);
      const radius = (size - strokeWidth) / 2;
      const circumference = 2 * Math.PI * radius;
      const progress = (displayScore / 100) * circumference;
      const offset = circumference - progress;

      // Count-up анимация при изменении score
      useEffect(() => {
        const duration = 1500; // ms
        const start = displayScore;
        const diff = score - start;
        const startTime = performance.now();

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const t = Math.min(elapsed / duration, 1);
          // Ease out cubic
          const eased = 1 - Math.pow(1 - t, 3);
          const current = Math.round(start + diff * eased);
          setDisplayScore(current);

          if (t < 1) {
            requestAnimationFrame(animate);
          }
        };

        requestAnimationFrame(animate);
      }, [score]);

      // Градиентный цвет по score (0-100)
      const getGradientColor = (s) => {
        if (s >= 85) return { start: '#10b981', end: '#22c55e' }; // emerald → green
        if (s >= 70) return { start: '#22c55e', end: '#84cc16' }; // green → lime
        if (s >= 50) return { start: '#eab308', end: '#f59e0b' }; // yellow → amber
        if (s >= 30) return { start: '#f59e0b', end: '#ef4444' }; // amber → red
        return { start: '#ef4444', end: '#dc2626' }; // red shades
      };

      const colors = getGradientColor(displayScore);
      const gradientId = 'statusGradient' + Math.random().toString(36).substr(2, 9);

      return h('svg', {
        width: size,
        height: size,
        className: 'status-progress-ring',
        viewBox: `0 0 ${size} ${size}`
      },
        // Gradient definition
        h('defs', null,
          h('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
            h('stop', { offset: '0%', stopColor: colors.start }),
            h('stop', { offset: '100%', stopColor: colors.end })
          )
        ),
        // Background circle
        h('circle', {
          cx: size / 2,
          cy: size / 2,
          r: radius,
          fill: 'none',
          stroke: 'var(--border-color, #e2e8f0)',
          strokeWidth: strokeWidth
        }),
        // Progress circle
        h('circle', {
          cx: size / 2,
          cy: size / 2,
          r: radius,
          fill: 'none',
          stroke: `url(#${gradientId})`,
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeDasharray: circumference,
          strokeDashoffset: offset,
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
          style: { transition: 'stroke-dashoffset 0.1s ease' }
        }),
        // Score text
        h('text', {
          x: size / 2,
          y: size / 2,
          textAnchor: 'middle',
          dominantBaseline: 'middle',
          className: 'status-progress-ring__score',
          style: {
            fontSize: size * 0.28,
            fontWeight: 700,
            fill: 'var(--text-primary, #0f172a)'
          }
        }, displayScore),
        // Label
        h('text', {
          x: size / 2,
          y: size / 2 + size * 0.18,
          textAnchor: 'middle',
          className: 'status-progress-ring__label',
          style: {
            fontSize: size * 0.1,
            fill: 'var(--text-secondary, #64748b)'
          }
        }, 'из 100')
      );
    }

    /**
     * StatusTrendBadge — тренд ↑/↓ относительно вчера
     */
    function StatusTrendBadge({ currentScore, prevScore }) {
      if (prevScore === null || prevScore === undefined) return null;

      const diff = currentScore - prevScore;
      if (diff === 0) return null;

      const isUp = diff > 0;
      const absDiff = Math.abs(diff);

      return h('div', {
        className: `status-trend-badge status-trend-badge--${isUp ? 'up' : 'down'}`
      },
        h('span', { className: 'status-trend-badge__arrow' }, isUp ? '↑' : '↓'),
        h('span', { className: 'status-trend-badge__value' }, absDiff),
        h('span', { className: 'status-trend-badge__label' }, 'vs вчера')
      );
    }

    /**
     * PillarBreakdownBars — breakdown по столпам (nutrition/timing/activity/recovery)
     */
    function PillarBreakdownBars({ pillars }) {
      if (!pillars || Object.keys(pillars).length === 0) return null;

      const pillarConfig = {
        nutrition: { label: 'Питание', icon: '🍽️', color: '#22c55e' },
        timing: { label: 'Тайминг', icon: '⏰', color: '#3b82f6' },
        activity: { label: 'Активность', icon: '🏃', color: '#f59e0b' },
        recovery: { label: 'Восстановление', icon: '😴', color: '#8b5cf6' }
      };

      return h('div', { className: 'pillar-breakdown-bars' },
        Object.entries(pillars).map(([key, value]) => {
          const config = pillarConfig[key] || { label: key, icon: '📊', color: '#64748b' };
          const pct = Math.min(100, Math.max(0, value));

          return h('div', { key, className: 'pillar-breakdown-bars__item' },
            h('div', { className: 'pillar-breakdown-bars__header' },
              h('span', { className: 'pillar-breakdown-bars__icon' }, config.icon),
              h('span', { className: 'pillar-breakdown-bars__label' }, config.label),
              h('span', { className: 'pillar-breakdown-bars__value' }, `${Math.round(pct)}%`)
            ),
            h('div', { className: 'pillar-breakdown-bars__track' },
              h('div', {
                className: 'pillar-breakdown-bars__fill',
                style: {
                  width: `${pct}%`,
                  backgroundColor: config.color
                }
              })
            )
          );
        })
      );
    }

    /**
     * ConfidenceBadge — бейдж уверенности (low/medium/high)
     */
    function ConfidenceBadge({ confidence, completeness }) {
      const config = {
        high: { label: 'Высокая', color: '#22c55e', icon: '✓' },
        medium: { label: 'Средняя', color: '#eab308', icon: '~' },
        low: { label: 'Низкая', color: '#ef4444', icon: '?' }
      };

      const c = config[confidence] || config.low;
      const level = confidence === 'high' ? 'high' : (confidence === 'medium' ? 'medium' : 'low');

      return h('div', {
        className: `confidence-badge confidence-badge--${level}`
      },
        h('span', {
          className: 'confidence-badge__icon'
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
    function MetabolicQuickStatus({ lsGet, profile, pIndex, selectedDate }) {
      // Fallback: если сегодня нет данных, показываем последний день с данными
      const resolvedDate = useMemo(() => {
        return getMetabolismDate(lsGet || window.HEYS?.utils?.lsGet, selectedDate);
      }, [lsGet, selectedDate]);

      const status = useMemo(() => {
        if (!HEYS.Metabolic?.getStatus) return null;

        return HEYS.Metabolic.getStatus({
          dateStr: resolvedDate,
          pIndex: pIndex || null,
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          forceRefresh: false
        });
      }, [lsGet, profile, pIndex, resolvedDate]);

      // 🆕 v3.22.0: Extended Analytics (proteinDebt, emotionalRisk, trainingContext)
      const extendedAnalytics = useMemo(() => {
        const getter = lsGet || window.HEYS?.utils?.lsGet;
        if (!getter) return null;

        const dateStr = selectedDate || new Date().toISOString().split('T')[0];
        const prof = profile || getter('heys_profile', {});
        const day = getter('heys_dayv2_' + dateStr, {});

        // Protein Debt: анализ последних 3 дней
        let proteinDebt = { hasDebt: false, severity: 'none', avgProteinPct: 0 };
        try {
          const proteinDays = [];
          for (let i = 1; i <= 3; i++) {
            const d = new Date(dateStr);
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            const dData = getter('heys_dayv2_' + dStr, {});
            if (dData.meals?.length > 0) {
              const buildIdx = HEYS.dayUtils?.buildProductIndex || HEYS.models?.buildProductIndex;
              const idx = pIndex || (buildIdx ? buildIdx(HEYS.products?.getAll?.() || []) : null);
              let prot = 0, kcal = 0;
              (dData.meals || []).forEach(m => {
                (m.items || []).forEach(item => {
                  const prod = idx?.byId?.get?.(item.product_id) || item;
                  const g = item.grams || 0;
                  prot += (prod.protein100 || 0) * g / 100;
                  kcal += (prod.kcal100 || 0) * g / 100;
                });
              });
              if (kcal > 500) proteinDays.push({ prot, kcal, protPct: prot * 3 / kcal });
            }
          }
          if (proteinDays.length >= 2) {
            const avgPct = proteinDays.reduce((s, d) => s + d.protPct, 0) / proteinDays.length;
            proteinDebt.avgProteinPct = Math.round(avgPct * 100);
            if (avgPct < 0.18) {
              proteinDebt = { hasDebt: true, severity: 'critical', avgProteinPct: Math.round(avgPct * 100), pmid: '20095013' };
            } else if (avgPct < 0.21) {
              proteinDebt = { hasDebt: true, severity: 'moderate', avgProteinPct: Math.round(avgPct * 100), pmid: '20095013' };
            }
          }
        } catch (e) {
          devWarn('[ExtendedAnalytics] proteinDebt error:', e);
          trackError(e, { scope: 'PI UI Dashboard', action: 'protein_debt' });
        }

        // Emotional Risk: стресс + недобор + время
        let emotionalRisk = { level: 'low', bingeRisk: 0, factors: [] };
        try {
          const avgStress = (day.meals || []).reduce((s, m) => s + (m.stress || 0), 0) / Math.max(1, (day.meals || []).length);
          const currentHour = new Date().getHours();
          const isEvening = currentHour >= 18;

          if (avgStress >= 6) emotionalRisk.factors.push('Высокий стресс');
          if (isEvening) emotionalRisk.factors.push('Вечер (пик уязвимости)');

          // Проверяем недобор за вчера
          const yesterday = new Date(dateStr);
          yesterday.setDate(yesterday.getDate() - 1);
          const yData = getter('heys_dayv2_' + yesterday.toISOString().split('T')[0], {});
          if (yData.meals?.length > 0) {
            const buildIdx = HEYS.dayUtils?.buildProductIndex || HEYS.models?.buildProductIndex;
            const idx = pIndex || (buildIdx ? buildIdx(HEYS.products?.getAll?.() || []) : null);
            let yKcal = 0;
            (yData.meals || []).forEach(m => {
              (m.items || []).forEach(item => {
                const prod = idx?.byId?.get?.(item.product_id) || item;
                yKcal += (prod.kcal100 || 0) * (item.grams || 0) / 100;
              });
            });
            const normAbs = prof.normAbs?.kcal || 2000;
            if (yKcal < normAbs * 0.7) emotionalRisk.factors.push('Вчерашний недобор');
          }

          emotionalRisk.bingeRisk = Math.min(100, emotionalRisk.factors.length * 25);
          if (emotionalRisk.bingeRisk >= 75) emotionalRisk.level = 'critical';
          else if (emotionalRisk.bingeRisk >= 50) emotionalRisk.level = 'high';
          else if (emotionalRisk.bingeRisk >= 25) emotionalRisk.level = 'medium';
          emotionalRisk.pmid = '11070333'; // Epel 2001
        } catch (e) {
          devWarn('[ExtendedAnalytics] emotionalRisk error:', e);
          trackError(e, { scope: 'PI UI Dashboard', action: 'emotional_risk' });
        }

        // Training Day Context
        let trainingContext = { isTrainingDay: false, type: null, intensity: 'none' };
        if (day.trainings?.length > 0) {
          trainingContext.isTrainingDay = true;
          const types = { strength: 0, cardio: 0, hobby: 0 };
          let totalMin = 0, highMin = 0;
          day.trainings.forEach(t => {
            types[t.type || 'hobby']++;
            if (t.z) {
              const total = t.z.reduce((s, m) => s + (+m || 0), 0);
              totalMin += total;
              highMin += (+t.z[2] || 0) + (+t.z[3] || 0);
            }
          });
          trainingContext.type = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'hobby';
          if (totalMin >= 60 || highMin >= 20) trainingContext.intensity = 'high';
          else if (totalMin >= 30) trainingContext.intensity = 'moderate';
          else trainingContext.intensity = 'light';
        }

        return { proteinDebt, emotionalRisk, trainingContext };
      }, [lsGet, profile, pIndex, selectedDate]);

      // Use riskLevel from status (same source as PredictiveDashboard)
      const risk = useMemo(() => {
        const riskData = {
          low: { level: 'low', emoji: '✅', label: 'Низкий', color: '#22c55e' },
          medium: { level: 'medium', emoji: '⚠️', label: 'Средний', color: '#eab308' },
          high: { level: 'high', emoji: '🚨', label: 'Высокий', color: '#ef4444' }
        };

        // Use status.riskLevel from Metabolic module (единый источник)
        const level = status?.riskLevel || 'low';
        return riskData[level] || riskData.low;
      }, [status]);

      // Phase data
      const phase = status?.metabolicPhase || null;

      // Empty state
      if (!status?.available) {
        return h('div', { className: 'metabolic-quick-status metabolic-quick-status--empty' },
          h('div', { className: 'metabolic-quick-status__title-header' },
            h('div', { className: 'metabolic-quick-status__title' },
              h('span', { className: 'metabolic-quick-status__title-icon' }, '⚠️'),
              h('span', null, 'Статус и риски'),
              h(getInfoButton(), { infoKey: 'CRASH_RISK' })
            )
          ),
          h('div', { className: 'metabolic-quick-status__cards' },
            h('div', { className: 'metabolic-quick-status__card' },
              h('div', { className: 'metabolic-quick-status__empty-icon' }, '📊'),
              h('div', { className: 'metabolic-quick-status__empty-text' }, 'Добавь данные')
            ),
            h('div', { className: 'metabolic-quick-status__card' },
              h('div', { className: 'metabolic-quick-status__empty-icon' }, '✅'),
              h('div', { className: 'metabolic-quick-status__empty-text' }, 'Риск срыва'),
              h('div', { className: 'metabolic-quick-status__empty-label' }, 'Низкий')
            )
          )
        );
      }

      // Score color
      const getScoreColor = (score) => {
        if (score >= 80) return '#22c55e';
        if (score >= 60) return '#84cc16';
        if (score >= 40) return '#eab308';
        return '#ef4444';
      };

      return h('div', { className: 'metabolic-quick-status' },
        // Header
        h('div', { className: 'metabolic-quick-status__title-header' },
          h('div', { className: 'metabolic-quick-status__title' },
            h('span', { className: 'metabolic-quick-status__title-icon' }, '⚠️'),
            h('span', null, 'Статус и риски'),
            h(getInfoButton(), { infoKey: 'CRASH_RISK' })
          )
        ),
        // Cards container
        h('div', { className: 'metabolic-quick-status__cards' },
          // Card 1: Status Score
          h('div', { className: 'metabolic-quick-status__card' },
            h('div', { className: 'metabolic-quick-status__header' },
              h('div', { className: 'metabolic-quick-status__score', style: { color: getScoreColor(status.score) } },
                status.score
              ),
              h(getInfoButton(), { infoKey: 'STATUS_SCORE', size: 'small' })
            ),
            h('div', { className: 'metabolic-quick-status__score-label' }, 'Метаболизм'),
            phase && h('div', { className: 'metabolic-quick-status__phase' },
              h('span', { className: 'metabolic-quick-status__phase-emoji' }, phase.emoji || '⚡'),
              h('span', { className: 'metabolic-quick-status__phase-text' }, phase.label || phase.phase)
            ),
            phase?.timeToLipolysis > 0 && h('div', { className: 'metabolic-quick-status__time' },
              `→ ${Math.round(phase.timeToLipolysis * 60)} мин`
            ),
            phase?.isLipolysis && h('div', { className: 'metabolic-quick-status__lipolysis' }, '🔥 Жиросжигание')
          ),

          // Card 2: Risk
          h('div', { className: `metabolic-quick-status__card metabolic-quick-status__card--${risk.level}` },
            h('div', { className: 'metabolic-quick-status__risk-header' },
              h('div', { className: 'metabolic-quick-status__risk-indicator' },
                h('div', {
                  className: 'metabolic-quick-status__light metabolic-quick-status__light--green',
                  style: { opacity: risk.level === 'low' ? 1 : 0.2 }
                }),
                h('div', {
                  className: 'metabolic-quick-status__light metabolic-quick-status__light--yellow',
                  style: { opacity: risk.level === 'medium' ? 1 : 0.2 }
                }),
                h('div', {
                  className: 'metabolic-quick-status__light metabolic-quick-status__light--red',
                  style: { opacity: risk.level === 'high' ? 1 : 0.2 }
                })
              ),
              h(getInfoButton(), { infoKey: 'CRASH_RISK_QUICK', size: 'small' })
            ),
            h('div', { className: 'metabolic-quick-status__risk-label' },
              h('span', null, risk.emoji),
              'Риск срыва'
            ),
            h('div', { className: 'metabolic-quick-status__risk-level', style: { color: risk.color } },
              risk.label
            )
          )
        ), // Close __cards

        // 🆕 v3.22.0: Extended Analytics Row (proteinDebt, emotionalRisk, trainingContext)
        (extendedAnalytics?.proteinDebt?.hasDebt || extendedAnalytics?.emotionalRisk?.level !== 'low' || extendedAnalytics?.trainingContext?.isTrainingDay) &&
        h('div', { className: 'metabolic-quick-status__extended' },
          // Protein Debt Badge
          extendedAnalytics?.proteinDebt?.hasDebt && h('div', {
            className: `metabolic-quick-status__badge metabolic-quick-status__badge--${extendedAnalytics.proteinDebt.severity}`,
            title: `Средний белок за 3 дня: ${extendedAnalytics.proteinDebt.avgProteinPct}% (норма 25%)\n🔬 PMID: ${extendedAnalytics.proteinDebt.pmid}`
          },
            h('span', { className: 'metabolic-quick-status__badge-icon' }, '🥩'),
            h('span', { className: 'metabolic-quick-status__badge-text' },
              extendedAnalytics.proteinDebt.severity === 'critical' ? 'Белок ↓↓' : 'Белок ↓'
            ),
            h('a', {
              href: `https://pubmed.ncbi.nlm.nih.gov/${extendedAnalytics.proteinDebt.pmid}/`,
              target: '_blank',
              className: 'metabolic-quick-status__pmid',
              onClick: (e) => e.stopPropagation()
            }, '?')
          ),

          // Emotional Risk Badge
          extendedAnalytics?.emotionalRisk?.level !== 'low' && h('div', {
            className: `metabolic-quick-status__badge metabolic-quick-status__badge--${extendedAnalytics.emotionalRisk.level}`,
            title: `Риск срыва: ${extendedAnalytics.emotionalRisk.bingeRisk}%\nФакторы: ${extendedAnalytics.emotionalRisk.factors.join(', ')}\n🔬 PMID: ${extendedAnalytics.emotionalRisk.pmid}`
          },
            h('span', { className: 'metabolic-quick-status__badge-icon' }, '😰'),
            h('span', { className: 'metabolic-quick-status__badge-text' },
              `${extendedAnalytics.emotionalRisk.bingeRisk}%`
            ),
            h('a', {
              href: `https://pubmed.ncbi.nlm.nih.gov/${extendedAnalytics.emotionalRisk.pmid}/`,
              target: '_blank',
              className: 'metabolic-quick-status__pmid',
              onClick: (e) => e.stopPropagation()
            }, '?')
          ),

          // Training Context Badge
          extendedAnalytics?.trainingContext?.isTrainingDay && h('div', {
            className: `metabolic-quick-status__badge metabolic-quick-status__badge--training metabolic-quick-status__badge--${extendedAnalytics.trainingContext.intensity}`,
            title: `Тренировочный день: ${extendedAnalytics.trainingContext.type}\nИнтенсивность: ${extendedAnalytics.trainingContext.intensity}`
          },
            h('span', { className: 'metabolic-quick-status__badge-icon' },
              extendedAnalytics.trainingContext.type === 'strength' ? '💪' :
                extendedAnalytics.trainingContext.type === 'cardio' ? '🏃' : '⚽'
            ),
            h('span', { className: 'metabolic-quick-status__badge-text' },
              extendedAnalytics.trainingContext.intensity === 'high' ? 'Интенсив' : 'Трени'
            )
          )
        )
      );
    }

    /**
     * MetabolicStatusCard — главная карточка метаболического статуса 0-100
     * v2.0: с ring animation, trend, breakdown bars, confidence badge
     */
    function MetabolicStatusCard({ lsGet, profile, pIndex, selectedDate }) {
      const [showDetails, setShowDetails] = useState(false);

      // Fallback: если сегодня нет данных, показываем последний день с данными
      const resolvedDate = useMemo(() => {
        return getMetabolismDate(lsGet || window.HEYS?.utils?.lsGet, selectedDate);
      }, [lsGet, selectedDate]);

      // Получаем текущий статус
      const status = useMemo(() => {
        if (!HEYS.Metabolic?.getStatus) return null;

        return HEYS.Metabolic.getStatus({
          dateStr: resolvedDate,
          pIndex: pIndex || null,
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          forceRefresh: false
        });
      }, [lsGet, profile, pIndex, resolvedDate]);

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
            pIndex: pIndex || null,
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
              h(getInfoButton(), { infoKey: 'STATUS_INFLUENCES', size: 'small' })
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
              h(getInfoButton(), { infoKey: 'PRIORITY_ACTIONS', size: 'small' })
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
              h(getInfoButton(), { infoKey: 'STATUS_RISK_FACTORS', size: 'small' })
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
            className: `action-card__priority action-card__priority--${step.priority || 3}`
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
    function PredictiveDashboard({ lsGet, profile, selectedDate, pIndex }) {
      const [activeTab, setActiveTab] = useState('risk');
      const [dateOffset, setDateOffset] = useState(0); // -7..+7 дней — только для forecast

      // Базовая дата (сегодня)
      const todayDate = useMemo(() => {
        return selectedDate || new Date().toISOString().split('T')[0];
      }, [selectedDate]);

      // Завтра
      const tomorrowDate = useMemo(() => {
        const d = new Date(todayDate);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
      }, [todayDate]);

      // Дата для forecast (с offset)
      const forecastDate = useMemo(() => {
        const base = new Date(todayDate);
        base.setDate(base.getDate() + dateOffset);
        return base.toISOString().split('T')[0];
      }, [todayDate, dateOffset]);

      const isForecastToday = dateOffset === 0;
      const isForecastFuture = dateOffset > 0;
      const isForecastPast = dateOffset < 0;

      // Риск на сегодня
      const predictionToday = useMemo(() => {
        if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;

        const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];

        return HEYS.Metabolic.calculateCrashRisk24h(
          todayDate,
          profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          history
        );
      }, [lsGet, profile, todayDate]);

      // Риск на завтра
      const predictionTomorrow = useMemo(() => {
        if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;

        const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];

        return HEYS.Metabolic.calculateCrashRisk24h(
          tomorrowDate,
          profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          history
        );
      }, [lsGet, profile, tomorrowDate]);

      // Прогноз (с offset для timeline)
      const forecast = useMemo(() => {
        if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;

        const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];

        return HEYS.Metabolic.calculatePerformanceForecast(
          forecastDate,
          profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          history
        );
      }, [lsGet, profile, forecastDate]);

      // Phenotype теперь вычисляется внутри HEYS.Phenotype.PhenotypeWidget

      const riskColors = {
        low: '#22c55e',
        medium: '#eab308',
        high: '#ef4444'
      };


      // Форматирование даты для timeline (только для forecast)
      const formatTimelineDate = (offset) => {
        const d = new Date(todayDate);
        d.setDate(d.getDate() + offset);
        const day = d.getDate();
        const weekday = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
        if (offset === 0) return 'Сегодня';
        if (offset === 1) return 'Завтра';
        if (offset === -1) return 'Вчера';
        return `${weekday}`;
      };

      // Badge для риска — показываем максимальный риск (сегодня или завтра)
      const maxRisk = Math.max(predictionToday?.risk || 0, predictionTomorrow?.risk || 0);

      // Tabs — только Risk и Forecast (Phenotype теперь отдельная карточка)
      const tabs = [
        { id: 'risk', label: '🚨 Риск', badge: maxRisk > 30 ? maxRisk + '%' : null },
        { id: 'forecast', label: '🔮 Прогноз', badge: null }
      ];

      // Timeline показывается ТОЛЬКО для forecast
      const showTimeline = activeTab === 'forecast';

      return h('div', { className: 'predictive-dashboard predictive-dashboard--v2' },
        // Header с InfoButton
        h('div', { className: 'predictive-dashboard__header' },
          h('div', { className: 'predictive-dashboard__title' },
            h('span', { className: 'predictive-dashboard__title-icon' }, '🔮'),
            h('span', null, 'Прогнозы на сегодня'),
            h(getInfoButton(), { infoKey: 'PREDICTIVE_RISK' })
          )
        ),

        // Tabs
        h('div', { className: 'predictive-dashboard__tabs' },
          tabs.map(tab =>
            h('button', {
              key: tab.id,
              className: `predictive-dashboard__tab ${activeTab === tab.id ? 'predictive-dashboard__tab--active' : ''}`,
              onClick: () => setActiveTab(tab.id)
            },
              h('span', { className: 'predictive-dashboard__tab-label' }, tab.label),
              tab.badge && h('span', { className: 'predictive-dashboard__tab-badge' }, tab.badge)
            )
          )
        ),

        // Timeline Navigation — ТОЛЬКО для Forecast
        showTimeline && h('div', { className: 'predictive-dashboard__timeline' },
          h('button', {
            className: 'predictive-dashboard__timeline-btn',
            disabled: dateOffset <= -7,
            onClick: () => setDateOffset(d => Math.max(-7, d - 1))
          }, '←'),
          h('div', { className: 'predictive-dashboard__timeline-dates' },
            [-3, -2, -1, 0, 1, 2, 3].map(offset =>
              h('button', {
                key: offset,
                className: `predictive-dashboard__timeline-date ${dateOffset === offset ? 'predictive-dashboard__timeline-date--active' : ''} ${offset === 0 ? 'predictive-dashboard__timeline-date--today' : ''}`,
                onClick: () => setDateOffset(offset)
              }, formatTimelineDate(offset))
            )
          ),
          h('button', {
            className: 'predictive-dashboard__timeline-btn',
            disabled: dateOffset >= 7,
            onClick: () => setDateOffset(d => Math.min(7, d + 1))
          }, '→')
        ),

        // Tab Content
        h('div', { className: 'predictive-dashboard__content' },
          // RISK TAB — Dual meters (сегодня + завтра)
          activeTab === 'risk' && h('div', { className: 'predictive-dashboard__panel' },
            (predictionToday || predictionTomorrow)
              ? h(DualRiskPanel, {
                predictionToday,
                predictionTomorrow,
                riskColors
              })
              : h('div', { className: 'predictive-dashboard__empty' }, 'Нет данных для анализа риска')
          ),

          // FORECAST TAB — с timeline
          activeTab === 'forecast' && h('div', { className: 'predictive-dashboard__panel' },
            forecast ? h(ForecastPanel, { forecast, isPast: isForecastPast }) :
              h('div', { className: 'predictive-dashboard__empty' }, 'Нет данных для прогноза')
          )
        )
      );
    }

    /**
     * DualRiskPanel — два полукруга рядом: Сегодня + Завтра
     * v3.0: Убрана навигация по дням, сразу видно оба риска
     * v3.22.0: Интеграция emotionalRisk в факторы (Epel 2001, PMID: 11070333)
     */
    function DualRiskPanel({ predictionToday, predictionTomorrow, riskColors }) {
      // Определяем какой риск выше для акцента
      const todayRisk = predictionToday?.risk || 0;
      const tomorrowRisk = predictionTomorrow?.risk || 0;
      const maxRisk = Math.max(todayRisk, tomorrowRisk);

      // Активный прогноз для деталей (показываем тот где риск выше, если оба есть)
      const [activePrediction, setActivePrediction] = useState(tomorrowRisk > todayRisk ? 'tomorrow' : 'today');

      // 🆕 v3.22.0: Extended Analytics для emotional risk
      const extendedAnalytics = useMemo(() => {
        const U = window.HEYS?.utils;
        const lsGet = U?.lsGet || ((k, d) => {
          try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
        });
        const profile = lsGet('heys_profile', {});
        const todayDate = new Date().toISOString().split('T')[0];
        const dayKey = `heys_dayv2_${todayDate}`;
        const day = lsGet(dayKey, {});

        // Emotional Risk (Epel 2001, PMID: 11070333)
        const stressAvg = day.stressAvg || 0;
        const factors = [];
        let bingeRisk = 0;

        if (stressAvg >= 6) {
          factors.push('Высокий стресс');
          bingeRisk += 35;
        } else if (stressAvg >= 4) {
          factors.push('Умеренный стресс');
          bingeRisk += 15;
        }

        const hour = new Date().getHours();
        if (hour >= 20) {
          factors.push('Вечер');
          bingeRisk += 20;
        } else if (hour >= 18) {
          bingeRisk += 10;
        }

        const sleepDeficit = (profile.sleepHours || 8) - getDaySleepHours(day);
        if (sleepDeficit > 2) {
          factors.push('Недосып');
          bingeRisk += 15;
        }

        // День дефицита? (недобор калорий)
        const deficitDays = [];
        for (let i = 1; i <= 3; i++) {
          const d = new Date(todayDate);
          d.setDate(d.getDate() - i);
          const pastDay = lsGet(`heys_dayv2_${d.toISOString().split('T')[0]}`, {});
          const optimum = 2000; // примерно
          const eaten = pastDay.meals?.reduce((sum, m) => {
            return sum + (m.items?.reduce((s, item) => s + (item.kcal || 0), 0) || 0);
          }, 0) || 0;
          if (eaten > 0 && eaten < optimum * 0.75) deficitDays.push(i);
        }
        if (deficitDays.length >= 2) {
          factors.push('Калорийный долг');
          bingeRisk += 20;
        }

        const emotionalRisk = {
          hasRisk: bingeRisk >= 30 || factors.length >= 2,
          level: bingeRisk >= 60 ? 'high' : bingeRisk >= 40 ? 'medium' : 'low',
          bingeRisk: Math.min(90, bingeRisk),
          factors,
          stressLevel: stressAvg,
          pmid: '11070333'
        };

        // Training Context (Aragon 2013, PMID: 23360586)
        const trainings = day.trainings || [];
        const isTrainingDay = trainings.length > 0;
        let trainingType = null;
        let trainingIntensity = 'moderate';

        if (isTrainingDay) {
          const t = trainings[0];
          trainingType = t.type || 'cardio';
          const totalMins = (t.z || []).reduce((a, b) => a + b, 0);
          const highZoneMins = (t.z?.[2] || 0) + (t.z?.[3] || 0);
          if (highZoneMins > totalMins * 0.4) trainingIntensity = 'high';
          else if (totalMins < 30) trainingIntensity = 'light';
        }

        return { emotionalRisk, isTrainingDay, trainingType, trainingIntensity };
      }, []);

      // Расширяем factors emotionalRisk если есть риск
      const getEnhancedFactors = (prediction) => {
        if (!prediction?.factors) return [];
        const factors = [...prediction.factors];

        // Добавляем emotionalRisk если высокий
        if (extendedAnalytics.emotionalRisk.hasRisk) {
          const { bingeRisk, factors: riskFactors } = extendedAnalytics.emotionalRisk;
          factors.push({
            label: `🧠 Эмоц. риск: ${riskFactors.slice(0, 2).join(', ')}`,
            weight: Math.round(bingeRisk * 0.3), // переводим в +weight
            pmid: '11070333',
            isEmotional: true
          });
        }

        // Добавляем training context как защитный фактор (отрицательный вес)
        if (extendedAnalytics.isTrainingDay) {
          const typeLabels = { strength: '💪 Силовая', cardio: '🏃 Кардио', hobby: '⚽ Хобби' };
          factors.push({
            label: `${typeLabels[extendedAnalytics.trainingType] || '🏋️ Трен.'} сегодня`,
            weight: extendedAnalytics.trainingIntensity === 'high' ? -15 : -10,
            isProtective: true
          });
        }

        return factors;
      };

      const basePredictionData = activePrediction === 'today' ? predictionToday : predictionTomorrow;
      const activePredictionData = basePredictionData ? {
        ...basePredictionData,
        factors: getEnhancedFactors(basePredictionData)
      } : null;
      const activeLabel = activePrediction === 'today' ? 'Сегодня' : 'Завтра';

      const getRiskLevel = (risk) => risk < 30 ? 'low' : risk < 60 ? 'medium' : 'high';

      return h('div', { className: 'dual-risk-panel' },
        // Два полукруга рядом
        h('div', { className: 'dual-risk-panel__meters' },
          // Сегодня
          h('div', {
            className: `dual-risk-panel__meter-card ${activePrediction === 'today' ? 'dual-risk-panel__meter-card--active' : ''}`,
            onClick: () => setActivePrediction('today')
          },
            h('div', { className: 'dual-risk-panel__meter-label' }, 'Сегодня'),
            h(MiniRiskMeter, {
              risk: todayRisk,
              riskLevel: getRiskLevel(todayRisk),
              size: 120
            }),
            todayRisk < 30 && h('div', { className: 'dual-risk-panel__ok-badge' }, '✅')
          ),

          // Завтра
          h('div', {
            className: `dual-risk-panel__meter-card ${activePrediction === 'tomorrow' ? 'dual-risk-panel__meter-card--active' : ''}`,
            onClick: () => setActivePrediction('tomorrow')
          },
            h('div', { className: 'dual-risk-panel__meter-label' }, 'Завтра'),
            h(MiniRiskMeter, {
              risk: tomorrowRisk,
              riskLevel: getRiskLevel(tomorrowRisk),
              size: 120
            }),
            tomorrowRisk >= 30 && h('div', { className: 'dual-risk-panel__warning-badge' }, '⚠️')
          )
        ),

        // Статус строка
        h('div', { className: 'dual-risk-panel__status' },
          maxRisk < 30
            ? h('span', { className: 'dual-risk-panel__status-ok' }, '✅ Всё под контролем')
            : tomorrowRisk > todayRisk
              ? h('span', { className: 'dual-risk-panel__status-warn' }, '🔮 Прогноз на будущее')
              : h('span', { className: 'dual-risk-panel__status-warn' }, '⚠️ Требует внимания')
        ),

        // Детали активного прогноза
        activePredictionData && h('div', { className: 'dual-risk-panel__details' },
          // Hint - какой день показываем
          h('div', { className: 'dual-risk-panel__details-hint' },
            `Детали: ${activeLabel} (нажми на полукруг для переключения)`
          ),

          // Primary Trigger
          activePredictionData.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
            h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
            h('div', { className: 'risk-panel__trigger-value' }, activePredictionData.primaryTrigger.label)
          ),

          // Prevention Strategies
          activePredictionData.preventionStrategy && activePredictionData.preventionStrategy.length > 0 &&
          h('div', { className: 'risk-panel__prevention' },
            h('div', { className: 'risk-panel__prevention-header' },
              h('span', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
              h(getInfoButton(), { infoKey: 'PREVENTION_STRATEGY', size: 'small' })
            ),
            activePredictionData.preventionStrategy.slice(0, 3).map((strategy, idx) =>
              h('div', { key: idx, className: 'risk-panel__strategy' },
                h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
                h('div', { className: 'risk-panel__strategy-content' },
                  h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
                  h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
                )
              )
            )
          ),

          // Risk Factors — 🆕 v3.22.0: улучшенный рендеринг с PMID и защитными факторами
          activePredictionData.factors && activePredictionData.factors.length > 0 &&
          h('div', { className: 'risk-panel__factors' },
            h('div', { className: 'risk-panel__factors-header' },
              h('span', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
              h(getInfoButton(), { infoKey: 'RISK_FACTORS', size: 'small' })
            ),
            activePredictionData.factors.slice(0, 6).map((factor, idx) =>
              h('div', {
                key: idx,
                className: `risk-panel__factor ${factor.isProtective ? 'risk-panel__factor--protective' : ''} ${factor.isEmotional ? 'risk-panel__factor--emotional' : ''}`
              },
                h('span', { className: 'risk-panel__factor-label' }, factor.label),
                h('span', {
                  className: `risk-panel__factor-weight ${factor.weight < 0 ? 'risk-panel__factor-weight--negative' : ''}`
                }, factor.weight < 0 ? factor.weight : `+${factor.weight || factor.impact}`),
                factor.pmid && h('a', {
                  href: `https://pubmed.ncbi.nlm.nih.gov/${factor.pmid}/`,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  className: 'risk-panel__factor-pmid',
                  title: `PMID: ${factor.pmid}`,
                  onClick: (e) => e.stopPropagation()
                }, '🔬')
              )
            )
          )
        )
      );
    }

    /**
     * MiniRiskMeter — компактный полукруг для dual view
     */
    function MiniRiskMeter({ risk, riskLevel, size = 120 }) {
      const safeRisk = typeof risk === 'number' && !isNaN(risk) ? Math.min(100, Math.max(0, risk)) : 0;
      const strokeWidth = 10;
      const radius = (size - strokeWidth) / 2;
      const halfCircumference = Math.PI * radius;
      const progress = (safeRisk / 100) * halfCircumference;
      const offset = halfCircumference - progress;

      const colors = {
        low: '#22c55e',
        medium: '#eab308',
        high: '#ef4444'
      };

      return h('div', { className: 'mini-risk-meter', style: { width: size, height: size / 2 + 25 } },
        h('svg', {
          viewBox: `0 0 ${size} ${size / 2 + 15}`,
          className: 'mini-risk-meter__svg'
        },
          // Background arc
          h('path', {
            d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
            fill: 'none',
            stroke: 'var(--border-color, #e2e8f0)',
            strokeWidth: strokeWidth,
            strokeLinecap: 'round'
          }),
          // Progress arc
          h('path', {
            d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
            fill: 'none',
            stroke: colors[riskLevel] || colors.medium,
            strokeWidth: strokeWidth,
            strokeLinecap: 'round',
            strokeDasharray: halfCircumference,
            strokeDashoffset: offset,
            style: { transition: 'stroke-dashoffset 0.6s ease' }
          }),
          // Value text
          h('text', {
            x: size / 2,
            y: size / 2 - 2,
            textAnchor: 'middle',
            style: {
              fontSize: 28,
              fontWeight: 700,
              fill: colors[riskLevel] || 'var(--text-primary)'
            }
          }, `${safeRisk}%`),
          // Label
          h('text', {
            x: size / 2,
            y: size / 2 + 14,
            textAnchor: 'middle',
            style: { fontSize: 10, fill: 'var(--text-secondary, #64748b)' }
          }, 'Риск срыва')
        )
      );
    }

    /**
     * RiskPanel — содержимое таба Risk (legacy, для одиночного отображения)
     */
    function RiskPanel({ prediction, riskColors, isPast, isFuture }) {
      const riskLevel = prediction.riskLevel || (prediction.risk < 30 ? 'low' : prediction.risk < 60 ? 'medium' : 'high');

      // Генерируем predictionId для feedback
      const predictionId = prediction.id || `risk_${prediction.date || Date.now()}`;

      return h('div', { className: 'risk-panel' },
        // Risk Meter (gauge) with InfoButton
        h('div', { className: 'risk-panel__meter-wrapper' },
          h('div', { className: 'risk-panel__meter' },
            h(RiskMeter, { risk: prediction.risk, riskLevel })
          ),
          h('div', { className: 'risk-panel__meter-info' },
            h(getInfoButton(), {
              infoKey: 'CRASH_RISK',
              size: 'small',
              debugData: {
                risk: prediction.risk,
                riskLevel,
                factors: prediction.factors?.length || 0
              }
            })
          )
        ),

        // Status with inline feedback
        h('div', { className: 'risk-panel__status-row' },
          h('div', { className: 'risk-panel__status' },
            isPast ? '📊 Анализ прошлого дня' :
              isFuture ? '🔮 Прогноз на будущее' :
                prediction.risk >= 30 ? '⚠️ Требует внимания' : '✅ Всё под контролем'
          ),
          // Inline feedback для прошлых дней
          isPast && h(FeedbackPrompt, { predictionId, type: 'risk', compact: true })
        ),

        // Primary Trigger
        prediction.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
          h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
          h('div', { className: 'risk-panel__trigger-value' }, prediction.primaryTrigger.label)
        ),

        // Prevention Strategies
        prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'risk-panel__prevention' },
          h('div', { className: 'risk-panel__prevention-header' },
            h('span', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
            h(getInfoButton(), { infoKey: 'PREVENTION_STRATEGY', size: 'small' })
          ),
          prediction.preventionStrategy.slice(0, 3).map((strategy, idx) =>
            h('div', { key: idx, className: 'risk-panel__strategy' },
              h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
              h('div', { className: 'risk-panel__strategy-content' },
                h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
                h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
              )
            )
          )
        ),

        // Risk Factors
        prediction.factors && prediction.factors.length > 0 && h('div', { className: 'risk-panel__factors' },
          h('div', { className: 'risk-panel__factors-header' },
            h('span', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
            h(getInfoButton(), { infoKey: 'RISK_FACTORS', size: 'small' })
          ),
          prediction.factors.slice(0, 5).map((factor, idx) =>
            h('div', { key: idx, className: 'risk-panel__factor' },
              h('span', { className: 'risk-panel__factor-label' }, factor.label),
              h('span', { className: 'risk-panel__factor-weight' }, `+${factor.weight || factor.impact}`)
            )
          )
        ),

        // Full feedback widget for past days
        isPast && prediction.risk >= 30 && h(FeedbackWidget, {
          predictionType: 'crash_risk',
          predictionId
        })
      );
    }

    /**
     * RiskMeter — визуальный спидометр риска 0-100%
     */
    function RiskMeter({ risk, riskLevel }) {
      // 🔧 FIX: защита от NaN
      const safeRisk = typeof risk === 'number' && !isNaN(risk) ? Math.min(100, Math.max(0, risk)) : 0;
      const size = 160;
      const strokeWidth = 12;
      const radius = (size - strokeWidth) / 2;
      // Полукруг (180 градусов)
      const halfCircumference = Math.PI * radius;
      const progress = (safeRisk / 100) * halfCircumference;
      const offset = halfCircumference - progress;

      const colors = {
        low: '#22c55e',
        medium: '#eab308',
        high: '#ef4444'
      };

      return h('div', { className: 'risk-meter', style: { width: size, height: size / 2 + 30 } },
        h('svg', {
          viewBox: `0 0 ${size} ${size / 2 + 20}`,
          className: 'risk-meter__svg'
        },
          // Background arc
          h('path', {
            d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
            fill: 'none',
            stroke: 'var(--border-color, #e2e8f0)',
            strokeWidth: strokeWidth,
            strokeLinecap: 'round'
          }),
          // Progress arc
          h('path', {
            d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
            fill: 'none',
            stroke: colors[riskLevel] || colors.medium,
            strokeWidth: strokeWidth,
            strokeLinecap: 'round',
            strokeDasharray: halfCircumference,
            strokeDashoffset: offset,
            style: { transition: 'stroke-dashoffset 0.6s ease' }
          }),
          // Value text
          h('text', {
            x: size / 2,
            y: size / 2 - 5,
            textAnchor: 'middle',
            className: 'risk-meter__value',
            style: {
              fontSize: 36,
              fontWeight: 700,
              fill: colors[riskLevel] || 'var(--text-primary)'
            }
          }, `${safeRisk}%`),
          // Label
          h('text', {
            x: size / 2,
            y: size / 2 + 20,
            textAnchor: 'middle',
            className: 'risk-meter__label',
            style: { fontSize: 12, fill: 'var(--text-secondary, #64748b)' }
          }, 'Риск срыва')
        )
      );
    }

    /**
     * ForecastPanel — содержимое таба Forecast
     * Интегрирован с InsulinWave для показа окон еды
     */
    function ForecastPanel({ forecast, isPast }) {
      // 🆕 Получаем данные инсулиновой волны для более точного прогноза
      const [insulinWaveData, setInsulinWaveData] = useState(null);

      useEffect(() => {
        if (window.HEYS?.InsulinWave?.calculate) {
          try {
            // Получаем текущее состояние волны
            const waveData = window.HEYS.InsulinWave.getLatestWaveData?.() || null;
            setInsulinWaveData(waveData);
          } catch (e) {
            // Игнорируем ошибки
          }
        }
      }, []);

      // Форматирование времени окончания волны
      const getWaveEndInfo = () => {
        if (!insulinWaveData) return null;

        const { status, remaining, endTime, currentPhase } = insulinWaveData;

        if (status === 'lipolysis') {
          return {
            status: 'burning',
            label: '🔥 Липолиз активен',
            desc: 'Сейчас идёт активное жиросжигание',
            tone: 'success'
          };
        }

        if (status === 'active' && remaining > 0) {
          return {
            status: 'wave',
            label: `⏳ ${remaining} мин до окончания волны`,
            desc: `Окончание в ${endTime}${currentPhase ? ` • Фаза: ${currentPhase}` : ''}`,
            tone: 'warning'
          };
        }

        if (status === 'almost') {
          return {
            status: 'almost',
            label: `⚡ ${remaining} мин до липолиза`,
            desc: 'Скоро начнётся жиросжигание',
            tone: 'info'
          };
        }

        return null;
      };

      const waveEndInfo = getWaveEndInfo();

      return h('div', { className: 'forecast-panel' },
        isPast && h('div', { className: 'forecast-panel__note' },
          '📊 Анализ прошлого дня'
        ),

        // 🆕 Insulin Wave Status
        waveEndInfo && h('div', {
          className: `forecast-panel__wave-status forecast-panel__wave-status--${waveEndInfo.tone || 'info'}`
        },
          h('div', { className: 'forecast-panel__wave-header' },
            h('div', {
              className: `forecast-panel__wave-label forecast-panel__wave-label--${waveEndInfo.tone || 'info'}`
            },
              waveEndInfo.label
            ),
            h(getInfoButton(), { infoKey: 'INSULIN_WAVE_STATUS', size: 'small' })
          ),
          h('div', { className: 'forecast-panel__wave-desc' }, waveEndInfo.desc)
        ),

        // Energy Windows
        forecast.energyWindows && forecast.energyWindows.length > 0 && h('div', { className: 'forecast-panel__section' },
          h('div', { className: 'forecast-panel__section-header' },
            h('span', { className: 'forecast-panel__section-title' }, '⚡ Окна энергии'),
            h(getInfoButton(), { infoKey: 'ENERGY_WINDOWS', size: 'small' })
          ),
          h('div', { className: 'forecast-panel__windows' },
            forecast.energyWindows.map((window, idx) =>
              h('div', {
                key: idx,
                className: `forecast-panel__window ${window.optimal ? 'forecast-panel__window--optimal' : ''}`
              },
                h('div', { className: 'forecast-panel__window-period' }, window.period),
                h('div', { className: 'forecast-panel__window-label' }, window.label),
                window.optimal && h('span', { className: 'forecast-panel__window-badge' }, '⭐ Оптимально'),
                h('div', { className: 'forecast-panel__window-rec' }, window.recommendation)
              )
            )
          )
        ),

        // Training Window
        forecast.trainingWindow && h('div', { className: 'forecast-panel__section' },
          h('div', { className: 'forecast-panel__section-header' },
            h('span', { className: 'forecast-panel__section-title' }, '🏋️ Лучшее время для тренировки'),
            h(getInfoButton(), { infoKey: 'TRAINING_WINDOW', size: 'small' })
          ),
          h('div', { className: 'forecast-panel__training' },
            h('div', { className: 'forecast-panel__training-time' }, forecast.trainingWindow.time),
            h('div', { className: 'forecast-panel__training-reason' }, forecast.trainingWindow.reason)
          )
        ),

        // 🆕 Next Meal Recommendation based on insulin wave
        insulinWaveData && insulinWaveData.status !== 'lipolysis' && h('div', { className: 'forecast-panel__section' },
          h('div', { className: 'forecast-panel__section-header' },
            h('span', { className: 'forecast-panel__section-title' }, '🍽️ Следующий приём пищи'),
            h(getInfoButton(), { infoKey: 'NEXT_MEAL', size: 'small' })
          ),
          h('div', { className: 'forecast-panel__next-meal' },
            h('div', { className: 'forecast-panel__next-meal-time' },
              insulinWaveData.remaining < 30
                ? '⚡ Скоро можно есть!'
                : `Рекомендуется после ${insulinWaveData.endTime}`
            ),
            h('div', { className: 'forecast-panel__next-meal-tip' },
              insulinWaveData.remaining < 60
                ? 'Подготовь лёгкий перекус с белком'
                : 'Дождись окончания волны для лучшего усвоения'
            )
          )
        ),

        // What-if scenarios (placeholder)
        h('div', { className: 'forecast-panel__scenarios' },
          h('div', { className: 'forecast-panel__scenarios-header' },
            h('span', { className: 'forecast-panel__scenarios-title' }, '🎯 Сценарии'),
            h(getInfoButton(), { infoKey: 'WHATIF_SCENARIOS', size: 'small' })
          ),
          h('div', { className: 'forecast-panel__scenario forecast-panel__scenario--likely' },
            h('span', { className: 'forecast-panel__scenario-emoji' }, '📊'),
            h('span', { className: 'forecast-panel__scenario-label' }, 'Вероятный'),
            h('span', { className: 'forecast-panel__scenario-desc' }, forecast.likelyOutcome || 'Стабильный день')
          ),
          h('div', { className: 'forecast-panel__scenario forecast-panel__scenario--optimistic' },
            h('span', { className: 'forecast-panel__scenario-emoji' }, '🌟'),
            h('span', { className: 'forecast-panel__scenario-label' }, 'Оптимистичный'),
            h('span', { className: 'forecast-panel__scenario-desc' }, forecast.optimisticOutcome || 'При соблюдении плана')
          )
        )
      );
    }

    // PhenotypePanel и PhenotypeRadar перенесены в heys_phenotype_v1.js
    // Теперь используем HEYS.Phenotype.PhenotypeWidget

    /**
     * FeedbackWidget — виджет для сбора обратной связи по прогнозам
     * Интегрируется с HEYS.Metabolic.submitFeedback
     */
    function FeedbackWidget({ predictionType, predictionId, onSubmit }) {
      const [submitted, setSubmitted] = useState(false);
      const [showDetails, setShowDetails] = useState(false);
      const [detailText, setDetailText] = useState('');

      // Статистика точности
      const stats = useMemo(() => {
        if (HEYS.Metabolic?.getFeedbackStats) {
          return HEYS.Metabolic.getFeedbackStats();
        }
        return { total: 0, accuracy: 0 };
      }, []);

      const handleFeedback = (correct) => {
        if (HEYS.Metabolic?.submitFeedback) {
          const details = detailText ? { comment: detailText } : {};
          HEYS.Metabolic.submitFeedback(predictionId, correct, {
            ...details,
            type: predictionType
          });
        }
        setSubmitted(true);
        if (onSubmit) onSubmit(correct);
      };

      if (submitted) {
        return h('div', { className: 'feedback-widget feedback-widget--submitted' },
          h('span', { className: 'feedback-widget__thanks' }, '✅ Спасибо за отзыв!'),
          stats.total > 5 && h('span', { className: 'feedback-widget__accuracy' },
            `Точность прогнозов: ${stats.accuracy}%`
          )
        );
      }

      return h('div', { className: 'feedback-widget' },
        h('div', { className: 'feedback-widget__question' },
          '🎯 Прогноз оказался точным?'
        ),

        h('div', { className: 'feedback-widget__buttons' },
          h('button', {
            className: 'feedback-widget__btn feedback-widget__btn--yes',
            onClick: () => handleFeedback(true)
          }, '👍 Да'),
          h('button', {
            className: 'feedback-widget__btn feedback-widget__btn--no',
            onClick: () => setShowDetails(true)
          }, '👎 Нет'),
          h('button', {
            className: 'feedback-widget__btn feedback-widget__btn--skip',
            onClick: () => setSubmitted(true)
          }, 'Пропустить')
        ),

        showDetails && h('div', { className: 'feedback-widget__details' },
          h('textarea', {
            className: 'feedback-widget__textarea',
            placeholder: 'Что пошло не так? (опционально)',
            value: detailText,
            onChange: (e) => setDetailText(e.target.value),
            rows: 2
          }),
          h('button', {
            className: 'feedback-widget__submit',
            onClick: () => handleFeedback(false)
          }, 'Отправить')
        ),

        stats.total > 0 && h('div', { className: 'feedback-widget__stats' },
          `📊 Отзывов: ${stats.total} • Точность: ${stats.accuracy}%`
        )
      );
    }

    /**
     * FeedbackPrompt — inline prompt для конкретного прогноза
     * Меньше чем FeedbackWidget, встраивается в карточки
     */
    function FeedbackPrompt({ predictionId, type, compact = false }) {
      const [voted, setVoted] = useState(false);

      const handleVote = (correct) => {
        if (HEYS.Metabolic?.submitFeedback) {
          HEYS.Metabolic.submitFeedback(predictionId, correct, { type });
        }
        setVoted(true);
      };

      if (voted) {
        return h('span', { className: 'feedback-prompt feedback-prompt--voted' }, '✓');
      }

      return h('div', { className: `feedback-prompt ${compact ? 'feedback-prompt--compact' : ''}` },
        h('button', {
          className: 'feedback-prompt__btn feedback-prompt__btn--up',
          onClick: () => handleVote(true),
          title: 'Прогноз точный'
        }, '👍'),
        h('button', {
          className: 'feedback-prompt__btn feedback-prompt__btn--down',
          onClick: () => handleVote(false),
          title: 'Прогноз неточный'
        }, '👎')
      );
    }

    /**
     * AccuracyBadge — бейдж с точностью системы
     */
    function AccuracyBadge() {
      const stats = useMemo(() => {
        if (HEYS.Metabolic?.getFeedbackStats) {
          return HEYS.Metabolic.getFeedbackStats();
        }
        return { total: 0, accuracy: 0 };
      }, []);

      if (stats.total < 5) return null;

      const color = stats.accuracy >= 80 ? '#22c55e' : stats.accuracy >= 60 ? '#eab308' : '#ef4444';

      return h('div', {
        className: 'accuracy-badge',
        style: { borderColor: color },
        title: `На основе ${stats.total} отзывов`
      },
        h('span', { className: 'accuracy-badge__icon' }, '🎯'),
        h('span', { className: 'accuracy-badge__value', style: { color } }, `${stats.accuracy}%`),
        h('span', { className: 'accuracy-badge__label' }, 'точность')
      );
    }

    // Legacy PredictiveDashboard wrapper for backward compatibility (stub for now)
    function PredictiveDashboardLegacy({ lsGet, profile, selectedDate }) {
      // Legacy stub - main dashboard logic in main file
      return null;
    }

    /**
     * DataCompletenessCard — показывает прогресс сбора данных
     * и какие фичи разблокируются с накоплением истории
     */
    function DataCompletenessCard({ lsGet, profile, daysRequired = 30 }) {
      const completeness = useMemo(() => {
        if (!HEYS.Metabolic?.getDaysHistory) return null;

        const history = HEYS.Metabolic.getDaysHistory(daysRequired);
        const daysWithData = history.length;
        const percentage = Math.round((daysWithData / daysRequired) * 100);
        const daysRemaining = Math.max(0, daysRequired - daysWithData);

        // Проверяем полноту последнего дня (сегодня)
        const today = new Date().toISOString().split('T')[0];
        const inventory = HEYS.Metabolic.inventoryData ? HEYS.Metabolic.inventoryData(today) : null;
        const todayCompleteness = inventory ? HEYS.Metabolic.calculateDataCompleteness(inventory) : 0;

        // 🆕 v3.22.0: Extended Analytics features с научными обоснованиями
        const features = [
          { name: 'Базовый статус', required: 1, emoji: '📊', unlocked: daysWithData >= 1 },
          { name: 'Риск срыва', required: 3, emoji: '⚠️', unlocked: daysWithData >= 3 },
          { name: 'Паттерны', required: 7, emoji: '🔍', unlocked: daysWithData >= 7 },
          {
            name: '🧠 Эмоц. риск',
            required: 7,
            emoji: '🧠',
            unlocked: daysWithData >= 7,
            pmid: '11070333',
            science: 'Epel 2001 — стресс-переедание'
          },
          {
            name: '🥩 Белковый долг',
            required: 7,
            emoji: '🥩',
            unlocked: daysWithData >= 7,
            pmid: '20095013',
            science: 'Mettler 2010 — белок при дефиците'
          },
          { name: 'Персональные пороги', required: 14, emoji: '🎯', unlocked: daysWithData >= 14 },
          {
            name: '🔬 Циркадный контекст',
            required: 14,
            emoji: '🌅',
            unlocked: daysWithData >= 14,
            pmid: '9331550',
            science: 'Van Cauter 1997 — циркадные ритмы'
          },
          { name: 'Метаболический фенотип', required: 30, emoji: '🧬', unlocked: daysWithData >= 30 }
        ];

        const nextFeature = features.find(f => !f.unlocked);

        // 🆕 Считаем сколько extended analytics разблокировано
        const extendedFeatures = features.filter(f => f.pmid);
        const extendedUnlocked = extendedFeatures.filter(f => f.unlocked).length;
        const extendedTotal = extendedFeatures.length;

        return {
          daysWithData,
          daysRequired,
          percentage,
          daysRemaining,
          todayCompleteness,
          features,
          nextFeature,
          extendedUnlocked,
          extendedTotal
        };
      }, [lsGet, daysRequired]);

      if (!completeness) {
        return null;
      }

      return h('div', { className: 'data-completeness-card' },
        h('div', { className: 'data-completeness-card__header' },
          h('span', { className: 'data-completeness-card__icon' }, '📊'),
          h('span', { className: 'data-completeness-card__title' }, 'Данные'),
          h('span', { className: 'data-completeness-card__count' },
            `${completeness.daysWithData}/${completeness.daysRequired} дней`
          )
        ),

        // Прогресс-бар
        h('div', { className: 'data-completeness-card__progress' },
          h('div', { className: 'data-completeness-card__progress-bar' },
            h('div', {
              className: 'data-completeness-card__progress-fill',
              style: { width: `${completeness.percentage}%` }
            })
          ),
          h('span', { className: 'data-completeness-card__progress-text' }, `${completeness.percentage}%`)
        ),

        // Сегодняшняя полнота
        h('div', { className: 'data-completeness-card__today' },
          h('span', { className: 'data-completeness-card__today-label' }, 'Сегодня: '),
          h('span', {
            className: `data-completeness-card__today-value data-completeness-card__today-value--${completeness.todayCompleteness >= 80 ? 'high' : completeness.todayCompleteness >= 50 ? 'medium' : 'low'}`
          }, `${completeness.todayCompleteness}% заполнено`)
        ),

        // 🆕 v3.22.0: Extended Analytics Status
        h('div', { className: 'data-completeness-card__extended' },
          h('span', { className: 'data-completeness-card__extended-label' }, '🧠 Extended Analytics: '),
          h('span', {
            className: `data-completeness-card__extended-value data-completeness-card__extended-value--${completeness.extendedUnlocked === completeness.extendedTotal ? 'complete' : 'partial'}`
          }, `${completeness.extendedUnlocked}/${completeness.extendedTotal}`),
          completeness.extendedUnlocked === completeness.extendedTotal && h('span', { className: 'data-completeness-card__extended-badge' }, '✓')
        ),

        // Следующая разблокировка
        completeness.nextFeature && h('div', { className: 'data-completeness-card__next' },
          h('span', { className: 'data-completeness-card__next-emoji' }, completeness.nextFeature.emoji),
          h('span', { className: 'data-completeness-card__next-text' },
            `${completeness.nextFeature.name} через ${completeness.nextFeature.required - completeness.daysWithData} дн.`
          ),
          completeness.nextFeature.pmid && h('a', {
            href: `https://pubmed.ncbi.nlm.nih.gov/${completeness.nextFeature.pmid}/`,
            target: '_blank',
            className: 'data-completeness-card__next-pmid',
            title: completeness.nextFeature.science
          }, '🔬')
        ),

        // Разблокированные фичи (иконки) — 🆕 с tooltip для extended
        h('div', { className: 'data-completeness-card__features' },
          completeness.features.map((feature, idx) =>
            h('div', {
              key: idx,
              className: `data-completeness-card__feature ${feature.unlocked ? 'data-completeness-card__feature--unlocked' : ''} ${feature.pmid ? 'data-completeness-card__feature--science' : ''}`,
              title: `${feature.name} (${feature.required} дней)${feature.science ? '\n' + feature.science : ''}`
            }, feature.emoji)
          )
        )
      );
    }

    /**
     * MealTimingCard v2 — WOW дизайн с timeline и иконками
     */
    function MealTimingCard({ lsGet, profile, selectedDate }) {
      const timing = useMemo(() => {
        if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;

        const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(7) : [];

        return HEYS.Metabolic.calculatePerformanceForecast(
          selectedDate || new Date().toISOString().split('T')[0],
          profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          history
        );
      }, [lsGet, profile, selectedDate]);

      if (!timing || !timing.optimalMeals) {
        return null;
      }

      // Конфиг иконок и цветов для типов приёмов
      const mealConfig = {
        'Завтрак': { icon: '🌅', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', lightBg: '#fef3c7' },
        'Обед': { icon: '☀️', gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', lightBg: '#d1fae5' },
        'Ужин': { icon: '🌙', gradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)', lightBg: '#e0e7ff' },
        'Перекус': { icon: '🍎', gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)', lightBg: '#fce7f3' }
      };

      const getMealConfig = (name) => {
        for (const [key, config] of Object.entries(mealConfig)) {
          if (name.toLowerCase().includes(key.toLowerCase())) return config;
        }
        return { icon: '🍽️', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', lightBg: '#f1f5f9' };
      };

      // Вычисляем текущее время для индикатора "сейчас"
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      return h('div', { className: 'meal-timing-v2' },
        // Header с градиентом
        h('div', { className: 'meal-timing-v2__header' },
          h('div', { className: 'meal-timing-v2__header-icon' }, '⏰'),
          h('div', { className: 'meal-timing-v2__header-content' },
            h('h3', { className: 'meal-timing-v2__title' }, 'Твой идеальный день'),
            h('p', { className: 'meal-timing-v2__subtitle' }, 'Персональное расписание на основе твоего ритма')
          )
        ),

        // Timeline с приёмами
        h('div', { className: 'meal-timing-v2__timeline' },
          timing.optimalMeals.filter(m => m.priority !== 'low').map((meal, idx, arr) => {
            const config = getMealConfig(meal.name);
            const [startHour] = meal.time.split('-')[0].split(':').map(Number);
            const isNow = currentHour >= startHour && currentHour < startHour + 2;
            const isPast = currentHour > startHour + 2;

            return h('div', {
              key: idx,
              className: `meal-timing-v2__item ${isNow ? 'meal-timing-v2__item--active' : ''} ${isPast ? 'meal-timing-v2__item--past' : ''}`
            },
              // Timeline connector
              idx < arr.length - 1 && h('div', { className: 'meal-timing-v2__connector' }),

              // Time badge
              h('div', { className: 'meal-timing-v2__time-badge', style: { background: config.gradient } },
                h('span', { className: 'meal-timing-v2__time' }, meal.time.split('-')[0])
              ),

              // Card content
              h('div', { className: 'meal-timing-v2__card', style: { '--accent-bg': config.lightBg } },
                h('div', { className: 'meal-timing-v2__card-header' },
                  h('span', { className: 'meal-timing-v2__card-icon' }, config.icon),
                  h('div', { className: 'meal-timing-v2__card-title' },
                    h('span', { className: 'meal-timing-v2__card-name' }, meal.name),
                    isNow && h('span', { className: 'meal-timing-v2__now-badge' }, '● СЕЙЧАС')
                  )
                ),
                h('div', { className: 'meal-timing-v2__card-body' },
                  h('p', { className: 'meal-timing-v2__card-focus' }, meal.focus),
                  h('div', { className: 'meal-timing-v2__card-meta' },
                    h('span', { className: 'meal-timing-v2__card-pct' },
                      h('span', { className: 'meal-timing-v2__pct-value' }, `${meal.caloriesPct}%`),
                      ' дневных ккал'
                    ),
                    meal.priority === 'high' && h('span', { className: 'meal-timing-v2__priority-badge' }, '⭐ Важно')
                  )
                )
              )
            );
          })
        ),

        // Тренировочное окно (если есть)
        timing.trainingWindow && h('div', { className: 'meal-timing-v2__training' },
          h('div', { className: 'meal-timing-v2__training-icon' }, '💪'),
          h('div', { className: 'meal-timing-v2__training-content' },
            h('div', { className: 'meal-timing-v2__training-title' }, 'Пик силы и выносливости'),
            h('div', { className: 'meal-timing-v2__training-time' }, timing.trainingWindow.time),
            h('div', { className: 'meal-timing-v2__training-reason' }, timing.trainingWindow.reason)
          )
        ),

        // Sleep impact chip
        h('div', { className: `meal-timing-v2__sleep meal-timing-v2__sleep--${timing.sleepImpact}` },
          h('span', { className: 'meal-timing-v2__sleep-icon' },
            timing.sleepImpact === 'positive' ? '😴' : '⚠️'
          ),
          h('span', { className: 'meal-timing-v2__sleep-text' },
            timing.sleepImpact === 'positive'
              ? 'Сон в норме — энергия стабильна весь день'
              : 'Недосып — рекомендуем лёгкий день'
          ),
          timing.sleepImpact === 'positive' && h('span', { className: 'meal-timing-v2__sleep-check' }, '✓')
        )
      );
    }

    /**
     * 🆕 Early Warning Badge — notification badge for health warnings
     * v3.5.0: Integrated with pi_early_warning.js module
     */
    function EarlyWarningBadge({ onClick }) {
      const [warnings, setWarnings] = useState([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        loadWarnings();
        // Refresh every 5 minutes
        const interval = setInterval(loadWarnings, 5 * 60 * 1000);
        return () => clearInterval(interval);
      }, []);

      function loadWarnings() {
        try {
          const earlyWarning = HEYS.InsightsPI?.earlyWarning;
          if (!earlyWarning || typeof earlyWarning.detect !== 'function') {
            devWarn('[EarlyWarningBadge] earlyWarning module not loaded');
            setLoading(false);
            return;
          }

          const U = window.HEYS?.utils;
          const getter = U?.lsGet || ((k, d) => {
            try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
          });
          const days = Object.keys(localStorage)
            .filter(k => k.startsWith('heys_dayv2_'))
            .map(k => getter(k, {}))
            .filter(d => d && d.date);
          const profile = getter('heys_profile', {});
          const pIndex = window.HEYS?.products?.getIndex?.();

          const result = earlyWarning.detect(days, profile, pIndex);
          devLog('[EarlyWarningBadge] Detected warnings:', result);

          if (result.available) {
            setWarnings(result.warnings || []);
          }
        } catch (error) {
          devWarn('[EarlyWarningBadge] Error detecting warnings:', error);
        } finally {
          setLoading(false);
        }
      }

      const warningCount = warnings.length;
      if (warningCount === 0 || loading) return null;

      const severityColors = {
        high: 'bg-red-500 text-white',
        medium: 'bg-yellow-500 text-white',
        low: 'bg-gray-400 text-white'
      };

      const highCount = warnings.filter(w => w.severity === 'high').length;
      const mediumCount = warnings.filter(w => w.severity === 'medium').length;
      const badgeColor = highCount > 0 ? 'bg-red-500' : 'bg-yellow-500';

      return h('button', {
        className: `relative px-3 py-1.5 rounded-lg ${badgeColor} text-white text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity`,
        onClick: onClick,
        'aria-label': `${warningCount} health warnings`
      },
        h('span', { className: 'text-lg' }, '🚨'),
        h('span', null, warningCount),
        (highCount > 0 || mediumCount > 0) && h('div', { className: 'absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs font-bold text-red-600' },
          highCount || mediumCount
        )
      );
    }

    /**
     * 🆕 Early Warning Panel — detailed view of health warnings
     * v3.5.0: Integrated with pi_early_warning.js module
     */
    function EarlyWarningPanel({ warnings, onClose }) {
      if (!warnings || warnings.length === 0) {
        return h('div', { className: 'early-warning-panel' },
          h('div', { className: 'text-center p-8 text-gray-500' },
            h('div', { className: 'text-4xl mb-2' }, '✅'),
            h('div', { className: 'text-lg font-medium' }, 'All clear!'),
            h('div', { className: 'text-sm mt-1' }, 'No health warnings detected')
          )
        );
      }

      const grouped = warnings.reduce((acc, w) => {
        acc[w.severity] = acc[w.severity] || [];
        acc[w.severity].push(w);
        return acc;
      }, {});

      const severityOrder = ['high', 'medium', 'low'];
      const severityConfig = {
        high: { icon: '🔴', label: 'High Priority', border: 'border-red-500', bg: 'bg-red-50' },
        medium: { icon: '🟡', label: 'Medium Priority', border: 'border-yellow-500', bg: 'bg-yellow-50' },
        low: { icon: '⚪', label: 'Low Priority', border: 'border-gray-400', bg: 'bg-gray-50' }
      };

      return h('div', { className: 'early-warning-panel space-y-4 p-6 bg-white rounded-lg shadow-lg max-w-2xl mx-auto' },
        // Header
        h('div', { className: 'flex items-center justify-between mb-4' },
          h('h3', { className: 'text-xl font-bold text-gray-900' }, '🚨 Health Warnings'),
          onClose && h('button', {
            onClick: onClose,
            className: 'text-gray-400 hover:text-gray-600'
          }, '✕')
        ),

        // Grouped warnings by severity
        severityOrder.filter(s => grouped[s]).map(severity => {
          const config = severityConfig[severity];
          return h('div', { key: severity, className: `border-l-4 ${config.border} ${config.bg} p-4 rounded-r-lg space-y-3` },
            h('div', { className: 'flex items-center gap-2 font-medium text-gray-900 mb-2' },
              h('span', null, config.icon),
              h('span', null, config.label),
              h('span', { className: 'text-sm text-gray-500' }, `(${grouped[severity].length})`)
            ),

            grouped[severity].map((warning, idx) =>
              h('div', { key: idx, className: 'bg-white p-3 rounded border border-gray-200' },
                h('div', { className: 'font-medium text-gray-900 mb-1' }, warning.message),
                h('div', { className: 'text-sm text-gray-600 mb-2' }, warning.detail),
                warning.action && h('button', {
                  className: 'text-sm text-blue-600 hover:text-blue-800 font-medium',
                  onClick: () => devLog('[EarlyWarning] Action clicked:', warning.action)
                }, `→ ${warning.action}`)
              )
            )
          );
        })
      );
    }

    // === EXPORT ===
    HEYS.InsightsPI = HEYS.InsightsPI || {};
    HEYS.InsightsPI.uiDashboard = {
      // Main entry points
      InsightsTab,
      PredictiveDashboard,
      // Weekly/Weight
      WeeklyWrap,
      WeightPrediction,
      // Filters & Bars
      PriorityFilterBar,
      PillarBreakdownBars,
      // Risk components
      DualRiskPanel,
      RiskPanel,
      RiskMeter,
      // Forecast & Feedback
      ForecastPanel,
      FeedbackPrompt,
      FeedbackWidget,
      AccuracyBadge,
      // Legacy
      PredictiveDashboardLegacy,
      EmptyState,
      // Cards
      MealTimingCard,
      DataCompletenessCard,
      InsightsCard,
      // Badges
      PriorityBadge,
      CategoryBadge,
      ActionabilityBadge,
      ConfidenceBadge,
      // UI helpers
      SectionHeader,
      InfoButton,
      MetricWithInfo,
      // Metabolic cards
      MetabolicStatusCard,
      ReasonCard,
      ActionCard,
      // 🆕 v3.5.0: Early Warning System (EWS)
      EarlyWarningBadge,
      EarlyWarningPanel
    };

    // Backward compatibility fallback
    window.piUIDashboard = HEYS.InsightsPI.uiDashboard;

    devLog('[PI UI Dashboard] v3.0.1 loaded —', Object.keys(HEYS.InsightsPI.uiDashboard).length, 'dashboard components');
  }

  // Start initialization (will retry until React is available)
  initModule();

})(window);
