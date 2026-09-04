/**
 * heys_widgets_ui_v1.js
 * UI компоненты: Каталог, Настройки, WidgetsTab
 * Version: 1.1.0
 * Created: 2025-12-15
 * 
 * v1.1.0:
 * - Поддержка pointer events для drag & drop
 * - Вход в расстановку — FAB настройки экрана (40 px, левый нижний угол)
 * - Ghost элемент и placeholder preview
 * - Undo/Redo кнопки в header
 * - Resize handles временно выключены (WIDGET_EDIT_RESIZE_ENABLED) *
 * MODULE MAP (agent navigation — jump by line; do not read whole file)
 * Related docs: docs/reference/IMPROVEMENT_HISTORY.md (W-01/W-02 widgets)
 *                 widgets/widget_data.js + heys_widgets_core_v1.js (data layer)
 *
 *  ~13   IIFE entry — debug helpers, dead-setting filters
 *  ~83   LAYOUT UTILS — getWidgetDims, grid cells, element-scale CSS vars
 * ~502   WidgetCard — drag-resize handles, DnD pointer hooks
// ~1372  WidgetContent — type router to per-widget renderers
// ~1613  DayScoreWidgetContent — unified day score (Status + Momentum)
// ~1731  InsulinWaveSparkline + InsulinWaveWidgetContent
// ~1920  HealthTrendWidgetContent
// ~2040  CascadeWidgetContent, StatusWidgetContent (deprecated redirect)
// ~2082  Calories / Water / Sleep / Streak widget contents
// ~2491  WeightWidgetContent + WeightMiniSparkline
// ~3130  Steps / Macros / Insulin / Heatmap / Cycle contents
// ~3760  CrashRiskWidgetContent + RelapseRiskSpeedometer
// ~4745  RelapseRiskWidgetContent
// ~4891  StatusDetailsModal, CrashRiskDetailsModal
// ~5323  DayScoreDetailsModal, RelapseRiskDetailsModal
// ~5863  CatalogStrip / CatalogModal — add widget picker
// ~5983  SettingsModal — per-widget settings editor
// ~6349  WidgetsTab — main tab: edit mode, undo/redo, layout bootstrap
// ~7119  HEYS.Widgets exports
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

  // Временно: в режиме расстановки только drag (без смены размера). Вернуть true — вернуть handles + «Размер» в ⚙️.
  const WIDGET_EDIT_RESIZE_ENABLED = false;

  // Четыре колонки — та же единица сетки, что GRID_COLS в heys_widgets_core_v1.js.
  const WIDGETS_GRID_COLS = 4;

  /**
   * Формат чисел (канвас home-widgets.v4, строка «формат чисел · правило
   * продукта»): разряды тысяч разделяет узкий неразрывный пробел U+202F
   * («1 931 ккал»), дробную часть — запятая («2,7 л»), а число с единицей
   * связывает обычный неразрывный пробел U+00A0, чтобы единица не уезжала
   * в перенос.
   *
   * Оба символа записаны escape-последовательностями намеренно: сырой
   * невидимый пробел в литерале не виден в диффе и теряется при копировании
   * кода — ровно та неоднозначность, из-за которой контракт стал называть
   * символ кодом, а не описанием.
   *
   * toLocaleString('ru-RU') отдаёт в разрядах U+00A0, а не U+202F, поэтому
   * группировку переводим в узкий вручную.
   */
  const NUM_GROUP_SEP = '\u202F';
  const NUM_UNIT_SEP = '\u00A0';

  function formatRuNumber(value, options) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ru-RU', options).split('\u00A0').join(NUM_GROUP_SEP);
  }

  /**
   * Единицы, которые сегодня стоят вплотную к числу, без пробела вовсе.
   * Контракт про них молчит: он назвал разделитель разрядов и запятую
   * в дробной части, а «отделяется ли процент» осталось без ответа. Пока
   * сохраняем то, что человек видит сейчас, — но одним списком, а не
   * россыпью шаблонов: ответ дизайнера меняет эту строку, а не экран.
   */
  const TIGHT_UNITS = new Set(['%']);

  /**
   * Склейка числа с единицей — одна на файл.
   *
   * Значение приходит уже готовым к показу (`formatRuNumber`, `toFixed`,
   * «7/30», «−0,4»): функция ничего не переформатирует, иначе смена шва
   * молча меняла бы и сами числа. Её единственное решение — чем сшить.
   *
   * По умолчанию шов — обычный неразрывный U+00A0: единица не уезжает
   * в перенос отдельно от числа (строка контракта home-widgets.v4
   * «формат чисел · правило продукта»). `tight` — осознанное отступление
   * для мест, где число и единица стоят вплотную; без него единица берёт
   * умолчание из `TIGHT_UNITS`.
   *
   * @param {string|number} value — уже отформатированное значение
   * @param {string} unit — единица как её видит человек («ккал», «кг», «%»)
   * @param {{ tight?: boolean }} [options]
   */
  function formatRuUnit(value, unit, options) {
    const tight = options && 'tight' in options
      ? options.tight === true
      : TIGHT_UNITS.has(unit);
    return String(value) + (tight ? '' : NUM_UNIT_SEP) + String(unit);
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

  // Настройки, которые ничего не переключают — не показываем в модалке (промпт 4a).
  const DEAD_WIDGET_SETTING_KEYS = {
    heatmap: new Set(['showWeekdays', 'showDates']),
    relapseRisk: new Set(['showSource']),
    weight: new Set(['periodDays'])
  };

  function isDeadWidgetSetting(widgetType, key) {
    return DEAD_WIDGET_SETTING_KEYS[widgetType]?.has(key) === true;
  }

  function getWidgetSettingsSchema(widgetType, selectedSize) {
    const sizeSpecificSettings = widgetType?.settingsBySize?.[selectedSize];
    const raw = sizeSpecificSettings !== undefined
      ? sizeSpecificSettings
      : (widgetType?.settings || {});
    return Object.fromEntries(
      Object.entries(raw).filter(([key]) => !isDeadWidgetSetting(widgetType?.type, key))
    );
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
      className: ['widget-cascade', `widget-cascade--${size}`, extraClassName, metricInlineWithLabel ? 'widget-cascade--metric-inline' : '', !hasData ? 'widget-cascade--empty' : '', hasData ? 'v4-place-reveal' : '']
        .filter(Boolean)
        .join(' ')
    },
      !hasData
        ? React.createElement('div', {
          className: 'widget-cascade__holder v4-place-holder',
          'aria-hidden': 'true'
        })
        : React.createElement('div', {
          className: 'widget-cascade__dots',
          style: { '--dot-total': events.length }
        },
          events.map((event, index) => {
            const tone = getCascadeEventTone(Number(event?.weight) || 0);
            const weight = Number(event?.weight) || 0;
            const weightLabel = `${weight > 0 ? '+' : ''}${weight.toFixed(1)}`;
            const isLatestPositive = index === events.length - 1 && event?.positive;

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
                React.createElement('span', { className: 'widget-cascade__metric-value' }, formatRuUnit(pct, '%')),
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
              React.createElement('span', { className: 'widget-cascade__metric-value' }, formatRuUnit(pct, '%')),
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
          React.createElement('span', { className: 'widget-cascade__badge-value' }, formatRuUnit(pct, '%')),
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
  const WidgetCard = React.memo(function WidgetCard({
    widget,
    isEditMode,
    onRemove,
    onSettings,
    index = 0,
    selectedDate,
    dragPreviewPosition = null,
    removePickActive = false
  }) {
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
      if (isEditMode && removePickActive) {
        onRemove?.(widget.id);
        return;
      }
      if (!isEditMode) {
        if (
          widget.type === 'crashRisk'
          && widget.size === '2x1'
          && HEYS.Widgets.weightDynamicsClickGuard?.isBlocked?.(widget.id)
        ) {
          return;
        }
        HEYS.Widgets.emit('widget:click', { widget });
      }
    }, [isEditMode, removePickActive, onRemove, widget]);

    const hasVariantPicker = useMemo(() => {
      const catalog = HEYS.Widgets.VariantsV4?.getCatalog?.(widget.type) || [];
      return catalog.length > 1;
    }, [widget.type]);

    const editLpTimerRef = useRef(null);
    const editLpStartRef = useRef(null);

    const cancelEditLongPress = useCallback(() => {
      if (editLpTimerRef.current) {
        clearTimeout(editLpTimerRef.current);
        editLpTimerRef.current = null;
      }
    }, []);

    useEffect(() => () => cancelEditLongPress(), [cancelEditLongPress]);

    const handleViewPointerDown = useCallback(() => {
      // Долгий тап мимо плитки / по фону не входит в расстановку (канвас v4, 23 августа).
    }, []);

    const handleViewPointerMove = useCallback((e) => {
      if (!editLpTimerRef.current || !editLpStartRef.current) return;
      const x = e.clientX || e.touches?.[0]?.clientX || 0;
      const y = e.clientY || e.touches?.[0]?.clientY || 0;
      const dx = Math.abs(x - editLpStartRef.current.x);
      const dy = Math.abs(y - editLpStartRef.current.y);
      if (dx > 10 || dy > 10) cancelEditLongPress();
    }, [cancelEditLongPress]);

    const handleViewPointerUp = useCallback(() => {
      cancelEditLongPress();
    }, [cancelEditLongPress]);

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
        // PERF NEW-10: startTransition помечает обновление как low-priority.
        // При быстром drag React сможет прервать незаконченный render если придёт
        // следующий pointermove → setResizePreview не блокирует input frame budget.
        // Если startTransition недоступен (старый React) — fallback на прямой setState.
        if (typeof React.startTransition === 'function') {
          React.startTransition(() => setResizePreview(ref.pending));
        } else {
          setResizePreview(ref.pending);
        }
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
      const metrics = HEYS.Widgets.grid?.getCellMetrics?.() || { cellWidth: 150, cellHeight: 76, gap: 12 };
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
      if (!isEditMode || !WIDGET_EDIT_RESIZE_ENABLED) return;

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
        const metrics = HEYS.Widgets.grid?.getCellMetrics?.() || { cellWidth: 150, cellHeight: 76, gap: 12 };
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
    // Пока плитку тащат, позиции соседей приходят предпросмотром порядка
    // (канвас v4, строка 57): соседи съезжают в реальном времени.
    const previewPosition = isResizing
      ? (resizePreview?.position || widget.position)
      : (dragPreviewPosition || widget.position);
    const effectiveWidget = useMemo(() => {
      if (isResizing) {
        return {
          ...widget,
          size: previewSizeId,
          cols: previewCols,
          rows: previewRows,
          position: previewPosition
        };
      }
      if (dragPreviewPosition) return { ...widget, position: dragPreviewPosition };
      return widget;
    }, [isResizing, previewCols, previewRows, previewPosition, previewSizeId, widget, dragPreviewPosition]);

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

    // Строка контракта «озвучивание плитки»: плитка читается одной фразой.
    // Фраза снимается с отрисованной плитки после каждого её обновления —
    // раньше подпись и число уходили в озвучку отдельными узлами, а состояние
    // не называлось вовсе, потому что жило только цветом.
    const [spokenLabel, setSpokenLabel] = useState(null);
    useEffect(() => {
      if (isEditMode) return;
      const next = v4TileSpokenLabel(elementRef.current, widgetType?.name);
      setSpokenLabel((prev) => (prev === next ? prev : next));
    });

    /**
     * Строка контракта «длинное значение в узком формате»: число не сжимается
     * кеглем и не переносится — первой уходит единица, затем сокращается
     * подпись, и только потом число обрезается краем плитки. Раньше лестницы
     * не было вовсе: на длинном числе работал только overflow: hidden.
     */
    const [tightStep, setTightStep] = useState(0);
    useEffect(() => {
      setTightStep(0);
    }, [spokenLabel, effectiveWidget.size]);
    useEffect(() => {
      if (isEditMode || tightStep >= 2) return;
      const valueNode = elementRef.current?.querySelector(
        '.widget-v4-hero-num__val, .widget-v4-mini__value, .widget-v4-row__value'
      );
      if (!valueNode) return;
      if (valueNode.scrollWidth > valueNode.clientWidth + 1) setTightStep((step) => step + 1);
    });
    const tightClass = tightStep >= 2
      ? ' widget--value-tight widget--value-tight-2'
      : (tightStep === 1 ? ' widget--value-tight' : '');

    return React.createElement('div', {
      ref: elementRef,
      className: `widget ${sizeClass} ${typeClass} ${isEditMode ? 'widget--editing' : ''} ${isResizing ? 'widget--resizing' : ''} ${isResizing && isResizeSnap ? 'widget--resize-snap' : ''} ${hasScales ? 'widget--has-scales' : ''}${tightClass}`,
      'data-widget-id': widget.id,
      'data-widget-type': widget.type,
      // role=img закрывает внутренние узлы от обхода: иначе фраза распадается
      // на подпись и число. В расстановке роль снимается — там у карточки есть
      // свои кнопки «убрать» и «настроить».
      role: !isEditMode && spokenLabel ? 'img' : undefined,
      'aria-label': !isEditMode && spokenLabel ? spokenLabel : undefined,
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
      onPointerDown: (e) => {
        handleViewPointerDown(e);
        handlePointerDown(e);
      },
      onPointerEnter: isEditMode && HEYS.Widgets._catalogDragType
        ? () => { HEYS.Widgets._catalogDropTargetId = widget.id; }
        : undefined,
      onPointerLeave: isEditMode && HEYS.Widgets._catalogDragType
        ? () => {
          if (HEYS.Widgets._catalogDropTargetId === widget.id) {
            HEYS.Widgets._catalogDropTargetId = null;
          }
        }
        : undefined,
      onPointerMove: (e) => {
        handleViewPointerMove(e);
        handlePointerMove(e);
      },
      onPointerUp: (e) => {
        handleViewPointerUp();
        handlePointerUp(e);
      },
      onPointerCancel: (e) => {
        handleViewPointerUp();
        handlePointerUp(e);
      }
    },


      // Widget Content (placeholder - будет заменён конкретными виджетами)
      // В edit-mode блокируем pointer-события на контенте: DnD/resize обрабатывает карточка
      React.createElement('div', {
        className: 'widget__content',
        style: isEditMode ? { pointerEvents: 'none' } : undefined
      },
        React.createElement(WidgetContent, { widget: effectiveWidget, widgetType, selectedDate })
      ),

      // Edit mode: компактный бейдж размера (не перекрывает контент)
      isEditMode && WIDGET_EDIT_RESIZE_ENABLED && React.createElement('div', {
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
        title: 'Удалить',
        'aria-label': 'Убрать виджет'
      },
        React.createElement('svg', {
          width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 3.4, strokeLinecap: 'round',
          'aria-hidden': 'true'
        }, React.createElement('path', { d: 'M6 12h12' }))
      ),

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
      isEditMode && WIDGET_EDIT_RESIZE_ENABLED && React.createElement(React.Fragment, null,
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
  function WidgetContent({ widget, widgetType, selectedDate }) {
    const [eventVersion, setEventVersion] = useState(0);
    const [waterPatch, setWaterPatch] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const skipLoadUntilRef = useRef(0);

    const data = useMemo(() => {
      if (selectedDate && HEYS.Widgets?.data) {
        HEYS.Widgets.data._selectedDate = selectedDate;
      }
      try {
        const base = HEYS.Widgets.data?.getDataForWidget?.(widget) || {};
        if (widget.type === 'water' && waterPatch) {
          return { ...base, ...waterPatch };
        }
        return base;
      } catch (e) {
        return {};
      }
    }, [widget, selectedDate, eventVersion, waterPatch]);

    const loadDataSync = useCallback(() => {
      if (widget.type === 'water' && Date.now() < skipLoadUntilRef.current) return;
      setWaterPatch(null);
      setEventVersion((v) => v + 1);
      setError(null);
      setLoading(false);
    }, [widget.type]);

    // Подписка на обновления данных
    useEffect(() => {
      // Первоначальная загрузка
      const loadData = () => loadDataSync();

      loadData();

      // Подписка на события обновления данных
      const unsubData = HEYS.Widgets.on?.('data:updated', loadData);

      // Подписка на изменение настроек виджета (напр. смена periodDays через модалку)
      const unsubSettings = HEYS.Widgets.on?.('widget:settings', ({ widget: updatedWidget }) => {
        if (updatedWidget?.id !== widget.id) return;
        try {
          const newData = HEYS.Widgets.data?.getDataForWidget?.(updatedWidget) || {};
          setWaterPatch(null);
          setEventVersion((v) => v + 1);
          setError(null);
        } catch (e) { /* ignore */ }
      });

      // Подписка на глобальные события HEYS (water:added НЕ включаем — обрабатывается оптимистично через heysWaterAdded DOM event)
      const onProfileUpdated = () => {
        skipLoadUntilRef.current = 0;
        loadData();
      };
      window.addEventListener('heys:profile-updated', onProfileUpdated);

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
          setWaterPatch({
            drunk: total,
            pct: (() => {
              const tgt = HEYS.Widgets.data?.getDataForWidget?.(widget)?.target || 2000;
              return tgt > 0 ? Math.round((total / tgt) * 100) : 0;
            })()
          });
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
        window.removeEventListener('heys:profile-updated', onProfileUpdated);
        if (handleCrsUpdated) {
          window.removeEventListener('heys:crs-updated', handleCrsUpdated);
        }
      };
    }, [widget.id, widget.type, loadDataSync]);

    // Loading state — v4 держатель места (без знака ожидания внутри плитки).
    if (loading) {
      return React.createElement('div', {
        className: 'widget__loading v4-place-holder',
        'aria-hidden': 'true'
      });
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
      // Шесть виджетов пакета 22 августа.
      case 'fiber':
        return React.createElement(FiberWidgetContent, { widget, data });
      case 'protein':
        return React.createElement(ProteinWidgetContent, { widget, data });
      case 'sleepWindow':
        return React.createElement(SleepWindowWidgetContent, { widget, data });
      case 'foodQuality':
        return React.createElement(FoodQualityWidgetContent, { widget, data });
      case 'mealRhythm':
        return React.createElement(MealRhythmWidgetContent, { widget, data });
      case 'sleepReady':
        return React.createElement(SleepReadyWidgetContent, { widget, data });
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
        // Заглушка тоже играет по правилу канваса (строки 43 и 44): подпись
        // и прочерк, без иконок и обучающих фраз.
        return v4EmptyTile(widgetType?.name || 'Виджет');
    }
  }

  // === Individual Widget Content Components ===

  function v4Kicker(text) {
    return React.createElement('div', { className: 'widget-v4-kicker' }, text);
  }

  /**
   * Строка контракта «озвучивание плитки»: плитка читается одной фразой
   * «название, значение, единица, состояние» — «Вес, 91,1 килограмма, идёт
   * хорошо». Состояние называется словом, а не цветом; подпись и число
   * отдельными узлами не читаются.
   *
   * Фраза собирается из уже отрисованной плитки, а не из данных: видов у
   * виджета много, и второй генератор текста разошёлся бы с тем, что человек
   * видит. Роль состояния берётся с самого узла значения — там она и живёт.
   */
  const V4_STATE_WORD = {
    good: 'идёт хорошо',
    warn: 'требует внимания',
    bad: 'обрати внимание',
    overlap: 'волны наложились'
  };

  function v4TileSpokenLabel(root, fallbackName) {
    if (!root) return fallbackName || null;
    // Состояние, у которого нет узла значения, собрать по узлам нельзя: у
    // ночной оценки волны числа на плитке нет вовсе, а у пустого дня прочерк
    // прочитался бы как «минус». Такие кадры называют свою фразу сами
    // (строка «волна · озвучивание состояний»).
    const explicit = root.querySelector('[data-v4-spoken]')?.getAttribute('data-v4-spoken');
    if (explicit) return explicit;
    const clean = (node) => (node?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    const name = clean(root.querySelector('.widget-v4-kicker')) || fallbackName || '';
    const valueNode = root.querySelector(
      '.widget-v4-hero-num__val, .widget-v4-mini__value, .widget-v4-row__value, .widget-v4-delta'
    );
    if (!valueNode) return name || null;
    const unitNode = valueNode.querySelector('.widget-v4-unit');
    const unit = clean(unitNode);
    let value = clean(valueNode);
    if (unit && value.endsWith(unit)) value = value.slice(0, value.length - unit.length).trim();
    const stateKey = Object.keys(V4_STATE_WORD)
      .find((key) => valueNode.classList.contains(`widget-v4-val--${key}`));
    return [name, value, unit, stateKey ? V4_STATE_WORD[stateKey] : '']
      .filter(Boolean)
      .join(', ');
  }

  // Нет данных за день: на месте числа прочерк, подпись остаётся, графики не
  // рисуются, ноль не подставляется (канвас v4, строки 43 и 44). Отдельный
  // случай — виду не хватает истории: тогда вместо графика подпись «нужно N
  // дней» (строки 65 и 66).
  function v4EmptyTile(kickerText, note) {
    return React.createElement('div', { className: 'widget-v4-stack widget-v4-stack--empty' },
      v4Kicker(kickerText),
      React.createElement('div', { className: 'widget-v4-hero-num' },
        React.createElement('span', { className: 'widget-v4-hero-num__val widget-v4-val--neutral' }, '—')
      ),
      note
        ? React.createElement('span', { className: 'widget-v4-muted', style: { marginTop: 'auto' } }, note)
        : null
    );
  }

  function isWidgetV4EditMode() {
    return HEYS.Widgets.state?.isEditMode?.() || false;
  }

  function isWidgetsCuratorReadOnly() {
    try { return !!HEYS.auth?.isCuratorSession?.(); } catch (_e) { return false; }
  }

  function patchWidgetsProfile(patch) {
    const U = HEYS.utils;
    if (!U || typeof U.lsGet !== 'function' || typeof U.lsSet !== 'function') return false;
    const profile = U.lsGet('heys_profile', {}) || {};
    const next = {
      ...profile,
      ...patch,
      revision: (profile.revision || 0) + 1,
      updatedAt: Date.now()
    };
    U.lsSet('heys_profile', next);
    try {
      window.dispatchEvent(new CustomEvent('heys:profile-updated', {
        detail: { fields: Object.keys(patch), source: 'widgets-tab' }
      }));
    } catch (_e) { /* noop */ }
    return true;
  }

  function formatWidgetHeatmapDayTitle(dateStr) {
    if (!dateStr || dateStr === 'Нет даты') return dateStr;
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return dateStr;
    try {
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch (_e) {
      return dateStr;
    }
  }

  function WidgetV4VariantShell({ widget, widgetType, renderBody }) {
    const V4 = HEYS.Widgets.VariantsV4;
    const catalog = V4?.getCatalog?.(widgetType) || [];
    if (!V4?.useWidgetVariantTile || catalog.length <= 1) {
      const active = V4?.getActiveVariant?.(widget, widgetType);
      return renderBody(active?.id || 'default', { activeVariant: active });
    }
    const hook = V4.useWidgetVariantTile({
      widget,
      widgetType,
      disabled: isWidgetV4EditMode() || isWidgetsCuratorReadOnly(),
      renderPreview: (variantId, opts) => {
        const meta = V4.getVariantById(widgetType, variantId);
        // Карточка листа рисуется в своём формате, а не в формате плитки,
        // которая стоит на экране (канвас v4, строки 27 и 28): иначе человек
        // выбирает по картинке, которая не совпадёт с результатом.
        const size = meta?.size || widget?.size;
        const sizeInfo = HEYS.Widgets.registry?.getSize?.(size);
        const previewWidget = size && size !== widget?.size
          ? {
            ...widget,
            size,
            cols: sizeInfo?.cols || widget?.cols,
            rows: sizeInfo?.rows || widget?.rows
          }
          : widget;
        return renderBody(variantId, {
          ...opts,
          preview: true,
          activeVariant: meta,
          widget: previewWidget
        });
      }
    });
    return React.createElement(React.Fragment, null,
      React.createElement('div', hook.tileProps,
        renderBody(hook.renderVariant, {
          activeVariant: hook.activeVariant
        })
      ),
      hook.sheetProps
        ? React.createElement(V4.WidgetVariantSheet, hook.sheetProps)
        : null
    );
  }

  const WIDGET_V4_SPARK_DRAW_MS = 320;
  const WIDGET_V4_SPARK_DELAY_MS = 320;

  function v4SparkPointsToPath(points) {
    if (!points) return '';
    const coords = String(points).trim().split(/\s+/);
    if (coords.length < 2) return '';
    const [x0, y0] = coords[0].split(',').map(Number);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return '';
    let d = `M${x0},${y0}`;
    for (let i = 1; i < coords.length; i++) {
      const [x, y] = coords[i].split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      d += ` L${x},${y}`;
    }
    return d;
  }

  function useV4SparkPathDraw(pathD, {
    enabled = true,
    compact = false,
    delayMs = WIDGET_V4_SPARK_DELAY_MS,
    drawMs = WIDGET_V4_SPARK_DRAW_MS,
    onDrawComplete,
    introSlow
  } = {}) {
    const introSlowRef = React.useRef(introSlow != null ? introSlow : widgetMotionIsIntroSlow());
    const factor = introSlowRef.current ? WIDGET_MOTION_INTRO_FACTOR : 1;
    const resolvedDelayMs = delayMs * factor;
    const resolvedDrawMs = drawMs * factor;
    const pathRef = React.useRef(null);
    const [pathLength, setPathLength] = React.useState(0);
    const [revealed, setRevealed] = React.useState(!enabled || compact);
    const onDrawCompleteRef = React.useRef(onDrawComplete);
    onDrawCompleteRef.current = onDrawComplete;

    React.useLayoutEffect(() => {
      if (!pathD || !enabled || compact) {
        setPathLength(0);
        setRevealed(!enabled ? false : true);
        return undefined;
      }
      const el = pathRef.current;
      if (!el) return undefined;
      const len = el.getTotalLength();
      if (!Number.isFinite(len) || len <= 0) return undefined;
      setPathLength(len);
      if (!widgetV4ShouldAnimateSparkDraw()) {
        setRevealed(true);
        return undefined;
      }
      setRevealed(false);
      return undefined;
    }, [pathD, compact, enabled]);

    React.useEffect(() => {
      if (!widgetV4ShouldAnimateSparkDraw()) return undefined;
      if (!pathD || !enabled || compact || pathLength <= 0) return undefined;
      let raf2 = 0;
      let timer = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          timer = window.setTimeout(() => setRevealed(true), resolvedDelayMs);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
        if (timer) clearTimeout(timer);
      };
    }, [pathD, compact, pathLength, enabled, resolvedDelayMs]);

    React.useEffect(() => {
      if (!revealed || compact || !enabled) return undefined;
      const cb = onDrawCompleteRef.current;
      if (!cb) return undefined;
      const timer = window.setTimeout(cb, resolvedDrawMs);
      return () => clearTimeout(timer);
    }, [revealed, resolvedDrawMs, compact, enabled]);

    const lineStyle = (!enabled || compact) ? undefined : {
      strokeDasharray: pathLength > 0 ? `${pathLength}` : undefined,
      strokeDashoffset: revealed ? 0 : pathLength,
      transition: revealed
        ? `stroke-dashoffset ${resolvedDrawMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
        : 'none'
    };
    const dotStyle = (!enabled || compact) ? undefined : {
      opacity: revealed ? 1 : 0,
      transition: revealed
        ? `opacity 360ms cubic-bezier(0.22, 0.61, 0.36, 1) ${resolvedDrawMs * 0.82}ms`
        : 'none'
    };

    return { pathRef, lineStyle, dotStyle };
  }

  function WidgetV4DrawSparkSvg({
    points,
    className,
    viewBox = '0 0 130 38',
    height = 38,
    enabled = true,
    compact = false,
    onDrawComplete,
    dotCx,
    dotCy,
    dotR = 3.5
  }) {
    const pathD = React.useMemo(() => v4SparkPointsToPath(points), [points]);
    const { pathRef, lineStyle, dotStyle } = useV4SparkPathDraw(pathD, {
      enabled,
      compact,
      onDrawComplete
    });

    if (!pathD) return null;

    return React.createElement('svg', {
      className: className || 'widget-v4-spark',
      viewBox,
      width: '100%',
      height,
      fill: 'none',
      'aria-hidden': 'true'
    },
      React.createElement('path', {
        ref: pathRef,
        className: 'widget-v4-spark__line',
        d: pathD,
        fill: 'none',
        strokeWidth: 2.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: lineStyle
      }),
      dotCx != null && dotCy != null && React.createElement('circle', {
        className: 'widget-v4-spark__dot',
        cx: dotCx,
        cy: dotCy,
        r: dotR,
        style: dotStyle
      })
    );
  }

  // Спарклайн плитки «Вес» 2×1: 58 × 22, семь последних настоящих взвешиваний,
  // точка на последнем дне. Строка «состав дефолта»: «слева от числа спарклайн
  // 58 × 22 тоном --gr2 с точкой на последнем дне». Тон фиксированный: линия
  // говорит «как шло», а состояние несёт число.

  function formatRuDecimal(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return formatRuNumber(n, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  const V4_VAL_DEAD_ZONE_KG = 0.2;
  const V4_SLEEP_GOOD_MARGIN_H = 0.5;
  /**
   * Общая шкала темпа («одна шкала на весь продукт», строки «вода» и «одна
   * шкала на весь продукт»): ожидаемое = дневная норма × k, отклонение вниз
   * считается разностью, делённой на дневную норму, а не на ожидаемое.
   * Зоны 8 / 25 % вниз и 110 / 130 % вверх — константы дизайна, общие для еды
   * и воды; различается только конец окна (у воды отбой минус 1 ч).
   * Прежний код знал один допуск 15 % от ожидаемого, не знал шалфея и верха
   * и обрывал окно за 2 ч до отбоя.
   */
  const V4_PACE_BEHIND_WARN = 0.08;
  const V4_PACE_BEHIND_BAD = 0.25;
  const V4_PACE_OVER_WARN = 1.10;
  const V4_PACE_OVER_BAD = 1.30;
  const V4_WATER_GRACE_MIN = 60;
  const V4_WATER_PREBED_MIN = 60;
  // Подъёма и отбоя из чек-ина нет — окно 08:00–21:00 (строка «одна шкала»).
  const V4_PACE_FALLBACK_WAKE_MIN = 8 * 60;
  const V4_PACE_FALLBACK_BED_MIN = 21 * 60;

  function parseHmToMinutes(hm) {
    if (!hm || typeof hm !== 'string') return null;
    const parts = hm.trim().split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return ((h % 24) * 60) + m;
  }

    // Время берётся с устройства. Строка «часовой пояс · правило продукта»:
    // «дата и время берутся с устройства: день закрывается по местному времени
    // человека, а не по серверному». Прежде здесь стоял Intl с жёстким
    // Europe/Moscow, и человек в другом поясе видел график воды не по своим
    // часам. Запасная ветка была верной с самого начала — она и осталась одна.
    function deviceNowMinutes() {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }

  function minutesSpan(startMin, endMin) {
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
    let span = endMin - startMin;
    if (span <= 0) span += 24 * 60;
    return span;
  }

  const SLEEP_AXIS_START_MIN = 22 * 60;
  const SLEEP_AXIS_SPAN_MIN = 11 * 60;

  function hmToSleepAxisPercent(hm) {
    const m = parseHmToMinutes(hm);
    if (!Number.isFinite(m)) return null;
    let pos = m - SLEEP_AXIS_START_MIN;
    if (pos < 0) pos += 1440;
    return Math.max(0, Math.min(100, (pos / SLEEP_AXIS_SPAN_MIN) * 100));
  }

  function sleepWindowBand(hmStart, hmEnd) {
    const left = hmToSleepAxisPercent(hmStart);
    const right = hmToSleepAxisPercent(hmEnd);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return { left, width: Math.max(4, right - left) };
  }

  function formatSleepHmLabel(hm, prefix) {
    const m = parseHmToMinutes(hm);
    if (!Number.isFinite(m)) return prefix ? `${prefix} —` : '—';
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    const text = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return prefix ? `${prefix} ${text}` : text;
  }

  function v4WaterScheduleAt(target, wakeMinutes, awakeSpan, atMinutes) {
    if (!target || !wakeMinutes || !awakeSpan) {
      return { expectedMl: 0, expectedPct: 0, checkLabel: null };
    }
    let elapsed = atMinutes - wakeMinutes;
    if (elapsed < 0) elapsed += 1440;
    elapsed = Math.max(0, Math.min(awakeSpan, elapsed));
    // Конец окна у воды — отбой минус 1 ч (строки «вода» и «одна шкала»):
    // ожидаемое должно упираться в норму там же, где её ждёт раскраска,
    // иначе метка «к этому часу» и цвет числа говорят разное.
    const windowSpan = Math.max(1, awakeSpan - V4_WATER_PREBED_MIN);
    const share = Math.min(1, elapsed / windowSpan);
    const h = Math.floor(atMinutes / 60) % 24;
    const min = atMinutes % 60;
    return {
      expectedMl: target * share,
      expectedPct: Math.round(share * 100),
      checkLabel: `к ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    };
  }

  // Спарклайн недели у плитки «Вес»: кадр «Главная · дефолтная раскладка»
  // рисует его слева от числа, 58×22, с точкой на последнем дне. Фоновые
  // перерисовки Главной в листах разбора эту плитку рисуют по-разному (82
  // кадра со спарклайном против 67 без) — верен полноразмерный кадр Главной.
  function WidgetV4WeekSpark({ points, toneClass = '' }) {
    const pts = (points || []).slice(-7).filter((p) => Number.isFinite(p.weight));
    if (pts.length < 2) return null;
    const values = pts.map((p) => p.weight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = pts.length > 1 ? 54 / (pts.length - 1) : 0;
    const coords = pts.map((p, i) => ({
      x: +(2 + i * step).toFixed(1),
      y: +(5 + (1 - (p.weight - min) / span) * 12).toFixed(1)
    }));
    const last = coords[coords.length - 1];
    return React.createElement('span', {
      className: ('widget-weight__number-week-spark ' + toneClass).trim()
    },
      React.createElement('svg', {
        width: 58, height: 22, viewBox: '0 0 58 22', fill: 'none', 'aria-hidden': 'true'
      },
        React.createElement('polyline', {
          points: coords.map((c) => `${c.x},${c.y}`).join(' '),
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        }),
        React.createElement('circle', { cx: last.x, cy: last.y, r: 2.4, fill: 'currentColor' })
      )
    );
  }

  function v4MacroBarRow(shortLabel, value, target, toneClass) {
    const v = Number(value) || 0;
    const t = Number(target) || 0;
    const ratio = t > 0 ? v / t : 0;
    const fillPct = t > 0 ? Math.min(100, ratio * 100) : 0;
    const over = ratio > 1;
    const normMarkerPct = over && t > 0 ? Math.round((t / v) * 100) : null;
    // Строка контракта «БЖУ»: «порог общий, в коде один компаратор с флагом
    // направления» — белок плох на недоборе, жиры и углеводы на переборе.
    // Кадр 2×1 красит и полосу, и числа: «96 / 150» тоном --val-bad, «48 / 62»
    // — чернилами. Прежние здесь свои 5 % и янтарь с зеленью были и вторым
    // компаратором, и не теми ролями.
    const bad = macroDeviationBad(v, t, toneClass);
    const valClass = bad ? 'widget-v4-val--bad' : '';
    return React.createElement('div', { className: 'widget-v4-macro-bar-row' },
      React.createElement('span', {
        className: 'widget-v4-kicker widget-v4-macro-bar-row__label'
      }, shortLabel),
      React.createElement('span', { className: 'widget-v4-macro-bar-row__track' },
        React.createElement('span', {
          className: 'widget-v4-macro-bar-row__fill' + (bad ? ' widget-v4-macro-bar-row__fill--bad' : ''),
          style: { width: `${fillPct}%` }
        }),
        normMarkerPct != null
          ? React.createElement('span', {
            className: 'widget-v4-macro-bar-row__norm',
            style: { left: `${normMarkerPct}%` }
          })
          : null
      ),
      React.createElement('span', { className: ('widget-v4-macro-bar-row__nums ' + valClass).trim() },
        `${formatRuNumber(Math.round(v))} / ${formatRuNumber(Math.round(t))}`
      )
    );
  }

  function v4ValueStateClass(state) {
    if (state === 'good') return 'widget-v4-val--good';
    if (state === 'bad') return 'widget-v4-val--bad';
    if (state === 'act') return 'widget-v4-val--act';
    // Зона предупреждения общей шкалы темпа (строка «одна шкала на весь продукт»).
    if (state === 'warn') return 'widget-v4-val--warn';
    if (state === 'overlap') return 'widget-v4-val--overlap';
    return 'widget-v4-val--neutral';
  }

  function v4SleepValueState(hours, target) {
    const h = Number(hours) || 0;
    const t = Number(target) || 0;
    if (t <= 0 || h <= 0) return 'neutral';
    if (h >= t - V4_SLEEP_GOOD_MARGIN_H) return 'good';
    return 'bad';
  }

  function v4WeightDeltaState(deltaKg) {
    if (!Number.isFinite(deltaKg)) return 'neutral';
    if (Math.abs(deltaKg) <= V4_VAL_DEAD_ZONE_KG) return 'neutral';
    if (deltaKg < 0) return 'good';
    return 'bad';
  }

  function v4WeightSparkTrendState(points) {
    const src = Array.isArray(points) ? points : [];
    const pts = src.filter((p) =>
      Number.isFinite(p?.weight) && !p.excluded && !p.estimated
    );
    if (pts.length < 2) return 'neutral';
    return v4WeightDeltaState(pts[pts.length - 1].weight - pts[0].weight);
  }

  /**
   * Строка контракта «вес»: мёртвая зона ±0,2 кг считается за окно, а
   * направление берётся из окна спарклайна (растущее: неделя, 2, 3, 4 недели,
   * дальше месяц). Прежде плитка красилась по weekChange = trend × 7 — это
   * недельный прогноз, а не изменение за окно. Запасной вариант — фиксированные
   * семь дней спарклайна: он нужен, пока «Динамика веса» не набрала окно.
   */
  function v4WeightWindowState(data) {
    const windowDelta = Number(data?.windowDeltaKg);
    if (Number.isFinite(windowDelta)) return v4WeightDeltaState(windowDelta);
    return v4WeightSparkTrendState(data?.sparkline);
  }

  function v4RiskLevelState(level) {
    if (!level || level === 'low') return 'good';
    return 'bad';
  }

  /**
   * Общая шкала темпа: k = (сейчас − подъём) / (конец окна − подъём), зажат
   * в 0…1; ожидаемое = норма × k; отклонение вниз = (ожидаемое − факт) / норма.
   * Конец окна задаётся вызывающим: у воды отбой минус 1 ч, у еды минус 3 ч.
   */
  function v4PaceState(fact, dailyNorm, ctx = {}, prebedMin = V4_WATER_PREBED_MIN) {
    const norm = Number(dailyNorm) || 0;
    const value = Number(fact) || 0;
    if (norm <= 0) return 'neutral';

    // Вверх шкала работает от дневной нормы и от окна не зависит.
    if (value > norm * V4_PACE_OVER_BAD) return 'bad';
    if (value > norm * V4_PACE_OVER_WARN) return 'warn';

    const wakeMinutes = parseHmToMinutes(ctx.sleepEnd)
      ?? (Number.isFinite(ctx.medianWakeMinutes) ? ctx.medianWakeMinutes : V4_PACE_FALLBACK_WAKE_MIN);

    const nowMinutes = Number.isFinite(ctx.nowMinutes) ? ctx.nowMinutes : deviceNowMinutes();
    if (nowMinutes < wakeMinutes) return 'neutral';
    const minsSinceWake = nowMinutes - wakeMinutes;
    // «Первый час после подъёма не красим».
    if (minsSinceWake < V4_WATER_GRACE_MIN) return 'neutral';

    const bedMinutes = parseHmToMinutes(ctx.sleepStart);
    const awakeSpan = bedMinutes != null
      ? minutesSpan(wakeMinutes, bedMinutes)
      : minutesSpan(wakeMinutes, V4_PACE_FALLBACK_BED_MIN);
    if (!awakeSpan || awakeSpan <= 0) return 'neutral';

    // Конец окна: отбой минус запас. Окно короче запаса шкалу не даёт.
    const windowSpan = awakeSpan - prebedMin;
    if (windowSpan <= 0) return 'neutral';

    const k = Math.min(1, Math.max(0, minsSinceWake / windowSpan));
    const expected = norm * k;
    // Разностью и от дневной нормы — не от ожидаемого: под вечер деление на
    // ожидаемое давало бы всё более мягкий порог там, где он должен быть строже.
    const behind = (expected - value) / norm;
    if (behind > V4_PACE_BEHIND_BAD) return 'bad';
    if (behind > V4_PACE_BEHIND_WARN) return 'warn';
    return 'good';
  }

  function v4WaterValueState(drunk, target, ctx = {}) {
    return v4PaceState(drunk, target, ctx, V4_WATER_PREBED_MIN);
  }

  const V4_MACRO_DEVIATION_PCT = 0.05;

  function macroDeviationBad(value, target, toneClass) {
    const num = Number(value) || 0;
    const tgt = Number(target) || 0;
    if (tgt <= 0) return false;
    const margin = tgt * V4_MACRO_DEVIATION_PCT;
    if (toneClass === 'protein') return num < tgt - margin;
    return num > tgt + margin;
  }

  function macroCenterBad(value, target, toneClass) {
    const num = Number(value) || 0;
    const tgt = Number(target) || 0;
    if (tgt <= 0) return false;
    const margin = tgt * V4_MACRO_DEVIATION_PCT;
    if (toneClass === 'protein') return num < tgt - margin;
    return num > tgt + margin;
  }

  // Тренд здоровья. Уточнение дизайнера 3 сентября (ответ на вопрос про
  // чернила на зелёной подложке): фон --gr-bg безусловен и состояния не несёт
  // — это роль поверхности именно этой плитки. Состояние несут число и
  // ломаная, три случая с отдельными кадрами «Тренд здоровья · рост /
  // мёртвая зона / падение»:
  //   рост выше +2   — число --gr,      ломаная --gr2;
  //   мёртвая зона ±2 — число --tx,      ломаная чернил 30 %;
  //   падение ниже −2 — число и ломаная --val-bad.
  // Ломаная в мёртвой зоне — единственный случай, где её тон отличается от
  // тона числа, поэтому она красится своим классом, а не наследует.
  const V4_HEALTH_TREND_DEAD_ZONE = 2;

  function v4HealthTrendState(delta) {
    if (!Number.isFinite(delta)) return 'neutral';
    if (Math.abs(delta) <= V4_HEALTH_TREND_DEAD_ZONE) return 'neutral';
    return delta > 0 ? 'good' : 'bad';
  }

  /** Класс ломаной тренда: у мёртвой зоны свой тон, у остальных — тон числа. */
  function v4HealthTrendSparkClass(state) {
    if (state === 'good') return 'widget-v4-spark--ok';
    if (state === 'bad') return 'widget-v4-spark--bad';
    return 'widget-v4-spark--flat';
  }

  // Инсулиновая волна красится по текущему состоянию, а не по итогу дня
  // (канвас v4, строка 95): окно покоя длиннее трёх часов — шалфей, наложение
  // волн — красный, остальное — чернила.
  const V4_INSULIN_CALM_MIN = 180;

  /**
   * Строка «инсулиновая волна»: наложение волн — тёплый акцент палитры, а не
   * красный. Строка «волна · пересечение» говорит прямо: нахлёст не ошибка,
   * а факт про день, и красным не красится.
   */
  function v4InsulinWaveState(v4) {
    if (Number(v4?.overlapCount) > 0) return 'overlap';
    if (Number(v4?.calmWindowMinutes) > V4_INSULIN_CALM_MIN) return 'good';
    return 'neutral';
  }

  function v4HeatmapMetaState(filled, total = 7) {
    if (!Number.isFinite(filled) || total <= 0) return 'neutral';
    const ratio = filled / total;
    if (ratio >= 0.6) return 'good';
    if (ratio < 0.4) return 'bad';
    return 'neutral';
  }

  // Дуга кольца — без Math.round: округление на каждом кадре даёт ступеньки,
  // а CSS macroRingFillIn (from 0) при смене дня сбрасывал кольцо в ноль.
  function macroRingArcPct(value, target, ringCapCompPct = 5) {
    const num = Number(value) || 0;
    const tgt = Number(target) || 0;
    const ratio = tgt > 0 ? num / tgt : 0;
    const basePctRaw = Math.min(100, ratio * 100);
    const basePct = Math.max(0, basePctRaw - (ratio > 0 ? ringCapCompPct : 0));
    const hasOver = ratio > 1;
    const overPctRaw = hasOver ? Math.min(50, (ratio - 1) * 100) : 0;
    const overPct = Math.max(0, overPctRaw - ringCapCompPct);
    return { ratio, basePct, hasOver, overPct };
  }

  function macroRingDasharray(pct, total = 100) {
    const n = Number(pct) || 0;
    return `${n.toFixed(2)} ${total}`;
  }

  // Пустой день (строка «вид · пустой день · кольца БЖУ»): кольцо стоит на
  // месте одной дорожкой без заливки, центр пуст, под кольцом «— / N» —
  // прочерк вместо факта и норма рядом. Ноль в факт не подставляется: правило
  // «пустой день · чего не подставляем».
  function v4SageRing({ value, ringValue, target, label, toneClass = 'carbs', empty = false }) {
    const num = Number(value) || 0;
    const arcNum = Number(ringValue != null ? ringValue : value) || 0;
    const tgt = Number(target) || 0;
    const remaining = tgt - num;
    const remainingRounded = Math.round(Math.abs(remaining));
    const centerLabel = remaining >= 0 ? String(remainingRounded) : null;
    // Canvas задаёт фактическую долю окружности. Round caps уже входят в
    // геометрию SVG, поэтому компенсация legacy-кольца здесь не применяется.
    const { basePct } = macroRingArcPct(arcNum, tgt, 0);
    const centerBad = macroCenterBad(num, tgt, toneClass);
    const factBad = macroDeviationBad(num, tgt, toneClass);
    const factRounded = Math.round(num);
    const tgtRounded = Math.round(tgt);
    return React.createElement('div', { className: 'widget-v4-macro' },
      React.createElement('div', { className: 'widget-v4-kicker widget-v4-macro__label' }, label),
      React.createElement('svg', { width: 46, height: 46, viewBox: '0 0 44 44', 'aria-hidden': 'true' },
        React.createElement('circle', {
          cx: 22, cy: 22, r: 18, fill: 'none',
          stroke: 'var(--v4-line, rgba(0,0,0,.09))', strokeWidth: 5
        }),
        empty ? null : React.createElement('circle', {
          cx: 22, cy: 22, r: 18, fill: 'none',
          className: 'widget-v4-macro__ring-fill',
          pathLength: 100,
          strokeWidth: 5,
          strokeLinecap: 'round',
          strokeDasharray: macroRingDasharray(basePct),
          transform: 'rotate(-90 22 22)'
        }),
        empty ? null : React.createElement('text', {
          x: 22, y: 26, textAnchor: 'middle',
          className: 'widget-v4-macro__num' + (centerBad ? ' widget-v4-macro__num--bad' : '')
        }, centerLabel != null
          ? centerLabel
          : [
            React.createElement('tspan', { key: 'sign', className: 'widget-v4-macro__num-sign' }, '−'),
            React.createElement('tspan', { key: 'val' }, String(remainingRounded))
          ])
      ),
      React.createElement('div', {
        className: 'widget-v4-macro__fact'
          + (empty ? ' widget-v4-macro__fact--empty' : '')
          + (!empty && factBad ? ' widget-v4-macro__fact--bad' : '')
      },
        React.createElement('span', { className: 'widget-v4-macro__fact-val' }, empty ? '—' : factRounded),
        React.createElement('span', { className: 'widget-v4-macro__fact-sep' }, ' / '),
        React.createElement('span', { className: 'widget-v4-macro__fact-tgt' }, tgtRounded)
      )
    );
  }

  // === Day Score Widget Content (Оценка дня 0-100 — unified: Status + Subjective + Momentum) ===
  function widgetHealthScoreColor(score, fallback = '#94a3b8') {
    const fn = HEYS.scales?.healthScore;
    if (typeof fn !== 'function') return fallback;
    const entry = fn(score);
    return entry?.color ?? fallback;
  }

  function DayScoreVariantBody({ variantId, widget, data, meta = {} }) {
    const score = data?.score ?? 0;
    const hasData = data?.hasData ?? false;
    const d = getWidgetDims(widget);
    const resolvedVariant = variantId === 'row' ? 'mini' : variantId;
    const scoreOnTen = formatRuDecimal(score / 10, 1);
    // Кадр «Шторка · Оценка дня» даёт числу оценки 600 и текстовый акцент
    // --ac. Заливочный --acs (#c67139) на бумаге плитки давал 2,9:1 — ниже
    // порога; строка контракта «кто красится» называет терракоту, но не
    // говорит, что она заливочная.
    const terracottaStyle = { color: 'var(--v4-sand-act-text, #8a4a20)' };

    const scoreSlashTen = (className, fontSizePx) => React.createElement('span', {
      className: className || 'widget-v4-row__value widget-day-score__score',
      style: {
        fontSize: fontSizePx ? `${fontSizePx}px` : undefined,
        fontWeight: 600,
        ...terracottaStyle
      }
    },
      scoreOnTen,
      React.createElement('span', { className: 'widget-v4-unit' }, ' / 10')
    );

    const weekBarCols = (weekScores, { empty = false } = {}) => {
      const list = Array.isArray(weekScores) ? weekScores : [];
      const maxScore = empty
        ? 1
        : Math.max(1, ...list.map((day) => day.score || 0));
      return React.createElement('div', { className: 'widget-v4-week-bars widget-v4-week-bars--inline' },
        list.map((day, index) => {
          const isToday = index === list.length - 1;
          const height = empty || !(day.score > 0)
            ? '2px'
            : `${Math.round((day.score / maxScore) * 100)}%`;
          return React.createElement('span', {
            key: day.date || `d${index}`,
            className: 'widget-v4-week-bars__col'
              + (isToday ? ' widget-v4-week-bars__col--today' : ' widget-v4-week-bars__col--past'),
            style: { height }
          });
        })
      );
    };

    if (!hasData) {
      if (resolvedVariant === 'week_chart') {
        const weekScores = Array.isArray(data.weekScores) ? data.weekScores : [];
        const padded = weekScores.length >= 7
          ? weekScores
          : [...weekScores, ...Array(7 - weekScores.length).fill({ score: 0 })];
        return React.createElement('div', { className: 'widget-day-score widget-v4-stack widget-day-score--week' },
          React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
            React.createElement('span', {
              className: 'widget-v4-hero-num__val widget-v4-val--neutral',
              style: { fontSize: '21px', fontWeight: 700 }
            }, '—')
          ),
          weekBarCols(padded, { empty: true })
        );
      }
      return v4EmptyTile('Оценка');
    }

    if (resolvedVariant === 'mini' || (d.isMicro && resolvedVariant !== 'factors' && resolvedVariant !== 'week_chart')) {
      return React.createElement('div', { className: 'widget-day-score widget-v4-mini' },
        v4Kicker('Оценка'),
        React.createElement('div', {
          className: 'widget-v4-mini__value widget-day-score__score',
          style: { fontSize: '21px', ...terracottaStyle }
        },
          scoreOnTen,
          React.createElement('span', { className: 'widget-v4-unit' }, ' / 10')
        )
      );
    }

    if (resolvedVariant === 'factors') {
      const bars = Array.isArray(data.factorBars) ? data.factorBars : [];
      return React.createElement('div', {
        className: 'widget-day-score widget-day-score--short widget-v4-stack'
      },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Оценка дня'),
          scoreSlashTen('widget-v4-row__value', 16)
        ),
        React.createElement('div', { className: 'widget-v4-factor-cols' },
          bars.map((bar) => React.createElement('span', {
            key: bar.key,
            className: 'widget-v4-factor-cols__item'
          },
            React.createElement('span', {
              className: 'widget-v4-factor-cols__bar widget-v4-factor-cols__bar--' + (bar.tone || 'good')
            }),
            React.createElement('span', { className: 'widget-v4-factor-cols__label' }, bar.label)
          ))
        )
      );
    }

    if (resolvedVariant === 'week_chart') {
      const weekScores = Array.isArray(data.weekScores) ? data.weekScores : [];
      return React.createElement('div', {
        className: 'widget-day-score widget-day-score--short widget-v4-stack widget-day-score--week'
      },
        // Кадр «Шторка · Оценка дня», вид «Семь дней»: столбики стоят своей
        // строкой под шапкой, а не внутри неё. В одной строке с ключом и
        // числом им оставалось 24 px на семь столбиков с зазорами — то есть
        // ноль. Число здесь без «/ 10»: шкалу задают сами столбики.
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Оценка · 7 дней'),
          React.createElement('span', {
            className: 'widget-day-score__week-score',
            style: { fontSize: '16px', fontWeight: 600, ...terracottaStyle }
          }, scoreOnTen)
        ),
        weekBarCols(weekScores)
      );
    }

    return React.createElement('div', { className: 'widget-day-score widget-v4-mini' },
      v4Kicker('Оценка'),
      React.createElement('div', {
        className: 'widget-v4-mini__value widget-day-score__score',
        style: { fontSize: '21px', ...terracottaStyle }
      },
        scoreOnTen,
        React.createElement('span', { className: 'widget-v4-unit' }, ' / 10')
      )
    );
  }

  function DayScoreWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'dayScore',
      renderBody: (variantId, meta) => React.createElement(DayScoreVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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
    const lineColor = isLipolysis ? '#22c55e' : (color || 'var(--v4-water, #3b82f6)');

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
  function normalizeInsulinWaveVariantId(variantId) {
    if (variantId === 'chart') return 'day_as_is';
    if (variantId === 'compact') return 'day_bar';
    return variantId || 'day_as_is';
  }

  function insulinWaveV4(data) {
    return data?.v4 || data || {};
  }

  function InsulinWaveBaseline({ nowX, height = 52, showNow = true }) {
    const h = height;
    const baseY = h - 6;
    return React.createElement(React.Fragment, null,
      React.createElement('line', {
        x1: 0, y1: baseY, x2: 130, y2: baseY,
        stroke: 'var(--v4-line, rgba(0,0,0,.12))',
        strokeWidth: 1.5
      }),
      showNow && Number.isFinite(nowX) ? React.createElement(React.Fragment, null,
        React.createElement('line', {
          x1: nowX, y1: 9, x2: nowX, y2: baseY,
          stroke: 'var(--v4-sand-ink, #201e1d)',
          strokeWidth: 1,
          strokeDasharray: '2 2.5',
          opacity: 0.45
        }),
        React.createElement('circle', {
          cx: nowX, cy: baseY, r: 2.4,
          fill: 'var(--v4-sand-ink, #201e1d)',
          opacity: 0.55
        })
      ) : null
    );
  }

  /**
   * Пустой день: волн нет, но график есть — ровная базовая линия на том же
   * основании, где стоят волны (строка «волна · пустой день»). Она отличает
   * пустой день от ночной оценки без чтения подписи, поэтому пустого места
   * вместо рисунка тут быть не должно.
   */
  function InsulinWaveEmptySvg() {
    // Рисунок — полоса вокруг основания, а не вся высота волн: над линией
    // рисовать нечего, а плитке 2×2 продукта не хватает высоты на прочерк с
    // подписью и полный 52-пиксельный холст сразу (у кадра под содержимое 114
    // px, у продуктовой плитки — 106). Отступление названо: линия при этом
    // стоит там же, где основание волн, — под ней те же 6 px, что у холста
    // волн, и обе картинки прижаты к низу одинаково.
    return React.createElement('svg', {
      className: 'widget-v4-wave widget-v4-insulin-wave',
      viewBox: '0 34 130 18',
      width: '100%',
      height: 18,
      style: { overflow: 'visible' },
      'aria-hidden': 'true'
    },
      React.createElement('line', {
        x1: 4, y1: 46, x2: 126, y2: 46,
        className: 'widget-v4-insulin-wave__flatline',
        strokeWidth: 1.2,
        strokeLinecap: 'round'
      })
    );
  }

  function InsulinWaveDaySvg({ v4, height = 52 }) {
    // Схема, а не таймлайн: волны вплотную и равной ширины, оси времени и метки
    // «сейчас» здесь нет (контракт, строка «волна · схема, а не таймлайн»).
    const scheme = v4.scheme || { figures: [], dividers: [], joints: [], overlaps: [] };
    const baseY = 46;
    // Ночная оценка: геометрия та же, но силуэт приглушён и обведён чернилами,
    // а не акцентом. Тёплой метки нахлёста здесь нет вовсе — в этом состоянии
    // плитка не красится по роли (строка «волна · тон в ночной оценке»).
    const overnight = v4.isOvernight === true;

    if (overnight) {
      return React.createElement('svg', {
        className: 'widget-v4-wave widget-v4-insulin-wave widget-v4-insulin-wave--overnight',
        viewBox: `0 0 130 ${height}`,
        width: '100%',
        height,
        style: { overflow: 'visible' },
        'aria-hidden': 'true'
      },
        scheme.figures.map((figure) => React.createElement('path', {
          key: `on-fill-${figure.id}`,
          className: 'widget-v4-insulin-wave__fill',
          d: figure.d
        })),
        scheme.figures.map((figure) => React.createElement('path', {
          key: `on-line-${figure.id}`,
          className: 'widget-v4-insulin-wave__overnight-stroke',
          d: figure.openD || figure.d,
          fill: 'none',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        }))
      );
    }

    return React.createElement('svg', {
      className: 'widget-v4-wave widget-v4-insulin-wave widget-v4-insulin-wave--day',
      viewBox: `0 0 130 ${height}`,
      width: '100%',
      height,
      style: { overflow: 'visible' },
      'aria-hidden': 'true'
    },
      // Нахлёст заливается ровно внутри своей фигуры — отсюда clipPath.
      scheme.overlaps.length
        ? React.createElement('defs', null,
          scheme.overlaps.map((band) => React.createElement('clipPath', { key: band.clipId, id: band.clipId },
            React.createElement('path', { d: band.figureD })
          ))
        )
        : null,

      scheme.figures.map((figure) => React.createElement('path', {
        key: figure.id,
        className: 'widget-v4-insulin-wave__fill',
        d: figure.d,
        opacity: figure.opacity
      })),

      // Базовая линия остаётся только в схеме: по ней стоят риски-разделители.
      React.createElement('line', {
        x1: 0, y1: baseY, x2: 130, y2: baseY,
        stroke: 'var(--v4-line, rgba(0,0,0,.12))',
        strokeWidth: 1.5
      }),

      scheme.dividers.map((x) => React.createElement('line', {
        key: `div_${x}`,
        x1: x, y1: baseY, x2: x, y2: baseY - 3.5,
        stroke: 'var(--v4-line, rgba(0,0,0,.12))',
        strokeWidth: 1
      })),

      // Стык подписи не имеет — только точка в провале нейтральным тоном.
      scheme.joints.map((joint, index) => React.createElement('circle', {
        key: `joint_${index}`,
        cx: joint.x, cy: joint.y, r: 2.2,
        className: 'widget-v4-insulin-wave__joint'
      })),

      scheme.overlaps.map((band) => React.createElement(React.Fragment, { key: band.clipId },
        React.createElement('g', { clipPath: `url(#${band.clipId})` },
          React.createElement('rect', {
            x: band.x, y: 0, width: band.width, height: baseY,
            className: 'widget-v4-insulin-wave__overlap',
            opacity: 0.5
          })
        ),
        React.createElement('line', {
          x1: band.x, y1: band.braceY, x2: band.x + band.width, y2: band.braceY,
          className: 'widget-v4-insulin-wave__brace',
          strokeWidth: 2.4,
          strokeLinecap: 'round'
        })
      ))
    );
  }

  function InsulinWaveCurrentSvg({ v4, height = 48, overnight = false }) {
    const baseY = height - 6;
    const nowX = v4.activeNowX ?? v4.nowX;
    const markerY = 26;
    return React.createElement('svg', {
      className: 'widget-v4-wave widget-v4-insulin-wave widget-v4-insulin-wave--current'
        + (overnight ? ' widget-v4-insulin-wave--overnight' : ''),
      viewBox: `0 0 130 ${height}`,
      width: '100%',
      height,
      'aria-hidden': 'true'
    },
      v4.activeWavePath
        ? React.createElement('path', {
          className: 'widget-v4-insulin-wave__fill',
          d: v4.activeWavePath,
          opacity: 0.5
        })
        : null,
      // Обводка идёт только по кривой: путь незамкнутый, поэтому низ волны не
      // обводится. Линии основания в этом виде нет — контур сам ограничивает
      // форму, а лишняя линия читается как рамка (строка «волна · базовая линия»).
      v4.activeWaveOpenPath
        ? React.createElement('path', {
          className: 'widget-v4-insulin-wave__stroke',
          d: v4.activeWaveOpenPath,
          fill: 'none',
          strokeWidth: 1.2,
          strokeLinejoin: 'round',
          strokeLinecap: 'round'
        })
        : null,
      v4.activeWavePath && Number.isFinite(nowX)
        ? React.createElement('circle', {
          cx: nowX, cy: markerY, r: 3.2,
          className: 'widget-v4-insulin-wave__dot'
        })
        : null
    );
  }

  function InsulinWaveOverlapSvg({ v4, height = 50, overnight = false }) {
    const pair = Array.isArray(v4.overlapPair) ? v4.overlapPair : [];
    // Заливается ровно та часть, где вторая волна налегла на первую, —
    // пересечение фигур, а не прямоугольник (строка «волна · пересечение»).
    const clipId = 'wave_overlap_clip';
    const braceY = height - 3;

    return React.createElement('svg', {
      className: 'widget-v4-wave widget-v4-insulin-wave widget-v4-insulin-wave--overlap'
        + (overnight ? ' widget-v4-insulin-wave--overnight' : ''),
      viewBox: `0 0 130 ${height}`,
      width: '100%',
      height,
      style: { overflow: 'visible' },
      'aria-hidden': 'true'
    },
      pair.length >= 2
        ? React.createElement('defs', null,
          React.createElement('clipPath', { id: clipId },
            React.createElement('path', { d: pair[0].pathD })
          )
        )
        : null,

      pair.map((w) => React.createElement('path', {
        key: w.id || w.pathD,
        className: 'widget-v4-insulin-wave__fill',
        d: w.pathD,
        opacity: 0.45
      })),

      // Пересечение: вторая фигура, обрезанная первой.
      pair.length >= 2
        ? React.createElement('g', { clipPath: `url(#${clipId})` },
          React.createElement('path', {
            d: pair[1].pathD,
            className: 'widget-v4-insulin-wave__overlap',
            opacity: 0.55
          })
        )
        : null,

      // Линии основания в этом виде нет: обводка идёт только по кривой.
      pair.map((w) => React.createElement('path', {
        key: `stroke_${w.id || w.pathD}`,
        className: 'widget-v4-insulin-wave__stroke',
        d: w.openD || w.pathD,
        fill: 'none',
        strokeWidth: 1.2,
        strokeLinejoin: 'round',
        strokeLinecap: 'round'
      })),

      pair.length >= 2
        ? React.createElement('line', {
          x1: 130 * 0.28, y1: braceY, x2: 130 * 0.72, y2: braceY,
          className: 'widget-v4-insulin-wave__brace',
          strokeWidth: 2.4,
          strokeLinecap: 'round'
        })
        : null
    );
  }

  function InsulinWaveDayBar({ v4 }) {
    const bar = v4.dayBar || {};
    const segments = Array.isArray(bar.segments) ? bar.segments : [];
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'widget-v4-insulin-daybar' },
        segments.map((seg, index) => React.createElement('span', {
          key: `ins-bar-${index}`,
          className: 'widget-v4-insulin-daybar__seg'
            + (seg.elevated ? ' widget-v4-insulin-daybar__seg--up' : '')
            + (seg.now ? ' widget-v4-insulin-daybar__seg--now' : ''),
          style: { flex: seg.flex || 1 }
        }))
      ),
      React.createElement('div', { className: 'widget-v4-insulin-daybar__labels' },
        React.createElement('span', null, bar.dayStartLabel || '7:10'),
        React.createElement('span', null, bar.nowLabel || 'сейчас'),
        React.createElement('span', null, bar.dayEndLabel || '23:00')
      )
    );
  }

  function InsulinWaveVariantBody({ variantId, widget, data, meta = {} }) {
    variantId = normalizeInsulinWaveVariantId(variantId);
    const v4 = insulinWaveV4(data);
    const hasData = data?.hasData ?? false;
    const status = data?.status || 'noData';
    const remaining = data?.remaining || 0;
    const isLipolysis = data?.isLipolysis ?? (status === 'complete');

    if (!hasData) {
      // Пустой день рисуется своим кадром, а не общим прочерком: вместо силуэта
      // ровная базовая линия, вместо числа прочерк с подписью «приёмов не
      // было», снизу покой от подъёма. Счётчика в углу нет, и данные прошлого
      // дня сюда не подставляются (строка «волна · пустой день»).
      //
      // Загрузка и ошибка расчёта пустым днём не притворяются: «приёмов не
      // было» — утверждение о дне, а не о том, что данные ещё не пришли.
      if (variantId === 'day_as_is' && status === 'noData') {
        const V4mod = HEYS.Widgets.InsulinWaveV4;
        const wokeLabel = v4.emptyStateLabel || V4mod?.restFromWakeLabel?.() || '';
        const restHours = V4mod?.restHoursFromWake?.() ?? 0;
        const spoken = `Инсулиновая волна, приёмов не было, покой ${V4mod?.spokenDuration
          ? V4mod.spokenDuration(restHours * 60)
          : `${restHours} ч`} от подъёма`;
        return React.createElement('div', {
          className: 'widget-v4-stack',
          'data-v4-spoken': spoken
        },
          v4Kicker('Инсулиновая волна'),
          React.createElement('div', { className: 'widget-v4-hero-num' },
            React.createElement('span', {
              className: 'widget-v4-hero-num__val widget-v4-val--neutral'
            }, '—'),
            React.createElement('span', { className: 'widget-v4-unit' }, 'приёмов не было')
          ),
          InsulinWaveEmptySvg({}),
          React.createElement('span', {
            className: 'widget-v4-insulin-wave__note'
          }, wokeLabel)
        );
      }
      return v4EmptyTile('Инсулиновая волна');
    }

    // Ночная оценка: сегодня приёмов нет, плитка продолжает вчерашний расчёт.
    // Счётчика приёмов нет вовсе — он про сегодня, и рядом с нулём съеденного в
    // калориях врал бы (строка «волна · ночная оценка»). Тона роли тоже нет.
    const isOvernight = v4.isOvernight === true;
    // Тон роли в ночной оценке снят целиком: шалфей за длинное окно покоя
    // похвалил бы человека за то, что он спал (строка «волна · тон в ночной
    // оценке»).
    const toneClass = isOvernight
      ? v4ValueStateClass('neutral')
      : v4ValueStateClass(v4InsulinWaveState(v4));
    // Кадр ночной оценки нарисован для 2×2; в остальных видах на подпись
    // остаётся один слот, поэтому источник назван коротко теми же словами,
    // что во второй строке 2×2.
    const overnightMark = isOvernight
      ? (HEYS.Widgets.InsulinWaveV4?.OVERNIGHT_SOURCE || 'от вчерашнего')
      : null;

    if (variantId === 'calm_window') {
      return React.createElement('div', { className: 'widget-v4-mini' },
        v4Kicker('Покой'),
        React.createElement('span', {
          className: 'widget-v4-mini__value ' + toneClass
        }, v4.calmWindowLabel || '—'),
        // Кадр ставит «вверх на всё свободное» самому числу, а подпись кладёт
        // прямо под ним подписью единицы. Прежний второй marginTop:auto
        // разводил их по разным краям плитки, а вес подвала (700) делал
        // подпись громче числа.
        React.createElement('span', { className: 'widget-v4-unit' },
          overnightMark || 'без волн')
      );
    }

    if (variantId === 'day_bar') {
      return React.createElement('div', { className: 'widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Инсулин · под волной'),
          React.createElement('span', { className: 'widget-v4-row__meta' },
            overnightMark || v4.elevatedMeta || '—')
        ),
        InsulinWaveDayBar({ v4 })
      );
    }

    if (variantId === 'current_wave') {
      const mins = remaining > 0 ? Math.round(remaining) : 0;
      return React.createElement('div', { className: 'widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Идёт волна'),
          React.createElement('span', { className: 'widget-v4-row__meta' },
            overnightMark || v4.currentMealMeta || '')
        ),
        React.createElement('div', { className: 'widget-v4-hero-num' },
          React.createElement('span', {
            className: 'widget-v4-hero-num__val ' + toneClass
          }, mins || '—'),
          React.createElement('span', { className: 'widget-v4-unit' }, mins ? 'мин до спада' : '')
        ),
        InsulinWaveCurrentSvg({ v4, overnight: isOvernight })
      );
    }

    if (variantId === 'overlaps') {
      return React.createElement('div', { className: 'widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Пересечение волн'),
          React.createElement('span', { className: 'widget-v4-row__meta' },
            overnightMark || v4.overlapTimeLabel || '')
        ),
        React.createElement('div', { className: 'widget-v4-hero-num' },
          React.createElement('span', {
            className: 'widget-v4-hero-num__val ' + toneClass
          }, v4.overlapHoursLabel || '—'),
          React.createElement('span', { className: 'widget-v4-unit' }, 'без перерыва')
        ),
        InsulinWaveOverlapSvg({ v4, overnight: isOvernight }),
        // Подпись под рисунком у вида «Пересечения» своя: кадр даёт ей 9 px/600
        // и отступ 7px, тогда как .widget-v4-muted — это 10 px/700 подвалов.
        React.createElement('span', {
          className: 'widget-v4-insulin-wave__overlap-note'
        }, 'второй приём попал в волну')
      );
    }

    // day_as_is · ночная оценка — третье состояние плитки. Счётчика в углу нет,
    // силуэт приглушён, снизу две подписи: чей это день и сколько покоя.
    if (isOvernight) {
      return React.createElement('div', {
        className: 'widget-v4-stack',
        'data-v4-spoken': v4.overnightSpoken || undefined
      },
        v4Kicker('Инсулиновая волна'),
        InsulinWaveDaySvg({ v4 }),
        React.createElement('span', { className: 'widget-v4-insulin-wave__note' },
          v4.overnightNote || ''),
        React.createElement('span', {
          className: 'widget-v4-insulin-wave__note widget-v4-insulin-wave__note--next'
        }, v4.overnightStateLabel || '')
      );
    }

    // day_as_is — дефолт 2×2
    const mealLabel = v4.mealCountLabel || (v4.mealCount ? `${v4.mealCount} приёма` : '—');
    const overlapLabel = v4.overlapCountLabel;
    // Строка снизу называет время конца текущей волны, а когда все закрыты —
    // покой (строка «волна · текущая»). Пустой день говорит про подъём.
    const stateLabel = v4.hasMeals === false
      ? (v4.emptyStateLabel || '')
      : (v4.underWaveLabel || '');
    // Строка «волна · счётчик приёмов» (переписана дизайнером 31 августа):
    // счётчик стоит под графиком, а не в углу плитки — угол занимает кружок
    // удаления в режиме расстановки, и два элемента в одной точке спорят за
    // касание. Слева счётчик тоном состояния, справа — конец текущей волны или
    // счётчик стыков; слова состояния кадр под графиком не рисует.
    return React.createElement('div', { className: 'widget-v4-stack' },
      v4Kicker('Инсулиновая волна'),
      InsulinWaveDaySvg({ v4 }),
      React.createElement('div', { className: 'widget-v4-stack__footer widget-v4-insulin-wave__footer' },
        React.createElement('span', { className: toneClass }, overlapLabel || mealLabel),
        React.createElement('span', { className: 'widget-v4-muted' },
          // Стыки в дне есть — справа стоит их счётчик, иначе строка состояния.
          v4.jointCountLabel || stateLabel || '—')
      )
    );
  }

  // InsulinWaveOvernightContent и InsulinWavePastDayContent удалены 2026-08-09:
  // ветки диспетчеризации на них вырезаны ещё в 95d64c042 вместе с
  // формулировками про жиросжигание, а поля, которые они читали
  // (lipolysisMinutes, lipolysisRecord, fatBurning*), не производит никто —
  // вернуть их как есть значило бы показать «Низкая волна / 0м» вместо
  // нынешней корректной карточки «Окно завершено».

  function InsulinWaveWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'insulinWave',
      renderBody: (variantId, meta) => React.createElement(InsulinWaveVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
  }

  // === Health Trend Widget Content (Тренд здоровья 0-100 из инсайтов) ===
  function normalizeHealthSparkPoints(value) {
    if (typeof value !== 'string') return '';
    const points = value.trim();
    if (!points) return '';
    const pairs = points.split(/\s+/).map((pair) => pair.split(',').map(Number));
    if (pairs.length < 2 || pairs.some((pair) => pair.length !== 2 || pair.some((n) => !Number.isFinite(n)))) {
      return '';
    }
    return points;
  }

  /**
   * Точки линии тренда строятся здесь, а не в данных: у 2×1 и 2×2 разные
   * viewBox (58×24 против 130×40), и одна заготовка на оба вида нарисовала бы
   * в большем крошечную линию в углу. Данные отдают сами оценки, проекцию
   * делает тот вид, который рисует.
   *
   * Шкала своя у каждой плитки — от минимума к максимуму окна, а не от нуля:
   * оценки здоровья держатся в узком коридоре, и от нуля линия была бы
   * прямой.
   */
  function healthSparkGeometry(values, box) {
    const nums = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    if (nums.length < 2 || !box) return null;
    const { left, right, top, bottom, dotR } = box;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    const round = (n) => Math.round(n * 100) / 100;
    const points = nums.map((value, index) => [
      round(left + ((right - left) * index) / (nums.length - 1)),
      round(bottom - (bottom - top) * ((value - min) / span)),
    ]);
    const last = points[points.length - 1];
    return {
      points: points.map((point) => point.join(',')).join(' '),
      last: { x: last[0], y: last[1], r: dotR },
    };
  }

  // Коробки линии сняты с кадров, а не выведены из viewBox: у 2×1 линия идёт
  // от x=2 до x=56 при высоте поля 4…18, у 2×2 её держит радиус точки.
  const HEALTH_SPARK_BOX_COMPACT = { left: 2, right: 56, top: 4, bottom: 18, dotR: 3.5 };
  const HEALTH_SPARK_BOX_LARGE = { left: 3.5, right: 126.5, top: 3.5, bottom: 36.5, dotR: 3.5 };

  function HealthTrendVariantBody({ variantId, widget, data, meta = {} }) {
    const score = data?.score ?? 0;
    const hasData = data?.hasData ?? false;
    const periodDays = widget?.settings?.periodDays ?? data?.periodDays ?? 14;
    const daysWithData = data?.daysWithData ?? 0;

    const d = getWidgetDims(widget);
    const isShort = d.isShort; // 2x1
    const healthTrendRevealed = useWidgetV4HealthTrendReveal();

    if (!hasData) {
      return v4EmptyTile(
        `Тренд здоровья · ${formatRuUnit(periodDays, 'дней')}`,
        daysWithData < 3 ? 'нужно 3 дня' : null
      );
    }

    // === 2×1 «Компакт» — канвас: kicker «Тренд · N дней», дельта и мини-линия ===
    if (isShort || variantId === 'compact') {
      const compactDelta = Number(data?.delta);
      const compactSpark = data?.sparkline || null;
      // Готовые points приходят только со стенда; продукт отдаёт values.
      const compactGeom = healthSparkGeometry(compactSpark?.values, HEALTH_SPARK_BOX_COMPACT);
      const compactSparkPoints = normalizeHealthSparkPoints(
        compactGeom ? compactGeom.points : compactSpark?.points
      );
      const compactSparkLast = compactGeom
        ? compactGeom.last
        : (Number.isFinite(Number(compactSpark?.last?.x))
          && Number.isFinite(Number(compactSpark?.last?.y))
          ? compactSpark.last
          : null);
      const compactHero = Number.isFinite(compactDelta)
        ? `${compactDelta > 0 ? '+' : (compactDelta < 0 ? '−' : '')}${formatRuNumber(Math.abs(Math.round(compactDelta)))}`
        : formatRuNumber(Math.round(score));
      const compactState = v4HealthTrendState(compactDelta);
      const compactTone = v4ValueStateClass(compactState);
      return React.createElement('div', { className: 'widget-v4-stack widget-trend-compact' },
        v4Kicker(`Тренд здоровья · ${formatRuUnit(periodDays, 'дней')}`),
        React.createElement('div', { className: 'widget-trend-compact__row' },
          React.createElement('span', {
            className: 'widget-trend-compact__value ' + compactTone
          }, compactHero),
          compactSparkPoints ? React.createElement('svg', {
            className: 'widget-trend-compact__spark ' + v4HealthTrendSparkClass(compactState),
            viewBox: '0 0 58 24',
            width: 58,
            height: 24,
            fill: 'none',
            'aria-hidden': 'true'
          },
            React.createElement('polyline', {
              points: compactSparkPoints,
              stroke: 'currentColor',
              strokeWidth: compactSpark.strokeWidth || 2.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }),
            // Точка на последнем дне: кадр ставит её у всех спарклайнов —
            // и у веса, и у динамики. Здесь линия обрывалась без неё, и
            // «сегодня» на ней не читалось.
            compactSparkLast ? React.createElement('circle', {
              cx: compactSparkLast.x,
              cy: compactSparkLast.y,
              r: compactSparkLast.r || 2.4,
              fill: 'currentColor'
            }) : null
          ) : null
        )
      );
    }

    // === 2×2 — канвас g1: kicker + число + «за N дней» + линия тренда
    // Строка «вид · тренд здоровья»: последняя точка кругом радиусом 3,5.
    const trendGeom = healthSparkGeometry(data?.sparkline?.values, HEALTH_SPARK_BOX_LARGE);
    const trendPts = normalizeHealthSparkPoints(
      trendGeom ? trendGeom.points : data?.sparkline?.points
    );
    const lastPt = trendGeom
      ? [trendGeom.last.x, trendGeom.last.y]
      : (trendPts ? trendPts.split(' ').pop().split(',') : null);
    const delta = Number(data?.delta);
    const hero = Number.isFinite(delta)
      ? `${delta > 0 ? '+' : (delta < 0 ? '−' : '')}${formatRuNumber(Math.abs(Math.round(delta)))}`
      : formatRuNumber(Math.round(score));
    if (!healthTrendRevealed) {
      return React.createElement('div', {
        className: 'widget-v4-stack widget-v4-stack--spark-hold',
        'aria-hidden': 'true'
      });
    }
    return React.createElement('div', { className: 'widget-v4-stack' },
      v4Kicker('Тренд здоровья'),
      React.createElement('div', { className: 'widget-v4-hero-num' },
        React.createElement('span', {
          className: 'widget-v4-hero-num__val ' + v4ValueStateClass(v4HealthTrendState(delta))
        }, hero),
        React.createElement('span', { className: 'widget-v4-unit' }, `за ${formatRuUnit(periodDays, 'дней')}`)
      ),
      trendPts ? React.createElement(WidgetV4DrawSparkSvg, {
        className: 'widget-v4-spark ' + v4HealthTrendSparkClass(v4HealthTrendState(delta)),
        viewBox: '0 0 130 40',
        height: 40,
        points: trendPts,
        dotCx: Number(lastPt[0]),
        dotCy: Number(lastPt[1])
      }) : null
    );
  }

  function HealthTrendWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'healthTrend',
      renderBody: (variantId, meta) => React.createElement(HealthTrendVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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

    const getColor = () => widgetHealthScoreColor(score);

    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-day-score widget-day-score--micro' },
        React.createElement('div', {
          className: 'widget-day-score__score',
          style: { color: getColor(), fontSize: '1.5rem', fontWeight: 700 }
        }, formatRuNumber(Math.round(score)))
      );
    }

    return React.createElement('div', { className: 'widget-day-score widget-day-score--standard' },
      React.createElement('div', {
        className: 'widget-day-score__score-big',
        style: { color: getColor(), fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }
      }, formatRuNumber(Math.round(score))),
      React.createElement('div', {
        className: 'widget-day-score__label',
        style: { fontSize: '0.75rem', color: 'var(--heys-text-secondary, #94a3b8)', marginTop: '2px' }
      }, level.label || 'Статус')
    );
  }

  // === Widget value motion ==================================================
  // Числа, полосы и кольца виджетов меняются не скачком, а интерполяцией к
  // новому значению. При открытии вкладки виджетов — от нуля (intro); при смене
  // дня и записи еды — от текущего отображаемого значения.
  // useWidgetMotionValues анимирует вектор значений одним rAF-циклом, чтобы три
  // кольца БЖУ не давали три setState на кадр.
  const WIDGET_MOTION_MS = 1100;
  const WIDGET_MOTION_INTRO_FACTOR = 2;
  const WIDGET_MOTION_INTRO_MS = WIDGET_MOTION_MS * WIDGET_MOTION_INTRO_FACTOR;
  const WIDGET_MOTION_EASE_CSS = 'cubic-bezier(0.65, 0, 0.35, 1)';

  // easeInOutCubic — мягкий разгон и мягкая остановка, ход стрелки спидометра.
  function widgetMotionEase(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Строки «без анимации» и «меньше движения» (канвас home-widgets): при
  // системной настройке новая раскладка появляется сразу и значения стоят на
  // месте. Числа, кольца и полосы интерполируются здесь, в JS, поэтому CSS их
  // не останавливает — решение принимается в этой функции. Раньше она звала
  // functionalAnimationsEnabled(), который по контракту всегда true, то есть
  // не возвращала true никогда.
  function widgetMotionDisabled() {
    const policy = (typeof HEYS !== 'undefined') ? HEYS.motion : null;
    if (policy && typeof policy.prefersReducedMotion === 'function') {
      return policy.prefersReducedMotion();
    }
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_e) {
      return false;
    }
  }

  // Состояние анимации в модульном store, а не в useState виджета: при смене дня
  // дерево может пересобраться, а кольцо/число должны ехать от того, что было на экране.
  const _widgetMotionChannels = new Map();
  const MOTION_TICK_MS = 32;
  let _widgetMotionTimer = 0;
  let _widgetMotionIntroArmed = false;
  let _widgetIntroSlowActive = false;
  // Intro вкладки виджетов: один раз за жизнь вкладки браузера (sessionStorage переживает
  // reload); не при возврате с другой вкладки; смена дня — без intro.
  const WIDGET_TAB_INTRO_SESSION_KEY = 'heys_widgets_tab_intro_v1';
  const WIDGET_TAB_INTRO_REVEAL_DELAY_MS = 120;
  let _widgetMotionSessionIntroConsumed = false;
  let _widgetMotionLastWidgetsClientId = null;

  function widgetMotionHasSeenTabIntro() {
    try {
      return sessionStorage.getItem(WIDGET_TAB_INTRO_SESSION_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  try {
    _widgetMotionSessionIntroConsumed = widgetMotionHasSeenTabIntro();
  } catch (e) { /* noop */ }

  function widgetMotionShouldPlayTabIntro(clientId) {
    const cid = clientId != null ? String(clientId) : '';
    if (cid && _widgetMotionLastWidgetsClientId && _widgetMotionLastWidgetsClientId !== cid) {
      return true;
    }
    if (_widgetMotionSessionIntroConsumed || widgetMotionHasSeenTabIntro()) return false;
    return true;
  }

  function widgetMotionMarkTabIntroPlayed(clientId) {
    _widgetMotionSessionIntroConsumed = true;
    try {
      sessionStorage.setItem(WIDGET_TAB_INTRO_SESSION_KEY, '1');
    } catch (e) { /* noop */ }
    if (clientId != null) _widgetMotionLastWidgetsClientId = String(clientId);
  }

  function widgetMotionIsElementVisiblyBlocking(el) {
    if (!el) return false;
    try {
      if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
        return false;
      }
    } catch (e) { /* noop */ }
    return true;
  }

  function widgetMotionIsNodeVisible(el) {
    if (!el || !el.isConnected) return false;
    let node = el;
    while (node && node !== document.body) {
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return false;
      try {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.opacity !== '' && Number(style.opacity) === 0) return false;
      } catch (e) { /* noop */ }
      node = node.parentElement;
    }
    try {
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    } catch (e) {
      return false;
    }
  }

  function widgetMotionHasBootSpinner() {
    try {
      const selectors = [
        '.heys-boot-mark',
        '[data-heys-boot-mark]',
        '.heys-skeleton',
        '#heys-login-gate[data-visible="true"]'
      ];
      const nodes = document.querySelectorAll(selectors.join(','));
      return Array.from(nodes).some(widgetMotionIsNodeVisible);
    } catch (e) {
      return false;
    }
  }

  function widgetMotionHasBlockingOverlay() {
    try {
      if (typeof document === 'undefined' || document.hidden) return true;
      const checkinStatus = HEYS.MorningCheckinDebug?.getStatus?.();
      if (checkinStatus && checkinStatus.sessionDone !== true
        && ['open', 'in_progress', 'failed'].includes(checkinStatus.state)) {
        return true;
      }
      const openModals = HEYS.ModalManager?.getOpenModals?.() || [];
      if (openModals.some((modalId) => modalId !== 'hunger-energy-status-modal')) {
        return true;
      }
      const selectors = [
        '.ca-modal-backdrop--visible',
        '.whats-new-modal',
        '.whats-new-backdrop',
        '.tour-welcome-modal',
        '.heys-consent-sign-backdrop',
        '.consent-fulltext-backdrop',
        '#heys-morning-activation-modal-root',
        '#heys-step-modal-root [data-heys-step-modal="true"]',
        '.widget-wd-sheet__blocker'
      ];
      const nodes = document.querySelectorAll(selectors.join(','));
      return Array.from(nodes).some(widgetMotionIsElementVisiblyBlocking);
    } catch (e) {
      return false;
    }
  }

  function widgetMotionCanStartTabIntro(containerEl) {
    if (typeof document === 'undefined' || document.hidden) return false;
    if (!containerEl || !containerEl.isConnected) return false;
    if (!widgetMotionIsNodeVisible(containerEl)) return false;
    if (widgetMotionHasBootSpinner()) return false;
    if (widgetMotionHasBlockingOverlay()) return false;
    const grid = containerEl.querySelector?.('.widgets-grid');
    if (!grid || !widgetMotionIsNodeVisible(grid)) return false;
    return true;
  }

  function widgetMotionPrepareTabIntroStart() {
    widgetMotionArmIntroFromZero();
    _widgetMotionChannels.forEach((ch, motionId) => {
      if (!widgetMotionShouldIntroFromZero(motionId)) return;
      delete ch.introSeeded;
      ch.display = 0;
      ch.start = 0;
      ch.active = false;
      ch.startTs = -1;
    });
    _widgetMotionChannels.forEach(_widgetMotionNotify);
  }

  function widgetMotionIntroDuration(ms) {
    return _widgetIntroSlowActive ? ms * WIDGET_MOTION_INTRO_FACTOR : ms;
  }

  function widgetMotionIsIntroSlow() {
    return _widgetIntroSlowActive;
  }

  function widgetMotionEndIntroSlow() {
    _widgetIntroSlowActive = false;
  }

  function widgetMotionShouldIntroFromZero(motionId) {
    // Нормы/цель ккал — сразу: иначе value и target едут от 0 синхронно
    // и дуга кольца/полоса уже на финальном проценте.
    if (/(^|:)t:\d+$/.test(motionId)) return false;
    if (/(^|:)target(:\d+)?$/.test(motionId)) return false;
    return true;
  }

  function widgetMotionArmIntroFromZero() {
    _widgetMotionIntroArmed = true;
    _widgetIntroSlowActive = true;
    _widgetMotionChannels.forEach((ch) => { delete ch.introSeeded; });
  }

  function widgetMotionDisarmIntro() {
    _widgetMotionIntroArmed = false;
    _widgetMotionChannels.forEach((ch) => { delete ch.introSeeded; });
  }

  // Цепочка intro: спарклайн «Вес» 2×2 → сразу «Тренд здоровья» 2×2
  let _widgetV4SparkSeqArmed = false;
  let _widgetV4WeightSparkMounted = false;
  let _widgetV4WeightSparkDone = false;
  const _widgetV4SparkDoneListeners = new Set();

  function widgetV4ArmSparkSequence() {
    _widgetV4SparkSeqArmed = true;
    _widgetV4WeightSparkMounted = false;
    _widgetV4WeightSparkDone = false;
  }

  function widgetV4DisarmSparkSequence() {
    _widgetV4SparkSeqArmed = false;
    if (!_widgetV4WeightSparkDone) {
      _widgetV4WeightSparkDone = true;
      _widgetV4SparkDoneListeners.forEach((fn) => fn());
    }
  }

  function widgetV4ShouldAnimateSparkDraw() {
    return _widgetV4SparkSeqArmed;
  }

  function widgetV4RegisterWeightSparkWidget() {
    _widgetV4WeightSparkMounted = true;
  }

  function widgetV4NotifyWeightSparkDrawComplete() {
    if (_widgetV4WeightSparkDone) return;
    _widgetV4WeightSparkDone = true;
    _widgetV4SparkDoneListeners.forEach((fn) => fn());
  }

  function useWidgetV4HealthTrendReveal() {
    const initial = !_widgetV4SparkSeqArmed
      || _widgetV4WeightSparkDone
      || !_widgetV4WeightSparkMounted;
    const [revealed, setRevealed] = React.useState(initial);

    React.useEffect(() => {
      if (!_widgetV4SparkSeqArmed || _widgetV4WeightSparkDone) {
        setRevealed(true);
        return undefined;
      }
      const bump = () => setRevealed(true);
      _widgetV4SparkDoneListeners.add(bump);
      const probe = window.setTimeout(() => {
        if (!_widgetV4WeightSparkMounted) setRevealed(true);
      }, 80);
      return () => {
        _widgetV4SparkDoneListeners.delete(bump);
        clearTimeout(probe);
      };
    }, []);

    return revealed;
  }

  function widgetMotionSeedIntroChannel(ch, tgt, duration, quantize) {
    ch.display = 0;
    ch.start = 0;
    ch.target = tgt;
    ch.duration = duration;
    ch.quantize = quantize;
    ch.startTs = -1;
    ch.active = true;
    ch.introSeeded = true;
  }

  function _widgetMotionStopLoop() {
    if (_widgetMotionTimer) {
      clearInterval(_widgetMotionTimer);
      _widgetMotionTimer = 0;
    }
  }

  function _widgetMotionStartLoop() {
    if (_widgetMotionTimer) return;
    _widgetMotionTimer = setInterval(() => {
      _widgetMotionTick(typeof performance !== 'undefined' ? performance.now() : Date.now());
    }, MOTION_TICK_MS);
  }

  function _widgetMotionNotify(ch) {
    ch.listeners.forEach((fn) => {
      try { fn(); } catch (e) { /* no-op */ }
    });
  }

  function _widgetMotionTick(ts) {
    let anyActive = false;
    const notify = [];
    _widgetMotionChannels.forEach((ch) => {
      if (!ch.active) return;
      if (ch.startTs < 0) ch.startTs = ts;
      const t = Math.min(1, (ts - ch.startTs) / ch.duration);
      if (t >= 1) {
        ch.display = ch.target;
        ch.active = false;
        notify.push(ch);
      } else {
        anyActive = true;
        const k = widgetMotionEase(t);
        let next = ch.start + (ch.target - ch.start) * k;
        if (ch.quantize > 0) next = Math.round(next / ch.quantize) * ch.quantize;
        ch.display = next;
        notify.push(ch);
      }
    });
    notify.forEach(_widgetMotionNotify);
    if (anyActive) {
      _widgetMotionStartLoop();
    } else {
      _widgetMotionStopLoop();
    }
  }

  function widgetMotionEnsureChannel(motionId, target, options = {}) {
    const duration = options.duration ?? WIDGET_MOTION_MS;
    const quantize = options.quantize ?? 0;
    const tgt = Number.isFinite(Number(target)) ? Number(target) : 0;
    let ch = _widgetMotionChannels.get(motionId);
    if (_widgetMotionIntroArmed && !widgetMotionDisabled() && duration > 0) {
      if (!widgetMotionShouldIntroFromZero(motionId)) {
        if (!ch) {
          ch = {
            display: tgt,
            target: tgt,
            start: tgt,
            startTs: -1,
            duration,
            quantize,
            active: false,
            listeners: new Set()
          };
          _widgetMotionChannels.set(motionId, ch);
        } else {
          ch.display = tgt;
          ch.target = tgt;
          ch.start = tgt;
          ch.active = false;
        }
        return ch.display;
      }
      if (!ch || !ch.introSeeded) {
        if (!ch) {
          ch = {
            display: 0,
            target: tgt,
            start: 0,
            startTs: -1,
            duration,
            quantize,
            active: false,
            listeners: new Set()
          };
          _widgetMotionChannels.set(motionId, ch);
        }
        widgetMotionSeedIntroChannel(ch, tgt, widgetMotionIntroDuration(duration), quantize);
        _widgetMotionStartLoop();
        _widgetMotionTick(typeof performance !== 'undefined' ? performance.now() : Date.now());
        return ch.display;
      }
    }
    if (!ch) {
      ch = {
        display: tgt,
        target: tgt,
        start: tgt,
        startTs: -1,
        duration,
        quantize,
        active: false,
        listeners: new Set()
      };
      _widgetMotionChannels.set(motionId, ch);
      return ch.display;
    }
    if (Math.abs(ch.target - tgt) < 0.01) {
      if (ch.active) return ch.display;
      if (Math.abs(ch.display - tgt) < 0.01) {
        ch.display = tgt;
        ch.target = tgt;
      }
      return ch.display;
    }
    if (duration <= 0 || widgetMotionDisabled()) {
      ch.display = tgt;
      ch.target = tgt;
      ch.active = false;
      _widgetMotionNotify(ch);
      return ch.display;
    }
    ch.start = ch.display;
    ch.target = tgt;
    ch.duration = duration;
    ch.quantize = quantize;
    ch.startTs = -1;
    ch.active = true;
    _widgetMotionStartLoop();
    _widgetMotionTick(typeof performance !== 'undefined' ? performance.now() : Date.now());
    return ch.display;
  }

  function useWidgetMotionValues(targets, options = {}) {
    const {
      motionIdPrefix = 'vec',
      duration = WIDGET_MOTION_MS,
      quantize = 0
    } = options;
    const nums = targets.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    const ids = nums.map((_, i) => `${motionIdPrefix}:${i}`);
    const bump = React.useReducer((n) => n + 1, 0)[1];

    React.useLayoutEffect(() => {
      const unsub = ids.map((id) => {
        const ch = _widgetMotionChannels.get(id) || { listeners: new Set() };
        ch.listeners.add(bump);
        _widgetMotionChannels.set(id, ch);
        if (ch.active) bump();
        return () => ch.listeners.delete(bump);
      });
      return () => unsub.forEach((fn) => fn());
    }, [motionIdPrefix, nums.length, bump]);

    return nums.map((n, i) => widgetMotionEnsureChannel(ids[i], n, { duration, quantize }));
  }

  function useWidgetMotionValue(target, options = {}) {
    const {
      motionId = 'scalar',
      duration = WIDGET_MOTION_MS,
      quantize = 0
    } = options;
    const bump = React.useReducer((n) => n + 1, 0)[1];

    React.useLayoutEffect(() => {
      const ch = _widgetMotionChannels.get(motionId) || { listeners: new Set() };
      ch.listeners.add(bump);
      _widgetMotionChannels.set(motionId, ch);
      if (ch.active) bump();
      return () => ch.listeners.delete(bump);
    }, [motionId, bump]);

    return widgetMotionEnsureChannel(motionId, target, { duration, quantize });
  }

  // Канвас «Калории · состояние»: число красится, подпись под ним — всегда нейтральная.
  function caloriesFootCol(text, cap, { end = false, tone = 'ink' } = {}) {
    return React.createElement('div', {
      className: 'widget-calories__hero-bar-col' + (end ? ' widget-calories__hero-bar-col--end' : '')
    },
      React.createElement('span', {
        className: 'widget-calories__hero-bar-num widget-calories__hero-bar-num--' + tone
      }, text),
      React.createElement('span', { className: 'widget-calories__hero-bar-cap' }, cap)
    );
  }

  function caloriesHeroBarFoot(left, right) {
    return React.createElement('div', { className: 'widget-calories__hero-bar-foot' },
      caloriesFootCol(left.text, left.cap, { tone: left.tone || 'ink' }),
      caloriesFootCol(right.text, right.cap, { end: true, tone: right.tone || 'ink' })
    );
  }

  // Полоса не растягивается за край: заливка доходит до нормы, превышение идёт
  // красным сегментом — видно и норму, и перебор (канвас, заметка «Перебор
  // красит число, а не плитку»).
  function caloriesHeroBar(fillPct, overPct) {
    return React.createElement('div', { className: 'widget-calories__hero-bar' },
      React.createElement('div', {
        className: 'widget-calories__hero-bar-fill',
        style: { width: `${fillPct}%` }
      }),
      overPct > 0
        ? React.createElement('div', {
          className: 'widget-calories__hero-bar-over',
          style: { left: `${fillPct}%` }
        })
        : null
    );
  }

  // Доли полосы: пока укладываемся — доля съеденного от нормы; при переборе вся
  // ширина это съеденное, а граница нормы стоит там, где норма от него.
  function caloriesBarSplit(eaten, target) {
    if (!(target > 0)) return { fillPct: 0, overPct: 0 };
    if (eaten <= target) {
      return { fillPct: Math.max(0, Math.min(100, (eaten / target) * 100)), overPct: 0 };
    }
    const fillPct = (target / eaten) * 100;
    return { fillPct, overPct: 100 - fillPct };
  }

  function CaloriesVariantBody({ variantId, widget, data, meta = {} }) {
    const eaten = data.eaten || 0;
    const target = data.target || 2000;
    const pct = target > 0 ? Math.round((eaten / target) * 100) : 0;
    const remaining = Math.max(0, target - eaten);
    const activityKcal = data.activityKcal || data.burned || 0;
    const dinnerBudget = data.dinnerBudgetKcal || Math.round(target * 0.28);
    const formatKcal = (value) => formatRuNumber(Math.round(Number(value) || 0));

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isShort ? 'short' : d.isTall ? 'tall' : 'std';

    const getColor = () => {
      if (pct < 50) return 'var(--heys-ratio-crash)';
      if (pct < 75) return 'var(--heys-ratio-low)';
      if (pct < 110) return 'var(--heys-ratio-good)';
      return 'var(--heys-ratio-over)';
    };

    const animTarget = useWidgetMotionValue(target, {
      motionId: `${widget?.id || 'cal'}:target`
    });
    const animEaten = useWidgetMotionValue(eaten, {
      motionId: `${widget?.id || 'cal'}:eaten`,
      quantize: 10
    });
    const animActivity = useWidgetMotionValue(activityKcal, {
      motionId: `${widget?.id || 'cal'}:activity`,
      quantize: 10
    });
    const animPct = animTarget > 0 ? Math.round((animEaten / animTarget) * 100) : 0;
    const animBarPct = animTarget > 0 ? Math.min(100, Math.max(0, (animEaten / animTarget) * 100)) : 0;
    const animRemaining = Math.max(0, animTarget - animEaten);

    if (data?.hasData !== true) {
      // Кадры «Калории · пустой день · 2×2» и «· 2×1». Норма посчитана из
      // профиля и известна с утра, поэтому на пустом дне она видна: прочерк
      // относится только к ФАКТУ (строка «нет данных за день», уточнение
      // 3 сентября). Полоса не рисуется — она носитель факта.
      const emptyTarget = Math.round(Number(target) || 0);
      if (d.cols >= 2 && d.rows >= 2) {
        return React.createElement('div', { className: 'widget-calories widget-calories--2x2 widget-calories--v4-hero widget-calories--empty' },
          React.createElement('div', { className: 'widget-calories__hero-main' },
            React.createElement('div', { className: 'widget-calories__hero-value' },
              React.createElement('div', { className: 'widget-calories__value--lg' }, '—'),
              React.createElement('span', { className: 'widget-calories__hero-unit' }, 'ккал')
            ),
            React.createElement('div', { className: 'widget-calories__hero-remaining-label' }, 'осталось')
          ),
          React.createElement('div', { className: 'widget-calories__hero-bar-wrap' },
            caloriesHeroBarFoot(
              { text: '—', cap: 'съедено' },
              { text: formatKcal(emptyTarget), cap: 'норма', tone: 'good' }
            )
          )
        );
      }
      return React.createElement('div', { className: 'widget-calories widget-calories--2x1 widget-calories--empty widget-v4-stack' },
        v4Kicker('Калории'),
        React.createElement('div', { className: 'widget-calories__empty-row' },
          React.createElement('span', { className: 'widget-calories__empty-dash' }, '—'),
          emptyTarget > 0
            ? React.createElement('span', { className: 'widget-calories__empty-target' }, `из ${formatKcal(emptyTarget)}`)
            : null
        )
      );
    }

    if (variantId === 'activity') {
      const effectiveTarget = animTarget + animActivity;
      const remainingWithActivity = Math.max(0, effectiveTarget - animEaten);
      return React.createElement('div', {
        className: 'widget-calories widget-calories--2x1 widget-calories--v4-line'
      },
        React.createElement('div', { className: 'widget-calories__line-head' },
          React.createElement('span', { className: 'widget-calories__line-value' },
            formatKcal(remainingWithActivity),
            React.createElement('span', { className: 'widget-calories__line-unit' }, 'ккал')
          ),
          animActivity > 0
            ? React.createElement('span', {
              // Кадр даёт прибавке свой кегль и вес — 9px/700 шалфеем, а не
              // 8.5px/500 подписи «осталось» рядом.
              className: 'widget-calories__line-meta widget-calories__line-meta--gain widget-v4-val--good'
            },
              `+${formatKcal(animActivity)} актив`
            )
            : null
        ),
        React.createElement('div', { className: 'widget-calories__activity-foot' },
          `съедено ${formatKcal(animEaten)} из ${formatKcal(effectiveTarget)}`
        )
      );
    }

    if (variantId === 'dinner') {
      const dinnerOk = animRemaining >= dinnerBudget;
      const dinnerGap = Math.max(0, dinnerBudget - animRemaining);
      const dinnerFill = dinnerBudget > 0
        ? Math.max(0, Math.min(100, (animRemaining / dinnerBudget) * 100))
        : 0;
      return React.createElement('div', { className: 'widget-calories widget-calories--2x2 widget-calories--v4-dinner' },
        React.createElement('div', { className: 'widget-calories__hero-value' },
          React.createElement('div', { className: 'widget-calories__value--md' }, formatKcal(animRemaining)),
          React.createElement('span', { className: 'widget-calories__hero-unit' }, 'ккал осталось')
        ),
        React.createElement('div', { className: 'widget-calories__hero-bar-wrap' },
          React.createElement('div', { className: 'widget-calories__dinner-row' },
            React.createElement('span', null, 'обычный ужин'),
            React.createElement('span', { className: 'widget-calories__dinner-budget' }, formatKcal(dinnerBudget))
          ),
          caloriesHeroBar(dinnerFill, dinnerOk ? 0 : 100 - dinnerFill),
          React.createElement('div', {
            className: 'widget-calories__dinner-note'
              + (dinnerOk ? ' widget-v4-val--good' : ' widget-v4-val--bad')
          }, dinnerOk ? 'хватит на ужин' : `не хватит ${formatRuUnit(formatKcal(dinnerGap), 'ккал')}`)
        )
      );
    }

    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-calories widget-calories--micro widget-v4-mini' },
        v4Kicker('Калории'),
        React.createElement('div', {
          className: 'widget-calories__value widget-v4-mini__value',
          style: { color: getColor() }
        },
          formatKcal(animEaten),
          React.createElement('span', { className: 'widget-v4-unit' }, ' ккал')
        )
      );
    }

    if (variantId === 'line' || size === '2x1') {
      const isClosedDay = data.isClosedDay === true;
      const lineOver = !isClosedDay && animEaten > animTarget && animTarget > 0;
      const lineValue = isClosedDay
        ? formatKcal(animEaten)
        : (lineOver ? `−${formatKcal(animEaten - animTarget)}` : formatKcal(animRemaining));
      const lineCap = isClosedDay ? 'съедено за день' : (lineOver ? 'перебор' : 'осталось');
      const lineSplit = caloriesBarSplit(animEaten, animTarget);
      return React.createElement('div', {
        className: 'widget-calories widget-calories--2x1 widget-calories--v4-line'
      },
        React.createElement('div', { className: 'widget-calories__line-head' },
          React.createElement('span', {
            className: 'widget-calories__line-value' + (lineOver ? ' widget-v4-val--bad' : '')
          },
            lineValue,
            React.createElement('span', { className: 'widget-calories__line-unit' }, 'ккал')
          ),
          React.createElement('span', {
            className: 'widget-calories__line-meta' + (lineOver ? ' widget-v4-val--bad' : '')
          }, lineCap)
        ),
        React.createElement('div', { className: 'widget-calories__line-foot' },
          caloriesHeroBar(lineSplit.fillPct, lineSplit.overPct),
          React.createElement('span', { className: 'widget-calories__line-fraction' },
            `${formatKcal(animEaten)} / ${formatKcal(animTarget)}`
          )
        )
      );
    }

    if (variantId === 'hero' || size === '2x2') {
      const hasOver = animEaten > animTarget && animTarget > 0;
      const isClosedDay = data.isClosedDay === true;
      const heroValue = isClosedDay
        ? formatKcal(animEaten)
        : (hasOver ? `−${formatKcal(animEaten - animTarget)}` : formatKcal(animRemaining));
      const heroLabel = isClosedDay
        ? 'съедено за день'
        : (hasOver ? 'перебор' : 'осталось');
      const split = caloriesBarSplit(animEaten, animTarget);
      // Слева — факт (чернила), справа — норма: шалфей пока день в неё влезает,
      // и она гаснет в красный вместе с остатком.
      const footLeft = isClosedDay
        ? (hasOver
          ? { text: formatKcal(animEaten - animTarget), cap: 'перебор', tone: 'bad' }
          : { text: formatKcal(animRemaining), cap: 'не съедено' })
        : { text: formatKcal(animEaten), cap: 'съедено' };
      const footRight = {
        text: formatKcal(animTarget),
        cap: 'норма',
        tone: hasOver ? 'bad' : 'good'
      };

      return React.createElement('div', { className: 'widget-calories widget-calories--2x2 widget-calories--v4-hero' },
        React.createElement('div', { className: 'widget-calories__hero-main' },
          React.createElement('div', { className: 'widget-calories__hero-value' },
            React.createElement('div', {
              className: 'widget-calories__value--lg' + (hasOver && !isClosedDay ? ' widget-v4-val--bad' : '')
            }, heroValue),
            React.createElement('span', { className: 'widget-calories__hero-unit' }, 'ккал')
          ),
          React.createElement('div', {
            className: 'widget-calories__hero-remaining-label'
              + (hasOver && !isClosedDay ? ' widget-v4-val--bad' : '')
          }, heroLabel)
        ),
        React.createElement('div', { className: 'widget-calories__hero-bar-wrap' },
          caloriesHeroBar(split.fillPct, split.overPct),
          caloriesHeroBarFoot(footLeft, footRight)
        )
      );
    }

    const showPct = widget.settings?.showPercentage !== false;
    const showRemaining = widget.settings?.showRemaining !== false;
    const showLabel = true;
    const showProgress = !d.isTiny;
    const showRemainingLine = showRemaining && remaining > 0 && d.rows >= 2 && !d.isShort;

    return React.createElement('div', { className: `widget-calories widget-calories--${variant}` },
      React.createElement('div', { className: 'widget-calories__top' },
        React.createElement('div', { className: 'widget-calories__value', style: { color: getColor() } },
          formatKcal(animEaten)
        ),
        showPct ? React.createElement('div', { className: 'widget-calories__pct' }, formatRuUnit(animPct, '%')) : null
      ),
      showLabel
        ? React.createElement('div', { className: 'widget-calories__label' }, `из ${formatRuUnit(formatKcal(animTarget), 'ккал')}`)
        : null,
      showProgress
        ? React.createElement('div', { className: 'widget-calories__progress' },
          React.createElement('div', {
            className: 'widget-calories__bar',
            style: { width: `${animBarPct}%` }
          })
        )
        : null,
      showRemainingLine
        ? React.createElement('div', { className: 'widget-calories__remaining' }, `Осталось: ${formatKcal(animRemaining)}`)
        : null
    );
  }

  function CaloriesWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'calories',
      renderBody: (variantId, meta) => React.createElement(CaloriesVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
  }

  // === Вода: добавление по канвасу water-add v4, ветка В₃ «Капля и круг» ===
  // Плитка сама решает, ей отвечать или нет: если её видно меньше чем наполовину,
  // ответ на жест берёт на себя мерный столбик у кнопки (см. heys_water_add_feedback_v1).
  const WATER_TILE_VISIBLE_RATIO = 0.5;
  // Порог, за которым подпись и число плитки воды перекрашиваются в кремовый:
  // они читаемы кремовым только когда их накрыла вода, иначе кремовое по
  // песочному не видно вовсе.
  //
  // Число выведено из геометрии, а не подобрано. Ряд сетки — 64 px
  // (--widget-row-height), подпись стоит top:8 и занимает 10 px, число
  // заканчивается на 20 px от верха, середина текстовой строки — 14 px.
  // Вода заливает плитку снизу, её верхняя кромка стоит на 64*(1-доля).
  // Кромка доходит до середины текста при доле (64-14)/64 = 78 %.
  //
  // Прежнее значение 31 осталось от раскладки, где подпись лежала внизу,
  // внутри воды (её и рисует кадр). Решение 31 августа подняло подпись
  // наверх, а порог не пересмотрели — и при норме 1,7 из 2,7 (63 %) плитка
  // красила текст кремовым на песочном фоне. Замер снимка 2 сентября: низ
  // текста на y=249, верхняя кромка воды на y=254 — текст выше воды на 5 px
  // и всё равно был кремовым.
  // Решение владельца 2 сентября: раскладка кадра «Главная · дефолтная
  // раскладка» возвращается — «Вода» и факт внизу по общей базовой линии,
  // норма мелким справа сверху. Она отменяет решение дизайнера 31 августа
  // (коммит 264b7cb69), снявшее норму с 1×1 ради ширины числа; расхождение
  // с текстом строки «раскладка плитки» записано в UI_V4_FINDINGS.md.
  //
  // Порогов перекраски снова два, потому что строки стоят на разной высоте:
  // нижние накрывает вода уже при 31 % плитки, норму — только при 89 %.
  const WATER_TILE_LINES_CREAM_PCT = 31;
  const WATER_TILE_NORM_CREAM_PCT = 89;

  function formatWaterNormTopLabel(targetMl) {
    return `из ${formatRuDecimal((Number(targetMl) || 0) / 1000, 1)}`;
  }

  // Геометрию берём у самой карточки: вода заливает плитку целиком, а не
  // внутренний контейнер, зажатый её отступами.
  function waterTileCard(el) {
    if (!el) return null;
    return (typeof el.closest === 'function' ? el.closest('.widget') : null) || el;
  }

  function waterToneMixPct(fillPct) {
    const pct = Math.max(0, Math.min(100, Number(fillPct) || 0));
    if (pct >= 70) return 100;
    return Math.round((pct / 70) * 100);
  }

  function isWaterTileVisible(el) {
    const card = waterTileCard(el);
    if (!card || typeof card.getBoundingClientRect !== 'function') return false;
    const rect = card.getBoundingClientRect();
    if (!rect.height) return false;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    const visible = Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0);
    return visible / rect.height >= WATER_TILE_VISIBLE_RATIO;
  }

  // Капля падает до поверхности воды, поэтому её путь зависит от текущего уровня.
  function waterDropTravel(el, fillPct) {
    const card = waterTileCard(el);
    if (!card || typeof card.getBoundingClientRect !== 'function') return 21;
    const h = card.getBoundingClientRect().height || 64;
    const surface = h * (1 - Math.max(0, Math.min(100, fillPct)) / 100);
    return Math.max(6, Math.round(surface - 11));
  }

  function useWaterFillDisplayPct(fillPct) {
    const [displayFillPct, setDisplayFillPct] = React.useState(0);
    const fillSeededRef = useRef(false);
    React.useLayoutEffect(() => {
      if (!fillSeededRef.current && fillPct > 0) {
        fillSeededRef.current = true;
        setDisplayFillPct(0);
        const id = requestAnimationFrame(() => setDisplayFillPct(fillPct));
        return () => cancelAnimationFrame(id);
      }
      fillSeededRef.current = true;
      setDisplayFillPct(fillPct);
      return undefined;
    }, [fillPct]);
    return displayFillPct;
  }

  function useWaterAddPulse(rootRef, fillPct) {
    const [pulse, setPulse] = React.useState(null);
    const fillPctRef = useRef(fillPct);
    fillPctRef.current = fillPct;
    const timerRef = useRef(null);
    React.useEffect(() => {
      const onAdd = (event) => {
        const detail = event?.detail;
        if (!detail || !detail.ml || detail.ml < 0) return;
        if (!isWaterTileVisible(rootRef.current)) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        const targetMl = Number(detail.targetMl) || 2000;
        const prevTotal = Math.max(0, (Number(detail.total) || 0) - detail.ml);
        const prevPct = targetMl > 0
          ? Math.min(100, Math.round((prevTotal / targetMl) * 100))
          : fillPctRef.current;
        setPulse({
          id: Date.now(),
          travel: waterDropTravel(rootRef.current, prevPct)
        });
        timerRef.current = setTimeout(() => setPulse(null), 900);
      };
      window.addEventListener('heysWaterAdded', onAdd);
      return () => {
        window.removeEventListener('heysWaterAdded', onAdd);
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, [rootRef]);
    return pulse;
  }

  function WaterVariantBody({ variantId, widget, data, meta = {} }) {
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
      ? (d.isMicro ? String(drunk) : formatRuUnit(drunk, 'мл'))
      : `${glasses}${d.isMicro ? '🥛' : ' 🥛'}`;

    const getWaterColor = () => HEYS.scales.waterProgress(pct).color;

    // 1×1 — канвас water-add v4, ветка В₃: уровень воды заливает саму плитку,
    // у поверхности всегда идут блики, добавление роняет каплю и круг.
    if (d.isMicro || variantId === 'mini') {
      const liters = (drunk || 0) / 1000;
      // Выше нормы уровень упирается, число продолжает расти: перепить воду —
      // не то же самое, что перебрать калории, красным здесь ничего не красим.
      const fillPct = Math.min(100, Math.max(0, pct));
      const rootRef = useRef(null);
      const prevLitersRef = useRef(liters);
      const pulse = useWaterAddPulse(rootRef, fillPct);
      const displayFillPct = useWaterFillDisplayPct(fillPct);
      const linesOnWater = displayFillPct >= WATER_TILE_LINES_CREAM_PCT;
      const normOnWater = displayFillPct >= WATER_TILE_NORM_CREAM_PCT;
      const toneMix = waterToneMixPct(displayFillPct);
      const litersLabel = formatRuDecimal(liters, 1);
      const prevLabel = formatRuDecimal(prevLitersRef.current, 1);
      const normLabel = formatWaterNormTopLabel(target);
      React.useEffect(() => { prevLitersRef.current = liters; }, [liters]);

      return React.createElement('div', {
        ref: rootRef,
        className: 'widget-water widget-water--micro widget-v4-mini widget-water--v4'
          + (pulse ? ' widget-water--adding' : '')
          + (linesOnWater ? ' widget-water--lines-on-water' : '')
          + (normOnWater ? ' widget-water--norm-on-water' : ''),
        style: {
          '--water-tone-mix': `${toneMix}%`,
          ...(pulse ? { '--water-drop-travel': `${pulse.travel}px` } : {})
        }
      },
        showProgress
          ? React.createElement('span', {
            className: 'widget-water__fill animate-always',
            style: { height: `${displayFillPct}%` },
            'aria-hidden': 'true'
          })
          : null,
        pulse ? React.createElement('span', {
          key: `drop-${pulse.id}`,
          className: 'widget-water__drop animate-always',
          'aria-hidden': 'true'
        }) : null,
        pulse ? React.createElement('span', {
          key: `ripple-${pulse.id}`,
          className: 'widget-water__ripple animate-always',
          style: { bottom: `${fillPct}%` },
          'aria-hidden': 'true'
        }) : null,
        // Кадр «Главная · дефолтная раскладка»: норма справа сверху, «Вода»
        // слева внизу, факт справа внизу.
        React.createElement('span', {
          className: 'widget-water__norm',
          'aria-hidden': 'true'
        }, normLabel),
        React.createElement('span', { className: 'widget-water__label' }, 'Вода'),
        React.createElement('div', {
          className: 'widget-water__num widget-water__numV',
          'aria-label': `${litersLabel} литра из ${formatRuDecimal(target / 1000, 1)}`
        },
          pulse && prevLabel !== litersLabel
            ? React.createElement('span', {
              key: `out-${pulse.id}`,
              className: 'widget-water__num-out',
              'aria-hidden': 'true'
            }, prevLabel)
            : null,
          React.createElement('span', {
            key: pulse ? `in-${pulse.id}` : 'in',
            className: 'widget-water__num-in'
              + (pulse && prevLabel !== litersLabel ? '' : ' widget-water__num-in--static')
          }, litersLabel)
        )
      );
    }

    if (variantId === 'by_hour') {
      const isClosedDay = data.isClosedDay === true;
      if (isClosedDay) {
        return React.createElement('div', { className: 'widget-water widget-water--2x1 widget-v4-stack' },
          React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
            v4Kicker('Вода'),
            React.createElement('span', { className: 'widget-v4-row__meta' },
              `${formatRuDecimal(drunk / 1000, 1)} / ${formatRuUnit(formatRuDecimal(target / 1000, 1), 'л')}`)
          ),
          React.createElement('div', { className: 'widget-v4-row__value' },
            formatRuDecimal(drunk / 1000, 1),
            React.createElement('span', { className: 'widget-v4-unit' }, ' л')
          ),
          React.createElement('div', { className: 'widget-v4-mini__bar widget-v4-water-hour__bar' },
            React.createElement('div', {
              className: 'widget-v4-mini__bar-fill widget-v4-mini__bar-fill--water',
              style: { width: `${Math.min(100, pct)}%` }
            })
          )
        );
      }
      const wakeMinutes = parseHmToMinutes(data.sleepEnd) ?? data.medianWakeMinutes;
      const bedMinutes = parseHmToMinutes(data.sleepStart);
      const profileSleepH = Number(data.profileSleepHours) || 8;
      const awakeSpan = bedMinutes != null && wakeMinutes != null
        ? minutesSpan(wakeMinutes, bedMinutes)
        : Math.round((24 - profileSleepH) * 60);
      const atMinutes = deviceNowMinutes();
      const schedule = v4WaterScheduleAt(target, wakeMinutes, awakeSpan, atMinutes);
      const expectedMl = data.expectedMlNow ?? schedule.expectedMl;
      const expectedPct = data.expectedPctNow ?? schedule.expectedPct;
      const deficitMl = Math.round(data.deficitMlNow ?? (drunk - expectedMl));
      const deficitLabel = deficitMl === 0
        ? 'в графике'
        : `${deficitMl > 0 ? '+' : '−'}${Math.abs(deficitMl)}`;
      // Строки «вода» и «одна шкала на весь продукт»: свой порог «в минусе =
      // красный» Главная заводить не вправе — зоны 8 / 25 % вниз и
      // 110 / 130 % вверх приходят из общей шкалы темпа.
      const waterState = v4WaterValueState(drunk, target, {
        sleepEnd: data.sleepEnd,
        sleepStart: data.sleepStart,
        medianWakeMinutes: data.medianWakeMinutes,
        nowMinutes: atMinutes
      });
      const checkLabel = data.checkHourLabel || schedule.checkLabel;
      return React.createElement('div', { className: 'widget-water widget-water--2x1 widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Вода'),
          checkLabel
            ? React.createElement('span', { className: 'widget-v4-row__meta' }, checkLabel)
            : null
        ),
        React.createElement('div', { className: 'widget-v4-row__value ' + v4ValueStateClass(waterState) },
          deficitLabel,
          React.createElement('span', { className: 'widget-v4-unit' }, ' мл к графику')
        ),
        React.createElement('div', { className: 'widget-v4-mini__bar widget-v4-water-hour__bar' },
          React.createElement('div', {
            className: 'widget-v4-mini__bar-fill widget-v4-mini__bar-fill--water',
            style: { width: `${Math.min(100, pct)}%` }
          }),
          React.createElement('span', {
            className: 'widget-v4-water-hour__marker',
            style: { left: `${Math.min(100, expectedPct)}%` }
          })
        )
      );
    }

    if (variantId === 'rhythm') {
      const hrs = data.hoursSinceWater;
      const rhythmLabel = Number.isFinite(hrs) && hrs > 0 ? `${formatRuUnit(hrs, 'ч')} без воды` : 'ритм дня';
      const bins = Array.isArray(data.rhythmBins) ? data.rhythmBins : [];
      const maxBin = Math.max(1, ...bins);
      return React.createElement('div', { className: 'widget-water widget-water--2x1 widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Вода'),
          // Кадр «Шторка · Вода», вид «Ритм дня»: строка провала идёт счётчиком
          // — 9.5px/700, а не подписью меты 9px/600.
          React.createElement('span', {
            className: 'widget-v4-row__meta widget-v4-row__meta--count widget-v4-val--bad'
          }, rhythmLabel)
        ),
        React.createElement('div', { className: 'widget-v4-water-rhythm__body' },
          React.createElement('span', { className: 'widget-v4-row__value' },
            formatRuDecimal(drunk / 1000, 1),
            React.createElement('span', { className: 'widget-v4-unit' },
              ` / ${formatRuUnit(formatRuDecimal(target / 1000, 1), 'л')}`)
          ),
          React.createElement('div', { className: 'widget-v4-water-rhythm' },
            bins.map((ml, index) => {
              const heightPct = ml > 0 ? Math.max(12, Math.round((ml / maxBin) * 100)) : 12;
              return React.createElement('span', {
                key: `rhythm-${index}`,
                className: ml > 0
                  ? 'widget-v4-water-rhythm__bin widget-v4-water-rhythm__bin--fill'
                  : 'widget-v4-water-rhythm__bin',
                style: { height: `${heightPct}%` }
              });
            })
          )
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
              showMilliliters || !showGlasses ? `${drunk}` : `${glasses}`,
              React.createElement('span', { className: 'widget-water__unit' }, showMilliliters || !showGlasses ? 'мл' : '🥛')
            )
          ),
          showPercentage
            ? React.createElement('div', { className: 'widget-water__pct-badge', style: { background: `${waterColor}20`, color: waterColor } },
              formatRuUnit(pct, '%')
            )
            : null
        ),
        // Прогресс-бар
        showProgress
          ? React.createElement('div', { className: 'widget-water__progress' },
            React.createElement('div', {
              className: 'widget-water__bar widget-water__bar--v4',
              style: { width: `${Math.min(100, pct)}%` }
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
              `ещё ${formatRuUnit(remaining, 'мл')}`
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
            className: 'widget-water__bar widget-water__bar--v4',
            style: { width: `${Math.min(100, pct)}%` }
          })
        )
        : null,
      showPctPill ? React.createElement('div', { className: 'widget-water__label' }, formatRuUnit(pct, '%')) : null
    );
  }

  function WaterWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'water',
      renderBody: (variantId, meta) => React.createElement(WaterVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
  }

  function SleepVariantBody({ variantId, widget, data, meta = {} }) {
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

    const getSleepColor = () => HEYS.scales.sleepHours(hours, target).color;

    // 1x1 — канвас g1: «Сон» + часы
    if (d.isMicro || variantId === 'mini') {
      const sleepState = v4SleepValueState(hours, target);
      return React.createElement('div', { className: 'widget-sleep widget-sleep--micro widget-v4-mini' },
        v4Kicker('Сон'),
        React.createElement('div', {
          className: 'widget-v4-mini__value ' + v4ValueStateClass(sleepState)
        },
          formatRuDecimal(hours, 1),
          React.createElement('span', { className: 'widget-v4-unit' }, ' ч')
        )
      );
    }

    if (variantId === 'to_norm') {
      const delta = hours - target;
      const sleepState = v4SleepValueState(hours, target);
      const sign = delta > 0 ? '+' : (delta < 0 ? '−' : '');
      return React.createElement('div', { className: 'widget-sleep widget-sleep--micro widget-v4-mini' },
        v4Kicker('Сон · к норме'),
        React.createElement('div', {
          className: 'widget-v4-mini__value widget-v4-mini__value--pair ' + v4ValueStateClass(sleepState)
        },
          sign,
          formatRuDecimal(Math.abs(delta), 1),
          React.createElement('span', { className: 'widget-v4-unit' }, 'ч')
        )
      );
    }

    if (variantId === 'week_debt') {
      const debt = Number(data.weekDebtHours) || 0;
      // Кадр «Шторка · Сон», вид «Долг за неделю»: справа семь столбиков по
      // ночам — ровно то, что обещает подпись вида «видно, где отсыпался».
      // Данные (sleepWeekBars) считались и раньше, вид их не рисовал.
      const week = Array.isArray(data.sleepWeekBars) ? data.sleepWeekBars.slice(-7) : [];
      const maxHours = Math.max(target || 0, ...week.map((d) => Number(d.hours) || 0), 1);
      return React.createElement('div', { className: 'widget-sleep widget-sleep--2x1 widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Недосып · 7 дней'),
          React.createElement('span', { className: 'widget-v4-row__meta' },
            target ? formatRuUnit(formatRuDecimal(target, 1), 'ч') : '')
        ),
        React.createElement('div', { className: 'widget-v4-sleep-debt' },
          React.createElement('span', { className: 'widget-v4-sleep-debt__num' },
            React.createElement('span', {
              className: 'widget-v4-row__value ' + (debt > 0 ? 'widget-v4-val--bad' : 'widget-v4-val--neutral')
            }, debt > 0 ? `−${formatRuDecimal(debt, 1)}` : formatRuDecimal(0, 1)),
            React.createElement('span', { className: 'widget-v4-unit' }, 'ч')
          ),
          week.length
            ? React.createElement('span', { className: 'widget-v4-sleep-debt__bars' },
              week.map((night, index) => React.createElement('i', {
                key: `sleep-night-${night.date || index}`,
                className: 'widget-v4-sleep-debt__bar'
                  + ((Number(night.hours) || 0) >= (target || 0)
                    ? ' widget-v4-sleep-debt__bar--ok'
                    : ' widget-v4-sleep-debt__bar--short'),
                // Пустая ночь остаётся видимой риской, а не исчезает: пропуск
                // записи — тоже факт недели.
                style: { height: `${Math.max(2, Math.round((Number(night.hours) || 0) / maxHours * 22))}px` }
              }))
            )
            : null
        )
      );
    }

    if (variantId === 'window') {
      const targetBand = sleepWindowBand(data.targetSleepStart, data.targetSleepEnd);
      const actualBand = sleepWindowBand(sleepStart, sleepEnd);
      const sleepState = v4SleepValueState(hours, target);
      return React.createElement('div', { className: 'widget-sleep widget-sleep--2x1 widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Сон · окно'),
          React.createElement('span', {
            className: 'widget-v4-row__meta widget-v4-sleep-window__hours ' + v4ValueStateClass(sleepState)
          }, formatRuUnit(formatRuDecimal(hours, 1), 'ч'))
        ),
        React.createElement('div', { className: 'widget-v4-sleep-window' },
          targetBand
            ? React.createElement('span', {
              className: 'widget-v4-sleep-window__target',
              style: { left: `${targetBand.left}%`, width: `${targetBand.width}%` }
            })
            : null,
          actualBand
            ? React.createElement('span', {
              className: 'widget-v4-sleep-window__actual',
              style: { left: `${actualBand.left}%`, width: `${actualBand.width}%` }
            })
            : null
        ),
        React.createElement('div', { className: 'widget-v4-sleep-window__labels' },
          React.createElement('span', null, formatSleepHmLabel(sleepStart, 'лёг')),
          React.createElement('span', null, formatSleepHmLabel(sleepEnd, 'встал'))
        )
      );
    }

    // 2x2 — Оптимальный layout
    if (size === '2x2') {
      const sleepColor = getSleepColor();
      return React.createElement('div', { className: 'widget-sleep widget-sleep--2x2' },
        React.createElement('div', { className: 'widget-sleep__header' },
          React.createElement('div', { className: 'widget-sleep__main' },
            React.createElement('div', { className: 'widget-sleep__value widget-sleep__value--lg' },
              formatRuDecimal(hours, 1),
              React.createElement('span', { className: 'widget-sleep__unit' }, 'ч')
            )
          ),
          React.createElement('div', { className: 'widget-sleep__pct-badge', style: { background: `${sleepColor}20`, color: sleepColor } },
            formatRuUnit(pct, '%')
          )
        ),
        showTimes && React.createElement('div', { className: 'widget-sleep__times' },
          sleepStart && React.createElement('span', { className: 'widget-sleep__time' }, `лёг ${sleepStart}`),
          sleepEnd && React.createElement('span', { className: 'widget-sleep__time' }, `встал ${sleepEnd}`)
        ),
        React.createElement('div', { className: 'widget-sleep__footer' },
          showQuality && React.createElement('div', { className: 'widget-sleep__quality-badge' },
            `Качество ${quality}/10`
          ),
          showTarget
            ? React.createElement('div', { className: 'widget-sleep__target' },
              `Цель: ${formatRuUnit(target, 'ч', { tight: true })}`
            )
            : null
        )
      );
    }

    // Остальные размеры
    return React.createElement('div', { className: `widget-sleep widget-sleep--${variant}` },
      React.createElement('div', { className: 'widget-sleep__value' }, formatRuUnit(formatRuDecimal(hours, 1), 'ч', { tight: true })),
      showTimes ? React.createElement('div', { className: 'widget-sleep__label' }, [sleepStart, sleepEnd].filter(Boolean).join(' → ')) : null,
      showTarget ? React.createElement('div', { className: 'widget-sleep__label' }, `из ${formatRuUnit(target, 'ч', { tight: true })}`) : null,
      showQuality ? React.createElement('div', { className: 'widget-sleep__quality' }, `Качество: ${quality}/10`) : null
    );
  }

  function SleepWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'sleep',
      renderBody: (variantId, meta) => React.createElement(SleepVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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
      return React.createElement('div', { className: 'widget-streak widget-streak--micro widget-v4-mini' },
        v4Kicker('Серия'),
        React.createElement('div', { className: 'widget-streak__value widget-v4-mini__value' }, current)
      );
    }

    // 2x2 — Оптимальный layout с мини-heatmap недели
    if (size === '2x2') {
      const streakColor = getStreakColor();
      const isNewRecord = current > 0 && current >= max;

      return React.createElement('div', { className: 'widget-streak widget-streak--2x2' },
        // Верх: серия + число + дни
        React.createElement('div', { className: 'widget-streak__header' },
          React.createElement('div', { className: 'widget-streak__label-top' }, 'Серия'),
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
            ? React.createElement('div', { className: 'widget-streak__record widget-streak__record--new' }, 'Рекорд')
            : max > 0 && React.createElement('div', { className: 'widget-streak__record' }, `Рекорд: ${formatRuUnit(max, 'дн')}`)
        )
      );
    }

    // Остальные размеры
    const showMax = widget.settings?.showMax !== false && max > current && !d.isTiny;

    return React.createElement('div', { className: `widget-streak widget-streak--${variant}` },
      React.createElement('div', { className: 'widget-streak__value' },
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
  function WeightWidgetV4_2x2({
    current,
    weekChange,
    windowState = 'neutral',
    hasCurrent,
    hasSparkline,
    sparklinePoints
  }) {
    React.useLayoutEffect(() => {
      widgetV4RegisterWeightSparkWidget();
    }, []);
    const onWeightSparkDrawComplete = React.useCallback(() => {
      widgetV4NotifyWeightSparkDrawComplete();
    }, []);

    const weekText = Number.isFinite(weekChange)
      ? `${weekChange > 0 ? '+' : '−'}${formatRuDecimal(Math.abs(weekChange), 1)} за неделю`
      : null;
    const pts = hasSparkline
      ? sparklinePoints.slice(-7).filter((p) => Number.isFinite(p.weight) && !p.excluded && !p.estimated)
      : [];
    const sparkPoints = pts.length >= 2
      ? pts.map((p, i) => {
        const weights = pts.map((x) => x.weight);
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        const span = Math.max(0.1, max - min);
        const x = 4 + (i / (pts.length - 1)) * 122;
        const y = 32 - ((p.weight - min) / span) * 24;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
      : '4,14 26,24 48,24 70,6 92,14 114,18 126,19';
    const last = sparkPoints.split(' ').pop().split(',');
    // Строка «вес»: и герой, и дельта красятся окном спарклайна, а не
    // фиксированной неделей и не weekChange.
    const weightHeroState = windowState;
    const weekState = windowState;

    return React.createElement('div', { className: 'widget-weight widget-weight--2x2 widget-v4-stack' },
      v4Kicker('Вес'),
      React.createElement('div', { className: 'widget-v4-hero-num' },
        React.createElement('span', {
          className: 'widget-v4-hero-num__val ' + v4ValueStateClass(weightHeroState)
        },
          hasCurrent ? formatRuDecimal(current, 1) : '—'
        ),
        React.createElement('span', { className: 'widget-v4-unit' }, 'кг')
      ),
      weekText
        ? React.createElement('div', {
          className: 'widget-v4-delta ' + v4ValueStateClass(weekState)
        }, weekText)
        : null,
      React.createElement(WidgetV4DrawSparkSvg, {
        className: 'widget-v4-spark widget-v4-spark--act',
        points: sparkPoints,
        dotCx: Number(last[0]),
        dotCy: Number(last[1]),
        onDrawComplete: onWeightSparkDrawComplete
      })
    );
  }

  function WeightVariantBody({ variantId, widget, data, meta = {} }) {
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
      return { cls: 'stable', emoji: '→', label: 'стабилен', color: 'var(--v4-water, #3b82f6)' };
    };
    const trendInfo = getTrendInfo();

    // Форматирование weekChange
    const formatWeekChange = () => {
      if (!Number.isFinite(weekChange)) return null;
      const sign = weekChange >= 0 ? '+' : '';
      return `${sign}${formatRuUnit(formatRuDecimal(weekChange, 1), 'кг/нед')}`;
    };

    // ============ БЛОКИ-КОМПОНЕНТЫ ============

    // Блок: Главное значение веса
    const WeightValue = ({ scale = 'md' }) => {
      const sizes = { sm: 'widget-weight__val--sm', md: 'widget-weight__val--md', lg: 'widget-weight__val--lg', xl: 'widget-weight__val--xl' };
      if (!hasCurrent) return React.createElement('div', { className: 'widget-weight__empty' }, '—');
      return React.createElement('div', { className: `widget-weight__val ${sizes[scale] || ''}` },
        formatRuDecimal(current, 1),
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
        trendColor: trendInfo?.color || 'var(--v4-water, #3b82f6)',
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
          React.createElement('span', { className: 'widget-weight__goal-inline-val' }, formatRuUnit(goal, 'кг')),
          weeksToGoal && React.createElement('span', { className: 'widget-weight__goal-eta' }, `~${weeksToGoal} нед`)
        );
      }
      return React.createElement('div', { className: 'widget-weight__goal-block' },
        React.createElement('div', { className: 'widget-weight__goal-val' }, formatRuUnit(goal, 'кг')),
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
          React.createElement('div', { className: 'widget-weight__progress-goal' }, formatRuUnit(goal, 'кг'))
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
          React.createElement('span', { className: 'widget-weight__progress-pct' }, formatRuUnit(formatRuNumber(Math.round(pct)), '%')),
          React.createElement('span', { className: 'widget-weight__progress-label' }, `→ ${formatRuUnit(goal, 'кг')}`)
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
        }, `BMI ${formatRuDecimal(bmi, 1)}`);
      }
      return React.createElement('div', { className: 'widget-weight__bmi-block' },
        React.createElement('div', { className: 'widget-weight__bmi-num' }, formatRuDecimal(bmi, 1)),
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
        items.push({ icon: 'barChart', text: `Прогноз: ${monthChange > 0 ? '+' : ''}${formatRuUnit(formatRuDecimal(monthChange, 1), 'кг/мес')}` });
      }
      if (showAnalytics && hasCleanTrend) {
        items.push({ icon: 'flower', text: 'Чистый тренд' });
      }
      if (items.length === 0) return null;
      return React.createElement('div', { className: 'widget-weight__stats' },
        items.map((item, i) => React.createElement('div', {
          key: i,
          className: `widget-weight__stat ${item.cls || ''}`
        },
          React.createElement(WidgetGlyph, { glyph: item.icon, className: 'widget-weight__stat-icon' }),
          React.createElement('span', null, item.text)
        ))
      );
    };

    // ============ LAYOUTS ПО РАЗМЕРАМ ============

    // MINI (1×1) — метка + число (компактный шрифт для safe-area)
    if (size === '1x1') {
      if (variantId === 'delta') {
        // Вид называется «Только число» и стоит рядом с динамикой: кадр
        // «Шторка · Вес» показывает здесь сам вес с единицей, а не недельную
        // дельту — её человек и так читает на соседней плитке.
        // Строка «вес»: направление из окна спарклайна, не из trend × 7.
        const trendCls = v4ValueStateClass(v4WeightWindowState(data));
        return React.createElement('div', { className: 'widget-weight widget-weight--1x1 widget-v4-mini' },
          v4Kicker('Вес'),
          React.createElement('div', { className: 'widget-v4-mini__value ' + trendCls },
            hasCurrent ? formatRuDecimal(current, 1) : '—',
            hasCurrent ? React.createElement('span', { className: 'widget-v4-unit' }, ' кг') : null
          )
        );
      }
      return React.createElement('div', { className: 'widget-weight widget-weight--1x1' },
        React.createElement('div', { className: 'widget-micro__label' }, 'вес'),
        React.createElement(WeightValue, { scale: 'sm' })
      );
    }

    // SHORT (2×1) — «Число и неделя»: подпись слева, дельта справа, ниже
    // спарклайн недели и число у правого края (строка «состав дефолта»).
    if (size === '2x1') {
      if (variantId === 'number_week') {
        const weekText = Number.isFinite(weekChange)
          ? `${weekChange > 0 ? '+' : '−'}${formatRuDecimal(Math.abs(weekChange), 1)} за неделю`
          : null;
        // Строка «вес»: текст остаётся недельным (строка «состав дефолта»),
        // а цвет идёт от окна спарклайна.
        const weekState = v4WeightWindowState(data);
        // Кадр и строка «состав дефолта» ставят дельту в одну строку с
        // подписью («подпись слева, „−0,9 за неделю“ справа, число 21 px
        // прижато к правому краю»), а не рядом с числом. Код держал её слева
        // от числа — от этого дельта и лежала в левом нижнем углу сетки,
        // который строка «зоны углов» просит держать пустым.
        return React.createElement('div', { className: 'widget-weight widget-weight--2x1 widget-weight--number-week' },
          React.createElement('div', { className: 'widget-weight__number-week-head' },
            v4Kicker('Вес'),
            weekText
              ? React.createElement('span', {
                className: 'widget-weight__number-week-delta ' + v4ValueStateClass(weekState)
              }, weekText)
              : React.createElement('span', { className: 'widget-weight__number-week-delta is-empty' }, '—')
          ),
          React.createElement('div', { className: 'widget-weight__number-week-row' },
            React.createElement(WidgetV4WeekSpark, {
              points: sparklinePoints,
              toneClass: v4ValueStateClass(weekState)
            }),
            React.createElement('span', { className: 'widget-weight__number-week-num' },
              React.createElement('span', {
                className: 'widget-weight__number-week-val ' + v4ValueStateClass(weekState)
              },
                hasCurrent ? formatRuDecimal(current, 1) : '—'
              ),
              React.createElement('span', { className: 'widget-v4-unit' }, 'кг')
            )
          )
        );
      }
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

    // COMPACT (2×2) — канвас g1: «Вес» + кг + неделя + линия
    if (size === '2x2') {
      if (variantId === 'scatter' && sparklinePoints.length >= 2) {
        const pts = sparklinePoints.slice(-14);
        const weights = pts.map((p) => p.weight);
        const minW = Math.min(...weights);
        const maxW = Math.max(...weights);
        const span = Math.max(0.1, maxW - minW);
        const yForWeight = (w) => 10 + ((maxW - w) / span) * 44;
        const maPoints = pts.map((p, i, arr) => {
          const slice = arr.slice(Math.max(0, i - 6), i + 1);
          const avg = slice.reduce((s, x) => s + x.weight, 0) / slice.length;
          return avg;
        });
        const maPath = maPoints.map((w, i) => {
          const x = 6 + (i / (pts.length - 1 || 1)) * 118;
          const y = yForWeight(w);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return React.createElement('div', { className: 'widget-weight widget-weight--2x2 widget-v4-stack' },
          React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
            v4Kicker('Вес · точки и среднее'),
            hasCurrent
              ? React.createElement('span', { className: 'widget-v4-row__meta widget-v4-val--good' },
                formatRuDecimal(current, 1)
              )
              : null
          ),
          React.createElement('svg', {
            className: 'widget-weight__scatter',
            viewBox: '0 0 130 56',
            width: '100%',
            height: 56,
            'aria-hidden': 'true'
          },
            pts.map((p, i) => {
              const x = 6 + (i / (pts.length - 1 || 1)) * 118;
              const y = yForWeight(p.weight);
              return React.createElement('circle', {
                key: i,
                cx: x,
                cy: y,
                r: 2.2,
                fill: 'rgba(0,0,0,0.22)',
                className: 'widget-weight__scatter-dot'
              });
            }),
            React.createElement('polyline', {
              points: maPath,
              fill: 'none',
              stroke: 'var(--v4-ok, #7a8a5e)',
              strokeWidth: 2.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            })
          ),
          React.createElement('div', { className: 'widget-weight__scatter-foot' },
            'точки — весы, линия — среднее за 7 дней'
          )
        );
      }
      return React.createElement(WeightWidgetV4_2x2, {
        current,
        weekChange,
        windowState: v4WeightWindowState(data),
        hasCurrent,
        hasSparkline,
        sparklinePoints
      });
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

  function WeightWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'weight',
      renderBody: (variantId, meta) => React.createElement(WeightVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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
    const introSlowRef = React.useRef(widgetMotionIsIntroSlow());
    const drawMs = introSlowRef.current ? 2500 : 1250;

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
        stroke: 'var(--v4-wgt-violet, #8b5cf6)',
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
          transition: `stroke-dashoffset ${drawMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
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

  // Числа шагов пишутся с разрядами, как в кадрах: «8 240», «10 000».
  function formatRuThousands(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return formatRuNumber(Math.round(n));
  }

  // Шаги: красим только шалфеем от 100 % цели и чернилами ниже, красным
  // никогда (канвас v4, строка «шаги · цвет»). Непройденные шаги — не
  // «обрати внимание»: день ещё не кончился.
  function v4StepsState(pct) {
    return Number(pct) >= 100 ? 'good' : 'neutral';
  }

  /**
   * Столбики тренда шагов. День с целью — шалфей, ниже цели — средний тон;
   * дня без записи в ряду нет вовсе (строки «шаги · цвет» и «шаги · нет данных»).
   */
  function v4StepsBars(series, goal, extraClass) {
    const list = Array.isArray(series) ? series : [];
    const max = Math.max(Number(goal) || 0, ...list.map((item) => Number(item?.value) || 0), 1);
    return React.createElement('div', { className: 'widget-v4-stepbars ' + (extraClass || '') },
      list.map((item) => {
        const value = Number(item?.value) || 0;
        const done = goal > 0 && value >= goal;
        return React.createElement('span', {
          key: item.iso,
          className: 'widget-v4-stepbars__bar'
            + (item?.hasData ? '' : ' is-empty')
            + (done ? ' is-goal' : ''),
          style: { height: item?.hasData ? Math.max(2, Math.round((value / max) * 30)) + 'px' : '2px' }
        });
      })
    );
  }

  /** Два вида канваса: 35 «Неделя» 2×1 и 36 «Месяц» 2×2, оба — тренды. */
  function StepsVariantBody({ variantId, data }) {
    const goal = Number(data?.goal) || 10000;
    const daysWithData = Number(data?.daysWithData) || 0;
    // Дней с шагами меньше двух — тренда ещё нет.
    const enoughDays = daysWithData >= 2;

    if (variantId === 'month') {
      const avg = data?.avgMonth;
      const state = v4StepsState(avg != null && goal > 0 ? (avg / goal) * 100 : 0);
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-steps' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Шаги · месяц'),
          React.createElement('span', { className: 'widget-v4-row__meta' }, `цель ${formatRuThousands(goal)}`)
        ),
        React.createElement('div', { className: 'widget-v4-steps__hero' },
          React.createElement('span', {
            className: 'widget-v4-steps__value ' + v4ValueStateClass(state)
          }, avg != null ? formatRuThousands(avg) : '—'),
          avg != null ? React.createElement('span', { className: 'widget-v4-unit' }, 'в день') : null
        ),
        enoughDays
          ? v4StepsBars(data?.month, goal, 'widget-v4-stepbars--month')
          : React.createElement('span', { className: 'widget-v4-muted' },
            daysWithData ? `нужно ${2 - daysWithData} день` : 'нужно 2 дня')
      );
    }

    // 2×1 «Неделя»: семь столбиков и среднее.
    const avg = data?.avgWeek;
    const state = v4StepsState(avg != null && goal > 0 ? (avg / goal) * 100 : 0);
    return React.createElement('div', { className: 'widget-v4-stack widget-v4-steps' },
      React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
        v4Kicker('Шаги'),
        avg != null
          // Строка «вид · столбики шагов»: подпись «в среднем 8 940» стоит
          // тоном чернил 42 %, состояние несут сами столбики.
          ? React.createElement('span', {
            className: 'widget-v4-row__meta'
          }, `в среднем ${formatRuThousands(avg)}`)
          : null
      ),
      enoughDays
        ? v4StepsBars(data?.week, goal)
        : React.createElement('div', { className: 'widget-v4-steps__hero' },
          React.createElement('span', {
            className: 'widget-v4-steps__value widget-v4-val--neutral'
          }, '—'),
          React.createElement('span', { className: 'widget-v4-muted' },
            daysWithData ? 'нужно 1 день' : 'нужно 2 дня')
        )
    );
  }

  function StepsWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'steps',
      renderBody: (variantId, meta) => React.createElement(StepsVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
  }

  // ─── Шесть виджетов пакета канваса 22 августа, кадры 37–51 ─────────────
  // Общее по цвету: недобор ни у одного не красится. Красный есть только у
  // «Окна до сна» и только в одном случае — ел меньше чем за час до отбоя.

  /** Полоса дневной цели: ниже 67 % — --ovl, от 67 % — --gr2; tone bad/good — явный тон БЖУ. */
  function v4GoalBar(pct, tone) {
    const width = Math.max(0, Math.min(100, Number(pct) || 0));
    const fillClass = tone === 'bad'
      ? ' widget-v4-goalbar__fill--bad'
      : (tone === 'good' || (!tone && width >= 67) ? ' is-on-track' : '');
    return React.createElement('div', { className: 'widget-v4-goalbar' },
      React.createElement('span', {
        className: 'widget-v4-goalbar__fill' + fillClass,
        style: { width: `${width}%` }
      })
    );
  }

  /** Столбики недели: сегодняшний правый и глубоким тоном, пустой день — 2 px.
      opts.plotPx — высота поля в px (клетчатка: 40 из 44, пунктир нормы сверху 4). */
  function v4WeekBars(week, maxValue, className, opts) {
    const max = Math.max(1, Number(maxValue) || 1);
    const plotPx = Number(opts?.plotPx) || 0;
    const norm = Number(opts?.norm) || 0;
    const normLine = plotPx > 0 && norm > 0
      ? React.createElement('span', {
          className: 'widget-v4-weekbars__norm',
          style: { top: (4 + (1 - Math.min(1, norm / max)) * plotPx) + 'px' }
        })
      : null;
    return React.createElement('div', { className: 'widget-v4-weekbars ' + (className || '') },
      normLine,
      (week || []).map((item) => {
        const value = Number(item?.value) || 0;
        // Пустой день — столбик 2 px, а не пропуск: день был, еды в нём не было.
        const height = value > 0
          ? (plotPx
            ? Math.max(2, Math.round((value / max) * plotPx)) + 'px'
            : Math.max(6, Math.round((value / max) * 100)) + '%')
          : '2px';
        return React.createElement('span', {
          key: item.iso,
          className: 'widget-v4-weekbars__bar' + (item.isToday ? ' is-today' : ''),
          style: { height }
        });
      })
    );
  }

  /** «2:40» — часы и минуты без ведущего нуля у часов. */
  function formatHoursColon(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h + ':' + String(m).padStart(2, '0');
  }

  /** «4 ч 25 м» — длительность словами, как в кадре 49. */
  function formatHoursWords(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return formatRuUnit(m, 'м');
    return formatRuUnit(h, 'ч') + (m ? ' ' + formatRuUnit(m, 'м') : '');
  }

  function formatLitersRu(ml) {
    const liters = (Math.max(0, Number(ml) || 0)) / 1000;
    return formatRuDecimal(liters, 1);
  }

  function formatScoreRu(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return formatRuNumber(Math.round(num * 10) / 10, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  }

  // Клетчатка и белок: чернила, от 100 % нормы — шалфей, красного нет никогда.
  function v4GoalState(pct) {
    return Number(pct) >= 100 ? 'good' : 'neutral';
  }

  /** Клетчатка — кадры 37 «Как сейчас», 38 «Добрать», 39 «Неделя». */
  function FiberVariantBody({ variantId, data }) {
    const hasData = data?.hasData === true && data?.fiber != null;
    const fiber = Number(data?.fiber) || 0;
    const norm = Number(data?.norm) || 0;
    const pct = Number(data?.pct) || 0;
    const state = v4GoalState(pct);

    if (variantId === 'week') {
      const week = Array.isArray(data?.week) ? data.week : [];
      const max = Math.max(norm, ...week.map((item) => Number(item?.value) || 0), 1);
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-fiber widget-v4-fiber-week' },
        v4Kicker('Клетчатка · 7 дней'),
        React.createElement('div', { className: 'widget-v4-fiber-week__head' },
          React.createElement('span', {
            className: 'widget-v4-fiber-week__value'
              + (hasData ? ' ' + v4ValueStateClass(state) : '')
          }, hasData ? String(fiber) : '—'),
          hasData ? React.createElement('span', { className: 'widget-v4-unit' }, 'г сегодня') : null,
          norm > 0
            ? React.createElement('span', { className: 'widget-v4-fiber-week__norm' }, 'норма ' + norm)
            : null
        ),
        v4WeekBars(week, max, 'widget-v4-fiber-week__bars', { plotPx: 40, norm })
      );
    }

    if (variantId === 'add') {
      const sources = Array.isArray(data?.sources) ? data.sources.slice(0, 3) : [];
      const remaining = Number(data?.remaining) || 0;
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-fiber widget-v4-fiber-add' },
        React.createElement('div', { className: 'widget-v4-fiber-add__head' },
          v4Kicker('Клетчатка'),
          hasData
            ? React.createElement('span', { className: 'widget-v4-fiber-add__now' }, `${fiber} из ${norm} г`)
            : null
        ),
        React.createElement('div', { className: 'widget-v4-goal-hero' },
          hasData && remaining > 0
            ? React.createElement('span', {
                className: 'widget-v4-goal-value widget-v4-val--neutral'
              }, `+${remaining}`)
            : (hasData ? null : React.createElement('span', {
                className: 'widget-v4-goal-value'
              }, '—')),
          hasData && remaining > 0
            ? React.createElement('span', { className: 'widget-v4-unit' }, 'г добрать')
            : null
        ),
        // Пустой словарь — строка не показывается, плитка не ужимается.
        hasData && sources.length
          ? React.createElement('span', { className: 'widget-v4-hint' }, sources.join(' · '))
          : null
      );
    }

    return React.createElement('div', { className: 'widget-v4-mini widget-v4-fiber' },
      v4Kicker('Клетчатка'),
      React.createElement('div', { className: 'widget-v4-goal-hero' },
        React.createElement('span', {
          className: 'widget-v4-goal-value '
            + (hasData ? v4ValueStateClass(state) : 'widget-v4-goal-value--empty')
        }, hasData ? String(fiber) : '—'),
        hasData ? React.createElement('span', { className: 'widget-v4-unit' }, 'г') : null
      ),
      hasData ? v4GoalBar(pct) : null
    );
  }

  function FiberWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'fiber',
      renderBody: (variantId, meta) => React.createElement(FiberVariantBody, {
        variantId, widget: meta?.widget || widget, data
      })
    });
  }

  /** Белок — кадры 40 «Как сейчас», 41 «Добрать», 42 «По приёмам». */
  function ProteinVariantBody({ variantId, data }) {
    const hasData = data?.hasData === true && data?.protein != null;
    const protein = Number(data?.protein) || 0;
    const target = Number(data?.target) || 0;
    const pct = Number(data?.pct) || 0;
    const state = v4GoalState(pct);

    if (variantId === 'by_meal') {
      const byMeal = Array.isArray(data?.byMeal) ? data.byMeal : [];
      const maxMeal = Math.max(1, ...byMeal.map((item) => Number(item?.grams) || 0));
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-protein widget-v4-protein-meals' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Белок · по приёмам'),
          target > 0
            ? React.createElement('span', { className: 'widget-v4-row__meta' }, `из ${target}`)
            : null
        ),
        React.createElement('div', { className: 'widget-v4-protein-meals__hero' },
          React.createElement('span', {
            className: 'widget-v4-protein-meals__value'
              + (hasData ? ' ' + v4ValueStateClass(state) : '')
          }, hasData ? String(protein) : '—'),
          hasData ? React.createElement('span', { className: 'widget-v4-unit' }, 'г') : null
        ),
        // День без приёмов — подпись, пустые полосы не рисуются.
        byMeal.length
          ? React.createElement('div', { className: 'widget-v4-mealbars widget-v4-protein-meals__bars' },
            byMeal.map((item, index) => {
              const grams = Number(item?.grams) || 0;
              return React.createElement('div', {
                key: `${item.time}_${index}`,
                className: 'widget-v4-mealbars__row'
              },
                React.createElement('span', { className: 'widget-v4-mealbars__time' }, item.time || '—'),
                React.createElement('span', { className: 'widget-v4-mealbars__track' },
                  React.createElement('span', {
                    className: 'widget-v4-mealbars__fill',
                    style: { width: Math.max(2, Math.round((grams / maxMeal) * 100)) + '%' }
                  })
                ),
                React.createElement('span', { className: 'widget-v4-mealbars__num' }, String(grams))
              );
            })
          )
          : React.createElement('span', { className: 'widget-v4-muted' }, 'приёмов не было')
      );
    }

    if (variantId === 'add') {
      // Подсказки нет: словарь «чем добрать» — про клетчатку, источников белка
      // в продукте не существует (решение 22 августа). Шапка и герой — как у
      // клетчатки «Добрать», без hint.
      const remaining = Number(data?.remaining) || 0;
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-protein widget-v4-protein-add' },
        React.createElement('div', { className: 'widget-v4-protein-add__head' },
          v4Kicker('Белок'),
          hasData
            ? React.createElement('span', { className: 'widget-v4-protein-add__now' }, `${protein} из ${target} г`)
            : null
        ),
        React.createElement('div', { className: 'widget-v4-goal-hero' },
          hasData && remaining > 0
            ? React.createElement('span', {
                className: 'widget-v4-goal-value widget-v4-val--neutral'
              }, `+${remaining}`)
            : (hasData ? null : React.createElement('span', {
                className: 'widget-v4-goal-value'
              }, '—')),
          hasData && remaining > 0
            ? React.createElement('span', { className: 'widget-v4-unit' }, 'г добрать')
            : null
        )
      );
    }

    return React.createElement('div', { className: 'widget-v4-mini widget-v4-protein' },
      v4Kicker('Белок'),
      React.createElement('div', { className: 'widget-v4-goal-hero' },
        React.createElement('span', {
          className: 'widget-v4-goal-value '
            + (hasData ? v4ValueStateClass(state) : 'widget-v4-goal-value--empty')
        }, hasData ? String(protein) : '—'),
        hasData ? React.createElement('span', { className: 'widget-v4-unit' }, 'г') : null
      ),
      hasData ? v4GoalBar(pct) : null
    );
  }

  function ProteinWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'protein',
      renderBody: (variantId, meta) => React.createElement(ProteinVariantBody, {
        variantId, widget: meta?.widget || widget, data
      })
    });
  }

  /** Окно до сна — кадры 43 «Как сейчас», 44 «Вечер». */
  function SleepWindowVariantBody({ variantId, data }) {
    const hasData = data?.hasData === true;
    const minutes = Number(data?.minutes) || 0;
    const state = data?.state || 'neutral';
    const bedText = formatHoursColon(data?.bedtime);

    if (variantId === 'evening') {
      const span = Math.max(1, (Number(data?.bedtime) || 0) - (Number(data?.lastMeal) || 0));
      const fill = hasData ? Math.max(4, Math.min(100, (minutes / Math.max(span, minutes)) * 100)) : 0;
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-sleepwindow' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('До сна'),
          React.createElement('span', { className: 'widget-v4-row__meta' },
            data?.bedtimeKnown ? `отбой ${bedText}` : 'отбой не задан'
          )
        ),
        React.createElement('div', { className: 'widget-v4-goal-hero' },
          React.createElement('span', {
            className: 'widget-v4-goal-value ' + v4ValueStateClass(state)
          }, hasData ? formatHoursColon(minutes) : '—'),
          React.createElement('span', { className: 'widget-v4-unit' },
            hasData ? (state === 'good' ? 'окно чистое' : data?.word || '') : 'приёмов не было'
          )
        ),
        hasData
          ? React.createElement('div', { className: 'widget-v4-goalbar widget-v4-goalbar--marked' },
            React.createElement('span', {
              className: 'widget-v4-goalbar__fill ' + v4ValueStateClass(state),
              style: { width: fill + '%' }
            }),
            React.createElement('span', { className: 'widget-v4-goalbar__mark' })
          )
          : null
      );
    }

    // 1×1: слово состояния стоит в одной строке с числом — второй строки под
    // числом в 64 px не существует.
    return React.createElement('div', { className: 'widget-v4-mini widget-v4-sleepwindow' },
      v4Kicker('До сна'),
      React.createElement('div', { className: 'widget-v4-goal-hero' },
        React.createElement('span', {
          className: 'widget-v4-goal-value '
            + (hasData ? v4ValueStateClass(state) : 'widget-v4-goal-value--empty')
        }, hasData ? formatHoursColon(minutes) : '—'),
        React.createElement('span', {
          className: 'widget-v4-unit'
            + (hasData ? '' : ' widget-v4-unit--empty')
        }, hasData ? (data?.word || '') : 'не ел')
      )
    );
  }

  function SleepWindowWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'sleepWindow',
      renderBody: (variantId, meta) => React.createElement(SleepWindowVariantBody, {
        variantId, widget: meta?.widget || widget, data
      })
    });
  }

  /** Качество еды — кадры 45 «Как сейчас», 46 «Что снизило», 47 «Неделя». */
  function FoodQualityVariantBody({ variantId, data }) {
    const hasData = data?.hasData === true && data?.score != null;
    const score = Number(data?.score) || 0;
    // Чернила; от 5 из 10 — шалфей, то есть вредность ≤ 5: тот же порог, что
    // в карточке «Качество еды» на «Питании», своего у виджета нет (решение
    // 22 августа). Красным не красится: низкий балл объясняет вид «Что снизило».
    const state = score >= 5 ? 'good' : 'neutral';

    if (variantId === 'week') {
      const week = Array.isArray(data?.week) ? data.week : [];
      const max = Math.max(10, ...week.map((item) => Number(item?.value) || 0), 1);
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-foodquality widget-v4-foodquality-week' },
        v4Kicker('Качество · 7 дней'),
        React.createElement('div', { className: 'widget-v4-foodquality-week__head' },
          React.createElement('span', {
            className: 'widget-v4-foodquality-week__value'
              + (hasData ? ' ' + v4ValueStateClass('neutral') : '')
          }, hasData ? formatScoreRu(score) : '—'),
          hasData ? React.createElement('span', { className: 'widget-v4-unit' }, 'из 10 сегодня') : null,
          data?.avgWeek != null
            ? React.createElement('span', { className: 'widget-v4-foodquality-week__avg' }, `в среднем ${formatScoreRu(data.avgWeek)}`)
            : null
        ),
        v4WeekBars(week, max, 'widget-v4-foodquality-week__bars', { plotPx: 40 })
      );
    }

    if (variantId === 'why') {
      // Кадр 46: шапка ключ + «N из 10»; герой — дельта и причина соседом,
      // не третьей строкой hint. Empty («приёмов не было») не сводил.
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-foodquality widget-v4-foodquality-why' },
        React.createElement('div', { className: 'widget-v4-foodquality-why__head' },
          v4Kicker('Качество еды'),
          hasData
            ? React.createElement('span', { className: 'widget-v4-foodquality-why__score' }, `${formatScoreRu(score)} из 10`)
            : null
        ),
        React.createElement('div', { className: 'widget-v4-goal-hero' },
          hasData && data?.delta > 0
            ? React.createElement('span', {
                className: 'widget-v4-goal-value widget-v4-val--neutral'
              }, `−${formatScoreRu(data.delta)}`)
            : (hasData ? null : React.createElement('span', {
                className: 'widget-v4-goal-value'
              }, '—')),
          hasData && data?.reason
            ? React.createElement('span', { className: 'widget-v4-unit' }, data.reason)
            : null
        ),
        hasData
          ? null
          : React.createElement('span', { className: 'widget-v4-muted' }, 'приёмов не было')
      );
    }

    return React.createElement('div', { className: 'widget-v4-mini widget-v4-foodquality' },
      v4Kicker('Качество'),
      React.createElement('div', { className: 'widget-v4-goal-hero' },
        React.createElement('span', {
          className: 'widget-v4-goal-value '
            + (hasData ? v4ValueStateClass(state) : 'widget-v4-goal-value--empty')
        }, hasData ? formatScoreRu(score) : '—'),
        hasData ? React.createElement('span', { className: 'widget-v4-unit' }, 'из 10') : null
      ),
      hasData ? v4GoalBar((score / 10) * 100) : null
    );
  }

  function FoodQualityWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'foodQuality',
      renderBody: (variantId, meta) => React.createElement(FoodQualityVariantBody, {
        variantId, widget: meta?.widget || widget, data
      })
    });
  }

  /** Ритм приёмов — кадры 48 «Лента дня», 49 «Интервалы». */
  const RHYTHM_FROM_MIN = 6 * 60;
  const RHYTHM_TO_MIN = 24 * 60;

  function rhythmLeftPct(minutes) {
    const value = Number(minutes) || 0;
    // Приём позже полуночи рисуется у правого края, а не переносится на утро.
    const clamped = Math.max(RHYTHM_FROM_MIN, Math.min(RHYTHM_TO_MIN, value));
    return ((clamped - RHYTHM_FROM_MIN) / (RHYTHM_TO_MIN - RHYTHM_FROM_MIN)) * 100;
  }

  function MealRhythmVariantBody({ variantId, data }) {
    const hasData = data?.hasData === true;
    const meals = Array.isArray(data?.meals) ? data.meals : [];
    const intervals = Array.isArray(data?.intervals) ? data.intervals : [];

    if (variantId === 'intervals') {
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-rhythm' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Ритм · интервалы'),
          React.createElement('span', { className: 'widget-v4-row__meta' },
            `${data?.count || 0} ${ruMealsWord(data?.count || 0)}`
          )
        ),
        React.createElement('div', { className: 'widget-v4-goal-hero' },
          React.createElement('span', { className: 'widget-v4-goal-value widget-v4-val--neutral' },
            data?.avgMinutes != null ? formatHoursColon(data.avgMinutes) : '—'
          ),
          React.createElement('span', { className: 'widget-v4-unit' },
            data?.avgMinutes != null ? 'в среднем между приёмами' : 'интервалов пока нет'
          )
        ),
        intervals.length
          ? React.createElement('div', { className: 'widget-v4-mealbars' },
            intervals.slice(-3).map((item, index) => React.createElement('div', {
              key: `${item.from}_${index}`,
              className: 'widget-v4-mealbars__row'
            },
              React.createElement('span', { className: 'widget-v4-mealbars__time' }, `${item.from} → ${item.to}`),
              React.createElement('span', { className: 'widget-v4-mealbars__track' },
                React.createElement('span', {
                  className: 'widget-v4-mealbars__fill widget-v4-val--good',
                  style: { width: Math.max(4, Math.min(100, (item.minutes / (6 * 60)) * 100)) + '%' }
                })
              ),
              React.createElement('span', { className: 'widget-v4-mealbars__num' }, formatHoursWords(item.minutes))
            ))
          )
          : null
      );
    }

    return React.createElement('div', { className: 'widget-v4-stack widget-v4-rhythm widget-v4-rhythm-day' },
      React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
        v4Kicker('Ритм приёмов'),
        React.createElement('span', { className: 'widget-v4-row__meta' },
          hasData ? `${data.count} за день` : 'приёмов не было'
        )
      ),
      React.createElement('div', { className: 'widget-v4-rhythm__line' },
        React.createElement('span', { className: 'widget-v4-rhythm__track' }),
        // Текущий момент — риска.
        React.createElement('span', {
          className: 'widget-v4-rhythm__now',
          style: { left: rhythmLeftPct(data?.nowMinutes) + '%' }
        }),
        meals.map((item, index) => React.createElement('span', {
          key: `${item.time}_${index}`,
          className: 'widget-v4-rhythm__dot',
          style: { left: rhythmLeftPct(item.minutes) + '%' }
        }))
      ),
      React.createElement('div', { className: 'widget-v4-rhythm__scale' },
        React.createElement('span', null, '6:00'),
        React.createElement('span', null, '24:00')
      )
    );
  }

  function ruMealsWord(count) {
    const n = Math.abs(Number(count) || 0) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return 'приёмов';
    if (last === 1) return 'приём';
    if (last >= 2 && last <= 4) return 'приёма';
    return 'приёмов';
  }

  function MealRhythmWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'mealRhythm',
      renderBody: (variantId, meta) => React.createElement(MealRhythmVariantBody, {
        variantId, widget: meta?.widget || widget, data
      })
    });
  }

  /** Готовность ко сну — кадры 50 «Чек-лист», 51 «Разбор». */
  function sleepReadyItemText(item) {
    if (!item?.hasData) {
      return item.key === 'steps' ? 'без цели' : 'нет данных';
    }
    if (item.key === 'water') return `${formatLitersRu(item.value)} из ${formatRuUnit(formatLitersRu(item.goal), 'л')}`;
    if (item.key === 'food') return `окно ${formatHoursWords(item.value)}`;
    // Кофеин отвечает временем, а не числом: «не пил» — ответ, а не пустота.
    if (item.key === 'caffeine') {
      if (item.value == null) return 'не пил';
      const h = Math.floor(item.value / 60);
      return `в ${String(h).padStart(2, '0')}:${String(item.value % 60).padStart(2, '0')}`;
    }
    return `${formatRuThousands(item.value)} из ${formatRuThousands(item.goal)}`;
  }

  // Почему пункта нет: у каждого своё недостающее поле (строки контракта
  // «кофеин без данных» и «готовность ко сну · нет данных»).
  const SLEEP_READY_MISSING_REASON = {
    water: 'без нормы',
    food: 'без отбоя',
    steps: 'без цели',
    caffeine: 'без ответа'
  };

  // Пункт без своего поля выпадает из счётчика — правило меняет знаменатель,
  // поэтому плитка его называет: «шаги без цели — пункт выпал из счёта» (кадр
  // «Готовность ко сну · пункт без данных»). Иначе «1 из 2» читается как
  // потерянный пункт.
  function sleepReadyDroppedText(items) {
    const dropped = (items || []).filter((item) => item && item.hasData === false);
    if (!dropped.length) return null;
    const names = dropped
      .map((item) => `${String(item.label || '').toLowerCase()} `
        + (SLEEP_READY_MISSING_REASON[item.key] || 'без данных'))
      .join(', ');
    return `${names} — ${dropped.length === 1 ? 'пункт выпал' : 'пункты выпали'} из счёта`;
  }

  function SleepReadyVariantBody({ variantId, data }) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const hasData = data?.hasData === true;
    const window = data?.sleepWindow || null;

    if (variantId === 'review') {
      return React.createElement('div', { className: 'widget-v4-stack widget-v4-sleepready' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('К вечеру'),
          window?.hasData
            ? React.createElement('span', { className: 'widget-v4-row__meta' },
              `до отбоя ${formatHoursColon(window.minutes)}`)
            : null
        ),
        React.createElement('div', { className: 'widget-v4-goal-hero' },
          React.createElement('span', { className: 'widget-v4-goal-value widget-v4-val--neutral' },
            hasData ? String(data.done) : '—'
          ),
          // Крупным — только закрытые пункты; знаменатель со словом уходит в
          // подпись (кадр «Готовность ко сну · Разбор»).
          hasData
            ? React.createElement('span', { className: 'widget-v4-unit' }, `из ${data.total} закрыто`)
            : null
        ),
        hasData
          ? React.createElement('div', { className: 'widget-v4-checklist' },
            items.map((item) => React.createElement('div', {
              key: item.key,
              className: 'widget-v4-checklist__row' + (item.done ? ' is-done' : '')
            },
              React.createElement('span', { className: 'widget-v4-checklist__label' }, item.label),
              React.createElement('span', { className: 'widget-v4-checklist__value' }, sleepReadyItemText(item))
            ))
          )
          : React.createElement('span', { className: 'widget-v4-muted' }, 'нет данных за день')
      );
    }

    const droppedText = hasData ? sleepReadyDroppedText(items) : null;
    return React.createElement('div', { className: 'widget-v4-stack widget-v4-sleepready' },
      React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
        v4Kicker('К вечеру'),
        React.createElement('span', { className: 'widget-v4-row__meta' },
          hasData ? `${data.done} из ${data.total}` : 'нет данных за день'
        )
      ),
      React.createElement('div', { className: 'widget-v4-checklist widget-v4-checklist--dots' },
        // Выпавший пункт объясняем вместо точек: на 2×1 обе строки не встают,
        // а необъяснённый знаменатель дороже перечня точками.
        droppedText
          ? React.createElement('span', { className: 'widget-v4-muted' }, droppedText)
          : items.map((item) => React.createElement('span', {
            key: item.key,
            className: 'widget-v4-checklist__chip'
              + (item.done ? ' is-done' : '')
              + (item.hasData ? '' : ' is-empty')
          },
            React.createElement('i', { className: 'widget-v4-checklist__dot', 'aria-hidden': 'true' }),
            item.label.toLowerCase()
          ))
      )
    );
  }

  function SleepReadyWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'sleepReady',
      renderBody: (variantId, meta) => React.createElement(SleepReadyVariantBody, {
        variantId, widget: meta?.widget || widget, data
      })
    });
  }

  function MacrosVariantBody({ variantId, widget, data, meta = {} }) {
    const { protein, fat, carbs, proteinTarget, fatTarget, carbsTarget, cascade } = data;

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';

    // Плавный пересчёт БЖУ: кольца доезжают/откатываются от предыдущего
    // отображаемого значения, граммы и проценты считаются от него же.
    const [animProtein, animFat, animCarbs] = useWidgetMotionValues(
      [protein || 0, fat || 0, carbs || 0],
      { motionIdPrefix: `${widget?.id || 'macro'}:g` }
    );
    const [animProteinTarget, animFatTarget, animCarbsTarget] = useWidgetMotionValues(
      [proteinTarget || 100, fatTarget || 70, carbsTarget || 250],
      { motionIdPrefix: `${widget?.id || 'macro'}:t` }
    );

    // Расчёт процентов
    const pctP = animProteinTarget > 0 ? Math.round(animProtein / animProteinTarget * 100) : 0;
    const pctF = animFatTarget > 0 ? Math.round(animFat / animFatTarget * 100) : 0;
    const pctC = animCarbsTarget > 0 ? Math.round(animCarbs / animCarbsTarget * 100) : 0;
    const avgPct = Math.round((pctP + pctF + pctC) / 3);
    const showPercentage = widget.settings?.showPercentage !== false;
    const showGrams = widget.settings?.showGrams !== false && !d.isTiny;
    const effectiveShowGrams = showGrams || !showPercentage;
    const centerValueMode = size === '3x2' ? (widget.settings?.centerValueMode || 'grams') : 'default';
    const canUseMacroRings = d.cols >= 2 && d.rows >= 2 && size !== '4x1';
    const ringsDensityClass = d.area >= 12 ? 'widget-macros--rings-lg' : d.area >= 8 ? 'widget-macros--rings-md' : 'widget-macros--rings-sm';

    if (data?.hasData !== true) {
      if (d.cols >= 3 && d.rows >= 2) {
        // Кадр «Кольца БЖУ · пустой день»: кольца на местах пустыми дорожками,
        // под каждым «— / N». Прежде здесь стоял голый прочерк без колец и без
        // норм — норма была известна с утра и всё равно не показывалась.
        return React.createElement('div', { className: 'widget-macros widget-macros--3x2 widget-v4-stack' },
          React.createElement('div', { className: 'widget-v4-macros' },
            v4SageRing({ value: 0, target: proteinTarget, label: 'Белки', toneClass: 'protein', empty: true }),
            v4SageRing({ value: 0, target: fatTarget, label: 'Жиры', toneClass: 'fat', empty: true }),
            v4SageRing({ value: 0, target: carbsTarget, label: 'Углеводы', toneClass: 'carbs', empty: true })
          )
        );
      }
      return v4EmptyTile('БЖУ');
    }

    const macroItems = [
      { label: 'Белки', shortLabel: 'Б', value: animProtein, target: animProteinTarget, pct: pctP, toneClass: 'protein' },
      { label: 'Жиры', shortLabel: 'Ж', value: animFat, target: animFatTarget, pct: pctF, toneClass: 'fat' },
      { label: 'Углеводы', shortLabel: 'У', value: animCarbs, target: animCarbsTarget, pct: pctC, toneClass: 'carbs' }
    ];

    const getMacroValueTone = ({ pct, toneClass }) =>
      HEYS.scales.macroWidgetValueTone(pct, toneClass).color;

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
      const arcValue = value;
      const { ratio, basePct, hasOver, overPct } = macroRingArcPct(arcValue, target, ringCapCompPct);
      const dotColor = ratio > 1 ? '#ef4444' : '#22c55e';
      // Динамические градиенты по соблюдению нормы (берём цвет из HEYS.MacroRings):
      // красный/жёлтый/зелёный/серый. Если core не загружен — fallback на статичный по toneClass.
      const _coreColor = (data && data._rings && data._rings[toneClass]) ? data._rings[toneClass].color : null;
      const _DYNAMIC_GRADIENTS = {
        '#ef4444': ['#fecaca', '#ef4444'], // red
        '#f59e0b': ['#fde68a', '#f59e0b'], // amber
        '#22c55e': ['#bbf7d0', '#22c55e'], // green
        '#6b7280': ['#d1d5db', '#6b7280'], // gray (no norm)
      };
      const _staticGradient = toneClass === 'protein'
        ? ['#fecaca', '#ef4444']
        : (toneClass === 'fat' ? ['#fde68a', '#f59e0b'] : ['#bbf7d0', '#22c55e']);
      const gradientStops = (_coreColor && _DYNAMIC_GRADIENTS[_coreColor]) || _staticGradient;
      const gradientId = `widget-macro-ring-${widget?.id || '0'}-${toneClass}-${(_coreColor || 'default').replace('#', '')}`;
      const _isWarning = _coreColor === '#ef4444';
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
        ? formatRuUnit(Math.min(999, normalizedPct), '%')
        : formatRuNumber(Math.round(value || 0));
      const targetText = hideTarget ? null : (resolvedCenterMode === 'grams' ? `/ ${formatRuUnit(formatRuNumber(Math.round(target || 0)), 'г', { tight: true })}` : null);
      const percentBadge = hidePercentBadge ? null : (showPercentage && resolvedCenterMode === 'grams' ? formatRuUnit(normalizedPct, '%') : null);

      return React.createElement('div', { key: `${toneClass}-${label}`, className: 'macro-ring-item' },
        React.createElement('div', { className: `macro-ring ${toneClass}${hasOver ? ' macro-ring--over' : ''}${_isWarning ? ' macro-ring-pulse' : ''}` },
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
                strokeDasharray: macroRingDasharray(basePct),
                '--ring-dasharray': macroRingDasharray(basePct),
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
                strokeDasharray: macroRingDasharray(overPct, 100 - overPct),
                '--over-dasharray': macroRingDasharray(overPct, 100 - overPct),
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

    // 1x1 — только белок
    if (variantId === 'bars') {
      return React.createElement('div', { className: 'widget-macros widget-macros--bars widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-macro-bars' },
          v4MacroBarRow('Б', animProtein, animProteinTarget, 'protein'),
          v4MacroBarRow('Ж', animFat, animFatTarget, 'fat'),
          v4MacroBarRow('У', animCarbs, animCarbsTarget, 'carbs')
        )
      );
    }

    if (variantId === 'deficits') {
      const items = [
        { label: 'белки', value: animProtein, target: animProteinTarget, toneClass: 'protein' },
        { label: 'углеводы', value: animCarbs, target: animCarbsTarget, toneClass: 'carbs' },
        { label: 'жиры', value: animFat, target: animFatTarget, toneClass: 'fat' }
      ].map((item) => ({
        ...item,
        delta: item.value - item.target,
        abs: Math.abs(item.value - item.target),
        // Тот же компаратор, что у колец и полос: знак дельты сам по себе не
        // говорит, плохо это или нет — недобор белка плох, недобор жиров нет.
        bad: macroDeviationBad(item.value, item.target, item.toneClass)
      }));
      const worst = [...items].sort((a, b) => b.abs - a.abs)[0];
      const others = items.filter((item) => item.label !== worst.label);
      const fmtDelta = (d) => {
        if (Math.abs(d) < 0.5) return '0';
        const sign = d > 0 ? '+' : '−';
        return `${sign}${formatRuNumber(Math.round(Math.abs(d)))}`;
      };
      const worstClass = worst.bad ? 'widget-v4-val--bad' : 'widget-v4-val--neutral';
      return React.createElement('div', { className: 'widget-macros widget-macros--deficits widget-v4-stack' },
        v4Kicker('БЖУ · что выбивается'),
        React.createElement('div', { className: 'widget-v4-deficit-hero ' + worstClass },
          fmtDelta(worst.delta),
          React.createElement('span', { className: 'widget-v4-unit' }, worst.label, ', г')
        ),
        React.createElement('div', { className: 'widget-v4-deficit-rows' },
          others.map((row) => React.createElement('div', {
            key: row.label,
            className: 'widget-v4-deficit-rows__row'
          },
            React.createElement('span', null,
              row.label === 'углеводы' ? 'Углеводы' : (row.label === 'жиры' ? 'Жиры' : 'Белки')
            ),
            React.createElement('span', {
              className: row.bad ? 'widget-v4-val--bad' : 'widget-v4-val--neutral'
            }, fmtDelta(row.delta))
          ))
        )
      );
    }

    if (variantId === 'protein_only') {
      // Кадр «Шторка · Кольца БЖУ», вид «Только белок»: ключ «Белки», под
      // числом норма и дорожка до неё. Прежние «96 г» без нормы и без полосы
      // не отвечали на единственный вопрос вида — далеко ли до цели.
      const proteinTgt = Math.round(animProteinTarget || 0);
      const proteinBad = macroDeviationBad(animProtein, animProteinTarget, 'protein');
      const proteinPct = animProteinTarget > 0
        ? (animProtein / animProteinTarget) * 100
        : 0;
      return React.createElement('div', { className: 'widget-macros widget-macros--1x1 widget-v4-mini' },
        v4Kicker('Белки'),
        React.createElement('div', {
          className: 'widget-v4-mini__value ' + (proteinBad ? 'widget-v4-val--bad' : 'widget-v4-val--neutral')
        },
          formatRuNumber(Math.round(animProtein)),
          proteinTgt > 0
            ? React.createElement('span', { className: 'widget-v4-unit' }, `/${formatRuNumber(proteinTgt)}`)
            : React.createElement('span', { className: 'widget-v4-unit' }, ' г')
        ),
        proteinTgt > 0 ? v4GoalBar(proteinPct, proteinBad ? 'bad' : 'good') : null
      );
    }

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-macros widget-macros--micro widget-v4-mini' },
        v4Kicker('БЖУ'),
        React.createElement('div', { className: 'widget-macros__micro-value' },
          showPercentage
            ? formatRuUnit(Math.min(999, avgPct), '%')
            : formatRuUnit(formatRuNumber(Math.round(animProtein + animFat + animCarbs)), 'г', { tight: true })
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

    if (variantId === 'rings' || size === '3x2') {
      return React.createElement('div', { className: 'widget-macros widget-macros--3x2 widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-macros' },
          v4SageRing({ value: animProtein, target: animProteinTarget, label: 'Белки', toneClass: 'protein' }),
          v4SageRing({ value: animFat, target: animFatTarget, label: 'Жиры', toneClass: 'fat' }),
          v4SageRing({ value: animCarbs, target: animCarbsTarget, label: 'Углеводы', toneClass: 'carbs' })
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
    const MacroBar = ({ label, value, barValue, target, color, cls }) => {
      const barPct = target > 0
        ? Math.min(100, ((barValue != null ? barValue : value) / target) * 100)
        : 0;
      return React.createElement('div', { className: 'widget-macros__row' },
        React.createElement('span', { className: `widget-macros__label ${cls || ''}` }, label),
        React.createElement('div', { className: 'widget-macros__bar-container' },
          React.createElement('div', {
            className: 'widget-macros__bar',
            style: { width: `${barPct}%`, backgroundColor: color }
          })
        ),
        showGrams ? React.createElement('span', { className: 'widget-macros__value' }, formatRuUnit(formatRuNumber(Math.round(value)), 'г', { tight: true })) : null
      );
    };

    // Цвета Б/Ж/У статичны и не зависят от value/target — это ряд «это другая
    // штука», а не оценка. По решению владельца 2026-08-10 категорийная палитра
    // расформирована: три ступени чернил набора вместо трёх сигналов. Ступени
    // производные от --v4-ink, поэтому следуют за палитрой. Вид классики здесь
    // меняется намеренно: цветные метки становятся серыми.
    return React.createElement('div', { className: `widget-macros widget-macros--${variant}` },
      React.createElement(MacroBar, {
        label: 'Б', value: animProtein, barValue: protein, target: proteinTarget || 100, color: 'var(--v4-mark-1)', cls: 'widget-macros__label--prot'
      }),
      React.createElement(MacroBar, {
        label: 'Ж', value: animFat, barValue: fat, target: fatTarget || 70, color: 'var(--v4-mark-2)', cls: 'widget-macros__label--fat'
      }),
      React.createElement(MacroBar, {
        label: 'У', value: animCarbs, barValue: carbs, target: carbsTarget || 250, color: 'var(--v4-mark-3)', cls: 'widget-macros__label--carbs'
      })
    );
  }

  function MacrosWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'macros',
      renderBody: (variantId, meta) => React.createElement(MacrosVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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
        case 'almost': return { emoji: '📉', label: 'Почти закончилась', color: 'var(--v4-warn-soft, #eab308)', short: 'Завершается' };
        case 'soon': return { emoji: '⏳', label: 'Скоро закончится', color: '#22c55e', short: 'Скоро' };
        case 'lipolysis': return { emoji: '✓', label: 'Окно завершено', color: '#10b981', short: 'Завершено' };
        default: return { emoji: '❓', label: 'Нет данных', color: '#94a3b8', short: '—' };
      }
    };

    const info = getStatusInfo();
    const showTimer = widget.settings?.showTimer !== false && Number.isFinite(remaining) && remaining > 0;
    const showPhase = widget.settings?.showPhase !== false && !!phase && !d.isTiny;
    const showLastMeal = widget.settings?.showLastMeal !== false && !!lastMealTime;

    // 1x1 Micro
    if (d.isMicro) {
      return React.createElement('div', { className: 'widget-insulin widget-insulin--micro widget-v4-mini' },
        v4Kicker('Волна'),
        React.createElement('div', { className: 'widget-insulin__micro' },
          React.createElement('span', { className: 'widget-insulin__micro-status' }, info.short),
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
            info.short
          ),
          showLastMeal && React.createElement('div', { className: 'widget-insulin__meal-time' },
            lastMealTime
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
              : (status === 'lipolysis' ? 'ок' : '—')
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
      showTimer ? React.createElement('div', { className: 'widget-insulin__timer' }, formatRuUnit(remaining, 'мин')) : null,
      showPhase ? React.createElement('div', { className: 'widget-insulin__phase' }, phase) : null
    );
  }

  function HeatmapVariantBody({ variantId, widget, data, meta = {} }) {
    const days = data.days || [];
    const requestedPeriod = widget.settings?.period || 'week';
    const configuredPeriod = requestedPeriod === 'month' ? 'week' : requestedPeriod;
    const highlightToday = widget.settings?.highlightToday !== false;

    const d = getWidgetDims(widget);
    const size = widget?.size || '2x2';
    const canShowMonth = configuredPeriod === 'month' && d.area >= 9 && d.rows >= 3;
    const period = canShowMonth ? 'month' : 'week';
    const todayIso = new Date().toISOString().slice(0, 10);

    let renderDays = days;
    if (d.isMicro) {
      renderDays = days.slice(-1);
    } else if (d.isTiny) {
      renderDays = days.slice(-7);
    } else if (period === 'week') {
      renderDays = days.slice(-7);
    }

    const variant = d.isMicro ? 'micro' : d.isTiny ? 'compact' : 'std';

    const buildWeekDayMeta = (day) => {
      const isToday = highlightToday && day?.date === todayIso;

      return {
        day,
        isToday,
        hasTraining: !!day?.hasTraining,
        highStress: !!day?.highStress
      };
    };

    const buildDayTitle = (meta) => {
      const baseDate = formatWidgetHeatmapDayTitle(meta?.day?.date || 'Нет даты');
      const flags = [
        meta?.hasTraining ? 'тренировка' : null,
        meta?.highStress ? 'стресс' : null
      ].filter(Boolean).join(', ');
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
    if (d.isMicro || variantId === 'streak') {
      const streak = data.currentStreak || 0;
      if (variantId === 'streak') {
        return React.createElement('div', { className: 'widget-heatmap widget-heatmap--micro widget-v4-mini' },
          v4Kicker('Серия'),
          // Серию нельзя объявить плохой или хорошей: её длина — факт, а не
          // оценка (канвас v4, строка 97) — число всегда чернила.
          React.createElement('div', { className: 'widget-v4-mini__value widget-v4-val--neutral' },
            streak,
            React.createElement('span', { className: 'widget-v4-unit' }, ' дня')
          )
        );
      }
      const todayMeta = buildWeekDayMeta(renderDays[0] || {}, 0);
      return React.createElement('div', { className: 'widget-heatmap widget-heatmap--micro' },
        renderHeatmapCell(todayMeta, 0, 'widget-heatmap__cell--micro')
      );
    }

    if (size === '2x1' || size === '3x1' || variantId === 'week_bar') {
      const week = days.slice(-7);
      while (week.length < 7) week.unshift(null);
      const filled = week.filter((day) =>
        day?.status === 'green' || day?.status === 'good' || day?.status === 'ok'
      ).length;
      // Строка контракта «тепловая карта»: у клеток своя шкала плотности в
      // одном тоне, а не роли состояния. Роль остаётся только у итогового
      // числа над картой.
      const barTone = (status) => {
        if (status === 'green' || status === 'good' || status === 'ok') return 'd3';
        if (status === 'yellow' || status === 'warn') return 'd2';
        if (status === 'red') return 'd1';
        return 'empty';
      };
      return React.createElement('div', { className: `widget-heatmap widget-heatmap--${size} widget-v4-stack` },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Тепловая карта'),
          React.createElement('span', {
            className: 'widget-v4-row__meta widget-v4-row__meta--count '
              + v4ValueStateClass(v4HeatmapMetaState(filled, 7))
          }, `${filled} из 7`)
        ),
        React.createElement('div', { className: 'widget-v4-heat' },
          week.map((day, index) => React.createElement('span', {
            key: `${day?.date || 'empty'}-${index}`,
            className: `widget-v4-heat__bar widget-v4-heat__bar--${barTone(day?.status)}`
          }))
        )
      );
    }

    if (size === '2x2' || variantId === 'month_grid') {
      if (variantId === 'month_grid') {
        const monthDays = days.slice(-28);
        while (monthDays.length < 28) monthDays.unshift(null);
        const filled28 = data.monthFilledCount ?? monthDays.filter((day) =>
          day?.status === 'green' || day?.status === 'good' || day?.status === 'ok'
        ).length;
        // Та же строка «тепловая карта»: шкала плотности, не роли состояния.
        const barTone = (status) => {
          if (status === 'green' || status === 'good' || status === 'ok') return 'd3';
          if (status === 'yellow' || status === 'warn') return 'd2';
          if (status === 'red') return 'd1';
          return 'empty';
        };
        return React.createElement('div', { className: 'widget-heatmap widget-heatmap--2x2 widget-v4-stack' },
          v4Kicker('Тепловая карта'),
          React.createElement('div', { className: 'widget-heatmap__month-grid' },
            monthDays.map((day, index) => React.createElement('span', {
              key: `${day?.date || 'empty'}-${index}`,
              className: `widget-heatmap__cell widget-heatmap__cell--month widget-heatmap__cell--${day?.status || 'empty'}`
            }))
          ),
          // Полоса последней недели под сеткой снята 31 августа: кадр «Месяц
          // целиком» её не рисует, а нижний ряд самой сетки — это те же семь
          // дней. Две картинки об одном рядом читаются как разные данные.
          React.createElement('div', { className: 'widget-heatmap__month-meta' },
            `${filled28} из 28 дней в норме`
          )
        );
      }
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

  function HeatmapWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'heatmap',
      renderBody: (variantId, meta) => React.createElement(HeatmapVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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
      return React.createElement('div', { className: 'widget-cycle widget-cycle--micro widget-v4-mini' },
        v4Kicker('Цикл'),
        React.createElement('div', { className: 'widget-cycle__day' }, day)
      );
    }

    // 2x2 — Оптимальный layout с кольцевым прогрессом
    if (size === '2x2') {
      const progressPct = Math.round((day / cycleLength) * 100);
      const phaseColor = phase?.color || 'var(--v4-wgt-magenta, #ec4899)';

      // SVG кольцо
      const ringSize = 48;
      const strokeWidth = 5;
      const radius = (ringSize - strokeWidth) / 2;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset = circumference - (progressPct / 100) * circumference;

      return React.createElement('div', { className: 'widget-cycle widget-cycle--2x2' },
        // Верх: фаза — только слово. Запрос 26.08 снял символ фазы из
        // интерфейса: метку несут форма и тон. Значок остаётся в каталоге фаз
        // ради легаси-потребителей, но сюда не выводится; гейт зоны cycle
        // сторожит это чтением самого блока.
        phase && widget.settings?.showPhase !== false && React.createElement('div', { className: 'widget-cycle__phase-header', style: { color: phaseColor } },
          phase.name
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
              fill: 'none', stroke: 'var(--v4-wgt-rose, #fce7f3)', strokeWidth
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
        phase.name
      ),
      widget.settings?.showCorrections !== false && recommendation && !d.isTiny
        ? React.createElement('div', { className: 'widget-cycle__tip' }, recommendation)
        : null
    );
  }

  // === Weight Dynamics v4 (канвас home-widgets) ===
  const WEIGHT_DYNAMICS_CLICK_GUARD_MS = 900;
  const WEIGHT_DYNAMICS_VALUE_MS = 1400;
  const WEIGHT_DYNAMICS_DRAW_MS = WIDGET_V4_SPARK_DRAW_MS;
  const WEIGHT_DYNAMICS_CHART_DELAY_MS = WIDGET_V4_SPARK_DELAY_MS;
  const WEIGHT_DYNAMICS_EL_IN_MS = 520;

  const weightDynamicsClickGuard = {
    _until: new Map(),
    _globalUntil: 0,
    block(widgetId, ms = WEIGHT_DYNAMICS_CLICK_GUARD_MS) {
      const until = Date.now() + ms;
      this._globalUntil = Math.max(this._globalUntil, until);
      if (widgetId) this._until.set(widgetId, until);
    },
    isBlocked(widgetId) {
      if (Date.now() < this._globalUntil) return true;
      if (!widgetId) return false;
      const until = this._until.get(widgetId) || 0;
      if (Date.now() < until) return true;
      if (until) this._until.delete(widgetId);
      return false;
    }
  };
  HEYS.Widgets.weightDynamicsClickGuard = weightDynamicsClickGuard;

  function stopEventBubble(event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
  }

  function v4WeightDeltaStateFromDynamics(dyn) {
    if (!dyn) return 'neutral';
    return dyn.deltaState || 'neutral';
  }

  function weightDynamicsRemainderMeta(dyn, variant) {
    if (!dyn?.goalWeight || dyn.goalReached) {
      return dyn?.goalReached ? 'цель взята' : null;
    }
    if (variant === 'bar_remainder' || variant === 'to_goal') {
      return dyn.remainderShort;
    }
    return dyn.remainderLabel;
  }

  function formatAnimDeltaKg(deltaKg) {
    if (!Number.isFinite(deltaKg)) return { sign: '', text: '—' };
    if (Math.abs(deltaKg) <= 0.2) return { sign: '', text: '0,0' };
    const sign = deltaKg < 0 ? '−' : '+';
    return { sign, text: formatRuDecimal(Math.abs(deltaKg), 1) };
  }

  function weightDynamicsEntranceTotalMs() {
    return WEIGHT_DYNAMICS_EL_IN_MS + WEIGHT_DYNAMICS_CHART_DELAY_MS + WEIGHT_DYNAMICS_DRAW_MS + 80;
  }

  function wdElClass(role, isTile, playEntrance = widgetV4ShouldAnimateSparkDraw()) {
    if (!isTile) return '';
    const base = `widget-wd__el widget-wd__el--${role}`;
    return playEntrance ? `${base} widget-wd__el--in` : base;
  }

  function useWeightDynamicsSceneEntrance(sceneKey) {
    const [playEntrance, setPlayEntrance] = useState(() => widgetV4ShouldAnimateSparkDraw());
    const seenKeyRef = useRef(sceneKey);
    useEffect(() => {
      if (sceneKey === seenKeyRef.current) return;
      seenKeyRef.current = sceneKey;
      setPlayEntrance(true);
      const t = setTimeout(() => setPlayEntrance(false), weightDynamicsEntranceTotalMs());
      return () => clearTimeout(t);
    }, [sceneKey]);
    return playEntrance;
  }

  function weightDynamicsPointsToPath(points) {
    return v4SparkPointsToPath(points);
  }

  function WeightDynamicsSparkSvg({ sparkline, stateClass, compact, playEntrance = widgetV4ShouldAnimateSparkDraw() }) {
    const pathD = React.useMemo(() => weightDynamicsPointsToPath(sparkline?.points), [sparkline?.points]);
    const last = sparkline?.last;
    const { pathRef, lineStyle, dotStyle } = useV4SparkPathDraw(pathD, {
      enabled: !compact,
      compact,
      delayMs: WEIGHT_DYNAMICS_CHART_DELAY_MS,
      drawMs: WEIGHT_DYNAMICS_DRAW_MS
    });

    if (!pathD) return null;

    return React.createElement('svg', {
      className: 'widget-wd__spark ' + (stateClass || '') + (compact ? '' : ' ' + wdElClass('chart', true, playEntrance)),
      width: 58,
      height: 24,
      viewBox: '0 0 58 24',
      fill: 'none',
      'aria-hidden': 'true'
    },
      React.createElement('path', {
        ref: pathRef,
        className: 'widget-wd__spark-line',
        d: pathD,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: lineStyle
      }),
      last ? React.createElement('circle', {
        className: 'widget-wd__spark-dot',
        cx: last.x,
        cy: last.y,
        r: 2.4,
        fill: 'currentColor',
        style: dotStyle
      }) : null
    );
  }

  /**
   * Вид «График» 2×2 — кадр «Динамика · E график 2×2 · рисунок 01–03»: поле
   * 100 % × 54 при viewBox 0 0 121 54, заливка под кривой currentColor .12,
   * линия 2 px с non-scaling-stroke.
   *
   * Линия здесь не дорисовывается штрихом, как спарклайн 2×1: при
   * preserveAspectRatio="none" длина пути считается в единицах viewBox, а
   * толщина — в экранных, и dash-узор разъезжается с самой линией. Проявление
   * даёт .widget-wd__el--chart, оно же и в остальных видах.
   */
  function WeightDynamicsChartSvg({ chart, stateClass, compact, playEntrance = widgetV4ShouldAnimateSparkDraw() }) {
    const pathD = React.useMemo(() => weightDynamicsPointsToPath(chart?.points), [chart?.points]);
    if (!pathD) return null;

    return React.createElement('span', {
      className: 'widget-wd__chart ' + (stateClass || '')
        + (compact ? '' : ' ' + wdElClass('chart', true, playEntrance))
    },
      React.createElement('svg', {
        className: 'widget-wd__chart-svg',
        width: '100%',
        height: 54,
        viewBox: '0 0 121 54',
        preserveAspectRatio: 'none',
        fill: 'none',
        'aria-hidden': 'true'
      },
        chart?.area ? React.createElement('path', {
          className: 'widget-wd__chart-area',
          d: chart.area,
          fill: 'currentColor',
          opacity: 0.12
        }) : null,
        React.createElement('path', {
          className: 'widget-wd__chart-line',
          d: pathD,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          vectorEffect: 'non-scaling-stroke'
        })
      )
    );
  }

  // Кадр «Динамика · E график 2×2 · 03»: ключ «Динамика · 30 дней». Окно у
  // виджета растёт само (7 / 14 / 21 / 30 по числу подтверждённых взвешиваний,
  // решение 20 августа), поэтому число берётся у окна, а не печатается 30
  // всегда: иначе плитка обещала бы месяц, показывая неделю.
  function weightDynamicsChartKicker(dyn) {
    const days = dyn?.window?.windowDays;
    const n = Number.isFinite(days) && days > 0 ? days : 30;
    if (n % 10 === 1 && n % 100 !== 11) return `Динамика · ${n} день`;
    return `Динамика · ${n} дней`;
  }

  function WeightDynamicsProgressBar({ pct, stateClass, compact, playEntrance = widgetV4ShouldAnimateSparkDraw() }) {
    const width = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
    const trackClass = compact
      ? 'widget-wd__bar-track'
      : 'widget-wd__bar-track ' + wdElClass('chart', true, playEntrance);
    return React.createElement('span', {
      className: trackClass
    },
      React.createElement('span', {
        className: 'widget-wd__bar-fill ' + (stateClass || ''),
        style: compact
          ? { width: `${width}%` }
          : { '--wd-bar-pct': `${width}%` }
      })
    );
  }

  function WeightDynamicsWeekBars({ bars, compact, playEntrance = widgetV4ShouldAnimateSparkDraw() }) {
    if (!bars?.length) return null;
    if (compact) playEntrance = false;
    return React.createElement('div', { className: 'widget-wd__weeks' },
      bars.map((bar, i) => React.createElement('span', {
        key: i,
        className: [
          'widget-wd__week-col',
          playEntrance ? 'widget-wd__el' : '',
          playEntrance ? 'widget-wd__el--chart' : '',
          playEntrance ? 'widget-wd__el--in' : '',
          playEntrance && !compact ? `widget-wd__el--week-${i + 1}` : '',
          v4ValueStateClass(bar.isLast ? bar.state : 'neutral')
        ].filter(Boolean).join(' '),
        style: { '--wd-week-h': `${bar.heightPct}%` }
      }))
    );
  }

  function useWeightDynamicsMotion(widget, dyn) {
    const wid = widget?.id || 'wd';
    const motionMs = WEIGHT_DYNAMICS_VALUE_MS;
    const animDelta = useWidgetMotionValue(dyn?.deltaKg ?? 0, {
      motionId: `${wid}:delta`,
      duration: motionMs,
      quantize: 0.1
    });
    const animGoalPct = useWidgetMotionValue(dyn?.goalProgressPct ?? 0, {
      motionId: `${wid}:goalPct`,
      duration: motionMs
    });
    const animToGoal = useWidgetMotionValue(Math.abs(dyn?.toGoalKg ?? 0), {
      motionId: `${wid}:toGoal`,
      duration: motionMs
    });
    const animMonthRate = useWidgetMotionValue(dyn?.monthRateKg ?? 0, {
      motionId: `${wid}:monthRate`,
      duration: motionMs
    });
    return {
      delta: animDelta,
      goalPct: animGoalPct,
      toGoal: animToGoal,
      monthRate: animMonthRate
    };
  }

  function WeightDynamicsBody({ variant, dyn, widget, compact }) {
    const motion = compact ? null : useWeightDynamicsMotion(widget, dyn);
    return renderWeightDynamicsBody(variant, dyn, { compact, motion });
  }

  // Шапка вида «Только цифра»: у голого числа без графики она и объясняет, что
  // это за число (кадр «Динамика · B изменение»). «Сброшено» верно только при
  // снижении, поэтому рост говорит «Набрано», а плато — окно без глагола: в
  // мёртвой зоне ±0,2 кг ни сброса, ни набора не было. Знак берём из
  // посчитанной дельты, а не из анимированной, чтобы шапка не мигала.
  function weightDynamicsDeltaKicker(dyn, windowLabel) {
    const short = dyn?.hasDynamics ? dyn?.window?.shortLabel : null;
    if (!short) return windowLabel;
    if (dyn?.delta?.sign === '−') return `Сброшено за ${short}`;
    if (dyn?.delta?.sign === '+') return `Набрано за ${short}`;
    return windowLabel;
  }

  function renderWeightDynamicsBody(variant, dyn, opts = {}) {
    const {
      compact = false,
      motion = null,
      playEntrance = compact ? false : widgetV4ShouldAnimateSparkDraw()
    } = opts;
    const isTile = !compact;
    const stateClass = v4ValueStateClass(v4WeightDeltaStateFromDynamics(dyn));
    const windowLabel = dyn?.window?.label || 'Вес за месяц';
    const remainder = weightDynamicsRemainderMeta(dyn, variant);
    const delta = motion?.delta != null
      ? formatAnimDeltaKg(motion.delta)
      : (dyn?.delta || { sign: '', text: '—' });
    const deltaLine = dyn?.hasDynamics
      ? React.createElement('span', { className: 'widget-wd__delta ' + stateClass + ' ' + wdElClass('value', isTile, playEntrance) },
        delta.sign,
        delta.text,
        React.createElement('span', { className: 'widget-v4-unit' }, 'кг')
      )
      : React.createElement('span', { className: 'widget-wd__placeholder ' + wdElClass('value', isTile, playEntrance) }, dyn?.placeholder || 'нужна неделя');

    const headerRight = remainder
      ? React.createElement('span', { className: 'widget-wd__remainder ' + wdElClass('meta', isTile, playEntrance) }, remainder)
      : null;

    const monthRate = Number.isFinite(motion?.monthRate ?? dyn?.monthRateKg)
      ? (() => {
        const rate = motion?.monthRate ?? dyn.monthRateKg;
        return `${rate < 0 ? '−' : '+'}${formatRuDecimal(Math.abs(rate), 1)} / мес`;
      })()
      : null;

    if (variant === 'weeks') {
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget-wd__head' },
          React.createElement('span', { className: 'widget-v4-kicker ' + wdElClass('kicker', isTile, playEntrance) }, 'Вес по неделям'),
          dyn?.hasDynamics
            ? React.createElement('span', { className: 'widget-wd__side-delta ' + stateClass + ' ' + wdElClass('meta', isTile, playEntrance) },
              delta.sign, delta.text)
            : null
        ),
        dyn?.hasDynamics
          ? WeightDynamicsWeekBars({ bars: dyn.weeklyBars, compact, playEntrance })
          : React.createElement('div', { className: 'widget-wd__placeholder-row' }, deltaLine)
      );
    }

    if (variant === 'to_goal') {
      const remainAbs = Number.isFinite(motion?.toGoal)
        ? motion.toGoal
        : (Number.isFinite(dyn?.toGoalKg) ? Math.abs(dyn.toGoalKg) : null);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget-wd__head' },
          React.createElement('span', { className: 'widget-v4-kicker ' + wdElClass('kicker', isTile, playEntrance) }, 'До цели'),
          monthRate
            ? React.createElement('span', { className: 'widget-wd__side-delta ' + stateClass + ' ' + wdElClass('meta', isTile, playEntrance) }, monthRate)
            : null
        ),
        dyn?.goalReached
          ? React.createElement('div', { className: 'widget-wd__goal-main ' + wdElClass('value', isTile, playEntrance) }, 'цель взята')
          : React.createElement(React.Fragment, null,
            remainAbs != null
              ? React.createElement('div', { className: 'widget-wd__goal-main ' + wdElClass('value', isTile, playEntrance) },
                formatRuDecimal(remainAbs, 1),
                React.createElement('span', { className: 'widget-v4-unit' }, 'кг')
              )
              : deltaLine,
            WeightDynamicsProgressBar({
              pct: motion?.goalPct ?? dyn?.goalProgressPct,
              stateClass,
              compact,
              playEntrance
            })
          )
      );
    }

    if (variant === 'number_only') {
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget-wd__head' },
          React.createElement('span', { className: 'widget-v4-kicker ' + wdElClass('kicker', isTile, playEntrance) },
            weightDynamicsDeltaKicker(dyn, windowLabel))
        ),
        React.createElement('div', { className: 'widget-wd__num-row' },
          deltaLine,
          dyn?.hasDynamics && delta.sign === '−'
            ? React.createElement('span', {
              className: 'widget-wd__arrow ' + stateClass + ' ' + wdElClass('chart', isTile, playEntrance),
              'aria-hidden': 'true'
            },
              React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
                React.createElement('path', { d: 'M12 5v14M6 13l6 6 6-6' })
              ))
            : null
        )
      );
    }

    if (variant === 'bar_remainder') {
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget-wd__head' },
          React.createElement('span', { className: 'widget-v4-kicker ' + wdElClass('kicker', isTile, playEntrance) }, windowLabel),
          headerRight
        ),
        React.createElement('div', { className: 'widget-wd__num-row' }, deltaLine),
        WeightDynamicsProgressBar({
          pct: motion?.goalPct ?? dyn?.goalProgressPct,
          stateClass,
          compact,
          playEntrance
        })
      );
    }

    // Кадр «Динамика · E график 2×2»: шапка «Динамика · N дней» и остаток
    // (01–04), под ней число с единицей через 8 px (05–06), график прижат к
    // низу (07).
    if (variant === 'chart') {
      const head = React.createElement('div', { className: 'widget-wd__head' },
        React.createElement('span', { className: 'widget-v4-kicker ' + wdElClass('kicker', isTile, playEntrance) },
          weightDynamicsChartKicker(dyn)),
        headerRight
      );
      if (!dyn?.hasDynamics) {
        return React.createElement(React.Fragment, null, head, deltaLine);
      }
      return React.createElement(React.Fragment, null,
        head,
        React.createElement('div', { className: 'widget-wd__chart-value ' + wdElClass('value', isTile, playEntrance) },
          React.createElement('span', { className: 'widget-v4-mini__value ' + stateClass }, delta.sign, delta.text),
          React.createElement('span', { className: 'widget-v4-unit' }, 'кг')
        ),
        React.createElement(WeightDynamicsChartSvg, {
          chart: dyn.chart,
          stateClass,
          compact,
          playEntrance
        })
      );
    }

    // curve (default)
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'widget-wd__head' },
        React.createElement('span', { className: 'widget-v4-kicker ' + wdElClass('kicker', isTile, playEntrance) }, windowLabel),
        headerRight
      ),
      React.createElement('div', { className: 'widget-wd__curve-row' },
        deltaLine,
        dyn?.hasDynamics
          ? React.createElement(WeightDynamicsSparkSvg, { sparkline: dyn.sparkline, stateClass, compact, playEntrance })
          : null
      )
    );
  }

  function CrashRiskDynamicsVariantTile({ widget, data }) {
    const dyn = data?.dynamicsV4 || null;
    const V4 = HEYS.Widgets.VariantsV4;
    const hook = V4.useWidgetVariantTile({
      widget,
      widgetType: 'crashRisk',
      disabled: isWidgetV4EditMode(),
      onVariantSaved: ({ widgetId, variant }) => {
        HEYS.Widgets.emit?.('weightDynamics:variantSaved', { widgetId, variant });
      },
      renderPreview: (id) => renderWeightDynamicsBody(id, dyn, { compact: true })
    });
    const motion = useWeightDynamicsMotion(widget, dyn);
    const variantId = hook.renderVariant;
    const playSceneEntrance = useWeightDynamicsSceneEntrance(`${variantId}:${hook.sceneId}`);
    const size = widget?.size || '2x1';
    const stateClass = v4ValueStateClass(v4WeightDeltaStateFromDynamics(dyn));

    let inner;
    // Вид «График» 2×2 идёт общим путём сцены: у него те же движение числа и
    // поэлементное проявление, что у остальных видов. Отдельная ветка рисовала
    // спарклайн 2×1 под ключом «Динамика» — ни то, ни другое кадру не отвечало.
    if (variantId === 'compact' && size === '1x1') {
      const delta = motion?.delta != null
        ? formatAnimDeltaKg(motion.delta)
        : formatAnimDeltaKg(dyn?.deltaKg ?? 0);
      inner = React.createElement('div', { className: 'widget-v4-mini' },
        v4Kicker('Динамика'),
        React.createElement('span', { className: 'widget-v4-mini__value ' + stateClass },
          delta.sign,
          delta.text,
          React.createElement('span', { className: 'widget-v4-unit' }, ' кг')
        )
      );
    } else {
      inner = React.createElement('div', {
        key: `wd-scene-${variantId}-${hook.sceneId}`,
        className: 'widget-wd__scene animate-always' + (playSceneEntrance ? ' widget-wd__scene--entrance' : ''),
        style: {
          '--widget-wd-motion-ms': `${WEIGHT_DYNAMICS_VALUE_MS}ms`,
          '--widget-wd-draw-ms': `${WEIGHT_DYNAMICS_DRAW_MS}ms`,
          '--widget-wd-el-in-ms': `${WEIGHT_DYNAMICS_EL_IN_MS}ms`,
          '--widget-wd-chart-delay': `${WEIGHT_DYNAMICS_CHART_DELAY_MS}ms`
        }
      },
        renderWeightDynamicsBody(variantId, dyn, { compact: false, motion, playEntrance: playSceneEntrance })
      );
    }

    const tileClass = [
      'widget-wd',
      'widget-v4-stack',
      'animate-always',
      hook.holding ? 'widget-wd--holding' : '',
      hook.tileProps?.className || ''
    ].filter(Boolean).join(' ');

    return React.createElement(React.Fragment, null,
      React.createElement('div', {
        className: tileClass,
        onPointerDown: hook.tileProps?.onPointerDown,
        onPointerMove: hook.tileProps?.onPointerMove,
        onPointerUp: hook.tileProps?.onPointerUp,
        onPointerCancel: hook.tileProps?.onPointerCancel,
        onClick: hook.tileProps?.onClick
      }, inner),
      hook.sheetProps ? React.createElement(V4.WidgetVariantSheet, hook.sheetProps) : null
    );
  }

  // === Crash Risk Widget Content v2.0 (EWS + Weight Loss Detection) ===
  function CrashRiskWidgetContent({ widget, data }) {
    const hasData = data?.hasData || false;
    const message = data?.message || '';

    if (!hasData) {
      if (data?.emptyReason === 'insufficient_history') {
        return data?.dynamicsV4
          ? React.createElement(CrashRiskDynamicsVariantTile, { widget, data })
          : v4EmptyTile('Первые дни', 'нужна неделя');
      }
      return v4EmptyTile('Динамика веса', 'данные недоступны');
    }

    if (data?.dynamicsV4) {
      return React.createElement(CrashRiskDynamicsVariantTile, { widget, data });
    }

    return v4EmptyTile('Динамика веса', message || 'нужна неделя');
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

  // Канвас «Риск-радар»: шкала из четырёх ступеней, и подпись уровня во всех
  // видах берётся из неё же — иначе плитка и шкала называют одно разными словами.
  function relapseCanvasLevel(level) {
    if (level === 'critical') return { word: 'критичный', index: 3 };
    if (level === 'high') return { word: 'высокий', index: 2 };
    if (level === 'elevated' || level === 'guarded' || level === 'medium') {
      return { word: 'средний', index: 1 };
    }
    return { word: 'низкий', index: 0 };
  }

  function getRelapseLevelLabel(level) {
    switch (level) {
      case 'critical': return 'критично';
      case 'high': return 'высокий';
      case 'elevated': return 'повышен';
      case 'guarded': return 'осторожно';
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
    if (completeDays >= totalDays * 0.5) return `${formatRuUnit(completeDays + '/' + totalDays, 'дней')} достаточно полные`;
    return `${formatRuUnit(completeDays + '/' + totalDays, 'дней')} слабо заполнены`;
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
      medium: 'var(--v4-warn-soft, #eab308)',
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
        }, formatRuUnit(safeRisk, '%')),
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
      // HEYS.norms не существует (DERIVED_FIELDS_AUDIT_2026-08-02.md) — считаем
      // сразу через TDEE, с dayData вместо голого profile.
      const targets = HEYS.TDEE?.resolveDailyTargets?.(profile, dayData);
      const normAbs = (targets && targets.kcal > 0) ? targets : {};
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

  function RelapseRiskVariantBody({ variantId, widget, data, meta = {} }) {
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

    if (variantId === 'main' || (d.isShort && variantId !== 'list')) {
      // Канвас «Риск-радар · Главный риск»: уровень подписью справа в шапке,
      // внизу назван сам риск и сколько он держится.
      const canvasLevel = relapseCanvasLevel(level);
      const driverLabel = primaryDriver?.label || primaryDriver?.key || 'нет факторов';
      const driverMeta = primaryDriver?.text || primaryDriver?.value || '';
      return React.createElement('div', { className: 'widget-relapse-risk widget-relapse-risk--2x1 widget-v4-stack' },
        React.createElement('div', { className: 'widget-v4-row widget-v4-row--tight' },
          v4Kicker('Риск-радар'),
          React.createElement('span', {
            className: 'widget-risk-level ' + v4ValueStateClass(v4RiskLevelState(level))
          }, canvasLevel.word)
        ),
        React.createElement('div', { className: 'widget-risk-main' },
          React.createElement('span', { className: 'widget-risk-main__driver' }, driverLabel),
          driverMeta
            ? React.createElement('span', { className: 'widget-v4-unit' }, driverMeta)
            : null
        )
      );
    }

    if (variantId === 'scale' && size === '2x2') {
      // Канвас «Риск-радар · Шкала»: слово уровня, четыре отрезка и строка
      // «поднимут: …» — что именно двинет уровень вверх.
      const canvasLevel = relapseCanvasLevel(level);
      const riseText = primaryDrivers
        .map((driver) => [
          String(driver?.label || driver?.key || '').toLowerCase(),
          driver?.text || driver?.value || ''
        ].filter(Boolean).join(' ').trim())
        .filter(Boolean)
        .join(', ');
      return React.createElement('div', { className: 'widget-relapse-risk widget-relapse-risk--2x2 widget-v4-stack' },
        v4Kicker('Риск-радар'),
        React.createElement('div', { className: 'widget-v4-hero-num widget-risk-scale-hero' },
          React.createElement('div', {
            className: 'widget-v4-hero-num__val widget-v4-hero-num__val--risk ' + v4ValueStateClass(v4RiskLevelState(level))
          }, canvasLevel.word)
        ),
        React.createElement('div', { className: 'widget-risk-steps' },
          [0, 1, 2, 3].map((i) => React.createElement('span', {
            key: i,
            className: 'widget-risk-steps__seg'
              + (i === canvasLevel.index
                ? ' widget-risk-steps__seg--on ' + v4ValueStateClass(v4RiskLevelState(level))
                : '')
          }))
        ),
        riseText
          ? React.createElement('div', { className: 'widget-risk-rise' }, `поднимут: ${riseText}`)
          : null
      );
    }

    if (size === '2x2' || variantId === 'list') {
      const levelWord = relapseCanvasLevel(level).word;
      const sleepDriver = primaryDrivers.find((d) => /сон|недосып|sleep/i.test(`${d?.label || ''} ${d?.key || ''}`));
      const relapseDriver = primaryDrivers.find((d) => /срыв|relapse|эмоц/i.test(`${d?.label || ''} ${d?.key || ''}`));
      const driverRows = [
        {
          label: 'Срывы',
          value: relapseScore < 20 && !relapseDriver ? 'нет' : (relapseDriver?.text || relapseDriver?.value || (relapseScore ? formatRuUnit(relapseScore, '%') : 'нет')),
          warn: relapseScore >= 20
        },
        {
          label: 'Недосып',
          value: sleepDriver?.text || sleepDriver?.value || (crashScore >= 20 ? `${crashScore}` : 'нет'),
          warn: !!(sleepDriver || crashScore >= 20)
        }
      ];
      return React.createElement('div', { className: 'widget-relapse-risk widget-relapse-risk--2x2 widget-v4-stack' },
        v4Kicker('Риск-радар'),
        React.createElement('div', { className: 'widget-v4-hero-num' },
          React.createElement('div', {
            className: 'widget-v4-hero-num__val widget-v4-hero-num__val--risk ' + v4ValueStateClass(v4RiskLevelState(level))
          }, levelWord)
        ),
        React.createElement('div', { className: 'widget-v4-kv' },
          driverRows.map((driver, index) => React.createElement('div', {
            key: `${driver?.key || driver?.label || 'd'}-${index}`,
            className: 'widget-v4-kv__row'
          },
            React.createElement('span', null, driver?.label || driver?.key || 'Фактор'),
            React.createElement('span', {
              className: driver?.warn ? 'widget-v4-val--act' : 'widget-v4-val--good'
            }, driver?.value)
          ))
        )
      );
    }

    const showDrivers = widget.settings?.showDrivers !== false;
    const showRecommendation = widget.settings?.showRecommendation !== false;
    const showConfidence = widget.settings?.showConfidence !== false;
    const showSource = widget.settings?.showSource !== false;
    const srcLabel = getSourceLabel();
    const riskSummaryLabel = [
      `пик ${formatRuUnit(topWindowScore, '%')} ${topWindowLabel}`,
      showConfidence ? `conf ${formatRuUnit(confidence, '%')}` : null,
      // Источник — какой движок дал этот балл. Тумблер объявлен в реестре
      // (heys_widgets_registry_v1.js:603), но раньше ничего не рендерил.
      showSource && srcLabel ? `источник ${srcLabel.toLowerCase()}` : null
    ].filter(Boolean).join(' · ');

    return React.createElement('div', { className: `widget-relapse-risk widget-relapse-risk--${variant}` },
      React.createElement('div', { className: 'widget-relapse-risk__top' },
        React.createElement('div', { className: 'widget-relapse-risk__value', style: { color } }, formatRuUnit(score, '%')),
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

  function RelapseRiskWidgetContent({ widget, data }) {
    return React.createElement(WidgetV4VariantShell, {
      widget,
      widgetType: 'relapseRisk',
      renderBody: (variantId, meta) => React.createElement(RelapseRiskVariantBody, {
        variantId,
        widget: meta?.widget || widget,
        data,
        meta
      })
    });
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

    const getColor = (s) => widgetHealthScoreColor(s);

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
              }, `${dirArrow} ${formatRuUnit(formatRuDecimal(absPct, 1), '%')}`),
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
                React.createElement('span', { style: { fontWeight: 600 } }, formatRuUnit(formatRuDecimal(currentWeight, 1), 'кг'))
              ),
              firstWeight > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, `${formatRuUnit(dataPoints, 'дн.')} назад`),
                React.createElement('span', { style: { fontWeight: 600 } }, formatRuUnit(formatRuDecimal(firstWeight, 1), 'кг'))
              ),
              deltaAbs >= 0.05 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Итого изменение'),
                React.createElement('span', { style: { fontWeight: 600, color } }, `${deltaSign}${formatRuUnit(formatRuDecimal(deltaAbs, 2), 'кг')}`)
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Темп'),
                React.createElement('span', { style: { fontWeight: 600 } },
                  `${slopePerWeek >= 0 ? '+' : ''}${formatRuUnit(formatRuDecimal(slopePerWeek, 2), 'кг/нед')}`
                )
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Данных'),
                React.createElement('span', { style: { fontWeight: 600 } },
                  `${formatRuUnit(dataPoints + '/' + periodDays, 'дн.')} (${formatRuUnit(formatRuNumber(Math.round(dataCompleteness * 100)), '%')})`
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
                React.createElement('span', { style: { fontWeight: 600 } }, formatRuUnit(goalWeight, 'кг'))
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Осталось'),
                React.createElement('span', { style: { fontWeight: 600 } }, formatRuUnit(formatRuDecimal(toGoalKg || 0, 1), 'кг'))
              ),
              estimatedDaysToGoal && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' } },
                React.createElement('span', { style: { color: 'var(--heys-text-secondary,#94a3b8)' } }, 'Прогноз при текущем темпе'),
                React.createElement('span', { style: { fontWeight: 600 } }, `~${formatRuUnit(estimatedDaysToGoal, 'дней')}`)
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
                  React.createElement('span', { style: { fontWeight: 600 } }, formatRuUnit(formatRuDecimal(p.weight, 1), 'кг'))
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

    const getColor = (s) => widgetHealthScoreColor(s);

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

    const getRadarColor = (s) => HEYS.scales.riskRadarScore(s).color;

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
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-label' }, 'Эмоциональный'),
                React.createElement('div', { className: 'widget-relapse-risk__breakdown-track' },
                  React.createElement('div', {
                    style: { width: `${Math.min(100, radarRelapseScore)}%`, height: '100%', borderRadius: '4px', background: getRadarColor(radarRelapseScore), transition: 'width 0.4s ease' }
                  })
                ),
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-value', style: { color: getRadarColor(radarRelapseScore) } }, radarRelapseScore)
              ),
              // Crash (metabolic)
              React.createElement('div', { className: 'widget-relapse-risk__breakdown-row' },
                React.createElement('span', { className: 'widget-relapse-risk__breakdown-label' }, 'Метаболический'),
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
                  '--chip-accent': 'var(--v4-wgt-emerald, #10b981)',
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

  // Строк ожидания в каталоге — не больше двух (канвас v4, «сколько строк
  // ожидания»): каталог обещаний обесценивает и обещания, и сам каталог.
  const CATALOG_WAITING_LIMIT = 2;

  function formatWaterCounterLiters(ml) {
    const liters = Math.max(0, Number(ml) || 0) / 1000;
    const norm = HEYS.Widgets.data?.getWaterData?.()?.norm
      || HEYS.DayData?.getCurrentDay?.()?.waterNormMl
      || 2700;
    const normL = Math.max(0.1, Number(norm) || 2700) / 1000;
    const fmt = (v) => formatRuNumber(v, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
    return `${fmt(liters)} из ${fmt(normL)}`;
  }

  /** Плавающая кнопка настройки экрана — 40 px, левый нижний угол (канвас v4). */
  function WidgetsSettingsFab({ onClick, done = false }) {
    return React.createElement('button', {
      type: 'button',
      className: 'widgets-settings-fab' + (done ? ' widgets-settings-fab--done' : ''),
      id: 'tour-widgets-settings-fab',
      onClick,
      'aria-label': done ? 'Готово' : 'Настроить экран'
    },
      done
        ? React.createElement('span', { className: 'widgets-settings-fab__label' }, 'Готово')
        : React.createElement('svg', {
          width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
          React.createElement('path', { d: 'M4 20h4l10-10-4-4L4 16z' }),
          React.createElement('path', { d: 'M14 6l4 4' })
        )
    );
  }

  function QuickSheetSvgIcon({ children, className }) {
    return React.createElement('span', { className: className || 'widgets-quick-sheet__icon', 'aria-hidden': 'true' },
      React.createElement('svg', {
        width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round'
      }, children)
    );
  }

  /** 15×15 outline icon for catalog/category/chips — тон --ac, обводка 2,75. */
  function WidgetGlyph({ glyph, className }) {
    const paths = HEYS.Widgets?.GLYPHS?.[glyph];
    if (!paths || !paths.length) return null;
    return React.createElement('span', {
      className: className || 'widgets-glyph',
      'aria-hidden': 'true'
    },
      React.createElement('svg', {
        width: 15,
        height: 15,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }, paths.map((d, i) => React.createElement('path', { key: i, d })))
    );
  }

  /** Одна кнопка «+» 52 px с раскрывающейся карточкой быстрых действий (канвас v4). */
  /**
   * Быстрые действия: состав, порядок и крайние случаи — строки контракта
   * «набор действий», «порядок в карточке», «настройка состава»,
   * «включён один пункт», «не включено ни одного».
   *
   * Порядок задан снизу вверх по частоте: вода у самой кнопки, мессенджер на
   * макушке. В разметке карточка растёт сверху вниз, поэтому список
   * навигационных строк идёт в обратном порядке, а вода стоит последней —
   * ближе всего к кнопке.
   */
  const QUICK_ACTION_ORDER = ['message', 'activity', 'hunger', 'meal'];

  /**
   * Строка «появление и исчезновение кнопки» (канвас settings-system):
   * «при переходе через один включённый пункт кнопка меняет иконку и тон за
   * 220 мс; при нуле — сжимается за 160 мс, при первом включённом вырастает
   * за 220 мс с перелётом до 1,06». Те же 220/160, что у смены вида виджета
   * (home-widgets, строка «смена») — одна пружина на весь продукт.
   */
  const QUICK_FAB_GROW_MS = 220;
  const QUICK_FAB_SHRINK_MS = 160;
  const QUICK_FAB_PHASE_CLASS = {
    enter: ' is-entering',
    leave: ' is-leaving',
    swap: ' is-swapping',
  };

  /**
   * Строка «уменьшенное движение»: появление и исчезновение кнопки при
   * переходе через один и ноль включённых становятся мгновенной сменой
   * состояния. Правило безусловно — animate-always его не перебивает.
   */
  function quickFabReducedMotion() {
    const policy = HEYS.motion;
    if (policy && typeof policy.prefersReducedMotion === 'function') {
      return policy.prefersReducedMotion();
    }
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_e) {
      return false;
    }
  }

  function readFabVisibility() {
    const api = HEYS.FabVisibility;
    return api && typeof api.read === 'function'
      ? api.read()
      : { water: true, hunger: true, message: true, activity: true, meal: true };
  }

  /** Слушать и штатное сохранение состава, и черновик из шторки настроек. */
  function useFabVisibility() {
    const [visibility, setVisibility] = useState(readFabVisibility);
    useEffect(() => {
      const sync = () => setVisibility(readFabVisibility());
      const api = HEYS.FabVisibility;
      const events = [api?.EVENT, api?.DRAFT_EVENT].filter(Boolean);
      events.forEach((name) => window.addEventListener(name, sync));
      return () => events.forEach((name) => window.removeEventListener(name, sync));
    }, []);
    return visibility;
  }

  /**
   * Строка «непрочитанные у мессенджера»: счётчик живёт на строке
   * «Мессенджер» внутри карточки и больше нигде — на самой плавающей кнопке
   * значка нет ни при каком числе сообщений.
   *
   * Источник тот же, что у остального продукта: HEYS.MessengerAPI держит
   * счёт в кеше и рассылает 'heys:messenger-fab-unread' при каждом изменении
   * (heys_messenger_api_v1.js). Своего опроса здесь не заводим — второй
   * опрос того же эндпоинта был бы лишним сетевым трафиком и вторым
   * источником правды.
   */
  function useQuickUnreadCount(enabled) {
    const [unread, setUnread] = useState(0);
    useEffect(() => {
      if (!enabled) {
        setUnread(0);
        return undefined;
      }
      setUnread(HEYS.MessengerAPI?.getFabUnreadCount?.() || 0);
      const onUpdate = (event) => setUnread(Number(event?.detail) || 0);
      window.addEventListener('heys:messenger-fab-unread', onUpdate);
      return () => window.removeEventListener('heys:messenger-fab-unread', onUpdate);
    }, [enabled]);
    return unread;
  }

  /**
   * Чипы воды: 200 и 500 по умолчанию, дальше — объёмы человека из настроек
   * воды (строка «чипы воды»). Чипа 250 нет: контракт называет его прямо.
   */
  function waterChipVolumes() {
    const presets = HEYS.WaterCustomVolume?.PRESETS_ML;
    const list = Array.isArray(presets) && presets.length ? presets : [200, 500];
    return [...new Set(list)].filter((ml) => Number.isFinite(ml) && ml > 0).slice(0, 4);
  }

  /**
   * Живая область для вспомогательных технологий. Та же, что у смены вида
   * (heys_widgets_variants_v4.js): вторая на экране спорила бы с первой.
   */
  function quickAnnounce(text) {
    if (typeof document === 'undefined' || !text) return;
    let node = document.getElementById('heys-widgets-live');
    if (!node) {
      node = document.createElement('div');
      node.id = 'heys-widgets-live';
      node.className = 'sr-only';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = text;
  }

  function QuickChevron() {
    return React.createElement('svg', {
      className: 'widgets-quick-sheet__chevron',
      width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': 'true'
    }, React.createElement('path', { d: 'M9 6l6 6-6 6' }));
  }

  const QUICK_ACTION_ICONS = {
    water: [{ d: 'M12 3s6 6.5 6 10.5a6 6 0 01-12 0C6 9.5 12 3 12 3z' }],
    meal: [{ d: 'M6 3v18' }, { d: 'M4 3v5a2 2 0 004 0V3' }, { d: 'M16 3c-2 4-2 8 0 9v9' }],
    // Кадр «Быстрые действия · раскрыто»: у голода и энергии молния, у
    // активности пульс. Часы и ломаная графика — прежние иконки, они говорили
    // «время» и «отчёт» вместо «энергия» и «движение».
    hunger: [{ d: 'M13 2L3 14h9l-1 8 10-12h-9z' }],
    activity: [{ d: 'M22 12h-4l-3 9L9 3l-3 9H2' }],
    message: [{ d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' }]
  };

  /**
   * повторный тап · правило продукта: «Еда» и «Активность» в карточке быстрых
   * действий заводят новую запись (HEYS.Day.addMeal / addActivity) — второй тап
   * внутри 350 мс создал бы вторую пустую запись, тот самый «второй приём еды»
   * из контракта. Мессенджер и «Голод и энергия» — навигация (открывают экран,
   * ничего не пишут), вода — аддитивный ввод: их защита не касается.
   */
  const ENTITY_QUICK_ACTION_GUARD_MS = 350;
  let lastEntityQuickActionAt = 0;
  function guardEntityQuickAction(fn) {
    return (...args) => {
      const now = Date.now();
      if (now - lastEntityQuickActionAt < ENTITY_QUICK_ACTION_GUARD_MS) return;
      lastEntityQuickActionAt = now;
      return fn?.(...args);
    };
  }

  function QuickActionIcon({ action, className }) {
    return React.createElement(QuickSheetSvgIcon, { className },
      ...(QUICK_ACTION_ICONS[action] || []).map((path, i) =>
        React.createElement('path', { key: i, d: path.d })
      )
    );
  }

  function WidgetsQuickActionsFab({
    id,
    waterMl,
    onAddWater,
    onAddMeal,
    onOpenCurator,
    onOpenHunger,
    onOpenActivity,
    onOpenChange,
    suppressKeys = []
  }) {
    const [open, setOpen] = useState(false);
    // Строка «правка списка»: режим правки живёт только внутри раскрытой
    // карточки — карандаш переключает его, закрытие карточки из него выводит.
    const [editing, setEditing] = useState(false);
    // Строка «скрытые чипами»: чипы идут по порядку скрытия, а не по порядку
    // списка, поэтому порядок держим отдельно от самого набора видимости.
    const [hideOrder, setHideOrder] = useState([]);
    // Строка «тайминги правки»: строка сжимается по высоте 160 мс, и только
    // потом уходит из списка — иначе соседи смыкаются рывком.
    const [hidingKey, setHidingKey] = useState(null);
    // Строка «появление и исчезновение кнопки»: 'enter' | 'leave' | 'swap'.
    const [fabPhase, setFabPhase] = useState(null);
    const wrapRef = useRef(null);
    const visibility = useFabVisibility();
    // Прошлое состояние кнопки: первая отрисовка переходом не считается.
    const fabPrevRef = useRef(null);

    const handlers = {
      meal: guardEntityQuickAction(onAddMeal),
      hunger: onOpenHunger,
      activity: guardEntityQuickAction(onOpenActivity),
      message: onOpenCurator
    };
    const labels = { meal: 'Еда', hunger: 'Голод и энергия', activity: 'Активность', message: 'Мессенджер' };

    const suppressed = new Set(Array.isArray(suppressKeys) ? suppressKeys : []);
    const navKeys = QUICK_ACTION_ORDER.filter((key) => visibility[key] !== false && !suppressed.has(key));
    const waterOn = visibility.water !== false && !suppressed.has('water');
    // Строка «непрочитанные у мессенджера»: счёт нужен только пока пункт
    // «Мессенджер» вообще есть в списке.
    const messengerUnread = useQuickUnreadCount(visibility.message !== false);
    const enabledCount = navKeys.length + (waterOn ? 1 : 0);
    // Строка «включён один пункт»: стопки нет — кнопка становится действием и
    // носит его иконку вместо «+». Навигационный пункт уводит одним тапом,
    // вода раскрывает карточку с одними чипами.
    const soleNavKey = !waterOn && navKeys.length === 1 ? navKeys[0] : null;
    const soleWater = waterOn && !navKeys.length;
    // Чем кнопка стала: собственное действие при одном включённом пункте или
    // «плюс» при нескольких. Переход через эту границу — та самая смена иконки
    // и тона из строки «появление и исчезновение кнопки».
    const fabIdentity = soleNavKey || (soleWater ? 'water' : 'plus');
    // Порядок списка фиксирован кодом («набор действий»): чип возвращает пункт
    // на его место в этом порядке, а не в конец.
    const hiddenKeys = ['water', ...QUICK_ACTION_ORDER]
      .filter((key) => visibility[key] === false);
    const hiddenOrdered = [
      ...hideOrder.filter((key) => hiddenKeys.includes(key)),
      ...hiddenKeys.filter((key) => !hideOrder.includes(key))
    ];

    // Строка «правка списка»: карандаш появляется вместе с карточкой, когда
    // есть что править — включённых больше одного или есть хотя бы один
    // скрытый пункт. В закрытом состоянии карандаша нет никогда. В режиме
    // правки карандаш остаётся, пока человек не выйдет — даже при одной строке.
    const canEditList = enabledCount > 1 || hiddenOrdered.length > 0 || editing;

    const closeSheet = useCallback(() => {
      setOpen(false);
      // Строка «режим правки»: закрытие карточки выходит из режима.
      setEditing(false);
    }, []);

    useEffect(() => {
      onOpenChange?.(open);
    }, [open, onOpenChange]);

    useEffect(() => {
      if (!open) return undefined;
      const onKey = (event) => {
        if (event.key === 'Escape') {
          closeSheet();
          return;
        }
        // Строка «порядок обхода»: в раскрытой карточке обход заперт внутри
        // неё — за пределы карточки фокус не уходит.
        if (event.key !== 'Tab') return;
        const roots = [];
        if (wrapRef.current) roots.push(wrapRef.current);
        const portal = document.querySelector('.widgets-quick-portal');
        if (portal) roots.push(portal);
        const items = roots.flatMap((scope) => [...scope.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )]).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      const onPointerDown = (event) => {
        if (wrapRef.current && wrapRef.current.contains(event.target)) return;
        if (event.target.closest?.('.widgets-quick-portal')) return;
        closeSheet();
      };
        // Строка «закрытие»: системная кнопка назад закрывает карточку.
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointerDown, true);
        const popHistoryLayer = HEYS.ModalDismiss?.pushHistoryLayer?.(
          'heysQuickActions',
          closeSheet,
        );
        return () => {
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('pointerdown', onPointerDown, true);
          if (typeof popHistoryLayer === 'function') popHistoryLayer();
        };
    }, [open, closeSheet]);

    /** Строка «озвучивание режима правки»: вход в режим объявляется. */
    useEffect(() => {
      if (!editing) return;
      quickAnnounce('правка списка включена');
    }, [editing]);

    const QUICK_ROW_HIDE_MS = 160;

    const hideAction = useCallback((key) => {
      setHidingKey(key);
      setTimeout(() => {
        HEYS.FabVisibility?.setVisible?.(key, false);
        setHideOrder((prev) => [...prev.filter((k) => k !== key), key]);
        setHidingKey(null);
      }, QUICK_ROW_HIDE_MS);
    }, []);

    const restoreAction = useCallback((key) => {
      HEYS.FabVisibility?.setVisible?.(key, true);
      setHideOrder((prev) => prev.filter((k) => k !== key));
    }, []);

    /**
     * Строка «появление и исчезновение кнопки» (канвас settings-system): при
     * переходе через один включённый пункт кнопка меняет иконку и тон за
     * 220 мс; при нуле — сжимается за 160 мс, при первом включённом вырастает
     * за 220 мс с перелётом до 1,06. Это единственное движение, которое
     * строка «когда применяется» оставляет после закрытия шторки настроек:
     * перестройка стопки снята («снятый прогон»).
     *
     * Первая отрисовка не анимируется: кнопка уже стоит на экране, а
     * контракт называет переходы, а не открытие вкладки.
     *
     * Строка «уменьшенное движение»: оба перехода становятся мгновенной
     * сменой состояния. Флаг animate-always здесь не ставится, и отложенный
     * размонтаж под системной настройкой не заводится — иначе кнопка висела
     * бы 160 мс без анимации.
     */
    useEffect(() => {
      const prev = fabPrevRef.current || { count: enabledCount, identity: fabIdentity };
      fabPrevRef.current = { count: enabledCount, identity: fabIdentity };
      if (prev.count === enabledCount && prev.identity === fabIdentity) return undefined;
      if (quickFabReducedMotion()) {
        setFabPhase(null);
        return undefined;
      }
      let phase = null;
      if (prev.count === 0 && enabledCount > 0) phase = 'enter';
      else if (prev.count > 0 && enabledCount === 0) phase = 'leave';
      else if (prev.identity !== fabIdentity) phase = 'swap';
      if (!phase) return undefined;
      setFabPhase(phase);
      const timer = setTimeout(
        () => setFabPhase(null),
        phase === 'leave' ? QUICK_FAB_SHRINK_MS : QUICK_FAB_GROW_MS,
      );
      return () => clearTimeout(timer);
    }, [enabledCount, fabIdentity]);

    // Пункты кончились, пока карточка была раскрыта: показывать нечего.
    useEffect(() => {
      if (enabledCount) return;
      closeSheet();
    }, [enabledCount, closeSheet]);

    // Строка «не включено ни одного»: кнопки в углу нет вовсе. Уходящая
    // кнопка доживает на экране ровно своё сжатие.
    if (!enabledCount && fabPhase !== 'leave') return null;

    const closeAnd = (fn) => (...args) => {
      closeSheet();
      fn?.(...args);
    };

    const labelOf = (key) => (key === 'water' ? 'Вода' : labels[key]);

    /**
     * Строка «режим правки»: слева у каждой строки выезжает круг 22 px с
     * минусом, область нажатия 44×44 за счёт прозрачных полей вокруг
     * видимого круга (строка «области нажатия в карточке»).
     * Строка «нижняя граница правки»: у последней оставшейся строки минуса нет.
     */
    const renderMinus = (key) => {
      if (!editing || enabledCount <= 1) return null;
      return React.createElement('span', {
        className: 'widgets-quick-minus',
        role: 'button',
        tabIndex: 0,
        'aria-label': `Убрать ${labelOf(key)}`,
        onClick: (event) => {
          event.stopPropagation();
          hideAction(key);
        },
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          hideAction(key);
        }
      },
        React.createElement('svg', {
          className: 'widgets-quick-minus__glyph',
          width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round',
          'aria-hidden': 'true'
        }, React.createElement('path', { d: 'M6 12h12' }))
      );
    };

    const renderNavRow = (key) => React.createElement('div', {
      key,
      className: 'widgets-quick-sheet__row-wrap' + (hidingKey === key ? ' is-hiding' : '')
    },
      renderMinus(key),
      React.createElement('button', {
        type: 'button',
        className: 'widgets-quick-sheet__row',
        onClick: closeAnd(handlers[key])
      },
        React.createElement(QuickActionIcon, { action: key, className: 'widgets-quick-sheet__row-icon' }),
        React.createElement('span', { className: 'widgets-quick-sheet__row-label' }, labels[key]),
        // Строка «непрочитанные у мессенджера»: цифра 10 px/700 тоном --ac
        // перед шевроном — без кружка и заливки, и стоит она здесь и только
        // здесь. Гаснет в режиме правки вместе с шевронами и счётчиком воды:
        // это такой же счётчик на строке.
        key === 'message' && messengerUnread > 0
          ? React.createElement('span', {
            className: 'widgets-quick-sheet__badge widgets-quick-sheet__fade',
            'aria-label': `${messengerUnread} непрочитанных сообщений`
          }, messengerUnread > 99 ? '99+' : String(messengerUnread))
          : null,
        // Строка «режим правки»: шевроны на время правки убираются — гаснут
        // за 120 мс (строка «тайминги правки»), а не исчезают рывком.
        React.createElement('span', {
          className: 'widgets-quick-sheet__fade',
          'aria-hidden': 'true'
        }, React.createElement(QuickChevron, null))
      )
    );

    const waterSection = React.createElement('div', { className: 'widgets-quick-sheet__section' },
      React.createElement('div', {
        className: 'widgets-quick-sheet__row-wrap' + (hidingKey === 'water' ? ' is-hiding' : '')
      },
        renderMinus('water'),
        React.createElement('div', { className: 'widgets-quick-sheet__head' },
          React.createElement(QuickActionIcon, { action: 'water' }),
          React.createElement('span', { className: 'widgets-quick-sheet__title' }, 'Вода'),
          // Строка «режим правки»: счётчик воды на это время убирается —
          // гаснет за 120 мс вместе с шевронами.
          React.createElement('span', {
            className: 'widgets-quick-sheet__meta widgets-quick-sheet__fade n',
            'aria-hidden': editing ? 'true' : undefined
          }, formatWaterCounterLiters(waterMl))
        )
      ),
      // Строка «режим правки»: чипы объёмов в режиме правки не показываются.
      editing ? null : React.createElement('div', { className: 'widgets-quick-sheet__chips', role: 'group', 'aria-label': 'Объём воды' },
        waterChipVolumes().map((ml) => React.createElement('button', {
          key: ml,
          type: 'button',
          className: 'widgets-quick-sheet__chip n',
          onClick: closeAnd(() => onAddWater?.(ml))
        }, String(ml)))
      )
    );

    /**
     * Строка «скрытые чипами»: скрытый пункт ложится чипом слева от карандаша
     * и виден только в режиме правки. Чипы идут справа налево по порядку
     * скрытия (ряд перевёрнут в CSS), тап возвращает пункт на его место в
     * фиксированном порядке списка.
     */
    const chipsRow = editing && hiddenOrdered.length
      ? React.createElement('div', {
        className: 'widgets-quick-chips',
        role: 'list',
        'aria-label': 'Скрытые пункты'
      },
        hiddenOrdered.map((key) => React.createElement('button', {
          key,
          type: 'button',
          role: 'listitem',
          className: 'widgets-quick-chip',
          'aria-label': `Вернуть в список: ${labelOf(key)}`,
          onClick: () => restoreAction(key)
        },
          React.createElement('svg', {
            className: 'widgets-quick-chip__plus',
            width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round',
            'aria-hidden': 'true'
          }, React.createElement('path', { d: 'M12 5v14M5 12h14' })),
          React.createElement('span', { className: 'widgets-quick-chip__label' }, labelOf(key))
        ))
      )
      : null;

    /**
     * Строки «правка списка» и «карандаш и кнопка настройки»: круг 40 px
     * слева от «×», зазор 6 px, центры на одной горизонтали. Карандаш
     * карточку не закрывает никогда — он только переключает режим правки
     * (строка «закрытие»).
     *
     * Отступление названо вслух: строка «правка списка» ставит правый край на
     * 75 px, строка «карандаш и кнопка настройки» — на 72 px. Взято 72:
     * кнопка 52 px при отступе 14 px даёт левый край на 66 px, и только 72
     * даёт названный там же зазор 6 px.
     */
    const pencil = open && canEditList
      ? React.createElement('button', {
        type: 'button',
        className: 'widgets-quick-pencil' + (editing ? ' is-editing' : ''),
        'aria-pressed': editing ? 'true' : 'false',
        'aria-label': editing ? 'Выйти из правки списка' : 'Править список',
        onClick: (event) => {
          event.stopPropagation();
          if (editing) {
            setEditing(false);
            if (enabledCount === 1 && hiddenOrdered.length === 0) {
              closeSheet();
            }
          } else {
            setEditing(true);
          }
        }
      },
        React.createElement('svg', {
          width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
          React.createElement('path', { d: 'M4 20h4l10-10-4-4L4 16z' }),
          React.createElement('path', { d: 'M14 6l4 4' })
        )
      )
      : null;

    const fabAction = soleNavKey ? handlers[soleNavKey] : null;

    const quickScrim = open
      ? React.createElement('button', {
        type: 'button',
        className: 'widgets-quick-scrim',
        'aria-label': 'Закрыть быстрые действия',
        onClick: closeSheet
      })
      : null;

    const quickSheet = open
      ? React.createElement('div', {
        className: 'widgets-quick-sheet' + (editing ? ' is-editing' : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Быстрые действия'
      },
        navKeys.map(renderNavRow),
        navKeys.length > 0 && waterOn && React.createElement('div', { className: 'widgets-quick-sheet__divider', key: 'divider' }),
        waterOn && waterSection
      )
      : null;

    // Карточка и scrim в body — как другие v4-модалки: не растут в flex-стопке
    // и не зависят от transform предков вкладки.
    const quickPortal = open && global.document?.body && ReactDOM?.createPortal
      ? ReactDOM.createPortal(
        React.createElement('div', { className: 'widgets-quick-portal' },
          quickScrim,
          quickSheet
        ),
        global.document.body
      )
      : null;

    return React.createElement('div', {
      ref: wrapRef,
      ...(id ? { id } : {}),
      className: 'widgets-quick-fab-wrap' + (open ? ' is-open' : '')
        // Строка «появление и исчезновение кнопки»: 220 мс с перелётом до
        // 1,06 на первом включённом, 160 мс сжатия на нуле, 220 мс на смену
        // иконки и тона у одиночной кнопки.
        + (QUICK_FAB_PHASE_CLASS[fabPhase] || ''),
      // Уходящая кнопка — уже картинка: список пуст, нажимать нечего, и в
      // обходе с клавиатуры и для скринридера её быть не должно.
      'aria-hidden': fabPhase === 'leave' ? 'true' : undefined
    },
      quickPortal,
      chipsRow,
      pencil,
      React.createElement('button', {
        type: 'button',
        // Строка «тон одиночной кнопки»: свой тон сегодня есть только у воды.
        className: 'widgets-quick-fab'
          + (soleWater ? ' widgets-quick-fab--water' : '')
          + (open ? ' is-open' : ''),
        onClick: fabAction ? () => fabAction() : () => (open ? closeSheet() : setOpen(true)),
        tabIndex: fabPhase === 'leave' ? -1 : undefined,
        'aria-expanded': fabAction ? undefined : (open ? 'true' : 'false'),
        'aria-label': fabAction
          ? labels[soleNavKey]
          : (open ? 'Закрыть быстрые действия' : (soleWater ? 'Добавить воду' : 'Добавить запись'))
      },
        React.createElement('span', {
          className: 'widgets-quick-fab__glyph' + (open ? ' is-open' : ''),
          'aria-hidden': 'true'
        },
          soleNavKey
            ? React.createElement(QuickActionIcon, { action: soleNavKey })
            : React.createElement('svg', {
              width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round'
            }, React.createElement('path', { d: 'M12 5v14M5 12h14' }))
        )
      )
    );
  }

  /** «нужно 3 дня» вместо «нужно 3 дней»: число в строке живое. */
  function ruDays(n) {
    const count = Math.abs(Math.trunc(Number(n) || 0));
    const tail = count % 100;
    if (tail >= 11 && tail <= 14) return 'дней';
    switch (count % 10) {
      case 1: return 'день';
      case 2:
      case 3:
      case 4: return 'дня';
      default: return 'дней';
    }
  }

  /**
   * Виджету не хватает истории: сколько дней собрано и сколько нужно.
   * Возвращает null, если виджет работает с первого дня.
   */
  function waitingHistory(type) {
    const need = Number(type?.needsHistoryDays);
    if (!Number.isFinite(need) || need <= 0) return null;
    const data = HEYS.Widgets.data?.getWidgetData?.({ type: type.type, settings: {} });
    // Нет счётчика — значит истории ещё не набралось: у нового человека это
    // честный ноль, а не повод спрятать строку.
    const have = Math.max(0, Number(data?.daysWithData) || 0);
    if (have >= need) return null;
    return { need, have };
  }

  // === Catalog Modal Component ===
  function CatalogStrip({
    onSelect,
    onReplace,
    existingTypes,
    selectedDate,
    cellBudget,
    blockedType,
    onBlockedHint,
    onStartRemovePick
  }) {
    const registry = HEYS.Widgets.registry;
    const availableTypes = registry?.getAvailableTypes() || [];
    const existingTypeSet = existingTypes instanceof Set ? existingTypes : new Set(existingTypes || []);
    const budget = cellBudget || HEYS.Widgets.getBudgetInfo?.() || { used: 0, total: 32 };

    const canAddType = useCallback((type) => {
      if (type.comingSoon || waitingHistory(type)) return true;
      const previewVariant = HEYS.Widgets.VariantsV4?.getDefaultVariant?.(type.type);
      const previewSize = previewVariant?.size || type.defaultSize || '2x1';
      const previewWidget = { type: type.type, size: previewSize };
      const need = HEYS.Widgets.widgetCellCount?.(previewWidget) || 2;
      if (budget.isOverflow) return false;
      return budget.used + need <= budget.total;
    }, [budget.isOverflow, budget.total, budget.used]);

    const handlePick = useCallback((type, replaceWidgetId = null) => {
      if (type.comingSoon) return;
      if (!canAddType(type)) {
        const previewVariant = HEYS.Widgets.VariantsV4?.getDefaultVariant?.(type.type);
        const previewSize = previewVariant?.size || type.defaultSize || '2x1';
        const need = HEYS.Widgets.widgetCellCount?.({ type: type.type, size: previewSize }) || 2;
        onBlockedHint?.(type.type, need);
        return;
      }
      if (replaceWidgetId && onReplace) {
        onReplace(type, replaceWidgetId);
        HEYS.Widgets._catalogDragType = null;
        return;
      }
      onSelect?.(type);
      HEYS.Widgets.emit('catalog:select', { type: type.type });
    }, [canAddType, onBlockedHint, onReplace, onSelect]);

    const startCatalogDrag = useCallback((type) => (event) => {
      if (type.comingSoon || waitingHistory(type)) return;
      HEYS.Widgets._catalogDragType = type.type;
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch (_) { /* noop */ }
    }, []);

    const finishCatalogDrag = useCallback((type) => () => {
      const targetId = HEYS.Widgets._catalogDropTargetId;
      HEYS.Widgets._catalogDragType = null;
      HEYS.Widgets._catalogDropTargetId = null;
      if (targetId) {
        handlePick(type, targetId);
      }
    }, [handlePick]);

    // Уже стоящие на экране в каталоге не показываются: серая строка «уже
    // добавлен» заставляла искать плитку глазами (канвас v4, строка «каталог»).
    const shown = availableTypes.filter((type) => !existingTypeSet.has(type.type));

    // Строки ожидания идут после готовых виджетов и их не больше двух:
    // каталог обещаний обесценивает и обещания, и каталог (строка «сколько
    // строк ожидания»).
    const waiting = shown
      .filter((type) => type.comingSoon || waitingHistory(type))
      .slice(0, CATALOG_WAITING_LIMIT);
    const ready = shown.filter((type) => !waiting.includes(type));
    const catalogTypes = [...ready, ...waiting];
    if (!catalogTypes.length) return null;

    const categories = registry?.getCategories() || [];
    const grouped = [];
    const placed = new Set();
    for (const cat of categories) {
      const types = ready.filter((t) => t.category === cat.id);
      if (!types.length) continue;
      types.forEach((t) => placed.add(t.type));
      grouped.push({ key: cat.id, cat, types });
    }
    const restReady = ready.filter((t) => !placed.has(t.type));
    if (restReady.length) grouped.push({ key: 'rest', cat: null, types: restReady });
    if (waiting.length) grouped.push({ key: 'waiting', cat: null, types: waiting });

    const catalogTypeCopy = (type, subtitle) => React.createElement('span', { className: 'widget-v4-catalog__copy' },
      React.createElement('span', { className: 'widget-v4-catalog__title' },
        type.icon ? React.createElement(WidgetGlyph, { glyph: type.icon }) : null,
        React.createElement('span', { className: 'widget-v4-catalog__name' }, type.name)
      ),
      subtitle
        ? React.createElement('span', { className: 'widget-v4-catalog__desc' }, subtitle)
        : null
    );

    const catalogTypeTitle = (type) => React.createElement('span', { className: 'widget-v4-catalog__title' },
      type.icon ? React.createElement(WidgetGlyph, { glyph: type.icon }) : null,
      React.createElement('span', { className: 'widget-v4-catalog__name' }, type.name)
    );

    return React.createElement('div', { className: 'widget-v4-catalog' },
      // Кадр «Каталог · значки вместо эмодзи · 01–08»: шапка листа —
      // Отмена / «Каталог» + счётчик / Готово. Те же выходы, что у шапки
      // расстановки: Отмена откатывает, Готово пишет.
      React.createElement('div', { className: 'widget-v4-catalog__bar' },
        React.createElement('button', {
          type: 'button',
          className: 'widget-v4-catalog__bar-cancel',
          onClick: () => HEYS.Widgets.exitEditMode?.({ revert: true })
        }, 'Отмена'),
        React.createElement('span', { className: 'widget-v4-catalog__bar-mid' },
          React.createElement('span', { className: 'widget-v4-catalog__bar-name' }, 'Каталог'),
          React.createElement('span', { className: 'widget-v4-catalog__budget n' },
            'занято ',
            React.createElement('span', {
              className: 'widget-v4-catalog__budget__num'
                + (budget.used >= budget.total ? ' is-full' : '')
            }, String(budget.used)),
            ` из ${budget.total}`
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'widget-v4-catalog__bar-done',
          onClick: () => HEYS.Widgets.exitEditMode?.()
        }, 'Готово')
      ),
      React.createElement('div', { className: 'widget-v4-catalog__body' },
      React.createElement('div', { className: 'widget-v4-catalog__grid' },
        grouped.flatMap(({ key, cat, types }) => {
          const nodes = [];
          if (cat) {
            nodes.push(React.createElement('div', {
              key: `cat-${key}`,
              className: 'widget-v4-catalog__category'
            },
              React.createElement(WidgetGlyph, { glyph: cat.icon }),
              React.createElement('span', { className: 'widget-v4-catalog__category-label' }, cat.label)
            ));
          }
          types.forEach((type) => {
          const blocked = !canAddType(type);
          const previewVariant = HEYS.Widgets.VariantsV4?.getDefaultVariant?.(type.type);
          const previewSize = previewVariant?.size || type.defaultSize || '2x1';
          const needCells = HEYS.Widgets.widgetCellCount?.({ type: type.type, size: previewSize }) || 2;
          const showBlockedHint = blockedType === type.type || (blocked && !type.comingSoon && !waitingHistory(type));
          // «Готовится»: строка в полную яркость, пилюля «скоро» и одна строка
          // о том, что виджет покажет. Ни превью, ни даты, ни кнопки — нажатие
          // ничего не делает (строки «готовится» и «готовится · чего нет»).
          if (type.comingSoon) {
            nodes.push(React.createElement('span', {
              key: type.type,
              className: 'widget-v4-catalog__item widget-v4-catalog__item--soon',
              'aria-disabled': 'true'
            },
              React.createElement('span', { className: 'widget-v4-catalog__row' },
                catalogTypeTitle(type),
                React.createElement('span', { className: 'widget-v4-catalog__pill' }, 'скоро')
              ),
              type.comingSoon.about
                ? React.createElement('span', { className: 'widget-v4-catalog__about' }, type.comingSoon.about)
                : null
            ));
            return;
          }

          // «Мало истории»: то же правило, что у видов — приглушено, справа
          // «нужно N дней» и прогресс под названием, но добавить можно: плитка
          // встанет и покажет ту же подпись вместо графика.
          const history = waitingHistory(type);
          if (history) {
            nodes.push(React.createElement('div', { key: type.type, className: 'widget-v4-catalog__slot' },
              React.createElement('button', {
                type: 'button',
                className: 'widget-v4-catalog__item widget-v4-catalog__item--waiting'
                  + (blocked ? ' widget-v4-catalog__item--blocked' : ''),
                onClick: () => handlePick(type),
                onPointerDown: startCatalogDrag(type),
                onPointerUp: finishCatalogDrag(type),
                onPointerCancel: finishCatalogDrag(type)
              },
                React.createElement('span', { className: 'widget-v4-catalog__row' },
                  catalogTypeTitle(type),
                  React.createElement('span', { className: 'widget-v4-catalog__need' },
                    React.createElement('span', { className: 'widget-v4-catalog__hint' }, `нужно ${history.need} ${ruDays(history.need)}`),
                    React.createElement('svg', {
                      width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
                      stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round',
                      'aria-hidden': 'true'
                    }, React.createElement('path', { d: 'M12 5v14M5 12h14' }))
                  )
                ),
                React.createElement('span', { className: 'widget-v4-catalog__about' },
                  `собрано ${history.have} из ${history.need}`)
              ),
              showBlockedHint && renderCatalogBlockedHint(needCells, type, onStartRemovePick)
            ));
            return;
          }

          const previewWidget = {
            id: `catalog_preview_${type.type}`,
            type: type.type,
            size: previewSize,
            settings: previewVariant?.id ? { displayVariant: previewVariant.id } : {}
          };
          const sizeLabel = String(previewSize || '').replace('x', '×');
          const subtitle = previewVariant?.title && sizeLabel
            ? `${previewVariant.title} · ${sizeLabel}`
            : (previewVariant?.title || sizeLabel || '');
          nodes.push(React.createElement('div', { key: type.type, className: 'widget-v4-catalog__slot' },
            React.createElement('button', {
              type: 'button',
              className: 'widget-v4-catalog__item'
                + (blocked ? ' widget-v4-catalog__item--blocked' : ''),
              onClick: () => handlePick(type),
              onPointerDown: startCatalogDrag(type),
              onPointerUp: finishCatalogDrag(type),
              onPointerCancel: finishCatalogDrag(type)
            },
              React.createElement('div', {
                className: `widget-v4-catalog__preview widget widget--${previewSize} widget--${type.type} widget-v4-catalog__preview--${previewSize}`,
                'aria-hidden': 'true'
              },
                React.createElement(WidgetContent, {
                  widget: previewWidget,
                  widgetType: type,
                  selectedDate
                })
              ),
              catalogTypeCopy(type, subtitle),
              React.createElement('svg', {
                width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round',
                className: 'widget-v4-catalog__plus',
                'aria-hidden': 'true'
              }, React.createElement('path', { d: 'M12 5v14M5 12h14' }))
            ),
            showBlockedHint && renderCatalogBlockedHint(needCells, type, onStartRemovePick)
          ));
          });
          return nodes;
        })
      )
      )
    );
  }

  function renderCatalogBlockedHint(needCells, type, onStartRemovePick) {
    const cellsWord = needCells === 1 ? 'клетка' : (needCells < 5 ? 'клетки' : 'клеток');
    return React.createElement('div', { className: 'widget-v4-catalog__blocked' },
      React.createElement('span', { className: 'widget-v4-catalog__blocked-text' },
        `Нужно ${needCells} ${cellsWord} — освободите место`
      ),
      React.createElement('button', {
        type: 'button',
        className: 'widget-v4-catalog__remove-btn',
        onClick: (e) => {
          e.stopPropagation();
          onStartRemovePick?.(type);
        }
      }, 'Снять виджет')
    );
  }

  /**
   * «Рекомендуемый экран» — путь назад к дефолту из расстановки.
   * Контракт home-widgets, строка «сброс к дефолту»: блок между каталогом и
   * пустым состоянием, подтверждения нет — отменяется той же стрелкой, что и
   * перенос плитки, пока человек не нажал «Готово». Отдельного бара отмены
   * здесь не заводим: второй механизм отмены рядом с первым — ровно то, что
   * вычищали в баре удаления.
   */
  function RecommendedScreenBlock({ onReset }) {
    return React.createElement('div', { className: 'widget-v4-recommended' },
      React.createElement('div', { className: 'widget-v4-catalog__tier' }, 'Рекомендуемый экран'),
      React.createElement('div', { className: 'widget-v4-recommended__card' },
        React.createElement('span', { className: 'widget-v4-recommended__copy' },
          React.createElement('span', { className: 'widget-v4-recommended__title' }, 'Вернуть рекомендуемый экран'),
          React.createElement('span', { className: 'widget-v4-recommended__desc' },
            'Тринадцать плиток в порядке, который мы проверили. Ваш состав и виды заменятся — стрелка отмены вернёт как было'
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'widget-v4-recommended__btn',
          onClick: onReset
        }, 'Вернуть')
      )
    );
  }

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
            }, React.createElement(WidgetGlyph, { glyph: cat.icon, className: 'widgets-catalog__category-glyph' }), cat.label)
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
              React.createElement('div', { className: 'widgets-catalog__item-info' },
                React.createElement('div', { className: 'widgets-catalog__item-title' },
                  React.createElement(WidgetGlyph, { glyph: type.icon }),
                  React.createElement('div', { className: 'widgets-catalog__item-name' }, type.name)
                ),
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
          // Size selector (временно скрыт — WIDGET_EDIT_RESIZE_ENABLED)
          WIDGET_EDIT_RESIZE_ENABLED && React.createElement('div', { className: 'widgets-settings__field' },
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
          Object.entries(getWidgetSettingsSchema(widgetType, selectedSize)).map(([key, def]) =>
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


  // === Main WidgetsTab Component ===
  function bootstrapWidgetsLayout() {
    try {
      HEYS.Widgets.state?.init?.();
      return [...(HEYS.Widgets.state?.getWidgets?.() || [])];
    } catch (_) {
      return [];
    }
  }

  function WidgetsTab({ selectedDate, clientId, cloudUser, setTab, setSelectedDate }) {
    // Строка «обучение · правило продукта»: онбординга и тултипов в продукте
    // нет, исключение одно — подсказка про долгий тап по плитке. Один раз на
    // человека, после третьего открытия Главной, флаг живёт в профиле.
    // Закрывается любым касанием и больше не возвращается, даже если жестом
    // так и не воспользовались.
    const [showLongPressHint, setShowLongPressHint] = React.useState(false);
    React.useEffect(() => {
      let prof = null;
      const U = HEYS.utils || {};
      try { prof = U.lsGet?.('heys_profile', {}) || {}; } catch (_) { return; }
      // Старый widgetsHoldHintShown / widgetsTabOpenCount — тот же жест; не
      // показываем вторую legacy-плашку (z-index 40 под FAB).
      if (prof.longPressHintShown || prof.widgetsHoldHintShown) return;
      const opens = Math.max(
        Number(prof.homeOpensCount || 0),
        Number(prof.widgetsTabOpenCount || 0),
      ) + 1;
      const next = {
        ...prof,
        homeOpensCount: opens,
        widgetsTabOpenCount: opens,
      };
      // Показ на третьем открытии: строка называет «после третьего», то есть
      // счётчик уже дошёл до трёх, а не «после трёх пропущенных».
      if (opens >= 3) {
        next.longPressHintShown = true;
        next.widgetsHoldHintShown = true;
        setShowLongPressHint(true);
      }
      try { U.lsSet?.('heys_profile', next); } catch (_) { /* останется прежним */ }
    }, []);

    const canUsePostReleaseLabs = !cloudUser && (
      HEYS.AppTabState?.isPostReleaseLabsClient?.(clientId)
      || HEYS.Board?.isBoardClient?.(clientId)
      || String(clientId || '').toLowerCase() === 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
    );
    const canUseTasksAsHome = canUsePostReleaseLabs;
    const canUseBoardAsHome = canUsePostReleaseLabs;
    const VALID_HOME_TABS = useMemo(() => {
      const keys = ['widgets', 'stats', 'diary', 'insights', 'month'];
      if (canUseTasksAsHome) keys.push('tasks');
      if (canUseBoardAsHome) keys.push('board');
      return keys;
    }, [canUseTasksAsHome, canUseBoardAsHome]);
    const getCurrentDefaultTab = useCallback(() => {
      const defaultTabFromApp = window.HEYS?.App?.getDefaultTab?.();
      if (VALID_HOME_TABS.includes(defaultTabFromApp)) return defaultTabFromApp;

      const profile = HEYS.utils?.lsGet?.('heys_profile', {}) || {};
      return VALID_HOME_TABS.includes(profile?.defaultTab) ? profile.defaultTab : 'diary';
    }, [VALID_HOME_TABS]);
    const [widgets, setWidgets] = useState(() => bootstrapWidgetsLayout());
    const [isLayoutHydrated, setIsLayoutHydrated] = useState(() => !!HEYS.Widgets.state?._initialized);
    const [isDashboardPainted, setIsDashboardPainted] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [dragPreviewPositions, setDragPreviewPositions] = useState(null);
      // Строка «аппаратная кнопка назад · правило продукта»: сначала лист,
      // потом режим правки, потом модалка — и только с Главной без открытых
      // слоёв кнопка выводит из приложения. Режим расстановки в историю не
      // писался, поэтому «назад» из него сворачивал приложение целиком, а
      // незавершённая перестановка оставалась висеть.
      React.useEffect(() => {
        if (!isEditMode) return undefined;
        return HEYS.ModalDismiss?.pushHistoryLayer?.(
          'heysWidgetsEditMode',
          () => HEYS.Widgets.exitEditMode?.({ revert: true }),
        );
      }, [isEditMode]);

    const [cellBudget, setCellBudget] = useState(() => HEYS.Widgets.getBudgetInfo?.() || { used: 0, total: 32 });
    const [catalogBlockedType, setCatalogBlockedType] = useState(null);
    const [catalogPendingAddType, setCatalogPendingAddType] = useState(null);
    const [catalogRemovePick, setCatalogRemovePick] = useState(false);
    const [defaultHomeTab, setDefaultHomeTab] = useState(() => getCurrentDefaultTab());
    const [settingsWidget, setSettingsWidget] = useState(null);
    const [breakdownPayload, setBreakdownPayload] = useState(null);
    const [breakdownClosing, setBreakdownClosing] = useState(false);
    const breakdownCloseTimerRef = useRef(null);
    const [variantSavedToast, setVariantSavedToast] = useState(false);
    const [variantHoldHint, setVariantHoldHint] = useState(false);
    const variantToastTimerRef = useRef(null);
    const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });
    const [showGridOverlay, setShowGridOverlay] = useState(false); // Grid overlay toggle
    const containerRef = useRef(null);
    const gridRef = useRef(null);
    const prevClientIdRef = useRef(clientId);
    const prevIntroClientRef = useRef(clientId);
    const introStartedRef = useRef(false);
    const introActiveRef = useRef(false);
    const motionInitRef = useRef(false);
    const playTabIntroRef = useRef(widgetMotionShouldPlayTabIntro(clientId));
    const [introGeneration, setIntroGeneration] = useState(0);
    const [introActive, setIntroActive] = useState(false);
    const [widgetMotionCssMs, setWidgetMotionCssMs] = useState(WIDGET_MOTION_MS);

    if (!motionInitRef.current) {
      motionInitRef.current = true;
      if (!playTabIntroRef.current) {
        introStartedRef.current = true;
        widgetMotionDisarmIntro();
        widgetV4DisarmSparkSequence();
        widgetMotionEndIntroSlow();
      }
    }

    const beginTabIntro = useCallback(() => {
      if (introStartedRef.current) return;
      introStartedRef.current = true;
      widgetMotionPrepareTabIntroStart();
      widgetV4ArmSparkSequence();
      widgetMotionMarkTabIntroPlayed(clientId);
      setWidgetMotionCssMs(WIDGET_MOTION_INTRO_MS);
      setIntroGeneration((g) => g + 1);
      introActiveRef.current = true;
      setIntroActive(true);
    }, [clientId]);

    useEffect(() => {
      if (prevIntroClientRef.current !== clientId) {
        if (prevIntroClientRef.current) {
          introStartedRef.current = false;
          introActiveRef.current = false;
          setIntroActive(false);
        }
        prevIntroClientRef.current = clientId;
        playTabIntroRef.current = widgetMotionShouldPlayTabIntro(clientId);
      }

      if (!playTabIntroRef.current) {
        introStartedRef.current = true;
        widgetMotionDisarmIntro();
        widgetV4DisarmSparkSequence();
        widgetMotionEndIntroSlow();
        return undefined;
      }

      if (!isDashboardPainted) return undefined;

      let cancelled = false;
      let revealTimer = 0;

      const tryBegin = () => {
        if (cancelled || introStartedRef.current) return;
        if (!widgetMotionCanStartTabIntro(containerRef.current)) return;
        if (revealTimer) return;
        revealTimer = window.setTimeout(() => {
          revealTimer = 0;
          if (cancelled || introStartedRef.current) return;
          if (!widgetMotionCanStartTabIntro(containerRef.current)) return;
          beginTabIntro();
        }, WIDGET_TAB_INTRO_REVEAL_DELAY_MS);
      };

      tryBegin();

      const tick = () => {
        if (!cancelled) tryBegin();
      };
      const intervalId = window.setInterval(tick, 400);
      const blockerEvents = [
        'heys:checkin-complete',
        'heys:morning-checkin-status',
        'heys:modal-stack-idle',
        'visibilitychange'
      ];
      blockerEvents.forEach((ev) => window.addEventListener(ev, tick));
      let mo = null;
      if (typeof MutationObserver !== 'undefined' && document.body) {
        mo = new MutationObserver(tick);
        mo.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'aria-hidden', 'hidden', 'style', 'data-visible']
        });
      }

      return () => {
        cancelled = true;
        if (revealTimer) clearTimeout(revealTimer);
        clearInterval(intervalId);
        blockerEvents.forEach((ev) => window.removeEventListener(ev, tick));
        mo?.disconnect();
      };
    }, [beginTabIntro, clientId, isDashboardPainted]);

    useEffect(() => {
      if (!introActive) return undefined;
      const introTotal = Math.max(
        WIDGET_MOTION_INTRO_MS,
        widgetMotionIntroDuration(WIDGET_V4_SPARK_DELAY_MS)
          + widgetMotionIntroDuration(WIDGET_V4_SPARK_DRAW_MS)
      ) + 120;
      const t = window.setTimeout(() => {
        setWidgetMotionCssMs(WIDGET_MOTION_MS);
        widgetMotionEndIntroSlow();
        widgetMotionDisarmIntro();
        widgetV4DisarmSparkSequence();
        introActiveRef.current = false;
        setIntroActive(false);
      }, introTotal);
      return () => clearTimeout(t);
    }, [introActive]);

    const updateHistoryInfo = useCallback(() => {
      setHistoryInfo({
        canUndo: HEYS.Widgets.canUndo?.() || false,
        canRedo: HEYS.Widgets.canRedo?.() || false
      });
    }, []);

    const refreshCellBudget = useCallback(() => {
      setCellBudget(HEYS.Widgets.getBudgetInfo?.() || { used: 0, total: 32 });
    }, []);

    const openEditWithCatalog = useCallback(() => {
      if (isWidgetsCuratorReadOnly()) return;
      HEYS.Widgets.enterEditMode?.();
    }, []);

    const openCuratorMessenger = useCallback(() => {
      HEYS.Messenger?.openModal?.();
    }, []);

    // Счётчик «занято N из 32» в шапке расстановки (канвас g2, строка «счётчик места»).
    useEffect(() => {
      const title = document.querySelector('.hdr-widgets-edit-title');
      if (!title) return undefined;
      let budgetEl = title.querySelector('.hdr-widgets-edit-budget');
      if (!budgetEl) {
        budgetEl = document.createElement('span');
        budgetEl.className = 'hdr-widgets-edit-budget n';
        title.classList.add('hdr-widgets-edit-title--stacked');
        title.appendChild(budgetEl);
      }
      if (isEditMode) {
        // «при полном экране N красится тоном --val-bad» — красится число,
        // а не вся строка, поэтому N живёт отдельным узлом.
        budgetEl.textContent = '';
        budgetEl.appendChild(document.createTextNode('занято '));
        const numEl = document.createElement('span');
        numEl.className = 'hdr-widgets-edit-budget__num'
          + (cellBudget.used >= cellBudget.total ? ' is-full' : '');
        numEl.textContent = String(cellBudget.used);
        budgetEl.appendChild(numEl);
        budgetEl.appendChild(document.createTextNode(` из ${cellBudget.total}`));
        budgetEl.hidden = false;
      } else {
        budgetEl.textContent = '';
        budgetEl.hidden = true;
      }
      return () => {
        if (budgetEl) {
          budgetEl.textContent = '';
          budgetEl.hidden = true;
        }
      };
    }, [isEditMode, cellBudget.used, cellBudget.total]);

    useEffect(() => {
      refreshCellBudget();
      const unsubLayout = HEYS.Widgets.on?.('layout:changed', refreshCellBudget);
      const unsubBlocked = HEYS.Widgets.on?.('widget:add-blocked', (detail) => {
        if (detail?.type) setCatalogBlockedType(detail.type);
      });
      return () => {
        unsubLayout?.();
        unsubBlocked?.();
      };
    }, [refreshCellBudget]);

    const applyWidgetsLayout = useCallback((layout) => {
      setWidgets([...(layout || [])]);
      updateHistoryInfo();
      refreshCellBudget();
      setIsLayoutHydrated(true);
      setIsDashboardPainted(false);
    }, [refreshCellBudget, updateHistoryInfo]);

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

          const target = 64;
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

    // Дата для widget_data — синхронно до чтения getDataForWidget (без remount вкладки).
    if (HEYS.Widgets.data) {
      HEYS.Widgets.data._selectedDate = selectedDate;
    }

    // 🔄 Реинициализация виджетов при смене клиента
    // Критично: каждый клиент имеет свой layout виджетов!
    useEffect(() => {
      if (clientId) {
        const isRealSwitch = prevClientIdRef.current && prevClientIdRef.current !== clientId;
        if (isRealSwitch) {
          introStartedRef.current = false;
          introActiveRef.current = false;
          setIntroActive(false);
          playTabIntroRef.current = widgetMotionShouldPlayTabIntro(clientId);
        }
        prevClientIdRef.current = clientId;

        console.info(`[WidgetsTab] clientId changed: "${clientId.slice(0, 8)}...", reinitializing widgets`, { isRealSwitch });
        // Сброс глобального кэша каскада, чтобы useLiveCurrentCascade не показывал данные предыдущего клиента
        if (window.HEYS) {
          window.HEYS._lastCrs = null;
        }
        // Передаём clientId явно, т.к. HEYS.currentClientId может ещё не обновиться (race condition)
        HEYS.Widgets.state?.reinit?.(clientId);
        applyWidgetsLayout(HEYS.Widgets.state?.getWidgets?.() || []);
        HEYS.Widgets.data?.refresh?.();
      }
    }, [clientId, applyWidgetsLayout, beginTabIntro]);

    // 🔗 Sync event bridge: DOM events from sync layer → widget data refresh
    // Sync layer dispatches heysSyncCompleted and heys:day-updated as DOM CustomEvents,
    // but widgets listen to HEYS.events / HEYS.Widgets internal event bus.
    // This effect bridges the gap so widgets update after client switch / cloud sync.
    useEffect(() => {
      let dayRefreshTimer = null;
      const onSyncCompleted = (event) => {
        const evClientId = event?.detail?.clientId;
        if (!evClientId || !clientId) return;
        if (evClientId !== clientId && !clientId.startsWith(evClientId)) return;
        const phase = event?.detail?.phase || (event?.detail?.phaseA ? 'A' : 'unknown');
        console.info(`[WidgetsTab] heysSyncCompleted phase=${phase}, refreshing widget data`);
        HEYS.Widgets.data?.refresh?.();
      };

      const onDayUpdated = (detail) => {
        if (detail?.batch) return;
        if (detail?.source === 'cascade-batch') return;
        const evClientId = detail?.clientId;
        // heys:day-updated may not always carry clientId — refresh unconditionally if missing
        if (evClientId && clientId && evClientId !== clientId && !clientId.startsWith(evClientId)) return;
        if (dayRefreshTimer) clearTimeout(dayRefreshTimer);
        dayRefreshTimer = setTimeout(() => {
          dayRefreshTimer = null;
          HEYS.Widgets.data?.refresh?.();
        }, 100);
      };

      const onProfileUpdated = () => {
        HEYS.Widgets.data?.refresh?.();
      };

      // PERF NEW-1: миграция onDayUpdated на dispatcher next-frame lane.
      // Refresh widgets уже debounced 100мс — defer на frame дешёво.
      window.addEventListener('heysSyncCompleted', onSyncCompleted);
      window.addEventListener('heys:profile-updated', onProfileUpdated);
      const dispatcher = window.HEYS?.events?.dayUpdated;
      let unsubDayUpdated;
      if (dispatcher && typeof dispatcher.subscribe === 'function') {
        unsubDayUpdated = dispatcher.subscribe(onDayUpdated, { priority: 'next-frame' });
      } else {
        const wrap = (e) => onDayUpdated(e?.detail || {});
        window.addEventListener('heys:day-updated', wrap);
        unsubDayUpdated = () => window.removeEventListener('heys:day-updated', wrap);
      }

      return () => {
        if (dayRefreshTimer) clearTimeout(dayRefreshTimer);
        window.removeEventListener('heysSyncCompleted', onSyncCompleted);
        window.removeEventListener('heys:profile-updated', onProfileUpdated);
        if (unsubDayUpdated) unsubDayUpdated();
      };
    }, [clientId]);

    // Pull-to-refresh: только на вкладках День (stats/diary) — см. body.heys-pull-refresh-day-active + heys_day_pull_refresh_v1.js

    // Initialize and subscribe to state changes
    useEffect(() => {
      const maybeStartWidgetsTour = (delayMs) => {
        setTimeout(() => {
          if (HEYS.WidgetsTour?.shouldShow?.() && HEYS.WidgetsTour.start) {
            HEYS.WidgetsTour.start();
          }
        }, delayMs);
      };

      const unsubLoaded = HEYS.Widgets.on('layout:loaded', ({ layout }) => {
        applyWidgetsLayout(layout);
        maybeStartWidgetsTour(500);
      });

      const unsubLayout = HEYS.Widgets.on('layout:changed', ({ layout }) => {
        applyWidgetsLayout(layout);
      });

      HEYS.Widgets.state?.init?.();

      HEYS.Widgets.setWidgetsTabOpen?.(true);
      HEYS.Widgets.applyPendingCloudLayout?.();

      if (HEYS.Widgets.state?._initialized) {
        applyWidgetsLayout(HEYS.Widgets.state?.getWidgets?.() || []);
      }

      setIsEditMode(HEYS.Widgets.state?.isEditMode?.() || false);
      setDefaultHomeTab(getCurrentDefaultTab());

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
        HEYS.Widgets.setWidgetsTabOpen?.(false);
        clearTimeout(tourTimer);
        unsubLoaded?.();
        unsubLayout?.();
        unsubEditEnter?.();
        unsubEditExit?.();
        unsubHistory?.();
        window.removeEventListener('heys:default-tab-changed', handleDefaultTabChanged);
      };
    }, [applyWidgetsLayout, getCurrentDefaultTab, VALID_HOME_TABS]);

    useEffect(() => {
      if (!isLayoutHydrated) {
        setIsDashboardPainted(false);
        return;
      }
      let cancelled = false;
      const markPainted = () => {
        if (cancelled) return;
        const root = containerRef.current;
        if (!root) return;
        const grid = root.querySelector('.widgets-grid');
        const gridReady = widgets.length === 0
          || (grid && grid.childElementCount > 0);
        if (!gridReady) return;
        setIsDashboardPainted(true);
        if (!introActiveRef.current) {
          widgetMotionDisarmIntro();
        }
        window.HEYS?.BlankScreenGuard?.reportVisibleFrame?.({
          element: root,
          screen: 'widgets',
          reason: 'widgets_dashboard_painted'
        });
      };
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(markPainted);
      });
      return () => { cancelled = true; };
    }, [isLayoutHydrated, widgets.length]);

    useEffect(() => () => {
      widgetMotionDisarmIntro();
      widgetMotionEndIntroSlow();
      widgetV4DisarmSparkSequence();
    }, []);

    useEffect(() => {
      if (isEditMode) widgetV4DisarmSparkSequence();
    }, [isEditMode]);

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
          if (widgetType?.type) setCatalogBlockedType(widgetType.type);
        } else {
          setCatalogBlockedType(null);
        }
      } else {
        trackWidgetIssue('widgets_createWidget_null', { type: widgetType?.type });
      }
    }, []);

    const handleCatalogReplace = useCallback((widgetType, targetWidgetId) => {
      const replaced = HEYS.Widgets.replaceWidgetFromCatalog?.(targetWidgetId, widgetType.type);
      if (!replaced && widgetType?.type) {
        setCatalogBlockedType(widgetType.type);
      } else {
        setCatalogBlockedType(null);
      }
    }, []);

    // Handle widget settings save
    const handleSettingsSave = useCallback((widgetId, settings) => {
      HEYS.Widgets.state?.updateWidget(widgetId, { settings });
    }, []);

    const dismissBreakdownSheet = useCallback(() => {
      setBreakdownClosing(true);
      if (breakdownCloseTimerRef.current) clearTimeout(breakdownCloseTimerRef.current);
      breakdownCloseTimerRef.current = setTimeout(() => {
        setBreakdownPayload(null);
        setBreakdownClosing(false);
        breakdownCloseTimerRef.current = null;
      }, HEYS.Widgets.VariantsV4?.SHEET_CLOSE_MS ?? 400);
    }, []);

    const openBreakdownSheet = useCallback((widget) => {
      if (!widget || !HEYS.Widgets.VariantsV4?.opensBreakdown?.(widget.type)) return;
      if (
        widget.type === 'crashRisk'
        && widget.size === '2x1'
        && HEYS.Widgets.weightDynamicsClickGuard?.isBlocked?.(widget.id)
      ) {
        return;
      }
      try {
        const model = HEYS.Widgets.VariantsV4.buildBreakdownModel(widget);
        if (!model) return;
        setBreakdownClosing(false);
        setBreakdownPayload({ widget, model, openedAt: Date.now() });
        HEYS.dayUtils?.haptic?.('light');
      } catch (e) {
        trackWidgetIssue('widgets_breakdown_open_failed', {
          widgetId: widget?.id,
          widgetType: widget?.type,
          message: e?.message
        });
      }
    }, []);

    const tryAddPendingCatalogType = useCallback((pendingType) => {
      if (!pendingType?.type || !HEYS.Widgets.registry || !HEYS.Widgets.state) return false;
      const widget = HEYS.Widgets.registry.createWidget(pendingType.type);
      if (!widget) return false;
      const added = HEYS.Widgets.state.addWidget(widget);
      if (added) {
        setCatalogBlockedType(null);
        setCatalogPendingAddType(null);
        setCatalogRemovePick(false);
        return true;
      }
      setCatalogBlockedType(pendingType.type);
      return false;
    }, []);

    const handleStartCatalogRemovePick = useCallback((type) => {
      setCatalogPendingAddType(type);
      setCatalogBlockedType(type?.type || null);
      setCatalogRemovePick(true);
    }, []);

    // Handle widget remove
    const handleRemove = useCallback((widgetId) => {
      HEYS.Widgets.state?.removeWidget(widgetId);
      if (catalogRemovePick && catalogPendingAddType) {
        requestAnimationFrame(() => {
          tryAddPendingCatalogType(catalogPendingAddType);
        });
      } else {
        setCatalogRemovePick(false);
      }
    }, [catalogPendingAddType, catalogRemovePick, tryAddPendingCatalogType]);

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
      const unsubVariantSaved = HEYS.Widgets.on?.('weightDynamics:variantSaved', () => {
        setVariantSavedToast(true);
        if (variantToastTimerRef.current) clearTimeout(variantToastTimerRef.current);
        variantToastTimerRef.current = setTimeout(() => setVariantSavedToast(false), 2200);
      });
      return () => {
        unsubVariantSaved?.();
        if (variantToastTimerRef.current) clearTimeout(variantToastTimerRef.current);
      };
    }, []);

    useEffect(() => {
      const unsub = HEYS.Widgets.VariantsV4?.subscribeVariantHoldHint?.(setVariantHoldHint);
      return () => unsub?.();
    }, []);

    // Положение прокрутки переживает уход на другую вкладку и возврат из
    // «Отчётов», а на смене дня сбрасывается (канвас v4, строка 99).
    useEffect(() => {
      if (typeof window === 'undefined') return undefined;
      const memo = HEYS.Widgets._scrollMemo;
      if (memo && memo.date === selectedDate && memo.top > 0) {
        const top = memo.top;
        requestAnimationFrame(() => window.scrollTo(0, top));
      } else {
        HEYS.Widgets._scrollMemo = { date: selectedDate, top: 0 };
      }
      const onScroll = () => {
        HEYS.Widgets._scrollMemo = { date: selectedDate, top: window.scrollY || 0 };
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, [selectedDate]);

    // Пересборка сетки: плитки, которые сдвинулись, едут 220 мс одной кривой,
    // одновременно и без задержек друг за другом (канвас v4, строка 37).
    // При prefers-reduced-motion новая раскладка появляется сразу (строка 83),
    // при первом открытии экрана анимации тоже нет (строка 70).
    const reflowRectsRef = useRef(null);
    React.useLayoutEffect(() => {
      const grid = gridRef.current;
      if (!grid) return;
      const tiles = grid.querySelectorAll('[data-widget-id]');
      const next = new Map();
      tiles.forEach((el) => {
        next.set(el.getAttribute('data-widget-id'), el.getBoundingClientRect());
      });

      const prev = reflowRectsRef.current;
      reflowRectsRef.current = next;
      if (!prev || dragPreviewPositions) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

      tiles.forEach((el) => {
        const id = el.getAttribute('data-widget-id');
        const before = prev.get(id);
        const after = next.get(id);
        if (!before || !after || typeof el.animate !== 'function') return;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (!dx && !dy) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 220, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
        );
      });
    }, [widgets, dragPreviewPositions]);

    // Предпросмотр порядка при перетаскивании: ядро считает раскладку,
    // React двигает соседей (канвас v4, строка 57).
    useEffect(() => {
      const unsub = HEYS.Widgets.on?.('dnd:preview', ({ positions }) => {
        setDragPreviewPositions(positions || null);
      });
      const unsubEnd = HEYS.Widgets.on?.('dnd:cancel', () => setDragPreviewPositions(null));
      return () => {
        unsub?.();
        unsubEnd?.();
      };
    }, []);

    useEffect(() => {
      const unsubWidgetClick = HEYS.Widgets.on?.('widget:click', ({ widget }) => {
        if (isEditMode || !widget) return;
        openBreakdownSheet(widget);
      });

      return () => {
        unsubWidgetClick?.();
      };
    }, [isEditMode, openBreakdownSheet]);

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
          return;
        }
        // Молчать здесь нельзя: пять действий листов год звали несуществующие
        // имена, вкладка переключалась, и по виду это было неотличимо от
        // работающего действия.
        console.warn(`[HEYS.widgets] действие листа не доехало: HEYS.Day.${fnName} не опубликован`);
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
          const mutationAt = Math.max(Date.now(), (Number(dayData.waterUpdatedAt) || 0) + 1);
          dayData.waterMl = (dayData.waterMl || 0) + ml;
          dayData.lastWaterTime = mutationAt;
          dayData.waterUpdatedAt = mutationAt;
          dayData.updatedAt = mutationAt;

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
              // Ключ дня, в который записан глоток: гейт «стопка на прошлом
              // дне» в геймификации смотрит именно сюда, а отправитель без
              // даты считается сегодняшним — и опыт за вчера начислился бы.
              date: dateKey,
              targetMl: Number(HEYS.Widgets?.data?.getWaterData?.()?.target) || 0,
              source: 'widgets-fab',
              sourceEl
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
            sourceEl
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

    const handleRemoveWater = useCallback((ml = 200) => {
      try {
        const dateKey = selectedDate || new Date().toISOString().slice(0, 10);
        const U = HEYS.utils || {};
        const store = HEYS.store || {};
        const baseKey = `heys_dayv2_${dateKey}`;

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
        const mutationAt = Math.max(Date.now(), (Number(dayData.waterUpdatedAt) || 0) + 1);
        const newWater = Math.max(0, (dayData.waterMl || 0) - ml);
        dayData.waterMl = newWater;
        dayData.waterUpdatedAt = mutationAt;
        dayData.updatedAt = mutationAt;

        if (typeof U.lsSet === 'function') {
          U.lsSet(baseKey, dayData);
        } else if (typeof store.set === 'function') {
          store.set(scopedKey, dayData);
        } else {
          localStorage.setItem(scopedKey, JSON.stringify(dayData));
          window.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: scopedKey, type: 'water' } }));
        }

        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, dayData, source: 'widgets_fab_water_remove' }
        }));

        window.dispatchEvent(new CustomEvent('heysWaterAdded', {
          detail: {
            ml: -ml,
            total: newWater,
            // Та же дата, что и у записи: отмена относится к тому же дню.
            date: dateKey,
            targetMl: Number(HEYS.Widgets?.data?.getWaterData?.()?.target) || 0,
            source: 'widgets-fab-remove',
            playSound: false
          }
        }));
        if (typeof HEYS.events?.emit === 'function') {
          HEYS.events.emit('water:added', { ml: -ml, total: newWater });
        }
      } catch (e) {
        // silent
      }
    }, [selectedDate]);

    const handleBreakdownAction = useCallback((action) => {
      if (!action?.kind) {
        dismissBreakdownSheet();
        return;
      }
      dismissBreakdownSheet();
      // Имена здесь — ключи публичного HEYS.Day, а не внутренние имена дня.
      // До 31 августа стояли пять выдуманных: openAddMeal, openActivityPicker,
      // openWeightEditor, openSleepEditor, openMorningCheckin — ни одного из
      // них день не публикует, и goToDayAndRun молча ничего не делал, только
      // переключал вкладку. Два действия починены переименованием на живой
      // API; три остальных ждут экспорта из дня — см. WIDGET_SHEET_DAY_ACTIONS
      // в widgets-sheet-actions.test.js, список может только уменьшаться.
      switch (action.kind) {
        case 'addMeal':
          goToDayAndRun('day', 'addMeal');
          break;
        case 'addActivity':
          goToDayAndRun('day', 'addActivity');
          break;
        case 'recordWeight':
          goToDayAndRun('day', 'openWeightPicker');
          break;
        case 'fixSleep':
          goToDayAndRun('day', 'openSleepQualityPicker');
          break;
        case 'checkin':
          goToDayAndRun('day', 'openMorningCheckin');
          break;
        case 'insights':
        case 'insightsTab':
          if (typeof setTab === 'function') setTab('insights');
          break;
        case 'waterChips':
          break;
        default:
          break;
      }
    }, [dismissBreakdownSheet, goToDayAndRun, setTab]);

    const handleBreakdownWaterChip = useCallback((ml) => {
      handleAddWater(ml);
    }, [handleAddWater]);

    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
      HEYS.Widgets.undo?.();
    }, []);

    const handleRedo = useCallback(() => {
      HEYS.Widgets.redo?.();
    }, []);

    // Подтверждения нет: сброс отменяется той же стрелкой расстановки, пока
    // человек не нажал «Готово» (контракт, строка «сброс к дефолту»).
    const handleResetLayout = useCallback(() => {
      HEYS.Widgets.resetLayout?.();
      setShowGridOverlay(false);
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

    // Сбрасываем overlay при выходе из edit mode
    useEffect(() => {
      if (!isEditMode) {
        setShowGridOverlay(false);
        setCatalogBlockedType(null);
        HEYS.Widgets._catalogDragType = null;
        HEYS.Widgets._catalogDropTargetId = null;
      }
    }, [isEditMode]);

    const isLegacyOverflow = cellBudget.isOverflow;

    const overlayRows = useMemo(() => {
      if (!widgets.length) return 8;
      const maxRow = widgets.reduce((max, w) => {
        return Math.max(max, (w.position?.row || 1) + (w.rows || 1) - 1);
      }, 4);
      return Math.max(8, maxRow + 2);
    }, [widgets]);

    const pullIndicatorEl = null;

    // Карточка быстрых действий раскрыта — см. «карандаш и кнопка настройки».
    const [quickSheetOpen, setQuickSheetOpen] = useState(false);


    const renderMobileFabs = () => {
      if (!isMobile || isWidgetsCuratorReadOnly()) return null;
      return React.createElement(React.Fragment, null,
        // Строка «карандаш и кнопка настройки»: пока карточка раскрыта, кнопка
        // настройки экрана внизу слева скрыта — на затемнённом слое остаются
        // только карточка, «×» и карандаш правки. В режиме расстановки та же
        // кнопка становится «Готово» (home-widgets «вход в расстановку»).
        React.createElement('div', {
          className: 'widgets-fab-left' + (quickSheetOpen && !isEditMode ? ' is-hidden' : '')
        },
          React.createElement(WidgetsSettingsFab, {
            done: isEditMode,
            onClick: isEditMode
              ? () => HEYS.Widgets.toggleEditMode?.()
              : openEditWithCatalog
          })
        ),
        !isEditMode && React.createElement(WidgetsQuickActionsFab, {
          onOpenChange: setQuickSheetOpen,
          waterMl: HEYS.Widgets?.data?.getWaterData?.()?.drunk || 0,
          // Строка контракта «ошибочный глоток»: убавления в стопке нет —
          // сразу после тапа глоток снимается полосой отмены
          // (undo-bar.v4.dc.html), позже — чипом убавления на «Питании».
          onAddWater: (ml) => {
            handleAddWater(ml);
            HEYS.Undo?.push?.({
              label: `Записано ${formatRuUnit(ml, 'мл')}`,
              onUndo: () => handleRemoveWater(ml)
            });
          },
          onAddMeal: () => goToDayAndRun('diary', 'addMeal', []),
          onOpenCurator: openCuratorMessenger,
          // Голод и активность открываются тем же способом, что и в легаси-стопке
          // на дневных вкладках — состав действий у них общий (строка «набор
          // действий»), различается только оболочка.
          onOpenHunger: () => HEYS.HungerEnergyStatusModal?.show?.({}),
          onOpenActivity: () => goToDayAndRun('activity', 'addActivity', [])
        })
      );
    };

    const renderLongPressHintLayer = () => {
      if (!showLongPressHint) return null;
      const node = React.createElement('div', {
        className: 'widgets-longpress-hint',
        role: 'status',
        // Плашка не блокирует экран: затемнения нет, плитки под ней работают.
        // Поэтому закрытие висит на самой плашке и на первом касании сетки.
        onPointerDown: () => {
          setShowLongPressHint(false);
          try {
            const U = HEYS.utils || {};
            const prof = U.lsGet?.('heys_profile', {}) || {};
            U.lsSet?.('heys_profile', {
              ...prof,
              longPressHintShown: true,
              widgetsHoldHintShown: true,
              homeOpensCount: Math.max(Number(prof.homeOpensCount) || 0, 3),
              widgetsTabOpenCount: Math.max(Number(prof.widgetsTabOpenCount) || 0, 3),
            });
          } catch (_) { /* профиль останется прежним */ }
        }
      },
        React.createElement('svg', {
          className: 'widgets-longpress-hint__icon',
          // Строка «вид подсказки жеста»: значок 22 px тоном --ac.
          width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 2.4,
          strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
          React.createElement('path', { d: 'M9 11V6a1.5 1.5 0 013 0v5' }),
          React.createElement('path', { d: 'M12 11V4.5a1.5 1.5 0 013 0V11' }),
          React.createElement('path', { d: 'M15 11V7.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-1a5 5 0 01-4.4-2.6L4 13.5a1.5 1.5 0 012.4-1.8L8 14' })
        ),
        React.createElement('span', { className: 'widgets-longpress-hint__text' },
          React.createElement('span', { className: 'widgets-longpress-hint__title' },
            'Задержите палец на плитке'),
          React.createElement('span', { className: 'widgets-longpress-hint__sub' },
            'Так меняется её вид — например, «Вес» с числа на график.')
        )
      );
      // В body — как quick-sheet: swipeable с overflow:hidden ломает stacking
      // position:fixed, и FAB ниже по DOM перекрывают плашку несмотря на z-index.
      return global.document?.body && ReactDOM?.createPortal
        ? ReactDOM.createPortal(node, global.document.body)
        : node;
    };

    // До гидратации layout — пустая оболочка. Boot-знак держит кадр до paint.
    if (!isLayoutHydrated) {
      return React.createElement('div', {
        className: 'widgets-tab',
        ref: containerRef,
      }, pullIndicatorEl);
    }

    // Render empty state (только после первичной гидратации layout)
    if (isLayoutHydrated && widgets.length === 0 && !isEditMode) {
      return React.createElement('div', {
        className: 'widgets-tab',
        ref: containerRef,
        'data-heys-visible-frame': 'widgets'
      },
        pullIndicatorEl,
        React.createElement('div', { className: 'widgets-empty widget-v4-empty' },
          React.createElement('div', { className: 'widgets-empty__title' }, 'Виджетов нет'),
          isWidgetsCuratorReadOnly()
            ? React.createElement('div', { className: 'widgets-empty__desc' },
              'Клиент ещё не собрал экран'
            )
            : React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'widgets-empty__desc' },
                'Соберите экран из того, что смотрите каждый день'
              ),
              React.createElement('button', {
                type: 'button',
                className: 'widget-v4-empty__btn',
                onClick: openEditWithCatalog
              },
                React.createElement('svg', {
                  width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
                  stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round',
                  'aria-hidden': 'true'
                }, React.createElement('path', { d: 'M12 5v14M5 12h14' })),
                'Добавить виджет'
              ),
              React.createElement('button', {
                type: 'button',
                className: 'widget-v4-empty__reset',
                onClick: handleResetLayout
              }, 'Вернуть стандартный экран')
            )
        ),
        renderMobileFabs(),
        renderLongPressHintLayer()
      );
    }

    return React.createElement('div', {
      className: 'widgets-tab'
        + (isEditMode ? ' widgets-tab--editing' : '')
        + (isLegacyOverflow ? ' widgets-tab--legacy-overflow' : ''),
      ref: containerRef,
      'data-heys-visible-frame': isDashboardPainted ? 'widgets' : undefined
    },
      // Pull-to-refresh indicator
      pullIndicatorEl,

      React.createElement('div', { className: 'widgets-header' }),

      React.createElement('div', {
        className: 'widgets-grid-container'
          + (isLegacyOverflow ? ' widgets-grid-container--legacy-overflow' : '')
      },
        React.createElement('div', {
          // Строки «без анимации» и «меньше движения» (канвас home-widgets):
          // при системной настройке пересборка мгновенная, значения на месте.
          // Флага animate-always здесь нет: он родился в 8de305b9 (11.2025) как
          // обход настройки ради отрисовки спарклайнов, а спарклайны с тех пор
          // носят свой флаг на .sparkline-svg. На корне сетки флаг выводил
          // из-под гашения всё поддерево — плитки, кольца, полосы, пульсы.
          className: `widgets-grid ${isEditMode ? 'widgets-grid--editing' : ''}`
            + (catalogRemovePick ? ' widgets-grid--remove-pick' : ''),
          ref: gridRef,
          style: { '--widget-motion-ms': `${widgetMotionCssMs}ms` }
        },
          widgets.map((widget, idx) =>
            React.createElement(WidgetCard, {
              key: `${widget.id}_${introGeneration}`,
              widget,
              selectedDate,
              isEditMode,
              index: idx,
              dragPreviewPosition: dragPreviewPositions?.[widget.id] || null,
              onRemove: handleRemove,
              onSettings: setSettingsWidget,
              removePickActive: catalogRemovePick,
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

      !isEditMode && !showLongPressHint && variantHoldHint && React.createElement('div', { className: 'widgets-tab__hold-hint' },
        React.createElement('span', { className: 'widget-v4-hold-hint__pill' }, 'удерживайте, чтобы сменить вид')
      ),

      // Кадр «Смена вида · новый вид»: подтверждение — шалфейный близнец
      // пилюли удержания под сеткой, а не тёмный тост внизу экрана. Пилюли
      // взаимоисключающие: либо человек держит, либо только что сменил вид.
      variantSavedToast && React.createElement('div', {
        className: 'widgets-tab__hold-hint',
        role: 'status'
      },
        React.createElement('span', {
          className: 'widget-v4-hold-hint__pill widget-v4-hold-hint__pill--saved'
        }, 'вид сохранён')
      ),

      isEditMode && React.createElement(CatalogStrip, {
        onSelect: handleCatalogSelect,
        onReplace: handleCatalogReplace,
        existingTypes: new Set((widgets || []).map(w => w.type)),
        selectedDate,
        cellBudget,
        blockedType: catalogBlockedType,
        onBlockedHint: (type) => setCatalogBlockedType(type),
        onStartRemovePick: handleStartCatalogRemovePick
      }),

      // Виден всю расстановку, а не только при раскрытом каталоге: путь назад
      // к дефолту нельзя прятать за «Добавить» — человек ищет его как раз тогда,
      // когда добавлять ничего не собирается. Порядок из контракта («между
      // каталогом и пустым состоянием») сохраняется: с раскрытым каталогом блок
      // идёт после него, с закрытым — сразу под сеткой.
      isEditMode && React.createElement(RecommendedScreenBlock, {
        onReset: handleResetLayout
      }),

      isEditMode && React.createElement('div', { className: 'widget-v4-edit-footer' },
        React.createElement('span', { className: 'widget-v4-edit-footer__hint' }, 'Потяните плитку, чтобы поменять порядок'),
        React.createElement('span', { className: 'widget-v4-edit-footer__history' },
          React.createElement('button', {
            type: 'button',
            className: 'widget-v4-edit-footer__icon' + (!historyInfo.canUndo ? ' is-off' : ''),
            onClick: handleUndo,
            disabled: !historyInfo.canUndo,
            title: 'Отменить',
            'aria-label': 'Отменить'
          },
            React.createElement('svg', {
              width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
              'aria-hidden': 'true'
            },
              React.createElement('path', { d: 'M9 14L4 9l5-5' }),
              React.createElement('path', { d: 'M4 9h11a5 5 0 010 10h-1' })
            )
          ),
          React.createElement('button', {
            type: 'button',
            className: 'widget-v4-edit-footer__icon' + (!historyInfo.canRedo ? ' is-off' : ''),
            onClick: handleRedo,
            disabled: !historyInfo.canRedo,
            title: 'Повторить',
            'aria-label': 'Повторить'
          },
            React.createElement('svg', {
              width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
              'aria-hidden': 'true'
            },
              React.createElement('path', { d: 'M15 14l5-5-5-5' }),
              React.createElement('path', { d: 'M20 9H9a5 5 0 000 10h1' })
            )
          )
        )
      ),

      // Modals
      React.createElement(SettingsModal, {
        widget: settingsWidget,
        isOpen: !!settingsWidget,
        onClose: () => setSettingsWidget(null),
        onSave: handleSettingsSave
      }),
      HEYS.Widgets.VariantsV4?.WidgetBreakdownSheet
        ? React.createElement(HEYS.Widgets.VariantsV4.WidgetBreakdownSheet, {
          open: !!breakdownPayload,
          closing: breakdownClosing,
          model: breakdownPayload?.model,
          onClose: dismissBreakdownSheet,
          onAction: handleBreakdownAction,
          onWaterChip: handleBreakdownWaterChip
        })
        : null,
      React.createElement('div', { className: 'widgets-edit-controls' }),

      renderMobileFabs(),
      renderLongPressHintLayer()
    );
  }

  // === Exports ===
  HEYS.Widgets.WidgetsTab = WidgetsTab;
  HEYS.Widgets.WidgetCard = WidgetCard;
  HEYS.Widgets.CatalogModal = CatalogModal;
  HEYS.Widgets.CatalogStrip = CatalogStrip;
  // Экспорт ради смоука крайних случаев состава: ноль пунктов, один пункт,
  // порядок и чипы воды руками не собрать (строки «включён один пункт»,
  // «не включено ни одного», «порядок в карточке»).
  HEYS.Widgets.QuickActionsFab = WidgetsQuickActionsFab;
  // Экспорт ради смоука общей шкалы темпа (строки «вода» и «одна шкала на весь
  // продукт»): зоны 8 / 25 % вниз и 110 / 130 % вверх, первый час после
  // подъёма и конец окна руками на живом дне не собрать.
  HEYS.Widgets.v4PaceState = v4PaceState;
  // Экспорт ради смоука видов «Динамики веса»: тело вида рисуется и на плитке,
  // и карточкой листа, а живьём для вида «График» нужны тридцать взвешиваний
  // подряд — руками такой день не собрать.
  HEYS.Widgets.renderWeightDynamicsBody = renderWeightDynamicsBody;
  // Экспорт ради смоука строки «формат чисел · правило продукта»: разделитель
  // разрядов — невидимый символ, и глазами U+202F от U+00A0 не отличить.
  HEYS.Widgets.formatRuNumber = formatRuNumber;
  HEYS.Widgets.formatRuUnit = formatRuUnit;
  HEYS.Widgets.formatRuDecimal = formatRuDecimal;
  HEYS.Widgets.SettingsModal = SettingsModal;
  HEYS.Widgets.RelapseRiskDetailsModal = RelapseRiskDetailsModal;
  /**
   * Строка «значение справа» (канвас settings-system): в строке шторки
   * настроек стоит текущее значение — «палитра тремя кружками, „Главная“,
   * число, „6 из 7 блоков“». Счёт блоков живёт здесь, рядом с раскладкой и
   * каталогом: шторка про виджеты ничего не знает и знать не должна.
   *
   * «Блок» — плитка Главной. По строке home-widgets «один экземпляр» один
   * виджет даёт ровно одну плитку, поэтому видимое считается по типам.
   * Знаменатель — каталог доступных типов плюс те, что уже стоят на экране:
   * снятый с каталога, но ещё стоящий блок человек видит, и вычитать его из
   * знаменателя значило бы показать «7 из 6».
   *
   * Саму строку шторки рисует heys_app_shell_v1.js — там её ещё нет.
   */
  HEYS.Widgets.getVisibleBlocksSummary = function getVisibleBlocksSummary() {
    const placed = HEYS.Widgets.state?.getWidgets?.() || [];
    const catalog = HEYS.Widgets.registry?.getAvailableTypes?.() || [];
    const visibleTypes = new Set(
      placed.map((widget) => widget && widget.type).filter(Boolean),
    );
    const allTypes = new Set(visibleTypes);
    catalog.forEach((type) => {
      const id = type && (type.id || type.type);
      if (id) allTypes.add(id);
    });
    const visible = visibleTypes.size;
    const total = allTypes.size;
    return { visible, total, text: `${visible} из ${total} блоков` };
  };

  if (widgetsDebugEnabled() && widgetsOnce('widgets_ui_loaded')) {
    trackWidgetIssue('widgets_ui_loaded', { version: '1.1.0' });
  }

})(typeof window !== 'undefined' ? window : global);
