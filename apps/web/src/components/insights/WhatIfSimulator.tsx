/**
 * What-If Scenario Simulator
 * 
 * Interactive UI for simulating actions and predicting pattern changes:
 * - Action selector
 * - Parameter inputs
 * - Prediction cards
 * - Impact visualization
 * - Side benefits display
 */

import React, { useState } from 'react';

interface SimulationResult {
    available: boolean;
    actionType: string;
    actionParams: Record<string, any>;
    baseline: Record<string, number>;
    predicted: Record<string, number>;
    impact: Array<{
        pattern: string;
        baseline: number;
        predicted: number;
        delta: number;
        percentChange: number;
        significance: 'high' | 'medium';
    }>;
    sideBenefits: Array<{ pattern: string; improvement: string }>;
    healthScoreChange: { delta: number; percent: number };
    practicalTips: string[];
}

interface WhatIfSimulatorProps {
    clientId: string;
}

const ACTION_LABELS = {
    add_protein: '➕ Add Protein',
    add_fiber: '🥗 Add Fiber',
    reduce_carbs: '⬇️ Reduce Carbs',
    increase_meal_gap: '⏱️ Increase Meal Gap',
    shift_meal_time: '🕐 Shift Meal Time',
    skip_late_meal: '🌙 Skip Late Meal',
    increase_sleep: '💤 Increase Sleep',
    adjust_bedtime: '🛏️ Adjust Bedtime',
    add_training: '🏋️ Add Training',
    increase_steps: '👟 Increase Steps'
};

