/**
 * HEYS Predictive Insights — What-If Scenarios Panel UI v1.0
 * 
 * Интерактивная панель для симуляции impact различных действий на паттерны здоровья.
 * Позволяет пользователю выбрать действие, настроить параметры и увидеть предсказание.
 * 
 * Dependencies: pi_whatif.js (backend simulator), React
 * 
 * @version 1.0.0
 * @date 2026-02-15
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};
    const DEV = global.DEV || {};
    const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };

    // React imports
    const { createElement: h, useState, useMemo, useEffect } = window.React || {};

    /**
     * ACTION_TYPES mirror from pi_whatif.js для UI labels
     */
    const ACTION_CONFIG = {
        // Meal composition
        add_protein: {
            category: 'meal',
            label: 'Добавить белок',
            description: 'Увеличить белок в выбранном приёме',
            params: [
                { key: 'proteinGrams', label: 'Грамм белка', type: 'number', min: 10, max: 100, default: 30, step: 5 },
                { key: 'mealIndex', label: 'Приём пищи', type: 'select', options: ['Завтрак', 'Обед', 'Ужин'], default: 0 }
            ]
        },
        add_fiber: {
            category: 'meal',
            label: 'Добавить клетчатку',
            description: 'Увеличить клетчатку в рационе',
            params: [
                { key: 'fiberGrams', label: 'Грамм клетчатки', type: 'number', min: 5, max: 40, default: 10, step: 5 },
                { key: 'mealIndex', label: 'Приём пищи', type: 'select', options: ['Завтрак', 'Обед', 'Ужин'], default: 1 }
            ]
        },
        reduce_carbs: {
            category: 'meal',
            label: 'Снизить углеводы',
            description: 'Уменьшить быстрые углеводы',
            params: [
                { key: 'carbsPercent', label: 'Снижение (%)', type: 'number', min: 10, max: 50, default: 25, step: 5 },
                { key: 'mealIndex', label: 'Приём пищи', type: 'select', options: ['Завтрак', 'Обед', 'Ужин'], default: 2 }
            ]
        },

        // Meal timing
        increase_meal_gap: {
            category: 'timing',
            label: 'Увеличить промежуток',
            description: 'Растянуть интервал между приёмами',
            params: [
                { key: 'targetGapHours', label: 'Целевой промежуток (ч)', type: 'number', min: 3, max: 6, default: 4, step: 0.5 }
            ]
        },
        shift_meal_time: {
            category: 'timing',
            label: 'Сдвинуть время',
            description: 'Перенести приём пищи',
            params: [
                { key: 'mealIndex', label: 'Приём пищи', type: 'select', options: ['Завтрак', 'Обед', 'Ужин'], default: 0 },
                { key: 'shiftMinutes', label: 'Сдвиг (мин)', type: 'number', min: -120, max: 120, default: -30, step: 15 }
            ]
        },
        skip_late_meal: {
            category: 'timing',
            label: 'Пропустить поздний приём',
            description: 'Убрать приём после 19:00',
            params: []
        },

        // Sleep
        increase_sleep: {
            category: 'sleep',
            label: 'Увеличить сон',
            description: 'Спать больше часов',
            params: [
                { key: 'targetSleepHours', label: 'Целевая длительность (ч)', type: 'number', min: 7, max: 10, default: 8, step: 0.5 }
            ]
        },
        adjust_bedtime: {
            category: 'sleep',
            label: 'Сдвинуть отбой',
            description: 'Изменить время засыпания',
            params: [
                { key: 'targetBedtime', label: 'Новое время отбоя', type: 'time', default: '22:30' }
            ]
        },

        // Activity
        add_training: {
            category: 'activity',
            label: 'Добавить тренировку',
            description: 'Включить силовую/кардио',
            params: [
                { key: 'durationMinutes', label: 'Длительность (мин)', type: 'number', min: 20, max: 120, default: 45, step: 15 },
                { key: 'intensity', label: 'Интенсивность', type: 'select', options: ['Лёгкая', 'Средняя', 'Высокая'], default: 1 }
            ]
        },
        increase_steps: {
            category: 'activity',
            label: 'Увеличить шаги',
            description: 'Больше ходьбы',
            params: [
                { key: 'targetSteps', label: 'Целевые шаги', type: 'number', min: 5000, max: 30000, default: 10000, step: 1000 }
            ]
        }
    };

    const CATEGORY_CONFIG = {
        // Контракт «состав · чипы „Что если“»: четыре категории и в этом
        // порядке — Питание, Тайминг, Сон, Активность. Те же имена, что у
        // факторов каскада. Эмодзи и собственные цвета сняты: чип красится
        // ролью набора, а категорию называет слово.
        meal: { label: 'Питание' },
        timing: { label: 'Тайминг' },
        sleep: { label: 'Сон' },
        activity: { label: 'Активность' }
    };

    const INLINE_ACTION_ORDER = {
        meal: ['add_protein', 'reduce_carbs', 'add_fiber'],
        timing: ['increase_meal_gap', 'shift_meal_time', 'skip_late_meal'],
        sleep: ['increase_sleep', 'adjust_bedtime'],
        activity: ['add_training', 'increase_steps']
    };

    /**
     * Человеко-читаемые названия паттернов
     */
    const PATTERN_LABELS = {
        protein_satiety: 'Насыщение белком',
        meal_timing: 'Тайминг приёмов',
        late_eating: 'Поздние приёмы',
        sleep_weight: 'Сон и вес',
        steps_weight: 'Шаги и вес',
        fiber_regularity: 'Клетчатка',
        meal_quality: 'Качество еды',
        wave_overlap: 'Наложение волн',
        training_kcal: 'Калории и тренировки',
        training_recovery: 'Восстановление',
        sleep_quality: 'Качество сна',
        insulin_sensitivity: 'Чувствительность к инсулину',
        mood_trajectory: 'Настроение',
        nutrient_timing: 'Нутриент-тайминг',
        gut_health: 'Здоровье ЖКТ',
        glycemic_load: 'Гликемическая нагрузка',
        added_sugar_dependency: 'Сахарная зависимость',
        protein_distribution: 'Распределение белка',
        nutrient_density: 'Плотность нутриентов',
        heart_health: 'Здоровье сердца',
        training_type_match: 'Питание и тренировки',
        circadian: 'Циркадный ритм',
        nutrition_quality: 'Качество питания',
        wellbeing_correlation: 'Самочувствие'
    };

    /**
     * Получить человеко-читаемое название паттерна
     */
    function getPatternLabel(patternKey) {
        return PATTERN_LABELS[patternKey] || patternKey.replace(/_/g, ' ');
    }

    function createDefaultParams(actionKey) {
        const config = ACTION_CONFIG[actionKey];
        return (config?.params || []).reduce((params, param) => {
            params[param.key] = param.default;
            return params;
        }, {});
    }

    function formatNumber(value) {
        return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    }

    function formatScenarioValue(actionKey, params) {
        const mealNames = ['завтраку', 'обеду', 'ужину'];
        switch (actionKey) {
            case 'add_protein':
                return '+' + formatNumber(params.proteinGrams) + ' г к ' + (mealNames[params.mealIndex] || 'приёму');
            case 'add_fiber':
                return '+' + formatNumber(params.fiberGrams) + ' г клетчатки';
            case 'reduce_carbs':
                return '−' + formatNumber(params.carbsPercent) + ' % быстрых углеводов';
            case 'increase_meal_gap':
                return 'промежуток ' + formatNumber(params.targetGapHours) + ' ч';
            case 'shift_meal_time': {
                const shift = Number(params.shiftMinutes) || 0;
                return 'завтрак на ' + Math.abs(shift) + ' мин ' + (shift <= 0 ? 'раньше' : 'позже');
            }
            case 'skip_late_meal':
                return 'убрать приём после 19:00';
            case 'increase_sleep':
                return 'сон ' + formatNumber(params.targetSleepHours) + ' ч';
            case 'adjust_bedtime':
                return 'отбой в ' + params.targetBedtime;
            case 'add_training':
                return 'тренировка ' + formatNumber(params.durationMinutes) + ' мин';
            case 'increase_steps':
                return formatNumber(params.targetSteps) + ' шагов';
            default:
                return ACTION_CONFIG[actionKey]?.description || '';
        }
    }

    function getInlineActionLabel(actionKey) {
        if (actionKey === 'add_fiber') return 'Клетчатка +10 г';
        return ACTION_CONFIG[actionKey]?.label || actionKey;
    }

    function getScenarioProgress(actionKey, params) {
        // Единственное зафиксированное canvas-значение: +30 г белка занимает
        // 55 % полосы. Для остальных presets нормализуем их единственный
        // числовой параметр по реальному диапазону engine-конфига.
        if (actionKey === 'add_protein' && Number(params.proteinGrams) === 30) return 55;
        const numeric = (ACTION_CONFIG[actionKey]?.params || []).find((param) => param.type === 'number');
        if (!numeric) return 55;
        const value = Number(params[numeric.key]);
        return Math.max(0, Math.min(100, ((value - numeric.min) / (numeric.max - numeric.min)) * 100));
    }

    function buildCanonicalScoreChange(simulation, patterns, profile, currentScore) {
        if (!simulation?.available || !Array.isArray(patterns)) return null;
        const calculate = HEYS.PredictiveInsights?.calculateHealthScore;
        if (typeof calculate !== 'function') return null;

        const predicted = simulation.predicted || {};
        let affected = 0;
        const projectedPatterns = patterns.map((pattern) => {
            if (!Object.prototype.hasOwnProperty.call(predicted, pattern?.pattern)) return pattern;
            affected += 1;
            return { ...pattern, score: predicted[pattern.pattern] };
        });
        if (!affected) return null;

        try {
            const baselineResult = Number.isFinite(Number(currentScore))
                ? { total: Number(currentScore) }
                : calculate(patterns, profile);
            const projectedResult = calculate(projectedPatterns, profile);
            const baseline = Math.round(Number(baselineResult?.total));
            const next = Math.round(Number(projectedResult?.total));
            if (!Number.isFinite(baseline) || !Number.isFinite(next)) return null;
            return { baseline, predicted: next, delta: next - baseline };
        } catch (_) {
            return null;
        }
    }

    function ScenarioChevron() {
        return h('svg', {
            className: 'insights-v4-whatif__chevron',
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            'aria-hidden': 'true'
        }, h('path', {
            d: 'M9 6l6 6-6 6',
            stroke: 'currentColor',
            strokeWidth: 2.75,
            strokeLinecap: 'round'
        }));
    }

    /**
     * Inline v4 flow inside «Подробно».
     *
     * It consumes the already calculated pattern set and asks the existing
     * action engine only for its delta. The final pair is recomputed by the
     * canonical PredictiveInsights score owner, so fixture numbers and the
     * unrelated Cascade/HEYS Score never enter this surface.
     */
    function WhatIfScenariosInline({ lsGet, profile, pIndex, patterns, currentScore, historyDays }) {
        const categoryKeys = Object.keys(CATEGORY_CONFIG);
        const [activeCategory, setActiveCategory] = useState(categoryKeys[0]);
        const [selectedAction, setSelectedAction] = useState('add_protein');
        const [actionParams, setActionParams] = useState(() => createDefaultParams('add_protein'));

        const daysData = useMemo(() => {
            const getDays = HEYS.InsightsPI?.calculations?.getDaysData;
            const getter = lsGet || HEYS.utils?.lsGet;
            if (typeof getDays !== 'function' || typeof getter !== 'function') return [];
            try { return getDays(30, getter); } catch (_) { return []; }
        }, [lsGet, patterns, historyDays]);

        const categoryActions = useMemo(() => {
            return (INLINE_ACTION_ORDER[activeCategory] || [])
                .map((key) => ({ key, ...ACTION_CONFIG[key] }));
        }, [activeCategory]);

        const simulation = useMemo(() => {
            if ((historyDays || 0) < 14 || daysData.length < 14) {
                return {
                    available: false,
                    error: 'Сценарии откроются, когда будет 14 заполненных дней.',
                    reasonCode: 'minimum_history'
                };
            }
            const simulate = HEYS.InsightsPI?.whatif?.simulate;
            if (typeof simulate !== 'function') {
                return { available: false, error: 'Расчёт сценариев пока недоступен.' };
            }
            try {
                const result = simulate(
                    selectedAction,
                    actionParams,
                    daysData,
                    profile,
                    pIndex,
                    { patterns, requireObserved: true }
                );
                if (!result?.available) return result || { available: false };
                return {
                    ...result,
                    scoreChange: buildCanonicalScoreChange(result, patterns, profile, currentScore)
                };
            } catch (_) {
                return { available: false, error: 'Не удалось пересчитать сценарий.' };
            }
        }, [selectedAction, actionParams, daysData, profile, pIndex, patterns, currentScore, historyDays]);

        const selectAction = (actionKey) => {
            setSelectedAction(actionKey);
            setActionParams(createDefaultParams(actionKey));
        };

        const selectCategory = (categoryKey) => {
            const first = INLINE_ACTION_ORDER[categoryKey]?.[0];
            setActiveCategory(categoryKey);
            if (first) selectAction(first);
        };

        const config = ACTION_CONFIG[selectedAction];
        const progress = getScenarioProgress(selectedAction, actionParams);
        const scoreChange = simulation?.scoreChange;
        const delta = scoreChange?.delta || 0;

        return h('section', { className: 'insights-v4-whatif__inline', 'aria-labelledby': 'insights-v4-whatif-title' },
            h('div', { className: 'insights-v4-whatif__head' },
                h('h3', { id: 'insights-v4-whatif-title', className: 'insights-v4-whatif__title' }, 'Что если…'),
                h('span', { className: 'insights-v4-whatif__place' }, 'внутри «Подробно»')
            ),
            h('div', { className: 'insights-v4-whatif__scroll' },
                h('div', { className: 'insights-v4-whatif__chips', role: 'tablist', 'aria-label': 'Категория сценария' },
                    categoryKeys.map((key) => h('button', {
                        key,
                        type: 'button',
                        role: 'tab',
                        className: 'insights-v4-whatif__chip' + (activeCategory === key ? ' is-active' : ''),
                        'aria-selected': activeCategory === key,
                        onClick: () => selectCategory(key)
                    }, CATEGORY_CONFIG[key].label))
                ),
                h('div', { className: 'insights-v4-whatif__scenario' },
                    h('div', { className: 'insights-v4-whatif__scenario-title' }, config.label),
                    h('div', { className: 'insights-v4-whatif__parameter' },
                        h('span', { className: 'insights-v4-whatif__parameter-value' }, formatScenarioValue(selectedAction, actionParams)),
                        h('span', { className: 'insights-v4-whatif__parameter-track', 'aria-hidden': 'true' },
                            h('span', {
                                className: 'insights-v4-whatif__parameter-fill',
                                style: { width: progress + '%' }
                            })
                        )
                    ),
                    scoreChange
                        ? h('div', { className: 'insights-v4-whatif__score', 'aria-live': 'polite' },
                            h('span', { className: 'insights-v4-whatif__score-label' }, 'Оценка дня'),
                            h('span', { className: 'insights-v4-whatif__score-before' }, scoreChange.baseline),
                            h('span', { className: 'insights-v4-whatif__score-arrow', 'aria-hidden': 'true' }, '→'),
                            h('span', { className: 'insights-v4-whatif__score-after' }, scoreChange.predicted),
                            h('span', {
                                className: 'insights-v4-whatif__score-delta' + (delta < 0 ? ' is-negative' : '')
                            }, (delta > 0 ? '+' : '') + delta)
                        )
                        : h('p', { className: 'insights-v4-whatif__unavailable', role: 'status' },
                            simulation?.error || 'Недостаточно подтверждённых данных для этого сценария.')
                ),
                h('div', { className: 'insights-v4-whatif__actions' },
                    categoryActions.filter((action) => action.key !== selectedAction).map((action, index, others) =>
                        h('button', {
                            key: action.key,
                            type: 'button',
                            className: 'insights-v4-whatif__action' + (index === others.length - 1 ? ' is-last' : ''),
                            onClick: () => selectAction(action.key)
                        },
                            h('span', null, getInlineActionLabel(action.key)),
                            h(ScenarioChevron)
                        )
                    )
                ),
                h('p', { className: 'insights-v4-whatif__explanation' },
                    'Сценарий двигает оценку дня из паттернов, а не HEYS Score — каскад за 30 дней один приём не сдвинет. '
                    + 'До 14 дней данных вместо сценариев — счётчик «откроется через N дней»; один параметр за раз.'
                )
            )
        );
    }

    /**
     * WhatIfScenariosCard — карточка в InsightsTab
     */
    function WhatIfScenariosCard({ onClick }) {
        const handleCardClick = () => {
            console.info('[HEYS.insights.whatif.ui] 🖱️ CTA clicked: "Попробовать сценарий"');
            if (typeof onClick === 'function') onClick();
        };

        return h('div', {
            className: 'insights-card whatif-scenarios-card',
            onClick: handleCardClick,
            style: { cursor: 'pointer' }
        },
            // Контракт «копия · что запрещено»: эмодзи, латиница и жаргон.
            // Прежде карточка называлась «What-If Scenarios» с бейджем «Beta»,
            // значком 🔮 и рядом превью из четырёх эмодзи — три запрета сразу.
            // Категории и так названы словами внутри панели.
            h('div', { className: 'insights-card__header' },
                h('h3', { className: 'insights-card__title' }, 'Что если…')
            ),

            h('div', { className: 'insights-card__body' },
                h('p', { className: 'insights-card__description' },
                    'Посмотрите, как сдвинется оценка дня, если добавить белок, '
                    + 'перенести приём или лечь раньше.'
                ),
                // Категории строкой вместо ряда значков: слово называет, что
                // внутри, а значок заставляет угадывать.
                h('div', { className: 'whatif-scenarios-card__preview' },
                    ['Питание', 'Тайминг', 'Сон', 'Активность'].map(function (name) {
                        return h('span', {
                            key: name,
                            className: 'whatif-scenarios-card__preview-name'
                        }, name);
                    })
                )
            ),

            // Footer
            h('div', { className: 'insights-card__footer' },
                h('span', { className: 'insights-card__cta' }, 'Попробовать сценарий')
            )
        );
    }

    /**
     * WhatIfScenariosPanel — основная панель с симулятором
     */
    function WhatIfScenariosPanel({ onClose, lsGet, profile, pIndex }) {
        const [selectedAction, setSelectedAction] = useState(null);
        const [actionParams, setActionParams] = useState({});
        const [simulation, setSimulation] = useState(null);
        const [isSimulating, setIsSimulating] = useState(false);
        const [activeCategory, setActiveCategory] = useState('meal');

        // Сбор данных за 14-30 дней
        const daysData = useMemo(() => {
            console.log('[WhatIfScenarios] 📊 Collecting days data...');
            const start = performance.now();

            if (!HEYS.Metabolic?.getDaysHistory) {
                console.warn('[WhatIfScenarios] ⚠️ HEYS.Metabolic.getDaysHistory not available');
                return [];
            }

            const days = HEYS.Metabolic.getDaysHistory(30);
            const duration = (performance.now() - start).toFixed(2);

            console.log('[WhatIfScenarios] ✅ Days collected:', {
                count: days.length,
                durationMs: duration,
                dateRange: days.length > 0 ? [days[0].date, days[days.length - 1].date] : []
            });

            return days;
        }, []);

        useEffect(() => {
            console.info('[HEYS.insights.whatif.ui] ✅ What-If panel opened', {
                daysCount: daysData.length,
                hasProfile: !!profile,
                hasPIndex: !!pIndex
            });

            return () => {
                console.info('[HEYS.insights.whatif.ui] ↩️ What-If panel closed');
            };
        }, [daysData.length, profile, pIndex]);

        // Фильтрованные действия по выбранной категории
        const filteredActions = useMemo(() => {
            return Object.entries(ACTION_CONFIG)
                .filter(([key, config]) => config.category === activeCategory)
                .map(([key, config]) => ({ key, ...config }));
        }, [activeCategory]);

        // Обработчик выбора действия
        const handleActionSelect = (actionKey) => {
            console.log('[WhatIfScenarios] 🎯 Action selected:', actionKey);
            setSelectedAction(actionKey);
            setSimulation(null);

            // Установить значения по умолчанию для параметров
            const config = ACTION_CONFIG[actionKey];
            const defaults = {};
            config.params.forEach(param => {
                defaults[param.key] = param.default;
            });
            setActionParams(defaults);
        };

        // Обработчик изменения параметра
        const handleParamChange = (paramKey, value) => {
            setActionParams(prev => ({
                ...prev,
                [paramKey]: value
            }));
        };

        // Обработчик запуска симуляции
        const handleRunSimulation = async () => {
            if (!selectedAction) return;

            console.log('[WhatIfScenarios] 🚀 Running simulation:', {
                action: selectedAction,
                params: actionParams,
                daysCount: daysData.length
            });

            setIsSimulating(true);
            const start = performance.now();

            try {
                // Вызов backend симулятора
                const simulate = HEYS.InsightsPI?.whatif?.simulate || HEYS.InsightsPI?.whatif?.simulateAction;
                if (!simulate) {
                    throw new Error('HEYS.InsightsPI.whatif.simulate not available');
                }

                const result = await simulate(
                    selectedAction,
                    actionParams,
                    daysData,
                    profile,
                    pIndex
                );

                const duration = (performance.now() - start).toFixed(2);

                console.log('[WhatIfScenarios] ✅ Simulation complete:', {
                    action: selectedAction,
                    durationMs: duration,
                    impactCount: result.impact?.length || 0,
                    healthScoreDelta: result.healthScoreChange?.delta
                });

                console.log('[WhatIfScenarios] 📊 Detailed result structure:', {
                    impactSample: result.impact?.[0],
                    sideBenefitsSample: result.sideBenefits?.[0],
                    tipsSample: result.practicalTips?.[0],
                    healthScore: result.healthScoreChange
                });

                setSimulation(result);
            } catch (error) {
                console.error('[WhatIfScenarios] ❌ Simulation failed:', error);
                setSimulation({ available: false, error: error.message });
            } finally {
                setIsSimulating(false);
            }
        };

        // UI: Category tabs
        const categoryTabs = h('div', { className: 'whatif-scenarios-panel__categories' },
            Object.entries(CATEGORY_CONFIG).map(([key, config]) =>
                h('button', {
                    key: key,
                    className: `whatif-scenarios-panel__category ${activeCategory === key ? 'active' : ''}`,
                    onClick: () => {
                        setActiveCategory(key);
                        setSelectedAction(null);
                        setSimulation(null);
                    },
                    style: { '--category-color': config.color }
                },
                    h('span', { className: 'whatif-scenarios-panel__category-emoji' }, config.emoji),
                    h('span', { className: 'whatif-scenarios-panel__category-label' }, config.label)
                )
            )
        );

        // UI: Action buttons
        const actionButtons = h('div', { className: 'whatif-scenarios-panel__actions' },
            filteredActions.map(action =>
                h('button', {
                    key: action.key,
                    className: `whatif-scenarios-panel__action ${selectedAction === action.key ? 'active' : ''}`,
                    onClick: () => handleActionSelect(action.key)
                },
                    h('span', { className: 'whatif-scenarios-panel__action-emoji' }, action.emoji),
                    h('div', { className: 'whatif-scenarios-panel__action-content' },
                        h('span', { className: 'whatif-scenarios-panel__action-label' }, action.label),
                        h('span', { className: 'whatif-scenarios-panel__action-description' }, action.description)
                    )
                )
            )
        );

        // UI: Parameters form
        const paramsForm = selectedAction && h('div', { className: 'whatif-scenarios-panel__params' },
            h('h4', { className: 'whatif-scenarios-panel__params-title' }, 'Настройте параметры'),
            ACTION_CONFIG[selectedAction].params.map(param => {
                if (param.type === 'number') {
                    return h('div', { key: param.key, className: 'whatif-scenarios-panel__param' },
                        h('label', { className: 'whatif-scenarios-panel__param-label' }, param.label),
                        h('input', {
                            type: 'number',
                            className: 'whatif-scenarios-panel__param-input',
                            min: param.min,
                            max: param.max,
                            step: param.step,
                            value: actionParams[param.key] || param.default,
                            onChange: (e) => handleParamChange(param.key, parseFloat(e.target.value))
                        })
                    );
                } else if (param.type === 'select') {
                    return h('div', { key: param.key, className: 'whatif-scenarios-panel__param' },
                        h('label', { className: 'whatif-scenarios-panel__param-label' }, param.label),
                        h('select', {
                            className: 'whatif-scenarios-panel__param-select',
                            value: actionParams[param.key] !== undefined ? actionParams[param.key] : param.default,
                            onChange: (e) => handleParamChange(param.key, parseInt(e.target.value))
                        },
                            param.options.map((option, idx) =>
                                h('option', { key: idx, value: idx }, option)
                            )
                        )
                    );
                } else if (param.type === 'time') {
                    return h('div', { key: param.key, className: 'whatif-scenarios-panel__param' },
                        h('label', { className: 'whatif-scenarios-panel__param-label' }, param.label),
                        h('input', {
                            type: 'time',
                            className: 'whatif-scenarios-panel__param-input',
                            value: actionParams[param.key] || param.default,
                            onChange: (e) => handleParamChange(param.key, e.target.value)
                        })
                    );
                }
            }),
            h('button', {
                className: 'whatif-scenarios-panel__run-btn',
                onClick: handleRunSimulation,
                disabled: isSimulating || daysData.length < 7
            },
                isSimulating ? '⏳ Симулируем...' : 'Посчитать'
            ),
            daysData.length < 7 && h('p', {
                className: 'whatif-scenarios-panel__warning'
            }, `⚠️ Нужно минимум 7 дней данных (сейчас ${daysData.length})`)
        );

        // UI: Simulation results
        const simulationResults = simulation && simulation.available && h('div', { className: 'whatif-scenarios-panel__results' },
            h('h4', { className: 'whatif-scenarios-panel__results-title' }, 'Что изменится'),

            // Prediction cards: baseline → predicted
            simulation.impact && simulation.impact.length > 0 && h('div', { className: 'whatif-scenarios-panel__predictions' },
                simulation.impact.slice(0, 6).map((item, idx) => {
                    const isPositive = item.delta > 0;

                    return h('div', {
                        key: idx,
                        className: `whatif-scenarios-panel__prediction ${isPositive ? 'positive' : 'negative'}`
                    },
                        h('div', { className: 'whatif-scenarios-panel__prediction-header' },
                            h('span', { className: 'whatif-scenarios-panel__prediction-name' }, getPatternLabel(item.pattern)),
                            h('span', {
                                className: `whatif-scenarios-panel__prediction-delta ${isPositive ? 'positive' : 'negative'}`
                            }, `${isPositive ? '+' : ''}${item.delta} баллов`),
                            // Значимость называется словом: «🔥» рядом с числом
                            // баллов читался оценкой сценария, а не силой связи.
                            item.significance === 'high' && h('span', {
                                className: 'whatif-scenarios-panel__prediction-badge'
                            }, 'связь сильная')
                        ),
                        item.desc && h('div', { className: 'whatif-scenarios-panel__prediction-desc' }, item.desc),
                        h('div', { className: 'whatif-scenarios-panel__prediction-bar' },
                            h('div', { className: 'whatif-scenarios-panel__prediction-baseline' },
                                h('span', { className: 'whatif-scenarios-panel__prediction-label' }, `Сейчас: ${item.baseline}`),
                                h('div', {
                                    className: 'whatif-scenarios-panel__prediction-bar-fill',
                                    style: { width: `${Math.min(item.baseline, 100)}%` }
                                })
                            ),
                            h('div', { className: 'whatif-scenarios-panel__prediction-predicted' },
                                h('span', { className: 'whatif-scenarios-panel__prediction-label' }, `Прогноз: ${item.predicted}`),
                                h('div', {
                                    className: 'whatif-scenarios-panel__prediction-bar-fill predicted',
                                    style: { width: `${Math.min(item.predicted, 100)}%` }
                                })
                            )
                        )
                    );
                })
            ),

            // Summary block
            h('div', { className: 'whatif-scenarios-panel__summary' },
                // Health Score delta
                simulation.healthScoreChange && h('div', { className: 'whatif-scenarios-panel__summary-health' },
                    h('span', { className: 'whatif-scenarios-panel__summary-label' }, 'Изменение Health Score'),
                    h('span', {
                        className: `whatif-scenarios-panel__summary-value ${simulation.healthScoreChange.delta >= 0 ? 'positive' : 'negative'}`
                    }, `${simulation.healthScoreChange.delta >= 0 ? '+' : ''}${simulation.healthScoreChange.delta} баллов`)
                ),

                // Side benefits
                simulation.sideBenefits && simulation.sideBenefits.length > 0 && h('div', { className: 'whatif-scenarios-panel__summary-benefits' },
                    h('span', { className: 'whatif-scenarios-panel__summary-label' }, '✨ Бонусы'),
                    h('ul', { className: 'whatif-scenarios-panel__summary-list' },
                        simulation.sideBenefits.slice(0, 3).map((benefit, idx) =>
                            h('li', { key: idx }, `${getPatternLabel(benefit.pattern)}: ${benefit.improvement}`)
                        )
                    )
                ),

                // Practical tips
                simulation.practicalTips && simulation.practicalTips.length > 0 && h('div', { className: 'whatif-scenarios-panel__summary-tips' },
                    h('span', { className: 'whatif-scenarios-panel__summary-label' }, '💡 Рекомендации'),
                    h('ul', { className: 'whatif-scenarios-panel__summary-list' },
                        simulation.practicalTips.slice(0, 5).map((tip, idx) =>
                            h('li', { key: idx }, tip)
                        )
                    )
                )
            )
        );

        // Error state
        const errorState = simulation && !simulation.available && h('div', { className: 'whatif-scenarios-panel__error' },
            h('p', {}, `❌ ${simulation.error || 'Ошибка симуляции'}`)
        );

        // Main panel
        return h('div', {
            className: 'whatif-scenarios-panel',
            onClick: onClose
        },
            h('div', {
                className: 'whatif-scenarios-panel__dialog',
                onClick: (e) => e.stopPropagation()
            },
                // Header
                h('div', { className: 'whatif-scenarios-panel__header' },
                    h('h2', { className: 'whatif-scenarios-panel__title' }, 'Что если…'),
                    h('button', {
                        className: 'whatif-scenarios-panel__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть симулятор'
                    }, '✕')
                ),

                // Body
                h('div', { className: 'whatif-scenarios-panel__body' },
                    categoryTabs,
                    actionButtons,
                    paramsForm,
                    simulationResults,
                    errorState
                )
            )
        );
    }

    // Export components
    HEYS.InsightsPI.WhatIfScenariosCard = WhatIfScenariosCard;
    HEYS.InsightsPI.WhatIfScenariosPanel = WhatIfScenariosPanel;
    HEYS.InsightsPI.WhatIfScenariosInline = WhatIfScenariosInline;

    console.info('[HEYS.InsightsPI] ✅ What-If Scenarios UI components loaded (v2.0.0)');

})(window);
