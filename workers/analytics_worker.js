// analytics_worker.js - Воркер для аналитических вычислений
self.onmessage = function (e) {
  const { type, taskId, data } = e.data;

  if (type === 'ping') {
    self.postMessage({ type: 'pong' });
    return;
  }

  if (type === 'execute_task') {
    try {
      handleAnalyticsTask(taskId, data);
    } catch (error) {
      self.postMessage({
        type: 'task_complete',
        taskId: taskId,
        error: error.message,
      });
    }
  }
};

function handleAnalyticsTask(taskId, data) {
  switch (data.type) {
    case 'analytics_generation':
      generateAnalytics(taskId, data);
      break;

    case 'trend_analysis':
      analyzeTrends(taskId, data);
      break;

    case 'goal_tracking':
      trackGoals(taskId, data);
      break;

    default:
      throw new Error(`Неизвестный тип задачи: ${data.type}`);
  }
}

// Генерация аналитики
function generateAnalytics(taskId, data) {
  const { startDate, endDate, includeCharts, includeTrends } = data;

  // Отправляем прогресс
  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 0, step: 'Загрузка данных' },
  });

  // Симуляция обработки данных
  const analytics = {
    period: { start: startDate, end: endDate },
    summary: {
      totalDays: calculateDaysBetween(startDate, endDate),
      avgKcal: 0,
      avgProteins: 0,
      avgFats: 0,
      avgCarbs: 0,
    },
    trends: includeTrends ? calculateTrends(startDate, endDate) : null,
    charts: includeCharts ? generateChartData(startDate, endDate) : null,
    goals: analyzeGoalAchievement(startDate, endDate),
  };

  // Прогресс: 50%
  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 50, step: 'Расчет статистики' },
  });

  // Финальная обработка
  analytics.insights = generateInsights(analytics);

  // Завершение
  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: analytics,
  });
}

// Анализ трендов
function analyzeTrends(taskId, data) {
  const trends = {
    kcal: calculateKcalTrend(data.days),
    weight: calculateWeightTrend(data.days),
    macro: calculateMacroTrends(data.days),
    consistency: calculateConsistency(data.days),
  };

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: trends,
  });
}

// Отслеживание целей
function trackGoals(taskId, data) {
  const goalTracking = {
    daily: analyzeDailyGoalAchievement(data.days, data.goals),
    weekly: analyzeWeeklyGoalAchievement(data.days, data.goals),
    monthly: analyzeMonthlyGoalAchievement(data.days, data.goals),
    recommendations: generateGoalRecommendations(data.days, data.goals),
  };

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: goalTracking,
  });
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function calculateDaysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate - startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateTrends(startDate, endDate) {
  return {
    kcal: {
      trend: 'increasing',
      change: '+5%',
      confidence: 0.85,
    },
    protein: {
      trend: 'stable',
      change: '+1%',
      confidence: 0.92,
    },
    weight: {
      trend: 'decreasing',
      change: '-2.5%',
      confidence: 0.78,
    },
  };
}

function generateChartData(startDate, endDate) {
  const days = calculateDaysBetween(startDate, endDate);
  const chartData = {
    kcal: [],
    macro: [],
    weight: [],
  };

  // Генерируем примерные данные
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    chartData.kcal.push({
      date: date.toISOString().split('T')[0],
      value: 1800 + Math.random() * 400,
    });

    chartData.macro.push({
      date: date.toISOString().split('T')[0],
      proteins: 80 + Math.random() * 40,
      fats: 60 + Math.random() * 30,
      carbs: 200 + Math.random() * 100,
    });
  }

  return chartData;
}

function analyzeGoalAchievement(startDate, endDate) {
  return {
    kcalGoal: {
      target: 2000,
      achieved: 85,
      percentage: 85,
    },
    proteinGoal: {
      target: 100,
      achieved: 92,
      percentage: 92,
    },
    exerciseGoal: {
      target: 5,
      achieved: 3,
      percentage: 60,
    },
  };
}

