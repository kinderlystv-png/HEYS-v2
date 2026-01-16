// heys_day_edit_grams_modal_v1.js — Edit grams modal renderer
// Extracted from heys_day_v12.js

;(function(global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  function renderEditGramsModal(params) {
    if (!React || !ReactDOM) return null;

    const {
      editGramsTarget,
      editGramsValue,
      editPortions,
      editLastPortionGrams,
      editGramsInputRef,
      setEditGramsValue,
      confirmEditGramsModal,
      cancelEditGramsModal,
      handleSheetTouchStart,
      handleSheetTouchMove,
      handleSheetTouchEnd,
      handleEditGramsDrag,
      haptic
    } = params || {};

    if (!editGramsTarget) return null;

    return ReactDOM.createPortal(
      React.createElement('div', { className: 'time-picker-backdrop grams-modal-backdrop', onClick: cancelEditGramsModal },
        React.createElement('div', { className: 'time-picker-modal grams-modal', onClick: e => e.stopPropagation() },
          // Ручка для свайпа
          React.createElement('div', { 
            className: 'bottom-sheet-handle',
            onTouchStart: handleSheetTouchStart,
            onTouchMove: handleSheetTouchMove,
            onTouchEnd: () => handleSheetTouchEnd(cancelEditGramsModal)
          }),
          // Header
          React.createElement('div', { className: 'time-picker-header' },
            React.createElement('button', { className: 'time-picker-cancel', onClick: cancelEditGramsModal }, 'Отмена'),
            React.createElement('span', { className: 'time-picker-title grams-modal-title' }, 
              editGramsTarget.product?.name || 'Граммы'
            ),
            React.createElement('button', { className: 'time-picker-confirm', onClick: confirmEditGramsModal }, 'Готово')
          ),
          // Главный input граммов (HERO)
          React.createElement('div', { className: 'grams-input-hero' },
            React.createElement('button', {
              className: 'grams-stepper-btn grams-stepper-btn--hero',
              onClick: () => {
                const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                setEditGramsValue(Math.max(step, editGramsValue - step));
                if (typeof haptic === 'function') haptic('light');
              }
            }, '−'),
            React.createElement('form', { 
              className: 'grams-input-hero__field',
              onSubmit: e => {
                e.preventDefault();
                confirmEditGramsModal();
              }
            },
              React.createElement('input', {
                ref: editGramsInputRef,
                type: 'text',
                inputMode: 'numeric',
                pattern: '[0-9]*',
                enterKeyHint: 'done',
                className: 'grams-input grams-input--hero',
                value: editGramsValue,
                onChange: e => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setEditGramsValue(Math.max(1, Math.min(2000, parseInt(val) || 0)));
                },
                onKeyDown: e => {
                  if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    e.target.blur();
                    confirmEditGramsModal();
                  }
                },
                onFocus: e => e.target.select(),
                onClick: e => e.target.select()
              }),
              React.createElement('span', { className: 'grams-input-suffix--hero' }, 'г')
            ),
            React.createElement('button', {
              className: 'grams-stepper-btn grams-stepper-btn--hero',
              onClick: () => {
                const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                setEditGramsValue(Math.min(2000, editGramsValue + step));
                if (typeof haptic === 'function') haptic('light');
              }
            }, '+')
          ),
          // Калории (вторичная информация)
          React.createElement('div', { className: 'grams-kcal-secondary' },
            React.createElement('span', { className: 'grams-kcal-secondary__value' }, 
              Math.round((editGramsTarget.product?.kcal100 || 0) * editGramsValue / 100) + ' ккал'
            )
          ),
          // 🍽️ Порции продукта (если есть)
          editPortions.length > 0 && React.createElement('div', { className: 'grams-portions' },
            editPortions.map((portion, idx) => {
              const isActive = editGramsValue === portion.grams;
              const isRecommended = editLastPortionGrams === portion.grams && !isActive;
              return React.createElement('button', {
                key: idx,
                className: 'grams-portion-btn' + (isActive ? ' active' : '') + (isRecommended ? ' recommended' : ''),
                onClick: () => {
                  setEditGramsValue(portion.grams);
                  if (typeof haptic === 'function') haptic('light');
                }
              }, 
                React.createElement('span', { className: 'portion-name' }, portion.name),
                React.createElement('span', { className: 'portion-grams' }, portion.grams + 'г')
              );
            })
          ),
          // Slider
          React.createElement('div', { className: 'grams-slider-container' },
            React.createElement('div', {
              className: 'grams-slider',
              onMouseDown: handleEditGramsDrag,
              onTouchStart: handleEditGramsDrag
            },
              React.createElement('div', { className: 'grams-slider-track' }),
              React.createElement('div', { 
                className: 'grams-slider-fill',
                style: { width: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
              }),
              React.createElement('div', { 
                className: 'grams-slider-thumb',
                style: { left: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
              }),
              // Метки
              [100, 200, 300, 400].map(mark => 
                React.createElement('div', {
                  key: mark,
                  className: 'grams-slider-mark',
                  style: { left: ((mark - 10) / (500 - 10) * 100) + '%' }
                })
              )
            ),
            React.createElement('div', { className: 'grams-slider-labels' },
              React.createElement('span', null, '10'),
              React.createElement('span', null, '500')
            )
          ),
          // Presets
          React.createElement('div', { className: 'grams-presets' },
            [50, 100, 150, 200, 250].map(preset =>
              React.createElement('button', {
                key: preset,
                className: 'grams-preset' + (editGramsValue === preset ? ' active' : ''),
                onClick: () => {
                  setEditGramsValue(preset);
                  try { navigator.vibrate?.(5); } catch(e) {}
                }
              }, preset + 'г')
            )
          )
        )
      ),
      document.body
    );
  }

  HEYS.dayEditGramsModal = {
    renderEditGramsModal
  };
})(window);
