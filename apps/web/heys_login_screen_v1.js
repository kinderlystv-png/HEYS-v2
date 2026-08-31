// heys_login_screen_v1.js — Единый экран входа (клиент: телефон+PIN, куратор: email+пароль)
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});
  const CANDIDATE_SESSION_HINT_KEY = 'heys_candidate_cookie_session_hint';

  const CLIENT_LOGIN_COPY = Object.freeze({
    title: 'Вход клиента',
    instruction: '',
    explanation: '',
    pinLabel: 'Код доступа',
    supportLead: 'Не помните код? ',
    supportAction: 'Напишите куратору',
  });

  const NEW_DEVICE_LOGIN_COPY = Object.freeze({
    title: 'Новое устройство',
    instruction: 'Мы не узнаём это устройство. Введите свой код — устройство запомнится на 30 дней.',
    pinLabel: 'Код доступа',
    deviceNotice: 'На прежнее устройство ушло уведомление о входе',
    supportLead: 'Не помните код? ',
    supportAction: 'Напишите куратору',
  });

  const TRIAL_INTAKE_LOGIN_COPY = Object.freeze({
    title: 'Вход в анкету',
    instruction: '',
    explanation: 'Это только анкета. Приложение откроется, когда куратор её проверит.',
    pinLabel: 'Код от куратора',
    supportLead: 'Код не пришёл? ',
    supportAction: 'Ответьте на сообщение бота',
  });

  function isTrialIntakeLogin() {
    try {
      if (new URLSearchParams(global.location && global.location.search || '').get('intake') === '1') return true;
    } catch (_) { }

    try {
      if (HEYS.YandexAPI && typeof HEYS.YandexAPI.hasCandidateSessionHint === 'function') {
        return HEYS.YandexAPI.hasCandidateSessionHint() === true;
      }
    } catch (_) { }

    try {
      return global.localStorage && global.localStorage.getItem(CANDIDATE_SESSION_HINT_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function getClientLoginCopy(trialIntakeLogin) {
    return trialIntakeLogin ? TRIAL_INTAKE_LOGIN_COPY : CLIENT_LOGIN_COPY;
  }

  const LOGIN_MAINTENANCE_COPY = Object.freeze({
    title: 'Вход временно закрыт',
    body: 'Идут технические работы. Данные на месте, ничего делать не нужно.',
    // Строка «заглушка на время работ» просит назвать срок. Точный срок знает
    // оператор (login_closed_eta), поэтому по умолчанию говорим, когда зайти
    // снова, а не обещаем, что к этому моменту закончим.
    eta: 'Попробуйте зайти через полчаса.',
  });

  function readLoginMaintenanceFlag() {
    try {
      const boot = global.__HEYS_AUTH_MAINTENANCE;
      if (boot === true) return { closed: true, ...LOGIN_MAINTENANCE_COPY };
      if (boot && typeof boot === 'object' && (boot.closed === true || boot.loginClosed === true)) {
        return {
          closed: true,
          title: boot.title || LOGIN_MAINTENANCE_COPY.title,
          body: boot.body || boot.message || LOGIN_MAINTENANCE_COPY.body,
          eta: boot.eta || LOGIN_MAINTENANCE_COPY.eta,
        };
      }
    } catch (_) { }

    try {
      const params = new URLSearchParams(global.location && global.location.search || '');
      if (params.get('maintenance') === '1') return { closed: true, ...LOGIN_MAINTENANCE_COPY };
    } catch (_) { }

    try {
      if (global.localStorage && global.localStorage.getItem('heys_login_maintenance_preview') === '1') {
        return { closed: true, ...LOGIN_MAINTENANCE_COPY };
      }
    } catch (_) { }

    return null;
  }

  async function resolveLoginMaintenanceFlag() {
    const boot = readLoginMaintenanceFlag();
    if (boot) return boot;

    try {
      const rpc = HEYS.YandexAPI && typeof HEYS.YandexAPI.rpc === 'function'
        ? HEYS.YandexAPI.rpc.bind(HEYS.YandexAPI)
        : null;
      if (!rpc) return null;
      const res = await rpc('get_public_app_status', {});
      if (res?.error) return null;
      const payload = res?.data?.get_public_app_status || res?.data || null;
      if (payload && (payload.login_closed === true || payload.auth_maintenance === true)) {
        return {
          closed: true,
          title: payload.login_closed_title || LOGIN_MAINTENANCE_COPY.title,
          body: payload.login_closed_message || LOGIN_MAINTENANCE_COPY.body,
          eta: payload.login_closed_eta || LOGIN_MAINTENANCE_COPY.eta,
        };
      }
    } catch (_) { }

    return null;
  }

  let cachedAuthLogoHtml = '';
  function captureAuthLogoHtml() {
    if (cachedAuthLogoHtml) return cachedAuthLogoHtml;
    try {
      const existing = global.document && global.document.querySelector('.heys-auth-logo');
      if (existing) cachedAuthLogoHtml = existing.outerHTML;
    } catch (_) { }
    return cachedAuthLogoHtml;
  }
  function getAuthLogoHtml() {
    return captureAuthLogoHtml();
  }
  try {
    if (global.document && global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', captureAuthLogoHtml);
    } else {
      captureAuthLogoHtml();
    }
  } catch (_) { }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Строка контракта «пределы и формат»: телефон — 10 цифр после кода страны,
  // маска «+7 (962) 455-61-11» ставится по мере ввода (скобки у кода города,
  // дефисы в последних четырёх цифрах). Префикс «+7» рисуется отдельным
  // элементом поля, здесь — только тело номера: (XXX) XXX-XX-XX.
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
      onClientSessionReady,
      onCuratorLogin,
      initialMode = 'client',
      initialEmail = '',
      initialPassword = '',
      autoCuratorLogin = false,
      curatorAutologinConfig = null,
    } = props || {};

    const React = global.React;
    const { useEffect, useMemo, useState, useRef } = React;
    const LoginThemePicker = HEYS.LoginThemePicker
      && typeof HEYS.LoginThemePicker.createReactComponent === 'function'
      ? HEYS.LoginThemePicker.createReactComponent(React)
      : null;
    const AccessCodeSetup = HEYS.ClientAccessCodeSetup
      && typeof HEYS.ClientAccessCodeSetup.createReactComponent === 'function'
      ? HEYS.ClientAccessCodeSetup.createReactComponent(React)
      : null;

    const [mode, setMode] = useState(initialMode);

    // client
    const [phoneMasked, setPhoneMasked] = useState('');
    const [pinDigits, setPinDigits] = useState(['', '', '', '']);
    const [activeEntry, setActiveEntry] = useState('phone');
    const [phoneFocused, setPhoneFocused] = useState(false);
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
    const phoneDigitsRef = useRef('');
    const pinDigitsRef = useRef(['', '', '', '']);
    const pinRefs = useRef([]);
    const keypadRef = useRef(null);
    const [themePanelSlotEl, setThemePanelSlotEl] = useState(null);
    const pinHideTimers = useRef([null, null, null, null]);
    const phonePulseTimer = useRef(null);

    // curator — inherit email from HTML gate if user was already typing
    const [email, setEmail] = useState(initialEmail || '');
    const [password, setPassword] = useState(initialPassword || '');

	    const [busy, setBusy] = useState(false);
	    const [err, setErr] = useState('');
	    const [accessSetup, setAccessSetup] = useState(null);
	    const [clientEntryMode, setClientEntryMode] = useState('default');
	    const [supportOpen, setSupportOpen] = useState(false);
	    const [loginMaintenance, setLoginMaintenance] = useState(() => readLoginMaintenanceFlag());
	    // Строка «слова на экране», решение 31 августа: блокировка входа — не строка
	    // ошибки, а состояние экрана. Отказ кода человек видит часто и правит за
	    // секунду; в блокировке он не может ничего, и единственный выход к живому
	    // куратору нельзя набрать тем же кеглем, что «код не подошёл».
	    const [rateBlocked, setRateBlocked] = useState(false);
	    const curatorAutoLoginTriedRef = useRef(false);
    const pinErrorTimers = useRef({ reset: null, clear: null });

    const auth = HEYS.auth;
    const autoCuratorLoginEnabled = autoCuratorLogin === true && curatorAutologinConfig && curatorAutologinConfig.enabled === true;

    // phoneMasked теперь хранит только 10 цифр (без 7)
    // Для валидации и отправки добавляем 7 в начало
    const fullPhone = '7' + phoneMasked;
    const clientPhoneValid = useMemo(
      () => String(phoneMasked || '').replace(/\D/g, '').length === 10,
      [phoneMasked],
    );
    const pin = useMemo(() => (pinDigits || []).join(''), [pinDigits]);
    const clientPinValid = useMemo(() => auth && auth.validatePin(pin), [auth, pin]);

    const canClientLogin = clientPhoneValid && clientPinValid && !busy;
    const canCuratorLogin = Boolean(email && password) && !busy;
    const clientLoginCopy = clientEntryMode === 'new_device'
      ? NEW_DEVICE_LOGIN_COPY
      : getClientLoginCopy(isTrialIntakeLogin());
    const isIntakeLogin = isTrialIntakeLogin() && clientEntryMode !== 'new_device';
    const isNewDeviceLogin = clientEntryMode === 'new_device';
    const loginBlocked = !!(loginMaintenance && loginMaintenance.closed);
    const pinFieldLabel = clientEntryMode === 'new_device'
      ? NEW_DEVICE_LOGIN_COPY.pinLabel
      : (clientLoginCopy.pinLabel || 'Код доступа');
    const intakePinErrorDefault = 'Код не подошёл — проверьте цифры';
    const defaultPinError = isIntakeLogin
      ? intakePinErrorDefault
      : 'Код не подошёл — попробуйте ещё раз';

    useEffect(() => {
      let cancelled = false;
      if (loginMaintenance) return undefined;
      resolveLoginMaintenanceFlag().then((flag) => {
        if (!cancelled && flag) setLoginMaintenance(flag);
      });
      return () => { cancelled = true; };
    }, [loginMaintenance]);

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

    function showInvalidPinFeedback(message = defaultPinError) {
      try {
        const timers = pinErrorTimers.current || {};
        if (timers.reset) clearTimeout(timers.reset);
        if (timers.clear) clearTimeout(timers.clear);
      } catch (_) { }
      setErr(message);
      setPinErrorVisible(true);
      setPinErrorActive(false);
      setActiveEntry('pin');
      // Вибрации на ошибке кода нет: login «вибрации на клавишах кода нет —
      // четыре нажатия подряд превратили бы её в дребезг», а ошибка — не
      // запись в данные и не необратимое действие.
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
      if (!onClientLogin) {
        setErr('Приложение ещё загружается. Попробуйте через несколько секунд.');
        return;
      }
      setErr('');
      setRateBlocked(false);
      setPinErrorVisible(false);
      setPinErrorActive(false);
      setBusy(true);
      try {
        const phoneNorm = '7' + String(phoneDigitsRef.current || '').replace(/\D/g, '').slice(0, 10);
        const effectivePin = typeof pinOverride === 'string' ? pinOverride : pin;
        const res = await onClientLogin({ phone: phoneNorm, pin: effectivePin });
        if (res && res.error === 'needs_access_code_setup') {
          setAccessSetup({
            clientId: res.clientId,
            sessionToken: res.sessionToken,
            phone: phoneNorm,
            skipPepAgreement: res.skipPepAgreement === true,
          });
          return;
        }
        if (!res || res.ok === false) {
          const code = res && res.error;

          // Серверный текст, если сервер объяснил отказ словами.
          const serverMessage = (res && typeof res.serverMessage === 'string')
            ? res.serverMessage.trim()
            : '';

          if (code === 'rate_limited') {
            const sec = Math.ceil((res.retryAfterMs || 0) / 1000);
            // Локальный ограничитель знает, сколько ждать, и выход из него —
            // подождать: это строка ошибки. Серверная блокировка отсчёта не даёт,
            // выход из неё один — куратор, и она разворачивается карточкой.
            if (sec > 0) {
              setErr(`Слишком много попыток. Подождите ${sec}с и попробуйте снова.`);
            } else {
              setRateBlocked(true);
              setErr('');
            }
          } else if (code === 'pin_login_disabled') {
            // контракт login «слово»: в пользовательских текстах только «код», без «PIN»
            setErr(serverMessage || 'Вход по коду временно отключён. Куратор откроет доступ после обновления входа.');
          } else if (code === 'access_code_login_required') {
            setErr(serverMessage || 'Используйте свой код или вход с зарегистрированного устройства.');
          } else if (code === 'access_code_required') {
            setClientEntryMode('new_device');
            setErr(serverMessage || 'Введите свой код от куратора.');
            resetPinToFirstSlot();
          } else if (code === 'invalid_access_code') {
            setErr(
              serverMessage || 'Код не подошёл. Проверьте цифры или попросите куратора выдать новый.'
            );
          } else if (code === 'invalid_device_id') {
            setErr('Не удалось определить устройство. Обновите страницу и попробуйте снова.');
          } else if (code === 'weak_access_code' || code === 'access_code_matches_onetime_pin') {
            setErr('Код слишком простой или совпадает с одноразовым. Придумайте другой.');
          } else if (code === 'needs_access_code_setup') {
            setErr('');
          } else if (code === 'onetime_pin_consumed') {
            setErr(serverMessage || 'Этот код уже использован. Попросите куратора выдать новый.');
          } else if (code === 'onetime_pin_expired') {
            setErr(serverMessage || 'Срок действия кода истёк. Попросите куратора выдать новый.');
          } else if (code === 'invalid_credentials') {
            showInvalidPinFeedback();
          } else if (code === 'session_not_issued') {
            setErr('Код верный, но вход не завершился. Попробуйте ещё раз или напишите куратору.');
          } else if (code === 'network_error') {
            setErr('Нет связи с сервером. Проверьте интернет и попробуйте снова.');
          } else if (code === 'cloud_not_ready') {
            setErr('Сервер не готов. Попробуйте чуть позже.');
          } else if (code === 'api_not_ready') {
            setErr('Приложение ещё загружается. Попробуйте через несколько секунд.');
          } else if (code === 'role_switch_cleanup_failed') {
            setErr('Не получилось переключиться на вход клиента. Обновите страницу и попробуйте снова.');
          } else if (code === 'exception') {
            setErr('Вход сорвался из-за сбоя в приложении. Попробуйте ещё раз или напишите куратору.');
          } else if (code === 'invalid_phone') {
            setErr('Введите телефон в формате +7');
          } else if (code === 'invalid_pin') {
            setErr('Код должен быть из 4 цифр');
            resetPinToFirstSlot();
          } else {
            // Незнакомый серверный код показываем словами сервера. Молча
            // сводить его к «код не подошёл» нельзя: клиент решит, что забыл
            // код, и уйдёт в поддержку с несуществующей проблемой. Технические
            // тексты (сообщения исключений) сюда не попадают — они живут в
            // _debug.
            setErr(serverMessage || 'Не удалось войти');
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

    const Card = (...children) =>
      React.createElement(
        'div',
        {
          className: 'heys-auth-card'
            + (isIntakeLogin ? ' heys-auth-card--intake' : '')
            + (isNewDeviceLogin ? ' heys-auth-card--new-device' : '')
            + (loginBlocked ? ' heys-auth-card--maintenance' : '')
            + (rateBlocked ? ' heys-auth-card--lockout' : ''),
        },
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
	          React.createElement('div', { className: 'heys-auth-support-text' }, 'Если код не подходит или его нужно сбросить, напишите нам или позвоните.'),
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
	          className: 'heys-auth-service-entry',
	          'aria-label': 'Служебный вход',
	          title: 'Служебный вход',
	          onClick: () => {
	            setErr('');
	            armCuratorAutologin();
	            setMode('curator');
	          },
	        },
	        React.createElement('svg', {
	          width: 14,
	          height: 14,
	          viewBox: '0 0 24 24',
	          fill: 'currentColor',
	          'aria-hidden': 'true',
	        }, React.createElement('path', { d: 'M7 14a5 5 0 1 1 4.9-6H21v3h-2v3h-2v-3h-2.1A5 5 0 0 1 7 14zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' })),
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
      );
    }

    function renderClientLogin() {
      // Храним только 10 цифр (без 7)
      const phoneDigits = phoneMasked.replace(/\D/g, '').slice(0, 10);
      phoneDigitsRef.current = phoneDigits;
      pinDigitsRef.current = (pinDigits || []).slice(0, 4);
      while (pinDigitsRef.current.length < 4) pinDigitsRef.current.push('');
      const isPhoneComplete = phoneDigits.length === 10;
      const isPinComplete = (pinDigits || []).every(Boolean);
      const touchKeypad = usesTouchKeypad() && !isNewDeviceLogin;

      // Обработчик ввода телефона
	      const handlePhoneInput = (e) => {
	        setErr('');
	        const input = e.target.value;
        // Извлекаем только цифры из того что ввели
        let rawDigits = input.replace(/\D/g, '');
        // Вставка полного номера (11 цифр с 7/8 в начале) — снимаем код страны,
        // иначе он остаётся и склеивается с '7', добавляемой в fullPhone (152)
        if (rawDigits.length === 11 && (rawDigits[0] === '7' || rawDigits[0] === '8')) {
          rawDigits = rawDigits.slice(1);
        }
        let newDigits = rawDigits.slice(0, 10);
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
	        phoneDigitsRef.current = newDigits;
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
	          const next = phoneDigits.slice(0, -1);
	          phoneDigitsRef.current = next;
	          setPhoneMasked(next);
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
        const isPinValid = (HEYS.auth || auth) && (HEYS.auth || auth).validatePin(nextPin);
        if (phoneDigitsRef.current.length === 10 && isPinValid && !busy) {
          setTimeout(() => handleClientLogin(nextPin), 100);
        }
      };

	      const appendPhoneDigit = (digit) => {
	        if (busy || !/^\d$/.test(String(digit))) return;
	        const current = phoneDigitsRef.current;
	        if (current.length >= 10) {
	          appendPinDigit(digit);
	          return;
	        }
	        const next = (current + String(digit)).slice(0, 10);
	        phoneDigitsRef.current = next;
	        setPhoneMasked(next);
	        setErr('');
	        if (next.length === 10) {
	          pulsePhoneComplete();
	          setActiveEntry('pin');
	          setTimeout(() => focusPinInput(0), 50);
	        } else {
	          setActiveEntry('phone');
	        }
      };

      const erasePhoneDigit = () => {
        if (busy) return;
        const current = phoneDigitsRef.current;
        if (current.length <= 0) return;
        const next = current.slice(0, -1);
        phoneDigitsRef.current = next;
        setPhoneMasked(next);
        setErr('');
        setActiveEntry('phone');
        try { if (phoneInputRef.current && !usesTouchKeypad()) phoneInputRef.current.focus(); } catch (_) { }
      };

      const appendPinDigit = (digit) => {
        if (phoneDigitsRef.current.length !== 10 && !isNewDeviceLogin) {
          appendPhoneDigit(digit);
          return;
        }
        if (pinErrorActive) return;
        if (busy || !/^\d$/.test(String(digit))) return;
        setActiveEntry('pin');
        const list = pinDigitsRef.current.slice(0, 4);
        while (list.length < 4) list.push('');
        if (list.every(Boolean)) return;
        const idx = getNextPinIndex(list);
        const arr = list.slice();
        arr[idx] = String(digit);
        pinDigitsRef.current = arr;
        setPinDigits(arr);
        setErr('');
        showPinOverlayDigit(idx, String(digit), 1200);
        if (idx < 3) focusPinInput(idx + 1);
        maybeLoginWithPin(arr);
      };

      const erasePinDigit = () => {
        if (busy) return;
        if (pinErrorActive) return;
        setActiveEntry('pin');
        const list = pinDigitsRef.current.slice(0, 4);
        while (list.length < 4) list.push('');
        let eraseIndex = -1;
        for (let i = 3; i >= 0; i--) {
          if (list[i]) {
            const next = list.slice();
            next[i] = '';
            eraseIndex = i;
            pinDigitsRef.current = next;
            setPinDigits(next);
            break;
          }
        }
        if (eraseIndex >= 0) {
          clearHidePinDigit(eraseIndex);
          focusPinInput(eraseIndex);
          return;
        }
        if (phoneDigitsRef.current.length === 10) {
          const nextPhone = phoneDigitsRef.current.slice(0, -1);
          phoneDigitsRef.current = nextPhone;
          setPhoneMasked(nextPhone);
          setActiveEntry('phone');
        }
      };

      const handleKeypadDigit = (digit) => {
        if (loginBlocked) return;
        if (isNewDeviceLogin) {
          appendPinDigit(digit);
          return;
        }
        if (phoneDigitsRef.current.length < 10) appendPhoneDigit(digit);
        else appendPinDigit(digit);
      };

      const handleKeypadBackspace = () => {
        if (loginBlocked) return;
        if (isNewDeviceLogin) {
          erasePinDigit();
          return;
        }
        if (phoneDigitsRef.current.length < 10) erasePhoneDigit();
        else erasePinDigit();
      };

      const activePinIndex = activeEntry === 'pin' && !isPinComplete ? getNextPinIndex(pinDigits) : -1;
      const canEraseKeypadDigit = !busy
        && !pinErrorActive
        && (phoneDigits.length > 0 || (pinDigits || []).some(Boolean));

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'heys-auth-shell-client' },
          React.createElement(
            'div',
            { className: 'heys-auth-shell-stage' },
            Card(
	          // Заголовок
	        React.createElement(
	          'div',
	          { className: 'heys-auth-heading text-center' },
	          React.createElement(
	            'div',
	            { className: 'heys-auth-mark', 'aria-label': 'HEYS lab', dangerouslySetInnerHTML: { __html: getAuthLogoHtml() } },
	          ),
	          React.createElement('div', { className: 'heys-auth-title' }, clientLoginCopy.title),
	          clientLoginCopy.instruction && React.createElement(
	            'div',
	            { className: 'heys-auth-subtitle' },
	            clientLoginCopy.instruction,
	          ),
	        ),

        // Форма
        React.createElement('form', {
          className: 'space-y-6',
          onSubmit: (e) => {
            e.preventDefault();
            if (canClientLogin && !loginBlocked) handleClientLogin();
          },
        },
          !isNewDeviceLogin && React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'heys-auth-label' }, 'Телефон'),
            React.createElement('div', {
              className: 'heys-auth-field ' + (isPhoneComplete ? 'is-complete' : '') + (activeEntry === 'phone' && !isPhoneComplete && (phoneFocused || phoneDigits.length > 0) ? ' is-active' : '') + (phoneConfirmPulse ? ' is-confirm-pulse' : '')
            },
              React.createElement('span', {
                className: 'phone-prefix-large heys-auth-prefix'
              }, '+7'),
              React.createElement('input', {
                ref: phoneInputRef,
                id: 'heys-client-phone',
                name: 'phone',
                type: 'tel',
                inputMode: 'numeric',
                autoComplete: 'tel',
                autoFocus: false,
                // Строка «клавиатура»: телефон — обычное поле с системной
                // клавиатурой. readOnly на touch её не открывал, и ввод был
                // возможен только через свою клавиатуру.
                readOnly: loginBlocked,
                placeholder: '(999) 123-45-67',
                value: formatPhoneBody(phoneDigits),
                onChange: handlePhoneInput,
                onKeyDown: handlePhoneKeyDown,
                onFocus: () => { setPhoneFocused(true); setActiveEntry('phone'); },
                onBlur: () => setPhoneFocused(false),
                onClick: () => setActiveEntry('phone'),
                className: 'phone-input-large heys-auth-phone-input',
              }),
            ),
          ),

          isNewDeviceLogin && NEW_DEVICE_LOGIN_COPY.instruction
            ? React.createElement('div', { className: 'heys-auth-subtitle text-center' }, NEW_DEVICE_LOGIN_COPY.instruction)
            : null,

          isNewDeviceLogin && NEW_DEVICE_LOGIN_COPY.deviceNotice
            ? React.createElement('div', { className: 'heys-auth-notice' },
              React.createElement('div', { className: 'heys-auth-notice-title' }, 'На прежнее устройство ушло уведомление о входе'),
            )
            : null,

          // PIN ввод — 4 отдельных поля (как в модных приложениях)
	          React.createElement('div', { className: 'heys-auth-pin-section space-y-3 ' + ((!clientPhoneValid && !isNewDeviceLogin) ? 'is-muted ' : '') + (activeEntry === 'pin' ? 'is-active' : '') },
	            React.createElement('div', { className: 'heys-auth-label' }, pinFieldLabel),
            // Строка «доступность»: боксы кода — одно поле для скринридера
            // с подписью «<подпись поля>, N из 4»; раньше это были четыре
            // безымянных input подряд.
            React.createElement('div', {
              className: 'heys-auth-pin-grid',
              role: 'group',
              'aria-label': pinFieldLabel,
            },
	              [0, 1, 2, 3].map((i) => {
	                const digit = (pinDigits && pinDigits[i]) || '';
	                const isFilled = Boolean(digit);
	                const overlay = (pinOverlay && pinOverlay[i]) || { d: '', k: 0 };
	                const pinInputStyle = { WebkitTextSecurity: 'none', color: 'transparent', caretColor: 'transparent' };
	                return React.createElement('div', {
	                  key: 'pin_wrap_' + i,
	                  className: 'heys-auth-pin-box'
	                    + (pinErrorActive ? ' is-error' : '')
	                    + (isPinComplete && !pinErrorActive ? ' is-complete' : isFilled ? ' is-filled' : '')
	                    + (i === activePinIndex ? ' is-active' : ''),
	                },
	                  React.createElement('input', {
	                    key: 'pin_' + i,
	                    ref: (el) => { pinRefs.current[i] = el; },
	                    id: 'heys-client-pin-' + (i + 1),
	                    name: 'pin-' + (i + 1),
	                    'aria-label': pinFieldLabel + ', ' + (i + 1) + ' из 4',
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
                      if ((!clientPhoneValid && !isNewDeviceLogin) || pinErrorActive) {
                        setActiveEntry('phone');
                        return;
                      }
                      setErr('');
                      const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 1);
                      const existing = (pinDigits && pinDigits[i]) || '';
                      if (!v && existing) return;
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
                      if ((!clientPhoneValid && !isNewDeviceLogin) || pinErrorActive) {
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
                    onFocus: () => setActiveEntry((clientPhoneValid || isNewDeviceLogin) ? 'pin' : 'phone'),
                    onClick: () => setActiveEntry((clientPhoneValid || isNewDeviceLogin) ? 'pin' : 'phone'),
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
                        // Строка «доступность»: точки в боксах декоративны.
                        'aria-hidden': 'true',
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

          // Карточка блокировки стоит на месте строки ошибки — над клавиатурой,
          // внутри того же экрана: отдельный экран человек не сможет покинуть, а
          // куратор снимет блокировку, пока он смотрит на этот же кадр.
          rateBlocked && React.createElement(
            'div',
            { className: 'heys-auth-lockout', role: 'alert' },
            React.createElement('div', { className: 'heys-auth-lockout__title' }, 'Слишком много попыток входа'),
            React.createElement('div', { className: 'heys-auth-lockout__body' }, 'Напишите куратору — он снимет блокировку.'),
          ),

          loginBlocked && React.createElement(
            'div',
            { className: 'heys-auth-maintenance-block', role: 'status' },
            React.createElement('div', { className: 'heys-auth-maintenance-block__title' }, loginMaintenance.title || LOGIN_MAINTENANCE_COPY.title),
            React.createElement('div', { className: 'heys-auth-maintenance-block__body' }, loginMaintenance.body || LOGIN_MAINTENANCE_COPY.body),
            // Строка «заглушка на время работ»: срок отдельной строкой.
            React.createElement('div', { className: 'heys-auth-maintenance-block__eta' }, loginMaintenance.eta || LOGIN_MAINTENANCE_COPY.eta),
          ),

          React.createElement(
            'div',
            {
              className: 'heys-auth-error heys-auth-error-slot' + (pinErrorVisible ? ' is-pin-error' : ''),
              role: 'alert',
              'aria-live': 'polite',
            },
            err || null,
          ),

          // Строка «блокировка»: клавиатура остаётся на экране и гаснет до 22 %
          // (.heys-auth-shell--maintenance). Прежде её не рендерили вовсе —
          // карточка схлопывалась, и плашка оказывалась в пустоте.
          !isNewDeviceLogin && React.createElement(
            'div',
            { className: 'heys-auth-keypad', ref: keypadRef, 'aria-label': 'Цифровая клавиатура кода' },
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
	                className: 'heys-auth-key heys-auth-key--muted heys-auth-key--delete' + (canEraseKeypadDigit ? ' is-available' : ''),
	                disabled: !canEraseKeypadDigit,
	                'aria-label': 'Удалить цифру кода',
	                onClick: handleKeypadBackspace,
	              },
              '⌫',
            ),
          ),

          !loginBlocked && isNewDeviceLogin
            ? React.createElement('div', { className: 'heys-auth-pin-spacer', 'aria-hidden': 'true' })
            : null,

          !isIntakeLogin && React.createElement('div', {
            className: 'heys-auth-theme-panel-slot',
            ref: setThemePanelSlotEl,
          }),

          React.createElement(
            'button',
            { type: 'submit', disabled: !canClientLogin, className: 'heys-auth-submit-hidden', tabIndex: -1, 'aria-label': 'Войти' },
          ),
	        ),
	        !isIntakeLogin && clientLoginCopy.explanation && React.createElement(
	          'div',
	          { className: 'heys-auth-intake-note' },
	          clientLoginCopy.explanation,
	        ),
	        !isIntakeLogin && React.createElement(
	          'div',
	          { className: 'heys-auth-footer-row' },
	          React.createElement(
	            'div',
	            { className: 'heys-auth-support-line' },
	            clientLoginCopy.supportLead,
	            React.createElement(
	              'button',
	              {
	                type: 'button',
	                className: 'heys-auth-support-link',
	                onClick: () => setSupportOpen(true),
	              },
	              clientLoginCopy.supportAction || 'Напишите куратору',
	            ),
	          ),
	        ),
	        isIntakeLogin && React.createElement(
	          'div',
	          { className: 'heys-auth-intake-dock' },
	          React.createElement(
	            'div',
	            { className: 'heys-auth-intake-note' },
	            clientLoginCopy.explanation,
	          ),
	          React.createElement(
	            'div',
	            { className: 'heys-auth-footer-row' },
	            React.createElement(
	              'div',
	              { className: 'heys-auth-support-line' },
	              clientLoginCopy.supportLead,
	              React.createElement(
	                'button',
	                {
	                  type: 'button',
	                  className: 'heys-auth-support-link',
	                  onClick: () => setSupportOpen(true),
	                },
	                clientLoginCopy.supportAction || 'Ответьте на сообщение бота',
	              ),
	            ),
	          ),
	        ),
	        renderSupportPopup(),
	      ),
          ),
        ),
        !isIntakeLogin && LoginThemePicker
          ? React.createElement(
            'div',
            { className: 'heys-auth-shell-dock' },
            React.createElement(LoginThemePicker, {
              keypadRef,
              phoneInputRef,
              panelSlotEl: themePanelSlotEl,
              dockLayout: true,
              dimmed: pinErrorVisible || loginBlocked,
              scope: 'login',
            }),
          )
          : null,
        React.createElement(
          'div',
          { className: 'heys-auth-status ' + (busy ? 'is-visible' : ''), role: 'status', 'aria-live': 'polite' },
          React.createElement('span', { className: 'heys-auth-status-dot', 'aria-hidden': 'true' }),
          React.createElement('span', null, 'Проверяем код'),
        ),
      );
    }

    function renderCuratorLogin() {
      return Card(
        React.createElement(
          'div',
          { className: 'heys-auth-heading' },
          React.createElement('div', {
            className: 'heys-auth-mark',
            'aria-label': 'HEYS lab',
            dangerouslySetInnerHTML: { __html: getAuthLogoHtml() },
          }),
          React.createElement('div', { className: 'heys-auth-title' }, 'Вход куратора'),
          React.createElement('div', { className: 'heys-auth-subtitle' }, 'Служебный доступ. Клиенты входят по телефону и коду.'),
        ),
        React.createElement(
          'form',
          {
            className: 'space-y-6',
            style: { width: '100%' },
            onSubmit: (e) => {
              e.preventDefault();
              if (canCuratorLogin) handleCuratorLogin();
            },
          },
          React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'heys-auth-label' }, 'Почта'),
            Input({
              type: 'email',
              name: 'email',
              autoComplete: 'email',
              placeholder: 'Почта',
              value: email,
              onChange: (e) => { setErr(''); setEmail(e.target.value); },
            }),
          ),
          React.createElement('div', { className: 'space-y-3' },
            React.createElement('div', { className: 'heys-auth-label' }, 'Пароль'),
            Input({
              type: 'password',
              name: 'password',
              autoComplete: 'current-password',
              placeholder: 'Пароль',
              value: password,
              onChange: (e) => { setErr(''); setPassword(e.target.value); },
            }),
          ),
          React.createElement('div', { className: 'heys-auth-error heys-auth-error-slot' + (err ? ' is-pin-error' : '') }, err || ''),
          PrimaryBtn(
            { type: 'submit', disabled: !canCuratorLogin },
            busy ? 'Входим...' : 'Войти',
          ),
        ),
        React.createElement(
          'div',
          { className: 'heys-auth-footer-row' },
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
            'Вернуться ко входу клиента',
          ),
        ),
      );
    }

    return React.createElement(
      'div',
      {
        className: 'heys-auth-shell z-[9999] flex flex-col items-center'
          + (mode === 'curator' ? ' heys-auth-shell--curator' : '')
          + (isIntakeLogin ? ' heys-auth-shell--intake' : '')
          + (isNewDeviceLogin ? ' heys-auth-shell--new-device' : '')
          + (loginBlocked ? ' heys-auth-shell--maintenance' : '')
          + (rateBlocked ? ' heys-auth-shell--lockout' : '')
          // Строка «полка»: экран создания кода отдаёт низ закреплённой полке.
          + (accessSetup && AccessCodeSetup ? ' heys-auth-shell--pep' : ''),
      },
      accessSetup && AccessCodeSetup
        ? React.createElement(AccessCodeSetup, {
          phone: accessSetup.phone,
          clientId: accessSetup.clientId,
          sessionToken: accessSetup.sessionToken,
          skipPepAgreement: accessSetup.skipPepAgreement,
          onCancel: () => setAccessSetup(null),
          onComplete: async (res) => {
            setBusy(true);
            try {
              if (onClientSessionReady) {
                await onClientSessionReady({
                  clientId: res.clientId,
                  phone: accessSetup.phone,
                });
              }
              setAccessSetup(null);
            } finally {
              setBusy(false);
            }
          },
        })
        : mode === 'start'
        ? renderStart()
        : mode === 'client'
          ? renderClientLogin()
          : renderCuratorLogin(),
	      renderServiceEntry(),
	    );
  }

  LoginScreen.isTrialIntakeLogin = isTrialIntakeLogin;
  LoginScreen.getClientLoginCopy = getClientLoginCopy;
  LoginScreen.getNewDeviceLoginCopy = () => NEW_DEVICE_LOGIN_COPY;
  LoginScreen.formatPhoneBody = formatPhoneBody;
  LoginScreen.getAuthLogoHtml = getAuthLogoHtml;
  LoginScreen.readLoginMaintenanceFlag = readLoginMaintenanceFlag;
  LoginScreen.resolveLoginMaintenanceFlag = resolveLoginMaintenanceFlag;
  HEYS.LoginScreen = LoginScreen;
})(typeof window !== 'undefined' ? window : globalThis);
