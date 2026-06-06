// heys_planning_gantt_touch_v1.js — touch interactions for Gantt v2
// Phase 2a: base PointerEvent state-machine + long-press drag-to-move + React-managed ghost.
// Resize handles (Phase 2b), pinch-zoom (Phase 2c) and edge auto-scroll/haptic (Phase 2d) follow.
//
// Architecture mirrors Calendar drag (heys_planning_schedule_v1.js:2640-2843):
//   - State stored in refs (no closure-drift)
//   - Window-level listeners attached in pointerdown, removed in finishDrag
//   - Hold timer (180ms) before activation; movement > 12px before activation cancels
//   - Synchronous drop apply via state.updateTask (no setTimeout)
//   - Ghost rendered via React state (not cloneNode) — see Calendar pattern
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const { useRef, useState, useCallback, useEffect } = React;

    // Constants — names mirror Calendar's CALENDAR_TOUCH_DRAG_* exactly.
    const HOLD_MS = 180;                    // long-press to activate move-drag
    const MOVE_CANCEL_THRESHOLD = 12;       // px movement before hold expires → cancel
    const TAP_SLOP_PX = 14;                 // px movement within tap window → still tap
    const HAPTIC_THROTTLE_MS = 50;          // rate-limit vibrate calls
    const RESIZE_EDGE_PX = 22;              // px from bar edge counted as resize-handle zone
    const RESIZE_MIN_BAR_WIDTH = 66;        // bars narrower than this disable resize zones (move only)
    const AUTO_SCROLL_EDGE_MAX = 56;        // CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE
    const AUTO_SCROLL_STEP_MAX = 18;        // CALENDAR_TOUCH_DRAG_AUTO_SCROLL_STEP

    function resolveAutoScrollDelta(distanceToEdge, edgeThreshold) {
        // Linear easing: intensity = 1 - distance/threshold, delta in [0, STEP_MAX].
        // Calendar uses the same formula at heys_planning_schedule_v1.js:389-394.
        const safeThreshold = Math.max(edgeThreshold || 0, 1);
        const safeDistance = Math.max(0, Math.min(safeThreshold, distanceToEdge || 0));
        const intensity = 1 - safeDistance / safeThreshold;
        return Math.max(0, intensity) * AUTO_SCROLL_STEP_MAX;
    }

    function noop() {}

    function rateLimitedHaptic(lastRef) {
        return function (intensity) {
            const now = Date.now();
            if (!navigator || typeof navigator.vibrate !== 'function') return;
            if (now - (lastRef.current || 0) < HAPTIC_THROTTLE_MS) return;
            try { navigator.vibrate(Math.max(1, intensity || 10)); } catch (_e) { /* unsupported */ }
            lastRef.current = now;
        };
    }

    function detectMode(event, targetNode, options) {
        // Returns 'move' | 'resize-start' | 'resize-end' based on pointer X position
        // relative to the bar's bounding rect. Resize zones are disabled when:
        //   - options.isResizable === false (milestones)
        //   - bar narrower than RESIZE_MIN_BAR_WIDTH (no room for two 22px zones + middle)
        if (options && options.isResizable === false) return 'move';
        if (!targetNode || typeof targetNode.getBoundingClientRect !== 'function') return 'move';
        const rect = targetNode.getBoundingClientRect();
        if (rect.width < RESIZE_MIN_BAR_WIDTH) return 'move';
        const dxLeft = event.clientX - rect.left;
        const dxRight = rect.right - event.clientX;
        if (dxLeft <= RESIZE_EDGE_PX) return 'resize-start';
        if (dxRight <= RESIZE_EDGE_PX) return 'resize-end';
        return 'move';
    }

    function useGanttDragInteractions(params) {
        const {
            scrollRef,           // ref to .planning-gantt2-scroll
            screenRef,           // ref to .planning-gantt2-screen (for class toggling)
            timelineStart,       // ISO date string
            dayWidth,            // current px per day
            onMoveTask,          // (taskId, deltaDays) => void
            onResizeTask,        // (taskId, side: 'start'|'end', deltaDays) => void
            onTapTask,           // (taskId) => void
            onZoomEnd,           // (snappedDayWidth) => void — final React state update after pinch
            getTaskById,         // (id) => Task | undefined
        } = params;

        // Drag state in ref — avoids closure drift on rapid pointermove.
        // Shape: { taskId, mode, pointerId, targetNode,
        //          startX, startY, lastX, lastY,
        //          activated, holdTimer,
        //          original: { startDate, dueDate, plannedMinutes },
        //          handlePointerMove, handlePointerUp, handlePointerCancel }
        const dragStateRef = useRef(null);
        const lastHapticRef = useRef(0);
        const haptic = useCallback(rateLimitedHaptic(lastHapticRef), []);

        // Auto-scroll state (Phase 2d) — RAF cycle that nudges scrollLeft when finger near edge.
        // Mirror Calendar startCalendarTouchAutoScroll (heys_planning_schedule_v1.js:2641-2711):
        //   alternating measurement (gen % 2), dynamic edge zone, linear easing.
        const autoScrollRafRef = useRef(0);
        const autoScrollRectRef = useRef(null);
        const autoScrollGenRef = useRef(0);

        const stopAutoScroll = useCallback(() => {
            if (autoScrollRafRef.current) {
                window.cancelAnimationFrame(autoScrollRafRef.current);
                autoScrollRafRef.current = 0;
            }
            autoScrollRectRef.current = null;
            autoScrollGenRef.current = 0;
        }, []);

        const startAutoScroll = useCallback(() => {
            if (autoScrollRafRef.current) return;
            autoScrollGenRef.current = 0;
            autoScrollRectRef.current = null;

            const step = () => {
                const active = dragStateRef.current;
                const scrollEl = scrollRef && scrollRef.current;
                if (!active || !active.activated || !scrollEl) {
                    autoScrollRafRef.current = 0;
                    autoScrollRectRef.current = null;
                    return;
                }
                const gen = (autoScrollGenRef.current += 1);
                const measure = gen === 1 || (gen % 2 === 1);
                let rect = autoScrollRectRef.current;
                if (measure || !rect) {
                    rect = scrollEl.getBoundingClientRect();
                    autoScrollRectRef.current = rect;
                }
                const edge = Math.min(AUTO_SCROLL_EDGE_MAX, Math.max(rect.width * 0.16, 28));
                let deltaX = 0;
                if (active.lastX <= rect.left + edge) {
                    deltaX = -resolveAutoScrollDelta(active.lastX - rect.left, edge);
                } else if (active.lastX >= rect.right - edge) {
                    deltaX = resolveAutoScrollDelta(rect.right - active.lastX, edge);
                }
                if (Math.abs(deltaX) > 0.1) {
                    scrollEl.scrollLeft += deltaX;
                    autoScrollRectRef.current = null; // invalidate — re-measure next frame
                }
                autoScrollRafRef.current = window.requestAnimationFrame(step);
            };
            autoScrollRafRef.current = window.requestAnimationFrame(step);
        }, [scrollRef]);

        // dragPreview: React-managed ghost. Calendar uses the same pattern (heys_planning_schedule_v1.js:2734-2747).
        const [dragPreview, setDragPreview] = useState(null);

        // Live values via refs so listeners (attached once on activation) read fresh data.
        const dayWidthRef = useRef(dayWidth);
        const timelineStartRef = useRef(timelineStart);
        useEffect(() => { dayWidthRef.current = dayWidth; }, [dayWidth]);
        useEffect(() => { timelineStartRef.current = timelineStart; }, [timelineStart]);

        const finishDragRef = useRef(noop);

        const finishDrag = useCallback(function finishDrag({ applyDrop }) {
            const active = dragStateRef.current;
            if (!active) return;

            // 1. Cancel hold timer
            if (active.holdTimer) {
                window.clearTimeout(active.holdTimer);
                active.holdTimer = 0;
            }
            // 2. Detach window listeners
            if (typeof active.handlePointerMove === 'function') {
                window.removeEventListener('pointermove', active.handlePointerMove);
            }
            if (typeof active.handlePointerUp === 'function') {
                window.removeEventListener('pointerup', active.handlePointerUp);
            }
            if (typeof active.handlePointerCancel === 'function') {
                window.removeEventListener('pointercancel', active.handlePointerCancel);
            }
            // 3. Release pointer capture
            if (active.pointerId != null && active.targetNode && typeof active.targetNode.releasePointerCapture === 'function') {
                try { active.targetNode.releasePointerCapture(active.pointerId); } catch (_e) { /* noop */ }
            }
            // 4. Stop auto-scroll RAF + snap classes off
            stopAutoScroll();
            const screen = screenRef && screenRef.current;
            if (screen) screen.classList.remove('gantt-dragging-active');
            if (active.targetNode) active.targetNode.classList.remove('is-dragging');

            // 5. Compute final deltaDays for drop
            const deltaDays = active.activated
                ? Math.round((active.lastX - active.startX) / Math.max(1, dayWidthRef.current))
                : 0;

            // 6. Clear state + ghost
            dragStateRef.current = null;
            setDragPreview(null);

            // 7. Apply drop synchronously
            if (applyDrop && active.activated && deltaDays !== 0) {
                if (active.mode === 'move' && typeof onMoveTask === 'function') {
                    onMoveTask(active.taskId, deltaDays);
                    haptic(20);
                } else if (active.mode === 'resize-start' && typeof onResizeTask === 'function') {
                    onResizeTask(active.taskId, 'start', deltaDays);
                    haptic(20);
                } else if (active.mode === 'resize-end' && typeof onResizeTask === 'function') {
                    onResizeTask(active.taskId, 'end', deltaDays);
                    haptic(20);
                }
            }
        }, [screenRef, onMoveTask, onResizeTask, haptic, stopAutoScroll]);

        useEffect(() => { finishDragRef.current = finishDrag; }, [finishDrag]);

        // Cleanup on unmount.
        useEffect(() => () => {
            try { finishDragRef.current({ applyDrop: false }); } catch (_e) { /* noop */ }
        }, []);

        const activateDrag = useCallback(function activateDrag(active) {
            if (!active || active.activated) return;
            active.activated = true;

            // Visual + haptic feedback
            haptic(15);
            const screen = screenRef && screenRef.current;
            if (screen) screen.classList.add('gantt-dragging-active');
            if (active.targetNode) active.targetNode.classList.add('is-dragging');

            // Compute initial ghost preview from the source bar's bounding rect.
            const rect = active.targetNode && typeof active.targetNode.getBoundingClientRect === 'function'
                ? active.targetNode.getBoundingClientRect()
                : null;
            const width = rect && rect.width > 0 ? rect.width : Math.max(28, dayWidthRef.current);
            const height = rect && rect.height > 0 ? rect.height : 28;
            // Match the original bar's color/label for the ghost.
            const computed = active.targetNode ? window.getComputedStyle(active.targetNode) : null;
            const background = computed ? computed.background || computed.backgroundColor : '#3b82f6';
            const label = active.targetNode ? active.targetNode.getAttribute('title') || '' : '';

            setDragPreview({
                x: active.lastX,
                y: active.lastY,
                width,
                height,
                grabOffsetX: rect ? (active.startX - rect.left) : (width / 2),
                grabOffsetY: rect ? (active.startY - rect.top) : (height / 2),
                background,
                label,
                deltaDays: 0,
                mode: active.mode,
            });

            startAutoScroll();
        }, [screenRef, haptic, startAutoScroll]);

        const onPointerDown = useCallback(function onPointerDown(event, taskId, options) {
            // Ignore if another drag is active.
            if (dragStateRef.current) return;
            // Mouse: activate immediately on left-click; touch/pen: long-press path.
            const pointerType = String(event.pointerType || '').toLowerCase();
            if (pointerType === 'mouse' && event.button !== 0) return;

            const targetNode = event.currentTarget;
            const mode = detectMode(event, targetNode, options);
            const original = (function () {
                const t = (typeof getTaskById === 'function') ? getTaskById(taskId) : null;
                return {
                    startDate: t && t.startDate ? String(t.startDate) : null,
                    dueDate: t && t.dueDate ? String(t.dueDate) : null,
                    plannedMinutes: t && Number(t.plannedMinutes) > 0 ? Number(t.plannedMinutes) : null,
                };
            })();

            const active = {
                taskId,
                mode,
                pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
                targetNode,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY,
                activated: false,
                holdTimer: 0,
                original,
                handlePointerMove: null,
                handlePointerUp: null,
                handlePointerCancel: null,
            };
            dragStateRef.current = active;

            // Mouse path activates immediately + setPointerCapture; touch defers to hold timer.
            if (pointerType === 'mouse') {
                if (event.cancelable) event.preventDefault();
                if (active.pointerId != null && targetNode && typeof targetNode.setPointerCapture === 'function') {
                    try { targetNode.setPointerCapture(active.pointerId); } catch (_e) { /* noop */ }
                }
                activateDrag(active);
            } else {
                // Touch: schedule long-press activation. Movement > MOVE_CANCEL_THRESHOLD before
                // hold expires cancels (pure scroll gesture).
                active.holdTimer = window.setTimeout(function () {
                    const cur = dragStateRef.current;
                    if (!cur || cur !== active) return;
                    cur.holdTimer = 0;
                    activateDrag(cur);
                }, HOLD_MS);
            }

            // Wire up window-level listeners. Closure captures `active` directly — but we still read
            // dragStateRef.current inside handlers in case `active` was nulled by finishDrag.
            const onMove = function (ev) {
                const cur = dragStateRef.current;
                if (!cur) return;
                if (cur.pointerId != null && typeof ev.pointerId === 'number' && ev.pointerId !== cur.pointerId) return;
                cur.lastX = ev.clientX;
                cur.lastY = ev.clientY;

                const deltaX = cur.lastX - cur.startX;
                const deltaY = cur.lastY - cur.startY;
                const distance = Math.hypot(deltaX, deltaY);

                if (!cur.activated) {
                    // Pre-activation: cancel if user starts scrolling (touch) or drags too far before hold.
                    if (distance > MOVE_CANCEL_THRESHOLD) {
                        finishDragRef.current({ applyDrop: false });
                    }
                    return;
                }

                // Activated: prevent native scroll, update ghost via setState (rAF-throttled by React).
                if (ev.cancelable) ev.preventDefault();
                const deltaDays = Math.round(deltaX / Math.max(1, dayWidthRef.current));

                setDragPreview(function (prev) {
                    if (!prev) return prev;
                    const snapped = (prev.deltaDays !== deltaDays);
                    if (snapped) haptic(10);
                    return { ...prev, x: cur.lastX, y: cur.lastY, deltaDays };
                });
            };

            const onUp = function (ev) {
                const cur = dragStateRef.current;
                if (!cur) return;
                if (cur.pointerId != null && typeof ev.pointerId === 'number' && ev.pointerId !== cur.pointerId) return;
                // Distinguish tap from drag.
                const distance = Math.hypot(cur.lastX - cur.startX, cur.lastY - cur.startY);
                const wasTap = !cur.activated && distance <= TAP_SLOP_PX;
                const taskId = cur.taskId;
                finishDragRef.current({ applyDrop: true });
                if (wasTap && typeof onTapTask === 'function') {
                    onTapTask(taskId);
                }
            };

            const onCancel = function () {
                finishDragRef.current({ applyDrop: false });
            };

            active.handlePointerMove = onMove;
            active.handlePointerUp = onUp;
            active.handlePointerCancel = onCancel;
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
        }, [activateDrag, haptic, onTapTask, getTaskById]);

        // ─── Pinch-zoom (Phase 2c) ──────────────────────────────────────────
        // Track every pointer that lands inside the Gantt screen. When a second
        // pointer arrives we cancel any active drag and switch into pinch mode.
        // Distance ratio updates --gantt-day-w directly (no React re-render).
        // On the last pointerup we snap to the nearest preset and call onZoomEnd
        // so the React state catches up.
        const activePointersRef = useRef(new Map());
        const pinchStateRef = useRef(null);
        const Layout = HEYS.PlanningGanttLayout;

        useEffect(() => {
            function isInsideScreen(target) {
                const screen = screenRef && screenRef.current;
                return !!(screen && target && screen.contains(target));
            }

            function startPinch() {
                if (pinchStateRef.current) return;
                if (dragStateRef.current) finishDragRef.current({ applyDrop: false });
                const pts = Array.from(activePointersRef.current.values());
                if (pts.length < 2) return;
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const initialDistance = Math.max(1, Math.hypot(dx, dy));
                const initialCenterX = (pts[0].x + pts[1].x) / 2;
                pinchStateRef.current = {
                    initialDistance,
                    initialDayWidth: dayWidthRef.current,
                    lastWidth: dayWidthRef.current,
                    // Period-swipe disambiguation: track distance change vs center movement
                    // for first 100ms. If distance stays within ±10% but center moves >40px,
                    // user is doing a two-finger horizontal pan, not a pinch.
                    startTime: Date.now(),
                    initialCenterX,
                    isPanMode: false,
                };
                const screen = screenRef && screenRef.current;
                if (screen) screen.classList.add('gantt-pinching-active');
                haptic(15);
            }

            function endPinch() {
                const state = pinchStateRef.current;
                pinchStateRef.current = null;
                const screen = screenRef && screenRef.current;
                if (screen) {
                    screen.classList.remove('gantt-pinching-active');
                    // Reset inline override; React state below will re-apply via cssVars.
                    screen.style.removeProperty('--gantt-day-w');
                }
                if (!state) return;
                // Pan mode never altered dayWidth — nothing to commit.
                if (state.isPanMode) return;
                if (Layout && typeof Layout.snapDayWidth === 'function' && typeof onZoomEnd === 'function') {
                    const snapped = Layout.snapDayWidth(state.lastWidth);
                    if (snapped !== dayWidthRef.current) {
                        haptic(10);
                        onZoomEnd(snapped);
                    }
                }
            }

            function onAnyPointerDown(e) {
                if (!isInsideScreen(e.target)) return;
                activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (activePointersRef.current.size === 2) startPinch();
            }

            function onAnyPointerMove(e) {
                const tracked = activePointersRef.current.get(e.pointerId);
                if (!tracked) return;
                tracked.x = e.clientX;
                tracked.y = e.clientY;
                if (!pinchStateRef.current) return;
                const pts = Array.from(activePointersRef.current.values());
                if (pts.length < 2) return;
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const dist = Math.max(1, Math.hypot(dx, dy));
                const ratio = dist / pinchStateRef.current.initialDistance;
                const centerX = (pts[0].x + pts[1].x) / 2;

                // Period-swipe vs pinch disambiguation in the first 100ms:
                // distance change <10% AND center moved >40px → pan mode.
                if (!pinchStateRef.current.isPanMode &&
                    Date.now() - pinchStateRef.current.startTime < 100) {
                    const distChange = Math.abs(ratio - 1);
                    const centerShift = Math.abs(centerX - pinchStateRef.current.initialCenterX);
                    if (distChange < 0.1 && centerShift > 40) {
                        pinchStateRef.current.isPanMode = true;
                        pinchStateRef.current.lastCenterX = centerX;
                    }
                }

                if (pinchStateRef.current.isPanMode) {
                    // Two-finger pan — translate horizontal scrollLeft by center delta.
                    const scroll = scrollRef && scrollRef.current;
                    if (scroll) {
                        const delta = (pinchStateRef.current.lastCenterX || centerX) - centerX;
                        scroll.scrollLeft += delta;
                    }
                    pinchStateRef.current.lastCenterX = centerX;
                    if (e.cancelable) e.preventDefault();
                    return;
                }

                const next = Layout && typeof Layout.clampDayWidth === 'function'
                    ? Layout.clampDayWidth(pinchStateRef.current.initialDayWidth * ratio)
                    : pinchStateRef.current.initialDayWidth * ratio;
                pinchStateRef.current.lastWidth = next;
                const screen = screenRef && screenRef.current;
                if (screen) screen.style.setProperty('--gantt-day-w', next + 'px');
                if (e.cancelable) e.preventDefault();
            }

            function onAnyPointerUpOrCancel(e) {
                if (!activePointersRef.current.has(e.pointerId)) return;
                activePointersRef.current.delete(e.pointerId);
                if (pinchStateRef.current && activePointersRef.current.size < 2) {
                    endPinch();
                }
            }

            window.addEventListener('pointerdown', onAnyPointerDown, true);
            window.addEventListener('pointermove', onAnyPointerMove, true);
            window.addEventListener('pointerup', onAnyPointerUpOrCancel, true);
            window.addEventListener('pointercancel', onAnyPointerUpOrCancel, true);
            return () => {
                window.removeEventListener('pointerdown', onAnyPointerDown, true);
                window.removeEventListener('pointermove', onAnyPointerMove, true);
                window.removeEventListener('pointerup', onAnyPointerUpOrCancel, true);
                window.removeEventListener('pointercancel', onAnyPointerUpOrCancel, true);
            };
        }, [screenRef, haptic, onZoomEnd, Layout]);

        return {
            onPointerDown,
            dragPreview,
        };
    }

    HEYS.PlanningGanttTouch = {
        useGanttDragInteractions,
        constants: {
            HOLD_MS,
            MOVE_CANCEL_THRESHOLD,
            TAP_SLOP_PX,
            HAPTIC_THROTTLE_MS,
        },
    };
})();
