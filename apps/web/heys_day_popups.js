// heys_day_popups.js — Popup components for DayTab
// Extracted from heys_day_v12.js (Phase 2.1)
// Contains: PopupWithBackdrop, createSwipeHandlers, PopupCloseButton

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import haptic from dayUtils (with fallback)
  const U = HEYS.dayUtils || {};
  const haptic = U.haptic || (() => {});
  
  // === POPUP WITH BACKDROP — переиспользуемый компонент ===
  // Универсальная обёртка для попапов с backdrop'ом для закрытия по клику вне попапа
  const PopupWithBackdrop = ({ children, onClose, backdropStyle = {}, zIndex = 9998 }) => {
    return React.createElement('div', {
      className: 'popup-backdrop-invisible',
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: zIndex,
        pointerEvents: 'all',
        ...backdropStyle
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }
    }, children);
  };
  
  // === SWIPE TO DISMISS — функция для swipe-жестов на попапах ===
  // Возвращает { onTouchStart, onTouchEnd } для передачи в props попапа
  // НЕ хук! Можно вызывать условно внутри попапов
  const createSwipeHandlers = (onClose, threshold = 50) => {
    let startY = 0;
    return {
      onTouchStart: (e) => { startY = e.touches[0].clientY; },
      onTouchEnd: (e) => {
        const deltaY = e.changedTouches[0].clientY - startY;
        if (deltaY > threshold) {
          onClose();
          if (typeof haptic === 'function') haptic('light');
        }
      }
    };
  };
  
  // === POPUP CLOSE BUTTON — универсальная кнопка закрытия ===
  // className: опционально для кастомных стилей (sparkline-popup-close, metric-popup-close, etc.)
  const PopupCloseButton = ({ onClose, className = 'popup-close-btn', style = {} }) => {
    return React.createElement('button', {
      className,
      'aria-label': 'Закрыть',
      onClick: (e) => {
        e.stopPropagation();
        onClose();
      },
      style
    }, '✕');
  };
  
  // Export to HEYS namespace
  HEYS.dayPopups = {
    PopupWithBackdrop,
    createSwipeHandlers,
    PopupCloseButton
  };
  
})(window);
