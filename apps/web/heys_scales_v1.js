// heys_scales_v1.js — единая точка цветовых шкал приложения
//
// Зачем: цвет «хорошо / внимание» задавался литералами в 6+ независимых
// местах, причём одна и та же метрика (шаги) красилась двумя разными
// способами — непрерывным градиентом в Активе и четырьмя ступенями в
// виджете. Модуль собирает все шкалы в одно место, ничего не меняя
// визуально: каждая возвращает ровно тот цвет, что и раньше.
//
// Каждая шкала помимо цвета отдаёт семантическую ступень (step). Ступени
// общие для всех шкал — на них будет опираться альтернативная тема
// «Мягкий», где палитра сводится к шалфею и терракоте в двух насыщенностях.
// Пока тема одна, step никем не используется и служит контрактом.

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    // Семантические ступени. Порядок — от «хорошо» к «требует внимания».
    const STEPS = {
        GOOD_STRONG: 'good-strong',
        GOOD_SOFT: 'good-soft',
        NEUTRAL: 'neutral',
        WARN_SOFT: 'warn-soft',
        WARN_STRONG: 'warn-strong',
    };

    function num(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    // Линейная интерполяция между двумя rgb-тройками. Формат результата
    // повторяет прежний посимвольно: 'rgb(r, g, b)'.
    function mixRgb(from, to, t) {
        const r = Math.round(from[0] + t * (to[0] - from[0]));
        const g = Math.round(from[1] + t * (to[1] - from[1]));
        const b = Math.round(from[2] + t * (to[2] - from[2]));
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    }

    const RED = [239, 68, 68];
    const YELLOW = [234, 179, 8];
    const GREEN = [34, 197, 94];

    // Прогресс шагов в Активе: непрерывный градиент красный → жёлтый → зелёный.
    // Перелом на 30 % — исторический, сохранён как есть.
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

    // Прогресс шагов в виджете. Тот же показатель, но исторически четыре
    // ступени с другими порогами — расхождение сохранено, чтобы правка
    // оставалась чисто структурной.
    function stepsWidget(percent) {
        const pct = num(percent, 0);
        if (pct >= 100) return { color: '#22c55e', step: STEPS.GOOD_STRONG };
        if (pct >= 70) return { color: '#3b82f6', step: STEPS.GOOD_SOFT };
        if (pct >= 40) return { color: '#eab308', step: STEPS.NEUTRAL };
        return { color: '#ef4444', step: STEPS.WARN_SOFT };
    }

    // Выбор цели по шагам в мастере. Маленькая цель — не ошибка, поэтому нижняя
    // ступень NEUTRAL, а не предупреждение. Ступени монотонны: чем выше цель,
    // тем выше ступень (правка 2026-08-10 — до неё 7000-9999 и 10000+ делили
    // GOOD_STRONG, а цель ниже 7000 получала GOOD_SOFT, то есть ступень лучше
    // средней. В новой теме это слило бы два разных выбора в один тон).
    function stepsGoal(goal) {
        const value = num(goal, 0);
        if (value >= 10000) return { color: '#22c55e', step: STEPS.GOOD_STRONG };
        if (value < 7000) return { color: '#eab308', step: STEPS.NEUTRAL };
        return { color: '#3b82f6', step: STEPS.GOOD_SOFT };
    }

    // Дефицит/профицит калорий. Движение по плану не подсвечивается —
    // отсюда NEUTRAL у любого дефицита в пределах плана.
    function deficit(value) {
        const v = num(value, 0);
        if (v < -10) return { color: '#ef4444', label: 'Агрессивный дефицит', emoji: '🔥🔥', step: STEPS.WARN_SOFT };
        if (v < 0) return { color: '#f97316', label: 'Умеренный дефицит', emoji: '🔥', step: STEPS.NEUTRAL };
        if (v === 0) return { color: '#22c55e', label: 'Поддержание веса', emoji: '⚖️', step: STEPS.NEUTRAL };
        if (v <= 10) return { color: '#3b82f6', label: 'Умеренный профицит', emoji: '💪', step: STEPS.NEUTRAL };
        return { color: '#3b82f6', label: 'Агрессивный набор', emoji: '💪💪', step: STEPS.WARN_SOFT };
    }

    // Шкалы самочувствия. Низкая оценка — состояние, а не срыв, поэтому
    // нижняя ступень WARN_SOFT, а не WARN_STRONG.
    function wellbeing(value) {
        const v = num(value, 0);
        if (v <= 3) return { color: '#ef4444', step: STEPS.WARN_SOFT };
        if (v <= 5) return { color: '#3b82f6', step: STEPS.NEUTRAL };
        if (v <= 7) return { color: '#22c55e', step: STEPS.GOOD_SOFT };
        return { color: '#10b981', step: STEPS.GOOD_STRONG };
    }

    // Стресс — зеркальная шкала: чем ниже, тем лучше.
    function stress(value) {
        const v = num(value, 0);
        if (v <= 3) return { color: '#10b981', step: STEPS.GOOD_STRONG };
        if (v <= 5) return { color: '#3b82f6', step: STEPS.GOOD_SOFT };
        if (v <= 7) return { color: '#eab308', step: STEPS.NEUTRAL };
        return { color: '#ef4444', step: STEPS.WARN_SOFT };
    }

    // Калории относительно нормы. Значения живут в heys_ratio_zones_v1.js и
    // настраиваются пользователем — дублировать их здесь нельзя, поэтому
    // шкала делегирует.
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
        return {
            color: zone.color,
            textColor: zone.textColor,
            zone: zone.id,
            step: STEP_BY_ZONE[zone.id] || STEPS.NEUTRAL,
        };
    }

    const SCALES = {
        steps_progress: stepsProgress,
        steps_widget: stepsWidget,
        steps_goal: stepsGoal,
        deficit,
        wellbeing,
        stress,
        ratio,
    };

    function resolve(scaleId, value) {
        const fn = SCALES[scaleId];
        if (typeof fn !== 'function') return null;
        return fn(value);
    }

    function color(scaleId, value) {
        const result = resolve(scaleId, value);
        return result ? result.color : null;
    }

    HEYS.scales = {
        STEPS,
        resolve,
        color,
        stepsProgress,
        stepsWidget,
        stepsGoal,
        deficit,
        wellbeing,
        stress,
        ratio,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HEYS.scales;
    }
}(typeof window !== 'undefined' ? window : globalThis));
