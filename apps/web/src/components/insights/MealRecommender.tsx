/**
 * Meal Recommender UI
 * 
 * Intelligent meal recommendations based on:
 * - Current time & last meal timing
 * - Remaining macros vs targets
 * - Training schedule
 * - Sleep hours
 * - Current patterns
 */

import { Calendar, Clock, Target, TrendingUp } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface MealRecommendation {
    available: boolean;
    timing: {
        idealStart: string;
        idealEnd: string;
        reason: string;
    };
    macros: {
        protein: { min: number; max: number; reason: string };
        carbs: { min: number; max: number; reason: string };
        kcal: { min: number; max: number; reason: string };
    };
    products: Array<{
        productId: string;
        name: string;
        grams: number;
        protein: number;
        carbs: number;
        kcal: number;
        reason: string;
    }>;
    reasoning: {
        timingLogic: string;
        macroLogic: string;
        productLogic: string;
    };
}

interface MealRecommenderProps {
    clientId: string;
}

export const MealRecommender: React.FC<MealRecommenderProps> = ({ clientId }) => {
    const [recommendation, setRecommendation] = useState<MealRecommendation | null>(null);
    const [context, setContext] = useState({
        currentTime: new Date().toTimeString().slice(0, 5),
        lastMealTime: '12:00',
        hasTrainingToday: false,
        trainingTime: '18:00',
        sleepHoursLastNight: 7
    });
    const [loading, setLoading] = useState(false);

    const getRecommendation = async () => {
        try {
            setLoading(true);

            const HEYS = (window as any).HEYS;
            if (!HEYS?.InsightsPI?.mealRecommender) {
                console.error('[MealRecommender] InsightsPI.mealRecommender not available');
                return;
            }

            const days = HEYS.daysByDate ? Object.values(HEYS.daysByDate) : [];
            const profile = HEYS.profile || {};
            const pIndex = HEYS.products || { byId: new Map() };

            console.log('[MealRecommender] Getting recommendation:', context);

            const result = HEYS.InsightsPI.mealRecommender.recommend(
                context.currentTime,
                context.lastMealTime,
                days,
                profile,
                pIndex,
                context.hasTrainingToday,
                context.trainingTime,
                context.sleepHoursLastNight
            );

            console.log('[MealRecommender] Recommendation result:', result);
            setRecommendation(result);
        } catch (error) {
            console.error('[MealRecommender] Error getting recommendation:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Auto-update current time every minute
        const interval = setInterval(() => {
            setContext(prev => ({
                ...prev,
                currentTime: new Date().toTimeString().slice(0, 5)
            }));
        }, 60000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="meal-recommender space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-50 to-yellow-50 p-6 rounded-lg border border-green-200">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span role="img" aria-label="fork and knife">🍽️</span>
                    Meal Recommender
                </h2>
                <p className="text-gray-600 mt-2">
                    Get personalized meal suggestions based on your current state and goals
                </p>
            </div>

            {/* Context Inputs */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Current Context
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Current Time */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Current Time
                        </label>
                        <input
                            type="time"
                            value={context.currentTime}
                            onChange={(e) => setContext({ ...context, currentTime: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>

                    {/* Last Meal Time */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Last Meal Time
                        </label>
                        <input
                            type="time"
                            value={context.lastMealTime}
                            onChange={(e) => setContext({ ...context, lastMealTime: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>

                    {/* Training Today */}
                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={context.hasTrainingToday}
                                onChange={(e) => setContext({ ...context, hasTrainingToday: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm font-medium text-gray-700">
                                Training scheduled today
                            </span>
                        </label>
                    </div>

                    {/* Training Time */}
                    {context.hasTrainingToday && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Training Time
                            </label>
                            <input
                                type="time"
                                value={context.trainingTime}
                                onChange={(e) => setContext({ ...context, trainingTime: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                    )}

                    {/* Sleep Hours */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Sleep Hours Last Night
                        </label>
                        <input
                            type="number"
                            value={context.sleepHoursLastNight}
                            onChange={(e) => setContext({ ...context, sleepHoursLastNight: Number(e.target.value) })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            min="4"
                            max="12"
                            step="0.5"
                        />
                    </div>
                </div>

                <button
                    onClick={getRecommendation}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors font-medium"
                >
                    {loading ? '🔄 Analyzing...' : '🍽️ Get Meal Recommendation'}
                </button>
            </div>

            {/* Recommendation Results */}
            {recommendation && recommendation.available && (
                <div className="space-y-4">
                    {/* Timing */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-blue-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-600" />
                            Optimal Timing
                        </h3>
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-blue-600">
                                    {recommendation.timing.idealStart}
                                </div>
                                <div className="text-sm text-gray-500">Earliest</div>
                            </div>
                            <div className="text-2xl text-gray-400">→</div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-blue-600">
                                    {recommendation.timing.idealEnd}
                                </div>
                                <div className="text-sm text-gray-500">Latest</div>
                            </div>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <p className="text-gray-700">
                                <strong>Why:</strong> {recommendation.timing.reason}
                            </p>
                        </div>
                    </div>

                    {/* Macros */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Target className="w-5 h-5 text-green-600" />
                            Target Macros
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Protein */}
                            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                                <div className="text-sm font-medium text-gray-600 mb-1">Protein</div>
                                <div className="text-2xl font-bold text-red-600 mb-2">
                                    {recommendation.macros.protein.min}-{recommendation.macros.protein.max}g
                                </div>
                                <div className="text-xs text-gray-600">
                                    {recommendation.macros.protein.reason}
                                </div>
                            </div>

                            {/* Carbs */}
                            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                                <div className="text-sm font-medium text-gray-600 mb-1">Carbs</div>
                                <div className="text-2xl font-bold text-yellow-600 mb-2">
                                    {recommendation.macros.carbs.min}-{recommendation.macros.carbs.max}g
                                </div>
                                <div className="text-xs text-gray-600">
                                    {recommendation.macros.carbs.reason}
                                </div>
                            </div>

                            {/* Calories */}
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                <div className="text-sm font-medium text-gray-600 mb-1">Calories</div>
                                <div className="text-2xl font-bold text-blue-600 mb-2">
                                    {recommendation.macros.kcal.min}-{recommendation.macros.kcal.max}
                                </div>
                                <div className="text-xs text-gray-600">
                                    {recommendation.macros.kcal.reason}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Product Suggestions */}
                    {recommendation.products.length > 0 && (
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-purple-600" />
                                Suggested Products
                            </h3>
                            <div className="space-y-3">
                                {recommendation.products.map((product, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-purple-300 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900">{product.name}</div>
                                            <div className="text-sm text-gray-600 mt-1">
                                                {product.grams}g • {product.protein}g protein • {product.carbs}g carbs • {product.kcal} kcal
                                            </div>
                                            <div className="text-xs text-purple-600 mt-1">
                                                💡 {product.reason}
                                            </div>
                                        </div>
                                        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium">
                                            + Add
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reasoning */}
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-lg border border-purple-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <span role="img" aria-label="brain">🧠</span>
                            Analysis
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <div className="text-sm font-medium text-gray-700 mb-1">Timing Logic:</div>
                                <p className="text-gray-600 text-sm">{recommendation.reasoning.timingLogic}</p>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-gray-700 mb-1">Macro Logic:</div>
                                <p className="text-gray-600 text-sm">{recommendation.reasoning.macroLogic}</p>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-gray-700 mb-1">Product Logic:</div>
                                <p className="text-gray-600 text-sm">{recommendation.reasoning.productLogic}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {recommendation && !recommendation.available && (
                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                    <p className="text-gray-700">
                        ⚠️ Not enough data to generate recommendations. Need at least 7 days of tracking.
                    </p>
                </div>
            )}
        </div>
    );
};

export default MealRecommender;
