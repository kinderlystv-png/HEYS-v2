// pi_ui_rings.js — Ring UI Components v3.0.1
// Extracted from heys_predictive_insights_v1.js (Phase 7)
// Кольцевые компоненты для визуализации прогресса и состояния
// v3.0.1: Lazy getter для InfoButton (fix load order issues)
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  
  // React imports
  const { createElement: h, useState, useEffect } = window.React || {};
  
  // Зависимости (reserved for future use)
  const _SCIENCE_INFO = HEYS.InsightsPI?.science || window.piScience || {}; // eslint-disable-line no-unused-vars
  
  // === LAZY GETTER для InfoButton (fix load order) ===
  // InfoButton определён в pi_ui_dashboard.js который загружается ПОСЛЕ этого модуля
  const getInfoButton = () => {
    return HEYS.InsightsPI?.uiDashboard?.InfoButton ||
           HEYS.PredictiveInsights?.components?.InfoButton ||
           HEYS.day?.InfoButton || 
           HEYS.InfoButton || 
           window.InfoButton || 
           // Fallback: простая кнопка если InfoButton не загружен
           function InfoButtonFallback({ infoKey, size: _size }) { // eslint-disable-line no-unused-vars
             return h('span', { 
               className: 'info-button-placeholder',
               title: infoKey,
               style: { cursor: 'help', opacity: 0.5 }
             }, 'ℹ️');
           };
  };
  
  /**
   * HealthRing — кольцо здоровья для категории
   * Кольцевой индикатор прогресса с поддержкой InfoButton и emotional warnings
   */
  function HealthRing({ score, category, label, color, size = 80, onClick, infoKey, debugData, emotionalWarning }) {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, score || 0));
    const offset = circumference - (progress / 100) * circumference;
    
    const [showTooltip, setShowTooltip] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    
    // 🆕 v3.22.0: emotionalWarning влияет на цвет и отображение
    const hasEmotionalRisk = emotionalWarning?.hasRisk;
    const effectiveColor = hasEmotionalRisk ? '#f87171' : color;
    
    const handleClick = () => {
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(10);
      setShowTooltip(!showTooltip);
      if (onClick) onClick(category);
    };
    
    return h('div', {
      className: `insights-ring insights-ring--${category} ${showTooltip ? 'insights-ring--active' : ''} ${isPressed ? 'insights-ring--pressed' : ''} ${hasEmotionalRisk ? 'insights-ring--emotional-warning' : ''}`,
      onClick: handleClick,
      onTouchStart: () => setIsPressed(true),
      onTouchEnd: () => setIsPressed(false),
      onMouseDown: () => setIsPressed(true),
      onMouseUp: () => setIsPressed(false)
    },
      h('svg', {
        className: 'insights-ring__svg',
        width: size,
        height: size
      },
        h('circle', {
          className: 'insights-ring__track',
          cx: size / 2,
          cy: size / 2,
          r: radius
        }),
        h('circle', {
          className: 'insights-ring__fill',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          style: {
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            stroke: effectiveColor
          }
        })
      ),
      h('div', { className: 'insights-ring__center' },
        h('span', { className: 'insights-ring__score' }, score || '—'),
        h('span', { className: 'insights-ring__label' },
          label,
          infoKey && h(getInfoButton(), { infoKey, debugData, size: 'small' })
        ),
        // 🆕 v3.22.0: Emotional risk badge в кольце
        hasEmotionalRisk && h('div', { className: 'insights-ring__emotional' },
          h('span', { 
            className: 'insights-ring__emotional-badge',
            title: `Эмоц. риск: ${emotionalWarning.bingeRisk}%\nФакторы: ${emotionalWarning.factors.join(', ')}`
          }, '🧠'),
          h('span', { className: 'insights-ring__emotional-pct' }, `${emotionalWarning.bingeRisk}%`),
          // PMID link
          emotionalWarning.level !== 'low' && h('a', {
            href: 'https://pubmed.ncbi.nlm.nih.gov/11070333/',
            target: '_blank',
            className: 'insights-ring__pmid',
            title: 'Epel 2001 — кортизол и пищевое поведение',
            onClick: (e) => e.stopPropagation()
          }, '🔬')
        )
      ),
      showTooltip && h('div', { className: 'insights-ring__tooltip' },
        hasEmotionalRisk 
          ? `${label}: ${score}/100\n🧠 Эмоц. риск: ${emotionalWarning.bingeRisk}%`
          : `${label}: ${score}/100`
      )
    );
  }

  /**
   * Total Health Score — большое центральное кольцо (v2.0: с InfoButton)
   */
  function TotalHealthRing({ score, label = 'Health Score', size = 120, strokeWidth = 20, debugData }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, score || 0));
    const offset = circumference - (progress / 100) * circumference;
    
    return h('div', { className: 'insights-total' },
      h('div', { className: 'insights-total__ring' },
        h('svg', {
          className: 'insights-total__svg',
          width: size,
          height: size
        },
          h('defs', null,
            h('linearGradient', { id: 'totalGradient', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
              h('stop', { offset: '0%', stopColor: '#10b981' }),
              h('stop', { offset: '100%', stopColor: '#3b82f6' })
            )
          ),
          h('circle', {
            className: 'insights-total__track',
            cx: size / 2,
            cy: size / 2,
            r: radius,
            strokeWidth: strokeWidth
          }),
          h('circle', {
            className: 'insights-total__fill',
            cx: size / 2,
            cy: size / 2,
            r: radius,
            strokeWidth: strokeWidth,
            style: {
              strokeDasharray: circumference,
              strokeDashoffset: offset
            }
          })
        ),
        h('div', { className: 'insights-total__center' },
          h('span', { className: 'insights-total__score' }, score || '—'),
          h('span', { className: 'insights-total__label' },
            label,
            h(getInfoButton(), { infoKey: 'HEALTH_SCORE', debugData })
          )
        )
      )
    );
  }

  /**
   * Health Rings Grid — 4 кольца в ряд
   */
  /**
   * CollapsibleSection — сворачиваемая секция (v2.1: с InfoButton)
   */
  function StatusProgressRing({ score, size = 120, strokeWidth = 10 }) {
    const [displayScore, setDisplayScore] = useState(0);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (displayScore / 100) * circumference;
    const offset = circumference - progress;
    
    // Count-up анимация при изменении score
    useEffect(() => {
      const duration = 1500; // ms
      const start = displayScore;
      const diff = score - start;
      const startTime = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        const current = Math.round(start + diff * eased);
        setDisplayScore(current);
        
        if (t < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    }, [score]);
    
    // Градиентный цвет по score (0-100)
    const getGradientColor = (s) => {
      if (s >= 85) return { start: '#10b981', end: '#22c55e' }; // emerald → green
      if (s >= 70) return { start: '#22c55e', end: '#84cc16' }; // green → lime
      if (s >= 50) return { start: '#eab308', end: '#f59e0b' }; // yellow → amber
      if (s >= 30) return { start: '#f59e0b', end: '#ef4444' }; // amber → red
      return { start: '#ef4444', end: '#dc2626' }; // red shades
    };
    
    const colors = getGradientColor(displayScore);
    const gradientId = 'statusGradient' + Math.random().toString(36).substr(2, 9);
    
    return h('svg', {
      width: size,
      height: size,
      className: 'status-progress-ring',
      viewBox: `0 0 ${size} ${size}`
    },
      // Gradient definition
      h('defs', null,
        h('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: colors.start }),
          h('stop', { offset: '100%', stopColor: colors.end })
        )
      ),
      // Background circle
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: 'var(--border-color, #e2e8f0)',
        strokeWidth: strokeWidth
      }),
      // Progress circle
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: `url(#${gradientId})`,
        strokeWidth: strokeWidth,
        strokeLinecap: 'round',
        strokeDasharray: circumference,
        strokeDashoffset: offset,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        style: { transition: 'stroke-dashoffset 0.1s ease' }
      }),
      // Score text
      h('text', {
        x: size / 2,
        y: size / 2,
        textAnchor: 'middle',
        dominantBaseline: 'middle',
        className: 'status-progress-ring__score',
        style: { 
          fontSize: size * 0.28,
          fontWeight: 700,
          fill: 'var(--text-primary, #0f172a)'
        }
      }, displayScore),
      // Label
      h('text', {
        x: size / 2,
        y: size / 2 + size * 0.18,
        textAnchor: 'middle',
        className: 'status-progress-ring__label',
        style: {
          fontSize: size * 0.1,
          fill: 'var(--text-secondary, #64748b)'
        }
      }, 'из 100')
    );
  }
  
  /**
   * StatusTrendBadge — тренд ↑/↓ относительно вчера
   */
  function MiniRiskMeter({ risk, riskLevel, size = 120 }) {
    const safeRisk = typeof risk === 'number' && !isNaN(risk) ? Math.min(100, Math.max(0, risk)) : 0;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const halfCircumference = Math.PI * radius;
    const progress = (safeRisk / 100) * halfCircumference;
    const offset = halfCircumference - progress;
    
    const colors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'mini-risk-meter', style: { width: size, height: size / 2 + 25 } },
      h('svg', {
        viewBox: `0 0 ${size} ${size / 2 + 15}`,
        className: 'mini-risk-meter__svg'
      },
        // Background arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: 'var(--border-color, #e2e8f0)',
          strokeWidth: strokeWidth,
          strokeLinecap: 'round'
        }),
        // Progress arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: colors[riskLevel] || colors.medium,
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeDasharray: halfCircumference,
          strokeDashoffset: offset,
          style: { transition: 'stroke-dashoffset 0.6s ease' }
        }),
        // Value text
        h('text', {
          x: size / 2,
          y: size / 2 - 2,
          textAnchor: 'middle',
          style: { 
            fontSize: 28,
            fontWeight: 700,
            fill: colors[riskLevel] || 'var(--text-primary)'
          }
        }, `${safeRisk}%`),
        // Label
        h('text', {
          x: size / 2,
          y: size / 2 + 14,
          textAnchor: 'middle',
          style: { fontSize: 10, fill: 'var(--text-secondary, #64748b)' }
        }, 'Риск срыва')
      )
    );
  }
  
  /**
   * MetabolicStateRing — кольцо метаболической фазы
   */
  function MetabolicStateRing({ phase, size = 120, strokeWidth = 10, showLabel = true }) {
    if (!phase || !phase.phase) {
      return h('div', { className: 'metabolic-ring metabolic-ring--empty' },
        h('div', { className: 'metabolic-ring__placeholder' }, '❓')
      );
    }
    
    const phaseColors = {
      anabolic: { primary: '#3b82f6', secondary: '#93c5fd', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
      transitional: { primary: '#f59e0b', secondary: '#fcd34d', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
      catabolic: { primary: '#22c55e', secondary: '#86efac', gradient: 'linear-gradient(135deg, #22c55e, #4ade80)' },
      unknown: { primary: '#6b7280', secondary: '#d1d5db', gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)' }
    };
    
    const colors = phaseColors[phase.phase] || phaseColors.unknown;
    
    // Прогресс внутри фазы (для анимации)
    let progress = 0;
    if (phase.phase === 'anabolic') {
      progress = Math.min(100, (phase.hoursInPhase / 3) * 100);
    } else if (phase.phase === 'transitional') {
      progress = Math.min(100, ((phase.hoursInPhase - 3) / 2) * 100);
    } else if (phase.phase === 'catabolic') {
      progress = Math.min(100, ((phase.hoursInPhase - 5) / 3) * 100);
    }
    
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
    
    return h('div', { className: `metabolic-ring metabolic-ring--${phase.phase}`, style: { width: size, height: size } },
      h('svg', { 
        className: 'metabolic-ring__svg',
        viewBox: `0 0 ${size} ${size}`,
        style: { transform: 'rotate(-90deg)' }
      },
        // Background circle
        h('circle', {
          className: 'metabolic-ring__bg',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          stroke: colors.secondary,
          strokeWidth: strokeWidth,
          fill: 'transparent',
          opacity: 0.3
        }),
        // Progress circle
        h('circle', {
          className: 'metabolic-ring__progress',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          stroke: colors.primary,
          strokeWidth: strokeWidth,
          fill: 'transparent',
          strokeLinecap: 'round',
          strokeDasharray: circumference,
          strokeDashoffset: strokeDashoffset,
          style: { transition: 'stroke-dashoffset 0.5s ease-in-out' }
        })
      ),
      // Center content
      h('div', { className: 'metabolic-ring__center' },
        h('div', { className: 'metabolic-ring__emoji' }, phase.emoji),
        showLabel && h('div', { className: 'metabolic-ring__label' }, phase.label),
        phase.timeToLipolysis > 0 && h('div', { className: 'metabolic-ring__time' },
          `${Math.round(phase.timeToLipolysis * 60)} мин`
        ),
        phase.isLipolysis && h('div', { className: 'metabolic-ring__lipolysis' }, '🔥 Жиросжигание!')
      )
    );
  }
  
  // === TRAFFIC LIGHT — светофор для рисков ===
  
  /**
   * RiskTrafficLight — светофор риска срыва
   * Low = зелёный, Medium = жёлтый, High = красный
   */
  function RiskTrafficLight({ riskLevel, riskValue, _factors, description, compact = false }) {
    const lights = [
      { level: 'low', color: '#22c55e', label: 'Низкий', emoji: '✅' },
      { level: 'medium', color: '#eab308', label: 'Средний', emoji: '⚠️' },
      { level: 'high', color: '#ef4444', label: 'Высокий', emoji: '🚨' }
    ];
    
    const currentLevel = riskLevel || 'low';
    const currentLight = lights.find(l => l.level === currentLevel) || lights[0];
    
    if (compact) {
      return h('div', { className: `risk-traffic-light risk-traffic-light--compact risk-traffic-light--${currentLevel}` },
        h('div', { className: 'risk-traffic-light__indicator', style: { backgroundColor: currentLight.color } },
          currentLight.emoji
        ),
        h('span', { className: 'risk-traffic-light__label' }, currentLight.label),
        riskValue !== undefined && h('span', { className: 'risk-traffic-light__value' }, `${riskValue}%`)
      );
    }
    
    // Полная версия (не compact)
    return h('div', { className: `risk-traffic-light risk-traffic-light--${currentLevel}` },
      h('div', { className: 'risk-traffic-light__header' },
        h('div', { className: 'risk-traffic-light__indicator', style: { backgroundColor: currentLight.color } },
          currentLight.emoji
        ),
        h('span', { className: 'risk-traffic-light__label' }, currentLight.label)
      ),
      riskValue !== undefined && h('div', { className: 'risk-traffic-light__value' }, `${riskValue}%`),
      description && h('div', { className: 'risk-traffic-light__description' }, description)
    );
  }


  // === ЭКСПОРТ ===
  HEYS.InsightsPI.uiRings = {
    HealthRing,
    TotalHealthRing,
    StatusProgressRing,
    MiniRiskMeter,
    MetabolicStateRing,
    RiskTrafficLight
  };
  
  // Fallback для прямого доступа
  global.piUIRings = HEYS.InsightsPI.uiRings;
  
  // v3.0.1: 6 ring components (added RiskTrafficLight)
  
})(typeof window !== 'undefined' ? window : global);
