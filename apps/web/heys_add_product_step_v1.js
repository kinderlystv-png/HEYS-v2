// heys_add_product_step_v1.js — Шаг добавления продукта через StepModal
// Двухшаговый flow: поиск → граммы/порции
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

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

  // === Компонент поиска продукта (Шаг 1) ===
  function ProductSearchStep({ data, onChange, context }) {
    const [search, setSearch] = useState('');
    const [favorites, setFavorites] = useState(() => 
      HEYS.store?.getFavorites?.() || new Set()
    );
    const inputRef = useRef(null);
    
    const { products = [], dateKey = '' } = context || {};
    
    // Debug: проверяем что products пришли
    useEffect(() => {
      console.log('[AddProductStep] context:', context);
      console.log('[AddProductStep] products count:', products?.length);
    }, [context, products]);
    
    // Фокус на input при монтировании
    useEffect(() => {
      setTimeout(() => inputRef.current?.focus(), 100);
    }, []);
    
    // Популярные продукты
    const popularProducts = useMemo(() => 
      computePopularProducts(products, dateKey), 
      [products, dateKey]
    );
    
    // Избранные продукты
    const favoriteProducts = useMemo(() => {
      if (!favorites.size) return [];
      return products.filter(p => {
        const pid = String(p.id ?? p.product_id ?? p.name);
        return favorites.has(pid);
      }).slice(0, 10);
    }, [products, favorites]);
    
    // Поиск
    const lc = search.trim().toLowerCase();
    const searchResults = useMemo(() => {
      if (!lc) return [];
      
      // Умный поиск если доступен
      if (HEYS.SmartSearchWithTypos) {
        try {
          const result = HEYS.SmartSearchWithTypos.search(lc, products, {
            enablePhonetic: true,
            enableSynonyms: true,
            maxSuggestions: 20
          });
          if (result?.results?.length) return result.results;
        } catch (e) {
          console.warn('[AddProductStep] Smart search error:', e);
        }
      }
      
      // Fallback
      return products.filter(p => 
        String(p.name || '').toLowerCase().includes(lc)
      ).slice(0, 20);
    }, [lc, products]);
    
    // Toggle избранного
    const toggleFavorite = useCallback((e, productId) => {
      e.stopPropagation();
      if (HEYS.store?.toggleFavorite) {
        HEYS.store.toggleFavorite(productId);
        setFavorites(HEYS.store.getFavorites());
      }
    }, []);
    
    // Выбор продукта
    const selectProduct = useCallback((product) => {
      haptic('light');
      onChange({ 
        ...data, 
        selectedProduct: product,
        grams: 100 
      });
    }, [data, onChange]);
    
    // Кнопка "Новый продукт"
    const handleNewProduct = useCallback(() => {
      haptic('medium');
      // Открываем форму создания нового продукта
      if (HEYS.products?.showAddModal) {
        HEYS.products.showAddModal();
      } else if (context?.onNewProduct) {
        context.onNewProduct();
      }
    }, [context]);
    
    // Рендер карточки продукта
    const renderProductCard = (product, showFavorite = true) => {
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isFav = favorites.has(pid);
      const kcal = Math.round(product.kcal100 || 0);
      const prot = Math.round(product.protein100 || 0);
      
      return React.createElement('div', {
        key: pid,
        className: 'aps-product-card',
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
            React.createElement('span', null, kcal + ' ккал'),
            React.createElement('span', { className: 'aps-product-meta-sep' }, '·'),
            React.createElement('span', null, 'Б ' + prot + 'г')
          )
        ),
        
        // Кнопка избранного
        showFavorite && React.createElement('button', {
          className: 'aps-fav-btn' + (isFav ? ' active' : ''),
          onClick: (e) => toggleFavorite(e, pid)
        }, isFav ? '★' : '☆')
      );
    };
    
    // Что показывать: результаты поиска или рекомендации
    const showSearch = lc.length > 0;
    const showFavorites = !showSearch && favoriteProducts.length > 0;
    const showPopular = !showSearch;
    
    return React.createElement('div', { className: 'aps-search-step' },
      // Кнопка "Новый продукт"
      React.createElement('button', {
        className: 'aps-new-product-btn',
        onClick: handleNewProduct
      },
        React.createElement('span', { className: 'aps-new-icon' }, '+'),
        React.createElement('span', null, 'Новый продукт'),
        React.createElement('span', { className: 'aps-new-hint' }, 'если не нашли нужный')
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
    );
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
  function GramsStep({ data, onChange, context }) {
    const product = data.selectedProduct;
    const grams = data.grams || 100;
    
    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала выберите продукт'
      );
    }
    
    const kcal100 = product.kcal100 || 0;
    const protein100 = product.protein100 || 0;
    const carbs100 = (product.simple100 || 0) + (product.complex100 || 0);
    const fat100 = (product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0);
    
    // Расчёт на текущую порцию
    const currentKcal = Math.round(kcal100 * grams / 100);
    const currentProt = Math.round(protein100 * grams / 100);
    const currentCarbs = Math.round(carbs100 * grams / 100);
    const currentFat = Math.round(fat100 * grams / 100);
    
    // Авто-порции продукта
    const portions = useMemo(() => {
      if (product.portions && product.portions.length) {
        return product.portions;
      }
      // Авто-порции по названию
      return HEYS.models?.getAutoPortions?.(product) || [
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
    
    // Быстрые кнопки порций
    const quickPortions = [50, 100, 150, 200, 300];
    
    return React.createElement('div', { className: 'aps-grams-step' },
      // Название продукта
      React.createElement('div', { className: 'aps-product-header' },
        product.category && React.createElement('span', { className: 'aps-product-icon-lg' }, 
          getCategoryIcon(product.category)
        ),
        React.createElement('div', { className: 'aps-product-title' }, product.name)
      ),
      
      // Большой дисплей калорий
      React.createElement('div', { className: 'aps-kcal-display' },
        React.createElement('span', { className: 'aps-kcal-value' }, currentKcal),
        React.createElement('span', { className: 'aps-kcal-unit' }, ' ккал')
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
      
      // Поле ввода граммов
      React.createElement('div', { className: 'aps-grams-input-row' },
        React.createElement('button', {
          className: 'aps-grams-btn',
          onClick: () => setGrams(grams - 10)
        }, '−10'),
        React.createElement('input', {
          type: 'number',
          className: 'aps-grams-input',
          value: grams,
          onChange: (e) => setGrams(e.target.value),
          inputMode: 'numeric',
          min: 1,
          max: 2000
        }),
        React.createElement('span', { className: 'aps-grams-unit' }, 'г'),
        React.createElement('button', {
          className: 'aps-grams-btn',
          onClick: () => setGrams(grams + 10)
        }, '+10')
      ),
      
      // Слайдер
      React.createElement('input', {
        type: 'range',
        className: 'aps-grams-slider',
        min: 10,
        max: 500,
        step: 5,
        value: Math.min(500, grams),
        onChange: (e) => setGrams(Number(e.target.value))
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
      )
    );
  }

  // === Главная функция показа модалки ===
  function showAddProductModal(options = {}) {
    const { 
      mealIndex = 0, 
      products = [],
      dateKey = new Date().toISOString().slice(0, 10),
      onAdd,
      onNewProduct,
      onClose 
    } = options;
    
    if (!HEYS.StepModal) {
      console.error('[AddProductStep] StepModal not loaded');
      return;
    }
    
    HEYS.StepModal.show({
      steps: [
        {
          id: 'search',
          title: 'Добавить продукт',
          hint: '',
          icon: '🍽️',
          component: ProductSearchStep,
          getInitialData: () => ({ selectedProduct: null, grams: 100 }),
          validate: (data) => !!data.selectedProduct
        },
        {
          id: 'grams',
          title: 'Порция',
          hint: 'Укажите количество',
          icon: '⚖️',
          component: GramsStep,
          validate: (data) => data.grams > 0
        }
      ],
      context: { products, dateKey, mealIndex, onNewProduct },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
      allowSwipe: true,
      title: 'Добавить продукт',
      onComplete: (stepData) => {
        const searchData = stepData.search || {};
        const gramsData = stepData.grams || searchData;
        
        if (searchData.selectedProduct && gramsData.grams) {
          onAdd?.({
            product: searchData.selectedProduct,
            grams: gramsData.grams,
            mealIndex
          });
        }
      },
      onClose
    });
  }

  // === Экспорт ===
  HEYS.AddProductStep = {
    show: showAddProductModal,
    ProductSearchStep,
    GramsStep,
    getCategoryIcon,
    computePopularProducts
  };

  console.log('[HEYS] AddProductStep v1 loaded');

})(typeof window !== 'undefined' ? window : global);
