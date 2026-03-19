// heys_day_rating_averages_v1.js — auto-update day averages effect

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useRatingAveragesEffect(params) {
        const { React, day, setDay, calculateDayAverages } = params || {};
        if (!React) return;

        React.useEffect(() => {
            const averages = calculateDayAverages(day.meals, day.trainings, day);

            // Не перезаписываем dayScore если есть ручной override (dayScoreManual)
            const shouldUpdateDayScore = !day.dayScoreManual && averages.dayScore !== day.dayScore;
            const shouldUpdateRaw = averages.dayScoreRaw !== '' && averages.dayScoreRaw !== day.dayScoreRaw;

            if (averages.moodAvg !== day.moodAvg || averages.wellbeingAvg !== day.wellbeingAvg ||
                averages.stressAvg !== day.stressAvg || shouldUpdateDayScore || shouldUpdateRaw) {
                setDay(prevDay => ({
                    ...prevDay,
                    moodAvg: averages.moodAvg,
                    wellbeingAvg: averages.wellbeingAvg,
                    stressAvg: averages.stressAvg,
                    // Обновляем dayScore только если нет ручного override
                    ...(shouldUpdateDayScore ? { dayScore: averages.dayScore } : {}),
                    // dayScoreRaw — derived float, для analytics/predictive layers (не cloud-persisted отдельно)
                    ...(shouldUpdateRaw ? { dayScoreRaw: averages.dayScoreRaw } : {}),
                    updatedAt: Date.now()
                }));
            }
        }, [
            day.meals?.map(m => `${m.mood}-${m.wellbeing}-${m.stress}`).join('|'),
            day.trainings?.map(t => `${t.mood}-${t.wellbeing}-${t.stress}`).join('|'),
            day.moodMorning, day.wellbeingMorning, day.stressMorning,
            day.dayScoreManual
        ]);
    }

    HEYS.dayRatingAverages = {
        useRatingAveragesEffect
    };
})(window);
