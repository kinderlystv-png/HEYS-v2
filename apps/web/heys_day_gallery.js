// heys_day_gallery.js — Photo Gallery components for DayTab
// Extracted from heys_day_v12.js (Phase 3)
// Contains: LazyPhotoThumb, fullscreen viewer, photo upload/delete

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import utilities from dayUtils
  const U = HEYS.dayUtils || {};
  const haptic = U.haptic || (() => {});
  const fmtDate = U.fmtDate || ((d) => d);
  
  // Import popup components
  const { PopupCloseButton } = HEYS.dayPopups || {};
  
  const PHOTO_LIMIT_PER_MEAL = 10;
  
  /**
   * Lazy Photo Thumbnail с IntersectionObserver и skeleton loading
   */
  const LazyPhotoThumb = React.memo(function LazyPhotoThumb({
    photo, photoSrc, thumbClass, timeStr, mealIndex, photoIndex, mealPhotos, handleDelete, removePhoto, setDay
  }) {
    const [isLoaded, setIsLoaded] = React.useState(false);
    const [isVisible, setIsVisible] = React.useState(false);
    const containerRef = React.useRef(null);
    
    // IntersectionObserver для lazy loading
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      
      // Если это base64 data, показываем сразу (уже в памяти)
      if (photoSrc?.startsWith('data:')) {
        setIsVisible(true);
        return;
      }
      
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100px' } // Предзагружаем за 100px до видимости
      );
      
      observer.observe(el);
      return () => observer.disconnect();
    }, [photoSrc]);
    
    // Открытие галереи
    const handleClick = React.useCallback((e) => {
      // Не открывать галерею если кликнули по чекбоксу
      if (e.target.closest('.photo-processed-checkbox')) return;
      
      if (window.HEYS?.showPhotoViewer) {
        const onDeleteInViewer = (photoId) => removePhoto?.(mealIndex, photoId, { skipConfirm: false });
        window.HEYS.showPhotoViewer([...(mealPhotos || [])], photoIndex, onDeleteInViewer);
      } else {
        window.open(photoSrc, '_blank');
      }
    }, [mealPhotos, photoIndex, photoSrc, mealIndex, removePhoto]);
    
    // Toggle "обработано"
    const handleToggleProcessed = React.useCallback((e) => {
      e.stopPropagation();
      setDay((prevDay = {}) => {
        const meals = (prevDay.meals || []).map((m, i) => {
          if (i !== mealIndex || !m.photos) return m;
          return { 
            ...m, 
            photos: m.photos.map(p => 
              p.id === photo.id ? { ...p, processed: !p.processed } : p
            )
          };
        });
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
      // Haptic feedback
      try { navigator.vibrate?.(10); } catch(e) {}
    }, [photo.id, mealIndex, setDay]);
    
    // Классы с skeleton
    let finalClass = thumbClass;
    if (!isLoaded && isVisible) finalClass += ' skeleton';
    if (photo.processed) finalClass += ' processed';
    
    return React.createElement('div', { 
      ref: containerRef,
      className: finalClass,
      onClick: handleClick
    },
      // Изображение (показываем только когда видимо)
      isVisible && React.createElement('img', { 
        src: photoSrc, 
        alt: 'Фото приёма',
        onLoad: () => setIsLoaded(true),
        onError: () => setIsLoaded(true) // Убираем skeleton даже при ошибке
      }),
      // Чекбокс "обработано" (круглый, в левом верхнем углу)
      isLoaded && React.createElement('button', {
        className: 'photo-processed-checkbox' + (photo.processed ? ' checked' : ''),
        onClick: handleToggleProcessed,
        title: photo.processed ? 'Снять отметку' : 'Отметить как обработано'
      }, photo.processed ? '✓' : ''),
      // Timestamp badge
      timeStr && isLoaded && React.createElement('div', { 
        className: 'photo-time-badge'
      }, timeStr),
      // Кнопка удаления
      isLoaded && React.createElement('button', {
        className: 'photo-delete-btn',
        onClick: handleDelete,
        title: 'Удалить фото'
      }, '✕'),
      // Индикатор pending
      photo.pending && isLoaded && React.createElement('div', { 
        className: 'photo-pending-badge',
        title: 'Ожидает загрузки в облако'
      }, '⏳')
    );
  });

  /**
   * Показать галерею фото на весь экран
   * @param {Array} photos - массив фото [{url, data, id, timestamp, pending}]
   * @param {number} startIndex - индекс начального фото
   * @param {Function} onDelete - callback для удаления (photoId) => void
   */
  HEYS.showPhotoViewer = function showPhotoViewer(photos, startIndex = 0, onDelete = null) {
    // Поддержка старого API (один imageSrc)
    if (typeof photos === 'string') {
      photos = [{ data: photos, id: 'single' }];
      startIndex = 0;
    }
    if (!photos || photos.length === 0) return;
    
    let currentIndex = startIndex;
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isPinching = false;
    let startDistance = 0;
    let startScale = 1;
    
    // Создаём overlay
    const overlay = document.createElement('div');
    overlay.className = 'photo-viewer-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: none;
      user-select: none;
    `;
    
    // Верхняя панель
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0;
      padding: max(16px, env(safe-area-inset-top, 16px)) 16px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
      z-index: 10001;
    `;
    
    // Счётчик фото
    const counter = document.createElement('span');
    counter.style.cssText = 'color: white; font-size: 16px; font-weight: 500;';
    const updateCounter = () => {
      counter.textContent = photos.length > 1 ? `${currentIndex + 1} / ${photos.length}` : '';
    };
    updateCounter();
    
    // Кнопки
    const buttonsWrap = document.createElement('div');
    buttonsWrap.style.cssText = 'display: flex; gap: 12px;';
    
    // Кнопка удаления
    if (onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '🗑';
      deleteBtn.style.cssText = `
        width: 44px; height: 44px; border: none;
        background: rgba(239, 68, 68, 0.8);
        color: white; font-size: 20px; border-radius: 50%;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      `;
      deleteBtn.onclick = async () => {
        const photo = photos[currentIndex];
        if (photo && onDelete) {
          const removed = await onDelete(photo.id);
          if (removed === false) return;
          photos.splice(currentIndex, 1);
          if (photos.length === 0) {
            close();
          } else {
            currentIndex = Math.min(currentIndex, photos.length - 1);
            showPhoto(currentIndex);
            updateCounter();
            updateDots();
          }
        }
      };
      buttonsWrap.appendChild(deleteBtn);
    }
    
    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      width: 44px; height: 44px; border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white; font-size: 24px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    `;
    closeBtn.onclick = close;
    buttonsWrap.appendChild(closeBtn);
    
    topBar.appendChild(counter);
    topBar.appendChild(buttonsWrap);
    
    // Контейнер для изображения (для zoom/pan)
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      overflow: hidden;
    `;
    
    // Изображение
    const img = document.createElement('img');
    img.alt = 'Фото приёма';
    img.style.cssText = `
      max-width: calc(100% - 32px);
      max-height: calc(100% - 120px);
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      transition: transform 0.1s ease-out;
      touch-action: none;
    `;
    
    function showPhoto(index) {
      const photo = photos[index];
      if (!photo) return;
      img.src = photo.url || photo.data;
      scale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    }
    
    function updateTransform() {
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
    
    showPhoto(currentIndex);
    imgContainer.appendChild(img);
    
    // Точки-индикаторы (если > 1 фото)
    let dotsContainer = null;
    function updateDots() {
      if (!dotsContainer) return;
      dotsContainer.innerHTML = '';
      if (photos.length <= 1) return;
      photos.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.style.cssText = `
          width: 8px; height: 8px; border-radius: 50%;
          background: ${i === currentIndex ? 'white' : 'rgba(255,255,255,0.4)'};
          transition: background 0.2s;
        `;
        dotsContainer.appendChild(dot);
      });
    }
    
    if (photos.length > 1) {
      dotsContainer = document.createElement('div');
      dotsContainer.style.cssText = `
        position: absolute;
        bottom: max(24px, env(safe-area-inset-bottom, 24px));
        display: flex; gap: 8px;
        z-index: 10001;
      `;
      updateDots();
    }
    
    // Timestamp badge
    const timestampBadge = document.createElement('div');
    timestampBadge.style.cssText = `
      position: absolute;
      bottom: max(60px, calc(env(safe-area-inset-bottom, 24px) + 36px));
      color: rgba(255,255,255,0.7);
      font-size: 14px;
      z-index: 10001;
    `;
    function updateTimestamp() {
      const photo = photos[currentIndex];
      if (photo?.timestamp) {
        const d = new Date(photo.timestamp);
        timestampBadge.textContent = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      } else {
        timestampBadge.textContent = '';
      }
    }
    updateTimestamp();
    
    // === Gesture handling ===
    let startX = 0, startY = 0;
    let isDragging = false;
    let swipeStartX = 0;
    
    function getDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    
    imgContainer.ontouchstart = function(e) {
      if (e.touches.length === 2) {
        // Pinch start
        isPinching = true;
        startDistance = getDistance(e.touches);
        startScale = scale;
      } else if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        swipeStartX = startX;
        isDragging = scale > 1;
      }
    };
    
    imgContainer.ontouchmove = function(e) {
      if (isPinching && e.touches.length === 2) {
        // Pinch zoom
        const distance = getDistance(e.touches);
        scale = Math.max(1, Math.min(5, startScale * (distance / startDistance)));
        updateTransform();
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        
        if (scale > 1 && isDragging) {
          // Pan when zoomed
          translateX += dx;
          translateY += dy;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          updateTransform();
          e.preventDefault();
        } else if (Math.abs(dy) > 80 && dy > 0) {
          // Swipe down to close
          close();
        }
      }
    };
    
    imgContainer.ontouchend = function(e) {
      if (isPinching) {
        isPinching = false;
        if (scale < 1.1) {
          scale = 1;
          translateX = 0;
          translateY = 0;
          updateTransform();
        }
        return;
      }
      
      // Swipe left/right for navigation (only when not zoomed)
      if (scale <= 1 && photos.length > 1) {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        if (Math.abs(dx) > 50) {
          if (dx < 0 && currentIndex < photos.length - 1) {
            currentIndex++;
          } else if (dx > 0 && currentIndex > 0) {
            currentIndex--;
          }
          showPhoto(currentIndex);
          updateCounter();
          updateDots();
          updateTimestamp();
        }
      }
      isDragging = false;
    };
    
    // Double tap to zoom
    let lastTap = 0;
    imgContainer.onclick = function(e) {
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double tap
        if (scale > 1) {
          scale = 1;
          translateX = 0;
          translateY = 0;
        } else {
          scale = 2.5;
        }
        updateTransform();
      }
      lastTap = now;
    };
    
    // Keyboard navigation
    function onKeydown(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        currentIndex--;
        showPhoto(currentIndex);
        updateCounter();
        updateDots();
        updateTimestamp();
      }
      if (e.key === 'ArrowRight' && currentIndex < photos.length - 1) {
        currentIndex++;
        showPhoto(currentIndex);
        updateCounter();
        updateDots();
        updateTimestamp();
      }
    }
    document.addEventListener('keydown', onKeydown);
    
    // Close on overlay click (not on image)
    overlay.onclick = function(e) {
      if (e.target === overlay) close();
    };
    
    function close() {
      overlay.style.animation = 'fadeOut 0.15s ease forwards';
      document.removeEventListener('keydown', onKeydown);
      setTimeout(() => overlay.remove(), 150);
    }
    
    // Assemble
    overlay.appendChild(topBar);
    overlay.appendChild(imgContainer);
    if (dotsContainer) overlay.appendChild(dotsContainer);
    overlay.appendChild(timestampBadge);
    document.body.appendChild(overlay);
    
    overlay.tabIndex = -1;
    overlay.focus();
  };
  
  // Export to HEYS namespace
  HEYS.dayGallery = {
    PHOTO_LIMIT_PER_MEAL,
    LazyPhotoThumb
  };
  
})(window);