function generateInsights(analytics) {
  const insights = [];

  if (analytics.summary.avgKcal > 2200) {
    insights.push({
      type: 'warning',
      message: 'Среднее потребление калорий выше рекомендованного',
      suggestion: 'Рассмотрите снижение порций или выбор менее калорийных продуктов',
    });
  }

  if (analytics.goals.proteinGoal.percentage > 90) {
    insights.push({
      type: 'success',
      message: 'Отличное потребление белка!',
      suggestion: 'Продолжайте в том же духе',
    });
  }

  return insights;
}

function calculateKcalTrend(days) {
  // Упрощенный расчет тренда
  if (days.length < 3) return { trend: 'insufficient_data' };

  const recent = days.slice(-7).reduce((sum, day) => sum + (day.totalKcal || 0), 0) / 7;
  const previous = days.slice(-14, -7).reduce((sum, day) => sum + (day.totalKcal || 0), 0) / 7;

  const change = ((recent - previous) / previous) * 100;

  return {
    trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
    change: `${change.toFixed(1)}%`,
    recent: recent.toFixed(0),
    previous: previous.toFixed(0),
  };
}

function calculateWeightTrend(days) {
  // Заглушка для тренда веса
  return {
    trend: 'stable',
    change: '-0.5%',
    confidence: 0.75,
  };
}

function calculateMacroTrends(days) {
  return {
    proteins: { trend: 'stable', change: '+2%' },
    fats: { trend: 'decreasing', change: '-3%' },
    carbs: { trend: 'increasing', change: '+7%' },
  };
}

function calculateConsistency(days) {
  // Расчет консистентности питания
  const kcalValues = days.map((day) => day.totalKcal || 0).filter((kcal) => kcal > 0);

  if (kcalValues.length === 0) return { score: 0, rating: 'insufficient_data' };

  const mean = kcalValues.reduce((sum, kcal) => sum + kcal, 0) / kcalValues.length;
  const variance =
    kcalValues.reduce((sum, kcal) => sum + Math.pow(kcal - mean, 2), 0) / kcalValues.length;
  const stdDev = Math.sqrt(variance);

  const coefficient = (stdDev / mean) * 100;

  let rating = 'excellent';
  if (coefficient > 30) rating = 'poor';
  else if (coefficient > 20) rating = 'fair';
  else if (coefficient > 10) rating = 'good';

  return {
    score: Math.max(0, 100 - coefficient),
    rating: rating,
    stdDev: stdDev.toFixed(0),
    coefficient: coefficient.toFixed(1),
  };
}

function analyzeDailyGoalAchievement(days, goals) {
  return days.map((day) => ({
    date: day.date,
    kcalAchieved: (((day.totalKcal || 0) / goals.kcal) * 100).toFixed(1),
    proteinAchieved: (((day.totalProteins || 0) / goals.proteins) * 100).toFixed(1),
    overall: calculateOverallAchievement(day, goals),
  }));
}

function analyzeWeeklyGoalAchievement(days, goals) {
  // Группируем дни по неделям и анализируем
  const weeks = groupDaysByWeek(days);

  return weeks.map((week) => ({
    weekStart: week[0].date,
    avgKcalAchievement: calculateAverageGoalAchievement(week, goals, 'kcal'),
    avgProteinAchievement: calculateAverageGoalAchievement(week, goals, 'proteins'),
    consistency: calculateWeeklyConsistency(week),
  }));
}

function analyzeMonthlyGoalAchievement(days, goals) {
  // Анализ по месяцам
  const months = groupDaysByMonth(days);

  return months.map((month) => ({
    month: month.name,
    totalDays: month.days.length,
    avgAchievement: calculateMonthlyAverageAchievement(month.days, goals),
    bestWeek: findBestWeekInMonth(month.days, goals),
    improvements: suggestMonthlyImprovements(month.days, goals),
  }));
}