const PATTERN_LABELS: Record<string, string> = {
    protein_satiety: 'Protein → Satiety',
    meal_timing: 'Meal Timing',
    wave_overlap: 'Wave Overlap',
    late_eating: 'Late Eating',
    sleep_weight: 'Sleep → Weight',
    sleep_quality: 'Sleep Quality',
    steps_weight: 'Steps → Weight',
    training_kcal: 'Training → Kcal',
    meal_quality_trend: 'Meal Quality'
};

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ clientId }) => {
    const [selectedAction, setSelectedAction] = useState<string>('add_protein');
    const [params, setParams] = useState<Record<string, any>>({
        proteinGrams: 30,
        mealIndex: 0,
        sleepIncrease: 1,
        stepsIncrease: 3000
    });
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [loading, setLoading] = useState(false);

    const runSimulation = async () => {
        try {
            setLoading(true);

            const HEYS = (window as any).HEYS;
            if (!HEYS?.InsightsPI?.whatif) {
                console.error('[WhatIfSimulator] InsightsPI.whatif not available');
                return;
            }

            const days = HEYS.daysByDate ? Object.values(HEYS.daysByDate) : [];
            const profile = HEYS.profile || {};
            const pIndex = HEYS.products || { byId: new Map() };

            const actionParams = getActionParams(selectedAction, params);

            console.log('[WhatIfSimulator] Running simulation:', { selectedAction, actionParams });

            const simulation = HEYS.InsightsPI.whatif.simulate(
                selectedAction,
                actionParams,
                days,
                profile,
                pIndex
            );

            console.log('[WhatIfSimulator] Simulation result:', simulation);
            setResult(simulation);
        } catch (error) {
            console.error('[WhatIfSimulator] Error running simulation:', error);
        } finally {
            setLoading(false);
        }
    };

    const getActionParams = (action: string, p: Record<string, any>) => {
        switch (action) {
            case 'add_protein':
                return { proteinGrams: p.proteinGrams, mealIndex: p.mealIndex };
            case 'increase_sleep':
                return { sleepIncrease: p.sleepIncrease };
            case 'increase_steps':
                return { stepsIncrease: p.stepsIncrease };
            case 'increase_meal_gap':
                return { gapIncrease: p.gapIncrease || 1 };
            default:
                return {};
        }
    };

    return (
        <div className="whatif-simulator space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span role="img" aria-label="crystal ball">🔮</span>
                    What-If Scenario Simulator
                </h2>
                <p className="text-gray-600 mt-2">
                    Test different actions and see predicted impact on your patterns
                </p>
            </div>

            {/* Action Selector */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Choose an Action
                </label>
                <select
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>

                {/* Parameter Inputs */}
                <div className="mt-4 space-y-3">
                    {selectedAction === 'add_protein' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Protein Amount (grams)
                                </label>
                                <input
                                    type="number"
                                    value={params.proteinGrams}
                                    onChange={(e) => setParams({ ...params, proteinGrams: Number(e.target.value) })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                    min="10"
                                    max="60"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Which Meal?
                                </label>
                                <select
                                    value={params.mealIndex}
                                    onChange={(e) => setParams({ ...params, mealIndex: Number(e.target.value) })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                >
                                    <option value={0}>Breakfast</option>
                                    <option value={1}>Lunch</option>
                                    <option value={2}>Dinner</option>
                                </select>
                            </div>
                        </>
                    )}

                    {selectedAction === 'increase_sleep' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Sleep Increase (hours)
                            </label>
                            <input
                                type="number"
                                value={params.sleepIncrease}
                                onChange={(e) => setParams({ ...params, sleepIncrease: Number(e.target.value) })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                min="0.5"
                                max="3"
                                step="0.5"
                            />
                        </div>
                    )}

                    {selectedAction === 'increase_steps' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Steps Increase
                            </label>
                            <input
                                type="number"
                                value={params.stepsIncrease}
                                onChange={(e) => setParams({ ...params, stepsIncrease: Number(e.target.value) })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                min="1000"
                                max="10000"
                                step="500"
                            />
                        </div>
                    )}
                </div>

                {/* Run Button */}
                <button
                    onClick={runSimulation}
                    disabled={loading}
                    className="mt-4 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
                >
                    {loading ? '🔄 Simulating...' : '▶️ Run Simulation'}
                </button>
            </div>

            {/* Results */}
            {result && result.available && (
                <div className="space-y-4">
                    {/* Health Score Change */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-blue-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">
                            Overall Health Score Impact
                        </h3>
                        <div className="flex items-center justify-center gap-4">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-gray-700">
                                    {result.healthScoreChange.delta > 0 ? '+' : ''}
                                    {result.healthScoreChange.delta.toFixed(2)}
                                </div>
                                <div className="text-sm text-gray-500">Score Change</div>
                            </div>
                            <div className="text-4xl">
                                {result.healthScoreChange.delta > 0 ? '📈' : '📉'}
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-green-600">
                                    {result.healthScoreChange.percent > 0 ? '+' : ''}
                                    {result.healthScoreChange.percent}%
                                </div>
                                <div className="text-sm text-gray-500">Improvement</div>
                            </div>
                        </div>
                    </div>

                    {/* Pattern Impacts */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">
                            Pattern Changes
                        </h3>
                        <div className="space-y-3">
                            {result.impact.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`p-4 rounded-lg border-2 ${item.delta > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900">
                                                {PATTERN_LABELS[item.pattern] || item.pattern}
                                            </div>
                                            <div className="text-sm text-gray-600 mt-1">
                                                {item.baseline.toFixed(2)} → {item.predicted.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-2xl font-bold ${item.delta > 0 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                {item.delta > 0 ? '+' : ''}{item.delta.toFixed(2)}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                ({item.percentChange > 0 ? '+' : ''}{item.percentChange}%)
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Side Benefits */}
                    {result.sideBenefits.length > 0 && (
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg border border-green-200">
                            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <span role="img" aria-label="sparkles">✨</span>
                                Side Benefits
                            </h3>
                            <div className="space-y-2">
                                {result.sideBenefits.map((benefit, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-gray-700">
                                        <span className="text-green-600 font-bold">{benefit.improvement}</span>
                                        <span>improvement in {PATTERN_LABELS[benefit.pattern] || benefit.pattern}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Practical Tips */}
                    {result.practicalTips.length > 0 && (
                        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <span role="img" aria-label="lightbulb">💡</span>
                                How to Implement
                            </h3>
                            <ul className="space-y-2">
                                {result.practicalTips.map((tip, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-gray-700">
                                        <span className="text-blue-600 font-bold">•</span>
                                        <span>{tip}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WhatIfSimulator;
