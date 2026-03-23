// heys_day_training_popups_v1.js — Training/Zone/Household popups
// Extracted from heys_day_v12.js (Phase: training popups)

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  function clampFixedPopupPosition(left, top, options = {}) {
    const {
      width = 280,
      height = 320,
      margin = 12
    } = options;

    const screenW = typeof window !== 'undefined' ? window.innerWidth : 390;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 844;
    const safeWidth = Math.min(width, Math.max(180, screenW - margin * 2));
    const safeHeight = Math.min(height, Math.max(180, screenH - margin * 2));

    return {
      left: Math.min(Math.max(left, margin), Math.max(margin, screenW - safeWidth - margin)),
      top: Math.min(Math.max(top, margin), Math.max(margin, screenH - safeHeight - margin)),
      width: safeWidth
    };
  }

  function renderTrainingPopups(params) {
    if (!React || !ReactDOM) return null;

    const {
      zoneFormulaPopup,
      closeZoneFormula,
      householdFormulaPopup,
      closeHouseholdFormula,
      showZonePicker,
      cancelZonePicker,
      confirmZonePicker,
      zonePickerTarget,
      zoneMinutesValues,
      pendingZoneMinutes,
      setPendingZoneMinutes,
      showTrainingPicker,
      cancelTrainingPicker,
      confirmTrainingPicker,
      trainingPickerStep,
      pendingTrainingZones,
      setPendingTrainingZones,
      pendingTrainingTime,
      setPendingTrainingTime,
      pendingTrainingType,
      setPendingTrainingType,
      trainingTypes,
      hoursValues,
      minutesValues,
      kcalMin,
      TR,
      mets,
      zoneNames,
      weight,
      kcalPerMin,
      r0,
      householdActivities,
      openTrainingPicker,
      openHouseholdPicker,
      WheelColumn,
      haptic,
      handleSheetTouchStart,
      handleSheetTouchMove,
      handleSheetTouchEnd,
      pendingTrainingQuality,
      setPendingTrainingQuality,
      pendingTrainingFeelAfter,
      setPendingTrainingFeelAfter,
      pendingTrainingComment,
      setPendingTrainingComment
    } = params || {};

    const safeR0 = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    const portals = [];

    if (zoneFormulaPopup) {
      const zoneFormulaSafePos = clampFixedPopupPosition(zoneFormulaPopup.left, zoneFormulaPopup.top, {
        width: 280,
        height: 320,
        margin: 12
      });
      portals.push(
        ReactDOM.createPortal(
          React.createElement('div', {
            className: 'zone-formula-backdrop',
            onClick: closeZoneFormula
          },
            React.createElement('div', {
              className: 'zone-formula-popup' + (zoneFormulaPopup.showAbove ? ' show-above' : ''),
              style: {
                position: 'fixed',
                left: zoneFormulaSafePos.left + 'px',
                top: zoneFormulaSafePos.top + 'px',
                width: zoneFormulaSafePos.width + 'px',
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: 'calc(100dvh - 24px)',
                overflowY: 'auto',
                boxSizing: 'border-box'
              },
              onClick: e => e.stopPropagation()
            },
              (() => {
                const zi = zoneFormulaPopup.zi;
                const ti = zoneFormulaPopup.ti;
                const T = (TR && TR[ti]) || { z: [0, 0, 0, 0] };
                const minutes = +T.z[zi] || 0;
                const met = (mets && mets[zi]) || [2.5, 6, 8, 10][zi];
                const kcal = safeR0(minutes * (typeof kcalPerMin === 'function' ? kcalPerMin(met, weight) : 0));

                return React.createElement(React.Fragment, null,
                  React.createElement('div', { className: 'zone-formula-header' },
                    React.createElement('span', { className: 'zone-formula-badge' }, 'Z' + (zi + 1)),
                    React.createElement('span', { className: 'zone-formula-name' }, (zoneNames && zoneNames[zi]) || '')
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
                      if (typeof openTrainingPicker === 'function') openTrainingPicker(ti);
                    }
                  }, '✏️ Изменить')
                );
              })()
            )
          ),
          document.body
        )
      );
    }

    if (householdFormulaPopup) {
      const householdFormulaSafePos = clampFixedPopupPosition(householdFormulaPopup.left, householdFormulaPopup.top, {
        width: 280,
        height: 320,
        margin: 12
      });
      portals.push(
        ReactDOM.createPortal(
          React.createElement('div', {
            className: 'zone-formula-backdrop',
            onClick: closeHouseholdFormula
          },
            React.createElement('div', {
              className: 'zone-formula-popup' + (householdFormulaPopup.showAbove ? ' show-above' : ''),
              style: {
                position: 'fixed',
                left: householdFormulaSafePos.left + 'px',
                top: householdFormulaSafePos.top + 'px',
                width: householdFormulaSafePos.width + 'px',
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: 'calc(100dvh - 24px)',
                overflowY: 'auto',
                boxSizing: 'border-box'
              },
              onClick: e => e.stopPropagation()
            },
              (() => {
                const hi = householdFormulaPopup.hi;
                const h = (householdActivities && householdActivities[hi]) || { minutes: 0 };
                const minutes = +h.minutes || 0;
                const met = 2.5;
                const kcal = safeR0(minutes * (typeof kcalPerMin === 'function' ? kcalPerMin(met, weight) : 0));

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
                      if (typeof openHouseholdPicker === 'function') openHouseholdPicker('edit', hi);
                    }
                  }, '✏️ Изменить')
                );
              })()
            )
          ),
          document.body
        )
      );
    }

    if (showZonePicker) {
      portals.push(
        ReactDOM.createPortal(
          React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelZonePicker },
            React.createElement('div', { className: 'time-picker-modal zone-picker-modal', onClick: e => e.stopPropagation() },
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
              React.createElement('div', { className: 'zone-picker-kcal-hint' },
                '🔥 ',
                safeR0((zoneMinutesValues?.[pendingZoneMinutes] || 0) * (kcalMin?.[zonePickerTarget?.zoneIndex] || 0)),
                ' ккал'
              ),
              React.createElement('div', { className: 'time-picker-wheels zone-wheels' },
                React.createElement(WheelColumn, {
                  values: (zoneMinutesValues || []).map(v => v + ' мин'),
                  selected: pendingZoneMinutes,
                  onChange: (i) => setPendingZoneMinutes && setPendingZoneMinutes(i),
                  wrap: false
                })
              )
            )
          ),
          document.body
        )
      );
    }

    if (showTrainingPicker) {
      portals.push(
        ReactDOM.createPortal(
          React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTrainingPicker },
            React.createElement('div', {
              className: 'time-picker-modal training-picker-modal',
              onClick: e => e.stopPropagation()
            },
              React.createElement('div', {
                className: 'bottom-sheet-handle',
                onTouchStart: handleSheetTouchStart,
                onTouchMove: handleSheetTouchMove,
                onTouchEnd: () => handleSheetTouchEnd(cancelTrainingPicker)
              }),

              React.createElement('div', { className: 'time-picker-header' },
                React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTrainingPicker },
                  trainingPickerStep >= 2 ? '← Назад' : 'Отмена'
                ),
                React.createElement('span', { className: 'time-picker-title' },
                  trainingPickerStep === 1 ? '🏋️ Тренировка' :
                    trainingPickerStep === 2 ? '⏱️ Зоны' : '⭐ Оценка'
                ),
                (() => {
                  const totalMinutes = trainingPickerStep === 2
                    ? pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0)
                    : 1;
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

              trainingPickerStep === 1 && React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'training-type-section' },
                  React.createElement('div', { className: 'training-type-label' }, 'Тип тренировки'),
                  React.createElement('div', { className: 'training-type-buttons' },
                    (trainingTypes || []).map(t =>
                      React.createElement('button', {
                        key: t.id,
                        className: 'training-type-btn' + (pendingTrainingType === t.id ? ' active' : ''),
                        onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingType && setPendingTrainingType(t.id); }
                      },
                        React.createElement('span', { className: 'training-type-icon' }, t.icon),
                        React.createElement('span', { className: 'training-type-text' }, t.label)
                      )
                    )
                  )
                ),

                React.createElement('div', { className: 'training-time-section' },
                  React.createElement('div', { className: 'training-time-label' }, 'Время начала'),
                  React.createElement('div', { className: 'time-picker-wheels' },
                    React.createElement(WheelColumn, {
                      values: hoursValues,
                      selected: pendingTrainingTime.hours,
                      onChange: (i) => setPendingTrainingTime && setPendingTrainingTime(prev => ({ ...prev, hours: i })),
                      label: 'Часы'
                    }),
                    React.createElement('div', { className: 'time-picker-separator' }, ':'),
                    React.createElement(WheelColumn, {
                      values: minutesValues,
                      selected: pendingTrainingTime.minutes,
                      onChange: (i) => setPendingTrainingTime && setPendingTrainingTime(prev => ({ ...prev, minutes: i })),
                      label: 'Минуты'
                    })
                  )
                )
              ),

              trainingPickerStep === 2 && React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'training-zones-section' },
                  React.createElement('div', { className: 'training-zones-label' }, 'Минуты в каждой зоне'),
                  React.createElement('div', { className: 'training-zones-wheels' },
                    [0, 1, 2, 3].map(zi =>
                      React.createElement('div', { key: 'zone' + zi, className: 'training-zone-column' },
                        React.createElement('div', { className: 'training-zone-header zone-color-' + (zi + 1) }, 'Z' + (zi + 1)),
                        React.createElement(WheelColumn, {
                          values: (zoneMinutesValues || []).map(v => String(v)),
                          selected: pendingTrainingZones[zi],
                          onChange: (i) => {
                            if (typeof haptic === 'function') haptic('light');
                            setPendingTrainingZones && setPendingTrainingZones(prev => {
                              const next = [...prev];
                              next[zi] = i;
                              return next;
                            });
                          },
                          wrap: false
                        })
                      )
                    )
                  ),
                  React.createElement('div', { className: 'training-zones-stats' },
                    React.createElement('span', { className: 'training-zones-time' },
                      '⏱️ ',
                      pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0),
                      ' мин'
                    ),
                    React.createElement('span', { className: 'training-zones-kcal' },
                      '🔥 ',
                      safeR0(pendingTrainingZones.reduce((sum, idx, zi) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0) * (kcalMin[zi] || 0), 0)),
                      ' ккал'
                    )
                  )
                )
              ),

              trainingPickerStep === 3 && (() => {
                const quality = pendingTrainingQuality;
                const feelAfter = pendingTrainingFeelAfter;

                const positiveSignals = (quality >= 7 ? 1 : 0) + (feelAfter >= 7 ? 1 : 0);
                const negativeSignals = (quality > 0 && quality <= 3 ? 1 : 0) + (feelAfter > 0 && feelAfter <= 3 ? 1 : 0);

                const ratingState = negativeSignals >= 1 && positiveSignals === 0 ? 'negative' :
                  positiveSignals >= 1 && negativeSignals === 0 ? 'positive' : 'neutral';

                const getPositiveColor = (v) => {
                  if (v <= 3) return '#ef4444';
                  if (v <= 5) return '#eab308';
                  if (v <= 7) return '#84cc16';
                  return '#10b981';
                };

                const getQualityEmoji = (v) =>
                  v === 0 ? '🤷' : v <= 2 ? '😫' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🔥';

                const getFeelEmoji = (v) =>
                  v === 0 ? '🤷' : v <= 2 ? '🥵' : v <= 4 ? '😓' : v <= 6 ? '😌' : v <= 8 ? '😊' : '✨';

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
                          onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingQuality && setPendingTrainingQuality(2); }
                        }, '😫 Плохо'),
                        React.createElement('button', {
                          className: 'mood-preset mood-preset-ok' + (quality >= 4 && quality <= 6 ? ' active' : ''),
                          onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingQuality && setPendingTrainingQuality(5); }
                        }, '😐 Норм'),
                        React.createElement('button', {
                          className: 'mood-preset mood-preset-good' + (quality >= 7 ? ' active' : ''),
                          onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingQuality && setPendingTrainingQuality(8); }
                        }, '💪 Отлично')
                      ),
                      React.createElement('input', {
                        type: 'range',
                        min: 0,
                        max: 10,
                        value: quality,
                        className: 'mood-slider mood-slider-positive',
                        onChange: (e) => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingQuality && setPendingTrainingQuality(parseInt(e.target.value)); }
                      })
                    ),

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
                          className: 'mood-preset mood-preset-good' + (feelAfter > 0 && feelAfter <= 3 ? ' active' : ''),
                          onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingFeelAfter && setPendingTrainingFeelAfter(2); }
                        }, '🥵 Устал'),
                        React.createElement('button', {
                          className: 'mood-preset mood-preset-ok' + (feelAfter >= 4 && feelAfter <= 6 ? ' active' : ''),
                          onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingFeelAfter && setPendingTrainingFeelAfter(5); }
                        }, '😌 Норм'),
                        React.createElement('button', {
                          className: 'mood-preset mood-preset-bad' + (feelAfter >= 7 ? ' active' : ''),
                          onClick: () => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingFeelAfter && setPendingTrainingFeelAfter(8); }
                        }, '✨ Энергия')
                      ),
                      React.createElement('input', {
                        type: 'range',
                        min: 0,
                        max: 10,
                        value: feelAfter,
                        className: 'mood-slider mood-slider-positive',
                        onChange: (e) => { if (typeof haptic === 'function') haptic('light'); setPendingTrainingFeelAfter && setPendingTrainingFeelAfter(parseInt(e.target.value)); }
                      })
                    )
                  ),

                  (() => {
                    const trainingChips = ratingState === 'negative'
                      ? ['Мало сил', 'Травма', 'Не выспался', 'Жарко', 'Нет мотивации']
                      : ratingState === 'positive'
                        ? ['Новый рекорд', 'Много энергии', 'Хороший сон', 'Правильно ел', 'В потоке']
                        : [];

                    const addTrainingChip = (chip) => {
                      if (typeof haptic === 'function') haptic('light');
                      const current = pendingTrainingComment || '';
                      setPendingTrainingComment && setPendingTrainingComment(current ? current + ', ' + chip : chip);
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
                          onChange: (e) => setPendingTrainingComment && setPendingTrainingComment(e.target.value),
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
        )
      );
    }

    return portals;
  }

  HEYS.dayTrainingPopups = {
    renderTrainingPopups
  };
})(window);
