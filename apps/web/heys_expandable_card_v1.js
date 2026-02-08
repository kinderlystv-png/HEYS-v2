// heys_expandable_card_v1.js — Модульный expandable card компонент
// Версия: 1.0.0 | Дата: 2025-12-04
// Переиспользуемый конструктор для раскрывающихся карточек
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === Цвета и стили ===
  const COLORS = {
    primary: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    info: '#0ea5e9',
    muted: '#64748b',
    border: '#e5e7eb',
    bgLight: '#f8fafc',
    bgDark: '#1e293b'
  };
  
  // === Утилиты ===
  const utils = {
    // Генератор уникальных ID
    generateId: (prefix = 'card') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    
    // Форматирование времени
    formatDuration: (minutes) => {
      if (minutes < 60) return `${Math.round(minutes)} мин`;
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
    },
    
    // Haptic feedback
    haptic: (type = 'light') => {
      try {
        if (HEYS.dayUtils?.haptic) {
          HEYS.dayUtils.haptic(type);
        } else if (navigator.vibrate) {
          const patterns = { light: 10, medium: 20, success: [10, 50, 10], warning: [20, 30, 20] };
          navigator.vibrate(patterns[type] || 10);
        }
      } catch (e) {}
    }
  };
  
  // === Компонент Section — блок внутри expanded ===
  const Section = ({ title, icon, children, style, className = '' }) => {
    return React.createElement('div', {
      className: `expandable-section ${className}`,
      style: {
        marginTop: '8px',
        padding: '8px',
        background: 'rgba(255,255,255,0.5)',
        borderRadius: '8px',
        ...style
      }
    },
      title && React.createElement('div', {
        style: {
          fontWeight: '600',
          fontSize: '12px',
          color: COLORS.primary,
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }
      }, icon && React.createElement('span', null, icon), title),
      children
    );
  };
  
  // === Компонент InfoRow — строка с label: value ===
  const InfoRow = ({ label, value, icon, color, bold = false }) => {
    return React.createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '2px 0',
        fontSize: '12px',
        color: COLORS.muted
      }
    },
      React.createElement('span', null, 
        icon && React.createElement('span', { style: { marginRight: '4px' } }, icon),
        label
      ),
      React.createElement('span', {
        style: {
          fontWeight: bold ? '600' : '500',
          color: color || 'inherit'
        }
      }, value)
    );
  };
  
  // === Компонент Badge — маленький лейбл ===
  const Badge = ({ text, color = COLORS.primary, bg, size = 'sm' }) => {
    const bgColor = bg || (color + '20');
    const fontSize = size === 'sm' ? '10px' : size === 'md' ? '12px' : '14px';
    const padding = size === 'sm' ? '2px 6px' : size === 'md' ? '4px 8px' : '6px 12px';
    
    return React.createElement('span', {
      style: {
        background: bgColor,
        color: color,
        padding,
        borderRadius: '4px',
        fontSize,
        fontWeight: '600',
        whiteSpace: 'nowrap'
      }
    }, text);
  };
  
  // === Компонент ProgressBar ===
  const ProgressBar = ({ 
    progress, 
    color = COLORS.primary, 
    bgColor = '#e5e7eb',
    height = 8,
    showLabel = false,
    labelPosition = 'inside', // 'inside' | 'right' | 'above'
    animated = true,
    gradient = null // { from, to }
  }) => {
    const pct = Math.min(100, Math.max(0, progress));
    const fillColor = gradient 
      ? `linear-gradient(90deg, ${gradient.from}, ${gradient.to})`
      : color;
    
    return React.createElement('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: `${height}px`,
        background: bgColor,
        borderRadius: `${height / 2}px`,
        overflow: 'hidden'
      }
    },
      // Fill
      React.createElement('div', {
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${pct}%`,
          background: fillColor,
          borderRadius: `${height / 2}px`,
          transition: animated ? 'width 0.5s ease-out' : 'none'
        }
      }),
      // Label inside
      showLabel && labelPosition === 'inside' && pct > 15 && React.createElement('div', {
        style: {
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: height > 12 ? '10px' : '8px',
          fontWeight: '700',
          color: pct > 50 ? '#fff' : COLORS.muted,
          textShadow: pct > 50 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none'
        }
      }, `${Math.round(pct)}%`)
    );
  };
  
  // === Компонент Alert — предупреждение/инфо ===
  const Alert = ({ type = 'info', title, children, icon }) => {
    const colors = {
      info: { bg: 'rgba(59,130,246,0.1)', border: '#93c5fd', text: '#3b82f6' },
      success: { bg: 'rgba(34,197,94,0.1)', border: '#86efac', text: '#22c55e' },
      warning: { bg: 'rgba(234,179,8,0.15)', border: '#fcd34d', text: '#d97706' },
      error: { bg: 'rgba(239,68,68,0.15)', border: '#fca5a5', text: '#dc2626' }
    };
    const c = colors[type] || colors.info;
    const defaultIcons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '🚨' };
    
    return React.createElement('div', {
      style: {
        marginTop: '8px',
        padding: '8px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '8px',
        fontSize: '12px'
      }
    },
      title && React.createElement('div', {
        style: { fontWeight: '600', color: c.text, marginBottom: children ? '4px' : 0 }
      }, icon || defaultIcons[type], ' ', title),
      children && React.createElement('div', {
        style: { color: COLORS.muted }
      }, children)
    );
  };
  
  // === Компонент StatusBadge — статус с цветом и пульсацией ===
  const StatusBadge = ({ status, text, color, pulse = false }) => {
    return React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }
    },
      React.createElement('span', {
        style: {
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: color,
          animation: pulse ? 'pulse 1.5s ease-in-out infinite' : 'none'
        }
      }),
      React.createElement('span', {
        style: { fontWeight: '600', color }
      }, text)
    );
  };
  
  // === Главный компонент ExpandableCard ===
  const ExpandableCard = ({ 
    // Основные props
    id,
    expanded = false,
    onToggle,
    disabled = false,
    
    // Header
    icon,
    title,
    subtitle,
    status, // { text, color, pulse }
    badge, // { text, color }
    rightContent, // custom content на месте таймера
    
    // Progress
    progress, // 0-100
    progressColor,
    progressGradient,
    
    // Meta info под progress
    leftMeta,
    centerMeta,
    rightMeta,
    
    // Hint/suggestion
    hint,
    
    // Expanded content
    children, // expanded content
    expandedSections = [], // массив { title, icon, content }
    
    // Style
    className = '',
    style = {},
    variant = 'default', // 'default' | 'compact' | 'prominent'
    shake = false
  }) => {
    const handleClick = (e) => {
      if (disabled) return;
      utils.haptic('light');
      if (onToggle) onToggle(!expanded);
    };
    
    const handleExpandedClick = (e) => {
      e.stopPropagation();
    };
    
    const cardClass = [
      'expandable-card',
      `expandable-card--${variant}`,
      expanded && 'expandable-card--expanded',
      disabled && 'expandable-card--disabled',
      shake && 'shake',
      className
    ].filter(Boolean).join(' ');
    
    return React.createElement('div', {
      className: cardClass,
      style: {
        margin: '8px 0',
        padding: '12px',
        background: 'var(--card, #fff)',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.2s ease',
        ...style
      },
      onClick: handleClick
    },
      // Header row
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: (progress !== undefined || leftMeta || hint) ? '8px' : 0
        }
      },
        // Left: icon + title
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }
        },
          icon && React.createElement('span', { style: { fontSize: '18px' } }, icon),
          React.createElement('div', null,
            React.createElement('div', {
              style: { fontWeight: '600', fontSize: '14px', color: 'var(--text, #1e293b)' }
            }, 
              title,
              // Expand indicator
              !disabled && React.createElement('span', {
                style: { fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }
              }, expanded ? '▲' : '▼')
            ),
            subtitle && React.createElement('div', {
              style: { fontSize: '11px', color: COLORS.muted }
            }, subtitle)
          )
        ),
        
        // Right: badge, status or custom
        rightContent || (
          status ? React.createElement('div', {
            style: { color: status.color, fontWeight: '600', fontSize: '16px' }
          }, 
            status.pulse 
              ? React.createElement('span', { className: 'ready-pulse' }, '●')
              : status.text
          ) : badge ? Badge({ text: badge.text, color: badge.color }) : null
        )
      ),
      
      // Progress bar
      progress !== undefined && ProgressBar({
        progress,
        color: progressColor,
        gradient: progressGradient,
        height: 10,
        showLabel: true,
        animated: true
      }),
      
      // Meta row
      (leftMeta || centerMeta || rightMeta) && React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
          fontSize: '11px',
          color: COLORS.muted
        }
      },
        React.createElement('span', null, leftMeta),
        centerMeta && Badge({ text: centerMeta.text, color: centerMeta.color }),
        React.createElement('span', null, rightMeta)
      ),
      
      // Hint
      hint && React.createElement('div', {
        style: {
          marginTop: '6px',
          fontSize: '12px',
          color: COLORS.muted,
          background: 'rgba(0,0,0,0.03)',
          padding: '6px 10px',
          borderRadius: '6px'
        }
      }, hint),
      
      // Expanded content
      expanded && React.createElement('div', {
        className: 'expandable-card__content',
        style: {
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: `1px solid ${COLORS.border}`,
          animation: 'slideDown 0.2s ease-out'
        },
        onClick: handleExpandedClick
      },
        // Sections from array
        expandedSections.map((section, i) => 
          Section({
            key: section.id || i,
            title: section.title,
            icon: section.icon,
            style: section.style,
            children: section.content
          })
        ),
        // Custom children
        children
      )
    );
  };
  
  // === Hook useExpandable — для управления состоянием ===
  const useExpandable = (initialState = false) => {
    const [expanded, setExpanded] = React.useState(initialState);
    const toggle = React.useCallback(() => setExpanded(prev => !prev), []);
    const open = React.useCallback(() => setExpanded(true), []);
    const close = React.useCallback(() => setExpanded(false), []);
    
    return { expanded, setExpanded, toggle, open, close };
  };
  
  // === Экспорт ===
  HEYS.ExpandableCard = {
    // Главный компонент
    Card: ExpandableCard,
    
    // Sub-компоненты для использования внутри expanded
    Section,
    InfoRow,
    Badge,
    ProgressBar,
    Alert,
    StatusBadge,
    
    // Hook
    useExpandable,
    
    // Утилиты
    utils,
    
    // Цвета
    COLORS,
    
    // Версия
    VERSION: '1.0.0'
  };
  
  // Для совместимости — алиас
  HEYS.EC = HEYS.ExpandableCard;
  
  // Verbose init log removed
  
})(typeof window !== 'undefined' ? window : global);
