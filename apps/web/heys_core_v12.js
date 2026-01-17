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
   * @returns {{carbs100: number, fat100: number, kcal100: number}}
   */
  function computeDerived(p) {
    const carbs100 = toNum(p.simple100) + toNum(p.complex100);
    const fat100 = toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100);
    // TEF-aware formula: protein 3 kcal/g, carbs 4 kcal/g, fat 9 kcal/g
    // (Учитывает термический эффект пищи для белка — ~25% калорий уходит на переваривание)
    // Стандарт проекта: heys_models_v1.js, heys_day_add_product.js, parse_worker.js
    const kcal100 = 3 * toNum(p.protein100) + 4 * carbs100 + 9 * fat100;
    return {
      carbs100: round1(carbs100),
      fat100: round1(fat100),
      kcal100: round1(kcal100)
    };
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
      const base = { id: uuid(), name: st.name, simple100: simple, complex100: complex, protein100: protein, badFat100: bad, goodFat100: good, trans100: trans, fiber100: fiber, gi: gi, harmScore: harm, createdAt: Date.now() };

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
    const [draft, setDraft] = React.useState({ name: '', simple100: 0, complex100: 0, protein100: 0, badFat100: 0, goodFat100: 0, trans100: 0, fiber100: 0, gi: 0, harmScore: 0 });
    const derived = computeDerived(draft);

    // === PHASE 2: Shared Products UI ===
    // Подвкладки: 'personal' (👤 Продукты клиента) | 'shared' (🌐 Общая база)
    const [activeSubtab, setActiveSubtab] = React.useState('personal');
    // Источник поиска: 'personal' (👤 Мои) | 'shared' (🌐 Общие) | 'both' (👤+🌐 Оба)
    const [searchSource, setSearchSource] = React.useState('both');
    // Результаты поиска из shared_products
    const [sharedResults, setSharedResults] = React.useState([]);
    const [sharedLoading, setSharedLoading] = React.useState(false);
    const [sharedQuery, setSharedQuery] = React.useState('');
    // ВСЕ продукты общей базы (для таблицы)
    const [allSharedProducts, setAllSharedProducts] = React.useState([]);
    const [allSharedLoading, setAllSharedLoading] = React.useState(false);
    // Pending заявки (для куратора)
    const [pendingProducts, setPendingProducts] = React.useState([]);
    const [pendingLoading, setPendingLoading] = React.useState(false);
    // Checkbox: опубликовать новый продукт в shared (по умолчанию ON)
    const [publishToShared, setPublishToShared] = React.useState(true);
    // Модалка мягкого merge при конфликте fingerprint
    const [mergeModal, setMergeModal] = React.useState({ show: false, existing: null, draft: null });

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

    // Поиск в shared при изменении sharedQuery
    React.useEffect(() => {
      if (activeSubtab === 'shared' || searchSource !== 'personal') {
        searchSharedDebounced(sharedQuery || query);
      }
    }, [sharedQuery, query, activeSubtab, searchSource, searchSharedDebounced]);

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

    // Лимит отображения продуктов для производительности
    const DISPLAY_LIMIT = 100;
    const [showAll, setShowAll] = React.useState(false);

    const filtered = React.useMemo(() => {
      // Используем normalizeText из SmartSearch (единый источник)
      const normalizeSearchText = window.HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));

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

      return result;
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

      window.addEventListener('heysProductsUpdated', handleProductsUpdated);
      window.addEventListener('heysSyncCompleted', handleProductsUpdated);

      return () => {
        window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
        window.removeEventListener('heysSyncCompleted', handleProductsUpdated);
      };
    }, []);

    // Подгружать продукты из облака при смене клиента
    React.useEffect(() => {
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
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
              console.warn('[HEYS] ⚠️ Обнаружено много продуктов:', latest.length, '— запускаем дедупликацию');
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
            setProducts(Array.isArray(latest) ? latest : []);
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
          setProducts(Array.isArray(latest) ? latest : []);
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

        setProducts(Array.isArray(latest) ? latest : []);
      }
    }, [window.HEYS && window.HEYS.currentClientId]);

    function resetDraft() { setDraft({ name: '', simple100: 0, complex100: 0, protein100: 0, badFat100: 0, goodFat100: 0, trans100: 0, fiber100: 0, gi: 0, harmScore: 0 }); }
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
      const base = { id: uuid(), name: name, simple100: toNum(draft.simple100), complex100: toNum(draft.complex100), protein100: toNum(draft.protein100), badFat100: toNum(draft.badFat100), goodFat100: toNum(draft.goodFat100), trans100: toNum(draft.trans100), fiber100: toNum(draft.fiber100), gi: toNum(draft.gi), harmScore: toNum(draft.harmScore), createdAt: Date.now() };
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
      }
      setProducts(products.map(p => { if (p.id !== id) return p; const changed = { ...p, ...patch }; const d = computeDerived(changed); return { ...changed, ...d }; }));
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
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

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      DEV.log(`✅ [EXPORT] Экспортировано ${products.length} продуктов в ${fileName}`);
      HEYS.Toast?.success(`Экспортировано ${products.length} продуктов!`) || alert(`Экспортировано ${products.length} продуктов!`);
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
          const harmVal = HEYS.models?.normalizeHarm?.(p) ?? toNum(p.harmScore || p.harm || p.harm100);
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

        // Спрашиваем режим импорта
        const mode = await new Promise(resolve => {
          const choice = confirm(
            `Найдено ${validProducts.length} продуктов.\\n\\n` +
            `OK — Умный импорт (новые добавятся, существующие обновятся)\\n` +
            `Отмена — Отменить импорт`
          );
          resolve(choice ? 'merge' : 'cancel');
        });

        if (mode === 'cancel') {
          DEV.log('[IMPORT FILE] Импорт отменён пользователем');
          return;
        }

        // Умный импорт (merge)
        const normalize = (name) => (name || '').trim().toLowerCase();
        const existingMap = new Map();
        products.forEach((p, idx) => {
          existingMap.set(normalize(p.name), { product: p, index: idx });
        });

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
        HEYS.Toast?.success(`Импорт завершён: +${added} новых, ${updated} обновлено`) || alert(`Импорт завершён!`);

        if (window.HEYS?.analytics) {
          window.HEYS.analytics.trackDataOperation('products-imported-file', validProducts.length);
        }

      } catch (err) {
        console.error('[IMPORT FILE] Ошибка:', err);
        HEYS.Toast?.error('Ошибка чтения файла: ' + err.message) || alert('Ошибка чтения файла: ' + err.message);
      }
    }

    // === PHASE 2: Helper функции для UI ===

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
        shared_origin_id: sharedProduct.id, // Связь с shared продуктом
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
        shared_origin_id: sharedProduct.id, // Связь с shared
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

    // Комбинированный поиск (личные + shared)
    const combinedResults = React.useMemo(() => {
      if (searchSource === 'personal') {
        return filtered.map(p => ({ ...p, _source: 'personal' }));
      }
      if (searchSource === 'shared') {
        return sharedResults.map(p => ({ ...p, _source: 'shared' }));
      }
      // both — объединяем
      const personal = filtered.map(p => ({ ...p, _source: 'personal' }));
      const shared = sharedResults.map(p => ({ ...p, _source: 'shared' }));
      // Дедупликация: если личный продукт склонирован из shared — показываем только личный
      const sharedIds = new Set(personal.filter(p => p.shared_origin_id).map(p => p.shared_origin_id));
      const uniqueShared = shared.filter(p => !sharedIds.has(p.id));
      return [...personal, ...uniqueShared];
    }, [filtered, sharedResults, searchSource]);

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
          // Переключатель источника поиска
          React.createElement('div', { className: 'card', style: { marginBottom: '8px', padding: '8px 12px' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
              React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted, #6b7280)' } }, 'Источник:'),
              React.createElement('div', {
                style: { display: 'flex', gap: '4px', background: 'var(--bg-secondary, #f3f4f6)', borderRadius: '6px', padding: '2px' }
              },
                React.createElement('button', {
                  className: searchSource === 'personal' ? 'btn acc' : 'btn',
                  onClick: () => setSearchSource('personal'),
                  style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px' }
                }, '👤 Мои'),
                React.createElement('button', {
                  className: searchSource === 'shared' ? 'btn acc' : 'btn',
                  onClick: () => setSearchSource('shared'),
                  style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px' }
                }, '🌐 Общие'),
                React.createElement('button', {
                  className: searchSource === 'both' ? 'btn acc' : 'btn',
                  onClick: () => setSearchSource('both'),
                  style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px' }
                }, '👤+🌐 Оба')
              ),
              sharedLoading && React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, '⏳ Поиск...')
            )
          ),
          // Кнопки экспорта и импорта бэкапа
          React.createElement('div', { className: 'card', style: { marginBottom: '8px', padding: '12px 16px' } },
            // Полный бэкап
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '20px' } }, '💾'),
                React.createElement('span', { style: { fontWeight: '500' } }, 'Полный бэкап'),
                React.createElement('span', { className: 'muted', style: { fontSize: '11px' } }, '(всё)')
              ),
              React.createElement('button', {
                className: 'btn',
                onClick: async () => {
                  if (window.HEYS && window.HEYS.exportFullBackup) {
                    const result = await window.HEYS.exportFullBackup();
                    if (result && result.ok) {
                      HEYS.Toast?.success(`Бэкап сохранён! 📦 Продуктов: ${result.products}, 📅 Дней: ${result.days}`) || alert(`✅ Бэкап сохранён!\n📦 Продуктов: ${result.products}\n📅 Дней: ${result.days}`);
                    }
                  } else {
                    HEYS.Toast?.warning('Функция экспорта недоступна') || alert('Функция экспорта недоступна');
                  }
                },
                style: { whiteSpace: 'nowrap' }
              }, '📥 Скачать всё')
            ),
            // Экспорт только продуктов
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color, #e5e5e5)', marginBottom: '12px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '20px' } }, '🥗'),
                React.createElement('span', { style: { fontWeight: '500' } }, 'Экспорт продуктов'),
                React.createElement('span', { className: 'muted', style: { fontSize: '11px' } }, `(${products.length})`)
              ),
              React.createElement('button', {
                className: 'btn',
                onClick: exportProductsOnly,
                style: { whiteSpace: 'nowrap' }
              }, '📥 Скачать')
            ),
            // Импорт из файла
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color, #e5e5e5)' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '20px' } }, '📤'),
                React.createElement('span', { style: { fontWeight: '500' } }, 'Импорт из файла')
              ),
              React.createElement('label', {
                className: 'btn',
                style: { whiteSpace: 'nowrap', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }
              },
                '📂 Выбрать JSON',
                React.createElement('input', {
                  type: 'file',
                  accept: '.json,application/json',
                  style: { display: 'none' },
                  onChange: (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      importFromFile(file);
                      e.target.value = ''; // Сброс для повторного выбора того же файла
                    }
                  }
                })
              )
            )
          ),
          React.createElement('div', { className: 'card tone-amber', style: { marginBottom: '8px' } },
            React.createElement('div', { className: 'section-title' }, 'Импорт из вставки'),
            React.createElement('textarea', { placeholder: 'Вставь строки: Название + 12 чисел справа', value: paste, onChange: e => setPaste(e.target.value) }),
            React.createElement('div', { className: 'row', style: { marginTop: '8px', flexWrap: 'wrap', gap: '8px' } },
              React.createElement('button', { className: 'btn acc', onClick: importMerge, title: 'Добавляет новые, обновляет существующие по названию' }, '✨ Импорт (умный)'),
              React.createElement('button', { className: 'btn', onClick: importAppend, title: 'Просто добавляет в конец списка' }, '+ Добавить'),
              React.createElement('button', { className: 'btn', onClick: importReplace, title: 'Удаляет все старые, загружает только новые' }, '⚠️ Заменить всё')
            ),
            React.createElement('span', { className: 'muted', style: { marginTop: '4px', fontSize: '12px' } }, 'Умный импорт: новые добавятся, существующие обновятся по названию')
          ),
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
            React.createElement('div', { style: { overflowX: 'auto' } },
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
                    React.createElement('th', null, '')
                  )
                ),
                React.createElement('tbody', null,
                  // Ограничиваем рендеринг для производительности (29k+ продуктов = тормоза)
                  (showAll ? filtered : filtered.slice(0, DISPLAY_LIMIT)).map(p => React.createElement('tr', { key: p.id },
                    React.createElement('td', null, React.createElement('input', { value: p.name, onChange: e => updateRow(p.id, { name: e.target.value }) })),
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
                    React.createElement('td', null, React.createElement('input', { type: 'text', value: p.harmScore, onChange: e => updateRow(p.id, { harmScore: toNum(e.target.value) }) })),
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
              React.createElement('div', { style: { overflowX: 'auto' } },
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
                      React.createElement('th', null, '')
                    )
                  ),
                  React.createElement('tbody', null,
                    (() => {
                      // Фильтрация по поиску
                      const filteredShared = sharedQuery.length >= 2
                        ? allSharedProducts.filter(p => (p.name || '').toLowerCase().includes(sharedQuery.toLowerCase()))
                        : allSharedProducts;
                      // Ограничение для производительности
                      const SHARED_DISPLAY_LIMIT = 100;
                      return filteredShared.slice(0, SHARED_DISPLAY_LIMIT).map(p => {
                        // Supabase возвращает snake_case поля
                        const kcal = Math.round((p.protein100 || 0) * 4 + (p.simple100 || 0) * 4 + (p.complex100 || 0) * 4 + ((p.badfat100 || 0) + (p.goodfat100 || 0) + (p.trans100 || 0)) * 9);
                        const carbs = (p.simple100 || 0) + (p.complex100 || 0);
                        const fat = (p.badfat100 || 0) + (p.goodfat100 || 0) + (p.trans100 || 0);
                        return React.createElement('tr', { key: p.id },
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
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.simple100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.complex100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.protein100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: fat, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.badfat100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.goodfat100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.trans100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.fiber100 || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.gi || 0, readOnly: true })),
                          React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: p.harmscore || 0, readOnly: true })),
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
            // Показать сколько ещё есть
            !allSharedLoading && allSharedProducts.length > 100 && React.createElement('div', {
              className: 'muted',
              style: { marginTop: '8px', textAlign: 'center', fontSize: '12px' }
            }, `Показано 100 из ${allSharedProducts.length}. Используйте поиск для быстрого нахождения.`)
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
            React.createElement('div', null, React.createElement('label', null, 'Вредность (0–10)'), React.createElement('input', { type: 'text', value: draft.harmScore, onChange: e => setDraft({ ...draft, harmScore: toNum(e.target.value) }) })),
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
    getAll: () => (HEYS.store && HEYS.store.get && HEYS.store.get('heys_products', [])) || (HEYS.utils && HEYS.utils.lsGet && HEYS.utils.lsGet('heys_products', [])) || [],
    setAll: (arr) => { if (HEYS.store && HEYS.store.set) HEYS.store.set('heys_products', arr); else if (HEYS.utils && HEYS.utils.lsSet) HEYS.utils.lsSet('heys_products', arr); },
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
          console.log('[SHARED→LOCAL] Already cloned:', sharedProduct.name);
          return mergeMissingFromShared(existingByOrigin);
        }
      }

      // Проверяем по имени (нормализованному)
      const normName = (sharedProduct.name || '').toLowerCase().trim();
      const existingByName = products.find(p => (p.name || '').toLowerCase().trim() === normName);
      if (existingByName) {
        console.log('[SHARED→LOCAL] Already exists by name:', sharedProduct.name);
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
        shared_origin_id: sharedProduct.id, // Связь с shared продуктом
        createdAt: Date.now()
      };

      // Добавляем derived поля (kcal100, carbs100, fat100)
      const withDerived = { ...clone, ...computeDerived(clone) };

      // Добавляем в локальную базу
      const newProducts = [...products, withDerived];
      HEYS.products.setAll(newProducts);

      console.log('[SHARED→LOCAL] ✅ Auto-cloned:', sharedProduct.name, 'new id:', withDerived.id);
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
        console.log(`[HEYS] ✅ Дедупликация: было ${original}, стало ${unique.length}, удалено дублей: ${removed}`);
      } else {
        console.log(`[HEYS] ℹ️ Дублей не найдено (${original} продуктов)`);
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
