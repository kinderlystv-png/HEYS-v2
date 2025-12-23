// heys_yesterday_verify_v1.js — Верификация вчерашних данных
// Показывается в утреннем чек-ине если вчера было <50% калорий от нормы
// Спрашивает: это реальное голодание или незаполненные приёмы пищи?
//
// Версия: 1.0.0
// 
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === Утилиты ===
  const lsGet = (k, d) => {
    if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(k, d);
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
  };
  
  const lsSet = (k, v) => {
    if (HEYS.utils?.lsSet) return HEYS.utils.lsSet(k, v);
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };
  
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
    
    for (const meal of meals) {
      const items = meal.items || [];
      for (const item of items) {
        // Получаем продукт по ID
        const product = getProductById(item.product_id);
        if (product && item.grams) {
          totalKcal += (product.kcal100 || 0) * item.grams / 100;
        }
      }
    }
    
    // Получаем норму для вчера (используем профиль и deficitPct)
    const profile = lsGet('heys_profile', {});
    const norms = lsGet('heys_norms', {});
    const target = calculateDayTarget(dayData, profile, norms);
    
    const ratio = target > 0 ? totalKcal / target : 0;
    
    return {
      date: yesterdayKey,
      kcal: Math.round(totalKcal),
      target: Math.round(target),
      ratio,
      meals,
      mealCount: meals.length,
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
   */
  function calculateDayTarget(dayData, profile, norms) {
    // Упрощённый расчёт TDEE
    // Полный расчёт в heys_day_v12.js слишком сложный для дублирования
    // Используем базовый BMR × коэффициент активности
    
    const weight = profile.weight || 70;
    const height = profile.height || 170;
    const age = profile.age || 30;
    const gender = profile.gender || 'Мужской';
    
    // Mifflin-St Jeor formula
    let bmr;
    if (gender === 'Мужской') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }
    
    // Коэффициент активности
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
      
      console.log('[YesterdayVerify] ✅ Marked as fasting day:', yesterdayKey);
      
    } else if (data.verifyOption === 'incomplete') {
      // Незаполненные данные
      dayData.isFastingDay = false;
      
      if (data.incompleteAction === 'clear_day') {
        // Очистить все приёмы пищи
        dayData.meals = [];
        dayData.isIncomplete = false; // День "пустой", не неполный
        dayData.updatedAt = Date.now();
        lsSet(`heys_dayv2_${yesterdayKey}`, dayData);
        
        console.log('[YesterdayVerify] 🗑️ Cleared all meals for:', yesterdayKey);
        
        // Уведомляем об изменении
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: yesterdayKey, field: 'meals', value: [], source: 'yesterday-verify-clear' }
        }));
        
      } else if (data.incompleteAction === 'fill_later') {
        // Пометить как неполный для дозаполнения
        dayData.isIncomplete = true;
        dayData.updatedAt = Date.now();
        lsSet(`heys_dayv2_${yesterdayKey}`, dayData);
        
        console.log('[YesterdayVerify] 📝 Marked as incomplete:', yesterdayKey);
        
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
        console.warn('[YesterdayVerify] HEYS.StepModal not found after 10s');
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
    
    console.log('[YesterdayVerify] ✅ Step registered');
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
  
  console.log('[HEYS] YesterdayVerify v1.0.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
