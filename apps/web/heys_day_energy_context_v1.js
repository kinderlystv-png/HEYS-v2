// heys_day_energy_context_v1.js — TDEE + energy context

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildEnergyContext(params) {
        const { day, prof, lsGet, pIndex, M, r0, HEYS: HEYSRef } = params || {};
        const ctx = HEYSRef || HEYS;

        const tdeeResult = ctx.TDEE?.calculate?.(day, prof, { lsGet, pIndex }) || {};
        const {
            bmr = 0,
            actTotal = 0,
            trainingsKcal: trainingsK = 0,
            train1k = 0,
            train2k = 0,
            train3k = 0,
            stepsKcal: stepsK = 0,
            householdKcal: householdK = 0,
            totalHouseholdMin = 0,
            ndteBoost: ndteBoostKcal = 0,
            ndteData = { active: false, tdeeBoost: 0 },
            tefKcal = 0,
            tefData = { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } },
            baseExpenditure = 0,
            tdee = 0,
            optimum = 0,
            weight = 70,
            mets = [2.5, 6, 8, 10],
            kcalMin = [0, 0, 0, 0],
            deficitPct: dayTargetDef = 0,
            cycleMultiplier: cycleKcalMultiplier = 1
        } = tdeeResult;

        const TR = (day?.trainings && Array.isArray(day.trainings)) ? day.trainings : [];
        const householdActivities = (day?.householdActivities && Array.isArray(day.householdActivities)) ? day.householdActivities : [];
        const z = mets;
        const trainK = (t) => (t.z || [0, 0, 0, 0]).reduce((s, min, i) => s + r0((+min || 0) * (kcalMin[i] || 0)), 0);
        const profileTargetDef = +(lsGet('heys_profile', {}).deficitPctTarget) || 0;

        const eatenKcal = (day?.meals || []).reduce((a, m) => {
            const t = (M?.mealTotals ? M.mealTotals(m, pIndex) : { kcal: 0 });
            return a + (t.kcal || 0);
        }, 0);
        const factDefPct = tdee ? r0(((eatenKcal - tdee) / tdee) * 100) : 0; // <0 значит дефицит

        if (window._HEYS_DEBUG_TDEE) {
            // console.group('HEYS_TDEE_DEBUG [DAY] Расчёт для', day.date);
            // console.log('HEYS_TDEE_DEBUG [DAY] Входные данные:');
            // console.log('HEYS_TDEE_DEBUG [DAY]   weightMorning:', day.weightMorning, '| профиль weight:', prof.weight, '| итог weight:', weight);
            // console.log('HEYS_TDEE_DEBUG [DAY]   steps:', day.steps, '| householdMin:', day.householdMin);
            // console.log('HEYS_TDEE_DEBUG [DAY]   trainings:', JSON.stringify(TR));
            // console.log('HEYS_TDEE_DEBUG [DAY]   HR zones (MET):', JSON.stringify(z));
            // console.log('HEYS_TDEE_DEBUG [DAY] Промежуточные расчёты:');
            // console.log('HEYS_TDEE_DEBUG [DAY]   BMR:', bmr);
            // console.log('HEYS_TDEE_DEBUG [DAY]   train1k:', train1k, '| train2k:', train2k);
            // console.log('HEYS_TDEE_DEBUG [DAY]   stepsK:', stepsK, '| householdK:', householdK);
            // console.log('HEYS_TDEE_DEBUG [DAY]   actTotal:', actTotal);
            // console.log('HEYS_TDEE_DEBUG [DAY] Итоговые значения:');
            // console.log('HEYS_TDEE_DEBUG [DAY]   tdee (Общие затраты):', tdee);
            // console.log('HEYS_TDEE_DEBUG [DAY]   eatenKcal (съедено):', r0(eatenKcal));
            // console.log('HEYS_TDEE_DEBUG [DAY]   optimum (нужно съесть):', optimum);
            // console.log('HEYS_TDEE_DEBUG [DAY]   factDefPct:', factDefPct + '%');
            // console.groupEnd();
        }

        return {
            tdeeResult,
            bmr,
            actTotal,
            trainingsK,
            train1k,
            train2k,
            train3k,
            stepsK,
            householdK,
            totalHouseholdMin,
            ndteBoostKcal,
            ndteData,
            tefKcal,
            tefData,
            baseExpenditure,
            tdee,
            optimum,
            weight,
            mets,
            kcalMin,
            dayTargetDef,
            cycleKcalMultiplier,
            TR,
            householdActivities,
            z,
            trainK,
            profileTargetDef,
            eatenKcal,
            factDefPct
        };
    }

    HEYS.dayEnergyContext = {
        buildEnergyContext
    };
})(window);
