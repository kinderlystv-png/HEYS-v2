// heys_day_trainings_v1.js — Trainings + household block renderer
// Extracted from heys_day_v12.js (trainings block)

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  function renderTrainingsBlock(params) {
    if (!React) return null;

    const {
      haptic,
      setDay,
      setVisibleTrainings,
      visibleTrainings,
      householdActivities,
      openTrainingPicker,
      showZoneFormula,
      openHouseholdPicker,
      showHouseholdFormula,
      trainingTypes,
      TR,
      kcalMin,
      kcalPerMin,
      weight,
      r0
    } = params || {};

    const safeR0 = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    const safeVisibleTrainings = Math.max(0, visibleTrainings || 0);
    const safeHouseholdActivities = Array.isArray(householdActivities) ? householdActivities : [];
    const safeTrainingTypes = Array.isArray(trainingTypes) ? trainingTypes : [];
    const safeTrainings = Array.isArray(TR) ? TR : [];

    function getTrainingDisplayLabel(training, trainingType, index) {
      const customLabel = typeof training?.activityLabel === 'string'
        ? training.activityLabel.trim()
        : '';
      return customLabel || trainingType?.label || ('Тренировка ' + (index + 1));
    }

    function getTrainingDisplayMeta(displayLabel, trainingType) {
      const baseLabel = trainingType?.label || '';
      if (!displayLabel || !baseLabel) return '';
      return displayLabel.toLowerCase() === baseLabel.toLowerCase() ? '' : baseLabel;
    }

    const trainIcons = ['🏃', '🚴', '🏊'];

    function cloneTraining(training) {
      const source = training || {};
      return {
        ...source,
        z: Array.isArray(source.z) ? source.z.slice() : [0, 0, 0, 0]
      };
    }

    function cloneHouseholdActivity(activity) {
      return activity ? { ...activity } : activity;
    }

    function runUndoableAction(options) {
      if (!options || typeof options.apply !== 'function') return false;

      if (HEYS.Undo?.runAction && typeof options.undo === 'function') {
        return HEYS.Undo.runAction({
          label: options.label,
          duration: options.duration,
          errorMessage: options.errorMessage,
          apply: options.apply,
          undo: options.undo,
          onExpire: options.onExpire,
          onApplyError: options.onApplyError,
        });
      }

      try {
        return options.apply();
      } catch (error) {
        console.error('[HEYS.dayTrainings] undoable apply error:', error);
        options.onApplyError?.(error);
        if (options.errorMessage) {
          HEYS.Toast?.error(options.errorMessage);
        }
        return false;
      }
    }

    const removeTraining = async (ti) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🏋️',
        title: 'Удалить тренировку?',
        text: 'Тренировка исчезнет сразу, но её можно будет быстро вернуть через кнопку «Отменить».'
      });

      if (!confirmed) return;

      if (typeof haptic === 'function') haptic('medium');
      const emptyTraining = { z: [0, 0, 0, 0], time: '', type: '' };
      const previousTrainings = safeTrainings.map(cloneTraining);
      const previousVisibleTrainings = safeVisibleTrainings;
      const removedTraining = previousTrainings[ti] || emptyTraining;
      const trainingType = safeTrainingTypes.find((item) => item.id === removedTraining.type);
      const label = getTrainingDisplayLabel(removedTraining, trainingType, ti) + ' удалена';

      runUndoableAction({
        label,
        duration: 5000,
        errorMessage: 'Не удалось удалить тренировку',
        apply: () => {
          if (typeof setDay === 'function') {
            setDay((prevDay) => {
              const oldTrainings = prevDay.trainings || [emptyTraining, emptyTraining, emptyTraining];
              const newTrainings = [
                ...oldTrainings.slice(0, ti),
                ...oldTrainings.slice(ti + 1),
                emptyTraining
              ].slice(0, 3);
              return { ...prevDay, trainings: newTrainings, updatedAt: Date.now() };
            });
          }
          if (typeof setVisibleTrainings === 'function') {
            setVisibleTrainings((prev) => Math.max(0, prev - 1));
          }

          return {
            trainings: previousTrainings,
            visibleTrainings: previousVisibleTrainings,
          };
        },
        undo: (context) => {
          if (typeof setDay === 'function') {
            setDay((prevDay) => ({
              ...prevDay,
              trainings: (context?.trainings || []).map(cloneTraining),
              updatedAt: Date.now(),
            }));
          }
          if (typeof setVisibleTrainings === 'function' && context) {
            setVisibleTrainings(context.visibleTrainings);
          }
        },
      });
    };

    const removeHousehold = async (idx) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🏠',
        title: 'Удалить активность?',
        text: 'Активность исчезнет сразу, но её можно будет быстро вернуть через кнопку «Отменить».'
      });

      if (!confirmed) return;

      if (typeof haptic === 'function') haptic('medium');
      const previousActivities = safeHouseholdActivities.map(cloneHouseholdActivity);
      const removedActivity = previousActivities[idx] || null;

      runUndoableAction({
        label: 'Бытовая активность удалена',
        duration: 5000,
        errorMessage: 'Не удалось удалить активность',
        apply: () => {
          if (typeof setDay === 'function') {
            setDay((prevDay) => {
              const oldActivities = prevDay.householdActivities || [];
              const newActivities = oldActivities.filter((_, i) => i !== idx);
              const totalMin = newActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
              return {
                ...prevDay,
                householdActivities: newActivities,
                householdMin: totalMin,
                householdTime: newActivities[0]?.time || '',
                updatedAt: Date.now()
              };
            });
          }

          return {
            activities: previousActivities,
            removedActivity,
          };
        },
        undo: (context) => {
          if (!context || typeof setDay !== 'function') return;
          setDay((prevDay) => {
            const restoredActivities = (context.activities || []).map(cloneHouseholdActivity);
            const totalMin = restoredActivities.reduce((sum, activity) => sum + (+activity?.minutes || 0), 0);
            return {
              ...prevDay,
              householdActivities: restoredActivities,
              householdMin: totalMin,
              householdTime: restoredActivities[0]?.time || '',
              updatedAt: Date.now()
            };
          });
        },
      });
    };

    return React.createElement('div', { className: 'compact-trainings' },
      safeVisibleTrainings === 0 && safeHouseholdActivities.length === 0 && React.createElement('div', { className: 'empty-trainings' },
        React.createElement('span', { className: 'empty-trainings-icon' }, '🏃‍♂️'),
        React.createElement('span', { className: 'empty-trainings-text' }, 'Нет тренировок')
      ),
      Array.from({ length: safeVisibleTrainings }, (_, ti) => {
        const rawT = safeTrainings[ti] || {};
        const T = {
          z: rawT.z || [0, 0, 0, 0],
          time: rawT.time || '',
          type: rawT.type || '',
          activityLabel: rawT.activityLabel || '',
          mood: rawT.mood ?? 0,
          wellbeing: rawT.wellbeing ?? 0,
          stress: rawT.stress ?? 0,
          comment: rawT.comment || ''
        };

        const kcalZ = (i) => safeR0((+T.z[i] || 0) * (kcalMin?.[i] || 0));
        const total = safeR0(kcalZ(0) + kcalZ(1) + kcalZ(2) + kcalZ(3));
        const trainingType = safeTrainingTypes.find(t => t.id === T.type);
        const displayLabel = getTrainingDisplayLabel(T, trainingType, ti);
        const displayMeta = getTrainingDisplayMeta(displayLabel, trainingType);

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

        const totalMinutes = (T.z || []).reduce((sum, m) => sum + (+m || 0), 0);
        const hasDuration = totalMinutes > 0;

        return React.createElement('div', {
          key: 'tr' + ti,
          className: 'compact-card compact-train compact-train--minimal widget-shadow-diary-glass widget-outline-diary-glass'
        },
          React.createElement('div', {
            className: 'compact-train-header',
            onClick: () => openTrainingPicker && openTrainingPicker(ti)
          },
            React.createElement('span', { className: 'compact-train-icon' }, trainingType ? trainingType.icon : (trainIcons[ti] || '💪')),
            React.createElement('div', { className: 'compact-train-title-box' },
              React.createElement('span', { className: 'compact-train-title' }, displayLabel),
              displayMeta && React.createElement('span', { className: 'compact-train-subtitle' }, displayMeta)
            ),
            T.time && React.createElement('span', { className: 'compact-train-time' }, T.time),
            React.createElement('div', { className: 'compact-right-group' },
              React.createElement('span', { className: 'compact-badge train' }, total + ' ккал'),
              React.createElement('button', {
                className: 'compact-train-remove',
                onClick: (e) => { e.stopPropagation(); removeTraining(ti); },
                title: 'Убрать тренировку'
              }, '×')
            )
          ),
          React.createElement('div', { className: 'compact-train-zones-inline' },
            [0, 1, 2, 3].map((zi) => {
              const hasValue = +T.z[zi] > 0;
              return React.createElement('span', {
                key: 'z' + zi,
                className: 'compact-zone-inline' + (hasValue ? ' has-value' : ''),
                onClick: (e) => showZoneFormula && showZoneFormula(ti, zi, e)
              },
                React.createElement('span', { className: 'zone-label' }, 'Z' + (zi + 1)),
                React.createElement('span', { className: 'zone-value' }, hasValue ? T.z[zi] : '—'),
                hasValue && React.createElement('span', { className: 'zone-kcal' }, kcalZ(zi))
              );
            })
          ),
          React.createElement('div', { className: 'compact-train-footer' },
            hasDuration && React.createElement('span', { className: 'train-duration-badge' }, '⏱ ' + totalMinutes + ' мин'),
            hasRatings && React.createElement('div', { className: 'train-ratings-inline' },
              moodEmoji && React.createElement('span', { className: 'train-rating-mini mood', title: 'Настроение' }, moodEmoji + ' ' + T.mood),
              wellbeingEmoji && React.createElement('span', { className: 'train-rating-mini wellbeing', title: 'Самочувствие' }, wellbeingEmoji + ' ' + T.wellbeing),
              stressEmoji && React.createElement('span', { className: 'train-rating-mini stress', title: 'Усталость' }, stressEmoji + ' ' + T.stress)
            ),
            React.createElement('span', { className: 'tap-hint' }, '✏️ Нажми для изменения')
          ),
          T.comment && React.createElement('div', { className: 'training-card-comment' },
            '💬 ', T.comment
          )
        );
      }),
      safeHouseholdActivities.map((h, hi) => {
        const hKcal = safeR0((+h.minutes || 0) * (typeof kcalPerMin === 'function' ? kcalPerMin(2.5, weight) : 0));
        return React.createElement('div', {
          key: 'household-' + hi,
          className: 'compact-card compact-household widget-shadow-diary-glass widget-outline-diary-glass'
        },
          React.createElement('div', {
            className: 'compact-train-header',
            onClick: () => openHouseholdPicker && openHouseholdPicker('edit', hi)
          },
            React.createElement('span', { className: 'compact-train-icon' }, '🏠'),
            React.createElement('span', { className: 'compact-train-title' }, 'Бытовая активность'),
            h.time && React.createElement('span', { className: 'compact-train-time' }, h.time),
            React.createElement('div', { className: 'compact-right-group' },
              React.createElement('span', {
                className: 'compact-badge household clickable',
                onClick: (e) => showHouseholdFormula && showHouseholdFormula(hi, e)
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
  }

  HEYS.dayTrainings = {
    renderTrainingsBlock
  };
})(window);
