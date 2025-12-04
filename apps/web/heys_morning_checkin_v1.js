// heys_morning_checkin_v1.js — Утренний чек-ин: вес, сон, шаги
// Показывается при открытии приложения, если сегодня не заполнен вес
// 
// === МИГРАЦИЯ НА МОДУЛЬНУЮ СИСТЕМУ ===
// Этот файл теперь использует HEYS.StepModal + HEYS.Steps
// Старый API (HEYS.MorningCheckin, HEYS.shouldShowMorningCheckin) сохранён для совместимости
//
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === Утилиты ===
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }
  
  /**
   * Проверяем, нужно ли показывать утренний чек-ин
   * ВАЖНО: Эта функция вызывается ПОСЛЕ события heysSyncCompleted,
   * поэтому проверка isInitialSyncCompleted не нужна
   */
  function shouldShowMorningCheckin() {
    const U = HEYS.utils || {};
    
    // Если клиент не выбран — НЕ показываем чек-ин (чтобы не показывать до авторизации)
    const currentClientId = U.getCurrentClientId ? U.getCurrentClientId() : '';
    if (!currentClientId) {
      console.log('[MorningCheckin] No clientId, skip check');
      return false;
    }
    
    const todayKey = getTodayKey();
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${todayKey}`, {}) : {};
    
    console.log('[MorningCheckin] Checking for clientId:', currentClientId.substring(0,8), '| weightMorning:', dayData.weightMorning);
    
    // Показываем, если сегодня нет веса
    return !dayData.weightMorning;
  }

  /**
   * MorningCheckin — обёртка над новым StepModal
   * Использует шаги: weight, sleepTime, sleepQuality, stepsGoal
   */
  function MorningCheckin({ onComplete }) {
    // Если StepModal доступен — используем его
    if (HEYS.StepModal && HEYS.StepModal.Component) {
      return React.createElement(HEYS.StepModal.Component, {
        steps: ['weight', 'sleepTime', 'sleepQuality', 'stepsGoal'],
        onComplete: onComplete,
        showProgress: true,
        showStreak: true,
        showGreeting: true,
        showTip: true,
        allowSwipe: true
      });
    }
    
    // Fallback: простое сообщение если StepModal не загружен
    return React.createElement('div', { 
      style: { 
        padding: '20px', 
        textAlign: 'center',
        background: '#fff',
        borderRadius: '12px',
        margin: '20px'
      } 
    },
      React.createElement('p', null, 'Загрузка...'),
      React.createElement('p', { style: { fontSize: '12px', color: '#666' } }, 
        'Убедитесь что загружены heys_step_modal_v1.js и heys_steps_v1.js'
      )
    );
  }

  // === Экспорт (обратная совместимость) ===
  HEYS.MorningCheckin = MorningCheckin;
  HEYS.shouldShowMorningCheckin = shouldShowMorningCheckin;

  /**
   * Быстрый API для показа конкретных шагов
   */
  HEYS.showCheckin = {
    // Полный утренний чек-ин
    morning: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['weight', 'sleepTime', 'sleepQuality', 'stepsGoal'],
          onComplete
        });
      }
    },
    
    // Только вес
    weight: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['weight'],
          title: 'Взвешивание',
          showProgress: false,
          onComplete
        });
      }
    },
    
    // Только шаги (цель)
    steps: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['stepsGoal'],
          title: 'Цель шагов',
          showProgress: false,
          onComplete
        });
      }
    },
    
    // Только сон
    sleep: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['sleepTime', 'sleepQuality'],
          title: 'Сон',
          onComplete
        });
      }
    },
    
    // Только дефицит калорий
    deficit: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['deficit'],
          title: 'Цель калорий',
          showProgress: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    },
    
    // Добавить приём пищи (через MealStep)
    meal: (dateKey, onComplete) => {
      if (HEYS.MealStep) {
        HEYS.MealStep.showAddMeal({
          dateKey: dateKey || new Date().toISOString().slice(0, 10),
          onComplete
        });
      } else if (HEYS.StepModal) {
        // Fallback если MealStep не загружен
        HEYS.StepModal.show({
          steps: ['mealTime', 'mealMood'],
          title: 'Новый приём',
          showProgress: true,
          showStreak: false,
          showGreeting: false,
          showTip: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    }
  };

  console.log('[HEYS] MorningCheckin v2 loaded (using StepModal)');

})(typeof window !== 'undefined' ? window : global);