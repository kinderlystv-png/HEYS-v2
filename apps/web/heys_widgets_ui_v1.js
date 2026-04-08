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
  const ReactDOM = global.ReactDOM;
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

  function getGridCellNumber(col, row) {
    const safeCol = Number.isFinite(col) ? col : 0;
    const safeRow = Number.isFinite(row) ? row : 0;
    return safeRow * 4 + safeCol + 1;
  }

  function getWidgetOccupiedCellNumbers(widget) {
    const { cols, rows } = getWidgetDims(widget);
    const startCol = Number.isFinite(widget?.position?.col) ? widget.position.col : 0;
    const startRow = Number.isFinite(widget?.position?.row) ? widget.position.row : 0;
    const cells = [];

    for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < cols; colOffset += 1) {
        cells.push(getGridCellNumber(startCol + colOffset, startRow + rowOffset));
      }
    }

    return cells;
  }

  function formatSettingPrimitiveValue(value) {
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '');
    if (typeof value === 'string') return value;
    if (value == null) return 'null';

    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function buildWidgetSettingsDebug(widget, widgetType) {
    const settings = widget?.settings && typeof widget.settings === 'object' ? widget.settings : {};
    const settingEntries = Object.entries(settings).filter(([, value]) => value !== undefined);
    const typeSettings = {
      ...(widgetType?.settings || {}),
      ...(widgetType?.settingsBySize?.[widget?.size] || {})
    };
    const scaleLabels = Object.fromEntries(
      (Array.isArray(widgetType?.scalableElements) ? widgetType.scalableElements : [])
        .map((element) => [element?.key, element?.label || element?.key || 'scale'])
    );

    if (!settingEntries.length) {
      return {
        summary: 'default settings',
        details: ['default settings'],
        raw: null
      };
    }

    const details = [];
    const raw = {};

    settingEntries.forEach(([key, value]) => {
      if (key === 'elementScales' && value && typeof value === 'object' && !Array.isArray(value)) {
        const scaleEntries = Object.entries(value)
          .filter(([, scaleValue]) => typeof scaleValue === 'number' && Number.isFinite(scaleValue))
          .sort(([a], [b]) => a.localeCompare(b, 'ru'));

        if (!scaleEntries.length) {
          details.push('scale: default');
          raw[key] = {};
          return;
        }

        details.push(`scale: ${scaleEntries.map(([scaleKey, scaleValue]) => {
          const label = scaleLabels[scaleKey] || scaleKey;
          return `${label} ${Math.round(scaleValue * 100)}%`;
        }).join(', ')}`);
        raw[key] = Object.fromEntries(scaleEntries);
        return;
      }

      const label = typeSettings?.[key]?.label || key;
      details.push(`${label}: ${formatSettingPrimitiveValue(value)}`);
      raw[key] = value;
    });

    return {
      summary: details.join('; '),
      details,
      raw
    };
  }

  function formatWidgetsLayoutForClipboard(widgets, options = {}) {
    const registry = HEYS.Widgets?.registry;
    const list = Array.isArray(widgets) ? widgets.slice() : [];
    const defaultHomeTab = typeof options.defaultHomeTab === 'string' ? options.defaultHomeTab : 'unknown';

    const ordered = list.sort((a, b) => {
      const rowA = Number.isFinite(a?.position?.row) ? a.position.row : 0;
      const rowB = Number.isFinite(b?.position?.row) ? b.position.row : 0;
      if (rowA !== rowB) return rowA - rowB;

      const colA = Number.isFinite(a?.position?.col) ? a.position.col : 0;
      const colB = Number.isFinite(b?.position?.col) ? b.position.col : 0;
      return colA - colB;
    });

    const humanLines = ordered.map((widget, index) => {
      const typeMeta = typeof registry?.getType === 'function' ? registry.getType(widget?.type) : null;
      const title = typeMeta?.name || widget?.type || `widget-${index + 1}`;
      const { cols, rows } = getWidgetDims(widget);
      const startCol = Number.isFinite(widget?.position?.col) ? widget.position.col : 0;
      const startRow = Number.isFinite(widget?.position?.row) ? widget.position.row : 0;
      const endCol = startCol + cols;
      const endRow = startRow + rows;
      const cells = getWidgetOccupiedCellNumbers(widget);
      const shortId = typeof widget?.id === 'string' ? widget.id.slice(0, 12) : 'unknown';
      const settingsDebug = buildWidgetSettingsDebug(widget, typeMeta);

      return `${index + 1}. ${title} [${widget?.type || 'unknown'}] — ${widget?.size || `${cols}x${rows}`} — col ${startCol + 1}-${endCol}, row ${startRow + 1}-${endRow} — cells: ${cells.join(', ')} — id: ${shortId} — settings: ${settingsDebug.summary}`;
    });

    const rawLayout = ordered.map((widget) => ({
      title: (typeof registry?.getType === 'function' ? registry.getType(widget?.type)?.name : null) || widget?.type || null,
      id: widget?.id || null,
      type: widget?.type || null,
      size: widget?.size || null,
      position: {
        col: Number.isFinite(widget?.position?.col) ? widget.position.col : 0,
        row: Number.isFinite(widget?.position?.row) ? widget.position.row : 0,
      },
      dims: (() => {
        const { cols, rows } = getWidgetDims(widget);
        return { cols, rows };
      })(),
      cells: getWidgetOccupiedCellNumbers(widget),
      settings: buildWidgetSettingsDebug(widget, typeof registry?.getType === 'function' ? registry.getType(widget?.type) : null).raw
    }));

    return [
      '=== HEYS Widgets Layout Log ===',
      `Date: ${new Date().toISOString()}`,
      'Grid: 4 columns',
      `Home tab: ${defaultHomeTab}`,
      `Widgets: ${ordered.length}`,
      '',
      '--- Human layout ---',
      ...(humanLines.length ? humanLines : ['(layout is empty)']),
      '',
      '--- Raw layout ---',
      JSON.stringify(rawLayout, null, 2)
    ].join('\n');
  }

  function getCascadeEventTone(weight) {
    if (weight <= -0.5) return 'bad';
    if (weight < 0) return 'warn';
    if (weight === 0) return 'neutral';
    if (weight <= 0.5) return 'good';
    if (weight <= 1.5) return 'great';
    return 'peak';
  }

  function getCascadeBadgeTone(pct) {
    if (pct >= 85) return 'great';
    if (pct >= 70) return 'good';
    if (pct >= 55) return 'info';
    if (pct >= 35) return 'warn';
    return 'bad';
  }

  function getCascadeTrendMeta(trend) {
    switch (trend) {
      case 'up':
        return { key: 'up', arrow: '↑', label: 'Рост' };
      case 'down':
        return { key: 'down', arrow: '↓', label: 'Снижение' };
      default:
        return { key: 'flat', arrow: '→', label: 'Без изменений' };
    }
  }

  function getCascadeDayBalanceMeta(events) {
    const sharedMeta = HEYS.CascadeCard?.computeCEBMetaFromEvents?.(events);
    const score = typeof sharedMeta?.scoreRaw === 'number' ? sharedMeta.scoreRaw : (sharedMeta?.score || 0);
    const confidence = typeof sharedMeta?.confidenceRaw === 'number' ? sharedMeta.confidenceRaw : (sharedMeta?.confidence || 0);
    const tone = score >= 8 ? 'good' : (score >= 6 ? 'warn' : 'bad');

    return {
      score,
      confidence,
      tone,
      isEarly: confidence < 1
    };
  }

  function renderCascadeStrip(data, options = {}) {
    const size = options.size || '4x1';
    const maxDots = Number.isFinite(options.maxDots) ? options.maxDots : (size === '3x1' ? 8 : 10);
    const placeholderCount = Number.isFinite(options.placeholderCount) ? options.placeholderCount : (size === '3x1' ? 6 : 8);
    const extraClassName = options.className || '';
    const liveEvents = options.useLiveCurrentCascade === true && Array.isArray(window.HEYS?._lastCrs?.events)
      ? window.HEYS._lastCrs.events
      : null;
    const allEvents = Array.isArray(liveEvents) && liveEvents.length > 0
      ? liveEvents
      : (Array.isArray(data?.events) ? data.events : []);
    const events = allEvents.slice(-maxDots);
    const pct = Math.max(0, Math.min(100, Math.round(Number(data?.pct) || 0)));
    const trendMeta = getCascadeTrendMeta(data?.trend);
    const badgeTone = getCascadeBadgeTone(pct);
    const hasData = (data?.hasData === true && events.length > 0) || pct > 0;
    const placeholders = Array.from({ length: placeholderCount });
    const dotsToRender = hasData ? events : placeholders;
    const showDayBalanceBadge = options.showDayBalanceBadge === true && hasData;
    const metricInlineWithLabel = options.metricInlineWithLabel === true && showDayBalanceBadge;
    const footerLabel = options.footerLabel || 'Позитивный каскад';
    const dayBalanceMeta = getCascadeDayBalanceMeta(allEvents);
    // Per-date CEB cache override: use accurate full-cascade CEB when available
    if (typeof data?.cebCached === 'number') {
      dayBalanceMeta.score = data.cebCached;
      dayBalanceMeta.tone = data.cebCached >= 8 ? 'good' : (data.cebCached >= 6 ? 'warn' : 'bad');
      if (typeof data?.cebCachedConf === 'number') {
        dayBalanceMeta.confidence = data.cebCachedConf;
        dayBalanceMeta.isEarly = data.cebCachedConf < 1;
      }
    }
    const dayBalanceOpacity = 0.45 + dayBalanceMeta.confidence * 0.55;

    return React.createElement('div', {
      className: ['widget-cascade', `widget-cascade--${size}`, extraClassName, metricInlineWithLabel ? 'widget-cascade--metric-inline' : '', !hasData ? 'widget-cascade--empty' : '']
        .filter(Boolean)
        .join(' ')
    },
      React.createElement('div', {
        className: 'widget-cascade__dots',
        style: { '--dot-total': dotsToRender.length }
      },
        dotsToRender.map((event, index) => {
          if (!event) {
            return React.createElement('span', {
              key: `cascade-placeholder-${index}`,
              className: 'widget-cascade__dot widget-cascade__dot--placeholder',
              'aria-hidden': 'true'
            });
          }

          const tone = getCascadeEventTone(Number(event?.weight) || 0);
          const weight = Number(event?.weight) || 0;
          const weightLabel = `${weight > 0 ? '+' : ''}${weight.toFixed(1)}`;
          const isLatestPositive = index === dotsToRender.length - 1 && event?.positive;

          return React.createElement('span', {
            key: `cascade-dot-${index}-${event?.type || 'event'}`,
            className: `widget-cascade__dot widget-cascade__dot--${tone} ${isLatestPositive ? 'widget-cascade__dot--latest' : ''}`,
            style: { '--dot-i': index },
            title: `${event?.label || 'Событие'} (${weightLabel})`
          });
        })
      ),
      showDayBalanceBadge
        ? metricInlineWithLabel
          ? [
            React.createElement('div', { className: 'widget-cascade__aside', key: 'cascade-aside' },
              React.createElement('div', {
                className: `widget-cascade__day-balance widget-cascade__day-balance--${dayBalanceMeta.tone}${dayBalanceMeta.isEarly ? ' widget-cascade__day-balance--early' : ''}`,
                style: { opacity: dayBalanceOpacity },
                title: `Баланс дня${dayBalanceMeta.isEarly ? ' (предварительно)' : ''}`
              },
                React.createElement('span', { className: 'widget-cascade__day-balance-value' }, dayBalanceMeta.score.toFixed(1))
              )
            ),
            React.createElement('div', { className: 'widget-cascade__footer', key: 'cascade-footer' },
              React.createElement('span', { className: 'widget-cascade__footer-label' }, footerLabel),
              React.createElement('div', {
                className: `widget-cascade__metric widget-cascade__metric--${badgeTone}`,
                title: trendMeta.label
              },
                React.createElement('span', { className: 'widget-cascade__metric-value' }, `${pct}%`),
                React.createElement('span', {
                  className: `widget-cascade__metric-arrow widget-cascade__metric-arrow--${trendMeta.key}`,
                  'aria-label': trendMeta.label
                }, trendMeta.arrow)
              )
            )
          ]
          : React.createElement('div', { className: 'widget-cascade__aside' },
            React.createElement('div', {
              className: `widget-cascade__day-balance widget-cascade__day-balance--${dayBalanceMeta.tone}${dayBalanceMeta.isEarly ? ' widget-cascade__day-balance--early' : ''}`,
              style: { opacity: dayBalanceOpacity },
              title: `Баланс дня${dayBalanceMeta.isEarly ? ' (предварительно)' : ''}`
            },
              React.createElement('span', { className: 'widget-cascade__day-balance-value' }, dayBalanceMeta.score.toFixed(1))
            ),
            React.createElement('div', {
              className: `widget-cascade__metric widget-cascade__metric--${badgeTone}`,
              title: trendMeta.label
            },
              React.createElement('span', { className: 'widget-cascade__metric-value' }, `${pct}%`),
              React.createElement('span', {
                className: `widget-cascade__metric-arrow widget-cascade__metric-arrow--${trendMeta.key}`,
                'aria-label': trendMeta.label
              }, trendMeta.arrow)
            )
          )
        : React.createElement('div', {
          className: `widget-cascade__badge widget-cascade__badge--${badgeTone}`,
          title: trendMeta.label
        },
          React.createElement('span', { className: 'widget-cascade__badge-value' }, `${pct}%`),
          React.createElement('span', {
            className: `widget-cascade__badge-arrow widget-cascade__badge-arrow--${trendMeta.key}`,
            'aria-label': trendMeta.label
          }, trendMeta.arrow)
        )
    );
  }

  // Size-aware soft-clamp: caps effective element scales for tight widget sizes.
  // User's stored settings stay untouched — only the rendered CSS vars are clamped.
  function clampElementScalesForSize(elementScales, dims) {
    if (!elementScales || !dims) return elementScales;
    const { area, isMicro, isTiny, isShort } = dims;

    // Determine max allowed scale for this widget size
    let maxAllowed;
    if (isMicro) maxAllowed = 1.15;  // 1×1 — almost no room
    else if (isTiny) maxAllowed = 1.35;  // 2×1, 1×2
    else if (isShort) maxAllowed = 1.5;  // 3×1, 4×1
    else return elementScales;            // larger sizes — no clamp

    let changed = false;
    const clamped = {};
    const keys = Object.keys(elementScales);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = elementScales[k];
      if (typeof v === 'number' && v > maxAllowed) {
        clamped[k] = maxAllowed;
        changed = true;
      } else {
        clamped[k] = v;
      }
    }
    return changed ? clamped : elementScales;
  }

  function getElementScaleMetrics(elementScales) {
    const entries = Object.entries(elementScales || {}).filter(([, val]) => typeof val === 'number' && Number.isFinite(val));
    const activeValues = entries.map(([, val]) => val).filter((val) => val !== 1);
    const enlargedValues = activeValues.filter((val) => val > 1);
    const maxScale = enlargedValues.length ? Math.max(...enlargedValues) : 1;
    const growth = Math.max(0, maxScale - 1);

    return {
      entries,
      hasScales: activeValues.length > 0,
      maxScale,
      growth,
      bleed: growth > 0 ? Math.min(40, Math.ceil(growth * 26)) : 0,
      gapXs: growth > 0 ? Math.min(6, Number((growth * 4).toFixed(2))) : 0,
      gapSm: growth > 0 ? Math.min(8, Number((growth * 5).toFixed(2))) : 0,
      gapMd: growth > 0 ? Math.min(10, Number((growth * 6).toFixed(2))) : 0,
      padX: growth > 0 ? Math.min(8, Number((growth * 4).toFixed(2))) : 0,
      padY: growth > 0 ? Math.min(10, Number((growth * 5).toFixed(2))) : 0,
      safeBottom: growth > 0 ? Math.min(12, Number((growth * 6).toFixed(2))) : 0,
    };
  }

  function buildElementScaleStyle(elementScales, options = {}) {
    const metrics = options.metrics || getElementScaleMetrics(elementScales);
    const base = { ...(options.base || {}) };

    if (metrics.hasScales) {
      base['--widget-scale-max'] = String(metrics.maxScale);
      base['--widget-scale-gap-xs'] = `${metrics.gapXs}px`;
      base['--widget-scale-gap-sm'] = `${metrics.gapSm}px`;
      base['--widget-scale-gap-md'] = `${metrics.gapMd}px`;
      base['--widget-scale-pad-x'] = `${metrics.padX}px`;
      base['--widget-scale-pad-y'] = `${metrics.padY}px`;
      base['--widget-scale-safe-bottom'] = `${metrics.safeBottom}px`;
    }

    metrics.entries.forEach(([key, val]) => {
      if (val !== 1) {
        base[`--es-${key}`] = String(val);
      }
    });

    return base;
  }

  // === Widget Card Component ===
  // Обёрнут в React.memo — изолирует от ре-рендеров родителя,
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

    // Size-aware soft-clamp: cap element scales for tight widget sizes
    const widgetDims = useMemo(() => getWidgetDims(effectiveWidget), [effectiveWidget]);
    const effectiveElementScales = useMemo(
      () => clampElementScalesForSize(widget?.settings?.elementScales, widgetDims),
      [widget?.settings?.elementScales, widgetDims]
    );
    const scaleMetrics = useMemo(() => getElementScaleMetrics(effectiveElementScales), [effectiveElementScales]);
    const hasScales = scaleMetrics.hasScales;

    return React.createElement('div', {
      ref: elementRef,
      className: `widget ${sizeClass} ${typeClass} ${isEditMode ? 'widget--editing' : ''} ${isResizing ? 'widget--resizing' : ''} ${isResizing && isResizeSnap ? 'widget--resize-snap' : ''} ${hasScales ? 'widget--has-scales' : ''}`,
      'data-widget-id': widget.id,
      'data-widget-type': widget.type,
      style: (() => {
        const s = {
          // 1-based линии в CSS Grid
          gridColumn: hasGridPos ? `${gridCol + 1} / span ${previewCols}` : `span ${previewCols}`,
          gridRow: hasGridPos ? `${gridRow + 1} / span ${previewRows}` : `span ${previewRows}`,
          // В edit-mode отключаем touchAction чтобы браузер не перехватывал жест для scroll
          touchAction: (isEditMode || isResizing) ? 'none' : 'pan-y',
          zIndex: isResizing ? 60 : undefined
        };
        // Inject element scale CSS custom properties from settings (size-clamped)
        Object.assign(s, buildElementScaleStyle(effectiveElementScales, { metrics: scaleMetrics }));
        return s;
      })(),
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
      isEditMode && (widgetType?.settings || widgetType?.scalableElements) && React.createElement('button', {
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

      // Подписка на изменение настроек виджета (напр. смена periodDays через модалку)
      const unsubSettings = HEYS.Widgets.on?.('widget:settings', ({ widget: updatedWidget }) => {
        if (updatedWidget?.id !== widget.id) return;
        try {
          const newData = HEYS.Widgets.data?.getDataForWidget?.(updatedWidget) || {};
          setData(prev => {
            const prevKeys = Object.keys(prev);
            const newKeys = Object.keys(newData);
            if (prevKeys.length === newKeys.length && prevKeys.every(k => prev[k] === newData[k])) return prev;
            return newData;
          });
          setError(null);
        } catch (e) { /* ignore */ }
      });

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

      // Cascade refresh: listen for CRS recompute so macros/cascade widgets update after client switch
      const handleCrsUpdated = (widget.type === 'macros' || widget.type === 'cascade') ? loadData : null;
      if (handleCrsUpdated) {
        window.addEventListener('heys:crs-updated', handleCrsUpdated);
      }

      return () => {
        unsubData?.();
        unsubSettings?.();
        heysEvents.forEach(evt => {
          if (typeof HEYS.events?.off === 'function') {
            HEYS.events.off(evt, loadData);
          }
        });
        window.removeEventListener('heysWaterAdded', handleWaterAdded);
        if (handleCrsUpdated) {
          window.removeEventListener('heys:crs-updated', handleCrsUpdated);
        }
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
      case 'cascade':
        return React.createElement(CascadeWidgetContent, { widget, data });
      case 'dayScore':
        return React.createElement(DayScoreWidgetContent, { widget, data });
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
      case 'relapseRisk':
        return React.createElement(RelapseRiskWidgetContent, { widget, data });
      case 'insulinWave':
        return React.createElement(InsulinWaveWidgetContent, { widget, data });
      case 'healthTrend':
        return React.createElement(HealthTrendWidgetContent, { widget, data });
      default:
        return React.createElement('div', { className: 'widget__placeholder' },
          widgetType?.icon || '📊',
          React.createElement('span', null, 'Нет данных')
        );
    }
  }

  // === Individual Widget Content Components ===

  // === Day Score Widget Content (Оценка дня 0-100 — unified: Status + Subjective + Momentum) ===
  function DayScoreWidgetContent({ widget, data }) {
    const score = data?.score ?? 0;
    const level = data?.level ?? 'none';
    const hasData = data?.hasData ?? false;
    const statusResult = data?.statusResult || {};
    const topActions = Array.isArray(statusResult.topActions) ? statusResult.topActions : [];
    const showAction = widget.settings?.showAction !== false;
    const showLevel = widget.settings?.showLevel !== false;

    const getColor = () => {
      if (score >= 85) return '#10b981';
      if (score >= 70) return '#22c55e';
      if (score >= 50) return '#eab308';
      if (score >= 30) return '#f97316';
      return '#ef4444';
    };

    const getLevelEmoji = () => {
      switch (level) {
        case 'excellent': return '🌟';
        case 'good': return '✅';
        case 'okay': return '👌';
        case 'low': return '😕';
        case 'critical': return '⚠️';
        default: return '⭐';
      }
    };

    const getLevelLabel = () => {
      switch (level) {
        case 'excellent': return 'Отлично';
        case 'good': return 'Хорошо';
        case 'okay': return 'Нормально';
        case 'low': return 'Слабо';
        case 'critical': return 'Критично';
        default: return 'Нет данных';
      }
    };

    const d = getWidgetDims(widget);
    const isShort = d.isShort; // 2x1
    const rootClassName = `widget-day-score ${isShort ? 'widget-day-score--short' : 'widget-day-score--regular'}`;

    if (!hasData) {
      return React.createElement('div', {
        className: `${rootClassName} widget-day-score--empty`
      },
        React.createElement('div', { className: 'widget-day-score__placeholder-icon' }, '⭐'),
        React.createElement('div', { className: 'widget-day-score__placeholder-text' }, 'Заполните день')
      );
    }

    const color = getColor();
    const actionEl = showAction && topActions.length > 0
      ? React.createElement('div', {
        className: 'widget-day-score__action',
      },
        React.createElement('span', { className: 'widget-day-score__action-icon' }, topActions[0].icon || '→'),
        React.createElement('span', { className: 'widget-day-score__action-text' }, topActions[0].text)
      )
      : null;

    const levelBadge = showLevel ? React.createElement('div', {
      className: 'widget-day-score__badge widget-day-score__level-badge',
      style: {
        fontSize: '0.7rem', fontWeight: 600, color,
        background: `${color}14`, border: `1px solid ${color}28`,
        borderRadius: '99px', padding: '1px 8px'
      }
    }, `${getLevelEmoji()} ${getLevelLabel()}`) : null;

    // 2x1 — горизонтальный: цифра слева, уровень + рекомендация справа
    if (isShort) {
      return React.createElement('div', {
        className: rootClassName
      },
        // Score
        React.createElement('div', {
          className: 'widget-day-score__score',
          style: { fontSize: '2rem', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px', flexShrink: 0 }
        }, Math.round(score)),
        // Top right: level badge
        levelBadge ? React.createElement('div', { className: 'widget-day-score__badge-row' }, levelBadge) : null,
        // Bottom full-width recommendation
        actionEl ? React.createElement('div', { className: 'widget-day-score__action-row' }, actionEl) : null
      );
    }

    // 2x2 — вертикальный: большая цифра + уровень + рекомендация
    return React.createElement('div', {
      className: rootClassName
    },
      // Score number
      React.createElement('div', {
        className: 'widget-day-score__score-big',
        style: { fontSize: '3rem', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px' }
      }, Math.round(score)),
      // Level badge
      levelBadge ? React.createElement('div', { className: 'widget-day-score__badge-row' }, levelBadge) : null,
      // Top recommendation
      actionEl ? React.createElement('div', { className: 'widget-day-score__action-row' }, actionEl) : null
    );
  }

  // === Insulin Wave Sparkline (SVG) ===
  const IW_WAVE_SHAPE = [
    { t: 0, level: 0.03 },
    { t: 0.12, level: 0.45 },
    { t: 0.25, level: 0.98 },
    { t: 0.40, level: 0.85 },
    { t: 0.60, level: 0.55 },
    { t: 0.78, level: 0.25 },
    { t: 0.90, level: 0.10 },
    { t: 1.00, level: 0.03 }
  ];

  function getIWLevelAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    for (let i = 0; i < IW_WAVE_SHAPE.length - 1; i++) {
      const a = IW_WAVE_SHAPE[i], b = IW_WAVE_SHAPE[i + 1];
      if (clamped >= a.t && clamped <= b.t) {
        const pct = (clamped - a.t) / (b.t - a.t);
        return a.level + (b.level - a.level) * pct;
      }
    }
    return 0.03;
  }

  function InsulinWaveSparkline({ progress, isLipolysis, color, width, height }) {
    const pathRef = React.useRef(null);
    const [pathLength, setPathLength] = React.useState(0);
    const [revealed, setRevealed] = React.useState(false);

    const svgW = typeof width === 'number' ? width : 200;
    const svgH = height || 50;
    const isFluid = width === '100%';
    const padX = 4, padY = 6;
    const chartW = svgW - padX * 2;
    const chartH = svgH - padY * 2;

    const pts = IW_WAVE_SHAPE.map(p => ({
      x: padX + p.t * chartW,
      y: padY + chartH - p.level * chartH
    }));

    const buildPath = () => {
      if (pts.length < 2) return '';
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const cpx = ((p1.x + p2.x) / 2).toFixed(1);
        d += ` Q${cpx},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
      }
      return d;
    };

    const pathD = buildPath();

    React.useEffect(() => {
      const el = pathRef.current;
      if (!el || !pathD) return;
      const len = el.getTotalLength();
      setPathLength(len);
      setRevealed(false);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setRevealed(true)); });
      return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
    }, [pathD]);

    const clampedT = Math.min(1, (progress || 0) / 100);
    const dotX = (padX + clampedT * chartW).toFixed(1);
    const dotLevel = isLipolysis ? 0.03 : getIWLevelAt(clampedT);
    const dotY = (padY + chartH - dotLevel * chartH).toFixed(1);
    const lineColor = isLipolysis ? '#22c55e' : (color || '#3b82f6');

    return React.createElement('svg', {
      viewBox: `0 0 ${svgW} ${svgH}`,
      width: isFluid ? '100%' : svgW,
      height: svgH,
      preserveAspectRatio: 'xMidYMid meet',
      style: { overflow: 'visible', display: 'block' }
    },
      // Baseline dashed line
      React.createElement('line', {
        x1: padX, y1: svgH - padY, x2: svgW - padX, y2: svgH - padY,
        stroke: 'var(--heys-border,#e2e8f0)', strokeWidth: 1, strokeDasharray: '3 3'
      }),
      // Wave curve
      React.createElement('path', {
        ref: pathRef,
        d: pathD,
        fill: 'none',
        stroke: lineColor,
        strokeWidth: 2,
        strokeLinecap: 'round',
        style: {
          strokeDasharray: pathLength || 1,
          strokeDashoffset: revealed ? 0 : (pathLength || 1),
          transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 0.61, 0.36, 1)'
        }
      }),
      // "Now" dot
      React.createElement('circle', { cx: dotX, cy: dotY, r: 4, fill: lineColor, stroke: '#fff', strokeWidth: 2 }),
      // Glow ring for lipolysis
      isLipolysis && React.createElement('circle', { cx: dotX, cy: dotY, r: 7, fill: 'none', stroke: '#22c55e', strokeWidth: 1.5, opacity: 0.4 })
    );
  }

  // === Insulin Wave Widget Content ===
  function InsulinWaveWidgetContent({ widget, data }) {
    const hasData = data?.hasData ?? false;
    const status = data?.status || 'noData';
    const progress = data?.progress || 0;
    const remaining = data?.remaining || 0;
    const endTime = data?.endTime || null;
    const color = data?.color || '#3b82f6';
    const isLipolysis = data?.isLipolysis ?? (status === 'lipolysis');
    const lastMealTime = data?.lastMealTime || null;
    const isNightTime = data?.isNightTime || false;
    const isPastDay = data?.isPastDay || false;
    const isOvernightLipolysis = data?.isOvernightLipolysis || false;

    const d = getWidgetDims(widget);
    const isShort = d.isShort;

    if (!hasData) {
      return React.createElement('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px', opacity: 0.5 }
      },
        React.createElement('div', { style: { fontSize: '1.4rem' } }, '🌊'),
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--heys-text-tertiary,#64748b)', textAlign: 'center' } }, 'Добавьте приёмы пищи')
      );
    }

    // === Past-day: специальная версия ===
    if (isPastDay) {
      return React.createElement(InsulinWavePastDayContent, { widget, data, d, isShort });
    }

    // === Сегодня без завтрака: ночной липолиз с рекордом ===
    if (isOvernightLipolysis) {
      return React.createElement(InsulinWaveOvernightContent, { widget, data, d, isShort });
    }

    // Главный заголовок — что происходит с жиром сейчас
    const mainLabel = isLipolysis
      ? (isNightTime ? 'Жир сжигается' : 'Жир сжигается')
      : status === 'decline' ? 'Жир начнёт сжигаться'
        : 'Жир накапливается';

    const mainLabelColor = isLipolysis
      ? '#22c55e'
      : status === 'decline' ? '#22c55e'
        : '#f97316'; // ярко-оранжевый = предупреждение

    const timeLabelColor = '#3b82f6'; // всегда синий

    // Время до липолиза или "сейчас"
    const timeLabel = isLipolysis
      ? 'Сейчас'
      : remaining > 0
        ? (remaining >= 60
          ? `ещё ${Math.floor(remaining / 60)}ч ${Math.round(remaining % 60)}м`
          : `ещё ${Math.round(remaining)} мин`)
        : '—';

    // Сколько минут уже идёт липолиз (по endTime как времени старта)
    const calcLipolysisElapsed = (et) => {
      if (!et) return 0;
      const [h, m] = et.split(':').map(Number);
      if (isNaN(h)) return 0;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const startMin = h * 60 + (m || 0);
      let diff = nowMin - startMin;
      if (diff < 0) diff += 1440;
      return diff > 720 ? 0 : diff; // не больше 12ч
    };
    const lipolysisMin = isLipolysis ? calcLipolysisElapsed(endTime) : 0;
    // ~70 ккал/ч из жира при базовом обмене
    const lipolysisKcal = Math.round(lipolysisMin * 1.15);

    const subText = isLipolysis
      ? (lipolysisKcal > 3
        ? `~${lipolysisKcal} ккал жира сожжено`
        : (isNightTime ? 'Ночной липолиз' : 'Не ешь — жир уходит'))
      : (endTime ? `Липолиз начнётся в ${endTime}` : 'Ждём снижения инсулина');
    const subTextColor = isLipolysis ? '#22c55e' : '#eab308';

    const sparkline = React.createElement(InsulinWaveSparkline, {
      progress, isLipolysis, color, width: '100%', height: isShort ? 34 : 50
    });

    // === 2×1 horizontal ===
    if (isShort) {
      return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', height: '100%', gap: '8px', padding: '4px 10px' }
      },
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0, minWidth: '68px' }
        },
          React.createElement('div', {
            style: { fontSize: '0.72rem', fontWeight: 700, color: mainLabelColor, lineHeight: 1.2 }
          }, mainLabel),
          React.createElement('div', {
            style: { fontSize: '0.65rem', color: timeLabelColor, fontWeight: 700 }
          }, timeLabel)
        ),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } }, sparkline)
      );
    }

    // === 2×2 vertical ===
    return React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '8px 8px 6px' }
    },
      // Header row
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }
      },
        React.createElement('div', {
          style: { fontSize: '0.8rem', fontWeight: 700, color: mainLabelColor, lineHeight: 1.2 }
        }, mainLabel)
      ),
      // Time (big)
      React.createElement('div', {
        style: { fontSize: '1.2rem', fontWeight: 800, color: timeLabelColor, letterSpacing: '-0.5px', lineHeight: 1, marginTop: '2px' }
      }, timeLabel),
      // Sparkline
      React.createElement('div', {
        style: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', marginTop: '4px', marginBottom: '4px' }
      }, sparkline),
      // Subtext
      React.createElement('div', {
        style: { fontSize: '0.6rem', fontWeight: 600, color: subTextColor, lineHeight: 1.3 }
      }, subText)
    );
  }

  function InsulinWaveOvernightContent({ data, d, isShort }) {
    const lipolysisMin = data?.lipolysisMinutes || 0;
    const lipolysisKcal = data?.lipolysisKcal || 0;
    const record = data?.lipolysisRecord || {};
    const recordMin = record.minutes || 0;
    const isRecord = data?.isRecord || false;

    const formatMin = (minutes) => {
      if (!minutes || minutes <= 0) return '0м';
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h > 0 && m > 0) return `${h}ч ${m}м`;
      if (h > 0) return `${h}ч`;
      return `${m}м`;
    };

    const durationLabel = formatMin(lipolysisMin);
    const recordLabel = recordMin > 0 ? formatMin(recordMin) : null;
    const sparkline = React.createElement(InsulinWaveSparkline, {
      progress: 100, isLipolysis: true, color: '#22c55e', width: '100%', height: isShort ? 34 : 50
    });

    if (isShort) {
      return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', height: '100%', gap: '8px', padding: '4px 10px' }
      },
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0, minWidth: '78px' }
        },
          React.createElement('div', {
            style: { fontSize: '0.72rem', fontWeight: 700, color: '#22c55e', lineHeight: 1.2 }
          }, 'Жир сжигается'),
          React.createElement('div', {
            style: { fontSize: '0.65rem', color: '#3b82f6', fontWeight: 700 }
          }, durationLabel)
        ),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } }, sparkline)
      );
    }

    return React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '8px 8px 6px' }
    },
      React.createElement('div', {
        style: { fontSize: '0.8rem', fontWeight: 700, color: '#22c55e', lineHeight: 1.2 }
      }, 'Жир сжигается'),
      React.createElement('div', {
        style: { fontSize: '1.2rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '-0.5px', lineHeight: 1, marginTop: '2px' }
      }, durationLabel),
      React.createElement('div', {
        style: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', marginTop: '4px', marginBottom: '4px' }
      }, sparkline),
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }
      },
        React.createElement('div', {
          style: { fontSize: '0.6rem', fontWeight: 600, color: '#22c55e', lineHeight: 1.3 }
        }, lipolysisKcal > 0 ? `~${lipolysisKcal} ккал сейчас` : 'Липолиз идёт'),
        recordLabel ? React.createElement('div', {
          style: { fontSize: '0.55rem', fontWeight: 600, color: isRecord ? '#f59e0b' : 'var(--heys-text-tertiary,#94a3b8)', lineHeight: 1.2, whiteSpace: 'nowrap' }
        }, isRecord ? '🏆 Рекорд!' : `🏆 ${recordLabel}`) : null
      )
    );
  }

  // === Past-day insulin wave: итоги жиросжигания ===
  function InsulinWavePastDayContent({ widget, data, d, isShort }) {
    const windowH = data.fatBurningWindowH || 0;
    const windowM = data.fatBurningWindowM || 0;
    const kcal = data.fatBurningKcal || 0;
    const record = data.lipolysisRecord || {};
    const isRecord = data.isRecord || false;
    const windowMin = data.fatBurningWindowMin || 0;
    const stillActive = data.fatBurningStillActive || false;

    const durationLabel = windowH > 0
      ? (windowM > 0 ? `${windowH}ч ${windowM}м` : `${windowH}ч`)
      : `${windowM}м`;

    const headerText = stillActive
      ? 'Жир сжигается'
      : windowMin > 0 ? 'Жир сжигался' : 'Нет окна';

    // Рекорд
    const recordMin = record.minutes || 0;
    const recordH = Math.floor(recordMin / 60);
    const recordM = Math.round(recordMin % 60);
    const recordLabel = recordMin > 0
      ? (recordH > 0 ? (recordM > 0 ? `${recordH}ч ${recordM}м` : `${recordH}ч`) : `${recordM}м`)
      : null;

    const sparkline = React.createElement(InsulinWaveSparkline, {
      progress: 100, isLipolysis: true, color: '#22c55e', width: '100%', height: isShort ? 34 : 50
    });

    // === 2×1 horizontal ===
    if (isShort) {
      return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', height: '100%', gap: '8px', padding: '4px 10px' }
      },
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0, minWidth: '68px' }
        },
          React.createElement('div', {
            style: { fontSize: '0.72rem', fontWeight: 700, color: '#22c55e', lineHeight: 1.2 }
          }, headerText),
          React.createElement('div', {
            style: { fontSize: '0.65rem', color: '#3b82f6', fontWeight: 700 }
          }, durationLabel)
        ),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } }, sparkline)
      );
    }

    // === 2×2 vertical: past-day version ===
    return React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '8px 8px 6px' }
    },
      // Header
      React.createElement('div', {
        style: { fontSize: '0.8rem', fontWeight: 700, color: '#22c55e', lineHeight: 1.2 }
      }, headerText),
      // Duration (big)
      React.createElement('div', {
        style: { fontSize: '1.2rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '-0.5px', lineHeight: 1, marginTop: '2px' }
      }, windowMin > 0 ? durationLabel : '—'),
      // Sparkline
      React.createElement('div', {
        style: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', marginTop: '4px', marginBottom: '4px' }
      }, sparkline),
      // Bottom: kcal + record
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }
      },
        React.createElement('div', {
          style: { fontSize: '0.6rem', fontWeight: 600, color: '#22c55e', lineHeight: 1.3 }
        }, stillActive ? `~${kcal} ккал и растёт` : kcal > 0 ? `~${kcal} ккал сожжено` : 'Без жиросжигания'),
        !stillActive && recordLabel ? React.createElement('div', {
          style: { fontSize: '0.55rem', fontWeight: 600, color: isRecord ? '#f59e0b' : 'var(--heys-text-tertiary,#94a3b8)', lineHeight: 1.2, whiteSpace: 'nowrap' }
        }, isRecord ? '🏆 Рекорд!' : `🏆 ${recordLabel}`) : null
      )
    );
  }


  // === Health Trend Widget Content (Тренд здоровья 0-100 из инсайтов) ===
  function HealthTrendWidgetContent({ widget, data }) {
    const score = data?.score ?? 0;
    const hasData = data?.hasData ?? false;
    const periodDays = data?.periodDays ?? 7;
    const categories = Array.isArray(data?.categories) ? data.categories : [];
    const daysWithData = data?.daysWithData ?? 0;
    const showCategories = widget.settings?.showCategories !== false;

    const d = getWidgetDims(widget);
    const isShort = d.isShort; // 2x1

    const getColor = (s) => {
      if (s >= 85) return '#10b981';
      if (s >= 70) return '#22c55e';
      if (s >= 50) return '#eab308';
      if (s >= 30) return '#f97316';
      return '#ef4444';
    };

    const color = getColor(score);

    const PERIODS = [7, 30];
    const handlePeriod = (days, e) => {
      e?.stopPropagation?.();
      if (!widget?.id || periodDays === days) return;
      HEYS.Widgets.state?.updateWidget(widget.id, {
        settings: { ...(widget.settings || {}), periodDays: days }
      }, true);
    };

    const periodRow = React.createElement('div', {
      style: { display: 'flex', gap: '4px' }
    }, PERIODS.map(days => {
      const isActive = periodDays === days;
      return React.createElement('button', {
        key: days,
        type: 'button',
        onClick: (e) => handlePeriod(days, e),
        onPointerDown: (e) => e.stopPropagation(),
        onPointerUp: (e) => e.stopPropagation(),
        onTouchStart: (e) => e.stopPropagation(),
        style: {
          border: 'none', borderRadius: '999px',
          padding: '2px 8px', minHeight: '20px', cursor: 'pointer',
          fontSize: '0.65rem', fontWeight: isActive ? 700 : 500, lineHeight: 1,
          background: isActive ? color : 'var(--heys-bg-secondary,#f1f5f9)',
          color: isActive ? '#fff' : 'var(--heys-text-secondary,#94a3b8)',
          transition: 'all 0.15s ease'
        }
      }, `${days} дн.`);
    }));

    if (!hasData) {
      return React.createElement('div', {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px', opacity: 0.5 }
      },
        React.createElement('div', { style: { fontSize: isShort ? '1.2rem' : '1.5rem' } }, '🌿'),
        React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--heys-text-tertiary,#64748b)', textAlign: 'center' } },
          daysWithData < 3 ? 'Нужно 3+ дня данных' : 'Нет данных анализа'
        ),
        React.createElement('div', { style: { marginTop: '4px' } }, periodRow)
      );
    }

    // === 2×1 horizontal: score left, label + period right ===
    if (isShort) {
      return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', height: '100%', gap: '10px', padding: '4px 10px' }
      },
        // Score
        React.createElement('div', {
          style: { fontSize: '2rem', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px', flexShrink: 0 }
        }, Math.round(score)),
        // Right: label + period buttons
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }
        },
          React.createElement('div', {
            style: { fontSize: '0.65rem', fontWeight: 600, color: 'var(--heys-text-secondary,#64748b)', whiteSpace: 'nowrap' }
          }, 'Тренд здоровья'),
          periodRow
        )
      );
    }

    // === 2×2 vertical: score + label + categories + period ===
    return React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px', padding: '8px 6px' }
    },
      // Score
      React.createElement('div', {
        style: { fontSize: '2.8rem', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px' }
      }, Math.round(score)),
      // Label
      React.createElement('div', {
        style: { fontSize: '0.65rem', fontWeight: 600, color: 'var(--heys-text-secondary,#64748b)' }
      }, 'Тренд здоровья'),
      // Category mini-bars
      showCategories && categories.length > 0
        ? React.createElement('div', {
          style: { display: 'flex', gap: '4px', marginTop: '4px', width: '100%', justifyContent: 'center' }
        }, categories.map(cat => {
          const catColor = getColor(cat.score);
          return React.createElement('div', {
            key: cat.key,
            title: `${cat.label}: ${cat.score}`,
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: 0, flex: 1 }
          },
            React.createElement('div', {
              style: {
                width: '100%', maxWidth: '22px', height: '28px',
                borderRadius: '4px', background: 'var(--heys-bg-secondary,#f1f5f9)',
                overflow: 'hidden', position: 'relative'
              }
            },
              React.createElement('div', {
                style: {
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: `${cat.score}%`, background: catColor, opacity: 0.8,
                  borderRadius: '3px', transition: 'height 0.4s ease'
                }
              })
            ),
            React.createElement('div', {
              style: { fontSize: '0.55rem', color: 'var(--heys-text-tertiary,#94a3b8)', whiteSpace: 'nowrap' }
            }, cat.icon)
          );
        }))
        : null,
      // Period buttons
      React.createElement('div', { style: { marginTop: '4px' } }, periodRow)
    );
  }

  function CascadeWidgetContent({ widget, data }) {
    const size = widget?.size || '4x1';
    return renderCascadeStrip(data, { size });
  }

  // === Status Widget Content (deprecated → redirects to DayScore) ===
  function StatusWidgetContent({ widget, data }) {
    // Status widget is now merged into DayScore.
    // For backward compat, render DayScore-style card using status data.
    const d = getWidgetDims(widget);
    const score = data.status?.score ?? data.score ?? 0;
    const level = data.status?.level ?? { label: 'Нет данных', color: '#94a3b8' };

    const getColor = () => {
      if (score >= 85) return '#10b981';
      if (score >= 70) return '#22c55e';
      if (score >= 50) return '#eab308';
      if (score >= 30) return '#f97316';
      return '#ef4444';
    };

    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-day-score widget-day-score--micro' },
        React.createElement('div', {
          className: 'widget-day-score__score',
          style: { color: getColor(), fontSize: '1.5rem', fontWeight: 700 }
        }, Math.round(score))
      );
    }

    return React.createElement('div', { className: 'widget-day-score widget-day-score--standard' },
      React.createElement('div', {
        className: 'widget-day-score__score-big',
        style: { color: getColor(), fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }
      }, Math.round(score)),
      React.createElement('div', {
        className: 'widget-day-score__label',
        style: { fontSize: '0.75rem', color: 'var(--heys-text-secondary, #94a3b8)', marginTop: '2px' }
      }, level.label || 'Статус')
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
    const showMilliliters = widget.settings?.showMilliliters !== false;
    const showGlasses = widget.settings?.showGlasses === true;
    const showProgress = widget.settings?.showProgress !== false;
    const showPercentage = widget.settings?.showPercentage !== false;
    const showRemaining = widget.settings?.showRemaining !== false;
    const primaryValue = showMilliliters || !showGlasses
      ? `${drunk}${d.isMicro ? '' : ' мл'}`
      : `${glasses}${d.isMicro ? '🥛' : ' 🥛'}`;

    const getWaterColor = () => {
      if (pct >= 100) return '#22c55e';
      if (pct >= 70) return '#3b82f6';
      if (pct >= 40) return '#eab308';
      return '#ef4444';
    };

    // 1x1 Micro
    if (d.isMicro) {
      const waterColor = getWaterColor();
      return React.createElement('div', { className: 'widget-water widget-water--micro' },
        showProgress
          ? React.createElement('div', { className: 'widget-water__progress widget-water__progress--micro' },
            React.createElement('div', {
              className: 'widget-water__bar widget-water__bar--micro',
              style: {
                width: `${Math.min(100, Math.max(0, pct))}%`,
                background: waterColor
              }
            })
          )
          : null,
        React.createElement('div', { className: 'widget-water__value' }, primaryValue)
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
              showMilliliters || !showGlasses ? `${drunk}` : `${glasses}`,
              React.createElement('span', { className: 'widget-water__unit' }, showMilliliters || !showGlasses ? 'мл' : '🥛')
            )
          ),
          showPercentage
            ? React.createElement('div', { className: 'widget-water__pct-badge', style: { background: `${waterColor}20`, color: waterColor } },
              `${pct}%`
            )
            : null
        ),
        // Прогресс-бар
        showProgress
          ? React.createElement('div', { className: 'widget-water__progress' },
            React.createElement('div', {
              className: 'widget-water__bar',
              style: { width: `${Math.min(100, pct)}%`, background: waterColor }
            })
          )
          : null,
        // Низ: цель + стаканы + осталось
        React.createElement('div', { className: 'widget-water__footer' },
          showGlasses
            ? React.createElement('div', { className: 'widget-water__meta' },
              React.createElement('span', { className: 'widget-water__glasses' }, `${glasses} 🥛`)
            )
            : null,
          showRemaining && remaining > 0
            ? React.createElement('div', { className: 'widget-water__meta widget-water__meta--muted' },
              `ещё ${remaining} мл`
            )
            : null
        )
      );
    }

    // Остальные размеры — стандартный layout
    const showPctPill = showPercentage && !d.isTiny;

    return React.createElement('div', { className: `widget-water widget-water--${variant}` },
      React.createElement('div', { className: 'widget-water__top' },
        React.createElement('div', { className: 'widget-water__value' }, primaryValue)
      ),
      showGlasses && showMilliliters
        ? React.createElement('div', { className: 'widget-water__label' }, `${glasses} 🥛`)
        : null,
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
    const showTarget = widget.settings?.showTarget !== false;
    const showQuality = widget.settings?.showQuality !== false && !!quality && !d.isTiny;
    const showTimes = widget.settings?.showTimes !== false && (!!sleepStart || !!sleepEnd);

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
        showTimes && React.createElement('div', { className: 'widget-sleep__times' },
          sleepStart && React.createElement('span', { className: 'widget-sleep__time' }, `🌙 ${sleepStart}`),
          sleepEnd && React.createElement('span', { className: 'widget-sleep__time' }, `☀️ ${sleepEnd}`)
        ),
        // Низ: качество + цель
        React.createElement('div', { className: 'widget-sleep__footer' },
          showQuality && React.createElement('div', { className: 'widget-sleep__quality-badge' },
            `⭐ ${quality}/10`
          ),
          showTarget
            ? React.createElement('div', { className: 'widget-sleep__target' },
              `Цель: ${target}ч`
            )
            : null
        )
      );
    }

    // Остальные размеры
    return React.createElement('div', { className: `widget-sleep widget-sleep--${variant}` },
      React.createElement('div', { className: 'widget-sleep__value' }, `${hours.toFixed(1)}ч ${getEmoji()}`),
      showTimes ? React.createElement('div', { className: 'widget-sleep__label' }, [sleepStart, sleepEnd].filter(Boolean).join(' → ')) : null,
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
    const showBmi = widget.settings?.showBmi !== false;
    const showChart = widget.settings?.showChart !== false;
    const showAnalytics = widget.settings?.showAnalytics !== false;

    const hasCurrent = Number.isFinite(current);
    const hasGoal = Number.isFinite(goal) && goal > 0;
    const hasBmi = showBmi && Number.isFinite(bmi);
    const hasAnalyticsData = showAnalytics && (!!monthChange || !!hasCleanTrend);
    const sparklinePoints = sparkline.filter(s => s.weight);
    const hasSparkline = showChart && sparklinePoints.length >= 2;

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
      if (!showBmi || !bmi) return null;
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
      if (showAnalytics && monthChange) {
        items.push({ icon: '📊', text: `Прогноз: ${monthChange > 0 ? '+' : ''}${monthChange.toFixed(1)} кг/мес` });
      }
      if (showAnalytics && hasCleanTrend) {
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
            : ((hasBmi || hasAnalyticsData) && React.createElement('div', { className: 'widget-weight__side' },
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
        (!hasAnalyticsData && !(showGoal && hasGoal && progressPct !== null))
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

    const pathRef = React.useRef(null);
    const [pathLength, setPathLength] = React.useState(0);
    const [isPathRevealed, setIsPathRevealed] = React.useState(false);

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

    React.useEffect(() => {
      const pathEl = pathRef.current;
      if (!pathEl || !pathD) return;

      const totalLength = pathEl.getTotalLength();
      setPathLength(totalLength);
      setIsPathRevealed(false);
      let raf2 = 0;

      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsPathRevealed(true);
        });
      });

      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }, [pathD]);

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
        ref: pathRef,
        d: pathD,
        fill: 'none',
        stroke: trendColor,
        strokeWidth: 2,
        strokeLinecap: 'round',
        style: {
          strokeDasharray: pathLength || 1,
          strokeDashoffset: isPathRevealed ? 0 : (pathLength || 1),
          transition: 'stroke-dashoffset 1.25s cubic-bezier(0.22, 0.61, 0.36, 1)'
        }
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
          strokeWidth: p.isToday ? 0 : 1.5,
          style: {
            opacity: isPathRevealed ? 1 : 0,
            transition: 'opacity 0.25s ease 0.95s'
          }
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
    const showKm = widget.settings?.showKilometers && !d.isTiny;
    const showGoalBar = widget.settings?.showGoal !== false;
    const showPercentage = widget.settings?.showPercentage !== false;
    const showRemaining = widget.settings?.showRemaining !== false;

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
          showPercentage
            ? React.createElement('div', { className: 'widget-steps__pct-badge', style: { background: `${stepsColor}20`, color: stepsColor } },
              `${pct}%`
            )
            : null
        ),
        // Прогресс-бар
        showGoalBar
          ? React.createElement('div', { className: 'widget-steps__progress' },
            React.createElement('div', {
              className: 'widget-steps__bar',
              style: { width: `${Math.min(100, pct)}%`, background: stepsColor }
            })
          )
          : null,
        // Низ: километры + цель + осталось
        React.createElement('div', { className: 'widget-steps__footer' },
          showKm ? React.createElement('div', { className: 'widget-steps__km' }, `${km} км`) : null,
          showRemaining
            ? React.createElement('div', { className: 'widget-steps__meta' },
              remaining > 0
                ? `ещё ${remaining.toLocaleString('ru-RU')}`
                : '🏆 Цель!'
            )
            : null
        )
      );
    }

    // Остальные размеры
    const showPctInline = d.isShort && showPercentage;

    return React.createElement('div', { className: `widget-steps widget-steps--${variant}` },
      React.createElement('div', { className: 'widget-steps__top' },
        React.createElement('div', { className: 'widget-steps__value' }, steps.toLocaleString('ru-RU')),
        showPctInline ? React.createElement('div', { className: 'widget-steps__pct' }, `${Math.min(999, pct)}%`) : null
      ),
      showKm ? React.createElement('div', { className: 'widget-steps__km' }, `${km} км`) : null,
      showRemaining && !d.isShort ? React.createElement('div', { className: 'widget-steps__label' }, remaining > 0 ? `ещё ${remaining.toLocaleString('ru-RU')}` : 'цель достигнута') : null,
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
    const { protein, fat, carbs, proteinTarget, fatTarget, carbsTarget, cascade } = data;

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';

    // Расчёт процентов
    const pctP = proteinTarget > 0 ? Math.round((protein || 0) / proteinTarget * 100) : 0;
    const pctF = fatTarget > 0 ? Math.round((fat || 0) / fatTarget * 100) : 0;
    const pctC = carbsTarget > 0 ? Math.round((carbs || 0) / carbsTarget * 100) : 0;
    const avgPct = Math.round((pctP + pctF + pctC) / 3);
    const showPercentage = widget.settings?.showPercentage !== false;
    const showGrams = widget.settings?.showGrams !== false && !d.isTiny;
    const effectiveShowGrams = showGrams || !showPercentage;
    const centerValueMode = size === '3x2' ? (widget.settings?.centerValueMode || 'grams') : 'default';
    const canUseMacroRings = d.cols >= 2 && d.rows >= 2 && size !== '4x1';
    const ringsDensityClass = d.area >= 12 ? 'widget-macros--rings-lg' : d.area >= 8 ? 'widget-macros--rings-md' : 'widget-macros--rings-sm';

    const macroItems = [
      { label: 'Белки', shortLabel: 'Б', value: protein || 0, target: proteinTarget || 100, pct: pctP, toneClass: 'protein' },
      { label: 'Жиры', shortLabel: 'Ж', value: fat || 0, target: fatTarget || 70, pct: pctF, toneClass: 'fat' },
      { label: 'Углеводы', shortLabel: 'У', value: carbs || 0, target: carbsTarget || 250, pct: pctC, toneClass: 'carbs' }
    ];

    const getMacroValueTone = ({ pct, toneClass }) => {
      if (!Number.isFinite(pct) || pct <= 0) {
        return '#ef4444';
      }

      if (toneClass === 'protein') {
        if (pct >= 90) return '#16a34a';
        if (pct >= 70) return '#f59e0b';
        return '#ef4444';
      }

      if (pct >= 70 && pct <= 110) return '#16a34a';
      if (pct >= 50 && pct <= 125) return '#f59e0b';
      return '#ef4444';
    };

    const buildMacroRing = ({ label, shortLabel, value, target, pct, toneClass }, options = {}) => {
      const {
        centerMode = 'default',
        hideTarget = false,
        hidePercentBadge = false,
        valueColor = null,
        innerShortLabel = null
      } = options;
      const ringStartOffsetPct = 9;
      const ringCapCompPct = 5;
      const overColor = toneClass === 'protein' ? '#22c55e' : '#ef4444';
      const ratio = target > 0 ? value / target : 0;
      const dotColor = ratio > 1 ? '#ef4444' : '#22c55e';
      const basePctRaw = Math.min(100, Math.round(ratio * 100));
      const basePct = Math.max(0, basePctRaw - ringCapCompPct);
      const hasOver = ratio > 1;
      const overPctRaw = hasOver ? Math.min(50, Math.round((ratio - 1) * 100)) : 0;
      const overPct = Math.max(0, overPctRaw - ringCapCompPct);
      const gradientId = `widget-macro-ring-${widget?.id || '0'}-${toneClass}`;
      const gradientStops = toneClass === 'protein'
        ? ['#fecaca', '#ef4444']
        : (toneClass === 'fat' ? ['#fde68a', '#f59e0b'] : ['#bbf7d0', '#22c55e']);
      const getRingDotPos = (ringPct) => {
        if (!ringPct || ringPct <= 0) return null;
        const dotPct = Math.max(0, ringPct - 3);
        if (dotPct <= 0) return null;
        const angle = ((dotPct + ringStartOffsetPct) / 100) * Math.PI * 2;
        return {
          x: 18 + 15.5 * Math.cos(angle),
          y: 18 + 15.5 * Math.sin(angle)
        };
      };
      const dot = getRingDotPos(basePct);
      const normalizedPct = Math.max(0, Math.round(Number(pct) || 0));
      const resolvedCenterMode = centerMode === 'default'
        ? (effectiveShowGrams ? 'grams' : 'pct')
        : centerMode;
      const centerValue = resolvedCenterMode === 'pct'
        ? `${Math.min(999, normalizedPct)}%`
        : Math.round(value || 0);
      const targetText = hideTarget ? null : (resolvedCenterMode === 'grams' ? `/ ${Math.round(target || 0)}г` : null);
      const percentBadge = hidePercentBadge ? null : (showPercentage && resolvedCenterMode === 'grams' ? `${normalizedPct}%` : null);

      return React.createElement('div', { key: `${toneClass}-${label}`, className: 'macro-ring-item' },
        React.createElement('div', { className: `macro-ring ${toneClass}${hasOver ? ' macro-ring--over' : ''}` },
          React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
            React.createElement('defs', null,
              React.createElement('linearGradient', {
                id: gradientId,
                x1: '0%', y1: '0%', x2: '100%', y2: '100%'
              },
                React.createElement('stop', { offset: '0%', stopColor: gradientStops[0] }),
                React.createElement('stop', { offset: '100%', stopColor: gradientStops[1] })
              )
            ),
            React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
            React.createElement('circle', {
              className: 'macro-ring-fill',
              cx: 18,
              cy: 18,
              r: 15.5,
              pathLength: 100,
              style: {
                strokeDasharray: `${basePct} 100`,
                '--ring-dasharray': `${basePct} 100`,
                '--ring-start-offset': -ringStartOffsetPct,
                stroke: `url(#${gradientId})`
              }
            }),
            hasOver ? React.createElement('circle', {
              className: 'macro-ring-fill--over',
              cx: 18,
              cy: 18,
              r: 15.5,
              pathLength: 100,
              style: {
                strokeDasharray: `${overPct} ${100 - overPct}`,
                '--over-dasharray': `${overPct} ${100 - overPct}`,
                '--over-offset': -(100 - overPct),
                stroke: overColor
              }
            }) : null,
            dot ? React.createElement('circle', {
              className: 'macro-ring-dot',
              cx: dot.x,
              cy: dot.y,
              r: 2.2,
              style: { '--macro-ring-dot': dotColor }
            }) : null
          ),
          React.createElement('span', {
            className: 'macro-ring-value',
            style: valueColor ? { color: valueColor } : undefined
          }, centerValue),
          innerShortLabel ? React.createElement('span', {
            className: 'macro-ring-inner-label'
          }, innerShortLabel) : null
        ),
        React.createElement('span', { className: 'macro-ring-label' }, label),
        targetText ? React.createElement('span', { className: 'macro-ring-target' }, targetText) : React.createElement('span', { className: 'macro-ring-target macro-ring-target--empty' }, ' '),
        percentBadge ? React.createElement('span', { className: 'widget-macros__ring-pct' }, percentBadge) : null
      );
    };

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-macros widget-macros--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, 'БЖУ'),
        React.createElement('div', { className: 'widget-macros__micro-value' },
          showPercentage
            ? `${Math.min(999, avgPct)}%`
            : `${Math.round((protein || 0) + (fat || 0) + (carbs || 0))}г`
        )
      );
    }

    // 3x1 — Компактные кольца: процент внутри, без нормы и badge-процента
    if (size === '3x1') {
      return React.createElement('div', { className: 'widget-macros widget-macros--3x1 widget-macros--rings widget-macros--rings-3x1' },
        React.createElement('div', { className: 'widget-macros__rings-wrap' },
          React.createElement('div', { className: 'macro-rings widget-macros__rings' },
            macroItems.map((item) => buildMacroRing(item, {
              centerMode: 'pct',
              hideTarget: true,
              hidePercentBadge: true,
              valueColor: getMacroValueTone(item),
              innerShortLabel: item.shortLabel
            }))
          )
        )
      );
    }

    if (size === '3x2') {
      return React.createElement('div', { className: 'widget-macros widget-macros--3x2 widget-macros--rings widget-macros--rings-md' },
        React.createElement('div', { className: 'widget-macros__rings-wrap' },
          React.createElement('div', { className: 'macro-rings widget-macros__rings' },
            macroItems.map((item) => buildMacroRing(item, {
              centerMode: centerValueMode,
              hidePercentBadge: true,
              valueColor: getMacroValueTone(item)
            }))
          )
        ),
        React.createElement('div', { className: 'widget-macros__cascade-row' },
          renderCascadeStrip(cascade || {}, {
            size: '3x1',
            maxDots: Array.isArray(cascade?.events) && cascade.events.length > 0 ? cascade.events.length : 8,
            placeholderCount: 6,
            className: 'widget-cascade--embedded',
            showDayBalanceBadge: true,
            metricInlineWithLabel: true,
            footerLabel: 'Позитивный каскад',
            useLiveCurrentCascade: true
          })
        )
      );
    }

    if (canUseMacroRings) {
      return React.createElement('div', { className: `widget-macros widget-macros--rings ${ringsDensityClass}` },
        React.createElement('div', { className: 'widget-macros__rings-wrap' },
          React.createElement('div', { className: 'macro-rings widget-macros__rings' },
            macroItems.map(buildMacroRing)
          )
        )
      );
    }

    // Остальные размеры
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
    const showTimer = widget.settings?.showTimer !== false && Number.isFinite(remaining) && remaining > 0;
    const showPhase = widget.settings?.showPhase !== false && !!phase && !d.isTiny;
    const showLastMeal = widget.settings?.showLastMeal !== false && !!lastMealTime;

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
          showLastMeal && React.createElement('div', { className: 'widget-insulin__meal-time' },
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
        showPhase && React.createElement('div', { className: 'widget-insulin__phase-2x2' },
          phase
        )
      );
    }

    // Остальные размеры
    return React.createElement('div', { className: `widget-insulin widget-insulin--${variant}` },
      React.createElement('div', { className: `widget-insulin__status widget-insulin__status--${status}` },
        info.emoji, ' ', info.label
      ),
      showLastMeal ? React.createElement('div', { className: 'widget-insulin__phase' }, `🍽 ${lastMealTime}`) : null,
      showTimer ? React.createElement('div', { className: 'widget-insulin__timer' }, `${remaining} мин`) : null,
      showPhase ? React.createElement('div', { className: 'widget-insulin__phase' }, phase) : null
    );
  }

  function HeatmapWidgetContent({ widget, data }) {
    const days = data.days || [];
    const requestedPeriod = widget.settings?.period || 'week';
    const configuredPeriod = requestedPeriod === 'month' ? 'week' : requestedPeriod;
    const highlightToday = widget.settings?.highlightToday !== false;

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const canShowMonth = configuredPeriod === 'month' && d.area >= 9 && d.rows >= 3;
    const period = canShowMonth ? 'month' : 'week';
    const todayIso = new Date().toISOString().slice(0, 10);
    const today = new Date();
    const weekStartDayIndex = (today.getDay() + 6) % 7;

    let renderDays = days;
    if (d.isMicro) {
      renderDays = days.slice(-1);
    } else if (d.isTiny) {
      renderDays = days.slice(-7);
    } else if (period === 'week') {
      renderDays = days.slice(-7);
    }

    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';

    const buildWeekDayMeta = (day, i) => {
      const fallbackDayIndex = (weekStartDayIndex - 6 + i + 7) % 7;
      const dateObj = day?.date ? new Date(day.date) : null;
      const hasValidDate = !!(dateObj && Number.isFinite(dateObj.getTime()));
      const isToday = highlightToday && day?.date === todayIso;

      return {
        day,
        isToday,
        hasTraining: !!day?.hasTraining,
        highStress: !!day?.highStress
      };
    };

    const buildDayTitle = (meta) => {
      const baseDate = meta?.day?.date || 'Нет даты';
      const flags = [meta?.hasTraining ? '💪' : null, meta?.highStress ? '😰' : null]
        .filter(Boolean)
        .join(' ');
      return flags ? `${baseDate} ${flags}` : baseDate;
    };

    const renderHeatmapCell = (meta, index, extraClass = '') => {
      const className = [
        'widget-heatmap__cell',
        `widget-heatmap__cell--${meta.day?.status || 'empty'}`,
        meta.isToday ? 'widget-heatmap__cell--today' : '',
        meta.hasTraining ? 'widget-heatmap__cell--training' : '',
        meta.highStress ? 'widget-heatmap__cell--stress' : '',
        extraClass
      ].filter(Boolean).join(' ');

      return React.createElement('div', {
        key: `${meta?.day?.date || 'day'}-${index}`,
        className,
        title: buildDayTitle(meta)
      });
    };

    // 1x1 Micro
    if (d.isMicro) {
      const todayMeta = buildWeekDayMeta(renderDays[0] || {}, 0);
      return React.createElement('div', { className: 'widget-heatmap widget-heatmap--micro' },
        renderHeatmapCell(todayMeta, 0, 'widget-heatmap__cell--micro')
      );
    }

    if (size === '2x1' || size === '3x1') {
      const compactWeekDays = days.slice(-7).map(buildWeekDayMeta);
      const compactCellClass = size === '2x1'
        ? 'widget-heatmap__cell--compact widget-heatmap__cell--compact-2x1'
        : 'widget-heatmap__cell--compact widget-heatmap__cell--compact-3x1';
      return React.createElement('div', { className: `widget-heatmap widget-heatmap--${size}` },
        React.createElement('div', {
          className: 'widget-heatmap__grid widget-heatmap__grid--week'
        },
          compactWeekDays.map((meta, index) => renderHeatmapCell(meta, index, compactCellClass))
        )
      );
    }

    if (size === '2x2') {
      const weekDays = days.slice(-7).map(buildWeekDayMeta);
      const rows = [weekDays.slice(0, 4), weekDays.slice(4)];

      return React.createElement('div', { className: 'widget-heatmap widget-heatmap--2x2' },
        React.createElement('div', { className: 'widget-heatmap__week-grid widget-heatmap__week-grid--2x2' },
          rows.map((row, rowIndex) =>
            React.createElement('div', {
              key: `heatmap-2x2-row-${rowIndex}`,
              className: 'widget-heatmap__compact-row'
            }, row.map((meta, index) => renderHeatmapCell(meta, rowIndex * 10 + index, 'widget-heatmap__cell--2x2')))
          )
        )
      );
    }

    return React.createElement('div', { className: `widget-heatmap widget-heatmap--${variant}` },
      React.createElement('div', { className: `widget-heatmap__grid widget-heatmap__grid--${period}` },
        period === 'week'
          ? renderDays.map((day, i) => renderHeatmapCell(buildWeekDayMeta(day, i), i))
          : renderDays.map((day, i) => renderHeatmapCell({ day, isToday: highlightToday && day?.date === todayIso, hasTraining: !!day?.hasTraining, highStress: !!day?.highStress }, i))
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
        phase && widget.settings?.showPhase !== false && React.createElement('div', { className: 'widget-cycle__phase-header', style: { color: phaseColor } },
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
        widget.settings?.showCorrections !== false && recommendation && React.createElement('div', { className: 'widget-cycle__tip' },
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
      ),
      widget.settings?.showCorrections !== false && recommendation && !d.isTiny
        ? React.createElement('div', { className: 'widget-cycle__tip' }, recommendation)
        : null
    );
  }

  // === Crash Risk Widget Content v2.0 (EWS + Weight Loss Detection) ===
  function CrashRiskWidgetContent({ widget, data }) {
    const d = getWidgetDims(widget);
    const size = widget?.size || '2x1';

    const hasData = data?.hasData || false;
    const zone = data?.zone || 'stable';
    const zoneMeta = data?.zoneMeta || { label: 'Нет данных', color: '#64748b', light: '#f1f5f9', emoji: '—' };
    const pctPerWeek = data?.pctPerWeek || 0;
    const slopePerWeek = data?.slopePerWeek || 0;
    const direction = data?.direction || 'stable';
    const currentWeight = data?.currentWeight || 0;
    const totalDeltaKg = data?.totalDeltaKg || 0;
    const dataPoints = data?.dataPoints || 0;
    const periodDays = data?.periodDays || 7;
    const toGoalKg = data?.toGoalKg ?? null;
    const estimatedDaysToGoal = data?.estimatedDaysToGoal ?? null;
    const ewsCount = data?.ewsCount || 0;
    const ewsData = data?.ewsData || null;
    const message = data?.message || '';

    const dirArrow = direction === 'losing' ? '↓' : direction === 'gaining' ? '↑' : '→';
    const absPct = Math.abs(pctPerWeek);
    const deltaSign = totalDeltaKg < -0.05 ? '−' : totalDeltaKg > 0.05 ? '+' : '';
    const deltaAbs = Math.abs(totalDeltaKg);
    const color = zoneMeta.color;
    const colorLight = zoneMeta.light;

    const PRESETS = [7, 14, 30];
    const handlePeriodSwitch = (days, event) => {
      event?.stopPropagation?.();
      if (!widget?.id || periodDays === days) return;
      HEYS.Widgets.state?.updateWidget(widget.id, {
        settings: { ...(widget.settings || {}), periodDays: days }
      }, true);
      HEYS.dayUtils?.haptic?.('light');
    };

    const periodPresetRow = React.createElement('div', {
      style: {
        display: 'flex',
        gap: '4px',
        flexWrap: 'nowrap',
        justifyContent: 'center'
      }
    }, PRESETS.map((days) => {
      const isActive = periodDays === days;
      return React.createElement('button', {
        key: days,
        type: 'button',
        onClick: (event) => handlePeriodSwitch(days, event),
        onPointerDown: (event) => event.stopPropagation(),
        onPointerUp: (event) => event.stopPropagation(),
        onTouchStart: (event) => event.stopPropagation(),
        style: {
          border: 'none',
          borderRadius: '999px',
          padding: '2px 7px',
          minHeight: '22px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontSize: '0.68rem',
          lineHeight: 1,
          fontWeight: isActive ? 700 : 500,
          background: isActive ? color : 'var(--heys-bg-secondary,#f1f5f9)',
          color: isActive ? '#fff' : 'var(--heys-text-secondary,#94a3b8)',
          transition: 'all 0.15s ease'
        }
      }, `${days} дн.`);
    }));

    // === NO DATA ===
    if (!hasData) {
      return React.createElement('div', { className: 'widget-crash-risk widget-crash-risk--no-data' },
        React.createElement('div', { className: 'widget-crash-risk__icon' }, '⚖️'),
        React.createElement('div', { className: 'widget-crash-risk__message' }, message || 'Недостаточно данных')
      );
    }

    // === 2×1 COMPACT ===
    if (size === '2x1') {
      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--short widget-crash-risk--${zone}`,
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          alignSelf: 'stretch',
          width: '100%'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            minWidth: 0,
            flex: '1 1 auto'
          }
        },
          React.createElement('div', {
            style: { color, fontSize: '1.15rem', fontWeight: 800, lineHeight: 1 }
          }, `${dirArrow} ${absPct.toFixed(1)}%`),
          React.createElement('div', {
            className: 'widget-crash-risk__ews-badge',
            style: {
              background: colorLight,
              color,
              fontSize: '0.62rem',
              padding: '1px 6px',
              lineHeight: 1.2,
              fontWeight: 600,
              marginTop: '4px',
              maxWidth: '100%',
              borderRadius: '999px',
              display: 'inline-block'
            }
          }, `${zoneMeta.emoji} ${zoneMeta.label}`)
        ),
        React.createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            alignItems: 'stretch',
            justifyContent: 'center',
            flex: '0 0 auto'
          }
        }, PRESETS.map((days) => {
          const isActive = periodDays === days;
          return React.createElement('button', {
            key: `short-${days}`,
            type: 'button',
            onClick: (event) => handlePeriodSwitch(days, event),
            onPointerDown: (event) => event.stopPropagation(),
            onPointerUp: (event) => event.stopPropagation(),
            onTouchStart: (event) => event.stopPropagation(),
            style: {
              border: 'none',
              borderRadius: '999px',
              padding: '0 6px',
              height: '14px',
              minWidth: '38px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.58rem',
              lineHeight: '14px',
              fontWeight: isActive ? 700 : 500,
              background: isActive ? color : 'var(--heys-bg-secondary,#f1f5f9)',
              color: isActive ? '#fff' : 'var(--heys-text-secondary,#94a3b8)',
              transition: 'all 0.15s ease',
              display: 'block'
            }
          }, `${days} дн.`);
        }))
      );
    }

    // === 2×2 COMPACT ===
    if (size === '2x2') {
      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--compact widget-crash-risk--${zone}`
      },
        React.createElement('div', { className: 'widget-crash-risk__header' },
          React.createElement('div', {
            className: 'widget-crash-risk__percent',
            style: { color, fontSize: '1.4rem', fontWeight: 800 }
          }, `${dirArrow} ${absPct.toFixed(1)}%`)
        ),
        React.createElement('div', { className: 'widget-crash-risk__title' }, 'в неделю'),
        React.createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            marginTop: '6px'
          }
        },
          React.createElement('div', {
            className: 'widget-crash-risk__ews-badge',
            style: {
              background: colorLight,
              color,
              fontSize: '0.72rem',
              padding: '2px 8px',
              lineHeight: 1.2,
              fontWeight: 600
            }
          }, `${zoneMeta.emoji} ${zoneMeta.label}`),
          React.createElement('div', {
            style: {
              display: 'flex',
              gap: '4px',
              justifyContent: 'center',
              width: '100%'
            }
          }, PRESETS.map((days) => {
            const isActive = periodDays === days;
            return React.createElement('button', {
              key: `compact-${days}`,
              type: 'button',
              onClick: (event) => handlePeriodSwitch(days, event),
              onPointerDown: (event) => event.stopPropagation(),
              onPointerUp: (event) => event.stopPropagation(),
              onTouchStart: (event) => event.stopPropagation(),
              style: {
                border: 'none',
                borderRadius: '999px',
                padding: '2px 6px',
                minWidth: '42px',
                minHeight: '22px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.63rem',
                lineHeight: 1,
                fontWeight: isActive ? 700 : 500,
                background: isActive ? color : 'var(--heys-bg-secondary,#f1f5f9)',
                color: isActive ? '#fff' : 'var(--heys-text-secondary,#94a3b8)',
                transition: 'all 0.15s ease'
              }
            }, `${days} дн.`);
          }))
        )
      );
    }

    // === 4×2 STANDARD ===
    if (size === '4x2') {
      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--standard widget-crash-risk--${zone}`
      },
        // Left: rate KPI
        React.createElement('div', { className: 'widget-crash-risk__kpi' },
          React.createElement('div', {
            style: { fontSize: '1.4rem', color, fontWeight: 800, lineHeight: 1 }
          }, `${dirArrow} ${absPct.toFixed(1)}%`),
          React.createElement('div', { className: 'widget-crash-risk__label' }, '/неделю'),
          React.createElement('div', {
            style: { fontSize: '0.75rem', color: 'var(--heys-text-secondary,#94a3b8)', marginTop: '4px' }
          }, `${slopePerWeek < -0.05 ? '−' : slopePerWeek > 0.05 ? '+' : ''}${Math.abs(slopePerWeek).toFixed(2)} кг/нед`)
        ),
        // Right: zone + stats
        React.createElement('div', { className: 'widget-crash-risk__details' },
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' } },
            React.createElement('div', {
              style: { background: colorLight, color, fontWeight: 600, fontSize: '0.76rem', padding: '2px 8px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: '4px', lineHeight: 1.2 }
            }, `${zoneMeta.emoji} ${zoneMeta.label}`),
            periodPresetRow
          ),
          deltaAbs >= 0.1 && React.createElement('div', {
            style: { fontSize: '0.8rem', color: 'var(--heys-text-secondary,#94a3b8)' }
          }, `${deltaSign}${deltaAbs.toFixed(1)} кг за ${dataPoints} дн.`),
          widget.settings?.showGoal !== false && toGoalKg !== null && toGoalKg > 0 &&
          React.createElement('div', {
            style: { fontSize: '0.78rem', color: 'var(--heys-text-secondary,#94a3b8)', marginTop: '3px' }
          }, estimatedDaysToGoal
            ? `До цели ~${estimatedDaysToGoal} дн.`
            : `До цели: ${toGoalKg.toFixed(1)} кг`)
        )
      );
    }

    // === 4×3 EXTENDED ===
    if (size === '4x3' || (d.cols >= 4 && d.rows >= 3)) {
      const topWarnings = ewsData?.warnings?.slice(0, 3) || [];
      return React.createElement('div', {
        className: `widget-crash-risk widget-crash-risk--extended widget-crash-risk--${zone}`
      },
        // Header
        React.createElement('div', { className: 'widget-crash-risk__header-extended' },
          React.createElement('div', { className: 'widget-crash-risk__title-extended' }, 'Динамика веса'),
          React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', flexDirection: 'column', gap: '6px' } },
            React.createElement('div', {
              style: { background: colorLight, color, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, lineHeight: 1.2 }
            }, `${zoneMeta.emoji} ${zoneMeta.label}`),
            periodPresetRow
          )
        ),
        // KPI Section
        React.createElement('div', { className: 'widget-crash-risk__kpi-section' },
          React.createElement('div', { className: 'widget-crash-risk__kpi-block' },
            React.createElement('div', { style: { fontSize: '1.6rem', color, fontWeight: 800, lineHeight: 1 } },
              `${dirArrow} ${absPct.toFixed(1)}%`
            ),
            React.createElement('div', { className: 'widget-crash-risk__label' }, 'в неделю')
          ),
          React.createElement('div', { className: 'widget-crash-risk__weight-info' },
            React.createElement('div', { className: 'widget-crash-risk__weight-label' }, 'Сейчас'),
            React.createElement('div', { className: 'widget-crash-risk__weight-value' }, `${currentWeight.toFixed(1)} кг`),
            deltaAbs >= 0.1 && React.createElement('div', {
              style: { fontSize: '0.75rem', color: 'var(--heys-text-secondary,#94a3b8)' }
            }, `${deltaSign}${deltaAbs.toFixed(1)} кг за ${dataPoints} дн.`)
          )
        ),
        // Goal row
        widget.settings?.showGoal !== false && toGoalKg !== null && toGoalKg > 0 &&
        React.createElement('div', { className: 'widget-crash-risk__warnings-section', style: { paddingTop: '6px' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--heys-text-secondary,#94a3b8)' } },
            React.createElement('span', null, 'До целевого веса'),
            React.createElement('span', { style: { fontWeight: 600 } },
              estimatedDaysToGoal
                ? `~${estimatedDaysToGoal} дн. / −${toGoalKg.toFixed(1)} кг`
                : `${toGoalKg.toFixed(1)} кг`
            )
          )
        ),
        // EWS warnings
        widget.settings?.showWarnings !== false && topWarnings.length > 0 &&
        React.createElement('div', { className: 'widget-crash-risk__warnings-section' },
          React.createElement('div', { className: 'widget-crash-risk__warnings-title' }, `⚠️ EWS: ${ewsCount} предупреждений`),
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
        // Footer: quality info
        React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--heys-text-secondary,#94a3b8)', textAlign: 'right', paddingTop: '4px' } },
          `${dataPoints}/${periodDays} взвешиваний · R² ${(data?.regression?.r2 || 0).toFixed(2)}`
        )
      );
    }

    // === FALLBACK ===
    return React.createElement('div', {
      className: `widget-crash-risk widget-crash-risk--fallback widget-crash-risk--${zone}`
    },
      React.createElement('div', { style: { color, fontWeight: 800 } }, `${dirArrow} ${absPct.toFixed(1)}%`),
      React.createElement('div', { className: 'widget-crash-risk__label' }, 'в неделю')
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

  function getRelapseRiskColor(level) {
    if (level === 'critical') return 'var(--heys-ratio-crash)';
    if (level === 'high') return '#f97316';
    if (level === 'elevated') return 'var(--heys-ratio-over)';
    if (level === 'guarded') return 'var(--heys-ratio-low)';
    return 'var(--heys-ratio-good)';
  }

  function getRelapseGradientColors(level) {
    if (level === 'critical') return ['#fca5a5', '#ef4444'];
    if (level === 'high') return ['#fdba74', '#f97316'];
    if (level === 'elevated') return ['#fcd34d', '#f59e0b'];
    if (level === 'guarded') return ['#fde68a', '#eab308'];
    return ['#86efac', '#22c55e'];
  }

  function getRelapseLevelLabel(level) {
    switch (level) {
      case 'critical': return 'критично';
      case 'high': return 'высокий';
      case 'elevated': return 'повышен';
      case 'guarded': return 'настороженно';
      default: return 'спокойно';
    }
  }

  function getRelapseWindowMeta(key) {
    switch (key) {
      case 'next3h':
        return { label: 'Ближайшие 3ч', shortLabel: '3ч', description: 'Самый ближайший риск: стресс, голод и тяга к вкусной еде прямо сейчас.' };
      case 'tonight':
        return { label: 'Сегодня вечером', shortLabel: 'Вечер', description: 'Главное окно риска для вечернего срыва и потери контроля над едой.' };
      case 'next24h':
        return { label: 'Следующие 24ч', shortLabel: '24ч', description: 'Фон на сутки с учётом сна, повторяющегося стресса и давления дефицита.' };
      default:
        return { label: key || 'Окно', shortLabel: key || 'Окно', description: '' };
    }
  }

  function getRelapseComponentMeta(key) {
    switch (key) {
      case 'stressLoad':
        return { label: 'Стрессовая нагрузка', description: 'Текущий стресс и его накопление за последние дни.' };
      case 'sleepDebt':
        return { label: 'Недосып', description: 'Недосып, слабое восстановление и усталость, которая тянется дальше.' };
      case 'restrictionPressure':
        return { label: 'Давление дефицита', description: 'Недобор калорий и белка, длинные паузы без еды и давление дефицита.' };
      case 'rewardExposure':
        return { label: 'Тяга к вкусной еде', description: 'Когда сладкого и очень вкусной еды уже было много, остановиться сложнее.' };
      case 'timingContext':
        return { label: 'Контекст времени', description: 'Вечер, выходные и длинные интервалы без еды усиливают риск.' };
      case 'emotionalVulnerability':
        return { label: 'Эмоциональная уязвимость', description: 'Когда состояние проседает, держать спокойный режим питания сложнее.' };
      case 'protectiveBuffer':
        return { label: 'Защитный буфер', description: 'Факторы, которые снижают итоговый риск.' };
      default:
        return { label: key || 'Factor', description: '' };
    }
  }

  function getSortedRelapseWindows(windows) {
    return Object.entries(windows || {})
      .map(([key, value]) => ({ key, value: Math.round(Number(value) || 0), ...getRelapseWindowMeta(key) }))
      .sort((a, b) => b.value - a.value);
  }
  function getRelapseCutPatternLabel(pattern) {
    switch (pattern) {
      case 'controlled_deficit':
        return 'контролируемый дефицит';
      case 'aggressive_cut':
        return 'жёсткий дефицит';
      default:
        return 'нейтральный паттерн';
    }
  }
  function getRelapseHistoryQualityLabel(historyQuality) {
    const totalDays = Number(historyQuality?.totalDays) || 0;
    const completeDays = Number(historyQuality?.completeDays) || 0;
    if (!totalDays) return 'история почти пустая';
    if (completeDays >= totalDays * 0.8) return `${completeDays}/${totalDays} полных дней`;
    if (completeDays >= totalDays * 0.5) return `${completeDays}/${totalDays} дней достаточно полные`;
    return `${completeDays}/${totalDays} дней слабо заполнены`;
  }

  function getTopRelapseItems(items, count = 2) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => item && Number(item.value) > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, count);
  }

  function formatRelapseList(items) {
    const labels = (Array.isArray(items) ? items : [])
      .map((item) => item?.label || item?.title || item?.key || '')
      .filter(Boolean);

    if (labels.length === 0) return '';
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels[0] + ' и ' + labels[1];
    return labels.slice(0, -1).join(', ') + ' и ' + labels[labels.length - 1];
  }

  function getRelapseEffectiveComponentSummary(debug) {
    const rawComponents = debug?.components || {};
    const effectiveComponents = debug?.effectiveComponents || rawComponents;
    return getTopRelapseItems(Object.entries(effectiveComponents)
      .filter(([key]) => key !== 'protectiveBuffer')
      .map(([key, value]) => ({
        key,
        value: Number(value) || 0,
        ...getRelapseComponentMeta(key)
      }))
      .filter((item) => item.value > 0), 3);
  }

  function getRelapsePrimaryDriverSummary(snapshot, result, debug) {
    const primaryDrivers = Array.isArray(snapshot?.primaryDrivers)
      ? snapshot.primaryDrivers
      : (Array.isArray(result?.primaryDrivers) ? result.primaryDrivers : []);

    if (primaryDrivers.length > 0) {
      return primaryDrivers
        .map((item) => ({
          key: item?.id || item?.key || item?.label || '',
          value: Number(item?.impact) || 0,
          label: item?.label || item?.title || item?.key || 'Фактор'
        }))
        .filter((item) => item.value > 0)
        .slice(0, 3);
    }

    return getRelapseEffectiveComponentSummary(debug);
  }

  function getRelapseProtectionSummary(debug) {
    const domainRelief = debug?.protectiveBufferState?.domainRelief || {};
    const reliefItems = getTopRelapseItems(Object.entries(domainRelief)
      .map(([key, value]) => ({
        key,
        value: Number(value) || 0,
        ...getRelapseComponentMeta(key)
      })), 3);

    return reliefItems;
  }

  function buildRelapseHumanSummary(payload) {
    const snapshot = payload?.snapshot || {};
    const result = snapshot?.raw || {};
    const score = Math.round(Number(snapshot?.score ?? result?.score) || 0);
    const level = String(snapshot?.level || result?.level || 'low');
    const source = String(snapshot?.source || 'emotional');
    const relapseScore = Math.round(Number(snapshot?.relapseScore ?? snapshot?.rawScore ?? result?.score) || 0);
    const crashScore = Math.round(Number(snapshot?.crashScore) || 0);
    const crashWeight = Number(snapshot?.blendWeights?.crash);
    const confidence = Math.max(0, Math.min(100, Math.round(Number(snapshot?.confidence ?? result?.confidence) || 0)));
    const debug = result?.debug || {};
    const restriction = debug?.restrictionPressure || {};
    const historyQuality = debug?.historyQuality || {};
    const summaryDrivers = getRelapsePrimaryDriverSummary(snapshot, result, debug);
    const protectionRelief = getRelapseProtectionSummary(debug);
    const coverageLagPct = Math.round((Number(restriction?.coverageLag) || 0) * 100);
    const proteinLagPct = Math.round((Number(restriction?.proteinLag) || 0) * 100);
    const reliefTotal = Math.round(
      (Number(restriction?.progressAlignmentRelief) || 0) +
      (Number(restriction?.proteinCatchupRelief) || 0) +
      (Number(restriction?.controlledDeficitRelief) || 0)
    );
    const cutPattern = getRelapseCutPatternLabel(restriction?.cutPattern);
    const historyLabel = getRelapseHistoryQualityLabel(historyQuality);

    let headline = 'Риск сейчас низкий и выглядит управляемым.';
    if (level === 'guarded') headline = 'Риск уже требует внимания, но ситуация ещё управляемая.';
    if (level === 'elevated' || level === 'high' || level === 'critical') headline = 'Риск заметный: дефицит и восстановление уже перевешивают защитные факторы.';

    const bullets = [];

    if (score !== relapseScore || crashScore > 0) {
      const sourceText = source === 'both'
        ? 'итог — это общий радар из эмоционального и метаболического контуров'
        : source === 'metabolic'
          ? 'итог сейчас сильнее двигает метаболический контур'
          : 'итог сейчас в основном определяет эмоциональный контур';
      bullets.push(`Эмоциональный риск сейчас ${relapseScore}%, метаболический ${crashScore}%, а общий радар показывает ${score}%: ${sourceText}.`);
    } else {
      bullets.push(`Сейчас общий радар почти полностью совпадает с эмоциональным риском (${relapseScore}%): отдельный метаболический вклад не доминирует.`);
    }

    if (summaryDrivers.length > 0) {
      bullets.push(`Главные драйверы риска сейчас: ${formatRelapseList(summaryDrivers)}.`);
    }

    if (restriction?.cutPattern === 'aggressive_cut') {
      bullets.push('Сейчас это уже жёсткий дефицит: к вечеру такой сценарий чаще делает еду более импульсивной.');
    } else if (Number(restriction?.score) >= 8 || coverageLagPct > 0 || proteinLagPct > 0) {
      bullets.push(`Сейчас это ${cutPattern}: ситуацию ещё можно спокойно догнать — от плана отстают калории примерно на ${coverageLagPct}% и белок примерно на ${proteinLagPct}%.`);
    }

    if (protectionRelief.length > 0) {
      const reliefText = protectionRelief
        .map((item) => `${item.label} −${Number(item.value || 0).toFixed(1)}`)
        .join(', ');
      bullets.push(`Защитные факторы адресно гасят профиль риска: сильнее всего они смягчают ${reliefText}.`);
    } else if (reliefTotal > 0) {
      bullets.push(`Структура дня уже помогает: регулярные приёмы пищи и более ровный ритм сняли около ${reliefTotal} пунктов с давления дефицита.`);
    }

    if ((source === 'both' || source === 'metabolic') && crashScore > 0) {
      const metabolicContribution = Math.round(crashScore * (Number.isFinite(crashWeight) ? crashWeight : 0.4));
      const metabolicDriver = (Array.isArray(snapshot?.primaryDrivers) ? snapshot.primaryDrivers : []).find((driver) => driver?.source === 'crash');
      const metabolicLabel = String(metabolicDriver?.label || snapshot?.radarDrivers?.[0] || 'метаболический фон').toLowerCase();
      if (source === 'both') {
        bullets.push(`Метаболический фон тоже участвует: ${metabolicLabel} добавляет около ${metabolicContribution} пунктов к общему радару и заметнее влияет на окно 24ч.`);
      } else {
        bullets.push(`Сейчас риск сильнее двигает метаболический фон: ${metabolicLabel} формирует заметную часть итоговой оценки.`);
      }
    }

    bullets.push(`Доверие к оценке высокое: confidence ${confidence}% и история качества — ${historyLabel}.`);

    return {
      score,
      level,
      headline,
      bullets: bullets.slice(0, 4),
      cutPattern,
      historyLabel,
    };
  }

  function buildRelapseClientClipboardSummary(payload) {
    const snapshot = payload?.snapshot || {};
    const result = snapshot?.raw || {};
    const summary = buildRelapseHumanSummary({ ...payload, snapshot });
    const windows = getSortedRelapseWindows(snapshot?.windows || result?.windows);
    const recommendations = Array.isArray(snapshot?.recommendations)
      ? snapshot.recommendations
      : (Array.isArray(result?.recommendations) ? result.recommendations : []);
    const leadWindow = windows[0] || null;
    const actionSummary = recommendations
      .slice(0, 2)
      .map((item) => String(item?.text || '').trim())
      .filter(Boolean)
      .join(' ');

    const lines = [];
    if (summary?.headline) lines.push(summary.headline);

    const importantBullets = Array.isArray(summary?.bullets)
      ? summary.bullets.filter((bullet) => typeof bullet === 'string' && bullet.trim())
      : [];

    if (importantBullets[1]) lines.push(importantBullets[1]);
    if (leadWindow) {
      lines.push(`Ближайшая зона внимания — ${leadWindow.label.toLowerCase()}: около ${leadWindow.value}%.`);
    }
    if (actionSummary) {
      lines.push(`Что сделать сейчас: ${actionSummary}`);
    }

    return lines.slice(0, 4);
  }

  async function copyTextWithFallback(text) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);

    if (!copied) {
      throw new Error('clipboard fallback failed');
    }
  }

  function formatRelapseRiskTraceForClipboard(payload) {
    const snapshot = payload?.snapshot || {};
    const result = snapshot?.raw || {};
    const humanSummary = buildRelapseHumanSummary({ ...payload, snapshot });
    const clientSummary = buildRelapseClientClipboardSummary({ ...payload, snapshot });
    const hasRawTrace = !!(result && typeof result === 'object' && Object.keys(result).length > 0 && result?.debug);
    const score = Math.round(Number(snapshot?.score ?? result?.score) || 0);
    const relapseScore = Math.round(Number(snapshot?.relapseScore ?? snapshot?.rawScore ?? result?.score) || 0);
    const crashScore = Math.round(Number(snapshot?.crashScore) || 0);
    const level = String(snapshot?.level || result?.level || 'low');
    const confidence = Math.max(0, Math.min(100, Math.round(Number(snapshot?.confidence ?? result?.confidence) || 0)));
    const windows = getSortedRelapseWindows(snapshot?.windows || result?.windows);
    const drivers = Array.isArray(snapshot?.primaryDrivers) ? snapshot.primaryDrivers : (Array.isArray(result?.primaryDrivers) ? result.primaryDrivers : []);
    const protectiveFactors = Array.isArray(snapshot?.protectiveFactors) ? snapshot.protectiveFactors : (Array.isArray(result?.protectiveFactors) ? result.protectiveFactors : []);
    const recommendations = Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : (Array.isArray(result?.recommendations) ? result.recommendations : []);
    const components = Object.entries(result?.debug?.components || {})
      .map(([key, value]) => ({
        key,
        value: Number(value) || 0,
        ...getRelapseComponentMeta(key)
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const lines = [
      '═══════════════════════════════════════════════',
      '🧠 HEYS — Relapse Risk Score trace',
      'Дата выгрузки: ' + new Date().toLocaleString('ru-RU'),
      '═══════════════════════════════════════════════',
      '',
      'Сводка:',
      '  • Score: ' + score + '%',
      '  • Relapse raw: ' + relapseScore + '%',
      '  • Crash raw: ' + crashScore + '%',
      '  • Level: ' + level + ' (' + getRelapseLevelLabel(level) + ')',
      '  • Confidence: ' + confidence + '%',
      '  • Score model: ' + String(snapshot?.scoreModel || (snapshot?.blendWeights ? 'risk_radar_blended' : 'relapse_raw')),
      '  • Виджет: ' + (payload?.widget?.id || 'unknown') + ' / ' + (payload?.widget?.size || 'unknown'),
      ''
    ];

    if (snapshot?.blendWeights && (Number(snapshot?.blendWeights?.relapse) > 0 || Number(snapshot?.blendWeights?.crash) > 0)) {
      lines.push('Blend details:');
      lines.push('  • Source: ' + String(snapshot?.source || 'none'));
      lines.push('  • Blend weights: relapse=' + (Number(snapshot?.blendWeights?.relapse || 0).toFixed(2)) + ', crash=' + (Number(snapshot?.blendWeights?.crash || 0).toFixed(2)));
      lines.push('');
    }

    if (!hasRawTrace) {
      lines.push('⚠️ Внимание: raw trace payload пуст.');
      lines.push('   Это означает, что modal был открыт без полного результата расчёта,');
      lines.push('   поэтому лог ниже не подтверждает корректный Relapse Risk calculation.');
      lines.push('');
    }

    lines.push('Коротко для клиента:');
    (clientSummary || []).forEach((bullet) => {
      lines.push('  • ' + bullet);
    });

    lines.push('');
    lines.push('Техническая раскладка:');
    lines.push('  • ' + humanSummary.headline);
    (humanSummary.bullets || []).forEach((bullet) => {
      lines.push('  • ' + bullet);
    });

    lines.push('');
    lines.push('Окна риска:');
    if (!windows.length) {
      lines.push(hasRawTrace ? '  (нет данных)' : '  (payload пуст: окна риска не были переданы)');
    } else {
      windows.forEach((windowInfo, index) => {
        lines.push('  ' + (index + 1) + '. ' + windowInfo.label + ' → ' + windowInfo.value + '%' + (windowInfo.description ? ' | ' + windowInfo.description : ''));
      });
    }

    lines.push('');
    lines.push('Primary drivers:');
    if (!drivers.length) {
      lines.push(hasRawTrace ? '  (нет драйверов)' : '  (payload пуст: драйверы не были переданы)');
    } else {
      drivers.forEach((driver, index) => {
        const impact = Math.round(Number(driver?.impact) || 0);
        lines.push('  ' + (index + 1) + '. ' + (driver?.label || driver?.id || 'driver') + ' | impact=+' + impact + (driver?.explanation ? ' | ' + driver.explanation : ''));
      });
    }

    lines.push('');
    lines.push('Protective factors:');
    if (!protectiveFactors.length) {
      lines.push(hasRawTrace ? '  (нет защитных факторов)' : '  (payload пуст: protective factors не были переданы)');
    } else {
      protectiveFactors.forEach((factor, index) => {
        lines.push('  ' + (index + 1) + '. ' + (factor?.label || factor?.id || 'factor') + (factor?.explanation ? ' | ' + factor.explanation : ''));
      });
    }

    lines.push('');
    lines.push('Компоненты расчёта:');
    if (!components.length) {
      lines.push(hasRawTrace ? '  (нет debug.components)' : '  (payload пуст: debug.components не были переданы)');
    } else {
      components.forEach((component, index) => {
        const sign = component.value >= 0 ? '+' : '';
        lines.push('  ' + (index + 1) + '. ' + component.label + ' (' + component.key + ') = ' + sign + component.value.toFixed(2) + (component.description ? ' | ' + component.description : ''));
      });
    }

    lines.push('');
    lines.push('Recommendations:');
    if (!recommendations.length) {
      lines.push(hasRawTrace ? '  (нет рекомендаций)' : '  (payload пуст: recommendations не были переданы)');
    } else {
      recommendations.forEach((rec, index) => {
        lines.push('  ' + (index + 1) + '. ' + (rec?.text || rec?.action || rec?.id || 'recommendation'));
      });
    }

    const protectionRelief = getRelapseProtectionSummary(result?.debug || {});
    const effectiveComponents = Object.entries(result?.debug?.effectiveComponents || {})
      .filter(([key]) => key !== 'protectiveBuffer')
      .map(([key, value]) => ({
        key,
        value: Number(value) || 0,
        ...getRelapseComponentMeta(key)
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    lines.push('');
    lines.push('Protection by domains:');
    if (!protectionRelief.length) {
      lines.push(hasRawTrace ? '  (нет адресного domain relief)' : '  (payload пуст: protectiveBufferState.domainRelief не передан)');
    } else {
      protectionRelief.forEach((item, index) => {
        lines.push('  ' + (index + 1) + '. ' + item.label + ' → −' + item.value.toFixed(2));
      });
    }

    lines.push('');
    lines.push('Effective components (after protection):');
    if (!effectiveComponents.length) {
      lines.push(hasRawTrace ? '  (нет effective components)' : '  (payload пуст: debug.effectiveComponents не были переданы)');
    } else {
      effectiveComponents.forEach((component, index) => {
        const sign = component.value >= 0 ? '+' : '';
        lines.push('  ' + (index + 1) + '. ' + component.label + ' (' + component.key + ') = ' + sign + component.value.toFixed(2) + (component.description ? ' | ' + component.description : ''));
      });
    }

    lines.push('');
    lines.push('Raw debug payload:');
    lines.push(JSON.stringify({
      snapshot,
      raw: result
    }, null, 2));
    lines.push('');
    lines.push('═══════════════════════════════════════════════');

    return lines.join('\n');
  }

  function getRelapseMeterTone(level) {
    switch (level) {
      case 'critical':
      case 'high':
        return 'high';
      case 'elevated':
        return 'medium';
      case 'guarded':
      case 'low':
      default:
        return 'low';
    }
  }

  function resolveRelapseGaugeStrokeWidth(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(8, Math.min(30, Math.round(parsed)));
  }

  function RelapseRiskSpeedometer({ score, level, size = 140, label = 'Риск срыва', compact = false, gaugeStrokeWidth }) {
    const safeRisk = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const tone = getRelapseMeterTone(level);
    const strokeWidth = resolveRelapseGaugeStrokeWidth(gaugeStrokeWidth, compact ? 14 : 12);
    const radius = (size - strokeWidth) / 2;
    const halfCircumference = Math.PI * radius;
    const progress = (safeRisk / 100) * halfCircumference;
    const offset = halfCircumference - progress;
    const colors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    const valueY = size / 2 - (compact ? 2 : 5);
    const labelY = size / 2 + (compact ? 14 : 20);
    const viewHeight = size / 2 + (compact ? 15 : 20);

    return React.createElement('div', {
      className: `widget-relapse-risk__speedometer ${compact ? 'widget-relapse-risk__speedometer--compact' : ''}`,
      style: { width: size, height: size / 2 + (compact ? 25 : 30) }
    },
      React.createElement('svg', {
        viewBox: `0 0 ${size} ${viewHeight}`,
        className: 'widget-relapse-risk__speedometer-svg'
      },
        React.createElement('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: 'var(--widget-surface-muted, rgba(255, 255, 255, 0.10))',
          strokeWidth,
          strokeLinecap: 'round'
        }),
        React.createElement('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: colors[tone] || colors.medium,
          strokeWidth,
          strokeLinecap: 'round',
          strokeDasharray: halfCircumference,
          strokeDashoffset: offset,
          style: { transition: 'stroke-dashoffset 0.6s ease' }
        }),
        React.createElement('text', {
          x: size / 2,
          y: valueY,
          textAnchor: 'middle',
          className: 'widget-relapse-risk__speedometer-value',
          style: {
            fontSize: compact ? 28 : 36,
            fontWeight: 700,
            fill: colors[tone] || 'var(--text-primary)'
          }
        }, `${safeRisk}%`),
        React.createElement('text', {
          x: size / 2,
          y: labelY,
          textAnchor: 'middle',
          className: 'widget-relapse-risk__speedometer-label',
          style: { fontSize: compact ? 10 : 12, fill: 'var(--text-secondary, #64748b)' }
        }, label)
      )
    );
  }

  if (!window._relapseRingAnimated) window._relapseRingAnimated = new Set();
  const _relapseRingAnimated = window._relapseRingAnimated;
  const RELAPSE_PROFILE_STORAGE_KEY = 'heys_relapse_risk_dev_profile';

  function getRelapseProfileOptions() {
    const profiles = HEYS.RelapseRisk?.CONFIG?.PROFILES || {};
    return Object.values(profiles).map((profile) => ({
      key: profile?.key,
      label: profile?.label || profile?.key || 'profile',
      description: profile?.description || ''
    })).filter((profile) => !!profile.key);
  }

  function getRelapseSelectedProfileKey(snapshot) {
    const snapshotKey = snapshot?.profile?.key || snapshot?.raw?.profile?.key || snapshot?.selectedProfileKey;
    if (typeof snapshotKey === 'string' && snapshotKey.trim()) {
      return snapshotKey.trim();
    }

    try {
      const raw = localStorage.getItem(RELAPSE_PROFILE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
      }
    } catch (e) {
      // no-op
    }

    return HEYS.RelapseRisk?.CONFIG?.DEFAULT_PROFILE_KEY || 'v1_1';
  }

  function setRelapseSelectedProfileKey(profileKey) {
    if (typeof profileKey !== 'string' || !profileKey.trim()) return;

    try {
      if (typeof HEYS.utils?.lsSet === 'function') {
        HEYS.utils.lsSet(RELAPSE_PROFILE_STORAGE_KEY, profileKey.trim());
        return;
      }
      localStorage.setItem(RELAPSE_PROFILE_STORAGE_KEY, JSON.stringify(profileKey.trim()));
    } catch (e) {
      // no-op
    }
  }

  function shouldShowRelapseDevPanel() {
    try {
      const host = window?.location?.hostname || '';
      if (host === 'localhost' || host === '127.0.0.1') return true;
      if (localStorage.getItem('heys_debug_widgets') === '1') return true;
      if (localStorage.getItem('heys_debug_relapse_profiles') === '1') return true;
    } catch (e) {
      // no-op
    }
    return false;
  }

  function resolveRelapseSnapshot(widget, profileKey) {
    const targetWidget = widget && widget.type === 'relapseRisk'
      ? widget
      : { id: 'relapseRisk-dev', type: 'relapseRisk', size: '2x2', settings: {} };

    try {
      const providerSnapshot = HEYS.Widgets.data?.getRelapseRiskData?.(targetWidget, {
        weightProfileKey: profileKey
      }) || HEYS.Widgets.data?.getDataForWidget?.(targetWidget);
      if (providerSnapshot?.raw) {
        return providerSnapshot;
      }
    } catch (providerError) {
      console.warn('[HEYS.relapseRisk] provider snapshot failed', providerError?.message);
    }

    if (!HEYS.RelapseRisk?.calculate) {
      return { hasData: false, score: 0, level: 'low', message: 'Engine not loaded' };
    }

    try {
      const U = HEYS.utils || {};
      const lsGet = typeof U?.lsGet === 'function'
        ? U.lsGet.bind(U)
        : ((k, fb) => {
          try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; }
        });
      const todayStr = HEYS.dayUtils?.todayISO?.() || new Date().toISOString().split('T')[0];
      const dayData = HEYS.DayData?.getCurrentDay?.() || lsGet('heys_dayv2_' + todayStr, {});
      const profile = lsGet('heys_profile', {});
      const dayTot = HEYS.DayData?.getDayTot?.(dayData)
        || (typeof HEYS.dayCalculations?.calculateDayTotals === 'function'
          ? HEYS.dayCalculations.calculateDayTotals(dayData)
          : {});
      let normAbs = HEYS.norms?.getNormAbs?.(profile, profile?.pIndex || 0) || {};
      if ((!normAbs.kcal || normAbs.kcal <= 0) && typeof HEYS.TDEE?.calculate === 'function') {
        const tdee = HEYS.TDEE.calculate(profile);
        if (tdee && tdee.optimum > 0) {
          const weight = Number(profile.weight || profile.baseWeight || 70) || 70;
          normAbs = { kcal: tdee.optimum, prot: Math.round(weight * 1.6) };
        }
      }
      const historyDays = [];

      for (let i = 14; i >= 1; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const day = lsGet(`heys_dayv2_${dateStr}`, null);
        if (day && typeof day === 'object' && Object.keys(day).length > 0) {
          historyDays.push({
            date: dateStr,
            ...day,
            dayTot: HEYS.DayData?.getDayTot?.(day)
              || day.dayTot
              || (typeof HEYS.dayCalculations?.calculateDayTotals === 'function'
                ? HEYS.dayCalculations.calculateDayTotals(day)
                : {})
          });
        }
      }

      const result = HEYS.RelapseRisk.calculate({
        dayData,
        profile,
        dayTot,
        normAbs,
        historyDays,
        weightProfileKey: profileKey,
        now: new Date().toISOString()
      });
      const compare = typeof HEYS.RelapseRisk?.compareProfiles === 'function'
        ? HEYS.RelapseRisk.compareProfiles({
          dayData,
          profile,
          dayTot,
          normAbs,
          historyDays,
          weightProfileKey: profileKey,
          now: new Date().toISOString()
        })
        : null;

      return {
        hasData: true,
        profile: result?.profile || null,
        selectedProfileKey: profileKey,
        score: Math.round(Number(result?.score) || 0),
        level: result?.level || 'low',
        confidence: Math.round(Number(result?.confidence) || 0),
        primaryDrivers: Array.isArray(result?.primaryDrivers) ? result.primaryDrivers : [],
        protectiveFactors: Array.isArray(result?.protectiveFactors) ? result.protectiveFactors : [],
        windows: result?.windows || {},
        recommendations: Array.isArray(result?.recommendations) ? result.recommendations : [],
        compare,
        raw: result,
        _fallbackSource: 'modal_direct_engine'
      };
    } catch (fallbackErr) {
      console.warn('[HEYS.relapseRisk] direct engine fallback failed:', fallbackErr?.message);
      return { hasData: false, score: 0, level: 'low', _error: fallbackErr?.message };
    }
  }

  function RelapseRiskWidgetContent({ widget, data }) {
    const score = Math.round(Number(data?.score) || 0);
    const relapseScore = Math.round(Number(data?.relapseScore ?? data?.score) || 0);
    const crashScore = Math.round(Number(data?.crashScore) || 0);
    const source = data?.source || 'none';
    const target = 100;
    const pct = Math.max(0, Math.min(100, Math.round(Number(data?.pct) || score)));
    const level = String(data?.level || 'low');
    const topWindowLabel = typeof data?.topWindowLabel === 'string' ? data.topWindowLabel : 'сейчас';
    const topWindowScore = Math.round(Number.isFinite(Number(data?.topWindowScore)) ? Number(data.topWindowScore) : score);
    const primaryDriver = data?.primaryDriver || null;
    const primaryDrivers = Array.isArray(data?.primaryDrivers) ? data.primaryDrivers.slice(0, 2) : [];
    const confidence = Math.max(0, Math.min(100, Math.round(Number(data?.confidence) || 0)));
    const recommendation = (() => {
      const rec = data?.recommendation;
      if (!rec) return null;
      if (typeof rec === 'string') return rec;
      if (typeof rec?.text === 'string' && rec.text.trim()) return rec.text.trim();
      if (typeof rec?.label === 'string' && rec.label.trim()) return rec.label.trim();
      if (typeof rec?.title === 'string' && rec.title.trim()) return rec.title.trim();
      return null;
    })();

    const getSourceLabel = () => {
      switch (source) {
        case 'emotional': return 'Эмоц.';
        case 'metabolic': return 'Метабол.';
        case 'both': return 'Оба';
        default: return '';
      }
    };

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : d.isTall ? 'tall' : 'std';

    const color = getRelapseRiskColor(level);
    const [gradStart, gradEnd] = getRelapseGradientColors(level);
    const basePct = Math.max(0, Math.min(100, pct));
    const _widgetKey = `relapse-ring-${widget?.id || '0'}`;
    const _alreadyAnimated = _relapseRingAnimated.has(_widgetKey);
    const [displayPct, setDisplayPct] = React.useState(_alreadyAnimated ? basePct : 0);
    const _ringMounted = React.useRef(_alreadyAnimated);

    React.useEffect(() => {
      if (_alreadyAnimated) return;
      const raf = requestAnimationFrame(() => {
        _relapseRingAnimated.add(_widgetKey);
        setDisplayPct(basePct);
        _ringMounted.current = true;
      });
      return () => cancelAnimationFrame(raf);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
      if (_ringMounted.current) {
        setDisplayPct(basePct);
      }
    }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-relapse-risk widget-relapse-risk--micro' },
        React.createElement('div', { className: 'widget-micro__label' }, 'риск'),
        React.createElement('div', { className: 'widget-relapse-risk__value', style: { color } }, `${score}`)
      );
    }

    if (size === '2x2') {
      const showConfidence = widget.settings?.showConfidence !== false;
      const showSource = widget.settings?.showSource !== false;
      const srcLabel = getSourceLabel();
      return React.createElement('div', { className: 'widget-relapse-risk widget-relapse-risk--2x2' },
        React.createElement('div', { className: 'widget-relapse-risk__gauge-wrap' },
          React.createElement(RelapseRiskSpeedometer, {
            score: displayPct,
            level,
            size: 136,
            label: 'Риск-радар',
            compact: true,
            gaugeStrokeWidth: widget.settings?.gaugeStrokeWidth
          })
        ),
        React.createElement('div', { className: 'widget-relapse-risk__footer-badge-wrap' },
          React.createElement('div', {
            className: 'widget-relapse-risk__gauge-status-pill widget-relapse-risk__gauge-status-pill--footer',
            style: { color, background: `${color}16`, borderColor: `${color}22` }
          }, getRelapseLevelLabel(level)),
        ),
        showConfidence ? React.createElement('div', { className: 'widget-relapse-risk__label' }, `conf ${confidence}%`) : null
      );
    }

    const showDrivers = widget.settings?.showDrivers !== false;
    const showRecommendation = widget.settings?.showRecommendation !== false;
    const showConfidence = widget.settings?.showConfidence !== false;
    const showSource = widget.settings?.showSource !== false;
    const srcLabel = getSourceLabel();
    const riskSummaryLabel = showConfidence
      ? `пик ${topWindowScore}% ${topWindowLabel} · conf ${confidence}%`
      : `пик ${topWindowScore}% ${topWindowLabel}`;

    return React.createElement('div', { className: `widget-relapse-risk widget-relapse-risk--${variant}` },
      React.createElement('div', { className: 'widget-relapse-risk__top' },
        React.createElement('div', { className: 'widget-relapse-risk__value', style: { color } }, `${score}%`),
        React.createElement('div', { className: 'widget-relapse-risk__pct-pill', style: { color, background: `${color}20` } }, getRelapseLevelLabel(level))
      ),
      React.createElement('div', { className: 'widget-relapse-risk__label' }, riskSummaryLabel),
      React.createElement('div', { className: 'widget-relapse-risk__progress' },
        React.createElement('div', {
          className: 'widget-relapse-risk__bar',
          style: { width: `${pct}%`, background: `linear-gradient(90deg, ${gradStart} 0%, ${gradEnd} 100%)` }
        })
      ),
      showDrivers && primaryDrivers.length > 0
        ? React.createElement('div', { className: 'widget-relapse-risk__drivers' },
          primaryDrivers.map((driver, index) => React.createElement('span', {
            key: `${driver?.key || driver?.label || 'driver'}-${index}`,
            className: 'widget-relapse-risk__driver-chip'
          }, driver?.label || driver?.key || 'driver'))
        )
        : null,
      showRecommendation && recommendation
        ? React.createElement('div', { className: 'widget-relapse-risk__recommendation' }, recommendation)
        : primaryDriver
          ? React.createElement('div', { className: 'widget-relapse-risk__recommendation' }, primaryDriver.label || primaryDriver.key || 'Есть фактор риска')
          : null
    );
  }

  // === Status Details Modal ===
  function StatusDetailsModal({ payload, isOpen, onClose }) {
    if (!isOpen || !payload) return null;

    const data = payload.data || {};
    const status = data.status || {};
    const score = Math.round(Number(status.score) || 0);
    const level = status.level || {};
    const levelLabel = level.label || 'Нет данных';
    const levelEmoji = level.emoji || '';
    const levelColor = level.color || '#94a3b8';
    const factorScores = status.factorScores || {};
    const factorDetails = status.factorDetails || {};
    const categoryScores = status.categoryScores || {};
    const breakdown = Array.isArray(status.breakdown) ? status.breakdown : [];
    const topActions = Array.isArray(status.topActions) ? status.topActions : [];

    const getColor = (s) => {
      if (s >= 85) return '#10b981';
      if (s >= 70) return '#22c55e';
      if (s >= 50) return '#eab308';
      if (s >= 30) return '#f97316';
      return '#ef4444';
    };

    const copyStatusLog = async () => {
      try {
        const lines = [
          '=== HEYS Status Score Log ===',
          `Date: ${new Date().toISOString()}`,
          `Score: ${score}/100 (${levelLabel})`,
          '',
          '--- Category Scores ---',
          ...Object.entries(categoryScores).map(([k, v]) => `  ${v.icon || ''} ${v.label || k}: ${v.score}`),
          '',
          '--- Factor Scores ---',
          ...Object.entries(factorScores).map(([k, v]) => `  ${k}: ${v}`),
          '',
          '--- Factor Details ---',
          ...Object.entries(factorDetails).map(([k, v]) => `  ${k}: ${v.value}/${v.target} ${v.unit || ''} (${v.percent != null ? v.percent + '%' : v.label || ''})`),
          '',
          '--- Top Actions ---',
          ...topActions.map((a, i) => `  ${i + 1}. ${a.icon || ''} ${a.text} (${a.factor || ''})`),
          '',
          '--- Raw Status ---',
          JSON.stringify(status, null, 2)
        ];
        await copyTextWithFallback(lines.join('\n'));
        HEYS.Toast?.success?.('Status лог скопирован');
      } catch (err) {
        console.error('[HEYS.status.copy] ❌', err);
        HEYS.Toast?.error?.('Не удалось скопировать лог');
      }
    };

    const handleBackdropClick = (e) => {
      if (e.target === e.currentTarget) onClose?.();
    };

    return React.createElement('div', {
      className: 'widget-relapse-risk__modal-overlay',
      onClick: handleBackdropClick
    },
      React.createElement('div', {
        className: 'widget-relapse-risk__modal',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        React.createElement('div', { className: 'widget-relapse-risk__modal-header' },
          React.createElement('div', { className: 'widget-relapse-risk__modal-title-wrap' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-eyebrow' }, 'Status Score'),
            React.createElement('h3', { className: 'widget-relapse-risk__modal-title' }, 'Детали оценки дня')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'widget-relapse-risk__modal-close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '✕')
        ),
        // Content
        React.createElement('div', { className: 'widget-relapse-risk__modal-content' },
          // Hero
          React.createElement('div', { className: 'widget-relapse-risk__modal-hero' },
            React.createElement('div', {
              className: 'widget-relapse-risk__modal-score-shell',
              style: { background: `${levelColor}12`, borderColor: `${levelColor}33` }
            },
              React.createElement('div', {
                style: { fontSize: '3.5rem', fontWeight: 800, color: levelColor, lineHeight: 1 }
              }, score),
              React.createElement('div', {
                className: 'widget-relapse-risk__modal-score-level',
                style: { color: levelColor, background: `${levelColor}16`, borderColor: `${levelColor}26` }
              }, `${levelEmoji} ${levelLabel}`)
            )
          ),

          // Categories
          Object.keys(categoryScores).length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Категории'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              Object.entries(categoryScores).map(([key, cat]) =>
                React.createElement('div', { key, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  React.createElement('span', { style: { fontSize: '0.85rem', color: 'var(--heys-text-secondary, #94a3b8)' } }, `${cat.icon || ''} ${cat.label || key}`),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('div', {
                      style: { width: '80px', height: '6px', borderRadius: '3px', background: 'var(--heys-bg-secondary, #1e293b)' }
                    },
                      React.createElement('div', {
                        style: { width: `${Math.min(100, cat.score || 0)}%`, height: '100%', borderRadius: '3px', background: getColor(cat.score || 0), transition: 'width 0.3s ease' }
                      })
                    ),
                    React.createElement('span', { style: { fontSize: '0.85rem', fontWeight: 600, color: getColor(cat.score || 0), minWidth: '28px', textAlign: 'right' } }, cat.score || 0)
                  )
                )
              )
            )
          ),

          // Factor breakdown
          breakdown.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Факторы'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              breakdown.map((f, i) =>
                React.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  React.createElement('span', { style: { fontSize: '0.8rem', color: 'var(--heys-text-secondary, #94a3b8)' } },
                    `${f.icon || ''} ${f.label || f.factorId}`
                  ),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    f.percent != null
                      ? React.createElement('span', { style: { fontSize: '0.7rem', color: 'var(--heys-text-tertiary, #64748b)' } }, `${f.value}/${f.target}${f.unit ? ' ' + f.unit : ''}`)
                      : null,
                    React.createElement('span', { style: { fontSize: '0.8rem', fontWeight: 600, color: getColor(f.score || 0), minWidth: '24px', textAlign: 'right' } }, f.score || 0)
                  )
                )
              )
            )
          ),

          // Top actions
          topActions.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Рекомендации'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              topActions.map((a, i) =>
                React.createElement('div', { key: i, style: { fontSize: '0.85rem', color: 'var(--heys-text-secondary, #94a3b8)' } },
                  `${a.icon || '→'} ${a.text}`)
              )
            )
          ),

          // Copy button
          React.createElement('div', { style: { display: 'flex', justifyContent: 'center', paddingTop: '16px', paddingBottom: '8px' } },
            React.createElement('button', {
              type: 'button',
              className: 'widget-relapse-risk__modal-copy-btn',
              onClick: copyStatusLog
            }, '📋 Скопировать лог')
          )
        )
      )
    );
  }

  // === Crash Risk Details Modal ===
  function CrashRiskDetailsModal({ payload, isOpen, onClose, onPeriodChange }) {
    // Period preset state — initialized from widget setting, defaults to 7
    const initialPeriod = payload?.data?.periodDays || 7;
    const [activePeriod, setActivePeriod] = useState(initialPeriod);
    const [liveData, setLiveData] = useState(null);
    const [loadingPeriod, setLoadingPeriod] = useState(false);

    // Recalculate when period changes (using the data provider directly)
    useEffect(() => {
      if (!isOpen) return;
      if (activePeriod === initialPeriod && !liveData) return; // first render uses payload.data
      setLoadingPeriod(true);
      try {
        const provider = HEYS?.Widgets?.DataProviders?.crashRisk;
        if (provider) {
          const result = provider.getData({ days: activePeriod });
          setLiveData(result);
        }
      } catch (e) {
        console.warn('[HEYS.weightProgress.modal] period recalc failed:', e);
      } finally {
        setLoadingPeriod(false);
      }
    }, [activePeriod, isOpen]);

    if (!isOpen || !payload) return null;

    // Use liveData if available, else fall back to payload.data
    const data = liveData || payload.data || {};
    const zone = data.zone || 'stable';
    const zoneMeta = data.zoneMeta || { label: 'Нет данных', color: '#64748b', light: '#f1f5f9', emoji: '—' };
    const zoneHint = data.zoneHint || '';
    const pctPerWeek = Number(data.pctPerWeek) || 0;
    const slopePerWeek = Number(data.slopePerWeek) || 0;
    const direction = data.direction || 'stable';
    const currentWeight = Number(data.currentWeight) || 0;
    const firstWeight = Number(data.firstWeight) || 0;
    const totalDeltaKg = Number(data.totalDeltaKg) || 0;
    const dataCompleteness = Number(data.dataCompleteness) || 0;
    const goalWeight = data.goalWeight ?? null;
    const toGoalKg = data.toGoalKg ?? null;
    const estimatedDaysToGoal = data.estimatedDaysToGoal ?? null;
    const ewsCount = data.ewsCount || 0;
    const warnings = data.ewsData?.warnings || [];
    const weightData = data.weightData || [];
    const r2 = data.regression?.r2 || 0;
    const dataPoints = data.dataPoints || 0;
    const periodDays = data.periodDays || activePeriod;

    const color = zoneMeta.color;
    const dirArrow = direction === 'losing' ? '↓' : direction === 'gaining' ? '↑' : '→';
    const absPct = Math.abs(pctPerWeek);
    const deltaSign = totalDeltaKg < -0.05 ? '−' : totalDeltaKg > 0.05 ? '+' : '';
    const deltaAbs = Math.abs(totalDeltaKg);

    const PRESETS = [
      { days: 7, label: '7 дн.' },
      { days: 14, label: '14 дн.' },
      { days: 30, label: '30 дн.' },
    ];

    const copyLog = async () => {
      try {
        const lines = [
          '=== HEYS Weight Progress Log ===',
          `Date: ${new Date().toISOString()}`,
          `Period: ${activePeriod} days`,
          `Zone: ${zone} (${zoneMeta.label})`,
          `Direction: ${direction}`,
          `Rate: ${pctPerWeek >= 0 ? '+' : ''}${pctPerWeek.toFixed(2)}%/week`,
          `Slope: ${slopePerWeek >= 0 ? '+' : ''}${slopePerWeek.toFixed(3)} kg/week`,
          `Current Weight: ${currentWeight.toFixed(1)} kg`,
          firstWeight ? `First Weight (${dataPoints} days ago): ${firstWeight.toFixed(1)} kg` : null,
          `Total Delta: ${deltaSign}${deltaAbs.toFixed(2)} kg`,
          `Data: ${dataPoints}/${periodDays} days (${(dataCompleteness * 100).toFixed(0)}%)`,
          `Trend R²: ${r2.toFixed(3)}`,
          goalWeight ? `Goal: ${goalWeight} kg (remaining: ${(toGoalKg || 0).toFixed(1)} kg)` : null,
          estimatedDaysToGoal ? `ETA to Goal: ~${estimatedDaysToGoal} days` : null,
          `EWS Count: ${ewsCount}`,
          '',
          '--- EWS Warnings ---',
          ...warnings.map((w, i) => `  ${i + 1}. [${w.severity}] ${w.message}`),
          '',
          '--- Weight History ---',
          ...weightData.map(p => `  ${p.date}: ${p.weight.toFixed(1)} kg`),
          '',
          '--- Raw Data ---',
          JSON.stringify(data, null, 2),
        ].filter(Boolean);
        await copyTextWithFallback(lines.join('\n'));
        HEYS.Toast?.success?.('Weight Progress лог скопирован');
      } catch (err) {
        console.error('[HEYS.weightProgress.copy] ❌', err);
        HEYS.Toast?.error?.('Не удалось скопировать лог');
      }
    };

    const handleBackdropClick = (e) => {
      if (e.target === e.currentTarget) onClose?.();
    };

    return React.createElement('div', {
      className: 'widget-relapse-risk__modal-overlay',
      onClick: handleBackdropClick
    },
      React.createElement('div', {
        className: 'widget-relapse-risk__modal',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        React.createElement('div', { className: 'widget-relapse-risk__modal-header' },
          React.createElement('div', { className: 'widget-relapse-risk__modal-title-wrap' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-eyebrow' }, 'Динамика веса'),
            React.createElement('h3', { className: 'widget-relapse-risk__modal-title' }, 'Прогресс за период')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'widget-relapse-risk__modal-close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '✕')
        ),

        React.createElement('div', { className: 'widget-relapse-risk__modal-content' },

          // Period preset switcher
          React.createElement('div', {
            style: { display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '12px' }
          },
            PRESETS.map(({ days, label }) =>
              React.createElement('button', {
                key: days,
                type: 'button',
                onClick: () => { setActivePeriod(days); onPeriodChange?.(days); },
                style: {
                  padding: '5px 14px',
                  borderRadius: '99px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: activePeriod === days ? 700 : 400,
                  background: activePeriod === days ? color : 'var(--heys-bg-secondary, #f1f5f9)',
                  color: activePeriod === days ? '#fff' : 'var(--heys-text-secondary,#64748b)',
                  transition: 'all 0.15s',
                  opacity: loadingPeriod ? 0.6 : 1,
                }
              }, label)
            )
          ),

          // Hero: rate + zone badge
          React.createElement('div', { className: 'widget-relapse-risk__modal-hero' },
            React.createElement('div', {
              className: 'widget-relapse-risk__modal-score-shell',
              style: { background: `${color}12`, borderColor: `${color}33`, opacity: loadingPeriod ? 0.5 : 1 }
            },
              React.createElement('div', { style: { fontSize: '1.5rem' } }, zoneMeta.emoji),
              React.createElement('div', {
                style: { fontSize: '2.5rem', fontWeight: 800, color, lineHeight: 1 }
              }, `${dirArrow} ${absPct.toFixed(1)}%`),
              React.createElement('div', {
                className: 'widget-relapse-risk__modal-score-level',
                style: { color, background: `${color}16`, borderColor: `${color}26` }
              }, `${zoneMeta.label} · /неделю`)
            )
          ),

          // Zone hint
          zoneHint && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', {
              style: { fontSize: '0.82rem', color: 'var(--heys-text-secondary,#94a3b8)', lineHeight: 1.5 }
            }, zoneHint)
          ),

          // Period summary
          React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'За период'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Сейчас'),
                React.createElement('span', { style: { fontWeight: 600 } }, `${currentWeight.toFixed(1)} кг`)
              ),
              firstWeight > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, `${dataPoints} дн. назад`),
                React.createElement('span', { style: { fontWeight: 600 } }, `${firstWeight.toFixed(1)} кг`)
              ),
              deltaAbs >= 0.05 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Итого изменение'),
                React.createElement('span', { style: { fontWeight: 600, color } }, `${deltaSign}${deltaAbs.toFixed(2)} кг`)
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Темп'),
                React.createElement('span', { style: { fontWeight: 600 } },
                  `${slopePerWeek >= 0 ? '+' : ''}${slopePerWeek.toFixed(2)} кг/нед`
                )
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Данных'),
                React.createElement('span', { style: { fontWeight: 600 } },
                  `${dataPoints}/${periodDays} дн. (${(dataCompleteness * 100).toFixed(0)}%)`
                )
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Качество тренда (R²)'),
                React.createElement('span', { style: { fontWeight: 600 } }, r2.toFixed(3))
              )
            )
          ),

          // Goal section
          toGoalKg !== null && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Цель'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Целевой вес'),
                React.createElement('span', { style: { fontWeight: 600 } }, `${goalWeight} кг`)
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Осталось'),
                React.createElement('span', { style: { fontWeight: 600 } }, `${(toGoalKg || 0).toFixed(1)} кг`)
              ),
              estimatedDaysToGoal && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Прогноз при текущем темпе'),
                React.createElement('span', { style: { fontWeight: 600 } }, `~${estimatedDaysToGoal} дней`)
              )
            )
          ),

          // Weight history table (last up to activePeriod entries)
          weightData.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'История взвешиваний'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              weightData.map((p, i) =>
                React.createElement('div', {
                  key: i,
                  style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--heys-text-secondary,#94a3b8)' }
                },
                  React.createElement('span', null, p.date),
                  React.createElement('span', { style: { fontWeight: 600 } }, `${p.weight.toFixed(1)} кг`)
                )
              )
            )
          ),

          // EWS warnings
          warnings.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, `Предупреждения EWS (${ewsCount})`),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              warnings.map((w, i) =>
                React.createElement('div', {
                  key: i,
                  style: { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.85rem', color: 'var(--heys-text-secondary,#94a3b8)' }
                },
                  React.createElement('span', null, getSeverityIcon(w.severity)),
                  React.createElement('span', null, w.message)
                )
              )
            )
          ),

          // Copy button
          React.createElement('div', { style: { display: 'flex', justifyContent: 'center', paddingTop: '16px', paddingBottom: '8px' } },
            React.createElement('button', {
              type: 'button',
              className: 'widget-relapse-risk__modal-copy-btn',
              onClick: copyLog
            }, '📋 Скопировать лог')
          )
        )
      )
    );
  }

  // === Day Score Details Modal (unified: Day Score + Status Score breakdown) ===
  function DayScoreDetailsModal({ payload, isOpen, onClose }) {
    if (!isOpen || !payload) return null;

    const data = payload.data || {};
    const score = Math.round(Number(data.score) || 0);
    const level = data.level || 'none';
    const factorScore = Math.round(Number(data.factorScore) || 0);
    const subjectiveScore = Math.round(Number(data.subjectiveScore) || 0);
    const momentumScore = Math.round(Number(data.momentumScore) || 0);
    const avgMealQuality = data.avgMealQuality != null ? Math.round(Number(data.avgMealQuality)) : null;
    const breakdown = data.breakdown || {};
    const statusResult = data.statusResult || {};

    // Status Score details (merged from StatusDetailsModal)
    const statusScore = Math.round(Number(statusResult.score) || 0);
    const factorScores = statusResult.factorScores || {};
    const factorDetails = statusResult.factorDetails || {};
    const categoryScores = statusResult.categoryScores || {};
    const statusBreakdown = Array.isArray(statusResult.breakdown) ? statusResult.breakdown : [];
    const topActions = Array.isArray(statusResult.topActions) ? statusResult.topActions : [];

    const getColor = (s) => {
      if (s >= 85) return '#10b981';
      if (s >= 70) return '#22c55e';
      if (s >= 50) return '#eab308';
      if (s >= 30) return '#f97316';
      return '#ef4444';
    };

    const getLevelLabel = (lvl) => {
      switch (lvl) {
        case 'excellent': return 'Отлично';
        case 'good': return 'Хорошо';
        case 'okay': return 'Нормально';
        case 'low': return 'Слабо';
        case 'critical': return 'Критично';
        default: return 'Нет данных';
      }
    };

    const color = getColor(score);

    const layerRows = [
      { label: 'Факторы (70%)', value: factorScore, color: getColor(factorScore) },
      { label: 'Субъективная (15%)', value: subjectiveScore, color: getColor(subjectiveScore) },
      { label: 'Momentum (15%)', value: momentumScore, color: getColor(momentumScore) }
    ];

    const copyDayScoreLog = async () => {
      try {
        const lines = [
          '=== HEYS Day Score Log (unified) ===',
          `Date: ${new Date().toISOString()}`,
          `Day Score: ${score}/100 (${getLevelLabel(level)})`,
          `Status Score: ${statusScore}/100`,
          '',
          '--- Layers ---',
          `Factors (70%): ${factorScore}`,
          `Subjective (15%): ${subjectiveScore}`,
          `Momentum (15%): ${momentumScore}`,
          '',
          '--- Category Scores ---',
          ...Object.entries(categoryScores).map(([k, v]) => `  ${v.icon || ''} ${v.label || k}: ${v.score}`),
          '',
          '--- Factor Scores ---',
          ...Object.entries(factorScores).map(([k, v]) => `  ${k}: ${v}`),
          '',
          '--- Factor Details ---',
          ...Object.entries(factorDetails).map(([k, v]) => `  ${k}: ${v.value}/${v.target} ${v.unit || ''} (${v.percent != null ? v.percent + '%' : v.label || ''})`),
          '',
          '--- Top Actions ---',
          ...topActions.map((a, i) => `  ${i + 1}. ${a.icon || ''} ${a.text} (${a.factor || ''})`),
          '',
          `avgMealQuality: ${avgMealQuality ?? 'N/A'}`,
          '',
          '--- Raw Payload ---',
          JSON.stringify(data, null, 2)
        ];
        await copyTextWithFallback(lines.join('\n'));
        HEYS.Toast?.success?.('Day Score лог скопирован');
      } catch (err) {
        console.error('[HEYS.dayScore.copy] ❌', err);
        HEYS.Toast?.error?.('Не удалось скопировать лог');
      }
    };

    const handleBackdropClick = (e) => {
      if (e.target === e.currentTarget) onClose?.();
    };

    return React.createElement('div', {
      className: 'widget-relapse-risk__modal-overlay',
      onClick: handleBackdropClick
    },
      React.createElement('div', {
        className: 'widget-relapse-risk__modal',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        React.createElement('div', { className: 'widget-relapse-risk__modal-header' },
          React.createElement('div', { className: 'widget-relapse-risk__modal-title-wrap' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-eyebrow' }, 'Оценка дня'),
            React.createElement('h3', { className: 'widget-relapse-risk__modal-title' }, 'Как сложился день')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'widget-relapse-risk__modal-close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '✕')
        ),
        // Content
        React.createElement('div', { className: 'widget-relapse-risk__modal-content' },
          // Hero — Day Score
          React.createElement('div', { className: 'widget-relapse-risk__modal-hero' },
            React.createElement('div', {
              className: 'widget-relapse-risk__modal-score-shell',
              style: { background: `${color}12`, borderColor: `${color}33` }
            },
              React.createElement('div', {
                style: { fontSize: '3.5rem', fontWeight: 800, color, lineHeight: 1 }
              }, score),
              React.createElement('div', {
                className: 'widget-relapse-risk__modal-score-level',
                style: { color, background: `${color}16`, borderColor: `${color}26` }
              }, `⭐ ${getLevelLabel(level)}`)
            )
          ),

          // Layers (Day Score composition)
          React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Слои оценки'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              layerRows.map((row, i) =>
                React.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  React.createElement('span', { style: { fontSize: '0.85rem', color: 'var(--heys-text-secondary, #94a3b8)' } }, row.label),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('div', {
                      style: { width: '80px', height: '6px', borderRadius: '3px', background: 'var(--heys-bg-secondary, #1e293b)' }
                    },
                      React.createElement('div', {
                        style: { width: `${Math.min(100, Math.abs(row.value))}%`, height: '100%', borderRadius: '3px', background: row.color, transition: 'width 0.3s ease' }
                      })
                    ),
                    React.createElement('span', { style: { fontSize: '0.85rem', fontWeight: 600, color: row.color, minWidth: '28px', textAlign: 'right' } }, row.value)
                  )
                )
              )
            )
          ),

          // Status Score categories (from merged Status modal)
          Object.keys(categoryScores).length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, `Категории (Status ${statusScore})`),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              Object.entries(categoryScores).map(([key, cat]) =>
                React.createElement('div', { key, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  React.createElement('span', { style: { fontSize: '0.85rem', color: 'var(--heys-text-secondary, #94a3b8)' } }, `${cat.icon || ''} ${cat.label || key}`),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('div', {
                      style: { width: '80px', height: '6px', borderRadius: '3px', background: 'var(--heys-bg-secondary, #1e293b)' }
                    },
                      React.createElement('div', {
                        style: { width: `${Math.min(100, cat.score || 0)}%`, height: '100%', borderRadius: '3px', background: getColor(cat.score || 0), transition: 'width 0.3s ease' }
                      })
                    ),
                    React.createElement('span', { style: { fontSize: '0.85rem', fontWeight: 600, color: getColor(cat.score || 0), minWidth: '28px', textAlign: 'right' } }, cat.score || 0)
                  )
                )
              )
            )
          ),

          // 9 factor breakdown (from merged Status modal)
          statusBreakdown.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Факторы'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              statusBreakdown.map((f, i) =>
                React.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  React.createElement('span', { style: { fontSize: '0.8rem', color: 'var(--heys-text-secondary, #94a3b8)' } },
                    `${f.icon || ''} ${f.label || f.factorId}`
                  ),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    f.percent != null
                      ? React.createElement('span', { style: { fontSize: '0.7rem', color: 'var(--heys-text-tertiary, #64748b)' } }, `${f.value}/${f.target}${f.unit ? ' ' + f.unit : ''}`)
                      : null,
                    React.createElement('span', { style: { fontSize: '0.8rem', fontWeight: 600, color: getColor(f.score || 0), minWidth: '24px', textAlign: 'right' } }, f.score || 0)
                  )
                )
              )
            )
          ),

          // Average meal quality
          avgMealQuality != null && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('span', { style: { fontSize: '0.85rem', color: 'var(--heys-text-secondary, #94a3b8)' } }, '🍽 Средн. качество приёмов'),
              React.createElement('span', { style: { fontSize: '0.85rem', fontWeight: 600, color: getColor(avgMealQuality) } }, `${avgMealQuality}/100`)
            )
          ),

          // Top actions (from merged Status modal)
          topActions.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Рекомендации'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              topActions.map((a, i) =>
                React.createElement('div', { key: i, style: { fontSize: '0.85rem', color: 'var(--heys-text-secondary, #94a3b8)' } },
                  `${a.icon || '→'} ${a.text}`)
              )
            )
          ),

          // Copy button
          React.createElement('div', { style: { display: 'flex', justifyContent: 'center', paddingTop: '16px', paddingBottom: '8px' } },
            React.createElement('button', {
              type: 'button',
              className: 'widget-relapse-risk__modal-copy-btn',
              onClick: copyDayScoreLog
            }, '📋 Скопировать лог')
          )
        )
      )
    );
  }

  function RelapseRiskDetailsModal({ payload, isOpen, onClose }) {
    if (!isOpen || !payload) return null;

    const [activeSnapshot, setActiveSnapshot] = useState(payload?.snapshot || {});
    const [selectedProfileKey, setSelectedProfileKey] = useState(() => getRelapseSelectedProfileKey(payload?.snapshot || {}));

    useEffect(() => {
      setActiveSnapshot(payload?.snapshot || {});
      setSelectedProfileKey(getRelapseSelectedProfileKey(payload?.snapshot || {}));
    }, [payload]);

    const snapshot = activeSnapshot || {};
    const result = snapshot?.raw || {};
    const score = Math.round(Number(snapshot?.score ?? result?.score) || 0);
    const level = String(snapshot?.level || result?.level || 'low');
    const confidence = Math.max(0, Math.min(100, Math.round(Number(snapshot?.confidence ?? result?.confidence) || 0)));

    // Risk Radar aggregation: get source + crash component
    const radarResult = React.useMemo(() => {
      if (!HEYS.RiskRadar?.calculate) return null;
      try {
        const profile = HEYS.Widgets?.data?._getProfile?.() || {};
        return HEYS.RiskRadar.calculate({ profile });
      } catch (e) { return null; }
    }, [payload]);
    const radarSource = radarResult?.source || snapshot?.source || 'none';
    const radarRelapseScore = Math.round(Number(snapshot?.relapseScore ?? snapshot?.rawScore ?? radarResult?.relapse?.score) || score);
    const radarCrashScore = Math.round(Number(snapshot?.crashScore ?? radarResult?.crash?.score) || 0);
    const radarScore = Math.round(Number(snapshot?.score ?? radarResult?.score) || score);
    const radarDrivers = (radarResult?.drivers || []).map(d => d.label || d.factor || String(d));
    const radarActions = (radarResult?.actions || []).map(a => a.text || a.label || String(a));
    const scoreModelLabel = snapshot?.scoreModel === 'risk_radar_blended' ? 'Общий радар' : 'Эмоциональный риск';

    const getSourceLabel = (src) => {
      switch (src) {
        case 'emotional': return 'Эмоциональный (Relapse)';
        case 'metabolic': return 'Метаболический (Crash)';
        case 'both': return 'Оба источника';
        default: return 'Не определён';
      }
    };

    const getRadarColor = (s) => {
      if (s >= 70) return '#ef4444';
      if (s >= 40) return '#f97316';
      if (s >= 20) return '#eab308';
      return '#10b981';
    };

    const windows = getSortedRelapseWindows(snapshot?.windows || result?.windows);
    const drivers = Array.isArray(snapshot?.primaryDrivers) ? snapshot.primaryDrivers : (Array.isArray(result?.primaryDrivers) ? result.primaryDrivers : []);
    const protectiveFactors = Array.isArray(snapshot?.protectiveFactors) ? snapshot.protectiveFactors : (Array.isArray(result?.protectiveFactors) ? result.protectiveFactors : []);
    const recommendations = Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : (Array.isArray(result?.recommendations) ? result.recommendations : []);
    const components = Object.entries(result?.debug?.components || {})
      .map(([key, value]) => ({
        key,
        value: Math.round(Number(value) || 0),
        ...getRelapseComponentMeta(key)
      }))
      .filter(item => item.key !== 'protectiveBuffer')
      .sort((a, b) => b.value - a.value);
    const protectiveBuffer = Math.round(Number(result?.debug?.components?.protectiveBuffer) || 0);
    const humanSummary = buildRelapseHumanSummary(payload);
    const restrictionDebug = result?.debug?.restrictionPressure || {};
    const historyQuality = result?.debug?.historyQuality || {};
    const color = getRelapseRiskColor(level);
    const [gradStart, gradEnd] = getRelapseGradientColors(level);
    const leadWindow = windows[0] || null;
    const leadDriver = drivers[0] || null;
    const topRecommendation = recommendations[0] || null;
    const devPanelVisible = shouldShowRelapseDevPanel();
    const profileOptions = getRelapseProfileOptions();
    const compareItems = Array.isArray(snapshot?.compare?.comparisons) ? snapshot.compare.comparisons : [];
    const compareBaselineProfileKey = snapshot?.compare?.baselineProfileKey || 'baseline';
    const profileGuideItems = [
      {
        key: 'baseline',
        title: 'Baseline',
        text: 'Опорная старая логика. Смотри её, если хочешь понять, насколько v1.1 вообще изменил трактовку дня.'
      },
      {
        key: 'v1_1',
        title: 'v1.1',
        text: 'Текущий рекомендуемый дефолт: мягче к контролируемому дефициту и честнее к recovery-факторам.'
      },
      {
        key: 'recovery_sensitive',
        title: 'Recovery',
        text: 'Сильнее реагирует на недосып и истощение. Полезно, если кажется, что усталость недооценена.'
      },
      {
        key: 'restriction_sensitive',
        title: 'Restriction',
        text: 'Сильнее реагирует на недоедание, gaps и aggressive cut. Полезно для проверки жёстких сценариев.'
      }
    ];

    const handleSelectProfile = useCallback((nextProfileKey) => {
      if (!nextProfileKey || nextProfileKey === selectedProfileKey) return;
      setSelectedProfileKey(nextProfileKey);
      setRelapseSelectedProfileKey(nextProfileKey);
      HEYS.RelapseRisk?.invalidateSnapshot?.();
      const nextSnapshot = resolveRelapseSnapshot(payload?.widget, nextProfileKey);
      setActiveSnapshot(nextSnapshot);
      HEYS.Widgets.data?.refresh?.();
      HEYS.dayUtils?.haptic?.('light');
    }, [payload?.widget, selectedProfileKey]);

    const copyRelapseLog = async () => {
      const startedAt = Date.now();
      try {
        const text = formatRelapseRiskTraceForClipboard({ ...payload, snapshot });
        await copyTextWithFallback(text);
        console.info('[HEYS.relapseRisk.copy] ✅ trace copied', {
          chars: text.length,
          score,
          level,
          windows: windows.length,
          drivers: drivers.length,
          tookMs: Date.now() - startedAt
        });
        HEYS.Toast?.success?.('Полный разбор риска скопирован');
      } catch (err) {
        console.error('[HEYS.relapseRisk.copy] ❌ copy failed', {
          message: err?.message || String(err)
        });
        HEYS.Toast?.error?.('Не удалось скопировать полный разбор риска');
      }
    };

    const handleBackdropClick = (e) => {
      if (e.target === e.currentTarget) onClose?.();
    };

    return React.createElement('div', {
      className: 'widget-relapse-risk__modal-overlay',
      onClick: handleBackdropClick
    },
      React.createElement('div', {
        className: 'widget-relapse-risk__modal',
        onClick: (e) => e.stopPropagation()
      },
        // Header
        React.createElement('div', { className: 'widget-relapse-risk__modal-header' },
          React.createElement('div', { className: 'widget-relapse-risk__modal-title-wrap' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-eyebrow' }, 'Риск-радар'),
            React.createElement('h3', { className: 'widget-relapse-risk__modal-title' }, 'Текущий риск')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'widget-relapse-risk__modal-close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '✕')
        ),
        React.createElement('div', { className: 'widget-relapse-risk__modal-content' },
          // 1. Hero: speedometer + level
          React.createElement('div', { className: 'widget-relapse-risk__modal-hero' },
            React.createElement('div', {
              className: 'widget-relapse-risk__modal-score-shell',
              style: { background: `linear-gradient(135deg, ${gradStart}18 0%, ${gradEnd}24 100%)`, borderColor: `${color}33` }
            },
              React.createElement('div', { className: 'widget-relapse-risk__modal-glow' }),
              React.createElement(RelapseRiskSpeedometer, {
                score: radarScore,
                level,
                size: 160,
                label: 'Риск-радар'
              }),
              React.createElement('div', {
                className: 'widget-relapse-risk__modal-score-level',
                style: { color, background: `${color}16`, borderColor: `${color}26` }
              }, getRelapseLevelLabel(level))
            )
          ),

          // 2. Short human summary (1-2 sentences)
          humanSummary.headline && React.createElement('div', {
            className: 'widget-relapse-risk__modal-note'
          }, humanSummary.headline),

          // 3. Two components: Relapse vs Crash
          React.createElement('section', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Из чего складывается'),
            React.createElement('div', { className: 'widget-relapse-risk__breakdown-list' },
              // Relapse (emotional)
              React.createElement('div', { className: 'widget-relapse-risk__breakdown-row' },
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-label' }, '😰 Эмоциональный'),
                React.createElement('div', { className: 'widget-relapse-risk__breakdown-track' },
                  React.createElement('div', {
                    style: { width: `${Math.min(100, radarRelapseScore)}%`, height: '100%', borderRadius: '4px', background: getRadarColor(radarRelapseScore), transition: 'width 0.4s ease' }
                  })
                ),
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-value', style: { color: getRadarColor(radarRelapseScore) } }, radarRelapseScore)
              ),
              // Crash (metabolic)
              React.createElement('div', { className: 'widget-relapse-risk__breakdown-row' },
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-label' }, '⚡ Метаболический'),
                React.createElement('div', { className: 'widget-relapse-risk__breakdown-track' },
                  React.createElement('div', {
                    style: { width: `${Math.min(100, radarCrashScore)}%`, height: '100%', borderRadius: '4px', background: getRadarColor(radarCrashScore), transition: 'width 0.4s ease' }
                  })
                ),
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-value', style: { color: getRadarColor(radarCrashScore) } }, radarCrashScore)
              )
            ),
            React.createElement('div', { className: 'widget-relapse-risk__breakdown-formula' }, `Общий радар = ${radarScore}; эмоциональный риск = ${radarRelapseScore}; метаболический риск = ${radarCrashScore}; источник = ${getSourceLabel(radarSource).toLowerCase()}; модель = ${scoreModelLabel.toLowerCase()}`)
          ),

          // 4. What's driving risk + protective factors (compact chips)
          (drivers.length > 0 || protectiveFactors.length > 0) && React.createElement('section', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Что сейчас влияет'),
            React.createElement('div', { className: 'widget-relapse-risk__impact-chips' },
              drivers.slice(0, 3).map((driver) => React.createElement('div', {
                key: driver.id || driver.label,
                className: 'widget-relapse-risk__impact-chip widget-relapse-risk__impact-chip--up',
                style: {
                  '--chip-accent': getRadarColor(Math.round(Number(driver.impact) || 0) > 10 ? 60 : 30),
                  '--chip-bg': `${getRadarColor(Math.round(Number(driver.impact) || 0) > 10 ? 60 : 30)}12`,
                  '--chip-border': `${getRadarColor(Math.round(Number(driver.impact) || 0) > 10 ? 60 : 30)}24`
                }
              },
                React.createElement('span', { className: 'widget-relapse-risk__impact-chip-icon' }, '▲'),
                React.createElement('span', null, driver.label || driver.id)
              )),
              protectiveFactors.slice(0, 2).map((factor) => React.createElement('div', {
                key: factor.id || factor.label,
                className: 'widget-relapse-risk__impact-chip widget-relapse-risk__impact-chip--down',
                style: {
                  '--chip-accent': '#10b981',
                  '--chip-bg': '#10b98112',
                  '--chip-border': '#10b98124'
                }
              },
                React.createElement('span', { className: 'widget-relapse-risk__impact-chip-icon' }, '▼'),
                React.createElement('span', null, factor.label || factor.id)
              ))
            )
          ),

          // 5. Risk windows (compact bars)
          windows.length > 0 && React.createElement('section', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Когда выше'),
            React.createElement('div', { className: 'widget-relapse-risk__windows-list' },
              windows.map((w) => React.createElement('div', {
                key: w.key,
                className: 'widget-relapse-risk__window-row'
              },
                React.createElement('span', { className: 'widget-relapse-risk__window-row-label' }, w.label),
                React.createElement('div', { className: 'widget-relapse-risk__window-row-track' },
                  React.createElement('div', {
                    style: { width: `${Math.min(100, w.value)}%`, height: '100%', borderRadius: '3px', background: `linear-gradient(90deg, ${gradStart}, ${gradEnd})`, transition: 'width 0.3s ease' }
                  })
                ),
                React.createElement('span', { className: 'widget-relapse-risk__window-row-value', style: { color } }, `${w.value}%`)
              ))
            )
          ),

          // 6. What to do (1-2 recommendations)
          recommendations.length > 0 && React.createElement('section', { className: 'widget-relapse-risk__modal-section' },
            React.createElement('div', { className: 'widget-relapse-risk__modal-section-title' }, 'Что делать'),
            React.createElement('div', { className: 'widget-relapse-risk__action-list' },
              recommendations.slice(0, 2).map((rec) => React.createElement('div', {
                key: rec.id || rec.text,
                className: 'widget-relapse-risk__action-card'
              },
                React.createElement('span', { className: 'widget-relapse-risk__action-icon' }, '→'),
                React.createElement('span', { className: 'widget-relapse-risk__action-text' }, rec.text)
              ))
            )
          ),

          // 7. Dev panel (only for power users)
          devPanelVisible && profileOptions.length > 1 && React.createElement('section', { className: 'widget-relapse-risk__modal-section widget-relapse-risk__dev-panel' },
            React.createElement('details', { className: 'widget-relapse-risk__dev-disclosure' },
              React.createElement('summary', { className: 'widget-relapse-risk__dev-disclosure-summary' }, 'A/B профили · internal'),
              React.createElement('div', { className: 'widget-relapse-risk__dev-disclosure-body' },
                React.createElement('div', { className: 'widget-relapse-risk__dev-copy' }, 'Переключай веса модели и смотри, как меняется score.'),
                React.createElement('div', { className: 'widget-relapse-risk__dev-toggle' },
                  profileOptions.map((profileOption) => React.createElement('button', {
                    key: profileOption.key,
                    type: 'button',
                    className: `widget-relapse-risk__dev-toggle-btn ${selectedProfileKey === profileOption.key ? 'is-active' : ''}`,
                    onClick: () => handleSelectProfile(profileOption.key)
                  },
                    React.createElement('span', { className: 'widget-relapse-risk__dev-toggle-label' }, profileOption.label),
                    React.createElement('span', { className: 'widget-relapse-risk__dev-toggle-key' }, profileOption.key)
                  ))
                ),
                compareItems.length > 0 && React.createElement('div', { className: 'widget-relapse-risk__dev-compare-grid' },
                  compareItems.map((item) => React.createElement('div', {
                    key: item.profileKey,
                    className: `widget-relapse-risk__dev-compare-card widget-relapse-risk__dev-compare-card--${item.level || 'low'} ${selectedProfileKey === item.profileKey ? 'is-active' : ''}`
                  },
                    React.createElement('div', { className: 'widget-relapse-risk__dev-compare-top' },
                      React.createElement('span', { className: 'widget-relapse-risk__dev-compare-label' }, item.label || item.profileKey),
                      React.createElement('span', { className: 'widget-relapse-risk__dev-compare-score' }, `${Math.round(Number(item.score) || 0)}%`)
                    ),
                    React.createElement('div', { className: 'widget-relapse-risk__dev-compare-meta' },
                      React.createElement('span', { className: 'widget-relapse-risk__dev-compare-pill' }, getRelapseLevelLabel(item.level || 'low')),
                      React.createElement('span', { className: 'widget-relapse-risk__dev-compare-delta' },
                        item.profileKey === compareBaselineProfileKey
                          ? 'baseline'
                          : `${Number(item.deltaVsBaseline) > 0 ? '+' : ''}${Math.round(Number(item.deltaVsBaseline) || 0)} vs baseline`
                      )
                    )
                  ))
                )
              )
            )
          )
        ),
        React.createElement('section', { className: 'widget-relapse-risk__modal-tech-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'widget-relapse-risk__modal-copy-btn',
            onClick: copyRelapseLog,
            title: 'Скопировать полный разбор с деталями'
          }, '📋 Скопировать полный разбор')
        )
      )
    );
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
        const allowedSizes = Array.isArray(widgetType?.availableSizes) ? widgetType.availableSizes : [];
        const normalizedSize = allowedSizes.includes(widget.size)
          ? widget.size
          : (widgetType?.defaultSize || allowedSizes[0] || widget.size || '2x2');

        const normalizedSettings = { ...widget.settings };
        if (widgetType?.type === 'heatmap' && normalizedSettings.period === 'month') {
          normalizedSettings.period = 'week';
        }

        setSettings(normalizedSettings);
        setSelectedSize(normalizedSize);
      }
    }, [widget, widgetType]);

    useEffect(() => {
      if (!isOpen) return undefined;

      const targets = [
        document.body,
        document.documentElement,
        document.querySelector('.wrap'),
        document.querySelector('.tab-content-swipeable'),
        document.querySelector('.widgets-tab')
      ].filter(Boolean);

      const prevStyles = targets.map((el) => ({
        el,
        overflow: el.style.overflow,
        overscrollBehavior: el.style.overscrollBehavior,
        touchAction: el.style.touchAction
      }));

      prevStyles.forEach(({ el }) => {
        el.style.overflow = 'hidden';
        el.style.overscrollBehavior = 'none';
      });

      console.info('[HEYS.widgets] settings modal scroll-lock enabled');

      return () => {
        prevStyles.forEach(({ el, overflow, overscrollBehavior, touchAction }) => {
          el.style.overflow = overflow;
          el.style.overscrollBehavior = overscrollBehavior;
          el.style.touchAction = touchAction;
        });
        console.info('[HEYS.widgets] settings modal scroll-lock released');
      };
    }, [isOpen]);

    const previewWidget = useMemo(() => ({ ...widget, settings, size: selectedSize }), [widget, settings, selectedSize]);
    const previewDims = useMemo(() => getWidgetDims(previewWidget), [previewWidget]);
    const previewEffectiveScales = useMemo(
      () => clampElementScalesForSize(settings?.elementScales, previewDims),
      [settings?.elementScales, previewDims]
    );
    const previewScaleMetrics = useMemo(() => getElementScaleMetrics(previewEffectiveScales), [previewEffectiveScales]);
    const previewHasScales = previewScaleMetrics.hasScales;
    const previewScaleStyle = useMemo(() => buildElementScaleStyle(previewEffectiveScales, {
      base: { cursor: 'default' },
      metrics: previewScaleMetrics
    }), [previewEffectiveScales, previewScaleMetrics]);

    if (!isOpen || !widget || !widgetType) return null;

    const handleChange = (key, value) => {
      setSettings(prev => ({ ...prev, [key]: value }));
    };

    // Element scale handlers
    const scalableElements = widgetType.scalableElements || [];
    const elementScales = settings.elementScales || {};

    const handleScaleChange = (key, value) => {
      setSettings(prev => {
        const newScales = { ...(prev.elementScales || {}), [key]: value };
        // Remove entries that are exactly 1 (default) to keep storage clean
        if (value === 1) delete newScales[key];
        return { ...prev, elementScales: Object.keys(newScales).length ? newScales : undefined };
      });
    };

    const handleResetScales = () => {
      setSettings(prev => {
        const next = { ...prev };
        delete next.elementScales;
        return next;
      });
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

        // Widget preview — pinned above scrollable content
        React.createElement('div', { className: 'widgets-settings__preview-wrap' },
          (() => {
            // Measure actual grid cell from DOM for 1:1 fidelity
            const gridEl = document.querySelector('.widgets-grid');
            const gridStyle = gridEl ? getComputedStyle(gridEl) : null;
            const GAP = gridStyle ? parseFloat(gridStyle.gap) || 6 : 6;
            const colWidths = gridStyle ? gridStyle.gridTemplateColumns.split(/\s+/) : [];
            const rowHeights = gridStyle ? gridStyle.gridTemplateRows.split(/\s+/) : [];
            const CELL_W = colWidths.length ? parseFloat(colWidths[0]) || 90 : 90;
            const CELL_H = rowHeights.length ? parseFloat(rowHeights[0]) || 94 : 94;
            const si = registry.getSize(selectedSize) || { cols: 2, rows: 2 };
            const realW = si.cols * CELL_W + (si.cols - 1) * GAP;
            const realH = si.rows * CELL_H + (si.rows - 1) * GAP;
            const previewBleed = previewScaleMetrics.bleed;
            const stageW = realW + previewBleed * 2;
            const stageH = realH + previewBleed * 2;
            const MAX_W = 340;
            const MAX_H = 180;
            const sc = Math.min(1, MAX_W / stageW, MAX_H / stageH);
            return React.createElement('div', {
              className: 'widgets-settings__preview-stage',
              style: { width: stageW * sc + 'px', height: stageH * sc + 'px' }
            },
              React.createElement('div', {
                className: `widget widget--${previewWidget.size || '2x2'} widget--${previewWidget.type} ${previewHasScales ? 'widget--has-scales' : ''}`,
                style: { ...previewScaleStyle, transform: sc < 1 ? `scale(${sc})` : undefined, transformOrigin: 'top left', width: realW + 'px', height: realH + 'px', position: 'absolute', top: previewBleed + 'px', left: previewBleed + 'px' }
              },
                React.createElement('div', { className: 'widget__content' },
                  React.createElement(WidgetContent, { widget: previewWidget, widgetType })
                )
              )
            );
          })()
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
          Object.entries((() => {
            const sizeSpecificSettings = widgetType.settingsBySize?.[selectedSize];
            return sizeSpecificSettings !== undefined
              ? sizeSpecificSettings
              : (widgetType.settings || {});
          })()).map(([key, def]) =>
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
                        React.createElement('option', { key: opt.value, value: opt.value, disabled: !!opt.disabled }, opt.label)
                      )
                    ) :
                    null
            )
          ),

          // === Element Scale Sliders ===
          scalableElements.length > 0 && React.createElement('div', {
            className: 'widgets-settings__scale-section'
          },
            React.createElement('div', { className: 'widgets-settings__scale-header' },
              React.createElement('label', null, 'Масштаб элементов'),
              Object.keys(elementScales).length > 0 && React.createElement('button', {
                className: 'widgets-settings__scale-reset',
                onClick: handleResetScales,
                title: 'Сбросить все масштабы'
              }, 'Сброс')
            ),
            scalableElements.map(el =>
              React.createElement('div', {
                key: el.key,
                className: 'widgets-settings__scale-row'
              },
                React.createElement('span', {
                  className: 'widgets-settings__scale-label'
                }, el.label),
                React.createElement('input', {
                  type: 'range',
                  className: 'widgets-settings__scale-slider',
                  min: 0.5,
                  max: 2,
                  step: 0.05,
                  value: elementScales[el.key] ?? 1,
                  onChange: e => handleScaleChange(el.key, parseFloat(e.target.value))
                }),
                React.createElement('span', {
                  className: 'widgets-settings__scale-value'
                }, `${Math.round((elementScales[el.key] ?? 1) * 100)}%`)
              )
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

  function ResetLayoutConfirmModal({ isOpen, widgetCount = 0, onClose, onConfirm }) {
    useEffect(() => {
      if (!isOpen) return undefined;

      const targets = [
        document.body,
        document.documentElement,
        document.querySelector('.wrap'),
        document.querySelector('.tab-content-swipeable'),
        document.querySelector('.widgets-tab')
      ].filter(Boolean);

      const prevStyles = targets.map((el) => ({
        el,
        overflow: el.style.overflow,
        overscrollBehavior: el.style.overscrollBehavior
      }));

      prevStyles.forEach(({ el }) => {
        el.style.overflow = 'hidden';
        el.style.overscrollBehavior = 'none';
      });

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose?.();
        }
      };

      document.addEventListener('keydown', onKeyDown);

      return () => {
        document.removeEventListener('keydown', onKeyDown);
        prevStyles.forEach(({ el, overflow, overscrollBehavior }) => {
          el.style.overflow = overflow;
          el.style.overscrollBehavior = overscrollBehavior;
        });
      };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const modal = React.createElement('div', {
      className: 'confirm-modal-backdrop widgets-reset-confirm-backdrop',
      onClick: (event) => {
        if (event.target === event.currentTarget) onClose?.();
      }
    },
      React.createElement('div', {
        className: 'confirm-modal widgets-reset-confirm',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'widgets-reset-confirm-title',
        'aria-describedby': 'widgets-reset-confirm-text',
        onClick: (event) => event.stopPropagation()
      },
        React.createElement('div', { className: 'widgets-reset-confirm__hero' },
          React.createElement('div', { className: 'widgets-reset-confirm__icon', 'aria-hidden': 'true' }, '↺'),
          React.createElement('div', { className: 'widgets-reset-confirm__hero-copy' },
            React.createElement('div', { className: 'widgets-reset-confirm__eyebrow' }, 'Раскладка виджетов'),
            React.createElement('div', {
              id: 'widgets-reset-confirm-title',
              className: 'widgets-reset-confirm__title'
            }, 'Сбросить к дефолту?')
          )
        ),
        React.createElement('div', { className: 'widgets-reset-confirm__body' },
          React.createElement('div', {
            id: 'widgets-reset-confirm-text',
            className: 'widgets-reset-confirm__text'
          }, 'Вернём фирменную стартовую раскладку HEYS. Если передумаешь — текущее состояние можно будет вернуть кнопкой ↩.'),
          React.createElement('div', { className: 'widgets-reset-confirm__meta' },
            React.createElement('div', { className: 'widgets-reset-confirm__pill' },
              React.createElement('div', { className: 'widgets-reset-confirm__pill-label' }, 'Виджетов'),
              React.createElement('div', { className: 'widgets-reset-confirm__pill-value' }, String(widgetCount || 0))
            ),
            React.createElement('div', { className: 'widgets-reset-confirm__pill' },
              React.createElement('div', { className: 'widgets-reset-confirm__pill-label' }, 'Безопасно'),
              React.createElement('div', { className: 'widgets-reset-confirm__pill-value' }, '↩ Можно откатить')
            )
          )
        ),
        React.createElement('div', { className: 'confirm-modal-buttons confirm-modal-buttons--custom widgets-reset-confirm__actions' },
          React.createElement('div', { className: 'confirm-modal-actions-row' },
            React.createElement('button', {
              type: 'button',
              className: 'confirm-modal-btn cancel confirm-modal-btn--custom confirm-modal-btn--fill confirm-modal-btn--neutral',
              onClick: onClose
            }, 'Оставить как есть'),
            React.createElement('button', {
              type: 'button',
              className: 'confirm-modal-btn confirm confirm-modal-btn--custom confirm-modal-btn--fill confirm-modal-btn--primary',
              onClick: onConfirm
            }, 'Сбросить')
          )
        )
      )
    );

    return ReactDOM?.createPortal ? ReactDOM.createPortal(modal, document.body) : modal;
  }

  // === Sync Loading Skeleton for WidgetsTab ===
  function WidgetsSyncSkeleton() {
    return React.createElement('div', {
      className: 'widgets-sync-skeleton',
      style: { padding: '0 8px', marginTop: 8 }
    },
      React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          gridAutoRows: 80
        }
      },
        // Row 1: two 2×2 cards (calories + insulin wave)
        React.createElement('div', {
          className: 'skeleton-card',
          style: { gridColumn: 'span 2', gridRow: 'span 2', borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { gridColumn: 'span 2', gridRow: 'span 2', borderRadius: 16 }
        }),
        // Row 3: macros 2×1 + sleep 1×1 + empty 1×1
        React.createElement('div', {
          className: 'skeleton-card',
          style: { gridColumn: 'span 2', borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        // Row 4: cascade 2×1 + streak 1×1 + score 1×1
        React.createElement('div', {
          className: 'skeleton-card',
          style: { gridColumn: 'span 2', borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        // Row 5: four 1×1 cards
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        }),
        React.createElement('div', {
          className: 'skeleton-card',
          style: { borderRadius: 16 }
        })
      )
    );
  }

  // === Main WidgetsTab Component ===
  function WidgetsTab({ selectedDate, clientId, cloudUser, setTab, setSelectedDate }) {
    const canUseTasksAsHome = !cloudUser && !!clientId;
    const HOME_TAB_OPTIONS = useMemo(() => {
      const options = [
        { key: 'widgets', label: 'Виджеты', icon: '🧩' },
        { key: 'stats', label: 'Отчёты', icon: '📊' },
        { key: 'diary', label: 'Дневник', icon: '🍽️' },
        { key: 'insights', label: 'Советы', icon: '💡' },
        { key: 'month', label: 'Месяц', icon: '🗓️' }
      ];
      if (canUseTasksAsHome) {
        options.push({ key: 'tasks', label: 'Задачи', icon: '☑️' });
      }
      return options;
    }, [canUseTasksAsHome]);
    const VALID_HOME_TABS = useMemo(() => HOME_TAB_OPTIONS.map((option) => option.key), [HOME_TAB_OPTIONS]);
    const getCurrentDefaultTab = useCallback(() => {
      const defaultTabFromApp = window.HEYS?.App?.getDefaultTab?.();
      if (VALID_HOME_TABS.includes(defaultTabFromApp)) return defaultTabFromApp;

      const profile = HEYS.utils?.lsGet?.('heys_profile', {}) || {};
      return VALID_HOME_TABS.includes(profile?.defaultTab) ? profile.defaultTab : 'diary';
    }, [VALID_HOME_TABS]);
    const [widgets, setWidgets] = useState([]);
    const [isLayoutHydrated, setIsLayoutHydrated] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [defaultHomeTab, setDefaultHomeTab] = useState(() => getCurrentDefaultTab());
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [settingsWidget, setSettingsWidget] = useState(null);
    const [relapseDetails, setRelapseDetails] = useState(null);
    const [dayScoreDetails, setDayScoreDetails] = useState(null);
    const [crashRiskDetails, setCrashRiskDetails] = useState(null);
    const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });
    const [showGridOverlay, setShowGridOverlay] = useState(false); // Grid overlay toggle
    const [showHomeTabPicker, setShowHomeTabPicker] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const containerRef = useRef(null);
    const gridRef = useRef(null);
    const [isSyncLoading, setIsSyncLoading] = useState(false);
    const syncLoadingTimerRef = useRef(null);
    const prevClientIdRef = useRef(clientId);

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
        const isRealSwitch = prevClientIdRef.current && prevClientIdRef.current !== clientId;
        prevClientIdRef.current = clientId;

        console.info(`[WidgetsTab] clientId changed: "${clientId.slice(0, 8)}...", reinitializing widgets`, { isRealSwitch });
        // Сброс глобального кэша каскада, чтобы useLiveCurrentCascade не показывал данные предыдущего клиента
        if (window.HEYS) {
          window.HEYS._lastCrs = null;
        }
        // Передаём clientId явно, т.к. HEYS.currentClientId может ещё не обновиться (race condition)
        HEYS.Widgets.state?.reinit?.(clientId);
        // НЕ вызываем setWidgets здесь — reinit асинхронный: getWidgets() вернёт []
        // и вызовет вспышку empty-state. Подписка на layout:loaded обновит widgets когда данные готовы.
        updateHistoryInfo();

        // Sync gate: show skeleton only on real client switch (not first mount)
        // On first mount, data from previous sync is already in localStorage.
        if (isRealSwitch) {
          const cloud = window.HEYS?.cloud;
          const needsSync = cloud?.shouldSyncClient?.(clientId, 4000) !== false;
          if (needsSync) {
            setIsSyncLoading(true);
            // Fallback: don't block forever — reveal widgets after 6s even if sync is slow
            if (syncLoadingTimerRef.current) clearTimeout(syncLoadingTimerRef.current);
            syncLoadingTimerRef.current = setTimeout(() => {
              console.info('[WidgetsTab] sync loading fallback timeout, revealing widgets');
              HEYS.Widgets.data?.refresh?.();
              setIsSyncLoading(false);
            }, 6000);
          } else {
            // No sync needed — data is fresh, immediately refresh widget cache
            HEYS.Widgets.data?.refresh?.();
            setIsSyncLoading(false);
          }
        }
      }
      return () => {
        if (syncLoadingTimerRef.current) {
          clearTimeout(syncLoadingTimerRef.current);
          syncLoadingTimerRef.current = null;
        }
      };
    }, [clientId]);

    // 🔗 Sync event bridge: DOM events from sync layer → widget data refresh
    // Sync layer dispatches heysSyncCompleted and heys:day-updated as DOM CustomEvents,
    // but widgets listen to HEYS.events / HEYS.Widgets internal event bus.
    // This effect bridges the gap so widgets update after client switch / cloud sync.
    // Also clears isSyncLoading to reveal widgets with all animations at once.
    useEffect(() => {
      const onSyncCompleted = (event) => {
        const evClientId = event?.detail?.clientId;
        if (!evClientId || !clientId) return;
        if (evClientId !== clientId && !clientId.startsWith(evClientId)) return;
        const phase = event?.detail?.phase || (event?.detail?.phaseA ? 'A' : 'unknown');
        console.info(`[WidgetsTab] heysSyncCompleted phase=${phase}, refreshing widget data`);
        HEYS.Widgets.data?.refresh?.();
        // Reveal widgets after data refresh — Phase A is enough for today's widgets
        if (syncLoadingTimerRef.current) {
          clearTimeout(syncLoadingTimerRef.current);
          syncLoadingTimerRef.current = null;
        }
        setIsSyncLoading(false);
      };

      const onDayUpdated = (event) => {
        const evClientId = event?.detail?.clientId;
        // heys:day-updated may not always carry clientId — refresh unconditionally if missing
        if (evClientId && clientId && evClientId !== clientId && !clientId.startsWith(evClientId)) return;
        HEYS.Widgets.data?.refresh?.();
      };

      window.addEventListener('heysSyncCompleted', onSyncCompleted);
      window.addEventListener('heys:day-updated', onDayUpdated);

      return () => {
        window.removeEventListener('heysSyncCompleted', onSyncCompleted);
        window.removeEventListener('heys:day-updated', onDayUpdated);
      };
    }, [clientId]);

    // === Pull-to-refresh ===
    const {
      pullProgress,
      isRefreshing,
      refreshStatus,
      pullThreshold
    } = HEYS.dayPullRefresh?.usePullToRefresh?.({
      React,
      date: selectedDate,
      lsGet: HEYS.utils?.lsGet,
      lsSet: HEYS.utils?.lsSet,
      HEYS: window.HEYS
    }) || { pullProgress: 0, isRefreshing: false, refreshStatus: 'idle', pullThreshold: 80 };

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
      setDefaultHomeTab(getCurrentDefaultTab());
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

      const handleDefaultTabChanged = (event) => {
        const nextDefaultTab = event?.detail?.defaultTab;
        if (VALID_HOME_TABS.includes(nextDefaultTab)) {
          setDefaultHomeTab(nextDefaultTab);
          return;
        }
        setDefaultHomeTab(getCurrentDefaultTab());
      };

      window.addEventListener('heys:default-tab-changed', handleDefaultTabChanged);

      return () => {
        clearTimeout(tourTimer);
        unsubLoaded?.();
        unsubLayout?.();
        unsubEditEnter?.();
        unsubEditExit?.();
        unsubHistory?.();
        window.removeEventListener('heys:default-tab-changed', handleDefaultTabChanged);
      };
    }, [getCurrentDefaultTab, VALID_HOME_TABS]);

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

    const openRelapseDetails = useCallback((widget) => {
      if (!widget || widget.type !== 'relapseRisk') return;
      try {
        const snapshot = resolveRelapseSnapshot(widget, getRelapseSelectedProfileKey());

        setRelapseDetails({ widget, snapshot, openedAt: Date.now() });
        HEYS.dayUtils?.haptic?.('light');
      } catch (e) {
        trackWidgetIssue('widgets_relapse_modal_open_failed', {
          widgetId: widget?.id,
          widgetType: widget?.type,
          message: e?.message
        });
      }
    }, []);

    const openDayScoreDetails = useCallback((widget) => {
      if (!widget) return;
      try {
        // For 'status' widget, get dayScore data instead (merged)
        const effectiveWidget = widget.type === 'status'
          ? { ...widget, type: 'dayScore' }
          : widget;
        const data = HEYS.Widgets.data?.getDayScoreData?.() || {};
        setDayScoreDetails({ widget: effectiveWidget, data, openedAt: Date.now() });
        HEYS.dayUtils?.haptic?.('light');
      } catch (e) {
        trackWidgetIssue('widgets_dayscore_modal_open_failed', {
          widgetId: widget?.id, message: e?.message
        });
      }
    }, []);

    const openCrashRiskDetails = useCallback((widget) => {
      if (!widget || widget.type !== 'crashRisk') return;
      try {
        const data = HEYS.Widgets.data?.getDataForWidget?.(widget) || {};
        setCrashRiskDetails({ widget, data, openedAt: Date.now() });
        HEYS.dayUtils?.haptic?.('light');
      } catch (e) {
        trackWidgetIssue('widgets_crashrisk_modal_open_failed', {
          widgetId: widget?.id, message: e?.message
        });
      }
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

    useEffect(() => {
      const unsubWidgetClick = HEYS.Widgets.on?.('widget:click', ({ widget }) => {
        if (isEditMode || !widget) return;
        if (widget.type === 'relapseRisk') {
          openRelapseDetails(widget);
        } else if (widget.type === 'dayScore' || widget.type === 'status') {
          openDayScoreDetails(widget);
        } else if (widget.type === 'crashRisk') {
          openCrashRiskDetails(widget);
        }
      });

      return () => {
        unsubWidgetClick?.();
      };
    }, [isEditMode, openRelapseDetails, openDayScoreDetails, openCrashRiskDetails]);

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

    // 💧 Добавить воду БЕЗ переключения вкладки — общий feedback идёт через HEYS.Day.addWater / heysWaterAdded
    const handleAddWater = useCallback((ml = 200, sourceEl = null) => {
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
            window.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: scopedKey, type: 'water' } }));
          }

          // Универсальное событие обновления дня (для дневника/отчётов/виджетов)
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date: dateKey, dayData, source: 'widgets_fab_water' }
          }));

          // Dispatch event для синхронизации других компонентов
          window.dispatchEvent(new CustomEvent('heysWaterAdded', {
            detail: {
              ml,
              total: dayData.waterMl,
              source: 'widgets-fab',
              sourceEl,
              showScreenFill: true,
              pulseWaterWidget: true,
              showSourceBadge: true,
              showSourceDrop: true
            }
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

      // Вызываем HEYS.Day.addWater напрямую (skipScroll=true, чтобы не скроллить)
      const addWaterFn = window.HEYS?.Day?.addWater;
      if (typeof addWaterFn === 'function') {
        try {
          addWaterFn(ml, {
            skipScroll: true,
            source: 'widgets-fab',
            sourceEl,
            showScreenFill: true,
            pulseWaterWidget: true
          });
          // Виджет воды обновится через DOM событие heysWaterAdded (оптимистичное обновление)
        } catch (e) {
          // Fallback: HEYS.Day.addWater есть, но вызов мог упасть из-за неготового DayTab
          persistWaterLocally();
        }
      } else {
        // Fallback: если Day еще не смонтирован, сохраняем напрямую в localStorage
        persistWaterLocally();
      }
    }, [selectedDate]);

    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
      HEYS.Widgets.undo?.();
    }, []);

    const handleRedo = useCallback(() => {
      HEYS.Widgets.redo?.();
    }, []);

    const handleResetLayout = useCallback(() => {
      setShowResetConfirm(true);
      HEYS.dayUtils?.haptic?.('light');
    }, []);

    const handleCloseResetConfirm = useCallback(() => {
      setShowResetConfirm(false);
      HEYS.dayUtils?.haptic?.('light');
    }, []);

    const handleConfirmResetLayout = useCallback(() => {
      HEYS.Widgets.resetLayout?.();
      setShowResetConfirm(false);
      setShowGridOverlay(false);
      setShowHomeTabPicker(false);
      HEYS.dayUtils?.haptic?.('medium');
    }, []);

    const handleCopyLayoutLog = useCallback(async () => {
      try {
        const text = formatWidgetsLayoutForClipboard(widgets, { defaultHomeTab });
        await copyTextWithFallback(text);
        console.info('[HEYS.widgets] layout log copied', {
          widgets: Array.isArray(widgets) ? widgets.length : 0,
          defaultHomeTab
        });
        HEYS.Toast?.success?.('Лог раскладки виджетов скопирован');
        HEYS.dayUtils?.haptic?.('light');
      } catch (error) {
        console.error('[HEYS.widgets] failed to copy layout log', {
          message: error?.message || String(error)
        });
        HEYS.Toast?.error?.('Не удалось скопировать раскладку виджетов');
      }
    }, [defaultHomeTab, widgets]);

    const handleSetDefaultHomeTab = useCallback((nextTab) => {
      if (!VALID_HOME_TABS.includes(nextTab)) return;

      try {
        window.HEYS?.App?.setDefaultTab?.(nextTab);
        setDefaultHomeTab(nextTab);
        HEYS.dayUtils?.haptic?.('light');
      } catch (e) {
        console.warn('[HEYS.widgets] failed to update default home tab', e);
      }
    }, [VALID_HOME_TABS]);

    // Сбрасываем overlay при выходе из edit mode
    useEffect(() => {
      if (!isEditMode) {
        setShowGridOverlay(false);
        setShowHomeTabPicker(false);
        setShowResetConfirm(false);
      }
    }, [isEditMode]);

    // Количество строк для grid overlay (максимальная занятая строка + запас)
    const overlayRows = useMemo(() => {
      if (!widgets.length) return 8;
      const maxRow = widgets.reduce((max, w) => {
        return Math.max(max, (w.position?.row || 1) + (w.rows || 1) - 1);
      }, 4);
      return Math.max(8, maxRow + 2);
    }, [widgets]);

    // === Pull indicator helper ===
    const pullIndicatorEl = (pullProgress > 0 || isRefreshing || refreshStatus !== 'idle')
      ? React.createElement('div', {
        className: 'pull-indicator'
          + (isRefreshing ? ' refreshing' : '')
          + (refreshStatus === 'ready' ? ' ready' : '')
          + (refreshStatus === 'success' ? ' success' : '')
          + ' status-' + refreshStatus,
        style: {
          height: isRefreshing ? 56 : Math.max(pullProgress, 0),
          opacity: isRefreshing ? 1 : Math.min(pullProgress / 35, 1)
        }
      },
        React.createElement('div', { className: 'pull-spinner' },
          refreshStatus === 'success'
            ? React.createElement('svg', {
              className: 'pull-spinner-ring ready',
              viewBox: '0 0 28 28',
              style: { stroke: 'var(--success)' }
            },
              React.createElement('path', {
                d: 'M7 14l5 5 9-9',
                strokeWidth: 3,
                fill: 'none',
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
              })
            )
            : refreshStatus === 'error'
              ? React.createElement('svg', {
                className: 'pull-spinner-ring',
                viewBox: '0 0 28 28',
                style: { stroke: 'var(--err, #ef4444)' }
              },
                React.createElement('path', {
                  d: 'M8 8l12 12M20 8l-12 12',
                  strokeWidth: 3,
                  fill: 'none',
                  strokeLinecap: 'round'
                })
              )
              : refreshStatus === 'timeout'
                ? React.createElement('svg', {
                  className: 'pull-spinner-ring',
                  viewBox: '0 0 28 28',
                  style: { stroke: 'var(--warn, #f59e0b)' }
                },
                  React.createElement('path', {
                    d: 'M14 7v8m0 4h.01',
                    strokeWidth: 3,
                    fill: 'none',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round'
                  }),
                  React.createElement('circle', {
                    cx: 14, cy: 14, r: 10,
                    strokeWidth: 2,
                    fill: 'none'
                  })
                )
                : refreshStatus === 'syncing'
                  ? React.createElement('svg', {
                    className: 'pull-spinner-ring spinning',
                    viewBox: '0 0 28 28'
                  },
                    React.createElement('circle', {
                      cx: 14, cy: 14, r: 10,
                      strokeDasharray: '45 20',
                      strokeDashoffset: 0
                    })
                  )
                  : React.createElement('svg', {
                    className: 'pull-spinner-ring' + (refreshStatus === 'ready' ? ' ready' : ''),
                    viewBox: '0 0 28 28',
                    style: {
                      transform: `rotate(${-90 + Math.min(pullProgress / pullThreshold, 1) * 180}deg)`,
                      transition: 'transform 0.1s ease-out'
                    }
                  },
                    React.createElement('circle', {
                      cx: 14, cy: 14, r: 10,
                      strokeDasharray: 63,
                      strokeDashoffset: 63 - (Math.min(pullProgress / pullThreshold, 1) * 63)
                    })
                  )
        ),
        React.createElement('span', {
          className: 'pull-text'
            + (refreshStatus === 'ready' ? ' ready' : '')
            + (refreshStatus === 'syncing' ? ' syncing' : '')
            + ' status-' + refreshStatus
        },
          refreshStatus === 'success' ? 'Готово!'
            : refreshStatus === 'timeout' ? 'Синхронизация заняла слишком долго'
              : refreshStatus === 'error' ? 'Ошибка синхронизации'
                : refreshStatus === 'syncing' ? 'Синхронизация...'
                  : refreshStatus === 'ready' ? 'Отпустите для обновления'
                    : 'Потяните для обновления'
        )
      )
      : null;

    // Render empty state (только после первичной гидратации layout)
    // Don't show empty state during sync loading — layout for new client may not have arrived yet
    if (isLayoutHydrated && widgets.length === 0 && !isEditMode && !isSyncLoading) {
      return React.createElement('div', { className: 'widgets-tab' },
        pullIndicatorEl,
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
      // Pull-to-refresh indicator
      pullIndicatorEl,

      // Sync loading skeleton — shown during client switch while cloud data syncs
      isSyncLoading && !isEditMode && React.createElement(WidgetsSyncSkeleton),

      // Header (пустой - кнопки перенесены в fixed блок снизу)
      !isSyncLoading && React.createElement('div', { className: 'widgets-header' }),

      // Widgets Grid (hidden during sync loading)
      !isSyncLoading && React.createElement('div', { className: 'widgets-grid-container' },
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
      React.createElement(RelapseRiskDetailsModal, {
        payload: relapseDetails,
        isOpen: !!relapseDetails,
        onClose: () => setRelapseDetails(null)
      }),
      React.createElement(DayScoreDetailsModal, {
        payload: dayScoreDetails,
        isOpen: !!dayScoreDetails,
        onClose: () => setDayScoreDetails(null)
      }),
      React.createElement(CrashRiskDetailsModal, {
        payload: crashRiskDetails,
        isOpen: !!crashRiskDetails,
        onClose: () => setCrashRiskDetails(null),
        onPeriodChange: (newPeriod) => {
          const w = crashRiskDetails?.widget;
          if (!w) return;
          HEYS.Widgets.state?.updateWidget(w.id, { settings: { ...(w.settings || {}), periodDays: newPeriod } }, true);
        }
      }),
      React.createElement(ResetLayoutConfirmModal, {
        isOpen: showResetConfirm,
        widgetCount: widgets.length,
        onClose: handleCloseResetConfirm,
        onConfirm: handleConfirmResetLayout
      }),

      // === Fixed bottom edit controls (для всех устройств) ===
      React.createElement('div', { className: 'widgets-edit-controls' },
        // Кнопки добавить/отменить/вернуть - показываем только в edit mode
        isEditMode && React.createElement('div', { className: 'widgets-edit-controls__stack' },
          showHomeTabPicker && React.createElement('div', {
            className: 'widgets-home-tab-picker',
            role: 'group',
            'aria-label': 'Выбор домашней вкладки'
          },
            React.createElement('div', { className: 'widgets-home-tab-picker__title' }, 'Домашняя вкладка'),
            React.createElement('div', { className: 'widgets-home-tab-picker__hint' },
              'С неё приложение откроется в следующий раз'
            ),
            React.createElement('div', { className: 'widgets-home-tab-picker__options' },
              HOME_TAB_OPTIONS.map((option) => React.createElement('button', {
                key: option.key,
                type: 'button',
                className: `widgets-home-tab-picker__option ${defaultHomeTab === option.key ? 'active' : ''}`,
                onClick: () => handleSetDefaultHomeTab(option.key),
                'aria-pressed': defaultHomeTab === option.key,
                title: `Сделать домашней вкладкой: ${option.label}`
              },
                React.createElement('span', { className: 'widgets-home-tab-picker__option-icon' }, option.icon),
                React.createElement('span', { className: 'widgets-home-tab-picker__option-label' }, option.label),
                defaultHomeTab === option.key && React.createElement('span', {
                  className: 'widgets-home-tab-picker__option-badge',
                  'aria-hidden': 'true'
                }, '🏠')
              ))
            )
          ),
          React.createElement('div', { className: 'widgets-edit-controls__actions' },
            React.createElement('button', {
              id: 'tour-widgets-add',
              className: 'widgets-header__btn widgets-header__btn--add',
              onClick: () => setCatalogOpen(true)
            }, '+ Добавить'),
            React.createElement('button', {
              className: 'widgets-header__btn widgets-header__btn--copy-layout',
              onClick: handleCopyLayoutLog,
              title: 'Скопировать лог раскладки виджетов по клеткам',
              'aria-label': 'Скопировать лог раскладки виджетов по клеткам'
            }, '📋'),
            React.createElement('button', {
              className: 'widgets-header__btn widgets-header__btn--reset',
              onClick: handleResetLayout,
              title: 'Сбросить виджеты к дефолтной раскладке',
              'aria-label': 'Сбросить виджеты к дефолтной раскладке'
            }, '↺'),
            React.createElement('button', {
              className: `widgets-header__btn widgets-header__btn--home ${showHomeTabPicker ? 'active' : ''}`,
              onClick: () => setShowHomeTabPicker((prev) => !prev),
              title: showHomeTabPicker ? 'Скрыть выбор домашней вкладки' : 'Выбрать домашнюю вкладку',
              'aria-expanded': showHomeTabPicker,
              'aria-pressed': showHomeTabPicker,
              'aria-label': showHomeTabPicker ? 'Скрыть выбор домашней вкладки' : 'Показать выбор домашней вкладки'
            }, '🏠'),
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
          )
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
          React.createElement('button', {
            className: 'water-fab',
            onClick: (e) => handleAddWater(200, e.currentTarget),
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
  HEYS.Widgets.RelapseRiskDetailsModal = RelapseRiskDetailsModal;

  if (widgetsDebugEnabled() && widgetsOnce('widgets_ui_loaded')) {
    trackWidgetIssue('widgets_ui_loaded', { version: '1.1.0' });
  }

})(typeof window !== 'undefined' ? window : global);
