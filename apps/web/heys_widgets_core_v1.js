/**
 * heys_widgets_core_v1.js
 * Ядро виджетов: Grid Engine, Drag & Drop, State Manager
 * Version: 1.3.0 — Phase 1: Core Engine + Cloud Sync Protection
 * Created: 2025-12-15
 * Updated: 2025-12-16
 * 
 * Phase 1 features:
 * - Undo/Redo history stack
 * - Ghost element + placeholder preview
 * - Long press detection (500ms)
 * - Improved collision detection
 * - Debounced persistence
 * 
 * v1.3.0 FIX (2025-12-16):
 * - saveLayout() теперь сохраняет { widgets, updatedAt } вместо простого массива
 * - loadLayout() поддерживает оба формата (legacy array + new object)
 * - Защита cloud sync: локальный layout не затирается облачным если локальный новее
 * - Событие heys:widget-layout-updated для синхронизации после cloud sync
 * 
 * v1.2.0 FIX (2025-12-16):
 * - saveLayout() НЕ сохраняет пустой массив (предотвращает потерю данных)
 * - saveLayout() НЕ сохраняет до инициализации (предотвращает перезапись storage)
 * - beforeunload/visibilitychange проверяют _initialized перед сохранением
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};

  // Локальные лог-хелперы (через HEYS.log/HEYS.err)
  const log = (...args) => {
    if (HEYS?.log) {
      HEYS.log('Widgets Core', ...args);
      return;
    }
    if (global.HEYS?.debug) {
      console.log('[Widgets Core]', ...args);
    }
  };
  const warn = (...args) => {
    if (HEYS?.log) {
      HEYS.log('Widgets Core', '⚠️', ...args);
      return;
    }
    console.warn('[Widgets Core]', ...args);
  };
  const err = (...args) => {
    if (HEYS?.err) {
      HEYS.err('Widgets Core', ...args);
      return;
    }
    console.error('[Widgets Core]', ...args);
  };

  // === Constants ===
  const STORAGE_KEY = 'heys_widget_layout_v1';
  const STORAGE_META_KEY = 'heys_widget_layout_meta_v1';
  const GRID_COLS = 4; // 4 колонки: 1 колонка/ряд = базовая единица
  const GRID_VERSION = 2;
  const MAX_HISTORY = 20; // Максимум шагов undo/redo
  const SAVE_DEBOUNCE_MS = 500; // Debounce для сохранения
  const LONG_PRESS_MS = 500; // Время для long press
  // ВАЖНО: основной источник правды по высоте ряда — CSS var --widget-row-height.
  // Здесь — fallback на случай ранней инициализации до применения стилей.
  const CELL_HEIGHT_PX = 76; // fallback
  const CELL_GAP_PX = 12; // fallback

  const DEFAULT_LAYOUT = [
    // 4-колоночная сетка — красивый набор для новых пользователей
    // Ряд 0: Day Score + Risk Radar (единые оценки)
    { type: 'dayScore', size: '2x2', position: { col: 0, row: 0 } },
    { type: 'riskRadar', size: '2x2', position: { col: 2, row: 0 } },
    // Ряд 2: Калории + Вода (базовые)
    { type: 'calories', size: '2x2', position: { col: 0, row: 2 } },
    { type: 'water', size: '2x2', position: { col: 2, row: 2 } },
    // Ряд 4: Вес (полная ширина) — BMI + график тренда
    { type: 'weight', size: '4x2', position: { col: 0, row: 4 } },
    // Ряд 6: Тепловая карта (полная ширина) — компактная неделя
    { type: 'heatmap', size: '4x1', position: { col: 0, row: 6 } }
  ];

  // === State Manager with Undo/Redo ===
  const state = {
    _widgets: [],
    _history: [], // Undo stack
    _future: [], // Redo stack
    _editMode: false,
    _draggedWidget: null,
    _initialized: false,
    _saveTimeout: null,

    /**
     * Инициализация state manager
     */
    init() {
      if (this._initialized) return;

      const meta = this.loadLayoutMeta();
      let saved = this.loadLayout() || [];

      // Миграция layout 2-колоночной сетки → 4-колоночную.
      // Важно: делаем ОДИН раз и фиксируем в meta.
      const needsMigration = !meta || meta.gridVersion !== GRID_VERSION || meta.gridCols !== GRID_COLS;
      if (needsMigration && saved && Array.isArray(saved) && saved.length > 0) {
        // Важно: saveLayout() раньше сохранял this._widgets (ещё пустой) → мог перезатирать storage.
        // Поэтому: нормализуем мигрированный layout и сохраняем ИМЕННО его.
        const migrated = this._migrateLayout(saved, meta);
        const normalizedWidgets = migrated.map(w => this._normalizeWidget(w));
        const normalizedLayoutData = normalizedWidgets.map(w => ({
          id: w.id,
          type: w.type,
          size: w.size,
          position: w.position,
          settings: w.settings,
          createdAt: w.createdAt
        }));

        saved = normalizedLayoutData;

        // После миграции — сохраняем meta + текущий layout
        this.saveLayoutMeta({ gridVersion: GRID_VERSION, gridCols: GRID_COLS, migratedAt: Date.now() });
        // Сохраняем сразу (без debounce)
        try { this.saveLayout(normalizedLayoutData); } catch (e) { }
      }

      if (saved && Array.isArray(saved) && saved.length > 0) {
        // 🔍 DEBUG: логируем raw данные из storage (JSON для раскрытия)
        log('RAW from storage:', JSON.stringify(saved.map(w => ({
          type: w.type,
          size: w.size,
          pos: w.position
        }))));
        this._widgets = saved.map(w => this._normalizeWidget(w));
        this._autoPackWidgets();
      } else {
        this._widgets = this._createDefaultLayout();
        this._autoPackWidgets();
        // фиксируем meta для чистого старта
        this.saveLayoutMeta({ gridVersion: GRID_VERSION, gridCols: GRID_COLS, migratedAt: Date.now() });
      }

      // Очищаем историю при загрузке
      this._history = [];
      this._future = [];

      this._initialized = true;
      HEYS.Widgets.emit('layout:loaded', { layout: this._widgets });
      log('State initialized with', this._widgets.length, 'widgets');
      // 🔍 DEBUG: логируем финальное состояние
      log('Final widgets:', this._widgets.map(w => ({
        id: w.id?.substring(0, 20),
        type: w.type,
        size: w.size,
        cols: w.cols,
        rows: w.rows
      })));
    },

    /**
     * Полная реинициализация при смене клиента
     * Сбрасывает состояние и загружает layout для нового clientId
     * @param {string} [forClientId] - явный clientId (иначе берём из HEYS.currentClientId)
     */
    reinit(forClientId) {
      // Используем переданный clientId, чтобы не зависеть от race condition с HEYS.currentClientId
      const cid = forClientId || window.HEYS?.currentClientId || '';
      log(`reinit: clientId="${cid ? cid.slice(0, 8) + '...' : 'EMPTY!'}" (explicit: ${!!forClientId})`);

      // Сбрасываем флаг инициализации
      this._initialized = false;
      this._widgets = [];
      this._history = [];
      this._future = [];

      // Очищаем memory cache в HEYS.store для виджетов
      if (HEYS.store?.invalidate) {
        HEYS.store.invalidate(STORAGE_KEY);
        HEYS.store.invalidate(STORAGE_META_KEY);
      }

      // Временно устанавливаем clientId если передан явно (чтобы init() использовал правильный)
      const prevClientId = window.HEYS?.currentClientId;
      if (forClientId && window.HEYS) {
        window.HEYS.currentClientId = forClientId;
      }

      // Заново инициализируем (теперь с новым clientId)
      this.init();

      // Восстанавливаем предыдущий clientId если он отличался (на случай если App ещё не обновил его)
      // Это нужно только если init() зависит от HEYS.currentClientId внутри
      // В текущей реализации HEYS.store.get() использует HEYS.currentClientId для scoping
    },

    /**
     * Meta для layout (чтобы миграция не повторялась)
     */
    loadLayoutMeta() {
      try {
        if (HEYS.store?.get) {
          return HEYS.store.get(STORAGE_META_KEY, null);
        } else if (HEYS.utils?.lsGet) {
          return HEYS.utils.lsGet(STORAGE_META_KEY, null);
        } else {
          const stored = localStorage.getItem(STORAGE_META_KEY);
          return stored ? JSON.parse(stored) : null;
        }
      } catch (e) {
        return null;
      }
    },

    saveLayoutMeta(meta) {
      try {
        if (HEYS.store?.set) {
          HEYS.store.set(STORAGE_META_KEY, meta);
        } else if (HEYS.utils?.lsSet) {
          HEYS.utils.lsSet(STORAGE_META_KEY, meta);
        } else {
          localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
        }
      } catch (e) {
        // no-op
      }
    },

    /**
     * Миграция layout (v1: GRID_COLS=2) → (v2: GRID_COLS=4).
     * Стратегия:
     * 1) Масштабируем координаты ×2 (col/row)
     * 2) Затем «упаковываем» виджеты заново по их визуальному порядку,
     *    чтобы гарантировать отсутствие коллизий на новых размерах.
     */
    _migrateLayout(savedLayout, meta) {
      const fromCols = meta?.gridCols || 2;
      const toCols = GRID_COLS;
      const scale = toCols / fromCols;

      // Если внезапно уже совпадает — ничего не делаем
      if (!Number.isFinite(scale) || scale <= 0 || scale === 1) {
        return savedLayout;
      }

      const scaled = savedLayout.map((w) => {
        const pos = w?.position || { col: 0, row: 0 };
        return {
          ...w,
          position: {
            col: Math.max(0, Math.round((pos.col || 0) * scale)),
            row: Math.max(0, Math.round((pos.row || 0) * scale))
          }
        };
      });

      // Нормализуем (получим новые cols/rows из registry) и репакуем
      const normalized = scaled.map((w) => this._normalizeWidget(w));
      const packedPositions = this._packLayoutPositions(normalized);

      return normalized.map((w) => ({
        id: w.id,
        type: w.type,
        size: w.size,
        position: packedPositions[w.id] || w.position,
        settings: w.settings,
        createdAt: w.createdAt
      }));
    },

    _packLayoutPositions(widgets) {
      const sorted = [...(widgets || [])].sort((a, b) => {
        if ((a.position?.row || 0) !== (b.position?.row || 0)) return (a.position?.row || 0) - (b.position?.row || 0);
        return (a.position?.col || 0) - (b.position?.col || 0);
      });

      const occupied = new Set();
      const positions = {};

      const occupy = (w, col, row) => {
        // 🔧 FIX: Получаем размер из registry
        const sizeInfo = HEYS.Widgets.registry.getSize(w.size);
        const wCols = sizeInfo?.cols || w.cols || 1;
        const wRows = sizeInfo?.rows || w.rows || 1;

        for (let c = 0; c < wCols; c++) {
          for (let r = 0; r < wRows; r++) {
            occupied.add(`${col + c},${row + r}`);
          }
        }
      };

      const canPlace = (col, row, cols, rows) => {
        if (col < 0 || col + cols > GRID_COLS) return false;
        if (row < 0) return false;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (occupied.has(`${col + c},${row + r}`)) return false;
          }
        }
        return true;
      };

      for (const w of sorted) {
        // 🔧 FIX: Получаем размер из registry
        const sizeInfo = HEYS.Widgets.registry.getSize(w.size);
        const wCols = sizeInfo?.cols || w.cols || 1;
        const wRows = sizeInfo?.rows || w.rows || 1;

        let placed = false;
        for (let row = 0; row < 200 && !placed; row++) {
          for (let col = 0; col <= GRID_COLS - wCols; col++) {
            if (canPlace(col, row, wCols, wRows)) {
              positions[w.id] = { col, row };
              occupy(w, col, row);
              placed = true;
              break;
            }
          }
        }

        if (!placed) {
          // fallback: в самый низ
          const maxRow = Math.max(0, ...Object.values(positions).map(p => p.row));
          positions[w.id] = { col: 0, row: maxRow + 1 };
          occupy(w, positions[w.id].col, positions[w.id].row);
        }
      }

      return positions;
    },

    _autoPackWidgets() {
      if (!Array.isArray(this._widgets) || this._widgets.length === 0) return false;

      const packedPositions = this._packLayoutPositions(this._widgets);
      let changed = false;

      this._widgets = this._widgets.map((widget) => {
        const nextPos = packedPositions[widget.id];
        if (!nextPos) return widget;

        const curCol = widget.position?.col || 0;
        const curRow = widget.position?.row || 0;
        if (curCol === nextPos.col && curRow === nextPos.row) {
          return widget;
        }

        changed = true;
        return {
          ...widget,
          position: { col: nextPos.col, row: nextPos.row }
        };
      });

      return changed;
    },

    /**
     * Сохранить текущее состояние в историю (для undo)
     * @private
     */
    _pushHistory() {
      // Глубокое клонирование текущего состояния
      const snapshot = JSON.parse(JSON.stringify(this._widgets));
      this._history.push(snapshot);

      // Ограничиваем размер истории
      if (this._history.length > MAX_HISTORY) {
        this._history.shift();
      }

      // Очищаем future при новом действии
      this._future = [];
    },

    /**
     * Undo — отменить последнее действие
     * @returns {boolean}
     */
    undo() {
      if (this._history.length === 0) {
        log('Nothing to undo');
        return false;
      }

      // Сохраняем текущее состояние в future
      this._future.push(JSON.parse(JSON.stringify(this._widgets)));

      // Восстанавливаем предыдущее состояние
      this._widgets = this._history.pop();
      this._debouncedSave();

      HEYS.Widgets.emit('history:undo', { layout: this._widgets });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });

      log('Undo performed, history:', this._history.length, 'future:', this._future.length);
      return true;
    },

    /**
     * Redo — повторить отменённое действие
     * @returns {boolean}
     */
    redo() {
      if (this._future.length === 0) {
        log('Nothing to redo');
        return false;
      }

      // Сохраняем текущее состояние в history
      this._history.push(JSON.parse(JSON.stringify(this._widgets)));

      // Восстанавливаем future состояние
      this._widgets = this._future.pop();
      this._debouncedSave();

      HEYS.Widgets.emit('history:redo', { layout: this._widgets });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });

      log('Redo performed, history:', this._history.length, 'future:', this._future.length);
      return true;
    },

    /**
     * Проверить возможность undo
     * @returns {boolean}
     */
    canUndo() {
      return this._history.length > 0;
    },

    /**
     * Проверить возможность redo
     * @returns {boolean}
     */
    canRedo() {
      return this._future.length > 0;
    },

    /**
     * Получить размер истории
     * @returns {Object}
     */
    getHistoryInfo() {
      return {
        undoCount: this._history.length,
        redoCount: this._future.length,
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      };
    },

    /**
     * Нормализовать виджет (добавить недостающие поля)
     */
    _normalizeWidget(w) {
      const registry = HEYS.Widgets.registry;
      const type = registry?.getType(w.type);

      // Backward compatibility: в сохранённых layout'ах могут быть legacy size-id.
      const rawSizeId = w.size || type?.defaultSize || '2x2';
      const normalizedSizeId = registry?.normalizeSizeId
        ? (registry.normalizeSizeId(rawSizeId) || '2x2')
        : rawSizeId;

      const supportedSizes = Array.isArray(type?.availableSizes) ? type.availableSizes : [];
      const finalSizeId = (supportedSizes.length > 0 && !supportedSizes.includes(normalizedSizeId))
        ? (type?.defaultSize || supportedSizes[0] || normalizedSizeId)
        : normalizedSizeId;

      const size = registry?.getSize(finalSizeId);

      // 🔍 DEBUG: если размер изменился при нормализации — логируем
      if (rawSizeId !== finalSizeId || !w.size) {
        log(`_normalizeWidget ${w.type}: raw=${w.size || 'undefined'} → normalized=${finalSizeId} (default=${type?.defaultSize})`);
      }

      return {
        id: w.id || `widget_${w.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: w.type,
        size: finalSizeId,
        cols: size?.cols || 1,
        rows: size?.rows || 1,
        position: w.position || { col: 0, row: 0 },
        settings: w.settings || {},
        createdAt: w.createdAt || Date.now()
      };
    },

    /**
     * Создать дефолтный layout
     */
    _createDefaultLayout() {
      const registry = HEYS.Widgets.registry;
      return DEFAULT_LAYOUT.map((def, idx) => {
        const widget = registry?.createWidget(def.type, {
          size: def.size,
          position: def.position
        });
        return widget || this._normalizeWidget(def);
      }).filter(Boolean);
    },

    /**
     * Получить все виджеты
     * @returns {Object[]}
     */
    getWidgets() {
      return [...this._widgets];
    },

    /**
     * Получить виджет по ID
     * @param {string} id
     * @returns {Object|null}
     */
    getWidget(id) {
      return this._widgets.find(w => w.id === id) || null;
    },

    /**
     * Debounced save — сохранение с задержкой
     * @private
     */
    _debouncedSave() {
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout);
      }
      this._saveTimeout = setTimeout(() => {
        this.saveLayout();
        this._saveTimeout = null;
      }, SAVE_DEBOUNCE_MS);
    },

    /**
     * Добавить виджет
     * @param {Object} widget
     * @param {boolean} skipHistory - не сохранять в историю (для undo/redo)
     */
    addWidget(widget, skipHistory = false) {
      if (!skipHistory) {
        this._pushHistory();
      }

      const normalized = this._normalizeWidget(widget);

      // Найти свободную позицию если не указана
      if (!widget.position || (widget.position.col === 0 && widget.position.row === 0)) {
        normalized.position = gridEngine.findFreePosition(normalized.cols, normalized.rows);
      }

      this._widgets.push(normalized);
      this._autoPackWidgets();
      const addedWidget = this.getWidget(normalized.id) || normalized;
      this._debouncedSave();

      HEYS.Widgets.emit('widget:added', { widget: addedWidget });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });

      // Вибрация при добавлении
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }

      return normalized;
    },

    /**
     * Удалить виджет
     * @param {string} id
     * @param {boolean} skipHistory - не сохранять в историю
     */
    removeWidget(id, skipHistory = false) {
      const index = this._widgets.findIndex(w => w.id === id);
      if (index === -1) return false;

      if (!skipHistory) {
        this._pushHistory();
      }

      const removed = this._widgets.splice(index, 1)[0];
      this._autoPackWidgets();
      this._debouncedSave();

      HEYS.Widgets.emit('widget:removed', { widgetId: id, widget: removed });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });

      // Вибрация при удалении
      if (navigator.vibrate) {
        navigator.vibrate([10, 50, 10]);
      }

      return true;
    },

    /**
     * Обновить виджет
     * @param {string} id
     * @param {Object} updates
     * @param {boolean} skipHistory - не сохранять в историю
     */
    updateWidget(id, updates, skipHistory = false) {
      const widget = this.getWidget(id);
      if (!widget) return false;

      if (!skipHistory) {
        this._pushHistory();
      }

      const widgetIdx = this._widgets.indexOf(widget);
      const oldWidget = { ...widget, position: { ...widget.position } };

      // 🔒 Нормализуем sizeId в одном месте, чтобы:
      // - поддерживать legacy id (mini/compact/large)
      // - поддерживать символ "×" (например, "1×1")
      // - гарантировать пересчёт cols/rows и корректный DnD placeholder
      let nextUpdates = updates;
      if (updates && Object.prototype.hasOwnProperty.call(updates, 'size')) {
        const reg = HEYS.Widgets.registry;
        const raw = updates.size;
        const normalized = reg?.normalizeSizeId ? (reg.normalizeSizeId(raw) || raw) : raw;
        if (normalized !== raw) {
          nextUpdates = { ...updates, size: normalized };
        }
      }

      // FIX: Создаём новый объект виджета вместо мутации in-place.
      // Object.assign(widget, ...) менял свойства существующей ссылки, поэтому
      // React.memo на WidgetCard видел ту же ссылку и пропускал ре-рендер —
      // визуально изменения (размер, позиция) не отображались до выхода из edit mode.
      const updatedWidget = { ...widget, ...nextUpdates };

      // Обновить cols/rows если изменился size
      if (nextUpdates && nextUpdates.size) {
        const size = HEYS.Widgets.registry?.getSize(nextUpdates.size);
        if (size) {
          updatedWidget.cols = size.cols;
          updatedWidget.rows = size.rows;
        }
      }

      // Обновить позицию если указана (всегда новый объект)
      if (nextUpdates && nextUpdates.position) {
        updatedWidget.position = { ...nextUpdates.position };
      }

      // Заменяем ссылку в массиве: React.memo увидит новый объект → корректный ре-рендер
      if (widgetIdx !== -1) {
        this._widgets[widgetIdx] = updatedWidget;
      }

      this._debouncedSave();

      if (nextUpdates && nextUpdates.position) {
        HEYS.Widgets.emit('widget:moved', { widget: updatedWidget, from: oldWidget.position, to: updatedWidget.position });
        // Вибрация при перемещении
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
      }
      if (nextUpdates && nextUpdates.size) {
        HEYS.Widgets.emit('widget:resized', { widget: updatedWidget, from: oldWidget.size, to: updatedWidget.size });
      }
      if (nextUpdates && nextUpdates.settings) {
        HEYS.Widgets.emit('widget:settings', { widget: updatedWidget, settings: updatedWidget.settings });
      }

      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      return true;
    },

    /**
     * Переместить виджет
     * @param {string} id
     * @param {Object} position - { col, row }
     * @param {boolean} skipHistory
     */
    moveWidget(id, position, skipHistory = false) {
      const result = this.updateWidget(id, { position }, skipHistory);
      if (result) {
        // 🆕 Вытесняем перекрывающиеся виджеты на свободные места
        gridEngine.displaceCollidingWidgets(id);
        if (this._autoPackWidgets()) {
          this._debouncedSave();
          HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
        }
      }
      return result;
    },

    /**
     * Поменять два виджета местами (позициями).
     * Нужен для iOS-like перестановки: drop на занятое место делает swap.
     * @param {string} idA
     * @param {string} idB
     * @param {boolean} skipHistory
     * @returns {boolean}
     */
    swapWidgets(idA, idB, skipHistory = false) {
      const a = this.getWidget(idA);
      const b = this.getWidget(idB);
      if (!a || !b) return false;

      const posA = { ...a.position };
      const posB = { ...b.position };

      if (!skipHistory) {
        this._pushHistory();
      }

      // Делаем swap без дополнительного history push
      this.updateWidget(idA, { position: posB }, true);
      this.updateWidget(idB, { position: posA }, true);

      // 🆕 После swap проверяем коллизии для обоих виджетов
      gridEngine.displaceCollidingWidgets(idA);
      gridEngine.displaceCollidingWidgets(idB);
      if (this._autoPackWidgets()) {
        this._debouncedSave();
        HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      }

      HEYS.Widgets.emit('widget:swapped', { a: idA, b: idB, from: posA, to: posB });
      return true;
    },

    /**
     * Массово применить позиции (одним действием для истории).
     * @param {Record<string, {col:number,row:number}>} positionsById
     * @param {boolean} skipHistory
     * @returns {boolean}
     */
    applyPositions(positionsById, skipHistory = false) {
      if (!positionsById || typeof positionsById !== 'object') return false;

      if (!skipHistory) {
        this._pushHistory();
      }

      let changed = false;
      for (const w of this._widgets) {
        const next = positionsById[w.id];
        if (!next) continue;
        if (w.position.col !== next.col || w.position.row !== next.row) {
          w.position = { col: next.col, row: next.row };
          changed = true;
        }
      }

      if (changed) {
        // 🆕 Финальная проверка: убедимся что нет коллизий
        // (на случай если reflow расчёт был неточным)
        for (const widgetId of Object.keys(positionsById)) {
          gridEngine.displaceCollidingWidgets(widgetId);
        }

        this._autoPackWidgets();
        this._debouncedSave();
        HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      }

      return changed;
    },

    /**
     * Изменить размер виджета
     * @param {string} id
     * @param {string} size
     */
    resizeWidget(id, size) {
      return this.resizeWidgetAt(id, size, null);
    },

    /**
     * Изменить размер виджета с якорем (опционально) на конкретную позицию.
     * Нужно для resize от левого/верхнего края: меняется и size, и position.
     *
     * Свободная сетка: при resize вытесняем перекрывающиеся виджеты на свободные места.
     *
     * @param {string} id
     * @param {string} size
     * @param {{col:number,row:number}|null} position
     */
    resizeWidgetAt(id, size, position = null) {
      log(`resizeWidgetAt called: id=${id}, size=${size}, position=`, position);
      const widget = this.getWidget(id);
      if (!widget) return false;

      const registry = HEYS.Widgets.registry;
      const normalizedSize = registry?.normalizeSizeId ? (registry.normalizeSizeId(size) || size) : size;
      log(`resizeWidgetAt: widget.type=${widget.type}, oldSize=${widget.size}, newSize=${normalizedSize}`);
      if (!registry.supportsSize(widget.type, normalizedSize)) {
        warn(`Widget ${widget.type} does not support size ${normalizedSize}`);
        return false;
      }

      const nextPos = (position && Number.isFinite(position.col) && Number.isFinite(position.row))
        ? { col: position.col, row: position.row }
        : { ...widget.position };

      // 1) Одна запись в историю
      this._pushHistory();

      // 2) Меняем размер (+ якорную позицию)
      const resized = this.updateWidget(id, { size: normalizedSize, position: nextPos }, true);
      if (!resized) {
        return false;
      }

      // 3) 🆕 Вытесняем перекрывающиеся виджеты на свободные места
      gridEngine.displaceCollidingWidgets(id);
      if (this._autoPackWidgets()) {
        this._debouncedSave();
        HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      }

      // layout:changed эмитится внутри updateWidget
      return true;
    },

    /**
     * Сохранить layout в storage (cloud sync)
     */
    saveLayout(layoutOverride = null) {
      // 🔧 FIX: Не сохраняем до инициализации (иначе затрём storage пустым массивом)
      if (!this._initialized && !Array.isArray(layoutOverride)) {
        warn('saveLayout skipped: not initialized');
        return;
      }

      const widgetsData = (Array.isArray(layoutOverride) && layoutOverride.length > 0)
        ? layoutOverride
        : this._widgets.map(w => ({
          id: w.id,
          type: w.type,
          size: w.size,
          position: w.position,
          settings: w.settings,
          createdAt: w.createdAt
        }));

      // 🔧 FIX: Не сохраняем пустой layout (опасность потери данных)
      if (!widgetsData || widgetsData.length === 0) {
        warn('saveLayout skipped: empty widgets array');
        return;
      }

      // 🔧 Оборачиваем в объект с updatedAt для cloud sync conflict resolution
      const layoutData = {
        widgets: widgetsData,
        updatedAt: Date.now()
      };

      // 🔍 DEBUG: Проверяем clientId при сохранении
      const cid = window.HEYS?.currentClientId || '';
      log(`saveLayout: clientId="${cid ? cid.slice(0, 8) + '...' : 'EMPTY!'}", widgets=${widgetsData.length}, key=${STORAGE_KEY}`);

      // Используем HEYS.store для cloud sync
      if (HEYS.store?.set) {
        HEYS.store.set(STORAGE_KEY, layoutData);
      } else if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(STORAGE_KEY, layoutData);
      } else {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutData));
        } catch (e) {
          err('Failed to save layout:', e);
        }
      }

      HEYS.Widgets.emit('layout:saved', { layout: layoutData });
    },

    /**
     * Загрузить layout из storage
     * @returns {Object[]|null}
     */
    loadLayout() {
      // 🔍 DEBUG: Проверяем clientId при загрузке
      const cid = window.HEYS?.currentClientId || '';
      log(`loadLayout: clientId="${cid ? cid.slice(0, 8) + '...' : 'EMPTY!'}", key=${STORAGE_KEY}`);

      try {
        let stored = null;
        if (HEYS.store?.get) {
          stored = HEYS.store.get(STORAGE_KEY, null);
        } else if (HEYS.utils?.lsGet) {
          stored = HEYS.utils.lsGet(STORAGE_KEY, null);
        } else {
          const raw = localStorage.getItem(STORAGE_KEY);
          stored = raw ? JSON.parse(raw) : null;
        }

        // 🔧 МИГРАЦИЯ: поддержка старого формата (массив) и нового (объект с updatedAt)
        if (!stored) return null;

        // Новый формат: { widgets: [...], updatedAt: number }
        if (stored.widgets && Array.isArray(stored.widgets)) {
          log('loadLayout: new format, updatedAt =', stored.updatedAt);
          return stored.widgets;
        }

        // Старый формат: прямой массив виджетов
        if (Array.isArray(stored)) {
          log('loadLayout: legacy format (array), no updatedAt');
          return stored;
        }

        warn('loadLayout: unknown format', stored);
        return null;
      } catch (e) {
        err('Failed to load layout:', e);
        return null;
      }
    },

    /**
     * Сбросить к дефолтному layout
     */
    resetLayout() {
      this._widgets = this._createDefaultLayout();
      this.saveLayout();
      HEYS.Widgets.emit('layout:reset');
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
    },

    /**
     * Применить preset layout
     * @param {string} presetId
     */
    applyPreset(presetId) {
      const presets = HEYS.Widgets.presets?.getAll?.() || {};
      const preset = presets[presetId];
      if (!preset) {
        warn('Unknown preset:', presetId);
        return false;
      }

      this._widgets = preset.widgets.map(w => this._normalizeWidget(w));
      this.saveLayout();
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      return true;
    },

    // === Edit Mode ===

    isEditMode() {
      return this._editMode;
    },

    enterEditMode() {
      if (this._editMode) return;
      this._editMode = true;
      document.body.classList.add('widgets-edit-mode');

      // Отключаем swipe навигацию
      if (HEYS.App?.disableSwipe) {
        HEYS.App.disableSwipe();
      }

      HEYS.Widgets.emit('editmode:enter');
    },

    exitEditMode() {
      if (!this._editMode) return;

      // 🛡️ CRITICAL: Не выходить из edit mode если resize активен!
      if (HEYS.Widgets.dnd?._resizeActive) return;

      this._editMode = false;
      document.body.classList.remove('widgets-edit-mode');

      // Включаем swipe навигацию обратно
      if (HEYS.App?.enableSwipe) {
        HEYS.App.enableSwipe();
      }

      HEYS.Widgets.emit('editmode:exit');
    },

    toggleEditMode() {
      if (this._editMode) {
        this.exitEditMode();
      } else {
        this.enterEditMode();
      }
    }
  };

  // === Grid Engine ===
  const gridEngine = {
    COLS: GRID_COLS,

    /**
     * Найти свободную позицию для виджета
     * @param {number} cols - Ширина виджета
     * @param {number} rows - Высота виджета
     * @returns {Object} { col, row }
     */
    findFreePosition(cols, rows, excludeId = null) {
      const widgets = state.getWidgets();
      const occupiedCells = this.getOccupiedCells(widgets, excludeId);

      // Ищем первую свободную позицию сверху вниз, слева направо
      for (let row = 0; row < 100; row++) {
        for (let col = 0; col <= GRID_COLS - cols; col++) {
          if (this.canPlace(col, row, cols, rows, occupiedCells)) {
            return { col, row };
          }
        }
      }

      // Fallback: добавляем в конец
      const maxRow = Math.max(0, ...widgets.map(w => {
        const sizeInfo = HEYS.Widgets.registry.getSize(w.size);
        const wRows = sizeInfo?.rows || w.rows || 1;
        return w.position.row + wRows;
      }));
      return { col: 0, row: maxRow };
    },

    /**
     * 🆕 Найти все виджеты, которые пересекаются с заданным прямоугольником
     * @param {string} excludeId - ID виджета для исключения
     * @param {Object} rect - { col, row, cols, rows }
     * @returns {Object[]} массив пересекающихся виджетов
     */
    getCollidingWidgets(excludeId, rect) {
      const widgets = state.getWidgets();
      const colliding = [];

      const aLeft = rect.col;
      const aTop = rect.row;
      const aRight = rect.col + rect.cols;
      const aBottom = rect.row + rect.rows;

      for (const other of widgets) {
        if (!other || other.id === excludeId) continue;

        // 🔧 FIX: Получаем размер из registry
        const otherSizeInfo = HEYS.Widgets.registry.getSize(other.size);
        const otherCols = otherSizeInfo?.cols || other.cols || 1;
        const otherRows = otherSizeInfo?.rows || other.rows || 1;

        const bLeft = other.position.col;
        const bTop = other.position.row;
        const bRight = other.position.col + otherCols;
        const bBottom = other.position.row + otherRows;

        const overlap = aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
        if (overlap) {
          colliding.push(other);
        }
      }

      return colliding;
    },

    /**
     * 🆕 Вытеснить перекрывающиеся виджеты на свободные места
     * Вызывается после move/resize чтобы гарантировать отсутствие наложений
     * @param {string} priorityWidgetId - ID виджета который остаётся на месте
     * @param {number} depth - глубина рекурсии для защиты от бесконечного цикла
     * @returns {boolean} true если были вытеснения
     */
    displaceCollidingWidgets(priorityWidgetId, depth = 0) {
      // 🔧 FIX v1.3.1: Защита от бесконечной рекурсии
      if (depth > 10) {
        warn('GridEngine ⚠️ Max recursion depth reached, stopping displacement');
        return false;
      }

      const priorityWidget = state.getWidget(priorityWidgetId);
      if (!priorityWidget) return false;

      // 🔧 FIX: Получаем размер из registry
      const prioritySizeInfo = HEYS.Widgets.registry.getSize(priorityWidget.size);
      const priorityCols = prioritySizeInfo?.cols || priorityWidget.cols || 1;
      const priorityRows = prioritySizeInfo?.rows || priorityWidget.rows || 1;

      const rect = {
        col: priorityWidget.position.col,
        row: priorityWidget.position.row,
        cols: priorityCols,
        rows: priorityRows
      };

      log(`[GridEngine] displaceCollidingWidgets called for ${priorityWidgetId}`, rect);

      const colliding = this.getCollidingWidgets(priorityWidgetId, rect);
      log(`[GridEngine] Found ${colliding.length} colliding widgets:`, colliding.map(w => w.id));

      if (colliding.length === 0) return false;

      // Сортируем по размеру (меньшие первыми — их проще разместить)
      colliding.sort((a, b) => {
        const aSizeInfo = HEYS.Widgets.registry.getSize(a.size);
        const bSizeInfo = HEYS.Widgets.registry.getSize(b.size);
        const aArea = (aSizeInfo?.cols || a.cols || 1) * (aSizeInfo?.rows || a.rows || 1);
        const bArea = (bSizeInfo?.cols || b.cols || 1) * (bSizeInfo?.rows || b.rows || 1);
        return aArea - bArea;
      });

      let displaced = false;
      const movedWidgets = new Set(); // Отслеживаем перемещённые виджеты

      for (const widget of colliding) {
        // 🔧 FIX: Получаем размер из registry для вытесняемого виджета
        const sizeInfo = HEYS.Widgets.registry.getSize(widget.size);
        const wCols = sizeInfo?.cols || widget.cols || 1;
        const wRows = sizeInfo?.rows || widget.rows || 1;

        // 🔧 FIX v1.3.1: Исключаем ТОЛЬКО перемещаемый виджет, а НЕ приоритетный!
        // Приоритетный виджет должен оставаться "занятым", чтобы не размещать на нём
        const freePos = this.findFreePositionExcluding(wCols, wRows, [widget.id]);
        if (freePos) {
          log(`[GridEngine] Moving ${widget.id} from (${widget.position.col},${widget.position.row}) to (${freePos.col},${freePos.row})`);
          state.updateWidget(widget.id, { position: freePos }, true);
          displaced = true;
          movedWidgets.add(widget.id);

          // 🔧 FIX v1.3.1: После перемещения проверяем, не создали ли мы новую коллизию
          // Рекурсивно вытесняем виджеты, с которыми теперь пересекается перемещённый
          this.displaceCollidingWidgets(widget.id, depth + 1);
        } else {
          warn(`GridEngine ⚠️ No free position for ${widget.id} (${wCols}x${wRows}), will overlap!`);
        }
      }

      return displaced;
    },

    /**
     * 🆕 Найти свободное место, исключая несколько виджетов из расчёта occupied
     * @param {number} cols
     * @param {number} rows
     * @param {string[]} excludeIds - массив ID для исключения
     * @returns {Object} { col, row }
     */
    findFreePositionExcluding(cols, rows, excludeIds = []) {
      const widgets = state.getWidgets();
      const occupiedCells = new Set();

      // Собираем занятые ячейки, исключая указанные виджеты
      widgets.forEach(widget => {
        if (excludeIds.includes(widget.id)) return;

        // 🔧 FIX: Получаем размер из registry
        const sizeInfo = HEYS.Widgets.registry.getSize(widget.size);
        const wCols = sizeInfo?.cols || widget.cols || 1;
        const wRows = sizeInfo?.rows || widget.rows || 1;

        for (let c = 0; c < wCols; c++) {
          for (let r = 0; r < wRows; r++) {
            occupiedCells.add(`${widget.position.col + c},${widget.position.row + r}`);
          }
        }
      });

      // Ищем первую свободную позицию сверху вниз, слева направо
      for (let row = 0; row < 100; row++) {
        for (let col = 0; col <= GRID_COLS - cols; col++) {
          if (this.canPlace(col, row, cols, rows, occupiedCells)) {
            return { col, row };
          }
        }
      }

      // Fallback: добавляем в конец
      const maxRow = Math.max(0, ...widgets.map(w => {
        const sizeInfo = HEYS.Widgets.registry.getSize(w.size);
        const wRows = sizeInfo?.rows || w.rows || 1;
        return w.position.row + wRows;
      }));
      return { col: 0, row: maxRow };
    },

    /**
     * Получить занятые ячейки
     * @param {Object[]} widgets
     * @param {string} excludeId - ID виджета для исключения
     * @returns {Set<string>}
     */
    getOccupiedCells(widgets, excludeId = null) {
      const cells = new Set();

      widgets.forEach(widget => {
        if (widget.id === excludeId) return;

        // 🔧 FIX: Получаем размер из registry — единственный источник правды
        const sizeInfo = HEYS.Widgets.registry.getSize(widget.size);
        const cols = sizeInfo?.cols || widget.cols || 1;
        const rows = sizeInfo?.rows || widget.rows || 1;

        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            cells.add(`${widget.position.col + c},${widget.position.row + r}`);
          }
        }
      });

      return cells;
    },

    /**
     * Проверить, можно ли разместить виджет
     * @param {number} col
     * @param {number} row
     * @param {number} cols
     * @param {number} rows
     * @param {Set<string>} occupiedCells
     * @returns {boolean}
     */
    canPlace(col, row, cols, rows, occupiedCells) {
      // Проверяем границы грида
      if (col < 0 || col + cols > GRID_COLS) return false;
      if (row < 0) return false;

      // Проверяем пересечения
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (occupiedCells.has(`${col + c},${row + r}`)) {
            return false;
          }
        }
      }

      return true;
    },

    /**
     * Валидировать позицию виджета
     * @param {string} widgetId
     * @param {Object} position
     * @returns {boolean}
     */
    validatePosition(widgetId, position) {
      const widget = state.getWidget(widgetId);
      if (!widget) return false;

      // 🔧 FIX: Получаем размер из registry — единственный источник правды
      const sizeInfo = HEYS.Widgets.registry.getSize(widget.size);
      const cols = sizeInfo?.cols || widget.cols || 1;
      const rows = sizeInfo?.rows || widget.rows || 1;

      const occupiedCells = this.getOccupiedCells(state.getWidgets(), widgetId);
      return this.canPlace(position.col, position.row, cols, rows, occupiedCells);
    },

    /**
     * Найти виджет, который пересекается с прямоугольником виджета widgetId,
     * если тот поставить в position.
     * @param {string} widgetId
     * @param {Object} position - { col, row }
     * @returns {Object|null}
     */
    getCollidingWidget(widgetId, position) {
      const widget = state.getWidget(widgetId);
      if (!widget) return null;

      // 🔧 FIX: Получаем размер из registry
      const sizeInfo = HEYS.Widgets.registry.getSize(widget.size);
      const widgetCols = sizeInfo?.cols || widget.cols || 1;
      const widgetRows = sizeInfo?.rows || widget.rows || 1;

      const aLeft = position.col;
      const aTop = position.row;
      const aRight = position.col + widgetCols;
      const aBottom = position.row + widgetRows;

      const widgets = state.getWidgets();
      for (const other of widgets) {
        if (!other || other.id === widgetId) continue;

        // 🔧 FIX: Получаем размер КАЖДОГО виджета из registry
        const otherSizeInfo = HEYS.Widgets.registry.getSize(other.size);
        const otherCols = otherSizeInfo?.cols || other.cols || 1;
        const otherRows = otherSizeInfo?.rows || other.rows || 1;

        const bLeft = other.position.col;
        const bTop = other.position.row;
        const bRight = other.position.col + otherCols;
        const bBottom = other.position.row + otherRows;

        const overlap = aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
        if (overlap) return other;
      }

      return null;
    },

    /**
     * 🆕 iOS-like reflow: пробуем поставить виджет в position, а остальные
     * перепаковать так, чтобы не было коллизий.
     *
     * Это НЕ свободное позиционирование — сетка всё ещё grid-based, но drop
     * теперь возможен "в занятое место" (остальные сдвинутся).
     *
     * @param {string} draggedId
     * @param {{col:number,row:number}} position
     * @returns {Record<string,{col:number,row:number}>|null}
     */
    computeReflowLayout(draggedId, position) {
      const dragged = state.getWidget(draggedId);
      if (!dragged) return null;

      // 🔧 FIX: Получаем размер из registry
      const draggedSizeInfo = HEYS.Widgets.registry.getSize(dragged.size);
      const draggedCols = draggedSizeInfo?.cols || dragged.cols || 1;
      const draggedRows = draggedSizeInfo?.rows || dragged.rows || 1;

      // Нормализуем target позицию под ширину виджета и текущую высоту
      const currentHeight = this.getGridHeight();
      const target = {
        col: Math.max(0, Math.min(position.col || 0, GRID_COLS - draggedCols)),
        row: Math.max(0, Math.min(position.row || 0, currentHeight + 6))
      };

      // Список остальных виджетов в текущем визуальном порядке
      const others = state.getWidgets()
        .filter(w => w && w.id !== draggedId)
        .sort((a, b) => {
          if (a.position.row !== b.position.row) return a.position.row - b.position.row;
          return a.position.col - b.position.col;
        });

      const positions = {};
      const occupied = new Set();

      const occupy = (wId, col, row, cols, rows) => {
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            occupied.add(`${col + c},${row + r}`);
          }
        }
      };

      // Ставим dragged на target (даже если там было занято)
      positions[draggedId] = target;
      occupy(draggedId, target.col, target.row, draggedCols, draggedRows);

      // Функция поиска первого доступного слота
      const findSlot = (w) => {
        // 🔧 FIX: Получаем размер из registry
        const wSizeInfo = HEYS.Widgets.registry.getSize(w.size);
        const wCols = wSizeInfo?.cols || w.cols || 1;
        const wRows = wSizeInfo?.rows || w.rows || 1;

        for (let row = 0; row < 120; row++) {
          for (let col = 0; col <= GRID_COLS - wCols; col++) {
            if (this.canPlace(col, row, wCols, wRows, occupied)) {
              return { col, row, cols: wCols, rows: wRows };
            }
          }
        }
        return null;
      };

      // Упаковываем остальных
      for (const w of others) {
        const slot = findSlot(w);
        if (!slot) return null;
        positions[w.id] = { col: slot.col, row: slot.row };
        occupy(w.id, slot.col, slot.row, slot.cols, slot.rows);
      }

      return positions;
    },

    /**
     * Компактизировать layout (убрать пустые строки)
     */
    compact() {
      const widgets = state.getWidgets();

      // Сортируем по row, потом по col
      widgets.sort((a, b) => {
        if (a.position.row !== b.position.row) {
          return a.position.row - b.position.row;
        }
        return a.position.col - b.position.col;
      });

      // Перемещаем каждый виджет как можно выше
      widgets.forEach(widget => {
        let bestRow = 0;
        const occupiedCells = this.getOccupiedCells(widgets, widget.id);

        // 🔧 FIX: Получаем размер из registry
        const sizeInfo = HEYS.Widgets.registry.getSize(widget.size);
        const wCols = sizeInfo?.cols || widget.cols || 1;
        const wRows = sizeInfo?.rows || widget.rows || 1;

        while (!this.canPlace(widget.position.col, bestRow, wCols, wRows, occupiedCells)) {
          bestRow++;
          if (bestRow > 100) break; // Safety limit
        }

        if (bestRow < widget.position.row) {
          widget.position.row = bestRow;
        }
      });

      state.saveLayout();
      HEYS.Widgets.emit('layout:changed', { layout: widgets });
    },

    /**
     * Получить высоту грида (количество строк)
     * @returns {number}
     */
    getGridHeight() {
      const widgets = state.getWidgets();
      if (widgets.length === 0) return 1;
      return Math.max(...widgets.map(w => {
        // 🔧 FIX: Получаем размер из registry
        const sizeInfo = HEYS.Widgets.registry.getSize(w.size);
        const wRows = sizeInfo?.rows || w.rows || 1;
        return w.position.row + wRows;
      }));
    },

    /**
     * Получить размеры ячейки grid
     * @returns {Object} { cellWidth, cellHeight, gap }
     */
    getCellMetrics() {
      const grid = document.querySelector('.widgets-grid');
      if (!grid) {
        return { cellWidth: 150, cellHeight: CELL_HEIGHT_PX, gap: CELL_GAP_PX };
      }

      const rect = grid.getBoundingClientRect();

      // Считываем реальные значения из CSS variables (поддержка responsive)
      const cs = window.getComputedStyle(grid);
      const gapVar = parseFloat(cs.getPropertyValue('--widget-grid-gap'));
      const rowVar = parseFloat(cs.getPropertyValue('--widget-row-height'));
      const gap = Number.isFinite(gapVar) ? gapVar : CELL_GAP_PX;
      const cellHeight = Number.isFinite(rowVar) ? rowVar : CELL_HEIGHT_PX;

      const cellWidth = (rect.width - gap * (GRID_COLS - 1)) / GRID_COLS;

      return { cellWidth, cellHeight, gap };
    },

    /**
     * Координаты пикселей → grid position
     * @param {number} x - координата X относительно grid
     * @param {number} y - координата Y относительно grid
     * @returns {Object} { col, row }
     */
    pixelsToGrid(x, y) {
      const { cellWidth, cellHeight, gap } = this.getCellMetrics();

      const col = Math.floor(x / (cellWidth + gap));
      const row = Math.floor(y / (cellHeight + gap));

      return {
        col: Math.max(0, Math.min(col, GRID_COLS - 1)),
        row: Math.max(0, row)
      };
    },

    /**
     * Grid position → координаты пикселей (верхний левый угол)
     * @param {number} col
     * @param {number} row
     * @returns {Object} { x, y }
     */
    gridToPixels(col, row) {
      const { cellWidth, cellHeight, gap } = this.getCellMetrics();

      return {
        x: col * (cellWidth + gap),
        y: row * (cellHeight + gap)
      };
    }
  };

  // === Enhanced Drag & Drop Manager with Ghost & Placeholder ===
  const dnd = {
    _dragging: false,
    _draggedWidget: null,
    _startPos: null,
    _currentPos: null,
    _startGridPos: null,
    _ghostElement: null,
    _placeholderElement: null,
    _longPressTimer: null,
    _longPressTriggered: false,
    _lastValidPosition: null,
    _originalElement: null,
    _dropIntent: null,
    _scrollIntent: false,
    _touchDragReadyAt: 0,

    /**
     * Обработка начала касания/клика (для long press detection)
     * @param {string} widgetId
     * @param {Object} event
     */
    handlePointerDown(widgetId, event) {
      // CRITICAL: Если resize активен — НЕ начинаем DnD
      if (this._resizeActive) {
        console.info('[HEYS.dnd] ⛔ pointerDown BLOCKED: resizeActive', { widgetId });
        return;
      }

      // CRITICAL: Если клик по resize handle — НЕ начинаем DnD
      const t = event?.target;
      if (t && typeof t.closest === 'function') {
        if (t.closest('.widget__resize-handle')) {
          console.info('[HEYS.dnd] ⛔ pointerDown BLOCKED: resize-handle target', { widgetId });
          return;
        }
      }

      // Фиксируем стартовую позицию для отмены long press при движении
      this._startPos = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };
      this._scrollIntent = false;
      const isTouchEvent = !!(event?.touches || event?.changedTouches || event?.pointerType === 'touch');
      // Touch grace: даём жесту шанс стать нативным scroll до старта drag.
      this._touchDragReadyAt = isTouchEvent ? (Date.now() + 140) : 0;

      console.info('[HEYS.dnd] 👇 pointerDown', { widgetId, isEditMode: state.isEditMode(), isTouchEvent, pointerType: event?.pointerType, tagName: t?.tagName, targetClass: t?.className?.substring?.(0, 60) });

      // Если уже в edit mode — сразу начинаем drag
      if (state.isEditMode()) {
        this._prepareForDrag(widgetId, event);
        return;
      }

      // Иначе — запускаем таймер long press для входа в edit mode
      this._longPressTriggered = false;
      this._longPressTimer = setTimeout(() => {
        this._longPressTriggered = true;
        state.enterEditMode();

        // Вибрация при входе в edit mode
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        HEYS.Widgets.emit('editmode:longpress', { widgetId });
      }, LONG_PRESS_MS);
    },

    /**
     * Обработка окончания касания/клика
     * @param {string} widgetId
     * @param {Object} event
     */
    handlePointerUp(widgetId, event) {
      // Поддержка вызова как handlePointerUp(event) из глобальных listeners
      if (widgetId && typeof widgetId === 'object' && !event) {
        event = widgetId;
        widgetId = null;
      }

      // Отменяем long press timer если не сработал
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }

      // Если drag активен — завершаем
      if (this._dragging) {
        this.end(event);
        return;
      }

      // Если drag не стартовал, но был подготовлен (_prepareForDrag),
      // обязательно чистим listeners/состояние.
      if (this._draggedWidget) {
        this._cleanup();
      }
    },

    /**
     * Отмена long press при движении
     */
    handlePointerMove(event) {
      // CRITICAL: Если resize активен — НЕ обрабатываем move для DnD
      if (this._resizeActive) {
        return;
      }

      // Если уже распознали намерение скролла (touch) — не перехватываем жесты
      if (this._scrollIntent) {
        return; // quiet - слишком часто
      }

      // На iOS/Safari без preventDefault страница может скроллиться и ломать drag
      if (this._dragging && event && event.cancelable) {
        event.preventDefault();
      }

      // Scroll intent cancel: только вне edit-mode — в edit-mode пользователь
      // тянет виджеты в любом направлении, scrollIntent не нужен.
      if (this._draggedWidget && !this._dragging && !state.isEditMode()) {
        const cx = event.clientX || event.touches?.[0]?.clientX || 0;
        const cy = event.clientY || event.touches?.[0]?.clientY || 0;
        const dx = Math.abs(cx - (this._startPos?.x || 0));
        const dy = Math.abs(cy - (this._startPos?.y || 0));

        if (dy > 10 && dy > dx * 1.15) {
          console.info('[HEYS.dnd] 📜 scrollIntent: vertical swipe detected, cancelling drag', { widgetId: this._draggedWidget?.id, dx: dx.toFixed(1), dy: dy.toFixed(1) });
          this._scrollIntent = true;
          return;
        }
      }

      // Если двигаемся во время ожидания long press — отменяем
      if (this._longPressTimer && !this._dragging) {
        const dx = Math.abs((event.clientX || event.touches?.[0]?.clientX || 0) - (this._startPos?.x || 0));
        const dy = Math.abs((event.clientY || event.touches?.[0]?.clientY || 0) - (this._startPos?.y || 0));

        // Если сдвинулись больше чем на 10px — отменяем long press
        if (dx > 10 || dy > 10) {
          clearTimeout(this._longPressTimer);
          this._longPressTimer = null;
        }
      }

      // Если drag активен — двигаем
      // Важно: move() сам стартует drag после порога (5px) — поэтому вызываем
      // его и до фактического старта, когда _draggedWidget уже задан.
      if (this._draggedWidget) {
        this.move(event);
      }
    },

    /**
     * Подготовка к drag (когда уже в edit mode)
     * @private
     */
    _prepareForDrag(widgetId, event) {
      // CRITICAL: Если resize активен — НЕ начинаем drag
      if (this._resizeActive) {
        return;
      }

      const widget = state.getWidget(widgetId);
      if (!widget) {
        console.warn('[HEYS.dnd] ⚠️ _prepareForDrag: widget not found in state!', { widgetId });
        return;
      }
      console.info('[HEYS.dnd] ✅ _prepareForDrag', { widgetId, widgetType: widget.type, size: widget.size });

      this._draggedWidget = widget;
      this._startPos = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };
      this._currentPos = { ...this._startPos };
      this._startGridPos = { ...widget.position };
      this._lastValidPosition = { ...widget.position };

      // Находим оригинальный элемент
      this._originalElement = document.querySelector(`[data-widget-id="${widgetId}"]`);

      // Добавляем listeners на document для отслеживания движения и отпускания
      this._boundMove = (e) => this.handlePointerMove(e);
      this._boundUp = (e) => this.handlePointerUp(widgetId, e);

      document.addEventListener('pointermove', this._boundMove);
      document.addEventListener('pointerup', this._boundUp);
      // touchmove НЕ добавляем здесь — он добавляется в start() только когда drag реально стартует.
      // Пассивный drag-phase listener не нужен и блокирует нативный скролл до старта.
      document.addEventListener('touchend', this._boundUp);
    },

    /**
     * Удаление document listeners
     * @private
     */
    _removeDocumentListeners() {
      if (this._boundMove) {
        document.removeEventListener('pointermove', this._boundMove);
        document.removeEventListener('touchmove', this._boundMove);
      }
      if (this._boundUp) {
        document.removeEventListener('pointerup', this._boundUp);
        document.removeEventListener('touchend', this._boundUp);
      }
      this._boundMove = null;
      this._boundUp = null;
    },

    /**
     * Начать drag (вызывается после небольшого движения)
     * @param {string} widgetId
     * @param {Object} event
     */
    start(widgetId, event) {
      if (!state.isEditMode()) return;

      // CRITICAL: Если resize активен — НЕ начинаем drag
      if (this._resizeActive) {
        return;
      }

      const widget = state.getWidget(widgetId);
      if (!widget) return;

      this._dragging = true;
      this._draggedWidget = widget;
      this._dropIntent = null;

      // Теперь drag реально стартовал — добавляем non-passive touchmove, чтобы
      // предотвратить скролл страницы во время активного перетаскивания виджета.
      if (this._boundMove) {
        document.addEventListener('touchmove', this._boundMove, { passive: false });
      }

      if (!this._startPos) {
        this._startPos = {
          x: event.clientX || event.touches?.[0]?.clientX || 0,
          y: event.clientY || event.touches?.[0]?.clientY || 0
        };
      }
      this._currentPos = { ...this._startPos };
      this._startGridPos = { ...widget.position };
      this._lastValidPosition = { ...widget.position };

      // Создаём ghost element
      this._createGhost(widget, event);

      // Создаём placeholder
      this._createPlaceholder(widget);

      // Скрываем оригинальный элемент
      this._originalElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
      if (this._originalElement) {
        this._originalElement.classList.add('widget--dragging');
        this._originalElement.style.opacity = '0.3';
      }

      // Вибрация при начале drag
      if (navigator.vibrate) {
        navigator.vibrate(15);
      }

      HEYS.Widgets.emit('dnd:start', { widget });
    },

    /**
     * Создать ghost element (полупрозрачная копия)
     * @private
     */
    _createGhost(widget, event) {
      // Удаляем старый ghost если есть
      this._removeGhost();

      const original = document.querySelector(`[data-widget-id="${widget.id}"]`);
      if (!original) return;

      // Клонируем элемент
      const ghost = original.cloneNode(true);
      ghost.classList.add('widget-ghost');
      ghost.removeAttribute('data-widget-id');
      ghost.style.cssText = `
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        opacity: 0.8;
        transform: scale(1.02);
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        transition: none;
        width: ${original.offsetWidth}px;
        height: ${original.offsetHeight}px;
      `;

      // Позиционируем ghost под курсором
      const x = event.clientX || event.touches?.[0]?.clientX || 0;
      const y = event.clientY || event.touches?.[0]?.clientY || 0;
      ghost.style.left = `${x - original.offsetWidth / 2}px`;
      ghost.style.top = `${y - original.offsetHeight / 2}px`;

      document.body.appendChild(ghost);
      this._ghostElement = ghost;
    },

    /**
     * Создать placeholder (визуальное место для drop)
     * @private
     */
    _createPlaceholder(widget) {
      // Удаляем старый placeholder если есть
      this._removePlaceholder();

      const grid = document.querySelector('.widgets-grid');
      if (!grid) return;

      const placeholder = document.createElement('div');
      placeholder.className = 'widget-placeholder';
      // Визуал — в CSS (.widget-placeholder). Здесь задаём только grid-геометрию.
      placeholder.style.transition = 'all 0.15s ease-out';

      // Сохраняем размер виджета для placeholder (важно сделать ДО updatePlaceholderPosition)
      // 🔧 FIX: нормализуем sizeId (поддержка legacy id и символа "×")
      const reg = HEYS.Widgets.registry;
      const normalizedSize = reg?.normalizeSizeId ? (reg.normalizeSizeId(widget?.size) || widget?.size) : widget?.size;
      const sizeInfo = reg?.getSize?.(normalizedSize) || reg?.getSize?.(widget?.size);
      this._placeholderCols = sizeInfo?.cols || widget?.cols || 1;
      this._placeholderRows = sizeInfo?.rows || widget?.rows || 1;

      // 🔍 DEBUG: Проверяем какой размер используется для placeholder
      log('[DnD] _createPlaceholder:', {
        widgetId: widget?.id,
        widgetSize: widget?.size,
        widgetCols: widget?.cols,
        widgetRows: widget?.rows,
        normalizedSize,
        sizeInfo,
        placeholderCols: this._placeholderCols,
        placeholderRows: this._placeholderRows
      });

      // Привязываем placeholder и ставим в нужную grid-позицию
      this._placeholderElement = placeholder;
      this._updatePlaceholderPosition(widget.position);

      grid.appendChild(placeholder);
    },

    /**
     * Обновить позицию placeholder
     * @private
     */
    _updatePlaceholderPosition(position) {
      if (!this._placeholderElement) return;

      // Важно: в некоторых браузерах (особенно iOS Safari) раздельная установка
      // gridColumnStart после шортхенда может сбрасывать span. Поэтому задаём
      // полные значения (start + span) каждый раз.
      // Используем сохранённые размеры или fallback на _draggedWidget
      const cols = this._placeholderCols || this._draggedWidget?.cols || 1;
      const rows = this._placeholderRows || this._draggedWidget?.rows || 1;
      const c = (position?.col || 0) + 1;
      const r = (position?.row || 0) + 1;

      this._placeholderElement.style.gridColumn = `${c} / span ${cols}`;
      this._placeholderElement.style.gridRow = `${r} / span ${rows}`;
    },

    /**
     * Движение drag
     * @param {Object} event
     */
    move(event) {
      if (!this._draggedWidget) return;

      // Если drag ещё не начался — проверяем порог движения
      if (!this._dragging) {
        const isTouchEvent = !!(event?.touches || event?.changedTouches || event?.pointerType === 'touch');

        // Для touch: не стартуем drag мгновенно, чтобы свайп вверх/вниз
        // всегда оставался прокруткой.
        if (isTouchEvent && this._touchDragReadyAt && Date.now() < this._touchDragReadyAt) {
          return; // grace period
        }

        const dx = Math.abs((event.clientX || event.touches?.[0]?.clientX || 0) - this._startPos.x);
        const dy = Math.abs((event.clientY || event.touches?.[0]?.clientY || 0) - this._startPos.y);

        const dragThreshold = isTouchEvent ? 14 : 5;
        console.info('[HEYS.dnd] 📐 move threshold check', { widgetId: this._draggedWidget?.id, dx: dx.toFixed(1), dy: dy.toFixed(1), threshold: dragThreshold, willStart: dx > dragThreshold || dy > dragThreshold });

        // На touch ждём более уверенное движение, чтобы не ломать вертикальный скролл.
        if (dx > dragThreshold || dy > dragThreshold) {
          this.start(this._draggedWidget.id, event);
        }
        return;
      }

      this._currentPos = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };

      // Двигаем ghost
      if (this._ghostElement) {
        const original = this._originalElement;
        const width = original ? original.offsetWidth : 150;
        const height = original ? original.offsetHeight : 140;

        this._ghostElement.style.left = `${this._currentPos.x - width / 2}px`;
        this._ghostElement.style.top = `${this._currentPos.y - height / 2}px`;
      }

      // Вычисляем новую grid позицию
      const grid = document.querySelector('.widgets-grid');
      if (grid) {
        const rect = grid.getBoundingClientRect();
        const relX = this._currentPos.x - rect.left;
        const relY = this._currentPos.y - rect.top;

        const newGridPos = gridEngine.pixelsToGrid(relX, relY);

        // 🔧 FIX: Получаем размер из registry (через normalize)
        const reg = HEYS.Widgets.registry;
        const normalizedDraggedSize = reg?.normalizeSizeId
          ? (reg.normalizeSizeId(this._draggedWidget?.size) || this._draggedWidget?.size)
          : this._draggedWidget?.size;
        const draggedSizeInfo = reg?.getSize?.(normalizedDraggedSize) || reg?.getSize?.(this._draggedWidget?.size);
        const draggedCols = draggedSizeInfo?.cols || this._draggedWidget?.cols || 1;
        const draggedRows = draggedSizeInfo?.rows || this._draggedWidget?.rows || 1;

        // Ограничиваем позицию с учётом размера виджета
        newGridPos.col = Math.min(newGridPos.col, GRID_COLS - draggedCols);

        // Проверяем валидность (пустое место) или swap (занято, но можно поменяться местами)
        const isValid = gridEngine.validatePosition(this._draggedWidget.id, newGridPos);
        let swapWith = null;
        if (!isValid) {
          const colliding = gridEngine.getCollidingWidget(this._draggedWidget.id, newGridPos);
          if (colliding) {
            // 🔧 FIX: Получаем размеры обоих виджетов из registry для сравнения (через normalize)
            const reg = HEYS.Widgets.registry;
            const normalizedCollidingSize = reg?.normalizeSizeId ? (reg.normalizeSizeId(colliding?.size) || colliding?.size) : colliding?.size;
            const collidingSizeInfo = reg?.getSize?.(normalizedCollidingSize) || reg?.getSize?.(colliding?.size);
            const collidingCols = collidingSizeInfo?.cols || colliding?.cols || 1;
            const collidingRows = collidingSizeInfo?.rows || colliding?.rows || 1;

            if (collidingCols === draggedCols && collidingRows === draggedRows) {
              swapWith = colliding;
            }
          }
        }

        // 🆕 Если ни move ни swap — пробуем reflow (авто-сдвиг остальных)
        let reflowPositions = null;
        if (!isValid && !swapWith) {
          reflowPositions = gridEngine.computeReflowLayout(this._draggedWidget.id, newGridPos);
        }

        if (isValid || swapWith || reflowPositions) {
          this._lastValidPosition = newGridPos;
          this._dropIntent = reflowPositions
            ? { type: 'reflow', position: newGridPos, positionsById: reflowPositions }
            : (swapWith
              ? { type: 'swap', position: newGridPos, swapWithId: swapWith.id }
              : { type: 'move', position: newGridPos });

          this._updatePlaceholderPosition(newGridPos);

          if (this._placeholderElement) {
            this._placeholderElement.classList.remove('widget-placeholder--invalid');
            this._placeholderElement.classList.add('widget-placeholder--valid');
            if (reflowPositions) {
              this._placeholderElement.classList.add('widget-placeholder--reflow');
              this._placeholderElement.classList.remove('widget-placeholder--swap');
            } else if (swapWith) {
              this._placeholderElement.classList.add('widget-placeholder--swap');
              this._placeholderElement.classList.remove('widget-placeholder--reflow');
            } else {
              this._placeholderElement.classList.remove('widget-placeholder--swap');
              this._placeholderElement.classList.remove('widget-placeholder--reflow');
            }
          }
        } else {
          this._dropIntent = null;
          if (this._placeholderElement) {
            this._placeholderElement.classList.remove('widget-placeholder--valid');
            this._placeholderElement.classList.remove('widget-placeholder--swap');
            this._placeholderElement.classList.remove('widget-placeholder--reflow');
            this._placeholderElement.classList.add('widget-placeholder--invalid');
          }
        }
      }

      HEYS.Widgets.emit('dnd:move', {
        widget: this._draggedWidget,
        x: this._currentPos.x,
        y: this._currentPos.y,
        gridPosition: this._lastValidPosition
      });
    },

    /**
     * Завершить drag (drop)
     * @param {Object} event
     */
    end(event) {
      if (!this._draggedWidget) {
        this._cleanup();
        return;
      }

      const hadDrag = this._dragging;

      // Удаляем ghost и placeholder ДО восстановления оригинала
      this._removeGhost();
      this._removePlaceholder();

      // Восстанавливаем оригинальный элемент
      if (this._originalElement) {
        this._originalElement.classList.remove('widget--dragging');

        // FIX: Перед тем как сделать элемент снова видимым, ставим inline grid-позицию
        // на новое место — иначе между восстановлением opacity и React re-render
        // виджет на 1-2 кадра виден на старой позиции (визуальный "отпрыг" назад).
        if (hadDrag && this._dropIntent?.position) {
          const widget = this._draggedWidget;
          const reg = HEYS.Widgets.registry;
          const normSize = reg?.normalizeSizeId ? (reg.normalizeSizeId(widget?.size) || widget?.size) : widget?.size;
          const sizeInfo = reg?.getSize?.(normSize) || reg?.getSize?.(widget?.size);
          const cols = sizeInfo?.cols || widget?.cols || 1;
          const rows = sizeInfo?.rows || widget?.rows || 1;
          // Для reflow берём итоговую позицию именно этого виджета из positionsById
          const targetPos = (this._dropIntent.type === 'reflow' && this._dropIntent.positionsById?.[widget.id])
            ? this._dropIntent.positionsById[widget.id]
            : this._dropIntent.position;
          this._originalElement.style.gridColumn = `${targetPos.col + 1} / span ${cols}`;
          this._originalElement.style.gridRow = `${targetPos.row + 1} / span ${rows}`;
        }

        this._originalElement.style.opacity = '';
        this._originalElement.style.transform = '';
      }

      // Если drag был активен и есть намерение drop — применяем
      if (hadDrag && this._dropIntent && this._dropIntent.position) {
        const targetPos = this._dropIntent.position;
        const posChanged = targetPos.col !== this._startGridPos.col || targetPos.row !== this._startGridPos.row;

        if (!posChanged) {
          HEYS.Widgets.emit('dnd:cancel', { widget: this._draggedWidget });
        } else if (this._dropIntent.type === 'move' && gridEngine.validatePosition(this._draggedWidget.id, targetPos)) {
          state.moveWidget(this._draggedWidget.id, targetPos);

          if (navigator.vibrate) {
            navigator.vibrate(10);
          }

          HEYS.Widgets.emit('dnd:drop', { widget: this._draggedWidget, from: this._startGridPos, to: targetPos });
        } else if (this._dropIntent.type === 'swap' && this._dropIntent.swapWithId) {
          const swapped = state.swapWidgets(this._draggedWidget.id, this._dropIntent.swapWithId);
          if (swapped) {
            if (navigator.vibrate) {
              navigator.vibrate(10);
            }
            HEYS.Widgets.emit('dnd:swap', {
              widget: this._draggedWidget,
              with: this._dropIntent.swapWithId,
              from: this._startGridPos,
              to: targetPos
            });
          } else {
            HEYS.Widgets.emit('dnd:cancel', { widget: this._draggedWidget });
          }
        } else if (this._dropIntent.type === 'reflow' && this._dropIntent.positionsById) {
          const applied = state.applyPositions(this._dropIntent.positionsById);
          if (applied) {
            if (navigator.vibrate) {
              navigator.vibrate(10);
            }
            HEYS.Widgets.emit('dnd:reflow', {
              widget: this._draggedWidget,
              from: this._startGridPos,
              to: targetPos,
              positionsById: this._dropIntent.positionsById
            });
          } else {
            HEYS.Widgets.emit('dnd:cancel', { widget: this._draggedWidget });
          }
        } else {
          HEYS.Widgets.emit('dnd:cancel', { widget: this._draggedWidget });
        }
      }

      this._cleanup();
    },

    /**
     * Отменить drag
     */
    cancel() {
      // Восстанавливаем оригинальный элемент
      if (this._originalElement) {
        this._originalElement.classList.remove('widget--dragging');
        this._originalElement.style.opacity = '';
        this._originalElement.style.transform = '';
      }

      this._removeGhost();
      this._removePlaceholder();

      HEYS.Widgets.emit('dnd:cancel', { widget: this._draggedWidget });
      this._cleanup();
    },

    /**
     * Проверка: идёт ли drag
     * @returns {boolean}
     */
    isDragging() {
      return this._dragging;
    },

    /**
     * Удалить ghost element
     * @private
     */
    _removeGhost() {
      if (this._ghostElement) {
        this._ghostElement.remove();
        this._ghostElement = null;
      }
    },

    /**
     * Удалить placeholder
     * @private
     */
    _removePlaceholder() {
      if (this._placeholderElement) {
        this._placeholderElement.remove();
        this._placeholderElement = null;
      }
    },

    _cleanup() {
      // Убираем document listeners
      this._removeDocumentListeners();

      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._dragging = false;
      this._draggedWidget = null;
      this._startPos = null;
      this._currentPos = null;
      this._startGridPos = null;
      this._lastValidPosition = null;
      this._originalElement = null;
      this._longPressTriggered = false;
      this._dropIntent = null;
      this._scrollIntent = false;
      this._touchDragReadyAt = 0;
      // Очищаем сохранённые размеры placeholder
      this._placeholderCols = null;
      this._placeholderRows = null;
    }
  };

  // === Presets ===
  const presets = {
    _presets: {
      minimal: {
        id: 'minimal',
        name: 'Минимальный',
        description: 'Только калории и вода',
        widgets: [
          { type: 'calories', size: '2x2', position: { col: 0, row: 0 } },
          { type: 'water', size: '2x2', position: { col: 2, row: 0 } }
        ]
      },
      balanced: {
        id: 'balanced',
        name: 'Сбалансированный',
        description: 'Основные показатели',
        widgets: [
          { type: 'calories', size: '2x2', position: { col: 0, row: 0 } },
          { type: 'water', size: '2x2', position: { col: 2, row: 0 } },
          { type: 'streak', size: '2x2', position: { col: 0, row: 2 } },
          { type: 'sleep', size: '2x2', position: { col: 2, row: 2 } }
        ]
      },
      fitness: {
        id: 'fitness',
        name: 'Фитнес',
        description: 'Для активного образа жизни',
        widgets: [
          { type: 'calories', size: '4x2', position: { col: 0, row: 0 } },
          { type: 'macros', size: '4x2', position: { col: 0, row: 2 } },
          { type: 'steps', size: '2x2', position: { col: 0, row: 4 } },
          { type: 'weight', size: '2x2', position: { col: 2, row: 4 } }
        ]
      },
      detailed: {
        id: 'detailed',
        name: 'Детальный',
        description: 'Максимум информации',
        widgets: [
          { type: 'calories', size: '2x2', position: { col: 0, row: 0 } },
          { type: 'insulin', size: '2x2', position: { col: 2, row: 0 } },
          { type: 'macros', size: '4x2', position: { col: 0, row: 2 } },
          { type: 'water', size: '2x2', position: { col: 0, row: 4 } },
          { type: 'sleep', size: '2x2', position: { col: 2, row: 4 } },
          { type: 'weight', size: '4x2', position: { col: 0, row: 6 } },
          { type: 'streak', size: '2x2', position: { col: 0, row: 8 } },
          { type: 'steps', size: '2x2', position: { col: 2, row: 8 } }
        ]
      }
    },

    getAll() {
      return { ...this._presets };
    },

    get(id) {
      return this._presets[id] || null;
    },

    apply(id) {
      return state.applyPreset(id);
    }
  };

  // === Keyboard Support ===
  function setupKeyboardSupport() {
    document.addEventListener('keydown', (e) => {
      // Escape — выход из edit mode
      if (e.key === 'Escape' && state.isEditMode()) {
        e.preventDefault();
        state.exitEditMode();
      }

      // Ctrl/Cmd + Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (state.canUndo()) {
          e.preventDefault();
          state.undo();
        }
      }

      // Ctrl/Cmd + Shift + Z или Ctrl/Cmd + Y — redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        if (state.canRedo()) {
          e.preventDefault();
          state.redo();
        }
      }
    });
  }

  // Инициализация при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupKeyboardSupport);
  } else {
    setupKeyboardSupport();
  }

  // === 🆕 Save on page unload ===
  // Принудительное сохранение перед закрытием страницы
  // чтобы не потерять данные из debounced save
  window.addEventListener('beforeunload', () => {
    // 🔧 FIX: Не сохраняем если state не инициализирован
    if (!state._initialized) return;

    // Отменяем debounced timeout
    if (state._saveTimeout) {
      clearTimeout(state._saveTimeout);
      state._saveTimeout = null;
    }
    // Немедленно сохраняем
    try {
      state.saveLayout();
    } catch (e) {
      err('Failed to save on unload:', e);
    }
  });

  // Также сохраняем при visibilitychange (переключение вкладок на мобилке)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // 🔧 FIX: Не сохраняем если state не инициализирован
      if (!state._initialized) return;

      // Отменяем debounced timeout
      if (state._saveTimeout) {
        clearTimeout(state._saveTimeout);
        state._saveTimeout = null;
      }
      // Немедленно сохраняем
      try {
        state.saveLayout();
      } catch (e) {
        err('Failed to save on visibility hidden:', e);
      }
    }
  });

  // 🧩 Слушатель cloud sync — НЕ перезагружаем layout если он свежий локально
  // Это предотвращает "мерцание" виджетов после cloud sync
  window.addEventListener('heys:widget-layout-updated', (e) => {
    const { layout: cloudLayout, source } = e.detail || {};

    // Если не инициализирован — игнорируем
    if (!state._initialized) {
      return;
    }

    // Читаем текущий local layout с updatedAt
    const localRaw = state.loadLayout();
    const localUpdatedAt = (() => {
      try {
        if (HEYS.store?.get) {
          const stored = HEYS.store.get('heys_widget_layout_v1', null);
          return stored?.updatedAt || 0;
        }
        return 0;
      } catch { return 0; }
    })();

    const cloudUpdatedAt = cloudLayout?.updatedAt || 0;

    log(`Cloud sync event: localUpdatedAt=${localUpdatedAt}, cloudUpdatedAt=${cloudUpdatedAt}`);

    // Если локальный layout новее или равен — игнорируем cloud update
    if (localUpdatedAt >= cloudUpdatedAt) {
      log('Cloud update skipped: local is newer or same');
      return;
    }

    // Облачный layout новее — перезагружаем
    warn('Cloud layout is newer, reloading...');
    const widgets = cloudLayout?.widgets || (Array.isArray(cloudLayout) ? cloudLayout : []);

    if (widgets.length > 0) {
      state._widgets = widgets.map(w => state._normalizeWidget(w));
      state._autoPackWidgets();
      HEYS.Widgets.emit('layout:changed', { layout: state._widgets, source: 'cloud-sync' });
    }
  });

  // === Exports ===
  HEYS.Widgets.state = state;
  HEYS.Widgets.grid = gridEngine;
  HEYS.Widgets.dnd = dnd;
  HEYS.Widgets.presets = presets;

  // Удобные алиасы
  HEYS.Widgets.getWidgets = () => state.getWidgets();
  HEYS.Widgets.addWidget = (w) => state.addWidget(w);
  HEYS.Widgets.removeWidget = (id) => state.removeWidget(id);
  HEYS.Widgets.isEditMode = () => state.isEditMode();
  HEYS.Widgets.enterEditMode = () => state.enterEditMode();
  HEYS.Widgets.exitEditMode = () => state.exitEditMode();
  HEYS.Widgets.toggleEditMode = () => state.toggleEditMode();
  HEYS.Widgets.undo = () => state.undo();
  HEYS.Widgets.redo = () => state.redo();
  HEYS.Widgets.canUndo = () => state.canUndo();
  HEYS.Widgets.canRedo = () => state.canRedo();

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
