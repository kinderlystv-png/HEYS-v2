// heys_day_sleep_score_popups_v1.js — Sleep quality + day score popups
// Extracted from heys_day_v12.js

;(function(global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  function renderSleepScorePopups(params) {
    if (!React || !ReactDOM) return null;

    const {
      // Sleep quality
      showSleepQualityPicker,
      cancelSleepQualityPicker,
      confirmSleepQualityPicker,
      pendingSleepQuality,
      setPendingSleepQuality,
      pendingSleepNote,
      setPendingSleepNote,
      sleepQualityValues,
      // Day score
      showDayScorePicker,
      cancelDayScorePicker,
      confirmDayScorePicker,
      pendingDayScore,
      setPendingDayScore,
      pendingDayComment,
      setPendingDayComment,
      // Shared
      day,
      calculateDayAverages,
      handleSheetTouchStart,
      handleSheetTouchMove,
      handleSheetTouchEnd
    } = params || {};

    const portals = [];

    if (showSleepQualityPicker) {
      portals.push(
        ReactDOM.createPortal(
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
        )
      );
    }

    if (showDayScorePicker) {
      portals.push(
        ReactDOM.createPortal(
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
      );
    }

    return portals.length ? portals : null;
  }

  HEYS.daySleepScorePopups = {
    renderSleepScorePopups
  };
})(window);
