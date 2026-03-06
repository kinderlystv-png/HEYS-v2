/**
 * heys_widgets_ui_v1.js
 * UI компоненты: Каталог, Настройки, WidgetsTab
 * Version: 1.1.0
 * Created: 2025-12-15
 * 
 * v1.1.0:
 * - Поддержка pointer events для drag & drop
 * - Long press (500ms) для входа в edit mode
 * - Ghost элемент и placeholder preview
 * - Undo/Redo кнопки в header
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};

  const React = global.React;
  const { useState, useEffect, useMemo, useCallback, useRef } = React || {};

  // Debug/telemetry helpers (без прямого console.*)
  const _widgetsOnce = HEYS.Widgets._once || (HEYS.Widgets._once = {});

  function widgetsDebugEnabled() {
    try {
      return localStorage.getItem('heys_debug_widgets') === '1';
    } catch (e) {
      return false;
    }
  }

  function widgetsOnce(key) {
    if (!key) return true;
    if (_widgetsOnce[key]) return false;
    _widgetsOnce[key] = true;
    return true;
  }

  function trackWidgetIssue(eventName, payload) {
    const a = HEYS.analytics;
    if (!a || typeof a.trackError !== 'function') return;
    try {
      // В проекте встречаются обе сигнатуры:
      // - trackError('event_name', { ...payload })
      // - trackError(Error|string, 'source')
      if (payload && typeof payload === 'object') {
        a.trackError(eventName, payload);
        return;
      }
    } catch (e) {
      // no-op
    }
    try {
      a.trackError(String(eventName || 'widgets_issue'), 'widgets');
    } catch (e) {
      // no-op
    }
  }

  // Единая утилита: размеры виджета (не завязаны на «популярность»)
  function getWidgetDims(widget) {
    const registry = HEYS.Widgets?.registry;
    const sizeId = widget?.size;
    const size = sizeId && typeof registry?.getSize === 'function' ? registry.getSize(sizeId) : null;

    let cols = widget?.cols ?? size?.cols;
    let rows = widget?.rows ?? size?.rows;

    if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
      const m = typeof sizeId === 'string' ? sizeId.match(/^([1-4])x([1-4])$/) : null;
      if (m) {
        cols = Number(m[1]);
        rows = Number(m[2]);
      }
    }

    cols = Number.isFinite(cols) ? Math.max(1, Math.min(4, cols)) : 1;
    rows = Number.isFinite(rows) ? Math.max(1, Math.min(4, rows)) : 1;

    const area = cols * rows;
    const isMicro = area <= 1;
    const isTiny = area <= 2;
    const isShort = rows === 1;
    const isTall = cols === 1 && rows >= 2;
    const isWide = cols >= 3 && rows <= 2;

    return { cols, rows, area, isMicro, isTiny, isShort, isTall, isWide, sizeId };
  }

  // === Widget Card Component ===
  // Обёрнут в React.memo — изолирует от ре-рендеров родителя (setWaterAnim и т.п.),
  // чтобы CSS transition на кольце калорий не перезапускался попусту.
  const WidgetCard = React.memo(function WidgetCard({ widget, isEditMode, onRemove, onSettings, index = 0 }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = registry?.getType(widget.type);
    const category = registry?.getCategory(widgetType?.category);
    const elementRef = useRef(null);

    // Refs для resize handles (для native touch events)
    const handleNRef = useRef(null);
    const handleERef = useRef(null);
    const handleSRef = useRef(null);
    const handleWRef = useRef(null);
    const handleNWRef = useRef(null);
    const handleNERef = useRef(null);
    const handleSWRef = useRef(null);
    const handleSERef = useRef(null);

    // Drag-resize (без popover): тянем за хендлы на гранях/углах → снап к доступным размерам
    const resizeDragRef = useRef({
      active: false,
      pointerId: null,
      isTouchBased: false, // true если запущено через touchstart (iOS Safari)
      direction: null, // 'n'|'e'|'s'|'w'|'nw'|'ne'|'sw'|'se'
      startX: 0,
      startY: 0,
      baseCols: 1,
      baseRows: 1,
      baseSizeId: null,
      basePos: { col: 0, row: 0 },
      fixedRight: 0,
      fixedBottom: 0,
      lastDeltaCols: 0,
      lastDeltaRows: 0,
      raf: 0,
      pending: null,
      last: null
    });
    const [resizePreview, setResizePreview] = useState(null);

    // Snap feedback: короткая подсветка при смене sizeId во время drag-resize
    const [isResizeSnap, setIsResizeSnap] = useState(false);
    const snapTimerRef = useRef(0);

    // DnD-хэндлеры — работают только в режиме редактирования
    const handlePointerDown = useCallback((e) => {
      if (!isEditMode) return;
      if (resizeDragRef.current?.active) return;
      const t = e?.target;
      if (t && typeof t.closest === 'function') {
        if (t.closest('.widget__resize-handle') || t.closest('.widget__size-badge')) return;
      }
      HEYS.Widgets.dnd?.handlePointerDown?.(widget.id, e, elementRef.current);
    }, [isEditMode, widget.id]);

    const handlePointerMove = useCallback((e) => {
      if (!isEditMode) return;
      if (resizeDragRef.current?.active) return;
      HEYS.Widgets.dnd?.handlePointerMove?.(e);
    }, [isEditMode]);

    const handlePointerUp = useCallback((e) => {
      if (!isEditMode) return;
      if (resizeDragRef.current?.active) return;
      HEYS.Widgets.dnd?.handlePointerUp?.(widget.id, e);
    }, [isEditMode, widget.id]);

    const handleClick = useCallback(() => {
      if (!isEditMode) {
        HEYS.Widgets.emit('widget:click', { widget });
      }
    }, [isEditMode, widget]);

    const handleRemoveClick = useCallback((e) => {
      e.stopPropagation();
      onRemove?.(widget.id);
    }, [widget.id, onRemove]);

    const handleSettingsClick = useCallback((e) => {
      e.stopPropagation();
      onSettings?.(widget);
    }, [widget, onSettings]);

    const availableSizes = useMemo(() => {
      const typeDef = widgetType;
      if (typeDef?.availableSizes && typeDef.availableSizes.length) return typeDef.availableSizes;
      return [typeDef?.defaultSize || widget.size || '2x2'];
    }, [widgetType, widget.size]);

    const currentSizeLabel = useMemo(() => {
      const s = HEYS.Widgets.registry?.getSize?.(widget.size);
      return s?.label || widget.size;
    }, [widget.size]);

    const getGridCols = useCallback(() => {
      try {
        const grid = document.querySelector('.widgets-grid');
        if (!grid) return 4;
        const cs = window.getComputedStyle(grid);
        const v = parseInt(cs.getPropertyValue('--widget-grid-columns'), 10);
        return Number.isFinite(v) && v > 0 ? v : 4;
      } catch (e) {
        return 4;
      }
    }, []);

    const pickNearestSize = useCallback((targetCols, targetRows, deltaCols = 0, deltaRows = 0) => {
      // CRITICAL: Получаем актуальные cols/rows из registry по sizeId
      const currentSizeId = widget.size || '2x2';
      const currentSizeInfo = HEYS.Widgets.registry?.getSize?.(currentSizeId);
      const currentCols = currentSizeInfo?.cols || widget.cols || 1;
      const currentRows = currentSizeInfo?.rows || widget.rows || 1;

      // CRITICAL: Если нет движения — возвращаем текущий размер (не меняем)
      if (deltaCols === 0 && deltaRows === 0) {
        return { sizeId: currentSizeId, cols: currentCols, rows: currentRows };
      }

      const sizes = (availableSizes && availableSizes.length) ? availableSizes : [currentSizeId];
      const reg = HEYS.Widgets.registry;
      const preferBigger = (deltaCols + deltaRows) >= 0;

      if (widgetsDebugEnabled() && widgetsOnce(`resize:pickNearestSize:${widget.type}`)) {
        trackWidgetIssue('widgets_resize_pickNearestSize', {
          type: widget.type,
          targetCols,
          targetRows,
          deltaCols,
          deltaRows,
          preferBigger,
          availableSizes: sizes
        });
      }

      let best = null;
      for (const sizeId of sizes) {
        const s = reg?.getSize?.(sizeId);
        const cols = s?.cols || 1;
        const rows = s?.rows || 1;
        const dist = Math.abs(cols - targetCols) + Math.abs(rows - targetRows);
        const area = cols * rows;

        if (!best) {
          best = { sizeId, cols, rows, dist, area };
          continue;
        }

        if (dist < best.dist) {
          best = { sizeId, cols, rows, dist, area };
          continue;
        }

        if (dist === best.dist) {
          // tie-break: при увеличении — предпочитаем больший area, при уменьшении — меньший
          if (preferBigger && area > best.area) {
            best = { sizeId, cols, rows, dist, area };
          } else if (!preferBigger && area < best.area) {
            best = { sizeId, cols, rows, dist, area };
          }
        }
      }

      // Fallback: вернуть текущий размер
      return best || { sizeId: currentSizeId, cols: currentCols, rows: currentRows };
    }, [availableSizes, widget.size]);

    const updateResizePreview = useCallback((next) => {
      const ref = resizeDragRef.current;

      const prevSizeId = ref.last?.sizeId || null;
      const nextSizeId = next?.sizeId || null;

      ref.last = next;
      ref.pending = next;

      // Если снапнули на другой размер — даём лёгкий визуальный “щелчок”
      if (nextSizeId && prevSizeId && nextSizeId !== prevSizeId) {
        setIsResizeSnap(true);
        if (snapTimerRef.current) {
          clearTimeout(snapTimerRef.current);
          snapTimerRef.current = 0;
        }
        snapTimerRef.current = setTimeout(() => {
          setIsResizeSnap(false);
          snapTimerRef.current = 0;
        }, 140);
      }

      if (ref.raf) return;
      ref.raf = requestAnimationFrame(() => {
        ref.raf = 0;
        if (!ref.pending) return;
        setResizePreview(ref.pending);
        ref.pending = null;
      });
    }, []);

    const endResizeDrag = useCallback((reason = 'up') => {
      const ref = resizeDragRef.current;

      // КРИТИЧНО: Проверяем ref.active ПЕРЕД сбросом флага!
      if (!ref.active) return;

      // Сбрасываем ref.active СРАЗУ чтобы повторные вызовы игнорились
      ref.active = false;

      // И только теперь сбрасываем глобальный флаг resize + очищаем safety timeout
      try {
        if (HEYS.Widgets.dnd) {
          HEYS.Widgets.dnd._resizeActive = false;
          if (HEYS.Widgets.dnd._resizeTimeout) {
            clearTimeout(HEYS.Widgets.dnd._resizeTimeout);
            HEYS.Widgets.dnd._resizeTimeout = null;
          }
        }
      } catch (err) { /* ignore */ }
      ref.startedAt = null; // Сбрасываем timestamp для следующего resize

      // Коммитим только если реально выбран другой размер
      const finalSizeId = ref.last?.sizeId || resizePreview?.sizeId || null;
      const finalPos = ref.last?.position || resizePreview?.position || widget.position || null;
      const baseSizeId = ref.baseSizeId;
      const basePos = ref.basePos || widget.position || { col: 0, row: 0 };
      setResizePreview(null);

      // Cleanup raf
      if (ref.raf) {
        cancelAnimationFrame(ref.raf);
        ref.raf = 0;
      }

      // Cleanup snap timer/state
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = 0;
      }
      setIsResizeSnap(false);

      ref.pending = null;
      ref.last = null;

      const posChanged = !!finalPos && (finalPos.col !== basePos.col || finalPos.row !== basePos.row);

      if (HEYS.debug) {
        console.log(`[endResizeDrag] finalSizeId=${finalSizeId}, baseSizeId=${baseSizeId}, posChanged=${posChanged}, finalPos=`, finalPos);
      }

      if (finalSizeId && (finalSizeId !== baseSizeId || posChanged)) {
        if (HEYS.debug) {
          console.log(`[endResizeDrag] Calling resizeWidgetAt(${widget.id}, ${finalSizeId}, ...)`, finalPos);
        }
        const st = HEYS.Widgets.state;
        if (typeof st?.resizeWidgetAt === 'function') {
          st.resizeWidgetAt(widget.id, finalSizeId, finalPos);
        } else {
          // Fallback (на всякий случай): может дать 2 действия в history
          if (posChanged) st?.moveWidget?.(widget.id, finalPos);
          if (finalSizeId !== baseSizeId) st?.resizeWidget?.(widget.id, finalSizeId);
        }
      }
    }, [resizePreview, widget.id, widget.position]);

    // Универсальный хелпер для получения координат из event (pointer/touch/mouse)
    const getEventCoords = useCallback((e) => {
      // TouchEvent
      if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      }
      // PointerEvent / MouseEvent
      return { clientX: e.clientX || 0, clientY: e.clientY || 0 };
    }, []);

    // Стартует resize drag (вызывается из onPointerDown или onTouchStart)
    const startResizeDrag = useCallback((direction, e, isTouchEvent = false) => {
      if (!isEditMode) return;

      const ref = resizeDragRef.current;
      const now = Date.now();

      // Защита от двойного вызова (pointerdown + touchstart на одно касание)
      if (ref?.startedAt && now - ref.startedAt < 100) return;

      // Защита от повторного запуска resize пока предыдущий активен
      if (ref?.active) return;

      e.stopPropagation();
      if (!isTouchEvent) e.preventDefault();

      // КРИТИЧНО: Устанавливаем ref.active СРАЗУ после проверок
      ref.active = true;
      ref.startedAt = now;

      // CRITICAL: Устанавливаем глобальный флаг чтобы DnD не перехватывал события
      try {
        if (HEYS.Widgets.dnd) {
          HEYS.Widgets.dnd._resizeActive = true;

          // Safety timeout: сбросить флаг через 5 секунд если resize завис
          if (HEYS.Widgets.dnd._resizeTimeout) {
            clearTimeout(HEYS.Widgets.dnd._resizeTimeout);
          }
          HEYS.Widgets.dnd._resizeTimeout = setTimeout(() => {
            if (HEYS.Widgets.dnd?._resizeActive) {
              console.log('[Widgets UI] Safety timeout: resetting _resizeActive');
              HEYS.Widgets.dnd._resizeActive = false;
            }
          }, 5000);
        }
        // Отменяем DnD если он уже начался
        if (HEYS.Widgets.dnd?.isDragging?.()) {
          HEYS.Widgets.dnd?.cancel?.();
        }
      } catch (err) {
        // ignore
      }

      const gridCols = getGridCols();
      const metrics = HEYS.Widgets.gridEngine?.getCellMetrics?.() || { cellWidth: 150, cellHeight: 76, gap: 12 };
      const unitX = (metrics.cellWidth || 150) + (metrics.gap || 12);
      const unitY = (metrics.cellHeight || 76) + (metrics.gap || 12);

      const { clientX, clientY } = getEventCoords(e);

      // CRITICAL: Получаем cols/rows из registry по текущему sizeId,
      // т.к. widget.cols/rows могут быть устаревшими (не обновлёнными после resize)
      const currentSizeId = widget.size || '2x2';
      const sizeInfo = HEYS.Widgets.registry?.getSize?.(currentSizeId);
      const currentCols = sizeInfo?.cols || widget.cols || 1;
      const currentRows = sizeInfo?.rows || widget.rows || 1;

      // ref.active и ref.startedAt уже установлены выше
      ref.pointerId = isTouchEvent ? 'touch' : (e.pointerId ?? null);
      ref.isTouchBased = isTouchEvent;
      ref.direction = direction;
      ref.startX = clientX;
      ref.startY = clientY;
      ref.baseCols = currentCols;
      ref.baseRows = currentRows;
      ref.baseSizeId = widget.size || '2x2';
      ref.basePos = {
        col: Number.isFinite(widget?.position?.col) ? widget.position.col : 0,
        row: Number.isFinite(widget?.position?.row) ? widget.position.row : 0
      };
      ref.fixedRight = ref.basePos.col + ref.baseCols;
      ref.fixedBottom = ref.basePos.row + ref.baseRows;
      ref.lastDeltaCols = 0;
      ref.lastDeltaRows = 0;

      // Pointer capture только для pointer events (не touch)
      if (!isTouchEvent && e.pointerId != null) {
        try {
          e.currentTarget?.setPointerCapture?.(e.pointerId);
        } catch (err) {
          // ignore
        }
      }

      // CRITICAL FIX: Для touch events добавляем document listeners СРАЗУ с capture: true
      // (не ждём useEffect — React слишком медленный, touch уже закончится)
      if (isTouchEvent) {
        // Сначала удаляем старые listeners если есть (защита от утечки)
        if (ref.touchMoveHandler) {
          document.removeEventListener('touchmove', ref.touchMoveHandler, { capture: true });
          document.removeEventListener('touchend', ref.touchEndHandler, { capture: true });
          document.removeEventListener('touchcancel', ref.touchEndHandler, { capture: true });
        }

        // Сохраняем handlers в ref для возможности cleanup
        ref.touchMoveHandler = (te) => {
          if (!ref.active) return;
          if (te.cancelable) te.preventDefault();
          te.stopPropagation(); // Не даём другим handlers перехватить

          const touch = te.touches[0];
          if (!touch) return;

          const dx = touch.clientX - ref.startX;
          const dy = touch.clientY - ref.startY;

          const rawDeltaCols = Math.round(dx / unitX);
          const rawDeltaRows = Math.round(dy / unitY);

          const dir = String(ref.direction || '');
          const isW = dir.includes('w');
          const isE = dir.includes('e');
          const isN = dir.includes('n');
          const isS = dir.includes('s');
          const intentDeltaCols = isW ? -rawDeltaCols : (isE ? rawDeltaCols : 0);
          const intentDeltaRows = isN ? -rawDeltaRows : (isS ? rawDeltaRows : 0);

          if (intentDeltaCols === ref.lastDeltaCols && intentDeltaRows === ref.lastDeltaRows) return;
          ref.lastDeltaCols = intentDeltaCols;
          ref.lastDeltaRows = intentDeltaRows;

          const targetCols = Math.max(1, Math.min(ref.baseCols + intentDeltaCols, gridCols));
          const targetRows = Math.max(1, ref.baseRows + intentDeltaRows);

          const nearest = pickNearestSize(targetCols, targetRows, intentDeltaCols, intentDeltaRows);
          const cols = Math.max(1, Math.min(nearest.cols, gridCols));
          const rows = Math.max(1, nearest.rows);

          let col = ref.basePos.col;
          let row = ref.basePos.row;
          if (isW) col = ref.fixedRight - cols;
          if (isN) row = ref.fixedBottom - rows;
          col = Math.max(0, col);
          if (col + cols > gridCols) col = Math.max(0, gridCols - cols);
          row = Math.max(0, row);

          updateResizePreview({
            active: true,
            direction: ref.direction,
            sizeId: nearest.sizeId,
            cols,
            rows,
            position: { col, row },
            unitX,
            unitY,
            gridCols,
            overflowRight: (col + cols > gridCols)
          });
        };

        ref.touchEndHandler = () => {
          // НЕ сбрасываем ref.active здесь! endResizeDrag сам сбросит
          // ref.active = false; // УБРАНО - вызывало race condition
          ref.startedAt = null; // Сбрасываем timestamp
          if (ref.touchMoveHandler) {
            // CRITICAL: удаляем с теми же options что и добавляли (capture: true)
            document.removeEventListener('touchmove', ref.touchMoveHandler, { capture: true });
            document.removeEventListener('touchend', ref.touchEndHandler, { capture: true });
            document.removeEventListener('touchcancel', ref.touchEndHandler, { capture: true });
            ref.touchMoveHandler = null;
            ref.touchEndHandler = null;
          }
          endResizeDrag('touchend');
        };

        // CRITICAL: capture: true гарантирует получение событий ДО любой отмены
        document.addEventListener('touchmove', ref.touchMoveHandler, { passive: false, capture: true });
        document.addEventListener('touchend', ref.touchEndHandler, { passive: true, capture: true });
        document.addEventListener('touchcancel', ref.touchEndHandler, { passive: true, capture: true });
      }

      const initial = pickNearestSize(ref.baseCols, ref.baseRows, 0, 0);
      updateResizePreview({
        active: true,
        direction,
        sizeId: initial.sizeId,
        cols: Math.max(1, Math.min(initial.cols, gridCols)),
        rows: Math.max(1, initial.rows),
        position: { ...ref.basePos },
        unitX,
        unitY,
        gridCols
      });
    }, [endResizeDrag, getEventCoords, getGridCols, isEditMode, pickNearestSize, updateResizePreview, widget.cols, widget.rows, widget.size, widget?.position?.col, widget?.position?.row]);

    // Pointer down handler (для desktop, НЕ для touch devices)
    const handleResizeHandlePointerDown = useCallback((direction, e) => {
      // CRITICAL: На touch devices НЕ обрабатываем pointerdown — используем native touchstart
      // pointerdown на touch срабатывает но pointerup может не сработать корректно
      if (e.pointerType === 'touch') {
        e.stopPropagation();
        return; // Native touchstart handler обработает
      }

      // CRITICAL: stop propagation чтобы widget card handlePointerDown НЕ вызвал dnd._prepareForDrag
      e.stopPropagation();
      e.preventDefault();
      startResizeDrag(direction, e, false);
    }, [startResizeDrag]);

    // Touch start handler (для iOS Safari и PWA) — вызывается из native listener
    const handleResizeHandleTouchStart = useCallback((direction, e) => {
      // preventDefault через native listener уже вызван
      startResizeDrag(direction, e, true);
    }, [startResizeDrag]);

    // Native touch listeners для resize handles (с { passive: false } чтобы preventDefault работал)
    useEffect(() => {
      if (!isEditMode) return;

      const handles = [
        { ref: handleNRef, dir: 'n' },
        { ref: handleERef, dir: 'e' },
        { ref: handleSRef, dir: 's' },
        { ref: handleWRef, dir: 'w' },
        { ref: handleNWRef, dir: 'nw' },
        { ref: handleNERef, dir: 'ne' },
        { ref: handleSWRef, dir: 'sw' },
        { ref: handleSERef, dir: 'se' }
      ];

      const touchStartHandlers = handles.map(({ ref, dir }) => {
        const handler = (e) => {
          e.preventDefault(); // Теперь работает!
          e.stopPropagation();
          handleResizeHandleTouchStart(dir, e);
        };

        if (ref.current) {
          ref.current.addEventListener('touchstart', handler, { passive: false });
        }
        return { ref, handler };
      });

      return () => {
        touchStartHandlers.forEach(({ ref, handler }) => {
          if (ref.current) {
            ref.current.removeEventListener('touchstart', handler);
          }
        });
      };
    }, [isEditMode, handleResizeHandleTouchStart]);

    // Ключевое: используем resizePreview?.active как триггер для useEffect
    // (ref.active не триггерит ререндер, а state — да)
    const isResizeDragActive = resizePreview?.active === true;

    useEffect(() => {
      if (!isResizeDragActive) return;
      const ref = resizeDragRef.current;

      // Универсальный обработчик движения (pointer и touch)
      const onMove = (e) => {
        if (!ref.active) return;

        // CRITICAL: preventDefault чтобы iOS не скроллил страницу
        if (e.cancelable) e.preventDefault();

        // Проверяем pointerId только для pointer events
        if (!ref.isTouchBased && ref.pointerId != null && e.pointerId != null && e.pointerId !== ref.pointerId) return;

        const gridCols = getGridCols();
        const metrics = HEYS.Widgets.gridEngine?.getCellMetrics?.() || { cellWidth: 150, cellHeight: 76, gap: 12 };
        const unitX = (metrics.cellWidth || 150) + (metrics.gap || 12);
        const unitY = (metrics.cellHeight || 76) + (metrics.gap || 12);

        // Получаем координаты в зависимости от типа события
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX || 0;
          clientY = e.clientY || 0;
        }

        const dx = clientX - ref.startX;
        const dy = clientY - ref.startY;

        const rawDeltaCols = Math.round(dx / unitX);
        const rawDeltaRows = Math.round(dy / unitY);

        // Для левого/верхнего хендла инвертируем направление:
        // - drag left/up = увеличение, drag right/down = уменьшение
        const dir = String(ref.direction || '');
        const isW = dir.includes('w');
        const isE = dir.includes('e');
        const isN = dir.includes('n');
        const isS = dir.includes('s');
        const intentDeltaCols = isW ? -rawDeltaCols : (isE ? rawDeltaCols : 0);
        const intentDeltaRows = isN ? -rawDeltaRows : (isS ? rawDeltaRows : 0);

        // micro-оптимизация: не пересчитываем пока не изменились снап-делты
        if (intentDeltaCols === ref.lastDeltaCols && intentDeltaRows === ref.lastDeltaRows) return;
        ref.lastDeltaCols = intentDeltaCols;
        ref.lastDeltaRows = intentDeltaRows;

        const targetCols = Math.max(1, Math.min(ref.baseCols + intentDeltaCols, gridCols));
        const targetRows = Math.max(1, ref.baseRows + intentDeltaRows);

        const nearest = pickNearestSize(targetCols, targetRows, intentDeltaCols, intentDeltaRows);
        const cols = Math.max(1, Math.min(nearest.cols, gridCols));
        const rows = Math.max(1, nearest.rows);

        // Позиция зависит от направления (якорим противоположную грань)
        let col = ref.basePos.col;
        let row = ref.basePos.row;

        if (isW) {
          col = ref.fixedRight - cols;
        }
        if (isN) {
          row = ref.fixedBottom - rows;
        }

        // clamp по границам грида
        col = Math.max(0, col);
        if (col + cols > gridCols) {
          col = Math.max(0, gridCols - cols);
        }
        row = Math.max(0, row);

        updateResizePreview({
          active: true,
          direction: ref.direction,
          sizeId: nearest.sizeId,
          cols,
          rows,
          position: { col, row },
          unitX,
          unitY,
          gridCols,
          overflowRight: (col + cols > gridCols)
        });
      };

      const onUp = () => endResizeDrag('up');
      const onCancel = () => endResizeDrag('cancel');

      // Pointer events
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onCancel, { passive: true });

      // Touch events (fallback для iOS Safari / PWA)
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp, { passive: true });
      window.addEventListener('touchcancel', onCancel, { passive: true });

      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('touchcancel', onCancel);
      };
    }, [isResizeDragActive, endResizeDrag, getGridCols, pickNearestSize, updateResizePreview, widget?.position?.col]);

    const isResizing = !!resizePreview?.active;
    const previewCols = isResizing ? (resizePreview?.cols || widget.cols) : widget.cols;
    const previewRows = isResizing ? (resizePreview?.rows || widget.rows) : widget.rows;
    const previewSizeId = isResizing ? (resizePreview?.sizeId || widget.size) : widget.size;
    const previewPosition = isResizing ? (resizePreview?.position || widget.position) : widget.position;
    const effectiveWidget = useMemo(() => {
      if (!isResizing) return widget;
      return {
        ...widget,
        size: previewSizeId,
        cols: previewCols,
        rows: previewRows,
        position: previewPosition
      };
    }, [isResizing, previewCols, previewRows, previewPosition, previewSizeId, widget]);

    const sizeClass = `widget--${effectiveWidget.size}`;
    const typeClass = `widget--${effectiveWidget.type}`;
    const isMini = effectiveWidget?.size === '1x1';
    const previewLabel = useMemo(() => {
      const s = HEYS.Widgets.registry?.getSize?.(previewSizeId);
      return s?.label || previewSizeId;
    }, [previewSizeId]);

    // Важно: Core хранит позицию в grid-координатах (col/row),
    // а CSS Grid по умолчанию раскладывает элементы по DOM-порядку.
    // Поэтому для реального reorder нужно явно задавать start линии.
    const gridCol = effectiveWidget?.position?.col;
    const gridRow = effectiveWidget?.position?.row;
    const hasGridPos = Number.isFinite(gridCol) && Number.isFinite(gridRow);

    return React.createElement('div', {
      ref: elementRef,
      className: `widget ${sizeClass} ${typeClass} ${isEditMode ? 'widget--editing' : ''} ${isResizing ? 'widget--resizing' : ''} ${isResizing && isResizeSnap ? 'widget--resize-snap' : ''}`,
      'data-widget-id': widget.id,
      'data-widget-type': widget.type,
      style: {
        // 1-based линии в CSS Grid
        gridColumn: hasGridPos ? `${gridCol + 1} / span ${previewCols}` : `span ${previewCols}`,
        gridRow: hasGridPos ? `${gridRow + 1} / span ${previewRows}` : `span ${previewRows}`,
        // В edit-mode отключаем touchAction чтобы браузер не перехватывал жест для scroll
        touchAction: (isEditMode || isResizing) ? 'none' : 'pan-y',
        zIndex: isResizing ? 60 : undefined
      },
      onClick: handleClick,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    },


      // Widget Content (placeholder - будет заменён конкретными виджетами)
      // В edit-mode блокируем pointer-события на контенте: DnD/resize обрабатывает карточка
      React.createElement('div', {
        className: 'widget__content',
        style: isEditMode ? { pointerEvents: 'none' } : undefined
      },
        React.createElement(WidgetContent, { widget: effectiveWidget, widgetType })
      ),

      // Edit mode: компактный бейдж размера (не перекрывает контент)
      isEditMode && React.createElement('div', {
        id: index === 0 ? 'tour-widgets-size' : undefined,
        className: `widget__size-badge ${isResizing ? 'widget__size-badge--active' : ''}`,
        title: `Размер: ${previewLabel} (${previewCols}×${previewRows})${resizePreview?.overflowRight ? ' — может не поместиться справа' : ''}`,
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onPointerMove: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation()
      },
        `${previewCols}×${previewRows}`,
        !!resizePreview?.overflowRight && React.createElement('span', { className: 'widget__size-badge-warn' }, '↔')
      ),

      // Edit Mode: Delete button
      isEditMode && React.createElement('button', {
        id: index === 0 ? 'tour-widgets-delete' : undefined,
        className: 'widget__delete-btn',
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onPointerMove: (e) => e.stopPropagation(),
        onClick: handleRemoveClick,
        title: 'Удалить'
      }, '✕'),

      // Edit Mode: Settings button (optional)
      isEditMode && widgetType?.settings && React.createElement('button', {
        id: index === 0 ? 'tour-widgets-settings' : undefined,
        className: 'widget__settings-btn',
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onPointerMove: (e) => e.stopPropagation(),
        onClick: handleSettingsClick,
        title: 'Настройки'
      }, '⚙️')

      ,

      // Edit Mode: Resize handle (drag-resize)
      isEditMode && React.createElement(React.Fragment, null,
        React.createElement('button', {
          ref: handleNRef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--n ${isResizing && resizePreview?.direction === 'n' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('n', e),
          // onTouchStart заменён на native listener в useEffect
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить высоту: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить высоту: потяни. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          ref: handleERef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--e ${isResizing && resizePreview?.direction === 'e' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('e', e),
          // onTouchStart заменён на native listener в useEffect
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить ширину: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить ширину: потяни. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          ref: handleSRef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--s ${isResizing && resizePreview?.direction === 's' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('s', e),
          // onTouchStart заменён на native listener в useEffect
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить высоту: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить высоту: потяни. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          ref: handleWRef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--w ${isResizing && resizePreview?.direction === 'w' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('w', e),
          // onTouchStart заменён на native listener в useEffect
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить ширину: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить ширину: потяни. Сейчас: ${currentSizeLabel}`
        }),

        // Диагональные (угловые) хендлы
        React.createElement('button', {
          ref: handleNWRef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--nw ${isResizing && resizePreview?.direction === 'nw' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('nw', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить размер: потяни за угол (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить размер: потяни за угол. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          ref: handleNERef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--ne ${isResizing && resizePreview?.direction === 'ne' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('ne', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить размер: потяни за угол (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить размер: потяни за угол. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          ref: handleSWRef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--sw ${isResizing && resizePreview?.direction === 'sw' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('sw', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить размер: потяни за угол (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить размер: потяни за угол. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          ref: handleSERef,
          type: 'button',
          className: `widget__resize-handle widget__resize-handle--se ${isResizing && resizePreview?.direction === 'se' ? 'widget__resize-handle--active' : ''}`,
          onPointerDown: (e) => handleResizeHandlePointerDown('se', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить размер: потяни за угол (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить размер: потяни за угол. Сейчас: ${currentSizeLabel}`
        })
      )
    );
  }); // end React.memo(WidgetCard)

  // === Widget Content Component (renders actual widget data) ===
  function WidgetContent({ widget, widgetType }) {
    // State для данных виджета
    const [data, setData] = useState(() =>
      HEYS.Widgets.data?.getDataForWidget?.(widget) || {}
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Ref: когда поставили оптимистичное обновление воды, блокируем loadData до этого времени
    const skipLoadUntilRef = useRef(0);

    // Подписка на обновления данных
    useEffect(() => {
      // Первоначальная загрузка
      const loadData = () => {
        // Пропускаем перезагрузку если недавно было оптимистичное обновление воды (чтобы не мигало)
        if (widget.type === 'water' && Date.now() < skipLoadUntilRef.current) return;
        try {
          const newData = HEYS.Widgets.data?.getDataForWidget?.(widget) || {};
          // Умное обновление: если данные не изменились — возвращаем прежний объект.
          // Это предотвращает ре-рендер CaloriesWidgetContent и перезапуск CSS animation кольца.
          setData(prev => {
            const prevKeys = Object.keys(prev);
            const newKeys = Object.keys(newData);
            if (prevKeys.length === newKeys.length &&
              prevKeys.every(k => prev[k] === newData[k])) return prev;
            return newData;
          });
          setError(null);
        } catch (e) {
          trackWidgetIssue('widgets_loadData_failed', {
            widgetType: widget?.type,
            widgetId: widget?.id,
            message: e?.message
          });
          setError(e.message);
        }
        setLoading(false);
      };

      loadData();

      // Подписка на события обновления данных
      const unsubData = HEYS.Widgets.on?.('data:updated', loadData);

      // Подписка на глобальные события HEYS (water:added НЕ включаем — обрабатывается оптимистично через heysWaterAdded DOM event)
      const heysEvents = ['day:updated', 'meal:added', 'profile:updated'];
      heysEvents.forEach(evt => {
        if (typeof HEYS.events?.on === 'function') {
          HEYS.events.on(evt, loadData);
        }
      });

      // 🆕 Оптимистичное обновление для виджета воды
      // Слушаем DOM событие heysWaterAdded которое содержит актуальные данные (total)
      // Это решает проблему debounce 500ms в useDayAutosave
      const handleWaterAdded = (e) => {
        if (widget.type !== 'water') return;
        const { total } = e.detail || {};
        if (typeof total === 'number') {
          // Блокируем loadData на 1 сек, чтобы не перетёр оптимистичное значение
          skipLoadUntilRef.current = Date.now() + 1000;
          // Оптимистично обновляем данные с актуальным total
          setData(prev => ({
            ...prev,
            drunk: total,
            pct: prev.target > 0 ? Math.round((total / prev.target) * 100) : 0
          }));
        }
      };
      window.addEventListener('heysWaterAdded', handleWaterAdded);

      return () => {
        unsubData?.();
        heysEvents.forEach(evt => {
          if (typeof HEYS.events?.off === 'function') {
            HEYS.events.off(evt, loadData);
          }
        });
        window.removeEventListener('heysWaterAdded', handleWaterAdded);
      };
    }, [widget.id, widget.type]);

    // Loading state
    if (loading) {
      return React.createElement('div', { className: 'widget__loading' },
        React.createElement('div', { className: 'widget__spinner' })
      );
    }

    // Error state
    if (error) {
      return React.createElement('div', { className: 'widget__error' },
        '⚠️ Ошибка загрузки'
      );
    }

    // Render based on widget type
    switch (widget.type) {
      case 'status':
        return React.createElement(StatusWidgetContent, { widget, data });
      case 'calories':
        return React.createElement(CaloriesWidgetContent, { widget, data });
      case 'water':
        return React.createElement(WaterWidgetContent, { widget, data });
      case 'sleep':
        return React.createElement(SleepWidgetContent, { widget, data });
      case 'streak':
        return React.createElement(StreakWidgetContent, { widget, data });
      case 'weight':
        return React.createElement(WeightWidgetContent, { widget, data });
      case 'steps':
        return React.createElement(StepsWidgetContent, { widget, data });
      case 'macros':
        return React.createElement(MacrosWidgetContent, { widget, data });
      case 'insulin':
        return React.createElement(InsulinWidgetContent, { widget, data });
      case 'heatmap':
        return React.createElement(HeatmapWidgetContent, { widget, data });
      case 'cycle':
        return React.createElement(CycleWidgetContent, { widget, data });
      case 'crashRisk':
        return React.createElement(CrashRiskWidgetContent, { widget, data });
      default:
        return React.createElement('div', { className: 'widget__placeholder' },
          widgetType?.icon || '📊',
          React.createElement('span', null, 'Нет данных')
        );
    }
  }

  // === Individual Widget Content Components ===

  // === Status Widget Content (Статус 0-100) ===
  function StatusWidgetContent({ widget, data }) {
    const d = getWidgetDims(widget);

    // Используем HEYS.Status.StatusWidget если доступен
    if (HEYS.Status?.StatusWidget) {
      // Передаём status из data или вычисляем
      const status = data.status || HEYS.Status?.calculateStatus?.({
        dayData: data.dayData || {},
        profile: data.profile || {},
        dayTot: data.dayTot || {},
        normAbs: data.normAbs || {},
        waterGoal: data.waterGoal || 2000
      });

      if (status) {
        return React.createElement(HEYS.Status.StatusWidget, {
          status,
          size: d.isMicro ? 'micro' : d.isTiny ? 'tiny' : 'standard',
          showActions: widget.settings?.showActions !== false,
          showIssues: widget.settings?.showIssues !== false
        });
      }
    }

    // Fallback если модуль не загружен
    const score = data.status?.score ?? data.score ?? 0;
    const level = data.status?.level ?? 'okay';

    const getColor = () => {
      if (score >= 85) return '#10b981'; // excellent
      if (score >= 70) return '#22c55e'; // good
      if (score >= 50) return '#eab308'; // okay
      if (score >= 30) return '#f97316'; // low
      return '#ef4444'; // critical
    };

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-status widget-status--micro' },
        React.createElement('div', { className: 'widget-status__score', style: { color: getColor() } }, Math.round(score))
      );
    }

    // Standard
    return React.createElement('div', { className: 'widget-status widget-status--standard' },
      React.createElement('div', { className: 'widget-status__score-big', style: { color: getColor() } }, Math.round(score)),
      React.createElement('div', { className: 'widget-status__label' }, 'из 100')
    );
  }

  // Module-level Set: tracks which widget IDs have already played the entry animation
  // this session. On re-mount (caused by widget reinit/cascade), we skip back to
  // the real value immediately instead of re-animating from 0.
  if (!window._calRingAnimated) window._calRingAnimated = new Set();
  const _calRingAnimated = window._calRingAnimated;

  function CaloriesWidgetContent({ widget, data }) {
    const eaten = data.eaten || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((eaten / target) * 100) : 0;
    const remaining = Math.max(0, target - eaten);
    const burned = data.burned || 0; // Тренировки
    const deficit = data.deficit || 0; // Дефицит
    const formatKcal = (value) => Math.round(Number(value) || 0).toLocaleString('ru-RU');

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : d.isTall ? 'tall' : 'std';

    const getColor = () => {
      if (pct < 50) return 'var(--heys-ratio-crash)';
      if (pct < 75) return 'var(--heys-ratio-low)';
      if (pct < 110) return 'var(--heys-ratio-good)';
      return 'var(--heys-ratio-over)';
    };

    // Hoist ring calculations to top level so hooks can reference them
    // (React: hooks must run unconditionally, before any early returns)
    const _ringRatio = target > 0 ? eaten / target : 0;
    const _ringCapComp = 5;
    const _basePct = Math.max(0, Math.min(100, Math.round(_ringRatio * 100)) - _ringCapComp);
    const _hasOver = _ringRatio > 1;
    const _overPct = _hasOver ? Math.max(0, Math.min(50, Math.round((_ringRatio - 1) * 100)) - _ringCapComp) : 0;

    // JS-driven ring animation: only animate from 0 on the TRUE first mount this session.
    // On subsequent mounts (widget system reinit/cascade), skip straight to the real value
    // so the transition doesn't replay. CSS transition still fires when eaten changes.
    const _widgetKey = `cal-ring-${widget?.id || '0'}`;
    const _alreadyAnimated = _calRingAnimated.has(_widgetKey);
    const [displayBasePct, setDisplayBasePct] = React.useState(_alreadyAnimated ? _basePct : 0);
    const [displayOverPct, setDisplayOverPct] = React.useState(_alreadyAnimated ? _overPct : 0);
    const _ringMounted = React.useRef(_alreadyAnimated);

    React.useEffect(() => {
      if (_alreadyAnimated) return; // already animated: skip rAF, start at real value
      // First true mount: rAF ensures the 0 renders first, then transition animates in
      const raf = requestAnimationFrame(() => {
        _calRingAnimated.add(_widgetKey);
        setDisplayBasePct(_basePct);
        setDisplayOverPct(_overPct);
        _ringMounted.current = true;
      });
      return () => cancelAnimationFrame(raf);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
      // Calories actually changed (user logged food): update ring to new value
      if (_ringMounted.current) {
        setDisplayBasePct(_basePct);
        setDisplayOverPct(_overPct);
      }
    }, [eaten]); // eslint-disable-line react-hooks/exhaustive-deps

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-calories widget-calories--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, 'ккал'),
        React.createElement('div', { className: 'widget-calories__value', style: { color: getColor() } }, formatKcal(eaten))
      );
    }

    // 2x2 — Thick volumetric ring layout (pathLength=100, overeat red arc)
    if (size === '2x2') {
      const ringStartOffset = 9;
      const ringCapComp = 5;
      const ratio = target > 0 ? eaten / target : 0;
      const gradientId = `cal-ring-grad-${widget?.id || '0'}`;

      // Time-aware color: compare eaten pace vs expected pace for current time of day
      const getTimeAwareColor = () => {
        const now = new Date();
        const hour = now.getHours() + now.getMinutes() / 60;
        const EATING_START = 7;
        const EATING_END = 22;
        const actualFraction = target > 0 ? eaten / target : 0;
        if (actualFraction >= 1.1) return 'var(--heys-ratio-over)';
        if (hour <= EATING_START) return actualFraction < 0.05 ? 'var(--heys-ratio-good)' : 'var(--heys-ratio-over)';
        const dayProgress = Math.min(1, (hour - EATING_START) / (EATING_END - EATING_START));
        const paceRatio = dayProgress > 0 ? actualFraction / dayProgress : actualFraction;
        if (paceRatio >= 1.05) return 'var(--heys-ratio-over)';
        if (paceRatio >= 0.75) return 'var(--heys-ratio-good)';
        if (paceRatio >= 0.45) return 'var(--heys-ratio-low)';
        return 'var(--heys-ratio-crash)';
      };
      const color = getTimeAwareColor();
      // Gradient colors mapped to time-aware color state
      const getGradientColors = (c) => {
        if (c === 'var(--heys-ratio-good)') return ['#86efac', '#22c55e']; // green
        if (c === 'var(--heys-ratio-over)') return ['#fcd34d', '#f59e0b']; // amber (overeat)
        if (c === 'var(--heys-ratio-low)') return ['#fde68a', '#eab308']; // yellow (low)
        if (c === 'var(--heys-ratio-crash)') return ['#fca5a5', '#ef4444']; // red (crash)
        return ['#ffd166', '#ff9500'];
      };
      const [gradStart, gradEnd] = getGradientColors(color);
      // Font size: shrink for 4+ digit numbers to fit inside ring
      const valueFontSize = eaten >= 10000 ? '18px' : eaten >= 1000 ? '21px' : '26px';
      // Main arc: up to 100%
      const basePctRaw = Math.min(100, Math.round(ratio * 100));
      const basePct = Math.max(0, basePctRaw - ringCapComp);
      // Overeat arc: beyond 100%
      const hasOver = ratio > 1;
      const overPctRaw = hasOver ? Math.min(50, Math.round((ratio - 1) * 100)) : 0;
      const overPct = Math.max(0, overPctRaw - ringCapComp);

      const showPct2x2 = widget.settings?.showPercentage !== false;
      const showRemaining2x2 = widget.settings?.showRemaining !== false;

      return React.createElement('div', { className: 'widget-calories widget-calories--2x2' },
        React.createElement('div', { className: 'widget-calories__ring-wrap' },
          React.createElement('svg', { className: 'widget-calories__ring', viewBox: '0 0 44 44' },
            React.createElement('defs', null,
              React.createElement('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
                React.createElement('stop', { offset: '0%', stopColor: gradStart }),
                React.createElement('stop', { offset: '100%', stopColor: gradEnd })
              )
            ),
            React.createElement('circle', {
              className: 'widget-calories__ring-track', cx: '22', cy: '22', r: '18', pathLength: '100'
            }),
            React.createElement('circle', {
              className: 'widget-calories__ring-fill', cx: '22', cy: '22', r: '18', pathLength: '100',
              style: {
                strokeDasharray: `${displayBasePct} 100`,
                '--ring-dasharray': `${basePct} 100`,
                '--ring-start-offset': -ringStartOffset,
                stroke: `url(#${gradientId})`
              }
            }),
            hasOver ? React.createElement('circle', {
              className: 'widget-calories__ring-fill--over', cx: '22', cy: '22', r: '18', pathLength: '100',
              style: {
                strokeDasharray: `${displayOverPct} ${100 - displayOverPct}`,
                '--over-dasharray': `${overPct} ${100 - overPct}`,
                '--over-offset': -(100 - overPct)
              }
            }) : null
          ),
          React.createElement('div', { className: 'widget-calories__ring-inner' },
            React.createElement('div', { className: 'widget-calories__value--lg', style: { color, fontSize: valueFontSize } }, formatKcal(eaten)),
            React.createElement('div', { className: 'widget-calories__ring-sublabel' },
              showPct2x2 ? `${pct}%` : 'ккал'
            )
          )
        ),
        showRemaining2x2 ? React.createElement('div', { className: 'widget-calories__info-bar' },
          React.createElement('div', { className: 'widget-calories__info-cell' },
            React.createElement('span', { className: 'widget-calories__meta-label' }, 'Цель'),
            React.createElement('span', { className: 'widget-calories__meta-val' }, formatKcal(target))
          ),
          React.createElement('div', { className: 'widget-calories__info-cell' },
            React.createElement('span', { className: 'widget-calories__meta-label' }, remaining > 0 ? 'Ост.' : (hasOver ? 'Пер.' : 'Ок')),
            React.createElement('span', { className: 'widget-calories__meta-val' }, remaining > 0 ? formatKcal(remaining) : (hasOver ? formatKcal(eaten - target) : '✓'))
          )
        ) : null
      );
    }

    // Остальные размеры — стандартный layout
    const showPct = widget.settings?.showPercentage !== false;
    const showRemaining = widget.settings?.showRemaining !== false;
    const showLabel = true;
    const showProgress = !d.isTiny;
    const showRemainingLine = showRemaining && remaining > 0 && d.rows >= 2 && !d.isShort;

    return React.createElement('div', { className: `widget-calories widget-calories--${variant}` },
      React.createElement('div', { className: 'widget-calories__top' },
        React.createElement('div', { className: 'widget-calories__value', style: { color: getColor() } },
          formatKcal(eaten)
        ),
        showPct ? React.createElement('div', { className: 'widget-calories__pct' }, `${pct}%`) : null
      ),
      showLabel
        ? React.createElement('div', { className: 'widget-calories__label' }, `из ${formatKcal(target)} ккал`)
        : null,
      showProgress
        ? React.createElement('div', { className: 'widget-calories__progress' },
          React.createElement('div', {
            className: 'widget-calories__bar',
            style: { width: `${Math.min(100, Math.max(0, pct))}%` }
          })
        )
        : null,
      showRemainingLine
        ? React.createElement('div', { className: 'widget-calories__remaining' }, `Осталось: ${formatKcal(remaining)}`)
        : null
    );
  }

  function WaterWidgetContent({ widget, data }) {

    const drunk = data.drunk || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((drunk / target) * 100) : 0;
    const glasses = Math.floor(drunk / 250);
    const remaining = Math.max(0, target - drunk);

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';

    const getWaterColor = () => {
      if (pct >= 100) return '#22c55e';
      if (pct >= 70) return '#3b82f6';
      if (pct >= 40) return '#eab308';
      return '#ef4444';
    };

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-water widget-water--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '💧'),
        React.createElement('div', { className: 'widget-water__value' },
          widget.settings?.showGlasses ? `${glasses}🥛` : `${drunk}`
        )
      );
    }

    // 2x2 — Оптимальный layout
    if (size === '2x2') {
      const waterColor = getWaterColor();
      return React.createElement('div', { className: 'widget-water widget-water--2x2' },
        // Верх: иконка + значение + процент
        React.createElement('div', { className: 'widget-water__header' },
          React.createElement('div', { className: 'widget-water__icon' }, '💧'),
          React.createElement('div', { className: 'widget-water__main' },
            React.createElement('div', { className: 'widget-water__value widget-water__value--lg' },
              `${drunk}`,
              React.createElement('span', { className: 'widget-water__unit' }, 'мл')
            )
          ),
          React.createElement('div', { className: 'widget-water__pct-badge', style: { background: `${waterColor}20`, color: waterColor } },
            `${pct}%`
          )
        ),
        // Прогресс-бар
        React.createElement('div', { className: 'widget-water__progress' },
          React.createElement('div', {
            className: 'widget-water__bar',
            style: { width: `${Math.min(100, pct)}%`, background: waterColor }
          })
        ),
        // Низ: цель + стаканы + осталось
        React.createElement('div', { className: 'widget-water__footer' },
          React.createElement('div', { className: 'widget-water__meta' },
            React.createElement('span', { className: 'widget-water__glasses' }, `${glasses} 🥛`)
          ),
          remaining > 0 && React.createElement('div', { className: 'widget-water__meta widget-water__meta--muted' },
            `ещё ${remaining} мл`
          )
        )
      );
    }

    // Остальные размеры — стандартный layout
    const showProgress = true;
    const showPctPill = !d.isTiny;

    return React.createElement('div', { className: `widget-water widget-water--${variant}` },
      React.createElement('div', { className: 'widget-water__top' },
        React.createElement('div', { className: 'widget-water__value' },
          widget.settings?.showGlasses ? `${glasses} 🥛` : `${drunk} мл`
        )
      ),
      showProgress
        ? React.createElement('div', { className: 'widget-water__progress' },
          React.createElement('div', {
            className: 'widget-water__bar',
            style: { width: `${Math.min(100, pct)}%` }
          })
        )
        : null,
      showPctPill ? React.createElement('div', { className: 'widget-water__label' }, `${pct}%`) : null
    );
  }

  function SleepWidgetContent({ widget, data }) {
    const hours = data.hours || 0;
    const target = data.target || 8;
    const quality = data.quality;
    const sleepStart = data.sleepStart; // "23:30"
    const sleepEnd = data.sleepEnd; // "07:15"

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';

    const pct = target > 0 ? Math.round((hours / target) * 100) : 0;

    const getSleepColor = () => {
      if (hours >= target) return '#22c55e';
      if (hours >= target - 1) return '#3b82f6';
      if (hours >= target - 2) return '#eab308';
      return '#ef4444';
    };

    const getEmoji = () => {
      if (hours >= target) return '😊';
      if (hours >= target - 1) return '😐';
      return '😴';
    };

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-sleep widget-sleep--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '😴'),
        React.createElement('div', { className: 'widget-sleep__value' }, `${hours.toFixed(1)}ч`)
      );
    }

    // 2x2 — Оптимальный layout
    if (size === '2x2') {
      const sleepColor = getSleepColor();
      return React.createElement('div', { className: 'widget-sleep widget-sleep--2x2' },
        // Верх: emoji + часы + процент
        React.createElement('div', { className: 'widget-sleep__header' },
          React.createElement('div', { className: 'widget-sleep__icon' }, getEmoji()),
          React.createElement('div', { className: 'widget-sleep__main' },
            React.createElement('div', { className: 'widget-sleep__value widget-sleep__value--lg' },
              hours.toFixed(1),
              React.createElement('span', { className: 'widget-sleep__unit' }, 'ч')
            )
          ),
          React.createElement('div', { className: 'widget-sleep__pct-badge', style: { background: `${sleepColor}20`, color: sleepColor } },
            `${pct}%`
          )
        ),
        // Время: заснул → проснулся
        (sleepStart || sleepEnd) && React.createElement('div', { className: 'widget-sleep__times' },
          sleepStart && React.createElement('span', { className: 'widget-sleep__time' }, `🌙 ${sleepStart}`),
          sleepEnd && React.createElement('span', { className: 'widget-sleep__time' }, `☀️ ${sleepEnd}`)
        ),
        // Низ: качество + цель
        React.createElement('div', { className: 'widget-sleep__footer' },
          quality && React.createElement('div', { className: 'widget-sleep__quality-badge' },
            `⭐ ${quality}/10`
          ),
          React.createElement('div', { className: 'widget-sleep__target' },
            `Цель: ${target}ч`
          )
        )
      );
    }

    // Остальные размеры
    const showTarget = widget.settings?.showTarget !== false;
    const showQuality = widget.settings?.showQuality !== false && !!quality && !d.isTiny;

    return React.createElement('div', { className: `widget-sleep widget-sleep--${variant}` },
      React.createElement('div', { className: 'widget-sleep__value' }, `${hours.toFixed(1)}ч ${getEmoji()}`),
      showTarget ? React.createElement('div', { className: 'widget-sleep__label' }, `из ${target}ч`) : null,
      showQuality ? React.createElement('div', { className: 'widget-sleep__quality' }, `Качество: ${quality}/10`) : null
    );
  }

  function StreakWidgetContent({ widget, data }) {
    const current = data.current || 0;
    const max = data.max || 0;
    const weekDays = data.weekDays || []; // [true, true, false, true, true, true, true] — последние 7 дней

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';

    const getStreakColor = () => {
      if (current >= 7) return '#22c55e';
      if (current >= 3) return '#f97316';
      return '#ef4444';
    };

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-streak widget-streak--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '🔥'),
        React.createElement('div', { className: 'widget-streak__value' }, current)
      );
    }

    // 2x2 — Оптимальный layout с мини-heatmap недели
    if (size === '2x2') {
      const streakColor = getStreakColor();
      const isNewRecord = current > 0 && current >= max;

      return React.createElement('div', { className: 'widget-streak widget-streak--2x2' },
        // Верх: огонь + число + дни
        React.createElement('div', { className: 'widget-streak__header' },
          React.createElement('div', { className: 'widget-streak__icon' }, '🔥'),
          React.createElement('div', { className: 'widget-streak__value widget-streak__value--lg', style: { color: streakColor } },
            current
          ),
          React.createElement('div', { className: 'widget-streak__label' }, 'дн подряд')
        ),
        // Мини-heatmap недели (7 точек)
        weekDays.length > 0 && React.createElement('div', { className: 'widget-streak__week' },
          weekDays.slice(-7).map((ok, i) =>
            React.createElement('div', {
              key: i,
              className: `widget-streak__dot widget-streak__dot--${ok ? 'ok' : 'miss'}`
            })
          )
        ),
        // Низ: рекорд или поздравление
        React.createElement('div', { className: 'widget-streak__footer' },
          isNewRecord
            ? React.createElement('div', { className: 'widget-streak__record widget-streak__record--new' }, '🏆 Новый рекорд!')
            : max > 0 && React.createElement('div', { className: 'widget-streak__record' }, `Рекорд: ${max} дн`)
        )
      );
    }

    // Остальные размеры
    const showMax = widget.settings?.showMax !== false && max > current && !d.isTiny;
    const showFlame = widget.settings?.showFlame !== false && current > 0;

    return React.createElement('div', { className: `widget-streak widget-streak--${variant}` },
      React.createElement('div', { className: 'widget-streak__value' },
        showFlame ? '🔥 ' : '',
        current,
        React.createElement('span', { className: 'widget-streak__days' }, ' дн.')
      ),
      showMax ? React.createElement('div', { className: 'widget-streak__max' }, `Рекорд: ${max}`) : null
    );
  }

  /**
   * WeightWidgetContent — Адаптивный виджет веса с системой блоков
   * Блоки заполняют пространство по приоритету
   */
  function WeightWidgetContent({ widget, data }) {
    const current = data.current;
    const goal = data.goal;
    const trend = data.trend;
    const weekChange = data.weekChange;
    const weeksToGoal = data.weeksToGoal;
    const progressPct = data.progressPct;
    const bmi = data.bmi;
    const bmiCategory = data.bmiCategory;
    const sparkline = data.sparkline || [];
    const monthChange = data.monthChange;
    const hasCleanTrend = data.hasCleanTrend;

    const size = widget?.size || '2x2';
    const showGoal = widget.settings?.showGoal !== false;
    const showTrend = widget.settings?.showTrend !== false;

    const hasCurrent = Number.isFinite(current);
    const hasGoal = Number.isFinite(goal) && goal > 0;
    const hasBmi = Number.isFinite(bmi);
    const hasAnalytics = !!monthChange || !!hasCleanTrend;
    const sparklinePoints = sparkline.filter(s => s.weight);
    const hasSparkline = sparklinePoints.length >= 2;

    // Размеры берём из реестра (единый источник правды). Здесь они не нужны для layout-веток,
    // но логика остаётся совместимой: неизвестный size упадёт в fallback-рендер ниже.

    // Цвета тренда
    const getTrendInfo = () => {
      if (!Number.isFinite(trend)) return null;
      if (trend < -0.02) return { cls: 'down', emoji: '↓', label: 'снижается', color: '#22c55e' };
      if (trend > 0.02) return { cls: 'up', emoji: '↑', label: 'растёт', color: '#ef4444' };
      return { cls: 'stable', emoji: '→', label: 'стабилен', color: '#3b82f6' };
    };
    const trendInfo = getTrendInfo();

    // Форматирование weekChange
    const formatWeekChange = () => {
      if (!Number.isFinite(weekChange)) return null;
      const sign = weekChange >= 0 ? '+' : '';
      return `${sign}${weekChange.toFixed(1)} кг/нед`;
    };

    // ============ БЛОКИ-КОМПОНЕНТЫ ============

    // Блок: Главное значение веса
    const WeightValue = ({ scale = 'md' }) => {
      const sizes = { sm: 'widget-weight__val--sm', md: 'widget-weight__val--md', lg: 'widget-weight__val--lg', xl: 'widget-weight__val--xl' };
      if (!hasCurrent) return React.createElement('div', { className: 'widget-weight__empty' }, '—');
      return React.createElement('div', { className: `widget-weight__val ${sizes[scale] || ''}` },
        current.toFixed(1),
        React.createElement('span', { className: 'widget-weight__val-unit' }, 'кг')
      );
    };

    // Блок: Тренд (стрелка + текст)
    const TrendBlock = ({ showText = false, vertical = false }) => {
      if (!showTrend || !trendInfo) return null;
      const weekText = formatWeekChange();
      return React.createElement('div', {
        className: `widget-weight__trend ${vertical ? 'widget-weight__trend--vert' : ''}`,
        style: { color: trendInfo.color }
      },
        React.createElement('span', { className: 'widget-weight__trend-arrow' }, trendInfo.emoji),
        showText && weekText && React.createElement('span', { className: 'widget-weight__trend-label' }, weekText)
      );
    };

    // Блок: График
    const ChartBlock = ({ days = 7, height = 60, showDots = true, showLabels = false, showGoalLine = false }) => {
      if (!hasSparkline) return null;
      const pts = sparklinePoints.slice(-days);
      return React.createElement(WeightMiniSparkline, {
        points: pts,
        width: '100%',
        height: height,
        trendColor: trendInfo?.color || '#3b82f6',
        showDots,
        showLabels,
        showGoalLine: showGoalLine && hasGoal,
        goalWeight: goal
      });
    };

    // Блок: Цель
    const GoalBlock = ({ inline = false }) => {
      if (!showGoal || !hasGoal) return null;
      if (inline) {
        return React.createElement('div', { className: 'widget-weight__goal-line' },
          React.createElement('span', { className: 'widget-weight__goal-label' }, 'Цель'),
          React.createElement('span', { className: 'widget-weight__goal-inline-val' }, `${goal} кг`),
          weeksToGoal && React.createElement('span', { className: 'widget-weight__goal-eta' }, `~${weeksToGoal} нед`)
        );
      }
      return React.createElement('div', { className: 'widget-weight__goal-block' },
        React.createElement('div', { className: 'widget-weight__goal-val' }, `${goal} кг`),
        weeksToGoal && React.createElement('div', { className: 'widget-weight__goal-eta' }, `~${weeksToGoal} нед`)
      );
    };

    // Блок: Прогресс-бар к цели
    const ProgressBlock = ({ vertical = false }) => {
      if (!showGoal || !hasGoal || progressPct === null) return null;
      const pct = Math.min(100, Math.max(0, progressPct));
      if (vertical) {
        return React.createElement('div', { className: 'widget-weight__progress-v' },
          React.createElement('div', { className: 'widget-weight__progress-track-v' },
            React.createElement('div', {
              className: 'widget-weight__progress-fill-v',
              style: { height: `${pct}%` }
            })
          ),
          React.createElement('div', { className: 'widget-weight__progress-goal' }, `${goal} кг`)
        );
      }
      return React.createElement('div', { className: 'widget-weight__progress-h' },
        React.createElement('div', { className: 'widget-weight__progress-track-h' },
          React.createElement('div', {
            className: 'widget-weight__progress-fill-h',
            style: { width: `${pct}%` }
          })
        ),
        React.createElement('div', { className: 'widget-weight__progress-info' },
          React.createElement('span', { className: 'widget-weight__progress-pct' }, `${pct.toFixed(0)}%`),
          React.createElement('span', { className: 'widget-weight__progress-label' }, `→ ${goal} кг`)
        )
      );
    };

    // Блок: BMI
    const BMIBlock = ({ compact = false }) => {
      if (!bmi) return null;
      if (compact) {
        return React.createElement('div', {
          className: 'widget-weight__bmi-badge',
          style: { background: bmiCategory?.color ? `${bmiCategory.color}20` : undefined, color: bmiCategory?.color }
        }, `BMI ${bmi.toFixed(1)}`);
      }
      return React.createElement('div', { className: 'widget-weight__bmi-block' },
        React.createElement('div', { className: 'widget-weight__bmi-num' }, bmi.toFixed(1)),
        React.createElement('div', {
          className: 'widget-weight__bmi-cat',
          style: { color: bmiCategory?.color }
        }, bmiCategory?.label || 'BMI')
      );
    };

    // Блок: Аналитика (прогноз на месяц, чистый тренд)
    const AnalyticsBlock = () => {
      const items = [];
      if (monthChange) {
        items.push({ icon: '📊', text: `Прогноз: ${monthChange > 0 ? '+' : ''}${monthChange.toFixed(1)} кг/мес` });
      }
      if (hasCleanTrend) {
        items.push({ icon: '🌸', text: 'Чистый тренд', cls: 'widget-weight__stat--pink' });
      }
      if (items.length === 0) return null;
      return React.createElement('div', { className: 'widget-weight__stats' },
        items.map((item, i) => React.createElement('div', {
          key: i,
          className: `widget-weight__stat ${item.cls || ''}`
        },
          React.createElement('span', { className: 'widget-weight__stat-icon' }, item.icon),
          React.createElement('span', null, item.text)
        ))
      );
    };

    // ============ LAYOUTS ПО РАЗМЕРАМ ============

    // MINI (1×1) — метка + число (компактный шрифт для safe-area)
    if (size === '1x1') {
      return React.createElement('div', { className: 'widget-weight widget-weight--1x1' },
        React.createElement('div', { className: 'widget-micro__label' }, 'вес'),
        React.createElement(WeightValue, { scale: 'sm' })
      );
    }

    // SHORT (2×1) — низкий: число слева + стрелка/плашки справа
    if (size === '2x1') {
      return React.createElement('div', { className: 'widget-weight widget-weight--2x1' },
        React.createElement('div', { className: 'widget-weight__row-h' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'lg' }),
            showGoal && hasGoal ? React.createElement(GoalBlock, { inline: true }) : null
          ),
          React.createElement('div', { className: 'widget-weight__right' },
            React.createElement(TrendBlock, { showText: false }),
            React.createElement(BMIBlock, { compact: true })
          )
        )
      );
    }

    // WIDE SHORT (3×1) — широкий низкий: число + тренд + цель/BMI в ряд
    if (size === '3x1') {
      return React.createElement('div', { className: 'widget-weight widget-weight--3x1' },
        React.createElement('div', { className: 'widget-weight__row-h' },
          React.createElement(WeightValue, { scale: 'lg' }),
          React.createElement(TrendBlock, { showText: true }),
          showGoal && hasGoal
            ? React.createElement(GoalBlock, { inline: true })
            : React.createElement(BMIBlock, { compact: true })
        )
      );
    }

    // EXTRA WIDE SHORT (4×1) — максимально широкий низкий: число + тренд + цель + BMI
    if (size === '4x1') {
      return React.createElement('div', { className: 'widget-weight widget-weight--4x1' },
        React.createElement('div', { className: 'widget-weight__row-h' },
          React.createElement(WeightValue, { scale: 'lg' }),
          React.createElement(TrendBlock, { showText: true }),
          showGoal && hasGoal ? React.createElement(GoalBlock, { inline: true }) : null,
          React.createElement(BMIBlock, { compact: true })
        )
      );
    }

    // TALL2 (1×2) — узкий: число | тренд | прогресс/цель
    if (size === '1x2') {
      const showProgress = showGoal && hasGoal && progressPct !== null;
      return React.createElement('div', { className: 'widget-weight widget-weight--1x2' },
        React.createElement(WeightValue, { scale: 'lg' }),
        React.createElement(TrendBlock, { showText: false, vertical: true }),
        showProgress ? React.createElement(ProgressBlock, { vertical: true }) : React.createElement(GoalBlock, { inline: false }),
        React.createElement(BMIBlock, { compact: true })
      );
    }

    // TALL3 (1×3) — узкий высокий: число | тренд | прогресс | BMI вертикально
    if (size === '1x3') {
      const showProgress = showGoal && hasGoal && progressPct !== null;
      return React.createElement('div', { className: 'widget-weight widget-weight--1x3' },
        React.createElement(WeightValue, { scale: 'lg' }),
        React.createElement(TrendBlock, { showText: false, vertical: true }),
        showProgress ? React.createElement(ProgressBlock, { vertical: true }) : React.createElement(GoalBlock, { inline: false }),
        React.createElement(BMIBlock, { compact: true }),
        React.createElement(AnalyticsBlock, null)
      );
    }

    // TALL4 (1×4) — максимально высокий узкий: полная вертикальная компоновка
    if (size === '1x4') {
      const showProgress = showGoal && hasGoal && progressPct !== null;
      return React.createElement('div', { className: 'widget-weight widget-weight--1x4' },
        React.createElement(WeightValue, { scale: 'xl' }),
        React.createElement(TrendBlock, { showText: true, vertical: true }),
        showProgress ? React.createElement(ProgressBlock, { vertical: true }) : null,
        React.createElement(GoalBlock, { inline: false }),
        React.createElement(BMIBlock, { compact: true }),
        React.createElement(AnalyticsBlock, null)
      );
    }

    // COMPACT (2×2) — число + тренд + (график или цель/BMI)
    if (size === '2x2') {
      return React.createElement('div', { className: 'widget-weight widget-weight--2x2' },
        React.createElement(WeightValue, { scale: 'lg' }),
        React.createElement(TrendBlock, { showText: true }),
        hasSparkline
          ? React.createElement('div', { className: 'widget-weight__chart-compact' },
            React.createElement(ChartBlock, { days: 7, height: 46, showDots: false })
          )
          : (showGoal && hasGoal
            ? React.createElement(GoalBlock, { inline: true })
            : React.createElement(BMIBlock, { compact: true }))
      );
    }

    // MEDIUM (3×2) — число слева + (график или доп.блоки) справа + цель внизу
    if (size === '3x2') {
      return React.createElement('div', { className: 'widget-weight widget-weight--3x2' },
        React.createElement('div', { className: 'widget-weight__top' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'lg' }),
            React.createElement(TrendBlock, { showText: true })
          ),
          hasSparkline
            ? React.createElement('div', { className: 'widget-weight__chart' },
              React.createElement(ChartBlock, { days: 7, height: 50, showDots: true })
            )
            : ((hasBmi || hasAnalytics) && React.createElement('div', { className: 'widget-weight__side' },
              React.createElement(BMIBlock, { compact: true }),
              React.createElement(AnalyticsBlock, null)
            ))
        ),
        React.createElement(GoalBlock, { inline: true })
      );
    }

    // WIDE (4×2) — число + тренд | (график или прогресс/аналитика) | цель+BMI
    if (size === '4x2') {
      const wideMidFallback = (!hasSparkline) ? React.createElement('div', { className: 'widget-weight__mid' },
        React.createElement(ProgressBlock, { vertical: false }),
        React.createElement(AnalyticsBlock, null),
        (!hasAnalytics && !(showGoal && hasGoal && progressPct !== null))
          ? React.createElement('div', { className: 'widget-weight__hint' }, 'Добавьте вес 2+ дня для графика')
          : null
      ) : null;
      return React.createElement('div', { className: 'widget-weight widget-weight--4x2' },
        React.createElement('div', { className: 'widget-weight__row-h' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'lg' }),
            React.createElement(TrendBlock, { showText: true })
          ),
          hasSparkline
            ? React.createElement('div', { className: 'widget-weight__chart' },
              React.createElement(ChartBlock, { days: 7, height: 55, showDots: true, showLabels: true })
            )
            : wideMidFallback,
          React.createElement('div', { className: 'widget-weight__right' },
            React.createElement(GoalBlock, { inline: false }),
            React.createElement(BMIBlock, { compact: true })
          )
        )
      );
    }

    // TALL3 (2×3) — вертикальный: число | тренд | прогресс-бар
    if (size === '2x3') {
      return React.createElement('div', { className: 'widget-weight widget-weight--2x3' },
        React.createElement(WeightValue, { scale: 'xl' }),
        React.createElement(TrendBlock, { showText: true, vertical: true }),
        React.createElement(ProgressBlock, { vertical: true }),
        React.createElement(BMIBlock, { compact: true })
      );
    }

    // TALL (2×4) — вертикальный: число | тренд | (график или прогресс) | цель
    if (size === '2x4') {
      const tallMid = hasSparkline
        ? React.createElement('div', { className: 'widget-weight__chart-vert' },
          React.createElement(ChartBlock, { days: 7, height: 80, showDots: true, showGoalLine: true })
        )
        : (showGoal && hasGoal && progressPct !== null)
          ? React.createElement(ProgressBlock, { vertical: true })
          : React.createElement(AnalyticsBlock, null);
      return React.createElement('div', { className: 'widget-weight widget-weight--2x4' },
        React.createElement(WeightValue, { scale: 'xl' }),
        React.createElement(TrendBlock, { showText: true }),
        tallMid,
        React.createElement(GoalBlock, { inline: false }),
        React.createElement(BMIBlock, { compact: true })
      );
    }

    // 3×3 — близко к 4×3, но компактнее по ширине
    if (size === '3x3') {
      return React.createElement('div', { className: 'widget-weight widget-weight--3x3' },
        React.createElement('div', { className: 'widget-weight__header' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'xl' }),
            React.createElement(TrendBlock, { showText: true })
          ),
          React.createElement(BMIBlock, { compact: true })
        ),
        hasSparkline
          ? React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement(ChartBlock, { days: 10, height: 76, showDots: true, showLabels: false, showGoalLine: true })
          )
          : React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement('div', { className: 'widget-weight__hint' }, 'Добавьте вес 2+ дня для графика')
          ),
        React.createElement('div', { className: 'widget-weight__footer' },
          React.createElement(ProgressBlock, { vertical: false }),
          React.createElement(AnalyticsBlock, null)
        )
      );
    }

    // 3×4 — почти как 4×4, но чуть плотнее
    if (size === '3x4') {
      const hasProgress = showGoal && hasGoal && progressPct !== null;
      return React.createElement('div', { className: 'widget-weight widget-weight--3x4' },
        React.createElement('div', { className: 'widget-weight__header' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'xl' }),
            React.createElement(TrendBlock, { showText: true })
          ),
          React.createElement(BMIBlock, { compact: false })
        ),
        hasSparkline
          ? React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement(ChartBlock, { days: 14, height: 104, showDots: true, showLabels: false, showGoalLine: true })
          )
          : React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement('div', { className: 'widget-weight__hint' }, 'Добавьте вес 2+ дня для графика')
          ),
        React.createElement('div', { className: 'widget-weight__bottom' },
          React.createElement(ProgressBlock, { vertical: false }),
          React.createElement(AnalyticsBlock, null),
          !hasProgress ? React.createElement(GoalBlock, { inline: true }) : null
        )
      );
    }

    // WIDE3 (4×3) — горизонтальный: верх(число+тренд | BMI) | график | цель+аналитика
    if (size === '4x3') {
      return React.createElement('div', { className: 'widget-weight widget-weight--4x3' },
        React.createElement('div', { className: 'widget-weight__header' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'xl' }),
            React.createElement(TrendBlock, { showText: true })
          ),
          React.createElement(BMIBlock, { compact: false })
        ),
        hasSparkline
          ? React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement(ChartBlock, { days: 10, height: 72, showDots: true, showLabels: true, showGoalLine: true })
          )
          : React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement('div', { className: 'widget-weight__hint' }, 'Добавьте вес 2+ дня для графика')
          ),
        React.createElement('div', { className: 'widget-weight__footer' },
          React.createElement(ProgressBlock, { vertical: false }),
          React.createElement(AnalyticsBlock, null)
        )
      );
    }

    // LARGE (4×4) — максимум информации
    if (size === '4x4') {
      const hasProgress = showGoal && hasGoal && progressPct !== null;
      return React.createElement('div', { className: 'widget-weight widget-weight--4x4' },
        React.createElement('div', { className: 'widget-weight__header' },
          React.createElement('div', { className: 'widget-weight__left' },
            React.createElement(WeightValue, { scale: 'xl' }),
            React.createElement(TrendBlock, { showText: true })
          ),
          React.createElement(BMIBlock, { compact: false })
        ),
        hasSparkline
          ? React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement(ChartBlock, { days: 14, height: 108, showDots: true, showLabels: true, showGoalLine: true })
          )
          : React.createElement('div', { className: 'widget-weight__chart-full' },
            React.createElement('div', { className: 'widget-weight__hint' }, 'Добавьте вес 2+ дня для графика')
          ),
        React.createElement('div', { className: 'widget-weight__bottom' },
          React.createElement(ProgressBlock, { vertical: false }),
          React.createElement(AnalyticsBlock, null),
          // Если прогресс уже показан, цель видна в нём (→ goal кг). Не дублируем, чтобы не клиппило низ.
          !hasProgress ? React.createElement(GoalBlock, { inline: true }) : null
        )
      );
    }

    // Fallback — неизвестный размер: рендерим базово и (один раз) логируем для диагностики
    if (widgetsOnce(`weight:unknownSize:${size}`)) {
      trackWidgetIssue('widgets_weight_unknown_size', {
        size,
        widgetId: widget?.id,
        availableSizes: HEYS.Widgets.registry?.getType?.('weight')?.availableSizes
      });
    }
    return React.createElement('div', { className: `widget-weight widget-weight--${size || '2x2'}` },
      React.createElement(WeightValue, { scale: 'md' }),
      React.createElement(TrendBlock, { showText: false })
    );
  }

  /**
   * WeightMiniSparkline — Мини-график веса для виджетов
   */
  function WeightMiniSparkline({ points, width, height, trendColor, showDots, showLabels, showGoalLine, goalWeight }) {
    const validPoints = points.filter(p => p.weight !== null);
    if (validPoints.length < 2) return null;

    // Если width = '100%', используем viewBox и сохраняем пропорции
    const isFluid = width === '100%';
    const svgW = isFluid ? 200 : width;
    const svgH = height;

    const weights = validPoints.map(p => p.weight);
    const minW = Math.min(...weights) - 0.3;
    const maxW = Math.max(...weights) + 0.3;
    const range = Math.max(1, maxW - minW);

    const paddingX = showLabels ? 8 : 4;
    const paddingY = showLabels ? 12 : 4;
    const chartW = svgW - paddingX * 2;
    const chartH = svgH - paddingY * 2;

    const pts = validPoints.map((p, i) => ({
      x: paddingX + (i / (validPoints.length - 1)) * chartW,
      y: paddingY + chartH - ((p.weight - minW) / range) * chartH,
      weight: p.weight,
      dayNum: p.dayNum,
      isToday: p.isToday
    }));

    // Построение плавной линии
    const buildPath = () => {
      if (pts.length < 2) return '';
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const cpx = (p1.x + p2.x) / 2;
        d += ` Q${cpx},${p1.y} ${p2.x},${p2.y}`;
      }
      return d;
    };

    const pathD = buildPath();

    // Линия цели
    const goalY = showGoalLine && goalWeight
      ? paddingY + chartH - ((goalWeight - minW) / range) * chartH
      : null;

    return React.createElement('svg', {
      className: 'widget-weight__sparkline',
      viewBox: `0 0 ${svgW} ${svgH}`,
      width: isFluid ? '100%' : svgW,
      height: svgH,
      preserveAspectRatio: 'xMidYMid meet'
    },
      // Линия цели (пунктир)
      goalY !== null && goalY > paddingY && goalY < svgH - paddingY &&
      React.createElement('line', {
        x1: paddingX,
        y1: goalY,
        x2: svgW - paddingX,
        y2: goalY,
        stroke: '#8b5cf6',
        strokeWidth: 1,
        strokeDasharray: '4 2',
        opacity: 0.5
      }),
      // Линия графика
      React.createElement('path', {
        d: pathD,
        fill: 'none',
        stroke: trendColor,
        strokeWidth: 2,
        strokeLinecap: 'round'
      }),
      // Точки
      showDots && pts.map((p, i) =>
        React.createElement('circle', {
          key: i,
          cx: p.x,
          cy: p.y,
          r: p.isToday ? 4 : 2.5,
          fill: p.isToday ? trendColor : '#fff',
          stroke: trendColor,
          strokeWidth: p.isToday ? 0 : 1.5
        })
      ),
      // Метки дней
      showLabels && pts.filter((_, i) => i === 0 || i === pts.length - 1).map((p, i) =>
        React.createElement('text', {
          key: 'lbl-' + i,
          x: p.x,
          y: svgH - 2,
          textAnchor: i === 0 ? 'start' : 'end',
          className: 'widget-weight__sparkline-label'
        }, p.dayNum)
      )
    );
  }

  function StepsWidgetContent({ widget, data }) {
    const steps = data.steps || 0;
    const goal = data.goal || 10000;
    const pct = goal > 0 ? Math.round((steps / goal) * 100) : 0;
    const km = (steps * 0.0007).toFixed(1);
    const remaining = Math.max(0, goal - steps);

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';

    const getStepsColor = () => {
      if (pct >= 100) return '#22c55e';
      if (pct >= 70) return '#3b82f6';
      if (pct >= 40) return '#eab308';
      return '#ef4444';
    };

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-steps widget-steps--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '👟'),
        React.createElement('div', { className: 'widget-steps__value' }, steps)
      );
    }

    // 2x2 — Оптимальный layout
    if (size === '2x2') {
      const stepsColor = getStepsColor();
      return React.createElement('div', { className: 'widget-steps widget-steps--2x2' },
        // Верх: иконка + шаги + процент
        React.createElement('div', { className: 'widget-steps__header' },
          React.createElement('div', { className: 'widget-steps__icon' }, '🚶'),
          React.createElement('div', { className: 'widget-steps__value widget-steps__value--lg' },
            steps.toLocaleString('ru-RU')
          ),
          React.createElement('div', { className: 'widget-steps__pct-badge', style: { background: `${stepsColor}20`, color: stepsColor } },
            `${pct}%`
          )
        ),
        // Прогресс-бар
        React.createElement('div', { className: 'widget-steps__progress' },
          React.createElement('div', {
            className: 'widget-steps__bar',
            style: { width: `${Math.min(100, pct)}%`, background: stepsColor }
          })
        ),
        // Низ: километры + цель + осталось
        React.createElement('div', { className: 'widget-steps__footer' },
          React.createElement('div', { className: 'widget-steps__km' }, `${km} км`),
          React.createElement('div', { className: 'widget-steps__meta' },
            remaining > 0
              ? `ещё ${remaining.toLocaleString('ru-RU')}`
              : '🏆 Цель!'
          )
        )
      );
    }

    // Остальные размеры
    const showKm = widget.settings?.showKilometers && !d.isTiny;
    const showGoalBar = widget.settings?.showGoal !== false;
    const showPctInline = d.isShort;

    return React.createElement('div', { className: `widget-steps widget-steps--${variant}` },
      React.createElement('div', { className: 'widget-steps__top' },
        React.createElement('div', { className: 'widget-steps__value' }, steps.toLocaleString('ru-RU')),
        showPctInline ? React.createElement('div', { className: 'widget-steps__pct' }, `${Math.min(999, pct)}%`) : null
      ),
      showKm ? React.createElement('div', { className: 'widget-steps__km' }, `${km} км`) : null,
      showGoalBar
        ? React.createElement('div', { className: 'widget-steps__progress' },
          React.createElement('div', {
            className: 'widget-steps__bar',
            style: { width: `${Math.min(100, pct)}%` }
          })
        )
        : null
    );
  }

  function MacrosWidgetContent({ widget, data }) {
    const { protein, fat, carbs, proteinTarget, fatTarget, carbsTarget } = data;

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';

    // Расчёт процентов
    const pctP = proteinTarget > 0 ? Math.round((protein || 0) / proteinTarget * 100) : 0;
    const pctF = fatTarget > 0 ? Math.round((fat || 0) / fatTarget * 100) : 0;
    const pctC = carbsTarget > 0 ? Math.round((carbs || 0) / carbsTarget * 100) : 0;
    const avgPct = Math.round((pctP + pctF + pctC) / 3);

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-macros widget-macros--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, 'БЖУ'),
        React.createElement('div', { className: 'widget-macros__micro-value' }, `${Math.min(999, avgPct)}%`)
      );
    }

    // 4x1 — Компактный горизонтальный layout с минимальными интервалами
    if (size === '4x1') {
      const MacroBarCompact = ({ label, value, target, pct, color }) => {
        return React.createElement('div', { className: 'widget-macros__item-4x1' },
          React.createElement('div', { className: 'widget-macros__label-4x1', style: { color } }, label),
          React.createElement('div', { className: 'widget-macros__bar-4x1' },
            React.createElement('div', {
              className: 'widget-macros__bar-fill',
              style: { width: `${Math.min(100, pct)}%`, background: color }
            })
          ),
          React.createElement('span', { className: 'widget-macros__value-4x1' }, `${Math.round(value)}г`)
        );
      };

      return React.createElement('div', { className: 'widget-macros widget-macros--4x1' },
        React.createElement(MacroBarCompact, { label: 'Б', value: protein || 0, target: proteinTarget || 100, pct: pctP, color: '#ef4444' }),
        React.createElement(MacroBarCompact, { label: 'Ж', value: fat || 0, target: fatTarget || 70, pct: pctF, color: '#eab308' }),
        React.createElement(MacroBarCompact, { label: 'У', value: carbs || 0, target: carbsTarget || 250, pct: pctC, color: '#3b82f6' })
      );
    }

    // 4x2 — Расширенный layout с дополнительной информацией
    if (size === '4x2') {
      const totalGrams = (protein || 0) + (fat || 0) + (carbs || 0);
      const totalTarget = (proteinTarget || 100) + (fatTarget || 70) + (carbsTarget || 250);
      const totalPct = totalTarget > 0 ? Math.round(totalGrams / totalTarget * 100) : 0;
      // Расчёт калорий: белки*4 + жиры*9 + углеводы*4
      const kcalEaten = Math.round((protein || 0) * 4 + (fat || 0) * 9 + (carbs || 0) * 4);
      const kcalTarget = Math.round((proteinTarget || 100) * 4 + (fatTarget || 70) * 9 + (carbsTarget || 250) * 4);

      const MacroRowExtended = ({ label, emoji, value, target, pct, color }) => {
        const isGood = pct >= 80 && pct <= 120;
        const statusEmoji = pct < 80 ? '⬇️' : pct > 120 ? '⬆️' : '✅';
        return React.createElement('div', { className: 'widget-macros__row-4x2' },
          React.createElement('div', { className: 'widget-macros__row-header' },
            React.createElement('span', { className: 'widget-macros__emoji' }, emoji),
            React.createElement('span', { className: 'widget-macros__label-text' }, label),
            React.createElement('span', { className: 'widget-macros__grams-4x2' }, `${Math.round(value)}/${target}г`),
            React.createElement('span', {
              className: 'widget-macros__pct-badge',
              style: { background: isGood ? '#22c55e20' : `${color}20`, color: isGood ? '#22c55e' : color }
            }, `${pct}%`),
            React.createElement('span', { className: 'widget-macros__status-emoji' }, statusEmoji)
          ),
          React.createElement('div', { className: 'widget-macros__bar-4x2' },
            React.createElement('div', {
              className: 'widget-macros__bar-fill',
              style: { width: `${Math.min(100, pct)}%`, background: color }
            })
          )
        );
      };

      return React.createElement('div', { className: 'widget-macros widget-macros--4x2' },
        // Заголовок с калориями и балансом в одну строку
        React.createElement('div', { className: 'widget-macros__summary-4x2' },
          React.createElement('span', { className: 'widget-macros__kcal-line' },
            `🔥 ${kcalEaten} / ${kcalTarget} ккал`
          ),
          React.createElement('span', {
            className: 'widget-macros__balance-line',
            style: { color: avgPct >= 80 && avgPct <= 120 ? '#22c55e' : avgPct < 80 ? '#ef4444' : '#eab308' }
          }, `📊 ${avgPct}%`)
        ),
        // Три бара БЖУ
        React.createElement(MacroRowExtended, { label: 'Белки', emoji: '🍖', value: protein || 0, target: proteinTarget || 100, pct: pctP, color: '#ef4444' }),
        React.createElement(MacroRowExtended, { label: 'Жиры', emoji: '🧈', value: fat || 0, target: fatTarget || 70, pct: pctF, color: '#eab308' }),
        React.createElement(MacroRowExtended, { label: 'Углеводы', emoji: '🍞', value: carbs || 0, target: carbsTarget || 250, pct: pctC, color: '#3b82f6' })
      );
    }

    // 2x2 — Оптимальный layout с барами и числами
    if (size === '2x2') {
      const MacroRow = ({ label, emoji, value, target, pct, color }) => {
        const isGood = pct >= 80 && pct <= 120;
        return React.createElement('div', { className: 'widget-macros__row-2x2' },
          React.createElement('div', { className: 'widget-macros__row-header' },
            React.createElement('span', { className: 'widget-macros__emoji' }, emoji),
            React.createElement('span', { className: 'widget-macros__grams' }, `${Math.round(value)}/${target}г`),
            React.createElement('span', {
              className: 'widget-macros__pct-badge',
              style: { background: isGood ? '#22c55e20' : `${color}20`, color: isGood ? '#22c55e' : color }
            }, `${pct}%`)
          ),
          React.createElement('div', { className: 'widget-macros__bar-2x2' },
            React.createElement('div', {
              className: 'widget-macros__bar-fill',
              style: { width: `${Math.min(100, pct)}%`, background: color }
            })
          )
        );
      };

      return React.createElement('div', { className: 'widget-macros widget-macros--2x2' },
        React.createElement(MacroRow, { label: 'Белки', emoji: '🍖', value: protein || 0, target: proteinTarget || 100, pct: pctP, color: '#ef4444' }),
        React.createElement(MacroRow, { label: 'Жиры', emoji: '🧈', value: fat || 0, target: fatTarget || 70, pct: pctF, color: '#eab308' }),
        React.createElement(MacroRow, { label: 'Углеводы', emoji: '🍞', value: carbs || 0, target: carbsTarget || 250, pct: pctC, color: '#3b82f6' })
      );
    }

    // Остальные размеры
    const showGrams = widget.settings?.showGrams !== false && !d.isTiny;

    const MacroBar = ({ label, value, target, color, cls }) => {
      const pct = target > 0 ? Math.round((value / target) * 100) : 0;
      return React.createElement('div', { className: 'widget-macros__row' },
        React.createElement('span', { className: `widget-macros__label ${cls || ''}` }, label),
        React.createElement('div', { className: 'widget-macros__bar-container' },
          React.createElement('div', {
            className: 'widget-macros__bar',
            style: { width: `${Math.min(100, pct)}%`, backgroundColor: color }
          })
        ),
        showGrams ? React.createElement('span', { className: 'widget-macros__value' }, `${Math.round(value)}г`) : null
      );
    };

    return React.createElement('div', { className: `widget-macros widget-macros--${variant}` },
      React.createElement(MacroBar, {
        label: 'Б', value: protein || 0, target: proteinTarget || 100, color: '#ef4444', cls: 'widget-macros__label--prot'
      }),
      React.createElement(MacroBar, {
        label: 'Ж', value: fat || 0, target: fatTarget || 70, color: '#eab308', cls: 'widget-macros__label--fat'
      }),
      React.createElement(MacroBar, {
        label: 'У', value: carbs || 0, target: carbsTarget || 250, color: '#3b82f6', cls: 'widget-macros__label--carbs'
      })
    );
  }

  function InsulinWidgetContent({ widget, data }) {
    const status = data.status || 'unknown';
    const remaining = data.remaining;
    const phase = data.phase;
    const totalWave = data.totalWave || 180; // Общая длина волны в минутах
    const lastMealTime = data.lastMealTime; // "14:30"

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';

    const getStatusInfo = () => {
      switch (status) {
        case 'active': return { emoji: '📈', label: 'Волна активна', color: '#f97316', short: 'Активна' };
        case 'almost': return { emoji: '📉', label: 'Почти закончилась', color: '#eab308', short: 'Завершается' };
        case 'soon': return { emoji: '⏳', label: 'Скоро закончится', color: '#22c55e', short: 'Скоро' };
        case 'lipolysis': return { emoji: '🔥', label: 'Липолиз!', color: '#10b981', short: 'Липолиз!' };
        default: return { emoji: '❓', label: 'Нет данных', color: '#94a3b8', short: '—' };
      }
    };

    const info = getStatusInfo();
    const showTimer = Number.isFinite(remaining) && remaining > 0;

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-insulin widget-insulin--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '🩸'),
        React.createElement('div', { className: 'widget-insulin__micro' },
          React.createElement('span', { className: 'widget-insulin__micro-emoji' }, info.emoji),
          showTimer ? React.createElement('span', { className: 'widget-insulin__micro-time' }, `${remaining}м`) : null
        )
      );
    }

    // 2x2 — Оптимальный layout с кольцевым прогрессом
    if (size === '2x2') {
      const progressPct = showTimer && totalWave > 0
        ? Math.round(((totalWave - remaining) / totalWave) * 100)
        : (status === 'lipolysis' ? 100 : 0);

      // SVG кольцо прогресса
      const ringSize = 44;
      const strokeWidth = 5;
      const radius = (ringSize - strokeWidth) / 2;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset = circumference - (progressPct / 100) * circumference;

      return React.createElement('div', { className: 'widget-insulin widget-insulin--2x2' },
        // Верх: статус + время последнего приёма
        React.createElement('div', { className: 'widget-insulin__header' },
          React.createElement('div', { className: 'widget-insulin__status-2x2', style: { color: info.color } },
            info.emoji, ' ', info.short
          ),
          lastMealTime && React.createElement('div', { className: 'widget-insulin__meal-time' },
            `🍽 ${lastMealTime}`
          )
        ),
        // Центр: кольцо с таймером
        React.createElement('div', { className: 'widget-insulin__ring-container' },
          React.createElement('svg', {
            className: 'widget-insulin__ring',
            width: ringSize,
            height: ringSize,
            viewBox: `0 0 ${ringSize} ${ringSize}`
          },
            // Фон
            React.createElement('circle', {
              cx: ringSize / 2, cy: ringSize / 2, r: radius,
              fill: 'none', stroke: '#e5e7eb', strokeWidth
            }),
            // Прогресс
            React.createElement('circle', {
              cx: ringSize / 2, cy: ringSize / 2, r: radius,
              fill: 'none', stroke: info.color, strokeWidth,
              strokeLinecap: 'round',
              strokeDasharray: circumference,
              strokeDashoffset,
              transform: `rotate(-90 ${ringSize / 2} ${ringSize / 2})`
            })
          ),
          // Таймер в центре
          React.createElement('div', { className: 'widget-insulin__timer-center' },
            showTimer
              ? `${remaining}м`
              : (status === 'lipolysis' ? '🔥' : '—')
          )
        ),
        // Низ: фаза волны
        phase && React.createElement('div', { className: 'widget-insulin__phase-2x2' },
          phase
        )
      );
    }

    // Остальные размеры
    const showPhase = widget.settings?.showPhase !== false && !!phase && !d.isTiny;

    return React.createElement('div', { className: `widget-insulin widget-insulin--${variant}` },
      React.createElement('div', { className: `widget-insulin__status widget-insulin__status--${status}` },
        info.emoji, ' ', info.label
      ),
      showTimer ? React.createElement('div', { className: 'widget-insulin__timer' }, `${remaining} мин`) : null,
      showPhase ? React.createElement('div', { className: 'widget-insulin__phase' }, phase) : null
    );
  }

  function HeatmapWidgetContent({ widget, data }) {
    const days = data.days || [];
    const currentStreak = data.currentStreak || 0;
    const configuredPeriod = widget.settings?.period || 'week';

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const canShowMonth = configuredPeriod === 'month' && d.area >= 9 && d.rows >= 3;
    const period = canShowMonth ? 'month' : 'week';

    let renderDays = days;
    if (d.isMicro) {
      renderDays = days.slice(-1);
    } else if (d.isTiny) {
      renderDays = days.slice(-7);
    } else if (period === 'week') {
      renderDays = days.slice(-7);
    }

    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';

    // 1x1 Micro
    if (d.isMicro) {
      const today = renderDays[0];
      return React.createElement('div', { className: 'widget-heatmap widget-heatmap--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '📅'),
        React.createElement('div', { className: `widget-heatmap__today widget-heatmap__today--${today?.status || 'empty'}` })
      );
    }

    // 2x2 — Оптимальный layout: заголовок + сетка 7 дней + стрик
    // v3.22.0: с training/stress indicators
    if (size === '2x2') {
      const weekDays = days.slice(-7);
      const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      // Определяем стартовый день недели
      const today = new Date();
      const startDayIndex = (today.getDay() + 6) % 7; // Понедельник = 0

      return React.createElement('div', { className: 'widget-heatmap widget-heatmap--2x2' },
        // Заголовок: иконка + streak
        React.createElement('div', { className: 'widget-heatmap__header' },
          React.createElement('span', { className: 'widget-heatmap__title' }, '📅 Неделя'),
          currentStreak > 0 && React.createElement('span', { className: 'widget-heatmap__streak' },
            `🔥 ${currentStreak}`
          )
        ),
        // Сетка с метками дней
        React.createElement('div', { className: 'widget-heatmap__week-grid' },
          weekDays.map((day, i) => {
            const fallbackDayIndex = (startDayIndex - 6 + i + 7) % 7;
            const dateObj = day?.date ? new Date(day.date) : null;
            const hasValidDate = !!(dateObj && Number.isFinite(dateObj.getTime()));
            const dayIndex = hasValidDate ? ((dateObj.getDay() + 6) % 7) : fallbackDayIndex;
            const dayNum = hasValidDate
              ? dateObj.getDate()
              : (typeof day?.date === 'string' ? parseInt(day.date.split('-').pop(), 10) : null);
            const isWeekend = dayIndex === 5 || dayIndex === 6;
            const isToday = i === weekDays.length - 1;
            // 🆕 v3.22.0: training/stress indicators
            const hasTraining = day.hasTraining;
            const highStress = day.highStress;

            return React.createElement('div', {
              key: i,
              className: `widget-heatmap__day-col ${isToday ? 'widget-heatmap__day-col--today' : ''} ${hasTraining ? 'widget-heatmap__day-col--training' : ''}`
            },
              React.createElement('div', {
                className: `widget-heatmap__day-date ${isWeekend ? 'widget-heatmap__day-date--weekend' : ''}`
              }, Number.isFinite(dayNum) ? dayNum : '—'),
              React.createElement('div', {
                className: `widget-heatmap__cell widget-heatmap__cell--${day.status || 'empty'} ${hasTraining ? 'widget-heatmap__cell--training' : ''} ${highStress ? 'widget-heatmap__cell--stress' : ''}`,
                title: `${day.date}${hasTraining ? ' 💪' : ''}${highStress ? ' 😰' : ''}`
              },
                // 🆕 Training/Stress mini badges
                (hasTraining || highStress) && React.createElement('div', { className: 'widget-heatmap__cell-badges' },
                  hasTraining && React.createElement('span', { className: 'widget-heatmap__cell-badge widget-heatmap__cell-badge--training' }, '💪'),
                  highStress && React.createElement('span', { className: 'widget-heatmap__cell-badge widget-heatmap__cell-badge--stress' }, '😰')
                )
              ),
              React.createElement('div', {
                className: `widget-heatmap__day-label ${isWeekend ? 'widget-heatmap__day-label--weekend' : ''}`
              }, dayLabels[dayIndex])
            );
          })
        ),
        // Легенда — добавлена training/stress
        React.createElement('div', { className: 'widget-heatmap__legend' },
          React.createElement('span', { className: 'widget-heatmap__legend-item widget-heatmap__legend-item--green' }, '✔'),
          React.createElement('span', { className: 'widget-heatmap__legend-item widget-heatmap__legend-item--yellow' }, '≈'),
          React.createElement('span', { className: 'widget-heatmap__legend-item widget-heatmap__legend-item--red' }, '✖'),
          React.createElement('span', { className: 'widget-heatmap__legend-item widget-heatmap__legend-item--training' }, '💪'),
          React.createElement('span', { className: 'widget-heatmap__legend-item widget-heatmap__legend-item--stress' }, '😰')
        )
      );
    }

    const weekLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const today = new Date();
    const weekStartDayIndex = (today.getDay() + 6) % 7;

    return React.createElement('div', { className: `widget-heatmap widget-heatmap--${variant}` },
      React.createElement('div', { className: `widget-heatmap__grid widget-heatmap__grid--${period}` },
        period === 'week'
          ? renderDays.map((day, i) => {
            const fallbackDayIndex = (weekStartDayIndex - 6 + i + 7) % 7;
            const dateObj = day?.date ? new Date(day.date) : null;
            const hasValidDate = !!(dateObj && Number.isFinite(dateObj.getTime()));
            const dayIndex = hasValidDate ? ((dateObj.getDay() + 6) % 7) : fallbackDayIndex;
            const dayNum = hasValidDate
              ? dateObj.getDate()
              : (typeof day?.date === 'string' ? parseInt(day.date.split('-').pop(), 10) : null);
            const isWeekend = dayIndex === 5 || dayIndex === 6;

            return React.createElement('div', {
              key: i,
              className: 'widget-heatmap__day-col'
            },
              React.createElement('div', {
                className: `widget-heatmap__day-date ${isWeekend ? 'widget-heatmap__day-date--weekend' : ''}`
              }, Number.isFinite(dayNum) ? dayNum : '—'),
              React.createElement('div', {
                className: `widget-heatmap__cell widget-heatmap__cell--${day.status || 'empty'}`,
                title: day.date
              }),
              React.createElement('div', {
                className: `widget-heatmap__day-label ${isWeekend ? 'widget-heatmap__day-label--weekend' : ''}`
              }, weekLabels[dayIndex])
            );
          })
          : renderDays.map((day, i) =>
            React.createElement('div', {
              key: i,
              className: `widget-heatmap__cell widget-heatmap__cell--${day.status || 'empty'}`,
              title: day.date
            })
          )
      )
    );
  }

  function CycleWidgetContent({ widget, data }) {
    const day = data.day;
    const phase = data.phase;
    const cycleLength = data.cycleLength || 28;
    const recommendation = data.recommendation; // "Хорошее время для тренировок"

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';

    if (!day) {
      return React.createElement('div', { className: 'widget-cycle__empty' }, 'Нет данных');
    }

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-cycle widget-cycle--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, '🌸'),
        React.createElement('div', { className: 'widget-cycle__day' }, day)
      );
    }

    // 2x2 — Оптимальный layout с кольцевым прогрессом
    if (size === '2x2') {
      const progressPct = Math.round((day / cycleLength) * 100);
      const phaseColor = phase?.color || '#ec4899';

      // SVG кольцо
      const ringSize = 48;
      const strokeWidth = 5;
      const radius = (ringSize - strokeWidth) / 2;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset = circumference - (progressPct / 100) * circumference;

      return React.createElement('div', { className: 'widget-cycle widget-cycle--2x2' },
        // Верх: фаза
        phase && React.createElement('div', { className: 'widget-cycle__phase-header', style: { color: phaseColor } },
          phase.icon, ' ', phase.name
        ),
        // Центр: кольцо с днём
        React.createElement('div', { className: 'widget-cycle__ring-container' },
          React.createElement('svg', {
            className: 'widget-cycle__ring',
            width: ringSize,
            height: ringSize,
            viewBox: `0 0 ${ringSize} ${ringSize}`
          },
            // Фон
            React.createElement('circle', {
              cx: ringSize / 2, cy: ringSize / 2, r: radius,
              fill: 'none', stroke: '#fce7f3', strokeWidth
            }),
            // Прогресс
            React.createElement('circle', {
              cx: ringSize / 2, cy: ringSize / 2, r: radius,
              fill: 'none', stroke: phaseColor, strokeWidth,
              strokeLinecap: 'round',
              strokeDasharray: circumference,
              strokeDashoffset,
              transform: `rotate(-90 ${ringSize / 2} ${ringSize / 2})`
            })
          ),
          // День в центре
          React.createElement('div', { className: 'widget-cycle__day-center' },
            React.createElement('span', { className: 'widget-cycle__day-num' }, day),
            React.createElement('span', { className: 'widget-cycle__day-label' }, 'день')
          )
        ),
        // Низ: рекомендация
        recommendation && React.createElement('div', { className: 'widget-cycle__tip' },
          recommendation
        )
      );
    }

    // Остальные размеры
    return React.createElement('div', { className: `widget-cycle widget-cycle--${variant}` },
      React.createElement('div', { className: 'widget-cycle__day' },
        `День ${day}`
      ),
      widget.settings?.showPhase && phase && !d.isTiny &&
      React.createElement('div', { className: 'widget-cycle__phase' },
        phase.icon, ' ', phase.name
      )
    );
  }

  // === Crash Risk Widget Content v2.0 (EWS + Weight Loss Detection) ===
  function CrashRiskWidgetContent({ widget, data }) {
    const d = getWidgetDims(widget);
    const size = widget?.size || '4x2';

    // Extract data from provider
    const hasData = data?.hasData || false;
    const weeklyLossPercent = data?.weeklyLossPercent || 0;
    const isWarning = data?.isWarning || false;
    const severity = data?.severity || 'none';
    const currentWeight = data?.currentWeight || 0;
    const ewsCount = data?.ewsCount || 0;
    const ewsData = data?.ewsData || null;
    const message = data?.message || '';

    // Color scheme based on severity
    const getColorBySeverity = (sev) => {
      switch (sev) {
        case 'high': return { bg: '#ef4444', text: '#ffffff', light: '#fee2e2' };
        case 'medium': return { bg: '#f97316', text: '#ffffff', light: '#ffedd5' };
        default: return { bg: '#10b981', text: '#ffffff', light: '#d1fae5' };
      }
    };

    const colors = getColorBySeverity(severity);

    // Open EWS Panel on click
    const handleOpenEWS = useCallback(() => {
      const event = new CustomEvent('heysShowEWSPanel');
      document.dispatchEvent(event);
    }, []);

    // === NO DATA STATE ===
    if (!hasData) {
      return React.createElement('div', { className: 'widget-crash-risk widget-crash-risk--no-data' },
        React.createElement('div', { className: 'widget-crash-risk__icon' }, '⚠️'),
        React.createElement('div', { className: 'widget-crash-risk__message' }, message || 'Недостаточно данных')
      );
    }

    // === 2×2 COMPACT LAYOUT ===
    if (size === '2x2') {
      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--compact widget-crash-risk--${severity}`,
        onClick: handleOpenEWS
      },
        // Top: Icon + Percentage
        React.createElement('div', { className: 'widget-crash-risk__header' },
          React.createElement('div', { className: 'widget-crash-risk__icon', style: { color: colors.bg } },
            isWarning ? '⚠️' : '✅'
          ),
          React.createElement('div', {
            className: 'widget-crash-risk__percent',
            style: { color: colors.bg }
          }, `${weeklyLossPercent.toFixed(1)}%`)
        ),

        // Middle: Title
        React.createElement('div', { className: 'widget-crash-risk__title' }, 'Потеря веса'),

        // Bottom: EWS Badge
        ewsCount > 0 && React.createElement('div', {
          className: 'widget-crash-risk__ews-badge',
          style: { background: colors.light, color: colors.bg }
        },
          `${ewsCount} предупрежд.`
        )
      );
    }

    // === 4×2 STANDARD LAYOUT ===
    if (size === '4x2') {
      const topWarnings = ewsData?.warnings?.slice(0, 2) || [];

      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--standard widget-crash-risk--${severity}`,
        onClick: handleOpenEWS
      },
        // Left: KPI Block
        React.createElement('div', { className: 'widget-crash-risk__kpi' },
          React.createElement('div', { className: 'widget-crash-risk__icon-big', style: { color: colors.bg } },
            isWarning ? '⚠️' : '✅'
          ),
          React.createElement('div', { className: 'widget-crash-risk__percent-big', style: { color: colors.bg } },
            `${weeklyLossPercent.toFixed(1)}%`
          ),
          React.createElement('div', { className: 'widget-crash-risk__label' }, '/неделя')
        ),

        // Right: Details
        React.createElement('div', { className: 'widget-crash-risk__details' },
          React.createElement('div', { className: 'widget-crash-risk__title-big' }, 'Потеря веса'),
          React.createElement('div', { className: 'widget-crash-risk__subtitle' },
            `Текущий вес: ${currentWeight.toFixed(1)} кг`
          ),

          // EWS Count Badge
          ewsCount > 0 && React.createElement('div', {
            className: 'widget-crash-risk__ews-count',
            style: { background: colors.light, color: colors.bg }
          },
            `${ewsCount} предупрежд. → Подробнее`
          ),

          // Top 2 warnings preview
          widget.settings?.showWarnings !== false && topWarnings.length > 0 &&
          React.createElement('div', { className: 'widget-crash-risk__warnings-preview' },
            topWarnings.map((w, i) =>
              React.createElement('div', {
                key: i,
                className: `widget-crash-risk__warning widget-crash-risk__warning--${w.severity}`
              },
                React.createElement('span', { className: 'widget-crash-risk__warning-icon' }, getSeverityIcon(w.severity)),
                React.createElement('span', { className: 'widget-crash-risk__warning-text' },
                  w.message?.length > 40 ? w.message.slice(0, 37) + '...' : w.message
                )
              )
            )
          )
        )
      );
    }

    // === 4×3 EXTENDED LAYOUT ===
    if (size === '4x3' || d.cols >= 4 && d.rows >= 3) {
      const topWarnings = ewsData?.warnings?.slice(0, 3) || [];

      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--extended widget-crash-risk--${severity}`,
        onClick: handleOpenEWS
      },
        // Header: Title + EWS Count
        React.createElement('div', { className: 'widget-crash-risk__header-extended' },
          React.createElement('div', { className: 'widget-crash-risk__title-extended' }, 'Early Warning System'),
          ewsCount > 0 && React.createElement('div', {
            className: 'widget-crash-risk__ews-badge-extended',
            style: { background: colors.light, color: colors.bg }
          }, `${ewsCount} предупр.`)
        ),

        // KPI Section
        React.createElement('div', { className: 'widget-crash-risk__kpi-section' },
          React.createElement('div', { className: 'widget-crash-risk__kpi-block' },
            React.createElement('div', { className: 'widget-crash-risk__icon-big', style: { color: colors.bg } },
              isWarning ? '⚠️' : '✅'
            ),
            React.createElement('div', { className: 'widget-crash-risk__percent-big', style: { color: colors.bg } },
              `${weeklyLossPercent.toFixed(1)}%`
            ),
            React.createElement('div', { className: 'widget-crash-risk__label' }, 'потеря/неделя')
          ),
          React.createElement('div', { className: 'widget-crash-risk__weight-info' },
            React.createElement('div', { className: 'widget-crash-risk__weight-label' }, 'Текущий вес'),
            React.createElement('div', { className: 'widget-crash-risk__weight-value' }, `${currentWeight.toFixed(1)} кг`)
          )
        ),

        // Warnings List (Top 3)
        widget.settings?.showWarnings !== false && topWarnings.length > 0 &&
        React.createElement('div', { className: 'widget-crash-risk__warnings-section' },
          React.createElement('div', { className: 'widget-crash-risk__warnings-title' }, 'Предупреждения:'),
          React.createElement('div', { className: 'widget-crash-risk__warnings-list' },
            topWarnings.map((w, i) =>
              React.createElement('div', {
                key: i,
                className: `widget-crash-risk__warning-item widget-crash-risk__warning-item--${w.severity}`
              },
                React.createElement('span', { className: 'widget-crash-risk__warning-icon' }, getSeverityIcon(w.severity)),
                React.createElement('span', { className: 'widget-crash-risk__warning-msg' }, w.message)
              )
            )
          )
        ),

        // Footer: CTA
        React.createElement('div', { className: 'widget-crash-risk__footer' },
          React.createElement('div', { className: 'widget-crash-risk__cta' }, '→ Открыть полный отчёт')
        )
      );
    }

    // === FALLBACK (other sizes) ===
    return React.createElement('div', {
      className: `widget-crash-risk widget-crash-risk--fallback widget-crash-risk--${severity}`
    },
      React.createElement('div', { className: 'widget-crash-risk__icon', style: { color: colors.bg } },
        isWarning ? '⚠️' : '✅'
      ),
      React.createElement('div', { className: 'widget-crash-risk__percent', style: { color: colors.bg } },
        `${weeklyLossPercent.toFixed(1)}%`
      ),
      React.createElement('div', { className: 'widget-crash-risk__label' }, 'потеря/неделя')
    );
  }

  // Helper: Severity icon mapping
  function getSeverityIcon(severity) {
    switch (severity) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      default: return '🟢';
    }
  }

  // === Catalog Modal Component ===
  function CatalogModal({ isOpen, onClose, onSelect, existingTypes }) {
    const registry = HEYS.Widgets.registry;
    const categories = registry?.getCategories() || [];
    const availableTypes = registry?.getAvailableTypes() || [];
    const existingTypeSet = existingTypes instanceof Set ? existingTypes : new Set(existingTypes || []);

    const [selectedCategory, setSelectedCategory] = useState(null);

    useEffect(() => {
      if (isOpen) {
        HEYS.Widgets.emit('catalog:open');
      } else {
        HEYS.Widgets.emit('catalog:close');
      }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredTypes = selectedCategory
      ? availableTypes.filter(t => t.category === selectedCategory)
      : availableTypes;

    const handleSelect = (type) => {
      if (existingTypeSet.has(type.type)) return;
      onSelect?.(type);
      HEYS.Widgets.emit('catalog:select', { type: type.type });
      onClose?.();
    };

    if (widgetsDebugEnabled() && widgetsOnce(`catalog:render:${filteredTypes.length}`)) {
      trackWidgetIssue('widgets_catalog_render', { count: filteredTypes.length });
    }

    return React.createElement('div', { className: 'widgets-catalog-overlay', onClick: onClose },
      React.createElement('div', {
        className: 'widgets-catalog',
        onClick: e => e.stopPropagation()
      },
        // Header
        React.createElement('div', { className: 'widgets-catalog__header' },
          React.createElement('h2', null, 'Добавить виджет'),
          React.createElement('button', {
            className: 'widgets-catalog__close',
            onClick: onClose
          }, '✕')
        ),

        // Category Filters
        React.createElement('div', { className: 'widgets-catalog__categories' },
          React.createElement('button', {
            className: `widgets-catalog__category ${!selectedCategory ? 'active' : ''}`,
            onClick: () => setSelectedCategory(null)
          }, 'Все'),
          categories.map(cat =>
            React.createElement('button', {
              key: cat.id,
              className: `widgets-catalog__category ${selectedCategory === cat.id ? 'active' : ''}`,
              onClick: () => setSelectedCategory(cat.id)
            }, cat.icon, ' ', cat.label)
          )
        ),

        // Widget List
        React.createElement('div', { className: 'widgets-catalog__list' },
          filteredTypes.map(type => {
            const isAlreadyAdded = existingTypeSet.has(type.type);
            return React.createElement('div', {
              key: type.type,
              className: `widgets-catalog__item ${isAlreadyAdded ? 'widgets-catalog__item--disabled' : ''}`,
              onClick: () => handleSelect(type)
            },
              React.createElement('div', { className: 'widgets-catalog__item-icon' }, type.icon),
              React.createElement('div', { className: 'widgets-catalog__item-info' },
                React.createElement('div', { className: 'widgets-catalog__item-name' }, type.name),
                React.createElement('div', { className: 'widgets-catalog__item-desc' }, type.description)
              ),
              isAlreadyAdded && React.createElement('div', { className: 'widgets-catalog__item-badge' }, '✓ Уже на экране')
            );
          })
        )
      )
    );
  }

  // === Settings Modal Component ===
  function SettingsModal({ widget, isOpen, onClose, onSave }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = widget ? registry?.getType(widget.type) : null;
    const [settings, setSettings] = useState({});
    const [selectedSize, setSelectedSize] = useState(widget?.size || '2x2');

    useEffect(() => {
      if (widget) {
        setSettings({ ...widget.settings });
        setSelectedSize(widget.size || '2x2');
      }
    }, [widget]);

    const previewWidget = useMemo(() => ({ ...widget, settings, size: selectedSize }), [widget, settings, selectedSize]);

    if (!isOpen || !widget || !widgetType) return null;

    const handleChange = (key, value) => {
      setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
      onSave?.(widget.id, settings);
      onClose?.();
    };

    return React.createElement('div', { className: 'widgets-settings-overlay', onClick: onClose },
      React.createElement('div', {
        className: 'widgets-settings',
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { className: 'widgets-settings__header' },
          React.createElement('h2', null, `Настройки: ${widgetType.name}`),
          React.createElement('button', {
            className: 'widgets-settings__close',
            onClick: onClose
          }, '✕')
        ),

        React.createElement('div', { className: 'widgets-settings__content' },
          // Widget preview
          React.createElement('div', { className: 'widgets-settings__preview-wrap' },
            React.createElement('div', {
              className: 'widgets-settings__preview-stage',
              style: (() => {
                const CELL = 75;
                const si = registry.getSize(selectedSize) || { cols: 2, rows: 2 };
                return { width: (si.cols * CELL) + 'px', height: (si.rows * CELL) + 'px' };
              })()
            },
              React.createElement('div', {
                className: `widget widget--${previewWidget.size || '2x2'} widget--${previewWidget.type}`,
                style: { position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'default' }
              },

                React.createElement('div', { className: 'widget__content' },
                  React.createElement(WidgetContent, { widget: previewWidget, widgetType })
                )
              )
            )
          ),
          // Size selector
          React.createElement('div', { className: 'widgets-settings__field' },
            React.createElement('label', null, 'Размер'),
            React.createElement('div', { className: 'widgets-settings__sizes' },
              widgetType.availableSizes.map(sizeId => {
                const size = registry.getSize(sizeId);
                return React.createElement('button', {
                  key: sizeId,
                  className: `widgets-settings__size ${selectedSize === sizeId ? 'active' : ''}`,
                  onClick: () => {
                    setSelectedSize(sizeId);
                    HEYS.Widgets.state.resizeWidget(widget.id, sizeId);
                  }
                }, size.label);
              })
            )
          ),

          // Custom settings — если задан settingsBySize, используем настройки для текущего размера
          Object.entries(
            widgetType.settingsBySize
              ? (widgetType.settingsBySize[selectedSize] || {})
              : (widgetType.settings || {})
          ).map(([key, def]) =>
            React.createElement('div', { key, className: 'widgets-settings__field' },
              React.createElement('label', null, def.label),
              def.type === 'boolean' ?
                React.createElement('input', {
                  type: 'checkbox',
                  checked: settings[key] ?? def.default,
                  onChange: e => handleChange(key, e.target.checked)
                }) :
                def.type === 'number' ?
                  React.createElement('input', {
                    type: 'number',
                    value: settings[key] ?? def.default,
                    min: def.min,
                    max: def.max,
                    onChange: e => handleChange(key, parseInt(e.target.value, 10))
                  }) :
                  def.type === 'select' ?
                    React.createElement('select', {
                      value: settings[key] ?? def.default,
                      onChange: e => handleChange(key, e.target.value)
                    },
                      def.options.map(opt =>
                        React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
                      )
                    ) :
                    null
            )
          )
        ),

        React.createElement('div', { className: 'widgets-settings__footer' },
          React.createElement('button', {
            className: 'widgets-settings__btn widgets-settings__btn--cancel',
            onClick: onClose
          }, 'Отмена'),
          React.createElement('button', {
            className: 'widgets-settings__btn widgets-settings__btn--save',
            onClick: handleSave
          }, 'Сохранить')
        )
      )
    );
  }

  // === Main WidgetsTab Component ===
  function WidgetsTab({ selectedDate, clientId, setTab, setSelectedDate }) {
    const [widgets, setWidgets] = useState([]);
    const [isLayoutHydrated, setIsLayoutHydrated] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [settingsWidget, setSettingsWidget] = useState(null);
    const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });
    const [waterAnim, setWaterAnim] = useState(null); // { text: '+200мл', id: 123 } или null
    const [showGridOverlay, setShowGridOverlay] = useState(false); // Grid overlay toggle
    const containerRef = useRef(null);
    const gridRef = useRef(null);

    // Mobile detection (используем существующий хук Day)
    const isMobile = (HEYS.dayHooks && typeof HEYS.dayHooks.useMobileDetection === 'function')
      ? HEYS.dayHooks.useMobileDetection(768)
      : false;

    // На мобиле делаем единицу сетки ближе к квадрату (row-height = ширина колонки)
    // Это критично для mini (1×1), чтобы оно не выглядело как «0.5 по высоте».
    useEffect(() => {
      const grid = gridRef.current;
      if (!grid) return;

      const update = () => {
        try {
          if (!isMobile) return;
          const cs = window.getComputedStyle(grid);
          const colsVar = parseInt(cs.getPropertyValue('--widget-grid-columns'), 10);
          const cols = Number.isFinite(colsVar) && colsVar > 0 ? colsVar : 4;
          const gapVar = parseFloat(cs.getPropertyValue('--widget-grid-gap'));
          const gap = Number.isFinite(gapVar) ? gapVar : 8;

          const w = grid.clientWidth;
          if (!w) return;
          const cellW = (w - gap * (cols - 1)) / cols;
          if (!Number.isFinite(cellW) || cellW <= 0) return;

          const target = Math.max(60, Math.min(Math.round(cellW), 140));
          const rowHeight = `${target}px`;

          // Важно: overlay — соседний элемент внутри .widgets-grid-container,
          // поэтому переменная, заданная только на .widgets-grid, туда не наследуется.
          // Синхронизируем на обоих уровнях, чтобы «техническая» сетка совпадала
          // с реальными размерами карточек.
          grid.style.setProperty('--widget-row-height', rowHeight);
          const gridContainer = grid.parentElement;
          if (gridContainer) {
            gridContainer.style.setProperty('--widget-row-height', rowHeight);
          }
        } catch (e) {
          // silent
        }
      };

      update();
      window.addEventListener('resize', update);
      window.addEventListener('orientationchange', update);
      return () => {
        window.removeEventListener('resize', update);
        window.removeEventListener('orientationchange', update);
      };
    }, [isMobile, widgets.length, isEditMode]);

    // Сохраняем selectedDate в HEYS.Widgets.data для использования в widget_data.js
    useEffect(() => {
      if (HEYS.Widgets.data) {
        HEYS.Widgets.data._selectedDate = selectedDate;
      }
    }, [selectedDate]);

    // 🔄 Реинициализация виджетов при смене клиента
    // Критично: каждый клиент имеет свой layout виджетов!
    useEffect(() => {
      if (clientId) {
        console.info(`[WidgetsTab] clientId changed: "${clientId.slice(0, 8)}...", reinitializing widgets`);
        // Передаём clientId явно, т.к. HEYS.currentClientId может ещё не обновиться (race condition)
        HEYS.Widgets.state?.reinit?.(clientId);
        // НЕ вызываем setWidgets здесь — reinit асинхронный: getWidgets() вернёт []
        // и вызовет вспышку empty-state. Подписка на layout:loaded обновит widgets когда данные готовы.
        updateHistoryInfo();
      }
    }, [clientId]);

    // Initialize and subscribe to state changes
    useEffect(() => {
      // Важно: на первом рендере widgets=[] и UI может кратко показать empty-state.
      // Поэтому показываем empty-state только после первичной инициализации.
      setIsLayoutHydrated(false);

      // Initialize state if not already
      HEYS.Widgets.state?.init?.();

      // Get initial widgets
      setWidgets(HEYS.Widgets.state?.getWidgets?.() || []);
      setIsEditMode(HEYS.Widgets.state?.isEditMode?.() || false);
      updateHistoryInfo();
      setIsLayoutHydrated(true);

      // 🔧 v1.19: Проверяем WidgetsTour при монтировании компонента
      // (layout:loaded может уже произойти до завершения основного тура)
      const tourTimer = setTimeout(() => {
        console.log('[WidgetsTab] Checking WidgetsTour eligibility...', {
          hasTour: !!HEYS.WidgetsTour,
          shouldShow: HEYS.WidgetsTour?.shouldShow?.(),
          hasStart: !!HEYS.WidgetsTour?.start
        });
        if (HEYS.WidgetsTour?.shouldShow?.() && HEYS.WidgetsTour.start) {
          console.log('[WidgetsTab] Starting WidgetsTour!');
          HEYS.WidgetsTour.start();
        }
      }, 800);

      // Subscribe to layout loaded (первичная загрузка)
      const unsubLoaded = HEYS.Widgets.on('layout:loaded', ({ layout }) => {
        setWidgets([...(layout || [])]);
        updateHistoryInfo();
        setIsLayoutHydrated(true);

        // Auto-start WidgetsTour if applicable (after layout is ready)
        setTimeout(() => {
          if (HEYS.WidgetsTour?.shouldShow?.() && HEYS.WidgetsTour.start) {
            HEYS.WidgetsTour.start();
          }
        }, 500);
      });

      // Subscribe to layout changes
      const unsubLayout = HEYS.Widgets.on('layout:changed', ({ layout }) => {
        setWidgets([...layout]);
        updateHistoryInfo();
        setIsLayoutHydrated(true);
      });

      // Subscribe to edit mode changes
      const unsubEditEnter = HEYS.Widgets.on('editmode:enter', () => {
        setIsEditMode(true);
      });

      const unsubEditExit = HEYS.Widgets.on('editmode:exit', () => {
        setIsEditMode(false);
      });

      // Subscribe to history changes
      const unsubHistory = HEYS.Widgets.on('history:changed', updateHistoryInfo);

      return () => {
        clearTimeout(tourTimer);
        unsubLoaded?.();
        unsubLayout?.();
        unsubEditEnter?.();
        unsubEditExit?.();
        unsubHistory?.();
      };
    }, []);

    // Update history info
    const updateHistoryInfo = useCallback(() => {
      setHistoryInfo({
        canUndo: HEYS.Widgets.canUndo?.() || false,
        canRedo: HEYS.Widgets.canRedo?.() || false
      });
    }, []);

    // Handle catalog widget selection
    const handleCatalogSelect = useCallback((widgetType) => {
      if (!HEYS.Widgets.registry) {
        trackWidgetIssue('widgets_registry_not_initialized', { source: 'handleCatalogSelect' });
        return;
      }

      const widget = HEYS.Widgets.registry.createWidget(widgetType.type);

      if (widget) {
        if (!HEYS.Widgets.state) {
          trackWidgetIssue('widgets_state_not_initialized', { source: 'handleCatalogSelect' });
          return;
        }
        const added = HEYS.Widgets.state.addWidget(widget);
        if (!added) {
          trackWidgetIssue('widgets_addWidget_failed', { type: widgetType?.type });
        }
      } else {
        trackWidgetIssue('widgets_createWidget_null', { type: widgetType?.type });
      }
    }, []);

    // Handle widget settings save
    const handleSettingsSave = useCallback((widgetId, settings) => {
      HEYS.Widgets.state?.updateWidget(widgetId, { settings });
    }, []);

    // Handle widget remove
    const handleRemove = useCallback((widgetId) => {
      HEYS.Widgets.state?.removeWidget(widgetId);
    }, []);

    // Global pointer event handlers for DnD (работают только в режиме редактирования — гейт в handlePointerMove/Up на карточке)
    useEffect(() => {
      const onMove = (e) => HEYS.Widgets.dnd?.handlePointerMove?.(e);
      const onUp = (e) => HEYS.Widgets.dnd?.handlePointerUp?.(null, e);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      return () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };
    }, []);

    // Toggle edit mode
    const toggleEdit = useCallback(() => {
      HEYS.Widgets.toggleEditMode?.();
    }, []);

    // FAB: добавить приём пищи / воду — переключаемся на нужную вкладку и вызываем Day API
    const goToDayAndRun = useCallback((targetTab, fnName, fnArgs = []) => {
      const doSetTab = typeof setTab === 'function' ? setTab : (window.HEYS?.App?.setTab);

      if (typeof doSetTab === 'function') {
        doSetTab(targetTab);
      }

      // Даем React смонтировать DayTab
      setTimeout(() => {
        const fn = window.HEYS?.Day?.[fnName];
        if (typeof fn === 'function') {
          try {
            fn(...fnArgs);
          } catch (e) {
            // silent: внешние вызовы не должны ломать UI
          }
        }
      }, 600);
    }, [setTab]);

    // 💧 Добавить воду БЕЗ переключения вкладки — анимация прямо здесь
    const handleAddWater = useCallback((ml = 200) => {
      const persistWaterLocally = () => {
        try {
          const dateKey = selectedDate || new Date().toISOString().slice(0, 10);
          const U = HEYS.utils || {};
          const store = HEYS.store || {};
          const baseKey = `heys_dayv2_${dateKey}`;

          // Берём clientId из единого источника (с fallback на legacy localStorage)
          let clientCurrent = (typeof U.getCurrentClientId === 'function' ? U.getCurrentClientId() : '') || '';
          if (!clientCurrent) {
            try {
              const raw = localStorage.getItem('heys_client_current');
              clientCurrent = raw ? JSON.parse(raw) : '';
            } catch (e) {
              clientCurrent = localStorage.getItem('heys_client_current') || '';
            }
          }

          const scopedKey = clientCurrent
            ? `heys_${clientCurrent}_dayv2_${dateKey}`
            : baseKey;

          // Читаем через тот же storage-контур, который используется в app
          let dayData = (typeof U.lsGet === 'function' ? U.lsGet(baseKey, null) : null)
            || (typeof store.get === 'function' ? store.get(scopedKey, null) : null)
            || {};

          if (typeof dayData === 'string') {
            try {
              dayData = JSON.parse(dayData);
            } catch (e) {
              dayData = {};
            }
          }

          if (!dayData.date) dayData.date = dateKey;
          dayData.waterMl = (dayData.waterMl || 0) + ml;
          dayData.lastWaterTime = Date.now();
          dayData.updatedAt = Date.now();

          // Пишем через приоритетный API (чтобы не терять namespacing и sync hooks)
          if (typeof U.lsSet === 'function') {
            U.lsSet(baseKey, dayData);
          } else if (typeof store.set === 'function') {
            store.set(scopedKey, dayData);
          } else {
            localStorage.setItem(scopedKey, JSON.stringify(dayData));
            // Trigger cloud sync only for raw-localStorage fallback
            window.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: scopedKey, type: 'meal' } }));
          }

          // Универсальное событие обновления дня (для дневника/отчётов/виджетов)
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date: dateKey, dayData, source: 'widgets_fab_water' }
          }));

          // Dispatch event для синхронизации других компонентов
          window.dispatchEvent(new CustomEvent('heysWaterAdded', {
            detail: { ml, total: dayData.waterMl }
          }));
          // Только water:added — day:updated намеренно НЕ эмитим, чтобы
          // не триггерить ре-рендер кольца калорий и других виджетов.
          // Вода обновляется оптимистично через heysWaterAdded DOM event.
          if (typeof HEYS.events?.emit === 'function') {
            HEYS.events.emit('water:added', { ml, total: dayData.waterMl });
          }
        } catch (e) {
          // silent
        }
      };

      // Сначала показываем локальную анимацию
      const animId = Date.now();
      setWaterAnim({ text: '+' + ml + 'мл', id: animId });

      // Вибрация
      if (navigator.vibrate) navigator.vibrate(50);

      // 💧 Анимация падающей капли через DOM
      try {
        const fabBtn = document.querySelector('.water-fab');
        if (fabBtn) {
          const rect = fabBtn.getBoundingClientRect();
          const drop = document.createElement('div');
          drop.className = 'water-drop-container';
          drop.style.cssText = 'position:fixed;left:' + (rect.left + rect.width / 2) + 'px;top:' + (rect.top - 20) + 'px;z-index:9999;pointer-events:none;transform:translateX(-50%);';
          drop.innerHTML = '<div class="water-drop"></div><div class="water-splash"></div>';
          document.body.appendChild(drop);
          setTimeout(() => { if (drop.parentNode) drop.parentNode.removeChild(drop); }, 1200);
        }
      } catch (e) { /* silent */ }

      // 🌊 Полноэкранная анимация воды (только если есть активный water-виджет)
      try {
        const waterWidgetCard = document.querySelector('.widget[data-widget-type="water"]');
        if (waterWidgetCard) {
          // --- Overlay ---
          const overlay = document.createElement('div');
          overlay.className = 'water-screen-fill';

          const body = document.createElement('div');
          body.className = 'water-screen-fill__body';

          const wave = document.createElement('div');
          wave.className = 'water-screen-fill__wave';

          const shimmer = document.createElement('div');
          shimmer.className = 'water-screen-fill__shimmer';

          body.appendChild(wave);
          body.appendChild(shimmer);

          // Пузырьки
          for (let b = 0; b < 8; b++) {
            const bubble = document.createElement('div');
            bubble.className = 'water-screen-fill__bubble';
            const size = 6 + Math.random() * 14;
            const delay = Math.random() * 0.6;
            const dur = 0.7 + Math.random() * 0.8;
            bubble.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (5 + Math.random() * 90) + '%;bottom:' + (10 + Math.random() * 50) + '%;animation-duration:' + dur + 's;animation-delay:' + delay + 's;';
            body.appendChild(bubble);
          }

          overlay.appendChild(body);
          document.body.appendChild(overlay);

          // Запускаем подъём
          requestAnimationFrame(() => {
            body.classList.add('rising');
          });

          // Через 850ms (конец подъёма) держим 200ms, потом — отток
          setTimeout(() => {
            body.classList.remove('rising');
            body.classList.add('draining');
            setTimeout(() => {
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 950);
          }, 1050);

          // --- Пульс виджета ---
          waterWidgetCard.classList.add('widget--water-pulse');
          setTimeout(() => {
            waterWidgetCard.classList.remove('widget--water-pulse');
          }, 1800);

          // --- Gradient-перелив самого виджета ---
          waterWidgetCard.style.transition = 'background 0.4s ease';
          waterWidgetCard.style.background = 'linear-gradient(135deg, rgba(10,132,255,0.12) 0%, rgba(100,210,255,0.18) 50%, rgba(0,238,255,0.10) 100%)';
          setTimeout(() => {
            waterWidgetCard.style.background = '';
            waterWidgetCard.style.transition = '';
          }, 1400);
        }
      } catch (e) { /* silent */ }

      // Вызываем HEYS.Day.addWater напрямую (skipScroll=true, чтобы не скроллить)
      const addWaterFn = window.HEYS?.Day?.addWater;
      if (typeof addWaterFn === 'function') {
        try {
          addWaterFn(ml, true); // skipScroll = true
          // Виджет воды обновится через DOM событие heysWaterAdded (оптимистичное обновление)
        } catch (e) {
          // Fallback: HEYS.Day.addWater есть, но вызов мог упасть из-за неготового DayTab
          persistWaterLocally();
        }
      } else {
        // Fallback: если Day еще не смонтирован, сохраняем напрямую в localStorage
        persistWaterLocally();
      }

      // Скрыть анимацию через 800мс, только если это всё ещё текущая анимация
      setTimeout(() => {
        setWaterAnim(prev => (prev && prev.id === animId ? null : prev));
      }, 800);
    }, [selectedDate]);

    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
      HEYS.Widgets.undo?.();
    }, []);

    const handleRedo = useCallback(() => {
      HEYS.Widgets.redo?.();
    }, []);

    // Сбрасываем overlay при выходе из edit mode
    useEffect(() => {
      if (!isEditMode) setShowGridOverlay(false);
    }, [isEditMode]);

    // Количество строк для grid overlay (максимальная занятая строка + запас)
    const overlayRows = useMemo(() => {
      if (!widgets.length) return 8;
      const maxRow = widgets.reduce((max, w) => {
        return Math.max(max, (w.position?.row || 1) + (w.rows || 1) - 1);
      }, 4);
      return Math.max(8, maxRow + 2);
    }, [widgets]);

    // Render empty state (только после первичной гидратации layout)
    if (isLayoutHydrated && widgets.length === 0 && !isEditMode) {
      return React.createElement('div', { className: 'widgets-tab' },
        React.createElement('div', { className: 'widgets-empty' },
          React.createElement('div', { className: 'widgets-empty__icon' }, '📊'),
          React.createElement('div', { className: 'widgets-empty__title' }, 'Нет виджетов'),
          React.createElement('div', { className: 'widgets-empty__desc' },
            'Добавьте виджеты для отслеживания важных показателей'
          ),
          React.createElement('button', {
            className: 'widgets-empty__btn',
            onClick: () => setCatalogOpen(true)
          }, '+ Добавить виджет')
        ),
        React.createElement(CatalogModal, {
          isOpen: catalogOpen,
          onClose: () => setCatalogOpen(false),
          onSelect: handleCatalogSelect
        })
      );
    }

    return React.createElement('div', {
      className: `widgets-tab ${isEditMode ? 'widgets-tab--editing' : ''}`,
      ref: containerRef
    },
      // Header (пустой - кнопки перенесены в fixed блок снизу)
      React.createElement('div', { className: 'widgets-header' }),

      // Widgets Grid
      React.createElement('div', { className: 'widgets-grid-container' },
        React.createElement('div', {
          className: `widgets-grid ${isEditMode ? 'widgets-grid--editing' : ''}`,
          ref: gridRef
        },
          widgets.map((widget, idx) =>
            React.createElement(WidgetCard, {
              key: widget.id,
              widget,
              isEditMode,
              index: idx,
              onRemove: handleRemove,
              onSettings: setSettingsWidget
            })
          )
        ),
        isEditMode && showGridOverlay && React.createElement('div', {
          className: 'widgets-grid-overlay',
          style: { '--overlay-rows': overlayRows }
        },
          Array.from({ length: overlayRows * 4 }, (_, i) =>
            React.createElement('div', {
              className: 'widgets-grid-overlay__cell',
              key: i
            }, React.createElement('span', { className: 'widgets-grid-overlay__num' }, i + 1))
          )
        )
      ),

      // Modals
      React.createElement(CatalogModal, {
        isOpen: catalogOpen,
        onClose: () => setCatalogOpen(false),
        onSelect: handleCatalogSelect,
        existingTypes: new Set((widgets || []).map(w => w.type))
      }),
      React.createElement(SettingsModal, {
        widget: settingsWidget,
        isOpen: !!settingsWidget,
        onClose: () => setSettingsWidget(null),
        onSave: handleSettingsSave
      }),

      // === Fixed bottom edit controls (для всех устройств) ===
      React.createElement('div', { className: 'widgets-edit-controls' },
        // Кнопки добавить/отменить/вернуть - показываем только в edit mode
        isEditMode && React.createElement('div', { className: 'widgets-edit-controls__actions' },
          React.createElement('button', {
            id: 'tour-widgets-add',
            className: 'widgets-header__btn widgets-header__btn--add',
            onClick: () => setCatalogOpen(true)
          }, '+ Добавить'),
          React.createElement('button', {
            className: `widgets-header__btn widgets-header__btn--undo ${!historyInfo.canUndo ? 'disabled' : ''}`,
            onClick: handleUndo,
            disabled: !historyInfo.canUndo,
            title: 'Отменить (Ctrl+Z)'
          }, '↩'),
          React.createElement('button', {
            className: `widgets-header__btn widgets-header__btn--redo ${!historyInfo.canRedo ? 'disabled' : ''}`,
            onClick: handleRedo,
            disabled: !historyInfo.canRedo,
            title: 'Повторить (Ctrl+Shift+Z)'
          }, '↪'),
          React.createElement('button', {
            className: `widgets-header__btn widgets-header__btn--grid ${showGridOverlay ? 'active' : ''}`,
            onClick: () => setShowGridOverlay(prev => !prev),
            title: 'Показать нумерацию ячеек сетки'
          }, '⊞')
        ),
        // FAB кнопка редактирования - всегда видна (только на desktop)
        !isMobile && React.createElement('button', {
          id: 'tour-widgets-edit',
          className: `widgets-edit-controls__fab ${isEditMode ? 'active' : ''}`,
          onClick: toggleEdit
        }, isEditMode ? '✓ Готово' : '✏️ Изменить')
      ),

      // === FABs (mobile) ===
      isMobile && React.createElement(React.Fragment, null,
        // Edit FAB — снизу слева
        React.createElement('div', { className: 'widgets-fab-left' },
          React.createElement('button', {
            id: 'tour-widgets-edit', // ID для onboarding тура
            className: `widgets-edit-fab ${isEditMode ? 'active' : ''}`,
            onClick: toggleEdit,
            'aria-label': isEditMode ? 'Готово' : 'Изменить'
          }, isEditMode ? '✓' : '✏️')
        ),

        // Meal/Water FAB group — как на остальных вкладках (справа).
        // В edit-mode прячем, чтобы не мешали перетаскиванию.
        !isEditMode && React.createElement('div', { className: 'fab-group' },
          React.createElement('button', {
            className: 'meal-fab',
            onClick: () => goToDayAndRun('diary', 'addMeal', []),
            'aria-label': 'Добавить приём пищи'
          }, '🍽️'),
          React.createElement('div', { style: { position: 'relative' } },
            React.createElement('button', {
              className: 'water-fab',
              onClick: () => handleAddWater(200),
              'aria-label': 'Добавить стакан воды'
            }, '🥛'),
            // 💧 Анимация добавления воды
            waterAnim && React.createElement('div', {
              className: 'water-fab-anim',
              key: waterAnim.id // Force re-render just once per addition
            }, waterAnim.text)
          )
        )
      )
    );
  }

  // === Exports ===
  HEYS.Widgets.WidgetsTab = WidgetsTab;
  HEYS.Widgets.WidgetCard = WidgetCard;
  HEYS.Widgets.CatalogModal = CatalogModal;
  HEYS.Widgets.SettingsModal = SettingsModal;

  if (widgetsDebugEnabled() && widgetsOnce('widgets_ui_loaded')) {
    trackWidgetIssue('widgets_ui_loaded', { version: '1.1.0' });
  }

})(typeof window !== 'undefined' ? window : global);
