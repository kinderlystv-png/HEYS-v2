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
      const [entryIssue, setEntryIssue] = useState('');
      const [pepAccepted, setPepAccepted] = useState(false);
      const [err, setErr] = useState('');
      const [busy, setBusy] = useState(false);

      const pinRefs = useRef([]);
      const keypadRef = useRef(null);
      const pinHideTimers = useRef([null, null, null, null]);
      const codeDigitsRef = useRef(codeDigits);
      const confirmDigitsRef = useRef(confirmDigits);
      codeDigitsRef.current = codeDigits;
      confirmDigitsRef.current = confirmDigits;

      const touchKeypad = usesTouchKeypad();
      const digits = phase === 'code' ? codeDigits : confirmDigits;
      const pinOverlay = phase === 'code' ? codeOverlay : confirmOverlay;
      const setPinOverlay = phase === 'code' ? setCodeOverlay : setConfirmOverlay;
      const pinLabel = phase === 'code' ? 'Новый код' : 'Повторите код';

      // Строки «создание кода» и «после сброса»: экран объясняет, зачем нужен
      // код, а после сброса — что прежний код и другие входы уже не работают.
      // Раньше на первом шаге стоял только заголовок с подписью поля.
      const screenTitle = entryIssue === 'mismatch'
        ? 'Коды не совпали'
        : entryIssue === 'weak'
          ? 'Код слишком простой'
          : phase === 'confirm'
        ? 'Повторите код'
        : (skipPepAgreement ? 'Придумайте новый код' : 'Придумайте свой код');
      const screenSubtitle = entryIssue === 'mismatch'
        ? 'Введите новый код заново — с первого шага.'
        : entryIssue === 'weak'
          ? 'Такой код подберут за минуту. Придумайте другой.'
          : phase === 'confirm'
        ? 'Ещё раз, чтобы не ошибиться. Восстановить его нельзя — только выпустить новый через куратора.'
        : (skipPepAgreement
          ? 'Куратор выдал код для входа, вы им вошли. Соглашение подписано ранее — заново принимать не нужно.'
          : 'Дальше вы входите своим кодом — код куратора для входа больше не нужен.');

      const code = useMemo(() => codeDigits.join(''), [codeDigits]);
      const confirm = useMemo(() => confirmDigits.join(''), [confirmDigits]);
      // Строка «отказы кода»: «Продолжить» доступна, как только повтор набран.
      // Пока кнопка гасла до совпадения кодов, отказ «Коды не совпали» был
      // недостижим — человек молча тыкал в мёртвую кнопку.
      const canContinue = phase === 'code'
        ? code.length === 4 && (skipPepAgreement || pepAccepted)
        : confirm.length === 4;

      function getActiveDigits() {
        return phase === 'code' ? codeDigitsRef.current : confirmDigitsRef.current;
      }

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
        setEntryIssue('');
        if (phase === 'code') {
          codeDigitsRef.current = arr;
          setCodeDigits(arr);
        } else {
          confirmDigitsRef.current = arr;
          setConfirmDigits(arr);
        }
        if (typeof changedIndex === 'number') {
          if (changedDigit) showPinOverlayDigit(changedIndex, changedDigit, 1200);
          else clearHidePinDigit(changedIndex);
        }
        return arr;
      }

      function appendPinDigit(digit) {
        const current = getActiveDigits();
        if (busy || !/^\d$/.test(String(digit)) || (current || []).every(Boolean)) return;
        const idx = getNextPinIndex(current);
        const arr = (current || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        arr[idx] = String(digit);
        applyPinDigits(arr, idx, String(digit));
        if (idx < 3) focusPinInput(idx + 1);
      }

      function erasePinDigit() {
        if (busy) return;
        const arr = (getActiveDigits() || []).slice(0, 4);
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

      function handleCardKeyDown(e) {
        if (busy) return;
        if (e.target && e.target.classList && e.target.classList.contains('heys-auth-pin-input')) return;
        if (e.target && e.target.type === 'checkbox') return;
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          appendPinDigit(e.key);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          erasePinDigit();
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
        if (busy || !auth) return;
        const codeNow = (codeDigitsRef.current || []).join('');
        const confirmNow = (confirmDigitsRef.current || []).join('');
        if (phase === 'code') {
          if (!auth.validatePinStrict(codeNow)) {
            // Строка «отказы кода»: «Код слишком простой» перечисляет требования.
            if (codeNow.length === 4) {
              setEntryIssue('weak');
              setErr('');
            } else {
              setErr('Введите код из 4 цифр');
            }
            return;
          }
          setErr('');
          setBusy(true);
          try {
            setPhase('confirm');
          } finally {
            setBusy(false);
          }
          return;
        }
        if (!auth.validatePinStrict(confirmNow) || confirmNow !== codeNow) {
          // Строка «отказы кода»: «Коды не совпали» отправляет с первого шага,
          // а не оставляет повторять ввод поверх забытого кода.
          setEntryIssue('mismatch');
          setErr('');
          setPhase('code');
          codeDigitsRef.current = ['', '', '', ''];
          confirmDigitsRef.current = ['', '', '', ''];
          setCodeDigits(['', '', '', '']);
          setConfirmDigits(['', '', '', '']);
          resetOverlayState(setCodeOverlay);
          resetOverlayState(setConfirmOverlay);
          return;
        }
        if (!skipPepAgreement && !pepAccepted) {
          setErr('Чтобы продолжить, примите соглашение об электронной подписи.');
          return;
        }
        setErr('');
        setBusy(true);
        try {
          const res = await auth.setClientAccessCode({
            accessCode: codeNow,
            sessionToken,
            clientId,
            phone,
          });
          if (!res || res.ok === false) {
            const codeErr = res && res.error;
            if (codeErr === 'weak_access_code' || codeErr === 'access_code_matches_onetime_pin') {
              setEntryIssue('weak');
              setErr('');
              setPhase('code');
              codeDigitsRef.current = ['', '', '', ''];
              confirmDigitsRef.current = ['', '', '', ''];
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
        { className: 'heys-auth-card heys-auth-card--pep mx-auto w-full', onKeyDown: handleCardKeyDown },
        React.createElement(
          'div',
          { className: 'heys-auth-heading text-center' },
          React.createElement(
            'div',
            {
              className: 'heys-auth-mark',
              'aria-label': 'HEYS lab',
              dangerouslySetInnerHTML: {
                __html: (HEYS.LoginScreen && typeof HEYS.LoginScreen.getAuthLogoHtml === 'function'
                  ? HEYS.LoginScreen.getAuthLogoHtml()
                  : ''),
              },
            },
          ),
          React.createElement(
            'div',
            { className: 'heys-auth-title' },
            screenTitle,
          ),
          React.createElement(
            'div',
            { className: 'heys-auth-subtitle' },
            screenSubtitle,
          ),
        ),
        React.createElement(
          'div',
          { className: 'heys-auth-pin-section space-y-3 is-active' },
          React.createElement('div', { className: 'heys-auth-label' }, pinLabel),
          // Строка «доступность»: боксы — одно поле для скринридера с подписью
          // «<подпись>, N из 4»; точки в боксах декоративны.
          React.createElement(
            'div',
            { className: 'heys-auth-pin-grid', role: 'group', 'aria-label': pinLabel },
            [0, 1, 2, 3].map((i) => {
              const digit = (digits && digits[i]) || '';
              const isFilled = Boolean(digit);
              const overlay = (pinOverlay && pinOverlay[i]) || { d: '', k: 0 };
              const pinInputStyle = {
                WebkitTextSecurity: 'none',
                color: 'transparent',
                caretColor: 'transparent',
              };
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
                  'aria-label': pinLabel + ', ' + (i + 1) + ' из 4',
                  type: 'text',
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  autoComplete: 'off',
                  readOnly: true,
                  maxLength: 1,
                  value: digit,
                  style: pinInputStyle,
                  onChange: (e) => {
                    if (busy) return;
                    const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 1);
                    const current = getActiveDigits();
                    const existing = (current && current[i]) || '';
                    // Overlay / -webkit-text-security can emit an empty input event
                    // after ~1s and wipe the digit the keypad just wrote.
                    if (!v && existing) return;
                    let arr = (current || []).slice(0, 4);
                    while (arr.length < 4) arr.push('');
                    arr[i] = v;
                    arr = applyPinDigits(arr, i, v);
                    if (v && i < 3) focusPinInput(i + 1);
                  },
                  onKeyDown: (e) => {
                    if (busy) return;
                    if (/^\d$/.test(e.key)) {
                      e.preventDefault();
                      appendPinDigit(e.key);
                      return;
                    }
                    if (e.key === 'Backspace') {
                      e.preventDefault();
                      erasePinDigit();
                      return;
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
                        applyPinDigits(arr);
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
                      'aria-hidden': 'true',
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
          ),
        ),
        // Строка «после сброса»: вместо соглашения — строка о том, что прежний
        // код перестал работать и другие входы завершены.
        // Ответ дизайнера №1 (31 августа): оба факта про код человек должен
        // узнать в момент, когда его придумывает, а не позже. «Заменяет подпись»
        // жило на экране подписания, «никому не сообщайте» — только в плашке
        // после сброса, то есть большинство не видело ни того, ни другого.
        phase === 'code' && entryIssue !== 'mismatch'
          ? React.createElement(
            'div',
            { className: 'heys-auth-reset-note' },
            entryIssue === 'weak'
              ? 'Не подходят: подряд идущие цифры, одна цифра четыре раза и код, который выдал куратор.'
              : (skipPepAgreement
                ? 'Прежний код перестал работать, и все входы на других устройствах завершены. '
                : '')
              + 'Код доступа заменяет собственноручную подпись. Не сообщайте его никому, включая куратора.',
          )
          : null,
        React.createElement(
          'div',
          {
            className: 'heys-auth-keypad',
            ref: keypadRef,
            // Строка «слово»: в подписях только «код», без «PIN».
            'aria-label': 'Цифровая клавиатура кода',
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
        !skipPepAgreement && phase === 'code' && !entryIssue && React.createElement(
          'label',
          { className: 'heys-auth-pep-agree heys-auth-subtitle' },
          React.createElement('input', {
            type: 'checkbox',
            className: 'heys-auth-pep-check',
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
        err && React.createElement(
          'div',
          { className: 'heys-auth-error heys-auth-error-slot is-pin-error', role: 'alert' },
          err,
        ),
        // Строка «полка»: кнопка и обязательная строка закреплены внизу и не
        // уезжают с содержимым карточки. Прежде они шли потоком внутри неё.
        React.createElement(
          'div',
          { className: 'heys-auth-pep-dock' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'heys-auth-primary w-full',
              disabled: !canContinue || busy,
              onClick: handleSubmit,
            },
            busy ? 'Сохраняем…' : 'Продолжить',
          ),
          phase === 'confirm' && typeof onCancel === 'function' && React.createElement(
            'button',
            {
              type: 'button',
              className: 'heys-auth-change-code',
              disabled: busy,
              onClick: () => {
                setPhase('code');
                confirmDigitsRef.current = ['', '', '', ''];
                setConfirmDigits(['', '', '', '']);
                resetOverlayState(setConfirmOverlay);
                setErr('');
              },
            },
            'Изменить код',
          ),
          phase === 'confirm' && React.createElement(
            'p',
            { className: 'heys-auth-meta' },
            skipPepAgreement
              ? 'Проверка идёт на устройстве, код никуда не отправляется'
              : 'Соглашение вы приняли на прошлом шаге',
          ),
          !skipPepAgreement && phase === 'code' && React.createElement(
            'p',
            { className: 'heys-auth-meta' },
            entryIssue === 'weak'
              ? 'Проверка идёт на устройстве, код никуда не отправляется'
              : entryIssue === 'mismatch'
                ? 'Начнём сначала: придумайте код и повторите его'
                : 'Нажимая «Продолжить», вы заключаете соглашение и создаёте код доступа',
          ),
        ),
      );
    };
  }

  HEYS.ClientAccessCodeSetup = {
    createReactComponent: createAccessCodeSetupComponent,
    PEP_DOC_URL,
  };
})(typeof window !== 'undefined' ? window : globalThis);
