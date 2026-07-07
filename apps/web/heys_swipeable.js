// heys_swipeable.js — Swipeable компонент для удаления свайпом влево
// Используется для карточек продуктов на мобильных устройствах

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  function safeVibrate(pattern) {
    if (!navigator.vibrate) return;
    const activation = navigator.userActivation;
    if (activation && !activation.isActive && !activation.hasBeenActive) return;
    try { navigator.vibrate(pattern); } catch (_) { /* ignore haptic errors */ }
  }

  function isInteractiveSwipeTarget(target) {
    const element = target && target.nodeType === 1
      ? target
      : target?.parentElement;

    if (!element || typeof element.closest !== 'function') return false;

    return !!element.closest(
      'button, input, textarea, select, option, label, a, summary, [role="button"], [data-swipe-ignore="true"]'
    );
  }

  /**
   * SwipeableRow — обёртка для элементов с поддержкой swipe-to-delete
   * @param {Object} props
   * @param {Function} props.onDelete - Callback при удалении (красная кнопка)
   * @param {Array<{key:string,label:string,color?:string,onAction:Function}>} [props.actions]
   *   Доп. кнопки слева от Удалить. Если переданы — auto-delete по полному свайпу
   *   ОТКЛЮЧАЕТСЯ (защита от случайного удаления через 3 кнопки).
   * @param {ReactNode} props.children - Содержимое строки
   * @param {string} [props.className] - Дополнительные классы
   */
  function SwipeableRow({ onDelete, actions, children, className = '' }) {
    const rowRef = React.useRef(null);
    const [translateX, setTranslateX] = React.useState(0);
    const [isDeleting, setIsDeleting] = React.useState(false);

    const actionsRef = React.useRef(actions);
    actionsRef.current = actions;
    const onDeleteRef = React.useRef(onDelete);
    onDeleteRef.current = onDelete;

    const touchState = React.useRef({
      startX: 0,
      startY: 0,
      currentX: 0,
      isTracking: false,
      isVerticalScroll: null
    });

    const hasActions = Array.isArray(actions) && actions.length > 0;
    const ACTION_BTN_WIDTH = 88;
    const DELETE_BTN_WIDTH = 100;
    const REVEAL_WIDTH = (hasActions ? actions.length * ACTION_BTN_WIDTH : 0) + DELETE_BTN_WIDTH;
    const REVEAL_THRESHOLD = hasActions ? 60 : 100;
    const DELETE_FULL_THRESHOLD = 180;
    const revealProgress = isDeleting
      ? 1
      : Math.max(0, Math.min(1, Math.abs(translateX) / 36));

    React.useEffect(() => {
      const el = rowRef.current;
      if (!el) return;

      const handleTouchStart = (e) => {
        if (isDeleting) return;
        if (isInteractiveSwipeTarget(e.target)) return;
        const touch = e.touches[0];
        touchState.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          currentX: touch.clientX,
          isTracking: true,
          isVerticalScroll: null
        };
      };

      const handleTouchMove = (e) => {
        if (!touchState.current.isTracking || isDeleting) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - touchState.current.startX;
        const deltaY = touch.clientY - touchState.current.startY;

        // 🎯 R-SWIPE-SENSITIVITY (2026-05-14): на чувствительных экранах (iPhone)
        // при вертикальной прокрутке мелкое горизонтальное дрожание пальца раньше
        // триггерило свайп-меню. Чиним двумя загрузками:
        //   1. Поднимаем gate-порог распознавания жеста с 15px до 18px (меньше
        //      шанс распознать микродвижение как намеренный жест).
        //   2. Горизонтальный режим включается ТОЛЬКО если |dx| > 1.6 × |dy|
        //      (угол < ~32° от горизонтали). Любое менее очевидное движение —
        //      классифицируется как вертикальный скролл и swipe-меню не блокирует
        //      прокрутку. Раньше было |dy| > |dx| (диагональ 45° могла уйти не туда).
        if (touchState.current.isVerticalScroll === null && (Math.abs(deltaX) > 18 || Math.abs(deltaY) > 18)) {
          touchState.current.isVerticalScroll = !(Math.abs(deltaX) > 1.6 * Math.abs(deltaY));
        }

        if (touchState.current.isVerticalScroll) return;

        e.preventDefault();

        touchState.current.currentX = touch.clientX;

        let newX = deltaX;
        if (newX > 0) newX = 0;
        if (hasActions) {
          if (newX < -REVEAL_WIDTH) newX = -REVEAL_WIDTH;
        } else {
          if (newX < -DELETE_FULL_THRESHOLD * 1.2) {
            newX = -DELETE_FULL_THRESHOLD * 1.2;
          }
        }

        setTranslateX(newX);
      };

      const handleTouchEnd = () => {
        if (!touchState.current.isTracking || isDeleting) return;
        touchState.current.isTracking = false;

        const finalX = translateX;

        if (!hasActions && finalX < -DELETE_FULL_THRESHOLD) {
          setIsDeleting(true);
          setTranslateX(-window.innerWidth);
          safeVibrate(20);
          setTimeout(() => {
            onDeleteRef.current && onDeleteRef.current();
          }, 200);
        } else if (finalX < -REVEAL_THRESHOLD) {
          setTranslateX(-REVEAL_WIDTH);
        } else {
          setTranslateX(0);
        }
      };

      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd, { passive: true });

      return () => {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
      };
    }, [translateX, isDeleting, hasActions, REVEAL_WIDTH, REVEAL_THRESHOLD]);

    const handleDeleteClick = () => {
      setIsDeleting(true);
      setTranslateX(-window.innerWidth);
      safeVibrate(20);
      setTimeout(() => {
        onDeleteRef.current && onDeleteRef.current();
      }, 200);
    };

    const handleActionClick = (action) => {
      safeVibrate(10);
      setTranslateX(0);
      setTimeout(() => {
        try { action.onAction && action.onAction(); } catch (e) { /* swallow */ }
      }, 50);
    };

    const handleContentClick = () => {
      if (translateX < 0) {
        setTranslateX(0);
      }
    };

    const isOpen = translateX <= -REVEAL_THRESHOLD;

    const renderActionButtons = () => {
      if (!hasActions) return null;
      return actions.map((action) => (
        React.createElement('button', {
          key: action.key,
          className: 'swipeable-action-btn swipeable-action-btn--' + (action.color || 'default'),
          tabIndex: isOpen ? 0 : -1,
          'aria-hidden': isOpen ? 'false' : 'true',
          onClick: () => handleActionClick(action),
          style: { width: ACTION_BTN_WIDTH + 'px' },
        }, action.label)
      ));
    };

    return React.createElement('div', {
      className: 'swipeable-container ' + className,
      ref: rowRef
    },
      React.createElement('div', {
        className: 'swipeable-background' + (hasActions ? ' swipeable-background--multi' : ''),
        style: {
          width: hasActions ? REVEAL_WIDTH + 'px' : undefined,
          opacity: revealProgress,
          transform: `translateX(${(1 - revealProgress) * 12}px)`,
          transition: touchState.current.isTracking
            ? 'opacity 0.05s linear, transform 0.05s linear'
            : 'opacity 0.18s ease, transform 0.18s ease'
        }
      },
        renderActionButtons(),
        React.createElement('button', {
          className: 'swipeable-delete-btn',
          tabIndex: isOpen ? 0 : -1,
          'aria-hidden': isOpen ? 'false' : 'true',
          onClick: handleDeleteClick,
          style: hasActions ? { width: DELETE_BTN_WIDTH + 'px' } : undefined,
        }, 'Удалить')
      ),
      React.createElement('div', {
        className: 'swipeable-content' + (isDeleting ? ' deleting' : ''),
        style: {
          transform: `translateX(${translateX}px)`,
          transition: touchState.current.isTracking ? 'none' : 'transform 0.2s ease-out'
        },
        onClick: handleContentClick
      }, children)
    );
  }

  // Экспорт
  HEYS.SwipeableRow = SwipeableRow;

})(window);
