/**
 * heys_widgets_core_v1.js
 * Ядро виджетов: Grid Engine, Drag & Drop, State Manager
 * Version: 1.1.0 — Phase 1: Core Engine
 * Created: 2025-12-15
 * Updated: 2025-12-15
 * 
 * Phase 1 features:
 * - Undo/Redo history stack
 * - Ghost element + placeholder preview
 * - Long press detection (500ms)
 * - Improved collision detection
 * - Debounced persistence
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};
  
  // === Constants ===
  const STORAGE_KEY = 'heys_widget_layout_v1';
  const GRID_COLS = 2; // 2 колонки для мобильного
  const MAX_HISTORY = 20; // Максимум шагов undo/redo
  const SAVE_DEBOUNCE_MS = 500; // Debounce для сохранения
  const LONG_PRESS_MS = 500; // Время для long press
  const CELL_HEIGHT_PX = 140; // Высота ячейки в пикселях (для расчёта drop position)
  const CELL_GAP_PX = 12; // Gap между ячейками
  
  const DEFAULT_LAYOUT = [
    { type: 'calories', size: 'compact', position: { col: 0, row: 0 } },
    { type: 'water', size: 'compact', position: { col: 1, row: 0 } },
    { type: 'streak', size: 'compact', position: { col: 0, row: 1 } },
    { type: 'sleep', size: 'compact', position: { col: 1, row: 1 } }
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
      
      const saved = this.loadLayout();
      if (saved && Array.isArray(saved) && saved.length > 0) {
        this._widgets = saved.map(w => this._normalizeWidget(w));
      } else {
        this._widgets = this._createDefaultLayout();
      }
      
      // Очищаем историю при загрузке
      this._history = [];
      this._future = [];
      
      this._initialized = true;
      HEYS.Widgets.emit('layout:loaded', { layout: this._widgets });
      console.log('[Widgets Core] State initialized with', this._widgets.length, 'widgets');
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
        console.log('[Widgets Core] Nothing to undo');
        return false;
      }
      
      // Сохраняем текущее состояние в future
      this._future.push(JSON.parse(JSON.stringify(this._widgets)));
      
      // Восстанавливаем предыдущее состояние
      this._widgets = this._history.pop();
      this._debouncedSave();
      
      HEYS.Widgets.emit('history:undo', { layout: this._widgets });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      
      console.log('[Widgets Core] Undo performed, history:', this._history.length, 'future:', this._future.length);
      return true;
    },
    
    /**
     * Redo — повторить отменённое действие
     * @returns {boolean}
     */
    redo() {
      if (this._future.length === 0) {
        console.log('[Widgets Core] Nothing to redo');
        return false;
      }
      
      // Сохраняем текущее состояние в history
      this._history.push(JSON.parse(JSON.stringify(this._widgets)));
      
      // Восстанавливаем future состояние
      this._widgets = this._future.pop();
      this._debouncedSave();
      
      HEYS.Widgets.emit('history:redo', { layout: this._widgets });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });
      
      console.log('[Widgets Core] Redo performed, history:', this._history.length, 'future:', this._future.length);
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
      const size = registry?.getSize(w.size || type?.defaultSize || 'compact');
      
      return {
        id: w.id || `widget_${w.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: w.type,
        size: w.size || type?.defaultSize || 'compact',
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
      this._debouncedSave();
      
      HEYS.Widgets.emit('widget:added', { widget: normalized });
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
      
      const oldWidget = { ...widget, position: { ...widget.position } };
      Object.assign(widget, updates);
      
      // Обновить cols/rows если изменился size
      if (updates.size) {
        const size = HEYS.Widgets.registry?.getSize(updates.size);
        if (size) {
          widget.cols = size.cols;
          widget.rows = size.rows;
        }
      }
      
      // Обновить позицию если указана
      if (updates.position) {
        widget.position = { ...updates.position };
      }
      
      this._debouncedSave();
      
      if (updates.position) {
        HEYS.Widgets.emit('widget:moved', { widget, from: oldWidget.position, to: updates.position });
        // Вибрация при перемещении
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
      }
      if (updates.size) {
        HEYS.Widgets.emit('widget:resized', { widget, from: oldWidget.size, to: updates.size });
      }
      if (updates.settings) {
        HEYS.Widgets.emit('widget:settings', { widget, settings: updates.settings });
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
      return this.updateWidget(id, { position }, skipHistory);
    },
    
    /**
     * Изменить размер виджета
     * @param {string} id
     * @param {string} size
     */
    resizeWidget(id, size) {
      const widget = this.getWidget(id);
      if (!widget) return false;
      
      const registry = HEYS.Widgets.registry;
      if (!registry.supportsSize(widget.type, size)) {
        console.warn(`[Widgets Core] Widget ${widget.type} does not support size ${size}`);
        return false;
      }
      
      return this.updateWidget(id, { size });
    },
    
    /**
     * Сохранить layout в storage (cloud sync)
     */
    saveLayout() {
      const layoutData = this._widgets.map(w => ({
        id: w.id,
        type: w.type,
        size: w.size,
        position: w.position,
        settings: w.settings,
        createdAt: w.createdAt
      }));
      
      // Используем HEYS.store для cloud sync
      if (HEYS.store?.set) {
        HEYS.store.set(STORAGE_KEY, layoutData);
      } else if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(STORAGE_KEY, layoutData);
      } else {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutData));
        } catch (e) {
          console.error('[Widgets Core] Failed to save layout:', e);
        }
      }
      
      HEYS.Widgets.emit('layout:saved', { layout: layoutData });
    },
    
    /**
     * Загрузить layout из storage
     * @returns {Object[]|null}
     */
    loadLayout() {
      try {
        if (HEYS.store?.get) {
          return HEYS.store.get(STORAGE_KEY, null);
        } else if (HEYS.utils?.lsGet) {
          return HEYS.utils.lsGet(STORAGE_KEY, null);
        } else {
          const stored = localStorage.getItem(STORAGE_KEY);
          return stored ? JSON.parse(stored) : null;
        }
      } catch (e) {
        console.error('[Widgets Core] Failed to load layout:', e);
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
        console.warn('[Widgets Core] Unknown preset:', presetId);
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
    findFreePosition(cols, rows) {
      const widgets = state.getWidgets();
      const occupiedCells = this.getOccupiedCells(widgets);
      
      // Ищем первую свободную позицию сверху вниз, слева направо
      for (let row = 0; row < 100; row++) {
        for (let col = 0; col <= GRID_COLS - cols; col++) {
          if (this.canPlace(col, row, cols, rows, occupiedCells)) {
            return { col, row };
          }
        }
      }
      
      // Fallback: добавляем в конец
      const maxRow = Math.max(0, ...widgets.map(w => w.position.row + w.rows));
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
        
        for (let c = 0; c < widget.cols; c++) {
          for (let r = 0; r < widget.rows; r++) {
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
      
      const occupiedCells = this.getOccupiedCells(state.getWidgets(), widgetId);
      return this.canPlace(position.col, position.row, widget.cols, widget.rows, occupiedCells);
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
        
        while (!this.canPlace(widget.position.col, bestRow, widget.cols, widget.rows, occupiedCells)) {
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
      return Math.max(...widgets.map(w => w.position.row + w.rows));
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
      const cellWidth = (rect.width - CELL_GAP_PX * (GRID_COLS - 1)) / GRID_COLS;
      
      return { cellWidth, cellHeight: CELL_HEIGHT_PX, gap: CELL_GAP_PX };
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
    
    /**
     * Обработка начала касания/клика (для long press detection)
     * @param {string} widgetId
     * @param {Object} event
     */
    handlePointerDown(widgetId, event) {
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
      // Отменяем long press timer если не сработал
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }
      
      // Если drag активен — завершаем
      if (this._dragging) {
        this.end(event);
      }
    },
    
    /**
     * Отмена long press при движении
     */
    handlePointerMove(event) {
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
      if (this._dragging) {
        this.move(event);
      }
    },
    
    /**
     * Подготовка к drag (когда уже в edit mode)
     * @private
     */
    _prepareForDrag(widgetId, event) {
      const widget = state.getWidget(widgetId);
      if (!widget) return;
      
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
      document.addEventListener('touchmove', this._boundMove, { passive: false });
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
      
      const widget = state.getWidget(widgetId);
      if (!widget) return;
      
      this._dragging = true;
      this._draggedWidget = widget;
      
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
      placeholder.style.cssText = `
        grid-column: span ${widget.cols};
        grid-row: span ${widget.rows};
        background: var(--color-surface, rgba(59, 130, 246, 0.1));
        border: 2px dashed var(--color-primary, #3b82f6);
        border-radius: 16px;
        transition: all 0.2s ease;
      `;
      
      // Вставляем placeholder в нужную позицию
      this._updatePlaceholderPosition(widget.position);
      
      grid.appendChild(placeholder);
      this._placeholderElement = placeholder;
    },
    
    /**
     * Обновить позицию placeholder
     * @private
     */
    _updatePlaceholderPosition(position) {
      if (!this._placeholderElement) return;
      
      this._placeholderElement.style.gridColumnStart = position.col + 1;
      this._placeholderElement.style.gridRowStart = position.row + 1;
    },
    
    /**
     * Движение drag
     * @param {Object} event
     */
    move(event) {
      if (!this._draggedWidget) return;
      
      // Если drag ещё не начался — проверяем порог движения
      if (!this._dragging) {
        const dx = Math.abs((event.clientX || event.touches?.[0]?.clientX || 0) - this._startPos.x);
        const dy = Math.abs((event.clientY || event.touches?.[0]?.clientY || 0) - this._startPos.y);
        
        // Начинаем drag после 5px движения
        if (dx > 5 || dy > 5) {
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
        
        // Ограничиваем позицию с учётом размера виджета
        newGridPos.col = Math.min(newGridPos.col, GRID_COLS - this._draggedWidget.cols);
        
        // Проверяем валидность и обновляем placeholder
        const isValid = gridEngine.validatePosition(this._draggedWidget.id, newGridPos);
        
        if (isValid) {
          this._lastValidPosition = newGridPos;
          this._updatePlaceholderPosition(newGridPos);
          
          if (this._placeholderElement) {
            this._placeholderElement.classList.remove('widget-placeholder--invalid');
            this._placeholderElement.classList.add('widget-placeholder--valid');
          }
        } else {
          if (this._placeholderElement) {
            this._placeholderElement.classList.remove('widget-placeholder--valid');
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
      
      // Восстанавливаем оригинальный элемент
      if (this._originalElement) {
        this._originalElement.classList.remove('widget--dragging');
        this._originalElement.style.opacity = '';
        this._originalElement.style.transform = '';
      }
      
      // Удаляем ghost и placeholder
      this._removeGhost();
      this._removePlaceholder();
      
      // Если drag был активен и есть валидная позиция — применяем
      if (hadDrag && this._lastValidPosition) {
        const posChanged = 
          this._lastValidPosition.col !== this._startGridPos.col ||
          this._lastValidPosition.row !== this._startGridPos.row;
        
        if (posChanged && gridEngine.validatePosition(this._draggedWidget.id, this._lastValidPosition)) {
          state.moveWidget(this._draggedWidget.id, this._lastValidPosition);
          
          // Вибрация при успешном drop
          if (navigator.vibrate) {
            navigator.vibrate(10);
          }
          
          HEYS.Widgets.emit('dnd:drop', {
            widget: this._draggedWidget,
            from: this._startGridPos,
            to: this._lastValidPosition
          });
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
          { type: 'calories', size: 'compact', position: { col: 0, row: 0 } },
          { type: 'water', size: 'compact', position: { col: 1, row: 0 } }
        ]
      },
      balanced: {
        id: 'balanced',
        name: 'Сбалансированный',
        description: 'Основные показатели',
        widgets: [
          { type: 'calories', size: 'compact', position: { col: 0, row: 0 } },
          { type: 'water', size: 'compact', position: { col: 1, row: 0 } },
          { type: 'streak', size: 'compact', position: { col: 0, row: 1 } },
          { type: 'sleep', size: 'compact', position: { col: 1, row: 1 } }
        ]
      },
      fitness: {
        id: 'fitness',
        name: 'Фитнес',
        description: 'Для активного образа жизни',
        widgets: [
          { type: 'calories', size: 'wide', position: { col: 0, row: 0 } },
          { type: 'macros', size: 'wide', position: { col: 0, row: 1 } },
          { type: 'steps', size: 'compact', position: { col: 0, row: 2 } },
          { type: 'weight', size: 'compact', position: { col: 1, row: 2 } }
        ]
      },
      detailed: {
        id: 'detailed',
        name: 'Детальный',
        description: 'Максимум информации',
        widgets: [
          { type: 'calories', size: 'compact', position: { col: 0, row: 0 } },
          { type: 'insulin', size: 'compact', position: { col: 1, row: 0 } },
          { type: 'macros', size: 'wide', position: { col: 0, row: 1 } },
          { type: 'water', size: 'compact', position: { col: 0, row: 2 } },
          { type: 'sleep', size: 'compact', position: { col: 1, row: 2 } },
          { type: 'weight', size: 'wide', position: { col: 0, row: 3 } },
          { type: 'streak', size: 'compact', position: { col: 0, row: 4 } },
          { type: 'steps', size: 'compact', position: { col: 1, row: 4 } }
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
  
  console.log('[HEYS] Widgets Core v1.1.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
