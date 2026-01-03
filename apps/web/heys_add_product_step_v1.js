// heys_add_product_step_v1.js — Шаг добавления продукта через StepModal
// Двухшаговый flow: поиск → граммы/порции
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef, useContext } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.warn('[HEYS] AddProductStep: StepModal not loaded yet');
  }

  // === Утилиты ===
  const U = () => HEYS.utils || {};
  const lsGet = (key, def) => {
    const utils = U();
    if (utils.lsGet) return utils.lsGet(key, def);
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  };

  // Haptic feedback
  const haptic = (style = 'light') => {
    if (navigator.vibrate) {
      navigator.vibrate(style === 'light' ? 10 : style === 'medium' ? 20 : 30);
    }
  };

  // === Умный список продуктов: частота + свежесть ===
  function computeSmartProducts(products, dateKey) {
    if (!products || !products.length) return [];
    
    const usageCount = new Map();   // Частота использования
    const lastUsedDay = new Map();  // Последний день использования (0 = сегодня)
    const today = new Date(dateKey || new Date().toISOString().slice(0, 10));
    
    // Анализируем последние 30 дней
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, null);
      
      if (dayData && dayData.meals) {
        dayData.meals.forEach(meal => {
          if (meal.items) {
            meal.items.forEach(item => {
              const pid = item.product_id || item.productId || item.name;
              if (pid) {
                usageCount.set(pid, (usageCount.get(pid) || 0) + 1);
                // Запоминаем первое (самое свежее) использование
                if (!lastUsedDay.has(pid)) {
                  lastUsedDay.set(pid, i);
                }
              }
            });
          }
        });
      }
    }
    
    // Комбинированный скор: частота × свежесть
    // Свежесть: 1.0 для сегодня, убывает экспоненциально
    // Формула: score = frequency * recencyWeight
    // recencyWeight = 1 / (1 + daysAgo * 0.15)
    const getScore = (pid) => {
      const freq = usageCount.get(pid) || 0;
      if (freq === 0) return 0;
      const daysAgo = lastUsedDay.get(pid) ?? 30;
      const recencyWeight = 1 / (1 + daysAgo * 0.15);
      return freq * recencyWeight;
    };
    
    // Сортируем по комбинированному скору
    const sorted = [...products]
      .filter(p => {
        const pid = p.id || p.product_id || p.name;
        return usageCount.get(pid) > 0; // Только использованные
      })
      .sort((a, b) => {
        const aId = a.id || a.product_id || a.name;
        const bId = b.id || b.product_id || b.name;
        return getScore(bId) - getScore(aId);
      });
    
    return sorted.slice(0, 20);
  }

  // === Категории для фильтрации ===
  const CATEGORIES = [
    { id: 'all', name: 'Все', icon: '📋' },
    { id: 'dairy', name: 'Молочные', icon: '🥛', match: ['молоч', 'сыр', 'творог', 'йогурт', 'кефир', 'молоко'] },
    { id: 'meat', name: 'Мясо', icon: '🍖', match: ['мяс', 'курин', 'говя', 'свин', 'индейк', 'птиц'] },
    { id: 'fish', name: 'Рыба', icon: '🐟', match: ['рыб', 'морепр', 'лосось', 'тунец', 'креветк'] },
    { id: 'veggies', name: 'Овощи', icon: '🥬', match: ['овощ', 'салат', 'огурец', 'помидор', 'капуст', 'морков'] },
    { id: 'fruits', name: 'Фрукты', icon: '🍎', match: ['фрукт', 'ягод', 'яблок', 'банан', 'апельс'] },
    { id: 'grains', name: 'Крупы', icon: '🌾', match: ['круп', 'каш', 'рис', 'гречк', 'овся', 'хлеб', 'макар'] },
    { id: 'sweets', name: 'Сладкое', icon: '🍬', match: ['сладк', 'конфет', 'шокол', 'торт', 'печень', 'десерт'] }
  ];

  // Проверка категории продукта
  function matchCategory(product, categoryId) {
    if (categoryId === 'all') return true;
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat || !cat.match) return true;
    const name = (product.name || '').toLowerCase();
    const pCat = (product.category || '').toLowerCase();
    return cat.match.some(m => name.includes(m) || pCat.includes(m));
  }

  // === Компонент поиска продукта (Шаг 1) ===
  function ProductSearchStep({ data, onChange, context }) {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [favorites, setFavorites] = useState(() => 
      HEYS.store?.getFavorites?.() || new Set()
    );
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [showPhotoConfirm, setShowPhotoConfirm] = useState(false); // Модалка подтверждения
    const [pendingPhotoData, setPendingPhotoData] = useState(null);  // Данные для подтверждения
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    
    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep } = stepContext;
    
    const { dateKey = '' } = context || {};
    
    // 🔧 FIX: Реактивное состояние для продуктов с подпиской на синхронизацию
    // Это решает проблему: при открытии модалки сразу после создания приёма
    // продукты ещё не загружены из облака, но после heysSyncCompleted они появятся
    const [productsVersion, setProductsVersion] = useState(0);
    
    // 🔒 Ref для пропуска первого sync (предотвращает мерцание)
    const initialSyncDoneRef = useRef(false);
    
    // Подписка на обновление продуктов (heysSyncCompleted или watch)
    useEffect(() => {
      const handleSyncComplete = (e) => {
        // 🔒 Пропускаем первый heysSyncCompleted — products уже загружены
        if (e?.type === 'heysSyncCompleted') {
          if (!initialSyncDoneRef.current) {
            initialSyncDoneRef.current = true;
            return;
          }
        }
        // console.log('[AddProductStep] 🔄 heysSyncCompleted → refreshing products');
        setProductsVersion(v => v + 1);
      };
      
      window.addEventListener('heysSyncCompleted', handleSyncComplete);
      
      // Также подписываемся через HEYS.products.watch если доступен
      let unwatchProducts = () => {};
      if (HEYS.products?.watch) {
        unwatchProducts = HEYS.products.watch(() => {
          // console.log('[AddProductStep] 🔄 products.watch → refreshing products');
          setProductsVersion(v => v + 1);
        });
      }
      
      return () => {
        window.removeEventListener('heysSyncCompleted', handleSyncComplete);
        unwatchProducts();
      };
    }, []);
    
    // Всегда берём актуальные продукты из глобального стора (если появились новые)
    // productsVersion в зависимостях заставляет пересчитать при синхронизации
    const latestProducts = useMemo(() => {
      const base = Array.isArray(context?.products) ? context.products : [];
      
      // Пробуем получить из HEYS.products.getAll()
      let storeProducts = [];
      if (HEYS.products?.getAll) {
        storeProducts = HEYS.products.getAll() || [];
      }
      
      // Fallback: напрямую из HEYS.store
      if (storeProducts.length === 0 && HEYS.store?.get) {
        storeProducts = HEYS.store.get('heys_products', []) || [];
      }
      
      // Fallback: из localStorage через U()
      if (storeProducts.length === 0) {
        const utils = U();
        if (utils.lsGet) {
          storeProducts = utils.lsGet('heys_products', []) || [];
        }
      }
      
      // Fallback: напрямую из localStorage
      if (storeProducts.length === 0) {
        try {
          const raw = localStorage.getItem('heys_products');
          if (raw) storeProducts = JSON.parse(raw) || [];
        } catch (e) {}
      }
      
      storeProducts = Array.isArray(storeProducts) ? storeProducts : [];
      // Если store длиннее — используем его как основу
      const primary = storeProducts.length >= base.length ? storeProducts : base;
      const secondary = primary === storeProducts ? base : storeProducts;
      // Объединяем, убирая дубликаты по id/name
      const seen = new Set();
      const merged = [];
      const pushUnique = (p) => {
        if (!p) return;
        const pid = String(p.id ?? p.product_id ?? p.name);
        if (seen.has(pid)) return;
        seen.add(pid);
        merged.push(p);
      };
      primary.forEach(pushUnique);
      secondary.forEach(pushUnique);
      
      return merged;
    }, [context, productsVersion]);
    
    // 🌐 Результаты из общей базы (асинхронный поиск)
    const [sharedResults, setSharedResults] = useState([]);
    const [sharedLoading, setSharedLoading] = useState(false);
    
    // Debug: проверяем что products пришли
    // useEffect(() => {
    //   console.log('[AddProductStep] products count:', latestProducts?.length);
    // }, [latestProducts]);
    
    // Фокус на input при монтировании
    useEffect(() => {
      setTimeout(() => inputRef.current?.focus(), 100);
    }, []);
    
    // 🌐 Асинхронный поиск по общей базе (debounced)
    useEffect(() => {
      const trimmed = search.trim();
      if (trimmed.length < 2) {
        setSharedResults([]);
        return;
      }
      
      const timeoutId = setTimeout(async () => {
        setSharedLoading(true);
        console.log('[SharedSearch] Searching for:', trimmed);
        try {
          const result = await HEYS?.cloud?.searchSharedProducts?.(trimmed, { limit: 30 });
          console.log('[SharedSearch] Result:', result?.data?.length, 'products');
          if (result?.data) {
            // Преобразуем данные для совместимости с UI
            const normalized = result.data.map(p => {
              // Нормализация полей (snake_case → camelCase fallback)
              const protein100 = Number(p.protein100 ?? 0) || 0;
              const simple100 = Number(p.simple100 ?? 0) || 0;
              const complex100 = Number(p.complex100 ?? 0) || 0;
              const badFat100 = Number(p.badfat100 ?? p.badFat100 ?? 0) || 0;
              const goodFat100 = Number(p.goodfat100 ?? p.goodFat100 ?? 0) || 0;
              const trans100 = Number(p.trans100 ?? 0) || 0;
              
              // kcal100 — вычисляемое поле (не хранится в shared_products)
              // Формула: protein*4 + carbs*4 + fat*9
              const carbs100 = simple100 + complex100;
              const fat100 = badFat100 + goodFat100 + trans100;
              const kcal100 = Math.round(protein100 * 4 + carbs100 * 4 + fat100 * 9);
              
              return {
                ...p,
                protein100,
                simple100,
                complex100,
                badFat100,
                goodFat100,
                trans100,
                fiber100: Number(p.fiber100 ?? 0) || 0,
                gi: Number(p.gi ?? 0) || 0,
                harm: Number(p.harm ?? 0) || 0,
                harmScore: Number(p.harmscore ?? p.harmScore ?? p.harm ?? 0) || 0,
                // Вычисленные поля
                kcal100,
                carbs100,
                fat100,
                // Флаг что это из общей базы
                _fromShared: true
              };
            });
            console.log('[SharedSearch] Normalized first:', normalized[0]?.name, 'kcal100:', normalized[0]?.kcal100);
            setSharedResults(normalized);
          }
        } catch (err) {
          console.error('[AddProductStep] Shared search error:', err);
        } finally {
          setSharedLoading(false);
        }
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }, [search]);
    
    // Умный список: частота + свежесть (объединяет "часто" и "последние")
    const smartProducts = useMemo(() => 
      computeSmartProducts(latestProducts, dateKey), 
      [latestProducts, dateKey]
    );
    
    // Поиск с фильтром категории
    // Используем normalizeText из SmartSearch (единый источник)
    const normalizeSearch = HEYS?.SmartSearchWithTypos?.utils?.normalizeText 
      || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));
    const lc = normalizeSearch(search.trim());
    const searchResults = useMemo(() => {
      let results = [];
      
      if (lc) {
        // Умный поиск если доступен
        if (HEYS.SmartSearchWithTypos) {
          try {
            const result = HEYS.SmartSearchWithTypos.search(lc, latestProducts, {
              enablePhonetic: true,
              enableSynonyms: true,
              enableTranslit: true, // 🆕 рафа → rafa → Raffaello
              maxSuggestions: 30
            });
            if (result?.results?.length) results = result.results;
          } catch (e) {
            console.warn('[AddProductStep] Smart search error:', e);
          }
        }
        
        // Fallback с нормализацией ё→е (только если SmartSearch не дал результатов)
        if (!results.length) {
          results = latestProducts.filter(p => 
            normalizeSearch(p.name).includes(lc)
          );
          
          // Сортировка ТОЛЬКО для fallback — SmartSearch уже отсортирован по relevance!
          results.sort((a, b) => {
            const aName = normalizeSearch(a.name);
            const bName = normalizeSearch(b.name);
            const aStartsWith = aName.startsWith(lc) ? 0 : 1;
            const bStartsWith = bName.startsWith(lc) ? 0 : 1;
            if (aStartsWith !== bStartsWith) return aStartsWith - bStartsWith;
            // Затем по точному вхождению слова
            const aExact = aName.split(/\s+/).some(w => w === lc) ? 0 : 1;
            const bExact = bName.split(/\s+/).some(w => w === lc) ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            // Затем по длине названия (короткие = точнее)
            return aName.length - bName.length;
          });
        }
      }
      
      // Фильтр по категории
      if (selectedCategory !== 'all') {
        results = results.filter(p => matchCategory(p, selectedCategory));
      }
      
      return results.slice(0, 20);
    }, [lc, latestProducts, selectedCategory]);
    
    // 🌐 Объединённые результаты: личные + общая база (без дубликатов)
    const combinedResults = useMemo(() => {
      if (!lc) return [];

      // Фильтруем shared тоже по категории (иначе переключатель категории кажется «сломанный»)
      const sharedFiltered = selectedCategory !== 'all'
        ? sharedResults.filter(p => matchCategory(p, selectedCategory))
        : sharedResults;

      // Собираем кандидатов и пересчитываем скор по «реальному» совпадению,
      // чтобы семантические/косвенные личные совпадения не утаптывали точные shared-матчи.
      const candidates = [];

      // Простая функция нечеткого сравнения (Jaro-Winkler like для коротких строк)
      const isFuzzyMatch = (word, query) => {
        if (!word || !query) return false;
        if (word.includes(query)) return true;
        
        // Допускаем 1 ошибку/опечатку для слов длиннее 4 букв
        if (query.length > 3 && Math.abs(word.length - query.length) <= 2) {
          let errors = 0;
          let i = 0, j = 0;
          while (i < word.length && j < query.length) {
            if (word[i] !== query[j]) {
              errors++;
              if (errors > 1) return false;
              // Пробуем пропустить символ в одном из слов (вставка/удаление)
              if (word.length > query.length) i++;
              else if (query.length > word.length) j++;
              else { i++; j++; } // Замена
            } else {
              i++; j++;
            }
          }
          return true;
        }
        return false;
      };

      const pushCandidate = (p, source) => {
        if (!p) return;
        // Используем имя как есть, если нормализация вернула пустоту (защита от агрессивной очистки)
        let nameNorm = normalizeSearch(p.name || '');
        if (!nameNorm && p.name) nameNorm = p.name.toLowerCase().trim();
        
        if (!nameNorm) return;

        const baseRel = Number.isFinite(p.relevance) ? p.relevance : 0;
        const hasSubstring = nameNorm.includes(lc);
        const startsWith = nameNorm.startsWith(lc);
        
        // Разбиваем имя на слова для более умного анализа
        const nameWords = nameNorm.split(/[\s,().]+/); // Разделители: пробел, запятая, скобки, точка
        const exactWord = nameWords.some(w => w === lc);
        // Проверяем fuzzy совпадение для каждого слова запроса
        const fuzzyMatch = nameWords.some(w => isFuzzyMatch(w, lc));
        // Проверяем совпадение начала слова (3+ буквы) — спасает "савая" -> "савоярди" (совпадает "сав")
        const prefix3Match = lc.length >= 3 && nameWords.some(w => w.startsWith(lc.slice(0, 3)));

        // Базовый скор: используем relevance если есть + поправки
        let score = baseRel;
        
        if (hasSubstring) score += 40;
        else if (fuzzyMatch) score += 30; // Почти как точное, если похоже
        else if (prefix3Match) score += 20; // Начало совпадает — это уже неплохо
        
        if (startsWith) score += 15;
        if (exactWord) score += 10;

        // Если вообще нет подстрочного совпадения, fuzzy и даже префикса — сильно штрафуем
        if (!hasSubstring && !fuzzyMatch && !prefix3Match) score -= 35;

        // Лёгкий приоритет личным (при прочих равных)
        if (source === 'personal') score += 3;
        // Shared тоже важны, если они хорошо совпадают
        if (source === 'shared') score += 1;

        candidates.push({ ...p, _source: source, _score: score, _nameNorm: nameNorm });
      };

      searchResults.forEach(p => pushCandidate(p, 'personal'));
      sharedFiltered.forEach(p => pushCandidate(p, 'shared'));

      // Дедуп по нормализованному имени — оставляем лучший скор
      const bestByName = new Map();
      candidates.forEach(p => {
        const key = p._nameNorm;
        const prev = bestByName.get(key);
        if (!prev || (p._score ?? 0) > (prev._score ?? 0)) {
          bestByName.set(key, p);
        }
      });

      const combined = Array.from(bestByName.values());

      combined.sort((a, b) => {
        const sa = a._score ?? 0;
        const sb = b._score ?? 0;
        if (sa !== sb) return sb - sa;
        // tie-break: personal выше shared
        if (a._source !== b._source) return a._source === 'personal' ? -1 : 1;
        // затем короче название выше
        return String(a.name || '').length - String(b.name || '').length;
      });

      return combined.slice(0, 25);
    }, [searchResults, sharedResults, lc, normalizeSearch, selectedCategory]);
    
    // "Возможно вы искали" — альтернативные запросы при пустых результатах
    const didYouMean = useMemo(() => {
      if (!lc || combinedResults.length > 0) return [];
      
      if (HEYS?.SmartSearchWithTypos?.getDidYouMean) {
        return HEYS.SmartSearchWithTypos.getDidYouMean(lc, latestProducts, 3);
      }
      return [];
    }, [lc, combinedResults.length, latestProducts]);
    
    // Toggle избранного
    const toggleFavorite = useCallback((e, productId) => {
      e.stopPropagation();
      if (HEYS.store?.toggleFavorite) {
        HEYS.store.toggleFavorite(productId);
        setFavorites(HEYS.store.getFavorites());
      }
    }, []);
    
    // Выбор продукта — сразу переход на шаг граммов
    const selectProduct = useCallback((product) => {
      haptic('light');
      
      // Последние использованные граммы для этого продукта
      const productId = product.id ?? product.product_id ?? product.name;
      const lastGrams = lsGet(`heys_last_grams_${productId}`, null);
      const defaultGrams = lastGrams || 100;
      
      // 🔍 DEBUG: Подробный лог выбранного продукта
      const hasNutrients = !!(product.kcal100 || product.protein100 || product.carbs100);
      // console.log('[ProductSearchStep] selectProduct:', product.name, 'grams:', defaultGrams, {...});
      if (!hasNutrients) {
        console.error('🚨 [ProductSearchStep] CRITICAL: Product has NO nutrients!', product);
      }
      
      onChange({ 
        ...data, 
        selectedProduct: product,
        grams: defaultGrams,
        lastGrams: lastGrams // Для отображения подсказки
      });
      // Автопереход на шаг граммов (index 2: search → grams)
      // Увеличен таймаут для гарантии обновления state
      if (goToStep) {
        setTimeout(() => goToStep(2, 'left'), 150);
      }
    }, [data, onChange, goToStep]);
    
    // Кнопка "Новый продукт" — открытие внешней формы создания
    const handleNewProduct = useCallback(() => {
      haptic('medium');
      onChange({ ...data, searchQuery: search });
      // Если есть внутренний шаг создания — перейти на него
      if (goToStep) {
        setTimeout(() => goToStep(1, 'left'), 10);
        return;
      }
      // Иначе, если передан onNewProduct из контекста — вызвать и закрыть модалку
      if (context?.onNewProduct) {
        context.onNewProduct();
        // Закрываем текущий StepModal, если возможно
        if (goToStep) {
          // StepModal не даёт явного close здесь — закроем через глобал
          HEYS.StepModal?.close?.();
        }
      }
    }, [context, goToStep, search, data, onChange]);
    
    // Обработчик выбора фото
    const handlePhotoSelect = useCallback((e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      haptic('medium');
      setSelectedPhoto(file);
      // console.log('[AddProductStep] Photo selected:', file.name, file.size, 'bytes');
      
      // Сжимаем фото перед сохранением (localStorage лимит ~5МБ)
      const MAX_SIZE = 800; // Максимальный размер по большей стороне
      const QUALITY = 0.7;  // Качество JPEG
      
      const img = new Image();
      img.onload = () => {
        // Расчёт новых размеров
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round(height * MAX_SIZE / width);
            width = MAX_SIZE;
          } else {
            width = Math.round(width * MAX_SIZE / height);
            height = MAX_SIZE;
          }
        }
        
        // Canvas для сжатия
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Конвертируем в JPEG (меньше размер чем PNG)
        const compressedData = canvas.toDataURL('image/jpeg', QUALITY);
        // console.log('[AddProductStep] Photo compressed:', ...);
        
        setPhotoPreview(compressedData);
        
        // Показываем превью для подтверждения
        setPendingPhotoData({
          compressedData,
          filename: file.name,
          originalSize: file.size
        });
        setShowPhotoConfirm(true);
      };
      
      img.onerror = () => {
        console.error('[AddProductStep] Failed to load image');
      };
      
      // Загружаем изображение из файла
      const reader = new FileReader();
      reader.onload = (event) => {
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      
      // Сбрасываем input чтобы можно было выбрать то же фото повторно
      e.target.value = '';
    }, []);
    
    // Подтверждение сохранения фото
    const confirmPhoto = useCallback(() => {
      if (!pendingPhotoData || !context?.onAddPhoto) {
        console.warn('[AddProductStep] Cannot confirm photo - missing data or callback');
        setShowPhotoConfirm(false);
        return;
      }
      
      haptic('success');
      context.onAddPhoto({
        mealIndex: context.mealIndex,
        photo: pendingPhotoData.compressedData,
        filename: pendingPhotoData.filename,
        timestamp: Date.now()
      });
      // console.log('[AddProductStep] Photo confirmed and added to meal:', context.mealIndex);
      
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
    }, [pendingPhotoData, context]);
    
    // Отмена фото
    const cancelPhoto = useCallback(() => {
      haptic('light');
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
      setPhotoPreview(null);
      // console.log('[AddProductStep] Photo cancelled');
    }, []);
    
    // Открыть выбор фото
    const handlePhotoClick = useCallback(() => {
      haptic('medium');
      fileInputRef.current?.click();
    }, []);
    
    // Удаление продукта из базы
    const handleDeleteProduct = useCallback((e, product) => {
      e.stopPropagation();
      
      const name = product.name || 'продукт';
      if (!confirm(`Удалить "${name}" из базы?`)) return;
      
      haptic('medium');
      
      const U = HEYS.utils || {};
      const allProducts = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
      const pid = String(product.id ?? product.product_id ?? product.name);
      
      // Фильтруем — убираем этот продукт
      const filtered = allProducts.filter(p => {
        const id = String(p.id ?? p.product_id ?? p.name);
        return id !== pid;
      });
      
      // Сохраняем через HEYS.products или HEYS.store.set (для синхронизации с облаком)
      if (HEYS.products?.setAll) {
        HEYS.products.setAll(filtered);
      } else if (HEYS.store?.set) {
        HEYS.store.set('products', filtered);
      } else if (U.lsSet) {
        U.lsSet('heys_products', filtered);
        console.warn('[AddProductStep] ⚠️ Продукт удалён только локально (нет HEYS.store)');
      }
      
      // Обновляем context.products
      if (context?.onProductCreated) {
        // Костыль: триггерим обновление
      }
      
      // console.log('[AddProductStep] Продукт удалён:', name);
      
      // Перезапускаем поиск чтобы обновить список
      setSearch(s => s + ' ');
      setTimeout(() => setSearch(s => s.trim()), 10);
    }, [context]);

    // Рендер карточки продукта с подсветкой совпадений
    const renderProductCard = (product, showFavorite = true) => {
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isFav = favorites.has(pid);
      const kcal = Math.round(product.kcal100 || 0);
      const prot = Math.round(product.protein100 || 0);
      const carbs = Math.round((product.simple100 || 0) + (product.complex100 || 0));
      const fat = Math.round((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0));
      const harmVal = product.harm ?? product.harmScore ?? product.harm100;
      const harmBg = getHarmBg(harmVal);
      
      // Флаг: продукт из общей базы (не из личной)
      const isFromShared = product._source === 'shared' || product._fromShared;
      
      // Подсветка совпадений в названии
      const highlightedName = lc && HEYS?.SmartSearchWithTypos?.renderHighlightedText
        ? HEYS.SmartSearchWithTypos.renderHighlightedText(product.name, search, React)
        : product.name;
      
      return React.createElement('div', {
        key: pid,
        className: 'aps-product-card',
        style: harmBg ? { background: harmBg } : undefined,
        onClick: () => selectProduct(product)
      },
        // Иконка категории
        product.category && React.createElement('span', { 
          className: 'aps-product-icon' 
        }, getCategoryIcon(product.category)),
        
        // Инфо
        React.createElement('div', { className: 'aps-product-info' },
          React.createElement('div', { className: 'aps-product-name' }, 
            highlightedName,
            // 🌐 Бейдж для продуктов из общей базы
            isFromShared && React.createElement('span', {
              className: 'aps-shared-badge'
            }, '🌐')
          ),
          React.createElement('div', { className: 'aps-product-meta' },
            React.createElement('span', { className: 'aps-meta-kcal' }, kcal + ' ккал'),
            React.createElement('span', { className: 'aps-meta-sep' }, '·'),
            React.createElement('span', { className: 'aps-meta-macros' }, 
              'Б ' + prot + ' | Ж ' + fat + ' | У ' + carbs
            )
          )
        ),
        
        // Кнопка избранного — только для личных
        showFavorite && !isFromShared && React.createElement('button', {
          className: 'aps-fav-btn' + (isFav ? ' active' : ''),
          onClick: (e) => toggleFavorite(e, pid)
        }, isFav ? '★' : '☆')
      );
    };
    
    // Что показывать: результаты поиска или умный список
    const showSearch = lc.length > 0;
    
    // Счётчик фото в текущем приёме
    const currentPhotoCount = context?.mealPhotos?.length || 0;
    const photoLimit = 10;
    const canAddPhoto = currentPhotoCount < photoLimit;
    
    return React.createElement('div', { className: 'aps-search-step' },
      // Модалка подтверждения фото
      showPhotoConfirm && pendingPhotoData && React.createElement('div', { 
        className: 'photo-confirm-overlay',
        onClick: cancelPhoto
      },
        React.createElement('div', { 
          className: 'photo-confirm-modal',
          onClick: e => e.stopPropagation()
        },
          React.createElement('div', { className: 'photo-confirm-header' }, 'Сохранить это фото?'),
          React.createElement('div', { className: 'photo-confirm-preview' },
            React.createElement('img', { 
              src: pendingPhotoData.compressedData,
              alt: 'Превью фото'
            })
          ),
          React.createElement('div', { className: 'photo-confirm-info' },
            Math.round(pendingPhotoData.compressedData.length / 1024) + ' КБ'
          ),
          React.createElement('div', { className: 'photo-confirm-buttons' },
            React.createElement('button', {
              className: 'photo-confirm-btn cancel',
              onClick: cancelPhoto
            }, 'Отмена'),
            React.createElement('button', {
              className: 'photo-confirm-btn confirm',
              onClick: confirmPhoto
            }, 'Сохранить')
          )
        )
      ),
      
      // Скрытый input для выбора фото
      React.createElement('input', {
        ref: fileInputRef,
        type: 'file',
        accept: 'image/*',
        capture: 'environment', // Камера на мобильных
        style: { display: 'none' },
        onChange: handlePhotoSelect
      }),
      
      // === Фиксированная шапка: кнопки + поиск + категории ===
      React.createElement('div', { className: 'aps-fixed-header' },
        // Ряд кнопок: Добавить фото + Новый продукт
        React.createElement('div', { className: 'aps-action-buttons' },
          // Кнопка "Добавить фото" с счётчиком
          React.createElement('button', {
            className: 'aps-new-product-btn aps-photo-btn' + (!canAddPhoto ? ' disabled' : ''),
            onClick: canAddPhoto ? handlePhotoClick : null,
            disabled: !canAddPhoto,
            title: !canAddPhoto ? `Лимит ${photoLimit} фото` : 'Добавить фото'
          },
            React.createElement('span', { className: 'aps-new-icon' }, '📷'),
            React.createElement('span', null, 
              currentPhotoCount > 0 
                ? `Фото ${currentPhotoCount}/${photoLimit}` 
                : 'Добавить фото'
            )
          ),
          // Кнопка "Новый продукт"
          React.createElement('button', {
            className: 'aps-new-product-btn',
            onClick: handleNewProduct
          },
            React.createElement('span', { className: 'aps-new-icon' }, '+'),
            React.createElement('span', null, 'Новый продукт')
          )
        ),
        
        // Поле поиска
        React.createElement('div', { className: 'aps-search-container' },
          React.createElement('span', { className: 'aps-search-icon' }, '🔍'),
          React.createElement('input', {
            ref: inputRef,
            type: 'text',
            className: 'aps-search-input',
            placeholder: 'Поиск продукта...',
            value: search,
            onChange: (e) => setSearch(e.target.value),
            autoComplete: 'off',
            autoCorrect: 'off',
            spellCheck: false
          }),
          search && React.createElement('button', {
            className: 'aps-search-clear',
            onClick: () => setSearch('')
          }, '×')
        )
      ),
      
      // === Скроллируемый список продуктов ===
      React.createElement('div', { className: 'aps-products-scroll' },
        // Результаты поиска
        showSearch && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' }, 
            combinedResults.length > 0 
              ? `Найдено: ${combinedResults.length}${sharedLoading ? ' ⏳' : ''}` 
              : (sharedLoading ? '⏳ Поиск...' : 'Ничего не найдено')
          ),
          combinedResults?.length > 0 && React.createElement('div', { className: 'aps-products-list' },
            combinedResults.map(p => renderProductCard(p))
          ),
          // Пустой результат с "Возможно вы искали"
          combinedResults.length === 0 && !sharedLoading && React.createElement('div', { className: 'aps-empty' },
            React.createElement('span', null, '😕'),
            
            // "Возможно вы искали" — кликабельные альтернативы
            didYouMean.length > 0 && React.createElement('div', { 
              className: 'aps-did-you-mean',
              style: {
                marginTop: '12px',
                padding: '12px',
                backgroundColor: 'rgba(255, 213, 0, 0.1)',
                borderRadius: '8px',
                textAlign: 'left'
              }
            },
              React.createElement('div', { 
                style: { 
                  fontSize: '13px', 
                  color: 'var(--text-secondary)', 
                  marginBottom: '8px' 
                } 
              }, '💡 Возможно вы искали:'),
              React.createElement('div', { 
                style: { 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '8px' 
                } 
              },
                didYouMean.map((item, i) => 
                  React.createElement('button', {
                    key: i,
                    onClick: () => setSearch(item.text),
                    style: {
                      padding: '6px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }
                  },
                    React.createElement('span', null, item.text),
                    item.label && React.createElement('span', { 
                      style: { 
                        fontSize: '10px', 
                        color: 'var(--text-tertiary)',
                        marginLeft: '4px'
                      } 
                    }, item.label)
                  )
                )
              )
            ),
            
            !didYouMean.length && React.createElement('span', null, 'Попробуйте другой запрос'),
            
            React.createElement('button', {
              className: 'aps-add-new-btn',
              onClick: handleNewProduct,
              style: { marginTop: didYouMean.length > 0 ? '12px' : '8px' }
            }, '+ Добавить "' + search + '"')
          )
        ),
        
        // Умный список: часто + недавно используемые (объединённый)
        !showSearch && smartProducts?.length > 0 && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' }, '⚡ Ваши продукты'),
          React.createElement('div', { className: 'aps-products-list' },
            smartProducts.map(p => renderProductCard(p))
          )
        )
      )
    );
  }

  // === Компонент создания нового продукта (Шаг create) ===
  function CreateProductStep({ data, onChange, context, stepData }) {
    // Берём поисковый запрос для предзаполнения названия
    const searchQuery = stepData?.search?.searchQuery || '';
    const [pasteText, setPasteText] = useState('');
    const [error, setError] = useState('');
    const [parsedPreview, setParsedPreview] = useState(null);
    const textareaRef = useRef(null);
    
    // 🌐 Публикация в общую базу (по умолчанию включено)
    const [publishToShared, setPublishToShared] = useState(true);
    
    // Определяем тип пользователя (куратор или клиент по PIN)
    const isCurator = !!(HEYS.cloud?.getUser?.());
    
    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, closeModal, updateStepData } = stepContext;
    
    // Фокус на textarea при монтировании
    useEffect(() => {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }, []);
    
    // Парсинг вставленного текста (копия логики из heys_core_v12.js)
    const parseProductLine = useCallback((text) => {
      if (!text || !text.trim()) return null;
      
      // Регулярки из heys_core_v12.js
      const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;
      const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;
      
      // Нормализация строки
      let clean = text.replace(INVIS, ' ');
      clean = clean.replace(/\u060C/g, ',').replace(/\u066B/g, ',').replace(/\u066C/g, ',').replace(/\u201A/g, ',');
      clean = clean.replace(/\u00B7/g, '.').replace(/[–—−]/g, '-').replace(/%/g, '');
      clean = clean.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Извлекаем числа
      const tokens = clean.match(NUM_RE) || [];
      if (!tokens.length) return null;
      
      // Берём последние 12 чисел
      let last = tokens.slice(-12);
      if (last.length < 12) {
        last = Array(12 - last.length).fill('0').concat(last);
      }
      
      // Находим позицию первого числа для извлечения названия
      const toNum = (x) => {
        if (x === undefined || x === null) return 0;
        const s = String(x).trim().replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };
      
      // Поиск позиции первого токена
      let start = 0;
      let firstPos = clean.length;
      for (const tok of last) {
        const idx = clean.indexOf(tok, start);
        if (idx !== -1 && idx < firstPos) {
          firstPos = idx;
          break;
        }
        if (idx !== -1) start = idx + tok.length;
      }
      
      const name = clean.slice(0, firstPos).trim() || 'Без названия';
      const nums = last.map(toNum);
      
      // Порядок: kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = nums;
      
      // Вычисляем производные
      const carbs100 = simple + complex;
      const fat100 = bad + good + trans;
      // TEF-aware formula: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g (Atwater)
      const kcal100 = 3 * protein + 4 * carbs100 + 9 * fat100;
      
      return {
        id: Math.random().toString(36).slice(2, 10),
        name,
        simple100: simple,
        complex100: complex,
        protein100: protein,
        badFat100: bad,
        goodFat100: good,
        trans100: trans,
        fiber100: fiber,
        gi: gi,
        harmScore: harm,
        carbs100: Math.round(carbs100 * 10) / 10,
        fat100: Math.round(fat100 * 10) / 10,
        kcal100: Math.round(kcal100 * 10) / 10,
        createdAt: Date.now()
      };
    }, []);
    
    // Ref для onChange чтобы не вызывать лишние ререндеры
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    
    // При изменении текста — пытаемся распарсить (с debounce)
    useEffect(() => {
      if (!pasteText.trim()) {
        setParsedPreview(null);
        setError('');
        return;
      }
      
      // Debounce парсинга чтобы не тормозить при быстром вводе
      const timer = setTimeout(() => {
        const parsed = parseProductLine(pasteText);
        if (parsed) {
          setParsedPreview(parsed);
          setError('');
          // Сохраняем в data через ref (избегаем зависимости от onChange)
          onChangeRef.current?.(prev => ({ ...prev, newProduct: parsed }));
        } else {
          setParsedPreview(null);
          setError('Не удалось распознать данные. Формат: Название + 12 чисел.');
        }
      }, 150);
      
      return () => clearTimeout(timer);
    }, [pasteText, parseProductLine]);
    
    // Добавить продукт в базу и выбрать его
    const handleCreate = useCallback(() => {
      if (!parsedPreview) return;
      
      haptic('medium');
      
      // 1. Получаем текущую базу продуктов
      const U = HEYS.utils || {};
      const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
      
      // 🔍 Проверка на дубликат в личной базе (по fingerprint или названию)
      let existingPersonal = null;
      const newFingerprint = HEYS.models?.computeProductFingerprint?.(parsedPreview);
      
      if (newFingerprint) {
        // Ищем по fingerprint
        existingPersonal = products.find(p => {
          const fp = HEYS.models?.computeProductFingerprint?.(p);
          return fp === newFingerprint;
        });
      }
      
      if (!existingPersonal) {
        // Fallback: ищем по нормализованному названию
        const normName = (parsedPreview.name || '').trim().toLowerCase();
        existingPersonal = products.find(p => 
          (p.name || '').trim().toLowerCase() === normName
        );
      }
      
      let savedToPersonal = false;
      let savedMethod = 'none';
      
      if (existingPersonal) {
        // Продукт уже есть в личной базе — не дублируем
        console.log('[CreateProductStep] ⚠️ Продукт уже есть в личной базе:', existingPersonal.name);
        // Используем существующий для перехода на граммы
        parsedPreview.id = existingPersonal.id;
      } else {
        // Добавляем в личную базу
        const newProducts = [...products, parsedPreview];
        
        // Сохраняем через HEYS.products (React state + localStorage + cloud sync)
        if (HEYS.products?.setAll) {
          HEYS.products.setAll(newProducts);
          savedMethod = 'HEYS.products.setAll';
          savedToPersonal = true;
        } else if (HEYS.store?.set) {
          HEYS.store.set('heys_products', newProducts);
          savedMethod = 'HEYS.store.set';
          savedToPersonal = true;
        } else if (U.lsSet) {
          U.lsSet('heys_products', newProducts);
          savedMethod = 'U.lsSet (LOCAL ONLY!)';
          savedToPersonal = true;
          console.warn('[CreateProductStep] ⚠️ Продукт сохранён только локально (нет HEYS.store)');
        }
        
        console.log('[CreateProductStep] ✅ Добавлен в личную базу:', parsedPreview.name, savedMethod);
      }
      
      // 🔍 ВЕРИФИКАЦИЯ: Проверяем что продукт действительно сохранился (только если добавляли)
      if (savedToPersonal) {
        setTimeout(() => {
          const verifyProducts = HEYS.products?.getAll?.() || [];
          const found = verifyProducts.find(p => 
            p.name?.toLowerCase() === parsedPreview.name?.toLowerCase() ||
            p.id === parsedPreview.id
          );
          if (found) {
            // console.log('[CreateProductStep] ✅ VERIFIED: Продукт найден в базе после сохранения');
          } else {
            console.error('🚨 [CreateProductStep] CRITICAL: Продукт НЕ найден в базе после сохранения!', {
              productName: parsedPreview.name,
              productsCount: verifyProducts.length,
              savedMethod
            });
            // Попытка повторного сохранения
            const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
            const newProducts = [...products, parsedPreview];
            if (HEYS.products?.setAll) {
              // console.log('[CreateProductStep] 🔄 Retry save...');
              HEYS.products.setAll(newProducts);
            }
          }
        }, 500);
      }
      
      // 🔄 Пересчитываем orphan-продукты (новый продукт мог быть orphan)
      if (HEYS.orphanProducts?.recalculate) {
        HEYS.orphanProducts.recalculate();
      }
      // Также удаляем конкретно этот продукт из orphan (на случай если recalculate не сработал)
      if (HEYS.orphanProducts?.remove && parsedPreview.name) {
        HEYS.orphanProducts.remove(parsedPreview.name);
      }
      
      // 🌐 Публикация в общую базу (если включено)
      console.log('[CreateProductStep] 🔍 SHARED PUBLISH DEBUG:', {
        publishToShared,
        hasCloud: !!HEYS.cloud,
        isCurator,
        hasPublishToShared: !!HEYS.cloud?.publishToShared,
        hasCreatePending: !!HEYS.cloud?.createPendingProduct,
        hasModels: !!HEYS.models,
        hasFingerprint: !!HEYS.models?.computeProductFingerprint,
        productName: parsedPreview?.name
      });
      
      if (publishToShared && HEYS.cloud) {
        (async () => {
          try {
            console.log('[CreateProductStep] 🚀 Начинаем публикацию в shared...');
            
            // Проверяем fingerprint — есть ли уже такой продукт в shared
            if (HEYS.models?.computeProductFingerprint) {
              // ⚠️ ВАЖНО: await! computeProductFingerprint возвращает Promise
              const fingerprint = await HEYS.models.computeProductFingerprint(parsedPreview);
              console.log('[CreateProductStep] 🔑 Fingerprint:', fingerprint);
              
              if (!fingerprint) {
                console.error('[CreateProductStep] ❌ Fingerprint пустой, невозможно проверить дубликаты');
              }
              
              // Ищем по fingerprint через опции
              const existing = await HEYS.cloud.searchSharedProducts?.('', { fingerprint, limit: 1 });
              console.log('[CreateProductStep] 🔍 Поиск по fingerprint:', existing);
              
              if (existing?.data?.length > 0) {
                // Продукт уже есть — не дублируем, просто логируем
                console.log('[CreateProductStep] 🔄 Продукт уже в shared базе:', existing.data[0].name);
                return;
              }
              
              console.log('[CreateProductStep] ✅ Продукт НЕ найден в shared — можно добавлять!');
            } else {
              console.log('[CreateProductStep] ⚠️ Нет функции computeProductFingerprint, пропускаем проверку');
            }
            
            // Публикуем: куратор напрямую, клиент через pending
            console.log('[CreateProductStep] 👤 isCurator:', isCurator);
            
            if (isCurator && HEYS.cloud.publishToShared) {
              console.log('[CreateProductStep] 📤 Вызываем publishToShared...');
              const result = await HEYS.cloud.publishToShared(parsedPreview);
              console.log('[CreateProductStep] ✅ Результат publishToShared:', result);
            } else if (HEYS.cloud.createPendingProduct) {
              console.log('[CreateProductStep] 📤 Вызываем createPendingProduct...');
              // Получаем clientId из localStorage
              let clientId = localStorage.getItem('heys_client_current');
              try { clientId = JSON.parse(clientId); } catch(e) { /* already string */ }
              if (!clientId) {
                console.error('[CreateProductStep] ❌ Нет clientId для pending продукта!');
              } else {
                const result = await HEYS.cloud.createPendingProduct(clientId, parsedPreview);
                console.log('[CreateProductStep] ✅ Результат createPendingProduct:', result);
              }
            } else {
              console.log('[CreateProductStep] ❌ Нет подходящей функции для публикации!');
            }
          } catch (err) {
            console.error('[CreateProductStep] ❌ Ошибка публикации в shared:', err);
            console.error('[CreateProductStep] Stack:', err.stack);
          }
        })();
      } else {
        console.log('[CreateProductStep] ⏭️ Пропуск публикации:', { publishToShared, hasCloud: !!HEYS.cloud });
      }
      
      // 2. Вызываем callback если есть (для обновления списка в родителе)
      if (context?.onProductCreated) {
        context.onProductCreated(parsedPreview);
      }
      
      // 3. Обновляем данные текущего шага
      onChange({ 
        ...data, 
        newProduct: parsedPreview,
        selectedProduct: parsedPreview,
        grams: 100
      });
      
      // 4. ТАКЖЕ обновляем данные шага grams напрямую (чтобы GramsStep сразу видел продукт)
      if (updateStepData) {
        updateStepData('grams', { 
          selectedProduct: parsedPreview, 
          grams: 100 
        });
      }
      
      // 5. Переходим на шаг граммов (index 2)
      // Увеличен таймаут для гарантии обновления state
      if (goToStep) {
        setTimeout(() => goToStep(2, 'left'), 150);
      }
    }, [parsedPreview, data, onChange, context, goToStep, updateStepData, publishToShared, isCurator]);
    
    return React.createElement('div', { className: 'aps-create-step' },
      // Заголовок
      React.createElement('div', { className: 'aps-create-header' },
        React.createElement('span', { className: 'aps-create-icon' }, '➕'),
        React.createElement('span', { className: 'aps-create-title' }, 'Создать новый продукт')
      ),
      
      // Подсказка о поисковом запросе
      searchQuery && React.createElement('div', { className: 'aps-create-search-hint' },
        '🔍 Вы искали: ',
        React.createElement('strong', null, searchQuery)
      ),
      
      // Инструкция
      React.createElement('div', { className: 'aps-create-hint' },
        'Вставьте строку с данными продукта:',
        React.createElement('br'),
        React.createElement('span', { className: 'aps-create-format' }, 
          'Название · ккал · У · простые · сложные · Б · Ж · вред · польза · транс · клетч · ГИ · вред'
        )
      ),
      
      // Textarea для вставки
      React.createElement('textarea', {
        ref: textareaRef,
        className: 'aps-create-textarea',
        placeholder: searchQuery 
          ? `Пример: ${searchQuery}\t120\t22\t2\t20\t4\t2\t0.5\t1.5\t0\t3\t40\t0`
          : 'Пример: Овсянка на воде\t120\t22\t2\t20\t4\t2\t0.5\t1.5\t0\t3\t40\t0',
        value: pasteText,
        onChange: (e) => setPasteText(e.target.value),
        rows: 3
      }),
      
      // Ошибка
      error && React.createElement('div', { className: 'aps-create-error' }, '⚠️ ' + error),
      
      // Превью распознанного продукта
      parsedPreview && React.createElement('div', { className: 'aps-create-preview' },
        React.createElement('div', { className: 'aps-preview-title' }, '✅ Распознано:'),
        React.createElement('div', { className: 'aps-preview-name' }, parsedPreview.name),
        // Основные макросы
        React.createElement('div', { className: 'aps-preview-macros' },
          React.createElement('span', { className: 'aps-preview-kcal' }, parsedPreview.kcal100 + ' ккал'),
          React.createElement('span', null, 'Б ' + parsedPreview.protein100 + 'г'),
          React.createElement('span', null, 'Ж ' + parsedPreview.fat100 + 'г'),
          React.createElement('span', null, 'У ' + parsedPreview.carbs100 + 'г')
        ),
        // Детальная таблица всех параметров
        React.createElement('div', { className: 'aps-preview-details' },
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Углеводы простые'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.simple100 + 'г')
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Углеводы сложные'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.complex100 + 'г')
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Жиры вредные'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.badFat100 + 'г')
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Жиры полезные'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.goodFat100 + 'г')
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Транс-жиры'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.trans100 + 'г')
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Клетчатка'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.fiber100 + 'г')
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Гликемический индекс'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.gi)
          ),
          React.createElement('div', { className: 'aps-preview-row' },
            React.createElement('span', { className: 'aps-preview-label' }, 'Вредность'),
            React.createElement('span', { className: 'aps-preview-value' }, parsedPreview.harmScore)
          )
        )
      ),
      
      // 🌐 Checkbox: Опубликовать в общую базу
      parsedPreview && React.createElement('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          marginTop: '8px',
          background: 'var(--bg-secondary, #f3f4f6)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: publishToShared,
          onChange: (e) => setPublishToShared(e.target.checked),
          style: { width: '18px', height: '18px', accentColor: '#22c55e' }
        }),
        React.createElement('span', null, '🌐 Опубликовать в общую базу'),
        React.createElement('span', { 
          style: { fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginLeft: 'auto' }
        }, isCurator ? 'сразу доступен всем' : 'на модерацию')
      ),
      
      // Кнопка добавить
      React.createElement('button', {
        className: 'aps-create-btn' + (parsedPreview ? ' active' : ''),
        onClick: handleCreate,
        disabled: !parsedPreview
      },
        parsedPreview 
          ? '✓ Добавить «' + parsedPreview.name.slice(0, 20) + (parsedPreview.name.length > 20 ? '...' : '') + '»'
          : 'Вставьте данные продукта'
      ),
      
      // Подсказка про формат
      React.createElement('div', { className: 'aps-create-tip' },
        '💡 Скопируйте строку из таблицы Google Sheets или Excel. Поддерживаются запятые и точки.'
      )
    );
  }

  // Фон карточки по полезности: 0=зелёный(полезный), 5=голубой(средний), 10=красный(вредный)
  function getHarmBg(h) {
    if (h == null) return null;
    // h: 0=полезный, 5=средний, 10=вредный
    // Светлые оттенки для хорошей читаемости текста
    if (h <= 1) return '#d1fae5';  // 0-1: светло-мятный — полезный (emerald-100)
    if (h <= 2) return '#d1fae5';  // 2: светло-мятный
    if (h <= 3) return '#ecfdf5';  // 3: очень светлый мятный (emerald-50)
    if (h <= 4) return '#f0fdf4';  // 4: почти белый с зеленцой (green-50)
    if (h <= 5) return '#e0f2fe';  // 5: светло-голубой — средний
    if (h <= 6) return '#f0f9ff';  // 6: очень светлый голубой
    if (h <= 7) return '#fef2f2';  // 7: очень светло-розовый (red-50)
    if (h <= 8) return '#fee2e2';  // 8: светло-розовый (red-100)
    if (h <= 9) return '#fecaca';  // 9: розовый (red-200)
    return '#fca5a5';              // 10: красноватый (red-300) — вредный
  }

  // Иконка категории (копия из heys_day_v12.js)
  function getCategoryIcon(cat) {
    if (!cat) return '🍽️';
    const c = cat.toLowerCase();
    if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
    if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
    if (c.includes('рыб') || c.includes('морепр')) return '🐟';
    if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
    if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
    if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
    if (c.includes('яйц')) return '🥚';
    if (c.includes('орех') || c.includes('семеч')) return '🥜';
    if (c.includes('масл')) return '🫒';
    if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
    if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
    if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
    return '🍽️';
  }

  // === Компонент выбора граммов (Шаг 2) ===
  function GramsStep({ data, onChange, context, stepData }) {
    // Продукт берём: 1) из context (для edit mode), 2) из своих данных, 3) из create (newProduct или selectedProduct), 4) из search
    // ВАЖНО: stepData?.create проверяется т.к. при создании нового продукта data.selectedProduct может не успеть обновиться
    const product = context?.editProduct 
      || data.selectedProduct 
      || stepData?.create?.newProduct 
      || stepData?.create?.selectedProduct 
      || stepData?.search?.selectedProduct;
    const lastGrams = stepData?.search?.lastGrams || stepData?.create?.lastGrams; // Последние использованные
    const grams = data.grams || context?.editGrams || stepData?.create?.grams || stepData?.search?.grams || 100;
    
    // Режим ввода: grams или kcal
    const [inputMode, setInputMode] = useState('grams');
    const [kcalInput, setKcalInput] = useState('');
    const gramsInputRef = useRef(null);
    
    // ВАЖНО: Значения продукта с fallback для ситуации когда product ещё не загружен
    const kcal100 = product?.kcal100 || 0;
    const protein100 = product?.protein100 || 0;
    const carbs100 = (product?.simple100 || 0) + (product?.complex100 || 0);
    const fat100 = (product?.badFat100 || 0) + (product?.goodFat100 || 0) + (product?.trans100 || 0);
    
    // Расчёт на текущую порцию (safe with fallbacks)
    const currentKcal = Math.round(kcal100 * grams / 100);
    const currentProt = Math.round(protein100 * grams / 100);
    const currentCarbs = Math.round(carbs100 * grams / 100);
    const currentFat = Math.round(fat100 * grams / 100);
    
    // === ВСЕ ХУКИ ДОЛЖНЫ БЫТЬ ДО ЛЮБОГО RETURN ===
    
    // Авто-порции продукта
    const portions = useMemo(() => {
      if (!product) return [{ name: '100г', grams: 100 }];
      if (product.portions && product.portions.length) {
        return product.portions;
      }
      // Авто-порции по названию (передаём строку, не объект!)
      return HEYS.models?.getAutoPortions?.(product.name) || [
        { name: '50г', grams: 50 },
        { name: '100г', grams: 100 },
        { name: '150г', grams: 150 },
        { name: '200г', grams: 200 }
      ];
    }, [product]);
    
    // Обновление граммов
    const setGrams = useCallback((newGrams) => {
      const val = Math.max(1, Math.min(2000, Number(newGrams) || 100));
      // Debug: log only if value doesn't change as expected
      if (data?.grams && data.grams !== val && Math.abs(data.grams - val) > 1) {
        console.warn('[GramsStep] ⚠️ Unexpected grams change:', { from: data.grams, to: val, input: newGrams });
      }
      onChange({ ...data, grams: val });
    }, [data, onChange]);
    
    // Расчёт граммов из ккал
    const setKcalAndCalcGrams = useCallback((kcalStr) => {
      setKcalInput(kcalStr);
      const kcal = Number(kcalStr) || 0;
      if (kcal > 0 && kcal100 > 0) {
        const calcGrams = Math.round(kcal / kcal100 * 100);
        const val = Math.max(1, Math.min(2000, calcGrams));
        onChange({ ...data, grams: val });
      }
    }, [data, onChange, kcal100]);
    
    // Считаем сумму ккал за день
    const { dateKey, mealIndex } = context || {};
    const dayTotalKcal = useMemo(() => {
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
      let total = 0;
      (dayData.meals || []).forEach(m => {
        (m.items || []).forEach(it => {
          const g = it.grams || 100;
          const pid = it.product_id || it.name;
          const prod = (context?.products || []).find(p => (p.id || p.name) === pid);
          if (prod) total += (prod.kcal100 || 0) * g / 100;
        });
      });
      return Math.round(total);
    }, [dateKey, context?.products]);
    
    // Норма ккал из профиля
    const dailyGoal = useMemo(() => {
      const profile = lsGet('heys_profile', {});
      return profile.optimum || profile.tdee || 1800;
    }, []);
    
    // === ТЕПЕРЬ МОЖНО ДЕЛАТЬ EARLY RETURN ===
    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала выберите продукт'
      );
    }
    
    // Быстрые кнопки порций
    const quickPortions = [50, 100, 150, 200, 300];
    
    // Фон хедера по вредности
    const harmVal = product.harm ?? product.harmScore ?? product.harm100;
    const harmBg = getHarmBg(harmVal);
    
    return React.createElement('div', { className: 'aps-grams-step' },
      // Название продукта
      React.createElement('div', { 
        className: 'aps-product-header',
        style: harmBg ? { background: harmBg, borderColor: harmBg } : undefined
      },
        product.category && React.createElement('span', { className: 'aps-product-icon-lg' }, 
          getCategoryIcon(product.category)
        ),
        React.createElement('div', { className: 'aps-product-title' }, product.name)
      ),
      
      // Подсказка про последние граммы
      lastGrams && React.createElement('div', { className: 'aps-last-grams-hint' },
        React.createElement('span', null, 'В прошлый раз: '),
        React.createElement('button', {
          className: 'aps-last-grams-btn',
          onClick: () => setGrams(lastGrams)
        }, lastGrams + 'г')
      ),
      
      // === HERO: Большой input (граммы или ккал в зависимости от режима) ===
      React.createElement('div', { className: 'aps-grams-hero' },
        React.createElement('button', {
          className: 'aps-grams-hero-btn',
          onClick: () => inputMode === 'grams' 
            ? setGrams(grams - 10)
            : setKcalAndCalcGrams(Math.max(10, (Number(kcalInput) || 0) - 10))
        }, '−'),
        React.createElement('div', { className: 'aps-grams-hero-field' },
          React.createElement('input', {
            ref: gramsInputRef,
            type: 'number',
            className: 'aps-grams-hero-input',
            value: inputMode === 'grams' ? grams : kcalInput,
            onChange: (e) => inputMode === 'grams' 
              ? setGrams(e.target.value)
              : setKcalAndCalcGrams(e.target.value),
            onFocus: (e) => e.target.select(),
            onClick: (e) => e.target.select(),
            inputMode: 'numeric',
            min: 1,
            max: inputMode === 'grams' ? 2000 : 5000
          })
        ),
        React.createElement('button', {
          className: 'aps-grams-hero-btn',
          onClick: () => inputMode === 'grams'
            ? setGrams(grams + 10)
            : setKcalAndCalcGrams((Number(kcalInput) || 0) + 10)
        }, '+')
      ),
      
      // Подпись под инпутом (грамм / ккал)
      React.createElement('div', { className: 'aps-grams-hero-label' },
        inputMode === 'grams' ? 'грамм' : 'ккал'
      ),
      
      // Вторичная информация (калории или граммы)
      React.createElement('div', { className: 'aps-kcal-secondary' },
        React.createElement('span', { className: 'aps-kcal-secondary-value' }, 
          inputMode === 'grams' ? (currentKcal + ' ккал') : ('= ' + grams + 'г')
        )
      ),
      
      // БЖУ
      React.createElement('div', { className: 'aps-macros' },
        React.createElement('div', { className: 'aps-macro' },
          React.createElement('span', { className: 'aps-macro-label' }, 'Б'),
          React.createElement('span', { className: 'aps-macro-value' }, currentProt + 'г')
        ),
        React.createElement('div', { className: 'aps-macro' },
          React.createElement('span', { className: 'aps-macro-label' }, 'Ж'),
          React.createElement('span', { className: 'aps-macro-value' }, currentFat + 'г')
        ),
        React.createElement('div', { className: 'aps-macro' },
          React.createElement('span', { className: 'aps-macro-label' }, 'У'),
          React.createElement('span', { className: 'aps-macro-value' }, currentCarbs + 'г')
        )
      ),
      
      // === БОЛЬШАЯ КНОПКА ДОБАВИТЬ/ИЗМЕНИТЬ ===
      React.createElement('button', {
        className: 'aps-add-hero-btn',
        onClick: () => {
          if (product && grams > 0) {
            // Режим редактирования — вызываем onSave
            if (context?.isEditMode && context?.onSave) {
              context.onSave({
                mealIndex: context.mealIndex,
                itemId: context.itemId,
                grams
              });
            } 
            // Режим добавления — вызываем onAdd
            else if (context?.onAdd) {
              // Sanity check: warn if grams values are inconsistent
              if (grams !== data?.grams && data?.grams && data.grams !== 100) {
                console.warn('[GramsStep] ⚠️ grams mismatch on submit:', { final: grams, dataGrams: data.grams });
              }
              const hasNutrients = !!(product?.kcal100 || product?.protein100 || product?.carbs100);
              // console.log('[GramsStep] onAdd called:', product?.name, 'grams:', grams, {...});
              if (!hasNutrients) {
                console.error('🚨 [GramsStep] CRITICAL: Sending product with NO nutrients!', {
                  product,
                  stepData,
                  contextEditProduct: context?.editProduct,
                  dataSelectedProduct: data?.selectedProduct
                });
              }
              
              context.onAdd({
                product,
                grams,
                mealIndex: context.mealIndex
              });
              
              // 🔔 Dispatch event для advice module
              window.dispatchEvent(new CustomEvent('heysProductAdded', { 
                detail: { product, grams } 
              }));
            }
            
            // Закрыть модалку
            if (HEYS.StepModal?.hide) {
              HEYS.StepModal.hide({ scrollToDiary: true });
            }
          }
        },
        style: {
          display: 'block',
          width: '100%',
          padding: '16px',
          marginTop: '16px',
          marginBottom: '16px',
          fontSize: '18px',
          fontWeight: '600',
          color: '#fff',
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          border: 'none',
          borderRadius: '12px',
          boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
          cursor: 'pointer'
        }
      }, context?.isEditMode ? '✓ Изменить' : '✓ Добавить'),
      
      // Переключатель режима: граммы / ккал
      React.createElement('div', { className: 'aps-input-mode-toggle' },
        React.createElement('button', {
          className: 'aps-mode-btn' + (inputMode === 'grams' ? ' active' : ''),
          onClick: () => setInputMode('grams')
        }, '⚖️ Граммы'),
        React.createElement('button', {
          className: 'aps-mode-btn' + (inputMode === 'kcal' ? ' active' : ''),
          onClick: () => setInputMode('kcal')
        }, '🔥 Ккал')
      ),
      
      // Слайдер (только в режиме граммов)
      inputMode === 'grams' && React.createElement('input', {
        type: 'range',
        className: 'aps-grams-slider',
        min: 10,
        max: 500,
        step: 5,
        value: Math.min(500, grams),
        onChange: (e) => setGrams(Number(e.target.value)),
        onTouchStart: (e) => e.stopPropagation(),
        onTouchEnd: (e) => e.stopPropagation(),
        onTouchMove: (e) => e.stopPropagation()
      }),
      
      // Быстрые кнопки
      React.createElement('div', { className: 'aps-quick-grams' },
        quickPortions.map(g => 
          React.createElement('button', {
            key: g,
            className: 'aps-quick-btn' + (grams === g ? ' active' : ''),
            onClick: () => setGrams(g)
          }, g + 'г')
        )
      ),
      
      // Порции продукта
      portions?.length > 0 && React.createElement('div', { className: 'aps-portions' },
        React.createElement('div', { className: 'aps-portions-title' }, 'Порции:'),
        React.createElement('div', { className: 'aps-portions-list' },
          portions.map((p, i) => 
            React.createElement('button', {
              key: i,
              className: 'aps-portion-btn' + (grams === p.grams ? ' active' : ''),
              onClick: () => setGrams(p.grams)
            }, p.name + (p.name.includes('г') ? '' : ` (${p.grams}г)`))
          )
        )
      ),
      
      // Итог дня: +ккал → всего/норма (%)
      React.createElement('div', { className: 'aps-day-total' },
        React.createElement('span', { className: 'aps-day-plus' }, '+' + currentKcal + ' ккал'),
        React.createElement('span', { className: 'aps-day-arrow' }, ' → '),
        React.createElement('span', { className: 'aps-day-sum' }, 
          (dayTotalKcal + currentKcal) + '/' + dailyGoal
        ),
        React.createElement('span', { className: 'aps-day-pct' }, 
          ' (' + Math.round((dayTotalKcal + currentKcal) / dailyGoal * 100) + '%)'
        )
      )
    );
  }

  // === Главная функция показа модалки ===
  function showAddProductModal(options = {}) {
    const { 
      mealIndex = 0, 
      products: providedProducts,
      dateKey = new Date().toISOString().slice(0, 10),
      onAdd,
      onAddPhoto, // Callback для добавления фото к приёму
      onNewProduct,
      onClose 
    } = options;
    
    // Всегда берём актуальные продукты из хранилища (providedProducts может быть устаревшим)
    const U = HEYS.utils || {};
    
    // Берём из первого непустого источника с fallback chain
    const fromHeysProducts = HEYS.products?.getAll?.() || [];
    const fromStore = HEYS.store?.get?.('heys_products', []) || [];
    const fromLsGet = U.lsGet?.('heys_products', []) || [];
    
    let products = [];
    if (fromHeysProducts.length > 0) {
      products = fromHeysProducts;
    } else if (fromStore.length > 0) {
      products = fromStore;
    } else if (fromLsGet.length > 0) {
      products = fromLsGet;
    }
    
    // Mutable ref для обновления продуктов после создания
    let currentProducts = [...products];
    
    if (!HEYS.StepModal) {
      console.error('[AddProductStep] StepModal not loaded');
      return;
    }
    
    HEYS.StepModal.show({
      steps: [
        {
          id: 'search',
          title: '',
          hint: '',
          icon: '',
          component: ProductSearchStep,
          getInitialData: () => ({ selectedProduct: null, grams: 100 }),
          validate: (data) => !!data?.selectedProduct
        },
        {
          id: 'create',
          title: 'Новый продукт',
          hint: 'Вставьте строку с макросами',
          icon: '➕',
          component: CreateProductStep,
          validate: () => true,
          hidden: true, // Скрытый шаг — не отображается в progress dots
          hideHeaderNext: true // Скрываем "Далее" — есть своя кнопка "Добавить"
        },
        {
          id: 'grams',
          title: '',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data, stepData) => (data?.grams || stepData?.search?.grams || 0) > 0,
          hideHeaderNext: true // Скрываем кнопку в хедере — есть большая зелёная кнопка внизу
        }
      ],
      context: { 
        products: currentProducts, 
        dateKey, 
        mealIndex, 
        onNewProduct,
        onAdd, // Передаём callback для добавления в приём пищи
        onAddPhoto, // Callback для добавления фото к приёму
        headerRight: `🗃️ ${currentProducts.length}`, // Счётчик продуктов справа в header
        // Callback при создании продукта — обновляем список (не используется при 2 шагах, оставляем для совместимости)
        onProductCreated: (product) => {
          currentProducts = [...currentProducts, product];
        }
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
      allowSwipe: false,
      hidePrimaryOnFirst: true,
      finishLabel: 'Добавить', // Кнопка на последнем шаге
      title: '', // Убрали — и так очевидно
      onComplete: (stepData) => {
        // console.log('[AddProductStep] onComplete stepData:', stepData);
        
        // Данные шагов
        const searchData = stepData.search || {};
        const gramsData = stepData.grams || {};
        const createData = stepData.create || {};
        
        // Приоритет: продукт из grams (последний шаг), затем create (новый продукт), затем search
        // ВАЖНО: create проверяется перед search, т.к. при создании нового продукта 
        // stepData.grams может не успеть обновиться из-за React batching
        // newProduct — это поле которое всегда устанавливается при создании
        const selectedProduct = gramsData.selectedProduct 
          || createData.newProduct 
          || createData.selectedProduct 
          || searchData.selectedProduct;
        const grams = gramsData.grams || createData.grams || searchData.grams || 100;
        
        // console.log('[AddProductStep] selectedProduct:', selectedProduct?.name, 'grams:', grams);
        
        if (selectedProduct && grams) {
          onAdd?.({
            product: selectedProduct,
            grams: grams,
            mealIndex
          });
          
          // 🔔 Dispatch event для advice module
          window.dispatchEvent(new CustomEvent('heysProductAdded', { 
            detail: { product: selectedProduct, grams } 
          }));
        }
      },
      onClose
    });
  }

  // === Функция редактирования граммов (для карточки продукта) ===
  function showEditGramsModal(options = {}) {
    const { 
      product,
      currentGrams = 100,
      mealIndex = 0,
      itemId,
      dateKey = new Date().toISOString().slice(0, 10),
      onSave,
      onClose 
    } = options;
    
    if (!product) {
      console.error('[EditGramsModal] No product provided');
      return;
    }
    
    if (!HEYS.StepModal) {
      console.error('[EditGramsModal] StepModal not loaded');
      return;
    }
    
    HEYS.StepModal.show({
      steps: [
        {
          id: 'grams',
          title: product?.name || 'Граммы',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data) => (data?.grams || 0) > 0,
          hideHeaderNext: true, // Скрываем кнопку в хедере — используем большую кнопку внизу
          getInitialData: (ctx) => ({
            grams: ctx?.editGrams || currentGrams || 100,
            selectedProduct: ctx?.editProduct || product
          })
        }
      ],
      context: { 
        products: [], 
        dateKey, 
        mealIndex,
        itemId,
        isEditMode: true,
        editProduct: product,   // Продукт через context — доступен сразу
        editGrams: currentGrams, // Граммы через context
        onSave  // Callback для сохранения — используется большой кнопкой
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: false,
      allowSwipe: false,
      finishLabel: 'Сохранить', // Редактирование — "Сохранить"
      title: '',
      onComplete: (stepData) => {
        const gramsData = stepData.grams || {};
        const grams = gramsData.grams || currentGrams;
        
        if (grams > 0) {
          onSave?.({
            mealIndex,
            itemId,
            grams
          });
        }
      },
      onClose
    });
  }

  // === Экспорт ===
  HEYS.AddProductStep = {
    show: showAddProductModal,
    showEditGrams: showEditGramsModal,
    ProductSearchStep,
    GramsStep,
    CreateProductStep,
    getCategoryIcon,
    computeSmartProducts
  };

  // console.log('[HEYS] AddProductStep v1 loaded');

})(typeof window !== 'undefined' ? window : global);
