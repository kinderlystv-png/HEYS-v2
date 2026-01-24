// heys_day_engagement_effects.js — streak/lipolysis/achievement effects

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useEngagementEffects(params) {
        const {
            React,
            day,
            weekHeatmapData,
            showConfetti,
            setShowConfetti,
            haptic,
            insulinWaveData,
            mealsChartData,
            setShowFirstPerfectAchievement,
            setNewMealAnimatingIndex
        } = params || {};

        const streakConfettiShownRef = React.useRef(false);
        const prevQualityStreakRef = React.useRef(0);
        const lowScoreHapticRef = React.useRef(false);
        const prevInsulinStatusRef = React.useRef(null);
        const lipolysisRecordTriggeredRef = React.useRef(false);
        const prevMealsCountRef = React.useRef(0);
        const firstPerfectShownRef = React.useRef(false);

        // Confetti при streak 7+ дней
        React.useEffect(() => {
            if (weekHeatmapData?.streak >= 7 && !streakConfettiShownRef.current && !showConfetti) {
                streakConfettiShownRef.current = true;
                setShowConfetti(true);
                haptic('success');
                setTimeout(() => setShowConfetti(false), 3000);
            }
            if ((weekHeatmapData?.streak || 0) < 7) {
                streakConfettiShownRef.current = false;
            }
        }, [weekHeatmapData?.streak, showConfetti, setShowConfetti, haptic]);

        // Делаем данные волны доступными глобально для карточек приёмов
        React.useEffect(() => {
            try {
                const h = window.HEYS = window.HEYS || {};
                h.insulinWaveData = insulinWaveData || null;
            } catch (e) { }
        }, [insulinWaveData]);

        // Haptic при начале липолиза
        React.useEffect(() => {
            if (insulinWaveData?.status === 'lipolysis' && prevInsulinStatusRef.current !== 'lipolysis') {
                try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
            }
            prevInsulinStatusRef.current = insulinWaveData?.status || null;
        }, [insulinWaveData?.status]);

        // Confetti при новом рекорде липолиза
        React.useEffect(() => {
            if (insulinWaveData?.isNewRecord && !lipolysisRecordTriggeredRef.current) {
                lipolysisRecordTriggeredRef.current = true;

                if (typeof HEYS !== 'undefined' && HEYS.InsulinWave?.updateLipolysisRecord) {
                    const wasUpdated = HEYS.InsulinWave.updateLipolysisRecord(insulinWaveData.lipolysisMinutes);
                    if (wasUpdated) {
                        setShowConfetti(true);
                        try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
                        setTimeout(() => setShowConfetti(false), 3000);
                    }
                }
            }

            if (insulinWaveData?.status !== 'lipolysis') {
                lipolysisRecordTriggeredRef.current = false;
            }
        }, [insulinWaveData?.isNewRecord, insulinWaveData?.lipolysisMinutes, insulinWaveData?.status, setShowConfetti]);

        // Haptic feedback for streak / low scores
        React.useEffect(() => {
            const currentStreak = mealsChartData?.qualityStreak || 0;
            const prev = prevQualityStreakRef.current;
            if (currentStreak >= 3 && prev < 3) {
                try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
            }
            prevQualityStreakRef.current = currentStreak;
        }, [mealsChartData?.qualityStreak]);

        React.useEffect(() => {
            const meals = mealsChartData?.meals || [];
            const hasLow = meals.some(m => m.quality && m.quality.score < 50);
            if (hasLow && !lowScoreHapticRef.current) {
                try { HEYS.dayUtils?.haptic?.('warning'); } catch (e) { }
                lowScoreHapticRef.current = true;
            }
            if (!hasLow) {
                lowScoreHapticRef.current = false;
            }
        }, [mealsChartData]);

        // Achievement: первый идеальный приём
        React.useEffect(() => {
            const meals = mealsChartData?.meals || [];
            const hasPerfect = meals.some(m => m.quality && m.quality.score >= 90);

            if (hasPerfect && !firstPerfectShownRef.current) {
                try {
                    const U = window.HEYS?.utils || {};
                    const store = window.HEYS?.store;
                    const alreadyAchieved = store?.get
                        ? store.get('heys_first_perfect_meal', null) === '1'
                        : (U.lsGet ? U.lsGet('heys_first_perfect_meal', null) === '1' : localStorage.getItem('heys_first_perfect_meal') === '1');
                    if (!alreadyAchieved) {
                        if (store?.set) store.set('heys_first_perfect_meal', '1');
                        else if (U.lsSet) U.lsSet('heys_first_perfect_meal', '1');
                        else localStorage.setItem('heys_first_perfect_meal', '1');
                        setShowFirstPerfectAchievement(true);
                        setShowConfetti(true);
                        try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
                        setTimeout(() => {
                            setShowFirstPerfectAchievement(false);
                            setShowConfetti(false);
                        }, 5000);
                        firstPerfectShownRef.current = true;
                    }
                } catch (e) { }
            }
        }, [mealsChartData, setShowConfetti, setShowFirstPerfectAchievement]);

        // Анимация нового приёма
        React.useEffect(() => {
            const mealsCount = day?.meals?.length || 0;
            const prevCount = prevMealsCountRef.current;

            if (mealsCount > prevCount && prevCount > 0) {
                setTimeout(() => {
                    setNewMealAnimatingIndex(mealsCount - 1);
                    setTimeout(() => setNewMealAnimatingIndex(-1), 600);
                }, 300);
            }

            prevMealsCountRef.current = mealsCount;
        }, [day?.meals?.length, setNewMealAnimatingIndex]);
    }

    HEYS.dayEngagementEffects = {
        useEngagementEffects
    };
})(window);
