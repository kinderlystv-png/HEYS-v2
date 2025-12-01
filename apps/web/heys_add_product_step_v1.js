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
    const inputRef = useRef(null);
    
    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep } = stepContext;
    
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
    
    // Умные рекомендации
    const smartRecs = useMemo(() => 
      getSmartRecommendations(products, dateKey),
      [products, dateKey]
    );
    
    // Поиск с фильтром категории
    const lc = search.trim().toLowerCase();
    const searchResults = useMemo(() => {
      let results = [];
      
      if (lc) {
        // Умный поиск если доступен
        if (HEYS.SmartSearchWithTypos) {
          try {
            const result = HEYS.SmartSearchWithTypos.search(lc, products, {
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
          results = products.filter(p => 
            String(p.name || '').toLowerCase().includes(lc)
          );
        }
      }
      
      // Фильтр по категории
      if (selectedCategory !== 'all') {
        results = results.filter(p => matchCategory(p, selectedCategory));
      }
      
      return results.slice(0, 20);
    }, [lc, products, selectedCategory]);
    
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
      
      onChange({ 
        ...data, 
        selectedProduct: product,
        grams: defaultGrams,
        lastGrams: lastGrams // Для отображения подсказки
      });
      // Автопереход на шаг 2 (граммы)
      if (goToStep) {
        setTimeout(() => goToStep(1, 'left'), 50);
      }
    }, [data, onChange, goToStep]);
    
    // Кнопка "Новый продукт" — переход на шаг создания
    const handleNewProduct = useCallback(() => {
      haptic('medium');
      // Переходим на шаг создания нового продукта (шаг 2 — create)
      if (goToStep) {
        goToStep(2, 'left');
      }
    }, [goToStep]);
    
    // Рендер карточки продукта
    const renderProductCard = (product, showFavorite = true) => {
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isFav = favorites.has(pid);
      const kcal = Math.round(product.kcal100 || 0);
      const prot = Math.round(product.protein100 || 0);
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
      
      // Фильтр по категориям
      React.createElement('div', { className: 'aps-categories' },
        CATEGORIES.map(cat => 
          React.createElement('button', {
            key: cat.id,
            className: 'aps-category-chip' + (selectedCategory === cat.id ? ' active' : ''),
            onClick: () => setSelectedCategory(cat.id)
          }, cat.icon + ' ' + cat.name)
        )
      ),
      
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
    );
  }

  // === Компонент создания нового продукта (Шаг create) ===
  function CreateProductStep({ data, onChange, context }) {
    const [pasteText, setPasteText] = useState('');
    const [error, setError] = useState('');
    const [parsedPreview, setParsedPreview] = useState(null);
    const textareaRef = useRef(null);
    
    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, closeModal } = stepContext;
    
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
    
    // При изменении текста — пытаемся распарсить
    useEffect(() => {
      if (!pasteText.trim()) {
        setParsedPreview(null);
        setError('');
        return;
      }
      
      const parsed = parseProductLine(pasteText);
      if (parsed) {
        setParsedPreview(parsed);
        setError('');
        onChange({ ...data, newProduct: parsed });
      } else {
        setParsedPreview(null);
        setError('Не удалось распознать данные. Формат: Название + 12 чисел.');
      }
    }, [pasteText, parseProductLine, data, onChange]);
    
    // Добавить продукт в базу и выбрать его
    const handleCreate = useCallback(() => {
      if (!parsedPreview) return;
      
      haptic('medium');
      
      // 1. Добавляем в базу продуктов
      const products = HEYS.products?.getAll?.() || [];
      const newProducts = [...products, parsedPreview];
      HEYS.products?.setAll?.(newProducts);
      
      // 2. Обновляем данные шага — продукт выбран
      onChange({ 
        ...data, 
        newProduct: parsedPreview,
        selectedProduct: parsedPreview,
        grams: 100
      });
      
      // 3. Вызываем callback если есть (для обновления списка в родителе)
      if (context?.onProductCreated) {
        context.onProductCreated(parsedPreview);
      }
      
      // 4. Переходим на шаг граммов
      if (goToStep) {
        setTimeout(() => goToStep(1, 'left'), 100);
      }
    }, [parsedPreview, data, onChange, context, goToStep]);
    
    return React.createElement('div', { className: 'aps-create-step' },
      // Заголовок
      React.createElement('div', { className: 'aps-create-header' },
        React.createElement('span', { className: 'aps-create-icon' }, '➕'),
        React.createElement('span', { className: 'aps-create-title' }, 'Создать новый продукт')
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
        placeholder: 'Пример: Овсянка на воде\t120\t22\t2\t20\t4\t2\t0.5\t1.5\t0\t3\t40\t0',
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
        React.createElement('div', { className: 'aps-preview-macros' },
          React.createElement('span', { className: 'aps-preview-kcal' }, parsedPreview.kcal100 + ' ккал'),
          React.createElement('span', null, 'Б ' + parsedPreview.protein100 + 'г'),
          React.createElement('span', null, 'Ж ' + parsedPreview.fat100 + 'г'),
          React.createElement('span', null, 'У ' + parsedPreview.carbs100 + 'г')
        ),
        React.createElement('div', { className: 'aps-preview-extra' },
          'ГИ: ' + parsedPreview.gi + ' · Клетчатка: ' + parsedPreview.fiber100 + 'г · Вред: ' + parsedPreview.harmScore
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

  // Фон карточки по вредности (копия из heys_day_v12.js)
  function getHarmBg(h) {
    if (h == null) return null;
    if (h <= -2) return '#d1fae5'; // суперполезный — насыщенный мятный
    if (h <= -1) return '#ecfdf5'; // очень полезный
    if (h <= 0) return '#f0fdf4';  // полезный — светло-зелёный
    if (h <= 1) return '#fafafa';  // почти нейтральный
    if (h <= 2) return null;       // нормальный — дефолт
    if (h <= 3) return '#fffef5';  // чуть тёплый
    if (h <= 4) return '#fffbeb';  // кремовый
    if (h <= 5) return '#fef9e7';  // светло-жёлтый
    if (h <= 6) return '#fef3c7';  // жёлтый
    if (h <= 7) return '#fde68a';  // янтарный
    if (h <= 8) return '#fecaca';  // светло-розовый
    if (h <= 9) return '#fee2e2';  // розовый
    return '#fecdd3';              // красноватый
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
    // Продукт берём из данных первого шага (search) или из create
    const product = stepData?.create?.selectedProduct || stepData?.search?.selectedProduct || data.selectedProduct;
    const lastGrams = stepData?.search?.lastGrams || stepData?.create?.lastGrams; // Последние использованные
    const grams = data.grams || stepData?.search?.grams || stepData?.create?.grams || 100;
    
    // Режим ввода: grams или kcal
    const [inputMode, setInputMode] = useState('grams');
    const [kcalInput, setKcalInput] = useState('');
    const gramsInputRef = useRef(null);
    
    // Автофокус на поле граммов
    useEffect(() => {
      setTimeout(() => gramsInputRef.current?.focus(), 150);
    }, []);
    
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
      
      // Поле ввода граммов
      inputMode === 'grams' && React.createElement('div', { className: 'aps-grams-input-row' },
        React.createElement('button', {
          className: 'aps-grams-btn',
          onClick: () => setGrams(grams - 10)
        }, '−10'),
        React.createElement('input', {
          ref: gramsInputRef,
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
      
      // Поле ввода ккал (для расчёта граммов)
      inputMode === 'kcal' && React.createElement('div', { className: 'aps-kcal-input-row' },
        React.createElement('span', { className: 'aps-kcal-label' }, 'Хочу съесть:'),
        React.createElement('input', {
          type: 'number',
          className: 'aps-kcal-input',
          value: kcalInput,
          onChange: (e) => setKcalAndCalcGrams(e.target.value),
          placeholder: 'ккал',
          inputMode: 'numeric'
        }),
        React.createElement('span', { className: 'aps-kcal-unit' }, 'ккал'),
        React.createElement('span', { className: 'aps-calc-result' }, '= ' + grams + 'г')
      ),
      
      // Слайдер (только в режиме граммов)
      inputMode === 'grams' && React.createElement('input', {
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
      products = [],
      dateKey = new Date().toISOString().slice(0, 10),
      onAdd,
      onNewProduct,
      onClose 
    } = options;
    
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
          title: 'Добавить продукт',
          hint: '',
          icon: '🍽️',
          component: ProductSearchStep,
          getInitialData: () => ({ selectedProduct: null, grams: 100 }),
          validate: (data) => !!data?.selectedProduct
        },
        {
          id: 'grams',
          title: 'Порция',
          hint: 'Укажите количество',
          icon: '⚖️',
          component: GramsStep,
          validate: (data, stepData) => (data?.grams || stepData?.search?.grams || 0) > 0
        },
        {
          id: 'create',
          title: 'Новый продукт',
          hint: 'Создайте продукт из данных',
          icon: '➕',
          component: CreateProductStep,
          getInitialData: () => ({ newProduct: null }),
          validate: (data) => !!data?.newProduct
        }
      ],
      context: { 
        products: currentProducts, 
        dateKey, 
        mealIndex, 
        onNewProduct,
        // Callback при создании продукта — обновляем список
        onProductCreated: (product) => {
          currentProducts = [...currentProducts, product];
        }
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
      allowSwipe: true,
      title: 'Добавить продукт',
      onComplete: (stepData) => {
        // Проверяем, был ли создан новый продукт
        const createData = stepData.create || {};
        const searchData = stepData.search || {};
        const gramsData = stepData.grams || {};
        
        // Приоритет: новый продукт из create, затем выбранный из search
        const selectedProduct = createData.selectedProduct || searchData.selectedProduct;
        const grams = gramsData.grams || createData.grams || searchData.grams || 100;
        
        if (selectedProduct && grams) {
          onAdd?.({
            product: selectedProduct,
            grams: grams,
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
    CreateProductStep,
    getCategoryIcon,
    computePopularProducts
  };

  console.log('[HEYS] AddProductStep v1 loaded');

})(typeof window !== 'undefined' ? window : global);
