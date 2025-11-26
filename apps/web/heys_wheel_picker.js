// heys_wheel_picker.js — iOS-style Wheel Picker компонент
// Универсальный компонент для выбора значений прокруткой (время, граммы, порции и т.д.)

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === Haptic Feedback ===
  const haptic = {
    light: () => {
      if (navigator.vibrate) navigator.vibrate(5);
    },
    medium: () => {
      if (navigator.vibrate) navigator.vibrate(10);
    },
    tick: () => {
      if (navigator.vibrate) navigator.vibrate(3);
    }
  };
  
  // === Click Sound (lazy-loaded) ===
  let tickSound = null;
  const playTick = () => {
    try {
      if (!tickSound) {
        // Создаём короткий звук через Web Audio API
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        tickSound = { ctx: audioCtx };
      }
      const ctx = tickSound.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.value = 1200; // Высокий тон
      gain.gain.setValueAtTime(0.03, ctx.currentTime); // Тихо
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // Audio API не доступен
    }
  };

  /**
   * WheelColumn — iOS-style wheel picker с инерционным скроллом
   * @param {Object} props
   * @param {Array<string>} props.values - Массив значений для выбора
   * @param {number} props.selected - Индекс выбранного значения
   * @param {Function} props.onChange - Callback при изменении (получает новый индекс)
   * @param {string} [props.label] - Подпись сверху колонки
   */
  function WheelColumn({ values, selected, onChange, label }) {
    const containerRef = React.useRef(null);
    const itemHeight = 44;
    const [offset, setOffset] = React.useState(-selected * itemHeight);
    const offsetRef = React.useRef(offset);
    
    // Синхронизация ref с state
    React.useEffect(() => {
      offsetRef.current = offset;
    }, [offset]);
    
    // Tracking для momentum
    const touchState = React.useRef({
      startY: 0,
      startOffset: 0,
      lastY: 0,
      lastTime: 0,
      velocityY: 0,
      isTracking: false,
      animationId: null,
      lastTickIndex: selected // Для отслеживания пересечения элементов
    });
    
    // Синхронизация offset с selected при открытии
    React.useEffect(() => {
      setOffset(-selected * itemHeight);
    }, []);
    
    // Вычисление index из offset
    const getIndexFromOffset = React.useCallback((off) => {
      const idx = Math.round(-off / itemHeight);
      return Math.max(0, Math.min(values.length - 1, idx));
    }, [values.length]);
    
    // Snap к ближайшему элементу с анимацией
    const snapToIndex = React.useCallback((targetIndex, animated = true) => {
      const clampedIndex = Math.max(0, Math.min(values.length - 1, targetIndex));
      const targetOffset = -clampedIndex * itemHeight;
      
      if (animated) {
        const startOffset = offsetRef.current;
        const startTime = Date.now();
        const duration = 300;
        
        const animateSnap = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          const currentOffset = startOffset + (targetOffset - startOffset) * eased;
          
          setOffset(currentOffset);
          
          if (progress < 1) {
            touchState.current.animationId = requestAnimationFrame(animateSnap);
          } else {
            setOffset(targetOffset);
            if (clampedIndex !== selected) {
              haptic.medium(); // Haptic при финальном snap
              onChange(clampedIndex);
            }
          }
        };
        
        touchState.current.animationId = requestAnimationFrame(animateSnap);
      } else {
        setOffset(targetOffset);
        if (clampedIndex !== selected) {
          haptic.medium();
          onChange(clampedIndex);
        }
      }
    }, [values.length, selected, onChange]);
    
    // Регистрация touch handlers с passive: false
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      
      const handleTouchStart = (e) => {
        e.preventDefault();
        if (touchState.current.animationId) {
          cancelAnimationFrame(touchState.current.animationId);
          touchState.current.animationId = null;
        }
        
        const touch = e.touches[0];
        const now = Date.now();
        touchState.current = {
          startY: touch.clientY,
          startOffset: offsetRef.current,
          lastY: touch.clientY,
          lastTime: now,
          velocityY: 0,
          isTracking: true,
          animationId: null
        };
      };
      
      const handleTouchMove = (e) => {
        e.preventDefault();
        if (!touchState.current.isTracking) return;
        
        const touch = e.touches[0];
        const now = Date.now();
        const deltaY = touch.clientY - touchState.current.lastY;
        const deltaTime = now - touchState.current.lastTime;
        
        if (deltaTime > 0) {
          touchState.current.velocityY = deltaY / deltaTime;
        }
        
        const newOffset = touchState.current.startOffset + (touch.clientY - touchState.current.startY);
        const minOffset = -(values.length - 1) * itemHeight;
        const maxOffset = 0;
        
        let clampedOffset = newOffset;
        if (newOffset > maxOffset) {
          clampedOffset = maxOffset + (newOffset - maxOffset) * 0.3; // Резиновый эффект
        } else if (newOffset < minOffset) {
          clampedOffset = minOffset + (newOffset - minOffset) * 0.3;
        }
        
        setOffset(clampedOffset);
        
        // Проверяем пересечение границы элемента
        const currentIndex = getIndexFromOffset(clampedOffset);
        if (currentIndex !== touchState.current.lastTickIndex) {
          touchState.current.lastTickIndex = currentIndex;
          haptic.tick();
          playTick();
        }
        
        touchState.current.lastY = touch.clientY;
        touchState.current.lastTime = now;
      };
      
      const handleTouchEnd = (e) => {
        e.preventDefault();
        if (!touchState.current.isTracking) return;
        touchState.current.isTracking = false;
        
        const velocity = touchState.current.velocityY;
        
        // Если скорость маленькая — просто snap
        if (Math.abs(velocity) < 0.3) {
          snapToIndex(getIndexFromOffset(offsetRef.current));
          return;
        }
        
        // Momentum animation
        let currentOffset = offsetRef.current;
        let currentVelocity = velocity * 15; // Усиление
        const friction = 0.95;
        const minOffset = -(values.length - 1) * itemHeight;
        const maxOffset = 0;
        
        const animate = () => {
          currentVelocity *= friction;
          currentOffset += currentVelocity;
          
          // Границы
          if (currentOffset > maxOffset) {
            currentOffset = maxOffset;
            currentVelocity = 0;
          } else if (currentOffset < minOffset) {
            currentOffset = minOffset;
            currentVelocity = 0;
          }
          
          setOffset(currentOffset);
          
          // Tick при пересечении элемента во время momentum
          const currentIndex = getIndexFromOffset(currentOffset);
          if (currentIndex !== touchState.current.lastTickIndex) {
            touchState.current.lastTickIndex = currentIndex;
            haptic.tick();
            playTick();
          }
          
          if (Math.abs(currentVelocity) > 0.5) {
            touchState.current.animationId = requestAnimationFrame(animate);
          } else {
            snapToIndex(getIndexFromOffset(currentOffset));
          }
        };
        
        touchState.current.animationId = requestAnimationFrame(animate);
      };
      
      el.addEventListener('touchstart', handleTouchStart, { passive: false });
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd, { passive: false });
      
      return () => {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
        if (touchState.current.animationId) {
          cancelAnimationFrame(touchState.current.animationId);
        }
      };
    }, [values.length, snapToIndex, getIndexFromOffset]);
    
    return React.createElement('div', { className: 'wheel-column' },
      label && React.createElement('div', { className: 'wheel-label' }, label),
      React.createElement('div', { 
        className: 'wheel-viewport',
        ref: containerRef
      },
        React.createElement('div', { 
          className: 'wheel-track',
          style: { transform: `translateY(${offset + itemHeight * 2}px)` }
        },
          values.map((val, i) => React.createElement('div', {
            key: i,
            className: 'wheel-item' + (i === selected ? ' selected' : ''),
            style: { height: itemHeight },
            onClick: () => snapToIndex(i)
          }, val))
        )
      ),
      React.createElement('div', { className: 'wheel-highlight' })
    );
  }

  // Предустановленные значения
  WheelColumn.presets = {
    hours: Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')),
    minutes: Array.from({length: 60}, (_, i) => String(i).padStart(2, '0')),
    rating: ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    grams: ['10', '25', '50', '75', '100', '125', '150', '175', '200', '250', '300', '400', '500']
  };

  // Экспорт
  HEYS.WheelColumn = WheelColumn;

})(window);
