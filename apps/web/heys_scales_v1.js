// heys_scales_v1.js — единая точка цветовых шкал приложения
//
// Этап 3 UI v4: пороговые функции возвращают ступень; цвет классики берётся из
// централизованных таблиц веток (не из литералов в потребителях). Для будущих
// палитр — colorForStep(step) и resolve().step.

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    const STEPS = {
        GOOD_STRONG: 'good-strong',
        GOOD_SOFT: 'good-soft',
        NEUTRAL: 'neutral',
        WARN_SOFT: 'warn-soft',
        WARN_STRONG: 'warn-strong',
    };

    // v4 roles — янтарная лестница по смыслу (UI_V4_BARE_LITERALS_DECISION.md, ведро 2)
    const V4_WARN_SOFT = 'var(--v4-warn-soft, #c9922e)';
    const V4_WARN_1 = 'var(--v4-warn-1, #d99a63)';
    const v4MixRole = (role, pct) => `color-mix(in srgb, ${role} ${pct}%, transparent)`;

    const CLASSIC_STEP_COLOR = Object.freeze({
        [STEPS.GOOD_STRONG]: '#22c55e',
        [STEPS.GOOD_SOFT]: '#3b82f6',
        [STEPS.NEUTRAL]: V4_WARN_SOFT,
        [STEPS.WARN_SOFT]: '#ef4444',
        [STEPS.WARN_STRONG]: '#dc2626',
    });

    // Глубина внутри ступени «внимание»: сдержанная, средняя, плотная. Один
    // оттенок, различаются насыщенность и светлота — роль та же, вторая
    // цветовая система не заводится (решение владельца 2026-08-10). Нужна там,
    // где значение различает больше состояний, чем даёт контракт ступеней:
    // шкала вреда несёт вредный / очень вредный / супервредный внутри
    // warn-strong. Палитры держат эти же градации в --v4-warn-1/2/3.
    const DEPTH = Object.freeze({ SOFT: 1, MID: 2, DEEP: 3 });

    const CLASSIC_WARN_DEPTH_COLOR = Object.freeze({
        1: '#ef4444',
        2: '#dc2626',
        3: '#7f1d1d',
    });

    const C = Object.freeze({
        green: '#22c55e',
        greenDark: '#10b981',
        greenLight: '#84cc16',
        blue: '#3b82f6',
        yellow: V4_WARN_SOFT,
        orange: V4_WARN_1,
        red: '#ef4444',
        redDark: '#dc2626',
        gray: '#9ca3af',
        grayMuted: '#6b7280',
        purple: '#a855f7',
        greenHarm: '#16a34a',
        redHarm: '#7f1d1d',
        amberMacro: V4_WARN_1,
        slate: '#94a3b8',
    });

    function num(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function pack(step, color, extra) {
        const out = { step, color };
        if (extra) {
            for (const key in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
            }
        }
        return out;
    }

    function colorForStep(step, depth) {
        if (step === STEPS.WARN_STRONG && CLASSIC_WARN_DEPTH_COLOR[depth]) {
            return CLASSIC_WARN_DEPTH_COLOR[depth];
        }
        return CLASSIC_STEP_COLOR[step] || C.grayMuted;
    }

    function mixRgb(from, to, t) {
        const r = Math.round(from[0] + t * (to[0] - from[0]));
        const g = Math.round(from[1] + t * (to[1] - from[1]));
        const b = Math.round(from[2] + t * (to[2] - from[2]));
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    }

    const RED = [239, 68, 68];
    const YELLOW = [234, 179, 8];
    const GREEN = [34, 197, 94];

    function stepsProgress(percent) {
        const pct = Math.max(0, num(percent, 0));
        const color = pct < 30
            ? mixRgb(RED, YELLOW, pct / 30)
            : mixRgb(YELLOW, GREEN, (pct - 30) / 70);
        let step = STEPS.WARN_SOFT;
        if (pct >= 100) step = STEPS.GOOD_STRONG;
        else if (pct >= 70) step = STEPS.GOOD_SOFT;
        else if (pct >= 40) step = STEPS.NEUTRAL;
        return { color, step };
    }

    function stepsWidget(percent) {
        const pct = num(percent, 0);
        if (pct >= 100) return pack(STEPS.GOOD_STRONG, C.green);
        if (pct >= 70) return pack(STEPS.GOOD_SOFT, C.blue);
        if (pct >= 40) return pack(STEPS.NEUTRAL, C.yellow);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    function stepsGoal(goal) {
        const value = num(goal, 0);
        if (value >= 10000) return pack(STEPS.GOOD_STRONG, C.green);
        if (value < 7000) return pack(STEPS.NEUTRAL, C.yellow);
        return pack(STEPS.GOOD_SOFT, C.blue);
    }

    function deficit(value) {
        const v = num(value, 0);
        if (v < -10) return pack(STEPS.WARN_SOFT, C.red, { label: 'Агрессивный дефицит', emoji: '🔥🔥' });
        if (v < 0) return pack(STEPS.NEUTRAL, C.orange, { label: 'Умеренный дефицит', emoji: '🔥' });
        if (v === 0) return pack(STEPS.NEUTRAL, C.green, { label: 'Поддержание веса', emoji: '⚖️' });
        if (v <= 10) return pack(STEPS.NEUTRAL, C.blue, { label: 'Умеренный профицит', emoji: '💪' });
        return pack(STEPS.WARN_SOFT, C.blue, { label: 'Агрессивный набор', emoji: '💪💪' });
    }

    function wellbeing(value) {
        const v = num(value, 0);
        if (v <= 3) return pack(STEPS.WARN_STRONG, C.red);
        if (v <= 5) return pack(STEPS.NEUTRAL, C.blue);
        if (v <= 7) return pack(STEPS.GOOD_SOFT, C.green);
        return pack(STEPS.GOOD_STRONG, C.greenDark);
    }

    function stress(value) {
        const v = num(value, 0);
        if (v <= 3) return pack(STEPS.GOOD_STRONG, C.greenDark);
        if (v <= 5) return pack(STEPS.GOOD_SOFT, C.blue);
        if (v <= 7) return pack(STEPS.NEUTRAL, C.yellow);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    function trainingRating(value) {
        const v = num(value, 0);
        if (v <= 0) return pack(STEPS.NEUTRAL, C.gray);
        if (v <= 3) return pack(STEPS.WARN_STRONG, C.red);
        if (v <= 5) return pack(STEPS.NEUTRAL, C.yellow);
        if (v <= 7) return pack(STEPS.GOOD_SOFT, C.greenLight);
        return pack(STEPS.GOOD_STRONG, C.greenDark);
    }

    function moodRating(value) {
        const v = num(value, 0);
        if (v <= 2) return pack(STEPS.WARN_STRONG, C.red);
        if (v <= 4) return pack(STEPS.WARN_SOFT, C.orange);
        if (v <= 6) return pack(STEPS.NEUTRAL, C.yellow);
        if (v <= 8) return pack(STEPS.GOOD_SOFT, C.green);
        return pack(STEPS.GOOD_STRONG, C.greenDark);
    }

    function stressRating(value) {
        const v = num(value, 0);
        if (v <= 2) return pack(STEPS.GOOD_STRONG, C.greenDark);
        if (v <= 4) return pack(STEPS.GOOD_SOFT, C.green);
        if (v <= 6) return pack(STEPS.NEUTRAL, C.yellow);
        if (v <= 8) return pack(STEPS.WARN_SOFT, C.orange);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    function sleepQuality(value) {
        const v = num(value, 0);
        if (v <= 0) return pack(STEPS.NEUTRAL, C.gray);
        if (v <= 2) return pack(STEPS.WARN_STRONG, C.red);
        if (v <= 4) return pack(STEPS.WARN_SOFT, C.orange);
        if (v <= 5) return pack(STEPS.NEUTRAL, C.yellow);
        if (v <= 7) return pack(STEPS.GOOD_SOFT, C.greenLight);
        if (v <= 9) return pack(STEPS.GOOD_STRONG, C.green);
        return pack(STEPS.GOOD_STRONG, C.greenDark);
    }

    function dayScore10(value) {
        const v = num(value, 0);
        if (v <= 0) return pack(STEPS.NEUTRAL, C.gray);
        if (v <= 3) return pack(STEPS.WARN_STRONG, C.red);
        if (v <= 5) return pack(STEPS.NEUTRAL, C.yellow);
        if (v <= 7) return pack(STEPS.GOOD_SOFT, C.green);
        return pack(STEPS.GOOD_STRONG, C.greenDark);
    }

    function healthScore(score) {
        const s = num(score, 0);
        if (s >= 85) return pack(STEPS.GOOD_STRONG, C.greenDark);
        if (s >= 70) return pack(STEPS.GOOD_SOFT, C.green);
        if (s >= 50) return pack(STEPS.NEUTRAL, C.yellow);
        if (s >= 30) return pack(STEPS.WARN_SOFT, C.orange);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    function waterProgress(percent) {
        const pct = num(percent, 0);
        if (pct >= 100) return pack(STEPS.GOOD_STRONG, C.green);
        if (pct >= 70) return pack(STEPS.GOOD_SOFT, C.blue);
        if (pct >= 40) return pack(STEPS.NEUTRAL, C.yellow);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    function sleepHours(hours, target) {
        const h = num(hours, 0);
        const t = num(target, 0);
        if (t <= 0) return pack(STEPS.NEUTRAL, C.grayMuted);
        if (h >= t) return pack(STEPS.GOOD_STRONG, C.green);
        if (h >= t - 1) return pack(STEPS.GOOD_SOFT, C.blue);
        if (h >= t - 2) return pack(STEPS.NEUTRAL, C.yellow);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    // Три вредных градации остаются одной ступенью и различаются глубиной:
    // цвет не должен различать семь состояний, глазом это всё равно не читается.
    // Точные названия живут в подписи, цвет несёт грубее.
    const HARM_BRANCHES = [
        { max: 1.0, id: 'superHealthy', name: '🟢 Суперполезный', color: C.greenHarm, emoji: '🟢', step: STEPS.GOOD_STRONG },
        { max: 2.5, id: 'healthy', name: '🟢 Полезный', color: C.green, emoji: '🟢', step: STEPS.GOOD_SOFT },
        { max: 4.0, id: 'neutral', name: '🟡 Нейтральный', color: C.yellow, emoji: '🟡', step: STEPS.NEUTRAL },
        { max: 5.5, id: 'mildlyHarmful', name: '🟠 Умеренно вредный', color: C.orange, emoji: '🟠', step: STEPS.WARN_SOFT },
        { max: 7.0, id: 'harmful', name: '🔴 Вредный', color: C.red, emoji: '🔴', step: STEPS.WARN_STRONG, depth: DEPTH.SOFT },
        { max: 8.5, id: 'veryHarmful', name: '🔴 Очень вредный', color: C.redDark, emoji: '🔴', step: STEPS.WARN_STRONG, depth: DEPTH.MID },
        { max: 10, id: 'superHarmful', name: '⚫ Супервредный', color: C.redHarm, emoji: '⚫', step: STEPS.WARN_STRONG, depth: DEPTH.DEEP },
    ];

    function harm(value) {
        const harmVal = num(value, NaN);
        if (!Number.isFinite(harmVal)) {
            return pack(STEPS.NEUTRAL, C.grayMuted, { id: 'unknown', name: '❓ Неизвестно', emoji: '❓' });
        }
        for (let i = 0; i < HARM_BRANCHES.length; i++) {
            const branch = HARM_BRANCHES[i];
            if (harmVal <= branch.max) {
                return pack(branch.step, branch.color, {
                    id: branch.id,
                    name: branch.name,
                    emoji: branch.emoji,
                    depth: branch.depth,
                });
            }
        }
        const last = HARM_BRANCHES[HARM_BRANCHES.length - 1];
        return pack(last.step, last.color, {
            id: last.id,
            name: last.name,
            emoji: last.emoji,
            depth: last.depth,
        });
    }

    // Ранги — не оценка «хорошо/плохо», а декоративная палитра прогресса:
    // жёлтый Эксперт идёт ПОСЛЕ зелёного Практика, фиолетовый Мастер вообще вне
    // оценочной оси. Ступень здесь не возвращается намеренно: контракт STEPS
    // задаёт тон предупреждения, и ранги в нём немонотонны. Тема берёт цвет
    // ранга из своей палитры по id, не через colorForStep.
    const GAMIFICATION_LEVELS = [
        { min: 1, max: 4, id: 'novice', title: 'Новичок', icon: '🌱', color: C.slate },
        { min: 5, max: 9, id: 'student', title: 'Ученик', icon: '📚', color: C.blue },
        { min: 10, max: 14, id: 'practitioner', title: 'Практик', icon: '💪', color: C.green },
        { min: 15, max: 19, id: 'expert', title: 'Эксперт', icon: '⭐', color: '#eab308' },
        { min: 20, max: 25, id: 'master', title: 'Мастер', icon: '👑', color: C.purple },
    ];

    function gamificationLevel(level) {
        const lv = num(level, 1);
        let row = null;
        for (let i = 0; i < GAMIFICATION_LEVELS.length; i++) {
            const candidate = GAMIFICATION_LEVELS[i];
            if (lv >= candidate.min && lv <= candidate.max) {
                row = candidate;
                break;
            }
        }
        if (!row) row = GAMIFICATION_LEVELS[GAMIFICATION_LEVELS.length - 1];
        return {
            id: row.id,
            color: row.color,
            title: row.title,
            icon: row.icon,
            min: row.min,
            max: row.max,
            tone: 'rank',
        };
    }

    function macroProtein(actual, norm, hasTraining) {
        if (!norm || norm <= 0) return pack(STEPS.NEUTRAL, C.grayMuted);
        const ratio = actual / norm;
        const minOk = hasTraining ? 0.7 : 0.6;
        const minGood = hasTraining ? 1.0 : 0.9;
        if (ratio < minOk) return pack(STEPS.WARN_STRONG, C.red);
        if (ratio < minGood) return pack(STEPS.WARN_SOFT, C.amberMacro);
        return pack(STEPS.GOOD_STRONG, C.green);
    }

    function macroFat(actual, norm) {
        if (!norm || norm <= 0) return pack(STEPS.NEUTRAL, C.grayMuted);
        const ratio = actual / norm;
        if (ratio < 0.5) return pack(STEPS.WARN_STRONG, C.red);
        if (ratio < 0.8) return pack(STEPS.WARN_SOFT, C.amberMacro);
        if (ratio <= 1.2) return pack(STEPS.GOOD_STRONG, C.green);
        if (ratio <= 1.5) return pack(STEPS.WARN_SOFT, C.amberMacro);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    function macroCarbs(actual, norm, hasDeficit) {
        if (!norm || norm <= 0) return pack(STEPS.NEUTRAL, C.grayMuted);
        const ratio = actual / norm;
        if (hasDeficit) {
            if (ratio < 0.3) return pack(STEPS.WARN_SOFT, C.amberMacro);
            if (ratio <= 1.0) return pack(STEPS.GOOD_STRONG, C.green);
            if (ratio <= 1.2) return pack(STEPS.WARN_SOFT, C.amberMacro);
            return pack(STEPS.WARN_STRONG, C.red);
        }
        if (ratio < 0.5) return pack(STEPS.WARN_STRONG, C.red);
        if (ratio < 0.8) return pack(STEPS.WARN_SOFT, C.amberMacro);
        if (ratio <= 1.1) return pack(STEPS.GOOD_STRONG, C.green);
        if (ratio <= 1.3) return pack(STEPS.WARN_SOFT, C.amberMacro);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    // Виджет макро: % от нормы, не граммы — пороги отличаются от macro* колец.
    function macroWidgetValueTone(pct, toneClass) {
        const p = num(pct, NaN);
        if (!Number.isFinite(p) || p <= 0) return pack(STEPS.WARN_STRONG, C.red);
        if (toneClass === 'protein') {
            if (p >= 90) return pack(STEPS.GOOD_STRONG, C.greenHarm);
            if (p >= 70) return pack(STEPS.WARN_SOFT, C.amberMacro);
            return pack(STEPS.WARN_STRONG, C.red);
        }
        if (p >= 70 && p <= 110) return pack(STEPS.GOOD_STRONG, C.greenHarm);
        if (p >= 50 && p <= 125) return pack(STEPS.WARN_SOFT, C.amberMacro);
        return pack(STEPS.WARN_STRONG, C.red);
    }

    // Радар риска: выше балл — хуже (инверсия healthScore).
    function riskRadarScore(score) {
        const s = num(score, 0);
        if (s >= 70) return pack(STEPS.WARN_STRONG, C.red);
        if (s >= 40) return pack(STEPS.WARN_SOFT, C.orange);
        if (s >= 20) return pack(STEPS.NEUTRAL, C.yellow);
        return pack(STEPS.GOOD_STRONG, C.greenDark);
    }

    const MACRO_GRADIENT_STOPS = Object.freeze({
        protein: ['#fecaca', '#ef4444'],
        fat: [v4MixRole(V4_WARN_1, 40), V4_WARN_1],
        carbs: ['#bbf7d0', '#22c55e'],
    });

    const MACRO_OVERFLOW_COLORS = Object.freeze({
        protein: C.green,
        fat: C.red,
        carbs: C.red,
    });

    function ratio(value) {
        const zones = HEYS.ratioZones;
        if (!zones || typeof zones.getZone !== 'function') return null;
        const zone = zones.getZone(num(value, 0));
        if (!zone) return null;
        const STEP_BY_ZONE = {
            crash: STEPS.WARN_STRONG,
            low: STEPS.WARN_SOFT,
            good: STEPS.GOOD_SOFT,
            perfect: STEPS.GOOD_STRONG,
            over: STEPS.WARN_SOFT,
            binge: STEPS.WARN_STRONG,
        };
        const step = STEP_BY_ZONE[zone.id] || STEPS.NEUTRAL;
        return {
            color: zone.color,
            textColor: zone.textColor,
            zone: zone.id,
            step,
        };
    }

    const SCALES = {
        steps_progress: stepsProgress,
        steps_widget: stepsWidget,
        steps_goal: stepsGoal,
        deficit,
        wellbeing,
        stress,
        training_rating: trainingRating,
        mood_rating: moodRating,
        stress_rating: stressRating,
        sleep_quality: sleepQuality,
        day_score_10: dayScore10,
        health_score: healthScore,
        water_progress: waterProgress,
        sleep_hours: sleepHours,
        harm,
        gamification_level: gamificationLevel,
        macro_protein: macroProtein,
        macro_fat: macroFat,
        macro_carbs: macroCarbs,
        macro_widget_value_tone: macroWidgetValueTone,
        risk_radar_score: riskRadarScore,
        ratio,
    };

    function resolve(scaleId, value, arg2, arg3) {
        const fn = SCALES[scaleId];
        if (typeof fn !== 'function') return null;
        if (scaleId === 'sleep_hours') return fn(value, arg2);
        if (scaleId === 'macro_protein') return fn(value, arg2, arg3);
        if (scaleId === 'macro_carbs') return fn(value, arg2, arg3);
        if (scaleId === 'macro_widget_value_tone') return fn(value, arg2);
        return fn(value);
    }

    function color(scaleId, value, arg2, arg3) {
        const result = resolve(scaleId, value, arg2, arg3);
        return result ? result.color : null;
    }

    HEYS.scales = {
        STEPS,
        DEPTH,
        CLASSIC_STEP_COLOR,
        CLASSIC_WARN_DEPTH_COLOR,
        colorForStep,
        resolve,
        color,
        stepsProgress,
        stepsWidget,
        stepsGoal,
        deficit,
        wellbeing,
        stress,
        trainingRating,
        moodRating,
        stressRating,
        sleepQuality,
        dayScore10,
        healthScore,
        waterProgress,
        sleepHours,
        harm,
        gamificationLevel,
        macroProtein,
        macroFat,
        macroCarbs,
        macroWidgetValueTone,
        riskRadarScore,
        MACRO_GRADIENT_STOPS,
        MACRO_OVERFLOW_COLORS,
        ratio,
        HARM_BRANCHES,
        GAMIFICATION_LEVELS,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HEYS.scales;
    }
}(typeof window !== 'undefined' ? window : globalThis));
