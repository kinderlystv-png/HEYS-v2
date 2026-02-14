/**
 * Early Warning Dashboard
 * 
 * Full dashboard section showing all detected warning signals with:
 * - Detail breakdown
 * - Severity indicators
 * - Actionable recommendations
 * - Trend visualization
 */

import React, { useEffect, useState } from 'react';

interface Warning {
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    detail: string;
    action: string;
    actionable: boolean;
    days?: number;
    currentScore?: number;
    previousScore?: number;
    totalDrop?: number;
    avgSleep?: number;
    totalDeficit?: number;
    avgEaten?: number;
    totalDebt?: number;
}

interface EarlyWarningResult {
    available: boolean;
    count: number;
    warnings: Warning[];
    summary: string;
    highSeverityCount: number;
    mediumSeverityCount: number;
}

interface EarlyWarningDashboardProps {
    clientId: string;
    onActionClick?: (warning: Warning) => void;
}

export const EarlyWarningDashboard: React.FC<EarlyWarningDashboardProps> = ({
    clientId,
    onActionClick
}) => {
    const [warnings, setWarnings] = useState<EarlyWarningResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        detectWarnings();
    }, [clientId]);

    const detectWarnings = async () => {
        try {
            setLoading(true);

            const HEYS = (window as any).HEYS;
            if (!HEYS?.InsightsPI?.earlyWarning) {
                console.warn('[EarlyWarningDashboard] InsightsPI.earlyWarning not available');
                return;
            }

            const days = HEYS.daysByDate ? Object.values(HEYS.daysByDate) : [];
            const profile = HEYS.profile || {};
            const pIndex = HEYS.products || { byId: new Map() };

            const result = HEYS.InsightsPI.earlyWarning.detect(days, profile, pIndex);
            console.log('[EarlyWarningDashboard] Detection result:', result);

            setWarnings(result);
        } catch (error) {
            console.error('[EarlyWarningDashboard] Error detecting warnings:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpanded = (warningType: string) => {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(warningType)) {
            newExpanded.delete(warningType);
        } else {
            newExpanded.add(warningType);
        }
        setExpanded(newExpanded);
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high': return 'bg-red-50 border-red-200 text-red-900';
            case 'medium': return 'bg-orange-50 border-orange-200 text-orange-900';
            case 'low': return 'bg-yellow-50 border-yellow-200 text-yellow-900';
            default: return 'bg-gray-50 border-gray-200 text-gray-900';
        }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'high': return '🔴';
            case 'medium': return '⚠️';
            case 'low': return '⚡';
            default: return 'ℹ️';
        }
    };

    const getWarningIcon = (type: string) => {
        switch (type) {
            case 'HEALTH_SCORE_DECLINE': return '📉';
            case 'CRITICAL_PATTERN_DEGRADATION': return '📊';
            case 'SLEEP_DEBT': return '💤';
            case 'CALORIC_DEBT': return '🍽️';
            default: return '⚠️';
        }
    };

    if (loading) {
        return (
            <div className="early-warning-dashboard p-6">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Analyzing trends...</span>
                </div>
            </div>
        );
    }

    if (!warnings || !warnings.available) {
        return (
            <div className="early-warning-dashboard p-6 bg-gray-50 rounded-lg">
                <p className="text-gray-600">⚠️ Insufficient data for Early Warning System</p>
                <p className="text-sm text-gray-500 mt-2">Need at least 7 days of tracking</p>
            </div>
        );
    }

    if (warnings.count === 0) {
        return (
            <div className="early-warning-dashboard p-6 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-3">
                    <span className="text-3xl" role="img" aria-label="success">✅</span>
                    <div>
                        <h3 className="text-lg font-semibold text-green-900">All Clear!</h3>
                        <p className="text-green-700">No negative trends detected. Keep up the great work!</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="early-warning-dashboard space-y-4">
            {/* Header */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span role="img" aria-label="warning">🚨</span>
                            Early Warning Signals
                        </h2>
                        <p className="text-gray-600 mt-1">{warnings.summary}</p>
                    </div>
                    <div className="flex gap-2">
                        {warnings.highSeverityCount > 0 && (
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                                {warnings.highSeverityCount} High
                            </span>
                        )}
                        {warnings.mediumSeverityCount > 0 && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                                {warnings.mediumSeverityCount} Medium
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Warning Cards */}
            <div className="space-y-3">
                {warnings.warnings.map((warning, index) => {
                    const isExpanded = expanded.has(warning.type);
                    const severityColor = getSeverityColor(warning.severity);

                    return (
                        <div
                            key={`${warning.type}-${index}`}
                            className={`warning-card border-2 rounded-lg overflow-hidden transition-all ${severityColor}`}
                        >
                            {/* Card Header */}
                            <button
                                onClick={() => toggleExpanded(warning.type)}
                                className="w-full p-4 text-left hover:bg-opacity-50 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3 flex-1">
                                        <span className="text-2xl" role="img">
                                            {getWarningIcon(warning.type)}
                                        </span>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-semibold">{warning.message}</h3>
                                                <span className="text-sm">
                                                    {getSeverityIcon(warning.severity)}
                                                </span>
                                            </div>
                                            <p className="text-sm mt-1 opacity-80">{warning.detail}</p>
                                        </div>
                                    </div>
                                    <span className="text-xl ml-2">
                                        {isExpanded ? '▼' : '▶'}
                                    </span>
                                </div>
                            </button>

                            {/* Card Body (Expanded) */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-current border-opacity-20">
                                    {/* Metrics */}
                                    {warning.type === 'HEALTH_SCORE_DECLINE' && (
                                        <div className="grid grid-cols-3 gap-4 mt-3">
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Current</div>
                                                <div className="text-xl font-bold">{warning.currentScore}</div>
                                            </div>
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Previous</div>
                                                <div className="text-xl font-bold">{warning.previousScore}</div>
                                            </div>
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Drop</div>
                                                <div className="text-xl font-bold">{warning.totalDrop}</div>
                                            </div>
                                        </div>
                                    )}

                                    {warning.type === 'SLEEP_DEBT' && (
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Avg Sleep</div>
                                                <div className="text-xl font-bold">{warning.avgSleep}h</div>
                                            </div>
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Total Deficit</div>
                                                <div className="text-xl font-bold">{warning.totalDeficit}h</div>
                                            </div>
                                        </div>
                                    )}

                                    {warning.type === 'CALORIC_DEBT' && (
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Avg Eaten</div>
                                                <div className="text-xl font-bold">{warning.avgEaten} kcal</div>
                                            </div>
                                            <div className="text-center p-3 bg-white bg-opacity-50 rounded">
                                                <div className="text-sm opacity-70">Total Debt</div>
                                                <div className="text-xl font-bold">{warning.totalDebt} kcal</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action */}
                                    {warning.actionable && (
                                        <div className="mt-3 p-3 bg-white bg-opacity-70 rounded">
                                            <div className="text-sm font-medium mb-1">💡 Recommended Action:</div>
                                            <p className="text-sm">{warning.action}</p>
                                            {onActionClick && (
                                                <button
                                                    onClick={() => onActionClick(warning)}
                                                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                                >
                                                    Take Action
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Refresh Button */}
            <button
                onClick={detectWarnings}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
            >
                🔄 Refresh Analysis
            </button>
        </div>
    );
};

export default EarlyWarningDashboard;
