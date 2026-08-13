// heys_client_access_code_setup_v1.js — первый вход: код доступа + соглашение ПЭП
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  const PEP_DOC_URL = '/docs/v1.1/pep-agreement.md';

  function createAccessCodeSetupComponent(React) {
    const { useMemo, useState } = React;

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
      const [phase, setPhase] = useState('code');
      const [pepAccepted, setPepAccepted] = useState(false);
      const [err, setErr] = useState('');
      const [busy, setBusy] = useState(false);

      const code = useMemo(() => codeDigits.join(''), [codeDigits]);
      const confirm = useMemo(() => confirmDigits.join(''), [confirmDigits]);
      const codeValid = auth && auth.validatePinStrict(code);
      const confirmValid = auth && auth.validatePinStrict(confirm) && code === confirm;
      const canContinue = phase === 'code'
        ? codeValid
        : confirmValid && (skipPepAgreement || pepAccepted);

      function renderDigitRow(digits, setDigits, label) {
        return React.createElement(
          'div',
          { className: 'heys-auth-pin-section space-y-3 is-active' },
          React.createElement('div', { className: 'heys-auth-label text-base' }, label),
          React.createElement(
            'div',
            { className: 'heys-auth-pin-grid' },
            [0, 1, 2, 3].map((i) => React.createElement('input', {
              key: 'ac_' + label + '_' + i,
              type: 'tel',
              inputMode: 'numeric',
              maxLength: 1,
              autoComplete: 'off',
              className: 'heys-auth-pin-box input text-center',
              value: digits[i] || '',
              onChange: (e) => {
                const d = String(e.target.value || '').replace(/\D/g, '').slice(-1);
                setDigits((prev) => {
                  const next = prev.slice();
                  next[i] = d;
                  return next;
                });
                setErr('');
                if (d && i < 3) {
                  try { e.target.parentElement && e.target.parentElement.nextElementSibling?.querySelector('input')?.focus(); } catch (_) { }
                }
              },
            })),
          ),
        );
      }

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
        phase === 'code'
          ? renderDigitRow(codeDigits, setCodeDigits, 'Придумайте код доступа')
          : renderDigitRow(confirmDigits, setConfirmDigits, 'Повторите код'),
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
        err && React.createElement('div', { className: 'heys-auth-error mt-3' }, err),
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
