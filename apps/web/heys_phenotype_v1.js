// heys_phenotype_v1.js — Модуль метаболического фенотипа
// v1.1.0 — Отдельная expandable карточка с radar chart
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const { createElement: h, useState, useMemo, useEffect } = React;
  
  // InfoButton из PredictiveInsights (lazy reference)
  const getInfoButton = () => HEYS.PredictiveInsights?.InfoButton || null;
  
  // === Конфигурация фенотипов ===
  const PHENOTYPE_CONFIG = {
    sprinter: { 
      emoji: '🏃', 
      color: '#ef4444', 
      gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
      label: 'Спринтер', 
      shortDesc: 'Быстрый метаболизм',
      desc: 'Быстрый метаболизм, высокие пики энергии, короткие инсулиновые волны. Тебе нужны частые небольшие приёмы пищи.' 
    },
    marathoner: { 
      emoji: '🏃‍♂️', 
      color: '#3b82f6', 
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
      label: 'Марафонец', 
      shortDesc: 'Стабильная энергия',
      desc: 'Стабильная энергия, длинные волны, отличная выносливость. Можешь есть реже, но плотнее.' 
    },
    powerlifter: { 
      emoji: '🏋️', 
      color: '#8b5cf6', 
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
      label: 'Силовик', 
      shortDesc: 'Мощное восстановление',
      desc: 'Высокая мышечная масса, быстрое восстановление после нагрузок. Важен белок после тренировок.' 
    },
    balanced: { 
      emoji: '⚖️', 
      color: '#22c55e', 
      gradient: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
      label: 'Сбалансированный', 
      shortDesc: 'Гармоничный профиль',
      desc: 'Гармоничный профиль без ярких перекосов. Подходит стандартный режим питания.' 
    },
    nightowl: { 
      emoji: '🦉', 
      color: '#6366f1', 
      gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      label: 'Сова', 
      shortDesc: 'Вечерний пик',
      desc: 'Поздний хронотип, высокая активность вечером. Можно сместить основные приёмы ближе к вечеру.' 
    },
    earlybird: { 
      emoji: '🐦', 
      color: '#f59e0b', 
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      label: 'Жаворонок', 
      shortDesc: 'Утренний пик',
      desc: 'Ранний хронотип, пик энергии утром. Важен плотный завтрак.' 
    }
  };

  // === Tier конфигурация (уровни точности) ===
  const TIER_CONFIG = {
    basic: { label: 'Базовый', color: '#94a3b8', days: 0, icon: '🌱' },
    developing: { label: 'Развивающийся', color: '#f59e0b', days: 7, icon: '🌿' },
    confident: { label: 'Уверенный', color: '#22c55e', days: 14, icon: '🌳' },
    expert: { label: 'Экспертный', color: '#8b5cf6', days: 30, icon: '⭐' }
  };

  // === TRAITS для Radar Chart ===
  const TRAITS = [
    { key: 'stability', label: 'Стабильность', icon: '📊', color: '#22c55e', desc: 'Насколько ровно держится энергия в течение дня' },
    { key: 'recovery', label: 'Восстановление', icon: '🔄', color: '#3b82f6', desc: 'Как быстро восстанавливаешься после нагрузок' },
    { key: 'insulinSensitivity', label: 'Инсулин', icon: '💉', color: '#f59e0b', desc: 'Чувствительность к углеводам и инсулиновые пики' },
    { key: 'consistency', label: 'Постоянство', icon: '📈', color: '#ec4899', desc: 'Насколько регулярно следуешь режиму' },
    { key: 'chronotype', label: 'Хронотип', icon: '🕐', color: '#8b5cf6', desc: 'Время пиковой активности (утро/вечер)' }
  ];

  /**
   * MiniRadar — Компактный radar chart для заголовка карточки
   */
  function MiniRadar({ data, color = '#8b5cf6', size = 80 }) {
    const center = size / 2;
    const radius = size / 2 - 8;
    const angleStep = (2 * Math.PI) / TRAITS.length;
    
    const points = TRAITS.map((trait, i) => {
      const value = (data[trait.key] || 50) / 100;
      const angle = -Math.PI / 2 + i * angleStep;
      return {
        x: center + Math.cos(angle) * radius * value,
        y: center + Math.sin(angle) * radius * value
      };
    });
    
    const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    
    return h('svg', { 
      viewBox: `0 0 ${size} ${size}`, 
      className: 'mini-radar',
      style: { width: size, height: size }
    },
      // Background circle
      h('circle', {
        cx: center, cy: center, r: radius,
        fill: 'none', stroke: '#e2e8f0', strokeWidth: 1
      }),
      // Data polygon
      h('polygon', {
        points: polygonPoints,
        fill: color,
        fillOpacity: 0.25,
        stroke: color,
        strokeWidth: 2
      }),
      // Points
      points.map((p, i) =>
        h('circle', {
          key: i, cx: p.x, cy: p.y, r: 2.5,
          fill: color
        })
      )
    );
  }

  /**
   * FullRadar — Полноразмерный radar chart для expand-секции
   */
  function FullRadar({ data, color = '#8b5cf6' }) {
    const size = 240;
    const center = size / 2;
    const radius = size / 2 - 40;
    const angleStep = (2 * Math.PI) / TRAITS.length;
    
    const points = TRAITS.map((trait, i) => {
      const value = (data[trait.key] || 50) / 100;
      const angle = -Math.PI / 2 + i * angleStep;
      return {
        x: center + Math.cos(angle) * radius * value,
        y: center + Math.sin(angle) * radius * value,
        value: data[trait.key] || 50,
        labelX: center + Math.cos(angle) * (radius + 28),
        labelY: center + Math.sin(angle) * (radius + 28),
        color: trait.color,
        label: trait.label
      };
    });
    
    const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const gradientId = 'fullRadarGrad_' + Math.random().toString(36).substr(2, 9);
    
    return h('div', { className: 'full-radar' },
      h('svg', { viewBox: `0 0 ${size} ${size}`, className: 'full-radar__svg' },
        // Gradient
        h('defs', null,
          h('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
            h('stop', { offset: '0%', stopColor: '#8b5cf6', stopOpacity: '0.4' }),
            h('stop', { offset: '50%', stopColor: '#3b82f6', stopOpacity: '0.3' }),
            h('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.4' })
          )
        ),
        
        // Background circles
        [0.25, 0.5, 0.75, 1].map((scale, idx) =>
          h('circle', {
            key: scale, cx: center, cy: center, r: radius * scale,
            fill: 'none',
            stroke: `rgba(139, 92, 246, ${0.15 + idx * 0.05})`,
            strokeWidth: idx === 3 ? 2 : 1,
            strokeDasharray: idx < 3 ? '4,4' : 'none'
          })
        ),
        
        // Axes
        TRAITS.map((_, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          return h('line', {
            key: i,
            x1: center, y1: center,
            x2: center + Math.cos(angle) * radius,
            y2: center + Math.sin(angle) * radius,
            stroke: 'rgba(139, 92, 246, 0.2)',
            strokeWidth: 1
          });
        }),
        
        // Data polygon
        h('polygon', {
          points: polygonPoints,
          fill: `url(#${gradientId})`,
          stroke: '#8b5cf6',
          strokeWidth: 2.5,
          strokeLinejoin: 'round'
        }),
        
        // Data points
        points.map((p, i) =>
          h('g', { key: i },
            h('circle', { cx: p.x, cy: p.y, r: 6, fill: p.color, fillOpacity: 0.2 }),
            h('circle', { cx: p.x, cy: p.y, r: 4, fill: p.color, stroke: '#fff', strokeWidth: 1.5 })
          )
        ),
        
        // Labels
        points.map((p, i) =>
          h('text', {
            key: i, x: p.labelX, y: p.labelY,
            textAnchor: 'middle', dominantBaseline: 'middle',
            fontSize: 10, fontWeight: 600, fill: '#64748b'
          }, `${p.label}`)
        )
      ),
      
      // Legend
      h('div', { className: 'full-radar__legend' },
        TRAITS.map((trait, i) =>
          h('div', { key: i, className: 'full-radar__legend-item' },
            h('span', { 
              className: 'full-radar__legend-dot',
              style: { background: trait.color }
            }),
            h('span', { className: 'full-radar__legend-label' }, trait.label),
            h('span', { className: 'full-radar__legend-value' }, 
              `${data[trait.key] || 50}%`
            )
          )
        )
      )
    );
  }

  /**
   * usePhenotype — Hook для получения данных фенотипа
   * Маппит API HEYS.Metabolic.identifyPhenotype на UI формат
   */
  function usePhenotype(profile) {
    return useMemo(() => {
      if (!HEYS.Metabolic?.identifyPhenotype) {
        return { available: false, daysRequired: 7, daysAvailable: 0 };
      }
      
      try {
        const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(90) : [];
        const result = HEYS.Metabolic.identifyPhenotype(
          history,
          profile || window.HEYS?.utils?.lsGet?.('heys_profile', {})
        );
        
        if (!result || !result.available) {
          return result;
        }
        
        // Маппинг типа фенотипа (API → UI)
        const phenotypeMap = {
          'balanced': 'balanced',
          'carb_preferring': 'sprinter',    // Углеводный → Спринтер
          'fat_preferring': 'marathoner',   // Жировой → Марафонец  
          'protein_efficient': 'powerlifter' // Белковый → Силовик
        };
        
        // Маппинг tier (API → UI)
        const tierMap = {
          'basic': 'basic',
          'standard': 'developing',
          'advanced': 'confident'
        };
        
        return {
          ...result,
          // Маппинг type для UI конфига
          type: phenotypeMap[result.phenotype] || 'balanced',
          // Маппинг tier для UI конфига
          tier: tierMap[result.tier] || 'basic',
          // Маппинг radarData → traits для компонентов
          traits: result.radarData || {
            stability: 50,
            recovery: 50,
            insulinSensitivity: 50,
            consistency: 50,
            chronotype: 50
          },
          // Confidence как число (0-100)
          confidence: Math.round((result.confidence || 0.5) * 100),
          // Strengths/weaknesses
          strengths: result.strengths || [],
          weaknesses: result.weaknesses || [],
          // Recommendations
          recommendations: result.recommendations || [],
          // Thresholds
          thresholds: result.personalThresholds || null,
          // Next tier info
          nextTier: result.nextTier ? {
            tier: tierMap[result.nextTier.name] || result.nextTier.name,
            daysNeeded: result.nextTier.daysNeeded,
            unlocks: result.nextTier.unlocks
          } : null
        };
      } catch (e) {
        console.error('[Phenotype] Error:', e);
        return { available: false, daysRequired: 7, daysAvailable: 0 };
      }
    }, [profile]);
  }

  /**
   * PhenotypeExpandableCard — Основная expandable карточка фенотипа
   * Показывает заголовок с мини-радаром, по клику раскрывается с деталями
   */
  function PhenotypeExpandableCard({ profile }) {
    const [expanded, setExpanded] = useState(false);
    const phenotype = usePhenotype(profile);
    
    // Если данных мало — показываем empty state
    if (!phenotype || !phenotype.available) {
      const progress = Math.round(((phenotype?.daysAvailable || 0) / (phenotype?.daysRequired || 7)) * 100);
      
      return h('div', { className: 'phenotype-expandable-card phenotype-expandable-card--empty' },
        h('div', { className: 'phenotype-expandable-card__header' },
          h('div', { className: 'phenotype-expandable-card__icon' }, '🧬'),
          h('div', { className: 'phenotype-expandable-card__title-block' },
            h('div', { className: 'phenotype-expandable-card__title' }, 'Метаболический фенотип'),
            h('div', { className: 'phenotype-expandable-card__subtitle' }, 
              `Определяется... ${phenotype?.daysAvailable || 0}/${phenotype?.daysRequired || 7} дней`
            )
          ),
          h('div', { className: 'phenotype-expandable-card__progress-mini' },
            h('div', { 
              className: 'phenotype-expandable-card__progress-fill',
              style: { width: `${progress}%` }
            })
          )
        )
      );
    }
    
    const config = PHENOTYPE_CONFIG[phenotype.type] || PHENOTYPE_CONFIG.balanced;
    const tier = TIER_CONFIG[phenotype.tier] || TIER_CONFIG.basic;
    const confidence = phenotype.confidence || 50;
    
    return h('div', { 
      className: `phenotype-expandable-card ${expanded ? 'phenotype-expandable-card--expanded' : ''}`,
      style: { '--phenotype-color': config.color }
    },
      // Header (всегда видимый)
      h('div', { 
        className: 'phenotype-expandable-card__header',
        onClick: () => setExpanded(!expanded)
      },
        // Left: Emoji + Type + InfoButton
        h('div', { className: 'phenotype-expandable-card__left' },
          h('div', { 
            className: 'phenotype-expandable-card__emoji',
            style: { background: config.gradient }
          }, config.emoji),
          h('div', { className: 'phenotype-expandable-card__title-block' },
            h('div', { className: 'phenotype-expandable-card__title-row' },
              h('span', null, config.label),
              // InfoButton рядом с заголовком
              getInfoButton() && h(getInfoButton(), { infoKey: 'PHENOTYPE', size: 'small' })
            ),
            h('div', { className: 'phenotype-expandable-card__subtitle' }, config.shortDesc)
          )
        ),
        
        // Center: Mini radar
        h('div', { className: 'phenotype-expandable-card__center' },
          h(MiniRadar, { data: phenotype.traits || {}, color: config.color, size: 56 })
        ),
        
        // Right: Tier + Arrow
        h('div', { className: 'phenotype-expandable-card__right' },
          h('div', { 
            className: 'phenotype-expandable-card__tier',
            style: { background: tier.color }
          }, tier.icon),
          h('div', { 
            className: `phenotype-expandable-card__arrow ${expanded ? 'phenotype-expandable-card__arrow--up' : ''}`
          }, expanded ? '▲' : '▼')
        )
      ),
      
      // Expand content
      expanded && h('div', { className: 'phenotype-expandable-card__content' },
        // Description
        h('div', { className: 'phenotype-expandable-card__desc' }, config.desc),
        
        // Confidence bar
        h('div', { className: 'phenotype-expandable-card__confidence' },
          h('div', { className: 'phenotype-expandable-card__confidence-row' },
            h('span', null, `${tier.icon} ${tier.label}`),
            h('span', null, `${confidence}% уверенность`)
          ),
          h('div', { className: 'phenotype-expandable-card__confidence-bar' },
            h('div', { 
              className: 'phenotype-expandable-card__confidence-fill',
              style: { width: `${confidence}%`, background: config.gradient }
            })
          )
        ),
        
        // Full Radar с InfoButton
        h('div', { className: 'phenotype-expandable-card__radar' },
          h('div', { className: 'phenotype-expandable-card__section-header' },
            h('span', null, '📊 Профиль метаболизма'),
            getInfoButton() && h(getInfoButton(), { infoKey: 'PHENOTYPE_TRAITS', size: 'small' })
          ),
          h(FullRadar, { data: phenotype.traits || {}, color: config.color })
        ),
        
        // Thresholds с InfoButton
        phenotype.thresholds && h('div', { className: 'phenotype-expandable-card__thresholds' },
          h('div', { className: 'phenotype-expandable-card__section-header' },
            h('span', null, '🎯 Персональные пороги'),
            getInfoButton() && h(getInfoButton(), { infoKey: 'PHENOTYPE_THRESHOLDS', size: 'small' })
          ),
          h('div', { className: 'phenotype-expandable-card__threshold-grid' },
            phenotype.thresholds.optimalKcalRange && h('div', { className: 'phenotype-expandable-card__threshold' },
              h('span', { className: 'phenotype-expandable-card__threshold-icon' }, '🔥'),
              h('span', { className: 'phenotype-expandable-card__threshold-value' }, 
                `${phenotype.thresholds.optimalKcalRange[0]}–${phenotype.thresholds.optimalKcalRange[1]} ккал`
              )
            ),
            phenotype.thresholds.waveHours && h('div', { className: 'phenotype-expandable-card__threshold' },
              h('span', { className: 'phenotype-expandable-card__threshold-icon' }, '🌊'),
              h('span', { className: 'phenotype-expandable-card__threshold-value' }, `${phenotype.thresholds.waveHours}ч волна`)
            ),
            phenotype.thresholds.mealGap && h('div', { className: 'phenotype-expandable-card__threshold' },
              h('span', { className: 'phenotype-expandable-card__threshold-icon' }, '⏰'),
              h('span', { className: 'phenotype-expandable-card__threshold-value' }, `${phenotype.thresholds.mealGap}ч перерыв`)
            )
          )
        ),
        
        // Strengths & Weaknesses
        (phenotype.strengths?.length > 0 || phenotype.weaknesses?.length > 0) && 
          h('div', { className: 'phenotype-expandable-card__lists' },
            phenotype.strengths?.length > 0 && h('div', { className: 'phenotype-expandable-card__list' },
              h('div', { className: 'phenotype-expandable-card__list-title' }, '💪 Сильные стороны'),
              phenotype.strengths.slice(0, 3).map((s, i) =>
                h('div', { key: i, className: 'phenotype-expandable-card__list-item phenotype-expandable-card__list-item--good' }, 
                  h('span', null, '✓'),
                  typeof s === 'string' ? s : s.text || ''
                )
              )
            ),
            phenotype.weaknesses?.length > 0 && h('div', { className: 'phenotype-expandable-card__list' },
              h('div', { className: 'phenotype-expandable-card__list-title' }, '⚠️ Зоны роста'),
              phenotype.weaknesses.slice(0, 3).map((w, i) =>
                h('div', { key: i, className: 'phenotype-expandable-card__list-item phenotype-expandable-card__list-item--warn' }, 
                  h('span', null, '•'),
                  typeof w === 'string' ? w : w.text || ''
                )
              )
            )
          ),
        
        // Recommendations
        phenotype.recommendations?.length > 0 && h('div', { className: 'phenotype-expandable-card__recommendations' },
          h('div', { className: 'phenotype-expandable-card__section-title' }, '💡 Рекомендации'),
          phenotype.recommendations.slice(0, 3).map((rec, i) =>
            h('div', { key: i, className: 'phenotype-expandable-card__rec' },
              h('span', { className: 'phenotype-expandable-card__rec-num' }, i + 1),
              h('span', null, typeof rec === 'string' ? rec : rec.text || '')
            )
          )
        ),
        
        // Next tier
        phenotype.nextTier && phenotype.nextTier.daysNeeded > 0 && h('div', { className: 'phenotype-expandable-card__next-tier' },
          h('span', { className: 'phenotype-expandable-card__next-tier-text' },
            `🔓 Через ${phenotype.nextTier.daysNeeded} дней — ${TIER_CONFIG[phenotype.nextTier.tier]?.label || 'новый уровень'}`
          )
        )
      )
    );
  }

  // === Legacy exports для совместимости ===
  // (Старые компоненты больше не нужны, но оставляем для безопасности)
  function PhenotypeWidget({ profile }) {
    return h(PhenotypeExpandableCard, { profile });
  }

  // === Экспорт ===
  HEYS.Phenotype = {
    // Основной компонент
    PhenotypeExpandableCard,
    
    // Legacy (для совместимости)
    PhenotypeWidget,
    
    // Вспомогательные
    MiniRadar,
    FullRadar,
    usePhenotype,
    
    // Конфигурация
    CONFIG: PHENOTYPE_CONFIG,
    TIERS: TIER_CONFIG,
    TRAITS,
    
    // Версия
    VERSION: '1.1.0'
  };
  
  console.log('[HEYS] 🧬 Phenotype Module v1.1.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
