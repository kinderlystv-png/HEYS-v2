// heys_client_access_code_setup_v1.js — первый вход: код доступа + соглашение ПЭП
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  const PEP_DOC_URL = '/docs/v1.1/pep-agreement.md';

  function usesTouchKeypad() {
    try {
      return !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    } catch (_) {
      return false;
    }
  }

  function createAccessCodeSetupComponent(React) {
    const { useMemo, useState, useRef, useEffect } = React;

    return function ClientAccessCodeSetup(props) {
      const {
        phone,
        clientId,
        sessionToken,
        skipPepAgreement = false,
        onComplete,
        onCancel,
      } = props || {};

      const auth = HEYS.auth;
      const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
      const [confirmDigits, setConfirmDigits] = useState(['', '', '', '']);
      const [codeOverlay, setCodeOverlay] = useState([
        { d: '', k: 0 },
        { d: '', k: 0 },
        { d: '', k: 0 },
        { d: '', k: 0 },
      ]);
      const [confirmOverlay, setConfirmOverlay] = useState([
        { d: '', k: 0 },
        { d: '', k: 0 },
        { d: '', k: 0 },
        { d: '', k: 0 },
      ]);
      const [phase, setPhase] = useState('code');
      const [pepAccepted, setPepAccepted] = useState(false);
      const [err, setErr] = useState('');
      const [busy, setBusy] = useState(false);

      const pinRefs = useRef([]);
      const keypadRef = useRef(null);
      const pinHideTimers = useRef([null, null, null, null]);

      const touchKeypad = usesTouchKeypad();
      const digits = phase === 'code' ? codeDigits : confirmDigits;
      const setDigits = phase === 'code' ? setCodeDigits : setConfirmDigits;
      const pinOverlay = phase === 'code' ? codeOverlay : confirmOverlay;
      const setPinOverlay = phase === 'code' ? setCodeOverlay : setConfirmOverlay;
      const pinLabel = phase === 'code' ? 'Придумайте код доступа' : 'Повторите код';

      const code = useMemo(() => codeDigits.join(''), [codeDigits]);
      const confirm = useMemo(() => confirmDigits.join(''), [confirmDigits]);
      const codeValid = auth && auth.validatePinStrict(code);
      const confirmValid = auth && auth.validatePinStrict(confirm) && code === confirm;
      const canContinue = phase === 'code'
        ? codeValid
        : confirmValid && (skipPepAgreement || pepAccepted);

      function resetOverlayState(setOverlayFn) {
        setOverlayFn([
          { d: '', k: 0 },
          { d: '', k: 0 },
          { d: '', k: 0 },
          { d: '', k: 0 },
        ]);
      }

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

        setPinOverlay((prev) => {
          const next = (prev || []).slice(0, 4);
          while (next.length < 4) next.push({ d: '', k: 0 });
          next[i] = { d: String(digit || ''), k: Date.now() + Math.random() };
          return next;
        });

        try {
          pinHideTimers.current[i] = setTimeout(() => {
            setPinOverlay((prev) => {
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
        setPinOverlay((prev) => {
          const next = (prev || []).slice(0, 4);
          while (next.length < 4) next.push({ d: '', k: 0 });
          next[i] = { d: '', k: 0 };
          return next;
        });
      }

      function applyPinDigits(nextDigits, changedIndex, changedDigit) {
        const arr = (nextDigits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        setErr('');
        setDigits(arr);
        if (typeof changedIndex === 'number') {
          if (changedDigit) showPinOverlayDigit(changedIndex, changedDigit, 1200);
          else clearHidePinDigit(changedIndex);
        }
        return arr;
      }

      function appendPinDigit(digit) {
        if (busy || !/^\d$/.test(String(digit)) || (digits || []).every(Boolean)) return;
        const idx = getNextPinIndex(digits);
        const arr = (digits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        arr[idx] = String(digit);
        applyPinDigits(arr, idx, String(digit));
        if (idx < 3) focusPinInput(idx + 1);
      }

      function erasePinDigit() {
        if (busy) return;
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
      }

      function handleKeypadDigit(digit) {
        appendPinDigit(digit);
      }

      function handleKeypadBackspace() {
        erasePinDigit();
      }

      useEffect(() => {
        clearAllHideTimers();
        pinRefs.current = [];
        setTimeout(() => focusPinInput(getNextPinIndex(phase === 'code' ? codeDigits : confirmDigits)), 50);
      }, [phase]);

      useEffect(() => () => clearAllHideTimers(), []);

      const isPinComplete = (digits || []).every(Boolean);
      const activePinIndex = !isPinComplete ? getNextPinIndex(digits) : -1;
      const canEraseKeypadDigit = !busy && (digits || []).some(Boolean);

      async function handleSubmit() {
        if (!canContinue || busy || !auth) return;
        setErr('');
        setBusy(true);
        try {
          if (phase === 'code') {
            setPhase('confirm');
            return;
          }
          const res = await auth.setClientAccessCode({
            accessCode: code,
            sessionToken,
            clientId,
            phone,
          });
          if (!res || res.ok === false) {
            const codeErr = res && res.error;
            if (codeErr === 'weak_access_code' || codeErr === 'access_code_matches_onetime_pin') {
              setErr('Код слишком простой или совпадает с одноразовым. Придумайте другой.');
              setPhase('code');
              setCodeDigits(['', '', '', '']);
              setConfirmDigits(['', '', '', '']);
              resetOverlayState(setCodeOverlay);
              resetOverlayState(setConfirmOverlay);
            } else if (codeErr === 'session_not_issued') {
              setErr('Сессия истекла. Войдите с одноразовым кодом куратора ещё раз.');
            } else {
              setErr((res && res.serverMessage) || 'Не удалось сохранить код. Попробуйте ещё раз.');
            }
            return;
          }
          if (typeof onComplete === 'function') {
            await onComplete(res);
          }
        } finally {
          setBusy(false);
        }
      }

      function openPepDoc(e) {
        if (e && e.preventDefault) e.preventDefault();
        try {
          global.open(PEP_DOC_URL, '_blank', 'noopener,noreferrer');
        } catch (_) {
          global.location.href = PEP_DOC_URL;
        }
      }

      return React.createElement(
        'div',
        { className: 'heys-auth-card mx-auto w-full max-w-md p-6' },
        React.createElement('div', { className: 'heys-auth-brand text-center mb-2' }, 'Подпись документов в приложении'),
        React.createElement(
          'p',
          { className: 'heys-auth-subtitle text-sm mb-4' },
          'Ваш код доступа заменяет собственноручную подпись. Когда вы подписываете им согласие или другой документ, приложение сохраняет запись: какой документ, какая версия, когда и с какого устройства.',
        ),
        React.createElement(
          'p',
          { className: 'heys-auth-subtitle text-sm mb-4' },
          'Никому не сообщайте свой код, в том числе куратору. Если код узнал кто-то ещё — напишите куратору, код заблокируют.',
        ),
        React.createElement(
          'div',
          { className: 'heys-auth-pin-section space-y-3 is-active' },
          React.createElement('div', { className: 'heys-auth-label text-base' }, pinLabel),
          React.createElement(
            'div',
            { className: 'heys-auth-pin-grid' },
            [0, 1, 2, 3].map((i) => {
              const digit = (digits && digits[i]) || '';
              const isFilled = Boolean(digit);
              const overlay = (pinOverlay && pinOverlay[i]) || { d: '', k: 0 };
              const pinInputStyle = overlay.d
                ? { WebkitTextSecurity: 'none', color: 'transparent', caretColor: 'transparent' }
                : { WebkitTextSecurity: 'disc' };
              return React.createElement(
                'div',
                {
                  key: 'ac_pin_wrap_' + phase + '_' + i,
                  className: 'heys-auth-pin-box',
                },
                React.createElement('input', {
                  key: 'ac_pin_' + phase + '_' + i,
                  ref: (el) => { pinRefs.current[i] = el; },
                  id: 'heys-access-code-' + phase + '-' + (i + 1),
                  name: 'access-code-' + phase + '-' + (i + 1),
                  type: 'text',
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  autoComplete: i === 0 ? 'one-time-code' : 'off',
                  readOnly: touchKeypad,
                  maxLength: 1,
                  value: digit,
                  style: pinInputStyle,
                  onChange: (e) => {
                    if (busy) return;
                    const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 1);
                    let arr = (digits || []).slice(0, 4);
                    while (arr.length < 4) arr.push('');
                    arr[i] = v;
                    arr = applyPinDigits(arr, i, v);
                    if (v && i < 3) focusPinInput(i + 1);
                  },
                  onKeyDown: (e) => {
                    if (busy) return;
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
                    if (e.key === 'Enter' && canContinue) {
                      handleSubmit();
                    }
                  },
                  onFocus: () => focusPinInput(getNextPinIndex(digits)),
                  onClick: () => focusPinInput(getNextPinIndex(digits)),
                  onPaste: (e) => {
                    try {
                      const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
                      const pasted = String(txt).replace(/\D/g, '').slice(0, 4);
                      if (pasted) {
                        e.preventDefault();
                        setErr('');
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
                  },
                  className: 'heys-auth-pin-input '
                    + (isPinComplete ? 'is-complete ' : isFilled ? 'is-filled ' : '')
                    + (i === activePinIndex ? 'is-active ' : ''),
                }),
                overlay && overlay.d
                  ? React.createElement(
                    'span',
                    {
                      key: 'ac_pin_overlay_' + phase + '_' + i + '_' + overlay.k,
                      className: 'pin-digit-overlay absolute inset-0 flex items-center justify-center heys-auth-pin-overlay pointer-events-none',
                      onAnimationEnd: () => {
                        setPinOverlay((prev) => {
                          const next = (prev || []).slice(0, 4);
                          while (next.length < 4) next.push({ d: '', k: 0 });
                          if (next[i] && next[i].k === overlay.k) next[i] = { d: '', k: 0 };
                          return next;
                        });
                      },
                    },
                    overlay.d,
                  )
                  : null,
              );
            }),
          ),
        ),
        React.createElement(
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
                key: 'ac_pin_key_' + n,
                type: 'button',
                className: 'heys-auth-key',
                disabled: busy,
                onClick: () => handleKeypadDigit(String(n)),
              },
              String(n),
            )),
          React.createElement('span', { key: 'ac_pin_key_spacer', className: 'heys-auth-key-spacer', 'aria-hidden': 'true' }),
          React.createElement(
            'button',
            {
              key: 'ac_pin_key_0',
              type: 'button',
              className: 'heys-auth-key',
              disabled: busy,
              onClick: () => handleKeypadDigit('0'),
            },
            '0',
          ),
          React.createElement(
            'button',
            {
              key: 'ac_pin_key_backspace',
              type: 'button',
              className: 'heys-auth-key heys-auth-key--muted heys-auth-key--delete' + (canEraseKeypadDigit ? ' is-available' : ''),
              disabled: !canEraseKeypadDigit,
              'aria-label': 'Удалить цифру',
              onClick: handleKeypadBackspace,
            },
            '⌫',
          ),
        ),
        !skipPepAgreement && phase === 'confirm' && React.createElement(
          'label',
          { className: 'mt-4 flex items-start gap-2 text-sm heys-auth-subtitle' },
          React.createElement('input', {
            type: 'checkbox',
            checked: pepAccepted,
            onChange: (e) => setPepAccepted(e.target.checked === true),
          }),
          React.createElement(
            'span',
            null,
            'Я принимаю ',
            React.createElement(
              'button',
              { type: 'button', className: 'heys-auth-link-btn', onClick: openPepDoc },
              'Соглашение об использовании простой электронной подписи',
            ),
          ),
        ),
        err && React.createElement('div', { className: 'heys-auth-error mt-3', role: 'alert' }, err),
        React.createElement(
          'div',
          { className: 'mt-5 space-y-2' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'heys-auth-primary w-full',
              disabled: !canContinue || busy,
              onClick: handleSubmit,
            },
            busy ? 'Сохраняем…' : (phase === 'code' ? 'Далее' : 'Продолжить'),
          ),
          phase === 'confirm' && typeof onCancel === 'function' && React.createElement(
            'button',
            {
              type: 'button',
              className: 'heys-auth-link-btn w-full text-center',
              disabled: busy,
              onClick: () => {
                setPhase('code');
                setConfirmDigits(['', '', '', '']);
                resetOverlayState(setConfirmOverlay);
                setErr('');
              },
            },
            '← Изменить код',
          ),
        ),
        !skipPepAgreement && phase === 'confirm' && React.createElement(
          'p',
          { className: 'heys-auth-meta mt-3 text-xs text-center' },
          'Нажимая «Продолжить», вы заключаете соглашение и создаёте код доступа',
        ),
      );
    };
  }

  HEYS.ClientAccessCodeSetup = {
    createReactComponent: createAccessCodeSetupComponent,
    PEP_DOC_URL,
  };
})(typeof window !== 'undefined' ? window : globalThis);
