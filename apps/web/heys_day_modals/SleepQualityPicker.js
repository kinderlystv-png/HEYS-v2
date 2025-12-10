// heys_day_modals/SleepQualityPicker.js — Sleep Quality Picker Modal
// Extracted from heys_day_v12.js for Phase 2 refactoring

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  /**
   * Sleep Quality Picker Modal
   * Оценка качества сна (0-10) с emoji, слайдером и комментарием
   */
  function SleepQualityPicker({
    isOpen,
    value,
    note,
    sleepHours,
    existingNote,
    onConfirm,
    onCancel,
    handleSheetTouchStart,
    handleSheetTouchMove,
    handleSheetTouchEnd
  }) {
    if (!isOpen) return null;
    
    const [pendingQuality, setPendingQuality] = React.useState(value || 0);
    const [pendingNote, setPendingNote] = React.useState(note || '');
    
    React.useEffect(() => {
      if (isOpen) {
        setPendingQuality(value || 0);
        setPendingNote(note || '');
      }
    }, [isOpen, value, note]);
    
    const sleepQualityValues = React.useMemo(() => 
      ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 
    []);
    
    const handleConfirm = () => {
      onConfirm(pendingQuality, pendingNote);
    };
    
    const sleepState = pendingQuality >= 8 ? 'positive' : 
                       pendingQuality >= 1 && pendingQuality <= 4 ? 'negative' : 
                       'neutral';
    
    const sleepChips = sleepState === 'negative' 
      ? ['Шум', 'Кошмары', 'Душно', 'Поздно лёг', 'Тревога', 'Кофе']
      : sleepState === 'positive'
      ? ['Режим', 'Тишина', 'Прохлада', 'Без гаджетов', 'Прогулка']
      : [];
    
    const addSleepChip = (chip) => {
      if (navigator.vibrate) navigator.vibrate(5);
      const current = pendingNote || '';
      setPendingNote(current ? current + ', ' + chip : chip);
    };
    
    return ReactDOM.createPortal(
      React.createElement('div', { 
        className: 'time-picker-backdrop', 
        onClick: onCancel 
      },
        React.createElement('div', { 
          className: 'time-picker-modal sleep-quality-picker-modal', 
          onClick: e => e.stopPropagation() 
        },
          React.createElement('div', { 
            className: 'bottom-sheet-handle',
            onTouchStart: handleSheetTouchStart,
            onTouchMove: handleSheetTouchMove,
            onTouchEnd: () => handleSheetTouchEnd && handleSheetTouchEnd(onCancel)
          }),
          React.createElement('div', { className: 'time-picker-header' },
            React.createElement('button', { 
              className: 'time-picker-cancel', 
              onClick: onCancel 
            }, 'Отмена'),
            React.createElement('span', { className: 'time-picker-title' }, '😴 Качество сна'),
            React.createElement('button', { 
              className: 'time-picker-confirm', 
              onClick: handleConfirm 
            }, 'Готово')
          ),
          // Большой emoji и текст
          React.createElement('div', { className: 'sleep-quality-face' },
            React.createElement('span', { className: 'sleep-quality-face-emoji' }, 
              pendingQuality === 0 ? '🤷' :
              pendingQuality <= 2 ? '😫' :
              pendingQuality <= 4 ? '😩' :
              pendingQuality <= 5 ? '😐' :
              pendingQuality <= 7 ? '😌' :
              pendingQuality <= 9 ? '😊' : '🌟'
            ),
            React.createElement('span', { className: 'sleep-quality-face-text' }, 
              pendingQuality === 0 ? 'Не указано' :
              pendingQuality <= 2 ? 'Ужасно спал' :
              pendingQuality <= 4 ? 'Плохо спал' :
              pendingQuality <= 5 ? 'Средне' :
              pendingQuality <= 7 ? 'Нормально' :
              pendingQuality <= 9 ? 'Хорошо выспался' : 'Отлично выспался!'
            )
          ),
          // Большое число
          React.createElement('div', { className: 'sleep-quality-big-value' },
            React.createElement('span', { 
              className: 'sleep-quality-number',
              style: { 
                color: pendingQuality === 0 ? '#9ca3af' :
                       pendingQuality <= 2 ? '#ef4444' :
                       pendingQuality <= 4 ? '#f97316' :
                       pendingQuality <= 5 ? '#eab308' :
                       pendingQuality <= 7 ? '#84cc16' :
                       pendingQuality <= 9 ? '#22c55e' : '#10b981'
              }
            }, pendingQuality === 0 ? '—' : sleepQualityValues[pendingQuality]),
            React.createElement('span', { className: 'sleep-quality-of-ten' }, 
              pendingQuality > 0 ? '/10' : ''
            )
          ),
          // Preset кнопки
          React.createElement('div', { className: 'sleep-quality-presets' },
            React.createElement('button', {
              className: 'sleep-quality-preset sleep-quality-preset-bad' + 
                (pendingQuality >= 1 && pendingQuality <= 3 ? ' active' : ''),
              onClick: () => { 
                if (navigator.vibrate) navigator.vibrate(10); 
                setPendingQuality(2); 
              }
            }, '😫 Плохо'),
            React.createElement('button', {
              className: 'sleep-quality-preset sleep-quality-preset-ok' + 
                (pendingQuality >= 4 && pendingQuality <= 7 ? ' active' : ''),
              onClick: () => { 
                if (navigator.vibrate) navigator.vibrate(10); 
                setPendingQuality(5); 
              }
            }, '😐 Средне'),
            React.createElement('button', {
              className: 'sleep-quality-preset sleep-quality-preset-good' + 
                (pendingQuality >= 8 && pendingQuality <= 10 ? ' active' : ''),
              onClick: () => { 
                if (navigator.vibrate) navigator.vibrate(10); 
                setPendingQuality(9); 
              }
            }, '😊 Отлично')
          ),
          // Слайдер
          React.createElement('div', { className: 'sleep-quality-slider-container' },
            React.createElement('input', {
              type: 'range',
              min: 0,
              max: 10,
              value: pendingQuality,
              className: 'mood-slider mood-slider-positive sleep-quality-slider',
              onChange: (e) => {
                if (navigator.vibrate) navigator.vibrate(10);
                setPendingQuality(parseInt(e.target.value));
              }
            }),
            React.createElement('div', { className: 'sleep-quality-slider-labels' },
              React.createElement('span', null, '😫'),
              React.createElement('span', null, '😴'),
              React.createElement('span', null, '🌟')
            )
          ),
          // Комментарий
          React.createElement('div', { 
            className: 'sleep-quality-comment-wrapper ' + sleepState
          },
            React.createElement('div', { 
              className: 'sleep-quality-comment-prompt ' + sleepState
            },
              React.createElement('div', { className: 'comment-prompt-header' },
                React.createElement('span', { className: 'sleep-quality-comment-icon' }, 
                  sleepState === 'positive' ? '✨' : 
                  sleepState === 'negative' ? '📝' : '💭'
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
                    className: 'quick-chip' + ((pendingNote || '').includes(chip) ? ' selected' : ''),
                    onClick: () => addSleepChip(chip)
                  }, chip)
                )
              ),
              // История комментариев
              existingNote && React.createElement('div', { className: 'comment-history' }, existingNote),
              // Поле для нового комментария
              React.createElement('input', {
                type: 'text',
                className: 'sleep-quality-comment-input',
                placeholder: sleepState === 'positive' ? 'Режим, тишина, прохлада...' : 
                             sleepState === 'negative' ? 'Шум, кошмары, душно...' : 'Любые заметки...',
                value: pendingNote,
                onChange: (e) => setPendingNote(e.target.value),
                onClick: (e) => e.stopPropagation()
              })
            )
          ),
          // Часы сна
          sleepHours > 0 && React.createElement('div', { className: 'sleep-quality-hours-info' },
            '🛏️ Сегодня: ',
            React.createElement('strong', null, sleepHours + ' ч'),
            sleepHours < 6 ? ' — маловато!' : sleepHours >= 8 ? ' — отлично!' : ''
          )
        )
      ),
      document.body
    );
  }
  
  HEYS.DayModals = HEYS.DayModals || {};
  HEYS.DayModals.SleepQualityPicker = SleepQualityPicker;
  
})(typeof window !== 'undefined' ? window : global);
