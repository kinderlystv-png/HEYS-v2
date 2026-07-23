// pi_ui_whatif.js — What-If Simulator UI Components v3.0.1
// Extracted from heys_predictive_insights_v1.js (Phase 9a)
// What-If симулятор - интерактивный прогноз влияния питания на здоровье
// v3.0.1: Lazy getters for InfoButton (script order fix)
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };

  // React imports
  const { createElement: h, useState, useEffect, useMemo } = window.React || {};

  // Зависимости
  const piAdvanced = HEYS.InsightsPI?.advanced || window.piAdvanced || {};
  const piUICards = HEYS.InsightsPI?.uiCards || window.piUICards || {};
  const piUIHelpers = HEYS.InsightsPI?.uiHelpers || window.piUIHelpers || {};

  // Импорт из pi_ui_cards.js (lazy-загрузка из namespace)
  const getWhatIfDeps = () => {
    const cards = HEYS.InsightsPI?.uiCards || piUICards || {};
    return {
      WHATIF_PRESETS: cards.WHATIF_PRESETS || [],
      WHATIF_CATEGORIES: cards.WHATIF_CATEGORIES || {},
      simulateFood: cards.simulateFood || function () { return { verdict: 'neutral', wave: { hours: 3, endTime: '--:--', gl: 0, multiplier: 1 }, risk: { before: 0, after: 0, delta: 0 }, calories: { add: 0, ratio: 0 }, satiety: { hours: 2, desc: '' }, advice: [] }; }
    };
  };

  // Lazy getter для InfoButton (загружается позже в pi_ui_dashboard.js)
  function getInfoButton() {
    if (typeof piUIHelpers.getInfoButton === 'function') {
      return piUIHelpers.getInfoButton(h);
    }
    return HEYS.InsightsPI?.uiDashboard?.InfoButton ||
      HEYS.PredictiveInsights?.components?.InfoButton ||
      HEYS.day?.InfoButton ||
      HEYS.InfoButton ||
      window.InfoButton ||
      // Fallback: простая кнопка если InfoButton не загружен
      function InfoButtonFallback({ infoKey, size }) {
        return h('span', {
          className: 'info-button-placeholder',
          title: infoKey,
          style: { cursor: 'help', opacity: 0.5 }
        }, '?');
      };
  }

  // Import generateWhatIfScenarios
  const generateWhatIfScenarios = piAdvanced.generateWhatIfScenarios || function () { return []; };

  function WhatIfSimulator({ context, onClose, expanded = false }) {
    const { WHATIF_PRESETS, WHATIF_CATEGORIES, simulateFood } = getWhatIfDeps();
    const [selectedPreset, setSelectedPreset] = useState(null);
    const [customFood, setCustomFood] = useState(null);
    const [simulation, setSimulation] = useState(null);
    const [activeCategory, setActiveCategory] = useState('fast');
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customValues, setCustomValues] = useState({ kcal: 300, prot: 15, carbs: 30, fat: 10, gi: 50, name: '' });

    // Симуляция при выборе preset
    useEffect(() => {
      if (selectedPreset && context) {
        const result = simulateFood(selectedPreset, context);
        setSimulation(result);
      }
    }, [selectedPreset, context]);

    // Симуляция кастомной еды
    useEffect(() => {
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
          // Оценка после нового приёма
          h('div', { className: 'whatif-result__card' },
            h('div', { className: 'whatif-result__card-header' },
              h('span', { className: 'whatif-result__card-emoji' }, '🌊'),
              h('span', null, 'После нового приёма')
            ),
            h('div', { className: 'whatif-result__card-value' },
              simulation.wave.hours, 'ч'
            ),
            h('div', { className: 'whatif-result__card-detail' },
              'до ', simulation.wave.endTime
            ),
            simulation.wave.impact === 'interrupts' && h('div', { className: 'whatif-result__card-warning' },
              'Новая оценка начнётся до завершения предыдущей'
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
    const { WHATIF_PRESETS, simulateFood } = getWhatIfDeps();
    const [isExpanded, setIsExpanded] = useState(false);
    const [quickResult, setQuickResult] = useState(null);
    const [selectedQuick, setSelectedQuick] = useState(null);

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
   * Weight Prediction Card (v2.0: с InfoButton)
   */
  function WeightPrediction({ prediction }) {
    if (!prediction) return null;
    return h('div', { className: 'insights-whatif__weight-prediction' },
      h('h3', null, 'Прогноз веса'),
      h('div', { className: 'weight-prediction-value' }, prediction)
    );
  }


  // === ЭКСПОРТ ===
  HEYS.InsightsPI.uiWhatIf = {
    WhatIfSimulator,
    WhatIfCard,
    ScenarioCard,
    WhatIfSection
  };

  // Fallback для прямого доступа
  global.piUIWhatIf = HEYS.InsightsPI.uiWhatIf;

  devLog('[PI UI WhatIf] v3.0.0 loaded — 4 What-If components');

})(typeof window !== 'undefined' ? window : global);