function generateGoalRecommendations(days, goals) {
  const recommendations = [];

  // Анализируем последние 7 дней
  const recentDays = days.slice(-7);
  const avgKcal =
    recentDays.reduce((sum, day) => sum + (day.totalKcal || 0), 0) / recentDays.length;

  if (avgKcal < goals.kcal * 0.8) {
    recommendations.push({
      type: 'increase_kcal',
      priority: 'high',
      message: 'Увеличьте потребление калорий',
      suggestion: 'Добавьте здоровые перекусы или увеличьте порции',
    });
  }

  return recommendations;
}

// Утилиты группировки
function groupDaysByWeek(days) {
  const weeks = [];
  let currentWeek = [];

  days.forEach((day) => {
    const date = new Date(day.date);
    const dayOfWeek = date.getDay();

    if (dayOfWeek === 1 && currentWeek.length > 0) {
      // Понедельник
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentWeek.push(day);
  });

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return weeks;
}

function groupDaysByMonth(days) {
  const months = {};

  days.forEach((day) => {
    const date = new Date(day.date);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

    if (!months[monthKey]) {
      months[monthKey] = {
        name: date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
        days: [],
      };
    }

    months[monthKey].days.push(day);
  });

  return Object.values(months);
}

function calculateOverallAchievement(day, goals) {
  const kcalScore = Math.min(100, ((day.totalKcal || 0) / goals.kcal) * 100);
  const proteinScore = Math.min(100, ((day.totalProteins || 0) / goals.proteins) * 100);

  return ((kcalScore + proteinScore) / 2).toFixed(1);
}

function calculateAverageGoalAchievement(days, goals, metric) {
  const total = days.reduce(
    (sum, day) => sum + (day[`total${metric.charAt(0).toUpperCase() + metric.slice(1)}`] || 0),
    0,
  );
  const average = total / days.length;
  return ((average / goals[metric]) * 100).toFixed(1);
}

function calculateWeeklyConsistency(days) {
  const kcalValues = days.map((day) => day.totalKcal || 0);
  const mean = kcalValues.reduce((sum, kcal) => sum + kcal, 0) / kcalValues.length;
  const variance =
    kcalValues.reduce((sum, kcal) => sum + Math.pow(kcal - mean, 2), 0) / kcalValues.length;
  const stdDev = Math.sqrt(variance);

  return {
    score: Math.max(0, 100 - (stdDev / mean) * 100),
    stdDev: stdDev.toFixed(0),
  };
}

function calculateMonthlyAverageAchievement(days, goals) {
  const avgKcal = days.reduce((sum, day) => sum + (day.totalKcal || 0), 0) / days.length;
  const avgProteins = days.reduce((sum, day) => sum + (day.totalProteins || 0), 0) / days.length;

  return {
    kcal: ((avgKcal / goals.kcal) * 100).toFixed(1),
    proteins: ((avgProteins / goals.proteins) * 100).toFixed(1),
  };
}

function findBestWeekInMonth(days, goals) {
  const weeks = groupDaysByWeek(days);
  let bestWeek = null;
  let bestScore = 0;

  weeks.forEach((week) => {
    const score = parseFloat(calculateAverageGoalAchievement(week, goals, 'kcal'));
    if (score > bestScore) {
      bestScore = score;
      bestWeek = {
        start: week[0].date,
        end: week[week.length - 1].date,
        score: score,
      };
    }
  });

  return bestWeek;
}

function suggestMonthlyImprovements(days, goals) {
  const suggestions = [];

  const avgKcal = days.reduce((sum, day) => sum + (day.totalKcal || 0), 0) / days.length;

  if (avgKcal < goals.kcal * 0.9) {
    suggestions.push('Увеличить общее потребление калорий');
  }

  if (avgKcal > goals.kcal * 1.1) {
    suggestions.push('Снизить потребление калорий');
  }

  return suggestions;
}

console.log('[Worker] Analytics Worker готов к работе');
