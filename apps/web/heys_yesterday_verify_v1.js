// heys_yesterday_verify_v1.js — Верификация вчерашних данных
// Показывается в утреннем чек-ине если вчера было <50% калорий от нормы
// Спрашивает: это реальное голодание или незаполненные приёмы пищи?
//
// Версия: 1.1.1
// 
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
  const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };

  // === Утилиты ===
  const storeGet = (k, d) => {
    try {
      if (HEYS.store?.get) return HEYS.store.get(k, d);
      if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(k, d);
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  };

  const storeSet = (k, v) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(k, v);
        return;
      }
      if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(k, v);
        return;
      }
      localStorage.setItem(k, JSON.stringify(v));
    } catch { }
  };

  const lsGet = (k, d) => storeGet(k, d);
  const lsSet = (k, v) => storeSet(k, v);

  /**
   * Получить ключ вчерашнего дня
   * @returns {string} YYYY-MM-DD
   */
  function getYesterdayKey() {
    // Учитываем ночной порог: до 03:00 "вчера" = позавчера
    const dayUtils = HEYS.dayUtils || {};
    if (typeof dayUtils.todayISO === 'function') {
      // todayISO уже учитывает порог 03:00, отнимаем 1 день
      const today = new Date(dayUtils.todayISO());
      today.setDate(today.getDate() - 1);
      return today.toISOString().slice(0, 10);
    }

    // Fallback
    const now = new Date();
    if (now.getHours() < 3) {
      now.setDate(now.getDate() - 2); // До 3 утра — позавчера
    } else {
      now.setDate(now.getDate() - 1); // После 3 утра — вчера
    }
    return now.toISOString().slice(0, 10);
  }

  /**
   * Получить данные вчерашнего дня для проверки
   * @returns {Object|null} { date, kcal, target, ratio, meals, isFastingDay, isIncomplete }
   */
  function getYesterdayData() {
    const yesterdayKey = getYesterdayKey();
    const dayData = lsGet(`heys_dayv2_${yesterdayKey}`, null);

    if (!dayData) {
      return null;
    }

    // Суммируем калории из приёмов пищи
    const meals = dayData.meals || [];
    let totalKcal = 0;
    let totalProt = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalSimple = 0;

    const toNumber = (val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'string') {
        const cleaned = val.replace(',', '.').trim();
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
      }
      const num = Number(val);
      return Number.isFinite(num) ? num : 0;
    };

    const computeKcalFromMacros = (obj) => {
      if (!obj) return 0;
      const prot = toNumber(obj.protein100) || toNumber(obj.prot100);
      const carbs = toNumber(obj.carbs100) || (toNumber(obj.simple100) + toNumber(obj.complex100));
      const fat = toNumber(obj.fat100) || (toNumber(obj.badFat100) + toNumber(obj.goodFat100) + toNumber(obj.trans100));

      // Если есть только белок (мясо без полных данных), оценить жиры как 30% от белка
      // Типично для индейки/курицы: 25г белка → ~8г жира
      const estimatedFat = (prot > 0 && fat === 0 && carbs === 0) ? prot * 0.3 : fat;

      const kcal = (prot * 3) + (carbs * 4) + (estimatedFat * 9); // NET Atwater
      return Number.isFinite(kcal) ? kcal : 0;
    };

    let productsAvailable = false;
    let productsList = [];
    try {
      const storedProducts = lsGet('heys_products', []) || [];
      if (Array.isArray(storedProducts) && storedProducts.length > 0) {
        productsAvailable = true;
        productsList = storedProducts;
      }
    } catch (e) { }
    if (!productsAvailable && HEYS.products?.getAll) {
      const list = HEYS.products.getAll();
      if (Array.isArray(list) && list.length > 0) {
        productsAvailable = true;
        productsList = list;
      }
    }

    const productIndex = (HEYS.models?.buildProductIndex && productsAvailable)
      ? HEYS.models.buildProductIndex(productsList)
      : null;
    const useMealTotals = !!(HEYS.models?.mealTotals && productIndex);

    let itemsCount = 0;
    const sampleItems = [];

    for (const meal of meals) {
      const items = meal.items || [];
      itemsCount += items.length;

      if (useMealTotals) {
        const totals = HEYS.models.mealTotals(meal, productIndex) || {};
        totalKcal += toNumber(totals.kcal);
        totalProt += toNumber(totals.prot);
        totalCarbs += toNumber(totals.carbs);
        totalFat += toNumber(totals.fat);
        totalSimple += toNumber(totals.simple);
      } else {
        for (const item of items) {
          const grams = toNumber(item.grams);
          if (!grams) continue;

          // 🔧 FIX v1.2.0: Приоритет item snapshot, затем product
          // Item хранит snapshot данных при добавлении — это основной источник
          const product = getProductById(item.product_id);

          // Функция для получения первого валидного kcal100 (>0)
          const getValidKcal = (...sources) => {
            for (const src of sources) {
              const val = toNumber(src);
              if (val > 0) return val;
            }
            return 0;
          };

          // Приоритет: item.kcal100 → product.kcal100 → вычисление из макросов item → вычисление из макросов product
          const kcal100 = getValidKcal(
            item.kcal100,
            product?.kcal100,
            computeKcalFromMacros(item),
            computeKcalFromMacros(product)
          );
          // Для items без данных — попробовать взять из product в базе
          const productProt = toNumber(product?.protein100);
          const productCarbs = toNumber(product?.carbs100);
          const productFat = toNumber(product?.fat100);

          const prot100 = getValidKcal(item.protein100, productProt);
          const carbs100 = getValidKcal(item.carbs100, productCarbs);
          const fat100 = getValidKcal(item.fat100, productFat);
          const simple100 = getValidKcal(item.simple100, product?.simple100);
          const lineKcal = (kcal100 * grams) / 100;

          // Флаг неполных данных
          const isIncompleteItem = kcal100 === 0 || (item.kcal100 === undefined && !product?.kcal100);

          totalKcal += lineKcal;
          totalProt += prot100 * grams / 100;
          totalCarbs += carbs100 * grams / 100;
          totalFat += fat100 * grams / 100;
          totalSimple += simple100 * grams / 100;

          if (sampleItems.length < 5) {  // Увеличил до 5 для отладки
            sampleItems.push({
              id: item.id || null,
              name: item.name || null,
              product_id: item.product_id || null,
              grams,
              kcal100: item.kcal100 ?? null,
              kcal100Resolved: kcal100,
              lineKcal: Number.isFinite(lineKcal) ? Math.round(lineKcal * 10) / 10 : null,
              protein100: item.protein100 ?? null,
              carbs100: item.carbs100 ?? null,
              fat100: item.fat100 ?? null,
              simple100: item.simple100 ?? null,
              complex100: item.complex100 ?? null,
              hasProduct: !!product,
              productKcal100: product?.kcal100 ?? null,
              productProtein100: product?.protein100 ?? null,
              isIncomplete: isIncompleteItem,
            });
          }
        }
      }

      if (useMealTotals && sampleItems.length < 5) {
        for (const item of items) {
          if (sampleItems.length >= 5) break;
          const grams = toNumber(item.grams);
          if (!grams) continue;

          const productFromItem = HEYS.models?.getProductFromItem
            ? HEYS.models.getProductFromItem(item, productIndex)
            : getProductById(item.product_id);
          const derived = HEYS.models?.computeDerivedProduct
            ? HEYS.models.computeDerivedProduct(productFromItem || {})
            : { kcal100: 0 };
          const resolvedKcal100 = toNumber(productFromItem?.kcal100) || toNumber(derived.kcal100);
          const lineKcal = (resolvedKcal100 * grams) / 100;
          const isIncompleteItem = resolvedKcal100 === 0;

          sampleItems.push({
            id: item.id || null,
            name: item.name || null,
            product_id: item.product_id || null,
            grams,
            kcal100: item.kcal100 ?? null,
            kcal100Resolved: resolvedKcal100,
            lineKcal: Number.isFinite(lineKcal) ? Math.round(lineKcal * 10) / 10 : null,
            protein100: item.protein100 ?? null,
            carbs100: item.carbs100 ?? null,
            fat100: item.fat100 ?? null,
            simple100: item.simple100 ?? null,
            complex100: item.complex100 ?? null,
            hasProduct: !!productFromItem,
            productKcal100: productFromItem?.kcal100 ?? null,
            productProtein100: productFromItem?.protein100 ?? null,
            isIncomplete: isIncompleteItem,
          });
        }
      }
    }

    // Получаем норму для вчера (используем профиль и deficitPct)
    const profile = lsGet('heys_profile', {});
    const norms = lsGet('heys_norms', {});
    const target = calculateDayTarget(dayData, profile, norms);

    const ratio = target > 0 ? totalKcal / target : 0;

    const roundedKcal = Math.round(totalKcal);
    if (roundedKcal === 0 && meals.length > 0) {
      const debugKey = `heys_debug_yesterday_zero_${yesterdayKey}`;
      let alreadyLogged = false;
      try {
        alreadyLogged = sessionStorage.getItem(debugKey) === '1';
      } catch (e) { }
      try {
        if (!alreadyLogged) {
          const payload = {
            date: yesterdayKey,
            mealCount: meals.length,
            itemsCount,
            productsAvailable,
            hasMeals: meals.length > 0,
            hasItems: itemsCount > 0,
            sampleItems,
          };
          try {
            localStorage.setItem('heys_debug_yesterday_zero_payload', JSON.stringify(payload));
          } catch (e) { }
        }
        if (!alreadyLogged && HEYS.analytics?.trackDataOperation) {
          HEYS.analytics.trackDataOperation('yesterday_kcal_zero', 1, {
            date: yesterdayKey,
            mealCount: meals.length,
            itemsCount,
            productsAvailable,
            hasMeals: meals.length > 0,
            hasItems: itemsCount > 0,
            sampleItems,
          });
          try { sessionStorage.setItem(debugKey, '1'); } catch (e) { }
        }
      } catch (e) { }
    }

    return {
      date: yesterdayKey,
      kcal: roundedKcal,
      target: Math.round(target),
      ratio,
      meals,
      mealCount: meals.length,
      itemsCount,
      sampleItems,
      totalKcalRaw: Number.isFinite(totalKcal) ? Math.round(totalKcal * 10) / 10 : null,
      totalKcalIsFinite: Number.isFinite(totalKcal),
      productsAvailable,
      macros: {
        prot: Math.round(totalProt * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
        simple: Math.round(totalSimple * 10) / 10
      },
      isFastingDay: dayData.isFastingDay || false,
      isIncomplete: dayData.isIncomplete || false,
      hasBeenVerified: dayData.isFastingDay !== undefined || dayData.isIncomplete !== undefined
    };
  }

  /**
   * Получить продукт по ID (из индекса или базы)
   */
  function getProductById(productId) {
    if (!productId) return null;

    // Пробуем через HEYS.products
    if (HEYS.products?.getById) {
      return HEYS.products.getById(productId);
    }

    // Fallback: ищем в localStorage
    const products = lsGet('heys_products', []);
    return products.find(p => p.id === productId || p.id === String(productId));
  }

  /**
   * Рассчитать норму калорий для дня
   * 🔬 TDEE v1.2.0: Консолидировано — делегируем в единый модуль HEYS.TDEE
   */
  function calculateDayTarget(dayData, profile, norms) {
    // Если доступен единый модуль TDEE — используем его (точный расчёт)
    if (HEYS.TDEE?.calculate) {
      const result = HEYS.TDEE.calculate(dayData, profile, { lsGet });
      return result.optimum || 2000; // optimum = baseExpenditure * (1 + deficitPct/100)
    }

    // Fallback: упрощённый расчёт (legacy, на случай если модуль не загружен)
    const weight = profile.weight || 70;
    const height = profile.height || 170;
    const age = profile.age || 30;
    const gender = profile.gender || 'Мужской';

    // Mifflin-St Jeor formula
    const isMale = gender !== 'Женский';
    const bmr = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);

    // Коэффициент активности (fallback — не учитывает реальные тренировки/шаги)
    const activityMultiplier = {
      'sedentary': 1.2,
      'light': 1.375,
      'moderate': 1.55,
      'active': 1.725,
      'very_active': 1.9
    }[profile.activityLevel || 'moderate'] || 1.55;

    const tdee = bmr * activityMultiplier;

    // Применяем дефицит/профицит
    const deficitPct = dayData.deficitPct ?? profile.deficitPctTarget ?? 0;
    const target = tdee * (1 + deficitPct / 100);

    return target;
  }

  /**
   * Проверить, нужно ли показывать шаг верификации
   * @returns {boolean}
   */
  function shouldShowYesterdayVerify() {
    const data = getYesterdayData();

    if (!data) {
      return false;
    }

    // Уже было верифицировано — не показываем повторно
    if (data.hasBeenVerified) {
      return false;
    }

    // Показываем если вчера было <50% калорий И хотя бы 1 приём пищи
    // (если 0 приёмов — это просто пустой день, не требует вопроса)
    return data.ratio < 0.5 && data.mealCount > 0;
  }

  // === Варианты ответов ===
  const VERIFY_OPTIONS = [
    {
      id: 'fasting',
      icon: '🍃',
      title: 'Реальное голодание',
      desc: 'Данные корректны — я сознательно ел меньше',
      color: '#22c55e' // зелёный
    },
    {
      id: 'incomplete',
      icon: '📝',
      title: 'Незаполненные данные',
      desc: 'Забыл внести приёмы пищи — день неполный',
      color: '#f97316' // оранжевый
    }
  ];

  // === Действия для неполных данных ===
  const INCOMPLETE_ACTIONS = [
    {
      id: 'fill_later',
      icon: '✏️',
      title: 'Дозаполнить позже',
      desc: 'Напомни мне заполнить по памяти'
    },
    {
      id: 'clear_day',
      icon: '🗑️',
      title: 'Очистить день',
      desc: 'Удалить все приёмы (0 ккал — не учитывается в статистике)'
    }
  ];

  // === React компонент шага ===
  function YesterdayVerifyStepComponent({ data, onChange, context }) {
    const [step, setStep] = React.useState('choice'); // 'choice' | 'incomplete_action'
    const [yesterdayInfo, setYesterdayInfo] = React.useState(null);

    // Загружаем данные вчера
    React.useEffect(() => {
      const info = getYesterdayData();
      setYesterdayInfo(info);
      try {
        if (info) {
          localStorage.setItem('heys_debug_yesterday_info', JSON.stringify(info));
        } else {
          localStorage.setItem('heys_debug_yesterday_info', JSON.stringify({ empty: true }));
        }
      } catch (e) { }

      if (info && info.kcal === 0 && info.mealCount > 0 && !info.productsAvailable) {
        let attempts = 0;
        const maxAttempts = 12;
        const intervalMs = 250;
        const timer = setInterval(() => {
          attempts += 1;
          const refreshed = getYesterdayData();
          if (refreshed && (refreshed.productsAvailable || refreshed.kcal > 0)) {
            setYesterdayInfo(refreshed);
            clearInterval(timer);
            return;
          }
          if (attempts >= maxAttempts) {
            clearInterval(timer);
          }
        }, intervalMs);
        return () => clearInterval(timer);
      }
    }, []);

    // Текущий выбор
    const selectedOption = data.verifyOption || null;
    const selectedAction = data.incompleteAction || null;

    // Обработчик выбора основного варианта
    const handleOptionSelect = (optionId) => {
      onChange({ ...data, verifyOption: optionId });

      if (optionId === 'incomplete') {
        // Переходим к выбору действия
        setStep('incomplete_action');
      }
      // Если fasting — данные автоматически сохраняются при переходе к след. шагу
    };

    // Обработчик выбора действия для неполных данных
    const handleActionSelect = (actionId) => {
      onChange({ ...data, incompleteAction: actionId });
    };

    // Кнопка "Назад"
    const handleBack = () => {
      setStep('choice');
      onChange({ ...data, incompleteAction: null });
    };

    if (!yesterdayInfo) {
      return React.createElement('div', { className: 'yv-loading' }, 'Загрузка...');
    }

    // === Экран 1: Выбор типа (голодание / незаполненные) ===
    if (step === 'choice') {
      return React.createElement('div', { className: 'yv-step' },
        // Информация о вчера
        React.createElement('div', { className: 'yv-info' },
          React.createElement('div', { className: 'yv-info-icon' }, '📊'),
          React.createElement('div', { className: 'yv-info-text' },
            React.createElement('div', { className: 'yv-info-date' },
              'Вчера, ' + formatDateRu(yesterdayInfo.date)
            ),
            React.createElement('div', { className: 'yv-info-stats' },
              React.createElement('span', { className: 'yv-info-kcal' },
                yesterdayInfo.kcal + ' ккал'
              ),
              ' из ',
              React.createElement('span', { className: 'yv-info-target' },
                yesterdayInfo.target + ' ккал'
              ),
              React.createElement('span', { className: 'yv-info-percent' },
                ' (' + Math.round(yesterdayInfo.ratio * 100) + '%)'
              )
            )
          )
        ),

        // Вопрос
        React.createElement('div', { className: 'yv-question' },
          'Что это было?'
        ),

        // Варианты
        React.createElement('div', { className: 'yv-options' },
          VERIFY_OPTIONS.map(opt =>
            React.createElement('button', {
              key: opt.id,
              type: 'button',
              className: 'yv-option' + (selectedOption === opt.id ? ' yv-option--selected' : ''),
              onClick: () => handleOptionSelect(opt.id),
              style: selectedOption === opt.id ? { borderColor: opt.color } : {}
            },
              React.createElement('span', { className: 'yv-option-icon' }, opt.icon),
              React.createElement('div', { className: 'yv-option-content' },
                React.createElement('div', { className: 'yv-option-title' }, opt.title),
                React.createElement('div', { className: 'yv-option-desc' }, opt.desc)
              ),
              selectedOption === opt.id && React.createElement('span', {
                className: 'yv-option-check',
                style: { color: opt.color }
              }, '✓')
            )
          )
        ),

        // Подсказка
        React.createElement('div', { className: 'yv-hint' },
          '💡 Это поможет точнее считать статистику и прогнозы'
        )
      );
    }

    // === Экран 2: Действия для неполных данных ===
    if (step === 'incomplete_action') {
      return React.createElement('div', { className: 'yv-step' },
        // Кнопка назад
        React.createElement('button', {
          type: 'button',
          className: 'yv-back',
          onClick: handleBack
        }, '← Назад'),

        // Заголовок
        React.createElement('div', { className: 'yv-subtitle' },
          '📝 Незаполненные данные'
        ),

        // Вопрос
        React.createElement('div', { className: 'yv-question' },
          'Что сделать с этим днём?'
        ),

        // Действия
        React.createElement('div', { className: 'yv-options' },
          INCOMPLETE_ACTIONS.map(act =>
            React.createElement('button', {
              key: act.id,
              type: 'button',
              className: 'yv-option' + (selectedAction === act.id ? ' yv-option--selected' : ''),
              onClick: () => handleActionSelect(act.id)
            },
              React.createElement('span', { className: 'yv-option-icon' }, act.icon),
              React.createElement('div', { className: 'yv-option-content' },
                React.createElement('div', { className: 'yv-option-title' }, act.title),
                React.createElement('div', { className: 'yv-option-desc' }, act.desc)
              ),
              selectedAction === act.id && React.createElement('span', {
                className: 'yv-option-check'
              }, '✓')
            )
          )
        ),

        // Предупреждение для очистки
        selectedAction === 'clear_day' && React.createElement('div', { className: 'yv-warning' },
          '⚠️ Все приёмы пищи за вчера будут удалены. Это действие необратимо.'
        ),

        // Подсказка для дозаполнения
        selectedAction === 'fill_later' && React.createElement('div', { className: 'yv-hint' },
          '📅 День будет отмечен как неполный. Ты можешь дополнить его в любое время.'
        )
      );
    }

    return null;
  }

  /**
   * Форматировать дату по-русски
   */
  function formatDateRu(dateStr) {
    if (!dateStr) return '';
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const d = new Date(dateStr);
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  /**
   * Сохранение данных шага
   */
  function saveYesterdayVerify(data) {
    const yesterdayKey = getYesterdayKey();
    const dayData = lsGet(`heys_dayv2_${yesterdayKey}`, { date: yesterdayKey }) || { date: yesterdayKey };

    if (data.verifyOption === 'fasting') {
      // Реальное голодание — помечаем день
      dayData.isFastingDay = true;
      dayData.isIncomplete = false;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${yesterdayKey}`, dayData);

      devLog('[YesterdayVerify] ✅ Marked as fasting day:', yesterdayKey);

    } else if (data.verifyOption === 'incomplete') {
      // Незаполненные данные
      dayData.isFastingDay = false;

      if (data.incompleteAction === 'clear_day') {
        // Очистить все приёмы пищи
        dayData.meals = [];
        dayData.isIncomplete = false; // День "пустой", не неполный
        dayData.updatedAt = Date.now();
        lsSet(`heys_dayv2_${yesterdayKey}`, dayData);

        devLog('[YesterdayVerify] 🗑️ Cleared all meals for:', yesterdayKey);

        // Уведомляем об изменении
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: yesterdayKey, field: 'meals', value: [], source: 'yesterday-verify-clear' }
        }));

      } else if (data.incompleteAction === 'fill_later') {
        // Пометить как неполный для дозаполнения
        dayData.isIncomplete = true;
        dayData.updatedAt = Date.now();
        lsSet(`heys_dayv2_${yesterdayKey}`, dayData);

        devLog('[YesterdayVerify] 📝 Marked as incomplete:', yesterdayKey);

        // TODO: Можно добавить напоминание через notifications
      }
    }

    // Уведомляем о изменении
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: yesterdayKey, source: 'yesterday-verify' }
    }));
  }

  // === Регистрация шага ===
  let _registerRetries = 0;
  function registerYesterdayVerifyStep() {
    if (!HEYS.StepModal?.registerStep) {
      if (_registerRetries < 20) {
        _registerRetries++;
        setTimeout(registerYesterdayVerifyStep, 500);
      } else {
        devWarn('[YesterdayVerify] HEYS.StepModal not found after 10s');
      }
      return;
    }

    HEYS.StepModal.registerStep('yesterdayVerify', {
      title: 'Данные за вчера',
      hint: 'Проверка калорий',
      icon: '📊',
      component: YesterdayVerifyStepComponent,
      canSkip: false, // Обязательный шаг если показывается

      shouldShow: () => {
        return shouldShowYesterdayVerify();
      },

      getInitialData: () => {
        return {
          verifyOption: null,
          incompleteAction: null
        };
      },

      // Валидация: нужно выбрать вариант
      validate: (data) => {
        if (!data.verifyOption) {
          return { valid: false, error: 'Выбери один из вариантов' };
        }
        // Если выбрали incomplete — нужно выбрать действие
        if (data.verifyOption === 'incomplete' && !data.incompleteAction) {
          return { valid: false, error: 'Выбери что делать с днём' };
        }
        return { valid: true };
      },

      save: saveYesterdayVerify,

      xpAction: 'yesterday_verify'
    });

    devLog('[YesterdayVerify] ✅ Step registered');
  }

  // Запускаем регистрацию
  registerYesterdayVerifyStep();

  // === Экспорт API ===
  HEYS.YesterdayVerify = {
    getYesterdayKey,
    getYesterdayData,
    shouldShow: shouldShowYesterdayVerify,
    VERIFY_OPTIONS,
    INCOMPLETE_ACTIONS
  };

  devLog('[HEYS] YesterdayVerify v1.1.1 loaded');

})(typeof window !== 'undefined' ? window : global);
