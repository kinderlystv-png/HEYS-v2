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

  // === Поиск популярных продуктов ===
  function computePopularProducts(products, dateKey) {
    if (!products || !products.length) return [];
    
    const usageCount = new Map();
    const today = new Date(dateKey || new Date().toISOString().slice(0, 10));
    
    // Анализируем последние 30 дней
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {});
      
      if (dayData.meals) {
        dayData.meals.forEach(meal => {
          if (meal.items) {
            meal.items.forEach(item => {
              const pid = item.product_id || item.productId || item.name;
              if (pid) {
                usageCount.set(pid, (usageCount.get(pid) || 0) + 1);
              }
            });
          }
        });
      }
    }
    
    // Сортируем по использованию
    const sorted = [...products].sort((a, b) => {
      const aId = a.id || a.product_id || a.name;
      const bId = b.id || b.product_id || b.name;
      const aCount = usageCount.get(aId) || 0;
      const bCount = usageCount.get(bId) || 0;
      return bCount - aCount;
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

  // Умные рекомендации на основе контекста
  function getSmartRecommendations(products, dateKey) {
    const hour = new Date().getHours();
    const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
    const hasTraining = dayData.trainings && dayData.trainings.length > 0;
    const meals = dayData.meals || [];
    
    // Считаем сумму белка за день
    let totalProtein = 0;
    meals.forEach(m => {
      (m.items || []).forEach(it => {
        const g = it.grams || 100;
        const p = products.find(pr => (pr.id || pr.name) === (it.product_id || it.name));
        if (p) totalProtein += (p.protein100 || 0) * g / 100;
      });
    });
    
    const recommendations = [];
    
    // После тренировки — белок
    if (hasTraining && totalProtein < 80) {
      const proteinRich = products
        .filter(p => (p.protein100 || 0) >= 15)
        .slice(0, 5);
      if (proteinRich.length) {
        recommendations.push({
          title: '💪 После тренировки',
          hint: 'Белок для восстановления',
          products: proteinRich
        });
      }
    }
    
    // Вечером — лёгкое
    if (hour >= 20) {
      const light = products
        .filter(p => (p.kcal100 || 0) < 100 && (p.harm || 0) <= 2)
        .slice(0, 5);
      if (light.length) {
        recommendations.push({
          title: '🌙 Вечерний перекус',
          hint: 'Лёгкие продукты',
          products: light
        });
      }
    }
    
    // Мало клетчатки — овощи
    if (hour >= 14) {
      const veggies = products
        .filter(p => (p.fiber100 || 0) >= 2 || (p.category || '').toLowerCase().includes('овощ'))
        .slice(0, 5);
      if (veggies.length) {
        recommendations.push({
          title: '🥗 Добавьте овощей',
          hint: 'Клетчатка важна',
          products: veggies
        });
      }
    }
    
    return recommendations.slice(0, 2); // Максимум 2 рекомендации
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
    
    // Всегда берём актуальные продукты из глобального стора (если появились новые)
    const latestProducts = useMemo(() => {
      const base = Array.isArray(context?.products) ? context.products : [];
      const storeRaw = HEYS.products?.getAll?.() || U().lsGet?.('heys_products', []);
      const storeProducts = Array.isArray(storeRaw) ? storeRaw : [];
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
    }, [context]);
    
    // Debug: проверяем что products пришли
    useEffect(() => {
      console.log('[AddProductStep] context:', context);
      console.log('[AddProductStep] products count:', latestProducts?.length);
    }, [context, latestProducts]);
    
    // Фокус на input при монтировании
    useEffect(() => {
      setTimeout(() => inputRef.current?.focus(), 100);
    }, []);
    
    // Популярные продукты
    const popularProducts = useMemo(() => 
      computePopularProducts(latestProducts, dateKey), 
      [latestProducts, dateKey]
    );
    
    // Избранные продукты
    const favoriteProducts = useMemo(() => {
      if (!favorites.size) return [];
      return latestProducts.filter(p => {
        const pid = String(p.id ?? p.product_id ?? p.name);
        return favorites.has(pid);
      }).slice(0, 10);
    }, [latestProducts, favorites]);
    
    // Умные рекомендации
    const smartRecs = useMemo(() => 
      getSmartRecommendations(latestProducts, dateKey),
      [latestProducts, dateKey]
    );
    
    // Поиск с фильтром категории
    const lc = search.trim().toLowerCase();
    const searchResults = useMemo(() => {
      let results = [];
      
      if (lc) {
        // Умный поиск если доступен
        if (HEYS.SmartSearchWithTypos) {
          try {
            const result = HEYS.SmartSearchWithTypos.search(lc, latestProducts, {
              enablePhonetic: true,
              enableSynonyms: true,
              maxSuggestions: 30
            });
            if (result?.results?.length) results = result.results;
          } catch (e) {
            console.warn('[AddProductStep] Smart search error:', e);
          }
        }
        
        // Fallback
        if (!results.length) {
          results = latestProducts.filter(p => 
            String(p.name || '').toLowerCase().includes(lc)
          );
        }
        
        // Умная сортировка: точные совпадения первыми
        results.sort((a, b) => {
          const aName = String(a.name || '').toLowerCase();
          const bName = String(b.name || '').toLowerCase();
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
      
      // Фильтр по категории
      if (selectedCategory !== 'all') {
        results = results.filter(p => matchCategory(p, selectedCategory));
      }
      
      return results.slice(0, 20);
    }, [lc, latestProducts, selectedCategory]);
    
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
      
      console.log('[ProductSearchStep] selectProduct:', product.name, 'grams:', defaultGrams);
      
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
      console.log('[AddProductStep] Photo selected:', file.name, file.size, 'bytes');
      
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
        console.log('[AddProductStep] Photo compressed:', 
          Math.round(compressedData.length / 1024), 'KB (was', 
          Math.round(file.size / 1024), 'KB)');
        
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
      console.log('[AddProductStep] Photo confirmed and added to meal:', context.mealIndex);
      
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
    }, [pendingPhotoData, context]);
    
    // Отмена фото
    const cancelPhoto = useCallback(() => {
      haptic('light');
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
      setPhotoPreview(null);
      console.log('[AddProductStep] Photo cancelled');
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
      
      // Сохраняем
      if (HEYS.products?.setAll) {
        HEYS.products.setAll(filtered);
      } else if (U.lsSet) {
        U.lsSet('heys_products', filtered);
      }
      
      // Обновляем context.products
      if (context?.onProductCreated) {
        // Костыль: триггерим обновление
      }
      
      console.log('[AddProductStep] Продукт удалён:', name);
      
      // Перезапускаем поиск чтобы обновить список
      setSearch(s => s + ' ');
      setTimeout(() => setSearch(s => s.trim()), 10);
    }, [context]);

    // Рендер карточки продукта
    const renderProductCard = (product, showFavorite = true) => {
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isFav = favorites.has(pid);
      const kcal = Math.round(product.kcal100 || 0);
      const prot = Math.round(product.protein100 || 0);
      const carbs = Math.round((product.simple100 || 0) + (product.complex100 || 0));
      const fat = Math.round((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0));
      const harmVal = product.harm ?? product.harmScore ?? product.harm100;
      const harmBg = getHarmBg(harmVal);
      
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
          React.createElement('div', { className: 'aps-product-name' }, product.name),
          React.createElement('div', { className: 'aps-product-meta' },
            React.createElement('span', { className: 'aps-meta-kcal' }, kcal + ' ккал'),
            React.createElement('span', { className: 'aps-meta-sep' }, '·'),
            React.createElement('span', { className: 'aps-meta-macros' }, 
              'Б ' + prot + ' | Ж ' + fat + ' | У ' + carbs
            )
          )
        ),
        
        // Кнопки действий
        React.createElement('div', { className: 'aps-product-actions' },
          // Кнопка удаления (маленькая)
          React.createElement('button', {
            className: 'aps-delete-btn',
            onClick: (e) => handleDeleteProduct(e, product),
            title: 'Удалить из базы'
          }, '🗑'),
          
          // Кнопка избранного
          showFavorite && React.createElement('button', {
            className: 'aps-fav-btn' + (isFav ? ' active' : ''),
            onClick: (e) => toggleFavorite(e, pid)
          }, isFav ? '★' : '☆')
        )
      );
    };
    
    // Что показывать: результаты поиска или рекомендации
    const showSearch = lc.length > 0;
    const showFavorites = !showSearch && favoriteProducts.length > 0;
    const showPopular = !showSearch;
    
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
        // Умные рекомендации (если нет поиска и есть рекомендации)
        !showSearch && smartRecs.length > 0 && smartRecs.map((rec, ri) =>
          React.createElement('div', { key: ri, className: 'aps-section aps-smart-rec' },
            React.createElement('div', { className: 'aps-section-title' }, 
              rec.title,
              React.createElement('span', { className: 'aps-rec-hint' }, rec.hint)
            ),
            React.createElement('div', { className: 'aps-products-list' },
              rec.products.map(p => renderProductCard(p, false))
            )
          )
        ),
        
        // Результаты поиска
        showSearch && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' }, 
            searchResults.length > 0 
              ? `Найдено: ${searchResults.length}` 
              : 'Ничего не найдено'
          ),
          searchResults.length > 0 && React.createElement('div', { className: 'aps-products-list' },
            searchResults.map(p => renderProductCard(p))
          ),
          searchResults.length === 0 && React.createElement('div', { className: 'aps-empty' },
            React.createElement('span', null, '😕'),
            React.createElement('span', null, 'Попробуйте другой запрос'),
            React.createElement('button', {
              className: 'aps-add-new-btn',
              onClick: handleNewProduct
            }, '+ Добавить "' + search + '"')
          )
        ),
        
        // Избранные
        showFavorites && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' }, '⭐ Избранные'),
          React.createElement('div', { className: 'aps-products-list' },
            favoriteProducts.map(p => renderProductCard(p))
          )
        ),
        
        // Популярные / Часто используемые
        showPopular && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' }, '🔥 Часто используемые'),
          React.createElement('div', { className: 'aps-products-list' },
            popularProducts.slice(0, showFavorites ? 10 : 15).map(p => renderProductCard(p, !showFavorites))
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
      const kcal100 = 4 * (protein + carbs100) + 8 * fat100;
      
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
        kcal100: Math.round(kcal100 * 10) / 10
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
      
      // 1. Добавляем в базу продуктов (localStorage)
      const U = HEYS.utils || {};
      const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
      const newProducts = [...products, parsedPreview];
      
      // Сохраняем через HEYS.products или напрямую
      if (HEYS.products?.setAll) {
        HEYS.products.setAll(newProducts);
      } else if (U.lsSet) {
        U.lsSet('heys_products', newProducts);
      }
      
      console.log('[CreateProductStep] Продукт сохранён:', parsedPreview.name, 'Всего продуктов:', newProducts.length);
      
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
    }, [parsedPreview, data, onChange, context, goToStep, updateStepData]);
    
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
    if (h <= 1) return '#34d399';  // 0-1: насыщенный зелёный — полезный
    if (h <= 2) return '#6ee7b7';  // 2: зелёный
    if (h <= 3) return '#a7f3d0';  // 3: мятный
    if (h <= 4) return '#d1fae5';  // 4: светло-мятный
    if (h <= 5) return '#bae6fd';  // 5: голубой — средний
    if (h <= 6) return '#e0f2fe';  // 6: светло-голубой
    if (h <= 7) return '#fecaca';  // 7: светло-розовый
    if (h <= 8) return '#fee2e2';  // 8: розовый
    if (h <= 9) return '#fecdd3';  // 9: красноватый
    return '#f87171';              // 10: красный — вредный
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
    // Продукт берём: 1) из context (для edit mode), 2) из своих данных, 3) из create, 4) из search
    const product = context?.editProduct || data.selectedProduct || stepData?.create?.selectedProduct || stepData?.search?.selectedProduct;
    const lastGrams = stepData?.search?.lastGrams || stepData?.create?.lastGrams; // Последние использованные
    const grams = data.grams || context?.editGrams || stepData?.search?.grams || stepData?.create?.grams || 100;
    
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
      portions.length > 0 && React.createElement('div', { className: 'aps-portions' },
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
    
    // Получаем продукты: переданные (если не пустые) или из глобального хранилища
    const U = HEYS.utils || {};
    const products = (providedProducts && providedProducts.length > 0) 
      ? providedProducts 
      : (HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || []);
    
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
          hidden: true // Скрытый шаг — не отображается в progress dots
        },
        {
          id: 'grams',
          title: '',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data, stepData) => (data?.grams || stepData?.search?.grams || 0) > 0
        }
      ],
      context: { 
        products: currentProducts, 
        dateKey, 
        mealIndex, 
        onNewProduct,
        onAdd, // Передаём callback для добавления в приём пищи
        onAddPhoto, // Callback для добавления фото к приёму
        headerExtra: `🗃️ ${currentProducts.length}`, // Счётчик продуктов в header
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
      title: '', // Убрали — и так очевидно
      onComplete: (stepData) => {
        console.log('[AddProductStep] onComplete stepData:', stepData);
        
        // Данные шагов
        const searchData = stepData.search || {};
        const gramsData = stepData.grams || {};
        
        // Приоритет: продукт из grams (последний шаг) или из поиска
        const selectedProduct = gramsData.selectedProduct || searchData.selectedProduct;
        const grams = gramsData.grams || searchData.grams || 100;
        
        console.log('[AddProductStep] selectedProduct:', selectedProduct?.name, 'grams:', grams);
        
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
          title: '',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data) => (data?.grams || 0) > 0
        }
      ],
      context: { 
        products: [], 
        dateKey, 
        mealIndex,
        itemId,
        isEditMode: true,
        editProduct: product,   // Продукт через context — доступен сразу
        editGrams: currentGrams // Граммы через context
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: false,
      allowSwipe: false,
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
    computePopularProducts
  };

  console.log('[HEYS] AddProductStep v1 loaded');

})(typeof window !== 'undefined' ? window : global);
