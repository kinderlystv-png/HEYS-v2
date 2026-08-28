// heys_day_water_state.js — water goal + motivation + tooltip state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    // Норма воды считается здесь и только здесь. До 2026-08-09 её брали в
    // четырёх местах через три разных имени, ни одно из которых не было
    // определено: HEYS.utils.calculateWaterGoal, HEYS.Day.getWaterGoal,
    // HEYS.utils.getWaterGoal. Optional chaining глушил промах, и каждое место
    // молча падало в свой фолбэк — 2000 мл или «вес × 30». На одном экране
    // норма отличалась в полтора раза: карточка воды 2700, оценка дня 2000.

    // Карточка воды знает калории тренировок и считает значимой ту, что дала
    // больше 50 ккал. Снаружи калорий нет, поэтому значимость оценивается по
    // длительности: 20 минут при любой зоне дают больше 50 ккал.
    function countSignificantTrainings(day, trainingKcals) {
        if (Array.isArray(trainingKcals)) {
            return trainingKcals.filter((kcal) => (+kcal || 0) > 50).length;
        }
        const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
        return trainings.filter((training) => {
            const zones = Array.isArray(training?.z) ? training.z : [];
            const minutes = zones.reduce((sum, m) => sum + (+m || 0), 0);
            return minutes >= 20;
        }).length;
    }

    /** Калории трёх слотов тренировок — тот же TDEE, что и карточка «День». */
    function resolveTrainingKcals(day, profile, explicit) {
        if (explicit !== undefined && explicit !== null) return explicit;
        try {
            const tdee = HEYS.TDEE?.calculate?.(day || {}, profile || {}, {});
            if (tdee) {
                return [tdee.train1k || 0, tdee.train2k || 0, tdee.train3k || 0];
            }
        } catch (_error) { /* noop */ }
        return undefined;
    }

    function buildWaterGoalParams({ day, profile, trainingKcals } = {}) {
        return {
            day: day || {},
            profile: profile || {},
            trainingKcals: resolveTrainingKcals(day, profile, trainingKcals)
        };
    }

    function computeWaterGoalBreakdown(params) {
        const { day: safeDay, profile: safeProf, trainingKcals } = buildWaterGoalParams(params || {});

        const w = +safeDay.weightMorning || +safeProf.weight || 70;
        const age = +safeProf.age || 30;
        const isFemale = safeProf.sex === 'female';
        const coef = isFemale ? 28 : 30;

        const baseRaw = w * coef;

        let ageFactor = 1;
        let ageNote = '';
        if (age >= 60) { ageFactor = 0.9; ageNote = '−10% (60+)'; }
        else if (age >= 40) { ageFactor = 0.95; ageNote = '−5% (40+)'; }
        const base = baseRaw * ageFactor;

        const stepsCount = Math.floor((safeDay.steps || 0) / 5000);
        const stepsBonus = stepsCount * 250;

        const trainCount = countSignificantTrainings(safeDay, trainingKcals);
        const trainBonus = trainCount * 500;

        const month = new Date().getMonth();
        const isHotSeason = month >= 5 && month <= 7;
        const seasonBonus = isHotSeason ? 300 : 0;
        const seasonNote = isHotSeason ? '☀️ Лето' : '';

        const cycleEffectsEnabled = HEYS.healthFeatures?.shouldApplyCycleEffectsToDate
            ? HEYS.healthFeatures.shouldApplyCycleEffectsToDate(safeProf, safeDay.date)
            : true;
        const cycleCountDay = cycleEffectsEnabled
            ? (HEYS.Cycle?.resolveCycleCountDay?.({
                date: safeDay.date,
                cycleDay: safeDay.cycleDay,
                lsGet: HEYS.utils?.lsGet
            }) ?? null)
            : null;
        const cycleMultiplier = HEYS.Cycle?.getWaterMultiplier?.(cycleCountDay) || 1;
        const cycleBonus = cycleMultiplier > 1 ? Math.round(base * (cycleMultiplier - 1)) : 0;
        const cycleNote = cycleBonus > 0 ? '🌸 Особый период' : '';

        const total = Math.round((base + stepsBonus + trainBonus + seasonBonus + cycleBonus) / 100) * 100;
        const finalGoal = Math.max(1500, Math.min(5000, total));

        return {
            weight: w,
            coef,
            baseRaw: Math.round(baseRaw),
            ageFactor,
            ageNote,
            base: Math.round(base),
            stepsCount,
            stepsBonus,
            trainCount,
            trainBonus,
            seasonBonus,
            seasonNote,
            cycleBonus,
            cycleNote,
            total: Math.round(total),
            finalGoal
        };
    }

    function computeWaterGoal(params) {
        return computeWaterGoalBreakdown(params).finalGoal;
    }

    function useWaterState(params) {
        const { React, day, prof, train1k, train2k, train3k } = params || {};
        const { useMemo } = React || {};

        const safeDay = day || {};
        const safeProf = prof || {};

        const waterGoalBreakdown = useMemo(() => computeWaterGoalBreakdown(
            buildWaterGoalParams({
                day: safeDay,
                profile: safeProf,
                trainingKcals: [train1k, train2k, train3k]
            })
        ), [safeDay.weightMorning, safeDay.steps, safeDay.cycleDay, safeDay.trainings, train1k, train2k, train3k, safeProf.weight, safeProf.age, safeProf.sex]);

        const waterGoal = waterGoalBreakdown.finalGoal;

        const waterLastDrink = useMemo(() => {
            const lastTime = safeDay.lastWaterTime;
            if (!lastTime) return null;

            const now = Date.now();
            const diffMs = now - lastTime;
            const diffMin = Math.floor(diffMs / 60000);

            if (diffMin < 60) {
                return { minutes: diffMin, text: diffMin + ' мин назад', isLong: false };
            }

            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            const isLong = hours >= 2;
            const text = hours + 'ч' + (mins > 0 ? ' ' + mins + 'мин' : '') + ' назад';

            return { hours, minutes: mins, text, isLong };
        }, [safeDay.lastWaterTime]);

        return {
            waterGoalBreakdown,
            waterGoal,
            waterLastDrink
        };
    }

    HEYS.dayWaterState = {
        useWaterState,
        computeWaterGoal,
        computeWaterGoalBreakdown,
        buildWaterGoalParams,
        resolveTrainingKcals
    };
})(window);
