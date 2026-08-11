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
    meta: { schema_version: '1.1' },
  };

  const STATUS_COPY = {
    invite_prepared: {
      title: 'Приглашение ещё не отправлено',
      text: 'Куратор завершает подготовку доступа. Заполнение станет доступно после отправки приглашения.',
    },
    completed: {
      title: 'Анкета отправлена',
      text: 'Куратор внимательно изучит ответы и свяжется с вами в выбранном мессенджере.',
    },
    approved: {
      title: 'Анкета рассмотрена',
      text: 'Куратор подтвердит дату начала пробной недели отдельным сообщением.',
    },
    approved_waiting_slot: {
      title: 'Вы подходите для пробной недели',
      text: 'Сейчас свободного места нет. Куратор свяжется с вами, когда можно будет согласовать дату старта.',
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
    isCandidate() {
      return HEYS.YandexAPI?.hasCandidateSessionHint?.() === true;
    },
    async get() {
      if (!HEYS.YandexAPI?.rpc) return { success: false, error: 'api_not_ready' };
      const fn = this.isCandidate()
        ? 'get_trial_candidate_intake_by_candidate_session'
        : 'get_trial_intake_by_session';
      return unwrapRpc(await HEYS.YandexAPI.rpc(fn, {}), fn);
    },
    async save(answers, currentStep, complete, expectedUpdatedAt) {
      if (!HEYS.YandexAPI?.rpc) return { success: false, error: 'api_not_ready' };
      const fn = this.isCandidate()
        ? 'save_trial_candidate_intake_by_candidate_session'
        : 'save_trial_intake_by_session';
      return unwrapRpc(await HEYS.YandexAPI.rpc(fn, {
        p_answers: answers,
        p_current_step: currentStep,
        p_complete: !!complete,
        p_expected_updated_at: expectedUpdatedAt || null,
      }), fn);
    },
    async acceptHealthConsent() {
      if (!this.isCandidate()) return { success: true };
      const fn = 'accept_trial_candidate_health_consent_by_candidate_session';
      return unwrapRpc(await HEYS.YandexAPI.rpc(fn, { p_document_version: '1.5' }), fn);
    },
  };

  function saveErrorCopy(result, isSubmit = false) {
    const code = result?.error;
    if (code === 'invalid_session') return 'Сессия истекла. Войдите ещё раз и откройте анкету по приглашению.';
    if (code === 'health_consent_required') return 'Для сохранения нужно подтвердить согласие на обработку данных о здоровье.';
    if (code === 'stale_draft') return 'Анкета изменилась в другой вкладке. Загрузите актуальную версию, чтобы не потерять новые ответы.';
    if (code === 'intake_locked') return 'Анкета уже закрыта для изменений: куратор принял решение.';
    return isSubmit
      ? 'Не удалось отправить анкету. Проверьте интернет и повторите отправку.'
      : 'Не удалось сохранить изменения. Проверьте интернет и повторите.';
  }

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
    const merged = Object.keys(EMPTY_ANSWERS).reduce((acc, key) => {
      acc[key] = { ...EMPTY_ANSWERS[key], ...(source[key] || {}) };
      return acc;
    }, {});
    if (merged.meta.schema_version === '1.0') {
      const statusFromText = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) return '';
        return ['нет', 'no', 'не принимаю', 'не было'].includes(normalized) ? 'no' : 'yes';
      };
      [
        ['chronic_conditions_status', 'chronic_conditions'],
        ['medications_status', 'medications'],
        ['injuries_operations_status', 'injuries_operations'],
        ['allergies_status', 'allergies'],
        ['doctor_restrictions_status', 'doctor_restrictions'],
      ].forEach(([statusKey, detailKey]) => {
        if (!merged.health[statusKey]) merged.health[statusKey] = statusFromText(merged.health[detailKey]);
      });
      ['acute_symptoms', 'recent_surgery', 'active_ed_concern', 'medical_supervision'].forEach((key) => {
        if (typeof merged.safety[key] === 'boolean') merged.safety[key] = merged.safety[key] ? 'yes' : 'no';
      });
      merged.meta.schema_version = '1.1';
    }
    return merged;
  }

  // `fieldId` нужен, чтобы к незаполненному полю можно было прокрутить и
  // поставить в него фокус: на шаге «Здоровье и ограничения» полей восемь,
  // часть появляется по условию, и сообщение «заполните обязательные поля» без
  // адреса заставляло искать пустое место глазами.
  function Field({ label, hint, value, onChange, textarea = false, required = false, placeholder = '', type = 'text', fieldId = undefined }) {
    const controlProps = {
      id: fieldId,
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

  function SelectField({ label, hint, value, onChange, options, required = false, fieldId = undefined }) {
    return React.createElement('label', { style: labelStyle },
      React.createElement('span', null, label, required ? ' *' : ''),
      hint ? React.createElement('span', { style: hintStyle }, hint) : null,
      React.createElement('select', {
        id: fieldId,
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

  function ConditionalHealthField({ value, set, statusKey, detailKey, label, detailLabel, hint }) {
    return React.createElement('div', { style: { display: 'grid', gap: 10 } },
      React.createElement(SelectField, {
        label, required: true, value: value[statusKey],
        onChange: (next) => {
          set(statusKey, next);
          if (next !== 'yes') set(detailKey, '');
        },
        options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']],
      }),
      value[statusKey] === 'yes'
        ? React.createElement(Field, {
          label: detailLabel, hint, required: true, textarea: true,
          value: value[detailKey], onChange: (next) => set(detailKey, next),
        })
        : null
    );
  }

  const CURATOR_ANSWER_FIELDS = Object.freeze({
    'goals.primary_goal': { type: 'text' },
    'goals.success_definition': { type: 'text' },
    'goals.time_expectations': { type: 'text' },
    'experience.previous_experience': { type: 'select', options: [['none', 'Нет, начинаю впервые'], ['self', 'Да, самостоятельно'], ['specialist', 'Да, со специалистом'], ['both', 'Оба варианта']] },
    'experience.what_worked': { type: 'text' },
    'experience.what_did_not_work': { type: 'text' },
    'lifestyle.schedule': { type: 'text' },
    'lifestyle.sleep': { type: 'text' },
    'lifestyle.activity': { type: 'text' },
    'lifestyle.constraints': { type: 'text' },
    'collaboration.daily_tracking': { type: 'select', options: [['yes', 'Да'], ['mostly', 'Скорее да, но возможны пропуски'], ['unsure', 'Пока не уверен'], ['no', 'Нет']] },
    'collaboration.feedback_style': { type: 'select', options: [['concise', 'Коротко и по делу'], ['detailed', 'Подробно с объяснениями'], ['gentle', 'Мягко и постепенно'], ['direct', 'Прямо и требовательно']] },
    'collaboration.expectations_from_curator': { type: 'text' },
    'health.chronic_conditions_status': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.chronic_conditions': { type: 'text' },
    'health.medications_status': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.medications': { type: 'text' },
    'health.injuries_operations_status': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.injuries_operations': { type: 'text' },
    'health.allergies_status': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.allergies': { type: 'text' },
    'health.pregnancy_lactation': { type: 'select', options: [['no', 'Нет'], ['pregnancy', 'Беременность'], ['lactation', 'Грудное вскармливание'], ['not_applicable', 'Не применимо'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.eating_disorder_history': { type: 'select', options: [['no', 'Нет'], ['past', 'Да, в прошлом'], ['current', 'Да, сейчас'], ['unsure', 'Затрудняюсь ответить'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.doctor_restrictions_status': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'health.doctor_restrictions': { type: 'text' },
    'safety.acute_symptoms': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'safety.recent_surgery': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'safety.active_ed_concern': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'safety.medical_supervision': { type: 'select', options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] },
    'safety.details': { type: 'text' },
  });

  const STEPS = [
    {
      id: 'goals', title: 'Цели и ожидания',
      subtitle: 'Опишите желаемый результат своими словами — здесь нет правильных ответов.',
      required: ['primary_goal', 'success_definition'],
      render: (value, set) => [
        React.createElement(Field, { key: 'primary_goal', fieldId: 'intake-primary_goal', label: 'Главная цель', required: true, textarea: true,
          placeholder: 'Что вы хотите изменить и почему это важно сейчас?', value: value.primary_goal,
          onChange: (next) => set('primary_goal', next) }),
        React.createElement(Field, { key: 'success_definition', fieldId: 'intake-success_definition', label: 'Как вы поймёте, что сопровождение помогает?', required: true, textarea: true,
          placeholder: 'Какие изменения будут для вас значимыми?', value: value.success_definition,
          onChange: (next) => set('success_definition', next) }),
        React.createElement(Field, { key: 'time_expectations', fieldId: 'intake-time_expectations', label: 'Есть ли дата или срок, которые важно учитывать?', hint: 'Если срока нет, так и напишите.',
          value: value.time_expectations, onChange: (next) => set('time_expectations', next) }),
      ],
    },
    {
      id: 'experience', title: 'Предыдущий опыт',
      subtitle: 'Это помогает не повторять то, что уже не подошло.',
      required: ['previous_experience'],
      render: (value, set) => [
        React.createElement(SelectField, { key: 'previous_experience', fieldId: 'intake-previous_experience', label: 'Был ли опыт изменения питания или образа жизни?', required: true,
          value: value.previous_experience, onChange: (next) => {
            set('previous_experience', next);
            if (next === 'none') {
              set('what_worked', '');
              set('what_did_not_work', '');
            }
          },
          options: [['none', 'Нет, начинаю впервые'], ['self', 'Да, самостоятельно'], ['specialist', 'Да, со специалистом'], ['both', 'Оба варианта']] }),
        value.previous_experience && value.previous_experience !== 'none'
          ? React.createElement(Field, { key: 'what_worked', fieldId: 'intake-what_worked', label: 'Что раньше работало хорошо?', textarea: true,
            value: value.what_worked, onChange: (next) => set('what_worked', next) })
          : null,
        value.previous_experience && value.previous_experience !== 'none'
          ? React.createElement(Field, { key: 'what_did_not_work', fieldId: 'intake-what_did_not_work', label: 'Что не подошло или оказалось трудно поддерживать?', textarea: true,
            value: value.what_did_not_work, onChange: (next) => set('what_did_not_work', next) })
          : null,
      ],
    },
    {
      id: 'lifestyle', title: 'Ритм жизни',
      subtitle: 'Нам нужен реальный контекст, а не идеальная неделя.',
      required: ['schedule', 'sleep'],
      render: (value, set) => [
        React.createElement(Field, { key: 'schedule', fieldId: 'intake-schedule', label: 'Как обычно устроен ваш день?', required: true, textarea: true,
          hint: 'Достаточно примерного ритма без адресов и названий мест.',
          placeholder: 'Работа, учёба, дорога, семья, смены', value: value.schedule,
          onChange: (next) => set('schedule', next) }),
        React.createElement(Field, { key: 'sleep', fieldId: 'intake-sleep', label: 'Сколько вы обычно спите и как восстанавливаетесь?', required: true,
          placeholder: 'Например: 7 часов, утром часто чувствую усталость', value: value.sleep,
          onChange: (next) => set('sleep', next) }),
        React.createElement(Field, { key: 'activity', fieldId: 'intake-activity', label: 'Какая у вас сейчас физическая активность?', hint: 'Укажите вид активности и примерную частоту.', textarea: true,
          value: value.activity, onChange: (next) => set('activity', next) }),
        React.createElement(Field, { key: 'constraints', fieldId: 'intake-constraints', label: 'Что может мешать вам регулярно присылать фото или короткие сообщения в течение дня?', textarea: true,
          value: value.constraints, onChange: (next) => set('constraints', next) }),
      ],
    },
    {
      id: 'collaboration', title: 'Формат совместной работы',
      subtitle: 'Для пробной недели достаточно регулярно присылать фото или короткие сообщения и отвечать на уточнения куратора.',
      required: ['daily_tracking', 'feedback_style'],
      render: (value, set) => [
        React.createElement(SelectField, { key: 'daily_tracking', fieldId: 'intake-daily_tracking', label: 'Готовы в течение недели присылать фото, текст или голосовые сообщения о приёмах пищи?', required: true,
          value: value.daily_tracking, onChange: (next) => set('daily_tracking', next),
          options: CURATOR_ANSWER_FIELDS['collaboration.daily_tracking'].options }),
        React.createElement(SelectField, { key: 'feedback_style', fieldId: 'intake-feedback_style', label: 'Какая обратная связь вам полезнее?', required: true,
          value: value.feedback_style, onChange: (next) => set('feedback_style', next),
          options: [['concise', 'Коротко и по делу'], ['detailed', 'Подробно с объяснениями'], ['gentle', 'Мягко и постепенно'], ['direct', 'Прямо и требовательно']] }),
        React.createElement(Field, { key: 'expectations_from_curator', fieldId: 'intake-expectations_from_curator', label: 'Чего вы ждёте от куратора?', textarea: true,
          value: value.expectations_from_curator, onChange: (next) => set('expectations_from_curator', next) }),
      ],
    },
    {
      id: 'health', title: 'Здоровье и ограничения',
      subtitle: 'Эти сведения нужны только для оценки безопасности и границ сопровождения. HEYS не ставит диагнозы и не заменяет врача.',
      required: [
        'chronic_conditions_status', 'medications_status',
        'injuries_operations_status', 'allergies_status',
        'doctor_restrictions_status',
      ],
      render: (value, set) => [
        React.createElement(ConditionalHealthField, {
          key: 'chronic_conditions', value, set,
          statusKey: 'chronic_conditions_status', detailKey: 'chronic_conditions',
          label: 'Есть ли хронические состояния или диагнозы, которые важно учитывать?',
          detailLabel: 'Что именно важно учитывать?',
        }),
        React.createElement(ConditionalHealthField, {
          key: 'medications', value, set,
          statusKey: 'medications_status', detailKey: 'medications',
          label: 'Принимаете ли лекарства или добавки, влияющие на питание, аппетит или нагрузку?',
          detailLabel: 'Укажите лекарства или добавки',
          hint: 'Не отменяйте назначения врача.',
        }),
        React.createElement(ConditionalHealthField, {
          key: 'injuries_operations', value, set,
          statusKey: 'injuries_operations_status', detailKey: 'injuries_operations',
          label: 'Есть ли сейчас ограничения после травмы или операции?',
          detailLabel: 'Опишите ограничения, которые важно учитывать',
        }),
        React.createElement(ConditionalHealthField, {
          key: 'allergies', value, set,
          statusKey: 'allergies_status', detailKey: 'allergies',
          label: 'Есть ли аллергии или непереносимости?',
          detailLabel: 'Что важно исключить из питания?',
        }),
        React.createElement(SelectField, { key: 'pregnancy_lactation', fieldId: 'intake-pregnancy_lactation', label: 'Беременность или грудное вскармливание',
          value: value.pregnancy_lactation, onChange: (next) => set('pregnancy_lactation', next),
          options: [['no', 'Нет'], ['pregnancy', 'Беременность'], ['lactation', 'Грудное вскармливание'], ['not_applicable', 'Не применимо'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(SelectField, { key: 'eating_disorder_history', fieldId: 'intake-eating_disorder_history', label: 'Был ли опыт расстройства пищевого поведения?',
          value: value.eating_disorder_history, onChange: (next) => set('eating_disorder_history', next),
          options: [['no', 'Нет'], ['past', 'Да, в прошлом'], ['current', 'Да, сейчас'], ['unsure', 'Затрудняюсь ответить'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(ConditionalHealthField, {
          key: 'doctor_restrictions', value, set,
          statusKey: 'doctor_restrictions_status', detailKey: 'doctor_restrictions',
          label: 'Есть ли рекомендации или ограничения от врача?',
          detailLabel: 'Опишите рекомендации или ограничения',
        }),
      ],
    },
    {
      id: 'safety', title: 'Проверка безопасности',
      subtitle: 'Отметки не означают автоматический отказ. Куратор изучит контекст вручную и при необходимости задаст вопросы.',
      required: ['acute_symptoms', 'recent_surgery', 'active_ed_concern', 'medical_supervision'],
      render: (value, set) => [
        React.createElement(SelectField, { key: 'acute_symptoms', fieldId: 'intake-acute_symptoms', label: 'Сейчас есть острые симптомы или резкое ухудшение самочувствия?', required: true,
          value: value.acute_symptoms, onChange: (next) => set('acute_symptoms', next),
          options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(SelectField, { key: 'recent_surgery', fieldId: 'intake-recent_surgery', label: 'Недавно была операция, травма или госпитализация?', required: true,
          value: value.recent_surgery, onChange: (next) => set('recent_surgery', next),
          options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(SelectField, { key: 'active_ed_concern', fieldId: 'intake-active_ed_concern', label: 'Есть трудности с пищевым поведением, которые сейчас требуют помощи специалиста?', required: true,
          value: value.active_ed_concern, onChange: (next) => set('active_ed_concern', next),
          options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(SelectField, { key: 'medical_supervision', fieldId: 'intake-medical_supervision', label: 'Наблюдаетесь у врача по состоянию, влияющему на питание или нагрузку?', required: true,
          value: value.medical_supervision, onChange: (next) => set('medical_supervision', next),
          options: [['no', 'Нет'], ['yes', 'Да'], ['prefer_not', 'Предпочитаю обсудить с куратором']] }),
        React.createElement(Field, { key: 'details', fieldId: 'intake-details', label: 'Что ещё важно знать куратору перед решением?',
          hint: 'Укажите только значимый контекст, без ФИО врачей, названий клиник и документов.', textarea: true,
          value: value.details, onChange: (next) => set('details', next) }),
        React.createElement('div', { key: 'urgent', role: 'note', style: { padding: 14, borderRadius: 12, background: '#fff7e8', color: '#754b00', fontSize: 13, lineHeight: 1.5 } },
          'Если вам нужна срочная медицинская помощь, не ждите ответа куратора — обратитесь в экстренную службу или к врачу.'),
      ],
    },
  ];

  const SECTION_LABELS = {
    goals: 'Цели', experience: 'Предыдущий опыт', lifestyle: 'Ритм жизни',
    collaboration: 'Совместная работа', health: 'Здоровье', safety: 'Безопасность',
  };

  // Метки нужны для КАЖДОГО значения, которое может дойти до экрана сверки:
  // `reviewValue` при отсутствии метки печатает сырой код, и человек видит
  // «unsure» вместо своего ответа. Так и было с «готовностью присылать данные»
  // (`collaboration.daily_tracking`) — единственным полем сверки, где есть
  // вариант `unsure`. Добавляя вариант в форму, добавляйте метку сюда же.
  // Человеческое имя поля для сообщения об ошибке. Собрано из тех же подписей,
  // что видит человек: иначе он читает «заполните обязательные поля», а какое
  // именно — ищет глазами среди восьми, часть которых появляется по условию.
  const FIELD_LABELS = {
    active_ed_concern: 'Есть трудности с пищевым поведением, которые сейчас требуют помощи специалиста?',
    activity: 'Какая у вас сейчас физическая активность?',
    acute_symptoms: 'Сейчас есть острые симптомы или резкое ухудшение самочувствия?',
    constraints: 'Что может мешать вам регулярно присылать фото или короткие сообщения в течение дня?',
    daily_tracking: 'Готовы в течение недели присылать фото, текст или голосовые сообщения о приёмах пищи?',
    details: 'Что ещё важно знать куратору перед решением?',
    eating_disorder_history: 'Был ли опыт расстройства пищевого поведения?',
    expectations_from_curator: 'Чего вы ждёте от куратора?',
    feedback_style: 'Какая обратная связь вам полезнее?',
    medical_supervision: 'Наблюдаетесь у врача по состоянию, влияющему на питание или нагрузку?',
    pregnancy_lactation: 'Беременность или грудное вскармливание',
    previous_experience: 'Был ли опыт изменения питания или образа жизни?',
    primary_goal: 'Главная цель',
    recent_surgery: 'Недавно была операция, травма или госпитализация?',
    schedule: 'Как обычно устроен ваш день?',
    sleep: 'Сколько вы обычно спите и как восстанавливаетесь?',
    success_definition: 'Как вы поймёте, что сопровождение помогает?',
    time_expectations: 'Есть ли дата или срок, которые важно учитывать?',
    what_did_not_work: 'Что не подошло или оказалось трудно поддерживать?',
    what_worked: 'Что раньше работало хорошо?',
  };

  const REVIEW_VALUE_LABELS = {
    none: 'Начинаю впервые', self: 'Самостоятельно', specialist: 'Со специалистом', both: 'Самостоятельно и со специалистом',
    yes: 'Да', no: 'Нет', mostly: 'Скорее да, но возможны пропуски', prefer_not: 'Предпочитаю обсудить с куратором',
    unsure: 'Пока не уверен', past: 'Да, в прошлом', current: 'Да, сейчас', not_applicable: 'Не применимо',
  };

  function reviewValue(value) {
    return REVIEW_VALUE_LABELS[value] || String(value || '—');
  }

  function ReviewSummary({ answers, onEdit }) {
    const mainRows = [
      ['Цель', answers.goals?.primary_goal],
      ['Предыдущий опыт', answers.experience?.previous_experience],
      ['Готовность присылать данные', answers.collaboration?.daily_tracking],
    ].filter(([, value]) => String(value || '').trim());
    const safetyRows = [
      ['Острые симптомы', answers.safety?.acute_symptoms],
      ['Недавняя операция, травма или госпитализация', answers.safety?.recent_surgery],
      ['Трудности с пищевым поведением', answers.safety?.active_ed_concern],
      ['Наблюдение врача', answers.safety?.medical_supervision],
      ['Ограничения врача', answers.health?.doctor_restrictions_status],
    ].filter(([, value]) => String(value || '').trim());
    const needsAttention = safetyRows.some(([, value]) => !['', 'no'].includes(String(value || '')));
    const renderRows = (rows, attention = false) => React.createElement('div', {
      style: { display: 'grid', gap: 10 }
    }, rows.map(([label, value]) => {
      const rowNeedsAttention = attention && !['', 'no'].includes(String(value || ''));
      return React.createElement('div', {
        key: label,
        style: {
          display: 'grid', gap: 2,
          ...(rowNeedsAttention ? { background: '#fff7e8', borderRadius: 9, padding: '8px 10px', color: '#754b00' } : {}),
        }
      },
        React.createElement('span', { style: { fontSize: 11, color: rowNeedsAttention ? '#875700' : '#718078', textTransform: 'uppercase' } }, label),
        React.createElement('span', { style: { fontSize: 14, lineHeight: 1.45 } }, reviewValue(value))
      );
    }));

    return React.createElement('section', {
      style: {
        border: '1px solid #dfe5e1', borderRadius: 14,
        padding: 14, background: '#f8faf8', display: 'grid', gap: 14,
      }
    },
      React.createElement('div', null,
        React.createElement('div', { style: { fontSize: 16, fontWeight: 750, color: '#334039' } }, 'Проверьте ответы перед отправкой'),
        React.createElement('div', { style: { marginTop: 4, color: '#657168', fontSize: 13, lineHeight: 1.45 } }, 'Куратор разберёт анкету вручную и при необходимости задаст уточняющие вопросы.')
      ),
      renderRows(mainRows),
      React.createElement('div', {
        role: 'status',
        style: {
          border: `1px solid ${needsAttention ? '#efc36f' : '#cfe3d3'}`,
          borderRadius: 11, padding: 11,
          background: needsAttention ? '#fffaf0' : '#f2faf4',
        }
      },
        React.createElement('div', { style: { marginBottom: 8, fontSize: 13, fontWeight: 750, color: needsAttention ? '#754b00' : '#27613b' } },
          needsAttention ? 'Проверьте ответы о безопасности' : 'Ответы о безопасности заполнены'),
        renderRows(safetyRows, true)
      ),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
        React.createElement('button', {
          type: 'button', onClick: () => onEdit('health'),
          style: { minHeight: 44, padding: '9px 12px', borderRadius: 10, border: '1px solid #cfd6d0', background: '#fff', color: '#334039', cursor: 'pointer', fontWeight: 650 },
        }, 'Изменить сведения о здоровье'),
        React.createElement('button', {
          type: 'button', onClick: () => onEdit('safety'),
          style: { minHeight: 44, padding: '9px 12px', borderRadius: 10, border: '1px solid #cfd6d0', background: '#fff', color: '#334039', cursor: 'pointer', fontWeight: 650 },
        }, 'Изменить ответы о безопасности')
      )
    );
  }

  function ClientScreen() {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [status, setStatus] = React.useState('invited');
    const [step, setStep] = React.useState(0);
    const [answers, setAnswers] = React.useState(() => mergeAnswers(null));
    const [clarification, setClarification] = React.useState({ text: '', sections: [] });
    const [saveState, setSaveState] = React.useState('idle');
    const [saveErrorCode, setSaveErrorCode] = React.useState('');
    const [hasEdited, setHasEdited] = React.useState(false);
    const [hydrated, setHydrated] = React.useState(false);
    const [healthConsentAccepted, setHealthConsentAccepted] = React.useState(!api.isCandidate());
    const saveTimerRef = React.useRef(null);
    const saveQueueRef = React.useRef(Promise.resolve());
    const answersRef = React.useRef(answers);
    const serverUpdatedAtRef = React.useRef(null);
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
      const run = async () => {
        try {
          if (api.isCandidate() && !healthConsentAccepted) {
            return { success: false, error: 'health_consent_required' };
          }
          if (api.isCandidate()) {
            const consent = await api.acceptHealthConsent();
            if (!consent?.success) return consent;
          }
          const result = await api.save(
            nextAnswers, nextStep, complete, serverUpdatedAtRef.current
          );
          if (result?.success && (result.updated_at || result.saved_at)) {
            serverUpdatedAtRef.current = result.updated_at || result.saved_at;
          }
          return result;
        } catch (_) {
          return { success: false, error: 'request_failed' };
        }
      };
      const queued = saveQueueRef.current.then(run, run);
      saveQueueRef.current = queued.catch(() => undefined);
      return queued;
    }, [healthConsentAccepted]);

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
          setClarification({
            text: result.intake.clarification_request || '',
            sections: Array.isArray(result.intake.clarification_sections)
              ? result.intake.clarification_sections
              : [],
          });
          serverUpdatedAtRef.current = result.intake.updated_at || null;
        }
        setHydrated(true);
        setLoading(false);
      }).catch(() => {
        if (active) { setError('Не удалось загрузить анкету.'); setLoading(false); }
      });
      return () => { active = false; };
    }, []);

    React.useEffect(() => {
      if (!hydrated || !hasEdited || !['invite_sent', 'invited', 'in_progress', 'needs_clarification'].includes(status)) return undefined;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('pending');
      saveTimerRef.current = setTimeout(async () => {
        setSaveState('saving');
        const snapshot = answersRef.current;
        const result = await enqueueSave(snapshot, step, false);
        if (result.success) {
          setStatus(result.status || 'in_progress');
          setSaveState('saved');
          setSaveErrorCode('');
          if (answersRef.current === snapshot) setHasEdited(false);
        } else {
          if (result.status && result.error === 'intake_locked') setStatus(result.status);
          setSaveState('error');
          setSaveErrorCode(result.error || 'request_failed');
          setError(saveErrorCopy(result));
        }
      }, 700);
      return () => clearTimeout(saveTimerRef.current);
    }, [answers, step, hydrated, hasEdited, status, enqueueSave]);

    const setSectionValue = (section, key, value) => {
      setHasEdited(true);
      setError('');
      setSaveErrorCode('');
      setAnswers((current) => ({
        ...current,
        [section]: { ...(current[section] || {}), [key]: value },
      }));
    };

    const current = STEPS[step];
    // Не флаг, а адрес: список конкретных незаполненных ключей в порядке
    // появления на экране. Первый из них называется в ошибке и получает фокус.
    const missingKeys = current
      ? [
        ...current.required.filter((key) => !String(answers[current.id]?.[key] || '').trim()),
        ...(current.id === 'health' ? [
          ['chronic_conditions_status', 'chronic_conditions'],
          ['medications_status', 'medications'],
          ['injuries_operations_status', 'injuries_operations'],
          ['allergies_status', 'allergies'],
          ['doctor_restrictions_status', 'doctor_restrictions'],
        ].filter(([statusKey, detailKey]) => (
          answers.health?.[statusKey] === 'yes'
          && !String(answers.health?.[detailKey] || '').trim()
        )).map(([, detailKey]) => detailKey) : []),
      ]
      : [];
    const missingRequired = missingKeys.length > 0;

    const next = async () => {
      if (missingRequired) {
        const firstKey = missingKeys[0];
        const label = FIELD_LABELS[firstKey];
        setError(label ? `Заполните поле «${label}».` : 'Заполните обязательные поля этого шага.');
        // Прокрутка и фокус: на длинном шаге незаполненное поле может быть за
        // пределами экрана, и одного текста ошибки мало.
        try {
          const node = global.document?.getElementById(`intake-${firstKey}`);
          if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            node.focus({ preventScroll: true });
          }
        } catch (_) { /* фокус — вспомогательный, отсутствие DOM не ломает шаг */ }
        return;
      }
      setError('');
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (step < STEPS.length - 1) {
        const nextStep = step + 1;
        setSaveState('saving');
        const snapshot = answersRef.current;
        const result = await enqueueSave(snapshot, nextStep, false);
        if (!result.success) {
          if (result.status && result.error === 'intake_locked') setStatus(result.status);
          setSaveState('error');
          setSaveErrorCode(result.error || 'request_failed');
          setError(saveErrorCopy(result));
          return;
        }
        if (answersRef.current === snapshot) setHasEdited(false);
        setSaveState('saved');
        setSaveErrorCode('');
        setStatus(result.status || 'in_progress');
        setStep(nextStep);
        global.scrollTo?.({ top: 0, behavior: 'smooth' });
        return;
      }
      setSaveState('saving');
      const result = await enqueueSave(answersRef.current, step, true);
      if (result.success) {
        setStatus('completed');
        setSaveState('saved');
        setSaveErrorCode('');
      } else {
        if (result.status && result.error === 'intake_locked') setStatus(result.status);
        setSaveState('error');
        setSaveErrorCode(result.error || 'request_failed');
        setError(saveErrorCopy(result, true));
      }
    };

    const retrySave = async () => {
      if (['stale_draft', 'health_consent_required', 'intake_locked'].includes(saveErrorCode)) {
        global.location.reload();
        return;
      }
      if (saveErrorCode === 'invalid_session') {
        leaveIntake();
        return;
      }
      setError('');
      setSaveState('saving');
      const snapshot = answersRef.current;
      const result = await enqueueSave(snapshot, step, false);
      if (result.success) {
        setStatus(result.status || 'in_progress');
        setSaveState('saved');
        setSaveErrorCode('');
        if (answersRef.current === snapshot) setHasEdited(false);
        return;
      }
      if (result.status && result.error === 'intake_locked') setStatus(result.status);
      setSaveState('error');
      setSaveErrorCode(result.error || 'request_failed');
      setError(saveErrorCopy(result));
    };

    const closeSafely = async () => {
      if (!hasEdited && !['pending', 'saving', 'error'].includes(saveState)) {
        leaveIntake();
        return;
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      const result = await enqueueSave(answersRef.current, step, false);
      if (result.success) {
        leaveIntake();
      } else {
        setSaveState('error');
        setSaveErrorCode(result.error || 'request_failed');
        setError(saveErrorCopy(result));
      }
    };

    if (loading) return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle }, 'Загружаем анкету…'));
    if (error && !hydrated) return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: { marginTop: 0 } }, 'Не удалось открыть анкету'),
      React.createElement('p', null, error),
      React.createElement('button', { type: 'button', onClick: () => global.location.reload(), style: { ...inputStyle, background: '#434587', color: '#fff', border: 0, fontWeight: 700 } }, 'Повторить')
    ));

    if (status === 'not_invited') return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: { marginTop: 0, fontSize: 26 } }, 'Приглашение не найдено'),
      React.createElement('p', { style: { color: '#657168', lineHeight: 1.55 } }, 'Попросите куратора повторно отправить приглашение.'),
      React.createElement('button', { type: 'button', onClick: leaveIntake, style: { ...inputStyle, cursor: 'pointer' } }, 'Вернуться в приложение')
    ));

    if (STATUS_COPY[status]) {
      const copy = STATUS_COPY[status];
      return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
        React.createElement('div', { style: { width: 48, height: 48, borderRadius: 16, background: status === 'rejected' ? '#f2f3f2' : '#eaf4ed', color: status === 'rejected' ? '#657168' : '#27633a', display: 'grid', placeItems: 'center', fontSize: 22, marginBottom: 18 } }, status === 'rejected' ? '·' : '✓'),
        React.createElement('h1', { style: { margin: '0 0 10px', fontSize: 28 } }, copy.title),
        React.createElement('p', { style: { margin: '0 0 24px', color: '#657168', lineHeight: 1.6 } }, copy.text),
        React.createElement('div', {
          style: {
            display: 'grid', gap: 9, marginBottom: 24, padding: 14,
            border: '1px solid #e1e6e2', borderRadius: 14, background: '#fafbfa',
          }
        }, (status === 'invite_prepared' ? [
          ['Куратор готовит доступ', true],
          ['Отправка приглашения', false],
        ] : status === 'rejected' ? [
          ['Анкета получена', true],
          ['Ручной разбор завершён', true],
          ['Текущая заявка закрыта', true],
        ] : [
          ['Анкета получена', true],
          ['Ручной разбор куратором', ['approved', 'approved_waiting_slot'].includes(status)],
          [status === 'approved_waiting_slot' ? 'Ожидаем свободное место' : 'Согласование даты старта', status === 'approved'],
        ]).map(([label, done]) => React.createElement('div', {
          key: label,
          style: { display: 'flex', gap: 9, alignItems: 'center', color: done ? '#2f5d3d' : '#718078', fontSize: 13 }
        },
          React.createElement('span', {
            style: {
              width: 18, height: 18, borderRadius: 9,
              display: 'grid', placeItems: 'center',
              background: done ? '#dfeee2' : '#ecefed',
              color: done ? '#2f5d3d' : '#849087', fontSize: 11,
            }
          }, done ? '✓' : '·'),
          label
        ))),
        React.createElement('button', { type: 'button', onClick: leaveIntake, style: { ...inputStyle, minHeight: 46, background: '#434587', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' } }, 'Вернуться в приложение')
      ));
    }

    return React.createElement('div', shellProps, React.createElement('main', { style: cardStyle },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', marginBottom: 20 } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 12, color: '#657168', marginBottom: 4 } }, `Шаг ${step + 1} из ${STEPS.length}`),
          React.createElement('div', { style: { fontSize: 12, color: '#657168', marginBottom: 3 } },
            step === 0 ? 'Обычно занимает около 10 минут' : `Осталось примерно ${Math.max(2, (STEPS.length - step) * 2)} мин`),
          React.createElement('div', { style: { fontSize: 12, color: saveState === 'error' ? '#b42318' : '#657168' } },
            saveState === 'saving' || saveState === 'pending' ? 'Сохраняем…' : saveState === 'saved' ? 'Ответы сохранены' : saveState === 'error' ? 'Ошибка сохранения' : '')
        ),
        React.createElement('button', { type: 'button', onClick: closeSafely, disabled: saveState === 'saving', style: { border: 0, background: 'transparent', color: '#657168', cursor: saveState === 'saving' ? 'wait' : 'pointer', fontSize: 14 } }, 'Закрыть')
      ),
      React.createElement('div', { style: { height: 5, borderRadius: 8, background: '#e8ece9', overflow: 'hidden', marginBottom: 28 } },
        React.createElement('div', { style: { height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, background: '#434587', transition: 'width .2s ease' } })
      ),
      status === 'needs_clarification' ? React.createElement('div', {
        role: 'status',
        style: { padding: 16, borderRadius: 14, background: '#eef2f8', color: '#31435f', fontSize: 14, lineHeight: 1.5, marginBottom: 22 }
      },
        React.createElement('div', { style: { fontWeight: 750, marginBottom: 6 } }, 'Куратор просит уточнить'),
        React.createElement('div', { style: { whiteSpace: 'pre-wrap' } },
          clarification.text || 'Проверьте ответы и дополните отмеченные разделы.'),
        clarification.sections.length
          ? React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 } },
            clarification.sections.map((section) => React.createElement('span', {
              key: section,
              style: {
                padding: '4px 8px', borderRadius: 8,
                background: '#fff', border: '1px solid #d7dfeb',
                fontSize: 12, fontWeight: 650,
              }
            }, SECTION_LABELS[section] || section)))
          : null,
        clarification.sections.length
          ? React.createElement('button', {
            type: 'button',
            onClick: () => {
              const target = STEPS.findIndex((item) => item.id === clarification.sections[0]);
              if (target >= 0) setStep(target);
            },
            style: {
              minHeight: 44, marginTop: 12, padding: '9px 12px',
              borderRadius: 10, border: 0, background: '#434587',
              color: '#fff', fontWeight: 700, cursor: 'pointer',
            }
          }, 'Перейти к нужному разделу')
          : null
      ) : null,
      step === 0 ? React.createElement('div', {
        style: {
          padding: 13, borderRadius: 12, background: '#f3f7f4',
          color: '#526159', fontSize: 13, lineHeight: 1.5, marginBottom: 20,
        }
      }, 'Ответы доступны вам и назначенному куратору в защищённой анкете. Заполнение анкеты не гарантирует пробную неделю.') : null,
      step === 0 && api.isCandidate() ? React.createElement('label', {
        style: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 22, color: '#334039', fontSize: 14, lineHeight: 1.5 }
      },
        React.createElement('input', {
          type: 'checkbox', checked: healthConsentAccepted,
          onChange: (event) => { setHealthConsentAccepted(event.target.checked); setError(''); },
          style: { width: 20, height: 20, marginTop: 1, flex: '0 0 auto' }
        }),
        React.createElement('span', null,
          'Я согласен на обработку данных о здоровье для рассмотрения анкеты. ',
          React.createElement('a', { href: '/docs/health-data-consent.md', target: '_blank', rel: 'noopener noreferrer' }, 'Текст согласия')
        )
      ) : null,
      React.createElement('h1', { style: { fontSize: 28, lineHeight: 1.2, margin: '0 0 8px' } }, current.title),
      React.createElement('p', { style: { color: '#657168', lineHeight: 1.55, margin: '0 0 26px' } }, current.subtitle),
      React.createElement('div', { style: { display: 'grid', gap: 20 } }, current.render(
        answers[current.id] || {},
        (key, value) => setSectionValue(current.id, key, value)
      )),
      step === STEPS.length - 1 ? React.createElement('div', { style: { marginTop: 20 } },
        React.createElement(ReviewSummary, {
          answers,
          onEdit: (sectionId) => {
            const target = STEPS.findIndex((item) => item.id === sectionId);
            if (target >= 0) setStep(target);
          },
        })
      ) : null,
      error ? React.createElement('div', { role: 'alert', style: { marginTop: 18, color: '#b42318', background: '#fff1f0', padding: 12, borderRadius: 10, fontSize: 14 } }, error) : null,
      saveState === 'error' ? React.createElement('button', {
        type: 'button', onClick: retrySave,
        style: { ...inputStyle, width: 'auto', minHeight: 44, marginTop: 10, cursor: 'pointer', fontWeight: 700 },
      }, saveErrorCode === 'stale_draft'
        ? 'Загрузить актуальную версию'
        : saveErrorCode === 'invalid_session'
          ? 'Войти снова'
          : ['health_consent_required', 'intake_locked'].includes(saveErrorCode)
            ? 'Обновить состояние'
            : 'Повторить сохранение') : null,
      React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 30 } },
        step > 0 ? React.createElement('button', {
          type: 'button', onClick: () => { setError(''); setStep((value) => Math.max(0, value - 1)); },
          style: { ...inputStyle, width: 'auto', minWidth: 108, cursor: 'pointer', fontWeight: 650 },
        }, 'Назад') : null,
        React.createElement('button', {
          type: 'button', onClick: next, disabled: saveState === 'saving' || (step === 0 && api.isCandidate() && !healthConsentAccepted),
          style: { ...inputStyle, minHeight: 46, flex: 1, background: '#434587', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 750, opacity: saveState === 'saving' || (step === 0 && api.isCandidate() && !healthConsentAccepted) ? 0.65 : 1 },
        }, step === STEPS.length - 1 ? 'Отправить куратору' : 'Продолжить')
      )
    ));
  }

  HEYS.TrialIntake = { api, ClientScreen, shouldOpen, leaveIntake, EMPTY_ANSWERS, CURATOR_ANSWER_FIELDS };
})(typeof window !== 'undefined' ? window : globalThis);
