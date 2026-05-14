/**
 * HEYS Insights — Causal Chains Detector v1.0
 * 
 * Детектирует причинно-следственные связи между warnings и patterns
 * для выявления root causes и приоритизации действий.
 * 
 * @module pi_causal_chains
 * @version 1.0.0
 * @date 2026-02-16
 */

(function (HEYS) {
    'use strict';

    HEYS = HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const LOG_PREFIX = 'ews / causal_chain';

    /**
     * Библиотека известных причинных цепочек
     * Каждая цепочка: root_cause → intermediate_nodes → outcome
     */
    const CAUSAL_CHAINS_LIBRARY = [
        {
            chainId: 'SLEEP_STRESS_BINGE',
            name: 'Недосып → Стресс → Переедание',
            nodes: ['SLEEP_DEBT', 'STRESS_ACCUMULATION', 'BINGE_RISK'],
            rootCause: 'SLEEP_DEBT',
            outcome: 'BINGE_RISK',
            confidence: 0.85, // Исследовательская база
            mechanism: 'Недосып повышает кортизол → стресс → эмоциональное переедание',
            actionableFix: [
                'Приоритизировать сон: цель 7-8 часов',
                'Управление стрессом: медитация, прогулки',
                'Структурировать питание: регулярные приёмы, не пропускать завтрак'
            ],
            evidenceLevel: 'A', // Strong RCT evidence
            sources: ['PMID:29195725', 'PMID:23439798']
        },
        {
            chainId: 'LOGGING_PATTERN_GOAL',
            name: 'Пропуски логирования → Деградация паттернов → Отдаление от цели',
            nodes: ['LOGGING_GAP', 'CRITICAL_PATTERN_DEGRADATION', 'STATUS_SCORE_DECLINE'],
            rootCause: 'LOGGING_GAP',
            outcome: 'STATUS_SCORE_DECLINE',
            confidence: 0.75,
            mechanism: 'Потеря осознанности → ухудшение привычек → общий откат',
            actionableFix: [
                'Упростить логирование: приоритет на основные приёмы',
                'Установить напоминания на регулярное время',
                'Фокус на 2-3 ключевых паттерна, а не все сразу'
            ],
            evidenceLevel: 'B', // Behavioral studies
            sources: ['PMID:22281454']
        },
        {
            chainId: 'CALORIC_MOOD_EVENING',
            name: 'Калорийный дефицит → Упадок настроения → Вечернее переедание',
            nodes: ['CALORIC_DEBT', 'MOOD_WELLBEING_DECLINE', 'EVENING_OVERCONSUMPTION'],
            rootCause: 'CALORIC_DEBT',
            outcome: 'EVENING_OVERCONSUMPTION',
            confidence: 0.80,
            mechanism: 'Избыточный дефицит → низкий сахар → раздражительность → вечерние срывы',
            actionableFix: [
                'Увеличить калории на 10-15% для устойчивого дефицита',
                'Добавить белок в завтрак и обед',
                'Планировать вечерний приём: лёгкий ужин без чувства депривации'
            ],
            evidenceLevel: 'A',
            sources: ['PMID:17228046', 'PMID:25896063']
        },
        {
            chainId: 'TRAINING_RECOVERY_PLATEAU',
            name: 'Тренировки без восстановления → Стресс → Плато',
            nodes: ['TRAINING_WITHOUT_RECOVERY', 'STRESS_ACCUMULATION', 'WEIGHT_PLATEAU'],
            rootCause: 'TRAINING_WITHOUT_RECOVERY',
            outcome: 'WEIGHT_PLATEAU',
            confidence: 0.70,
            mechanism: 'Overtraining → повышенный кортизол → задержка воды + замедление метаболизма',
            actionableFix: [
                'Добавить 1-2 дня активного восстановления (йога, ходьба)',
                'Проверить сон и протеин (1.6-2.2g/kg)',
                'Рассмотреть deload-неделю (снижение объёма на 40%)'
            ],
            evidenceLevel: 'B',
            sources: ['PMID:26388513']
        },
        {
            chainId: 'PROTEIN_SATIETY_BINGE',
            name: 'Дефицит белка → Низкая сытость → Риск переедания',
            nodes: ['PROTEIN_DEFICIT', 'MEAL_SKIP_PATTERN', 'BINGE_RISK'],
            rootCause: 'PROTEIN_DEFICIT',
            outcome: 'BINGE_RISK',
            confidence: 0.78,
            mechanism: 'Недостаток белка → слабая сытость → пропуски приёмов → компенсаторное переедание',
            actionableFix: [
                'Повысить белок до 1.6-2.0g/kg массы тела',
                'Распределить белок равномерно: 25-30g на приём',
                'Приоритет: белковый завтрак для контроля аппетита днём'
            ],
            evidenceLevel: 'A',
            sources: ['PMID:18469287', 'PMID:23446962']
        },
        {
            chainId: 'HYDRATION_MOOD_PERFORMANCE',
            name: 'Дефицит гидратации → Утомляемость → Снижение активности',
            nodes: ['HYDRATION_DEFICIT', 'MOOD_WELLBEING_DECLINE', 'STEP_DECLINE'],
            rootCause: 'HYDRATION_DEFICIT',
            outcome: 'STEP_DECLINE',
            confidence: 0.65,
            mechanism: 'Обезвоживание 2%+ → когнитивные нарушения → усталость → снижение NEAT',
            actionableFix: [
                'Цель: 30-35 мл/кг веса тела',
                'Пить стакан воды при пробуждении и перед каждым приёмом',
                'Использовать трекер воды или бутылку с разметкой'
            ],
            evidenceLevel: 'B',
            sources: ['PMID:22190027']
        }
    ];

    /**
     * Детектор причинных цепочек
     * @param {object} options - { warnings, patterns, trends }
     * @returns {object[]} Массив обнаруженных цепочек
     */
    function detectCausalChains(options = {}) {
        const { warnings = [], patterns = {}, trends = {} } = options;

        console.info(`${LOG_PREFIX} 🚀 start`, {
            warningsCount: warnings.length,
            patternsCount: Object.keys(patterns).length,
            trendsCount: Object.keys(trends).length
        });

        console.info(`${LOG_PREFIX} 📥 input`, {
            warningTypes: warnings.map(w => w.type),
            hasPatterns: !!patterns && Object.keys(patterns).length > 0,
            hasTrends: !!trends && Object.keys(trends).length > 0
        });

        // Graceful fallback для пустых данных
        if (!warnings || warnings.length === 0) {
            console.info(`${LOG_PREFIX} ✅ result`, { chains: 0, reason: 'no_warnings' });
            return [];
        }

        // R-INS-3D (2026-05-14, refined в R-INS-P2-1 2026-05-14):
        // Защита от false positives на малых выборках. Причинно-следственные
        // цепочки требуют хотя бы 14 дней данных — иначе r=0.6 на 5 днях
        // расценивается как валидная связь, что физиологически некорректно (шум).
        //
        // Изначальный R-INS-3D return-метаданные `__insufficient/__have/__need/
        // __remaining` через Object.assign([], ...). Но grep по консьюмерам показал
        // что chains используются ТОЛЬКО в planner advisories (pi_meal_planner.js:482
        // и :1751) — никакой UI секции для chains нет, метаданные никто не читал.
        // Поэтому возвращаем простой пустой массив + лог с прогрессом (debug only).
        const MIN_DAYS_FOR_CAUSAL = 14;
        if (warnings.length < MIN_DAYS_FOR_CAUSAL) {
            console.info(`${LOG_PREFIX} ✅ result`, {
                chains: 0,
                reason: 'insufficient_data',
                haveWarnings: warnings.length,
                needWarnings: MIN_DAYS_FOR_CAUSAL,
                daysRemaining: MIN_DAYS_FOR_CAUSAL - warnings.length
            });
            return [];
        }

        const detectedChains = [];
        const warningTypesSet = new Set(warnings.map(w => w.type));

        console.info(`${LOG_PREFIX} 🧮 compute`, {
            phase: 'matching_chains',
            librarySize: CAUSAL_CHAINS_LIBRARY.length,
            warningTypes: Array.from(warningTypesSet)
        });

        // Проверяем каждую цепочку из библиотеки
        for (const chain of CAUSAL_CHAINS_LIBRARY) {
            // Проверяем наличие root cause
            if (!warningTypesSet.has(chain.rootCause)) continue;

            // Считаем сколько узлов цепочки присутствуют
            const matchedNodes = chain.nodes.filter(node => warningTypesSet.has(node));
            const matchRatio = matchedNodes.length / chain.nodes.length;

            // Требуем минимум 50% покрытия цепочки (включая root cause)
            if (matchRatio < 0.5) continue;

            // Получаем warnings для этой цепочки
            const chainWarnings = warnings.filter(w => chain.nodes.includes(w.type));

            // Вычисляем adjusted confidence на основе severity и chronicity
            let adjustedConfidence = chain.confidence;

            // Boost за high severity warnings в цепочке
            const highSeverityCount = chainWarnings.filter(w => w.severity === 'high').length;
            if (highSeverityCount >= 2) adjustedConfidence = Math.min(1.0, adjustedConfidence * 1.1);

            // Boost за chronic warnings
            const chronicCount = chainWarnings.filter(w => {
                return trends.allTrends?.[w.type]?.chronic;
            }).length;
            if (chronicCount >= 1) adjustedConfidence = Math.min(1.0, adjustedConfidence * 1.1);

            // Penalty за неполное покрытие цепочки
            if (matchRatio < 1.0) adjustedConfidence *= matchRatio;

            detectedChains.push({
                ...chain,
                matchedNodes,
                matchRatio: Math.round(matchRatio * 100),
                adjustedConfidence: Math.round(adjustedConfidence * 100) / 100,
                warnings: chainWarnings,
                timestamp: new Date().toISOString()
            });
        }

        // Сортировка по adjusted confidence (desc)
        detectedChains.sort((a, b) => b.adjustedConfidence - a.adjustedConfidence);

        console.info(`${LOG_PREFIX} ✅ result`, {
            chainsDetected: detectedChains.length,
            chainIds: detectedChains.map(c => c.chainId),
            topConfidence: detectedChains[0]?.adjustedConfidence || 0
        });

        return detectedChains;
    }

    /**
     * Форматирование цепочки для UI
     * @param {object} chain - Обнаруженная цепочка
     * @returns {string} Отформатированное описание
     */
    function formatChainForUI(chain) {
        const arrow = ' → ';
        const nodesStr = chain.matchedNodes.join(arrow);
        const confidenceStr = `${Math.round(chain.adjustedConfidence * 100)}%`;

        return {
            title: chain.name,
            path: nodesStr,
            confidence: confidenceStr,
            mechanism: chain.mechanism,
            actions: chain.actionableFix,
            evidenceLevel: chain.evidenceLevel
        };
    }

    // Export API
    HEYS.InsightsPI.causalChains = {
        detect: detectCausalChains,
        formatForUI: formatChainForUI,
        library: CAUSAL_CHAINS_LIBRARY,
        version: '1.0.0'
    };

    console.log('[HEYS.InsightsPI] ✅ Causal Chains Detector v1.0 loaded (6 chain templates)');

})(typeof window !== 'undefined' ? window.HEYS : global.HEYS);
