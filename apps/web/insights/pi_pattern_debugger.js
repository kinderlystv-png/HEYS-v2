// pi_pattern_debugger.js — Pattern Transparency Modal v1.0.0
// Техническая модалка для прозрачности инсайтов: показывает все паттерны, их статусы и данные
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};

  // React imports
  const { createElement: h, useState, useMemo } = window.React || {};

  /**
   * Pattern metadata — маппинг ID паттерна на метаданные
   */
  const PATTERN_METADATA = {
    // Nutrition
    meal_quality: { name: 'Динамика качества', category: 'nutrition', emoji: '📈' },
    nutrition_quality: { name: 'Качество питания', category: 'nutrition', emoji: '🥗' },
    protein_satiety: { name: 'Белок и сытость', category: 'nutrition', emoji: '🥩' },
    fiber_regularity: { name: 'Клетчатка', category: 'nutrition', emoji: '🥬' },
    gut_health: { name: 'Здоровье кишечника', category: 'nutrition', emoji: '🦠' },
    hydration: { name: 'Гидратация', category: 'nutrition', emoji: '💧' },
    micronutrient_radar: { name: 'Микронутриенты', category: 'nutrition', emoji: '🎯' },
    omega_balancer: { name: 'Омега-баланс', category: 'nutrition', emoji: '🐟' },
    nova_quality: { name: 'NOVA качество', category: 'nutrition', emoji: '🏭' },

    // Timing
    meal_timing: { name: 'Тайминг приёмов', category: 'timing', emoji: '⏰' },
    wave_overlap: { name: 'Перекрытие волн', category: 'timing', emoji: '🌊' },
    late_eating: { name: 'Поздний ужин', category: 'timing', emoji: '🌙' },
    circadian: { name: 'Циркадный ритм', category: 'timing', emoji: '☀️' },
    nutrient_timing: { name: 'Нутриент-тайминг', category: 'timing', emoji: '⚡' },
    weekend_effect: { name: 'Эффект выходных', category: 'timing', emoji: '🎉' },

    // Activity
    training_kcal: { name: 'Тренировки ккал', category: 'activity', emoji: '🏋️' },
    steps_weight: { name: 'Шаги и вес', category: 'activity', emoji: '👣' },
    neat_activity: { name: 'NEAT активность', category: 'activity', emoji: '🚶' },
    training_recovery: { name: 'Восстановление', category: 'activity', emoji: '💪' },

    // Recovery
    sleep_weight: { name: 'Сон и вес', category: 'recovery', emoji: '😴' },
    sleep_hunger: { name: 'Сон и голод', category: 'recovery', emoji: '🛌' },
    stress_eating: { name: 'Стресс-еда', category: 'recovery', emoji: '😰' },
    mood_food: { name: 'Настроение-еда', category: 'recovery', emoji: '😊' },
    mood_trajectory: { name: 'Траектория настроения', category: 'recovery', emoji: '📉' },
    sleep_quality: { name: 'Качество сна', category: 'recovery', emoji: '🌟' },
    wellbeing_correlation: { name: 'Самочувствие', category: 'recovery', emoji: '✨' },
    cycle_impact: { name: 'Цикл (женщины)', category: 'recovery', emoji: '🌸' },

    // Metabolism
    insulin_sensitivity: { name: 'Инсулин', category: 'metabolism', emoji: '💉' },
    body_composition: { name: 'Состав тела', category: 'metabolism', emoji: '⚖️' },
    heart_health: { name: 'Здоровье сердца', category: 'metabolism', emoji: '❤️' },
    hypertrophy: { name: 'Гипертрофия (спорт)', category: 'metabolism', emoji: '💪' },

    // NEW v6.0 (C13-C22)
    vitamin_defense: { name: 'Витаминная защита', category: 'nutrition', emoji: '🛡️' },
    b_complex_anemia: { name: 'B-комплекс и анемия', category: 'nutrition', emoji: '🩸' },
    glycemic_load: { name: 'Гликемическая нагрузка', category: 'nutrition', emoji: '📊' },
    protein_distribution: { name: 'Распределение белка', category: 'nutrition', emoji: '🍳' },
    antioxidant_defense: { name: 'Антиоксиданты', category: 'nutrition', emoji: '🫐' },
    added_sugar_dependency: { name: 'Добавленный сахар', category: 'nutrition', emoji: '🍬' },
    bone_health: { name: 'Здоровье костей', category: 'nutrition', emoji: '🦴' },
    training_type_match: { name: 'Питание под тренировку', category: 'activity', emoji: '🎯' },
    electrolyte_homeostasis: { name: 'Электролитный баланс', category: 'metabolism', emoji: '⚡' },
    nutrient_density: { name: 'Плотность нутриентов', category: 'nutrition', emoji: '🔬' }
  };

  const CATEGORY_LABELS = {
    nutrition: { label: 'Питание', emoji: '🥗', color: '#10b981' },
    timing: { label: 'Тайминг', emoji: '⏰', color: '#3b82f6' },
    activity: { label: 'Активность', emoji: '🏃', color: '#f59e0b' },
    recovery: { label: 'Восстановление', emoji: '😴', color: '#8b5cf6' },
    metabolism: { label: 'Метаболизм', emoji: '🔥', color: '#ef4444' }
  };

  const REASON_LABELS = {
    'module_not_loaded': 'Модуль не загружен',
    'insufficient_data': 'Недостаточно данных',
    'not_enough_days': 'Мало дней данных',
    'min_days_required': 'Мало дней данных',
    'min-data': 'Мало дней данных',
    'min-products': 'Мало продуктов в рационе',
    'min_meals_required': 'Мало приёмов пищи',
    'min_trainings_required': 'Мало тренировок',
    'no_meals': 'Нет приёмов пищи',
    'no_training': 'Нет тренировок',
    'no_sleep': 'Нет данных о сне',
    'no_weight': 'Нет данных о весе',
    'no_measurements': 'Нет замеров тела',
    'no_cycle_data': 'Нет данных о цикле',
    'no_micronutrients': 'Нет микронутриентов',
    'no_quality_function': 'Функция качества недоступна',
    'no_mood_data': 'Нет данных о настроении',
    'no_stress_data': 'Нет данных о стрессе',
    'no_steps_data': 'Нет данных о шагах',
    'no_household_data': 'Нет данных о бытовой активности',
    'no_sleep_quality': 'Нет данных о качестве сна',
    'male_only': 'Только для мужчин',
    'female_only': 'Только для женщин',
    'pindex_required': 'Требуется pIndex'
  };

  const QUICK_ACTIONS_BY_REASON = {
    no_training: { action: 'open_training', label: 'Добавить тренировку' },
    no_steps_data: { action: 'open_steps', label: 'Указать шаги' },
    no_household_data: { action: 'open_household', label: 'Добавить активность' },
    no_sleep_quality: { action: 'open_sleep_quality', label: 'Оценить сон' },
    no_measurements: { action: 'open_measurements', label: 'Добавить замеры' },
    no_weight: { action: 'open_weight', label: 'Указать вес' }
  };

  const QUICK_ACTION_META = {
    open_training: { emoji: '🏋️', noun: 'тренировки' },
    open_steps: { emoji: '👣', noun: 'шагов' },
    open_household: { emoji: '🚶', noun: 'бытовой активности' },
    open_sleep_quality: { emoji: '🌙', noun: 'качества сна' },
    open_measurements: { emoji: '📏', noun: 'замеров тела' },
    open_weight: { emoji: '⚖️', noun: 'веса' }
  };

  /**
   * PatternDebugModal — модалка с технической таблицей паттернов
   * v3.0: с переключением периодов 7/30 дней
   * @param {object} root0
   * @param {Function} root0.lsGet
   * @param {object} root0.profile
   * @param {object} root0.pIndex
   * @param {object} root0.optimum
   * @param {Function} root0.onClose
   * @returns {object}
   */
  function PatternDebugModal({ lsGet, profile, pIndex, optimum, onClose }) {
    // State: activeTab — период анализа ('today' = 7 дней, 'week' = 30 дней)
    const [activeTab, setActiveTab] = useState('today');

    // State: expandedCategories — Set с ID раскрытых категорий
    const [expandedCategories, setExpandedCategories] = useState(() => new Set(['nutrition', 'timing', 'activity', 'recovery', 'metabolism']));

    // 🔧 Динамический пересчет insights при смене таба
    const insights = useMemo(() => {
      const daysBack = activeTab === 'today' ? 7 : 30;
      return HEYS.PredictiveInsights.analyze({
        daysBack,
        lsGet,
        profile,
        pIndex,
        optimum
      });
    }, [activeTab, lsGet, profile, pIndex, optimum]);

    const patterns = insights.patterns || [];
    const healthScore = insights.healthScore;

    const runQuickAction = (actionId) => {
      const ui = HEYS.ui = HEYS.ui || {};
      const openFromInsights = ui.openDataEntryFromInsights;

      // 1) Если дневник уже открыт и обработчик доступен — выполняем сразу
      if (typeof openFromInsights === 'function' && openFromInsights(actionId) === true) {
        onClose?.();
        return;
      }

      // 2) Иначе сохраняем pending action и переводим пользователя в Дневник
      ui.pendingDataEntryAction = actionId;
      if (typeof ui.switchTab === 'function') {
        ui.switchTab('diary');
      }

      HEYS.Toast?.tip?.('Открыл Дневник — сейчас покажем форму для ввода данных');
      onClose?.();
    };

    // Toggle аккордеона категории
    const toggleCategory = (categoryId) => {
      setExpandedCategories(prev => {
        const newSet = new Set(prev);
        if (newSet.has(categoryId)) {
          newSet.delete(categoryId);
        } else {
          newSet.add(categoryId);
        }
        return newSet;
      });
    };

    // Подготовка данных: группировка по категориям
    const groupedData = useMemo(() => {
      if (!patterns || !Array.isArray(patterns)) return {};

      const groups = {};

      patterns.forEach(p => {
        const meta = PATTERN_METADATA[p.pattern] || { name: p.pattern, category: 'unknown', emoji: '❓' };
        const cat = meta.category;

        if (!groups[cat]) groups[cat] = [];

        const categoryInfo = CATEGORY_LABELS[cat] || { label: cat, emoji: '', color: '#6b7280' };

        groups[cat].push({
          id: p.pattern,
          name: meta.name,
          emoji: meta.emoji,
          category: cat,
          categoryLabel: categoryInfo.label,
          categoryColor: categoryInfo.color,
          available: p.available || false,
          score: p.score !== undefined ? p.score : null,
          days: p.days || 0,
          priority: p.priority || '—',
          reason: p.reason || null,
          isPreliminary: !!p.isPreliminary,
          requiredDataPoints: p.requiredDataPoints || null,
          message: p.message || p.insight || null
        });
      });

      // Сортировка внутри каждой категории по скору (desc)
      Object.values(groups).forEach(group => {
        group.sort((a, b) => (b.score || 0) - (a.score || 0));
      });

      // 📊 ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ
      console.group('🔍 [Pattern Debug] Детальная информация о паттернах');
      console.log('📦 Всего паттернов:', patterns?.length || 0);

      Object.entries(groups).forEach(([catId, items]) => {
        const catInfo = CATEGORY_LABELS[catId] || { label: catId, emoji: '❓' };
        const available = items.filter(x => x.available).length;
        const total = items.length;
        const percentage = total > 0 ? Math.round((available / total) * 100) : 0;

        console.group(`${catInfo.emoji} ${catInfo.label}: ${available}/${total} (${percentage}%)`);

        items.forEach(item => {
          const status = item.available ? '✅' : '⏸️';
          const scoreStr = item.score !== null ? `score=${item.score}` : 'н/д';
          const daysStr = item.days > 0 ? `${item.days}дн` : '0дн';
          const reasonLabel = item.reason ? REASON_LABELS[item.reason] || item.reason : '';
          const reasonStr = !item.available && reasonLabel ? ` → ${reasonLabel}` : '';

          console.log(
            `${status} ${item.emoji} ${item.name}`,
            `| ${scoreStr} | ${daysStr}${reasonStr}`,
            item.message ? `| ${item.message}` : ''
          );
        });

        console.groupEnd();
      });

      console.groupEnd();

      return groups;
    }, [patterns]);

    // Статистика
    const stats = useMemo(() => {
      const total = patterns?.length || 0;
      const active = patterns?.filter(p => p.available && p.score !== null).length || 0;
      const avgScore = active > 0
        ? patterns
          ?.filter(p => p.available && p.score !== null)
          .reduce((sum, p) => sum + (p.score || 0), 0) / active
        : 0;

      return { total, active, avgScore: Math.round(avgScore) };
    }, [patterns]);

    const unlockPlan = useMemo(() => {
      const actionMap = new Map();

      patterns.forEach((p) => {
        if (p?.available) return;

        const quickAction = QUICK_ACTIONS_BY_REASON[p.reason];
        if (!quickAction) return;

        const actionId = quickAction.action;
        const meta = QUICK_ACTION_META[actionId] || { emoji: '✨', noun: 'данных' };
        const existing = actionMap.get(actionId) || {
          actionId,
          label: quickAction.label,
          emoji: meta.emoji,
          noun: meta.noun,
          count: 0,
          patternIds: []
        };

        existing.count += 1;
        existing.patternIds.push(p.pattern);
        actionMap.set(actionId, existing);
      });

      const items = Array.from(actionMap.values())
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));

      const totalUnlockable = items.reduce((sum, item) => sum + item.count, 0);
      const topItems = items.slice(0, 3);

      return {
        totalUnlockable,
        topItems,
        hasPlan: totalUnlockable > 0
      };
    }, [patterns]);

    return h('div', {
      className: 'pattern-debug-modal',
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
    },
      h('div', {
        className: 'pattern-debug-modal__content',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        h('div', { className: 'pattern-debug-modal__header' },
          h('div', { className: 'pattern-debug-modal__title' },
            h('span', { className: 'pattern-debug-modal__emoji' }, '🔍'),
            h('span', null, 'Pattern Transparency')
          ),
          h('button', {
            className: 'pattern-debug-modal__close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '✕')
        ),

        // Tab Switcher (7 дней / 30 дней)
        h('div', { className: 'pattern-debug-modal__tabs' },
          h('button', {
            className: `pattern-debug-modal__tab-button ${activeTab === 'today' ? 'pattern-debug-modal__tab-button--active' : ''}`,
            onClick: () => setActiveTab('today')
          }, '📅 7 дней'),
          h('button', {
            className: `pattern-debug-modal__tab-button ${activeTab === 'week' ? 'pattern-debug-modal__tab-button--active' : ''}`,
            onClick: () => setActiveTab('week')
          }, '📊 30 дней')
        ),

        // Stats Summary
        h('div', { className: 'pattern-debug-modal__stats' },
          h('div', { className: 'pattern-debug-modal__stat' },
            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Health Score'),
            h('span', { className: 'pattern-debug-modal__stat-value pattern-debug-modal__stat-value--score' },
              healthScore?.total || '—'
            )
          ),
          h('div', { className: 'pattern-debug-modal__stat' },
            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Всего паттернов'),
            h('span', { className: 'pattern-debug-modal__stat-value' }, stats.total)
          ),
          h('div', { className: 'pattern-debug-modal__stat' },
            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Активных'),
            h('span', { className: 'pattern-debug-modal__stat-value pattern-debug-modal__stat-value--active' },
              stats.active
            )
          ),
          h('div', { className: 'pattern-debug-modal__stat' },
            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Средний скор'),
            h('span', { className: 'pattern-debug-modal__stat-value' }, stats.avgScore)
          )
        ),

        unlockPlan.hasPlan && h('div', { className: 'pattern-debug-modal__unlock-plan' },
          h('div', { className: 'pattern-debug-modal__unlock-plan-header' },
            h('div', { className: 'pattern-debug-modal__unlock-plan-title' },
              '🚀 Быстрый путь к полным инсайтам'
            ),
            h('div', { className: 'pattern-debug-modal__unlock-plan-total' },
              `+${unlockPlan.totalUnlockable} патт.`
            )
          ),
          h('div', { className: 'pattern-debug-modal__unlock-plan-subtitle' },
            'Добавьте недостающие данные — и эти паттерны автоматически активируются'
          ),
          h('div', { className: 'pattern-debug-modal__unlock-plan-actions' },
            unlockPlan.topItems.map((item) => h('button', {
              key: item.actionId,
              type: 'button',
              className: 'pattern-debug-modal__unlock-plan-btn',
              onClick: () => runQuickAction(item.actionId)
            },
              h('span', { className: 'pattern-debug-modal__unlock-plan-btn-icon' }, item.emoji),
              h('span', { className: 'pattern-debug-modal__unlock-plan-btn-text' }, `${item.label}`),
              h('span', { className: 'pattern-debug-modal__unlock-plan-btn-badge' }, `+${item.count}`)
            ))
          )
        ),

        // Accordions по категориям
        h('div', { className: 'pattern-debug-modal__accordions' },
          Object.entries(CATEGORY_LABELS).map(([catId, catInfo]) => {
            const categoryPatterns = groupedData[catId] || [];
            if (categoryPatterns.length === 0) return null;

            const isExpanded = expandedCategories.has(catId);
            const activeCount = categoryPatterns.filter(p => p.available && p.score !== null).length;

            // 🔧 v6.0.1: Используем значение из healthScore.categories напрямую
            // Это гарантирует синхронность с hero блоками внизу (вклад по категориям)
            const avgScore = healthScore?.categories?.[catId] ?? 0;

            return h('div', {
              key: catId,
              className: 'pattern-debug-modal__accordion'
            },
              // Accordion Header
              h('div', {
                className: `pattern-debug-modal__accordion-header ${isExpanded ? 'pattern-debug-modal__accordion-header--expanded' : ''}`,
                onClick: () => toggleCategory(catId),
                style: { borderLeftColor: catInfo.color }
              },
                h('div', { className: 'pattern-debug-modal__accordion-header-left' },
                  h('span', { className: 'pattern-debug-modal__accordion-icon' },
                    isExpanded ? '▼' : '▶'
                  ),
                  h('span', { className: 'pattern-debug-modal__accordion-emoji' }, catInfo.emoji),
                  h('span', { className: 'pattern-debug-modal__accordion-title' }, catInfo.label),
                  h('span', { className: 'pattern-debug-modal__accordion-count' },
                    `${activeCount}/${categoryPatterns.length}`
                  )
                ),
                h('div', { className: 'pattern-debug-modal__accordion-header-right' },
                  activeCount > 0 && h('span', {
                    className: `pattern-debug-modal__accordion-score ${avgScore >= 80 ? 'pattern-debug-modal__score--excellent' :
                      avgScore >= 60 ? 'pattern-debug-modal__score--good' :
                        avgScore >= 40 ? 'pattern-debug-modal__score--fair' :
                          'pattern-debug-modal__score--poor'
                      }`
                  }, avgScore)
                )
              ),

              // Accordion Content
              isExpanded && h('div', { className: 'pattern-debug-modal__accordion-content' },
                h('table', { className: 'pattern-debug-modal__table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Паттерн'),
                      h('th', null, 'Статус'),
                      h('th', null, 'Скор'),
                      h('th', null, 'Дней'),
                      h('th', null, 'Причина')
                    )
                  ),
                  h('tbody', null,
                    categoryPatterns.map(row => h('tr', {
                      key: row.id,
                      className: `pattern-debug-modal__row ${!row.available ? 'pattern-debug-modal__row--inactive' : ''}`
                    },
                      // Pattern name
                      h('td', { className: 'pattern-debug-modal__cell pattern-debug-modal__cell--pattern' },
                        h('span', { className: 'pattern-debug-modal__emoji' }, row.emoji),
                        h('span', null, row.name),
                        row.isPreliminary && h('span', {
                          className: 'pattern-debug-modal__preview-badge',
                          title: `Предварительная оценка. Высокая точность после ${row.requiredDataPoints || 3}+ замеров.`
                        }, 'PREVIEW')
                      ),
                      // Status
                      h('td', { className: 'pattern-debug-modal__cell pattern-debug-modal__cell--status' },
                        row.available
                          ? h('span', { className: 'pattern-debug-modal__status pattern-debug-modal__status--active' }, '✅')
                          : h('span', { className: 'pattern-debug-modal__status pattern-debug-modal__status--inactive' }, '⏸️')
                      ),
                      // Score
                      h('td', { className: 'pattern-debug-modal__cell pattern-debug-modal__cell--score' },
                        row.score !== null
                          ? h('span', {
                            className: `pattern-debug-modal__score ${row.score >= 80 ? 'pattern-debug-modal__score--excellent' :
                              row.score >= 60 ? 'pattern-debug-modal__score--good' :
                                row.score >= 40 ? 'pattern-debug-modal__score--fair' :
                                  'pattern-debug-modal__score--poor'
                              }`
                          }, row.score)
                          : h('span', { className: 'pattern-debug-modal__score pattern-debug-modal__score--na' }, '—')
                      ),
                      // Days
                      h('td', { className: 'pattern-debug-modal__cell pattern-debug-modal__cell--days' },
                        row.days > 0 ? `${row.days} дн` : '—'
                      ),
                      // Reason
                      h('td', { className: 'pattern-debug-modal__cell pattern-debug-modal__cell--reason' },
                        !row.available
                          ? h('div', { className: 'pattern-debug-modal__reason-wrap' },
                            h('span', {
                              className: `pattern-debug-modal__reason pattern-debug-modal__reason--unavailable ${row.reason ? `pattern-debug-modal__reason--${row.reason}` : ''}`,
                              title: row.message || row.reason || 'Нет данных'
                            },
                              REASON_LABELS[row.reason] || row.message || row.reason || 'Нет данных'
                            ),
                            QUICK_ACTIONS_BY_REASON[row.reason] && h('button', {
                              type: 'button',
                              className: 'pattern-debug-modal__quick-action-btn',
                              onClick: (e) => {
                                e.stopPropagation();
                                runQuickAction(QUICK_ACTIONS_BY_REASON[row.reason].action);
                              }
                            }, `➕ ${QUICK_ACTIONS_BY_REASON[row.reason].label}`)
                          )
                          : h('span', { className: 'pattern-debug-modal__reason pattern-debug-modal__reason--available' }, '✓')
                      )
                    ))
                  )
                )
              )
            );
          })
        ),

        // Footer with category breakdown
        healthScore?.breakdown && h('div', { className: 'pattern-debug-modal__breakdown' },
          h('div', { className: 'pattern-debug-modal__breakdown-title' }, 'Вклад по категориям:'),
          h('div', { className: 'pattern-debug-modal__breakdown-grid' },
            Object.entries(healthScore.breakdown).map(([key, cat]) => {
              const catInfo = CATEGORY_LABELS[key];
              if (!catInfo) return null;

              return h('div', {
                key,
                className: 'pattern-debug-modal__breakdown-item',
                style: { borderColor: catInfo.color }
              },
                h('div', { className: 'pattern-debug-modal__breakdown-icon' }, catInfo.emoji),
                h('div', { className: 'pattern-debug-modal__breakdown-label' }, cat.label || key),
                h('div', { className: 'pattern-debug-modal__breakdown-score' },
                  cat.score !== null ? cat.score : '—'
                ),
                h('div', { className: 'pattern-debug-modal__breakdown-weight' },
                  `${Math.round((cat.weight || 0) * 100)}% веса`
                )
              );
            })
          )
        )
      )
    );
  }

  // Export
  HEYS.InsightsPI.patternDebugger = {
    PatternDebugModal,
    PATTERN_METADATA,
    CATEGORY_LABELS
  };

  global.PatternDebugModal = PatternDebugModal;

})(typeof window !== 'undefined' ? window : this);
