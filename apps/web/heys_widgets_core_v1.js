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
  const LAYOUT_PRESET_VERSION = 4;
  const MAX_HISTORY = 20; // Максимум шагов undo/redo
  const SAVE_DEBOUNCE_MS = 500; // Debounce для сохранения
  // ВАЖНО: основной источник правды по высоте ряда — CSS var --widget-row-height.
  // Здесь — fallback на случай ранней инициализации до применения стилей.
  const CELL_HEIGHT_PX = 76; // fallback
  const CELL_GAP_PX = 12; // fallback
  // Автопрокрутка у края в расстановке: скорость постоянная (канвас v4, 58).
  const EDGE_SCROLL_STEP_PX = 12;
  const EDGE_SCROLL_TICK_MS = 16;
  // Бюджет экрана: 4×8 клеток (канвас home-widgets, «Бюджет экрана», 23 августа).
  const SCREEN_CELL_BUDGET = 32;
  const SCREEN_ROW_BUDGET = 8;

  /** Сколько клеток занимает одна плитка. */
  function widgetCellCount(widget) {
    if (!widget) return 0;
    const sizeInfo = HEYS.Widgets.registry?.getSize?.(widget.size);
    const cols = Math.max(1, sizeInfo?.cols || widget.cols || 1);
    const rows = Math.max(1, sizeInfo?.rows || widget.rows || 1);
    return cols * rows;
  }

  /** Сумма клеток по списку виджетов. */
  function countUsedCells(widgets) {
    return (widgets || []).reduce((sum, w) => sum + widgetCellCount(w), 0);
  }

  // Дефолтный набор — контракт home-widgets, раздел «Дефолтный набор»:
  // одиннадцать плиток в порядке чтения, у каждой назван вид. Порядок и есть
  // раскладка (своей клетки у виджета нет), поэтому позиции здесь не заданы —
  // их считает flow-укладка. Новый тип сам сюда не попадает: состав меняется
  // только вместе со строкой «состав дефолта».
  //
  // Вид задаётся settings.displayVariant явно, а не флагом isDefault каталога:
  // дефолт первого экрана не должен молча меняться от правки каталога видов.
  const DEFAULT_LAYOUT = [
    {
      type: 'calories',
      size: '2x2',
      settings: {
        displayVariant: 'hero',
        showRemaining: true,
        showPercentage: false,
        elementScales: { ring: 0.95 }
      }
    },
    {
      type: 'insulinWave',
      size: '2x2',
      settings: { displayVariant: 'day_as_is' }
    },
    {
      type: 'macros',
      size: '3x2',
      settings: {
        displayVariant: 'rings',
        showGrams: true,
        showPercentage: true,
        centerValueMode: 'pct',
        elementScales: { ring: 0.95 }
      }
    },
    {
      type: 'sleep',
      size: '1x1',
      settings: {
        displayVariant: 'mini',
        showTimes: true,
        showTarget: true,
        showQuality: true,
        elementScales: {
          badge: 2,
          icon: 2,
          value: 2
        }
      }
    },
    {
      type: 'water',
      size: '1x1',
      settings: {
        displayVariant: 'mini',
        showGlasses: false,
        showProgress: true,
        showRemaining: true,
        showPercentage: true,
        showMilliliters: true,
        elementScales: {
          icon: 1.15,
          progress: 1.05,
          value: 1.7
        }
      }
    },
    {
      type: 'steps',
      size: '2x1',
      settings: { displayVariant: 'week' }
    },
    {
      // «Как сейчас» — неделя полосами. Вид «Серия» существует только в 1×1 и
      // в дефолт не идёт: выбор вида подгоняет размер плитки под размер вида,
      // и 2×1 с видом под 1×1 поехал бы при первом открытии листа.
      type: 'heatmap',
      size: '2x1',
      settings: { displayVariant: 'week_bar' }
    },
    {
      type: 'relapseRisk',
      size: '2x2',
      settings: {
        displayVariant: 'scale',
        gaugeStrokeWidth: 30,
        showSource: true,
        showDrivers: true,
        showConfidence: false,
        showRecommendation: true
      }
    },
    {
      type: 'healthTrend',
      size: '2x2',
      settings: { displayVariant: 'spark' }
    },
    {
      type: 'weight',
      size: '2x1',
      settings: {
        displayVariant: 'number_week',
        showBmi: false,
        showGoal: false,
        showChart: false,
        showTrend: true,
        showAnalytics: false
      }
    },
    {
      // «Динамика веса», окно «за месяц» с кривой — решение владельца
      // 20 августа. Вид с переключателем 7 / 14 / 30 в дефолт не идёт.
      type: 'crashRisk',
      size: '2x1',
      settings: { displayVariant: 'curve' }
    }
  ];

  // Уменьшить состав раскладки может только названная операция. Всё остальное —
  // молчаливая потеря плиток: ровно так 21 августа фильтр «виджеты в разработке»
  // дважды стёр экран и сохранил результат, и вернуть его человек мог только по
  // памяти. Список закрытый и может только сокращаться.
  const SHRINK_ALLOWED_REASONS = new Set([
    'user-remove',        // человек снял плитку в расстановке
    'user-reset',         // «Вернуть рекомендуемый экран»
    'apply-preset',       // применён пресет
    'undo',               // шаг назад
    'redo',               // шаг вперёд
    'edit-done',          // «Готово» фиксирует то, что человек собрал
    'edit-cancel',        // «Отмена» возвращает снимок входа в расстановку
    'retired-migration'   // одноразовое снятие типов с продукта
  ]);

  // Отпечаток состава — только то, что делает раскладку раскладкой. updatedAt
  // сюда не входит: иначе одинаковый экран каждый раз считался бы изменением.
  function layoutFingerprint(widgetsData) {
    try {
      return JSON.stringify((widgetsData || []).map((w) => [
        w?.id, w?.type, w?.size,
        w?.position?.col, w?.position?.row,
        w?.settings || null
      ]));
    } catch (e) {
      return null;
    }
  }

  // === State Manager with Undo/Redo ===
  const state = {
    _widgets: [],
    _history: [], // Undo stack
    _future: [], // Redo stack
    _editMode: false,
    _draggedWidget: null,
    _initialized: false,
    _saveTimeout: null,
    // Отпечаток последнего состава, который реально ушёл в storage.
    _lastSavedFingerprint: null,
    // Причина ближайшей записи; ставится операцией, читается и гасится saveLayout.
    _pendingSaveReason: null,

    /**
     * Инициализация state manager
     */
    init() {
      if (this._initialized) return;

      const meta = this.loadLayoutMeta();
      // Решения о миграциях принимаются по снимку `meta` на входе, а вот запись
      // должна идти поверх того, что уже лежит в хранилище: init делает
      // несколько записей подряд, и каждая следующая обязана видеть предыдущую.
      // Иначе снятие типов затирает только что записанные поля сетки, и
      // следующая загрузка зря гоняет миграцию 2→4 колонки.
      let storedMeta = meta;
      const writeMeta = (next) => {
        storedMeta = next;
        this.saveLayoutMeta(next);
      };
      let saved = this.loadLayout() || [];
      const hasSavedLayout = Array.isArray(saved) && saved.length > 0;
      const needsPresetMigration = !meta || meta.layoutPresetVersion !== LAYOUT_PRESET_VERSION;

      // Миграция layout 2-колоночной сетки → 4-колоночную.
      // Важно: делаем ОДИН раз и фиксируем в meta.
      const needsMigration = !!meta && (meta.gridVersion !== GRID_VERSION || meta.gridCols !== GRID_COLS);

      // 🔒 КРИТИЧНО: отсутствие meta больше НЕ должно затирать уже сохранённый layout.
      // На части устройств/cloud hydration meta может отсутствовать отдельно от layout.
      // В этом случае просто восстанавливаем meta, но сохраняем пользовательский layout как есть.
      if (hasSavedLayout && needsPresetMigration) {
        writeMeta({
          ...(storedMeta || {}),
          gridVersion: GRID_VERSION,
          gridCols: GRID_COLS,
          layoutPresetVersion: LAYOUT_PRESET_VERSION,
          migratedAt: meta?.migratedAt || Date.now(),
          presetMigratedAt: Date.now(),
          preservedExistingLayoutAt: Date.now()
        });
      }

      if (!hasSavedLayout && needsPresetMigration) {
        const presetWidgets = this._createDefaultLayout();
        const presetLayoutData = presetWidgets.map(w => ({
          id: w.id,
          type: w.type,
          size: w.size,
          position: w.position,
          settings: w.settings,
          createdAt: w.createdAt
        }));

        saved = presetLayoutData;

        writeMeta({
          gridVersion: GRID_VERSION,
          gridCols: GRID_COLS,
          layoutPresetVersion: LAYOUT_PRESET_VERSION,
          migratedAt: Date.now(),
          presetMigratedAt: Date.now()
        });
        try { this.saveLayout(presetLayoutData); } catch (e) { console.error('[widgets] saveLayout preset failed:', e?.message || e); }
      } else if (needsMigration && hasSavedLayout) {
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
        writeMeta({
          ...(storedMeta || {}),
          gridVersion: GRID_VERSION,
          gridCols: GRID_COLS,
          layoutPresetVersion: LAYOUT_PRESET_VERSION,
          migratedAt: Date.now()
        });
        // Сохраняем сразу (без debounce)
        try { this.saveLayout(normalizedLayoutData); } catch (e) { console.error('[widgets] saveLayout normalized failed:', e?.message || e); }
      }

      if (saved && Array.isArray(saved) && saved.length > 0) {
        // 🔍 DEBUG: логируем raw данные из storage (JSON для раскрытия)
        log('RAW from storage:', JSON.stringify(saved.map(w => ({
          type: w.type,
          size: w.size,
          pos: w.position
        }))));
        this._widgets = saved.map(w => this._normalizeWidget(w));

        // Снятие типа — ОДНОРАЗОВАЯ миграция, а не фильтр при каждой загрузке
        // (контракт home-widgets, строка «снятие — одноразовая миграция»).
        // Постоянный фильтр означает, что любая будущая ошибка в списке снятых
        // молча стирает плитки при каждом входе, и человек не может вернуть их
        // даже руками. Чистим один раз и запоминаем, по какому списку чистили.
        //
        // Убираем ТОЛЬКО типы с retired: true, по точному совпадению id
        // (строка «как снимается тип»). Незнакомый тип не трогаем: пропавший
        // виджет, которого нет в списке снятых, — это дефект, а не сжатие, и
        // молча удалять его нельзя.
        const retiredIds = (HEYS.Widgets.registry?.getAllTypes?.() || [])
          .filter((t) => t && t.retired)
          // Реестр хранит идентификатор в поле type; id держим запасным на
          // случай, если форма записи изменится.
          .map((t) => String(t.type ?? t.id))
          .sort();
        const retiredKey = retiredIds.join(',');
        if ((storedMeta?.retiredMigration ?? null) !== retiredKey) {
          const before = this._widgets.length;
          const retiredSet = new Set(retiredIds);
          this._widgets = this._widgets.filter((w) => !retiredSet.has(String(w.type)));
          const removed = before - this._widgets.length;
          if (removed > 0) log(`retired migration: убрано плиток ${removed} (${retiredKey})`);
          try {
            this.saveLayout(this._widgets, { reason: 'retired-migration' });
            writeMeta({ ...(storedMeta || {}), retiredMigration: retiredKey, migratedAt: Date.now() });
          } catch (e) {
            console.error('[widgets] retired migration save failed:', e?.message || e);
          }
        }
        // Старые раскладки хранили правду в координатах — переводим их в
        // порядок чтения один раз, дальше порядок ведёт сам массив.
        this._sortWidgetsByReadingOrder();

        // Строка контракта «прежние раскладки с 1×1 в углу»: при первом
        // открытии такая плитка молча сдвигается в соседнюю клетку того же
        // ряда, остальные плитки со своих мест не едут. Поэтому правится
        // координата одной плитки, а не пересобирается вся укладка —
        // пересборка сдвинула бы соседей и сломала бы обещание строки.
        // Плашки и подсветки нет: сдвиг стоит дешевле сообщения о нём.
        if (this._clearBottomCornerSingles()) {
          try {
            this.saveLayout(this._widgets.map(w => ({
              id: w.id,
              type: w.type,
              size: w.size,
              position: w.position,
              settings: w.settings,
              createdAt: w.createdAt
            })), { reason: 'bottom-corner' });
          } catch (e) {
            console.error('[widgets] bottom-corner save failed:', e?.message || e);
          }
        }
      } else {
        this._widgets = this._createDefaultLayout();
        this._autoPackWidgets();
        // фиксируем meta для чистого старта
        writeMeta({
          gridVersion: GRID_VERSION,
          gridCols: GRID_COLS,
          layoutPresetVersion: LAYOUT_PRESET_VERSION,
          migratedAt: Date.now()
        });
      }

      // Очищаем историю при загрузке
      this._history = [];
      this._future = [];

      // То, что показано после загрузки, считается уже сохранённым: пока человек
      // ничего не изменил, вкладке нечего писать. Иначе любое скрытие вкладки
      // отправляет свой состав со свежим updatedAt и выигрывает у чужой правки.
      this._rememberSavedFingerprint();

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

      // Нормализуем (получим новые cols/rows из registry) и репакуем.
      // Порядок берём из старых координат — он и становится порядком чтения.
      const normalized = scaled
        .map((w) => this._normalizeWidget(w))
        .sort((a, b) => {
          const ar = a.position?.row || 0;
          const br = b.position?.row || 0;
          if (ar !== br) return ar - br;
          return (a.position?.col || 0) - (b.position?.col || 0);
        });
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
      // Позиции — производная от порядка (канвас v4, строки 33–36, 62).
      // Массив уже хранит порядок чтения, поэтому укладку целиком считает
      // gridEngine.computeFlowLayout, а координаты в записи остаются лишь
      // отражением этого порядка.
      return gridEngine.computeFlowLayout(widgets || [], GRID_COLS);
    },

    /**
     * Привести массив к порядку чтения по сохранённым координатам.
     * Нужен один раз при загрузке старых раскладок: в них источником правды
     * были col/row, а теперь им становится порядок элементов.
     */
    _sortWidgetsByReadingOrder() {
      if (!Array.isArray(this._widgets) || this._widgets.length < 2) return;
      this._widgets = [...this._widgets].sort((a, b) => {
        const ar = a.position?.row || 0;
        const br = b.position?.row || 0;
        if (ar !== br) return ar - br;
        return (a.position?.col || 0) - (b.position?.col || 0);
      });
    },

    /**
     * Сдвинуть плитки 1×1 из нижних углов, не трогая соседей.
     * Работает по уже сохранённым координатам — это точечная правка, а не
     * пересборка (строка контракта «прежние раскладки с 1×1 в углу»).
     * @returns {boolean} true, если хоть одна плитка сдвинулась
     */
    _clearBottomCornerSingles() {
      if (!Array.isArray(this._widgets) || this._widgets.length === 0) return false;

      const current = {};
      for (const w of this._widgets) {
        current[w.id] = { col: w.position?.col || 0, row: w.position?.row || 0 };
      }
      const fixed = gridEngine.keepBottomCornersClear(current, this._widgets, GRID_COLS);

      let changed = false;
      this._widgets = this._widgets.map((w) => {
        const nextPos = fixed[w.id];
        if (!nextPos) return w;
        if (nextPos.col === (w.position?.col || 0) && nextPos.row === (w.position?.row || 0)) return w;
        changed = true;
        return { ...w, position: { col: nextPos.col, row: nextPos.row } };
      });

      return changed;
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
      this._debouncedSave('undo');

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
      this._debouncedSave('redo');

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

      // Размер — свойство вида (канвас v4, строки 32 и 79): формат берётся у
      // активного вида, а если вид исчез из каталога — у дефолтного, тихо и
      // вместе с его форматом (строка 67).
      let variantSizeId = finalSizeId;
      const V4 = HEYS.Widgets.VariantsV4;
      const variantCatalog = V4?.getCatalog?.(w.type) || [];
      if (variantCatalog.length) {
        const activeVariant = V4.getActiveVariant?.({ settings: w.settings || {} }, w.type);
        if (activeVariant?.size) variantSizeId = activeVariant.size;
      }

      const size = registry?.getSize(variantSizeId) || registry?.getSize(finalSizeId);

      // 🔍 DEBUG: если размер изменился при нормализации — логируем
      if (rawSizeId !== finalSizeId || !w.size) {
        log(`_normalizeWidget ${w.type}: raw=${w.size || 'undefined'} → normalized=${finalSizeId} (default=${type?.defaultSize})`);
      }

      return {
        id: w.id || `widget_${w.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: w.type,
        size: variantSizeId,
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
      const widgets = DEFAULT_LAYOUT.map((def) => {
        const widget = registry?.createWidget(def.type, {
          size: def.size,
          settings: def.settings
        });
        return widget || this._normalizeWidget(def);
      }).filter(Boolean);

      // Координаты пресета — производная от его порядка, а не отдельный вход.
      const positions = gridEngine.computeFlowLayout(widgets, GRID_COLS);
      return widgets.map((w) => ({
        ...w,
        position: positions[w.id] || w.position || { col: 0, row: 0 }
      }));
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
    _debouncedSave(reason = null) {
      // В расстановке изменения живут только на экране: раскладка пишется по
      // «Готово» (канвас v4, строка 50), иначе «Отмена» теряет смысл.
      if (this._editMode) return;
      // Причина переживает debounce: до записи может пройти полсекунды, а
      // shrink-guard должен знать, чьё это уменьшение.
      if (reason) this._pendingSaveReason = reason;
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
      // «Скоро» — обещение в каталоге, а не виджет: плитки для него ещё нет,
      // и пустая клетка на экране обесценила бы само обещание.
      const def = HEYS.Widgets.registry?.getType?.(widget?.type);
      if (def?.comingSoon) return null;

      const normalized = this._normalizeWidget(widget);
      const usedBefore = countUsedCells(this._widgets);
      const needCells = widgetCellCount(normalized);

      // Переполненные раскладки (>32): добавление заблокировано до уборки или сброса.
      if (usedBefore > SCREEN_CELL_BUDGET) {
        HEYS.Widgets.emit('widget:add-blocked', { reason: 'overflow', used: usedBefore, need: needCells });
        return null;
      }
      if (usedBefore + needCells > SCREEN_CELL_BUDGET) {
        HEYS.Widgets.emit('widget:add-blocked', {
          reason: 'budget',
          used: usedBefore,
          need: needCells,
          type: normalized.type
        });
        return null;
      }

      if (!skipHistory) {
        this._pushHistory();
      }

      // Новая плитка встаёт в конец порядка (канвас v4, строка 55);
      // координаты ей назначит flow-укладка.
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
      this._debouncedSave('user-remove');

      HEYS.Widgets.emit('widget:removed', { widgetId: id, widget: removed });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });

      // Вибрация при удалении
      if (navigator.vibrate) {
        navigator.vibrate([10, 50, 10]);
      }

      return true;
    },

    /**
     * Замена плитки из каталога: стоявший виджет уходит, новый встаёт на его место.
     * Счётчик клеток не растёт, если размер совпадает (канвас v4, «замена перетаскиванием»).
     */
    replaceWidgetFromCatalog(targetId, typeKey, skipHistory = false) {
      const idx = this._widgets.findIndex((w) => w.id === targetId);
      if (idx === -1) return null;

      const def = HEYS.Widgets.registry?.getType?.(typeKey);
      if (def?.comingSoon) return null;

      const created = HEYS.Widgets.registry?.createWidget?.(typeKey);
      if (!created) return null;

      const usedBefore = countUsedCells(this._widgets);
      if (usedBefore > SCREEN_CELL_BUDGET) {
        HEYS.Widgets.emit('widget:add-blocked', { reason: 'overflow', used: usedBefore });
        return null;
      }

      const removed = this._widgets[idx];
      const removedCells = widgetCellCount(removed);
      const newCells = widgetCellCount(created);
      const usedAfterSwap = usedBefore - removedCells + newCells;
      if (usedAfterSwap > SCREEN_CELL_BUDGET) {
        HEYS.Widgets.emit('widget:add-blocked', {
          reason: 'budget',
          used: usedBefore,
          need: newCells,
          type: typeKey,
          replace: true
        });
        return null;
      }

      if (!skipHistory) {
        this._pushHistory();
      }

      const normalized = this._normalizeWidget(created);
      this._widgets[idx] = normalized;
      this._autoPackWidgets();
      const result = this.getWidget(normalized.id) || normalized;
      this._debouncedSave();

      HEYS.Widgets.emit('widget:replaced', { removed, widget: result, index: idx });
      HEYS.Widgets.emit('layout:changed', { layout: this._widgets });

      if (navigator.vibrate) {
        navigator.vibrate(10);
      }

      return result;
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

      if (
        nextUpdates
        && Object.prototype.hasOwnProperty.call(nextUpdates, 'settings')
        && nextUpdates.settings
        && typeof nextUpdates.settings === 'object'
        && !Array.isArray(nextUpdates.settings)
      ) {
        nextUpdates = {
          ...nextUpdates,
          settings: {
            ...(widget.settings || {}),
            ...nextUpdates.settings
          }
        };
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

      // Смена размера пересобирает сетку тем же правилом, что добавление и
      // удаление (канвас v4, строки 33 и 80): порядок остаётся, координаты
      // считаются заново.
      if (nextUpdates && nextUpdates.size && !nextUpdates.position) {
        this._autoPackWidgets();
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
     * Переставить виджет в порядке чтения.
     * Канвас v4, строка 62: перетаскивание задаёт порядок, а не координаты —
     * произвольную клетку с пустым местом рядом выбрать нельзя.
     * @param {string} id
     * @param {number} toIndex - целевой индекс в порядке
     * @param {boolean} skipHistory
     * @returns {boolean} true если порядок изменился
     */
    reorderWidget(id, toIndex, skipHistory = false) {
      const fromIndex = this._widgets.findIndex((w) => w.id === id);
      if (fromIndex === -1) return false;

      const maxIndex = this._widgets.length - 1;
      const target = Math.max(0, Math.min(maxIndex, Math.trunc(Number(toIndex))));
      if (!Number.isFinite(target) || target === fromIndex) return false;

      if (!skipHistory) {
        this._pushHistory();
      }

      const [moved] = this._widgets.splice(fromIndex, 1);
      this._widgets.splice(target, 0, moved);
      this._autoPackWidgets();
      this._debouncedSave();

      HEYS.Widgets.emit('widget:reordered', { widgetId: id, from: fromIndex, to: target });
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
     * Запомнить текущий состав как уже сохранённый — без записи в storage.
     * Нужен после загрузки и после приёма облачной раскладки.
     * @private
     */
    _rememberSavedFingerprint() {
      this._lastSavedFingerprint = layoutFingerprint(this._widgets.map(w => ({
        id: w.id,
        type: w.type,
        size: w.size,
        position: w.position,
        settings: w.settings,
        createdAt: w.createdAt
      })));
    },

    /**
     * Сохранить layout в storage (cloud sync)
     */
    saveLayout(layoutOverride = null, opts = null) {
      // Причину даёт либо прямой вызов, либо операция, поставившая её перед
      // debounce. Читаем и гасим сразу: следующая запись должна назваться сама.
      const reason = opts?.reason || this._pendingSaveReason || null;
      this._pendingSaveReason = null;

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

      // 🛡️ Раскладка не пишется, если состав не изменился. Иначе вкладка,
      // которую просто свернули, отправляет своё состояние со свежим updatedAt
      // и выигрывает last-write-wins у того, что человек собрал на другом
      // устройстве. Ничего не менялось — писать нечего.
      const fingerprint = layoutFingerprint(widgetsData);
      if (fingerprint !== null && fingerprint === this._lastSavedFingerprint) {
        return;
      }

      // 🛡️ SHRINK-GUARD: молчаливое уменьшение состава — не сжатие, а потеря.
      // Легитимное уменьшение всегда приходит от названной операции; всё
      // остальное отбиваем и называем в логе, что именно пропало бы.
      // Kill-switch — как у продуктов: __heys_disable_widget_shrink_guard__.
      if (!SHRINK_ALLOWED_REASONS.has(reason)) {
        let guardDisabled = false;
        try {
          guardDisabled = localStorage.getItem('__heys_disable_widget_shrink_guard__') === '1';
        } catch (e) { /* приватный режим — guard остаётся включённым */ }

        if (!guardDisabled) {
          const prev = this.loadLayout();
          if (Array.isArray(prev) && prev.length > widgetsData.length) {
            const nextIds = new Set(widgetsData.map((w) => String(w?.id)));
            const lost = prev
              .filter((w) => !nextIds.has(String(w?.id)))
              .map((w) => ({ id: w?.id, type: w?.type }));
            if (lost.length > 0) {
              console.warn('[widgets] saveLayout BLOCKED: состав уменьшился без причины', {
                was: prev.length,
                next: widgetsData.length,
                lost,
                reason: reason || '(не названа)'
              });
              return;
            }
          }
        }
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

      this._lastSavedFingerprint = fingerprint;
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
      this._pushHistory();
      this._widgets = this._createDefaultLayout();
      this._autoPackWidgets();
      const meta = this.loadLayoutMeta() || {};
      this.saveLayoutMeta({
        ...meta,
        gridVersion: GRID_VERSION,
        gridCols: GRID_COLS,
        layoutPresetVersion: LAYOUT_PRESET_VERSION,
        resetAt: Date.now()
      });
      // В расстановке запись идёт по «Готово» — иначе стрелка отмены вернёт
      // экран, а в storage уже уехал дефолт (контракт, строки 50 и «сброс к
      // дефолту»).
      if (!this._editMode) {
        this.saveLayout(null, { reason: 'user-reset' });
      }
      HEYS.Widgets.emit('layout:reset', { layout: this._widgets, source: 'user-reset' });
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
      this.saveLayout(null, { reason: 'apply-preset' });
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
      this._editSnapshot = JSON.stringify(this._widgets || []);
      document.body.classList.add('widgets-edit-mode');

      // Отключаем swipe навигацию
      if (HEYS.App?.disableSwipe) {
        HEYS.App.disableSwipe();
      }

      HEYS.Widgets.emit('editmode:enter');
    },

    exitEditMode(opts) {
      if (!this._editMode) return;

      // 🛡️ CRITICAL: Не выходить из edit mode если resize активен!
      if (HEYS.Widgets.dnd?._resizeActive) return;

      if (opts?.revert && this._editSnapshot) {
        try {
          const restored = JSON.parse(this._editSnapshot);
          this._widgets = (Array.isArray(restored) ? restored : []).map((w) => this._normalizeWidget(w));
          this.saveLayout(null, { reason: 'edit-cancel' });
          HEYS.Widgets.emit('layout:changed', { layout: this._widgets, source: 'edit-cancel' });
        } catch (e) {
          warn('edit snapshot restore failed:', e?.message || e);
        }
      }
      this._editSnapshot = null;
      this._editMode = false;
      document.body.classList.remove('widgets-edit-mode');

      // Выход по «Готово» фиксирует раскладку — до него в storage ничего не шло.
      if (!opts?.revert) {
        this.saveLayout(null, { reason: 'edit-done' });
      }

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

    // Канвас home-widgets v4, строки контракта 33–36: раскладку задаёт порядок
    // чтения, а не координаты. Освободившееся место занимает ближайшая
    // следующая плитка, которая в него влезает; поиск идёт только вперёд и не
    // глубже двух плиток, иначе место остаётся пустым.
    FLOW_LOOKAHEAD: 2,

    /**
     * Уложить виджеты по порядку чтения (единственный источник позиций).
     * Чистая функция: не читает state, не мутирует вход.
     * @param {Object[]} widgets - виджеты в порядке, заданном человеком
     * @param {number} cols - число колонок сетки
     * @returns {Object} { [widgetId]: { col, row } }
     */
    computeFlowLayout(widgets, cols = GRID_COLS) {
      const gridCols = Math.max(1, cols | 0);
      const pending = (widgets || []).filter(Boolean).map((w) => {
        const sizeInfo = HEYS.Widgets.registry?.getSize?.(w.size);
        return {
          id: w.id,
          cols: Math.min(gridCols, Math.max(1, sizeInfo?.cols || w.cols || 1)),
          rows: Math.max(1, sizeInfo?.rows || w.rows || 1)
        };
      });

      const positions = {};
      const occupied = new Set();
      const cell = (col, row) => `${col},${row}`;
      const fits = (col, row, w) => {
        if (col + w.cols > gridCols) return false;
        for (let c = 0; c < w.cols; c++) {
          for (let r = 0; r < w.rows; r++) {
            if (occupied.has(cell(col + c, row + r))) return false;
          }
        }
        return true;
      };

      let col = 0;
      let row = 0;
      let guard = 0;
      const guardLimit = pending.length * gridCols * 4 + 1000;

      while (pending.length && guard++ < guardLimit) {
        if (col >= gridCols) {
          col = 0;
          row++;
          continue;
        }
        if (occupied.has(cell(col, row))) {
          col++;
          continue;
        }

        const limit = Math.min(pending.length, this.FLOW_LOOKAHEAD);
        let picked = -1;
        for (let i = 0; i < limit; i++) {
          if (fits(col, row, pending[i])) {
            picked = i;
            break;
          }
        }

        if (picked === -1) {
          // Дырка: ни одна из ближайших плиток не влезает в остаток строки.
          occupied.add(cell(col, row));
          col++;
          continue;
        }

        const w = pending.splice(picked, 1)[0];
        positions[w.id] = { col, row };
        for (let c = 0; c < w.cols; c++) {
          for (let r = 0; r < w.rows; r++) {
            occupied.add(cell(col + c, row + r));
          }
        }
        col += w.cols;
      }

      // Хвост (защита от зацикливания): ставим подряд с начала новых строк.
      let tailRow = row + 1;
      for (const w of pending) {
        positions[w.id] = { col: 0, row: tailRow };
        tailRow += w.rows;
      }

      return this.keepBottomCornersClear(positions, widgets, gridCols);
    },

    /**
     * Освободить нижние углы сетки от плиток 1×1.
     *
     * Строки контракта «1×1 в нижнем углу не ставится», «прежние раскладки
     * с 1×1 в углу» и «2×1 в углу» (решение владельца 25 августа).
     *
     * Почему это укладка, а не стили: зона угла 52×52 забирает у плитки 1×1
     * больше половины площади — на 375 px от неё остаются полосы 28,8×64 и
     * 80,8×12, куда не влезает ни число героя, ни подпись, ни спарклайн.
     * Сжимать нечего, поэтому плитка туда просто не ставится, а содержимое
     * от близости к углу не меняется никак. Формат шире одной колонки в угол
     * встаёт: 2×1 остаётся 117,5×64 свободного места, и это уже решено полем
     * плитки в CSS (строка «зоны углов»).
     *
     * Правится позиция одной плитки, соседи со своих мест не едут — так
     * прежняя раскладка при первом открытии сдвигается молча и на один шаг,
     * без плашки и подсветки. Цель — ближайшая свободная неугловая клетка
     * того же ряда; если ряд занят целиком, плитка уходит одна в следующий
     * (его углы ей тоже запрещены, поэтому в колонку 1).
     *
     * @param {Object} positions - { [widgetId]: { col, row } }
     * @param {Object[]} widgets - те же виджеты, что дали позиции
     * @param {number} cols - число колонок сетки
     * @returns {Object} позиции с освобождёнными углами
     */
    keepBottomCornersClear(positions, widgets, cols = GRID_COLS) {
      const gridCols = Math.max(1, cols | 0);
      // В сетке из двух колонок обе крайние — угловые, двигать плитку некуда.
      if (gridCols < 3) return positions;

      const list = (widgets || []).filter((w) => w && positions?.[w.id]);
      if (!list.length) return positions;

      const sizeOf = (w) => {
        const info = HEYS.Widgets.registry?.getSize?.(w.size);
        return {
          cols: Math.min(gridCols, Math.max(1, info?.cols || w.cols || 1)),
          rows: Math.max(1, info?.rows || w.rows || 1)
        };
      };
      const isCornerCol = (c) => c === 0 || c === gridCols - 1;

      const next = { ...positions };
      // Шаг освобождает один угол и в другой плитку не ставит, а уход в новый
      // ряд снимает оба сразу — больше трёх шагов не нужно ни в одном случае.
      for (let pass = 0; pass < 3; pass++) {
        const taken = new Map();
        let bottomRow = 0;
        for (const w of list) {
          const p = next[w.id];
          const s = sizeOf(w);
          for (let c = 0; c < s.cols; c++) {
            for (let r = 0; r < s.rows; r++) taken.set(`${p.col + c},${p.row + r}`, w.id);
          }
          bottomRow = Math.max(bottomRow, p.row + s.rows - 1);
        }

        // Правый угол разбирается первым: если плитке оттуда пришлось уйти
        // вниз, нижним рядом становится новый и левый угол снимается сам.
        let offender = null;
        for (const cornerCol of [gridCols - 1, 0]) {
          const id = taken.get(`${cornerCol},${bottomRow}`);
          if (!id) continue;
          const w = list.find((x) => x.id === id);
          if (!w) continue;
          const s = sizeOf(w);
          if (s.cols !== 1 || s.rows !== 1) continue;
          offender = w;
          break;
        }
        if (!offender) break;

        const from = next[offender.id];
        let target = null;
        // Сначала вперёд по ряду, потом назад: «следующая свободная клетка
        // того же ряда» для правого угла лежит левее.
        for (let c = from.col + 1; c < gridCols && !target; c++) {
          if (!isCornerCol(c) && !taken.has(`${c},${bottomRow}`)) target = { col: c, row: bottomRow };
        }
        for (let c = from.col - 1; c >= 0 && !target; c--) {
          if (!isCornerCol(c) && !taken.has(`${c},${bottomRow}`)) target = { col: c, row: bottomRow };
        }
        if (!target) target = { col: 1, row: bottomRow + 1 };

        next[offender.id] = target;
      }

      return next;
    },

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
    },

    /**
     * Куда встанет тащимая плитка в порядке чтения.
     * Канвас v4, строка 62: перетаскивание задаёт порядок, а не координаты.
     * @param {string} draggedId
     * @param {Object} cursor - клетка под пальцем { col, row }
     * @returns {number} индекс в порядке без тащимой плитки
     */
    computeDropIndex(draggedId, cursor) {
      const others = state.getWidgets().filter((w) => w && w.id !== draggedId);
      const cursorKey = Math.max(0, cursor?.row || 0) * this.COLS
        + Math.max(0, Math.min(this.COLS - 1, cursor?.col || 0));

      let index = 0;
      for (const w of others) {
        const sizeInfo = HEYS.Widgets.registry?.getSize?.(w.size);
        const cols = sizeInfo?.cols || w.cols || 1;
        const rows = sizeInfo?.rows || w.rows || 1;
        const centerKey = ((w.position?.row || 0) + (rows - 1) / 2) * this.COLS
          + (w.position?.col || 0) + (cols - 1) / 2;
        if (centerKey < cursorKey) index++;
      }
      return index;
    },

    /**
     * Раскладка, которая получится, если отпустить плитку на этом индексе.
     * @param {string} draggedId
     * @param {number} index
     * @returns {Object} { order, positions }
     */
    computeOrderPreview(draggedId, index) {
      const widgets = state.getWidgets();
      const dragged = widgets.find((w) => w && w.id === draggedId);
      const order = widgets.filter((w) => w && w.id !== draggedId);
      if (dragged) {
        const at = Math.max(0, Math.min(order.length, Math.trunc(index) || 0));
        order.splice(at, 0, dragged);
      }
      return { order, positions: this.computeFlowLayout(order, this.COLS) };
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
    _dropIndex: null,
    _previewPositions: null,
    _edgeScrollTimer: null,
    _edgeScrollDirection: 0,
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
      // В расстановке паузы нет — там перетаскивание начинается сразу при
      // касании и сдвиге (канвас v4, строка 56), а прокрутку берёт на себя
      // автоскролл у края.
      this._touchDragReadyAt = (isTouchEvent && !state.isEditMode()) ? (Date.now() + 140) : 0;

      console.info('[HEYS.dnd] 👇 pointerDown', { widgetId, isEditMode: state.isEditMode(), isTouchEvent, pointerType: event?.pointerType, tagName: t?.tagName, targetClass: t?.className?.substring?.(0, 60) });

      // Drag только в режиме расстановки (вход — FAB настройки экрана).
      // Long press вне edit mode больше не открывает расстановку (у динамики веса — смена вида).
      if (!state.isEditMode()) return;
      this._prepareForDrag(widgetId, event);
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
      // touchend — passive: handler не вызывает preventDefault, нужен для очистки drag state.
      document.addEventListener('touchend', this._boundUp, { passive: true });
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
      this._dropIndex = null;

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

      // PERF NEW-18: кэшируем grid element + rect + ghost dimensions один раз на drag start.
      // Раньше: move() делал document.querySelector + getBoundingClientRect + offsetWidth/Height
      // на каждый pointermove (60+ раз/сек) → forced layout reflow на каждый кадр.
      // Теперь: считываем один раз. Если окно ресайзнётся во время drag — погрешность,
      // но это редкий edge-case (пользователь физически не делает то и другое одновременно).
      this._cachedGridEl = document.querySelector('.widgets-grid');
      this._cachedGridRect = this._cachedGridEl ? this._cachedGridEl.getBoundingClientRect() : null;
      if (this._originalElement) {
        this._cachedOriginalDims = {
          width: this._originalElement.offsetWidth,
          height: this._originalElement.offsetHeight,
        };
      } else {
        this._cachedOriginalDims = { width: 150, height: 140 };
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

        const dragThreshold = (isTouchEvent && !state.isEditMode()) ? 14 : 5;
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

      // PERF NEW-18: используем cached dimensions из start() — без forced layout per move.
      if (this._ghostElement) {
        const dims = this._cachedOriginalDims || { width: 150, height: 140 };
        this._ghostElement.style.left = `${this._currentPos.x - dims.width / 2}px`;
        this._ghostElement.style.top = `${this._currentPos.y - dims.height / 2}px`;
      }

      // PERF NEW-18: cached grid element + rect — без querySelector + getBoundingClientRect per move.
      const grid = this._cachedGridEl;
      const rect = this._cachedGridRect;
      if (grid && rect) {
        const relX = this._currentPos.x - rect.left;
        const relY = this._currentPos.y - rect.top;

        // Палец у края — сетка прокручивается сама (канвас v4, строка 58).
        this._updateEdgeAutoScroll(this._currentPos.y);

        const cursor = gridEngine.pixelsToGrid(relX, relY);
        const nextIndex = gridEngine.computeDropIndex(this._draggedWidget.id, cursor);

        if (nextIndex !== this._dropIndex) {
          this._dropIndex = nextIndex;
          this._applyOrderPreview(nextIndex);
        }
      }

      HEYS.Widgets.emit('dnd:move', {
        widget: this._draggedWidget,
        x: this._currentPos.x,
        y: this._currentPos.y,
        dropIndex: this._dropIndex,
        gridPosition: this._lastValidPosition
      });
    },

    /**
     * Показать, куда встанет плитка: пунктирная рамка на её позиции, соседи
     * съезжают в реальном времени (канвас v4, строка 57).
     * @private
     */
    _applyOrderPreview(index) {
      const preview = gridEngine.computeOrderPreview(this._draggedWidget?.id, index);
      this._previewPositions = preview.positions;

      const draggedPos = preview.positions[this._draggedWidget?.id];
      if (draggedPos) {
        this._lastValidPosition = draggedPos;
        this._updatePlaceholderPosition(draggedPos);
        if (this._placeholderElement) {
          this._placeholderElement.classList.remove('widget-placeholder--invalid');
          this._placeholderElement.classList.add('widget-placeholder--valid');
        }
      }

      // Соседей двигает React: позиции идут событием, а не инлайновым стилем,
      // иначе прямая правка DOM разъезжается с виртуальным деревом.
      HEYS.Widgets.emit('dnd:preview', {
        widget: this._draggedWidget,
        index,
        positions: preview.positions
      });
    },

    /**
     * Сбросить предпросмотр порядка.
     * @private
     */
    _clearOrderPreview() {
      if (!this._previewPositions) return;
      this._previewPositions = null;
      HEYS.Widgets.emit('dnd:preview', { widget: null, index: null, positions: null });
    },

    /**
     * Автопрокрутка у верхней и нижней границы: скорость постоянная
     * (канвас v4, строка 58).
     * @private
     */
    _updateEdgeAutoScroll(pointerY) {
      if (typeof window === 'undefined') return;
      const zone = 64;
      const viewportH = window.innerHeight || 0;
      let direction = 0;
      if (pointerY < zone) direction = -1;
      else if (pointerY > viewportH - zone) direction = 1;

      if (direction === this._edgeScrollDirection) return;
      this._edgeScrollDirection = direction;
      this._stopEdgeAutoScroll(true);

      if (!direction) return;
      const scroller = this._getScrollContainer();
      if (!scroller) return;

      this._edgeScrollTimer = setInterval(() => {
        scroller.scrollBy(0, direction * EDGE_SCROLL_STEP_PX);
      }, EDGE_SCROLL_TICK_MS);
    },

    _stopEdgeAutoScroll(keepDirection = false) {
      if (this._edgeScrollTimer) {
        clearInterval(this._edgeScrollTimer);
        this._edgeScrollTimer = null;
      }
      if (!keepDirection) this._edgeScrollDirection = 0;
    },

    _getScrollContainer() {
      if (typeof document === 'undefined') return null;
      const grid = this._cachedGridEl || document.querySelector('.widgets-grid');
      let node = grid?.parentElement || null;
      while (node && node !== document.body) {
        const style = window.getComputedStyle?.(node);
        const overflowY = style?.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
          return node;
        }
        node = node.parentElement;
      }
      return window;
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
        const previewPos = this._previewPositions?.[this._draggedWidget?.id];
        if (hadDrag && previewPos) {
          const widget = this._draggedWidget;
          const reg = HEYS.Widgets.registry;
          const normSize = reg?.normalizeSizeId ? (reg.normalizeSizeId(widget?.size) || widget?.size) : widget?.size;
          const sizeInfo = reg?.getSize?.(normSize) || reg?.getSize?.(widget?.size);
          const cols = sizeInfo?.cols || widget?.cols || 1;
          const rows = sizeInfo?.rows || widget?.rows || 1;
          this._originalElement.style.gridColumn = `${previewPos.col + 1} / span ${cols}`;
          this._originalElement.style.gridRow = `${previewPos.row + 1} / span ${rows}`;
        }

        this._originalElement.style.opacity = '';
        this._originalElement.style.transform = '';
      }

      // Drop меняет порядок, а не координаты (канвас v4, строка 62).
      if (hadDrag && this._dropIndex != null) {
        const reordered = state.reorderWidget(this._draggedWidget.id, this._dropIndex);
        if (reordered) {
          if (navigator.vibrate) {
            navigator.vibrate(10);
          }
          HEYS.Widgets.emit('dnd:drop', {
            widget: this._draggedWidget,
            from: this._startGridPos,
            to: this._previewPositions?.[this._draggedWidget.id] || this._startGridPos,
            index: this._dropIndex
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
      this._stopEdgeAutoScroll();
      // Инлайновый предпросмотр снимаем до того, как отдать раскладку React —
      // иначе он замораживает соседей на позициях перетаскивания. Саму плитку
      // пропускаем: её позиция выставлена в end(), чтобы не было кадра
      // «отпрыгнула назад» до ре-рендера.
      this._clearOrderPreview();
      this._dropIndex = null;

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
      this._scrollIntent = false;
      this._touchDragReadyAt = 0;
      // PERF NEW-18: clear cached layout refs (важно — иначе stale rect при повторном drag)
      this._cachedGridEl = null;
      this._cachedGridRect = null;
      this._cachedOriginalDims = null;
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
        state.exitEditMode({ revert: true });
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
      // Принятое из облака — уже сохранённое состояние. Без этого вкладка при
      // ближайшем скрытии отправила бы его обратно со свежим updatedAt.
      state._rememberSavedFingerprint();
      state.saveLayoutMeta({
        ...(state.loadLayoutMeta() || {}),
        gridVersion: GRID_VERSION,
        gridCols: GRID_COLS,
        layoutPresetVersion: LAYOUT_PRESET_VERSION,
        cloudHydratedAt: Date.now()
      });
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
  HEYS.Widgets.reorderWidget = (id, toIndex) => state.reorderWidget(id, toIndex);
  HEYS.Widgets.isEditMode = () => state.isEditMode();
  HEYS.Widgets.enterEditMode = () => state.enterEditMode();
  HEYS.Widgets.exitEditMode = (opts) => state.exitEditMode(opts);
  HEYS.Widgets.toggleEditMode = () => state.toggleEditMode();
  HEYS.Widgets.undo = () => state.undo();
  HEYS.Widgets.redo = () => state.redo();
  HEYS.Widgets.canUndo = () => state.canUndo();
  HEYS.Widgets.canRedo = () => state.canRedo();
  HEYS.Widgets.resetLayout = () => state.resetLayout();
  HEYS.Widgets.SCREEN_CELL_BUDGET = SCREEN_CELL_BUDGET;
  HEYS.Widgets.SCREEN_ROW_BUDGET = SCREEN_ROW_BUDGET;
  HEYS.Widgets.widgetCellCount = widgetCellCount;
  HEYS.Widgets.countUsedCells = (widgets) => countUsedCells(widgets || state.getWidgets());
  HEYS.Widgets.getBudgetInfo = () => {
    const used = countUsedCells(state.getWidgets());
    return {
      used,
      total: SCREEN_CELL_BUDGET,
      rows: SCREEN_ROW_BUDGET,
      isOverflow: used > SCREEN_CELL_BUDGET,
      remaining: Math.max(0, SCREEN_CELL_BUDGET - used)
    };
  };
  HEYS.Widgets.replaceWidgetFromCatalog = (targetId, typeKey) =>
    state.replaceWidgetFromCatalog(targetId, typeKey);

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
