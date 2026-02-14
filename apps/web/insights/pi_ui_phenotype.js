/**
 * HEYS Predictive Insights — Phenotype Classifier UI v1.0.0
 *
 * UI widgets for phenotype auto-detection and threshold multiplier preview.
 * Dependencies: pi_phenotype.js, pi_thresholds.js, React
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const { createElement: h, useEffect, useMemo, useState } = global.React || {};

    const PHENOTYPE_LABELS = {
        metabolic: {
            insulin_sensitive: 'Инсулин-чувствительный',
            insulin_resistant: 'Инсулин-резистентный',
            metabolic_syndrome_risk: 'Риск метаболического синдрома',
            neutral: 'Нейтральный'
        },
        circadian: {
            morning_type: 'Утренний тип',
            evening_type: 'Вечерний тип',
            flexible: 'Гибкий'
        },
        satiety: {
            high_satiety: 'Высокая сытость',
            low_satiety: 'Низкая сытость',
            volume_eater: 'Объёмный едок',
            normal: 'Нормальный'
        },
        stress: {
            stress_eater: 'Заедание стресса',
            stress_anorexic: 'Анорексичная реакция на стресс',
            neutral: 'Нейтральный'
        }
    };

    const CATEGORY_META = {
        metabolic: { emoji: '🧪', title: 'Метаболический' },
        circadian: { emoji: '🌙', title: 'Циркадный' },
        satiety: { emoji: '🍽️', title: 'Сытость' },
        stress: { emoji: '🧠', title: 'Стресс' }
    };

    const PREVIEW_THRESHOLDS = [
        'lateEatingHour',
        'proteinPerMealG',
        'mealFrequency',
        'carbPerMealG',
        'sleepVariabilityHours'
    ];

    function formatConfidence(confidence) {
        if (typeof confidence !== 'number') return '—';
        return `${Math.round(confidence * 100)}%`;
    }

    function getConfidenceClass(confidence) {
        if (confidence >= 0.7) return 'high';
        if (confidence >= 0.5) return 'medium';
        return 'low';
    }

    function getPhenotypeLabel(category, key) {
        return PHENOTYPE_LABELS[category]?.[key] || key || '—';
    }

    function PhenotypeClassifierCard({ onClick }) {
        const handleClick = () => {
            console.info('[HEYS.insights.phenotype.ui] 🖱️ CTA clicked: "Определить фенотип"');
            if (typeof onClick === 'function') onClick();
        };

        return h('div', {
            className: 'insights-card phenotype-card',
            onClick: handleClick,
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }
        },
            h('div', { className: 'insights-card__header' },
                h('span', { className: 'insights-card__icon' }, '🧬'),
                h('h3', { className: 'insights-card__title' }, 'Phenotype Classifier'),
                h('span', { className: 'insights-card__badge' }, 'Beta')
            ),
            h('div', { className: 'insights-card__body' },
                h('p', { className: 'insights-card__description' },
                    'Определяет ваш метаболический профиль и показывает персональные множители порогов.'
                ),
                h('div', { className: 'phenotype-card__chips' },
                    ['🧪', '🌙', '🍽️', '🧠'].map((emoji, idx) =>
                        h('span', { key: idx, className: 'phenotype-card__chip' }, emoji)
                    )
                )
            ),
            h('div', { className: 'insights-card__footer' },
                h('span', { className: 'insights-card__cta' }, 'Определить фенотип →')
            )
        );
    }

    function PhenotypeClassifierPanel({ onClose, profile, pIndex }) {
        const [isDetecting, setIsDetecting] = useState(false);
        const [result, setResult] = useState(null);
        const [error, setError] = useState(null);

        const daysData = useMemo(() => {
            console.info('[HEYS.insights.phenotype.ui] 📊 Collecting days data...');
            const start = performance.now();

            const getDaysHistory = HEYS.Metabolic?.getDaysHistory;
            if (typeof getDaysHistory !== 'function') {
                console.warn('[HEYS.insights.phenotype.ui] ⚠️ HEYS.Metabolic.getDaysHistory not available');
                return [];
            }

            const days = getDaysHistory(60);
            console.info('[HEYS.insights.phenotype.ui] ✅ Days collected:', {
                count: days.length,
                durationMs: (performance.now() - start).toFixed(2)
            });
            return days;
        }, []);

        useEffect(() => {
            console.info('[HEYS.insights.phenotype.ui] ✅ Phenotype panel opened', {
                daysCount: daysData.length,
                hasProfile: !!profile,
                hasPIndex: !!pIndex
            });

            return () => {
                console.info('[HEYS.insights.phenotype.ui] ↩️ Phenotype panel closed');
            };
        }, [daysData.length, profile, pIndex]);

        const runDetection = async () => {
            setIsDetecting(true);
            setError(null);

            try {
                const phenotypeApi = HEYS.InsightsPI?.phenotype;
                if (!phenotypeApi?.autoDetect || !phenotypeApi?.applyMultipliers) {
                    throw new Error('Phenotype module not available');
                }

                if (daysData.length < 30) {
                    throw new Error(`Нужно минимум 30 дней данных (сейчас ${daysData.length})`);
                }

                const start = performance.now();
                const phenotype = phenotypeApi.autoDetect(daysData, profile, pIndex);

                if (!phenotype) {
                    throw new Error('Не удалось определить фенотип');
                }

                const thresholdResult = HEYS.InsightsPI?.thresholds?.get
                    ? HEYS.InsightsPI.thresholds.get(daysData, profile, pIndex)
                    : null;

                const baseThresholds = thresholdResult?.thresholds || {
                    lateEatingHour: 21,
                    proteinPerMealG: 25,
                    mealFrequency: 4,
                    trainingProximityHours: 2,
                    carbPerMealG: 60,
                    sleepVariabilityHours: 1
                };

                const adjustedThresholds = phenotypeApi.applyMultipliers(baseThresholds, phenotype);

                const changed = Object.keys(adjustedThresholds)
                    .filter((k) => adjustedThresholds[k] !== baseThresholds[k])
                    .map((k) => ({
                        key: k,
                        before: baseThresholds[k],
                        after: adjustedThresholds[k]
                    }));

                const payload = {
                    phenotype,
                    baseThresholds,
                    adjustedThresholds,
                    changed
                };

                setResult(payload);

                console.info('[HEYS.insights.phenotype.ui] ✅ Phenotype detected:', {
                    metabolic: phenotype.metabolic,
                    circadian: phenotype.circadian,
                    satiety: phenotype.satiety,
                    stress: phenotype.stress,
                    changedThresholds: changed.length,
                    durationMs: (performance.now() - start).toFixed(2)
                });
            } catch (e) {
                console.error('[HEYS.insights.phenotype.ui] ❌ Detection failed:', e.message);
                setError(e.message || 'Ошибка определения фенотипа');
            } finally {
                setIsDetecting(false);
            }
        };

        const phenotypeBlocks = result?.phenotype && h('div', { className: 'phenotype-panel__grid' },
            Object.keys(CATEGORY_META).map((category) => {
                const current = result.phenotype[category];
                const confidence = result.phenotype.confidence?.[category] ?? 0;
                const confidenceClass = getConfidenceClass(confidence);
                return h('div', { key: category, className: 'phenotype-panel__item' },
                    h('div', { className: 'phenotype-panel__item-title' },
                        h('span', { className: 'phenotype-panel__item-emoji' }, CATEGORY_META[category].emoji),
                        h('span', {}, CATEGORY_META[category].title)
                    ),
                    h('div', { className: 'phenotype-panel__item-value' }, getPhenotypeLabel(category, current)),
                    h('div', { className: `phenotype-panel__confidence phenotype-panel__confidence--${confidenceClass}` },
                        `Confidence: ${formatConfidence(confidence)}`
                    )
                );
            })
        );

        const thresholdPreview = result?.changed?.length > 0 && h('div', { className: 'phenotype-panel__thresholds' },
            h('h4', { className: 'phenotype-panel__section-title' }, '⚙️ Персональные пороги'),
            h('div', { className: 'phenotype-panel__threshold-list' },
                result.changed
                    .filter((item) => PREVIEW_THRESHOLDS.includes(item.key))
                    .slice(0, 6)
                    .map((item) => {
                        const isUp = item.after > item.before;
                        return h('div', { key: item.key, className: 'phenotype-panel__threshold-item' },
                            h('span', { className: 'phenotype-panel__threshold-key' }, item.key),
                            h('span', { className: 'phenotype-panel__threshold-values' },
                                `${item.before} → ${item.after}`
                            ),
                            h('span', {
                                className: `phenotype-panel__threshold-delta ${isUp ? 'positive' : 'negative'}`
                            }, `${isUp ? '+' : ''}${(item.after - item.before).toFixed(1)}`)
                        );
                    })
            )
        );

        return h('div', {
            className: 'phenotype-panel',
            onClick: onClose
        },
            h('div', {
                className: 'phenotype-panel__dialog',
                onClick: (e) => e.stopPropagation()
            },
                h('div', { className: 'phenotype-panel__header' },
                    h('h2', { className: 'phenotype-panel__title' }, '🧬 Phenotype Classifier'),
                    h('button', {
                        className: 'phenotype-panel__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть фенотип'
                    }, '✕')
                ),

                h('div', { className: 'phenotype-panel__body' },
                    h('p', { className: 'phenotype-panel__description' },
                        'Классификация использует 30+ дней данных для определения метаболического и поведенческого фенотипа.'
                    ),

                    h('button', {
                        className: 'phenotype-panel__run-btn',
                        onClick: runDetection,
                        disabled: isDetecting || daysData.length < 30
                    }, isDetecting ? '⏳ Определяем...' : '🧬 Определить фенотип'),

                    daysData.length < 30 && h('p', { className: 'phenotype-panel__warning' },
                        `⚠️ Недостаточно данных: нужно 30 дней, сейчас ${daysData.length}`
                    ),

                    error && h('div', { className: 'phenotype-panel__error' }, `❌ ${error}`),

                    result && h('div', { className: 'phenotype-panel__result' },
                        h('h4', { className: 'phenotype-panel__section-title' }, 'Результат классификации'),
                        phenotypeBlocks,
                        thresholdPreview
                    )
                )
            )
        );
    }

    HEYS.InsightsPI.PhenotypeClassifierCard = PhenotypeClassifierCard;
    HEYS.InsightsPI.PhenotypeClassifierPanel = PhenotypeClassifierPanel;

    console.info('[HEYS.InsightsPI] ✅ Phenotype UI components loaded (v1.0.0)');

})(window);
