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

  // Строка «счётчик времени»: 10 минут на старте — единственное обещание,
  // остаток на входе в шаги 2–5 вычитается из него (7, 5, 3, меньше минуты).
  const STEP_TIME_LEFT = Object.freeze([
    'Обычно занимает около 10 минут',
    'Осталось примерно 7 минут',
    'Осталось примерно 5 минут',
    'Осталось примерно 3 минуты',
    'Осталось меньше минуты',
  ]);
  // Экран возврата берёт то же число, что шапка шага, на который он ведёт.
  const RESUME_TIME_LEFT = Object.freeze([
    'около 10 минут', 'примерно 7 минут', 'примерно 5 минут', 'примерно 3 минуты', 'меньше минуты',
  ]);

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
      // Строка «финальный экран»: канал назван прямо — у кандидата он один,
      // тот же чат, куда приходил одноразовый код.
      text: 'Куратор изучит ответы и напишет вам в Telegram — в тот же чат, где приходил код.',
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

  // Строка «палитры»: экран собран ролями набора, а не легаси-литералами.
  // Соответствие ролям канваса questionnaire.v4: --bg/--c1/--c2/--tint/--ac/
  // --acs/--on-acs/--gr/--gr-bg. Чернила намеренно остаются литералом: роль
  // --v4-ink в каноничной палитре задана другим значением и сдвинула бы
  // классику (гейт ui-v4-check-classic-drift).
  const INK = '#201e1d';
  const INK_55 = 'var(--v4-ink-2, rgba(0, 0, 0, 0.55))';   // строка «вторичный текст»
  const INK_60 = 'var(--v4-ink-2, rgba(0, 0, 0, 0.6))';
  const INK_40 = 'var(--v4-ink-4, rgba(0, 0, 0, 0.4))';
  const SURFACE_1 = 'var(--v4-card, #f7efe2)';             // --c1
  const SURFACE_2 = 'var(--v4-chip, #efe3cf)';             // --c2
  const FIELD_BG = 'var(--v4-bg, #fffaf1)';                // --bg
  const TINT = 'var(--v4-sand-tint, #f3e0d2)';             // --tint
  const ACCENT_TEXT = 'var(--v4-sand-act-text, #8a4a20)';  // --ac
  const ACCENT_FILL = 'var(--v4-sand-act, #c67139)';       // --acs
  const ON_ACCENT = 'var(--v4-btn-on-act, #2b1608)';       // --on-acs
  const OK_TEXT = 'var(--v4-sand-ok-text, #5c6a45)';       // --gr
  const OK_BG = 'var(--v4-ok-bg, #eaefe0)';                // --gr-bg
  const WARN_TEXT = 'var(--v4-warn-text, #a1471c)';        // --ac2

  const shellStyle = {
    // Роли набора вместо легаси-литералов: экран анкеты был единственным,
    // который не был сведён на v4 и жил на легаси-палитре.
    minHeight: '100vh', background: SURFACE_2, padding: '24px 16px 48px',
    boxSizing: 'border-box', color: INK, fontFamily: 'inherit',
  };
  const cardStyle = {
    // Поля 16/18/20 — шапка/полка кадра на 375 px; карточка повторяет их,
    // чтобы шапка шага не получила двойной отступ (строка «вид шапки шага»).
    maxWidth: 680, margin: '0 auto', background: FIELD_BG, borderRadius: 24,
    border: 'none', boxShadow: '0 18px 50px rgba(40, 24, 8, 0.08)',
    padding: '16px 18px 20px', boxSizing: 'border-box',
  };
  const inputStyle = {
    // Строка «вид карточки вопроса»: поле внутри карточки — фон --bg,
    // радиус 14, высота не меньше 44.
    width: '100%', boxSizing: 'border-box', border: 'none',
    borderRadius: 14, minHeight: 44, padding: '12px 14px', fontSize: 16, lineHeight: 1.45,
    color: INK, background: FIELD_BG, outline: 'none',
  };
  // Строка «вид карточки вопроса»: карточка --c1, радиус 18, поля 14/16.
  const labelStyle = {
    display: 'grid', gap: 8, fontSize: 12.5, fontWeight: 600, color: INK,
    background: SURFACE_1, borderRadius: 18, padding: '14px 16px',
  };
  const hintStyle = { fontSize: 11.5, lineHeight: 1.45, color: INK_55, fontWeight: 500 };
  const titleStyle = { fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-.02em', color: INK, margin: 0 };
  const subtitleStyle = { fontSize: 12.5, fontWeight: 500, lineHeight: 1.55, color: INK_55, margin: '9px 0 0' };
  // Строка «области нажатия»: кнопки футера 48.
  const pillStyle = {
    minHeight: 48, borderRadius: 999, border: 0, padding: '0 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  };
  const primaryPill = { ...pillStyle, flex: 1, background: ACCENT_FILL, color: ON_ACCENT };
  const secondaryPill = { ...pillStyle, minWidth: 96, fontSize: 12.5, background: SURFACE_1, color: INK_55 };

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
      React.createElement('span', { style: { lineHeight: 1.4 } }, label, requiredMark(required)),
      hint ? React.createElement('span', { style: hintStyle }, hint) : null,
      textarea
        ? React.createElement('textarea', controlProps)
        : React.createElement('input', { ...controlProps, type })
    );
  }

  // Строка «обязательные поля»: звёздочка тоном --ac, необязательные не
  // помечены никак.
  function requiredMark(required) {
    return required
      ? React.createElement('span', { key: 'req', style: { color: ACCENT_TEXT } }, ' *')
      : '';
  }

  function SelectField({ label, hint, value, onChange, options, required = false, fieldId = undefined }) {
    return React.createElement('label', { style: labelStyle },
      React.createElement('span', { style: { lineHeight: 1.4 } }, label, requiredMark(required)),
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
          id: 'intake-warning-text',
          role: 'region',
          'aria-label': WARNING_TEXT_TITLE,
          // Строка «доступность»: область прокручивается клавиатурой, значит
          // должна получать фокус сама по себе.
          tabIndex: 0,
          style: {
            // Строка «вид блока предупреждения»: своя область 186 px с
            // настоящей прокруткой — иначе четыре абзаца выталкивают
            // чекбокс за экран, и подтвердить нечем.
            maxHeight: 186, overflowY: 'auto',
            padding: '14px 16px', borderRadius: 18, background: SURFACE_1,
            color: INK, fontSize: 12, lineHeight: 1.6,
            display: 'grid', gap: 10,
          },
        },
          React.createElement('div', { style: { fontWeight: 700, fontSize: 12, lineHeight: 1.35, color: WARN_TEXT } }, WARNING_TEXT_TITLE),
          ...WARNING_TEXT_PARAGRAPHS.map((paragraph, index) => React.createElement('p', {
            key: `warning-p-${index}`,
            style: { margin: 0 },
          }, paragraph)),
        ),
        // Строка «области нажатия»: нажимается вся строка с текстом, а не
        // квадрат 22 px — по нему промахивается половина попыток.
        React.createElement('label', {
          key: 'warning-confirm',
          style: {
            display: 'flex', gap: 11, alignItems: 'flex-start', color: INK,
            fontSize: 12, fontWeight: 600, lineHeight: 1.5,
            minHeight: 44, padding: '11px 0', cursor: 'pointer',
          },
        },
          React.createElement('span', {
            style: {
              position: 'relative', width: 22, height: 22, flex: '0 0 auto', marginTop: 1,
              borderRadius: 6, display: 'grid', placeItems: 'center',
              background: value.acknowledged_at ? ACCENT_FILL : FIELD_BG,
              boxShadow: value.acknowledged_at ? 'none' : 'inset 0 0 0 2px rgba(0, 0, 0, 0.18)',
              color: ON_ACCENT, fontSize: 13, fontWeight: 700, lineHeight: 1,
            },
          },
            React.createElement('input', {
              id: 'intake-acknowledged_at',
              type: 'checkbox',
              // Строка «доступность»: подтверждение связано с текстом, который
              // подтверждают.
              'aria-describedby': 'intake-warning-text',
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
              style: {
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                margin: 0, opacity: 0, cursor: 'pointer',
              },
            }),
            value.acknowledged_at ? '✓' : null
          ),
          React.createElement('span', { style: { flex: 1 } }, WARNING_CHECKBOX_LABEL)
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

  // Строка «содержимое»: в сводку идут ВСЕ заполненные ответы, а не три
  // выбранных. Подписи короткие — они стоят над ответом мелкими прописными,
  // а не слева, поэтому длинный вопрос здесь не нужен.
  const SUMMARY_ROWS = Object.freeze([
    ['goals', 'primary_goal', 'Главная цель'],
    ['goals', 'success_definition', 'Критерий помощи'],
    ['goals', 'time_expectations', 'Срок'],
    ['experience', 'previous_experience', 'Предыдущий опыт'],
    ['experience', 'what_worked', 'Что работало'],
    ['experience', 'what_did_not_work', 'Что не подошло'],
    ['lifestyle', 'schedule', 'Ритм дня'],
    ['lifestyle', 'sleep', 'Сон и восстановление'],
    ['lifestyle', 'activity', 'Активность'],
    ['lifestyle', 'constraints', 'Что мешает присылать данные'],
    ['collaboration', 'daily_tracking', 'Готовность присылать данные'],
    ['collaboration', 'feedback_style', 'Обратная связь'],
    ['collaboration', 'expectations_from_curator', 'Чего ждёте от куратора'],
  ]);

  function ReviewSummary({ answers, onEdit }) {
    const rows = SUMMARY_ROWS
      .map(([section, key, label]) => [label, answers[section]?.[key]])
      .filter(([, value]) => String(value || '').trim());
    const warningConfirmed = Boolean(String(answers.warning?.acknowledged_at || '').trim());

    return React.createElement('section', { style: { display: 'grid', gap: 14 } },
      React.createElement('div', null,
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: INK } }, 'Проверьте ответы перед отправкой'),
        React.createElement('div', { style: { marginTop: 9, color: INK_55, fontSize: 12, fontWeight: 500, lineHeight: 1.55 } },
          'Цель, опыт, готовность присылать данные. Куратор разберёт анкету вручную, любой ответ можно поправить до отправки.')
      ),
      // Строка «вид сводки»: карточка --c1 радиусом 20 с полями 2/16.
      React.createElement('div', {
        style: { background: SURFACE_1, borderRadius: 20, padding: '2px 16px' },
      }, rows.map(([label, value], index) => React.createElement('div', {
        key: label,
        style: {
          padding: '11px 0',
          borderBottom: index === rows.length - 1 ? 'none' : '1px solid rgba(0, 0, 0, 0.07)',
        },
      },
        React.createElement('div', {
          style: { fontSize: 9.5, fontWeight: 700, lineHeight: 1, letterSpacing: '.14em', textTransform: 'uppercase', color: INK_40 },
        }, label),
        React.createElement('div', {
          style: { marginTop: 5, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: INK },
        }, reviewValue(value))
      ))),
      React.createElement('div', { style: { fontSize: 11, fontWeight: 500, lineHeight: 1.5, color: INK_55 } },
        'Все заполненные ответы. Пропущенные необязательные поля в список не попадают — их и не отправляем.'),
      React.createElement('div', {
        role: 'status',
        style: {
          display: 'grid', gap: 5, borderRadius: 16, padding: '12px 14px',
          background: warningConfirmed ? OK_BG : TINT,
          color: warningConfirmed ? OK_TEXT : WARN_TEXT,
        }
      },
        React.createElement('div', { style: { fontSize: 11.5, fontWeight: 600, lineHeight: 1.4 } },
          warningConfirmed ? 'Предупреждение подтверждено' : 'Подтвердите предупреждение перед отправкой'),
        React.createElement('div', { style: { fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: INK_55 } },
          warningConfirmed ? 'Вы подтвердили, что прочитали предупреждение перед анкетой.' : 'Вернитесь к шагу с предупреждением и поставьте галочку подтверждения.')
      ),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
        React.createElement('button', {
          type: 'button', onClick: () => onEdit('goals'),
          style: { ...secondaryPill, flex: '0 0 auto' },
        }, 'Правки'),
        React.createElement('button', {
          type: 'button', onClick: () => onEdit('warning'),
          style: {
            ...pillStyle, flex: '1 1 200px', fontSize: 12.5,
            background: 'transparent', color: ACCENT_TEXT,
          },
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
    const [restartConfirmOpen, setRestartConfirmOpen] = React.useState(false);
    // Строка «ошибка отправки»: обещать «ответы сохранены» можно только когда
    // упала именно отправка — при упавшем автосохранении это было бы ложью.
    const [submitFailed, setSubmitFailed] = React.useState(false);
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
      setSubmitFailed(false);
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
            node.scrollIntoView({ block: 'center' });
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
        // Строка «анимаций нет»: переход между шагами — мгновенная смена
        // состояния, без плавной прокрутки.
        global.scrollTo?.({ top: 0 });
        return;
      }
      setSaveState('saving');
      const result = await enqueueSave(answersRef.current, step, true);
      if (result.success) {
        setStatus('completed');
        setSaveState('saved');
        setSaveErrorCode('');
        setSubmitFailed(false);
      } else {
        if (result.status && result.error === 'intake_locked') setStatus(result.status);
        setSaveState('error');
        setSaveErrorCode(result.error || 'request_failed');
        setSubmitFailed(true);
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
      // Строка «ошибка отправки»: повтор после неудачной отправки должен
      // отправлять, а не просто досохранять черновик.
      if (submitFailed) {
        setError('');
        await next();
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
        width: 'min(100%, 420px)', background: FIELD_BG, borderRadius: 24,
        border: 'none', boxShadow: '0 18px 50px rgba(40, 24, 8, 0.16)',
        padding: '20px 18px 18px', boxSizing: 'border-box',
      },
    },
      React.createElement('h2', { style: { ...titleStyle, marginBottom: 9 } }, title),
      typeof body === 'string'
        ? React.createElement('p', { style: { ...subtitleStyle, margin: '0 0 16px' } }, body)
        : React.createElement('div', { style: { margin: '9px 0 16px' } }, body),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        // Строка «Начать заново»: вторичное действие стоит слева и тоном ниже.
        secondaryLabel ? React.createElement('button', {
          type: 'button', onClick: onSecondary, style: { ...secondaryPill, minWidth: 110 },
        }, secondaryLabel) : null,
        React.createElement('button', {
          type: 'button', onClick: onPrimary, disabled: saveState === 'saving',
          style: {
            ...primaryPill,
            cursor: saveState === 'saving' ? 'wait' : 'pointer',
            opacity: saveState === 'saving' ? 0.65 : 1,
          },
        }, primaryLabel)
      )
    ));

    // Строка «возврат»: вернувшийся сначала хочет понять, сколько сделано и
    // сколько осталось, — поэтому шаг назван прямо, шаги перечислены с
    // отметками, а остаток берётся тот же, что покажет шапка этого шага.
    const resumeBody = React.createElement('div', { style: { display: 'grid', gap: 14 } },
      React.createElement('div', { style: subtitleStyle },
        `${step} ${step === 1 ? 'шаг заполнен' : 'шага заполнены'} и сохранены. Осталось ${RESUME_TIME_LEFT[step] || RESUME_TIME_LEFT[0]}.`),
      React.createElement('div', { style: { background: SURFACE_1, borderRadius: 20, padding: '2px 16px' } },
        STEPS.map((item, index) => {
          const done = index < step;
          const currentRow = index === step;
          return React.createElement('div', {
            key: item.id,
            style: {
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0',
              borderBottom: index === STEPS.length - 1 ? 'none' : '1px solid rgba(0, 0, 0, 0.07)',
            },
          },
            React.createElement('span', {
              style: {
                width: 22, height: 22, flex: 'none', borderRadius: 999,
                display: 'grid', placeItems: 'center',
                fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                background: done ? OK_BG : currentRow ? ACCENT_FILL : SURFACE_2,
                color: done ? OK_TEXT : currentRow ? ON_ACCENT : INK_55,
              },
            }, done ? '✓' : String(index + 1)),
            React.createElement('span', {
              style: { flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: done || currentRow ? INK : INK_55 },
            }, item.title),
            currentRow ? React.createElement('span', {
              style: { flex: 'none', fontSize: 10.5, fontWeight: 600, lineHeight: 1, color: ACCENT_TEXT },
            }, 'продолжить') : null
          );
        })),
      React.createElement('div', {
        style: { background: SURFACE_1, borderRadius: 18, padding: '14px 15px', fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, color: INK_55 },
      }, DRAFT_STORAGE_COPY)
    );

    const performRestart = async () => {
      setRestartConfirmOpen(false);
      setResumeGateOpen(false);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const fresh = mergeAnswers(null);
      setAnswers(fresh);
      answersRef.current = fresh;
      setStep(0);
      setHasEdited(false);
      setError('');
      setSaveState('saving');
      const result = await enqueueSave(fresh, 0, false);
      if (result.success) {
        setStatus(result.status || 'in_progress');
        setSaveState('saved');
        setSaveErrorCode('');
      } else {
        setSaveState('error');
        setSaveErrorCode(result.error || 'request_failed');
        setError(saveErrorCopy(result));
      }
    };

    if (loading) {
      return React.createElement('div', shellProps,
        window.HEYS?.WaitMark?.render?.(React, { mode: 'screen', title: 'Загружаем анкету', text: 'Пара секунд.' })
        || React.createElement('div', { style: cardStyle }, 'Загружаем анкету…')
      );
    }
    if (error && !hydrated) return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: titleStyle }, 'Не удалось открыть анкету'),
      React.createElement('p', { style: subtitleStyle }, error),
      React.createElement('button', { type: 'button', onClick: () => global.location.reload(), style: { ...primaryPill, marginTop: 18 } }, 'Повторить')
    ));

    if (status === 'not_invited') return React.createElement('div', shellProps, React.createElement('div', { style: cardStyle },
      React.createElement('h1', { style: titleStyle }, 'Приглашение не найдено'),
      React.createElement('p', { style: subtitleStyle }, 'Попросите куратора повторно отправить приглашение.'),
      React.createElement('button', { type: 'button', onClick: leaveIntake, style: { ...secondaryPill, marginTop: 18 } }, 'Вернуться в приложение')
    ));

    if (STATUS_COPY[status]) {
      const copy = STATUS_COPY[status];
      // Строка «вид финала»: содержимое по центру колонкой — круг 60 фоном
      // --gr-bg с галочкой 28 тоном --gr, через 18 заголовок 20/700, через 9
      // текст 12,5/500 тоном чернил 55 %. У отправленной анкеты кнопки нет:
      // следующий шаг человека — не приложение, а Telegram.
      const isFinal = status === 'completed';
      return React.createElement('div', shellProps, React.createElement('div', { style: { ...cardStyle, padding: '34px 18px 20px' } },
        React.createElement('div', { style: { display: 'grid', justifyItems: 'center', textAlign: 'center' } },
          React.createElement('div', {
            style: {
              width: 60, height: 60, borderRadius: 999,
              background: status === 'rejected' ? SURFACE_1 : OK_BG,
              color: status === 'rejected' ? INK_55 : OK_TEXT,
              display: 'grid', placeItems: 'center', fontSize: 28, lineHeight: 1,
            },
          }, status === 'rejected' ? '·' : '✓'),
          React.createElement('h1', { style: { margin: '18px 0 0', fontSize: 20, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-.02em', color: INK } }, copy.title),
          React.createElement('p', { style: { margin: '9px 0 0', fontSize: 12.5, fontWeight: 500, lineHeight: 1.55, color: INK_55 } }, copy.text)
        ),
        React.createElement('div', {
          style: {
            display: 'grid', gap: 2, margin: '20px 0 16px', padding: '6px 16px',
            borderRadius: 20, background: SURFACE_1,
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
          style: {
            display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0',
            color: done ? INK : INK_55, fontSize: 12.5, fontWeight: 600, lineHeight: 1.35,
          }
        },
          React.createElement('span', {
            style: {
              width: 20, height: 20, flex: 'none', borderRadius: 999,
              display: 'grid', placeItems: 'center', fontSize: 11, lineHeight: 1,
              background: done ? OK_BG : SURFACE_2,
              color: done ? OK_TEXT : INK_55,
            }
          }, done ? '✓' : '·'),
          label
        ))),
        isFinal
          ? React.createElement('div', { style: { fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, color: INK_55, textAlign: 'center' } },
            'Приложение откроется после согласования даты старта.')
          : React.createElement('button', { type: 'button', onClick: leaveIntake, style: primaryPill }, 'Вернуться в приложение')
      ));
    }

    return React.createElement('div', shellProps, React.createElement('main', { style: cardStyle },
      resumeGateOpen && !restartConfirmOpen ? storageNotice(
        `Продолжим с шага ${step + 1}`,
        resumeBody,
        'Продолжить',
        () => setResumeGateOpen(false),
        // Многоточие говорит, что дальше будет вопрос, а не действие.
        'Начать заново…',
        () => setRestartConfirmOpen(true),
      ) : null,
      restartConfirmOpen ? storageNotice(
        'Начать анкету заново?',
        'Заполненные ответы и подтверждение предупреждения будут стёрты. Вернуться к ним не получится.',
        'Начать заново',
        performRestart,
        'Отмена',
        () => setRestartConfirmOpen(false),
      ) : null,
      closeConfirmOpen ? storageNotice(
        'Закрыть анкету?',
        CLOSE_DRAFT_COPY,
        'Закрыть',
        performClose,
        'Остаться',
        () => setCloseConfirmOpen(false),
      ) : null,
      // Строка «вид шапки шага»: слева «Шаг N из 5» 12/600 чернилами и под ним
      // через 6 обещание времени 11/500 тоном чернил 55 %, справа «Закрыть»
      // 12/600 тоном --ac с областью 44×64, вынесенной в поля.
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 12, fontWeight: 600, lineHeight: 1, color: INK } }, `Шаг ${step + 1} из ${STEPS.length}`),
          React.createElement('div', { style: { marginTop: 6, fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: INK_55 } },
            STEP_TIME_LEFT[step] || STEP_TIME_LEFT[0]),
          // Строка «Ответы сохранены» — со второго шага: на первом сохранять
          // нечего, и строка была бы ложью.
          (step > 0 && ['pending', 'saving', 'saved'].includes(saveState)) || saveState === 'error'
            ? React.createElement('div', {
              style: {
                marginTop: 6, fontSize: 11, fontWeight: 500, lineHeight: 1,
                color: saveState === 'error' ? WARN_TEXT : OK_TEXT,
              },
            }, saveState === 'saving' || saveState === 'pending' ? 'Сохраняем…' : saveState === 'saved' ? 'Ответы сохранены' : 'Ошибка сохранения')
            : null
        ),
        React.createElement('button', {
          type: 'button', onClick: closeSafely, disabled: saveState === 'saving',
          style: {
            minHeight: 44, minWidth: 64, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            border: 0, background: 'transparent', color: ACCENT_TEXT, padding: 0, margin: '-2px -4px 0 0',
            fontSize: 12, fontWeight: 600, lineHeight: 1,
            cursor: saveState === 'saving' ? 'wait' : 'pointer',
          },
        }, 'Закрыть')
      ),
      // Строка «доступность»: полоса прогресса — настоящий progressbar с
      // подписью, а не декоративная плашка. Строка «анимаций нет»: заливка
      // меняется мгновенно.
      React.createElement('div', {
        role: 'progressbar',
        'aria-valuemin': 1,
        'aria-valuemax': STEPS.length,
        'aria-valuenow': step + 1,
        'aria-label': `Шаг ${step + 1} из ${STEPS.length}`,
        style: { height: 4, borderRadius: 999, background: 'rgba(0, 0, 0, 0.1)', overflow: 'hidden', marginTop: 14 },
      },
        React.createElement('div', { style: { height: 4, borderRadius: 999, width: `${((step + 1) / STEPS.length) * 100}%`, background: ACCENT_FILL } })
      ),
      status === 'needs_clarification' ? React.createElement('div', {
        role: 'status',
        style: { padding: '14px 15px', borderRadius: 18, background: TINT, color: INK, fontSize: 12, lineHeight: 1.55, marginTop: 14 }
      },
        React.createElement('div', { style: { fontWeight: 700, marginBottom: 6, color: WARN_TEXT } }, 'Куратор просит уточнить'),
        React.createElement('div', { style: { whiteSpace: 'pre-wrap' } },
          clarification.text || 'Проверьте ответы и дополните отмеченные разделы.'),
        clarification.sections.length
          ? React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 } },
            clarification.sections.map((section) => React.createElement('span', {
              key: section,
              style: {
                padding: '4px 8px', borderRadius: 999,
                background: FIELD_BG, border: 0,
                fontSize: 11.5, fontWeight: 600, color: INK,
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
            style: { ...pillStyle, marginTop: 12, background: ACCENT_FILL, color: ON_ACCENT, fontSize: 12.5 }
          }, 'Перейти к нужному разделу')
          : null
      ) : null,
      // Строка «вид плашки доступа»: фон --tint, радиус 18, поля 13/15,
      // текст 11,5/500 тоном чернил 60 %; иконок и обводки нет.
      step === 0 ? React.createElement('div', {
        style: {
          padding: '13px 15px', borderRadius: 18, background: TINT,
          color: INK_60, fontSize: 11.5, fontWeight: 500, lineHeight: 1.55, marginTop: 14,
        }
      }, 'Ответы видите вы и назначенный куратор. Анкета не гарантирует пробную неделю.') : null,
      React.createElement('h1', { style: { ...titleStyle, marginTop: 20 } }, current.title),
      React.createElement('p', { style: { ...subtitleStyle, marginBottom: 13 } }, current.subtitle),
      // Строка «вид карточки вопроса»: зазор между карточками 8.
      React.createElement('div', { style: { display: 'grid', gap: 8 } }, current.render(
        answers[current.id] || {},
        (key, value) => setSectionValue(current.id, key, value)
      )),
      step === STEPS.length - 1 ? React.createElement('div', { style: { marginTop: 16 } },
        React.createElement(ReviewSummary, {
          answers,
          onEdit: (sectionId) => {
            const target = STEPS.findIndex((item) => item.id === sectionId);
            if (target >= 0) setStep(target);
          },
        })
      ) : null,
      // Строка «ошибка отправки»: не выбрасывает из анкеты — заголовок
      // называет причину, отдельная строка подтверждает, что сохранены и
      // ответы, и подтверждение предупреждения, а вторым выходом остаётся тот
      // же чат, где приходил код.
      error ? React.createElement('div', {
        role: 'alert',
        style: { marginTop: 14, padding: 15, borderRadius: 18, background: TINT, display: 'grid', gap: 7 },
      },
        submitFailed
          ? React.createElement('div', { style: { fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, color: WARN_TEXT } }, 'Анкета не отправилась')
          : null,
        React.createElement('div', { style: { fontSize: 11.5, fontWeight: 500, lineHeight: 1.55, color: INK_55 } }, error),
        submitFailed ? React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: OK_TEXT },
        }, '✓', 'Ответы и подтверждение предупреждения сохранены') : null,
        submitFailed ? React.createElement('div', { style: { fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, color: INK_55 } },
          'Если не получается несколько раз — напишите в тот же чат, где приходил код: куратор откроет анкету вручную.') : null
      ) : null,
      saveState === 'error' ? React.createElement('button', {
        type: 'button', onClick: retrySave,
        style: { ...secondaryPill, marginTop: 10, minHeight: 44, background: SURFACE_1, color: INK },
      }, saveErrorCode === 'stale_draft'
        ? 'Загрузить актуальную версию'
        : saveErrorCode === 'invalid_session'
          ? 'Войти снова'
          : ['health_consent_required', 'intake_locked'].includes(saveErrorCode)
            ? 'Обновить состояние'
            : submitFailed
              ? 'Отправить ещё раз'
              : 'Повторить сохранение') : null,
      // Строки «одно правило», «шаги 1 и 3», «отправка»: недоступное действие
      // называет причину заранее — строкой над кнопкой, а сама кнопка не
      // нажимается. Прежде «Продолжить» была всегда активна, и человек узнавал
      // о незаполненном поле только после нажатия.
      missingRequired ? React.createElement('div', {
        key: 'blocked-reason',
        // Строка «доступность»: причина озвучивается как описание кнопки, а не
        // алертом после нажатия — поэтому у неё свой id, а не role="alert".
        id: 'intake-blocked-reason',
        style: { marginTop: 22, fontSize: 11, fontWeight: 500, lineHeight: 1.45,
          textAlign: 'center', color: INK_55 },
      }, step === STEPS.length - 1 ? 'Поставьте галочку выше' : 'Заполните поля со звёздочкой') : null,
      React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: missingRequired ? 9 : 20 } },
        step > 0 ? React.createElement('button', {
          type: 'button', onClick: () => { setError(''); setStep((value) => Math.max(0, value - 1)); },
          style: secondaryPill,
        }, 'Назад') : null,
        // Роль набора здесь развёрнута, а не константой: на неё смотрит тест
        // intake-v4-blocked-action.
        React.createElement('button', {
          type: 'button', onClick: next, disabled: saveState === 'saving' || missingRequired,
          'aria-describedby': missingRequired ? 'intake-blocked-reason' : undefined,
          style: { ...primaryPill, minHeight: 48,
            background: missingRequired ? SURFACE_1 : 'var(--v4-sand-act, #c67139)',
            color: missingRequired ? INK : ON_ACCENT,
            cursor: (saveState === 'saving' || missingRequired) ? 'default' : 'pointer',
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
