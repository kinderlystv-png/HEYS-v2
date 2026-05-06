// heys_core_v12.js — Product search, localStorage, RationTab, utilities
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const Store = (HEYS.store) || (HEYS.store = {});

  // 🆕 Heartbeat для watchdog — core загружен
  if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

  // ═══════════════════════════════════════════════════════════════════
  // 🔍 DEBUG MODE + MODULE FALLBACK LOGGER
  // ═══════════════════════════════════════════════════════════════════

  const isDebugMode = (() => {
    try {
      const params = new URLSearchParams(global.location?.search || '');
      const debugParam = params.get('debug');
      const debugLs = global.localStorage?.getItem('heys_debug');
      return debugParam === '1' || debugParam === 'true' || debugLs === '1' || debugLs === 'true';
    } catch (e) {
      return false;
    }
  })();

  if (HEYS.DEBUG_MODE == null) {
    HEYS.DEBUG_MODE = isDebugMode;
  }

  HEYS._missingModules = HEYS._missingModules || new Set();
  HEYS._debugMissingModule = function (name) {
    if (!HEYS.DEBUG_MODE) return;
    if (HEYS._missingModules.has(name)) return;
    HEYS._missingModules.add(name);
    if (HEYS.analytics?.trackError) {
      try {
        HEYS.analytics.trackError(new Error('Missing module: ' + name), {
          scope: 'module-fallback',
          module: name
        });
      } catch (e) { }
    }
  };

  HEYS._getModule = function (name, fallback) {
    const mod = HEYS[name];
    if (!mod) {
      HEYS._debugMissingModule?.(name);
      return fallback || {};
    }
    return mod;
  };

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
    // NET Atwater: protein 3 kcal/g (TEF 25% built-in: 4×0.75=3), carbs 4 kcal/g, fat 9 kcal/g
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
          const result = window.HEYS.store.get(key, def);
          // 🔍 DEBUG v59: Логируем загрузку dayv2
          if (key.includes('dayv2_') && HEYS.DEBUG_MODE && window.DEV?.log) {
            window.DEV.log(`[lsGet] key=${key}, clientId=${window.HEYS.currentClientId?.substring(0, 8)}, hasData=${result !== def && result !== null}, meals=${result?.meals?.length || 0}`);
          }
          return result;
        }
      }
      // Fallback на прямой localStorage для глобальных ключей
      // 🔧 FIX v60: при ранней загрузке пытаемся читать scoped-ключ напрямую
      const clientSpecificKeys = ['heys_products', 'heys_profile', 'heys_hr_zones', 'heys_norms', 'heys_game'];
      const isClientSpecific = clientSpecificKeys.some(k => key === k || key.includes('dayv2_'));
      if (isClientSpecific) {
        const clientId = getCurrentClientId();
        if (clientId) {
          const keyPart = key.startsWith('heys_') ? key.substring('heys_'.length) : key;
          const scopedKey = `heys_${clientId}_${keyPart}`;
          const scopedV = localStorage.getItem(scopedKey);
          if (scopedV) {
            return JSON.parse(scopedV);
          }
        }
      }
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
      // Route ALL writes through HEYS.store.set when available — it compresses automatically.
      // Store.set's scoped() is idempotent: keys already containing the cid are returned unchanged,
      // so nsKey-scoped keys (from the client-scoped IIFE below) are never double-prefixed.
      if (window.HEYS?.store?.set) {
        window.HEYS.store.set(key, val);
        const type = key.includes('dayv2') ? 'meal'
          : key.includes('product') ? 'product'
            : key.includes('profile') ? 'profile'
              : 'data';
        window.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key, type } }));
        return;
      }
      // Store not yet ready (early boot) — write uncompressed.
      // Skip if identical to avoid spurious events.
      const serialized = JSON.stringify(val);
      try {
        const existing = localStorage.getItem(key);
        if (existing === serialized) return;
      } catch (_) { /* proceed to write */ }
      localStorage.setItem(key, serialized);
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
    // 🛡️ Включаем stamp-recovered продукты в personal-таблицу.
    // По архитектуре orphan-recovery (heys_day_utils.js:1346) такие продукты не пишутся
    // в heys_products/overlay (чтобы не загрязнять neutrient aggregation), а живут
    // в side-cache `HEYS.orphanProducts._stampResolutionCache`. Без этого юзер не видит
    // в личной базе те продукты, которые реально использовал в днях (включая custom).
    const [_stampVer, _setStampVer] = React.useState(0);
    React.useEffect(() => {
      const refresh = () => _setStampVer(v => v + 1);
      window.addEventListener('heys:orphans-recovered', refresh);
      return () => window.removeEventListener('heys:orphans-recovered', refresh);
    }, []);
    const products = (() => {
      const arr = Array.isArray(props.products) ? props.products : [];
      try {
        const cache = window.HEYS?.orphanProducts?._stampResolutionCache;
        if (!(cache instanceof Map) || cache.size === 0) return arr;
        const ids = new Set(arr.filter(p => p && p.id != null).map(p => String(p.id)));
        const extras = [];
        for (const p of cache.values()) {
          if (p && p.id != null && !ids.has(String(p.id))) extras.push(p);
        }
        return extras.length > 0 ? arr.concat(extras) : arr;
      } catch (_) { /* noop */ }
      return arr;
    })();

    // Сохранять продукты в облако и localStorage при каждом изменении (через HEYS.utils для namespace)
    React.useEffect(() => {
      // Не сохраняем пустой массив если это первичная инициализация и возможно есть данные в облаке
      if (products.length === 0) {
        // Проверяем, есть ли данные в localStorage или облаке
        const existingProducts = (window.HEYS && window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) ||
          (window.HEYS && window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', null));
        if (existingProducts && Array.isArray(existingProducts) && existingProducts.length > 0) {
          // Есть продукты в storage, не затираем их пустым массивом
          console.info('[baza] 💾 useEffect[products]: SKIP — products=0 но localStorage=', existingProducts.length);
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
          console.info('[baza] 💾 useEffect[products]: ALLOWED intentional delete', existingProducts.length, '→', products.length);
          // Сбрасываем флаг после использования
          window.HEYS._intentionalProductDelete = false;
        } else {
          console.warn('[baza] 💾 useEffect[products]: ❌ BLOCKED — localStorage=', existingProducts.length, '> state=', products.length, '(нет флага _intentionalProductDelete)');
          return;
        }
      }

      console.info('[baza] 💾 useEffect[products]: SAVE — products.length=', products.length);

      if (Array.isArray(products) && window.HEYS && window.HEYS.store && typeof window.HEYS.store.set === 'function') {
        window.HEYS.store.set('heys_products', products);
      } else if (window.HEYS && window.HEYS.utils && typeof window.HEYS.utils.lsSet === 'function') {
        // fallback
        window.HEYS.utils.lsSet('heys_products', products);
      }
    }, [products]);

    // 🔴 FIX: миграция — назначаем id продуктам без id прямо в state
    // (иначе deleteRow(undefined) удалит всех без id)
    // ВАЖНО: сохраняем в localStorage СИНХРОННО, иначе useEffect([clientId])
    // перечитает старый localStorage и сбросит назначенные id обратно в undefined
    React.useEffect(() => {
      const genId = () => ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      );

      // 🪦 Сначала отфильтруем tombstone-продукты БЕЗ id по имени.
      // Если облако вернуло удалённый продукт без id — миграция назначит новый uuid,
      // и tombstone по старому id уже не сработает. Поэтому ловим здесь по имени.
      let cleaned = products;
      try {
        const tombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
        if (Array.isArray(tombstones) && tombstones.length > 0) {
          const deletedNames = new Set(tombstones.map(t => t.name).filter(Boolean));
          if (deletedNames.size > 0) {
            const noIdProducts = cleaned.filter(p => !p.id);
            const zombies = noIdProducts.filter(p => p.name && deletedNames.has(p.name));
            if (zombies.length > 0) {
              console.info(`[baza] 🪦 migrate ids: убрано ${zombies.length} zombie product(s) без id по имени из tombstone`);
              cleaned = cleaned.filter(p => !((!p.id) && p.name && deletedNames.has(p.name)));
            }
          }
        }
      } catch (_) { }

      const missing = cleaned.filter(p => !p.id);
      if (missing.length > 0) {
        console.warn('[baza] 🆔 migrate ids: найдено', missing.length, 'продуктов без id — назначаем uuid');
        const patched = cleaned.map(p => p.id ? p : { ...p, id: genId() });
        console.info('[baza] 🆔 migrate ids: готово, примеры:', patched.slice(0, 3).map(p => ({ id: p.id, name: p.name })));
        // Сохраняем в localStorage СИНХРОННО до setProducts
        if (window.HEYS?.store?.set) {
          window.HEYS.store.set('heys_products', patched);
          console.info('[baza] 🆔 migrate ids: localStorage обновлён синхронно (HEYS.store.set)');
        } else if (window.HEYS?.utils?.lsSet) {
          window.HEYS.utils.lsSet('heys_products', patched);
          console.info('[baza] 🆔 migrate ids: localStorage обновлён синхронно (lsSet)');
        }
        setProducts(patched);
      } else if (cleaned.length < products.length) {
        // Продукты были убраны zombie-фильтром, но id все на месте
        if (window.HEYS?.store?.set) {
          window.HEYS.store.set('heys_products', cleaned);
        }
        setProducts(cleaned);
      } else {
        console.info('[baza] 🆔 migrate ids: все', products.length, 'продуктов имеют id — миграция не нужна ✅');
      }
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps — только при монтировании

    // 🪦 TOMBSTONE FILTER — единая функция для всех точек входа данных
    // Фильтрует продукты которые пользователь удалил, но облако пытается вернуть
    function applyTombstoneFilter(productsList) {
      try {
        const tombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
        if (!Array.isArray(tombstones) || tombstones.length === 0) return productsList;
        // 🔑 Фильтруем ТОЛЬКО по id, НЕ по имени.
        // Имя-фильтр блокировал повторное добавление продукта с тем же названием (новый id).
        // Cloud sync возвращает продукт с ТЕМ ЖЕ id → tombstone его режет.
        // Ручное добавление создаёт НОВЫЙ id → tombstone его пропускает.
        const deletedIds = new Set(tombstones.map(t => t.id).filter(Boolean));
        const before = productsList.length;
        const filtered = productsList.filter(p => !(p.id && deletedIds.has(p.id)));
        const removed = before - filtered.length;
        if (removed > 0) {
          console.info(`[baza] 🪦 tombstone filter: убрано ${removed} resurrection product(s)`);
          try { if (window.HEYS?.store?.set) window.HEYS.store.set('heys_products', filtered); } catch (_) { }
        }
        return filtered;
      } catch (_) {
        return productsList;
      }
    }

    const [query, setQuery] = React.useState('');
    const [paste, setPaste] = React.useState('');
    const [showModal, setShowModal] = React.useState(false);
    // === EXTENDED PRODUCT DRAFT (v4.4.0) — все ~35 полей из DATA_MODEL_REFERENCE ===
    const INITIAL_DRAFT = {
      // Базовые (обязательные)
      name: '', simple100: 0, complex100: 0, protein100: 0, badFat100: 0, goodFat100: 0, trans100: 0, fiber100: 0, gi: 0, harm: 0,
      // Дополнительные нутриенты
      sodium100: 0, cholesterol100: 0, sugar100: 0, omega3_100: 0, omega6_100: 0,
      // Витамины (% от суточной нормы)
      vitaminA: 0, vitaminC: 0, vitaminD: 0, vitaminE: 0, vitaminK: 0,
      vitaminB1: 0, vitaminB2: 0, vitaminB3: 0, vitaminB6: 0, vitaminB9: 0, vitaminB12: 0,
      // Минералы (% от суточной нормы)
      calcium: 0, iron: 0, magnesium: 0, phosphorus: 0, potassium: 0, zinc: 0, selenium: 0, iodine: 0,
      // NOVA и переработка
      novaGroup: 0, // 0 = авто-детект, 1-4 = явно задано
      additives: '', // строка E-добавок через запятую
      // Флаги качества
      isOrganic: false, isWholeGrain: false, isFermented: false, isRaw: false,
      // Комментарий
      harmNote: '',
      // Категория
      category: ''
    };
    const [draft, setDraft] = React.useState(INITIAL_DRAFT);
    // Состояние раскрытых секций в модалке
    const [expandedSections, setExpandedSections] = React.useState({ base: true, extra: false, vitamins: false, minerals: false, nova: false, flags: false });
    const derived = computeDerived(draft);

    // === PHASE 2: Shared Products UI ===
    // Подвкладки: 'personal' (👤 Продукты клиента) | 'shared' (🌐 Общая база)
    // 🔧 FIX: сохраняем выбор под-вкладки per-client, чтобы syncVer-remount не сбрасывал UI
    const getRationSubtabKey = () => {
      const clientId = window.HEYS?.currentClientId;
      return clientId ? `heys_${clientId}_ration_subtab` : 'heys_ration_subtab';
    };
    const readStoredSubtab = () => {
      try {
        const raw = localStorage.getItem(getRationSubtabKey());
        const stored = raw ? JSON.parse(raw) : null;
        return stored === 'shared' ? 'shared' : 'personal';
      } catch (_) {
        return 'personal';
      }
    };
    const [activeSubtab, setActiveSubtab] = React.useState(readStoredSubtab);
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

    // Пагинация диапазонами (1-99, 100-199, ...)
    const RANGE_STEP = 100;
    const getRangeSize = (start) => (start === 0 ? 99 : 100);
    const getRangeEnd = (start, total) => Math.min(start + getRangeSize(start), total);
    const buildRangeOptions = (total) => {
      if (!total || total <= 0) return [];
      const ranges = [];
      let index = 0;
      while (true) {
        const start = index === 0 ? 0 : (index * RANGE_STEP - 1);
        if (start >= total) break;
        const end = getRangeEnd(start, total);
        const label = `${start + 1}-${end}`;
        ranges.push({ start, end, label });
        index += 1;
      }
      return ranges;
    };
    const DEFAULT_DISPLAY_LIMIT = 5;
    const [personalRangeStart, setPersonalRangeStart] = React.useState(0);
    const [sharedRangeStart, setSharedRangeStart] = React.useState(0);
    const [personalRangeActive, setPersonalRangeActive] = React.useState(false);
    const [sharedRangeActive, setSharedRangeActive] = React.useState(false);
    const lastSharedLoadRef = React.useRef(0);
    const SHARED_LOAD_TTL_MS = 30000;

    // Normalization for personal products (legacy-safe)
    const normalizePersonalProduct = (product) => {
      if (!product || typeof product !== 'object') return product;
      if (product._normalizedPersonal) return product;
      try {
        let next = { ...product };
        // 🔴 FIX: гарантируем id у каждого продукта (иначе deleteRow удалит ВСЕХ без id)
        if (!next.id) {
          const newId = (window.HEYS?.utils?.uuid?.() ||
            window.HEYS?.models?.uuid?.() ||
            ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
              (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
            ));
          next.id = newId;
          if (window.DEV) window.DEV.log('[baza] 🆔 normalizePersonalProduct: назначен новый id для "' + next.name + '":', newId);
        }
        if (HEYS.features?.unifiedTables === false) {
          if (HEYS.models?.normalizeProductFields) {
            next = HEYS.models.normalizeProductFields(next);
          }
        } else if (HEYS.models?.normalizeExtendedProduct) {
          next = HEYS.models.normalizeExtendedProduct(next);
        } else if (HEYS.models?.normalizeProductFields) {
          next = HEYS.models.normalizeProductFields(next);
        }
        const derived = HEYS.models?.computeDerivedProduct
          ? HEYS.models.computeDerivedProduct(next)
          : computeDerived(next);
        if (derived?.kcal100 != null) {
          next.kcal100 = derived.kcal100;
          next.carbs100 = derived.carbs100;
          next.fat100 = derived.fat100;
          if (derived.harm != null && next.harm == null) {
            next.harm = derived.harm;
            next.harmScore = derived.harm;
          }
        }
        next._normalizedPersonal = true;
        return next;
      } catch (e) {
        console.error('[HEYS.store] ❌ normalizePersonalProduct failed', e);
        return product;
      }
    };

    const normalizePersonalProducts = (list) => {
      if (!Array.isArray(list)) return [];
      return list.map(normalizePersonalProduct).filter(Boolean);
    };

    // Проверяем curator-режим (есть Supabase session)
    // Используем state для реактивности при изменении auth
    // ✅ FIX v47: Проверяем наличие cloudUser (curator login создаёт user),
    // а не _rpcOnlyMode (который true для ВСЕХ после миграции на Yandex API)
    // ✅ FIX v48: Заменён setInterval(1s) на event listener для производительности
    const [isCurator, setIsCurator] = React.useState(false);
    React.useEffect(() => {
      const checkCurator = () => {
        const isCuratorSession = window.HEYS?.auth?.isCuratorSession;
        const result = typeof isCuratorSession === 'function'
          ? isCuratorSession()
          : window.HEYS?.cloud?.getUser?.() != null;
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
    const loadAllSharedProducts = React.useCallback(async (options = {}) => {
      const force = !!options.force;
      const now = Date.now();
      if (!force && Array.isArray(allSharedProducts) && allSharedProducts.length > 0) {
        const age = now - (lastSharedLoadRef.current || 0);
        if (age < SHARED_LOAD_TTL_MS) {
          console.info('[baza] ⏭️ CACHE HIT — skip RPC, ttl remaining:', Math.round((SHARED_LOAD_TTL_MS - age) / 1000), 's, cached products:', allSharedProducts.length);
          // [baza] проверяем что в кэше
          if (allSharedProducts.length > 0) {
            const s = allSharedProducts[0];
            console.info('[baza] 🗃️ CACHED first product:', s?.name, '| keys:', Object.keys(s || {}).sort().join(', '));
            console.info('[baza] 🗃️ CACHED vitamins: vitamin_c=', s?.vitamin_c, 'vitaminC=', s?.vitaminC, 'calcium=', s?.calcium, 'sodium100=', s?.sodium100);
          }
          return;
        }
      }

      console.info('[baza] 🚀 LOADING from RPC — force:', force, '| current count:', allSharedProducts?.length || 0);
      setAllSharedLoading(true);
      try {
        const result = await window.HEYS?.cloud?.getAllSharedProducts?.({ limit: 500 });
        if (result?.data) {
          // [baza] диагностика: что вернул getAllSharedProducts
          console.info('[baza] 📦 getAllSharedProducts returned', result.data.length, 'products');
          if (result.data.length > 0) {
            const s = result.data[0];
            console.info('[baza] 📦 FIRST product:', s?.name, '| ALL KEYS:', Object.keys(s).sort().join(', '));
            console.info('[baza] 🔬 vitamin_c=', s?.vitamin_c, '| vitaminC=', s?.vitaminC, '| calcium=', s?.calcium, '| iron=', s?.iron, '| sodium100=', s?.sodium100, '| vitamin_b1=', s?.vitamin_b1);
          }
          setAllSharedProducts(result.data);
          lastSharedLoadRef.current = Date.now();
        } else {
          console.warn('[baza] ⚠️ getAllSharedProducts returned no data:', result);
        }
      } catch (err) {
        console.error('[SHARED ALL] Load error:', err);
      } finally {
        setAllSharedLoading(false);
      }
    }, [allSharedProducts]);

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

    // 🔄 Восстанавливаем под-вкладку при смене клиента
    React.useEffect(() => {
      const handleClientChange = () => {
        const next = readStoredSubtab();
        setActiveSubtab((prev) => (prev === next ? prev : next));
      };
      window.addEventListener('heys:client-changed', handleClientChange);
      return () => window.removeEventListener('heys:client-changed', handleClientChange);
    }, []);

    // 💾 Сохраняем выбор под-вкладки (per-client key)
    React.useEffect(() => {
      try {
        if (activeSubtab !== 'personal' && activeSubtab !== 'shared') return;
        localStorage.setItem(getRationSubtabKey(), JSON.stringify(activeSubtab));
      } catch (_) { }
    }, [activeSubtab]);

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

    // Авто-дополнение extended полей для локальных продуктов из shared_products
    const sharedFieldsBackfillRef = React.useRef({ key: '', inFlight: false });
    React.useEffect(() => {
      if (!Array.isArray(products) || products.length === 0) return;

      const normalizeName = window.HEYS?.models?.normalizeProductName
        || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
      const isMissing = (v) => v === undefined || v === null || v === '';
      const listMissing = (v) => !Array.isArray(v) || v.length === 0;

      const missing = products
        .filter(p => (
          isMissing(p?.createdAt) || // 🆕 v4.8.7: sort order
          isMissing(p?.sodium100) ||
          isMissing(p?.omega3_100) ||
          isMissing(p?.omega6_100) ||
          isMissing(p?.nova_group) ||
          listMissing(p?.additives) ||
          isMissing(p?.nutrient_density) ||
          isMissing(p?.is_organic) ||
          isMissing(p?.is_whole_grain) ||
          isMissing(p?.is_fermented) ||
          isMissing(p?.is_raw) ||
          isMissing(p?.vitamin_a) ||
          isMissing(p?.vitamin_c) ||
          isMissing(p?.vitamin_d) ||
          isMissing(p?.vitamin_e) ||
          isMissing(p?.vitamin_k) ||
          isMissing(p?.vitamin_b1) ||
          isMissing(p?.vitamin_b2) ||
          isMissing(p?.vitamin_b3) ||
          isMissing(p?.vitamin_b6) ||
          isMissing(p?.vitamin_b9) ||
          isMissing(p?.vitamin_b12) ||
          isMissing(p?.calcium) ||
          isMissing(p?.iron) ||
          isMissing(p?.magnesium) ||
          isMissing(p?.phosphorus) ||
          isMissing(p?.potassium) ||
          isMissing(p?.zinc) ||
          isMissing(p?.selenium) ||
          isMissing(p?.iodine)
        ))
        .map(p => ({ id: p?.shared_origin_id, name: normalizeName(p?.name) }))
        .filter(p => p.id || p.name);

      if (missing.length === 0) return;

      const missingKey = missing
        .map(p => p.id || p.name)
        .sort()
        .join('|');

      if (sharedFieldsBackfillRef.current.inFlight || sharedFieldsBackfillRef.current.key === missingKey) return;

      sharedFieldsBackfillRef.current = { key: missingKey, inFlight: true };

      (async () => {
        try {
          const cloud = window.HEYS?.cloud;
          if (!cloud?.getAllSharedProducts) return;

          const result = await cloud.getAllSharedProducts({ limit: 1000, excludeBlocklist: false });
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

          const pickShared = (p) => {
            if (p?.shared_origin_id && byId.has(p.shared_origin_id)) {
              return byId.get(p.shared_origin_id);
            }
            const nm = normalizeName(p?.name);
            if (nm && nameCounts.get(nm) === 1) {
              return byName.get(nm);
            }
            return null;
          };

          const updated = products.map(p => {
            const sharedProduct = pickShared(p);
            if (!sharedProduct) return p;

            const next = { ...p };
            let changed = false;
            const setIfMissing = (key, value) => {
              if (isMissing(next[key]) && !isMissing(value)) {
                next[key] = value;
                changed = true;
              }
            };
            const setListIfMissing = (key, value) => {
              if (listMissing(next[key]) && Array.isArray(value) && value.length > 0) {
                next[key] = value;
                changed = true;
              }
            };

            setIfMissing('sodium100', sharedProduct.sodium100);
            setIfMissing('omega3_100', sharedProduct.omega3_100);
            setIfMissing('omega6_100', sharedProduct.omega6_100);
            setIfMissing('nova_group', sharedProduct.nova_group ?? sharedProduct.novaGroup);
            setListIfMissing('additives', sharedProduct.additives);
            setIfMissing('nutrient_density', sharedProduct.nutrient_density ?? sharedProduct.nutrientDensity);
            setIfMissing('is_organic', sharedProduct.is_organic ?? sharedProduct.isOrganic);
            setIfMissing('is_whole_grain', sharedProduct.is_whole_grain ?? sharedProduct.isWholeGrain);
            setIfMissing('is_fermented', sharedProduct.is_fermented ?? sharedProduct.isFermented);
            setIfMissing('is_raw', sharedProduct.is_raw ?? sharedProduct.isRaw);
            setIfMissing('vitamin_a', sharedProduct.vitamin_a ?? sharedProduct.vitaminA);
            setIfMissing('vitamin_c', sharedProduct.vitamin_c ?? sharedProduct.vitaminC);
            setIfMissing('vitamin_d', sharedProduct.vitamin_d ?? sharedProduct.vitaminD);
            setIfMissing('vitamin_e', sharedProduct.vitamin_e ?? sharedProduct.vitaminE);
            setIfMissing('vitamin_k', sharedProduct.vitamin_k ?? sharedProduct.vitaminK);
            setIfMissing('vitamin_b1', sharedProduct.vitamin_b1 ?? sharedProduct.vitaminB1);
            setIfMissing('vitamin_b2', sharedProduct.vitamin_b2 ?? sharedProduct.vitaminB2);
            setIfMissing('vitamin_b3', sharedProduct.vitamin_b3 ?? sharedProduct.vitaminB3);
            setIfMissing('vitamin_b6', sharedProduct.vitamin_b6 ?? sharedProduct.vitaminB6);
            setIfMissing('vitamin_b9', sharedProduct.vitamin_b9 ?? sharedProduct.vitaminB9);
            setIfMissing('vitamin_b12', sharedProduct.vitamin_b12 ?? sharedProduct.vitaminB12);
            setIfMissing('calcium', sharedProduct.calcium);
            setIfMissing('iron', sharedProduct.iron);
            setIfMissing('magnesium', sharedProduct.magnesium);
            setIfMissing('phosphorus', sharedProduct.phosphorus);
            setIfMissing('potassium', sharedProduct.potassium);
            setIfMissing('zinc', sharedProduct.zinc);
            setIfMissing('selenium', sharedProduct.selenium);
            setIfMissing('iodine', sharedProduct.iodine);

            // 🆕 v4.8.7: Backfill createdAt from shared product's created_at
            // Allows correct sort order in personal list even without cloud sync
            if (isMissing(next.createdAt)) {
              const rawCreated = sharedProduct.created_at ?? sharedProduct.createdAt;
              if (rawCreated) {
                let tsCreated = typeof rawCreated === 'number' ? rawCreated : (() => {
                  let parsed = Date.parse(rawCreated);
                  if (!Number.isFinite(parsed)) {
                    const norm = String(rawCreated)
                      .replace(' ', 'T')
                      .replace(/(\.(\d{3}))\d+/, '$1')
                      .replace(/\+00$/, 'Z')
                      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
                    parsed = Date.parse(norm);
                  }
                  return Number.isFinite(parsed) ? parsed : 0;
                })();
                if (tsCreated > 0) { next.createdAt = tsCreated; changed = true; }
              }
            }

            return changed ? next : p;
          });

          const changed = updated.some((p, i) => p !== products[i]);
          if (changed) {
            const withCreatedAt = updated.filter(p => p.createdAt).length;
            console.info(`[baza] 📅 sharedBackfill: createdAt filled=${withCreatedAt}/${updated.length}, changed=${updated.filter((p, i) => p !== products[i]).length} products`);
            setProducts(updated);
          }
        } finally {
          sharedFieldsBackfillRef.current.inFlight = false;
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

    // Антиспам-ключ для логов сортировки personal
    const personalSortLogRef = React.useRef('');

    // Лимит отображения последних продуктов (для скорости)
    const filtered = React.useMemo(() => {
      // Используем normalizeText из SmartSearch (единый источник)
      const normalizeSearchText = window.HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));

      const toTs = (v) => {
        if (v == null) return 0;
        if (typeof v === 'number') return v;

        const raw = String(v || '').trim();
        if (!raw) return 0;

        // 1) Пробуем как есть (ISO и стандартные форматы)
        let parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) return parsed;

        // 2) Fallback для PostgreSQL timestamptz: "YYYY-MM-DD HH:mm:ss.ffffff+00"
        //    - пробел -> T
        //    - микросекунды -> миллисекунды
        //    - +00 / +0000 / +00:00 нормализуем
        const normalized = raw
          .replace(' ', 'T')
          .replace(/(\.\d{3})\d+/, '$1')
          .replace(/\+00$/, 'Z')
          .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

        parsed = Date.parse(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const sortByCreatedAtDesc = (list) => {
        return [...list].sort((a, b) => {
          // ДОЛЖНО БЫТЬ КАК В shared: createdAt в приоритете, затем updatedAt
          const aTs = toTs(a?.createdAt ?? a?.created_at ?? a?.updatedAt ?? a?.updated_at);
          const bTs = toTs(b?.createdAt ?? b?.created_at ?? b?.updatedAt ?? b?.updated_at);
          return bTs - aTs;
        });
      };

      function performSearch() {
        const q = normalizeSearchText(query.trim());
        if (!q) return sortByCreatedAtDesc(products);

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
      try {
        const now = Date.now();
        if ((now - (productsLogState.lastSearch || 0)) > 4000) {
          productsLogState.lastSearch = now;
          if ((products?.length || 0) < 25 || (query && query.trim().length >= 2 && (result?.length || 0) === 0)) {
            console.warn('[HEYS.search:PIPE]', {
              query,
              productsLen: products?.length || 0,
              searchIndexSize: searchIndex?.size || 0,
              resultLen: result?.length || 0,
              durationMs: Math.round(duration),
            });
          }
        }
      } catch (_) { /* noop */ }

      // Трекинг поиска
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackSearch(query, result.length, duration);
      }

      const sortedResult = sortByCreatedAtDesc(result);
      if (!query) {
        const preview = sortedResult.slice(0, 5).map((p, i) => {
          const createdRaw = p?.createdAt ?? p?.created_at ?? null;
          const updatedRaw = p?.updatedAt ?? p?.updated_at ?? null;
          return {
            rank: i + 1,
            name: p?.name || null,
            createdAt: createdRaw,
            updatedAt: updatedRaw,
            sortTs: toTs(createdRaw ?? updatedRaw)
          };
        });

        const top = preview[0] || {};
        const logKey = `${sortedResult.length}|${top.name || ''}|${top.sortTs || 0}`;
        if (personalSortLogRef.current !== logKey) {
          personalSortLogRef.current = logKey;
          console.info('[baza][filter] ✅ Personal sort — count:', sortedResult.length);
          preview.forEach(p => {
            const tsFormatted = p.sortTs ? new Date(p.sortTs).toISOString() : 'NO_TS';
            const createdStr = p.createdAt ? String(p.createdAt).slice(0, 19) : '—';
            const updatedStr = p.updatedAt ? String(p.updatedAt).slice(0, 19) : '—';
            console.info(`[baza][filter]   #${p.rank} "${p.name}" | created=${createdStr} | updated=${updatedStr} | sortTs=${tsFormatted}`);
          });
        }
      }
      return sortedResult;
    }, [products, query, searchIndex]);

    const personalRanges = React.useMemo(() => buildRangeOptions(filtered.length), [filtered.length]);

    React.useEffect(() => {
      setPersonalRangeStart(0);
      setPersonalRangeActive(false);
    }, [query]);

    React.useEffect(() => {
      if (personalRangeStart >= filtered.length) setPersonalRangeStart(0);
    }, [filtered.length, personalRangeStart]);

    const renderRangeButtons = (ranges, activeStart, onSelect, isActive) => {
      if (!ranges || ranges.length <= 1) return null;
      return React.createElement('div', { className: 'products-range row' },
        React.createElement('span', { className: 'products-range__label muted' }, 'Показать:'),
        ranges.map((range) => React.createElement('button', {
          key: `range_${range.start}_${range.end}`,
          className: (isActive && activeStart === range.start) ? 'btn acc products-range__btn' : 'btn products-range__btn',
          onClick: () => onSelect(range.start)
        }, range.label))
      );
    };

    // ══════════════════════════════════════════════════════════════════════════════════
    // 📊 UNIFIED: filteredShared — единый useMemo для shared данных (вместо inline IIFE)
    // ══════════════════════════════════════════════════════════════════════════════════
    const filteredShared = React.useMemo(() => {
      const toTs = (v) => {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        const parsed = Date.parse(v);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const sortByCreatedAtDesc = (list) => {
        return [...list].sort((a, b) => {
          const aTs = toTs(a?.createdAt ?? a?.created_at ?? a?.updatedAt ?? a?.updated_at);
          const bTs = toTs(b?.createdAt ?? b?.created_at ?? b?.updatedAt ?? b?.updated_at);
          return bTs - aTs;
        });
      };

      const q = (sharedQuery || '').toLowerCase().trim();
      const filtered = q.length >= 2
        ? allSharedProducts.filter(p => (p.name || '').toLowerCase().includes(q))
        : allSharedProducts;

      return sortByCreatedAtDesc(filtered);
    }, [allSharedProducts, sharedQuery]);

    const sharedRanges = React.useMemo(() => buildRangeOptions(filteredShared.length), [filteredShared.length]);

    React.useEffect(() => {
      setSharedRangeStart(0);
      setSharedRangeActive(false);
    }, [sharedQuery, activeSubtab]);

    React.useEffect(() => {
      if (sharedRangeStart >= filteredShared.length) setSharedRangeStart(0);
    }, [filteredShared.length, sharedRangeStart]);

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
        let normalizedLatest = applyTombstoneFilter(normalizePersonalProducts(latest));

        if (Array.isArray(normalizedLatest) && normalizedLatest.length > 0) {
          if (window.DEV) {
            window.DEV.log('📦 [RATION] Products updated via event:', normalizedLatest.length, 'items');
          }
          // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов (race condition защита)
          setProducts(prev => {
            if (Array.isArray(prev) && prev.length > normalizedLatest.length) {
              if (window.DEV) {
                window.DEV.log('⚠️ [RATION] BLOCKED: не уменьшаем', prev.length, '→', normalizedLatest.length);
              }
              return prev;
            }
            // 🔒 Не обновляем если количество одинаковое
            if (Array.isArray(prev) && prev.length === normalizedLatest.length) {
              return prev;
            }
            return normalizedLatest;
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
      // 🪦 FIX v4.9.1: Добавлена BLOCKED-защита — если recovery пуст (все orphans были tombstoned),
      // не обновляем state чтобы не перезаписать правильное количество.
      const handleOrphansRecovered = () => {
        const latest = (window.HEYS.store?.get?.('heys_products', null)) ||
          (window.HEYS.utils?.lsGet?.('heys_products', [])) || [];
        const normalizedLatest = applyTombstoneFilter(normalizePersonalProducts(latest));
        if (Array.isArray(normalizedLatest) && normalizedLatest.length > 0) {
          setProducts((prev) => {
            // 🛡️ BLOCKED-защита: не уменьшаем state через orphan recovery
            if (Array.isArray(prev) && prev.length > normalizedLatest.length) {
              console.warn('[RATION] 🚫 handleOrphansRecovered BLOCKED: prev=' + prev.length + ' > latest=' + normalizedLatest.length);
              return prev;
            }
            // 🛡️ Не обновляем если количество одинаковое (нет реального recovery)
            if (Array.isArray(prev) && prev.length === normalizedLatest.length) {
              return prev;
            }
            if (window.DEV) {
              window.DEV.log('🔄 [RATION] Orphans recovered, updating state:', normalizedLatest.length, 'items');
            }
            return normalizedLatest;
          });
        }
      };

      window.addEventListener('heysProductsUpdated', handleProductsUpdated);
      window.addEventListener('heysSyncCompleted', handleProductsUpdated);
      window.addEventListener('heys:product-updated', handleProductPatched);
      window.addEventListener('heys:product-portions-updated', handleProductPatched);
      window.addEventListener('heys:local-product-updated', handleProductPatched);
      window.addEventListener('heys:orphans-recovered', handleOrphansRecovered);

      return () => {
        window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
        window.removeEventListener('heysSyncCompleted', handleProductsUpdated);
        window.removeEventListener('heys:product-updated', handleProductPatched);
        window.removeEventListener('heys:product-portions-updated', handleProductPatched);
        window.removeEventListener('heys:local-product-updated', handleProductPatched);
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
          if (stats?.removed > 0 && Array.isArray(deduped)) return normalizePersonalProducts(deduped);
          if (Array.isArray(deduped) && deduped.length === before) return normalizePersonalProducts(deduped);
        }
        return normalizePersonalProducts(safeLatest);
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
            setProducts(applyTombstoneFilter(getDeduplicatedProducts(latest)));
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
          setProducts(applyTombstoneFilter(getDeduplicatedProducts(latest)));
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

        setProducts(applyTombstoneFilter(getDeduplicatedProducts(latest)));
      }
    }, [window.HEYS && window.HEYS.currentClientId]);

    function resetDraft() { setDraft(INITIAL_DRAFT); setExpandedSections({ base: true, extra: false, vitamins: false, minerals: false, nova: false, flags: false }); }
    async function addProduct() {
      console.group('[baza] ➕ addProduct — НАЧАЛО ДОБАВЛЕНИЯ');
      const name = (draft.name || '').trim();
      console.info('[baza] ➕ Имя:', name, '| publishToShared:', publishToShared, '| isCurator:', isCurator);
      if (!name) {
        console.warn('[baza] ➕ ОТМЕНА: пустое имя');
        console.groupEnd();
        HEYS.Toast?.warning('Введите название продукта') || alert('Введите название продукта');
        return;
      }
      // Проверка уникальности названия в личной базе
      const existingProduct = products.find(p => p.name && p.name.trim().toLowerCase() === name.toLowerCase());
      if (existingProduct) {
        console.warn('[baza] ➕ ОТМЕНА: дубликат в личной базе, id=', existingProduct.id);
        console.groupEnd();
        HEYS.Toast?.warning(`Продукт "${name}" уже существует в базе! Используйте другое название.`) || alert(`Продукт "${name}" уже существует в базе!`);
        return;
      }
      // === Собираем расширенный продукт со всеми полями ===
      const base = {
        id: uuid(), name: name, createdAt: Date.now(),
        // Базовые нутриенты
        simple100: toNum(draft.simple100), complex100: toNum(draft.complex100), protein100: toNum(draft.protein100),
        badFat100: toNum(draft.badFat100), goodFat100: toNum(draft.goodFat100), trans100: toNum(draft.trans100),
        fiber100: toNum(draft.fiber100), gi: toNum(draft.gi), harm: toNum(draft.harm),
        // Дополнительные нутриенты
        sodium100: toNum(draft.sodium100), cholesterol100: toNum(draft.cholesterol100), sugar100: toNum(draft.sugar100),
        omega3_100: toNum(draft.omega3_100), omega6_100: toNum(draft.omega6_100),
        // Витамины (% от суточной нормы)
        vitaminA: toNum(draft.vitaminA), vitaminC: toNum(draft.vitaminC), vitaminD: toNum(draft.vitaminD),
        vitaminE: toNum(draft.vitaminE), vitaminK: toNum(draft.vitaminK),
        vitaminB1: toNum(draft.vitaminB1), vitaminB2: toNum(draft.vitaminB2), vitaminB3: toNum(draft.vitaminB3),
        vitaminB6: toNum(draft.vitaminB6), vitaminB9: toNum(draft.vitaminB9), vitaminB12: toNum(draft.vitaminB12),
        // Минералы (% от суточной нормы)
        calcium: toNum(draft.calcium), iron: toNum(draft.iron), magnesium: toNum(draft.magnesium),
        phosphorus: toNum(draft.phosphorus), potassium: toNum(draft.potassium), zinc: toNum(draft.zinc),
        selenium: toNum(draft.selenium), iodine: toNum(draft.iodine),
        // NOVA и переработка
        novaGroup: toNum(draft.novaGroup) || undefined, // 0 = авто-детект
        additives: draft.additives ? draft.additives.split(',').map(s => s.trim()).filter(Boolean) : [],
        // Флаги качества
        isOrganic: !!draft.isOrganic, isWholeGrain: !!draft.isWholeGrain,
        isFermented: !!draft.isFermented, isRaw: !!draft.isRaw,
        // Комментарий и категория
        harmNote: (draft.harmNote || '').trim() || undefined,
        category: (draft.category || '').trim() || undefined
      };
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
              console.info('[baza] ➕ fingerprint match → merge modal | existing:', existing.id, existing.name);
              console.groupEnd();
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

      const newList = [...products, newProduct];
      console.info('[baza] ➕ setProducts: было', products.length, '→ стало', newList.length, '| новый id:', newProduct.id);
      // 🪦 Проверяем: не в tombstone ли этот продукт?
      try {
        const tombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
        if (Array.isArray(tombstones) && tombstones.length > 0) {
          const inTombById = tombstones.find(t => t.id === newProduct.id);
          const inTombByName = tombstones.find(t => t.name === newProduct.name);
          if (inTombById || inTombByName) {
            console.warn('[baza] ➕ ⚠️ ВНИМАНИЕ: продукт в tombstone!', { byId: !!inTombById, byName: !!inTombByName });
            // Убираем из tombstone чтобы не блокировать
            const cleaned = tombstones.filter(t => t.id !== newProduct.id && t.name !== newProduct.name);
            window.HEYS.store.set('heys_deleted_ids', cleaned);
            console.info('[baza] ➕ 🪦 tombstone очищен от этого продукта, осталось:', cleaned.length);
          } else {
            console.info('[baza] ➕ ✅ продукт НЕ в tombstone');
          }
        }
      } catch (_) { }
      setProducts(newList);
      // Проверяем: сохранилось ли в localStorage?
      setTimeout(() => {
        try {
          const lsCheck = window.HEYS?.store?.get?.('heys_products') || [];
          const found = Array.isArray(lsCheck) && lsCheck.find(p => p.id === newProduct.id);
          console.info('[baza] ➕ 🔍 POST-CHECK (50ms): localStorage length=', lsCheck.length, '| продукт найден:', !!found);
          if (!found) {
            console.error('[baza] ➕ ❌ КРИТИЧНО: продукт НЕ сохранился в localStorage! useEffect guard заблокировал?');
          }
        } catch (_) { }
      }, 50);
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', 1);
      }
      resetDraft();
      setShowModal(false);
      console.info('[baza] ➕ addProduct ЗАВЕРШЁН');
      console.groupEnd();
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
      console.group('[baza] 🗑️ deleteRow — НАЧАЛО УДАЛЕНИЯ из личной базы');
      console.info('[baza] 🎯 id для удаления:', id);

      // 🔴 GUARD: если id не задан — отказываем, иначе удалим ВСЕХ у кого id=undefined
      if (id === undefined || id === null || id === '') {
        console.error('[baza] ❌ ОТМЕНА deleteRow: передан невалидный id =', id, '— удаление прервано!');
        console.error('[baza] ❌ Это означает что у продукта нет поля id. Нужна миграция localStorage.');
        console.groupEnd();
        return;
      }

      // --- ШАГ 1: найти продукт в state ---
      const targetProduct = products.find(p => p.id === id);
      console.info('[baza] 📦 ШАГИ 1/7 — Продукт найден в state:', targetProduct
        ? { id: targetProduct.id, name: targetProduct.name, kcal100: targetProduct.kcal100, protein100: targetProduct.protein100 }
        : '❌ НЕ НАЙДЕН (id не совпадает ни с одним продуктом!)');
      console.info('[baza] 📊 Текущий React state: products.length =', products.length);

      // --- ШАГ 2: фильтрация ---
      const filtered = products.filter(p => p.id !== id);
      console.info('[baza] ✂️ ШАГ 2/7 — После фильтрации:', filtered.length, 'продуктов (было:', products.length, ', удалено:', products.length - filtered.length, ')');
      if (products.length === filtered.length) {
        console.warn('[baza] ⚠️ ВНИМАНИЕ: количество не изменилось! Продукт с id', id, 'не найден в products[]');
      }

      // --- ШАГ 3: localStorage ДО записи ---
      // 🛡️ v4.8.8: Проверяем место перед удалением. Если localStorage полон, запись может упасть,
      // и React state обновится, но диск — нет. При перезагрузке продукт вернётся.
      try {
        const testKey = '__test_storage_quota__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
      } catch (e) {
        console.warn('[baza] ⚠️ localStorage ПОЛОН перед удалением — пробуем освободить место...', e);
        // Пытаемся вызвать aggressiveCleanup из storage слоя
        if (window.HEYS?.cloud?.cleanupStorage) {
          window.HEYS.cloud.cleanupStorage(30); // Удаляем старые дни (>30 дней)
          console.info('[baza] 🧹 Cleanup executed to free space for deletion');
        }
      }

      const lsBefore = (window.HEYS?.store?.get?.('heys_products', null))
        || (window.HEYS?.utils?.lsGet?.('heys_products', null));
      console.info('[baza] 💾 ШАГ 3/7 — localStorage ДО записи:', Array.isArray(lsBefore) ? lsBefore.length + ' продуктов' : '⚠️ null/не массив');

      // --- ШАГ 4: флаг intentionalDelete ---
      if (window.HEYS) {
        window.HEYS._intentionalProductDelete = true;
        console.info('[baza] 🚩 ШАГ 4/7 — Флаг _intentionalProductDelete установлен: true');
      } else {
        console.warn('[baza] ⚠️ ШАГ 4/7 — window.HEYS не доступен! Флаг не установлен — сохранение может быть заблокировано');
      }

      // --- ШАГ 5: синхронная запись в localStorage ---
      let lsWriteMethod = 'none';
      // 🔴 FIX: сохраняем в localStorage СИНХРОННО перед setProducts,
      // иначе гонка условий: handleProductsUpdated читает старый localStorage (N)
      // и восстанавливает удалённый продукт из-за проверки "не уменьшаем"
      if (window.HEYS) {
        if (window.HEYS.store && typeof window.HEYS.store.set === 'function') {
          window.HEYS.store.set('heys_products', filtered);
          lsWriteMethod = 'HEYS.store.set';
        } else if (window.HEYS.utils && typeof window.HEYS.utils.lsSet === 'function') {
          window.HEYS.utils.lsSet('heys_products', filtered);
          lsWriteMethod = 'HEYS.utils.lsSet';
        }
      }
      const lsAfter = (window.HEYS?.store?.get?.('heys_products', null))
        || (window.HEYS?.utils?.lsGet?.('heys_products', null));
      console.info('[baza] 💾 ШАГ 5/7 — localStorage ПОСЛЕ записи:', {
        метод: lsWriteMethod,
        количество: Array.isArray(lsAfter) ? lsAfter.length : '⚠️ null',
        совпадает_с_filtered: Array.isArray(lsAfter) && lsAfter.length === filtered.length ? '✅ ДА' : '❌ НЕТ',
      });
      if (Array.isArray(lsAfter) && lsAfter.find(p => p.id === id)) {
        console.error('[baza] ❌ КРИТИЧНО: удалённый продукт ВСЁ ЕЩЁ есть в localStorage! id=', id);
      } else {
        console.info('[baza] ✅ Удалённый продукт отсутствует в localStorage');
      }

      // --- ШАГ 5.5: tombstone — защита от cloud-sync resurrection ---
      // 🪦 Записываем id+name удалённого продукта в список tombstones.
      // handleProductsUpdated фильтрует tombstoned продукты при каждом cloud sync событии,
      // поэтому даже если облако вернёт продукт при refresh — он будет отфильтрован.
      try {
        const tombstoneKey = 'heys_deleted_ids';
        const existing = window.HEYS?.store?.get?.(tombstoneKey) || [];
        const validExisting = Array.isArray(existing) ? existing : [];
        const fingerprint = {
          id: targetProduct?.id ?? id,
          name: targetProduct?.name ?? null,
          ts: Date.now()
        };
        // Лимит: храним не больше 200 tombstones (старые — первыми вытесняем)
        const updated = [...validExisting.filter(t => t.id !== id), fingerprint].slice(-200);
        if (window.HEYS?.store?.set) {
          window.HEYS.store.set(tombstoneKey, updated);
          console.info('[baza] 🪦 ШАГ 5.5/7 — tombstone записан:', { id: fingerprint.id, name: fingerprint.name, total_tombstones: updated.length });
        } else {
          console.warn('[baza] ⚠️ ШАГ 5.5/7 — tombstone: HEYS.store.set недоступен, tombstone не сохранён!');
        }
        // 🔗 FIX: синхронизируем с HEYS.deletedProducts чтобы mergeProductsData тоже знала о deletion.
        // deleteRow писал только в heys_deleted_ids, а mergeProductsData проверяет HEYS.deletedProducts.isProductDeleted()
        // → без этого вызова cloud merge не фильтровал удалённые продукты → resurrection при refresh.
        if (window.HEYS?.deletedProducts?.add && fingerprint.name) {
          window.HEYS.deletedProducts.add(fingerprint.name, fingerprint.id);
          console.info('[baza] 🔗 ШАГ 5.5/7 — deletedProducts.add синхронизирован (защита от merge-resurrection):', fingerprint.name);
        }
      } catch (te) {
        console.warn('[baza] ⚠️ ШАГ 5.5/7 — tombstone save error:', te.message);
      }

      // --- ШАГ 5.6: удалить из OverlayStore ---
      // 🆕 КРИТИЧНО: когда overlay_products_v2 ON, getAll() читает overlay merged view.
      // Tombstone+legacy delete не трогают overlay row → row остаётся с in_my_list:true →
      // следующий getAll() возвращает удалённый продукт → setProducts восстанавливает его в state →
      // продукт мгновенно возвращается на UI. Удаляем row из overlay чтобы это не происходило.
      try {
        if (window.HEYS?.OverlayStore?.removeRow) {
          const overlayRemoved = window.HEYS.OverlayStore.removeRow(targetProduct?.id ?? id);
          console.info('[baza] 🧱 ШАГ 5.6/7 — OverlayStore.removeRow:', overlayRemoved ? '✅ удалён' : '— не найден в overlay');
        } else {
          console.info('[baza] ℹ️ ШАГ 5.6/7 — OverlayStore.removeRow недоступен (overlay flag OFF?)');
        }
      } catch (oe) {
        console.warn('[baza] ⚠️ ШАГ 5.6/7 — OverlayStore.removeRow error:', oe.message);
      }

      // --- ШАГ 6: setProducts ---
      console.info('[baza] ⚛️ ШАГ 6/7 — Вызов setProducts(filtered) — React state обновится асинхронно');
      setProducts(filtered);

      // --- ШАГ 7: аналитика ---
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
        console.info('[baza] 📈 ШАГ 7/7 — analytics.trackDataOperation("storage-op") вызван');
      } else {
        console.info('[baza] ℹ️ ШАГ 7/7 — analytics недоступен, пропущено');
      }

      console.info('[baza] ✅ deleteRow ЗАВЕРШЁН — итог:', {
        удалённый_id: id,
        удалённый_продукт: targetProduct?.name ?? '❌ не найден',
        было: products.length,
        стало: filtered.length,
        localStorage_обновлён: lsWriteMethod !== 'none' ? '✅' : '❌',
      });
      console.groupEnd();
    }
    // 🔄 Синхронизация продукта из личной базы в общую
    async function syncProductToShared(localProduct) {
      if (!localProduct) return;
      const normalizeProductName = HEYS.models?.normalizeProductName
        || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));

      let sharedId = localProduct.shared_origin_id ?? localProduct.sharedOriginId ?? localProduct.shared_id ?? localProduct.sharedId;
      let matchedShared = null;

      const findSharedByName = (list) => {
        if (!Array.isArray(list)) return null;
        const nameKey = normalizeProductName(localProduct?.name);
        if (!nameKey) return null;
        return list.find((sp) => normalizeProductName(sp?.name) === nameKey) || null;
      };

      if (!sharedId) {
        const cached = window.HEYS?.cloud?.getCachedSharedProducts?.() || allSharedProducts || [];
        matchedShared = findSharedByName(cached);
        if (!matchedShared && window.HEYS?.cloud?.getAllSharedProducts) {
          try {
            const result = await window.HEYS.cloud.getAllSharedProducts({ limit: 500 });
            if (result?.data) {
              setAllSharedProducts(result.data);
              matchedShared = findSharedByName(result.data);
            }
          } catch (err) {
            console.warn('[SYNC SHARED] Load shared failed:', err);
          }
        }
        if (matchedShared?.id != null) {
          sharedId = matchedShared.id;
        }
      }

      if (!sharedId) {
        HEYS.Toast?.warning('Нет связи с общей базой для этого продукта') || alert('Нет связи с общей базой для этого продукта');
        return;
      }
      // Подготовим данные в формате shared (snake_case)
      const productForShared = {
        ...localProduct,
        id: sharedId,
        sodium100: localProduct.sodium100 ?? localProduct.Na ?? null,
        omega3_100: localProduct.omega3_100 ?? localProduct['Ω3'] ?? null,
        omega6_100: localProduct.omega6_100 ?? localProduct['Ω6'] ?? null,
        nova_group: localProduct.nova_group ?? localProduct.novaGroup ?? null,
        nutrient_density: localProduct.nutrient_density ?? localProduct.nutrientDensity ?? null,
        is_organic: localProduct.is_organic ?? localProduct.isOrganic ?? false,
        is_whole_grain: localProduct.is_whole_grain ?? localProduct.isWholeGrain ?? false,
        is_fermented: localProduct.is_fermented ?? localProduct.isFermented ?? false,
        is_raw: localProduct.is_raw ?? localProduct.isRaw ?? false,
        vitamin_a: localProduct.vitamin_a ?? localProduct.vitaminA ?? null,
        vitamin_c: localProduct.vitamin_c ?? localProduct.vitaminC ?? null,
        vitamin_d: localProduct.vitamin_d ?? localProduct.vitaminD ?? null,
        vitamin_e: localProduct.vitamin_e ?? localProduct.vitaminE ?? null,
        vitamin_k: localProduct.vitamin_k ?? localProduct.vitaminK ?? null,
        vitamin_b1: localProduct.vitamin_b1 ?? localProduct.vitaminB1 ?? null,
        vitamin_b2: localProduct.vitamin_b2 ?? localProduct.vitaminB2 ?? null,
        vitamin_b3: localProduct.vitamin_b3 ?? localProduct.vitaminB3 ?? null,
        vitamin_b6: localProduct.vitamin_b6 ?? localProduct.vitaminB6 ?? null,
        vitamin_b9: localProduct.vitamin_b9 ?? localProduct.vitaminB9 ?? null,
        vitamin_b12: localProduct.vitamin_b12 ?? localProduct.vitaminB12 ?? null
      };
      try {
        if (HEYS.AddProductStep?.updateSharedProduct) {
          const result = await HEYS.AddProductStep.updateSharedProduct(productForShared, sharedId);
          if (result?.ok) {
            // Обновляем локальный продукт — убираем маркер обновления
            setProducts(prev => prev.map(p => p.id === localProduct.id ? { ...p, _syncedAt: Date.now() } : p));
          }
        } else {
          HEYS.Toast?.error('Функция обновления недоступна') || alert('Функция обновления недоступна');
        }
      } catch (e) {
        HEYS.Toast?.error('Ошибка синхронизации: ' + e.message) || alert('Ошибка синхронизации: ' + e.message);
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
        const debugLog = (step, payload) => {
          const entry = { ts: new Date().toISOString(), step, payload };
          HEYS._syncDebug = Array.isArray(HEYS._syncDebug) ? HEYS._syncDebug : [];
          HEYS._syncDebug.push(entry);
          if (HEYS._syncDebug.length > 200) {
            HEYS._syncDebug.shift();
          }
          if (window.DEV?.log) {
            if (payload !== undefined) {
              window.DEV.log(`🔄 [SYNC] ${step}`, payload);
            } else {
              window.DEV.log(`🔄 [SYNC] ${step}`);
            }
          }
        };

        debugLog('start');
        // 1. Показать подтверждение
        const confirmed = await (HEYS.ConfirmModal?.confirm?.({
          title: '🔄 Синхронизация с общей базой',
          message: 'Добавить недостающие продукты и обновить существующие с пустыми нутриентами?',
          confirmText: 'Синхронизировать',
          cancelText: 'Отмена'
        }) ?? Promise.resolve(window.confirm('Синхронизировать с общей базой? Добавятся недостающие продукты и обновятся существующие с пустыми полями.')));

        debugLog('confirm', { confirmed });
        if (!confirmed) return;

        // 2. Загрузить shared products
        HEYS.Toast?.info('⏳ Загружаем общую базу…');

        let sharedProducts = [];
        let sharedSource = 'unknown';
        try {
          if (HEYS.cloud?.getAllSharedProducts) {
            const result = await HEYS.cloud.getAllSharedProducts({ limit: 1000 });
            // getAllSharedProducts может вернуть { data: [...] } или напрямую массив
            sharedProducts = Array.isArray(result) ? result : (result?.data || result?.products || []);
            sharedSource = 'cloud.getAllSharedProducts';
          } else if (HEYS.YandexAPI?.rpc) {
            const result = await HEYS.YandexAPI.rpc('get_shared_products', {
              p_search: null,
              p_limit: 1000,
              p_offset: 0
            });
            sharedProducts = Array.isArray(result) ? result : (result?.data || result?.products || []);
            sharedSource = 'YandexAPI.rpc(get_shared_products)';
          } else if (HEYS.YandexAPI?.rest) {
            const { data, error } = await HEYS.YandexAPI.rest('shared_products');
            if (error) throw new Error(error);
            sharedProducts = Array.isArray(data) ? data : [];
            sharedSource = 'YandexAPI.rest(shared_products)';
          }
        } catch (loadErr) {
          HEYS.analytics?.trackError?.(loadErr, { context: 'ration:restoreFromSharedBase:load' });
          HEYS.Toast?.error('Ошибка загрузки общей базы');
          return;
        }

        // Гарантируем что sharedProducts — массив
        if (!Array.isArray(sharedProducts)) {
          console.warn('[RESTORE] sharedProducts не массив:', typeof sharedProducts, sharedProducts);
          sharedProducts = [];
        }

        debugLog('shared-loaded', { source: sharedSource, count: sharedProducts.length });

        if (sharedProducts.length === 0) {
          HEYS.Toast?.warning('Общая база пуста или недоступна');
          return;
        }

        // 3. Получить текущие продукты
        const currentProducts = products || [];
        debugLog('local-products', { count: currentProducts.length });

        // 4. Создать индексы для быстрой работы
        const normalizeName = HEYS.models?.normalizeProductName
          || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
        const sharedByName = new Map();
        const sharedById = new Map();
        sharedProducts.forEach(sp => {
          if (sp.name) sharedByName.set(normalizeName(sp.name), sp);
          if (sp.id != null) sharedById.set(String(sp.id), sp);
        });

        const existingBySharedOriginId = new Set();
        const existingByNormalizedName = new Map(); // name -> product (для обновления)

        currentProducts.forEach(p => {
          if (p.shared_origin_id != null) {
            existingBySharedOriginId.add(String(p.shared_origin_id));
          }
          if (p.name) {
            existingByNormalizedName.set(normalizeName(p.name), p);
          }
        });
        debugLog('indexes', {
          sharedById: sharedById.size,
          sharedByName: sharedByName.size,
          existingBySharedOriginId: existingBySharedOriginId.size,
          existingByNormalizedName: existingByNormalizedName.size
        });

        // 5. Функции проверки недостающих нутриентов
        const isMissing = (v) => v === undefined || v === null || v === '' || (typeof v === 'number' && isNaN(v));
        const coreFields = ['simple100', 'complex100', 'protein100', 'badFat100', 'goodFat100', 'trans100', 'fiber100', 'gi', 'sodium100'];
        const getMissingFields = (p) => coreFields.filter((key) => isMissing(p?.[key]));
        const hasNonZeroMacros = (p) => {
          if (!p) return false;
          const vals = [p.simple100, p.complex100, p.protein100, p.badFat100, p.goodFat100, p.trans100];
          return vals.some((v) => {
            const n = Number(String(v ?? '').replace(',', '.'));
            return Number.isFinite(n) && n > 0;
          });
        };
        const needsUpdate = (p) => {
          if (!p) return false;
          if (isMissing(p.kcal100) || (p.kcal100 === 0 && hasNonZeroMacros(p))) return true;
          if (isMissing(p.harm)) return true;
          return getMissingFields(p).length > 0;
        };

        // 6. Функция мержа данных из shared в local
        const mergeFromShared = (local, shared) => {
          const merged = { ...local };
          // Проверка "пустого" значения — включает undefined, null, '', NaN, 0
          const isEmpty = (v) => v === undefined || v === null || v === '' || (typeof v === 'number' && isNaN(v));
          const toNum = (v) => {
            if (v === undefined || v === null || v === '') return NaN;
            const n = Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
          };
          // Нормализация имён полей (snake_case в shared vs camelCase в local)
          const fields = [
            ['simple100', 'simple100'],
            ['complex100', 'complex100'],
            ['protein100', 'protein100'],
            ['badFat100', 'badfat100'],
            ['goodFat100', 'goodfat100'],
            ['trans100', 'trans100'],
            ['fiber100', 'fiber100'],
            ['gi', 'gi'],
            ['sodium100', 'sodium100'],
          ];

          let changed = false;
          const debugInfo = {
            fieldsChecked: [],
            localEmpty: [],
            sharedEmpty: [],
            updated: [],
            reasons: [],
            localSnapshot: {},
            sharedSnapshot: {}
          };
          for (const [localKey, sharedKey] of fields) {
            const sharedVal = shared[localKey] ?? shared[sharedKey];
            const localVal = local[localKey];
            debugInfo.fieldsChecked.push(localKey);
            const localIsEmpty = isEmpty(localVal);
            const sharedIsEmpty = isEmpty(sharedVal);
            const localNum = toNum(localVal);
            const sharedNum = toNum(sharedVal);
            const shouldFillZero = (localNum === 0 || localVal === 0) && Number.isFinite(sharedNum) && sharedNum > 0;
            if (localIsEmpty || shouldFillZero) {
              debugInfo.localSnapshot[localKey] = localVal;
              debugInfo.sharedSnapshot[localKey] = sharedVal;
            }
            if (localIsEmpty) debugInfo.localEmpty.push(localKey);
            if (sharedIsEmpty) debugInfo.sharedEmpty.push(localKey);
            // Обновляем если local пустой, а shared заполнен
            if ((localIsEmpty && !sharedIsEmpty) || shouldFillZero) {
              merged[localKey] = sharedVal;
              changed = true;
              debugInfo.updated.push({ key: localKey, from: localVal, to: sharedVal });
            } else if (localIsEmpty && sharedIsEmpty) {
              debugInfo.reasons.push({ key: localKey, reason: 'shared_empty' });
            }
          }

          // harm — обновляем если пустой
          const localHarm = HEYS.models?.normalizeHarm?.(local) ?? local.harm;
          const sharedHarm = HEYS.models?.normalizeHarm?.(shared) ?? shared.harm;
          const localHarmNum = toNum(localHarm);
          const sharedHarmNum = toNum(sharedHarm);
          const shouldFillHarmZero = localHarmNum === 0 && Number.isFinite(sharedHarmNum) && sharedHarmNum > 0;
          if ((isEmpty(localHarm) && !isEmpty(sharedHarm)) || shouldFillHarmZero) {
            merged.harm = sharedHarm;
            changed = true;
            debugInfo.updated.push({ key: 'harm', from: localHarm, to: sharedHarm });
          } else if (isEmpty(localHarm) && isEmpty(sharedHarm)) {
            debugInfo.reasons.push({ key: 'harm', reason: 'shared_empty' });
          }

          // 🔧 FIX: Синхронизация portions — берём из shared если local пустой
          const localPortions = local?.portions;
          const sharedPortions = shared?.portions;
          const localHasPortions = Array.isArray(localPortions) && localPortions.length > 0;
          const sharedHasPortions = Array.isArray(sharedPortions) && sharedPortions.length > 0;
          if (!localHasPortions && sharedHasPortions) {
            merged.portions = sharedPortions;
            changed = true;
            debugInfo.updated.push({ key: 'portions', from: localPortions, to: sharedPortions });
          }

          // shared_origin_id для связи
          if (!merged.shared_origin_id && shared.id) {
            merged.shared_origin_id = shared.id;
            changed = true;
          }

          // Вычисляемые поля
          const kcalMissing = isEmpty(merged.kcal100) || (merged.kcal100 === 0 && hasNonZeroMacros(merged));
          if (kcalMissing) {
            const derived = computeDerived(merged);
            if (derived.kcal100 > 0) {
              merged.kcal100 = derived.kcal100;
              merged.carbs100 = derived.carbs100;
              merged.fat100 = derived.fat100;
              merged._updatedFromShared = new Date().toISOString();
              debugInfo.reasons.push({ key: 'kcal100', reason: 'recomputed_from_macros' });
              changed = true;
            }
          } else if (changed) {
            const derived = computeDerived(merged);
            merged.kcal100 = derived.kcal100;
            merged.carbs100 = derived.carbs100;
            merged.fat100 = derived.fat100;
            merged._updatedFromShared = new Date().toISOString();
          }

          return { merged, changed, debugInfo };
        };

        // 7. Обновить существующие продукты с пустыми нутриентами
        let updatedCount = 0;
        let matchedById = 0;
        let matchedByName = 0;
        let missingCount = 0;
        let noMatchCount = 0;
        const noMatchSamples = [];
        const updatedSamples = [];
        const notUpdatedSamples = [];
        const updatedProducts = currentProducts.map(localP => {
          // Ищем соответствующий продукт в shared
          let sharedP = null;
          if (localP.shared_origin_id != null) {
            sharedP = sharedById.get(String(localP.shared_origin_id));
            if (sharedP) matchedById++;
          }
          if (!sharedP && localP.name) {
            sharedP = sharedByName.get(normalizeName(localP.name));
            if (sharedP) matchedByName++;
          }

          const missingFields = getMissingFields(localP);
          const shouldUpdate = needsUpdate(localP);
          if (shouldUpdate) missingCount++;

          if (!sharedP) {
            if (shouldUpdate && noMatchSamples.length < 5) {
              noMatchSamples.push({
                name: localP?.name,
                shared_origin_id: localP?.shared_origin_id || null,
                missingFields,
                kcal100: localP?.kcal100,
                harm: localP?.harm
              });
            }
            if (shouldUpdate) noMatchCount++;
            return localP; // Нет в shared — оставляем как есть
          }

          // Проверяем нужно ли обновлять
          if (shouldUpdate) {
            const { merged, changed, debugInfo } = mergeFromShared(localP, sharedP);
            if (changed) {
              updatedCount++;
              if (updatedSamples.length < 5) {
                updatedSamples.push({
                  name: localP?.name,
                  sharedId: sharedP?.id,
                  missingFields,
                  debugInfo
                });
              }
              return merged;
            } else {
              // Логируем почему не обновилось
              if (notUpdatedSamples.length < 5) {
                notUpdatedSamples.push({
                  name: localP?.name,
                  sharedId: sharedP?.id,
                  missingFields,
                  debugInfo
                });
              }
            }
          }
          return localP;
        });

        debugLog('update-scan', {
          needsUpdate: missingCount,
          matchedById,
          matchedByName,
          noMatch: noMatchCount,
          updated: updatedCount,
          noMatchSamples,
          updatedSamples,
          notUpdatedSamples
        });

        // 8. Найти отсутствующие продукты (как раньше)
        const missingProducts = sharedProducts.filter(shared => {
          if (existingBySharedOriginId.has(String(shared.id))) return false;
          const normalizedName = normalizeName(shared.name);
          if (existingByNormalizedName.has(normalizedName)) return false;
          return true;
        });
        debugLog('missing-products', { count: missingProducts.length });

        // 9. Клонировать отсутствующие продукты в личную базу
        const uid = HEYS.utils?.uid || ((prefix = 'p_') => prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8));

        const newProducts = missingProducts.map(shared => {
          const harm = HEYS.models?.normalizeHarm?.(shared) ?? shared.harm ?? shared.harmScore ?? null;
          const base = {
            id: uid('p_'),
            shared_origin_id: shared.id,
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
            sodium100: shared.sodium100 ?? null,
            novaGroup: shared.nova_group ?? shared.novaGroup ?? null,
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
            calcium: shared.calcium ?? null,
            iron: shared.iron ?? null,
            magnesium: shared.magnesium ?? null,
            phosphorus: shared.phosphorus ?? null,
            potassium: shared.potassium ?? null,
            zinc: shared.zinc ?? null,
            selenium: shared.selenium ?? null,
            iodine: shared.iodine ?? null,
            isOrganic: shared.is_organic ?? shared.isOrganic ?? false,
            isWholeGrain: shared.is_whole_grain ?? shared.isWholeGrain ?? false,
            isFermented: shared.is_fermented ?? shared.isFermented ?? false,
            isRaw: shared.is_raw ?? shared.isRaw ?? false,
            _restoredFromShared: true,
            _restoredAt: new Date().toISOString()
          };
          // Добавляем вычисляемые поля
          const derived = computeDerived(base);
          return { ...base, ...derived };
        });

        // 10. Сохранить объединённый массив
        const mergedProducts = [...updatedProducts, ...newProducts];
        debugLog('merged', { total: mergedProducts.length, added: newProducts.length, updated: updatedCount });
        // 🪵 TEMP: явный лог итога merge при «Синхронизация с общей базой»
        console.info('[HEYS.products] merge', {
          source: 'restoreFromSharedBase',
          was: currentProducts.length,
          shared: sharedProducts.length,
          added: newProducts.length,
          updated: updatedCount,
          total: mergedProducts.length,
        });

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(mergedProducts, { source: 'import-pasted' });
        } else if (HEYS.store?.set) {
          HEYS.store.set('heys_products', mergedProducts);
        } else if (HEYS.utils?.lsSet) {
          HEYS.utils.lsSet('heys_products', mergedProducts);
        }

        // 11. Обновить UI
        setProducts(mergedProducts);
        if (typeof buildSearchIndex === 'function') {
          buildSearchIndex(mergedProducts);
        }

        // 12. Отчёт
        const addedCount = newProducts.length;
        let message = '';
        if (addedCount > 0 && updatedCount > 0) {
          message = `✅ Добавлено ${addedCount}, обновлено ${updatedCount} продуктов`;
        } else if (addedCount > 0) {
          message = `✅ Добавлено ${addedCount} продуктов`;
        } else if (updatedCount > 0) {
          message = `✅ Обновлено ${updatedCount} продуктов`;
        } else {
          message = '✅ Все продукты уже синхронизированы!';
        }

        debugLog('done', { message });
        HEYS.Toast?.success(message);

        if (window.HEYS?.analytics?.trackDataOperation) {
          window.HEYS.analytics.trackDataOperation('products-synced-from-shared', { added: addedCount, updated: updatedCount });
        }

      } catch (err) {
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

    const getDerivedKcal = (productLike) => {
      const derived = computeDerived(productLike || {});
      return derived.kcal100;
    };

    // ═══════════════════════════════════════════════════════════════════
    // 📊 UNIFIED TABLE HEAD — единый заголовок для обеих таблиц продуктов
    // ═══════════════════════════════════════════════════════════════════
    const renderProductTableHead = () => {
      return React.createElement('thead', null,
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
      );
    };

    // ══════════════════════════════════════════════════════════════════════════════════
    // 📊 UnifiedProductTable — единый компонент таблицы для Personal и Shared
    // ══════════════════════════════════════════════════════════════════════════════════
    const UnifiedProductTable = ({ mode, data, loading, callbacks }) => {
      if (loading) {
        return React.createElement('div', {
          style: { padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }
        }, '⏳ Загрузка продуктов...');
      }

      if (!data || data.length === 0) {
        return React.createElement('div', {
          style: { padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }
        }, 'Нет продуктов');
      }

      return React.createElement('div', { className: 'products-table-scroll' },
        React.createElement('table', { className: 'products-table' },
          renderProductTableHead(),
          React.createElement('tbody', null,
            data.map((p, idx) => renderProductTableRow(p, {
              mode,
              idx,
              ...callbacks
            }))
          )
        )
      );
    };

    const renderProductTableRow = (product, options = {}) => {
      const {
        mode = 'personal',
        idx = 0,
        isCurator: canCurate = false,
        onUpdateRow,
        onDeleteRow,
        onOpenNameEditor,
        onOpenPortionsEditor,
        onOpenSharedPortionsEditor,
        onCloneShared,
        onHideShared,
        onDeleteShared,
        onSyncToShared,
        sharedNameMap
      } = options;

      const readOnly = mode === 'shared';
      const normalizeProductName = HEYS.models?.normalizeProductName
        || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
      const safeNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const toTs = (value) => {
        if (value == null) return 0;
        if (typeof value === 'number') return value;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const normalizedForDerived = {
        ...product,
        protein100: safeNum(product?.protein100),
        simple100: safeNum(product?.simple100),
        complex100: safeNum(product?.complex100),
        badFat100: safeNum(product?.badFat100 ?? product?.badfat100),
        goodFat100: safeNum(product?.goodFat100 ?? product?.goodfat100),
        trans100: safeNum(product?.trans100)
      };
      const derived = computeDerived(normalizedForDerived);
      const kcal = derived.kcal100;
      const carbs = derived.carbs100;
      const fat = derived.fat100;
      const harmValue = HEYS.models?.normalizeHarm?.(product) ?? product.harm ?? product.harmScore ?? product.harmscore ?? product.harm100 ?? 0;
      const safeHarm = Number.isFinite(Number(harmValue)) ? harmValue : 0;
      const sharedUpdatedAt = toTs(product?.shared_updated_at ?? product?.sharedUpdatedAt);
      const clonedAt = toTs(product?.cloned_at ?? product?.clonedAt);
      const sharedMatch = sharedNameMap?.get(normalizeProductName(product?.name || '')) || null;
      const resolvedSharedId = product?.shared_origin_id ?? product?.sharedOriginId ?? product?.shared_id ?? product?.sharedId ?? sharedMatch?.id;
      const isSharedClone = !!product?.shared_origin_id;
      const hasSharedUpdate = mode === 'personal' && isSharedClone && !product?.user_modified && sharedUpdatedAt > clonedAt;

      // [baza] диагностика рендера — отключена (v5.0.1, была спам в консоли)

      const copyProductParams = async () => {
        const portionsValue = Array.isArray(product?.portions)
          ? (product.portions.length ? JSON.stringify(product.portions) : '—')
          : formatTableValue(product?.portions);

        const rows = [
          ['Название', product?.name],
          ['Ккал', kcal],
          ['Углеводы', carbs],
          ['Простые', product?.simple100],
          ['Сложные', product?.complex100],
          ['Белки', product?.protein100],
          ['Жиры', fat],
          ['Вредные жиры', product?.badFat100 ?? product?.badfat100],
          ['Полезные жиры', product?.goodFat100 ?? product?.goodfat100],
          ['Транс-жиры', product?.trans100],
          ['Клетчатка', product?.fiber100],
          ['ГИ', product?.gi],
          ['Вредность', safeHarm],
          ['Na', product?.sodium100],
          ['Ω3', product?.omega3_100],
          ['Ω6', product?.omega6_100],
          ['NOVA', product?.nova_group ?? product?.novaGroup],
          ['Добавки', formatTableList(product?.additives)],
          ['ND', product?.nutrient_density ?? product?.nutrientDensity],
          ['Органик', formatTableBool(product?.is_organic ?? product?.isOrganic)],
          ['Цельнозерновой', formatTableBool(product?.is_whole_grain ?? product?.isWholeGrain)],
          ['Ферментированный', formatTableBool(product?.is_fermented ?? product?.isFermented)],
          ['Сырой', formatTableBool(product?.is_raw ?? product?.isRaw)],
          ['Витамин A', product?.vitamin_a ?? product?.vitaminA],
          ['Витамин C', product?.vitamin_c ?? product?.vitaminC],
          ['Витамин D', product?.vitamin_d ?? product?.vitaminD],
          ['Витамин E', product?.vitamin_e ?? product?.vitaminE],
          ['Витамин K', product?.vitamin_k ?? product?.vitaminK],
          ['Витамин B1', product?.vitamin_b1 ?? product?.vitaminB1],
          ['Витамин B2', product?.vitamin_b2 ?? product?.vitaminB2],
          ['Витамин B3', product?.vitamin_b3 ?? product?.vitaminB3],
          ['Витамин B6', product?.vitamin_b6 ?? product?.vitaminB6],
          ['Витамин B9', product?.vitamin_b9 ?? product?.vitaminB9],
          ['Витамин B12', product?.vitamin_b12 ?? product?.vitaminB12],
          ['Кальций', product?.calcium],
          ['Железо', product?.iron],
          ['Магний', product?.magnesium],
          ['Фосфор', product?.phosphorus],
          ['Калий', product?.potassium],
          ['Цинк', product?.zinc],
          ['Селен', product?.selenium],
          ['Йод', product?.iodine],
          ['Порции', portionsValue]
        ];

        const text = rows
          .map(([label, value]) => `${label}: ${formatTableValue(value)}`)
          .join('\n');

        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          }
          HEYS.Toast?.success('Параметры скопированы') || alert('Параметры скопированы');
        } catch (err) {
          HEYS.Toast?.error('Не удалось скопировать') || alert('Не удалось скопировать');
        }
      };

      const renderInput = (value, onChange, isReadOnly = false) => (
        React.createElement('input', {
          className: isReadOnly ? 'readOnly' : undefined,
          type: 'text',
          value: value,
          readOnly: isReadOnly,
          onChange: isReadOnly ? undefined : onChange
        })
      );

      const rowKey = product?.id != null
        ? String(product.id)
        : `${mode || 'table'}_${String(product?.name || 'row')}_${idx}`;

      return React.createElement('tr', { key: rowKey },
        React.createElement('td', null,
          readOnly
            ? React.createElement('div', { className: 'product-name-cell' },
              React.createElement('span', { className: 'product-name-text' }, product.name),
              React.createElement('button', {
                className: 'btn product-copy-btn',
                onClick: copyProductParams,
                title: 'Скопировать параметры',
                'aria-label': 'Скопировать параметры'
              }, '📋'),
              product.is_mine && React.createElement('span', {
                className: 'product-owner-badge'
              }, 'Вы')
            )
            : React.createElement('div', { className: 'product-name-cell' },
              React.createElement('button', {
                className: 'product-name-edit',
                onClick: () => onOpenNameEditor?.(product),
                title: 'Переименовать',
                'aria-label': 'Переименовать'
              }, '✏️'),
              React.createElement('button', {
                className: 'btn product-copy-btn',
                onClick: copyProductParams,
                title: 'Скопировать параметры',
                'aria-label': 'Скопировать параметры'
              }, '📋'),
              React.createElement('span', { className: 'product-name-text' }, product.name),
              hasSharedUpdate && React.createElement('span', {
                className: 'product-name-cell__badge',
                title: 'В общей базе есть обновление'
              }, '🔄')
            )
        ),
        React.createElement('td', null, renderInput(kcal, null, true)),
        React.createElement('td', null, renderInput(carbs, null, true)),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.simple100), null, true)
          : renderInput(product.simple100, e => onUpdateRow?.(product.id, { simple100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.complex100), null, true)
          : renderInput(product.complex100, e => onUpdateRow?.(product.id, { complex100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.protein100), null, true)
          : renderInput(product.protein100, e => onUpdateRow?.(product.id, { protein100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, renderInput(fat, null, true)),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.badFat100 ?? product.badfat100), null, true)
          : renderInput(product.badFat100, e => onUpdateRow?.(product.id, { badFat100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.goodFat100 ?? product.goodfat100), null, true)
          : renderInput(product.goodFat100, e => onUpdateRow?.(product.id, { goodFat100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.trans100), null, true)
          : renderInput(product.trans100, e => onUpdateRow?.(product.id, { trans100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.fiber100), null, true)
          : renderInput(product.fiber100, e => onUpdateRow?.(product.id, { fiber100: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeNum(product.gi), null, true)
          : renderInput(product.gi, e => onUpdateRow?.(product.id, { gi: toNum(e.target.value) }))
        ),
        React.createElement('td', null, readOnly
          ? renderInput(safeHarm, null, true)
          : renderInput(HEYS.models?.normalizeHarm?.(product) ?? product.harm ?? product.harmScore ?? product.harmscore ?? product.harm100 ?? 0, e => onUpdateRow?.(product.id, { harm: toNum(e.target.value) }))
        ),
        React.createElement('td', null, renderInput(formatTableValue(product.sodium100), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.omega3_100), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.omega6_100), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.nova_group ?? product.novaGroup), null, true)),
        React.createElement('td', null, renderInput(formatTableList(product.additives), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.nutrient_density ?? product.nutrientDensity), null, true)),
        React.createElement('td', null, renderInput(formatTableBool(product.is_organic ?? product.isOrganic), null, true)),
        React.createElement('td', null, renderInput(formatTableBool(product.is_whole_grain ?? product.isWholeGrain), null, true)),
        React.createElement('td', null, renderInput(formatTableBool(product.is_fermented ?? product.isFermented), null, true)),
        React.createElement('td', null, renderInput(formatTableBool(product.is_raw ?? product.isRaw), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_a ?? product.vitaminA), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_c ?? product.vitaminC), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_d ?? product.vitaminD), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_e ?? product.vitaminE), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_k ?? product.vitaminK), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_b1 ?? product.vitaminB1), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_b2 ?? product.vitaminB2), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_b3 ?? product.vitaminB3), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_b6 ?? product.vitaminB6), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_b9 ?? product.vitaminB9), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.vitamin_b12 ?? product.vitaminB12), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.calcium), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.iron), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.magnesium), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.phosphorus), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.potassium), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.zinc), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.selenium), null, true)),
        React.createElement('td', null, renderInput(formatTableValue(product.iodine), null, true)),
        React.createElement('td', null,
          readOnly
            ? ((canCurate || product.is_mine)
              ? React.createElement('button', {
                className: 'btn',
                onClick: () => onOpenSharedPortionsEditor?.(product),
                title: 'Редактировать порции'
              }, `🥣 ${Array.isArray(product.portions) ? product.portions.length : 0}`)
              : React.createElement('span', null, `🥣 ${Array.isArray(product.portions) ? product.portions.length : 0}`))
            : React.createElement('button', {
              className: 'btn',
              onClick: () => onOpenPortionsEditor?.(product),
              title: 'Редактировать порции'
            }, `🥣 ${Array.isArray(product.portions) ? product.portions.length : 0}`)
        ),
        React.createElement('td', null,
          readOnly
            ? React.createElement('div', { className: 'product-actions' },
              React.createElement('button', {
                className: 'btn acc product-action-btn',
                onClick: () => onCloneShared?.(product),
                title: 'Добавить в мою базу'
              }, '➕'),
              !product.is_mine && React.createElement('button', {
                className: 'btn product-action-btn product-action-btn--ghost',
                onClick: () => onHideShared?.(product.id),
                title: 'Скрыть для меня'
              }, '🚫'),
              (canCurate || product.is_mine) && React.createElement('button', {
                className: 'btn product-action-btn product-action-btn--danger',
                onClick: () => onDeleteShared?.(product.id, product.name),
                title: 'Удалить из общей базы'
              }, '🗑️')
            )
            : React.createElement('div', { className: 'product-actions' },
              resolvedSharedId && React.createElement('button', {
                className: 'btn product-action-btn product-action-btn--sync',
                onClick: () => onSyncToShared?.(product),
                title: 'Обновить в общей базе'
              }, '🔄'),
              React.createElement('button', { className: 'btn product-action-btn', onClick: () => onDeleteRow?.(product.id) }, 'Удалить')
            )
        )
      );
    };

    // 📡 Helper: уведомляем UI о смене pending-очереди (бейдж, другие табы, etc).
    // Same-tab event + cross-tab BroadcastChannel (если поддерживается).
    function notifyPendingUpdated() {
      try {
        window.dispatchEvent(new CustomEvent('heys:pending-products-updated'));
      } catch (_) { /* noop */ }
      try {
        const bc = new BroadcastChannel('heys_pending_products');
        bc.postMessage({ type: 'pending-updated', at: Date.now() });
        setTimeout(() => { try { bc.close(); } catch (_) { /* noop */ } }, 200);
      } catch (_) { /* BroadcastChannel может отсутствовать */ }
    }

    // Одобрить pending заявку
    async function approvePending(pending) {
      try {
        // Передаём и pendingId и productData
        const result = await window.HEYS?.cloud?.approvePendingProduct?.(pending.id, pending.product_data);
        // 🛡 Race: заявка уже обработана другим куратором
        if (result?.status === 'race') {
          HEYS.Toast?.warning(result.message || 'Заявка уже обработана другим куратором') || alert(result.message || 'Заявка уже обработана');
          setPendingProducts(prev => prev.filter(p => p.id !== pending.id));
          notifyPendingUpdated();
          return;
        }
        if (result?.error) {
          const msg = result.error?.message || (typeof result.error === 'string' ? result.error : 'неизвестная ошибка');
          HEYS.Toast?.error('Ошибка: ' + msg) || alert('Ошибка: ' + msg);
          return;
        }
        // Обновляем список
        setPendingProducts(prev => prev.filter(p => p.id !== pending.id));
        if (result.existing) {
          HEYS.Toast?.info(`Продукт "${pending.product_data?.name || pending.name_norm}" уже существует в общей базе`) || alert(`ℹ️ Продукт "${pending.product_data?.name || pending.name_norm}" уже существует в общей базе`);
        } else {
          HEYS.Toast?.success(`Продукт "${pending.product_data?.name || pending.name_norm}" добавлен в общую базу!`) || alert(`✅ Продукт "${pending.product_data?.name || pending.name_norm}" добавлен в общую базу!`);
        }
        notifyPendingUpdated();
      } catch (err) {
        console.error('[APPROVE] Error:', err);
        HEYS.Toast?.error('Ошибка при подтверждении: ' + err.message) || alert('Ошибка при подтверждении: ' + err.message);
      }
    }

    // Отклонить pending заявку
    async function rejectPending(pending, reason = '') {
      try {
        const result = await window.HEYS?.cloud?.rejectPendingProduct?.(pending.id, reason);
        // 🛡 Race
        if (result?.status === 'race') {
          HEYS.Toast?.warning(result.message || 'Заявка уже обработана другим куратором') || alert(result.message || 'Заявка уже обработана');
          setPendingProducts(prev => prev.filter(p => p.id !== pending.id));
          notifyPendingUpdated();
          return;
        }
        if (result?.error) {
          const msg = result.error?.message || (typeof result.error === 'string' ? result.error : 'неизвестная ошибка');
          HEYS.Toast?.error('Ошибка: ' + msg) || alert('Ошибка: ' + msg);
          return;
        }
        // Обновляем список
        setPendingProducts(prev => prev.filter(p => p.id !== pending.id));
        HEYS.Toast?.info(`Заявка "${pending.product_data?.name || pending.name_norm}" отклонена`) || alert(`❌ Заявка "${pending.product_data?.name || pending.name_norm}" отклонена`);
        notifyPendingUpdated();
      } catch (err) {
        console.error('[REJECT] Error:', err);
        HEYS.Toast?.error('Ошибка при отклонении: ' + err.message) || alert('Ошибка при отклонении: ' + err.message);
      }
    }

    const getCloneName = (baseName, list) => {
      const safeBase = (baseName || '').trim() || 'Без названия';
      const normalizeName = (name) => (name || '').toLowerCase().trim();
      const hasName = (name) => list.some(p => normalizeName(p?.name) === normalizeName(name));

      if (!hasName(safeBase)) return safeBase;

      let candidate = `${safeBase} (копия)`;
      if (!hasName(candidate)) return candidate;

      let i = 2;
      while (hasName(`${safeBase} (копия ${i})`)) i += 1;
      return `${safeBase} (копия ${i})`;
    };

    const clonePortions = (portions) => {
      if (!Array.isArray(portions)) return portions ?? null;
      return portions.map((p) => ({ ...p }));
    };

    // Клонировать shared продукт в личную базу
    function cloneSharedProduct(sharedProduct) {
      // Проверяем, нет ли уже клона этого продукта
      const existingClone = products.find(p => p.shared_origin_id === sharedProduct.id);
      if (existingClone) {
        HEYS.Toast?.warning(`Продукт "${sharedProduct.name}" уже есть в вашей базе!`) || alert(`⚠️ Продукт "${sharedProduct.name}" уже есть в вашей базе!`);
        return existingClone;
      }

      const cloneName = getCloneName(sharedProduct.name, products);

      // Создаём клон
      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(sharedProduct);
      const clone = {
        id: uuid(),
        name: cloneName,
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
        portions: clonePortions(sharedProduct.portions),
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
      console.info('[baza] 🔵 cloneSharedProduct: было', products.length, '→ стало', newProducts.length, '| id:', withDerived.id, '| имя:', cloneName);
      // Сохраняем в localStorage СИНХРОННО до setProducts (защита от race с handleProductsUpdated)
      try {
        if (window.HEYS?.store?.set) {
          window.HEYS.store.set('heys_products', newProducts);
          console.info('[baza] 🔵 cloneSharedProduct: localStorage сохранён синхронно');
        }
      } catch (_) { }
      setProducts(newProducts);
      // Post-check
      setTimeout(() => {
        try {
          const ls = window.HEYS?.store?.get?.('heys_products') || [];
          const found = ls.find(p => p.id === withDerived.id);
          console.info('[baza] 🔵 cloneSharedProduct POST-CHECK (50ms): ls.length=', ls.length, '| найден:', !!found);
          if (!found) console.error('[baza] 🔵 ❌ КРИТИЧНО: клон НЕ сохранился в localStorage!');
        } catch (_) { }
      }, 50);

      HEYS.Toast?.success(`Продукт "${cloneName}" добавлен в вашу базу!`) || alert(`✅ Продукт "${cloneName}" добавлен в вашу базу!`);
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

      const cloneName = getCloneName(sharedProduct.name, products);

      // Создаём новый клон с shared_origin_id
      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(sharedProduct);
      const clone = {
        id: uuid(),
        name: cloneName,
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
        portions: clonePortions(sharedProduct.portions),
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

      // Добавляем в products (cloneSharedToPersonal)
      console.info('[baza] 🔵 cloneSharedToPersonal: id:', newProduct.id, '| имя:', newProduct.name);
      setProducts(prev => {
        const newList = [...prev, newProduct];
        // Сохраняем в localStorage СИНХРОННО (защита от race)
        try {
          if (window.HEYS?.store?.set) {
            window.HEYS.store.set('heys_products', newList);
            console.info('[baza] 🔵 cloneSharedToPersonal: localStorage синхронно, count:', newList.length);
          }
        } catch (_) { }
        return newList;
      });

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
      console.info('[baza] 🟡 handleMergeCreateOwn: добавление в личную, id:', draftProduct.id, '| имя:', draftProduct.name);
      setProducts(prev => {
        const newList = [...prev, draftProduct];
        // Сохраняем в localStorage СИНХРОННО (защита от race)
        try {
          if (window.HEYS?.store?.set) {
            window.HEYS.store.set('heys_products', newList);
            console.info('[baza] 🟡 handleMergeCreateOwn: localStorage синхронно, count:', newList.length);
          }
        } catch (_) { }
        return newList;
      });

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
            onClick: () => {
              if (activeSubtab !== 'personal') setActiveSubtab('personal');
            },
            style: { flex: 1, borderRadius: '6px' }
          }, isCurator ? '👤 Личные' : '👤 Мои продукты'),
          // 🌐 Общая база (только для куратора)
          isCurator && React.createElement('button', {
            className: activeSubtab === 'shared' ? 'btn acc' : 'btn',
            onClick: () => {
              if (activeSubtab !== 'shared') setActiveSubtab('shared');
            },
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
      React.createElement('div', {
        key: `ration-subtab-${activeSubtab}`,
        className: 'ration-subtab-content'
      }, activeSubtab === 'personal' ? (
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

          // === ТАБЛИЦА ПРОДУКТОВ (Personal) ===
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
            renderRangeButtons(personalRanges, personalRangeStart, (start) => {
              setPersonalRangeStart(start);
              setPersonalRangeActive(true);
            }, personalRangeActive),
            // 📊 Unified Table Component
            React.createElement(UnifiedProductTable, {
              mode: 'personal',
              data: personalRangeActive
                ? filtered.slice(personalRangeStart, getRangeEnd(personalRangeStart, filtered.length))
                : filtered.slice(0, DEFAULT_DISPLAY_LIMIT),
              loading: false,
              callbacks: {
                onUpdateRow: updateRow,
                onOpenNameEditor: openProductNameEditor,
                onOpenPortionsEditor: openPortionsEditor,
                onDeleteRow: deleteRow,
                onSyncToShared: syncProductToShared,
                sharedNameMap: (() => {
                  const normalizeProductName = HEYS.models?.normalizeProductName
                    || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
                  const map = new Map();
                  const cached = window.HEYS?.cloud?.getCachedSharedProducts?.() || [];
                  const source = Array.isArray(allSharedProducts) && allSharedProducts.length ? allSharedProducts : cached;
                  source.forEach((sp) => {
                    if (sp?.name && sp?.id != null) {
                      map.set(normalizeProductName(sp.name), sp);
                    }
                  });
                  return map;
                })()
              }
            }),
            React.createElement('div', { className: 'muted', style: { marginTop: '8px' } }, 'Серые поля — авто: У=простые+сложные; Ж=вредные+полезные+супервредные; Ккал=3×Б+4×У+9×Ж (TEF-aware).')
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
                          React.createElement('span', null, `${Math.round(getDerivedKcal(p))} ккал`),
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
          // === ТАБЛИЦА ПРОДУКТОВ (Shared) ===
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
                  allSharedLoading ? '⏳ Загрузка...' : `Найдено: ${filteredShared.length} из ${allSharedProducts.length}`
                )
              ),
              React.createElement('button', {
                className: 'btn acc',
                onClick: () => loadAllSharedProducts({ force: true }),
                style: { marginLeft: '8px' }
              }, '🔄 Обновить')
            ),
            renderRangeButtons(sharedRanges, sharedRangeStart, (start) => {
              setSharedRangeStart(start);
              setSharedRangeActive(true);
            }, sharedRangeActive),
            // 📊 Unified Table Component
            React.createElement(UnifiedProductTable, {
              mode: 'shared',
              data: sharedRangeActive
                ? filteredShared.slice(sharedRangeStart, getRangeEnd(sharedRangeStart, filteredShared.length))
                : filteredShared.slice(0, DEFAULT_DISPLAY_LIMIT),
              loading: allSharedLoading,
              callbacks: {
                isCurator,
                onCloneShared: cloneSharedProduct,
                onHideShared: hideSharedProduct,
                onDeleteShared: deleteSharedProduct,
                onOpenSharedPortionsEditor: openSharedPortionsEditor
              }
            })
          )
        )
      )),
      showModal && React.createElement('div', { className: 'modal-backdrop', onClick: (e) => { if (e.target.classList.contains('modal-backdrop')) setShowModal(false); } },
        React.createElement('div', { className: 'modal' },
          React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
            React.createElement('div', null, 'Новый продукт'),
            React.createElement('button', { className: 'btn', onClick: () => setShowModal(false) }, '×')
          ),
          React.createElement('div', { className: 'grid grid-2', style: { marginTop: '8px' } },
            React.createElement('div', null, React.createElement('label', null, 'Название'), React.createElement('input', { value: draft.name, onChange: e => setDraft({ ...draft, name: e.target.value }) })),
            React.createElement('div', null, React.createElement('label', null, 'Категория'), React.createElement('input', { value: draft.category, onChange: e => setDraft({ ...draft, category: e.target.value }) })),
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
          React.createElement('div', { className: 'row' },
            React.createElement('button', {
              className: 'btn',
              onClick: () => setExpandedSections({ ...expandedSections, extra: !expandedSections.extra })
            }, `${expandedSections.extra ? '▼' : '▶'} Доп. нутриенты`)
          ),
          expandedSections.extra && React.createElement('div', { className: 'grid grid-2' },
            React.createElement('div', null, React.createElement('label', null, 'Натрий (мг/100г)'), React.createElement('input', { type: 'text', value: draft.sodium100, onChange: e => setDraft({ ...draft, sodium100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Холестерин (мг/100г)'), React.createElement('input', { type: 'text', value: draft.cholesterol100, onChange: e => setDraft({ ...draft, cholesterol100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Добавленный сахар (г/100г)'), React.createElement('input', { type: 'text', value: draft.sugar100, onChange: e => setDraft({ ...draft, sugar100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Омега-3 (г/100г)'), React.createElement('input', { type: 'text', value: draft.omega3_100, onChange: e => setDraft({ ...draft, omega3_100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Омега-6 (г/100г)'), React.createElement('input', { type: 'text', value: draft.omega6_100, onChange: e => setDraft({ ...draft, omega6_100: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Заметка по вредности'), React.createElement('input', { value: draft.harmNote, onChange: e => setDraft({ ...draft, harmNote: e.target.value }) }))
          ),
          React.createElement('div', { className: 'row' },
            React.createElement('button', {
              className: 'btn',
              onClick: () => setExpandedSections({ ...expandedSections, vitamins: !expandedSections.vitamins })
            }, `${expandedSections.vitamins ? '▼' : '▶'} Витамины (% от нормы)`)
          ),
          expandedSections.vitamins && React.createElement('div', { className: 'grid grid-2' },
            React.createElement('div', null, React.createElement('label', null, 'Витамин A'), React.createElement('input', { type: 'text', value: draft.vitaminA, onChange: e => setDraft({ ...draft, vitaminA: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин C'), React.createElement('input', { type: 'text', value: draft.vitaminC, onChange: e => setDraft({ ...draft, vitaminC: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин D'), React.createElement('input', { type: 'text', value: draft.vitaminD, onChange: e => setDraft({ ...draft, vitaminD: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин E'), React.createElement('input', { type: 'text', value: draft.vitaminE, onChange: e => setDraft({ ...draft, vitaminE: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин K'), React.createElement('input', { type: 'text', value: draft.vitaminK, onChange: e => setDraft({ ...draft, vitaminK: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин B1'), React.createElement('input', { type: 'text', value: draft.vitaminB1, onChange: e => setDraft({ ...draft, vitaminB1: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин B2'), React.createElement('input', { type: 'text', value: draft.vitaminB2, onChange: e => setDraft({ ...draft, vitaminB2: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин B3'), React.createElement('input', { type: 'text', value: draft.vitaminB3, onChange: e => setDraft({ ...draft, vitaminB3: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин B6'), React.createElement('input', { type: 'text', value: draft.vitaminB6, onChange: e => setDraft({ ...draft, vitaminB6: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин B9'), React.createElement('input', { type: 'text', value: draft.vitaminB9, onChange: e => setDraft({ ...draft, vitaminB9: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Витамин B12'), React.createElement('input', { type: 'text', value: draft.vitaminB12, onChange: e => setDraft({ ...draft, vitaminB12: toNum(e.target.value) }) }))
          ),
          React.createElement('div', { className: 'row' },
            React.createElement('button', {
              className: 'btn',
              onClick: () => setExpandedSections({ ...expandedSections, minerals: !expandedSections.minerals })
            }, `${expandedSections.minerals ? '▼' : '▶'} Минералы (% от нормы)`)
          ),
          expandedSections.minerals && React.createElement('div', { className: 'grid grid-2' },
            React.createElement('div', null, React.createElement('label', null, 'Кальций'), React.createElement('input', { type: 'text', value: draft.calcium, onChange: e => setDraft({ ...draft, calcium: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Железо'), React.createElement('input', { type: 'text', value: draft.iron, onChange: e => setDraft({ ...draft, iron: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Магний'), React.createElement('input', { type: 'text', value: draft.magnesium, onChange: e => setDraft({ ...draft, magnesium: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Фосфор'), React.createElement('input', { type: 'text', value: draft.phosphorus, onChange: e => setDraft({ ...draft, phosphorus: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Калий'), React.createElement('input', { type: 'text', value: draft.potassium, onChange: e => setDraft({ ...draft, potassium: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Цинк'), React.createElement('input', { type: 'text', value: draft.zinc, onChange: e => setDraft({ ...draft, zinc: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Селен'), React.createElement('input', { type: 'text', value: draft.selenium, onChange: e => setDraft({ ...draft, selenium: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Йод'), React.createElement('input', { type: 'text', value: draft.iodine, onChange: e => setDraft({ ...draft, iodine: toNum(e.target.value) }) }))
          ),
          React.createElement('div', { className: 'row' },
            React.createElement('button', {
              className: 'btn',
              onClick: () => setExpandedSections({ ...expandedSections, nova: !expandedSections.nova })
            }, `${expandedSections.nova ? '▼' : '▶'} NOVA и добавки`)
          ),
          expandedSections.nova && React.createElement('div', { className: 'grid grid-2' },
            React.createElement('div', null, React.createElement('label', null, 'NOVA группа (1–4)'), React.createElement('input', { type: 'text', value: draft.novaGroup, onChange: e => setDraft({ ...draft, novaGroup: toNum(e.target.value) }) })),
            React.createElement('div', null, React.createElement('label', null, 'Добавки (E-коды, через запятую)'), React.createElement('input', { value: draft.additives, onChange: e => setDraft({ ...draft, additives: e.target.value }) }))
          ),
          React.createElement('div', { className: 'row' },
            React.createElement('button', {
              className: 'btn',
              onClick: () => setExpandedSections({ ...expandedSections, flags: !expandedSections.flags })
            }, `${expandedSections.flags ? '▼' : '▶'} Флаги качества`)
          ),
          expandedSections.flags && React.createElement('div', { className: 'grid grid-2' },
            React.createElement('label', null,
              React.createElement('input', { type: 'checkbox', checked: !!draft.isOrganic, onChange: e => setDraft({ ...draft, isOrganic: e.target.checked }) }),
              ' Органический'
            ),
            React.createElement('label', null,
              React.createElement('input', { type: 'checkbox', checked: !!draft.isWholeGrain, onChange: e => setDraft({ ...draft, isWholeGrain: e.target.checked }) }),
              ' Цельнозерновой'
            ),
            React.createElement('label', null,
              React.createElement('input', { type: 'checkbox', checked: !!draft.isFermented, onChange: e => setDraft({ ...draft, isFermented: e.target.checked }) }),
              ' Ферментированный'
            ),
            React.createElement('label', null,
              React.createElement('input', { type: 'checkbox', checked: !!draft.isRaw, onChange: e => setDraft({ ...draft, isRaw: e.target.checked }) }),
              ' Сырой'
            )
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
              `${Math.round(getDerivedKcal(mergeModal.existing))} ккал | ` +
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
    // Reparse emoji if twemoji selected (single debounced pass)
    if (style === 'twemoji') {
      const target = document.getElementById('root') || document.body;
      if (window.scheduleTwemojiParse) {
        window.scheduleTwemojiParse(target);
      } else if (window.applyTwemoji) {
        window.applyTwemoji(target);
      }
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
  const productsLogState = { lastGetAll: 0, lastSetAll: 0, lastPipe: 0, lastSearch: 0 };
  const shouldLogProducts = (type) => {
    // 🔇 v4.8.2: Отключено по умолчанию — включить через HEYS.debug.products = true
    const debugEnabled = !!(HEYS && HEYS.debug && HEYS.debug.products);
    if (!debugEnabled) return false; // Полностью отключено если debug не включен
    const now = Date.now();
    const minInterval = 3000;
    const key = type === 'setAll' ? 'lastSetAll' : 'lastGetAll';
    if (now - productsLogState[key] < minInterval) return false;
    productsLogState[key] = now;
    return true;
  };

  // 🪵 TEMP: лог количества продуктов на каждом setAll/getAll/merge/cloud-write.
  // Снять, когда выясним, почему количество откатывается.
  HEYS._productsTraceLastLen = HEYS._productsTraceLastLen ?? null;

  // 🛟 Self-heal helper (shared by getAll и setAll anti-shrink reader).
  // Распаковывает сжатые/обёрнутые строки: '¤Z¤...' и '"¤Z¤..."' (JSON-обёрнутая).
  const tryDecompressToArray = (raw) => {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      let candidate = raw;
      if (candidate.startsWith('"') && candidate.endsWith('"')) {
        try { candidate = JSON.parse(candidate); } catch (_) { /* noop */ }
      }
      if (typeof candidate === 'string' && candidate.startsWith('¤Z¤') && HEYS.store?.decompress) {
        const decompressed = HEYS.store.decompress(candidate);
        if (Array.isArray(decompressed)) return decompressed;
      }
    } catch (_) { /* noop */ }
    return null;
  };

  HEYS.products = HEYS.products || {
    getAll: () => {
      const fromStore = (HEYS.store && HEYS.store.get && HEYS.store.get('heys_products', [])) || [];
      const fromUtils = (HEYS.utils && HEYS.utils.lsGet && HEYS.utils.lsGet('heys_products', [])) || [];
      let result = fromStore.length > 0 ? fromStore : fromUtils;

      if (!Array.isArray(result)) {
        const recovered = tryDecompressToArray(typeof result === 'string' ? result : null)
          || tryDecompressToArray(typeof fromStore === 'string' ? fromStore : null)
          || tryDecompressToArray(typeof fromUtils === 'string' ? fromUtils : null);
        if (Array.isArray(recovered) && recovered.length > 0) {
          console.info('[HEYS.products] getAll self-heal', { len: recovered.length });
          if (HEYS.store?.set) HEYS.store.set('heys_products', recovered);
          else if (HEYS.utils?.lsSet) HEYS.utils.lsSet('heys_products', recovered);
          result = recovered;
        }
      }

      // Fallback: if result is suspiciously small, try other clientId namespaces
      if (Array.isArray(result) && result.length <= 1) {
        try {
          const parseRaw = (raw) => {
            if (!raw) return null;
            if (typeof raw === 'object') return raw;
            if (typeof raw !== 'string') return null;
            if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
              return HEYS.store.decompress(raw);
            }
            try { return JSON.parse(raw); } catch { return null; }
          };

          const keys = Object.keys(localStorage).filter((key) => /^heys_[^_]+_products$/i.test(key));
          let best = null;
          let bestLen = 0;
          for (const key of keys) {
            const candidate = parseRaw(localStorage.getItem(key));
            const len = Array.isArray(candidate) ? candidate.length : 0;
            if (len > bestLen) {
              bestLen = len;
              best = candidate;
            }
          }

          if (best && bestLen > result.length) {
            if (HEYS.store?.set) {
              HEYS.store.set('heys_products', best);
            } else if (HEYS.utils?.lsSet) {
              HEYS.utils.lsSet('heys_products', best);
            }
            result = best;
          }
        } catch (e) { }
      }
      // 🔍 DEBUG: Логируем откуда берутся продукты
      if (shouldLogProducts('getAll')) {
        console.log('[PRODUCTS.getAll] fromStore:', fromStore.length, 'fromUtils:', fromUtils.length, 'result:', result.length);
      }
      // Постоянная диагностика проблем с загрузкой каталога (throttled)
      try {
        const now = Date.now();
        const shouldPipeLog = (now - (productsLogState.lastPipe || 0)) > 7000;
        const suspiciousSmall = !Array.isArray(result) || result.length < 25;
        if (shouldPipeLog && suspiciousSmall) {
          productsLogState.lastPipe = now;
          const sharedLen = HEYS?.cloud?.getCachedSharedProducts?.()?.length || 0;
          const sample = Array.isArray(result) ? result.slice(0, 3).map((p) => p?.name || '(no-name)') : [];
          console.warn('[HEYS.products:PIPE] small personal catalog', {
            fromStore: Array.isArray(fromStore) ? fromStore.length : -1,
            fromUtils: Array.isArray(fromUtils) ? fromUtils.length : -1,
            resultLen: Array.isArray(result) ? result.length : -1,
            sharedLen,
            currentClientId: HEYS?.currentClientId || null,
            sample,
          });
        }
      } catch (_) { /* noop */ }
      // 🛡️ Safety: always return array (guards against corrupted storage values)
      if (!Array.isArray(result)) {
        try {
          const sig = `${typeof result}:${result?.constructor?.name}:${typeof fromStore}/${typeof fromUtils}`;
          if (HEYS._productsTraceLastNonArraySig !== sig) {
            HEYS._productsTraceLastNonArraySig = sig;
            console.warn('[HEYS.products] getAll non-array', {
              type: typeof result,
              ctor: result?.constructor?.name,
              fromStoreType: typeof fromStore,
              fromUtilsType: typeof fromUtils,
              fromStoreLen: Array.isArray(fromStore) ? fromStore.length : -1,
              fromUtilsLen: Array.isArray(fromUtils) ? fromUtils.length : -1,
              sample: typeof result === 'string' ? result.slice(0, 30) : null,
            });
          }
        } catch (_) { /* noop */ }
        HEYS._productsTraceLastLen = 0;
        return [];
      }
      try {
        // Update tracker silently; verbose getAll logging removed for prod.
        if (HEYS._productsTraceLastLen !== result.length) {
          HEYS._productsTraceLastLen = result.length;
        }
      } catch (_) { /* noop */ }
      return result;
    },
    /** Личная база: поиск по id (в т.ч. для dayv2 / orphan — shared id здесь не ищем) */
    getById: (id) => {
      if (id == null || id === '') return null;
      const sid = String(id);
      const all = HEYS.products.getAll?.() || [];
      return all.find((p) => String(p?.id ?? p?.product_id ?? '') === sid) || null;
    },
    setAll: (arr, opts = {}) => {
      const newLen = arr?.length || 0;
      const source = opts.source || 'unknown';

      // 🔍 DEBUG: Логируем portions-sync
      if (source === 'portions-sync') {
        console.log('[PRODUCTS.setAll] portions-sync call', {
          newLen,
          firstProductPortions: arr?.[0]?.portions,
          hasStore: !!HEYS.store?.set,
          hasUtils: !!HEYS.utils?.lsSet
        });
      }

      // 🛡️ ЗАЩИТА: Не перезаписываем большее количество меньшим без явного разрешения
      // Это предотвращает race condition когда sync перезаписывает восстановленные продукты
      // ВАЖНО: Проверяем ОБА источника — store (memory) И localStorage напрямую!
      // Memory cache может быть устаревшим если sync писал через ls.setItem
      // v4.8.2: allowShrink для cloud-sync с проверенным merge (удаление дубликатов)
      if (!opts.allowShrink) {
        // 1. Проверяем memory cache через getAll
        const fromGetAll = HEYS.products.getAll?.() || [];

        // 2. Проверяем localStorage НАПРЯМУЮ (может быть новее чем cache)
        // Ищем ВСЕ ключи с products чтобы найти максимум
        let fromLocalStorage = [];
        try {
          const clientId = HEYS.currentClientId || '';
          // Пробуем разные варианты ключей
          const keysToTry = [
            clientId ? `heys_${clientId}_products` : null,
            'heys_products',
          ].filter(Boolean);

          // Также ищем ключи вида heys_{clientId}_products (на случай если clientId другой)
          // 🔧 FIX v4.8.9: Используем точный regex вместо includes('_products'),
          // иначе heys_hidden_products (массив ID, 300 элементов) матчился и блокировал setAll
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && /^heys_[^_]+_products$/.test(key)) {
              keysToTry.push(key);
            }
          }

          // Проверяем все найденные ключи и берём максимум.
          // 🛟 Decompress-aware: если raw — JSON-обёрнутая или сырая '¤Z¤...' compressed string,
          // достаём настоящий массив через tryDecompressToArray (иначе anti-shrink думает что нет данных).
          for (const key of keysToTry) {
            try {
              const raw = localStorage.getItem(key);
              if (!raw) continue;
              let parsed = null;
              try { parsed = JSON.parse(raw); } catch (_) { /* not json */ }
              if (!Array.isArray(parsed)) {
                const recovered = tryDecompressToArray(raw);
                if (Array.isArray(recovered)) parsed = recovered;
              }
              if (Array.isArray(parsed) && parsed.length > fromLocalStorage.length) {
                fromLocalStorage = parsed;
              }
            } catch (e) { /* skip invalid */ }
          }
        } catch (e) { /* ignore */ }

        // Берём МАКСИМУМ из обоих источников.
        // CRITICAL: when overlay flag is ON, the canonical source IS overlay (which feeds getAll).
        // Legacy LS may be stale-but-larger (cloud retry, orphan-recovery write that
        // didn't make it through dual-write, etc). Trusting legacy LS would block legitimate
        // adds when the user's React state reads from overlay (smaller).
        const overlayOn = HEYS.flags && HEYS.flags.isEnabled && HEYS.flags.isEnabled('overlay_products_v2');
        const currentLen = overlayOn
          ? fromGetAll.length                                   // overlay-canonical: trust the read side
          : Math.max(fromGetAll.length, fromLocalStorage.length); // legacy: max of both

        if (currentLen > 0 && newLen < currentLen) {
          console.warn('[HEYS.products] setAll BLOCKED', {
            source: opts.source || 'unknown',
            was: currentLen,
            attemptedNow: newLen,
            fromGetAll: fromGetAll.length,
            fromLocalStorage: fromLocalStorage.length,
            stack: new Error().stack?.split('\n').slice(1, 5).map(s => s.trim()).join(' <- '),
          });
          return; // НЕ перезаписываем!
        }
      }

      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set('heys_products', arr);
        // 🔍 DEBUG: Проверяем что portions-sync записалось
        if (source === 'portions-sync') {
          const verify = HEYS.store.get?.('heys_products') || [];
          console.log('[PRODUCTS.setAll] portions-sync STORED', {
            storedLen: verify.length,
            samplePortions: verify.find(p => p?.portions?.length > 0)?.portions
          });
        }
      } else if (HEYS.utils && HEYS.utils.lsSet) {
        HEYS.utils.lsSet('heys_products', arr);
      }
      try {
        // Compact setAll log only when length changes meaningfully OR shrink path.
        const newLen = Array.isArray(arr) ? arr.length : -1;
        const prevLen = HEYS._productsTraceLastLen;
        if (newLen !== prevLen) {
          const withIron = Array.isArray(arr) ? arr.filter((p) => p && +p.iron > 0).length : 0;
          console.info('[HEYS.products] setAll', { source, was: prevLen, now: newLen, withIron, allowShrink: !!opts.allowShrink });
        }
        HEYS._productsTraceLastLen = newLen >= 0 ? newLen : prevLen;
      } catch (_) { /* noop */ }

      // Phase β: dual-write moved to interceptSetItem for universal coverage
      // (catches self-heal, best-keyspace fallback, hot-sync, and any future
      // direct legacy writers, not just setAll). See heys_storage_supabase_v1.js.

      // 🛡️ FIX: dual-write user-добавленных продуктов в overlay v2.
      // setAll пишет только в legacy `heys_products`, но overlay v2 — это canonical
      // source для cloud-sync (он уезжает в `heys_products_overlay_v2` в БД и
      // читается для merged-view). Без явного upsert новые custom-продукты не
      // попадают в облачный overlay и не видны на других устройствах.
      try {
        const userActionSources = [
          'harm-select-add', 'harm-select-update',
          'button-restore-orphans',
          'manual-add', 'add-from-shared',
          'orphan-recovery'
        ];
        if (
          Array.isArray(arr) &&
          userActionSources.indexOf(source) >= 0 &&
          HEYS.OverlayStore &&
          typeof HEYS.OverlayStore.upsertRow === 'function' &&
          typeof HEYS.OverlayStore.readRaw === 'function'
        ) {
          const existing = HEYS.OverlayStore.readRaw() || [];
          const existingIds = new Set(existing.filter(r => r && r.id != null).map(r => String(r.id)));
          let added = 0;
          for (const p of arr) {
            if (!p || p.id == null) continue;
            if (existingIds.has(String(p.id))) continue;
            // Новый row для overlay: Type B (custom) если нет shared_origin_id, иначе Type A.
            const sid = p.shared_origin_id ? String(p.shared_origin_id) : null;
            if (sid) {
              HEYS.OverlayStore.upsertRow({
                id: p.id,
                shared_origin_id: sid,
                fingerprint: p.fingerprint || null,
                overrides: {},
                in_my_list: true,
                user_modified: !!p.user_modified,
              });
            } else {
              HEYS.OverlayStore.upsertRow(Object.assign({}, p, {
                _custom: true,
                in_my_list: true,
                user_modified: p.user_modified !== false,
              }));
            }
            added++;
          }
          if (added > 0) {
            console.info('[HEYS.products] setAll → overlay upsert', { source, added });
          }
        }
      } catch (e) {
        console.warn('[HEYS.products] overlay upsert from setAll failed (non-fatal):', e && e.message);
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

      // 🪦 FIX v4.9.1: Проверяем tombstones (heys_deleted_ids) по NAME перед клонированием.
      // Orphan recovery может вызвать addFromShared для удалённого продукта — он получит НОВЫЙ uuid,
      // и id-only tombstone filter его не поймает → resurrection. Проверка по имени блокирует это.
      try {
        const _tombstonesAdd = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
        if (Array.isArray(_tombstonesAdd) && _tombstonesAdd.length > 0 && sharedProduct.name) {
          const normName = (n) => String(n || '').toLowerCase().trim();
          const deletedNames = new Set(_tombstonesAdd.map(t => normName(t.name)).filter(Boolean));
          if (deletedNames.has(normName(sharedProduct.name))) {
            console.info('[PRODUCTS.addFromShared] 🪦 BLOCKED — продукт в tombstones:', sharedProduct.name);
            return null;
          }
        }
      } catch (e) { /* ignore tombstone check errors */ }

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
        // 🔧 FIX: Синхронизируем portions из shared если local пустой
        const localHasPortions = Array.isArray(next.portions) && next.portions.length > 0;
        const sharedHasPortions = Array.isArray(sharedProduct.portions) && sharedProduct.portions.length > 0;
        if (!localHasPortions && sharedHasPortions) {
          next.portions = sharedProduct.portions.map((p) => ({ ...p }));
          changed = true;
        }
        // 🔧 FIX: Добавляем вычисляемые поля (kcal100, carbs100, fat100) если их нет
        // Это исправляет баг когда продукт был добавлен ранее без калорий
        if (next.kcal100 == null || next.kcal100 === 0) {
          const derived = computeDerived(next);
          if (derived.kcal100 > 0) {
            next.kcal100 = derived.kcal100;
            next.carbs100 = derived.carbs100;
            next.fat100 = derived.fat100;
            changed = true;
          }
        }
        if (!changed) return existing;
        const newProducts = products.map(p => p.id === existing.id ? { ...p, ...next } : p);
        HEYS.products.setAll(newProducts, { source: 'shared-merge-missing' });
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

      const normalizeName = (name) => (name || '').toLowerCase().trim();
      const getCloneName = (baseName) => {
        const safeBase = (baseName || '').trim() || 'Без названия';
        const hasName = (name) => products.some(p => normalizeName(p?.name) === normalizeName(name));

        if (!hasName(safeBase)) return safeBase;

        let candidate = `${safeBase} (копия)`;
        if (!hasName(candidate)) return candidate;

        let i = 2;
        while (hasName(`${safeBase} (копия ${i})`)) i += 1;
        return `${safeBase} (копия ${i})`;
      };

      const clonePortions = (portions) => {
        if (!Array.isArray(portions)) return portions ?? null;
        return portions.map((p) => ({ ...p }));
      };

      // Создаём клон
      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(sharedProduct);
      const clone = {
        id: uuid(),
        name: getCloneName(sharedProduct.name),
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
        portions: clonePortions(sharedProduct.portions),
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
      HEYS.products.setAll(newProducts, { source: 'add-from-shared' });

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

      // 🛟 Score-based dedupe: при одинаковом нормализованном имени побеждает запись с большим
      // числом заполненных полей (нутриенты / порции / updatedAt). user_modified всегда побеждает.
      const NUTRIENT_FIELDS = [
        'kcal100', 'protein100', 'fat100', 'carbs100',
        'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100', 'fiber100',
        'iron', 'calcium', 'magnesium', 'phosphorus', 'potassium', 'sodium100',
        'vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK',
        'vitaminB1', 'vitaminB2', 'vitaminB3', 'vitaminB6', 'vitaminB9', 'vitaminB12',
        'gi', 'harm',
      ];
      const scoreProduct = (p) => {
        if (!p) return -1;
        if (p.user_modified) return 1e9;
        let s = 0;
        for (const f of NUTRIENT_FIELDS) {
          const v = Number(p[f]);
          if (Number.isFinite(v) && v !== 0) s++;
        }
        if (Array.isArray(p.portions) && p.portions.length > 0) s += 2;
        s += Math.min(1, (Number(p.updatedAt) || 0) / 1e16);
        return s;
      };

      const bestByKey = new Map(); // key → { product, idx } — idx сохраняет исходный порядок
      products.forEach((p, idx) => {
        const key = (p?.name || '').trim().toLowerCase();
        if (!key) return; // продукты без имени отбрасываем (как и раньше неявно)
        const prev = bestByKey.get(key);
        if (!prev || scoreProduct(p) > scoreProduct(prev.product)) {
          bestByKey.set(key, { product: p, idx });
        }
      });

      const unique = Array.from(bestByKey.values())
        .sort((a, b) => a.idx - b.idx)
        .map(({ product }) => product);

      const removed = original - unique.length;

      if (removed > 0) {
        // allowShrink: true — дедупликация ДОЛЖНА уменьшать количество
        HEYS.products.setAll(unique, { source: 'deduplicate', allowShrink: true });
      }

      return { original, deduplicated: unique.length, removed };
    },

    /**
     * 🔧 Исправляет продукты с отсутствующим kcal100
     * Вычисляет kcal100, carbs100, fat100 из базовых полей
     * @returns {{fixed: number, total: number}} Статистика
     */
    fixMissingKcal: () => {
      const products = HEYS.products.getAll();
      let fixed = 0;
      const updated = products.map(p => {
        if (p.kcal100 == null || p.kcal100 === 0) {
          const derived = computeDerived(p);
          if (derived.kcal100 > 0) {
            fixed++;
            return { ...p, ...derived };
          }
        }
        return p;
      });
      if (fixed > 0) {
        HEYS.products.setAll(updated, { source: 'fix-missing-kcal' });
        console.log(`[HEYS] 🔧 Исправлено ${fixed} продуктов с пустым kcal100`);
      }
      return { fixed, total: products.length };
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Phase α: overlay-products read wrapper. Flag-gated, default OFF.
  //
  // When overlay_products_v2 is OFF → behavior identical to today (legacy `_origGetAll`).
  // When ON  → read merged view from OverlayStore. If view returns null
  //            (empty shared cache + Type A overlay rows), fall back to legacy
  //            so UI stays alive while shared cache populates.
  //
  // The wrapper is installed only ONCE; re-evaluation of HEYS.products.getAll
  // beyond this point inherits the wrapper.
  // ─────────────────────────────────────────────────────────────────────
  (function installOverlayWrapper() {
    if (!HEYS.products || HEYS.products.__overlayWrapped) return;

    const _origGetAll = HEYS.products.getAll;
    const _origGetById = HEYS.products.getById;

    HEYS.products.getAll = function () {
      const enabled = HEYS.flags && typeof HEYS.flags.isEnabled === 'function'
        && HEYS.flags.isEnabled('overlay_products_v2');
      if (!enabled) return _origGetAll();

      try {
        const Overlay = HEYS.OverlayStore;
        if (!Overlay || typeof Overlay.getMergedView !== 'function') return _origGetAll();
        const view = Overlay.getMergedView();
        if (view === null) return _origGetAll(); // empty shared cache; defer
        return view;
      } catch (e) {
        console.warn('[HEYS.products] overlay getAll failed; fallback to legacy:', e && e.message);
        return _origGetAll();
      }
    };

    // Final fallback: stamp-only resolution cache populated by autoRecoverOnLoad.
    // Used when day-render asks for a product_id that was never persisted to
    // overlay/legacy (orphan from stamps without a shared match). Returns macro-only
    // shape derived from the meal stamp — enough for day rendering, not for global lists.
    function _resolveFromStampCache(id) {
      try {
        const cache = HEYS.orphanProducts && HEYS.orphanProducts._stampResolutionCache;
        if (cache && typeof cache.get === 'function' && id != null) {
          return cache.get(String(id)) || null;
        }
      } catch (_) { /* noop */ }
      return null;
    }

    // 🪦 Tombstone helper: проверяет, есть ли продукт (по id/name) в heys_deleted_ids.
    // Используется в getById чтобы согласовать поведение с toMergedView/getAll —
    // если product юзером удалён (tombstone), getById тоже должен возвращать null,
    // тогда вызывающий код (meal-item resolver, orphan-recovery) увидит его как
    // отсутствующий и сможет показать banner с выбором действия.
    function _isProductTombstoned(productOrRaw) {
      if (!productOrRaw) return false;
      try {
        const tombstones = HEYS.store && HEYS.store.get
          ? HEYS.store.get('heys_deleted_ids') : null;
        if (!Array.isArray(tombstones) || tombstones.length === 0) return false;
        const pid = productOrRaw.id != null ? String(productOrRaw.id) : null;
        const pname = productOrRaw.name ? String(productOrRaw.name).trim().toLowerCase() : null;
        for (const t of tombstones) {
          if (!t) continue;
          if (pid && t.id != null && String(t.id) === pid) return true;
          if (pname && t.name && String(t.name).trim().toLowerCase() === pname) return true;
        }
      } catch (_) { /* noop */ }
      return false;
    }

    HEYS.products.getById = function (id) {
      const enabled = HEYS.flags && typeof HEYS.flags.isEnabled === 'function'
        && HEYS.flags.isEnabled('overlay_products_v2');
      if (!enabled) {
        const legacy = _origGetById(id);
        if (legacy && _isProductTombstoned(legacy)) return _resolveFromStampCache(id);
        return legacy || _resolveFromStampCache(id);
      }

      try {
        const Overlay = HEYS.OverlayStore;
        if (!Overlay) return _origGetById(id) || _resolveFromStampCache(id);
        // Special-case: getById must consult overlay for items NOT in_my_list
        // (so dayv2 stamps can resolve products user has soft-removed).
        const raw = Overlay.getRowById(id);
        if (raw) {
          // 🪦 Tombstone check: если row tombstoned, считаем не найденным.
          // Stamp-cache подхватит как orphan → banner покажет выбор «восстановить»/«разовым».
          // Для Type B проверяем по name. Для Type A — резолвим shared name и проверяем.
          if (raw._custom) {
            if (_isProductTombstoned(raw)) {
              return _resolveFromStampCache(id);
            }
            return raw;
          }
          const sharedById = HEYS.cloud && HEYS.cloud.getSharedIndex
            ? HEYS.cloud.getSharedIndex() : null;
          const base = sharedById && raw.shared_origin_id
            ? sharedById.get(String(raw.shared_origin_id)) : null;
          if (base) {
            const merged = Object.assign({}, base, raw.overrides || {}, {
              id: raw.id,
              shared_origin_id: raw.shared_origin_id,
              fingerprint: raw.fingerprint || base.fingerprint,
              user_modified: !!raw.user_modified,
            });
            if (_isProductTombstoned(merged)) {
              return _resolveFromStampCache(id);
            }
            return merged;
          }
          // Type A overlay row but shared cache empty → bare overlay shape lacks nutrients.
          // Fall through to legacy (which has full snapshot) instead of returning broken row.
          const legacy = _origGetById(id);
          if (legacy && _isProductTombstoned(legacy)) return _resolveFromStampCache(id);
          return legacy || _resolveFromStampCache(id);
        }
        // Fall through to legacy lookup if no overlay row.
        const legacy = _origGetById(id);
        if (legacy && _isProductTombstoned(legacy)) return _resolveFromStampCache(id);
        return legacy || _resolveFromStampCache(id);
      } catch (e) {
        console.warn('[HEYS.products] overlay getById failed; fallback to legacy:', e && e.message);
        return _origGetById(id) || _resolveFromStampCache(id);
      }
    };

    HEYS.products.__overlayWrapped = true;
  })();

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
      // 3.5) если ключ уже client-scoped — не добавляем clientId повторно.
      // Часть Day flow передаёт сюда уже готовые ключи вида
      // heys_{clientId}_dayv2_YYYY-MM-DD; повторный namespace пишет день в
      // heys_{clientId}_{clientId}_dayv2_..., из-за чего refresh читает старый день.
      if (String(k).includes(cid)) return k;
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
