// heys_day_v12.js — DayTab component, daily tracking, meals, statistics
// Refactored: imports from heys_day_utils.js, heys_day_hooks.js, heys_day_pickers.js

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === Import utilities from dayUtils module ===
  const U = HEYS.dayUtils || {};
  
  // Minimal fallback helper: log error and return safe default
  const warnMissing = (name) => { 
    console.error('[HEYS] dayUtils.' + name + ' not loaded'); 
  };
  
  // Fallbacks with error logging (not full duplicates)
  const haptic = U.haptic || (() => { warnMissing('haptic'); });
  
  // 🔔 Звук успеха при достижении нормы (Web Audio API)
  const playSuccessSound = (() => {
    let audioCtx = null;
    let lastPlayTime = 0;
    return () => {
      // Проверяем настройку звука (по умолчанию включено)
      const soundEnabled = lsGet('heys_sound_enabled', true);
      if (!soundEnabled) return;
      
      // Предотвращаем слишком частые звуки (минимум 2 секунды между)
      const now = Date.now();
      if (now - lastPlayTime < 2000) return;
      lastPlayTime = now;
      
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Приятный "динь" — два тона
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.frequency.value = 880; // A5
        osc2.frequency.value = 1174.66; // D6
        osc1.type = 'sine';
        osc2.type = 'sine';
        
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        
        osc1.start(audioCtx.currentTime);
        osc2.start(audioCtx.currentTime + 0.1);
        osc1.stop(audioCtx.currentTime + 0.3);
        osc2.stop(audioCtx.currentTime + 0.4);
      } catch(e) {
        // Звук не поддерживается — игнорируем
      }
    };
  })();
  
  const pad2 = U.pad2 || ((n) => { warnMissing('pad2'); return String(n).padStart(2,'0'); });
  const todayISO = U.todayISO || (() => { warnMissing('todayISO'); return new Date().toISOString().slice(0,10); });
  const fmtDate = U.fmtDate || ((d) => { warnMissing('fmtDate'); return d.toISOString().slice(0,10); });
  const parseISO = U.parseISO || ((s) => { warnMissing('parseISO'); return new Date(); });
  const uid = U.uid || ((p) => { warnMissing('uid'); return (p||'id')+Math.random().toString(36).slice(2,8); });
  const formatDateDisplay = U.formatDateDisplay || (() => { warnMissing('formatDateDisplay'); return { label: 'День', sub: '' }; });
  // ВАЖНО: lsGet/lsSet должны вызывать HEYS.utils.lsGet/lsSet динамически, 
  // т.к. при загрузке файла U.__clientScoped может быть ещё не инициализирован
  // ИСПРАВЛЕНО: используем HEYS.utils напрямую, а не локальный U (который = dayUtils)
  const lsGet = (k,d) => { 
    const utils = HEYS.utils || {};
    if (utils.lsGet) { 
      return utils.lsGet(k, d); 
    } else { 
      warnMissing('lsGet'); 
      try { const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; } catch(e) { return d; } 
    } 
  };
  const lsSet = (k,v) => { 
    const utils = HEYS.utils || {};
    if (utils.lsSet) { 
      utils.lsSet(k, v); 
    } else { 
      warnMissing('lsSet'); 
      try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} 
    } 
  };
  const clamp = U.clamp || ((n,a,b) => { warnMissing('clamp'); n=+n||0; if(n<a)return a; if(n>b)return b; return n; });
  const r0 = U.r0 || ((v) => { warnMissing('r0'); return Math.round(+v||0); });
  const r1 = U.r1 || ((v) => { warnMissing('r1'); return Math.round((+v||0)*10)/10; });
  const scale = U.scale || ((v,g) => { warnMissing('scale'); return Math.round(((+v||0)*(+g||0)/100)*10)/10; });
  const ensureDay = U.ensureDay || ((d,prof) => { warnMissing('ensureDay'); return d||{}; });
  const buildProductIndex = U.buildProductIndex || (() => { warnMissing('buildProductIndex'); return {byId:new Map(),byName:new Map()}; });
  const getProductFromItem = U.getProductFromItem || (() => { warnMissing('getProductFromItem'); return null; });
  const per100 = U.per100 || (() => { warnMissing('per100'); return {kcal100:0,carbs100:0,prot100:0,fat100:0,simple100:0,complex100:0,bad100:0,good100:0,trans100:0,fiber100:0}; });
  const loadMealsForDate = U.loadMealsForDate || (() => { warnMissing('loadMealsForDate'); return []; });
  const productsSignature = U.productsSignature || (() => { warnMissing('productsSignature'); return ''; });
  const computePopularProducts = U.computePopularProducts || (() => { warnMissing('computePopularProducts'); return []; });
  const getProfile = U.getProfile || (() => { warnMissing('getProfile'); return {sex:'male',height:175,age:30,sleepHours:8,weight:70,deficitPctTarget:0,stepsGoal:7000}; });
  const calcBMR = U.calcBMR || ((w,prof) => { warnMissing('calcBMR'); return Math.round(10*(+w||0)+6.25*(prof.height||175)-5*(prof.age||30)+(prof.sex==='female'?-161:5)); });
  const kcalPerMin = U.kcalPerMin || ((met,w) => { warnMissing('kcalPerMin'); return Math.round((((+met||0)*(+w||0)*0.0175)-1)*10)/10; });
  const stepsKcal = U.stepsKcal || ((steps,w,sex,len) => { warnMissing('stepsKcal'); const coef=(sex==='female'?0.5:0.57); const km=(+steps||0)*(len||0.7)/1000; return Math.round(coef*(+w||0)*km*10)/10; });
  const parseTime = U.parseTime || ((t) => { warnMissing('parseTime'); if(!t||typeof t!=='string'||!t.includes(':')) return null; const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); if(isNaN(hh)||isNaN(mm)) return null; return {hh:Math.max(0,Math.min(23,hh)),mm:Math.max(0,Math.min(59,mm))}; });
  const sleepHours = U.sleepHours || ((a,b) => { warnMissing('sleepHours'); const pt=(t)=>{ if(!t||!t.includes(':'))return null; const [h,m]=t.split(':').map(x=>+x); return isNaN(h)||isNaN(m)?null:{hh:h,mm:m}; }; const s=pt(a),e=pt(b); if(!s||!e)return 0; let d=(e.hh+e.mm/60)-(s.hh+s.mm/60); if(d<0)d+=24; return Math.round(d*10)/10; });
  // Meal type classification
  const getMealType = U.getMealType || ((mi, meal, allMeals, pIndex) => { 
    warnMissing('getMealType'); 
    return { type: 'snack', name: 'Приём ' + (mi+1), icon: '🍽️' }; 
  });
  
  // === Import hooks from dayHooks module ===
  const H = HEYS.dayHooks || {};
  const useDayAutosave = H.useDayAutosave;
  const useMobileDetection = H.useMobileDetection;
  const useSmartPrefetch = H.useSmartPrefetch;
  
  // Calendar загружается динамически в DayTab (строка ~1337), 
  // НЕ кэшируем здесь чтобы HMR работал

  // === Import models module ===
  const M = HEYS.models || {};

  // === Photo Gallery (fullscreen with swipe, zoom, delete) ===
  // Константы
  const PHOTO_LIMIT_PER_MEAL = 10;
  
  /**
   * Lazy Photo Thumbnail с IntersectionObserver и skeleton loading
   */
  const LazyPhotoThumb = React.memo(function LazyPhotoThumb({
    photo, photoSrc, thumbClass, timeStr, mealIndex, photoIndex, mealPhotos, handleDelete, setDay
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
        const onDeleteInViewer = (photoId) => {
          setDay((prevDay = {}) => {
            const meals = (prevDay.meals || []).map((m, i) => {
              if (i !== mealIndex || !m.photos) return m;
              return { ...m, photos: m.photos.filter(p => p.id !== photoId) };
            });
            return { ...prevDay, meals, updatedAt: Date.now() };
          });
        };
        window.HEYS.showPhotoViewer(mealPhotos, photoIndex, onDeleteInViewer);
      } else {
        window.open(photoSrc, '_blank');
      }
    }, [mealPhotos, photoIndex, photoSrc, mealIndex, setDay]);
    
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
      deleteBtn.onclick = () => {
        const photo = photos[currentIndex];
        if (photo && confirm('Удалить это фото?')) {
          onDelete(photo.id);
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

  // === Meal quality scoring helpers ===
  // Унифицированные лимиты — оценка НЕ зависит от типа приёма (перекус/основной)
  // Тип приёма — для удобства пользователя, а не для штрафов!
  
  // Единые абсолютные лимиты калорий (независимо от типа)
  const MEAL_KCAL_LIMITS = {
    light:  { max: 200 },   // Лёгкий приём
    normal: { max: 600 },   // Нормальный
    heavy:  { max: 800 },   // Тяжёлый (но ещё ок)
    excess: { max: 1000 }   // Переедание
  };

  // Унифицированные идеальные макросы — одинаковые для всех типов
  const IDEAL_MACROS_UNIFIED = {
    protPct: 0.25,   // 25% калорий из белка
    carbPct: 0.45,   // 45% из углеводов
    fatPct: 0.30,    // 30% из жиров
    minProtLight: 10,  // Минимум белка для лёгкого приёма (<200 ккал)
    minProtNormal: 15  // Минимум белка для нормального приёма (>200 ккал)
  };
  
  // === НАУЧНЫЕ КОЭФФИЦИЕНТЫ ИЗ ИНСУЛИНОВОЙ ВОЛНЫ ===
  // Источники: Brand-Miller 2003, Van Cauter 1997, Flood-Obbagy 2009
  
  // 🌅 Циркадные множители — метаболизм меняется в течение дня
  // Утром еда усваивается лучше (×0.9), ночью хуже (×1.2)
  const CIRCADIAN_MEAL_BONUS = {
    morning:   { from: 6, to: 10, bonus: 3, desc: '🌅 Утро — лучшее время' },
    midday:    { from: 10, to: 14, bonus: 2, desc: '🌞 Обеденное время' },
    afternoon: { from: 14, to: 18, bonus: 0, desc: 'Дневное время' },
    evening:   { from: 18, to: 21, bonus: 0, desc: 'Вечер' },
    lateEvening: { from: 21, to: 23, bonus: -2, desc: '⏰ Поздний вечер' },
    night:     { from: 23, to: 6, bonus: -5, desc: '🌙 Ночь' }
  };
  
  // 🥤 Жидкая пища — быстрый всплеск инсулина (Flood-Obbagy 2009)
  // Пик на 35% выше, но волна короче. Для качества еды — это минус.
  const LIQUID_FOOD_PATTERNS = [
    /сок\b/i, /\bсока\b/i, /\bсоки\b/i,
    /смузи/i, /коктейль/i, /shake/i,
    /кефир/i, /ряженка/i, /айран/i, /тан\b/i,
    /йогурт.*питьевой/i, /питьевой.*йогурт/i,
    /бульон/i, /суп.*пюре/i, /крем.*суп/i,
    /кола/i, /пепси/i, /фанта/i, /спрайт/i, /лимонад/i, /газировка/i,
    /энергетик/i, /energy/i,
    /протеин.*коктейль/i, /protein.*shake/i
  ];
  const LIQUID_FOOD_PENALTY = 5; // -5 баллов за преобладание жидких калорий
  
  // 🧬 GL-based качество углеводов (Brand-Miller 2003)
  // GL = GI × углеводы / 100 — лучший предиктор инсулинового ответа
  const GL_QUALITY_THRESHOLDS = {
    veryLow: { max: 5, bonus: 3, desc: 'Минимальный инсулиновый ответ' },
    low: { max: 10, bonus: 2, desc: 'Низкий инсулиновый ответ' },
    medium: { max: 20, bonus: 0, desc: 'Умеренный ответ' },
    high: { max: 30, bonus: -2, desc: 'Высокий ответ' },
    veryHigh: { max: Infinity, bonus: -4, desc: 'Очень высокий ответ' }
  };
  
  // Хелпер: проверка является ли продукт жидким
  function isLiquidFood(productName, category) {
    if (!productName) return false;
    const name = String(productName);
    const cat = String(category || '');
    
    // Проверяем категорию
    if (['Напитки', 'Соки', 'Молочные напитки'].includes(cat)) {
      return true;
    }
    
    // Проверяем паттерны в названии
    for (const pattern of LIQUID_FOOD_PATTERNS) {
      if (pattern.test(name)) return true;
    }
    
    return false;
  }
  
  // Хелпер: расчёт GL для приёма
  function calculateMealGL(avgGI, totalCarbs) {
    if (!avgGI || !totalCarbs) return 0;
    return (avgGI * totalCarbs) / 100;
  }
  
  // Хелпер: получить циркадный бонус по времени
  function getCircadianBonus(hour) {
    for (const [period, config] of Object.entries(CIRCADIAN_MEAL_BONUS)) {
      if (config.from <= config.to) {
        // Обычный интервал (не пересекает полночь)
        if (hour >= config.from && hour < config.to) {
          return { bonus: config.bonus, period, desc: config.desc };
        }
      } else {
        // Интервал пересекает полночь (night: 23 → 6)
        if (hour >= config.from || hour < config.to) {
          return { bonus: config.bonus, period, desc: config.desc };
        }
      }
    }
    return { bonus: 0, period: 'afternoon', desc: 'Дневное время' };
  }
  
  // Хелпер: получить GL бонус
  function getGLQualityBonus(gl) {
    for (const [level, config] of Object.entries(GL_QUALITY_THRESHOLDS)) {
      if (gl <= config.max) {
        return { bonus: config.bonus, level, desc: config.desc };
      }
    }
    return { bonus: -4, level: 'veryHigh', desc: 'Очень высокий ответ' };
  }
  
  // Legacy константы для совместимости (не используются в оценке!)
  const MEAL_KCAL_DISTRIBUTION = {
    breakfast: { minPct: 0.15, maxPct: 0.35 },
    snack1:    { minPct: 0.05, maxPct: 0.25 },
    lunch:     { minPct: 0.25, maxPct: 0.40 },
    snack2:    { minPct: 0.05, maxPct: 0.25 },
    dinner:    { minPct: 0.15, maxPct: 0.35 },
    snack3:    { minPct: 0.02, maxPct: 0.15 },
    night:     { minPct: 0.00, maxPct: 0.15 }
  };
  const MEAL_KCAL_ABSOLUTE = MEAL_KCAL_LIMITS; // Алиас
  const IDEAL_MACROS = { // Legacy алиас
    breakfast: IDEAL_MACROS_UNIFIED,
    lunch: IDEAL_MACROS_UNIFIED,
    dinner: IDEAL_MACROS_UNIFIED,
    snack: IDEAL_MACROS_UNIFIED,
    night: IDEAL_MACROS_UNIFIED
  };

  const safeRatio = (num, denom, fallback = 0.5) => {
    const n = +num || 0;
    const d = +denom || 0;
    if (d <= 0) return fallback;
    return n / d;
  };

  // === Цветовая оценка нутриентов для сводки приёма ===
  const NUTRIENT_COLORS = {
    good: '#16a34a',    // зелёный
    medium: '#ca8a04',  // жёлтый
    bad: '#dc2626'      // красный
  };

  /**
   * Получить цвет для значения нутриента в сводке приёма
   * @param {string} nutrient - тип нутриента
   * @param {number} value - значение
   * @param {object} totals - все totals приёма для контекста
   * @returns {string|null} - цвет или null (дефолтный)
   */
  function getNutrientColor(nutrient, value, totals = {}) {
    const v = +value || 0;
    const { kcal = 0, carbs = 0, simple = 0, complex = 0, prot = 0, fat = 0, bad = 0, good = 0, trans = 0, fiber = 0 } = totals;
    
    switch (nutrient) {
      // === КАЛОРИИ (за приём) ===
      case 'kcal':
        if (v <= 0) return null;
        if (v <= 150) return NUTRIENT_COLORS.good;      // Лёгкий перекус
        if (v <= 500) return null;                       // Нормально
        if (v <= 700) return NUTRIENT_COLORS.medium;    // Тяжеловато
        return NUTRIENT_COLORS.bad;                      // Переедание за приём
      
      // === УГЛЕВОДЫ (за приём) ===
      case 'carbs':
        if (v <= 0) return null;
        if (v <= 60) return NUTRIENT_COLORS.good;       // Норма
        if (v <= 100) return NUTRIENT_COLORS.medium;    // Много
        return NUTRIENT_COLORS.bad;                      // Слишком много
      
      // === ПРОСТЫЕ УГЛЕВОДЫ (за приём) ===
      case 'simple':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Нет простых = отлично
        if (v <= 10) return NUTRIENT_COLORS.good;       // Минимум
        if (v <= 25) return NUTRIENT_COLORS.medium;     // Терпимо
        return NUTRIENT_COLORS.bad;                      // Много сахара
      
      // === СЛОЖНЫЕ УГЛЕВОДЫ (за приём) ===
      case 'complex':
        if (v <= 0) return null;
        if (v >= 30 && carbs > 0 && v / carbs >= 0.7) return NUTRIENT_COLORS.good;  // Хорошо — сложных много
        return null;                                     // Нейтрально
      
      // === СООТНОШЕНИЕ ПРОСТЫЕ/СЛОЖНЫЕ ===
      case 'simple_complex_ratio':
        if (carbs <= 5) return null;                    // Мало углеводов — неважно
        const simpleRatio = simple / carbs;
        if (simpleRatio <= 0.3) return NUTRIENT_COLORS.good;   // Отлично
        if (simpleRatio <= 0.5) return NUTRIENT_COLORS.medium; // Терпимо
        return NUTRIENT_COLORS.bad;                             // Плохо
      
      // === БЕЛОК (за приём) ===
      case 'prot':
        if (v <= 0) return null;
        if (v >= 20 && v <= 40) return NUTRIENT_COLORS.good;   // Оптимум
        if (v >= 10 && v <= 50) return null;                    // Нормально
        if (v < 10 && kcal > 200) return NUTRIENT_COLORS.medium; // Мало белка для сытного приёма
        if (v > 50) return NUTRIENT_COLORS.medium;              // Много — избыток не усвоится
        return null;
      
      // === ЖИРЫ (за приём) ===
      case 'fat':
        if (v <= 0) return null;
        if (v <= 20) return NUTRIENT_COLORS.good;       // Норма
        if (v <= 35) return null;                        // Нормально
        if (v <= 50) return NUTRIENT_COLORS.medium;     // Много
        return NUTRIENT_COLORS.bad;                      // Очень много
      
      // === ВРЕДНЫЕ ЖИРЫ ===
      case 'bad':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Нет = отлично
        if (v <= 5) return null;                         // Минимум
        if (v <= 10) return NUTRIENT_COLORS.medium;     // Терпимо
        return NUTRIENT_COLORS.bad;                      // Много
      
      // === ПОЛЕЗНЫЕ ЖИРЫ ===
      case 'good':
        if (fat <= 0) return null;
        if (v >= fat * 0.6) return NUTRIENT_COLORS.good;  // >60% полезных
        if (v >= fat * 0.4) return null;                   // 40-60%
        return NUTRIENT_COLORS.medium;                     // <40% полезных
      
      // === ТРАНС-ЖИРЫ ===
      case 'trans':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Нет = идеально
        if (v <= 0.5) return NUTRIENT_COLORS.medium;    // Минимум
        return NUTRIENT_COLORS.bad;                      // Любое количество плохо
      
      // === СООТНОШЕНИЕ ЖИРОВ ===
      case 'fat_ratio':
        if (fat <= 3) return null;                       // Мало жиров — неважно
        const goodRatio = good / fat;
        const badRatio = bad / fat;
        if (goodRatio >= 0.6 && trans <= 0) return NUTRIENT_COLORS.good;
        if (badRatio > 0.5 || trans > 0.5) return NUTRIENT_COLORS.bad;
        return NUTRIENT_COLORS.medium;
      
      // === КЛЕТЧАТКА ===
      case 'fiber':
        if (v <= 0) return null;
        if (v >= 8) return NUTRIENT_COLORS.good;        // Отлично
        if (v >= 4) return null;                         // Нормально
        if (kcal > 300 && v < 2) return NUTRIENT_COLORS.medium; // Мало для сытного приёма
        return null;
      
      // === ГЛИКЕМИЧЕСКИЙ ИНДЕКС ===
      case 'gi':
        if (v <= 0 || carbs <= 5) return null;          // Нет углеводов — GI неважен
        if (v <= 40) return NUTRIENT_COLORS.good;       // Низкий
        if (v <= 55) return NUTRIENT_COLORS.good;       // Умеренный — хорошо
        if (v <= 70) return NUTRIENT_COLORS.medium;     // Средний
        return NUTRIENT_COLORS.bad;                      // Высокий
      
      // === ВРЕДНОСТЬ ===
      case 'harm':
        if (v <= 0) return NUTRIENT_COLORS.good;        // Полезная еда
        if (v <= 2) return NUTRIENT_COLORS.good;        // Минимально
        if (v <= 4) return null;                         // Нормально
        if (v <= 6) return NUTRIENT_COLORS.medium;      // Терпимо
        return NUTRIENT_COLORS.bad;                      // Вредно
      
      default:
        return null;
    }
  }

  /**
   * Получить tooltip для значения нутриента (объяснение цвета)
   */
  function getNutrientTooltip(nutrient, value, totals = {}) {
    const v = +value || 0;
    const { kcal = 0, carbs = 0, simple = 0, fat = 0, bad = 0, good = 0, trans = 0 } = totals;
    
    switch (nutrient) {
      case 'kcal':
        if (v <= 0) return 'Нет калорий';
        if (v <= 150) return '✅ Лёгкий приём (≤150 ккал)';
        if (v <= 500) return 'Нормальный приём';
        if (v <= 700) return '⚠️ Много для одного приёма (500-700 ккал)';
        return '❌ Переедание (>700 ккал за раз)';
      
      case 'carbs':
        if (v <= 0) return 'Без углеводов';
        if (v <= 60) return '✅ Умеренно углеводов (≤60г)';
        if (v <= 100) return '⚠️ Много углеводов (60-100г)';
        return '❌ Очень много углеводов (>100г)';
      
      case 'simple':
        if (v <= 0) return '✅ Без простых углеводов — идеально!';
        if (v <= 10) return '✅ Минимум простых (≤10г)';
        if (v <= 25) return '⚠️ Терпимо простых (10-25г)';
        return '❌ Много сахара (>25г) — инсулиновый скачок';
      
      case 'complex':
        if (v <= 0) return 'Без сложных углеводов';
        if (carbs > 0 && v / carbs >= 0.7) return '✅ Отлично! Сложных ≥70%';
        return 'Сложные углеводы';
      
      case 'prot':
        if (v <= 0) return 'Без белка';
        if (v >= 20 && v <= 40) return '✅ Оптимум белка (20-40г)';
        if (v < 10 && kcal > 200) return '⚠️ Мало белка для сытного приёма';
        if (v > 50) return '⚠️ Много белка (>50г) — избыток не усвоится';
        return 'Белок в норме';
      
      case 'fat':
        if (v <= 0) return 'Без жиров';
        if (v <= 20) return '✅ Умеренно жиров (≤20г)';
        if (v <= 35) return 'Жиры в норме';
        if (v <= 50) return '⚠️ Много жиров (35-50г)';
        return '❌ Очень много жиров (>50г)';
      
      case 'bad':
        if (v <= 0) return '✅ Без вредных жиров — отлично!';
        if (v <= 5) return 'Минимум вредных жиров';
        if (v <= 10) return '⚠️ Терпимо вредных жиров (5-10г)';
        return '❌ Много вредных жиров (>10г)';
      
      case 'good':
        if (fat <= 0) return 'Нет жиров';
        if (v >= fat * 0.6) return '✅ Полезных жиров ≥60%';
        if (v >= fat * 0.4) return 'Полезные жиры в норме';
        return '⚠️ Мало полезных жиров (<40%)';
      
      case 'trans':
        if (v <= 0) return '✅ Без транс-жиров — идеально!';
        if (v <= 0.5) return '⚠️ Есть транс-жиры (≤0.5г)';
        return '❌ Транс-жиры опасны (>0.5г)';
      
      case 'fiber':
        if (v <= 0) return 'Без клетчатки';
        if (v >= 8) return '✅ Отлично! Много клетчатки (≥8г)';
        if (v >= 4) return 'Клетчатка в норме';
        if (kcal > 300 && v < 2) return '⚠️ Мало клетчатки для сытного приёма';
        return 'Клетчатка';
      
      case 'gi':
        if (carbs <= 5) return 'Мало углеводов — ГИ неважен';
        if (v <= 40) return '✅ Низкий ГИ (≤40) — медленные углеводы';
        if (v <= 55) return '✅ Умеренный ГИ (40-55)';
        if (v <= 70) return '⚠️ Средний ГИ (55-70) — инсулин повышен';
        return '❌ Высокий ГИ (>70) — быстрый сахар в крови';
      
      case 'harm':
        if (v <= 0) return '✅ Полезная еда';
        if (v <= 2) return '✅ Минимальный вред';
        if (v <= 4) return 'Умеренный вред';
        if (v <= 6) return '⚠️ Заметный вред (4-6)';
        return '❌ Вредная еда (>6)';
      
      default:
        return null;
    }
  }

  /**
   * Получить цвет для СУТОЧНОГО значения (сравнение факта с нормой)
   * @param {string} nutrient - тип нутриента
   * @param {number} fact - фактическое значение
   * @param {number} norm - норма
   * @returns {string|null} - цвет или null
   */
  function getDailyNutrientColor(nutrient, fact, norm) {
    if (!norm || norm <= 0) return null;
    const pct = fact / norm; // процент выполнения
    
    switch (nutrient) {
      // === КАЛОРИИ — ключевой параметр ===
      case 'kcal':
        if (pct >= 0.90 && pct <= 1.10) return NUTRIENT_COLORS.good;  // 90-110% — идеально
        if (pct >= 0.75 && pct <= 1.20) return NUTRIENT_COLORS.medium; // 75-120% — терпимо
        return NUTRIENT_COLORS.bad;                                     // <75% или >120%
      
      // === БЕЛОК — чем больше, тем лучше (до 150%) ===
      case 'prot':
        if (pct >= 0.90 && pct <= 1.30) return NUTRIENT_COLORS.good;  // 90-130% — отлично
        if (pct >= 0.70) return NUTRIENT_COLORS.medium;                // 70-90% — маловато
        return NUTRIENT_COLORS.bad;                                     // <70% — критично мало
      
      // === УГЛЕВОДЫ — близко к норме ===
      case 'carbs':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ПРОСТЫЕ — чем меньше, тем лучше ===
      case 'simple':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;                  // <80% нормы — отлично
        if (pct <= 1.10) return null;                                   // 80-110% — норма
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;                // 110-130% — многовато
        return NUTRIENT_COLORS.bad;                                     // >130% — плохо
      
      // === СЛОЖНЫЕ — чем больше, тем лучше ===
      case 'complex':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;                  // ≥100% — отлично
        if (pct >= 0.70) return null;                                   // 70-100% — норма
        return NUTRIENT_COLORS.medium;                                  // <70% — маловато
      
      // === ЖИРЫ — близко к норме ===
      case 'fat':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНЫЕ ЖИРЫ — чем меньше, тем лучше ===
      case 'bad':
        if (pct <= 0.70) return NUTRIENT_COLORS.good;                  // <70% — отлично
        if (pct <= 1.00) return null;                                   // 70-100% — норма
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;                // 100-130% — многовато
        return NUTRIENT_COLORS.bad;                                     // >130%
      
      // === ПОЛЕЗНЫЕ ЖИРЫ — чем больше, тем лучше ===
      case 'good':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return null;
        return NUTRIENT_COLORS.medium;
      
      // === ТРАНС-ЖИРЫ — чем меньше, тем лучше (особо вредные) ===
      case 'trans':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;                  // <50% — отлично
        if (pct <= 1.00) return NUTRIENT_COLORS.medium;                // 50-100%
        return NUTRIENT_COLORS.bad;                                     // >100%
      
      // === КЛЕТЧАТКА — чем больше, тем лучше ===
      case 'fiber':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;                  // ≥100% — отлично
        if (pct >= 0.70) return null;                                   // 70-100% — норма
        if (pct >= 0.40) return NUTRIENT_COLORS.medium;                // 40-70% — маловато
        return NUTRIENT_COLORS.bad;                                     // <40%
      
      // === ГИ — чем ниже, тем лучше ===
      case 'gi':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;                  // <80% от целевого
        if (pct <= 1.10) return null;                                   // 80-110%
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНОСТЬ — чем меньше, тем лучше ===
      case 'harm':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;                  // <50% — отлично
        if (pct <= 1.00) return null;                                   // 50-100% — норма
        if (pct <= 1.50) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      default:
        return null;
    }
  }

  /**
   * Получить tooltip для СУТОЧНОГО значения
   */
  function getDailyNutrientTooltip(nutrient, fact, norm) {
    if (!norm || norm <= 0) return 'Норма не задана';
    const pct = Math.round((fact / norm) * 100);
    const diff = fact - norm;
    const diffStr = diff >= 0 ? '+' + Math.round(diff) : Math.round(diff);
    
    const baseInfo = `${Math.round(fact)} из ${Math.round(norm)} (${pct}%)`;
    
    switch (nutrient) {
      case 'kcal':
        if (pct >= 90 && pct <= 110) return `✅ Калории в норме: ${baseInfo}`;
        if (pct < 90) return `⚠️ Недобор калорий: ${baseInfo}`;
        return `❌ Перебор калорий: ${baseInfo}`;
      
      case 'prot':
        if (pct >= 90) return `✅ Белок в норме: ${baseInfo}`;
        if (pct >= 70) return `⚠️ Маловато белка: ${baseInfo}`;
        return `❌ Мало белка: ${baseInfo}`;
      
      case 'carbs':
        if (pct >= 85 && pct <= 115) return `✅ Углеводы в норме: ${baseInfo}`;
        if (pct < 85) return `⚠️ Мало углеводов: ${baseInfo}`;
        return `⚠️ Много углеводов: ${baseInfo}`;
      
      case 'simple':
        if (pct <= 80) return `✅ Мало простых — отлично: ${baseInfo}`;
        if (pct <= 110) return `Простые углеводы: ${baseInfo}`;
        return `❌ Много простых углеводов: ${baseInfo}`;
      
      case 'complex':
        if (pct >= 100) return `✅ Достаточно сложных: ${baseInfo}`;
        return `Сложные углеводы: ${baseInfo}`;
      
      case 'fat':
        if (pct >= 85 && pct <= 115) return `✅ Жиры в норме: ${baseInfo}`;
        return `Жиры: ${baseInfo}`;
      
      case 'bad':
        if (pct <= 70) return `✅ Мало вредных жиров: ${baseInfo}`;
        if (pct <= 100) return `Вредные жиры: ${baseInfo}`;
        return `❌ Много вредных жиров: ${baseInfo}`;
      
      case 'good':
        if (pct >= 100) return `✅ Достаточно полезных жиров: ${baseInfo}`;
        return `Полезные жиры: ${baseInfo}`;
      
      case 'trans':
        if (pct <= 50) return `✅ Минимум транс-жиров: ${baseInfo}`;
        return `❌ Транс-жиры: ${baseInfo}`;
      
      case 'fiber':
        if (pct >= 100) return `✅ Достаточно клетчатки: ${baseInfo}`;
        if (pct >= 70) return `Клетчатка: ${baseInfo}`;
        return `⚠️ Мало клетчатки: ${baseInfo}`;
      
      case 'gi':
        if (pct <= 80) return `✅ Низкий средний ГИ: ${baseInfo}`;
        if (pct <= 110) return `Средний ГИ: ${baseInfo}`;
        return `⚠️ Высокий средний ГИ: ${baseInfo}`;
      
      case 'harm':
        if (pct <= 50) return `✅ Минимальный вред: ${baseInfo}`;
        if (pct <= 100) return `Вредность: ${baseInfo}`;
        return `❌ Высокая вредность: ${baseInfo}`;
      
      default:
        return baseInfo;
    }
  }

  function calcKcalScore(kcal, mealType, optimum, timeStr) {
    // === ОЦЕНКА НЕ ЗАВИСИТ ОТ ТИПА ПРИЁМА! ===
    // Только абсолютные значения и время
    let points = 30;
    let ok = true;
    const issues = [];
    
    // === 1. Проверка абсолютных лимитов ===
    // Любой приём > 800 ккал — это много
    if (kcal > 800) {
      const excess = (kcal - 800) / 200; // Каждые 200 ккал сверх = -5
      const penalty = Math.min(15, Math.round(excess * 5));
      points -= penalty;
      ok = false;
      issues.push('много ккал');
    }
    // Приём > 1000 ккал — переедание
    if (kcal > 1000) {
      points -= 10; // Дополнительный штраф
      issues.push('переедание');
    }
    
    // === 2. Штраф за ночные приёмы ===
    const parsed = parseTime(timeStr || '');
    if (parsed) {
      const hour = parsed.hh;
      
      // 23:00-05:00 — ночное время (сдвинули с 22:00)
      if (hour >= 23 || hour < 5) {
        // Ночью приём > 300 ккал — небольшой штраф
        if (kcal > 300) {
          const nightPenalty = Math.min(10, Math.round((kcal - 300) / 100));
          points -= nightPenalty;
          ok = false;
          issues.push('ночь');
        }
        // Тяжёлый приём ночью (>700 ккал)
        if (kcal > 700) {
          points -= 5;
          issues.push('тяжёлая еда ночью');
        }
      }
      // 21:00-23:00 — поздний вечер (минимальный штраф)
      else if (hour >= 21 && kcal > 500) {
        const latePenalty = Math.min(5, Math.round((kcal - 500) / 150));
        points -= latePenalty;
        // ok остаётся true — это не критично
        issues.push('поздно');
      }
    }
    
    return { points: Math.max(0, points), ok, issues };
  }

  function calcMacroScore(prot, carbs, fat, kcal, mealType, timeStr) {
    // === ОЦЕНКА НЕ ЗАВИСИТ ОТ ТИПА ПРИЁМА! ===
    const ideal = IDEAL_MACROS_UNIFIED;
    let points = 20; // Базовые баллы (из 25)
    let proteinOk = true;
    const issues = [];
    
    // Минимум белка зависит от калорийности приёма, НЕ от типа!
    const minProt = kcal > 200 ? ideal.minProtNormal : ideal.minProtLight;
    if (prot >= minProt) {
      points += 5; // ✅ Бонус за достаточный белок
    } else if (kcal > 300) {
      // Штраф за недостаток белка только если приём существенный (>300 ккал)
      points -= 5; // Смягчённый штраф (было -10)
      proteinOk = false;
      issues.push('мало белка');
    }
    
    // Слишком много белка (>50г за приём) — неоптимально для усвоения
    if (prot > 50) {
      points -= 3;
      issues.push('много белка');
    }
    
    if (kcal > 0) {
      const protPct = (prot * 4) / kcal;
      const carbPct = (carbs * 4) / kcal;
      const fatPct = (fat * 9) / kcal;
      const deviation = Math.abs(protPct - ideal.protPct) + Math.abs(carbPct - ideal.carbPct) + Math.abs(fatPct - ideal.fatPct);
      points -= Math.min(10, Math.round(deviation * 15)); // max -10
      
      // Штраф за много углеводов вечером/ночью
      const parsed = parseTime(timeStr || '');
      if (parsed && parsed.hh >= 20 && carbPct > 0.50) {
        points -= 5;
        issues.push('углеводы вечером');
      }
    }
    
    return { points: Math.max(0, Math.min(25, points)), proteinOk, issues };
  }

  function calcCarbQuality(simple, complex) {
    const total = simple + complex;
    const simpleRatio = safeRatio(simple, total, 0.5);
    
    let points = 15;
    let ok = true;
    
    if (simpleRatio <= 0.30) {
      points = 15;
    } else if (simpleRatio <= 0.50) {
      points = 10;
      ok = simpleRatio <= 0.35;
    } else if (simpleRatio <= 0.70) {
      points = 5;
      ok = false;
    } else {
      points = 0;
      ok = false;
    }
    
    return { points, simpleRatio, ok };
  }

  function calcFatQuality(bad, good, trans) {
    const total = bad + good + trans;
    const goodRatio = safeRatio(good, total, 0.5);
    const badRatio = safeRatio(bad, total, 0.5);
    
    let points = 15;
    let ok = true;
    
    if (goodRatio >= 0.60) {
      points = 15;
    } else if (goodRatio >= 0.40) {
      points = 10;
    } else {
      points = 5;
      ok = false;
    }
    
    // Штраф за много плохих жиров (> 50%)
    if (badRatio > 0.50) {
      points -= 5;
      ok = false;
    }
    
    // Штраф за транс-жиры (> 0.5г)
    if (trans > 0.5) {
      points -= 5;
      ok = false;
    }
    
    return { points: Math.max(0, points), goodRatio, badRatio, ok };
  }

  function calcGiHarmScore(avgGI, avgHarm) {
    let points = 15;
    let ok = true;
    
    if (avgGI <= 55) {
      points = 15;
    } else if (avgGI <= 70) {
      points = 10;
    } else {
      points = 5;
      ok = false;
    }
    
    if (avgHarm > 5) {
      points -= Math.min(5, Math.round(avgHarm / 5));
      ok = avgHarm <= 10;
    }
    
    return { points: Math.max(0, points), ok };
  }

  function getMealQualityScore(meal, mealType, optimum, pIndex, activityContext) {
    if (!meal?.items || meal.items.length === 0) return null;
    
    const opt = optimum > 0 ? optimum : 2000;
    const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal:0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
    
    // harmMultiplier от активности (тренировка компенсирует вред)
    const harmMultiplier = activityContext?.harmMultiplier ?? 1;
    
    // GI взвешиваем по УГЛЕВОДАМ (не по граммам!) — для мяса/рыбы будет нейтральный 50
    let gramSum = 0, carbSum = 0, giSum = 0, harmSum = 0;
    (meal.items || []).forEach(it => {
      const p = getProductFromItem(it, pIndex) || {};
      const g = +it.grams || 0;
      if (!g) return;
      
      // Вычисляем углеводы для взвешивания GI
      const simple100 = +p.simple100 || 0;
      const complex100 = +p.complex100 || 0;
      const itemCarbs = (simple100 + complex100) * g / 100;
      
      const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? 50;
      const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? 0;
      
      gramSum += g;
      carbSum += itemCarbs;
      giSum += gi * itemCarbs; // взвешиваем по углеводам!
      harmSum += harm * g;
    });
    // Для мясных блюд (carbs ≈ 0) → нейтральный GI = 50
    const avgGI = carbSum > 0 ? giSum / carbSum : 50;
    const rawAvgHarm = gramSum > 0 ? harmSum / gramSum : 0;
    
    // === КОМПЕНСАЦИЯ ВРЕДА ТРЕНИРОВКОЙ ===
    // harmMultiplier < 1 снижает эффективный вред (еда во время/после тренировки)
    const avgHarm = rawAvgHarm * harmMultiplier;
    const harmReduction = harmMultiplier < 1 ? Math.round((1 - harmMultiplier) * 100) : 0;
    
    const { kcal, prot, carbs, simple, complex, fat, bad, good, trans } = totals;
    let score = 0;
    const badges = [];
    
    const kcalScore = calcKcalScore(kcal, mealType, opt, meal.time);
    score += kcalScore.points;
    if (!kcalScore.ok) badges.push({ type: 'К', ok: false });
    // Бейдж за ночное/позднее время
    if (kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью')) {
      badges.push({ type: '🌙', ok: false, label: 'Поздно' });
    } else if (kcalScore.issues?.includes('поздно')) {
      badges.push({ type: '⏰', ok: false, label: 'Вечер' });
    }
    
    const macroScore = calcMacroScore(prot, carbs, fat, kcal, mealType, meal.time);
    score += macroScore.points;
    if (!macroScore.proteinOk) badges.push({ type: 'Б', ok: false });
    if (macroScore.issues?.includes('углеводы вечером')) badges.push({ type: 'У⬇', ok: false, label: 'Угл вечером' });
    
    const carbScore = calcCarbQuality(simple, complex);
    score += carbScore.points;
    
    const fatScore = calcFatQuality(bad, good, trans);
    score += fatScore.points;
    if (trans > 0.5) badges.push({ type: 'ТЖ', ok: false });
    
    const giHarmScore = calcGiHarmScore(avgGI, avgHarm);
    score += giHarmScore.points;
    if (avgGI > 70) badges.push({ type: 'ГИ', ok: false });
    if (avgHarm > 10) badges.push({ type: 'Вр', ok: false });
    
    // === БОНУСЫ (до +15 сверх 100) ===
    let bonusPoints = 0;
    const positiveBadges = [];
    
    // Парсим время для бонусов
    const timeParsed = parseTime(meal.time || '');
    const hour = timeParsed?.hh || 12;
    
    // === НАУЧНЫЕ БОНУСЫ (из инсулиновой волны) ===
    
    // 🔬 GL-based качество (Brand-Miller 2003)
    // GL = GI × углеводы / 100 — лучший предиктор инсулинового ответа
    const mealGL = calculateMealGL(avgGI, totals.carbs || 0);
    const glBonus = getGLQualityBonus(mealGL);
    if (glBonus.bonus !== 0) {
      bonusPoints += glBonus.bonus;
      if (glBonus.bonus > 0) {
        positiveBadges.push({ type: '📉', ok: true, label: 'Низкая GL' });
      }
    }
    
    // 🌅 Циркадный бонус (Van Cauter 1997)
    // Утром метаболизм лучше — еда усваивается эффективнее
    const circadian = getCircadianBonus(hour);
    if (circadian.bonus > 0 && kcal >= 200) {
      bonusPoints += circadian.bonus;
      if (circadian.period === 'morning') {
        positiveBadges.push({ type: '🌅', ok: true, label: 'Утренний приём' });
      } else if (circadian.period === 'midday') {
        positiveBadges.push({ type: '🌞', ok: true, label: 'Обеденное время' });
      }
    }
    // Циркадный штраф уже применяется через calcKcalScore → не дублируем
    
    // 🥤 Детекция жидкой пищи (Flood-Obbagy 2009)
    // Жидкие калории → быстрый пик инсулина, меньше насыщение
    let liquidKcal = 0;
    (meal.items || []).forEach(it => {
      const p = getProductFromItem(it, pIndex) || {};
      const g = +it.grams || 0;
      if (!g) return;
      
      if (isLiquidFood(p.name, p.category)) {
        const itemKcal = (p.kcal100 || 0) * g / 100;
        liquidKcal += itemKcal;
      }
    });
    // Если >50% калорий из жидких продуктов — штраф
    const liquidRatio = kcal > 0 ? liquidKcal / kcal : 0;
    if (liquidRatio > 0.5 && kcal >= 100) {
      bonusPoints -= LIQUID_FOOD_PENALTY;
      badges.push({ type: '🥤', ok: false, label: 'Жидкие калории' });
    }
    
    // === ОРИГИНАЛЬНЫЕ БОНУСЫ (улучшены) ===
    
    // Бонус за ранний вечерний приём (18:00-19:30)
    if (hour >= 18 && hour < 20 && kcal >= 200) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌇', ok: true, label: 'Ранний вечер' });
    }
    
    // === БОНУС за высокобелковый приём ===
    // Творог, мясо, рыба — отличная еда независимо от "типа"!
    if (prot >= 20) {
      bonusPoints += 3;
      positiveBadges.push({ type: '🥛', ok: true, label: 'Белковый' });
    } else if (prot >= 15 && kcal <= 400) {
      // Лёгкий, но белковый приём
      bonusPoints += 2;
    }
    
    // Бонус за клетчатку (2г+ в приёме = хорошо)
    const fiber = totals.fiber || 0;
    if (fiber >= 5) {
      bonusPoints += 3;
      positiveBadges.push({ type: '🥗', ok: true, label: 'Клетчатка' });
    } else if (fiber >= 2) {
      bonusPoints += 1;
    }
    
    // Бонус за разнообразие (4+ продукта)
    const itemCount = (meal.items || []).length;
    if (itemCount >= 4) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🌈', ok: true, label: 'Разнообразие' });
    }
    
    // Бонус за хороший белок относительно калорий (независимо от типа)
    const protCalRatio = kcal > 0 ? (prot * 4) / kcal : 0;
    if (protCalRatio >= 0.20 && protCalRatio <= 0.40 && prot >= 10) {
      bonusPoints += 2;
      positiveBadges.push({ type: '💪', ok: true, label: 'Белок' });
    }
    
    // Бонус за низкий ГИ (<50)
    if (avgGI <= 50 && carbSum > 5) {
      bonusPoints += 2;
      positiveBadges.push({ type: '🎯', ok: true, label: 'Низкий ГИ' });
    }
    
    // === БОНУС за компенсацию тренировкой ===
    // Если еда во время/после тренировки, вред снижается (harmMultiplier < 1)
    if (harmReduction > 0 && rawAvgHarm > 5) {
      // Бонус пропорционален снижению вреда: 50% = +5, 30% = +3, 20% = +2
      const activityBonusPoints = Math.min(5, Math.round(harmReduction / 10));
      if (activityBonusPoints > 0) {
        bonusPoints += activityBonusPoints;
        positiveBadges.push({ type: activityContext?.badge || '🏋️', ok: true, label: `−${harmReduction}% вред` });
      }
    }
    
    // 🆕 v3.5.4: Бонус за еду в контексте тренировки (даже если вред низкий)
    // Хороший тайминг = +2 бонуса (peri/post/pre)
    if (activityContext && ['peri', 'post', 'pre'].includes(activityContext.type)) {
      const timingBonus = activityContext.type === 'peri' ? 3 : 
                          activityContext.type === 'post' ? 2 : 
                          1; // pre
      if (harmReduction === 0 || rawAvgHarm <= 5) {
        // Добавляем бонус только если не добавили выше (чтобы не дублировать)
        bonusPoints += timingBonus;
        positiveBadges.push({ 
          type: activityContext.type === 'peri' ? '🔥' : 
                activityContext.type === 'post' ? '💪' : '⚡', 
          ok: true, 
          label: activityContext.type === 'peri' ? 'Во время трени' : 
                 activityContext.type === 'post' ? 'После трени' : 'Перед трени'
        });
      }
    }
    
    // === БОНУС за качественный ночной/поздний приём ===
    // Если приём ночью, но состав хороший — компенсируем штраф!
    const hasNightIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('поздно');
    if (hasNightIssue) {
      // Бонус за высокий белок ночью (> 25г) — белок ночью это хорошо для восстановления
      if (prot >= 25) {
        bonusPoints += 4;
        positiveBadges.push({ type: '🌙💪', ok: true, label: 'Белок ночью' });
      }
      // Бонус за низкий ГИ ночью — не вызывает скачок инсулина
      if (avgGI <= 40) {
        bonusPoints += 3;
        positiveBadges.push({ type: '🌙🎯', ok: true, label: 'Низкий ГИ' });
      }
      // Бонус за минимум простых углеводов (<15г)
      if (simple < 15) {
        bonusPoints += 2;
      }
    }
    
    // Бонус за сбалансированный приём (все показатели в норме)
    if (kcalScore.ok && macroScore.proteinOk && carbScore.ok && fatScore.ok && giHarmScore.ok) {
      bonusPoints += 3;
      positiveBadges.push({ type: '⭐', ok: true, label: 'Баланс' });
    }
    
    // Увеличен лимит бонусов: качественный ночной приём может компенсировать штраф за время
    score += Math.min(15, bonusPoints); // Max +15 бонус (было 10)
    
    // Финальный score: 0-115 (100 base + 15 bonus) → нормализуем до 0-100
    const finalScore = Math.min(100, Math.round(score));
    
    const color = finalScore >= 80 ? '#22c55e' : finalScore >= 50 ? '#eab308' : '#ef4444';
    
    // Определяем статус времени
    const timeIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью');
    const lateIssue = kcalScore.issues?.includes('поздно');
    const timeOk = !timeIssue && !lateIssue;
    const timeValue = timeIssue ? '⚠️ ночь' : lateIssue ? 'поздно' : '✓';
    
    const details = [
      { label: 'Калории', value: Math.round(kcal) + ' ккал', ok: kcalScore.ok },
      { label: 'Время', value: timeValue, ok: timeOk },
      { label: 'Белок', value: Math.round(prot) + 'г', ok: macroScore.proteinOk },
      { label: 'Углеводы', value: carbScore.simpleRatio <= 0.3 ? 'сложные ✓' : Math.round(carbScore.simpleRatio * 100) + '% простых', ok: carbScore.ok },
      { label: 'Жиры', value: fatScore.goodRatio >= 0.6 ? 'полезные ✓' : Math.round(fatScore.goodRatio * 100) + '% полезных', ok: fatScore.ok },
      { label: 'ГИ', value: Math.round(avgGI), ok: avgGI <= 70 },
      { label: 'GL', value: Math.round(mealGL), ok: mealGL <= 20 },
      { label: 'Клетчатка', value: Math.round(fiber) + 'г', ok: fiber >= 2 },
      // Показываем вред с учётом компенсации тренировкой
      ...(harmReduction > 0 ? [{ label: 'Вред', value: `${Math.round(rawAvgHarm)} → ${Math.round(avgHarm)} (−${harmReduction}%)`, ok: avgHarm <= 10 }] : [])
    ];
    
    // Объединяем бейджи: сначала проблемы, потом позитивные
    const allBadges = [...badges.slice(0, 2), ...positiveBadges.slice(0, 1)];
    
    return {
      score: finalScore,
      color,
      badges: allBadges.slice(0, 3),
      details,
      avgGI,
      avgHarm,
      rawAvgHarm: harmReduction > 0 ? rawAvgHarm : undefined,
      harmReduction: harmReduction > 0 ? harmReduction : undefined,
      fiber,
      bonusPoints,
      // Научные данные
      mealGL: Math.round(mealGL * 10) / 10,
      glLevel: glBonus.level,
      circadianPeriod: circadian.period,
      circadianBonus: circadian.bonus,
      liquidRatio: Math.round(liquidRatio * 100),
      // Activity context
      activityContext: activityContext || undefined
    };
  }

  // showMealQualityDetails удалена - используется mealQualityPopup state

  // === MealAddProduct Component (extracted for stable identity) ===
  const MealAddProduct = React.memo(function MealAddProduct({
    mi,
    products,
    date,
    day,
    setDay,
    isCurrentMeal = false
  }) {
    const handleOpenModal = React.useCallback(() => {
      try { navigator.vibrate?.(10); } catch(e) {}
      
      const meal = day?.meals?.[mi] || {};

      if (window.HEYS?.AddProductStep?.show) {
        window.HEYS.AddProductStep.show({
          mealIndex: mi,
          mealPhotos: meal.photos || [], // Текущие фото для счётчика
          products,
          dateKey: date,
          onAdd: ({ product, grams, mealIndex }) => {
            // 🔍 DEBUG: Подробный лог при добавлении продукта в meal
            const hasNutrients = !!(product?.kcal100 || product?.protein100 || product?.carbs100);
            console.log('[DayTab] onAdd received:', product?.name, 'grams:', grams, {
              id: product?.id,
              hasNutrients,
              kcal100: product?.kcal100,
              protein100: product?.protein100,
              mealIndex
            });
            if (!hasNutrients) {
              console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', product);
            }
            
            const productId = product.id ?? product.product_id ?? product.name;
            const newItem = {
              id: uid('it_'),
              product_id: product.id ?? product.product_id,
              name: product.name,
              grams: grams || 100,
              // Для новых продуктов сохраняем нутриенты напрямую (fallback если продукт не в индексе)
              ...(product.kcal100 !== undefined && {
                kcal100: product.kcal100,
                protein100: product.protein100,
                carbs100: product.carbs100,
                fat100: product.fat100,
                simple100: product.simple100,
                complex100: product.complex100,
                badFat100: product.badFat100,
                goodFat100: product.goodFat100,
                trans100: product.trans100,
                fiber100: product.fiber100,
                gi: product.gi,
                harmScore: product.harmScore
              })
            };
            
            // 🔍 DEBUG: Проверка финального newItem
            const itemHasNutrients = !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100);
            console.log('[DayTab] newItem created:', newItem.name, {
              itemHasNutrients,
              kcal100: newItem.kcal100,
              protein100: newItem.protein100,
              productKcal100: product.kcal100,
              spreadCondition: product.kcal100 !== undefined
            });
            if (!itemHasNutrients) {
              console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
                newItem,
                product,
                spreadCondition: product.kcal100 !== undefined
              });
            }
            
            setDay((prevDay = {}) => {
              const meals = (prevDay.meals || []).map((m, i) =>
                i === mealIndex
                  ? { ...m, items: [...(m.items || []), newItem] }
                  : m
              );
              return { ...prevDay, meals, updatedAt: Date.now() };
            });

            try { navigator.vibrate?.(10); } catch(e) {}

            window.dispatchEvent(new CustomEvent('heysProductAdded', {
              detail: { product, grams }
            }));

            try {
              U.lsSet(`heys_last_grams_${productId}`, grams);
              const history = U.lsGet('heys_grams_history', {});
              if (!history[productId]) history[productId] = [];
              history[productId].push(grams);
              if (history[productId].length > 20) history[productId].shift();
              U.lsSet('heys_grams_history', history);
            } catch(e) {}
          },
          onAddPhoto: async ({ mealIndex, photo, filename, timestamp }) => {
            // Проверяем лимит фото (10 на приём)
            const meal = day?.meals?.[mealIndex];
            const currentPhotos = meal?.photos?.length || 0;
            if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
              alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
              return;
            }
            
            // Получаем данные для загрузки
            const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
            const mealId = meal?.id || uid('meal_');
            const photoId = uid('photo_');
            
            // Пытаемся загрузить в облако
            let photoData = {
              id: photoId,
              data: photo, // Временно храним base64 для отображения
              filename,
              timestamp,
              pending: true,
              uploading: true, // Индикатор загрузки
              uploaded: false
            };
            
            // Сначала добавляем в UI (для мгновенного отображения)
            setDay((prevDay = {}) => {
              const meals = (prevDay.meals || []).map((m, i) =>
                i === mealIndex
                  ? { 
                      ...m, 
                      photos: [...(m.photos || []), photoData] 
                    }
                  : m
              );
              return { ...prevDay, meals, updatedAt: Date.now() };
            });
            
            console.log('[HEYS] Photo added to meal', mealIndex, '(pending upload)');
            try { navigator.vibrate?.(10); } catch(e) {}
            
            // Асинхронно загружаем в облако
            if (HEYS.cloud?.uploadPhoto) {
              try {
                const result = await HEYS.cloud.uploadPhoto(photo, clientId, date, mealId);
                
                if (result?.uploaded && result?.url) {
                  // Успешно загружено — обновляем фото в состоянии
                  setDay((prevDay = {}) => {
                    const meals = (prevDay.meals || []).map((m, i) => {
                      if (i !== mealIndex || !m.photos) return m;
                      return {
                        ...m,
                        photos: m.photos.map(p => 
                          p.id === photoId 
                            ? { ...p, url: result.url, data: undefined, pending: false, uploading: false, uploaded: true }
                            : p
                        )
                      };
                    });
                    return { ...prevDay, meals, updatedAt: Date.now() };
                  });
                  console.log('[HEYS] Photo uploaded to cloud:', result.url);
                } else if (result?.pending) {
                  // Сохранено для загрузки позже (offline)
                  setDay((prevDay = {}) => {
                    const meals = (prevDay.meals || []).map((m, i) => {
                      if (i !== mealIndex || !m.photos) return m;
                      return {
                        ...m,
                        photos: m.photos.map(p => 
                          p.id === photoId 
                            ? { ...p, uploading: false }
                            : p
                        )
                      };
                    });
                    return { ...prevDay, meals, updatedAt: Date.now() };
                  });
                  console.log('[HEYS] Photo saved for later upload (offline)');
                }
              } catch (e) {
                // Убираем флаг uploading при ошибке
                setDay((prevDay = {}) => {
                  const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex || !m.photos) return m;
                    return {
                      ...m,
                      photos: m.photos.map(p => 
                        p.id === photoId 
                          ? { ...p, uploading: false }
                          : p
                      )
                    };
                  });
                  return { ...prevDay, meals, updatedAt: Date.now() };
                });
                console.warn('[HEYS] Photo upload failed, will retry later:', e);
              }
            }
          },
          onNewProduct: () => {
            if (window.HEYS?.products?.showAddModal) {
              window.HEYS.products.showAddModal();
            }
          }
        });
      } else {
        console.error('[HEYS] AddProductStep not loaded');
      }
    }, [mi, products, date, day, setDay]);

    return React.createElement('button', {
      className: 'aps-open-btn' + (isCurrentMeal ? ' aps-open-btn--current' : ''),
      onClick: handleOpenModal,
      'aria-label': 'Добавить продукт'
    },
      React.createElement('span', { className: 'aps-open-icon' }, '🔍'),
      React.createElement('span', { className: 'aps-open-text' }, 'Добавить')
    );
  }, (prev, next) => {
    if (prev.mi !== next.mi) return false;
    if (prev.products !== next.products) return false;

    const prevItems = prev.day?.meals?.[prev.mi]?.items;
    const nextItems = next.day?.meals?.[next.mi]?.items;
    if (prevItems !== nextItems) return false;

    return true;
  });

  const MEAL_HEADER_META = [
    {label:''},
    {label:'г'},
    {label:'ккал<br>/100', per100:true},
    {label:'У<br>/100', per100:true},
    {label:'Прост<br>/100', per100:true},
    {label:'Сл<br>/100', per100:true},
    {label:'Б<br>/100', per100:true},
    {label:'Ж<br>/100', per100:true},
    {label:'ВрЖ<br>/100', per100:true},
    {label:'ПолЖ<br>/100', per100:true},
    {label:'СупЖ<br>/100', per100:true},
    {label:'Клет<br>/100', per100:true},
    {label:'ккал'},
    {label:'У'},
    {label:'Прост'},
    {label:'Сл'},
    {label:'Б'},
    {label:'Ж'},
    {label:'ВрЖ'},
    {label:'ПолЖ'},
    {label:'СупЖ'},
    {label:'Клет'},
    {label:'ГИ'},
    {label:'Вред'},
    {label:''}
  ];

  function fmtVal(key, v){
    const num=+v||0;
    if(!num) return '-';
    if(key==='harm') return Math.round(num*10)/10; // вредность с одной десятичной
    return Math.round(num); // всё остальное до целых
  }

  const ProductRow = React.memo(function ProductRow({
    item,
    mealIndex,
    isNew,
    pIndex,
    setGrams,
    removeItem
  }) {
    const p = getProductFromItem(item, pIndex) || { name: item.name || '?' };
    const grams = +item.grams || 0;
    const per = per100(p);
    const row = {
      kcal: scale(per.kcal100, grams),
      carbs: scale(per.carbs100, grams),
      simple: scale(per.simple100, grams),
      complex: scale(per.complex100, grams),
      prot: scale(per.prot100, grams),
      fat: scale(per.fat100, grams),
      bad: scale(per.bad100, grams),
      good: scale(per.good100, grams),
      trans: scale(per.trans100, grams),
      fiber: scale(per.fiber100, grams)
    };
    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
    const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
    return React.createElement('tr',{ 'data-new': isNew ? 'true' : 'false'},
      React.createElement('td',{'data-cell':'name'},p.name),
      React.createElement('td',{'data-cell':'grams'},React.createElement('input',{
        type:'number',
        value:grams,
        'data-grams-input': true,
        'data-meal-index': mealIndex,
        'data-item-id': item.id,
        onChange:e=>setGrams(mealIndex,item.id,e.target.value),
        onKeyDown:e=>{
          if(e.key==='Enter') {
            e.target.blur(); // Убрать фокус после подтверждения
          }
        },
        onFocus:e=>e.target.select(), // Выделить текст при фокусе
        placeholder:'грамм',
        style:{textAlign:'center'}
      })),
      React.createElement('td',{'data-cell':'per100'},fmtVal('kcal100', per.kcal100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('carbs100', per.carbs100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('simple100', per.simple100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('complex100', per.complex100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('prot100', per.prot100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('fat100', per.fat100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('bad', per.bad100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('good100', per.good100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('trans100', per.trans100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('fiber100', per.fiber100)),
      React.createElement('td',{'data-cell':'kcal'},fmtVal('kcal', row.kcal)),
      React.createElement('td',{'data-cell':'carbs'},fmtVal('carbs', row.carbs)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('simple', row.simple)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('complex', row.complex)),
      React.createElement('td',{'data-cell':'prot'},fmtVal('prot', row.prot)),
      React.createElement('td',{'data-cell':'fat'},fmtVal('fat', row.fat)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('bad', row.bad)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('good', row.good)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('trans', row.trans)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('fiber', row.fiber)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('gi', giVal)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('harm', harmVal)),
      React.createElement('td',{'data-cell':'delete'},React.createElement('button',{className:'btn secondary',onClick:()=>removeItem(mealIndex,item.id)},'×'))
    );
  });

  // === MealOptimizerSection — отдельный компонент для правильной работы хуков ===
  const MealOptimizerSection = React.memo(function MealOptimizerSection({ meal, totals, dayData, profile, products, pIndex, mealIndex, addProductToMeal }) {
    const MO = HEYS.MealOptimizer;
    const [optExpanded, setOptExpanded] = React.useState(false);
    // Debounce state для отложенного рендера рекомендаций
    const [debouncedMeal, setDebouncedMeal] = React.useState(meal);
    
    // Guard: пустой приём — не показывать
    if (!meal?.items?.length) return null;
    
    // Debounce: обновляем meal с задержкой 300ms
    React.useEffect(() => {
      const timer = setTimeout(() => setDebouncedMeal(meal), 300);
      return () => clearTimeout(timer);
    }, [meal]);
    
    // Получаем рекомендации с debounced meal
    const recommendations = React.useMemo(() => {
      if (!MO) return [];
      return MO.getMealOptimization({
        meal: debouncedMeal,
        mealTotals: totals,
        dayData,
        profile,
        products,
        pIndex,
        avgGI: totals?.gi || 50
      });
    }, [debouncedMeal, totals, dayData, profile, products, pIndex]);
    
    // Фильтруем скрытые, дедуплицируем и сортируем по приоритету
    const visibleRecs = React.useMemo(() => {
      if (!MO) return [];
      const filtered = recommendations.filter(r => !MO.shouldHideRecommendation(r.id));
      
      // Дедупликация: убираем дубли по title (оставляем с большим priority)
      const seen = new Map();
      filtered.forEach(r => {
        const key = r.title.toLowerCase().trim();
        if (!seen.has(key) || (seen.get(key).priority || 0) < (r.priority || 0)) {
          seen.set(key, r);
        }
      });
      const deduped = Array.from(seen.values());
      
      // Сортируем: сначала warnings, потом по наличию продуктов, потом по priority
      return deduped.sort((a, b) => {
        if (a.isWarning && !b.isWarning) return -1;
        if (!a.isWarning && b.isWarning) return 1;
        const aHasProds = (a.products?.length || 0) > 0 ? 1 : 0;
        const bHasProds = (b.products?.length || 0) > 0 ? 1 : 0;
        if (aHasProds !== bHasProds) return bHasProds - aHasProds;
        return (b.priority || 50) - (a.priority || 50);
      });
    }, [recommendations]);
    
    const handleAddProduct = React.useCallback((product, ruleId) => {
      if (!addProductToMeal || !product || !MO) return;
      
      const portion = MO.getSmartPortion(product);
      const productWithGrams = { ...product, grams: portion.grams };
      
      addProductToMeal(mealIndex, productWithGrams);
      
      MO.trackUserAction({
        type: 'accept',
        ruleId,
        productId: product.id,
        productName: product.name
      });
    }, [addProductToMeal, mealIndex]);
    
    const handleDismiss = React.useCallback((ruleId) => {
      if (!MO) return;
      MO.trackUserAction({
        type: 'dismiss',
        ruleId
      });
    }, []);
    
    if (visibleRecs.length === 0) return null;
    
    // Лучшая рекомендация для превью
    const bestRec = visibleRecs[0];
    // Остальные для раскрытия (без дублирования первой)
    const restRecs = visibleRecs.slice(1);
    
    return React.createElement('div', {
      className: 'meal-optimizer' + (optExpanded ? ' meal-optimizer--expanded' : '')
    },
      // Header — содержит главный совет
      React.createElement('div', {
        className: 'meal-optimizer__header',
        onClick: () => restRecs.length > 0 && setOptExpanded(!optExpanded)
      },
        // Иконка совета
        React.createElement('span', { className: 'meal-optimizer__header-icon' }, bestRec.icon),
        // Текст совета
        React.createElement('div', { className: 'meal-optimizer__header-text' },
          React.createElement('div', { className: 'meal-optimizer__header-title' }, bestRec.title),
          React.createElement('div', { className: 'meal-optimizer__header-reason' }, bestRec.reason)
        ),
        // Правая часть: бейдж + стрелка
        React.createElement('div', { className: 'meal-optimizer__header-right' },
          restRecs.length > 0 && React.createElement('span', { className: 'meal-optimizer__badge' }, 
            '+' + restRecs.length
          ),
          restRecs.length > 0 && React.createElement('span', { 
            className: 'meal-optimizer__toggle' + (optExpanded ? ' meal-optimizer__toggle--expanded' : '') 
          }, '▼'),
          React.createElement('button', { 
            className: 'meal-optimizer__dismiss',
            onClick: (e) => { e.stopPropagation(); handleDismiss(bestRec.id); },
            title: 'Скрыть'
          }, '×')
        )
      ),
      
      // Продукты главного совета — под хедером
      bestRec.products && bestRec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
        bestRec.products.map((prod, pIdx) => 
          React.createElement('button', {
            key: prod.id || pIdx,
            className: 'meal-optimizer__product',
            onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, bestRec.id); },
            title: `Добавить ${prod.name}`
          },
            React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
            prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
            React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
          )
        )
      ),
      
      // Остальные советы — по раскрытию (БЕЗ первого)
      optExpanded && restRecs.length > 0 && React.createElement('div', { className: 'meal-optimizer__content' },
        restRecs.map((rec) => 
          React.createElement('div', { 
            key: rec.id,
            className: 'meal-optimizer__item' + 
              (rec.isWarning ? ' meal-optimizer__item--warning' : '') +
              (rec.isInfo ? ' meal-optimizer__item--info' : '')
          },
            React.createElement('div', { className: 'meal-optimizer__item-header' },
              React.createElement('span', { className: 'meal-optimizer__item-icon' }, rec.icon),
              React.createElement('div', { className: 'meal-optimizer__item-content' },
                React.createElement('div', { className: 'meal-optimizer__item-title' }, rec.title),
                React.createElement('div', { className: 'meal-optimizer__item-reason' }, rec.reason),
                rec.science && React.createElement('div', { className: 'meal-optimizer__item-science' }, rec.science)
              ),
              React.createElement('button', { 
                className: 'meal-optimizer__item-dismiss',
                onClick: (e) => { e.stopPropagation(); handleDismiss(rec.id); },
                title: 'Больше не показывать'
              }, '×')
            ),
            
            // Продукты для добавления
            rec.products && rec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
              rec.products.map((prod, pIdx) => 
                React.createElement('button', {
                  key: prod.id || pIdx,
                  className: 'meal-optimizer__product',
                  onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, rec.id); },
                  title: `Добавить ${prod.name}`
                },
                  React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                  prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                  React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                )
              )
            )
          )
        )
      )
    );
  });

  const MealCard = React.memo(function MealCard({
    meal,
    mealIndex,
    displayIndex,
    products,
    pIndex,
    date,
    setDay,
    isMobile,
    isExpanded,
    onToggleExpand,
    onChangeMealType,
    onChangeTime,
    onChangeMood,
    onChangeWellbeing,
    onChangeStress,
    onRemoveMeal,
    openEditGramsModal,
    openTimeEditor,
    openMoodEditor,
    setGrams,
    removeItem,
    isMealStale,
    allMeals,
    isNewItem,
    optimum,
    setMealQualityPopup,
    addProductToMeal,
    dayData,
    profile
  }) {
    const headerMeta = MEAL_HEADER_META;
    function mTotals(m){
      const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0});
      let gSum=0, giSum=0, harmSum=0; (m.items||[]).forEach(it=>{ const p=getProductFromItem(it,pIndex); if(!p)return; const g=+it.grams||0; if(!g)return; const gi=p.gi??p.gi100??p.GI??p.giIndex; const harm=p.harm??p.harmScore??p.harm100??p.harmPct; gSum+=g; if(gi!=null) giSum+=gi*g; if(harm!=null) harmSum+=harm*g; }); t.gi=gSum?giSum/gSum:0; t.harm=gSum?harmSum/gSum:0; return t; }
    const totals=mTotals(meal);
    const manualType = meal.mealType;
    const autoTypeInfo = getMealType(mealIndex, meal, allMeals, pIndex);
    const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType] 
      ? { type: manualType, ...U.MEAL_TYPES[manualType] }
      : autoTypeInfo;
    
    const changeMealType = (newType) => {
      onChangeMealType(mealIndex, newType);
    };
    const timeDisplay = U.formatMealTime ? U.formatMealTime(meal.time) : (meal.time || '');
    const mealKcal = Math.round(totals.kcal || 0);
    const isStale = isMealStale(meal);
    const isCurrentMeal = displayIndex === 0 && !isStale;
    
    // Вычисляем activityContext для этого приёма (для harmMultiplier)
    const mealActivityContext = React.useMemo(() => {
      if (!HEYS.InsulinWave?.calculateActivityContext) return null;
      if (!dayData?.trainings || dayData.trainings.length === 0) return null;
      if (!meal?.time || !meal?.items?.length) return null;
      
      const mealTotals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
      return HEYS.InsulinWave.calculateActivityContext({
        mealTime: meal.time,
        mealKcal: mealTotals.kcal || 0,
        trainings: dayData.trainings,
        householdMin: dayData.householdMin || 0,
        steps: dayData.steps || 0,
        allMeals: allMeals
      });
    }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, pIndex]);
    
    // Вычисляем качество приёма для цветной линии слева
    const mealQuality = React.useMemo(() => {
      if (!meal?.items || meal.items.length === 0) return null;
      return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
    }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);
    
    // Цвет линии качества
    const qualityLineColor = mealQuality 
      ? mealQuality.color 
      : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');
    
    const mealCardClass = isCurrentMeal ? 'card tone-green meal-card meal-card--current' : 'card tone-slate meal-card';
    const mealCardStyle = {
      marginTop: '8px', 
      width: '100%',
      position: 'relative',
      paddingLeft: '12px',
      ...(isCurrentMeal ? { 
        border: '2px solid #22c55e', 
        boxShadow: '0 4px 12px rgba(34,197,94,0.25)' 
      } : {})
    };
    const computeDerivedProductFn = M.computeDerivedProduct || ((prod) => prod || {});

    // === Инсулиновая волна в карточке приёма ===
    const InsulinWave = HEYS.InsulinWave || {};
    const IWUtils = InsulinWave.utils || {};
    const insulinWaveData = HEYS.insulinWaveData || {};
    const waveHistorySorted = React.useMemo(() => {
      const list = insulinWaveData.waveHistory || [];
      // Сортировка по времени приёма (используем normalizeToHeysDay, день = 03:00→03:00)
      if (!IWUtils.normalizeToHeysDay) return [...list].sort((a, b) => a.startMin - b.startMin);
      return [...list].sort((a, b) => IWUtils.normalizeToHeysDay(a.startMin) - IWUtils.normalizeToHeysDay(b.startMin));
    }, [insulinWaveData.waveHistory]);

    const currentWaveIndex = React.useMemo(() => waveHistorySorted.findIndex(w => w.time === meal.time), [waveHistorySorted, meal.time]);
    const currentWave = currentWaveIndex >= 0 ? waveHistorySorted[currentWaveIndex] : null;
    const prevWave = currentWaveIndex > 0 ? waveHistorySorted[currentWaveIndex - 1] : null;
    const nextWave = (currentWaveIndex >= 0 && currentWaveIndex < waveHistorySorted.length - 1) ? waveHistorySorted[currentWaveIndex + 1] : null;
    const hasOverlapWithNext = currentWave && nextWave ? currentWave.endMin > nextWave.startMin : false;
    const hasOverlapWithPrev = currentWave && prevWave ? prevWave.endMin > currentWave.startMin : false;
    const hasAnyOverlap = hasOverlapWithNext || hasOverlapWithPrev;
    const lipolysisGapNext = currentWave && nextWave ? Math.max(0, nextWave.startMin - currentWave.endMin) : 0;
    const overlapMinutes = hasOverlapWithNext
      ? currentWave.endMin - nextWave.startMin
      : hasOverlapWithPrev
        ? prevWave.endMin - currentWave.startMin
        : 0;
    const [waveExpanded, setWaveExpanded] = React.useState(true);
    const isCurrentActiveMeal = !!(currentWave && currentWave.isActive);
    const showWaveButton = !!(currentWave && meal.time && (meal.items || []).length > 0);
    const formatMinutes = React.useCallback((mins) => {
      if (IWUtils.formatDuration) return IWUtils.formatDuration(mins);
      return `${Math.max(0, Math.round(mins))}м`;
    }, [IWUtils.formatDuration]);

    const toggleWave = React.useCallback(() => {
      const newState = !waveExpanded;
      setWaveExpanded(newState);
      if (HEYS.dayUtils?.haptic) HEYS.dayUtils.haptic('light');
      if (HEYS.analytics?.trackDataOperation) {
        HEYS.analytics.trackDataOperation('insulin_wave_meal_expand', {
          action: newState ? 'open' : 'close',
          hasOverlap: hasAnyOverlap,
          overlapMinutes,
          lipolysisGap: lipolysisGapNext,
          mealIndex
        });
      }
    }, [waveExpanded, hasAnyOverlap, overlapMinutes, lipolysisGapNext, mealIndex]);
    
    // Helper functions для эмодзи оценок (как в тренировках)
    const getMoodEmoji = (v) => 
      v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
    const getWellbeingEmoji = (v) => 
      v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
    const getStressEmoji = (v) => 
      v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';
    
    const moodVal = +meal.mood || 0;
    const wellbeingVal = +meal.wellbeing || 0;
    const stressVal = +meal.stress || 0;
    const moodEmoji = getMoodEmoji(moodVal);
    const wellbeingEmoji = getWellbeingEmoji(wellbeingVal);
    const stressEmoji = getStressEmoji(stressVal);
    const hasRatings = moodVal > 0 || wellbeingVal > 0 || stressVal > 0;

    return React.createElement('div',{className: mealCardClass, 'data-meal-index': mealIndex, style: mealCardStyle},
      // Вертикальная линия качества слева
      qualityLineColor !== 'transparent' && React.createElement('div', {
        className: 'meal-quality-line',
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          borderRadius: '12px 0 0 12px',
          background: qualityLineColor,
          transition: 'background 0.3s ease'
        }
      }),
      // Заголовок приёма ВНУТРИ карточки: время слева, тип по центру, калории справа (ОДНА СТРОКА)
      // Фон шапки — цвет качества с 12% прозрачностью
      React.createElement('div',{className:'meal-header-inside meal-type-' + mealTypeInfo.type, style: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        gap: '8px',
        background: qualityLineColor !== 'transparent' 
          ? qualityLineColor + '1F' // 12% opacity (1F = 31/255)
          : undefined,
        borderRadius: '10px 10px 0 0',
        margin: '-12px -12px 8px -4px',
        padding: '12px 16px 12px 8px'
      }},
        // Время слева (крупное)
        timeDisplay && React.createElement('span', { 
          className: 'meal-time-badge-inside',
          onClick: () => openTimeEditor(mealIndex),
          title: 'Изменить время',
          style: { fontSize: '15px', padding: '6px 14px', fontWeight: '700', flexShrink: 0 }
        }, timeDisplay),
        // Тип приёма по центру (кликабельный dropdown)
        React.createElement('div', { className: 'meal-type-wrapper', style: { flex: 1, display: 'flex', justifyContent: 'center' } },
          // Текущий тип (иконка + название) — кликабельный
          React.createElement('span', { className: 'meal-type-label', style: { fontSize: '16px', fontWeight: '700', padding: '4px 12px' } }, 
            mealTypeInfo.icon + ' ' + mealTypeInfo.name,
            // Индикатор dropdown
            React.createElement('span', { className: 'meal-type-arrow' }, ' ▾')
          ),
          // Скрытый select поверх
          React.createElement('select', {
            className: 'meal-type-select',
            value: manualType || '',
            onChange: (e) => {
              changeMealType(e.target.value || null);
            },
            title: 'Изменить тип приёма'
          }, [
            { value: '', label: '🔄 Авто' },
            { value: 'breakfast', label: '🍳 Завтрак' },
            { value: 'snack1', label: '🍎 Перекус' },
            { value: 'lunch', label: '🍲 Обед' },
            { value: 'snack2', label: '🥜 Перекус' },
            { value: 'dinner', label: '🍽️ Ужин' },
            { value: 'snack3', label: '🧀 Перекус' },
            { value: 'night', label: '🌙 Ночной' }
          ].map(opt => 
            React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
          ))
        ),
        // Калории справа (крупное)
        React.createElement('span', { className: 'meal-kcal-badge-inside', style: { fontSize: '15px', padding: '6px 14px', flexShrink: 0 } }, 
          mealKcal > 0 ? (mealKcal + ' ккал') : '0 ккал'
        ),
        // 🆕 v3.4.0: Activity Context badge (если есть)
        currentWave && currentWave.activityContext && React.createElement('span', {
          className: 'activity-context-badge',
          title: currentWave.activityContext.desc,
          style: {
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '8px',
            background: currentWave.activityContext.type === 'peri' ? '#22c55e33' :
                        currentWave.activityContext.type === 'post' ? '#3b82f633' :
                        currentWave.activityContext.type === 'pre' ? '#eab30833' :
                        '#6b728033',
            color: currentWave.activityContext.type === 'peri' ? '#16a34a' :
                   currentWave.activityContext.type === 'post' ? '#2563eb' :
                   currentWave.activityContext.type === 'pre' ? '#ca8a04' :
                   '#374151',
            fontWeight: '600',
            flexShrink: 0,
            marginLeft: '4px',
            whiteSpace: 'nowrap'
          }
        }, currentWave.activityContext.badge || '')
      ),
      // 🆕 v3.5.0: Smart Training Hint — контекстная подсказка при добавлении еды
      mealActivityContext && mealActivityContext.type !== 'none' && (meal.items || []).length === 0 && 
        React.createElement('div', {
          className: 'training-context-hint',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            margin: '0 -4px 8px -4px',
            borderRadius: '8px',
            fontSize: '13px',
            lineHeight: '1.4',
            background: mealActivityContext.type === 'peri' ? 'linear-gradient(135deg, #22c55e15, #22c55e25)' :
                        mealActivityContext.type === 'post' ? 'linear-gradient(135deg, #3b82f615, #3b82f625)' :
                        mealActivityContext.type === 'pre' ? 'linear-gradient(135deg, #eab30815, #eab30825)' :
                        'linear-gradient(135deg, #6b728015, #6b728025)',
            border: mealActivityContext.type === 'peri' ? '1px solid #22c55e40' :
                    mealActivityContext.type === 'post' ? '1px solid #3b82f640' :
                    mealActivityContext.type === 'pre' ? '1px solid #eab30840' :
                    '1px solid #6b728040',
            color: mealActivityContext.type === 'peri' ? '#16a34a' :
                   mealActivityContext.type === 'post' ? '#2563eb' :
                   mealActivityContext.type === 'pre' ? '#ca8a04' :
                   '#374151'
          }
        },
          React.createElement('span', { style: { fontSize: '18px' } }, mealActivityContext.badge || '🏋️'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } }, 
              mealActivityContext.type === 'peri' ? '🔥 Топливо для тренировки!' :
              mealActivityContext.type === 'post' ? '💪 Анаболическое окно!' :
              mealActivityContext.type === 'pre' ? '⚡ Скоро тренировка!' :
              mealActivityContext.type === 'steps' ? '👟 Активный день!' :
              mealActivityContext.type === 'double' ? '🏆 Двойная тренировка!' :
              '🎯 Хорошее время!'
            ),
            React.createElement('div', { style: { opacity: 0.85, fontSize: '12px' } }, 
              mealActivityContext.type === 'peri' ? 'Еда пойдёт в энергию, а не в жир. Вред снижен на ' + Math.round((1 - (mealActivityContext.harmMultiplier || 1)) * 100) + '%' :
              mealActivityContext.type === 'post' ? 'Нутриенты усвоятся в мышцы. Отличное время для белка!' :
              mealActivityContext.type === 'pre' ? 'Лёгкие углеводы дадут энергию для тренировки' :
              mealActivityContext.type === 'steps' ? 'Высокая активность улучшает метаболизм' :
              mealActivityContext.type === 'double' ? 'Двойная нагрузка — можно есть смелее!' :
              'Инсулиновая волна будет короче'
            )
          )
        ),
      // MOBILE: Meal totals at top (before search)
      (meal.items || []).length > 0 && React.createElement('div', { className: 'mpc-totals-wrap mobile-only' },
        React.createElement('div', { className: 'mpc-grid mpc-header' },
          React.createElement('span', null, 'ккал'),
          React.createElement('span', null, 'У'),
          React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
          React.createElement('span', null, 'Б'),
          React.createElement('span', null, 'Ж'),
          React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
          React.createElement('span', null, 'Кл'),
          React.createElement('span', null, 'ГИ'),
          React.createElement('span', null, 'Вр')
        ),
        React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
          React.createElement('span', { title: getNutrientTooltip('kcal', totals.kcal, totals), style: { color: getNutrientColor('kcal', totals.kcal, totals), fontWeight: getNutrientColor('kcal', totals.kcal, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.kcal)),
          React.createElement('span', { title: getNutrientTooltip('carbs', totals.carbs, totals), style: { color: getNutrientColor('carbs', totals.carbs, totals), fontWeight: getNutrientColor('carbs', totals.carbs, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.carbs)),
          React.createElement('span', { className: 'mpc-dim' }, 
            React.createElement('span', { title: getNutrientTooltip('simple', totals.simple, totals), style: { color: getNutrientColor('simple', totals.simple, totals), fontWeight: getNutrientColor('simple', totals.simple, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.simple || 0)),
            '/',
            React.createElement('span', { title: getNutrientTooltip('complex', totals.complex, totals), style: { color: getNutrientColor('complex', totals.complex, totals), cursor: 'help' } }, Math.round(totals.complex || 0))
          ),
          React.createElement('span', { title: getNutrientTooltip('prot', totals.prot, totals), style: { color: getNutrientColor('prot', totals.prot, totals), fontWeight: getNutrientColor('prot', totals.prot, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.prot)),
          React.createElement('span', { title: getNutrientTooltip('fat', totals.fat, totals), style: { color: getNutrientColor('fat', totals.fat, totals), fontWeight: getNutrientColor('fat', totals.fat, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fat)),
          React.createElement('span', { className: 'mpc-dim' }, 
            React.createElement('span', { title: getNutrientTooltip('bad', totals.bad, totals), style: { color: getNutrientColor('bad', totals.bad, totals), fontWeight: getNutrientColor('bad', totals.bad, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.bad || 0)),
            '/',
            React.createElement('span', { title: getNutrientTooltip('good', totals.good, totals), style: { color: getNutrientColor('good', totals.good, totals), fontWeight: getNutrientColor('good', totals.good, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.good || 0)),
            '/',
            React.createElement('span', { title: getNutrientTooltip('trans', totals.trans, totals), style: { color: getNutrientColor('trans', totals.trans, totals), fontWeight: getNutrientColor('trans', totals.trans, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.trans || 0))
          ),
          React.createElement('span', { title: getNutrientTooltip('fiber', totals.fiber, totals), style: { color: getNutrientColor('fiber', totals.fiber, totals), fontWeight: getNutrientColor('fiber', totals.fiber, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fiber || 0)),
          React.createElement('span', { title: getNutrientTooltip('gi', totals.gi, totals), style: { color: getNutrientColor('gi', totals.gi, totals), fontWeight: getNutrientColor('gi', totals.gi, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.gi || 0)),
          React.createElement('span', { title: getNutrientTooltip('harm', totals.harm, totals), style: { color: getNutrientColor('harm', totals.harm, totals), fontWeight: getNutrientColor('harm', totals.harm, totals) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', totals.harm || 0))
        )
      ),
      React.createElement('div',{className:'row desktop-add-product',style:{justifyContent:'space-between',alignItems:'center'}},
        React.createElement('div',{className:'section-title'},'Добавить продукт'),
        React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal })
      ),
      React.createElement('div',{style:{overflowX:'auto',marginTop:'8px'}}, React.createElement('table',{className:'tbl meals-table'},
        React.createElement('thead',null,React.createElement('tr',null, headerMeta.map((h,i)=>React.createElement('th',{
            key:'h'+i,
            className: h.per100? 'per100-col': undefined,
            dangerouslySetInnerHTML:{__html:h.label}
          }))
        )),
        React.createElement('tbody',null,
          (meal.items||[]).map(it => React.createElement(ProductRow, {
            key: it.id,
            item: it,
            mealIndex,
            isNew: isNewItem(it.id),
            pIndex,
            setGrams,
            removeItem
          })),
          React.createElement('tr',{className:'tr-sum'},
            React.createElement('td',{className:'fw-600'},''),
            React.createElement('td',null,''),
            React.createElement('td',{colSpan:10},React.createElement('div',{className:'table-divider'})),
            React.createElement('td',null,fmtVal('kcal', totals.kcal)),
            React.createElement('td',null,fmtVal('carbs', totals.carbs)),
            React.createElement('td',null,fmtVal('simple', totals.simple)),
            React.createElement('td',null,fmtVal('complex', totals.complex)),
            React.createElement('td',null,fmtVal('prot', totals.prot)),
            React.createElement('td',null,fmtVal('fat', totals.fat)),
            React.createElement('td',null,fmtVal('bad', totals.bad)),
            React.createElement('td',null,fmtVal('good', totals.good)),
            React.createElement('td',null,fmtVal('trans', totals.trans)),
            React.createElement('td',null,fmtVal('fiber', totals.fiber)),
            React.createElement('td',null,fmtVal('gi', totals.gi)),
            React.createElement('td',null,fmtVal('harm', totals.harm)),
            React.createElement('td',null,'')
          )
        )
      )),
      // MOBILE CARDS — компактный вид с grid-сеткой (collapsible)
        React.createElement('div', { className: 'mobile-products-list' },
          // Ряд: toggle + добавить (если есть продукты) или только добавить (если пусто)
          React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
            // Toggle (только если есть продукты)
            (meal.items || []).length > 0 && React.createElement('div', { 
              className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
              onClick: () => onToggleExpand(mealIndex, allMeals)
            },
              React.createElement('span', { className: 'toggle-arrow' }, '›'),
              React.createElement('span', null, (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов'))
            ),
          // Кнопка добавить
          React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal })
        ),
        // Products list (shown when expanded)
        isExpanded && (meal.items || []).map(it => {
          const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
          const G = +it.grams || 0;
          const per = per100(p);
          const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
          const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
          
          // Контент карточки
          // Определяем цвет граммов
          const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';
          
          // Фон карточки по полезности: 0=зелёный(полезный), 5=голубой(средний), 10=красный(вредный)
          const getHarmBg = (h) => {
            if (h == null) return '#fff';
            // h: 0=полезный, 5=средний, 10=вредный
            if (h <= 1) return '#34d399';  // 0-1: насыщенный зелёный — полезный
            if (h <= 2) return '#6ee7b7';  // 2: зелёный
            if (h <= 3) return '#a7f3d0';  // 3: мятный
            if (h <= 4) return '#d1fae5';  // 4: светло-мятный
            if (h <= 5) return '#bae6fd';  // 5: голубой — средний
            if (h <= 6) return '#e0f2fe';  // 6: светло-голубой
            if (h <= 7) return '#fecaca';  // 7: светло-розовый
            if (h <= 8) return '#fee2e2';  // 8: розовый
            if (h <= 9) return '#fecdd3';  // 9: красноватый
            return '#f87171';              // 10: красный — вредный
          };
          const harmBg = getHarmBg(harmVal);
          
          // Бейдж полезности/вредности: 0=полезный, 10=вредный
          const getHarmBadge = (h) => {
            if (h == null) return null;
            if (h <= 2) return { emoji: '🌿', text: 'полезный', color: '#059669' };
            if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
            return null;
          };
          const harmBadge = getHarmBadge(harmVal);
          
          // Иконка категории продукта
          const getCategoryIcon = (cat) => {
            if (!cat) return null;
            const c = cat.toLowerCase();
            if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
            if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
            if (c.includes('рыб') || c.includes('морепр')) return '🐟';
            if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
            if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
            if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
            if (c.includes('яйц')) return '🥚';
            if (c.includes('орех') || c.includes('семеч')) return '🥜';
            if (c.includes('масл')) return '🫒';
            if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
            if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
            if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
            return '🍽️';
          };
          const categoryIcon = getCategoryIcon(p.category);
          
          // Поиск альтернативы с меньшей калорийностью в той же категории
          const findAlternative = (prod, allProducts) => {
            if (!prod.category || !allProducts || allProducts.length < 2) return null;
            const currentKcal = per.kcal100 || 0;
            if (currentKcal < 50) return null; // уже низкокалорийный
            
            const sameCategory = allProducts.filter(alt => 
              alt.category === prod.category && 
              alt.id !== prod.id &&
              (alt.kcal100 || computeDerivedProductFn(alt).kcal100) < currentKcal * 0.7 // на 30%+ меньше
            );
            if (sameCategory.length === 0) return null;
            
            // Берём самый низкокалорийный
            const best = sameCategory.reduce((a, b) => {
              const aKcal = a.kcal100 || computeDerivedProductFn(a).kcal100;
              const bKcal = b.kcal100 || computeDerivedProductFn(b).kcal100;
              return aKcal < bKcal ? a : b;
            });
            const bestKcal = best.kcal100 || computeDerivedProductFn(best).kcal100;
            const saving = Math.round((1 - bestKcal / currentKcal) * 100);
            return { name: best.name, saving };
          };
          const alternative = findAlternative(p, products);
          
          const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
            // Row 1: category icon + name + badge + grams
            React.createElement('div', { className: 'mpc-row1' },
              categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
              React.createElement('span', { className: 'mpc-name' }, p.name),
              harmBadge && React.createElement('span', { 
                className: 'mpc-badge',
                style: { color: harmBadge.color }
              }, harmBadge.emoji),
              // На мобильных — кнопка открывает модалку со слайдером
              React.createElement('button', {
                className: 'mpc-grams-btn ' + gramsClass,
                onClick: (e) => { e.stopPropagation(); openEditGramsModal(mealIndex, it.id, G, p); }
              }, G + 'г')
            ),
            // Row 2: header labels (grid)
            React.createElement('div', { className: 'mpc-grid mpc-header' },
              React.createElement('span', null, 'ккал'),
              React.createElement('span', null, 'У'),
              React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
              React.createElement('span', null, 'Б'),
              React.createElement('span', null, 'Ж'),
              React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
              React.createElement('span', null, 'Кл'),
              React.createElement('span', null, 'ГИ'),
              React.createElement('span', null, 'Вр')
            ),
            // Row 3: values (grid) - абсолютные значения в граммах с цветовой индикацией и tooltips
            (() => {
              const itemTotals = {
                kcal: scale(per.kcal100, G),
                carbs: scale(per.carbs100, G),
                simple: scale(per.simple100, G),
                complex: scale(per.complex100, G),
                prot: scale(per.prot100, G),
                fat: scale(per.fat100, G),
                bad: scale(per.bad100, G),
                good: scale(per.good100, G),
                trans: scale(per.trans100 || 0, G),
                fiber: scale(per.fiber100, G),
                gi: giVal || 0,
                harm: harmVal || 0
              };
              return React.createElement('div', { className: 'mpc-grid mpc-values' },
                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                React.createElement('span', { className: 'mpc-dim' },
                  React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                  '/',
                  React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex))
                ),
                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                React.createElement('span', { className: 'mpc-dim' },
                  React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                  '/',
                  React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                  '/',
                  React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans))
                ),
                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-')
              );
            })(),
            // Row 4: альтернатива (если есть)
            alternative && React.createElement('div', { className: 'mpc-alternative' },
              React.createElement('span', null, '💡 Замени на '),
              React.createElement('strong', null, alternative.name),
              React.createElement('span', null, ' — на ' + alternative.saving + '% меньше ккал')
            )
          );
          
          // На мобильных — оборачиваем в SwipeableRow
          if (isMobile && HEYS.SwipeableRow) {
            return React.createElement(HEYS.SwipeableRow, {
              key: it.id,
              onDelete: () => removeItem(mealIndex, it.id)
            }, cardContent);
          }
          
          // На десктопе — обычная карточка с кнопкой удаления
          return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
            React.createElement('div', { className: 'mpc-row1' },
              React.createElement('span', { className: 'mpc-name' }, p.name),
              React.createElement('input', {
                type: 'number',
                className: 'mpc-grams',
                value: G,
                onChange: e => setGrams(mealIndex, it.id, e.target.value),
                onFocus: e => e.target.select(),
                onKeyDown: e => { if (e.key === 'Enter') e.target.blur(); },
                'data-grams-input': true,
                'data-meal-index': mealIndex,
                'data-item-id': it.id,
                inputMode: 'decimal'
              }),
              React.createElement('button', {
                className: 'mpc-delete',
                onClick: () => removeItem(mealIndex, it.id)
              }, '×')
            ),
            React.createElement('div', { className: 'mpc-grid mpc-header' },
              React.createElement('span', null, 'ккал'),
              React.createElement('span', null, 'У'),
              React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
              React.createElement('span', null, 'Б'),
              React.createElement('span', null, 'Ж'),
              React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
              React.createElement('span', null, 'Кл'),
              React.createElement('span', null, 'ГИ'),
              React.createElement('span', null, 'Вр')
            ),
            (() => {
              const itemTotals = {
                kcal: scale(per.kcal100, G),
                carbs: scale(per.carbs100, G),
                simple: scale(per.simple100, G),
                complex: scale(per.complex100, G),
                prot: scale(per.prot100, G),
                fat: scale(per.fat100, G),
                bad: scale(per.bad100, G),
                good: scale(per.good100, G),
                trans: scale(per.trans100 || 0, G),
                fiber: scale(per.fiber100, G),
                gi: giVal || 0,
                harm: harmVal || 0
              };
              return React.createElement('div', { className: 'mpc-grid mpc-values' },
                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                React.createElement('span', { className: 'mpc-dim' },
                  React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                  '/',
                  React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex))
                ),
                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                React.createElement('span', { className: 'mpc-dim' },
                  React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                  '/',
                  React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                  '/',
                  React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans))
                ),
                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-')
              );
            })()
          );
        }),
        // Компактный блок: бейдж качества + оценки (время уже в заголовке)
        React.createElement('div', { className: 'meal-meta-row' },
          // Бейдж качества приёма (кликабельный для попапа)
          mealQuality && React.createElement('button', {
            className: 'meal-quality-badge',
            onClick: (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMealQualityPopup({
                meal,
                quality: mealQuality,
                mealTypeInfo,
                x: rect.left + rect.width / 2,
                y: rect.bottom + 8
              });
            },
            title: 'Качество приёма — нажми для деталей',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '12px',
              border: 'none',
              background: mealQuality.color + '20',
              color: mealQuality.color,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginRight: '8px',
              transition: 'transform 0.15s, box-shadow 0.15s'
            }
          },
            React.createElement('span', { style: { fontSize: '14px' } }, 
              mealQuality.score >= 80 ? '⭐' : mealQuality.score >= 50 ? '📊' : '⚠️'
            ),
            mealQuality.score
          ),
          // На мобильных — только кнопка редактирования оценок (время в заголовке)
          isMobile
            ? React.createElement('button', {
                className: 'mobile-mood-btn',
                onClick: () => openMoodEditor(mealIndex),
                title: 'Изменить оценки'
              },
                hasRatings ? React.createElement(React.Fragment, null,
                  moodEmoji && React.createElement('span', { className: 'meal-rating-mini mood' }, moodEmoji + ' ' + moodVal),
                  wellbeingEmoji && React.createElement('span', { className: 'meal-rating-mini wellbeing' }, wellbeingEmoji + ' ' + wellbeingVal),
                  stressEmoji && React.createElement('span', { className: 'meal-rating-mini stress' }, stressEmoji + ' ' + stressVal)
                ) : React.createElement('span', { className: 'meal-rating-empty' }, '+ оценки')
              )
            // На десктопе — время + inputs для оценок
            : React.createElement(React.Fragment, null,
                React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: e => onChangeTime(mealIndex, e.target.value) }),
                React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: e => onChangeMood(mealIndex, +e.target.value || '') })),
                React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: e => onChangeWellbeing(mealIndex, +e.target.value || '') })),
                React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: e => onChangeStress(mealIndex, +e.target.value || '') }))
              ),
          React.createElement('button', { className: 'meal-delete-btn', onClick: () => onRemoveMeal(mealIndex), title: 'Удалить приём' }, '🗑')
        ),
        
        // Фотографии приёма (если есть)
        (meal.photos && meal.photos.length > 0) && React.createElement('div', { className: 'meal-photos' },
          meal.photos.map((photo, photoIndex) => {
            // Используем url если загружено, иначе data (для pending)
            const photoSrc = photo.url || photo.data;
            if (!photoSrc) return null;
            
            // Форматируем timestamp
            const timeStr = photo.timestamp 
              ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : null;
            
            // Удаление фото
            const handleDelete = async (e) => {
              e.stopPropagation();
              if (!confirm('Удалить это фото?')) return;
              
              // Удаляем из Supabase Storage если загружено
              if (photo.path && photo.uploaded && window.HEYS?.cloud?.deletePhoto) {
                try {
                  await window.HEYS.cloud.deletePhoto(photo.path);
                } catch (err) {
                  console.warn('[MealCard] Failed to delete from storage:', err);
                }
              }
              
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return { ...m, photos: m.photos.filter(p => p.id !== photo.id) };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            };
            
            // Собираем классы
            let thumbClass = 'meal-photo-thumb';
            if (photo.pending) thumbClass += ' pending';
            if (photo.uploading) thumbClass += ' uploading';
            
            return React.createElement(LazyPhotoThumb, { 
              key: photo.id || photoIndex,
              photo,
              photoSrc,
              thumbClass,
              timeStr,
              mealIndex,
              photoIndex,
              mealPhotos: meal.photos,
              handleDelete,
              setDay
            });
          })
        ),

        // === MealOptimizer: Умные рекомендации ===
        HEYS.MealOptimizer && meal?.items && meal.items.length > 0 && React.createElement(MealOptimizerSection, {
          meal,
          totals,
          dayData: dayData || {},
          profile: profile || {},
          products: products || [],
          pIndex,
          mealIndex,
          addProductToMeal
        }),

        // Инсулиновая волна в карточке приёма — единый блок
        showWaveButton && React.createElement('div', {
          className: 'meal-wave-block' + (waveExpanded ? ' expanded' : ''),
          style: {
            marginTop: '10px',
            background: hasAnyOverlap ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
            borderRadius: '12px',
            overflow: 'hidden'
          }
        },
          // Заголовок (кликабельный toggle)
          React.createElement('div', {
            className: 'meal-wave-toggle',
            onClick: toggleWave,
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px',
              cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
              color: hasAnyOverlap ? '#b91c1c' : '#1f2937'
            }
          },
            React.createElement('span', null,
              `📉 Волна ${(currentWave.duration / 60).toFixed(1)}ч • ` + (
                hasAnyOverlap
                  ? `⚠️ перехлёст ${formatMinutes(overlapMinutes)}`
                  : nextWave
                    ? `✅ липолиз ${formatMinutes(lipolysisGapNext)}`
                    : '🟢 последний приём'
              )
            ),
            React.createElement('span', { className: 'toggle-arrow' }, waveExpanded ? '▴' : '▾')
          ),
          // Expand-секция (график) — внутри того же блока
          waveExpanded && InsulinWave.MealWaveExpandSection && React.createElement(InsulinWave.MealWaveExpandSection, {
            waveData: currentWave,
            prevWave,
            nextWave
          }),
          
          // ⚡ v3.2.0: Предупреждение о реактивной гипогликемии
          (() => {
            const IW = HEYS.InsulinWave;
            if (!IW || !IW.calculateHypoglycemiaRisk) return null;
            
            const hypoRisk = IW.calculateHypoglycemiaRisk(meal, pIndex, getProductFromItem);
            if (!hypoRisk.hasRisk) return null;
            
            // Проверяем: мы в окне риска (2-4 часа после еды)?
            const mealMinutes = IW.utils?.timeToMinutes?.(meal.time) || 0;
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            let minutesSinceMeal = nowMinutes - mealMinutes;
            if (minutesSinceMeal < 0) minutesSinceMeal += 24 * 60;
            
            const inRiskWindow = minutesSinceMeal >= hypoRisk.riskWindow.start && minutesSinceMeal <= hypoRisk.riskWindow.end;
            
            return React.createElement('div', {
              className: 'hypoglycemia-warning',
              style: {
                margin: '8px 12px 10px 12px',
                padding: '8px 10px',
                background: inRiskWindow ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.1)',
                borderRadius: '8px',
                fontSize: '12px',
                color: inRiskWindow ? '#ea580c' : '#ca8a04'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                inRiskWindow 
                  ? '⚡ Сейчас возможен спад энергии'
                  : '⚡ Высокий GI — риск "сахарных качелей"'
              ),
              React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } },
                inRiskWindow
                  ? 'Это нормально! Съешь орехи или белок если устал'
                  : `GI ~${Math.round(hypoRisk.details.avgGI)}, белок ${Math.round(hypoRisk.details.totalProtein)}г — через 2-3ч может "накрыть"`
              )
            );
          })()
        )
      )
    );
  }, (prevProps, nextProps) => {
    // Custom comparison: ререндерим если изменились важные поля meal
    if (prevProps.meal !== nextProps.meal) return false;
    if (prevProps.meal?.mealType !== nextProps.meal?.mealType) return false;
    if (prevProps.meal?.name !== nextProps.meal?.name) return false;
    if (prevProps.meal?.time !== nextProps.meal?.time) return false;
    if (prevProps.meal?.items?.length !== nextProps.meal?.items?.length) return false;
    if (prevProps.meal?.photos?.length !== nextProps.meal?.photos?.length) return false;
    if (prevProps.mealIndex !== nextProps.mealIndex) return false;
    if (prevProps.displayIndex !== nextProps.displayIndex) return false;
    if (prevProps.isExpanded !== nextProps.isExpanded) return false;
    if (prevProps.allMeals !== nextProps.allMeals) return false;
    return true;
  });

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

  HEYS.DayTab=function DayTab(props){
  
  const {useState,useMemo,useEffect,useRef}=React;
  
  // Дата приходит из шапки App (DatePicker в header)
  const { selectedDate, setSelectedDate } = props;
  
  // Products приходят из App → DayTabWithCloudSync → DayTab
  // FALLBACK: если props.products пустой, берём из HEYS.products.getAll()
  // SAFETY: ensure products is always an array
  const propsProducts = Array.isArray(props.products) ? props.products : [];
  const products = useMemo(() => {
    if (propsProducts.length > 0) return propsProducts;
    // Fallback: берём из глобального хранилища
    const fromStore = HEYS.products?.getAll?.() || [];
    if (Array.isArray(fromStore) && fromStore.length > 0) return fromStore;
    // Последний fallback: из localStorage напрямую
    const U = HEYS.utils || {};
    const lsData = U.lsGet?.('heys_products', []) || [];
    return Array.isArray(lsData) ? lsData : [];
  }, [propsProducts]);
  
  // Twemoji: reparse emoji after render
  useEffect(() => {
    if (window.scheduleTwemojiParse) window.scheduleTwemojiParse();
  });
  
  // Трекинг просмотра дня (только один раз)
  useEffect(() => {
    if (window.HEYS && window.HEYS.analytics) {
      window.HEYS.analytics.trackDataOperation('day-viewed');
    }
  }, []);
  
  const prodSig = useMemo(()=>productsSignature(products), [products]);
  const pIndex = useMemo(()=>buildProductIndex(products),[prodSig]);

  // Debug info (minimal)
  window.HEYS.debug = window.HEYS.debug || {};
  window.HEYS.debug.dayProducts = products;
  window.HEYS.debug.dayProductIndex = pIndex;
  const prof=getProfile();
  // date приходит из props (selectedDate из App header)
  const date = selectedDate || todayISO();
  const setDate = setSelectedDate;
  // State for collapsed/expanded meals (mobile) - с кэшированием в sessionStorage
  const expandedMealsKey = 'heys_expandedMeals_' + date;
  // Отдельный state для ручного разворачивания устаревших приёмов (не кешируется)
  const [manualExpandedStale, setManualExpandedStale] = useState({});
  const [expandedMeals, setExpandedMeals] = useState(() => {
    try {
      const cached = sessionStorage.getItem(expandedMealsKey);
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      return {};
    }
  });
  
  // Сохраняем состояние при изменении
  useEffect(() => {
    try {
      sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
    } catch (e) {}
  }, [expandedMeals, expandedMealsKey]);
  
  // Проверка: устарел ли приём (прошло больше 30 минут с времени приёма)
  const isMealStale = React.useCallback((meal) => {
    if (!meal || !meal.time) return false;
    const [hours, minutes] = meal.time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return false;
    const now = new Date();
    const mealDate = new Date();
    mealDate.setHours(hours, minutes, 0, 0);
    const diffMinutes = (now - mealDate) / (1000 * 60);
    return diffMinutes > 30;
  }, []);
  
  const toggleMealExpand = React.useCallback((mealIndex, meals) => {
    const meal = meals && meals[mealIndex];
    const isStale = meal && isMealStale(meal);
    
    if (isStale) {
      // Для устаревших — отдельный state (не кешируется)
      setManualExpandedStale(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
    } else {
      // Для актуальных — обычный state (кешируется)
      setExpandedMeals(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
    }
  }, [isMealStale]);
  
  // Функция для разворачивания нового приёма и сворачивания остальных
  const expandOnlyMeal = (mealIndex) => {
    const newState = {};
    newState[mealIndex] = true;
    setExpandedMeals(newState);
  };
  
  // Централизованная детекция мобильного устройства (с поддержкой ротации)
  const isMobile = useMobileDetection(768);
  
  // === МОБИЛЬНЫЕ ПОД-ВКЛАДКИ ===
  // 'stats' — статистика дня (шапка, статистика, активность, сон)
  // 'diary' — дневник питания (суточные итоги, приёмы пищи)
  // Теперь subTab приходит из props (из нижнего меню App)
  const mobileSubTab = props.subTab || 'stats';
  
  // === СВАЙП ДЛЯ ПОД-ВКЛАДОК УБРАН ===
  // Теперь свайп между stats/diary обрабатывается глобально в App
  // (нижнее меню с 5 вкладками)
  const onSubTabTouchStart = React.useCallback(() => {}, []);
  const onSubTabTouchEnd = React.useCallback(() => {}, []);

  // Проверка: развёрнут ли приём
  // - Устаревшие приёмы (>1 часа) автоматически свёрнуты
  // - Пользователь может вручную развернуть их кликом (не кешируется)
  // - Первый в отсортированном списке (последний по времени) развёрнут по умолчанию
  const isMealExpanded = (mealIndex, totalMeals, meals, displayIndex = null) => {
    const meal = meals && meals[mealIndex];
    const isStale = meal && isMealStale(meal);
    
    // Устаревшие приёмы (>1 часа) свёрнуты по умолчанию
    // Можно развернуть вручную (состояние не кешируется)
    if (isStale) {
      return manualExpandedStale[mealIndex] === true;
    }
    
    // Для актуальных приёмов — стандартная логика
    if (expandedMeals.hasOwnProperty(mealIndex)) {
      return expandedMeals[mealIndex];
    }
    
    // Первый в отсортированном списке (последний по времени) развёрнут по умолчанию
    // Если displayIndex передан — используем его, иначе fallback на старую логику
    if (displayIndex !== null) {
      return displayIndex === 0;
    }
    return mealIndex === totalMeals - 1;
  };
  
  // Флаг: данные загружены (из localStorage или Supabase)
  const [isHydrated, setIsHydrated] = useState(false);
  
  // State для развёрнутости NDTE badge (Next-Day Training Effect)
  const [ndteExpanded, setNdteExpanded] = useState(false);
  
  // Ref для отслеживания предыдущей даты (нужен для flush перед сменой)
  const prevDateRef = React.useRef(date);
  
  // Ref для отслеживания последнего updatedAt — предотвращает гонку между doLocal и handleDayUpdated
  const lastLoadedUpdatedAtRef = React.useRef(0);
  
  // Ref для блокировки обновлений от cloud sync во время редактирования
  const blockCloudUpdatesUntilRef = React.useRef(0);
  
  // Ref для блокировки событий heys:day-updated во время начальной синхронизации
  // Это предотвращает множественные setDay() вызовы и мерцание UI
  const isSyncingRef = React.useRef(false);

  // Миграция тренировок: quality/feelAfter → mood/wellbeing/stress
  const normalizeTrainings = (trainings = []) => trainings.map((t = {}) => {
    if (t.quality !== undefined || t.feelAfter !== undefined) {
      const { quality, feelAfter, ...rest } = t;
      return {
        ...rest,
        mood: rest.mood ?? quality ?? 5,
        wellbeing: rest.wellbeing ?? feelAfter ?? 5,
        stress: rest.stress ?? 5
      };
    }
    return t;
  });

  // Очистка пустых тренировок (все зоны = 0)
  const cleanEmptyTrainings = (trainings) => {
    if (!Array.isArray(trainings)) return [];
    return trainings.filter(t => t && t.z && t.z.some(z => z > 0));
  };
  
  const [dayRaw,setDayRaw]=useState(()=>{ 
    const key = 'heys_dayv2_'+date;
    const v=lsGet(key,null); 
    
    if (v && v.date) {
      // Мигрируем оценки тренировок и очищаем пустые при загрузке
      const normalizedTrainings = normalizeTrainings(v.trainings);
      const cleanedTrainings = cleanEmptyTrainings(normalizedTrainings);
      const migratedDay = { ...v, trainings: cleanedTrainings };
      // ⚠️ НЕ сохраняем здесь! useState initializer должен быть чистой функцией
      // Миграция сохраняется в doLocal() после sync
      return ensureDay(migratedDay, prof);
    } else {
      // Для нового дня — пустой массив тренировок
      return ensureDay({
        date: date,
        meals: [],
        trainings: [],
        sleepStart: '',
        sleepEnd: '',
        sleepQuality: '',
        sleepNote: '',
        dayScore: '',
        moodAvg: '',
        wellbeingAvg: '',
        stressAvg: '',
        dayComment: ''
      }, prof);
    }
  });
  
  const setDay = setDayRaw;
  const day = dayRaw;

  // cleanEmptyTrainings определена выше (для совместимости с прежним кодом вызовы остаются)

    // ЗАЩИТА: не сохранять до завершения гидратации (чтобы не затереть данные из Supabase)
    const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet, disabled: !isHydrated });
    
    // Smart Prefetch: предзагрузка ±7 дней при наличии интернета
    useSmartPrefetch && useSmartPrefetch({ currentDate: date, daysRange: 7, enabled: isHydrated });

    useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.requestFlush = flush;
      // 🔒 Экспортируем функцию проверки блокировки для cloud sync
      HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
      return () => {
        if (HEYS.Day && HEYS.Day.requestFlush === flush) {
          delete HEYS.Day.requestFlush;
          delete HEYS.Day.isBlockingCloudUpdates;
          delete HEYS.Day.getBlockUntil;
        }
      };
    }, [flush]);

    // Логирование для диагностики рассинхрона продуктов и приёмов пищи
    useEffect(() => {
  // ...existing code...
    }, [products, day]);

  // ...existing code...

  // ...existing code...

  // ...existing code...

  // ...удалены дублирующиеся объявления useState...
  useEffect(()=>{ lsSet('heys_dayv2_date',date); },[date]);

    // Подгружать данные дня из облака при смене даты
    useEffect(() => {
      let cancelled = false;
      
      // 🔴 КРИТИЧНО: Сохранить текущие данные ПЕРЕД сменой даты!
      // Иначе несохранённые изменения потеряются при переходе на другую дату
      const dateActuallyChanged = prevDateRef.current !== date;
      if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
        // Flush данные предыдущего дня синхронно
        HEYS.Day.requestFlush();
      }
      prevDateRef.current = date;
      
      setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      
      // Сбрасываем ref при смене даты
      lastLoadedUpdatedAtRef.current = 0;
      
      const doLocal = () => {
        if (cancelled) return;
        const profNow = getProfile();
        const key = 'heys_dayv2_' + date;
        const v = lsGet(key, null);
        // DEBUG (отключено): console.log('[HEYS] 📅 doLocal() loading day | key:', key);
        if (v && v.date) {
          // ЗАЩИТА: не перезаписываем более свежие данные
          // handleDayUpdated может уже загрузить sync данные
          if (v.updatedAt && lastLoadedUpdatedAtRef.current > 0 && v.updatedAt < lastLoadedUpdatedAtRef.current) {
            console.log('[HEYS] 📅 doLocal() SKIPPED — newer data already loaded | storage:', v.updatedAt, '| loaded:', lastLoadedUpdatedAtRef.current);
            return;
          }
          lastLoadedUpdatedAtRef.current = v.updatedAt || Date.now();
          
          // Мигрируем оценки тренировок и очищаем пустые (только в памяти, НЕ сохраняем)
          // Миграция сохранится автоматически при следующем реальном изменении данных
          const normalizedTrainings = normalizeTrainings(v.trainings);
          const cleanedTrainings = cleanEmptyTrainings(normalizedTrainings);
          const cleanedDay = {
            ...v,
            trainings: cleanedTrainings
          };
          // 🔒 НЕ сохраняем миграцию сразу — это вызывает DAY SAVE и мерцание UI
          // Данные сохранятся при следующем изменении (добавление еды, воды и т.д.)
          const newDay = ensureDay(cleanedDay, profNow);
          // 🔒 Оптимизация: не вызываем setDay если данные идентичны (предотвращает мерцание)
          setDay(prevDay => {
            // Сравниваем по КОНТЕНТУ, а не по метаданным (updatedAt может отличаться между локальной и облачной версией)
            if (prevDay && prevDay.date === newDay.date) {
              const prevMealsJson = JSON.stringify(prevDay.meals || []);
              const newMealsJson = JSON.stringify(newDay.meals || []);
              const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
              const newTrainingsJson = JSON.stringify(newDay.trainings || []);
              const isSameContent = 
                prevMealsJson === newMealsJson &&
                prevTrainingsJson === newTrainingsJson &&
                prevDay.waterMl === newDay.waterMl &&
                prevDay.steps === newDay.steps &&
                prevDay.weightMorning === newDay.weightMorning &&
                prevDay.sleepStart === newDay.sleepStart &&
                prevDay.sleepEnd === newDay.sleepEnd;
              if (isSameContent) {
                // Данные не изменились — оставляем предыдущий объект (без ре-рендера)
                return prevDay;
              }
            }
            return newDay;
          });
          // DEBUG (отключено): console.log('[HEYS] 📅 doLocal() loaded existing day');
        } else {
          // create a clean default day for the selected date (don't inherit previous trainings)
          const defaultDay = ensureDay({ 
            date: date, 
            meals: (loadMealsForDate(date) || []), 
            trainings: [{ z: [0,0,0,0] }, { z: [0,0,0,0] }],
            // Явно устанавливаем пустые значения для полей сна и оценки
            sleepStart: '',
            sleepEnd: '',
            sleepQuality: '',
            sleepNote: '',
            dayScore: '',
            moodAvg: '',
            wellbeingAvg: '',
            stressAvg: '',
            dayComment: ''
          }, profNow);
          setDay(defaultDay);
          console.log('[HEYS] 📅 doLocal() created NEW day | date:', date);
        }
        
        // ВАЖНО: данные загружены, теперь можно сохранять
        // Продукты приходят через props.products, не нужно обновлять локально
        setIsHydrated(true);
      };
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true){
          // 🔒 Блокируем события heys:day-updated во время синхронизации
          // Это предотвращает множественные setDay() и мерцание UI
          isSyncingRef.current = true;
          cloud.bootstrapClientSync(clientId)
            .then(() => {
              // После sync localStorage уже обновлён событиями heys:day-updated
              // Просто загружаем финальные данные (без задержки!)
              isSyncingRef.current = false;
              doLocal();
            })
            .catch((err) => {
              // Нет сети или ошибка — загружаем из локального кэша
              isSyncingRef.current = false;
              console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
              doLocal();
            });
        } else {
          doLocal();
        }
      } else {
        doLocal();
      }
      return () => { 
        cancelled = true; 
        isSyncingRef.current = false; // Сброс при смене даты или размонтировании
      };
    }, [date]);

    // Слушаем событие обновления данных дня (от Morning Check-in или внешних изменений)
    // НЕ слушаем heysSyncCompleted — это вызывает бесконечный цикл при каждом сохранении
    React.useEffect(() => {
      const handleDayUpdated = (e) => {
        const updatedDate = e.detail?.date;
        const source = e.detail?.source || 'unknown';
        const forceReload = e.detail?.forceReload || false;
        
        // 🔒 Игнорируем события во время начальной синхронизации
        // doLocal() в конце синхронизации загрузит все финальные данные
        if (isSyncingRef.current && (source === 'cloud' || source === 'merge')) {
          // DEBUG (отключено): console.log('[HEYS] 📅 Ignored event during initial sync | source:', source);
          return;
        }
        
        // Блокируем ВСЕ внешние обновления на 3 секунды после локального изменения
        // Но НЕ блокируем forceReload (от шагов модалки)
        if (!forceReload && Date.now() < blockCloudUpdatesUntilRef.current) {
          console.log('[HEYS] 📅 Blocked external update during local edit | source:', source, '| remaining:', blockCloudUpdatesUntilRef.current - Date.now(), 'ms');
          return;
        }
        
        // Если date не указан или совпадает с текущим — перезагружаем
        if (!updatedDate || updatedDate === date) {
          const profNow = getProfile();
          const key = 'heys_dayv2_' + date;
          const v = lsGet(key, null);
          if (v && v.date) {
            // Проверяем: данные из storage новее текущих?
            const storageUpdatedAt = v.updatedAt || 0;
            const currentUpdatedAt = lastLoadedUpdatedAtRef.current || 0;
            
            // Двойная защита: по timestamp И по количеству meals
            // Не откатываем если в storage меньше meals чем в текущем state
            const storageMealsCount = (v.meals || []).length;
            
            console.log('[HEYS] 📅 handleDayUpdated | source:', source, '| storage meals:', storageMealsCount, '| storageUpdatedAt:', storageUpdatedAt, '| currentUpdatedAt:', currentUpdatedAt, '| forceReload:', forceReload);
            
            // Пропускаем проверку timestamp если forceReload
            if (!forceReload && storageUpdatedAt <= currentUpdatedAt) {
              console.log('[HEYS] 📅 Ignoring outdated day update | storage:', storageUpdatedAt, '| current:', currentUpdatedAt, '| meals in storage:', storageMealsCount);
              return; // Не перезаписываем более новые данные старыми
            }
            
            // Обновляем ref чтобы doLocal() не перезаписал более старыми данными
            lastLoadedUpdatedAtRef.current = storageUpdatedAt;
            const migratedTrainings = normalizeTrainings(v.trainings);
            const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
            const migratedDay = { ...v, trainings: cleanedTrainings };
            // Сохраняем миграцию ТОЛЬКО если данные изменились
            const trainingsChanged = JSON.stringify(v.trainings) !== JSON.stringify(cleanedTrainings);
            if (trainingsChanged) {
              lsSet(key, migratedDay);
            }
            const newDay = ensureDay(migratedDay, profNow);
            
            // 🔒 Оптимизация: не вызываем setDay если контент идентичен (предотвращает мерцание)
            setDay(prevDay => {
              if (prevDay && prevDay.date === newDay.date) {
                const prevMealsJson = JSON.stringify(prevDay.meals || []);
                const newMealsJson = JSON.stringify(newDay.meals || []);
                const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                const isSameContent = 
                  prevMealsJson === newMealsJson &&
                  prevTrainingsJson === newTrainingsJson &&
                  prevDay.waterMl === newDay.waterMl &&
                  prevDay.steps === newDay.steps &&
                  prevDay.weightMorning === newDay.weightMorning &&
                  // Утренние оценки из чек-ина
                  prevDay.moodMorning === newDay.moodMorning &&
                  prevDay.wellbeingMorning === newDay.wellbeingMorning &&
                  prevDay.stressMorning === newDay.stressMorning;
                if (isSameContent) {
                  // DEBUG (отключено): console.log('[HEYS] 📅 handleDayUpdated SKIPPED — same content');
                  return prevDay;
                }
              }
              return newDay;
            });
          }
        }
      };
      
      // Слушаем явное событие обновления дня (от StepModal, Morning Check-in)
      window.addEventListener('heys:day-updated', handleDayUpdated);
      
      return () => {
        window.removeEventListener('heys:day-updated', handleDayUpdated);
      };
    }, [date]);

    const z= (lsGet('heys_hr_zones',[]).map(x=>+x.MET||0)); const mets=[2.5,6,8,10].map((_,i)=>z[i]||[2.5,6,8,10][i]);
    const weight=+day.weightMorning||+prof.weight||70; const kcalMin=mets.map(m=>kcalPerMin(m,weight));
    const trainK= t=>(t.z||[0,0,0,0]).reduce((s,min,i)=> s+r0((+min||0)*(kcalMin[i]||0)),0);
    const TR=(day.trainings&&Array.isArray(day.trainings)&&day.trainings.length>=1)?day.trainings:[{z:[0,0,0,0]},{z:[0,0,0,0]},{z:[0,0,0,0]}];
  const train1k=trainK(TR[0]||{z:[0,0,0,0]}), train2k=trainK(TR[1]||{z:[0,0,0,0]}), train3k=trainK(TR[2]||{z:[0,0,0,0]});
  const stepsK=r0(stepsKcal(day.steps||0,weight,prof.sex,0.7));
  // Backward compatible: householdActivities массив или legacy householdMin
  const householdActivities = day.householdActivities || (day.householdMin > 0 ? [{ minutes: day.householdMin, time: day.householdTime || '' }] : []);
  const totalHouseholdMin = householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
  const householdK=r0(totalHouseholdMin*kcalPerMin(2.5,weight));
  const actTotal=r0(train1k+train2k+train3k+stepsK+householdK);
  const bmr=calcBMR(weight,prof);
  
  // 🆕 v3.6.0: Next-Day Training Effect (NDTE) — буст метаболизма от вчерашней тренировки
  // Научное обоснование: Magkos 2008, Jamurtas 2004 — 500-1000 ккал тренировка → +5-15% к REE
  let ndteData = { active: false, tdeeBoost: 0 };
  if (HEYS.InsulinWave?.calculateNDTE && HEYS.InsulinWave?.getPreviousDayTrainings) {
    const prevTrainings = HEYS.InsulinWave.getPreviousDayTrainings(day.date, lsGet);
    if (prevTrainings.totalKcal >= 200) {
      const heightM = (+prof.height || 170) / 100;
      const bmi = weight && heightM ? r0(weight / (heightM * heightM) * 10) / 10 : 22;
      ndteData = HEYS.InsulinWave.calculateNDTE({
        trainingKcal: prevTrainings.totalKcal,
        hoursSince: prevTrainings.hoursSince,
        bmi,
        trainingType: prevTrainings.dominantType || 'cardio',
        trainingsCount: prevTrainings.trainings.length
      });
    }
  }
  const ndteBoostKcal = r0(bmr * ndteData.tdeeBoost);
  
  const tdee=r0(bmr+actTotal+ndteBoostKcal);
  const profileTargetDef=+(lsGet('heys_profile',{}).deficitPctTarget)||0; // отрицательное число для дефицита
  // day.deficitPct может быть '', null, undefined — проверяем все случаи (как в currentDeficit для UI)
  const dayTargetDef = (day.deficitPct !== '' && day.deficitPct != null) ? +day.deficitPct : profileTargetDef;
  
  // Коррекция на менструальный цикл (×1.05-1.10 в менструальную фазу)
  const cycleKcalMultiplier = HEYS.Cycle?.getKcalMultiplier?.(day.cycleDay) || 1;
  const baseOptimum = r0(tdee*(1+dayTargetDef/100));
  const optimum = r0(baseOptimum * cycleKcalMultiplier);

  const eatenKcal=(day.meals||[]).reduce((a,m)=>{ const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0}); return a+(t.kcal||0); },0);
  const factDefPct = tdee? r0(((eatenKcal - tdee)/tdee)*100) : 0; // <0 значит дефицит

  // Диагностический лог для отладки расхождений между Днём и Отчётностью
  if (window._HEYS_DEBUG_TDEE) {
    console.group('HEYS_TDEE_DEBUG [DAY] Расчёт для', day.date);
    console.log('HEYS_TDEE_DEBUG [DAY] Входные данные:');
    console.log('HEYS_TDEE_DEBUG [DAY]   weightMorning:', day.weightMorning, '| профиль weight:', prof.weight, '| итог weight:', weight);
    console.log('HEYS_TDEE_DEBUG [DAY]   steps:', day.steps, '| householdMin:', day.householdMin);
    console.log('HEYS_TDEE_DEBUG [DAY]   trainings:', JSON.stringify(TR));
    console.log('HEYS_TDEE_DEBUG [DAY]   HR zones (MET):', JSON.stringify(z));
    console.log('HEYS_TDEE_DEBUG [DAY] Промежуточные расчёты:');
    console.log('HEYS_TDEE_DEBUG [DAY]   BMR:', bmr);
    console.log('HEYS_TDEE_DEBUG [DAY]   train1k:', train1k, '| train2k:', train2k);
    console.log('HEYS_TDEE_DEBUG [DAY]   stepsK:', stepsK, '| householdK:', householdK);
    console.log('HEYS_TDEE_DEBUG [DAY]   actTotal:', actTotal);
    console.log('HEYS_TDEE_DEBUG [DAY] Итоговые значения:');
    console.log('HEYS_TDEE_DEBUG [DAY]   tdee (Общие затраты):', tdee);
    console.log('HEYS_TDEE_DEBUG [DAY]   eatenKcal (съедено):', r0(eatenKcal));
    console.log('HEYS_TDEE_DEBUG [DAY]   optimum (нужно съесть):', optimum);
    console.log('HEYS_TDEE_DEBUG [DAY]   factDefPct:', factDefPct + '%');
    console.groupEnd();
  }

    function updateTraining(i, zi, mins) {
      setDay(prevDay => {
        const arr = (prevDay.trainings || [{z:[0,0,0,0]}, {z:[0,0,0,0]}]).map((t, idx) => {
          if (idx !== i) return t;
          return {
            ...t,  // сохраняем time, type и другие поля
            z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
          };
        });
        return { ...prevDay, trainings: arr, updatedAt: Date.now() };
      });
    }

    // Функция для вычисления средних оценок из утреннего чек-ина, приёмов пищи И тренировок
    function calculateDayAverages(meals, trainings, dayData) {
      // Утренние оценки из чек-ина (если есть — это стартовая точка дня)
      const morningMood = dayData?.moodMorning && !isNaN(+dayData.moodMorning) ? [+dayData.moodMorning] : [];
      const morningWellbeing = dayData?.wellbeingMorning && !isNaN(+dayData.wellbeingMorning) ? [+dayData.wellbeingMorning] : [];
      const morningStress = dayData?.stressMorning && !isNaN(+dayData.stressMorning) ? [+dayData.stressMorning] : [];
      
      // Собираем все оценки из приёмов пищи
      const mealMoods = (meals || []).filter(m => m.mood && !isNaN(+m.mood)).map(m => +m.mood);
      const mealWellbeing = (meals || []).filter(m => m.wellbeing && !isNaN(+m.wellbeing)).map(m => +m.wellbeing);
      const mealStress = (meals || []).filter(m => m.stress && !isNaN(+m.stress)).map(m => +m.stress);
      
      // Собираем оценки из тренировок (mood, wellbeing, stress - теперь такие же как в meals)
      // Фильтруем только РЕАЛЬНЫЕ тренировки — с временем или минутами в зонах (не пустые заглушки)
      const realTrainings = (trainings || []).filter(t => {
        const hasTime = t.time && t.time.trim() !== '';
        const hasMinutes = t.z && Array.isArray(t.z) && t.z.some(m => m > 0);
        return hasTime || hasMinutes;
      });
      const trainingMoods = realTrainings.filter(t => t.mood && !isNaN(+t.mood)).map(t => +t.mood);
      const trainingWellbeing = realTrainings.filter(t => t.wellbeing && !isNaN(+t.wellbeing)).map(t => +t.wellbeing);
      const trainingStress = realTrainings.filter(t => t.stress && !isNaN(+t.stress)).map(t => +t.stress);
      
      // Объединяем все оценки: утро + приёмы пищи + тренировки
      const allMoods = [...morningMood, ...mealMoods, ...trainingMoods];
      const allWellbeing = [...morningWellbeing, ...mealWellbeing, ...trainingWellbeing];
      const allStress = [...morningStress, ...mealStress, ...trainingStress];
      
      const moodAvg = allMoods.length ? r1(allMoods.reduce((sum, val) => sum + val, 0) / allMoods.length) : '';
      const wellbeingAvg = allWellbeing.length ? r1(allWellbeing.reduce((sum, val) => sum + val, 0) / allWellbeing.length) : '';
      const stressAvg = allStress.length ? r1(allStress.reduce((sum, val) => sum + val, 0) / allStress.length) : '';
      
      // Автоматический расчёт dayScore на основе трёх оценок
      // Формула: (mood + wellbeing + (10 - stress)) / 3, округлено до целого
      let dayScore = '';
      if (moodAvg !== '' || wellbeingAvg !== '' || stressAvg !== '') {
        const m = moodAvg !== '' ? +moodAvg : 5;
        const w = wellbeingAvg !== '' ? +wellbeingAvg : 5;
        const s = stressAvg !== '' ? +stressAvg : 5;
        // stress инвертируем: низкий стресс = хорошо
        dayScore = Math.round((m + w + (10 - s)) / 3);
      }
      
      return { moodAvg, wellbeingAvg, stressAvg, dayScore };
    }

    // Автоматическое обновление средних оценок и dayScore при изменении приёмов пищи, тренировок или утренних оценок
    useEffect(() => {
      const averages = calculateDayAverages(day.meals, day.trainings, day);
      
      // Не перезаписываем dayScore если есть ручной override (dayScoreManual)
      const shouldUpdateDayScore = !day.dayScoreManual && averages.dayScore !== day.dayScore;
      
      if (averages.moodAvg !== day.moodAvg || averages.wellbeingAvg !== day.wellbeingAvg || 
          averages.stressAvg !== day.stressAvg || shouldUpdateDayScore) {
        setDay(prevDay => ({
          ...prevDay,
          moodAvg: averages.moodAvg,
          wellbeingAvg: averages.wellbeingAvg,
          stressAvg: averages.stressAvg,
          // Обновляем dayScore только если нет ручного override
          ...(shouldUpdateDayScore ? { dayScore: averages.dayScore } : {}),
          updatedAt: Date.now()
        }));
      }
    }, [
      day.meals?.map(m => `${m.mood}-${m.wellbeing}-${m.stress}`).join('|'), 
      day.trainings?.map(t => `${t.mood}-${t.wellbeing}-${t.stress}`).join('|'),
      day.moodMorning, day.wellbeingMorning, day.stressMorning,
      day.dayScoreManual
    ]);

    // === Sparkline данные: динамика настроения в течение дня ===
    const moodSparklineData = React.useMemo(() => {
      const points = [];
      const parseTime = (t) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      
      // Утренняя оценка из чек-ина (стартовая точка дня)
      if (day.moodMorning || day.wellbeingMorning || day.stressMorning) {
        const mood = +day.moodMorning || 0;
        const wellbeing = +day.wellbeingMorning || 0;
        const stress = +day.stressMorning || 0;
        if (mood || wellbeing || stress) {
          const m = mood || 5;
          const w = wellbeing || 5;
          const s = stress || 5;
          const score = (m + w + (10 - s)) / 3;
          // Время утренней оценки: берём из sleepEnd или 7:00 по умолчанию
          const morningTime = parseTime(day.sleepEnd) || parseTime('07:00');
          points.push({
            time: morningTime,
            score: Math.round(score * 10) / 10,
            type: 'morning',
            name: 'Утро',
            mood, wellbeing, stress,
            icon: '🌅'
          });
        }
      }
      
      // Собираем точки из приёмов пищи
      (day.meals || []).forEach((meal, idx) => {
        const mood = +meal.mood || 0;
        const wellbeing = +meal.wellbeing || 0;
        const stress = +meal.stress || 0;
        // Нужна хотя бы одна оценка
        if (!mood && !wellbeing && !stress) return;
        const time = parseTime(meal.time);
        if (!time) return;
        // Комбинированная оценка: (mood + wellbeing + (10 - stress)) / 3
        // Если какой-то параметр отсутствует, используем нейтральное 5
        const m = mood || 5;
        const w = wellbeing || 5;
        const s = stress || 5;
        const score = (m + w + (10 - s)) / 3;
        points.push({
          time,
          score: Math.round(score * 10) / 10,
          type: 'meal',
          name: meal.name || 'Приём ' + (idx + 1),
          mood, wellbeing, stress,
          icon: '🍽️'
        });
      });
      
      // Собираем точки из тренировок
      (day.trainings || []).forEach((tr, idx) => {
        const mood = +tr.mood || 0;
        const wellbeing = +tr.wellbeing || 0;
        const stress = +tr.stress || 0;
        if (!mood && !wellbeing && !stress) return;
        const time = parseTime(tr.time);
        if (!time) return;
        const m = mood || 5;
        const w = wellbeing || 5;
        const s = stress || 5;
        const score = (m + w + (10 - s)) / 3;
        const typeIcons = { cardio: '🏃', strength: '🏋️', hobby: '⚽' };
        points.push({
          time,
          score: Math.round(score * 10) / 10,
          type: 'training',
          name: tr.type === 'cardio' ? 'Кардио' : tr.type === 'strength' ? 'Силовая' : 'Хобби',
          mood, wellbeing, stress,
          icon: typeIcons[tr.type] || '🏃'
        });
      });
      
      // Сортируем по времени
      points.sort((a, b) => a.time - b.time);
      
      return points;
    }, [
      day.moodMorning, day.wellbeingMorning, day.stressMorning, day.sleepEnd,
      day.meals?.map(m => `${m.time}-${m.mood}-${m.wellbeing}-${m.stress}`).join('|'),
      day.trainings?.map(t => `${t.time}-${t.mood}-${t.wellbeing}-${t.stress}`).join('|')
    ]);

    // === iOS-style Time Picker Modal (mobile only) ===
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [pendingMealTime, setPendingMealTime] = useState({hours: 12, minutes: 0});
    const [editingMealIndex, setEditingMealIndex] = useState(null); // null = новый, число = редактирование
    const [editMode, setEditMode] = useState('new'); // 'new' | 'time' | 'mood'
    
    // === Training Picker Modal ===
    const [showTrainingPicker, setShowTrainingPicker] = useState(false);
    const [trainingPickerStep, setTrainingPickerStep] = useState(1); // 1 = тип+время, 2 = зоны, 3 = оценки
    const [editingTrainingIndex, setEditingTrainingIndex] = useState(null);
    const [pendingTrainingTime, setPendingTrainingTime] = useState({hours: 10, minutes: 0});
    const [pendingTrainingType, setPendingTrainingType] = useState('cardio');
    const [pendingTrainingZones, setPendingTrainingZones] = useState([0, 0, 0, 0]); // индексы для zoneMinutesValues
    const [pendingTrainingQuality, setPendingTrainingQuality] = useState(0); // 0-10
    const [pendingTrainingFeelAfter, setPendingTrainingFeelAfter] = useState(0); // 0-10
    const [pendingTrainingComment, setPendingTrainingComment] = useState('');
    
    // === Тренировки: количество видимых блоков ===
    const [visibleTrainings, setVisibleTrainings] = useState(() => {
      // Автоопределяем сколько тренировок показывать на основе данных
      const tr = day.trainings || [];
      const hasData = (t) => t && t.z && t.z.some(v => +v > 0);
      if (tr[2] && hasData(tr[2])) return 3;
      if (tr[1] && hasData(tr[1])) return 2;
      if (tr[0] && hasData(tr[0])) return 1;
      return 0; // Если нет тренировок — не показываем пустые блоки
    });
    
    // === Период графиков (7, 14, 30 дней) ===
    const [chartPeriod, setChartPeriod] = useState(7);
    const [chartTransitioning, setChartTransitioning] = useState(false);
    
    // Плавная смена периода с transition
    const handlePeriodChange = (period) => {
      if (chartPeriod !== period) {
        setChartTransitioning(true);
        haptic('light');
        setTimeout(() => {
          setChartPeriod(period);
          setChartTransitioning(false);
        }, 150);
      }
    };
    
    // === Popup для точки на графике ===
    const [sparklinePopup, setSparklinePopup] = useState(null); // { type: 'kcal'|'weight', point, x, y }
    
    // === Popup для бейджей БЖУ ===
    const [macroBadgePopup, setMacroBadgePopup] = useState(null); // { macro, emoji, desc, x, y }
    
    // === Popup для метрик (вода, шаги, калории) ===
    const [metricPopup, setMetricPopup] = useState(null); // { type: 'water'|'steps'|'kcal', x, y, data }
    
    // === Popup для TDEE (затраты) ===
    const [tdeePopup, setTdeePopup] = useState(null); // { x, y, data: { bmr, stepsK, householdK, train1k, train2k, train3k, tdee, weight, steps, householdMin } }
    
    // === Popup для качества приёма пищи ===
    const [mealQualityPopup, setMealQualityPopup] = useState(null); // { meal, quality, mealTypeInfo, x, y }
    
    // === Popup для недельной статистики "X/Y в норме" ===
    const [weekNormPopup, setWeekNormPopup] = useState(null); // { days, inNorm, withData, x, y }

    // === Popup для калорийного долга ===
    const [debtPopup, setDebtPopup] = useState(null); // { x, y, data: caloricDebt }

    // === Данные замеров для карточки статистики ===
    const measurementFields = useMemo(() => ([
      { key: 'waist', label: 'Талия', icon: '📏' },
      { key: 'hips', label: 'Бёдра', icon: '🍑' },
      { key: 'thigh', label: 'Бедро', icon: '🦵' },
      { key: 'biceps', label: 'Бицепс', icon: '💪' }
    ]), []);

    const measurementsHistory = useMemo(() => {
      try {
        const history = HEYS.Steps?.getMeasurementsHistory ? HEYS.Steps.getMeasurementsHistory(90) : [];
        return Array.isArray(history) ? history : [];
      } catch (e) {
        return [];
      }
    }, [date, day.updatedAt]);

    const measurementsByField = useMemo(() => {
      const current = day.measurements || {};
      return measurementFields.map((f) => {
        const points = [];
        (measurementsHistory || []).forEach((entry) => {
          const val = entry[f.key];
          if (val !== null && val !== undefined && !Number.isNaN(+val)) {
            points.push({ value: +val, date: entry.date || entry.measuredAt });
          }
        });

        const latest = points[0] || null;
        const prev = points[1] || null;
        const value = (current[f.key] !== null && current[f.key] !== undefined && !Number.isNaN(+current[f.key]))
          ? +current[f.key]
          : latest ? latest.value : null;
        const prevValue = prev ? prev.value : null;
        const delta = (value !== null && prevValue !== null) ? value - prevValue : null;
        const deltaPct = (value !== null && prevValue && prevValue !== 0) ? delta / prevValue : null;
        const warn = deltaPct !== null && Math.abs(deltaPct) > 0.15;

        return {
          ...f,
          value,
          prevValue,
          delta,
          deltaPct,
          warn,
          points: points.slice(0, 8)
        };
      });
    }, [measurementFields, measurementsHistory, day.measurements]);

    const measurementsLastDate = useMemo(() => {
      if (!measurementsHistory || measurementsHistory.length === 0) return null;
      return measurementsHistory[0].date || measurementsHistory[0].measuredAt || null;
    }, [measurementsHistory]);

    // Форматирование даты замера: "6 декабря", "вчера", "сегодня"
    const measurementsLastDateFormatted = useMemo(() => {
      if (!measurementsLastDate) return null;
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const lastDate = new Date(measurementsLastDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDateNorm = new Date(lastDate);
      lastDateNorm.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - lastDateNorm) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'сегодня';
      if (diffDays === 1) return 'вчера';
      if (diffDays === 2) return 'позавчера';
      return `${lastDate.getDate()} ${months[lastDate.getMonth()]}`;
    }, [measurementsLastDate]);

    // Проверка: пора ли обновить замеры (≥7 дней)
    const measurementsNeedUpdate = useMemo(() => {
      if (!measurementsLastDate) return true; // Нет замеров — нужно добавить
      const lastDate = new Date(measurementsLastDate);
      const today = new Date();
      const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
      return diffDays >= 7;
    }, [measurementsLastDate]);

    // Прогресс за месяц (первый vs последний замер за 30 дней)
    const measurementsMonthlyProgress = useMemo(() => {
      if (!measurementsHistory || measurementsHistory.length < 2) return null;
      
      const results = [];
      measurementFields.forEach(f => {
        const values = measurementsHistory
          .filter(h => h[f.key] != null)
          .map(h => ({ value: +h[f.key], date: h.date || h.measuredAt }));
        
        if (values.length >= 2) {
          const newest = values[0].value;
          const oldest = values[values.length - 1].value;
          const diff = newest - oldest;
          if (Math.abs(diff) >= 0.5) { // Показываем только значимые изменения
            results.push({ label: f.label.toLowerCase(), diff: Math.round(diff * 10) / 10 });
          }
        }
      });
      
      return results.length > 0 ? results : null;
    }, [measurementsHistory, measurementFields]);

    const openMeasurementsEditor = () => {
      if (HEYS.showCheckin?.measurements) {
        HEYS.showCheckin.measurements(date); // Передаём текущую выбранную дату
      } else if (HEYS.StepModal?.show) {
        HEYS.StepModal.show({
          steps: ['measurements'],
          context: { dateKey: date }
        });
      }
    };

    // Форматирование даты: "7 дек", "15 нояб"
    const formatShortDate = (dateStr) => {
      if (!dateStr) return '';
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];
      const d = new Date(dateStr);
      return `${d.getDate()} ${months[d.getMonth()]}`;
    };

    const renderMeasurementSpark = (points) => {
      if (!points || points.length < 2) return null;
      
      // Реверсируем чтобы старые слева, новые справа
      const reversed = [...points].reverse();
      const values = reversed.map(p => p.value);
      const dates = reversed.map(p => formatShortDate(p.date));
      
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const width = 100;
      const height = 20;
      
      // Padding чтобы точки не на самом краю (для центрирования дат)
      const padding = 8;
      const step = reversed.length > 1 ? (width - padding * 2) / (reversed.length - 1) : 0;
      
      // Вычисляем координаты точек
      const pointCoords = values.map((v, idx) => ({
        x: padding + idx * step,
        y: height - ((v - min) / span) * (height - 6) - 3
      }));
      
      const svgPoints = pointCoords.map(p => `${p.x},${p.y}`).join(' ');
      
      // Позиции дат в процентах (для CSS left)
      const datePositions = pointCoords.map(p => p.x);
      
      return React.createElement('div', { className: 'measurement-spark-container' },
        // SVG график
        React.createElement('svg', { className: 'measurement-spark', viewBox: '0 0 100 20' },
          // Вертикальные пунктирные линии
          pointCoords.map((p, idx) => 
            React.createElement('line', {
              key: 'grid-' + idx,
              x1: p.x,
              y1: 0,
              x2: p.x,
              y2: height,
              stroke: '#e5e7eb',
              strokeWidth: 0.5,
              strokeDasharray: '1,2'
            })
          ),
          // Линия графика
          React.createElement('polyline', {
            points: svgPoints,
            fill: 'none',
            stroke: 'var(--acc, #3b82f6)',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          }),
          // Точки
          pointCoords.map((p, idx) => 
            React.createElement('circle', {
              key: 'dot-' + idx,
              cx: p.x,
              cy: p.y,
              r: 2.5,
              fill: idx === pointCoords.length - 1 ? 'var(--acc, #3b82f6)' : '#fff',
              stroke: 'var(--acc, #3b82f6)',
              strokeWidth: 1
            })
          )
        ),
        // Даты под графиком — абсолютное позиционирование под точками
        React.createElement('div', { className: 'measurement-spark-dates' },
          dates.map((d, idx) => 
            React.createElement('span', { 
              key: 'date-' + idx,
              className: 'measurement-spark-date-label',
              style: { left: `${datePositions[idx]}%`, transform: 'translateX(-50%)' }
            }, d)
          )
        )
      );
    };

    // === Управление попапами: одновременно может быть только один ===
    const closeAllPopups = React.useCallback(() => {
      setSparklinePopup(null);
      setMacroBadgePopup(null);
      setMetricPopup(null);
      setTdeePopup(null);
      setMealQualityPopup(null);
    }, []);

    const openExclusivePopup = React.useCallback((type, payload) => {
      setSparklinePopup(type === 'sparkline' ? payload : null);
      setMacroBadgePopup(type === 'macro' ? payload : null);
      setMetricPopup(type === 'metric' ? payload : null);
      setTdeePopup(type === 'tdee' ? payload : null);
      setMealQualityPopup(type === 'mealQuality' ? payload : null);
      setWeekNormPopup(type === 'weekNorm' ? payload : null);
    }, []);
    
    // === Slider для интерактивного просмотра графика ===
    const [sliderPoint, setSliderPoint] = useState(null);
    const sliderPrevPointRef = React.useRef(null);
    
    // === Zoom & Pan для графика ===
    const [sparklineZoom, setSparklineZoom] = useState(1); // 1 = 100%, 2 = 200%
    const [sparklinePan, setSparklinePan] = useState(0); // смещение по X в %
    const sparklineZoomRef = React.useRef({ initialDistance: 0, initialZoom: 1 });
    
    // === Brush selection — выбор диапазона ===
    const [brushRange, setBrushRange] = useState(null); // { start: idx, end: idx }
    const [brushing, setBrushing] = useState(false);
    const brushStartRef = React.useRef(null);
    
    // Закрытие popup при клике вне
    React.useEffect(() => {
      if (!sparklinePopup && !macroBadgePopup && !metricPopup && !mealQualityPopup && !tdeePopup && !weekNormPopup) return;
      const handleClickOutside = (e) => {
        if (sparklinePopup && !e.target.closest('.sparkline-popup')) {
          setSparklinePopup(null);
        }
        if (macroBadgePopup && !e.target.closest('.macro-badge-popup')) {
          setMacroBadgePopup(null);
        }
        if (metricPopup && !e.target.closest('.metric-popup')) {
          setMetricPopup(null);
        }
        if (mealQualityPopup && !e.target.closest('.meal-quality-popup') && !e.target.closest('.meal-bar-container')) {
          setMealQualityPopup(null);
        }
        if (tdeePopup && !e.target.closest('.tdee-popup')) {
          setTdeePopup(null);
        }
        if (weekNormPopup && !e.target.closest('.week-norm-popup')) {
          setWeekNormPopup(null);
        }
        if (debtPopup && !e.target.closest('.debt-popup') && !e.target.closest('.caloric-debt-card')) {
          setDebtPopup(null);
        }
      };
      // Delay to avoid closing immediately on the same click
      const timerId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
      return () => {
        clearTimeout(timerId);
        document.removeEventListener('click', handleClickOutside);
      };
    }, [sparklinePopup, macroBadgePopup, metricPopup, mealQualityPopup, tdeePopup, weekNormPopup, debtPopup]);
    
    // === Утилита для умного позиционирования попапов ===
    // Не даёт выходить за границы экрана
    const getSmartPopupPosition = React.useCallback((clickX, clickY, popupWidth, popupHeight, options = {}) => {
      const {
        preferAbove = false,      // Предпочитать показ сверху
        margin = 12,              // Отступ от краёв экрана
        offset = 15,              // Отступ от точки клика
        arrowSize = 8             // Размер стрелки (для расчёта)
      } = options;
      
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      
      // Горизонтальная позиция
      let left, arrowPos = 'center';
      if (clickX < popupWidth / 2 + margin) {
        left = margin;
        arrowPos = 'left';
      } else if (clickX > screenW - popupWidth / 2 - margin) {
        left = screenW - popupWidth - margin;
        arrowPos = 'right';
      } else {
        left = clickX - popupWidth / 2;
      }
      
      // Вертикальная позиция — проверяем выход за нижнюю границу
      let top, showAbove = false;
      const spaceBelow = screenH - clickY - offset;
      const spaceAbove = clickY - offset;
      
      if (preferAbove && spaceAbove >= popupHeight) {
        // Показываем сверху если есть место и это предпочтительно
        top = clickY - popupHeight - offset;
        showAbove = true;
      } else if (spaceBelow >= popupHeight) {
        // Есть место снизу
        top = clickY + offset;
      } else if (spaceAbove >= popupHeight) {
        // Нет места снизу, но есть сверху
        top = clickY - popupHeight - offset;
        showAbove = true;
      } else {
        // Нет места ни сверху ни снизу — центрируем по вертикали
        top = Math.max(margin, (screenH - popupHeight) / 2);
      }
      
      // Дополнительная проверка: не выходим за верхний край
      if (top < margin) {
        top = margin;
      }
      
      // Не выходим за нижний край
      if (top + popupHeight > screenH - margin) {
        top = screenH - popupHeight - margin;
      }
      
      return { left, top, arrowPos, showAbove };
    }, []);
    
    // === Toast для подсказок БЖУ ===
    const [toastVisible, setToastVisible] = useState(false);
    const [toastDismissed, setToastDismissed] = useState(false);
    const toastTimeoutRef = React.useRef(null);
    const [toastSwipeX, setToastSwipeX] = useState(0);
    const [toastSwiped, setToastSwiped] = useState(false); // Показывать overlay с кнопками (как в AdviceCard)
    const [toastScheduledConfirm, setToastScheduledConfirm] = useState(false); // Подтверждение "Через 2ч"
    const [toastDetailsOpen, setToastDetailsOpen] = useState(false); // Раскрыты ли details в тосте
    const toastTouchStart = React.useRef(0);
    
    // Touch handlers для swipe — показываем overlay с кнопками (как в AdviceCard)
    // ⚠️ ВАЖНО: stopPropagation чтобы не триггерить свайп вкладок
    const handleToastTouchStart = (e) => {
      if (toastSwiped) return; // Если overlay показан — не свайпаем
      e.stopPropagation();
      toastTouchStart.current = e.touches[0].clientX;
    };
    const handleToastTouchMove = (e) => {
      if (toastSwiped) return;
      e.stopPropagation();
      const diff = e.touches[0].clientX - toastTouchStart.current;
      // Только влево (как в списке советов)
      if (diff < 0) {
        setToastSwipeX(diff);
      }
    };
    const handleToastTouchEnd = (e) => {
      if (toastSwiped) return;
      e.stopPropagation();
      // Свайп влево > 80px — показываем overlay с кнопками + таймер 3 сек
      if (toastSwipeX < -80) {
        setToastSwiped(true);
        setToastScheduledConfirm(false);
        // Таймер 3 сек — потом dismiss
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => {
          dismissToast();
        }, 3000);
      }
      setToastSwipeX(0);
    };
    
    // Отмена свайпа (вернуть тост)
    const handleToastUndo = () => {
      setToastSwiped(false);
      setToastScheduledConfirm(false);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
    
    // Отложить совет на 2 часа
    const handleToastSchedule = (e) => {
      e && e.stopPropagation();
      if (displayedAdvice && scheduleAdvice) {
        scheduleAdvice(displayedAdvice, 120);
        setToastScheduledConfirm(true);
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);
        // Закрыть через 1.5 сек
        setTimeout(() => {
          dismissToast();
        }, 1500);
      }
    };
    
    // === Advice Module State ===
    const [adviceTrigger, setAdviceTrigger] = useState(null);
    const [adviceExpanded, setAdviceExpanded] = useState(false);
    // 🔧 Защита от случайных кликов — игнорируем первые 500ms после появления тоста
    const toastAppearedAtRef = useRef(0);
    // 🔧 FIX: Храним текущий отображаемый совет и список советов отдельно
    // чтобы избежать race condition при markShown()
    const [displayedAdvice, setDisplayedAdvice] = useState(null);
    const [displayedAdviceList, setDisplayedAdviceList] = useState([]);
    // Автопоказ тостов (FAB работает всегда)
    const [toastsEnabled, setToastsEnabled] = useState(() => {
      try {
        const settings = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
        return settings.toastsEnabled !== false; // true по умолчанию
      } catch(e) { return true; }
    });
    // Звук для модуля советов (ding/whoosh/pop)
    const [adviceSoundEnabled, setAdviceSoundEnabled] = useState(() => {
      try {
        const settings = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
        // true по умолчанию, выключить можно вручную
        return settings.adviceSoundEnabled !== false;
      } catch(e) { return true; }
    });
    // Прочитанные советы (свайп влево) — сохраняются на день
    const [dismissedAdvices, setDismissedAdvices] = useState(() => {
      try {
        const saved = localStorage.getItem('heys_advice_read_today');
        if (saved) {
          const { date, ids } = JSON.parse(saved);
          if (date === new Date().toISOString().slice(0, 10)) {
            return new Set(ids);
          }
        }
      } catch(e) {}
      return new Set();
    });
    // Скрытые до завтра советы (свайп вправо)
    const [hiddenUntilTomorrow, setHiddenUntilTomorrow] = useState(() => {
      try {
        const saved = localStorage.getItem('heys_advice_hidden_today');
        if (saved) {
          const { date, ids } = JSON.parse(saved);
          if (date === new Date().toISOString().slice(0, 10)) {
            return new Set(ids);
          }
        }
      } catch(e) {}
      return new Set();
    });
    const [adviceSwipeState, setAdviceSwipeState] = useState({}); // { adviceId: { x, direction } }
    const [expandedAdviceId, setExpandedAdviceId] = useState(null);
    const [dismissAllAnimation, setDismissAllAnimation] = useState(false);
    const [lastDismissedAdvice, setLastDismissedAdvice] = useState(null); // { id, action: 'read'|'hidden', timeout }
    const [undoFading, setUndoFading] = useState(false); // для fade-out анимации
    const adviceSwipeStart = React.useRef({});
    const adviceCardRefs = React.useRef({}); // refs для floating XP
    const dismissToastRef = React.useRef(null);
    const registerAdviceCardRef = React.useCallback((adviceId, el) => {
      if (el) adviceCardRefs.current[adviceId] = el;
    }, []);
    // Свайп вниз для закрытия списка советов
    const adviceListTouchStartY = React.useRef(null);
    const adviceListTouchLastY = React.useRef(null);
    const handleAdviceListTouchStart = React.useCallback((e) => {
      if (!e.touches?.length) return;
      adviceListTouchStartY.current = e.touches[0].clientY;
      adviceListTouchLastY.current = e.touches[0].clientY;
    }, []);
    const handleAdviceListTouchMove = React.useCallback((e) => {
      if (!e.touches?.length || adviceListTouchStartY.current === null) return;
      adviceListTouchLastY.current = e.touches[0].clientY;
    }, []);
    const handleAdviceListTouchEnd = React.useCallback(() => {
      if (adviceListTouchStartY.current === null || adviceListTouchLastY.current === null) return;
      const diff = adviceListTouchLastY.current - adviceListTouchStartY.current;
      adviceListTouchStartY.current = null;
      adviceListTouchLastY.current = null;
      if (diff > 50 && typeof dismissToastRef.current === 'function') {
        dismissToastRef.current();
      }
    }, []);
    
    // Группировка и сортировка советов
    const ADVICE_PRIORITY = { warning: 0, insight: 1, tip: 2, achievement: 3, info: 4 };
    const ADVICE_CATEGORY_NAMES = {
      nutrition: '🍎 Питание',
      training: '💪 Тренировки', 
      lifestyle: '🌙 Режим',
      hydration: '💧 Вода',
      emotional: '🧠 Психология',
      achievement: '🏆 Достижения',
      motivation: '✨ Мотивация',
      personalized: '👤 Персональное',
      correlation: '🔗 Корреляции',
      timing: '⏰ Тайминг',
      sleep: '😴 Сон',
      activity: '🚶 Активность'
    };
    
    const getSortedGroupedAdvices = React.useCallback((advices) => {
      if (!advices?.length) return { sorted: [], groups: {} };
      
      // Фильтруем прочитанные и скрытые до завтра
      // ВАЖНО: оставляем lastDismissedAdvice для показа undo overlay
      const filtered = advices.filter(a => 
        (!dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id)) || 
        (lastDismissedAdvice?.id === a.id)
      );
      
      // Сортируем по приоритету (warning сверху, achievement снизу)
      const sorted = [...filtered].sort((a, b) => 
        (ADVICE_PRIORITY[a.type] ?? 99) - (ADVICE_PRIORITY[b.type] ?? 99)
      );
      
      // Группируем по категории
      const groups = {};
      sorted.forEach(advice => {
        const cat = advice.category || 'other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(advice);
      });
      
      return { sorted, groups };
    }, [dismissedAdvices, hiddenUntilTomorrow, lastDismissedAdvice]);
    
    // Handlers для swipe советов (влево = прочитано, вправо = скрыть до завтра)
    const handleAdviceSwipeStart = React.useCallback((adviceId, e) => {
      adviceSwipeStart.current[adviceId] = e.touches[0].clientX;
    }, []);
    const handleAdviceSwipeMove = React.useCallback((adviceId, e) => {
      const startX = adviceSwipeStart.current[adviceId];
      if (startX === undefined) return;
      const diff = e.touches[0].clientX - startX;
      const direction = diff < 0 ? 'left' : 'right';
      setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: diff, direction } }));
    }, []);
    
    // 🔊 Звуки для swipe действий — используем централизованный модуль
    const playAdviceSound = React.useCallback(() => {
      // Свайп влево (прочитано) — ding
      if (adviceSoundEnabled && window.HEYS?.sounds) {
        window.HEYS.sounds.ding();
      }
    }, [adviceSoundEnabled]);
    
    const playAdviceHideSound = React.useCallback(() => {
      // Свайп вправо (скрыть) — whoosh
      if (adviceSoundEnabled && window.HEYS?.sounds) {
        window.HEYS.sounds.whoosh();
      }
    }, [adviceSoundEnabled]);
    
    // Toggle автопоказа тостов (FAB всегда работает)
    const toggleToastsEnabled = React.useCallback(() => {
      setToastsEnabled(prev => {
        const newVal = !prev;
        try {
          const settings = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
          settings.toastsEnabled = newVal;
          localStorage.setItem('heys_advice_settings', JSON.stringify(settings));
          window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
        } catch(e) {}
        // Haptic feedback
        if (typeof haptic === 'function') haptic('light');
        return newVal;
      });
    }, [haptic]);

    // Вкл/выкл звук в модуле советов
    const toggleAdviceSoundEnabled = React.useCallback(() => {
      setAdviceSoundEnabled(prev => {
        const newVal = !prev;
        try {
          const settings = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
          settings.adviceSoundEnabled = newVal;
          localStorage.setItem('heys_advice_settings', JSON.stringify(settings));
          window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
        } catch(e) {}
        if (typeof haptic === 'function') haptic('light');
        return newVal;
      });
    }, [haptic]);
    
    // Undo последнего действия
    const undoLastDismiss = React.useCallback(() => {
      if (!lastDismissedAdvice) return;
      const { id, action, hideTimeout } = lastDismissedAdvice;
      
      // Очищаем таймер
      if (hideTimeout) clearTimeout(hideTimeout);
      
      if (action === 'read' || action === 'hidden') {
        // Возвращаем совет
        setDismissedAdvices(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          try {
            localStorage.setItem('heys_advice_read_today', JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            }));
          } catch(e) {}
          return newSet;
        });
      }
      if (action === 'hidden') {
        setHiddenUntilTomorrow(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          try {
            localStorage.setItem('heys_advice_hidden_today', JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            }));
          } catch(e) {}
          return newSet;
        });
      }
      
      setLastDismissedAdvice(null);
      haptic('light');
    }, [haptic, lastDismissedAdvice]);
    
    // Просто очистить undo overlay (для schedule — совет остаётся dismissed)
    const clearLastDismissed = React.useCallback(() => {
      if (lastDismissedAdvice?.hideTimeout) {
        clearTimeout(lastDismissedAdvice.hideTimeout);
      }
      setLastDismissedAdvice(null);
    }, [lastDismissedAdvice]);
    
    const handleAdviceSwipeEnd = React.useCallback((adviceId) => {
      const state = adviceSwipeState[adviceId];
      const swipeX = state?.x || 0;
      
      // Очищаем предыдущий undo таймер
      if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);
      
      if (swipeX < -100) {
        // Свайп влево = прочитано (сохраняется на день)
        // Свайп влево = прочитано
        setDismissedAdvices(prev => {
          const newSet = new Set([...prev, adviceId]);
          const saveData = {
            date: new Date().toISOString().slice(0, 10),
            ids: [...newSet]
          };
          try {
            localStorage.setItem('heys_advice_read_today', JSON.stringify(saveData));
          } catch(e) {
            // Тихо игнорируем ошибки localStorage
          }
          return newSet;
        });
        
        // +XP за прочтение совета с floating animation
        if (window.HEYS?.game?.addXP) {
          const cardEl = adviceCardRefs.current[adviceId];
          window.HEYS.game.addXP(0, 'advice_read', cardEl);
        }
        
        // Звук
        playAdviceSound();
        haptic('light');
        
        // Undo — показываем 3 секунды (прогресс-бар в overlay)
        setUndoFading(false);
        const hideTimeout = setTimeout(() => {
          setLastDismissedAdvice(null);
          setUndoFading(false);
        }, 3000);
        setLastDismissedAdvice({ id: adviceId, action: 'read', hideTimeout });
        
      } else if (swipeX > 100) {
        // Свайп вправо = скрыть до завтра + прочитано
        setHiddenUntilTomorrow(prev => {
          const newSet = new Set([...prev, adviceId]);
          try {
            localStorage.setItem('heys_advice_hidden_today', JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            }));
          } catch(e) {}
          return newSet;
        });
        // Также отмечаем как прочитанное
        setDismissedAdvices(prev => {
          const newSet = new Set([...prev, adviceId]);
          try {
            localStorage.setItem('heys_advice_read_today', JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            }));
          } catch(e) {}
          return newSet;
        });
        
        // 🔊 Звук скрытия совета
        playAdviceHideSound();
        haptic('medium');
        
        // Undo — показываем 3 секунды (прогресс-бар в overlay)
        setUndoFading(false);
        const hideTimeout = setTimeout(() => {
          setLastDismissedAdvice(null);
          setUndoFading(false);
        }, 3000);
        setLastDismissedAdvice({ id: adviceId, action: 'hidden', hideTimeout });
      }
      
      setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
      delete adviceSwipeStart.current[adviceId];
    }, [adviceSwipeState, haptic, lastDismissedAdvice, playAdviceSound, playAdviceHideSound, setDismissedAdvices, setHiddenUntilTomorrow]);
    
    // Долгий тап для раскрытия деталей
    const adviceLongPressTimer = React.useRef(null);
    const handleAdviceLongPressStart = React.useCallback((adviceId) => {
      adviceLongPressTimer.current = setTimeout(() => {
        setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
        haptic('light');
      }, 500);
    }, [haptic]);
    const handleAdviceLongPressEnd = React.useCallback(() => {
      if (adviceLongPressTimer.current) {
        clearTimeout(adviceLongPressTimer.current);
        adviceLongPressTimer.current = null;
      }
    }, []);
    
    // Toggle раскрытия совета по тапу
    const handleAdviceToggleExpand = React.useCallback((adviceId) => {
      setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
      haptic('light');
    }, [haptic]);
    
    // "Прочитать все" с эффектом домино
    const handleDismissAll = () => {
      setDismissAllAnimation(true);
      haptic('medium');
      
      // Домино-эффект с задержкой
      const advices = adviceRelevant?.filter(a => !dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id)) || [];
      const allIds = advices.map(a => a.id);
      
      advices.forEach((advice, index) => {
        setTimeout(() => {
          setDismissedAdvices(prev => {
            const newSet = new Set([...prev, advice.id]);
            // Сохраняем на последнем шаге
            if (index === advices.length - 1) {
              try {
                localStorage.setItem('heys_advice_read_today', JSON.stringify({
                  date: new Date().toISOString().slice(0, 10),
                  ids: [...newSet]
                }));
              } catch(e) {}
            }
            return newSet;
          });
          if (index < 3) haptic('light'); // Haptic только для первых 3
        }, index * 80);
      });
      
      // Закрыть модалку после анимации
      setTimeout(() => {
        setDismissAllAnimation(false);
        dismissToast();
      }, advices.length * 80 + 300);
    };
    
    // Сброс swipe state при закрытии списка (но НЕ dismissedAdvices — они персистентные)
    React.useEffect(() => {
      if (adviceTrigger !== 'manual') {
        setAdviceSwipeState({});
        setExpandedAdviceId(null);
        setDismissAllAnimation(false);
      }
    }, [adviceTrigger]);
    
    // Записываем дату последнего визита (для returning emotional state)
    // Задержка 3 сек, чтобы advice успел прочитать старое значение
    React.useEffect(() => {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem('heys_last_visit', new Date().toISOString().slice(0, 10));
        } catch(e) {}
      }, 3000);
      return () => clearTimeout(timer);
    }, []);
    
    // === Pull-to-refresh (Enhanced) ===
    const [pullProgress, setPullProgress] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('idle'); // idle | pulling | ready | syncing | success | error
    const pullStartY = React.useRef(0);
    const isPulling = React.useRef(false);
    const lastHapticRef = React.useRef(0);
    
    // === Current time for Insulin Wave Indicator (updates every minute) ===
    const [currentMinute, setCurrentMinute] = useState(() => Math.floor(Date.now() / 60000));
    const [insulinExpanded, setInsulinExpanded] = useState(false);
    React.useEffect(() => {
      const intervalId = setInterval(() => {
        setCurrentMinute(Math.floor(Date.now() / 60000));
      }, 60000); // Обновляем каждую минуту
      return () => clearInterval(intervalId);
    }, []);
    
    // === Offline indicator ===
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingChanges, setPendingChanges] = useState(false);
    const [syncMessage, setSyncMessage] = useState(''); // '' | 'offline' | 'pending' | 'syncing' | 'synced'
    const [pendingQueue, setPendingQueue] = useState([]); // Очередь изменений для Optimistic UI
    
    // Слушаем online/offline события
    React.useEffect(() => {
      const handleOnline = async () => {
        setIsOnline(true);
        // Автоматическая синхронизация при восстановлении сети
        if (pendingChanges) {
          setSyncMessage('syncing');
          const cloud = window.HEYS && window.HEYS.cloud;
          const U = window.HEYS && window.HEYS.utils;
          const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
          try {
            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
              await cloud.bootstrapClientSync(clientId);
            }
            setSyncMessage('synced');
            setPendingChanges(false);
            // Скрываем через 2 сек
            setTimeout(() => setSyncMessage(''), 2000);
          } catch (e) {
            setSyncMessage('pending');
          }
        }
      };
      
      const handleOffline = () => {
        setIsOnline(false);
        setSyncMessage('offline');
      };
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      // Начальная проверка
      if (!navigator.onLine) {
        setSyncMessage('offline');
      }
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, [pendingChanges]);
    
    // Отслеживаем изменения данных (для pendingChanges)
    React.useEffect(() => {
      const handleDataChange = (e) => {
        if (!navigator.onLine) {
          setPendingChanges(true);
          setSyncMessage('pending');
          
          // Добавляем в очередь (если есть детали)
          if (e.detail && e.detail.type) {
            setPendingQueue(prev => {
              const newItem = {
                id: Date.now(),
                type: e.detail.type,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              };
              // Максимум 5 последних изменений
              return [...prev, newItem].slice(-5);
            });
          }
        }
      };
      
      // Слушаем события сохранения
      window.addEventListener('heys:data-saved', handleDataChange);
      return () => window.removeEventListener('heys:data-saved', handleDataChange);
    }, []);
    
    // Очистка очереди при успешной синхронизации
    React.useEffect(() => {
      if (syncMessage === 'synced') {
        setPendingQueue([]);
      }
    }, [syncMessage]);

    // === Dark Theme (3 modes: light / dark / auto) ===
    const [theme, setTheme] = useState(() => {
      const saved = localStorage.getItem('heys_theme');
      // Валидация: только light/dark/auto, иначе light
      return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
    });
    
    // Вычисляем реальную тему (для auto режима)
    const resolvedTheme = useMemo(() => {
      if (theme === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme;
    }, [theme]);
    
    // Применяем тему + слушаем системные изменения
    React.useEffect(() => {
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      try {
        localStorage.setItem('heys_theme', theme);
      } catch (e) {
        // QuotaExceeded — игнорируем, тема применится через data-theme
      }
      
      if (theme !== 'auto') return;
      
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }, [theme, resolvedTheme]);
    
    // Cycle: light → dark → auto → light
    const cycleTheme = () => {
      setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
    };
    
    // === Confetti при достижении цели ===
    const [showConfetti, setShowConfetti] = useState(false);
    const confettiShownRef = React.useRef(false);
    const prevKcalRef = React.useRef(0);
    
    // === Подсказка "нажми для деталей" ===
    const [mealChartHintShown, setMealChartHintShown] = useState(() => {
      try { return localStorage.getItem('heys_meal_hint_shown') === '1'; } catch { return false; }
    });
    
    // === Ачивка "Первый идеальный приём" ===
    const [showFirstPerfectAchievement, setShowFirstPerfectAchievement] = useState(false);
    const firstPerfectShownRef = React.useRef(false);
    
    // === Анимация нового приёма в графике ===
    const [newMealAnimatingIndex, setNewMealAnimatingIndex] = useState(-1);
    const prevMealsCountRef = React.useRef(0);
    
    // === Emoji анимация в рейтинг модалке ===
    const [emojiAnimating, setEmojiAnimating] = useState({ mood: '', wellbeing: '', stress: '' });
    
    // === Анимации карточек при превышении/успехе ===
    const [shakeEaten, setShakeEaten] = useState(false);   // карточка "Съедено" — shake при превышении
    const [shakeOver, setShakeOver] = useState(false);     // карточка "Перебор" — shake при превышении
    const [pulseSuccess, setPulseSuccess] = useState(false); // карточка "Съедено" — pulse при успехе
    
    // === Progress animation ===
    const [animatedProgress, setAnimatedProgress] = useState(0);
    const [animatedKcal, setAnimatedKcal] = useState(0);
    const [animatedRatioPct, setAnimatedRatioPct] = useState(0); // Анимированный % для бейджа
    const [animatedMarkerPos, setAnimatedMarkerPos] = useState(0); // Позиция бейджа (всегда до 100%)
    const [isAnimating, setIsAnimating] = useState(false);
    
    // === Edit Grams Modal (slider-based, like MealAddProduct) ===
    const [editGramsTarget, setEditGramsTarget] = useState(null); // {mealIndex, itemId, product}
    const [editGramsValue, setEditGramsValue] = useState(100);
    const editGramsInputRef = React.useRef(null);
    
    // 🍽️ Авто-порции для редактирования граммов
    const editPortions = useMemo(() => {
      if (!editGramsTarget?.product) return [];
      const product = editGramsTarget.product;
      if (product.portions?.length) return product.portions;
      // Используем функцию из моделей
      const M = window.HEYS?.models;
      if (M?.getAutoPortions) {
        return M.getAutoPortions(product.name);
      }
      return [];
    }, [editGramsTarget?.product]);
    
    // Последняя выбранная порция для edit modal
    const editLastPortionGrams = useMemo(() => {
      if (!editGramsTarget?.product?.id) return null;
      const M = window.HEYS?.models;
      return M?.getLastPortion ? M.getLastPortion(editGramsTarget.product.id) : null;
    }, [editGramsTarget?.product?.id]);
    
    // === Zone Minutes Picker Modal ===
    const [showZonePicker, setShowZonePicker] = useState(false);
    const [zonePickerTarget, setZonePickerTarget] = useState(null); // {trainingIndex, zoneIndex}
    const [pendingZoneMinutes, setPendingZoneMinutes] = useState(0);
    // Значения минут: 0-120
    const zoneMinutesValues = useMemo(() => Array.from({length: 121}, (_, i) => String(i)), []);
    
    // === Zone Formula Popup ===
    const [zoneFormulaPopup, setZoneFormulaPopup] = useState(null); // {ti, zi, x, y}
    
    // === Household Formula Popup ===
    const [householdFormulaPopup, setHouseholdFormulaPopup] = useState(null); // {hi, x, y}
    
    // === Sleep Quality Picker Modal ===
    const [showSleepQualityPicker, setShowSleepQualityPicker] = useState(false);
    const [pendingSleepQuality, setPendingSleepQuality] = useState(0);
    const [pendingSleepNote, setPendingSleepNote] = useState(''); // временный комментарий
    const sleepQualityValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);
    
    // === Day Score Picker Modal ===
    const [showDayScorePicker, setShowDayScorePicker] = useState(false);
    const [pendingDayScore, setPendingDayScore] = useState(0);
    const [pendingDayComment, setPendingDayComment] = useState(''); // временный комментарий
    const dayScoreValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);
    
    // === Weight Picker Modal (теперь использует StepModal) ===
    const [showWeightPicker, setShowWeightPicker] = useState(false); // для совместимости с uiState
    
    // Пульсация блока корреляции при изменении веса
    const [correlationPulse, setCorrelationPulse] = useState(false);
    const prevWeightRef = useRef(day.weightMorning);
    
    useEffect(() => {
      // Пульсация при изменении веса
      if (prevWeightRef.current !== day.weightMorning && day.weightMorning) {
        setCorrelationPulse(true);
        const timer = setTimeout(() => setCorrelationPulse(false), 600);
        prevWeightRef.current = day.weightMorning;
        return () => clearTimeout(timer);
      }
      prevWeightRef.current = day.weightMorning;
    }, [day.weightMorning]);
    
    // Цель шагов: state для реактивного обновления слайдера
    const [savedStepsGoal, setSavedStepsGoal] = useState(() => prof.stepsGoal || 7000);
    
    // Слушаем завершение синхронизации cloud и изменения профиля для обновления stepsGoal
    // 🔒 Флаг для пропуска первого sync (предотвращает мерцание)
    const initialStepsSyncDoneRef = useRef(false);
    
    useEffect(() => {
      const handleProfileUpdate = (e) => {
        // 🔒 Пропускаем первый heysSyncCompleted — savedStepsGoal уже инициализирован из профиля
        if (e.type === 'heysSyncCompleted') {
          if (!initialStepsSyncDoneRef.current) {
            initialStepsSyncDoneRef.current = true;
            return;
          }
        }
        
        // Используем значение из события напрямую (если есть), иначе из storage
        const stepsFromEvent = e?.detail?.stepsGoal;
        if (stepsFromEvent != null) {
          // 🔒 Не обновляем если значение то же (предотвращает ре-рендер)
          setSavedStepsGoal(prev => prev === stepsFromEvent ? prev : stepsFromEvent);
          return;
        }
        // Fallback для cloud sync (heysSyncCompleted)
        const profileFromStorage = getProfile();
        if (profileFromStorage.stepsGoal) {
          // 🔒 Не обновляем если значение то же
          setSavedStepsGoal(prev => prev === profileFromStorage.stepsGoal ? prev : profileFromStorage.stepsGoal);
        }
      };
      
      // Слушаем кастомный event от cloud синхронизации
      window.addEventListener('heysSyncCompleted', handleProfileUpdate);
      // Слушаем изменения профиля из StepModal
      window.addEventListener('heys:profile-updated', handleProfileUpdate);
      
      return () => {
        window.removeEventListener('heysSyncCompleted', handleProfileUpdate);
        window.removeEventListener('heys:profile-updated', handleProfileUpdate);
      };
    }, []); // Пустой массив — слушатели регистрируются один раз
    
    // === Открытие StepModal для веса и шагов ===
    function openWeightPicker() {
      if (HEYS.showCheckin && HEYS.showCheckin.weight) {
        HEYS.showCheckin.weight();
      }
    }
    
    function openStepsGoalPicker() {
      if (HEYS.showCheckin && HEYS.showCheckin.steps) {
        HEYS.showCheckin.steps();
      }
    }

    // === Deficit Picker (теперь использует StepModal) ===
    const [showDeficitPicker, setShowDeficitPicker] = useState(false); // для совместимости с uiState
    
    // Дефицит из профиля или дефолт 0
    const profileDeficit = prof.deficitPctTarget ?? 0;
    // day.deficitPct может быть '', null, undefined — проверяем все случаи
    const currentDeficit = (day.deficitPct !== '' && day.deficitPct != null) ? day.deficitPct : profileDeficit;
    
    function openDeficitPicker() {
      // Используем StepModal вместо старого пикера
      if (HEYS.showCheckin && HEYS.showCheckin.deficit) {
        HEYS.showCheckin.deficit(date);
      }
    }

    // === Water Tracking ===
    const [waterAddedAnim, setWaterAddedAnim] = useState(null); // для анимации "+200"
    const [showWaterDrop, setShowWaterDrop] = useState(false); // анимация падающей капли
    const [showWaterTooltip, setShowWaterTooltip] = useState(false); // тултип с формулой
    const waterLongPressRef = React.useRef(null); // для long press

    // Быстрые пресеты воды
    const waterPresets = [
      { ml: 100, label: '100 мл', icon: '💧' },
      { ml: 200, label: 'Стакан', icon: '🥛' },
      { ml: 330, label: 'Бутылка', icon: '🧴' },
      { ml: 500, label: '0.5л', icon: '🍶' }
    ];

    // Динамический расчёт нормы воды с детализацией
    const waterGoalBreakdown = useMemo(() => {
      const w = +day.weightMorning || +prof.weight || 70;
      const age = +prof.age || 30;
      const isFemale = prof.sex === 'female';
      const coef = isFemale ? 28 : 30;
      
      // Базовая норма: вес × коэффициент
      const baseRaw = w * coef;
      
      // Корректировка по возрасту
      let ageFactor = 1;
      let ageNote = '';
      if (age >= 60) { ageFactor = 0.9; ageNote = '−10% (60+)'; }
      else if (age >= 40) { ageFactor = 0.95; ageNote = '−5% (40+)'; }
      const base = baseRaw * ageFactor;
      
      // +250мл за каждые 5000 шагов
      const stepsCount = Math.floor((day.steps || 0) / 5000);
      const stepsBonus = stepsCount * 250;
      
      // +500мл за тренировку
      const trainCount = [train1k, train2k, train3k].filter(k => k > 50).length;
      const trainBonus = trainCount * 500;
      
      // Сезонный бонус: +300мл летом (июнь-август)
      const month = new Date().getMonth(); // 0-11
      const isHotSeason = month >= 5 && month <= 7; // июнь(5), июль(6), август(7)
      const seasonBonus = isHotSeason ? 300 : 0;
      const seasonNote = isHotSeason ? '☀️ Лето' : '';
      
      // Бонус за особый период (менструальный цикл)
      const cycleMultiplier = HEYS.Cycle?.getWaterMultiplier?.(day.cycleDay) || 1;
      const cycleBonus = cycleMultiplier > 1 ? Math.round(base * (cycleMultiplier - 1)) : 0;
      const cycleNote = cycleBonus > 0 ? '🌸 Особый период' : '';
      
      // Итого
      const total = Math.round((base + stepsBonus + trainBonus + seasonBonus + cycleBonus) / 100) * 100;
      const finalGoal = Math.max(1500, Math.min(5000, total));
      
      return {
        weight: w,
        coef,
        baseRaw: Math.round(baseRaw),
        ageFactor,
        ageNote,
        base: Math.round(base),
        stepsCount,
        stepsBonus,
        trainCount,
        trainBonus,
        seasonBonus,
        seasonNote,
        cycleBonus,
        cycleNote,
        total: Math.round(total),
        finalGoal
      };
    }, [day.weightMorning, day.steps, day.cycleDay, train1k, train2k, train3k, prof.weight, prof.age, prof.sex]);

    const waterGoal = waterGoalBreakdown.finalGoal;

    // Мотивационное сообщение по прогрессу
    const waterMotivation = useMemo(() => {
      const pct = ((day.waterMl || 0) / waterGoal) * 100;
      if (pct >= 100) return { emoji: '🏆', text: 'Цель достигнута!' };
      if (pct >= 75) return { emoji: '🔥', text: 'Почти у цели!' };
      if (pct >= 50) return { emoji: '🎯', text: 'Половина пути!' };
      if (pct >= 25) return { emoji: '🌊', text: 'Хороший старт!' };
      return { emoji: '💧', text: 'Добавь воды' };
    }, [day.waterMl, waterGoal]);

    // Расчёт времени с последнего приёма воды
    const waterLastDrink = useMemo(() => {
      const lastTime = day.lastWaterTime;
      if (!lastTime) return null;
      
      const now = Date.now();
      const diffMs = now - lastTime;
      const diffMin = Math.floor(diffMs / 60000);
      
      if (diffMin < 60) {
        return { minutes: diffMin, text: diffMin + ' мин назад', isLong: false };
      }
      
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      const isLong = hours >= 2; // больше 2 часов = напоминание
      const text = hours + 'ч' + (mins > 0 ? ' ' + mins + 'мин' : '') + ' назад';
      
      return { hours, minutes: mins, text, isLong };
    }, [day.lastWaterTime]);

    // Long press для показа тултипа с формулой
    function handleWaterRingDown(e) {
      waterLongPressRef.current = setTimeout(() => {
        setShowWaterTooltip(true);
        haptic('light');
      }, 400);
    }
    function handleWaterRingUp() {
      if (waterLongPressRef.current) {
        clearTimeout(waterLongPressRef.current);
        waterLongPressRef.current = null;
      }
    }
    function handleWaterRingLeave() {
      handleWaterRingUp();
      // На десктопе скрываем при уходе мыши
      if (!('ontouchstart' in window)) {
        setShowWaterTooltip(false);
      }
    }

    // Быстрое добавление воды с анимацией
    function addWater(ml, skipScroll = false) {
      // Сначала прокручиваем к карточке воды (если вызвано из FAB)
      const waterCardEl = document.getElementById('water-card');
      if (!skipScroll && waterCardEl) {
        waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Задержка для завершения скролла перед анимацией
        setTimeout(() => runWaterAnimation(ml), 400);
        return;
      }
      runWaterAnimation(ml);
    }
    
    // Внутренняя функция анимации воды
    function runWaterAnimation(ml) {
      const newWater = (day.waterMl || 0) + ml;
      setDay(prev => ({ ...prev, waterMl: (prev.waterMl || 0) + ml, lastWaterTime: Date.now(), updatedAt: Date.now() }));
      
      // 💧 Анимация падающей капли (длиннее для плавности)
      setShowWaterDrop(true);
      setTimeout(() => setShowWaterDrop(false), 1200);
      
      // Анимация feedback
      setWaterAddedAnim('+' + ml);
      haptic('light');
      
      // 🎮 XP: Dispatch для gamification
      window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: { ml, total: newWater } }));
      
      // 🎉 Celebration при достижении цели (переиспользуем confetti от калорий)
      const prevWater = day.waterMl || 0;
      if (newWater >= waterGoal && prevWater < waterGoal && !showConfetti) {
        setShowConfetti(true);
        haptic('success');
        setTimeout(() => setShowConfetti(false), 2000);
      }
      
      // Скрыть анимацию
      setTimeout(() => setWaterAddedAnim(null), 800);
    }

    // Убрать воду (для исправления ошибок)
    function removeWater(ml) {
      const newWater = Math.max(0, (day.waterMl || 0) - ml);
      setDay(prev => ({ ...prev, waterMl: Math.max(0, (prev.waterMl || 0) - ml), updatedAt: Date.now() }));
      haptic('light');
    }

    // === Household (Бытовая активность) — через модульную модалку ===
    // mode: 'add' = только ввод (шаг 1), 'stats' = только статистика (шаг 2), 'edit' = редактирование
    // editIndex: число = редактирование существующей записи
    function openHouseholdPicker(mode = 'add', editIndex = null) {
      const dateKey = date; // ключ дня (YYYY-MM-DD)
      if (HEYS.StepModal) {
        // Выбираем шаги в зависимости от режима
        let steps, title;
        if (mode === 'stats') {
          steps = ['household_stats'];
          title = '📊 Статистика активности';
        } else if (mode === 'edit' && editIndex !== null) {
          steps = ['household_minutes'];
          title = '🏠 Редактирование';
        } else {
          steps = ['household_minutes'];
          title = '🏠 Добавить активность';
        }
        
        HEYS.StepModal.show({
          steps,
          title,
          showProgress: steps.length > 1,
          showStreak: false,
          showGreeting: false,
          showTip: false,
          finishLabel: 'Готово',
          context: { dateKey, editIndex, mode },
          onComplete: (stepData) => {
            // Обновляем локальное состояние из сохранённых данных
            const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
            setDay(prev => ({ 
              ...prev, 
              householdActivities: savedDay.householdActivities || [],
              // Legacy fields для backward compatibility
              householdMin: savedDay.householdMin || 0,
              householdTime: savedDay.householdTime || '',
              updatedAt: Date.now()
            }));
          }
        });
      }
    }

    // === Edit Grams Modal — теперь использует AddProductStep.showEditGrams ===
    function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
      if (HEYS.AddProductStep?.showEditGrams) {
        HEYS.AddProductStep.showEditGrams({
          product,
          currentGrams: currentGrams || 100,
          mealIndex,
          itemId,
          dateKey: date,
          onSave: ({ mealIndex: mi, itemId: id, grams }) => {
            setGrams(mi, id, grams);
          }
        });
      } else {
        // Fallback на старую модалку (если AddProductStep не загружен)
        setEditGramsTarget({ mealIndex, itemId, product });
        setEditGramsValue(currentGrams || 100);
      }
    }
    
    function confirmEditGramsModal() {
      if (editGramsTarget && editGramsValue > 0) {
        setGrams(editGramsTarget.mealIndex, editGramsTarget.itemId, editGramsValue);
      }
      setEditGramsTarget(null);
      setEditGramsValue(100);
    }
    
    function cancelEditGramsModal() {
      setEditGramsTarget(null);
      setEditGramsValue(100);
    }
    
    // Drag handler для слайдера граммов (edit mode) — legacy fallback
    function handleEditGramsDrag(e) {
      e.preventDefault();
      const slider = e.currentTarget;
      const rect = slider.getBoundingClientRect();
      const minGrams = 10;
      const maxGrams = 500;
      
      const updateFromPosition = (clientX) => {
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = x / rect.width;
        const grams = Math.round((minGrams + percent * (maxGrams - minGrams)) / 10) * 10;
        setEditGramsValue(Math.max(minGrams, Math.min(maxGrams, grams)));
        try { navigator.vibrate?.(3); } catch(e) {}
      };
      
      updateFromPosition(e.touches ? e.touches[0].clientX : e.clientX);
      
      const handleMove = (moveEvent) => {
        if (moveEvent.cancelable) moveEvent.preventDefault();
        updateFromPosition(moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX);
      };
      
      const handleEnd = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
    }

    // === Zone Minutes Picker functions ===
    function openZonePicker(trainingIndex, zoneIndex) {
      const T = TR[trainingIndex] || { z: [0, 0, 0, 0] };
      const currentMinutes = +T.z[zoneIndex] || 0;
      setZonePickerTarget({ trainingIndex, zoneIndex });
      setPendingZoneMinutes(currentMinutes);
      setShowZonePicker(true);
    }
    
    function confirmZonePicker() {
      if (zonePickerTarget) {
        updateTraining(zonePickerTarget.trainingIndex, zonePickerTarget.zoneIndex, pendingZoneMinutes);
      }
      setShowZonePicker(false);
      setZonePickerTarget(null);
    }
    
    function cancelZonePicker() {
      setShowZonePicker(false);
      setZonePickerTarget(null);
    }
    
    // === Zone Formula Popup ===
    const zoneNames = ['Восстановление', 'Жиросжигание', 'Аэробная', 'Анаэробная'];
    const POPUP_WIDTH = 240;
    const POPUP_HEIGHT = 220;
    
    function showZoneFormula(trainingIndex, zoneIndex, event) {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      // Используем getSmartPopupPosition для умного позиционирования
      const pos = getSmartPopupPosition(
        rect.left + rect.width / 2,
        rect.bottom,
        POPUP_WIDTH,
        POPUP_HEIGHT,
        { offset: 8 }
      );
      setZoneFormulaPopup({
        ti: trainingIndex,
        zi: zoneIndex,
        left: pos.left,
        top: pos.top,
        showAbove: pos.showAbove
      });
    }
    
    function closeZoneFormula() {
      setZoneFormulaPopup(null);
    }
    
    // === Household Formula Popup functions ===
    function showHouseholdFormula(householdIndex, event) {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      // Используем getSmartPopupPosition для умного позиционирования
      const pos = getSmartPopupPosition(
        rect.left + rect.width / 2,
        rect.bottom,
        POPUP_WIDTH,
        POPUP_HEIGHT,
        { offset: 8 }
      );
      setHouseholdFormulaPopup({
        hi: householdIndex,
        left: pos.left,
        top: pos.top,
        showAbove: pos.showAbove
      });
    }
    
    function closeHouseholdFormula() {
      setHouseholdFormulaPopup(null);
    }

    // === Training Picker functions ===
    function openTrainingPicker(trainingIndex) {
      // Используем новую модалку TrainingStep (StepModal)
      if (HEYS.TrainingStep?.show) {
        HEYS.TrainingStep.show({
          dateKey: date,
          trainingIndex,
          onComplete: (data) => {
            // Данные уже сохранены через save() в TrainingStep
            // Обновляем локальное состояние
            const savedDay = lsGet(`heys_dayv2_${date}`, {});
            setDay(prev => ({ 
              ...prev, 
              trainings: savedDay.trainings || prev.trainings,
              updatedAt: Date.now() 
            }));
          }
        });
        return;
      }
      
      // Fallback: старая логика (если TrainingStep не загружен)
      const now = new Date();
      const T = TR[trainingIndex] || { z: [0,0,0,0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' };
      
      // Если уже есть время — парсим, иначе текущее
      if (T.time) {
        const [h, m] = T.time.split(':').map(Number);
        setPendingTrainingTime({ hours: hourToWheelIndex(h || 10), minutes: m || 0 });
      } else {
        setPendingTrainingTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
      }
      
      setPendingTrainingType(T.type || 'cardio');
      
      // Загружаем зоны — находим индекс в zoneMinutesValues
      const zones = T.z || [0, 0, 0, 0];
      const zoneIndices = zones.map(minutes => {
        // zoneMinutesValues содержит строки '0', '1', ..., '120'
        const idx = zoneMinutesValues.indexOf(String(minutes));
        return idx >= 0 ? idx : 0;
      });
      setPendingTrainingZones(zoneIndices);
      
      // Загружаем оценки
      setPendingTrainingQuality(T.quality || 0);
      setPendingTrainingFeelAfter(T.feelAfter || 0);
      setPendingTrainingComment(T.comment || '');
      
      setTrainingPickerStep(1); // начинаем с первого шага
      setEditingTrainingIndex(trainingIndex);
      setShowTrainingPicker(true);
    }

    function confirmTrainingPicker() {
      // Если на первом шаге — переходим на второй
      if (trainingPickerStep === 1) {
        setTrainingPickerStep(2);
        return;
      }
      
      // Если на втором шаге — переходим на третий (оценки)
      if (trainingPickerStep === 2) {
        // Валидация: хотя бы одна зона > 0
        const totalMinutes = pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0);
        if (totalMinutes === 0) {
          haptic('error');
          // Добавляем shake-анимацию к секции зон
          const zonesSection = document.querySelector('.training-zones-section');
          if (zonesSection) {
            zonesSection.classList.add('shake');
            setTimeout(() => zonesSection.classList.remove('shake'), 500);
          }
          return;
        }
        setTrainingPickerStep(3);
        return;
      }
      
      // На третьем шаге — сохраняем всё
      const realHours = wheelIndexToHour(pendingTrainingTime.hours);
      const timeStr = pad2(realHours) + ':' + pad2(pendingTrainingTime.minutes);
      
      // Конвертируем индексы зон в минуты (zoneMinutesValues содержит строки)
      const zoneMinutes = pendingTrainingZones.map(idx => parseInt(zoneMinutesValues[idx], 10) || 0);
      
      // Обновляем тренировку с новыми полями
      // Заполняем массив до нужного индекса если он короткий
      const existingTrainings = day.trainings || [];
      const newTrainings = [...existingTrainings];
      const idx = editingTrainingIndex;
      
      // Заполняем пустые слоты если нужно (для idx=2 при length=2)
      while (newTrainings.length <= idx) {
        newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' });
      }
      
      // Теперь безопасно обновляем
      newTrainings[idx] = {
        ...newTrainings[idx],
        z: zoneMinutes,
        time: timeStr,
        type: pendingTrainingType,
        // Legacy fallback: используем pendingTrainingQuality/FeelAfter как mood/wellbeing
        mood: pendingTrainingQuality || 5,
        wellbeing: pendingTrainingFeelAfter || 5,
        stress: 5,
        comment: pendingTrainingComment
      };
      
      setDay(prev => ({ ...prev, trainings: newTrainings, updatedAt: Date.now() }));
      setShowTrainingPicker(false);
      setTrainingPickerStep(1);
      setEditingTrainingIndex(null);
    }

    function cancelTrainingPicker() {
      // Если на втором или третьем шаге — возвращаемся на предыдущий
      if (trainingPickerStep === 3) {
        setTrainingPickerStep(2);
        return;
      }
      if (trainingPickerStep === 2) {
        setTrainingPickerStep(1);
        return;
      }
      
      // На первом шаге — закрываем и проверяем пустую тренировку
      const idx = editingTrainingIndex;
      const trainings = day.trainings || [];
      const training = trainings[idx];
      
      // Если тренировка пустая (не существует или все зоны = 0) — уменьшаем visibleTrainings
      const isEmpty = !training || (
        (!training.z || training.z.every(z => z === 0)) &&
        !training.time &&
        !training.type
      );
      
      if (isEmpty && idx !== null && idx === visibleTrainings - 1) {
        setVisibleTrainings(prev => Math.max(0, prev - 1));
      }
      
      setShowTrainingPicker(false);
      setTrainingPickerStep(1);
      setEditingTrainingIndex(null);
    }
    
    // Helper: получить градиент цвета по оценке 1-10
    function getScoreGradient(score) {
      if (!score || score === 0) return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; // серый
      if (score <= 2) return 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)'; // красный
      if (score <= 4) return 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'; // оранжевый
      if (score <= 5) return 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)'; // жёлтый
      if (score <= 7) return 'linear-gradient(135deg, #d9f99d 0%, #bef264 100%)'; // лайм
      if (score <= 9) return 'linear-gradient(135deg, #bbf7d0 0%, #86efac 100%)'; // зелёный
      return 'linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%)'; // изумрудный (10)
    }
    
    function getScoreTextColor(score) {
      if (!score || score === 0) return '#9ca3af'; // серый
      if (score <= 2) return '#dc2626'; // красный
      if (score <= 4) return '#ea580c'; // оранжевый
      if (score <= 5) return '#ca8a04'; // жёлтый
      if (score <= 7) return '#65a30d'; // лайм
      if (score <= 9) return '#16a34a'; // зелёный
      return '#059669'; // изумрудный
    }
    
    // Helper: emoji по оценке 1-10
    function getScoreEmoji(score) {
      if (!score || score === 0) return '';
      if (score <= 2) return '😫';
      if (score <= 4) return '😕';
      if (score <= 5) return '😐';
      if (score <= 6) return '🙂';
      if (score <= 7) return '😊';
      if (score <= 8) return '😄';
      if (score <= 9) return '🤩';
      return '🌟'; // 10 = идеально
    }
    
    // Helper: получить данные вчера
    function getYesterdayData() {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      return lsGet('heys_dayv2_' + yStr, null);
    }
    
    // Helper: сравнение с вчера (↑ / ↓ / =)
    function getCompareArrow(todayVal, yesterdayVal) {
      if (!todayVal || !yesterdayVal) return null;
      const diff = todayVal - yesterdayVal;
      if (diff > 0) return { icon: '↑', diff: '+' + diff, color: '#16a34a' };
      if (diff < 0) return { icon: '↓', diff: String(diff), color: '#dc2626' };
      return { icon: '=', diff: '0', color: '#6b7280' };
    }
    
    // === Sleep Quality Picker functions ===
    function openSleepQualityPicker() {
      const currentQuality = day.sleepQuality || 0;
      // Находим индекс: 0='—', 1='1', 2='1.5', 3='2', ...
      const idx = currentQuality === 0 ? 0 : sleepQualityValues.indexOf(String(currentQuality));
      setPendingSleepQuality(idx >= 0 ? idx : 0);
      setShowSleepQualityPicker(true);
    }
    
    function confirmSleepQualityPicker() {
      const value = pendingSleepQuality === 0 ? 0 : parseInt(sleepQualityValues[pendingSleepQuality]);
      setDay(prevDay => {
        let newSleepNote = prevDay.sleepNote || '';
        if (pendingSleepNote.trim()) {
          const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
          const entry = `[${time}] ${pendingSleepNote.trim()}`;
          newSleepNote = newSleepNote ? newSleepNote + '\n' + entry : entry;
        }
        return { ...prevDay, sleepQuality: value, sleepNote: newSleepNote, updatedAt: Date.now() };
      });
      setPendingSleepNote('');
      setShowSleepQualityPicker(false);
    }
    
    function cancelSleepQualityPicker() {
      setPendingSleepNote('');
      setShowSleepQualityPicker(false);
    }
    
    // === Day Score Picker functions ===
    function openDayScorePicker() {
      const currentScore = day.dayScore || 0;
      const idx = currentScore === 0 ? 0 : dayScoreValues.indexOf(String(currentScore));
      setPendingDayScore(idx >= 0 ? idx : 0);
      setShowDayScorePicker(true);
    }
    
    function confirmDayScorePicker() {
      const value = pendingDayScore === 0 ? 0 : parseInt(dayScoreValues[pendingDayScore]);
      setDay(prevDay => {
        const autoScore = calculateDayAverages(prevDay.meals, prevDay.trainings, prevDay).dayScore;
        const isManual = value !== 0 && value !== autoScore;
        let newDayComment = prevDay.dayComment || '';
        if (pendingDayComment.trim()) {
          const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
          const entry = `[${time}] ${pendingDayComment.trim()}`;
          newDayComment = newDayComment ? newDayComment + '\n' + entry : entry;
        }
        return { ...prevDay, dayScore: value, dayScoreManual: isManual, dayComment: newDayComment, updatedAt: Date.now() };
      });
      setPendingDayComment('');
      setShowDayScorePicker(false);
    }
    
    function cancelDayScorePicker() {
      setPendingDayComment('');
      setShowDayScorePicker(false);
    }
    
    // Используем глобальный WheelColumn
    const WheelColumn = HEYS.WheelColumn;
    
    // Типы тренировок для Training Picker Modal
    const trainingTypes = [
      { id: 'cardio', icon: '🏃', label: 'Кардио' },
      { id: 'strength', icon: '🏋️', label: 'Силовая' },
      { id: 'hobby', icon: '⚽', label: 'Активное хобби' }
    ];
    
    // Пресеты популярных тренировок (зоны в индексах zoneMinutesValues)
    // === BottomSheet с поддержкой свайпа ===
    const bottomSheetRef = React.useRef(null);
    const sheetDragY = React.useRef(0);
    const sheetStartY = React.useRef(0);
    const isSheetDragging = React.useRef(false);
    
    const handleSheetTouchStart = (e) => {
      sheetStartY.current = e.touches[0].clientY;
      isSheetDragging.current = true;
      sheetDragY.current = 0;
    };
    
    const handleSheetTouchMove = (e) => {
      if (!isSheetDragging.current) return;
      const diff = e.touches[0].clientY - sheetStartY.current;
      if (diff > 0) {
        sheetDragY.current = diff;
        if (bottomSheetRef.current) {
          bottomSheetRef.current.style.transform = `translateY(${diff}px)`;
        }
      }
    };
    
    const handleSheetTouchEnd = (closeCallback) => {
      if (!isSheetDragging.current) return;
      isSheetDragging.current = false;
      
      if (sheetDragY.current > 100) {
        // Закрываем если свайпнули > 100px
        haptic('light');
        if (bottomSheetRef.current) {
          bottomSheetRef.current.classList.add('closing');
        }
        setTimeout(() => closeCallback(), 200);
      } else {
        // Возвращаем на место
        if (bottomSheetRef.current) {
          bottomSheetRef.current.style.transform = '';
        }
      }
      sheetDragY.current = 0;
    };
    
    // Импортируем константы из dayUtils (единый источник правды)
    const NIGHT_HOUR_THRESHOLD = U.NIGHT_HOUR_THRESHOLD || 3;
    const HOURS_ORDER = U.HOURS_ORDER || (() => {
      const order = [];
      for (let h = 3; h < 24; h++) order.push(h);
      for (let h = 0; h < 3; h++) order.push(h);
      return order;
    })();
    
    // Значения для колеса (с подписями для ночных часов)
    const hoursValues = useMemo(() => {
      return HOURS_ORDER.map(h => pad2(h));
    }, []);
    
    // Конвертация: индекс колеса → реальные часы
    const wheelIndexToHour = U.wheelIndexToHour || ((idx) => HOURS_ORDER[idx] ?? idx);
    // Конвертация: реальные часы → индекс колеса
    const hourToWheelIndex = U.hourToWheelIndex || ((hour) => {
      const normalizedHour = hour >= 24 ? hour - 24 : hour;
      const idx = HOURS_ORDER.indexOf(normalizedHour);
      return idx >= 0 ? idx : 0;
    });
    
    // Проверка: выбранный час относится к ночным (00-02)
    const isNightHourSelected = useMemo(() => {
      const realHour = wheelIndexToHour(pendingMealTime.hours);
      return realHour >= 0 && realHour < NIGHT_HOUR_THRESHOLD;
    }, [pendingMealTime.hours]);
    
    // Форматированная дата для отображения
    const currentDateLabel = useMemo(() => {
      const d = parseISO(date);
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('ru-RU', { month: 'short' });
      return `${dayNum} ${month}`;
    }, [date]);
    
    const minutesValues = WheelColumn.presets.minutes;
    const ratingValues = WheelColumn.presets.rating;
    
    // Состояние для второго слайда (самочувствие)
    const [pickerStep, setPickerStep] = useState(1); // 1 = время, 2 = самочувствие
    const [pendingMealMood, setPendingMealMood] = useState({mood: 5, wellbeing: 5, stress: 5});
    // Состояние для типа приёма в модалке создания
    const [pendingMealType, setPendingMealType] = useState(null); // null = авто
    
    // Открыть модалку для нового приёма
    function openTimePickerForNewMeal() {
      const now = new Date();
      // Конвертируем реальные часы в индекс колеса
      setPendingMealTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
      
      // Оценки: если есть предыдущие приёмы — берём от последнего, иначе 5
      const meals = day.meals || [];
      if (meals.length > 0) {
        // Берём последний приём по времени (они отсортированы)
        const lastMeal = meals[meals.length - 1];
        setPendingMealMood({
          mood: lastMeal.mood || 5,
          wellbeing: lastMeal.wellbeing || 5,
          stress: lastMeal.stress || 5
        });
      } else {
        // Первый приём в день — дефолт 5
        setPendingMealMood({ mood: 5, wellbeing: 5, stress: 5 });
      }
      
      setPendingMealType(null); // Сбрасываем на авто
      setEditingMealIndex(null);
      setEditMode('new');
      setPickerStep(1);
      setShowTimePicker(true);
    }
    
    // Открыть модалку для редактирования времени и типа (новая модульная)
    function openTimeEditor(mealIndex) {
      const meal = day.meals[mealIndex];
      if (!meal) return;
      
      // Используем новую модульную модалку если доступна
      if (isMobile && HEYS.MealStep?.showEditMeal) {
        HEYS.MealStep.showEditMeal({
          meal,
          mealIndex,
          dateKey: date,
          onComplete: ({ mealIndex: idx, time, mealType, name }) => {
            // Обновляем приём
            const newUpdatedAt = Date.now();
            lastLoadedUpdatedAtRef.current = newUpdatedAt;
            blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
            
            setDay(prevDay => {
              const updatedMeals = (prevDay.meals || []).map((m, i) =>
                i === idx ? { ...m, time, mealType, name } : m
              );
              // Сортируем по времени
              const sortedMeals = sortMealsByTime(updatedMeals);
              return { ...prevDay, meals: sortedMeals, updatedAt: newUpdatedAt };
            });
            
            if (window.HEYS?.analytics) {
              window.HEYS.analytics.trackDataOperation('meal-time-updated');
            }
          }
        });
      } else {
        // Fallback на старую модалку
        const timeParts = (meal.time || '').split(':');
        const hours = parseInt(timeParts[0]) || new Date().getHours();
        const minutes = parseInt(timeParts[1]) || 0;
        
        // Конвертируем реальные часы в индекс колеса
        setPendingMealTime({ hours: hourToWheelIndex(hours), minutes });
        setEditingMealIndex(mealIndex);
        setEditMode('time');
        setPickerStep(1);
        setShowTimePicker(true);
      }
    }
    
    // Открыть модалку для редактирования только оценок
    function openMoodEditor(mealIndex) {
      const meal = day.meals[mealIndex];
      if (!meal) return;
      
      // Используем новую модульную модалку если доступна
      if (isMobile && HEYS.MealStep?.showEditMood) {
        HEYS.MealStep.showEditMood({
          meal,
          mealIndex,
          dateKey: date,
          onComplete: ({ mealIndex: idx, mood, wellbeing, stress, comment }) => {
            // Обновляем приём
            const newUpdatedAt = Date.now();
            lastLoadedUpdatedAtRef.current = newUpdatedAt;
            blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
            
            setDay(prevDay => {
              const updatedMeals = (prevDay.meals || []).map((m, i) =>
                i === idx ? { ...m, mood, wellbeing, stress, comment } : m
              );
              return { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };
            });
            
            if (window.HEYS?.analytics) {
              window.HEYS.analytics.trackDataOperation('meal-mood-updated');
            }
          }
        });
      } else {
        // Fallback на старую модалку
        setPendingMealMood({
          mood: meal.mood ? ratingValues.indexOf(String(meal.mood)) : 5,
          wellbeing: meal.wellbeing ? ratingValues.indexOf(String(meal.wellbeing)) : 5,
          stress: meal.stress ? ratingValues.indexOf(String(meal.stress)) : 5
        });
        setEditingMealIndex(mealIndex);
        setEditMode('mood');
        setPickerStep(2);
        setShowTimePicker(true);
      }
    }
    
    // Направление анимации: 'forward' или 'back'
    const [animDirection, setAnimDirection] = useState('forward');
    
    function goToMoodStep() {
      setAnimDirection('forward');
      setPickerStep(2);
    }
    
    function goBackToTimeStep() {
      setAnimDirection('back');
      setPickerStep(1);
    }
    
    // Подтверждение только времени (для редактирования)
    function confirmTimeEdit() {
      // Конвертируем индекс колеса в реальные часы
      let realHours = wheelIndexToHour(pendingMealTime.hours);
      // Ночные часы (00-02) записываем как 24-26
      if (realHours < NIGHT_HOUR_THRESHOLD) {
        realHours += 24;
      }
      const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
      // Используем функцию с автосортировкой
      updateMealTime(editingMealIndex, timeStr);
      setShowTimePicker(false);
      setEditingMealIndex(null);
    }
    
    // Подтверждение только оценок (для редактирования)
    function confirmMoodEdit() {
      const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
      const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
      const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;
      setDay(prevDay => {
        const updatedMeals = (prevDay.meals || []).map((m, i) => 
          i === editingMealIndex ? { ...m, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal } : m
        );
        return { ...prevDay, meals: updatedMeals, updatedAt: Date.now() };
      });
      setShowTimePicker(false);
      setEditingMealIndex(null);
    }
    
    function confirmMealCreation() {
      // Конвертируем индекс колеса в реальные часы
      let realHours = wheelIndexToHour(pendingMealTime.hours);
      // Ночные часы (00-02) записываем как 24-26
      if (realHours < NIGHT_HOUR_THRESHOLD) {
        realHours += 24;
      }
      const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
      const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
      const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
      const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;
      
      if (editingMealIndex !== null) {
        setDay(prevDay => {
          const updatedMeals = (prevDay.meals || []).map((m, i) => 
            i === editingMealIndex 
              ? { ...m, time: timeStr, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal }
              : m
          );
          const sortedMeals = sortMealsByTime(updatedMeals);
          return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
        });
      } else {
        // Создание нового
        const newMeal = {
          id: uid('m_'), 
          name: 'Приём', 
          time: timeStr, 
          mood: moodVal, 
          wellbeing: wellbeingVal, 
          stress: stressVal, 
          items: []
        };
        let newIndex = -1;
        let newMealsLen = 0;
        setDay(prevDay => {
          const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
          newIndex = newMeals.findIndex(m => m.id === newMeal.id);
          newMealsLen = newMeals.length;
          return { ...prevDay, meals: newMeals, updatedAt: Date.now() };
        });
        expandOnlyMeal(newIndex >= 0 ? newIndex : Math.max(0, newMealsLen - 1));
      }
      
      setShowTimePicker(false);
      setPickerStep(1);
      setEditingMealIndex(null);
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation(editingMealIndex !== null ? 'meal-updated' : 'meal-created');
      }
    }
    
    function cancelTimePicker() {
      setShowTimePicker(false);
      setPickerStep(1);
      setEditingMealIndex(null);
      setEditMode('new');
    }
    
    // Вспомогательная функция: моментальная прокрутка к заголовку дневника
    const scrollToDiaryHeading = React.useCallback(() => {
      setTimeout(() => {
        const heading = document.getElementById('diary-heading');
        if (heading) {
          heading.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }, 50);
    }, []);

    // addMeal теперь открывает новую модульную модалку
    const addMeal = React.useCallback(() => { 
      console.log('[HEYS] 🍽 addMeal() called | date:', date, '| isHydrated:', isHydrated);
      if (isMobile && HEYS.MealStep) {
        // Новая модульная модалка с шагами
        HEYS.MealStep.showAddMeal({
          dateKey: date,
          meals: day.meals,
          pIndex,
          getProductFromItem,
          trainings: day.trainings || [],
          deficitPct: day.deficitPct ?? prof?.deficitPctTarget ?? 0,
          prof,
          dayData: day,
          onComplete: (newMeal) => {
            console.log('[HEYS] 🍽 MealStep complete | meal:', newMeal.id, '| time:', newMeal.time);
            
            // Обновляем state и сохраняем ID нового приёма
            const newMealId = newMeal.id;
            const newUpdatedAt = Date.now();
            lastLoadedUpdatedAtRef.current = newUpdatedAt; // Защита от перезаписи cloud sync
            blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000; // Блокируем cloud sync на 3 сек
            setDay(prevDay => {
              const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
              console.log('[HEYS] 🍽 Creating meal | id:', newMealId, '| new meals count:', newMeals.length, '| updatedAt:', newUpdatedAt, '| blockUntil:', blockCloudUpdatesUntilRef.current);
              return { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };
            });
            
            // 🔒 КРИТИЧНО: Принудительный flush СРАЗУ после setDay
            // Это гарантирует что данные записаны в localStorage ДО cloud sync
            // Без этого sync может прочитать старые данные и затереть новый meal
            setTimeout(() => {
              if (typeof flush === 'function') {
                flush();
                console.log('[HEYS] 🍽 Forced flush after meal creation');
              }
            }, 10); // Минимальная задержка чтобы React state успел обновиться
            
            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('meal-created');
            }
            
            // Сразу открываем модалку добавления продукта
            // Используем setTimeout чтобы state успел обновиться
            setTimeout(() => {
              // Находим индекс нового приёма по ID после обновления state
              setDay(currentDay => {
                const meals = currentDay.meals || [];
                const mealIndex = meals.findIndex(m => m.id === newMealId);
                console.log('[HEYS] 🍽 Found meal index:', mealIndex, '| meals:', meals.length);
                
                if (mealIndex >= 0) {
                  expandOnlyMeal(mealIndex);
                  
                  // Открываем модалку добавления продукта
                  if (window.HEYS?.AddProductStep?.show) {
                    window.HEYS.AddProductStep.show({
                      mealIndex: mealIndex,
                      products: products,
                      dateKey: date,
                      onAdd: ({ product, grams, mealIndex: targetMealIndex }) => {
                        const productId = product.id ?? product.product_id ?? product.name;
                        const newItem = {
                          id: uid('it_'),
                          product_id: product.id ?? product.product_id,
                          name: product.name,
                          grams: grams || 100,
                          // ✅ FIX: Spread нутриентов (было пропущено, вызывало пустые items)
                          ...(product.kcal100 !== undefined && {
                            kcal100: product.kcal100,
                            protein100: product.protein100,
                            carbs100: product.carbs100,
                            fat100: product.fat100,
                            simple100: product.simple100,
                            complex100: product.complex100,
                            badFat100: product.badFat100,
                            goodFat100: product.goodFat100,
                            trans100: product.trans100,
                            fiber100: product.fiber100,
                            gi: product.gi,
                            harmScore: product.harmScore
                          })
                        };
                        
                        console.log('[HEYS] 🍽 addMeal → onAdd:', product?.name, 'grams:', grams, {
                          hasNutrients: !!(newItem.kcal100 || newItem.protein100),
                          kcal100: newItem.kcal100,
                          mealIndex: targetMealIndex
                        });
                        
                        // 🔒 Защита от перезаписи cloud sync
                        const newUpdatedAt = Date.now();
                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
                        
                        setDay((prevDay = {}) => {
                          const updatedMeals = (prevDay.meals || []).map((m, i) =>
                            i === targetMealIndex
                              ? { ...m, items: [...(m.items || []), newItem] }
                              : m
                          );
                          return { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };
                        });
                        
                        // 🔒 КРИТИЧНО: Принудительный flush СРАЗУ после добавления продукта
                        setTimeout(() => {
                          if (typeof flush === 'function') {
                            flush();
                            console.log('[HEYS] 🍽 Forced flush after product added');
                          }
                        }, 10);
                        
                        try { navigator.vibrate?.(10); } catch(e) {}
                        window.dispatchEvent(new CustomEvent('heysProductAdded', { detail: { product, grams } }));
                        try {
                          U.lsSet(`heys_last_grams_${productId}`, grams);
                          // Сохраняем в grams_history
                          const history = U.lsGet('heys_grams_history', {});
                          if (!history[productId]) history[productId] = [];
                          history[productId].push(grams);
                          if (history[productId].length > 20) history[productId].shift();
                          U.lsSet('heys_grams_history', history);
                        } catch(e) {}
                        // Прокручиваем к дневнику после добавления продукта
                        scrollToDiaryHeading();
                      },
                      onNewProduct: () => {
                        if (window.HEYS?.products?.showAddModal) {
                          window.HEYS.products.showAddModal();
                        }
                      }
                    });
                  }
                }
                
                return currentDay; // Не меняем state, просто читаем
              });
            }, 50);
          }
        });
      } else if (isMobile) {
        // Fallback на старую модалку если MealStep не загружен
        openTimePickerForNewMeal();
      } else {
        // Десктоп — старое поведение
        const newMealId = uid('m_');
        let newMealIndex = 0;
        setDay(prevDay => {
          const baseMeals = prevDay.meals || [];
          const newMeals = [...baseMeals, {id:newMealId,name:'Приём',time:'',mood:'',wellbeing:'',stress:'',items:[]}];
          newMealIndex = newMeals.length - 1;
          console.log('[HEYS] 🍽 addMeal() creating meal | id:', newMealId, '| new meals count:', newMeals.length);
          return { ...prevDay, meals: newMeals, updatedAt: Date.now() };
        }); 
        expandOnlyMeal(newMealIndex);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('meal-created');
        }
      }
    }, [date, expandOnlyMeal, isHydrated, isMobile, openTimePickerForNewMeal, products, setDay]);
    
    // Сортировка приёмов по времени (последние наверху для удобства)
    function sortMealsByTime(meals) {
      if (!meals || meals.length <= 1) return meals;
      
      return [...meals].sort((a, b) => {
        const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
        const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;
        
        // Если оба без времени — сохраняем порядок
        if (timeA === null && timeB === null) return 0;
        // Без времени — в конец
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        
        // Обратный порядок: последние наверху
        return timeB - timeA;
      });
    }
    
    // Обновление времени приёма с автосортировкой
    const updateMealTime = React.useCallback((mealIndex, newTime) => {
      setDay(prevDay => {
        const updatedMeals = (prevDay.meals || []).map((m, i) => 
          i === mealIndex ? { ...m, time: newTime } : m
        );
        // Сортируем после обновления
        const sortedMeals = sortMealsByTime(updatedMeals);
        return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
      });
    }, [setDay, sortMealsByTime]);
    
    // Удаление приёма пищи с подтверждением через модуль
    const removeMeal = React.useCallback(async (i) => { 
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🗑️',
        title: 'Удалить приём пищи?',
        text: 'Все продукты в этом приёме будут удалены. Это действие нельзя отменить.'
      });
      
      if (!confirmed) return;
      
      haptic('medium');
      setDay(prevDay => {
        const meals = (prevDay.meals || []).filter((_, idx) => idx !== i);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
    }, [haptic, setDay]);
    
    // Track newly added items for fly-in animation
    const [newItemIds, setNewItemIds] = useState(new Set());
    
    const addProductToMeal = React.useCallback((mi,p)=>{ 
      haptic('light'); // Вибрация при добавлении
      // Сохраняем ключевые нутриенты inline чтобы не зависеть от базы продуктов
      const item = {
        id: uid('it_'), 
        product_id: p.id ?? p.product_id, 
        name: p.name, 
        grams: p.grams || 100, // Поддержка кастомного веса из MealOptimizer
        // Inline данные — гарантируют корректный расчёт даже если продукт удалён из базы
        kcal100: p.kcal100,
        protein100: p.protein100,
        fat100: p.fat100,
        simple100: p.simple100,
        complex100: p.complex100,
        badFat100: p.badFat100,
        goodFat100: p.goodFat100,
        trans100: p.trans100,
        fiber100: p.fiber100,
        gi: p.gi ?? p.gi100,
        harm: p.harm ?? p.harm100
      }; 
      setDay(prevDay => {
        const meals=(prevDay.meals||[]).map((m,i)=> i===mi? {...m, items:[...(m.items||[]), item]}:m); 
        return {...prevDay, meals, updatedAt: Date.now()}; 
      }); 
      
      // Track new item for animation
      setNewItemIds(prev => new Set([...prev, item.id]));
      // Remove from new items after animation completes
      setTimeout(() => {
        setNewItemIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 500);
      
      // Dispatch event для advice системы
      window.dispatchEvent(new CustomEvent('heysProductAdded'));
      
      // Автофокус убран — клавиатура закрывает информацию о продукте на мобильных
    }, [haptic, setDay, setNewItemIds, date]);
    const setGrams = React.useCallback((mi, itId, g) => { 
      const grams = +g || 0; 
      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m,i)=> i===mi? {...m, items:(m.items||[]).map(it=> it.id===itId?{...it, grams:grams}:it)}:m); 
        return {...prevDay, meals, updatedAt: Date.now()}; 
      }); 
    }, [setDay]);
    const removeItem = React.useCallback((mi, itId) => { 
      haptic('medium'); 
      setDay(prevDay => {
        const meals=(prevDay.meals||[]).map((m,i)=> i===mi? {...m, items:(m.items||[]).filter(it=>it.id!==itId)}:m); 
        return {...prevDay, meals, updatedAt: Date.now()}; 
      });
      // 🔄 Пересчитываем orphan-продукты после удаления item
      // (возможно этот item был единственным использованием orphan продукта)
      setTimeout(() => {
        if (window.HEYS?.orphanProducts?.recalculate) {
          window.HEYS.orphanProducts.recalculate();
        }
      }, 100);
    }, [haptic, setDay]);
    const updateMealField = React.useCallback((mealIndex, field, value) => {
      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => i === mealIndex ? { ...m, [field]: value } : m);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
    }, [setDay]);
    const changeMealMood = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'mood', value), [updateMealField]);
    const changeMealWellbeing = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'wellbeing', value), [updateMealField]);
    const changeMealStress = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'stress', value), [updateMealField]);
    const changeMealType = React.useCallback((mealIndex, newType) => {
      const newUpdatedAt = Date.now();
      lastLoadedUpdatedAtRef.current = newUpdatedAt;
      blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
      
      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => {
          if (i !== mealIndex) return m;
          // Обновляем mealType и name
          const newName = newType && U.MEAL_TYPES && U.MEAL_TYPES[newType] 
            ? U.MEAL_TYPES[newType].name 
            : m.name;
          return { ...m, mealType: newType, name: newName };
        });
        return { ...prevDay, meals, updatedAt: newUpdatedAt };
      });
      haptic('light');
    }, [setDay]);
    const isNewItem = React.useCallback((itemId) => newItemIds.has(itemId), [newItemIds]);

    const sleepH = sleepHours(day.sleepStart, day.sleepEnd);

    // Автоматически обновляем sleepHours в объекте дня при изменении времени сна
    useEffect(() => {
      const calculatedSleepH = sleepHours(day.sleepStart, day.sleepEnd);
      if (calculatedSleepH !== day.sleepHours) {
        setDay(prevDay => ({...prevDay, sleepHours: calculatedSleepH, updatedAt: Date.now()}));
      }
    }, [day.sleepStart, day.sleepEnd]);

    // Вычисляем данные о днях для текущего месяца (с цветовой индикацией близости к цели)
    // Зависит от products чтобы пересчитать после загрузки данных клиента
    const activeDays = useMemo(() => {
      const getActiveDaysForMonth = (HEYS.dayUtils && HEYS.dayUtils.getActiveDaysForMonth) || (() => new Map());
      const d = new Date(date);
      return getActiveDaysForMonth(d.getFullYear(), d.getMonth(), prof, products);
    }, [date, prof.weight, prof.height, prof.age, prof.sex, prof.deficitPctTarget, products]);

    // Вычисляем текущий streak (дней подряд в норме 75-115%)
    const currentStreak = React.useMemo(() => {
      try {
        let count = 0;
        let checkDate = new Date();
        checkDate.setHours(12);
        
        for (let i = 0; i < 30; i++) {
          const dateStr = fmtDate(checkDate);
          const dayData = lsGet('heys_dayv2_' + dateStr, null);
          
          if (dayData && dayData.meals && dayData.meals.length > 0) {
            // Вычисляем калории за день
            let totalKcal = 0;
            (dayData.meals || []).forEach(meal => {
              (meal.items || []).forEach(item => {
                const grams = +item.grams || 0;
                if (grams <= 0) return;
                // Fallback: сначала pIndex по названию/ID, потом inline данные item
                const nameKey = (item.name || '').trim().toLowerCase();
                const product = nameKey && pIndex?.byName?.get(nameKey)
                  || (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
                const src = product || item;
                if (src.kcal100 != null) {
                  totalKcal += ((+src.kcal100 || 0) * grams / 100);
                }
              });
            });
            
            // Хороший день: используем централизованный ratioZones с учётом refeed
            const ratio = totalKcal / (optimum || 1);
            const rz = HEYS.ratioZones;
            // isStreakDayWithRefeed учитывает refeed день (расширенный диапазон 0.70-1.35)
            const isStreakDay = rz?.isStreakDayWithRefeed 
              ? rz.isStreakDayWithRefeed(ratio, dayData)
              : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10));
            if (isStreakDay) {
              count++;
            } else if (i > 0) break; // Первый день может быть незавершён
          } else if (i > 0) break;
          
          checkDate.setDate(checkDate.getDate() - 1);
        }
        return count;
      } catch (e) {
        return 0;
      }
    }, [optimum, pIndex, fmtDate, lsGet]);

    // Экспорт getStreak для использования в gamification модуле
    React.useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.getStreak = () => currentStreak;
      
      // Dispatch событие чтобы GamificationBar мог обновить streak
      window.dispatchEvent(new CustomEvent('heysDayStreakUpdated', { 
        detail: { streak: currentStreak } 
      }));
      
      // Confetti при streak 7, 14, 30, 100
      if ([7, 14, 30, 100].includes(currentStreak) && HEYS.game && HEYS.game.celebrate) {
        HEYS.game.celebrate();
      }
      
      return () => {
        if (HEYS.Day && HEYS.Day.getStreak) {
          delete HEYS.Day.getStreak;
        }
      };
    }, [currentStreak]);

    // Экспорт addMeal для PWA shortcuts и внешних вызовов
    React.useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.addMeal = addMeal;
      return () => {
        if (HEYS.Day && HEYS.Day.addMeal === addMeal) {
          delete HEYS.Day.addMeal;
        }
      };
    }, [addMeal]);

    // Экспорт addProductToMeal как публичный API
    // Позволяет добавлять продукт в приём извне: HEYS.Day.addProductToMeal(mealIndex, product, grams?)
    React.useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.addProductToMeal = (mi, product, grams) => {
        // Валидация
        if (typeof mi !== 'number' || mi < 0) {
          console.warn('[HEYS.Day.addProductToMeal] Invalid meal index:', mi);
          return false;
        }
        if (!product || !product.name) {
          console.warn('[HEYS.Day.addProductToMeal] Invalid product:', product);
          return false;
        }
        // Добавляем продукт
        const productWithGrams = grams ? { ...product, grams } : product;
        addProductToMeal(mi, productWithGrams);
        return true;
      };
      return () => {
        if (HEYS.Day) delete HEYS.Day.addProductToMeal;
      };
    }, [addProductToMeal]);

    // Экспорт getMealQualityScore и getMealType как публичный API для advice модуля
    // getMealTypeByMeal — wrapper с текущим контекстом (meals и pIndex)
    React.useEffect(() => {
      HEYS.getMealQualityScore = getMealQualityScore;
      // Wrapper: принимает meal объект, находит его индекс и вызывает с полным контекстом
      HEYS.getMealType = (meal) => {
        if (!meal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
        const allMeals = day.meals || [];
        // Если передали только time (string), находим meal по времени
        if (typeof meal === 'string') {
          const foundMeal = allMeals.find(m => m.time === meal);
          if (!foundMeal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
          const idx = allMeals.indexOf(foundMeal);
          return getMealType(idx, foundMeal, allMeals, pIndex);
        }
        // Если передали meal объект
        const idx = allMeals.findIndex(m => m.id === meal.id || m.time === meal.time);
        if (idx === -1) return { type: 'snack', name: 'Перекус', icon: '🍎' };
        return getMealType(idx, meal, allMeals, pIndex);
      };
      return () => {
        delete HEYS.getMealQualityScore;
        delete HEYS.getMealType;
      };
    }, [day.meals, pIndex]);

    // === Advice Module Integration ===
    // Собираем uiState для проверки занятости пользователя
    const uiState = React.useMemo(() => ({
      modalOpen: false, // TODO: отслеживать состояние модалок
      searchOpen: false, // В DayTab нет глобального поиска, он внутри MealAddProduct
      showTimePicker,
      showWeightPicker,
      showDeficitPicker,
      showZonePicker,
      showSleepQualityPicker,
      showDayScorePicker
    }), [showTimePicker, showWeightPicker, showDeficitPicker, 
        showZonePicker, showSleepQualityPicker, showDayScorePicker]);

    // --- blocks
    // Получаем Calendar динамически, чтобы HMR работал
    const CalendarComponent = (HEYS.dayPickers && HEYS.dayPickers.Calendar) || HEYS.Calendar;
    const calendarBlock = React.createElement('div',{className:'area-cal'},
      React.createElement(CalendarComponent,{
        key: 'cal-' + activeDays.size + '-' + products.length,
        valueISO:date,
        activeDays:activeDays,
        onSelect:(d)=>{
          // persist current day explicitly before switching date
          try{ flush(); }catch(e){}
          setDate(d);
          const v = lsGet('heys_dayv2_'+d,null);
          const profNow = getProfile();
          if (v && v.date) {
            const migratedTrainings = normalizeTrainings(v.trainings);
            const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
            const migratedDay = { ...v, trainings: cleanedTrainings };
            // Сохраняем миграцию, чтобы не возвращались legacy поля при дальнейших загрузках
            lsSet('heys_dayv2_'+d, migratedDay);
            setDay(ensureDay(migratedDay, profNow));
          } else {
            setDay(ensureDay({ 
              date: d, 
              meals: (loadMealsForDate(d) || []), 
              trainings: [{ z:[0,0,0,0] }, { z:[0,0,0,0] }],
              // Явно устанавливаем пустые значения для всех полей
              weightMorning: '',
              deficitPct: '',
              sleepStart: '',
              sleepEnd: '',
              sleepQuality: '',
              sleepNote: '',
              dayScore: '',
              moodAvg: '',
              wellbeingAvg: '',
              stressAvg: '',
              dayComment: ''
            }, profNow));
          }
        },
        onRemove:()=>{ 
          localStorage.removeItem('heys_dayv2_'+date); 
          const profNow = getProfile();
          setDay(ensureDay({
            date: date,
            meals:[], 
            steps:0, 
            trainings:[{z:[0,0,0,0]},{z:[0,0,0,0]}],
            // Очищаем поля сна и оценки дня
            sleepStart:'',
            sleepEnd:'',
            sleepQuality:'',
            sleepNote:'',
            dayScore:'',
            moodAvg:'',
            wellbeingAvg:'',
            stressAvg:'',
            dayComment:''
          }, profNow)); 
        }
      })
    );

    

const mainBlock = React.createElement('div', { className: 'area-main card tone-violet main-violet', id:'main-violet-block', style:{overflow:'hidden'} },
  React.createElement('table', { className: 'violet-table' },
    React.createElement('colgroup',null,[
      React.createElement('col',{key:'main-col-0',style:{width:'40%'}}),
      React.createElement('col',{key:'main-col-1',style:{width:'20%'}}),
      React.createElement('col',{key:'main-col-2',style:{width:'20%'}}),
      React.createElement('col',{key:'main-col-3',style:{width:'20%'}})
    ]),
    React.createElement('thead', null,
      React.createElement('tr', null,
        React.createElement('th', null, ''),
        React.createElement('th', null, 'ккал.'),
        React.createElement('th', null, ''),
        React.createElement('th', null, '')
      )
    ),
    React.createElement('tbody', null,
      // Row 1 — Общие затраты
      React.createElement('tr', {className:'vio-row total-kcal'},
        React.createElement('td', { className: 'label small' }, 
          React.createElement('strong',null,'Общие затраты :'),
          // 🆕 v3.7.0: Интерактивный NDTE badge с expand/countdown
          HEYS.InsulinWave && HEYS.InsulinWave.renderNDTEBadge && 
            HEYS.InsulinWave.renderNDTEBadge(ndteData, ndteBoostKcal, ndteExpanded, () => setNdteExpanded(prev => !prev))
        ),
        React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: tdee, disabled: true })),
        React.createElement('td', null, ''),
        React.createElement('td', null, '')
      ),
      // Row 2 — BMR + вес
      React.createElement('tr',null,
        React.createElement('td',{className:'label small'},'BMR :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:bmr,disabled:true})),
        React.createElement('td',null, React.createElement('input',{type:'number',step:'0.1',value:day.weightMorning ? Math.round(day.weightMorning*10)/10 : '',onChange:e=>{
          const newWeight = +e.target.value || '';
          const prof = getProfile();
          // Если раньше вес был пустой и сейчас вводится первый раз, подставляем целевой дефицит из профиля
          setDay(prevDay => {
            const shouldSetDeficit = (!prevDay.weightMorning || prevDay.weightMorning === '') && newWeight && (!prevDay.deficitPct && prevDay.deficitPct !== 0);
            return {
              ...prevDay,
              weightMorning: newWeight,
              deficitPct: shouldSetDeficit ? (prof.deficitPctTarget || 0) : prevDay.deficitPct
            };
          });
        }})),
        React.createElement('td',null,'вес на утро')
      ),
      // Row 3 — Шаги (ккал считаем из stepsK)
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Шаги :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:stepsK,disabled:true,title:'ккал от шагов'})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.steps||0,onChange:e=>setDay(prev=>({...prev,steps:+e.target.value||0,updatedAt:Date.now()}))})),
        React.createElement('td',null,'шагов')
      ),
      // Row 4 — Тренировки
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Тренировки :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r0(train1k+train2k),disabled:true})),
        React.createElement('td',null,''),
        React.createElement('td',null,'')
      ),
      // Row 5 — Бытовая активность
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Бытовая активность :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:householdK,disabled:true})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.householdMin||0,onChange:e=>setDay(prev=>({...prev,householdMin:+e.target.value||0,updatedAt:Date.now()}))})),
        React.createElement('td',null,'мин')
      ),
      // Row 6 — Общая активность
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'}, React.createElement('strong',null,'Общая активность :')),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:actTotal,disabled:true})),
        React.createElement('td',null,''),
        React.createElement('td',null,'')
      ),
      // Row 6 — Нужно съесть ккал + Целевой дефицит (редактируемый по дням)
      React.createElement('tr',{className:'vio-row need-kcal'},
        React.createElement('td',{className:'label small'},
          React.createElement('strong',null,'Нужно съесть ккал :'),
          // Индикатор коррекции на цикл
          cycleKcalMultiplier > 1 && React.createElement('span',{
            style:{marginLeft:'6px',fontSize:'11px',color:'#ec4899'}
          }, '🌸 +' + Math.round((cycleKcalMultiplier - 1) * 100) + '%')
        ),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:optimum,disabled:true})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.deficitPct||0,onChange:e=>setDay(prev=>({...prev,deficitPct:Number(e.target.value)||0,updatedAt:Date.now()})),style:{width:'60px',textAlign:'center',fontWeight:600}})),
        React.createElement('td',null,'Целевой дефицит')
      ),
      // Row 7 — Съедено за день
      React.createElement('tr',{className:'vio-row eaten-kcal'},
        React.createElement('td',{className:'label small'},React.createElement('strong',null,'Съедено за день :')),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r0(eatenKcal),disabled:true})),
        React.createElement('td',null,''),
        React.createElement('td',null,'')
      ),
      // Row 8 — Дефицит ФАКТ (фактический % от Общих затрат)
      React.createElement('tr',{className:'dev-row'}, 
        (function(){
          const target = dayTargetDef; // используем целевой дефицит дня
          const fact = factDefPct; // отрицательно — хорошо если <= target
          const labelText = fact < target ? 'Дефицит ФАКТ :' : 'Профицит ФАКТ :';
          return React.createElement('td',{className:'label small'}, labelText);
        })(),
        (function(){
          const target = dayTargetDef; // используем целевой дефицит дня
          const fact = factDefPct; // отрицательно — хорошо если <= target
          const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
          const bg = good? '#dcfce7':'#fee2e2';
          const col = good? '#065f46':'#b91c1c';
          return React.createElement('td',null, React.createElement('input',{className:'readOnly',disabled:true,value:(fact>0?'+':'')+fact+'%',style:{background:bg,color:col,fontWeight:700,border:'1px solid '+(good?'#86efac':'#fecaca')}}));
        })(),
        (function(){
          const target = dayTargetDef; // используем целевой дефицит дня
          const fact = factDefPct; // отрицательно — хорошо если <= target
          const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
          const deficitKcal = eatenKcal - tdee; // отрицательно = дефицит, положительно = профицит
          const bg = good? '#dcfce7':'#fee2e2';
          const col = good? '#065f46':'#b91c1c';
          return React.createElement('td',null, React.createElement('input',{className:'readOnly',disabled:true,value:(deficitKcal>0?'+':'')+Math.round(deficitKcal),style:{background:bg,color:col,fontWeight:700,border:'1px solid '+(good?'#86efac':'#fecaca')}}));
        })(),
        React.createElement('td',null,'')
      )
    )
  )
);

    // Иконки для тренировок
    const trainIcons = ['🏃', '🚴', '🏊'];
    
    // Удаление тренировки с подтверждением через модуль
    const removeTraining = async (ti) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🏋️',
        title: 'Удалить тренировку?',
        text: 'Данные о тренировке будут удалены. Это действие нельзя отменить.'
      });
      
      if (!confirmed) return;
      
      haptic('medium');
      const emptyTraining = {z:[0,0,0,0], time:'', type:''};
      setDay(prevDay => {
        const oldTrainings = prevDay.trainings || [emptyTraining, emptyTraining, emptyTraining];
        const newTrainings = [
          ...oldTrainings.slice(0, ti),
          ...oldTrainings.slice(ti + 1),
          emptyTraining
        ].slice(0, 3);
        return { ...prevDay, trainings: newTrainings, updatedAt: Date.now() };
      });
      setVisibleTrainings(Math.max(0, visibleTrainings - 1));
    };

    // Удаление бытовой активности с подтверждением
    const removeHousehold = async (idx) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🏠',
        title: 'Удалить активность?',
        text: 'Данные о бытовой активности будут удалены.'
      });
      
      if (!confirmed) return;
      
      haptic('medium');
      setDay(prevDay => {
        const oldActivities = prevDay.householdActivities || [];
        const newActivities = oldActivities.filter((_, i) => i !== idx);
        // Обновляем legacy поля для совместимости
        const totalMin = newActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
        return { 
          ...prevDay, 
          householdActivities: newActivities,
          householdMin: totalMin,
          householdTime: newActivities[0]?.time || '',
          updatedAt: Date.now()
        };
      });
    };

    // Компактные тренировки в SaaS стиле
    const trainingsBlock = React.createElement('div', { className: 'compact-trainings' },
      // Пустое состояние когда нет видимых тренировок и активностей
      visibleTrainings === 0 && householdActivities.length === 0 && React.createElement('div', { className: 'empty-trainings' },
        React.createElement('span', { className: 'empty-trainings-icon' }, '🏃‍♂️'),
        React.createElement('span', { className: 'empty-trainings-text' }, 'Нет тренировок')
      ),
      // Показываем только видимые тренировки
      Array.from({length: visibleTrainings}, (_, ti) => {
        const rawT = TR[ti] || {};
        // Fallback для старых данных без оценок
        const T = {
          z: rawT.z || [0, 0, 0, 0],
          time: rawT.time || '',
          type: rawT.type || '',
          mood: rawT.mood ?? 0,
          wellbeing: rawT.wellbeing ?? 0,
          stress: rawT.stress ?? 0,
          comment: rawT.comment || ''
        };
        
        const kcalZ = i => r0((+T.z[i] || 0) * (kcalMin[i] || 0));
        const total = r0(kcalZ(0) + kcalZ(1) + kcalZ(2) + kcalZ(3));
        const trainingType = trainingTypes.find(t => t.id === T.type);
        
        // Эмодзи для оценок (mood, wellbeing, stress) - как в приёмах пищи
        const getMoodEmoji = (v) => 
          v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
        const getWellbeingEmoji = (v) => 
          v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
        const getStressEmoji = (v) => 
          v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';
        
        const moodEmoji = getMoodEmoji(T.mood);
        const wellbeingEmoji = getWellbeingEmoji(T.wellbeing);
        const stressEmoji = getStressEmoji(T.stress);
        const hasRatings = T.mood > 0 || T.wellbeing > 0 || T.stress > 0;
        
        // Общая длительность тренировки (сумма минут)
        const totalMinutes = (T.z || []).reduce((sum, m) => sum + (+m || 0), 0);
        const hasDuration = totalMinutes > 0;
        
        return React.createElement('div', { 
          key: 'tr' + ti, 
          className: 'compact-card compact-train compact-train--minimal'
        },
          // Заголовок: иконка + тип + время + ккал + ×
          React.createElement('div', { 
            className: 'compact-train-header',
            onClick: () => openTrainingPicker(ti)
          },
            React.createElement('span', { className: 'compact-train-icon' }, trainingType ? trainingType.icon : (trainIcons[ti] || '💪')),
            React.createElement('span', { className: 'compact-train-title' }, trainingType ? trainingType.label : ('Тренировка ' + (ti + 1))),
            T.time && React.createElement('span', { className: 'compact-train-time' }, T.time),
            // Группа badge + remove справа
            React.createElement('div', { className: 'compact-right-group' },
              React.createElement('span', { className: 'compact-badge train' }, total + ' ккал'),
              React.createElement('button', {
                className: 'compact-train-remove',
                onClick: (e) => { e.stopPropagation(); removeTraining(ti); },
                title: 'Убрать тренировку'
              }, '×')
            )
          ),
          // Зоны: inline строка
          React.createElement('div', { className: 'compact-train-zones-inline' },
            [0, 1, 2, 3].map((zi) => {
              const hasValue = +T.z[zi] > 0;
              return React.createElement('span', { 
                key: 'z' + zi, 
                className: 'compact-zone-inline' + (hasValue ? ' has-value' : ''),
                onClick: (e) => showZoneFormula(ti, zi, e)
              },
                React.createElement('span', { className: 'zone-label' }, 'Z' + (zi + 1)),
                React.createElement('span', { className: 'zone-value' }, hasValue ? T.z[zi] : '—'),
                hasValue && React.createElement('span', { className: 'zone-kcal' }, kcalZ(zi))
              );
            })
          ),
          // Нижняя строка: длительность + компактные оценки + подсказка
          React.createElement('div', { className: 'compact-train-footer' },
            hasDuration && React.createElement('span', { className: 'train-duration-badge' }, '⏱ ' + totalMinutes + ' мин'),
            hasRatings && React.createElement('div', { className: 'train-ratings-inline' },
              moodEmoji && React.createElement('span', { className: 'train-rating-mini mood', title: 'Настроение' }, moodEmoji + ' ' + T.mood),
              wellbeingEmoji && React.createElement('span', { className: 'train-rating-mini wellbeing', title: 'Самочувствие' }, wellbeingEmoji + ' ' + T.wellbeing),
              stressEmoji && React.createElement('span', { className: 'train-rating-mini stress', title: 'Усталость' }, stressEmoji + ' ' + T.stress)
            ),
            React.createElement('span', { className: 'tap-hint' }, '✏️ Нажми для изменения')
          ),
          // Комментарий (если есть)
          T.comment && React.createElement('div', { className: 'training-card-comment' },
            '💬 ', T.comment
          )
        );
      }),
      // Бытовые активности — по карточке на каждую (как тренировки)
      householdActivities.map((h, hi) => {
        const hKcal = r0((+h.minutes || 0) * kcalPerMin(2.5, weight));
        return React.createElement('div', { 
          key: 'household-' + hi, 
          className: 'compact-card compact-household'
        },
          React.createElement('div', { 
            className: 'compact-train-header',
            onClick: () => openHouseholdPicker('edit', hi) // Редактирование
          },
            React.createElement('span', { className: 'compact-train-icon' }, '🏠'),
            React.createElement('span', { className: 'compact-train-title' }, 'Бытовая активность'),
            h.time && React.createElement('span', { className: 'compact-train-time' }, h.time),
            // Группа badge + remove справа
            React.createElement('div', { className: 'compact-right-group' },
              React.createElement('span', { 
                className: 'compact-badge household clickable',
                onClick: (e) => showHouseholdFormula(hi, e)
              }, hKcal + ' ккал'),
              React.createElement('button', {
                className: 'compact-train-remove',
                onClick: (e) => { e.stopPropagation(); removeHousehold(hi); },
                title: 'Убрать активность'
              }, '×')
            )
          ),
          React.createElement('div', { className: 'compact-household-details' },
            React.createElement('span', { className: 'household-detail' }, '⏱ ' + h.minutes + ' мин'),
            React.createElement('span', { className: 'household-detail tap-hint' }, '✏️ Нажми для изменения')
          )
        );
      })
    );

  // Компактный блок сна и оценки дня в SaaS стиле (две плашки в розовом контейнере)
  const sideBlock = React.createElement('div',{className:'area-side right-col'},
      React.createElement('div', { className: 'compact-sleep compact-card' },
        React.createElement('div', { className: 'compact-card-header' }, '😴 Сон и самочувствие'),
        
        // Ряд с двумя плашками
        React.createElement('div', { className: 'sleep-cards-row' },
          // Плашка СОН
          (() => {
            const yData = getYesterdayData();
            const sleepCompare = getCompareArrow(day.sleepQuality, yData?.sleepQuality);
            const sleepEmoji = getScoreEmoji(day.sleepQuality);
            const isPulse = (day.sleepQuality || 0) >= 9;
            
            // Умная подсказка при низкой оценке сна
            const sleepTip = (day.sleepQuality > 0 && day.sleepQuality <= 4) 
              ? '💡 Попробуй: без экранов за час, прохладная комната'
              : null;
            
            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '🌙'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Сон')
              ),
              React.createElement('div', { className: 'sleep-card-times' },
                React.createElement('input', { className: 'sleep-time-input', type: 'time', value: day.sleepStart || '', onChange: e => setDay(prev => ({...prev, sleepStart: e.target.value, updatedAt: Date.now()})) }),
                React.createElement('span', { className: 'sleep-arrow' }, '→'),
                React.createElement('input', { className: 'sleep-time-input', type: 'time', value: day.sleepEnd || '', onChange: e => setDay(prev => ({...prev, sleepEnd: e.target.value, updatedAt: Date.now()})) })
              ),
              // Качество сна — большой блок как у оценки дня
              React.createElement('div', { 
                className: 'sleep-quality-display clickable' + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.sleepQuality) },
                onClick: openSleepQualityPicker
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  sleepEmoji && React.createElement('span', { className: 'score-emoji' }, sleepEmoji),
                  React.createElement('span', { 
                    className: 'sleep-quality-value-big',
                    style: { color: getScoreTextColor(day.sleepQuality) }
                  }, day.sleepQuality || '—'),
                  React.createElement('span', { className: 'sleep-quality-max' }, '/ 10')
                ),
                // Compare with yesterday
                sleepCompare && React.createElement('span', { 
                  className: 'score-compare',
                  style: { color: sleepCompare.color }
                }, sleepCompare.icon + ' vs вчера'),
                sleepH > 0 && React.createElement('span', { className: 'sleep-duration-hint' }, sleepH + ' ч сна')
              ),
              // Умная подсказка
              sleepTip && React.createElement('div', { className: 'smart-tip' }, sleepTip),
              React.createElement('textarea', { 
                className: 'sleep-note', 
                placeholder: 'Заметка...', 
                value: day.sleepNote || '', 
                rows: day.sleepNote && day.sleepNote.includes('\n') ? Math.min(day.sleepNote.split('\n').length, 4) : 1,
                onChange: e => setDay(prev => ({...prev, sleepNote: e.target.value, updatedAt: Date.now()})) 
              })
            );
          })(),
          
          // Плашка ОЦЕНКА ДНЯ
          (() => {
            const yData = getYesterdayData();
            const scoreCompare = getCompareArrow(day.dayScore, yData?.dayScore);
            const scoreEmoji = getScoreEmoji(day.dayScore);
            const isPulse = (day.dayScore || 0) >= 9;
            
            // Время последнего приёма
            const meals = day.meals || [];
            const lastMeal = meals.length > 0 ? meals[meals.length - 1] : null;
            const lastMealTime = lastMeal?.time || null;
            
            // Корреляция сон→самочувствие (без dayTot, который ещё не объявлен)
            const sleepH = day.sleepHours || 0;
            const sleepCorrelation = sleepH > 0 && sleepH < 6 
              ? '😴 Мало сна — будь внимателен к аппетиту'
              : sleepH >= 8
                ? '😴✓ Отличный сон!'
                : null;
            
            // Умная подсказка при низкой оценке дня
            const dayTip = (day.dayScore > 0 && day.dayScore <= 4)
              ? '💡 Маленькие шаги: прогулка 10 мин, стакан воды'
              : (day.stressAvg >= 4)
                ? '💡 Высокий стресс. Попробуй 5 мин дыхания'
                : null;
            
            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '📊'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Оценка дня')
              ),
              // dayScore: авто из mood/wellbeing/stress, но можно поправить вручную
              React.createElement('div', { 
                className: 'day-score-display' + (day.dayScore ? ' clickable' : '') + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.dayScore) },
                onClick: () => {
                  const currentScore = day.dayScore || 0;
                  const idx = currentScore === 0 ? 0 : dayScoreValues.indexOf(String(currentScore));
                  setPendingDayScore(idx >= 0 ? idx : 0);
                  setShowDayScorePicker(true);
                }
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  scoreEmoji && React.createElement('span', { className: 'score-emoji' }, scoreEmoji),
                  React.createElement('span', { 
                    className: 'day-score-value-big',
                    style: { color: getScoreTextColor(day.dayScore) }
                  }, day.dayScore || '—'),
                  React.createElement('span', { className: 'day-score-max' }, '/ 10')
                ),
                // Compare with yesterday
                scoreCompare && React.createElement('span', { 
                  className: 'score-compare',
                  style: { color: scoreCompare.color }
                }, scoreCompare.icon + ' vs вчера'),
                // Показываем "✨ авто" или "✏️ ручная" в зависимости от источника
                day.dayScoreManual 
                  ? React.createElement('span', { 
                      className: 'day-score-manual-hint',
                      onClick: (e) => {
                        e.stopPropagation();
                        // Сброс на авто
                        setDay(prev => {
                          const averages = calculateDayAverages(prev.meals, prev.trainings, prev);
                          return {...prev, dayScore: averages.dayScore, dayScoreManual: false};
                        });
                      }
                    }, '✏️ сбросить')
                  : (day.moodAvg || day.wellbeingAvg || day.stressAvg) && 
                    React.createElement('span', { className: 'day-score-auto-hint' }, '✨ авто')
              ),
              React.createElement('div', { className: 'day-mood-row' },
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '😊'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Настроение'),
                  React.createElement('span', { className: 'mood-card-value' }, day.moodAvg || '—')
                ),
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '💪'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Самочувствие'),
                  React.createElement('span', { className: 'mood-card-value' }, day.wellbeingAvg || '—')
                ),
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '😰'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Стресс'),
                  React.createElement('span', { className: 'mood-card-value' }, day.stressAvg || '—')
                )
              ),
              // === Sparkline динамики настроения в течение дня ===
              moodSparklineData.length >= 2 && React.createElement('div', {
                className: 'mood-sparkline-container',
                style: {
                  position: 'relative',
                  height: '85px',
                  margin: '12px 0 8px 0',
                  padding: '8px 0'
                }
              },
                (() => {
                  const points = moodSparklineData;
                  const svgW = 280;
                  const svgH = 60; // Увеличил высоту для лучшей видимости
                  const padding = 12;
                  
                  // Диапазон времени
                  const minTime = Math.min(...points.map(p => p.time)) - 30;
                  const maxTime = Math.max(...points.map(p => p.time)) + 30;
                  const timeRange = Math.max(maxTime - minTime, 60);
                  
                  // Динамический масштаб: точно по данным + минимальный padding
                  const scores = points.map(p => p.score);
                  const dataMin = Math.min(...scores);
                  const dataMax = Math.max(...scores);
                  const dataRange = dataMax - dataMin;
                  
                  // Минимальный диапазон 1.5 для наглядности, padding 15% от диапазона
                  const effectiveRange = Math.max(dataRange, 0.5);
                  const paddingAmount = effectiveRange * 0.25;
                  // НЕ округляем — используем точные значения для максимальной детализации
                  const minScore = Math.max(1, dataMin - paddingAmount);
                  const maxScore = Math.min(10, dataMax + paddingAmount);
                  const scoreRange = Math.max(maxScore - minScore, 0.5);
                  
                  // Вычисляем координаты точек
                  const coords = points.map((p, idx) => {
                    const x = padding + ((p.time - minTime) / timeRange) * (svgW - 2 * padding);
                    const y = svgH - padding - ((p.score - minScore) / scoreRange) * (svgH - 2 * padding);
                    return { ...p, x, y, idx };
                  });
                  
                  // Находим лучшую и худшую точку
                  const bestIdx = coords.reduce((best, p, i) => p.score > coords[best].score ? i : best, 0);
                  const worstIdx = coords.reduce((worst, p, i) => p.score < coords[worst].score ? i : worst, 0);
                  
                  // Строим path для линии
                  const linePath = coords.length > 1 
                    ? 'M ' + coords.map(c => `${c.x},${c.y}`).join(' L ')
                    : '';
                  
                  // Строим path для градиентной заливки
                  const areaPath = coords.length > 1 
                    ? `M ${coords[0].x},${svgH - padding} ` + 
                      coords.map(c => `L ${c.x},${c.y}`).join(' ') + 
                      ` L ${coords[coords.length - 1].x},${svgH - padding} Z`
                    : '';
                  
                  // Определяем тренд
                  const trend = coords.length >= 2 
                    ? coords[coords.length - 1].score - coords[0].score 
                    : 0;
                  const trendIcon = trend > 0.5 ? '📈' : trend < -0.5 ? '📉' : '➡️';
                  const trendColor = trend > 0.5 ? '#16a34a' : trend < -0.5 ? '#dc2626' : '#6b7280';
                  
                  // Цвет линии по среднему score
                  const avgScore = coords.reduce((sum, c) => sum + c.score, 0) / coords.length;
                  const lineColor = avgScore >= 7 ? '#10b981' : avgScore >= 5 ? '#eab308' : '#ef4444';
                  
                  return React.createElement('div', { style: { position: 'relative' } },
                    // Заголовок с трендом
                    React.createElement('div', { 
                      style: { 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '4px',
                        padding: '0 4px'
                      }
                    },
                      React.createElement('span', { 
                        style: { fontSize: '11px', color: 'var(--text-tertiary, #9ca3af)', fontWeight: '500' }
                      }, '📊 Динамика дня'),
                      React.createElement('span', { 
                        style: { fontSize: '11px', color: trendColor, fontWeight: '600' }
                      }, trendIcon + ' ' + (trend > 0 ? '+' : '') + trend.toFixed(1))
                    ),
                    // SVG график
                    React.createElement('svg', {
                      viewBox: `0 0 ${svgW} ${svgH + 16}`,
                      style: { width: '100%', height: '60px' },
                      preserveAspectRatio: 'xMidYMid meet'
                    },
                      // Градиенты
                      React.createElement('defs', null,
                        React.createElement('linearGradient', { id: 'moodSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                          React.createElement('stop', { offset: '0%', stopColor: lineColor, stopOpacity: '0.4' }),
                          React.createElement('stop', { offset: '100%', stopColor: lineColor, stopOpacity: '0.05' })
                        )
                      ),
                      // Горизонтальные референсные линии (хорошо/плохо) — только если в видимом диапазоне
                      // Линия "хорошо" = 7 (показываем если 7 попадает в диапазон)
                      (7 >= minScore && 7 <= maxScore) && React.createElement('line', {
                        x1: padding, y1: svgH - padding - ((7 - minScore) / scoreRange) * (svgH - 2 * padding),
                        x2: svgW - padding, y2: svgH - padding - ((7 - minScore) / scoreRange) * (svgH - 2 * padding),
                        stroke: '#22c55e', strokeWidth: '0.5', strokeDasharray: '3,3', opacity: '0.5'
                      }),
                      // Линия "плохо" = 4 (показываем если 4 попадает в диапазон)
                      (4 >= minScore && 4 <= maxScore) && React.createElement('line', {
                        x1: padding, y1: svgH - padding - ((4 - minScore) / scoreRange) * (svgH - 2 * padding),
                        x2: svgW - padding, y2: svgH - padding - ((4 - minScore) / scoreRange) * (svgH - 2 * padding),
                        stroke: '#ef4444', strokeWidth: '0.5', strokeDasharray: '3,3', opacity: '0.5'
                      }),
                      // Подписи min/max шкалы слева (округляем до 1 знака)
                      React.createElement('text', {
                        x: 2, y: padding + 3,
                        fontSize: '8', fill: 'var(--text-tertiary, #9ca3af)', textAnchor: 'start'
                      }, Math.round(maxScore * 10) / 10),
                      React.createElement('text', {
                        x: 2, y: svgH - padding + 3,
                        fontSize: '8', fill: 'var(--text-tertiary, #9ca3af)', textAnchor: 'start'
                      }, Math.round(minScore * 10) / 10),
                      // Заливка под линией
                      areaPath && React.createElement('path', {
                        d: areaPath,
                        fill: 'url(#moodSparkGrad)',
                        className: 'mood-sparkline-area'
                      }),
                      // Основная линия
                      linePath && React.createElement('path', {
                        d: linePath,
                        fill: 'none',
                        stroke: lineColor,
                        strokeWidth: '2',
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                        className: 'mood-sparkline-line'
                      }),
                      // Точки
                      coords.map((c, i) => {
                        const isBest = i === bestIdx && coords.length > 2;
                        const isWorst = i === worstIdx && coords.length > 2;
                        const pointColor = c.score >= 7 ? '#10b981' : c.score >= 5 ? '#eab308' : '#ef4444';
                        const r = isBest || isWorst ? 5 : 4;
                        return React.createElement('g', { key: 'mood-pt-' + i },
                          // Белый ореол
                          React.createElement('circle', {
                            cx: c.x, cy: c.y, r: r + 1.5,
                            fill: 'white'
                          }),
                          // Точка
                          React.createElement('circle', {
                            cx: c.x, cy: c.y, r: r,
                            fill: pointColor,
                            stroke: isBest ? '#fbbf24' : isWorst ? '#f87171' : 'white',
                            strokeWidth: isBest || isWorst ? 2 : 1,
                            className: isBest ? 'mood-point-best' : isWorst ? 'mood-point-worst' : ''
                          }),
                          // Иконка типа над точкой
                          React.createElement('text', {
                            x: c.x, y: c.y - 10,
                            textAnchor: 'middle',
                            fontSize: '8',
                            fill: 'var(--text-secondary, #6b7280)'
                          }, c.icon)
                        );
                      }),
                      // Подписи времени
                      coords.filter((c, i) => i === 0 || i === coords.length - 1).map((c, i) => {
                        const hours = Math.floor(c.time / 60);
                        const mins = c.time % 60;
                        const timeStr = String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
                        return React.createElement('text', {
                          key: 'time-' + i,
                          x: c.x,
                          y: svgH + 8,
                          textAnchor: i === 0 ? 'start' : 'end',
                          fontSize: '9',
                          fill: 'var(--text-tertiary, #9ca3af)'
                        }, timeStr);
                      })
                    )
                  );
                })()
              ),
              // Время последнего приёма и корреляция
              (lastMealTime || sleepCorrelation) && React.createElement('div', { className: 'day-insights-row' },
                lastMealTime && React.createElement('span', { className: 'day-insight' }, '🍽️ ' + lastMealTime),
                sleepCorrelation && React.createElement('span', { className: 'day-insight correlation' }, sleepCorrelation)
              ),
              // Умная подсказка
              dayTip && React.createElement('div', { className: 'smart-tip' }, dayTip),
              React.createElement('textarea', { 
                className: 'sleep-note', 
                placeholder: 'Заметка...', 
                value: day.dayComment || '', 
                rows: day.dayComment && day.dayComment.includes('\n') ? Math.min(day.dayComment.split('\n').length, 4) : 1,
                onChange: e => setDay(prev => ({...prev, dayComment: e.target.value, updatedAt: Date.now()})) 
              })
            );
          })()
        )
      ),

      // Карточка замеров тела
      React.createElement('div', { 
        className: 'measurements-card compact-card' + (measurementsNeedUpdate ? ' measurements-card--needs-update' : ''),
        onClick: (e) => {
          // Клик по карточке открывает редактор (если не по кнопке)
          if (!e.target.closest('button')) {
            openMeasurementsEditor();
          }
        },
        style: { cursor: 'pointer' }
      },
        React.createElement('div', { className: 'measurements-card__header' },
          React.createElement('div', { className: 'measurements-card__title' },
            React.createElement('span', { className: 'measurements-card__icon' }, '📐'),
            React.createElement('span', null, 'Замеры тела'),
            measurementsNeedUpdate && React.createElement('span', { className: 'measurements-card__badge' }, '📏 Пора обновить')
          ),
          React.createElement('div', { className: 'measurements-card__header-right' },
            React.createElement('button', { className: 'measurements-card__edit', onClick: openMeasurementsEditor }, 'Изменить')
          )
        ),

        // Содержимое
        (measurementsByField.some(f => f.value !== null) || measurementsHistory.length > 0)
          ? React.createElement('div', { className: 'measurements-card__list' },
              measurementsByField.map((f) => React.createElement('div', { 
                key: f.key, 
                className: 'measurements-card__row' + (f.warn ? ' measurements-card__row--warn' : '')
              },
                // Верхняя строка: иконка, название, значение, дельта, предупреждение
                React.createElement('div', { className: 'measurements-card__main' },
                  React.createElement('div', { className: 'measurements-card__label' },
                    React.createElement('span', { className: 'measurements-card__label-icon' }, f.icon),
                    React.createElement('span', null, f.label)
                  ),
                  React.createElement('div', { className: 'measurements-card__values' },
                    React.createElement('span', { className: 'measurements-card__value' }, f.value !== null ? (Math.round(f.value * 10) / 10) + ' см' : '—'),
                    f.delta !== null && React.createElement('span', { 
                      className: 'measurements-card__delta ' + (f.delta > 0 ? 'up' : f.delta < 0 ? 'down' : '') 
                    }, (f.delta > 0 ? '↑ +' : f.delta < 0 ? '↓ ' : '') + (Math.round(f.delta * 10) / 10) + ' см'),
                    f.warn && React.createElement('span', { className: 'measurements-card__warn' }, '⚠️')
                  )
                ),
                // Sparkline на отдельной строке с датами
                f.points && f.points.length >= 2 && React.createElement('div', { className: 'measurements-card__spark-row' }, 
                  renderMeasurementSpark(f.points)
                )
              )),
              // Прогресс за месяц
              measurementsMonthlyProgress && React.createElement('div', { className: 'measurements-card__monthly' },
                '📊 За период: ',
                measurementsMonthlyProgress.map((p, i) => 
                  React.createElement('span', { 
                    key: p.label,
                    className: 'measurements-card__monthly-item' + (p.diff < 0 ? ' down' : p.diff > 0 ? ' up' : '')
                  }, 
                    (i > 0 ? ', ' : '') + p.label + ' ' + (p.diff > 0 ? '+' : '') + p.diff + ' см'
                  )
                )
              )
            )
          : React.createElement('div', { className: 'measurements-card__empty' },
              React.createElement('div', { className: 'measurements-card__empty-icon' }, '📏'),
              React.createElement('div', { className: 'measurements-card__empty-text' }, 'Добавьте замеры раз в неделю — талия, бёдра, бедро, бицепс'),
              React.createElement('button', { className: 'measurements-card__button', onClick: openMeasurementsEditor }, 'Заполнить замеры')
            ),

        React.createElement('div', { className: 'measurements-card__footer' },
          measurementsLastDateFormatted && React.createElement('span', { className: 'measurements-card__footer-date' }, 'Последний замер: ' + measurementsLastDateFormatted)
        )
      )
    );

    // Карточка особого периода (показывается для женщин с включённым трекингом)
    const showCycleCard = prof.cycleTrackingEnabled && prof.sex === 'female';
    const cyclePhase = HEYS.Cycle?.getCyclePhase?.(day.cycleDay);
    
    // Состояние для inline-редактирования дня цикла
    const [cycleEditMode, setCycleEditMode] = React.useState(false);
    const [cycleDayInput, setCycleDayInput] = React.useState(day.cycleDay || '');
    
    // Сохранить день цикла с автоматическим проставлением всех 7 дней
    const saveCycleDay = React.useCallback((newDay) => {
      const validDay = newDay === null ? null : Math.min(Math.max(1, parseInt(newDay) || 1), 7);
      
      // Обновляем текущий день в state
      setDay(prev => ({ ...prev, cycleDay: validDay, updatedAt: Date.now() }));
      setCycleEditMode(false);
      
      // Автоматически проставляем все 7 дней
      if (validDay && HEYS.Cycle?.setCycleDaysAuto && lsGet && lsSet) {
        const result = HEYS.Cycle.setCycleDaysAuto(date, validDay, lsGet, lsSet);
        console.log('[Cycle] Auto-filled', result.updated, 'days:', result.dates.join(', '));
      }
    }, [setDay, date, lsGet, lsSet]);
    
    // Сбросить день цикла и все связанные дни
    const clearCycleDay = React.useCallback(() => {
      setDay(prev => ({ ...prev, cycleDay: null, updatedAt: Date.now() }));
      setCycleEditMode(false);
      
      // Очищаем все связанные дни
      if (HEYS.Cycle?.clearCycleDays && lsGet && lsSet) {
        const result = HEYS.Cycle.clearCycleDays(date, lsGet, lsSet);
        console.log('[Cycle] Cleared', result.cleared, 'days');
      }
    }, [setDay, date, lsGet, lsSet]);
    
    const cycleCard = showCycleCard && React.createElement('div', {
      className: 'cycle-card compact-card' + (cycleEditMode ? ' cycle-card--editing' : ''),
      key: 'cycle-card'
    },
      // Если есть данные — показываем фазу
      cyclePhase ? React.createElement(React.Fragment, null,
        React.createElement('div', { 
          className: 'cycle-card__header',
          onClick: () => setCycleEditMode(!cycleEditMode)
        },
          React.createElement('span', { className: 'cycle-card__icon' }, cyclePhase.icon),
          React.createElement('span', { className: 'cycle-card__title' }, cyclePhase.shortName),
          React.createElement('span', { className: 'cycle-card__day' }, 'День ' + day.cycleDay),
          React.createElement('span', { className: 'cycle-card__edit-hint' }, '✏️')
        ),
        !cycleEditMode && React.createElement('div', { className: 'cycle-card__info' },
          cyclePhase.kcalMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' }, 
            '🔥 ' + (cyclePhase.kcalMultiplier > 1 ? '+' : '') + Math.round((cyclePhase.kcalMultiplier - 1) * 100) + '% ккал'
          ),
          cyclePhase.waterMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' }, 
            '💧 +' + Math.round((cyclePhase.waterMultiplier - 1) * 100) + '% вода'
          ),
          cyclePhase.insulinWaveMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' }, 
            '📈 +' + Math.round((cyclePhase.insulinWaveMultiplier - 1) * 100) + '% волна'
          )
        )
      ) 
      // Если нет данных — показываем "Указать"
      : React.createElement('div', { 
          className: 'cycle-card__header cycle-card__header--empty',
          onClick: () => setCycleEditMode(true)
        },
          React.createElement('span', { className: 'cycle-card__icon' }, '🌸'),
          React.createElement('span', { className: 'cycle-card__title' }, 'Особый период'),
          React.createElement('span', { className: 'cycle-card__empty-hint' }, 'Указать день →')
        ),
      
      // Режим редактирования — кнопки выбора дня
      cycleEditMode && React.createElement('div', { className: 'cycle-card__edit' },
        React.createElement('div', { className: 'cycle-card__days' },
          [1,2,3,4,5,6,7].map(d => 
            React.createElement('button', {
              key: d,
              className: 'cycle-card__day-btn' + (day.cycleDay === d ? ' cycle-card__day-btn--active' : ''),
              onClick: () => saveCycleDay(d)
            }, d)
          )
        ),
        React.createElement('div', { className: 'cycle-card__actions' },
          day.cycleDay && React.createElement('button', {
            className: 'cycle-card__clear-btn',
            onClick: clearCycleDay
          }, 'Сбросить'),
          React.createElement('button', {
            className: 'cycle-card__cancel-btn',
            onClick: () => setCycleEditMode(false)
          }, 'Отмена')
        )
      )
    );

  // compareBlock удалён по требованию

    // Сортируем приёмы для отображения (последние наверху)
    const sortedMealsForDisplay = React.useMemo(() => {
      const meals = day.meals || [];
      if (meals.length <= 1) return meals;
      
      return [...meals].sort((a, b) => {
        const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
        const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;
        
        if (timeA === null && timeB === null) return 0;
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        
        // Обратный порядок: последние (позже) наверху
        return timeB - timeA;
      });
    }, [day.meals]);

    const mealsUI = sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
      const mi = (day.meals || []).findIndex(m => m.id === sortedMeal.id);
      if (mi === -1) {
        console.warn('[HEYS] MealCard: meal not found in day.meals', sortedMeal.id);
        return null;
      }
      // Берём актуальный meal из day.meals, а не из sorted (который может быть stale)
      const meal = day.meals[mi];
      const isExpanded = isMealExpanded(mi, (day.meals || []).length, day.meals, displayIndex);
      // Номер приёма (1-based, хронологический: первый по времени = 1)
      const mealNumber = sortedMealsForDisplay.length - displayIndex;
      const isFirst = displayIndex === 0;
      
      // Key включает mealType чтобы форсировать перерендер при смене типа
      const isCurrentMeal = isFirst && !isMealStale(meal);
      
      return React.createElement('div', {
        key: meal.id + '_' + (meal.mealType || 'auto'),
        className: 'meal-with-number',
        style: {
          marginTop: isFirst ? '0' : '24px'
        }
      },
        // Номер приёма над карточкой + "ТЕКУЩИЙ" для активного
        React.createElement('div', {
          className: 'meal-number-header',
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '6px',
            gap: '4px'
          }
        },
          React.createElement('div', {
            className: 'meal-number-badge' + (isCurrentMeal ? ' meal-number-badge--current' : ''),
            style: {
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: isCurrentMeal 
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' 
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: '700',
              boxShadow: isCurrentMeal 
                ? '0 2px 8px rgba(34,197,94,0.35)' 
                : '0 2px 8px rgba(59,130,246,0.35)'
            }
          }, mealNumber),
          // Надпись "ТЕКУЩИЙ ПРИЁМ" для активного приёма
          isCurrentMeal && React.createElement('span', {
            className: 'meal-current-label',
            style: {
              fontSize: '14px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#22c55e',
              marginTop: '4px'
            }
          }, 'ТЕКУЩИЙ ПРИЁМ')
        ),
        // Карточка приёма
        React.createElement(MealCard, {
          meal,
          mealIndex: mi,
          displayIndex,
          products,
          pIndex,
          date,
          setDay,
          isMobile,
          isExpanded,
          onToggleExpand: toggleMealExpand,
          onChangeMealType: changeMealType,
          onChangeTime: updateMealTime,
          onChangeMood: changeMealMood,
          onChangeWellbeing: changeMealWellbeing,
          onChangeStress: changeMealStress,
          onRemoveMeal: removeMeal,
          openEditGramsModal,
          openTimeEditor,
          openMoodEditor,
          setGrams,
          removeItem,
          isMealStale,
          allMeals: day.meals,
          isNewItem,
          optimum,
          setMealQualityPopup,
          addProductToMeal,
          dayData: day,
          profile: prof
        })
      );
    });

    // Суточные итоги по всем приёмам (используем totals из compareBlock логики)
    function dayTotals(){
      const t={kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0};
      (day.meals||[]).forEach(m=>{ const mt=M.mealTotals? M.mealTotals(m,pIndex): {}; Object.keys(t).forEach(k=>{ t[k]+=mt[k]||0; }); });
      Object.keys(t).forEach(k=>t[k]=r0(t[k]));
      return t;
    }
    const dayTot = dayTotals();
    // Weighted averages для ГИ и вредности по граммам
  (function(){ let gSum=0, giSum=0, harmSum=0; (day.meals||[]).forEach(m=> (m.items||[]).forEach(it=>{ const p=getProductFromItem(it,pIndex); if(!p)return; const g=+it.grams||0; if(!g)return; const gi=p.gi??p.gi100??p.GI??p.giIndex; const harm=p.harm??p.harmScore??p.harm100??p.harmPct; gSum+=g; if(gi!=null) giSum+=gi*g; if(harm!=null) harmSum+=harm*g; })); dayTot.gi=gSum?giSum/gSum:0; dayTot.harm=gSum?harmSum/gSum:0; })();
    // Нормативы суточные рассчитываем из процентов heys_norms и целевой калорийности (optimum)
    const normPerc = (HEYS.utils&&HEYS.utils.lsGet?HEYS.utils.lsGet('heys_norms',{}):{}) || {};
    function computeDailyNorms(){
      const K = +optimum || 0; // целевая ккал (нужно съесть)
      const carbPct = +normPerc.carbsPct||0;
      const protPct = +normPerc.proteinPct||0;
      const fatPct = Math.max(0,100 - carbPct - protPct);
      const carbs = K? (K * carbPct/100)/4 : 0;
      const prot  = K? (K * protPct/100)/4 : 0;
      const fat   = K? (K * fatPct/100)/9 : 0; // 9 ккал/г
      const simplePct = +normPerc.simpleCarbPct||0;
      const simple = carbs * simplePct/100;
      const complex = Math.max(0, carbs - simple);
      const badPct = +normPerc.badFatPct||0;
      const transPct = +normPerc.superbadFatPct||0; // супер вредные => trans
      const bad = fat * badPct/100;
      const trans = fat * transPct/100;
      const good = Math.max(0, fat - bad - trans);
      const fiberPct = +normPerc.fiberPct||0; // трактуем как г клетчатки на 1000 ккал
      const fiber = K? (K/1000) * fiberPct : 0;
      const gi = +normPerc.giPct||0; // целевой средний ГИ
      const harm = +normPerc.harmPct||0; // целевая вредность
      return {kcal:K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm};
    }
    const normAbs = computeDailyNorms();
    
    // === Advice Module Integration (после dayTot и normAbs) ===
    // 🔧 FIX: Используем state для отслеживания готовности модуля advice
    const [adviceModuleReady, setAdviceModuleReady] = React.useState(!!window.HEYS?.advice?.useAdviceEngine);
    
    React.useEffect(() => {
      if (adviceModuleReady) return;
      // Проверяем готовность модуля каждые 100мс пока не загрузится
      const checkInterval = setInterval(() => {
        if (window.HEYS?.advice?.useAdviceEngine) {
          setAdviceModuleReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      // Таймаут на 5 секунд
      const timeout = setTimeout(() => clearInterval(checkInterval), 5000);
      return () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
      };
    }, [adviceModuleReady]);
    
    const adviceEngine = adviceModuleReady ? window.HEYS.advice.useAdviceEngine : null;
    
    // 🔐 Guard: не генерируем советы если нет выбранного клиента
    const hasClient = !!(window.HEYS?.currentClientId);
    const emptyAdviceResult = { primary: null, relevant: [], adviceCount: 0, allAdvices: [], badgeAdvices: [], rateAdvice: null, scheduleAdvice: null, scheduledCount: 0 };
    
    // Note: displayOptimum и caloricDebt определяются позже, передаём null — advice использует fallback
    const adviceResult = (adviceEngine && hasClient) ? adviceEngine({
      dayTot,
      normAbs,
      optimum,
      displayOptimum: null, // Определяется позже, advice использует optimum как fallback
      caloricDebt: null,    // Определяется позже
      day,
      pIndex,
      currentStreak,
      trigger: adviceTrigger,
      uiState,
      prof,        // Профиль пользователя для персонализации
      waterGoal    // Динамическая норма воды из waterGoalBreakdown
    }) : emptyAdviceResult;
    
    const { primary: advicePrimary, relevant: adviceRelevant, adviceCount, allAdvices, badgeAdvices, markShown, rateAdvice, scheduleAdvice, scheduledCount } = adviceResult;
    
    // Количество непрочитанных советов (для badge на FAB кнопке)
    // badgeAdvices — массив советов с полной фильтрацией (как trigger='manual')
    const totalAdviceCount = React.useMemo(() => {
      if (!badgeAdvices?.length) return 0;
      return badgeAdvices.filter(a => !dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id)).length;
    }, [badgeAdvices, dismissedAdvices, hiddenUntilTomorrow]);
    
    // Обновляем badge в нижней навигации
    React.useEffect(() => {
      const badge = document.getElementById('nav-advice-badge');
      if (badge) {
        badge.textContent = totalAdviceCount > 0 ? totalAdviceCount : '';
        badge.style.display = totalAdviceCount > 0 ? 'flex' : 'none';
      }
    }, [totalAdviceCount]);
    
    // Listener для heysShowAdvice (из нижней навигации)
    React.useEffect(() => {
      const handleShowAdvice = () => {
        if (totalAdviceCount > 0) {
          setAdviceTrigger('manual');
          setAdviceExpanded(true);
          setToastVisible(true);
          setToastDismissed(false);
          haptic('light');
        } else {
          setAdviceTrigger('manual_empty');
          setToastVisible(true);
          setToastDismissed(false);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => {
            setToastVisible(false);
            setAdviceTrigger(null);
          }, 2000);
        }
      };
      window.addEventListener('heysShowAdvice', handleShowAdvice);
      return () => window.removeEventListener('heysShowAdvice', handleShowAdvice);
    }, [totalAdviceCount]);
    
    // Listener для heysProductAdded event
    React.useEffect(() => {
      const handleProductAdded = () => {
        // 🚀 Инвалидируем кэш советов при добавлении продукта
        if (HEYS.advice?.invalidateAdviceCache) {
          HEYS.advice.invalidateAdviceCache();
        }
        setTimeout(() => setAdviceTrigger('product_added'), 500);
      };
      window.addEventListener('heysProductAdded', handleProductAdded);
      return () => window.removeEventListener('heysProductAdded', handleProductAdded);
    }, []);
    
    // Интервальная проверка scheduled советов (каждые 30 сек)
    React.useEffect(() => {
      const checkScheduled = () => {
        try {
          const scheduled = JSON.parse(localStorage.getItem('heys_scheduled_advices') || '[]');
          const now = Date.now();
          const ready = scheduled.filter(s => s.showAt <= now);
          if (ready.length > 0) {
            setAdviceTrigger('scheduled');
          }
        } catch (e) {}
      };
      const intervalId = setInterval(checkScheduled, 30000);
      return () => clearInterval(intervalId);
    }, []);
    
    // Listener для heysCelebrate event (централизованный confetti от gamification)
    React.useEffect(() => {
      const handleCelebrate = () => {
        setShowConfetti(true);
        if (typeof haptic === 'function') haptic('success');
        setTimeout(() => setShowConfetti(false), 2500);
      };
      window.addEventListener('heysCelebrate', handleCelebrate);
      return () => window.removeEventListener('heysCelebrate', handleCelebrate);
    }, []);
    
    // 🔄 Orphan products state — обновляется при добавлении/удалении продуктов
    const [orphanVersion, setOrphanVersion] = React.useState(0);
    React.useEffect(() => {
      const handleOrphanUpdated = () => {
        setOrphanVersion(v => v + 1);
      };
      window.addEventListener('heys:orphan-updated', handleOrphanUpdated);
      // Также слушаем heysProductsUpdated — когда продукты обновились
      window.addEventListener('heysProductsUpdated', () => {
        // Пересчитываем orphan при обновлении продуктов
        if (window.HEYS?.orphanProducts?.recalculate) {
          window.HEYS.orphanProducts.recalculate();
        }
      });
      return () => {
        window.removeEventListener('heys:orphan-updated', handleOrphanUpdated);
      };
    }, []);
    
    // Trigger на открытие вкладки
    React.useEffect(() => {
      const timer = setTimeout(() => setAdviceTrigger('tab_open'), 1500);
      return () => clearTimeout(timer);
    }, [date]);
    
    // Показ toast при получении совета
    // 🔧 FIX: Сохраняем совет и список в displayedAdvice/displayedAdviceList ПЕРЕД markShown,
    // чтобы тост отображался даже после того как advicePrimary станет null
    React.useEffect(() => {
      if (!advicePrimary) return;
      
      // 🔧 FIX: Пропускаем уже прочитанные советы (кроме manual триггера)
      const isManualTrigger = adviceTrigger === 'manual' || adviceTrigger === 'manual_empty';
      if (!isManualTrigger && dismissedAdvices.has(advicePrimary.id)) {
        return;
      }
      
      // Проверяем: автопоказ тостов (FAB = manual всегда работает)
      if (!isManualTrigger && !toastsEnabled) {
        // Тосты отключены — НЕ показываем автоматический тост, но сохраняем данные для FAB
        setDisplayedAdvice(advicePrimary);
        setDisplayedAdviceList(adviceRelevant || []);
        if (markShown) markShown(advicePrimary.id);
        return;
      }
      
      // Сохраняем совет и список для отображения
      setDisplayedAdvice(advicePrimary);
      setDisplayedAdviceList(adviceRelevant || []);
      setAdviceExpanded(false);
      setToastVisible(true);
      toastAppearedAtRef.current = Date.now();
      setToastDismissed(false);
      setToastDetailsOpen(false); // Сбрасываем детали при новом совете
      
      // 🔊 Звук при появлении тоста
      if (adviceSoundEnabled && window.HEYS?.sounds) {
        if (advicePrimary.type === 'achievement' || advicePrimary.showConfetti) {
          window.HEYS.sounds.success();
        } else if (advicePrimary.type === 'warning') {
          window.HEYS.sounds.warning();
        } else {
          window.HEYS.sounds.pop();
        }
      }
      
      if ((advicePrimary.type === 'achievement' || advicePrimary.type === 'warning') && typeof haptic === 'function') {
        haptic('light');
      }
      if (advicePrimary.onShow) advicePrimary.onShow();
      if (advicePrimary.showConfetti) {
        setShowConfetti(true);
        if (typeof haptic === 'function') haptic('success');
        setTimeout(() => setShowConfetti(false), 2000);
      }
      
      // Помечаем как показанный ПОСЛЕ сохранения в displayedAdvice
      if (markShown) markShown(advicePrimary.id);
      
      // 🔧 Таймер автозакрытия ОТКЛЮЧЁН — тост закрывается только свайпом
      // if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      // toastTimeoutRef.current = setTimeout(() => {
      //   setToastVisible(false);
      //   setAdviceExpanded(false);
      //   setAdviceTrigger(null);
      //   setDisplayedAdvice(null);
      //   setDisplayedAdviceList([]);
      //   setToastDetailsOpen(false);
      // }, advicePrimary.ttl || 5000);
      // return () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };
    }, [advicePrimary?.id, adviceTrigger, adviceSoundEnabled, dismissedAdvices]);
    
    // Сброс advice при смене даты
    React.useEffect(() => {
      setAdviceTrigger(null);
      setAdviceExpanded(false);
      setToastVisible(false);
      setDisplayedAdvice(null);
      setDisplayedAdviceList([]);
      setToastDetailsOpen(false);
      if (window.HEYS?.advice?.resetSessionAdvices) window.HEYS.advice.resetSessionAdvices();
    }, [date]);
    
    // Сброс при открытии picker
    React.useEffect(() => {
      if (uiState.showTimePicker || uiState.showWeightPicker ||
          uiState.showDeficitPicker || uiState.showZonePicker) {
        setAdviceExpanded(false);
      }
    }, [uiState.showTimePicker, uiState.showWeightPicker,
        uiState.showDeficitPicker, uiState.showZonePicker]);

    const factKeys = ['kcal','carbs','simple','complex','prot','fat','bad','good','trans','fiber','gi','harm'];
  function devVal(k){ const n=+normAbs[k]||0; const f=+dayTot[k]||0; if(!n) return '-'; const d=((f-n)/n)*100; return (d>0?'+':'')+Math.round(d)+'%'; }
  function devCell(k){ const n=+normAbs[k]||0; if(!n) return React.createElement('td',{key:'ds-dv'+k},'-'); const f=+dayTot[k]||0; const d=((f-n)/n)*100; const diff=Math.round(d); const color= diff>0?'#dc2626':(diff<0?'#059669':'#111827'); const fw=diff!==0?600:400; return React.createElement('td',{key:'ds-dv'+k,style:{color,fontWeight:fw}},(diff>0?'+':'')+diff+'%'); }
    function factCell(k){
      const f=+dayTot[k]||0; const n=+normAbs[k]||0; if(!n) return React.createElement('td',{key:'ds-fv'+k},fmtVal(k,f));
      const over=f>n, under=f<n; let color=null; let fw=600;
      if(['bad','trans'].includes(k)){ if(under) color='#059669'; else if(over) color='#dc2626'; else fw=400; }
      else if(k==='simple'){ if(under) color='#059669'; else if(over) color='#dc2626'; else fw=400; }
      else if(k==='complex'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='fiber'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='kcal'){ if(over) color='#dc2626'; else fw=400; }
      else if(k==='prot'){ if(over) color='#059669'; else fw=400; }
      else if(k==='carbs' || k==='fat'){ if(over) color='#dc2626'; else fw=400; }
      else if(k==='good'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='gi' || k==='harm'){ if(over) color='#dc2626'; else if(under) color='#059669'; else fw=400; }
      else { fw=400; }
      const style=color?{color,fontWeight:fw}:{fontWeight:fw};
      return React.createElement('td',{key:'ds-fv'+k,style},fmtVal(k,f));
    }
    function normVal(k){ const n=+normAbs[k]||0; return n?fmtVal(k,n):'-'; }
  const per100Head = ['','','','','','','','','','']; // 10 per100 columns blank (соответствует таблице приёма)
  const factHead = ['ккал','У','Прост','Сл','Б','Ж','ВрЖ','ПолЖ','СупЖ','Клет','ГИ','Вред','']; // последний пустой (кнопка)
  // Helper: calc percent of part from total (for mobile summary)
  const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;
    const daySummary = React.createElement('div',{className:'card tone-slate',style:{marginTop:'8px',overflowX:'auto'}},
      React.createElement('div',{className:'section-title',style:{marginBottom:'4px'}},'СУТОЧНЫЕ ИТОГИ'),
      React.createElement('table',{className:'tbl meals-table daily-summary'},
        React.createElement('thead',null,React.createElement('tr',null,
          React.createElement('th',null,''),
          React.createElement('th',null,''),
          per100Head.map((h,i)=>React.createElement('th',{key:'ds-ph'+i,className:'per100-col'},h)),
          factHead.map((h,i)=>React.createElement('th',{key:'ds-fh'+i},h))
        )),
        React.createElement('tbody',null,
          // Факт
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-pvL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Факт'},'Ф'):React.createElement('td',{key:'ds-pv'+i},'')),
            factKeys.map(k=>factCell(k)),
            React.createElement('td',null,'')
          ),
          // Норма
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-npL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Норма'},'Н'):React.createElement('td',{key:'ds-np'+i},'')),
            factKeys.map(k=>React.createElement('td',{key:'ds-nv'+k},normVal(k))),
            React.createElement('td',null,'')
          ),
          // Откл
          React.createElement('tr',{className:'daily-dev-row'},
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-dpL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Отклонение'},'Δ'):React.createElement('td',{key:'ds-dp'+i},'')),
            factKeys.map(k=>devCell(k)),
            React.createElement('td',null,'')
          )
        )
      ),
      // MOBILE: compact daily summary with column headers
      React.createElement('div', { className: 'mobile-daily-summary' },
        // Header row
        React.createElement('div', { className: 'mds-header' },
          React.createElement('span', { className: 'mds-label' }, ''),
          React.createElement('span', null, 'ккал'),
          React.createElement('span', null, 'У'),
          React.createElement('span', { className: 'mds-dim' }, 'пр/сл'),
          React.createElement('span', null, 'Б'),
          React.createElement('span', null, 'Ж'),
          React.createElement('span', { className: 'mds-dim' }, 'вр/пол/суп'),
          React.createElement('span', null, 'Кл'),
          React.createElement('span', null, 'ГИ'),
          React.createElement('span', null, 'Вр')
        ),
        // Fact row - с цветовой индикацией относительно нормы
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label', title: 'Факт' }, 'Ф'),
          React.createElement('span', { title: getDailyNutrientTooltip('kcal', dayTot.kcal, normAbs.kcal), style: { color: getDailyNutrientColor('kcal', dayTot.kcal, normAbs.kcal), fontWeight: getDailyNutrientColor('kcal', dayTot.kcal, normAbs.kcal) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.kcal)),
          React.createElement('span', { title: getDailyNutrientTooltip('carbs', dayTot.carbs, normAbs.carbs), style: { color: getDailyNutrientColor('carbs', dayTot.carbs, normAbs.carbs), fontWeight: getDailyNutrientColor('carbs', dayTot.carbs, normAbs.carbs) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.carbs)),
          React.createElement('span', { className: 'mds-dim' }, 
            React.createElement('span', { title: getDailyNutrientTooltip('simple', dayTot.simple, normAbs.simple), style: { color: getDailyNutrientColor('simple', dayTot.simple, normAbs.simple), fontWeight: getDailyNutrientColor('simple', dayTot.simple, normAbs.simple) ? 600 : 400, cursor: 'help' } }, pct(dayTot.simple, dayTot.carbs)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('complex', dayTot.complex, normAbs.complex), style: { color: getDailyNutrientColor('complex', dayTot.complex, normAbs.complex), cursor: 'help' } }, pct(dayTot.complex, dayTot.carbs))
          ),
          React.createElement('span', { title: getDailyNutrientTooltip('prot', dayTot.prot, normAbs.prot), style: { color: getDailyNutrientColor('prot', dayTot.prot, normAbs.prot), fontWeight: getDailyNutrientColor('prot', dayTot.prot, normAbs.prot) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.prot)),
          React.createElement('span', { title: getDailyNutrientTooltip('fat', dayTot.fat, normAbs.fat), style: { color: getDailyNutrientColor('fat', dayTot.fat, normAbs.fat), fontWeight: getDailyNutrientColor('fat', dayTot.fat, normAbs.fat) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.fat)),
          React.createElement('span', { className: 'mds-dim' }, 
            React.createElement('span', { title: getDailyNutrientTooltip('bad', dayTot.bad, normAbs.bad), style: { color: getDailyNutrientColor('bad', dayTot.bad, normAbs.bad), fontWeight: getDailyNutrientColor('bad', dayTot.bad, normAbs.bad) ? 600 : 400, cursor: 'help' } }, pct(dayTot.bad, dayTot.fat)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('good', dayTot.good, normAbs.good), style: { color: getDailyNutrientColor('good', dayTot.good, normAbs.good), fontWeight: getDailyNutrientColor('good', dayTot.good, normAbs.good) ? 600 : 400, cursor: 'help' } }, pct(dayTot.good, dayTot.fat)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('trans', dayTot.trans, normAbs.trans), style: { color: getDailyNutrientColor('trans', dayTot.trans, normAbs.trans), fontWeight: getDailyNutrientColor('trans', dayTot.trans, normAbs.trans) ? 600 : 400, cursor: 'help' } }, pct(dayTot.trans || 0, dayTot.fat))
          ),
          React.createElement('span', { title: getDailyNutrientTooltip('fiber', dayTot.fiber, normAbs.fiber), style: { color: getDailyNutrientColor('fiber', dayTot.fiber, normAbs.fiber), fontWeight: getDailyNutrientColor('fiber', dayTot.fiber, normAbs.fiber) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.fiber)),
          React.createElement('span', { title: getDailyNutrientTooltip('gi', dayTot.gi, normAbs.gi), style: { color: getDailyNutrientColor('gi', dayTot.gi, normAbs.gi), fontWeight: getDailyNutrientColor('gi', dayTot.gi, normAbs.gi) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.gi || 0)),
          React.createElement('span', { title: getDailyNutrientTooltip('harm', dayTot.harm, normAbs.harm), style: { color: getDailyNutrientColor('harm', dayTot.harm, normAbs.harm), fontWeight: getDailyNutrientColor('harm', dayTot.harm, normAbs.harm) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', dayTot.harm || 0))
        ),
        // Norm row
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label', title: 'Норма' }, 'Н'),
          React.createElement('span', null, Math.round(normAbs.kcal || 0)),
          React.createElement('span', null, Math.round(normAbs.carbs || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.simple || 0, normAbs.carbs || 1) + '/' + pct(normAbs.complex || 0, normAbs.carbs || 1)),
          React.createElement('span', null, Math.round(normAbs.prot || 0)),
          React.createElement('span', null, Math.round(normAbs.fat || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.bad || 0, normAbs.fat || 1) + '/' + pct(normAbs.good || 0, normAbs.fat || 1) + '/' + pct(normAbs.trans || 0, normAbs.fat || 1)),
          React.createElement('span', null, Math.round(normAbs.fiber || 0)),
          React.createElement('span', null, Math.round(normAbs.gi || 0)),
          React.createElement('span', null, fmtVal('harm', normAbs.harm || 0))
        ),
        // Deviation row - custom layout matching header columns
        React.createElement('div', { className: 'mds-row mds-dev' },
          React.createElement('span', { className: 'mds-label', title: 'Отклонение' }, 'Δ'),
          // kcal
          (() => { const n = normAbs.kcal || 0, f = dayTot.kcal || 0; if (!n) return React.createElement('span', { key: 'dev-kcal' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-kcal', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // carbs
          (() => { const n = normAbs.carbs || 0, f = dayTot.carbs || 0; if (!n) return React.createElement('span', { key: 'dev-carbs' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-carbs', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // simple/complex (combined)
          (() => {
            const ns = normAbs.simple || 0, fs = dayTot.simple || 0;
            const nc = normAbs.complex || 0, fc = dayTot.complex || 0;
            const ds = ns ? Math.round(((fs - ns) / ns) * 100) : 0;
            const dc = nc ? Math.round(((fc - nc) / nc) * 100) : 0;
            const cs = ds > 0 ? '#dc2626' : ds < 0 ? '#059669' : '#6b7280';
            const cc = dc > 0 ? '#dc2626' : dc < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-sc', className: 'mds-dim' },
              React.createElement('span', { style: { color: cs } }, (ds > 0 ? '+' : '') + ds),
              '/',
              React.createElement('span', { style: { color: cc } }, (dc > 0 ? '+' : '') + dc)
            );
          })(),
          // prot
          (() => { const n = normAbs.prot || 0, f = dayTot.prot || 0; if (!n) return React.createElement('span', { key: 'dev-prot' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-prot', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // fat
          (() => { const n = normAbs.fat || 0, f = dayTot.fat || 0; if (!n) return React.createElement('span', { key: 'dev-fat' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fat', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // bad/good/trans (combined)
          (() => {
            const nb = normAbs.bad || 0, fb = dayTot.bad || 0;
            const ng = normAbs.good || 0, fg = dayTot.good || 0;
            const nt = normAbs.trans || 0, ft = dayTot.trans || 0;
            const db = nb ? Math.round(((fb - nb) / nb) * 100) : 0;
            const dg = ng ? Math.round(((fg - ng) / ng) * 100) : 0;
            const dt = nt ? Math.round(((ft - nt) / nt) * 100) : 0;
            const cb = db > 0 ? '#dc2626' : db < 0 ? '#059669' : '#6b7280';
            const cg = dg > 0 ? '#dc2626' : dg < 0 ? '#059669' : '#6b7280';
            const ct = dt > 0 ? '#dc2626' : dt < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-bgt', className: 'mds-dim' },
              React.createElement('span', { style: { color: cb } }, (db > 0 ? '+' : '') + db),
              '/',
              React.createElement('span', { style: { color: cg } }, (dg > 0 ? '+' : '') + dg),
              '/',
              React.createElement('span', { style: { color: ct } }, (dt > 0 ? '+' : '') + dt)
            );
          })(),
          // fiber
          (() => { const n = normAbs.fiber || 0, f = dayTot.fiber || 0; if (!n) return React.createElement('span', { key: 'dev-fiber' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fiber', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // gi
          (() => { const n = normAbs.gi || 0, f = dayTot.gi || 0; if (!n) return React.createElement('span', { key: 'dev-gi' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-gi', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // harm
          (() => { const n = normAbs.harm || 0, f = dayTot.harm || 0; if (!n) return React.createElement('span', { key: 'dev-harm' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-harm', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })()
        )
      )
    );

    // Выравнивание высоты фиолетового блока с блоком тренировок справа
  // (авто-высота убрана; таблица сама уменьшена по строкам / высоте инпутов)
  
    // DatePicker теперь в шапке App (heys_app_v12.js)
    // Тренировки выводятся в sideBlock (side-compare)

    // === HERO METRICS CARDS ===
    const remainingKcal = r0(optimum - eatenKcal); // сколько ещё можно съесть
    const currentRatio = eatenKcal / (optimum || 1);
    
    // Цвета для карточек — используем ratioZones
    function getEatenColor() {
      const rz = window.HEYS && window.HEYS.ratioZones;
      if (rz) {
        const zone = rz.getZone(currentRatio);
        const baseColor = zone.color;
        return { 
          bg: baseColor + '20',
          text: zone.textColor === '#fff' ? baseColor : zone.textColor, 
          border: baseColor + '60'
        };
      }
      // Fallback
      if (currentRatio < 0.5) return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
      if (currentRatio < 0.75) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
      if (currentRatio < 1.1) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
      if (currentRatio < 1.3) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
      return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
    }
    function getRemainingColor() {
      const rz = window.HEYS && window.HEYS.ratioZones;
      if (rz) {
        const zone = rz.getZone(currentRatio);
        const baseColor = zone.color;
        return { 
          bg: baseColor + '20',
          text: zone.textColor === '#fff' ? baseColor : zone.textColor, 
          border: baseColor + '60'
        };
      }
      if (remainingKcal > 100) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
      if (remainingKcal >= 0) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
      return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
    }
    
    // Статус ratio для badge — АДАПТИВНЫЙ к времени дня
    function getRatioStatus() {
      // Если ещё ничего не съедено — приветствие, а не ошибка
      if (eatenKcal === 0) {
        return { emoji: '👋', text: 'Хорошего дня!', color: '#64748b' };
      }
      
      // Адаптивная оценка: учитываем время дня
      // Ожидаемый % калорий к текущему часу (приблизительно)
      // 06:00 → 0%, 12:00 → 35%, 18:00 → 75%, 22:00 → 95%
      const now = new Date();
      const currentHour = now.getHours();
      
      // Расчёт ожидаемого прогресса (% от нормы к текущему часу)
      // Упрощённая модель: день начинается в 6:00, заканчивается в 23:00
      let expectedProgress;
      if (currentHour < 6) {
        expectedProgress = 0; // Ночь — не ожидаем еды
      } else if (currentHour <= 9) {
        expectedProgress = (currentHour - 6) * 0.08; // 0-24% к 9:00
      } else if (currentHour <= 14) {
        expectedProgress = 0.24 + (currentHour - 9) * 0.10; // 24-74% к 14:00
      } else if (currentHour <= 20) {
        expectedProgress = 0.74 + (currentHour - 14) * 0.04; // 74-98% к 20:00
      } else {
        expectedProgress = 0.98; // После 20:00 ожидаем почти 100%
      }
      
      // Сравниваем фактический прогресс с ожидаемым
      // currentRatio = съедено / норма
      const progressDiff = currentRatio - expectedProgress;
      
      // Определяем статус на основе разницы и абсолютного значения
      // Если впереди графика или в пределах нормы — хорошо
      // Если сильно отстаём — предупреждение
      
      // Также учитываем абсолютный перебор в конце дня
      if (currentRatio >= 1.3) {
        return { emoji: '🚨', text: 'Перебор!', color: '#ef4444' };
      }
      if (currentRatio >= 1.1) {
        return { emoji: '😅', text: 'Чуть больше', color: '#eab308' };
      }
      if (currentRatio >= 0.9 && currentRatio < 1.1) {
        return { emoji: '🔥', text: 'Идеально!', color: '#10b981' };
      }
      
      // Для недобора — адаптивная оценка
      if (currentHour < 12) {
        // Утро: любой прогресс — хорошо
        if (currentRatio >= 0.1) {
          return { emoji: '🌅', text: 'Хорошее начало!', color: '#22c55e' };
        }
        return { emoji: '☕', text: 'Время завтрака', color: '#64748b' };
      }
      
      if (currentHour < 15) {
        // День (12-15): ожидаем ~30-55%
        if (progressDiff >= -0.1) {
          return { emoji: '👍', text: 'Так держать!', color: '#22c55e' };
        }
        if (progressDiff >= -0.25) {
          return { emoji: '🍽️', text: 'Время обеда', color: '#eab308' };
        }
        return { emoji: '⚠️', text: 'Мало для обеда', color: '#f97316' };
      }
      
      if (currentHour < 19) {
        // Вечер (15-19): ожидаем ~55-85%
        if (progressDiff >= -0.1) {
          return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
        }
        if (progressDiff >= -0.2) {
          return { emoji: '🍽️', text: 'Пора перекусить', color: '#eab308' };
        }
        return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
      }
      
      // Поздний вечер (19+): ожидаем ~85-100%
      if (currentRatio >= 0.75) {
        return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
      }
      if (currentRatio >= 0.6) {
        return { emoji: '🍽️', text: 'Нужен ужин', color: '#eab308' };
      }
      if (currentRatio >= 0.4) {
        return { emoji: '⚠️', text: 'Мало калорий', color: '#f97316' };
      }
      return { emoji: '💀', text: 'Критически мало!', color: '#ef4444' };
    }
    const ratioStatus = getRatioStatus();
    function getDeficitColor() {
      // factDefPct отрицательный = дефицит (хорошо), положительный = профицит (плохо)
      const target = dayTargetDef; // отрицательное значение
      if (factDefPct <= target) return { bg: '#dcfce7', text: '#065f46', border: '#86efac' };
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' };
    }
    
    const eatenCol = getEatenColor();
    const remainCol = getRemainingColor();
    const defCol = getDeficitColor();
    
    // Progress bar для дефицита (ширина = |factDefPct| / 50 * 100%, макс 100%)
    const deficitProgress = Math.min(100, Math.abs(factDefPct) / 50 * 100);
    
    // Вычисление тренда веса за последние 7 дней
    // С учётом цикла: дни с задержкой воды исключаются для "чистого" тренда
    const weightTrend = React.useMemo(() => {
      try {
        const today = new Date(date);
        const weights = [];
        const weightsClean = []; // Без дней с задержкой воды
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        let hasRetentionDays = false; // Есть ли дни с задержкой воды
        
        // Собираем вес за последние 7 дней (включая сегодня)
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const scopedKey = clientId 
            ? 'heys_' + clientId + '_dayv2_' + dateStr 
            : 'heys_dayv2_' + dateStr;
          
          let dayData = null;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            }
          } catch(e) {}
          
          if (dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0) {
            const cycleDayValue = dayData.cycleDay || null;
            // Исключаем из тренда: менструальный цикл ИЛИ refeed день
            const cycleExclude = HEYS.Cycle?.shouldExcludeFromWeightTrend?.(cycleDayValue) || false;
            const refeedExclude = HEYS.Refeed?.shouldExcludeFromWeightTrend?.(dayData) || false;
            const shouldExclude = cycleExclude || refeedExclude;
            
            const weightEntry = { 
              date: dateStr, 
              weight: +dayData.weightMorning, 
              dayIndex: 6 - i,
              cycleDay: cycleDayValue,
              hasRetention: shouldExclude
            };
            
            weights.push(weightEntry);
            
            if (shouldExclude) {
              hasRetentionDays = true;
            } else {
              weightsClean.push(weightEntry);
            }
          }
        }
        
        // Нужно минимум 2 точки для тренда
        if (weights.length < 2) return null;
        
        // Используем чистые данные если есть минимум 2 точки, иначе все
        const useClean = weightsClean.length >= 2 && hasRetentionDays;
        const dataForTrend = useClean ? weightsClean : weights;
        
        // Сортируем по дате (от старой к новой)
        dataForTrend.sort((a, b) => a.date.localeCompare(b.date));
        
        // Линейная регрессия для более точного тренда
        const n = dataForTrend.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          const x = dataForTrend[i].dayIndex;
          const y = dataForTrend[i].weight;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }
        
        const denominator = n * sumX2 - sumX * sumX;
        // slope = изменение веса за 1 день по тренду
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        
        // Ограничиваем slope: максимум ±0.3 кг/день (реалистичный предел)
        const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));
        
        // Вычисляем изменение за период
        const firstWeight = dataForTrend[0].weight;
        const lastWeight = dataForTrend[dataForTrend.length - 1].weight;
        const diff = lastWeight - firstWeight;
        
        // Определяем направление
        let arrow = '→';
        let direction = 'same';
        if (clampedSlope > 0.03) { arrow = '⬆️'; direction = 'up'; }
        else if (clampedSlope < -0.03) { arrow = '⬇️'; direction = 'down'; }
        
        // Форматируем текст
        const sign = diff > 0 ? '+' : '';
        const text = arrow + ' ' + sign + r1(diff) + ' кг';
        
        // Добавляем информацию о чистом тренде
        return { 
          text, 
          diff, 
          direction, 
          slope: clampedSlope, 
          dataPoints: n,
          isCleanTrend: useClean, // Тренд исключает дни с задержкой воды
          retentionDaysExcluded: hasRetentionDays ? weights.length - weightsClean.length : 0
        };
      } catch (e) {
        return null;
      }
    }, [date, day.weightMorning, day.cycleDay]);
    
    // Прогноз веса на месяц (~Xкг/мес)
    const monthForecast = React.useMemo(() => {
      if (!weightTrend || weightTrend.slope === undefined) return null;
      
      // Используем slope из линейной регрессии (уже ограничен ±0.3 кг/день)
      const monthChange = weightTrend.slope * 30;
      
      // Показываем только если изменение значительное (>0.3кг/мес)
      // и есть минимум 3 точки данных для надёжности
      if (Math.abs(monthChange) < 0.3 || weightTrend.dataPoints < 3) return null;
      
      const sign = monthChange > 0 ? '+' : '';
      return {
        text: '~' + sign + r1(monthChange) + ' кг/мес',
        direction: monthChange < 0 ? 'down' : monthChange > 0 ? 'up' : 'same'
      };
    }, [weightTrend]);
    
    // Данные для sparkline веса за N дней
    const weightSparklineData = React.useMemo(() => {
      try {
        const realToday = new Date();
        const realTodayStr = fmtDate(realToday);
        const days = [];
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        
        // Получаем cycleDay для сегодняшнего дня из state
        const todayCycleDay = day.cycleDay || null;
        
        // Функция получения данных дня из localStorage
        const getDayWeight = (dateStr) => {
          const scopedKey = clientId 
            ? 'heys_' + clientId + '_dayv2_' + dateStr 
            : 'heys_dayv2_' + dateStr;
          
          try {
            const raw = localStorage.getItem(scopedKey);
            if (!raw) return null;
            const dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            if (dayData?.weightMorning > 0) {
              const cycleDayValue = dayData.cycleDay || null;
              const retentionInfo = HEYS.Cycle?.getWaterRetentionInfo?.(cycleDayValue) || { hasRetention: false };
              // Проверяем наличие тренировок
              const trainings = dayData.trainings || [];
              const hasTraining = trainings.some(t => t?.z?.some(z => z > 0));
              const trainingTypes = trainings
                .filter(t => t?.z?.some(z => z > 0))
                .map(t => t.type || 'cardio');
              return {
                weight: +dayData.weightMorning,
                cycleDay: cycleDayValue,
                hasWaterRetention: retentionInfo.hasRetention,
                retentionSeverity: retentionInfo.severity,
                retentionAdvice: retentionInfo.advice,
                hasTraining,
                trainingTypes
              };
            }
          } catch(e) {}
          return null;
        };
        
        // === НОВОЕ: Находим первый день с весом за последние 60 дней ===
        let firstDataDay = null;
        const maxLookback = 60;
        for (let i = maxLookback; i >= 0; i--) {
          const d = new Date(realToday);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          
          // Для сегодня — из state
          if (dateStr === realTodayStr) {
            if (+day.weightMorning > 0) {
              firstDataDay = dateStr;
              break;
            }
          } else {
            const data = getDayWeight(dateStr);
            if (data) {
              firstDataDay = dateStr;
              break;
            }
          }
        }
        
        // Если нет данных — возвращаем пустой массив
        if (!firstDataDay) return [];
        
        // === Считаем сколько дней с первого дня данных до сегодня ===
        const firstDataDate = new Date(firstDataDay);
        const daysSinceFirstData = Math.floor((realToday - firstDataDate) / (24 * 60 * 60 * 1000)) + 1;
        
        // === КЛЮЧЕВАЯ ЛОГИКА: Определяем диапазон дат для графика ===
        let startDate;
        let daysToShow;
        let futureDaysCount = 0;
        
        if (daysSinceFirstData >= chartPeriod) {
          // Данных достаточно — показываем последние chartPeriod дней
          startDate = new Date(realToday);
          startDate.setDate(startDate.getDate() - (chartPeriod - 1));
          daysToShow = chartPeriod;
        } else {
          // Данных мало — показываем от первого дня с данными
          // Остальные слоты справа заполним прогнозом
          startDate = firstDataDate;
          daysToShow = daysSinceFirstData;
          futureDaysCount = chartPeriod - daysSinceFirstData;
        }
        
        // Собираем данные за период (от startDate до сегодня)
        for (let i = 0; i < daysToShow; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr;
          
          // Для реального сегодняшнего дня берём вес из state (реактивный)
          if (isRealToday) {
            const todayWeight = +day.weightMorning || 0;
            if (todayWeight > 0) {
              const retentionInfo = HEYS.Cycle?.getWaterRetentionInfo?.(todayCycleDay) || { hasRetention: false };
              // Проверяем тренировки сегодня
              const trainings = day.trainings || [];
              const hasTraining = trainings.some(t => t?.z?.some(z => z > 0));
              const trainingTypes = trainings
                .filter(t => t?.z?.some(z => z > 0))
                .map(t => t.type || 'cardio');
              days.push({ 
                date: dateStr, 
                weight: todayWeight,
                isToday: true,
                dayNum: dateStr.slice(-2).replace(/^0/, ''),
                cycleDay: todayCycleDay,
                hasWaterRetention: retentionInfo.hasRetention,
                retentionSeverity: retentionInfo.severity,
                retentionAdvice: retentionInfo.advice,
                hasTraining,
                trainingTypes
              });
            }
            continue;
          }
          
          // Для остальных дней — из localStorage
          const data = getDayWeight(dateStr);
          if (data) {
            days.push({ 
              date: dateStr, 
              weight: data.weight,
              isToday: false,
              dayNum: dateStr.slice(-2).replace(/^0/, ''),
              cycleDay: data.cycleDay,
              hasWaterRetention: data.hasWaterRetention,
              retentionSeverity: data.retentionSeverity,
              retentionAdvice: data.retentionAdvice,
              hasTraining: data.hasTraining,
              trainingTypes: data.trainingTypes
            });
          }
        }
        
        // === НОВОЕ: Добавляем будущие дни как прогноз ===
        if (futureDaysCount > 0 && days.length >= 2) {
          // Рассчитываем тренд веса по имеющимся данным
          const weights = days.map(d => d.weight);
          const n = weights.length;
          
          // Линейная регрессия для тренда
          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
          for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += weights[i];
            sumXY += i * weights[i];
            sumX2 += i * i;
          }
          const denominator = n * sumX2 - sumX * sumX;
          const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
          
          // Ограничиваем slope: max ±0.3 кг/день (реалистично)
          const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));
          
          const lastWeight = weights[n - 1];
          // Целевой вес из профиля (приводим к числу!) или текущий вес для стабилизации
          const targetWeight = +prof?.weightGoal > 0 ? +prof.weightGoal : lastWeight;
          
          // Реалистичная скорость изменения веса на основе дефицита
          // 0.4-0.8 кг/неделю = 0.06-0.11 кг/день (безопасный темп)
          const deficitPct = Math.abs(+prof?.deficitPctTarget || 0);
          let weeklyRate; // кг в неделю
          if (deficitPct >= 15) weeklyRate = 0.8;
          else if (deficitPct >= 10) weeklyRate = 0.6;
          else if (deficitPct >= 5) weeklyRate = 0.4;
          else weeklyRate = 0.2; // Поддержание или лёгкий набор
          
          const dailyRate = weeklyRate / 7; // ~0.06-0.11 кг/день
          const direction = targetWeight < lastWeight ? -1 : (targetWeight > lastWeight ? 1 : 0);
          
          let prevWeight = lastWeight;
          for (let i = 1; i <= futureDaysCount; i++) {
            const d = new Date(realToday);
            d.setDate(d.getDate() + i);
            const dateStr = fmtDate(d);
            
            let forecastWeight;
            if (i <= 2) {
              // Первые 2 дня — продолжаем текущий тренд
              forecastWeight = lastWeight + clampedSlope * i;
            } else {
              // Дни 3+ — реалистичное изменение к цели с dailyRate
              // Не превышаем цель
              const idealChange = direction * dailyRate;
              const newWeight = prevWeight + idealChange;
              
              // Ограничиваем: не перескакиваем через цель
              if (direction < 0) {
                forecastWeight = Math.max(targetWeight, newWeight);
              } else if (direction > 0) {
                forecastWeight = Math.min(targetWeight, newWeight);
              } else {
                forecastWeight = prevWeight; // Стабилизация
              }
            }
            prevWeight = forecastWeight;
            
            days.push({ 
              date: dateStr, 
              weight: Math.round(forecastWeight * 10) / 10, // Округление до 0.1 кг
              isToday: false,
              isFuture: true,  // Маркер будущего дня
              dayNum: dateStr.slice(-2).replace(/^0/, ''),
              cycleDay: null,
              hasWaterRetention: false
            });
          }
        }
        
        return days;
      } catch (e) {
        return [];
      }
    }, [date, day.weightMorning, day.cycleDay, chartPeriod, prof?.weightGoal]);
    
    // Анализ исторических паттернов цикла (для блока задержки воды)
    const cycleHistoryAnalysis = React.useMemo(() => {
      // Анализируем только если есть дни с задержкой воды
      if (!day.cycleDay) return null;
      
      try {
        // Получаем lsGet из HEYS.utils или используем fallback
        const lsGet = (key, def) => {
          const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
          const scopedKey = clientId ? 'heys_' + clientId + '_' + key.replace('heys_', '') : key;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (!raw) return def;
            return raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
          } catch(e) { return def; }
        };
        
        const analysis = HEYS.Cycle?.analyzeWaterRetentionHistory?.(6, lsGet);
        const forecast = HEYS.Cycle?.getWeightNormalizationForecast?.(day.cycleDay);
        
        return {
          ...analysis,
          forecast
        };
      } catch (e) {
        return null;
      }
    }, [day.cycleDay]);
    
    // Данные для sparkline калорий за chartPeriod дней
    // НОВАЯ ЛОГИКА: Если данных меньше chartPeriod — показываем данные слева, прогноз справа
    // Это даёт "тренд на будущее" вместо пустых дней в прошлом
    const sparklineData = React.useMemo(() => {
      try {
        const realToday = new Date();
        const realTodayStr = fmtDate(realToday);
        const days = [];
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        
        // Строим Map продуктов из state (ключ = name для поиска по названию)
        const productsMap = new Map();
        (products || []).forEach(p => { 
          if (p && p.name) {
            const name = String(p.name).trim();
            if (name) productsMap.set(name, p);
          }
        });
        
        // Получаем данные activeDays для нескольких месяцев
        const getActiveDaysForMonth = (HEYS.dayUtils && HEYS.dayUtils.getActiveDaysForMonth) || (() => new Map());
        const allActiveDays = new Map();
        
        // Собираем данные за 3 месяца назад (для поиска первого дня с данными)
        for (let monthOffset = 0; monthOffset >= -3; monthOffset--) {
          const checkDate = new Date(realToday);
          checkDate.setMonth(checkDate.getMonth() + monthOffset);
          const monthData = getActiveDaysForMonth(checkDate.getFullYear(), checkDate.getMonth(), prof, products);
          monthData.forEach((v, k) => allActiveDays.set(k, v));
        }
        
        // === НОВОЕ: Находим первый день с данными за последние 60 дней ===
        let firstDataDay = null;
        const maxLookback = 60;
        for (let i = maxLookback; i >= 0; i--) {
          const d = new Date(realToday);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const dayInfo = allActiveDays.get(dateStr);
          if (dayInfo && dayInfo.kcal > 0) {
            firstDataDay = dateStr;
            break;
          }
        }
        
        // Если нет данных — возвращаем пустой массив (покажем empty state)
        if (!firstDataDay) {
          // Возвращаем chartPeriod пустых дней чтобы empty state отобразился
          for (let i = chartPeriod - 1; i >= 0; i--) {
            const d = new Date(realToday);
            d.setDate(d.getDate() - i);
            days.push({ date: fmtDate(d), kcal: 0, target: optimum, isToday: i === 0, hasTraining: false, trainingTypes: [], sleepHours: 0, sleepQuality: 0, dayScore: 0, steps: 0 });
          }
          return days;
        }
        
        // === Считаем сколько дней с данными от firstDataDay до сегодня ===
        const firstDataDate = new Date(firstDataDay);
        const daysSinceFirstData = Math.floor((realToday - firstDataDate) / (24 * 60 * 60 * 1000)) + 1;
        
        // === КЛЮЧЕВАЯ ЛОГИКА: Определяем диапазон дат для графика ===
        // Если данных >= chartPeriod — показываем последние chartPeriod дней (как раньше)
        // Если данных < chartPeriod — показываем от firstDataDay, остальное справа будет прогнозом
        let startDate;
        let daysToShow;
        let futureDaysCount = 0;
        
        if (daysSinceFirstData >= chartPeriod) {
          // Данных достаточно — показываем последние chartPeriod дней
          startDate = new Date(realToday);
          startDate.setDate(startDate.getDate() - (chartPeriod - 1));
          daysToShow = chartPeriod;
        } else {
          // Данных мало — показываем от первого дня с данными до сегодня
          // Остальные слоты справа заполним прогнозом
          startDate = firstDataDate;
          daysToShow = daysSinceFirstData;
          futureDaysCount = chartPeriod - daysSinceFirstData;
        }
        
        // Функция для получения данных одного дня
        const getDayData = (dateStr, isRealToday) => {
          const dayInfo = allActiveDays.get(dateStr);
          
          // Для реального сегодняшнего дня используем eatenKcal и текущий optimum
          if (isRealToday) {
            const todayTrainings = (day.trainings || []).filter(t => t && t.z && t.z.some(z => z > 0));
            const hasTraining = todayTrainings.length > 0;
            const trainingTypes = todayTrainings.map(t => t.type || 'cardio');
            let trainingMinutes = 0;
            todayTrainings.forEach(t => {
              if (t.z && Array.isArray(t.z)) trainingMinutes += t.z.reduce((s, m) => s + (+m || 0), 0);
            });
            let sleepHours = 0;
            if (day.sleepStart && day.sleepEnd) {
              const [sh, sm] = day.sleepStart.split(':').map(Number);
              const [eh, em] = day.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              sleepHours = (endMin - startMin) / 60;
            }
            return { 
              date: dateStr, 
              kcal: Math.round(eatenKcal || 0), 
              target: optimum,
              isToday: true,
              hasTraining,
              trainingTypes,
              trainingMinutes,
              sleepHours,
              moodAvg: +day.moodAvg || 0,
              dayScore: +day.dayScore || 0,
              prot: Math.round(dayTot.prot || 0),
              fat: Math.round(dayTot.fat || 0),
              carbs: Math.round(dayTot.carbs || 0),
              isRefeedDay: day.isRefeedDay || false  // 🔄 Refeed day flag
            };
          }
          
          // Для прошлых дней используем данные из activeDays
          if (dayInfo && dayInfo.kcal > 0) {
            return { 
              date: dateStr, 
              kcal: dayInfo.kcal, 
              target: dayInfo.target,
              isToday: false,
              hasTraining: dayInfo.hasTraining || false,
              trainingTypes: dayInfo.trainingTypes || [],
              trainingMinutes: dayInfo.trainingMinutes || 0,
              sleepHours: dayInfo.sleepHours || 0,
              sleepQuality: dayInfo.sleepQuality || 0,
              dayScore: dayInfo.dayScore || 0,
              steps: dayInfo.steps || 0,
              prot: dayInfo.prot || 0,
              fat: dayInfo.fat || 0,
              carbs: dayInfo.carbs || 0,
              isRefeedDay: dayInfo.isRefeedDay || false  // 🔄 Refeed day flag
            };
          }
          
          // Fallback: читаем напрямую из localStorage
          let dayData = null;
          try {
            const scopedKey = clientId 
              ? 'heys_' + clientId + '_dayv2_' + dateStr 
              : 'heys_dayv2_' + dateStr;
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              if (raw.startsWith('¤Z¤')) {
                let str = raw.substring(3);
                const patterns = { '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"', '¤c¤': '"carbs100"', '¤f¤': '"fat100"' };
                for (const [code, pattern] of Object.entries(patterns)) str = str.split(code).join(pattern);
                dayData = JSON.parse(str);
              } else {
                dayData = JSON.parse(raw);
              }
            }
          } catch(e) {}
          
          if (dayData && dayData.meals) {
            let totalKcal = 0;
            (dayData.meals || []).forEach(meal => {
              (meal.items || []).forEach(item => {
                const grams = +item.grams || 0;
                if (grams <= 0) return;
                const nameKey = (item.name || '').trim();
                const product = nameKey ? productsMap.get(nameKey) : null;
                const src = product || item;
                if (src.kcal100 != null) {
                  totalKcal += ((+src.kcal100 || 0) * grams / 100);
                }
              });
            });
            const dayTrainings = (dayData.trainings || []).filter(t => t && t.z && t.z.some(z => z > 0));
            let fallbackSleepHours = 0;
            if (dayData.sleepStart && dayData.sleepEnd) {
              const [sh, sm] = dayData.sleepStart.split(':').map(Number);
              const [eh, em] = dayData.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              fallbackSleepHours = (endMin - startMin) / 60;
            }
            return { 
              date: dateStr, 
              kcal: Math.round(totalKcal), 
              target: optimum, 
              isToday: false, 
              hasTraining: dayTrainings.length > 0, 
              trainingTypes: dayTrainings.map(t => t.type || 'cardio'),
              sleepHours: fallbackSleepHours,
              sleepQuality: +dayData.sleepQuality || 0,
              dayScore: +dayData.dayScore || 0,
              steps: +dayData.steps || 0,
              isRefeedDay: dayData.isRefeedDay || false  // 🔄 Refeed day flag
            };
          }
          
          return { date: dateStr, kcal: 0, target: optimum, isToday: false, hasTraining: false, trainingTypes: [], sleepHours: 0, sleepQuality: 0, dayScore: 0, steps: 0, isRefeedDay: false };
        };
        
        // Собираем данные за период (от startDate до сегодня)
        for (let i = 0; i < daysToShow; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr;
          days.push(getDayData(dateStr, isRealToday));
        }
        
        // === НОВОЕ: Добавляем будущие дни как прогноз ===
        // Эти дни будут помечены как isFuture и показаны как "?" с прогнозной линией
        for (let i = 1; i <= futureDaysCount; i++) {
          const d = new Date(realToday);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          days.push({ 
            date: dateStr, 
            kcal: 0, 
            target: optimum, 
            isToday: false, 
            isFuture: true,  // Маркер будущего дня
            hasTraining: false, 
            trainingTypes: [], 
            sleepHours: 0, 
            sleepQuality: 0, 
            dayScore: 0, 
            steps: 0 
          });
        }
        
        return days;
      } catch (e) {
        return [];
      }
    }, [date, eatenKcal, chartPeriod, optimum, prof, products, day.trainings, day.sleepStart, day.sleepEnd, day.moodAvg, day.dayScore]);
    
    // Тренд калорий за последние N дней (среднее превышение/дефицит)
    const kcalTrend = React.useMemo(() => {
      if (!sparklineData || sparklineData.length < 3 || !optimum || optimum <= 0) return null;
      
      try {
        // Считаем среднее отклонение от нормы (исключая сегодня и неполные дни <50%)
        const pastDays = sparklineData.filter(d => {
          if (d.isToday) return false;
          if (d.kcal <= 0) return false;
          // Исключаем дни с <50% заполненности — вероятно незаполненные
          const ratio = d.target > 0 ? d.kcal / d.target : 0;
          return ratio >= 0.5;
        });
        if (pastDays.length < 2) return null;
        
        const avgKcal = pastDays.reduce((sum, d) => sum + d.kcal, 0) / pastDays.length;
        const diff = avgKcal - optimum;
        const diffPct = Math.round((diff / optimum) * 100);
        
        let direction = 'same';
        let text = '';
        
        if (diffPct <= -5) {
          direction = 'deficit';
          text = 'Дефицит ' + Math.abs(diffPct) + '%';
        } else if (diffPct >= 5) {
          direction = 'excess';
          text = 'Избыток ' + diffPct + '%';
        } else {
          direction = 'same';
          text = 'В норме';
        }
        
        return { text, diff, direction, avgKcal: Math.round(avgKcal) };
      } catch (e) {
        return null;
      }
    }, [sparklineData, optimum]);
    
    // === CALORIC DEBT RECOVERY — расчёт калорийного долга за последние 3 дня ===
    const caloricDebt = React.useMemo(() => {
      const DEBT_WINDOW = 3;           // Окно расчёта (дней)
      const MAX_DEBT = 1500;           // Максимум учитываемого долга
      const RECOVERY_DAYS = 2;         // На сколько дней распределить
      const MAX_BOOST_PCT = 0.25;      // Максимум +25% к норме
      const TRAINING_MULT = 1.3;       // Недобор в тренировочный день ×1.3
      const REFEED_THRESHOLD = 1000;   // Порог для refeed
      const REFEED_CONSECUTIVE = 5;    // Дней подряд в дефиците >20%
      const REFEED_BOOST_PCT = 0.35;   // +35% в refeed day
      
      if (!sparklineData || sparklineData.length < 2 || !optimum || optimum <= 0) {
        return null;
      }
      
      try {
        const realToday = new Date();
        const realTodayStr = fmtDate(realToday);
        
        // Берём последние DEBT_WINDOW дней (исключая сегодня — его ещё едим)
        const pastDays = sparklineData.filter(d => {
          if (d.isToday) return false;           // Сегодня не считаем
          if (d.isFuture) return false;          // Прогноз не считаем
          if (d.kcal <= 0) return false;         // Пустые дни не считаем
          return true;
        }).slice(-DEBT_WINDOW);
        
        if (pastDays.length === 0) return null;
        
        // Считаем баланс с учётом тренировок
        let totalBalance = 0;
        let consecutiveDeficit = 0;
        let maxConsecutiveDeficit = 0;
        const dayBreakdown = [];
        
        pastDays.forEach((d, idx) => {
          const target = d.target || optimum;
          let delta = d.kcal - target;  // > 0 переел, < 0 недоел
          
          // Тренировка усиливает критичность недобора
          if (delta < 0 && d.hasTraining) {
            delta *= TRAINING_MULT;
          }
          
          totalBalance += delta;
          
          // Считаем последовательные дни в дефиците >20%
          const ratio = d.kcal / target;
          if (ratio < 0.8) {
            consecutiveDeficit++;
            maxConsecutiveDeficit = Math.max(maxConsecutiveDeficit, consecutiveDeficit);
          } else {
            consecutiveDeficit = 0;
          }
          
          // Breakdown для UI
          dayBreakdown.push({
            date: d.date,
            dayNum: d.date.split('-')[2],
            eaten: Math.round(d.kcal),  // <-- было kcal, нужно eaten для popup
            target: Math.round(target),
            delta: Math.round(delta),
            hasTraining: d.hasTraining,
            ratio: ratio
          });
        });
        
        // Долг = отрицательный баланс (если переели, долга нет)
        const rawDebt = Math.max(0, -totalBalance);
        const cappedDebt = Math.min(rawDebt, MAX_DEBT);
        
        // Определяем нужен ли refeed
        const hasHardTrainingToday = (day.trainings || []).some(t => {
          if (!t || !t.z) return false;
          const totalMin = t.z.reduce((s, m) => s + (+m || 0), 0);
          return totalMin >= 45;
        });
        
        const needsRefeed = 
          cappedDebt >= REFEED_THRESHOLD ||
          maxConsecutiveDeficit >= REFEED_CONSECUTIVE ||
          (cappedDebt > 500 && hasHardTrainingToday);
        
        // Рассчитываем boost
        let dailyBoost = 0;
        let refeedBoost = 0;
        
        if (needsRefeed) {
          refeedBoost = Math.round(optimum * REFEED_BOOST_PCT);
          dailyBoost = refeedBoost; // Refeed = сегодня +35%
        } else if (cappedDebt > 0) {
          const rawBoost = cappedDebt / RECOVERY_DAYS;
          const maxBoost = optimum * MAX_BOOST_PCT;
          dailyBoost = Math.round(Math.min(rawBoost, maxBoost));
        }
        
        // Результат
        const result = {
          hasDebt: cappedDebt > 100,           // Показывать если долг > 100 ккал
          debt: Math.round(cappedDebt),
          rawDebt: Math.round(rawDebt),
          dailyBoost,
          adjustedOptimum: optimum + dailyBoost,
          needsRefeed,
          refeedBoost,
          consecutiveDeficitDays: maxConsecutiveDeficit,
          dayBreakdown,
          daysAnalyzed: pastDays.length,
          totalBalance: Math.round(totalBalance)
        };
        
        return result;
      } catch (e) {
        console.warn('[CaloricDebt] Error:', e);
        return null;
      }
    }, [sparklineData, optimum, day.trainings]);
    
    // === displayOptimum — норма с учётом калорийного долга и refeed ===
    // Используется для UI отображения "сколько можно съесть сегодня"
    const displayOptimum = useMemo(() => {
      // 1. Refeed day — +35% к норме (приоритет над caloricDebt)
      if (day.isRefeedDay && HEYS.Refeed) {
        return HEYS.Refeed.getRefeedOptimum(optimum);
      }
      // 2. Caloric debt — добавляем долг к норме
      if (caloricDebt && caloricDebt.dailyBoost > 0) {
        return optimum + caloricDebt.dailyBoost;
      }
      return optimum;
    }, [optimum, caloricDebt, day.isRefeedDay]);
    
    // Осталось калорий с учётом долга
    const displayRemainingKcal = React.useMemo(() => {
      return r0(displayOptimum - eatenKcal);
    }, [displayOptimum, eatenKcal]);
    
    // Данные для heatmap текущей недели (пн-вс)
    const weekHeatmapData = React.useMemo(() => {
      // Парсим текущую дату правильно (без timezone issues)
      const [year, month, dayNum] = date.split('-').map(Number);
      const today = new Date(year, month - 1, dayNum);
      const now = new Date();
      const nowDateStr = fmtDate(now);
      
      // Находим понедельник текущей недели
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      
      // Используем те же данные что и sparklineData (activeDays)
      const getActiveDaysForMonth = (HEYS.dayUtils && HEYS.dayUtils.getActiveDaysForMonth) || (() => new Map());
      const allActiveDays = new Map();
      
      // Собираем данные за текущий и предыдущий месяц (неделя может охватывать 2 месяца)
      for (let monthOffset = 0; monthOffset >= -1; monthOffset--) {
        const checkDate = new Date(today);
        checkDate.setMonth(checkDate.getMonth() + monthOffset);
        const monthData = getActiveDaysForMonth(checkDate.getFullYear(), checkDate.getMonth(), prof, products);
        monthData.forEach((v, k) => allActiveDays.set(k, v));
      }
      
      const days = [];
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      let streak = 0;
      let weekendExcess = 0;
      let weekdayAvg = 0;
      let weekendCount = 0;
      let weekdayCount = 0;
      
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = fmtDate(d);
        const isFuture = dateStr > nowDateStr;
        const isToday = dateStr === date;
        const isWeekend = i >= 5;
        
        // Загружаем данные дня из activeDays
        let ratio = null;
        let kcal = 0;
        let status = 'empty'; // empty | low | green | yellow | red | perfect
        let isRefeedDay = false; // Загрузочный день
        
        // Используем централизованный ratioZones
        const rz = HEYS.ratioZones;
        
        if (!isFuture) {
          const dayInfo = allActiveDays.get(dateStr);
          isRefeedDay = dayInfo?.isRefeedDay || false;
          
          if (dayInfo && dayInfo.kcal > 0) {
            kcal = dayInfo.kcal;
            const target = dayInfo.target || optimum;
            if (kcal > 0 && target > 0) {
              ratio = kcal / target;
              // Используем ratioZones для определения статуса — с учётом refeed
              if (isRefeedDay && rz && rz.getDayZone) {
                // Refeed: используем расширенные зоны (до 1.35 = ok)
                const refeedZone = rz.getDayZone(ratio, { isRefeedDay: true });
                status = refeedZone.id === 'refeed_ok' ? 'green' : 
                         refeedZone.id === 'refeed_under' ? 'yellow' : 'red';
              } else {
                status = rz ? rz.getHeatmapStatus(ratio) : 'empty';
              }
              
              // Считаем streak (последовательные успешные дни — green) — с учётом refeed
              const isSuccess = rz?.isStreakDayWithRefeed 
                ? rz.isStreakDayWithRefeed(ratio, { isRefeedDay })
                : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.1));
              if (isSuccess && (days.length === 0 || days[days.length - 1].status === 'green')) {
                streak++;
              } else if (!isSuccess) {
                streak = 0;
              }
              
              // Статистика для паттерна выходных
              if (isWeekend) {
                weekendExcess += ratio;
                weekendCount++;
              } else {
                weekdayAvg += ratio;
                weekdayCount++;
              }
            }
          }
        }
        
        days.push({
          date: dateStr,
          name: dayNames[i],
          status: isToday && status === 'empty' ? 'in-progress' : status, // Сегодня без данных = "в процессе"
          ratio,
          kcal: Math.round(kcal),
          isToday,
          isFuture,
          isWeekend,
          isRefeedDay, // Загрузочный день
          // Градиентный цвет из ratioZones
          bgColor: ratio && rz ? rz.getGradientColor(ratio, 0.6) : null
        });
      }
      
      const inNorm = days.filter(d => d.status === 'green' || d.status === 'perfect').length;
      const withData = days.filter(d => d.status !== 'empty' && !d.isFuture).length;
      
      // Средний ratio в процентах за неделю (% от нормы)
      const daysWithRatio = days.filter(d => d.ratio !== null && d.ratio > 0);
      const avgRatioPct = daysWithRatio.length > 0
        ? Math.round(daysWithRatio.reduce((sum, d) => sum + (d.ratio * 100), 0) / daysWithRatio.length)
        : 0;
      
      // Паттерн выходных
      let weekendPattern = null;
      if (weekendCount > 0 && weekdayCount > 0) {
        const avgWeekend = weekendExcess / weekendCount;
        const avgWeekday = weekdayAvg / weekdayCount;
        const diff = Math.round((avgWeekend - avgWeekday) * 100);
        if (Math.abs(diff) >= 10) {
          weekendPattern = diff > 0 
            ? 'По выходным +' + diff + '% калорий'
            : 'По выходным ' + diff + '% калорий';
        }
      }
      
      return { days, inNorm, withData, streak, weekendPattern, avgRatioPct };
    }, [date, optimum, pIndex, products, prof]);
    
    // 🎉 Confetti при streak 7+ дней (триггерится один раз при достижении)
    const streakConfettiShownRef = React.useRef(false);
    React.useEffect(() => {
      if (weekHeatmapData.streak >= 7 && !streakConfettiShownRef.current && !showConfetti) {
        streakConfettiShownRef.current = true;
        setShowConfetti(true);
        haptic('success');
        setTimeout(() => setShowConfetti(false), 3000);
      }
      // Сбрасываем ref если streak упал ниже 7
      if (weekHeatmapData.streak < 7) {
        streakConfettiShownRef.current = false;
      }
    }, [weekHeatmapData.streak, showConfetti]);
    
    // Закрытие toast
    const dismissToast = () => {
      // Отмечаем текущий совет как прочитанный (если есть)
      if (displayedAdvice?.id) {
        setDismissedAdvices(prev => {
          const newSet = new Set([...prev, displayedAdvice.id]);
          const saveData = {
            date: new Date().toISOString().slice(0, 10),
            ids: [...newSet]
          };
          try {
            localStorage.setItem('heys_advice_read_today', JSON.stringify(saveData));
          } catch(e) {}
          return newSet;
        });
        
        // +XP за прочтение совета
        if (window.HEYS?.game?.addXP) {
          window.HEYS.game.addXP(0, 'advice_read', null);
        }
      }
      
      setToastVisible(false);
      setToastDismissed(true);
      setToastSwiped(false);
      setToastScheduledConfirm(false);
      setAdviceExpanded(false);
      setAdviceTrigger(null); // 🔧 FIX: Сбрасываем триггер при закрытии!
      setDisplayedAdvice(null);
      setDisplayedAdviceList([]);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };

    // Сохраняем ссылку для обработчиков свайпа вниз
    dismissToastRef.current = dismissToast;

    const prevQualityStreakRef = useRef(0);
    const lowScoreHapticRef = useRef(false);
    
    // === Мини-график калорий по приёмам ===
    const mealsChartData = React.useMemo(() => {
      const meals = day.meals || [];
      if (meals.length === 0) return null;
      
      // Сортируем по времени для графика (поздние первые — вверху списка)
      const parseTimeToMin = (t) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const sortedMeals = [...meals].sort((a, b) => parseTimeToMin(b.time) - parseTimeToMin(a.time));
      
      const data = sortedMeals.map((meal, mi) => {
        const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
        // Используем ручной тип если есть, иначе автоопределение
        const autoTypeInfo = getMealType(mi, meal, sortedMeals, pIndex);
        const manualType = meal.mealType;
        const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType]
          ? { type: manualType, ...U.MEAL_TYPES[manualType] }
          : autoTypeInfo;
        // Вычисляем activityContext для harmMultiplier
        const mealActCtx = HEYS.InsulinWave?.calculateActivityContext?.({
          mealTime: meal.time,
          mealKcal: totals.kcal || 0,
          trainings: day.trainings || [],
          householdMin: day.householdMin || 0,
          steps: day.steps || 0,
          allMeals: sortedMeals
        }) || null;
        const quality = getMealQualityScore(meal, mealTypeInfo.type, optimum, pIndex, mealActCtx);
        return {
          name: mealTypeInfo.name,
          icon: mealTypeInfo.icon,
          type: mealTypeInfo.type,
          kcal: Math.round(totals.kcal || 0),
          time: meal.time || '',
          quality
        };
      });
      
      const totalKcal = data.reduce((sum, m) => sum + m.kcal, 0);
      const maxKcal = Math.max(...data.map(m => m.kcal), 1);
      const qualityStreak = (() => {
        // Ищем максимальную последовательность отличных приёмов (≥80)
        let maxStreak = 0;
        let currentStreak = 0;
        for (const m of data) {
          if (m.quality && m.quality.score >= 80) {
            currentStreak += 1;
            maxStreak = Math.max(maxStreak, currentStreak);
          } else {
            currentStreak = 0;
          }
        }
        return maxStreak;
      })();
      const avgQualityScore = data.length > 0
        ? Math.round(data.reduce((sum, m) => sum + (m.quality?.score || 0), 0) / data.length)
        : 0;
      
      // Лучший приём дня (max score)
      const bestMealIndex = data.reduce((best, m, i) => {
        if (!m.quality) return best;
        if (best === -1) return i;
        return m.quality.score > (data[best]?.quality?.score || 0) ? i : best;
      }, -1);
      
      // Сравнение с вчера
      const getYesterdayKey = () => {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return 'heys_meal_avg_' + y.toISOString().slice(0, 10);
      };
      const yesterdayAvgScore = +(localStorage.getItem(getYesterdayKey()) || 0);
      
      // Сохраняем сегодняшний avg ТОЛЬКО если изменился (чтобы не спамить sync)
      if (avgQualityScore > 0) {
        const todayKey = 'heys_meal_avg_' + new Date().toISOString().slice(0, 10);
        const currentSaved = +(localStorage.getItem(todayKey) || 0);
        if (currentSaved !== avgQualityScore) {
          localStorage.setItem(todayKey, String(avgQualityScore));
        }
      }

      // Debug snapshot
      try {
        window.HEYS.debug = window.HEYS.debug || {};
        window.HEYS.debug.mealsChartData = { meals: data, totalKcal, maxKcal, targetKcal: optimum || 2000, qualityStreak, avgQualityScore };
        window.HEYS.debug.dayProductIndex = pIndex;
      } catch (e) {}
      
      return { meals: data, totalKcal, maxKcal, targetKcal: optimum || 2000, qualityStreak, avgQualityScore, bestMealIndex, yesterdayAvgScore };
    }, [day.meals, pIndex, optimum]);

    // === INSULIN WAVE INDICATOR DATA (через модуль HEYS.InsulinWave) ===
    const insulinWaveData = React.useMemo(() => {
      const prof = getProfile();
      const baseWaveHours = prof?.insulinWaveHours || 3;
      
      // Используем модуль HEYS.InsulinWave если доступен
      if (typeof HEYS !== 'undefined' && HEYS.InsulinWave && HEYS.InsulinWave.calculate) {
        const result = HEYS.InsulinWave.calculate({
          meals: day.meals,
          pIndex,
          getProductFromItem,
          baseWaveHours,
          trainings: day.trainings || [], // 🏃 Передаём тренировки для workout acceleration
          // 🆕 v1.4: Данные дня для stress и sleep факторов
          // 🆕 v3.0.0: Добавлен profile для персональной базы волны
          dayData: {
            sleepHours: day.sleepHours || null,  // часы сна предыдущей ночи
            sleepQuality: day.sleepQuality || null, // качество сна (1-10)
            stressAvg: day.stressAvg || 0,        // средний стресс за день (1-5)
            waterMl: day.waterMl || 0,            // выпито воды (мл)
            householdMin: day.householdMin || 0,  // бытовая активность
            steps: day.steps || 0,                // шаги
            cycleDay: day.cycleDay || null,       // день цикла
            // 🆕 v3.0.0: Профиль для персональной базы
            profile: {
              age: prof?.age || 0,
              weight: prof?.weight || 0,
              height: prof?.height || 0,
              gender: prof?.gender || ''
            },
            // 🆕 v3.6.0: Для расчёта NDTE (эффект вчерашней тренировки)
            date: day.date,
            lsGet
          }
        });
        // 🔬 DEBUG UI (отключено для production)
        // console.log('[UI InsulinWave]', { insulinWaveHours: result?.insulinWaveHours, status: result?.status });
        return result;
      }
      
      // Fallback если модуль не загружен
      const meals = day.meals || [];
      if (meals.length === 0) return null;
      
      const mealsWithTime = meals.filter(m => m.time);
      if (mealsWithTime.length === 0) return null;
      
      const sorted = [...mealsWithTime].sort((a, b) => {
        const timeA = (a.time || '').replace(':', '');
        const timeB = (b.time || '').replace(':', '');
        return timeB.localeCompare(timeA);
      });
      const lastMeal = sorted[0];
      const lastMealTime = lastMeal?.time;
      if (!lastMealTime) return null;
      
      // Простой расчёт без модуля
      let avgGI = 50, totalGrams = 0, weightedGI = 0;
      for (const item of (lastMeal.items || [])) {
        const grams = item.grams || 100;
        const prod = getProductFromItem(item, pIndex);
        const gi = prod?.gi || prod?.gi100 || 50;
        weightedGI += gi * grams;
        totalGrams += grams;
      }
      if (totalGrams > 0) avgGI = Math.round(weightedGI / totalGrams);
      
      let giMultiplier = avgGI <= 35 ? 1.2 : avgGI <= 55 ? 1.0 : avgGI <= 70 ? 0.85 : 0.7;
      const giCategory = avgGI <= 35 ? 'low' : avgGI <= 55 ? 'medium' : avgGI <= 70 ? 'high' : 'very-high';
      
      const waveMinutes = baseWaveHours * giMultiplier * 60;
      const [mealH, mealM] = lastMealTime.split(':').map(Number);
      if (isNaN(mealH)) return null;
      
      const mealMinutes = mealH * 60 + (mealM || 0);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      let diffMinutes = Math.max(0, nowMinutes - mealMinutes);
      
      const remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
      const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);
      
      const endMinutes = mealMinutes + Math.round(waveMinutes);
      const endTime = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');
      
      const isNightTime = now.getHours() >= 22 || now.getHours() < 6;
      let status, emoji, text, color, subtext;
      
      if (remainingMinutes <= 0) {
        status = 'lipolysis'; emoji = '🔥'; text = 'Липолиз!'; color = '#22c55e';
        subtext = isNightTime ? '🌙 Идеально! Ночной липолиз до утра' : '💪 Жиросжигание идёт! Продержись подольше';
      } else if (remainingMinutes <= 15) {
        status = 'almost'; emoji = '⏳'; text = Math.ceil(remainingMinutes) + ' мин'; color = '#f97316';
        subtext = '⏳ Скоро начнётся липолиз!';
      } else if (remainingMinutes <= 30) {
        status = 'soon'; emoji = '🌊'; text = Math.ceil(remainingMinutes) + ' мин'; color = '#eab308';
        subtext = '🍵 Вода не прерывает липолиз';
      } else {
        const h = Math.floor(remainingMinutes / 60), m = Math.round(remainingMinutes % 60);
        status = 'active'; emoji = '📈'; text = h > 0 ? h + 'ч ' + m + 'м' : m + ' мин'; color = '#3b82f6';
        subtext = '📈 Инсулин высокий, жир запасается';
      }
      
      return { status, emoji, text, color, subtext, progress: progressPct, remaining: remainingMinutes,
        lastMealTime, lastMealTimeDisplay: lastMealTime, endTime, insulinWaveHours: baseWaveHours * giMultiplier, baseWaveHours, isNightTime,
        avgGI, giCategory: { color: giMultiplier === 1.2 ? '#22c55e' : giMultiplier === 1.0 ? '#eab308' : giMultiplier === 0.85 ? '#f97316' : '#ef4444', text: giCategory }, giMultiplier,
        waveHistory: [], overlaps: [], hasOverlaps: false, gapQuality: 'unknown'
      };
    }, [day.meals, pIndex, currentMinute]); // currentMinute для авто-обновления

    // Делаем данные волны доступными глобально для карточек приёмов
    React.useEffect(() => {
      try {
        const h = window.HEYS = window.HEYS || {};
        h.insulinWaveData = insulinWaveData || null;
      } catch (e) {}
    }, [insulinWaveData]);

    // === Haptic при начале липолиза ===
    const prevInsulinStatusRef = React.useRef(null);
    const lipolysisRecordTriggeredRef = React.useRef(false);
    
    React.useEffect(() => {
      if (insulinWaveData?.status === 'lipolysis' && prevInsulinStatusRef.current !== 'lipolysis') {
        try { HEYS.dayUtils?.haptic?.('success'); } catch(e) {}
      }
      prevInsulinStatusRef.current = insulinWaveData?.status || null;
    }, [insulinWaveData?.status]);
    
    // 🏆 Confetti при новом рекорде липолиза
    React.useEffect(() => {
      if (insulinWaveData?.isNewRecord && !lipolysisRecordTriggeredRef.current) {
        lipolysisRecordTriggeredRef.current = true;
        
        // Обновляем рекорд в localStorage
        if (typeof HEYS !== 'undefined' && HEYS.InsulinWave?.updateLipolysisRecord) {
          const wasUpdated = HEYS.InsulinWave.updateLipolysisRecord(insulinWaveData.lipolysisMinutes);
          if (wasUpdated) {
            // Confetti!
            setShowConfetti(true);
            try { HEYS.dayUtils?.haptic?.('success'); } catch(e) {}
            setTimeout(() => setShowConfetti(false), 3000);
          }
        }
      }
      
      // Сбрасываем флаг когда липолиз заканчивается (новый приём)
      if (insulinWaveData?.status !== 'lipolysis') {
        lipolysisRecordTriggeredRef.current = false;
      }
    }, [insulinWaveData?.isNewRecord, insulinWaveData?.lipolysisMinutes, insulinWaveData?.status]);

    // Haptic feedback for streak / low scores
    React.useEffect(() => {
      const currentStreak = mealsChartData?.qualityStreak || 0;
      const prev = prevQualityStreakRef.current;
      if (currentStreak >= 3 && prev < 3) {
        try { HEYS.dayUtils?.haptic?.('success'); } catch(e) {}
      }
      prevQualityStreakRef.current = currentStreak;
    }, [mealsChartData?.qualityStreak]);

    React.useEffect(() => {
      const meals = mealsChartData?.meals || [];
      const hasLow = meals.some(m => m.quality && m.quality.score < 50);
      if (hasLow && !lowScoreHapticRef.current) {
        try { HEYS.dayUtils?.haptic?.('warning'); } catch(e) {}
        lowScoreHapticRef.current = true;
      }
      if (!hasLow) {
        lowScoreHapticRef.current = false;
      }
    }, [mealsChartData]);

    // === Ачивка "Первый идеальный приём" ===
    React.useEffect(() => {
      const meals = mealsChartData?.meals || [];
      const hasPerfect = meals.some(m => m.quality && m.quality.score >= 90);
      
      if (hasPerfect && !firstPerfectShownRef.current) {
        try {
          const alreadyAchieved = localStorage.getItem('heys_first_perfect_meal') === '1';
          if (!alreadyAchieved) {
            // Первый раз! Показываем ачивку
            localStorage.setItem('heys_first_perfect_meal', '1');
            setShowFirstPerfectAchievement(true);
            setShowConfetti(true);
            try { HEYS.dayUtils?.haptic?.('success'); } catch(e) {}
            // Скрываем через 5 секунд
            setTimeout(() => {
              setShowFirstPerfectAchievement(false);
              setShowConfetti(false);
            }, 5000);
            firstPerfectShownRef.current = true;
          }
        } catch(e) {}
      }
    }, [mealsChartData]);

    // === Анимация нового приёма ===
    React.useEffect(() => {
      const mealsCount = day.meals?.length || 0;
      const prevCount = prevMealsCountRef.current;
      
      if (mealsCount > prevCount && prevCount > 0) {
        // Новый приём добавлен — анимируем его (последний = index 0 после reverse)
        setTimeout(() => {
          setNewMealAnimatingIndex(mealsCount - 1);
          // Убираем анимацию через 600ms
          setTimeout(() => setNewMealAnimatingIndex(-1), 600);
        }, 300); // Задержка после закрытия модалки
      }
      
      prevMealsCountRef.current = mealsCount;
    }, [day.meals?.length]);

    // === Pull-to-refresh логика (Enhanced) ===
    const PULL_THRESHOLD = 80;
    
    // Haptic feedback helper
    const triggerHaptic = (intensity = 10) => {
      const now = Date.now();
      if (now - lastHapticRef.current > 50 && navigator.vibrate) {
        navigator.vibrate(intensity);
        lastHapticRef.current = now;
      }
    };
    
    const handleRefresh = async () => {
      setIsRefreshing(true);
      setRefreshStatus('syncing');
      triggerHaptic(15);
      
      const cloud = window.HEYS && window.HEYS.cloud;
      const U = window.HEYS && window.HEYS.utils;
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
      
      // Timeout 15 секунд — если sync зависнет, индикатор не будет крутиться вечно
      const REFRESH_TIMEOUT = 15000;
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Refresh timeout')), REFRESH_TIMEOUT);
      });
      
      try {
        // 1. Тихая проверка версии (без UI)
        if (window.HEYS?.checkVersionSilent) {
          window.HEYS.checkVersionSilent();
        }

        // 1a. Тихая проверка версии SW (без модалки — SW сам обновится в фоне)
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then(reg => reg.update?.()).catch(() => {});
        }
        
        // 2. Реальная синхронизация с Supabase (с force=true для bypass throttling)
        const syncPromise = (async () => {
          if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
            console.log('[PullRefresh] 🚀 Starting force sync for client:', clientId.substring(0, 8));
            
            await cloud.bootstrapClientSync(clientId, { force: true });
            
            // 🔄 ГАРАНТИЯ: Явно инвалидируем кэш перед чтением (на случай если sync не вызвал)
            if (window.HEYS?.store?.flushMemory) {
              window.HEYS.store.flushMemory();
              console.log('[PullRefresh] 🧹 Memory cache flushed before reading');
            }
            
            // 🔄 ЯВНАЯ перезагрузка данных после sync (не полагаемся только на событие)
            const dayKey = 'heys_dayv2_' + date;
            const freshDay = lsGet(dayKey, null);
            
            if (freshDay && freshDay.date) {
              console.log('[PullRefresh] 🔄 Reloading day from localStorage | meals:', freshDay.meals?.length, '| updatedAt:', freshDay.updatedAt ? new Date(freshDay.updatedAt).toISOString() : 'none');
              const migratedTrainings = normalizeTrainings(freshDay.trainings);
              const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
              const migratedDay = { ...freshDay, trainings: cleanedTrainings };
              setDay(ensureDay(migratedDay, getProfile()));
            } else {
              console.log('[PullRefresh] ⚠️ No day data found for', date);
            }
          } else {
            console.log('[PullRefresh] ⚠️ Sync not available | clientId:', clientId, '| cloud:', !!cloud);
          }
        })();
        
        await Promise.race([syncPromise, timeoutPromise]);
        clearTimeout(timeoutId);
        
        // Минимальная задержка для плавного UX
        await new Promise(r => setTimeout(r, 300));
        
        setRefreshStatus('success');
        triggerHaptic(20);
        
        // Показываем успех 600ms, затем сброс
        await new Promise(r => setTimeout(r, 600));
        
      } catch (err) {
        clearTimeout(timeoutId);
        setRefreshStatus('error');
        console.warn('[PullRefresh] Sync failed:', err.message);
        // Короткий показ ошибки
        await new Promise(r => setTimeout(r, 800));
      } finally {
        setIsRefreshing(false);
        setRefreshStatus('idle');
        setPullProgress(0);
      }
    };
    
    React.useEffect(() => {
      // Используем window, так как scroll на уровне страницы, не на контейнере
      const onTouchStart = (e) => {
        // Начинаем pull только если скролл вверху страницы
        if (window.scrollY <= 0) {
          pullStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          setRefreshStatus('pulling');
        }
      };
      
      const onTouchMove = (e) => {
        if (!isPulling.current || isRefreshing) return;
        
        const y = e.touches[0].clientY;
        const diff = y - pullStartY.current;
        
        if (diff > 0 && window.scrollY <= 0) {
          // Resistance effect с elastic curve
          const resistance = 0.45;
          const progress = Math.min(diff * resistance, PULL_THRESHOLD * 1.2);
          setPullProgress(progress);
          
          // Haptic при достижении threshold
          if (progress >= PULL_THRESHOLD && refreshStatus !== 'ready') {
            setRefreshStatus('ready');
            triggerHaptic(12);
          } else if (progress < PULL_THRESHOLD && refreshStatus === 'ready') {
            setRefreshStatus('pulling');
          }
          
          if (diff > 10 && e.cancelable) {
            e.preventDefault(); // Предотвращаем обычный скролл
          }
        }
      };
      
      const onTouchEnd = () => {
        if (!isPulling.current) return;
        
        if (pullProgress >= PULL_THRESHOLD) {
          handleRefresh();
        } else {
          // Elastic bounce back
          setPullProgress(0);
          setRefreshStatus('idle');
        }
        isPulling.current = false;
      };
      
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
      
      return () => {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
    }, [pullProgress, isRefreshing, refreshStatus]);
    
    // === Анимация прогресса калорий при загрузке и при переключении на вкладку ===
    const animationRef = React.useRef(null);
    React.useEffect(() => {
      // DEBUG (отключено): console.log('[ProgressBar] Effect triggered');
      
      // Отменяем предыдущую анимацию
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      // Шаг 1: Сбрасываем к 0 мгновенно
      setIsAnimating(true);
      setAnimatedProgress(0);
      setAnimatedKcal(0);
      setAnimatedRatioPct(0);
      setAnimatedMarkerPos(0);
      
      // При переборе: зелёная часть = доля нормы от съеденного (optimum/eaten)
      // При норме: зелёная часть = доля съеденного от нормы (eaten/optimum)
      const isOver = eatenKcal > optimum;
      const target = isOver 
        ? (optimum / eatenKcal) * 100  // При переборе: показываем долю нормы
        : (eatenKcal / optimum) * 100; // При норме: показываем прогресс к цели
      
      // Шаг 2: Ждём чтобы React применил width: 0, затем запускаем анимацию
      const timeoutId = setTimeout(() => {
        setIsAnimating(false); // Включаем transition обратно
        
        const duration = 800;
        const startTime = performance.now();
        const targetKcal = eatenKcal; // Целевое значение калорий
        const targetRatioPct = Math.round((eatenKcal / (optimum || 1)) * 100); // Целевой % для бэджа
        // Бейдж: при переборе — едет до 100%, при норме — до конца заполненной линии
        const targetMarkerPos = isOver ? 100 : Math.min(target, 100);
        
        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = target * eased;
          const currentKcal = Math.round(targetKcal * eased);
          const currentRatioPct = Math.round(targetRatioPct * eased);
          const currentMarkerPos = targetMarkerPos * eased; // Позиция бейджа синхронизирована с линией
          setAnimatedProgress(current);
          setAnimatedKcal(currentKcal);
          setAnimatedRatioPct(currentRatioPct);
          setAnimatedMarkerPos(currentMarkerPos);
          
          if (progress < 1) {
            animationRef.current = requestAnimationFrame(animate);
          } else {
            // DEBUG (отключено): console.log('[ProgressBar] Animation complete');
            setAnimatedKcal(targetKcal); // Финальное точное значение
            setAnimatedRatioPct(targetRatioPct);
            setAnimatedMarkerPos(targetMarkerPos); // Бейдж остаётся на конце линии
          }
        };
        
        animationRef.current = requestAnimationFrame(animate);
      }, 50); // 50ms задержка для гарантированного применения width: 0
      
      return () => {
        clearTimeout(timeoutId);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, [eatenKcal, optimum, mobileSubTab]); // mobileSubTab — для анимации при переключении вкладок
    
    // 🔔 Shake после завершения анимации sparkline (последовательно: Съедено → Перебор)
    const shakeTimerRef = React.useRef(null);
    React.useEffect(() => {
      // Очищаем предыдущий таймер
      if (shakeTimerRef.current) {
        clearTimeout(shakeTimerRef.current);
      }
      
      const ratio = eatenKcal / (optimum || 1);
      const isSuccess = ratio >= 0.75 && ratio <= 1.1;
      const isExcess = ratio > 1.1;
      
      if (isExcess) {
        // ❌ Превышение — shake последовательно
        shakeTimerRef.current = setTimeout(() => {
          setShakeEaten(true);
          setTimeout(() => setShakeEaten(false), 500);
          
          setTimeout(() => {
            setShakeOver(true);
            setTimeout(() => setShakeOver(false), 500);
          }, 300);
        }, 5000);
      } else if (isSuccess) {
        // ✅ Успех — пульсация при загрузке
        shakeTimerRef.current = setTimeout(() => {
          console.log('✨ SUCCESS: Пульсация карточки');
          setPulseSuccess(true);
          // Пульсация длится 1.5с (3 цикла по 0.5с)
          setTimeout(() => setPulseSuccess(false), 1500);
        }, 5000);
      }
      
      return () => {
        if (shakeTimerRef.current) {
          clearTimeout(shakeTimerRef.current);
        }
      };
    }, [date, eatenKcal, optimum]);
    
    // === Confetti при достижении 100% цели ===
    React.useEffect(() => {
      const progress = (eatenKcal / optimum) * 100;
      const prevProgress = (prevKcalRef.current / optimum) * 100;
      
      // Показываем confetti когда впервые достигаем 95-105% (зона успеха)
      if (progress >= 95 && progress <= 105 && prevProgress < 95 && !confettiShownRef.current) {
        confettiShownRef.current = true;
        setShowConfetti(true);
        haptic('success');
        playSuccessSound(); // 🔔 Звук успеха!
        
        // Скрываем через 3 секунды
        setTimeout(() => setShowConfetti(false), 3000);
      }
      
      // Сбрасываем флаг если уходим ниже 90%
      if (progress < 90) {
        confettiShownRef.current = false;
      }
      
      prevKcalRef.current = eatenKcal;
    }, [eatenKcal, optimum]);
    
    // SVG Sparkline компонент
    const renderSparkline = (data, goal) => {
      // Skeleton loader пока данные загружаются
      if (!data) {
        return React.createElement('div', { className: 'sparkline-skeleton' },
          React.createElement('div', { className: 'sparkline-skeleton-line' }),
          React.createElement('div', { className: 'sparkline-skeleton-dots' },
            Array.from({length: 7}).map((_, i) => 
              React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
            )
          )
        );
      }
      
      if (data.length === 0) return null;
      
      // === Empty state: проверяем есть ли реальные данные (хотя бы 2 дня с kcal > 0) ===
      const daysWithData = data.filter(d => d.kcal > 0).length;
      if (daysWithData < 2) {
        const daysNeeded = 2 - daysWithData;
        return React.createElement('div', { className: 'sparkline-empty-state' },
          React.createElement('div', { className: 'sparkline-empty-icon' }, '📊'),
          React.createElement('div', { className: 'sparkline-empty-text' },
            daysWithData === 0 
              ? 'Начните вести дневник питания'
              : 'Добавьте еду ещё за ' + daysNeeded + ' день'
          ),
          React.createElement('div', { className: 'sparkline-empty-hint' },
            'График появится после 2+ дней с данными'
          ),
          React.createElement('div', { className: 'sparkline-empty-progress' },
            React.createElement('div', { 
              className: 'sparkline-empty-progress-bar',
              style: { width: (daysWithData / 2 * 100) + '%' }
            }),
            React.createElement('span', { className: 'sparkline-empty-progress-text' },
              daysWithData + ' / 2 дней'
            )
          ),
          React.createElement('button', { 
            className: 'sparkline-empty-btn',
            onClick: () => {
              // Открываем модалку добавления приёма
              if (window.HEYS && window.HEYS.Day && window.HEYS.Day.addMeal) {
                window.HEYS.Day.addMeal();
              }
              haptic('light');
            }
          }, '+ Добавить еду')
        );
      }
      
      // === Helpers для выходных и праздников ===
      const RU_HOLIDAYS = [
        '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
        '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'
      ];
      const isWeekend = (dateStr) => {
        if (!dateStr) return false;
        const day = new Date(dateStr).getDay();
        return day === 0 || day === 6;
      };
      const isHoliday = (dateStr) => dateStr ? RU_HOLIDAYS.includes(dateStr.slice(5)) : false;
      const addDays = (dateStr, days) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      };
      
      // === Проверка: сегодня съедено < 50% нормы? ===
      // Если да, показываем сегодня как прогноз (пунктиром), а не как реальные данные
      const todayData = data.find(d => d.isToday);
      const todayRatio = todayData && todayData.target > 0 ? todayData.kcal / todayData.target : 0;
      const isTodayIncomplete = todayData && todayRatio < 0.5;
      
      // Обрабатываем данные:
      // 1. Помечаем пустые/неполные дни как "unknown" (будут показаны как "?")
      // 2. Интерполируем их kcal между соседними известными днями
      // 3. isFuture дни исключаются из основного графика — они станут прогнозом
      const processedData = data.map((d, idx) => {
        // Будущие дни (isFuture) — исключаем из основного графика, покажем как прогноз
        if (d.isFuture) {
          return { ...d, isUnknown: false, excludeFromChart: true, isFutureDay: true };
        }
        
        // Сегодня неполный — отдельная логика (показываем как прогноз)
        if (d.isToday && isTodayIncomplete) {
          return { ...d, isUnknown: false, excludeFromChart: true };
        }
        
        // Пустой день или <50% нормы = неизвестный
        const ratio = d.target > 0 ? d.kcal / d.target : 0;
        const isUnknown = d.kcal === 0 || (!d.isToday && ratio < 0.5);
        
        return { ...d, isUnknown, excludeFromChart: false };
      });
      
      // Извлекаем будущие дни для прогноза
      const futureDays = processedData.filter(d => d.isFutureDay);
      
      // Интерполируем kcal для unknown дней
      const chartData = processedData.filter(d => !d.excludeFromChart).map((d, idx, arr) => {
        if (!d.isUnknown) return d;
        
        // Ищем ближайший известный день слева
        let leftKcal = null, leftIdx = idx - 1;
        while (leftIdx >= 0) {
          if (!arr[leftIdx].isUnknown) { leftKcal = arr[leftIdx].kcal; break; }
          leftIdx--;
        }
        
        // Ищем ближайший известный день справа
        let rightKcal = null, rightIdx = idx + 1;
        while (rightIdx < arr.length) {
          if (!arr[rightIdx].isUnknown) { rightKcal = arr[rightIdx].kcal; break; }
          rightIdx++;
        }
        
        // Интерполируем
        let interpolatedKcal;
        if (leftKcal !== null && rightKcal !== null) {
          // Линейная интерполяция между соседями
          const leftDist = idx - leftIdx;
          const rightDist = rightIdx - idx;
          const totalDist = leftDist + rightDist;
          interpolatedKcal = Math.round((leftKcal * rightDist + rightKcal * leftDist) / totalDist);
        } else if (leftKcal !== null) {
          interpolatedKcal = leftKcal; // Только слева — берём его
        } else if (rightKcal !== null) {
          interpolatedKcal = rightKcal; // Только справа — берём его
        } else {
          interpolatedKcal = d.target || goal; // Нет соседей — берём норму
        }
        
        return { ...d, kcal: interpolatedKcal, originalKcal: d.kcal };
      });
      
      // Прогноз на +1 день по тренду (завтра), или сегодня+завтра если сегодня неполный
      const forecastDays = 1;
      const hasEnoughData = chartData.length >= 3;
      // ВАЖНО: Если сегодня неполный — всегда показываем прогноз, даже если данных мало
      // Это гарантирует что сегодняшний день всегда виден на графике
      const shouldShowForecast = hasEnoughData || isTodayIncomplete;
      let forecastPoints = [];
      const lastChartDate = chartData[chartData.length - 1]?.date || '';
      
      if (shouldShowForecast && lastChartDate) {
        // Используем линейную регрессию по всем данным для более стабильного тренда
        // Это предотвращает "взлёты" из-за одного-двух дней переедания
        const n = chartData.length;
        const kcalValues = chartData.map(d => d.kcal);
        
        // Последнее значение и норма
        const lastKcal = n > 0 ? kcalValues[n - 1] : goal;
        const lastTarget = n > 0 ? (chartData[n - 1].target || goal) : goal;
        
        // Для прогноза: если мало данных — используем норму как прогноз
        // Иначе используем регрессию
        let blendedNext = goal;
        let clampedSlope = 0;
        
        if (n >= 3) {
          // Вычисляем линейную регрессию: y = a + b*x
          // b = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
          for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += kcalValues[i];
            sumXY += i * kcalValues[i];
            sumX2 += i * i;
          }
        
          const denominator = n * sumX2 - sumX * sumX;
          // slope = изменение ккал за 1 день по тренду
          const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
          const intercept = (sumY - slope * sumX) / n;
        
          // Ограничиваем slope чтобы не было безумных прогнозов
          // Максимум ±150 ккал/день изменения тренда
          clampedSlope = Math.max(-150, Math.min(150, slope));
        
          // Для прогноза: используем регрессию, но ближе к последнему значению
          // Смешиваем: 60% регрессия + 40% продолжение от последнего значения
          const regressionNext = intercept + clampedSlope * n;
          const simpleNext = lastKcal + clampedSlope;
          blendedNext = regressionNext * 0.6 + simpleNext * 0.4;
        } else if (n > 0) {
          // Мало данных — используем последнее значение или норму
          blendedNext = lastKcal > 0 ? lastKcal : goal;
        }
        
        // Норма для прогнозных дней = текущий optimum (goal)
        // Норма зависит от BMR + активность, а не от тренда прошлых дней
        const forecastTarget = goal;
        
        // === Regression to Mean для прогноза калорий ===
        // Дни 1-2: тренд по данным (slope) — краткосрочный паттерн
        // Дни 3+: плавное возвращение к норме (гомеостаз)
        // Формула: kcal = prevKcal + (target - prevKcal) * decayRate
        const calculateForecastKcal = (dayIndex, prevKcal) => {
          if (dayIndex <= 2) {
            // Первые 2 дня — продолжаем тренд
            return dayIndex === 1 
              ? Math.round(blendedNext)
              : Math.round(blendedNext + clampedSlope * (dayIndex - 1));
          } else {
            // Дни 3+ — regression to mean (возврат к норме на 30% за день)
            const decayRate = 0.3;
            return Math.round(prevKcal + (goal - prevKcal) * decayRate);
          }
        };
        
        // === ИСПРАВЛЕНИЕ: Если сегодня неполный — сначала добавляем его как прогноз ===
        let prevKcal = lastKcal;
        let dayIndexOffset = 0;
        
        if (isTodayIncomplete && todayData) {
          // Добавляем сегодня как первый прогнозный день
          const todayDateStr = todayData.date;
          const todayDayNum = todayDateStr ? new Date(todayDateStr).getDate() : '';
          const todayForecastKcal = calculateForecastKcal(1, prevKcal);
          prevKcal = todayForecastKcal;
          dayIndexOffset = 1; // Сдвигаем индексы для следующих дней
          
          forecastPoints.push({
            kcal: Math.max(0, todayForecastKcal),
            target: forecastTarget,
            isForecast: true,
            isTodayForecast: true, // Маркер что это прогноз на сегодня
            isFutureDay: false,
            date: todayDateStr,
            dayNum: todayDayNum,
            isWeekend: isWeekend(todayDateStr) || isHoliday(todayDateStr)
          });
        }
        
        // === Добавляем будущие дни (futureDays) или стандартный прогноз ===
        if (futureDays.length > 0) {
          // Используем futureDays как основу для прогноза
          futureDays.forEach((fd, i) => {
            const dayIndex = i + 1 + dayIndexOffset; // Учитываем сдвиг если добавили сегодня
            const forecastDayNum = fd.date ? new Date(fd.date).getDate() : '';
            const forecastKcal = calculateForecastKcal(dayIndex, prevKcal);
            prevKcal = forecastKcal; // для следующей итерации
            
            forecastPoints.push({
              kcal: Math.max(0, forecastKcal),
              target: forecastTarget,  // Стабильная норма = текущий optimum
              isForecast: true,
              isFutureDay: true,  // Маркер что это будущий день (не динамический прогноз)
              isTodayForecast: false,
              date: fd.date,
              dayNum: forecastDayNum,
              isWeekend: isWeekend(fd.date) || isHoliday(fd.date)
            });
          });
        } else if (!isTodayIncomplete) {
          // Стандартная логика: прогноз на 1 день вперёд (завтра)
          // Только если сегодня НЕ неполный (иначе уже добавили выше)
          const forecastDate = addDays(lastChartDate, 1);
          const forecastDayNum = forecastDate ? new Date(forecastDate).getDate() : '';
          const forecastKcal = calculateForecastKcal(1, prevKcal);
            
          forecastPoints.push({
            kcal: Math.max(0, forecastKcal),
            target: forecastTarget,
            isForecast: true,
            isTodayForecast: false,
            date: forecastDate,
            dayNum: forecastDayNum,
            isWeekend: isWeekend(forecastDate) || isHoliday(forecastDate)
          });
        }
      }
      
      const totalPoints = chartData.length + forecastPoints.length;
      const width = 360;
      const height = 130; // увеличено для дельты под датами
      const paddingTop = 16; // для меток над точками
      const paddingBottom = 26; // место для дат + дельты
      const paddingX = 8; // минимальные отступы — точки почти у края
      const chartHeight = height - paddingTop - paddingBottom;
      
      // Адаптивная шкала Y: от минимума до максимума с отступами
      // Это делает разницу между точками более заметной
      const allKcalValues = [...chartData, ...forecastPoints].map(d => d.kcal).filter(v => v > 0);
      const allTargetValues = [...chartData, ...forecastPoints].map(d => d.target || goal);
      const allValues = [...allKcalValues, ...allTargetValues];
      
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);
      const range = dataMax - dataMin;
      
      // Отступы: 15% снизу и сверху от диапазона данных
      const padding = Math.max(range * 0.15, 100); // минимум 100 ккал отступ
      const scaleMin = Math.max(0, dataMin - padding);
      const scaleMax = dataMax + padding;
      const scaleRange = scaleMax - scaleMin;
      
      // Основные точки данных (без неполного сегодня)
      const points = chartData.map((d, i) => {
        const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
        // Нормализуем к scaleMin-scaleMax
        const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
        const y = paddingTop + chartHeight - yNorm * chartHeight;
        const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
        const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
        // Извлекаем день из даты (последние 2 символа)
        const dayNum = d.date ? d.date.slice(-2).replace(/^0/, '') : '';
        const ratio = (d.target || goal) > 0 ? d.kcal / (d.target || goal) : 0;
        // Хороший день: используем централизованный ratioZones с учётом refeed
        const rz = HEYS.ratioZones;
        // isPerfect учитывает refeed (расширенный диапазон 0.70-1.35)
        const isPerfect = d.isUnknown ? false : (rz?.isStreakDayWithRefeed 
          ? rz.isStreakDayWithRefeed(ratio, d)
          : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10)));
        // Выходные/праздники
        const isWeekendDay = isWeekend(d.date) || isHoliday(d.date);
        // День недели (0=Вс, 1=Пн, ...)
        const dayOfWeek = d.date ? new Date(d.date).getDay() : 0;
        return { 
          x, y, kcal: d.kcal, target: d.target || goal, targetY, ratio,
          isToday: d.isToday, dayNum, date: d.date, isPerfect,
          isUnknown: d.isUnknown || false, // флаг неизвестного дня
          hasTraining: d.hasTraining, trainingTypes: d.trainingTypes || [],
          trainingMinutes: d.trainingMinutes || 0,
          isWeekend: isWeekendDay, sleepQuality: d.sleepQuality || 0,
          sleepHours: d.sleepHours || 0, dayScore: d.dayScore || 0,
          steps: d.steps || 0,
          prot: d.prot || 0, fat: d.fat || 0, carbs: d.carbs || 0,
          dayOfWeek,
          isRefeedDay: d.isRefeedDay || false  // 🔄 Refeed day flag для UI
        };
      });
      
      // Точки прогноза (включая сегодня если неполный)
      const forecastPts = forecastPoints.map((d, i) => {
        const idx = chartData.length + i;
        const x = paddingX + (idx / (totalPoints - 1)) * (width - paddingX * 2);
        const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
        const y = paddingTop + chartHeight - yNorm * chartHeight;
        const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
        const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
        return { 
          x, y, kcal: d.kcal, target: d.target, targetY, isForecast: true, 
          isTodayForecast: d.isTodayForecast || false,
          isFutureDay: d.isFutureDay || false,  // Маркер будущего дня для UI
          dayNum: d.dayNum || '', date: d.date, isWeekend: d.isWeekend 
        };
      });
      
      // Min/Max для меток
      const kcalValues = points.filter(p => p.kcal > 0).map(p => p.kcal);
      const minKcal = Math.min(...kcalValues);
      const maxKcalVal = Math.max(...kcalValues);
      const minPoint = points.find(p => p.kcal === minKcal);
      const maxPoint = points.find(p => p.kcal === maxKcalVal);
      
      // Плавная кривая через cubic bezier (catmull-rom → bezier)
      // С ограничением overshooting для монотонности
      const smoothPath = (pts, yKey = 'y') => {
        if (pts.length < 2) return '';
        if (pts.length === 2) return `M${pts[0].x},${pts[0][yKey]} L${pts[1].x},${pts[1][yKey]}`;
        
        let d = `M${pts[0].x},${pts[0][yKey]}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          // Catmull-Rom → Cubic Bezier control points
          const tension = 0.25; // Уменьшено для меньшего overshooting
          
          // Базовые контрольные точки
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;
          
          // === Monotonic constraint: ограничиваем overshooting ===
          // Контрольные точки не должны выходить за пределы Y между p1 и p2
          const minY = Math.min(p1[yKey], p2[yKey]);
          const maxY = Math.max(p1[yKey], p2[yKey]);
          const margin = (maxY - minY) * 0.15; // 15% допуск
          
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
        }
        return d;
      };
      
      // Расчёт длины cubic bezier сегмента (приближение через разбиение на отрезки)
      const bezierLength = (p1, cp1, cp2, p2, steps = 10) => {
        let length = 0;
        let prevX = p1.x, prevY = p1.y;
        for (let t = 1; t <= steps; t++) {
          const s = t / steps;
          const u = 1 - s;
          // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
          const x = u*u*u*p1.x + 3*u*u*s*cp1.x + 3*u*s*s*cp2.x + s*s*s*p2.x;
          const y = u*u*u*p1.y + 3*u*u*s*cp1.y + 3*u*s*s*cp2.y + s*s*s*p2.y;
          length += Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
          prevX = x;
          prevY = y;
        }
        return length;
      };
      
      // Кумулятивные длины пути до каждой точки (для синхронизации анимации)
      const calcCumulativeLengths = (pts, yKey = 'y') => {
        const lengths = [0]; // первая точка = 0
        if (pts.length < 2) return lengths;
        
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1[yKey] + (p2[yKey] - p0[yKey]) * tension };
          const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2[yKey] - (p3[yKey] - p1[yKey]) * tension };
          
          const segmentLen = bezierLength(
            { x: p1.x, y: p1[yKey] }, cp1, cp2, { x: p2.x, y: p2[yKey] }
          );
          lengths.push(lengths[lengths.length - 1] + segmentLen);
        }
        return lengths;
      };
      
      const cumulativeLengths = calcCumulativeLengths(points, 'y');
      const totalPathLength = cumulativeLengths[cumulativeLengths.length - 1] || 1;
      
      // === Известные точки для построения path ===
      const knownPoints = points.filter(p => !p.isUnknown);
      
      // Path строится ТОЛЬКО по известным точкам — плавная кривая
      const pathD = smoothPath(knownPoints, 'y');
      
      // === Вычисляем Y для unknown точек на кривой Безье ===
      // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
      const cubicBezier = (t, p0, cp1, cp2, p3) => {
        const u = 1 - t;
        return u*u*u*p0 + 3*u*u*t*cp1 + 3*u*t*t*cp2 + t*t*t*p3;
      };
      
      points.forEach((p) => {
        if (!p.isUnknown) return;
        
        // Находим между какими известными точками (по X) лежит unknown
        let leftIdx = -1, rightIdx = -1;
        for (let i = 0; i < knownPoints.length; i++) {
          if (knownPoints[i].x <= p.x) leftIdx = i;
          if (knownPoints[i].x > p.x && rightIdx < 0) { rightIdx = i; break; }
        }
        
        if (leftIdx < 0 || rightIdx < 0) {
          // Крайний случай — используем ближайшую точку
          if (leftIdx >= 0) p.y = knownPoints[leftIdx].y;
          else if (rightIdx >= 0) p.y = knownPoints[rightIdx].y;
          return;
        }
        
        // Catmull-Rom → Bezier control points (те же что в smoothPath)
        const tension = 0.25;
        const i = leftIdx;
        const p0 = knownPoints[Math.max(0, i - 1)];
        const p1 = knownPoints[i];
        const p2 = knownPoints[i + 1];
        const p3 = knownPoints[Math.min(knownPoints.length - 1, i + 2)];
        
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        
        // Находим t по X (приближённо, для Bezier X тоже кривая)
        // Используем итеративный поиск
        const targetX = p.x;
        let t = (targetX - p1.x) / (p2.x - p1.x); // начальное приближение
        
        // Несколько итераций Newton-Raphson для уточнения t
        for (let iter = 0; iter < 5; iter++) {
          const currentX = cubicBezier(t, p1.x, cp1x, cp2x, p2.x);
          const error = currentX - targetX;
          if (Math.abs(error) < 0.1) break;
          
          // Производная Bezier по t
          const u = 1 - t;
          const dx = 3*u*u*(cp1x - p1.x) + 6*u*t*(cp2x - cp1x) + 3*t*t*(p2.x - cp2x);
          if (Math.abs(dx) > 0.001) t -= error / dx;
          t = Math.max(0, Math.min(1, t));
        }
        
        // Вычисляем Y по найденному t
        p.y = cubicBezier(t, p1.y, cp1y, cp2y, p2.y);
      });
      
      // Линия цели — плавная пунктирная
      const goalPathD = smoothPath(points, 'targetY');
      
      // Прогнозная линия (если есть данные)
      let forecastPathD = '';
      let forecastColor = '#94a3b8'; // серый по умолчанию
      let forecastPathLength = 0; // длина для анимации
      if (forecastPts.length > 0 && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения Bezier
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        const forecastPoint = forecastPts[forecastPts.length - 1];
        
        // Полный массив для расчёта касательных
        const allForBezier = [prev2Point, lastPoint, ...forecastPts];
        
        // Строим путь только для прогнозной части (от lastPoint)
        // Используем smoothPath но начинаем с индекса 1
        let d = `M${lastPoint.x},${lastPoint.y}`;
        for (let i = 1; i < allForBezier.length - 1; i++) {
          const p0 = allForBezier[i - 1];
          const p1 = allForBezier[i];
          const p2 = allForBezier[i + 1];
          const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
          const tension = 0.25;
          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.y + (p2.y - p0.y) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.y - (p3.y - p1.y) * tension;
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
          
          // Длина сегмента
          forecastPathLength += bezierLength(
            { x: p1.x, y: p1.y },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: p2.x, y: p2.y }
          );
        }
        forecastPathD = d;
        
        // Цвет прогнозной линии — всегда оранжевый для чёткого отличия от реальных данных
        forecastColor = '#f97316'; // orange-500 — прогноз всегда оранжевый
      }
      
      // Прогнозная линия НОРМЫ (goal) — продолжение тренда за 7 дней
      let forecastGoalPathD = '';
      if (forecastPts.length > 0 && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения Bezier
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        
        // Полный массив для расчёта касательных (используем targetY)
        const allForBezier = [prev2Point, lastPoint, ...forecastPts];
        
        // Строим путь только для прогнозной части (от lastPoint)
        let d = `M${lastPoint.x},${lastPoint.targetY}`;
        for (let i = 1; i < allForBezier.length - 1; i++) {
          const p0 = allForBezier[i - 1];
          const p1 = allForBezier[i];
          const p2 = allForBezier[i + 1];
          const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
          const tension = 0.25;
          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
        }
        forecastGoalPathD = d;
      }
      
      // === Streak detection: золотая линия между последовательными 🔥 днями ===
      // Находит индексы начала и конца последовательных идеальных дней
      const findStreakRanges = (pts) => {
        const ranges = [];
        let startIdx = -1;
        pts.forEach((p, i) => {
          if (p.isPerfect && p.kcal > 0) {
            if (startIdx === -1) startIdx = i;
          } else {
            if (startIdx !== -1 && i - startIdx >= 2) {
              ranges.push({ start: startIdx, end: i - 1 });
            }
            startIdx = -1;
          }
        });
        // Последний streak
        if (startIdx !== -1 && pts.length - startIdx >= 2) {
          ranges.push({ start: startIdx, end: pts.length - 1 });
        }
        return ranges;
      };
      
      // Извлекает сегмент пути между индексами, используя ТЕ ЖЕ контрольные точки
      // С monotonic constraint для предотвращения overshooting
      const extractPathSegment = (allPts, startIdx, endIdx, yKey = 'y') => {
        if (startIdx >= endIdx) return '';
        
        let d = `M${allPts[startIdx].x},${allPts[startIdx][yKey]}`;
        for (let i = startIdx; i < endIdx; i++) {
          // Используем ВСЕ точки для расчёта контрольных точек (как в основном пути)
          const p0 = allPts[Math.max(0, i - 1)];
          const p1 = allPts[i];
          const p2 = allPts[i + 1];
          const p3 = allPts[Math.min(allPts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;
          
          // Monotonic constraint
          const minY = Math.min(p1[yKey], p2[yKey]);
          const maxY = Math.max(p1[yKey], p2[yKey]);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
        }
        return d;
      };
      
      const streakRanges = findStreakRanges(points);
      
      // Вычисляем длину каждого streak-сегмента и задержку анимации
      const lineDrawDuration = 3; // секунд — должно совпадать с анимацией основной линии
      const streakData = streakRanges.map(range => {
        const path = extractPathSegment(points, range.start, range.end, 'y');
        
        // Длина streak-сегмента
        let segmentLength = 0;
        for (let i = range.start; i < range.end; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          const tension = 0.25;
          const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1.y + (p2.y - p0.y) * tension };
          const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2.y - (p3.y - p1.y) * tension };
          segmentLength += bezierLength({ x: p1.x, y: p1.y }, cp1, cp2, { x: p2.x, y: p2.y });
        }
        
        // Задержка = когда основная линия достигает начала streak
        const startProgress = cumulativeLengths[range.start] / totalPathLength;
        const animDelay = startProgress * lineDrawDuration;
        
        // Длительность = пропорционально длине сегмента относительно общей длины
        const segmentDuration = (segmentLength / totalPathLength) * lineDrawDuration;
        
        return { path, segmentLength, animDelay, segmentDuration };
      });
      
      // Для совместимости оставляем streakPaths
      const streakPaths = streakData.map(d => d.path);
      
      // Определяем цвет точки по ratio — используем централизованный ratioZones
      const rz = HEYS.ratioZones;
      const getDotColor = (ratio) => {
        return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
      };
      
      // Полный плавный путь области между двумя кривыми
      // С monotonic constraint для предотвращения overshooting
      const buildFullAreaPath = (pts) => {
        if (pts.length < 2) return '';
        
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.y + (p2.y - p0.y) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.y - (p3.y - p1.y) * tension;
          
          // Monotonic constraint
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        
        d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].targetY}`;
        
        for (let i = pts.length - 1; i > 0; i--) {
          const p0 = pts[Math.min(pts.length - 1, i + 1)];
          const p1 = pts[i];
          const p2 = pts[i - 1];
          const p3 = pts[Math.max(0, i - 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
          
          // Monotonic constraint for targetY
          const minTY = Math.min(p1.targetY, p2.targetY);
          const maxTY = Math.max(p1.targetY, p2.targetY);
          const marginT = (maxTY - minTY) * 0.15;
          cp1y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp1y));
          cp2y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
        }
        
        d += ' Z';
        return d;
      };
      
      const fullAreaPath = buildFullAreaPath(points);
      
      // === 1. Goal Achievement % — процент дней в норме ===
      const successDays = points.filter(p => p.kcal > 0 && p.isPerfect).length;
      const totalDaysWithData = points.filter(p => p.kcal > 0).length;
      const goalAchievementPct = totalDaysWithData > 0 
        ? Math.round((successDays / totalDaysWithData) * 100) 
        : 0;
      
      // === 2. Confidence interval для прогноза ===
      // Стандартное отклонение калорий за период
      const avgKcal = points.length > 0 
        ? points.reduce((s, p) => s + p.kcal, 0) / points.length 
        : 0;
      const variance = points.length > 1 
        ? points.reduce((s, p) => s + Math.pow(p.kcal - avgKcal, 2), 0) / (points.length - 1) 
        : 0;
      const stdDev = Math.sqrt(variance);
      // Коридор: ±1 стандартное отклонение (≈68% уверенность)
      const confidenceMargin = Math.min(stdDev * 0.7, 300); // макс ±300 ккал
      
      // === 3. Weekend ranges для shading ===
      const weekendRanges = [];
      let weekendStart = null;
      points.forEach((p, i) => {
        if (p.isWeekend) {
          if (weekendStart === null) weekendStart = i;
        } else {
          if (weekendStart !== null) {
            weekendRanges.push({ start: weekendStart, end: i - 1 });
            weekendStart = null;
          }
        }
      });
      // Последний weekend
      if (weekendStart !== null) {
        weekendRanges.push({ start: weekendStart, end: points.length - 1 });
      }
      
      // Определяем цвет для каждой точки — используем градиент из ratioZones
      const getPointColor = (ratio) => {
        return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
      };
      
      // Создаём горизонтальный градиент с цветами по точкам
      const gradientStops = points.map((p, i) => {
        const ratio = p.target > 0 ? p.kcal / p.target : 0;
        const color = getPointColor(ratio);
        const offset = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
        return { offset, color };
      });
      
      // === Pointer events для slider ===
      const handlePointerMove = (e) => {
        // Если идёт brush — обновляем диапазон
        if (brushing && brushStartRef.current !== null) {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (width / rect.width);
          const nearestIdx = points.reduce((prevIdx, curr, idx) => 
            Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);
          
          const startIdx = brushStartRef.current;
          setBrushRange({
            start: Math.min(startIdx, nearestIdx),
            end: Math.max(startIdx, nearestIdx)
          });
          return;
        }
        
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        
        // Найти ближайшую точку (только основные, не прогноз)
        const nearest = points.reduce((prev, curr) => 
          Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
        );
        
        // Haptic при смене точки
        if (sliderPrevPointRef.current !== nearest) {
          sliderPrevPointRef.current = nearest;
          haptic('selection');
        }
        
        setSliderPoint(nearest);
      };
      
      const handlePointerLeave = () => {
        setSliderPoint(null);
        sliderPrevPointRef.current = null;
      };
      
      // === Brush selection handlers ===
      const handleBrushStart = (e) => {
        // Только при долгом нажатии или с Shift
        if (!e.shiftKey && e.pointerType !== 'touch') return;
        
        e.preventDefault();
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const nearestIdx = points.reduce((prevIdx, curr, idx) => 
          Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);
        
        brushStartRef.current = nearestIdx;
        setBrushing(true);
        setBrushRange({ start: nearestIdx, end: nearestIdx });
        haptic('light');
      };
      
      const handleBrushEnd = () => {
        if (brushing && brushRange && brushRange.start !== brushRange.end) {
          haptic('medium');
          // Brush завершён — можно показать статистику по диапазону
        }
        setBrushing(false);
        brushStartRef.current = null;
      };
      
      const clearBrush = () => {
        setBrushRange(null);
        setBrushing(false);
        brushStartRef.current = null;
      };
      
      // === Pinch zoom handlers ===
      const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          sparklineZoomRef.current.initialDistance = Math.hypot(dx, dy);
          sparklineZoomRef.current.initialZoom = sparklineZoom;
        }
      };
      
      const handleTouchMove = (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const distance = Math.hypot(dx, dy);
          const initialDist = sparklineZoomRef.current.initialDistance;
          
          if (initialDist > 0) {
            const scale = distance / initialDist;
            const newZoom = Math.max(1, Math.min(3, sparklineZoomRef.current.initialZoom * scale));
            setSparklineZoom(newZoom);
          }
        }
      };
      
      const handleTouchEnd = () => {
        sparklineZoomRef.current.initialDistance = 0;
      };
      
      // Сброс zoom по двойному тапу
      const handleDoubleClick = () => {
        if (sparklineZoom > 1) {
          setSparklineZoom(1);
          setSparklinePan(0);
          haptic('light');
        }
      };
      
      // === Точка "сегодня" ===
      const todayPoint = points.find(p => p.isToday);
      
      // === Статистика выбранного диапазона (brush) ===
      const brushStats = brushRange && brushRange.start !== brushRange.end ? (() => {
        const rangePoints = points.slice(brushRange.start, brushRange.end + 1);
        const totalKcal = rangePoints.reduce((s, p) => s + p.kcal, 0);
        const avgKcal = Math.round(totalKcal / rangePoints.length);
        const avgRatio = rangePoints.reduce((s, p) => s + p.ratio, 0) / rangePoints.length;
        const daysInRange = rangePoints.length;
        return { totalKcal, avgKcal, avgRatio, daysInRange };
      })() : null;
      
      // Класс для Goal Achievement badge
      const goalBadgeClass = 'sparkline-goal-badge' + 
        (goalAchievementPct >= 70 ? '' : goalAchievementPct >= 40 ? ' goal-low' : ' goal-critical');
      
      return React.createElement('div', { 
        className: 'sparkline-container' + (sparklineZoom > 1 ? ' sparkline-zoomed' : ''),
        style: { position: 'relative', overflow: 'hidden' },
        ref: (el) => {
          // Вызываем Twemoji после рендера для foreignObject
          if (el && window.applyTwemoji) {
            setTimeout(() => window.applyTwemoji(el), 50);
          }
        }
      },
      // Goal Achievement Badge перенесён в header (kcal-sparkline-header)
      // === Brush Stats Badge (при выборе диапазона) ===
      brushStats && React.createElement('div', {
        className: 'sparkline-brush-stats',
        onClick: clearBrush
      },
        React.createElement('span', { className: 'brush-days' }, brushStats.daysInRange + ' дн'),
        React.createElement('span', { className: 'brush-avg' }, 'Ø ' + brushStats.avgKcal + ' ккал'),
        React.createElement('span', { 
          className: 'brush-ratio',
          style: { backgroundColor: rz ? rz.getGradientColor(brushStats.avgRatio, 0.9) : '#22c55e' }
        }, Math.round(brushStats.avgRatio * 100) + '%'),
        React.createElement('span', { className: 'brush-close' }, '✕')
      ),
      // === Zoom indicator ===
      sparklineZoom > 1 && React.createElement('div', {
        className: 'sparkline-zoom-indicator',
        onClick: handleDoubleClick
      }, Math.round(sparklineZoom * 100) + '%'),
      React.createElement('svg', { 
        className: 'sparkline-svg animate-always',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'none',
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
        onPointerDown: handleBrushStart,
        onPointerUp: handleBrushEnd,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onDoubleClick: handleDoubleClick,
        style: { 
          touchAction: sparklineZoom > 1 ? 'pan-x' : 'none', 
          height: height + 'px',
          transform: sparklineZoom > 1 ? `scale(${sparklineZoom}) translateX(${sparklinePan}%)` : 'none',
          transformOrigin: 'center center'
        }
      },
        // Градиенты с цветами по точкам (для области и линии)
        React.createElement('defs', null,
          // Градиент для заливки области (с прозрачностью)
          React.createElement('linearGradient', { id: 'kcalAreaGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 0.25 
              })
            )
          ),
          // Градиент для линии (полная яркость) — цвета по ratio zones
          React.createElement('linearGradient', { id: 'kcalLineGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 1 
              })
            )
          )
        ),
        // Заливка области с градиентом (анимированная)
        React.createElement('path', {
          d: fullAreaPath,
          fill: 'url(#kcalAreaGradient)',
          className: 'sparkline-area-animated'
        }),
        // Линия цели (плавная пунктирная)
        React.createElement('path', {
          d: goalPathD,
          className: 'sparkline-goal',
          fill: 'none'
        }),
        // Линия графика с градиентом по ratio zones
        React.createElement('path', {
          d: pathD,
          className: 'sparkline-line',
          style: { 
            stroke: 'url(#kcalLineGradient)',
            strokeDasharray: totalPathLength, 
            strokeDashoffset: totalPathLength 
          }
        }),
        // Золотые streak-линии между 🔥 днями (анимируются синхронно с основной линией)
        streakData.map((data, i) => 
          React.createElement('path', {
            key: 'streak-' + i,
            d: data.path,
            className: 'sparkline-streak-line sparkline-streak-animated',
            style: {
              strokeDasharray: data.segmentLength,
              strokeDashoffset: data.segmentLength,
              animationDelay: data.animDelay + 's',
              animationDuration: data.segmentDuration + 's'
            }
          })
        ),
        // Прогнозная линия калорий — маска для анимации + пунктир
        forecastPathD && React.createElement('g', { key: 'forecast-group' },
          // Маска: сплошная линия которая рисуется
          React.createElement('defs', null,
            React.createElement('mask', { id: 'forecastMask' },
              React.createElement('path', {
                d: forecastPathD,
                fill: 'none',
                stroke: 'white',
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeDasharray: forecastPathLength,
                strokeDashoffset: forecastPathLength,
                className: 'sparkline-forecast-mask'
              })
            )
          ),
          // Видимая пунктирная линия под маской
          React.createElement('path', {
            d: forecastPathD,
            fill: 'none',
            stroke: forecastColor,
            strokeWidth: 2,
            strokeDasharray: '6 4',
            strokeOpacity: 0.7,
            strokeLinecap: 'round',
            mask: 'url(#forecastMask)'
          })
        ),
        // Прогнозная линия нормы (цели)
        forecastGoalPathD && React.createElement('path', {
          key: 'forecast-goal-line',
          d: forecastGoalPathD,
          fill: 'none',
          stroke: 'rgba(148, 163, 184, 0.7)', // серый slate-400
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
          strokeLinecap: 'round'
        }),
        // === Confidence interval для прогноза (коридор ±σ) — заливка области ===
        forecastPts.length > 0 && confidenceMargin > 50 && (() => {
          // Строим path для области: верхняя граница → нижняя граница (обратно)
          const marginPx = (confidenceMargin / scaleRange) * chartHeight;
          
          // Верхняя линия (слева направо)
          const upperPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.max(paddingTop, p.y - marginPx)
          }));
          
          // Нижняя линия (справа налево)
          const lowerPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.min(paddingTop + chartHeight, p.y + marginPx)
          })).reverse();
          
          // Добавляем начальную точку от последней реальной точки
          const lastRealPoint = points[points.length - 1];
          const startX = lastRealPoint ? lastRealPoint.x : forecastPts[0].x;
          
          // Строим path
          let areaPath = 'M ' + startX + ' ' + upperPoints[0].y;
          upperPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          lowerPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          areaPath += ' Z';
          
          return React.createElement('path', {
            key: 'confidence-area',
            d: areaPath,
            fill: forecastColor,
            fillOpacity: 0.08,
            stroke: 'none'
          });
        })(),
        // Точки прогноза (с цветом по тренду) — появляются после прогнозной линии
        // Для isFutureDay используем серый цвет с пунктиром
        forecastPts.map((p, i) => {
          // Задержка = 3с (основная линия) + время до этой точки в прогнозе
          const forecastDelay = 3 + (i + 1) / forecastPts.length * Math.max(0.5, (forecastPathLength / totalPathLength) * 3);
          const isFutureDay = p.isFutureDay;
          const dotColor = isFutureDay ? 'rgba(156, 163, 175, 0.6)' : forecastColor;
          return React.createElement('circle', {
            key: 'forecast-dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: isFutureDay ? 6 : (p.isTodayForecast ? 4 : 3), // будущие дни крупнее для "?"
            className: 'sparkline-dot sparkline-forecast-dot' + (isFutureDay ? ' sparkline-future-dot' : ''),
            style: {
              fill: isFutureDay ? 'rgba(156, 163, 175, 0.3)' : forecastColor,
              opacity: 0, // начинаем скрытым
              '--delay': forecastDelay + 's',
              strokeDasharray: isFutureDay ? '3 2' : '2 2',
              stroke: dotColor,
              strokeWidth: isFutureDay ? 1.5 : (p.isTodayForecast ? 2 : 1)
            }
          });
        }),
        // Метки прогнозных ккал над точками (бледные)
        // Для isFutureDay показываем "?" вместо прогнозных ккал
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          const isFutureDay = p.isFutureDay;
          // Цифра прогноза: синяя для сегодня, оранжевая для будущих
          const kcalColor = p.isTodayForecast ? '#3b82f6' : (isFutureDay ? 'rgba(156, 163, 175, 0.9)' : forecastColor);
          return React.createElement('g', { key: 'forecast-kcal-group-' + i },
            // "прогноз на сегодня" НАД цифрой — только для сегодняшнего прогноза
            p.isTodayForecast && React.createElement('text', {
              key: 'forecast-label-' + i,
              x: p.x,
              y: p.y - 38,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.9, fontSize: '9px', fill: '#3b82f6' }
            }, 'прогноз на сегодня'),
            // Цифра ккал (с гапом от треугольника)
            React.createElement('text', {
              key: 'forecast-kcal-' + i,
              x: p.x,
              y: p.y - (p.isTodayForecast ? 22 : 12),
              className: 'sparkline-day-label' + (p.isTodayForecast ? ' sparkline-day-today' : ' sparkline-day-forecast'),
              textAnchor: isLast ? 'end' : 'middle',
              style: { 
                opacity: isFutureDay ? 0.6 : (p.isTodayForecast ? 0.9 : 0.5), 
                fill: kcalColor,
                fontSize: p.isTodayForecast ? '12px' : (isFutureDay ? '11px' : undefined),
                fontWeight: p.isTodayForecast ? '700' : (isFutureDay ? '600' : undefined)
              }
            }, isFutureDay ? '?' : p.kcal),
            // Анимированный треугольник-указатель между цифрой и точкой для сегодняшнего прогноза
            p.isTodayForecast && React.createElement('text', {
              key: 'forecast-arrow-' + i,
              x: p.x,
              y: p.y - 8,
              textAnchor: 'middle',
              className: 'sparkline-today-label sparkline-forecast-arrow',
              style: { 
                fill: '#3b82f6', 
                fontSize: '10px', 
                fontWeight: '600',
                opacity: 0.9
              }
            }, '▼')
          );
        }),
        // Метки прогнозных дней (дата внизу, "прогноз на завтра" для завтра)
        // Для isFutureDay показываем просто дату без "прогноз на завтра"
        // "прогноз на сегодня" теперь отрисовывается НАВЕРХУ над цифрой прогноза
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          const isFutureDay = p.isFutureDay;
          const isTomorrow = !p.isTodayForecast && !isFutureDay && i === 0;
          // Только для завтра показываем "прогноз на завтра" внизу
          const showTomorrowLabel = isTomorrow && !isFutureDay;
          
          return React.createElement('g', { key: 'forecast-day-' + i },
            // "прогноз на завтра" выше даты — только для завтра
            showTomorrowLabel && React.createElement('text', {
              x: p.x,
              y: height - 22,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.9, fontSize: '8px', fill: '#3b82f6' }
            }, 'прогноз'),
            showTomorrowLabel && React.createElement('text', {
              x: p.x,
              y: height - 13,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.9, fontSize: '8px', fill: '#3b82f6' }
            }, 'на завтра'),
            // Дата внизу — для сегодня чуть крупнее и жирнее, но не слишком
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: 'sparkline-day-label' + 
                (p.isTodayForecast ? ' sparkline-day-today' : '') +
                (isFutureDay ? ' sparkline-day-future' : ' sparkline-day-forecast') + 
                (p.isWeekend ? ' sparkline-day-weekend' : ''),
              textAnchor: isLast ? 'end' : 'middle',
              dominantBaseline: 'alphabetic',
              style: { 
                opacity: isFutureDay ? 0.5 : (p.isTodayForecast ? 1 : 0.8),
                fontSize: p.isTodayForecast ? '9.5px' : undefined,
                fontWeight: p.isTodayForecast ? '700' : undefined,
                fill: p.isTodayForecast ? '#3b82f6' : undefined
              }
            }, p.dayNum)
          );
        }),
        // Метки дней внизу + дельта для всех дней (дельта появляется синхронно с точкой)
        points.map((p, i) => {
          // Классы для выходных и сегодня
          let dayClass = 'sparkline-day-label';
          if (p.isToday) dayClass += ' sparkline-day-today';
          if (p.isWeekend) dayClass += ' sparkline-day-weekend';
          if (p.isUnknown) dayClass += ' sparkline-day-unknown';
          // Динамический anchor для крайних точек
          const isFirst = i === 0;
          const isLast = i === points.length - 1 && forecastPts.length === 0;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          
          // Дельта: разница между съеденным и нормой
          const delta = p.kcal - p.target;
          const deltaText = delta >= 0 ? '+' + Math.round(delta) : Math.round(delta);
          const ratio = p.target > 0 ? p.kcal / p.target : 0;
          const deltaColor = rz ? rz.getGradientColor(ratio, 1) : '#64748b';
          
          // Delay: все дельты и эмодзи появляются одновременно — взрыв от оси X
          const deltaDelay = 2.6; // все сразу
          
          return React.createElement('g', { key: 'day-group-' + i },
            // Дата — для сегодня чуть крупнее и жирнее, цвет по ratio
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: dayClass,
              textAnchor: anchor,
              dominantBaseline: 'alphabetic',
              style: p.isUnknown ? { opacity: 0.5 } : (p.isToday && p.kcal > 0 ? { fontSize: '9.5px', fontWeight: '700', fill: deltaColor } : {})
            }, p.dayNum),
            // Дельта под датой (для всех дней с данными, кроме unknown)
            p.kcal > 0 && !p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height + 10,
              className: 'sparkline-delta-label',
              textAnchor: anchor,
              style: { fill: deltaColor, '--delay': deltaDelay + 's' }
            }, deltaText),
            // Для unknown дней — показываем "?" вместо дельты
            p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height + 10,
              className: 'sparkline-delta-label sparkline-delta-unknown',
              textAnchor: anchor,
              style: { fill: 'rgba(156, 163, 175, 0.6)', '--delay': deltaDelay + 's' }
            }, '—')
          );
        }),
        // Точки на все дни с hover и цветом по статусу (анимация с задержкой)
        // Weekly Rhythm — вертикальные сепараторы перед понедельниками (но не первым)
        points.filter((p, i) => i > 0 && p.dayOfWeek === 1).map((p, i) =>
          React.createElement('line', {
            key: 'week-sep-' + i,
            x1: p.x - 4,
            y1: paddingTop + 4,
            x2: p.x - 4,
            y2: height - paddingBottom - 4,
            className: 'sparkline-week-separator'
          })
        ),
        // Золотые пульсирующие точки для идеальных дней, иначе обычные точки
        // Точки появляются синхронно с рисованием линии (по реальной длине кривой Безье)
        (() => {
          const lineDrawDuration = 3; // секунд — должно совпадать с CSS animation
          const leadTime = 0.15; // точки появляются чуть раньше линии
          
          return points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            // Задержка пропорциональна реальной длине пути до точки
            const pathProgress = cumulativeLengths[i] / totalPathLength;
            const animDelay = Math.max(0, pathProgress * lineDrawDuration - leadTime);
          
            // Неизвестный день — серый кружок с "?"
            if (p.isUnknown) {
              return React.createElement('g', { key: 'unknown-' + i },
                React.createElement('circle', {
                  cx: p.x,
                  cy: p.y,
                  r: 6,
                  className: 'sparkline-dot sparkline-dot-unknown',
                  style: { 
                    cursor: 'pointer', 
                    '--delay': animDelay + 's',
                    fill: 'rgba(156, 163, 175, 0.3)',
                    stroke: 'rgba(156, 163, 175, 0.6)',
                    strokeWidth: 1.5,
                    strokeDasharray: '2 2'
                  },
                  onClick: (e) => {
                    e.stopPropagation();
                    haptic('light');
                    openExclusivePopup('sparkline', { type: 'unknown', point: p, x: e.clientX, y: e.clientY });
                  }
                }),
                React.createElement('text', {
                  x: p.x,
                  y: p.y + 3,
                  textAnchor: 'middle',
                  className: 'sparkline-unknown-label',
                  style: { 
                    fill: 'rgba(156, 163, 175, 0.9)',
                    fontSize: '9px',
                    fontWeight: '600',
                    pointerEvents: 'none'
                  }
                }, '?')
              );
            }
          
            // Идеальный день — золотая пульсирующая точка (или оранжевая для refeed)
            if (p.isPerfect && p.kcal > 0) {
              // Refeed день: оранжевая граница + 🔄 бейдж
              const isRefeed = p.isRefeedDay && ratio > 1.1;
              return React.createElement('g', { key: 'perfect-' + i },
                React.createElement('circle', {
                  key: 'gold-' + i,
                  cx: p.x,
                  cy: p.y,
                  r: p.isToday ? 5 : 4,
                  className: isRefeed 
                    ? 'sparkline-dot-refeed' + (p.isToday ? ' sparkline-dot-refeed-today' : '')
                    : 'sparkline-dot-gold' + (p.isToday ? ' sparkline-dot-gold-today' : ''),
                  style: { cursor: 'pointer', '--delay': animDelay + 's' },
                  onClick: (e) => {
                    e.stopPropagation();
                    haptic('medium');
                    openExclusivePopup('sparkline', { type: isRefeed ? 'refeed' : 'perfect', point: p, x: e.clientX, y: e.clientY });
                  }
                }),
                // Refeed бейдж (🔄) над точкой
                isRefeed && React.createElement('text', {
                  x: p.x,
                  y: p.y - 10,
                  textAnchor: 'middle',
                  className: 'sparkline-refeed-badge',
                  style: { fontSize: '10px', '--delay': animDelay + 0.2 + 's' }
                }, '🔄')
              );
            }
          
            // Обычная точка — цвет через inline style из ratioZones
            const dotColor = rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
          let dotClass = 'sparkline-dot';
          if (p.isToday) dotClass += ' sparkline-dot-today';
          
          return React.createElement('circle', {
            key: 'dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isToday ? 5 : 4,
            className: dotClass,
            style: { cursor: 'pointer', '--delay': animDelay + 's', fill: dotColor },
            onClick: (e) => {
              e.stopPropagation();
              haptic('light');
              openExclusivePopup('sparkline', { type: 'kcal', point: p, x: e.clientX, y: e.clientY });
            }
          },
            React.createElement('title', null, p.dayNum + ': ' + p.kcal + ' / ' + p.target + ' ккал')
          );
        });
        })(),
        // Пунктирные линии от точек к меткам дней (появляются синхронно с точкой)
        points.map((p, i) => {
          if (p.kcal <= 0) return null;
          const pathProgress = cumulativeLengths[i] / totalPathLength;
          const lineDelay = Math.max(0, pathProgress * 3 - 0.15);
          return React.createElement('line', {
            key: 'point-line-' + i,
            x1: p.x,
            y1: p.y + 6, // от точки
            x2: p.x,
            y2: height - paddingBottom + 6, // до меток дней
            className: 'sparkline-point-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — пунктирные линии вниз к точкам (появляются синхронно с точкой)
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          const lineDelay = 2.6; // все сразу
          return React.createElement('line', {
            key: 'train-line-' + i,
            x1: p.x,
            y1: 6, // от верхней линии
            x2: p.x,
            y2: p.y - 6, // до точки
            className: 'sparkline-training-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — иконки в одну линию сверху
        // Используем SVG <image> с Twemoji CDN напрямую
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          // Маппинг типов на Twemoji codepoints
          const typeCodepoint = { 
            cardio: '1f3c3',      // 🏃
            strength: '1f3cb',    // 🏋️ (без -fe0f!)
            hobby: '26bd'         // ⚽
          };
          const emojiDelay = 2.6;
          const emojiSize = 16;
          const emojiCount = p.trainingTypes.length;
          const totalWidth = emojiCount * emojiSize;
          const startX = p.x - totalWidth / 2;
          
          return React.createElement('g', {
            key: 'train-' + i,
            className: 'sparkline-annotation sparkline-annotation-training',
            style: { '--delay': emojiDelay + 's' }
          },
            p.trainingTypes.map((t, j) => {
              const code = typeCodepoint[t] || '1f3c3';
              const url = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/' + code + '.svg';
              return React.createElement('image', {
                key: j,
                href: url,
                x: startX + j * emojiSize,
                y: 1,
                width: emojiSize,
                height: emojiSize
              });
            })
          );
        }).filter(Boolean),
        // Слайдер — вертикальная линия
        sliderPoint && React.createElement('line', {
          key: 'slider-line',
          x1: sliderPoint.x,
          y1: paddingTop,
          x2: sliderPoint.x,
          y2: height - paddingBottom + 2,
          className: 'sparkline-slider-line'
        }),
        // Слайдер — увеличенная точка
        sliderPoint && React.createElement('circle', {
          key: 'slider-point',
          cx: sliderPoint.x,
          cy: sliderPoint.y,
          r: 6,
          className: 'sparkline-slider-point'
        }),
        // === TODAY LINE — вертикальная линия на сегодня ===
        todayPoint && React.createElement('g', { key: 'today-line-group' },
          // Полупрозрачная полоса
          React.createElement('rect', {
            x: todayPoint.x - 1.5,
            y: paddingTop,
            width: 3,
            height: chartHeight,
            className: 'sparkline-today-line',
            fill: 'rgba(59, 130, 246, 0.2)'
          }),
          // Процент отклонения от нормы (с гапом от треугольника)
          todayPoint.target > 0 && React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 26,
            textAnchor: 'middle',
            className: 'sparkline-today-pct',
            style: { 
              fill: rz ? rz.getGradientColor(todayPoint.kcal / todayPoint.target, 1) : '#22c55e', 
              fontSize: '12px', 
              fontWeight: '700'
            }
          }, (() => {
            const deviation = Math.round((todayPoint.kcal / todayPoint.target - 1) * 100);
            return deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
          })()),
          // Анимированный треугольник-указатель (между процентом и точкой)
          React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 14,
            textAnchor: 'middle',
            className: 'sparkline-today-label sparkline-forecast-arrow',
            style: { fill: 'rgba(59, 130, 246, 0.9)', fontSize: '10px', fontWeight: '600' }
          }, '▼')
        ),
        // === BRUSH SELECTION — полоса выбора диапазона ===
        brushRange && points[brushRange.start] && points[brushRange.end] && React.createElement('rect', {
          key: 'brush-overlay',
          x: Math.min(points[brushRange.start].x, points[brushRange.end].x),
          y: paddingTop,
          width: Math.abs(points[brushRange.end].x - points[brushRange.start].x),
          height: chartHeight,
          className: 'sparkline-brush-overlay',
          fill: 'rgba(59, 130, 246, 0.12)',
          stroke: 'rgba(59, 130, 246, 0.4)',
          strokeWidth: 1,
          rx: 2
        })
      ),
      // Glassmorphism тултип для слайдера (компактный)
      sliderPoint && React.createElement('div', {
        className: 'sparkline-slider-tooltip',
        style: {
          left: Math.min(Math.max(sliderPoint.x, 60), width - 60) + 'px',
          transform: 'translateX(-50%)'
        }
      },
        // Header: дата + badge процент
        React.createElement('div', { className: 'sparkline-slider-tooltip-header' }, 
          React.createElement('span', { className: 'sparkline-slider-tooltip-date' }, 
            (() => {
              if (sliderPoint.isForecast) return sliderPoint.dayNum + ' П';
              const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
              const wd = weekDays[sliderPoint.dayOfWeek] || '';
              return sliderPoint.dayNum + ' ' + wd;
            })()
          ),
          sliderPoint.ratio && React.createElement('span', { 
            className: 'sparkline-slider-tooltip-ratio',
            style: { backgroundColor: rz ? rz.getGradientColor(sliderPoint.ratio, 0.9) : '#22c55e' }
          }, Math.round(sliderPoint.ratio * 100) + '%')
        ),
        // Калории
        React.createElement('div', { className: 'sparkline-slider-tooltip-kcal' }, 
          sliderPoint.kcal + ' ',
          React.createElement('small', null, '/ ' + sliderPoint.target)
        ),
        // Теги: сон, оценка сна, тренировка, шаги, оценка дня
        (sliderPoint.sleepHours > 0 || sliderPoint.sleepQuality > 0 || sliderPoint.dayScore > 0 || sliderPoint.trainingMinutes > 0 || sliderPoint.steps > 0) &&
          React.createElement('div', { className: 'sparkline-slider-tooltip-tags' },
            // Сон
            sliderPoint.sleepHours > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag' + (sliderPoint.sleepHours < 6 ? ' bad' : '')
              }, 'Сон: ' + sliderPoint.sleepHours.toFixed(1) + 'ч'),
            // Оценка сна (1-10) — динамический цвет
            sliderPoint.sleepQuality > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag',
                style: { 
                  backgroundColor: sliderPoint.sleepQuality <= 3 ? '#ef4444' : 
                                   sliderPoint.sleepQuality <= 5 ? '#f97316' : 
                                   sliderPoint.sleepQuality <= 7 ? '#eab308' : '#22c55e',
                  color: sliderPoint.sleepQuality <= 5 ? '#fff' : '#000'
                }
              }, 'Оценка сна: ' + sliderPoint.sleepQuality),
            // Тренировка
            sliderPoint.trainingMinutes > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag good'
              }, 'Тренировка: ' + sliderPoint.trainingMinutes + 'м'),
            // Шаги
            sliderPoint.steps > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag' + (sliderPoint.steps >= 10000 ? ' good' : '')
              }, 'Шаги: ' + sliderPoint.steps.toLocaleString()),
            // Оценка дня (1-10) — динамический цвет
            sliderPoint.dayScore > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag',
                style: { 
                  backgroundColor: sliderPoint.dayScore <= 3 ? '#ef4444' : 
                                   sliderPoint.dayScore <= 5 ? '#f97316' : 
                                   sliderPoint.dayScore <= 7 ? '#eab308' : '#22c55e',
                  color: sliderPoint.dayScore <= 5 ? '#fff' : '#000'
                }
              }, 'Оценка дня: ' + sliderPoint.dayScore)
          )
      ),
      // Полоса оценки дня (dayScore) под графиком
      (() => {
        // Используем исходные data (до фильтрации excludeFromChart), чтобы включить сегодня
        const allDaysWithScore = data.filter(d => d.dayScore > 0);
        const hasDayScoreData = allDaysWithScore.length > 0;
        
        if (hasDayScoreData) {
          // Полоса с градиентом по dayScore (1-10)
          const getDayScoreColor = (score) => {
            if (!score || score <= 0) return 'transparent'; // нет данных — прозрачный пропуск
            if (score <= 3) return '#ef4444'; // 😢 плохо — красный
            if (score <= 5) return '#f97316'; // 😐 средне — оранжевый
            if (score <= 7) return '#eab308'; // 🙂 нормально — жёлтый
            return '#22c55e'; // 😊 хорошо — зелёный
          };
          
          // Используем все дни из data для градиента (включая сегодня)
          const moodStops = data.map((d, i) => ({
            offset: data.length > 1 ? (i / (data.length - 1)) * 100 : 50,
            color: getDayScoreColor(d.dayScore)
          }));
          
          // Бар заканчивается на сегодня, справа место для надписи
          // Вычисляем ширину бара: data.length дней из totalPoints (включая прогноз)
          const barWidthPct = totalPoints > 1 ? ((data.length) / totalPoints) * 100 : 85;
          
          return React.createElement('div', { className: 'sparkline-mood-container' },
            React.createElement('div', { 
              className: 'sparkline-mood-bar-modern',
              style: { 
                width: barWidthPct + '%',
                background: 'linear-gradient(to right, ' + 
                  moodStops.map(s => s.color + ' ' + s.offset + '%').join(', ') + ')'
              }
            }),
            React.createElement('span', { 
              className: 'sparkline-mood-label',
              style: { textAlign: 'right', lineHeight: '1.1', fontSize: '8px' }
            }, 
              React.createElement('span', null, 'Оценка'),
              React.createElement('br'),
              React.createElement('span', null, 'дня')
            )
          );
        }
        
        // Fallback: Mini heatmap калорий
        return React.createElement('div', { className: 'sparkline-heatmap' },
          points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            let level;
            if (ratio === 0) level = 0;
            else if (ratio < 0.5) level = 1;
            else if (ratio < 0.8) level = 2;
            else if (ratio < 0.95) level = 3;
            else if (ratio <= 1.05) level = 4;
            else if (ratio <= 1.15) level = 5;
            else level = 6;
            
            return React.createElement('div', {
              key: 'hm-' + i,
              className: 'sparkline-heatmap-cell level-' + level,
              title: p.dayNum + ': ' + Math.round(ratio * 100) + '%'
            });
          })
        );
      })()
      // Ряд индикаторов сна убран — информация дублируется с баром "Оценка дня"
    );
    };
    
    // SVG Sparkline для веса
    // Примечание: параметр trend был удалён — тренд рассчитывается внутри
    const renderWeightSparkline = (data) => {
      // Skeleton loader пока данные загружаются
      if (!data) {
        return React.createElement('div', { className: 'sparkline-skeleton' },
          React.createElement('div', { className: 'sparkline-skeleton-line' }),
          React.createElement('div', { className: 'sparkline-skeleton-dots' },
            Array.from({length: 7}).map((_, i) => 
              React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
            )
          )
        );
      }
      
      if (data.length === 0) return null;
      
      // Разделяем данные на реальные и прогнозные (isFuture)
      const realData = data.filter(d => !d.isFuture);
      const futureData = data.filter(d => d.isFuture);
      
      // Если только 1 реальная точка — показываем её с подсказкой
      if (realData.length === 1 && futureData.length === 0) {
        const point = realData[0];
        return React.createElement('div', { className: 'weight-single-point' },
          React.createElement('div', { className: 'weight-single-value' },
            React.createElement('span', { className: 'weight-single-number' }, point.weight),
            React.createElement('span', { className: 'weight-single-unit' }, ' кг')
          ),
          React.createElement('div', { className: 'weight-single-hint' },
            'Добавьте вес завтра для отслеживания тренда'
          )
        );
      }
      
      // Прогноз теперь приходит из данных с isFuture: true
      // Используем последнюю точку прогноза если есть
      const forecastPoint = futureData.length > 0 ? futureData[futureData.length - 1] : null;
      
      const width = 360;
      const height = 120; // оптимальный размер графика
      const paddingTop = 16; // для меток веса над точками
      const paddingBottom = 16;
      const paddingX = 8; // минимальные отступы — точки почти у края
      const chartHeight = height - paddingTop - paddingBottom;
      
      // Масштаб с минимумом 1 кг range (все данные уже включают прогноз)
      const allWeights = data.map(d => d.weight);
      const minWeight = Math.min(...allWeights);
      const maxWeight = Math.max(...allWeights);
      const rawRange = maxWeight - minWeight;
      const range = Math.max(1, rawRange + 0.5);
      const adjustedMin = minWeight - 0.25;
      
      const totalPoints = data.length;
      
      // Проверяем есть ли дни с задержкой воды (только в реальных данных)
      const hasAnyRetentionDays = realData.some(d => d.hasWaterRetention);
      
      const points = data.map((d, i) => {
        const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
        const y = paddingTop + chartHeight - ((d.weight - adjustedMin) / range) * chartHeight;
        return { 
          x, 
          y, 
          weight: d.weight, 
          isToday: d.isToday, 
          isFuture: d.isFuture || false, // Маркер прогнозного дня
          dayNum: d.dayNum, 
          date: d.date,
          // Данные о цикле
          cycleDay: d.cycleDay,
          hasWaterRetention: d.hasWaterRetention,
          retentionSeverity: d.retentionSeverity,
          retentionAdvice: d.retentionAdvice
        };
      });
      
      // Точка последнего прогноза (для отдельного рендеринга confidence interval)
      // Теперь прогнозные точки уже в points с isFuture: true
      const forecastPt = futureData.length > 0 ? points.find(p => p.date === forecastPoint.date) : null;
      
      // Плавная кривая (как у калорий) с monotonic constraint
      const smoothPath = (pts) => {
        if (pts.length < 2) return '';
        if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
        
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.y + (p2.y - p0.y) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.y - (p3.y - p1.y) * tension;
          
          // Monotonic constraint — ограничиваем overshooting
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        return d;
      };
      
      // Разделяем точки на реальные и прогнозные для рендеринга
      const realPoints = points.filter(p => !p.isFuture);
      const futurePoints = points.filter(p => p.isFuture);
      
      // Линия рисуется только для реальных точек
      const pathD = smoothPath(realPoints);
      
      // Определяем тренд: сравниваем первую и последнюю половину (только реальные данные)
      const firstHalf = realPoints.slice(0, Math.ceil(realPoints.length / 2));
      const secondHalf = realPoints.slice(Math.floor(realPoints.length / 2));
      const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((s, p) => s + p.weight, 0) / firstHalf.length : 0;
      const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((s, p) => s + p.weight, 0) / secondHalf.length : 0;
      const weightTrend = avgSecond - avgFirst; // положительный = вес растёт
      
      // Цвет градиента по тренду
      const trendColor = weightTrend <= -0.1 ? '#22c55e' : (weightTrend >= 0.1 ? '#ef4444' : '#8b5cf6');
      
      // Цвет прогноза — серый для нейтральности (прогноз — это неизвестность)
      const forecastColor = '#9ca3af'; // gray-400
      
      // Область под графиком (только реальные точки)
      const areaPath = realPoints.length >= 2 
        ? pathD + ` L${realPoints[realPoints.length-1].x},${paddingTop + chartHeight} L${realPoints[0].x},${paddingTop + chartHeight} Z`
        : '';
      
      // Gradient stops для линии веса — по локальному тренду каждой точки (только реальные)
      // Зелёный = вес снижается, красный = вес растёт, фиолетовый = стабильно
      const weightLineGradientStops = realPoints.map((p, i) => {
        const prevWeight = i > 0 ? realPoints[i-1].weight : p.weight;
        const localTrend = p.weight - prevWeight;
        const dotColor = localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#8b5cf6');
        const offset = realPoints.length > 1 ? (i / (realPoints.length - 1)) * 100 : 50;
        return { offset, color: dotColor };
      });
      
      // Прогнозная линия (от последней реальной точки ко всем прогнозным) — пунктирная
      let forecastLineD = '';
      if (futurePoints.length > 0 && realPoints.length >= 1) {
        const lastRealPoint = realPoints[realPoints.length - 1];
        const allForecastPts = [lastRealPoint, ...futurePoints];
        forecastLineD = smoothPath(allForecastPts);
      }
      
      return React.createElement('svg', { 
        className: 'weight-sparkline-svg animate-always',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'none', // растягиваем по всей ширине
        style: { height: height + 'px' } // явная высота
      },
        // Градиенты для веса
        React.createElement('defs', null,
          // Вертикальный градиент для заливки области
          React.createElement('linearGradient', { id: 'weightAreaGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', { offset: '0%', stopColor: trendColor, stopOpacity: '0.25' }),
            React.createElement('stop', { offset: '100%', stopColor: trendColor, stopOpacity: '0.05' })
          ),
          // Горизонтальный градиент для линии — цвета по локальному тренду
          React.createElement('linearGradient', { id: 'weightLineGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            weightLineGradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 1 
              })
            )
          ),
          // Градиент для зоны задержки воды (розовый, вертикальный)
          React.createElement('linearGradient', { id: 'retentionZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', { offset: '0%', stopColor: '#ec4899', stopOpacity: '0.15' }),
            React.createElement('stop', { offset: '100%', stopColor: '#ec4899', stopOpacity: '0.03' })
          )
        ),
        // === Горизонтальная линия целевого веса ===
        (() => {
          const goalWeight = +prof?.weightGoal;
          if (!goalWeight || goalWeight <= 0) return null;
          
          // Проверяем что цель в пределах графика
          if (goalWeight < adjustedMin || goalWeight > adjustedMin + range) return null;
          
          const goalY = paddingTop + chartHeight - ((goalWeight - adjustedMin) / range) * chartHeight;
          
          return React.createElement('g', { key: 'weight-goal-line', className: 'weight-goal-line-group' },
            // Пунктирная линия
            React.createElement('line', {
              x1: paddingX,
              y1: goalY,
              x2: width - paddingX,
              y2: goalY,
              className: 'weight-goal-line',
              strokeDasharray: '6 4'
            }),
            // Метка справа
            React.createElement('text', {
              x: width - paddingX - 2,
              y: goalY - 4,
              className: 'weight-goal-label',
              textAnchor: 'end'
            }, 'Цель: ' + goalWeight + ' кг')
          );
        })(),
        // === Розовые зоны для дней с задержкой воды (рисуем ДО основного графика) ===
        // Используем только реальные точки — прогнозные не имеют данных о цикле
        hasAnyRetentionDays && (() => {
          // Находим группы последовательных дней с задержкой (в реальных данных)
          const retentionRanges = [];
          let rangeStart = null;
          
          for (let i = 0; i < realPoints.length; i++) {
            if (realPoints[i].hasWaterRetention) {
              if (rangeStart === null) rangeStart = i;
            } else {
              if (rangeStart !== null) {
                retentionRanges.push({ start: rangeStart, end: i - 1 });
                rangeStart = null;
              }
            }
          }
          if (rangeStart !== null) {
            retentionRanges.push({ start: rangeStart, end: realPoints.length - 1 });
          }
          
          // Ширина одной "колонки" для точки
          const colWidth = (width - paddingX * 2) / (totalPoints - 1);
          
          return retentionRanges.map((range, idx) => {
            const startX = realPoints[range.start].x - colWidth * 0.4;
            const endX = realPoints[range.end].x + colWidth * 0.4;
            const rectWidth = Math.max(endX - startX, colWidth * 0.8);
            
            return React.createElement('rect', {
              key: 'retention-zone-' + idx,
              x: Math.max(0, startX),
              y: 0,
              width: rectWidth,
              height: height,
              fill: 'url(#retentionZoneGrad)',
              className: 'weight-retention-zone',
              rx: 4 // скруглённые углы
            });
          });
        })(),
        // Заливка под графиком (анимированная)
        React.createElement('path', {
          d: areaPath,
          fill: 'url(#weightAreaGrad)',
          className: 'weight-sparkline-area sparkline-area-animated'
        }),
        // Линия графика с градиентом по тренду
        React.createElement('path', {
          d: pathD,
          className: 'weight-sparkline-line weight-sparkline-line-animated',
          style: { stroke: 'url(#weightLineGrad)' }
        }),
        // Прогнозная линия (пунктирная) — все будущие дни
        futurePoints.length > 0 && forecastLineD && React.createElement('g', { key: 'weight-forecast-group' },
          // Маска: сплошная линия которая рисуется после основной
          React.createElement('defs', null,
            React.createElement('mask', { id: 'weightForecastMask' },
              React.createElement('path', {
                d: forecastLineD,
                fill: 'none',
                stroke: 'white',
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeDasharray: 200,
                strokeDashoffset: 200,
                className: 'weight-sparkline-forecast-mask'
              })
            )
          ),
          // Видимая пунктирная линия под маской
          React.createElement('path', {
            d: forecastLineD,
            fill: 'none',
            stroke: forecastColor,
            strokeWidth: 2,
            strokeDasharray: '4 3',
            strokeOpacity: 0.6,
            strokeLinecap: 'round',
            mask: 'url(#weightForecastMask)'
          })
        ),
        // === Confidence interval для прогноза веса (±0.3 кг) ===
        // Рисуем только для последней прогнозной точки
        futurePoints.length > 0 && realPoints.length > 0 && (() => {
          const confidenceKg = 0.3; // ±300г погрешность
          const marginPx = (confidenceKg / range) * chartHeight;
          const lastRealPt = realPoints[realPoints.length - 1];
          const lastFuturePt = futurePoints[futurePoints.length - 1];
          if (!lastRealPt || !lastFuturePt) return null;
          
          const upperY = Math.max(paddingTop, lastFuturePt.y - marginPx);
          const lowerY = Math.min(paddingTop + chartHeight, lastFuturePt.y + marginPx);
          
          // Треугольная область от последней реальной точки к последней прогнозной
          const confAreaPath = `M ${lastRealPt.x} ${lastRealPt.y} L ${lastFuturePt.x} ${upperY} L ${lastFuturePt.x} ${lowerY} Z`;
          
          return React.createElement('path', {
            key: 'weight-confidence-area',
            d: confAreaPath,
            fill: forecastColor,
            fillOpacity: 0.1,
            stroke: 'none'
          });
        })(),
        // === TODAY LINE для веса ===
        (() => {
          const todayPt = realPoints.find(p => p.isToday);
          if (!todayPt) return null;
          
          // Изменение веса с первой реальной точки периода
          const firstWeight = realPoints[0]?.weight || todayPt.weight;
          const weightChange = todayPt.weight - firstWeight;
          const changeText = weightChange >= 0 ? '+' + weightChange.toFixed(1) : weightChange.toFixed(1);
          const changeColor = weightChange < -0.05 ? '#22c55e' : (weightChange > 0.05 ? '#ef4444' : '#8b5cf6');
          
          return React.createElement('g', { key: 'weight-today-line-group' },
            // Изменение веса над точкой (выше)
            React.createElement('text', {
              x: todayPt.x,
              y: todayPt.y - 26,
              textAnchor: 'middle',
              style: { 
                fill: changeColor, 
                fontSize: '9px', 
                fontWeight: '700'
              }
            }, changeText + ' кг'),
            // Стрелка (выше)
            React.createElement('text', {
              x: todayPt.x,
              y: todayPt.y - 16,
              textAnchor: 'middle',
              style: { fill: 'rgba(139, 92, 246, 0.9)', fontSize: '8px', fontWeight: '600' }
            }, '▼')
          );
        })(),
        // Пунктирные линии от точек к меткам дней (все точки, включая прогноз)
        points.map((p, i) => {
          const animDelay = 3 + i * 0.15;
          return React.createElement('line', {
            key: 'wpoint-line-' + i,
            x1: p.x,
            y1: p.y + 6, // от точки
            x2: p.x,
            y2: height - paddingBottom + 4, // до меток дней
            className: 'sparkline-point-line weight-sparkline-point-line' + (p.isFuture ? ' weight-sparkline-point-line-future' : ''),
            style: { '--delay': animDelay + 's', opacity: p.isFuture ? 0.4 : 1 }
          });
        }),
        // Метки дней внизу (только ключевые точки на длинных периодах)
        points.map((p, i) => {
          const isFirst = i === 0;
          const isLast = i === points.length - 1;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          
          // На длинных графиках (>10 точек) показываем только ключевые метки дней
          const totalPoints = points.length;
          const showDayLabel = totalPoints <= 10 || 
            isFirst || isLast || p.isToday || 
            (!p.isFuture && i % 3 === 0) ||  // Каждая 3-я реальная
            (p.isFuture && i % 5 === 0);      // Каждая 5-я прогнозная
          
          if (!showDayLabel) return null;
          
          return React.createElement('text', {
            key: 'wday-' + i,
            x: p.x,
            y: height - 2,
            className: 'weight-sparkline-day-label' + 
              (p.isToday ? ' weight-sparkline-day-today' : '') +
              (p.isFuture ? ' weight-sparkline-day-forecast weight-sparkline-label-forecast' : ''),
            textAnchor: anchor
          }, p.dayNum);  // Всегда показываем реальную дату
        }).filter(Boolean),
        // Метки веса над точками (только ключевые точки на длинных периодах)
        points.map((p, i) => {
          const isFirst = i === 0;
          const isLast = i === points.length - 1;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          
          // Находим индекс последней реальной точки и первой прогнозной
          const lastRealIndex = points.findIndex(pt => pt.isFuture) - 1;
          const firstFutureIndex = points.findIndex(pt => pt.isFuture);
          const isLastReal = i === lastRealIndex || (lastRealIndex < 0 && isLast);
          const isFirstFuture = i === firstFutureIndex;
          
          // На длинных графиках (>10 точек) показываем только ключевые метки веса
          const totalPoints = points.length;
          const showWeightLabel = totalPoints <= 10 || 
            isFirst || isLast || p.isToday || isLastReal || isFirstFuture ||
            (!p.isFuture && i % 3 === 0) ||  // Каждая 3-я реальная
            (p.isFuture && i % 7 === 0);      // Каждая 7-я прогнозная
          
          if (!showWeightLabel) return null;
          
          return React.createElement('text', {
            key: 'wlabel-' + i,
            x: p.x,
            y: p.y - 8,
            className: 'weight-sparkline-weight-label' + 
              (p.isToday ? ' weight-sparkline-day-today' : '') +
              (p.isFuture ? ' weight-sparkline-day-forecast weight-sparkline-label-forecast' : ''),
            textAnchor: anchor
          }, p.weight.toFixed(1));
        }).filter(Boolean),
        // Точки с цветом по локальному тренду (анимация с задержкой)
        points.map((p, i) => {
          // Локальный тренд: сравниваем с предыдущей точкой
          const prevWeight = i > 0 ? points[i-1].weight : p.weight;
          const localTrend = p.weight - prevWeight;
          
          // Для прогнозных точек — серый цвет
          const dotColor = p.isFuture 
            ? forecastColor  // серый для прогноза
            : (localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#8b5cf6'));
          
          let dotClass = 'weight-sparkline-dot sparkline-dot';
          if (p.isToday) dotClass += ' weight-sparkline-dot-today sparkline-dot-pulse';
          if (p.hasWaterRetention) dotClass += ' weight-sparkline-dot-retention';
          if (p.isFuture) dotClass += ' weight-sparkline-dot-forecast';
          
          // Задержка анимации через CSS переменную
          const animDelay = 3 + i * 0.15;
          
          // Стили для точки
          const dotStyle = { 
            cursor: 'pointer', 
            fill: dotColor, 
            '--delay': animDelay + 's'
          };
          
          // Розовая обводка для дней с задержкой воды
          if (p.hasWaterRetention) {
            dotStyle.stroke = '#ec4899';
            dotStyle.strokeWidth = 2;
          }
          
          // Пунктирная обводка для прогнозных дней
          if (p.isFuture) {
            dotStyle.opacity = 0.6;
            dotStyle.strokeDasharray = '2 2';
            dotStyle.stroke = forecastColor;
            dotStyle.strokeWidth = 1.5;
          }
          
          // Tooltip с учётом прогноза и задержки воды
          let tooltipText = p.isFuture 
            ? '(прогноз): ~' + p.weight.toFixed(1) + ' кг'
            : p.dayNum + ': ' + p.weight + ' кг';
          if (!p.isFuture && localTrend !== 0) {
            tooltipText += ' (' + (localTrend > 0 ? '+' : '') + localTrend.toFixed(1) + ')';
          }
          if (p.hasWaterRetention) {
            tooltipText += ' 🌸 День ' + p.cycleDay + ' — возможна задержка воды';
          }
          
          return React.createElement('circle', {
            key: 'wdot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isFuture ? 3.5 : (p.isToday ? 5 : 4),
            className: dotClass,
            style: dotStyle,
            onClick: (e) => {
              e.stopPropagation();
              haptic('light');
              
              if (p.isFuture) {
                // Клик на прогнозную точку
                const lastRealWeight = realPoints.length > 0 ? realPoints[realPoints.length - 1].weight : p.weight;
                const forecastChange = p.weight - lastRealWeight;
                openExclusivePopup('sparkline', { 
                  type: 'weight-forecast', 
                  point: { 
                    ...p, 
                    forecastChange,
                    lastWeight: lastRealWeight
                  },
                  x: e.clientX, 
                  y: e.clientY 
                });
              } else {
                // Клик на реальную точку
                openExclusivePopup('sparkline', { 
                  type: 'weight', 
                  point: { ...p, localTrend },
                  x: e.clientX, 
                  y: e.clientY 
                });
              }
            }
          },
            React.createElement('title', null, tooltipText)
          );
        })
      );
    };
    
    // === ПРОГРЕСС-БАР К ЦЕЛИ (отдельный компонент для diary) ===
    const goalProgressBar = React.createElement('div', { className: 'goal-progress-card' },
      React.createElement('div', { 
        className: 'goal-progress-bar' + 
          (eatenKcal / (optimum || 1) >= 0.9 && eatenKcal / (optimum || 1) <= 1.1 ? ' pulse-perfect' : '')
      },
        // Вычисляем цвета на основе ratio
        (() => {
          const ratio = eatenKcal / (optimum || 1);
          
          // === ДИНАМИЧЕСКИЙ ГРАДИЕНТ ПО ВСЕЙ ПОЛОСЕ ===
          // Зоны: 0-80% жёлтый → 80-100% зелёный → 100-105% зелёный → 105-110% жёлтый → 110%+ красный
          
          const buildDynamicGradient = (currentRatio) => {
            if (currentRatio <= 0) return '#e5e7eb';
            
            const yellow = '#eab308';
            const yellowLight = '#fbbf24';
            const green = '#22c55e';
            const greenDark = '#16a34a';
            const red = '#ef4444';
            const redDark = '#dc2626';
            
            // Ключевые точки (в % от нормы)
            const zone80 = 0.80;
            const zone100 = 1.0;
            const zone105 = 1.05;
            const zone110 = 1.10;
            
            // Преобразуем точки зон в % от текущего заполнения
            const toFillPct = (zoneRatio) => Math.min((zoneRatio / currentRatio) * 100, 100);
            
            if (currentRatio <= zone80) {
              // Весь бар жёлтый (недобор)
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} 100%)`;
            } else if (currentRatio <= zone100) {
              // 0→80% жёлтый, 80%→100% зелёный
              const p80 = toFillPct(zone80);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 5}%, ${green} ${p80 + 5}%, ${greenDark} 100%)`;
            } else if (currentRatio <= zone105) {
              // 0→80% жёлтый, 80%→105% зелёный (всё ОК)
              const p80 = toFillPct(zone80);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 3}%, ${green} ${p80 + 3}%, ${greenDark} 100%)`;
            } else if (currentRatio <= zone110) {
              // 0→80% жёлтый, 80%→105% зелёный, 105%→110% жёлтый
              const p80 = toFillPct(zone80);
              const p105 = toFillPct(zone105);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 3}%, ${green} ${p80 + 3}%, ${green} ${p105 - 3}%, ${yellow} ${p105 + 3}%, ${yellow} 100%)`;
            } else {
              // > 110%: жёлтый → зелёный → жёлтый → красный
              const p80 = toFillPct(zone80);
              const p105 = toFillPct(zone105);
              const p110 = toFillPct(zone110);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 2}%, ${green} ${p80 + 2}%, ${green} ${p105 - 2}%, ${yellow} ${p105 + 2}%, ${yellow} ${p110 - 2}%, ${red} ${p110 + 2}%, ${redDark} 100%)`;
            }
          };
          
          const fillGradient = buildDynamicGradient(ratio);
          
          // Цвет части ПОСЛЕ НОРМЫ (goal-progress-over) — зависит от степени превышения
          let overColor, overGradient;
          if (ratio <= 1.05) {
            // 100-105% — зелёный (всё ОК)
            overColor = '#22c55e';
            overGradient = 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)';
          } else if (ratio <= 1.10) {
            // 105-110% — жёлтый (лёгкий перебор)
            overColor = '#eab308';
            overGradient = 'linear-gradient(90deg, #fbbf24 0%, #eab308 100%)';
          } else {
            // > 110% — красный (перебор)
            overColor = '#ef4444';
            overGradient = 'linear-gradient(90deg, #f87171 0%, #dc2626 100%)';
          }
          
          // Цвет заголовка — общий статус дня
          let titleColor, titleIcon, titleText;
          
          // === REFEED DAY — особый статус ===
          if (day.isRefeedDay && HEYS.Refeed) {
            const refeedZone = HEYS.Refeed.getRefeedZone(ratio);
            titleColor = refeedZone.color;
            titleIcon = refeedZone.icon;
            titleText = refeedZone.name;
          } else if (ratio < 0.80) {
            titleColor = '#eab308';
            titleIcon = '📉';
            titleText = 'Маловато';
          } else if (ratio <= 1.0) {
            titleColor = '#22c55e';
            titleIcon = '🎯';
            titleText = 'До цели';
          } else if (ratio <= 1.05) {
            titleColor = '#22c55e';
            titleIcon = '✅';
            titleText = 'Отлично';
          } else if (ratio <= 1.10) {
            titleColor = '#eab308';
            titleIcon = '⚠️';
            titleText = 'Чуть больше';
          } else {
            titleColor = '#ef4444';
            titleIcon = '🚨';
            titleText = 'Перебор';
          }
          
          return React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'goal-progress-header' },
              React.createElement('span', { 
                className: 'goal-progress-title',
                style: { color: titleColor }
              }, titleIcon + ' ' + titleText),
              React.createElement('span', { className: 'goal-progress-stats' },
                React.createElement('span', { 
                  className: 'goal-eaten',
                  style: { color: titleColor }
                }, r0(animatedKcal)),
                React.createElement('span', { className: 'goal-divider' }, '/'),
                React.createElement('span', { className: 'goal-target' }, displayOptimum),
                displayOptimum > optimum && React.createElement('span', {
                  className: 'goal-bonus-badge',
                  style: { marginLeft: '4px', fontSize: '10px', color: '#10b981' }
                }, '+' + (displayOptimum - optimum)),
                React.createElement('span', { className: 'goal-unit' }, 'ккал')
              )
            ),
            React.createElement('div', { className: 'goal-progress-track' + (eatenKcal > displayOptimum ? ' has-over' : '') + (displayOptimum > optimum ? ' has-debt' : '') },
              // Бонусная зона калорийного долга (справа от 100%, показывает расширенную зелёную зону)
              // Позиционируется от 100% до 100% + bonus% (где bonus = (displayOptimum - optimum) / optimum)
              displayOptimum > optimum && eatenKcal <= optimum && React.createElement('div', { 
                className: 'goal-bonus-zone',
                style: { 
                  // Бонусная зона начинается с правого края (100%) и расширяется вправо
                  // Но мы не можем показать >100%, поэтому показываем масштабированно:
                  // Если displayOptimum = 1.17 * optimum, то зона занимает последние 14.5% бара
                  // Формула: left = optimum / displayOptimum, width = (displayOptimum - optimum) / displayOptimum
                  left: (optimum / displayOptimum * 100) + '%',
                  width: ((displayOptimum - optimum) / displayOptimum * 100) + '%'
                },
                title: '💰 Бонусная зона: +' + (displayOptimum - optimum) + ' ккал из калорийного долга'
              }),
              // Маркер базовой нормы (пунктир) если есть долг и не переедание
              displayOptimum > optimum && eatenKcal <= displayOptimum && React.createElement('div', { 
                className: 'goal-base-marker',
                style: { left: (optimum / displayOptimum * 100) + '%' },
                title: 'Базовая норма: ' + optimum + ' ккал'
              }),
              React.createElement('div', { 
                className: 'goal-progress-fill' + (isAnimating ? ' no-transition' : ''),
                style: { 
                  // При наличии долга масштабируем прогресс относительно displayOptimum
                  width: displayOptimum > optimum 
                    ? Math.min((eatenKcal / displayOptimum * 100), 100) + '%'
                    : Math.min(animatedProgress, 100) + '%',
                  background: fillGradient
                }
              }),
              // Красная часть перебора (только если съели больше displayOptimum)
              eatenKcal > displayOptimum && React.createElement('div', { 
                className: 'goal-progress-over',
                style: { 
                  left: (displayOptimum / eatenKcal * 100) + '%',
                  width: ((eatenKcal - displayOptimum) / eatenKcal * 100) + '%',
                  background: overGradient
                }
              }),
              // Маркер текущего % (на конце всей заполненной полосы, анимируется вместе с ней)
              React.createElement('div', { 
                className: 'goal-current-marker' + (isAnimating ? ' no-transition' : ''),
                style: { 
                  // Позиция бейджа анимируется от 0 до 100% (независимо от ratio)
                  left: displayOptimum > optimum 
                    ? Math.min((eatenKcal / displayOptimum * 100), 100) + '%'
                    : animatedMarkerPos + '%'
                }
              },
                React.createElement('span', { className: 'goal-current-pct' }, 
                  // При долге показываем % от displayOptimum
                  displayOptimum > optimum 
                    ? Math.round((eatenKcal / displayOptimum) * 100) + '%'
                    : animatedRatioPct + '%'
                )
              ),
              React.createElement('div', { 
                className: 'goal-marker' + (eatenKcal > displayOptimum ? ' over' : ''),
                style: eatenKcal > displayOptimum ? { left: (displayOptimum / eatenKcal * 100) + '%' } : {}
              }),
              // Показываем остаток калорий на пустой части полосы ИЛИ внутри бара когда мало места ИЛИ перебор
              (() => {
                // Используем displayOptimum для debt-aware расчётов
                const effectiveTarget = displayOptimum || optimum;
                
                if (eatenKcal > effectiveTarget) {
                  // Перебор — показываем слева от маркера (перед чёрной линией)
                  const overKcal = Math.round(eatenKcal - effectiveTarget);
                  const markerPos = (effectiveTarget / eatenKcal * 100); // позиция маркера в %
                  return React.createElement('div', {
                    className: 'goal-remaining-inside goal-over-inside pulse-glow',
                    style: {
                      position: 'absolute',
                      right: (100 - markerPos + 2) + '%', // справа от маркера
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '3px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.95)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      zIndex: 10
                    }
                  }, 
                    React.createElement('span', { style: { fontSize: '10px', fontWeight: '500', color: '#dc2626' } }, 'Перебор'),
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '800', color: '#dc2626' } }, '+' + overKcal)
                  );
                }
                
                if (eatenKcal >= effectiveTarget) return null;
                
                // Округляем остаток (от displayOptimum)
                const effectiveRemaining = Math.round(effectiveTarget - eatenKcal);
                
                // Цвет зависит от того сколько осталось: много = зелёный, мало = красный, средне = жёлтый
                const effectiveRatio = eatenKcal / effectiveTarget;
                const remainingRatio = 1 - effectiveRatio; // 1 = много осталось, 0 = мало
                let remainingColor;
                if (remainingRatio > 0.5) {
                  remainingColor = '#16a34a';
                } else if (remainingRatio > 0.2) {
                  remainingColor = '#ca8a04';
                } else {
                  remainingColor = '#dc2626';
                }
                
                // Когда прогресс > 80%, перемещаем внутрь бара
                const effectiveProgress = displayOptimum > optimum 
                  ? (eatenKcal / effectiveTarget * 100)
                  : animatedProgress;
                const isInsideBar = effectiveProgress >= 80;
                
                if (isInsideBar) {
                  // Внутри заполненной части — справа, с пульсацией
                  return React.createElement('div', {
                    className: 'goal-remaining-inside pulse-glow',
                    style: {
                      position: 'absolute',
                      right: (100 - Math.min(effectiveProgress, 100) + 2) + '%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '3px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.95)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      zIndex: 10
                    }
                  }, 
                    React.createElement('span', { style: { fontSize: '10px', fontWeight: '500', color: '#6b7280' } }, 'Осталось всего'),
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '800', color: remainingColor } }, effectiveRemaining)
                  );
                } else {
                  // На пустой части полосы
                  return React.createElement('div', {
                    className: 'goal-remaining-inline',
                    style: {
                      position: 'absolute',
                      left: Math.max(effectiveProgress + 2, 5) + '%',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '14px',
                      fontWeight: '700',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }
                  }, 
                    React.createElement('span', { style: { fontSize: '12px', fontWeight: '500', color: '#6b7280' } }, 'Ещё'),
                    React.createElement('span', { style: { fontSize: '15px', fontWeight: '800', color: remainingColor } }, effectiveRemaining)
                  );
                }
              })()
            ),
            // Метки зон под полосой
            React.createElement('div', { className: 'goal-zone-labels' },
              React.createElement('span', { 
                className: 'goal-zone-label goal-zone-label-100',
                style: { left: (ratio > 1 ? (1.0 / ratio) * 100 : 100) + '%' }
              }, '100%')
            )
          );
        })()
      ),
      // Confetti overlay
      showConfetti && React.createElement('div', { className: 'confetti-container' },
        Array.from({length: 50}).map((_, i) => 
          React.createElement('div', { 
            key: i, 
            className: 'confetti',
            style: {
              left: Math.random() * 100 + '%',
              animationDelay: Math.random() * 0.5 + 's',
              backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]
            }
          })
        )
      )
    );
    
    // === ALERT: Orphan-продукты (данные из штампа вместо базы) ===
    // orphanVersion используется для триггера ререндера при изменении orphan
    const orphanCount = React.useMemo(() => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      void orphanVersion; // Зависимость для пересчёта
      return HEYS.orphanProducts?.count?.() || 0;
    }, [orphanVersion, day.meals]); // Пересчитываем при изменении orphanVersion или meals
    
    const orphanAlert = orphanCount > 0 && React.createElement('div', {
      className: 'orphan-alert compact-card',
      style: {
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        border: '1px solid #f59e0b',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }
    },
      React.createElement('span', { style: { fontSize: '20px' } }, '⚠️'),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { 
          style: { 
            fontWeight: 600, 
            color: '#92400e', 
            marginBottom: '4px',
            fontSize: '14px'
          } 
        }, `${orphanCount} продукт${orphanCount === 1 ? '' : orphanCount < 5 ? 'а' : 'ов'} не найден${orphanCount === 1 ? '' : 'о'} в базе`),
        React.createElement('div', { 
          style: { 
            color: '#a16207', 
            fontSize: '12px',
            lineHeight: '1.4'
          } 
        }, 'Калории считаются по сохранённым данным. Нажми чтобы увидеть список.'),
        // Список orphan-продуктов
        React.createElement('details', { 
          style: { marginTop: '8px' }
        },
          React.createElement('summary', { 
            style: { 
              cursor: 'pointer', 
              color: '#92400e',
              fontSize: '12px',
              fontWeight: 500
            } 
          }, 'Показать продукты'),
          React.createElement('ul', { 
            style: { 
              margin: '8px 0 0 0', 
              padding: '0 0 0 20px',
              fontSize: '12px',
              color: '#78350f'
            } 
          },
            (HEYS.orphanProducts?.getAll?.() || []).map((o, i) => 
              React.createElement('li', { key: o.name || i, style: { marginBottom: '2px' } },
                React.createElement('strong', null, o.name),
                ` — ${o.hasInlineData ? '✓ можно восстановить' : '⚠️ нет данных, нельзя восстановить!'}`,
                o.daysCount > 1 && ` (${o.daysCount} дней)`
              )
            )
          ),
          // Кнопка восстановления
          React.createElement('button', {
            style: {
              marginTop: '10px',
              padding: '8px 16px',
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            },
            onClick: async () => {
              const result = await HEYS.orphanProducts?.restore?.();
              if (result?.success) {
                alert(`✅ Восстановлено ${result.count} продуктов!\nОбновите страницу для применения.`);
                window.location.reload();
              } else {
                alert('⚠️ Не удалось восстановить — нет данных в штампах.');
              }
            }
          }, '🔧 Восстановить в базу')
        )
      )
    );
    
    // === БЛОК СТАТИСТИКА ===
    const statsBlock = React.createElement('div', { className: 'compact-stats compact-card' },
      React.createElement('div', { className: 'compact-card-header stats-header-with-badge' },
        React.createElement('span', null, '📊 СТАТИСТИКА'),
        React.createElement('span', { 
          className: 'ratio-status-badge' + (ratioStatus.emoji === '🔥' ? ' perfect' : ''),
          style: { color: ratioStatus.color }
        }, ratioStatus.emoji + ' ' + ratioStatus.text)
      ),
      // 4 карточки метрик внутри статистики
      React.createElement('div', { className: 'metrics-cards' },
        // Затраты (TDEE) — кликабельная для расшифровки
        React.createElement('div', { 
          className: 'metrics-card',
          style: { background: '#f8fafc', borderColor: '#e2e8f0', cursor: 'pointer' },
          title: 'Нажми для расшифровки затрат',
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openExclusivePopup('tdee', {
              x: rect.left + rect.width / 2,
              y: rect.bottom,
              data: {
                bmr,
                stepsK,
                householdK,
                train1k,
                train2k,
                train3k,
                tdee,
                weight,
                steps: day.steps || 0,
                householdMin: day.householdMin || 0,
                trainings: TR
              }
            });
            haptic('light');
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '⚡'),
          React.createElement('div', { className: 'metrics-value', style: { color: '#64748b' } }, tdee),
          React.createElement('div', { className: 'metrics-label' }, 'Затраты')
        ),
        // Цель — кликабельная для изменения дефицита
        React.createElement('div', { 
          className: 'metrics-card',
          style: { background: '#f0f9ff', borderColor: '#bae6fd', cursor: 'pointer' },
          onClick: openDeficitPicker,
          title: 'Нажми чтобы изменить цель дефицита'
        },
          React.createElement('div', { className: 'metrics-icon' }, '🎯'),
          React.createElement('div', { className: 'metrics-value', style: { color: displayOptimum > optimum ? '#10b981' : '#0369a1' } }, displayOptimum),
          React.createElement('div', { className: 'metrics-label' }, 'Цель (' + dayTargetDef + '%)' + (displayOptimum > optimum ? ' 💰Долг' : ''))
        ),
        // Съедено
        React.createElement('div', { 
          className: 'metrics-card' + (shakeEaten ? ' shake-excess' : ''),
          style: { background: eatenCol.bg, borderColor: eatenCol.border, cursor: 'pointer' },
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            openExclusivePopup('metric', {
              type: 'kcal',
              x: rect.left + rect.width / 2,
              y: rect.top,
              data: {
                eaten: eatenKcal,
                goal: displayOptimum,
                remaining: displayRemainingKcal,
                ratio: currentRatio,
                deficitPct: dayTargetDef
              }
            });
            haptic('light');
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '🍽️'),
          React.createElement('div', { className: 'metrics-value', style: { color: eatenCol.text } }, r0(eatenKcal)),
          React.createElement('div', { className: 'metrics-label' }, 'Съедено')
        ),
        // Осталось / Перебор (с учётом displayRemainingKcal)
        (() => {
          // Inline цвет для displayRemainingKcal
          const displayRemainCol = displayRemainingKcal > 100 
            ? { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' }
            : displayRemainingKcal >= 0 
              ? { bg: '#eab30820', text: '#eab308', border: '#eab30860' }
              : { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
          
          // 🆕 Refeed day микро-объяснение
          const isRefeedDay = day?.isRefeedDay === true;
          const refeedMeta = isRefeedDay && HEYS.Refeed?.getDayMeta ? HEYS.Refeed.getDayMeta(day, ratio) : null;
          
          return React.createElement('div', { 
            className: 'metrics-card' + (shakeOver && displayRemainingKcal < 0 ? ' shake-excess' : '') + (isRefeedDay ? ' metrics-card--refeed' : ''),
            style: { background: displayRemainCol.bg, borderColor: displayRemainCol.border },
            title: refeedMeta?.tooltip || ''
          },
            React.createElement('div', { className: 'metrics-icon' }, displayRemainingKcal >= 0 ? '🎯' : '🚫'),
            React.createElement('div', { className: 'metrics-value', style: { color: displayRemainCol.text } }, 
              displayRemainingKcal >= 0 ? displayRemainingKcal : Math.abs(displayRemainingKcal)
            ),
            React.createElement('div', { className: 'metrics-label' }, 
              displayRemainingKcal >= 0 ? 'Осталось' : 'Перебор'
            ),
            // 🆕 Refeed day hint
            isRefeedDay && React.createElement('div', { 
              className: 'metrics-refeed-hint',
              style: { fontSize: '9px', color: '#f97316', marginTop: '2px', textAlign: 'center' }
            }, '🔄 refeed +35%')
          );
        })()
      ),
      // Спарклайн калорий — карточка в стиле веса
      // Вычисляем статистику для badge здесь (до рендера)
      (() => {
        const rz = HEYS.ratioZones;
        const totalDaysWithData = sparklineData.filter(p => p.kcal > 0).length;
        
        // Считаем средний дефицит в процентах за период
        // Дефицит = (target - kcal) / target * 100
        const daysWithDeficit = sparklineData.filter(p => p.kcal > 0 && p.target > 0);
        // Считаем средний ratio (% от нормы) за период
        const ratios = daysWithDeficit.map(p => p.kcal / p.target);
        const avgRatio = ratios.length > 0 
          ? ratios.reduce((a, b) => a + b, 0) / ratios.length 
          : 0;
        const avgRatioPct = Math.round(avgRatio * 100);
        
        // Используем ratioZones для консистентности
        const zone = rz.getZone(avgRatio);
        const isSuccess = rz.isSuccess(avgRatio); // good или perfect
        const isPerfect = rz.isPerfect(avgRatio);
        
        // Цветовой класс: good/perfect = зелёный, low/over = жёлтый, crash/binge = красный
        const deficitBadgeClass = 'sparkline-goal-badge' + 
          (isSuccess ? '' : 
           (zone.id === 'low' || zone.id === 'over') ? ' goal-low' : ' goal-critical');
        
        // Текст и иконка для badge
        // Отклонение от 100%: +6% или −8%
        const deviation = avgRatioPct - 100;
        const deviationText = deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
        const deficitIcon = isPerfect ? '✓' : isSuccess ? '✓' : 
                            (zone.id === 'low' || zone.id === 'over') ? '~' : '!';
        const deficitText = 'в среднем ' + deficitIcon + ' ' + deviationText;
        
        // Tooltip с подробностями
        const tooltipText = 'Среднее выполнение нормы: ' + avgRatioPct + '% (' + zone.name + ')';
        
        return React.createElement('div', { className: 'kcal-sparkline-container' },
          React.createElement('div', { className: 'kcal-sparkline-header' },
            React.createElement('span', { className: 'kcal-sparkline-title' }, '📊 Калории'),
            // Average Deficit Badge + Period Pills
            React.createElement('div', { className: 'kcal-header-right' },
              // Badge "средний дефицит в %" (слева от кнопок)
              totalDaysWithData >= 3 && React.createElement('div', {
                className: deficitBadgeClass + ' kcal-goal-badge-inline',
                title: tooltipText
              }, 
                deficitText
              ),
              // Кнопки выбора периода
            React.createElement('div', { className: 'kcal-period-pills' },
              [7, 14, 30].map(period => 
                React.createElement('button', {
                  key: period,
                  className: 'kcal-period-pill' + (chartPeriod === period ? ' active' : ''),
                  onClick: () => handlePeriodChange(period)
                }, period + 'д')
              )
            )
          )
        ),
        React.createElement('div', { 
          className: chartTransitioning ? 'sparkline-transitioning' : '',
          style: { transition: 'opacity 0.15s ease' }
        },
          renderSparkline(sparklineData, optimum)
        )
      );
      })(),
      // === CALORIC DEBT CARD — Карточка калорийного долга ===
      caloricDebt && caloricDebt.hasDebt && (() => {
        const { debt, dailyBoost, adjustedOptimum, needsRefeed, dayBreakdown, totalBalance, consecutiveDeficitDays } = caloricDebt;
        
        // Цвет и иконка по уровню долга
        const getDebtStyle = () => {
          if (needsRefeed) return { icon: '🔄', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', label: 'Refeed рекомендуется' };
          if (debt > 700) return { icon: '⚠️', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)', label: 'Значительный долг' };
          if (debt > 400) return { icon: '📊', color: '#eab308', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.2)', label: 'Накопился долг' };
          return { icon: '📈', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.2)', label: 'Небольшой долг' };
        };
        const style = getDebtStyle();
        
        // Форматирование дельты
        const formatDelta = (d) => {
          if (d >= 0) return '+' + d;
          return String(d);
        };
        
        return React.createElement('div', {
          className: 'caloric-debt-card',
          style: { 
            background: style.bg, 
            borderColor: style.border,
            '--debt-color': style.color
          },
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setDebtPopup({
              x: rect.left + rect.width / 2,
              y: rect.bottom + 8,
              data: caloricDebt
            });
          }
        },
          // Header: иконка + заголовок + badge
          React.createElement('div', { className: 'caloric-debt-header' },
            React.createElement('span', { className: 'caloric-debt-icon' }, style.icon),
            React.createElement('span', { className: 'caloric-debt-title' }, 'Баланс за ' + dayBreakdown.length + ' дня'),
            debt > 0 && React.createElement('span', { 
              className: 'caloric-debt-badge',
              style: { backgroundColor: style.color }
            }, '-' + debt + ' ккал')
          ),
          // Breakdown по дням — горизонтальная лента
          React.createElement('div', { className: 'caloric-debt-days' },
            dayBreakdown.map((d, i) => {
              const isPositive = d.delta >= 0;
              const isNegative = d.delta < 0;
              const isTraining = d.hasTraining;
              
              return React.createElement('div', {
                key: d.date,
                className: 'caloric-debt-day' + 
                  (isPositive ? ' positive' : '') + 
                  (isNegative ? ' negative' : '') +
                  (isTraining ? ' training' : '')
              },
                // День
                React.createElement('span', { className: 'caloric-debt-day-num' }, d.dayNum),
                // Дельта
                React.createElement('span', { 
                  className: 'caloric-debt-day-delta',
                  style: { color: isPositive ? '#22c55e' : '#ef4444' }
                }, formatDelta(d.delta)),
                // Иконка тренировки
                isTraining && React.createElement('span', { className: 'caloric-debt-day-train' }, '🏋️')
              );
            })
          ),
          // Рекомендация
          dailyBoost > 0 && React.createElement('div', { className: 'caloric-debt-recommendation' },
            React.createElement('span', { className: 'caloric-debt-rec-icon' }, needsRefeed ? '🍽️' : '💡'),
            React.createElement('span', { className: 'caloric-debt-rec-text' },
              needsRefeed 
                ? 'Refeed день: можно ' + adjustedOptimum + ' ккал (+' + dailyBoost + ')'
                : 'Сегодня можно ' + adjustedOptimum + ' ккал (+' + dailyBoost + ')'
            )
          ),
          // Пояснение для пользователя
          React.createElement('div', { className: 'caloric-debt-explanation' },
            React.createElement('span', { className: 'caloric-debt-explanation-text' },
              debt > 400 
                ? '💡 Ты недоел за последние дни. Бонусные калории помогут восстановить энергию без ущерба прогрессу.'
                : '💡 Небольшой недобор за последние дни. Можешь съесть чуть больше — это не сорвёт результат.'
            )
          ),
          // Предупреждение о тренировках
          consecutiveDeficitDays >= 3 && React.createElement('div', { className: 'caloric-debt-warning' },
            React.createElement('span', null, '⚠️ ' + consecutiveDeficitDays + ' дней подряд в сильном дефиците')
          )
        );
      })(),
      // Popup с деталями при клике на точку — НОВЫЙ КОНСИСТЕНТНЫЙ ДИЗАЙН
      sparklinePopup && sparklinePopup.type === 'kcal' && (() => {
        const point = sparklinePopup.point;
        const ratio = point.kcal / point.target;
        const pct = Math.round(ratio * 100);
        
        // Цвет по ratio
        const getColor = (r) => {
          if (r <= 0.5) return '#ef4444';
          if (r < 0.75) return '#eab308';
          if (r < 0.9) return '#22c55e';
          if (r < 1.1) return '#10b981';
          if (r < 1.3) return '#eab308';
          return '#ef4444';
        };
        const color = getColor(ratio);
        
        // Позиционирование с защитой от выхода за экран
        const popupW = 260;
        const popupH = 280;
        const pos = getSmartPopupPosition(
          sparklinePopup.x, 
          sparklinePopup.y, 
          popupW, 
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        
        // Вчера
        const prevPoint = sparklineData[sparklineData.findIndex(p => p.date === point.date) - 1];
        const diff = prevPoint ? point.kcal - prevPoint.kcal : null;
        
        // Gradient для progress
        const getGradient = (r) => {
          if (r < 0.5) return 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)';
          if (r < 0.75) return 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)';
          if (r < 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
          if (r < 1.15) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
          return 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)';
        };
        
        // Swipe
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const deltaY = e.changedTouches[0].clientY - startY;
          if (deltaY > 50) { 
            setSparklinePopup(null); 
            haptic('light'); 
          }
        };
        
        return React.createElement('div', {
          className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
          role: 'dialog',
          'aria-label': (point.isToday ? 'Сегодня' : point.dayNum) + ' — ' + pct + '% от нормы',
          'aria-modal': 'true',
          style: { 
            position: 'fixed',
            left: left + 'px', 
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: color }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header: дата + процент
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' },
                (() => {
                  if (point.isToday) return '📅 Сегодня';
                  const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                  const wd = weekDays[point.dayOfWeek] || '';
                  return '📅 ' + point.dayNum + ' ' + wd;
                })()
              ),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: color }
              }, pct + '%')
            ),
            // Progress bar
            React.createElement('div', { className: 'sparkline-popup-progress' },
              React.createElement('div', { 
                className: 'sparkline-popup-progress-fill',
                style: { 
                  width: Math.min(100, pct) + '%',
                  background: getGradient(ratio)
                }
              })
            ),
            // Value
            React.createElement('div', { className: 'sparkline-popup-value-row' },
              React.createElement('span', { style: { color: color, fontWeight: 700, fontSize: '15px' } }, 
                Math.round(point.kcal) + ' ккал'
              ),
              React.createElement('span', { className: 'sparkline-popup-target' }, 
                ' / ' + point.target + ' ккал'
              ),
              // Сравнение со вчера
              diff !== null && React.createElement('span', { 
                className: 'sparkline-popup-compare' + (diff > 0 ? ' up' : diff < 0 ? ' down' : ''),
              }, diff > 0 ? '↑' : diff < 0 ? '↓' : '=', ' ', Math.abs(Math.round(diff)))
            ),
            // Теги: сон, тренировка, шаги, оценка
            (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 good'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2',
                  style: { 
                    backgroundColor: point.dayScore <= 3 ? '#fee2e2' : 
                                     point.dayScore <= 5 ? '#fef3c7' : 
                                     point.dayScore <= 7 ? '#fef3c7' : '#dcfce7',
                    color: point.dayScore <= 3 ? '#dc2626' : 
                           point.dayScore <= 5 ? '#d97706' : 
                           point.dayScore <= 7 ? '#d97706' : '#16a34a'
                  }
                }, '⭐ ' + point.dayScore)
              ),
            // Кнопка перехода
            !point.isToday && React.createElement('button', {
              className: 'sparkline-popup-btn-v2',
              onClick: () => {
                setSparklinePopup(null);
                setDate(point.date);
                haptic('light');
              }
            }, '→ Перейти к дню'),
            // Close
            React.createElement('button', {
              className: 'sparkline-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setSparklinePopup(null)
            }, '✕')
          ),
          // Стрелка
          React.createElement('div', { 
            className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Popup для идеального дня 🔥 — ЗОЛОТОЙ СТИЛЬ
      sparklinePopup && sparklinePopup.type === 'perfect' && (() => {
        const point = sparklinePopup.point;
        const pct = Math.round((point.kcal / point.target) * 100);
        
        // Позиционирование
        const popupW = 260;
        let left = sparklinePopup.x - popupW / 2;
        let arrowPos = 'center';
        if (left < 10) { left = 10; arrowPos = 'left'; }
        if (left + popupW > window.innerWidth - 10) { left = window.innerWidth - popupW - 10; arrowPos = 'right'; }
        
        // Swipe
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const deltaY = e.changedTouches[0].clientY - startY;
          if (deltaY > 50) { setSparklinePopup(null); haptic('light'); }
        };
        
        return React.createElement('div', {
          className: 'sparkline-popup sparkline-popup-v2 sparkline-popup-perfect-v2',
          role: 'dialog',
          'aria-label': 'Идеальный день — ' + pct + '% от нормы',
          'aria-modal': 'true',
          style: { 
            position: 'fixed',
            left: left + 'px', 
            top: (sparklinePopup.y + 15) + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Золотая полоса
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header: emoji + дата
            React.createElement('div', { className: 'sparkline-popup-header-v2 perfect' },
              React.createElement('span', { className: 'sparkline-popup-perfect-title' }, '🔥 Идеальный день!'),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: '#f59e0b' }
              }, pct + '%')
            ),
            // Progress bar (золотой)
            React.createElement('div', { className: 'sparkline-popup-progress' },
              React.createElement('div', { 
                className: 'sparkline-popup-progress-fill',
                style: { 
                  width: Math.min(100, pct) + '%',
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                }
              })
            ),
            // Value
            React.createElement('div', { className: 'sparkline-popup-value-row' },
              React.createElement('span', { style: { color: '#f59e0b', fontWeight: 700, fontSize: '15px' } }, 
                Math.round(point.kcal) + ' ккал'
              ),
              React.createElement('span', { className: 'sparkline-popup-target' }, 
                ' / ' + point.target + ' ккал'
              )
            ),
            // Motivation
            React.createElement('div', { className: 'sparkline-popup-motivation-v2' },
              '✨ Попал точно в цель! Так держать!'
            ),
            // Теги (золотой стиль)
            (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2 perfect' },
                point.sleepHours > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '⭐ ' + point.dayScore)
              ),
            // Кнопка перехода
            !point.isToday && React.createElement('button', {
              className: 'sparkline-popup-btn-v2 perfect',
              onClick: () => {
                setSparklinePopup(null);
                setDate(point.date);
                haptic('light');
              }
            }, '→ Перейти к дню'),
            // Close
            React.createElement('button', {
              className: 'sparkline-popup-close perfect',
              'aria-label': 'Закрыть',
              onClick: () => setSparklinePopup(null)
            }, '✕')
          ),
          // Стрелка (золотая)
          React.createElement('div', { 
            className: 'sparkline-popup-arrow perfect' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Popup для бейджей БЖУ
      macroBadgePopup && (() => {
        const popupWidth = 220;
        const popupHeight = 320; // Примерная высота popup
        
        // Используем умное позиционирование
        const pos = getSmartPopupPosition(
          macroBadgePopup.x, 
          macroBadgePopup.y, 
          popupWidth, 
          popupHeight,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        
        // 📊 Сравнение со вчера
        const getYesterdayCompare = () => {
          try {
            const macroKey = macroBadgePopup.macro === 'Белки' ? 'prot' : 
                             macroBadgePopup.macro === 'Жиры' ? 'fat' : 'carbs';
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().slice(0, 10);
            const dayData = U.lsGet('heys_dayv2_' + dateStr);
            if (!dayData || !dayData.meals) return null;
            
            let macroSum = 0;
            dayData.meals.forEach(meal => {
              (meal.items || []).forEach(item => {
                const nameKey = (item.name || '').trim().toLowerCase();
                const prod = (nameKey && pIndex.byName.get(nameKey)) || (item.product_id != null ? pIndex.byId.get(String(item.product_id).toLowerCase()) : null);
                const src = prod || item; // fallback to inline data
                const g = item.grams || 100;
                if (macroKey === 'prot') macroSum += (+src.protein100 || 0) * g / 100;
                else if (macroKey === 'fat') macroSum += ((+src.badFat100 || 0) + (+src.goodFat100 || 0) + (+src.trans100 || 0)) * g / 100;
                else macroSum += ((+src.simple100 || 0) + (+src.complex100 || 0)) * g / 100;
              });
            });
            
            const diff = macroBadgePopup.value - macroSum;
            if (Math.abs(diff) < 5) return { icon: '↔️', text: 'как вчера', diff: 0 };
            if (diff > 0) return { icon: '📈', text: '+' + Math.round(diff) + 'г', diff: diff };
            return { icon: '📉', text: Math.round(diff) + 'г', diff: diff };
          } catch (e) { return null; }
        };
        const yesterdayCompare = getYesterdayCompare();
        
        // Рекомендация продукта если недобор
        const getRec = () => {
          if (macroBadgePopup.ratio >= 0.9) return null;
          const deficit = macroBadgePopup.norm - macroBadgePopup.value;
          const macro = macroBadgePopup.macro;
          if (macro === 'Белки' && deficit > 20) {
            return { icon: '🍗', text: 'Добавь курицу 100г', amount: '+25г' };
          } else if (macro === 'Белки' && deficit > 10) {
            return { icon: '🥚', text: 'Добавь яйцо', amount: '+12г' };
          } else if (macro === 'Жиры' && deficit > 10) {
            return { icon: '🥑', text: 'Добавь авокадо', amount: '+15г' };
          } else if (macro === 'Углеводы' && deficit > 20) {
            return { icon: '🍌', text: 'Добавь банан', amount: '+25г' };
          }
          return null;
        };
        const rec = getRec();
        
        // ⏰ Динамическое сообщение по времени
        const getTimeMsg = () => {
          const hour = new Date().getHours();
          const ratio = macroBadgePopup.ratio;
          if (ratio >= 0.9 && ratio <= 1.1) return { icon: '✅', text: 'В норме!' };
          if (ratio > 1.1) return { icon: '😅', text: 'Немного перебор' };
          // Недобор
          if (hour < 12) return { icon: '🌅', text: 'Ещё целый день впереди!' };
          if (hour < 17) return { icon: '☀️', text: 'Время ещё есть' };
          if (hour < 20) return { icon: '🌆', text: 'Осталось немного времени' };
          return { icon: '🌙', text: 'День почти закончен' };
        };
        const timeMsg = getTimeMsg();
        
        // 🏆 Streak макроса (последние 7 дней)
        const getMacroStreak = () => {
          try {
            const macroKey = macroBadgePopup.macro === 'Белки' ? 'prot' : 
                             macroBadgePopup.macro === 'Жиры' ? 'fat' : 'carbs';
            let streak = 0;
            const today = new Date();
            for (let i = 1; i <= 7; i++) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().slice(0, 10);
              const dayData = U.lsGet('heys_dayv2_' + dateStr);
              if (!dayData || !dayData.meals) break;
              
              // Вычислим сумму макроса за день
              let macroSum = 0;
              dayData.meals.forEach(meal => {
                (meal.items || []).forEach(item => {
                  const nameKey = (item.name || '').trim().toLowerCase();
                  const prod = (nameKey && pIndex.byName.get(nameKey)) || (item.product_id != null ? pIndex.byId.get(String(item.product_id).toLowerCase()) : null);
                  const src = prod || item; // fallback to inline data
                  const g = item.grams || 100;
                  if (macroKey === 'prot') macroSum += (+src.protein100 || 0) * g / 100;
                  else if (macroKey === 'fat') macroSum += ((+src.badFat100 || 0) + (+src.goodFat100 || 0) + (+src.trans100 || 0)) * g / 100;
                  else macroSum += ((+src.simple100 || 0) + (+src.complex100 || 0)) * g / 100;
                });
              });
              
              // Норма макроса
              const normKey = macroKey === 'prot' ? 'prot' : macroKey;
              const norm = normAbs[normKey] || 100;
              const dayRatio = macroSum / norm;
              
              if (dayRatio >= 0.8 && dayRatio <= 1.2) streak++;
              else break;
            }
            return streak;
          } catch (e) { return 0; }
        };
        const macroStreak = getMacroStreak();
        
        // 📊 Мини-sparkline за 7 дней
        const getMiniSparkline = () => {
          try {
            const macroKey = macroBadgePopup.macro === 'Белки' ? 'prot' : 
                             macroBadgePopup.macro === 'Жиры' ? 'fat' : 'carbs';
            const data = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().slice(0, 10);
              const dayData = U.lsGet('heys_dayv2_' + dateStr);
              if (!dayData || !dayData.meals) { data.push(0); continue; }
              
              let macroSum = 0;
              dayData.meals.forEach(meal => {
                (meal.items || []).forEach(item => {
                  const nameKey = (item.name || '').trim().toLowerCase();
                  const prod = (nameKey && pIndex.byName.get(nameKey)) || (item.product_id != null ? pIndex.byId.get(String(item.product_id).toLowerCase()) : null);
                  const src = prod || item; // fallback to inline data
                  const g = item.grams || 100;
                  if (macroKey === 'prot') macroSum += (+src.protein100 || 0) * g / 100;
                  else if (macroKey === 'fat') macroSum += ((+src.badFat100 || 0) + (+src.goodFat100 || 0) + (+src.trans100 || 0)) * g / 100;
                  else macroSum += ((+src.simple100 || 0) + (+src.complex100 || 0)) * g / 100;
                });
              });
              data.push(macroSum);
            }
            // Сегодня
            data[6] = macroBadgePopup.value;
            return data;
          } catch (e) { return [0,0,0,0,0,0,0]; }
        };
        const sparkData = getMiniSparkline();
        const sparkMax = Math.max(...sparkData, macroBadgePopup.norm) || 100;
        
        // Градиент для прогресс-бара
        const getProgressGradient = (ratio) => {
          if (ratio <= 0.5) return 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)';
          if (ratio <= 0.8) return 'linear-gradient(90deg, #f97316 0%, #eab308 100%)';
          if (ratio <= 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
          if (ratio <= 1.2) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
          return 'linear-gradient(90deg, #f97316 0%, #ef4444 100%)';
        };
        
        // Swipe handler
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const diff = e.changedTouches[0].clientY - startY;
          if (diff > 50) setMacroBadgePopup(null); // swipe down
        };
        
        return React.createElement('div', {
          className: 'macro-badge-popup' + (showAbove ? ' show-above' : ''),
          role: 'dialog',
          'aria-label': macroBadgePopup.macro + ' — ' + Math.round(macroBadgePopup.ratio * 100) + '% от нормы',
          'aria-modal': 'true',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: top + 'px',
            width: popupWidth + 'px'
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса сверху
          React.createElement('div', { 
            className: 'macro-badge-popup-stripe',
            style: { background: macroBadgePopup.color }
          }),
          // Контент
          React.createElement('div', { className: 'macro-badge-popup-content' },
            // Swipe indicator (mobile)
            React.createElement('div', { className: 'macro-badge-popup-swipe' }),
            // Header: макрос + процент
            React.createElement('div', { className: 'macro-badge-popup-header' },
              React.createElement('span', { className: 'macro-badge-popup-title' }, macroBadgePopup.macro),
              React.createElement('span', { 
                className: 'macro-badge-popup-pct macro-badge-popup-animated',
                style: { color: macroBadgePopup.color }
              }, Math.round(macroBadgePopup.ratio * 100) + '%')
            ),
            // 📊 Мини-sparkline
            React.createElement('div', { className: 'macro-badge-popup-sparkline' },
              React.createElement('svg', { viewBox: '0 0 70 20', className: 'macro-badge-popup-spark-svg' },
                // Линия нормы
                React.createElement('line', {
                  x1: 0, y1: 20 - (macroBadgePopup.norm / sparkMax * 18),
                  x2: 70, y2: 20 - (macroBadgePopup.norm / sparkMax * 18),
                  stroke: '#e2e8f0',
                  strokeWidth: 1,
                  strokeDasharray: '2,2'
                }),
                // Точки и линии
                sparkData.map((val, i) => {
                  const x = i * 10 + 5;
                  const y = 20 - (val / sparkMax * 18);
                  const nextVal = sparkData[i + 1];
                  const isToday = i === 6;
                  return React.createElement('g', { key: i },
                    // Линия к следующей точке
                    nextVal !== undefined && React.createElement('line', {
                      x1: x, y1: y,
                      x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                      stroke: macroBadgePopup.color,
                      strokeWidth: 1.5,
                      strokeOpacity: 0.6
                    }),
                    // Точка
                    React.createElement('circle', {
                      cx: x, cy: y,
                      r: isToday ? 3 : 2,
                      fill: isToday ? macroBadgePopup.color : '#94a3b8',
                      className: isToday ? 'macro-badge-popup-spark-today' : ''
                    })
                  );
                })
              ),
              React.createElement('span', { className: 'macro-badge-popup-spark-label' }, '7 дней')
            ),
            // 🎨 Прогресс-бар с градиентом
            React.createElement('div', { className: 'macro-badge-popup-progress' },
              React.createElement('div', { 
                className: 'macro-badge-popup-progress-fill macro-badge-popup-animated-bar',
                style: { 
                  width: Math.min(100, macroBadgePopup.ratio * 100) + '%',
                  background: getProgressGradient(macroBadgePopup.ratio)
                }
              })
            ),
            // 💫 Значение с анимацией + сравнение со вчера
            React.createElement('div', { className: 'macro-badge-popup-value' },
              React.createElement('span', { 
                className: 'macro-badge-popup-animated',
                style: { color: macroBadgePopup.color, fontWeight: 700 } 
              }, macroBadgePopup.value + 'г'),
              React.createElement('span', { className: 'macro-badge-popup-norm' }, 
                ' / ' + macroBadgePopup.norm + 'г'
              ),
              // 📊 Сравнение со вчера
              yesterdayCompare && React.createElement('span', { 
                className: 'macro-badge-popup-compare' + (yesterdayCompare.diff > 0 ? ' up' : yesterdayCompare.diff < 0 ? ' down' : ''),
                'aria-label': 'Сравнение со вчера'
              }, yesterdayCompare.icon + ' ' + yesterdayCompare.text)
            ),
            // ⏰ Динамическое сообщение по времени
            React.createElement('div', { className: 'macro-badge-popup-time-msg' },
              React.createElement('span', null, timeMsg.icon),
              React.createElement('span', null, ' ' + timeMsg.text)
            ),
            // 🏆 Streak макроса
            macroStreak > 0 && React.createElement('div', { className: 'macro-badge-popup-streak' },
              React.createElement('span', { className: 'macro-badge-popup-streak-icon' }, '🏆'),
              React.createElement('span', null, macroStreak + ' ' + (macroStreak === 1 ? 'день' : macroStreak < 5 ? 'дня' : 'дней') + ' подряд в норме!')
            ),
            // Описание (все бейджи)
            macroBadgePopup.allBadges.length > 0 && React.createElement('div', { className: 'macro-badge-popup-desc' },
              macroBadgePopup.allBadges.map((b, i) => 
                React.createElement('div', { key: i, className: 'macro-badge-popup-item' },
                  React.createElement('span', { className: 'macro-badge-popup-emoji' }, b.emoji),
                  React.createElement('span', null, b.desc)
                )
              )
            ),
            // Рекомендация продукта
            rec && React.createElement('div', { className: 'macro-badge-popup-rec' },
              React.createElement('span', { className: 'macro-badge-popup-rec-icon' }, rec.icon),
              React.createElement('span', { className: 'macro-badge-popup-rec-text' },
                rec.text + ' ',
                React.createElement('b', null, rec.amount)
              )
            ),
            // Закрыть
            React.createElement('button', {
              className: 'macro-badge-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setMacroBadgePopup(null)
            }, '✕')
          ),
          // Стрелка-указатель
          React.createElement('div', { 
            className: 'macro-badge-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // === TDEE POPUP (расшифровка затрат) ===
      tdeePopup && (() => {
        const d = tdeePopup.data;
        const popupW = 300;
        const popupH = 400;
        const pos = getSmartPopupPosition(
          tdeePopup.x, 
          tdeePopup.y, 
          popupW, 
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        
        // Подсчёт всех активностей
        const trainTotal = (d.train1k || 0) + (d.train2k || 0) + (d.train3k || 0);
        const actTotal = trainTotal + (d.stepsK || 0) + (d.householdK || 0);
        
        // Проценты для визуализации
        const bmrPct = d.tdee > 0 ? Math.round((d.bmr / d.tdee) * 100) : 0;
        const actPct = 100 - bmrPct;
        
        // Тренировки — только те, что > 0
        const trainMinutes = (idx) => {
          const t = d.trainings && d.trainings[idx];
          if (!t || !t.z) return 0;
          return t.z.reduce((sum, m) => sum + (+m || 0), 0);
        };
        
        // Swipe handler
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const diffY = e.changedTouches[0].clientY - startY;
          if (diffY > 50) setTdeePopup(null);
        };
        
        return React.createElement('div', {
          className: 'tdee-popup sparkline-popup sparkline-popup-v2',
          role: 'dialog',
          'aria-label': 'Расшифровка затрат: ' + d.tdee + ' ккал',
          'aria-modal': 'true',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: 'linear-gradient(90deg, #64748b 0%, #94a3b8 100%)' }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' }, '⚡ Затраты энергии'),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: '#475569', fontSize: '18px', fontWeight: 800 }
              }, d.tdee + ' ккал')
            ),
            // Визуальная полоса BMR + Activity
            React.createElement('div', { className: 'tdee-bar-container' },
              React.createElement('div', { className: 'tdee-bar' },
                React.createElement('div', { 
                  className: 'tdee-bar-bmr',
                  style: { width: bmrPct + '%' }
                }),
                React.createElement('div', { 
                  className: 'tdee-bar-activity',
                  style: { width: actPct + '%' }
                })
              ),
              React.createElement('div', { className: 'tdee-bar-labels' },
                React.createElement('span', null, '🧬 Базовый: ' + bmrPct + '%'),
                React.createElement('span', null, '🏃 Активность: ' + actPct + '%')
              )
            ),
            // Детали — строки
            React.createElement('div', { className: 'tdee-details' },
              // BMR
              React.createElement('div', { className: 'tdee-row tdee-row-main' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🧬'),
                React.createElement('span', { className: 'tdee-row-label' }, 'Базовый метаболизм (BMR)'),
                React.createElement('span', { className: 'tdee-row-value' }, d.bmr + ' ккал')
              ),
              React.createElement('div', { className: 'tdee-row-hint' }, 
                'Формула Миффлина-Сан Жеора, вес ' + d.weight + ' кг'
              ),
              // Разделитель
              React.createElement('div', { className: 'tdee-divider' }),
              // Шаги
              d.stepsK > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '👟'),
                React.createElement('span', { className: 'tdee-row-label' }, 
                  'Шаги (' + (d.steps || 0).toLocaleString() + ')'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.stepsK + ' ккал')
              ),
              // Бытовая активность
              d.householdK > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏠'),
                React.createElement('span', { className: 'tdee-row-label' }, 
                  'Быт. активность (' + (d.householdMin || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.householdK + ' ккал')
              ),
              // Тренировка 1
              d.train1k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' }, 
                  'Тренировка 1 (' + trainMinutes(0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train1k + ' ккал')
              ),
              // Тренировка 2
              d.train2k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' }, 
                  'Тренировка 2 (' + trainMinutes(1) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train2k + ' ккал')
              ),
              // Тренировка 3
              d.train3k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' }, 
                  'Тренировка 3 (' + trainMinutes(2) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train3k + ' ккал')
              ),
              // Если нет активности
              actTotal === 0 && React.createElement('div', { className: 'tdee-row tdee-row-empty' },
                React.createElement('span', { className: 'tdee-row-icon' }, '💤'),
                React.createElement('span', { className: 'tdee-row-label' }, 'Нет активности за сегодня'),
                React.createElement('span', { className: 'tdee-row-value' }, '+0 ккал')
              ),
              // Итого
              React.createElement('div', { className: 'tdee-divider' }),
              React.createElement('div', { className: 'tdee-row tdee-row-total' },
                React.createElement('span', { className: 'tdee-row-icon' }, '⚡'),
                React.createElement('span', { className: 'tdee-row-label' }, 'ИТОГО затраты'),
                React.createElement('span', { className: 'tdee-row-value' }, d.tdee + ' ккал')
              )
            ),
            // Close button
            React.createElement('button', {
              className: 'sparkline-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setTdeePopup(null)
            }, '✕')
          ),
          // Стрелка
          React.createElement('div', { 
            className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // === WEEK NORM POPUP (детали недели X/Y в норме) ===
      weekNormPopup && (() => {
        const popupW = 260;
        const popupH = 280;
        const pos = getSmartPopupPosition(
          weekNormPopup.x, 
          weekNormPopup.y, 
          popupW, 
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top } = pos;
        const rz = HEYS.ratioZones;
        
        return React.createElement('div', {
          className: 'week-norm-popup sparkline-popup sparkline-popup-v2',
          role: 'dialog',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation()
        },
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)' }
          }),
          React.createElement('div', { className: 'sparkline-popup-content' },
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' }, '📊 Неделя'),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: '#16a34a', fontSize: '16px', fontWeight: 700 }
              }, weekNormPopup.inNorm + '/' + weekNormPopup.withData + ' в норме')
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' } },
              weekNormPopup.days.filter(d => !d.isFuture).map((d, i) =>
                React.createElement('div', { 
                  key: i,
                  style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    background: d.isToday ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: d.isToday ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'
                  }
                },
                  React.createElement('span', { 
                    style: { 
                      fontWeight: d.isToday ? 700 : 500,
                      color: d.isWeekend ? '#ef4444' : (d.isToday ? '#3b82f6' : '#475569')
                    }
                  }, d.name + (d.isToday ? ' (сегодня)' : '')),
                  d.status === 'empty' || d.status === 'in-progress' 
                    ? React.createElement('span', { style: { color: '#94a3b8', fontSize: '12px' } }, 
                        d.status === 'in-progress' ? '⏳ в процессе' : '— нет данных')
                    : React.createElement('span', { 
                        style: { 
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#fff',
                          background: rz ? rz.getGradientColor(d.ratio, 0.9) : '#22c55e'
                        }
                      }, Math.round(d.ratio * 100) + '%')
                )
              )
            ),
            React.createElement('button', {
              className: 'sparkline-popup-close',
              onClick: () => setWeekNormPopup(null)
            }, '✕')
          )
        );
      })(),
      // === DEBT POPUP (детали калорийного долга) ===
      debtPopup && (() => {
        const { debt, rawDebt, dailyBoost, adjustedOptimum, needsRefeed, refeedBoost, 
                dayBreakdown, totalBalance, consecutiveDeficitDays, daysAnalyzed } = debtPopup.data;
        
        const popupW = 300;
        const popupH = 360;
        const pos = getSmartPopupPosition(
          debtPopup.x, 
          debtPopup.y, 
          popupW, 
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top } = pos;
        
        // Определяем цвет полосы
        const getStripeColor = () => {
          if (needsRefeed) return 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
          if (debt > 700) return 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
          if (debt > 400) return 'linear-gradient(90deg, #eab308 0%, #ca8a04 100%)';
          return 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)';
        };
        
        return React.createElement('div', {
          className: 'debt-popup sparkline-popup sparkline-popup-v2',
          role: 'dialog',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation()
        },
          // Цветная полоса сверху
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: getStripeColor() }
          }),
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Заголовок
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' }, '📊 Баланс за ' + daysAnalyzed + ' дня'),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { 
                  color: totalBalance >= 0 ? '#22c55e' : '#ef4444', 
                  fontSize: '16px', 
                  fontWeight: 700 
                }
              }, (totalBalance >= 0 ? '+' : '') + totalBalance + ' ккал')
            ),
            // Детали по дням
            React.createElement('div', { 
              style: { 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '4px', 
                marginTop: '12px',
                maxHeight: '160px',
                overflowY: 'auto'
              } 
            },
              dayBreakdown.map((d, i) => {
                const isPositive = d.delta >= 0;
                return React.createElement('div', { 
                  key: d.date,
                  style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: d.hasTraining ? 'rgba(234, 179, 8, 0.1)' : 'rgba(100, 116, 139, 0.05)',
                    border: d.hasTraining ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid transparent'
                  }
                },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { 
                      style: { fontWeight: 600, color: '#475569', minWidth: '24px' }
                    }, d.dayNum),
                    d.hasTraining && React.createElement('span', { 
                      style: { fontSize: '12px' }, 
                      title: 'День с тренировкой — дефицит ×1.3' 
                    }, '🏋️')
                  ),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                    // Съедено / норма
                    React.createElement('span', { style: { fontSize: '12px', color: '#64748b' } }, 
                      d.eaten + ' / ' + d.target),
                    // Дельта (инвертировано: недоел = хорошо для дефицита)
                    React.createElement('span', { 
                      style: { 
                        fontWeight: 600,
                        minWidth: '50px',
                        textAlign: 'right',
                        color: isPositive ? '#ef4444' : '#22c55e'
                      }
                    }, (isPositive ? '+' : '') + d.delta)
                  )
                );
              })
            ),
            // Разделитель
            React.createElement('div', { 
              style: { 
                height: '1px', 
                background: 'rgba(100, 116, 139, 0.2)', 
                margin: '12px 0' 
              } 
            }),
            // Итоговая рекомендация
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              // Долг
              debt > 0 && React.createElement('div', { 
                style: { 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center' 
                } 
              },
                React.createElement('span', { style: { color: '#64748b' } }, 'Накопленный долг:'),
                React.createElement('span', { style: { fontWeight: 600, color: '#ef4444' } }, '-' + debt + ' ккал')
              ),
              // Сколько дней недоедания подряд
              consecutiveDeficitDays >= 2 && React.createElement('div', { 
                style: { 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center' 
                } 
              },
                React.createElement('span', { style: { color: '#64748b' } }, 'Дней в дефиците подряд:'),
                React.createElement('span', { 
                  style: { 
                    fontWeight: 600, 
                    color: consecutiveDeficitDays >= 5 ? '#ef4444' : '#eab308' 
                  } 
                }, consecutiveDeficitDays)
              ),
              // Рекомендация
              dailyBoost > 0 && React.createElement('div', { 
                style: { 
                  marginTop: '4px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: needsRefeed ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  border: needsRefeed ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)'
                } 
              },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: '4px', color: needsRefeed ? '#d97706' : '#16a34a' } },
                  needsRefeed ? '🔄 Refeed рекомендуется' : '💡 Рекомендация'),
                React.createElement('div', { style: { fontSize: '13px', color: '#475569' } },
                  needsRefeed 
                    ? 'Сегодня можно съесть ' + adjustedOptimum + ' ккал (норма +' + Math.round(refeedBoost / optimum * 100) + '%)'
                    : 'Сегодня можно ' + adjustedOptimum + ' ккал (+' + dailyBoost + ' к норме)')
              )
            ),
            // Кнопка закрытия
            React.createElement('button', {
              className: 'sparkline-popup-close',
              onClick: () => setDebtPopup(null)
            }, '✕')
          )
        );
      })(),
      // === METRIC POPUP (вода, шаги, калории) ===
      metricPopup && (() => {
        // Позиционирование с защитой от выхода за экран
        const popupW = 280;
        const popupH = 320; // Примерная высота
        const pos = getSmartPopupPosition(
          metricPopup.x, 
          metricPopup.y, 
          popupW, 
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        
        // Получаем историю для sparkline (7 дней)
        const getMetricHistory = () => {
          const days = [];
          const currentD = new Date(date);
          for (let i = 6; i >= 0; i--) {
            const d = new Date(currentD);
            d.setDate(d.getDate() - i);
            const key = 'heys_dayv2_' + d.toISOString().slice(0,10);
            const stored = U.lsGet(key, null);
            if (stored) {
              if (metricPopup.type === 'water') {
                days.push(stored.waterMl || 0);
              } else if (metricPopup.type === 'steps') {
                days.push(stored.steps || 0);
              } else {
                // kcal — нужно суммировать meals
                const dayTotKcal = (stored.meals || []).reduce((a, m) => {
                  const t = M.mealTotals ? M.mealTotals(m, pIndex) : { kcal: 0 };
                  return a + (t.kcal || 0);
                }, 0);
                days.push(dayTotKcal);
              }
            } else {
              days.push(0);
            }
          }
          return days;
        };
        
        const history = getMetricHistory();
        const sparkMax = Math.max(...history, metricPopup.data.goal || 1) * 1.1;
        
        // Streak расчёт
        const getMetricStreak = () => {
          let streak = 0;
          const goal = metricPopup.data.goal;
          for (let i = history.length - 1; i >= 0; i--) {
            const val = history[i];
            if (metricPopup.type === 'steps') {
              if (val >= goal * 0.8) streak++; else break;
            } else if (metricPopup.type === 'water') {
              if (val >= goal * 0.8) streak++; else break;
            } else {
              const ratio = goal > 0 ? val / goal : 0;
              if (ratio >= 0.75 && ratio <= 1.15) streak++; else break;
            }
          }
          return streak;
        };
        const streak = getMetricStreak();
        
        // Вчера
        const yesterdayVal = history.length >= 2 ? history[history.length - 2] : null;
        const todayVal = history[history.length - 1] || 0;
        const diff = yesterdayVal !== null ? todayVal - yesterdayVal : null;
        
        // Цвет и конфиг по типу
        const config = {
          water: { icon: '💧', name: 'Вода', unit: 'мл', color: '#3b82f6', goal: metricPopup.data.goal },
          steps: { icon: '👟', name: 'Шаги', unit: '', color: metricPopup.data.color || '#22c55e', goal: metricPopup.data.goal },
          kcal: { icon: '🔥', name: 'Калории', unit: 'ккал', color: '#f59e0b', goal: metricPopup.data.goal }
        }[metricPopup.type];
        
        const ratio = metricPopup.data.ratio || 0;
        const pct = Math.round(ratio * 100);
        
        // Gradient
        const getGradient = (r) => {
          if (r < 0.5) return 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)';
          if (r < 0.75) return 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)';
          if (r < 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
          if (r < 1.15) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
          return 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)';
        };
        
        // Swipe handler
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const diffY = e.changedTouches[0].clientY - startY;
          if (diffY > 50) setMetricPopup(null);
        };
        
        return React.createElement('div', {
          className: 'metric-popup' + (showAbove ? ' show-above' : ''),
          role: 'dialog',
          'aria-label': config.name + ' — ' + pct + '% от нормы',
          'aria-modal': 'true',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса
          React.createElement('div', { 
            className: 'metric-popup-stripe',
            style: { background: config.color }
          }),
          // Контент
          React.createElement('div', { className: 'metric-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'metric-popup-swipe' }),
            // Header
            React.createElement('div', { className: 'metric-popup-header' },
              React.createElement('span', { className: 'metric-popup-title' }, config.icon + ' ' + config.name),
              React.createElement('span', { 
                className: 'metric-popup-pct',
                style: { color: config.color }
              }, pct + '%')
            ),
            // Sparkline
            React.createElement('div', { className: 'metric-popup-sparkline' },
              React.createElement('svg', { viewBox: '0 0 70 20', className: 'metric-popup-spark-svg' },
                // Goal line
                React.createElement('line', {
                  x1: 0, y1: 20 - (config.goal / sparkMax * 18),
                  x2: 70, y2: 20 - (config.goal / sparkMax * 18),
                  stroke: '#e2e8f0',
                  strokeWidth: 1,
                  strokeDasharray: '2,2'
                }),
                // Points and lines
                history.map((val, i) => {
                  const x = i * 10 + 5;
                  const y = 20 - (val / sparkMax * 18);
                  const nextVal = history[i + 1];
                  const isToday = i === 6;
                  return React.createElement('g', { key: i },
                    nextVal !== undefined && React.createElement('line', {
                      x1: x, y1: y,
                      x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                      stroke: config.color,
                      strokeWidth: 1.5,
                      strokeOpacity: 0.6
                    }),
                    React.createElement('circle', {
                      cx: x, cy: y,
                      r: isToday ? 3 : 2,
                      fill: isToday ? config.color : '#94a3b8'
                    })
                  );
                })
              ),
              React.createElement('span', { className: 'metric-popup-spark-label' }, '7 дней')
            ),
            // Progress bar
            React.createElement('div', { className: 'metric-popup-progress' },
              React.createElement('div', { 
                className: 'metric-popup-progress-fill',
                style: { 
                  width: Math.min(100, pct) + '%',
                  background: getGradient(ratio)
                }
              })
            ),
            // Value
            React.createElement('div', { className: 'metric-popup-value' },
              React.createElement('span', { style: { color: config.color, fontWeight: 700 } }, 
                metricPopup.type === 'water' 
                  ? (metricPopup.data.value >= 1000 ? (metricPopup.data.value / 1000).toFixed(1) + 'л' : metricPopup.data.value + 'мл')
                  : metricPopup.type === 'steps'
                    ? metricPopup.data.value.toLocaleString()
                    : Math.round(metricPopup.data.eaten) + ' ккал'
              ),
              React.createElement('span', { className: 'metric-popup-goal' }, 
                ' / ' + (metricPopup.type === 'water' 
                  ? (config.goal >= 1000 ? (config.goal / 1000).toFixed(1) + 'л' : config.goal + 'мл')
                  : metricPopup.type === 'steps'
                    ? config.goal.toLocaleString()
                    : Math.round(config.goal) + ' ккал'
                )
              ),
              // Yesterday compare
              diff !== null && React.createElement('span', { 
                className: 'metric-popup-compare' + (diff > 0 ? ' up' : diff < 0 ? ' down' : ''),
              }, diff > 0 ? '↑' : diff < 0 ? '↓' : '=', ' ', 
                metricPopup.type === 'steps' ? Math.abs(diff).toLocaleString() : Math.abs(Math.round(diff)),
                ' vs вчера'
              )
            ),
            // Extra info per type
            metricPopup.type === 'water' && metricPopup.data.breakdown && React.createElement('div', { className: 'metric-popup-extra' },
              React.createElement('span', null, '⚖️ База: ' + metricPopup.data.breakdown.base + 'мл'),
              metricPopup.data.breakdown.stepsBonus > 0 && React.createElement('span', null, ' 👟+' + metricPopup.data.breakdown.stepsBonus),
              metricPopup.data.breakdown.trainBonus > 0 && React.createElement('span', null, ' 🏃+' + metricPopup.data.breakdown.trainBonus)
            ),
            metricPopup.type === 'steps' && React.createElement('div', { className: 'metric-popup-extra' },
              React.createElement('span', null, '🔥 Сожжено: '),
              React.createElement('b', null, metricPopup.data.kcal + ' ккал')
            ),
            metricPopup.type === 'kcal' && React.createElement('div', { className: 'metric-popup-extra' },
              React.createElement('span', null, metricPopup.data.remaining >= 0 ? '✅ Осталось: ' : '⚠️ Перебор: '),
              React.createElement('b', null, Math.abs(metricPopup.data.remaining) + ' ккал')
            ),
            // Streak
            streak > 0 && React.createElement('div', { className: 'metric-popup-streak' },
              React.createElement('span', null, '🏆'),
              React.createElement('span', null, streak + ' ' + (streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней') + ' подряд!')
            ),
            // Water reminder
            metricPopup.type === 'water' && metricPopup.data.lastDrink && metricPopup.data.lastDrink.isLong && React.createElement('div', { className: 'metric-popup-reminder' },
              React.createElement('span', null, '⏰ ' + metricPopup.data.lastDrink.text)
            ),
            // Close button
            React.createElement('button', {
              className: 'metric-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setMetricPopup(null)
            }, '✕')
          ),
          // Arrow
          React.createElement('div', { 
            className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Fallback: нет данных о весе, но есть калории
      (!weightTrend && kcalTrend) && React.createElement('div', { 
        className: 'correlation-block correlation-clickable',
        onClick: () => {
          haptic('light');
          setToastVisible(true);
          setAdviceTrigger('manual');
        }
      },
        React.createElement('span', { className: 'correlation-icon' }, '📉'),
        React.createElement('span', { className: 'correlation-text' },
          'Добавь вес для анализа связи калорий и веса'
        )
      ),
      // Блок корреляции калорий и веса (диагноз + совет)
      (kcalTrend && weightTrend) && React.createElement('div', { 
        className: 'correlation-block correlation-clickable' + 
          (correlationPulse ? ' pulse' : '') +
          (kcalTrend.direction === 'deficit' && weightTrend.direction === 'down' ? ' positive' :
           kcalTrend.direction === 'excess' && weightTrend.direction === 'up' ? ' warning' :
           kcalTrend.direction === 'deficit' && weightTrend.direction === 'up' ? ' mixed' : ''),
        onClick: () => {
          haptic('light');
          setToastVisible(true);
          setAdviceTrigger('manual');
        }
      },
        React.createElement('span', { className: 'correlation-icon' },
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'down' ? '🎯' :
          kcalTrend.direction === 'excess' && weightTrend.direction === 'up' ? '⚠️' :
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'up' ? '🤔' :
          kcalTrend.direction === 'excess' && weightTrend.direction === 'down' ? '💪' : '📊'
        ),
        React.createElement('span', { className: 'correlation-text' },
          // 🎯 Дефицит работает
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'down' 
            ? 'Дефицит работает! ' + r1(weightTrend.diff) + 'кг — продолжай!' :
          // ⚠️ Избыток + рост веса
          kcalTrend.direction === 'excess' && weightTrend.direction === 'up' 
            ? 'Избыток → +' + r1(Math.abs(weightTrend.diff)) + 'кг. Сократи порции' :
          // 🤔 Парадокс: дефицит, но вес растёт
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'up' 
            ? '+' + r1(weightTrend.diff) + 'кг при дефиците — вероятно вода' :
          // 💪 Парадокс: избыток, но вес падает
          kcalTrend.direction === 'excess' && weightTrend.direction === 'down' 
            ? r1(weightTrend.diff) + 'кг! Активность компенсирует' :
          // 📊 Plateau: оба в норме
          kcalTrend.direction === 'same' && weightTrend.direction === 'same'
            ? 'Баланс: вес стабилен' :
          // Калории в норме, вес меняется
          kcalTrend.direction === 'same' 
            ? 'Калории в норме, вес ' + (weightTrend.direction === 'down' ? 'снижается' : 'растёт') :
          'Анализируем данные...'
        )
      ),
      // === Mini-heatmap недели (скрываем если нет данных — появится как сюрприз) ===
      weekHeatmapData && weekHeatmapData.withData > 0 && (() => {
        // Вычисляем badge для среднего ratio недели (% от нормы)
        const avgRatio = (weekHeatmapData.avgRatioPct || 0) / 100;
        const avgRatioPct = weekHeatmapData.avgRatioPct || 0;
        
        // Используем ratioZones для консистентности
        const rz = HEYS.ratioZones;
        const zone = rz.getZone(avgRatio);
        const isSuccess = rz.isSuccess(avgRatio);
        const isPerfect = rz.isPerfect(avgRatio);
        
        // Цветовой класс: good/perfect = зелёный, low/over = жёлтый, crash/binge = красный
        const colorClass = isSuccess ? 'deficit-good' : 
          (zone.id === 'low' || zone.id === 'over') ? 'deficit-warn' : 'deficit-bad';
        
        // Отклонение от 100%: +6% или −8%
        const deviation = avgRatioPct - 100;
        const deviationText = deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
        const deficitIcon = isPerfect ? '✓' : isSuccess ? '✓' : 
                            (zone.id === 'low' || zone.id === 'over') ? '~' : '!';
        
        return React.createElement('div', {
          className: 'week-heatmap'
        },
          React.createElement('div', { className: 'week-heatmap-header' },
            React.createElement('span', { className: 'week-heatmap-title' }, '📅 Неделя'),
            weekHeatmapData.streak >= 2 && React.createElement('span', { 
              className: 'week-heatmap-streak' 
            }, '🔥 ' + weekHeatmapData.streak),
            // Средний ratio справа в header с цветом по зоне
            React.createElement('span', { 
              className: 'week-heatmap-stat ' + colorClass,
              title: 'Среднее выполнение нормы за ' + weekHeatmapData.withData + ' дн. (' + zone.name + ')'
            },
              'в среднем ' + deficitIcon + ' ' + deviationText
            )
          ),
          // Grid с днями недели + статистика X/Y в норме
          React.createElement('div', { className: 'week-heatmap-row' },
            React.createElement('div', { className: 'week-heatmap-grid' },
              weekHeatmapData.days.map((d, i) => 
                React.createElement('div', {
                  key: i,
                  className: 'week-heatmap-day ' + d.status + 
                    (d.isToday ? ' today' : '') +
                    (d.isWeekend ? ' weekend' : '') +
                    (d.isRefeedDay ? ' refeed-day' : ''),
                  title: d.isFuture ? d.name : (d.kcal > 0 ? 
                    (d.isRefeedDay ? '🔄 Загрузочный день\n' : '') +
                    d.kcal + ' ккал (' + Math.round(d.ratio * 100) + '%)' +
                    (d.isStreakDay ? '\n✅ Streak +1' : '\n⚠️ Вне нормы') : 'Нет данных'),
                  style: { 
                    '--stagger-delay': (i * 50) + 'ms',
                    '--day-bg-color': d.bgColor || 'transparent'
                  },
                  onClick: () => {
                    if (!d.isFuture && d.status !== 'empty') {
                      setDate(d.date);
                      haptic('light');
                    }
                  }
                },
                  React.createElement('span', { className: 'week-heatmap-name' }, d.name),
                  React.createElement('div', { 
                    className: 'week-heatmap-cell',
                    style: d.bgColor ? { background: d.bgColor } : undefined
                  })
                )
              )
            ),
            // Статистика X/Y в норме справа от квадратиков (кликабельно)
            React.createElement('span', { 
              className: 'week-heatmap-norm',
              onClick: (e) => {
                e.stopPropagation();
                haptic('light');
                openExclusivePopup('weekNorm', { 
                  days: weekHeatmapData.days, 
                  inNorm: weekHeatmapData.inNorm,
                  withData: weekHeatmapData.withData,
                  x: e.clientX, 
                  y: e.clientY 
                });
              },
              title: 'Нажмите для подробностей'
            },
              weekHeatmapData.inNorm + '/' + weekHeatmapData.withData + ' в норме'
            )
          ),
          weekHeatmapData.weekendPattern && React.createElement('div', { 
            className: 'week-heatmap-pattern' 
          }, weekHeatmapData.weekendPattern)
        );
      })(),
      // Спарклайн веса — показываем если есть хотя бы 1 точка (вес из профиля)
      weightSparklineData.length >= 1 && React.createElement('div', { 
        className: 'weight-sparkline-container' + 
          (weightTrend?.direction === 'down' ? ' trend-down' : 
           weightTrend?.direction === 'up' ? ' trend-up' : ' trend-same')
      },
        React.createElement('div', { className: 'weight-sparkline-header' },
          React.createElement('span', { className: 'weight-sparkline-title' }, '⚖️ Вес'),
          // Badges показываем только когда есть тренд (2+ точки)
          weightSparklineData.length >= 2 && weightTrend && React.createElement('div', { className: 'weight-sparkline-badges' },
            React.createElement('span', { 
              className: 'weight-trend-badge' + 
                (weightTrend.direction === 'down' ? ' down' : 
                 weightTrend.direction === 'up' ? ' up' : ' same')
            },
              weightTrend.direction === 'down' ? '↓' : 
              weightTrend.direction === 'up' ? '↑' : '→',
              ' ', weightTrend.text
            ),
            monthForecast && React.createElement('span', { 
              className: 'weight-forecast-badge' + 
                (monthForecast.direction === 'down' ? ' down' : 
                 monthForecast.direction === 'up' ? ' up' : '')
            }, monthForecast.text),
            // Бейдж "чистый тренд" если дни с задержкой воды исключены
            weightTrend.isCleanTrend && React.createElement('span', { 
              className: 'weight-clean-trend-badge',
              title: 'Дни с задержкой воды исключены из тренда'
            }, '🌸 чистый'),
            // Кнопки выбора периода (как у калорий)
            React.createElement('div', { className: 'kcal-period-pills weight-period-pills' },
              [7, 14, 30].map(period => 
                React.createElement('button', {
                  key: 'weight-period-' + period,
                  className: 'kcal-period-pill' + (chartPeriod === period ? ' active' : ''),
                  onClick: () => handlePeriodChange(period)
                }, period + 'д')
              )
            )
          ) // закрываем badges div
        ), // закрываем условие weightSparklineData.length >= 2
        renderWeightSparkline(weightSparklineData),
        // Сноска о задержке воды если есть такие дни
        weightSparklineData.some(d => d.hasWaterRetention) && React.createElement('div', { 
          className: 'weight-retention-note' 
        },
          React.createElement('span', { className: 'weight-retention-note-icon' }, '🌸'),
          React.createElement('div', { className: 'weight-retention-note-content' }, 
            // Основной текст
            React.createElement('span', { className: 'weight-retention-note-text' }, 
              'Розовые зоны — дни с возможной задержкой воды (', 
              React.createElement('b', null, '+1-3 кг'),
              '). Это НЕ жир!'
            ),
            // Прогноз нормализации
            cycleHistoryAnalysis?.forecast?.message && React.createElement('div', { 
              className: 'weight-retention-forecast' 
            },
              '⏱️ ', cycleHistoryAnalysis.forecast.message
            ),
            // Персональный инсайт из истории
            cycleHistoryAnalysis?.hasSufficientData && cycleHistoryAnalysis?.insight && React.createElement('div', { 
              className: 'weight-retention-insight' 
            },
              '📊 ', cycleHistoryAnalysis.insight
            ),
            // Статистика по циклам (если >=2 циклов)
            cycleHistoryAnalysis?.cyclesAnalyzed >= 2 && React.createElement('div', { 
              className: 'weight-retention-stats' 
            },
              'Твоя типичная задержка: ',
              React.createElement('b', null, '~' + cycleHistoryAnalysis.avgRetentionKg + ' кг'),
              ' (на основе ', cycleHistoryAnalysis.cyclesAnalyzed, ' циклов)'
            )
          )
        )
      ),
      // Подсказка если целевой вес не задан — прогноз идёт к стабилизации
      !prof?.weightGoal && weightSparklineData.some(d => d.isFuture) && React.createElement('div', { 
        className: 'weight-goal-hint' 
      },
        '💡 Укажи ',
        React.createElement('button', {
          className: 'weight-goal-hint-link',
          onClick: (e) => {
            e.preventDefault();
            // Открываем профиль (как ссылка на настройки)
            if (window.HEYS && window.HEYS.openProfileModal) {
              window.HEYS.openProfileModal();
            } else {
              // Fallback: переключаем на вкладку профиля
              const profileTab = document.querySelector('[data-tab="profile"]');
              if (profileTab) profileTab.click();
            }
          }
        }, 'целевой вес'),
        ' в профиле — прогноз будет точнее!'
      ),
      // Popup с деталями веса при клике на точку — V2 STYLE
      sparklinePopup && sparklinePopup.type === 'weight' && (() => {
        const point = sparklinePopup.point;
        const popupW = 240;
        const popupH = 180;
        const pos = getSmartPopupPosition(
          sparklinePopup.x, 
          sparklinePopup.y, 
          popupW, 
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        
        // Цвет по тренду: снижение = зелёный, рост = красный
        const trend = point.localTrend || 0;
        const color = trend < -0.05 ? '#22c55e' : trend > 0.05 ? '#ef4444' : '#6b7280';
        const trendIcon = trend < -0.05 ? '↓' : trend > 0.05 ? '↑' : '→';
        
        // Swipe
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const deltaY = e.changedTouches[0].clientY - startY;
          if (deltaY > 50) { 
            setSparklinePopup(null); 
            haptic('light'); 
          }
        };
        
        return React.createElement('div', {
          className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
          role: 'dialog',
          'aria-label': 'Вес ' + point.weight + ' кг',
          'aria-modal': 'true',
          style: { 
            position: 'fixed',
            left: left + 'px', 
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: color }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header: дата + тренд
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' },
                point.isToday ? '📅 Сегодня' : '📅 ' + point.dayNum + ' число'
              ),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: color }
              }, trendIcon + ' ' + (trend > 0 ? '+' : '') + trend.toFixed(1) + ' кг')
            ),
            // Основное значение веса
            React.createElement('div', { className: 'sparkline-popup-value-row' },
              React.createElement('span', { style: { color: '#374151', fontWeight: 700, fontSize: '18px' } }, 
                '⚖️ ' + point.weight + ' кг'
              )
            ),
            // Теги: если есть данные о дне
            (point.sleepHours > 0 || point.steps > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.steps > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString())
              ),
            // Кнопка перехода
            !point.isToday && point.date && React.createElement('button', {
              className: 'sparkline-popup-btn-v2',
              onClick: () => {
                setSparklinePopup(null);
                setDate(point.date);
                haptic('light');
              }
            }, '→ Перейти к дню'),
            // Close
            React.createElement('button', {
              className: 'sparkline-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setSparklinePopup(null)
            }, '✕')
          ),
          // Стрелка
          React.createElement('div', { 
            className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Popup для прогноза веса — V2 STYLE
      sparklinePopup && sparklinePopup.type === 'weight-forecast' && (() => {
        const point = sparklinePopup.point;
        const popupW = 240;
        const popupH = 160;
        const pos = getSmartPopupPosition(
          sparklinePopup.x, 
          sparklinePopup.y, 
          popupW, 
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        
        // Цвет по изменению: снижение = зелёный, рост = красный
        const change = point.forecastChange || 0;
        const color = change < -0.05 ? '#22c55e' : change > 0.05 ? '#ef4444' : '#6b7280';
        const trendIcon = change < -0.05 ? '↓' : change > 0.05 ? '↑' : '→';
        
        // Swipe
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const deltaY = e.changedTouches[0].clientY - startY;
          if (deltaY > 50) { 
            setSparklinePopup(null); 
            haptic('light'); 
          }
        };
        
        return React.createElement('div', {
          className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
          role: 'dialog',
          'aria-label': 'Прогноз веса ~' + point.weight + ' кг',
          'aria-modal': 'true',
          style: { 
            position: 'fixed',
            left: left + 'px', 
            top: top + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса (градиент для прогноза)
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header: прогноз + изменение
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' },
                '🔮 Прогноз на ' + point.dayNum
              ),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: color }
              }, trendIcon + ' ' + (change > 0 ? '+' : '') + change.toFixed(1) + ' кг')
            ),
            // Основное значение
            React.createElement('div', { className: 'sparkline-popup-value-row' },
              React.createElement('span', { style: { color: '#8b5cf6', fontWeight: 700, fontSize: '18px' } }, 
                '⚖️ ~' + point.weight + ' кг'
              )
            ),
            // Подсказка
            React.createElement('div', { className: 'sparkline-popup-hint-v2' },
              'На основе тренда последних дней'
            ),
            // Close
            React.createElement('button', {
              className: 'sparkline-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setSparklinePopup(null)
            }, '✕')
          ),
          // Стрелка
          React.createElement('div', { 
            className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Контейнер: Макро-кольца + Плашка веса
        React.createElement('div', { className: 'macro-weight-row' },
        // Макро-бар БЖУ (в стиле Apple Watch колец)
        (() => {
          // === Умная логика цветов по правилам питания ===
          
          // БЕЛКИ: больше = лучше (насыщение, мышцы, термогенез)
          // < 60% — критически мало, мышцы страдают
          // 60-90% — недобор, но терпимо
          // 90%+ — отлично! Чем больше белка, тем лучше
          const getProteinColor = (actual, norm, hasTraining) => {
            if (!norm || norm === 0) return '#6b7280';
            const ratio = actual / norm;
            // После тренировки требования к белку выше
            const minGood = hasTraining ? 1.0 : 0.9;
            const minOk = hasTraining ? 0.7 : 0.6;
            if (ratio < minOk) return '#ef4444';    // красный — критически мало
            if (ratio < minGood) return '#f59e0b';  // оранжевый — недобор
            return '#22c55e';                        // зелёный — норма и выше
          };
          
          // ЖИРЫ: баланс важен, но не критичен
          // < 50% — мало (гормоны, усвоение витаминов)
          // 50-80% — немного мало
          // 80-120% — отлично
          // 120-150% — многовато (но не критично)
          // > 150% — перебор
          const getFatColor = (actual, norm) => {
            if (!norm || norm === 0) return '#6b7280';
            const ratio = actual / norm;
            if (ratio < 0.5) return '#ef4444';      // красный — критически мало
            if (ratio < 0.8) return '#f59e0b';      // оранжевый — маловато
            if (ratio <= 1.2) return '#22c55e';     // зелёный — в норме
            if (ratio <= 1.5) return '#f59e0b';     // оранжевый — многовато
            return '#ef4444';                        // красный — сильный перебор
          };
          
          // УГЛЕВОДЫ: зависит от дефицита калорий
          // При дефиците: меньше углеводов = лучше (кетоз, жиросжигание)
          // Без дефицита: норма важна для энергии
          const getCarbsColor = (actual, norm, hasDeficit) => {
            if (!norm || norm === 0) return '#6b7280';
            const ratio = actual / norm;
            
            if (hasDeficit) {
              // При дефиците: меньше углеводов — хорошо!
              if (ratio < 0.3) return '#f59e0b';    // слишком мало даже для дефицита
              if (ratio <= 0.8) return '#22c55e';   // отлично для похудения
              if (ratio <= 1.0) return '#22c55e';   // норма — ОК
              if (ratio <= 1.2) return '#f59e0b';   // немного много для дефицита
              return '#ef4444';                      // перебор — плохо для дефицита
            } else {
              // Без дефицита: стандартная логика
              if (ratio < 0.5) return '#ef4444';    // мало энергии
              if (ratio < 0.8) return '#f59e0b';    // недобор
              if (ratio <= 1.1) return '#22c55e';   // норма
              if (ratio <= 1.3) return '#f59e0b';   // немного много
              return '#ef4444';                      // перебор
            }
          };
          
          // Собираем массив бейджей с описаниями (до 2 штук)
          // { emoji, desc } — emoji и описание при тапе
          const getBadges = (color, isProtein, ratio, contextEmoji, contextDesc) => {
            const badges = [];
            
            // Статус по цвету (приоритет 1)
            if (color === '#ef4444') {
              if (ratio < 0.6) {
                badges.push({ emoji: '⚠️', desc: 'Критически мало! Нужно добавить.' });
              } else {
                badges.push({ emoji: '⚠️', desc: 'Перебор! Слишком много.' });
              }
            } else if (color === '#22c55e') {
              if (isProtein && ratio >= 1.2) {
                badges.push({ emoji: '💪', desc: 'Отлично! Много белка для мышц.' });
              } else if (ratio >= 0.95 && ratio <= 1.05) {
                badges.push({ emoji: '✓', desc: 'Идеально! Точно в норме.' });
              }
            }
            
            // Контекст (приоритет 2) — добавляем если есть место
            if (contextEmoji && badges.length < 2) {
              badges.push({ emoji: contextEmoji, desc: contextDesc });
            }
            
            return badges;
          };
          
          const hasDeficit = dayTargetDef < 0; // дефицит если отрицательный %
          const hasTraining = (day.trainings && day.trainings.length > 0) || train1k + train2k > 0;
          
          const protRatio = (dayTot.prot || 0) / (normAbs.prot || 1);
          const fatRatio = (dayTot.fat || 0) / (normAbs.fat || 1);
          const carbsRatio = (dayTot.carbs || 0) / (normAbs.carbs || 1);
          
          const protColor = getProteinColor(dayTot.prot || 0, normAbs.prot, hasTraining);
          const fatColor = getFatColor(dayTot.fat || 0, normAbs.fat);
          const carbsColor = getCarbsColor(dayTot.carbs || 0, normAbs.carbs, hasDeficit);
          
          // Бейджи для каждого макроса (расширенные данные для popup)
          const protBadges = getBadges(protColor, true, protRatio, 
            hasTraining ? '🏋️' : null, 'Сегодня тренировка — белок важнее!');
          const fatBadges = getBadges(fatColor, false, fatRatio, null, null);
          const carbsBadges = getBadges(carbsColor, false, carbsRatio,
            hasDeficit ? '📉' : null, 'Режим дефицита — меньше углеводов = лучше');
          
          // Рендер бейджей с popup по тапу
          const renderBadges = (badges, macro, value, norm, ratio, color) => {
            if (!badges || badges.length === 0) return null;
            return React.createElement('div', { className: 'macro-ring-badges' },
              badges.map((b, i) => React.createElement('span', {
                key: i,
                className: 'macro-ring-badge',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  setMacroBadgePopup({
                    macro,
                    emoji: b.emoji,
                    desc: b.desc,
                    value: Math.round(value),
                    norm: Math.round(norm),
                    ratio,
                    color,
                    allBadges: badges,
                    x: rect.left + rect.width / 2,
                    y: rect.top
                  });
                  haptic('light');
                }
              }, b.emoji))
            );
          };
          
          // Функция открытия popup для круга
          const openRingPopup = (e, macro, value, norm, ratio, color, badges) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMacroBadgePopup({
              macro,
              emoji: null,
              desc: null,
              value: Math.round(value || 0),
              norm: Math.round(norm || 0),
              ratio,
              color,
              allBadges: badges || [],
              x: rect.left + rect.width / 2,
              y: rect.bottom
            });
            haptic('light');
          };
          
          return React.createElement('div', { className: 'macro-rings' },
          // Белки
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { 
              className: 'macro-ring' + (protColor === '#ef4444' ? ' macro-ring-pulse' : ''),
              onClick: (e) => openRingPopup(e, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor, protBadges),
              style: { cursor: 'pointer' }
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { 
                    strokeDasharray: Math.min(100, protRatio * 100) + ' 100',
                    stroke: protColor
                  }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value', style: { color: protColor } }, 
                Math.round(dayTot.prot || 0)
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Белки'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.prot || 0) + 'г'),
            renderBadges(protBadges, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor)
          ),
          // Жиры
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { 
              className: 'macro-ring' + (fatColor === '#ef4444' ? ' macro-ring-pulse' : ''),
              onClick: (e) => openRingPopup(e, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor, fatBadges),
              style: { cursor: 'pointer' }
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { 
                    strokeDasharray: Math.min(100, fatRatio * 100) + ' 100',
                    stroke: fatColor
                  }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value', style: { color: fatColor } }, 
                Math.round(dayTot.fat || 0)
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Жиры'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.fat || 0) + 'г'),
            renderBadges(fatBadges, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor)
          ),
          // Углеводы
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { 
              className: 'macro-ring' + (carbsColor === '#ef4444' ? ' macro-ring-pulse' : ''),
              onClick: (e) => openRingPopup(e, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor, carbsBadges),
              style: { cursor: 'pointer' }
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { 
                    strokeDasharray: Math.min(100, carbsRatio * 100) + ' 100',
                    stroke: carbsColor
                  }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value', style: { color: carbsColor } }, 
                Math.round(dayTot.carbs || 0)
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Углеводы'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.carbs || 0) + 'г'),
            renderBadges(carbsBadges, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor)
          )
        );
        })(),
        // Плашка веса - кликабельная целиком
        React.createElement('div', { 
          className: 'weight-card-modern' + (day.weightMorning ? '' : ' weight-card-empty'),
          onClick: openWeightPicker
        },
          // Лейбл "Вес" сверху
          React.createElement('span', { className: 'weight-card-label' }, 'ВЕС НА УТРО'),
          // Значение веса
          React.createElement('div', { className: 'weight-card-row' },
            React.createElement('span', { className: 'weight-value-number' }, 
              day.weightMorning ? r1(day.weightMorning) : '—'
            ),
            React.createElement('span', { className: 'weight-value-unit' }, 'кг')
          ),
          // Тренд под значением + DEV кнопка очистки
          day.weightMorning && React.createElement('div', { className: 'weight-trend-row' },
            weightTrend && React.createElement('div', { 
              className: 'weight-card-trend ' + (weightTrend.direction === 'down' ? 'trend-down' : weightTrend.direction === 'up' ? 'trend-up' : 'trend-same')
            }, 
              React.createElement('span', { className: 'trend-arrow' }, weightTrend.direction === 'down' ? '↓' : weightTrend.direction === 'up' ? '↑' : '→'),
              weightTrend.text.replace(/[^а-яА-Я0-9.,\-+\s]/g, '').trim()
            ),
            // DEV: Мини-кнопка очистки веса
            React.createElement('button', {
              className: 'dev-clear-weight-mini',
              onClick: (e) => {
                e.stopPropagation();
                if (!confirm('🗑️ Очистить вес за сегодня?\n\nЭто позволит увидеть Morning Check-in заново.')) return;
                // Сразу сбрасываем вес и сон, чтобы чек-ин показался снова
                setDay(prev => ({
                  ...prev,
                  weightMorning: '',
                  sleepStart: '',
                  sleepEnd: '',
                  sleepHours: '',
                  sleepQuality: '',
                  updatedAt: Date.now()
                }));

                // Даем React применить state, затем сохраняем и открываем чек-ин без перезагрузки
                setTimeout(() => {
                  try {
                    if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
                      HEYS.Day.requestFlush();
                    }
                    if (HEYS.showCheckin && typeof HEYS.showCheckin.morning === 'function') {
                      HEYS.showCheckin.morning();
                    } else if (HEYS.showCheckin && typeof HEYS.showCheckin.weight === 'function') {
                      HEYS.showCheckin.weight();
                    }
                  } catch (err) {
                    // Ничего: не мешаем UX, если чек-ин не доступен
                  }
                }, 50);
              },
              title: 'DEV: Очистить вес для теста Morning Check-in'
            }, '×')
          )
        ),
        // Плашка дефицита - кликабельная
        React.createElement('div', { 
          className: 'deficit-card-modern',
          onClick: openDeficitPicker
        },
          React.createElement('span', { className: 'weight-card-label' }, 'ЦЕЛЬ ДЕФИЦИТ'),
          React.createElement('div', { className: 'weight-card-row' },
            React.createElement('span', { 
              className: 'deficit-value-number' + (currentDeficit < 0 ? ' deficit-negative' : currentDeficit > 0 ? ' deficit-positive' : '')
            }, 
              (currentDeficit > 0 ? '+' : '') + currentDeficit
            ),
            React.createElement('span', { className: 'weight-value-unit' }, '%')
          ),
          // Разница от профиля
          currentDeficit !== profileDeficit && React.createElement('div', { 
            className: 'deficit-card-trend ' + (currentDeficit < profileDeficit ? 'trend-down' : 'trend-up')
          }, 
            React.createElement('span', { className: 'trend-arrow' }, currentDeficit < profileDeficit ? '↓' : '↑'),
            (currentDeficit > profileDeficit ? '+' : '') + (currentDeficit - profileDeficit) + '%'
          )
        )
      )
    );

    // === COMPACT ACTIVITY INPUT ===
    const stepsGoal = savedStepsGoal;
    const stepsMax = 20000; // расширенный диапазон
    const stepsValue = day.steps || 0;
    // Позиция: 0-10000 занимает 80% слайдера, 10000-20000 — 20%
    const stepsPercent = stepsValue <= stepsGoal 
      ? (stepsValue / stepsGoal) * 80 
      : 80 + ((stepsValue - stepsGoal) / (stepsMax - stepsGoal)) * 20;
    // Цвет по прогрессу к цели (100% = 10000)
    const stepsColorPercent = Math.min(100, (stepsValue / stepsGoal) * 100);
    
    // Цвет: красный → жёлтый → зелёный (жёлтый на 30% для позитива)
    const getStepsColor = (pct) => {
      if (pct < 30) {
        // 0-30%: красный → жёлтый
        const t = pct / 30;
        const r = Math.round(239 - t * (239 - 234)); // 239 → 234
        const g = Math.round(68 + t * (179 - 68)); // 68 → 179
        const b = Math.round(68 - t * (68 - 8)); // 68 → 8
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // 30-100%: жёлтый → зелёный  
        const t = (pct - 30) / 70;
        const r = Math.round(234 - t * (234 - 34)); // 234 → 34
        const g = Math.round(179 + t * (197 - 179)); // 179 → 197
        const b = Math.round(8 + t * (94 - 8)); // 8 → 94
        return `rgb(${r}, ${g}, ${b})`;
      }
    };
    const stepsColor = getStepsColor(stepsColorPercent);
    
    // Drag handler для слайдера шагов
    const handleStepsDrag = (e) => {
      // Не вызываем preventDefault на React synthetic event (passive listener)
      const slider = e.currentTarget.closest('.steps-slider');
      if (!slider) return;
      
      const rect = slider.getBoundingClientRect();
      const updateSteps = (clientX) => {
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = (x / rect.width) * 100;
        let newSteps;
        if (percent <= 80) {
          // 0-80% слайдера = 0-10000 шагов, шаг 10
          newSteps = Math.round(((percent / 80) * stepsGoal) / 10) * 10;
        } else {
          // 80-100% слайдера = 10000-20000 шагов, шаг 100
          const extraPercent = (percent - 80) / 20;
          newSteps = stepsGoal + Math.round((extraPercent * (stepsMax - stepsGoal)) / 100) * 100;
        }
        setDay(prev => ({...prev, steps: Math.min(stepsMax, Math.max(0, newSteps)), updatedAt: Date.now()}));
      };
      
      const onMove = (ev) => {
        // preventDefault только для touch, чтобы не скроллить страницу
        if (ev.cancelable) ev.preventDefault();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        updateSteps(clientX);
      };
      
      const onEnd = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
      };
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      
      // Первый клик тоже обновляет
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateSteps(clientX);
    };

    // === Water Card (Карточка воды) ===
    const waterCard = React.createElement('div', { id: 'water-card', className: 'compact-water compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '💧 ВОДА'),
      
      // Основной контент: кольцо + инфо + пресеты
      React.createElement('div', { className: 'water-card-content' },
        // Левая часть: кольцо прогресса + breakdown
        React.createElement('div', { className: 'water-ring-container' },
          React.createElement('div', { 
            className: 'water-ring-large',
            onMouseDown: handleWaterRingDown,
            onMouseUp: handleWaterRingUp,
            onMouseLeave: handleWaterRingLeave,
            onTouchStart: handleWaterRingDown,
            onTouchEnd: handleWaterRingUp
          },
            React.createElement('svg', { viewBox: '0 0 36 36', className: 'water-ring-svg' },
              React.createElement('circle', { className: 'water-ring-bg', cx: 18, cy: 18, r: 15.9 }),
              React.createElement('circle', { 
                className: 'water-ring-fill', 
                cx: 18, cy: 18, r: 15.9,
                style: { strokeDasharray: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + ' 100' }
              })
            ),
            React.createElement('div', { 
              className: 'water-ring-center',
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                openExclusivePopup('metric', {
                  type: 'water',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: day.waterMl || 0,
                    goal: waterGoal,
                    ratio: (day.waterMl || 0) / waterGoal,
                    breakdown: waterGoalBreakdown,
                    lastDrink: waterLastDrink
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer' }
            },
              React.createElement('span', { className: 'water-ring-value' }, 
                (day.waterMl || 0) >= 1000 
                  ? ((day.waterMl || 0) / 1000).toFixed(1).replace('.0', '') 
                  : (day.waterMl || 0)
              ),
              React.createElement('span', { className: 'water-ring-unit' }, 
                (day.waterMl || 0) >= 1000 ? 'л' : 'мл'
              )
            )
          ),
          // Анимация добавления (над кольцом)
          waterAddedAnim && React.createElement('span', { 
            className: 'water-card-anim water-card-anim-above',
            key: 'water-anim-' + Date.now()
          }, waterAddedAnim),
          // Краткий breakdown под кольцом
          React.createElement('div', { className: 'water-goal-breakdown' },
            React.createElement('span', { className: 'water-breakdown-item' }, 
              '⚖️ ' + waterGoalBreakdown.base + 'мл'
            ),
            waterGoalBreakdown.stepsBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' }, 
              '👟 +' + waterGoalBreakdown.stepsBonus
            ),
            waterGoalBreakdown.trainBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' }, 
              '🏃 +' + waterGoalBreakdown.trainBonus
            ),
            waterGoalBreakdown.seasonBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' }, 
              '☀️ +' + waterGoalBreakdown.seasonBonus
            ),
            waterGoalBreakdown.cycleBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus water-breakdown-cycle' }, 
              '🌸 +' + waterGoalBreakdown.cycleBonus
            )
          ),
          // Напоминание "Давно не пил" (если >2ч)
          waterLastDrink && waterLastDrink.isLong && (day.waterMl || 0) < waterGoal && React.createElement('div', { 
            className: 'water-reminder'
          }, '⏰ ' + waterLastDrink.text)
        ),
        
        // Тултип с полной формулой (при долгом нажатии)
        showWaterTooltip && React.createElement('div', { 
          className: 'water-formula-tooltip',
          onClick: () => setShowWaterTooltip(false)
        },
          React.createElement('div', { className: 'water-formula-title' }, '📊 Расчёт нормы воды'),
          React.createElement('div', { className: 'water-formula-row' }, 
            'Базовая: ' + waterGoalBreakdown.weight + ' кг × ' + waterGoalBreakdown.coef + ' мл = ' + waterGoalBreakdown.baseRaw + ' мл'
          ),
          waterGoalBreakdown.ageNote && React.createElement('div', { className: 'water-formula-row water-formula-sub' }, 
            'Возраст: ' + waterGoalBreakdown.ageNote
          ),
          waterGoalBreakdown.stepsBonus > 0 && React.createElement('div', { className: 'water-formula-row' }, 
            'Шаги: ' + (day.steps || 0).toLocaleString() + ' (' + waterGoalBreakdown.stepsCount + '×5000) → +' + waterGoalBreakdown.stepsBonus + ' мл'
          ),
          waterGoalBreakdown.trainBonus > 0 && React.createElement('div', { className: 'water-formula-row' }, 
            'Тренировки: ' + waterGoalBreakdown.trainCount + ' шт → +' + waterGoalBreakdown.trainBonus + ' мл'
          ),
          waterGoalBreakdown.seasonBonus > 0 && React.createElement('div', { className: 'water-formula-row' }, 
            'Сезон: ☀️ Лето → +' + waterGoalBreakdown.seasonBonus + ' мл'
          ),
          waterGoalBreakdown.cycleBonus > 0 && React.createElement('div', { className: 'water-formula-row water-formula-cycle' }, 
            '🌸 Особый период → +' + waterGoalBreakdown.cycleBonus + ' мл'
          ),
          React.createElement('div', { className: 'water-formula-total' }, 
            'Итого: ' + (waterGoal / 1000).toFixed(1) + ' л'
          ),
          React.createElement('div', { className: 'water-formula-hint' }, 'Нажми, чтобы закрыть')
        ),
        
        // Правая часть: пресеты + прогресс
        React.createElement('div', { className: 'water-card-right' },
          // Верхняя строка: мотивация + кнопка удаления
          React.createElement('div', { className: 'water-top-row' },
            React.createElement('div', { className: 'water-motivation-inline' },
              React.createElement('span', { className: 'water-motivation-emoji' }, waterMotivation.emoji),
              React.createElement('span', { className: 'water-motivation-text' }, waterMotivation.text)
            ),
            // Кнопка уменьшения (справа)
            (day.waterMl || 0) > 0 && React.createElement('button', {
              className: 'water-minus-compact',
              onClick: () => removeWater(100)
            }, '−100')
          ),
          
          // Прогресс-бар с волной
          React.createElement('div', { className: 'water-progress-inline' },
            // 💧 Падающая капля
            showWaterDrop && React.createElement('div', { className: 'water-drop-container' },
              React.createElement('div', { className: 'water-drop' }),
              React.createElement('div', { className: 'water-splash' })
            ),
            // Заливка
            React.createElement('div', { 
              className: 'water-progress-fill',
              style: { width: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            }),
            // Пузырьки (на уровне контейнера, чтобы не обрезались)
            (day.waterMl || 0) > 0 && React.createElement('div', { className: 'water-bubbles' },
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' })
            ),
            // Блик сверху
            React.createElement('div', { className: 'water-shine' }),
            // Волна на краю заливки
            (day.waterMl || 0) > 0 && ((day.waterMl || 0) / waterGoal) < 1 && React.createElement('div', {
              className: 'water-wave-edge',
              style: { left: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            })
          ),
          
          // Пресеты в ряд
          React.createElement('div', { className: 'water-presets-row' },
            waterPresets.map(preset => 
              React.createElement('button', {
                key: preset.ml,
                className: 'water-preset-compact',
                onClick: () => addWater(preset.ml, true) // skipScroll: уже внутри карточки
              },
                React.createElement('span', { className: 'water-preset-icon' }, preset.icon),
                React.createElement('span', { className: 'water-preset-ml' }, '+' + preset.ml)
              )
            )
          )
        )
      ),
      
      // Лайфхак внизу карточки — на всю ширину
      React.createElement('div', { className: 'water-tip' },
        React.createElement('span', { className: 'water-tip-icon' }, '💡'),
        React.createElement('span', { className: 'water-tip-text' }, 
          'Утром поставь 4-5 бутылок 0,5л на кухне — вечером точно знаешь сколько выпил'
        )
      )
    );

    const compactActivity = React.createElement('div', { className: 'compact-activity compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '📏 АКТИВНОСТЬ'),
      
      // Слайдер шагов с зоной защиты от свайпа
      React.createElement('div', { className: 'steps-slider-container no-swipe-zone' },
        React.createElement('div', { className: 'steps-slider-header' },
          React.createElement('span', { className: 'steps-label' }, '👟 Шаги'),
          React.createElement('span', { className: 'steps-value' }, 
            // Фактические шаги — кликабельные с подсказкой
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMetricPopup({
                  type: 'steps',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: stepsValue,
                    goal: stepsGoal,
                    ratio: stepsValue / stepsGoal,
                    kcal: stepsK,
                    color: stepsColor
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' },
              title: 'Нажмите для подробностей'
            },
              React.createElement('b', { style: { color: stepsColor } }, stepsValue.toLocaleString())
            ),
            ' / ',
            // Цель шагов — с кнопкой редактирования
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                openStepsGoalPicker();
                haptic('light');
              },
              style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' },
              title: 'Изменить цель'
            },
              React.createElement('b', { className: 'steps-goal' }, stepsGoal.toLocaleString()),
              React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, '✏️')
            ),
            React.createElement('span', { className: 'steps-kcal-hint' }, ' / ' + stepsK + ' ккал')
          )
        ),
        React.createElement('div', { 
          className: 'steps-slider'
        },
          React.createElement('div', { className: 'steps-slider-track' }),
          React.createElement('div', { className: 'steps-slider-goal-mark', style: { left: '80%' } },
            React.createElement('span', { className: 'steps-goal-label' }, String(stepsGoal))
          ),
          React.createElement('div', { 
            className: 'steps-slider-fill',
            style: { width: stepsPercent + '%', background: stepsColor }
          }),
          React.createElement('div', { 
            className: 'steps-slider-thumb',
            style: { left: stepsPercent + '%', borderColor: stepsColor },
            onMouseDown: handleStepsDrag,
            onTouchStart: handleStepsDrag
          })
        )
      ),
      
      // Ряд: Формула расчёта + Бытовая активность
      React.createElement('div', { className: 'activity-cards-row' },
        // Плашка с формулой расчёта
        React.createElement('div', { className: 'formula-card' },
          React.createElement('div', { className: 'formula-card-header' },
            React.createElement('span', { className: 'formula-card-icon' }, '📊'),
            React.createElement('span', { className: 'formula-card-title' }, 'Расчёт калорий')
          ),
          React.createElement('div', { className: 'formula-card-rows' },
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, 'BMR'),
              React.createElement('span', { className: 'formula-value' }, bmr)
            ),
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Шаги'),
              React.createElement('span', { className: 'formula-value' }, stepsK)
            ),
            householdK > 0 && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Быт'),
              React.createElement('span', { className: 'formula-value' }, householdK)
            ),
            (train1k + train2k > 0) && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Тренировки'),
              React.createElement('span', { className: 'formula-value' }, r0(train1k + train2k))
            ),
            // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
            ndteData.active && ndteBoostKcal > 0 && React.createElement('div', { className: 'formula-row ndte-row' },
              React.createElement('span', { className: 'formula-label' }, 
                React.createElement('span', { style: { marginRight: '4px' } }, '🔥'),
                'Тренировка вчера'
              ),
              React.createElement('span', { className: 'formula-value ndte-value' }, '+' + ndteBoostKcal)
            ),
            React.createElement('div', { className: 'formula-row formula-subtotal' },
              React.createElement('span', { className: 'formula-label' }, '= Затраты'),
              React.createElement('span', { className: 'formula-value' }, tdee)
            ),
            dayTargetDef !== 0 && React.createElement('div', { className: 'formula-row' + (dayTargetDef < 0 ? ' deficit' : ' surplus') },
              React.createElement('span', { className: 'formula-label' }, dayTargetDef < 0 ? 'Дефицит' : 'Профицит'),
              React.createElement('span', { className: 'formula-value' }, (dayTargetDef > 0 ? '+' : '') + dayTargetDef + '%')
            ),
            // 💰 Калорийный долг (если есть)
            caloricDebt?.dailyBoost > 0 && React.createElement('div', { className: 'formula-row debt-row' },
              React.createElement('span', { className: 'formula-label' }, 
                React.createElement('span', { style: { marginRight: '4px' } }, '💰'),
                'Долг'
              ),
              React.createElement('span', { className: 'formula-value', style: { color: '#22c55e' } }, '+' + caloricDebt.dailyBoost)
            ),
            React.createElement('div', { className: 'formula-row formula-total' },
              React.createElement('span', { className: 'formula-label' }, 'Цель'),
              React.createElement('span', { className: 'formula-value' }, displayOptimum)
            )
          )
        ),
        // Правая колонка: бытовая активность + кнопка тренировки
        React.createElement('div', { className: 'activity-right-col' },
          // Бытовая активность - клик открывает статистику
          React.createElement('div', { 
            className: 'household-activity-card clickable',
            onClick: () => openHouseholdPicker('stats') // Открывает статистику
          },
            React.createElement('div', { className: 'household-activity-header' },
              React.createElement('span', { className: 'household-activity-icon' }, '🏠'),
              React.createElement('span', { className: 'household-activity-title' }, 'Бытовая активность'),
              householdActivities.length > 0 && React.createElement('span', { className: 'household-count-badge' }, householdActivities.length)
            ),
            React.createElement('div', { className: 'household-activity-value' },
              React.createElement('span', { className: 'household-value-number' }, totalHouseholdMin),
              React.createElement('span', { className: 'household-value-unit' }, 'мин')
            ),
            React.createElement('span', { className: 'household-stats-link' }, 
              React.createElement('span', { className: 'household-help-icon' }, '?'),
              ' подробнее'
            ),
            householdK > 0 && React.createElement('div', { className: 'household-value-kcal' }, '→ ' + householdK + ' ккал'),
            // Кнопка добавления внутри карточки
            React.createElement('button', { 
              className: 'household-add-btn',
              onClick: (e) => { 
                e.stopPropagation(); // Не открывать stats
                openHouseholdPicker('add'); // Только ввод
              }
            }, '+ Добавить')
          ),
          // Кнопка добавления тренировки
          visibleTrainings < 3 && React.createElement('button', {
            className: 'add-training-btn',
            onClick: () => {
              const newIndex = visibleTrainings;
              setVisibleTrainings(visibleTrainings + 1);
              // Сразу открываем picker для новой тренировки
              setTimeout(() => openTrainingPicker(newIndex), 50);
            }
          }, '+ Тренировка')
        )
      ),
      
      // Тренировки — компактные
      trainingsBlock
    );
    
    // === SKELETON LOADER ===
    const skeletonLoader = React.createElement('div', { className: 'skeleton-page' },
      // Skeleton для СТАТИСТИКА
      React.createElement('div', { className: 'skeleton-card skeleton-stats' },
        React.createElement('div', { className: 'skeleton-header' }),
        React.createElement('div', { className: 'skeleton-metrics' },
          React.createElement('div', { className: 'skeleton-metric' }),
          React.createElement('div', { className: 'skeleton-metric' }),
          React.createElement('div', { className: 'skeleton-metric' }),
          React.createElement('div', { className: 'skeleton-metric' })
        ),
        React.createElement('div', { className: 'skeleton-sparkline' }),
        React.createElement('div', { className: 'skeleton-progress' }),
        React.createElement('div', { className: 'skeleton-macros' },
          React.createElement('div', { className: 'skeleton-ring' }),
          React.createElement('div', { className: 'skeleton-ring' }),
          React.createElement('div', { className: 'skeleton-ring' })
        )
      ),
      // Skeleton для АКТИВНОСТЬ
      React.createElement('div', { className: 'skeleton-card skeleton-activity' },
        React.createElement('div', { className: 'skeleton-header' }),
        React.createElement('div', { className: 'skeleton-slider' }),
        React.createElement('div', { className: 'skeleton-row' },
          React.createElement('div', { className: 'skeleton-block' }),
          React.createElement('div', { className: 'skeleton-block' })
        )
      ),
      // Skeleton для приёмов пищи
      React.createElement('div', { className: 'skeleton-card skeleton-meal' },
        React.createElement('div', { className: 'skeleton-meal-header' }),
        React.createElement('div', { className: 'skeleton-search' }),
        React.createElement('div', { className: 'skeleton-item' }),
        React.createElement('div', { className: 'skeleton-item' })
      )
    );
    
    // УБРАНО: Скелетон вызывал мерцание при каждой загрузке
    // Теперь данные показываются мгновенно из localStorage (useState инициализирован из кэша)
    // isHydrated оставлен только для блокировки autosave до завершения sync
    // if (!isHydrated) {
    //   return React.createElement('div', { className: 'page page-day' }, skeletonLoader);
    // }
  
    return React.createElement(React.Fragment, null,
      React.createElement('div',{
      className: 'page page-day'
    },
      // === МОБИЛЬНЫЕ ПОД-ВКЛАДКИ УБРАНЫ ===
      // Теперь переключение stats/diary через нижнее меню (5 вкладок в App)
      
      // Pull-to-refresh индикатор (Enhanced)
      (pullProgress > 0 || isRefreshing) && React.createElement('div', {
        className: 'pull-indicator' 
          + (isRefreshing ? ' refreshing' : '') 
          + (refreshStatus === 'ready' ? ' ready' : '')
          + (refreshStatus === 'success' ? ' success' : ''),
        style: { 
          height: isRefreshing ? 56 : Math.max(pullProgress, 0),
          opacity: isRefreshing ? 1 : Math.min(pullProgress / 35, 1)
        }
      },
        React.createElement('div', { className: 'pull-spinner' },
          // Иконка в зависимости от состояния
          refreshStatus === 'success'
            ? React.createElement('span', { className: 'pull-spinner-icon success' }, '✓')
            : refreshStatus === 'error'
              ? React.createElement('span', { className: 'pull-spinner-icon' }, '✗')
              : refreshStatus === 'syncing'
                ? React.createElement('span', { className: 'pull-spinner-icon spinning' }, '↻')
                : React.createElement('span', { 
                    className: 'pull-spinner-icon' + (refreshStatus === 'ready' ? ' ready' : ''),
                    style: { 
                      transform: `rotate(${Math.min(pullProgress / PULL_THRESHOLD, 1) * 180}deg)`,
                      transition: 'transform 0.1s ease-out'
                    }
                  }, refreshStatus === 'ready' ? '↓' : '↻')
        ),
        React.createElement('span', { 
          className: 'pull-text' 
            + (refreshStatus === 'ready' ? ' ready' : '') 
            + (refreshStatus === 'syncing' ? ' syncing' : '')
        }, 
          refreshStatus === 'success' ? 'Готово!' 
            : refreshStatus === 'error' ? 'Ошибка синхронизации'
            : refreshStatus === 'syncing' ? 'Синхронизация...' 
            : refreshStatus === 'ready' ? 'Отпустите для обновления' 
            : 'Потяните для обновления'
        )
      ),
      
      // === ПОД-ВКЛАДКА 1: Статистика дня (или всё на десктопе) ===
      (!isMobile || mobileSubTab === 'stats') && orphanAlert,
      (!isMobile || mobileSubTab === 'stats') && statsBlock,
      (!isMobile || mobileSubTab === 'stats') && waterCard,
      (!isMobile || mobileSubTab === 'stats') && compactActivity,
      (!isMobile || mobileSubTab === 'stats') && sideBlock,
      (!isMobile || mobileSubTab === 'stats') && cycleCard,
      // Refeed Card — показывается если сегодня загрузочный день
      (!isMobile || mobileSubTab === 'stats') && day.isRefeedDay && HEYS.Refeed && HEYS.Refeed.renderRefeedCard({
        isRefeedDay: day.isRefeedDay,
        refeedReason: day.refeedReason,
        caloricDebt: caloricDebt,
        eatenKcal: eatenKcal,
        optimum: optimum
      }),
      
      // === FAB группа: приём пищи + вода (на обеих вкладках) ===
      isMobile && (mobileSubTab === 'stats' || mobileSubTab === 'diary') && React.createElement('div', {
        className: 'fab-group'
      },
        // FAB для добавления приёма пищи (🍽️)
        React.createElement('button', {
          className: 'meal-fab',
          onClick: () => {
            // Если на вкладке stats — сначала переключаемся на diary
            if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
              window.HEYS.App.setTab('diary');
              // Ждём переключения, затем скроллим и открываем модалку
              setTimeout(() => {
                const heading = document.getElementById('diary-heading');
                if (heading) {
                  heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setTimeout(() => addMeal(), 800);
              }, 200);
            } else {
              // Уже на diary — сразу скроллим и открываем
              const heading = document.getElementById('diary-heading');
              if (heading) {
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
              setTimeout(() => addMeal(), 800);
            }
          },
          'aria-label': 'Добавить приём пищи'
        }, '🍽️'),
        // FAB для быстрого добавления воды (+200мл)
        React.createElement('button', {
          className: 'water-fab',
          onClick: () => addWater(200),
          'aria-label': 'Добавить стакан воды'
        }, '🥛')
      ),
      
      // === ПОД-ВКЛАДКА 2: Дневник питания (или всё на десктопе) ===
      (!isMobile || mobileSubTab === 'diary') && goalProgressBar,
      // Refeed Toggle — кнопка включения загрузочного дня (показывается если есть рекомендация или активен)
      (!isMobile || mobileSubTab === 'diary') && HEYS.Refeed && HEYS.Refeed.renderRefeedToggle({
        isRefeedDay: day.isRefeedDay,
        refeedReason: day.refeedReason,
        caloricDebt: caloricDebt,
        optimum: optimum,
        onToggle: (isActive, reason) => {
          // Сохраняем через handleSave — патч к текущему day
          handleSave({ 
            isRefeedDay: isActive ? true : null,
            refeedReason: isActive ? reason : null
          });
        }
      }),
      (!isMobile || mobileSubTab === 'diary') && daySummary,
      
      // === Мини-график распределения калорий по приёмам ===
      (!isMobile || mobileSubTab === 'diary') && mealsChartData && mealsChartData.meals.length > 0 && React.createElement('div', { 
        className: 'meals-chart-container',
        style: { 
          margin: '12px 0', 
          padding: '12px 16px', 
          background: 'var(--surface, #fff)', 
          borderRadius: '12px',
          border: '1px solid var(--border, #e5e7eb)'
        }
      },
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '4px'
          }
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { 
              style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #6b7280)' }
            }, '📊 Распределение'),
            // Средний score
            mealsChartData.avgQualityScore > 0 && React.createElement('span', {
              className: 'meal-avg-score-badge',
              style: {
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '10px',
                background: mealsChartData.avgQualityScore >= 80 ? '#dcfce7' : mealsChartData.avgQualityScore >= 50 ? '#fef3c7' : '#fee2e2',
                color: mealsChartData.avgQualityScore >= 80 ? '#166534' : mealsChartData.avgQualityScore >= 50 ? '#92400e' : '#991b1b',
                fontWeight: '600'
              }
            }, 'avg ' + mealsChartData.avgQualityScore),
            // Comparison с вчера
            mealsChartData.yesterdayAvgScore > 0 && (() => {
              const diff = mealsChartData.avgQualityScore - mealsChartData.yesterdayAvgScore;
              if (Math.abs(diff) < 3) return null;
              return React.createElement('span', {
                style: {
                  fontSize: '10px',
                  color: diff > 0 ? '#16a34a' : '#dc2626',
                  fontWeight: '500'
                }
              }, diff > 0 ? '↑+' + diff : '↓' + diff);
            })()
          ),
          React.createElement('span', { 
            style: { 
              fontSize: '12px', 
              color: mealsChartData.totalKcal > mealsChartData.targetKcal ? '#dc2626' : '#059669'
            }
          }, mealsChartData.totalKcal + ' / ' + Math.round(mealsChartData.targetKcal) + ' ккал')
        ),
        // Подсказка нажми для деталей (скрывается после первого клика)
        !mealChartHintShown && React.createElement('div', { 
          className: 'meal-chart-hint'
        }, 
          React.createElement('span', null, '👆'),
          'Нажми на полоску для деталей'
        ),
        // Мини-спарклайн калорий за день (линия с точками и временной шкалой)
        mealsChartData.meals.length > 1 && React.createElement('div', {
          className: 'meals-day-sparkline',
          style: {
            position: 'relative',
            height: '60px',
            marginBottom: '12px',
            padding: '8px 0 16px 0'
          }
        },
          (() => {
            const meals = mealsChartData.meals;
            const maxKcal = Math.max(...meals.map(m => m.kcal), 200);
            const svgW = 280;
            const svgH = 40;
            const padding = 10;
            
            // Парсим время в минуты от начала дня
            const parseTime = (t) => {
              if (!t) return 0;
              const [h, m] = t.split(':').map(Number);
              return (h || 0) * 60 + (m || 0);
            };
            
            // Находим диапазон времени — минимальные отступы для максимального использования ширины
            const times = meals.map(m => parseTime(m.time)).filter(t => t > 0);
            const dataMinTime = times.length > 0 ? Math.min(...times) : 12 * 60;
            const dataMaxTime = times.length > 0 ? Math.max(...times) : 20 * 60;
            // Маленькие отступы 30 мин с каждой стороны — точки занимают почти всю ширину
            const minTime = dataMinTime - 30;
            const maxTime = dataMaxTime + 30;
            // Минимальный диапазон 1 час если все приёмы в одно время
            const timeRange = Math.max(maxTime - minTime, 60);
            
            // Находим лучший приём (по quality score)
            const bestIdx = mealsChartData.bestMealIndex;
            
            // Вычисляем точки с размером по калориям
            const points = meals.map((m, idx) => {
              const t = parseTime(m.time);
              const x = padding + ((t - minTime) / timeRange) * (svgW - 2 * padding);
              const y = svgH - padding - ((m.kcal / maxKcal) * (svgH - 2 * padding));
              // Размер точки: 3-7px в зависимости от калорий (100-800+ ккал)
              const r = 3 + Math.min(4, (m.kcal / 200));
              const isBest = idx === bestIdx && m.quality && m.quality.score >= 70;
              return { x, y, meal: m, idx, r, isBest };
            }).sort((a, b) => a.x - b.x);
            
            // Строим path для линии
            const linePath = points.length > 1 
              ? 'M ' + points.map(p => `${p.x},${p.y}`).join(' L ')
              : '';
            
            // Строим path для заливки под линией
            const areaPath = points.length > 1 
              ? `M ${points[0].x},${svgH - padding} ` + 
                points.map(p => `L ${p.x},${p.y}`).join(' ') + 
                ` L ${points[points.length - 1].x},${svgH - padding} Z`
              : '';
            
            // === Данные за вчера для сравнения ===
            const yesterdayPath = (() => {
              try {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yStr = yesterday.toISOString().slice(0, 10);
                const yData = lsGet('heys_dayv2_' + yStr, null);
                if (!yData || !yData.meals || yData.meals.length < 2) return '';
                
                const yMeals = yData.meals.filter(m => m.time && m.items?.length > 0);
                if (yMeals.length < 2) return '';
                
                // Считаем калории вчерашних приёмов
                const yPoints = yMeals.map(m => {
                  const t = parseTime(m.time);
                  let kcal = 0;
                  (m.items || []).forEach(item => {
                    const g = +item.grams || 0;
                    const nameKey = (item.name || '').trim().toLowerCase();
                    const prod = (nameKey && pIndex?.byName?.get(nameKey)) || (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
                    const src = prod || item; // fallback to inline data
                    if (src.kcal100 != null && g > 0) kcal += (+src.kcal100 || 0) * g / 100;
                  });
                  return { t, kcal };
                }).filter(p => p.t > 0 && p.kcal > 0);
                
                if (yPoints.length < 2) return '';
                
                // Используем тот же масштаб что и сегодня
                const yMaxKcal = Math.max(maxKcal, ...yPoints.map(p => p.kcal));
                const pts = yPoints.map(p => {
                  const x = padding + ((p.t - minTime) / timeRange) * (svgW - 2 * padding);
                  const y = svgH - padding - ((p.kcal / yMaxKcal) * (svgH - 2 * padding));
                  return { x: Math.max(padding, Math.min(svgW - padding, x)), y };
                }).sort((a, b) => a.x - b.x);
                
                return 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ');
              } catch (e) {
                return '';
              }
            })();
            
            return React.createElement('svg', {
              viewBox: `0 0 ${svgW} ${svgH + 12}`,
              style: { width: '100%', height: '100%' },
              preserveAspectRatio: 'xMidYMid meet'
            },
              // Градиенты
              React.createElement('defs', null,
                // Градиент для заливки под линией
                React.createElement('linearGradient', { id: 'mealSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#10b981', stopOpacity: '0.3' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#10b981', stopOpacity: '0.05' })
                ),
                // Градиент для зелёных зон (основные приёмы)
                React.createElement('linearGradient', { id: 'goodZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.12' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.02' })
                ),
                // Градиент для жёлтых зон (перекусы)
                React.createElement('linearGradient', { id: 'snackZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#eab308', stopOpacity: '0.08' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#eab308', stopOpacity: '0.01' })
                ),
                // Градиент для красной зоны (ночь)
                React.createElement('linearGradient', { id: 'badZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: '0.12' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: '0.02' })
                )
              ),
              // Динамические временные зоны (на основе первого приёма)
              (() => {
                // Находим время первого приёма (завтрак)
                const firstMealTime = times.length > 0 ? Math.min(...times) : 8 * 60;
                // Конец дня = 03:00 = 27:00 (в минутах от полуночи)
                const endOfDayMinutes = 27 * 60;
                // Делим оставшееся время на 6 слотов
                const slotDuration = (endOfDayMinutes - firstMealTime) / 6;
                
                // Слоты: завтрак, перекус1, обед, перекус2, ужин, ночь
                const zones = [
                  { start: firstMealTime - 30, end: firstMealTime + slotDuration * 0.3, gradient: 'url(#goodZoneGrad)', label: 'Завтрак' },
                  { start: firstMealTime + slotDuration * 0.8, end: firstMealTime + slotDuration * 1.5, gradient: 'url(#goodZoneGrad)', label: 'Обед' },
                  { start: firstMealTime + slotDuration * 2.8, end: firstMealTime + slotDuration * 3.5, gradient: 'url(#goodZoneGrad)', label: 'Ужин' },
                  { start: firstMealTime + slotDuration * 4.5, end: endOfDayMinutes, gradient: 'url(#badZoneGrad)', label: 'Ночь' }
                ];
                
                return zones.map((zone, i) => {
                  const x1 = padding + ((zone.start - minTime) / timeRange) * (svgW - 2 * padding);
                  const x2 = padding + ((zone.end - minTime) / timeRange) * (svgW - 2 * padding);
                  // Проверяем, что зона хотя бы частично видима
                  if (x2 < padding || x1 > svgW - padding) return null;
                  const clampedX1 = Math.max(padding, x1);
                  const clampedX2 = Math.min(svgW - padding, x2);
                  if (clampedX2 <= clampedX1) return null;
                  return React.createElement('rect', {
                    key: 'zone-' + i,
                    x: clampedX1,
                    y: 0,
                    width: clampedX2 - clampedX1,
                    height: svgH,
                    fill: zone.gradient,
                    rx: 3
                  });
                });
              })(),
              // Линия вчерашнего дня (для сравнения)
              yesterdayPath && React.createElement('path', {
                d: yesterdayPath,
                fill: 'none',
                stroke: '#9ca3af',
                strokeWidth: '1.5',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                className: 'meal-sparkline-yesterday'
              }),
              // Заливка под линией (с анимацией появления)
              areaPath && React.createElement('path', {
                d: areaPath,
                fill: 'url(#mealSparkGrad)',
                className: 'meal-sparkline-area'
              }),
              // Линия (с анимацией рисования)
              linePath && React.createElement('path', {
                d: linePath,
                fill: 'none',
                stroke: '#10b981',
                strokeWidth: '2',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                className: 'meal-sparkline-line',
                style: {
                  strokeDasharray: 500,
                  strokeDashoffset: 500
                }
              }),
              // Точки (с размером по калориям, пульсацией лучшего, кликом для popup, анимацией появления)
              points.map((p, i) => 
                React.createElement('g', { 
                  key: i,
                  className: 'meal-sparkline-dot',
                  style: { '--dot-delay': (1 + i * 0.4) + 's' }
                },
                  // Пульсирующий ореол для лучшего приёма
                  p.isBest && React.createElement('circle', {
                    cx: p.x,
                    cy: p.y,
                    r: p.r + 4,
                    fill: 'none',
                    stroke: '#22c55e',
                    strokeWidth: '2',
                    opacity: 0.6,
                    className: 'sparkline-pulse'
                  }),
                  // Основная точка
                  React.createElement('circle', {
                    cx: p.x,
                    cy: p.y,
                    r: p.r,
                    fill: p.meal.quality ? p.meal.quality.color : '#10b981',
                    stroke: p.isBest ? '#22c55e' : '#fff',
                    strokeWidth: p.isBest ? 2 : 1.5,
                    style: { cursor: 'pointer' },
                    onClick: (e) => {
                      e.stopPropagation();
                      const quality = p.meal.quality;
                      if (!quality) return;
                      const svg = e.target.closest('svg');
                      const svgRect = svg.getBoundingClientRect();
                      // Конвертируем SVG координаты в экранные
                      const viewBox = svg.viewBox.baseVal;
                      const scaleX = svgRect.width / viewBox.width;
                      const scaleY = svgRect.height / viewBox.height;
                      const screenX = svgRect.left + p.x * scaleX;
                      const screenY = svgRect.top + p.y * scaleY;
                      // Скрываем подсказку
                      if (!mealChartHintShown) {
                        setMealChartHintShown(true);
                        try { localStorage.setItem('heys_meal_hint_shown', '1'); } catch {}
                      }
                      // Confetti при идеальном score
                      if (quality.score >= 95) {
                        setShowConfetti(true);
                        setTimeout(() => setShowConfetti(false), 2000);
                      }
                      setMealQualityPopup({
                        meal: p.meal,
                        quality,
                        mealTypeInfo: { label: p.meal.name, icon: p.meal.icon },
                        x: screenX,
                        y: screenY + 15
                      });
                    }
                  })
                )
              ),
              // Временные метки под каждой точкой
              points.map((p, i) =>
                React.createElement('text', {
                  key: 'time-' + i,
                  x: p.x,
                  y: svgH + 10,
                  fontSize: '8',
                  fill: '#9ca3af',
                  textAnchor: 'middle'
                }, p.meal.time || '')
              )
            );
          })()
        ),
        // Горизонтальные полоски для каждого приёма (реверс — ближайшие сверху, как карточки)
        React.createElement('div', { 
          style: { display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }
        },
          // Вертикальная линия цели 100%
          React.createElement('div', {
            className: 'meals-target-line',
            style: {
              position: 'absolute',
              left: 'calc(100px + 100%)', // После времени и названия
              top: 0,
              bottom: 0,
              width: '0',
              borderLeft: '2px dashed rgba(16, 185, 129, 0.4)',
              pointerEvents: 'none',
              zIndex: 1
            }
          }),
          // Сортировка: ранние внизу, поздние вверху (без reverse)
          mealsChartData.meals.map((meal, i) => {
            const originalIndex = i; // Индекс соответствует порядку в массиве
            const widthPct = mealsChartData.targetKcal > 0 
              ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
              : 0;
            const barWidthPct = widthPct > 0 && widthPct < 12 ? 12 : widthPct; // минимальная видимость полоски
            const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
            const quality = meal.quality;
            const isBest = mealsChartData.bestMealIndex === originalIndex && quality && quality.score >= 70;
            const barFill = quality 
              ? `linear-gradient(90deg, ${quality.color} 0%, ${quality.color}cc 100%)`
              : (isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)');
            const problemBadges = quality?.badges?.filter(b => !b.ok).slice(0, 3) || [];
            const openQualityModal = (e) => {
              if (!quality) return;
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              console.log('[HEYS] openQualityModal:', { meal: meal.name, quality, rect });
              // Скрываем подсказку после первого клика
              if (!mealChartHintShown) {
                setMealChartHintShown(true);
                try { localStorage.setItem('heys_meal_hint_shown', '1'); } catch {}
              }
              // 🎉 Confetti при идеальном score!
              if (quality.score >= 95) {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 2000);
              }
              setMealQualityPopup({
                meal,
                quality,
                mealTypeInfo: { label: meal.name, icon: meal.icon },
                x: rect.left + rect.width / 2,
                y: rect.bottom
              });
            };
            const isLowScore = quality && quality.score < 50;
            const isNewMeal = newMealAnimatingIndex === originalIndex;
            return React.createElement('div', { 
              key: i, 
              className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                padding: '4px 6px',
                marginLeft: '-6px',
                marginRight: '-6px',
                borderRadius: '6px',
                background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                transition: 'background 0.2s ease'
              }
            },
              // Время слева — крупнее
              meal.time && React.createElement('span', { 
                style: { 
                  width: '50px', 
                  fontSize: '14px', 
                  fontWeight: '600',
                  color: 'var(--text-primary, #374151)', 
                  textAlign: 'left', 
                  flexShrink: 0 
                }
              }, U.formatMealTime ? U.formatMealTime(meal.time) : meal.time),
              // Название типа приёма — по центру, крупнее
              React.createElement('div', { 
                style: { 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '4px',
                  minWidth: '90px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'var(--text-primary, #1e293b)',
                  flexShrink: 0
                }
              },
                React.createElement('span', { style: { fontSize: '16px' } }, meal.icon),
                React.createElement('span', null, meal.name)
              ),
              // Полоска прогресса с бейджами внутри
              React.createElement('div', { 
                className: 'meal-bar-container' + (isBest ? ' meal-bar-best' : '') + (quality && quality.score >= 80 ? ' meal-bar-excellent' : ''),
                role: quality ? 'button' : undefined,
                tabIndex: quality ? 0 : undefined,
                onClick: openQualityModal,
                onKeyDown: quality ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualityModal(); } } : undefined,
                style: { 
                  flex: 1,
                  minWidth: 0,
                  height: '22px', 
                  background: 'var(--meal-bar-track, rgba(148,163,184,0.24))', 
                  borderRadius: '4px',
                  overflow: 'visible',
                  position: 'relative',
                  cursor: quality ? 'pointer' : 'default',
                  boxShadow: isBest ? '0 0 0 2px #fbbf24, 0 2px 8px rgba(251,191,36,0.3)' : undefined
                }
              },
                // Заливка
                React.createElement('div', { 
                  style: { 
                    width: barWidthPct + '%', 
                    height: '100%', 
                    background: barFill,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }
                }),
                // Калории справа от заливки + процент от нормы
                meal.kcal > 0 && React.createElement('span', {
                  style: {
                    position: 'absolute',
                    left: `calc(${barWidthPct}% + 6px)`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '10px',
                    fontWeight: '600',
                    color: 'var(--text-primary, #1f2937)',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }
                }, 
                  meal.kcal + ' ккал',
                  React.createElement('span', {
                    style: {
                      fontSize: '9px',
                      color: 'var(--text-tertiary, #9ca3af)',
                      fontWeight: '500'
                    }
                  }, '(' + Math.round(widthPct) + '%)')
                ),
                // Бейджи внутри полоски справа
                problemBadges.length > 0 && React.createElement('div', { 
                  style: {
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    gap: '2px'
                  }
                },
                  problemBadges.map((b, idx) => 
                    React.createElement('span', { 
                      key: idx, 
                      style: {
                        fontSize: '8px',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        background: 'rgba(239,68,68,0.9)',
                        color: '#fff',
                        fontWeight: '600'
                      }
                    }, '!' + b.type)
                  )
                )
              ),
              // Score справа
              quality && React.createElement('span', { 
                className: 'meal-quality-score', 
                style: { color: quality.color, flexShrink: 0 }
              }, '⭐' + quality.score)
            );
          }),
          // Streak banner с улучшенной анимацией
          mealsChartData.qualityStreak >= 3 && React.createElement('div', {
            className: 'meal-quality-streak-banner'
          },
            React.createElement('span', { className: 'streak-fire' }, '🔥'),
            React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } },
              mealsChartData.qualityStreak + ' отличных приёмов подряд!'
            ),
            React.createElement('span', { style: { fontSize: '16px' } }, '🏆')
          ),
          // Ачивка первого идеального приёма
          showFirstPerfectAchievement && React.createElement('div', {
            className: 'first-perfect-meal-badge',
            style: { marginTop: '8px' }
          },
            React.createElement('span', { className: 'trophy' }, '🏆'),
            'Первый идеальный приём!',
            React.createElement('span', null, '✨')
          )
        )
      ),
      
      // === INSULIN WAVE INDICATOR (WOW VERSION v3 — модуль) ===
      (!isMobile || mobileSubTab === 'diary') && insulinWaveData && (() => {
        // Мягкий shake когда осталось ≤30 мин до липолиза (almost или soon)
        const shouldShake = insulinWaveData.status === 'almost' || insulinWaveData.status === 'soon';
        const IW = typeof HEYS !== 'undefined' && HEYS.InsulinWave;
        
        // GI info — из модуля или fallback
        const giInfo = insulinWaveData.giCategory?.text 
          ? insulinWaveData.giCategory // модуль возвращает объект
          : { // fallback для старого формата
              low: { text: 'Низкий ГИ', color: '#22c55e', desc: 'медленное усвоение' },
              medium: { text: 'Средний ГИ', color: '#eab308', desc: 'нормальное' },
              high: { text: 'Высокий ГИ', color: '#f97316', desc: 'быстрое' },
              'very-high': { text: 'Очень высокий ГИ', color: '#ef4444', desc: 'очень быстрое' }
            }[insulinWaveData.giCategory] || { text: 'Средний ГИ', color: '#eab308', desc: 'нормальное' };
        
        // Форматирование времени липолиза
        const formatLipolysisTime = (minutes) => {
          if (minutes < 60) return `${minutes} мин`;
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          if (m === 0) return `${h}ч`;
          return `${h}ч ${m}м`;
        };
        
        // Прогресс-бар (из модуля или inline)
        const renderProgressBar = () => {
          if (IW && IW.renderProgressBar) {
            return IW.renderProgressBar(insulinWaveData);
          }
          
          const progress = insulinWaveData.progress;
          const isLipolysis = insulinWaveData.status === 'lipolysis';
          const lipolysisMinutes = insulinWaveData.lipolysisMinutes || 0;
          const remainingMinutes = insulinWaveData.remaining || 0;
          
          // Форматирование оставшегося времени
          const formatRemaining = (mins) => {
            if (mins <= 0) return 'скоро';
            if (mins < 60) return `${Math.round(mins)} мин`;
            const h = Math.floor(mins / 60);
            const m = Math.round(mins % 60);
            return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
          };
          
          const gradientBg = isLipolysis 
            ? 'linear-gradient(90deg, #22c55e, #10b981, #059669)' 
            : insulinWaveData.status === 'almost'
              ? 'linear-gradient(90deg, #f97316, #fb923c, #fdba74)'
              : insulinWaveData.status === 'soon'
                ? 'linear-gradient(90deg, #eab308, #facc15, #fde047)'
                : 'linear-gradient(90deg, #0284c7, #0ea5e9, #38bdf8)';
          
          return React.createElement('div', { className: 'insulin-wave-progress' },
            React.createElement('div', { 
              className: isLipolysis ? 'insulin-wave-bar lipolysis-progress-fill' : 'insulin-wave-bar', 
              style: { 
                width: '100%', 
                background: gradientBg,
                height: '28px',
                borderRadius: '8px',
                transition: 'all 0.3s ease'
              } 
            }),
            !isLipolysis && React.createElement('div', { className: 'insulin-wave-animation' }),
            // При липолизе: крупный таймер 🔥
            isLipolysis ? React.createElement('div', {
              className: 'lipolysis-timer-display',
              style: { 
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '14px', fontWeight: '800', color: '#fff',
                textShadow: '0 1px 3px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2
              }
            },
              React.createElement('span', null, formatLipolysisTime(lipolysisMinutes)),
              React.createElement('span', { style: { fontSize: '11px', opacity: 0.9, fontWeight: '600' } }, 'жиросжигание')
            )
            // При активной волне: время до липолиза
            : React.createElement('div', {
              style: { 
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2
              }
            },
              React.createElement('span', { style: { fontSize: '12px' } }, '⏱'),
              React.createElement('span', null, 'до липолиза: ' + formatRemaining(remainingMinutes))
            )
          );
        };
        
        // История волн (из модуля или inline)
        const renderWaveHistory = () => {
          if (IW && IW.renderWaveHistory) {
            return IW.renderWaveHistory(insulinWaveData);
          }
          
          const history = insulinWaveData.waveHistory || [];
          if (history.length === 0) return null;
          
          const firstMealMin = Math.min(...history.map(w => w.startMin));
          const lastMealEnd = Math.max(...history.map(w => w.endMin));
          const now = new Date();
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const rangeStart = firstMealMin - 15;
          const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
          const totalRange = rangeEnd - rangeStart;
          
          const w = 320, h = 60, padding = 4, barY = 20, barH = 18;
          const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);
          const formatTime = (min) => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
          
          return React.createElement('div', { className: 'insulin-history', style: { marginTop: '12px', margin: '12px -8px 0 -8px' } },
            React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' } }, '📊 Волны сегодня'),
            React.createElement('svg', { width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' } },
              React.createElement('defs', null,
                React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
                  React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#8b5cf6' })
                )
              ),
              React.createElement('line', { x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2, stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round' }),
              history.map((wave, i) => {
                const x1 = minToX(wave.startMin), x2 = minToX(wave.endMin), barW = Math.max(8, x2 - x1);
                const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';
                return React.createElement('g', { key: 'wave-' + i },
                  React.createElement('rect', { x: x1, y: barY, width: barW, height: barH, fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor, opacity: wave.isActive ? 1 : 0.6, rx: 4 }),
                  wave.isActive && React.createElement('rect', { x: x1, y: barY, width: barW, height: barH, fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4, className: 'wave-active-pulse' })
                );
              }),
              history.map((wave, i) => {
                const x = minToX(wave.startMin);
                return React.createElement('g', { key: 'meal-' + i },
                  React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
                  React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
                  React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' }, formatTime(wave.startMin))
                );
              }),
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
            React.createElement('div', { className: 'insulin-history-legend', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' } },
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
        
        // Expanded секция (полная версия из модуля или inline)
        const renderExpandedSection = () => {
          if (IW && IW.renderExpandedSection) {
            return IW.renderExpandedSection(insulinWaveData);
          }
          
          // Inline fallback с расширенными данными
          const formatDuration = (min) => {
            if (min <= 0) return '0 мин';
            const h = Math.floor(min / 60), m = Math.round(min % 60);
            return h > 0 ? (m > 0 ? `${h}ч ${m}м` : `${h}ч`) : `${m} мин`;
          };
          
          return React.createElement('div', { className: 'insulin-wave-expanded', onClick: e => e.stopPropagation() },
            // ГИ информация
            React.createElement('div', { className: 'insulin-gi-info' },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: giInfo.color } }),
                React.createElement('span', { style: { fontWeight: '600' } }, giInfo.text),
                React.createElement('span', { style: { color: '#64748b', fontSize: '12px' } }, '— ' + (giInfo.desc || ''))
              ),
              React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
                `Базовая волна: ${insulinWaveData.baseWaveHours}ч → Скорректированная: ${Math.round(insulinWaveData.insulinWaveHours * 10) / 10}ч`
              ),
              // Модификаторы белок/клетчатка
              (insulinWaveData.proteinBonus > 0 || insulinWaveData.fiberBonus > 0) && 
                React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                  insulinWaveData.totalProtein > 0 && React.createElement('span', null, 
                    `🥩 Белок: ${insulinWaveData.totalProtein}г${insulinWaveData.proteinBonus > 0 ? ` (+${Math.round(insulinWaveData.proteinBonus * 100)}%)` : ''}`
                  ),
                  insulinWaveData.totalFiber > 0 && React.createElement('span', null, 
                    `🌾 Клетчатка: ${insulinWaveData.totalFiber}г${insulinWaveData.fiberBonus > 0 ? ` (+${Math.round(insulinWaveData.fiberBonus * 100)}%)` : ''}`
                  )
                ),
              // 🏃 Workout бонус
              insulinWaveData.hasWorkoutBonus && 
                React.createElement('div', { style: { fontSize: '11px', color: '#22c55e', marginTop: '4px' } },
                  `🏃 Тренировка ${insulinWaveData.workoutMinutes} мин → волна ${Math.abs(Math.round(insulinWaveData.workoutBonus * 100))}% короче`
                ),
              // 🌅 Circadian rhythm
              insulinWaveData.circadianMultiplier && insulinWaveData.circadianMultiplier !== 1.0 &&
                React.createElement('div', { style: { fontSize: '11px', color: insulinWaveData.circadianMultiplier < 1 ? '#22c55e' : '#f97316', marginTop: '4px' } },
                  insulinWaveData.circadianDesc || `⏰ Время суток: ${insulinWaveData.circadianMultiplier < 1 ? 'быстрее' : 'медленнее'}`
                )
            ),
            
            // 🧪 v3.2.0: Шкала липолиза — уровень инсулина
            (() => {
              const IW = HEYS.InsulinWave;
              if (!IW || !IW.estimateInsulinLevel) return null;
              const insulinLevel = IW.estimateInsulinLevel(insulinWaveData.progress || 0);
              
              return React.createElement('div', { 
                className: 'insulin-lipolysis-scale',
                style: { marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }
              },
                // Заголовок
                React.createElement('div', { 
                  style: { fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }
                }, '🧪 Уровень инсулина (оценка)'),
                
                // Шкала — градиент
                React.createElement('div', { 
                  style: {
                    height: '8px',
                    borderRadius: '4px',
                    background: 'linear-gradient(to right, #22c55e 0%, #22c55e 5%, #eab308 15%, #f97316 50%, #ef4444 100%)',
                    position: 'relative'
                  }
                },
                  // Маркер текущего уровня
                  React.createElement('div', {
                    style: {
                      position: 'absolute',
                      left: `${Math.min(100, Math.max(0, insulinLevel.level))}%`,
                      top: '-4px',
                      width: '4px',
                      height: '16px',
                      background: '#fff',
                      borderRadius: '2px',
                      boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                      transform: 'translateX(-50%)',
                      transition: 'left 0.3s ease'
                    }
                  })
                ),
                
                // Метки под шкалой
                React.createElement('div', { 
                  style: { 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '10px', 
                    color: '#94a3b8',
                    marginTop: '4px'
                  }
                },
                  React.createElement('span', null, '🟢 <5'),
                  React.createElement('span', null, '🟡 15'),
                  React.createElement('span', null, '🟠 50'),
                  React.createElement('span', null, '🔴 100+')
                ),
                
                // Текущий уровень и описание
                React.createElement('div', {
                  style: { 
                    textAlign: 'center', 
                    fontSize: '13px',
                    color: insulinLevel.color,
                    marginTop: '8px',
                    fontWeight: '600'
                  }
                }, `~${insulinLevel.level} µЕд/мл • ${insulinLevel.desc}`),
                
                // Подсказка о жиросжигании
                insulinLevel.lipolysisPct < 100 && React.createElement('div', {
                  style: { 
                    fontSize: '11px', 
                    color: '#64748b', 
                    textAlign: 'center',
                    marginTop: '4px'
                  }
                }, `Жиросжигание: ~${insulinLevel.lipolysisPct}%`)
              );
            })(),
            
            // Предупреждение о перекрытии волн
            insulinWaveData.hasOverlaps && React.createElement('div', { 
              className: 'insulin-overlap-warning',
              style: { 
                marginTop: '8px', padding: '8px', 
                background: insulinWaveData.worstOverlap?.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                borderRadius: '8px', fontSize: '12px',
                border: `1px solid ${insulinWaveData.worstOverlap?.severity === 'high' ? '#fca5a5' : '#fcd34d'}`
              }
            },
              React.createElement('div', { style: { fontWeight: '600', color: insulinWaveData.worstOverlap?.severity === 'high' ? '#dc2626' : '#d97706' } },
                '⚠️ Волны пересеклись!'
              ),
              React.createElement('div', { style: { marginTop: '2px', color: '#64748b' } },
                (insulinWaveData.overlaps || []).map((o, i) => 
                  React.createElement('div', { key: i }, `${o.from} → ${o.to}: перекрытие ${o.overlapMinutes} мин`)
                )
              ),
              React.createElement('div', { style: { marginTop: '4px', fontSize: '11px', fontStyle: 'italic' } },
                `💡 Совет: подожди минимум ${Math.round(insulinWaveData.baseWaveHours * 60)} мин между приёмами`
              )
            ),
            
            // Персональная статистика
            insulinWaveData.personalAvgGap > 0 && React.createElement('div', { 
              className: 'insulin-personal-stats',
              style: { marginTop: '8px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '12px' }
            },
              React.createElement('div', { style: { fontWeight: '600', color: '#3b82f6', marginBottom: '4px' } }, '📊 Твои паттерны'),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b' } },
                React.createElement('span', null, 'Сегодня между приёмами:'),
                React.createElement('span', { style: { fontWeight: '600' } }, insulinWaveData.avgGapToday > 0 ? formatDuration(insulinWaveData.avgGapToday) : '—')
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
                React.createElement('span', null, 'Твой средний gap:'),
                React.createElement('span', { style: { fontWeight: '600' } }, formatDuration(insulinWaveData.personalAvgGap))
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
                React.createElement('span', null, 'Рекомендуемый:'),
                React.createElement('span', { style: { fontWeight: '600' } }, formatDuration(insulinWaveData.recommendedGap || insulinWaveData.baseWaveHours * 60))
              ),
              React.createElement('div', { 
                style: { 
                  marginTop: '6px', padding: '4px 8px', borderRadius: '4px', textAlign: 'center', fontWeight: '600',
                  background: insulinWaveData.gapQuality === 'excellent' ? '#dcfce7' : insulinWaveData.gapQuality === 'good' ? '#fef9c3' : insulinWaveData.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
                  color: insulinWaveData.gapQuality === 'excellent' ? '#166534' : insulinWaveData.gapQuality === 'good' ? '#854d0e' : insulinWaveData.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
                }
              },
                insulinWaveData.gapQuality === 'excellent' ? '🌟 Отлично! Выдерживаешь оптимальные промежутки' :
                insulinWaveData.gapQuality === 'good' ? '👍 Хорошо! Почти идеальные промежутки' :
                insulinWaveData.gapQuality === 'moderate' ? '😐 Можно лучше. Попробуй увеличить gap' :
                insulinWaveData.gapQuality === 'needs-work' ? '⚠️ Ешь слишком часто. Дай организму переварить' :
                '📈 Продолжай вести дневник для статистики'
              )
            ),
            
            // История волн
            renderWaveHistory()
          );
        };
        
        // Overlay вынесен отдельно через Fragment
        return React.createElement(React.Fragment, null,
          // Focus overlay (blur фон когда раскрыто) — ВНЕ карточки!
          insulinExpanded && React.createElement('div', { 
            className: 'insulin-focus-overlay',
            onClick: () => setInsulinExpanded(false)
          }),
          // Сама карточка с мягким shake при приближении липолиза
          React.createElement('div', { 
            className: 'insulin-wave-indicator insulin-' + insulinWaveData.status + (shouldShake ? ' shake-subtle' : '') + (insulinExpanded ? ' expanded' : ''),
            style: { 
              margin: '8px 0', 
              cursor: 'pointer',
              position: insulinExpanded ? 'relative' : undefined,
              zIndex: insulinExpanded ? 100 : undefined
            },
            onClick: () => setInsulinExpanded(!insulinExpanded)
          },
          
          // Анимированный фон волны
          React.createElement('div', { className: 'insulin-wave-bg' }),
          
          // Контент
          React.createElement('div', { className: 'insulin-wave-content' },
            // Header: иконка + label + статус
            React.createElement('div', { className: 'insulin-wave-header' },
              React.createElement('div', { className: 'insulin-wave-left' },
                React.createElement('span', { className: 'insulin-wave-icon' }, insulinWaveData.emoji),
                React.createElement('span', { className: 'insulin-wave-label' }, 
                  insulinWaveData.status === 'lipolysis' ? 'Липолиз активен! 🔥' : 'Инсулиновая волна'
                ),
                // Expand indicator
                React.createElement('span', { 
                  style: { fontSize: '10px', color: '#94a3b8', marginLeft: '4px' } 
                }, insulinExpanded ? '▲' : '▼')
              )
            ),
            
            // Прогресс-бар
            renderProgressBar(),
            
            // Подсказка
            insulinWaveData.subtext && React.createElement('div', { className: 'insulin-wave-suggestion' }, insulinWaveData.subtext),
            
            // 🏆 При липолизе: рекорд + streak + ккал
            insulinWaveData.status === 'lipolysis' && React.createElement('div', { 
              className: 'lipolysis-stats',
              style: { 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginTop: '8px',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.5)',
                borderRadius: '8px',
                fontSize: '12px',
                gap: '8px'
              }
            },
              // Рекорд
              React.createElement('div', { 
                style: { 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  color: insulinWaveData.isNewRecord ? '#f59e0b' : '#64748b'
                }
              },
                React.createElement('span', null, insulinWaveData.isNewRecord ? '🏆' : '🎯'),
                React.createElement('span', { style: { fontWeight: insulinWaveData.isNewRecord ? '700' : '500' } }, 
                  insulinWaveData.isNewRecord 
                    ? 'Новый рекорд!' 
                    : 'Рекорд: ' + formatLipolysisTime(insulinWaveData.lipolysisRecord?.minutes || 0)
                )
              ),
              // Streak
              insulinWaveData.lipolysisStreak?.current > 0 && React.createElement('div', { 
                style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e' }
              },
                React.createElement('span', null, '🔥'),
                React.createElement('span', { style: { fontWeight: '600' } }, 
                  insulinWaveData.lipolysisStreak.current + ' ' + 
                  (insulinWaveData.lipolysisStreak.current === 1 ? 'день' : 
                   insulinWaveData.lipolysisStreak.current < 5 ? 'дня' : 'дней')
                )
              ),
              // Примерно сожжённые ккал
              insulinWaveData.lipolysisKcal > 0 && React.createElement('div', { 
                style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }
              },
                React.createElement('span', null, '💪'),
                React.createElement('span', { style: { fontWeight: '600' } }, 
                  '~' + insulinWaveData.lipolysisKcal + ' ккал'
                )
              )
            ),
            
            // 🆕 v3.2.1: Аутофагия — показываем при активной фазе
            insulinWaveData.autophagy && insulinWaveData.isAutophagyActive && React.createElement('div', {
              className: 'autophagy-status',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
                padding: '8px 12px',
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.15))',
                borderRadius: '8px',
                border: '1px solid rgba(34, 197, 94, 0.3)'
              }
            },
              React.createElement('span', { style: { fontSize: '18px' } }, insulinWaveData.autophagy.icon),
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', { 
                  style: { fontWeight: '600', fontSize: '13px', color: insulinWaveData.autophagy.color }
                }, insulinWaveData.autophagy.label),
                React.createElement('div', { 
                  style: { fontSize: '11px', color: '#64748b' }
                }, 'Клеточное очищение • ' + Math.round(insulinWaveData.fastingHours) + 'ч голода')
              ),
              // Прогресс-бар внутри фазы
              React.createElement('div', { 
                style: { 
                  width: '40px', 
                  height: '4px', 
                  background: 'rgba(0,0,0,0.1)', 
                  borderRadius: '2px', 
                  overflow: 'hidden' 
                }
              },
                React.createElement('div', {
                  style: {
                    width: insulinWaveData.autophagy.progress + '%',
                    height: '100%',
                    background: insulinWaveData.autophagy.color,
                    transition: 'width 0.3s'
                  }
                })
              )
            ),
            
            // 🆕 v3.2.1: Холодовое воздействие — если активно
            insulinWaveData.hasColdExposure && React.createElement('div', {
              className: 'cold-exposure-badge',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '8px',
                padding: '6px 10px',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.15))',
                borderRadius: '6px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '12px'
              }
            },
              React.createElement('span', null, '🧊'),
              React.createElement('span', { style: { color: '#3b82f6', fontWeight: '500' } }, 
                insulinWaveData.coldExposure.desc
              )
            ),
            
            // 🆕 v3.2.1: Добавки — если есть
            insulinWaveData.hasSupplements && React.createElement('div', {
              className: 'supplements-badge',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '8px',
                padding: '6px 10px',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(192, 132, 252, 0.15))',
                borderRadius: '6px',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                fontSize: '12px'
              }
            },
              React.createElement('span', null, '🧪'),
              React.createElement('span', { style: { color: '#a855f7', fontWeight: '500' } }, 
                insulinWaveData.supplements.supplements.map(function(s) {
                  if (s === 'vinegar') return 'Уксус';
                  if (s === 'cinnamon') return 'Корица';
                  if (s === 'berberine') return 'Берберин';
                  return s;
                }).join(', ') + ' → ' + Math.abs(Math.round(insulinWaveData.supplementsBonus * 100)) + '% короче'
              )
            ),
            
            // === Expanded секция ===
            insulinExpanded && renderExpandedSection()
          )
        )  // закрываем Fragment
        );
      })(),
      
      // === ЗАГОЛОВОК ДНЕВНИКА ПИТАНИЯ ===
      (!isMobile || mobileSubTab === 'diary') && React.createElement('h2', {
        id: 'diary-heading',
        style: {
          fontSize: '24px',
          fontWeight: '800',
          color: '#1e293b',
          margin: '28px 0 20px 0',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          textAlign: 'center',
          scrollMarginTop: '150px' // Учитываем высоту шапки + плашки при прокрутке
        }
      }, 'ДНЕВНИК ПИТАНИЯ'),
      
      // Empty state когда нет приёмов пищи
      (!isMobile || mobileSubTab === 'diary') && (!day.meals || day.meals.length === 0) && React.createElement('div', { className: 'empty-state' },
        React.createElement('div', { className: 'empty-state-icon' }, '🍽️'),
        React.createElement('div', { className: 'empty-state-title' }, 'Пока нет приёмов пищи'),
        React.createElement('div', { className: 'empty-state-text' }, 'Добавьте первый приём, чтобы начать отслеживание'),
        React.createElement('button', { 
          className: 'btn btn-primary empty-state-btn',
          onClick: addMeal
        }, '+ Добавить приём')
      ),
      (!isMobile || mobileSubTab === 'diary') && mealsUI,
      React.createElement('div',{className:'row desktop-only',style:{justifyContent:'flex-start',marginTop:'8px'}}, React.createElement('button',{className:'btn',onClick:addMeal},'+ Приём')),
      
      // === Manual Advice List (полноэкранный список советов) ===
      adviceTrigger === 'manual' && adviceRelevant?.length > 0 && toastVisible && (() => {
        const { sorted, groups } = getSortedGroupedAdvices(adviceRelevant);
        const activeCount = sorted.filter(a => !dismissedAdvices.has(a.id)).length;
        const groupKeys = Object.keys(groups);
        
        return React.createElement('div', {
          className: 'advice-list-overlay',
          onClick: dismissToast
        },
            React.createElement('div', { 
              className: `advice-list-container${dismissAllAnimation ? ' shake-warning' : ''}`,
              onClick: e => e.stopPropagation(),
              onTouchStart: handleAdviceListTouchStart,
              onTouchMove: handleAdviceListTouchMove,
              onTouchEnd: handleAdviceListTouchEnd
            },
            // Заголовок
            React.createElement('div', { className: 'advice-list-header' },
              React.createElement('div', { className: 'advice-list-header-top' },
                React.createElement('span', null, `💡 Советы (${activeCount})`),
                activeCount > 1 && React.createElement('button', { 
                  className: 'advice-list-dismiss-all',
                  onClick: handleDismissAll,
                  disabled: dismissAllAnimation,
                  title: 'Пометить все советы прочитанными'
                }, 'Прочитать все')
              ),
              React.createElement('div', { className: 'advice-list-header-left' },
                React.createElement('div', { className: 'advice-list-toggles' },
                  // Автопоказ всплывающих советов (сначала переключатель, затем описание)
                  React.createElement('label', { 
                    className: 'ios-toggle-label',
                    title: toastsEnabled ? 'Отключить всплывающие советы' : 'Включить всплывающие советы'
                  },
                    React.createElement('div', { 
                      className: `ios-toggle ${toastsEnabled ? 'ios-toggle-on' : ''}`,
                      onClick: toggleToastsEnabled
                    },
                      React.createElement('div', { className: 'ios-toggle-thumb' })
                    ),
                    React.createElement('div', { className: 'advice-toggle-text-group' },
                      React.createElement('span', { className: 'ios-toggle-text' }, '🔔'),
                      React.createElement('span', { className: 'advice-toggle-hint' }, 'Автопоказ всплывающих советов')
                    )
                  ),
                  // Звук для советов
                  React.createElement('label', { 
                    className: 'ios-toggle-label',
                    title: adviceSoundEnabled ? 'Выключить звук советов' : 'Включить звук советов'
                  },
                    React.createElement('div', { 
                      className: `ios-toggle ${adviceSoundEnabled ? 'ios-toggle-on' : ''}`,
                      onClick: toggleAdviceSoundEnabled
                    },
                      React.createElement('div', { className: 'ios-toggle-thumb' })
                    ),
                    React.createElement('div', { className: 'advice-toggle-text-group' },
                      React.createElement('span', { className: 'ios-toggle-text' }, adviceSoundEnabled ? '🔊' : '🔇'),
                      React.createElement('span', { className: 'advice-toggle-hint' }, adviceSoundEnabled ? 'Звук советов включён' : 'Звук советов выключен')
                    )
                  )
                )
              )
            ),
            // Список советов с группировкой
            React.createElement('div', { className: 'advice-list-items' },
              groupKeys.length > 1 
                ? // С группировкой
                  groupKeys.map(category => {
                    const categoryAdvices = groups[category];
                    // Показываем не-dismissed + последний dismissed (для undo)
                    const activeCategoryAdvices = categoryAdvices.filter(a => 
                      !dismissedAdvices.has(a.id) || lastDismissedAdvice?.id === a.id
                    );
                    if (activeCategoryAdvices.length === 0) return null;
                    
                    return React.createElement('div', { 
                      key: category,
                      className: 'advice-group'
                    },
                      React.createElement('div', { className: 'advice-group-header' },
                        ADVICE_CATEGORY_NAMES[category] || category
                      ),
                      activeCategoryAdvices.map((advice) => 
                        React.createElement(AdviceCard, {
                          key: advice.id,
                          advice,
                          globalIndex: sorted.indexOf(advice),
                          isDismissed: dismissedAdvices.has(advice.id),
                          isHidden: hiddenUntilTomorrow.has(advice.id),
                          swipeState: adviceSwipeState[advice.id] || { x: 0, direction: null },
                          isExpanded: expandedAdviceId === advice.id,
                          isLastDismissed: lastDismissedAdvice?.id === advice.id,
                          lastDismissedAction: lastDismissedAdvice?.action,
                          onUndo: undoLastDismiss,
                          onClearLastDismissed: clearLastDismissed,
                          onSchedule: scheduleAdvice,
                          onToggleExpand: handleAdviceToggleExpand,
                          onRate: rateAdvice,
                          onSwipeStart: handleAdviceSwipeStart,
                          onSwipeMove: handleAdviceSwipeMove,
                          onSwipeEnd: handleAdviceSwipeEnd,
                          onLongPressStart: handleAdviceLongPressStart,
                          onLongPressEnd: handleAdviceLongPressEnd,
                          registerCardRef: registerAdviceCardRef
                        })
                      )
                    );
                  })
                : // Без группировки (одна категория)
                  sorted.filter(a => !dismissedAdvices.has(a.id) || lastDismissedAdvice?.id === a.id)
                    .map((advice, index) => React.createElement(AdviceCard, {
                      key: advice.id,
                      advice,
                      globalIndex: index,
                      isDismissed: dismissedAdvices.has(advice.id),
                      isHidden: hiddenUntilTomorrow.has(advice.id),
                      swipeState: adviceSwipeState[advice.id] || { x: 0, direction: null },
                      isExpanded: expandedAdviceId === advice.id,
                      isLastDismissed: lastDismissedAdvice?.id === advice.id,
                      lastDismissedAction: lastDismissedAdvice?.action,
                      onUndo: undoLastDismiss,
                      onClearLastDismissed: clearLastDismissed,
                      onSchedule: scheduleAdvice,
                      onToggleExpand: handleAdviceToggleExpand,
                      onRate: rateAdvice,
                      onSwipeStart: handleAdviceSwipeStart,
                      onSwipeMove: handleAdviceSwipeMove,
                      onSwipeEnd: handleAdviceSwipeEnd,
                      onLongPressStart: handleAdviceLongPressStart,
                      onLongPressEnd: handleAdviceLongPressEnd,
                      registerCardRef: registerAdviceCardRef
                    }))
            ),
            // Подсказки
            activeCount > 0 && React.createElement('div', { className: 'advice-list-hints' },
              React.createElement('span', { className: 'advice-list-hint-item' }, '← прочитано'),
              React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
              React.createElement('span', { className: 'advice-list-hint-item' }, 'скрыть →'),
              React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
              React.createElement('span', { className: 'advice-list-hint-item' }, 'удерживать = детали')
            )
          )
        );
      })(),
      
      // === Empty advice toast ===
      adviceTrigger === 'manual_empty' && toastVisible && React.createElement('div', {
        className: 'macro-toast macro-toast-success visible',
        role: 'alert',
        onClick: dismissToast,
        style: { transform: 'translateX(-50%) translateY(0)' }
      },
        React.createElement('div', { className: 'macro-toast-main' },
          React.createElement('span', { className: 'macro-toast-icon' }, '✨'),
          React.createElement('span', { className: 'macro-toast-text' }, 'Всё отлично! Советов нет'),
          React.createElement('button', { 
            className: 'macro-toast-close', 
            onClick: (e) => { e.stopPropagation(); dismissToast(); } 
          }, '×')
        )
      ),
      
      // === Auto Toast (для автоматических советов — tab_open, product_added) ===
      adviceTrigger !== 'manual' && adviceTrigger !== 'manual_empty' && displayedAdvice && toastVisible && React.createElement('div', {
        className: 'macro-toast macro-toast-' + displayedAdvice.type + 
          ' visible' + 
          (adviceExpanded ? ' expanded' : '') +
          (toastSwiped ? ' swiped' : '') +
          (displayedAdvice.animationClass ? ' anim-' + displayedAdvice.animationClass : '') +
          (displayedAdvice.id?.startsWith('personal_best') ? ' personal-best' : ''),
        role: 'alert',
        'aria-live': 'polite',
        onClick: () => {
          // Если overlay показан — клик на overlay обрабатывается отдельно
          if (toastSwiped) return;
          // По клику на тост — toggle details (если есть)
          if (Math.abs(toastSwipeX) < 10 && displayedAdvice.details) {
            haptic && haptic('light');
            setToastDetailsOpen(!toastDetailsOpen);
          }
        },
        onTouchStart: handleToastTouchStart,
        onTouchMove: handleToastTouchMove,
        onTouchEnd: handleToastTouchEnd,
        style: { 
          transform: toastSwiped 
            ? 'translateX(-50%) translateY(0)' 
            : `translateX(calc(-50% + ${toastSwipeX}px)) translateY(0)`, 
          opacity: toastSwiped ? 1 : 1 - Math.abs(toastSwipeX) / 150
        }
      },
        // Overlay после свайпа — абсолютно поверх контента, сохраняя размер и фон
        toastSwiped && React.createElement('div', {
          className: 'advice-undo-overlay',
          style: {
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'var(--toast-bg, #ecfdf5)',
            borderRadius: '10px',
            color: 'var(--color-slate-700, #334155)',
            fontWeight: 600,
            fontSize: '14px',
            zIndex: 10
          }
        },
          toastScheduledConfirm 
            ? React.createElement('span', { 
                style: { display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' } 
              }, '⏰ Напомню через 2 часа ✓')
            : React.createElement(React.Fragment, null,
                React.createElement('span', { style: { color: '#22c55e' } }, '✓ Прочитано'),
                React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                  React.createElement('button', { 
                    onClick: (e) => { e.stopPropagation(); handleToastUndo(); },
                    style: { 
                      background: 'rgba(0,0,0,0.08)', 
                      color: 'var(--color-slate-700, #334155)',
                      padding: '6px 12px', 
                      borderRadius: '12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      border: 'none'
                    } 
                  }, 'Отменить'),
                  React.createElement('button', { 
                    onClick: handleToastSchedule,
                    style: { 
                      background: 'rgba(0,0,0,0.06)', 
                      color: 'var(--color-slate-700, #334155)',
                      padding: '6px 12px', 
                      borderRadius: '12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    } 
                  }, '⏰ 2ч')
                )
              )
        ),
        // Основной контент тоста — всегда в DOM для сохранения размера
        React.createElement('div', { 
          className: 'macro-toast-main',
          style: { visibility: toastSwiped ? 'hidden' : 'visible' }
        },
          React.createElement('span', { className: 'macro-toast-icon' }, displayedAdvice.icon),
          React.createElement('span', { className: 'macro-toast-text' }, displayedAdvice.text),
          // Стрелка вверх для раскрытия списка + текст "все советы"
          React.createElement('div', { 
            className: 'macro-toast-expand',
            onClick: (e) => { 
              e.stopPropagation();
              // 🔧 Защита от случайных кликов — игнорируем первые 500ms после появления тоста
              const timeSinceAppear = Date.now() - toastAppearedAtRef.current;
              if (timeSinceAppear < 500) return;
              haptic && haptic('light');
              setAdviceExpanded(true);
              setAdviceTrigger('manual');
            },
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '4px 8px',
              cursor: 'pointer',
              opacity: 0.7,
              transition: 'opacity 0.2s',
              lineHeight: 1.1
            }
          },
            React.createElement('span', { style: { fontSize: '14px' } }, '▲'),
            React.createElement('span', { style: { fontSize: '9px' } }, 'все'),
            React.createElement('span', { style: { fontSize: '9px' } }, 'советы')
          )
        ),
        // Строка с кнопкой "Подробнее" слева и подсказкой "свайп" справа
        React.createElement('div', {
          style: {
            display: 'flex',
            visibility: toastSwiped ? 'hidden' : 'visible',
            alignItems: 'center',
            justifyContent: displayedAdvice.details ? 'space-between' : 'flex-end',
            padding: '6px 0 2px 0',
            marginTop: '2px'
          }
        },
          // Кнопка "▼ Подробнее" — если есть details
          displayedAdvice.details && React.createElement('div', {
            onClick: (e) => {
              e.stopPropagation();
              haptic && haptic('light');
              setToastDetailsOpen(!toastDetailsOpen);
            },
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'rgba(100, 100, 100, 0.8)',
              fontWeight: 500
            }
          },
            React.createElement('span', {
              style: {
                display: 'inline-block',
                transition: 'transform 0.2s',
                transform: toastDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)'
              }
            }, '▼'),
            toastDetailsOpen ? 'Скрыть' : 'Детали'
          ),
          // Подсказка свайп влево
          React.createElement('span', { 
            style: {
              fontSize: '11px',
              color: 'rgba(128, 128, 128, 0.6)'
            }
          }, '← свайп — прочитано')
        ),
        // Развёрнутые details (скрываем при swipe)
        !toastSwiped && toastDetailsOpen && displayedAdvice.details && React.createElement('div', {
          style: {
            padding: '8px 12px',
            fontSize: '13px',
            lineHeight: '1.4',
            color: 'rgba(80, 80, 80, 0.9)',
            background: 'rgba(0, 0, 0, 0.03)',
            borderRadius: '8px',
            marginTop: '4px',
            marginBottom: '4px'
          }
        }, displayedAdvice.details)
      ),
      
      // Version footer removed (moved to LoginScreen)
      null,
      
      // Meal Creation/Edit Modal (mobile only)
      showTimePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTimePicker },
          React.createElement('div', { 
            ref: bottomSheetRef,
            className: 'time-picker-modal', 
            onClick: e => e.stopPropagation()
          },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelTimePicker)
            }),
            
            // Step 1: Время (показывается при editMode='new' или 'time')
            pickerStep === 1 && React.createElement('div', { 
              className: 'time-picker-step' + (animDirection === 'back' ? ' back' : ''),
              key: 'step1'
            },
              React.createElement('div', { className: 'time-picker-header' },
                React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTimePicker }, 'Отмена'),
                React.createElement('span', { className: 'time-picker-title' }, editMode === 'time' ? 'Изменить время' : 'Время приёма'),
                // Если редактируем только время — "Готово", если новый — "Далее"
                editMode === 'time'
                  ? React.createElement('button', { className: 'time-picker-confirm', onClick: confirmTimeEdit }, 'Готово')
                  : React.createElement('button', { className: 'time-picker-confirm', onClick: goToMoodStep }, 'Далее')
              ),
              React.createElement('div', { className: 'time-picker-wheels' },
                React.createElement(WheelColumn, {
                  values: hoursValues,
                  selected: pendingMealTime.hours,
                  onChange: (i) => setPendingMealTime(prev => ({...prev, hours: i})),
                  label: 'Часы'
                }),
                React.createElement('div', { className: 'time-picker-separator' }, ':'),
                React.createElement(WheelColumn, {
                  values: minutesValues,
                  selected: pendingMealTime.minutes,
                  onChange: (i) => setPendingMealTime(prev => ({...prev, minutes: i})),
                  label: 'Минуты'
                })
              ),
              // Подсказка для ночных часов (00:00-02:59)
              isNightHourSelected && React.createElement('div', { className: 'night-time-hint' },
                React.createElement('span', { className: 'night-time-icon' }, '🌙'),
                React.createElement('span', { className: 'night-time-text' }, 
                  'Ночной приём — запишется в ',
                  React.createElement('b', null, currentDateLabel)
                )
              ),
              // Предпросмотр типа приёма
              (() => {
                const timeStr = `${String(pendingMealTime.hours).padStart(2, '0')}:${String(pendingMealTime.minutes).padStart(2, '0')}`;
                const previewType = pendingMealType || HEYS.dayUtils.getMealTypeForPreview(timeStr, day.meals || []);
                const typeInfo = HEYS.dayUtils.MEAL_TYPES[previewType];
                return React.createElement('div', { className: 'meal-type-preview' },
                  React.createElement('span', { className: 'meal-type-preview-label' }, 'Тип приёма:'),
                  React.createElement('div', { className: 'meal-type-preview-value meal-type-' + previewType },
                    React.createElement('span', { className: 'meal-type-preview-icon' }, typeInfo.icon),
                    React.createElement('span', { className: 'meal-type-preview-name' }, typeInfo.name),
                    React.createElement('select', {
                      className: 'meal-type-preview-select',
                      value: previewType,
                      onChange: (e) => setPendingMealType(e.target.value)
                    },
                      Object.entries(HEYS.dayUtils.MEAL_TYPES).map(([key, val]) =>
                        React.createElement('option', { key, value: key }, val.icon + ' ' + val.name)
                      )
                    )
                  )
                );
              })()
            ),
            
            // Step 2: Самочувствие (показывается при editMode='new' или 'mood')
            pickerStep === 2 && React.createElement('div', { 
              className: 'time-picker-step' + (animDirection === 'forward' ? '' : ' back'),
              key: 'step2'
            },
              React.createElement('div', { className: 'time-picker-header' },
                // Если редактируем только оценки — "Отмена", если новый — "← Назад"
                editMode === 'mood'
                  ? React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTimePicker }, 'Отмена')
                  : React.createElement('button', { className: 'time-picker-cancel', onClick: goBackToTimeStep }, '← Назад'),
                React.createElement('span', { className: 'time-picker-title' }, editMode === 'mood' ? 'Оценки' : 'Самочувствие'),
                // Если редактируем только оценки — confirmMoodEdit, если новый — confirmMealCreation
                editMode === 'mood'
                  ? React.createElement('button', { className: 'time-picker-confirm', onClick: confirmMoodEdit }, 'Готово')
                  : React.createElement('button', { className: 'time-picker-confirm', onClick: confirmMealCreation }, 'Готово')
              ),
              // Подсказка для первого приёма в день
              (day.meals || []).length === 0 && editMode === 'new' && React.createElement('div', { className: 'mood-hint-first' },
                '💡 Ставьте первую оценку, которая пришла в голову — это самое верное интуитивное решение'
              ),
              // Helper функции для слайдеров
              // Dynamic emoji по значению
              ...(() => {
                const getMoodEmoji = (v) => ['😢','😢','😕','😕','😐','😐','🙂','🙂','😊','😊','😄'][v] || '😊';
                const getWellbeingEmoji = (v) => ['🤒','🤒','😓','😓','😐','😐','🙂','🙂','💪','💪','🏆'][v] || '💪';
                const getStressEmoji = (v) => ['😌','😌','🙂','🙂','😐','😐','😟','😟','😰','😰','😱'][v] || '😰';
                
                // Composite mood face на основе всех трёх оценок
                const getCompositeFace = () => {
                  const m = pendingMealMood.mood || 5;
                  const w = pendingMealMood.wellbeing || 5;
                  const s = pendingMealMood.stress || 5;
                  const avg = (m + w + (10 - s)) / 3; // stress инвертируем
                  if (avg >= 8) return { emoji: '🤩', text: 'Супер!' };
                  if (avg >= 6.5) return { emoji: '😊', text: 'Хорошо' };
                  if (avg >= 5) return { emoji: '😐', text: 'Норм' };
                  if (avg >= 3.5) return { emoji: '😕', text: 'Так себе' };
                  return { emoji: '😢', text: 'Плохо' };
                };
                const compositeFace = getCompositeFace();
                
                // ⏰ Таймер с последнего приёма пищи
                const getTimeSinceLastMeal = () => {
                  const meals = day.meals || [];
                  if (meals.length === 0) return null;
                  const lastMeal = meals[meals.length - 1];
                  if (!lastMeal.time) return null;
                  
                  const [h, m] = lastMeal.time.split(':').map(Number);
                  const lastMealDate = new Date();
                  lastMealDate.setHours(h, m, 0, 0);
                  
                  const now = new Date();
                  const diffMs = now - lastMealDate;
                  if (diffMs < 0) return null; // прошлый день
                  
                  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                  
                  // Инсулиновая волна из профиля (по умолчанию 4 часа)
                  const insulinWave = prof?.insulinWaveHours || 4;
                  const isInsulinOk = diffHours >= insulinWave;
                  
                  return {
                    hours: diffHours,
                    mins: diffMins,
                    isOk: isInsulinOk,
                    insulinWave
                  };
                };
                const timeSinceLastMeal = getTimeSinceLastMeal();
                
                // 🎉 Триггер confetti при идеальных оценках (используем состояние из родительского компонента)
                const triggerConfetti = () => {
                  if (!showConfetti) {
                    setShowConfetti(true);
                    // Haptic celebration
                    if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50, 100]);
                    // Звук celebration
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      const playNote = (freq, time, dur) => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.type = 'sine';
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0.06, ctx.currentTime + time);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + dur);
                        osc.start(ctx.currentTime + time);
                        osc.stop(ctx.currentTime + time + dur);
                      };
                      // Мажорный аккорд C-E-G-C
                      playNote(523.25, 0, 0.15);
                      playNote(659.25, 0.1, 0.15);
                      playNote(783.99, 0.2, 0.15);
                      playNote(1046.50, 0.3, 0.2);
                    } catch(e) {}
                    // Автоскрытие через 2 секунды
                    setTimeout(() => setShowConfetti(false), 2000);
                  }
                };
                
                // Цвет значения по позиции (positive: red→blue→green)
                const getPositiveColor = (v) => {
                  if (v <= 3) return '#ef4444';
                  if (v <= 5) return '#3b82f6';
                  if (v <= 7) return '#22c55e';
                  return '#10b981';
                };
                // Negative: green→blue→red (для стресса)
                const getNegativeColor = (v) => {
                  if (v <= 3) return '#10b981';
                  if (v <= 5) return '#3b82f6';
                  if (v <= 7) return '#eab308';
                  return '#ef4444';
                };
                
                // Haptic feedback с интенсивностью
                const triggerHaptic = (intensity = 10) => {
                  if (navigator.vibrate) navigator.vibrate(intensity);
                };
                
                // Звуковой tick (очень тихий) + success звук
                const playTick = (() => {
                  let lastValue = null;
                  return (value) => {
                    if (lastValue !== null && lastValue !== value) {
                      try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.frequency.value = 800 + value * 50;
                        gain.gain.value = 0.03;
                        osc.start();
                        osc.stop(ctx.currentTime + 0.02);
                      } catch (e) {}
                    }
                    lastValue = value;
                  };
                })();
                
                // Приятный звук при хорошей оценке (4-5)
                const playSuccessSound = () => {
                  try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
                    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
                    gain.gain.setValueAtTime(0.05, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.25);
                  } catch (e) {}
                };
                
                // Корреляция с прошлыми данными
                const getCorrelationHint = () => {
                  try {
                    // Ищем похожие паттерны за последние 14 дней
                    const mood = pendingMealMood.mood;
                    const stress = pendingMealMood.stress;
                    if (mood === 0 && stress === 0) return null;
                    
                    for (let i = 1; i <= 14; i++) {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const dData = lsGet('heys_dayv2_' + fmtDate(d), null);
                      if (!dData) continue;
                      
                      // Низкое настроение — ищем связь с недосыпом
                      if (mood > 0 && mood <= 3 && dData.sleepHours && dData.sleepHours < 6) {
                        const dMoods = (dData.meals || []).map(m => m.mood).filter(v => v > 0);
                        const avgMood = dMoods.length > 0 ? dMoods.reduce((a,b) => a+b, 0) / dMoods.length : 5;
                        if (avgMood <= 4) {
                          return { icon: '💡', text: `${i} дн. назад при ${dData.sleepHours}ч сна тоже было настроение ${Math.round(avgMood)}` };
                        }
                      }
                      
                      // Высокий стресс — ищем связь с переработкой
                      if (stress >= 7) {
                        const dStress = (dData.meals || []).map(m => m.stress).filter(v => v > 0);
                        const avgStress = dStress.length > 0 ? dStress.reduce((a,b) => a+b, 0) / dStress.length : 5;
                        if (avgStress >= 7) {
                          return { icon: '🔄', text: `${i} дн. назад тоже был высокий стресс — паттерн?` };
                        }
                      }
                    }
                  } catch (e) {}
                  return null;
                };
                
                const correlationHint = getCorrelationHint();
                
                // emojiAnimating теперь на уровне компонента (useState нельзя в IIFE)
                
                // Quick chips для комментария
                const getQuickChips = () => {
                  if (moodJournalState === 'negative') {
                    if (pendingMealMood.stress >= 7) return ['Работа', 'Дедлайн', 'Конфликт', 'Усталость'];
                    if (pendingMealMood.wellbeing <= 3) return ['Голова', 'Живот', 'Слабость', 'Недосып'];
                    if (pendingMealMood.mood <= 3) return ['Тревога', 'Грусть', 'Злость', 'Апатия'];
                    return ['Устал', 'Стресс', 'Плохо спал'];
                  }
                  if (moodJournalState === 'positive') {
                    if (pendingMealMood.mood >= 8) return ['Радость', 'Успех', 'Встреча', 'Природа'];
                    if (pendingMealMood.stress <= 2) return ['Отдых', 'Медитация', 'Прогулка', 'Спорт'];
                    return ['Хороший день', 'Энергия', 'Мотивация'];
                  }
                  return [];
                };
                
                // Подсчёт заполненности
                const filledCount = (pendingMealMood.mood > 0 ? 1 : 0) + (pendingMealMood.wellbeing > 0 ? 1 : 0) + (pendingMealMood.stress > 0 ? 1 : 0);
                
                // Разница с предыдущим приёмом
                const prevMeal = (day.meals || []).length > 0 ? day.meals[day.meals.length - 1] : null;
                const getDiff = (current, prev) => {
                  if (!prev || prev === 0 || current === 0) return null;
                  const diff = current - prev;
                  if (diff === 0) return { text: '=', className: 'diff-same' };
                  if (diff > 0) return { text: `+${diff}`, className: 'diff-up' };
                  return { text: `${diff}`, className: 'diff-down' };
                };
                
                // Сравнение с вчера (средние значения)
                const getYesterdayAvg = (field) => {
                  try {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yKey = 'heys_dayv2_' + fmtDate(yesterday);
                    const yData = lsGet(yKey, null);
                    if (!yData || !yData.meals || yData.meals.length === 0) return null;
                    const values = yData.meals.map(m => m[field]).filter(v => v > 0);
                    if (values.length === 0) return null;
                    return Math.round(values.reduce((a,b) => a+b, 0) / values.length);
                  } catch (e) { return null; }
                };
                const yesterdayMood = getYesterdayAvg('mood');
                const yesterdayWellbeing = getYesterdayAvg('wellbeing');
                const yesterdayStress = getYesterdayAvg('stress');
                
                // AI-подсказка корреляции (mood→eating pattern)
                const getAIInsight = () => {
                  try {
                    // Собираем историю за 14 дней
                    const history = [];
                    for (let i = 1; i <= 14; i++) {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const dData = lsGet('heys_dayv2_' + fmtDate(d), null);
                      if (dData && dData.meals && dData.meals.length > 0) {
                        // Средние оценки за день
                        const moods = dData.meals.map(m => m.mood).filter(v => v > 0);
                        const avgMood = moods.length > 0 ? moods.reduce((a,b) => a+b, 0) / moods.length : 5;
                        // Калории за день
                        let kcal = 0;
                        dData.meals.forEach(m => (m.items || []).forEach(item => {
                          const nameKey = (item.name || '').trim().toLowerCase();
                          const p = (nameKey && pIndex?.byName?.get(nameKey)) || (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
                          const src = p || item; // fallback to inline data
                          if (src.kcal100 != null) kcal += ((+src.kcal100 || 0) * (+item.grams || 0) / 100);
                        }));
                        const ratio = kcal / (optimum || 2000);
                        history.push({ avgMood, ratio });
                      }
                    }
                    if (history.length < 5) return null;
                    
                    // Анализируем паттерны
                    const lowMoodDays = history.filter(h => h.avgMood < 5);
                    const highMoodDays = history.filter(h => h.avgMood >= 7);
                    
                    const currentMood = pendingMealMood.mood;
                    
                    if (currentMood < 5 && lowMoodDays.length >= 3) {
                      const avgOvereat = lowMoodDays.reduce((a, h) => a + h.ratio, 0) / lowMoodDays.length;
                      if (avgOvereat > 1.15) {
                        const overPct = Math.round((avgOvereat - 1) * 100);
                        return { icon: '🤖', text: `При плохом настроении ты обычно переедаешь на ${overPct}%` };
                      }
                    }
                    
                    if (currentMood >= 7 && highMoodDays.length >= 3) {
                      const avgRatio = highMoodDays.reduce((a, h) => a + h.ratio, 0) / highMoodDays.length;
                      if (avgRatio >= 0.85 && avgRatio <= 1.1) {
                        return { icon: '✨', text: 'Хорошее настроение = сбалансированное питание!' };
                      }
                    }
                    
                    return null;
                  } catch (e) { return null; }
                };
                const aiInsight = getAIInsight();
                
                // Контекстные подсказки по времени дня
                const getTimeHint = () => {
                  const hour = new Date().getHours();
                  if (hour >= 6 && hour < 10) return '☀️ Как проснулся?';
                  if (hour >= 12 && hour < 14) return '🍽️ Как после обеда?';
                  if (hour >= 14 && hour < 17) return '😴 Не клонит в сон?';
                  if (hour >= 17 && hour < 21) return '🌆 Как день прошёл?';
                  if (hour >= 21 || hour < 6) return '🌙 Устал за день?';
                  return null;
                };
                const timeHint = getTimeHint();
                
                // Mini sparkline для последних 5 приёмов
                const getSparkline = (field) => {
                  const meals = day.meals || [];
                  if (meals.length === 0) return null;
                  const values = meals.slice(-5).map(m => m[field] || 0).filter(v => v > 0);
                  if (values.length === 0) return null;
                  return values;
                };
                
                const renderSparkline = (values, isNegative = false) => {
                  if (!values || values.length === 0) return null;
                  const max = 10;
                  const width = 60;
                  const height = 16;
                  const step = width / Math.max(values.length - 1, 1);
                  const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');
                  return React.createElement('svg', { 
                    className: 'mood-sparkline',
                    width: width, 
                    height: height,
                    viewBox: `0 0 ${width} ${height}`
                  },
                    React.createElement('polyline', {
                      points: points,
                      fill: 'none',
                      stroke: isNegative ? '#ef4444' : '#22c55e',
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round'
                    })
                  );
                };
                
                // Рендер метки "вчера"
                const renderYesterdayMark = (value, isNegative = false) => {
                  if (value === null) return null;
                  const pct = (value / 10) * 100;
                  return React.createElement('div', { 
                    className: 'yesterday-mark',
                    style: { left: `${pct}%` },
                    title: `Вчера в среднем: ${value}`
                  }, '▼');
                };
                
                const moodDiff = getDiff(pendingMealMood.mood, prevMeal?.mood);
                const wellbeingDiff = getDiff(pendingMealMood.wellbeing, prevMeal?.wellbeing);
                const stressDiff = getDiff(pendingMealMood.stress, prevMeal?.stress);
                
                // Вычисляем общее состояние на основе всех 3 оценок
                const { mood, wellbeing, stress } = pendingMealMood;
                const hasAnyRating = mood > 0 || wellbeing > 0 || stress > 0;
                
                // Позитивные сигналы: высокие mood/wellbeing (≥7), низкий stress (≤3)
                const positiveSignals = (mood >= 7 ? 1 : 0) + (wellbeing >= 7 ? 1 : 0) + (stress > 0 && stress <= 3 ? 1 : 0);
                // Негативные сигналы: низкие mood/wellbeing (≤3), высокий stress (≥7)
                const negativeSignals = (mood > 0 && mood <= 3 ? 1 : 0) + (wellbeing > 0 && wellbeing <= 3 ? 1 : 0) + (stress >= 7 ? 1 : 0);
                
                // Определяем состояние: positive, negative или neutral
                const moodJournalState = negativeSignals >= 2 ? 'negative' : // 2+ плохих = плохо
                                         negativeSignals === 1 && positiveSignals === 0 ? 'negative' : // 1 плохой и нет хороших = плохо  
                                         positiveSignals >= 2 ? 'positive' : // 2+ хороших = хорошо
                                         positiveSignals === 1 && negativeSignals === 0 ? 'positive' : // 1 хороший и нет плохих = хорошо
                                         'neutral'; // смешанные или нейтральные оценки
                
                // Детальный текст в зависимости от комбинации оценок
                const getJournalText = () => {
                  if (moodJournalState === 'negative') {
                    // Комбинации негативных состояний
                    if (stress >= 8 && mood <= 3 && wellbeing <= 3) return '😰 Тяжёлый момент — что происходит?';
                    if (stress >= 8 && mood <= 3) return 'Стресс + плохое настроение — расскажи';
                    if (stress >= 8 && wellbeing <= 3) return 'Стресс + плохое самочувствие — что случилось?';
                    if (mood <= 3 && wellbeing <= 3) return 'И настроение, и самочувствие... что не так?';
                    if (stress >= 7) return 'Что стрессует?';
                    if (wellbeing <= 3) return 'Плохое самочувствие — что беспокоит?';
                    if (mood <= 3) return 'Плохое настроение — что расстроило?';
                    return 'Что случилось?';
                  }
                  if (moodJournalState === 'positive') {
                    // Комбинации позитивных состояний
                    if (mood >= 9 && wellbeing >= 9 && stress <= 2) return '🌟 Идеальное состояние! В чём секрет?';
                    if (mood >= 8 && wellbeing >= 8) return '✨ Отлично себя чувствуешь! Что помогло?';
                    if (mood >= 8 && stress <= 2) return 'Отличное настроение и спокойствие!';
                    if (wellbeing >= 8 && stress <= 2) return 'Прекрасное самочувствие! Что способствует?';
                    if (mood >= 7) return 'Хорошее настроение! Что порадовало?';
                    if (wellbeing >= 7) return 'Хорошее самочувствие! Запиши причину';
                    if (stress <= 2) return 'Спокойствие — что помогает расслабиться?';
                    return 'Запиши что порадовало!';
                  }
                  // neutral — разные контексты
                  if (mood >= 5 && mood <= 6 && wellbeing >= 5 && wellbeing <= 6) return 'Стабильный день — любые мысли?';
                  if (stress >= 4 && stress <= 6) return 'Немного напряжения — хочешь записать?';
                  return 'Заметка о приёме пищи';
                };
                
                const getJournalPlaceholder = () => {
                  if (moodJournalState === 'negative') {
                    if (stress >= 7) return 'Работа, отношения, здоровье...';
                    if (wellbeing <= 3) return 'Симптомы, усталость, боль...';
                    if (mood <= 3) return 'Что расстроило или разозлило...';
                    return 'Расскажи что не так...';
                  }
                  if (moodJournalState === 'positive') {
                    if (mood >= 8 && wellbeing >= 8) return 'Что сделало день отличным?';
                    if (stress <= 2) return 'Медитация, прогулка, отдых...';
                    return 'Что сделало момент хорошим?';
                  }
                  return 'Любые мысли о еде или дне...';
                };

                const journalConfig = {
                  negative: { 
                    icon: '📝', 
                    text: getJournalText(),
                    placeholder: getJournalPlaceholder(),
                    btnText: 'Записать'
                  },
                  positive: {
                    icon: '✨',
                    text: getJournalText(),
                    placeholder: getJournalPlaceholder(),
                    btnText: 'Записать'
                  },
                  neutral: {
                    icon: '💭',
                    text: getJournalText(),
                    placeholder: getJournalPlaceholder(),
                    btnText: 'Записать'
                  }
                };
                
                // Slider handler с haptic, звуком и анимацией emoji
                const handleSliderChange = (field, value, prevValue) => {
                  triggerHaptic(value >= 8 || value <= 2 ? 15 : 10);
                  playTick(value);
                  
                  // Emoji анимация
                  if (value !== prevValue) {
                    const animType = (field === 'stress' && value >= 7) || 
                                     ((field === 'mood' || field === 'wellbeing') && value <= 3) 
                                     ? 'shake' : 'bounce';
                    setEmojiAnimating(prev => ({...prev, [field]: animType}));
                    setTimeout(() => setEmojiAnimating(prev => ({...prev, [field]: ''})), 400);
                  }
                  
                  // Success sound при хорошей оценке
                  if (value >= 8 && prevValue < 8) playSuccessSound();
                  
                  // Обновляем состояние
                  const newMood = {...pendingMealMood, [field]: value};
                  setPendingMealMood(newMood);
                  
                  // Проверяем идеальные оценки для confetti
                  const isPerfect = newMood.mood >= 8 && newMood.wellbeing >= 8 && 
                                    newMood.stress > 0 && newMood.stress <= 2;
                  if (isPerfect && !showConfetti) {
                    triggerConfetti();
                  }
                };
                
                // Добавить chip в комментарий
                const addChipToComment = (chip) => {
                  triggerHaptic(5);
                  const current = pendingMealMood.journalEntry || '';
                  const newEntry = current ? current + ', ' + chip : chip;
                  setPendingMealMood(prev => ({...prev, journalEntry: newEntry}));
                };
                
                return [
              // 🎉 Confetti animation
              showConfetti && React.createElement('div', { className: 'confetti-container mood-confetti', key: 'confetti' },
                ...Array(20).fill(0).map((_, i) => 
                  React.createElement('div', { 
                    key: 'confetti-' + i, 
                    className: 'confetti-piece',
                    style: {
                      left: (5 + Math.random() * 90) + '%',
                      animationDelay: (Math.random() * 0.5) + 's',
                      backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][i % 5]
                    }
                  })
                )
              ),
              
              // Progress dots
              React.createElement('div', { className: 'rating-progress-dots', key: 'progress-dots' },
                React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.mood > 0 ? ' filled' : '') }),
                React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.wellbeing > 0 ? ' filled' : '') }),
                React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.stress > 0 ? ' filled' : '') })
              ),
              
              // ⏰ Таймер с последнего приёма
              timeSinceLastMeal && React.createElement('div', { 
                className: 'meal-timer-hint' + (timeSinceLastMeal.isOk ? ' ok' : ' warning'),
                key: 'meal-timer'
              },
                React.createElement('span', { className: 'meal-timer-icon' }, timeSinceLastMeal.isOk ? '✅' : '⏰'),
                React.createElement('span', { className: 'meal-timer-text' },
                  timeSinceLastMeal.hours > 0 
                    ? `${timeSinceLastMeal.hours}ч ${timeSinceLastMeal.mins}мин с прошлого приёма`
                    : `${timeSinceLastMeal.mins} мин с прошлого приёма`
                ),
                !timeSinceLastMeal.isOk && React.createElement('span', { className: 'meal-timer-wave' },
                  ` (инсулиновая волна ${timeSinceLastMeal.insulinWave}ч)`
                )
              ),
              
              // Mood Face Avatar (большое лицо вверху)
              React.createElement('div', { className: 'mood-face-avatar', key: 'mood-face' },
                React.createElement('span', { className: 'mood-face-emoji' + (showConfetti ? ' celebrate' : '') }, compositeFace.emoji),
                React.createElement('span', { className: 'mood-face-text' }, compositeFace.text)
              ),
              
              // Контекстная подсказка по времени
              timeHint && (day.meals || []).length === 0 && React.createElement('div', { className: 'mood-time-hint', key: 'time-hint' }, timeHint),
              
              // AI-инсайт
              aiInsight && React.createElement('div', { className: 'mood-ai-insight', key: 'ai-insight' },
                React.createElement('span', null, aiInsight.icon),
                React.createElement('span', null, aiInsight.text)
              ),
              
              // Корреляция с прошлыми данными
              correlationHint && React.createElement('div', { className: 'correlation-hint', key: 'correlation-hint' },
                React.createElement('span', { className: 'correlation-hint-icon' }, correlationHint.icon),
                React.createElement('span', { className: 'correlation-hint-text' }, correlationHint.text)
              ),
              
              // Слайдеры оценок
              React.createElement('div', { className: 'mood-sliders', key: 'mood-sliders' },
                // Настроение
                React.createElement('div', { className: 'mood-slider-row' },
                  React.createElement('div', { className: 'mood-slider-header' },
                    React.createElement('span', { 
                      className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.mood ? ' animate-' + emojiAnimating.mood : '')
                    }, getMoodEmoji(pendingMealMood.mood)),
                    React.createElement('span', { className: 'mood-slider-label' }, 'Настроение'),
                    React.createElement('span', { 
                      className: 'mood-slider-value' + (pendingMealMood.mood !== (prevMeal?.mood || 0) ? ' pulse' : ''), 
                      style: { color: pendingMealMood.mood === 0 ? '#999' : getPositiveColor(pendingMealMood.mood) }
                    }, pendingMealMood.mood === 0 ? '—' : pendingMealMood.mood),
                    moodDiff && React.createElement('span', { className: 'mood-diff ' + moodDiff.className }, moodDiff.text)
                  ),
                  // Quick presets
                  React.createElement('div', { className: 'mood-presets' },
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-bad' + (pendingMealMood.mood <= 3 && pendingMealMood.mood > 0 ? ' active' : ''),
                      onClick: () => { handleSliderChange('mood', 2, pendingMealMood.mood); }
                    }, '😢 Плохо'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-ok' + (pendingMealMood.mood >= 4 && pendingMealMood.mood <= 6 ? ' active' : ''),
                      onClick: () => { handleSliderChange('mood', 5, pendingMealMood.mood); }
                    }, '😐 Норм'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-good' + (pendingMealMood.mood >= 7 ? ' active' : ''),
                      onClick: () => { handleSliderChange('mood', 8, pendingMealMood.mood); }
                    }, '😊 Отлично')
                  ),
                  React.createElement('div', { className: 'mood-slider-track' },
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: pendingMealMood.mood,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => handleSliderChange('mood', parseInt(e.target.value))
                    }),
                    renderYesterdayMark(yesterdayMood)
                  ),
                  // Sparkline истории
                  (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                    renderSparkline(getSparkline('mood')),
                    React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                  )
                ),
                // Самочувствие
                React.createElement('div', { className: 'mood-slider-row' },
                  React.createElement('div', { className: 'mood-slider-header' },
                    React.createElement('span', { 
                      className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.wellbeing ? ' animate-' + emojiAnimating.wellbeing : '')
                    }, getWellbeingEmoji(pendingMealMood.wellbeing)),
                    React.createElement('span', { className: 'mood-slider-label' }, 'Самочувствие'),
                    React.createElement('span', { 
                      className: 'mood-slider-value' + (pendingMealMood.wellbeing !== (prevMeal?.wellbeing || 0) ? ' pulse' : ''), 
                      style: { color: pendingMealMood.wellbeing === 0 ? '#999' : getPositiveColor(pendingMealMood.wellbeing) }
                    }, pendingMealMood.wellbeing === 0 ? '—' : pendingMealMood.wellbeing),
                    wellbeingDiff && React.createElement('span', { className: 'mood-diff ' + wellbeingDiff.className }, wellbeingDiff.text)
                  ),
                  React.createElement('div', { className: 'mood-presets' },
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-bad' + (pendingMealMood.wellbeing <= 3 && pendingMealMood.wellbeing > 0 ? ' active' : ''),
                      onClick: () => { handleSliderChange('wellbeing', 2, pendingMealMood.wellbeing); }
                    }, '🤒 Плохо'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-ok' + (pendingMealMood.wellbeing >= 4 && pendingMealMood.wellbeing <= 6 ? ' active' : ''),
                      onClick: () => { handleSliderChange('wellbeing', 5, pendingMealMood.wellbeing); }
                    }, '😐 Норм'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-good' + (pendingMealMood.wellbeing >= 7 ? ' active' : ''),
                      onClick: () => { handleSliderChange('wellbeing', 8, pendingMealMood.wellbeing); }
                    }, '💪 Отлично')
                  ),
                  React.createElement('div', { className: 'mood-slider-track' },
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: pendingMealMood.wellbeing,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => handleSliderChange('wellbeing', parseInt(e.target.value))
                    }),
                    renderYesterdayMark(yesterdayWellbeing)
                  ),
                  (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                    renderSparkline(getSparkline('wellbeing')),
                    React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                  )
                ),
                // Стресс (инверсия)
                React.createElement('div', { className: 'mood-slider-row' },
                  React.createElement('div', { className: 'mood-slider-header' },
                    React.createElement('span', { 
                      className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.stress ? ' animate-' + emojiAnimating.stress : '')
                    }, getStressEmoji(pendingMealMood.stress)),
                    React.createElement('span', { className: 'mood-slider-label' }, 'Стресс'),
                    React.createElement('span', { 
                      className: 'mood-slider-value' + (pendingMealMood.stress !== (prevMeal?.stress || 0) ? ' pulse' : ''), 
                      style: { color: pendingMealMood.stress === 0 ? '#999' : getNegativeColor(pendingMealMood.stress) }
                    }, pendingMealMood.stress === 0 ? '—' : pendingMealMood.stress),
                    stressDiff && React.createElement('span', { className: 'mood-diff ' + (stressDiff.text.startsWith('+') ? 'diff-down' : stressDiff.text === '=' ? 'diff-same' : 'diff-up') }, stressDiff.text)
                  ),
                  React.createElement('div', { className: 'mood-presets' },
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-good' + (pendingMealMood.stress <= 3 && pendingMealMood.stress > 0 ? ' active' : ''),
                      onClick: () => { handleSliderChange('stress', 2, pendingMealMood.stress); }
                    }, '😌 Спокоен'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-ok' + (pendingMealMood.stress >= 4 && pendingMealMood.stress <= 6 ? ' active' : ''),
                      onClick: () => { handleSliderChange('stress', 5, pendingMealMood.stress); }
                    }, '😐 Норм'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-bad' + (pendingMealMood.stress >= 7 ? ' active' : ''),
                      onClick: () => { handleSliderChange('stress', 8, pendingMealMood.stress); }
                    }, '😰 Стресс')
                  ),
                  React.createElement('div', { className: 'mood-slider-track' },
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: pendingMealMood.stress,
                      className: 'mood-slider mood-slider-negative',
                      onChange: (e) => handleSliderChange('stress', parseInt(e.target.value))
                    }),
                    renderYesterdayMark(yesterdayStress, true)
                  ),
                  (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                    renderSparkline(getSparkline('stress'), true),
                    React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                  )
                )
              ),
              
              // Блок комментария — всегда виден, стиль меняется по всем 3 оценкам
              React.createElement('div', { 
                className: 'mood-journal-wrapper ' + moodJournalState, 
                key: 'journal-wrapper' 
              },
                React.createElement('div', { 
                  className: 'mood-journal-prompt ' + moodJournalState
                },
                  React.createElement('span', { className: 'mood-journal-icon' }, journalConfig[moodJournalState].icon),
                  React.createElement('span', { className: 'mood-journal-text' }, journalConfig[moodJournalState].text),
                  // Quick chips для быстрого ввода
                  getQuickChips().length > 0 && React.createElement('div', { 
                    className: 'quick-chips ' + moodJournalState 
                  },
                    getQuickChips().map(chip => 
                      React.createElement('button', { 
                        key: chip,
                        className: 'quick-chip' + ((pendingMealMood.journalEntry || '').includes(chip) ? ' selected' : ''),
                        onClick: () => addChipToComment(chip)
                      }, chip)
                    )
                  ),
                  // Поле ввода комментария
                  React.createElement('input', {
                    type: 'text',
                    className: 'mood-journal-input',
                    placeholder: journalConfig[moodJournalState].placeholder,
                    value: pendingMealMood.journalEntry || '',
                    onChange: (e) => setPendingMealMood(prev => ({...prev, journalEntry: e.target.value})),
                    onClick: (e) => e.stopPropagation()
                  })
                )
              )
                ];
              })()
            )
          )
        ),
        document.body
      ),
      
      // Модалки подтверждения удаления теперь через HEYS.ConfirmModal
      
      // Edit Grams Modal (slider-based, like MealAddProduct)
      editGramsTarget && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop grams-modal-backdrop', onClick: cancelEditGramsModal },
          React.createElement('div', { className: 'time-picker-modal grams-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelEditGramsModal)
            }),
            // Header
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelEditGramsModal }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title grams-modal-title' }, 
                editGramsTarget.product?.name || 'Граммы'
              ),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmEditGramsModal }, 'Готово')
            ),
            // Главный input граммов (HERO)
            React.createElement('div', { className: 'grams-input-hero' },
              React.createElement('button', {
                className: 'grams-stepper-btn grams-stepper-btn--hero',
                onClick: () => {
                  const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                  setEditGramsValue(Math.max(step, editGramsValue - step));
                  if (typeof haptic === 'function') haptic('light');
                }
              }, '−'),
              React.createElement('form', { 
                className: 'grams-input-hero__field',
                onSubmit: e => {
                  e.preventDefault();
                  confirmEditGramsModal();
                }
              },
                React.createElement('input', {
                  ref: editGramsInputRef,
                  type: 'text',
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  enterKeyHint: 'done',
                  className: 'grams-input grams-input--hero',
                  value: editGramsValue,
                  onChange: e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setEditGramsValue(Math.max(1, Math.min(2000, parseInt(val) || 0)));
                  },
                  onKeyDown: e => {
                    if (e.key === 'Enter' || e.keyCode === 13) {
                      e.preventDefault();
                      e.target.blur();
                      confirmEditGramsModal();
                    }
                  },
                  onFocus: e => e.target.select(),
                  onClick: e => e.target.select()
                }),
                React.createElement('span', { className: 'grams-input-suffix--hero' }, 'г')
              ),
              React.createElement('button', {
                className: 'grams-stepper-btn grams-stepper-btn--hero',
                onClick: () => {
                  const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                  setEditGramsValue(Math.min(2000, editGramsValue + step));
                  if (typeof haptic === 'function') haptic('light');
                }
              }, '+')
            ),
            // Калории (вторичная информация)
            React.createElement('div', { className: 'grams-kcal-secondary' },
              React.createElement('span', { className: 'grams-kcal-secondary__value' }, 
                Math.round((editGramsTarget.product?.kcal100 || 0) * editGramsValue / 100) + ' ккал'
              )
            ),
            // 🍽️ Порции продукта (если есть)
            editPortions.length > 0 && React.createElement('div', { className: 'grams-portions' },
              editPortions.map((portion, idx) => {
                const isActive = editGramsValue === portion.grams;
                const isRecommended = editLastPortionGrams === portion.grams && !isActive;
                return React.createElement('button', {
                  key: idx,
                  className: 'grams-portion-btn' + (isActive ? ' active' : '') + (isRecommended ? ' recommended' : ''),
                  onClick: () => {
                    setEditGramsValue(portion.grams);
                    if (typeof haptic === 'function') haptic('light');
                  }
                }, 
                  React.createElement('span', { className: 'portion-name' }, portion.name),
                  React.createElement('span', { className: 'portion-grams' }, portion.grams + 'г')
                );
              })
            ),
            // Slider
            React.createElement('div', { className: 'grams-slider-container' },
              React.createElement('div', {
                className: 'grams-slider',
                onMouseDown: handleEditGramsDrag,
                onTouchStart: handleEditGramsDrag
              },
                React.createElement('div', { className: 'grams-slider-track' }),
                React.createElement('div', { 
                  className: 'grams-slider-fill',
                  style: { width: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
                }),
                React.createElement('div', { 
                  className: 'grams-slider-thumb',
                  style: { left: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
                }),
                // Метки
                [100, 200, 300, 400].map(mark => 
                  React.createElement('div', {
                    key: mark,
                    className: 'grams-slider-mark',
                    style: { left: ((mark - 10) / (500 - 10) * 100) + '%' }
                  })
                )
              ),
              React.createElement('div', { className: 'grams-slider-labels' },
                React.createElement('span', null, '10'),
                React.createElement('span', null, '500')
              )
            ),
            // Presets
            React.createElement('div', { className: 'grams-presets' },
              [50, 100, 150, 200, 250].map(preset =>
                React.createElement('button', {
                  key: preset,
                  className: 'grams-preset' + (editGramsValue === preset ? ' active' : ''),
                  onClick: () => {
                    setEditGramsValue(preset);
                    try { navigator.vibrate?.(5); } catch(e) {}
                  }
                }, preset + 'г')
              )
            )
          )
        ),
        document.body
      ),
      
      // Zone Formula Popup (показывает формулу расчёта калорий зоны)
      zoneFormulaPopup && ReactDOM.createPortal(
        React.createElement('div', { 
          className: 'zone-formula-backdrop',
          onClick: closeZoneFormula
        },
          React.createElement('div', { 
            className: 'zone-formula-popup' + (zoneFormulaPopup.showAbove ? ' show-above' : ''),
            style: {
              position: 'fixed',
              left: zoneFormulaPopup.left + 'px',
              top: zoneFormulaPopup.top + 'px'
            },
            onClick: e => e.stopPropagation()
          },
            (() => {
              const zi = zoneFormulaPopup.zi;
              const ti = zoneFormulaPopup.ti;
              const T = TR[ti] || { z: [0, 0, 0, 0] };
              const minutes = +T.z[zi] || 0;
              const met = mets[zi] || [2.5, 6, 8, 10][zi];
              const kcal = r0(minutes * kcalPerMin(met, weight));
              
              return React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'zone-formula-header' },
                  React.createElement('span', { className: 'zone-formula-badge' }, 'Z' + (zi + 1)),
                  React.createElement('span', { className: 'zone-formula-name' }, zoneNames[zi])
                ),
                React.createElement('div', { className: 'zone-formula-values' },
                  React.createElement('div', { className: 'zone-formula-row' },
                    React.createElement('span', { className: 'zone-formula-label' }, 'MET'),
                    React.createElement('span', { className: 'zone-formula-value' }, met)
                  ),
                  React.createElement('div', { className: 'zone-formula-row' },
                    React.createElement('span', { className: 'zone-formula-label' }, 'Вес'),
                    React.createElement('span', { className: 'zone-formula-value' }, weight + ' кг')
                  ),
                  React.createElement('div', { className: 'zone-formula-row' },
                    React.createElement('span', { className: 'zone-formula-label' }, 'Минуты'),
                    React.createElement('span', { className: 'zone-formula-value' }, minutes + ' мин')
                  )
                ),
                React.createElement('div', { className: 'zone-formula-calc' },
                  React.createElement('div', { className: 'zone-formula-expression' },
                    minutes + ' × ' + met + ' × ' + weight + ' × 0.0175 − 1'
                  ),
                  React.createElement('div', { className: 'zone-formula-result' },
                    '= ' + kcal + ' ккал'
                  )
                ),
                React.createElement('button', { 
                  className: 'zone-formula-edit-btn',
                  onClick: () => {
                    closeZoneFormula();
                    openTrainingPicker(ti);
                  }
                }, '✏️ Изменить')
              );
            })()
          )
        ),
        document.body
      ),
      
      // Household Formula Popup (показывает формулу расчёта калорий бытовой активности)
      householdFormulaPopup && ReactDOM.createPortal(
        React.createElement('div', { 
          className: 'zone-formula-backdrop',
          onClick: closeHouseholdFormula
        },
          React.createElement('div', { 
            className: 'zone-formula-popup' + (householdFormulaPopup.showAbove ? ' show-above' : ''),
            style: {
              position: 'fixed',
              left: householdFormulaPopup.left + 'px',
              top: householdFormulaPopup.top + 'px'
            },
            onClick: e => e.stopPropagation()
          },
            (() => {
              const hi = householdFormulaPopup.hi;
              const h = householdActivities[hi] || { minutes: 0 };
              const minutes = +h.minutes || 0;
              const met = 2.5;
              const kcal = r0(minutes * kcalPerMin(met, weight));
              
              return React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'zone-formula-header' },
                  React.createElement('span', { className: 'zone-formula-badge household' }, '🏠'),
                  React.createElement('span', { className: 'zone-formula-name' }, 'Бытовая активность')
                ),
                React.createElement('div', { className: 'zone-formula-values' },
                  React.createElement('div', { className: 'zone-formula-row' },
                    React.createElement('span', { className: 'zone-formula-label' }, 'MET'),
                    React.createElement('span', { className: 'zone-formula-value' }, met + ' (лёгкая)')
                  ),
                  React.createElement('div', { className: 'zone-formula-row' },
                    React.createElement('span', { className: 'zone-formula-label' }, 'Вес'),
                    React.createElement('span', { className: 'zone-formula-value' }, weight + ' кг')
                  ),
                  React.createElement('div', { className: 'zone-formula-row' },
                    React.createElement('span', { className: 'zone-formula-label' }, 'Минуты'),
                    React.createElement('span', { className: 'zone-formula-value' }, minutes + ' мин')
                  )
                ),
                React.createElement('div', { className: 'zone-formula-calc' },
                  React.createElement('div', { className: 'zone-formula-expression' },
                    minutes + ' × ' + met + ' × ' + weight + ' × 0.0175 − 1'
                  ),
                  React.createElement('div', { className: 'zone-formula-result' },
                    '= ' + kcal + ' ккал'
                  )
                ),
                React.createElement('button', { 
                  className: 'zone-formula-edit-btn',
                  onClick: () => {
                    closeHouseholdFormula();
                    openHouseholdPicker('edit', hi);
                  }
                }, '✏️ Изменить')
              );
            })()
          )
        ),
        document.body
      ),
      
      // Zone Minutes Picker Modal (for training zones)
      showZonePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelZonePicker },
          React.createElement('div', { className: 'time-picker-modal zone-picker-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelZonePicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelZonePicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, 
                'Зона ' + (zonePickerTarget ? zonePickerTarget.zoneIndex + 1 : '')
              ),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmZonePicker }, 'Готово')
            ),
            // Подсказка с калориями
            React.createElement('div', { className: 'zone-picker-kcal-hint' },
              '🔥 ',
              r0(zoneMinutesValues[pendingZoneMinutes] * (kcalMin[zonePickerTarget?.zoneIndex] || 0)),
              ' ккал'
            ),
            React.createElement('div', { className: 'time-picker-wheels zone-wheels' },
              React.createElement(WheelColumn, {
                values: zoneMinutesValues.map(v => v + ' мин'),
                selected: pendingZoneMinutes,
                onChange: (i) => setPendingZoneMinutes(i)
              })
            )
          )
        ),
        document.body
      ),
      
      // Training Picker Modal
      showTrainingPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTrainingPicker },
          React.createElement('div', { 
            className: 'time-picker-modal training-picker-modal', 
            onClick: e => e.stopPropagation()
          },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelTrainingPicker)
            }),
            
            // Заголовок
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTrainingPicker }, 
                trainingPickerStep >= 2 ? '← Назад' : 'Отмена'
              ),
              React.createElement('span', { className: 'time-picker-title' }, 
                trainingPickerStep === 1 ? '🏋️ Тренировка' : 
                trainingPickerStep === 2 ? '⏱️ Зоны' : '⭐ Оценка'
              ),
              // Кнопка "Готово" неактивна если на шаге 2 и все зоны = 0
              (() => {
                const totalMinutes = trainingPickerStep === 2 
                  ? pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0)
                  : 1; // На первом и третьем шаге всегда активна
                const isDisabled = trainingPickerStep === 2 && totalMinutes === 0;
                return React.createElement('button', { 
                  className: 'time-picker-confirm' + (isDisabled ? ' disabled' : ''), 
                  onClick: isDisabled ? undefined : confirmTrainingPicker,
                  disabled: isDisabled
                }, 
                  trainingPickerStep === 3 ? 'Готово' : 'Далее →'
                );
              })()
            ),
            
            // ШАГ 1: Тип тренировки + Время + Пресеты
            trainingPickerStep === 1 && React.createElement(React.Fragment, null,
              // Секция: Тип тренировки
              React.createElement('div', { className: 'training-type-section' },
                React.createElement('div', { className: 'training-type-label' }, 'Тип тренировки'),
                React.createElement('div', { className: 'training-type-buttons' },
                  trainingTypes.map(t => 
                    React.createElement('button', {
                      key: t.id,
                      className: 'training-type-btn' + (pendingTrainingType === t.id ? ' active' : ''),
                      onClick: () => { haptic('light'); setPendingTrainingType(t.id); }
                    },
                      React.createElement('span', { className: 'training-type-icon' }, t.icon),
                      React.createElement('span', { className: 'training-type-text' }, t.label)
                    )
                  )
                )
              ),
              
              // Секция: Время начала
              React.createElement('div', { className: 'training-time-section' },
                React.createElement('div', { className: 'training-time-label' }, 'Время начала'),
                React.createElement('div', { className: 'time-picker-wheels' },
                  // Часы
                  React.createElement(WheelColumn, {
                    values: hoursValues,
                    selected: pendingTrainingTime.hours,
                    onChange: (i) => setPendingTrainingTime(prev => ({...prev, hours: i})),
                    label: 'Часы'
                  }),
                  React.createElement('div', { className: 'time-picker-separator' }, ':'),
                  // Минуты
                  React.createElement(WheelColumn, {
                    values: minutesValues,
                    selected: pendingTrainingTime.minutes,
                    onChange: (i) => setPendingTrainingTime(prev => ({...prev, minutes: i})),
                    label: 'Минуты'
                  })
                )
              )
            ),
            
            // ШАГ 2: Зоны
            trainingPickerStep === 2 && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'training-zones-section' },
                React.createElement('div', { className: 'training-zones-label' }, 'Минуты в каждой зоне'),
                React.createElement('div', { className: 'training-zones-wheels' },
                  [0, 1, 2, 3].map(zi => 
                    React.createElement('div', { key: 'zone' + zi, className: 'training-zone-column' },
                      React.createElement('div', { className: 'training-zone-header zone-color-' + (zi + 1) }, 'Z' + (zi + 1)),
                      React.createElement(WheelColumn, {
                        values: zoneMinutesValues.map(v => String(v)),
                        selected: pendingTrainingZones[zi],
                        onChange: (i) => {
                          haptic('light');
                          setPendingTrainingZones(prev => {
                            const next = [...prev];
                            next[zi] = i;
                            return next;
                          });
                        }
                      })
                    )
                  )
                ),
                // Подсказка с временем и калориями
                React.createElement('div', { className: 'training-zones-stats' },
                  React.createElement('span', { className: 'training-zones-time' },
                    '⏱️ ',
                    pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0),
                    ' мин'
                  ),
                  React.createElement('span', { className: 'training-zones-kcal' },
                    '🔥 ',
                    r0(pendingTrainingZones.reduce((sum, idx, zi) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0) * (kcalMin[zi] || 0), 0)),
                    ' ккал'
                  )
                )
              )
            ),
            
            // ШАГ 3: Оценки тренировки
            trainingPickerStep === 3 && (() => {
              // Определяем состояние на основе обеих оценок
              const quality = pendingTrainingQuality;
              const feelAfter = pendingTrainingFeelAfter;
              
              const positiveSignals = (quality >= 7 ? 1 : 0) + (feelAfter >= 7 ? 1 : 0);
              const negativeSignals = (quality > 0 && quality <= 3 ? 1 : 0) + (feelAfter > 0 && feelAfter <= 3 ? 1 : 0);
              
              const ratingState = negativeSignals >= 1 && positiveSignals === 0 ? 'negative' :
                                  positiveSignals >= 1 && negativeSignals === 0 ? 'positive' : 'neutral';
              
              // Цвет для значения оценки
              const getPositiveColor = (v) => {
                if (v <= 3) return '#ef4444';
                if (v <= 5) return '#eab308';
                if (v <= 7) return '#84cc16';
                return '#10b981';
              };
              
              // Эмодзи для качества тренировки
              const getQualityEmoji = (v) => 
                v === 0 ? '🤷' : v <= 2 ? '😫' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🔥';
              
              // Эмодзи для самочувствия после
              const getFeelEmoji = (v) => 
                v === 0 ? '🤷' : v <= 2 ? '🥵' : v <= 4 ? '😓' : v <= 6 ? '😌' : v <= 8 ? '😊' : '✨';
              
              // Текст для блока комментария
              const getCommentText = () => {
                if (ratingState === 'negative') {
                  if (quality <= 3 && feelAfter <= 3) return 'Тяжёлая тренировка — что пошло не так?';
                  if (quality <= 3) return 'Тренировка не удалась — что помешало?';
                  if (feelAfter <= 3) return 'Плохое самочувствие после — что случилось?';
                  return 'Что пошло не так?';
                }
                if (ratingState === 'positive') {
                  if (quality >= 8 && feelAfter >= 8) return '🎉 Отличная тренировка! Что помогло?';
                  if (quality >= 7) return 'Хорошая тренировка! Запиши что понравилось';
                  if (feelAfter >= 7) return 'Отличное самочувствие! В чём секрет?';
                  return 'Что понравилось?';
                }
                return 'Заметка о тренировке';
              };
              
              return React.createElement(React.Fragment, null,
                // Оценка качества тренировки
                React.createElement('div', { className: 'training-rating-section' },
                  React.createElement('div', { className: 'training-rating-row' },
                    React.createElement('div', { className: 'training-rating-header' },
                      React.createElement('span', { className: 'training-rating-emoji' }, getQualityEmoji(quality)),
                      React.createElement('span', { className: 'training-rating-label' }, 'Качество тренировки'),
                      React.createElement('span', { 
                        className: 'training-rating-value',
                        style: { color: quality === 0 ? '#9ca3af' : getPositiveColor(quality) }
                      }, quality === 0 ? '—' : quality + '/10')
                    ),
                    React.createElement('div', { className: 'training-rating-presets' },
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-bad' + (quality > 0 && quality <= 3 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingQuality(2); }
                      }, '😫 Плохо'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-ok' + (quality >= 4 && quality <= 6 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingQuality(5); }
                      }, '😐 Норм'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-good' + (quality >= 7 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingQuality(8); }
                      }, '💪 Отлично')
                    ),
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: quality,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => { haptic('light'); setPendingTrainingQuality(parseInt(e.target.value)); }
                    })
                  ),
                  
                  // Оценка самочувствия после
                  React.createElement('div', { className: 'training-rating-row' },
                    React.createElement('div', { className: 'training-rating-header' },
                      React.createElement('span', { className: 'training-rating-emoji' }, getFeelEmoji(feelAfter)),
                      React.createElement('span', { className: 'training-rating-label' }, 'Самочувствие после'),
                      React.createElement('span', { 
                        className: 'training-rating-value',
                        style: { color: feelAfter === 0 ? '#9ca3af' : getPositiveColor(feelAfter) }
                      }, feelAfter === 0 ? '—' : feelAfter + '/10')
                    ),
                    React.createElement('div', { className: 'training-rating-presets' },
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-bad' + (feelAfter > 0 && feelAfter <= 3 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingFeelAfter(2); }
                      }, '🥵 Устал'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-ok' + (feelAfter >= 4 && feelAfter <= 6 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingFeelAfter(5); }
                      }, '😌 Норм'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-good' + (feelAfter >= 7 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingFeelAfter(8); }
                      }, '✨ Энергия')
                    ),
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: feelAfter,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => { haptic('light'); setPendingTrainingFeelAfter(parseInt(e.target.value)); }
                    })
                  )
                ),
                
                // Блок комментария с quick chips
                (() => {
                  // Quick chips для тренировки
                  const trainingChips = ratingState === 'negative' 
                    ? ['Мало сил', 'Травма', 'Не выспался', 'Жарко', 'Нет мотивации']
                    : ratingState === 'positive'
                    ? ['Новый рекорд', 'Много энергии', 'Хороший сон', 'Правильно ел', 'В потоке']
                    : [];
                  
                  const addTrainingChip = (chip) => {
                    haptic('light');
                    const current = pendingTrainingComment || '';
                    setPendingTrainingComment(current ? current + ', ' + chip : chip);
                  };
                  
                  return React.createElement('div', { 
                    className: 'training-comment-wrapper ' + ratingState
                  },
                    React.createElement('div', { 
                      className: 'training-comment-prompt ' + ratingState
                    },
                      React.createElement('span', { className: 'training-comment-icon' }, 
                        ratingState === 'negative' ? '📝' : ratingState === 'positive' ? '✨' : '💭'
                      ),
                      React.createElement('span', { className: 'training-comment-text' }, getCommentText()),
                      // Quick chips
                      trainingChips.length > 0 && React.createElement('div', { 
                        className: 'quick-chips ' + ratingState 
                      },
                        trainingChips.map(chip => 
                          React.createElement('button', { 
                            key: chip,
                            className: 'quick-chip' + ((pendingTrainingComment || '').includes(chip) ? ' selected' : ''),
                            onClick: () => addTrainingChip(chip)
                          }, chip)
                        )
                      ),
                      React.createElement('input', {
                        type: 'text',
                        className: 'training-comment-input',
                        placeholder: ratingState === 'negative' ? 'Что пошло не так...' : 
                                     ratingState === 'positive' ? 'Что помогло...' : 'Любые мысли...',
                        value: pendingTrainingComment,
                        onChange: (e) => setPendingTrainingComment(e.target.value),
                        onClick: (e) => e.stopPropagation()
                      })
                    )
                  );
                })()
              );
            })()
          )
        ),
        document.body
      ),
      
      // Sleep Quality Picker Modal (красивый слайдер как в оценке дня)
      showSleepQualityPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelSleepQualityPicker },
          React.createElement('div', { className: 'time-picker-modal sleep-quality-picker-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelSleepQualityPicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelSleepQualityPicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '😴 Качество сна'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmSleepQualityPicker }, 'Готово')
            ),
            // Большой emoji и текст
            React.createElement('div', { className: 'sleep-quality-face' },
              React.createElement('span', { className: 'sleep-quality-face-emoji' }, 
                pendingSleepQuality === 0 ? '🤷' :
                pendingSleepQuality <= 2 ? '😫' :
                pendingSleepQuality <= 4 ? '😩' :
                pendingSleepQuality <= 5 ? '😐' :
                pendingSleepQuality <= 7 ? '😌' :
                pendingSleepQuality <= 9 ? '😊' : '🌟'
              ),
              React.createElement('span', { className: 'sleep-quality-face-text' }, 
                pendingSleepQuality === 0 ? 'Не указано' :
                pendingSleepQuality <= 2 ? 'Ужасно спал' :
                pendingSleepQuality <= 4 ? 'Плохо спал' :
                pendingSleepQuality <= 5 ? 'Средне' :
                pendingSleepQuality <= 7 ? 'Нормально' :
                pendingSleepQuality <= 9 ? 'Хорошо выспался' : 'Отлично выспался!'
              )
            ),
            // Большое число
            React.createElement('div', { className: 'sleep-quality-big-value' },
              React.createElement('span', { 
                className: 'sleep-quality-number',
                style: { 
                  color: pendingSleepQuality === 0 ? '#9ca3af' :
                         pendingSleepQuality <= 2 ? '#ef4444' :
                         pendingSleepQuality <= 4 ? '#f97316' :
                         pendingSleepQuality <= 5 ? '#eab308' :
                         pendingSleepQuality <= 7 ? '#84cc16' :
                         pendingSleepQuality <= 9 ? '#22c55e' : '#10b981'
                }
              }, pendingSleepQuality === 0 ? '—' : sleepQualityValues[pendingSleepQuality]),
              React.createElement('span', { className: 'sleep-quality-of-ten' }, pendingSleepQuality > 0 ? '/10' : '')
            ),
            // Preset кнопки
            React.createElement('div', { className: 'sleep-quality-presets' },
              React.createElement('button', {
                className: 'sleep-quality-preset sleep-quality-preset-bad' + (pendingSleepQuality >= 1 && pendingSleepQuality <= 3 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingSleepQuality(2); }
              }, '😫 Плохо'),
              React.createElement('button', {
                className: 'sleep-quality-preset sleep-quality-preset-ok' + (pendingSleepQuality >= 4 && pendingSleepQuality <= 7 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingSleepQuality(5); }
              }, '😐 Средне'),
              React.createElement('button', {
                className: 'sleep-quality-preset sleep-quality-preset-good' + (pendingSleepQuality >= 8 && pendingSleepQuality <= 10 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingSleepQuality(9); }
              }, '😊 Отлично')
            ),
            // Слайдер (0-10, где 0=не указано, 1-10 = оценка)
            React.createElement('div', { className: 'sleep-quality-slider-container' },
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: 10,
                value: pendingSleepQuality,
                className: 'mood-slider mood-slider-positive sleep-quality-slider',
                onChange: (e) => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  setPendingSleepQuality(parseInt(e.target.value));
                }
              }),
              React.createElement('div', { className: 'sleep-quality-slider-labels' },
                React.createElement('span', null, '😫'),
                React.createElement('span', null, '😴'),
                React.createElement('span', null, '🌟')
              )
            ),
            // Комментарий всегда виден с динамическим стилем
            (() => {
              const sleepState = pendingSleepQuality >= 8 ? 'positive' : pendingSleepQuality >= 1 && pendingSleepQuality <= 4 ? 'negative' : 'neutral';
              
              // Quick chips для сна
              const sleepChips = sleepState === 'negative' 
                ? ['Шум', 'Кошмары', 'Душно', 'Поздно лёг', 'Тревога', 'Кофе']
                : sleepState === 'positive'
                ? ['Режим', 'Тишина', 'Прохлада', 'Без гаджетов', 'Прогулка']
                : [];
              
              const addSleepChip = (chip) => {
                if (navigator.vibrate) navigator.vibrate(5);
                const current = pendingSleepNote || '';
                setPendingSleepNote(current ? current + ', ' + chip : chip);
              };
              
              return React.createElement('div', { 
                className: 'sleep-quality-comment-wrapper ' + sleepState
              },
                React.createElement('div', { 
                  className: 'sleep-quality-comment-prompt ' + sleepState
                },
                  React.createElement('div', { className: 'comment-prompt-header' },
                    React.createElement('span', { className: 'sleep-quality-comment-icon' }, 
                      sleepState === 'positive' ? '✨' : sleepState === 'negative' ? '📝' : '💭'
                    ),
                    React.createElement('span', { className: 'sleep-quality-comment-text' }, 
                      sleepState === 'positive' ? 'Секрет хорошего сна?' : 
                      sleepState === 'negative' ? 'Что помешало?' : 'Заметка о сне'
                    )
                  ),
                  // Quick chips
                  sleepChips.length > 0 && React.createElement('div', { 
                    className: 'quick-chips ' + sleepState 
                  },
                    sleepChips.map(chip => 
                      React.createElement('button', { 
                        key: chip,
                        className: 'quick-chip' + ((pendingSleepNote || '').includes(chip) ? ' selected' : ''),
                        onClick: () => addSleepChip(chip)
                      }, chip)
                    )
                  ),
                  // История комментариев
                  day.sleepNote && React.createElement('div', { className: 'comment-history' }, day.sleepNote),
                  // Поле для нового комментария
                  React.createElement('input', {
                    type: 'text',
                    className: 'sleep-quality-comment-input',
                    placeholder: sleepState === 'positive' ? 'Режим, тишина, прохлада...' : 
                                 sleepState === 'negative' ? 'Шум, кошмары, душно...' : 'Любые заметки...',
                    value: pendingSleepNote,
                    onChange: (e) => setPendingSleepNote(e.target.value),
                    onClick: (e) => e.stopPropagation()
                  })
                )
              );
            })(),
            // Часы сна
            day.sleepHours > 0 && React.createElement('div', { className: 'sleep-quality-hours-info' },
              '🛏️ Сегодня: ',
              React.createElement('strong', null, day.sleepHours + ' ч'),
              day.sleepHours < 6 ? ' — маловато!' : day.sleepHours >= 8 ? ' — отлично!' : ''
            )
          )
        ),
        document.body
      ),
      
      // Day Score Picker Modal (со слайдером как в модалке оценок)
      showDayScorePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelDayScorePicker },
          React.createElement('div', { className: 'time-picker-modal day-score-picker-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelDayScorePicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelDayScorePicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '📊 Оценка дня'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmDayScorePicker }, 'Готово')
            ),
            // Большой emoji и текст
            React.createElement('div', { className: 'day-score-face' },
              React.createElement('span', { className: 'day-score-face-emoji' }, 
                pendingDayScore === 0 ? '🤷' :
                pendingDayScore <= 3 ? '😢' :
                pendingDayScore <= 5 ? '😐' :
                pendingDayScore <= 7 ? '🙂' :
                pendingDayScore <= 9 ? '😊' : '🤩'
              ),
              React.createElement('span', { className: 'day-score-face-text' }, 
                pendingDayScore === 0 ? 'Не задано' :
                pendingDayScore <= 2 ? 'Плохой день' :
                pendingDayScore <= 4 ? 'Так себе' :
                pendingDayScore <= 6 ? 'Нормально' :
                pendingDayScore <= 8 ? 'Хороший день' : 'Отличный день!'
              )
            ),
            // Большое число
            React.createElement('div', { className: 'day-score-big-value' },
              React.createElement('span', { 
                className: 'day-score-number',
                style: { 
                  color: pendingDayScore === 0 ? '#9ca3af' :
                         pendingDayScore <= 3 ? '#ef4444' :
                         pendingDayScore <= 5 ? '#eab308' :
                         pendingDayScore <= 7 ? '#22c55e' : '#10b981'
                }
              }, pendingDayScore === 0 ? '—' : pendingDayScore),
              React.createElement('span', { className: 'day-score-of-ten' }, '/ 10')
            ),
            // Preset кнопки
            React.createElement('div', { className: 'day-score-presets' },
              React.createElement('button', {
                className: 'day-score-preset day-score-preset-bad' + (pendingDayScore >= 1 && pendingDayScore <= 3 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingDayScore(2); }
              }, '😢 Плохо'),
              React.createElement('button', {
                className: 'day-score-preset day-score-preset-ok' + (pendingDayScore >= 4 && pendingDayScore <= 6 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingDayScore(5); }
              }, '😐 Норм'),
              React.createElement('button', {
                className: 'day-score-preset day-score-preset-good' + (pendingDayScore >= 7 && pendingDayScore <= 10 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingDayScore(8); }
              }, '😊 Отлично')
            ),
            // Слайдер
            React.createElement('div', { className: 'day-score-slider-container' },
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: 10,
                value: pendingDayScore,
                className: 'mood-slider mood-slider-positive day-score-slider',
                onChange: (e) => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  setPendingDayScore(parseInt(e.target.value));
                }
              }),
              React.createElement('div', { className: 'day-score-slider-labels' },
                React.createElement('span', null, '😢'),
                React.createElement('span', null, '😐'),
                React.createElement('span', null, '😊')
              )
            ),
            // Блок комментария — всегда виден, стиль меняется в зависимости от оценки
            React.createElement('div', { 
              className: 'day-score-comment-wrapper' + 
                (pendingDayScore >= 7 ? ' positive' : pendingDayScore >= 1 && pendingDayScore <= 4 ? ' negative' : ' neutral')
            },
              React.createElement('div', { 
                className: 'day-score-comment-prompt' + 
                  (pendingDayScore >= 7 ? ' positive' : pendingDayScore >= 1 && pendingDayScore <= 4 ? ' negative' : ' neutral')
              },
                React.createElement('div', { className: 'comment-prompt-header' },
                  React.createElement('span', { className: 'day-score-comment-icon' }, 
                    pendingDayScore >= 7 ? '✨' : pendingDayScore >= 1 && pendingDayScore <= 4 ? '📝' : '💭'
                  ),
                  React.createElement('span', { className: 'day-score-comment-text' }, 
                    pendingDayScore >= 7 ? 'Что сделало день отличным?' 
                    : pendingDayScore >= 1 && pendingDayScore <= 4 ? 'Что случилось?' 
                    : 'Заметка о дне'
                  )
                ),
                // История комментариев
                day.dayComment && React.createElement('div', { className: 'comment-history' }, day.dayComment),
                // Поле для нового комментария
                React.createElement('input', {
                  type: 'text',
                  className: 'day-score-comment-input',
                  placeholder: pendingDayScore >= 7 
                    ? 'Хорошо выспался, прогулка...' 
                    : pendingDayScore >= 1 && pendingDayScore <= 4 
                    ? 'Болела голова, плохо спал...' 
                    : 'Обычный день...',
                  value: pendingDayComment,
                  onChange: (e) => setPendingDayComment(e.target.value),
                  onClick: (e) => e.stopPropagation()
                })
              )
            ),
            // Подсказка про авто
            (day.moodAvg || day.wellbeingAvg || day.stressAvg) && React.createElement('div', { className: 'day-score-auto-info' },
              '✨ Автоматическая оценка: ',
              React.createElement('strong', null, calculateDayAverages(day.meals, day.trainings, day).dayScore || '—'),
              ' (на основе настроения, самочувствия и стресса)'
            )
          )
        ),
        document.body
      )
    ), // Закрытие главного div
    // === Meal Quality Popup Portal ===
    mealQualityPopup && ReactDOM.createPortal(
      (() => {
        const { meal, quality, mealTypeInfo, x, y } = mealQualityPopup;
        const popupW = 320;
        const popupH = 480; // Увеличили высоту для расчётов
        
        // Предпочитаем показ сверху для спарклайна
        const pos = getSmartPopupPosition(x, y, popupW, popupH, { preferAbove: true, offset: 12, margin: 16 });
        const { left, top, arrowPos, showAbove } = pos;
        
        const getColor = (score) => {
          if (score >= 80) return '#10b981';
          if (score >= 60) return '#22c55e';
          if (score >= 40) return '#eab308';
          return '#ef4444';
        };
        const color = getColor(quality.score);
        
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const diffY = e.changedTouches[0].clientY - startY;
          if (diffY > 50) setMealQualityPopup(null);
        };
        
        // Подготовка данных для расчёта
        const getTotals = () => {
          if (!meal?.items || meal.items.length === 0) return { kcal: 0, prot: 0, carbs: 0, simple: 0, complex: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
          const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal:0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
          return totals;
        };
        const totals = getTotals();
        
        // Парсим время
        const parseTimeH = (t) => {
          if (!t) return 12;
          const [h] = t.split(':').map(Number);
          return h || 12;
        };
        const hour = parseTimeH(meal.time);
        
        // Расчёт компонентов оценки (пересоздаём логику для отображения)
        const calcKcalDisplay = () => {
          let points = 30;
          const issues = [];
          if (totals.kcal > 800) {
            const penalty = Math.min(15, Math.round((totals.kcal - 800) / 200 * 5));
            points -= penalty;
            issues.push('>' + 800 + ' ккал: -' + penalty);
          }
          if (totals.kcal > 1000) {
            points -= 10;
            issues.push('переедание: -10');
          }
          if ((hour >= 23 || hour < 5) && totals.kcal > 300) {
            const nightPenalty = Math.min(10, Math.round((totals.kcal - 300) / 100));
            points -= nightPenalty;
            issues.push('ночь: -' + nightPenalty);
          } else if (hour >= 21 && totals.kcal > 500) {
            const latePenalty = Math.min(5, Math.round((totals.kcal - 500) / 150));
            points -= latePenalty;
            issues.push('поздно: -' + latePenalty);
          }
          return { points: Math.max(0, points), max: 30, issues };
        };
        
        const calcMacroDisplay = () => {
          let points = 20;
          const issues = [];
          const minProt = totals.kcal > 200 ? 15 : 10;
          if (totals.prot >= minProt) {
            points += 5;
            issues.push('белок ≥' + minProt + 'г: +5');
          } else if (totals.kcal > 300) {
            points -= 5;
            issues.push('белок <' + minProt + 'г: -5');
          }
          if (totals.prot > 50) {
            points -= 3;
            issues.push('белок >' + 50 + 'г: -3');
          }
          if (totals.kcal > 0) {
            const protPct = (totals.prot * 4) / totals.kcal;
            const carbPct = (totals.carbs * 4) / totals.kcal;
            const fatPct = (totals.fat * 9) / totals.kcal;
            const deviation = Math.abs(protPct - 0.25) + Math.abs(carbPct - 0.45) + Math.abs(fatPct - 0.30);
            const devPenalty = Math.min(10, Math.round(deviation * 15));
            if (devPenalty > 0) {
              points -= devPenalty;
              issues.push('отклонение БЖУ: -' + devPenalty);
            }
          }
          return { points: Math.max(0, Math.min(25, points)), max: 25, issues };
        };
        
        const calcCarbDisplay = () => {
          const total = totals.simple + totals.complex;
          const simpleRatio = total > 0 ? totals.simple / total : 0.5;
          let points = 15;
          const issues = [];
          if (simpleRatio <= 0.30) {
            points = 15;
            issues.push('простые ≤30%: ' + points);
          } else if (simpleRatio <= 0.50) {
            points = 10;
            issues.push('простые 30-50%: ' + points);
          } else if (simpleRatio <= 0.70) {
            points = 5;
            issues.push('простые 50-70%: ' + points);
          } else {
            points = 0;
            issues.push('простые >70%: 0');
          }
          return { points, max: 15, issues, simpleRatio: Math.round(simpleRatio * 100) };
        };
        
        const calcFatDisplay = () => {
          const total = totals.bad + totals.good + totals.trans;
          const goodRatio = total > 0 ? totals.good / total : 0.5;
          let points = 15;
          const issues = [];
          if (goodRatio >= 0.60) {
            points = 15;
            issues.push('полезные ≥60%: 15');
          } else if (goodRatio >= 0.40) {
            points = 10;
            issues.push('полезные 40-60%: 10');
          } else {
            points = 5;
            issues.push('полезные <40%: 5');
          }
          if (totals.trans > 0.5) {
            points -= 5;
            issues.push('транс >' + 0.5 + 'г: -5');
          }
          return { points: Math.max(0, points), max: 15, issues, goodRatio: Math.round(goodRatio * 100) };
        };
        
        const calcGiDisplay = () => {
          const avgGI = quality.avgGI || 50;
          let points = 15;
          const issues = [];
          if (avgGI <= 55) {
            points = 15;
            issues.push('ГИ ≤55: 15');
          } else if (avgGI <= 70) {
            points = 10;
            issues.push('ГИ 55-70: 10');
          } else {
            points = 5;
            issues.push('ГИ >70: 5');
          }
          const avgHarm = quality.avgHarm || 0;
          if (avgHarm > 5) {
            const harmPenalty = Math.min(5, Math.round(avgHarm / 5));
            points -= harmPenalty;
            issues.push('вред: -' + harmPenalty);
          }
          return { points: Math.max(0, points), max: 15, issues };
        };
        
        const kcalCalc = calcKcalDisplay();
        const macroCalc = calcMacroDisplay();
        const carbCalc = calcCarbDisplay();
        const fatCalc = calcFatDisplay();
        const giCalc = calcGiDisplay();
        
        const baseScore = kcalCalc.points + macroCalc.points + carbCalc.points + fatCalc.points + giCalc.points;
        const bonusPoints = quality.bonusPoints || 0;
        
        // === УЛУЧШЕНИЕ 1: Найти худшую категорию ===
        const allCalcs = [
          { id: 'kcal', ...kcalCalc, icon: '🔥', label: Math.round(totals.kcal) + ' ккал' },
          { id: 'macro', ...macroCalc, icon: '🥩', label: 'Б' + Math.round(totals.prot) + ' У' + Math.round(totals.carbs) + ' Ж' + Math.round(totals.fat) },
          { id: 'carb', ...carbCalc, icon: '🍬', label: carbCalc.simpleRatio + '% простых' },
          { id: 'fat', ...fatCalc, icon: '🥑', label: fatCalc.goodRatio + '% полезных' },
          { id: 'gi', ...giCalc, icon: '📈', label: 'ГИ ' + Math.round(quality.avgGI || 50) }
        ];
        const worstCalc = allCalcs.reduce((w, c) => (c.points / c.max) < (w.points / w.max) ? c : w, allCalcs[0]);
        const worstId = (worstCalc.points / worstCalc.max) < 0.8 ? worstCalc.id : null;
        
        // === УЛУЧШЕНИЕ 5: Циркадный бонус ===
        const circadianBonus = quality.circadianBonus || 0;
        const circadianBonusPct = Math.round(circadianBonus * 100);
        
        // === УЛУЧШЕНИЕ 6: Проверка на молочные с высоким II ===
        const getDairyWarning = () => {
          if (!meal?.items || !pIndex) return null;
          const dairyPatterns = /молок|кефир|йогурт|творог|сыр|сливк|ряженк/i;
          const dairyItems = meal.items.filter(item => {
            const p = getProductFromItem(item, pIndex);
            return p && dairyPatterns.test(p.name || item.name || '');
          });
          if (dairyItems.length === 0) return null;
          const totalDairyGrams = dairyItems.reduce((sum, it) => sum + (+it.grams || 0), 0);
          if (totalDairyGrams < 100) return null;
          return { count: dairyItems.length, grams: totalDairyGrams };
        };
        const dairyWarning = getDairyWarning();
        
        // Научные данные
        const mealGL = quality.mealGL || 0;
        const glLevel = quality.glLevel || 'medium';
        const circadianPeriod = quality.circadianPeriod || 'afternoon';
        const liquidRatio = quality.liquidRatio || 0;
        
        // Перевод GL уровня
        const glLevelRu = {
          'very-low': 'очень низкая',
          'low': 'низкая',
          'medium': 'средняя',
          'high': 'высокая',
          'very-high': 'очень высокая'
        }[glLevel] || glLevel;
        
        // Перевод циркадного периода
        const circadianPeriodRu = {
          'morning': '🌅 утро (метаболизм ↑)',
          'midday': '🌞 день (оптимально)',
          'afternoon': '☀️ день',
          'evening': '🌇 вечер',
          'night': '🌙 ночь (метаболизм ↓)'
        }[circadianPeriod] || circadianPeriod;
        
        // Список продуктов приёма
        const getProductsList = () => {
          if (!meal?.items || meal.items.length === 0) return [];
          return meal.items.slice(0, 5).map(item => {
            const p = getProductFromItem(item, pIndex) || {};
            const name = item.name || p.name || 'Продукт';
            const grams = +item.grams || 0;
            const kcal = Math.round((p.kcal100 || 0) * grams / 100);
            return { name: name.length > 20 ? name.slice(0, 18) + '...' : name, grams, kcal };
          });
        };
        const productsList = getProductsList();
        
        // Умный совет на основе худшей категории
        const getTip = () => {
          // Если всё хорошо (≥80% по всем категориям)
          if (!worstId) return { text: '✨ Отличный сбалансированный приём!', type: 'success', worstId: null };
          
          // Советы по категориям
          const tips = {
            kcal: { text: '💡 Следи за размером порций', type: 'warning' },
            macro: { text: '💡 Добавь белок: яйца, курицу или творог', type: 'info' },
            carb: { text: '💡 Замени сладкое на сложные углеводы (каши, овощи)', type: 'info' },
            fat: { text: '💡 Добавь полезные жиры: орехи, авокадо, рыба', type: 'info' },
            gi: { text: '💡 Выбирай продукты с низким ГИ (<55)', type: 'info' }
          };
          
          return { ...tips[worstId], worstId } || { text: '💡 Следующий раз будет лучше!', type: 'neutral', worstId: null };
        };
        
        const tip = getTip();
        
        // === УЛУЧШЕНИЕ 2: Сравнение с вчерашним аналогичным приёмом ===
        const getYesterdayComparison = () => {
          try {
            const mealType = mealTypeInfo?.type || 'meal';
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = yesterday.toISOString().split('T')[0];
            const U = HEYS.utils || {};
            const yesterdayDay = U.lsGet ? U.lsGet('heys_dayv2_' + yesterdayKey, null) : null;
            if (!yesterdayDay?.meals?.length) return null;
            
            // Ищем приём того же типа вчера
            const yesterdayMeal = yesterdayDay.meals.find((m, i) => {
              const yType = getMealType(i, m, yesterdayDay.meals, pIndex);
              return yType?.type === mealType;
            });
            if (!yesterdayMeal?.items?.length) return null;
            
            const yQuality = getMealQualityScore(yesterdayMeal, mealType, optimum || 2000, pIndex);
            if (!yQuality) return null;
            
            const diff = quality.score - yQuality.score;
            if (Math.abs(diff) < 3) return { diff: 0, text: '≈ как вчера' };
            if (diff > 0) return { diff, text: '+' + diff + ' vs вчера 📈' };
            return { diff, text: diff + ' vs вчера 📉' };
          } catch (e) {
            return null;
          }
        };
        const yesterdayComp = getYesterdayComparison();
        
        // Компактный компонент строки расчёта (УЛУЧШЕНИЕ 1: подсветка худшей)
        const CalcRow = ({ id, icon, label, points, max, isBonus, isWorst }) => 
          React.createElement('div', { 
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              background: isBonus ? 'rgba(234, 179, 8, 0.1)' : (points === max ? 'rgba(16, 185, 129, 0.06)' : points < max * 0.5 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(234, 179, 8, 0.06)'),
              borderRadius: '6px',
              marginBottom: '4px',
              borderLeft: '3px solid ' + (isBonus ? '#b45309' : (points === max ? '#10b981' : points < max * 0.5 ? '#ef4444' : '#eab308')),
              // Пульсация для худшей категории
              animation: isWorst ? 'pulse-worst 1.5s ease-in-out infinite' : 'none',
              boxShadow: isWorst ? '0 0 0 2px rgba(239, 68, 68, 0.3)' : 'none'
            }
          },
            React.createElement('span', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } }, 
              icon,
              React.createElement('span', { style: { color: 'var(--text-secondary)' } }, label),
              isWorst && React.createElement('span', { style: { fontSize: '10px', color: '#ef4444', marginLeft: '4px' } }, '← исправить')
            ),
            React.createElement('span', { 
              style: { 
                fontWeight: 700, 
                fontSize: '12px',
                color: isBonus ? '#b45309' : (points === max ? '#10b981' : points < max * 0.5 ? '#ef4444' : '#eab308')
              }
            }, (isBonus && points > 0 ? '+' : '') + points + '/' + max)
          );
        
        return React.createElement('div', {
          className: 'metric-popup meal-quality-popup' + (showAbove ? ' above' : ''),
          role: 'dialog',
          'aria-modal': 'true',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: top + 'px',
            width: popupW + 'px',
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            zIndex: 10000
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          React.createElement('div', { className: 'metric-popup-stripe', style: { background: color } }),
          React.createElement('div', { className: 'metric-popup-content', style: { padding: '12px' } },
            React.createElement('div', { className: 'metric-popup-swipe' }),
            
            // Заголовок: тип + скор + прогресс-бар в одной строке
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
              React.createElement('span', { style: { fontSize: '14px', fontWeight: 600 } }, 
                (mealTypeInfo?.icon || '🍽️') + ' ' + (mealTypeInfo?.label || meal.name || 'Приём')
              ),
              React.createElement('div', { style: { flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' } },
                React.createElement('div', { style: { width: quality.score + '%', height: '100%', background: color, transition: 'width 0.3s' } })
              ),
              React.createElement('span', { style: { fontSize: '18px', fontWeight: 800, color: color } }, quality.score),
              // УЛУЧШЕНИЕ 2: сравнение с вчера
              yesterdayComp && React.createElement('span', { 
                style: { 
                  fontSize: '10px', 
                  color: yesterdayComp.diff > 0 ? '#10b981' : yesterdayComp.diff < 0 ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 600
                }
              }, yesterdayComp.text)
            ),
            
            // Совет (компактный)
            React.createElement('div', { 
              style: { 
                padding: '6px 10px', 
                background: tip.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : tip.type === 'warning' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', 
                borderRadius: '6px', 
                marginBottom: '10px', 
                fontSize: '12px' 
              }
            }, tip.text),
            
            // Расчёт (компактные строки) — УЛУЧШЕНИЕ 1: подсветка худшей
            allCalcs.map(calc => CalcRow({ 
              key: calc.id, 
              id: calc.id, 
              icon: calc.icon, 
              label: calc.label, 
              points: calc.points, 
              max: calc.max, 
              isWorst: calc.id === worstId 
            })),
            bonusPoints !== 0 && CalcRow({ id: 'bonus', icon: '⭐', label: 'Бонусы', points: bonusPoints, max: 15, isBonus: true }),
            
            // Итого (компактный)
            React.createElement('div', { 
              style: { 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 10px',
                background: color + '15',
                borderRadius: '6px',
                marginTop: '6px',
                marginBottom: '8px'
              }
            },
              React.createElement('span', { style: { fontWeight: 600, fontSize: '12px' } }, '∑ ИТОГО'),
              React.createElement('span', { style: { fontWeight: 700, fontSize: '14px', color: color } }, 
                baseScore + '+' + bonusPoints + ' = ' + quality.score
              )
            ),
            
            // УЛУЧШЕНИЕ 5 & 6: Циркадный бонус и предупреждение о молочке
            (circadianBonusPct !== 0 || dairyWarning) && React.createElement('div', { 
              style: { 
                display: 'flex', 
                gap: '6px', 
                flexWrap: 'wrap',
                marginBottom: '8px',
                fontSize: '10px'
              }
            },
              // Циркадный бонус
              circadianBonusPct !== 0 && React.createElement('span', {
                style: {
                  padding: '3px 6px',
                  borderRadius: '6px',
                  background: circadianBonusPct > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: circadianBonusPct > 0 ? '#10b981' : '#ef4444',
                  fontWeight: 600
                }
              }, '🕐 ' + (circadianBonusPct > 0 ? '+' : '') + circadianBonusPct + '% (время суток)'),
              // Предупреждение о молочке
              dairyWarning && React.createElement('span', {
                style: {
                  padding: '3px 6px',
                  borderRadius: '6px',
                  background: 'rgba(234, 179, 8, 0.1)',
                  color: '#b45309',
                  fontWeight: 600
                },
                title: 'Молочные продукты вызывают повышенный инсулиновый ответ (II ×2-3)'
              }, '🥛 ' + dairyWarning.grams + 'г молочки → II↑')
            ),
            
            // Научные данные + состав (в 2 колонки)
            React.createElement('div', { style: { display: 'flex', gap: '8px', fontSize: '11px', marginBottom: '8px' } },
              // Левая колонка: научные данные
              React.createElement('div', { style: { flex: 1, padding: '6px', background: 'var(--bg-tertiary, #f3f4f6)', borderRadius: '6px' } },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' } }, '🔬 Данные'),
                React.createElement('div', null, 'GL: ' + glLevelRu),
                React.createElement('div', null, circadianPeriodRu),
                liquidRatio > 0.3 && React.createElement('div', { style: { color: '#f59e0b' } }, '💧 ' + Math.round(liquidRatio * 100) + '% жидкое')
              ),
              // Правая колонка: состав
              productsList.length > 0 && React.createElement('div', { style: { flex: 1, padding: '6px', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' } },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' } }, '📋 Состав'),
                productsList.slice(0, 3).map((p, i) => React.createElement('div', { key: i, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, 
                  p.name + ' ' + p.grams + 'г'
                )),
                meal.items && meal.items.length > 3 && React.createElement('div', { style: { color: 'var(--text-muted)' } }, '+' + (meal.items.length - 3) + ' ещё')
              )
            ),
            
            // Бейджи (inline)
            (quality.badges && quality.badges.length > 0) && React.createElement('div', { 
              style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }
            },
              quality.badges.slice(0, 4).map((badge, i) => {
                const isPositive = badge.ok === true;
                const badgeType = typeof badge === 'object' ? badge.type : String(badge);
                return React.createElement('span', { 
                  key: i, 
                  style: { 
                    background: isPositive ? '#dcfce7' : '#fee2e2', 
                    color: isPositive ? '#166534' : '#dc2626', 
                    padding: '2px 6px', 
                    borderRadius: '8px', 
                    fontSize: '10px', 
                    fontWeight: 500 
                  } 
                }, badgeType);
              })
            ),
            
            // Кнопка закрытия
            React.createElement('button', { className: 'metric-popup-close', 'aria-label': 'Закрыть', onClick: () => setMealQualityPopup(null) }, '✕')
          ),
          React.createElement('div', { className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '') })
        );
      })(),
      document.body
    )); // Закрытие Fragment
  };

})(window);
