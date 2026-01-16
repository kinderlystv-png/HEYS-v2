// heys_day_water_state.js — water goal + motivation + tooltip state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useWaterState(params) {
        const { React, day, prof, train1k, train2k, train3k, haptic } = params || {};
        const { useMemo, useState, useRef } = React || {};

        const safeDay = day || {};
        const safeProf = prof || {};

        const waterGoalBreakdown = useMemo(() => {
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

            const trainCount = [train1k, train2k, train3k].filter(k => k > 50).length;
            const trainBonus = trainCount * 500;

            const month = new Date().getMonth();
            const isHotSeason = month >= 5 && month <= 7;
            const seasonBonus = isHotSeason ? 300 : 0;
            const seasonNote = isHotSeason ? '☀️ Лето' : '';

            const cycleMultiplier = HEYS.Cycle?.getWaterMultiplier?.(safeDay.cycleDay) || 1;
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
        }, [safeDay.weightMorning, safeDay.steps, safeDay.cycleDay, train1k, train2k, train3k, safeProf.weight, safeProf.age, safeProf.sex]);

        const waterGoal = waterGoalBreakdown.finalGoal;

        const waterMotivation = useMemo(() => {
            const pct = ((safeDay.waterMl || 0) / waterGoal) * 100;
            if (pct >= 100) return { emoji: '🏆', text: 'Цель достигнута!' };
            if (pct >= 75) return { emoji: '🔥', text: 'Почти у цели!' };
            if (pct >= 50) return { emoji: '🎯', text: 'Половина пути!' };
            if (pct >= 25) return { emoji: '🌊', text: 'Хороший старт!' };
            return { emoji: '💧', text: 'Добавь воды' };
        }, [safeDay.waterMl, waterGoal]);

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

        const [showWaterTooltip, setShowWaterTooltip] = useState(false);
        const waterLongPressRef = useRef(null);

        function handleWaterRingDown() {
            waterLongPressRef.current = setTimeout(() => {
                setShowWaterTooltip(true);
                haptic && haptic('light');
            }, 400);
        }
        function handleWaterRingUp() {
            if (waterLongPressRef.current) {
                clearTimeout(waterLongPressRef.current);
                waterLongPressRef.current = null;
            }
        }
        function handleWaterRingLeave() {
            handleWaterRingUp();
            if (!('ontouchstart' in window)) {
                setShowWaterTooltip(false);
            }
        }

        return {
            waterGoalBreakdown,
            waterGoal,
            waterMotivation,
            waterLastDrink,
            showWaterTooltip,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave
        };
    }

    HEYS.dayWaterState = {
        useWaterState
    };
})(window);
