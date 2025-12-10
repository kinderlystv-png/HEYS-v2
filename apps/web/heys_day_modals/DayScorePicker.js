// heys_day_modals/DayScorePicker.js — Day Score Picker Modal
// Extracted from heys_day_v12.js for Phase 2 refactoring

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  /**
   * Day Score Picker Modal
   * Оценка дня (0-10) с автоматическим расчётом и комментарием
   */
  function DayScorePicker({
    isOpen,
    value,
    comment,
    autoScore,
    existingComment,
    moodAvg,
    wellbeingAvg,
    stressAvg,
    onConfirm,
    onCancel,
    handleSheetTouchStart,
    handleSheetTouchMove,
    handleSheetTouchEnd
  }) {
    if (!isOpen) return null;
    
    const [pendingScore, setPendingScore] = React.useState(value || 0);
    const [pendingComment, setPendingComment] = React.useState(comment || '');
    
    React.useEffect(() => {
      if (isOpen) {
        setPendingScore(value || 0);
        setPendingComment(comment || '');
      }
    }, [isOpen, value, comment]);
    
    const handleConfirm = () => {
      onConfirm(pendingScore, pendingComment);
    };
    
    const scoreState = pendingScore >= 7 ? 'positive' : 
                       pendingScore >= 1 && pendingScore <= 4 ? 'negative' : 
                       'neutral';
    
    return ReactDOM.createPortal(
      React.createElement('div', { 
        className: 'time-picker-backdrop', 
        onClick: onCancel 
      },
        React.createElement('div', { 
          className: 'time-picker-modal day-score-picker-modal', 
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
            React.createElement('span', { className: 'time-picker-title' }, '📊 Оценка дня'),
            React.createElement('button', { 
              className: 'time-picker-confirm', 
              onClick: handleConfirm 
            }, 'Готово')
          ),
          // Большой emoji и текст
          React.createElement('div', { className: 'day-score-face' },
            React.createElement('span', { className: 'day-score-face-emoji' }, 
              pendingScore === 0 ? '🤷' :
              pendingScore <= 3 ? '😢' :
              pendingScore <= 5 ? '😐' :
              pendingScore <= 7 ? '🙂' :
              pendingScore <= 9 ? '😊' : '🤩'
            ),
            React.createElement('span', { className: 'day-score-face-text' }, 
              pendingScore === 0 ? 'Не задано' :
              pendingScore <= 2 ? 'Плохой день' :
              pendingScore <= 4 ? 'Так себе' :
              pendingScore <= 6 ? 'Нормально' :
              pendingScore <= 8 ? 'Хороший день' : 'Отличный день!'
            )
          ),
          // Большое число
          React.createElement('div', { className: 'day-score-big-value' },
            React.createElement('span', { 
              className: 'day-score-number',
              style: { 
                color: pendingScore === 0 ? '#9ca3af' :
                       pendingScore <= 3 ? '#ef4444' :
                       pendingScore <= 5 ? '#eab308' :
                       pendingScore <= 7 ? '#22c55e' : '#10b981'
              }
            }, pendingScore === 0 ? '—' : pendingScore),
            React.createElement('span', { className: 'day-score-of-ten' }, '/ 10')
          ),
          // Preset кнопки
          React.createElement('div', { className: 'day-score-presets' },
            React.createElement('button', {
              className: 'day-score-preset day-score-preset-bad' + 
                (pendingScore >= 1 && pendingScore <= 3 ? ' active' : ''),
              onClick: () => { 
                if (navigator.vibrate) navigator.vibrate(10); 
                setPendingScore(2); 
              }
            }, '😢 Плохо'),
            React.createElement('button', {
              className: 'day-score-preset day-score-preset-ok' + 
                (pendingScore >= 4 && pendingScore <= 6 ? ' active' : ''),
              onClick: () => { 
                if (navigator.vibrate) navigator.vibrate(10); 
                setPendingScore(5); 
              }
            }, '😐 Норм'),
            React.createElement('button', {
              className: 'day-score-preset day-score-preset-good' + 
                (pendingScore >= 7 && pendingScore <= 10 ? ' active' : ''),
              onClick: () => { 
                if (navigator.vibrate) navigator.vibrate(10); 
                setPendingScore(8); 
              }
            }, '😊 Отлично')
          ),
          // Слайдер
          React.createElement('div', { className: 'day-score-slider-container' },
            React.createElement('input', {
              type: 'range',
              min: 0,
              max: 10,
              value: pendingScore,
              className: 'mood-slider mood-slider-positive day-score-slider',
              onChange: (e) => {
                if (navigator.vibrate) navigator.vibrate(10);
                setPendingScore(parseInt(e.target.value));
              }
            }),
            React.createElement('div', { className: 'day-score-slider-labels' },
              React.createElement('span', null, '😢'),
              React.createElement('span', null, '😐'),
              React.createElement('span', null, '😊')
            )
          ),
          // Блок комментария
          React.createElement('div', { 
            className: 'day-score-comment-wrapper' + 
              (scoreState === 'positive' ? ' positive' : 
               scoreState === 'negative' ? ' negative' : ' neutral')
          },
            React.createElement('div', { 
              className: 'day-score-comment-prompt' + 
                (scoreState === 'positive' ? ' positive' : 
                 scoreState === 'negative' ? ' negative' : ' neutral')
            },
              React.createElement('div', { className: 'comment-prompt-header' },
                React.createElement('span', { className: 'day-score-comment-icon' }, 
                  scoreState === 'positive' ? '✨' : 
                  scoreState === 'negative' ? '📝' : '💭'
                ),
                React.createElement('span', { className: 'day-score-comment-text' }, 
                  scoreState === 'positive' ? 'Что сделало день отличным?' : 
                  scoreState === 'negative' ? 'Что случилось?' : 'Заметка о дне'
                )
              ),
              // История комментариев
              existingComment && React.createElement('div', { className: 'comment-history' }, existingComment),
              // Поле для нового комментария
              React.createElement('input', {
                type: 'text',
                className: 'day-score-comment-input',
                placeholder: scoreState === 'positive' ? 'Хорошо выспался, прогулка...' : 
                             scoreState === 'negative' ? 'Болела голова, плохо спал...' : 'Обычный день...',
                value: pendingComment,
                onChange: (e) => setPendingComment(e.target.value),
                onClick: (e) => e.stopPropagation()
              })
            )
          ),
          // Подсказка про автоматическую оценку
          (moodAvg || wellbeingAvg || stressAvg) && React.createElement('div', { 
            className: 'day-score-auto-info' 
          },
            '✨ Автоматическая оценка: ',
            React.createElement('strong', null, autoScore || '—'),
            ' (на основе настроения, самочувствия и стресса)'
          )
        )
      ),
      document.body
    );
  }
  
  HEYS.DayModals = HEYS.DayModals || {};
  HEYS.DayModals.DayScorePicker = DayScorePicker;
  
})(typeof window !== 'undefined' ? window : global);
