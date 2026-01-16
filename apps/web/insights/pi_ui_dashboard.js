/**
 * HEYS Predictive Insights — UI Dashboard Components Module v3.0.1
 * Extracted UI dashboard components for clean architecture
 * v3.0.1: Fixed React guard - retry mechanism instead of early return
 */

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};

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

    // Lazy getter для InfoButton с полной fallback цепочкой (fix load order)
    function getInfoButton() {
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
      WhatIfSection
    } = piUICards;

    // Получаем Ring компоненты из piUIRings
    const { TotalHealthRing } = piUIRings;

    // Получаем константы из piConstants
    const PRIORITY_LEVELS = piConstants.PRIORITY_LEVELS || {};
    const CATEGORIES = piConstants.CATEGORIES || {};
    const SCIENCE_INFO = piConstants.SCIENCE_INFO || {};
    const ACTIONABILITY = piConstants.ACTIONABILITY || {};
    const getAllMetricsByPriority = piConstants.getAllMetricsByPriority || function () {
      console.warn('[pi_ui_dashboard] getAllMetricsByPriority not available, returning empty array');
      return [];
    };

    function WeightPrediction({ prediction }) {
      if (!prediction || !prediction.available) return null;

      const changeClass = prediction.weeklyChange < -0.1 ? 'down'
        : prediction.weeklyChange > 0.1 ? 'up'
          : 'stable';
      const changeSign = prediction.weeklyChange > 0 ? '+' : '';

      return h('div', { className: 'insights-weight' },
        h('div', { className: 'insights-weight__header' },
          h('span', null, '⚖️ Прогноз веса'),
          h(getInfoButton(), {
            infoKey: 'WEIGHT_PREDICTION',
            debugData: {
              currentWeight: prediction.currentWeight,
              projectedWeight: prediction.projectedWeight,
              weeklyChange: prediction.weeklyChange,
              slope: prediction.slope,
              dataPoints: prediction.dataPoints
            }
          })
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
          h(getInfoButton(), {
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
        return HEYS.PredictiveInsights.analyze({
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
          infoKey && h(getInfoButton(), { infoKey })
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

      // 🎯 State для отслеживания прохождения тура (нужен для перерисовки после завершения)
      // 🔧 v1.13 FIX: Проверяем ОБА источника — scoped (HEYS.store) И unscoped (localStorage)
      const [insightsTourCompleted, setInsightsTourCompleted] = useState(() => {
        try {
          // 1. Сначала проверяем scoped хранилище (для существующих пользователей)
          const scopedValue = HEYS.store?.get?.('heys_insights_tour_completed');
          if (scopedValue === true || scopedValue === 'true') return true;
          // 2. Затем fallback на unscoped localStorage
          return localStorage.getItem('heys_insights_tour_completed') === 'true';
        } catch { return true; }
      });

      // Слушаем изменения localStorage для переключения из демо-режима
      useEffect(() => {
        const handleStorageChange = () => {
          try {
            // 🔧 v1.13: Проверяем оба источника
            const scopedValue = HEYS.store?.get?.('heys_insights_tour_completed');
            const unscopedValue = localStorage.getItem('heys_insights_tour_completed') === 'true';
            const completed = scopedValue === true || scopedValue === 'true' || unscopedValue;
            if (completed !== insightsTourCompleted) {
              console.log('[InsightsTab] Tour status changed:', completed, '(scoped:', scopedValue, ', unscoped:', unscopedValue, ')');
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

      // Анализ данных
      const realInsights = useMemo(() => {
        return HEYS.PredictiveInsights.analyze({
          lsGet: lsGet || (window.HEYS?.utils?.lsGet),
          daysBack: activeTab === 'today' ? 7 : 30
        });
      }, [lsGet, activeTab, selectedDate]);

      // 🎭 Используем демо-данные если тур не пройден И реальных данных нет
      const showDemoMode = !insightsTourCompleted && !realInsights.available;
      const insights = showDemoMode ? DEMO_INSIGHTS : realInsights;

      // 🆕 Расчёт статуса 0-100 (или демо)
      const status = useMemo(() => {
        if (showDemoMode) return DEMO_STATUS;
        if (!HEYS.Status?.calculateStatus) return null;
        return HEYS.Status.calculateStatus({
          dayData: dayData || {},
          profile: profile || {},
          dayTot: dayTot || {},
          normAbs: normAbs || {},
          waterGoal: waterGoal || 2000
        });
      }, [dayData, profile, dayTot, normAbs, waterGoal, showDemoMode]);

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
        return h('div', { className: 'insights-tab' },
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
        );
      }

      // Определяем какие секции показывать на основе фильтров
      const shouldShowSection = (sectionPriority) => {
        if (!priorityFilter) return true;
        return sectionPriority === priorityFilter;
      };

      return h('div', { className: 'insights-tab' },
        // === HERO HEADER ===
        h('div', { className: 'insights-tab__hero' },
          h('div', { className: 'insights-tab__header' },
            h('h2', { className: 'insights-tab__title' }, '🔮 Умная аналитика'),
            h('div', { className: 'insights-tab__subtitle' },
              activeTab === 'today'
                ? 'Анализ за 7 дней'
                : 'Глубокий анализ за 30 дней'
            )
          ),

          // Glass Tabs внутри hero
          h('div', { className: 'insights-tab__tabs' },
            h('button', {
              className: 'insights-tab__tab' + (activeTab === 'today' ? ' active' : ''),
              onClick: () => setActiveTab('today')
            }, '📅 Сегодня'),
            h('button', {
              className: 'insights-tab__tab' + (activeTab === 'week' ? ' active' : ''),
              onClick: () => setActiveTab('week')
            }, '📊 Неделя')
          ),

          // 🎯 Demo Mode Banner — показываем только в демо режиме
          showDemoMode && h('div', {
            className: 'insights-tab__demo-banner',
            style: {
              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(75, 0, 130, 0.1))',
              border: '1px solid rgba(138, 43, 226, 0.3)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              color: 'var(--color-text-secondary)'
            }
          },
            h('span', { style: { fontSize: '20px' } }, '✨'),
            h('div', null,
              h('div', { style: { fontWeight: '600', color: 'var(--color-text-primary)', marginBottom: '2px' } },
                'Демо-режим аналитики'
              ),
              h('div', null, 'Это пример данных. После 3 дней использования появится ваша реальная статистика')
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

          // ═══════════════════════════════════════════════════════════
          // 🔴 КРИТИЧЕСКИЙ ПРИОРИТЕТ — Самое важное сверху
          // ═══════════════════════════════════════════════════════════

          // L0: Status 0-100 Card (CRITICAL — показывается всегда)
          shouldShowSection('CRITICAL') && h('div', {
            className: 'insights-tab__section insights-tab__section--critical',
            id: 'tour-insights-status' // 🎯 Mini-tour target
          },
            h('div', { className: 'insights-tab__section-badge' },
              h(PriorityBadge, { priority: 'CRITICAL', showLabel: true })
            ),

            // 🆕 StatusCard вместо TotalHealthRing + HealthRingsGrid
            status && HEYS.Status?.StatusCard
              ? h(HEYS.Status.StatusCard, { status })
              : h('div', { className: 'insights-tab__score-card' },
                h('div', { className: 'insights-tab__score' },
                  h(TotalHealthRing, {
                    score: insights.healthScore.total,
                    size: 140,
                    strokeWidth: 12,
                    debugData: insights.healthScore.debug || {
                      mode: insights.healthScore.mode,
                      weights: insights.healthScore.weights,
                      breakdown: insights.healthScore.breakdown
                    }
                  })
                ),
                h('div', { className: 'insights-tab__rings' },
                  h(HealthRingsGrid, {
                    healthScore: insights.healthScore,
                    onCategoryClick: setSelectedCategory,
                    compact: true
                  })
                )
              )
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
                className: 'insights-card',
                style: {
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(109, 40, 217, 0.05))',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '16px',
                  padding: '16px',
                  minHeight: '120px'
                }
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
                  h('span', { style: { fontSize: '20px' } }, '🧬'),
                  h('span', { style: { fontWeight: '600', color: 'var(--color-text-primary)' } }, 'Метаболический фенотип')
                ),
                h('div', { style: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' } },
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

          // Data Completeness (LOW) - TODO: DataCompletenessCard not implemented in refactoring
          shouldShowSection('LOW') && h('div', { className: 'insights-tab__section insights-tab__section--low' },
            h(SectionHeader, {
              title: 'Полнота данных',
              icon: '📊',
              priority: 'LOW',
              infoKey: 'CONFIDENCE'
            }),
            h('div', {
              className: 'pi-card pi-card--low',
              style: { padding: '16px', textAlign: 'center', color: '#6b7280' }
            }, '📊 DataCompletenessCard — в разработке')
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
          h(getInfoButton(), { infoKey, debugData })
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
    function MetabolicQuickStatus({ lsGet, profile, pIndex, selectedDate }) {
      const status = useMemo(() => {
        if (!HEYS.Metabolic?.getStatus) return null;

        return HEYS.Metabolic.getStatus({
          dateStr: selectedDate || new Date().toISOString().split('T')[0],
          pIndex: pIndex || window.HEYS?.products?.buildIndex?.(),
          profile: profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
          forceRefresh: false
        });
      }, [lsGet, profile, pIndex, selectedDate]);

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
              const idx = pIndex || window.HEYS?.products?.buildIndex?.();
              let prot = 0, kcal = 0;
              (dData.meals || []).forEach(m => {
                (m.items || []).forEach(item => {
                  const prod = idx?.byId?.get?.(item.product_id) || item;
                  const g = item.grams || 0;
                  prot += (prod.protein100 || 0) * g / 100;
                  kcal += (prod.kcal100 || 0) * g / 100;
                });
              });
              if (kcal > 500) proteinDays.push({ prot, kcal, protPct: prot * 4 / kcal });
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
        } catch (e) { console.warn('[ExtendedAnalytics] proteinDebt error:', e); }

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
            const idx = pIndex || window.HEYS?.products?.buildIndex?.();
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
        } catch (e) { console.warn('[ExtendedAnalytics] emotionalRisk error:', e); }

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

        const sleepDeficit = (profile.sleepHours || 8) - (day.sleepHours || 0);
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
            color: '#22c55e'
          };
        }

        if (status === 'active' && remaining > 0) {
          return {
            status: 'wave',
            label: `⏳ ${remaining} мин до окончания волны`,
            desc: `Окончание в ${endTime}${currentPhase ? ` • Фаза: ${currentPhase}` : ''}`,
            color: '#f59e0b'
          };
        }

        if (status === 'almost') {
          return {
            status: 'almost',
            label: `⚡ ${remaining} мин до липолиза`,
            desc: 'Скоро начнётся жиросжигание',
            color: '#3b82f6'
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
          className: 'forecast-panel__wave-status',
          style: { borderColor: waveEndInfo.color }
        },
          h('div', { className: 'forecast-panel__wave-header' },
            h('div', { className: 'forecast-panel__wave-label', style: { color: waveEndInfo.color } },
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
            className: 'data-completeness-card__today-value',
            style: { color: completeness.todayCompleteness >= 80 ? '#22c55e' : completeness.todayCompleteness >= 50 ? '#eab308' : '#ef4444' }
          }, `${completeness.todayCompleteness}% заполнено`)
        ),

        // 🆕 v3.22.0: Extended Analytics Status
        h('div', { className: 'data-completeness-card__extended' },
          h('span', { className: 'data-completeness-card__extended-label' }, '🧠 Extended Analytics: '),
          h('span', {
            className: 'data-completeness-card__extended-value',
            style: { color: completeness.extendedUnlocked === completeness.extendedTotal ? '#22c55e' : '#6366f1' }
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
      ActionCard
    };

    // Backward compatibility fallback
    window.piUIDashboard = HEYS.InsightsPI.uiDashboard;

    console.log('[PI UI Dashboard] v3.0.1 loaded —', Object.keys(HEYS.InsightsPI.uiDashboard).length, 'dashboard components');
  }

  // Start initialization (will retry until React is available)
  initModule();

})(window);
