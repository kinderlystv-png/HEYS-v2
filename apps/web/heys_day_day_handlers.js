// heys_day_day_handlers.js — Day-level handlers (water, weight, steps, date, training)
// Phase 10.3 of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // Dependencies - explicit check instead of silent fallbacks
  if (!HEYS.dayUtils) {
    throw new Error('[heys_day_day_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
  }
  const { haptic, lsGet } = HEYS.dayUtils;

  /**
   * Create day-level handlers
   * @param {Object} deps - Dependencies
   * @returns {Object} Day handler functions
   */
  function createDayHandlers(deps) {
    const {
      setDay,
      day,
      date,
      prof,
      setShowWaterDrop,
      setWaterAddedAnim,
      showConfetti,
      setShowConfetti,
      waterGoal,
      setEditGramsTarget,
      setEditGramsValue,
      setGrams
    } = deps;

    /**
     * Open weight picker modal
     */
    function openWeightPicker() {
      if (HEYS.showCheckin && HEYS.showCheckin.weight) {
        HEYS.showCheckin.weight(date, (weightData) => {
          // Мгновенное обновление UI через setDay
          if (weightData && (weightData.weightKg !== undefined || weightData.weightG !== undefined)) {
            const newWeight = (weightData.weightKg || 70) + (weightData.weightG || 0) / 10;
            setDay(prev => ({ ...prev, weightMorning: newWeight, updatedAt: Date.now() }));
          }
        });
      }
    }

    /**
     * Open steps goal picker
     */
    function openStepsGoalPicker() {
      if (HEYS.showCheckin && HEYS.showCheckin.steps) {
        HEYS.showCheckin.steps();
      }
    }

    /**
     * Open deficit picker
     */
    function openDeficitPicker() {
      // Используем StepModal вместо старого пикера
      if (HEYS.showCheckin && HEYS.showCheckin.deficit) {
        HEYS.showCheckin.deficit(date, (stepData) => {
          // Мгновенное обновление UI через setDay
          // stepData = { deficit: { deficit: -15, dateKey: '...' } }
          const deficitValue = stepData?.deficit?.deficit;
          if (deficitValue !== undefined) {
            setDay(prev => ({ ...prev, deficitPct: deficitValue, updatedAt: Date.now() }));
          }
        });
      }
    }

    /**
     * Add water with animation
     * @param {number} ml - Milliliters to add
     * @param {boolean} skipScroll - Skip scroll to water card
     */
    function addWater(ml, skipScroll = false) {
      // 🔒 Read-only gating
      if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
        HEYS.Paywall.showBlockedToast('Добавление воды недоступно');
        return;
      }

      // Сначала прокручиваем к карточке воды (если вызвано из FAB)
      const waterCardEl = document.getElementById('water-card');
      if (!skipScroll && waterCardEl) {
        waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // rAF-chain вместо фиксированного setTimeout(400)
        requestAnimationFrame(() => requestAnimationFrame(() => runWaterAnimation(ml)));
        return;
      }
      runWaterAnimation(ml);
    }

    /**
     * Internal water animation runner
     * 🚀 PERF R10: DOM-based animations — bypass React re-render entirely.
     * R9 showed animation setState alone costs ~426ms because ANY state change
     * triggers full DayTab re-render (2013-line monolith, ~30 useState).
     * waterAddedAnim + showWaterDrop are in useMemo deps for waterCard —
     * changing them invalidates the memo and causes expensive reconciliation.
     * Direct DOM injection = 0ms React processing, same visual effect.
     * React reconciliation does NOT remove DOM nodes it doesn't manage.
     */
    function runWaterAnimation(ml) {
      const newWater = (day.waterMl || 0) + ml;
      const prevWater = day.waterMl || 0;
      const hitGoal = waterGoal && newWater >= waterGoal && prevWater < waterGoal;

      // DOM-based visual animations (no React state = no re-render)
      const waterCard = document.getElementById('water-card');
      if (waterCard) {
        // "+250" text animation above the ring
        const ringCont = waterCard.querySelector('.water-ring-container');
        if (ringCont) {
          const animSpan = document.createElement('span');
          animSpan.className = 'water-card-anim water-card-anim-above';
          animSpan.textContent = '+' + ml;
          ringCont.appendChild(animSpan);
          setTimeout(() => { if (animSpan.parentNode) animSpan.remove(); }, 800);
        }

        // Water drop + splash in progress bar
        const progressBar = waterCard.querySelector('.water-progress-inline');
        if (progressBar) {
          const dropCont = document.createElement('div');
          dropCont.className = 'water-drop-container';
          const drop = document.createElement('div');
          drop.className = 'water-drop';
          const splash = document.createElement('div');
          splash.className = 'water-splash';
          dropCont.appendChild(drop);
          dropCont.appendChild(splash);
          progressBar.insertBefore(dropCont, progressBar.firstChild);
          setTimeout(() => { if (dropCont.parentNode) dropCont.remove(); }, 1200);
        }
      }

      // Defer heavy day state update via setTimeout(0) + startTransition
      setTimeout(() => {
        React.startTransition(() => {
          setDay(prev => ({ ...prev, waterMl: (prev.waterMl || 0) + ml, lastWaterTime: Date.now(), updatedAt: Date.now() }));
        });
      }, 0);

      haptic('light');
      if (hitGoal) haptic('success');

      // 🎮 XP: Dispatch для gamification
      window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: { ml, total: newWater } }));

      // 🎊 Confetti on goal hit — DOM-based (no React state)
      if (hitGoal) {
        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#3b82f6'];
        const confettiEl = document.createElement('div');
        confettiEl.className = 'confetti-container mood-confetti';
        confettiEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
        for (let i = 0; i < 20; i++) {
          const piece = document.createElement('div');
          piece.className = 'confetti-piece';
          piece.style.left = (5 + Math.random() * 90) + '%';
          piece.style.animationDelay = (Math.random() * 0.5) + 's';
          piece.style.backgroundColor = colors[i % 5];
          confettiEl.appendChild(piece);
        }
        document.body.appendChild(confettiEl);
        setTimeout(() => { if (confettiEl.parentNode) confettiEl.remove(); }, 2000);
      }
    }

    /**
     * Remove water (для исправления ошибок)
     */
    function removeWater(ml) {
      const newWater = Math.max(0, (day.waterMl || 0) - ml);
      React.startTransition(() => {
        setDay(prev => ({ ...prev, waterMl: Math.max(0, (prev.waterMl || 0) - ml), updatedAt: Date.now() }));
      });
      haptic('light');
    }

    /**
     * Open household activity picker
     */
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

    /**
     * Open edit grams modal
     */
    function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
      if (HEYS.AddProductStep?.showEditGrams) {
        HEYS.AddProductStep.showEditGrams({
          product,
          currentGrams: currentGrams || 100,
          mealIndex,
          itemId,
          dateKey: date,
          onSave: ({ mealIndex: mi, itemId: id, grams }) => {
            if (setGrams) setGrams(mi, id, grams);
          }
        });
      } else {
        // Fallback на старую модалку (если AddProductStep не загружен)
        if (setEditGramsTarget) setEditGramsTarget({ mealIndex, itemId, product });
        if (setEditGramsValue) setEditGramsValue(currentGrams || 100);
      }
    }

    /**
     * Confirm edit grams modal
     */
    function confirmEditGramsModal(editGramsTarget, editGramsValue) {
      if (editGramsTarget && editGramsValue > 0 && setGrams) {
        setGrams(editGramsTarget.mealIndex, editGramsTarget.itemId, editGramsValue);
      }
      if (setEditGramsTarget) setEditGramsTarget(null);
      if (setEditGramsValue) setEditGramsValue(100);
    }

    /**
     * Cancel edit grams modal
     */
    function cancelEditGramsModal() {
      if (setEditGramsTarget) setEditGramsTarget(null);
      if (setEditGramsValue) setEditGramsValue(100);
    }

    /**
     * Update training zone minutes
     */
    function updateTraining(i, zi, mins) {
      setDay(prevDay => {
        const arr = (prevDay.trainings || []).map((t, idx) => {
          if (idx !== i) return t;
          return {
            ...t,  // сохраняем time, type и другие поля
            z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
          };
        });
        return { ...prevDay, trainings: arr, updatedAt: Date.now() };
      });
    }

    /**
     * Open training picker
     */
    function openTrainingPicker(mode = 'add', editIndex = null) {
      if (HEYS.TrainingStep) {
        const dateKey = date;
        HEYS.TrainingStep.show({
          dateKey,
          mode,
          editIndex,
          onComplete: (stepData) => {
            // Обновляем локальное состояние из сохранённых данных
            const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
            setDay(prev => ({
              ...prev,
              trainings: savedDay.trainings || [],
              updatedAt: Date.now()
            }));
          }
        });
      }
    }

    return {
      // Weight & Stats
      openWeightPicker,
      openStepsGoalPicker,
      openDeficitPicker,

      // Water
      addWater,
      removeWater,
      runWaterAnimation,

      // Household
      openHouseholdPicker,

      // Grams editing
      openEditGramsModal,
      confirmEditGramsModal,
      cancelEditGramsModal,

      // Training
      updateTraining,
      openTrainingPicker
    };
  }

  // Export module
  HEYS.dayDayHandlers = {
    createDayHandlers
  };

})(window);
