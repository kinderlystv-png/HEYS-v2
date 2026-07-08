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
    const [activeEntry, setActiveEntry] = useState('phone');
    const [pinErrorActive, setPinErrorActive] = useState(false);
    const [pinErrorVisible, setPinErrorVisible] = useState(false);
    const [phoneConfirmPulse, setPhoneConfirmPulse] = useState(false);
    const [pinOverlay, setPinOverlay] = useState([
      { d: '', k: 0 },
      { d: '', k: 0 },
      { d: '', k: 0 },
      { d: '', k: 0 },
    ]);
    const phoneInputRef = useRef(null);
    const pinRefs = useRef([]);
    const pinHideTimers = useRef([null, null, null, null]);
    const phonePulseTimer = useRef(null);

    // curator — inherit email from HTML gate if user was already typing
    const [email, setEmail] = useState(initialEmail || '');
    const [password, setPassword] = useState(initialPassword || '');

	    const [busy, setBusy] = useState(false);
	    const [err, setErr] = useState('');
	    const [supportOpen, setSupportOpen] = useState(false);
	    const curatorAutoLoginTriedRef = useRef(false);
    const pinErrorTimers = useRef({ reset: null, clear: null });

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

    function usesTouchKeypad() {
      try {
        return !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
      } catch (_) {
        return false;
      }
    }

    function focusPinInput(idx) {
      const input = pinRefs.current && pinRefs.current[idx];
      if (!input) return;
      if (usesTouchKeypad()) {
        try {
          if (global.document && global.document.activeElement) global.document.activeElement.blur();
        } catch (_) { }
        return;
      }
      try { input.focus(); } catch (_) { }
    }

    function getNextPinIndex(digits) {
      const arr = (digits || pinDigits || []).slice(0, 4);
      for (let i = 0; i < 4; i++) {
        if (!arr[i]) return i;
      }
      return 3;
    }

    function resetPinToFirstSlot() {
      try {
        (pinHideTimers.current || []).forEach((t) => { if (t) clearTimeout(t); });
        pinHideTimers.current = [null, null, null, null];
      } catch (_) { }
      setPinDigits(['', '', '', '']);
      setPinOverlay([
        { d: '', k: 0 },
        { d: '', k: 0 },
        { d: '', k: 0 },
        { d: '', k: 0 },
      ]);
      setActiveEntry('pin');
      setTimeout(() => focusPinInput(0), 50);
    }

    function pulsePhoneComplete() {
      try {
        if (phonePulseTimer.current) clearTimeout(phonePulseTimer.current);
      } catch (_) { }
      setPhoneConfirmPulse(false);
      setTimeout(() => setPhoneConfirmPulse(true), 0);
      phonePulseTimer.current = setTimeout(() => setPhoneConfirmPulse(false), 220);
    }

    function hapticInvalidPin() {
      try {
        if (global.navigator && typeof global.navigator.vibrate === 'function') {
          global.navigator.vibrate(35);
        }
      } catch (_) { }
    }

    function showInvalidPinFeedback(message = 'PIN не подошёл') {
      try {
        const timers = pinErrorTimers.current || {};
        if (timers.reset) clearTimeout(timers.reset);
        if (timers.clear) clearTimeout(timers.clear);
      } catch (_) { }
      setErr(message);
      setPinErrorVisible(true);
      setPinErrorActive(false);
      setActiveEntry('pin');
      hapticInvalidPin();
      setTimeout(() => setPinErrorActive(true), 0);
      pinErrorTimers.current.reset = setTimeout(() => {
        resetPinToFirstSlot();
        setPinErrorActive(false);
      }, 360);
      pinErrorTimers.current.clear = setTimeout(() => {
        setPinErrorVisible(false);
        setErr((current) => (current === message ? '' : current));
      }, 1800);
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
      setPinErrorVisible(false);
      setPinErrorActive(false);
      setBusy(true);
      try {
        const phoneDigits = fullPhone; // 7 + 10 цифр = 11 цифр
        const effectivePin = typeof pinOverride === 'string' ? pinOverride : pin;
        const res = await onClientLogin({ phone: phoneDigits, pin: effectivePin });
        if (!res || res.ok === false) {
          const code = res && res.error;

          if (code === 'rate_limited') {
            const sec = Math.ceil((res.retryAfterMs || 0) / 1000);
            setErr(`Слишком много попыток. Подождите ${sec}с и попробуйте снова.`);
          } else if (code === 'invalid_credentials') {
            showInvalidPinFeedback();
          } else if (code === 'cloud_not_ready') {
            setErr('Сервер не готов. Попробуйте чуть позже.');
          } else if (code === 'invalid_phone') {
            setErr('Введите телефон в формате +7');
          } else if (code === 'invalid_pin') {
            setErr('PIN должен быть из 4 цифр');
            resetPinToFirstSlot();
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

	    useEffect(() => {
	      if (!supportOpen) return undefined;
	      const onKeyDown = (e) => {
	        if (e && e.key === 'Escape') setSupportOpen(false);
	      };
	      try { global.document && global.document.addEventListener('keydown', onKeyDown); } catch (_) { }
	      return () => {
	        try { global.document && global.document.removeEventListener('keydown', onKeyDown); } catch (_) { }
	      };
	    }, [supportOpen]);

    const greeting = (() => {
      const h = new Date().getHours();
      if (h >= 5 && h < 12) return 'Доброе утро';
      if (h >= 12 && h < 18) return 'Добрый день';
      if (h >= 18 && h < 23) return 'Добрый вечер';
      return 'Доброй ночи';
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

	    function renderSupportPopup() {
	      if (!supportOpen) return null;
	      return React.createElement(
	        'div',
	        {
	          className: 'heys-auth-support-backdrop',
	          role: 'dialog',
	          'aria-modal': 'true',
	          'aria-labelledby': 'heys-auth-support-title',
	          onClick: () => setSupportOpen(false),
	        },
	        React.createElement(
	          'div',
	          {
	            className: 'heys-auth-support-panel',
	            onClick: (e) => e.stopPropagation(),
	          },
	          React.createElement(
	            'button',
	            {
	              type: 'button',
	              className: 'heys-auth-support-close',
	              'aria-label': 'Закрыть',
	              onClick: () => setSupportOpen(false),
	            },
	            '×',
	          ),
	          React.createElement('div', { id: 'heys-auth-support-title', className: 'heys-auth-support-title' }, 'Поддержка HEYS'),
	          React.createElement('div', { className: 'heys-auth-support-text' }, 'Если PIN не подходит или его нужно сбросить, напишите нам или позвоните.'),
	          React.createElement(
	            'a',
	            {
	              href: (window.HEYS && window.HEYS.support && window.HEYS.support.telegramUrl) || 'https://t.me/heyslab_support_bot',
	              target: '_blank',
	              rel: 'noopener noreferrer',
	              className: 'heys-auth-support-action',
	            },
	            (window.HEYS && window.HEYS.support && window.HEYS.support.telegramHandle) || '@heyslab_support_bot',
	          ),
	          React.createElement(
	            'a',
	            {
	              href: 'tel:+79624556111',
	              className: 'heys-auth-support-action',
	            },
	            '+7 962 455-61-11',
	          ),
	        ),
	      );
	    }

	    function renderServiceEntry() {
	      if (mode !== 'client') return null;
	      return React.createElement(
	        'button',
	        {
	          type: 'button',
	          className: 'heys-auth-version heys-auth-service-entry mt-6 text-xs font-medium tracking-wider font-mono',
	          'aria-label': 'Служебный вход',
	          title: 'Служебный вход',
	          onClick: () => {
	            setErr('');
	            armCuratorAutologin();
	            setMode('curator');
	          },
	        },
	        'служебный вход',
	      );
	    }

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
      const touchKeypad = usesTouchKeypad();

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
	        const wasComplete = phoneDigits.length === 10;
	        setPhoneMasked(newDigits);
	        // Автофокус на PIN после ввода 10 цифр
	        if (newDigits.length === 10) {
	          if (!wasComplete) pulsePhoneComplete();
	          setActiveEntry('pin');
	          setTimeout(() => {
	            focusPinInput(getNextPinIndex(pinDigits));
	          }, 50);
        } else {
          setActiveEntry('phone');
        }
      };

      // Обработчик нажатия клавиш для правильного удаления
      const handlePhoneKeyDown = (e) => {
	        if (e.key === 'Backspace' && phoneDigits.length > 0) {
	          e.preventDefault();
	          setPhoneMasked(phoneDigits.slice(0, -1));
	          setActiveEntry('phone');
	        }
	      };

      const applyPinDigits = (nextDigits, changedIndex, changedDigit) => {
        const arr = (nextDigits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        setErr('');
        setActiveEntry('pin');
        setPinDigits(arr);
        if (typeof changedIndex === 'number') {
          if (changedDigit) showPinOverlayDigit(changedIndex, changedDigit, 1200);
          else clearHidePinDigit(changedIndex);
        }
        return arr;
      };

      const maybeLoginWithPin = (nextDigits) => {
        const nextPin = (nextDigits || []).join('');
        const isPinValid = auth && auth.validatePin(nextPin);
        if (clientPhoneValid && isPinValid && !busy) {
          setTimeout(() => handleClientLogin(nextPin), 100);
        }
      };

	      const appendPhoneDigit = (digit) => {
	        if (busy || !/^\d$/.test(String(digit)) || phoneDigits.length >= 10) return;
	        const next = (phoneDigits + String(digit)).slice(0, 10);
        setErr('');
	        setPhoneMasked(next);
	        if (next.length === 10) {
	          pulsePhoneComplete();
	          setActiveEntry('pin');
	          setTimeout(() => focusPinInput(getNextPinIndex(pinDigits)), 50);
        } else {
          setActiveEntry('phone');
        }
      };

      const erasePhoneDigit = () => {
        if (busy || phoneDigits.length <= 0) return;
        setErr('');
        setPhoneMasked(phoneDigits.slice(0, -1));
        setActiveEntry('phone');
        try { if (phoneInputRef.current && !usesTouchKeypad()) phoneInputRef.current.focus(); } catch (_) { }
      };

      const appendPinDigit = (digit) => {
        if (!clientPhoneValid) {
          appendPhoneDigit(digit);
          return;
        }
        if (pinErrorActive) return;
        if (busy || !/^\d$/.test(String(digit)) || (pinDigits || []).every(Boolean)) return;
        setActiveEntry('pin');
        const idx = getNextPinIndex(pinDigits);
        const arr = (pinDigits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        arr[idx] = String(digit);
        const next = applyPinDigits(arr, idx, String(digit));
        if (idx < 3) focusPinInput(idx + 1);
        maybeLoginWithPin(next);
      };

      const erasePinDigit = () => {
        if (busy) return;
        if (pinErrorActive) return;
        setActiveEntry('pin');
        const arr = (pinDigits || []).slice(0, 4);
        while (arr.length < 4) arr.push('');
        for (let i = 3; i >= 0; i--) {
          if (arr[i]) {
            arr[i] = '';
            applyPinDigits(arr, i, '');
            focusPinInput(i);
            return;
          }
        }
        if (clientPhoneValid) {
          setPhoneMasked(phoneDigits.slice(0, -1));
          setActiveEntry('phone');
        }
      };

      const handleKeypadDigit = (digit) => {
        if (activeEntry === 'phone' || !clientPhoneValid) appendPhoneDigit(digit);
        else appendPinDigit(digit);
      };

      const handleKeypadBackspace = () => {
        if (activeEntry === 'phone' || !clientPhoneValid) erasePhoneDigit();
        else erasePinDigit();
      };

      const activePinIndex = activeEntry === 'pin' && !isPinComplete ? getNextPinIndex(pinDigits) : -1;

      return React.createElement(
        React.Fragment,
        null,
	        Card(
	          // Заголовок
	        React.createElement(
	          'div',
	          { className: 'heys-auth-heading text-center' },
	          React.createElement(
	            'div',
	            { className: 'heys-auth-mark', 'aria-label': 'HEYS lab' },
	            React.createElement('img', {
	              src: 'heys-logo-hero-blue.png',
	              alt: '',
	              loading: 'eager',
	              decoding: 'async',
	            }),
	          ),
	          React.createElement('div', { className: 'heys-auth-title' }, 'Вход клиента'),
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
	              className: 'heys-auth-field ' + (isPhoneComplete ? 'is-complete' : '') + (activeEntry === 'phone' ? ' is-active' : '') + (phoneConfirmPulse ? ' is-confirm-pulse' : '')
	            },
              // Фиксированный префикс +7 (размер и baseline синхронизированы с input)
              React.createElement('span', {
                className: 'phone-prefix-large heys-auth-prefix'
              }, '+7'),
              // Поле ввода — ширина по содержимому
	              React.createElement('input', {
	                ref: phoneInputRef,
	                id: 'heys-client-phone',
	                name: 'phone',
	                type: 'tel',
	                inputMode: 'numeric',
                autoComplete: 'tel',
                autoFocus: true,
                readOnly: touchKeypad,
                placeholder: '(999) 123-45-67',
                value: formatPhoneBody(phoneDigits),
                onChange: handlePhoneInput,
                onKeyDown: handlePhoneKeyDown,
                onFocus: () => setActiveEntry('phone'),
                onClick: () => setActiveEntry('phone'),
                className: 'phone-input-large heys-auth-phone-input',
                style: {
                  width: '224px',
                  fontWeight: 700,
                }
              }),
            ),
          ),

          // PIN ввод — 4 отдельных поля (как в модных приложениях)
	          React.createElement('div', { className: 'heys-auth-pin-section space-y-3 ' + (!clientPhoneValid ? 'is-muted ' : '') + (activeEntry === 'pin' ? 'is-active' : '') },
	            React.createElement('div', { className: 'heys-auth-label text-base' }, 'PIN-код'),
            React.createElement('div', {
              className: 'heys-auth-pin-grid'
            },
	              [0, 1, 2, 3].map((i) => {
	                const digit = (pinDigits && pinDigits[i]) || '';
	                const isFilled = Boolean(digit);
	                const overlay = (pinOverlay && pinOverlay[i]) || { d: '', k: 0 };
	                const pinInputStyle = overlay.d
	                  ? { WebkitTextSecurity: 'none', color: 'transparent', caretColor: 'transparent' }
	                  : { WebkitTextSecurity: 'disc' };
	                return React.createElement('div', {
	                  key: 'pin_wrap_' + i,
	                  className: 'heys-auth-pin-box',
	                },
	                  React.createElement('input', {
	                    key: 'pin_' + i,
	                    ref: (el) => { pinRefs.current[i] = el; },
	                    id: 'heys-client-pin-' + (i + 1),
	                    name: 'pin-' + (i + 1),
	                    type: 'text',
	                    inputMode: 'numeric',
	                    pattern: '[0-9]*',
                    autoComplete: i === 0 ? 'one-time-code' : 'off',
                    readOnly: touchKeypad,
	                    maxLength: 1,
	                    value: digit,
	                    // Скрываем текст input пока показывается overlay (иначе видна «маленькая цифра» браузера)
	                    style: pinInputStyle,
                    onChange: (e) => {
                      if (!clientPhoneValid || pinErrorActive) {
                        setActiveEntry('phone');
                        return;
                      }
                      setErr('');
                      const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 1);
                      let arr = (pinDigits || []).slice(0, 4);
                      while (arr.length < 4) arr.push('');
                      arr[i] = v;
                      arr = applyPinDigits(arr, i, v);
                      if (v && i < 3) {
                        focusPinInput(i + 1);
                      }
                      // Автоматический вход после ввода последней цифры PIN
                      if (v && i === 3) {
                        maybeLoginWithPin(arr);
                      }
                    },
                    onKeyDown: (e) => {
                      if (!clientPhoneValid || pinErrorActive) {
                        setActiveEntry('phone');
                        return;
                      }
                      if (e.key === 'Backspace') {
                        const cur = (pinDigits && pinDigits[i]) || '';
                        if (!cur && i > 0) {
                          e.preventDefault();
                          const arr = (pinDigits || []).slice(0, 4);
                          while (arr.length < 4) arr.push('');
                          arr[i - 1] = '';
                          applyPinDigits(arr, i - 1, '');
                          focusPinInput(i - 1);
                          return;
                        }
                        if (cur) {
                          e.preventDefault();
                          const arr = (pinDigits || []).slice(0, 4);
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
                      if (e.key === 'Enter' && canClientLogin) {
                        handleClientLogin();
                      }
                    },
                    onFocus: () => setActiveEntry(clientPhoneValid ? 'pin' : 'phone'),
                    onClick: () => setActiveEntry(clientPhoneValid ? 'pin' : 'phone'),
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
                          focusPinInput(nextIdx);
                          maybeLoginWithPin(arr);
                        }
                      } catch (_) { }
                    },
                    className: 'heys-auth-pin-input ' + (pinErrorActive ? 'is-error ' : '') + (isPinComplete && !pinErrorActive ? 'is-complete' : isFilled ? 'is-filled' : '') + (i === activePinIndex ? ' is-active' : ''),
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

          React.createElement(
            'div',
            { className: 'heys-auth-keypad', 'aria-label': 'Цифровая клавиатура PIN' },
            [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
              React.createElement(
                'button',
                {
                  key: 'pin_key_' + n,
	                  type: 'button',
	                  className: 'heys-auth-key',
	                  onClick: () => handleKeypadDigit(String(n)),
	                },
                String(n),
              )
            ),
            React.createElement('span', { key: 'pin_key_spacer', className: 'heys-auth-key-spacer', 'aria-hidden': 'true' }),
            React.createElement(
              'button',
              {
                key: 'pin_key_0',
	                type: 'button',
	                className: 'heys-auth-key',
	                onClick: () => handleKeypadDigit('0'),
	              },
              '0',
            ),
            React.createElement(
	              'button',
	              {
	                key: 'pin_key_backspace',
	                type: 'button',
	                className: 'heys-auth-key heys-auth-key--muted',
	                'aria-label': 'Удалить цифру PIN',
	                onClick: handleKeypadBackspace,
	              },
              '⌫',
            ),
          ),

          err && React.createElement('div', { className: 'heys-auth-error' + (pinErrorVisible ? ' is-pin-error' : '') }, err),
          React.createElement(
            'button',
            { type: 'submit', disabled: !canClientLogin, className: 'heys-auth-submit-hidden', tabIndex: -1, 'aria-label': 'Войти' },
          ),
	        ),
	        React.createElement(
	          'div',
	          { className: 'heys-auth-footer-row' },
	          React.createElement(
	            'div',
	            { className: 'heys-auth-support-line' },
	            'Забыли PIN? ',
	            React.createElement(
	              'button',
	              {
	                type: 'button',
	                className: 'heys-auth-support-link',
	                onClick: () => setSupportOpen(true),
	              },
	              'Обратитесь в поддержку.',
	            ),
	          ),
	        ),
	        renderSupportPopup(),
	      ),
        React.createElement(
          'div',
          { className: 'heys-auth-status ' + (busy ? 'is-visible' : ''), role: 'status', 'aria-live': 'polite' },
          React.createElement('span', { className: 'heys-auth-status-dot', 'aria-hidden': 'true' }),
          React.createElement('span', null, 'Проверяем PIN'),
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
            busy ? 'Входим...' : 'Войти →',
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
	      renderServiceEntry(),
	    );
  }

  HEYS.LoginScreen = LoginScreen;
})(typeof window !== 'undefined' ? window : globalThis);
