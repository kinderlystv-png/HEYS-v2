// heys_day_steps_ui.js — steps goal + slider state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useStepsState(params) {
        const { React, day, prof, getProfile, setDay } = params || {};
        const { useState, useEffect, useRef } = React || {};

        const safeDay = day || {};
        const safeProf = prof || {};

        const [savedStepsGoal, setSavedStepsGoal] = useState(() => safeProf.stepsGoal || 7000);
        const initialStepsSyncDoneRef = useRef(false);
        const lastDispatchedStepsRef = useRef(safeDay.steps || 0);
        const latestStepsRef = useRef(safeDay.steps || 0);

        useEffect(() => {
            const handleProfileUpdate = (e) => {
                if (e.type === 'heysSyncCompleted') {
                    if (!initialStepsSyncDoneRef.current) {
                        initialStepsSyncDoneRef.current = true;
                        return;
                    }
                }

                const stepsFromEvent = e?.detail?.stepsGoal;
                if (stepsFromEvent != null) {
                    setSavedStepsGoal(prev => prev === stepsFromEvent ? prev : stepsFromEvent);
                    return;
                }
                const profileFromStorage = getProfile ? getProfile() : {};
                if (profileFromStorage.stepsGoal) {
                    setSavedStepsGoal(prev => prev === profileFromStorage.stepsGoal ? prev : profileFromStorage.stepsGoal);
                }
            };

            window.addEventListener('heysSyncCompleted', handleProfileUpdate);
            window.addEventListener('heys:profile-updated', handleProfileUpdate);

            return () => {
                window.removeEventListener('heysSyncCompleted', handleProfileUpdate);
                window.removeEventListener('heys:profile-updated', handleProfileUpdate);
            };
        }, [getProfile]);

        const stepsGoal = Math.max(1, savedStepsGoal || 7000);
        const stepsMax = 20000;
        const stepsValue = safeDay.steps || 0;

        const stepsPercent = stepsValue <= stepsGoal
            ? (stepsValue / stepsGoal) * 80
            : 80 + ((stepsValue - stepsGoal) / (stepsMax - stepsGoal)) * 20;

        const stepsColorPercent = Math.min(100, (stepsValue / stepsGoal) * 100);

        const getStepsColor = (pct) => {
            if (pct < 30) {
                const t = pct / 30;
                const r = Math.round(239 - t * (239 - 234));
                const g = Math.round(68 + t * (179 - 68));
                const b = Math.round(68 - t * (68 - 8));
                return `rgb(${r}, ${g}, ${b})`;
            }
            const t = (pct - 30) / 70;
            const r = Math.round(234 - t * (234 - 34));
            const g = Math.round(179 + t * (197 - 179));
            const b = Math.round(8 + t * (94 - 8));
            return `rgb(${r}, ${g}, ${b})`;
        };

        const stepsColor = getStepsColor(stepsColorPercent);

        const isDraggingRef = useRef(false);
        const rafIdRef = useRef(0);
        const pendingStepsRef = useRef(null);

        // 🚀 PERF R8: during drag, update only DOM (thumb, fill, text).
        // Single setDay() on touchend avoids 15-30 full DayTab re-renders per drag.
        const handleStepsDrag = (e) => {
            if (isDraggingRef.current) return;
            const slider = e.currentTarget.closest('.steps-slider');
            if (!slider) return;
            isDraggingRef.current = true;

            const rect = slider.getBoundingClientRect();
            // Cache DOM nodes for direct updates during drag
            const thumbEl = slider.querySelector('.steps-slider-thumb');
            const fillEl = slider.querySelector('.steps-slider-fill');
            const containerEl = slider.closest('.compact-activity');
            const valueEl = containerEl?.querySelector('.steps-value b');

            const computeSteps = (clientX) => {
                const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
                const percent = (x / rect.width) * 100;
                let newSteps;
                if (percent <= 80) {
                    newSteps = Math.round(((percent / 80) * stepsGoal) / 10) * 10;
                } else {
                    const extraPercent = (percent - 80) / 20;
                    newSteps = stepsGoal + Math.round((extraPercent * (stepsMax - stepsGoal)) / 100) * 100;
                }
                return Math.min(stepsMax, Math.max(0, newSteps));
            };

            const computePercent = (steps) => steps <= stepsGoal
                ? (steps / stepsGoal) * 80
                : 80 + ((steps - stepsGoal) / (stepsMax - stepsGoal)) * 20;

            // DOM-only flush — no React re-render
            const flushStepsDOM = () => {
                rafIdRef.current = 0;
                const val = pendingStepsRef.current;
                if (val == null) return;
                pendingStepsRef.current = null;
                latestStepsRef.current = val;
                const pct = computePercent(val) + '%';
                const color = getStepsColor(Math.min(100, (val / stepsGoal) * 100));
                if (thumbEl) { thumbEl.style.left = pct; thumbEl.style.borderColor = color; }
                if (fillEl) { fillEl.style.width = pct; fillEl.style.background = color; }
                if (valueEl) { valueEl.textContent = val.toLocaleString(); valueEl.style.color = color; }
            };

            const onMove = (ev) => {
                if (ev.cancelable) ev.preventDefault();
                const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                pendingStepsRef.current = computeSteps(clientX);
                if (!rafIdRef.current) {
                    rafIdRef.current = requestAnimationFrame(flushStepsDOM);
                }
            };

            const onEnd = () => {
                isDraggingRef.current = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);

                if (rafIdRef.current) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = 0;
                }
                // Flush last pending to ref if any
                if (pendingStepsRef.current != null) {
                    latestStepsRef.current = pendingStepsRef.current;
                    pendingStepsRef.current = null;
                }

                // 🚀 PERF R9: defer React state sync via setTimeout(0).
                // DOM already shows correct slider state from drag;
                // heavy setDay() runs in a separate task after browser paints.
                const finalSteps = latestStepsRef.current || 0;
                setTimeout(() => {
                    setDay(prev => ({ ...prev, steps: finalSteps, updatedAt: Date.now() }));
                    if (finalSteps !== lastDispatchedStepsRef.current) {
                        lastDispatchedStepsRef.current = finalSteps;
                        window.dispatchEvent(new CustomEvent('heysStepsUpdated', {
                            detail: { steps: finalSteps }
                        }));
                    }
                }, 0);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);

            // Initial touch position → DOM-only update (no React render)
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            pendingStepsRef.current = computeSteps(clientX);
            flushStepsDOM();
        };

        return {
            stepsGoal,
            stepsMax,
            stepsValue,
            stepsPercent,
            stepsColor,
            handleStepsDrag
        };
    }

    HEYS.dayStepsUI = {
        useStepsState
    };
})(window);
