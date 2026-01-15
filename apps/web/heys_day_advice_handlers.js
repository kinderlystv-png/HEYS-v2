// heys_day_advice_handlers.js — Advice swipe, dismiss, and schedule handlers
// Phase 10.4 of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js lines 1800-2030
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Dependencies with fallbacks
  const U = HEYS.dayUtils || {};
  const warnMissing = (name) => console.warn(`[heys_day_advice_handlers] Missing dependency: ${name}`);
  const haptic = U.haptic || (() => { warnMissing('haptic'); });
  const lsGet = U.lsGet || (() => { warnMissing('lsGet'); return null; });
  const lsSet = U.lsSet || (() => { warnMissing('lsSet'); });
  
  /**
   * Create advice handlers
   * @param {Object} deps - Dependencies
   * @returns {Object} Advice handler functions
   */
  function createAdviceHandlers(deps) {
    const {
      dismissedAdvices,
      setDismissedAdvices,
      hiddenUntilTomorrow,
      setHiddenUntilTomorrow,
      lastDismissedAdvice,
      setLastDismissedAdvice,
      adviceSwipeState,
      setAdviceSwipeState,
      adviceSwipeStart,
      expandedAdviceId,
      setExpandedAdviceId,
      toastsEnabled,
      setToastsEnabled,
      adviceSoundEnabled,
      setAdviceSoundEnabled,
      playAdviceSound,
      playAdviceHideSound,
      adviceCardRefs,
      dismissToast,
      setDismissAllAnimation,
      setUndoFading,
      adviceRelevant,
      scheduleAdvice
    } = deps;
    
    /**
     * Toggle toasts enabled
     */
    const toggleToastsEnabled = React.useCallback(() => {
      setToastsEnabled(prev => {
        const newVal = !prev;
        try {
          const settings = lsGet('heys_advice_settings', {});
          settings.toastsEnabled = newVal;
          lsSet('heys_advice_settings', settings);
          window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
        } catch(e) {}
        // Haptic feedback
        haptic('light');
        return newVal;
      });
    }, [haptic, setToastsEnabled]);
    
    /**
     * Toggle advice sound enabled
     */
    const toggleAdviceSoundEnabled = React.useCallback(() => {
      setAdviceSoundEnabled(prev => {
        const newVal = !prev;
        try {
          const settings = lsGet('heys_advice_settings', {});
          settings.adviceSoundEnabled = newVal;
          lsSet('heys_advice_settings', settings);
          window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
        } catch(e) {}
        haptic('light');
        return newVal;
      });
    }, [haptic, setAdviceSoundEnabled]);
    
    /**
     * Undo last dismiss action
     */
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
            const saveData = {
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            };
            lsSet('heys_advice_read_today', saveData);
          } catch(e) {}
          return newSet;
        });
      }
      if (action === 'hidden') {
        setHiddenUntilTomorrow(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          try {
            const saveData = {
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            };
            lsSet('heys_advice_hidden_today', saveData);
          } catch(e) {}
          return newSet;
        });
      }
      
      setLastDismissedAdvice(null);
      haptic('light');
    }, [haptic, lastDismissedAdvice, setDismissedAdvices, setHiddenUntilTomorrow, setLastDismissedAdvice]);
    
    /**
     * Clear last dismissed overlay
     */
    const clearLastDismissed = React.useCallback(() => {
      if (lastDismissedAdvice?.hideTimeout) {
        clearTimeout(lastDismissedAdvice.hideTimeout);
      }
      setLastDismissedAdvice(null);
    }, [lastDismissedAdvice, setLastDismissedAdvice]);
    
    /**
     * Handle advice swipe end
     */
    const handleAdviceSwipeEnd = React.useCallback((adviceId) => {
      const state = adviceSwipeState[adviceId];
      const swipeX = state?.x || 0;
      
      // Очищаем предыдущий undo таймер
      if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);
      
      if (swipeX < -100) {
        // Свайп влево = прочитано (сохраняется на день)
        setDismissedAdvices(prev => {
          const newSet = new Set([...prev, adviceId]);
          const saveData = {
            date: new Date().toISOString().slice(0, 10),
            ids: [...newSet]
          };
          try {
            lsSet('heys_advice_read_today', saveData);
          } catch(e) {
            // Тихо игнорируем ошибки localStorage
          }
          return newSet;
        });
        
        // +XP за прочтение совета с floating animation
        if (window.HEYS?.game?.addXP && adviceCardRefs) {
          const cardEl = adviceCardRefs.current[adviceId];
          window.HEYS.game.addXP(0, 'advice_read', cardEl);
        }
        
        // Звук
        if (playAdviceSound) playAdviceSound();
        haptic('light');
        
        // Undo — показываем 3 секунды (прогресс-бар в overlay)
        if (setUndoFading) setUndoFading(false);
        const hideTimeout = setTimeout(() => {
          setLastDismissedAdvice(null);
          if (setUndoFading) setUndoFading(false);
        }, 3000);
        setLastDismissedAdvice({ id: adviceId, action: 'read', hideTimeout });
        
      } else if (swipeX > 100) {
        // Свайп вправо = скрыть до завтра + прочитано
        setHiddenUntilTomorrow(prev => {
          const newSet = new Set([...prev, adviceId]);
          try {
            const saveData = {
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            };
            lsSet('heys_advice_hidden_today', saveData);
          } catch(e) {}
          return newSet;
        });
        // Также отмечаем как прочитанное
        setDismissedAdvices(prev => {
          const newSet = new Set([...prev, adviceId]);
          try {
            const saveData = {
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            };
            lsSet('heys_advice_read_today', saveData);
          } catch(e) {}
          return newSet;
        });
        
        // 🔊 Звук скрытия совета
        if (playAdviceHideSound) playAdviceHideSound();
        haptic('medium');
        
        // Undo — показываем 3 секунды (прогресс-бар в overlay)
        if (setUndoFading) setUndoFading(false);
        const hideTimeout = setTimeout(() => {
          setLastDismissedAdvice(null);
          if (setUndoFading) setUndoFading(false);
        }, 3000);
        setLastDismissedAdvice({ id: adviceId, action: 'hidden', hideTimeout });
      }
      
      setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
      if (adviceSwipeStart && adviceSwipeStart.current) {
        delete adviceSwipeStart.current[adviceId];
      }
    }, [adviceSwipeState, haptic, lastDismissedAdvice, playAdviceSound, playAdviceHideSound, setDismissedAdvices, setHiddenUntilTomorrow, setLastDismissedAdvice, setAdviceSwipeState, setUndoFading, adviceSwipeStart, adviceCardRefs]);
    
    /**
     * Handle advice long press start
     */
    const adviceLongPressTimer = React.useRef(null);
    const handleAdviceLongPressStart = React.useCallback((adviceId) => {
      adviceLongPressTimer.current = setTimeout(() => {
        setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
        haptic('light');
      }, 500);
    }, [haptic, setExpandedAdviceId]);
    
    /**
     * Handle advice long press end
     */
    const handleAdviceLongPressEnd = React.useCallback(() => {
      if (adviceLongPressTimer.current) {
        clearTimeout(adviceLongPressTimer.current);
        adviceLongPressTimer.current = null;
      }
    }, []);
    
    /**
     * Toggle advice expand
     */
    const handleAdviceToggleExpand = React.useCallback((adviceId) => {
      setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
      haptic('light');
    }, [haptic, setExpandedAdviceId]);
    
    /**
     * Dismiss all advices with domino effect
     */
    const handleDismissAll = () => {
      if (setDismissAllAnimation) setDismissAllAnimation(true);
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
                const saveData = {
                  date: new Date().toISOString().slice(0, 10),
                  ids: [...newSet]
                };
                lsSet('heys_advice_read_today', saveData);
              } catch(e) {}
            }
            return newSet;
          });
          if (index < 3) haptic('light'); // Haptic только для первых 3
        }, index * 80);
      });
      
      // Закрыть модалку после анимации
      setTimeout(() => {
        if (setDismissAllAnimation) setDismissAllAnimation(false);
        if (dismissToast) dismissToast();
      }, advices.length * 80 + 300);
    };
    
    /**
     * Handle toast schedule
     */
    const handleToastSchedule = (adviceId) => {
      if (scheduleAdvice) {
        scheduleAdvice(adviceId);
        haptic('light');
      }
    };
    
    return {
      toggleToastsEnabled,
      toggleAdviceSoundEnabled,
      undoLastDismiss,
      clearLastDismissed,
      handleAdviceSwipeEnd,
      handleAdviceLongPressStart,
      handleAdviceLongPressEnd,
      handleAdviceToggleExpand,
      handleDismissAll,
      handleToastSchedule
    };
  }
  
  // Export module
  HEYS.dayAdviceHandlers = {
    createAdviceHandlers
  };
  
})(window);
