// heys_day_advice_card.js — AdviceCard component for DayTab
// Extracted from heys_day_v12.js (Phase 2.2)
// Contains: AdviceCard component with swipe, undo, schedule functionality

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  const AdviceCard = React.memo(function AdviceCard({
    advice,
    globalIndex,
    isDismissed,
    isHidden,
    swipeState,
    isExpanded,
    isLastDismissed,
    lastDismissedAction,
    onUndo,
    onClearLastDismissed,
    onSchedule,
    onToggleExpand,
    trackClick,
    onRate,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
    onLongPressStart,
    onLongPressEnd,
    registerCardRef
  }) {
    const [scheduledConfirm, setScheduledConfirm] = React.useState(false);
    const [ratedState, setRatedState] = React.useState(null); // 'positive' | 'negative' | null
    
    const swipeX = swipeState?.x || 0;
    const swipeDirection = swipeState?.direction;
    const swipeProgress = Math.min(1, Math.abs(swipeX) / 100);
    const showUndo = isLastDismissed && (isDismissed || isHidden);
    
    // Обработчик "Напомнить через 2ч"
    const handleSchedule = React.useCallback((e) => {
      e.stopPropagation();
      if (onSchedule) {
        onSchedule(advice, 120); // Передаём полный объект advice
        setScheduledConfirm(true);
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);
        // Очистить undo overlay через 1.5 сек (совет остаётся dismissed)
        setTimeout(() => {
          onClearLastDismissed && onClearLastDismissed();
        }, 1500);
      }
    }, [advice, onSchedule, onClearLastDismissed]);
    
    if ((isDismissed || isHidden) && !showUndo) return null;
    
    return React.createElement('div', { 
      className: `advice-list-item-wrapper`,
      style: { 
        animationDelay: `${globalIndex * 50}ms`,
        '--stagger-delay': `${globalIndex * 50}ms`,
        position: 'relative',
        overflow: 'hidden'
      }
    },
      // Undo overlay (показывается после свайпа) — сохраняет фон по типу совета
      showUndo && React.createElement('div', {
        className: `advice-undo-overlay advice-list-item-${advice.type}`,
        onClick: onUndo,
        style: {
          position: 'absolute',
          inset: 0,
          background: 'var(--advice-bg, #ecfdf5)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'var(--color-slate-700, #334155)',
          fontWeight: 600,
          fontSize: '14px',
          cursor: 'pointer',
          zIndex: 10
        }
      },
        // Показываем подтверждение или обычные кнопки
        scheduledConfirm 
          ? React.createElement('span', { 
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                color: '#3b82f6',
                animation: 'fadeIn 0.3s ease'
              } 
            }, '⏰ Напомню через 2 часа ✓')
          : React.createElement(React.Fragment, null,
              React.createElement('span', { 
                style: { color: lastDismissedAction === 'hidden' ? '#f97316' : '#22c55e' } 
              }, lastDismissedAction === 'hidden' ? '🔕 Скрыто' : '✓ Прочитано'),
              React.createElement('div', {
                style: { display: 'flex', gap: '8px' }
              },
                React.createElement('span', { 
                  onClick: (e) => { e.stopPropagation(); onUndo(); },
                  style: { 
                    background: 'rgba(0,0,0,0.08)', 
                    padding: '4px 10px', 
                    borderRadius: '12px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  } 
                }, 'Отменить'),
                onSchedule && React.createElement('span', { 
                  onClick: handleSchedule,
                  style: { 
                    background: 'rgba(0,0,0,0.06)', 
                    padding: '4px 10px', 
                    borderRadius: '12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  } 
                }, 'Напомнить через 2ч.')
              )
            ),
        // Прогресс-бар (убывает за 3 сек)
        !scheduledConfirm && React.createElement('div', {
          style: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '3px',
            background: 'rgba(0,0,0,0.15)',
            width: '100%',
            animation: 'undoProgress 3s linear forwards'
          }
        })
      ),
      // Фон слева "Прочитано" (зелёный) — только если нет undo
      !showUndo && React.createElement('div', { 
        className: 'advice-list-item-bg advice-list-item-bg-left',
        style: { opacity: swipeDirection === 'left' ? swipeProgress : 0 }
      },
        React.createElement('span', null, '✓ Прочитано')
      ),
      // Фон справа "Скрыть" (оранжевый) — только если нет undo
      !showUndo && React.createElement('div', { 
        className: 'advice-list-item-bg advice-list-item-bg-right',
        style: { opacity: swipeDirection === 'right' ? swipeProgress : 0 }
      },
        React.createElement('span', null, '🔕 До завтра')
      ),
      // Сам совет (скрыт под undo overlay)
      React.createElement('div', { 
        ref: (el) => registerCardRef(advice.id, el),
        className: `advice-list-item advice-list-item-${advice.type}${isExpanded ? ' expanded' : ''}`,
        style: { 
          transform: showUndo ? 'none' : `translateX(${swipeX}px)`,
          opacity: showUndo ? 0.1 : (1 - swipeProgress * 0.3),
          pointerEvents: showUndo ? 'none' : 'auto'
        },
        onClick: (e) => {
          // Раскрытие по тапу (если не свайп)
          if (showUndo || Math.abs(swipeX) > 10) return;
          e.stopPropagation();
          // Трекаем клик при раскрытии
          if (!isExpanded && trackClick) {
            trackClick(advice.id);
          }
          onToggleExpand && onToggleExpand(advice.id);
        },
        onTouchStart: (e) => {
          if (showUndo) return;
          onSwipeStart(advice.id, e);
          onLongPressStart(advice.id);
        },
        onTouchMove: (e) => {
          if (showUndo) return;
          onSwipeMove(advice.id, e);
          onLongPressEnd();
        },
        onTouchEnd: () => {
          if (showUndo) return;
          onSwipeEnd(advice.id);
          onLongPressEnd();
        }
      },
        React.createElement('span', { className: 'advice-list-icon' }, advice.icon),
        React.createElement('div', { className: 'advice-list-content' },
          React.createElement('span', { className: 'advice-list-text' }, advice.text),
          // Стрелочка если есть детали
          advice.details && React.createElement('span', { 
            className: 'advice-expand-arrow',
            style: {
              marginLeft: '6px',
              fontSize: '10px',
              opacity: 0.5,
              transition: 'transform 0.2s',
              display: 'inline-block',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
            }
          }, '▼'),
          // Детали при раскрытии
          isExpanded && advice.details && React.createElement('div', { 
            className: 'advice-list-details'
          }, advice.details),
          // Рейтинг удалён — оценки считаются в бэкенде автоматически
        )
      )
    );
  });
  
  // Export to HEYS namespace
  HEYS.dayComponents = HEYS.dayComponents || {};
  HEYS.dayComponents.AdviceCard = AdviceCard;
  
})(window);
