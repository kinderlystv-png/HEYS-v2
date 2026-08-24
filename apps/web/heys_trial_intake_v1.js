// heys_trial_intake_v1.js — protected, authenticated trial-candidate intake
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  if (!React) return;

  const WARNING_TEXT_VERSION = '1.0';
  // Канон: docs/legal/warning-intake.md — тот же текст, что в снимке v1.0.
  const WARNING_TEXT_TITLE = 'Прежде чем начать';
  const WARNING_TEXT_PARAGRAPHS = Object.freeze([
    'HEYS — сервис сопровождения по режиму питания. Это не медицинская услуга: мы не ставим диагнозы, не назначаем лечение и не заменяем консультацию врача.',
    'Изменение режима питания и физической активности подходит не всем и при некоторых состояниях требует согласования с врачом. Это касается и тренировочной части, если она входит в ваш формат.',
    'Не сообщайте куратору сведения о заболеваниях, диагнозах и принимаемых препаратах — сервис их не запрашивает и не хранит. Если такие сведения попадут в переписку или в дневник, мы их удалим.',
    'Сервис предназначен для лиц, достигших 18 лет.',
  ]);
  const WARNING_CHECKBOX_LABEL =
    'Я ознакомился с предупреждением. При наличии противопоказаний я согласовал участие с врачом и принимаю решение об участии на себя. Мне 18 лет или больше.';

  // Candidate invite code is one-time (verify_trial_candidate_pin consumes pin_consumed_at).
  const DRAFT_STORAGE_COPY =
    'Ответы сохранены. С другого телефона продолжите с того же шага — войдите по номеру и одноразовому коду из сообщения куратора. Черновик ждёт 30 дней без активности.';
  const CLOSE_DRAFT_COPY =
    'Ответы сохранены. Вернуться можно в течение 30 дней без активности — войдите по номеру и одноразовому коду из сообщения куратора.';

  const EMPTY_ANSWERS = {
    goals: {},
    experience: {},
    lifestyle: {},
    collaboration: {},
    warning: {},
    meta: { schema_version: '1.2' },
  };

  const STATUS_COPY = {
    invite_prepared: {
      title: 'Приглашение ещё не отправлено',
      text: 'Куратор завершает подготовку доступа. Заполнение станет доступно после отправки приглашения.',
    },
    completed: {
      title: 'Анкета отправлена',
      text: 'Куратор внимательно изучит ответы — результат придёт уведомлением в приложении.',
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
    // Роли набора вместо легаси-литералов: экран анкеты был единственным,
    // который не был сведён на v4 и жил на легаси-палитре.
    minHeight: '100vh', background: 'var(--v4-chip, #efe3cf)', padding: '24px 16px 48px',
    boxSizing: 'border-box', color: '#17202a', fontFamily: 'inherit',
  };
  const cardStyle = {
    maxWidth: 680, margin: '0 auto', background: 'var(--v4-bg, #fffaf1)', borderRadius: 24,
    border: 'none', boxShadow: '0 18px 50px rgba(40, 24, 8, 0.08)',
    padding: 'clamp(20px, 5vw, 38px)', boxSizing: 'border-box',
  };
  const inputStyle = {
    // Строка «вид карточки вопроса»: поле внутри карточки — фон --bg,
    // радиус 14, высота не меньше 44.
    width: '100%', boxSizing: 'border-box', border: '1px solid rgba(32, 30, 29, 0.12)',
    borderRadius: 14, minHeight: 44, padding: '12px 14px', fontSize: 16, lineHeight: 1.45,
    color: '#17202a', background: 'var(--v4-bg, #fffaf1)', outline: 'none',
  };
  const labelStyle = { display: 'grid', gap: 7, fontSize: 12.5, fontWeight: 600, color: '#25332a' };
  const hintStyle = { fontSize: 11.5, lineHeight: 1.45, color: 'var(--v4-ink-2, rgba(32, 30, 29, 0.55))', fontWeight: 500 };

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
    const legacySchema = ['1.0', '1.1'].includes(String(source.meta?.schema_version || ''))
      || source.health
      || source.safety;
    if (legacySchema) {
      merged.warning = {};
      merged.meta = { schema_version: '1.2' };
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
    'warning.acknowledged_at': { type: 'text' },
    'warning.text_version': { type: 'text' },
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
      id: 'warning', title: 'Важная информация',
      subtitle: 'Прочитайте предупреждение и подтвердите, что готовы продолжить.',
      required: ['acknowledged_at'],
      render: (value, set) => [
        React.createElement('div', {
          key: 'warning-text',
          role: 'note',
          style: {
            // Строка «вид блока предупреждения»: своя область 186 px с
            // настоящей прокруткой — иначе четыре абзаца выталкивают
            // чекбокс за экран, и подтвердить нечем.
            maxHeight: 186, overflowY: 'auto',
            padding: '14px 16px', borderRadius: 18, background: 'var(--v4-card, #f7efe2)',
            color: '#17202a', fontSize: 12, lineHeight: 1.6,
            display: 'grid', gap: 10,
          },
        },
          React.createElement('div', { style: { fontWeight: 750, fontSize: 15, color: '#5c3b00' } }, WARNING_TEXT_TITLE),
          ...WARNING_TEXT_PARAGRAPHS.map((paragraph, index) => React.createElement('p', {
            key: `warning-p-${index}`,
            style: { margin: 0 },
          }, paragraph)),
        ),
        React.createElement('label', {
          key: 'warning-confirm',
          style: { display: 'flex', gap: 10, alignItems: 'flex-start', color: '#334039', fontSize: 14, lineHeight: 1.5 },
        },
          React.createElement('input', {
            id: 'intake-acknowledged_at',
            type: 'checkbox',
            checked: Boolean(value.acknowledged_at),
            onChange: (event) => {
              if (event.target.checked) {
                set('acknowledged_at', new Date().toISOString());
                set('text_version', WARNING_TEXT_VERSION);
              } else {
                set('acknowledged_at', '');
                set('text_version', '');
              }
            },
            style: { width: 20, height: 20, marginTop: 1, flex: '0 0 auto' },
          }),
          React.createElement('span', null, WARNING_CHECKBOX_LABEL)
        ),
      ],
    },
  ];

  const SECTION_LABELS = {
    goals: 'Цели', experience: 'Предыдущий опыт', lifestyle: 'Ритм жизни',
    collaboration: 'Совместная работа', warning: 'Важная информация',
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
    acknowledged_at: 'Подтверждение предупреждения',
    activity: 'Какая у вас сейчас физическая активность?',
    constraints: 'Что может мешать вам регулярно присылать фото или короткие сообщения в течение дня?',
    daily_tracking: 'Готовы в течение недели присылать фото, текст или голосовые сообщения о приёмах пищи?',
    expectations_from_curator: 'Чего вы ждёте от куратора?',
    feedback_style: 'Какая обратная связь вам полезнее?',
    previous_experience: 'Был ли опыт изменения питания или образа жизни?',
    primary_goal: 'Главная цель',
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
    const warningConfirmed = Boolean(String(answers.warning?.acknowledged_at || '').trim());
    const renderRows = (rows) => React.createElement('div', {
      style: { display: 'grid', gap: 10 }
    }, rows.map(([label, value]) => React.createElement('div', {
      key: label,
      style: { display: 'grid', gap: 2 },
    },
      React.createElement('span', { style: { fontSize: 11, color: '#718078', textTransform: 'uppercase' } }, label),
      React.createElement('span', { style: { fontSize: 14, lineHeight: 1.45 } }, reviewValue(value))
    )));

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
          border: `1px solid ${warningConfirmed ? '#cfe3d3' : '#efc36f'}`,
          borderRadius: 11, padding: 11,
          background: warningConfirmed ? '#f2faf4' : '#fffaf0',
        }
      },
        React.createElement('div', { style: { marginBottom: 8, fontSize: 13, fontWeight: 750, color: warningConfirmed ? '#27613b' : '#754b00' } },
          warningConfirmed ? 'Предупреждение подтверждено' : 'Подтвердите предупреждение перед отправкой'),
        React.createElement('div', { style: { fontSize: 14, lineHeight: 1.45, color: '#334039' } },
          warningConfirmed ? 'Вы подтвердили, что прочитали предупреждение перед анкетой.' : 'Вернитесь к шагу с предупреждением и поставьте галочку подтверждения.')
      ),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
        React.createElement('button', {
          type: 'button', onClick: () => onEdit('warning'),
          style: { minHeight: 44, padding: '9px 12px', borderRadius: 10, border: '1px solid #cfd6d0', background: '#fff', color: '#334039', cursor: 'pointer', fontWeight: 650 },
        }, 'Изменить подтверждение предупреждения')
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
    const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false);
    const [resumeGateOpen, setResumeGateOpen] = React.useState(false);
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
          const nextStatus = result.intake.status || 'invited';
          const nextStep = Math.max(0, Math.min(STEPS.length - 1, Number(result.intake.current_step) || 0));
          setStatus(nextStatus);
          setStep(nextStep);
          setAnswers(mergeAnswers(result.intake.answers));
          setClarification({
            text: result.intake.clarification_request || '',
            sections: Array.isArray(result.intake.clarification_sections)
              ? result.intake.clarification_sections
              : [],
          });
          serverUpdatedAtRef.current = result.intake.updated_at || null;
          if (
            ['in_progress', 'needs_clarification'].includes(nextStatus)
            && nextStep > 0
          ) {
            setResumeGateOpen(true);
          }
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
      ? current.required.filter((key) => !String(answers[current.id]?.[key] || '').trim())
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

    const performClose = async () => {
      setCloseConfirmOpen(false);
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

    const closeSafely = () => {
      if (closeConfirmOpen) return;
      setCloseConfirmOpen(true);
    };

    const storageNotice = (title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary) => React.createElement('div', {
      role: 'dialog',
      'aria-modal': 'true',
      style: {
        position: 'fixed', inset: 0, zIndex: 40, display: 'grid', placeItems: 'center',
        padding: 16, background: 'rgba(23, 32, 42, 0.42)',
      },
    }, React.createElement('div', {
      style: {
        width: 'min(100%, 420px)', background: '#fff', borderRadius: 18,
        border: '1px solid #e6e9e5', boxShadow: '0 18px 50px rgba(24, 39, 30, 0.16)',
        padding: '22px 20px 18px', boxSizing: 'border-box',
      },
    },
      React.createElement('h2', { style: { margin: '0 0 10px', fontSize: 22 } }, title),
      React.createElement('p', { style: { margin: '0 0 20px', color: '#657168', lineHeight: 1.55, fontSize: 15 } }, body),
      React.createElement('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
        secondaryLabel ? React.createElement('button', {
          type: 'button', onClick: onSecondary,
          style: {
            ...inputStyle, width: 'auto', flex: '1 1 140px', minHeight: 46, cursor: 'pointer',
            background: '#f3f5f3', border: '1px solid #d5dbd6', fontWeight: 650,
          },
        }, secondaryLabel) : null,
        React.createElement('button', {
          type: 'button', onClick: onPrimary, disabled: saveState === 'saving',
          style: {
            ...inputStyle, width: 'auto', flex: '1 1 140px', minHeight: 46, cursor: saveState === 'saving' ? 'wait' : 'pointer',
            background: 'var(--v4-sand-act, #c67139)', color: 'var(--v4-btn-on-act, #2b1608)', border: 0, fontWeight: 700,
            opacity: saveState === 'saving' ? 0.65 : 1,
          },
        }, primaryLabel)
      )
    ));

    if (loading) {
      return React.createElement('div', shellProps,
        window.HEYS?.WaitMark?.render?.(React, { mode: 'screen', title: 'Загружаем анкету', text: 'Пара секунд.' })
        || React.createElement('div', { style: cardStyle }, 'Загружаем анкету…')
      );
    }
    if (error && !hydrated) return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: { marginTop: 0 } }, 'Не удалось открыть анкету'),
      React.createElement('p', null, error),
      React.createElement('button', { type: 'button', onClick: () => global.location.reload(), style: { ...inputStyle, background: 'var(--v4-sand-act, #c67139)', color: 'var(--v4-btn-on-act, #2b1608)', border: 0, fontWeight: 700 } }, 'Повторить')
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
        React.createElement('button', { type: 'button', onClick: leaveIntake, style: { ...inputStyle, minHeight: 46, background: 'var(--v4-sand-act, #c67139)', color: 'var(--v4-btn-on-act, #2b1608)', border: 0, fontWeight: 700, cursor: 'pointer' } }, 'Вернуться в приложение')
      ));
    }

    return React.createElement('div', shellProps, React.createElement('main', { style: cardStyle },
      resumeGateOpen ? storageNotice(
        'Можно продолжить',
        DRAFT_STORAGE_COPY,
        'Продолжить',
        () => setResumeGateOpen(false),
        null,
        null,
      ) : null,
      closeConfirmOpen ? storageNotice(
        'Закрыть анкету?',
        CLOSE_DRAFT_COPY,
        'Закрыть',
        performClose,
        'Остаться',
        () => setCloseConfirmOpen(false),
      ) : null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', marginBottom: 20 } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 12, color: '#657168', marginBottom: 4 } }, `Шаг ${step + 1} из ${STEPS.length}`),
          React.createElement('div', { style: { fontSize: 12, color: '#657168', marginBottom: 3 } },
            step === 0
              ? 'Обычно занимает до 3 минут'
              : `Осталось примерно ${Math.max(1, Math.round(((STEPS.length - step) / STEPS.length) * 3))} мин`),
          React.createElement('div', { style: { fontSize: 12, color: saveState === 'error' ? '#b42318' : '#657168' } },
            saveState === 'saving' || saveState === 'pending' ? 'Сохраняем…' : saveState === 'saved' ? 'Ответы сохранены' : saveState === 'error' ? 'Ошибка сохранения' : '')
        ),
        React.createElement('button', { type: 'button', onClick: closeSafely, disabled: saveState === 'saving', style: { border: 0, background: 'transparent', color: '#657168', cursor: saveState === 'saving' ? 'wait' : 'pointer', fontSize: 14 } }, 'Закрыть')
      ),
      React.createElement('div', { style: { height: 5, borderRadius: 8, background: '#e8ece9', overflow: 'hidden', marginBottom: 28 } },
        React.createElement('div', { style: { height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, background: 'var(--v4-sand-act, #c67139)', transition: 'width .2s ease' } })
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
              borderRadius: 10, border: 0, background: 'var(--v4-sand-act, #c67139)',
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
      // Строки «одно правило», «шаги 1 и 3», «отправка»: недоступное действие
      // называет причину заранее — строкой над кнопкой, а сама кнопка не
      // нажимается. Прежде «Продолжить» была всегда активна, и человек узнавал
      // о незаполненном поле только после нажатия.
      missingRequired ? React.createElement('div', {
        key: 'blocked-reason',
        style: { marginTop: 22, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4,
          color: 'var(--v4-ink-2, rgba(32, 30, 29, 0.55))' },
      }, step === STEPS.length - 1 ? 'Поставьте галочку выше' : 'Заполните поля со звёздочкой') : null,
      React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: missingRequired ? 10 : 30 } },
        step > 0 ? React.createElement('button', {
          type: 'button', onClick: () => { setError(''); setStep((value) => Math.max(0, value - 1)); },
          style: { ...inputStyle, width: 'auto', minWidth: 108, cursor: 'pointer', fontWeight: 650 },
        }, 'Назад') : null,
        React.createElement('button', {
          type: 'button', onClick: next, disabled: saveState === 'saving' || missingRequired,
          style: { ...inputStyle, minHeight: 48, flex: 1, background: 'var(--v4-sand-act, #c67139)', color: 'var(--v4-btn-on-act, #2b1608)', border: 0,
            cursor: (saveState === 'saving' || missingRequired) ? 'default' : 'pointer', fontWeight: 700,
            opacity: (saveState === 'saving' || missingRequired) ? 0.45 : 1 },
        }, HEYS.WaitMark?.button?.(React, {
          busy: saveState === 'saving',
          ok: saveState === 'saved',
          fail: saveState === 'error',
          idle: step === STEPS.length - 1 ? 'Отправить куратору' : 'Продолжить',
          busyLabel: step === STEPS.length - 1 ? 'Отправляем' : 'Сохраняем',
          okLabel: 'Отправлено',
          failLabel: 'Не удалось',
        }) || (saveState === 'saving'
          ? (step === STEPS.length - 1 ? 'Отправляем' : 'Сохраняем')
          : (step === STEPS.length - 1 ? 'Отправить куратору' : 'Продолжить')))
      )
    ));
  }

  HEYS.TrialIntake = {
    api, ClientScreen, shouldOpen, leaveIntake, EMPTY_ANSWERS, CURATOR_ANSWER_FIELDS,
    WARNING_TEXT_VERSION, WARNING_TEXT_TITLE, WARNING_TEXT_PARAGRAPHS, WARNING_CHECKBOX_LABEL,
  };
})(typeof window !== 'undefined' ? window : globalThis);
