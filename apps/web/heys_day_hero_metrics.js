// heys_day_hero_metrics.js — Hero metrics calculations (ratio status, colors)
// Phase 13D of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function computeHeroMetrics(params) {
        const {
            day,
            eatenKcal,
            optimum,
            dayTargetDef,
            r0,
            ratioZones
        } = params;
        const { factDefPct } = params || {};

        const rz = ratioZones || HEYS.ratioZones;

        const effectiveOptimumForCards = (() => {
            // 1. Refeed day — +35%
            if (day?.isRefeedDay && HEYS.Refeed) {
                return HEYS.Refeed.getRefeedOptimum(optimum, true);
            }
            // 2. Базовый optimum (долг будет учтён через displayOptimum позже)
            return optimum;
        })();

        const remainingKcal = r0(effectiveOptimumForCards - eatenKcal);
        const currentRatio = eatenKcal / (effectiveOptimumForCards || 1);

        function getEatenColor() {
            if (rz) {
                const zone = rz.getZone(currentRatio);
                const baseColor = zone.color;
                return {
                    bg: baseColor + '20',
                    text: zone.textColor === '#fff' ? baseColor : zone.textColor,
                    border: baseColor + '60'
                };
            }
            if (currentRatio < 0.5) return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
            if (currentRatio < 0.75) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
            if (currentRatio < 1.1) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
            if (currentRatio < 1.3) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
            return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
        }

        function getRemainingColor() {
            if (rz) {
                const zone = rz.getZone(currentRatio);
                const baseColor = zone.color;
                return {
                    bg: baseColor + '20',
                    text: zone.textColor === '#fff' ? baseColor : zone.textColor,
                    border: baseColor + '60'
                };
            }
            if (remainingKcal > 100) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
            if (remainingKcal >= 0) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
            return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
        }

        // Статус ratio для badge — АДАПТИВНЫЙ к времени дня
        function getRatioStatus() {
            if (eatenKcal === 0) {
                return { emoji: '👋', text: 'Хорошего дня!', color: '#64748b' };
            }

            const now = new Date();
            const currentHour = now.getHours();

            let expectedProgress;
            if (currentHour < 6) {
                expectedProgress = 0;
            } else if (currentHour <= 9) {
                expectedProgress = (currentHour - 6) * 0.08;
            } else if (currentHour <= 14) {
                expectedProgress = 0.24 + (currentHour - 9) * 0.10;
            } else if (currentHour <= 20) {
                expectedProgress = 0.74 + (currentHour - 14) * 0.04;
            } else {
                expectedProgress = 0.98;
            }

            const progressDiff = currentRatio - expectedProgress;

            if (currentRatio >= 1.3) {
                return { emoji: '🚨', text: 'Перебор!', color: '#ef4444' };
            }
            if (currentRatio >= 1.1) {
                return { emoji: '😅', text: 'Чуть больше', color: '#eab308' };
            }
            if (currentRatio >= 0.9 && currentRatio < 1.1) {
                return { emoji: '🔥', text: 'Идеально!', color: '#10b981' };
            }

            if (currentHour < 12) {
                if (currentRatio >= 0.1) {
                    return { emoji: '🌅', text: 'Хорошее начало!', color: '#22c55e' };
                }
                return { emoji: '☕', text: 'Время завтрака', color: '#64748b' };
            }

            if (currentHour < 15) {
                if (progressDiff >= -0.1) {
                    return { emoji: '👍', text: 'Так держать!', color: '#22c55e' };
                }
                if (progressDiff >= -0.25) {
                    return { emoji: '🍽️', text: 'Время обеда', color: '#eab308' };
                }
                return { emoji: '⚠️', text: 'Мало для обеда', color: '#f97316' };
            }

            if (currentHour < 19) {
                if (progressDiff >= -0.1) {
                    return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
                }
                if (progressDiff >= -0.2) {
                    return { emoji: '🍽️', text: 'Пора перекусить', color: '#eab308' };
                }
                return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
            }

            if (currentRatio >= 0.75) {
                return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
            }
            if (currentRatio >= 0.6) {
                return { emoji: '🍽️', text: 'Нужен ужин', color: '#eab308' };
            }
            if (currentRatio >= 0.4) {
                return { emoji: '⚠️', text: 'Мало калорий', color: '#f97316' };
            }
            return { emoji: '💀', text: 'Критически мало!', color: '#ef4444' };
        }

        function getDeficitColor() {
            const target = dayTargetDef;
            if (target === undefined || target === null) {
                return { bg: '#dcfce7', text: '#065f46', border: '#86efac' };
            }
            return (params.factDefPct <= target)
                ? { bg: '#dcfce7', text: '#065f46', border: '#86efac' }
                : { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' };
        }

        const deficitProgress = Math.min(100, Math.abs(factDefPct || 0) / 50 * 100);

        return {
            effectiveOptimumForCards,
            remainingKcal,
            currentRatio,
            eatenCol: getEatenColor(),
            remainCol: getRemainingColor(),
            defCol: getDeficitColor(),
            ratioStatus: getRatioStatus(),
            deficitProgress
        };
    }

    HEYS.dayHeroMetrics = {
        computeHeroMetrics
    };

})(window);
