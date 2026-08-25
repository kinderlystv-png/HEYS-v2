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

  const LONG_PRESS_MS = HEYS.longPress?.MS ?? 350;
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
    crashRisk: 'Динамика веса',
    steps: 'Шаги',
    fiber: 'Клетчатка',
    protein: 'Белок',
    sleepWindow: 'Окно до сна',
    foodQuality: 'Качество еды',
    mealRhythm: 'Ритм приёмов',
    sleepReady: 'Готовность ко сну'
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
      { id: 'mini', title: 'Как сейчас', subtitle: 'число из десяти', size: '1x1', isDefault: true },
      { id: 'factors', title: 'Из чего сложилась', subtitle: 'пять слагаемых — что просело', size: '2x1' },
      { id: 'week_chart', title: 'Семь дней', subtitle: 'итог в ряду недели', size: '2x1' }
    ],
    heatmap: [
      { id: 'week_bar', title: 'Как сейчас', subtitle: 'семь дней полосами', size: '2x1' },
      { id: 'streak', title: 'Серия', subtitle: 'дней подряд без пропусков', size: '1x1' },
      { id: 'month_grid', title: 'Месяц целиком', subtitle: '28 дней сеткой', size: '2x2' }
    ],
    relapseRisk: [
      // «Как сейчас» этот вид больше не называется: по умолчанию стоит «Шкала».
      { id: 'list', title: 'Уровень и причины', subtitle: 'срывы и недосып под уровнем', size: '2x2' },
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
    // Оба вида — тренды: числа «сейчас» у шагов не существует, они вносятся
    // вечером в чек-ине (строка контракта «шаги», решение 22 августа).
    steps: [
      { id: 'week', title: 'Неделя', subtitle: 'семь столбиков и среднее', size: '2x1', isDefault: true },
      { id: 'month', title: 'Месяц', subtitle: '30 столбиков, среднее в день и цель', size: '2x2' }
    ],
    weight: [
      { id: 'number_week', title: 'Число и неделя', subtitle: 'число справа, дельта за неделю', size: '2x1', isDefault: true },
      { id: 'spark', title: 'Как сейчас', subtitle: 'вес, неделя, линия', size: '2x2' },
      { id: 'delta', title: 'Только число', subtitle: '1×1, когда рядом стоит динамика', size: '1x1' },
      { id: 'scatter', title: 'Точки и среднее', subtitle: 'видно, что дельта считается по среднему', size: '2x2' }
    ],
    // ─── Шесть виджетов пакета 22 августа, кадры 37–51 ───────────────────
    // Дефолт помечен флагом isDefault, а не порядком карточек: порядок в листе
    // принадлежит канвасу (карточки по возрастанию формата, дефолт первым).
    fiber: [
      { id: 'now', title: 'Как сейчас', subtitle: 'граммы и полоса до нормы', size: '1x1', isDefault: true },
      { id: 'add', title: 'Добрать', subtitle: 'сколько осталось и чем добрать', size: '2x1' },
      { id: 'week', title: 'Неделя', subtitle: 'семь дней столбиками против нормы', size: '2x2' }
    ],
    protein: [
      { id: 'now', title: 'Как сейчас', subtitle: 'граммы и полоса до нормы', size: '1x1', isDefault: true },
      { id: 'add', title: 'Добрать', subtitle: 'сколько осталось до нормы', size: '2x1' },
      { id: 'by_meal', title: 'По приёмам', subtitle: 'сколько белка дал каждый приём', size: '2x2' }
    ],
    sleepWindow: [
      { id: 'now', title: 'Как сейчас', subtitle: 'сколько до отбоя после еды', size: '1x1', isDefault: true },
      { id: 'evening', title: 'Вечер', subtitle: 'полоса от последнего приёма до отбоя', size: '2x1' }
    ],
    foodQuality: [
      { id: 'now', title: 'Как сейчас', subtitle: 'индекс из 10 и полоса', size: '1x1', isDefault: true },
      { id: 'why', title: 'Что снизило', subtitle: 'дельта и причина одной строкой', size: '2x1' },
      { id: 'week', title: 'Неделя', subtitle: 'семь дней столбиками', size: '2x2' }
    ],
    mealRhythm: [
      { id: 'day_line', title: 'Лента дня', subtitle: 'точки приёмов на полосе дня', size: '2x1', isDefault: true },
      { id: 'intervals', title: 'Интервалы', subtitle: 'средний промежуток и три последних', size: '2x2' }
    ],
    sleepReady: [
      { id: 'checklist', title: 'Чек-лист', subtitle: 'вода, еда до сна и шаги точками', size: '2x1', isDefault: true },
      { id: 'review', title: 'Разбор', subtitle: 'те же три строки числами и время до отбоя', size: '2x2' }
    ],
    crashRisk: [
      // Дефолт «За месяц» с кривой — решение владельца 20 августа: переключатель
      // 7 / 14 / 30 снят, окно растёт само по числу подтверждённых дней.
      { id: 'curve', title: 'Кривая', subtitle: 'сколько сброшено и как шло', size: '2x1', sheet: true, isDefault: true },
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

  // Формат плитки словами — для вспомогательных технологий (канвас v4, 84).
  const SIZE_SPEECH = {
    '1x1': 'одна колонка на один ряд',
    '2x1': 'две колонки на один ряд',
    '2x2': 'две колонки на два ряда',
    '3x2': 'три колонки на два ряда'
  };

  function prefersReducedMotion() {
    try {
      return !!global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (_) {
      return false;
    }
  }

  function getLiveRegion() {
    if (typeof document === 'undefined') return null;
    let node = document.getElementById('heys-widgets-live');
    if (!node) {
      node = document.createElement('div');
      node.id = 'heys-widgets-live';
      node.className = 'sr-only';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    return node;
  }

  /** «Вес, за месяц, две колонки на два ряда» — одной фразой после смены вида. */
  function announceVariantChange(widgetType, meta) {
    const node = getLiveRegion();
    if (!node || !meta) return;
    const parts = [
      WIDGET_TYPE_LABELS[widgetType] || widgetType,
      String(meta.title || '').toLowerCase(),
      SIZE_SPEECH[meta.size] || meta.size
    ].filter(Boolean);
    node.textContent = parts.join(', ');
  }

  /**
   * Если после пересборки плитка уехала за кадр — экран догоняет её так, чтобы
   * она попала целиком (канвас v4, строка 74).
   */
  function keepChangedTileInView(widgetId) {
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-widget-id="${widgetId}"]`);
        if (!el?.getBoundingClientRect) return;
        const rect = el.getBoundingClientRect();
        const viewportH = global.innerHeight || 0;
        const fullyVisible = rect.top >= 0 && rect.bottom <= viewportH;
        if (fullyVisible) return;
        el.scrollIntoView?.({
          block: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        });
      });
    });
  }

  function stopEventBubble(event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
  }

  function getCatalog(widgetType) {
    return CATALOG[widgetType] || [];
  }

  // Площадь формата — по ней лист сортирует карточки (канвас v4, строки 27 и
  // 81): по возрастанию формата, внутри одного формата — порядок каталога.
  const SIZE_AREA = { '1x1': 1, '2x1': 2, '2x2': 4, '3x2': 6 };

  function getSheetCatalog(widgetType) {
    return getCatalog(widgetType)
      .filter((item) => item.sheet !== false)
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const area = (SIZE_AREA[a.item.size] || 0) - (SIZE_AREA[b.item.size] || 0);
        return area !== 0 ? area : a.index - b.index;
      })
      .map((entry) => entry.item);
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
            // Превью — настоящая плитка: те же классы, что на Главной, иначе
            // карточка живёт по своим стилям и расходится с результатом
            // выбора (канвас v4, строки 27 и 28).
            const previewClass = [
              'widget-wd-sheet__preview',
              'widget-wd',
              'widget-wd--preview',
              'widget',
              `widget--${item.size}`,
              `widget--${widgetType}`,
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
      if (disabled) return;
      if (sheetOpen || sheetClosing) return;
      lpTriggeredRef.current = false;
      lpStartRef.current = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };
      cancelLongPress();
      // Подсказка «удерживайте, чтобы сменить вид» — только там, где есть что
      // менять: у плитки без вариантов удержание ведёт в расстановку.
      if (hasVariants) {
        lpHintTimerRef.current = setTimeout(() => {
          if (!sheetOpen && !sheetClosing) setVariantHoldHintActive(true);
        }, HOLD_HINT_MS);
      }
      lpTimerRef.current = setTimeout(() => {
        lpTriggeredRef.current = true;
        clickGuard.block(widget?.id);
        setVariantHoldHintActive(false);
        // Строка контракта «плитка без вариантов»: пустой лист не открываем —
        // если у виджета один вид и один формат, удержание уводит в режим
        // расстановки. Раньше такое удержание не делало ничего.
        if (!hasVariants) {
          HEYS.dayUtils?.haptic?.('light');
          HEYS.Widgets?.enterEditMode?.();
          return;
        }
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
      // Размер — свойство вида (канвас v4, строки 32 и 79): вид и формат идут
      // одной записью, иначе они разъезжаются.
      const updates = { settings: { ...(widget.settings || {}), displayVariant: nextId } };
      if (meta?.size && meta.size !== widget.size) updates.size = meta.size;

      // Сначала лист закрывается, потом сетка пересобирается (строка 73):
      // пока лист открыт, сетка за ним не видна и анимация ушла бы в пустоту.
      dismissVariantSheet();
      HEYS.dayUtils?.haptic?.('light');
      const applyVariant = () => {
        HEYS.Widgets.state?.updateWidget(widget.id, updates, true);
        onVariantSaved?.({ widgetId: widget.id, variant: nextId, widgetType, size: meta?.size || widget.size });
        announceVariantChange(widgetType, meta);
        keepChangedTileInView(widget.id);
      };
      if (typeof setTimeout === 'function') {
        const t = setTimeout(applyVariant, SHEET_CLOSE_MS);
        animTimersRef.current.push(t);
      } else {
        applyVariant();
      }
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

    // Обработчики удержания нужны и плитке без вариантов — она уводит в
    // расстановку (строка «плитка без вариантов»).
    const tileProps = !disabled ? {
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
