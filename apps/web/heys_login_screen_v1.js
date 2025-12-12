// heys_login_screen_v1.js — Единый экран входа (клиент: телефон+PIN, куратор: email+пароль)
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function maskPhone(raw) {
    // оставляем только цифры
    const digits = String(raw || '').replace(/\D/g, '');
    // будем маскировать как +7 (___) ___-__-__
    // поддерживаем ввод: 7XXXXXXXXXX / 8XXXXXXXXXX / XXXXXXXXXX
    let d = digits;
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;

    // отображаем только 11 цифр максимум
    d = d.slice(0, 11);

    const p = d.padEnd(11, '_');
    const a = p.slice(1, 4);
    const b = p.slice(4, 7);
    const c = p.slice(7, 9);
    const e = p.slice(9, 11);

    return `+7 (${a}) ${b}-${c}-${e}`;
  }

  function unmaskPhone(masked) {
    return String(masked || '').replace(/\D/g, '');
  }

  function LoginScreen(props) {
    const {
      onClientLogin,
      onCuratorLogin,
      initialMode = 'start',
    } = props || {};

    const React = global.React;
    const { useMemo, useState } = React;

    const [mode, setMode] = useState(initialMode);

    // client
    const [phoneMasked, setPhoneMasked] = useState('');
    const [pin, setPin] = useState('');

    // curator
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [clientDiag, setClientDiag] = useState(null);

    const auth = HEYS.auth;

    const clientPhoneValid = useMemo(() => auth && auth.isValidPhone(phoneMasked), [auth, phoneMasked]);
    const clientPinValid = useMemo(() => auth && auth.validatePin(pin), [auth, pin]);

    const canClientLogin = clientPhoneValid && clientPinValid && !busy;
    const canCuratorLogin = Boolean(email && password) && !busy;

    async function handleClientLogin() {
      if (!onClientLogin) return;
      setErr('');
      setClientDiag(null);
      setBusy(true);
      try {
        const phoneDigits = unmaskPhone(phoneMasked);
        const res = await onClientLogin({ phone: phoneDigits, pin });
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
      return Card(
        React.createElement(
          'div',
          { className: 'text-center' },
          React.createElement('div', { className: 'mb-2 text-4xl' }, '📱'),
          React.createElement('div', { className: 'text-xl font-bold text-slate-900' }, 'Вход по телефону'),
          React.createElement('div', { className: 'mt-1 text-sm text-slate-500' }, 'Введите телефон и 4-значный PIN'),
        ),
        React.createElement('div', { className: 'mt-5 space-y-3' },
          Input({
            type: 'text',
            inputMode: 'tel',
            autoComplete: 'tel',
            placeholder: '+7 (___) ___-__-__',
            value: phoneMasked,
            onChange: (e) => {
              setErr('');
              setPhoneMasked(maskPhone(e.target.value));
            },
          }),
          Input({
            type: 'password',
            inputMode: 'numeric',
            autoComplete: 'one-time-code',
            placeholder: 'PIN (4 цифры)',
            value: pin,
            onChange: (e) => {
              setErr('');
              const v = String(e.target.value || '').replace(/\D/g, '').slice(0, 4);
              setPin(v);
            },
            onKeyDown: (e) => e.key === 'Enter' && canClientLogin && handleClientLogin(),
          }),
          err && React.createElement('div', { className: 'rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-600' }, err),
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
          { className: 'mt-5 space-y-2 text-center text-sm text-slate-500' },
          React.createElement(
            'div',
            null,
            'Нет PIN? Попросите телефон+PIN у куратора.',
          ),
          React.createElement(
            'button',
            { className: 'text-indigo-600 hover:underline', onClick: () => { setErr(''); setMode('start'); } },
            '← Назад',
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
          'fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-700 px-5 py-10',
      },
      mode === 'start'
        ? renderStart()
        : mode === 'client'
          ? renderClientLogin()
          : renderCuratorLogin(),
    );
  }

  HEYS.LoginScreen = LoginScreen;
})(typeof window !== 'undefined' ? window : globalThis);
