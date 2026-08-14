// heys_auth_pin_keypad_v1.js — shared login-style PIN grid + touch keypad
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function usesTouchKeypad() {
    try {
      return !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    } catch (_) {
      return false;
    }
  }

  function emptyOverlay() {
    return [
      { d: '', k: 0 },
      { d: '', k: 0 },
      { d: '', k: 0 },
      { d: '', k: 0 },
    ];
  }

  function createPinKeypadKit(React) {
    const { useState, useRef, useEffect, useMemo, useCallback } = React;

    function usePinKeypad(options) {
      const {
        disabled = false,
        idPrefix = 'pin',
        onEnter,
        autoFocus = true,
      } = options || {};

      const [digits, setDigits] = useState(['', '', '', '']);
      const [overlay, setOverlay] = useState(emptyOverlay);
      const pinRefs = useRef([]);
      const pinHideTimers = useRef([null, null, null, null]);
      const touchKeypad = usesTouchKeypad();

      const pinValue = useMemo(() => (digits || []).join(''), [digits]);
      const isComplete = useMemo(() => (digits || []).every(Boolean), [digits]);
      const activePinIndex = !isComplete ? getNextPinIndex(digits) : -1;
      const canEraseKeypadDigit = !disabled && (digits || []).some(Boolean);

      function clearAllHideTimers() {
        try {
          (pinHideTimers.current || []).forEach((t) => { if (t) clearTimeout(t); });
          pinHideTimers.current = [null, null, null, null];
        } catch (_) { }
      }

      function focusPinInput(idx) {
        const input = pinRefs.current && pinRefs.current[idx];
        if (!input) return;
        if (touchKeypad) {
          try {
            if (global.document && global.document.activeElement) global.document.activeElement.blur();
          } catch (_) { }
          return;
        }
        try { input.focus(); } catch (_) { }
      }

      function getNextPinIndex(arr) {
        const list = (arr || digits || []).slice(0, 4);
        for (let i = 0; i < 4; i++) {
          if (!list[i]) return i;
        }
        return 3;
      }

      function showPinOverlayDigit(i, digit, totalMs = 700) {
        try {
          const t = pinHideTimers.current && pinHideTimers.current[i];
          if (t) clearTimeout(t);
        } catch (_) { }

        setOverlay((prev) => {
          const next = (prev || []).slice(0, 4);
          while (next.length < 4) next.push({ d: '', k: 0 });
          next[i] = { d: String(digit || ''), k: Date.now() + Math.random() };
          return next;
        });

        try {
          pinHideTimers.current[i] = setTimeout(() => {
            setOverlay((prev) => {
              const next = (prev || []).slice(0, 4);
              while (next.length < 4) next.push({ d: '', k: 0 });
              if (next[i] && next[i].d && next[i].k) next[i] = { d: '', k: 0 };
              return next;
            });
          }, Math.max(300, totalMs + 150));
        } catch (_) { }
      }

      function clearHidePinDigit(i) {
        try {
          const t = pinHideTimers.current && pinHideTimers.current[i];
          if (t) clearTimeout(t);
          if (pinHideTimers.current) pinHideTimers.current[i] = null;
        } catch (_) { }
        setOverlay((prev) => {
          const next = (prev || []).slice(0, 4);
          while (next.length < 4) next.push({ d: '', k: 0 });
          next[i] = { d: '', k: 0 };
          return next;
        });
      }

      const applyPinDigits = useCallback((nextDigits, changedIndex, changedDigit) => {
        const arr = (nextDigits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        setDigits(arr);
        if (typeof changedIndex === 'number') {
          if (changedDigit) showPinOverlayDigit(changedIndex, changedDigit, 1200);
          else clearHidePinDigit(changedIndex);
        }
        return arr;
      }, []);

      const resetDigits = useCallback(() => {
        clearAllHideTimers();
        setDigits(['', '', '', '']);
        setOverlay(emptyOverlay());
        if (autoFocus) {
          setTimeout(() => focusPinInput(0), 50);
        }
      }, [autoFocus, touchKeypad]);

      const appendPinDigit = useCallback((digit) => {
        if (disabled || !/^\d$/.test(String(digit)) || (digits || []).every(Boolean)) return;
        const idx = getNextPinIndex(digits);
        const arr = (digits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        arr[idx] = String(digit);
        applyPinDigits(arr, idx, String(digit));
        if (idx < 3) focusPinInput(idx + 1);
      }, [applyPinDigits, digits, disabled, touchKeypad]);

      const erasePinDigit = useCallback(() => {
        if (disabled) return;
        const arr = (digits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        for (let i = 3; i >= 0; i--) {
          if (arr[i]) {
            arr[i] = '';
            applyPinDigits(arr, i, '');
            focusPinInput(i);
            return;
          }
        }
      }, [applyPinDigits, digits, disabled, touchKeypad]);

      useEffect(() => () => clearAllHideTimers(), []);

      useEffect(() => {
        if (!autoFocus || disabled) return undefined;
        const t = setTimeout(() => focusPinInput(getNextPinIndex(digits)), 50);
        return () => clearTimeout(t);
      }, [autoFocus, disabled]);

      function handleInputChange(i, rawValue) {
        if (disabled) return;
        const v = String(rawValue || '').replace(/\D/g, '').slice(0, 1);
        const existing = (digits && digits[i]) || '';
        // Overlay / -webkit-text-security can emit an empty input event
        // after the fade and wipe the digit the keypad just wrote.
        if (!v && existing) return;
        let arr = (digits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        arr[i] = v;
        arr = applyPinDigits(arr, i, v);
        if (v && i < 3) focusPinInput(i + 1);
      }

      function handleInputKeyDown(i, e) {
        if (disabled) return;
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          appendPinDigit(e.key);
          return;
        }
        if (e.key === 'Backspace') {
          const cur = (digits && digits[i]) || '';
          if (!cur && i > 0) {
            e.preventDefault();
            const arr = (digits || []).slice(0, 4);
            while (arr.length < 4) arr.push('');
            arr[i - 1] = '';
            applyPinDigits(arr, i - 1, '');
            focusPinInput(i - 1);
            return;
          }
          if (cur) {
            e.preventDefault();
            const arr = (digits || []).slice(0, 4);
            while (arr.length < 4) arr.push('');
            arr[i] = '';
            applyPinDigits(arr, i, '');
            return;
          }
        }
        if (e.key === 'ArrowLeft' && i > 0) {
          e.preventDefault();
          focusPinInput(i - 1);
        }
        if (e.key === 'ArrowRight' && i < 3) {
          e.preventDefault();
          focusPinInput(i + 1);
        }
        if (e.key === 'Enter' && typeof onEnter === 'function' && isComplete) {
          onEnter(pinValue);
        }
      }

      function handlePaste(e) {
        try {
          const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
          const pasted = String(txt).replace(/\D/g, '').slice(0, 4);
          if (pasted) {
            e.preventDefault();
            const arr = ['', '', '', ''];
            for (let k = 0; k < 4; k++) {
              arr[k] = pasted[k] || '';
              if (arr[k]) showPinOverlayDigit(k, arr[k], 1400);
              else clearHidePinDigit(k);
            }
            setDigits(arr);
            focusPinInput(Math.min(3, pasted.length));
          }
        } catch (_) { }
      }

      return {
        digits,
        setDigits,
        setOverlay,
        pinValue,
        overlay,
        pinRefs,
        touchKeypad,
        isComplete,
        activePinIndex,
        canEraseKeypadDigit,
        idPrefix,
        disabled,
        resetDigits,
        appendPinDigit,
        erasePinDigit,
        applyPinDigits,
        focusPinInput,
        handleInputChange,
        handleInputKeyDown,
        handlePaste,
        getNextPinIndex,
      };
    }

    function renderPinGrid(pin, extraClassName) {
      const {
        digits,
        overlay,
        pinRefs,
        touchKeypad,
        disabled = false,
        isComplete,
        activePinIndex,
        idPrefix,
        handleInputChange,
        handleInputKeyDown,
        handlePaste,
        focusPinInput,
        getNextPinIndex,
        setOverlay,
        inputClassName = '',
        hasError = false,
      } = pin;

      return React.createElement(
        'div',
        { className: 'heys-auth-pin-grid' + (extraClassName ? ' ' + extraClassName : '') },
        [0, 1, 2, 3].map((i) => {
          const digit = (digits && digits[i]) || '';
          const isFilled = Boolean(digit);
          const ov = (overlay && overlay[i]) || { d: '', k: 0 };
          const pinInputStyle = {
            WebkitTextSecurity: 'none',
            color: 'transparent',
            caretColor: 'transparent',
          };
          return React.createElement(
            'div',
            {
              key: idPrefix + '_pin_wrap_' + i,
              className: 'heys-auth-pin-box',
            },
            React.createElement('input', {
              key: idPrefix + '_pin_' + i,
              ref: (el) => { pinRefs.current[i] = el; },
              id: idPrefix + '-' + (i + 1),
              name: idPrefix + '-' + (i + 1),
              type: 'text',
              inputMode: 'numeric',
              pattern: '[0-9]*',
              autoComplete: i === 0 ? 'one-time-code' : 'off',
              readOnly: touchKeypad,
              maxLength: 1,
              value: digit,
              style: pinInputStyle,
              disabled,
              onChange: (e) => handleInputChange(i, e.target.value),
              onKeyDown: (e) => handleInputKeyDown(i, e),
              onFocus: () => focusPinInput(getNextPinIndex(digits)),
              onClick: () => focusPinInput(getNextPinIndex(digits)),
              onPaste: handlePaste,
              className: 'heys-auth-pin-input '
                + (hasError ? 'is-error ' : '')
                + (isComplete && !hasError ? 'is-complete ' : isFilled ? 'is-filled ' : '')
                + (i === activePinIndex ? 'is-active ' : '')
                + inputClassName,
            }),
            ov && ov.d
              ? React.createElement(
                'span',
                {
                  key: idPrefix + '_pin_overlay_' + i + '_' + ov.k,
                  className: 'pin-digit-overlay absolute inset-0 flex items-center justify-center heys-auth-pin-overlay pointer-events-none',
                  onAnimationEnd: () => {
                    setOverlay((prev) => {
                      const next = (prev || []).slice(0, 4);
                      while (next.length < 4) next.push({ d: '', k: 0 });
                      if (next[i] && next[i].k === ov.k) next[i] = { d: '', k: 0 };
                      return next;
                    });
                  },
                },
                ov.d,
              )
              : (isFilled
                ? React.createElement(
                  'span',
                  {
                    className: 'heys-auth-pin-dot absolute inset-0 flex items-center justify-center heys-auth-pin-overlay pointer-events-none',
                    'aria-hidden': 'true',
                  },
                  '•',
                )
                : null),
          );
        }),
      );
    }

    function renderKeypad(pin, keypadRef) {
      const {
        disabled = false,
        appendPinDigit,
        erasePinDigit,
        canEraseKeypadDigit,
        idPrefix,
      } = pin;

      return React.createElement(
        'div',
        {
          className: 'heys-auth-keypad',
          ref: keypadRef,
          'aria-label': 'Цифровая клавиатура PIN',
        },
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
          React.createElement(
            'button',
            {
              key: idPrefix + '_key_' + n,
              type: 'button',
              className: 'heys-auth-key',
              disabled,
              onClick: () => appendPinDigit(String(n)),
            },
            String(n),
          )),
        React.createElement('span', { key: idPrefix + '_key_spacer', className: 'heys-auth-key-spacer', 'aria-hidden': 'true' }),
        React.createElement(
          'button',
          {
            key: idPrefix + '_key_0',
            type: 'button',
            className: 'heys-auth-key',
            disabled,
            onClick: () => appendPinDigit('0'),
          },
          '0',
        ),
        React.createElement(
          'button',
          {
            key: idPrefix + '_key_backspace',
            type: 'button',
            className: 'heys-auth-key heys-auth-key--muted heys-auth-key--delete' + (canEraseKeypadDigit ? ' is-available' : ''),
            disabled: !canEraseKeypadDigit,
            'aria-label': 'Удалить цифру',
            onClick: erasePinDigit,
          },
          '⌫',
        ),
      );
    }

    function renderPinKeypadSection(config) {
      const {
        pin,
        label,
        labelClassName = 'heys-auth-label text-base',
        sectionClassName = 'heys-auth-pin-section space-y-3 is-active',
        gridClassName = '',
        keypadRef,
        children,
      } = config || {};

      return React.createElement(
        'div',
        { className: sectionClassName },
        label ? React.createElement('div', { className: labelClassName }, label) : null,
        renderPinGrid(pin, gridClassName),
        renderKeypad(pin, keypadRef),
        children || null,
      );
    }

    return {
      usesTouchKeypad,
      usePinKeypad,
      renderPinGrid,
      renderKeypad,
      renderPinKeypadSection,
    };
  }

  HEYS.AuthPinKeypad = {
    usesTouchKeypad,
    emptyOverlay,
    createKit: createPinKeypadKit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
