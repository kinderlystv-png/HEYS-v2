// heys_insulin_wave_v1.js — Модуль инсулиновой волны
// Версия: 1.0.0 | Дата: 2025-12-04
// Вся логика расчёта и отображения инсулиновой волны
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === КОНСТАНТЫ ===
  const GI_CATEGORIES = {
    low: { min: 0, max: 35, multiplier: 1.2, color: '#22c55e', text: 'Низкий ГИ', desc: 'медленное усвоение' },
    medium: { min: 36, max: 55, multiplier: 1.0, color: '#eab308', text: 'Средний ГИ', desc: 'нормальное' },
    high: { min: 56, max: 70, multiplier: 0.85, color: '#f97316', text: 'Высокий ГИ', desc: 'быстрее' },
    veryHigh: { min: 71, max: 999, multiplier: 0.7, color: '#ef4444', text: 'Очень высокий', desc: 'очень быстро' }
  };
  
  const STATUS_CONFIG = {
    ready: { emoji: '✅', color: '#22c55e', label: 'Можно есть!' },
    almost: { emoji: '🔥', color: '#f97316', label: null }, // dynamic
    soon: { emoji: '⏰', color: '#eab308', label: null },
    waiting: { emoji: '🌊', color: '#0ea5e9', label: null }
  };
  
  const PROTEIN_BONUS = { high: { threshold: 40, bonus: 0.15 }, medium: { threshold: 25, bonus: 0.08 } };
  const FIBER_BONUS = { high: { threshold: 10, bonus: 0.12 }, medium: { threshold: 5, bonus: 0.05 } };
  
  const GAP_HISTORY_KEY = 'heys_meal_gaps_history';
  const GAP_HISTORY_DAYS = 14;
  
  // === УТИЛИТЫ ===
  const utils = {
    // Время в минуты с полуночи
    timeToMinutes: (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    },
    
    // Минуты в HH:MM
    minutesToTime: (minutes) => {
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    
    // Форматирование длительности
    formatDuration: (minutes) => {
      if (minutes <= 0) return '0 мин';
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h === 0) return `${m} мин`;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    },
    
    // Получить категорию ГИ
    getGICategory: (gi) => {
      if (gi <= 35) return GI_CATEGORIES.low;
      if (gi <= 55) return GI_CATEGORIES.medium;
      if (gi <= 70) return GI_CATEGORIES.high;
      return GI_CATEGORIES.veryHigh;
    },
    
    // Ночное время?
    isNightTime: (hour) => hour >= 22 || hour < 6,
    
    // Рекомендуемый приём по времени
    getNextMealSuggestion: (hour) => {
      if (hour >= 22 || hour < 6) return null;
      if (hour < 10) return { type: 'breakfast', icon: '🍳', name: 'Завтрак' };
      if (hour < 12) return { type: 'snack', icon: '🍎', name: 'Перекус' };
      if (hour < 14) return { type: 'lunch', icon: '🍲', name: 'Обед' };
      if (hour < 17) return { type: 'snack', icon: '🥜', name: 'Перекус' };
      if (hour < 20) return { type: 'dinner', icon: '🍽️', name: 'Ужин' };
      return { type: 'light', icon: '🥛', name: 'Лёгкий перекус' };
    }
  };
  
  // === РАСЧЁТ ДАННЫХ ВОЛНЫ ===
  
  /**
   * Рассчитать нутриенты приёма пищи
   * @param {Object} meal - приём пищи
   * @param {Object} pIndex - индекс продуктов
   * @param {Function} getProductFromItem - функция получения продукта
   * @returns {Object} { avgGI, totalProtein, totalFiber, totalGrams }
   */
  const calculateMealNutrients = (meal, pIndex, getProductFromItem) => {
    let totalGrams = 0;
    let weightedGI = 0;
    let totalProtein = 0;
    let totalFiber = 0;
    
    const items = meal?.items || [];
    
    for (const item of items) {
      const grams = item.grams || 100;
      const prod = getProductFromItem(item, pIndex);
      
      const gi = prod?.gi || prod?.gi100 || prod?.GI || 50;
      weightedGI += gi * grams;
      totalGrams += grams;
      
      totalProtein += (prod?.protein100 || 0) * grams / 100;
      totalFiber += (prod?.fiber100 || 0) * grams / 100;
    }
    
    const avgGI = totalGrams > 0 ? Math.round(weightedGI / totalGrams) : 50;
    
    return {
      avgGI,
      totalProtein: Math.round(totalProtein),
      totalFiber: Math.round(totalFiber),
      totalGrams
    };
  };
  
  /**
   * Рассчитать множитель длины волны
   * @param {number} gi - ГИ
   * @param {number} protein - белок в граммах
   * @param {number} fiber - клетчатка в граммах
   * @returns {Object} { total, gi, protein, fiber }
   */
  const calculateMultiplier = (gi, protein, fiber) => {
    const giCat = utils.getGICategory(gi);
    let giMult = giCat.multiplier;
    
    let proteinBonus = 0;
    if (protein >= PROTEIN_BONUS.high.threshold) proteinBonus = PROTEIN_BONUS.high.bonus;
    else if (protein >= PROTEIN_BONUS.medium.threshold) proteinBonus = PROTEIN_BONUS.medium.bonus;
    
    let fiberBonus = 0;
    if (fiber >= FIBER_BONUS.high.threshold) fiberBonus = FIBER_BONUS.high.bonus;
    else if (fiber >= FIBER_BONUS.medium.threshold) fiberBonus = FIBER_BONUS.medium.bonus;
    
    return {
      total: giMult + proteinBonus + fiberBonus,
      gi: giMult,
      protein: proteinBonus,
      fiber: fiberBonus,
      category: giCat
    };
  };
  
  /**
   * Главная функция расчёта данных инсулиновой волны
   * @param {Object} params
   * @returns {Object|null}
   */
  const calculateInsulinWaveData = ({ 
    meals, 
    pIndex, 
    getProductFromItem, 
    baseWaveHours = 3,
    now = new Date()
  }) => {
    if (!meals || meals.length === 0) return null;
    
    // Фильтруем приёмы с временем
    const mealsWithTime = meals.filter(m => m.time);
    if (mealsWithTime.length === 0) return null;
    
    // Сортируем по времени (последний первый)
    const sorted = [...mealsWithTime].sort((a, b) => {
      const timeA = (a.time || '').replace(':', '');
      const timeB = (b.time || '').replace(':', '');
      return timeB.localeCompare(timeA);
    });
    
    const lastMeal = sorted[0];
    const lastMealTime = lastMeal?.time;
    if (!lastMealTime) return null;
    
    // Расчёт нутриентов последнего приёма
    const nutrients = calculateMealNutrients(lastMeal, pIndex, getProductFromItem);
    const multipliers = calculateMultiplier(nutrients.avgGI, nutrients.totalProtein, nutrients.totalFiber);
    
    // Скорректированная длина волны
    const adjustedWaveHours = baseWaveHours * multipliers.total;
    const waveMinutes = adjustedWaveHours * 60;
    
    // Время
    const mealMinutes = utils.timeToMinutes(lastMealTime);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    let diffMinutes = nowMinutes - mealMinutes;
    if (diffMinutes < 0) diffMinutes = 0;
    
    const remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
    const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);
    
    // Время окончания
    const endMinutes = mealMinutes + Math.round(waveMinutes);
    const endTime = utils.minutesToTime(endMinutes);
    
    // === История волн за день ===
    const waveHistory = sorted.map((meal, idx) => {
      const t = meal.time;
      if (!t) return null;
      
      const startMin = utils.timeToMinutes(t);
      const mealNutrients = calculateMealNutrients(meal, pIndex, getProductFromItem);
      const mealMult = calculateMultiplier(mealNutrients.avgGI, mealNutrients.totalProtein, mealNutrients.totalFiber);
      
      const duration = Math.round(baseWaveHours * mealMult.total * 60);
      const endMin = startMin + duration;
      
      return {
        time: t,
        startMin,
        endMin,
        duration,
        gi: mealNutrients.avgGI,
        protein: mealNutrients.totalProtein,
        fiber: mealNutrients.totalFiber,
        isActive: idx === 0 && remainingMinutes > 0
      };
    }).filter(Boolean).reverse();
    
    // === Анализ перекрытия волн ===
    const overlaps = [];
    for (let i = 0; i < waveHistory.length - 1; i++) {
      const current = waveHistory[i];
      const next = waveHistory[i + 1];
      if (current.endMin > next.startMin) {
        const overlapMin = current.endMin - next.startMin;
        overlaps.push({
          from: current.time,
          to: next.time,
          overlapMinutes: overlapMin,
          severity: overlapMin > 60 ? 'high' : overlapMin > 30 ? 'medium' : 'low'
        });
      }
    }
    
    // === Персональная статистика ===
    const gaps = [];
    for (let i = 0; i < waveHistory.length - 1; i++) {
      gaps.push(waveHistory[i + 1].startMin - waveHistory[i].startMin);
    }
    const avgGapToday = gaps.length > 0 
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) 
      : 0;
    
    // История gaps
    let gapHistory = [];
    try {
      gapHistory = JSON.parse(localStorage.getItem(GAP_HISTORY_KEY) || '[]');
    } catch (e) {}
    
    const today = now.toISOString().slice(0, 10);
    const todayEntry = gapHistory.find(g => g.date === today);
    if (avgGapToday > 0) {
      if (todayEntry) {
        todayEntry.avgGap = avgGapToday;
        todayEntry.count = gaps.length;
      } else {
        gapHistory.push({ date: today, avgGap: avgGapToday, count: gaps.length });
      }
      gapHistory = gapHistory.slice(-GAP_HISTORY_DAYS);
      try {
        localStorage.setItem(GAP_HISTORY_KEY, JSON.stringify(gapHistory));
      } catch (e) {}
    }
    
    const personalAvgGap = gapHistory.length > 0
      ? Math.round(gapHistory.reduce((sum, g) => sum + g.avgGap, 0) / gapHistory.length)
      : 0;
    
    const recommendedGap = Math.round(baseWaveHours * 60);
    
    let gapQuality = 'unknown';
    if (personalAvgGap > 0) {
      if (personalAvgGap >= recommendedGap * 0.9) gapQuality = 'excellent';
      else if (personalAvgGap >= recommendedGap * 0.75) gapQuality = 'good';
      else if (personalAvgGap >= recommendedGap * 0.5) gapQuality = 'moderate';
      else gapQuality = 'needs-work';
    }
    
    // === Статус ===
    const currentHour = now.getHours();
    const isNight = utils.isNightTime(currentHour);
    
    let status, emoji, text, color, subtext;
    
    if (remainingMinutes <= 0) {
      status = 'ready';
      emoji = STATUS_CONFIG.ready.emoji;
      text = STATUS_CONFIG.ready.label;
      color = STATUS_CONFIG.ready.color;
      
      if (isNight) {
        subtext = '🌙 Но лучше отложить до утра';
      } else {
        const suggestion = utils.getNextMealSuggestion(currentHour);
        subtext = suggestion ? `${suggestion.icon} Время для: ${suggestion.name}` : null;
      }
    } else if (remainingMinutes <= 15) {
      status = 'almost';
      emoji = STATUS_CONFIG.almost.emoji;
      text = `${Math.ceil(remainingMinutes)} мин`;
      color = STATUS_CONFIG.almost.color;
      subtext = isNight ? '🌙 Но ночью лучше не есть' : '⏰ Скоро можно есть!';
    } else if (remainingMinutes <= 30) {
      status = 'soon';
      emoji = STATUS_CONFIG.soon.emoji;
      text = `${Math.ceil(remainingMinutes)} мин`;
      color = STATUS_CONFIG.soon.color;
      subtext = '🍵 Выпей воды пока ждёшь';
    } else {
      status = 'waiting';
      emoji = STATUS_CONFIG.waiting.emoji;
      text = utils.formatDuration(remainingMinutes);
      color = STATUS_CONFIG.waiting.color;
      subtext = '💧 Отличное время для воды';
    }
    
    return {
      // Статус
      status, emoji, text, color, subtext,
      
      // Прогресс
      progress: progressPct,
      remaining: remainingMinutes,
      
      // Время
      lastMealTime,
      endTime,
      
      // Волна
      insulinWaveHours: adjustedWaveHours,
      baseWaveHours,
      
      // Флаги
      isNightTime: isNight,
      
      // ГИ данные
      avgGI: nutrients.avgGI,
      giCategory: multipliers.category,
      giMultiplier: multipliers.gi,
      
      // Нутриенты
      totalProtein: nutrients.totalProtein,
      totalFiber: nutrients.totalFiber,
      proteinBonus: multipliers.protein,
      fiberBonus: multipliers.fiber,
      
      // История
      waveHistory,
      
      // Перекрытия
      overlaps,
      hasOverlaps: overlaps.length > 0,
      worstOverlap: overlaps.reduce((max, o) => 
        o.overlapMinutes > (max?.overlapMinutes || 0) ? o : max, null),
      
      // Персональная статистика
      avgGapToday,
      personalAvgGap,
      recommendedGap,
      gapQuality,
      gapHistory: gapHistory.slice(-7)
    };
  };
  
  // === UI КОМПОНЕНТЫ ===
  
  /**
   * Рендер прогресс-бара волны
   */
  const renderProgressBar = (data) => {
    const progress = data.progress || 0;
    const getGradient = (pct) => {
      if (pct < 50) return `linear-gradient(90deg, #0ea5e9 0%, #3b82f6 ${pct * 2}%)`;
      if (pct < 80) return `linear-gradient(90deg, #0ea5e9 0%, #3b82f6 50%, #8b5cf6 ${pct}%)`;
      if (pct < 95) return `linear-gradient(90deg, #3b82f6 0%, #8b5cf6 60%, #f97316 ${pct}%)`;
      return `linear-gradient(90deg, #8b5cf6 0%, #f97316 70%, #22c55e 100%)`;
    };
    
    return React.createElement('div', {
      className: 'insulin-wave-progress',
      style: { position: 'relative', marginTop: '8px' }
    },
      React.createElement('div', {
        style: {
          height: '12px',
          background: '#e5e7eb',
          borderRadius: '6px',
          overflow: 'hidden',
          position: 'relative'
        }
      },
        React.createElement('div', {
          className: 'insulin-progress-fill',
          style: {
            position: 'absolute',
            left: 0, top: 0, height: '100%',
            width: `${progress}%`,
            background: getGradient(progress),
            borderRadius: '6px',
            transition: 'width 0.5s ease-out'
          }
        }),
        React.createElement('div', {
          style: {
            position: 'absolute',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '10px',
            fontWeight: '700',
            color: progress > 50 ? '#fff' : '#64748b',
            textShadow: progress > 50 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none'
          }
        }, `${Math.round(progress)}%`)
      )
    );
  };
  
  /**
   * Рендер истории волн (мини-график)
   */
  const renderWaveHistory = (data) => {
    const history = data.waveHistory || [];
    if (history.length === 0) return null;
    
    const firstMealMin = Math.min(...history.map(w => w.startMin));
    const lastMealEnd = Math.max(...history.map(w => w.endMin));
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    
    const rangeStart = firstMealMin - 15;
    const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
    const totalRange = rangeEnd - rangeStart;
    
    const w = 320;
    const h = 60;
    const padding = 4;
    const barY = 20;
    const barH = 18;
    
    const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);
    
    return React.createElement('div', { 
      className: 'insulin-history', 
      style: { marginTop: '12px', margin: '12px -8px 0 -8px' } 
    },
      React.createElement('div', { 
        style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' } 
      }, '📊 Волны сегодня'),
      
      React.createElement('svg', { 
        width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' }
      },
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
            React.createElement('stop', { offset: '100%', stopColor: '#8b5cf6' })
          )
        ),
        
        // Фоновая линия
        React.createElement('line', {
          x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2,
          stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round'
        }),
        
        // Волны
        history.map((wave, i) => {
          const x1 = minToX(wave.startMin);
          const x2 = minToX(wave.endMin);
          const barW = Math.max(8, x2 - x1);
          const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';
          
          return React.createElement('g', { key: 'wave-' + i },
            React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor,
              opacity: wave.isActive ? 1 : 0.6,
              rx: 4
            }),
            wave.isActive && React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4,
              className: 'wave-active-pulse'
            })
          );
        }),
        
        // Точки приёмов
        history.map((wave, i) => {
          const x = minToX(wave.startMin);
          return React.createElement('g', { key: 'meal-' + i },
            React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
            React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
            React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' }, 
              utils.minutesToTime(wave.startMin))
          );
        }),
        
        // Текущее время
        (() => {
          const x = minToX(nowMin);
          if (x < padding || x > w - padding) return null;
          return React.createElement('g', null,
            React.createElement('line', { x1: x, y1: barY - 5, x2: x, y2: barY + barH + 5, stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
            React.createElement('polygon', { points: `${x-4},${barY-5} ${x+4},${barY-5} ${x},${barY}`, fill: '#ef4444' }),
            React.createElement('text', { x, y: barY - 8, fontSize: 8, fill: '#ef4444', textAnchor: 'middle', fontWeight: '600' }, 'Сейчас')
          );
        })()
      ),
      
      // Легенда
      React.createElement('div', { 
        className: 'insulin-history-legend',
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #3b82f6', background: '#fff' } }),
          'Приём'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '16px', height: '8px', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' } }),
          'Активная'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' } }),
          'Низкий ГИ'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#eab308' } }),
          'Средний'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '12px', height: '2px', background: '#ef4444' } }),
          'Сейчас'
        )
      )
    );
  };
  
  /**
   * Рендер expanded секции с детальной информацией
   */
  const renderExpandedSection = (data) => {
    const giCat = data.giCategory;
    
    return React.createElement('div', { 
      className: 'insulin-wave-expanded',
      onClick: e => e.stopPropagation()
    },
      // ГИ информация
      React.createElement('div', { className: 'insulin-gi-info' },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: giCat.color } }),
          React.createElement('span', { style: { fontWeight: '600' } }, giCat.text),
          React.createElement('span', { style: { color: '#64748b', fontSize: '12px' } }, '— ' + giCat.desc)
        ),
        React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
          `Базовая волна: ${data.baseWaveHours}ч → Скорректированная: ${Math.round(data.insulinWaveHours * 10) / 10}ч`
        ),
        // Модификаторы
        (data.proteinBonus > 0 || data.fiberBonus > 0) && 
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            data.totalProtein > 0 && React.createElement('span', null, 
              `🥩 Белок: ${data.totalProtein}г${data.proteinBonus > 0 ? ` (+${Math.round(data.proteinBonus * 100)}%)` : ''}`
            ),
            data.totalFiber > 0 && React.createElement('span', null, 
              `🌾 Клетчатка: ${data.totalFiber}г${data.fiberBonus > 0 ? ` (+${Math.round(data.fiberBonus * 100)}%)` : ''}`
            )
          )
      ),
      
      // Предупреждение о перекрытии
      data.hasOverlaps && React.createElement('div', { 
        className: 'insulin-overlap-warning',
        style: { 
          marginTop: '8px', padding: '8px', 
          background: data.worstOverlap?.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
          borderRadius: '8px', fontSize: '12px',
          border: `1px solid ${data.worstOverlap?.severity === 'high' ? '#fca5a5' : '#fcd34d'}`
        }
      },
        React.createElement('div', { style: { fontWeight: '600', color: data.worstOverlap?.severity === 'high' ? '#dc2626' : '#d97706' } },
          '⚠️ Волны пересеклись!'
        ),
        React.createElement('div', { style: { marginTop: '2px', color: '#64748b' } },
          data.overlaps.map((o, i) => 
            React.createElement('div', { key: i }, `${o.from} → ${o.to}: перекрытие ${o.overlapMinutes} мин`)
          )
        ),
        React.createElement('div', { style: { marginTop: '4px', fontSize: '11px', fontStyle: 'italic' } },
          `💡 Совет: подожди минимум ${Math.round(data.baseWaveHours * 60)} мин между приёмами`
        )
      ),
      
      // Персональная статистика
      data.personalAvgGap > 0 && React.createElement('div', { 
        className: 'insulin-personal-stats',
        style: { marginTop: '8px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '12px' }
      },
        React.createElement('div', { style: { fontWeight: '600', color: '#3b82f6', marginBottom: '4px' } }, '📊 Твои паттерны'),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b' } },
          React.createElement('span', null, 'Сегодня между приёмами:'),
          React.createElement('span', { style: { fontWeight: '600' } }, 
            data.avgGapToday > 0 ? utils.formatDuration(data.avgGapToday) : '—'
          )
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
          React.createElement('span', null, 'Твой средний gap:'),
          React.createElement('span', { style: { fontWeight: '600' } }, utils.formatDuration(data.personalAvgGap))
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
          React.createElement('span', null, 'Рекомендуемый:'),
          React.createElement('span', { style: { fontWeight: '600' } }, utils.formatDuration(data.recommendedGap))
        ),
        // Оценка
        React.createElement('div', { 
          style: { 
            marginTop: '6px', padding: '4px 8px', borderRadius: '4px', textAlign: 'center', fontWeight: '600',
            background: data.gapQuality === 'excellent' ? '#dcfce7' : data.gapQuality === 'good' ? '#fef9c3' : data.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
            color: data.gapQuality === 'excellent' ? '#166534' : data.gapQuality === 'good' ? '#854d0e' : data.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
          }
        },
          data.gapQuality === 'excellent' ? '🌟 Отлично! Выдерживаешь оптимальные промежутки' :
          data.gapQuality === 'good' ? '👍 Хорошо! Почти идеальные промежутки' :
          data.gapQuality === 'moderate' ? '😐 Можно лучше. Попробуй увеличить gap' :
          '⚠️ Ешь слишком часто. Дай организму переварить'
        )
      ),
      
      // История волн
      renderWaveHistory(data)
    );
  };
  
  // === Hook для использования в компоненте ===
  const useInsulinWave = ({ meals, pIndex, getProductFromItem, baseWaveHours = 3 }) => {
    const [expanded, setExpanded] = React.useState(false);
    const [isShaking, setIsShaking] = React.useState(false);
    
    // Текущая минута для авто-обновления
    const [currentMinute, setCurrentMinute] = React.useState(() => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    });
    
    // Обновление каждую минуту
    React.useEffect(() => {
      const interval = setInterval(() => {
        const now = new Date();
        setCurrentMinute(now.getHours() * 60 + now.getMinutes());
      }, 60000);
      return () => clearInterval(interval);
    }, []);
    
    // Расчёт данных
    const data = React.useMemo(() => {
      return calculateInsulinWaveData({
        meals,
        pIndex,
        getProductFromItem,
        baseWaveHours
      });
    }, [meals, pIndex, baseWaveHours, currentMinute]);
    
    // Shake при almost
    React.useEffect(() => {
      if (data?.status === 'almost' && !isShaking) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }
    }, [data?.status]);
    
    const toggle = React.useCallback(() => setExpanded(prev => !prev), []);
    
    return {
      data,
      expanded,
      setExpanded,
      toggle,
      isShaking,
      renderProgressBar: () => data ? renderProgressBar(data) : null,
      renderWaveHistory: () => data ? renderWaveHistory(data) : null,
      renderExpandedSection: () => data ? renderExpandedSection(data) : null
    };
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = {
    // Главная функция расчёта
    calculate: calculateInsulinWaveData,
    
    // Hook
    useInsulinWave,
    
    // UI компоненты
    renderProgressBar,
    renderWaveHistory,
    renderExpandedSection,
    
    // Утилиты
    utils,
    calculateMealNutrients,
    calculateMultiplier,
    
    // Константы
    GI_CATEGORIES,
    STATUS_CONFIG,
    PROTEIN_BONUS,
    FIBER_BONUS,
    
    // Версия
    VERSION: '1.0.0'
  };
  
  // Алиас
  HEYS.IW = HEYS.InsulinWave;
  
  console.log('[HEYS] InsulinWave v1.0.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
