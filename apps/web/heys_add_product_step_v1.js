// heys_add_product_step_v1.js — Шаг добавления продукта через StepModal
// Двухшаговый flow: поиск → граммы/порции
(function (global) {
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

  const getAutoPortions = (productName) => {
    if (!productName) return [];
    return HEYS.models?.getAutoPortions?.(productName) || [];
  };

  const normalizePortions = (list) => {
    if (!Array.isArray(list)) return [];
    return list
      .map((p) => ({
        name: String(p?.name || '').trim(),
        grams: Number(p?.grams || 0)
      }))
      .filter((p) => p.name && p.grams > 0);
  };

  const saveProductPortions = (product, portions) => {
    if (!product || !Array.isArray(portions)) return;
    const U = HEYS.utils || {};
    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
    const pid = String(product.id ?? product.product_id ?? product.name);
    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);

    if (idx === -1) return;

    const updated = {
      ...products[idx],
      portions
    };

    const nextProducts = [...products];
    nextProducts[idx] = updated;

    if (HEYS.products?.setAll) {
      HEYS.products.setAll(nextProducts);
    } else if (HEYS.store?.set) {
      HEYS.store.set('heys_products', nextProducts);
    } else if (U.lsSet) {
      U.lsSet('heys_products', nextProducts);
    }
  };

  const isCuratorUser = () => !!HEYS.cloud?.getUser?.();

  const isSharedProduct = (product) => {
    if (!product) return false;
    return !!(product._fromShared || product._source === 'shared' || product.is_shared);
  };

  const canEditProduct = (product) => {
    if (!product) return false;
    if (!isSharedProduct(product)) return true;
    return isCuratorUser() || !!product.is_mine;
  };

  const notifyPortionsUpdated = (product, portions) => {
    if (!product) return;
    window.dispatchEvent(new CustomEvent('heys:product-portions-updated', {
      detail: {
        productId: product.id ?? product.product_id ?? product.name,
        product,
        portions: Array.isArray(portions) ? portions : []
      }
    }));
  };

  const updateSharedProductPortions = async (productId, portions) => {
    if (!HEYS?.YandexAPI?.rest) {
      HEYS.Toast?.warning('API недоступен для обновления') || alert('API недоступен для обновления');
      return { ok: false };
    }

    try {
      const { error } = await HEYS.YandexAPI.rest('shared_products', {
        method: 'PATCH',
        data: { portions },
        filters: { 'eq.id': productId },
        select: 'id,portions'
      });

      if (error) {
        HEYS.Toast?.error('Ошибка обновления: ' + error) || alert('Ошибка обновления: ' + error);
        return { ok: false };
      }

      HEYS.Toast?.success('Порции обновлены') || alert('Порции обновлены');
      return { ok: true };
    } catch (e) {
      const msg = e?.message || 'Ошибка обновления';
      HEYS.Toast?.error(msg) || alert(msg);
      return { ok: false };
    }
  };

  const openProductPortionsEditor = (product) => {
    console.log('[openProductPortionsEditor] called with product:', product);
    if (!product) {
      console.log('[openProductPortionsEditor] no product, returning');
      return;
    }
    if (!HEYS?.StepModal || !HEYS?.AddProductStep?.PortionsStep) {
      console.log('[openProductPortionsEditor] StepModal or PortionsStep missing');
      HEYS.Toast?.warning('Модалка порций недоступна') || alert('Модалка порций недоступна');
      return;
    }

    if (!canEditProduct(product)) {
      console.log('[openProductPortionsEditor] canEditProduct returned false');
      HEYS.Toast?.warning('Нет доступа к редактированию') || alert('Нет доступа к редактированию');
      return;
    }

    console.log('[openProductPortionsEditor] calling HEYS.StepModal.show');
    HEYS.StepModal.show({
      steps: [
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Настройте порции',
          icon: '🥣',
          component: HEYS.AddProductStep.PortionsStep,
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
          const normalized = normalizePortions(portions || []);
          const updatedProduct = {
            ...product,
            ...(normalized.length > 0 ? { portions: normalized } : {})
          };

          if (isSharedProduct(product)) {
            const result = await updateSharedProductPortions(product.id, normalized);
            if (result.ok) {
              notifyPortionsUpdated(updatedProduct, normalized);
            }
            return;
          }

          saveProductPortions(updatedProduct, normalized);
          notifyPortionsUpdated(updatedProduct, normalized);
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
      let unwatchProducts = () => { };
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
        } catch (e) { }
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
                harm: (HEYS.models?.normalizeHarm?.(p) ?? Number(p.harm ?? p.harmScore ?? p.harmscore ?? 0)) || 0,  // Canonical harm field
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
      // Автопереход на шаг граммов (index 4: search → grams)
      // Шаги create/portions/harm — только для НОВЫХ продуктов
      // Увеличен таймаут для гарантии обновления state
      if (goToStep) {
        setTimeout(() => goToStep(4, 'left'), 150);
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

    const MISSING_FIELD_LABELS = {
      kcal100: 'Ккал',
      carbs100: 'Углеводы',
      simple100: 'Простые',
      complex100: 'Сложные',
      protein100: 'Белок',
      fat100: 'Жиры',
      badFat100: 'Вредные жиры',
      goodFat100: 'Полезные жиры',
      trans100: 'Транс-жиры',
      fiber100: 'Клетчатка',
      gi: 'ГИ',
      harm: 'Вред'
    };

    const countExtendedFields = useCallback((product) => {
      if (!product) return 0;
      const fields = [
        'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
        'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
        'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
        'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
      ];

      return fields.reduce((count, field) => {
        const value = product[field];
        if (Array.isArray(value)) return value.length > 0 ? count + 1 : count;
        if (typeof value === 'boolean') return count + 1;
        return value != null ? count + 1 : count;
      }, 0);
    }, []);

    const formatMissingFields = useCallback((fields) => {
      return fields
        .map((field) => MISSING_FIELD_LABELS[field] || field)
        .join(', ');
    }, []);

    const PREVIEW_FIELDS = useMemo(() => ([
      { key: 'kcal100', label: 'Ккал (100г)', unit: 'ккал' },
      { key: 'carbs100', label: 'Углеводы (100г)', unit: 'г' },
      { key: 'simple100', label: 'Простые (100г)', unit: 'г' },
      { key: 'complex100', label: 'Сложные (100г)', unit: 'г' },
      { key: 'protein100', label: 'Белок (100г)', unit: 'г' },
      { key: 'fat100', label: 'Жиры (100г)', unit: 'г' },
      { key: 'badFat100', label: 'Вредные жиры (100г)', unit: 'г' },
      { key: 'goodFat100', label: 'Полезные жиры (100г)', unit: 'г' },
      { key: 'trans100', label: 'Транс-жиры (100г)', unit: 'г' },
      { key: 'fiber100', label: 'Клетчатка (100г)', unit: 'г' },
      { key: 'gi', label: 'ГИ' },
      { key: 'harm', label: 'Вред' },
      { key: 'sodium100', label: 'Натрий (100г)', unit: 'мг' },
      { key: 'omega3_100', label: 'Омега-3 (100г)', unit: 'г' },
      { key: 'omega6_100', label: 'Омега-6 (100г)', unit: 'г' },
      { key: 'nova_group', label: 'NOVA группа' },
      { key: 'additives', label: 'Добавки' },
      { key: 'nutrient_density', label: 'Нутр. плотность', unit: '%' },
      { key: 'is_organic', label: 'Органик', type: 'bool' },
      { key: 'is_whole_grain', label: 'Цельнозерн.', type: 'bool' },
      { key: 'is_fermented', label: 'Ферментир.', type: 'bool' },
      { key: 'is_raw', label: 'Сырой', type: 'bool' },
      { key: 'vitamin_a', label: 'Витамин A', unit: '%' },
      { key: 'vitamin_c', label: 'Витамин C', unit: '%' },
      { key: 'vitamin_d', label: 'Витамин D', unit: '%' },
      { key: 'vitamin_e', label: 'Витамин E', unit: '%' },
      { key: 'vitamin_k', label: 'Витамин K', unit: '%' },
      { key: 'vitamin_b1', label: 'Витамин B1', unit: '%' },
      { key: 'vitamin_b2', label: 'Витамин B2', unit: '%' },
      { key: 'vitamin_b3', label: 'Витамин B3', unit: '%' },
      { key: 'vitamin_b6', label: 'Витамин B6', unit: '%' },
      { key: 'vitamin_b9', label: 'Витамин B9', unit: '%' },
      { key: 'vitamin_b12', label: 'Витамин B12', unit: '%' },
      { key: 'calcium', label: 'Кальций', unit: '%' },
      { key: 'iron', label: 'Железо', unit: '%' },
      { key: 'magnesium', label: 'Магний', unit: '%' },
      { key: 'phosphorus', label: 'Фосфор', unit: '%' },
      { key: 'potassium', label: 'Калий', unit: '%' },
      { key: 'zinc', label: 'Цинк', unit: '%' },
      { key: 'selenium', label: 'Селен', unit: '%' },
      { key: 'iodine', label: 'Йод', unit: '%' }
    ]), []);

    const formatPreviewValue = useCallback((product, field) => {
      if (!product) return '—';
      const value = product[field.key];
      if (field.type === 'bool') {
        if (value === true) return 'да';
        if (value === false) return 'нет';
        return '—';
      }
      if (Array.isArray(value)) {
        return value.length ? value.join(', ') : '—';
      }
      if (value === null || value === undefined || value === '') return '—';
      const suffix = field.unit ? ` ${field.unit}` : '';
      return `${value}${suffix}`;
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

      // Порядок: kcal, carbs (total), simple, complex, protein, fat (total), bad, good, trans, fiber, gi, harm
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = nums;

      // Вычисляем производные (приоритет totals из 12 полей)
      const derivedCarbs = (Number.isFinite(carbs) && carbs > 0) ? carbs : (simple + complex);
      const derivedFat = (Number.isFinite(fat) && fat > 0) ? fat : (bad + good + trans);
      // TEF-aware formula: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g (Atwater)
      const kcal100 = 3 * protein + 4 * derivedCarbs + 9 * derivedFat;

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
        harm: harm,  // Canonical harm field
        carbs100: Math.round(derivedCarbs * 10) / 10,
        fat100: Math.round(derivedFat * 10) / 10,
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
        const looksLikeAi = /[:=]/.test(pasteText) && /[а-яa-z]/i.test(pasteText);
        const aiParsed = HEYS.models?.parseAIProductString
          ? HEYS.models.parseAIProductString(pasteText, { defaultName: searchQuery || 'Без названия' })
          : null;

        if (looksLikeAi && aiParsed?.product) {
          if (aiParsed.missingFields?.length) {
            setParsedPreview(null);
            setError('Не хватает полей: ' + formatMissingFields(aiParsed.missingFields));
            return;
          }
          setParsedPreview(aiParsed.product);
          setError('');
          onChangeRef.current?.(prev => ({ ...prev, newProduct: aiParsed.product }));
          return;
        }

        const parsed = parseProductLine(pasteText);
        if (parsed) {
          setParsedPreview(parsed);
          setError('');
          onChangeRef.current?.(prev => ({ ...prev, newProduct: parsed }));
        } else if (looksLikeAi) {
          setParsedPreview(null);
          setError('Не удалось распознать AI-строку. Проверьте формат с ключами.');
        } else {
          setParsedPreview(null);
          setError('Не удалось распознать данные. Формат: Название + 12 чисел.');
        }
      }, 150);

      return () => clearTimeout(timer);
    }, [pasteText, parseProductLine, searchQuery, formatMissingFields]);

    // Подготовить продукт и перейти на шаг вредности (БЕЗ СОХРАНЕНИЯ В БАЗУ!)
    // Сохранение происходит ПОСЛЕ подтверждения вредности в HarmSelectStep
    const handleCreate = useCallback(() => {
      if (!parsedPreview) return;

      haptic('medium');

      console.log('[CreateProductStep] 📝 Подготовлен продукт:', parsedPreview.name);
      console.log('[CreateProductStep] ⏭️ Переходим на шаг порций (сохранение будет после вредности)');

      // 1. Обновляем данные текущего шага (БЕЗ сохранения в базу!)
      onChange({
        ...data,
        newProduct: parsedPreview,
        selectedProduct: parsedPreview,
        grams: 100
      });

      // 4. ТАКЖЕ обновляем данные шага harm и grams (чтобы сразу видели продукт)
      if (updateStepData) {
        updateStepData('harm', {
          product: parsedPreview
        });
        updateStepData('grams', {
          selectedProduct: parsedPreview,
          grams: 100
        });
      }

      // 5. Переходим на шаг порций (index 2) перед подтверждением вредности
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
          'Название: …\nКкал: …\nУглеводы: …\nПростые: …\nСложные: …\nБелок: …\nЖиры: …\nВредные жиры: …\nПолезные жиры: …\nТранс-жиры: …\nКлетчатка: …\nГИ: …\nВред: …'
        )
      ),

      // Textarea для вставки
      React.createElement('textarea', {
        ref: textareaRef,
        className: 'aps-create-textarea',
        placeholder: searchQuery
          ? `Название: ${searchQuery}\nКкал: 120\nУглеводы: 22\nПростые: 2\nСложные: 20\nБелок: 4\nЖиры: 2\nВредные жиры: 0.5\nПолезные жиры: 1.5\nТранс-жиры: 0\nКлетчатка: 3\nГИ: 40\nВред: 0`
          : 'Название: Овсянка на воде\nКкал: 120\nУглеводы: 22\nПростые: 2\nСложные: 20\nБелок: 4\nЖиры: 2\nВредные жиры: 0.5\nПолезные жиры: 1.5\nТранс-жиры: 0\nКлетчатка: 3\nГИ: 40\nВред: 0',
        value: pasteText,
        onChange: (e) => setPasteText(e.target.value),
        rows: 8
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
          PREVIEW_FIELDS.map((field) => React.createElement('div', { className: 'aps-preview-row', key: field.key },
            React.createElement('span', { className: 'aps-preview-label' }, field.label),
            React.createElement('span', { className: 'aps-preview-value' }, formatPreviewValue(parsedPreview, field))
          ))
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

  // === Компонент выбора порций (Шаг portions) ===
  function PortionsStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;

    // Ищем продукт из всех возможных источников
    const product = context?.editProduct
      || stepData?.grams?.selectedProduct  // Продукт с шага граммов
      || stepData?.search?.selectedProduct // Продукт с шага поиска
      || stepData?.create?.newProduct
      || stepData?.create?.selectedProduct
      || stepData?.portions?.product
      || data?.selectedProduct;

    const autoPortions = useMemo(() => getAutoPortions(product?.name), [product?.name]);

    const toEditablePortions = useCallback((list) => {
      const base = Array.isArray(list) ? list : [];
      return base.map((p) => ({
        name: String(p?.name || ''),
        grams: p?.grams ?? ''
      }));
    }, []);

    const [portions, setPortions] = useState(() => {
      if (product?.portions?.length) return toEditablePortions(product.portions);
      if (autoPortions?.length) return toEditablePortions(autoPortions);
      return [];
    });
    const [error, setError] = useState('');

    useEffect(() => {
      if (!product) return;
      if (portions.length > 0) return;

      if (product?.portions?.length) {
        setPortions(toEditablePortions(product.portions));
        return;
      }

      if (autoPortions?.length) {
        setPortions(toEditablePortions(autoPortions));
      }
    }, [product, autoPortions, portions.length, toEditablePortions]);

    const handleAddPortion = useCallback(() => {
      haptic('light');
      setPortions((prev) => [...prev, { name: '', grams: '' }]);
    }, []);

    const handleRemovePortion = useCallback((index) => {
      haptic('light');
      setPortions((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleUpdatePortion = useCallback((index, field, value) => {
      setPortions((prev) => prev.map((p, i) => {
        if (i !== index) return p;
        return {
          ...p,
          [field]: value
        };
      }));
    }, []);

    const handleApplyAuto = useCallback(() => {
      if (!autoPortions?.length) return;
      haptic('light');
      setPortions(toEditablePortions(autoPortions));
    }, [autoPortions, toEditablePortions]);

    const handleContinue = useCallback(() => {
      if (!product) return;

      const normalized = normalizePortions(portions);
      if (portions.length > 0 && normalized.length === 0) {
        setError('Заполните название и граммы порции');
        return;
      }

      setError('');

      const updatedProduct = {
        ...product,
        ...(normalized.length > 0 ? { portions: normalized } : {})
      };

      onChange({
        ...data,
        portions: normalized,
        selectedProduct: updatedProduct
      });

      if (updateStepData) {
        updateStepData('portions', {
          product: updatedProduct,
          portions: normalized
        });
        updateStepData('create', {
          ...stepData?.create,
          newProduct: updatedProduct,
          selectedProduct: updatedProduct
        });
        updateStepData('harm', {
          product: updatedProduct
        });
        updateStepData('grams', {
          selectedProduct: updatedProduct,
          grams: stepData?.create?.grams || 100
        });
      }

      if (context?.isEditMode && normalized.length > 0) {
        saveProductPortions(updatedProduct, normalized);
      }

      if (context?.onFinish) {
        context.onFinish({ product: updatedProduct, portions: normalized });
        if (HEYS.StepModal?.hide) {
          HEYS.StepModal.hide();
        }
        return;
      }

      const nextIndex = context?.isEditMode ? 1 : 3;
      setTimeout(() => goToStep?.(nextIndex, 'left'), 150);
    }, [product, portions, onChange, data, updateStepData, stepData, context?.isEditMode, context?.onFinish, goToStep]);

    const handleSkip = useCallback(() => {
      if (!product) return;
      haptic('light');

      if (updateStepData) {
        updateStepData('portions', {
          product,
          portions: []
        });
        updateStepData('harm', {
          product
        });
      }

      if (context?.onFinish) {
        context.onFinish({ product, portions: [] });
        if (HEYS.StepModal?.hide) {
          HEYS.StepModal.hide();
        }
        return;
      }

      const nextIndex = context?.isEditMode ? 1 : 3;
      setTimeout(() => goToStep?.(nextIndex, 'left'), 150);
    }, [product, updateStepData, context?.isEditMode, context?.onFinish, goToStep]);

    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала создайте продукт'
      );
    }

    return React.createElement('div', { className: 'aps-portions-step' },
      React.createElement('div', { className: 'aps-portions-header' },
        React.createElement('span', { className: 'aps-portions-icon' }, '🥣'),
        React.createElement('span', { className: 'aps-portions-title' }, 'Порции')
      ),

      React.createElement('div', { className: 'aps-portions-subtitle' },
        'Удобные порции для «' + product.name + '»'
      ),

      autoPortions?.length > 0 && React.createElement('div', { className: 'aps-portions-suggest' },
        React.createElement('div', { className: 'aps-portions-suggest-title' }, 'Рекомендованные'),
        React.createElement('div', { className: 'aps-portions-suggest-list' },
          autoPortions.map((p, i) =>
            React.createElement('div', { key: i, className: 'aps-portions-suggest-chip' },
              p.name + (String(p.name).includes('г') ? '' : ` (${p.grams}г)`)
            )
          )
        ),
        React.createElement('button', {
          className: 'aps-portions-apply-btn',
          onClick: handleApplyAuto
        }, 'Использовать шаблон')
      ),

      React.createElement('div', { className: 'aps-portions-editor' },
        portions.length === 0 && React.createElement('div', { className: 'aps-portions-empty' },
          'Нет порций — добавьте свои или пропустите'
        ),
        portions.map((p, i) =>
          React.createElement('div', { key: i, className: 'aps-portions-row' },
            React.createElement('input', {
              className: 'aps-portions-input aps-portions-input--name',
              placeholder: 'Например: 1 яблоко',
              value: p.name,
              onChange: (e) => handleUpdatePortion(i, 'name', e.target.value)
            }),
            React.createElement('div', { className: 'aps-portions-grams' },
              React.createElement('input', {
                className: 'aps-portions-input aps-portions-input--grams',
                type: 'number',
                inputMode: 'numeric',
                placeholder: 'г',
                value: p.grams,
                onChange: (e) => handleUpdatePortion(i, 'grams', e.target.value)
              }),
              React.createElement('span', { className: 'aps-portions-grams-unit' }, 'г')
            ),
            React.createElement('button', {
              className: 'aps-portions-remove-btn',
              onClick: () => handleRemovePortion(i)
            }, '×')
          )
        )
      ),

      React.createElement('button', {
        className: 'aps-portions-add-btn',
        onClick: handleAddPortion
      }, '+ Добавить порцию'),

      error && React.createElement('div', { className: 'aps-portions-error' }, '⚠️ ' + error),

      React.createElement('div', { className: 'aps-portions-actions' },
        React.createElement('button', {
          className: 'aps-portions-skip-btn',
          onClick: handleSkip
        }, 'Пропустить'),
        React.createElement('button', {
          className: 'aps-portions-next-btn',
          onClick: handleContinue
        }, context?.isEditMode ? 'Далее' : 'Далее к вредности')
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

  // === Компонент выбора Harm Score (Шаг harm) — минималистичный UI ===
  function HarmSelectStep({ data, onChange, context, stepData }) {
    const e = React.createElement;

    // Продукт из предыдущего шага create
    const product = stepData?.create?.newProduct
      || stepData?.portions?.product
      || stepData?.harm?.product
      || data?.newProduct
      || data?.product
      || data?.selectedProduct;

    // Вычисленный системой harm
    const calculatedBreakdown = useMemo(() => {
      if (!product) return null;
      if (HEYS.Harm?.getHarmBreakdown) {
        return HEYS.Harm.getHarmBreakdown(product);
      }
      return null;
    }, [product]);

    const calculatedHarm = calculatedBreakdown?.score ?? null;

    // Введённый вручную harm (из paste-данных)
    const manualHarmRef = useRef(null);
    if (manualHarmRef.current == null) {
      manualHarmRef.current = HEYS.models?.normalizeHarm?.(product)
        ?? Number(product?.harm ?? product?.harmScore ?? product?.harmscore ?? product?.harm100 ?? NaN);
    }
    const manualHarm = manualHarmRef.current;
    const hasManualHarm = Number.isFinite(manualHarm);

    // Текущий выбранный harm
    const [selectedHarm, setSelectedHarm] = useState(() => {
      const safeManual = Number.isFinite(manualHarm) ? manualHarm : null;
      // По умолчанию — вычисленный системой
      return calculatedHarm ?? safeManual ?? 5;
    });

    // Режим кастомного ввода
    const [showCustom, setShowCustom] = useState(false);

    // Показывать ли breakdown
    const [showBreakdown, setShowBreakdown] = useState(true);

    // WheelPicker для кастомного значения
    const WheelPicker = HEYS.StepModal?.WheelPicker;

    // Категория для текущего выбора
    const selectedCategory = useMemo(() => {
      return HEYS.Harm?.getHarmCategory?.(selectedHarm) || { name: '—', color: '#6b7280', emoji: '❓' };
    }, [selectedHarm]);

    // Навигация
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;

    // Обновляем данные при изменении выбора
    useEffect(() => {
      if (product && selectedHarm != null) {
        const updatedProduct = {
          ...product,
          harm: selectedHarm,
          harmManual: Number.isFinite(manualHarm) ? manualHarm : product?.harmManual
        };
        onChange({ ...data, selectedHarm, product: updatedProduct });

        // Также обновляем в create stepData
        if (updateStepData && stepData?.create) {
          updateStepData('create', {
            ...stepData.create,
            newProduct: updatedProduct
          });
        }
      }
    }, [selectedHarm]);

    // Выбрать вариант, СОХРАНИТЬ ПРОДУКТ и перейти дальше
    const selectAndContinue = useCallback((harm) => {
      haptic('light');
      setSelectedHarm(harm);

      // Обновляем продукт с выбранным harm
      const updatedProduct = product ? {
        ...product,
        harm,
        harmManual: Number.isFinite(manualHarm) ? manualHarm : product?.harmManual
      } : null;

      if (updatedProduct && updateStepData) {
        updateStepData('create', {
          ...stepData?.create,
          newProduct: updatedProduct,
          selectedProduct: updatedProduct
        });
        updateStepData('grams', {
          selectedProduct: updatedProduct,
          grams: stepData?.create?.grams || 100
        });
      }

      // 🔐 СОХРАНЕНИЕ ПРОДУКТА В БАЗУ (перенесено из CreateProductStep)
      if (updatedProduct) {
        const U = HEYS.utils || {};
        const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];

        // Проверка на дубликат
        const normName = (updatedProduct.name || '').trim().toLowerCase();
        const existingPersonal = products.find(p =>
          (p.name || '').trim().toLowerCase() === normName
        );

        if (!existingPersonal) {
          const newProducts = [...products, updatedProduct];
          if (HEYS.products?.setAll) {
            HEYS.products.setAll(newProducts);
            console.log('[HarmSelectStep] ✅ Сохранён в базу с harm:', harm, updatedProduct.name);
          } else if (HEYS.store?.set) {
            HEYS.store.set('heys_products', newProducts);
            console.log('[HarmSelectStep] ✅ Сохранён через store с harm:', harm);
          }
        } else {
          console.log('[HarmSelectStep] ⚠️ Продукт уже есть в базе:', existingPersonal.name);
          // Используем существующий ID
          updatedProduct.id = existingPersonal.id;
        }

        // 🔄 Orphan recovery
        if (HEYS.orphanProducts?.recalculate) {
          HEYS.orphanProducts.recalculate();
        }
        if (HEYS.orphanProducts?.remove && updatedProduct.name) {
          HEYS.orphanProducts.remove(updatedProduct.name);
        }

        // 🌐 Публикация в shared (async, не блокируем переход)
        const publishToShared = stepData?.create?.publishToShared ?? true;
        const isCurator = !!HEYS.cloud?.curatorId;

        if (publishToShared && HEYS.cloud) {
          (async () => {
            try {
              if (HEYS.models?.computeProductFingerprint) {
                const fingerprint = await HEYS.models.computeProductFingerprint(updatedProduct);
                const existing = await HEYS.cloud.searchSharedProducts?.('', { fingerprint, limit: 1 });
                if (existing?.data?.length > 0) {
                  console.log('[HarmSelectStep] 🔄 Продукт уже в shared:', existing.data[0].name);
                  return;
                }
              }

              if (isCurator && HEYS.cloud.publishToShared) {
                const result = await HEYS.cloud.publishToShared(updatedProduct);
                console.log('[HarmSelectStep] ✅ Опубликован в shared:', result);
              } else if (HEYS.cloud.createPendingProduct) {
                let clientId = localStorage.getItem('heys_client_current');
                try { clientId = JSON.parse(clientId); } catch (e) { }
                if (clientId) {
                  await HEYS.cloud.createPendingProduct(clientId, updatedProduct);
                }
              }
            } catch (err) {
              console.error('[HarmSelectStep] ❌ Ошибка публикации:', err);
            }
          })();
        }
      }

      // Переходим на шаг граммов
      setTimeout(() => goToStep?.(4, 'left'), 150);
    }, [product, stepData, updateStepData, goToStep, manualHarm]);

    // Значения для WheelPicker: 0, 0.5, 1, ... 10
    const wheelValues = useMemo(() => Array.from({ length: 21 }, (_, i) => i * 0.5), []);

    if (!product) {
      return e('div', { className: 'flex items-center justify-center h-40 text-gray-400' },
        'Сначала создайте продукт'
      );
    }

    return e('div', { className: 'harm-select-step' },
      // Название продукта
      e('div', { className: 'text-center mb-4' },
        e('span', { className: 'text-lg font-medium text-gray-900' }, product.name)
      ),

      // Два варианта: Manual vs Calculated
      e('div', { className: 'flex gap-3 mb-4' },
        // Карточка: Введённое вручную (если есть и отличается)
        hasManualHarm && e('button', {
          className: `harm-card ${selectedHarm === manualHarm ? 'selected' : ''}`,
          onClick: () => selectAndContinue(manualHarm),
          style: {
            flex: 1,
            background: selectedHarm === manualHarm ? (HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280') + '15' : '#f9fafb',
            border: selectedHarm === manualHarm ? `2px solid ${HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280'}` : '2px solid transparent',
            borderRadius: '16px',
            padding: '16px 12px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s'
          }
        },
          e('div', { className: 'text-xs text-gray-500 mb-1' }, '✏️ AI'),
          e('div', {
            className: 'text-4xl font-bold mb-1',
            style: { color: HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280' }
          }, manualHarm.toFixed(1)),
          e('div', {
            className: 'text-xs font-medium',
            style: { color: HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280' }
          }, HEYS.Harm?.getHarmCategory?.(manualHarm)?.emoji || '')
        ),

        // Карточка: Рассчитано системой
        calculatedHarm != null && e('button', {
          className: `harm-card ${selectedHarm === calculatedHarm ? 'selected' : ''}`,
          onClick: () => selectAndContinue(calculatedHarm),
          style: {
            flex: 1,
            background: selectedHarm === calculatedHarm ? (calculatedBreakdown?.category?.color || '#6b7280') + '15' : '#f9fafb',
            border: selectedHarm === calculatedHarm ? `2px solid ${calculatedBreakdown?.category?.color || '#6b7280'}` : '2px solid transparent',
            borderRadius: '16px',
            padding: '16px 12px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s'
          }
        },
          e('div', { className: 'text-xs text-gray-500 mb-1' }, '🧪 Расчёт'),
          e('div', {
            className: 'text-4xl font-bold mb-1',
            style: { color: calculatedBreakdown?.category?.color || '#6b7280' }
          }, calculatedHarm.toFixed(1)),
          e('div', {
            className: 'text-xs font-medium',
            style: { color: calculatedBreakdown?.category?.color || '#6b7280' }
          }, calculatedBreakdown?.category?.emoji || '')
        )
      ),

      // Сравнение разницы (если есть оба значения и они отличаются)
      hasManualHarm && calculatedHarm != null && Math.abs(manualHarm - calculatedHarm) >= 0.5 && e('div', {
        className: 'text-center text-xs py-2 px-3 rounded-lg mb-3',
        style: {
          background: Math.abs(manualHarm - calculatedHarm) >= 2 ? '#fef3c7' : '#f3f4f6',
          color: Math.abs(manualHarm - calculatedHarm) >= 2 ? '#92400e' : '#6b7280'
        }
      },
        Math.abs(manualHarm - calculatedHarm) >= 2
          ? `⚠️ Разница ${Math.abs(manualHarm - calculatedHarm).toFixed(1)} — AI и расчёт сильно расходятся`
          : `Δ ${Math.abs(manualHarm - calculatedHarm).toFixed(1)} между AI и расчётом`
      ),

      // Кнопка "Своё значение"
      e('button', {
        className: 'w-full py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors',
        onClick: () => { setShowCustom(!showCustom); haptic('light'); }
      }, showCustom ? '▼ Скрыть выбор' : '⚙️ Указать своё значение'),

      // WheelPicker для кастомного значения
      showCustom && WheelPicker && e('div', { className: 'mt-3 mb-4' },
        e('div', { className: 'flex items-center justify-center gap-4' },
          e('div', { className: 'w-32' },
            e(WheelPicker, {
              values: wheelValues,
              value: selectedHarm,
              onChange: (v) => setSelectedHarm(v),
              height: 140,
              compact: true
            })
          ),
          e('div', { className: 'text-center' },
            e('div', {
              className: 'text-3xl font-bold',
              style: { color: selectedCategory.color }
            }, selectedHarm.toFixed(1)),
            e('div', {
              className: 'text-sm',
              style: { color: selectedCategory.color }
            }, selectedCategory.name)
          )
        ),
        e('button', {
          className: 'w-full mt-3 py-3 rounded-xl font-medium text-white',
          style: { background: selectedCategory.color },
          onClick: () => selectAndContinue(selectedHarm)
        }, '✓ Выбрать ' + selectedHarm.toFixed(1))
      ),

      // Кнопка "Как посчитано?" — раскрывает breakdown
      calculatedBreakdown && e('button', {
        className: 'w-full py-2 mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors',
        onClick: () => { setShowBreakdown(!showBreakdown); haptic('light'); }
      }, showBreakdown ? '▲ Скрыть расшифровку' : '❓ Как посчитано?'),

      // Breakdown расчёта
      showBreakdown && calculatedBreakdown && e('div', {
        className: 'mt-3 p-3 bg-gray-50 rounded-xl text-xs space-y-2'
      },
        // Формула
        e('div', { className: 'text-center text-gray-600 mb-2 font-mono' },
          calculatedBreakdown.formula
        ),
        // Версия формулы
        e('div', { className: 'text-center text-[10px] text-gray-400' },
          `Формула v${calculatedBreakdown.version || '3.0'}`
        ),

        // Штрафы
        calculatedBreakdown.penalties.length > 0 && e('div', null,
          e('div', { className: 'text-red-600 font-medium mb-1' }, '🔴 Штрафы:'),
          calculatedBreakdown.penalties.map((p, i) =>
            e('div', { key: i, className: 'flex justify-between text-gray-600 pl-4' },
              e('span', null, `${p.icon} ${p.label}`),
              e('span', { className: 'text-red-500' }, `+${p.contribution.toFixed(2)}`)
            )
          )
        ),

        // Бонусы
        calculatedBreakdown.bonuses.length > 0 && e('div', { className: 'mt-2' },
          e('div', { className: 'text-green-600 font-medium mb-1' }, '🟢 Бонусы:'),
          calculatedBreakdown.bonuses.map((b, i) =>
            e('div', { key: i, className: 'flex justify-between text-gray-600 pl-4' },
              e('span', null, `${b.icon} ${b.label}`),
              e('span', { className: 'text-green-500' }, `−${b.contribution.toFixed(2)}`)
            )
          )
        ),

        // NOVA info
        e('div', { className: 'mt-2 text-gray-500 text-center' },
          `NOVA ${calculatedBreakdown.novaGroup}: ${calculatedBreakdown.novaGroup === 4 ? 'Ультрапереработанный' :
            calculatedBreakdown.novaGroup === 3 ? 'Переработанный' :
              calculatedBreakdown.novaGroup === 2 ? 'Ингредиент' : 'Необработанный'
          }`
        )
      ),

      // Подсказка
      e('div', { className: 'text-center text-xs text-gray-400 mt-4' },
        '0 = суперполезный • 10 = супервредный'
      )
    );
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
    const defaultPortions = useMemo(() => {
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

    const [localPortions, setLocalPortions] = useState(defaultPortions);

    useEffect(() => {
      setLocalPortions(defaultPortions);
    }, [defaultPortions]);

    useEffect(() => {
      const handlePortionsUpdated = (event) => {
        const detail = event?.detail || {};
        const updatedProduct = detail.product;
        const updatedId = String(detail.productId ?? updatedProduct?.id ?? updatedProduct?.product_id ?? updatedProduct?.name);
        const currentId = String(product?.id ?? product?.product_id ?? product?.name);
        if (!updatedId || updatedId !== currentId) return;

        const nextPortions = Array.isArray(detail.portions)
          ? detail.portions
          : (updatedProduct?.portions || []);

        setLocalPortions(nextPortions);
        if (updatedProduct) {
          onChange({ ...data, selectedProduct: updatedProduct });
        }
      };

      window.addEventListener('heys:product-portions-updated', handlePortionsUpdated);
      return () => window.removeEventListener('heys:product-portions-updated', handlePortionsUpdated);
    }, [product, data, onChange]);

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
      localPortions?.length > 0 && React.createElement('div', { className: 'aps-portions' },
        React.createElement('div', { className: 'aps-portions-title' }, 'Порции:'),
        React.createElement('div', { className: 'aps-portions-list' },
          localPortions.map((p, i) =>
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
          id: 'portions',
          title: 'Порции',
          hint: 'Добавьте удобные порции',
          icon: '🥣',
          component: PortionsStep,
          validate: () => true,
          hidden: true,
          hideHeaderNext: true
        },
        {
          id: 'harm',
          title: 'Вредность',
          hint: 'Проверьте или измените',
          icon: '🧪',
          component: HarmSelectStep,
          validate: () => true,
          hidden: true, // Скрытый шаг — показывается только при создании нового продукта
          hideHeaderNext: true // Есть своя кнопка выбора
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
        headerRight: ({ stepData, currentConfig, goToStep }) => {
          const countLabel = `🗃️ ${currentProducts.length}`;
          if (currentConfig?.id !== 'grams') return countLabel;

          const product = stepData?.grams?.selectedProduct
            || stepData?.create?.newProduct
            || stepData?.create?.selectedProduct
            || stepData?.search?.selectedProduct;

          const canEdit = canEditProduct(product);

          return React.createElement('div', { className: 'mc-header-right-group' },
            React.createElement('span', { className: 'mc-header-right-count' }, countLabel),
            canEdit && React.createElement('button', {
              className: 'mc-header-right-btn',
              onClick: (e) => {
                e.stopPropagation();
                // Переходим на шаг порций (индекс 2) внутри текущей модалки
                if (goToStep) {
                  goToStep(2, 'left');
                } else {
                  console.warn('[EditBtn] goToStep not available');
                }
              },
              title: 'Редактировать порции'
            }, '✏️')
          );
        }, // Счётчик + кнопка редактирования порций
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
    PortionsStep,
    CreateProductStep,
    HarmSelectStep,
    getCategoryIcon,
    computeSmartProducts
  };

  // console.log('[HEYS] AddProductStep v1 loaded');

})(typeof window !== 'undefined' ? window : global);
