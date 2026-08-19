/**
 * heys_widgets_variants_v4.js
 * Каталог видов виджетов v4 (31 варианта), шторка и long-press.
 * Загружать перед heys_widgets_ui_v1.js
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};

  const React = global.React;
  const ReactDOM = global.ReactDOM;
  const { useState, useEffect, useCallback, useRef } = React || {};

  const LONG_PRESS_MS = 350;
  const SHEET_CLOSE_MS = 400;
  const EXIT_MS = 160;
  const ENTER_MS = 220;
  const HOLD_HINT_MS = 120;

  let variantHoldHintActive = false;
  const variantHoldHintListeners = new Set();

  function setVariantHoldHintActive(next) {
    if (variantHoldHintActive === next) return;
    variantHoldHintActive = next;
    variantHoldHintListeners.forEach((fn) => {
      try { fn(next); } catch (_) { /* noop */ }
    });
  }

  function subscribeVariantHoldHint(listener) {
    if (typeof listener !== 'function') return () => {};
    variantHoldHintListeners.add(listener);
    return () => variantHoldHintListeners.delete(listener);
  }

  const WIDGET_TYPE_LABELS = {
    calories: 'Калории',
    macros: 'Кольца БЖУ',
    water: 'Вода',
    sleep: 'Сон',
    dayScore: 'Оценка дня',
    heatmap: 'Тепловая карта',
    relapseRisk: 'Риск-радар',
    healthTrend: 'Тренд здоровья',
    insulinWave: 'Инсулиновая волна',
    weight: 'Вес',
    crashRisk: 'Динамика веса'
  };

  const WIDGET_TILE_BG = {
    calories: 'sand',
    healthTrend: 'sage'
  };

  /** @type {Record<string, Array<{id:string,title:string,subtitle:string,size:string,tileBg?:string}>>} */
  const CATALOG = {
    calories: [
      { id: 'hero', title: 'Как сейчас', subtitle: 'остаток, полоса, съедено из нормы', size: '2x2', tileBg: 'sand' },
      { id: 'line', title: 'Строка', subtitle: 'та же цифра в 2×1', size: '2x1' },
      { id: 'dinner', title: 'Хватит на ужин', subtitle: 'остаток против вашего обычного ужина', size: '2x2' },
      { id: 'activity', title: 'С активностью', subtitle: 'остаток с учётом сожжённого', size: '2x1' }
    ],
    macros: [
      { id: 'rings', title: 'Как сейчас', subtitle: 'три кольца, подписи с двух сторон', size: '3x2' },
      { id: 'bars', title: 'Три полосы', subtitle: 'то же в 2×1, освобождает полстроки', size: '2x1' },
      { id: 'deficits', title: 'Что выбивается', subtitle: 'крупно самое большое отклонение', size: '2x1' },
      { id: 'protein_only', title: 'Только белок', subtitle: '1×1 для тех, кто следит за одним', size: '1x1' }
    ],
    water: [
      { id: 'mini', title: 'Как сейчас', subtitle: 'литры и доля нормы', size: '1x1' },
      { id: 'by_hour', title: 'К этому часу', subtitle: 'отставание от графика, метка — где надо быть', size: '2x1' },
      { id: 'rhythm', title: 'Ритм дня', subtitle: 'когда пил и где провал', size: '2x1' }
    ],
    sleep: [
      { id: 'mini', title: 'Как сейчас', subtitle: 'часы за ночь', size: '1x1' },
      { id: 'to_norm', title: 'К норме', subtitle: 'отклонение вместо абсолюта', size: '1x1' },
      { id: 'week_debt', title: 'Долг за неделю', subtitle: 'копится и видно, где отсыпался', size: '2x1' },
      { id: 'window', title: 'Окно сна', subtitle: 'во сколько лёг — виден сдвиг', size: '2x1' }
    ],
    dayScore: [
      { id: 'row', title: 'Как сейчас', subtitle: 'только итог', size: '2x1' },
      { id: 'factors', title: 'Из чего сложилась', subtitle: 'пять слагаемых — что просело', size: '2x1' },
      { id: 'week_chart', title: 'Семь дней', subtitle: 'итог в ряду недели', size: '2x2' }
    ],
    heatmap: [
      { id: 'week_bar', title: 'Как сейчас', subtitle: 'семь дней полосами', size: '2x1' },
      { id: 'streak', title: 'Серия', subtitle: 'дней подряд без пропусков', size: '1x1' },
      { id: 'month_grid', title: 'Месяц целиком', subtitle: '28 дней сеткой', size: '2x2' }
    ],
    relapseRisk: [
      { id: 'list', title: 'Как сейчас', subtitle: 'уровень и две причины', size: '2x2' },
      { id: 'main', title: 'Главный риск', subtitle: 'назван риск, уровень — подписью', size: '2x1' },
      // Дефолт задан флагом, а не порядком: порядок карточек в шторке принадлежит
      // канвасу, а какой вид стоит по умолчанию — решение владельца (2026-08-19).
      { id: 'scale', title: 'Шкала', subtitle: 'уровень из четырёх и что его поднимет', size: '2x2', isDefault: true }
    ],
    healthTrend: [
      { id: 'spark', title: 'Как сейчас', subtitle: '+8 за 14 дней и линия', size: '2x2', tileBg: 'sage' },
      { id: 'compact', title: 'Компакт', subtitle: 'то же в 2×1', size: '2x1' }
    ],
    insulinWave: [
      { id: 'day_as_is', title: 'День как есть', subtitle: 'все приёмы за день, наложения темнее', size: '2x2' },
      { id: 'current_wave', title: 'Текущая волна', subtitle: 'сколько осталось до спада прямо сейчас', size: '2x2' },
      { id: 'overlaps', title: 'Пересечения', subtitle: 'где приём попал в незакрывшуюся волну', size: '2x2' },
      { id: 'day_bar', title: 'Полоса дня', subtitle: 'сколько часов инсулин был поднят', size: '2x1' },
      { id: 'calm_window', title: 'Спокойное окно', subtitle: 'самый длинный промежуток без волн', size: '1x1' }
    ],
    weight: [
      { id: 'spark', title: 'Как сейчас', subtitle: 'вес, неделя, линия', size: '2x2' },
      { id: 'delta', title: 'Только число', subtitle: '1×1, когда рядом стоит динамика', size: '1x1' },
      { id: 'scatter', title: 'Точки и среднее', subtitle: 'видно, что дельта считается по среднему', size: '2x2' }
    ],
    crashRisk: [
      { id: 'curve', title: 'Кривая', subtitle: 'сколько сброшено и как шло', size: '2x1', sheet: true },
      { id: 'bar_remainder', title: 'Остаток полосой', subtitle: 'сколько до цели', size: '2x1', sheet: true },
      { id: 'weeks', title: 'Недели', subtitle: 'средние, без скачков воды', size: '2x1', sheet: true },
      { id: 'number_only', title: 'Только цифра', subtitle: 'без графики', size: '2x1', sheet: true },
      { id: 'to_goal', title: 'До цели', subtitle: 'главное — остаток, темп подписью', size: '2x1', sheet: true },
      { id: 'compact', title: 'Компакт', subtitle: 'дельта за месяц в 1×1', size: '1x1', sheet: false },
      { id: 'chart', title: 'График', subtitle: 'динамика за 30 дней в 2×2', size: '2x2', sheet: false }
    ]
  };

  const clickGuard = {
    _until: new Map(),
    _globalUntil: 0,
    block(widgetId, ms = 900) {
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

  function stopEventBubble(event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
  }

  function getCatalog(widgetType) {
    return CATALOG[widgetType] || [];
  }

  function getSheetCatalog(widgetType) {
    return getCatalog(widgetType).filter((item) => item.sheet !== false);
  }

  // Вид по умолчанию — помеченный isDefault, иначе первый в каталоге.
  function getDefaultVariant(widgetType) {
    const catalog = getCatalog(widgetType);
    return catalog.find((v) => v.isDefault) || catalog[0] || null;
  }

  function getActiveVariant(widget, widgetType) {
    const catalog = getCatalog(widgetType);
    const id = widget?.settings?.displayVariant;
    const found = catalog.find((v) => v.id === id);
    return found || getDefaultVariant(widgetType);
  }

  function getVariantById(widgetType, variantId) {
    return getCatalog(widgetType).find((v) => v.id === variantId) || null;
  }

  function countCatalogVariants() {
    let n = 0;
    Object.values(CATALOG).forEach((list) => {
      n += list.length;
    });
    return n;
  }

  function previewSizeClass(size) {
    if (size === '1x1') return 'widget-wd-sheet__preview--1x1';
    if (size === '3x2') return 'widget-wd-sheet__preview--3x2';
    if (size === '2x2') return 'widget-wd-sheet__preview--2x2';
    return 'widget-wd-sheet__preview--2x1';
  }

  function WidgetVariantSheet({
    open,
    closing,
    widgetType,
    activeVariantId,
    onSelect,
    onClose,
    renderPreview
  }) {
    if (!open && !closing) return null;
    const portalRoot = typeof document !== 'undefined' ? document.body : null;
    if (!portalRoot || !ReactDOM?.createPortal) return null;

    if (closing) {
      return ReactDOM.createPortal(React.createElement('div', {
        className: 'widget-wd-sheet__blocker',
        'aria-hidden': 'true',
        onPointerDown: stopEventBubble,
        onPointerUp: stopEventBubble,
        onClick: stopEventBubble
      }), portalRoot);
    }

    const catalog = getSheetCatalog(widgetType);
    const title = WIDGET_TYPE_LABELS[widgetType] || widgetType || 'Виджет';

    const sheet = React.createElement(React.Fragment, null,
      React.createElement('button', {
        type: 'button',
        className: 'widget-wd-sheet__scrim',
        'aria-label': 'Закрыть',
        ...(window.HEYS?.ModalDismiss?.reactBackdropDismiss
          ? window.HEYS.ModalDismiss.reactBackdropDismiss(onClose)
          : {
            onPointerDown: stopEventBubble,
            onClick: (event) => {
              stopEventBubble(event);
              onClose();
            }
          })
      }),
      React.createElement('div', {
        className: 'widget-wd-sheet animate-always',
        role: 'dialog',
        'aria-label': 'Как показывать плитку',
        onPointerDown: stopEventBubble,
        onClick: stopEventBubble
      },
        React.createElement('span', { className: 'widget-wd-sheet__grab' }),
        React.createElement('div', { className: 'widget-wd-sheet__title' }, title),
        React.createElement('div', { className: 'widget-wd-sheet__subtitle' }, 'Как показывать плитку'),
        React.createElement('div', { className: 'widget-wd-sheet__list' },
          catalog.map((item) => {
            const isOn = item.id === activeVariantId;
            const previewClass = [
              'widget-wd-sheet__preview',
              'widget-wd',
              'widget-wd--preview',
              previewSizeClass(item.size)
            ].join(' ');
            const wideStack = item.size === '3x2';
            return React.createElement('button', {
              key: item.id,
              type: 'button',
              className: 'widget-wd-sheet__opt' + (isOn ? ' is-active' : ''),
              onPointerDown: stopEventBubble,
              onClick: (event) => {
                stopEventBubble(event);
                onSelect(item.id);
              }
            },
              wideStack
                ? React.createElement('div', { className: 'widget-wd-sheet__preview-stack' },
                  React.createElement('div', { className: previewClass },
                    renderPreview(item.id, { compact: true, previewSize: item.size })
                  )
                )
                : React.createElement('div', { className: previewClass },
                  renderPreview(item.id, { compact: true, previewSize: item.size })
                ),
              React.createElement('div', { className: 'widget-wd-sheet__opt-text' },
                React.createElement('div', { className: 'widget-wd-sheet__opt-title' }, item.title),
                React.createElement('div', { className: 'widget-wd-sheet__opt-sub' }, item.subtitle)
              ),
              isOn ? React.createElement('span', { className: 'widget-wd-sheet__check', 'aria-hidden': 'true' },
                React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
                  React.createElement('path', { d: 'M5 13l4 4L19 7' })
                )) : null
            );
          })
        )
      )
    );
    return ReactDOM.createPortal(sheet, portalRoot);
  }

  function useWidgetVariantTile(options = {}) {
    const {
      widget,
      widgetType,
      disabled = false,
      onVariantSaved,
      renderPreview
    } = options;

    const catalog = getCatalog(widgetType);
    const hasVariants = catalog.length > 1;
    const displayVariant = widget?.settings?.displayVariant || getDefaultVariant(widgetType)?.id || 'default';
    const activeMeta = getActiveVariant(widget, widgetType);

    const [sheetOpen, setSheetOpen] = useState(false);
    const [sheetClosing, setSheetClosing] = useState(false);
    const [holding, setHolding] = useState(false);
    const [animPhase, setAnimPhase] = useState('idle');
    const [renderVariant, setRenderVariant] = useState(displayVariant);
    const [sceneId, setSceneId] = useState(0);

    const lpTimerRef = useRef(null);
    const lpHintTimerRef = useRef(null);
    const lpTriggeredRef = useRef(false);
    const lpStartRef = useRef(null);
    const sheetCloseTimerRef = useRef(null);
    const animTimersRef = useRef([]);

    const clearAnimTimers = useCallback(() => {
      animTimersRef.current.forEach((id) => {
        if (typeof id === 'number') {
          clearTimeout(id);
          cancelAnimationFrame(id);
        }
      });
      animTimersRef.current = [];
    }, []);

    useEffect(() => () => {
      clearAnimTimers();
      if (lpTimerRef.current) clearTimeout(lpTimerRef.current);
      if (lpHintTimerRef.current) clearTimeout(lpHintTimerRef.current);
      if (sheetCloseTimerRef.current) clearTimeout(sheetCloseTimerRef.current);
      setVariantHoldHintActive(false);
    }, [clearAnimTimers]);

    const dismissVariantSheet = useCallback(() => {
      clickGuard.block(widget?.id);
      setSheetOpen(false);
      setSheetClosing(true);
      setHolding(false);
      if (sheetCloseTimerRef.current) clearTimeout(sheetCloseTimerRef.current);
      sheetCloseTimerRef.current = setTimeout(() => {
        setSheetClosing(false);
        sheetCloseTimerRef.current = null;
      }, SHEET_CLOSE_MS);
    }, [widget?.id]);

    useEffect(() => {
      if (displayVariant === renderVariant) return;
      clearAnimTimers();
      setAnimPhase('exit');
      const t1 = setTimeout(() => {
        setRenderVariant(displayVariant);
        setSceneId((id) => id + 1);
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            setAnimPhase('enter');
            const tEnter = setTimeout(() => setAnimPhase('idle'), ENTER_MS);
            animTimersRef.current.push(tEnter);
          });
        });
        animTimersRef.current.push(raf1, raf2);
      }, EXIT_MS);
      animTimersRef.current.push(t1);
    }, [displayVariant, renderVariant, clearAnimTimers]);

    const cancelLongPress = useCallback(() => {
      if (lpTimerRef.current) {
        clearTimeout(lpTimerRef.current);
        lpTimerRef.current = null;
      }
      if (lpHintTimerRef.current) {
        clearTimeout(lpHintTimerRef.current);
        lpHintTimerRef.current = null;
      }
      setVariantHoldHintActive(false);
    }, []);

    const onPointerDown = useCallback((event) => {
      if (disabled || !hasVariants) return;
      if (sheetOpen || sheetClosing) return;
      lpTriggeredRef.current = false;
      lpStartRef.current = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };
      cancelLongPress();
      lpHintTimerRef.current = setTimeout(() => {
        if (!sheetOpen && !sheetClosing) setVariantHoldHintActive(true);
      }, HOLD_HINT_MS);
      lpTimerRef.current = setTimeout(() => {
        lpTriggeredRef.current = true;
        clickGuard.block(widget?.id);
        setVariantHoldHintActive(false);
        setHolding(true);
        setSheetOpen(true);
        HEYS.dayUtils?.haptic?.('light');
      }, LONG_PRESS_MS);
    }, [cancelLongPress, disabled, hasVariants, sheetOpen, sheetClosing, widget?.id]);

    const onPointerMove = useCallback((event) => {
      if (!lpTimerRef.current || !lpStartRef.current) return;
      const x = event.clientX || event.touches?.[0]?.clientX || 0;
      const y = event.clientY || event.touches?.[0]?.clientY || 0;
      const dx = Math.abs(x - lpStartRef.current.x);
      const dy = Math.abs(y - lpStartRef.current.y);
      if (dx > 10 || dy > 10) cancelLongPress();
    }, [cancelLongPress]);

    const onPointerUp = useCallback(() => {
      cancelLongPress();
      setHolding(false);
    }, [cancelLongPress]);

    const onClick = useCallback((event) => {
      if (
        lpTriggeredRef.current
        || sheetOpen
        || sheetClosing
        || clickGuard.isBlocked(widget?.id)
      ) {
        lpTriggeredRef.current = false;
        stopEventBubble(event);
      }
    }, [sheetOpen, sheetClosing, widget?.id]);

    const onSelectVariant = useCallback((nextId) => {
      clickGuard.block(widget?.id);
      if (!widget?.id || nextId === displayVariant) {
        dismissVariantSheet();
        return;
      }
      const meta = getVariantById(widgetType, nextId);
      HEYS.Widgets.state?.updateWidget(widget.id, {
        settings: { ...(widget.settings || {}), displayVariant: nextId }
      }, true);
      HEYS.dayUtils?.haptic?.('light');
      onVariantSaved?.({ widgetId: widget.id, variant: nextId, widgetType });
      dismissVariantSheet();
    }, [widget, widgetType, displayVariant, dismissVariantSheet, onVariantSaved]);

    const tileBg = activeMeta?.tileBg || WIDGET_TILE_BG[widgetType] || null;
    const tileClass = [
      'widget-v4-tile',
      'animate-always',
      tileBg ? `widget-v4-tile--bg-${tileBg}` : '',
      holding ? 'widget-v4-tile--holding' : '',
      animPhase === 'exit' ? 'widget-v4-tile--exit' : '',
      animPhase === 'enter' ? 'widget-v4-tile--enter' : ''
    ].filter(Boolean).join(' ');

    const tileProps = hasVariants && !disabled ? {
      className: tileClass,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClick
    } : {
      className: tileClass.replace('widget-v4-tile--holding', '').trim()
    };

    const sheetProps = hasVariants ? {
      open: sheetOpen,
      closing: sheetClosing,
      widgetType,
      activeVariantId: displayVariant,
      onSelect: onSelectVariant,
      onClose: dismissVariantSheet,
      renderPreview
    } : null;

    return {
      tileProps,
      sheetProps,
      activeVariant: activeMeta,
      renderVariant,
      holding,
      animPhase,
      sceneId,
      hasVariants,
      WidgetVariantSheet
    };
  }

  function buildRegistryDisplayVariant(widgetType) {
    const catalog = getCatalog(widgetType);
    if (!catalog.length) return null;
    const fallback = getDefaultVariant(widgetType);
    return {
      type: 'select',
      default: fallback.id,
      label: 'Вид',
      options: catalog.map((v) => ({
        value: v.id,
        label: v.num != null ? `${v.num}. ${v.title}` : v.title
      }))
    };
  }

  function applyCatalogToRegistry() {
    const reg = HEYS.Widgets.Registry;
    if (!reg?.getType) return;
    Object.entries(CATALOG).forEach(([widgetType, variants]) => {
      if (!variants.length) return;
      const def = reg.getType(widgetType);
      if (!def) return;
      const sizes = [...new Set(variants.map((v) => v.size))];
      def.availableSizes = [...new Set([...(def.availableSizes || []), ...sizes])];
      const dv = buildRegistryDisplayVariant(widgetType);
      if (dv) {
        def.settings = { ...(def.settings || {}), displayVariant: dv };
      }
    });
  }

  HEYS.Widgets.VariantsV4 = {
    CATALOG,
    LONG_PRESS_MS,
    SHEET_CLOSE_MS,
    EXIT_MS,
    ENTER_MS,
    clickGuard,
    subscribeVariantHoldHint,
    getCatalog,
    getSheetCatalog,
    getActiveVariant,
    getDefaultVariant,
    getVariantById,
    countCatalogVariants,
    WidgetVariantSheet,
    useWidgetVariantTile,
    buildRegistryDisplayVariant,
    applyCatalogToRegistry,
    WIDGET_TYPE_LABELS,
    WIDGET_TILE_BG
  };

  // Совместимость с динамикой веса
  HEYS.Widgets.weightDynamicsClickGuard = clickGuard;
  applyCatalogToRegistry();
})(typeof window !== 'undefined' ? window : globalThis);
