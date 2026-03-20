// heys_day_animations.js — Day animations (progress, confetti, shake)
// Phase 13C of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_animations] React is required');
        }
        return React;
    }

    function useDayAnimations(deps) {
        const React = getReact();
        const {
            eatenKcal,
            optimum,
            mobileSubTab,
            date,
            haptic,
            playSuccessSound
        } = deps;

        const { useState, useEffect, useRef } = React;
        const hapticFn = typeof haptic === 'function' ? haptic : (() => { });

        // === Confetti при достижении цели ===
        const [showConfetti, setShowConfetti] = useState(false);
        const confettiShownRef = useRef(false);
        const prevKcalRef = useRef(null);

        // === Анимации карточек при превышении/успехе ===
        const [shakeEaten, setShakeEaten] = useState(false);   // карточка "Съедено" — shake при превышении
        const [shakeOver, setShakeOver] = useState(false);     // карточка "Перебор" — shake при превышении
        const [pulseSuccess, setPulseSuccess] = useState(false); // карточка "Съедено" — pulse при успехе

        // === 🚀 PERF R7: progress animation via refs + CSS transition ===
        // Before: 4 useState updated per rAF frame → 5-8 full DayTab re-renders (~260ms each)
        // After: refs + 2 forced renders (reset→0 + target). CSS transition animates bar/marker.
        // Counter text animated via direct DOM (no React re-renders during animation).
        const animRef = useRef({ progress: 0, kcal: 0, ratioPct: 0, markerPos: 0, isAnimating: false });
        const [, forceAnimRender] = useState(0);

        // Refs для определения «реального» действия (добавили еду/рефид/сменили день)
        const prevDateTabRef = useRef(null); // "date|mobileSubTab"

        // === Анимация прогресса калорий при загрузке и при переключении на вкладку ===
        const animationRef = useRef(null);
        const animTimeoutRef = useRef(null);
        useEffect(() => {
            // Отменяем предыдущую анимацию
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            if (animTimeoutRef.current) {
                clearTimeout(animTimeoutRef.current);
                animTimeoutRef.current = null;
            }

            const dateTabKey = date + '|' + mobileSubTab;
            const isRealAction = (eatenKcal !== prevKcalRef.current) || (dateTabKey !== prevDateTabRef.current);

            // Обновляем refs
            prevKcalRef.current = eatenKcal;
            prevDateTabRef.current = dateTabKey;

            const isOver = eatenKcal > optimum;
            const target = isOver
                ? (optimum / eatenKcal) * 100
                : (eatenKcal / optimum) * 100;
            const targetRatioPct = Math.round((eatenKcal / (optimum || 1)) * 100);
            const targetMarkerPos = isOver ? 100 : Math.min(target, 100);

            if (!isRealAction) {
                // Только optimum изменился (forceReload/normAbs пересчёт) — не сбрасываем бар,
                // просто пересчитываем финальную позицию мгновенно без transition
                animRef.current = { progress: target, kcal: eatenKcal, ratioPct: targetRatioPct, markerPos: targetMarkerPos, isAnimating: true };
                forceAnimRender(n => n + 1);
                requestAnimationFrame(() => {
                    animRef.current.isAnimating = false;
                    forceAnimRender(n => n + 1);
                });
                return;
            }

            // Шаг 1: Сбрасываем к 0 мгновенно (no-transition через isAnimating=true)
            animRef.current = { progress: 0, kcal: 0, ratioPct: 0, markerPos: 0, isAnimating: true };
            forceAnimRender(n => n + 1);

            // Шаг 2: Ждём чтобы React применил width: 0, затем ставим целевые значения.
            // CSS transition (1.2s) анимирует bar width и marker left.
            // Kcal/ratio counter — анимируем через direct DOM (без React re-render).
            animTimeoutRef.current = setTimeout(() => {
                animRef.current = { progress: target, kcal: eatenKcal, ratioPct: targetRatioPct, markerPos: targetMarkerPos, isAnimating: false };
                forceAnimRender(n => n + 1);

                // Direct DOM animation for kcal counter text (no React state, no re-renders)
                const duration = 1200; // Match CSS transition duration
                const startTime = performance.now();
                const animateCounter = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const t = Math.min(elapsed / duration, 1);
                    // Ease out cubic — matches CSS cubic-bezier(0.16, 1, 0.3, 1) closely
                    const eased = 1 - Math.pow(1 - t, 3);
                    const currentKcal = Math.round(eatenKcal * eased);
                    const currentRatioPct = Math.round(targetRatioPct * eased);

                    // Direct DOM updates — zero React re-renders
                    const kcalEl = document.querySelector('.goal-eaten');
                    if (kcalEl) kcalEl.textContent = currentKcal;
                    const pctEl = document.querySelector('.goal-current-pct');
                    if (pctEl) pctEl.textContent = currentRatioPct + '%';

                    if (t < 1) {
                        animationRef.current = requestAnimationFrame(animateCounter);
                    } else {
                        animationRef.current = null;
                    }
                };
                animationRef.current = requestAnimationFrame(animateCounter);
            }, 50); // 50ms задержка для гарантированного применения width: 0

            return () => {
                if (animTimeoutRef.current) {
                    clearTimeout(animTimeoutRef.current);
                    animTimeoutRef.current = null;
                }
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                    animationRef.current = null;
                }
            };
        }, [eatenKcal, optimum, mobileSubTab, date]); // date — сброс анимации при смене дня

        // 🔔 Shake после завершения анимации sparkline (последовательно: Съедено → Перебор)
        const shakeTimerRef = useRef(null);
        useEffect(() => {
            // Очищаем предыдущий таймер
            if (shakeTimerRef.current) {
                clearTimeout(shakeTimerRef.current);
            }

            const ratio = eatenKcal / (optimum || 1);
            const isSuccess = ratio >= 0.75 && ratio <= 1.1;
            const isExcess = ratio > 1.1;

            if (isExcess) {
                // ❌ Превышение — shake последовательно
                shakeTimerRef.current = setTimeout(() => {
                    setShakeEaten(true);
                    setTimeout(() => setShakeEaten(false), 500);

                    setTimeout(() => {
                        setShakeOver(true);
                        setTimeout(() => setShakeOver(false), 500);
                    }, 300);
                }, 5000);
            } else if (isSuccess) {
                // ✅ Успех — пульсация при загрузке
                shakeTimerRef.current = setTimeout(() => {
                    setPulseSuccess(true);
                    // Пульсация длится 1.5с (3 цикла по 0.5с)
                    setTimeout(() => setPulseSuccess(false), 1500);
                }, 5000);
            }

            return () => {
                if (shakeTimerRef.current) {
                    clearTimeout(shakeTimerRef.current);
                }
            };
        }, [date, eatenKcal, optimum]);

        // === Confetti при достижении 100% цели ===
        useEffect(() => {
            const progress = (eatenKcal / optimum) * 100;
            const prevProgress = (prevKcalRef.current / optimum) * 100;

            // Показываем confetti когда впервые достигаем 95-105% (зона успеха)
            if (progress >= 95 && progress <= 105 && prevProgress < 95 && !confettiShownRef.current) {
                confettiShownRef.current = true;
                setShowConfetti(true);
                hapticFn('success');
                if (typeof playSuccessSound === 'function') {
                    playSuccessSound(); // 🔔 Звук успеха!
                }

                // Скрываем через 3 секунды
                setTimeout(() => setShowConfetti(false), 3000);
            }

            // Сбрасываем флаг если уходим ниже 90%
            if (progress < 90) {
                confettiShownRef.current = false;
            }

            prevKcalRef.current = eatenKcal;
        }, [eatenKcal, optimum, playSuccessSound, hapticFn]);

        // 🚀 PERF R7: read animation values from ref (snapshot at render time)
        const anim = animRef.current;
        return {
            showConfetti,
            setShowConfetti,
            shakeEaten,
            shakeOver,
            pulseSuccess,
            animatedProgress: anim.progress,
            animatedKcal: anim.kcal,
            animatedRatioPct: anim.ratioPct,
            animatedMarkerPos: anim.markerPos,
            isAnimating: anim.isAnimating
        };
    }

    HEYS.dayAnimations = {
        useDayAnimations
    };

})(window);
