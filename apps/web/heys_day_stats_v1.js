// heys_day_stats_v1.js — Stats block rendering component
// Extracted from heys_day_v12.js (PR-1: Step 2/3)
// Renders statistics card with energy, macros, sparklines, weight tracking

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  /**
   * Render stats block
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.vm - View model from buildStatsVm()
   * @param {Object} params.actions - Action handlers
   * @param {Object} params.data - Additional data not in VM (for gradual migration)
   * @returns {ReactElement} Stats block element
   */
  function renderStatsBlock({ React, vm, actions, data }) {
    if (!React) {
      try {
        if (HEYS?.analytics?.trackError) {
          HEYS.analytics.trackError(new Error('renderStatsBlock guard: React_missing'), {
            module: 'heys_day_stats_v1',
            reason: 'React_missing'
          });
        }
      } catch (e) { }
      return null;
    }

    const {
      openExclusivePopup,
      haptic,
      setDay,
      handlePeriodChange,
      setChartPeriod,
      setBalanceCardExpanded,
      r0,
      r1,
      setSparklinePopup,
      setWeekNormPopup,
      setWeekDeficitPopup,
      setBalanceDayPopup,
      setTdeePopup,
      setTefInfoPopup,
      setGoalPopup,
      setDebtSciencePopup,
      setMetricPopup,
      setMacroBadgePopup,
      setDate,
      setToastVisible,
      setAdviceTrigger,
      setMealChartHintShown,
      setShowConfetti,
      setInsulinExpanded,
      openWeightPicker,
      openDeficitPicker,
      setMealQualityPopup
    } = actions;

    const reportGuardError = (reason, extra) => {
      try {
        if (HEYS?.analytics?.trackError) {
          HEYS.analytics.trackError(new Error('renderStatsBlock guard: ' + reason), {
            module: 'heys_day_stats_v1',
            reason,
            ...(extra || {})
          });
        }
      } catch (e) { }
    };

    const renderGuardPlaceholder = (title, text) => (
      React.createElement('div', { className: 'empty-state' },
        React.createElement('div', { className: 'empty-state-icon' }, '📊'),
        React.createElement('div', { className: 'empty-state-title' }, title),
        React.createElement('div', { className: 'empty-state-text' }, text)
      )
    );

    if (!vm || !vm.energy || !vm.progress || !vm.debt || !vm.computed || !vm.ui || !vm.context) {
      reportGuardError('vm_missing', { hasVm: !!vm });
      return renderGuardPlaceholder('Статистика недоступна', 'Данные ещё загружаются или VM не инициализирован.');
    }

    const dataSafe = data || {};
    const { helpers, deps } = dataSafe;
    if (!helpers || !deps) {
      reportGuardError('deps_container_missing', { hasHelpers: !!helpers, hasDeps: !!deps });
      return renderGuardPlaceholder('Статистика недоступна', 'Не удалось получить зависимости для рендера.');
    }

    const { renderSparkline, renderWeightSparkline } = helpers;
    if (!renderSparkline || !renderWeightSparkline) {
      reportGuardError('helpers_missing', { hasRenderSparkline: !!renderSparkline, hasRenderWeightSparkline: !!renderWeightSparkline });
      return renderGuardPlaceholder('Статистика недоступна', 'Графики ещё не готовы к отрисовке.');
    }

    const {
      energy: vmEnergy,
      progress: vmProgress,
      debt: vmDebt,
      computed: vmComputed,
      ui: vmUi,
      context: vmContext
    } = vm;

    const day = vmContext.day;
    const prof = vmContext.prof;
    const dayTot = vmContext.dayTot;
    const normAbs = vmContext.normAbs;

    const {
      U,
      pIndex,
      lsGet,
      PopupWithBackdrop,
      createSwipeHandlers,
      getSmartPopupPosition,
      ReactDOM,
      ratioZones,
      Refeed,
      TEF,
      Day,
      showCheckin,
      App,
      openProfileModal
    } = deps;

    if (!PopupWithBackdrop || !createSwipeHandlers || !getSmartPopupPosition || !ReactDOM) {
      reportGuardError('deps_missing', {
        hasPopupWithBackdrop: !!PopupWithBackdrop,
        hasCreateSwipeHandlers: !!createSwipeHandlers,
        hasGetSmartPopupPosition: !!getSmartPopupPosition,
        hasReactDOM: !!ReactDOM
      });
      return renderGuardPlaceholder('Статистика недоступна', 'Компоненты UI ещё не инициализированы.');
    }

    const optimum = vmEnergy.optimum;
    const displayOptimum = vmEnergy.displayOptimum;
    const displayRemainingKcal = vmEnergy.displayRemainingKcal;
    const tdee = vmEnergy.tdee;
    const bmr = vmEnergy.bmr;
    const eatenKcal = vmEnergy.eatenKcal;
    const stepsK = vmEnergy.stepsKcal;
    const householdK = vmEnergy.householdKcal;
    const train1k = vmEnergy.training?.zone1 || 0;
    const train2k = vmEnergy.training?.zone2 || 0;
    const train3k = vmEnergy.training?.zone3 || 0;
    const tefKcal = vmEnergy.tefKcal;
    const dayTargetDef = vmEnergy.deficitPct;
    const baseExpenditure = vmEnergy.baseExpenditure;
    const weight = vmProgress.weight;
    const caloricDebt = vmDebt.caloricDebt;
    const sparklineData = vmProgress.sparklineData;
    const currentRatio = vmProgress.currentRatio;
    const displayRatioStatus = vmComputed.ratioStatus;
    const cycleDay = vmDebt.cycleDay;
    const ndteData = vmDebt.ndteData;
    const tefData = vmDebt.tefData;
    const chartPeriod = vmProgress.chartPeriod || 7;
    const balanceCardExpanded = vmUi.balanceCardExpanded;
    const showConfetti = vmUi.showConfetti;
    const shakeEaten = vmUi.shakeEaten;
    const shakeOver = vmUi.shakeOver;
    const displayTdee = vmComputed.displayTdee;
    const displayHeroOptimum = vmComputed.displayHeroOptimum;
    const displayHeroEaten = vmComputed.displayHeroEaten;
    const displayHeroRemaining = vmComputed.displayHeroRemaining;
    const weightSparklineData = vmProgress.weightSparklineData;
    const weightTrend = vmProgress.weightTrend;
    const kcalTrend = vmProgress.kcalTrend;
    const monthForecast = vmProgress.monthForecast;
    const cycleHistoryAnalysis = vmProgress.cycleHistoryAnalysis;
    const weekHeatmapData = vmProgress.weekHeatmapData;
    const mealsChartData = vmProgress.mealsChartData;
    const sparklinePopup = vmUi.sparklinePopup;
    const weekNormPopup = vmUi.weekNormPopup;
    const weekDeficitPopup = vmUi.weekDeficitPopup;
    const balanceDayPopup = vmUi.balanceDayPopup;
    const tdeePopup = vmUi.tdeePopup;
    const tefInfoPopup = vmUi.tefInfoPopup;
    const goalPopup = vmUi.goalPopup;
    const debtSciencePopup = vmUi.debtSciencePopup;
    const metricPopup = vmUi.metricPopup;
    const macroBadgePopup = vmUi.macroBadgePopup;
    const chartTransitioning = vmUi.chartTransitioning;
    const mealChartHintShown = vmUi.mealChartHintShown;
    const newMealAnimatingIndex = vmUi.newMealAnimatingIndex;
    const showFirstPerfectAchievement = vmUi.showFirstPerfectAchievement;
    const insulinExpanded = vmUi.insulinExpanded;
    const currentDeficit = vmProgress.currentDeficit;
    const profileDeficit = vmProgress.profileDeficit;
    const date = vmProgress.date;
    const insulinWaveData = vmProgress.insulinWaveData;
    const balanceViz = vmProgress.balanceViz;
    const isMobile = vmUi.isMobile;
    const mobileSubTab = vmUi.mobileSubTab;
    const eatenCol = vmComputed.eatenColor;
    const displayRemainCol = vmComputed.remainingColor;
    const metricPopupMeta = vmComputed.metricPopupMeta;
    const macroPopupMeta = vmComputed.macroPopupMeta;
    const weekDeficitPopupMeta = vmComputed.weekDeficitPopupMeta;
    const excessStyleMeta = vmComputed.excessStyleMeta;
    const excessCardMeta = vmComputed.excessCardMeta;
    const excessSciencePopupMeta = vmComputed.excessSciencePopupMeta;
    const balanceInsightsMeta = vmComputed.balanceInsightsMeta || [];
    const balanceDayPopupMeta = vmComputed.balanceDayPopupMeta;
    const weightPopupMeta = vmComputed.weightPopupMeta;
    const weightForecastPopupMeta = vmComputed.weightForecastPopupMeta;
    const tefInfoPopupMeta = vmComputed.tefInfoPopupMeta;
    const debtSciencePopupMeta = vmComputed.debtSciencePopupMeta;
    const weekNormPopupMeta = vmComputed.weekNormPopupMeta;
    const weekHeatmapDaysMeta = vmComputed.weekHeatmapDaysMeta || null;
    const heroCardsMeta = vmComputed.heroCardsMeta;
    const debtCardMeta = vmComputed.debtCardMeta;
    const insightRowsMeta = vmComputed.insightRowsMeta;
    const dayScoreStyleMeta = vmComputed.dayScoreStyleMeta;
    const progressGradient = vmComputed.progressGradient;
    const heatmapDayStyleMeta = vmComputed.heatmapDayStyleMeta;
    const sparklinePerfectPopupMeta = vmComputed.sparklinePerfectPopupMeta;
    const popupPositionStyle = vmComputed.popupPositionStyle;

    const weekHeatmapDates = (weekHeatmapDaysMeta || []).map((d) => d.date).filter(Boolean);

    const selectDateWithPrefetch = (nextDate, options = {}) => {
      if (!nextDate) return;
      const prefetchDates = Array.isArray(options.prefetchDates) && options.prefetchDates.length
        ? options.prefetchDates
        : [nextDate];

      try {
        if (Day?.requestFlush) Day.requestFlush({ force: true });
      } catch (e) { }

      const applyDate = () => {
        setDate(nextDate);
        haptic('light');
      };

      if (HEYS?.cloud?.fetchDays && prefetchDates.length > 0) {
        HEYS.cloud.fetchDays(prefetchDates)
          .then(() => applyDate())
          .catch(() => applyDate());
        return;
      }

      applyDate();
    };

    const statsBlock = React.createElement('div', { className: 'compact-stats compact-card widget-shadow-diary-glass widget-outline-diary-glass' },
      React.createElement('div', { className: 'compact-card-header stats-header-with-badge' },
        React.createElement('span', null, '📊 СТАТИСТИКА'),
        React.createElement('span', {
          className: 'ratio-status-badge' + (displayRatioStatus.emoji === '🔥' ? ' perfect' : ''),
          style: vmComputed.ratioBadgeStyle
        }, displayRatioStatus.emoji + ' ' + displayRatioStatus.text)
      ),
      // 4 карточки метрик внутри статистики
      React.createElement('div', { className: 'metrics-cards', id: 'tour-hero-stats' },
        // Затраты (TDEE) — кликабельная для расшифровки
        React.createElement('div', {
          className: 'metrics-card',
          style: heroCardsMeta.tdeeCardStyle,
          title: 'Нажми для расшифровки затрат',
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openExclusivePopup('tdee', {
              x: rect.left + rect.width / 2,
              y: rect.bottom,
              data: {
                bmr,
                stepsK,
                householdK,
                train1k,
                train2k,
                train3k,
                tefKcal,
                tdee,
                weight,
                steps: day.steps || 0,
                householdMin: day.householdMin || 0,
                trainings: day.trainings || [],
                // 🆕 v3.20.0: Extended analytics for TDEE popup
                ndteData: caloricDebt?.ndteData,
                bmiContext: caloricDebt?.bmiContext
              }
            });
            haptic('light');
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '⚡'),
          React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.tdeeValueStyle }, displayTdee),
          React.createElement('div', { className: 'metrics-label' }, 'Затраты')
        ),
        // Цель — кликабельная для показа формулы
        React.createElement('div', {
          className: 'metrics-card' + (day.isRefeedDay ? ' metrics-card--refeed' : ''),
          style: heroCardsMeta.goalCardStyle,
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openExclusivePopup('goal', {
              x: rect.left + rect.width / 2,
              y: rect.bottom,
              data: {
                baseExpenditure,
                deficitPct: dayTargetDef,
                baseOptimum: optimum,
                dailyBoost: caloricDebt?.dailyBoost || 0,
                displayOptimum: displayHeroOptimum,
                isRefeedDay: day.isRefeedDay,
                refeedBoost: caloricDebt?.refeedBoost || 0
              }
            });
            haptic('light');
          },
          title: 'Нажми чтобы узнать как считается цель'
        },
          React.createElement('div', { className: 'metrics-icon' }, '🎯'),
          React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.goalValueStyle }, displayHeroOptimum),
          React.createElement('div', { className: 'metrics-label' },
            'Цель (' + dayTargetDef + '%)' + (heroCardsMeta.goalLabelSuffix || '')
          ),
          // 🍕 Refeed hint (как в "Осталось")
          day.isRefeedDay && React.createElement('div', {
            className: 'metrics-refeed-hint',
            style: heroCardsMeta.refeedHintStyle
          }, '🍕 загрузка +35%')
        ),
        // Съедено
        React.createElement('div', {
          className: 'metrics-card' + (shakeEaten ? ' shake-excess' : ''),
          style: heroCardsMeta.getEatenCardStyle(eatenCol),
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openExclusivePopup('metric', {
              type: 'kcal',
              x: rect.left + rect.width / 2,
              y: rect.top,
              data: {
                eaten: displayHeroEaten,
                goal: displayHeroOptimum,
                remaining: displayHeroRemaining,
                ratio: currentRatio,
                deficitPct: dayTargetDef
              }
            });
            haptic('light');
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '🍽️'),
          React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.getEatenValueStyle(eatenCol) }, r0(displayHeroEaten)),
          React.createElement('div', { className: 'metrics-label' }, 'Съедено')
        ),
        // Осталось / Перебор (с учётом displayRemainingKcal)
        (() => {
          // 🆕 Refeed day микро-объяснение
          const isRefeedDay = day?.isRefeedDay === true;
          const refeedMeta = isRefeedDay && Refeed?.getDayMeta ? Refeed.getDayMeta(day, currentRatio) : null;

          return React.createElement('div', {
            className: 'metrics-card' + (shakeOver && displayHeroRemaining < 0 ? ' shake-excess' : '') + (isRefeedDay ? ' metrics-card--refeed' : ''),
            style: heroCardsMeta.getRemainingCardStyle(displayRemainCol),
            title: refeedMeta?.tooltip || ''
          },
            React.createElement('div', { className: 'metrics-icon' }, displayHeroRemaining >= 0 ? '🎯' : '🚫'),
            React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.getRemainingValueStyle(displayRemainCol) },
              displayHeroRemaining >= 0 ? displayHeroRemaining : Math.abs(displayHeroRemaining)
            ),
            React.createElement('div', { className: 'metrics-label' },
              displayHeroRemaining >= 0 ? 'Осталось' : 'Перебор'
            ),
            // 🆕 Refeed day hint
            isRefeedDay && React.createElement('div', {
              className: 'metrics-refeed-hint',
              style: heroCardsMeta.refeedHintStyle
            }, '🍕 загрузка +35%')
          );
        })()
      ),
      // Спарклайн калорий — карточка в стиле веса
      // Вычисляем статистику для badge здесь (до рендера)
      (() => {
        const sparklinePeriodMeta = vmComputed.sparklinePeriodMeta;
        const deficitBadgeClass = sparklinePeriodMeta.deficitBadgeClass || 'sparkline-goal-badge';
        const deficitText = sparklinePeriodMeta.deficitText || '';
        const tooltipText = sparklinePeriodMeta.tooltipText || '';

        const renderData = vmProgress.sparklineRenderData || sparklineData;

        return React.createElement('div', { className: 'kcal-sparkline-container', id: 'tour-calorie-graph' },
          React.createElement('div', { className: 'kcal-sparkline-header' },
            React.createElement('span', { className: 'kcal-sparkline-title' }, '📊 Калории'),
            // Period Pills
            React.createElement('div', { className: 'kcal-header-right' },
              // Кнопки выбора периода
              React.createElement('div', { className: 'kcal-period-pills' },
                [7, 14, 30].map(period =>
                  React.createElement('button', {
                    key: period,
                    className: 'kcal-period-pill' + (chartPeriod === period ? ' active' : ''),
                    onClick: () => handlePeriodChange(period)
                  }, period + 'д')
                )
              )
            )
          ),
          React.createElement('div', {
            className: chartTransitioning ? 'sparkline-transitioning' : '',
            style: vmComputed.sparklineContainerStyle
          },
            // 🔧 FIX: Используем displayOptimum (с учётом долга) для линии цели
            renderSparkline(renderData, displayOptimum)
          )
        );
      })(),
      // === CALORIC DEBT CARD v2 — Чистая и понятная карточка долга ===
      caloricDebt && caloricDebt.hasDebt && (() => {
        const { debt, effectiveDebt, recoveryDays, dailyBoost, adjustedOptimum, needsRefeed, refeedBoost, refeedOptimum, dayBreakdown, daysToRecover, recoveryDayName } = caloricDebt;
        const debtDaysMeta = vmComputed.debtDaysMeta || dayBreakdown || [];

        // Цвет по уровню долга
        const accentColor = debtCardMeta.accentColor || '#3b82f6';

        // Popup науки
        const showSciencePopup = (e) => {
          e.stopPropagation();
          openExclusivePopup('debt-science', {
            title: '🔬 Как работает восстановление',
            content: [
              { label: 'Почему не 100%?', value: 'Организм адаптируется к дефициту, снижая метаболизм на ~15% (Leibel 1995). Компенсировать весь долг — перебор.' },
              { label: 'Почему ' + recoveryDays + ' дня?', value: debt < 300 ? 'Маленький долг (<300 ккал) — можно закрыть за 1 день без стресса.' : debt < 700 ? 'Средний долг (300-700 ккал) — оптимально 2 дня для плавного восстановления.' : 'Большой долг (>700 ккал) — 3 дня чтобы не перегружать ЖКТ и метаболизм.' },
              { label: 'Формула', value: effectiveDebt + ' ккал (75% от ' + debt + ') ÷ ' + recoveryDays + ' дн = +' + dailyBoost + ' ккал/день' }
            ],
            links: [
              { text: 'Leibel 1995', url: 'https://pubmed.ncbi.nlm.nih.gov/7632212/' },
              { text: 'Hall 2011', url: 'https://pubmed.ncbi.nlm.nih.gov/21872751/' }
            ]
          });
        };

        const showDebtInfo = (e) => {
          e.stopPropagation();
          if (HEYS?.Toast?.info) {
            HEYS.Toast.info('Долг считается от базовой нормы (без бонуса долга и refeed). На графике — цель дня с учётом бонусов.', {
              title: 'ℹ️ Пояснение'
            });
          } else if (typeof HEYS?.toast === 'function') {
            HEYS.toast({
              type: 'info',
              title: 'ℹ️ Пояснение',
              message: 'Долг считается от базовой нормы (без бонуса долга и refeed). На графике — цель дня с учётом бонусов.'
            });
          }
        };

        return React.createElement('div', {
          className: 'debt-card' + (balanceCardExpanded ? ' expanded' : ''),
          onClick: (e) => {
            e.stopPropagation();
            setBalanceCardExpanded(!balanceCardExpanded);
          }
        },
          // === COLLAPSED VIEW ===
          React.createElement('div', { className: 'debt-card-row' },
            React.createElement('div', { className: 'debt-card-left' },
              React.createElement('span', { className: 'debt-card-icon', style: debtCardMeta.iconStyle }, '💰'),
              React.createElement('span', { className: 'debt-card-label' },
                'Недобор ' + debt + ' ккал'
              ),
              React.createElement('span', {
                className: 'debt-card-info',
                title: 'Долг считается от базовой нормы (без бонуса долга и refeed).',
                onClick: showDebtInfo
              }, ' ⓘ'),
              dailyBoost > 0 && React.createElement('span', { className: 'debt-card-boost' },
                '+' + dailyBoost + '/день'
              )
            ),
            // Кнопка "?" для науки + chevron
            React.createElement('div', { className: 'debt-card-right' },
              React.createElement('button', {
                className: 'debt-science-btn',
                onClick: showSciencePopup,
                title: 'Как это работает?'
              }, '?'),
              React.createElement('span', { className: 'debt-card-chevron' },
                balanceCardExpanded ? '▲' : '▼'
              )
            )
          ),

          // === EXPANDED VIEW ===
          balanceCardExpanded && React.createElement('div', { className: 'debt-card-expanded' },
            // Мини-график по дням
            React.createElement('div', { className: 'debt-days-row' },
              debtDaysMeta.map((d) => {
                const isPos = d.delta >= 0;
                const baseInfo = d.baseTarget ? ('база ' + d.baseTarget) : 'база —';
                const planInfo = d.target && d.baseTarget && d.target !== d.baseTarget
                  ? (' • план ' + d.target)
                  : '';
                return React.createElement('div', {
                  key: d.date,
                  className: 'debt-day-col',
                  title: d.dayName + ': ' + (d.delta > 0 ? '+' : '') + d.delta + ' ккал (съедено ' + d.eaten + ' / ' + baseInfo + planInfo + ')'
                },
                  React.createElement('div', { className: 'debt-day-bar-wrap' },
                    React.createElement('div', {
                      className: 'debt-day-bar ' + (isPos ? 'pos' : 'neg'),
                      style: d.barStyle
                    })
                  ),
                  React.createElement('span', { className: 'debt-day-label' }, d.dayName),
                  d.hasTraining && React.createElement('span', { className: 'debt-day-train' }, '🏋️')
                );
              })
            ),

            React.createElement('div', { className: 'caloric-balance-legend' },
              React.createElement('span', { className: 'caloric-balance-legend-icon' }, 'ℹ️'),
              React.createElement('span', { className: 'caloric-balance-legend-text' },
                'Недобор считается от базовой нормы. Линия графика — цель дня с учётом бонусов.'
              )
            ),

            // План восстановления — главный блок
            React.createElement('div', { className: 'debt-plan-block' },
              React.createElement('div', { className: 'debt-plan-header' }, '📋 План'),
              React.createElement('div', { className: 'debt-plan-content' },
                React.createElement('span', { className: 'debt-plan-formula' },
                  effectiveDebt + ' ккал' + ' ÷ ' + recoveryDays + ' дн = '
                ),
                React.createElement('strong', { className: 'debt-plan-result' }, '+' + dailyBoost + ' ккал/день')
              ),
              React.createElement('div', { className: 'debt-plan-note' },
                '75% от долга за ' + recoveryDays + ' ' + (recoveryDays === 1 ? 'день' : 'дня')
              )
            ),

            // Итоговая норма
            React.createElement('div', { className: 'debt-summary-row' },
              React.createElement('span', null, '🎯 Норма сегодня: '),
              React.createElement('strong', null, adjustedOptimum + ' ккал')
            ),

            // 🆕 v3.20: PROTEIN DEBT — Секция белкового долга
            // 🔬 Mettler 2010 (PMID: 20095013): При дефиците белок критичен для мышц
            caloricDebt.proteinDebt?.hasDebt && React.createElement('div', {
              className: 'debt-insight-row protein-debt',
              style: insightRowsMeta.proteinDebt?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.proteinDebt?.iconStyle }, '🥩'),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', {
                  style: insightRowsMeta.proteinDebt?.titleStyle
                },
                  caloricDebt.proteinDebt.severity === 'critical'
                    ? '⚠️ Критический недобор белка!'
                    : '💪 Белка маловато'
                ),
                React.createElement('div', { style: insightRowsMeta.proteinDebt?.subtitleStyle },
                  caloricDebt.proteinDebt.recommendation ||
                  ('Среднее: ' + caloricDebt.proteinDebt.avgProteinPct + '% от нормы')
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/20095013/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.proteinDebt?.pmidStyle,
                title: 'Mettler 2010: Белок сохраняет мышцы при дефиците'
              }, '📚')
            ),

            // 🆕 v3.20: EMOTIONAL RISK — Предупреждение о риске срыва
            // 🔬 Epel 2001 (PMID: 11070333): Стресс + голод = binge eating
            caloricDebt.emotionalRisk?.level !== 'low' && React.createElement('div', {
              className: 'debt-insight-row emotional-risk',
              style: insightRowsMeta.emotionalRisk?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.emotionalRisk?.iconStyle },
                caloricDebt.emotionalRisk.level === 'critical' ? '🚨' : '😰'
              ),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', {
                  style: insightRowsMeta.emotionalRisk?.titleStyle
                },
                  'Риск срыва: ' + caloricDebt.emotionalRisk.bingeRisk + '%'
                ),
                React.createElement('div', { style: insightRowsMeta.emotionalRisk?.subtitleStyle },
                  caloricDebt.emotionalRisk.recommendation || caloricDebt.emotionalRisk.factors.join(' • ')
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/11070333/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.emotionalRisk?.pmidStyle,
                title: 'Epel 2001: Кортизол → тяга к сладкому'
              }, '📚')
            ),

            // 🆕 v3.20: CIRCADIAN CONTEXT — Срочность по времени суток
            // 🔬 Van Cauter 1997 (PMID: 9331550): Инсулин лучше утром
            caloricDebt.circadianContext?.urgency === 'high' && React.createElement('div', {
              className: 'debt-insight-row circadian-hint',
              style: insightRowsMeta.circadianContext?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.circadianContext?.iconStyle },
                caloricDebt.circadianContext.period === 'morning' ? '🌅' : '🌙'
              ),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', { style: insightRowsMeta.circadianContext?.titleStyle },
                  caloricDebt.circadianContext.period === 'evening' || caloricDebt.circadianContext.period === 'night'
                    ? '⏰ Вечер — время поесть!'
                    : '☀️ Утро — впереди целый день'
                ),
                React.createElement('div', { style: insightRowsMeta.circadianContext?.subtitleStyle },
                  caloricDebt.circadianContext.period === 'evening' || caloricDebt.circadianContext.period === 'night'
                    ? 'Не откладывай — поздний ужин хуже усваивается'
                    : 'Можно спокойно добрать калории'
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/9331550/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.circadianContext?.pmidStyle,
                title: 'Van Cauter 1997: Циркадные ритмы инсулина'
              }, '📚')
            ),

            // 🆕 v3.20: TRAINING DAY CONTEXT — Приоритет питания
            // 🔬 Aragon 2013 (PMID: 23360586): Тайминг белка критичен
            caloricDebt.trainingDayContext?.isTrainingDay && caloricDebt.trainingDayContext.nutritionPriority === 'highest' && React.createElement('div', {
              className: 'debt-insight-row training-context',
              style: insightRowsMeta.trainingDayContext?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.trainingDayContext?.iconStyle }, '💪'),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', { style: insightRowsMeta.trainingDayContext?.titleStyle },
                  caloricDebt.trainingDayContext.trainingType === 'strength'
                    ? '🏋️ Силовая — белок критичен!'
                    : '🏃 Кардио — восполни гликоген!'
                ),
                React.createElement('div', { style: insightRowsMeta.trainingDayContext?.subtitleStyle },
                  'Недоедание в тренировочный день = потеря результатов'
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/23360586/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.trainingDayContext?.pmidStyle,
                title: 'Aragon 2013: Нутриент тайминг для мышц'
              }, '📚')
            ),

            // 🆕 v3.20: BMI CONTEXT — Персонализированная рекомендация
            // 🔬 DeFronzo 1979 (PMID: 510806): BMI влияет на метаболизм
            caloricDebt.bmiContext?.recommendation && React.createElement('div', {
              className: 'debt-insight-row bmi-context',
              style: insightRowsMeta.bmiContext?.containerStyle
            },
              React.createElement('span', null, 'ℹ️'),
              React.createElement('span', null, caloricDebt.bmiContext.recommendation),
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/510806/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.bmiContext?.pmidStyle,
                title: 'DeFronzo 1979: Возраст и инсулинорезистентность'
              }, '📚')
            ),

            // Refeed suggestion (если нужен)
            needsRefeed && refeedBoost > 0 && React.createElement('div', { className: 'debt-refeed-hint' },
              React.createElement('span', null, '🍕 Или refeed: до ' + refeedOptimum + ' ккал'),
              React.createElement('span', { className: 'debt-refeed-tip' }, ' — отметь в чек-ине')
            )
          )
        );
      })(),

      // === CALORIC EXCESS CARD — Карточка перебора (раскрывающаяся) ===
      // 🔬 Философия: НЕ наказываем, а мягко подталкиваем к балансу
      // - Основной акцент на АКТИВНОСТЬ (кардио, шаги)
      // - Снижение нормы — мягкий акцент (5-10%), не штраф
      // - Herman & Polivy 1984: строгие ограничения → срывы
      caloricDebt && caloricDebt.hasExcess && !caloricDebt.hasDebt && (() => {
        const {
          excess, rawExcess, cardioRecommendation, totalTrainingKcal, dayBreakdown, trend, severity, weightImpact, goalMode,
          // 🆕 Мягкая коррекция
          dailyReduction, effectiveExcess, activityCompensation, excessRecoveryDays
        } = caloricDebt;

        const style = excessStyleMeta.style || { icon: '➕', color: '#a3a3a3', bg: 'rgba(163, 163, 163, 0.05)', border: 'rgba(163, 163, 163, 0.12)', label: 'Небольшой плюс' };
        const excessStyles = excessCardMeta.styles;
        const breakdownMax = (Array.isArray(dayBreakdown) && dayBreakdown.length > 0)
          ? dayBreakdown.reduce((max, d) => Math.max(max, Math.abs(d.delta || 0)), 0) || 1
          : 1;

        const shortRec = cardioRecommendation
          ? (cardioRecommendation.compensatedBySteps
            ? '✓ сбалансировано'
            : cardioRecommendation.activityIcon + ' ' + cardioRecommendation.minutes + ' мин')
          : null;

        return React.createElement('div', {
          className: 'caloric-balance-card excess' + (balanceCardExpanded ? ' expanded' : ''),
          style: excessStyleMeta.cardStyle || {
            background: style.bg,
            borderColor: style.border,
            '--balance-color': style.color
          },
          onClick: (e) => {
            e.stopPropagation();
            setBalanceCardExpanded(!balanceCardExpanded);
          }
        },
          // === HEADER (всегда виден) — компактная строка ===
          React.createElement('div', { className: 'caloric-balance-header' },
            React.createElement('span', { className: 'caloric-balance-icon' }, style.icon),
            React.createElement('div', { className: 'caloric-balance-summary' },
              React.createElement('span', { className: 'caloric-balance-label' },
                'Профицит за ' + dayBreakdown.length + ' дн',
                React.createElement('span', {
                  className: 'caloric-balance-info',
                  style: excessStyles.infoIcon,
                  'aria-label': 'Баланс считается относительно базовой нормы (TDEE). На графике — цель дня с учётом долга/рефида.',
                  onClick: (e) => {
                    e.stopPropagation();
                    if (HEYS?.Toast?.info) {
                      HEYS.Toast.info('Профицит считается от базовой нормы (TDEE). График — цель дня с учётом долга/рефида.', {
                        title: 'ℹ️ Пояснение'
                      });
                    } else if (typeof HEYS?.toast === 'function') {
                      HEYS.toast({
                        type: 'info',
                        title: 'ℹ️ Пояснение',
                        message: 'Профицит считается от базовой нормы (TDEE). График — цель дня с учётом долга/рефида.'
                      });
                    }
                  }
                }, ' ⓘ')
              ),
              // 🆕 Показываем мягкую коррекцию если есть
              dailyReduction > 0 && React.createElement('span', {
                className: 'caloric-balance-rec-short',
                style: excessStyles.headerRecShort
              }, '−' + dailyReduction + ' ккал'),
              // Или рекомендацию по активности
              !dailyReduction && shortRec && React.createElement('span', { className: 'caloric-balance-rec-short' }, shortRec)
            ),
            React.createElement('span', {
              className: 'caloric-balance-badge',
              style: excessStyleMeta.badgeStyle
            }, '+' + excess),
            // Мини-график баланса ПОСЛЕ бейджа (увеличенный)
            balanceViz && React.createElement('div', { className: 'caloric-balance-viz-inline caloric-balance-viz-large' },
              balanceViz.viz.map((v, i) => React.createElement('span', {
                key: i,
                className: 'balance-viz-bar balance-viz-bar-clickable',
                style: excessCardMeta.getBalanceVizBarStyle
                  ? excessCardMeta.getBalanceVizBarStyle(v.color)
                  : undefined,
                title: v.day + ': ' + (v.delta > 0 ? '+' : '') + v.delta + ' ккал',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  setBalanceDayPopup({ day: v, x: rect.left + rect.width / 2, y: rect.top });
                }
              }, v.bar))
            ),
            React.createElement('span', { className: 'caloric-balance-chevron' },
              balanceCardExpanded ? '▲' : '▼'
            )
          ),

          // === DETAILS (только при раскрытии) ===
          balanceCardExpanded && React.createElement('div', { className: 'caloric-balance-details' },
            // 🆕 Разбивка по дням (чтобы было видно, какие дни учтены)
            Array.isArray(dayBreakdown) && dayBreakdown.length > 0 && React.createElement('div', { className: 'debt-days-row caloric-balance-days' },
              dayBreakdown.map((d) => {
                const isPos = (d.delta || 0) >= 0;
                const pct = Math.min(100, Math.round(Math.abs(d.delta || 0) / breakdownMax * 100));
                return React.createElement('div', {
                  key: d.date,
                  className: 'debt-day-col',
                  title: d.dayName + ': ' + (d.delta > 0 ? '+' : '') + d.delta + ' ккал (съедено ' + d.eaten + ' / норма ' + d.target + ')'
                },
                  React.createElement('div', { className: 'debt-day-bar-wrap' },
                    React.createElement('div', {
                      className: 'debt-day-bar ' + (isPos ? 'pos' : 'neg'),
                      style: { height: pct + '%' }
                    })
                  ),
                  React.createElement('span', { className: 'debt-day-label' }, d.dayName),
                  React.createElement('span', { className: 'debt-day-value' }, (d.delta > 0 ? '+' : '') + d.delta)
                );
              })
            ),

            React.createElement('div', {
              className: 'caloric-balance-legend',
              style: excessStyles.legend
            },
              React.createElement('span', { style: excessStyles.legendIcon }, 'ℹ️'),
              React.createElement('span', { style: excessStyles.legendText }, 'Профицит здесь считается от базовой нормы (TDEE). Линия/план дня — цель с учётом долга или refeed.')
            ),

            // 🆕 МЯГКАЯ КОРРЕКЦИЯ — акцент (не наказание!)
            dailyReduction > 0 && React.createElement('div', {
              className: 'caloric-excess-soft-correction',
              style: excessStyles.softCorrection
            },
              React.createElement('span', { style: excessStyles.softCorrectionIcon }, '🎯'),
              React.createElement('div', { style: excessStyles.softCorrectionTextWrap },
                React.createElement('div', { style: excessStyles.softCorrectionTitle },
                  'Норма сегодня: ' + Math.round(optimum - dailyReduction) + ' ккал'
                ),
                React.createElement('div', { style: excessStyles.softCorrectionSub },
                  'Мягкая коррекция −' + dailyReduction + ' ккал • ' +
                  (activityCompensation > 0 ? Math.round(activityCompensation) + ' ккал через активность' : 'основной акцент — активность')
                )
              ),
              // "?" кнопка с научным обоснованием — открывает popup НА ВКЛАДКЕ ДНЕВНИК
              React.createElement('span', {
                style: excessStyles.scienceBtn,
                title: 'Научное обоснование',
                onClick: (e) => {
                  e.stopPropagation();
                  const popupData = excessSciencePopupMeta;
                  // Сначала переключаемся на вкладку Дневник, потом показываем popup
                  if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
                    App?.setTab?.('diary');
                    setTimeout(() => setDebtSciencePopup(popupData), 200);
                  } else {
                    setDebtSciencePopup(popupData);
                  }
                }
              }, '?')
            ),

            // 🔬 Научная сводка — Forbes equation
            balanceViz && balanceViz.fatGain > 0 && React.createElement('div', {
              className: 'caloric-excess-science-summary',
              style: excessStyles.scienceSummary
            },
              React.createElement('span', null, '🧬'),
              React.createElement('div', { style: excessStyles.softCorrectionTextWrap },
                React.createElement('div', { style: excessStyles.scienceSummaryTitle },
                  'По Forbes: ' + (balanceViz.totalBalance > 0 ? '+' : '') + balanceViz.fatGain + 'г жира, ' +
                  (balanceViz.totalBalance > 0 ? '+' : '') + balanceViz.glycogenWater + 'г воды'
                ),
                balanceViz.epocKcal > 30 && React.createElement('div', { style: excessStyles.scienceSummarySub },
                  'EPOC сжёг ~' + balanceViz.epocKcal + ' ккал после тренировок'
                )
              ),
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/10365981/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: excessStyles.scienceSummaryLink
              }, 'PMID')
            ),

            // Инсайты БАЛАНСА (тренд, паттерн, прогноз, и т.д.)
            balanceViz && balanceViz.balanceInsights && balanceViz.balanceInsights.length > 0 && React.createElement('div', { className: 'caloric-balance-insights' },
              balanceInsightsMeta.map((insight, i) => (
                React.createElement('div', {
                  key: i,
                  className: 'caloric-balance-insight-item',
                  style: insight.itemStyle
                },
                  React.createElement('span', { className: 'caloric-insight-emoji' }, insight.emoji),
                  React.createElement('span', { className: 'caloric-insight-text' }, insight.text),
                  // PMID ссылка если есть
                  insight.pmid && React.createElement('a', {
                    href: 'https://pubmed.ncbi.nlm.nih.gov/' + insight.pmid + '/',
                    target: '_blank',
                    rel: 'noopener',
                    onClick: (e) => e.stopPropagation(),
                    style: insight.pmidStyle
                  }, '📚')
                )
              ))
            ),

            // Рекомендация кардио (подробная) — ГЛАВНЫЙ способ компенсации
            cardioRecommendation && !cardioRecommendation.compensatedBySteps && React.createElement('div', {
              className: 'caloric-excess-cardio',
              style: excessStyles.cardioRec
            },
              React.createElement('span', { className: 'caloric-excess-rec-icon', style: excessStyles.cardioRecIcon }, cardioRecommendation.activityIcon),
              React.createElement('div', { className: 'caloric-excess-rec-content' },
                React.createElement('span', { className: 'caloric-excess-rec-title', style: excessStyles.cardioRecTitle }, '✨ Лучший способ:'),
                React.createElement('span', { className: 'caloric-excess-rec-text' }, cardioRecommendation.text),
                cardioRecommendation.stepsCompensation > 0 &&
                React.createElement('span', { className: 'caloric-excess-steps-note' },
                  '👟 Шаги уже списали ' + cardioRecommendation.stepsCompensation + ' ккал'
                )
              )
            ),

            // Успех — шаги компенсировали всё
            cardioRecommendation && cardioRecommendation.compensatedBySteps && React.createElement('div', {
              className: 'caloric-excess-success',
              style: excessStyles.success
            },
              React.createElement('span', { style: excessStyles.successText }, '🎉 ' + cardioRecommendation.text)
            ),

            // Позитивное пояснение (НЕ наказываем!)
            React.createElement('div', {
              className: 'caloric-balance-explanation',
              style: excessStyles.explanation
            },
              goalMode === 'bulk'
                ? '💪 При наборе массы профицит — это часть плана!'
                : severity >= 2
                  ? '🏃 Активность — лучший способ выровнять баланс. Это данные, не приговор.'
                  : goalMode === 'loss'
                    ? '💡 Лёгкая прогулка или тренировка сбалансирует день. Без стресса!'
                    : '🌟 Баланс немного в плюсе — отличный повод для активности!'
            )
          )
        );
      })(),

      // Popup с деталями при клике на точку — НОВЫЙ КОНСИСТЕНТНЫЙ ДИЗАЙН
      sparklinePopup && sparklinePopup.type === 'kcal' && (() => {
        const sparklinePopupMeta = vmComputed.sparklinePopupMeta;
        const point = sparklinePopupMeta.point || sparklinePopup.point;
        const ratio = sparklinePopupMeta.ratio || (point.kcal / point.target);
        const pct = sparklinePopupMeta.pct || Math.round(ratio * 100);
        const color = sparklinePopupMeta.color || '#eab308';

        // Позиционирование с защитой от выхода за экран
        const popupW = 260;
        const popupH = 280;
        const pos = getSmartPopupPosition(
          sparklinePopup.x,
          sparklinePopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const diff = sparklinePopupMeta.diff;
        const gradient = sparklinePopupMeta.gradient || 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
        const kcalStyles = sparklinePopupMeta.styles;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        // POPUP с использованием PopupWithBackdrop
        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': (point.isToday ? 'Сегодня' : point.dayNum) + ' — ' + pct + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(kcalStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: kcalStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: дата + процент
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' },
                  (() => {
                    if (point.isToday) return '📅 Сегодня';
                    const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                    const wd = weekDays[point.dayOfWeek] || '';
                    return '📅 ' + point.dayNum + ' ' + wd;
                  })()
                ),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: kcalStyles.pct || undefined
                }, pct + '%')
              ),
              // Progress bar
              React.createElement('div', { className: 'sparkline-popup-progress' },
                React.createElement('div', {
                  className: 'sparkline-popup-progress-fill',
                  style: kcalStyles.progressFill || undefined
                })
              ),
              // Value
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: kcalStyles.value || undefined },
                  Math.round(point.kcal) + ' ккал'
                ),
                React.createElement('span', { className: 'sparkline-popup-target' },
                  ' / ' + point.target + ' ккал'
                ),
                // Сравнение со вчера
                diff !== null && React.createElement('span', {
                  className: 'sparkline-popup-compare' + (diff > 0 ? ' up' : diff < 0 ? ' down' : ''),
                }, diff > 0 ? '↑' : diff < 0 ? '↓' : '=', ' ', Math.abs(Math.round(diff)))
              ),
              // Теги: сон, тренировка, шаги, оценка
              (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 good'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2',
                  style: dayScoreStyleMeta ? dayScoreStyleMeta(point.dayScore) : undefined
                }, '⭐ ' + point.dayScore)
              ),
              // Кнопка перехода
              !point.isToday && React.createElement('button', {
                className: 'sparkline-popup-btn-v2',
                onClick: () => {
                  setSparklinePopup(null);
                  selectDateWithPrefetch(point.date, { reason: 'sparkline-kcal' });
                }
              }, '→ Перейти к дню'),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка
            React.createElement('div', {
              className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div внутри PopupWithBackdrop
        }); // Закрываем PopupWithBackdrop
      })(),
      // Popup для идеального дня 🔥 — ЗОЛОТОЙ СТИЛЬ
      sparklinePopup && sparklinePopup.type === 'perfect' && (() => {
        const point = sparklinePopup.point;
        const pct = sparklinePerfectPopupMeta.pct || Math.round((point.kcal / point.target) * 100);
        const perfectStyles = sparklinePerfectPopupMeta.styles;

        // Позиционирование
        const popupW = 260;
        let left = sparklinePopup.x - popupW / 2;
        let arrowPos = 'center';
        if (left < 10) { left = 10; arrowPos = 'left'; }
        if (left + popupW > window.innerWidth - 10) { left = window.innerWidth - popupW - 10; arrowPos = 'right'; }

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2 sparkline-popup-perfect-v2',
            role: 'dialog',
            'aria-label': 'Идеальный день — ' + pct + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(perfectStyles.popup, left, sparklinePopup.y + 15, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Золотая полоса
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: perfectStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: emoji + дата
              React.createElement('div', { className: 'sparkline-popup-header-v2 perfect' },
                React.createElement('span', { className: 'sparkline-popup-perfect-title' }, '🔥 Идеальный день!'),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: perfectStyles.pct || undefined
                }, pct + '%')
              ),
              // Progress bar (золотой)
              React.createElement('div', { className: 'sparkline-popup-progress' },
                React.createElement('div', {
                  className: 'sparkline-popup-progress-fill',
                  style: perfectStyles.progressFill || undefined
                })
              ),
              // Value
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: perfectStyles.value || undefined },
                  Math.round(point.kcal) + ' ккал'
                ),
                React.createElement('span', { className: 'sparkline-popup-target' },
                  ' / ' + point.target + ' ккал'
                )
              ),
              // Motivation
              React.createElement('div', { className: 'sparkline-popup-motivation-v2' },
                '✨ Попал точно в цель! Так держать!'
              ),
              // Теги (золотой стиль)
              (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2 perfect' },
                point.sleepHours > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '⭐ ' + point.dayScore)
              ),
              // Кнопка перехода
              !point.isToday && React.createElement('button', {
                className: 'sparkline-popup-btn-v2 perfect',
                onClick: () => {
                  setSparklinePopup(null);
                  selectDateWithPrefetch(point.date, { reason: 'sparkline-perfect' });
                }
              }, '→ Перейти к дню'),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close perfect',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка (золотая)
            React.createElement('div', {
              className: 'sparkline-popup-arrow perfect' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Popup для бейджей БЖУ
      macroBadgePopup && (() => {
        const popupWidth = 220;
        const popupHeight = 320; // Примерная высота popup

        // Используем умное позиционирование
        const pos = getSmartPopupPosition(
          macroBadgePopup.x,
          macroBadgePopup.y,
          popupWidth,
          popupHeight,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const yesterdayCompare = macroPopupMeta.yesterdayCompare;

        const rec = macroPopupMeta.rec;
        const timeMsg = macroPopupMeta.timeMsg || { icon: '⏰', text: ' ' };
        const macroPopupStyles = macroPopupMeta.styles;
        const macroSparkStyles = macroPopupMeta.sparkStyles;

        const macroStreak = macroPopupMeta.macroStreak || 0;
        const sparkData = macroPopupMeta.sparkData || [0, 0, 0, 0, 0, 0, macroBadgePopup.value || 0];
        const sparkMax = macroPopupMeta.sparkMax || Math.max(...sparkData, macroBadgePopup.norm || 100) || 100;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setMacroBadgePopup(null));

        return PopupWithBackdrop({
          onClose: () => setMacroBadgePopup(null),
          children: React.createElement('div', {
            className: 'macro-badge-popup' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': macroBadgePopup.macro + ' — ' + Math.round(macroBadgePopup.ratio * 100) + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(macroPopupStyles.popup, left, top, popupWidth) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса сверху
            React.createElement('div', {
              className: 'macro-badge-popup-stripe',
              style: macroPopupStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'macro-badge-popup-content' },
              // Swipe indicator (mobile)
              React.createElement('div', { className: 'macro-badge-popup-swipe' }),
              // Header: макрос + процент
              React.createElement('div', { className: 'macro-badge-popup-header' },
                React.createElement('span', { className: 'macro-badge-popup-title' }, macroBadgePopup.macro),
                React.createElement('span', {
                  className: 'macro-badge-popup-pct macro-badge-popup-animated',
                  style: macroPopupStyles.pct || undefined
                }, Math.round(macroBadgePopup.ratio * 100) + '%')
              ),
              // 📊 Мини-sparkline
              React.createElement('div', { className: 'macro-badge-popup-sparkline' },
                React.createElement('svg', { viewBox: '0 0 70 20', className: 'macro-badge-popup-spark-svg' },
                  // Линия нормы
                  React.createElement('line', {
                    x1: 0, y1: 20 - (macroBadgePopup.norm / sparkMax * 18),
                    x2: 70, y2: 20 - (macroBadgePopup.norm / sparkMax * 18),
                    stroke: macroSparkStyles?.goalLine?.stroke,
                    strokeWidth: macroSparkStyles?.goalLine?.strokeWidth,
                    strokeDasharray: macroSparkStyles?.goalLine?.strokeDasharray
                  }),
                  // Точки и линии
                  sparkData.map((val, i) => {
                    const x = i * 10 + 5;
                    const y = 20 - (val / sparkMax * 18);
                    const nextVal = sparkData[i + 1];
                    const isToday = i === 6;
                    const pointStyle = isToday ? macroSparkStyles?.pointToday : macroSparkStyles?.point;
                    return React.createElement('g', { key: i },
                      // Линия к следующей точке
                      nextVal !== undefined && React.createElement('line', {
                        x1: x, y1: y,
                        x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                        stroke: macroSparkStyles?.connector?.stroke,
                        strokeWidth: macroSparkStyles?.connector?.strokeWidth,
                        strokeOpacity: macroSparkStyles?.connector?.strokeOpacity
                      }),
                      // Точка
                      React.createElement('circle', {
                        cx: x, cy: y,
                        r: pointStyle?.r != null ? pointStyle.r : (isToday ? 3 : 2),
                        fill: pointStyle?.fill || (isToday ? macroBadgePopup.color : '#94a3b8'),
                        className: isToday ? 'macro-badge-popup-spark-today' : ''
                      })
                    );
                  })
                ),
                React.createElement('span', { className: 'macro-badge-popup-spark-label' }, '7 дней')
              ),
              // 🎨 Прогресс-бар с градиентом
              React.createElement('div', { className: 'macro-badge-popup-progress' },
                React.createElement('div', {
                  className: 'macro-badge-popup-progress-fill macro-badge-popup-animated-bar',
                  style: macroPopupStyles.progressFill || undefined
                })
              ),
              // 💫 Значение с анимацией + сравнение со вчера
              React.createElement('div', { className: 'macro-badge-popup-value' },
                React.createElement('span', {
                  className: 'macro-badge-popup-animated',
                  style: macroPopupStyles.value || undefined
                }, macroBadgePopup.value + 'г'),
                React.createElement('span', { className: 'macro-badge-popup-norm' },
                  ' / ' + macroBadgePopup.norm + 'г'
                ),
                // 📊 Сравнение со вчера
                yesterdayCompare && React.createElement('span', {
                  className: 'macro-badge-popup-compare' + (yesterdayCompare.diff > 0 ? ' up' : yesterdayCompare.diff < 0 ? ' down' : ''),
                  'aria-label': 'Сравнение со вчера'
                }, yesterdayCompare.icon + ' ' + yesterdayCompare.text)
              ),
              // ⏰ Динамическое сообщение по времени
              React.createElement('div', { className: 'macro-badge-popup-time-msg' },
                React.createElement('span', null, timeMsg.icon),
                React.createElement('span', null, ' ' + timeMsg.text)
              ),
              // 🏆 Streak макроса
              macroStreak > 0 && React.createElement('div', { className: 'macro-badge-popup-streak' },
                React.createElement('span', { className: 'macro-badge-popup-streak-icon' }, '🏆'),
                React.createElement('span', null, macroStreak + ' ' + (macroStreak === 1 ? 'день' : macroStreak < 5 ? 'дня' : 'дней') + ' подряд в норме!')
              ),
              // Описание (все бейджи)
              macroBadgePopup.allBadges.length > 0 && React.createElement('div', { className: 'macro-badge-popup-desc' },
                macroBadgePopup.allBadges.map((b, i) =>
                  React.createElement('div', { key: i, className: 'macro-badge-popup-item' },
                    React.createElement('span', { className: 'macro-badge-popup-emoji' }, b.emoji),
                    React.createElement('span', null, b.desc)
                  )
                )
              ),
              // Рекомендация продукта
              rec && React.createElement('div', { className: 'macro-badge-popup-rec' },
                React.createElement('span', { className: 'macro-badge-popup-rec-icon' }, rec.icon),
                React.createElement('span', { className: 'macro-badge-popup-rec-text' },
                  rec.text + ' ',
                  React.createElement('b', null, rec.amount)
                )
              ),
              // Закрыть
              React.createElement('button', {
                className: 'macro-badge-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setMacroBadgePopup(null)
              }, '✕')
            ),
            // Стрелка-указатель
            React.createElement('div', {
              className: 'macro-badge-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // === TDEE POPUP (расшифровка затрат) ===
      tdeePopup && (() => {
        const d = tdeePopup.data;
        const tdeePopupMeta = vmComputed.tdeePopupMeta;
        const popupW = 300;
        const popupH = 400;
        const pos = getSmartPopupPosition(
          tdeePopup.x,
          tdeePopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        // Подсчёт всех активностей
        const trainTotal = tdeePopupMeta.trainTotal || 0;
        const actTotal = tdeePopupMeta.actTotal || 0;

        // Проценты для визуализации
        const bmrPct = tdeePopupMeta.bmrPct || 0;
        const actPct = tdeePopupMeta.actPct || 0;
        const trainMinutesMeta = tdeePopupMeta.trainMinutes || [0, 0, 0];
        const tdeeStyles = tdeePopupMeta.styles;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setTdeePopup(null));

        return PopupWithBackdrop({
          onClose: () => setTdeePopup(null),
          children: React.createElement('div', {
            className: 'tdee-popup',
            role: 'dialog',
            'aria-label': 'Расшифровка затрат: ' + d.tdee + ' ккал',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(tdeeStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Header
            React.createElement('div', {
              style: tdeeStyles.header
            },
              React.createElement('span', { style: tdeeStyles.headerTitle }, '⚡ Затраты энергии'),
              React.createElement('span', { style: tdeeStyles.headerValue }, d.tdee + ' ккал')
            ),
            // Визуальная полоса BMR + Activity
            React.createElement('div', { className: 'tdee-bar-container' },
              React.createElement('div', { className: 'tdee-bar' },
                React.createElement('div', {
                  className: 'tdee-bar-bmr',
                  style: tdeePopupMeta.bmrBarStyle
                }),
                React.createElement('div', {
                  className: 'tdee-bar-activity',
                  style: tdeePopupMeta.actBarStyle
                })
              ),
              React.createElement('div', { className: 'tdee-bar-labels' },
                React.createElement('span', null, '🧬Базовый: ' + bmrPct + '%'),
                React.createElement('span', null, '🏃 Активность: ' + actPct + '%')
              )
            ),
            // Детали — строки
            React.createElement('div', { className: 'tdee-details' },
              // BMR
              React.createElement('div', { className: 'tdee-row tdee-row-main' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🧬'),
                React.createElement('span', { className: 'tdee-row-label' }, 'Базовый метаболизм (BMR)'),
                React.createElement('span', { className: 'tdee-row-value' }, d.bmr + ' ккал')
              ),
              React.createElement('div', { className: 'tdee-row-hint' },
                'Формула Миффлина-Сан Жеора, вес ' + d.weight + ' кг'
              ),
              // Разделитель
              React.createElement('div', { className: 'tdee-divider' }),
              // Шаги
              d.stepsK > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '👟'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Шаги (' + (d.steps || 0).toLocaleString() + ')'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.stepsK + ' ккал')
              ),
              // Бытовая активность
              d.householdK > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏠'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Быт. активность (' + (d.householdMin || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.householdK + ' ккал')
              ),
              // Тренировка 1
              d.train1k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Тренировка 1 (' + (trainMinutesMeta[0] || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train1k + ' ккал')
              ),
              // Тренировка 2
              d.train2k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Тренировка 2 (' + (trainMinutesMeta[1] || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train2k + ' ккал')
              ),
              // Тренировка 3
              d.train3k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Тренировка 3 (' + (trainMinutesMeta[2] || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train3k + ' ккал')
              ),
              // TEF (Thermic Effect of Food) — затраты на переваривание
              d.tefKcal > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🔥'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Переваривание пищи (TEF)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.tefKcal + ' ккал')
              ),
              // 🆕 v3.20.0: NDTE (Next-Day Training Effect)
              // PMID: 18583478 (Magkos 2008) — тренировка вчера → повышенный расход сегодня
              d.ndteData?.active && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🔥'),
                React.createElement('span', {
                  className: 'tdee-row-label',
                  style: tdeeStyles.ndteLabel
                },
                  'Эффект вчера трени',
                  React.createElement('a', {
                    href: 'https://pubmed.ncbi.nlm.nih.gov/18583478/',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: 'PMID: 18583478 — Magkos 2008',
                    style: tdeeStyles.ndteLink,
                    onClick: (e) => e.stopPropagation()
                  }, '📚')
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' },
                  '+' + Math.round(d.bmr * d.ndteData.tdeeBoost) + ' ккал'
                )
              ),
              // 🆕 v3.20.0: BMI Context — персонализация по BMI
              // PMID: 10953022 (Kahn & Flier 2000) — BMI влияет на метаболизм
              d.bmiContext && React.createElement('div', {
                className: 'tdee-row tdee-row-hint',
                style: tdeeStyles.bmiRow
              },
                React.createElement('span', {
                  style: tdeeStyles.bmiRowText
                },
                  d.bmiContext.category === 'underweight' ? '⚠️' :
                    d.bmiContext.category === 'obese' ? '📊' : '✅',
                  ' BMI ' + (d.bmiContext.bmi || '—').toFixed?.(1) + ' (' +
                  (d.bmiContext.category === 'normal' ? 'норма' :
                    d.bmiContext.category === 'underweight' ? 'недовес' :
                      d.bmiContext.category === 'overweight' ? 'избыток' : 'ожирение') + ')',
                  React.createElement('a', {
                    href: 'https://pubmed.ncbi.nlm.nih.gov/10953022/',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: 'PMID: 10953022 — Kahn & Flier 2000',
                    style: tdeeStyles.bmiRowLink,
                    onClick: (e) => e.stopPropagation()
                  }, '📚')
                )
              ),
              // Если нет активности
              actTotal === 0 && !d.tefKcal && React.createElement('div', { className: 'tdee-row tdee-row-empty' },
                React.createElement('span', { className: 'tdee-row-icon' }, '💤'),
                React.createElement('span', { className: 'tdee-row-label' }, 'Нет активности за сегодня'),
                React.createElement('span', { className: 'tdee-row-value' }, '+0 ккал')
              ),
              // Итого
              React.createElement('div', { className: 'tdee-divider' }),
              React.createElement('div', { className: 'tdee-row tdee-row-total' },
                React.createElement('span', { className: 'tdee-row-icon' }, '⚡'),
                React.createElement('span', { className: 'tdee-row-label' }, 'ИТОГО затраты'),
                React.createElement('span', { className: 'tdee-row-value' }, d.tdee + ' ккал')
              )
            ),
            // Close button
            React.createElement('button', {
              style: tdeeStyles.closeBtn,
              'aria-label': 'Закрыть',
              onClick: (e) => {
                e.stopPropagation();
                setTdeePopup(null);
              }
            }, '✕')
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // === WEEK NORM POPUP (детали недели X/Y в норме) ===
      weekNormPopup && (() => {
        const popupW = 260;
        const popupH = 280;
        const pos = getSmartPopupPosition(
          weekNormPopup.x,
          weekNormPopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top } = pos;
        const rz = ratioZones;
        const weekNormDays = weekNormPopupMeta.days || [];
        const weekNormInNorm = weekNormPopupMeta.inNorm ?? weekNormPopup.inNorm;
        const weekNormWithData = weekNormPopupMeta.withData ?? weekNormPopup.withData;
        const weekNormStyles = weekNormPopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setWeekNormPopup(null),
          children: React.createElement('div', {
            className: 'week-norm-popup sparkline-popup sparkline-popup-v2',
            role: 'dialog',
            style: popupPositionStyle ? popupPositionStyle(weekNormStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: weekNormStyles.stripe || undefined
            }),
            React.createElement('div', { className: 'sparkline-popup-content' },
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' }, '📊 Неделя'),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: weekNormStyles.headerValue || undefined
                }, weekNormInNorm + '/' + weekNormWithData + ' в норме')
              ),
              React.createElement('div', { style: weekNormStyles.list },
                weekNormDays.map((d, i) =>
                  React.createElement('div', {
                    key: i,
                    style: d.rowStyle
                  },
                    React.createElement('span', {
                      style: d.nameStyle
                    }, d.name + (d.isToday ? ' (сегодня)' : '')),
                    d.statusText
                      ? React.createElement('span', { style: d.statusTextStyle }, d.statusText)
                      : React.createElement('span', {
                        style: d.badgeStyle
                      }, d.ratioPct + '%')
                  )
                )
              ),
              React.createElement('button', {
                className: 'sparkline-popup-close',
                onClick: () => setWeekNormPopup(null)
              }, '✕')
            )
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // === WEEK DEFICIT POPUP (научный расчёт сожжённого жира) ===
      weekDeficitPopup && (() => {
        const { totalEaten, totalBurned, deficitKcal, deficitPct, fatBurnedGrams,
          avgTargetDeficit, daysWithData, isDeficit } = weekDeficitPopup.data;

        const popupW = 320;
        const popupH = 420;
        const pos = getSmartPopupPosition(
          weekDeficitPopup.x,
          weekDeficitPopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top } = pos;

        const stripeColor = weekDeficitPopupMeta.stripeColor || 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)';
        const fatText = weekDeficitPopupMeta.fatText || '';
        const glycogenWaterText = weekDeficitPopupMeta.glycogenWaterText || '';
        const muscleText = weekDeficitPopupMeta.muscleText || '';
        const surplusWeightText = weekDeficitPopupMeta.surplusWeightText || '';
        const deficitStyles = weekDeficitPopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setWeekDeficitPopup(null),
          children: React.createElement('div', {
            className: 'week-deficit-popup sparkline-popup sparkline-popup-v2',
            role: 'dialog',
            style: popupPositionStyle ? popupPositionStyle(deficitStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Цветная полоса сверху
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: deficitStyles.stripe || undefined
            }),
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Заголовок
              React.createElement('div', {
                className: 'sparkline-popup-header-v2',
                style: deficitStyles.header
              },
                React.createElement('span', {
                  className: 'sparkline-popup-date',
                  style: deficitStyles.headerDate
                }, '🔬 Научный расчёт за ' + daysWithData + ' дней'),
                React.createElement('span', {
                  style: deficitStyles.headerValue
                }, (isDeficit ? '−' : '+') + Math.abs(deficitKcal).toLocaleString('ru') + ' ккал')
              ),

              // Основные числа
              React.createElement('div', {
                style: deficitStyles.grid
              },
                // Потрачено
                React.createElement('div', { style: deficitStyles.gridCell },
                  React.createElement('div', { style: deficitStyles.gridLabel }, 'Потрачено'),
                  React.createElement('div', { style: deficitStyles.gridValueBurned }, totalBurned.toLocaleString('ru')),
                  React.createElement('div', { style: deficitStyles.gridSubLabel }, 'ккал (TDEE)')
                ),
                // Съедено
                React.createElement('div', { style: deficitStyles.gridCell },
                  React.createElement('div', { style: deficitStyles.gridLabel }, 'Съедено'),
                  React.createElement('div', { style: deficitStyles.gridValueEaten }, totalEaten.toLocaleString('ru')),
                  React.createElement('div', { style: deficitStyles.gridSubLabel }, 'ккал')
                )
              ),

              // Разделитель
              React.createElement('div', {
                style: deficitStyles.divider
              }),

              // Научная формула
              isDeficit && React.createElement('div', { style: deficitStyles.formulaBlock },
                React.createElement('div', {
                  style: deficitStyles.formulaHeader
                },
                  React.createElement('span', null, '📐'),
                  'Состав потери веса (Hall KD, 2008)'
                ),
                // Компоненты потери
                React.createElement('div', {
                  style: deficitStyles.formulaList
                },
                  // Жир
                  React.createElement('div', {
                    style: deficitStyles.rowFat
                  },
                    React.createElement('div', { style: deficitStyles.inlineRow },
                      React.createElement('span', null, '🔥'),
                      React.createElement('span', { style: deficitStyles.rowLabel }, 'Жир (77%)')
                    ),
                    React.createElement('span', { style: deficitStyles.valueFat },
                      '−' + fatText)
                  ),
                  // Гликоген + вода
                  React.createElement('div', {
                    style: deficitStyles.rowGlycogen
                  },
                    React.createElement('div', { style: deficitStyles.inlineRow },
                      React.createElement('span', null, '💧'),
                      React.createElement('span', { style: deficitStyles.rowLabel }, 'Гликоген + вода (18%)')
                    ),
                    React.createElement('span', { style: deficitStyles.valueGlycogen },
                      '−' + glycogenWaterText)
                  ),
                  // Мышцы (если тренировки, меньше)
                  React.createElement('div', {
                    style: deficitStyles.rowMuscle
                  },
                    React.createElement('div', { style: deficitStyles.inlineRow },
                      React.createElement('span', null, '💪'),
                      React.createElement('span', { style: deficitStyles.rowLabel }, 'Мышцы (5%)*')
                    ),
                    React.createElement('span', { style: deficitStyles.valueMuscle },
                      '−' + muscleText)
                  )
                )
              ),

              // Итого
              isDeficit && React.createElement('div', {
                style: deficitStyles.totalBox
              },
                React.createElement('div', {
                  style: deficitStyles.totalRow
                },
                  React.createElement('span', { style: deficitStyles.totalLabel }, '🎯 Чистый жир:'),
                  React.createElement('span', { style: deficitStyles.totalValue },
                    '−' + fatText)
                )
              ),

              // Профицит (набор)
              !isDeficit && React.createElement('div', {
                style: deficitStyles.surplusBox
              },
                React.createElement('div', { style: deficitStyles.surplusText },
                  '⚠️ Профицит ' + Math.abs(deficitKcal).toLocaleString('ru') + ' ккал может привести к набору ~' +
                  surplusWeightText + ' жира'
                )
              ),

              // Сноска
              React.createElement('div', {
                style: deficitStyles.footnote
              },
                '* При адекватном белке (1.6-2.2 г/кг) и силовых тренировках потеря мышц минимальна. ',
                React.createElement('span', { style: deficitStyles.footnoteItalic },
                  'Hall KD. Computational model of in vivo human energy metabolism. Am J Physiol 2008.'
                )
              ),

              // Кнопка закрытия
              React.createElement('button', {
                className: 'sparkline-popup-close',
                onClick: () => setWeekDeficitPopup(null)
              }, '✕')
            )
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === BALANCE DAY POPUP — детали дня при клике на столбик баланса ===
      balanceDayPopup && (() => {
        const { day: v, x, y } = balanceDayPopup;

        // Позиционирование
        const popupW = 240;
        const popupH = 200;
        const pos = getSmartPopupPosition(x, y, popupW, popupH, { preferAbove: true, offset: 8 });
        const { left, top } = pos;

        const stripeColor = balanceDayPopupMeta.stripeColor || '#22c55e';
        const dateLabel = balanceDayPopupMeta.dateLabel || '';
        const ratioPct = balanceDayPopupMeta.ratioPct || Math.round((v.ratio || 0) * 100);
        const balanceDayStyles = balanceDayPopupMeta.styles;

        return ReactDOM.createPortal(
          PopupWithBackdrop({
            onClose: () => setBalanceDayPopup(null),
            children: React.createElement('div', {
              className: 'balance-day-popup sparkline-popup-v2',
              style: popupPositionStyle ? popupPositionStyle(balanceDayStyles.popup, left, top, popupW) : undefined,
              onClick: (e) => e.stopPropagation()
            },
              // Цветная полоса сверху
              React.createElement('div', {
                style: balanceDayStyles.stripe
              }),
              // Контент
              React.createElement('div', { style: balanceDayStyles.content },
                // Заголовок
                React.createElement('div', {
                  style: balanceDayStyles.header
                },
                  React.createElement('span', {
                    style: balanceDayStyles.headerTitle
                  }, v.day + ', ' + dateLabel),
                  v.hasTraining && React.createElement('span', {
                    style: balanceDayStyles.trainingIcon,
                    title: 'Была тренировка'
                  }, '🏋️')
                ),
                // Съедено / Норма
                React.createElement('div', {
                  style: balanceDayStyles.grid
                },
                  React.createElement('div', {
                    style: balanceDayStyles.eatenBox
                  },
                    React.createElement('div', { style: balanceDayStyles.boxLabel }, 'Съедено'),
                    React.createElement('div', { style: balanceDayStyles.eatenValue }, v.eaten)
                  ),
                  React.createElement('div', {
                    style: balanceDayStyles.targetBox
                  },
                    React.createElement('div', {
                      style: balanceDayStyles.boxLabel,
                      title: 'Цель дня с учётом долга/рефида'
                    }, 'Норма'),
                    React.createElement('div', { style: balanceDayStyles.targetValue }, v.target)
                  )
                ),
                // Базовая норма (до refeed/долга)
                v.baseTarget && v.baseTarget !== v.target && React.createElement('div', {
                  style: balanceDayStyles.baseRow
                },
                  React.createElement('span', {
                    style: balanceDayStyles.baseLabel,
                    title: 'Базовая цель без долга/рефида'
                  }, 'База'),
                  React.createElement('div', null,
                    React.createElement('span', { style: balanceDayStyles.baseValue }, v.baseTarget + ' ккал'),
                    v.isRefeedDay && React.createElement('span', { style: balanceDayStyles.refeedBadge }, '🍕 +35%')
                  )
                ),
                // Баланс
                React.createElement('div', {
                  style: balanceDayStyles.balanceRow
                },
                  React.createElement('span', { style: balanceDayStyles.balanceLabel }, 'Баланс'),
                  React.createElement('span', {
                    style: balanceDayStyles.balanceValue
                  }, (v.delta > 0 ? '+' : '') + v.delta + ' ккал')
                ),
                // Выполнение %
                React.createElement('div', {
                  style: balanceDayStyles.ratioText
                }, 'Выполнение: ' + ratioPct + '%')
              ), // Закрываем "Контент" div
              // Кнопка закрытия
              React.createElement('button', {
                style: balanceDayStyles.closeBtn,
                onClick: (e) => {
                  e.stopPropagation();
                  setBalanceDayPopup(null);
                }
              }, '✕')
            ) // Закрываем popup div
          }), // Закрываем PopupWithBackdrop
          document.body
        ); // Закрываем createPortal
      })(),

      // === TEF INFO POPUP — научная информация о TEF ===
      tefInfoPopup && (() => {
        const popupW = 320;
        const popupH = 420;
        const pos = getSmartPopupPosition(
          tefInfoPopup.x,
          tefInfoPopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top } = pos;

        const tefInfo = tefInfoPopupMeta;
        const tefStyles = tefInfoPopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setTefInfoPopup(null),
          children: React.createElement('div', {
            className: 'tef-info-popup sparkline-popup-v2',
            role: 'dialog',
            'aria-label': 'Информация о TEF',
            style: popupPositionStyle ? popupPositionStyle(tefStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Цветная полоса сверху (оранжевая для TEF)
            React.createElement('div', {
              style: tefStyles.stripe
            }),
            // Контент
            React.createElement('div', { style: tefStyles.content },
              // Заголовок
              React.createElement('div', {
                style: tefStyles.header
              },
                React.createElement('span', { style: tefStyles.headerIcon }, '🔥'),
                React.createElement('div', null,
                  React.createElement('div', {
                    style: tefStyles.title
                  }, 'TEF'),
                  React.createElement('div', {
                    style: tefStyles.subtitle
                  }, tefInfo.nameRu)
                )
              ),
              // Описание
              React.createElement('div', {
                style: tefStyles.description
              }, tefInfo.description),
              // Формула
              React.createElement('div', {
                style: tefStyles.formulaBox
              },
                React.createElement('div', {
                  style: tefStyles.formulaLabel
                }, '📐 Формула'),
                React.createElement('div', {
                  style: tefStyles.formulaCode
                },
                  React.createElement('div', null, 'TEF = Белок×4×', React.createElement('b', null, '25%')),
                  React.createElement('div', { style: tefStyles.formulaIndent }, '+ Углеводы×4×', React.createElement('b', null, '7.5%')),
                  React.createElement('div', { style: tefStyles.formulaIndent }, '+ Жиры×9×', React.createElement('b', null, '1.5%'))
                )
              ),
              // Диапазоны TEF по макросам
              React.createElement('div', {
                style: tefStyles.rangeGrid
              },
                // Белок
                React.createElement('div', {
                  style: tefStyles.rangeBoxProtein
                },
                  React.createElement('div', { style: tefStyles.rangeLabel }, 'Белок'),
                  React.createElement('div', { style: tefStyles.rangeValueProtein }, tefInfo.ranges.protein.label),
                  React.createElement('div', { style: tefStyles.rangeHint }, 'используем 25%')
                ),
                // Углеводы
                React.createElement('div', {
                  style: tefStyles.rangeBoxCarbs
                },
                  React.createElement('div', { style: tefStyles.rangeLabel }, 'Углеводы'),
                  React.createElement('div', { style: tefStyles.rangeValueCarbs }, tefInfo.ranges.carbs.label),
                  React.createElement('div', { style: tefStyles.rangeHint }, 'используем 7.5%')
                ),
                // Жиры
                React.createElement('div', {
                  style: tefStyles.rangeBoxFat
                },
                  React.createElement('div', { style: tefStyles.rangeLabel }, 'Жиры'),
                  React.createElement('div', { style: tefStyles.rangeValueFat }, tefInfo.ranges.fat.label),
                  React.createElement('div', { style: tefStyles.rangeHint }, 'используем 1.5%')
                )
              ),
              // Научные источники
              React.createElement('div', {
                style: tefStyles.sourcesBlock
              },
                React.createElement('div', {
                  style: tefStyles.sourcesLabel
                }, '📚 Научные источники'),
                tefInfo.sources.map((src, i) =>
                  React.createElement('div', {
                    key: i,
                    style: tefStyles.sourceRow
                  },
                    React.createElement('span', null, src.author + ' et al., ' + src.year),
                    React.createElement('a', {
                      href: 'https://pubmed.ncbi.nlm.nih.gov/' + src.pmid,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      style: tefStyles.sourceLink,
                      onClick: (e) => e.stopPropagation()
                    }, 'PMID: ' + src.pmid)
                  )
                )
              ),
              // Кнопка закрытия
              React.createElement('button', {
                style: tefStyles.closeBtn,
                onClick: (e) => {
                  e.stopPropagation();
                  setTefInfoPopup(null);
                }
              }, '✕')
            ) // Закрываем "Контент" div
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === GOAL POPUP (объяснение формулы цели) ===
      goalPopup && (() => {
        const popupW = 280;
        const popupH = 240;
        const pos = getSmartPopupPosition(
          goalPopup.x,
          goalPopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        const d = goalPopup.data;
        const goalPopupMeta = vmComputed.goalPopupMeta;
        const goalStyles = goalPopupMeta.styles;

        // Формула: baseExpenditure × (1 + deficitPct/100) + dailyBoost = displayOptimum
        const baseOptimumCalc = goalPopupMeta.baseOptimumCalc ?? Math.round(d.baseExpenditure * (1 + d.deficitPct / 100));

        return PopupWithBackdrop({
          onClose: () => setGoalPopup(null),
          children: React.createElement('div', {
            className: 'goal-popup',
            style: popupPositionStyle ? popupPositionStyle(goalStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Заголовок
            React.createElement('div', {
              style: goalStyles.title
            }, '🎯 Как считается цель'),

            // Строки формулы
            React.createElement('div', { style: goalStyles.rows },
              // 1. База
              React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel }, 'База (без TEF)'),
                React.createElement('span', { style: goalStyles.rowValue }, d.baseExpenditure + ' ккал')
              ),
              // 2. Дефицит
              React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel },
                  d.deficitPct >= 0 ? 'Профицит ' + d.deficitPct + '%' : 'Дефицит ' + Math.abs(d.deficitPct) + '%'
                ),
                React.createElement('span', { style: goalStyles.deficitValue },
                  (d.deficitPct >= 0 ? '+' : '') + Math.round(d.baseExpenditure * d.deficitPct / 100) + ' ккал'
                )
              ),
              // Разделитель
              React.createElement('div', { style: goalStyles.separatorDashed }),
              // 3. Базовая цель
              React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel }, 'Базовая цель'),
                React.createElement('span', { style: goalStyles.rowValue }, baseOptimumCalc + ' ккал')
              ),
              // 4. Долг (если есть)
              d.dailyBoost > 0 && React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.boostLabel }, '💰 Компенсация долга'),
                React.createElement('span', { style: goalStyles.boostValue }, '+' + Math.round(d.dailyBoost) + ' ккал')
              ),
              // 5. Refeed (если есть)
              d.isRefeedDay && d.refeedBoost > 0 && React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.refeedLabel }, '🍕 Refeed день'),
                React.createElement('span', { style: goalStyles.refeedValue }, '+' + Math.round(d.refeedBoost) + ' ккал')
              ),
              // Итого
              React.createElement('div', { style: goalStyles.totalWrap },
                React.createElement('div', { style: goalStyles.row },
                  React.createElement('span', { style: goalStyles.totalLabel }, 'Итого цель'),
                  React.createElement('span', { style: goalStyles.totalValue }, d.displayOptimum + ' ккал')
                )
              )
            ),

            // Пояснение про TEF
            React.createElement('div', {
              style: goalStyles.tefNote
            }, '💡 Цель считается без TEF (термического эффекта пищи), чтобы норма не росла от съеденного.'),

            // Кнопка закрытия
            React.createElement('button', {
              style: goalStyles.closeBtn,
              onClick: (e) => {
                e.stopPropagation();
                setGoalPopup(null);
              }
            }, '✕')
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === DEBT SCIENCE POPUP (научное объяснение калорийного долга) ===
      debtSciencePopup && (() => {
        const popupW = 320;
        const popupH = 340;
        const { title, content, links } = debtSciencePopup;
        const debtScienceStyles = debtSciencePopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setDebtSciencePopup(null),
          children: React.createElement('div', {
            className: 'debt-science-popup',
            style: popupPositionStyle ? popupPositionStyle(debtScienceStyles.popup, null, null, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Заголовок
            React.createElement('div', {
              style: debtScienceStyles.title
            }, title),

            // Контент — вопросы и ответы
            React.createElement('div', { style: debtScienceStyles.content },
              content.map((item, idx) =>
                React.createElement('div', { key: idx, style: debtScienceStyles.item },
                  React.createElement('div', {
                    style: debtScienceStyles.itemLabel
                  }, item.label),
                  React.createElement('div', {
                    style: debtScienceStyles.itemValue
                  }, item.value)
                )
              )
            ),

            // Научные ссылки
            links && links.length > 0 && React.createElement('div', {
              style: debtScienceStyles.links
            },
              React.createElement('span', {
                style: debtScienceStyles.linksLabel
              }, '📚 Источники:'),
              links.map((link, idx) =>
                React.createElement('a', {
                  key: idx,
                  href: link.url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  style: debtScienceStyles.link
                }, link.text)
              )
            ),

            // Кнопка закрытия
            React.createElement('button', {
              style: debtScienceStyles.closeBtn,
              onClick: (e) => {
                e.stopPropagation();
                setDebtSciencePopup(null);
              }
            }, '✕')
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === METRIC POPUP (вода, шаги, калории) ===
      metricPopup && (() => {
        // Позиционирование с защитой от выхода за экран
        const popupW = 280;
        const popupH = 320; // Примерная высота
        const pos = getSmartPopupPosition(
          metricPopup.x,
          metricPopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const history = metricPopupMeta.history || [];
        const sparkMax = metricPopupMeta.sparkMax || 1;
        const streak = metricPopupMeta.streak || 0;
        const diff = metricPopupMeta.diff;
        const config = metricPopupMeta.config || { icon: '•', name: 'Метрика', unit: '', color: '#64748b', goal: 0 };
        const ratio = metricPopupMeta.ratio ?? (metricPopup.data.ratio || 0);
        const pct = metricPopupMeta.pct ?? Math.round(ratio * 100);
        const gradient = metricPopupMeta.gradient || 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
        const metricPopupStyles = metricPopupMeta.styles;
        const metricSparkStyles = metricPopupMeta.sparkStyles;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setMetricPopup(null));

        return PopupWithBackdrop({
          onClose: () => setMetricPopup(null),
          children: React.createElement('div', {
            className: 'metric-popup' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': config.name + ' — ' + pct + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(metricPopupStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса
            React.createElement('div', {
              className: 'metric-popup-stripe',
              style: metricPopupStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'metric-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'metric-popup-swipe' }),
              // Header
              React.createElement('div', { className: 'metric-popup-header' },
                React.createElement('span', { className: 'metric-popup-title' }, config.icon + ' ' + config.name),
                React.createElement('span', {
                  className: 'metric-popup-pct',
                  style: metricPopupStyles.pct || undefined
                }, pct + '%')
              ),
              // Sparkline
              React.createElement('div', { className: 'metric-popup-sparkline' },
                React.createElement('svg', { viewBox: '0 0 70 20', className: 'metric-popup-spark-svg' },
                  // Goal line
                  React.createElement('line', {
                    x1: 0, y1: 20 - (config.goal / sparkMax * 18),
                    x2: 70, y2: 20 - (config.goal / sparkMax * 18),
                    stroke: metricSparkStyles?.goalLine?.stroke,
                    strokeWidth: metricSparkStyles?.goalLine?.strokeWidth,
                    strokeDasharray: metricSparkStyles?.goalLine?.strokeDasharray
                  }),
                  // Points and lines
                  history.map((val, i) => {
                    const x = i * 10 + 5;
                    const y = 20 - (val / sparkMax * 18);
                    const nextVal = history[i + 1];
                    const isToday = i === 6;
                    const pointStyle = isToday ? metricSparkStyles?.pointToday : metricSparkStyles?.point;
                    return React.createElement('g', { key: i },
                      nextVal !== undefined && React.createElement('line', {
                        x1: x, y1: y,
                        x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                        stroke: metricSparkStyles?.connector?.stroke,
                        strokeWidth: metricSparkStyles?.connector?.strokeWidth,
                        strokeOpacity: metricSparkStyles?.connector?.strokeOpacity
                      }),
                      React.createElement('circle', {
                        cx: x, cy: y,
                        r: pointStyle?.r != null ? pointStyle.r : (isToday ? 3 : 2),
                        fill: pointStyle?.fill || (isToday ? config.color : '#94a3b8')
                      })
                    );
                  })
                ),
                React.createElement('span', { className: 'metric-popup-spark-label' }, '7 дней')
              ),
              // Progress bar
              React.createElement('div', { className: 'metric-popup-progress' },
                React.createElement('div', {
                  className: 'metric-popup-progress-fill',
                  style: metricPopupStyles.progressFill || undefined
                })
              ),
              // Value
              React.createElement('div', { className: 'metric-popup-value' },
                React.createElement('span', { style: metricPopupStyles.value || undefined },
                  metricPopupMeta.valueText || ''
                ),
                React.createElement('span', { className: 'metric-popup-goal' },
                  ' / ' + (metricPopupMeta.goalText || '')
                ),
                // Yesterday compare
                metricPopupMeta.compareText && React.createElement('span', {
                  className: 'metric-popup-compare' + (metricPopupMeta.compareClass || ''),
                }, metricPopupMeta.compareText)
              ),
              // Extra info per type
              metricPopup.type === 'water' && metricPopup.data.breakdown && React.createElement('div', { className: 'metric-popup-extra' },
                React.createElement('span', null, '⚖️ База: ' + metricPopup.data.breakdown.base + 'мл'),
                metricPopup.data.breakdown.stepsBonus > 0 && React.createElement('span', null, ' 👟+' + metricPopup.data.breakdown.stepsBonus),
                metricPopup.data.breakdown.trainBonus > 0 && React.createElement('span', null, ' 🏃+' + metricPopup.data.breakdown.trainBonus)
              ),
              metricPopup.type === 'steps' && React.createElement('div', { className: 'metric-popup-extra' },
                React.createElement('span', null, '🔥 Сожжено: '),
                React.createElement('b', null, metricPopup.data.kcal + ' ккал')
              ),
              metricPopup.type === 'kcal' && React.createElement('div', { className: 'metric-popup-extra' },
                React.createElement('span', null, metricPopup.data.remaining >= 0 ? '✅ Осталось: ' : '⚠️ Перебор: '),
                React.createElement('b', null, Math.abs(metricPopup.data.remaining) + ' ккал')
              ),
              // Streak
              streak > 0 && React.createElement('div', { className: 'metric-popup-streak' },
                React.createElement('span', null, '🏆'),
                React.createElement('span', null, streak + ' ' + (streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней') + ' подряд!')
              ),
              // Water reminder
              metricPopup.type === 'water' && metricPopup.data.lastDrink && metricPopup.data.lastDrink.isLong && React.createElement('div', { className: 'metric-popup-reminder' },
                React.createElement('span', null, '⏰ ' + metricPopup.data.lastDrink.text)
              ),
              // Close button
              React.createElement('button', {
                className: 'metric-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setMetricPopup(null)
              }, '✕')
            ),
            // Arrow
            React.createElement('div', {
              className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Fallback: нет данных о весе, но есть калории
      (!weightTrend && kcalTrend) && React.createElement('div', {
        className: 'correlation-block correlation-clickable',
        onClick: () => {
          haptic('light');
          setToastVisible(true);
          setAdviceTrigger('manual');
        }
      },
        React.createElement('span', { className: 'correlation-icon' }, '📉'),
        React.createElement('span', { className: 'correlation-text' },
          'Добавь вес для анализа связи калорий и веса'
        )
      ),
      // === Mini-heatmap недели (скрываем если нет данных — появится как сюрприз) ===
      weekHeatmapData && weekHeatmapData.withData > 0 && (() => {
        const weekHeatmapMeta = vmComputed.weekHeatmapMeta;
        const colorClass = weekHeatmapMeta.colorClass || 'deficit-warn';
        const deviationText = weekHeatmapMeta.deviationText || '';
        const deficitIcon = weekHeatmapMeta.deficitIcon || '';

        const weekWrapRange = (() => {
          const dates = (weekHeatmapDaysMeta || []).map((d) => d.date).filter(Boolean);
          if (dates.length && HEYS.SparklinesShared?.formatDateRange) {
            return HEYS.SparklinesShared.formatDateRange(dates);
          }
          if (dates.length) {
            return dates[0] + ' — ' + dates[dates.length - 1];
          }
          return 'Итоги недели';
        })();

        const openWeeklyWrapPopup = (e) => {
          e.stopPropagation();
          haptic('light');
          if (HEYS.weeklyReports?.openWeeklyWrap) {
            HEYS.weeklyReports.openWeeklyWrap({
              lsGet,
              profile: prof,
              pIndex
            });
          }
        };

        return React.createElement('div', {
          className: 'week-heatmap'
        },
          React.createElement('div', { className: 'week-heatmap-header' },
            React.createElement('span', { className: 'week-heatmap-title' }, '📅 Неделя'),
            weekHeatmapData.streak >= 2 && React.createElement('span', {
              className: 'week-heatmap-streak'
            }, '🔥 ' + weekHeatmapData.streak),
            React.createElement('div', {
              className: 'week-heatmap-action-wrap',
              role: 'button',
              tabIndex: 0,
              title: 'Итоги недели: ' + weekWrapRange,
              'aria-label': 'Итоги недели: ' + weekWrapRange,
              onClick: openWeeklyWrapPopup,
              onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openWeeklyWrapPopup(e);
                }
              }
            },
              React.createElement('span', { className: 'week-heatmap-action-label' }, 'Сравнить неделю'),
              React.createElement('button', {
                className: 'week-heatmap-action',
                title: 'Итоги недели: ' + weekWrapRange,
                'aria-label': 'Итоги недели: ' + weekWrapRange,
                onClick: (e) => {
                  e.stopPropagation();
                  openWeeklyWrapPopup(e);
                }
              }, '📊')
            )
          ),
          // Grid с днями недели + статистика X/Y в норме
          React.createElement('div', { className: 'week-heatmap-row' },
            React.createElement('div', { className: 'week-heatmap-grid' },
              (weekHeatmapDaysMeta || []).map((d, i) =>
                React.createElement('div', {
                  key: i,
                  className: d.className,
                  title: d.title,
                  style: d.style,
                  onClick: () => {
                    if (!d.isFuture && d.status !== 'empty') {
                      selectDateWithPrefetch(d.date, {
                        reason: 'week-heatmap',
                        prefetchDates: weekHeatmapDates
                      });
                    }
                  }
                },
                  React.createElement('span', { className: 'week-heatmap-date' }, d.dayNumber),
                  React.createElement('span', { className: 'week-heatmap-name' }, d.name),
                  React.createElement('div', {
                    className: 'week-heatmap-cell',
                    style: d.cellStyle
                  },
                    // Эмодзи пиццы для refeed дней, огонёк для идеальных
                    d.isRefeedDay && React.createElement('span', {
                      className: 'week-heatmap-refeed-emoji',
                      style: d.emojiStyle
                    }, '🍕'),
                    !d.isRefeedDay && d.isStreakDay && React.createElement('span', {
                      className: 'week-heatmap-perfect-emoji',
                      style: d.emojiStyle
                    }, '🔥')
                  )
                )
              )
            ),
            // Статистика X/Y в норме справа от квадратиков (кликабельно)
            React.createElement('span', {
              className: 'week-heatmap-norm',
              onClick: (e) => {
                e.stopPropagation();
                haptic('light');
                openExclusivePopup('weekNorm', {
                  days: weekHeatmapData.days,
                  inNorm: weekHeatmapData.inNorm,
                  withData: weekHeatmapData.withData,
                  x: e.clientX,
                  y: e.clientY
                });
              },
              title: 'Нажмите для подробностей'
            },
              weekHeatmapData.inNorm + '/' + weekHeatmapData.withData + ' в норме'
            )
          ),
          // === Блок статистики дефицита/жира внутри heatmap ===
          weekHeatmapData.totalEaten > 0 && (() => {
            const deficitMeta = vmComputed.weekHeatmapDeficitMeta;
            const {
              totalEaten,
              totalBurned,
              targetDef,
              diffPct,
              pctColor,
              diffSign,
              targetSign,
              deficitKcal,
              fatBurnedText,
              colorClass,
              styles: deficitStyles
            } = deficitMeta;

            return React.createElement('div', {
              className: 'week-heatmap-deficit ' + (colorClass || 'mixed'),
              onClick: (e) => {
                e.stopPropagation();
                haptic('light');
                const rect = e.currentTarget.getBoundingClientRect();
                if (deficitMeta.popupData) {
                  setWeekDeficitPopup({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    data: deficitMeta.popupData
                  });
                }
              }
            },
              weekHeatmapData.todayExcluded && React.createElement('span', {
                className: 'week-heatmap-deficit-excluded'
              }, 'Сегодня не учтён'),
              React.createElement('span', { style: deficitStyles?.stack },
                // Первая строка: потрачено / съедено + процент
                React.createElement('span', { style: deficitStyles?.row },
                  React.createElement('span', { style: deficitStyles?.value }, totalBurned?.toLocaleString('ru')),
                  React.createElement('span', { style: deficitStyles?.slash }, '/'),
                  React.createElement('span', { style: deficitStyles?.value }, totalEaten?.toLocaleString('ru')),
                  React.createElement('span', { style: deficitMeta.pctStyle || deficitStyles?.pct }, (diffSign || '') + diffPct + '%')
                ),
                React.createElement('span', { className: 'week-heatmap-deficit-target' },
                  React.createElement('span', { className: 'week-heatmap-deficit-target-line' },
                    'Средняя цель была ' + (targetSign || '') + targetDef + '%',
                    deficitMeta.hasRefeedInWeek && React.createElement('span', { className: 'week-heatmap-deficit-badge' }, 'Был рефид')
                  )
                ),
                // Вторая строка: сожжённый жир
                fatBurnedText && React.createElement('span', {
                  style: deficitStyles?.fatText,
                  title: 'Научный расчёт: дефицит ' + deficitKcal + ' ккал × 77% / 7.7 ккал/г'
                }, '🔥 −' + fatBurnedText)
              )
            );
          })()
        );
      })(),
      // Спарклайн веса — показываем если есть хотя бы 1 точка (вес из профиля)
      weightSparklineData.length >= 1 && React.createElement('div', {
        className: 'weight-sparkline-container' +
          (weightTrend?.direction === 'down' ? ' trend-down' :
            weightTrend?.direction === 'up' ? ' trend-up' : ' trend-same')
      },
        React.createElement('div', { className: 'weight-sparkline-header' },
          React.createElement('span', { className: 'weight-sparkline-title' }, '⚖️ Вес'),
          // Badges показываем только когда есть тренд (2+ точки)
          weightSparklineData.length >= 2 && weightTrend && React.createElement('div', { className: 'weight-sparkline-badges' },
            React.createElement('span', {
              className: 'weight-trend-badge' +
                (weightTrend.direction === 'down' ? ' down' :
                  weightTrend.direction === 'up' ? ' up' : ' same')
            },
              weightTrend.direction === 'down' ? '↓' :
                weightTrend.direction === 'up' ? '↑' : '→',
              ' ', weightTrend.text
            ),
            monthForecast && React.createElement('span', {
              className: 'weight-forecast-badge' +
                (monthForecast.direction === 'down' ? ' down' :
                  monthForecast.direction === 'up' ? ' up' : '')
            }, monthForecast.text),
            // Бейдж "чистый тренд" если дни с задержкой воды исключены
            weightTrend.isCleanTrend && React.createElement('span', {
              className: 'weight-clean-trend-badge',
              title: 'Дни с задержкой воды исключены из тренда'
            }, '🌸 чистый')
          ) // закрываем badges div
        ), // закрываем условие weightSparklineData.length >= 2
        renderWeightSparkline(weightSparklineData),
        // Сноска о задержке воды если есть такие дни
        weightSparklineData.some(d => d.hasWaterRetention) && React.createElement('div', {
          className: 'weight-retention-note'
        },
          React.createElement('span', { className: 'weight-retention-note-icon' }, '🌸'),
          React.createElement('div', { className: 'weight-retention-note-content' },
            // Основной текст
            React.createElement('span', { className: 'weight-retention-note-text' },
              'Розовые зоны — дни с возможной задержкой воды (',
              React.createElement('b', null, '+1-3 кг'),
              '). Это НЕ жир!'
            ),
            // Прогноз нормализации
            cycleHistoryAnalysis?.forecast?.message && React.createElement('div', {
              className: 'weight-retention-forecast'
            },
              '⏱️ ', cycleHistoryAnalysis.forecast.message
            ),
            // Персональный инсайт из истории
            cycleHistoryAnalysis?.hasSufficientData && cycleHistoryAnalysis?.insight && React.createElement('div', {
              className: 'weight-retention-insight'
            },
              '📊 ', cycleHistoryAnalysis.insight
            ),
            // Статистика по циклам (если >=2 циклов)
            cycleHistoryAnalysis?.cyclesAnalyzed >= 2 && React.createElement('div', {
              className: 'weight-retention-stats'
            },
              'Твоя типичная задержка: ',
              React.createElement('b', null, '~' + cycleHistoryAnalysis.avgRetentionKg + ' кг'),
              ' (на основе ', cycleHistoryAnalysis.cyclesAnalyzed, ' циклов)'
            )
          )
        )
      ),
      // Подсказка если целевой вес не задан — прогноз идёт к стабилизации
      !prof?.weightGoal && weightSparklineData.some(d => d.isFuture) && React.createElement('div', {
        className: 'weight-goal-hint'
      },
        '💡 Укажи ',
        React.createElement('button', {
          className: 'weight-goal-hint-link',
          onClick: (e) => {
            e.preventDefault();
            // Открываем профиль (как ссылка на настройки)
            if (openProfileModal) {
              openProfileModal();
            } else {
              // Fallback: переключаем на вкладку профиля
              const profileTab = document.querySelector('[data-tab="profile"]');
              if (profileTab) profileTab.click();
            }
          }
        }, 'целевой вес'),
        ' в профиле — прогноз будет точнее!'
      ),
      // Popup с деталями веса при клике на точку — V2 STYLE
      sparklinePopup && sparklinePopup.type === 'weight' && (() => {
        const point = sparklinePopup.point;
        const popupW = 240;
        const popupH = 180;
        const pos = getSmartPopupPosition(
          sparklinePopup.x,
          sparklinePopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const trend = weightPopupMeta.trend ?? (point.localTrend || 0);
        const color = weightPopupMeta.color || '#6b7280';
        const weightStyles = weightPopupMeta.styles;
        const trendIcon = weightPopupMeta.trendIcon || '→';
        const trendText = weightPopupMeta.trendText || ((trend > 0 ? '+' : '') + trend.toFixed(1) + ' кг');

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': 'Вес ' + point.weight + ' кг',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(weightStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: weightStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: дата + тренд
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' },
                  point.isToday ? '📅 Сегодня' : '📅 ' + point.dayNum + ' число'
                ),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: weightStyles.pct || undefined
                }, trendIcon + ' ' + trendText)
              ),
              // Основное значение веса
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: weightStyles.value || undefined },
                  '⚖️ ' + point.weight + ' кг'
                )
              ),
              // Теги: если есть данные о дне
              (point.sleepHours > 0 || point.steps > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.steps > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString())
              ),
              // Кнопка перехода
              !point.isToday && point.date && React.createElement('button', {
                className: 'sparkline-popup-btn-v2',
                onClick: () => {
                  setSparklinePopup(null);
                  selectDateWithPrefetch(point.date, { reason: 'sparkline-weight' });
                }
              }, '→ Перейти к дню'),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка
            React.createElement('div', {
              className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Popup для прогноза веса — V2 STYLE
      sparklinePopup && sparklinePopup.type === 'weight-forecast' && (() => {
        const point = sparklinePopup.point;
        const popupW = 240;
        const popupH = 160;
        const pos = getSmartPopupPosition(
          sparklinePopup.x,
          sparklinePopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const change = weightForecastPopupMeta.change ?? (point.forecastChange || 0);
        const color = weightForecastPopupMeta.color || '#6b7280';
        const forecastStyles = weightForecastPopupMeta.styles;
        const trendIcon = weightForecastPopupMeta.trendIcon || '→';
        const trendText = weightForecastPopupMeta.trendText || ((change > 0 ? '+' : '') + change.toFixed(1) + ' кг');

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': 'Прогноз веса ~' + point.weight + ' кг',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(forecastStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса (градиент для прогноза)
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: forecastStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: прогноз + изменение
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' },
                  '🔮 Прогноз на ' + point.dayNum
                ),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: forecastStyles.pct || undefined
                }, trendIcon + ' ' + trendText)
              ),
              // Основное значение
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: forecastStyles.value || undefined },
                  '⚖️ ~' + point.weight + ' кг'
                )
              ),
              // Подсказка
              React.createElement('div', { className: 'sparkline-popup-hint-v2' },
                'На основе тренда последних дней'
              ),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка
            React.createElement('div', {
              className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Контейнер: Макро-кольца + Плашка веса
      React.createElement('div', { className: 'macro-weight-row' },
        // Макро-бар БЖУ (в стиле Apple Watch колец)
        (() => {
          const macroRingsMeta = vmComputed.macroRingsMeta;
          const protRatio = macroRingsMeta.protRatio ?? ((dayTot.prot || 0) / (normAbs.prot || 1));
          const fatRatio = macroRingsMeta.fatRatio ?? ((dayTot.fat || 0) / (normAbs.fat || 1));
          const carbsRatio = macroRingsMeta.carbsRatio ?? ((dayTot.carbs || 0) / (normAbs.carbs || 1));

          const ringStartOffsetPct = 9;
          const ringCapCompPct = 5;
          const getRingDot = (ratio) => {
            const pctRaw = Math.max(0, Math.min(100, Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)) - ringCapCompPct);
            const dotPct = Math.max(0, pctRaw - 3); // слегка смещаем точку назад, чтобы оставался стартовый интервал
            if (dotPct <= 0) return null;
            const angle = ((dotPct + ringStartOffsetPct) / 100) * Math.PI * 2;
            return {
              x: 18 + 15.5 * Math.cos(angle),
              y: 18 + 15.5 * Math.sin(angle)
            };
          };

          const getDotColor = (ratio) => (ratio > 1 ? '#ef4444' : '#22c55e');
          const protDot = getRingDot(protRatio);
          const fatDot = getRingDot(fatRatio);
          const carbsDot = getRingDot(carbsRatio);
          const protDotColor = getDotColor(protRatio);
          const fatDotColor = getDotColor(fatRatio);
          const carbsDotColor = getDotColor(carbsRatio);

          const protColor = macroRingsMeta.protColor || '#6b7280';
          const fatColor = macroRingsMeta.fatColor || '#6b7280';
          const carbsColor = macroRingsMeta.carbsColor || '#6b7280';

          const protBadges = macroRingsMeta.protBadges || [];
          const fatBadges = macroRingsMeta.fatBadges || [];
          const carbsBadges = macroRingsMeta.carbsBadges || [];

          // Рендер бейджей с popup по тапу
          const renderBadges = (badges, macro, value, norm, ratio, color) => {
            if (!badges || badges.length === 0) return null;
            return React.createElement('div', { className: 'macro-ring-badges' },
              badges.map((b, i) => React.createElement('span', {
                key: i,
                className: 'macro-ring-badge',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  setMacroBadgePopup({
                    macro,
                    emoji: b.emoji,
                    desc: b.desc,
                    value: Math.round(value),
                    norm: Math.round(norm),
                    ratio,
                    color,
                    allBadges: badges,
                    x: rect.left + rect.width / 2,
                    y: rect.top
                  });
                  haptic('light');
                }
              }, b.emoji))
            );
          };

          // Функция открытия popup для круга
          const openRingPopup = (e, macro, value, norm, ratio, color, badges) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMacroBadgePopup({
              macro,
              emoji: null,
              desc: null,
              value: Math.round(value || 0),
              norm: Math.round(norm || 0),
              ratio,
              color,
              allBadges: badges || [],
              x: rect.left + rect.width / 2,
              y: rect.bottom
            });
            haptic('light');
          };

          // Получаем данные о переборе из ViewModel
          const protOverData = macroRingsMeta.protOverData || { hasOver: false, overPct: 0 };
          const fatOverData = macroRingsMeta.fatOverData || { hasOver: false, overPct: 0 };
          const carbsOverData = macroRingsMeta.carbsOverData || { hasOver: false, overPct: 0 };

          return React.createElement('div', { className: 'macro-rings' },
            // Белки
            React.createElement('div', { className: 'macro-ring-item' },
              React.createElement('div', {
                className: 'macro-ring' + (protOverData.hasOver ? ' macro-ring--over' : '') + (protColor === '#ef4444' ? ' macro-ring-pulse' : ''),
                onClick: (e) => openRingPopup(e, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor, protBadges),
                style: macroRingsMeta.styles?.ringButton
              },
                React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', {
                      id: 'macro-ring-gradient-protein',
                      x1: '0%', y1: '0%', x2: '100%', y2: '100%'
                    },
                      React.createElement('stop', { offset: '0%', stopColor: '#fecaca' }),
                      React.createElement('stop', { offset: '100%', stopColor: '#ef4444' })
                    )
                  ),
                  React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
                  React.createElement('circle', {
                    className: 'macro-ring-fill',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: macroRingsMeta.protRingStrokeStyle
                  }),
                  // Красная дуга перебора
                  protOverData.hasOver && React.createElement('circle', {
                    className: 'macro-ring-fill--over',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: {
                      strokeDasharray: protOverData.overPct + ' ' + (100 - protOverData.overPct),
                      '--over-dasharray': protOverData.overPct + ' ' + (100 - protOverData.overPct),
                      '--over-offset': -(100 - protOverData.overPct),
                      stroke: '#22c55e'
                    }
                  }),
                  protDot && React.createElement('circle', {
                    className: 'macro-ring-dot',
                    cx: protDot.x,
                    cy: protDot.y,
                    r: 2.2,
                    style: { '--macro-ring-dot': protDotColor }
                  }),
                  // Маркер убран по просьбе
                ),
                React.createElement('span', { className: 'macro-ring-value', style: macroRingsMeta.styles?.value ? macroRingsMeta.styles.value(protColor) : undefined },
                  Math.round(dayTot.prot || 0)
                )
              ),
              React.createElement('span', { className: 'macro-ring-label' }, 'Белки'),
              React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.prot || 0) + 'г'),
              renderBadges(protBadges, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor)
            ),
            // Жиры
            React.createElement('div', { className: 'macro-ring-item' },
              React.createElement('div', {
                className: 'macro-ring' + (fatOverData.hasOver ? ' macro-ring--over' : '') + (fatColor === '#ef4444' ? ' macro-ring-pulse' : ''),
                onClick: (e) => openRingPopup(e, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor, fatBadges),
                style: macroRingsMeta.styles?.ringButton
              },
                React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', {
                      id: 'macro-ring-gradient-fat',
                      x1: '0%', y1: '0%', x2: '100%', y2: '100%'
                    },
                      React.createElement('stop', { offset: '0%', stopColor: '#fde68a' }),
                      React.createElement('stop', { offset: '100%', stopColor: '#f59e0b' })
                    )
                  ),
                  React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
                  React.createElement('circle', {
                    className: 'macro-ring-fill',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: macroRingsMeta.fatRingStrokeStyle
                  }),
                  // Красная дуга перебора
                  fatOverData.hasOver && React.createElement('circle', {
                    className: 'macro-ring-fill--over',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: {
                      strokeDasharray: fatOverData.overPct + ' ' + (100 - fatOverData.overPct),
                      '--over-dasharray': fatOverData.overPct + ' ' + (100 - fatOverData.overPct),
                      '--over-offset': -(100 - fatOverData.overPct),
                      stroke: '#ef4444'
                    }
                  }),
                  fatDot && React.createElement('circle', {
                    className: 'macro-ring-dot',
                    cx: fatDot.x,
                    cy: fatDot.y,
                    r: 2.2,
                    style: { '--macro-ring-dot': fatDotColor }
                  }),
                  // Маркер убран по просьбе
                ),
                React.createElement('span', { className: 'macro-ring-value', style: macroRingsMeta.styles?.value ? macroRingsMeta.styles.value(fatColor) : undefined },
                  Math.round(dayTot.fat || 0)
                )
              ),
              React.createElement('span', { className: 'macro-ring-label' }, 'Жиры'),
              React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.fat || 0) + 'г'),
              renderBadges(fatBadges, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor)
            ),
            // Углеводы
            React.createElement('div', { className: 'macro-ring-item' },
              React.createElement('div', {
                className: 'macro-ring' + (carbsOverData.hasOver ? ' macro-ring--over' : '') + (carbsColor === '#ef4444' ? ' macro-ring-pulse' : ''),
                onClick: (e) => openRingPopup(e, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor, carbsBadges),
                style: macroRingsMeta.styles?.ringButton
              },
                React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', {
                      id: 'macro-ring-gradient-carbs',
                      x1: '0%', y1: '0%', x2: '100%', y2: '100%'
                    },
                      React.createElement('stop', { offset: '0%', stopColor: '#bbf7d0' }),
                      React.createElement('stop', { offset: '100%', stopColor: '#22c55e' })
                    )
                  ),
                  React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
                  React.createElement('circle', {
                    className: 'macro-ring-fill',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: macroRingsMeta.carbsRingStrokeStyle
                  }),
                  // Красная дуга перебора
                  carbsOverData.hasOver && React.createElement('circle', {
                    className: 'macro-ring-fill--over',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: {
                      strokeDasharray: carbsOverData.overPct + ' ' + (100 - carbsOverData.overPct),
                      '--over-dasharray': carbsOverData.overPct + ' ' + (100 - carbsOverData.overPct),
                      '--over-offset': -(100 - carbsOverData.overPct),
                      stroke: '#ef4444'
                    }
                  }),
                  carbsDot && React.createElement('circle', {
                    className: 'macro-ring-dot',
                    cx: carbsDot.x,
                    cy: carbsDot.y,
                    r: 2.2,
                    style: { '--macro-ring-dot': carbsDotColor }
                  }),
                  // Маркер убран по просьбе
                ),
                React.createElement('span', { className: 'macro-ring-value', style: macroRingsMeta.styles?.value ? macroRingsMeta.styles.value(carbsColor) : undefined },
                  Math.round(dayTot.carbs || 0)
                )
              ),
              React.createElement('span', { className: 'macro-ring-label' }, 'Углеводы'),
              React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.carbs || 0) + 'г'),
              renderBadges(carbsBadges, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor)
            )
          );
        })(),
        // Плашка веса - кликабельная целиком
        React.createElement('div', {
          className: 'weight-card-modern' + (day.weightMorning ? '' : ' weight-card-empty'),
          onClick: openWeightPicker
        },
          // Лейбл "Вес" сверху
          React.createElement('span', { className: 'weight-card-label' }, 'ВЕС НА УТРО'),
          // Значение веса
          React.createElement('div', { className: 'weight-card-row' },
            React.createElement('span', { className: 'weight-value-number' },
              day.weightMorning ? r1(day.weightMorning) : '—'
            ),
            React.createElement('span', { className: 'weight-value-unit' }, 'кг')
          ),
          // Тренд под значением + DEV кнопка очистки
          day.weightMorning && React.createElement('div', { className: 'weight-trend-row' },
            weightTrend && React.createElement('div', {
              className: 'weight-card-trend ' + (weightTrend.direction === 'down' ? 'trend-down' : weightTrend.direction === 'up' ? 'trend-up' : 'trend-same')
            },
              React.createElement('span', { className: 'trend-arrow' }, weightTrend.direction === 'down' ? '↓' : weightTrend.direction === 'up' ? '↑' : '→'),
              weightTrend.text.replace(/[^а-яА-Я0-9.,\-+\s]/g, '').trim()
            ),
            // DEV: Мини-кнопка очистки веса
            React.createElement('button', {
              className: 'dev-clear-weight-mini',
              onClick: (e) => {
                e.stopPropagation();
                if (!confirm('🗑️ Очистить вес за сегодня?\n\nЭто позволит увидеть Morning Check-in заново.')) return;
                // Сразу сбрасываем вес и сон, чтобы чек-ин показался снова
                setDay(prev => ({
                  ...prev,
                  weightMorning: '',
                  sleepStart: '',
                  sleepEnd: '',
                  sleepHours: '',
                  sleepQuality: '',
                  updatedAt: Date.now()
                }));

                // Даем React применить state, затем сохраняем и открываем чек-ин без перезагрузки
                setTimeout(() => {
                  try {
                    if (Day && typeof Day.requestFlush === 'function') {
                      Day.requestFlush();
                    }
                    if (showCheckin && typeof showCheckin.morning === 'function') {
                      showCheckin.morning();
                    } else if (showCheckin && typeof showCheckin.weight === 'function') {
                      showCheckin.weight();
                    }
                  } catch (err) {
                    // Ничего: не мешаем UX, если чек-ин не доступен
                  }
                }, 50);
              },
              title: 'DEV: Очистить вес для теста Morning Check-in'
            }, '×')
          )
        ),
        // Плашка дефицита - кликабельная
        (() => {
          // Фактический дефицит: (съедено - затраты) / затраты * 100
          // TDEE уже включает TEF, используем его напрямую
          const actualDeficitPct = tdee > 0 ? Math.round(((eatenKcal - tdee) / tdee) * 100) : null;
          const showActualDeficit = actualDeficitPct !== null && eatenKcal > 0;

          return React.createElement('div', {
            className: 'deficit-card-modern',
            onClick: openDeficitPicker
          },
            React.createElement('span', { className: 'weight-card-label' }, 'ЦЕЛЬ ДЕФИЦИТ'),
            React.createElement('div', { className: 'weight-card-row' },
              React.createElement('span', {
                className: 'deficit-value-number' + (currentDeficit < 0 ? ' deficit-negative' : currentDeficit > 0 ? ' deficit-positive' : '')
              },
                (currentDeficit > 0 ? '+' : '') + currentDeficit
              ),
              React.createElement('span', { className: 'weight-value-unit' }, '%')
            ),
            // Фактический дефицит (если есть данные)
            showActualDeficit && React.createElement('div', {
              className: 'deficit-card-actual'
            },
              React.createElement('span', { className: 'deficit-actual-label' }, 'Факт: '),
              React.createElement('span', {
                className: 'deficit-actual-value' + (actualDeficitPct < 0 ? ' deficit-negative' : actualDeficitPct > 0 ? ' deficit-positive' : '')
              },
                (actualDeficitPct > 0 ? '+' : '') + actualDeficitPct + '%'
              )
            ),
            // Разница от профиля
            currentDeficit !== profileDeficit && React.createElement('div', {
              className: 'deficit-card-trend ' + (currentDeficit < profileDeficit ? 'trend-down' : 'trend-up')
            },
              React.createElement('span', { className: 'trend-arrow' }, currentDeficit < profileDeficit ? '↓' : '↑'),
              (currentDeficit > profileDeficit ? '+' : '') + (currentDeficit - profileDeficit) + '%'
            )
          );
        })()
      )
    );

    return statsBlock;
  }

  // Export
  HEYS.dayStats = {
    render: renderStatsBlock
  };

})(window);
