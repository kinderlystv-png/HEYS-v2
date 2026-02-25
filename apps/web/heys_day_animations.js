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
        const prevKcalRef = useRef(0);

        // === Анимации карточек при превышении/успехе ===
        const [shakeEaten, setShakeEaten] = useState(false);   // карточка "Съедено" — shake при превышении
        const [shakeOver, setShakeOver] = useState(false);     // карточка "Перебор" — shake при превышении
        const [pulseSuccess, setPulseSuccess] = useState(false); // карточка "Съедено" — pulse при успехе

        // === Progress animation ===
        const [animatedProgress, setAnimatedProgress] = useState(0);
        const [animatedKcal, setAnimatedKcal] = useState(0);
        const [animatedRatioPct, setAnimatedRatioPct] = useState(0); // Анимированный % для бейджа
        const [animatedMarkerPos, setAnimatedMarkerPos] = useState(0); // Позиция бейджа (всегда до 100%)
        const [isAnimating, setIsAnimating] = useState(false);

        // === Анимация прогресса калорий при загрузке и при переключении на вкладку ===
        const animationRef = useRef(null);
        useEffect(() => {
            // Отменяем предыдущую анимацию
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }

            // Шаг 1: Сбрасываем к 0 мгновенно
            setIsAnimating(true);
            setAnimatedProgress(0);
            setAnimatedKcal(0);
            setAnimatedRatioPct(0);
            setAnimatedMarkerPos(0);

            // При переборе: зелёная часть = доля нормы от съеденного (optimum/eaten)
            // При норме: зелёная часть = доля съеденного от нормы (eaten/optimum)
            const isOver = eatenKcal > optimum;
            const target = isOver
                ? (optimum / eatenKcal) * 100  // При переборе: показываем долю нормы
                : (eatenKcal / optimum) * 100; // При норме: показываем прогресс к цели

            // Шаг 2: Ждём чтобы React применил width: 0, затем запускаем анимацию
            const timeoutId = setTimeout(() => {
                setIsAnimating(false); // Включаем transition обратно

                const duration = 1400;
                const startTime = performance.now();
                const targetKcal = eatenKcal; // Целевое значение калорий
                const targetRatioPct = Math.round((eatenKcal / (optimum || 1)) * 100); // Целевой % для бэджа
                // Бейдж: при переборе — едет до 100%, при норме — до конца заполненной линии
                const targetMarkerPos = isOver ? 100 : Math.min(target, 100);

                const animate = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    // Ease out cubic
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const current = target * eased;
                    const currentKcal = Math.round(targetKcal * eased);
                    const currentRatioPct = Math.round(targetRatioPct * eased);
                    const currentMarkerPos = targetMarkerPos * eased; // Позиция бейджа синхронизирована с линией
                    setAnimatedProgress(current);
                    setAnimatedKcal(currentKcal);
                    setAnimatedRatioPct(currentRatioPct);
                    setAnimatedMarkerPos(currentMarkerPos);

                    if (progress < 1) {
                        animationRef.current = requestAnimationFrame(animate);
                    } else {
                        setAnimatedKcal(targetKcal); // Финальное точное значение
                        setAnimatedRatioPct(targetRatioPct);
                        setAnimatedMarkerPos(targetMarkerPos); // Бейдж остаётся на конце линии
                    }
                };

                animationRef.current = requestAnimationFrame(animate);
            }, 50); // 50ms задержка для гарантированного применения width: 0

            return () => {
                clearTimeout(timeoutId);
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
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

        return {
            showConfetti,
            setShowConfetti,
            shakeEaten,
            shakeOver,
            pulseSuccess,
            animatedProgress,
            animatedKcal,
            animatedRatioPct,
            animatedMarkerPos,
            isAnimating
        };
    }

    HEYS.dayAnimations = {
        useDayAnimations
    };

})(window);
