// heys_day_mood_sparkline_v1.js — mood sparkline data hook

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useMoodSparklineData(params) {
        const { React, day } = params || {};
        if (!React) return [];

        return React.useMemo(() => {
            const points = [];
            const parseTime = (t) => {
                if (!t) return 0;
                const [h, m] = t.split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            };

            // Утренняя оценка из чек-ина (стартовая точка дня)
            if (day?.moodMorning || day?.wellbeingMorning || day?.stressMorning) {
                const mood = +day.moodMorning || 0;
                const wellbeing = +day.wellbeingMorning || 0;
                const stress = +day.stressMorning || 0;
                if (mood || wellbeing || stress) {
                    const m = mood || 5;
                    const w = wellbeing || 5;
                    const s = stress || 5;
                    const score = (m + w + (10 - s)) / 3;
                    // Время утренней оценки: берём из sleepEnd или 7:00 по умолчанию
                    const morningTime = parseTime(day.sleepEnd) || parseTime('07:00');
                    points.push({
                        time: morningTime,
                        score: Math.round(score * 10) / 10,
                        type: 'morning',
                        name: 'Утро',
                        mood,
                        wellbeing,
                        stress,
                        icon: '🌅'
                    });
                }
            }

            // Собираем точки из приёмов пищи
            (day?.meals || []).forEach((meal, idx) => {
                const mood = +meal.mood || 0;
                const wellbeing = +meal.wellbeing || 0;
                const stress = +meal.stress || 0;
                // Нужна хотя бы одна оценка
                if (!mood && !wellbeing && !stress) return;
                const time = parseTime(meal.time);
                if (!time) return;
                // Комбинированная оценка: (mood + wellbeing + (10 - stress)) / 3
                // Если какой-то параметр отсутствует, используем нейтральное 5
                const m = mood || 5;
                const w = wellbeing || 5;
                const s = stress || 5;
                const score = (m + w + (10 - s)) / 3;
                points.push({
                    time,
                    score: Math.round(score * 10) / 10,
                    type: 'meal',
                    name: meal.name || 'Приём ' + (idx + 1),
                    mood,
                    wellbeing,
                    stress,
                    icon: '🍽️'
                });
            });

            // Собираем точки из тренировок
            (day?.trainings || []).forEach((tr, idx) => {
                const mood = +tr.mood || 0;
                const wellbeing = +tr.wellbeing || 0;
                const stress = +tr.stress || 0;
                if (!mood && !wellbeing && !stress) return;
                const time = parseTime(tr.time);
                if (!time) return;
                const m = mood || 5;
                const w = wellbeing || 5;
                const s = stress || 5;
                const score = (m + w + (10 - s)) / 3;
                const typeIcons = { cardio: '🏃', strength: '🏋️', hobby: '⚽' };
                points.push({
                    time,
                    score: Math.round(score * 10) / 10,
                    type: 'training',
                    name: tr.type === 'cardio' ? 'Кардио' : tr.type === 'strength' ? 'Силовая' : 'Хобби',
                    mood,
                    wellbeing,
                    stress,
                    icon: typeIcons[tr.type] || '🏃'
                });
            });

            // Сортируем по времени
            points.sort((a, b) => a.time - b.time);

            return points;
        }, [
            day?.moodMorning,
            day?.wellbeingMorning,
            day?.stressMorning,
            day?.sleepEnd,
            day?.meals?.map(m => `${m.time}-${m.mood}-${m.wellbeing}-${m.stress}`).join('|'),
            day?.trainings?.map(t => `${t.time}-${t.mood}-${t.wellbeing}-${t.stress}`).join('|')
        ]);
    }

    HEYS.dayMoodSparkline = {
        useMoodSparklineData
    };
})(window);
