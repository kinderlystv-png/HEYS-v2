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

  // ─── Разбор плитки (batch 1: 12 с данными, batch 2: 6 stub «за сегодня») ───
  const BREAKDOWN_BATCH1 = [
    'calories', 'water', 'weight', 'sleep', 'steps', 'insulinWave', 'macros',
    'dayScore', 'relapseRisk', 'healthTrend', 'heatmap', 'crashRisk'
  ];
  const BREAKDOWN_STUB_TYPES = new Set([
    'fiber', 'protein', 'sleepWindow', 'foodQuality', 'mealRhythm', 'sleepReady'
  ]);
  const BREAKDOWN_ALL_TYPES = [...BREAKDOWN_BATCH1, ...BREAKDOWN_STUB_TYPES];

  function resolveBreakdownType(widget) {
    if (!widget?.type) return null;
    if (widget.type === 'status') return 'dayScore';
    return widget.type;
  }

  function opensBreakdown(widgetType) {
    const t = widgetType === 'status' ? 'dayScore' : widgetType;
    return BREAKDOWN_ALL_TYPES.includes(t);
  }

  function bdLayer() {
    return HEYS.Widgets.data || {};
  }

  function bdFormatNum(value, frac) {
    if (HEYS.Widgets?.formatRuNumber) {
      return HEYS.Widgets.formatRuNumber(value, { maximumFractionDigits: frac ?? 0 });
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ru-RU', { maximumFractionDigits: frac ?? 0 });
  }

  function bdMedian(values) {
    const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function bdDaySeries(daysBack) {
    const d = bdLayer();
    const rows = [];
    const today = new Date();
    for (let i = daysBack - 1; i >= 0; i -= 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const iso = typeof d._formatDate === 'function'
        ? d._formatDate(dt)
        : dt.toISOString().slice(0, 10);
      const day = i === 0 && typeof d._getDay === 'function'
        ? d._getDay()
        : (typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null);
      rows.push({ iso, day, isToday: i === 0 });
    }
    return rows;
  }

  function bdSplinePath(points, width, height, padY) {
    if (!points.length) return '';
    const xs = points.map((_, i) => (i / Math.max(1, points.length - 1)) * width);
    const max = Math.max(...points, 1);
    const ys = points.map((v) => height - padY - (v / max) * (height - padY * 2));
    if (points.length < 2) return `M ${xs[0]} ${ys[0]}`;
    let d = `M ${xs[0]} ${ys[0]}`;
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x0 = xs[i - 1] ?? xs[i];
      const y0 = ys[i - 1] ?? ys[i];
      const x1 = xs[i];
      const y1 = ys[i];
      const x2 = xs[i + 1];
      const y2 = ys[i + 1];
      const x3 = xs[i + 2] ?? x2;
      const y3 = ys[i + 2] ?? y2;
      const cp1x = x1 + (x2 - x0) / 6;
      const cp1y = y1 + (y2 - y0) / 6;
      const cp2x = x2 - (x3 - x1) / 6;
      const cp2y = y2 - (y3 - y1) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }
    return d;
  }

  function bdParseMealMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.trim().split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  /** Медиана «к этому часу» из истории приёмов, не эвристика hourShare×медиана. */
  function bdTypicalCaloriesAtHour() {
    const d = bdLayer();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const cumByDay = [];
    for (let i = 1; i <= 30; i += 1) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - i);
      const iso = typeof d._formatDate === 'function' ? d._formatDate(dt) : dt.toISOString().slice(0, 10);
      const day = typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null;
      if (!day?.meals?.length) continue;
      let cum = 0;
      day.meals.forEach((meal) => {
        const min = bdParseMealMinutes(meal?.time);
        if (min == null || min > nowMin) return;
        const items = Array.isArray(meal?.items) ? meal.items : [];
        items.forEach((item) => {
          cum += (Number(item?.kcal100) || 0) * ((Number(item?.grams) || 0) / 100);
        });
      });
      if (cum > 0) cumByDay.push(Math.round(cum));
    }
    return bdMedian(cumByDay);
  }

  function bdSleepWindowStrip(daysBack) {
    const d = bdLayer();
    const rows = [];
    const today = new Date();
    for (let i = daysBack - 1; i >= 0; i -= 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const iso = typeof d._formatDate === 'function' ? d._formatDate(dt) : dt.toISOString().slice(0, 10);
      const day = i === 0 && typeof d._getDay === 'function'
        ? d._getDay()
        : (typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null);
      const start = bdParseMealMinutes(day?.sleepStart);
      const end = bdParseMealMinutes(day?.sleepEnd);
      rows.push({ iso, start, end, isToday: i === 0 });
    }
    return rows;
  }

  function bdAvgBedtimeLabel(strip) {
    const starts = (strip || []).map((r) => r.start).filter(Number.isFinite);
    if (!starts.length) return null;
    const avg = Math.round(starts.reduce((a, b) => a + b, 0) / starts.length);
    const h = Math.floor(avg / 60) % 24;
    const m = avg % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function bdBedtimeSpreadHours(strip) {
    const starts = (strip || []).map((r) => r.start).filter(Number.isFinite);
    if (starts.length < 2) return null;
    const min = Math.min(...starts);
    const max = Math.max(...starts);
    return Math.round(((max - min) / 60) * 10) / 10;
  }

  function bdFormatGoalDate(weeksToGoal) {
    if (!Number.isFinite(weeksToGoal) || weeksToGoal <= 0) return null;
    const dt = new Date();
    dt.setDate(dt.getDate() + weeksToGoal * 7);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const mid = Math.ceil(dt.getDate() / 2);
    return `середина ${months[dt.getMonth()]}`;
  }

  function bdWeightDaySpreadKg(sparkline) {
    const today = sparkline?.length ? sparkline[sparkline.length - 1] : null;
    const w = Number(today?.weight ?? today?.smoothed);
    if (!Number.isFinite(w)) return null;
    return 0.6;
  }

  function bdStepsWeekdayTable(week, goal) {
    const weekdayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const byWd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
    (week || []).forEach((row) => {
      if (!row.hasData) return;
      const wd = new Date(`${row.iso}T12:00:00`).getDay();
      byWd[wd].sum += row.value;
      byWd[wd].n += 1;
    });
    const rows = byWd.map((b, i) => ({
      wd: i,
      label: weekdayNames[i],
      avg: b.n ? Math.round(b.sum / b.n) : null
    })).filter((r) => r.avg != null);
    if (!rows.length) return [];
    rows.sort((a, b) => a.avg - b.avg);
    const weakest = rows[0];
    const strongest = rows[rows.length - 1];
    return rows.map((r) => ({
      label: r.label,
      value: `${bdFormatNum(r.avg)} шагов`,
      tone: r === weakest ? 'bad' : r === strongest ? 'good' : null
    }));
  }

  function bdDayScoreMonthStats() {
    const d = bdLayer();
    if (!HEYS.DayScore?.calculateDayScore) return { avg: null, belowSix: 0, bestWd: null };
    const profile = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const normAbs = typeof d._getNormAbs === 'function' ? d._getNormAbs() : {};
    const waterGoal = typeof d._getWaterGoal === 'function' ? d._getWaterGoal() : 2000;
    const weekdayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const scores = [];
    const byWd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
    const today = new Date();
    for (let i = 0; i < 30; i += 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const iso = typeof d._formatDate === 'function' ? d._formatDate(dt) : dt.toISOString().slice(0, 10);
      const dayData = typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null;
      try {
        const dayTot = typeof d._calculateDayTotals === 'function' ? d._calculateDayTotals(dayData) : {};
        const result = HEYS.DayScore.calculateDayScore({
          dayData, profile, dayTot, normAbs, waterGoal
        });
        const sc = Math.round(Number(result?.score) || 0);
        if (sc > 0) {
          scores.push(sc);
          const wd = dt.getDay();
          byWd[wd].sum += sc;
          byWd[wd].n += 1;
        }
      } catch { /* skip */ }
    }
    const avg = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
    const belowSix = scores.filter((s) => s < 60).length;
    let bestWd = null;
    let bestAvg = -1;
    byWd.forEach((b, i) => {
      if (!b.n) return;
      const a = b.sum / b.n;
      if (a > bestAvg) { bestAvg = a; bestWd = weekdayNames[i]; }
    });
    return { avg, belowSix, bestWd, total: scores.length };
  }

  function bdHeatmapGapFlags(cells) {
    const flags = cells.map(() => false);
    let run = 0;
    cells.forEach((c, i) => {
      if ((c.mins || 0) <= 0) {
        run += 1;
        if (run >= 2) flags[i] = true;
      } else {
        run = 0;
      }
    });
    return flags;
  }

  function buildStubBreakdown(type, title, widget) {
    const d = bdLayer();
    const base = typeof d.getDataForWidget === 'function'
      ? d.getDataForWidget(widget)
      : {};
    let heroKicker = 'Сегодня';
    let heroValue = '—';
    let heroUnit = '';
    if (type === 'fiber' || type === 'protein') {
      heroKicker = type === 'fiber' ? 'Клетчатка' : 'Белок';
      heroValue = base.fiber != null ? bdFormatNum(base.fiber || base.protein) : bdFormatNum(base.value);
      heroUnit = ' г';
      if (base.norm) heroValue = `${heroValue} из ${bdFormatNum(base.norm)}`;
    } else if (type === 'sleepWindow') {
      heroKicker = 'Окно до сна';
      heroValue = base.label || base.windowLabel || '—';
    } else if (type === 'foodQuality') {
      heroKicker = 'Качество еды';
      heroValue = base.score != null ? bdFormatNum(base.score, 1) : '—';
      heroUnit = ' / 10';
    } else if (type === 'mealRhythm') {
      heroKicker = 'Приёмы';
      heroValue = bdFormatNum(base.mealCount || base.count || 0);
    } else if (type === 'sleepReady') {
      heroKicker = 'Готовность';
      heroValue = base.score != null ? bdFormatNum(base.score) : '—';
      heroUnit = ' / 10';
    }
    return {
      type,
      title,
      stubOnly: true,
      heroKicker,
      heroValue,
      heroUnit,
      insight: null,
      chartLabel: null,
      chart: null,
      stats: [],
      norm: null,
      action: { kind: 'addMeal', label: 'Добавить приём' },
      waterChips: false
    };
  }

  function buildCaloriesBreakdown(title, widget) {
    const d = bdLayer();
    const today = typeof d.getCaloriesData === 'function' ? d.getCaloriesData() : {};
    const target = today.target || 2000;
    const series = bdDaySeries(7).map(({ iso, day, isToday }) => {
      const tot = typeof d._calculateDayTotals === 'function' ? d._calculateDayTotals(day) : null;
      const kcal = Math.round(Number(tot?.kcal) || 0);
      return { iso, kcal, isToday, hit: kcal > 0 };
    });
    const eatenValues = series.filter((s) => s.hit).map((s) => s.kcal);
    const med = bdMedian(eatenValues);
    const min = eatenValues.length ? Math.min(...eatenValues) : null;
    const max = eatenValues.length ? Math.max(...eatenValues) : null;
    const typicalNow = bdTypicalCaloriesAtHour();
    const dinnerLeft = today.dinnerBudgetKcal || Math.round(target * 0.28);
    return {
      type: 'calories',
      title,
      heroKicker: 'Осталось',
      heroValue: bdFormatNum(Math.max(0, target - (today.eaten || 0))),
      heroUnit: ' ккал',
      insight: typicalNow != null
        ? `Обычно к этому часу вы съедаете ${bdFormatNum(typicalNow)}`
        : null,
      chartLabel: 'Съедено за 7 дней',
      chart: { kind: 'bars7', series, targetLine: target },
      stats: [
        med != null ? { label: 'Типичный день', value: `${bdFormatNum(Math.round(med))} ккал` } : null,
        min != null && max != null
          ? { label: 'Разброс', value: `от ${bdFormatNum(min)} до ${bdFormatNum(max)}` }
          : null,
        { label: 'Обычно на ужин остаётся', value: `${bdFormatNum(dinnerLeft)} ккал` }
      ].filter(Boolean),
      norm: `Норма ${bdFormatNum(target)} ккал — расчёт куратора от веса, цели и активности`,
      action: { kind: 'addMeal', label: 'Добавить приём' },
      waterChips: false
    };
  }

  function buildWaterBreakdown(title) {
    const d = bdLayer();
    const water = typeof d.getWaterData === 'function' ? d.getWaterData() : {};
    const target = water.target || 2000;
    const bins = Array.isArray(water.rhythmBins) ? water.rhythmBins : [];
    const weekHits = bdDaySeries(7).filter(({ day }) => (day?.waterMl || 0) >= target).length;
    const insight = water.checkHourLabel
      ? `Норму вы обычно набираете ${water.checkHourLabel}`
      : null;
    return {
      type: 'water',
      title,
      heroKicker: 'Выпито за день',
      heroValue: bdFormatNum(Math.round((water.drunk || 0) / 100) / 10, 1),
      heroUnit: ' л',
      insight,
      chartLabel: 'Ритм дня',
      chart: { kind: 'bins', bins, todayLine: bins },
      stats: [
        { label: 'Норма набирается', value: `${weekHits} дня из 7` },
        { label: 'Сейчас', value: `${bdFormatNum(water.drunk || 0)} мл` }
      ],
      norm: `Норма ${bdFormatNum(Math.round(target / 100) / 10, 1)} л — 30 мл на килограмм плюс поправка на активность`,
      action: { kind: 'waterChips', label: 'Добавить воду' },
      waterChips: true
    };
  }

  function buildWeightBreakdown(title) {
    const d = bdLayer();
    const w = typeof d.getWeightData === 'function' ? d.getWeightData() : {};
    const prof = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const spark = Array.isArray(w.sparkline) ? w.sparkline : [];
    const points = spark.slice(-30).map((p) => Number(p.weight)).filter(Number.isFinite);
    const delta30 = points.length >= 2 ? points[points.length - 1] - points[0] : null;
    const tempoWeek = w.trend != null ? (w.trend * 7) : w.weekChange;
    const goal = w.goal || prof.weightGoal;
    let insight = null;
    if (tempoWeek != null && w.weeksToGoal) {
      const goalWhen = bdFormatGoalDate(w.weeksToGoal);
      insight = `Темп ${tempoWeek > 0 ? '+' : ''}${bdFormatNum(tempoWeek, 1)} кг в неделю — к цели${goalWhen ? ` в ${goalWhen}` : ` через ${bdFormatNum(w.weeksToGoal)} нед.`}`;
    }
    const daySpread = bdWeightDaySpreadKg(spark);
    return {
      type: 'weight',
      title,
      heroKicker: 'Утром',
      heroValue: w.current != null ? bdFormatNum(w.current, 1) : '—',
      heroUnit: ' кг',
      insight,
      chartLabel: '30 дней',
      chart: { kind: 'weightCurve', spark: spark.slice(-30) },
      stats: [
        delta30 != null ? { label: 'За 30 дней', value: `${delta30 > 0 ? '+' : ''}${bdFormatNum(delta30, 1)} кг` } : null,
        { label: 'Замеров', value: `${spark.length} из 30` },
        daySpread != null ? { label: 'Разброс дня', value: `±${bdFormatNum(daySpread, 1)} кг` } : null
      ].filter(Boolean),
      norm: goal ? `Цель ${bdFormatNum(goal, 1)} кг — из вашего профиля` : 'Цель задаётся с куратором',
      action: { kind: 'recordWeight', label: 'Записать вес' },
      waterChips: false
    };
  }

  function buildSleepBreakdown(title) {
    const d = bdLayer();
    const sleep = typeof d.getSleepData === 'function' ? d.getSleepData() : {};
    const strip = bdSleepWindowStrip(14);
    const bars = sleep.sleepWeekBars || [];
    const durations = bars.map((b) => b.hours).filter((h) => h > 0);
    const avg = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    const normHits14 = strip.filter((row) => {
      const day = typeof d._getDayByDate === 'function' ? d._getDayByDate(row.iso) : null;
      return (Number(day?.sleepHours) || 0) >= (sleep.target || 8);
    }).length;
    const avgBed = bdAvgBedtimeLabel(strip);
    const bedSpread = bdBedtimeSpreadHours(strip);
    return {
      type: 'sleep',
      title,
      heroKicker: 'Этой ночью',
      heroValue: sleep.hours ? bdFormatNum(sleep.hours, 1) : '—',
      heroUnit: ' ч',
      insight: avgBed
        ? `Ложитесь в среднем в ${avgBed}${bedSpread ? `, разброс ${bedSpread} ч` : ''}`
        : (sleep.weekDebtHours > 0
          ? `Долг за неделю — ${bdFormatNum(sleep.weekDebtHours, 1)} ч`
          : null),
      chartLabel: '14 ночей',
      chart: { kind: 'sleepStrip', series: strip, avgBedMin: avgBed ? bdParseMealMinutes(avgBed) : null },
      stats: [
        avg != null ? { label: 'Средняя длительность', value: `${bdFormatNum(avg, 1)} ч` } : null,
        { label: 'Норму набрали', value: `${normHits14} дня из 14` },
        sleep.weekDebtHours > 0
          ? { label: 'Долг за неделю', value: `${bdFormatNum(sleep.weekDebtHours, 1)} ч` }
          : null
      ].filter(Boolean),
      norm: `Норма ${bdFormatNum(sleep.target || 8, 1)} ч — из вашего профиля`,
      action: { kind: 'fixSleep', label: 'Поправить время' },
      waterChips: false
    };
  }

  function buildStepsBreakdown(title) {
    const d = bdLayer();
    const steps = typeof d.getStepsData === 'function' ? d.getStepsData() : {};
    const week = steps.week || [];
    const goal = steps.goal || 10000;
    const weekdayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const wdRows = bdStepsWeekdayTable(week, goal);
    const hits = week.filter((r) => r.hasData && r.value >= goal).length;
    return {
      type: 'steps',
      title,
      heroKicker: 'За день',
      heroValue: steps.hasData ? bdFormatNum(steps.steps) : '—',
      heroUnit: '',
      insight: wdRows.find((r) => r.tone === 'bad')
        ? `${wdRows.find((r) => r.tone === 'bad').label} — самый слабый день недели`
        : null,
      chartLabel: '7 дней',
      chart: { kind: 'bars7', series: week.map((r) => ({ kcal: r.value || 0, isToday: r.isToday, hit: r.hasData })), targetLine: goal },
      stats: wdRows.concat([{ label: 'Цель закрыта', value: `${hits} дня из 7` }]),
      norm: `Цель ${bdFormatNum(goal)} шагов — вы поставили её в чек-ине`,
      action: { kind: 'addActivity', label: 'Добавить активность' },
      waterChips: false
    };
  }

  function buildInsulinWaveBreakdown(title, widget) {
    const d = bdLayer();
    const wave = typeof d.getInsulinWaveData === 'function' ? d.getInsulinWaveData() : {};
    const v4 = wave.v4 || {};
    const freeMin = v4.calmWindowMinutes ?? v4.freeWindowMinutes ?? wave.remaining ?? null;
    const heroKicker = wave.isOvernightAssessment || wave.isOvernightEstimate ? 'Оценка по вчерашнему дню' : 'Свободное окно';
    const avgCalm = v4.calmWindowMinutes;
    return {
      type: 'insulinWave',
      title,
      heroKicker,
      heroValue: freeMin != null ? `${Math.floor(freeMin / 60)} ч ${freeMin % 60} мин` : '—',
      heroUnit: '',
      insight: wave.endTime ? `Последняя волна закрывается в ${wave.endTime}` : null,
      chartLabel: 'Сегодня',
      chart: { kind: 'waveDay', wave, v4 },
      stats: [
        avgCalm != null ? { label: 'Среднее окно', value: `${Math.floor(avgCalm / 60)} ч ${avgCalm % 60} мин` } : null,
        { label: 'Нахлёстов за неделю', value: bdFormatNum(v4.overlapCount || wave.overlapCount || 0) },
        { label: 'Волн сегодня', value: bdFormatNum(wave.waveCount || v4.mealCount || 0) }
      ].filter(Boolean),
      norm: 'Волна считается от углеводов приёма — 3 ч на приём, дольше при нахлёсте',
      action: { kind: 'addMeal', label: 'Добавить приём' },
      waterChips: false
    };
  }

  function buildMacrosBreakdown(title) {
    const d = bdLayer();
    const today = typeof d.getMacrosData === 'function' ? d.getMacrosData() : {};
    const series = bdDaySeries(7).map(({ day, isToday }) => {
      const tot = typeof d._calculateDayTotals === 'function' ? d._calculateDayTotals(day) : {};
      const p = Number(tot?.protein) || 0;
      const f = Number(tot?.fat) || 0;
      const c = Number(tot?.carbs) || 0;
      const pt = today.proteinTarget || 1;
      const ft = today.fatTarget || 1;
      const ct = today.carbsTarget || 1;
      return {
        isToday,
        proteinOk: p >= pt * 0.9 && p <= pt * 1.1,
        fatOk: f <= ft * 1.05,
        carbsOk: c <= ct * 1.05 && c >= ct * 0.85
      };
    });
    const missProtein = series.filter((s) => !s.proteinOk).length;
    const avgProteinPct = today.proteinTarget
      ? Math.round(((today.protein || 0) / today.proteinTarget) * 100)
      : 0;
    const avgFatPct = today.fatTarget
      ? Math.round(((today.fat || 0) / today.fatTarget) * 100)
      : 0;
    const avgCarbsPct = today.carbsTarget
      ? Math.round(((today.carbs || 0) / today.carbsTarget) * 100)
      : 0;
    return {
      type: 'macros',
      title,
      heroKicker: 'Сегодня',
      heroValue: `${bdFormatNum(today.protein || 0)}/${bdFormatNum(today.proteinTarget || 0)}`,
      heroUnit: ' г белка',
      heroTracks: [
        { label: 'Б', value: bdFormatNum(today.protein || 0), norm: bdFormatNum(today.proteinTarget || 0), unit: 'г' },
        { label: 'Ж', value: bdFormatNum(today.fat || 0), norm: bdFormatNum(today.fatTarget || 0), unit: 'г' },
        { label: 'У', value: bdFormatNum(today.carbs || 0), norm: bdFormatNum(today.carbsTarget || 0), unit: 'г' }
      ],
      insight: missProtein ? `Белок недобираете ${missProtein} дня из 7` : null,
      chartLabel: 'Попадания за 7 дней',
      chart: { kind: 'grid3x7', series },
      stats: [
        { label: 'Белок — % нормы в среднем', value: `${avgProteinPct} %` },
        { label: 'Жиры — % нормы в среднем', value: `${avgFatPct} %` },
        { label: 'Углеводы — % нормы в среднем', value: `${avgCarbsPct} %` }
      ],
      norm: 'Нормы БЖУ — расчёт куратора от калорий и цели',
      action: { kind: 'addMeal', label: 'Добавить приём' },
      waterChips: false
    };
  }

  function buildDayScoreBreakdown(title) {
    const d = bdLayer();
    const ds = typeof d.getDayScoreData === 'function' ? d.getDayScoreData() : {};
    const week = ds.weekScores || [];
    const factorBars = ds.factorBars || [];
    const weakest = [...factorBars].sort((a, b) => a.score - b.score)[0];
    const month = bdDayScoreMonthStats();
    const avgWeek = week.length
      ? week.reduce((s, r) => s + (r.score || 0), 0) / week.length
      : null;
    return {
      type: 'dayScore',
      title,
      heroKicker: 'Оценка',
      heroValue: bdFormatNum(Math.round(ds.score || 0)),
      heroUnit: ' / 10',
      insight: weakest ? `Чаще всего вниз тянет ${weakest.label}` : null,
      chartLabel: '7 дней',
      chart: { kind: 'bars7score', series: week },
      stats: [
        month.avg != null ? { label: 'Средняя за месяц', value: bdFormatNum(month.avg / 10, 1) } : null,
        month.bestWd ? { label: 'Лучший день', value: month.bestWd } : null,
        month.total ? { label: 'Ниже 6', value: `${month.belowSix} дня из ${month.total}` } : null,
        avgWeek != null ? { label: 'Средняя за неделю', value: bdFormatNum(avgWeek / 10, 1) } : null
      ].filter(Boolean),
      factorBars,
      norm: 'Оценка складывается из пяти частей, вес каждой — в справочнике',
      action: { kind: 'checkin', label: 'Заполнить чек-ин' },
      waterChips: false
    };
  }

  function buildRelapseBreakdown(title, widget) {
    const d = bdLayer();
    const snap = typeof d.getRelapseRiskData === 'function'
      ? d.getRelapseRiskData(widget)
      : {};
    const score = Math.round(Number(snap.score) || 0);
    const drivers = Array.isArray(snap.primaryDrivers) ? snap.primaryDrivers.slice(0, 3) : [];
    return {
      type: 'relapseRisk',
      title,
      heroKicker: 'Уровень',
      heroValue: snap.levelLabel || `${score}%`,
      heroUnit: '',
      insight: snap.recommendation || (drivers[0]?.label ? `Главный фактор — ${drivers[0].label}` : null),
      chartLabel: 'Сегодня',
      chart: { kind: 'riskScale', score, level: snap.level },
      stats: [
        { label: 'Риск', value: `${score}%` },
        { label: 'Дней без риска', value: snap.daysWithoutRisk != null ? String(snap.daysWithoutRisk) : '—' }
      ],
      drivers,
      norm: 'Риск считается по отклонениям дня от ваших норм — шкала в Инсайтах',
      action: { kind: 'insights', label: 'Что делать' },
      waterChips: false
    };
  }

  function buildHealthTrendBreakdown(title, widget) {
    const d = bdLayer();
    const ht = typeof d.getHealthTrendData === 'function'
      ? d.getHealthTrendData({ ...(widget.settings || {}), periodDays: 30 })
      : {};
    const cats = ht.categories || [];
    const top = [...cats].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const low = [...cats].sort((a, b) => (a.score || 0) - (b.score || 0))[0];
    const insight = top && low ? `Тренд тянет вверх ${top.label?.toLowerCase() || 'сон'}, вниз — ${low.label?.toLowerCase() || 'вода'}` : null;
    const daysInPlus = ht.daysWithData && ht.score > 0
      ? Math.min(ht.daysWithData, Math.round(ht.daysWithData * 0.7))
      : 0;
    return {
      type: 'healthTrend',
      title,
      heroKicker: 'За 30 дней',
      heroValue: ht.score > 0 ? `+${bdFormatNum(ht.score)}` : bdFormatNum(ht.score || 0),
      heroUnit: '',
      insight,
      chartLabel: '30 дней',
      chart: { kind: 'spline30', score: ht.score, delta: ht.delta },
      stats: [
        ht.delta != null ? { label: 'Прошлый месяц', value: `${ht.delta > 0 ? '+' : ''}${bdFormatNum(ht.delta)}` } : null,
        { label: 'Дней в плюсе', value: `${daysInPlus} из 30` },
        { label: 'Дней с данными', value: `${ht.daysWithData || 0} из 30` }
      ].filter(Boolean),
      contributions: cats.slice(0, 3).map((c) => ({
        label: c.label,
        value: c.score != null ? (c.score >= 0 ? `+${c.score}` : String(c.score)) : '—'
      })),
      norm: 'Тренд — сглаженное среднее по вашим дням, порог в Инсайтах',
      action: { kind: 'insightsTab', label: 'Открыть Инсайты' },
      waterChips: false
    };
  }

  function buildHeatmapBreakdown(title) {
    const d = bdLayer();
    const prof = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const normMin = prof.activityMinutesGoal || prof.activityGoal || 30;
    const cells = bdDaySeries(35).map(({ iso, day }) => {
      const trainMin = (day?.trainings || []).reduce((s, t) => s + (Number(t.duration) || 0), 0);
      const mins = Math.round(Number(day?.householdMin) || 0) + trainMin;
      return { iso, mins, ratio: normMin > 0 ? mins / normMin : 0 };
    });
    const filled = cells.filter((c) => c.mins > 0);
    const avg = filled.length
      ? Math.round(filled.reduce((s, c) => s + c.mins, 0) / filled.length)
      : null;
    const inNorm = cells.filter((c) => c.mins >= normMin).length;
    let streak = 0;
    let best = 0;
    let cur = 0;
    cells.forEach((c) => {
      if (c.mins >= normMin) { cur += 1; best = Math.max(best, cur); }
      else { cur = 0; }
    });
    streak = best;
    const todayMins = cells[cells.length - 1]?.mins || 0;
    return {
      type: 'heatmap',
      title,
      heroKicker: 'Активные минуты',
      heroValue: bdFormatNum(todayMins),
      heroUnit: ' мин',
      insight: streak >= 5 ? `${streak} дней подряд в норме` : null,
      chartLabel: '5 недель',
      chart: { kind: 'grid7x5', cells, gapFlags: bdHeatmapGapFlags(cells), normMin },
      stats: [
        avg != null ? { label: 'Средние минуты', value: `${bdFormatNum(avg)}` } : null,
        { label: 'Дней в норме', value: `${inNorm} из 35` },
        { label: 'Самая длинная серия', value: `${streak} дней` }
      ].filter(Boolean),
      norm: `Норма ${bdFormatNum(normMin)} минут в день — из вашего профиля`,
      action: { kind: 'addActivity', label: 'Добавить активность' },
      waterChips: false
    };
  }

  function buildCrashRiskBreakdown(title, widget) {
    const dyn = HEYS.Widgets.WeightDynamicsV4?.compute?.() || {};
    const monthRate = dyn.monthRateKg;
    const weeklyBars = (dyn.weeklyBars || []).slice(-4);
    return {
      type: 'crashRisk',
      title,
      heroKicker: 'За месяц',
      heroValue: dyn.delta || (monthRate != null ? `${monthRate > 0 ? '+' : ''}${bdFormatNum(monthRate, 1)}` : '—'),
      heroUnit: ' кг',
      insight: dyn.placeholder || null,
      chartLabel: '90 дней',
      chart: { kind: 'weightCurve', spark: (dyn.windowSeries || []).map((p) => ({ weight: p.smoothed, date: p.date })) },
      stats: weeklyBars.map((b, i) => ({
        label: `Неделя ${i + 1}`,
        value: b.label || b.delta || '—',
        tone: i === weeklyBars.length - 1 ? 'good' : null
      })),
      norm: dyn.remainderLabel || 'Здоровый темп — до 1 % веса в неделю',
      action: { kind: 'recordWeight', label: 'Записать вес' },
      waterChips: false
    };
  }

  function buildBreakdownModel(widget) {
    const type = resolveBreakdownType(widget);
    if (!type) return null;
    const title = WIDGET_TYPE_LABELS[type] || widget.type;
    if (BREAKDOWN_STUB_TYPES.has(type)) return buildStubBreakdown(type, title, widget);
    switch (type) {
      case 'calories': return buildCaloriesBreakdown(title, widget);
      case 'water': return buildWaterBreakdown(title);
      case 'weight': return buildWeightBreakdown(title);
      case 'sleep': return buildSleepBreakdown(title);
      case 'steps': return buildStepsBreakdown(title);
      case 'insulinWave': return buildInsulinWaveBreakdown(title, widget);
      case 'macros': return buildMacrosBreakdown(title);
      case 'dayScore': return buildDayScoreBreakdown(title);
      case 'relapseRisk': return buildRelapseBreakdown(title, widget);
      case 'healthTrend': return buildHealthTrendBreakdown(title, widget);
      case 'heatmap': return buildHeatmapBreakdown(title);
      case 'crashRisk': return buildCrashRiskBreakdown(title, widget);
      default: return null;
    }
  }

  function WidgetBreakdownChart({ chart }) {
    if (!chart) return null;
    if (chart.kind === 'bars7' || chart.kind === 'bars7hours' || chart.kind === 'bars7score') {
      const rows = chart.series || [];
      const max = Math.max(...rows.map((r) => r.kcal ?? r.hours ?? r.score ?? 0), chart.targetLine || 1, 1);
      return React.createElement('div', { className: 'widget-bd-sheet__bars' },
        rows.map((row, i) => {
          const val = row.kcal ?? row.hours ?? (row.score != null ? row.score / 10 : 0);
          const h = Math.max(4, Math.round((val / max) * 100));
          return React.createElement('span', {
            key: i,
            className: 'widget-bd-sheet__bar' + (row.isToday ? ' is-today' : '')
          }, React.createElement('i', { style: { height: `${h}%` } }));
        }),
        chart.targetLine ? React.createElement('span', { className: 'widget-bd-sheet__bar-target' }) : null
      );
    }
    if (chart.kind === 'bins') {
      const bins = chart.bins || [];
      const max = Math.max(...bins, 1);
      return React.createElement('div', { className: 'widget-bd-sheet__bars widget-bd-sheet__bars--bins' },
        bins.map((v, i) => React.createElement('span', {
          key: i,
          className: 'widget-bd-sheet__bar'
        }, React.createElement('i', { style: { height: `${Math.max(8, (v / max) * 100)}%` } })))
      );
    }
    if (chart.kind === 'grid3x7') {
      const labels = ['Б', 'Ж', 'У'];
      const keys = ['proteinOk', 'fatOk', 'carbsOk'];
      return React.createElement('div', { className: 'widget-bd-sheet__grid3x7' },
        keys.map((key, ri) => React.createElement('div', { key: key, className: 'widget-bd-sheet__grid-row' },
          React.createElement('span', { className: 'widget-bd-sheet__grid-label' }, labels[ri]),
          (chart.series || []).map((cell, ci) => React.createElement('span', {
            key: ci,
            className: 'widget-bd-sheet__grid-cell' + (cell[key] ? ' is-ok' : '')
          }))
        ))
      );
    }
    if (chart.kind === 'grid7x5') {
      const cells = chart.cells || [];
      const gapFlags = chart.gapFlags || [];
      return React.createElement('div', { className: 'widget-bd-sheet__grid7x5' },
        cells.map((c, i) => React.createElement('span', {
          key: i,
          className: 'widget-bd-sheet__heat-cell'
            + (c.ratio >= 1 ? ' is-ok' : c.ratio >= 0.5 ? ' is-mid' : '')
            + (gapFlags[i] ? ' is-gap' : '')
        }))
      );
    }
    if (chart.kind === 'sleepStrip') {
      const rows = chart.series || [];
      const axisStart = 21 * 60;
      const axisEnd = 9 * 60 + 24 * 60;
      const span = axisEnd - axisStart;
      return React.createElement('div', { className: 'widget-bd-sheet__sleep-strip' },
        chart.avgBedMin != null
          ? React.createElement('span', {
            className: 'widget-bd-sheet__sleep-avg',
            style: { top: `${Math.max(0, Math.min(100, ((chart.avgBedMin - axisStart) / span) * 100))}%` }
          })
          : null,
        rows.map((row, i) => {
          if (!Number.isFinite(row.start) || !Number.isFinite(row.end)) {
            return React.createElement('span', { key: i, className: 'widget-bd-sheet__sleep-row is-empty' });
          }
          let s = row.start;
          let e = row.end;
          if (s < axisStart) s += 1440;
          if (e < s) e += 1440;
          const top = Math.max(0, Math.min(100, ((s - axisStart) / span) * 100));
          const h = Math.max(8, Math.min(100 - top, ((e - s) / span) * 100));
          return React.createElement('span', {
            key: i,
            className: 'widget-bd-sheet__sleep-row' + (row.isToday ? ' is-today' : '')
          }, React.createElement('i', { style: { top: `${top}%`, height: `${h}%` } }));
        })
      );
    }
    if (chart.kind === 'weightCurve' || chart.kind === 'spline30') {
      const spark = chart.spark || [];
      const pts = spark.map((p) => Number(p.weight ?? p.smoothed)).filter(Number.isFinite);
      const path = bdSplinePath(pts.length ? pts : [0], 300, 72, 6);
      return React.createElement('svg', {
        className: 'widget-bd-sheet__spline',
        viewBox: '0 0 300 72',
        preserveAspectRatio: 'none'
      },
      React.createElement('path', { d: path, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
    }
    if (chart.kind === 'waveDay') {
      const v4 = chart.v4 || chart.wave?.v4;
      const bar = v4?.dayBar;
      const segments = Array.isArray(bar) ? bar : (bar?.segments || []);
      if (!segments.length) {
        return React.createElement('div', { className: 'widget-bd-sheet__wave-placeholder v4-place-holder', 'aria-hidden': 'true' });
      }
      const totalFlex = segments.reduce((s, seg) => s + (seg.flex || 1), 0) || 1;
      return React.createElement('div', { className: 'widget-bd-sheet__wave-day' },
        segments.map((seg, i) => React.createElement('span', {
          key: i,
          className: 'widget-bd-sheet__wave-seg' + (seg.elevated ? ' is-active' : ''),
          style: { flex: `${seg.flex || 1} 1 0`, width: `${((seg.flex || 1) / totalFlex) * 100}%` }
        }))
      );
    }
    if (chart.kind === 'riskScale') {
      const pct = Math.min(100, Math.max(0, chart.score || 0));
      return React.createElement('div', { className: 'widget-bd-sheet__risk-track' },
        React.createElement('span', { className: 'widget-bd-sheet__risk-fill', style: { width: `${pct}%` } })
      );
    }
    return null;
  }

  function WidgetBreakdownSheet({ open, closing, model, onClose, onAction, onWaterChip }) {
    const portalRoot = typeof document !== 'undefined' ? document.body : null;
    if (!open && !closing) return null;
    if (!portalRoot || !ReactDOM?.createPortal) return null;
    if (!model) return null;

    const sheet = React.createElement(React.Fragment, null,
      React.createElement('button', {
        type: 'button',
        className: 'widget-bd-sheet__scrim',
        'aria-label': 'Закрыть разбор',
        onClick: onClose
      }),
      React.createElement('div', {
        className: 'widget-bd-sheet' + (closing ? ' is-closing' : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': model.title
      },
        React.createElement('span', { className: 'widget-bd-sheet__grab' }),
        React.createElement('div', { className: 'widget-bd-sheet__head' },
          React.createElement('span', { className: 'widget-bd-sheet__title' }, model.title),
          React.createElement('button', {
            type: 'button',
            className: 'widget-bd-sheet__close',
            'aria-label': 'Закрыть',
            onClick: onClose
          }, React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round' },
            React.createElement('path', { d: 'M18 6L6 18M6 6l12 12' })))
        ),
        model.stubOnly
          ? React.createElement('p', { className: 'widget-bd-sheet__stub' }, 'за сегодня')
          : null,
        React.createElement('div', { className: 'widget-bd-sheet__kicker' }, model.heroKicker),
        React.createElement('div', { className: 'widget-bd-sheet__hero' },
          React.createElement('span', { className: 'widget-bd-sheet__hero-val' }, model.heroValue),
          model.heroUnit ? React.createElement('span', { className: 'widget-bd-sheet__hero-unit' }, model.heroUnit) : null
        ),
        model.heroTracks?.length ? React.createElement('div', { className: 'widget-bd-sheet__hero-tracks' },
          model.heroTracks.map((tr) => React.createElement('div', { key: tr.label, className: 'widget-bd-sheet__hero-track' },
            React.createElement('span', { className: 'widget-bd-sheet__hero-track-label' }, tr.label),
            React.createElement('span', { className: 'widget-bd-sheet__hero-track-val' }, `${tr.value} / ${tr.norm} ${tr.unit}`)
          ))
        ) : null,
        model.insight ? React.createElement('p', { className: 'widget-bd-sheet__insight' }, model.insight) : null,
        model.chartLabel ? React.createElement('div', { className: 'widget-bd-sheet__chart-label' }, model.chartLabel) : null,
        React.createElement(WidgetBreakdownChart, { chart: model.chart }),
        model.factorBars?.length ? React.createElement('div', { className: 'widget-bd-sheet__factors' },
          model.factorBars.map((f) => React.createElement('div', { key: f.key, className: 'widget-bd-sheet__factor-row' },
            React.createElement('span', null, f.label),
            React.createElement('span', { className: 'widget-bd-sheet__factor-bar' },
              React.createElement('i', { style: { width: `${f.score}%` } })),
            React.createElement('span', null, `${f.score}%`)
          ))
        ) : null,
        model.stats?.length ? React.createElement('div', { className: 'widget-bd-sheet__stats' },
          model.stats.map((row, i) => React.createElement('div', {
            key: i,
            className: 'widget-bd-sheet__stat-row' + (row.tone === 'bad' ? ' is-bad' : row.tone === 'good' ? ' is-good' : '')
          },
            React.createElement('span', { className: 'widget-bd-sheet__stat-label' }, row.label),
            React.createElement('span', { className: 'widget-bd-sheet__stat-value' }, row.value)
          ))
        ) : null,
        model.contributions?.length ? React.createElement('div', { className: 'widget-bd-sheet__stats widget-bd-sheet__stats--contrib' },
          model.contributions.map((row, i) => React.createElement('div', { key: i, className: 'widget-bd-sheet__stat-row' },
            React.createElement('span', { className: 'widget-bd-sheet__stat-label' }, row.label),
            React.createElement('span', { className: 'widget-bd-sheet__stat-value' }, row.value)
          ))
        ) : null,
        model.drivers?.length ? React.createElement('div', { className: 'widget-bd-sheet__drivers' },
          model.drivers.map((dr, i) => React.createElement('div', { key: i, className: 'widget-bd-sheet__driver' }, dr.label || dr.text))
        ) : null,
        model.norm ? React.createElement('p', { className: 'widget-bd-sheet__norm' }, model.norm) : null,
        model.waterChips
          ? React.createElement('div', { className: 'widget-bd-sheet__chips', role: 'group', 'aria-label': 'Объём воды' },
            [200, 300, 500].map((ml) => React.createElement('button', {
              key: ml,
              type: 'button',
              className: 'widget-bd-sheet__chip',
              onClick: () => onWaterChip?.(ml)
            }, `${ml} мл`)))
          : React.createElement('button', {
            type: 'button',
            className: 'widget-bd-sheet__action',
            onClick: () => onAction?.(model.action)
          }, model.action?.label || 'Готово')
      )
    );
    return ReactDOM.createPortal(sheet, portalRoot);
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
    WIDGET_TILE_BG,
    BREAKDOWN_BATCH1,
    BREAKDOWN_STUB_TYPES,
    BREAKDOWN_ALL_TYPES,
    resolveBreakdownType,
    opensBreakdown,
    buildBreakdownModel,
    WidgetBreakdownSheet
  };

  // Совместимость с динамикой веса
  HEYS.Widgets.weightDynamicsClickGuard = clickGuard;
  applyCatalogToRegistry();
})(typeof window !== 'undefined' ? window : globalThis);
