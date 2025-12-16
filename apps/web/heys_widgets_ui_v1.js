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
(function(global) {
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
  function WidgetCard({ widget, isEditMode, onRemove, onSettings }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = registry?.getType(widget.type);
    const category = registry?.getCategory(widgetType?.category);
    const elementRef = useRef(null);
    
    // Refs для resize handles (для native touch events)
    const handleNRef = useRef(null);
    const handleERef = useRef(null);
    const handleSRef = useRef(null);
    const handleWRef = useRef(null);

    // Drag-resize (без popover): тянем за хендлы на гранях → снап к доступным размерам
    const resizeDragRef = useRef({
      active: false,
      pointerId: null,
      isTouchBased: false, // true если запущено через touchstart (iOS Safari)
      direction: null, // 'n' | 'e' | 's' | 'w'
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
    
    // Pointer event handlers for DnD
    const handlePointerDown = useCallback((e) => {
      // Во время resize не должны стартовать DnD/long-press/prepareForDrag
      // (на iOS есть микродвижения пальца → drag стартует «сам»).
      if (resizeDragRef.current?.active) return;

      const t = e?.target;
      if (t && typeof t.closest === 'function') {
        // Клики/тачи по resize-хендлам и overlay не должны запускать drag
        if (t.closest('.widget__resize-handle') || t.closest('.widget__size-badge')) {
          return;
        }
      }
      HEYS.Widgets.dnd?.handlePointerDown?.(widget.id, e, elementRef.current);
    }, [widget.id]);

    const handlePointerMove = useCallback((e) => {
      if (resizeDragRef.current?.active) return;
      HEYS.Widgets.dnd?.handlePointerMove?.(e);
    }, []);

    const handlePointerUp = useCallback((e) => {
      if (resizeDragRef.current?.active) return;
      HEYS.Widgets.dnd?.handlePointerUp?.(widget.id, e);
    }, [widget.id]);
    
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
      const sizes = (availableSizes && availableSizes.length) ? availableSizes : [widget.size || '2x2'];
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

      return best || { sizeId: widget.size || '2x2', cols: widget.cols || 1, rows: widget.rows || 1 };
    }, [availableSizes, widget.size, widget.cols, widget.rows]);

    const updateResizePreview = useCallback((next) => {
      const ref = resizeDragRef.current;
      ref.last = next;
      ref.pending = next;
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
      if (!ref.active) return;
      ref.active = false;

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
      ref.pending = null;
      ref.last = null;

      const posChanged = !!finalPos && (finalPos.col !== basePos.col || finalPos.row !== basePos.row);

      if (finalSizeId && (finalSizeId !== baseSizeId || posChanged)) {
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
      e.stopPropagation();
      // Для pointer events вызываем preventDefault здесь
      // Для touch events preventDefault уже вызван в native listener (с { passive: false })
      if (!isTouchEvent) {
        e.preventDefault();
      }

      // Если DnD уже «подготовился» (в edit-mode prepareForDrag ставит listeners),
      // то при попытке resize он может внезапно стартовать. Отменяем.
      try {
        HEYS.Widgets.dnd?.cancel?.();
      } catch (err) {
        // ignore
      }

      const gridCols = getGridCols();
      const metrics = HEYS.Widgets.gridEngine?.getCellMetrics?.() || { cellWidth: 150, cellHeight: 76, gap: 12 };
      const unitX = (metrics.cellWidth || 150) + (metrics.gap || 12);
      const unitY = (metrics.cellHeight || 76) + (metrics.gap || 12);

      const { clientX, clientY } = getEventCoords(e);

      const ref = resizeDragRef.current;
      ref.active = true;
      ref.pointerId = isTouchEvent ? 'touch' : (e.pointerId ?? null);
      ref.isTouchBased = isTouchEvent;
      ref.direction = direction;
      ref.startX = clientX;
      ref.startY = clientY;
      ref.baseCols = widget.cols || 1;
      ref.baseRows = widget.rows || 1;
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
          console.log('[RESIZE] Removing stale touch listeners from document');
          document.removeEventListener('touchmove', ref.touchMoveHandler, { capture: true });
          document.removeEventListener('touchend', ref.touchEndHandler, { capture: true });
          document.removeEventListener('touchcancel', ref.touchEndHandler, { capture: true });
        }
        
        console.log('[RESIZE] Adding immediate touch listeners on document (capture)');
        
        // Сохраняем handlers в ref для возможности cleanup
        ref.touchMoveHandler = (te) => {
          console.log('[RESIZE] touchmove RAW, active:', ref.active, 'touches:', te.touches?.length);
          if (!ref.active) return;
          te.preventDefault();
          te.stopPropagation(); // Не даём другим handlers перехватить
          
          const touch = te.touches[0];
          if (!touch) return;
          
          const dx = touch.clientX - ref.startX;
          const dy = touch.clientY - ref.startY;

          const rawDeltaCols = Math.round(dx / unitX);
          const rawDeltaRows = Math.round(dy / unitY);

          const intentDeltaCols = (ref.direction === 'w') ? -rawDeltaCols : (ref.direction === 'e' ? rawDeltaCols : 0);
          const intentDeltaRows = (ref.direction === 'n') ? -rawDeltaRows : (ref.direction === 's' ? rawDeltaRows : 0);

          if (intentDeltaCols === ref.lastDeltaCols && intentDeltaRows === ref.lastDeltaRows) return;
          ref.lastDeltaCols = intentDeltaCols;
          ref.lastDeltaRows = intentDeltaRows;

          const targetCols = Math.max(1, Math.min(ref.baseCols + intentDeltaCols, gridCols));
          const targetRows = Math.max(1, ref.baseRows + intentDeltaRows);

          console.log('[RESIZE] touch calc:', { direction, dx, dy, intentDeltaCols, intentDeltaRows, targetCols, targetRows });

          const nearest = pickNearestSize(targetCols, targetRows, intentDeltaCols, intentDeltaRows);
          const cols = Math.max(1, Math.min(nearest.cols, gridCols));
          const rows = Math.max(1, nearest.rows);

          let col = ref.basePos.col;
          let row = ref.basePos.row;
          if (ref.direction === 'w') col = ref.fixedRight - cols;
          if (ref.direction === 'n') row = ref.fixedBottom - rows;
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
          console.log('[RESIZE] touch end - cleanup, ref.active was:', ref.active);
          ref.active = false; // ВАЖНО: сбрасываем active при touchend
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

        console.log('[RESIZE] About to add touchmove listener, handler exists:', !!ref.touchMoveHandler);
        // CRITICAL: capture: true гарантирует получение событий ДО любой отмены
        document.addEventListener('touchmove', ref.touchMoveHandler, { passive: false, capture: true });
        document.addEventListener('touchend', ref.touchEndHandler, { passive: true, capture: true });
        document.addEventListener('touchcancel', ref.touchEndHandler, { passive: true, capture: true });
        console.log('[RESIZE] Touch listeners added to document (capture phase)');
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

    // Pointer down handler (для desktop и некоторых мобильных)
    const handleResizeHandlePointerDown = useCallback((direction, e) => {
      // CRITICAL: stop propagation чтобы widget card handlePointerDown НЕ вызвал dnd._prepareForDrag
      e.stopPropagation();
      e.preventDefault();
      startResizeDrag(direction, e, false);
    }, [startResizeDrag]);

    // Touch start handler (для iOS Safari и PWA) — вызывается из native listener
    const handleResizeHandleTouchStart = useCallback((direction, e) => {
      console.log('[RESIZE] touchstart direction:', direction, 'touches:', e.touches?.length);
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
        { ref: handleWRef, dir: 'w' }
      ];
      
      const touchStartHandlers = handles.map(({ ref, dir }) => {
        const handler = (e) => {
          console.log('[RESIZE] native touchstart', dir, e.touches?.length);
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
      console.log('[RESIZE] useEffect started, adding window listeners');
      const ref = resizeDragRef.current;

      // Универсальный обработчик движения (pointer и touch)
      const onMove = (e) => {
        if (!ref.active) {
          console.log('[RESIZE] onMove skipped: ref.active=false');
          return;
        }
        
        // CRITICAL: preventDefault чтобы iOS не скроллил страницу
        e.preventDefault();
        
        console.log('[RESIZE] onMove type:', e.type, 'isTouchBased:', ref.isTouchBased);
        
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
        const intentDeltaCols = (ref.direction === 'w') ? -rawDeltaCols : (ref.direction === 'e' ? rawDeltaCols : 0);
        const intentDeltaRows = (ref.direction === 'n') ? -rawDeltaRows : (ref.direction === 's' ? rawDeltaRows : 0);

        // micro-оптимизация: не пересчитываем пока не изменились снап-делты
        if (intentDeltaCols === ref.lastDeltaCols && intentDeltaRows === ref.lastDeltaRows) return;
        ref.lastDeltaCols = intentDeltaCols;
        ref.lastDeltaRows = intentDeltaRows;

        const targetCols = Math.max(1, Math.min(ref.baseCols + intentDeltaCols, gridCols));
        const targetRows = Math.max(1, ref.baseRows + intentDeltaRows);

        console.log('[RESIZE] calc:', {
          direction: ref.direction,
          baseCols: ref.baseCols,
          baseRows: ref.baseRows,
          intentDeltaCols,
          intentDeltaRows,
          targetCols,
          targetRows
        });

        const nearest = pickNearestSize(targetCols, targetRows, intentDeltaCols, intentDeltaRows);
        console.log('[RESIZE] nearest:', nearest);
        const cols = Math.max(1, Math.min(nearest.cols, gridCols));
        const rows = Math.max(1, nearest.rows);

        // Позиция зависит от направления (якорим противоположную грань)
        let col = ref.basePos.col;
        let row = ref.basePos.row;

        if (ref.direction === 'w') {
          col = ref.fixedRight - cols;
        }
        if (ref.direction === 'n') {
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
      className: `widget ${sizeClass} ${typeClass} ${isEditMode ? 'widget--editing' : ''} ${isResizing ? 'widget--resizing' : ''}`,
      'data-widget-id': widget.id,
      'data-widget-type': widget.type,
      style: {
        // 1-based линии в CSS Grid
        gridColumn: hasGridPos ? `${gridCol + 1} / span ${previewCols}` : `span ${previewCols}`,
        gridRow: hasGridPos ? `${gridRow + 1} / span ${previewRows}` : `span ${previewRows}`,
        // В edit-mode оставляем вертикальный скролл, а сам drag защищён в core
        touchAction: isResizing ? 'none' : (isEditMode ? 'pan-y' : 'auto'),
        zIndex: isResizing ? 60 : undefined
      },
      onClick: handleClick,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    },
      // Widget Header (mini = без хедера)
      !isMini && React.createElement('div', { className: 'widget__header' },
        React.createElement('span', { className: 'widget__icon' }, widgetType?.icon || '📊'),
        React.createElement('span', { className: 'widget__title' }, widgetType?.name || widget.type)
      ),
      
      // Widget Content (placeholder - будет заменён конкретными виджетами)
      React.createElement('div', { className: 'widget__content' },
        React.createElement(WidgetContent, { widget: effectiveWidget, widgetType })
      ),

      // Edit mode: компактный бейдж размера (не перекрывает контент)
      isEditMode && React.createElement('div', {
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
        className: 'widget__delete-btn',
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onPointerMove: (e) => e.stopPropagation(),
        onClick: handleRemoveClick,
        title: 'Удалить'
      }, '✕'),
      
      // Edit Mode: Settings button (optional)
      isEditMode && widgetType?.settings && React.createElement('button', {
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
          className: 'widget__resize-handle widget__resize-handle--n',
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
          className: 'widget__resize-handle widget__resize-handle--e',
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
          className: 'widget__resize-handle widget__resize-handle--s',
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
          className: 'widget__resize-handle widget__resize-handle--w',
          onPointerDown: (e) => handleResizeHandlePointerDown('w', e),
          // onTouchStart заменён на native listener в useEffect
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить ширину: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить ширину: потяни. Сейчас: ${currentSizeLabel}`
        })
      )
    );
  }
  
  // === Widget Content Component (renders actual widget data) ===
  function WidgetContent({ widget, widgetType }) {
    // State для данных виджета
    const [data, setData] = useState(() => 
      HEYS.Widgets.data?.getDataForWidget?.(widget) || {}
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    // Подписка на обновления данных
    useEffect(() => {
      // Первоначальная загрузка
      const loadData = () => {
        try {
          const newData = HEYS.Widgets.data?.getDataForWidget?.(widget) || {};
          setData(newData);
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
      
      // Подписка на глобальные события HEYS (meal:added, water:added, etc.)
      const heysEvents = ['day:updated', 'meal:added', 'water:added', 'profile:updated'];
      heysEvents.forEach(evt => {
        if (typeof HEYS.events?.on === 'function') {
          HEYS.events.on(evt, loadData);
        }
      });
      
      return () => {
        unsubData?.();
        heysEvents.forEach(evt => {
          if (typeof HEYS.events?.off === 'function') {
            HEYS.events.off(evt, loadData);
          }
        });
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
      default:
        return React.createElement('div', { className: 'widget__placeholder' },
          widgetType?.icon || '📊',
          React.createElement('span', null, 'Нет данных')
        );
    }
  }
  
  // === Individual Widget Content Components ===
  
  function CaloriesWidgetContent({ widget, data }) {
    const eaten = data.eaten || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((eaten / target) * 100) : 0;
    const remaining = Math.max(0, target - eaten);

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : d.isTall ? 'tall' : 'std';
    
    const getColor = () => {
      if (pct < 50) return 'var(--ratio-crash)';
      if (pct < 75) return 'var(--ratio-low)';
      if (pct < 110) return 'var(--ratio-good)';
      return 'var(--ratio-over)';
    };
    
    const showPct = widget.settings?.showPercentage !== false;
    const showRemaining = widget.settings?.showRemaining !== false;
    const showLabel = !d.isMicro;
    const showProgress = !d.isMicro && !d.isTiny;
    const showRemainingLine = showRemaining && remaining > 0 && d.rows >= 2 && !d.isShort;

    return React.createElement('div', { className: `widget-calories widget-calories--${variant}` },
      React.createElement('div', { className: 'widget-calories__top' },
        React.createElement('div', { className: 'widget-calories__value', style: { color: getColor() } },
          eaten.toLocaleString('ru-RU')
        ),
        showPct ? React.createElement('div', { className: 'widget-calories__pct' }, `${pct}%`) : null
      ),
      showLabel
        ? React.createElement('div', { className: 'widget-calories__label' }, `из ${target.toLocaleString('ru-RU')} ккал`)
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
        ? React.createElement('div', { className: 'widget-calories__remaining' }, `Осталось: ${remaining.toLocaleString('ru-RU')}`)
        : null
    );
  }
  
  function WaterWidgetContent({ widget, data }) {
    const drunk = data.drunk || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((drunk / target) * 100) : 0;
    const glasses = Math.floor(drunk / 250);

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';
    const showProgress = !d.isMicro;
    const showPctPill = !d.isMicro && !d.isTiny;
    
    return React.createElement('div', { className: `widget-water widget-water--${variant}` },
      React.createElement('div', { className: 'widget-water__top' },
        React.createElement('div', { className: 'widget-water__value' },
          widget.settings?.showGlasses ? `${glasses} 🥛` : `${drunk} мл`
        ),
        d.isMicro ? React.createElement('div', { className: 'widget-water__pct-inline' }, `${pct}%`) : null
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

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';
    const showTarget = widget.settings?.showTarget !== false && !d.isMicro;
    const showQuality = widget.settings?.showQuality !== false && !!quality && !d.isTiny;
    
    const getEmoji = () => {
      if (hours >= target) return '😊';
      if (hours >= target - 1) return '😐';
      return '😴';
    };
    
    return React.createElement('div', { className: `widget-sleep widget-sleep--${variant}` },
      React.createElement('div', { className: 'widget-sleep__value' }, `${hours.toFixed(1)}ч ${getEmoji()}`),
      showTarget ? React.createElement('div', { className: 'widget-sleep__label' }, `из ${target}ч`) : null,
      showQuality ? React.createElement('div', { className: 'widget-sleep__quality' }, `Качество: ${quality}/10`) : null
    );
  }
  
  function StreakWidgetContent({ widget, data }) {
    const current = data.current || 0;
    const max = data.max || 0;

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';
    const showMax = widget.settings?.showMax !== false && max > current && !d.isTiny;
    const showFlame = widget.settings?.showFlame !== false && current > 0;
    
    return React.createElement('div', { className: `widget-streak widget-streak--${variant}` },
      React.createElement('div', { className: 'widget-streak__value' },
        showFlame ? '🔥 ' : '',
        current,
        d.isMicro ? null : React.createElement('span', { className: 'widget-streak__days' }, ' дн.')
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
    
    // MINI (1×1) — только число
    if (size === '1x1') {
      return React.createElement('div', { className: 'widget-weight widget-weight--1x1' },
        React.createElement(WeightValue, { scale: 'lg' })
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
    const km = widget.settings?.showKilometers ? (steps * 0.0007).toFixed(1) : null;

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';
    const showKm = !!km && !d.isTiny;
    const showGoalBar = widget.settings?.showGoal !== false && !d.isMicro;
    const showPctInline = d.isShort || d.isMicro;
    
    return React.createElement('div', { className: `widget-steps widget-steps--${variant}` },
      React.createElement('div', { className: 'widget-steps__top' },
        React.createElement('div', { className: 'widget-steps__value' }, steps.toLocaleString('ru-RU')),
        showPctInline ? React.createElement('div', { className: 'widget-steps__pct' }, `${Math.min(999, Math.max(0, pct))}%`) : null
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
    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';
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

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';
    
    const getStatusInfo = () => {
      switch (status) {
        case 'active': return { emoji: '📈', label: 'Волна активна', color: '#f97316' };
        case 'almost': return { emoji: '📉', label: 'Почти закончилась', color: '#eab308' };
        case 'soon': return { emoji: '⏳', label: 'Скоро закончится', color: '#22c55e' };
        case 'lipolysis': return { emoji: '🔥', label: 'Липолиз!', color: '#10b981' };
        default: return { emoji: '❓', label: 'Нет данных', color: '#94a3b8' };
      }
    };
    
    const info = getStatusInfo();
    
    const showTimer = widget.settings?.showTimer !== false && Number.isFinite(remaining) && remaining > 0;
    const showPhase = widget.settings?.showPhase !== false && !!phase && !d.isTiny;

    if (d.isMicro) {
      return React.createElement('div', { className: `widget-insulin widget-insulin--${variant}` },
        React.createElement('div', { className: 'widget-insulin__micro' },
          React.createElement('span', { className: 'widget-insulin__micro-emoji' }, info.emoji),
          showTimer ? React.createElement('span', { className: 'widget-insulin__micro-time' }, `${remaining}м`) : null
        )
      );
    }

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
    const configuredPeriod = widget.settings?.period || 'week';

    const d = getWidgetDims(widget);
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

    return React.createElement('div', { className: `widget-heatmap widget-heatmap--${variant}` },
      React.createElement('div', { className: `widget-heatmap__grid widget-heatmap__grid--${period}` },
        renderDays.map((day, i) =>
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

    const d = getWidgetDims(widget);
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : 'std';
    
    if (!day) {
      return React.createElement('div', { className: 'widget-cycle__empty' }, 'Нет данных');
    }
    
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
  
  // === Catalog Modal Component ===
  function CatalogModal({ isOpen, onClose, onSelect }) {
    const registry = HEYS.Widgets.registry;
    const categories = registry?.getCategories() || [];
    const availableTypes = registry?.getAvailableTypes() || [];
    
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
      console.log('[CatalogModal] Item clicked:', type);
      onSelect?.(type);
      HEYS.Widgets.emit('catalog:select', { type: type.type });
      onClose?.();
    };
    
    console.log('[CatalogModal] Rendering with', filteredTypes.length, 'types');
    
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
          filteredTypes.map(type =>
            React.createElement('div', {
              key: type.type,
              className: 'widgets-catalog__item',
              onClick: () => handleSelect(type)
            },
              React.createElement('div', { className: 'widgets-catalog__item-icon' }, type.icon),
              React.createElement('div', { className: 'widgets-catalog__item-info' },
                React.createElement('div', { className: 'widgets-catalog__item-name' }, type.name),
                React.createElement('div', { className: 'widgets-catalog__item-desc' }, type.description)
              )
            )
          )
        )
      )
    );
  }
  
  // === Settings Modal Component ===
  function SettingsModal({ widget, isOpen, onClose, onSave }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = widget ? registry?.getType(widget.type) : null;
    const [settings, setSettings] = useState({});
    
    useEffect(() => {
      if (widget) {
        setSettings({ ...widget.settings });
      }
    }, [widget]);
    
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
          // Size selector
          React.createElement('div', { className: 'widgets-settings__field' },
            React.createElement('label', null, 'Размер'),
            React.createElement('div', { className: 'widgets-settings__sizes' },
              widgetType.availableSizes.map(sizeId => {
                const size = registry.getSize(sizeId);
                return React.createElement('button', {
                  key: sizeId,
                  className: `widgets-settings__size ${widget.size === sizeId ? 'active' : ''}`,
                  onClick: () => HEYS.Widgets.state.resizeWidget(widget.id, sizeId)
                }, size.label);
              })
            )
          ),
          
          // Custom settings
          widgetType.settings && Object.entries(widgetType.settings).map(([key, def]) =>
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
          grid.style.setProperty('--widget-row-height', `${target}px`);
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
        console.log('[WidgetsTab] Updated selectedDate:', selectedDate);
      }
    }, [selectedDate]);
    
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

      // Subscribe to layout loaded (первичная загрузка)
      const unsubLoaded = HEYS.Widgets.on('layout:loaded', ({ layout }) => {
        setWidgets([...(layout || [])]);
        updateHistoryInfo();
        setIsLayoutHydrated(true);
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
    
    // Global pointer event handlers for DnD
    useEffect(() => {
      const handlePointerMove = (e) => {
        HEYS.Widgets.dnd?.handlePointerMove?.(e);
      };
      
      const handlePointerUp = (e) => {
        HEYS.Widgets.dnd?.handlePointerUp?.(null, e);
      };
      
      // Attach global listeners
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
      
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
      };
    }, []);
    
    // Handle catalog widget selection
    const handleCatalogSelect = useCallback((widgetType) => {
      console.log('[Widgets UI] handleCatalogSelect called:', widgetType);
      console.log('[Widgets UI] Registry:', HEYS.Widgets.registry);
      console.log('[Widgets UI] State:', HEYS.Widgets.state);
      
      if (!HEYS.Widgets.registry) {
        console.error('[Widgets UI] Registry not initialized!');
        return;
      }
      
      const widget = HEYS.Widgets.registry.createWidget(widgetType.type);
      console.log('[Widgets UI] Created widget:', widget);
      
      if (widget) {
        if (!HEYS.Widgets.state) {
          console.error('[Widgets UI] State not initialized!');
          return;
        }
        const added = HEYS.Widgets.state.addWidget(widget);
        console.log('[Widgets UI] Added widget:', added);
      } else {
        console.error('[Widgets UI] createWidget returned null for type:', widgetType.type);
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
    
    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
      HEYS.Widgets.undo?.();
    }, []);
    
    const handleRedo = useCallback(() => {
      HEYS.Widgets.redo?.();
    }, []);
    
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
      // Header with edit button
      React.createElement('div', { className: 'widgets-header' },
        React.createElement('div', { className: 'widgets-header__left' },
          isEditMode && React.createElement(React.Fragment, null,
            React.createElement('button', {
              className: 'widgets-header__btn widgets-header__btn--add',
              onClick: () => setCatalogOpen(true)
            }, '+ Добавить'),
            // Undo/Redo buttons
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
            }, '↪')
          )
        ),
        // На мобиле кнопку "Изменить" переносим в FAB снизу слева
        !isMobile && React.createElement('button', {
          className: `widgets-header__btn widgets-header__btn--edit ${isEditMode ? 'active' : ''}`,
          onClick: toggleEdit
        }, isEditMode ? '✓ Готово' : '✏️ Изменить')
      ),
      
      // Widgets Grid
      React.createElement('div', {
        className: `widgets-grid ${isEditMode ? 'widgets-grid--editing' : ''}`,
        ref: gridRef
      },
        widgets.map(widget =>
          React.createElement(WidgetCard, {
            key: widget.id,
            widget,
            isEditMode,
            onRemove: handleRemove,
            onSettings: setSettingsWidget
          })
        )
      ),
      
      // Modals
      React.createElement(CatalogModal, {
        isOpen: catalogOpen,
        onClose: () => setCatalogOpen(false),
        onSelect: handleCatalogSelect
      }),
      React.createElement(SettingsModal, {
        widget: settingsWidget,
        isOpen: !!settingsWidget,
        onClose: () => setSettingsWidget(null),
        onSave: handleSettingsSave
      }),

      // === FABs (mobile) ===
      isMobile && React.createElement(React.Fragment, null,
        // Edit FAB — снизу слева
        React.createElement('div', { className: 'widgets-fab-left' },
          React.createElement('button', {
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
          React.createElement('button', {
            className: 'water-fab',
            onClick: () => goToDayAndRun('stats', 'addWater', [200]),
            'aria-label': 'Добавить стакан воды'
          }, '🥛')
        )
      )
    );
  }
  
  // === Exports ===
  HEYS.Widgets.WidgetsTab = WidgetsTab;
  HEYS.Widgets.WidgetCard = WidgetCard;
  HEYS.Widgets.CatalogModal = CatalogModal;
  HEYS.Widgets.SettingsModal = SettingsModal;
  
  console.log('[HEYS] Widgets UI v1.1.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
