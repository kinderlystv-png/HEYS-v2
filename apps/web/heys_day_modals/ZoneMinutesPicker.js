// heys_day_modals/ZoneMinutesPicker.js — Zone Minutes Picker Modal
// Extracted from heys_day_v12.js for Phase 2 refactoring

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  // Import utilities
  const U = HEYS.dayUtils || {};
  const r0 = U.r0 || ((v) => Math.round(+v||0));
  
  /**
   * Zone Minutes Picker Modal
   * Позволяет выбрать количество минут в зоне пульса (0-120)
   */
  function ZoneMinutesPicker({
    isOpen,
    zoneIndex,
    value,
    kcalPerMin,
    onConfirm,
    onCancel,
    WheelColumn,
    handleSheetTouchStart,
    handleSheetTouchMove,
    handleSheetTouchEnd
  }) {
    if (!isOpen) return null;
    
    const [pendingValue, setPendingValue] = React.useState(value);
    
    React.useEffect(() => {
      if (isOpen) {
        setPendingValue(value);
      }
    }, [isOpen, value]);
    
    const zoneMinutesValues = React.useMemo(() => 
      Array.from({length: 121}, (_, i) => String(i)), 
    []);
    
    const handleConfirm = () => {
      onConfirm(pendingValue);
    };
    
    const kcalForZone = kcalPerMin && kcalPerMin[zoneIndex] !== undefined 
      ? kcalPerMin[zoneIndex] 
      : 0;
    
    const totalKcal = r0(parseInt(zoneMinutesValues[pendingValue] || '0', 10) * kcalForZone);
    
    return ReactDOM.createPortal(
      React.createElement('div', { 
        className: 'time-picker-backdrop', 
        onClick: onCancel 
      },
        React.createElement('div', { 
          className: 'time-picker-modal zone-picker-modal', 
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
            React.createElement('span', { className: 'time-picker-title' }, 
              'Зона ' + (zoneIndex !== undefined ? zoneIndex + 1 : '')
            ),
            React.createElement('button', { 
              className: 'time-picker-confirm', 
              onClick: handleConfirm 
            }, 'Готово')
          ),
          React.createElement('div', { className: 'zone-picker-kcal-hint' },
            '🔥 ',
            totalKcal,
            ' ккал'
          ),
          React.createElement('div', { className: 'time-picker-wheels zone-wheels' },
            WheelColumn && React.createElement(WheelColumn, {
              values: zoneMinutesValues.map(v => v + ' мин'),
              selected: pendingValue,
              onChange: (i) => setPendingValue(i)
            })
          )
        )
      ),
      document.body
    );
  }
  
  HEYS.DayModals = HEYS.DayModals || {};
  HEYS.DayModals.ZoneMinutesPicker = ZoneMinutesPicker;
  
})(typeof window !== 'undefined' ? window : global);
