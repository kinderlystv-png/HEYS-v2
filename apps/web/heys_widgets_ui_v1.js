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
  
  // === Widget Card Component ===
  function WidgetCard({ widget, isEditMode, onRemove, onSettings }) {
    const registry = HEYS.Widgets.registry;
    const widgetType = registry?.getType(widget.type);
    const category = registry?.getCategory(widgetType?.category);
    const elementRef = useRef(null);

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
        if (t.closest('.widget__resize-handle') || t.closest('.widget__resize-overlay')) {
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
      return [typeDef?.defaultSize || widget.size || 'compact'];
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
      const sizes = (availableSizes && availableSizes.length) ? availableSizes : [widget.size || 'compact'];
      const reg = HEYS.Widgets.registry;
      const preferBigger = (deltaCols + deltaRows) >= 0;

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

      return best || { sizeId: widget.size || 'compact', cols: widget.cols || 1, rows: widget.rows || 1 };
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
      e.preventDefault();

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
      ref.baseSizeId = widget.size || 'compact';
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
    }, [getEventCoords, getGridCols, isEditMode, pickNearestSize, updateResizePreview, widget.cols, widget.rows, widget.size, widget?.position?.col, widget?.position?.row]);

    // Pointer down handler (для desktop и некоторых мобильных)
    const handleResizeHandlePointerDown = useCallback((direction, e) => {
      startResizeDrag(direction, e, false);
    }, [startResizeDrag]);

    // Touch start handler (для iOS Safari и PWA)
    const handleResizeHandleTouchStart = useCallback((direction, e) => {
      startResizeDrag(direction, e, true);
    }, [startResizeDrag]);

    useEffect(() => {
      const ref = resizeDragRef.current;
      if (!ref.active) return;

      // Универсальный обработчик движения (pointer и touch)
      const onMove = (e) => {
        if (!ref.active) return;
        
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

        const nearest = pickNearestSize(targetCols, targetRows, intentDeltaCols, intentDeltaRows);
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
    }, [endResizeDrag, getGridCols, pickNearestSize, updateResizePreview, widget?.position?.col]);
    
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
    const isMini = effectiveWidget?.size === 'mini';
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

      // Resize preview overlay
      isEditMode && isResizing && React.createElement('div', {
        className: 'widget__resize-overlay',
        onPointerDown: (e) => e.stopPropagation(),
        onPointerMove: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation()
      },
        React.createElement('div', { className: 'widget__resize-overlay-title' }, 'Размер'),
        React.createElement('div', { className: 'widget__resize-overlay-value' }, `${previewLabel} · ${previewCols}×${previewRows}`),
        !!resizePreview?.overflowRight && React.createElement('div', { className: 'widget__resize-overlay-hint' }, 'Не помещается справа — может сдвинуться')
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
          type: 'button',
          className: 'widget__resize-handle widget__resize-handle--n',
          onPointerDown: (e) => handleResizeHandlePointerDown('n', e),
          onTouchStart: (e) => handleResizeHandleTouchStart('n', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить высоту: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить высоту: потяни. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          type: 'button',
          className: 'widget__resize-handle widget__resize-handle--e',
          onPointerDown: (e) => handleResizeHandlePointerDown('e', e),
          onTouchStart: (e) => handleResizeHandleTouchStart('e', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить ширину: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить ширину: потяни. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          type: 'button',
          className: 'widget__resize-handle widget__resize-handle--s',
          onPointerDown: (e) => handleResizeHandlePointerDown('s', e),
          onTouchStart: (e) => handleResizeHandleTouchStart('s', e),
          onPointerUp: (e) => e.stopPropagation(),
          onPointerMove: (e) => e.stopPropagation(),
          onTouchEnd: (e) => e.stopPropagation(),
          onTouchMove: (e) => e.stopPropagation(),
          title: `Изменить высоту: потяни (сейчас: ${currentSizeLabel})`,
          'aria-label': `Изменить высоту: потяни. Сейчас: ${currentSizeLabel}`
        }),
        React.createElement('button', {
          type: 'button',
          className: 'widget__resize-handle widget__resize-handle--w',
          onPointerDown: (e) => handleResizeHandlePointerDown('w', e),
          onTouchStart: (e) => handleResizeHandleTouchStart('w', e),
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
          console.error('[Widget] Error loading data:', e);
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
    
    const getColor = () => {
      if (pct < 50) return 'var(--ratio-crash)';
      if (pct < 75) return 'var(--ratio-low)';
      if (pct < 110) return 'var(--ratio-good)';
      return 'var(--ratio-over)';
    };
    
    return React.createElement('div', { className: 'widget-calories' },
      React.createElement('div', { className: 'widget-calories__value', style: { color: getColor() } },
        eaten.toLocaleString('ru-RU')
      ),
      React.createElement('div', { className: 'widget-calories__label' },
        `из ${target.toLocaleString('ru-RU')} ккал`
      ),
      widget.settings?.showRemaining && remaining > 0 &&
        React.createElement('div', { className: 'widget-calories__remaining' },
          `Осталось: ${remaining.toLocaleString('ru-RU')}`
        ),
      widget.settings?.showPercentage &&
        React.createElement('div', { className: 'widget-calories__pct' }, `${pct}%`)
    );
  }
  
  function WaterWidgetContent({ widget, data }) {
    const drunk = data.drunk || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((drunk / target) * 100) : 0;
    const glasses = Math.floor(drunk / 250);
    
    return React.createElement('div', { className: 'widget-water' },
      React.createElement('div', { className: 'widget-water__value' },
        widget.settings?.showGlasses ? `${glasses} 🥛` : `${drunk} мл`
      ),
      React.createElement('div', { className: 'widget-water__progress' },
        React.createElement('div', {
          className: 'widget-water__bar',
          style: { width: `${Math.min(100, pct)}%` }
        })
      ),
      React.createElement('div', { className: 'widget-water__label' }, `${pct}%`)
    );
  }
  
  function SleepWidgetContent({ widget, data }) {
    const hours = data.hours || 0;
    const target = data.target || 8;
    const quality = data.quality;
    
    const getEmoji = () => {
      if (hours >= target) return '😊';
      if (hours >= target - 1) return '😐';
      return '😴';
    };
    
    return React.createElement('div', { className: 'widget-sleep' },
      React.createElement('div', { className: 'widget-sleep__value' },
        `${hours.toFixed(1)}ч ${getEmoji()}`
      ),
      widget.settings?.showTarget &&
        React.createElement('div', { className: 'widget-sleep__label' }, `из ${target}ч`),
      widget.settings?.showQuality && quality &&
        React.createElement('div', { className: 'widget-sleep__quality' }, `Качество: ${quality}/10`)
    );
  }
  
  function StreakWidgetContent({ widget, data }) {
    const current = data.current || 0;
    const max = data.max || 0;
    
    return React.createElement('div', { className: 'widget-streak' },
      React.createElement('div', { className: 'widget-streak__value' },
        widget.settings?.showFlame && current > 0 ? '🔥 ' : '',
        current,
        React.createElement('span', { className: 'widget-streak__days' }, ' дн.')
      ),
      widget.settings?.showMax && max > current &&
        React.createElement('div', { className: 'widget-streak__max' }, `Рекорд: ${max}`)
    );
  }
  
  /**
   * WeightWidgetContent — Адаптивный виджет веса
   * Размеры: mini(1×1), compact(2×2), medium(3×2), wide(4×2), tall3(2×3), tall(2×4), wide3(4×3), large(4×4)
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

    const size = widget?.size || 'compact';
    const showGoal = widget.settings?.showGoal !== false;
    const showTrend = widget.settings?.showTrend !== false;

    const hasCurrent = Number.isFinite(current);
    const hasGoal = Number.isFinite(goal) && goal > 0;
    
    // Цвета тренда
    const getTrendInfo = () => {
      if (!Number.isFinite(trend)) return null;
      if (trend < -0.02) return { cls: 'widget-weight__trend--down', emoji: '↓', label: 'снижается', color: '#22c55e' };
      if (trend > 0.02) return { cls: 'widget-weight__trend--up', emoji: '↑', label: 'растёт', color: '#ef4444' };
      return { cls: 'widget-weight__trend--stable', emoji: '→', label: 'стабилен', color: '#3b82f6' };
    };
    const trendInfo = getTrendInfo();
    
    // Форматирование weekChange
    const formatWeekChange = () => {
      if (!Number.isFinite(weekChange)) return null;
      const sign = weekChange >= 0 ? '+' : '';
      return `${sign}${weekChange.toFixed(1)} кг/нед`;
    };
    
    // ========== MINI (1×1) — Только число ==========
    if (size === 'mini') {
      return React.createElement('div', { className: 'widget-weight widget-weight--mini' },
        hasCurrent 
          ? React.createElement('div', { className: 'widget-weight__value widget-weight__value--mini' },
              current.toFixed(1),
              React.createElement('span', { className: 'widget-weight__unit' }, 'кг')
            )
          : React.createElement('div', { className: 'widget-weight__value widget-weight__value--mini' }, '—')
      );
    }
    
    // ========== COMPACT (2×2) — Вес + стрелка тренда ==========
    if (size === 'compact') {
      return React.createElement('div', { className: 'widget-weight widget-weight--compact' },
        hasCurrent 
          ? React.createElement('div', { className: 'widget-weight__value' }, `${current.toFixed(1)} кг`)
          : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
        showTrend && trendInfo &&
          React.createElement('div', { 
            className: `widget-weight__trend-arrow ${trendInfo.cls}`,
            style: { color: trendInfo.color }
          }, trendInfo.emoji)
      );
    }
    
    // ========== MEDIUM (3×2) — Вес + цель + тренд текстом ==========
    if (size === 'medium') {
      return React.createElement('div', { className: 'widget-weight widget-weight--medium' },
        React.createElement('div', { className: 'widget-weight__row' },
          hasCurrent 
            ? React.createElement('div', { className: 'widget-weight__value' }, `${current.toFixed(1)} кг`)
            : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
          showTrend && trendInfo &&
            React.createElement('span', { 
              className: 'widget-weight__trend-badge',
              style: { color: trendInfo.color }
            }, trendInfo.emoji, ' ', formatWeekChange())
        ),
        showGoal && hasGoal &&
          React.createElement('div', { className: 'widget-weight__goal' }, `Цель: ${goal} кг`)
      );
    }
    
    // ========== WIDE (4×2) — Вес + мини-спарклайн + прогноз ==========
    if (size === 'wide') {
      const sparklinePoints = sparkline.filter(s => s.weight).slice(-7);
      
      return React.createElement('div', { className: 'widget-weight widget-weight--wide' },
        React.createElement('div', { className: 'widget-weight__main' },
          React.createElement('div', { className: 'widget-weight__left' },
            hasCurrent 
              ? React.createElement('div', { className: 'widget-weight__value' }, `${current.toFixed(1)} кг`)
              : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
            showTrend && trendInfo &&
              React.createElement('div', { 
                className: 'widget-weight__trend-text',
                style: { color: trendInfo.color }
              }, trendInfo.emoji, ' ', formatWeekChange())
          ),
          // Мини-спарклайн
          sparklinePoints.length >= 2 &&
            React.createElement(WeightMiniSparkline, { 
              points: sparklinePoints, 
              width: 80, 
              height: 28,
              trendColor: trendInfo?.color || '#3b82f6'
            })
        ),
        React.createElement('div', { className: 'widget-weight__footer' },
          showGoal && hasGoal && React.createElement('span', { className: 'widget-weight__goal-inline' }, 
            `Цель: ${goal} кг`
          ),
          showGoal && hasGoal && weeksToGoal && React.createElement('span', { className: 'widget-weight__eta' },
            ` • ~${weeksToGoal} нед`
          )
        )
      );
    }
    
    // ========== TALL3 (2×3) — Вертикальный с прогресс-баром ==========
    if (size === 'tall3') {
      return React.createElement('div', { className: 'widget-weight widget-weight--tall3' },
        hasCurrent 
          ? React.createElement('div', { className: 'widget-weight__value widget-weight__value--large' }, 
              `${current.toFixed(1)} кг`)
          : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
        showTrend && trendInfo &&
          React.createElement('div', { 
            className: 'widget-weight__trend-vertical',
            style: { color: trendInfo.color }
          }, 
            React.createElement('span', { className: 'widget-weight__trend-emoji-big' }, trendInfo.emoji),
            React.createElement('span', { className: 'widget-weight__trend-week' }, formatWeekChange())
          ),
        // Прогресс-бар к цели (вертикальный)
        showGoal && hasGoal && progressPct !== null &&
          React.createElement('div', { className: 'widget-weight__progress-vertical' },
            React.createElement('div', { className: 'widget-weight__progress-track' },
              React.createElement('div', { 
                className: 'widget-weight__progress-fill',
                style: { height: `${Math.min(100, progressPct)}%` }
              })
            ),
            React.createElement('div', { className: 'widget-weight__goal-label' }, `${goal} кг`)
          )
      );
    }
    
    // ========== TALL (2×4) — Вертикальный с графиком ==========
    if (size === 'tall') {
      const sparklinePoints = sparkline.filter(s => s.weight).slice(-7);
      
      return React.createElement('div', { className: 'widget-weight widget-weight--tall' },
        hasCurrent 
          ? React.createElement('div', { className: 'widget-weight__value' }, `${current.toFixed(1)} кг`)
          : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
        showTrend && trendInfo &&
          React.createElement('div', { 
            className: 'widget-weight__trend-text',
            style: { color: trendInfo.color }
          }, trendInfo.emoji, ' ', formatWeekChange()),
        // Вертикальный график
        sparklinePoints.length >= 2 &&
          React.createElement(WeightMiniSparkline, { 
            points: sparklinePoints, 
            width: 70, 
            height: 70,
            trendColor: trendInfo?.color || '#3b82f6',
            showDots: true
          }),
        showGoal && hasGoal &&
          React.createElement('div', { className: 'widget-weight__goal-block' },
            React.createElement('div', { className: 'widget-weight__goal' }, `Цель: ${goal} кг`),
            weeksToGoal && React.createElement('div', { className: 'widget-weight__eta' }, `~${weeksToGoal} нед`)
          )
      );
    }
    
    // ========== WIDE3 (4×3) — Широкий с графиком ==========
    if (size === 'wide3') {
      const sparklinePoints = sparkline.filter(s => s.weight).slice(-7);
      
      return React.createElement('div', { className: 'widget-weight widget-weight--wide3' },
        React.createElement('div', { className: 'widget-weight__header' },
          React.createElement('div', { className: 'widget-weight__left' },
            hasCurrent 
              ? React.createElement('div', { className: 'widget-weight__value widget-weight__value--large' }, 
                  `${current.toFixed(1)} кг`)
              : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
            showTrend && trendInfo &&
              React.createElement('div', { 
                className: 'widget-weight__trend-text',
                style: { color: trendInfo.color }
              }, trendInfo.emoji, ' ', formatWeekChange())
          )
        ),
        // График 7 дней
        sparklinePoints.length >= 2 &&
          React.createElement(WeightMiniSparkline, { 
            points: sparklinePoints, 
            width: 200, 
            height: 60,
            trendColor: trendInfo?.color || '#3b82f6',
            showDots: true,
            showLabels: true
          }),
        React.createElement('div', { className: 'widget-weight__footer' },
          showGoal && hasGoal && React.createElement('span', { className: 'widget-weight__goal-inline' }, 
            `Цель: ${goal} кг`
          ),
          weeksToGoal && React.createElement('span', { className: 'widget-weight__eta' },
            ` • Осталось ~${weeksToGoal} нед`
          )
        )
      );
    }
    
    // ========== LARGE (4×4) — Полная аналитика ==========
    if (size === 'large') {
      const sparklinePoints = sparkline.slice(-14); // 14 дней
      const hasSparkline = sparklinePoints.filter(s => s.weight).length >= 2;
      
      return React.createElement('div', { className: 'widget-weight widget-weight--large' },
        // Заголовок: вес + BMI
        React.createElement('div', { className: 'widget-weight__header' },
          React.createElement('div', { className: 'widget-weight__left' },
            hasCurrent 
              ? React.createElement('div', { className: 'widget-weight__value widget-weight__value--xlarge' }, 
                  `${current.toFixed(1)} кг`)
              : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных'),
            showTrend && trendInfo &&
              React.createElement('div', { 
                className: 'widget-weight__trend-text',
                style: { color: trendInfo.color }
              }, trendInfo.emoji, ' ', formatWeekChange())
          ),
          bmi && React.createElement('div', { className: 'widget-weight__bmi' },
            React.createElement('div', { className: 'widget-weight__bmi-value' }, bmi.toFixed(1)),
            React.createElement('div', { 
              className: 'widget-weight__bmi-label',
              style: { color: bmiCategory?.color }
            }, bmiCategory?.label || 'BMI')
          )
        ),
        // Полный график 14 дней
        hasSparkline &&
          React.createElement(WeightMiniSparkline, { 
            points: sparklinePoints, 
            width: 280, 
            height: 90,
            trendColor: trendInfo?.color || '#3b82f6',
            showDots: true,
            showLabels: true,
            showGoalLine: showGoal && hasGoal,
            goalWeight: goal
          }),
        // Аналитика внизу
        React.createElement('div', { className: 'widget-weight__analytics' },
          monthChange && React.createElement('div', { className: 'widget-weight__stat' },
            React.createElement('span', { className: 'widget-weight__stat-icon' }, '📊'),
            React.createElement('span', null, `Прогноз: ${monthChange > 0 ? '+' : ''}${monthChange} кг/мес`)
          ),
          showGoal && hasGoal && weeksToGoal && React.createElement('div', { className: 'widget-weight__stat' },
            React.createElement('span', { className: 'widget-weight__stat-icon' }, '🎯'),
            React.createElement('span', null, `До цели: ~${weeksToGoal} нед`)
          ),
          hasCleanTrend && React.createElement('div', { className: 'widget-weight__stat widget-weight__stat--clean' },
            React.createElement('span', { className: 'widget-weight__stat-icon' }, '🌸'),
            React.createElement('span', null, 'Чистый тренд')
          )
        )
      );
    }
    
    // Default fallback — compact style
    return React.createElement('div', { className: 'widget-weight widget-weight--compact' },
      hasCurrent 
        ? React.createElement('div', { className: 'widget-weight__value' }, `${current.toFixed(1)} кг`)
        : React.createElement('div', { className: 'widget-weight__empty' }, 'Нет данных')
    );
  }
  
  /**
   * WeightMiniSparkline — Мини-график веса для виджетов
   */
  function WeightMiniSparkline({ points, width, height, trendColor, showDots, showLabels, showGoalLine, goalWeight }) {
    const validPoints = points.filter(p => p.weight !== null);
    if (validPoints.length < 2) return null;
    
    const weights = validPoints.map(p => p.weight);
    const minW = Math.min(...weights) - 0.3;
    const maxW = Math.max(...weights) + 0.3;
    const range = Math.max(1, maxW - minW);
    
    const paddingX = showLabels ? 8 : 4;
    const paddingY = showLabels ? 12 : 4;
    const chartW = width - paddingX * 2;
    const chartH = height - paddingY * 2;
    
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
      viewBox: `0 0 ${width} ${height}`,
      width: width,
      height: height
    },
      // Линия цели (пунктир)
      goalY !== null && goalY > paddingY && goalY < height - paddingY &&
        React.createElement('line', {
          x1: paddingX,
          y1: goalY,
          x2: width - paddingX,
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
          y: height - 2,
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
    
    return React.createElement('div', { className: 'widget-steps' },
      React.createElement('div', { className: 'widget-steps__value' },
        steps.toLocaleString('ru-RU')
      ),
      km && React.createElement('div', { className: 'widget-steps__km' }, `${km} км`),
      widget.settings?.showGoal &&
        React.createElement('div', { className: 'widget-steps__progress' },
          React.createElement('div', {
            className: 'widget-steps__bar',
            style: { width: `${Math.min(100, pct)}%` }
          })
        )
    );
  }
  
  function MacrosWidgetContent({ widget, data }) {
    const { protein, fat, carbs, proteinTarget, fatTarget, carbsTarget } = data;
    
    const MacroBar = ({ label, value, target, color }) => {
      const pct = target > 0 ? Math.round((value / target) * 100) : 0;
      return React.createElement('div', { className: 'widget-macros__row' },
        React.createElement('span', { className: 'widget-macros__label' }, label),
        React.createElement('div', { className: 'widget-macros__bar-container' },
          React.createElement('div', {
            className: 'widget-macros__bar',
            style: { width: `${Math.min(100, pct)}%`, backgroundColor: color }
          })
        ),
        widget.settings?.showGrams &&
          React.createElement('span', { className: 'widget-macros__value' }, `${Math.round(value)}г`)
      );
    };
    
    return React.createElement('div', { className: 'widget-macros' },
      React.createElement(MacroBar, {
        label: 'Б', value: protein || 0, target: proteinTarget || 100, color: '#ef4444'
      }),
      React.createElement(MacroBar, {
        label: 'Ж', value: fat || 0, target: fatTarget || 70, color: '#eab308'
      }),
      React.createElement(MacroBar, {
        label: 'У', value: carbs || 0, target: carbsTarget || 250, color: '#3b82f6'
      })
    );
  }
  
  function InsulinWidgetContent({ widget, data }) {
    const status = data.status || 'unknown';
    const remaining = data.remaining;
    const phase = data.phase;
    
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
    
    return React.createElement('div', { className: 'widget-insulin' },
      React.createElement('div', { className: 'widget-insulin__status', style: { color: info.color } },
        info.emoji, ' ', info.label
      ),
      widget.settings?.showTimer && remaining > 0 &&
        React.createElement('div', { className: 'widget-insulin__timer' },
          `${remaining} мин`
        ),
      widget.settings?.showPhase && phase &&
        React.createElement('div', { className: 'widget-insulin__phase' }, phase)
    );
  }
  
  function HeatmapWidgetContent({ widget, data }) {
    const days = data.days || [];
    const configuredPeriod = widget.settings?.period || 'week';
    // В wide (и любом не-large) делаем компактный недельный вид,
    // чтобы не «съедал» высоту карточки.
    const period = widget?.size === 'large' ? configuredPeriod : 'week';
    
    return React.createElement('div', { className: 'widget-heatmap' },
      React.createElement('div', { className: `widget-heatmap__grid widget-heatmap__grid--${period}` },
        days.map((day, i) =>
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
    
    if (!day) {
      return React.createElement('div', { className: 'widget-cycle__empty' }, 'Нет данных');
    }
    
    return React.createElement('div', { className: 'widget-cycle' },
      React.createElement('div', { className: 'widget-cycle__day' },
        `День ${day}`
      ),
      widget.settings?.showPhase && phase &&
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
