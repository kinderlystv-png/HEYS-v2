/**
 * Early Warning Badge Component
 * 
 * Displays a warning badge in the header when negative trends are detected.
 * Clicking the badge opens the Early Warning Dashboard.
 */

import React, { useEffect, useState } from 'react';

interface Warning {
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    detail: string;
    action: string;
}

interface EarlyWarningResult {
    available: boolean;
    count: number;
    warnings: Warning[];
    highSeverityCount: number;
    mediumSeverityCount: number;
}

interface EarlyWarningBadgeProps {
    clientId: string;
    onClick?: () => void;
}

export const EarlyWarningBadge: React.FC<EarlyWarningBadgeProps> = ({ clientId, onClick }) => {
    const [warnings, setWarnings] = useState<EarlyWarningResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        detectWarnings();
    }, [clientId]);

    const detectWarnings = async () => {
        try {
            setLoading(true);

            // Get HEYS global object
            const HEYS = (window as any).HEYS;
            if (!HEYS?.InsightsPI?.earlyWarning) {
                console.warn('[EarlyWarningBadge] InsightsPI.earlyWarning not available');
                return;
            }

            // Get days, profile, pIndex from HEYS state
            const days = HEYS.daysByDate ? Object.values(HEYS.daysByDate) : [];
            const profile = HEYS.profile || {};
            const pIndex = HEYS.products || { byId: new Map() };

            // Detect warnings
            const result = HEYS.InsightsPI.earlyWarning.detect(days, profile, pIndex);
            console.log('[EarlyWarningBadge] Detection result:', result);

            setWarnings(result);
        } catch (error) {
            console.error('[EarlyWarningBadge] Error detecting warnings:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return null; // Don't show while loading
    }

    if (!warnings || !warnings.available || warnings.count === 0) {
        return null; // No warnings - don't show badge
    }

    const { count, highSeverityCount, mediumSeverityCount } = warnings;
    const hasHighSeverity = highSeverityCount > 0;

    return (
        <button
            onClick={onClick}
            className={`
        early-warning-badge
        ${hasHighSeverity ? 'early-warning-badge--high' : 'early-warning-badge--medium'}
        flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
        transition-all duration-200 hover:scale-105 hover:shadow-lg
        ${hasHighSeverity
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}
      `}
            title={`⚠️ ${count} Warning Signal${count > 1 ? 's' : ''} Detected`}
        >
            <span className="text-lg" role="img" aria-label="warning">
                {hasHighSeverity ? '🔴' : '⚠️'}
            </span>
            <span className="font-semibold">{count}</span>
            <span className="hidden sm:inline">Warning{count > 1 ? 's' : ''}</span>
        </button>
    );
};

export default EarlyWarningBadge;
