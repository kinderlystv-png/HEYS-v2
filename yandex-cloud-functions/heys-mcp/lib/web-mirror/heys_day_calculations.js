// heys_day_calculations.js — Helper functions for calculations and data processing
// Phase 11 of HEYS Day v12 refactoring
// Extracted calculation and utility functions
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Dependencies - use HEYS.dayUtils if available (optional for this module)
    const U = HEYS.dayUtils || {};
    const M = HEYS.models || {};
    const r0 = (n) => Math.round(n) || 0;
    const r1 = (n) => Math.round(n * 10) / 10;

    /**
     * Calculate day totals from meals
     * @param {Object} day - Day data
     * @param {Object} pIndex - Product index
     * @returns {Object} Day totals
     */
    function calculateDayTotals(day, pIndex) {
        const t = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
        (day.meals || []).forEach(m => {
            const mt = M.mealTotals ? M.mealTotals(m, pIndex) : {};
            Object.keys(t).forEach(k => {
                t[k] += mt[k] || 0;
            });
        });
        Object.keys(t).forEach(k => t[k] = r0(t[k]));

        // Взвешенные средние: вредность — по граммам, ГИ — по углеводам.
        let gSum = 0, harmSum = 0, carbSum = 0, giCarbSum = 0;
        (day.meals || []).forEach(m => {
            (m.items || []).forEach(it => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
                gSum += g;
                if (harm != null) harmSum += harm * g;
                // Взвешивание ГИ по углеводам — та же схема, что в модели волн
                // (heys_iw_response_model.js: weightedGi / knownGiCarbs).
                const carbsG = (+(p.carbs100 ?? p.carbs ?? 0) || 0) * g / 100;
                const giNum = +gi;
                if (carbsG > 0 && Number.isFinite(giNum) && giNum >= 0 && giNum <= 100) {
                    carbSum += carbsG;
                    giCarbSum += giNum * carbsG;
                }
            });
        });
        // ГИ взвешен по углеводам (сахарная нагрузка), вредность — по граммам.
        t.gi = carbSum ? giCarbSum / carbSum : 0;
        t.harm = gSum ? harmSum / gSum : 0;

        return t;
    }

    /**
     * Get product from item (helper function)
     *
     * pIndex — это { byId: Map, byName: Map, byFingerprint: Map }
     * (heys_models_v1.js buildProductIndex), а не плоский объект. Прямое
     * обращение pIndex[productId] всегда давало undefined, поэтому дневные
     * ГИ и вредность годами считались нулевыми. Резолвер один — модельный,
     * тот же, что использует mealTotals.
     */
    function getProductFromItem(item, pIndex) {
        if (!item || !pIndex) return null;
        const models = HEYS.models || M;
        if (typeof models.getProductFromItem === 'function') {
            return models.getProductFromItem(item, pIndex) || null;
        }
        const productId = String(item.product_id || item.id || '').toLowerCase();
        return pIndex.byId?.get?.(productId) || null;
    }

    // Порог вредности дня — константа дизайна, не персонализируется
    // (контракт nutrition-tab, строка «вредность»). Профильный harmPct
    // остаётся входом советов и на экран не выводится.
    const HARM_THRESHOLD = 5;

    const PROTEIN_KCAL_PER_G = () => (HEYS.TEF?.ATWATER?.protein || 3);
    const CARB_KCAL_PER_G = () => (HEYS.TEF?.ATWATER?.carbs || 4);
    const FAT_KCAL_PER_G = () => (HEYS.TEF?.ATWATER?.fat || 9);
    const PROTEIN_ABSOLUTE_FLOOR_G_PER_KG = 1.2;
    const PROTEIN_CAP_G_PER_KG = 2.4;
    const FAT_FLOOR_G_PER_KG = 0.8;
    const TRAINING_BONUS_G_PER_KG = 0.2;
    const TRAINING_KCAL_THRESHOLD = 150;

    function isFemaleProfile(profile) {
        return (profile && profile.gender === 'Женский') || (profile && profile.sex === 'female');
    }

    function resolveNormField(normPerc, profile, key, fallback) {
        const raw = normPerc[key] ?? profile[key];
        if (raw === undefined || raw === null || raw === '') return fallback;
        const num = Number(raw);
        return Number.isFinite(num) ? num : fallback;
    }

    function resolveNormPerc(profile = {}, normPerc = {}) {
        return {
            carbsPct: resolveNormField(normPerc, profile, 'carbsPct', 45),
            proteinPct: resolveNormField(normPerc, profile, 'proteinPct', 25),
            simpleCarbPct: resolveNormField(normPerc, profile, 'simpleCarbPct', 30),
            badFatPct: resolveNormField(normPerc, profile, 'badFatPct', 30),
            superbadFatPct: resolveNormField(normPerc, profile, 'superbadFatPct', 5),
            fiberPct: resolveNormField(normPerc, profile, 'fiberPct', 14),
            giPct: resolveNormField(normPerc, profile, 'giPct', 55),
            harmPct: resolveNormField(normPerc, profile, 'harmPct', 40)
        };
    }

    function resolveProteinMode(weight, weightGoal) {
        const w = Number(weight);
        const goal = Number(weightGoal);
        if (!Number.isFinite(w)) return 'maintenance';
        // weightGoal 0 / пустой = «не задан» в UI куратора → поддержка, не дефицит
        if (weightGoal == null || weightGoal === '' || !Number.isFinite(goal) || goal <= 0) return 'maintenance';
        const delta = goal - w;
        if (Math.abs(delta) <= 2) return 'maintenance';
        if (delta < -2) return 'deficit';
        return 'gain';
    }

    function defaultProteinCoeffGPerKg(mode, female) {
        const table = {
            deficit: female ? 1.6 : 1.8,
            maintenance: female ? 1.4 : 1.6,
            gain: female ? 1.6 : 1.8
        };
        return table[mode] || table.maintenance;
    }

    function computeDailyNormsLegacy(optimum, normPerc = {}) {
        const K = +optimum || 0;
        const carbPct = +normPerc.carbsPct || 0;
        const protPct = +normPerc.proteinPct || 0;
        const fatPct = Math.max(0, 100 - carbPct - protPct);
        const carbs = K ? (K * carbPct / 100) / CARB_KCAL_PER_G() : 0;
        const prot = K ? (K * protPct / 100) / PROTEIN_KCAL_PER_G() : 0;
        const fat = K ? (K * fatPct / 100) / FAT_KCAL_PER_G() : 0;
        const simplePct = +normPerc.simpleCarbPct || 0;
        const simple = carbs * simplePct / 100;
        const complex = Math.max(0, carbs - simple);
        const badPct = +normPerc.badFatPct || 0;
        const transPct = +normPerc.superbadFatPct || 0;
        const bad = fat * badPct / 100;
        const trans = fat * transPct / 100;
        const good = Math.max(0, fat - bad - trans);
        const fiberPct = +normPerc.fiberPct || 0;
        const fiber = K ? (K / 1000) * fiberPct : 0;
        const gi = +normPerc.giPct || 0;
        const harm = +normPerc.harmPct || 0;
        return { kcal: K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm };
    }

    function buildMacroSubnorms(K, carbs, fat, normPerc) {
        const simplePct = +normPerc.simpleCarbPct || 0;
        const simple = carbs * simplePct / 100;
        const complex = Math.max(0, carbs - simple);
        const badPct = +normPerc.badFatPct || 0;
        const transPct = +normPerc.superbadFatPct || 0;
        const bad = fat * badPct / 100;
        const trans = fat * transPct / 100;
        const good = Math.max(0, fat - bad - trans);
        const fiberPct = +normPerc.fiberPct || 0;
        const fiber = K ? (K / 1000) * fiberPct : 0;
        const gi = +normPerc.giPct || 0;
        const harm = +normPerc.harmPct || 0;
        return { simple, complex, bad, good, trans, fiber, gi, harm };
    }

    /**
     * Единый расчёт норм дня (heys/798770): белок от массы, У/Ж от остатка displayOptimum
     * @param {Object} params
     * @returns {{ normAbs: Object, warnings: string[], proteinMeta: Object }}
     */
    function computeDisplayNorms(params = {}) {
        const lsGet = params.lsGet || HEYS.utils?.lsGet;
        const profile = params.profile || (lsGet ? lsGet('heys_profile', {}) : {}) || {};
        const day = params.day || {};
        const rawNormPerc = params.normPerc != null
            ? params.normPerc
            : (lsGet ? lsGet('heys_norms', {}) : {}) || {};
        const normPerc = resolveNormPerc(profile, rawNormPerc);
        const displayOptimum = +params.displayOptimum || 0;
        const K = displayOptimum;

        if (params.useLegacyProteinPct === true) {
            return {
                normAbs: computeDailyNormsLegacy(K, normPerc),
                warnings: [],
                proteinMeta: { legacy: true }
            };
        }

        let tdeeResult = params.tdeeResult;
        if (!tdeeResult && HEYS.TDEE && typeof HEYS.TDEE.calculate === 'function') {
            try {
                tdeeResult = HEYS.TDEE.calculate(day, profile, { lsGet, anchorDate: day.date, profile }) || {};
            } catch (_) {
                tdeeResult = {};
            }
        }
        tdeeResult = tdeeResult || {};

        const warnings = [];
        const weight = +day.weightMorning || +profile.weight || +profile.baseWeight || 70;
        const female = isFemaleProfile(profile);
        const mode = resolveProteinMode(weight, profile.weightGoal);
        const coeff = defaultProteinCoeffGPerKg(mode, female);
        const trainingBonus = (+tdeeResult.trainingsKcal || 0) >= TRAINING_KCAL_THRESHOLD
            ? TRAINING_BONUS_G_PER_KG : 0;
        const protTargetG = Math.min(PROTEIN_CAP_G_PER_KG * weight, (coeff + trainingBonus) * weight);
        const protAbsoluteFloorG = PROTEIN_ABSOLUTE_FLOOR_G_PER_KG * weight;
        const fatFloorG = FAT_FLOOR_G_PER_KG * weight;

        let protG = protTargetG;
        let fatG = fatFloorG;
        let kcalRem = K - protG * PROTEIN_KCAL_PER_G() - fatFloorG * FAT_KCAL_PER_G();

        if (kcalRem < 0) {
            const maxProtG = Math.max(
                protAbsoluteFloorG,
                (K - fatFloorG * FAT_KCAL_PER_G()) / PROTEIN_KCAL_PER_G()
            );
            protG = Math.min(protTargetG, maxProtG);
            if (protG < protTargetG - 0.5) warnings.push('proteinReducedToFloor');
            kcalRem = K - protG * PROTEIN_KCAL_PER_G() - fatFloorG * FAT_KCAL_PER_G();
        }

        if (kcalRem < 0) {
            warnings.push('deficitTooDeepForMacros');
            protG = protAbsoluteFloorG;
            fatG = fatFloorG;
            kcalRem = Math.max(0, K - protG * PROTEIN_KCAL_PER_G() - fatG * FAT_KCAL_PER_G());
        }

        const carbPct = +normPerc.carbsPct || 0;
        const protPctLegacy = +normPerc.proteinPct || 0;
        const fatPctLegacy = Math.max(0, 100 - carbPct - protPctLegacy);
        const denom = carbPct + fatPctLegacy;
        const carbShare = denom > 0 ? carbPct / denom : 0.5;

        const carbKcal = kcalRem * carbShare;
        const fatExtraKcal = Math.max(0, kcalRem - carbKcal);
        const carbs = carbKcal / CARB_KCAL_PER_G();
        const fat = fatG + fatExtraKcal / FAT_KCAL_PER_G();

        const sub = buildMacroSubnorms(K, carbs, fat, normPerc);
        const normAbs = {
            kcal: K,
            carbs,
            prot: r0(protG),
            fat: r0(fat),
            ...sub
        };

        const proteinMeta = {
            mode,
            coeffGPerKg: coeff,
            trainingBonusGPerKg: trainingBonus,
            weightKg: weight,
            targetGPerKg: coeff + trainingBonus,
            absoluteFloorGPerKg: PROTEIN_ABSOLUTE_FLOOR_G_PER_KG,
            reason: coeff + trainingBonus + ' г/кг × ' + r0(weight) + ' кг'
                + (trainingBonus > 0 ? ' + тренировка' : '')
        };

        if (Array.isArray(tdeeResult.warnings)) {
            tdeeResult.warnings.forEach((w) => { if (warnings.indexOf(w) === -1) warnings.push(w); });
        }

        return { normAbs, warnings, proteinMeta };
    }

    /**
     * Compute daily norms from percentages (legacy wrapper → computeDisplayNorms)
     * @param {number} optimum - Target calories (displayOptimum)
     * @param {Object} normPerc - Norm percentages
     * @param {Object} [ctx] - { profile, day, tdeeResult, useLegacyProteinPct }
     * @returns {Object} Absolute norms
     */
    function computeDailyNorms(optimum, normPerc = {}, ctx = {}) {
        if (ctx && (ctx.profile || ctx.day || ctx.tdeeResult || ctx.useLegacyProteinPct)) {
            return computeDisplayNorms({
                displayOptimum: optimum,
                normPerc,
                profile: ctx.profile,
                day: ctx.day,
                tdeeResult: ctx.tdeeResult,
                useLegacyProteinPct: ctx.useLegacyProteinPct,
                lsGet: ctx.lsGet
            }).normAbs;
        }
        const lsGet = HEYS.utils?.lsGet;
        const profile = lsGet ? lsGet('heys_profile', {}) : {};
        return computeDisplayNorms({
            displayOptimum: optimum,
            normPerc,
            profile,
            lsGet
        }).normAbs;
    }

    /** Defaults must match ensureWorkoutLogShape (heys_day_trainings_v1.js). */
    const WB_DEF_SETS = 1;
    const WB_DEF_REPS = 10;

    /** Строка конструктора силовой: есть что синхронизировать (не только пустой шаблон). */
    function exerciseRowHasTrackableContent(e) {
        if (!e) return false;
        if (String(e.name || '').trim()) return true;
        const asInt = (v) => {
            if (v == null || v === '') return NaN;
            if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : NaN;
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : NaN;
        };
        const ap = e.approaches;
        if (Array.isArray(ap)) {
            if (ap.length > 1) return true;
            for (let i = 0; i < ap.length; i++) {
                const a = ap[i];
                if (a && String(a.weightKg || '').trim()) return true;
                const r = asInt(a && a.reps);
                if (Number.isFinite(r) && r !== WB_DEF_REPS) return true;
            }
        }
        if (typeof e.weightKg === 'number' && Number.isFinite(e.weightKg) && e.weightKg > 0) return true;
        if (String(e.weightKg || '').trim()) return true;
        if (String(e.note || '').trim()) return true;
        if ((+e.rpe || 0) > 0) return true;
        if ((+e.ssGroup || 0) > 0) return true;
        const sets = asInt(e.sets);
        const reps = asInt(e.reps);
        if (Number.isFinite(sets) && sets !== WB_DEF_SETS) return true;
        if (Number.isFinite(reps) && reps !== WB_DEF_REPS) return true;
        return false;
    }

    /** Минуты по зонам или заполненные упражнения в дневнике. */
    function workoutLogHasTrackableContent(wl) {
        if (!wl || typeof wl !== 'object') return false;
        if (Array.isArray(wl.zoneMinutes) && wl.zoneMinutes.some((m) => +m > 0)) return true;
        const ex = wl.exercises;
        if (Array.isArray(ex) && ex.length > 1) return true;
        if (Array.isArray(ex) && ex.some(exerciseRowHasTrackableContent)) return true;
        return false;
    }

    function dayHasTrackableWorkoutBuilder(day) {
        const tr = day && day.trainings;
        if (!Array.isArray(tr)) return false;
        return tr.some((t) => {
            if (!t || String(t.type) !== 'strength' || t.strengthEntryMode !== 'workout_builder') return false;
            return workoutLogHasTrackableContent(t.workoutLog);
        });
    }

    /**
     * Calculate day averages (mood, wellbeing, stress, dayScore)
     * @param {Array} meals - Meals array
     * @param {Array} trainings - Trainings array
     * @param {Object} dayData - Day data with morning scores
     * @returns {Object} Averages
     */
    function calculateDayAverages(meals, trainings, dayData) {
        // Утренние оценки из чек-ина (если есть — это стартовая точка дня)
        const morningMood = dayData?.moodMorning && !isNaN(+dayData.moodMorning) ? [+dayData.moodMorning] : [];
        const morningWellbeing = dayData?.wellbeingMorning && !isNaN(+dayData.wellbeingMorning) ? [+dayData.wellbeingMorning] : [];
        const morningStress = dayData?.stressMorning && !isNaN(+dayData.stressMorning) ? [+dayData.stressMorning] : [];

        // Собираем все оценки из приёмов пищи
        const mealMoods = (meals || []).filter(m => m.mood && !isNaN(+m.mood)).map(m => +m.mood);
        const mealWellbeing = (meals || []).filter(m => m.wellbeing && !isNaN(+m.wellbeing)).map(m => +m.wellbeing);
        const mealStress = (meals || []).filter(m => m.stress && !isNaN(+m.stress)).map(m => +m.stress);

        // Собираем оценки из тренировок (фильтруем только РЕАЛЬНЫЕ тренировки)
        const realTrainings = (trainings || []).filter(t => {
            const hasTime = t.time && t.time.trim() !== '';
            const hasMinutes = t.z && Array.isArray(t.z) && t.z.some(m => m > 0);
            const hasBuilder =
                t.type === 'strength' &&
                t.strengthEntryMode === 'workout_builder' &&
                t.workoutLog &&
                workoutLogHasTrackableContent(t.workoutLog);
            return hasTime || hasMinutes || hasBuilder;
        });
        const trainingMoods = realTrainings.filter(t => t.mood && !isNaN(+t.mood)).map(t => +t.mood);
        const trainingWellbeing = realTrainings.filter(t => t.wellbeing && !isNaN(+t.wellbeing)).map(t => +t.wellbeing);
        const trainingStress = realTrainings.filter(t => t.stress && !isNaN(+t.stress)).map(t => +t.stress);

        // Объединяем все оценки: утро + приёмы пищи + тренировки
        const allMoods = [...morningMood, ...mealMoods, ...trainingMoods];
        const allWellbeing = [...morningWellbeing, ...mealWellbeing, ...trainingWellbeing];
        const allStress = [...morningStress, ...mealStress, ...trainingStress];

        const moodAvg = allMoods.length ? r1(allMoods.reduce((sum, val) => sum + val, 0) / allMoods.length) : '';
        const wellbeingAvg = allWellbeing.length ? r1(allWellbeing.reduce((sum, val) => sum + val, 0) / allWellbeing.length) : '';
        const stressAvg = allStress.length ? r1(allStress.reduce((sum, val) => sum + val, 0) / allStress.length) : '';

        // Автоматический расчёт dayScore
        // Формула: (mood + wellbeing + (10 - stress)) / 3
        // dayScore — integer для UI/storage, dayScoreRaw — float .1 для analytics/predictive layers
        // (relapse_risk_v1.js предпочитает raw при наличии, fallback integer)
        let dayScore = '';
        let dayScoreRaw = '';
        if (moodAvg !== '' || wellbeingAvg !== '' || stressAvg !== '') {
            const m = moodAvg !== '' ? +moodAvg : 5;
            const w = wellbeingAvg !== '' ? +wellbeingAvg : 5;
            const s = stressAvg !== '' ? +stressAvg : 5;
            // stress инвертируем: низкий стресс = хорошо
            const raw = (m + w + (10 - s)) / 3;
            dayScoreRaw = r1(raw);
            dayScore = Math.round(raw);
        }

        return { moodAvg, wellbeingAvg, stressAvg, dayScore, dayScoreRaw };
    }

    /**
     * Пересчитывает moodAvg/wellbeingAvg/stressAvg/dayScore/dayScoreRaw и
     * записывает их прямо в переданный объект дня.
     *
     * Нужна писателям вне вкладки дня. React-эффект
     * heys_day_rating_averages_v1.js пересчитывает средние только пока
     * смонтирован DayTab (apps/web/heys_day_tab_impl_v1.js:778-786) — а шаг
     * морнинг-чек-ина, синхронизация утренней активации (heys_steps_v1.js) и
     * запись тренировки (heys_training_step_v1.js) пишут `moodMorning` /
     * `trainings[].mood` напрямую в storage, минуя эффект. Без этого вызова
     * средние по дню протухают до следующего открытия вкладки.
     *
     * @param {Object} dayData - день; мутируется и возвращается для удобства.
     */
    function applyDayAverages(dayData) {
        if (!dayData) return dayData;
        const averages = calculateDayAverages(dayData.meals, dayData.trainings, dayData);
        dayData.moodAvg = averages.moodAvg;
        dayData.wellbeingAvg = averages.wellbeingAvg;
        dayData.stressAvg = averages.stressAvg;
        if (!dayData.dayScoreManual) {
            dayData.dayScore = averages.dayScore;
        }
        if (averages.dayScoreRaw !== '') {
            dayData.dayScoreRaw = averages.dayScoreRaw;
        }
        return dayData;
    }

    /**
     * Normalize trainings data (migrate quality/feelAfter to mood/wellbeing)
     * @param {Array} trainings - Trainings array
     * @returns {Array} Normalized trainings
     */
    function normalizeTrainings(trainings = []) {
        return trainings.map((t = {}) => {
            let next = t;
            if (t.quality !== undefined || t.feelAfter !== undefined) {
                const { quality, feelAfter, ...rest } = t;
                next = {
                    ...rest,
                    mood: rest.mood ?? quality ?? 5,
                    wellbeing: rest.wellbeing ?? feelAfter ?? 5,
                    stress: rest.stress ?? 5
                };
            }
            if (
                next.workoutLog &&
                typeof next.workoutLog === 'object' &&
                next.strengthEntryMode === 'workout_builder' &&
                String(next.type) !== 'strength'
            ) {
                next = { ...next, type: 'strength' };
            }
            if (
                next.workoutLog &&
                typeof next.workoutLog === 'object' &&
                Array.isArray(next.workoutLog.exercises) &&
                next.workoutLog.exercises.length > 0 &&
                !next.strengthEntryMode
            ) {
                next = { ...next, type: 'strength', strengthEntryMode: 'workout_builder' };
            }
            if (
                next.type === 'strength' &&
                next.strengthEntryMode === 'workout_builder' &&
                next.workoutLog &&
                typeof next.workoutLog === 'object' &&
                (!next.z || !Array.isArray(next.z) || !next.z.some((x) => +x > 0))
            ) {
                const wl = next.workoutLog;
                if (Array.isArray(wl.zoneMinutes) && wl.zoneMinutes.length >= 4 && wl.zoneMinutes.some((x) => +x > 0)) {
                    const z = [0, 1, 2, 3].map((i) =>
                        Math.max(0, Math.min(180, Math.round(Number(wl.zoneMinutes[i]) || 0)))
                    );
                    next = { ...next, z };
                } else if (typeof wl.totalDurationMinutes === 'number' && wl.totalDurationMinutes >= 1) {
                    const m = Math.max(1, Math.min(180, Math.round(wl.totalDurationMinutes)));
                    next = { ...next, z: [0, m, 0, 0] };
                }
            }
            return next;
        });
    }

    /**
     * Clean empty trainings (all zones = 0)
     * @param {Array} trainings - Trainings array
     * @returns {Array} Filtered trainings
     */
    function cleanEmptyTrainings(trainings) {
        if (!Array.isArray(trainings)) return [];
        return trainings.filter((t) => {
            if (!t) return false;
            if (t.z && Array.isArray(t.z) && t.z.some((z) => +z > 0)) return true;
            if (t.type === 'strength' && t.strengthEntryMode === 'workout_builder' && t.workoutLog) {
                const wl = t.workoutLog;
                if (workoutLogHasTrackableContent(wl)) return true;
                if (Array.isArray(wl.exercises) && wl.exercises.length >= 1) return true;
            }
            return false;
        });
    }

    /**
     * Sort meals by time (latest first)
     * @param {Array} meals - Meals array
     * @returns {Array} Sorted meals
     */
    function sortMealsByTime(meals) {
        if (!meals || meals.length <= 1) return meals;

        return [...meals].sort((a, b) => {
            const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
            const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;

            // Если оба без времени — сохраняем порядок
            if (timeA === null && timeB === null) return 0;
            // Без времени — в конец
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            // Обратный порядок: последние наверху
            return timeB - timeA;
        });
    }

    /**
     * Parse time string to minutes
     * @param {string} timeStr - Time string (HH:MM)
     * @returns {number} Minutes since midnight
     */
    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    /**
     * Format time from minutes
     * @param {number} minutes - Minutes since midnight
     * @returns {string} Time string (HH:MM)
     */
    function formatMinutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Export module
    HEYS.dayCalculations = {
        HARM_THRESHOLD,
        calculateDayTotals,
        computeDailyNorms,
        computeDisplayNorms,
        computeDailyNormsLegacy,
        calculateDayAverages,
        applyDayAverages,
        normalizeTrainings,
        cleanEmptyTrainings,
        sortMealsByTime,
        parseTimeToMinutes,
        formatMinutesToTime,
        getProductFromItem,
        exerciseRowHasTrackableContent,
        workoutLogHasTrackableContent,
        dayHasTrackableWorkoutBuilder
    };

})(window);

