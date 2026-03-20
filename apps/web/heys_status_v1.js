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
(function (global) {
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
   * Linear interpolation helper for smooth factor scoring.
   * bands: [[ratioFrom, scoreTo], ...] sorted ascending by ratio.
   * Values below first band → first score; above last → last score.
   */
  function scoreSmooth(value, bands) {
    if (!bands || bands.length === 0) return 50;
    if (value <= bands[0][0]) return bands[0][1];
    if (value >= bands[bands.length - 1][0]) return bands[bands.length - 1][1];
    for (let i = 1; i < bands.length; i++) {
      const [v0, s0] = bands[i - 1];
      const [v1, s1] = bands[i];
      if (value <= v1) {
        const t = (value - v0) / (v1 - v0);
        return Math.round(s0 + (s1 - s0) * t);
      }
    }
    return bands[bands.length - 1][1];
  }

  /**
   * Вычислить оценку фактора (0-100)
   */
  function scoreFactor(factorId, dayData, profile, dayTot, normAbs, waveData, waterGoal) {
    switch (factorId) {
      case 'kcal': {
        const target = normAbs?.kcal || 2000;
        const eaten = dayTot?.kcal || 0;
        const ratio = eaten / target;
        // Smooth symmetric scoring: ideal zone 0.85-1.10, smooth ramp-down beyond
        // Map ratio to a folded distance from the ideal midpoint (0.975)
        if (ratio >= 0.85 && ratio <= 1.10) return 100;
        if (ratio < 0.85) return scoreSmooth(ratio, [[0.45, 20], [0.55, 30], [0.65, 50], [0.75, 70], [0.85, 100]]);
        return scoreSmooth(ratio, [[1.10, 100], [1.20, 75], [1.30, 55], [1.40, 35], [1.55, 20]]);
      }

      case 'protein': {
        const target = normAbs?.prot || 80;
        const eaten = dayTot?.prot || 0;
        const ratio = eaten / target;
        // Smooth: 90%+ = 100, cap excess penalty gently above 140%
        if (ratio >= 0.90 && ratio <= 1.40) return 100;
        if (ratio < 0.90) return scoreSmooth(ratio, [[0.20, 20], [0.40, 35], [0.60, 55], [0.75, 78], [0.90, 100]]);
        return scoreSmooth(ratio, [[1.40, 100], [1.70, 85], [2.00, 70]]);
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
        const hours = HEYS.dayUtils?.getTotalSleepHours
          ? HEYS.dayUtils.getTotalSleepHours(dayData)
          : (dayData?.sleepHours || 0);
        const norm = profile?.sleepHours || 8;
        if (hours === 0) return 50; // Нет данных — нейтрально

        const ratio = hours / norm;
        // Smooth: ideal 0.95-1.15, gentle ramp-down for both sides
        if (ratio >= 0.95 && ratio <= 1.15) return 100;
        if (ratio < 0.95) return scoreSmooth(ratio, [[0.50, 20], [0.65, 35], [0.80, 60], [0.90, 83], [0.95, 100]]);
        return scoreSmooth(ratio, [[1.15, 100], [1.25, 85], [1.40, 65], [1.60, 40]]);
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
        // Smooth: ramp up to 100 at 95%+ goal
        if (ratio >= 0.95) return 100;
        return scoreSmooth(ratio, [[0.10, 20], [0.30, 35], [0.50, 52], [0.70, 68], [0.82, 80], [0.95, 100]]);
      }

      default:
        return 50;
    }
  }

  /**
   * Вернуть детали фактора: фактическое значение, цель, единицу, процент.
   * Используется для explainability breakdown в UI.
   */
  function getFactorDetails(factorId, dayData, profile, dayTot, normAbs, waveData, waterGoal) {
    switch (factorId) {
      case 'kcal': {
        const target = normAbs?.kcal || 2000;
        const value = Math.round(dayTot?.kcal || 0);
        return { value, target, unit: 'ккал', percent: Math.round((value / target) * 100) };
      }
      case 'protein': {
        const target = normAbs?.prot || 80;
        const value = Math.round(dayTot?.prot || 0);
        return { value, target, unit: 'г', percent: Math.round((value / target) * 100) };
      }
      case 'timing': {
        const meals = dayData?.meals || [];
        if (meals.length === 0) return { value: null, target: null, unit: null, label: 'нет данных' };
        const lastMeal = meals[meals.length - 1];
        return { value: lastMeal?.time || null, target: '20:00', unit: null, label: `последний приём ${lastMeal?.time || '—'}` };
      }
      case 'steps': {
        const goal = profile?.stepsGoal || 10000;
        const value = dayData?.steps || 0;
        return { value, target: goal, unit: 'шагов', percent: Math.round((value / goal) * 100) };
      }
      case 'training': {
        const trainings = dayData?.trainings || [];
        const totalMinutes = trainings.reduce((sum, t) => {
          const zones = t.z || [0, 0, 0, 0];
          return sum + zones.reduce((a, b) => a + b, 0);
        }, 0);
        return { value: totalMinutes, target: 45, unit: 'мин', percent: Math.round((totalMinutes / 45) * 100) };
      }
      case 'household': {
        const value = dayData?.householdMin || 0;
        return { value, target: 60, unit: 'мин', percent: Math.round((value / 60) * 100) };
      }
      case 'sleep': {
        const hours = HEYS.dayUtils?.getTotalSleepHours
          ? HEYS.dayUtils.getTotalSleepHours(dayData)
          : (dayData?.sleepHours || 0);
        const target = profile?.sleepHours || 8;
        return { value: Math.round(hours * 10) / 10, target, unit: 'ч', percent: Math.round((hours / target) * 100) };
      }
      case 'stress': {
        const value = dayData?.stressAvg || 0;
        return { value: Math.round(value * 10) / 10, target: 3, unit: '/10', label: value === 0 ? 'нет данных' : null };
      }
      case 'water': {
        const goal = waterGoal || 2000;
        const value = dayData?.waterMl || 0;
        return { value, target: goal, unit: 'мл', percent: Math.round((value / goal) * 100) };
      }
      default:
        return { value: null, target: null, unit: null };
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
    const factorDetails = {};
    const issues = [];

    for (const [factorId, factor] of Object.entries(FACTORS)) {
      const score = scoreFactor(factorId, dayData, profile, dayTot, normAbs, waveData, waterGoal);
      factorScores[factorId] = score;
      factorDetails[factorId] = getFactorDetails(factorId, dayData, profile, dayTot, normAbs, waveData, waterGoal);

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

    // Детальный breakdown всех факторов (для explainability)
    const breakdown = Object.entries(FACTORS).map(([factorId, factor]) => {
      const score = factorScores[factorId];
      const details = factorDetails[factorId];
      const issue = issues.find(i => i.factorId === factorId);
      return {
        factorId,
        label: factor.label,
        icon: factor.icon,
        weight: factor.weight,
        category: factor.category,
        score,
        ...details,
        issue: issue?.issue || null,
        recommendation: issue ? issue.recommendation : null
      };
    });

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
      factorDetails,
      categoryScores,
      breakdown,
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

    const { score, level, topIssues = [], topActions = [], categoryScores = {} } = status;

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
   * @param {Object} props
   * @param {Object} props.status - Результат calculateStatus
   * @param {string} props.size - 'micro' | 'tiny' | 'standard' (из StatusWidgetContent)
   * @param {boolean} props.showActions - Показывать рекомендованное действие
   * @param {boolean} props.showIssues - Показывать проблемы
   */
  function StatusWidget({ status, size = 'standard', onClick, showActions = true, showIssues = true }) {
    if (!status) return null;

    const { score, level, topActions = [], topIssues = [] } = status;
    const isCompact = size === 'micro' || size === 'tiny' || size === '1x1' || size === '2x1';

    // Компактный вид (только число) — 1x1, 2x1, 1x2
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

      // Действие (если включено)
      showActions && topActions.length > 0 && h('div', { className: 'status-widget__action' },
        h('span', null, topActions[0].icon),
        h('span', null, topActions[0].text)
      ),

      // Проблема (если включено)
      showIssues && topIssues.length > 0 && h('div', { className: 'status-widget__issue' },
        h('span', null, topIssues[0].factor?.icon || '⚠️'),
        h('span', null, topIssues[0].issue || '')
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
