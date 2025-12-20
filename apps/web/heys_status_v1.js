/**
 * heys_status_v1.js — Статус 0-100
 * 
 * Простой и понятный показатель здоровья дня.
 * 
 * Философия:
 * - НЕ токсичный — не ругаем, а объясняем
 * - НЕ сложный — топ-2 причины + 1-2 шага
 * - НЕ скачет — сглаживание изменений
 * 
 * Интеграция:
 * - InsightsTab — главная карточка сверху
 * - Widgets — виджет 'status'
 * 
 * Version: 1.0.0
 * Created: 2025-12-19
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const h = React.createElement;
  
  // === КОНФИГУРАЦИЯ ===
  
  /**
   * Факторы влияющие на статус (веса нормализованы до 100)
   * Простая Rule-based модель
   */
  const FACTORS = {
    // Питание — 35%
    kcal: { weight: 15, category: 'nutrition', label: 'Калории', icon: '🔥' },
    protein: { weight: 10, category: 'nutrition', label: 'Белок', icon: '🥩' },
    timing: { weight: 10, category: 'nutrition', label: 'Тайминг еды', icon: '⏰' },
    
    // Активность — 25%
    steps: { weight: 10, category: 'activity', label: 'Шаги', icon: '👟' },
    training: { weight: 10, category: 'activity', label: 'Тренировка', icon: '💪' },
    household: { weight: 5, category: 'activity', label: 'Бытовая активность', icon: '🏠' },
    
    // Восстановление — 25%
    sleep: { weight: 15, category: 'recovery', label: 'Сон', icon: '😴' },
    stress: { weight: 10, category: 'recovery', label: 'Стресс', icon: '😰' },
    
    // Водный баланс — 15%
    water: { weight: 15, category: 'hydration', label: 'Вода', icon: '💧' }
  };
  
  /**
   * Категории для группировки
   */
  const CATEGORIES = {
    nutrition: { label: 'Питание', icon: '🍎', color: '#f97316' },
    activity: { label: 'Активность', icon: '⚡', color: '#3b82f6' },
    recovery: { label: 'Восстановление', icon: '🌙', color: '#8b5cf6' },
    hydration: { label: 'Гидратация', icon: '💧', color: '#06b6d4' }
  };
  
  /**
   * Статусы по баллам
   */
  const STATUS_LEVELS = {
    excellent: { min: 85, label: 'Отлично!', emoji: '🌟', color: '#10b981', message: 'Так держать!' },
    good: { min: 70, label: 'Хорошо', emoji: '✅', color: '#22c55e', message: 'Неплохо!' },
    okay: { min: 50, label: 'Нормально', emoji: '👌', color: '#eab308', message: 'Есть над чем поработать' },
    low: { min: 30, label: 'Слабовато', emoji: '😕', color: '#f97316', message: 'Давай исправим' },
    critical: { min: 0, label: 'Внимание', emoji: '⚠️', color: '#ef4444', message: 'Нужна помощь' }
  };
  
  /**
   * Рекомендации по факторам
   */
  const RECOMMENDATIONS = {
    kcal_low: { text: 'Добавь приём пищи', icon: '🍽️', priority: 1 },
    kcal_high: { text: 'Следи за порциями', icon: '📏', priority: 2 },
    protein_low: { text: 'Добавь белок', icon: '🥩', priority: 1 },
    timing_bad: { text: 'Не ешь после 21:00', icon: '⏰', priority: 2 },
    steps_low: { text: 'Прогуляйся 15 мин', icon: '🚶', priority: 1 },
    training_none: { text: 'Добавь активность', icon: '🏃', priority: 3 },
    sleep_low: { text: 'Ляг пораньше', icon: '🛏️', priority: 1 },
    stress_high: { text: 'Сделай паузу', icon: '🧘', priority: 1 },
    water_low: { text: 'Выпей воды', icon: '💧', priority: 1 }
  };
  
  // === РАСЧЁТ СТАТУСА ===
  
  /**
   * Вычислить оценку фактора (0-100)
   */
  function scoreFactor(factorId, dayData, profile, dayTot, normAbs, waveData, waterGoal) {
    switch (factorId) {
      case 'kcal': {
        const target = normAbs?.kcal || 2000;
        const eaten = dayTot?.kcal || 0;
        const ratio = eaten / target;
        // Идеально: 0.85-1.10
        if (ratio >= 0.85 && ratio <= 1.10) return 100;
        if (ratio >= 0.75 && ratio <= 1.20) return 80;
        if (ratio >= 0.60 && ratio <= 1.30) return 60;
        if (ratio >= 0.50 && ratio <= 1.40) return 40;
        return 20;
      }
      
      case 'protein': {
        const target = normAbs?.prot || 80;
        const eaten = dayTot?.prot || 0;
        const ratio = eaten / target;
        if (ratio >= 0.90) return 100;
        if (ratio >= 0.75) return 80;
        if (ratio >= 0.50) return 50;
        return 20;
      }
      
      case 'timing': {
        // Проверяем последний приём пищи
        const meals = dayData?.meals || [];
        if (meals.length === 0) return 50; // Нет данных — нейтрально
        
        const lastMeal = meals[meals.length - 1];
        if (!lastMeal?.time) return 50;
        
        const [h] = lastMeal.time.split(':').map(Number);
        if (h <= 20) return 100; // До 20:00 — отлично
        if (h <= 21) return 80;  // До 21:00 — хорошо
        if (h <= 22) return 50;  // До 22:00 — нормально
        return 20; // После 22:00 — плохо
      }
      
      case 'steps': {
        const steps = dayData?.steps || 0;
        const goal = profile?.stepsGoal || 10000;
        const ratio = steps / goal;
        if (ratio >= 1.0) return 100;
        if (ratio >= 0.8) return 85;
        if (ratio >= 0.5) return 60;
        if (ratio >= 0.3) return 40;
        return 20;
      }
      
      case 'training': {
        const trainings = dayData?.trainings || [];
        if (trainings.length === 0) return 60; // Нет тренировки — нейтрально (не штрафуем сильно)
        
        // Считаем суммарные минуты
        const totalMinutes = trainings.reduce((sum, t) => {
          const zones = t.z || [0, 0, 0, 0];
          return sum + zones.reduce((a, b) => a + b, 0);
        }, 0);
        
        if (totalMinutes >= 45) return 100;
        if (totalMinutes >= 30) return 85;
        if (totalMinutes >= 15) return 70;
        return 60;
      }
      
      case 'household': {
        const min = dayData?.householdMin || 0;
        if (min >= 60) return 100;
        if (min >= 30) return 80;
        if (min >= 15) return 60;
        return 40;
      }
      
      case 'sleep': {
        const hours = dayData?.sleepHours || 0;
        const norm = profile?.sleepHours || 8;
        if (hours === 0) return 50; // Нет данных — нейтрально
        
        const ratio = hours / norm;
        if (ratio >= 0.95 && ratio <= 1.15) return 100;
        if (ratio >= 0.85) return 80;
        if (ratio >= 0.70) return 50;
        return 20;
      }
      
      case 'stress': {
        const stress = dayData?.stressAvg || 0;
        if (stress === 0) return 70; // Нет данных
        if (stress <= 3) return 100;
        if (stress <= 5) return 70;
        if (stress <= 7) return 40;
        return 20;
      }
      
      case 'water': {
        const drunk = dayData?.waterMl || 0;
        const goal = waterGoal || 2000;
        const ratio = drunk / goal;
        if (ratio >= 0.95) return 100;
        if (ratio >= 0.80) return 85;
        if (ratio >= 0.60) return 60;
        if (ratio >= 0.40) return 40;
        return 20;
      }
      
      default:
        return 50;
    }
  }
  
  /**
   * Определить проблему для фактора
   */
  function detectIssue(factorId, score, dayData, profile, dayTot, normAbs, waterGoal) {
    if (score >= 70) return null; // Нет проблемы
    
    switch (factorId) {
      case 'kcal': {
        const target = normAbs?.kcal || 2000;
        const eaten = dayTot?.kcal || 0;
        return eaten < target * 0.85 ? 'kcal_low' : 'kcal_high';
      }
      case 'protein':
        return 'protein_low';
      case 'timing':
        return 'timing_bad';
      case 'steps':
        return 'steps_low';
      case 'training':
        return 'training_none';
      case 'sleep':
        return 'sleep_low';
      case 'stress':
        return 'stress_high';
      case 'water':
        return 'water_low';
      default:
        return null;
    }
  }
  
  /**
   * Главная функция расчёта статуса
   */
  function calculateStatus(opts = {}) {
    const {
      dayData = {},
      profile = {},
      dayTot = {},
      normAbs = {},
      waveData = null,
      waterGoal = 2000,
      previousStatus = null // Для сглаживания
    } = opts;
    
    // Вычисляем оценки всех факторов
    const factorScores = {};
    const issues = [];
    
    for (const [factorId, factor] of Object.entries(FACTORS)) {
      const score = scoreFactor(factorId, dayData, profile, dayTot, normAbs, waveData, waterGoal);
      factorScores[factorId] = score;
      
      // Собираем проблемы
      const issue = detectIssue(factorId, score, dayData, profile, dayTot, normAbs, waterGoal);
      if (issue && RECOMMENDATIONS[issue]) {
        issues.push({
          factorId,
          factor,
          score,
          issue,
          recommendation: RECOMMENDATIONS[issue]
        });
      }
    }
    
    // Считаем взвешенный балл
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [factorId, factor] of Object.entries(FACTORS)) {
      const score = factorScores[factorId];
      weightedSum += score * factor.weight;
      totalWeight += factor.weight;
    }
    
    let rawScore = Math.round(weightedSum / totalWeight);
    
    // Сглаживание (если есть предыдущий статус)
    let finalScore = rawScore;
    if (previousStatus !== null && typeof previousStatus === 'number') {
      // Максимальное изменение за раз: ±15 баллов
      const maxChange = 15;
      const diff = rawScore - previousStatus;
      if (Math.abs(diff) > maxChange) {
        finalScore = previousStatus + Math.sign(diff) * maxChange;
      }
    }
    
    // Определяем уровень статуса
    let level = STATUS_LEVELS.critical;
    for (const [key, lvl] of Object.entries(STATUS_LEVELS)) {
      if (finalScore >= lvl.min) {
        level = { ...lvl, id: key };
        break;
      }
    }
    
    // Топ-2 проблемы (по приоритету)
    const topIssues = issues
      .sort((a, b) => a.recommendation.priority - b.recommendation.priority)
      .slice(0, 2);
    
    // Топ-2 шага
    const topActions = topIssues.map(i => ({
      text: i.recommendation.text,
      icon: i.recommendation.icon,
      factor: i.factor.label
    }));
    
    // Группируем баллы по категориям
    const categoryScores = {};
    for (const [catId, cat] of Object.entries(CATEGORIES)) {
      const catFactors = Object.entries(FACTORS).filter(([, f]) => f.category === catId);
      if (catFactors.length === 0) continue;
      
      let catSum = 0;
      let catWeight = 0;
      for (const [factorId, factor] of catFactors) {
        catSum += factorScores[factorId] * factor.weight;
        catWeight += factor.weight;
      }
      
      categoryScores[catId] = {
        score: Math.round(catSum / catWeight),
        ...cat
      };
    }
    
    return {
      score: finalScore,
      rawScore,
      level,
      factorScores,
      categoryScores,
      topIssues,
      topActions,
      timestamp: Date.now()
    };
  }
  
  // === UI КОМПОНЕНТЫ ===
  
  /**
   * StatusCard — полная карточка для InsightsTab
   */
  function StatusCard({ status, onDetailClick }) {
    if (!status) return null;
    
    const { score, level, topIssues, topActions, categoryScores } = status;
    
    return h('div', { className: 'status-card' },
      // Главный показатель
      h('div', { className: 'status-card__main' },
        h('div', { 
          className: 'status-card__score',
          style: { '--status-color': level.color }
        },
          h('span', { className: 'status-card__number' }, score),
          h('span', { className: 'status-card__max' }, '/100')
        ),
        h('div', { className: 'status-card__level' },
          h('span', { className: 'status-card__emoji' }, level.emoji),
          h('span', { className: 'status-card__label' }, level.label)
        )
      ),
      
      // Категории (мини-бары)
      h('div', { className: 'status-card__categories' },
        Object.entries(categoryScores).map(([catId, cat]) =>
          h('div', { 
            key: catId, 
            className: 'status-card__cat',
            title: `${cat.label}: ${cat.score}%`
          },
            h('span', { className: 'status-card__cat-icon' }, cat.icon),
            h('div', { className: 'status-card__cat-bar' },
              h('div', { 
                className: 'status-card__cat-fill',
                style: { 
                  width: `${cat.score}%`,
                  backgroundColor: cat.color
                }
              })
            )
          )
        )
      ),
      
      // Топ проблемы (если есть)
      topIssues.length > 0 && h('div', { className: 'status-card__issues' },
        h('div', { className: 'status-card__issues-title' }, 'Над чем поработать:'),
        topIssues.map((issue, i) =>
          h('div', { key: i, className: 'status-card__issue' },
            h('span', { className: 'status-card__issue-icon' }, issue.factor.icon),
            h('span', { className: 'status-card__issue-text' }, issue.factor.label),
            h('span', { className: 'status-card__issue-score' }, `${issue.score}%`)
          )
        )
      ),
      
      // Шаги (действия)
      topActions.length > 0 && h('div', { className: 'status-card__actions' },
        topActions.map((action, i) =>
          h('div', { key: i, className: 'status-card__action' },
            h('span', { className: 'status-card__action-icon' }, action.icon),
            h('span', { className: 'status-card__action-text' }, action.text)
          )
        )
      ),
      
      // Сообщение
      h('div', { 
        className: 'status-card__message',
        style: { color: level.color }
      }, level.message)
    );
  }
  
  /**
   * StatusWidget — компактная версия для Widgets Dashboard
   */
  function StatusWidget({ status, size = '2x2', onClick }) {
    if (!status) return null;
    
    const { score, level, topActions } = status;
    const isCompact = size === '1x1' || size === '2x1';
    
    // Компактный вид (только число)
    if (isCompact) {
      return h('div', { 
        className: 'status-widget status-widget--compact',
        onClick,
        style: { '--status-color': level.color }
      },
        h('span', { className: 'status-widget__score' }, score),
        h('span', { className: 'status-widget__emoji' }, level.emoji)
      );
    }
    
    // Полный вид
    return h('div', { 
      className: 'status-widget',
      onClick,
      style: { '--status-color': level.color }
    },
      // Число + emoji (без заголовка — он уже есть в WidgetCard)
      h('div', { className: 'status-widget__main' },
        h('span', { className: 'status-widget__score' }, score),
        h('span', { className: 'status-widget__label' }, level.label)
      ),
      
      // Emoji справа сверху
      h('span', { className: 'status-widget__emoji' }, level.emoji),
      
      // Один шаг (если есть)
      topActions.length > 0 && h('div', { className: 'status-widget__action' },
        h('span', null, topActions[0].icon),
        h('span', null, topActions[0].text)
      )
    );
  }
  
  /**
   * StatusMini — микро-версия (просто число)
   */
  function StatusMini({ status }) {
    if (!status) return h('span', { className: 'status-mini' }, '—');
    
    return h('span', { 
      className: 'status-mini',
      style: { color: status.level.color }
    }, status.score);
  }
  
  // === ЭКСПОРТ ===
  
  HEYS.Status = {
    // Константы
    FACTORS,
    CATEGORIES,
    STATUS_LEVELS,
    RECOMMENDATIONS,
    
    // Функции
    calculateStatus,
    scoreFactor,
    detectIssue,
    
    // Компоненты
    StatusCard,
    StatusWidget,
    StatusMini,
    
    // Версия
    VERSION: '1.0.0'
  };
  
  // Verbose init log removed
  
})(typeof window !== 'undefined' ? window : global);
