// heys_refeed_v1.js — Модуль Refeed Day (загрузочный день)
// Отдельный модуль для оптимизации проекта
// v1.0.0 | 2025-12-12
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === КОНСТАНТЫ ===
  const REFEED_BOOST_PCT = 0.35; // +35% к норме
  const REFEED_THRESHOLD = 1000; // Порог долга для рекомендации (ккал)
  const REFEED_CONSECUTIVE = 5;  // Дней подряд в дефиците для рекомендации
  const REFEED_OK_RATIO = 1.35;  // Допустимый перебор в refeed день
  
  // Причины refeed дня (для осознанного выбора)
  const REFEED_REASONS = [
    { id: 'deficit', icon: '💰', label: 'Восстановление после дефицита', desc: 'Накопился долг калорий' },
    { id: 'training', icon: '💪', label: 'После интенсивной тренировки', desc: 'Нужно восстановить гликоген' },
    { id: 'holiday', icon: '🎉', label: 'Праздник / особый день', desc: 'Запланированное превышение' },
    { id: 'rest', icon: '🧘', label: 'Ментальный отдых от диеты', desc: 'Снятие психологического напряжения' }
  ];
  
  // Зоны выполнения refeed дня
  const REFEED_ZONES = {
    ok: { id: 'refeed_ok', name: 'Refeed выполнен', color: '#22c55e', textColor: '#fff', icon: '✅' },
    over: { id: 'refeed_over', name: 'Перебор refeed', color: '#f59e0b', textColor: '#fff', icon: '⚠️' },
    under: { id: 'refeed_under', name: 'Refeed не выполнен', color: '#eab308', textColor: '#000', icon: '📉' },
    binge: { id: 'refeed_binge', name: 'Сильный перебор', color: '#ef4444', textColor: '#fff', icon: '🚨' }
  };

  // === УТИЛИТЫ ===
  
  /**
   * Получить зону refeed дня по ratio
   * @param {number} ratio - eaten/optimum
   * @param {boolean} isRefeedDay - отмечен ли день как refeed
   * @returns {Object} зона
   */
  function getRefeedZone(ratio, isRefeedDay) {
    if (!isRefeedDay) return null;
    
    if (ratio < 0.9) return REFEED_ZONES.under;
    if (ratio >= 0.9 && ratio <= REFEED_OK_RATIO) return REFEED_ZONES.ok;
    if (ratio > REFEED_OK_RATIO && ratio <= 1.5) return REFEED_ZONES.over;
    return REFEED_ZONES.binge;
  }
  
  /**
   * Проверить нужна ли автоматическая рекомендация refeed
   * @param {Object} caloricDebt - данные о долге из heys_day_v12
   * @returns {boolean}
   */
  function shouldRecommendRefeed(caloricDebt) {
    if (!caloricDebt) return false;
    return caloricDebt.needsRefeed === true;
  }
  
  /**
   * Вычислить скорректированную норму для refeed дня
   * @param {number} optimum - базовая норма
   * @param {boolean} isRefeedDay - отмечен ли день
   * @returns {number}
   */
  function getRefeedOptimum(optimum, isRefeedDay) {
    if (!isRefeedDay) return optimum;
    return Math.round(optimum * (1 + REFEED_BOOST_PCT));
  }
  
  /**
   * Получить причину refeed по ID
   * @param {string} reasonId
   * @returns {Object|null}
   */
  function getReasonById(reasonId) {
    return REFEED_REASONS.find(r => r.id === reasonId) || null;
  }
  
  /**
   * Проверить должен ли день исключаться из weight trend
   * @param {Object} dayData - данные дня
   * @returns {boolean}
   */
  function shouldExcludeFromWeightTrend(dayData) {
    return dayData?.isRefeedDay === true;
  }
  
  /**
   * Проверить нужно ли показывать шаг refeed в чек-ине
   * Показываем всегда после sleepQuality — клиент сам решает
   * @returns {boolean}
   */
  function shouldShowRefeedStep() {
    // Всегда показываем шаг — клиент может осознанно выбрать refeed
    // Система подсветит рекомендацию если есть caloric debt
    return true;
  }
  
  /**
   * Проверить сохраняется ли streak в refeed день
   * @param {number} ratio - eaten/optimum
   * @param {boolean} isRefeedDay
   * @returns {boolean}
   */
  function isStreakPreserved(ratio, isRefeedDay) {
    if (!isRefeedDay) return false;
    // Streak сохраняется при ratio 0.70-1.35 в refeed день
    return ratio >= 0.70 && ratio <= REFEED_OK_RATIO;
  }
  
  /**
   * 🆕 Получить статистику refeed дней за последние N дней
   * @param {number} days - количество дней для анализа (default: 30)
   * @returns {Object} статистика { count, avgExcessPct, lastRefeedDate, reasons }
   */
  function getHistoryStats(days = 30) {
    const lsGet = HEYS.utils?.lsGet || ((k, d) => {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
    });
    
    const stats = {
      count: 0,
      avgExcessPct: 0,
      lastRefeedDate: null,
      lastRefeedDaysAgo: null,
      reasons: {},  // { manual: 3, caloric_debt: 2, ... }
      totalExcessKcal: 0,
      daysAnalyzed: days
    };
    
    const today = new Date();
    const excessList = [];
    
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, null);
      
      if (day?.isRefeedDay === true) {
        stats.count++;
        
        // Последний refeed
        if (!stats.lastRefeedDate) {
          stats.lastRefeedDate = dateKey;
          stats.lastRefeedDaysAgo = i;
        }
        
        // Причина
        const reason = day.refeedReason || 'manual';
        stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
        
        // Процент превышения (если есть данные о калориях)
        if (day.meals && Array.isArray(day.meals)) {
          // Сумма калорий
          const profile = lsGet('heys_profile', {});
          const optimum = profile.optimum || 2000;
          const refeedOptimum = getRefeedOptimum(optimum, true);
          
          const eatenKcal = day.meals.reduce((sum, meal) => {
            if (!meal.items) return sum;
            return sum + meal.items.reduce((s, item) => s + (item.kcal || 0), 0);
          }, 0);
          
          if (eatenKcal > 0) {
            const excessPct = ((eatenKcal / refeedOptimum) - 1) * 100;
            excessList.push(excessPct);
            stats.totalExcessKcal += Math.max(0, eatenKcal - optimum);
          }
        }
      }
    }
    
    // Средний процент превышения
    if (excessList.length > 0) {
      stats.avgExcessPct = Math.round(excessList.reduce((a, b) => a + b, 0) / excessList.length);
    }
    
    return stats;
  }
  
  /**
   * Получить label причины с guardrail fallback
   * @param {string} reasonId - ID причины
   * @returns {Object} { id, icon, label, desc }
   */
  function getReasonLabel(reasonId) {
    if (!reasonId) return { id: 'none', icon: '🔄', label: 'Без причины', desc: 'Причина не указана' };
    const found = REFEED_REASONS.find(r => r.id === reasonId);
    if (found) return found;
    // Fallback для неизвестных причин (legacy данные)
    return { id: 'other', icon: '❓', label: 'Другое', desc: reasonId };
  }
  
  /**
   * 🆕 Единая точка правды о refeed дне — все UI компоненты берут отсюда
   * @param {Object} dayData - данные дня { isRefeedDay, refeedReason, ... }
   * @param {number} ratio - kcal/optimum (опционально)
   * @returns {Object} полная метаинформация о refeed
   */
  function getDayMeta(dayData, ratio = null) {
    const isRefeedDay = dayData?.isRefeedDay === true;
    const reasonId = dayData?.refeedReason || null;
    const reason = isRefeedDay ? getReasonLabel(reasonId) : null;
    
    // Зона выполнения (если есть ratio)
    const zone = ratio !== null && isRefeedDay ? getRefeedZone(ratio, true) : null;
    const isStreakDay = ratio !== null && isRefeedDay ? isStreakPreserved(ratio, true) : null;
    
    // Heatmap статус
    let heatmapStatus = null;
    if (ratio !== null && isRefeedDay) {
      if (zone?.id === 'refeed_ok') heatmapStatus = 'green';
      else if (zone?.id === 'refeed_under' || zone?.id === 'refeed_over') heatmapStatus = 'yellow';
      else if (zone?.id === 'refeed_binge') heatmapStatus = 'red';
    }
    
    // Tooltip текст
    const tooltip = isRefeedDay 
      ? `🔄 Загрузочный день\n${reason?.icon || ''} ${reason?.label || ''}\n${ratio !== null ? '\nВыполнение: ' + Math.round(ratio * 100) + '%' : ''}\n\n✅ Это НЕ срыв — это часть стратегии\n✅ Норма расширена до 135%${isStreakDay === true ? '\n✅ Streak сохраняется' : (isStreakDay === false ? '\n⚠️ Для streak нужно 70-135%' : '')}`
      : null;
    
    return {
      isRefeedDay,
      reasonId,
      reason,
      zone,
      isStreakDay,
      heatmapStatus,
      tooltip,
      color: isRefeedDay ? '#f97316' : null,  // orange-500
      badge: isRefeedDay ? '🔄' : null,
      cssClass: isRefeedDay ? 'refeed-day' : null
    };
  }

  // === REACT КОМПОНЕНТЫ ===
  
  /**
   * Шаг утреннего чек-ина — Refeed Day
   */
  function RefeedDayStepComponent({ data, onChange }) {
    const { useState, useCallback, useMemo } = React;
    
    const [isRefeedDay, setIsRefeedDay] = useState(data?.isRefeedDay ?? null);
    const [refeedReason, setRefeedReason] = useState(data?.refeedReason ?? null);
    
    // Получаем данные о калорийном долге
    const caloricDebt = useMemo(() => {
      return HEYS.caloricDebt || null;
    }, []);
    
    const needsRefeed = shouldRecommendRefeed(caloricDebt);
    const debt = caloricDebt?.debt || 0;
    const refeedBoost = caloricDebt?.refeedBoost || 0;
    const adjustedOptimum = caloricDebt?.adjustedOptimum || 0;

    // Обработчик выбора Да/Нет
    const handleSelect = useCallback((value) => {
      setIsRefeedDay(value);
      if (value === false) {
        setRefeedReason(null);
      }
      onChange({ isRefeedDay: value, refeedReason: value ? refeedReason : null });
      try { navigator.vibrate?.(10); } catch(e) {}
    }, [onChange, refeedReason]);
    
    // Обработчик выбора причины
    const handleReasonSelect = useCallback((reasonId) => {
      setRefeedReason(reasonId);
      onChange({ isRefeedDay: true, refeedReason: reasonId });
      try { navigator.vibrate?.(15); } catch(e) {}
    }, [onChange]);

    return React.createElement('div', { className: 'refeed-step' },
      // Заголовок
      React.createElement('div', { className: 'refeed-header' },
        React.createElement('span', { className: 'refeed-icon' }, '🔄'),
        React.createElement('h3', { className: 'refeed-title' }, 'Загрузочный день?')
      ),

      // Подсказка от системы (если есть рекомендация)
      needsRefeed && React.createElement('div', { className: 'refeed-hint refeed-hint--system' },
        React.createElement('div', { className: 'refeed-hint-icon' }, '💡'),
        React.createElement('div', { className: 'refeed-hint-content' },
          React.createElement('div', { className: 'refeed-hint-title' }, 'Система рекомендует загрузку'),
          React.createElement('div', { className: 'refeed-hint-details' }, 
            'Накопился долг: ' + debt + ' ккал. Норма сегодня +' + refeedBoost + ' ккал'
          )
        )
      ),

      // Кнопки выбора Да/Нет
      React.createElement('div', { className: 'refeed-options' },
        React.createElement('button', {
          type: 'button',
          className: 'refeed-option refeed-option--yes' + (isRefeedDay === true ? ' active' : ''),
          onClick: () => handleSelect(true)
        },
          React.createElement('span', { className: 'refeed-option-icon' }, '🔄'),
          React.createElement('span', { className: 'refeed-option-label' }, 'Да, загрузка'),
          isRefeedDay === true && React.createElement('span', { className: 'refeed-option-check' }, '✓')
        ),
        React.createElement('button', {
          type: 'button',
          className: 'refeed-option refeed-option--no' + (isRefeedDay === false ? ' active' : ''),
          onClick: () => handleSelect(false)
        },
          React.createElement('span', { className: 'refeed-option-icon' }, '📊'),
          React.createElement('span', { className: 'refeed-option-label' }, 'Обычный день'),
          isRefeedDay === false && React.createElement('span', { className: 'refeed-option-check' }, '✓')
        )
      ),

      // Выбор причины (если выбрана загрузка)
      isRefeedDay === true && React.createElement('div', { className: 'refeed-reasons' },
        React.createElement('div', { className: 'refeed-reasons-label' }, 'Причина загрузки:'),
        React.createElement('div', { className: 'refeed-reasons-grid' },
          REFEED_REASONS.map(reason => 
            React.createElement('button', {
              key: reason.id,
              type: 'button',
              className: 'refeed-reason' + (refeedReason === reason.id ? ' active' : ''),
              onClick: () => handleReasonSelect(reason.id),
              title: reason.desc
            },
              React.createElement('span', { className: 'refeed-reason-icon' }, reason.icon),
              React.createElement('span', { className: 'refeed-reason-label' }, reason.label)
            )
          )
        )
      ),

      // Информация о лимите калорий (если выбран refeed)
      isRefeedDay === true && adjustedOptimum > 0 && React.createElement('div', { className: 'refeed-info' },
        React.createElement('div', { className: 'refeed-info-icon' }, '🎯'),
        React.createElement('div', { className: 'refeed-info-content' },
          React.createElement('div', { className: 'refeed-info-title' }, 'Сегодня норма'),
          React.createElement('div', { className: 'refeed-info-value' }, 
            adjustedOptimum + ' ккал',
            React.createElement('span', { className: 'refeed-info-boost' }, ' (+35%)')
          )
        )
      ),

      // Подсказка для обычного дня
      isRefeedDay === false && React.createElement('div', { className: 'refeed-regular-hint' },
        '📊 Придерживайся обычной нормы калорий'
      )
    );
  }
  
  /**
   * Карточка Refeed Day для отображения в статистике
   * @param {Object} props
   */
  function RefeedCard({ day, optimum, eatenKcal, caloricDebt }) {
    if (day?.isRefeedDay !== true) return null;
    
    const adjustedOptimum = getRefeedOptimum(optimum, true);
    const ratio = eatenKcal / adjustedOptimum;
    const zone = getRefeedZone(ratio, true);
    const reason = getReasonById(day.refeedReason);
    const diff = eatenKcal - adjustedOptimum;
    
    return React.createElement('div', {
      className: 'refeed-card compact-card',
      key: 'refeed-card'
    },
      React.createElement('div', { className: 'refeed-card__header' },
        React.createElement('span', { className: 'refeed-card__icon' }, '🔄'),
        React.createElement('span', { className: 'refeed-card__title' }, 'Загрузочный день'),
        React.createElement('span', { 
          className: 'refeed-card__status refeed-card__status--' + zone.id,
          style: { background: zone.color + '20', color: zone.color }
        }, 
          zone.icon,
          ' ',
          eatenKcal + '/' + adjustedOptimum,
          diff > 0 && ' +' + Math.round(diff)
        )
      ),
      React.createElement('div', { className: 'refeed-card__info' },
        reason && React.createElement('span', { className: 'refeed-card__badge' }, 
          reason.icon + ' ' + reason.label
        ),
        caloricDebt?.debt > 0 && React.createElement('span', { className: 'refeed-card__badge refeed-card__badge--debt' }, 
          '💰 Долг −' + caloricDebt.debt + ' ккал'
        )
      ),
      // Подсказка о streak
      React.createElement('div', { className: 'refeed-card__hint' },
        isStreakPreserved(ratio, true)
          ? '✅ Streak сохраняется (ratio ' + Math.round(ratio * 100) + '%)'
          : '⚠️ Для streak нужен ratio 70-135%'
      ),
      // Мини-статистика refeed за месяц
      renderRefeedStats()
    );
  }
  
  /**
   * Мини-блок статистики refeed за 30 дней
   */
  function renderRefeedStats() {
    const stats = getHistoryStats(30);
    if (!stats || stats.count === 0) return null;
    
    return React.createElement('div', { 
      className: 'refeed-card__stats',
      title: 'Статистика загрузочных дней за 30 дней'
    },
      React.createElement('span', { className: 'refeed-card__stats-item' },
        '📊 ', stats.count, ' refeed за месяц'
      ),
      stats.avgExcessPct > 0 && React.createElement('span', { className: 'refeed-card__stats-item' },
        '↗️ +', stats.avgExcessPct, '% в среднем'
      ),
      stats.lastRefeedDaysAgo > 0 && React.createElement('span', { className: 'refeed-card__stats-item' },
        '📅 ', stats.lastRefeedDaysAgo, ' дн. назад'
      )
    );
  }
  
  /**
   * Бейдж Refeed Day для goal progress header
   * @param {Object} props
   */
  function RefeedBadge({ isRefeedDay, needsRefeed, caloricDebt, onClick }) {
    if (!isRefeedDay && !needsRefeed) return null;
    
    const isActive = isRefeedDay === true;
    const debt = caloricDebt?.debt || 0;
    const consecutiveDays = caloricDebt?.consecutiveDeficitDays || 0;
    
    const tooltip = isActive 
      ? '🔄 Загрузочный день — норма +35%\n\nЭто НЕ срыв! Цель: восстановить метаболизм.'
      : '💡 Система рекомендует загрузку\n\nДолг: ' + debt + ' ккал\n' + consecutiveDays + ' дней в дефиците';
    
    return React.createElement('span', {
      className: 'refeed-badge' + (isActive ? ' refeed-badge--active' : ' refeed-badge--recommended'),
      title: tooltip,
      onClick: onClick,
      style: { cursor: onClick ? 'pointer' : 'help' }
    },
      isActive ? '🔄 REFEED' : '💡 Рекомендуется refeed'
    );
  }
  
  /**
   * Toggle кнопка для карточки калорий
   */
  function RefeedToggle({ isRefeedDay, onToggle, needsRefeed }) {
    const label = isRefeedDay ? 'Загрузка ✓' : (needsRefeed ? '+ Загрузка 💡' : '+ Загрузка');
    
    return React.createElement('button', {
      type: 'button',
      className: 'refeed-toggle' + (isRefeedDay ? ' refeed-toggle--active' : '') + (needsRefeed ? ' refeed-toggle--recommended' : ''),
      onClick: onToggle,
      title: isRefeedDay ? 'Отменить загрузочный день' : 'Отметить как загрузочный день (+35% к норме)'
    },
      React.createElement('span', { className: 'refeed-toggle-icon' }, '🔄'),
      React.createElement('span', { className: 'refeed-toggle-label' }, label)
    );
  }

  // === СОВЕТЫ ===
  
  /**
   * Получить советы для Refeed Day
   * @param {Object} params - параметры из heys_advice_v1
   * @returns {Array} массив советов
   */
  function getRefeedAdvices(params) {
    const { day, caloricDebt, hour, dayTot, optimum, displayOptimum } = params;
    const advices = [];
    
    const isRefeedDay = day?.isRefeedDay === true;
    const needsRefeed = caloricDebt?.needsRefeed === true;
    const debt = caloricDebt?.debt || 0;
    const refeedBoost = caloricDebt?.refeedBoost || 0;
    const consecutiveDays = caloricDebt?.consecutiveDeficitDays || 0;
    
    const eatenKcal = dayTot?.kcal || 0;
    const refeedOptimum = isRefeedDay ? getRefeedOptimum(optimum, true) : displayOptimum;
    const eatenPct = eatenKcal / refeedOptimum;
    
    // 1. Рекомендация refeed (утро, если система рекомендует но не отмечено)
    if (needsRefeed && !isRefeedDay && hour >= 7 && hour <= 12) {
      advices.push({
        id: 'refeed_recommended',
        icon: '🔄',
        text: 'Система рекомендует загрузочный день',
        details: `💰 Накопился долг ${debt} ккал или ${consecutiveDays} дней подряд в дефиците.\n\n✅ Это НЕ срыв — это часть стратегии!\n✅ +35% к норме помогает восстановить метаболизм\n✅ Отметь в утреннем чек-ине или нажми кнопку 🔄`,
        type: 'tip',
        priority: 28,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 8000
      });
    }
    
    // 2. Refeed в процессе (день, мотивация съесть норму)
    if (isRefeedDay && eatenPct >= 0.3 && eatenPct < 0.85 && hour >= 12 && hour <= 20) {
      advices.push({
        id: 'refeed_in_progress',
        icon: '🍽️',
        text: 'Refeed идёт! Не останавливайся',
        details: `💪 Ты съел ${Math.round(eatenPct * 100)}% от refeed нормы.\n\nЦель сегодня: ${refeedOptimum} ккал.\nЭто контролируемое превышение — помогает телу восстановиться.`,
        type: 'tip',
        priority: 22,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 6000
      });
    }
    
    // 3. Refeed выполнен (вечер, ачивка)
    if (isRefeedDay && eatenPct >= 0.9 && eatenPct <= REFEED_OK_RATIO && hour >= 19) {
      advices.push({
        id: 'refeed_completed',
        icon: '✅',
        text: 'Refeed выполнен! Метаболизм восстанавливается',
        details: `🎯 Ты съел ${Math.round(eatenKcal)} ккал — в пределах refeed нормы.\n\n✅ Лептин временно вернётся к норме\n✅ Метаболизм ускорится\n✅ Завтра можно вернуться к обычному плану`,
        type: 'achievement',
        priority: 12,
        category: 'achievement',
        triggers: ['tab_open'],
        ttl: 7000
      });
    }
    
    // 4. Refeed перебор (предупреждение)
    if (isRefeedDay && eatenPct > REFEED_OK_RATIO && eatenPct <= 1.5) {
      advices.push({
        id: 'refeed_over',
        icon: '⚠️',
        text: 'Refeed выше нормы — не страшно, но следи',
        details: `📊 Съедено ${Math.round(eatenKcal)} из ${refeedOptimum} ккал (+${Math.round((eatenPct - 1) * 100)}%).\n\nЭто ещё в пределах разумного, но постарайся не увеличивать дальше.`,
        type: 'warning',
        priority: 18,
        category: 'nutrition',
        triggers: ['tab_open', 'product_added'],
        ttl: 5000
      });
    }
    
    // 5. Refeed не использован (вечер, если рекомендовали но не отметили)
    if (needsRefeed && !isRefeedDay && hour >= 20 && eatenPct < 0.8) {
      advices.push({
        id: 'refeed_missed',
        icon: '📉',
        text: 'Рекомендованный refeed пропущен',
        details: `💰 Долг ${debt} ккал продолжает накапливаться.\n\nЕсли не делать загрузку, тело может снизить метаболизм. Рассмотри refeed завтра.`,
        type: 'tip',
        priority: 25,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 6000
      });
    }
    
    return advices;
  }

  // === STEP REGISTRATION ===
  
  /**
   * Регистрация шага в системе чек-инов
   */
  let _registerRetries = 0;
  function registerRefeedStep() {
    // registerStep находится в HEYS.StepModal, не в HEYS.Steps!
    if (!HEYS.StepModal?.registerStep) {
      if (_registerRetries < 20) { // Max 10 seconds
        _registerRetries++;
        setTimeout(registerRefeedStep, 500);
      } else {
        console.warn('[Refeed] HEYS.StepModal not found after 10s, giving up');
      }
      return;
    }
    
    const lsGet = HEYS.utils?.lsGet || ((k, d) => {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
    });
    const lsSet = HEYS.utils?.lsSet || ((k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    });
    
    HEYS.StepModal.registerStep('refeedDay', {
      title: 'Загрузочный день',
      hint: 'Контролируемое превышение',
      icon: '🔄',
      component: RefeedDayStepComponent,
      canSkip: true,
      
      shouldShow: () => {
        try {
          // Показываем если есть автоматическая рекомендация
          const hasRecommendation = HEYS.caloricDebt?.needsRefeed || false;
          // ИЛИ если пользователь имеет право вручную выбирать
          const profile = lsGet('heys_profile', {});
          const allowManual = profile.allowManualRefeed === true;
          return hasRecommendation || allowManual;
        } catch {
          return false;
        }
      },
      
      getInitialData: (ctx) => {
        const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
        const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
        return { 
          isRefeedDay: day.isRefeedDay ?? null,
          refeedReason: day.refeedReason ?? null
        };
      },
      
      save: (data) => {
        const dateKey = new Date().toISOString().slice(0, 10);
        const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
        day.isRefeedDay = data.isRefeedDay;
        day.refeedReason = data.refeedReason || null;
        day.updatedAt = Date.now();
        lsSet(`heys_dayv2_${dateKey}`, day);
        
        // Уведомляем о изменении
        window.dispatchEvent(new CustomEvent('heys:day-updated', { 
          detail: { date: dateKey, field: 'isRefeedDay', value: data.isRefeedDay, source: 'refeed-step' }
        }));
      },
      
      xpAction: 'refeed_marked'
    });
    
    if (window.location?.hostname === 'localhost') {
      console.log('[Refeed] ✅ Шаг зарегистрирован');
    }
  }

  // === RENDER HELPERS ===

  /**
   * Render Refeed Toggle кнопка для карточки калорий
   * @param {Object} props - { isRefeedDay, refeedReason, caloricDebt, optimum, onToggle }
   * @returns {React.Element|null}
   */
  function renderRefeedToggle(props) {
    const { isRefeedDay, refeedReason, caloricDebt, optimum, onToggle } = props || {};
    
    const needsRefeed = caloricDebt?.needsRefeed === true;
    
    // Показываем только если: отмечен ИЛИ рекомендуется ИЛИ есть долг >500
    const shouldShow = isRefeedDay || needsRefeed || (caloricDebt?.debt > 500);
    if (!shouldShow) return null;
    
    // Определяем причину для бейджа
    const reason = isRefeedDay && refeedReason ? getReasonById(refeedReason) : null;
    
    // Wrapper для onToggle
    const handleToggle = () => {
      if (isRefeedDay) {
        // Отключение — просто сбрасываем
        onToggle?.(false, null);
      } else {
        // Включение — показываем popup выбора причины или ставим дефолтную
        // Для простоты пока ставим 'deficit' если есть долг, иначе 'rest'
        const defaultReason = caloricDebt?.debt > 500 ? 'deficit' : 'rest';
        onToggle?.(true, defaultReason);
      }
    };
    
    const label = isRefeedDay 
      ? `🔄 Загрузка ${reason ? reason.icon : '✓'}` 
      : (needsRefeed ? '+ Загрузка 💡' : '+ Загрузка');
    
    const title = isRefeedDay 
      ? `Загрузочный день: ${reason?.label || 'активен'}\nКликни чтобы отменить`
      : `Отметить как загрузочный день (+35% к норме)`;
    
    return React.createElement('button', {
      type: 'button',
      className: 'refeed-toggle' + 
        (isRefeedDay ? ' refeed-toggle--active' : '') + 
        (needsRefeed && !isRefeedDay ? ' refeed-toggle--recommended' : ''),
      onClick: handleToggle,
      title: title
    },
      React.createElement('span', { className: 'refeed-toggle-label' }, label)
    );
  }

  // === ЭКСПОРТ МОДУЛЯ ===
  
  HEYS.Refeed = {
    // Константы
    REFEED_BOOST_PCT,
    REFEED_THRESHOLD,
    REFEED_CONSECUTIVE,
    REFEED_OK_RATIO,
    REFEED_REASONS,
    REFEED_ZONES,
    
    // Утилиты
    getRefeedZone,
    shouldRecommendRefeed,
    getRefeedOptimum,
    getReasonById,
    getReasonLabel,      // 🆕 с guardrail fallback
    getDayMeta,          // 🆕 единая точка правды
    getHistoryStats,     // 🆕 статистика за 30 дней
    shouldExcludeFromWeightTrend,
    shouldShowRefeedStep,
    isStreakPreserved,
    
    // Компоненты
    RefeedDayStepComponent,
    RefeedCard,
    RefeedBadge,
    RefeedToggle,
    
    // Советы
    getRefeedAdvices,
    
    // Инициализация
    registerStep: registerRefeedStep,
    
    // Хелперы для UI
    renderRefeedToggle,  // 🆕 v1.3.1 — toggle для карточки калорий
    renderRefeedStats,
    
    // Версия
    version: '1.3.1'  // v1.3.1 — renderRefeedToggle fix
  };
  
  // Автоматическая регистрация шага при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerRefeedStep);
  } else {
    setTimeout(registerRefeedStep, 100);
  }
  
  // Логируем только в dev режиме
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.log('[HEYS] 🔄 Refeed Module v1.3.1 loaded');
  }

})(typeof window !== 'undefined' ? window : global);
