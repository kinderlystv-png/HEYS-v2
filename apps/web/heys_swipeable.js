// heys_swipeable.js — Swipeable компонент для удаления свайпом влево
// Используется для карточек продуктов на мобильных устройствах

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  /**
   * SwipeableRow — обёртка для элементов с поддержкой swipe-to-delete
   * @param {Object} props
   * @param {Function} props.onDelete - Callback при удалении
   * @param {ReactNode} props.children - Содержимое строки
   * @param {string} [props.className] - Дополнительные классы
   */
  function SwipeableRow({ onDelete, children, className = '' }) {
    const rowRef = React.useRef(null);
    const [translateX, setTranslateX] = React.useState(0);
    const [isDeleting, setIsDeleting] = React.useState(false);

    const touchState = React.useRef({
      startX: 0,
      startY: 0,
      currentX: 0,
      isTracking: false,
      isVerticalScroll: null // null = не определено, true = вертикальный скролл
    });

    const DELETE_THRESHOLD = 100; // Порог для показа кнопки удаления (увеличен для меньшей чувствительности)
    const DELETE_FULL_THRESHOLD = 180; // Порог для автоматического удаления
    const revealProgress = isDeleting
      ? 1
      : Math.max(0, Math.min(1, Math.abs(translateX) / 36));

    React.useEffect(() => {
      const el = rowRef.current;
      if (!el) return;

      const handleTouchStart = (e) => {
        if (isDeleting) return;
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

        // Определяем направление скролла при первом движении (увеличен порог 5→15)
        if (touchState.current.isVerticalScroll === null && (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15)) {
          touchState.current.isVerticalScroll = Math.abs(deltaY) > Math.abs(deltaX);
        }

        // Если вертикальный скролл — не мешаем
        if (touchState.current.isVerticalScroll) return;

        // Горизонтальный swipe — предотвращаем скролл страницы
        e.preventDefault();

        touchState.current.currentX = touch.clientX;

        // Только влево (отрицательные значения)
        let newX = deltaX;
        if (newX > 0) newX = 0; // Не даём свайпить вправо
        if (newX < -DELETE_FULL_THRESHOLD * 1.2) {
          newX = -DELETE_FULL_THRESHOLD * 1.2; // Ограничиваем максимум
        }

        setTranslateX(newX);
      };

      const handleTouchEnd = (e) => {
        if (!touchState.current.isTracking || isDeleting) return;
        touchState.current.isTracking = false;

        const finalX = translateX;

        if (finalX < -DELETE_FULL_THRESHOLD) {
          // Полный свайп — удаляем
          setIsDeleting(true);
          setTranslateX(-window.innerWidth);

          // Haptic feedback
          if (navigator.vibrate) navigator.vibrate(20);

          setTimeout(() => {
            onDelete();
          }, 200);
        } else if (finalX < -DELETE_THRESHOLD) {
          // Частичный свайп — показываем кнопку
          setTranslateX(-DELETE_THRESHOLD);
        } else {
          // Недостаточный свайп — возвращаем
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
    }, [translateX, isDeleting, onDelete]);

    // Клик по кнопке удаления
    const handleDeleteClick = () => {
      setIsDeleting(true);
      setTranslateX(-window.innerWidth);
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(() => {
        onDelete();
      }, 200);
    };

    // Клик на контент — закрыть если открыто
    const handleContentClick = () => {
      if (translateX < 0) {
        setTranslateX(0);
      }
    };

    return React.createElement('div', {
      className: 'swipeable-container ' + className,
      ref: rowRef
    },
      // Фон с кнопкой удаления
      React.createElement('div', {
        className: 'swipeable-background',
        style: {
          opacity: revealProgress,
          transform: `translateX(${(1 - revealProgress) * 12}px)`,
          transition: touchState.current.isTracking
            ? 'opacity 0.05s linear, transform 0.05s linear'
            : 'opacity 0.18s ease, transform 0.18s ease'
        }
      },
        React.createElement('button', {
          className: 'swipeable-delete-btn',
          tabIndex: translateX <= -DELETE_THRESHOLD ? 0 : -1,
          'aria-hidden': translateX <= -DELETE_THRESHOLD ? 'false' : 'true',
          onClick: handleDeleteClick
        }, 'Удалить')
      ),
      // Контент
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
