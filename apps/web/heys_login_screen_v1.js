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
    // 🚀 LOGIN-FIRST BOOT: Если статичный логин-оверлей уже выполнил вход,
    // не показываем React LoginScreen — данные уже в localStorage, React подхватит их.
    // Таймаут 30s на случай если React mount занял слишком много времени.
    if (window.__heysPreAuth && (Date.now() - (window.__heysPreAuth.timestamp || 0) < 30000)) {
      return null;
    }

    const {
      onClientLogin,
      onCuratorLogin,
      initialMode = 'client',
      initialEmail = '',
      initialPassword = '',
      autoCuratorLogin = false,
      curatorAutologinConfig = null,
    } = props || {};

    const React = global.React;
    const { useEffect, useMemo, useState, useRef } = React;

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

    // curator — inherit email from HTML gate if user was already typing
    const [email, setEmail] = useState(initialEmail || '');
    const [password, setPassword] = useState(initialPassword || '');

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [clientDiag, setClientDiag] = useState(null);
    const curatorAutoLoginTriedRef = useRef(false);

    const auth = HEYS.auth;
    const autoCuratorLoginEnabled = autoCuratorLogin === true && curatorAutologinConfig && curatorAutologinConfig.enabled === true;

    // phoneMasked теперь хранит только 10 цифр (без 7)
    // Для валидации и отправки добавляем 7 в начало
    const fullPhone = '7' + phoneMasked;
    const clientPhoneValid = useMemo(() => phoneMasked.length === 10, [phoneMasked]);
    const pin = useMemo(() => (pinDigits || []).join(''), [pinDigits]);
    const clientPinValid = useMemo(() => auth && auth.validatePin(pin), [auth, pin]);

    const canClientLogin = clientPhoneValid && clientPinValid && !busy;
    const canCuratorLogin = Boolean(email && password) && !busy;

    function getCuratorAutologinKey() {
      return (curatorAutologinConfig && curatorAutologinConfig.onceKey) || 'heys_temp_curator_autologin_v1';
    }

    function getCuratorAutologinState() {
      try {
        return sessionStorage.getItem(getCuratorAutologinKey()) || '';
      } catch (_) {
        return '';
      }
    }

    function setCuratorAutologinState(state) {
      try {
        if (state) sessionStorage.setItem(getCuratorAutologinKey(), state);
        else sessionStorage.removeItem(getCuratorAutologinKey());
      } catch (_) { }
    }

    function isCuratorAutologinArmed() {
      return global.__hlgCuratorAutologinArmed === true;
    }

    function setCuratorAutologinArmed(value) {
      global.__hlgCuratorAutologinArmed = value === true;
      if (!value) {
        setCuratorAutologinState('');
      }
    }

    function getCuratorLoginPayload(overrides) {
      const next = overrides || {};
      const fallbackEmail = autoCuratorLoginEnabled && curatorAutologinConfig ? (curatorAutologinConfig.email || '') : '';
      const fallbackPassword = autoCuratorLoginEnabled && curatorAutologinConfig ? (curatorAutologinConfig.password || '') : '';
      return {
        email: String(next.email != null ? next.email : (email || fallbackEmail || '')).trim(),
        password: String(next.password != null ? next.password : (password || fallbackPassword || '')),
      };
    }

    function armCuratorAutologin() {
      if (!autoCuratorLoginEnabled || !curatorAutologinConfig) return;
      curatorAutoLoginTriedRef.current = false;
      setCuratorAutologinState('armed');
      setCuratorAutologinArmed(true);
      if (curatorAutologinConfig.email) setEmail(curatorAutologinConfig.email);
      if (curatorAutologinConfig.password) setPassword(curatorAutologinConfig.password);
    }

    function disarmCuratorAutologin() {
      curatorAutoLoginTriedRef.current = false;
      setCuratorAutologinArmed(false);
    }

    function showPinOverlayDigit(i, digit, totalMs = 700) {
      try {
        const t = pinHideTimers.current && pinHideTimers.current[i];
        if (t) clearTimeout(t);
      } catch (_) { }

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
          } catch (_) { }

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

    async function handleCuratorLogin(options) {
      const loginOptions = options || {};
      if (!onCuratorLogin) return { ok: false };
      const payload = getCuratorLoginPayload(loginOptions);
      const isAutologinAttempt = loginOptions.isAutologin === true || isCuratorAutologinArmed();

      if (!payload.email || !payload.password) {
        if (isAutologinAttempt) disarmCuratorAutologin();
        setErr('Введите email и пароль');
        return { ok: false, error: 'missing_credentials' };
      }

      setErr('');
      setBusy(true);
      try {
        if (payload.email !== email) setEmail(payload.email);
        if (payload.password !== password) setPassword(payload.password);

        const res = await onCuratorLogin(payload);
        if (res && res.error) {
          if (isAutologinAttempt) disarmCuratorAutologin();
          setErr(typeof res.error === 'string' ? res.error : (res.error.message || 'Ошибка входа'));
          return { ok: false, error: res.error };
        }
        if (isAutologinAttempt) {
          setCuratorAutologinState('done');
          global.__hlgCuratorAutologinArmed = false;
        }
        return { ok: true };
      } finally {
        setBusy(false);
      }
    }

    useEffect(() => {
      if (!autoCuratorLoginEnabled) return;
      if (mode !== 'curator') return;
      if (busy) return;
      if (!isCuratorAutologinArmed()) return;
      if (curatorAutoLoginTriedRef.current) return;
      if (getCuratorAutologinState() === 'pending') return;

      const payload = getCuratorLoginPayload();
      if (!payload.email || !payload.password) return;

      curatorAutoLoginTriedRef.current = true;
      setCuratorAutologinState('pending');
      if (payload.email !== email) setEmail(payload.email);
      if (payload.password !== password) setPassword(payload.password);

      const timer = setTimeout(() => {
        handleCuratorLogin({
          email: payload.email,
          password: payload.password,
          isAutologin: true,
        });
      }, 80);

      return () => clearTimeout(timer);
    }, [autoCuratorLoginEnabled, busy, email, mode, password]);

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
        { className: 'heys-auth-card' },
        ...children,
      );

    const Input = (p) =>
      React.createElement('input', {
        ...p,
        className: 'heys-auth-input ' + (p.className || ''),
      });

    const PrimaryBtn = (p, children) =>
      React.createElement(
        'button',
        {
          ...p,
          type: p.type || 'button',
          className: 'heys-auth-btn heys-auth-btn--primary ' + (p.className || ''),
        },
        children,
      );

    const SecondaryBtn = (p, children) =>
      React.createElement(
        'button',
        {
          ...p,
          type: p.type || 'button',
          className: 'heys-auth-btn heys-auth-btn--secondary ' + (p.className || ''),
        },
        children,
      );

    const GhostBtn = (p, children) =>
      React.createElement(
        'button',
        {
          ...p,
          type: p.type || 'button',
          className: 'heys-auth-btn heys-auth-btn--ghost ' + (p.className || ''),
        },
        children,
      );

    function renderStart() {
      return Card(
        React.createElement(
          'div',
          { className: 'text-center' },
          React.createElement('div', { className: 'mb-2 text-5xl drop-shadow' }, '🍎'),
          React.createElement('div', { className: 'heys-auth-brand' }, 'HEYS'),
          React.createElement('div', { className: 'heys-auth-subtitle text-sm' }, 'Умный дневник питания'),
        ),
        React.createElement('div', { className: 'mt-6 space-y-3' },
          PrimaryBtn(
            { onClick: () => { setErr(''); setMode('client'); } },
            'Войти по телефону →',
          ),
          SecondaryBtn(
            {
              onClick: () => {
                setErr('');
                armCuratorAutologin();
                setMode('curator');
              }
            },
            'Вход куратора',
          ),
        ),
        React.createElement(
          'div',
          { className: 'heys-auth-meta mt-5 text-center text-sm' },
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
        let newDigits = input.replace(/\D/g, '').slice(0, 10);
        // Mobile-фикс: на Android backspace приходит как input
        // (key==='Unidentified' в keydown). Если стёрся только разделитель
        // маски, число цифр не уменьшилось — снимаем последнюю цифру руками,
        // иначе ввод «упирается в стенку» на стыках 3/6/8 цифр.
        const inputType = (e.nativeEvent && e.nativeEvent.inputType) || '';
        if (inputType === 'deleteContentBackward' && newDigits.length === phoneDigits.length && phoneDigits.length > 0) {
          newDigits = newDigits.slice(0, -1);
        }
        // Обновляем состояние — храним форматированную строку для display
        setPhoneMasked(newDigits);
        // Автофокус на PIN после ввода 10 цифр
        if (newDigits.length === 10) {
          setTimeout(() => {
            try { pinRefs.current[0] && pinRefs.current[0].focus(); } catch (_) { }
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
          React.createElement('div', { className: 'heys-auth-title' }, '👋 Привет!'),
          React.createElement('div', { className: 'heys-auth-subtitle text-base' }, 'Вход для клиентов'),
        ),

        // Форма
        React.createElement('form', {
          className: 'space-y-6',
          onSubmit: (e) => {
            e.preventDefault();
            if (canClientLogin) handleClientLogin();
          },
        },
          // Современный ввод телефона с фиксированным +7
          React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'heys-auth-label text-base' }, 'Телефон'),
            React.createElement('div', {
              className: 'heys-auth-field ' + (isPhoneComplete ? 'is-complete' : '')
            },
              // Фиксированный префикс +7 (размер и baseline синхронизированы с input)
              React.createElement('span', {
                className: 'phone-prefix-large heys-auth-prefix'
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
                className: 'phone-input-large heys-auth-phone-input',
                style: {
                  width: '195px',
                  fontWeight: 700,
                }
              }),
            ),
          ),

          // PIN ввод — 4 отдельных поля (как в модных приложениях)
          React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'heys-auth-label text-base' }, 'PIN-код'),
            React.createElement('div', {
              className: 'heys-auth-pin-grid'
            },
              [0, 1, 2, 3].map((i) => {
                const digit = (pinDigits && pinDigits[i]) || '';
                const isFilled = Boolean(digit);
                const overlay = (pinOverlay && pinOverlay[i]) || { d: '', k: 0 };
                return React.createElement('div', {
                  key: 'pin_wrap_' + i,
                  className: 'heys-auth-pin-box',
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
                    // Скрываем текст input пока показывается overlay (иначе видна «маленькая цифра» браузера)
                    style: overlay.d ? { color: 'transparent', caretColor: 'transparent' } : undefined,
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
                        try { pinRefs.current[i + 1] && pinRefs.current[i + 1].focus(); } catch (_) { }
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
                          try { pinRefs.current[i - 1] && pinRefs.current[i - 1].focus(); } catch (_) { }
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
                        try { pinRefs.current[i - 1] && pinRefs.current[i - 1].focus(); } catch (_) { }
                      }
                      if (e.key === 'ArrowRight' && i < 3) {
                        e.preventDefault();
                        try { pinRefs.current[i + 1] && pinRefs.current[i + 1].focus(); } catch (_) { }
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
                          try { pinRefs.current[nextIdx] && pinRefs.current[nextIdx].focus(); } catch (_) { }
                        }
                      } catch (_) { }
                    },
                    className: 'heys-auth-pin-input ' + (isPinComplete ? 'is-complete' : isFilled ? 'is-filled' : ''),
                  }),
                  (overlay && overlay.d)
                    ? React.createElement(
                      'span',
                      {
                        key: 'pin_overlay_' + i + '_' + overlay.k,
                        className: 'pin-digit-overlay absolute inset-0 flex items-center justify-center heys-auth-pin-overlay pointer-events-none',
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

          err && React.createElement('div', { className: 'heys-auth-error' }, err),
          clientDiag && React.createElement(
            'div',
            { className: 'heys-auth-diagnostics' },
            React.createElement('div', { className: 'font-semibold' }, 'Диагностика (localhost)'),
            React.createElement(
              'pre',
              { className: 'mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug' },
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
            { type: 'submit', disabled: !canClientLogin },
            busy ? '⏳ Вход...' : 'Войти →',
          ),
        ),
        React.createElement(
          'div',
          { className: 'heys-auth-meta mt-6 space-y-3 text-center text-sm' },
          // Подсказка по сбросу PIN — без отдельного UI flow (минимальная
          // реализация P0-G). Клиент пишет куратору в Telegram-личку,
          // куратор сбрасывает PIN через админ-панель.
          React.createElement(
            'div',
            { className: 'heys-auth-meta-strong' },
            'Не помните PIN? Напишите куратору — он его сбросит:',
          ),
          React.createElement(
            'a',
            {
              href: (window.HEYS && window.HEYS.support && window.HEYS.support.telegramUrl) || 'https://t.me/heyslab_support',
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'heys-auth-link block',
            },
            (window.HEYS && window.HEYS.support && window.HEYS.support.telegramHandle) || '@heyslab_support',
          ),
          React.createElement('div', { className: 'mt-4' }, 'Или позвоните в поддержку:'),
          React.createElement(
            'a',
            {
              href: 'tel:+79624556111',
              className: 'heys-auth-link block',
            },
            '+7 962 455-61-11',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'heys-auth-link-btn mt-3',
              onClick: () => {
                setErr('');
                armCuratorAutologin();
                setMode('curator');
              }
            },
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
          React.createElement('div', { className: 'heys-auth-brand' }, 'HEYS'),
          React.createElement('div', { className: 'heys-auth-subtitle text-sm' }, 'Вход куратора'),
        ),
        React.createElement(
          'form',
          {
            className: 'mt-5 space-y-3',
            onSubmit: (e) => {
              e.preventDefault();
              if (canCuratorLogin) handleCuratorLogin();
            },
          },
          Input({
            type: 'email',
            name: 'email',
            autoComplete: 'email',
            placeholder: 'Email',
            value: email,
            onChange: (e) => { setErr(''); setEmail(e.target.value); },
          }),
          Input({
            type: 'password',
            name: 'password',
            autoComplete: 'current-password',
            placeholder: 'Пароль',
            value: password,
            onChange: (e) => { setErr(''); setPassword(e.target.value); },
          }),
          err && React.createElement('div', { className: 'heys-auth-error' }, err),
          PrimaryBtn(
            { type: 'submit', disabled: !canCuratorLogin },
            busy ? '⏳ Вход...' : 'Войти →',
          ),
        ),
        React.createElement(
          'div',
          { className: 'heys-auth-meta mt-5 space-y-2 text-center text-sm' },
          React.createElement('div', null, greeting),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'heys-auth-link-btn',
              onClick: () => {
                setErr('');
                disarmCuratorAutologin();
                setMode('client');
              }
            },
            '← Назад',
          ),
        ),
      );
    }

    return React.createElement(
      'div',
      {
        className: 'heys-auth-shell fixed inset-0 z-[9999] flex flex-col items-center justify-center px-5 py-10',
      },
      mode === 'start'
        ? renderStart()
        : mode === 'client'
          ? renderClientLogin()
          : renderCuratorLogin(),
      React.createElement(
        'div',
        { className: 'heys-auth-version mt-6 text-xs font-medium tracking-wider font-mono' },
        'v' + (HEYS.version || 'dev'),
      ),
    );
  }

  HEYS.LoginScreen = LoginScreen;
})(typeof window !== 'undefined' ? window : globalThis);
