// heys_iw_ndte.js — NDTE Badge UI Module
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль UI для NDTE (Next-Day Training Effect) badge с countdown и анимацией.
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.
//
// ФУНКЦИИ:
// - renderNDTEBadge() — интерактивный badge с пульсирующей анимацией
// - Countdown таймер до окончания эффекта
// - Expandable секция с детализацией
//
// Научная база: EPOC (Excess Post-exercise Oxygen Consumption), 48-hour metabolic boost

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === 🔥 NDTE BADGE — интерактивный badge с countdown (v3.7.0) ===
  /**
   * Рендерит интерактивный NDTE badge с пульсирующей анимацией и expand-секцией
   * @param {Object} ndteData - данные из calculateNDTE()
   * @param {number} ndteBoostKcal - бонус в ккал
   * @param {boolean} expanded - развёрнут ли badge
   * @param {Function} onToggle - callback при клике
   */
  const renderNDTEBadge = (ndteData, ndteBoostKcal, expanded, onToggle) => {
    if (!ndteData || !ndteData.active) return null;
    
    const boostPct = Math.round(ndteData.tdeeBoost * 100);
    const waveReductionPct = Math.round(ndteData.waveReduction * 100);
    const peakReductionPct = Math.round((ndteData.peakReduction || 0) * 100);
    
    // Расчёт оставшегося времени до окончания эффекта
    const hoursRemaining = Math.max(0, 48 - ndteData.hoursSince);
    const decayPct = ndteData.decayMultiplier ? Math.round(ndteData.decayMultiplier * 100) : 100;
    
    // Форматирование времени
    const formatTimeRemaining = (hours) => {
      if (hours <= 0) return 'завершён';
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      if (h === 0) return `${m} мин`;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    };
    
    // Определение типа тренировки для иконки
    const typeIcons = {
      cardio: '🏃',
      strength: '🏋️',
      hobby: '⚽'
    };
    const typeIcon = typeIcons[ndteData.trainingType] || '🔥';
    
    return React.createElement('div', {
      style: { display: 'inline-block', marginLeft: '6px' }
    },
      // Кликабельный badge
      React.createElement('span', {
        className: 'ndte-badge ndte-badge--active',
        onClick: (e) => {
          e.stopPropagation();
          if (onToggle) onToggle();
        },
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }
      },
        React.createElement('span', null, '🔥'),
        React.createElement('span', null, `+${boostPct}%`),
        React.createElement('span', {
          style: {
            marginLeft: '2px',
            fontSize: '10px',
            opacity: 0.7,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),
      
      // Expand секция
      expanded && React.createElement('div', { className: 'ndte-expand' },
        // Header
        React.createElement('div', { className: 'ndte-expand__header' },
          React.createElement('span', { className: 'ndte-expand__icon' }, '🔥'),
          React.createElement('div', null,
            React.createElement('div', { className: 'ndte-expand__title' }, 'Next-Day Training Effect'),
            React.createElement('div', { className: 'ndte-expand__subtitle' }, 
              `${typeIcon} ${ndteData.trainingKcal} ккал • ${ndteData.hoursSince} ч назад`
            )
          )
        ),
        
        // Stats grid
        React.createElement('div', { className: 'ndte-expand__stats' },
          // TDEE boost
          React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '⚡'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `+${ndteBoostKcal} ккал`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'к TDEE')
            )
          ),
          // Wave reduction
          React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '📉'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `-${waveReductionPct}%`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'волна короче')
            )
          ),
          // Peak reduction (если есть)
          peakReductionPct > 0 && React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '🎯'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `-${peakReductionPct}%`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'пик инсулина')
            )
          ),
          // BMI multiplier (если есть)
          ndteData.bmiMultiplier && ndteData.bmiMultiplier !== 1 && React.createElement('div', { className: 'ndte-expand__stat' },
            React.createElement('span', { className: 'ndte-expand__stat-icon' }, '📊'),
            React.createElement('div', { className: 'ndte-expand__stat-content' },
              React.createElement('span', { className: 'ndte-expand__stat-value' }, `×${ndteData.bmiMultiplier.toFixed(1)}`),
              React.createElement('span', { className: 'ndte-expand__stat-label' }, 'BMI boost')
            )
          )
        ),
        
        // Decay progress bar
        React.createElement('div', { className: 'ndte-expand__decay' },
          React.createElement('div', { className: 'ndte-expand__decay-header' },
            React.createElement('span', { className: 'ndte-expand__decay-label' }, 'Эффект активен'),
            React.createElement('span', { className: 'ndte-expand__decay-time' }, 
              `⏱️ осталось ${formatTimeRemaining(hoursRemaining)}`
            )
          ),
          React.createElement('div', { className: 'ndte-expand__decay-bar' },
            React.createElement('div', { 
              className: 'ndte-expand__decay-fill',
              style: { width: `${decayPct}%` }
            })
          )
        )
      )
    );
  };
  
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.NDTE = {
    renderNDTEBadge
  };
  
})(typeof window !== 'undefined' ? window : global);
