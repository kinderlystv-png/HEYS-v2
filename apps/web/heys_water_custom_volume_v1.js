// heys_water_custom_volume_v1.js — лист «свой объём» воды (long-press 350 мс)
// Канвас: water-add.v4.dc.html — «свой объём», «память объёма»

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  const LONG_PRESS_MS = 350;
  const STEP_ML = 50;
  const PRESETS_ML = [330, 500, 750, 1000];
  const DEFAULT_ML = 500;
  const MIN_ML = 50;
  const MAX_ML = 3000;
  const SHEET_CLOSE_MS = 400;
  const MOVE_CANCEL_PX = 10;
  const STORAGE_KEY = 'heys_water_custom_volume_ml';

  function stopEvent(event) {
    if (!event) return;
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function readLs(key, fallback) {
    const lsGet = HEYS?.dayUtils?.lsGet || HEYS?.utils?.lsGet;
    if (typeof lsGet === 'function') return lsGet(key, fallback);
    try {
      const raw = global.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeLs(key, value) {
    const lsSet = HEYS?.dayUtils?.lsSet || HEYS?.utils?.lsSet;
    if (typeof lsSet === 'function') lsSet(key, value);
    else {
      try { global.localStorage?.setItem(key, JSON.stringify(value)); } catch (_error) { /* noop */ }
    }
  }

  function storageKey() {
    const cid = String(HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '').toLowerCase();
    return cid ? ('heys_' + cid + '_' + STORAGE_KEY) : STORAGE_KEY;
  }

  function snapMl(value) {
    const n = Math.round((Number(value) || 0) / STEP_ML) * STEP_ML;
    return Math.max(MIN_ML, Math.min(MAX_ML, n));
  }

  function readLastMl() {
    const saved = Number(readLs(storageKey(), DEFAULT_ML));
    return snapMl(saved > 0 ? saved : DEFAULT_ML);
  }

  function saveLastMl(ml) {
    writeLs(storageKey(), snapMl(ml));
  }

  function useLongPress350(onLongPress, options) {
    const { disabled = false, onShortClick } = options || {};
    const timerRef = React.useRef(null);
    const startRef = React.useRef(null);
    const triggeredRef = React.useRef(false);

    const cancel = React.useCallback(() => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startRef.current = null;
    }, []);

    React.useEffect(() => () => cancel(), [cancel]);

    const onPointerDown = React.useCallback((event) => {
      if (disabled) return;
      triggeredRef.current = false;
      startRef.current = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };
      cancel();
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        cancel();
        onLongPress?.(event);
        HEYS.feedback?.emit?.('longpress');
      }, LONG_PRESS_MS);
    }, [cancel, disabled, onLongPress]);

    const onPointerMove = React.useCallback((event) => {
      if (!timerRef.current || !startRef.current) return;
      const x = event.clientX || event.touches?.[0]?.clientX || 0;
      const y = event.clientY || event.touches?.[0]?.clientY || 0;
      const dx = Math.abs(x - startRef.current.x);
      const dy = Math.abs(y - startRef.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) cancel();
    }, [cancel]);

    const onPointerUp = React.useCallback((event) => {
      const wasLong = triggeredRef.current;
      cancel();
      if (!wasLong && !disabled) onShortClick?.(event);
      if (!wasLong) triggeredRef.current = false;
    }, [cancel, disabled, onShortClick]);

    const onClick = React.useCallback((event) => {
      if (triggeredRef.current) {
        triggeredRef.current = false;
        stopEvent(event);
      }
    }, []);

    return { onPointerDown, onPointerMove, onPointerUp, onClick };
  }

  function WaterCustomVolumeSheet({ open, closing, ml, onMlChange, onConfirm, onClose }) {
    if (!open && !closing) return null;
    const portalRoot = typeof document !== 'undefined' ? document.body : null;
    if (!portalRoot || !ReactDOM?.createPortal) return null;

    if (closing) {
      return ReactDOM.createPortal(React.createElement('div', {
        className: 'water-custom-sheet__blocker',
        'aria-hidden': 'true',
        onPointerDown: stopEvent,
        onPointerUp: stopEvent,
        onClick: stopEvent
      }), portalRoot);
    }

    const stepDown = (event) => {
      stopEvent(event);
      onMlChange(snapMl(ml - STEP_ML));
    };
    const stepUp = (event) => {
      stopEvent(event);
      onMlChange(snapMl(ml + STEP_ML));
    };
    const pickPreset = (preset) => (event) => {
      stopEvent(event);
      onMlChange(snapMl(preset));
    };
    const confirm = (event) => {
      stopEvent(event);
      onConfirm(ml);
    };

    const sheet = React.createElement(React.Fragment, null,
      React.createElement('button', {
        type: 'button',
        className: 'water-custom-sheet__scrim',
        'aria-label': 'Закрыть',
        ...(HEYS.ModalDismiss?.reactBackdropDismiss
          ? HEYS.ModalDismiss.reactBackdropDismiss(onClose)
          : {
            onPointerDown: stopEvent,
            onClick: (event) => {
              stopEvent(event);
              onClose();
            }
          })
      }),
      React.createElement('div', {
        className: 'water-custom-sheet widget-wd-sheet animate-always',
        role: 'dialog',
        'aria-label': 'Свой объём воды',
        onPointerDown: stopEvent,
        onClick: stopEvent
      },
        React.createElement('span', { className: 'widget-wd-sheet__grab' }),
        React.createElement('div', { className: 'water-custom-sheet__head' },
          React.createElement('span', { className: 'water-custom-sheet__title' }, 'Свой объём'),
          React.createElement('span', { className: 'water-custom-sheet__meta' }, 'шаг 50 мл')
        ),
        React.createElement('div', { className: 'water-custom-sheet__stepper' },
          React.createElement('button', {
            type: 'button',
            className: 'water-custom-sheet__step water-custom-sheet__step--sub',
            onClick: stepDown,
            disabled: ml <= MIN_ML,
            'aria-label': 'Уменьшить на 50 мл'
          }, '−'),
          React.createElement('span', { className: 'water-custom-sheet__value' },
            String(ml),
            React.createElement('span', { className: 'water-custom-sheet__unit' }, 'мл')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'water-custom-sheet__step water-custom-sheet__step--add',
            onClick: stepUp,
            disabled: ml >= MAX_ML,
            'aria-label': 'Увеличить на 50 мл'
          }, '+')
        ),
        React.createElement('div', { className: 'water-custom-sheet__presets', role: 'group', 'aria-label': 'Готовые объёмы' },
          PRESETS_ML.map((preset) => React.createElement('button', {
            key: preset,
            type: 'button',
            className: 'water-custom-sheet__preset'
              + (preset === ml ? ' is-active' : ' is-outline'),
            onClick: pickPreset(preset)
          }, String(preset)))
        ),
        React.createElement('button', {
          type: 'button',
          className: 'water-custom-sheet__confirm',
          onClick: confirm
        }, 'Добавить ' + ml + ' мл')
      )
    );

    return ReactDOM.createPortal(sheet, portalRoot);
  }

  function WaterCustomVolumeHost() {
    const [open, setOpen] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const [ml, setMl] = React.useState(readLastMl);
    const onAddRef = React.useRef(null);
    const closeTimerRef = React.useRef(null);

    const dismiss = React.useCallback(() => {
      setOpen(false);
      setClosing(true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        setClosing(false);
        closeTimerRef.current = null;
      }, SHEET_CLOSE_MS);
    }, []);

    React.useEffect(() => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    }, []);

    React.useEffect(() => {
      const onOpen = (event) => {
        const onAdd = event?.detail?.onAdd;
        if (typeof onAdd !== 'function') return;
        onAddRef.current = onAdd;
        setMl(readLastMl());
        setClosing(false);
        setOpen(true);
      };
      global.addEventListener('heys:water-custom-volume-open', onOpen);
      return () => global.removeEventListener('heys:water-custom-volume-open', onOpen);
    }, []);

    const confirm = React.useCallback((nextMl) => {
      const volume = snapMl(nextMl);
      saveLastMl(volume);
      dismiss();
      onAddRef.current?.(volume);
      onAddRef.current = null;
    }, [dismiss]);

    return React.createElement(WaterCustomVolumeSheet, {
      open,
      closing,
      ml,
      onMlChange: setMl,
      onConfirm: confirm,
      onClose: dismiss
    });
  }

  function openWaterCustomVolume(options) {
    global.dispatchEvent(new CustomEvent('heys:water-custom-volume-open', {
      detail: options || {}
    }));
  }

  HEYS.WaterCustomVolume = {
    LONG_PRESS_MS,
    STEP_ML,
    PRESETS_ML,
    readLastMl,
    saveLastMl,
    snapMl,
    useLongPress350,
    WaterCustomVolumeSheet,
    WaterCustomVolumeHost,
    open: openWaterCustomVolume
  };
})(window);
