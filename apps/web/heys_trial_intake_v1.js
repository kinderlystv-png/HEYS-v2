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
  // Строки «пределы и формат» и «вид блока предупреждения» (решение владельца
  // 25 августа): барьер 18+ стоит отдельной отметкой рядом с подтверждением
  // предупреждения и так же блокирует отправку. Текст — дословно из контракта;
  // кадр «Анкета · шаг 5» рисует «Мне есть 18 лет», но контракт старше кадра.
  const AGE_CONFIRM_CHECKBOX_LABEL = 'Мне есть 18';
  // Отметка живёт только на устройстве. Серверный валидатор разрешает в разделе
  // `warning` ровно два поля — acknowledged_at и text_version
  // (scripts/db/migrations/2026-08-11_health_minimization_intake_v1.sql:77-79),
  // и третье уронило бы КАЖДОЕ сохранение с `unknown_answer_field`. Само
  // утверждение «мне 18 лет или больше» при этом на сервере есть: оно входит в
  // текст подтверждения предупреждения, который хранится с версией.
  const LOCAL_ONLY_WARNING_FIELDS = Object.freeze(['age_confirmed_at']);

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
  // --acs/--on-acs/--gr/--gr-bg. Чернила сведены на роль 24.08, когда сняли
  // гейт classic-drift: он ронял подстановку --v4-ink из-за каноничной
  // палитры, а её больше нет. Фон карточек уже шёл ролями, так что в тёмных
  // наборах чернила-литерал давали тёмное по тёмному.
  const INK = 'var(--v4-ink, #201e1d)';
  const INK_55 = 'var(--v4-ink-2, rgba(0, 0, 0, 0.55))';   // строка «вторичный текст»
  const INK_60 = 'var(--v4-ink-2, rgba(0, 0, 0, 0.6))';
  const INK_40 = 'var(--v4-ink-4, rgba(0, 0, 0, 0.4))';
  const SURFACE_1 = 'var(--v4-card, #f7efe2)';             // --c1
  const SURFACE_2 = 'var(--v4-chip, #efe3cf)';             // --c2
  const FIELD_BG = 'var(--v4-bg, #fffaf1)';                // --bg
  // Роли общие, не с именем набора: по решению владельца 31 августа
  // --v4-<набор>-* в модуле запирает цвет мимо выбора человека — в синих темах
  // песочная роль держит терракоту.
  //
  // TINT переехал не только по имени: --v4-sand-tint это #f3e0d2, тон капсулы
  // прошлого дня (был --v4-past, роль снята ответом дизайнера №13 — теперь и
  // там --v4-tint), а подложка-подсказка --v4-tint — #f6e6dd.
  // Тона похожи, потому подмена и не бросалась в глаза; строки «вид плашки
  // доступа» и «вид блока предупреждения» зовут именно --tint.
  const TINT = 'var(--v4-tint, #f6e6dd)';                  // --tint
  const ACCENT_TEXT = 'var(--v4-act-text, #8a4a20)';       // --ac
  const ACCENT_FILL = 'var(--v4-act, #c67139)';            // --acs
  const ON_ACCENT = 'var(--v4-btn-on-act, #2b1608)';       // --on-acs
  const OK_TEXT = 'var(--v4-ok-text, #5c6a45)';            // --gr
  const OK_BG = 'var(--v4-ok-bg, #eaefe0)';                // --gr-bg
  const WARN_TEXT = 'var(--v4-warn-text, #a1471c)';        // --ac2

  const shellStyle = {
    // Роли набора вместо легаси-литералов: экран анкеты был единственным,
    // который не был сведён на v4 и жил на легаси-палитре.
    minHeight: '100vh', background: SURFACE_2,
    // Строка «safe-area и кнопка назад»: верх/низ экрана прижаты к краю —
    // базовые 24/48 остаются, врезки добавляются поверх них.
    padding: '24px 16px 48px',
    paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
    paddingBottom: 'calc(48px + env(safe-area-inset-bottom, 0px))',
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

  /** Убирает из посылки поля, которые серверная схема не знает (см. выше). */
  function stripLocalOnlyAnswers(answers) {
    const source = answers && typeof answers === 'object' ? answers : {};
    const warning = { ...(source.warning || {}) };
    LOCAL_ONLY_WARNING_FIELDS.forEach((field) => { delete warning[field]; });
    return { ...source, warning };
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
        p_answers: stripLocalOnlyAnswers(answers),
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

  // Строка «порядок: согласие раньше данных» (questionnaire.v4): предупреждение
  // и барьер 18+ — первый шаг; черновик и поля открываются только после обеих
  // отметок.
  const STEP_ORDER_FLAG = 'consent-first';

  function isConsentComplete(answers) {
    return Boolean(
      String(answers?.warning?.acknowledged_at || '').trim()
      && String(answers?.warning?.age_confirmed_at || '').trim()
    );
  }

  function normalizeLoadedStep(serverStep, answers) {
    if (!isConsentComplete(answers)) return 0;
    const step = Math.max(0, Math.min(STEPS.length - 1, Number(serverStep) || 0));
    if (String(answers?.meta?.step_order || '') === STEP_ORDER_FLAG) return step;
    // Legacy: warning был пятым (index 4), контент — 0..3.
    if (step === 4) return 4;
    return Math.min(STEPS.length - 1, step + 1);
  }

  function withStepOrderMeta(answers) {
    return {
      ...answers,
      meta: {
        ...(answers.meta || {}),
        schema_version: '1.2',
        step_order: STEP_ORDER_FLAG,
      },
    };
  }

  function hasContentAnswers(answers) {
    return ['goals', 'experience', 'lifestyle', 'collaboration'].some((section) => (
      Object.values(answers?.[section] || {}).some((value) => String(value || '').trim())
    ));
  }

  // ── Локальная копия черновика ────────────────────────────────────────────
  // Строка «что пишется» (questionnaire.v4, переписана 25 августа): ответы
  // пишутся в черновик на сервере после каждого шага И дублируются локально,
  // чтобы анкета открывалась и заполнялась без сети; локальная копия удаляется
  // после отправки. То же поведение описывает строка «офлайн» той же зоны.
  //
  // ОТСТУПЛЕНИЕ, названное вслух: строка «хранение» того же контракта всё ещё
  // запрещает браузерное хранилище целиком — это прежняя редакция, с которой
  // «что пишется» и «офлайн» спорят вдвоём. Реализовано по двум переписанным
  // строкам; «хранение» ждёт правки у дизайнера.
  const DRAFT_LOCAL_KEY_NAME = 'trial_intake_draft_v1';
  const DRAFT_LOCAL_VERSION = 1;
  // Кандидат ещё не клиент: `clientId` у него нет по построению — гейт открывает
  // анкету по ветке `!clientId && hasCandidateSessionHint` (heys_app_gate_flow_v1
  // ~:3003), а клиентская ветка требует `clientId` (`consentEligible`). Поэтому
  // два пространства имён никогда не пересекаются, и кандидатский черновик не
  // может быть прочитан под клиентским ключом.
  const DRAFT_CANDIDATE_SCOPE = 'candidate';

  function draftScope() {
    const clientId = String(global.HEYS?.currentClientId || '').trim().toLowerCase();
    if (clientId) return clientId;
    return api.isCandidate() ? DRAFT_CANDIDATE_SCOPE : '';
  }

  // Ключ всегда привязан к текущему владельцу: `heys_<scope>_trial_intake_draft_v1`.
  // Скана по localStorage здесь нет вовсе — читается ровно один вычисленный
  // ключ, поэтому чужой черновик недостижим по построению, а не по фильтру.
  // Без владельца (ни клиента, ни кандидата) локальная копия не пишется: писать
  // ответы «неизвестно чей анкеты» опаснее, чем остаться без офлайна.
  function draftKey() {
    const scope = draftScope();
    return scope ? `heys_${scope}_${DRAFT_LOCAL_KEY_NAME}` : '';
  }

  function readLocalDraft() {
    const key = draftKey();
    if (!key) return null;
    try {
      const raw = global.localStorage?.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== DRAFT_LOCAL_VERSION) return null;
      // Вторая линия к ключу: значение помнит свой scope, и чужое не читается,
      // даже если ключ каким-то образом пережил смену владельца сессии.
      if (String(parsed.scope || '') !== draftScope()) return null;
      const mergedAnswers = mergeAnswers(parsed.answers);
      // Строка «порядок: согласие раньше данных»: до галочки черновика быть
      // не должно — отбрасываем локальную копию с полями, но без согласия.
      if (!isConsentComplete(mergedAnswers) && hasContentAnswers(mergedAnswers)) return null;
      return {
        answers: mergeAnswers(parsed.answers),
        step: Math.max(0, Math.min(STEPS.length - 1, Number(parsed.step) || 0)),
        owner: String(parsed.owner || ''),
        baseUpdatedAt: parsed.baseUpdatedAt || null,
        dirty: parsed.dirty === true,
      };
    } catch (_) {
      return null;
    }
  }

  function writeLocalDraft(draft) {
    const key = draftKey();
    if (!key) return;
    try {
      // Через штатный `localStorage.setItem`: перехватчик heys_storage_supabase
      // маршрутизирует облако сам, и обходить его сохранённой копией
      // оригинального метода нельзя.
      // В облако этот ключ при этом не уезжает: его базовое имя не числится
      // client-specific (`needsClientStorage` → false), а user-level путь
      // `cloud.saveKey` останавливается на `!user` — supabase-пользователя ни у
      // кандидатской, ни у PIN-сессии нет. Так и задумано: ответы анкеты живут
      // на сервере только шифрованными, в trial_intakes/trial_candidates.
      global.localStorage?.setItem(key, JSON.stringify({
        v: DRAFT_LOCAL_VERSION,
        scope: draftScope(),
        owner: draft.owner || '',
        step: draft.step,
        answers: draft.answers,
        baseUpdatedAt: draft.baseUpdatedAt || null,
        dirty: draft.dirty === true,
        savedAt: new Date().toISOString(),
      }));
    } catch (_) {
      // Приватный режим или переполненная квота: анкета продолжает работать
      // по сети, просто без офлайна.
    }
  }

  function clearLocalDraft() {
    const key = draftKey();
    if (!key) return;
    try { global.localStorage?.removeItem(key); } catch (_) { /* нечего чистить */ }
  }

  // Отказ сети или вердикт сервера. Вердикт (устаревший черновик, закрытая
  // анкета, истёкшая сессия, невалидные ответы) локальной копией не лечится:
  // шаг не переводим и ошибку показываем как раньше. Транспортный отказ —
  // наоборот: строка «офлайн» требует, чтобы шаги заполнялись и без сети.
  function isNetworkFailure(code) {
    const value = String(code || '');
    if (!value) return false;
    if (['NETWORK_ERROR', 'request_failed', 'api_not_ready'].includes(value)) return true;
    // HTTP-статус приходит числом (heys_yandex_api_v1 rpc): 5xx и 0 — это не
    // вердикт анкеты, а недоступный сервер.
    const status = Number(value);
    return Number.isFinite(status) && (status === 0 || status >= 500);
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

  // Строка «вид блока предупреждения»: квадрат 22 px радиусом 6, зазор 11.
  // Строка «области нажатия»: нажимается вся строка с текстом, а не квадрат
  // 22 px — по нему промахивается половина попыток, поэтому 44 px держит сама
  // строка, а не поля вокруг квадрата.
  function warningMark({ field, label, checked, onToggle }) {
    return React.createElement('label', {
      key: `warning-mark-${field}`,
      style: {
        display: 'flex', gap: 11, alignItems: 'flex-start', color: INK,
        fontSize: 12, fontWeight: 600, lineHeight: 1.5,
        minHeight: 44, cursor: 'pointer',
      },
    },
      React.createElement('span', {
        style: {
          position: 'relative', width: 22, height: 22, flex: '0 0 auto', marginTop: 1,
          borderRadius: 6, display: 'grid', placeItems: 'center',
          background: checked ? ACCENT_FILL : FIELD_BG,
          boxShadow: checked ? 'none' : 'inset 0 0 0 2px rgba(0, 0, 0, 0.18)',
          color: ON_ACCENT, fontSize: 13, fontWeight: 700, lineHeight: 1,
        },
      },
        React.createElement('input', {
          id: `intake-${field}`,
          type: 'checkbox',
          // Строка «доступность»: подтверждение связано с текстом, который
          // подтверждают.
          'aria-describedby': 'intake-warning-text',
          checked,
          onChange: (event) => onToggle(event.target.checked),
          style: {
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            margin: 0, opacity: 0, cursor: 'pointer',
          },
        }),
        checked ? '✓' : null
      ),
      React.createElement('span', { style: { flex: 1 } }, label)
    );
  }

  const STEPS = [
    {
      id: 'warning', title: 'Важная информация',
      subtitle: 'Прочитайте предупреждение и подтвердите, что готовы продолжить.',
      // Строка «вид блока предупреждения»: обе отметки блокируют отправку.
      required: ['acknowledged_at', 'age_confirmed_at'],
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
            // Строка «вид блока предупреждения» (переписана 25 августа): текст
            // предупреждения выделяется и копируется — человек имеет право
            // сохранить или показать то, что подтверждает. Это названное
            // исключение из строки «язык, выделение, часовой пояс», которая
            // всё ещё зовёт его служебным: она прежней редакции.
            userSelect: 'text',
            WebkitUserSelect: 'text',
          },
        },
          React.createElement('div', { style: { fontWeight: 700, fontSize: 12, lineHeight: 1.35, color: WARN_TEXT } }, WARNING_TEXT_TITLE),
          ...WARNING_TEXT_PARAGRAPHS.map((paragraph, index) => React.createElement('p', {
            key: `warning-p-${index}`,
            style: { margin: 0 },
          }, paragraph)),
        ),
        // Строка «вид блока предупреждения»: под областью две отметки подряд —
        // подтверждение предупреждения и «Мне есть 18». Обе блокируют отправку.
        // Обе живут в одном контейнере: шаг между ними 10, а не зазор сетки 8.
        React.createElement('div', {
          key: 'warning-marks',
          style: { display: 'grid', gap: 10, marginTop: 8 },
        },
          warningMark({
            field: 'acknowledged_at',
            label: WARNING_CHECKBOX_LABEL,
            checked: Boolean(value.acknowledged_at),
            onToggle: (checked) => {
              set('acknowledged_at', checked ? new Date().toISOString() : '');
              set('text_version', checked ? WARNING_TEXT_VERSION : '');
            },
          }),
          warningMark({
            field: 'age_confirmed_at',
            label: AGE_CONFIRM_CHECKBOX_LABEL,
            checked: Boolean(value.age_confirmed_at),
            onToggle: (checked) => set('age_confirmed_at', checked ? new Date().toISOString() : ''),
          })
        ),
      ],
    },
    {
      id: 'goals', title: 'Цели и ожидания',
      // Копия по кадру «Анкета · шаг 2»: «расходится копия в коде — верна строка».
      subtitle: 'Опишите желаемый результат своими словами — правильных ответов здесь нет.',
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
      // Кадр «Анкета · шаг 4» и строка «слова на экране» сходятся: обращения от лица
      // команды на экране нет. Стояло «Нам нужен реальный контекст».
      subtitle: 'Нужен реальный контекст, а не идеальная неделя.',
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
    age_confirmed_at: AGE_CONFIRM_CHECKBOX_LABEL,
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

  // Строка «вид сводки»: пояснение 12/500 тоном чернил 55 %, через 14 карточка
  // --c1 радиусом 20 с полями 2/16; внутри строки — подпись 9,5/700 прописными
  // тоном чернил 40 %, ответ 12,5/600 чернилами, поля 11 по вертикали,
  // разделитель 1 px тоном чернил 7 %.
  // Отступления от кадра «Анкета · сводка» (верен контракт): кадр красит
  // подпись тоном чернил 55 % — здесь 40 %; кадр даёт ответ 12 px — здесь 12,5.
  // Шапка со стрелкой назад и «Ваши ответы» живёт в ClientScreen: она обрамляет
  // экран, а не сводку, и footer сводки собирается из состояния отправки.
  function ReviewSummary({ answers }) {
    const rows = SUMMARY_ROWS
      .map(([section, key, label]) => [label, answers[section]?.[key]])
      .filter(([, value]) => String(value || '').trim());

    return React.createElement('section', { style: { display: 'grid', gap: 14 } },
      React.createElement('div', { style: { fontSize: 12, fontWeight: 500, lineHeight: 1.55, color: INK_55 } },
        'Куратор разберёт анкету вручную. Любой ответ можно поправить до отправки.'),
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
        'Все заполненные ответы. Пропущенные необязательные поля в список не попадают — их и не отправляем.')
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
    // Строка «место»: сводка — отдельный экран, а не блок внутри шага 5.
    const [reviewOpen, setReviewOpen] = React.useState(false);
    // Строка «ошибка отправки»: обещать «ответы сохранены» можно только когда
    // упала именно отправка — при упавшем автосохранении это было бы ложью.
    const [submitFailed, setSubmitFailed] = React.useState(false);
    // Строка «офлайн»: ответы уже лежат локально, но ещё не доехали на сервер.
    const [localOnly, setLocalOnly] = React.useState(false);
    const localOnlyRef = React.useRef(false);
    const stepRef = React.useRef(0);
    // Владелец черновика по версии сервера: candidate_id у кандидата, scope
    // клиента — у клиентской сессии. Нужен, чтобы локальная копия чужой анкеты
    // не подмешалась к своей.
    const draftOwnerRef = React.useRef('');
    const saveTimerRef = React.useRef(null);
    const saveQueueRef = React.useRef(Promise.resolve());
    const answersRef = React.useRef(answers);
    const serverUpdatedAtRef = React.useRef(null);
    const screenRef = React.useRef(null);
    // Строка «повторный тап и поворот»: минимум 350 мс между тапами по
    // «Отправить» — вторая отправка создала бы вторую анкету, а сеть
    // иногда отвечает быстрее защитного окна.
    const submitTapLockRef = React.useRef(0);

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
    React.useEffect(() => { stepRef.current = step; }, [step]);
    React.useEffect(() => { localOnlyRef.current = localOnly; }, [localOnly]);

    // Строка «что пишется»: локальная копия снимается тем же составом, что
    // уходит на сервер, и помнит, с какой серверной отметки она снята —
    // иначе при возврате сети её нечем сверить с чужой правкой из другой
    // вкладки (строка «две вкладки»).
    const persistLocalDraft = React.useCallback((nextAnswers, nextStep, dirty) => {
      if (!isConsentComplete(nextAnswers)) return;
      writeLocalDraft({
        owner: draftOwnerRef.current,
        step: nextStep,
        answers: withStepOrderMeta(nextAnswers),
        baseUpdatedAt: serverUpdatedAtRef.current,
        dirty,
      });
    }, []);

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
      // Строка «что пишется»: локальная копия читается ДО ответа сервера —
      // именно она открывает анкету, когда сети нет.
      const local = readLocalDraft();

      // Строка «офлайн»: без сети анкета открывается и заполняется дальше, а
      // экран «Не удалось открыть анкету» остаётся только для случая, когда
      // поднимать нечего.
      const openFromLocalDraft = () => {
        const mergedAnswers = mergeAnswers(local.answers);
        if (!isConsentComplete(mergedAnswers) && hasContentAnswers(mergedAnswers)) {
          clearLocalDraft();
          setStatus('in_progress');
          setStep(0);
          setAnswers(mergeAnswers(null));
          setHydrated(true);
          setLoading(false);
          return;
        }
        setStatus('in_progress');
        setStep(normalizeLoadedStep(local.step, mergedAnswers));
        setAnswers(mergedAnswers);
        draftOwnerRef.current = local.owner;
        serverUpdatedAtRef.current = local.baseUpdatedAt;
        setLocalOnly(local.dirty);
        setSaveState(local.dirty ? 'pending' : 'idle');
        setError('');
        if (local.step > 0) setResumeGateOpen(true);
        setHydrated(true);
        setLoading(false);
      };

      api.get().then((result) => {
        if (!active) return;
        if (!result.success) {
          if (local && result.error !== 'invalid_session') { openFromLocalDraft(); return; }
          // Незагруженная анкета не пускает в заполнение: `hydrated` остаётся
          // false, и вместо шагов показывается экран «Не удалось открыть
          // анкету». Иначе человек заполнял бы пустую форму поверх уже
          // существующего серверного черновика — и первое же автосохранение с
          // `p_expected_updated_at: null` затёрло бы его ответы.
          setError(result.error === 'invalid_session' ? 'Сессия истекла. Войдите ещё раз.' : 'Не удалось загрузить анкету.');
          setLoading(false);
          return;
        } else if (!result.intake) {
          // Сервер ответил, что анкеты нет: локальная копия либо чужая, либо
          // от стёртого черновика — держать её нельзя.
          clearLocalDraft();
          setStatus('not_invited');
        } else {
          const nextStatus = result.intake.status || 'invited';
          const mergedServerAnswers = mergeAnswers(result.intake.answers);
          const nextStep = normalizeLoadedStep(
            Number(result.intake.current_step) || 0,
            mergedServerAnswers,
          );
          const serverUpdatedAt = result.intake.updated_at || null;
          // Кандидатская RPC отдаёт candidate_id; у клиентской сессии владелец
          // и так равен scope клиента.
          const owner = String(result.intake.candidate_id || draftScope());
          setStatus(nextStatus);
          setClarification({
            text: result.intake.clarification_request || '',
            sections: Array.isArray(result.intake.clarification_sections)
              ? result.intake.clarification_sections
              : [],
          });
          serverUpdatedAtRef.current = serverUpdatedAt;
          draftOwnerRef.current = owner;

          // Локальная копия принимается, только если она снята с ЭТОГО же
          // черновика (тот же владелец и та же серверная отметка) и содержит
          // не доехавшие правки. Иначе выигрывает сервер, а копия стирается:
          // так черновик прежнего кандидата не может подмешаться к новому —
          // вход по одноразовому коду всегда идёт через сеть, и эта сверка
          // случается раньше, чем человек увидит шаги.
          const localAhead = !!local && local.dirty
            && local.owner === owner
            && String(local.baseUpdatedAt || '') === String(serverUpdatedAt || '');

          if (localAhead) {
            setStep(normalizeLoadedStep(local.step, local.answers));
            setAnswers(mergeAnswers(local.answers));
            setLocalOnly(true);
            // Правки уже есть — автосохранение подхватит их и отправит.
            setHasEdited(true);
            setSaveState('pending');
          } else {
            setStep(nextStep);
            setAnswers(mergedServerAnswers);
            if (local) clearLocalDraft();
          }

          // Строка «первый раз»: у отправленной или закрытой анкеты локальной
          // копии быть не должно.
          if (!['invite_sent', 'invited', 'in_progress', 'needs_clarification'].includes(nextStatus)) {
            clearLocalDraft();
          }

          if (
            ['in_progress', 'needs_clarification'].includes(nextStatus)
            && (localAhead ? local.step : nextStep) > 0
          ) {
            setResumeGateOpen(true);
          }
        }
        setHydrated(true);
        setLoading(false);
      }).catch(() => {
        if (!active) return;
        if (local) { openFromLocalDraft(); return; }
        setError('Не удалось загрузить анкету.');
        setLoading(false);
      });
      return () => { active = false; };
    }, []);

    React.useEffect(() => {
      if (!hydrated || !hasEdited || !isConsentComplete(answersRef.current)) return undefined;
      if (!['invite_sent', 'invited', 'in_progress', 'needs_clarification'].includes(status)) return undefined;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('pending');
      saveTimerRef.current = setTimeout(async () => {
        setSaveState('saving');
        const snapshot = withStepOrderMeta(answersRef.current);
        // Локальная копия пишется ДО сети: иначе правки, сделанные в офлайне,
        // не переживут закрытие вкладки.
        persistLocalDraft(snapshot, step, true);
        const result = await enqueueSave(snapshot, step, false);
        const stillSame = answersRef.current === snapshot;
        if (result.success) {
          setStatus(result.status || 'in_progress');
          setSaveState('saved');
          setSaveErrorCode('');
          setLocalOnly(false);
          persistLocalDraft(answersRef.current, step, !stillSame);
          if (stillSame) setHasEdited(false);
        } else if (isNetworkFailure(result.error)) {
          // Строка «офлайн»: без сети падает только отправка. Автосохранение
          // легло на локальную копию — для человека это не ошибка, а «ещё не
          // доехало»; доезд берёт на себя обработчик `online`.
          setLocalOnly(true);
          setSaveState('pending');
          setSaveErrorCode('');
        } else {
          if (result.status && result.error === 'intake_locked') setStatus(result.status);
          setSaveState('error');
          setSaveErrorCode(result.error || 'request_failed');
          setError(saveErrorCopy(result));
        }
      }, 700);
      return () => clearTimeout(saveTimerRef.current);
    }, [answers, step, hydrated, hasEdited, status, enqueueSave, persistLocalDraft]);

    const setSectionValue = (section, key, value) => {
      const onConsentStep = stepRef.current === 0 && STEPS[0]?.id === 'warning';
      if (!onConsentStep && !isConsentComplete(answersRef.current)) return;
      if (!(onConsentStep && section === 'warning')) {
        setHasEdited(true);
      }
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
    const consentComplete = isConsentComplete(answers);
    const warningConfirmed = Boolean(String(answers.warning?.acknowledged_at || '').trim());

    // Уводит на шаг с нужным разделом и закрывает сводку: она отдельный экран,
    // и оставаться на ней поверх правок нечему.
    const goToSection = (sectionId) => {
      const target = STEPS.findIndex((item) => item.id === sectionId);
      if (target < 0) return;
      setReviewOpen(false);
      setError('');
      setStep(target);
    };

    // Строка «safe-area и кнопка назад»: «Назад»-кнопка на шаге и аппаратная
    // кнопка/жест устройства ведут на предыдущий шаг одной и той же функцией.
    const goBackStep = React.useCallback(() => {
      setError('');
      setStep((value) => Math.max(0, value - 1));
    }, []);

    // Строка «место»: закрывает сводку и возвращает на шаг, с которого её
    // открыли — общая функция для стрелки в шапке сводки и для аппаратной
    // кнопки назад.
    const closeReview = React.useCallback(() => {
      setError('');
      setReviewOpen(false);
    }, []);

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
        const snapshot = withStepOrderMeta(answersRef.current);
        if (step === 0 && STEPS[0]?.id === 'warning') {
          setHasEdited(true);
        }
        // Строка «что пишется»: ответы дублируются локально после каждого шага.
        persistLocalDraft(snapshot, step, true);
        const result = await enqueueSave(snapshot, nextStep, false);
        if (!result.success) {
          if (isNetworkFailure(result.error)) {
            // Строка «офлайн»: шаги заполняются и в офлайне — сеть нужна
            // только отправке. Шаг переводим, черновик держит локальная копия.
            persistLocalDraft(snapshot, nextStep, true);
            setLocalOnly(true);
            setSaveState('pending');
            setSaveErrorCode('');
            setStep(nextStep);
            global.scrollTo?.({ top: 0 });
            return;
          }
          if (result.status && result.error === 'intake_locked') setStatus(result.status);
          setSaveState('error');
          setSaveErrorCode(result.error || 'request_failed');
          setError(saveErrorCopy(result));
          return;
        }
        if (answersRef.current === snapshot) setHasEdited(false);
        setSaveState('saved');
        setSaveErrorCode('');
        setLocalOnly(false);
        setStatus(result.status || 'in_progress');
        persistLocalDraft(snapshot, nextStep, answersRef.current !== snapshot);
        setStep(nextStep);
        // Строка «анимаций нет»: переход между шагами — мгновенная смена
        // состояния, без плавной прокрутки.
        global.scrollTo?.({ top: 0 });
        return;
      }
      // Строка «повторный тап и поворот»: 350 мс минимальной защиты поверх
      // блокировки на время операции — вторая отправка создала бы вторую
      // анкету, а сеть иногда отвечает быстрее защитного окна.
      const tapAt = Date.now();
      if (tapAt - submitTapLockRef.current < 350) return;
      submitTapLockRef.current = tapAt;
      setSaveState('saving');
      // Строка «ошибка отправки»: она обещает, что ответы и подтверждение
      // сохранены. Локальная копия делает обещание правдой и в офлайне.
      persistLocalDraft(withStepOrderMeta(answersRef.current), step, true);
      const result = await enqueueSave(withStepOrderMeta(answersRef.current), step, true);
      const tapElapsed = Date.now() - tapAt;
      if (tapElapsed < 350) await new Promise((resolve) => setTimeout(resolve, 350 - tapElapsed));
      if (result.success) {
        setStatus('completed');
        setSaveState('saved');
        setSaveErrorCode('');
        setSubmitFailed(false);
        setLocalOnly(false);
        // Строка «что пишется»: локальная копия удаляется после отправки —
        // отправленная анкета уже неизменяемая запись на сервере.
        clearLocalDraft();
      } else {
        if (result.status && result.error === 'intake_locked') setStatus(result.status);
        setSaveState('error');
        setSaveErrorCode(result.error || 'request_failed');
        setSubmitFailed(true);
        // Отправка не прошла из-за сети: сами ответы ещё должны доехать в
        // черновик, поэтому помечаем их не доехавшими — обработчик `online`
        // досохранит их, а отправку человек повторит сам.
        if (isNetworkFailure(result.error)) setLocalOnly(true);
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
      const snapshot = withStepOrderMeta(answersRef.current);
      const result = await enqueueSave(snapshot, step, false);
      const stillSame = answersRef.current === snapshot;
      if (result.success) {
        setStatus(result.status || 'in_progress');
        setSaveState('saved');
        setSaveErrorCode('');
        setLocalOnly(false);
        persistLocalDraft(answersRef.current, step, !stillSame);
        if (stillSame) setHasEdited(false);
        return;
      }
      if (result.status && result.error === 'intake_locked') setStatus(result.status);
      setSaveState('error');
      setSaveErrorCode(result.error || 'request_failed');
      setError(saveErrorCopy(result));
    };

    // Строка «офлайн»: черновик синхронизируется при связи. Механизм — тот же,
    // что у остального продукта (heys_day_offline_sync_v1, heys_messenger_v1):
    // событие `online` повторяет отправку накопленного. Своей очереди анкета
    // не заводит — доехать ответы должны именно в свой черновик на сервере,
    // а туда ведёт только её RPC.
    const flushLocalDraft = React.useCallback(async () => {
      if (!localOnlyRef.current) return;
      setSaveState('saving');
      const snapshot = withStepOrderMeta(answersRef.current);
      const targetStep = stepRef.current;
      const result = await enqueueSave(snapshot, targetStep, false);
      const stillSame = answersRef.current === snapshot;
      if (result.success) {
        setStatus(result.status || 'in_progress');
        setSaveState('saved');
        setSaveErrorCode('');
        setLocalOnly(false);
        setError('');
        persistLocalDraft(answersRef.current, targetStep, !stillSame);
        if (stillSame) setHasEdited(false);
        return;
      }
      if (isNetworkFailure(result.error)) {
        // Сеть отвалилась снова — остаёмся на локальной копии молча.
        setSaveState('pending');
        return;
      }
      if (result.status && result.error === 'intake_locked') setStatus(result.status);
      setSaveState('error');
      setSaveErrorCode(result.error || 'request_failed');
      setError(saveErrorCopy(result));
    }, [enqueueSave, persistLocalDraft]);

    const performClose = async () => {
      setCloseConfirmOpen(false);
      if (!isConsentComplete(answersRef.current)) {
        leaveIntake();
        return;
      }
      if (!hasEdited && !['pending', 'saving', 'error'].includes(saveState)) {
        leaveIntake();
        return;
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      const snapshot = withStepOrderMeta(answersRef.current);
      persistLocalDraft(snapshot, step, true);
      const result = await enqueueSave(snapshot, step, false);
      if (result.success) {
        persistLocalDraft(snapshot, step, false);
        leaveIntake();
      } else if (isNetworkFailure(result.error)) {
        // Строка «офлайн»: без сети выход не запирается — ответы уже лежат
        // локально и уедут при следующем открытии со связью.
        setLocalOnly(true);
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

    // Строка «safe-area и кнопка назад»: аппаратная кнопка/жест назад на
    // шагах ведут на предыдущий шаг, а на первом шаге спрашивают
    // подтверждение выхода — тем же диалогом, что и «Закрыть» в шапке
    // (черновик сохранён, но пройденное терять жалко). Общий порядок слоёв —
    // home-widgets.v4.dc.html, «аппаратная кнопка назад · правило продукта»:
    // сначала закрывается верхний открытый слой (сводка, модалки), и только
    // когда слоёв нет — шаг назад. Строка «порядок слоёв и два устройства»:
    // на самих шагах анкеты вложенных слоёв нет, поэтому шаг назад — предел.
    // Паттерн pushState/popstate — heys_widgets_ui_v1.js (карточка «Ещё») и
    // heys_day_pickers.js: одна метка-ловушка в истории, которую popstate
    // потребляет и сразу восстанавливает, чтобы следующее «назад» снова
    // доходило до обработчика, а не выкидывало из анкеты или из приложения.
    const showsSteps = !loading && !(error && !hydrated) && status !== 'not_invited' && !STATUS_COPY[status];
    const backLayersRef = React.useRef({});
    React.useEffect(() => {
      backLayersRef.current = { step, reviewOpen, resumeGateOpen, restartConfirmOpen, closeConfirmOpen };
    });

    React.useEffect(() => {
      if (!showsSteps) return undefined;
      const pushBackTrap = () => {
        try { global.history.pushState({ heysIntakeBack: true }, ''); } catch (_) { /* история недоступна — остальные пути закрытия работают */ }
      };
      const onPopState = () => {
        const layers = backLayersRef.current;
        if (layers.restartConfirmOpen) { setRestartConfirmOpen(false); pushBackTrap(); return; }
        if (layers.closeConfirmOpen) { setCloseConfirmOpen(false); pushBackTrap(); return; }
        if (layers.resumeGateOpen) { setResumeGateOpen(false); pushBackTrap(); return; }
        if (layers.reviewOpen) { closeReview(); pushBackTrap(); return; }
        if (layers.step > 0) { goBackStep(); pushBackTrap(); return; }
        // Первый шаг: тот же confirm-диалог, что у «Закрыть» в шапке.
        setCloseConfirmOpen(true);
        pushBackTrap();
      };
      global.addEventListener('popstate', onPopState);
      pushBackTrap();
      return () => {
        global.removeEventListener('popstate', onPopState);
        try {
          if (global.history.state?.heysIntakeBack) global.history.back();
        } catch (_) { /* ignore */ }
      };
    }, [showsSteps]);

    // Строка «офлайн»: вернулась связь — накопленное локально доезжает на
    // сервер само, без действий человека.
    React.useEffect(() => {
      if (!showsSteps) return undefined;
      const onOnline = () => { flushLocalDraft(); };
      global.addEventListener('online', onOnline);
      return () => global.removeEventListener('online', onOnline);
    }, [showsSteps, flushLocalDraft]);

    const storageNotice = (title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary) => React.createElement('div', {
      role: 'dialog',
      'aria-modal': 'true',
      style: {
        position: 'fixed', inset: 0, zIndex: 40, display: 'grid', placeItems: 'center',
        // Строка «safe-area и кнопка назад»: модалка во весь экран — базовые
        // 16 остаются, врезки сверху/снизу добавляются поверх них.
        padding: 16,
        paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(23, 32, 42, 0.42)',
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
                // Кадр «Анкета · возврат» даёт непройденной метке фон --c1 —
                // тот же, что у карточки списка: кружок сливается, остаётся
                // одна цифра. Так три состояния читаются как «сделано ·
                // здесь · ещё нет», а не как три разных кружка. Стояло --c2.
                background: done ? OK_BG : currentRow ? ACCENT_FILL : SURFACE_1,
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
      setReviewOpen(false);
      setStep(0);
      setHasEdited(false);
      setError('');
      setSaveState('saving');
      // «Начать заново» стирает десять минут работы — локальная копия старых
      // ответов не должна их пережить и вернуться при следующем открытии.
      persistLocalDraft(fresh, 0, true);
      const result = await enqueueSave(fresh, 0, false);
      if (result.success) {
        setStatus(result.status || 'in_progress');
        setSaveState('saved');
        setSaveErrorCode('');
        setLocalOnly(false);
        persistLocalDraft(fresh, 0, false);
      } else if (isNetworkFailure(result.error)) {
        setLocalOnly(true);
        setSaveState('pending');
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

    // Строка «ошибка отправки»: не выбрасывает из анкеты — заголовок называет
    // причину, отдельная строка подтверждает, что сохранены и ответы, и
    // подтверждение предупреждения, а вторым выходом остаётся тот же чат, где
    // приходил код. Блок общий для шагов и сводки: отправка есть в обоих
    // местах, значит и её отказ должен читаться в обоих.
    const errorBlock = error ? React.createElement('div', {
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
    ) : null;

    const retryButton = saveState === 'error' ? React.createElement('button', {
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
            : 'Повторить сохранение') : null;

    // Роль набора здесь развёрнута, а не константой: на неё смотрит тест
    // intake-v4-blocked-action.
    const submitOrContinueButton = (blocked = missingRequired) => React.createElement('button', {
      type: 'button', onClick: next, disabled: saveState === 'saving' || blocked,
      'aria-describedby': blocked ? 'intake-blocked-reason' : undefined,
      style: { ...primaryPill, minHeight: 48,
        background: blocked ? SURFACE_1 : ACCENT_FILL,
        color: blocked ? INK : ON_ACCENT,
        cursor: (saveState === 'saving' || blocked) ? 'default' : 'pointer',
        opacity: (saveState === 'saving' || blocked) ? 0.45 : 1 },
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
      : (step === STEPS.length - 1 ? 'Отправить куратору' : 'Продолжить')));

    // Строка «место»: сводка — отдельный экран. Шапка со стрелкой назад и
    // «Ваши ответы» 15/700; отправка живёт и здесь, и на шаге 5 (строка
    // «отправка»), поэтому футер повторяет ту же кнопку.
    if (reviewOpen) {
      return React.createElement('div', shellProps, React.createElement('main', { style: cardStyle },
        React.createElement('button', {
          type: 'button',
          onClick: closeReview,
          'aria-label': `Назад к шагу ${STEPS.length}`,
          style: {
            display: 'flex', alignItems: 'center', gap: 12, minHeight: 44,
            border: 0, background: 'transparent', padding: 0, margin: 0,
            color: INK, fontSize: 15, fontWeight: 700, lineHeight: 1, cursor: 'pointer',
          },
        },
          React.createElement('span', {
            'aria-hidden': 'true',
            style: { fontSize: 17, fontWeight: 700, lineHeight: 1, color: INK_55 },
          }, '‹'),
          'Ваши ответы'
        ),
        React.createElement('div', { style: { marginTop: 16 } },
          React.createElement(ReviewSummary, { answers })),
        errorBlock,
        retryButton,
        // Строка «отправка»: отправка заблокирована и здесь, пока галочка не
        // поставлена. Отступление от контракта: он диктует строку «Поставьте
        // галочку выше», но на этом экране галочки выше нет — берём
        // формулировку кадра «Анкета · сводка», чтобы причина не указывала на
        // несуществующий контрол.
        !consentComplete ? React.createElement('div', {
          key: 'blocked-reason-review',
          id: 'intake-blocked-reason',
          style: {
            marginTop: 20, marginBottom: 10, borderRadius: 16, background: TINT,
            padding: '11px 14px', fontSize: 11, fontWeight: 600, lineHeight: 1.45,
            color: WARN_TEXT,
          },
        }, 'Вернитесь к шагу 1 и подтвердите предупреждение') : null,
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: !consentComplete ? 0 : 20 } },
          // Строка «содержимое»: кнопка «Правки» уводит к целям; стрелка
          // назад в шапке возвращает на шаг 5, откуда сводку открыли.
          React.createElement('button', {
            type: 'button', onClick: () => goToSection('goals'), style: secondaryPill,
          }, 'Правки'),
          submitOrContinueButton(!consentComplete)
        )
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
            }, localOnly && saveState !== 'saving'
              // Строка «офлайн»: пока ответы лежат только на устройстве,
              // «Ответы сохранены» было бы обещанием сервера, которого не было.
              ? 'Сохранено на устройстве'
              : saveState === 'saving' || saveState === 'pending' ? 'Сохраняем…' : saveState === 'saved' ? 'Ответы сохранены' : 'Ошибка сохранения')
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
      errorBlock,
      retryButton,
      // Строка «место»: на шаге 5 от сводки остаётся строка-вход на
      // закреплённой полке. Предупреждение, галочка и отправка сами по себе
      // занимают целый экран, и сводка внутри него обрезалась ровно на
      // строках, ради которых существует.
      step === STEPS.length - 1 ? React.createElement('button', {
        type: 'button',
        onClick: () => { setError(''); setReviewOpen(true); },
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          width: '100%', minHeight: 44, marginTop: 16, padding: 0,
          border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer',
        },
      },
        React.createElement('span', null,
          React.createElement('span', {
            style: { display: 'block', fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, color: INK },
          }, 'Проверьте ответы перед отправкой'),
          React.createElement('span', {
            style: { display: 'block', marginTop: 5, fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: INK_55 },
          }, 'Цель, опыт, готовность присылать данные')
        ),
        React.createElement('span', {
          'aria-hidden': 'true',
          style: { flex: 'none', fontSize: 15, fontWeight: 700, lineHeight: 1, color: ACCENT_TEXT },
        }, '›')
      ) : null,
      // Кадр «Анкета · шаг 5 · подтверждено»: в том же месте полки, где у
      // незаполненного шага стоит причина отказа, у подтверждённого стоит
      // отметка о подтверждении.
      step === STEPS.length - 1 && warningConfirmed ? React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 9, marginTop: 10,
          borderRadius: 16, background: OK_BG, padding: '12px 14px',
          fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: OK_TEXT,
        },
      },
        React.createElement('span', { 'aria-hidden': 'true' }, '✓'),
        React.createElement('span', null, 'Предупреждение подтверждено')
      ) : null,
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
      }, current?.id === 'warning' ? 'Поставьте галочку выше' : 'Заполните поля со звёздочкой') : null,
      React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: missingRequired ? 9 : 20 } },
        step > 0 ? React.createElement('button', {
          type: 'button', onClick: goBackStep,
          style: secondaryPill,
        }, 'Назад') : null,
        submitOrContinueButton()
      )
    ));
  }

  HEYS.TrialIntake = {
    api, ClientScreen, shouldOpen, leaveIntake, EMPTY_ANSWERS, CURATOR_ANSWER_FIELDS,
    WARNING_TEXT_VERSION, WARNING_TEXT_TITLE, WARNING_TEXT_PARAGRAPHS, WARNING_CHECKBOX_LABEL,
    isConsentComplete, normalizeLoadedStep, STEP_ORDER_FLAG,
  };
})(typeof window !== 'undefined' ? window : globalThis);
