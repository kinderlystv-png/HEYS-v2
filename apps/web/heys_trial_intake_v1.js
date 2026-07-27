// heys_trial_intake_v1.js — protected, authenticated trial-candidate intake
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  if (!React) return;

  const EMPTY_ANSWERS = {
    goals: {},
    experience: {},
    lifestyle: {},
    collaboration: {},
    health: {},
    safety: {},
    meta: { schema_version: '1.0' },
  };

  const STATUS_COPY = {
    completed: {
      title: 'Анкета отправлена',
      text: 'Куратор внимательно изучит ответы и свяжется с вами в выбранном мессенджере.',
    },
    approved: {
      title: 'Анкета рассмотрена',
      text: 'Куратор подтвердит дату начала пробной недели отдельным сообщением.',
    },
    rejected: {
      title: 'Решение по заявке принято',
      text: 'Сейчас мы не сможем предложить пробную неделю. Это решение относится только к текущему формату сопровождения.',
    },
  };

  const shellStyle = {
    minHeight: '100vh', background: '#f6f7f5', padding: '24px 16px 48px',
    boxSizing: 'border-box', color: '#17202a', fontFamily: 'inherit',
  };
  const cardStyle = {
    maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 24,
    border: '1px solid #e6e9e5', boxShadow: '0 18px 50px rgba(24, 39, 30, 0.08)',
    padding: 'clamp(20px, 5vw, 38px)', boxSizing: 'border-box',
  };
  const inputStyle = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #cfd6d0',
    borderRadius: 12, padding: '12px 14px', fontSize: 16, lineHeight: 1.45,
    color: '#17202a', background: '#fff', outline: 'none',
  };
  const labelStyle = { display: 'grid', gap: 7, fontSize: 14, fontWeight: 650, color: '#25332a' };
  const hintStyle = { fontSize: 13, lineHeight: 1.45, color: '#657168', fontWeight: 400 };

  function unwrapRpc(res, fn) {
    if (res?.error) return { success: false, error: res.error?.code || res.error, message: res.error?.message };
    return res?.data?.[fn] || res?.data || res || {};
  }

  const api = {
    async get() {
      if (!HEYS.YandexAPI?.rpc) return { success: false, error: 'api_not_ready' };
      return unwrapRpc(await HEYS.YandexAPI.rpc('get_trial_intake_by_session', {}), 'get_trial_intake_by_session');
    },
    async save(answers, currentStep, complete) {
      if (!HEYS.YandexAPI?.rpc) return { success: false, error: 'api_not_ready' };
      return unwrapRpc(await HEYS.YandexAPI.rpc('save_trial_intake_by_session', {
        p_answers: answers,
        p_current_step: currentStep,
        p_complete: !!complete,
      }), 'save_trial_intake_by_session');
    },
  };

  function shouldOpen() {
    try {
      return new URLSearchParams(global.location?.search || '').get('intake') === '1';
    } catch (_) {
      return false;
    }
  }

  function leaveIntake() {
    try {
      const url = new URL(global.location.href);
      url.searchParams.delete('intake');
      global.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      global.location.reload();
    } catch (_) {
      global.location.href = '/';
    }
  }

  function mergeAnswers(serverAnswers) {
    const source = serverAnswers && typeof serverAnswers === 'object' ? serverAnswers : {};
    return Object.keys(EMPTY_ANSWERS).reduce((acc, key) => {
      acc[key] = { ...EMPTY_ANSWERS[key], ...(source[key] || {}) };
      return acc;
    }, {});
  }

  function Field({ label, hint, value, onChange, textarea = false, required = false, placeholder = '', type = 'text' }) {
    const controlProps = {
      value: value || '',
      onChange: (event) => onChange(event.target.value),
      placeholder,
      required,
      style: { ...inputStyle, minHeight: textarea ? 104 : undefined, resize: textarea ? 'vertical' : undefined },
    };
    return React.createElement('label', { style: labelStyle },
      React.createElement('span', null, label, required ? ' *' : ''),
      hint ? React.createElement('span', { style: hintStyle }, hint) : null,
      textarea
        ? React.createElement('textarea', controlProps)
        : React.createElement('input', { ...controlProps, type })
    );
  }

  function SelectField({ label, hint, value, onChange, options, required = false }) {
    return React.createElement('label', { style: labelStyle },
      React.createElement('span', null, label, required ? ' *' : ''),
      hint ? React.createElement('span', { style: hintStyle }, hint) : null,
      React.createElement('select', {
        value: value || '', onChange: (event) => onChange(event.target.value),
        required, style: inputStyle,
      }, [
        React.createElement('option', { key: 'empty', value: '' }, 'Выберите вариант'),
        ...options.map(([optionValue, optionLabel]) => React.createElement('option', {
          key: optionValue, value: optionValue,
        }, optionLabel)),
      ])
    );
  }

  function CheckField({ label, checked, onChange }) {
    return React.createElement('label', {
      style: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.4, color: '#334039' },
    },
      React.createElement('input', {
        type: 'checkbox', checked: !!checked,
        onChange: (event) => onChange(event.target.checked),
        style: { width: 18, height: 18, marginTop: 1, accentColor: '#1d70b7', flexShrink: 0 },
      }),
      React.createElement('span', null, label)
    );
  }

  const STEPS = [
    {
      id: 'goals', title: 'Цели и ожидания',
      subtitle: 'Опишите желаемый результат своими словами — здесь нет правильных ответов.',
      required: ['primary_goal', 'success_definition'],
      render: (value, set) => [
        React.createElement(Field, { key: 'primary_goal', label: 'Главная цель', required: true, textarea: true,
          placeholder: 'Что вы хотите изменить и почему это важно сейчас?', value: value.primary_goal,
          onChange: (next) => set('primary_goal', next) }),
        React.createElement(Field, { key: 'success_definition', label: 'Как вы поймёте, что сопровождение помогает?', required: true, textarea: true,
          placeholder: 'Какие изменения будут для вас значимыми?', value: value.success_definition,
          onChange: (next) => set('success_definition', next) }),
        React.createElement(Field, { key: 'time_expectations', label: 'Есть ли желаемый срок?', hint: 'Если срока нет, так и напишите.',
          value: value.time_expectations, onChange: (next) => set('time_expectations', next) }),
      ],
    },
    {
      id: 'experience', title: 'Предыдущий опыт',
      subtitle: 'Это помогает не повторять то, что уже не подошло.',
      required: ['previous_experience'],
      render: (value, set) => [
        React.createElement(SelectField, { key: 'previous_experience', label: 'Был ли опыт изменения питания или образа жизни?', required: true,
          value: value.previous_experience, onChange: (next) => set('previous_experience', next),
          options: [['none', 'Нет, начинаю впервые'], ['self', 'Да, самостоятельно'], ['specialist', 'Да, со специалистом'], ['both', 'Оба варианта']] }),
        React.createElement(Field, { key: 'what_worked', label: 'Что раньше работало хорошо?', textarea: true,
          value: value.what_worked, onChange: (next) => set('what_worked', next) }),
        React.createElement(Field, { key: 'what_did_not_work', label: 'Что не подошло или оказалось трудно поддерживать?', textarea: true,
          value: value.what_did_not_work, onChange: (next) => set('what_did_not_work', next) }),
      ],
    },
    {
      id: 'lifestyle', title: 'Ритм жизни',
      subtitle: 'Нам нужен реальный контекст, а не идеальная неделя.',
      required: ['schedule', 'sleep'],
      render: (value, set) => [
        React.createElement(Field, { key: 'schedule', label: 'Как обычно устроен ваш день?', required: true, textarea: true,
          placeholder: 'Работа, учёба, дорога, семья, смены', value: value.schedule,
          onChange: (next) => set('schedule', next) }),
        React.createElement(Field, { key: 'sleep', label: 'Сон и восстановление', required: true,
          placeholder: 'Сколько обычно спите, легко ли восстанавливаетесь?', value: value.sleep,
          onChange: (next) => set('sleep', next) }),
        React.createElement(Field, { key: 'activity', label: 'Движение и тренировки', textarea: true,
          value: value.activity, onChange: (next) => set('activity', next) }),
        React.createElement(Field, { key: 'constraints', label: 'Что может мешать регулярно вести дневник?', textarea: true,
          value: value.constraints, onChange: (next) => set('constraints', next) }),
      ],
    },
    {
      id: 'collaboration', title: 'Формат совместной работы',
      subtitle: 'Пробная неделя требует коротких регулярных записей и спокойной обратной связи.',
      required: ['daily_tracking', 'feedback_style'],
      render: (value, set) => [
        React.createElement(SelectField, { key: 'daily_tracking', label: 'Готовы вести дневник каждый день в течение недели?', required: true,
          value: value.daily_tracking, onChange: (next) => set('daily_tracking', next),
          options: [['yes', 'Да'], ['mostly', 'Скорее да, но возможны пропуски'], ['no', 'Нет']] }),
        React.createElement(SelectField, { key: 'feedback_style', label: 'Какая обратная связь вам полезнее?', required: true,
          value: value.feedback_style, onChange: (next) => set('feedback_style', next),
          options: [['concise', 'Коротко и по делу'], ['detailed', 'Подробно с объяснениями'], ['gentle', 'Мягко и постепенно'], ['direct', 'Прямо и требовательно']] }),
        React.createElement(Field, { key: 'expectations_from_curator', label: 'Чего вы ждёте от куратора?', textarea: true,
          value: value.expectations_from_curator, onChange: (next) => set('expectations_from_curator', next) }),
      ],
    },
    {
      id: 'health', title: 'Здоровье и ограничения',
      subtitle: 'Эти сведения нужны только для оценки безопасности и границ сопровождения. HEYS не ставит диагнозы и не заменяет врача.',
      required: ['doctor_restrictions'],
      render: (value, set) => [
        React.createElement(Field, { key: 'chronic_conditions', label: 'Хронические состояния или диагнозы, которые важно учитывать', textarea: true,
          hint: 'Если нет — напишите «нет».', value: value.chronic_conditions,
          onChange: (next) => set('chronic_conditions', next) }),
        React.createElement(Field, { key: 'medications', label: 'Лекарства и добавки, влияющие на питание, аппетит или нагрузку', textarea: true,
          hint: 'Если нет — напишите «нет». Не отменяйте назначения врача.', value: value.medications,
          onChange: (next) => set('medications', next) }),
        React.createElement(Field, { key: 'injuries_operations', label: 'Травмы, операции и ограничения по нагрузке', textarea: true,
          value: value.injuries_operations, onChange: (next) => set('injuries_operations', next) }),
        React.createElement(Field, { key: 'allergies', label: 'Аллергии и непереносимости', textarea: true,
          value: value.allergies, onChange: (next) => set('allergies', next) }),
        React.createElement(SelectField, { key: 'pregnancy_lactation', label: 'Беременность или грудное вскармливание',
          value: value.pregnancy_lactation, onChange: (next) => set('pregnancy_lactation', next),
          options: [['no', 'Нет'], ['pregnancy', 'Беременность'], ['lactation', 'Грудное вскармливание'], ['not_applicable', 'Не применимо'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(SelectField, { key: 'eating_disorder_history', label: 'Был ли опыт расстройства пищевого поведения?',
          value: value.eating_disorder_history, onChange: (next) => set('eating_disorder_history', next),
          options: [['no', 'Нет'], ['past', 'Да, в прошлом'], ['current', 'Да, сейчас'], ['unsure', 'Затрудняюсь ответить'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(Field, { key: 'doctor_restrictions', label: 'Есть ли рекомендации или ограничения от врача?', required: true, textarea: true,
          hint: 'Если нет — напишите «нет».', value: value.doctor_restrictions,
          onChange: (next) => set('doctor_restrictions', next) }),
      ],
    },
    {
      id: 'safety', title: 'Проверка безопасности',
      subtitle: 'Отметки не означают автоматический отказ. Куратор изучит контекст вручную и при необходимости задаст вопросы.',
      required: [],
      render: (value, set) => [
        React.createElement(CheckField, { key: 'acute_symptoms', label: 'Сейчас есть острые симптомы или резкое ухудшение самочувствия', checked: value.acute_symptoms, onChange: (next) => set('acute_symptoms', next) }),
        React.createElement(CheckField, { key: 'recent_surgery', label: 'Недавно была операция, травма или госпитализация', checked: value.recent_surgery, onChange: (next) => set('recent_surgery', next) }),
        React.createElement(CheckField, { key: 'active_ed_concern', label: 'Есть выраженные трудности с пищевым поведением, которые сейчас требуют помощи специалиста', checked: value.active_ed_concern, onChange: (next) => set('active_ed_concern', next) }),
        React.createElement(CheckField, { key: 'medical_supervision', label: 'Наблюдаюсь у врача по состоянию, которое может влиять на питание или нагрузку', checked: value.medical_supervision, onChange: (next) => set('medical_supervision', next) }),
        React.createElement(Field, { key: 'details', label: 'Что ещё важно знать куратору перед решением?', textarea: true,
          value: value.details, onChange: (next) => set('details', next) }),
        React.createElement('div', { key: 'urgent', role: 'note', style: { padding: 14, borderRadius: 12, background: '#fff7e8', color: '#754b00', fontSize: 13, lineHeight: 1.5 } },
          'Если вам нужна срочная медицинская помощь, не ждите ответа куратора — обратитесь в экстренную службу или к врачу.'),
      ],
    },
  ];

  function ClientScreen() {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [status, setStatus] = React.useState('invited');
    const [step, setStep] = React.useState(0);
    const [answers, setAnswers] = React.useState(() => mergeAnswers(null));
    const [saveState, setSaveState] = React.useState('idle');
    const [hydrated, setHydrated] = React.useState(false);
    const saveTimerRef = React.useRef(null);
    const saveQueueRef = React.useRef(Promise.resolve());
    const answersRef = React.useRef(answers);
    const screenRef = React.useRef(null);

    React.useEffect(() => {
      HEYS.BlankScreenGuard?.reportVisibleFrame?.({
        element: screenRef.current,
        screen: 'trial-intake',
        reason: 'trial_intake_screen_painted',
      });
    }, []);

    const shellProps = {
      ref: screenRef,
      'data-heys-visible-frame': 'trial-intake',
      style: shellStyle,
    };

    React.useEffect(() => { answersRef.current = answers; }, [answers]);

    const enqueueSave = React.useCallback((nextAnswers, nextStep, complete) => {
      const run = () => api.save(nextAnswers, nextStep, complete);
      const queued = saveQueueRef.current.then(run, run);
      saveQueueRef.current = queued.catch(() => undefined);
      return queued;
    }, []);

    React.useEffect(() => {
      let active = true;
      api.get().then((result) => {
        if (!active) return;
        if (!result.success) {
          setError(result.error === 'invalid_session' ? 'Сессия истекла. Войдите ещё раз.' : 'Не удалось загрузить анкету.');
        } else if (!result.intake) {
          setStatus('not_invited');
        } else {
          setStatus(result.intake.status || 'invited');
          setStep(Math.max(0, Math.min(STEPS.length - 1, Number(result.intake.current_step) || 0)));
          setAnswers(mergeAnswers(result.intake.answers));
        }
        setHydrated(true);
        setLoading(false);
      }).catch(() => {
        if (active) { setError('Не удалось загрузить анкету.'); setLoading(false); }
      });
      return () => { active = false; };
    }, []);

    React.useEffect(() => {
      if (!hydrated || !['invited', 'in_progress', 'needs_clarification'].includes(status)) return undefined;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('pending');
      saveTimerRef.current = setTimeout(async () => {
        setSaveState('saving');
        const result = await enqueueSave(answersRef.current, step, false);
        if (result.success) {
          setStatus(result.status || 'in_progress');
          setSaveState('saved');
        } else {
          setSaveState('error');
        }
      }, 700);
      return () => clearTimeout(saveTimerRef.current);
    }, [answers, step, hydrated, status, enqueueSave]);

    const setSectionValue = (section, key, value) => {
      setAnswers((current) => ({
        ...current,
        [section]: { ...(current[section] || {}), [key]: value },
      }));
    };

    const current = STEPS[step];
    const missingRequired = current
      ? current.required.some((key) => !String(answers[current.id]?.[key] || '').trim())
      : false;

    const next = async () => {
      if (missingRequired) {
        setError('Заполните обязательные поля этого шага.');
        return;
      }
      setError('');
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (step < STEPS.length - 1) {
        const nextStep = step + 1;
        setStep(nextStep);
        await enqueueSave(answersRef.current, nextStep, false);
        global.scrollTo?.({ top: 0, behavior: 'smooth' });
        return;
      }
      setSaveState('saving');
      const result = await enqueueSave(answersRef.current, step, true);
      if (result.success) {
        setStatus('completed');
        setSaveState('saved');
      } else {
        setSaveState('error');
        setError('Не удалось отправить анкету. Ответы сохранены — попробуйте ещё раз.');
      }
    };

    if (loading) return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle }, 'Загружаем анкету…'));
    if (error && !hydrated) return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: { marginTop: 0 } }, 'Не удалось открыть анкету'),
      React.createElement('p', null, error),
      React.createElement('button', { type: 'button', onClick: () => global.location.reload(), style: { ...inputStyle, background: '#1d70b7', color: '#fff', border: 0, fontWeight: 700 } }, 'Повторить')
    ));

    if (status === 'not_invited') return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: { marginTop: 0, fontSize: 26 } }, 'Приглашение не найдено'),
      React.createElement('p', { style: { color: '#657168', lineHeight: 1.55 } }, 'Попросите куратора повторно отправить приглашение.'),
      React.createElement('button', { type: 'button', onClick: leaveIntake, style: { ...inputStyle, cursor: 'pointer' } }, 'Вернуться в приложение')
    ));

    if (STATUS_COPY[status]) {
      const copy = STATUS_COPY[status];
      return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
        React.createElement('div', { style: { width: 48, height: 48, borderRadius: 16, background: '#eaf4ed', color: '#27633a', display: 'grid', placeItems: 'center', fontSize: 22, marginBottom: 18 } }, '✓'),
        React.createElement('h1', { style: { margin: '0 0 10px', fontSize: 28 } }, copy.title),
        React.createElement('p', { style: { margin: '0 0 24px', color: '#657168', lineHeight: 1.6 } }, copy.text),
        React.createElement('button', { type: 'button', onClick: leaveIntake, style: { ...inputStyle, background: '#1d70b7', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' } }, 'Вернуться в приложение')
      ));
    }

    return React.createElement('div', shellProps, React.createElement('main', { style: cardStyle },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', marginBottom: 20 } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 12, color: '#657168', marginBottom: 4 } }, `Шаг ${step + 1} из ${STEPS.length}`),
          React.createElement('div', { style: { fontSize: 12, color: saveState === 'error' ? '#b42318' : '#657168' } },
            saveState === 'saving' || saveState === 'pending' ? 'Сохраняем…' : saveState === 'saved' ? 'Ответы сохранены' : saveState === 'error' ? 'Ошибка сохранения' : '')
        ),
        React.createElement('button', { type: 'button', onClick: leaveIntake, style: { border: 0, background: 'transparent', color: '#657168', cursor: 'pointer', fontSize: 14 } }, 'Закрыть')
      ),
      React.createElement('div', { style: { height: 5, borderRadius: 8, background: '#e8ece9', overflow: 'hidden', marginBottom: 28 } },
        React.createElement('div', { style: { height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, background: '#1d70b7', transition: 'width .2s ease' } })
      ),
      status === 'needs_clarification' ? React.createElement('div', { style: { padding: 14, borderRadius: 12, background: '#eef5ff', color: '#264c73', fontSize: 14, lineHeight: 1.5, marginBottom: 22 } },
        'Куратору нужны уточнения. Проверьте ответы, дополните нужные пункты и отправьте анкету ещё раз.') : null,
      React.createElement('h1', { style: { fontSize: 28, lineHeight: 1.2, margin: '0 0 8px' } }, current.title),
      React.createElement('p', { style: { color: '#657168', lineHeight: 1.55, margin: '0 0 26px' } }, current.subtitle),
      React.createElement('div', { style: { display: 'grid', gap: 20 } }, current.render(
        answers[current.id] || {},
        (key, value) => setSectionValue(current.id, key, value)
      )),
      error ? React.createElement('div', { role: 'alert', style: { marginTop: 18, color: '#b42318', background: '#fff1f0', padding: 12, borderRadius: 10, fontSize: 14 } }, error) : null,
      React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 30 } },
        step > 0 ? React.createElement('button', {
          type: 'button', onClick: () => { setError(''); setStep((value) => Math.max(0, value - 1)); },
          style: { ...inputStyle, width: 'auto', minWidth: 108, cursor: 'pointer', fontWeight: 650 },
        }, 'Назад') : null,
        React.createElement('button', {
          type: 'button', onClick: next, disabled: saveState === 'saving',
          style: { ...inputStyle, flex: 1, background: '#1d70b7', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 750, opacity: saveState === 'saving' ? 0.65 : 1 },
        }, step === STEPS.length - 1 ? 'Отправить куратору' : 'Продолжить')
      )
    ));
  }

  HEYS.TrialIntake = { api, ClientScreen, shouldOpen, leaveIntake, EMPTY_ANSWERS };
})(typeof window !== 'undefined' ? window : globalThis);
