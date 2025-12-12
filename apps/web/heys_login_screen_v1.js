// heys_login_screen_v1.js — Единый экран входа (клиент: телефон+PIN, куратор: email+пароль)
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Форматирует 10 цифр в (XXX) XXX-XX-XX
  function formatPhoneBody(digits) {
    const d = (digits || '').slice(0, 10);
    if (!d) return '';
    
    let result = '';
    if (d.length > 0) result += '(' + d.slice(0, 3);
    if (d.length >= 3) result += ') ';
    if (d.length > 3) result += d.slice(3, 6);
    if (d.length >= 6) result += '-';
    if (d.length > 6) result += d.slice(6, 8);
    if (d.length >= 8) result += '-';
    if (d.length > 8) result += d.slice(8, 10);
    
    return result;
  }

  // Старая функция для совместимости
  function maskPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    let d = digits;
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    d = d.slice(0, 11);
    return '+7' + d.slice(1);
  }

  function unmaskPhone(masked) {
    return String(masked || '').replace(/\D/g, '');
  }

  function LoginScreen(props) {
    const {
      onClientLogin,
      onCuratorLogin,
      initialMode = 'client',
    } = props || {};

    const React = global.React;
    const { useMemo, useState, useRef } = React;

    const [mode, setMode] = useState(initialMode);

    // client
    const [phoneMasked, setPhoneMasked] = useState('');
    const [pinDigits, setPinDigits] = useState(['', '', '', '']);
    const [pinOverlay, setPinOverlay] = useState([
      { d: '', k: 0 },
      { d: '', k: 0 },
      { d: '', k: 0 },
      { d: '', k: 0 },
    ]);
    const pinRefs = useRef([]);
    const pinHideTimers = useRef([null, null, null, null]);

    // curator
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [clientDiag, setClientDiag] = useState(null);

    const auth = HEYS.auth;

    // phoneMasked теперь хранит только 10 цифр (без 7)
    // Для валидации и отправки добавляем 7 в начало
    const fullPhone = '7' + phoneMasked;
    const clientPhoneValid = useMemo(() => phoneMasked.length === 10, [phoneMasked]);
    const pin = useMemo(() => (pinDigits || []).join(''), [pinDigits]);
    const clientPinValid = useMemo(() => auth && auth.validatePin(pin), [auth, pin]);

    const canClientLogin = clientPhoneValid && clientPinValid && !busy;
    const canCuratorLogin = Boolean(email && password) && !busy;

    function showPinOverlayDigit(i, digit, totalMs = 700) {
      try {
        const t = pinHideTimers.current && pinHideTimers.current[i];
        if (t) clearTimeout(t);
      } catch (_) {}

      // Ставим оверлей-цифру (анимация у span), под ней остаётся «точка» (password)
      setPinOverlay((prev) => {
        const next = (prev || []).slice(0, 4);
        while (next.length < 4) next.push({ d: '', k: 0 });
        next[i] = { d: String(digit || ''), k: Date.now() + Math.random() };
        return next;
      });

      // Автосброс оверлея как fallback (если onAnimationEnd не сработает)
      try {
        pinHideTimers.current[i] = setTimeout(() => {
          setPinOverlay((prev) => {
            const next = (prev || []).slice(0, 4);
            while (next.length < 4) next.push({ d: '', k: 0 });
            // очищаем только если это тот же ключ (чтобы не сбить новый ввод)
            if (next[i] && next[i].d && next[i].k) next[i] = { d: '', k: 0 };
            return next;
          });
        }, Math.max(300, totalMs + 150));
      } catch (_) {}
    }

    function clearHidePinDigit(i) {
      try {
        const t = pinHideTimers.current && pinHideTimers.current[i];
        if (t) clearTimeout(t);
        if (pinHideTimers.current) pinHideTimers.current[i] = null;
      } catch (_) {}
      setPinOverlay((prev) => {
        const next = (prev || []).slice(0, 4);
        while (next.length < 4) next.push({ d: '', k: 0 });
        next[i] = { d: '', k: 0 };
        return next;
      });
    }

    async function handleClientLogin(pinOverride) {
      if (!onClientLogin) return;
      setErr('');
      setClientDiag(null);
      setBusy(true);
      try {
        const phoneDigits = fullPhone; // 7 + 10 цифр = 11 цифр
        const effectivePin = typeof pinOverride === 'string' ? pinOverride : pin;
        const res = await onClientLogin({ phone: phoneDigits, pin: effectivePin });
        if (!res || res.ok === false) {
          const code = res && res.error;

          // Диагностика (только localhost): помогает отличать shape/rpc/stage
          try {
            const host = (global.location && global.location.hostname) || '';
            const isLocal = host === 'localhost' || host === '127.0.0.1';
            if (isLocal) {
              setClientDiag({
                code: code || 'unknown',
                message: res && res.message,
                debug: res && res._debug,
              });
            }
          } catch (_) {}

          if (code === 'rate_limited') {
            const sec = Math.ceil((res.retryAfterMs || 0) / 1000);
            setErr(`Слишком много попыток. Подождите ${sec}с и попробуйте снова.`);
          } else if (code === 'invalid_credentials') {
            setErr('Телефон или PIN неверные');
          } else if (code === 'cloud_not_ready') {
            setErr('Сервер не готов. Попробуйте чуть позже.');
          } else if (code === 'invalid_phone') {
            setErr('Введите телефон в формате +7');
          } else if (code === 'invalid_pin') {
            setErr('PIN должен быть из 4 цифр');
          } else {
            setErr(res.message || 'Не удалось войти');
          }
        }
      } finally {
        setBusy(false);
      }
    }

    async function handleCuratorLogin() {
      if (!onCuratorLogin) return;
      setErr('');
      setBusy(true);
      try {
        const res = await onCuratorLogin({ email: String(email).trim(), password });
        if (res && res.error) {
          setErr(typeof res.error === 'string' ? res.error : (res.error.message || 'Ошибка входа'));
        }
      } finally {
        setBusy(false);
      }
    }

    const greeting = (() => {
      const h = new Date().getHours();
      if (h >= 5 && h < 12) return '🌅 Доброе утро!';
      if (h >= 12 && h < 18) return '☀️ Добрый день!';
      if (h >= 18 && h < 23) return '🌆 Добрый вечер!';
      return '🌙 Доброй ночи!';
    })();

    const Card = (...children) =>
      React.createElement(
        'div',
        { className: 'w-full max-w-[360px] rounded-2xl bg-white/95 p-7 shadow-2xl ring-1 ring-black/5' },
        children,
      );

    const Input = (p) =>
      React.createElement('input', {
        ...p,
        className:
          'w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-[16px] outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-200/60 ' +
          (p.className || ''),
      });

    const PrimaryBtn = (p, children) =>
      React.createElement(
        'button',
        {
          ...p,
          className:
            'w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-[16px] font-semibold text-white shadow-lg shadow-indigo-500/30 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ' +
            (p.className || ''),
        },
        children,
      );

    const SecondaryBtn = (p, children) =>
      React.createElement(
        'button',
        {
          ...p,
          className:
            'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ' +
            (p.className || ''),
        },
        children,
      );

    const GhostBtn = (p, children) =>
      React.createElement(
        'button',
        {
          ...p,
          className:
            'w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-[15px] font-semibold text-white/95 backdrop-blur transition hover:bg-white/15 active:scale-[0.99] ' +
            (p.className || ''),
        },
        children,
      );

    function renderStart() {
      return Card(
        React.createElement(
          'div',
          { className: 'text-center' },
          React.createElement('div', { className: 'mb-2 text-5xl drop-shadow' }, '🍎'),
          React.createElement('div', { className: 'text-3xl font-extrabold tracking-tight text-slate-900' }, 'HEYS'),
          React.createElement('div', { className: 'mt-1 text-sm text-slate-500' }, 'Умный дневник питания'),
        ),
        React.createElement('div', { className: 'mt-6 space-y-3' },
          PrimaryBtn(
            { onClick: () => setMode('client') },
            'Войти по телефону →',
          ),
          SecondaryBtn(
            { onClick: () => setMode('curator') },
            'Вход куратора',
          ),
        ),
        React.createElement(
          'div',
          { className: 'mt-5 text-center text-sm text-slate-500' },
          greeting,
        ),
      );
    }

    function renderClientLogin() {
      // Храним только 10 цифр (без 7)
      const phoneDigits = phoneMasked.replace(/\D/g, '').slice(0, 10);
      const isPhoneComplete = phoneDigits.length === 10;
      const isPinComplete = (pinDigits || []).every(Boolean);
      
      // Обработчик ввода телефона
      const handlePhoneInput = (e) => {
        setErr('');
        const input = e.target.value;
        // Извлекаем только цифры из того что ввели
        const newDigits = input.replace(/\D/g, '').slice(0, 10);
        // Обновляем состояние — храним форматированную строку для display
        setPhoneMasked(newDigits);
        // Автофокус на PIN после ввода 10 цифр
        if (newDigits.length === 10) {
          setTimeout(() => {
            try { pinRefs.current[0] && pinRefs.current[0].focus(); } catch (_) {}
          }, 50);
        }
      };
      
      // Обработчик нажатия клавиш для правильного удаления
      const handlePhoneKeyDown = (e) => {
        if (e.key === 'Backspace' && phoneDigits.length > 0) {
          e.preventDefault();
          setPhoneMasked(phoneDigits.slice(0, -1));
        }
      };
      
      return Card(
        // Заголовок
        React.createElement(
          'div',
          { className: 'text-center mb-8' },
          React.createElement('div', { className: 'text-3xl font-extrabold text-slate-900 tracking-tight' }, '👋 Привет!'),
          React.createElement('div', { className: 'mt-1 text-base text-slate-500' }, 'Вход для клиентов'),
        ),
        
        // Форма
        React.createElement('div', { className: 'space-y-6' },
          // Современный ввод телефона с фиксированным +7
          React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'text-center text-base font-semibold text-slate-700' }, 'Телефон'),
            React.createElement('div', {
              className: 'flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 transition-all sm:px-5 sm:py-4 ' +
                (isPhoneComplete ? 'border-green-500 bg-green-50/50' : 'border-slate-200 bg-white focus-within:border-indigo-500')
            },
              // Фиксированный префикс +7 (размер и baseline синхронизированы с input)
              React.createElement('span', {
                className: 'phone-prefix-large flex-shrink-0 font-bold text-slate-700 select-none'
              }, '+7'),
              // Поле ввода — ширина по содержимому
              React.createElement('input', {
                type: 'tel',
                inputMode: 'numeric',
                autoComplete: 'tel',
                placeholder: '(999) 123-45-67',
                value: formatPhoneBody(phoneDigits),
                onChange: handlePhoneInput,
                onKeyDown: handlePhoneKeyDown,
                className: 'phone-input-large font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-bold',
                style: { width: '195px' }
              }),
            ),
          ),
          
          // PIN ввод — 4 отдельных поля (как в модных приложениях)
          React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'text-center text-base font-semibold text-slate-700' }, 'PIN-код'),
            React.createElement('div', {
              className: 'flex items-center justify-between gap-3'
            },
              [0, 1, 2, 3].map((i) => {
                const digit = (pinDigits && pinDigits[i]) || '';
                const isFilled = Boolean(digit);
                const overlay = (pinOverlay && pinOverlay[i]) || { d: '', k: 0 };
                return React.createElement('div', {
                  key: 'pin_wrap_' + i,
                  className: 'relative w-14 h-[72px] sm:w-16 sm:h-20 flex-shrink-0',
                },
                  React.createElement('input', {
                    key: 'pin_' + i,
                    ref: (el) => { pinRefs.current[i] = el; },
                    type: 'password',
                    inputMode: 'numeric',
                    pattern: '[0-9]*',
                    autoComplete: i === 0 ? 'one-time-code' : 'off',
                    maxLength: 1,
                    value: digit,
                    onChange: (e) => {
                      setErr('');
                      const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 1);
                      const arr = (pinDigits || []).slice(0, 4);
                      while (arr.length < 4) arr.push('');
                      arr[i] = v;
                      setPinDigits(arr);
                      if (v) showPinOverlayDigit(i, v, 1200);
                      else clearHidePinDigit(i);
                      if (v && i < 3) {
                        try { pinRefs.current[i + 1] && pinRefs.current[i + 1].focus(); } catch (_) {}
                      }
                      // Автоматический вход после ввода последней цифры PIN
                      if (v && i === 3) {
                        const newPin = arr.join('');
                        const isPinValid = auth && auth.validatePin(newPin);
                        if (clientPhoneValid && isPinValid && !busy) {
                          setTimeout(() => handleClientLogin(newPin), 100);
                        }
                      }
                    },
                    onKeyDown: (e) => {
                      if (e.key === 'Backspace') {
                        const cur = (pinDigits && pinDigits[i]) || '';
                        if (!cur && i > 0) {
                          e.preventDefault();
                          const arr = (pinDigits || []).slice(0, 4);
                          while (arr.length < 4) arr.push('');
                          arr[i - 1] = '';
                          setPinDigits(arr);
                          clearHidePinDigit(i - 1);
                          try { pinRefs.current[i - 1] && pinRefs.current[i - 1].focus(); } catch (_) {}
                          return;
                        }
                        if (cur) {
                          e.preventDefault();
                          const arr = (pinDigits || []).slice(0, 4);
                          while (arr.length < 4) arr.push('');
                          arr[i] = '';
                          setPinDigits(arr);
                          clearHidePinDigit(i);
                          return;
                        }
                      }
                      if (e.key === 'ArrowLeft' && i > 0) {
                        e.preventDefault();
                        try { pinRefs.current[i - 1] && pinRefs.current[i - 1].focus(); } catch (_) {}
                      }
                      if (e.key === 'ArrowRight' && i < 3) {
                        e.preventDefault();
                        try { pinRefs.current[i + 1] && pinRefs.current[i + 1].focus(); } catch (_) {}
                      }
                      if (e.key === 'Enter' && canClientLogin) {
                        handleClientLogin();
                      }
                    },
                    onPaste: (e) => {
                      try {
                        const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
                        const digits = String(txt).replace(/\D/g, '').slice(0, 4);
                        if (digits) {
                          e.preventDefault();
                          setErr('');
                          const arr = ['', '', '', ''];
                          for (let k = 0; k < 4; k++) {
                            arr[k] = digits[k] || '';
                            if (arr[k]) showPinOverlayDigit(k, arr[k], 1400);
                            else clearHidePinDigit(k);
                          }
                          setPinDigits(arr);
                          const nextIdx = Math.min(3, digits.length);
                          try { pinRefs.current[nextIdx] && pinRefs.current[nextIdx].focus(); } catch (_) {}
                        }
                      } catch (_) {}
                    },
                    className:
                      'w-full h-full rounded-2xl border-2 bg-white text-center text-[32px] sm:text-[36px] leading-none font-bold outline-none transition ' +
                      (isPinComplete
                        ? 'border-green-400 bg-green-50/50'
                        : isFilled
                          ? 'border-slate-300'
                          : 'border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-200/60'),
                  }),
                  (overlay && overlay.d)
                    ? React.createElement(
                        'span',
                        {
                          key: 'pin_overlay_' + i + '_' + overlay.k,
                          className:
                            'pin-digit-overlay absolute inset-0 flex items-center justify-center text-slate-800 text-[32px] sm:text-[36px] font-bold leading-none pointer-events-none',
                          onAnimationEnd: () => {
                            // Сбрасываем только если это тот же overlay
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
              })
            ),
          ),
          
          err && React.createElement('div', { className: 'rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-600' }, err),
          clientDiag && React.createElement(
            'div',
            { className: 'rounded-xl bg-black/5 px-3 py-2 text-left text-[12px] text-slate-700' },
            React.createElement('div', { className: 'font-semibold text-slate-800' }, 'Диагностика (localhost)'),
            React.createElement(
              'pre',
              { className: 'mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-slate-700' },
              (() => {
                try {
                  return JSON.stringify(clientDiag, null, 2);
                } catch (_) {
                  return String(clientDiag);
                }
              })(),
            ),
          ),
          PrimaryBtn(
            { onClick: handleClientLogin, disabled: !canClientLogin },
            busy ? '⏳ Вход...' : 'Войти →',
          ),
        ),
        React.createElement(
          'div',
          { className: 'mt-6 space-y-3 text-center text-sm text-slate-500' },
          React.createElement('div', null, 'Нет доступа? Обратитесь в поддержку:'),
          React.createElement(
            'a',
            {
              href: 'tel:+79624556111',
              className: 'block font-semibold text-indigo-600 hover:underline',
            },
            '+7 962 455-61-11',
          ),
          React.createElement(
            'button',
            { className: 'mt-3 font-medium text-indigo-500 hover:text-indigo-700 hover:underline', onClick: () => { setErr(''); setMode('curator'); } },
            'Вход для куратора →',
          ),
        ),
      );
    }

    function renderCuratorLogin() {
      return Card(
        React.createElement(
          'div',
          { className: 'text-center' },
          React.createElement('div', { className: 'mb-2 text-4xl drop-shadow' }, '🍎'),
          React.createElement('div', { className: 'text-2xl font-extrabold tracking-tight text-slate-900' }, 'HEYS'),
          React.createElement('div', { className: 'mt-1 text-sm text-slate-500' }, 'Вход куратора'),
        ),
        React.createElement('div', { className: 'mt-5 space-y-3' },
          Input({
            type: 'email',
            autoComplete: 'email',
            placeholder: 'Email',
            value: email,
            onChange: (e) => { setErr(''); setEmail(e.target.value); },
          }),
          Input({
            type: 'password',
            autoComplete: 'current-password',
            placeholder: 'Пароль',
            value: password,
            onChange: (e) => { setErr(''); setPassword(e.target.value); },
            onKeyDown: (e) => e.key === 'Enter' && canCuratorLogin && handleCuratorLogin(),
          }),
          err && React.createElement('div', { className: 'rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-600' }, err),
          PrimaryBtn(
            { onClick: handleCuratorLogin, disabled: !canCuratorLogin },
            busy ? '⏳ Вход...' : 'Войти →',
          ),
        ),
        React.createElement(
          'div',
          { className: 'mt-5 space-y-2 text-center text-sm text-slate-500' },
          React.createElement('div', null, greeting),
          React.createElement(
            'button',
            { className: 'text-indigo-600 hover:underline', onClick: () => { setErr(''); setMode('start'); } },
            '← Назад',
          ),
        ),
      );
    }

    return React.createElement(
      'div',
      {
        className:
          'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-700 px-5 py-10',
      },
      mode === 'start'
        ? renderStart()
        : mode === 'client'
          ? renderClientLogin()
          : renderCuratorLogin(),
      React.createElement(
        'div',
        { className: 'mt-6 text-xs font-medium text-white/40 tracking-wider font-mono' },
        'v' + (HEYS.version || 'dev'),
      ),
    );
  }

  HEYS.LoginScreen = LoginScreen;
})(typeof window !== 'undefined' ? window : globalThis);
