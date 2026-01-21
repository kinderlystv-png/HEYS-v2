// heys_core_v12.js — Product search, localStorage, RationTab, utilities
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const Store = (HEYS.store) || (HEYS.store = {});

  // ═══════════════════════════════════════════════════════════════════
  // 🛠️ БАЗОВЫЕ УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════════

  /** Регулярное выражение для невидимых символов (пробелы, zero-width и т.д.) */
  const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;

  /** Регулярное выражение для извлечения чисел (поддержка ',' и '.') */
  const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;

  /** Округление до 1 знака после запятой */
  const round1 = (v) => Math.round(v * 10) / 10;

  /** Генерация короткого уникального ID (8 символов) */
  const uuid = () => Math.random().toString(36).slice(2, 10);

  /**
   * Безопасное преобразование в число
   * @param {*} x - Значение для преобразования
   * @returns {number} Число или 0 при ошибке
   */
  const toNum = (x) => {
    if (x === undefined || x === null) return 0;
    if (typeof x === 'number') return x;
    const s = String(x).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * Преобразование пользовательского ввода в число
   * @param {string|number} v - Значение из input поля
   * @returns {number} Число или 0
   */
  const toNumInput = (v) => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * Получение текущего clientId из localStorage или глобального объекта
   * Корректно обрабатывает JSON-сериализованное значение
   * @returns {string} clientId или пустая строка
   */
  function getCurrentClientId() {
    // 1) Сначала из глобала (быстрее)
    if (global.HEYS && HEYS.currentClientId) {
      return HEYS.currentClientId;
    }
    // 2) Из localStorage с JSON.parse
    try {
      const raw = localStorage.getItem('heys_client_current');
      if (!raw) return '';
      // Пробуем распарсить JSON
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : '';
    } catch (e) {
      // Если не JSON — возвращаем как есть (legacy)
      const raw = localStorage.getItem('heys_client_current');
      return raw || '';
    }
  }

  /**
   * Вычисление производных значений продукта (углеводы, жиры, ккал)
   * @param {Object} p - Объект продукта с полями *100 (на 100г)
   * @returns {{carbs100: number, fat100: number, kcal100: number, harm?: number}}
   */
  function computeDerived(p) {
    const hasCarbs = p && p.carbs100 != null;
    const hasFat = p && p.fat100 != null;
    const carbs100 = hasCarbs ? toNum(p.carbs100) : (toNum(p.simple100) + toNum(p.complex100));
    const fat100 = hasFat ? toNum(p.fat100) : (toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100));
    // TEF-aware formula: protein 3 kcal/g, carbs 4 kcal/g, fat 9 kcal/g
    // (Учитывает термический эффект пищи для белка — ~25% калорий уходит на переваривание)
    // Стандарт проекта: heys_models_v1.js, heys_day_add_product.js, parse_worker.js
    const kcal100 = 3 * toNum(p.protein100) + 4 * carbs100 + 9 * fat100;

    const derived = {
      carbs100: round1(carbs100),
      fat100: round1(fat100),
      kcal100: round1(kcal100)
    };

    // Auto-calculate harm if not provided (v2.0.0)
    // HEYS.Harm.calculateHarmScore uses scientific formula based on trans/simple/badFat/sodium vs fiber/protein/goodFat
    if (p.harm == null && p.harmScore == null && window.HEYS?.Harm?.calculateHarmScore) {
      derived.harm = window.HEYS.Harm.calculateHarmScore(p);
    }

    return derived;
  }
  /**
   * Получение данных из localStorage с JSON парсингом
   * Использует HEYS.store.get для scoped-ключей (с clientId) если доступен
   * @param {string} key - Ключ для чтения
   * @param {*} def - Значение по умолчанию при ошибке
   * @returns {*} Распарсенное значение или def
   */
  function lsGet(key, def) {
    try {
      // 🔧 FIX: Для client-specific ключей используем HEYS.store.get (с scoped-ключами)
      // Это исправляет проблему когда данные из облака сохраняются в heys_${clientId}_products,
      // а читаются из heys_products (legacy ключ с другими данными)
      if (window.HEYS?.store?.get && window.HEYS?.currentClientId) {
        // Проверяем, это client-specific ключ?
        const clientSpecificKeys = ['heys_products', 'heys_profile', 'heys_hr_zones', 'heys_norms', 'heys_game'];
        const isClientSpecific = clientSpecificKeys.some(k => key === k || key.includes('dayv2_'));
        if (isClientSpecific) {
          return window.HEYS.store.get(key, def);
        }
      }
      // Fallback на прямой localStorage для глобальных ключей
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }

  /**
   * Сохранение данных в localStorage с JSON сериализацией
   * Использует HEYS.store.set для scoped-ключей (с clientId) если доступен
   * Автоматически вызывает window.HEYS.saveClientKey для синхронизации с облаком
   * @param {string} key - Ключ для сохранения
   * @param {*} val - Значение для сохранения
   */
  function lsSet(key, val) {
    try {
      // 🔧 FIX: Для client-specific ключей используем HEYS.store.set (с scoped-ключами)
      if (window.HEYS?.store?.set && window.HEYS?.currentClientId) {
        const clientSpecificKeys = ['heys_products', 'heys_profile', 'heys_hr_zones', 'heys_norms', 'heys_game'];
        // ⚠️ ИСКЛЮЧЕНИЕ: heys_dayv2_date — глобальный ключ (текущая выбранная дата), НЕ client-specific!
        const isGlobalKey = key === 'heys_dayv2_date';
        const isClientSpecific = !isGlobalKey && (clientSpecificKeys.some(k => key === k || key.includes('dayv2_')));
        if (isClientSpecific) {
          window.HEYS.store.set(key, val);
          // Событие для offline-индикатора
          const type = key.includes('dayv2') ? 'meal'
            : key.includes('product') ? 'product'
              : key.includes('profile') ? 'profile'
                : 'data';
          window.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key, type } }));
          return;
        }
      }
      // Fallback на прямой localStorage для глобальных ключей
      localStorage.setItem(key, JSON.stringify(val));
      // Событие для offline-индикатора с типом изменения
      const type = key.includes('dayv2') ? 'meal'
        : key.includes('product') ? 'product'
          : key.includes('profile') ? 'profile'
            : 'data';
      window.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key, type } }));
    } catch (e) {
      console.error('[lsSet] Error saving:', key, e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 📄 ПАРСИНГ ВСТАВЛЕННЫХ ДАННЫХ
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Проверка, является ли строка заголовком таблицы
   * @param {string} line - Строка для проверки
   * @returns {boolean} true если это заголовок
   */
  function isHeaderLine(line) {
    const l = line.toLowerCase();
    return l.includes('название') && (l.includes('ккал') || l.includes('калори') || l.includes('углевод'));
  }

  /**
   * Нормализация строки (удаление невидимых символов, замена разделителей)
   * @param {string} raw - Исходная строка
   * @returns {string} Нормализованная строка
   */
  function normalizeLine(raw) {
    let s = raw.replace(INVIS, ' ');
    s = s.replace(/\u060C/g, ',').replace(/\u066B/g, ',').replace(/\u066C/g, ',').replace(/\u201A/g, ',');
    s = s.replace(/\u00B7/g, '.').replace(/[–—−]/g, '-').replace(/%/g, '');
    s = s.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * Поиск позиций токенов в строке
   * @param {string} s - Строка для поиска
   * @param {string[]} tokens - Массив токенов
   * @returns {(number|null)[]} Массив позиций (null если не найден)
   */
  function findTokenPositions(s, tokens) {
    const positions = [];
    let start = 0;
    for (const tok of tokens) {
      const idx = s.indexOf(tok, start);
      positions.push(idx === -1 ? null : idx);
      if (idx !== -1) start = idx + tok.length;
    }
    return positions;
  }

  /**
   * Извлечение данных о продукте из строки таблицы
   * Ожидается формат: "Название <12 числовых значений>"
   * @param {string} raw - Исходная строка из вставленной таблицы
   * @returns {{name: string, nums: number[]}|null} Объект с именем и массивом из 12 чисел, или null
   */
  function extractRow(raw) {
    DEV.log('🔍 [EXTRACT] Обрабатываем строку:', raw);

    const clean = normalizeLine(raw);
    DEV.log('🧹 [EXTRACT] Нормализованная строка:', clean);

    const tokens = clean.match(NUM_RE) || [];
    DEV.log('🔢 [EXTRACT] Найденные числовые токены:', tokens);

    if (!tokens.length) {
      DEV.warn('⚠️ [EXTRACT] Числовые токены не найдены');
      return null;
    }

    let last = tokens.slice(-12);
    DEV.log('📊 [EXTRACT] Последние 12 токенов:', last);

    if (last.length < 12) {
      last = Array(12 - last.length).fill('0').concat(last);
      DEV.log('📊 [EXTRACT] Дополнено нулями до 12:', last);
    }

    const positions = findTokenPositions(clean, last);
    DEV.log('📍 [EXTRACT] Позиции токенов:', positions);

    const firstPos = positions[0] ?? clean.length;
    const name = clean.slice(0, firstPos).trim() || 'Без названия';
    DEV.log('📝 [EXTRACT] Извлеченное название:', name);

    const nums = last.map(toNum);
    DEV.log('🔢 [EXTRACT] Числовые значения:', nums);

    const result = { name, nums };
    DEV.log('✅ [EXTRACT] Результат извлечения:', result);

    return result;
  }
  // --- Web Worker proxy for heavy parsePasted ---
  let _parseWorker = null;
  function getParseWorker() {
    DEV.log('👷 [WORKER] Проверяем существующий worker:', !!_parseWorker);

    if (!_parseWorker) {
      try {
        DEV.log('👷 [WORKER] Создаем новый Web Worker: parse_worker.js');
        _parseWorker = new Worker('parse_worker.js');
        DEV.log('✅ [WORKER] Web Worker создан успешно');

        // Добавляем обработчик ошибок
        _parseWorker.onerror = (error) => {
          console.error('❌ [WORKER] Ошибка Web Worker:', error);
        };

      } catch (error) {
        console.error('❌ [WORKER] Не удалось создать Web Worker:', error);
        throw error;
      }
    }

    return _parseWorker;
  }
  function parsePasted(text) {
    DEV.log('🔍 [PARSE] Начинаем парсинг текста');
    DEV.log('📊 [PARSE] Длина текста:', text?.length || 0);
    DEV.log('🔧 [PARSE] Проверяем поддержку Web Worker:', typeof Worker !== 'undefined');

    // Временно отключаем Web Worker из-за проблем с загрузкой
    DEV.log('⚠️ [PARSE] Используем синхронный парсинг (Worker отключен)');
    return Promise.resolve(parsePastedSync(text));

    // fallback sync for environments without Worker
    if (typeof Worker === 'undefined') {
      DEV.log('⚠️ [PARSE] Web Worker недоступен, используем синхронный парсинг');
      return parsePastedSync(text);
    }

    DEV.log('🔄 [PARSE] Используем Web Worker для парсинга');

    return new Promise((resolve, reject) => {
      try {
        const worker = getParseWorker();
        DEV.log('👷 [PARSE] Web Worker создан:', !!worker);

        const handler = (e) => {
          DEV.log('📨 [PARSE] Получен ответ от Worker:', e.data);
          worker.removeEventListener('message', handler);

          const result = e.data.result && e.data.result.rows ? e.data.result.rows : [];
          DEV.log('✅ [PARSE] Результат парсинга:', result.length, 'продуктов');
          resolve(result);
        };

        const errorHandler = (error) => {
          console.error('❌ [PARSE] Ошибка Web Worker:', error);
          worker.removeEventListener('message', handler);
          worker.removeEventListener('error', errorHandler);
          reject(new Error('Worker error: ' + error.message));
        };

        worker.addEventListener('message', handler);
        worker.addEventListener('error', errorHandler);

        DEV.log('📤 [PARSE] Отправляем данные в Worker');
        worker.postMessage({ text });

        setTimeout(() => {
          DEV.warn('⏰ [PARSE] Таймаут парсинга (10 сек)');
          worker.removeEventListener('message', handler);
          worker.removeEventListener('error', errorHandler);
          reject(new Error('parse timeout'));
        }, 10000);
      } catch (error) {
        console.error('❌ [PARSE] Критическая ошибка:', error);
        reject(error);
      }
    });
  }
  // Синхронная версия (используется внутри воркера и как fallback)
  function parsePastedSync(text) {
    DEV.log('🔍 [PARSE_SYNC] Начинаем синхронный парсинг');
    DEV.log('📊 [PARSE_SYNC] Длина текста:', text?.length || 0);

    if (!text || typeof text !== 'string') {
      DEV.warn('⚠️ [PARSE_SYNC] Пустой или некорректный текст');
      return [];
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !isHeaderLine(l));
    DEV.log('📄 [PARSE_SYNC] Количество строк после фильтрации:', lines.length);
    DEV.log('📝 [PARSE_SYNC] Первые 3 строки:', lines.slice(0, 3));

    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      DEV.log(`🔍 [PARSE_SYNC] Обрабатываем строку ${i + 1}:`, raw.substring(0, 50) + '...');

      const st = extractRow(raw);
      if (!st) {
        DEV.warn(`⚠️ [PARSE_SYNC] Не удалось извлечь данные из строки ${i + 1}:`, raw);
        continue;
      }

      DEV.log(`✅ [PARSE_SYNC] Извлечены данные из строки ${i + 1}:`, st.name, st.nums);

      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = st.nums;
      const base = { id: uuid(), name: st.name, carbs100: carbs, fat100: fat, simple100: simple, complex100: complex, protein100: protein, badFat100: bad, goodFat100: good, trans100: trans, fiber100: fiber, gi: gi, harm: harm, createdAt: Date.now() };

      try {
        const d = computeDerived(base);
        const product = { id: base.id, name: base.name, ...base, carbs100: d.carbs100, fat100: d.fat100, kcal100: d.kcal100 };
        rows.push(product);
        DEV.log(`✅ [PARSE_SYNC] Продукт ${i + 1} создан:`, product.name, 'ккал:', product.kcal100);
      } catch (error) {
        console.error(`❌ [PARSE_SYNC] Ошибка при создании продукта ${i + 1}:`, error);
      }
    }

    DEV.log('✅ [PARSE_SYNC] Синхронный парсинг завершен, создано продуктов:', rows.length);
    return rows;
  }

  function RationTab(props) {
    const { setProducts } = props;
    const products = Array.isArray(props.products) ? props.products : [];

    // Сохранять продукты в облако и localStorage при каждом изменении (через HEYS.utils для namespace)
    React.useEffect(() => {
      // Не сохраняем пустой массив если это первичная инициализация и возможно есть данные в облаке
      if (products.length === 0) {
        // Проверяем, есть ли данные в localStorage или облаке
        const existingProducts = (window.HEYS && window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) ||
          (window.HEYS && window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', null));
        if (existingProducts && Array.isArray(existingProducts) && existingProducts.length > 0) {
          // Есть продукты в storage, не затираем их пустым массивом
          return;
        }
      }

      // 🛡️ ЗАЩИТА от race condition: не сохраняем если в storage больше продуктов
      // ИСКЛЮЧЕНИЕ: если установлен флаг _intentionalProductDelete — это намеренное удаление
      const existingProducts = (window.HEYS && window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) ||
        (window.HEYS && window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', null));
      if (existingProducts && Array.isArray(existingProducts) && existingProducts.length > products.length) {
        // Проверяем флаг намеренного удаления
        if (window.HEYS && window.HEYS._intentionalProductDelete) {
          if (window.DEV) {
            window.DEV.log('✅ [useEffect] ALLOWED: intentional delete', existingProducts.length, '→', products.length);
          }
          // Сбрасываем флаг после использования
          window.HEYS._intentionalProductDelete = false;
        } else {
          if (window.DEV) {
            window.DEV.log('⚠️ [useEffect] BLOCKED: не уменьшаем', existingProducts.length, '→', products.length);
          }
          return;
        }
      }

      if (window.DEV) {
        window.DEV.log('💾 [useEffect] Сохраняем products в localStorage:', products.length, 'items');
      }

      if (Array.isArray(products) && window.HEYS && window.HEYS.store && typeof window.HEYS.store.set === 'function') {
        window.HEYS.store.set('heys_products', products);
      } else if (window.HEYS && window.HEYS.utils && typeof window.HEYS.utils.lsSet === 'function') {
        // fallback
        window.HEYS.utils.lsSet('heys_products', products);
      }
    }, [products]);
    const [query, setQuery] = React.useState('');
    const [paste, setPaste] = React.useState('');
    const [showModal, setShowModal] = React.useState(false);
    const [draft, setDraft] = React.useState({ name: '', simple100: 0, complex100: 0, protein100: 0, badFat100: 0, goodFat100: 0, trans100: 0, fiber100: 0, gi: 0, harm: 0 });
    const derived = computeDerived(draft);

    // === PHASE 2: Shared Products UI ===
    // Подвкладки: 'personal' (👤 Продукты клиента) | 'shared' (🌐 Общая база)
    const [activeSubtab, setActiveSubtab] = React.useState('personal');
    // Результаты поиска из shared_products
    const [sharedResults, setSharedResults] = React.useState([]);
    const [sharedLoading, setSharedLoading] = React.useState(false);
    const [sharedQuery, setSharedQuery] = React.useState('');
    // ВСЕ продукты общей базы (для таблицы)
    const [allSharedProducts, setAllSharedProducts] = React.useState([]);
    const [allSharedLoading, setAllSharedLoading] = React.useState(false);
    const [sharedExportCount, setSharedExportCount] = React.useState(null);
    // Pending заявки (для куратора)
    const [pendingProducts, setPendingProducts] = React.useState([]);
    const [pendingLoading, setPendingLoading] = React.useState(false);
    // Checkbox: опубликовать новый продукт в shared (по умолчанию ON)
    const [publishToShared, setPublishToShared] = React.useState(true);
    // Модалка мягкого merge при конфликте fingerprint
    const [mergeModal, setMergeModal] = React.useState({ show: false, existing: null, draft: null });
    // Collapsible секция бэкапов (свёрнута по умолчанию)
    const [showBackupSection, setShowBackupSection] = React.useState(false);

    // Проверяем curator-режим (есть Supabase session)
    // Используем state для реактивности при изменении auth
    // ✅ FIX v47: Проверяем наличие cloudUser (curator login создаёт user),
    // а не _rpcOnlyMode (который true для ВСЕХ после миграции на Yandex API)
    // ✅ FIX v48: Заменён setInterval(1s) на event listener для производительности
    const [isCurator, setIsCurator] = React.useState(false);
    React.useEffect(() => {
      const checkCurator = () => {
        const cloudUser = window.HEYS?.cloud?.getUser?.();
        // Куратор = есть user object (PIN-вход не создаёт user, только _pinAuthClientId)
        const result = cloudUser != null;
        setIsCurator(result);
      };
      checkCurator();
      // Подписываемся на изменения auth через событие (вместо polling каждую секунду)
      window.addEventListener('heys:auth-changed', checkCurator);
      return () => window.removeEventListener('heys:auth-changed', checkCurator);
    }, []);

    // Debounce для поиска в shared (300ms)
    const searchSharedDebounced = React.useMemo(() => {
      let timeoutId = null;
      return (q) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          if (!q || q.length < 2) {
            setSharedResults([]);
            return;
          }
          setSharedLoading(true);
          try {
            const result = await window.HEYS?.cloud?.searchSharedProducts?.(q, { limit: 50 });
            if (result?.data) {
              setSharedResults(result.data);
            }
          } catch (err) {
            console.error('[SHARED SEARCH] Error:', err);
          } finally {
            setSharedLoading(false);
          }
        }, 300);
      };
    }, []);

    // Загрузка pending заявок для куратора
    const loadPendingProducts = React.useCallback(async () => {
      if (!isCurator) return;
      setPendingLoading(true);
      try {
        const result = await window.HEYS?.cloud?.getPendingProducts?.();
        if (result?.data) {
          setPendingProducts(result.data);
        }
      } catch (err) {
        console.error('[PENDING] Load error:', err);
      } finally {
        setPendingLoading(false);
      }
    }, [isCurator]);

    // Загрузка ВСЕХ продуктов из общей базы
    const loadAllSharedProducts = React.useCallback(async () => {
      setAllSharedLoading(true);
      try {
        const result = await window.HEYS?.cloud?.getAllSharedProducts?.({ limit: 500 });
        if (result?.data) {
          setAllSharedProducts(result.data);
        }
      } catch (err) {
        console.error('[SHARED ALL] Load error:', err);
      } finally {
        setAllSharedLoading(false);
      }
    }, []);

    React.useEffect(() => {
      const cached = window.HEYS?.cloud?.getCachedSharedProducts?.();
      if (Array.isArray(cached) && cached.length) {
        setSharedExportCount(cached.length);
        return;
      }
      if (Array.isArray(allSharedProducts) && allSharedProducts.length) {
        setSharedExportCount(allSharedProducts.length);
      }
    }, [allSharedProducts]);

    // Загружаем pending при переключении на вкладку "Общая база"
    React.useEffect(() => {
      if (activeSubtab === 'shared' && isCurator) {
        loadPendingProducts();
      }
    }, [activeSubtab, isCurator, loadPendingProducts]);

    // Загружаем ВСЕ продукты общей базы при переключении на вкладку "Общая база"
    React.useEffect(() => {
      if (activeSubtab === 'shared') {
        loadAllSharedProducts();
      }
    }, [activeSubtab, loadAllSharedProducts]);

    // Поиск в shared при изменении sharedQuery (только для вкладки shared)
    React.useEffect(() => {
      if (activeSubtab === 'shared') {
        searchSharedDebounced(sharedQuery || query);
      }
    }, [sharedQuery, query, activeSubtab, searchSharedDebounced]);

    // Авто-дополнение sodium100 для локальных продуктов из shared_products
    const sodiumBackfillRef = React.useRef({ key: '', inFlight: false });
    React.useEffect(() => {
      if (!Array.isArray(products) || products.length === 0) return;

      const normalizeName = window.HEYS?.models?.normalizeProductName
        || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));

      const missing = products
        .filter(p => (p?.sodium100 === undefined || p?.sodium100 === null || p?.sodium100 === ''))
        .map(p => ({ id: p?.shared_origin_id, name: normalizeName(p?.name) }))
        .filter(p => p.id || p.name);

      if (missing.length === 0) return;

      const missingKey = missing
        .map(p => p.id || p.name)
        .sort()
        .join('|');

      if (sodiumBackfillRef.current.inFlight || sodiumBackfillRef.current.key === missingKey) return;

      sodiumBackfillRef.current = { key: missingKey, inFlight: true };

      (async () => {
        try {
          const cloud = window.HEYS?.cloud;
          if (!cloud?.getAllSharedProducts) return;

          const result = await cloud.getAllSharedProducts({ limit: 500, excludeBlocklist: false });
          const shared = Array.isArray(result?.data) ? result.data : [];
          if (shared.length === 0) return;

          const byId = new Map();
          const byName = new Map();
          const nameCounts = new Map();

          shared.forEach(sp => {
            if (sp?.id) byId.set(sp.id, sp);
            const nm = normalizeName(sp?.name);
            if (nm) {
              nameCounts.set(nm, (nameCounts.get(nm) || 0) + 1);
              byName.set(nm, sp);
            }
          });

          const updated = products.map(p => {
            if (p?.sodium100 !== undefined && p?.sodium100 !== null && p?.sodium100 !== '') return p;

            let sharedProduct = null;
            if (p?.shared_origin_id && byId.has(p.shared_origin_id)) {
              sharedProduct = byId.get(p.shared_origin_id);
            } else {
              const nm = normalizeName(p?.name);
              if (nm && nameCounts.get(nm) === 1) {
                sharedProduct = byName.get(nm);
              }
            }

            if (!sharedProduct || sharedProduct.sodium100 == null) return p;
            return { ...p, sodium100: sharedProduct.sodium100 };
          });

          const changed = updated.some((p, i) => p !== products[i]);
          if (changed) setProducts(updated);
        } finally {
          sodiumBackfillRef.current.inFlight = false;
        }
      })();
    }, [products]);

    // Оптимизированный поиск с индексацией
    const searchIndex = React.useMemo(() => {
      const index = new Map();
      products.forEach((product, idx) => {
        const name = (product.name || '').toLowerCase();
        // Индексируем по первым буквам для быстрого поиска
        for (let i = 1; i <= Math.min(name.length, 3); i++) {
          const prefix = name.substring(0, i);
          if (!index.has(prefix)) index.set(prefix, []);
          index.get(prefix).push(idx);
        }
        // Индексируем по словам
        name.split(/\s+/).forEach(word => {
          if (word.length > 0) {
            if (!index.has(word)) index.set(word, []);
            index.get(word).push(idx);
          }
        });
      });
      return index;
    }, [products]);

    // Без лимита отображения
    const DISPLAY_LIMIT = Number.MAX_SAFE_INTEGER;
    const [showAll, setShowAll] = React.useState(false);

    const filtered = React.useMemo(() => {
      // Используем normalizeText из SmartSearch (единый источник)
      const normalizeSearchText = window.HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));

      const sortByCreatedAtDesc = (list) => {
        return [...list].sort((a, b) => {
          const aTs = Number(a?.createdAt || 0);
          const bTs = Number(b?.createdAt || 0);
          return bTs - aTs;
        });
      };

      function performSearch() {
        const q = normalizeSearchText(query.trim());
        if (!q) return products;

        // Если доступен умный поиск, используем его
        if (window.HEYS && window.HEYS.SmartSearchWithTypos) {
          try {
            const smartResult = window.HEYS.SmartSearchWithTypos.search(q, products, {
              enablePhonetic: true,
              enableSynonyms: true,
              enableTranslit: true, // 🆕 рафа → rafa → Raffaello
              maxSuggestions: 50
            });

            if (smartResult && smartResult.results && smartResult.results.length > 0) {
              return smartResult.results;
            }
          } catch (error) {
            DEV.warn('[HEYS] Ошибка умного поиска в управлении продуктами, используем обычный:', error);
          }
        }

        if (q.length <= 3) {
          // Для коротких запросов используем индекс
          const indices = searchIndex.get(q) || [];
          if (indices.length > 0) {
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('cache-hit');
            }
            return indices.map(idx => products[idx]);
          } else {
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('cache-miss');
            }
            return products.filter(p => normalizeSearchText(p.name).includes(q));
          }
        } else {
          // Для длинных запросов - комбинированный подход
          const candidateIndices = new Set();

          // Ищем по префиксам и словам
          for (const [key, indices] of searchIndex.entries()) {
            if (key.includes(q) || q.includes(key)) {
              indices.forEach(idx => candidateIndices.add(idx));
            }
          }

          // Если нашли кандидатов через индекс, фильтруем их
          if (candidateIndices.size > 0) {
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('cache-hit');
            }
            const candidates = Array.from(candidateIndices).map(idx => products[idx]);
            return candidates.filter(p => normalizeSearchText(p.name).includes(q));
          }

          // Fallback к обычному поиску
          if (window.HEYS && window.HEYS.analytics) {
            window.HEYS.analytics.trackDataOperation('cache-miss');
          }
          return products.filter(p => normalizeSearchText(p.name).includes(q));
        }
      }

      // Выполняем поиск и трекаем время
      const startTime = performance.now();
      const result = performSearch();
      const duration = performance.now() - startTime;

      // Трекинг поиска
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackSearch(query, result.length, duration);
      }

      return sortByCreatedAtDesc(result);
    }, [products, query, searchIndex]);

    // Слушатель события обновления продуктов (для реактивности после sync)
    // 🔒 Ref для пропуска первого sync (предотвращает мерцание)
    const initialSyncDoneRef = React.useRef(false);

    React.useEffect(() => {
      const handleProductsUpdated = (e) => {
        // 🔒 Пропускаем первый heysSyncCompleted — products уже загружены при инициализации
        if (e.type === 'heysSyncCompleted') {
          if (!initialSyncDoneRef.current) {
            initialSyncDoneRef.current = true;
            return;
          }
        }

        const latest = (window.HEYS.store?.get?.('heys_products', null)) ||
          (window.HEYS.utils?.lsGet?.('heys_products', [])) || [];
        if (Array.isArray(latest) && latest.length > 0) {
          if (window.DEV) {
            window.DEV.log('📦 [RATION] Products updated via event:', latest.length, 'items');
          }
          // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов (race condition защита)
          setProducts(prev => {
            if (Array.isArray(prev) && prev.length > latest.length) {
              if (window.DEV) {
                window.DEV.log('⚠️ [RATION] BLOCKED: не уменьшаем', prev.length, '→', latest.length);
              }
              return prev;
            }
            // 🔒 Не обновляем если количество одинаковое
            if (Array.isArray(prev) && prev.length === latest.length) {
              return prev;
            }
            return latest;
          });
        }
      };

      const handleProductPatched = (event) => {
        const detail = event?.detail || {};
        const updatedProduct = detail.product || null;
        const updatedId = String(detail.productId ?? updatedProduct?.id ?? updatedProduct?.product_id ?? updatedProduct?.name ?? '');
        if (!updatedId) return;

        setProducts((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((p) => {
            const pid = String(p?.id ?? p?.product_id ?? p?.name ?? '');
            if (pid !== updatedId) return p;
            const patched = {
              ...p,
              ...(updatedProduct || {})
            };
            if (Array.isArray(detail.portions)) {
              patched.portions = detail.portions;
            }
            changed = true;
            return patched;
          });
          return changed ? next : prev;
        });
      };

      // 🔄 FIX v1.1: Слушаем событие heys:orphans-recovered — после восстановления orphan-продуктов
      // Это источник правды — recovery добавляет продукты в localStorage, UI должен подтянуться
      const handleOrphansRecovered = () => {
        const latest = (window.HEYS.store?.get?.('heys_products', null)) ||
          (window.HEYS.utils?.lsGet?.('heys_products', [])) || [];
        if (Array.isArray(latest) && latest.length > 0) {
          if (window.DEV) {
            window.DEV.log('🔄 [RATION] Orphans recovered, updating state:', latest.length, 'items');
          }
          // После recovery всегда обновляем state — это source of truth
          setProducts(latest);
        }
      };

      window.addEventListener('heysProductsUpdated', handleProductsUpdated);
      window.addEventListener('heysSyncCompleted', handleProductsUpdated);
      window.addEventListener('heys:product-updated', handleProductPatched);
      window.addEventListener('heys:product-portions-updated', handleProductPatched);
      window.addEventListener('heys:orphans-recovered', handleOrphansRecovered);

      return () => {
        window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
        window.removeEventListener('heysSyncCompleted', handleProductsUpdated);
        window.removeEventListener('heys:product-updated', handleProductPatched);
        window.removeEventListener('heys:product-portions-updated', handleProductPatched);
        window.removeEventListener('heys:orphans-recovered', handleOrphansRecovered);
      };
    }, []);

    // Подгружать продукты из облака при смене клиента
    React.useEffect(() => {
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      const getDeduplicatedProducts = (latestProducts) => {
        const safeLatest = Array.isArray(latestProducts) ? latestProducts : [];
        if (window.HEYS?.products?.deduplicate) {
          const before = safeLatest.length;
          const stats = window.HEYS.products.deduplicate();
          const deduped = window.HEYS.products.getAll();
          if (stats?.removed > 0 && Array.isArray(deduped)) return deduped;
          if (Array.isArray(deduped) && deduped.length === before) return deduped;
        }
        return safeLatest;
      };
      if (clientId && cloud && typeof cloud.syncClient === 'function') {
        const startTime = performance.now();
        const need = (typeof cloud.shouldSyncClient === 'function') ? cloud.shouldSyncClient(clientId, 4000) : true;
        if (need) {
          cloud.syncClient(clientId).then(() => {
            const duration = performance.now() - startTime;
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackApiCall('syncClient', duration, true);
              window.HEYS.analytics.trackDataOperation('cloud-sync');
            }
            const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];

            if (window.DEV) {
              window.DEV.log('🔄 [SYNC] После syncClient прочитали из localStorage:', latest.length, 'items');
              window.DEV.log('🔄 [SYNC] Текущее состояние products:', products.length, 'items');
            }

            // 🧹 Автоматическая дедупликация при подозрительно большом количестве (>1000)
            if (Array.isArray(latest) && latest.length > 1000) {
              // 🔇 v4.7.1: Лог отключён
              if (window.HEYS.products && window.HEYS.products.deduplicate) {
                window.HEYS.products.deduplicate();
                // Перечитываем после дедупликации
                const deduplicated = window.HEYS.products.getAll();
                setProducts(Array.isArray(deduplicated) ? deduplicated : []);
                return;
              }
            }

            // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов (race condition)
            if (latest.length < products.length) {
              if (window.DEV) {
                window.DEV.log('⚠️ [SYNC] BLOCKED: не уменьшаем', products.length, '→', latest.length);
              }
              return;
            }

            if (Array.isArray(latest) && latest.length > 0) {
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('products-loaded', latest.length);
              }
            }
            setProducts(getDeduplicatedProducts(latest));
          }).catch((error) => {
            const duration = performance.now() - startTime;
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackApiCall('syncClient', duration, false);
            }
            console.error('Client sync failed:', error);
          });
        } else {
          const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];

          if (window.DEV) {
            window.DEV.log('🔄 [SYNC] Sync не нужен, читаем из localStorage:', latest.length, 'items');
          }

          // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов
          if (latest.length < products.length) {
            if (window.DEV) {
              window.DEV.log('⚠️ [SYNC] BLOCKED: не уменьшаем', products.length, '→', latest.length);
            }
            return;
          }

          if (Array.isArray(latest) && latest.length > 0) {
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('products-loaded', latest.length);
            }
          }
          setProducts(getDeduplicatedProducts(latest));
        }
      } else {
        const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];

        if (window.DEV) {
          window.DEV.log('🔄 [SYNC] Нет cloud/clientId, читаем из localStorage:', latest.length, 'items');
        }

        // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов
        if (latest.length < products.length) {
          if (window.DEV) {
            window.DEV.log('⚠️ [SYNC] BLOCKED: не уменьшаем', products.length, '→', latest.length);
          }
          return;
        }

        setProducts(getDeduplicatedProducts(latest));
      }
    }, [window.HEYS && window.HEYS.currentClientId]);

    function resetDraft() { setDraft({ name: '', simple100: 0, complex100: 0, protein100: 0, badFat100: 0, goodFat100: 0, trans100: 0, fiber100: 0, gi: 0, harm: 0 }); }
    async function addProduct() {
      const name = (draft.name || '').trim();
      if (!name) {
        HEYS.Toast?.warning('Введите название продукта') || alert('Введите название продукта');
        return;
      }
      // Проверка уникальности названия в личной базе
      const existingProduct = products.find(p => p.name && p.name.trim().toLowerCase() === name.toLowerCase());
      if (existingProduct) {
        HEYS.Toast?.warning(`Продукт "${name}" уже существует в базе! Используйте другое название.`) || alert(`Продукт "${name}" уже существует в базе!`);
        return;
      }
      const base = { id: uuid(), name: name, simple100: toNum(draft.simple100), complex100: toNum(draft.complex100), protein100: toNum(draft.protein100), badFat100: toNum(draft.badFat100), goodFat100: toNum(draft.goodFat100), trans100: toNum(draft.trans100), fiber100: toNum(draft.fiber100), gi: toNum(draft.gi), harm: toNum(draft.harm), createdAt: Date.now() };
      const d = computeDerived(base);
      const newProduct = { ...base, ...d };

      // === Публикация в shared ===
      if (publishToShared && window.HEYS?.cloud) {
        try {
          // Вычисляем fingerprint для проверки дубликатов
          const fingerprint = window.HEYS?.models?.computeProductFingerprint?.(newProduct);
          if (fingerprint) {
            // Проверяем: есть ли в shared продукт с таким fingerprint (через YandexAPI)
            let existing = null;
            if (window.HEYS.YandexAPI) {
              const { data } = await window.HEYS.YandexAPI.rest('shared_products', {
                select: 'id,name,simple100,complex100,protein100,badfat100,goodfat100,trans100,fiber100,gi,harm',
                'eq.fingerprint': fingerprint,
                limit: 1
              });
              existing = data?.[0] || null;
            }

            if (existing) {
              // Показываем модалку мягкого merge
              setMergeModal({ show: true, existing, draft: newProduct });
              return; // Не закрываем модалку создания — ждём решения
            }
          }

          // Публикуем в shared (async, не блокируем)
          if (isCurator) {
            // Куратор — сразу в shared_products
            window.HEYS.cloud.publishToShared?.(newProduct).catch(err => {
              console.error('[SHARED] Failed to publish:', err);
            });
          } else {
            // PIN-клиент — в pending очередь (через YandexAPI)
            const clientId = window.HEYS?.currentClientId;
            if (clientId && fingerprint) {
              const nameNorm = window.HEYS?.models?.normalizeProductName?.(name) || name.toLowerCase().trim();
              // Используем YandexAPI вместо Supabase RPC
              if (window.HEYS.YandexAPI) {
                window.HEYS.YandexAPI.createPendingProduct({
                  client_id: clientId,
                  product_data: newProduct,
                  name_norm: nameNorm,
                  fingerprint: fingerprint
                }).catch(err => {
                  console.error('[SHARED] Failed to create pending:', err);
                });
              }
            }
          }
        } catch (err) {
          console.error('[SHARED] Error during publish check:', err);
        }
      }

      setProducts([...products, newProduct]);
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', 1);
      }
      resetDraft();
      setShowModal(false);
    }

    /**
     * 🆕 v4.8.0: Cascade update meal item names after product rename
     * Updates item.name in all stored days that reference the renamed product
     * @param {string} productId - ID of the renamed product
     * @param {string} oldName - Old product name
     * @param {string} newName - New product name
     * @returns {number} Number of updated items
     */
    function cascadeUpdateMealItemNames(productId, oldName, newName) {
      if (!productId || !oldName || !newName || oldName === newName) return 0;

      let totalUpdated = 0;
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 90); // Last 90 days

      // Iterate through last 90 days
      for (let d = new Date(today); d >= startDate; d.setDate(d.getDate() - 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const dayKey = `heys_dayv2_${dateStr}`;

        try {
          const dayData = window.HEYS?.store?.get?.(dayKey) || lsGet(dayKey);
          if (!dayData || !Array.isArray(dayData.meals)) continue;

          let dayModified = false;

          dayData.meals.forEach(meal => {
            if (!Array.isArray(meal.items)) return;

            meal.items.forEach(item => {
              // Match by product_id (primary) or by old name (fallback)
              const matchById = item.product_id != null && String(item.product_id).toLowerCase() === String(productId).toLowerCase();
              const matchByName = !matchById && item.name && item.name.trim().toLowerCase() === oldName.trim().toLowerCase();

              if (matchById || matchByName) {
                item.name = newName;
                dayModified = true;
                totalUpdated++;
              }
            });
          });

          if (dayModified) {
            dayData.updatedAt = Date.now();
            if (window.HEYS?.store?.set) {
              window.HEYS.store.set(dayKey, dayData);
            } else {
              lsSet(dayKey, dayData);
            }
          }
        } catch (err) {
          console.warn('[CASCADE] Error updating day', dateStr, err);
        }
      }

      if (totalUpdated > 0) {
        window.DEV?.log?.(`[CASCADE] Updated ${totalUpdated} meal items from "${oldName}" to "${newName}"`);
        // Dispatch event for UI refresh
        window.dispatchEvent(new CustomEvent('heys:meals-updated', { detail: { reason: 'product-rename', productId, oldName, newName } }));
      }

      return totalUpdated;
    }

    function updateRow(id, patch) {
      // Проверка уникальности названия при переименовании
      if (patch.name !== undefined) {
        const newName = (patch.name || '').trim();
        if (!newName) {
          HEYS.Toast?.warning('Название не может быть пустым') || alert('Название не может быть пустым');
          return;
        }
        const existingProduct = products.find(p => p.id !== id && p.name && p.name.trim().toLowerCase() === newName.toLowerCase());
        if (existingProduct) {
          HEYS.Toast?.warning(`Продукт "${newName}" уже существует в базе!`) || alert(`Продукт "${newName}" уже существует!`);
          return;
        }
        patch.name = newName;

        // 🆕 v4.8.0: Cascade update meal item names
        const currentProduct = products.find(p => p.id === id);
        if (currentProduct && currentProduct.name !== newName) {
          cascadeUpdateMealItemNames(id, currentProduct.name, newName);
        }
      }
      // 🆕 v4.8.1: Mark as user_modified to prevent shared product overwrite
      setProducts(products.map(p => {
        if (p.id !== id) return p;
        const changed = { ...p, ...patch, user_modified: true, modified_at: Date.now() };
        const d = computeDerived(changed);
        return { ...changed, ...d };
      }));
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
    }
    function openProductNameEditor(product) {
      if (!product) return;
      const currentName = (product.name || '').trim();

      if (window.HEYS?.StepModal?.show) {
        const stepId = 'edit_product_name';
        window.HEYS.StepModal.show({
          steps: [
            {
              id: stepId,
              title: 'Название продукта',
              hint: 'Введите новое название',
              icon: '✏️',
              getInitialData: () => ({ name: currentName }),
              validate: (data) => {
                const newName = (data?.name || '').trim();
                if (!newName) return false;
                const exists = products.find(p => p.id !== product.id && p.name && p.name.trim().toLowerCase() === newName.toLowerCase());
                return !exists;
              },
              getValidationMessage: (data) => {
                const newName = (data?.name || '').trim();
                if (!newName) return 'Введите название продукта';
                const exists = products.find(p => p.id !== product.id && p.name && p.name.trim().toLowerCase() === newName.toLowerCase());
                if (exists) return `Продукт "${newName}" уже существует`;
                return null;
              },
              component: function EditProductNameStep({ data, onChange }) {
                return React.createElement('div', { className: 'mc-form' },
                  React.createElement('label', { className: 'mc-label' }, 'Название'),
                  React.createElement('input', {
                    className: 'mc-input',
                    value: data?.name || '',
                    onChange: (e) => onChange({ name: e.target.value })
                  })
                );
              }
            }
          ],
          showProgress: false,
          showGreeting: false,
          showStreak: false,
          showTip: false,
          allowSwipe: false,
          finishLabel: 'Сохранить',
          onComplete: (stepData) => {
            const newName = (stepData?.[stepId]?.name || '').trim();
            if (newName && newName !== currentName) {
              updateRow(product.id, { name: newName });
            }
          }
        });
        return;
      }

      const fallbackName = prompt('Новое название продукта', currentName);
      if (fallbackName !== null) {
        updateRow(product.id, { name: fallbackName });
      }
    }
    function openPortionsEditor(product) {
      if (!product) return;
      if (!window.HEYS?.StepModal || !window.HEYS?.AddProductStep?.PortionsStep) {
        HEYS.Toast?.warning('Модалка порций недоступна') || alert('Модалка порций недоступна');
        return;
      }

      window.HEYS.StepModal.show({
        steps: [
          {
            id: 'portions',
            title: 'Порции',
            hint: 'Настройте порции',
            icon: '🥣',
            component: window.HEYS.AddProductStep.PortionsStep,
            validate: () => true,
            hideHeaderNext: true,
            getInitialData: () => ({
              selectedProduct: product,
              portions: product.portions || []
            })
          }
        ],
        context: {
          isEditMode: true,
          editProduct: product,
          onFinish: ({ portions }) => {
            updateRow(product.id, { portions: portions || [] });
          }
        },
        showGreeting: false,
        showStreak: false,
        showTip: false,
        showProgress: false,
        allowSwipe: false,
        hidePrimaryOnFirst: true,
        title: ''
      });
    }
    async function updateSharedProductPortions(productId, portions) {
      if (!window.HEYS?.YandexAPI?.rest) {
        HEYS.Toast?.warning('API недоступен для обновления') || alert('API недоступен для обновления');
        return { ok: false };
      }

      try {
        const { error } = await window.HEYS.YandexAPI.rest('shared_products', {
          method: 'PATCH',
          data: { portions },
          filters: { 'eq.id': productId },
          select: 'id,portions'
        });

        if (error) {
          HEYS.Toast?.error('Ошибка обновления: ' + error) || alert('Ошибка обновления: ' + error);
          return { ok: false };
        }

        setAllSharedProducts(prev => prev.map(p => p.id === productId ? { ...p, portions } : p));
        HEYS.Toast?.success('Порции обновлены') || alert('Порции обновлены');
        return { ok: true };
      } catch (e) {
        const msg = e?.message || 'Ошибка обновления';
        HEYS.Toast?.error(msg) || alert(msg);
        return { ok: false };
      }
    }
    function openSharedPortionsEditor(product) {
      if (!product) return;
      if (!window.HEYS?.StepModal || !window.HEYS?.AddProductStep?.PortionsStep) {
        HEYS.Toast?.warning('Модалка порций недоступна') || alert('Модалка порций недоступна');
        return;
      }

      window.HEYS.StepModal.show({
        steps: [
          {
            id: 'portions',
            title: 'Порции',
            hint: 'Настройте порции',
            icon: '🥣',
            component: window.HEYS.AddProductStep.PortionsStep,
            validate: () => true,
            hideHeaderNext: true,
            getInitialData: () => ({
              selectedProduct: product,
              portions: product.portions || []
            })
          }
        ],
        context: {
          isEditMode: true,
          editProduct: product,
          onFinish: async ({ portions }) => {
            await updateSharedProductPortions(product.id, portions || []);
          }
        },
        showGreeting: false,
        showStreak: false,
        showTip: false,
        showProgress: false,
        allowSwipe: false,
        hidePrimaryOnFirst: true,
        title: ''
      });
    }
    function deleteRow(id) {
      // Устанавливаем флаг намеренного удаления, чтобы useEffect не заблокировал сохранение
      if (window.HEYS) {
        window.HEYS._intentionalProductDelete = true;
      }
      setProducts(products.filter(p => p.id !== id));
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
    }
    async function importAppend() {
      DEV.log('🔍 [IMPORT] Начинаем импорт в режиме добавления');
      DEV.log('📋 [IMPORT] Текст для импорта:', paste.substring(0, 200) + '...');
      DEV.log('📊 [IMPORT] Длина текста:', paste.length);

      const startTime = performance.now();
      let rows = [];
      try {
        DEV.log('🔄 [IMPORT] Вызываем parsePasted...');
        rows = await parsePasted(paste);
        DEV.log('✅ [IMPORT] parsePasted завершен успешно');
        DEV.log('📈 [IMPORT] Количество обработанных строк:', rows.length);
        DEV.log('📝 [IMPORT] Первые 3 продукта:', rows.slice(0, 3));

        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, true);
        }
      } catch (e) {
        console.error('❌ [IMPORT] Ошибка при парсинге:', e);
        console.error('📄 [IMPORT] Stack trace:', e.stack);

        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, false);
        }
        HEYS.Toast?.error('Ошибка парсинга: ' + e.message) || alert('Ошибка парсинга: ' + e.message);
        return;
      }

      if (!rows.length) {
        DEV.warn('⚠️ [IMPORT] Не удалось распознать данные');
        DEV.log('📄 [IMPORT] Исходный текст:', paste);
        HEYS.Toast?.warning('Не удалось распознать данные') || alert('Не удалось распознать данные');
        return;
      }

      DEV.log('💾 [IMPORT] Добавляем продукты к существующим');
      DEV.log('📊 [IMPORT] Было продуктов:', products.length);
      DEV.log('📊 [IMPORT] Добавляем продуктов:', rows.length);

      const newProducts = [...products, ...rows];
      DEV.log('📦 [IMPORT] Новый массив products:', newProducts.length, 'items');

      setProducts(newProducts);

      DEV.log('✅ [IMPORT] Импорт завершен успешно');

      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', rows.length);
      }
    }
    async function importReplace() {
      DEV.log('🔍 [IMPORT] Начинаем импорт в режиме замены');
      DEV.log('📋 [IMPORT] Текст для импорта:', paste.substring(0, 200) + '...');
      DEV.log('📊 [IMPORT] Длина текста:', paste.length);

      const startTime = performance.now();
      let rows = [];
      try {
        DEV.log('🔄 [IMPORT] Вызываем parsePasted...');
        rows = await parsePasted(paste);
        DEV.log('✅ [IMPORT] parsePasted завершен успешно');
        DEV.log('📈 [IMPORT] Количество обработанных строк:', rows.length);
        DEV.log('📝 [IMPORT] Первые 3 продукта:', rows.slice(0, 3));

        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, true);
        }
      } catch (e) {
        console.error('❌ [IMPORT] Ошибка при парсинге:', e);
        console.error('📄 [IMPORT] Stack trace:', e.stack);

        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, false);
        }
        HEYS.Toast?.error('Ошибка парсинга: ' + e.message) || alert('Ошибка парсинга: ' + e.message);
        return;
      }

      if (!rows.length) {
        DEV.warn('⚠️ [IMPORT] Не удалось распознать данные');
        DEV.log('📄 [IMPORT] Исходный текст:', paste);
        HEYS.Toast?.warning('Не удалось распознать данные') || alert('Не удалось распознать данные');
        return;
      }

      if (window.HEYS && window.HEYS.backupManager && typeof window.HEYS.backupManager.backupAll === 'function') {
        try {
          await window.HEYS.backupManager.backupAll({
            reason: 'import_replace',
            keys: ['heys_products'],
            includeDays: false,
            silent: true,
          });
        } catch (backupError) {
          console.error('⚠️ [IMPORT] Ошибка создания бэкапа перед заменой:', backupError);
        }
      }

      DEV.log('💾 [IMPORT] Заменяем все продукты');
      DEV.log('📊 [IMPORT] Было продуктов:', products.length);
      DEV.log('📊 [IMPORT] Новых продуктов:', rows.length);

      setProducts(rows);

      DEV.log('✅ [IMPORT] Замена завершена успешно');

      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', rows.length);
      }
    }

    // Умный импорт: добавляет новые, обновляет существующие по названию
    async function importMerge() {
      DEV.log('🔍 [IMPORT] Начинаем импорт в режиме слияния (merge)');
      DEV.log('📋 [IMPORT] Текст для импорта:', paste.substring(0, 200) + '...');

      const startTime = performance.now();
      let rows = [];
      try {
        rows = await parsePasted(paste);
        DEV.log('✅ [IMPORT] parsePasted завершен, строк:', rows.length);

        const duration = performance.now() - startTime;
        if (window.HEYS?.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, true);
        }
      } catch (e) {
        console.error('❌ [IMPORT] Ошибка при парсинге:', e);
        HEYS.Toast?.error('Ошибка парсинга: ' + e.message) || alert('Ошибка парсинга: ' + e.message);
        return;
      }

      if (!rows.length) {
        HEYS.Toast?.warning('Не удалось распознать данные') || alert('Не удалось распознать данные');
        return;
      }

      // Создаём Map существующих продуктов по нормализованному названию
      const normalize = (name) => (name || '').trim().toLowerCase();
      const existingMap = new Map();
      products.forEach((p, idx) => {
        existingMap.set(normalize(p.name), { product: p, index: idx });
      });

      let updated = 0;
      let added = 0;
      const newProducts = [...products]; // Копия для модификации

      for (const row of rows) {
        const key = normalize(row.name);
        const existing = existingMap.get(key);

        if (existing) {
          // Обновляем существующий продукт (сохраняем id)
          newProducts[existing.index] = {
            ...existing.product,
            ...row,
            id: existing.product.id // Сохраняем оригинальный id
          };
          updated++;
          DEV.log(`🔄 [MERGE] Обновлён: ${row.name}`);
        } else {
          // Добавляем новый продукт
          newProducts.push(row);
          added++;
          DEV.log(`➕ [MERGE] Добавлен: ${row.name}`);
        }
      }

      setProducts(newProducts);

      DEV.log(`✅ [IMPORT] Слияние завершено: +${added} новых, ↻${updated} обновлено`);
      HEYS.Toast?.success(`Импорт завершён: +${added} новых, ${updated} обновлено`) || alert(`Импорт завершён!`);

      if (window.HEYS?.analytics) {
        window.HEYS.analytics.trackDataOperation('products-merged', rows.length);
      }
    }

    // Функция экспорта только продуктов
    function exportProductsOnly() {
      if (!products || products.length === 0) {
        HEYS.Toast?.warning('Нет продуктов для экспорта') || alert('Нет продуктов для экспорта');
        return;
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        type: 'products_only',
        count: products.length,
        products: products
      };

      const clientId = localStorage.getItem('heys_client_current') || 'unknown';
      const cleanClientId = clientId.replace(/"/g, '').slice(0, 8);
      const fileName = `heys-products-${cleanClientId}-${new Date().toISOString().slice(0, 10)}.json`;

      const downloadJSON = window.HEYS?.ExportUtils?.downloadJSON;
      if (downloadJSON) {
        downloadJSON({ data: exportData, fileName });
      } else {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      DEV.log(`✅ [EXPORT] Экспортировано ${products.length} продуктов в ${fileName}`);
      HEYS.Toast?.success(`Экспортировано ${products.length} продуктов!`) || alert(`Экспортировано ${products.length} продуктов!`);
    }

    async function exportSharedProductsForAI() {
      try {
        let sharedProducts = HEYS.cloud?.getCachedSharedProducts?.() || [];
        if (!sharedProducts || sharedProducts.length === 0) {
          if (HEYS.YandexAPI?.rest) {
            HEYS.Toast?.info('Загружаем общую базу…') || alert('Загружаем общую базу…');
            const { data, error } = await HEYS.YandexAPI.rest('shared_products');
            if (error) {
              HEYS.Toast?.warning('Не удалось загрузить общую базу') || alert('Не удалось загрузить общую базу');
              return;
            }
            sharedProducts = Array.isArray(data) ? data : [];
          }
        }

        if (!sharedProducts || sharedProducts.length === 0) {
          HEYS.Toast?.warning('Общая база пуста') || alert('Общая база пуста');
          return;
        }

        setSharedExportCount(sharedProducts.length);

        const fieldDescriptions = window.HEYS?.SharedProductsExportFields?.getFieldDescriptions?.() || {};

        const normalizeValue = (obj, camel, snake) => {
          if (!obj) return null;
          if (obj[camel] !== undefined) return obj[camel];
          if (snake && obj[snake] !== undefined) return obj[snake];
          return null;
        };

        const normalizedProducts = sharedProducts.map((p) => ({
          id: p.id ?? null,
          name: p.name ?? null,
          simple100: normalizeValue(p, 'simple100'),
          complex100: normalizeValue(p, 'complex100'),
          protein100: normalizeValue(p, 'protein100'),
          badFat100: normalizeValue(p, 'badFat100', 'badfat100'),
          goodFat100: normalizeValue(p, 'goodFat100', 'goodfat100'),
          trans100: normalizeValue(p, 'trans100'),
          fiber100: normalizeValue(p, 'fiber100'),
          gi: normalizeValue(p, 'gi'),
          harm: HEYS.models?.normalizeHarm?.(p) ?? p.harm ?? p.harmScore ?? null,
          category: p.category ?? null,
          portions: p.portions ?? null,
          sodium100: normalizeValue(p, 'sodium100'),
          nova_group: normalizeValue(p, 'nova_group', 'novaGroup'),
          vitamin_a: normalizeValue(p, 'vitamin_a', 'vitaminA'),
          vitamin_c: normalizeValue(p, 'vitamin_c', 'vitaminC'),
          vitamin_d: normalizeValue(p, 'vitamin_d', 'vitaminD'),
          vitamin_e: normalizeValue(p, 'vitamin_e', 'vitaminE'),
          vitamin_k: normalizeValue(p, 'vitamin_k', 'vitaminK'),
          vitamin_b1: normalizeValue(p, 'vitamin_b1', 'vitaminB1'),
          vitamin_b2: normalizeValue(p, 'vitamin_b2', 'vitaminB2'),
          vitamin_b3: normalizeValue(p, 'vitamin_b3', 'vitaminB3'),
          vitamin_b6: normalizeValue(p, 'vitamin_b6', 'vitaminB6'),
          vitamin_b9: normalizeValue(p, 'vitamin_b9', 'vitaminB9'),
          vitamin_b12: normalizeValue(p, 'vitamin_b12', 'vitaminB12'),
          calcium: normalizeValue(p, 'calcium'),
          iron: normalizeValue(p, 'iron'),
          magnesium: normalizeValue(p, 'magnesium'),
          phosphorus: normalizeValue(p, 'phosphorus'),
          potassium: normalizeValue(p, 'potassium'),
          zinc: normalizeValue(p, 'zinc'),
          selenium: normalizeValue(p, 'selenium'),
          iodine: normalizeValue(p, 'iodine'),
          is_organic: normalizeValue(p, 'is_organic', 'isOrganic'),
          is_whole_grain: normalizeValue(p, 'is_whole_grain', 'isWholeGrain'),
          is_fermented: normalizeValue(p, 'is_fermented', 'isFermented'),
          is_raw: normalizeValue(p, 'is_raw', 'isRaw'),
        }));

        const exportData = {
          _meta: {
            description: 'Экспорт продуктов из общей базы HEYS для проверки и корректировки ИИ',
            total_products: normalizedProducts.length,
            export_date: new Date().toISOString().slice(0, 10),
            field_descriptions: fieldDescriptions,
          },
          products: normalizedProducts,
        };

        const buildDatedFileName = window.HEYS?.ExportUtils?.buildDatedFileName;
        const fileName = buildDatedFileName
          ? buildDatedFileName('heys-shared-products')
          : `heys-shared-products-${new Date().toISOString().slice(0, 10)}.json`;
        const downloadJSON = window.HEYS?.ExportUtils?.downloadJSON;
        if (downloadJSON) {
          downloadJSON({ data: exportData, fileName });
        } else {
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        HEYS.Toast?.success(`Экспортировано ${normalizedProducts.length} общих продуктов`) || alert(`Экспортировано ${normalizedProducts.length} общих продуктов`);
      } catch (err) {
        HEYS.analytics?.trackError?.(err, { context: 'ration:exportSharedProductsForAI' });
        HEYS.Toast?.error('Ошибка экспорта общей базы') || alert('Ошибка экспорта общей базы');
      }
    }

    // Функция восстановления продуктов из общей базы (для всех клиентов)
    async function restoreFromSharedBase() {
      try {
        // 1. Показать подтверждение
        const confirmed = await (HEYS.ConfirmModal?.confirm?.({
          title: '🔄 Восстановление из общей базы',
          message: 'Добавить в вашу личную базу все продукты из общей базы, которых у вас ещё нет?',
          confirmText: 'Восстановить',
          cancelText: 'Отмена'
        }) ?? Promise.resolve(window.confirm('Восстановить продукты из общей базы? Будут добавлены только отсутствующие.')));

        if (!confirmed) return;

        // 2. Загрузить shared products
        HEYS.Toast?.info('⏳ Загружаем общую базу…');

        let sharedProducts = [];
        try {
          if (HEYS.cloud?.getAllSharedProducts) {
            const result = await HEYS.cloud.getAllSharedProducts({ limit: 1000 });
            // getAllSharedProducts может вернуть { data: [...] } или напрямую массив
            sharedProducts = Array.isArray(result) ? result : (result?.data || result?.products || []);
          } else if (HEYS.YandexAPI?.rpc) {
            const result = await HEYS.YandexAPI.rpc('get_shared_products', {
              p_search: null,
              p_limit: 1000,
              p_offset: 0
            });
            sharedProducts = Array.isArray(result) ? result : (result?.data || result?.products || []);
          } else if (HEYS.YandexAPI?.rest) {
            const { data, error } = await HEYS.YandexAPI.rest('shared_products');
            if (error) throw new Error(error);
            sharedProducts = Array.isArray(data) ? data : [];
          }
        } catch (loadErr) {
          console.error('[RESTORE] Ошибка загрузки shared products:', loadErr);
          HEYS.Toast?.error('Ошибка загрузки общей базы');
          return;
        }

        // Гарантируем что sharedProducts — массив
        if (!Array.isArray(sharedProducts)) {
          console.warn('[RESTORE] sharedProducts не массив:', typeof sharedProducts, sharedProducts);
          sharedProducts = [];
        }

        if (sharedProducts.length === 0) {
          HEYS.Toast?.warning('Общая база пуста или недоступна');
          return;
        }

        // 3. Получить текущие продукты
        const currentProducts = products || [];

        // 4. Создать индексы для быстрой дедупликации
        const existingBySharedOriginId = new Set();
        const existingByNormalizedName = new Set();

        currentProducts.forEach(p => {
          if (p.shared_origin_id) {
            existingBySharedOriginId.add(p.shared_origin_id);
          }
          if (p.name) {
            existingByNormalizedName.add(p.name.toLowerCase().trim());
          }
        });

        // 5. Найти отсутствующие продукты
        const missingProducts = sharedProducts.filter(shared => {
          // Проверка 1: по shared_origin_id (если уже клонировали этот shared продукт)
          if (existingBySharedOriginId.has(shared.id)) {
            return false;
          }
          // Проверка 2: по нормализованному имени (fallback)
          const normalizedName = (shared.name || '').toLowerCase().trim();
          if (existingByNormalizedName.has(normalizedName)) {
            return false;
          }
          return true;
        });

        if (missingProducts.length === 0) {
          HEYS.Toast?.success('✅ Все продукты из общей базы уже есть в вашей личной базе!');
          return;
        }

        // 6. Клонировать отсутствующие продукты в личную базу
        const uid = HEYS.utils?.uid || ((prefix = 'p_') => prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8));

        const newProducts = missingProducts.map(shared => {
          // Нормализация harm
          const harm = HEYS.models?.normalizeHarm?.(shared) ?? shared.harm ?? shared.harmScore ?? null;

          return {
            id: uid('p_'),
            shared_origin_id: shared.id, // Связь с оригиналом в shared базе
            name: shared.name,
            simple100: shared.simple100 ?? 0,
            complex100: shared.complex100 ?? 0,
            protein100: shared.protein100 ?? 0,
            badFat100: shared.badFat100 ?? shared.badfat100 ?? 0,
            goodFat100: shared.goodFat100 ?? shared.goodfat100 ?? 0,
            trans100: shared.trans100 ?? 0,
            fiber100: shared.fiber100 ?? 0,
            gi: shared.gi ?? 0,
            harm: harm,
            harmScore: harm,
            category: shared.category ?? null,
            portions: shared.portions ?? null,
            // Extended nutrients
            sodium100: shared.sodium100 ?? null,
            novaGroup: shared.nova_group ?? shared.novaGroup ?? null,
            // Vitamins
            vitaminA: shared.vitamin_a ?? shared.vitaminA ?? null,
            vitaminC: shared.vitamin_c ?? shared.vitaminC ?? null,
            vitaminD: shared.vitamin_d ?? shared.vitaminD ?? null,
            vitaminE: shared.vitamin_e ?? shared.vitaminE ?? null,
            vitaminK: shared.vitamin_k ?? shared.vitaminK ?? null,
            vitaminB1: shared.vitamin_b1 ?? shared.vitaminB1 ?? null,
            vitaminB2: shared.vitamin_b2 ?? shared.vitaminB2 ?? null,
            vitaminB3: shared.vitamin_b3 ?? shared.vitaminB3 ?? null,
            vitaminB6: shared.vitamin_b6 ?? shared.vitaminB6 ?? null,
            vitaminB9: shared.vitamin_b9 ?? shared.vitaminB9 ?? null,
            vitaminB12: shared.vitamin_b12 ?? shared.vitaminB12 ?? null,
            // Minerals
            calcium: shared.calcium ?? null,
            iron: shared.iron ?? null,
            magnesium: shared.magnesium ?? null,
            phosphorus: shared.phosphorus ?? null,
            potassium: shared.potassium ?? null,
            zinc: shared.zinc ?? null,
            selenium: shared.selenium ?? null,
            iodine: shared.iodine ?? null,
            // Flags
            isOrganic: shared.is_organic ?? shared.isOrganic ?? false,
            isWholeGrain: shared.is_whole_grain ?? shared.isWholeGrain ?? false,
            isFermented: shared.is_fermented ?? shared.isFermented ?? false,
            isRaw: shared.is_raw ?? shared.isRaw ?? false,
            // Meta
            _restoredFromShared: true,
            _restoredAt: new Date().toISOString()
          };
        });

        // 7. Сохранить объединённый массив
        const mergedProducts = [...currentProducts, ...newProducts];

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(mergedProducts);
        } else if (HEYS.store?.set) {
          HEYS.store.set('heys_products', mergedProducts);
        } else if (HEYS.utils?.lsSet) {
          HEYS.utils.lsSet('heys_products', mergedProducts);
        }

        // 8. Обновить UI
        setProducts(mergedProducts);
        if (typeof buildSearchIndex === 'function') {
          buildSearchIndex(mergedProducts);
        }

        DEV.log(`[RESTORE] Восстановлено ${newProducts.length} продуктов из общей базы`);
        HEYS.Toast?.success(`✅ Восстановлено ${newProducts.length} продуктов из общей базы!`);

        if (window.HEYS?.analytics?.trackDataOperation) {
          window.HEYS.analytics.trackDataOperation('products-restored-from-shared', { count: newProducts.length });
        }

      } catch (err) {
        console.error('[RESTORE] Ошибка восстановления:', err);
        HEYS.analytics?.trackError?.(err, { context: 'ration:restoreFromSharedBase' });
        HEYS.Toast?.error('Ошибка восстановления: ' + (err.message || err)) || alert('Ошибка восстановления: ' + (err.message || err));
      }
    }

    // Функция импорта из JSON файла
    async function importFromFile(file) {
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        DEV.log('[IMPORT FILE] Загружен файл:', file.name);
        DEV.log('[IMPORT FILE] Структура:', Object.keys(data));

        // Определяем формат файла
        let importedProducts = [];

        // Формат полного бэкапа HEYS (exportFullBackup)
        if (data.products && Array.isArray(data.products)) {
          importedProducts = data.products;
          DEV.log('[IMPORT FILE] Формат: полный бэкап HEYS, продуктов:', importedProducts.length);
        }
        // Формат просто массива продуктов
        else if (Array.isArray(data)) {
          importedProducts = data;
          DEV.log('[IMPORT FILE] Формат: массив продуктов, штук:', importedProducts.length);
        }
        else {
          HEYS.Toast?.error('Неизвестный формат файла. Ожидается JSON.') || alert('Неизвестный формат файла.');
          return;
        }

        if (importedProducts.length === 0) {
          HEYS.Toast?.warning('В файле не найдено продуктов для импорта') || alert('В файле не найдено продуктов.');
          return;
        }

        // Валидация продуктов
        const validProducts = importedProducts.filter(p => {
          if (!p.name || typeof p.name !== 'string') return false;
          return true;
        }).map(p => {
          // Гарантируем наличие всех полей
          // Use centralized harm normalization
          const harmVal = HEYS.models?.normalizeHarm?.(p) ?? toNum(p.harm ?? p.harmScore ?? p.harmscore ?? p.harm100);
          const product = {
            id: p.id || uuid(),
            name: p.name,
            simple100: toNum(p.simple100),
            complex100: toNum(p.complex100),
            protein100: toNum(p.protein100),
            badFat100: toNum(p.badFat100),
            goodFat100: toNum(p.goodFat100),
            trans100: toNum(p.trans100),
            fiber100: toNum(p.fiber100),
            gi: toNum(p.gi || p.gi100 || p.GI || p.giIndex),
            harm: harmVal,  // Canonical field
            createdAt: p.createdAt || Date.now()
          };
          // Вычисляем производные поля
          return { ...product, ...computeDerived(product) };
        });

        if (validProducts.length === 0) {
          HEYS.Toast?.warning('Не найдено валидных продуктов для импорта') || alert('Не найдено валидных продуктов.');
          return;
        }

        // ─────────────────────────────────────────
        // ПРЕДВАРИТЕЛЬНЫЙ АНАЛИЗ: что именно будет импортировано
        // ─────────────────────────────────────────
        const normalize = (name) => (name || '').trim().toLowerCase();
        const existingMap = new Map();
        products.forEach((p, idx) => {
          existingMap.set(normalize(p.name), { product: p, index: idx });
        });

        // Подсчитываем новые и обновляемые
        let willBeAdded = 0;
        let willBeUpdated = 0;
        const newProductNames = [];
        const updateProductNames = [];

        for (const row of validProducts) {
          const key = normalize(row.name);
          if (existingMap.has(key)) {
            willBeUpdated++;
            if (updateProductNames.length < 5) updateProductNames.push(row.name);
          } else {
            willBeAdded++;
            if (newProductNames.length < 5) newProductNames.push(row.name);
          }
        }

        // Формируем детальное сообщение
        let previewMessage = `📦 Найдено ${validProducts.length} продуктов в файле\n\n`;

        if (willBeAdded > 0) {
          previewMessage += `✅ Новых (добавятся): ${willBeAdded}\n`;
          if (newProductNames.length > 0) {
            previewMessage += `   • ${newProductNames.join('\n   • ')}`;
            if (willBeAdded > 5) previewMessage += `\n   ... и ещё ${willBeAdded - 5}`;
            previewMessage += '\n\n';
          }
        }

        if (willBeUpdated > 0) {
          previewMessage += `🔄 Существующих (обновятся): ${willBeUpdated}\n`;
          if (updateProductNames.length > 0) {
            previewMessage += `   • ${updateProductNames.join('\n   • ')}`;
            if (willBeUpdated > 5) previewMessage += `\n   ... и ещё ${willBeUpdated - 5}`;
            previewMessage += '\n\n';
          }
        }

        previewMessage += `Текущая база: ${products.length} продуктов\n`;
        previewMessage += `После импорта: ${products.length + willBeAdded} продуктов\n\n`;
        previewMessage += `Продолжить импорт?`;

        // Спрашиваем подтверждение с детальным preview
        const confirmed = await (HEYS.ConfirmModal?.confirm?.({
          title: '📤 Импорт продуктов',
          message: previewMessage,
          confirmText: `Импортировать (${willBeAdded} новых${willBeUpdated > 0 ? `, ${willBeUpdated} обновить` : ''})`,
          cancelText: 'Отмена'
        }) ?? Promise.resolve(window.confirm(previewMessage)));

        if (!confirmed) {
          DEV.log('[IMPORT FILE] Импорт отменён пользователем');
          return;
        }

        // ─────────────────────────────────────────
        // ВЫПОЛНЯЕМ ИМПОРТ
        // ─────────────────────────────────────────
        let updated = 0;
        let added = 0;
        const newProducts = [...products];

        for (const row of validProducts) {
          const key = normalize(row.name);
          const existing = existingMap.get(key);

          if (existing) {
            newProducts[existing.index] = {
              ...existing.product,
              ...row,
              id: existing.product.id
            };
            updated++;
          } else {
            newProducts.push(row);
            existingMap.set(key, { product: row, index: newProducts.length - 1 });
            added++;
          }
        }

        setProducts(newProducts);

        DEV.log(`✅ [IMPORT FILE] Завершено: +${added} новых, ↻${updated} обновлено`);
        HEYS.Toast?.success(`✅ Импорт завершён!\n+${added} новых, ${updated} обновлено`) || alert(`Импорт завершён!`);

        if (window.HEYS?.analytics) {
          window.HEYS.analytics.trackDataOperation('products-imported-file', validProducts.length);
        }

      } catch (err) {
        console.error('[IMPORT FILE] Ошибка:', err);
        HEYS.Toast?.error('Ошибка чтения файла: ' + err.message) || alert('Ошибка чтения файла: ' + err.message);
      }
    }

    // === PHASE 2: Helper функции для UI ===

    const formatTableValue = (value) => {
      if (value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value))) return '—';
      return value;
    };

    const formatTableBool = (value) => {
      if (value === true) return 'да';
      if (value === false) return 'нет';
      return '—';
    };

    const formatTableList = (value) => {
      if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
      if (value === null || value === undefined || value === '') return '—';
      return String(value);
    };

    // Одобрить pending заявку
    async function approvePending(pending) {
      try {
        // Передаём и pendingId и productData
        const result = await window.HEYS?.cloud?.approvePendingProduct?.(pending.id, pending.product_data);
        if (result?.error) {
          HEYS.Toast?.error('Ошибка: ' + result.error.message) || alert('Ошибка: ' + result.error.message);
          return;
        }
        // Обновляем список
        setPendingProducts(prev => prev.filter(p => p.id !== pending.id));
        if (result.existing) {
          HEYS.Toast?.info(`Продукт "${pending.product_data?.name || pending.name_norm}" уже существует в общей базе`) || alert(`ℹ️ Продукт "${pending.product_data?.name || pending.name_norm}" уже существует в общей базе`);
        } else {
          HEYS.Toast?.success(`Продукт "${pending.product_data?.name || pending.name_norm}" добавлен в общую базу!`) || alert(`✅ Продукт "${pending.product_data?.name || pending.name_norm}" добавлен в общую базу!`);
        }
      } catch (err) {
        console.error('[APPROVE] Error:', err);
        HEYS.Toast?.error('Ошибка при подтверждении: ' + err.message) || alert('Ошибка при подтверждении: ' + err.message);
      }
    }

    // Отклонить pending заявку
    async function rejectPending(pending, reason = '') {
      try {
        const result = await window.HEYS?.cloud?.rejectPendingProduct?.(pending.id, reason);
        if (result?.error) {
          HEYS.Toast?.error('Ошибка: ' + result.error.message) || alert('Ошибка: ' + result.error.message);
          return;
        }
        // Обновляем список
        setPendingProducts(prev => prev.filter(p => p.id !== pending.id));
        HEYS.Toast?.info(`Заявка "${pending.product_data?.name || pending.name_norm}" отклонена`) || alert(`❌ Заявка "${pending.product_data?.name || pending.name_norm}" отклонена`);
      } catch (err) {
        console.error('[REJECT] Error:', err);
        HEYS.Toast?.error('Ошибка при отклонении: ' + err.message) || alert('Ошибка при отклонении: ' + err.message);
      }
    }

    // Клонировать shared продукт в личную базу
    function cloneSharedProduct(sharedProduct) {
      // Проверяем, нет ли уже клона этого продукта
      const existingClone = products.find(p => p.shared_origin_id === sharedProduct.id);
      if (existingClone) {
        HEYS.Toast?.warning(`Продукт "${sharedProduct.name}" уже есть в вашей базе!`) || alert(`⚠️ Продукт "${sharedProduct.name}" уже есть в вашей базе!`);
        return existingClone;
      }

      // Создаём клон
      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(sharedProduct);
      const clone = {
        id: uuid(),
        name: sharedProduct.name,
        simple100: toNum(sharedProduct.simple100),
        complex100: toNum(sharedProduct.complex100),
        protein100: toNum(sharedProduct.protein100),
        badFat100: toNum(sharedProduct.badfat100), // lowercase from Supabase
        goodFat100: toNum(sharedProduct.goodfat100),
        trans100: toNum(sharedProduct.trans100),
        fiber100: toNum(sharedProduct.fiber100),
        gi: toNum(sharedProduct.gi),
        harm: harmVal,  // Canonical field
        category: sharedProduct.category || '',
        portions: sharedProduct.portions || null,
        sodium100: toNum(sharedProduct.sodium100),
        omega3_100: toNum(sharedProduct.omega3_100),
        omega6_100: toNum(sharedProduct.omega6_100),
        nova_group: toNum(sharedProduct.nova_group ?? sharedProduct.novaGroup),
        additives: sharedProduct.additives || null,
        nutrient_density: toNum(sharedProduct.nutrient_density ?? sharedProduct.nutrientDensity),
        is_organic: sharedProduct.is_organic ?? sharedProduct.isOrganic ?? null,
        is_whole_grain: sharedProduct.is_whole_grain ?? sharedProduct.isWholeGrain ?? null,
        is_fermented: sharedProduct.is_fermented ?? sharedProduct.isFermented ?? null,
        is_raw: sharedProduct.is_raw ?? sharedProduct.isRaw ?? null,
        vitamin_a: toNum(sharedProduct.vitamin_a),
        vitamin_c: toNum(sharedProduct.vitamin_c),
        vitamin_d: toNum(sharedProduct.vitamin_d),
        vitamin_e: toNum(sharedProduct.vitamin_e),
        vitamin_k: toNum(sharedProduct.vitamin_k),
        vitamin_b1: toNum(sharedProduct.vitamin_b1),
        vitamin_b2: toNum(sharedProduct.vitamin_b2),
        vitamin_b3: toNum(sharedProduct.vitamin_b3),
        vitamin_b6: toNum(sharedProduct.vitamin_b6),
        vitamin_b9: toNum(sharedProduct.vitamin_b9),
        vitamin_b12: toNum(sharedProduct.vitamin_b12),
        calcium: toNum(sharedProduct.calcium),
        iron: toNum(sharedProduct.iron),
        magnesium: toNum(sharedProduct.magnesium),
        phosphorus: toNum(sharedProduct.phosphorus),
        potassium: toNum(sharedProduct.potassium),
        zinc: toNum(sharedProduct.zinc),
        selenium: toNum(sharedProduct.selenium),
        iodine: toNum(sharedProduct.iodine),
        shared_origin_id: sharedProduct.id, // Связь с shared продуктом
        shared_updated_at: sharedProduct.updated_at || null, // Время обновления в shared (для приоритета)
        cloned_at: Date.now(), // Когда клонировали (для сравнения с shared_updated_at)
        user_modified: false, // Пользователь не редактировал (приоритет shared если обновился)
        createdAt: Date.now()
      };

      // Добавляем derived поля
      const withDerived = { ...clone, ...computeDerived(clone) };

      // Добавляем в локальную базу
      const newProducts = [...products, withDerived];
      setProducts(newProducts);

      HEYS.Toast?.success(`Продукт "${sharedProduct.name}" добавлен в вашу базу!`) || alert(`✅ Продукт "${sharedProduct.name}" добавлен в вашу базу!`);
      return withDerived;
    }

    // Скрыть продукт (blocklist)
    async function hideSharedProduct(productId) {
      try {
        const result = await window.HEYS?.cloud?.blockProduct?.(productId);
        if (result?.error) {
          HEYS.Toast?.error('Ошибка: ' + result.error.message) || alert('Ошибка: ' + result.error.message);
          return;
        }
        // Убираем из результатов поиска
        setSharedResults(prev => prev.filter(p => p.id !== productId));
        HEYS.Toast?.info('Продукт скрыт для вас и ваших клиентов') || alert('🚫 Продукт скрыт для вас и ваших клиентов');
      } catch (err) {
        console.error('[BLOCKLIST] Error:', err);
        HEYS.Toast?.error('Ошибка: ' + err.message) || alert('Ошибка: ' + err.message);
      }
    }

    // 🗑️ Удаление продукта из общей базы (только куратор или автор)
    async function deleteSharedProduct(productId, productName) {
      const confirmed = confirm(`🗑️ Удалить "${productName}" из общей базы?\n\nПродукт больше не будет находиться другими пользователями.\nУ тех, кто уже добавил его в личную базу — он останется.`);
      if (!confirmed) return;

      try {
        const result = await window.HEYS?.cloud?.deleteSharedProduct?.(productId);
        if (!result?.success) {
          HEYS.Toast?.error('Ошибка: ' + (result?.error || 'Неизвестная ошибка')) || alert('Ошибка: ' + (result?.error || 'Неизвестная ошибка'));
          return;
        }

        // Убираем из списка
        setAllSharedProducts(prev => prev.filter(p => p.id !== productId));
        setSharedResults(prev => prev.filter(p => p.id !== productId));

        HEYS.Toast?.success(`Продукт "${productName}" удалён из общей базы`) || alert(`✅ Продукт "${productName}" удалён из общей базы`);
      } catch (err) {
        console.error('[DELETE SHARED] Error:', err);
        HEYS.Toast?.error('Ошибка: ' + err.message) || alert('Ошибка: ' + err.message);
      }
    }

    // Клонирование shared продукта в личную базу (anti-orphan)
    function cloneSharedToPersonal(sharedProduct) {
      // Проверяем: есть ли уже клон этого shared продукта
      const existingClone = products.find(p => p.shared_origin_id === sharedProduct.id);
      if (existingClone) {
        return existingClone; // Возвращаем существующий клон
      }

      // Создаём новый клон с shared_origin_id
      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(sharedProduct);
      const clone = {
        id: uuid(),
        name: sharedProduct.name,
        simple100: sharedProduct.simple100 || 0,
        complex100: sharedProduct.complex100 || 0,
        protein100: sharedProduct.protein100 || 0,
        badFat100: sharedProduct.badfat100 || sharedProduct.badFat100 || 0,
        goodFat100: sharedProduct.goodfat100 || sharedProduct.goodFat100 || 0,
        trans100: sharedProduct.trans100 || 0,
        fiber100: sharedProduct.fiber100 || 0,
        gi: sharedProduct.gi || 0,
        harm: harmVal,  // Canonical field
        category: sharedProduct.category || '',
        portions: sharedProduct.portions || null,
        sodium100: toNum(sharedProduct.sodium100),
        omega3_100: toNum(sharedProduct.omega3_100),
        omega6_100: toNum(sharedProduct.omega6_100),
        nova_group: toNum(sharedProduct.nova_group ?? sharedProduct.novaGroup),
        additives: sharedProduct.additives || null,
        nutrient_density: toNum(sharedProduct.nutrient_density ?? sharedProduct.nutrientDensity),
        is_organic: sharedProduct.is_organic ?? sharedProduct.isOrganic ?? null,
        is_whole_grain: sharedProduct.is_whole_grain ?? sharedProduct.isWholeGrain ?? null,
        is_fermented: sharedProduct.is_fermented ?? sharedProduct.isFermented ?? null,
        is_raw: sharedProduct.is_raw ?? sharedProduct.isRaw ?? null,
        vitamin_a: toNum(sharedProduct.vitamin_a),
        vitamin_c: toNum(sharedProduct.vitamin_c),
        vitamin_d: toNum(sharedProduct.vitamin_d),
        vitamin_e: toNum(sharedProduct.vitamin_e),
        vitamin_k: toNum(sharedProduct.vitamin_k),
        vitamin_b1: toNum(sharedProduct.vitamin_b1),
        vitamin_b2: toNum(sharedProduct.vitamin_b2),
        vitamin_b3: toNum(sharedProduct.vitamin_b3),
        vitamin_b6: toNum(sharedProduct.vitamin_b6),
        vitamin_b9: toNum(sharedProduct.vitamin_b9),
        vitamin_b12: toNum(sharedProduct.vitamin_b12),
        calcium: toNum(sharedProduct.calcium),
        iron: toNum(sharedProduct.iron),
        magnesium: toNum(sharedProduct.magnesium),
        phosphorus: toNum(sharedProduct.phosphorus),
        potassium: toNum(sharedProduct.potassium),
        zinc: toNum(sharedProduct.zinc),
        selenium: toNum(sharedProduct.selenium),
        iodine: toNum(sharedProduct.iodine),
        shared_origin_id: sharedProduct.id, // Связь с shared
        shared_updated_at: sharedProduct.updated_at || null, // Время обновления в shared
        cloned_at: Date.now(), // Когда клонировали
        user_modified: false, // Пользователь не редактировал
        createdAt: Date.now()
      };
      const d = computeDerived(clone);
      const newProduct = { ...clone, ...d };

      // Добавляем в products
      setProducts(prev => [...prev, newProduct]);

      return newProduct;
    }

    // Обработка выбора продукта (с клонированием shared)
    function handleProductSelect(product) {
      if (product._source === 'shared') {
        // Клонируем shared в личную базу
        return cloneSharedToPersonal(product);
      }
      return product;
    }

    // Обработка мягкого merge — использовать существующий
    function handleMergeUseExisting() {
      const { existing } = mergeModal;
      if (!existing) return;

      // Клонируем existing из shared в личную базу
      cloneSharedToPersonal(existing);

      // Закрываем обе модалки
      setMergeModal({ show: false, existing: null, draft: null });
      resetDraft();
      setShowModal(false);
    }

    // Обработка мягкого merge — создать свой (НЕ публиковать в shared)
    function handleMergeCreateOwn() {
      const { draft: draftProduct } = mergeModal;
      if (!draftProduct) return;

      // Добавляем только в личную базу (без публикации в shared)
      setProducts(prev => [...prev, draftProduct]);

      // Закрываем модалки
      setMergeModal({ show: false, existing: null, draft: null });
      resetDraft();
      setShowModal(false);
    }

    // На вкладке "Личные" показываем только личные продукты (без комбинированного поиска)
    // Комбинированный поиск перенесён в модалку добавления продукта в приём пищи

    return React.createElement('div', { className: 'page page-ration' },
      // === ПОДВКЛАДКИ (Subtabs) ===
      React.createElement('div', { className: 'card', style: { marginBottom: '8px', padding: '8px 12px' } },
        React.createElement('div', {
          className: 'ration-subtabs',
          style: { display: 'flex', gap: '4px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: '8px', padding: '4px' }
        },
          // 👤 Личные продукты (для клиента: "Мои", для куратора: "Клиента")
          React.createElement('button', {
            className: activeSubtab === 'personal' ? 'btn acc' : 'btn',
            onClick: () => setActiveSubtab('personal'),
            style: { flex: 1, borderRadius: '6px' }
          }, isCurator ? '👤 Личные' : '👤 Мои продукты'),
          // 🌐 Общая база (только для куратора)
          isCurator && React.createElement('button', {
            className: activeSubtab === 'shared' ? 'btn acc' : 'btn',
            onClick: () => setActiveSubtab('shared'),
            style: { flex: 1, borderRadius: '6px', position: 'relative' }
          },
            '🌐 Общая база',
            // Бейдж pending
            pendingProducts.length > 0 && React.createElement('span', {
              style: {
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: '50%',
                minWidth: '18px',
                height: '18px',
                fontSize: '11px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }
            }, pendingProducts.length)
          )
        )
      ),

      // === КОНТЕНТ ПОДВКЛАДКИ ===
      activeSubtab === 'personal' ? (
        // ============================================
        // 👤 ПОДВКЛАДКА: Продукты клиента
        // ============================================
        React.createElement(React.Fragment, null,

          // === БЭКАП И ВОССТАНОВЛЕНИЕ (collapsible) ===
          React.createElement('div', {
            className: 'card',
            style: { marginBottom: '8px', padding: '0', overflow: 'hidden' }
          },
            // Заголовок (кликабельный для раскрытия)
            React.createElement('div', {
              onClick: () => setShowBackupSection(!showBackupSection),
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', cursor: 'pointer',
                background: showBackupSection ? 'var(--bg-secondary, #f9fafb)' : 'transparent',
                transition: 'background 0.2s'
              }
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '18px' } }, '💾'),
                React.createElement('span', { style: { fontWeight: '500', fontSize: '14px' } }, 'Бэкап и восстановление')
              ),
              React.createElement('span', {
                style: { fontSize: '12px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showBackupSection ? 'rotate(180deg)' : 'rotate(0deg)' }
              }, '▼')
            ),
            // Контент (показывается при раскрытии)
            showBackupSection && React.createElement('div', { style: { padding: '0 16px 16px', borderTop: '1px solid var(--border-color, #e5e5e5)' } },

              // ─────────────────────────────────────────
              // 📥 СКАЧАТЬ БЭКАП
              // ─────────────────────────────────────────
              React.createElement('div', {
                style: { marginTop: '16px', padding: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '8px', border: '1px solid #93c5fd' }
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
                  React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#1e40af', marginBottom: '4px' } }, '📥 Скачать полный бэкап'),
                    React.createElement('div', { style: { fontSize: '12px', color: '#3b82f6' } }, 'Продукты + дневник + профиль + общая база')
                  ),
                  React.createElement('button', {
                    className: 'btn acc',
                    onClick: async () => {
                      if (window.HEYS && window.HEYS.exportFullBackup) {
                        const result = await window.HEYS.exportFullBackup();
                        if (result && result.ok) {
                          HEYS.Toast?.success(`✅ Бэкап сохранён!\n📦 Продуктов: ${result.products}\n🌐 Общих: ${result.sharedProducts || 0}\n📅 Дней: ${result.days}`);
                        }
                      } else {
                        HEYS.Toast?.warning('Функция экспорта недоступна');
                      }
                    },
                    style: { whiteSpace: 'nowrap', background: '#3b82f6', borderColor: '#2563eb' }
                  }, '💾 Скачать')
                )
              ),

              // ─────────────────────────────────────────
              // 📤 ВОССТАНОВИТЬ ИЗ ФАЙЛА
              // ─────────────────────────────────────────
              React.createElement('div', {
                style: { marginTop: '12px', padding: '12px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '8px', border: '1px solid #86efac' }
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
                  React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#166534', marginBottom: '4px' } }, '📤 Восстановить из файла'),
                    React.createElement('div', { style: { fontSize: '12px', color: '#15803d' } }, 'Загрузить продукты из бэкапа')
                  ),
                  React.createElement('label', {
                    className: 'btn acc',
                    style: { whiteSpace: 'nowrap', background: '#22c55e', borderColor: '#16a34a', cursor: 'pointer' }
                  },
                    '📂 Выбрать файл',
                    React.createElement('input', {
                      type: 'file',
                      accept: '.json,application/json',
                      style: { display: 'none' },
                      onChange: (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          importFromFile(file);
                          e.target.value = '';
                        }
                      }
                    })
                  )
                )
              ),

              // ─────────────────────────────────────────
              // 🔄 СИНХРОНИЗАЦИЯ С ОБЩЕЙ БАЗОЙ
              // ─────────────────────────────────────────
              React.createElement('div', {
                style: { marginTop: '12px', padding: '12px', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '8px', border: '1px solid var(--border-color, #e5e5e5)' }
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
                  React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: '500', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' } }, '🔄 Синхронизация с общей базой'),
                    React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'Добавить недостающие продукты из серверной базы')
                  ),
                  React.createElement('button', {
                    className: 'btn',
                    onClick: restoreFromSharedBase,
                    style: { whiteSpace: 'nowrap' }
                  }, 'Синхронизировать')
                )
              ),

              // ─────────────────────────────────────────
              // 🔧 Для куратора (если есть)
              // ─────────────────────────────────────────
              isCurator && React.createElement('div', {
                style: { marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed var(--border-color, #e5e5e5)' }
              },
                React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, '🔧 Инструменты куратора'),

                // Только продукты клиента
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '14px' } }, '🥗'),
                    React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, `Только продукты (${products.length} шт)`)
                  ),
                  React.createElement('button', {
                    className: 'btn',
                    onClick: exportProductsOnly,
                    style: { padding: '4px 10px', fontSize: '11px' }
                  }, 'Скачать')
                ),

                // Общая база для AI
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '14px' } }, '🌐'),
                    React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Общая база для AI'),
                    sharedExportCount != null && React.createElement('span', {
                      style: { fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px' }
                    }, sharedExportCount)
                  ),
                  React.createElement('button', {
                    className: 'btn',
                    onClick: exportSharedProductsForAI,
                    style: { padding: '4px 10px', fontSize: '11px' }
                  }, 'Скачать')
                )
              )
            )
          ),

          // === ТАБЛИЦА ПРОДУКТОВ ===
          React.createElement('div', { className: 'card tone-blue' },
            React.createElement('div', { className: 'topbar' },
              React.createElement('div', { className: 'row' },
                React.createElement('input', { placeholder: 'Поиск по названию…', value: query, onChange: e => setQuery(e.target.value), style: { minWidth: '260px' } }),
                React.createElement('span', { className: 'muted' }, `Найдено: ${filtered.length} из ${products.length}`)
              ),
              React.createElement('div', { className: 'row' },
                React.createElement('button', { className: 'btn acc', onClick: () => setShowModal(true) }, '+ Добавить продукт')
              )
            ),
            React.createElement('div', { className: 'products-table-scroll' },
              React.createElement('table', { className: 'products-table' },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', null, 'Название'),
                    React.createElement('th', { title: 'Калории на 100г' }, 'Ккал'),
                    React.createElement('th', { title: 'Углеводы (авто)' }, 'У'),
                    React.createElement('th', { title: 'Простые углеводы' }, 'Пр'),
                    React.createElement('th', { title: 'Сложные углеводы' }, 'Сл'),
                    React.createElement('th', { title: 'Белки' }, 'Б'),
                    React.createElement('th', { title: 'Жиры (авто)' }, 'Ж'),
                    React.createElement('th', { title: 'Вредные жиры' }, 'Вр'),
                    React.createElement('th', { title: 'Полезные жиры' }, 'Пол'),
                    React.createElement('th', { title: 'Транс-жиры' }, 'Тр'),
                    React.createElement('th', { title: 'Клетчатка' }, 'Кл'),
                    React.createElement('th', { title: 'Гликемический индекс' }, 'ГИ'),
                    React.createElement('th', { title: 'Индекс вредности' }, 'Вред'),
                    React.createElement('th', { title: 'Натрий (мг/100г)' }, 'Na'),
                    React.createElement('th', { title: 'Омега-3 (г/100г)' }, 'Ω3'),
                    React.createElement('th', { title: 'Омега-6 (г/100г)' }, 'Ω6'),
                    React.createElement('th', { title: 'NOVA группа' }, 'NOVA'),
                    React.createElement('th', { title: 'Добавки (E-коды)' }, 'Add'),
                    React.createElement('th', { title: 'Нутриентная плотность (0–100)' }, 'ND'),
                    React.createElement('th', { title: 'Органик' }, 'Org'),
                    React.createElement('th', { title: 'Цельнозерновой' }, 'ЦЗ'),
                    React.createElement('th', { title: 'Ферментированный' }, 'Ферм'),
                    React.createElement('th', { title: 'Сырой' }, 'Raw'),
                    React.createElement('th', { title: 'Витамин A (% DV)' }, 'A'),
                    React.createElement('th', { title: 'Витамин C (% DV)' }, 'C'),
                    React.createElement('th', { title: 'Витамин D (% DV)' }, 'D'),
                    React.createElement('th', { title: 'Витамин E (% DV)' }, 'E'),
                    React.createElement('th', { title: 'Витамин K (% DV)' }, 'K'),
                    React.createElement('th', { title: 'Витамин B1 (% DV)' }, 'B1'),
                    React.createElement('th', { title: 'Витамин B2 (% DV)' }, 'B2'),
                    React.createElement('th', { title: 'Витамин B3 (% DV)' }, 'B3'),
                    React.createElement('th', { title: 'Витамин B6 (% DV)' }, 'B6'),
                    React.createElement('th', { title: 'Витамин B9 (% DV)' }, 'B9'),
                    React.createElement('th', { title: 'Витамин B12 (% DV)' }, 'B12'),
                    React.createElement('th', { title: 'Кальций (% DV)' }, 'Ca'),
                    React.createElement('th', { title: 'Железо (% DV)' }, 'Fe'),
                    React.createElement('th', { title: 'Магний (% DV)' }, 'Mg'),
                    React.createElement('th', { title: 'Фосфор (% DV)' }, 'P'),
                    React.createElement('th', { title: 'Калий (% DV)' }, 'K'),
                    React.createElement('th', { title: 'Цинк (% DV)' }, 'Zn'),
                    React.createElement('th', { title: 'Селен (% DV)' }, 'Se'),
                    React.createElement('th', { title: 'Йод (% DV)' }, 'I'),
                    React.createElement('th', { title: 'Порции' }, 'Порц'),
                    React.createElement('th', null, '')
                  )
                ),
                React.createElement('tbody', null,
                  // Ограничиваем рендеринг для производительности (29k+ продуктов = тормоза)
                  // 🛡️ v4.8.1: Используем `id_index` как key для предотвращения дубликатов
                  (showAll ? filtered : filtered.slice(0, DISPLAY_LIMIT)).map((p, idx) => React.createElement('tr', { key: `${p.id}_${idx}` },
                    React.createElement('td', null,
                      React.createElement('div', { className: 'product-name-cell' },
                        React.createElement('button', {
                          className: 'product-name-edit',
                          onClick: () => openProductNameEditor(p),
                          title: 'Переименовать',
                          'aria-label': 'Переименовать'
                        }, '✏️'),
                        React.createElement('span', { className: 'product-name-text' }, p.name)
                      )
                    ),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.kcal100, readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.carbs100, readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.simple100, onChange: e => updateRow(p.id, { simple100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.complex100, onChange: e => updateRow(p.id, { complex100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.protein100, onChange: e => updateRow(p.id, { protein100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.fat100, readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.badFat100, onChange: e => updateRow(p.id, { badFat100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.goodFat100, onChange: e => updateRow(p.id, { goodFat100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.trans100, onChange: e => updateRow(p.id, { trans100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.fiber100, onChange: e => updateRow(p.id, { fiber100: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.gi, onChange: e => updateRow(p.id, { gi: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: HEYS.models?.normalizeHarm?.(p) ?? p.harm ?? p.harmScore ?? p.harmscore ?? p.harm100 ?? 0, onChange: e => updateRow(p.id, { harm: toNum(e.target.value) }) })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.sodium100), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.omega3_100), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.omega6_100), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.nova_group), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableList(p.additives), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.nutrient_density), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_organic), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_whole_grain), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_fermented), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_raw), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_a), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_c), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_d), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_e), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_k), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b1), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b2), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b3), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b6), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b9), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b12), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.calcium), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.iron), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.magnesium), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.phosphorus), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.potassium), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.zinc), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.selenium), readOnly: true })),
                    React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.iodine), readOnly: true })),
                    React.createElement('td', null,
                      React.createElement('button', {
                        className: 'btn',
                        onClick: () => openPortionsEditor(p),
                        title: 'Редактировать порции'
                      }, `🥣 ${Array.isArray(p.portions) ? p.portions.length : 0}`)
                    ),
                    React.createElement('td', null, React.createElement('button', { className: 'btn', onClick: () => deleteRow(p.id) }, 'Удалить'))
                  ))
                )
              )
            ),
            // Кнопка "Показать ещё" если продуктов больше лимита
            filtered.length > DISPLAY_LIMIT && !showAll && React.createElement('div', { style: { textAlign: 'center', marginTop: '8px' } },
              React.createElement('button', { className: 'btn', onClick: () => setShowAll(true) },
                `Показать все ${filtered.length} продуктов (может тормозить)`
              ),
              React.createElement('div', { className: 'muted', style: { marginTop: '4px', fontSize: '12px' } },
                `Показано ${DISPLAY_LIMIT} из ${filtered.length}. Используйте поиск для быстрого нахождения.`
              )
            ),
            React.createElement('div', { className: 'muted', style: { marginTop: '8px' } }, 'Серые поля — авто: У=простые+сложные; Ж=вредные+полезные+супервредные; Ккал=4×(Б+У)+8×Ж.')
          )
        ) // Закрываем React.Fragment для личной подвкладки
      ) : (
        // ============================================
        // 🌐 ПОДВКЛАДКА: Общая база (Curator-only)
        // ============================================
        React.createElement(React.Fragment, null,
          // Блок Pending-заявок
          React.createElement('div', { className: 'card', style: { marginBottom: '8px' } },
            React.createElement('div', {
              className: 'section-title',
              style: { display: 'flex', alignItems: 'center', gap: '8px' }
            },
              '🆕 Ожидают подтверждения',
              pendingProducts.length > 0 && React.createElement('span', {
                style: {
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  fontWeight: '600'
                }
              }, pendingProducts.length)
            ),
            pendingLoading ? (
              React.createElement('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--text-muted)' } }, '⏳ Загрузка заявок...')
            ) : pendingProducts.length === 0 ? (
              React.createElement('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--text-muted)' } }, '✅ Нет заявок на модерацию')
            ) : (
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                pendingProducts.map(pending => {
                  const p = pending.product_data || {};
                  return React.createElement('div', {
                    key: pending.id,
                    className: 'card',
                    style: { padding: '12px', background: 'var(--bg-secondary, #f9fafb)', border: '1px solid var(--border-color, #e5e5e5)' }
                  },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } },
                      React.createElement('div', { style: { flex: 1 } },
                        React.createElement('div', { style: { fontWeight: '500', marginBottom: '4px' } }, p.name || pending.name_norm),
                        React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                          React.createElement('span', null, `${Math.round(p.kcal100 || ((p.protein100 || 0) * 4 + (p.simple100 || 0) * 4 + (p.complex100 || 0) * 4 + ((p.badFat100 || 0) + (p.goodFat100 || 0) + (p.trans100 || 0)) * 9))} ккал`),
                          React.createElement('span', null, `Б:${p.protein100 || 0}`),
                          React.createElement('span', null, `У:${(p.simple100 || 0) + (p.complex100 || 0)}`),
                          React.createElement('span', null, `Ж:${(p.badFat100 || 0) + (p.goodFat100 || 0) + (p.trans100 || 0)}`),
                          p.gi && React.createElement('span', null, `ГИ:${p.gi}`)
                        ),
                        React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' } },
                          `📅 ${new Date(pending.created_at).toLocaleDateString('ru-RU')}`
                        )
                      ),
                      React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                        React.createElement('button', {
                          className: 'btn acc',
                          onClick: () => approvePending(pending),
                          style: { padding: '6px 10px', fontSize: '12px' }
                        }, '✅'),
                        React.createElement('button', {
                          className: 'btn',
                          onClick: () => {
                            const reason = prompt('Причина отклонения (опционально):');
                            if (reason !== null) rejectPending(pending, reason);
                          },
                          style: { padding: '6px 10px', fontSize: '12px' }
                        }, '❌')
                      )
                    )
                  );
                })
              )
            )
          ),

          // Таблица ВСЕХ продуктов общей базы (как в личной вкладке)
          React.createElement('div', { className: 'card tone-blue' },
            React.createElement('div', { className: 'topbar' },
              React.createElement('div', { className: 'row' },
                React.createElement('input', {
                  placeholder: 'Поиск по названию…',
                  value: sharedQuery,
                  onChange: e => setSharedQuery(e.target.value),
                  style: { minWidth: '260px' }
                }),
                React.createElement('span', { className: 'muted' },
                  allSharedLoading ? '⏳ Загрузка...' : `Найдено: ${sharedQuery.length >= 2
                    ? allSharedProducts.filter(p => (p.name || '').toLowerCase().includes(sharedQuery.toLowerCase())).length
                    : allSharedProducts.length
                    } из ${allSharedProducts.length}`
                )
              ),
              React.createElement('button', {
                className: 'btn acc',
                onClick: loadAllSharedProducts,
                style: { marginLeft: '8px' }
              }, '🔄 Обновить')
            ),
            allSharedLoading ? (
              React.createElement('div', { style: { padding: '32px', textAlign: 'center', color: 'var(--text-muted)' } },
                '⏳ Загрузка продуктов из общей базы...'
              )
            ) : (
              React.createElement('div', { className: 'products-table-scroll' },
                React.createElement('table', { className: 'products-table' },
                  React.createElement('thead', null,
                    React.createElement('tr', null,
                      React.createElement('th', null, 'Название'),
                      React.createElement('th', { title: 'Калории на 100г' }, 'Ккал'),
                      React.createElement('th', { title: 'Углеводы' }, 'У'),
                      React.createElement('th', { title: 'Простые углеводы' }, 'Пр'),
                      React.createElement('th', { title: 'Сложные углеводы' }, 'Сл'),
                      React.createElement('th', { title: 'Белки' }, 'Б'),
                      React.createElement('th', { title: 'Жиры' }, 'Ж'),
                      React.createElement('th', { title: 'Вредные жиры' }, 'Вр'),
                      React.createElement('th', { title: 'Полезные жиры' }, 'Пол'),
                      React.createElement('th', { title: 'Транс-жиры' }, 'Тр'),
                      React.createElement('th', { title: 'Клетчатка' }, 'Кл'),
                      React.createElement('th', { title: 'Гликемический индекс' }, 'ГИ'),
                      React.createElement('th', { title: 'Индекс вредности' }, 'Вред'),
                      React.createElement('th', { title: 'Натрий (мг/100г)' }, 'Na'),
                      React.createElement('th', { title: 'Омега-3 (г/100г)' }, 'Ω3'),
                      React.createElement('th', { title: 'Омега-6 (г/100г)' }, 'Ω6'),
                      React.createElement('th', { title: 'NOVA группа' }, 'NOVA'),
                      React.createElement('th', { title: 'Добавки (E-коды)' }, 'Add'),
                      React.createElement('th', { title: 'Нутриентная плотность (0–100)' }, 'ND'),
                      React.createElement('th', { title: 'Органик' }, 'Org'),
                      React.createElement('th', { title: 'Цельнозерновой' }, 'ЦЗ'),
                      React.createElement('th', { title: 'Ферментированный' }, 'Ферм'),
                      React.createElement('th', { title: 'Сырой' }, 'Raw'),
                      React.createElement('th', { title: 'Витамин A (% DV)' }, 'A'),
                      React.createElement('th', { title: 'Витамин C (% DV)' }, 'C'),
                      React.createElement('th', { title: 'Витамин D (% DV)' }, 'D'),
                      React.createElement('th', { title: 'Витамин E (% DV)' }, 'E'),
                      React.createElement('th', { title: 'Витамин K (% DV)' }, 'K'),
                      React.createElement('th', { title: 'Витамин B1 (% DV)' }, 'B1'),
                      React.createElement('th', { title: 'Витамин B2 (% DV)' }, 'B2'),
                      React.createElement('th', { title: 'Витамин B3 (% DV)' }, 'B3'),
                      React.createElement('th', { title: 'Витамин B6 (% DV)' }, 'B6'),
                      React.createElement('th', { title: 'Витамин B9 (% DV)' }, 'B9'),
                      React.createElement('th', { title: 'Витамин B12 (% DV)' }, 'B12'),
                      React.createElement('th', { title: 'Кальций (% DV)' }, 'Ca'),
                      React.createElement('th', { title: 'Железо (% DV)' }, 'Fe'),
                      React.createElement('th', { title: 'Магний (% DV)' }, 'Mg'),
                      React.createElement('th', { title: 'Фосфор (% DV)' }, 'P'),
                      React.createElement('th', { title: 'Калий (% DV)' }, 'K'),
                      React.createElement('th', { title: 'Цинк (% DV)' }, 'Zn'),
                      React.createElement('th', { title: 'Селен (% DV)' }, 'Se'),
                      React.createElement('th', { title: 'Йод (% DV)' }, 'I'),
                      React.createElement('th', { title: 'Порции' }, 'Порц'),
                      React.createElement('th', null, '')
                    )
                  ),
                  React.createElement('tbody', null,
                    (() => {
                      // Фильтрация по поиску
                      const filteredShared = sharedQuery.length >= 2
                        ? allSharedProducts.filter(p => (p.name || '').toLowerCase().includes(sharedQuery.toLowerCase()))
                        : allSharedProducts;
                      // Безопасное получение числового значения
                      const safeNum = (v) => {
                        const n = Number(v);
                        return isNaN(n) ? 0 : n;
                      };
                      return filteredShared.map((p, idx) => {
                        // Supabase возвращает snake_case поля
                        const kcal = Math.round(safeNum(p.protein100) * 4 + safeNum(p.simple100) * 4 + safeNum(p.complex100) * 4 + (safeNum(p.badfat100) + safeNum(p.goodfat100) + safeNum(p.trans100)) * 9);
                        const carbs = safeNum(p.simple100) + safeNum(p.complex100);
                        const fat = safeNum(p.badfat100) + safeNum(p.goodfat100) + safeNum(p.trans100);
                        const harmValue = HEYS.models?.normalizeHarm?.(p) ?? p.harm ?? p.harmScore ?? 0;
                        const safeHarm = isNaN(harmValue) ? 0 : harmValue;
                        // 🛡️ v4.8.1: Используем `id_index` как key для предотвращения дубликатов
                        return React.createElement('tr', { key: `${p.id}_${idx}` },
                          React.createElement('td', null,
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                              p.name,
                              p.is_mine && React.createElement('span', {
                                style: { fontSize: '10px', background: '#22c55e', color: '#fff', padding: '1px 4px', borderRadius: '4px', whiteSpace: 'nowrap' }
                              }, 'Вы')
                            )
                          ),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: kcal, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: carbs, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.simple100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.complex100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.protein100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: fat, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.badfat100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.goodfat100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.trans100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.fiber100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeNum(p.gi), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: safeHarm, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.sodium100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.omega3_100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.omega6_100), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.nova_group), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableList(p.additives), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.nutrient_density), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_organic), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_whole_grain), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_fermented), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableBool(p.is_raw), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_a), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_c), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_d), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_e), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_k), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b1), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b2), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b3), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b6), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b9), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.vitamin_b12), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.calcium), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.iron), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.magnesium), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.phosphorus), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.potassium), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.zinc), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.selenium), readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: formatTableValue(p.iodine), readOnly: true })),
                          React.createElement('td', null,
                            (isCurator || p.is_mine) ? React.createElement('button', {
                              className: 'btn',
                              onClick: () => openSharedPortionsEditor(p),
                              title: 'Редактировать порции'
                            }, `🥣 ${Array.isArray(p.portions) ? p.portions.length : 0}`)
                              : React.createElement('span', null, `🥣 ${Array.isArray(p.portions) ? p.portions.length : 0}`)
                          ),
                          React.createElement('td', null,
                            React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                              // ➕ Добавить в мою базу (для всех)
                              React.createElement('button', {
                                className: 'btn acc',
                                onClick: () => cloneSharedProduct(p),
                                title: 'Добавить в мою базу',
                                style: { padding: '4px 8px', fontSize: '11px' }
                              }, '➕'),
                              // 🚫 Скрыть для меня (для НЕ своих)
                              !p.is_mine && React.createElement('button', {
                                className: 'btn',
                                onClick: () => hideSharedProduct(p.id),
                                title: 'Скрыть для меня',
                                style: { padding: '4px 8px', fontSize: '11px' }
                              }, '🚫'),
                              // 🗑️ Удалить из общей базы (куратор или автор)
                              (isCurator || p.is_mine) && React.createElement('button', {
                                className: 'btn',
                                onClick: () => deleteSharedProduct(p.id, p.name),
                                title: 'Удалить из общей базы',
                                style: { padding: '4px 8px', fontSize: '11px', background: '#fee2e2', color: '#dc2626' }
                              }, '🗑️')
                            )
                          )
                        );
                      });
                    })()
                  )
                )
              )
            ),
            // Без лимита отображения — полный список
          )
        )
      ),
      showModal && React.createElement('div', { className: 'modal-backdrop', onClick: (e) => { if (e.target.classList.contains('modal-backdrop')) setShowModal(false); } },
        React.createElement('div', { className: 'modal' },
          React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
            React.createElement('div', null, 'Новый продукт'),
            React.createElement('button', { className: 'btn', onClick: () => setShowModal(false) }, '×')
          ),
          React.createElement('div', { className: 'grid grid-2', style: { marginTop: '8px' } },
            React.createElement('div', null, React.createElement('label', null, 'Название'), React.createElement('input', { value: draft.name, onChange: e => setDraft({ ...draft, name: e.target.value }) })),
            React.createElement('div', null, React.createElement('label', null, 'ГИ'), React.createElement('input', { type: 'text', value: draft.gi, onChange: e => setDraft({ ...draft, gi: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Простые (100г)'), React.createElement('input', { type: 'text', value: draft.simple100, onChange: e => setDraft({ ...draft, simple100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Сложные (100г)'), React.createElement('input', { type: 'text', value: draft.complex100, onChange: e => setDraft({ ...draft, complex100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Белки (100г)'), React.createElement('input', { type: 'text', value: draft.protein100, onChange: e => setDraft({ ...draft, protein100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Вредные жиры (100г)'), React.createElement('input', { type: 'text', value: draft.badFat100, onChange: e => setDraft({ ...draft, badFat100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Полезные жиры (100г)'), React.createElement('input', { type: 'text', value: draft.goodFat100, onChange: e => setDraft({ ...draft, goodFat100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Супервредные жиры (100г)'), React.createElement('input', { type: 'text', value: draft.trans100, onChange: e => setDraft({ ...draft, trans100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Клетчатка (100г)'), React.createElement('input', { type: 'text', value: draft.fiber100, onChange: e => setDraft({ ...draft, fiber100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Вредность (0–10)'), React.createElement('input', { type: 'text', value: draft.harm, onChange: e => setDraft({ ...draft, harm: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Углеводы (100г) — авто'), React.createElement('input', { className: 'readOnly', readOnly: true, value: derived.carbs100 })),
            React.createElement('div', null, React.createElement('label', null, 'Жиры (100г) — авто'), React.createElement('input', { className: 'readOnly', readOnly: true, value: derived.fat100 })),
            React.createElement('div', null, React.createElement('label', null, 'Калории (100г) — авто'), React.createElement('input', { className: 'readOnly', readOnly: true, value: derived.kcal100 }))
          ),
          // Checkbox: Опубликовать в общую базу
          React.createElement('label', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', cursor: 'pointer' }
          },
            React.createElement('input', {
              type: 'checkbox',
              checked: publishToShared,
              onChange: e => setPublishToShared(e.target.checked),
              style: { width: '18px', height: '18px' }
            }),
            React.createElement('span', { style: { fontSize: '14px' } }, '🌐 Опубликовать в общую базу'),
            React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } },
              isCurator ? '(сразу доступен всем)' : '(на модерацию куратору)'
            )
          ),
          React.createElement('div', { className: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
            React.createElement('button', { className: 'btn', onClick: () => { setShowModal(false); resetDraft(); } }, 'Отмена'),
            React.createElement('button', { className: 'btn acc', onClick: addProduct }, 'Добавить')
          )
        )
      ),
      // Модалка мягкого merge при конфликте fingerprint
      mergeModal.show && React.createElement('div', { className: 'modal-backdrop', onClick: (e) => { if (e.target.classList.contains('modal-backdrop')) setMergeModal({ show: false, existing: null, draft: null }); } },
        React.createElement('div', { className: 'modal', style: { maxWidth: '400px' } },
          React.createElement('div', { style: { fontWeight: '600', fontSize: '16px', marginBottom: '12px' } }, '🔍 Похожий продукт уже есть'),
          React.createElement('div', { style: { background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' } },
            React.createElement('div', { style: { fontWeight: '500' } }, mergeModal.existing?.name),
            React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' } },
              `${Math.round((mergeModal.existing?.protein100 || 0) * 4 + (mergeModal.existing?.simple100 || 0 + mergeModal.existing?.complex100 || 0) * 4 + ((mergeModal.existing?.badfat100 || 0) + (mergeModal.existing?.goodfat100 || 0)) * 9)} ккал | ` +
              `Б: ${mergeModal.existing?.protein100 || 0} | ` +
              `У: ${(mergeModal.existing?.simple100 || 0) + (mergeModal.existing?.complex100 || 0)} | ` +
              `Ж: ${(mergeModal.existing?.badfat100 || 0) + (mergeModal.existing?.goodfat100 || 0)}`
            )
          ),
          React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' } },
            'Продукт с такими же параметрами уже есть в общей базе. Выберите действие:'
          ),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            React.createElement('button', {
              className: 'btn acc',
              onClick: handleMergeUseExisting,
              style: { width: '100%' }
            }, '✅ Использовать существующий'),
            React.createElement('button', {
              className: 'btn',
              onClick: handleMergeCreateOwn,
              style: { width: '100%' }
            }, '➕ Создать свой (только для меня)')
          )
        )
      )
    );
  }

  // Простая функция валидации для тестов
  const validateInput = (value, type) => {
    if (value === null || value === undefined) return false;
    if (type === 'number') return !isNaN(parseFloat(value));
    if (type === 'string') return typeof value === 'string' && value.length > 0;
    if (type === 'email') return typeof value === 'string' && value.includes('@');
    return true; // Базовая валидация прошла
  };

  // Emoji style management (twemoji | system)
  const getEmojiStyle = () => {
    try {
      const U = window.HEYS?.utils || {};
      return U.lsGet ? U.lsGet('heys_emoji_style', 'twemoji') : (localStorage.getItem('heys_emoji_style') || 'twemoji');
    } catch { return 'twemoji'; }
  };
  const setEmojiStyle = (style) => {
    const validStyles = ['twemoji', 'system'];
    if (!validStyles.includes(style)) style = 'twemoji';
    try {
      const U = window.HEYS?.utils || {};
      U.lsSet ? U.lsSet('heys_emoji_style', style) : localStorage.setItem('heys_emoji_style', style);
    } catch { }
    document.body.className = document.body.className.replace(/emoji-\w+/g, '') + ' emoji-' + style;
    // Reparse emoji if twemoji selected - multiple times to ensure all are caught
    if (style === 'twemoji' && window.applyTwemoji) {
      window.applyTwemoji();
      setTimeout(window.applyTwemoji, 50);
      setTimeout(window.applyTwemoji, 200);
    }
  };

  /**
   * Утилита для анализа и очистки localStorage
   * Использование: HEYS.utils.storageCleanup.analyze() / .cleanup()
   */
  const storageCleanup = {
    /**
     * Анализ использования localStorage
     * @returns {Object} Статистика
     */
    analyze: () => {
      const stats = {
        totalBytes: 0,
        itemCount: 0,
        items: [],
        byPrefix: {}
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        const bytes = (key.length + value.length) * 2; // UTF-16

        stats.totalBytes += bytes;
        stats.itemCount++;
        stats.items.push({ key, bytes, kb: Math.round(bytes / 1024 * 10) / 10 });

        // Группировка по префиксам
        const prefix = key.split('_').slice(0, 2).join('_');
        stats.byPrefix[prefix] = (stats.byPrefix[prefix] || 0) + bytes;
      }

      // Сортировка по размеру
      stats.items.sort((a, b) => b.bytes - a.bytes);
      stats.totalKB = Math.round(stats.totalBytes / 1024 * 10) / 10;
      stats.totalMB = Math.round(stats.totalBytes / 1024 / 1024 * 100) / 100;

      console.log(`📊 localStorage: ${stats.totalKB}KB (${stats.totalMB}MB), ${stats.itemCount} items`);
      console.log('Top 10 by size:');
      stats.items.slice(0, 10).forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.key}: ${item.kb}KB`);
      });

      return stats;
    },

    /**
     * Очистка старых данных
     * @param {Object} options - { daysOld: 90, dryRun: true }
     * @returns {Object} Результат очистки
     */
    cleanup: (options = {}) => {
      const { daysOld = 90, dryRun = true } = options;
      const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      const result = { removed: [], kept: [], freedBytes: 0 };

      // Паттерны дней: heys_dayv2_YYYY-MM-DD или heys_<clientId>_dayv2_YYYY-MM-DD
      const dayPattern = /heys_(?:[\w-]+_)?dayv2_(\d{4}-\d{2}-\d{2})/;

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        const match = key.match(dayPattern);

        if (match) {
          const dateStr = match[1];
          const date = new Date(dateStr);

          if (!isNaN(date.getTime()) && date.getTime() < cutoff) {
            const value = localStorage.getItem(key);
            const bytes = (key.length + value.length) * 2;

            if (dryRun) {
              result.removed.push({ key, date: dateStr, bytes });
            } else {
              localStorage.removeItem(key);
              result.removed.push({ key, date: dateStr, bytes });
            }
            result.freedBytes += bytes;
          } else {
            result.kept.push(key);
          }
        }
      }

      const freedKB = Math.round(result.freedBytes / 1024 * 10) / 10;

      if (dryRun) {
        console.log(`🧹 [DRY RUN] Would remove ${result.removed.length} old days (${freedKB}KB)`);
      } else {
        console.log(`✅ Removed ${result.removed.length} old days (${freedKB}KB freed)`);
      }

      return result;
    }
  };

  /**
   * Вычисление возраста из даты рождения
   * @param {string} birthDate - Дата в формате YYYY-MM-DD
   * @returns {number} Возраст в годах
   */
  function calcAgeFromBirthDate(birthDate) {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Получение профиля пользователя с актуальным возрастом
   * @returns {Object} Профиль пользователя
   */
  function getProfile() {
    const p = lsGet('heys_profile', {}) || {};
    const g = p.gender || p.sex || 'Мужской';
    const sex = String(g).toLowerCase().startsWith('ж') ? 'female' : 'male';

    // Вычисляем возраст из birthDate (приоритет) или берём сохранённый age
    let age = p.birthDate ? calcAgeFromBirthDate(p.birthDate) : (+p.age || 30);
    if (age < 10 || age > 120) age = 30; // Защита от некорректных значений

    return {
      sex,
      gender: g,
      height: +p.height || 175,
      age,
      birthDate: p.birthDate || null,
      sleepHours: +p.sleepHours || 8,
      weight: +p.weight || 70,
      weightGoal: +p.weightGoal || 0,
      deficitPctTarget: +p.deficitPctTarget || 0,
      stepsGoal: +p.stepsGoal || 7000,
      insulinWaveHours: +p.insulinWaveHours || 3,
      cycleTrackingEnabled: !!p.cycleTrackingEnabled,
      firstName: p.firstName || '',
      lastName: p.lastName || ''
    };
  }

  HEYS.utils = { INVIS, NUM_RE, round1, uuid, toNum, toNumInput, computeDerived, lsGet, lsSet, parsePasted, validateInput, getEmojiStyle, setEmojiStyle, getCurrentClientId, storageCleanup, getProfile, calcAgeFromBirthDate };
  HEYS.validateInput = validateInput; // Прямой доступ для тестов
  HEYS.core = { validateInput }; // Создаем объект core с валидацией

  // products helper API (thin wrapper over store + local fallback)
  HEYS.products = HEYS.products || {
    getAll: () => {
      const fromStore = (HEYS.store && HEYS.store.get && HEYS.store.get('heys_products', [])) || [];
      const fromUtils = (HEYS.utils && HEYS.utils.lsGet && HEYS.utils.lsGet('heys_products', [])) || [];
      const result = fromStore.length > 0 ? fromStore : fromUtils;
      // 🔍 DEBUG: Логируем откуда берутся продукты (раскомментировать при отладке)
      // console.log('[HEYS.products.getAll] fromStore:', fromStore.length, 'fromUtils:', fromUtils.length, 'result:', result.length);
      return result;
    },
    setAll: (arr, opts = {}) => {
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set('heys_products', arr);
      } else if (HEYS.utils && HEYS.utils.lsSet) {
        HEYS.utils.lsSet('heys_products', arr);
      }
    },
    watch: (fn) => { if (HEYS.store && HEYS.store.watch) return HEYS.store.watch('heys_products', fn); return () => { }; },

    /**
     * 🌐 Автоматическое клонирование продукта из общей базы в личную
     * Вызывается при добавлении shared продукта в приём пищи
     * @param {Object} sharedProduct - Продукт из общей базы (с _fromShared флагом)
     * @returns {Object} Клонированный продукт с локальным id (или существующий если уже есть)
     */
    addFromShared: (sharedProduct) => {
      if (!sharedProduct) return null;

      const products = HEYS.products.getAll();
      const mergeMissingFromShared = (existing) => {
        if (!existing) return existing;
        let changed = false;
        const next = { ...existing };
        // Use centralized harm normalization
        const sharedHarm = HEYS.models?.normalizeHarm?.(sharedProduct);
        if ((next.harm == null) && sharedHarm != null) {
          next.harm = sharedHarm;
          changed = true;
        }
        if (!next.shared_origin_id && sharedProduct.id) {
          next.shared_origin_id = sharedProduct.id;
          changed = true;
        }
        if (!changed) return existing;
        const newProducts = products.map(p => p.id === existing.id ? { ...p, ...next } : p);
        HEYS.products.setAll(newProducts);
        return { ...existing, ...next };
      };

      // Проверяем по shared_origin_id (если уже клонировали)
      if (sharedProduct.id) {
        const existingByOrigin = products.find(p => p.shared_origin_id === sharedProduct.id);
        if (existingByOrigin) {
          // 🔇 v4.7.1: Лог отключён
          return mergeMissingFromShared(existingByOrigin);
        }
      }

      // Проверяем по имени (нормализованному)
      const normName = (sharedProduct.name || '').toLowerCase().trim();
      const existingByName = products.find(p => (p.name || '').toLowerCase().trim() === normName);
      if (existingByName) {
        // 🔇 v4.7.1: Лог отключён
        return mergeMissingFromShared(existingByName);
      }

      // Создаём клон
      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(sharedProduct);
      const clone = {
        id: uuid(),
        name: sharedProduct.name,
        simple100: toNum(sharedProduct.simple100),
        complex100: toNum(sharedProduct.complex100),
        protein100: toNum(sharedProduct.protein100),
        badFat100: toNum(sharedProduct.badFat100 ?? sharedProduct.badfat100),
        goodFat100: toNum(sharedProduct.goodFat100 ?? sharedProduct.goodfat100),
        trans100: toNum(sharedProduct.trans100),
        fiber100: toNum(sharedProduct.fiber100),
        gi: toNum(sharedProduct.gi),
        harm: harmVal,  // Canonical field
        category: sharedProduct.category || '',
        portions: sharedProduct.portions || null,
        sodium100: toNum(sharedProduct.sodium100),
        omega3_100: toNum(sharedProduct.omega3_100),
        omega6_100: toNum(sharedProduct.omega6_100),
        nova_group: toNum(sharedProduct.nova_group ?? sharedProduct.novaGroup),
        additives: sharedProduct.additives || null,
        nutrient_density: toNum(sharedProduct.nutrient_density ?? sharedProduct.nutrientDensity),
        is_organic: sharedProduct.is_organic ?? sharedProduct.isOrganic ?? null,
        is_whole_grain: sharedProduct.is_whole_grain ?? sharedProduct.isWholeGrain ?? null,
        is_fermented: sharedProduct.is_fermented ?? sharedProduct.isFermented ?? null,
        is_raw: sharedProduct.is_raw ?? sharedProduct.isRaw ?? null,
        vitamin_a: toNum(sharedProduct.vitamin_a),
        vitamin_c: toNum(sharedProduct.vitamin_c),
        vitamin_d: toNum(sharedProduct.vitamin_d),
        vitamin_e: toNum(sharedProduct.vitamin_e),
        vitamin_k: toNum(sharedProduct.vitamin_k),
        vitamin_b1: toNum(sharedProduct.vitamin_b1),
        vitamin_b2: toNum(sharedProduct.vitamin_b2),
        vitamin_b3: toNum(sharedProduct.vitamin_b3),
        vitamin_b6: toNum(sharedProduct.vitamin_b6),
        vitamin_b9: toNum(sharedProduct.vitamin_b9),
        vitamin_b12: toNum(sharedProduct.vitamin_b12),
        calcium: toNum(sharedProduct.calcium),
        iron: toNum(sharedProduct.iron),
        magnesium: toNum(sharedProduct.magnesium),
        phosphorus: toNum(sharedProduct.phosphorus),
        potassium: toNum(sharedProduct.potassium),
        zinc: toNum(sharedProduct.zinc),
        selenium: toNum(sharedProduct.selenium),
        iodine: toNum(sharedProduct.iodine),
        shared_origin_id: sharedProduct.id, // Связь с shared продуктом
        fingerprint: sharedProduct.fingerprint, // 🆕 v4.6.0: Fingerprint для дедупликации и recovery
        shared_updated_at: sharedProduct.updated_at || null, // Время обновления в shared
        cloned_at: Date.now(), // Когда клонировали
        user_modified: false, // Пользователь не редактировал
        createdAt: Date.now()
      };

      // Добавляем derived поля (kcal100, carbs100, fat100)
      const withDerived = { ...clone, ...computeDerived(clone) };

      // Добавляем в локальную базу
      const newProducts = [...products, withDerived];
      HEYS.products.setAll(newProducts);

      // 🔇 v4.7.1: Лог отключён
      return withDerived;
    },

    /**
     * Дедупликация продуктов по названию (первый с таким названием остаётся)
     * @returns {{original: number, deduplicated: number, removed: number}} Статистика
     */
    deduplicate: () => {
      const products = HEYS.products.getAll();
      const original = products.length;

      const seen = new Map();
      const unique = [];

      for (const p of products) {
        const key = (p.name || '').trim().toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, true);
          unique.push(p);
        }
      }

      const removed = original - unique.length;

      if (removed > 0) {
        HEYS.products.setAll(unique);
        // 🔇 v4.7.0: Лог отключён
      }

      return { original, deduplicated: unique.length, removed };
    }
  };
  HEYS.RationTab = RationTab;
  HEYS.Ration = RationTab;
})(window);


; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};
  if (!U.__clientScoped) {
    // ИСПРАВЛЕНИЕ: Используем HEYS.store для корректной работы с compress/decompress
    const get0 = U.lsGet ? U.lsGet.bind(U) : (k, d) => {
      if (global.HEYS && global.HEYS.store && typeof global.HEYS.store.get === 'function') {
        return global.HEYS.store.get(k, d);
      }
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    };
    const set0 = U.lsSet ? U.lsSet.bind(U) : (k, v) => {
      if (global.HEYS && global.HEYS.store && typeof global.HEYS.store.set === 'function') {
        return global.HEYS.store.set(k, v);
      }
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { }
    };

    function nsKey(k) {
      // 1) текущий клиент: из глобала или из глобального ключа выбора клиента
      let cid = (global.HEYS && HEYS.currentClientId) || '';
      if (!cid) {
        try { const raw = localStorage.getItem('heys_client_current'); if (raw) cid = JSON.parse(raw); } catch (e) { cid = ''; }
      }
      // 2) служебные ключи НЕ префиксуем (глобальные)
      // 🔧 v55 FIX: heys_session_token тоже глобальный (нужен ДО определения clientId)
      if (/^heys_(clients|client_current|session_token)$/i.test(k)) return k;
      // 3) если клиента нет — работаем как есть
      if (!cid) return k;
      // 4) все остальные наши ключи префиксуем
      if (/^(heys_|day_)/i.test(k)) {
        return k.replace(/^(heys_|day_)/i, (m) => m + cid + '_');
      }
      return k;
    }

    U.lsGet = (k, d) => get0(nsKey(k), d);
    U.lsSet = (k, v) => set0(nsKey(k), v);
    U.__clientScoped = true;
  }
})(window);
