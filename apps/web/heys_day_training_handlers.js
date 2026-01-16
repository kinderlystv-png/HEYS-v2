// heys_day_training_handlers.js — Training picker + zone/household popups handlers
// Phase 10.2 of HEYS Day v12 refactoring
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  if (!HEYS.dayUtils) {
    throw new Error('[heys_day_training_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
  }

  const { pad2, wheelIndexToHour, hourToWheelIndex } = HEYS.dayUtils;

  function createTrainingHandlers(deps) {
    const {
      day,
      date,
      TR,
      zoneMinutesValues,
      visibleTrainings,
      setVisibleTrainings,
      updateTraining,
      lsGet,
      haptic,
      getSmartPopupPosition,
      setZonePickerTarget,
      zonePickerTarget,
      setPendingZoneMinutes,
      setShowZonePicker,
      setZoneFormulaPopup,
      setHouseholdFormulaPopup,
      setShowTrainingPicker,
      setTrainingPickerStep,
      setEditingTrainingIndex,
      setPendingTrainingTime,
      setPendingTrainingType,
      setPendingTrainingZones,
      setPendingTrainingQuality,
      setPendingTrainingFeelAfter,
      setPendingTrainingComment,
      setDay,
      trainingPickerStep,
      pendingTrainingTime,
      pendingTrainingZones,
      pendingTrainingType,
      pendingTrainingQuality,
      pendingTrainingFeelAfter,
      pendingTrainingComment,
      editingTrainingIndex
    } = deps;

    const hapticFn = typeof haptic === 'function' ? haptic : HEYS.dayUtils.haptic || (() => {});

    const zoneNames = ['Восстановление', 'Жиросжигание', 'Аэробная', 'Анаэробная'];
    const POPUP_WIDTH = 240;
    const POPUP_HEIGHT = 220;

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

    function showZoneFormula(trainingIndex, zoneIndex, event) {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
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

    function showHouseholdFormula(householdIndex, event) {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
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

    function openTrainingPicker(trainingIndex) {
      if (HEYS.TrainingStep?.show) {
        HEYS.TrainingStep.show({
          dateKey: date,
          trainingIndex,
          onComplete: () => {
            const savedDay = lsGet(`heys_dayv2_${date}`, {});
            const savedTrainings = savedDay.trainings || [];
            setDay(prev => ({
              ...prev,
              trainings: savedTrainings,
              updatedAt: Date.now()
            }));
            const validCount = savedTrainings.filter(t => t && t.z && t.z.some(v => +v > 0)).length;
            setVisibleTrainings(validCount);
          }
        });
        return;
      }

      const now = new Date();
      const T = TR[trainingIndex] || { z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' };

      if (T.time) {
        const [h, m] = T.time.split(':').map(Number);
        setPendingTrainingTime({ hours: hourToWheelIndex(h || 10), minutes: m || 0 });
      } else {
        setPendingTrainingTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
      }

      setPendingTrainingType(T.type || 'cardio');

      const zones = T.z || [0, 0, 0, 0];
      const zoneIndices = zones.map(minutes => {
        const idx = zoneMinutesValues.indexOf(String(minutes));
        return idx >= 0 ? idx : 0;
      });
      setPendingTrainingZones(zoneIndices);

      setPendingTrainingQuality(T.quality || 0);
      setPendingTrainingFeelAfter(T.feelAfter || 0);
      setPendingTrainingComment(T.comment || '');

      setTrainingPickerStep(1);
      setEditingTrainingIndex(trainingIndex);
      setShowTrainingPicker(true);
    }

    function confirmTrainingPicker() {
      if (trainingPickerStep === 1) {
        setTrainingPickerStep(2);
        return;
      }

      if (trainingPickerStep === 2) {
        const totalMinutes = pendingTrainingZones.reduce(
          (sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0),
          0
        );
        if (totalMinutes === 0) {
          hapticFn('error');
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

      const realHours = wheelIndexToHour(pendingTrainingTime.hours);
      const timeStr = pad2(realHours) + ':' + pad2(pendingTrainingTime.minutes);
      const zoneMinutes = pendingTrainingZones.map(idx => parseInt(zoneMinutesValues[idx], 10) || 0);

      const existingTrainings = day.trainings || [];
      const newTrainings = [...existingTrainings];
      const idx = editingTrainingIndex;

      while (newTrainings.length <= idx) {
        newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' });
      }

      newTrainings[idx] = {
        ...newTrainings[idx],
        z: zoneMinutes,
        time: timeStr,
        type: pendingTrainingType,
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
      if (trainingPickerStep === 3) {
        setTrainingPickerStep(2);
        return;
      }
      if (trainingPickerStep === 2) {
        setTrainingPickerStep(1);
        return;
      }

      const idx = editingTrainingIndex;
      const trainings = day.trainings || [];
      const training = trainings[idx];

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

    return {
      openZonePicker,
      confirmZonePicker,
      cancelZonePicker,
      showZoneFormula,
      closeZoneFormula,
      showHouseholdFormula,
      closeHouseholdFormula,
      openTrainingPicker,
      confirmTrainingPicker,
      cancelTrainingPicker,
      zoneNames
    };
  }

  HEYS.dayTrainingHandlers = {
    createTrainingHandlers
  };

})(window);
