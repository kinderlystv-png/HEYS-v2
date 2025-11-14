/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_core_v12.js (498 строк)                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🛠️ ОСНОВНЫЕ УТИЛИТЫ (строки 1-50):                                                      │
│    ├── Базовые функции: round1, uuid, toNum, toNumInput (8-12)                          │
│    ├── Производные вычисления: computeDerived (13)                                      │
│    ├── LocalStorage: lsGet, lsSet с cloud sync (14-22)                                  │
│    └── Текстовые утилиты: INVIS, NUM_RE (8-9)                                           │
│                                                                                           │
│ 📄 ПАРСИНГ ДАННЫХ (строки 51-150):                                                       │
│    ├── isHeaderLine() - определение заголовков (24)                                     │
│    ├── normalizeLine() - нормализация строк (25)                                        │
│    ├── findTokenPositions() - поиск позиций (26)                                        │
│    ├── extractRow() - извлечение строки данных (27)                                     │
│    ├── parsePasted() - с Web Worker (32-49)                                             │
│    └── parsePastedSync() - синхронный парсинг (85-95)                                   │
│                                                                                           │
│ 📊 УПРАВЛЕНИЕ ПРОДУКТАМИ (строки 151-250):                                               │
│    ├── getAllProducts() - получение списка (96-105)                                     │
│    ├── addProduct() - добавление продукта (106-125)                                     │
│    ├── saveProduct() - сохранение изменений (126-145)                                   │
│    ├── deleteProduct() - удаление (146-165)                                             │
│    └── searchProducts() - поиск и фильтрация (166-185)                                  │
│                                                                                           │
│ ⚛️ REACT КОМПОНЕНТ RationTab (строки 251-400):                                           │
│    ├── Конструктор и state управление (186-220)                                         │
│    ├── Event handlers (221-280):                                                         │
│    │   ├── handleAddProduct() (221-240)                                                 │
│    │   ├── handleEditProduct() (241-260)                                                │
│    │   ├── handleDeleteProduct() (261-270)                                              │
│    │   └── handlePasteData() (271-280)                                                  │
│    ├── Render методы (281-360):                                                          │
│    │   ├── renderProductForm() (281-320)                                                │
│    │   ├── renderProductList() (321-350)                                                │
│    │   └── renderPasteArea() (351-360)                                                  │
│    └── Main render() method (361-400)                                                    │
│                                                                                           │
│ 🔗 ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ (строки 401-444):                                             │
│    ├── HEYS.RationTab - основной компонент (401-420)                                    │
│    ├── HEYS.utils - утилиты (421-435)                                                   │
│    └── Вспомогательные экспорты (436-444)                                               │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Парсинг: parsePasted() (строка 32), extractRow() (27)                             │
│    • Продукты: getAllProducts() (96), addProduct() (106)                               │
│    • React: RationTab class (186), render() (361)                                       │
│    • Утилиты: lsGet/lsSet (14-22), computeDerived() (13)                               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_core_v12.js — ядро + вкладка «Рацион»
(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const Store = (HEYS.store)||(HEYS.store={});

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
  const uuid = () => Math.random().toString(36).slice(2,10);
  
  /**
   * Безопасное преобразование в число
   * @param {*} x - Значение для преобразования
   * @returns {number} Число или 0 при ошибке
   */
  const toNum = (x) => { 
    if (x===undefined || x===null) return 0; 
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
  const toNumInput = (v)=>{ 
    const n = Number(String(v).replace(',', '.')); 
    return Number.isFinite(n)?n:0; 
  };
  
  /**
   * Вычисление производных значений продукта (углеводы, жиры, ккал)
   * @param {Object} p - Объект продукта с полями *100 (на 100г)
   * @returns {{carbs100: number, fat100: number, kcal100: number}}
   */
  function computeDerived(p){ 
    const carbs100 = toNum(p.simple100) + toNum(p.complex100); 
    const fat100 = toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100); 
    const kcal100 = 4*(toNum(p.protein100) + carbs100) + 8*fat100; 
    return { 
      carbs100: round1(carbs100), 
      fat100: round1(fat100), 
      kcal100: round1(kcal100) 
    }; 
  }
  /**
   * Получение данных из localStorage с JSON парсингом
   * @param {string} key - Ключ для чтения
   * @param {*} def - Значение по умолчанию при ошибке
   * @returns {*} Распарсенное значение или def
   */
  function lsGet(key, def){ 
    try{ 
      const v = localStorage.getItem(key); 
      return v? JSON.parse(v): def; 
    }catch(e){ 
      return def; 
    } 
  }
  
  /**
   * Сохранение данных в localStorage с JSON сериализацией
   * Автоматически вызывает window.HEYS.saveClientKey для синхронизации с облаком
   * @param {string} key - Ключ для сохранения
   * @param {*} val - Значение для сохранения
   */
  function lsSet(key, val){ 
    try{ 
      // Логируем только важные операции, не данные пользователя
      if (key.includes('_current') || key.includes('session')) {
        DEV.log('[lsSet] Saving key:', key);
      }
      localStorage.setItem(key, JSON.stringify(val)); 
      window.HEYS.saveClientKey(key, val); 
    }catch(e){
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
  function isHeaderLine(line){ 
    const l=line.toLowerCase(); 
    return l.includes('название') && (l.includes('ккал') || l.includes('калори') || l.includes('углевод')); 
  }
  
  /**
   * Нормализация строки (удаление невидимых символов, замена разделителей)
   * @param {string} raw - Исходная строка
   * @returns {string} Нормализованная строка
   */
  function normalizeLine(raw){ 
    let s = raw.replace(INVIS,' '); 
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
  function findTokenPositions(s, tokens){ 
    const positions=[]; 
    let start=0; 
    for(const tok of tokens){ 
      const idx=s.indexOf(tok, start); 
      positions.push(idx===-1?null:idx); 
      if(idx!==-1) start=idx+tok.length; 
    } 
    return positions; 
  }
  
  /**
   * Извлечение данных о продукте из строки таблицы
   * Ожидается формат: "Название <12 числовых значений>"
   * @param {string} raw - Исходная строка из вставленной таблицы
   * @returns {{name: string, nums: number[]}|null} Объект с именем и массивом из 12 чисел, или null
   */
  function extractRow(raw){ 
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
    
    if (last.length<12) {
      last = Array(12-last.length).fill('0').concat(last);
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
  function parsePastedSync(text){
    DEV.log('🔍 [PARSE_SYNC] Начинаем синхронный парсинг');
    DEV.log('📊 [PARSE_SYNC] Длина текста:', text?.length || 0);
    
    if (!text || typeof text !== 'string') {
      DEV.warn('⚠️ [PARSE_SYNC] Пустой или некорректный текст');
      return [];
    }
    
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0 && !isHeaderLine(l));
    DEV.log('📄 [PARSE_SYNC] Количество строк после фильтрации:', lines.length);
    DEV.log('📝 [PARSE_SYNC] Первые 3 строки:', lines.slice(0, 3));
    
    const rows=[];
    for(let i = 0; i < lines.length; i++){
      const raw = lines[i];
      DEV.log(`🔍 [PARSE_SYNC] Обрабатываем строку ${i + 1}:`, raw.substring(0, 50) + '...');
      
      const st = extractRow(raw); 
      if(!st) {
        DEV.warn(`⚠️ [PARSE_SYNC] Не удалось извлечь данные из строки ${i + 1}:`, raw);
        continue;
      }
      
      DEV.log(`✅ [PARSE_SYNC] Извлечены данные из строки ${i + 1}:`, st.name, st.nums);
      
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = st.nums;
      const base = { id: uuid(), name: st.name, simple100:simple, complex100:complex, protein100:protein, badFat100:bad, goodFat100:good, trans100:trans, fiber100:fiber, gi:gi, harmScore:harm };
      
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

    function RationTab(props){
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
        
        if (window.DEV) {
          window.DEV.log('💾 [useEffect] Сохраняем products в localStorage:', products.length, 'items');
        }
        
        if (Array.isArray(products) && window.HEYS && window.HEYS.store && typeof window.HEYS.store.set === 'function') {
          window.HEYS.store.set('heys_products', products);
        } else if (window.HEYS && window.HEYS.utils && typeof window.HEYS.utils.lsSet==='function') {
          // fallback
          window.HEYS.utils.lsSet('heys_products', products);
        }
      }, [products]);
      const [query, setQuery] = React.useState('');
      const [paste, setPaste] = React.useState('');
      const [showModal, setShowModal] = React.useState(false);
      const [draft, setDraft] = React.useState({ name:'', simple100:0, complex100:0, protein100:0, badFat100:0, goodFat100:0, trans100:0, fiber100:0, gi:0, harmScore:0 });
      const derived = computeDerived(draft);
      
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
      
      const filtered = React.useMemo(() => {
        const startTime = performance.now();
        const result = performSearch();
        const duration = performance.now() - startTime;
        
        // Трекинг поиска
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackSearch(query, result.length, duration);
        }
        
        return result;
          
        function performSearch() {
          const q = query.trim().toLowerCase();
          if (!q) return products;
          
          // Если доступен умный поиск, используем его
          if (window.HEYS && window.HEYS.SmartSearchWithTypos) {
            try {
              const smartResult = window.HEYS.SmartSearchWithTypos.search(q, products, {
                enablePhonetic: true,
                enableSynonyms: true,
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
              return products.filter(p => (p.name || '').toLowerCase().includes(q));
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
              return candidates.filter(p => (p.name || '').toLowerCase().includes(q));
            }
            
            // Fallback к обычному поиску
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('cache-miss');
            }
            return products.filter(p => (p.name || '').toLowerCase().includes(q));
          }
        }
      }, [products, query, searchIndex]);

      // Подгружать продукты из облака при смене клиента
      React.useEffect(()=>{
        const clientId = window.HEYS && window.HEYS.currentClientId;
        const cloud = window.HEYS && window.HEYS.cloud;
        if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
          const startTime = performance.now();
          const need = (typeof cloud.shouldSyncClient==='function') ? cloud.shouldSyncClient(clientId, 4000) : true;
          if (need){
            cloud.bootstrapClientSync(clientId).then(()=>{
              const duration = performance.now() - startTime;
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackApiCall('bootstrapClientSync', duration, true);
                window.HEYS.analytics.trackDataOperation('cloud-sync');
              }
              const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];
              
              if (window.DEV) {
                window.DEV.log('🔄 [SYNC] После bootstrapClientSync прочитали из localStorage:', latest.length, 'items');
                window.DEV.log('🔄 [SYNC] Текущее состояние products:', products.length, 'items');
              }
              
              // Не перезаписываем продукты, если sync вернул пустой массив, а у нас уже есть данные
              if (latest.length === 0 && products.length > 0) {
                if (window.DEV) {
                  window.DEV.log('⚠️ [SYNC] SKIP: Не перезаписываем', products.length, 'продуктов пустым массивом');
                }
                return;
              }
              
              if (Array.isArray(latest) && latest.length > 0) {
                if (window.HEYS && window.HEYS.analytics) {
                  window.HEYS.analytics.trackDataOperation('products-loaded', latest.length);
                }
              }
              setProducts(Array.isArray(latest)?latest:[]);
            }).catch((error) => {
              const duration = performance.now() - startTime;
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackApiCall('bootstrapClientSync', duration, false);
              }
              console.error('Bootstrap client sync failed:', error);
            });
          } else {
            const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];
            
            if (window.DEV) {
              window.DEV.log('🔄 [SYNC] Sync не нужен, читаем из localStorage:', latest.length, 'items');
            }
            
            // Не перезаписываем продукты пустым массивом
            if (latest.length === 0 && products.length > 0) {
              if (window.DEV) {
                window.DEV.log('⚠️ [SYNC] SKIP: Не перезаписываем', products.length, 'продуктов');
              }
              return;
            }
            
            if (Array.isArray(latest) && latest.length > 0) {
              if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('products-loaded', latest.length);
              }
            }
            setProducts(Array.isArray(latest)?latest:[]);
          }
        } else {
          const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || (window.HEYS.utils && window.HEYS.utils.lsGet && window.HEYS.utils.lsGet('heys_products', [])) || [];
          
          if (window.DEV) {
            window.DEV.log('🔄 [SYNC] Нет cloud/clientId, читаем из localStorage:', latest.length, 'items');
          }
          
          // Не перезаписываем продукты пустым массивом
          if (latest.length === 0 && products.length > 0) {
            if (window.DEV) {
              window.DEV.log('⚠️ [SYNC] SKIP: Не перезаписываем', products.length, 'продуктов');
            }
            return;
          }
          
          setProducts(Array.isArray(latest)?latest:[]);
        }
      }, [window.HEYS && window.HEYS.currentClientId]);

    function resetDraft(){ setDraft({name:'', simple100:0, complex100:0, protein100:0, badFat100:0, goodFat100:0, trans100:0, fiber100:0, gi:0, harmScore:0}); }
    function addProduct(){ 
      const base = { id: uuid(), name: draft.name || 'Без названия', simple100: toNum(draft.simple100), complex100: toNum(draft.complex100), protein100: toNum(draft.protein100), badFat100: toNum(draft.badFat100), goodFat100: toNum(draft.goodFat100), trans100: toNum(draft.trans100), fiber100: toNum(draft.fiber100), gi: toNum(draft.gi), harmScore: toNum(draft.harmScore) }; 
      const d = computeDerived(base); 
      setProducts([...products, { ...base, ...d }]); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('products-loaded', 1);
      }
      resetDraft(); 
      setShowModal(false); 
    }
    function updateRow(id, patch){ 
      setProducts(products.map(p=>{ if(p.id !== id) return p; const changed = { ...p, ...patch }; const d = computeDerived(changed); return { ...changed, ...d }; })); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
    }
    function deleteRow(id){ 
      setProducts(products.filter(p=>p.id!==id)); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
    }
    async function importAppend(){
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
      } catch(e) { 
        console.error('❌ [IMPORT] Ошибка при парсинге:', e);
        console.error('📄 [IMPORT] Stack trace:', e.stack);
        
        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, false);
        }
        alert('Ошибка парсинга: '+e.message); 
        return; 
      }
      
      if(!rows.length){ 
        DEV.warn('⚠️ [IMPORT] Не удалось распознать данные');
        DEV.log('📄 [IMPORT] Исходный текст:', paste);
        alert('Не удалось распознать данные'); 
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
    async function importReplace(){
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
      } catch(e) { 
        console.error('❌ [IMPORT] Ошибка при парсинге:', e);
        console.error('📄 [IMPORT] Stack trace:', e.stack);
        
        const duration = performance.now() - startTime;
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackApiCall('parsePasted', duration, false);
        }
        alert('Ошибка парсинга: '+e.message); 
        return; 
      }
      
      if(!rows.length){ 
        DEV.warn('⚠️ [IMPORT] Не удалось распознать данные');
        DEV.log('📄 [IMPORT] Исходный текст:', paste);
        alert('Не удалось распознать данные'); 
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

    return React.createElement('div', {className:'page page-ration'},
      React.createElement('div', {className:'card tone-amber', style:{marginBottom:'8px'}},
        React.createElement('div', {className:'section-title'}, 'Импорт из вставки'),
        React.createElement('textarea', {placeholder:'Вставь строки: Название + 12 чисел справа', value:paste, onChange:e=>setPaste(e.target.value)}),
        React.createElement('div', {className:'row', style:{marginTop:'8px'}},
          React.createElement('button', {className:'btn acc', onClick:importAppend}, 'Импортировать (добавить)'),
          React.createElement('button', {className:'btn', onClick:importReplace}, 'Импортировать (заменить)'),
          React.createElement('span', {className:'muted'}, 'Запятые допустимы. Если чисел меньше 12 — недостающие = 0.')
        )
      ),
      React.createElement('div', {className:'card tone-blue'},
        React.createElement('div', {className:'topbar'},
          React.createElement('div', {className:'row'},
            React.createElement('input', {placeholder:'Поиск по названию…', value:query, onChange:e=>setQuery(e.target.value), style:{minWidth:'260px'}}),
            React.createElement('span', {className:'muted'}, `Найдено: ${filtered.length} из ${products.length}`)
          ),
          React.createElement('div', {className:'row'},
            React.createElement('button', {className:'btn acc', onClick:()=>setShowModal(true)}, '+ Добавить продукт')
          )
        ),
        React.createElement('div', {style:{overflowX:'auto'}},
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Название'),
                React.createElement('th', null, 'Ккал (100г)'),
                React.createElement('th', null, 'Углеводы'),
                React.createElement('th', null, 'Простые'),
                React.createElement('th', null, 'Сложные'),
                React.createElement('th', null, 'Белки'),
                React.createElement('th', null, 'Жиры'),
                React.createElement('th', null, 'Вредные'),
                React.createElement('th', null, 'Полезные'),
                React.createElement('th', null, 'Супервредные'),
                React.createElement('th', null, 'Клетчатка'),
                React.createElement('th', null, 'ГИ'),
                React.createElement('th', null, 'Вредность'),
                React.createElement('th', null, '')
              )
            ),
            React.createElement('tbody', null,
              filtered.map(p=> React.createElement('tr', {key:p.id},
                React.createElement('td', null, React.createElement('input', {value:p.name, onChange:e=>updateRow(p.id, {name:e.target.value})})),
                React.createElement('td', null, React.createElement('input', {className:'readOnly', value:p.kcal100, readOnly:true})),
                React.createElement('td', null, React.createElement('input', {className:'readOnly', value:p.carbs100, readOnly:true})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.simple100, onChange:e=>updateRow(p.id, {simple100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.complex100, onChange:e=>updateRow(p.id, {complex100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.protein100, onChange:e=>updateRow(p.id, {protein100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {className:'readOnly', value:p.fat100, readOnly:true})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.badFat100, onChange:e=>updateRow(p.id, {badFat100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.goodFat100, onChange:e=>updateRow(p.id, {goodFat100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.trans100, onChange:e=>updateRow(p.id, {trans100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.fiber100, onChange:e=>updateRow(p.id, {fiber100:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.gi, onChange:e=>updateRow(p.id, {gi:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('input', {type:'text', value:p.harmScore, onChange:e=>updateRow(p.id, {harmScore:toNum(e.target.value)})})),
                React.createElement('td', null, React.createElement('button', {className:'btn', onClick:()=>deleteRow(p.id)}, 'Удалить'))
              ))
            )
          )
        ),
        React.createElement('div', {className:'muted', style:{marginTop:'8px'}}, 'Серые поля — авто: У=простые+сложные; Ж=вредные+полезные+супервредные; Ккал=4×(Б+У)+8×Ж.')
      ),
      showModal && React.createElement('div', {className:'modal-backdrop', onClick:(e)=>{ if(e.target.classList.contains('modal-backdrop')) setShowModal(false); }},
        React.createElement('div', {className:'modal'},
          React.createElement('div', {className:'row', style:{justifyContent:'space-between'}},
            React.createElement('div', null, 'Новый продукт'),
            React.createElement('button', {className:'btn', onClick:()=>setShowModal(false)}, '×')
          ),
          React.createElement('div', {className:'grid grid-2', style:{marginTop:'8px'}},
            React.createElement('div', null, React.createElement('label', null, 'Название'), React.createElement('input', {value:draft.name, onChange:e=>setDraft({...draft, name:e.target.value})})),
            React.createElement('div', null, React.createElement('label', null, 'ГИ'), React.createElement('input', {type:'text', value:draft.gi, onChange:e=>setDraft({...draft, gi:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Простые (100г)'), React.createElement('input', {type:'text', value:draft.simple100, onChange:e=>setDraft({...draft, simple100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Сложные (100г)'), React.createElement('input', {type:'text', value:draft.complex100, onChange:e=>setDraft({...draft, complex100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Белки (100г)'), React.createElement('input', {type:'text', value:draft.protein100, onChange:e=>setDraft({...draft, protein100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Вредные жиры (100г)'), React.createElement('input', {type:'text', value:draft.badFat100, onChange:e=>setDraft({...draft, badFat100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Полезные жиры (100г)'), React.createElement('input', {type:'text', value:draft.goodFat100, onChange:e=>setDraft({...draft, goodFat100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Супервредные жиры (100г)'), React.createElement('input', {type:'text', value:draft.trans100, onChange:e=>setDraft({...draft, trans100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Клетчатка (100г)'), React.createElement('input', {type:'text', value:draft.fiber100, onChange:e=>setDraft({...draft, fiber100:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Вредность (0–10)'), React.createElement('input', {type:'text', value:draft.harmScore, onChange:e=>setDraft({...draft, harmScore:toNum(e.target.value)})})),
            React.createElement('div', null, React.createElement('label', null, 'Углеводы (100г) — авто'), React.createElement('input', {className:'readOnly', readOnly:true, value:derived.carbs100})),
            React.createElement('div', null, React.createElement('label', null, 'Жиры (100г) — авто'), React.createElement('input', {className:'readOnly', readOnly:true, value:derived.fat100})),
            React.createElement('div', null, React.createElement('label', null, 'Калории (100г) — авто'), React.createElement('input', {className:'readOnly', readOnly:true, value:derived.kcal100}))
          ),
          React.createElement('div', {className:'row', style:{justifyContent:'flex-end', marginTop:'10px'}},
            React.createElement('button', {className:'btn', onClick:()=>{ setShowModal(false); resetDraft(); }}, 'Отмена'),
            React.createElement('button', {className:'btn acc', onClick:addProduct}, 'Добавить')
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

  HEYS.utils = { INVIS, NUM_RE, round1, uuid, toNum, toNumInput, computeDerived, lsGet, lsSet, parsePasted, validateInput };
  HEYS.validateInput = validateInput; // Прямой доступ для тестов
  HEYS.core = { validateInput }; // Создаем объект core с валидацией
  
  // products helper API (thin wrapper over store + local fallback)
  HEYS.products = HEYS.products || {
    getAll: ()=> (HEYS.store&&HEYS.store.get&&HEYS.store.get('heys_products', [])) || (HEYS.utils&&HEYS.utils.lsGet&&HEYS.utils.lsGet('heys_products', [])) || [],
    setAll: (arr)=> { if(HEYS.store&&HEYS.store.set) HEYS.store.set('heys_products', arr); else if(HEYS.utils&&HEYS.utils.lsSet) HEYS.utils.lsSet('heys_products', arr); },
    watch: (fn)=> { if(HEYS.store&&HEYS.store.watch) return HEYS.store.watch('heys_products', fn); return ()=>{}; }
  };
  HEYS.RationTab = RationTab;
  HEYS.Ration = RationTab;
})(window);


;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};
  if (!U.__clientScoped) {
    // ИСПРАВЛЕНИЕ: Используем HEYS.store для корректной работы с compress/decompress
    const get0 = U.lsGet ? U.lsGet.bind(U) : (k,d)=>{ 
      if (global.HEYS && global.HEYS.store && typeof global.HEYS.store.get === 'function') {
        return global.HEYS.store.get(k, d);
      }
      try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } 
    };
    const set0 = U.lsSet ? U.lsSet.bind(U) : (k,v)=>{ 
      if (global.HEYS && global.HEYS.store && typeof global.HEYS.store.set === 'function') {
        return global.HEYS.store.set(k, v);
      }
      try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} 
    };

    function nsKey(k){
      // 1) текущий клиент: из глобала или из глобального ключа выбора клиента
      let cid = (global.HEYS && HEYS.currentClientId) || '';
      if (!cid) {
        try { const raw = localStorage.getItem('heys_client_current'); if (raw) cid = JSON.parse(raw); } catch(e){ cid=''; }
      }
      // 2) служебные ключи НЕ префиксуем (глобальные)
      if (/^heys_(clients|client_current)$/i.test(k)) return k;
      // 3) если клиента нет — работаем как есть
      if (!cid) return k;
      // 4) все остальные наши ключи префиксуем
      if (/^(heys_|day_)/i.test(k)) {
        return k.replace(/^(heys_|day_)/i, (m)=> m + cid + '_');
      }
      return k;
    }

    U.lsGet = (k,d)=> get0(nsKey(k), d);
    U.lsSet = (k,v)=> set0(nsKey(k), v);
    U.__clientScoped = true;
  }
})(window);
