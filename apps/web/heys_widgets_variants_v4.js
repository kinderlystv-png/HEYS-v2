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

  function localDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatWidgetDate(d, date) {
    return typeof d._formatDate === 'function' ? d._formatDate(date) : localDateISO(date);
  }

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

      // Строка «аппаратная кнопка назад · правило продукта»: кнопка и жест
      // назад закрывают верхний слой, а не выходят из приложения. Лист смены
      // вида в историю не писался вовсе — на Android «назад» сворачивал
      // приложение вместо листа. Приём тот же, что у быстрых действий Главной.
      useEffect(() => {
        if (!open) return undefined;
        return window.HEYS?.ModalDismiss?.pushHistoryLayer?.(
          'heysWidgetVariantSheet',
          () => { if (typeof onClose === 'function') onClose(); },
        );
      }, [open, onClose]);
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
      const iso = formatWidgetDate(d, dt);
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

  function bdSplinePathRange(points, width, height, padY, min, max) {
    if (!points.length) return '';
    const span = Math.max(0.1, max - min);
    const xs = points.map((_, i) => (i / Math.max(1, points.length - 1)) * width);
    const ys = points.map((v) => height - padY - ((v - min) / span) * (height - padY * 2));
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

  function bdMealKcal(meal) {
    const items = Array.isArray(meal?.items) ? meal.items : [];
    return Math.round(items.reduce((sum, item) => {
      return sum + (Number(item?.kcal100) || 0) * ((Number(item?.grams) || 0) / 100);
    }, 0));
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
      const iso = formatWidgetDate(d, dt);
      const day = typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null;
      if (!day?.meals?.length) continue;
      let cum = 0;
      day.meals.forEach((meal) => {
        const min = bdParseMealMinutes(meal?.time);
        if (min == null || min > nowMin) return;
        cum += bdMealKcal(meal);
      });
      if (cum > 0) cumByDay.push(Math.round(cum));
    }
    return bdMedian(cumByDay);
  }

  /** Медиана калорий ужина (17:00–22:00) из истории приёмов за 30 дней. */
  function bdTypicalDinnerKcal() {
    const d = bdLayer();
    const now = new Date();
    const dinnerStart = 17 * 60;
    const dinnerEnd = 22 * 60;
    const byDay = [];
    for (let i = 1; i <= 30; i += 1) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - i);
      const iso = formatWidgetDate(d, dt);
      const day = typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null;
      if (!day?.meals?.length) continue;
      let dinnerKcal = 0;
      day.meals.forEach((meal) => {
        const min = bdParseMealMinutes(meal?.time);
        if (min == null || min < dinnerStart || min >= dinnerEnd) return;
        dinnerKcal += bdMealKcal(meal);
      });
      if (dinnerKcal > 0) byDay.push(dinnerKcal);
    }
    return bdMedian(byDay);
  }

  function bdSleepWindowStrip(daysBack) {
    const d = bdLayer();
    const rows = [];
    const today = new Date();
    for (let i = daysBack - 1; i >= 0; i -= 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const iso = formatWidgetDate(d, dt);
      const day = i === 0 && typeof d._getDay === 'function'
        ? d._getDay()
        : (typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null);
      const start = bdParseMealMinutes(day?.sleepStart);
      const end = bdParseMealMinutes(day?.sleepEnd);
      rows.push({ iso, start, end, isToday: i === 0 });
    }
    return rows;
  }

  const BD_SLEEP_AXIS_START = 21 * 60;
  const BD_SLEEP_AXIS_SPAN = 12 * 60;

  function bdNormalizeSleepMinute(min, axisStart = BD_SLEEP_AXIS_START) {
    if (!Number.isFinite(min)) return null;
    let normalized = min;
    if (normalized < axisStart) normalized += 1440;
    return normalized;
  }

  function bdSleepBarPosition(startMin, endMin, axisStart = BD_SLEEP_AXIS_START, span = BD_SLEEP_AXIS_SPAN) {
    let s = bdNormalizeSleepMinute(startMin, axisStart);
    let e = bdNormalizeSleepMinute(endMin, axisStart);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    if (e < s) e += 1440;
    const left = ((s - axisStart) / span) * 100;
    const width = ((e - s) / span) * 100;
    return {
      left: Math.max(0, Math.min(100, left)),
      width: Math.max(2, Math.min(100 - Math.max(0, left), width))
    };
  }

  function bdSleepDurationHours(startMin, endMin) {
    let s = bdNormalizeSleepMinute(startMin);
    let e = bdNormalizeSleepMinute(endMin);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    if (e < s) e += 1440;
    return (e - s) / 60;
  }

  function bdMinutesToClockLabel(totalMinutes) {
    if (!Number.isFinite(totalMinutes)) return null;
    const clock = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(clock / 60);
    const m = clock % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function bdAvgBedtimeLabel(strip) {
    const starts = (strip || [])
      .map((r) => bdNormalizeSleepMinute(r.start))
      .filter(Number.isFinite);
    if (!starts.length) return null;
    const avg = Math.round(starts.reduce((a, b) => a + b, 0) / starts.length);
    return bdMinutesToClockLabel(avg);
  }

  function bdBedtimeSpreadHours(strip) {
    const starts = (strip || [])
      .map((r) => bdNormalizeSleepMinute(r.start))
      .filter(Number.isFinite);
    if (starts.length < 2) return null;
    const min = Math.min(...starts);
    const max = Math.max(...starts);
    return Math.round(((max - min) / 60) * 10) / 10;
  }

  function bdFormatSleepSpreadLabel(hours) {
    if (!Number.isFinite(hours)) return null;
    const rounded = Math.round(hours * 10) / 10;
    if (rounded === 1.5) return 'полтора часа';
    if (rounded === 1) return 'час';
    if (rounded === 0.5) return 'полчаса';
    if (Number.isInteger(rounded) && rounded >= 2 && rounded <= 4) {
      return `${rounded} часа`;
    }
    return `${bdFormatNum(rounded, rounded % 1 ? 1 : 0)} ч`;
  }

  function bdFormatGoalDate(weeksToGoal) {
    if (!Number.isFinite(weeksToGoal) || weeksToGoal <= 0) return null;
    const dt = new Date();
    dt.setDate(dt.getDate() + weeksToGoal * 7);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const mid = Math.ceil(dt.getDate() / 2);
    return `середине ${months[dt.getMonth()]}`;
  }

  function bdFormatGoalMonthDeadline(weeksToGoal) {
    if (!Number.isFinite(weeksToGoal) || weeksToGoal <= 0) return null;
    const dt = new Date();
    dt.setDate(dt.getDate() + weeksToGoal * 7);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return months[dt.getMonth()];
  }

  function bdWeightSmoothedFromSpark(sparkline) {
    return (sparkline || []).map((row, index, arr) => {
      const slice = arr.slice(Math.max(0, index - 6), index + 1)
        .filter((r) => r.weight != null && !r.excluded);
      const smoothed = slice.length
        ? slice.reduce((sum, r) => sum + r.weight, 0) / slice.length
        : null;
      return {
        date: row.date,
        weight: row.weight,
        hasWeight: row.weight != null && !row.excluded,
        smoothed
      };
    });
  }

  function bdWeightBreakdown30Series() {
    const d = bdLayer();
    const prof = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const dyn = HEYS.Widgets.WeightDynamicsV4?.compute?.({ profile: prof }) || {};
    let series = Array.isArray(dyn.windowSeries) ? dyn.windowSeries.slice(-30) : [];
    if (series.length < 30 && typeof d._calculateWeightTrendExtended === 'function') {
      const ext = d._calculateWeightTrendExtended(30);
      series = bdWeightSmoothedFromSpark(ext?.sparkline || []).slice(-30);
    }
    if (series.length < 30) {
      series = bdWeightBreakdownSeries(30);
    }
    return { series, dyn, prof };
  }

  function bdWeightFromDay(dayData) {
    if (!dayData) return null;
    if (dayData.weightMorningEstimated === true) return null;
    if (dayData.weightMorningSource === 'estimated_avg' || dayData.weightMorningSource === 'estimated_profile') {
      return null;
    }
    const w = Number(dayData.weightMorning);
    return Number.isFinite(w) && w > 0 ? w : null;
  }

  function bdWeightBreakdownSeries(daysBack = 90) {
    const rows = bdDaySeries(daysBack).map(({ iso, day }) => {
      const weight = bdWeightFromDay(day);
      return { date: iso, weight, hasWeight: weight != null };
    });
    return bdWeightSmoothedFromSpark(rows.map((r) => ({
      date: r.date,
      weight: r.weight,
      excluded: !r.hasWeight
    }))).map((r, i) => ({
      date: rows[i].date,
      weight: rows[i].weight,
      hasWeight: rows[i].hasWeight,
      smoothed: r.smoothed
    }));
  }

  function bdWeightPlateauBands(series, minDays = 10, deadZone = 0.2) {
    const bands = [];
    let start = null;
    const flush = (endIdx) => {
      if (start == null) return;
      if (endIdx - start + 1 >= minDays) bands.push({ start, end: endIdx });
      start = null;
    };
    for (let i = 0; i < series.length; i += 1) {
      const s = series[i]?.smoothed;
      if (!Number.isFinite(s)) {
        flush(i - 1);
        continue;
      }
      if (start == null) {
        start = i;
        continue;
      }
      const slice = series.slice(start, i + 1).map((r) => r.smoothed).filter(Number.isFinite);
      const span = Math.max(...slice) - Math.min(...slice);
      if (span > deadZone) {
        flush(i - 1);
        start = i;
      }
    }
    if (start != null) flush(series.length - 1);
    return bands;
  }

  function bdFormatShortRuDate(iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]}`;
  }

  function bdWeightPlateauInsight(bands, series) {
    if (!bands.length) return null;
    const last = bands[bands.length - 1];
    const days = last.end - last.start + 1;
    const weeks = Math.max(1, Math.round(days / 7));
    const startLabel = bdFormatShortRuDate(series[last.start]?.date);
    const weekPhrase = weeks === 1
      ? 'Одну неделю'
      : weeks === 2
        ? 'Две недели'
        : weeks === 3
          ? 'Три недели'
          : `${weeks} недель`;
    if (startLabel) return `${weekPhrase} плато — вес стоит с ${startLabel}`;
    return `${weekPhrase} плато — вес почти не менялся`;
  }

  function bdWeightWeeklyDeltaStats(series, weekCount = 4) {
    const tail = (series || []).slice(-weekCount * 7);
    const rows = [];
    for (let w = 0; w < weekCount; w += 1) {
      const chunk = tail.slice(w * 7, (w + 1) * 7).filter((d) => Number.isFinite(d.smoothed));
      let value = '—';
      if (chunk.length >= 2) {
        const delta = chunk[chunk.length - 1].smoothed - chunk[0].smoothed;
        if (Math.abs(delta) <= 0.05) {
          value = '0,0 кг';
        } else if (delta > 0) {
          value = `+${bdFormatNum(delta, 1)} кг`;
        } else {
          value = `−${bdFormatNum(Math.abs(delta), 1)} кг`;
        }
      }
      rows.push({
        label: `Неделя ${w + 1}`,
        value,
        tone: w === weekCount - 1 ? 'good' : null
      });
    }
    return rows;
  }

  function bdWeightHealthyTempoNorm(profile) {
    const ref = Number(profile?.weight || profile?.weightGoal);
    const pctKg = Number.isFinite(ref) ? Math.round(ref * 0.01 * 10) / 10 : null;
    const pctLabel = pctKg != null ? bdFormatNum(pctKg, 1) : '1';
    return `Здоровый темп — до 1 % веса в неделю, у вас это ${pctLabel} кг`;
  }

  function bdWeightDelta30Kg(series) {
    const smoothed = (series || []).map((r) => r.smoothed).filter(Number.isFinite);
    if (smoothed.length >= 2) {
      return smoothed[smoothed.length - 1] - smoothed[0];
    }
    const raw = (series || []).filter((r) => r.hasWeight && Number.isFinite(r.weight)).map((r) => r.weight);
    if (raw.length < 2) return null;
    return raw[raw.length - 1] - raw[0];
  }

  function bdWeightDaySpreadKg(series) {
    const diffs = (series || [])
      .filter((r) => r.hasWeight && Number.isFinite(r.weight) && Number.isFinite(r.smoothed))
      .map((r) => Math.abs(r.weight - r.smoothed));
    if (!diffs.length) return null;
    diffs.sort((a, b) => a - b);
    const mid = Math.floor(diffs.length / 2);
    const med = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
    return Math.round(med * 10) / 10;
  }

  function bdWeightWeeksToGoal(current, goal, tempoWeekKg) {
    if (!Number.isFinite(current) || !Number.isFinite(goal) || !Number.isFinite(tempoWeekKg)) return null;
    if (Math.abs(tempoWeekKg) < 0.01) return null;
    const diff = current - goal;
    if ((diff > 0 && tempoWeekKg >= 0) || (diff < 0 && tempoWeekKg <= 0)) return null;
    return Math.abs(diff / tempoWeekKg);
  }

  function bdWeightChartGeometry(series, width = 300, height = 72, padY = 6) {
    const rows = series || [];
    if (!rows.length) return { trendPath: '', dots: [] };
    const trendVals = rows.map((r) => r.smoothed).filter(Number.isFinite);
    const measureVals = rows
      .filter((r) => r.hasWeight && Number.isFinite(r.weight))
      .map((r) => r.weight);
    const all = [...trendVals, ...measureVals];
    if (!all.length) return { trendPath: '', dots: [] };
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = Math.max(0.1, max - min);
    const xAt = (i) => (i / Math.max(1, rows.length - 1)) * width;
    const yAt = (v) => height - padY - ((v - min) / span) * (height - padY * 2);
    const trendPoints = rows.map((r) => (Number.isFinite(r.smoothed) ? r.smoothed : min));
    const trendPath = bdSplinePathRange(trendPoints, width, height, padY, min, max);
    const dots = rows.map((r, i) => {
      if (!r.hasWeight || !Number.isFinite(r.weight)) return null;
      return { cx: xAt(i), cy: yAt(r.weight) };
    }).filter(Boolean);
    return { trendPath, dots };
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

  const BD_DAY_SCORE_FACTOR_KEYS = ['food', 'water', 'sleep', 'activity', 'relapse'];
  const BD_HT_CONTRIB_LABELS = {
    recovery: 'Сон',
    activity: 'Активность',
    nutrition: 'Питание',
    timing: 'Тайминг',
    metabolism: 'Метаболизм',
    water: 'Вода'
  };
  const BD_HT_INSIGHT_NAMES = {
    recovery: 'сон',
    activity: 'активность',
    nutrition: 'питание',
    timing: 'tайминг',
    metabolism: 'метаболизм',
    water: 'вода'
  };
  const BD_HT_WEEK_ORDINALS = ['первая', 'вторая', 'третья', 'четвёртая'];
  const BD_DAY_SCORE_FACTOR_LABELS = {
    food: 'Еда',
    water: 'Вода',
    sleep: 'Сон',
    activity: 'Активность',
    relapse: 'Срыв'
  };

  function bdMorningCheckinDone() {
    const status = HEYS.MorningCheckinUtils?.getMorningCheckinStatus?.()
      || HEYS.MorningCheckinDebug?.getStatus?.();
    if (!status) return false;
    if (status.sessionDone === true) return true;
    return status.state === 'complete' || status.state === 'done';
  }

  function bdDayScoreMonthStats() {
    const d = bdLayer();
    const emptyWeak = Object.fromEntries(BD_DAY_SCORE_FACTOR_KEYS.map((k) => [k, 0]));
    if (!HEYS.DayScore?.calculateDayScore) {
      return { avg: null, belowSix: 0, bestWd: null, weakCounts: emptyWeak, scoredDays: 0 };
    }
    const profile = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const normAbs = typeof d._getNormAbs === 'function' ? d._getNormAbs() : {};
    const waterGoal = typeof d._getWaterGoal === 'function' ? d._getWaterGoal() : 2000;
    const weekdayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const scores = [];
    const byWd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
    const weakCounts = { ...emptyWeak };
    const today = new Date();
    for (let i = 0; i < 30; i += 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const iso = formatWidgetDate(d, dt);
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
          const cats = result?.statusResult?.categoryScores || {};
          let weakKey = BD_DAY_SCORE_FACTOR_KEYS[0];
          let weakVal = Number(cats[weakKey]) || 0;
          BD_DAY_SCORE_FACTOR_KEYS.forEach((key) => {
            const val = Number(cats[key]) || 0;
            if (val < weakVal) {
              weakVal = val;
              weakKey = key;
            }
          });
          weakCounts[weakKey] += 1;
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
    return { avg, belowSix, bestWd, total: scores.length, scoredDays: scores.length, weakCounts };
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

  function bdHeatmapWeeksWithoutLongGap(cells, weekCount = 5, weekDays = 7) {
    let streakWeeks = 0;
    for (let w = 0; w < weekCount; w += 1) {
      const slice = cells.slice(w * weekDays, (w + 1) * weekDays);
      if (!slice.length) break;
      let run = 0;
      let hasLongGap = false;
      slice.forEach((c) => {
        if ((c.mins || 0) <= 0) {
          run += 1;
          if (run >= 2) hasLongGap = true;
        } else {
          run = 0;
        }
      });
      if (hasLongGap) break;
      streakWeeks += 1;
    }
    return streakWeeks;
  }

  function bdHeatmapBreakdownInsight(cells) {
    const weeks = bdHeatmapWeeksWithoutLongGap(cells);
    if (weeks >= 5) return 'Пять недель подряд без пропусков дольше двух дней';
    if (weeks >= 2) {
      const word = weeks === 2 || weeks === 3 || weeks === 4 ? 'недели' : 'недель';
      return `${weeks} ${word} подряд без пропусков дольше двух дней`;
    }
    return null;
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
    const typicalDinner = bdTypicalDinnerKcal();
    const dinnerLeft = typicalDinner ?? today.dinnerBudgetKcal ?? Math.round(target * 0.28);
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
    const profile = typeof d.getWaterBreakdownProfile === 'function' ? d.getWaterBreakdownProfile() : null;
    const target = water.target || 2000;
    const targetLiters = bdFormatNum(Math.round(target / 100) / 10, 1);
    const drunkLiters = bdFormatNum(Math.round((water.drunk || 0) / 100) / 10, 1);
    const insight = profile?.typicalNormLabel
      ? `Норму вы обычно набираете к ${profile.typicalNormLabel}`
      : null;
    const gapStartIdx = profile?.gapFromHour != null && profile?.chartStartHour != null
      ? profile.gapFromHour - profile.chartStartHour
      : null;
    const gapEndIdx = profile?.gapToHour != null && profile?.chartStartHour != null
      ? profile.gapToHour - profile.chartStartHour + 1
      : null;
    const chipMl = (typeof global.HEYS?.dayWater?.getFrequentVolumes === 'function')
      ? global.HEYS.dayWater.getFrequentVolumes().filter((ml) => ml > 0).slice(0, 2)
      : [200, 500];
    const stats = [];
    if (profile?.gapLabel) {
      stats.push({ label: 'Провал', value: profile.gapLabel, tone: 'bad' });
    }
    stats.push({
      label: 'Норма набрана',
      value: `${profile?.weekNormHits ?? 0} дня из 7`
    });
    if (profile?.topVolumeMl) {
      stats.push({ label: 'Частый объём', value: `${bdFormatNum(profile.topVolumeMl)} мл` });
    }
    return {
      type: 'water',
      title,
      heroKicker: 'Выпито за день',
      heroValue: drunkLiters,
      heroUnit: `из ${targetLiters} л`,
      insight,
      chartLabel: null,
      chart: profile ? {
        kind: 'waterHourProfile',
        monthAvg: profile.monthAvg,
        todayCurve: profile.todayCumulative,
        gapStartIdx,
        gapEndIdx,
        axisTicks: profile.axisTicks
      } : null,
      stats,
      norm: `Норма ${targetLiters} л — 30 мл на килограмм плюс поправка на активность`,
      action: { kind: 'waterChips', label: 'Добавить воду' },
      waterChips: true,
      waterChipMl: chipMl.length ? chipMl : [200, 500]
    };
  }

  function buildWeightBreakdown(title) {
    const d = bdLayer();
    const w = typeof d.getWeightData === 'function' ? d.getWeightData() : {};
    const { series, prof } = bdWeightBreakdown30Series();
    const goal = w.goal || prof.weightGoal;
    const current = w.current ?? prof.weight ?? null;
    const delta30 = bdWeightDelta30Kg(series);
    const tempoWeek = delta30 != null ? (delta30 / 30) * 7 : null;
    const weeksToGoal = bdWeightWeeksToGoal(current, goal, tempoWeek);
    const goalWhen = weeksToGoal ? bdFormatGoalDate(weeksToGoal) : null;
    const goalMonth = weeksToGoal ? bdFormatGoalMonthDeadline(weeksToGoal) : null;
    const daySpread = bdWeightDaySpreadKg(series);
    const weighCount = series.filter((row) => row.hasWeight).length;
    let insight = null;
    if (tempoWeek != null && goalWhen) {
      insight = `Темп ${tempoWeek > 0 ? '+' : ''}${bdFormatNum(tempoWeek, 1)} кг в неделю — к цели в ${goalWhen}`;
    } else if (tempoWeek != null && weeksToGoal) {
      insight = `Темп ${tempoWeek > 0 ? '+' : ''}${bdFormatNum(tempoWeek, 1)} кг в неделю — к цели через ${bdFormatNum(weeksToGoal)} нед.`;
    }
    return {
      type: 'weight',
      title,
      heroKicker: 'Утром',
      heroValue: current != null ? bdFormatNum(current, 1) : '—',
      heroUnit: ' кг',
      insight,
      chartLabel: null,
      chart: { kind: 'weightDualCurve', series },
      stats: [
        delta30 != null ? { label: 'За 30 дней', value: `${delta30 > 0 ? '+' : ''}${bdFormatNum(delta30, 1)} кг` } : null,
        { label: 'Замеров', value: `${weighCount} из 30` },
        daySpread != null ? { label: 'Разброс дня', value: `±${bdFormatNum(daySpread, 1)} кг` } : null
      ].filter(Boolean),
      norm: goal
        ? `Цель ${bdFormatNum(goal, 1)} кг — поставлена с куратором${goalMonth ? `, срок до ${goalMonth}` : ''}`
        : 'Цель задаётся с куратором',
      action: { kind: 'recordWeight', label: 'Записать вес' },
      waterChips: false
    };
  }

  function buildSleepBreakdown(title) {
    const d = bdLayer();
    const sleep = typeof d.getSleepData === 'function' ? d.getSleepData() : {};
    const strip = bdSleepWindowStrip(14);
    const durations14 = strip
      .map((row) => bdSleepDurationHours(row.start, row.end))
      .filter((h) => Number.isFinite(h) && h > 0);
    const avgDur14 = durations14.length
      ? durations14.reduce((a, b) => a + b, 0) / durations14.length
      : null;
    const normHits14 = strip.filter((row) => {
      const day = typeof d._getDayByDate === 'function' ? d._getDayByDate(row.iso) : null;
      return (Number(day?.sleepHours) || 0) >= (sleep.target || 8);
    }).length;
    const avgBed = bdAvgBedtimeLabel(strip);
    const bedSpread = bdBedtimeSpreadHours(strip);
    const spreadLabel = bdFormatSleepSpreadLabel(bedSpread);
    const avgBedMin = avgBed ? bdParseMealMinutes(avgBed) : null;
    return {
      type: 'sleep',
      title,
      heroKicker: 'Этой ночью',
      heroValue: sleep.hours ? bdFormatNum(sleep.hours, 1) : '—',
      heroUnit: ' ч',
      insight: avgBed
        ? `Ложитесь в среднем в ${avgBed}${spreadLabel ? `, разброс ${spreadLabel}` : ''}`
        : null,
      chartLabel: null,
      chart: {
        kind: 'sleepStrip',
        series: strip,
        avgBedMin: avgBedMin != null ? bdNormalizeSleepMinute(avgBedMin) : null,
        axisStart: BD_SLEEP_AXIS_START,
        axisSpan: BD_SLEEP_AXIS_SPAN,
        axisTicks: ['21:00', '00:00', '03:00', '06:00', '09:00']
      },
      stats: [
        avgDur14 != null ? { label: 'Средняя длительность', value: `${bdFormatNum(avgDur14, 1)} ч` } : null,
        { label: 'Норму набрали', value: `${normHits14} дня из 14` },
        sleep.weekDebtHours > 0
          ? { label: 'Долг за неделю', value: `${bdFormatNum(sleep.weekDebtHours, 1)} ч`, tone: 'bad' }
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

  function bdFormatDurationMin(totalMin) {
    const total = Math.max(0, Math.round(Number(totalMin) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return `${m} мин`;
    return `${h} ч ${m} мин`;
  }

  function bdInsulinWaveCalculateForDay(day, nowMin) {
    const meals = (day?.meals || []).filter((m) => m.time);
    if (!meals.length || !HEYS.InsulinWave?.calculate) {
      return { v4: null, endTime: null, overlapCount: 0, calmWindowMinutes: null, mealCount: 0 };
    }
    const d = bdLayer();
    const profile = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const pIndex = HEYS.products?.buildIndex?.() || null;
    const getProductFromItem = (item) => {
      if (!pIndex?.byId?.get) return item;
      return pIndex.byId.get(item.product_id || item.productId) || item;
    };
    try {
      const result = HEYS.InsulinWave.calculate({
        meals,
        pIndex,
        getProductFromItem,
        trainings: day?.trainings || [],
        dayData: {
          sleepHours: day?.sleepHours || null,
          sleepQuality: day?.sleepQuality || null,
          stressAvg: day?.stressAvg || 0,
          waterMl: day?.waterMl || 0,
          householdMin: day?.householdMin || 0,
          steps: day?.steps || 0,
          date: day?.date,
          profile: {
            age: profile?.age || 0,
            weight: profile?.weight || 0,
            height: profile?.height || 0,
            gender: profile?.gender || ''
          }
        },
        nowMinutes: nowMin
      });
      if (!result) {
        return { v4: null, endTime: null, overlapCount: 0, calmWindowMinutes: null, mealCount: 0 };
      }
      const v4 = HEYS.Widgets.InsulinWaveV4?.buildV4FromWave?.(result, nowMin) || null;
      return {
        v4,
        endTime: result.endTime || null,
        overlapCount: v4?.overlapCount ?? (result.overlaps?.length || 0),
        calmWindowMinutes: v4?.calmWindowMinutes ?? null,
        mealCount: v4?.mealCount || meals.length
      };
    } catch (_) {
      return { v4: null, endTime: null, overlapCount: 0, calmWindowMinutes: null, mealCount: 0 };
    }
  }

  function bdInsulinWaveWeekStrip(excludeToday) {
    const d = bdLayer();
    const today = new Date();
    const nowMin = today.getHours() * 60 + today.getMinutes();
    const weekdayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const rows = [];
    let overlapSum = 0;
    let calmSum = 0;
    let calmCount = 0;
    const maxOffset = excludeToday ? 7 : 6;
    const minOffset = excludeToday ? 1 : 0;
    for (let i = maxOffset; i >= minOffset; i -= 1) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() - i);
      const iso = formatWidgetDate(d, dt);
      const day = i === 0 && typeof d._getDay === 'function'
        ? d._getDay()
        : (typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null);
      const sliceNow = i === 0 ? nowMin : 1439;
      const calc = bdInsulinWaveCalculateForDay(day, sliceNow);
      if (calc.calmWindowMinutes != null && calc.mealCount > 0) {
        calmSum += calc.calmWindowMinutes;
        calmCount += 1;
      }
      overlapSum += calc.overlapCount || 0;
      rows.push({
        iso,
        isToday: i === 0,
        label: weekdayNames[dt.getDay()],
        segments: calc.v4?.dayBar?.segments || [],
        empty: !(calc.v4?.dayBar?.segments?.length)
      });
    }
    return {
      rows,
      overlapSum,
      avgCalmMinutes: calmCount ? Math.round(calmSum / calmCount) : null
    };
  }

  function buildInsulinWaveBreakdown(title, widget) {
    const d = bdLayer();
    const wave = typeof d.getInsulinWaveData === 'function' ? d.getInsulinWaveData() : {};
    const v4 = wave.v4 || {};
    const isOvernight = wave.isOvernightEstimate || v4.isOvernight;
    const week = bdInsulinWaveWeekStrip(isOvernight);
    const heroMin = isOvernight
      ? (v4.overnightRestMinutes ?? v4.calmWindowMinutes ?? wave.remaining)
      : (v4.calmWindowMinutes ?? v4.freeWindowMinutes ?? wave.remaining);
    const heroKicker = isOvernight ? 'Оценка по вчерашнему дню' : 'Свободное окно';
    const avgCalm = week.avgCalmMinutes ?? v4.calmWindowMinutes;
    const stats = [
      avgCalm != null ? { label: 'Среднее окно', value: bdFormatDurationMin(avgCalm) } : null,
      { label: 'Нахлёстов за неделю', value: bdFormatNum(week.overlapSum) }
    ];
    if (!isOvernight) {
      stats.push({ label: 'Волн сегодня', value: bdFormatNum(wave.waveCount || v4.mealCount || 0) });
    }
    return {
      type: 'insulinWave',
      title,
      heroKicker,
      heroValue: heroMin != null ? bdFormatDurationMin(heroMin) : '—',
      heroUnit: '',
      insight: wave.endTime ? `Последняя волна закрывается в ${wave.endTime}` : null,
      chartLabel: null,
      chart: { kind: 'waveWeekStrip', rows: week.rows },
      stats: stats.filter(Boolean),
      norm: 'Волна считается от углеводов приёма — 3 ч на приём, дольше при нахлёсте',
      action: { kind: 'addMeal', label: 'Добавить приём' },
      waterChips: false
    };
  }

  function bdMacroPct(value, target) {
    const tgt = Number(target) || 0;
    if (tgt <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((Number(value) || 0) / tgt) * 100)));
  }

  function bdMacroDeviationBad(value, target, toneClass) {
    const num = Number(value) || 0;
    const tgt = Number(target) || 0;
    if (tgt <= 0) return false;
    const margin = tgt * 0.05;
    if (toneClass === 'protein') return num < tgt - margin;
    return num > tgt + margin;
  }

  function bdMacroDayTotals(day) {
    const d = bdLayer();
    const tot = typeof d._calculateDayTotals === 'function' ? d._calculateDayTotals(day) : {};
    return {
      protein: Number(tot?.prot ?? tot?.protein) || 0,
      fat: Number(tot?.fat) || 0,
      carbs: Number(tot?.carbs) || 0
    };
  }

  function bdMacrosWeekAvgPct(dayRows, targets) {
    const sums = { protein: 0, fat: 0, carbs: 0, count: 0 };
    (dayRows || []).forEach(({ day }) => {
      if (!day) return;
      const tot = bdMacroDayTotals(day);
      const hasData = tot.protein > 0 || tot.fat > 0 || tot.carbs > 0;
      if (!hasData) return;
      sums.count += 1;
      if (targets.proteinTarget) sums.protein += (tot.protein / targets.proteinTarget) * 100;
      if (targets.fatTarget) sums.fat += (tot.fat / targets.fatTarget) * 100;
      if (targets.carbsTarget) sums.carbs += (tot.carbs / targets.carbsTarget) * 100;
    });
    if (!sums.count) return { protein: 0, fat: 0, carbs: 0 };
    return {
      protein: Math.round(sums.protein / sums.count),
      fat: Math.round(sums.fat / sums.count),
      carbs: Math.round(sums.carbs / sums.count)
    };
  }

  function buildMacrosBreakdown(title) {
    const d = bdLayer();
    const today = typeof d.getMacrosData === 'function' ? d.getMacrosData() : {};
    const dayRows = bdDaySeries(7);
    const series = dayRows.map(({ day, isToday }) => {
      const tot = bdMacroDayTotals(day);
      const p = tot.protein;
      const f = tot.fat;
      const c = tot.carbs;
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
    const avgPct = bdMacrosWeekAvgPct(dayRows, today);
    const mkTrack = (name, value, target, toneClass) => ({
      name,
      label: name.slice(0, 1),
      value: bdFormatNum(value || 0),
      norm: bdFormatNum(target || 0),
      unit: 'г',
      pct: bdMacroPct(value, target),
      tone: bdMacroDeviationBad(value, target, toneClass) ? 'bad' : 'good'
    });
    return {
      type: 'macros',
      title,
      heroKicker: 'Сегодня',
      heroValue: null,
      heroUnit: null,
      heroTracks: [
        mkTrack('Белок', today.protein, today.proteinTarget, 'protein'),
        mkTrack('Жиры', today.fat, today.fatTarget, 'fat'),
        mkTrack('Углеводы', today.carbs, today.carbsTarget, 'carbs')
      ],
      insightBeforeHero: true,
      insight: missProtein ? `Белок недобираете ${missProtein} дня из 7` : null,
      chartLabel: null,
      chart: { kind: 'grid3x7', series },
      stats: [
        {
          label: 'Белок — % нормы в среднем',
          value: `${avgPct.protein} %`,
          tone: avgPct.protein > 0 && avgPct.protein < 90 ? 'bad' : null
        },
        { label: 'Жиры', value: `${avgPct.fat} %` },
        { label: 'Углеводы', value: `${avgPct.carbs} %` }
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
    const month = bdDayScoreMonthStats();
    const weakTotal = 30;
    const factorBars = (ds.factorBars || []).map((f) => ({
      ...f,
      label: BD_DAY_SCORE_FACTOR_LABELS[f.key] || f.label,
      weakDays: month.weakCounts?.[f.key] ?? 0,
      weakTotal
    }));
    const dominant = factorBars.reduce((best, f) => (
      !best || (f.weakDays || 0) > (best.weakDays || 0) ? f : best
    ), null);
    const dominantInsightLabel = dominant?.key === 'water'
      ? 'вода'
      : (dominant?.key === 'food' ? 'еда'
        : (dominant?.key === 'sleep' ? 'сон'
          : (dominant?.key === 'activity' ? 'активность'
            : (dominant?.key === 'relapse' ? 'срыв' : dominant?.label?.toLowerCase()))));
    const maxWeakDays = dominant?.weakDays || 0;
    return {
      type: 'dayScore',
      title,
      heroKicker: 'Сегодня',
      heroValue: bdFormatNum(Math.round(ds.score || 0) / 10, 1),
      heroUnit: ' / 10',
      insight: maxWeakDays > 0 && dominantInsightLabel
        ? `Чаще всего вниз тянет ${dominantInsightLabel}`
        : null,
      chartLabel: '7 дней',
      chart: { kind: 'bars7score', series: week },
      stats: [
        month.avg != null ? { label: 'Средняя за месяц', value: bdFormatNum(month.avg / 10, 1) } : null,
        month.bestWd ? { label: 'Лучший день', value: month.bestWd } : null,
        { label: 'Ниже 6', value: `${month.belowSix} дня из ${weakTotal}` }
      ].filter(Boolean),
      factorBars,
      factorWeakMax: maxWeakDays,
      norm: 'Оценка складывается из пяти частей, вес каждой — в справочнике',
      action: {
        kind: 'checkin',
        label: bdMorningCheckinDone() ? 'Поправить ответы' : 'Заполнить чек-ин'
      },
      waterChips: false
    };
  }

  function bdRelapseCanvasLevelWord(level) {
    if (level === 'critical') return 'Критичный';
    if (level === 'high') return 'Высокий';
    if (level === 'elevated' || level === 'guarded' || level === 'medium') return 'Средний';
    return 'Низкий';
  }

  function bdRelapseFormatHour(hour) {
    const h = Math.max(0, Math.min(23, Math.round(Number(hour) || 0)));
    return `${String(h).padStart(2, '0')}:00`;
  }

  function bdRelapseSimNow(iso, hour) {
    const h = Math.max(0, Math.min(23, Number(hour) || 0));
    return `${iso}T${String(h).padStart(2, '0')}:30:00`;
  }

  function bdRelapseScoreAtHour(ctx) {
    if (!HEYS.RelapseRisk?.calculate) return 0;
    try {
      const result = HEYS.RelapseRisk.calculate(ctx);
      return Math.round(Number(result?.score) || 0);
    } catch (_) {
      return 0;
    }
  }

  function bdRelapseDriverRows(drivers) {
    return (drivers || []).slice(0, 3).map((dr) => {
      const impact = Number(dr?.impact ?? dr?.weightedImpact ?? 0);
      let tone = 'warn';
      if (impact >= 15) tone = 'bad';
      else if (impact < 8) tone = 'good';
      const label = dr?.label || dr?.text || (typeof dr === 'string' ? dr : '');
      return { label, tone };
    }).filter((row) => row.label);
  }

  function bdRelapseMonthProfile() {
    const CHART_START = 6;
    const CHART_HOURS = 14;
    const PROFILE_DAYS = 30;
    const ELEVATED = 40;
    const EVENT = 60;
    const d = bdLayer();
    const profile = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const normAbs = typeof d._getNormAbs === 'function' ? d._getNormAbs() : {};
    const profileKey = typeof d._getRelapseRiskProfileKey === 'function'
      ? d._getRelapseRiskProfileKey()
      : (HEYS.RelapseRisk?.CONFIG?.DEFAULT_PROFILE_KEY || 'v1_2');
    const monthBucketSums = Array(CHART_HOURS).fill(0);
    const todayCurve = Array(CHART_HOURS).fill(0);
    let daysSampled = 0;
    let relapseCount = 0;
    const relapseHours = [];
    let daysWithoutRisk = 0;
    const anchor = new Date();

    for (let offset = 0; offset < PROFILE_DAYS; offset += 1) {
      const dt = new Date(anchor);
      dt.setDate(dt.getDate() - offset);
      const iso = formatWidgetDate(d, dt);
      const dayData = offset === 0
        ? (typeof d._getDay === 'function' ? d._getDay() : null)
        : (typeof d._getDayByDate === 'function' ? d._getDayByDate(iso) : null);
      if (!dayData) continue;

      const dayTot = typeof d._getDayTotalsFor === 'function'
        ? d._getDayTotalsFor(dayData)
        : (typeof d._calculateDayTotals === 'function' ? d._calculateDayTotals(dayData) : {});
      const historyDays = [];
      for (let back = 1; back <= 14; back += 1) {
        const histDt = new Date(dt);
        histDt.setDate(histDt.getDate() - back);
        const histIso = formatWidgetDate(d, histDt);
        const histDay = typeof d._getDayByDate === 'function' ? d._getDayByDate(histIso) : null;
        if (histDay) historyDays.push(histDay);
      }

      let dayMax = 0;
      let peakHour = null;
      for (let i = 0; i < CHART_HOURS; i += 1) {
        const hour = CHART_START + i;
        const score = bdRelapseScoreAtHour({
          dayData,
          dayTot,
          profile,
          normAbs,
          historyDays,
          weightProfileKey: profileKey,
          now: bdRelapseSimNow(iso, hour)
        });
        monthBucketSums[i] += score;
        if (score > dayMax) {
          dayMax = score;
          peakHour = hour;
        }
        if (offset === 0) todayCurve[i] = score;
      }
      for (let hour = CHART_START + CHART_HOURS; hour <= 23; hour += 1) {
        const score = bdRelapseScoreAtHour({
          dayData,
          dayTot,
          profile,
          normAbs,
          historyDays,
          weightProfileKey: profileKey,
          now: bdRelapseSimNow(iso, hour)
        });
        if (score > dayMax) {
          dayMax = score;
          peakHour = hour;
        }
      }
      daysSampled += 1;
      if (dayMax < ELEVATED) daysWithoutRisk += 1;
      if (dayMax >= EVENT) {
        relapseCount += 1;
        relapseHours.push(peakHour != null ? peakHour : 22);
      }
    }

    const monthAvg = monthBucketSums.map((sum) => (
      daysSampled > 0 ? sum / daysSampled : 0
    ));
    let dangerIdx = 0;
    let dangerMax = -1;
    monthAvg.forEach((avg, i) => {
      if (avg > dangerMax) {
        dangerMax = avg;
        dangerIdx = i;
      }
    });
    const dangerHour = CHART_START + dangerIdx;
    let insight = null;
    if (relapseHours.length > 0 && relapseHours.every((h) => h >= 21)) {
      insight = 'Все срывы за месяц были после 21:00';
    } else if (relapseHours.length > 0) {
      const minHour = Math.min(...relapseHours);
      insight = `Чаще всего срывы после ${bdRelapseFormatHour(minHour)}`;
    }

    return {
      chartStartHour: CHART_START,
      chartHours: CHART_HOURS,
      monthAvg,
      todayCurve,
      axisTicks: [6, 9, 12, 15, 18, 21, 24],
      dangerStartIdx: Math.max(0, dangerIdx - 1),
      dangerEndIdx: Math.min(CHART_HOURS, dangerIdx + 2),
      dangerHour: bdRelapseFormatHour(dangerHour),
      relapseCount,
      daysWithoutRisk,
      insight
    };
  }

  function buildRelapseBreakdown(title, widget) {
    const d = bdLayer();
    const snap = typeof d.getRelapseRiskData === 'function'
      ? d.getRelapseRiskData(widget)
      : {};
    const profile = bdRelapseMonthProfile();
    const level = snap.level || 'low';
    const drivers = bdRelapseDriverRows(snap.primaryDrivers);
    const insight = profile.insight
      || snap.recommendation
      || (drivers[0]?.label ? `Главный фактор — ${drivers[0].label}` : null);
    return {
      type: 'relapseRisk',
      title,
      heroKicker: 'Сейчас',
      heroValue: bdRelapseCanvasLevelWord(level),
      heroUnit: '',
      insight,
      chartLabel: null,
      chart: {
        kind: 'riskHourProfile',
        monthAvg: profile.monthAvg,
        todayCurve: profile.todayCurve,
        dangerStartIdx: profile.dangerStartIdx,
        dangerEndIdx: profile.dangerEndIdx,
        axisTicks: profile.axisTicks
      },
      stats: [
        { label: 'Срывов за месяц', value: bdFormatNum(profile.relapseCount) },
        profile.dangerHour
          ? { label: 'Опасный час', value: profile.dangerHour, tone: 'bad' }
          : null,
        { label: 'Дней без риска', value: `${profile.daysWithoutRisk} из 30` }
      ].filter(Boolean),
      drivers,
      norm: 'Риск считается по отклонениям дня от ваших норм — шкала в Инсайтах',
      action: { kind: 'insights', label: 'Что делать' },
      waterChips: false
    };
  }

  function bdHealthTrendDayScore(dayData) {
    const d = bdLayer();
    if (!dayData) return null;
    if (HEYS.DayScore?.calculateDayScore) {
      try {
        const profile = typeof d._getProfile === 'function' ? d._getProfile() : {};
        const normAbs = typeof d._getNormAbs === 'function' ? d._getNormAbs() : {};
        const waterGoal = typeof d._getWaterGoal === 'function' ? d._getWaterGoal() : 2000;
        const dayTot = typeof d._calculateDayTotals === 'function'
          ? d._calculateDayTotals(dayData)
          : {};
        const result = HEYS.DayScore.calculateDayScore({
          dayData, profile, dayTot, normAbs, waterGoal
        });
        const sc = Math.round(Number(result?.score) || 0);
        return sc > 0 ? sc : null;
      } catch { /* skip */ }
    }
    for (const field of ['dayScoreRaw', 'dayScore']) {
      const value = Number(dayData[field]);
      if (Number.isFinite(value) && value >= 1 && value <= 10) {
        return Math.round(value * 10);
      }
    }
    let proxy = 50;
    if (Array.isArray(dayData.meals) && dayData.meals.length >= 3) proxy += 15;
    if (Number(dayData.sleepHours) >= 7) proxy += 15;
    if (Number(dayData.stressAvg) > 0 && Number(dayData.stressAvg) <= 5) proxy += 10;
    if (Number(dayData.weight) > 0) proxy += 10;
    return Math.min(100, proxy);
  }

  function bdHealthTrendHydrationScore(patterns) {
    const hyd = (patterns || []).find((p) => p.pattern === 'hydration' && p.available);
    if (!hyd || hyd.score == null) return null;
    return Math.round((Number(hyd.score) - 50) / 12);
  }

  function bdHealthTrendContributions(ht, patterns) {
    const rows = (ht.categories || []).map((c) => ({
      key: c.key,
      label: BD_HT_CONTRIB_LABELS[c.key] || c.label,
      score: Math.round(Number(c.score) || 0)
    }));
    const hydScore = bdHealthTrendHydrationScore(patterns);
    if (hydScore != null) {
      rows.push({ key: 'water', label: 'Вода', score: hydScore });
    }
    const positives = rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
    const negatives = rows.filter((r) => r.score < 0).sort((a, b) => a.score - b.score);
    const picked = [];
    positives.slice(0, 2).forEach((r) => picked.push(r));
    if (negatives[0]) picked.push(negatives[0]);
    if (picked.length < 3) {
      rows
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .forEach((r) => {
          if (picked.length < 3 && !picked.includes(r)) picked.push(r);
        });
    }
    const top3 = picked.slice(0, 3);
    const maxAbs = Math.max(...top3.map((r) => Math.abs(r.score)), 1);
    return top3.map((r) => ({
      key: r.key,
      label: r.label,
      score: r.score,
      barPct: Math.max(6, Math.round((Math.abs(r.score) / maxAbs) * 38)),
      value: r.score > 0 ? `+${bdFormatNum(r.score)}` : bdFormatNum(r.score)
    }));
  }

  function bdHealthTrendMonthAnalysis() {
    const series = bdDaySeries(30).map(({ day }) => bdHealthTrendDayScore(day));
    const scored = series.filter((s) => Number.isFinite(s));
    const daysInPlus = scored.filter((s) => s >= 60).length;
    const weekAvgs = [];
    for (let w = 0; w < 4; w += 1) {
      const start = w * 7;
      const end = w === 3 ? 30 : start + 7;
      const slice = series.slice(start, end).filter((s) => Number.isFinite(s));
      weekAvgs.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null);
    }
    let bestWeekIdx = 0;
    let bestWeekAvg = -1;
    weekAvgs.forEach((avg, i) => {
      if (avg != null && avg > bestWeekAvg) {
        bestWeekAvg = avg;
        bestWeekIdx = i;
      }
    });
    return {
      series,
      daysInPlus,
      bestWeekOrdinal: BD_HT_WEEK_ORDINALS[bestWeekIdx] || '—'
    };
  }

  function buildHealthTrendBreakdown(title, widget) {
    const d = bdLayer();
    const ht = typeof d.getHealthTrendData === 'function'
      ? d.getHealthTrendData({ ...(widget.settings || {}), periodDays: 30 })
      : {};
    const analysis = HEYS.PredictiveInsights?.analyze?.({ daysBack: 30 }) || null;
    const month = bdHealthTrendMonthAnalysis();
    const contributions = bdHealthTrendContributions(ht, analysis?.patterns);
    const sortedContrib = [...contributions].sort((a, b) => b.score - a.score);
    const top = sortedContrib[0];
    const low = sortedContrib[sortedContrib.length - 1];
    const insight = top && low
      ? `Тренд тянет вверх ${BD_HT_INSIGHT_NAMES[top.key] || top.label.toLowerCase()}, вниз — ${BD_HT_INSIGHT_NAMES[low.key] || low.label.toLowerCase()}`
      : null;
    const heroScore = Math.round(Number(ht.score) || 0);
    const spark = month.series.map((score) => ({ weight: Number.isFinite(score) ? score : 0 }));
    return {
      type: 'healthTrend',
      title,
      heroKicker: 'За месяц',
      heroValue: heroScore > 0 ? `+${bdFormatNum(heroScore)}` : bdFormatNum(heroScore),
      heroUnit: ' пунктов',
      insight,
      chartLabel: null,
      chart: { kind: 'spline30', spark },
      chartAxis: { left: '30 дней назад', right: 'сегодня' },
      stats: [
        ht.delta != null ? { label: 'Прошлый месяц', value: `${ht.delta > 0 ? '+' : ''}${bdFormatNum(ht.delta)}` } : null,
        { label: 'Лучшая неделя', value: month.bestWeekOrdinal },
        { label: 'Дней в плюсе', value: `${month.daysInPlus} из 30` }
      ].filter(Boolean),
      contributions,
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
      insight: bdHeatmapBreakdownInsight(cells),
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
    const d = bdLayer();
    const prof = typeof d._getProfile === 'function' ? d._getProfile() : {};
    const dyn = HEYS.Widgets.WeightDynamicsV4?.compute?.({ profile: prof }) || {};
    const series90 = bdWeightBreakdownSeries(90);
    const plateaus = bdWeightPlateauBands(series90, 10);
    const monthDelta = bdWeightDelta30Kg(series90.slice(-30));
    const heroVal = monthDelta != null
      ? `${monthDelta > 0 ? '+' : ''}${bdFormatNum(monthDelta, 1)}`
      : (dyn.delta?.sign && dyn.delta?.text ? `${dyn.delta.sign}${dyn.delta.text}` : '—');
    return {
      type: 'crashRisk',
      title,
      heroKicker: 'За месяц',
      heroValue: heroVal,
      heroUnit: ' кг',
      insight: bdWeightPlateauInsight(plateaus, series90) || dyn.placeholder || null,
      chartLabel: '90 дней',
      chart: {
        kind: 'weightCurve',
        spark: series90.map((p) => ({ weight: p.smoothed, date: p.date })),
        plateaus
      },
      stats: bdWeightWeeklyDeltaStats(series90, 4),
      norm: dyn.remainderLabel && dyn.remainderLabel.includes('темп')
        ? dyn.remainderLabel
        : bdWeightHealthyTempoNorm(prof),
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
    if (chart.kind === 'waterHourProfile' || chart.kind === 'riskHourProfile') {
      const monthAvg = chart.monthAvg || [];
      const todayCurve = chart.todayCurve || [];
      const barCount = Math.max(monthAvg.length, todayCurve.length, 1);
      const max = Math.max(...monthAvg, ...todayCurve, 1);
      const gapStart = chart.gapStartIdx ?? chart.dangerStartIdx;
      const gapEnd = chart.gapEndIdx ?? chart.dangerEndIdx;
      const gapLeft = Number.isFinite(gapStart) && Number.isFinite(gapEnd) && gapEnd > gapStart
        ? (gapStart / barCount) * 100
        : null;
      const gapWidth = gapLeft != null ? ((gapEnd - gapStart) / barCount) * 100 : null;
      const path = bdSplinePath(todayCurve.length ? todayCurve : [0], 268, 66, 6);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget-bd-sheet__water-profile' },
          gapLeft != null && gapWidth != null
            ? React.createElement('span', {
              className: 'widget-bd-sheet__water-profile-gap',
              style: { left: `${gapLeft}%`, width: `${gapWidth}%` }
            })
            : null,
          monthAvg.map((v, i) => {
            const h = Math.max(6, Math.round((v / max) * 100));
            return React.createElement('span', {
              key: i,
              className: 'widget-bd-sheet__water-profile-bar'
            }, React.createElement('i', { style: { height: `${h}%` } }));
          }),
          React.createElement('svg', {
            className: 'widget-bd-sheet__water-profile-spline',
            viewBox: '0 0 268 66',
            preserveAspectRatio: 'none',
            'aria-hidden': 'true'
          }, React.createElement('path', {
            d: path,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          }))
        ),
        Array.isArray(chart.axisTicks) && chart.axisTicks.length
          ? React.createElement('div', { className: 'widget-bd-sheet__water-axis' },
            chart.axisTicks.map((tick) => React.createElement('span', { key: tick }, String(tick))))
          : null
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
      const axisStart = chart.axisStart ?? BD_SLEEP_AXIS_START;
      const span = chart.axisSpan ?? BD_SLEEP_AXIS_SPAN;
      const labelWidthPx = 19;
      const weekdayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
      const avgPct = chart.avgBedMin != null
        ? Math.max(0, Math.min(100, ((chart.avgBedMin - axisStart) / span) * 100))
        : null;
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget-bd-sheet__sleep-strip widget-bd-sheet__sleep-timeline' },
          avgPct != null
            ? React.createElement('span', {
              className: 'widget-bd-sheet__sleep-timeline-avg',
              style: { left: `calc(${labelWidthPx}px + (100% - ${labelWidthPx}px) * ${avgPct / 100})` }
            })
            : null,
          rows.map((row, i) => {
            const pos = bdSleepBarPosition(row.start, row.end, axisStart, span);
            const wd = row.iso ? new Date(`${row.iso}T12:00:00`).getDay() : null;
            const showLabel = i % 2 === 0 && wd != null;
            return React.createElement('div', {
              key: i,
              className: 'widget-bd-sheet__sleep-timeline-row'
                + (row.isToday ? ' is-today' : '')
                + (!pos ? ' is-empty' : '')
            },
              React.createElement('span', { className: 'widget-bd-sheet__sleep-timeline-label' },
                showLabel ? weekdayNames[wd] : ''),
              React.createElement('span', { className: 'widget-bd-sheet__sleep-timeline-track' },
                pos
                  ? React.createElement('span', {
                    className: 'widget-bd-sheet__sleep-timeline-bar',
                    style: { left: `${pos.left}%`, width: `${pos.width}%` }
                  })
                  : null
              )
            );
          })
        ),
        Array.isArray(chart.axisTicks) && chart.axisTicks.length
          ? React.createElement('div', { className: 'widget-bd-sheet__sleep-axis' },
            chart.axisTicks.map((tick) => React.createElement('span', { key: tick }, tick)))
          : null
      );
    }
    if (chart.kind === 'weightDualCurve') {
      const geom = bdWeightChartGeometry(chart.series || [], 300, 72, 6);
      return React.createElement('svg', {
        className: 'widget-bd-sheet__weight-chart',
        viewBox: '0 0 300 72',
        preserveAspectRatio: 'none',
        'aria-hidden': 'true'
      },
      geom.dots.map((dot, i) => React.createElement('circle', {
        key: i,
        className: 'widget-bd-sheet__weight-dot',
        cx: dot.cx,
        cy: dot.cy,
        r: 2.2
      })),
      geom.trendPath
        ? React.createElement('path', {
          className: 'widget-bd-sheet__weight-trend',
          d: geom.trendPath,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        })
        : null);
    }
    if (chart.kind === 'weightCurve' || chart.kind === 'spline30') {
      const spark = chart.spark || [];
      const pts = spark.map((p) => Number(p.weight ?? p.smoothed)).filter(Number.isFinite);
      const width = 300;
      const height = 72;
      const padY = 6;
      const path = bdSplinePath(pts.length ? pts : [0], width, height, padY);
      const plateaus = chart.plateaus || [];
      const n = Math.max(spark.length, 1);
      return React.createElement('svg', {
        className: 'widget-bd-sheet__spline' + (chart.kind === 'weightCurve' ? ' widget-bd-sheet__weight-curve' : ''),
        viewBox: `0 0 ${width} ${height}`,
        preserveAspectRatio: 'none'
      },
      plateaus.map((band, i) => {
        const denom = Math.max(1, n - 1);
        const x0 = (band.start / denom) * width;
        const x1 = ((band.end + 1) / denom) * width;
        return React.createElement('rect', {
          key: i,
          className: 'widget-bd-sheet__weight-plateau',
          x: x0,
          y: 0,
          width: Math.max(0, x1 - x0),
          height,
          rx: 0
        });
      }),
      React.createElement('path', { d: path, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
    }
    if (chart.kind === 'waveWeekStrip') {
      const rows = chart.rows || [];
      return React.createElement('div', { className: 'widget-bd-sheet__wave-week' },
        rows.map((row, i) => {
          const segments = row.segments || [];
          const totalFlex = segments.reduce((s, seg) => s + (seg.flex || 1), 0) || 1;
          return React.createElement('div', {
            key: row.iso || i,
            className: 'widget-bd-sheet__wave-week-row' + (row.isToday ? ' is-today' : '')
          },
            React.createElement('span', { className: 'widget-bd-sheet__wave-week-label' }, row.label || ''),
            React.createElement('div', { className: 'widget-bd-sheet__wave-week-track' },
              segments.length
                ? segments.map((seg, si) => React.createElement('span', {
                  key: si,
                  className: 'widget-bd-sheet__wave-week-seg' + (seg.elevated ? ' is-active' : ''),
                  style: { flex: `${seg.flex || 1} 1 0`, width: `${((seg.flex || 1) / totalFlex) * 100}%` }
                }))
                : React.createElement('span', { className: 'widget-bd-sheet__wave-week-empty' })
            )
          );
        })
      );
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
        model.insightBeforeHero && model.insight
          ? React.createElement('p', { className: 'widget-bd-sheet__insight' }, model.insight)
          : null,
        model.heroValue != null && model.heroValue !== '' && !model.heroTracks?.length
          ? React.createElement('div', { className: 'widget-bd-sheet__hero' },
            React.createElement('span', { className: 'widget-bd-sheet__hero-val' }, model.heroValue),
            model.heroUnit ? React.createElement('span', { className: 'widget-bd-sheet__hero-unit' }, model.heroUnit) : null
          )
          : null,
        model.heroTracks?.length ? React.createElement('div', { className: 'widget-bd-sheet__hero-tracks' },
          model.heroTracks.map((tr) => React.createElement('div', { key: tr.name || tr.label, className: 'widget-bd-sheet__hero-track' },
            React.createElement('div', { className: 'widget-bd-sheet__hero-track-head' },
              React.createElement('span', { className: 'widget-bd-sheet__hero-track-name' }, tr.name || tr.label),
              React.createElement('span', { className: 'widget-bd-sheet__hero-track-val' }, `${tr.value} из ${tr.norm} ${tr.unit}`)
            ),
            React.createElement('div', { className: 'widget-bd-sheet__hero-track-bar', 'aria-hidden': 'true' },
              React.createElement('div', {
                className: 'widget-bd-sheet__hero-track-fill'
                  + (tr.tone === 'bad' ? ' is-bad' : ''),
                style: { width: `${Math.max(0, Math.min(100, Number(tr.pct) || 0))}%` }
              })
            )
          ))
        ) : null,
        !model.insightBeforeHero && model.insight
          ? React.createElement('p', { className: 'widget-bd-sheet__insight' }, model.insight)
          : null,
        model.chartLabel ? React.createElement('div', { className: 'widget-bd-sheet__chart-label' }, model.chartLabel) : null,
        React.createElement(WidgetBreakdownChart, { chart: model.chart }),
        model.chartAxis ? React.createElement('div', { className: 'widget-bd-sheet__sleep-axis widget-bd-sheet__chart-axis' },
          React.createElement('span', null, model.chartAxis.left),
          React.createElement('span', { className: 'is-accent' }, model.chartAxis.right)
        ) : null,
        model.factorBars?.length ? React.createElement('div', { className: 'widget-bd-sheet__factors' },
          model.factorBars.map((f) => React.createElement('div', {
            key: f.key,
            className: 'widget-bd-sheet__factor-row'
              + (f.tone === 'bad' ? ' is-bad' : f.tone === 'warn' ? ' is-warn' : '')
          },
            React.createElement('span', { className: 'widget-bd-sheet__factor-label' }, f.label),
            React.createElement('span', {
              className: 'widget-bd-sheet__factor-bar'
                + (f.tone === 'good' ? ' is-good' : f.tone === 'warn' ? ' is-warn' : f.tone === 'bad' ? ' is-bad' : '')
            },
              React.createElement('i', { style: { width: `${f.score}%` } })),
            React.createElement('span', {
              className: 'widget-bd-sheet__factor-share'
                + ((f.weakDays || 0) === model.factorWeakMax && model.factorWeakMax > 0 ? ' is-bad' : '')
            }, f.weakDays != null ? `${f.weakDays} из ${f.weakTotal || 30}` : '')
          ))
        ) : null,
        model.contributions?.length ? React.createElement('div', { className: 'widget-bd-sheet__contrib' },
          model.contributions.map((row, i) => {
            const isPos = (row.score ?? 0) >= 0;
            return React.createElement('div', { key: i, className: 'widget-bd-sheet__contrib-row' },
              React.createElement('span', { className: 'widget-bd-sheet__contrib-label' }, row.label),
              React.createElement('span', { className: 'widget-bd-sheet__contrib-track' },
                React.createElement('span', {
                  className: 'widget-bd-sheet__contrib-bar' + (isPos ? ' is-good' : ' is-bad'),
                  style: isPos
                    ? { left: '50%', width: `${row.barPct || 0}%` }
                    : { right: '50%', width: `${row.barPct || 0}%` }
                })
              ),
              React.createElement('span', {
                className: 'widget-bd-sheet__contrib-val' + (isPos ? ' is-good' : ' is-bad')
              }, row.value)
            );
          })
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
        model.drivers?.length ? React.createElement('div', { className: 'widget-bd-sheet__drivers' },
          model.drivers.map((dr, i) => React.createElement('div', {
            key: i,
            className: 'widget-bd-sheet__driver-row'
              + (dr.tone === 'bad' ? ' is-bad' : dr.tone === 'warn' ? ' is-warn' : '')
          },
            React.createElement('span', { className: 'widget-bd-sheet__driver-mark', 'aria-hidden': 'true' }),
            React.createElement('span', { className: 'widget-bd-sheet__driver' }, dr.label || dr.text)
          ))
        ) : null,
        model.norm ? React.createElement('p', { className: 'widget-bd-sheet__norm' }, model.norm) : null,
        model.waterChips
          ? React.createElement('div', { className: 'widget-bd-sheet__chips', role: 'group', 'aria-label': 'Объём воды' },
            (Array.isArray(model.waterChipMl) && model.waterChipMl.length ? model.waterChipMl : [200, 500]).map((ml) => React.createElement('button', {
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
