// heys_mobility_ui_v1.js — React UI source for mobility mode.
//
// Source-only module. Bundle/index integration is a separate explicit step.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__uiRegistered) return;
  Mobility.__uiRegistered = true;

  const React = global.React;
  if (!React) {
    Mobility.UI = Mobility.UI || {};
    Mobility.UI.__registered = false;
    Mobility.UI.__missingReact = true;
    return;
  }

  const h = React.createElement;
  const useMemo = React.useMemo;
  const useState = React.useState;
  const useEffect = React.useEffect;
  const useRef = React.useRef;
  const useCallback = React.useCallback;
  const MOBILITY_TIMER_LOCK_TTL_MS = 15000;
  const MOBILITY_TIMER_LOCK_HEARTBEAT_MS = 2000;

  const DEFAULT_PROFILE = {
    age: null,
    level: 'beginner',
    populations: [],
    equipment: ['band', 'strap'],
    goal: 'morning',
    loadLevel: 3,
    acceptedDisclaimer: false
  };

  const LEVEL_LABEL = {
    beginner: 'Начальный',
    intermediate: 'Средний',
    advanced: 'Продвинутый'
  };
  const MODE_LABEL = {
    morning_tonify: 'Утро',
    pre_workout_ramp: 'Перед нагрузкой',
    post_workout: 'После нагрузки',
    develop_mobility: 'Развитие',
    evening_relax: 'Вечер',
    rehab: 'Реабилитационная рамка',
    anti_sedentary: 'Пауза',
    posture: 'Осанка'
  };
  const GOAL_LABEL = {
    morning: 'Утренний тонус',
    pre_workout: 'Перед нагрузкой',
    recover: 'После нагрузки',
    develop: 'Развитие диапазона',
    relax: 'Вечернее расслабление',
    rehab: 'Дозированное восстановление',
    desk: 'Пауза от сидения',
    posture: 'Осанка'
  };
  const GOAL_SHORT_LABEL = {
    morning: 'Утро',
    pre_workout: 'Нагрузка',
    recover: 'Восстановление',
    develop: 'Диапазон',
    relax: 'Вечер',
    rehab: 'Реабилитация',
    desk: 'Пауза',
    posture: 'Осанка'
  };
  const GOAL_EMOJI = {
    morning: '🌤',
    pre_workout: '⚡',
    recover: '🌿',
    develop: '📈',
    relax: '🌙',
    rehab: '🧩',
    desk: '🪑',
    posture: '🧍'
  };
  const GOAL_TO_MODE = {
    morning: 'morning_tonify',
    pre_workout: 'pre_workout_ramp',
    recover: 'post_workout',
    develop: 'develop_mobility',
    relax: 'evening_relax',
    rehab: 'rehab',
    desk: 'anti_sedentary',
    posture: 'posture'
  };
  const EQUIPMENT_LABEL = {
    band: 'Резинка',
    strap: 'Ремень',
    foam_roll: 'Ролл',
    ball: 'Мяч',
    percussion: 'Массажёр',
    bolster: 'Болстер'
  };
  const POPULATION_LABEL = {
    hypermobile: 'Гипермобильность',
    pregnancy: 'Беременность',
    adolescent: 'Подросток',
    older: 'Старший возраст',
    desk: 'Много сидячей работы'
  };
  const EQUIPMENT_ICON = {
    band: '▱',
    strap: '⌁',
    foam_roll: '⬭',
    ball: '●',
    percussion: '▣',
    bolster: '▰'
  };
  const VERDICT_LABEL = {
    positive: 'поддерживается',
    caution: 'с ограничениями',
    limited: 'ограниченно',
    no_practical_effect: 'не обещаем',
    no_effect: 'не подтверждено'
  };
  const PROGRESSION_AXIS_LABEL = {
    amplitude: 'Амплитуда',
    tempo: 'Темп',
    load: 'Нагрузка',
    endrange: 'Конечный диапазон',
    intensity: 'Интенсивность'
  };
  const PURPOSE_LABEL = {
    prep: 'Подготовка',
    develop: 'Развитие',
    recover: 'Восстановление',
    regulate: 'Снижение тонуса'
  };
  const MODALITY_LABEL = {
    bodyweight: 'Без инвентаря',
    band: 'Резинка',
    strap: 'Ремень',
    foam_roll: 'Ролл',
    ball: 'Мяч',
    percussion: 'Массажёр',
    bolster: 'Болстер',
    breath: 'Дыхание',
    wall_env: 'У стены',
    loaded: 'С нагрузкой'
  };
  const DOSE_SHAPE_LABEL = {
    raise: 'Разогрев',
    dynamic: 'Динамика',
    flow: 'Связка движений',
    activation: 'Активация',
    hold: 'Удержание',
    pnf: 'Контракт-расслабление',
    eccentric: 'Медленная сила',
    cars: 'Суставной контроль',
    smr: 'Мягкая тканевая работа',
    breath: 'Дыхание',
    active_rec: 'Восстановительное движение'
  };
  const BLOCK_LABEL = {
    A: 'Разогрев',
    B: 'Мобилизация',
    C: 'Контроль',
    D: 'Растяжка',
    E: 'Контракт-расслабление',
    F: 'Сила в диапазоне',
    G: 'Суставной контроль',
    H: 'Мягкие ткани',
    I: 'Дыхание',
    J: 'Восстановление'
  };
  const ATOM_TITLE_LABEL = {
    mob_dynamic_thoracic_openbook: 'Раскрытие грудного отдела на боку',
    act_wall_angels: 'Скольжение рук у стены',
    flex_pnf_hamstring_hr: 'Контракт-расслабление задней линии',
    flex_pnf_hipflexor_crac: 'Контракт-расслабление сгибателей бедра',
    loadmob_nordic_eccentric: 'Медленное укрепление задней линии',
    loadmob_cossack_loaded_hold: 'Удержание в боковом приседе',
    loadmob_pails_rails_hip: 'Изометрия бедра в конце диапазона',
    joint_cars_hip: 'Контрольные круги тазобедренного',
    joint_cars_shoulder: 'Контрольные круги плеча',
    joint_cars_spine: 'Контрольные круги позвоночника',
    breath_box_tonify: 'Квадратное дыхание'
  };
  const PROTOCOL_NAME_LABEL = {
    pre_workout_ramp_10: 'Разминка перед нагрузкой',
    develop_posterior_chain_18: 'Развитие задней линии',
    develop_hip_control_15: 'Контроль тазобедренных',
    posture_floor_chain_14: 'Осанка: шея, лопатка, таз',
    rehab_control_8: 'Мягкий контроль без боли',
    deload_maintain_10: 'Лёгкое поддержание',
    deload_maintenance_10: 'Лёгкое поддержание'
  };
  const PROTOCOL_INTENT_LABEL = {
    develop_posterior_chain_18: 'Отдельная работа для задней поверхности бедра: амплитуда, контроль и спокойное укрепление.',
    rehab_control_8: 'Мягкое движение без боли, суставной контроль и безопасное восстановление.',
    deload_maintain_10: 'Поддержать диапазон в разгрузочную неделю без тяжёлой тканевой нагрузки.',
    pre_workout_ramp_10: 'Подготовить тело к основной нагрузке без долгой статики.'
  };
  const CONSTRUCTOR_QUICK_ATOM_IDS = [
    'wu_locomotor',
    'mob_dynamic_thoracic_openbook',
    'joint_cars_hip',
    'joint_cars_shoulder',
    'act_deep_neck_flexor_nod',
    'act_wall_angels',
    'breath_box_tonify',
    'breath_resonant'
  ];
  const AUTONOMIC_LABEL = {
    tonify: 'Тонус',
    neutral: 'Нейтрально',
    relax: 'Расслабление'
  };
  const COURSE_PHASE_LABEL = {
    accumulation: 'техника и регулярность',
    intensification: 'контроль и объём',
    deload: 'разгрузка',
    retest: 'обновить замеры',
    maintenance: 'поддержание',
    taper: 'мягкое поддержание',
    dup: 'волнообразная нагрузка'
  };
  const COURSE_SLOT_LABEL = {
    neck_control: 'Шея',
    thoracic_mobility: 'Грудной отдел',
    scapular_control: 'Лопатка',
    shoulder_extension: 'Плечо',
    anterior_chain_relief: 'Передняя линия',
    hip_support: 'Таз',
    spine_cars: 'Позвоночник',
    soft_tissue: 'Мягкие ткани',
    supported_downshift: 'Снижение тонуса'
  };
  const TEST_LABEL = {
    ankle_dorsiflexion: 'Голеностоп: тыльное сгибание',
    knee_to_wall_cm: 'Голеностоп: колено к стене',
    hip_flexion: 'Тазобедренный: сгибание',
    hip_extension_thomas: 'Тазобедренный: разгибание',
    hamstring_slr: 'Задняя линия бедра',
    thoracic_rotation: 'Грудной отдел: ротация',
    shoulder_flexion: 'Плечо: сгибание',
    shoulder_er: 'Плечо: наружная ротация',
    knee_flexion: 'Колено: сгибание',
    deep_neck_flexor_hold: 'Шея: глубокие сгибатели',
    wall_angel_quality: 'Лопатка: скольжение рук у стены',
    scapular_control_score: 'Лопатка: контроль'
  };
  const JOINT_LABEL = {
    ankle: 'Голеностоп',
    knee: 'Колено',
    hip: 'Тазобедренный',
    thoracic: 'Грудной отдел',
    shoulder: 'Плечо',
    neck: 'Шея'
  };
  const LIMITER_TYPE_LABEL = {
    ceiling: 'диапазон',
    control: 'контроль',
    strength_or_technique: 'сила или техника',
    ok: 'без явного ограничения',
    unknown: 'недостаточно данных'
  };
  const PROTOCOL_TAG_LABEL = {
    ramp: 'структура разминки',
    hamstring: 'задняя линия',
    'end-range': 'конец диапазона',
    deload: 'разгрузка',
    peak: 'перед стартом',
    safe_prep: 'безопасная подготовка',
    low_load: 'низкая нагрузка',
    cars: 'суставной контроль',
    pain_free: 'без боли'
  };
  const CALENDAR_FOCUS_LABEL = {
    develop: 'развитие диапазона',
    maintain: 'поддержание',
    deload: 'разгрузка'
  };
  const AXIS_LABEL = {
    readiness: 'Самочувствие',
    activation: 'Активация',
    passive_flex: 'Мягкость тканей',
    active_rom: 'Самостоятельный диапазон',
    motor_control: 'Контроль',
    tissue_prep: 'Разогрев ткани',
    tissue_recovery: 'Мягкие ткани',
    autonomic: 'Тонус',
    recovery: 'Восстановление',
    joint_stability: 'Стабильность',
    strength_endrange: 'Сила в диапазоне',
    habit_break: 'Пауза от сидения'
  };
  const PROGRESSION_REASON_LABEL = {
    no_atom: 'Нет упражнения для подсказки',
    pain_or_low_readiness: 'Боль или низкое самочувствие: снизить интенсивность',
    plateau_detected: 'Изменения замедлились: поменяйте один параметр нагрузки',
    low_dose_confidence: 'Нагрузка пока осторожная: не наращивайте объём автоматически',
    minimum_effective_dose_first: 'Сначала держите минимально достаточную нагрузку'
  };
  const REASON_LABEL = {
    morning_fuller_warmup: 'Утром нужен более полный разогрев',
    autonomic_tonify: 'Тренировка собрана под тонус',
    ramp_raise_activate_mobilise: 'Перед нагрузкой: разогреть, активировать, мобилизовать',
    no_long_static_pre_power: 'Долгая статика не ставится перед мощной работой',
    comfort_not_supercompensation: 'После нагрузки цель — комфорт, не дополнительный стресс',
    recovery_relax: 'Восстановительный режим снижает возбуждение',
    develop_separate_from_warmup: 'Развитие диапазона отделено от разминки',
    full_warmup_before_endrange: 'Перед крайними положениями нужен разогрев',
    active_rom_over_passive: 'Приоритет контролю движения, не только амплитуде',
    autonomic_relax: 'Тренировка собрана под расслабление',
    sleep_downshift: 'Темп и дыхание помогают снизить возбуждение',
    rehab_strict_gates: 'Реабилитационная рамка использует строгие ограничения',
    pain_free_progression: 'Прогрессия только без боли',
    micro_over_episode: 'Короткие регулярные паузы важнее редкой длинной тренировки',
    desk_stiffness: 'Учтена скованность от сидения',
    population_desk_thoracic_hip: 'Акцент на грудной отдел и тазобедренные',
    posture_strength_over_stretch: 'Осанка собрана через контроль и укрепление, не через одну растяжку',
    neck_scapular_thoracic_chain: 'Связка шея-лопатка-грудной отдел включена в план',
    population_hypermobile_stability: 'Приоритет контролю и стабильности',
    population_pregnancy_low_load: 'Беременность: низкая нагрузка и мягкий объём',
    population_older_low_load: 'Возрастной профиль: низкая нагрузка и мягкий объём',
    morning_more_warmup: 'Утром разогрев длиннее, конечный диапазон осторожнее',
    day_neutral: 'Дневной режим без циркадного ограничения',
    evening_relax_bias: 'Вечером приоритет расслабления'
  };
  const LOAD_REASON_LABEL = {
    load_level_1: 'Нагрузка: восстановление',
    load_level_2: 'Нагрузка: лёгкая',
    load_level_3: 'Нагрузка: база',
    load_level_4: 'Нагрузка: сильная',
    load_level_5: 'Нагрузка: атлет'
  };

  function ensureMobilityStyles() {
    const doc = global.document;
    if (!doc || !doc.head || doc.getElementById('heys-mobility-ui-style')) return;
    const style = doc.createElement('style');
    style.id = 'heys-mobility-ui-style';
    style.textContent = `
.mobility-overlay-root{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.44);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.mobility-overlay{position:relative;width:100%;height:100%;overflow:auto;background:#fff;color:#172033;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-overflow-scrolling:touch}
.mobility-overlay,.mobility-overlay *{box-sizing:border-box}
.mobility-overlay__bar{position:sticky;top:0;z-index:4;min-height:58px;padding:calc(10px + env(safe-area-inset-top)) 16px 10px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(255,255,255,.94);border-bottom:1px solid rgba(15,23,42,.08);box-shadow:0 8px 24px rgba(15,23,42,.08);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.mobility-overlay__bar strong{font-size:17px;font-weight:800;color:#162036;letter-spacing:0}
.mobility-overlay__bar button{appearance:none;border:0;border-radius:8px;padding:10px 13px;background:#e7f4ee;color:#0f6b43;font:700 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
.mobility-overlay__bar button:active{transform:translateY(1px)}
.mobility-app{width:100%;max-width:720px;margin:0 auto;padding:calc(env(safe-area-inset-top,16px) + 48px) 24px calc(28px + env(safe-area-inset-bottom));overflow-x:hidden}
.mobility-app__header{padding:2px 2px 10px}
.mobility-app__header h2{margin:0 0 4px;font-size:22px;line-height:1.15;color:#162036;letter-spacing:0}
.mobility-app__header p{margin:0;color:#667085;font-size:14px;line-height:1.35}
.mobility-app__layout{display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:14px;align-items:start}
.mobility-app__left,.mobility-app__main{min-width:0}
.mobility-panel{margin:0 0 12px;padding:14px;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;box-shadow:0 10px 26px rgba(15,23,42,.06)}
.mobility-panel h3{margin:0 0 11px;font-size:15px;line-height:1.2;font-weight:800;color:#1f2937;letter-spacing:0}
.mobility-panel h4{margin:0 0 6px;font-size:14px;line-height:1.2;color:#1f2937}
.mobility-panel p{margin:7px 0;color:#586579;font-size:13px;line-height:1.42}
.mobility-panel ul,.mobility-panel ol{margin:8px 0 0;padding-left:20px;color:#4b5563;font-size:13px;line-height:1.42}
.mobility-panel button{appearance:none;border:1px solid rgba(20,184,124,.35);border-radius:8px;padding:10px 12px;background:#effaf5;color:#10764b;font:700 14px/1.1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
.mobility-panel button+button{margin-left:8px}
.mobility-panel label{display:grid;gap:5px;margin:0 0 10px;color:#667085;font-size:12px;font-weight:700}
.mobility-panel input,.mobility-panel select{width:100%;min-height:40px;border:1px solid rgba(15,23,42,.12);border-radius:8px;background:#fff;color:#172033;font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 10px}
.mobility-panel input[type="checkbox"]{width:20px;min-height:20px;height:20px;margin:0;accent-color:#16a66a}
.mobility-mode-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mobility-mode-btn{min-height:74px;text-align:left;display:flex;flex-direction:column;justify-content:center;gap:5px;border-color:rgba(15,23,42,.1)!important;background:#f8fbfa!important;color:#253045!important}
.mobility-mode-btn.is-selected{border-color:#16a66a!important;background:#e9f8f1!important;box-shadow:0 0 0 2px rgba(22,166,106,.12)}
.mobility-mode-btn__label{font-size:14px;font-weight:800;line-height:1.15}
.mobility-mode-btn__meta{font-size:11px;line-height:1.2;color:#667085;font-weight:700}
.mobility-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}
.mobility-checks label,.mobility-disclaimer{display:flex!important;align-items:center;gap:8px;margin:0!important;padding:9px;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#f8fbfa;color:#465266!important;font-size:12px!important;font-weight:700!important;overflow:hidden;text-overflow:ellipsis}
.mobility-disclaimer{margin-top:10px!important;align-items:flex-start;background:#fff8e8}
.mobility-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-height:24px;padding:4px 8px;border-radius:999px;background:#edf2f7;color:#475569;font-size:11px;font-weight:800;line-height:1.1;white-space:nowrap}
.mobility-chip--ok,.mobility-chip--warmup{background:#dcfce7;color:#166534}
.mobility-chip--error,.mobility-chip--warmup-warn{background:#fee2e2;color:#991b1b}
.mobility-chip--warn{background:#fef3c7;color:#92400e}
.mobility-chip--axis,.mobility-chip--autonomic,.mobility-chip--purpose{background:#e0f2fe;color:#075985}
.mobility-chip--load{background:#e7f4ee;color:#0f6b43}
.mobility-session__head,.mobility-block__top,.mobility-effect__top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.mobility-session__head h3{margin-bottom:0}
.mobility-session__chips,.mobility-progress__meta,.mobility-calendar__meta,.mobility-runner__meta,.mobility-execution__status{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.mobility-blocks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.mobility-block{min-width:0;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fbfdfc;padding:10px}
.mobility-block__top strong{font-size:14px;line-height:1.25;color:#172033}
.mobility-block__instruction{font-size:12px!important}
.mobility-block__cues{padding-left:18px!important}
.mobility-block__dose{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px;font-size:12px;font-weight:800;color:#1f2937}
.mobility-block__sources{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.mobility-source{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:700}
.mobility-source--missing{background:#fee2e2;color:#991b1b}
.mobility-issues,.mobility-advisories,.mobility-reasons{border-radius:8px;padding:9px 9px 9px 28px!important}
.mobility-issues{background:#fff1f2;color:#9f1239!important}
.mobility-advisories,.mobility-reasons{background:#f8fafc;color:#475569!important}
.mobility-readiness__score{display:inline-flex;align-items:center;justify-content:center;min-width:82px;min-height:40px;border-radius:8px;background:#e7f4ee;color:#0f6b43;font-size:20px;font-weight:900}
.mobility-readiness__inputs,.mobility-assessment__rows{display:grid;gap:8px}
.mobility-assessment-row{display:grid;grid-template-columns:minmax(0,1fr) 74px 74px 74px auto;gap:8px;align-items:end;padding:9px;border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.06)}
.mobility-assessment-row>span{font-size:12px;font-weight:800;color:#344054}
.mobility-limiter,.mobility-progression-advice{border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.08);padding:10px;margin-bottom:10px}
.mobility-progress__rows,.mobility-calendar__days{display:grid;gap:8px}
.mobility-progress-row,.mobility-calendar-day{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.06);font-size:12px}
.mobility-effects__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mobility-effect{border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fbfdfc;padding:10px}
.mobility-effect__verdict{margin-top:6px;color:#667085;font-size:12px;font-weight:800}
.mobility-current-step{border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#f8fbfa;padding:10px}
.mobility-execution__controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.mobility-execution__controls button{margin:0!important}
.mobility-breath-phases{display:grid;gap:5px;padding-left:20px!important}
.mobility-technique-card{display:grid;gap:5px;margin-top:10px;padding:10px;border-radius:12px;background:#f8fafc;border:1px solid rgba(15,23,42,.08);color:#334155;text-align:left}
.mobility-technique-card strong{font-size:13px;line-height:1.2;color:#0f172a}
.mobility-technique-card span,.mobility-technique-card li{font-size:12px;line-height:1.3;font-weight:700}
.mobility-technique-card--compact{width:min(100% - 24px,392px);margin:2px auto 0;padding:0;border:0;border-radius:0;background:transparent;color:#475569;gap:4px}
.mobility-technique-card--compact span,.mobility-technique-card--compact li{font-size:12px;line-height:1.32;font-weight:500}
.mobility-technique-card--compact .mobility-technique-card__focus{color:#172033;font-size:13px;font-weight:750}
.mobility-technique-card--compact .mobility-technique-card__check{color:#667085;font-size:12px;font-weight:500}
.mobility-technique-card--compact ul{margin:0;padding-left:16px}
.mobility-step-feedback{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:10px}
.mobility-step-feedback button{appearance:none;border:1px solid rgba(15,23,42,.08);border-radius:999px;background:#fff;color:#334155;padding:7px 9px;font:800 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.06);cursor:pointer}
.mobility-course-card{display:grid!important;align-items:stretch!important;justify-content:stretch!important;gap:9px!important}
.mobility-course-card__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.mobility-course-card__copy{min-width:0;display:grid;gap:2px}
.mobility-course-card__status{flex:0 0 auto;border-radius:999px;background:#ecfdf5;color:#0f6b43;padding:5px 8px;font-size:10px;font-weight:900;text-transform:uppercase}
.mobility-course-card__note{margin:0;color:#667085;font-size:12px;font-weight:650;line-height:1.35}
.mobility-course-card__next{display:grid;gap:3px;border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.07);padding:10px}
.mobility-course-card__next span{color:#667085;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-course-card__next strong{color:#172033;font-size:13px;line-height:1.25}
.mobility-course-card__help{display:grid;gap:5px;color:#667085;font-size:12px;font-weight:750;line-height:1.35}
.mobility-course-card__help span{display:block}
.mobility-course-card__facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0;padding:0;list-style:none}
.mobility-course-card__facts li{display:grid;gap:3px;border:1px solid rgba(15,23,42,.07);border-radius:8px;background:#fff;padding:9px;color:#667085;font-size:11px;font-weight:700;line-height:1.3}
.mobility-course-card__facts strong{color:#172033;font-size:12px;font-weight:900}
.mobility-course-card__zones{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:2px}
.mobility-course-card__zones-title{flex:1 0 100%;color:#667085;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-course-card__slot{appearance:none;min-width:0;border:1px solid rgba(22,166,106,.18);border-radius:999px;background:#f7fcfa;color:#0f6b43;padding:7px 9px;font:850 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer}
.mobility-progress__intro{margin:0 0 10px;color:#667085;font-size:13px;line-height:1.4;font-weight:650}
.mobility-tests-intro{margin:0 0 12px;padding:12px;border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.07);color:#475569}
.mobility-tests-intro strong{display:block;color:#172033;font-size:14px;line-height:1.2;margin-bottom:4px}
.mobility-tests-intro span{display:block;font-size:12px;font-weight:700;line-height:1.35}
.mobility-progress-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 12px}
.mobility-progress-actions button{margin:0!important}
.mobility-progress-actions .mobility-primary-btn{background:#0f6b43;color:#fff;box-shadow:0 10px 24px rgba(15,107,67,.14)}
.mobility-secondary-btn--plain{background:#fff!important;color:#334155!important;border:1px solid rgba(15,23,42,.1)!important;box-shadow:none!important}
.mobility-progress__section{display:grid;gap:8px;margin-top:12px}
.mobility-progress__section-title{margin:0;color:#172033;font-size:14px;font-weight:900}
.mobility-progress__note{margin:0;color:#667085;font-size:12px;font-weight:650;line-height:1.35}
.mobility-session-notices{display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
.mobility-session-notices li{border-radius:10px;padding:8px 10px;background:#f8fafc;color:#475569;font-size:12px;font-weight:700;line-height:1.35}
.mobility-session-notices li[data-level="error"],.mobility-session-notices li[data-level="warn"],.mobility-session-notices li[data-level="warning"]{background:#fff7ed;color:#9a3412}
.mobility-save-status{margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#dcfce7;color:#166534;font-size:13px;font-weight:800}
.mobility-fs-session{min-height:100%;display:flex;flex-direction:column;gap:0}
.mobility-app{--mob-w:390px}
.mobility-fs__header{display:flex;align-items:center;justify-content:space-between;gap:clamp(8px,calc(var(--mob-w) * .035),18px);margin-bottom:20px;min-width:0}
.mobility-fs__header-actions{display:flex;align-items:center;gap:clamp(5px,calc(var(--mob-w) * .02),9px);flex:0 0 auto;margin-left:auto}
.mobility-fs__header-actions .mobility-fs__icon-btn--close{margin-left:clamp(3px,calc(var(--mob-w) * .015),7px)}
.mobility-fs__header h1,.mobility-fs__title{font-size:clamp(20px,calc(var(--mob-w) * .062),28px)!important;font-weight:800!important;margin:0 6px 0 0!important;line-height:1.1!important;color:#0b1220!important;letter-spacing:-.022em!important;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.mobility-fs__title-text{display:inline-block}
.mobility-fs__icon-btn{appearance:none;width:clamp(32px,calc(var(--mob-w) * .092),40px);height:clamp(32px,calc(var(--mob-w) * .092),40px);border:0;border-radius:999px;background:rgba(118,118,128,.12);color:#3c3c43;font:600 clamp(15px,calc(var(--mob-w) * .043),18px)/1 -apple-system,BlinkMacSystemFont,system-ui,"Segoe UI",sans-serif;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:saturate(140%);backdrop-filter:saturate(140%);transition:background .15s ease,transform .1s ease,color .15s ease}
.mobility-fs__icon-btn:hover{background:rgba(118,118,128,.18);color:#1c1c1e}
.mobility-fs__icon-btn:active{transform:scale(.9);background:rgba(118,118,128,.24)}
.mobility-fs__icon-btn--close{color:#8a8a8e;font-weight:500;font-size:20px}
.mobility-fs__icon-btn--close:hover{background:rgba(255,59,48,.12);color:#ff3b30}
.mobility-fs__eyebrow{margin:0 0 4px;color:#16a66a;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-fs__sub{max-width:620px;margin:6px 0 0;color:#667085;font-size:14px;line-height:1.35}
.mobility-fs__score{min-width:84px;border-radius:8px;padding:9px 10px;background:#e7f4ee;color:#0f6b43;text-align:center;font-weight:900;box-shadow:0 8px 20px rgba(15,107,67,.1)}
.mobility-fs__score small{display:block;color:#47745d;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.mobility-fs-tabs{display:flex;justify-content:space-between;gap:3px;padding:5px;background:linear-gradient(180deg,rgba(118,120,128,.12),rgba(118,120,128,.08));border:.5px solid rgba(15,23,42,.05);border-radius:16px;margin:0 0 18px;box-shadow:inset 0 1px 2.5px rgba(15,23,42,.06),0 1px 0 rgba(255,255,255,.6);overflow-x:auto;scrollbar-width:none}
.mobility-fs-tabs::-webkit-scrollbar{display:none}
.mobility-fs-tab{appearance:none;flex:1 1 0;min-width:0;padding:8px 2px 7px;border:0;border-radius:12px;background:transparent;color:rgba(60,60,67,.72);font:650 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.01em;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;flex-direction:column;align-items:center;gap:3px;transition:color .15s ease,background .15s ease,transform .1s ease}
.mobility-fs-tab:hover{color:rgba(15,23,42,.9)}
.mobility-fs-tab:active{transform:scale(.96)}
.mobility-fs-tab__icon{font-size:17px;line-height:1;opacity:.85;transition:opacity .15s ease}
.mobility-fs-tab__label{font-size:11px;line-height:1.15;font-weight:inherit;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mobility-fs-tab--active,.mobility-fs-tab.is-active{background:linear-gradient(180deg,#fff 0%,#fafbfd 100%);color:#0b1220;font-weight:800;box-shadow:0 1px 1px rgba(15,23,42,.05),0 5px 12px rgba(15,23,42,.12),inset 0 .5px 0 rgba(255,255,255,1)}
.mobility-fs-tab--active .mobility-fs-tab__icon,.mobility-fs-tab.is-active .mobility-fs-tab__icon{opacity:1}
.mobility-fs-equipment{margin:0 0 16px}
.mobility-fs-equipment,.mobility-fs-equipment__row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:2px 1px}
.mobility-fs-equipment-chip{appearance:none;min-height:42px;padding:0 12px;border:1px solid rgba(15,23,42,.09);border-radius:999px;background:linear-gradient(180deg,#fff,#f7f9f8);color:#3a4659;font:700 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 1px 1px rgba(15,23,42,.03),0 3px 9px rgba(15,23,42,.05);cursor:pointer;transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease,background .12s ease,color .12s ease}
.mobility-fs-equipment-chip>span:not(:last-child){display:none}
.mobility-fs-equipment-chip:hover{transform:translateY(-1px);box-shadow:0 2px 3px rgba(15,23,42,.05),0 6px 14px rgba(15,23,42,.08)}
.mobility-fs-equipment-chip:active{transform:translateY(0)}
.mobility-fs-equipment-chip.is-available{border-color:transparent;background:linear-gradient(160deg,#1aae72,#0f7a4c);color:#fff;box-shadow:0 2px 4px rgba(15,107,67,.18),0 8px 18px rgba(15,107,67,.26)}
.mobility-fs-goalsel{margin:0 0 14px}
.mobility-fs-goalsel__label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#667085;margin:0 0 8px}
.mobility-fs-goalsel__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:7px}
.mobility-fs-goalsel__btn{appearance:none;position:relative;overflow:hidden;min-height:58px;padding:7px 7px 6px;border:1px solid rgba(15,23,42,.07);border-radius:12px;background:linear-gradient(180deg,#fff 0%,#f8faf9 100%);color:#172033;font:700 12px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-shadow:0 1px 1px rgba(15,23,42,.03),0 6px 16px rgba(15,23,42,.05);cursor:pointer;transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}
.mobility-fs-goalsel__btn:hover{transform:translateY(-1px);box-shadow:0 2px 3px rgba(15,23,42,.05),0 10px 22px rgba(15,23,42,.08)}
.mobility-fs-goalsel__btn:active{transform:translateY(0)}
.mobility-fs-goalsel__btn.is-empty{opacity:.72}
.mobility-fs-goalsel__btn.is-active{background:linear-gradient(160deg,#1aae72 0%,#0f6b43 100%);color:#fff;border-color:transparent;box-shadow:0 2px 4px rgba(15,107,67,.18),0 12px 26px rgba(15,107,67,.28);opacity:1}
.mobility-fs-goalsel__btn.is-active:hover{transform:translateY(-1px);box-shadow:0 4px 6px rgba(15,107,67,.2),0 16px 30px rgba(15,107,67,.3)}
.mobility-fs-goalsel__icon{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;background:rgba(15,23,42,.045);transition:background .12s ease}
.mobility-fs-goalsel__btn.is-active .mobility-fs-goalsel__icon{background:rgba(255,255,255,.18)}
.mobility-fs-goalsel__emoji{font-size:18px;line-height:1;width:24px;height:24px;border-radius:8px;background:rgba(15,23,42,.045);display:flex;align-items:center;justify-content:center}
.mobility-fs-goalsel__btn.is-active .mobility-fs-goalsel__emoji{background:rgba(255,255,255,.18)}
.mobility-fs-goalsel__text{font-size:11.5px;line-height:1.1;font-weight:800;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mobility-fs-goalsel__count{position:absolute;top:5px;right:5px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:rgba(15,23,42,.07);color:#475467;font-size:9px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center}
.mobility-fs-goalsel__btn.is-active .mobility-fs-goalsel__count{background:rgba(255,255,255,.22);color:#fff}
.mobility-fs-goalsel__btn.has-status .mobility-fs-goalsel__count{min-width:34px;background:rgba(22,163,74,.10);color:#15803d}
.mobility-fs-goalsel__btn.has-status.is-active .mobility-fs-goalsel__count{background:rgba(255,255,255,.22);color:#fff}
.mobility-fs-load{margin:-2px 0 18px;padding:14px 14px 12px;border:1px solid rgba(15,23,42,.075);border-radius:16px;background:linear-gradient(180deg,#ffffff 0%,#f7faf9 100%);box-shadow:0 1px 1px rgba(15,23,42,.03),0 10px 26px rgba(15,23,42,.055)}
.mobility-fs-load__top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.mobility-fs-load__label{min-width:0;display:grid;gap:2px}
.mobility-fs-load__eyebrow{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.13em;color:#667085}
.mobility-fs-load__title{font-size:15px;line-height:1.1;font-weight:900;color:#111827}
.mobility-fs-load__caption{font-size:12px;line-height:1.25;font-weight:700;color:#667085}
.mobility-fs-load__badge{flex:0 0 auto;display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border-radius:999px;background:#0f172a;color:#fff;font-size:12px;font-weight:900;box-shadow:0 8px 20px rgba(15,23,42,.16)}
.mobility-fs-load__track{position:relative;padding:9px 0 4px}
.mobility-fs-load__range{appearance:none;width:100%;height:20px;margin:0;background:transparent;cursor:pointer;display:block}
.mobility-fs-load__range:focus{outline:none}
.mobility-fs-load__range::-webkit-slider-runnable-track{height:8px;border-radius:999px;background:linear-gradient(90deg,#16a66a 0%,#16a66a var(--load-progress,50%),#e5e7eb var(--load-progress,50%),#e5e7eb 100%);box-shadow:inset 0 1px 2px rgba(15,23,42,.12)}
.mobility-fs-load__range::-moz-range-track{height:8px;border-radius:999px;background:#e5e7eb}
.mobility-fs-load__range::-moz-range-progress{height:8px;border-radius:999px;background:#16a66a}
.mobility-fs-load__range::-webkit-slider-thumb{appearance:none;width:28px;height:28px;margin-top:-10px;border-radius:999px;border:3px solid #fff;background:linear-gradient(180deg,#22c55e,#0f8a55);box-shadow:0 4px 12px rgba(15,107,67,.3),0 0 0 1px rgba(15,23,42,.08)}
.mobility-fs-load__range::-moz-range-thumb{width:22px;height:22px;border-radius:999px;border:3px solid #fff;background:linear-gradient(180deg,#22c55e,#0f8a55);box-shadow:0 4px 12px rgba(15,107,67,.3),0 0 0 1px rgba(15,23,42,.08)}
.mobility-fs-load__ticks{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-top:7px}
.mobility-fs-load__tick{appearance:none;min-width:0;border:0;background:transparent;color:#94a3b8;font:800 10px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:4px 0;border-radius:8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mobility-fs-load__tick.is-active{color:#0f6b43;background:#e7f4ee}
.mobility-fs-goal-placeholder__hint{margin:10px 0 0;color:#667085;font-size:13px;line-height:1.35;font-weight:700}
.mobility-fs-tab-content{min-width:0;padding:6px 0 12px}
.mobility-fs-today__hero{display:block}
.mobility-fs-mixcard,.mobility-fs-program-card{margin:0 0 16px}
.mobility-fs-mixcard__hint{font-size:13px;line-height:1.45;color:#667085;margin:0 0 8px;font-style:italic}
.mobility-fs-mixcard__inner,.mobility-fs-program-card{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:20px;box-shadow:0 10px 28px rgba(15,23,42,.07)}
.mobility-fs-mixcard__head-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.mobility-fs-mixcard__badge,.mobility-fs-program-card__rec-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#fff3d5;color:#a15c00;padding:5px 9px;font-size:11px;font-weight:900;text-transform:uppercase}
.mobility-fs-mixcard__goalhint{font-size:12px;font-weight:800;color:#8a6a28}
.mobility-fs-mixcard__title,.mobility-fs-program-card__title{margin:0 0 8px;color:#172033;font-size:20px;line-height:1.15;font-weight:900}
.mobility-fs-mixcard__desc,.mobility-fs-program-card__desc{margin:0 0 12px;color:#586579;font-size:14px;line-height:1.45}
.mobility-fs-mixcard__chips{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
.mobility-fs-mixcard__exlist{display:grid;gap:8px;margin:12px 0}
.mobility-fs-mixcard__exlist-title{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#667085}
.mobility-fs-mixcard__exrow{display:block;overflow:hidden;padding:0;border-radius:12px;background:#f8fbfa;border:1px solid rgba(15,23,42,.06)}
.mobility-fs-mixcard__exthumb{width:100%;height:118px;overflow:hidden;background:#e7f4ee;display:flex;align-items:center;justify-content:center}
.mobility-fs-mixcard__exthumb img{width:100%;height:100%;object-fit:cover;display:block}
.mobility-fs-mixcard__exinfo{min-width:0;display:flex;flex-direction:column;gap:2px;padding:8px 10px 9px}
.mobility-fs-mixcard__exname{color:#172033;font-size:13px;font-weight:900;line-height:1.2}
.mobility-fs-mixcard__exsub{color:#667085;font-size:12px;font-weight:700;line-height:1.2}
.mobility-fs-mixcard__actions{display:flex;gap:8px;margin-top:12px}
.mobility-fs-mixcard__btn{appearance:none;border:0;border-radius:12px;padding:12px 14px;font:900 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
.mobility-fs-mixcard__btn--reroll{width:48px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
.mobility-fs-mixcard__btn--secondary{background:#f8fafc;color:#334155;border:1px solid rgba(15,23,42,.08)}
.mobility-fs-mixcard__btn--launch{flex:1;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;box-shadow:0 10px 24px rgba(249,115,22,.22)}
.mobility-fs-guided-launch .mobility-fs-mixcard__inner{border-color:rgba(22,166,106,.22);background:linear-gradient(180deg,#ffffff,#f4fbf7)}
.mobility-fs-cta,.mobility-fs-ghost{appearance:none;width:100%;border-radius:12px;padding:14px 16px;font:900 15px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
.mobility-fs-cta{border:0;background:linear-gradient(135deg,#16a66a,#0f8a55);color:#fff;box-shadow:0 12px 28px rgba(22,166,106,.24)}
.mobility-fs-ghost{border:1px solid rgba(15,23,42,.10);background:#fff;color:#334155}
.mobility-today-hero{position:relative;overflow:hidden;border-radius:8px;padding:16px;margin:0 0 12px;background:linear-gradient(135deg,#14312a 0%,#1f6b4d 55%,#e7f4ee 100%);color:#fff;box-shadow:0 18px 42px rgba(20,49,42,.22)}
.mobility-today-hero:after{content:"";position:absolute;right:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.16)}
.mobility-today-hero__content{position:relative;z-index:1}
.mobility-today-hero__top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.mobility-today-hero h3{margin:0;color:#fff;font-size:22px;line-height:1.08}
.mobility-today-hero p{max-width:520px;margin:8px 0 0;color:rgba(255,255,255,.82);font-size:13px;line-height:1.4}
.mobility-today-hero__meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.mobility-today-hero .mobility-chip{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.18)}
.mobility-today-hero__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.mobility-primary-btn,.mobility-secondary-btn{appearance:none;border:0;border-radius:8px;padding:11px 13px;font:900 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
.mobility-primary-btn{background:#fff;color:#14573d;box-shadow:0 10px 24px rgba(0,0,0,.12)}
.mobility-secondary-btn{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.22)}
.mobility-mode-rail{display:flex;gap:8px;margin:0 0 12px;overflow-x:auto;scrollbar-width:none}
.mobility-mode-rail::-webkit-scrollbar{display:none}
.mobility-mode-card{min-width:154px;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;padding:11px;text-align:left;box-shadow:0 8px 22px rgba(15,23,42,.05);cursor:pointer}
.mobility-mode-card.is-selected{border-color:#16a66a;background:#e9f8f1;box-shadow:0 0 0 2px rgba(22,166,106,.12)}
.mobility-mode-card strong{display:block;color:#1f2937;font-size:13px;line-height:1.15}
.mobility-mode-card span{display:block;margin-top:5px;color:#667085;font-size:11px;font-weight:800;line-height:1.2}
.mobility-quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.mobility-quick-card{border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;padding:11px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
.mobility-quick-card strong{display:block;color:#1f2937;font-size:13px}
.mobility-quick-card span{display:block;margin-top:4px;color:#667085;font-size:12px;font-weight:700;line-height:1.25}
.mobility-flow{display:grid;gap:10px;margin-bottom:12px}
.mobility-step{border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;padding:12px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
.mobility-step__head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
.mobility-step__title{display:flex;align-items:center;gap:8px;color:#172033;font-size:14px;font-weight:900}
.mobility-step__num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:#162036;color:#fff;font-size:12px;font-weight:900}
.mobility-step__hint{color:#667085;font-size:12px;font-weight:700}
.mobility-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mobility-choice-card,.mobility-equipment-chip,.mobility-action-card,.mobility-exercise-card{appearance:none;text-align:left;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#f8fbfa;color:#253045;cursor:pointer}
.mobility-choice-card{min-height:66px;padding:11px}
.mobility-choice-card.is-selected,.mobility-equipment-chip.is-selected,.mobility-action-card.is-selected,.mobility-exercise-card.is-selected{border-color:#16a66a;background:#e9f8f1;box-shadow:0 0 0 2px rgba(22,166,106,.12)}
.mobility-choice-card strong,.mobility-action-card strong,.mobility-exercise-card strong{display:block;color:#172033;font-size:13px;line-height:1.18}
.mobility-choice-card span,.mobility-action-card span,.mobility-exercise-card span{display:block;margin-top:5px;color:#667085;font-size:11px;font-weight:750;line-height:1.25}
.mobility-equipment-row{display:flex;flex-wrap:wrap;gap:8px}
.mobility-equipment-chip{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:8px 10px;font-size:12px;font-weight:850}
.mobility-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.mobility-action-card{min-height:88px;padding:12px}
.mobility-action-card__icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:#fff;margin-bottom:8px;font-size:15px}
.mobility-run-shell{display:grid;gap:10px}
.mobility-compact-plan{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;padding:11px;margin-bottom:12px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
.mobility-compact-plan strong{color:#172033;font-size:13px}
.mobility-compact-plan span{display:block;color:#667085;font-size:12px;font-weight:750}
.mobility-constructor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mobility-constructor__summary{display:grid;gap:8px;margin:0 0 12px;padding:12px;border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.07)}
.mobility-constructor__summary strong{color:#172033;font-size:14px;line-height:1.2}
.mobility-constructor__summary span{color:#667085;font-size:12px;font-weight:750;line-height:1.35}
.mobility-constructor__selected{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.mobility-constructor__selected .mobility-chip{background:#ecfdf5;color:#0f6b43}
.mobility-constructor__section-title{margin:0 0 8px;color:#667085;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-exercise-card{min-height:86px;padding:10px}
.mobility-exercise-card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.mobility-constructor-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.mobility-constructor-actions button{margin:0!important}
.mobility-registry-backdrop{position:fixed;inset:0;z-index:2147483100;background:rgba(15,23,42,.28);display:flex;align-items:flex-start;justify-content:center;padding:calc(env(safe-area-inset-top,16px) + 18px) 12px 18px}
.mobility-registry-dialog{width:min(720px,100%);max-height:calc(100vh - 48px);overflow:auto;border-radius:14px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.22);border:1px solid rgba(15,23,42,.08);padding:14px}
.mobility-registry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:sticky;top:-14px;background:#fff;padding:2px 0 12px;z-index:1}
.mobility-registry-head h3{margin:0;color:#172033;font-size:19px;line-height:1.15}
.mobility-registry-head p{margin:4px 0 0;color:#667085;font-size:12px;line-height:1.35;font-weight:700}
.mobility-registry-close{appearance:none;width:44px;height:44px;border:1px solid #fecdd3;border-radius:12px;background:#fff5f8;color:#ec4899;font:900 20px/1 system-ui;cursor:pointer}
.mobility-registry-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mobility-registry-card{display:flex;flex-direction:column;gap:8px;align-items:stretch;text-align:left;border:1px solid rgba(15,23,42,.08);border-radius:10px;background:#f8fbfa;padding:10px;color:#253045}
.mobility-registry-card.is-selected{border-color:#16a66a;background:#e9f8f1;box-shadow:0 0 0 2px rgba(22,166,106,.12)}
.mobility-registry-card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.mobility-registry-card strong{color:#172033;font-size:13px;line-height:1.2}
.mobility-registry-card span{color:#667085;font-size:11px;font-weight:800;line-height:1.25}
.mobility-registry-card button{align-self:flex-start;margin:0!important}
.mobility-registry-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,23,42,.07)}
.mobility-fs-registry__backdrop{position:fixed;inset:0;z-index:2147483100;background:rgba(15,23,42,.28);display:flex;align-items:flex-start;justify-content:center;padding:calc(env(safe-area-inset-top,16px) + 18px) 12px 18px}
.mobility-fs-registry{width:min(720px,100%);max-height:calc(100vh - 48px);overflow:auto;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.22);border:1px solid rgba(15,23,42,.08);padding:14px}
.mobility-fs-registry__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:sticky;top:-14px;background:#fff;padding:2px 0 12px;z-index:2}
.mobility-fs-registry__title{margin:0;color:#172033;font-size:22px!important;line-height:1.15;font-weight:850}
.mobility-fs-registry__sub{margin:4px 0 0;color:#667085;font-size:12px;line-height:1.35;font-weight:800}
.mobility-fs-registry__close{appearance:none;width:48px;height:48px;border:1px solid #fecdd3;border-radius:14px;background:#fff5f8;color:#ec4899;font:900 22px/1 system-ui;cursor:pointer;flex:0 0 auto}
.mobility-fs-registry__filters{margin:0 0 12px}
.mobility-fs-registry__search{position:relative;display:block}
.mobility-fs-registry__search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:13px;color:#667085;pointer-events:none}
.mobility-fs-registry__search-input{width:100%;min-height:42px;border:1px solid rgba(15,23,42,.1);border-radius:12px;background:#f8fbfa;color:#172033;padding:9px 12px 9px 34px;font:800 13px/1.2 system-ui;outline:none}
.mobility-fs-registry__search-input:focus{border-color:#16a66a;box-shadow:0 0 0 3px rgba(22,166,106,.13);background:#fff}
.mobility-fs-registry__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mobility-fs-registry-card{display:flex;flex-direction:column;gap:8px;min-width:0;border:1px solid rgba(15,23,42,.08);border-radius:12px;background:#fff;color:#253045;box-shadow:0 8px 22px rgba(15,23,42,.05);overflow:hidden}
.mobility-fs-registry-card.is-selected{border-color:#16a66a;background:#f2fbf6;box-shadow:0 0 0 2px rgba(22,166,106,.12),0 10px 24px rgba(15,23,42,.06)}
.mobility-fs-registry-card__pick{appearance:none;display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;align-items:stretch;width:100%;min-height:110px;border:0;background:transparent;text-align:left;padding:0;color:inherit;cursor:pointer}
.mobility-fs-registry-card__photo{position:relative;display:block;width:96px;height:110px;min-height:110px;background:#e7f4ee;overflow:hidden}
.mobility-fs-registry-card__img{width:100%;height:100%;object-fit:cover;display:block}
.mobility-fs-registry-card__fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#0f6b43;font-size:28px;font-weight:900;background:linear-gradient(135deg,#e7f4ee,#f8fbfa)}
.mobility-fs-registry-card__img + .mobility-fs-registry-card__fallback{display:none}
.mobility-fs-registry-card__body{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px 10px 10px 0}
.mobility-fs-registry-card__name{color:#172033;font-size:13px;font-weight:850;line-height:1.2}
.mobility-fs-registry-card__meta{color:#667085;font-size:11px;font-weight:800;line-height:1.25}
.mobility-fs-registry-card__chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto}
.mobility-fs-registry__pill{display:inline-flex;align-items:center;min-height:22px;border-radius:999px;background:#eef6f2;color:#527064;padding:3px 7px;font-size:10px;font-weight:850;line-height:1}
.mobility-fs-registry-card__action-btn{align-self:flex-start;margin:0 10px 10px!important}
.mobility-fs-registry__empty{border:1px dashed rgba(15,23,42,.14);border-radius:12px;background:#f8fbfa;color:#667085;padding:18px;text-align:center;font-size:13px;font-weight:850}
.mobility-fs-registry__footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,23,42,.07)}
.mobility-fs-registry__footer-text{color:#667085;font-size:12px;font-weight:850}
.mobility-protocols__intro{display:grid;gap:4px;margin:0 0 12px;padding:12px;border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.07)}
.mobility-protocols__intro strong{color:#172033;font-size:14px;line-height:1.2}
.mobility-protocols__intro span{color:#667085;font-size:12px;font-weight:750;line-height:1.35}
.mobility-protocols__current{display:grid;gap:5px;margin:0 0 12px;padding:12px;border-radius:8px;background:#ecfdf5;border:1px solid rgba(22,166,106,.18);color:#0f6b43}
.mobility-protocols__current span{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-protocols__current strong{font-size:14px;line-height:1.2;color:#0f5132}
.mobility-protocols__current p{margin:0;color:#527064;font-size:12px;font-weight:700;line-height:1.35}
.mobility-protocol-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 12px}
.mobility-protocol-card{position:relative;min-width:0;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;padding:13px;text-align:left;box-shadow:0 10px 24px rgba(15,23,42,.06);cursor:pointer}
.mobility-protocol-card.is-selected{border-color:#16a66a;background:#e9f8f1;box-shadow:0 0 0 2px rgba(22,166,106,.12),0 12px 28px rgba(15,23,42,.08)}
.mobility-protocol-card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.mobility-protocol-card h4{margin:0;color:#172033;font-size:15px;line-height:1.15}
.mobility-protocol-card p{margin:8px 0;color:#667085;font-size:12px;line-height:1.35}
.mobility-protocol-card__tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.mobility-guided{overflow:hidden;padding:0}
.mobility-guided__hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:0;background:#fff}
.mobility-guided__visual{min-height:260px;background:#e7f4ee}
.mobility-guided__visual img{width:100%;height:100%;object-fit:cover;display:block}
.mobility-guided__fallback{width:100%;height:100%;min-height:260px;display:flex;align-items:center;justify-content:center;color:#0f6b43;font-size:44px;font-weight:900;background:linear-gradient(135deg,#e7f4ee,#f6faf8)}
.mobility-guided__body{padding:16px;display:flex;flex-direction:column;gap:10px}
.mobility-guided__kicker{color:#16a66a;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-guided__title{margin:0;color:#172033;font-size:22px;line-height:1.12}
.mobility-guided__instruction{margin:0;color:#586579;font-size:13px;line-height:1.42}
.mobility-guided__metric{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.mobility-guided__metric div{border-radius:8px;background:#f8fbfa;border:1px solid rgba(15,23,42,.06);padding:9px}
.mobility-guided__metric strong{display:block;color:#172033;font-size:15px}
.mobility-guided__metric span{display:block;margin-top:3px;color:#667085;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.mobility-guided__progress{height:8px;border-radius:999px;background:#e5ece9;overflow:hidden}
.mobility-guided__progress span{display:block;height:100%;border-radius:999px;background:#16a66a}
.mobility-guided__controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}
.mobility-guided__controls button{margin:0!important}
.mobility-guided__list{border-top:1px solid rgba(15,23,42,.08);padding:12px 14px;display:grid;gap:7px;background:#fbfdfc}
.mobility-guided-step{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px;border-radius:8px;color:#667085;font-size:12px;font-weight:800}
.mobility-guided-step.is-current{background:#e9f8f1;color:#0f6b43}
.mobility-guided-step.is-done{color:#94a3b8}
.mobility-preflight{display:grid;gap:13px;text-align:left}
.mobility-preflight__lead{margin:0;color:#475569;font-size:14px;line-height:1.4}
.mobility-preflight__prep{padding:12px;border-radius:14px;background:#f0fdf4;border:1px solid rgba(22,166,106,.16);color:#0f6b43;font-size:14px;font-weight:900;line-height:1.35}
.mobility-preflight__list{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.mobility-preflight__item{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;color:#172033;font-size:14px;font-weight:750;line-height:1.35}
.mobility-preflight__check{display:inline-flex;width:22px;height:22px;border-radius:999px;align-items:center;justify-content:center;background:#dcfce7;color:#16a66a;font-weight:1000}
/* === Countdown display (ведомая сессия) — самодостаточный нейтральный namespace.
 * Mobility больше не наследует .heys-fingers-* из бандла пальцев: shared JSX
 * идёт через TrainingFocus.LiveCountdownDisplay, а visual skin остаётся локальным
 * namespace без скрытой CSS-зависимости от fingers. */
.mobility-countdown{display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 20px 12px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;--phase-color:#374151;--phase-color-soft:rgba(55,65,81,.12);--phase-gradient:linear-gradient(135deg,#374151 0%,#1f2937 100%)}
.mobility-countdown[data-phase='hang']{--phase-color:#dc2626;--phase-color-soft:rgba(220,38,38,.14);--phase-gradient:linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)}
.mobility-countdown[data-phase='prep']{--phase-color:#ca8a04;--phase-color-soft:rgba(202,138,4,.16);--phase-gradient:linear-gradient(135deg,#facc15 0%,#a16207 100%)}
.mobility-countdown[data-phase='paused']{--phase-color:#6b7280;--phase-color-soft:rgba(107,114,128,.14);--phase-gradient:linear-gradient(135deg,#9ca3af 0%,#4b5563 100%)}
.mobility-countdown[data-phase='done']{--phase-color:#10b981;--phase-color-soft:rgba(16,185,129,.14);--phase-gradient:linear-gradient(135deg,#34d399 0%,#047857 100%)}
.mobility-countdown__counter{font-size:13px;color:rgba(60,60,67,.65);text-align:center;font-weight:600;letter-spacing:-.005em;font-variant-numeric:tabular-nums}
[data-theme="dark"] .mobility-countdown__counter{color:rgba(235,235,245,.55)}
.mobility-countdown__grip{margin:0;font-size:22px;font-weight:700;letter-spacing:-.025em;line-height:1.15;text-align:center;color:#0f172a}
.mobility-countdown__hero{width:100%;max-width:392px;height:176px;border-radius:18px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.92) 0%,rgba(255,255,255,.82) 100%),var(--phase-color-soft);border:.5px solid rgba(0,0,0,.06);box-shadow:0 1px 2px rgba(15,23,42,.05),0 10px 26px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.8);display:flex;align-items:center;justify-content:center}
.mobility-countdown__hero img{width:100%;height:100%;object-fit:cover;display:block}
.mobility-countdown__chips{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.mobility-countdown__chip{display:inline-flex;flex-direction:column;align-items:center;padding:7px 14px;border-radius:14px;min-width:84px;background:rgba(255,255,255,.82);border:.5px solid rgba(0,0,0,.06);box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
.mobility-countdown__chip-label{font-size:10.5px;color:rgba(60,60,67,.6);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.mobility-countdown__chip-value{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-top:2px;color:#0f172a;font-variant-numeric:tabular-nums}
.mobility-countdown__phase-badge{display:inline-block;padding:7px 22px;margin:2px 0 0;border-radius:999px;font-size:12.5px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#fff;background:var(--phase-gradient);box-shadow:0 1px 2px rgba(0,0,0,.10),0 8px 22px var(--phase-color-soft),inset 0 1px 0 rgba(255,255,255,.28);min-width:88px;text-align:center}
.mobility-countdown__ring-wrap{position:relative;width:196px;height:196px;margin-top:0}
.mobility-countdown__ring{position:absolute;top:0;left:0;width:100%;height:100%}
.mobility-countdown__ring-track{stroke:rgba(0,0,0,.08);stroke-width:9}
[data-theme="dark"] .mobility-countdown__ring-track{stroke:rgba(255,255,255,.10)}
.mobility-countdown__ring-fill{stroke:var(--phase-color);stroke-width:11;stroke-linecap:round;filter:drop-shadow(0 2px 6px var(--phase-color-soft));transition:stroke-dashoffset 240ms cubic-bezier(.3,.7,.3,1)}
.mobility-countdown__digit{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;width:100%;max-width:100%;box-sizing:border-box;padding:0 18px;text-align:center;overflow:hidden;font-size:clamp(58px,16vw,76px);font-weight:700;letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--phase-color);text-shadow:0 2px 8px var(--phase-color-soft);transition:color 240ms ease}
.mobility-continuous .mobility-countdown__digit{font-size:clamp(52px,15vw,64px)}
.mobility-countdown__digit.is-final-count{animation:mobility-countdown-pulse 1s cubic-bezier(.4,0,.6,1) infinite}
@keyframes mobility-countdown-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
.mobility-countdown__controls{display:flex;gap:8px;margin-top:6px;flex-wrap:nowrap;justify-content:center;align-items:center;width:min(100% - 24px,360px)}
.mobility-countdown__btn{height:44px;min-width:44px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:.5px solid rgba(0,0,0,.08);background:rgba(255,255,255,.85);color:#0f172a;font-size:13.5px;font-weight:600;letter-spacing:-.005em;cursor:pointer;-webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);box-shadow:0 1px 2px rgba(0,0,0,.04),0 4px 10px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.7);transition:transform 120ms ease,background-color 180ms ease,box-shadow 180ms ease}
.mobility-countdown__btn:active{transform:translateY(0) scale(.98)}
[data-theme="dark"] .mobility-countdown__btn{background:rgba(40,40,46,.78);border-color:rgba(255,255,255,.1);color:#f9fafb;box-shadow:0 1px 2px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05)}
.mobility-countdown__btn--abort{background:linear-gradient(180deg,rgba(254,226,226,.85),rgba(254,202,202,.7));border-color:rgba(220,38,38,.22);color:#b91c1c;min-width:84px;padding-inline:10px;box-shadow:0 1px 2px rgba(220,38,38,.06),0 4px 12px rgba(220,38,38,.10),inset 0 1px 0 rgba(255,255,255,.7)}
[data-theme="dark"] .mobility-countdown__btn--abort{background:linear-gradient(180deg,rgba(127,29,29,.45),rgba(127,29,29,.30));border-color:rgba(252,165,165,.30);color:#fca5a5}
@media (prefers-reduced-motion:reduce){.mobility-countdown__digit.is-final-count{animation:none!important}.mobility-countdown__ring-fill{transition:none!important}}
.mobility-guided-live{position:fixed!important;inset:0!important;z-index:2147483200;width:100vw!important;max-width:none!important;height:100vh;height:100dvh;margin:0!important;padding:calc(14px + env(safe-area-inset-top)) 12px calc(18px + env(safe-area-inset-bottom))!important;border:0!important;border-radius:0!important;background:linear-gradient(180deg,#fff 0%,#fbfcfb 100%)!important;box-shadow:none!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
.mobility-guided-live .mobility-guided__visual{display:none}
.mobility-guided-live .mobility-countdown{width:min(100%,430px);flex:0 0 auto}
.mobility-guided-live .mobility-countdown__hero{order:1}
.mobility-guided-live .mobility-countdown__grip{order:2}
.mobility-guided-live .mobility-countdown__chips{order:3}
.mobility-guided-live .mobility-countdown__counter{order:4}
.mobility-guided-live .mobility-countdown__phase-badge{order:5}
.mobility-guided-live .mobility-countdown__ring-wrap{order:6}
.mobility-guided-live .mobility-breath-phases,.mobility-guided-live .mobility-technique-card--compact,.mobility-guided-live .mobility-step-feedback{order:7}
.mobility-guided-live .mobility-countdown__controls{order:8}
.mobility-guided-live .mobility-countdown__grip{max-width:min(100%,360px)}
.mobility-guided-live .mobility-countdown__digit{width:100%;max-width:100%;padding:0 18px;box-sizing:border-box;text-align:center;font-size:clamp(50px,14vw,64px);letter-spacing:-.035em;white-space:nowrap}
.mobility-live-roadmap{width:min(100% - 24px,392px);margin:8px auto 0;flex:0 0 auto}
.mobility-live-roadmap .fingers-fs-live-roadmap__list{display:flex;flex-direction:column}
.mobility-guided-live .fingers-fs-live-roadmap__item{min-width:0}
.mobility-guided-live .mobility-guided-step{min-width:0}
.mobility-guided-step__index{width:24px;height:24px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#e2e8f0;color:currentColor;font-size:11px;font-weight:950;font-variant-numeric:tabular-nums}
.mobility-guided-step__body{min-width:0;display:flex;flex-direction:column;gap:2px}
.mobility-guided-step__title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:currentColor;font-size:12.5px;font-weight:900;line-height:1.18}
.mobility-guided-step__meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:currentColor;opacity:.66;font-size:10.5px;font-weight:800;line-height:1.16}
.mobility-guided-live .mobility-guided-step.is-current{background:#fff;color:#020617;border-color:rgba(2,6,23,.16);box-shadow:0 8px 24px -18px rgba(2,6,23,.36)}
.mobility-guided-step.is-current .mobility-guided-step__index{background:#020617;color:#fff}
.mobility-guided-live .mobility-guided-step.is-done{color:#cbd5e1;background:#f8fafc}
.mobility-guided-live .mobility-breath-phases{width:min(100% - 24px,392px);margin:0 auto!important;padding:0!important;list-style:none;display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.mobility-guided-live .mobility-breath-phases li{border-radius:999px;background:#ecfdf5;color:#0f6b43;padding:5px 8px;font-size:11px;font-weight:850}
.mobility-voice-mini{position:relative;display:inline-flex;align-items:center;justify-content:center;align-self:flex-end;margin:0 6px 0 auto;z-index:3}
.mobility-voice-mini__btn{appearance:none;width:40px;height:40px;border:1px solid rgba(15,23,42,.08);border-radius:999px;background:rgba(255,255,255,.9);color:#0f6b43;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(15,23,42,.08);cursor:pointer}
.mobility-voice-mini.is-open .mobility-voice-mini__btn{background:#ecfdf5;border-color:rgba(16,185,129,.25)}
.mobility-voice-mini__pop{position:absolute;right:0;top:46px;width:min(280px,calc(100vw - 28px));padding:12px;border-radius:14px;background:#fff;border:1px solid rgba(15,23,42,.1);box-shadow:0 18px 50px rgba(15,23,42,.18);display:grid;gap:10px;color:#172033}
.mobility-voice-mini__row{display:grid!important;gap:6px!important;margin:0!important;color:#334155!important;font-size:12px!important;font-weight:850!important}
.mobility-voice-mini__row--volume{gap:8px!important}
.mobility-voice-mini__label{display:flex;justify-content:space-between;gap:8px;align-items:center}
.mobility-voice-mini__value{color:#0f6b43;font-weight:950}
.mobility-voice-mini__toggle{width:42px!important;height:24px!important;min-height:24px!important;justify-self:end;accent-color:#16a66a}
.mobility-voice-mini__slider{width:100%;accent-color:#16a66a}
.mobility-voice-mini__close{width:100%;margin:0!important;border:0!important;background:linear-gradient(135deg,#16a66a,#0f8a55)!important;color:#fff!important}
@media (min-height:900px){.mobility-guided-live{justify-content:center}}
@media (max-width:760px){
  .mobility-overlay-root{background:#f6faf8;backdrop-filter:none;-webkit-backdrop-filter:none}
  .mobility-app{padding:calc(env(safe-area-inset-top,12px) + 14px) clamp(14px,calc(var(--mob-w) * .043),20px) calc(28px + env(safe-area-inset-bottom))}
  .mobility-app__layout{display:block}
  .mobility-panel{padding:12px;margin-bottom:10px}
  .mobility-mode-grid,.mobility-blocks,.mobility-effects__grid{grid-template-columns:1fr}
  .mobility-checks{grid-template-columns:1fr}
  .mobility-assessment-row{grid-template-columns:1fr 1fr;align-items:start}
  .mobility-assessment-row>span{grid-column:1/-1}
  .mobility-fs__header{align-items:center}
  .mobility-fs-tabs{top:58px}
  .mobility-today-hero{padding:14px}
  .mobility-today-hero__top{display:block}
  .mobility-quick-grid{grid-template-columns:1fr}
  .mobility-choice-grid,.mobility-action-grid,.mobility-constructor-grid{grid-template-columns:1fr}
  .mobility-registry-grid{grid-template-columns:1fr}
  .mobility-registry-dialog{max-height:calc(100vh - 34px)}
  .mobility-fs-registry{max-height:calc(100vh - 34px)}
  .mobility-fs-registry-card__pick{grid-template-columns:1fr}
  .mobility-fs-registry-card__photo{width:100%;height:92px;min-height:92px}
  .mobility-fs-registry-card__body{padding:0 9px 8px;gap:4px}
  .mobility-fs-registry-card__name{font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .mobility-fs-registry-card__meta{font-size:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .mobility-fs-registry-card__chips{gap:4px;flex-wrap:nowrap;overflow:hidden}
  .mobility-fs-registry__pill{min-height:19px;padding:2px 6px;font-size:9px}
  .mobility-fs-registry-card__action-btn{min-height:34px;padding:6px 9px;font-size:11px;margin:0 9px 9px!important}
  .mobility-protocol-grid{grid-template-columns:1fr}
  .mobility-guided__hero{display:block}
  .mobility-guided__visual{min-height:220px}
  .mobility-guided-live{height:100vh;height:100dvh}
  .mobility-countdown__hero{height:148px}
  .mobility-guided-live .mobility-countdown{padding-top:0;gap:7px}
  .mobility-guided-live .mobility-countdown__ring-wrap{width:166px;height:166px}
  .mobility-guided-live .mobility-countdown__chip{min-width:96px}
  .mobility-guided-live .mobility-countdown__controls{width:100%}
}
`;
    doc.head.appendChild(style);
  }
  ensureMobilityStyles();

  function cx() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  function _mobilityNow() { return Date.now(); }
  function _getCurrentClientId() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? String(cid) : '';
  }
  function _mobilityTimerLockKey() {
    const cid = _getCurrentClientId();
    return cid ? ('heys_' + cid + '_mobility_timer_lock_v1') : 'heys_mobility_timer_lock_v1';
  }
  function _makeTimerTabId() {
    try {
      const cryptoObj = global.crypto;
      if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    } catch (_) {}
    return 'mobility_tab_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
  }
  const MOBILITY_TIMER_TAB_ID = Mobility.__timerTabId || _makeTimerTabId();
  Mobility.__timerTabId = MOBILITY_TIMER_TAB_ID;
  function _runnerKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.runner;
  }
  function _mobilityTimerOwnerLock() {
    const kr = _runnerKernel();
    if (!kr || typeof kr.createOwnerLock !== 'function') return null;
    return kr.createOwnerLock({
      storage: global.localStorage || null,
      key: _mobilityTimerLockKey(),
      ownerId: MOBILITY_TIMER_TAB_ID,
      ttlMs: MOBILITY_TIMER_LOCK_TTL_MS,
      now: _mobilityNow,
      failOpenOnStorageUnavailable: true
    });
  }
  function _acquireMobilityTimerLock(reason) {
    const ownerLock = _mobilityTimerOwnerLock();
    if (!ownerLock || typeof ownerLock.acquire !== 'function') return true;
    const result = ownerLock.acquire(reason || 'start');
    if (result.ok) return true;
    const existing = result.existing || {};
    Mobility.lastTimerLockDenied = {
      key: _mobilityTimerLockKey(),
      ownerTabId: existing.ownerTabId,
      heartbeatAt: existing.heartbeatAt,
      deniedAt: result.deniedAt || _mobilityNow(),
      reason: result.reason === 'held-by-another-owner' ? 'held-by-another-tab' : result.reason
    };
    return false;
  }
  function _touchMobilityTimerLock() {
    const ownerLock = _mobilityTimerOwnerLock();
    if (!ownerLock || typeof ownerLock.touch !== 'function') return true;
    return ownerLock.touch();
  }
  function _releaseMobilityTimerLock() {
    const ownerLock = _mobilityTimerOwnerLock();
    if (!ownerLock || typeof ownerLock.release !== 'function') return true;
    return ownerLock.release();
  }
  function _warnMobilityTimerLockDenied() {
    const msg = 'Уже запущена другая тренировка в этом окне. Закройте её или подождите несколько секунд.';
    try {
      if (HEYS.Toast && typeof HEYS.Toast.warn === 'function') HEYS.Toast.warn(msg);
      else if (HEYS.Toast && typeof HEYS.Toast.info === 'function') HEYS.Toast.info(msg);
    } catch (_) {}
  }
  function deps() {
    return {
      modeEngine: Mobility.modeEngine,
      routineBuilder: Mobility.routineBuilder,
      routineRunner: Mobility.routineRunner,
      onboarding: Mobility.onboarding,
      assessment: Mobility.assessment,
      readiness: Mobility.readiness,
      bibliography: Mobility.bibliography,
      progression: Mobility.progression,
      calendar: Mobility.calendar,
      coursePlanner: Mobility.coursePlanner,
      protocolCatalog: Mobility.protocolCatalog,
      recordsStore: Mobility.recordsStore,
      loadScale: Mobility.loadScale,
      validators: Mobility.validators
    };
  }
  function mobilitySessionIdempotencyKey(ctx, target, flags) {
    if (!ctx || !ctx.dateKey) return null;
    const session = target && target.session || {};
    const partial = !!(flags && flags.partial || target && target.partial || session.partial);
    const progress = target && target.partialProgress || session.partialProgress || {};
    const completed = partial ? Number(progress.completedSteps) || 0 : 0;
    return [
      'mobility',
      String(ctx.dateKey),
      String(ctx.trainingIndex == null ? 0 : ctx.trainingIndex),
      String(session.mode || 'unknown'),
      partial ? 'partial-' + completed : 'complete'
    ].join(':');
  }
  function persistMobilitySessionPair(options) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!opts.recordsStore || typeof opts.recordsStore.addSession !== 'function' || !opts.target) {
      return { status: 'failed', reason: 'records_unavailable', record: null, diarySaved: false };
    }
    let record = null;
    try {
      record = opts.recordsStore.addSession(opts.clientId, opts.target, opts.storage, {
        idempotencyKey: opts.idempotencyKey || null
      });
    } catch (_) {
      record = null;
    }
    if (!record) {
      return { status: 'failed', reason: 'records_write_failed', record: null, diarySaved: false };
    }
    if (!opts.diaryRequired) {
      return { status: 'saved_both', reason: 'diary_not_required', record: record, diarySaved: null };
    }
    if (!opts.trainingStep || typeof opts.trainingStep.saveMobility !== 'function') {
      return { status: 'diary_pending', reason: 'diary_unavailable', record: record, diarySaved: false };
    }
    try {
      const diaryResult = opts.trainingStep.saveMobility(opts.context, opts.mobilityLog, opts.meta);
      if (diaryResult === false || diaryResult && diaryResult.ok === false) {
        return { status: 'diary_pending', reason: 'diary_write_failed', record: record, diarySaved: false };
      }
    } catch (_) {
      return { status: 'diary_pending', reason: 'diary_write_failed', record: record, diarySaved: false };
    }
    return { status: 'saved_both', reason: 'saved', record: record, diarySaved: true };
  }
  function normalizeProfile(profile) {
    return Mobility.onboarding
      ? Mobility.onboarding.normalizeProfile(Object.assign({}, DEFAULT_PROFILE, profile || {}))
      : Object.assign({}, DEFAULT_PROFILE, profile || {});
  }
  function cloneRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) { return Object.assign({}, row); });
  }
  function initialAssessmentRows(assessment, rows) {
    const provided = cloneRows(rows);
    if (provided.length || !assessment || !assessment.TEST_IDS) return provided;
    return assessment.TEST_IDS.map(function (id) { return { testId: id, measure: null, activeROM: null, passiveROM: null }; });
  }
  function numberOrNull(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function chip(kind, text, key) {
    return h('span', { key: key || text, className: cx('mobility-chip', kind && 'mobility-chip--' + kind) }, text);
  }
  function humanizeVisibleText(text) {
    return String(text || '')
      .replace(/\bpain-free\b/gi, 'без боли')
      .replace(/\bCARs\b/g, 'суставной контроль')
      .replace(/\bRAMP\b/g, 'разминка')
      .replace(/\bend-range\b/gi, 'крайние положения')
      .replace(/\bdeload\b/gi, 'разгрузка')
      .replace(/\bDeload\b/g, 'разгрузка');
  }
  function reasonText(reason) {
    return humanizeVisibleText(REASON_LABEL[reason] || LOAD_REASON_LABEL[reason] || reason);
  }
  function limiterReasonText(reason) {
    const map = {
      'пассивный потолок ниже нормы': 'диапазон пока ниже ориентира',
      'пассивный диапазон есть, активного контроля мало': 'движение доступно, но контроля в нём пока мало',
      'вероятнее сила/техника вне основного scope мобильности': 'похоже, важнее сила или техника, а не растяжка',
      'значимого лимитера не видно': 'явного ограничения по замеру не видно'
    };
    return map[reason] || reason;
  }
  function protocolTagLabel(tag) {
    return PROTOCOL_TAG_LABEL[tag] || tag;
  }
  function issueCountLabel(count) {
    const n = Number(count) || 0;
    if (!n) return 'без ограничений';
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'ограничение'
      : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'ограничения' : 'ограничений');
    return n + ' ' + word;
  }
  function unitLabel(unit) {
    if (unit === 'deg') return '°';
    if (unit === 'cm') return ' см';
    if (unit === 'sec') return ' сек';
    if (unit === 'score') return ' балл';
    return unit || '';
  }
  function formatMeasure(value, unit) {
    const n = Number(value);
    const text = Number.isFinite(n) ? String(Math.round(n * 10) / 10) : String(value || '');
    const label = unitLabel(unit);
    return label && label[0] === ' ' ? text + label : text + label;
  }
  function atomTypeLabel(atom) {
    if (!atom) return '';
    return DOSE_SHAPE_LABEL[atom.doseShape] ||
      MODALITY_LABEL[atom.modality] ||
      BLOCK_LABEL[atom.block] ||
      '';
  }
  function atomTitle(atom) {
    if (!atom) return 'Упражнение';
    return ATOM_TITLE_LABEL[atom.id] || atom.title || atom.id || 'Упражнение';
  }
  function protocolTitle(protocol) {
    if (!protocol) return 'План';
    return PROTOCOL_NAME_LABEL[protocol.id] || protocol.name || protocol.id || 'План';
  }
  function protocolIntent(protocol) {
    if (!protocol) return '';
    return humanizeVisibleText(PROTOCOL_INTENT_LABEL[protocol.id] || protocol.intent || '');
  }
  function targetRepsLabel(reps, fallback) {
    if (Array.isArray(reps) && reps.length) {
      const values = reps.map(function (v) { return Number(v); }).filter(function (v) { return Number.isFinite(v) && v > 0; });
      if (values.length) return String(Math.round(values.reduce(function (sum, v) { return sum + v; }, 0) / values.length));
    }
    const n = Number(reps);
    return String(Number.isFinite(n) && n > 0 ? n : (fallback || 1));
  }
  function formatDose(atom) {
    const d = atom && atom.loadLevel != null && Mobility.loadScale && typeof Mobility.loadScale.tuneDose === 'function'
      ? Mobility.loadScale.tuneDose(atom, atom.loadLevel)
      : (atom && atom.dose) || {};
    if (atom.doseShape === 'hold') return (d.holdSec || 0) + ' сек';
    if (atom.doseShape === 'pnf') return (d.reps || 1) + ' цикла';
    if (atom.doseShape === 'breath') return Math.round((d.durationSec || 0) / 60) + ' мин';
    if (atom.doseShape === 'dynamic' || atom.doseShape === 'activation' || atom.doseShape === 'cars') {
      return targetRepsLabel(d.reps, atom.doseShape === 'cars' ? 2 : 8) + ' раз';
    }
    if (d.durationSec) return Math.round(d.durationSec / 60) + ' мин';
    return DOSE_SHAPE_LABEL[atom.doseShape] || '';
  }

  function SourceBadge(props) {
    const bib = deps().bibliography;
    // общий kernel-бейдж (📖 автор год), единый с режимом пальцев
    if (bib && bib.SourceBadge) {
      const el = bib.SourceBadge({ sourceId: props.sourceId, onClick: props.onClick });
      if (el) return el;
    }
    const src = bib && bib.getSource && bib.getSource(props.sourceId);
    if (!src) return h('span', { className: 'mobility-source mobility-source--missing' }, props.sourceId);
    return h('span', { className: 'mobility-source', title: src.title || src.id }, '📖 ', src.author || src.id, ' ', src.year || '');
  }

  function EffectMapPanel() {
    const bib = deps().bibliography;
    const effects = bib ? Object.keys(bib.EFFECT_MAP).map(function (id) { return bib.EFFECT_MAP[id]; }) : [];
    return h('section', { className: 'mobility-panel mobility-effects', 'aria-label': 'Карта эффектов' },
      h('h3', null, 'Карта эффектов'),
      h('div', { className: 'mobility-effects__grid' },
        effects.map(function (e) {
          return h('article', { key: e.id, className: 'mobility-effect', 'data-verdict': e.verdict },
            h('div', { className: 'mobility-effect__top' },
              h('strong', null, e.id),
              chip('confidence', 'Доказ. ' + e.confidence)
            ),
            h('div', { className: 'mobility-effect__verdict' }, VERDICT_LABEL[e.verdict] || e.verdict),
            h('p', null, humanizeVisibleText(e.msg))
          );
        })
      )
    );
  }

  function AtomVisual(props) {
    const atom = props.atom || {};
    if (!atom.visualAsset) return null;
    return h('div', {
      className: cx('mobility-block__visual', props.className),
      style: { width: '100%', aspectRatio: '4 / 5', overflow: 'hidden', borderRadius: 8, background: '#f3f0ea', marginBottom: 10 }
    },
      h('img', {
        src: atom.visualAsset,
        alt: 'Фото упражнения: ' + atomTitle(atom),
        loading: 'lazy',
        decoding: 'async',
        style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
        onError: function (e) {
          try { e.currentTarget.parentNode.style.display = 'none'; } catch (_) {}
        }
      })
    );
  }
  function atomForStep(step) {
    const catalog = Mobility.atomCatalog;
    return step && step.atomId && catalog && typeof catalog.getAtom === 'function'
      ? catalog.getAtom(step.atomId)
      : null;
  }
  function TechniqueCuePanel(props) {
    const atom = props.atom || {};
    const cues = atom.techniqueCues || null;
    if (!cues) return null;
    const compact = !!props.compact;
    const mistakes = Array.isArray(cues.commonMistakes) ? cues.commonMistakes : [];
    const head = cues.keyCue || cues.setup || 'Техника';
    if (compact) {
      const check = cues.selfCheck && cues.selfCheck !== head ? cues.selfCheck : '';
      return h('div', { className: 'mobility-technique-card mobility-technique-card--compact', 'aria-label': 'Фокус техники' },
        h('span', { className: 'mobility-technique-card__focus' }, head),
        check ? h('span', { className: 'mobility-technique-card__check' }, check) : null
      );
    }
    return h('div', { className: 'mobility-technique-card' + (compact ? ' mobility-technique-card--compact' : ''), 'aria-label': 'Техника упражнения' },
      h('strong', null, head),
      cues.setup ? h('span', null, cues.setup) : null,
      cues.selfCheck ? h('span', null, cues.selfCheck) : null,
      mistakes.length
        ? h('ul', null, mistakes.map(function (item, idx) { return h('li', { key: 'm' + idx }, item); }))
        : null,
      cues.regress ? h('span', null, 'Проще: ' + cues.regress) : null,
      cues.progress ? h('span', null, 'Сложнее: ' + cues.progress) : null
    );
  }
  function courseSlotLabel(course, slotId) {
    if (COURSE_SLOT_LABEL[slotId]) return COURSE_SLOT_LABEL[slotId];
    const slots = course && Array.isArray(course.slots) ? course.slots : [];
    const slot = slots.find(function (s) { return s.id === slotId; });
    const label = slot && slot.label || slotId || 'Зона';
    return String(label).split(':')[0];
  }
  function CourseStatusCard(props) {
    const course = props.course || null;
    const built = props.built || null;
    const summary = props.variant === 'summary';
    const blocks = built && built.session && Array.isArray(built.session.blocks) ? built.session.blocks : [];
    const weekLabel = course && course.currentWeekLabel ? course.currentWeekLabel : '';
    const phaseLabel = course && course.currentPhaseLabel ? course.currentPhaseLabel : '';
    if (!course) {
      return h('section', { className: 'mobility-compact-plan mobility-course-card' + (summary ? ' mobility-course-card--summary' : ''), 'data-course-empty': '1' },
        h('div', { className: 'mobility-course-card__head' },
          h('div', { className: 'mobility-course-card__copy' },
            h('strong', null, 'Курс осанки'),
            h('span', null, summary ? 'Не запущен · можно включить в разделе прогресса' : '4 недели: контроль шеи, лопаток, грудного отдела и таза')
          )
        ),
        h('p', { className: 'mobility-course-card__note' }, summary
          ? 'Сегодня можно сделать обычную тренировку. Курс нужен, если хотите вести осанку как последовательный план.'
        : 'Курс задаёт недельный фокус, а ежедневная тренировка подстраивает нагрузку под самочувствие, боль и доступный инвентарь.'),
        summary && props.onOpenProgress ? h('button', { type: 'button', className: 'mobility-secondary-btn', onClick: props.onOpenProgress }, 'Открыть курс') : null,
        !summary && props.onStart ? h('button', { type: 'button', className: 'mobility-primary-btn', onClick: props.onStart }, 'Начать курс') : null
      );
    }
    return h('section', { className: 'mobility-compact-plan mobility-course-card' + (summary ? ' mobility-course-card--summary' : ''), 'data-course-active': course.id },
      h('div', { className: 'mobility-course-card__head' },
        h('div', { className: 'mobility-course-card__copy' },
          h('strong', null, 'Курс осанки'),
          h('span', null, summary
            ? 'Неделя ' + weekLabel + ' · сегодняшняя тренировка уже учитывает курс'
            : 'Неделя ' + weekLabel + (phaseLabel ? ' · ' + phaseLabel : ''))
        ),
        h('span', { className: 'mobility-course-card__status' }, 'в работе')
      ),
      h('p', { className: 'mobility-course-card__note' }, summary
        ? 'Здесь кратко: курс уже учитывается в сегодняшней тренировке. Детали курса — в «Прогрессе».'
        : 'Курс уже учтён в сегодняшней тренировке. Здесь можно заменить отдельную зону и сверить изменения.'),
      !summary
        ? h(React.Fragment, null,
            h('div', { className: 'mobility-course-card__next' },
              h('span', null, 'Что делать сейчас'),
              h('strong', null, 'Сделайте сегодняшнюю тренировку. Курс уже встроен в план.')
            ),
            h('div', { className: 'mobility-course-card__help' },
              h('span', null, 'Если упражнение не подходит, замените только нужную зону ниже.'),
              h('span', null, 'Проверяйте изменения раз в несколько недель.')
            )
          )
        : null,
      summary && props.onOpenProgress ? h('button', { type: 'button', className: 'mobility-secondary-btn', onClick: props.onOpenProgress }, 'Управлять в Прогрессе') : null,
      !summary && blocks.length
        ? h('div', { className: 'mobility-course-card__zones', 'aria-label': 'Зоны для замены на сегодня' },
            h('span', { className: 'mobility-course-card__zones-title' }, 'Заменить зону, если нужно'),
            blocks.slice(0, 6).map(function (block) {
              const atom = block.atoms && block.atoms[0];
              const label = courseSlotLabel(course, block.slotId || block.id);
              return h('button', {
                key: block.slotId || block.id,
                type: 'button',
                className: 'mobility-course-card__slot',
                onClick: function () { props.onReplace && props.onReplace(block); },
                title: 'Заменить упражнение: ' + (atom ? atomTitle(atom) : label)
              }, label);
            })
          )
        : null
    );
  }

  function SessionNoticeList(props) {
    const built = props.built || {};
    const session = built.session || {};
    const issues = Array.isArray(built.issues) ? built.issues : [];
    const advisories = Array.isArray(session.advisories) ? session.advisories : [];
    const items = issues.map(function (i) {
      return {
        key: 'issue:' + i.code,
        level: i.level || 'warn',
        text: humanizeVisibleText(i.msg || i.code)
      };
    }).concat(advisories.map(function (a) {
      return {
        key: 'advisory:' + a.code,
        level: a.level || 'info',
        text: humanizeVisibleText(a.msg || a.code)
      };
    }));
    if (!items.length) return null;
    return h('ul', { className: 'mobility-session-notices', 'aria-label': 'Что учтено перед стартом' },
      items.slice(0, props.limit || 3).map(function (item, idx) {
        return h('li', { key: item.key + idx, 'data-level': item.level }, item.text);
      })
    );
  }

  function ModePicker(props) {
    const modeEngine = deps().modeEngine;
    const modes = modeEngine ? modeEngine.listModes() : [];
    return h('section', { className: 'mobility-panel mobility-modes', 'aria-label': 'Режим' },
      h('h3', null, 'Режим'),
      h('div', { className: 'mobility-mode-grid', role: 'tablist' },
        modes.map(function (m) {
          const selected = props.value === m.id;
          return h('button', {
            key: m.id,
            type: 'button',
            role: 'tab',
            'aria-selected': selected,
            className: cx('mobility-mode-btn', selected && 'is-selected'),
            onClick: function () { props.onChange && props.onChange(m.id); }
          },
            h('span', { className: 'mobility-mode-btn__label' }, MODE_LABEL[m.id] || m.label),
            h('span', { className: 'mobility-mode-btn__meta' }, PURPOSE_LABEL[m.purpose] || m.purpose, ' · ', AUTONOMIC_LABEL[m.autonomic] || m.autonomic)
          );
        })
      )
    );
  }

  function ProfilePanel(props) {
    const onboarding = deps().onboarding;
    const profile = normalizeProfile(props.profile);
    const result = onboarding ? onboarding.validateProfile(profile) : { issues: [] };

    function toggle(listName, value) {
      const current = Array.isArray(profile[listName]) ? profile[listName] : [];
      const next = current.indexOf(value) >= 0
        ? current.filter(function (x) { return x !== value; })
        : current.concat([value]);
      props.onChange && props.onChange(Object.assign({}, profile, { [listName]: next }));
    }

    return h('section', { className: 'mobility-panel mobility-profile', 'aria-label': 'Настройки тренировки' },
      h('h3', null, 'Настройки тренировки'),
      h('label', null,
        h('span', null, 'Возраст'),
        h('input', {
          'aria-label': 'Возраст',
          type: 'number',
          min: 0,
          value: profile.age == null ? '' : profile.age,
          onChange: function (e) { props.onChange && props.onChange(Object.assign({}, profile, { age: Number(e.target.value) || null })); }
        })
      ),
      h('label', null,
        h('span', null, 'Уровень'),
        h('select', {
          'aria-label': 'Уровень',
          value: profile.level,
          onChange: function (e) { props.onChange && props.onChange(Object.assign({}, profile, { level: e.target.value })); }
        },
          onboarding.LEVELS.map(function (id) { return h('option', { key: id, value: id }, LEVEL_LABEL[id] || id); })
        )
      ),
      h('label', null,
        h('span', null, 'Цель'),
        h('select', {
          'aria-label': 'Цель',
          value: profile.goal,
          onChange: function (e) { props.onChange && props.onChange(Object.assign({}, profile, { goal: e.target.value })); }
        },
          onboarding.GOALS.map(function (id) { return h('option', { key: id, value: id }, GOAL_LABEL[id] || id); })
        )
      ),
      h('div', { className: 'mobility-checks', 'aria-label': 'Особые условия' },
        onboarding.POPULATIONS.map(function (id) {
          return h('label', { key: id },
            h('input', {
              type: 'checkbox',
              checked: profile.populations.indexOf(id) >= 0,
              onChange: function () { toggle('populations', id); }
            }),
            POPULATION_LABEL[id] || id
          );
        })
      ),
      h('div', { className: 'mobility-checks', 'aria-label': 'Инвентарь' },
        onboarding.EQUIPMENT.map(function (id) {
          return h('label', { key: id },
            h('input', {
              type: 'checkbox',
              checked: profile.equipment.indexOf(id) >= 0,
              onChange: function () { toggle('equipment', id); }
            }),
            EQUIPMENT_LABEL[id] || id
          );
        })
      ),
      h('label', { className: 'mobility-disclaimer' },
        h('input', {
          type: 'checkbox',
          checked: profile.acceptedDisclaimer === true,
          onChange: function (e) { props.onChange && props.onChange(Object.assign({}, profile, { acceptedDisclaimer: e.target.checked })); }
        }),
        h('span', null, 'Понимаю: режим не заменяет медицинскую рекомендацию')
      ),
      result.issues.length
        ? h('ul', { className: 'mobility-issues' }, result.issues.map(function (i) {
            return h('li', { key: i.code, 'data-level': i.level }, humanizeVisibleText(i.msg || i.code));
          }))
        : null
    );
  }

  function SafetyOnboardingGate(props) {
    const profile = normalizeProfile(props.profile);
    const issues = props.validation && Array.isArray(props.validation.issues)
      ? props.validation.issues.filter(function (issue) { return issue.level === 'error'; })
      : [];
    return h('section', {
      className: 'mobility-panel mobility-safety-onboarding',
      'aria-label': 'Обязательные данные перед тренировкой'
    },
      h('h3', null, 'Перед первой тренировкой'),
      h('p', null, 'Укажите возраст и подтвердите предупреждение. Без этих данных тренировка не запускается.'),
      h('label', null,
        h('span', null, 'Возраст'),
        h('input', {
          'aria-label': 'Возраст перед тренировкой',
          type: 'number',
          min: 1,
          value: profile.age == null ? '' : profile.age,
          onChange: function (e) {
            const age = e.target.value === '' ? null : Number(e.target.value);
            props.onChange && props.onChange(Object.assign({}, profile, { age: Number.isFinite(age) ? age : null }));
          }
        })
      ),
      h('label', { className: 'mobility-disclaimer' },
        h('input', {
          'aria-label': 'Подтвердить предупреждение перед тренировкой',
          type: 'checkbox',
          checked: profile.acceptedDisclaimer === true,
          onChange: function (e) {
            props.onChange && props.onChange(Object.assign({}, profile, { acceptedDisclaimer: e.target.checked }));
          }
        }),
        h('span', null, 'Понимаю: режим не заменяет медицинскую рекомендацию')
      ),
      issues.length
        ? h('ul', { className: 'mobility-issues', role: 'alert' }, issues.map(function (issue) {
            return h('li', { key: issue.code, 'data-level': issue.level }, humanizeVisibleText(issue.msg || issue.code));
          }))
        : null
    );
  }

  function ReadinessPanel(props) {
    const readiness = deps().readiness;
    const input = props.input || {};
    const score = readiness ? readiness.score(input) : null;
    if (!score) return null;
    const fields = [
      ['stiffness', 'Скованность'],
      ['soreness', 'Боль и дискомфорт'],
      ['sleepQuality', 'Сон'],
      ['stress', 'Стресс'],
      ['hrvToday', 'Пульс: вариабельность сегодня'],
      ['hrvBaseline', 'Пульс: обычный уровень'],
      ['hrvMad', 'Пульс: дневной разброс']
    ];
    function update(name, value) {
      props.onChange && props.onChange(Object.assign({}, input, { [name]: numberOrNull(value) }));
    }
    return h('section', { className: 'mobility-panel mobility-readiness', 'data-band': score.band },
      h('h3', null, 'Самочувствие сегодня'),
      h('div', { className: 'mobility-readiness__score' }, String(score.score), '/100'),
      h('p', null, score.advisory),
      h('div', { className: 'mobility-readiness__inputs' },
        fields.map(function (field) {
          return h('label', { key: field[0] },
            h('span', null, field[1]),
            h('input', {
              'aria-label': field[1],
              type: 'number',
              value: input[field[0]] == null ? '' : input[field[0]],
              onChange: function (e) { update(field[0], e.target.value); }
            })
          );
        })
      )
    );
  }

  function AssessmentPanel(props) {
    const assessment = deps().assessment;
    const screens = initialAssessmentRows(assessment, props.screens);
    const audit = assessment ? assessment.limiterAudit(screens) : null;
    function updateRow(idx, patch) {
      const next = screens.map(function (row, rowIdx) {
        return rowIdx === idx ? Object.assign({}, row, patch) : row;
      });
      props.onChange && props.onChange(next);
    }
    return h('section', { className: 'mobility-panel mobility-assessment', 'aria-label': 'Замеры движения' },
      h('h3', null, 'Замеры движения'),
      audit && audit.leadingLimiter
        ? h('div', { className: 'mobility-limiter' },
            h('strong', null, 'Что сейчас мешает движению'),
            chip('limiter', JOINT_LABEL[audit.leadingLimiter.jointRegion] || audit.leadingLimiter.jointRegion),
            chip('type', LIMITER_TYPE_LABEL[audit.leadingLimiter.type] || audit.leadingLimiter.type),
            h('p', null, limiterReasonText(audit.leadingLimiter.reason))
          )
        : h('p', null, 'После первых замеров покажем главный фокус'),
      h('div', { className: 'mobility-assessment__rows' },
        screens.map(function (row, idx) {
          const test = assessment && assessment.TESTS ? assessment.TESTS[row.testId] : null;
          const scored = audit && audit.rows ? audit.rows.find(function (r) { return r.testId === row.testId; }) : null;
          const label = TEST_LABEL[row.testId] || row.testId;
          return h('div', { key: row.testId || idx, className: 'mobility-assessment-row' },
            h('span', null, label, test ? ' · ориентир ' + formatMeasure(test.norm, test.unit) : ''),
            h('label', null,
              h('span', null, 'Сейчас'),
              h('input', {
                'aria-label': label + ' текущий замер',
                type: 'number',
                value: row.measure == null ? '' : row.measure,
                onChange: function (e) { updateRow(idx, { measure: numberOrNull(e.target.value) }); }
              })
            ),
            h('label', null,
              h('span', null, 'Самостоятельно'),
              h('input', {
                'aria-label': label + ' самостоятельно',
                type: 'number',
                value: row.activeROM == null ? '' : row.activeROM,
                onChange: function (e) { updateRow(idx, { activeROM: numberOrNull(e.target.value) }); }
              })
            ),
            h('label', null,
              h('span', null, 'С помощью'),
              h('input', {
                'aria-label': label + ' с помощью',
                type: 'number',
                value: row.passiveROM == null ? '' : row.passiveROM,
                onChange: function (e) { updateRow(idx, { passiveROM: numberOrNull(e.target.value) }); }
              })
            ),
            scored && scored.ok ? h('strong', null, Math.round(scored.deficit * 100), '%') : h('small', null, 'добавьте замер')
          );
        })
      ),
      props.onSaveAssessment
        ? h('button', { type: 'button', onClick: function () { props.onSaveAssessment(audit); } }, 'Сохранить замеры')
        : null
    );
  }

  function TestsPanel(props) {
    return h('div', null,
      h('div', { className: 'mobility-tests-intro' },
        h('strong', null, 'Перед тренировкой'),
        h('span', null, 'Самочувствие задаёт нагрузку на сегодня. Замеры показывают, что меняется в движении и осанке.')
      ),
      h(ProfilePanel, { profile: props.profile, onChange: props.onProfileChange }),
      h(ReadinessPanel, { input: props.readinessInput, onChange: props.onReadinessChange }),
      h(AssessmentPanel, { screens: props.assessmentScreens, onChange: props.onAssessmentChange, onSaveAssessment: props.onSaveAssessment })
    );
  }

  function ProgressPanel(props) {
    const d = deps();
    const assessment = d.assessment;
    const progression = d.progression;
    const records = props.records || {};
    const assessments = Array.isArray(records.assessments) ? records.assessments : [];
    const latest = assessments.length ? assessments[assessments.length - 1] : null;
    const latestDate = latest && latest.savedAt;
    const retestDue = assessment ? assessment.retestDue(latestDate, props.nowDate, props.intervalWeeks || 6) : true;
    const testIds = [];
    assessments.forEach(function (item) {
      const audit = item && (item.audit || item);
      (audit && Array.isArray(audit.rows) ? audit.rows : []).forEach(function (row) {
        if (row && row.ok === true && testIds.indexOf(row.testId) < 0) testIds.push(row.testId);
      });
    });
    const trends = progression ? testIds.map(function (id) { return progression.romTrend(records, id); }).filter(function (t) { return t.ok; }) : [];
    const isPosture = props.profile && props.profile.goal === 'posture';
    const firstAtom = props.built && props.built.session && props.built.session.blocks && props.built.session.blocks[0]
      ? props.built.session.blocks[0].atoms[0]
      : null;
    const readinessScore = d.readiness ? d.readiness.score(props.readinessInput || {}) : null;
    const suggestion = !isPosture && progression && firstAtom ? progression.suggest(firstAtom, props.progressionHistory || {}, readinessScore) : null;
    const [manualAxis, setManualAxis] = useState(suggestion && suggestion.axis || 'amplitude');

    return h('section', { className: 'mobility-panel mobility-progress', 'aria-label': 'Прогресс' },
      h('h3', null, isPosture ? 'Курс осанки' : 'Прогресс'),
      h('p', { className: 'mobility-progress__intro' }, isPosture
        ? 'Это центр курса: статус, замены по зонам и замеры. Сама тренировка запускается во вкладке «Сегодня».'
        : 'Здесь замеры и подсказка, как двигаться дальше. Тренировка запускается во вкладке «Сегодня».'),
      (props.course || isPosture)
        ? h(CourseStatusCard, {
            course: props.course,
            built: props.built,
            onStart: props.onStartCourse,
            onReplace: props.onReplaceCourseSlot
          })
        : null,
      isPosture
        ? h('div', { className: 'mobility-progress-actions', 'aria-label': 'Действия курса' },
            h('button', { type: 'button', className: 'mobility-primary-btn', onClick: props.onOpenToday }, 'Перейти к тренировке'),
            h('button', { type: 'button', className: 'mobility-secondary-btn mobility-secondary-btn--plain', onClick: props.onOpenTests }, 'Открыть замеры')
          )
        : null,
      h('div', { className: 'mobility-progress__section' },
        h('h4', { className: 'mobility-progress__section-title' }, 'Замеры и контроль изменений'),
        h('div', { className: 'mobility-progress__meta' },
          chip(retestDue ? 'warn' : 'ok', retestDue ? 'нужно обновить замеры' : 'замеры актуальны'),
          latestDate ? chip('date', latestDate.slice(0, 10)) : chip('empty', 'нет истории')
        ),
        trends.length
          ? h('div', { className: 'mobility-progress__rows' },
              trends.map(function (t) {
                return h('div', { key: t.testId, className: 'mobility-progress-row', 'data-direction': t.direction },
                  h('span', null, TEST_LABEL[t.testId] || t.testId),
                  h('strong', null, (t.delta > 0 ? '+' : '') + formatMeasure(t.delta, t.unit)),
                  h('small', null, formatMeasure(t.latest, t.unit))
                );
              }))
          : h('p', { className: 'mobility-progress__note' }, 'После двух замеров появится динамика')
      ),
      suggestion
        ? h('div', { className: 'mobility-progression-advice', 'data-action': suggestion.action },
            h('h4', null, 'Следующий шаг'),
            h('p', null, humanizeVisibleText(PROGRESSION_REASON_LABEL[suggestion.reason] || suggestion.reason)),
            h('label', null,
              h('span', null, 'Что скорректировать'),
              h('select', {
                'aria-label': 'Что скорректировать',
                value: manualAxis,
                onChange: function (e) { setManualAxis(e.target.value); }
              },
                progression.AXIS_ORDER.concat(['intensity']).map(function (axis) {
                  return h('option', { key: axis, value: axis }, PROGRESSION_AXIS_LABEL[axis] || axis);
                })
              )
            )
          )
        : null
    );
  }

  function CalendarPanel(props) {
    const calendar = deps().calendar;
    if (!calendar || typeof calendar.buildWeekPlan !== 'function') return null;
    const plan = calendar.buildWeekPlan(props.profile || {}, {
      phase: props.phase,
      keyLoadWithinHours: props.keyLoadWithinHours,
      startDate: props.startDate,
      nowDate: props.nowDate,
      records: props.records || {}
    });
    const course = props.course || null;
    const courseWeek = course && deps().coursePlanner && deps().coursePlanner.currentWeek
      ? deps().coursePlanner.currentWeek(course, props.nowDate)
      : null;
    return h('section', { className: 'mobility-panel mobility-calendar', 'aria-label': 'План недели' },
      h('h3', null, 'План недели'),
      course
        ? h('div', { className: 'mobility-compact-plan', 'data-course-calendar': '1' },
            h('div', null,
              h('strong', null, 'Курс учтён'),
              h('span', null, 'Неделя ' + (courseWeek && courseWeek.week || 1) + ' · ' + (COURSE_PHASE_LABEL[courseWeek && courseWeek.phase] || 'плановая работа'))
            ),
            h('span', null, 'Курс уже влияет на тренировку недели. Замены зон и замеры находятся в «Прогрессе».'),
            props.onOpenProgress ? h('button', { type: 'button', className: 'mobility-secondary-btn', onClick: props.onOpenProgress }, 'Посмотреть курс') : null
          )
        : h('div', { className: 'mobility-compact-plan', 'data-course-empty': '1' },
            h('div', null,
              h('strong', null, 'Курс осанки не запущен'),
              h('span', null, 'Календарь показывает неделю. Курс можно включить в «Прогрессе».')
            ),
            props.onOpenProgress ? h('button', { type: 'button', className: 'mobility-secondary-btn', onClick: props.onOpenProgress }, 'Настроить курс') : null
          ),
      h('div', { className: 'mobility-calendar__meta' },
        chip('focus', CALENDAR_FOCUS_LABEL[plan.focus] || plan.focus),
        plan.retest && plan.retest.due ? chip('warn', 'замеры нужны') : chip('ok', 'замеры актуальны')
      ),
      h('div', { className: 'mobility-calendar__days' },
        plan.days.map(function (d) {
          return h('div', { key: d.date, className: 'mobility-calendar-day', 'data-mode': d.modeId },
            h('span', null, d.label),
            h('strong', null, d.modeLabel)
          );
        })
      )
    );
  }

  function SessionPanel(props) {
    const built = props.built;
    if (!built || !built.session) {
      return h('section', { className: 'mobility-panel mobility-session' }, h('p', null, 'Тренировка не собрана'));
    }
    const session = built.session;
    return h('section', { className: 'mobility-panel mobility-session', 'aria-label': 'Тренировка' },
      h('div', { className: 'mobility-session__head' },
        h('h3', null, MODE_LABEL[session.mode] || session.mode),
        h('div', { className: 'mobility-session__chips' },
          chip('purpose', PURPOSE_LABEL[session.purpose] || session.purpose),
          chip('autonomic', AUTONOMIC_LABEL[session.autonomic] || session.autonomic),
          session.loadPolicy && session.loadPolicy.label ? chip('load', session.loadPolicy.label) : null,
          session.warmupCompleted ? chip('warmup', 'разогрев учтён') : chip('warmup-warn', 'разогрев не отмечен'),
          chip(built.ok ? 'ok' : 'error', built.ok ? 'доступно' : 'есть ограничения')
        )
      ),
      session.reasons && session.reasons.length
        ? h('ul', { className: 'mobility-reasons', 'aria-label': 'Что учтено' },
            session.reasons.map(function (r) { return h('li', { key: r }, reasonText(r)); }))
        : null,
      built.issues && built.issues.length
        ? h('ul', { className: 'mobility-issues', 'aria-label': 'Ограничения' },
            built.issues.map(function (i, idx) { return h('li', { key: i.code + idx, 'data-level': i.level }, humanizeVisibleText(i.msg || i.code)); }))
        : null,
      session.advisories && session.advisories.length
        ? h('ul', { className: 'mobility-advisories', 'aria-label': 'Подсказки' },
            session.advisories.map(function (a, idx) {
              return h('li', { key: a.code + idx, 'data-level': a.level || 'info' }, humanizeVisibleText(a.msg || a.code));
            }))
        : null,
      props.onSaveSession
        ? h('button', { type: 'button', onClick: props.onSaveSession }, 'Сохранить тренировку')
        : null,
      h('div', { className: 'mobility-blocks' },
        session.blocks.map(function (b) {
          const atom = b.atoms[0];
          return h('article', { key: b.id, className: 'mobility-block' },
            h(AtomVisual, { atom: atom }),
            h('div', { className: 'mobility-block__top' },
              h('strong', null, atomTitle(atom)),
              chip('axis', AXIS_LABEL[atom.axis] || atom.axis)
            ),
            h('p', { className: 'mobility-block__instruction' }, atom.instruction || ''),
            atom.cues && atom.cues.length
              ? h('ul', { className: 'mobility-block__cues' },
                  atom.cues.slice(0, 3).map(function (cue) { return h('li', { key: cue }, cue); }))
              : null,
            h('div', { className: 'mobility-block__dose' },
              formatDose(atom),
              atom.doseConfidence ? chip('confidence', 'Нагрузка ' + atom.doseConfidence) : null
            ),
            h('div', { className: 'mobility-block__sources' },
              (atom.sourceIds || []).slice(0, 2).map(function (id) { return h(SourceBadge, { key: id, sourceId: id }); })
            )
          );
        })
      )
    );
  }

  function RunnerPlanPanel(props) {
    const plan = props.plan;
    if (!plan) return null;
    return h('section', { className: 'mobility-panel mobility-runner', 'aria-label': 'План выполнения' },
      h('h3', null, 'План выполнения'),
      h('div', { className: 'mobility-runner__meta' },
        chip('steps', plan.totalSteps + ' частей'),
        chip('duration', Math.round((plan.estimatedDurationSec || 0) / 60) + ' мин')
      ),
      h('ol', null,
        plan.steps.slice(0, 12).map(function (s, idx) {
          return h('li', { key: idx },
            h('strong', null, s.label),
            s.durationSec ? h('span', null, ' · ', s.durationSec, ' сек') : null,
            s.reps ? h('span', null, ' · ', targetRepsLabel(s.reps, 1), ' раз') : null
          );
        })
      )
    );
  }

  function stepMetric(step) {
    if (!step) return '—';
    if (step.reps) return targetRepsLabel(step.reps, 1) + ' раз';
    if (step.durationSec) return step.durationSec + ' сек';
    return step.kind || 'этап';
  }
  function stepDurationSec(step) {
    return Math.max(0, Math.round(Number(step && step.durationSec) || 0));
  }
  function timerMetric(step, remainingSec) {
    const total = stepDurationSec(step);
    if (!total) return stepMetric(step);
    return Math.max(0, Math.round(Number(remainingSec) || 0)) + ' сек';
  }

  function formatClock(sec) {
    const total = Math.max(0, Math.round(Number(sec) || 0));
    if (total >= 60) {
      const min = Math.floor(total / 60);
      const rest = total % 60;
      return String(min) + ':' + String(rest).padStart(2, '0');
    }
    return String(total);
  }

  function liveStepTitle(step) {
    const atom = atomForStep(step);
    return atom ? atomTitle(atom) : (step && step.label || 'Упражнение');
  }

  function liveStepMeta(step) {
    if (!step) return '';
    const parts = [];
    if (step.label) parts.push(step.label);
    else if (step.kind) parts.push(step.kind);
    const metric = stepMetric(step);
    if (metric && metric !== step.kind && metric !== step.label) parts.push(metric);
    if (step.set && step.sets && step.sets > 1) parts.push('подход ' + step.set + '/' + step.sets);
    else if (step.sets && step.sets > 1) parts.push(step.sets + ' подх.');
    if (step.secondsPerRep) parts.push(step.secondsPerRep + ' сек на раз');
    return parts.join(' · ');
  }

  function livePhase(status, step) {
    if (status === 'running' && step && step.kind === 'prep') return 'prep';
    if (status === 'running' && step && step.kind === 'rest') return 'paused';
    if (status === 'running') return 'hang';
    if (status === 'paused') return 'paused';
    if (status === 'complete') return 'done';
    if (status === 'aborted') return 'aborted';
    return 'prep';
  }

  function livePhaseLabel(status, step) {
    if (status === 'running' && step && step.kind === 'prep') return 'ПОДГОТОВКА';
    if (status === 'running' && step && step.kind === 'rest') return 'ОТДЫХ';
    if (status === 'running') return 'РАБОТА';
    if (status === 'paused') return 'Пауза';
    if (status === 'complete') return 'Готово!';
    if (status === 'aborted') return 'Остановлено';
    return 'Можно начинать';
  }

  function mobilityVoice() {
    return Mobility.voice && typeof Mobility.voice.say === 'function' ? Mobility.voice : null;
  }

  function sayMobilityCue(cueId, opts) {
    try {
      const voice = mobilityVoice();
      if (voice) voice.say(cueId, opts || {});
    } catch (_) {}
  }

  function cueForMobilityStep(step) {
    if (!step || !step.kind) return 'cue.next_step';
    if (step.kind === 'prep') return 'cue.prep';
    if (step.kind === 'rest') return 'cue.rest_start';
    if (step.kind === 'hold' || step.kind === 'pnf_hold') return 'cue.hold';
    if (step.kind === 'smr') return 'cue.smr';
    if (step.kind === 'breath') return 'cue.breath';
    if (step.kind === 'reps_work' || step.kind === 'eccentric_reps' || step.kind === 'cars') return 'cue.reps';
    return 'cue.work';
  }

  function liveDigit(step, remainingSec) {
    const total = stepDurationSec(step);
    if (total) return formatClock(remainingSec);
    if (step && step.reps) return targetRepsLabel(step.reps, 1);
    return '→';
  }

  function mobilityPreflightPreset(modeId, mode) {
    const autonomic = mode && mode.autonomic;
    if (modeId === 'evening_relax' || autonomic === 'relax') {
      return {
        icon: '🌙',
        prep: '60 секунд: лечь в позу мертвеца или сесть, расслабить челюсть и плечи, сделать длинный спокойный выдох.',
        checks: [
          'Дыхание спокойное, без задержек.',
          'Нет острой боли и онемения.',
          'Движения делаем мягко, не через силу.'
        ]
      };
    }
    if (modeId === 'pre_workout_ramp') {
      return {
        icon: '⚡',
        prep: '60 секунд: марш или лёгкие прыжки на месте, затем 3-4 суставных круга без боли.',
        checks: [
          'Пульс чуть поднялся, тело тёплое.',
          'Нет острой боли в целевых суставах.',
          'Перед мощной работой не уходим в долгую пассивную статику.'
        ]
      };
    }
    if (modeId === 'post_workout' || modeId === 'rehab') {
      return {
        icon: '🌿',
        prep: '60 секунд: спокойная ходьба или мягкое дыхание, затем оценить боль по ощущениям.',
        checks: [
          'Интенсивность ниже тренировочной.',
          'Боль не усиливается при первом движении.',
          'Цель — восстановить движение, а не добрать нагрузку.'
        ]
      };
    }
    if (modeId === 'anti_sedentary') {
      return {
        icon: '🪑',
        prep: '60 секунд: встать, пройтись, сделать 5 мягких кругов плечами и тазом.',
        checks: [
          'Двигаемся без рывков.',
          'Шея и поясница не зажимаются.',
          'Если появилась боль — остановиться.'
        ]
      };
    }
    return {
      icon: '🤸',
      prep: '60 секунд: лёгкий марш или прыжки на месте, чтобы поднять температуру и пульс.',
      checks: [
        'Тело стало теплее, дыхание ровное.',
        'Нет острой боли в суставах.',
        'Первый повтор делаем как пробный.'
      ]
    };
  }

  function MobilityPreflightChecklist(props) {
    const preset = props.preset || mobilityPreflightPreset();
    return h('div', { className: 'mobility-preflight' },
      h('p', { className: 'mobility-preflight__lead' }, 'Начните спокойно: первый повтор нужен, чтобы почувствовать движение.'),
      h('div', { className: 'mobility-preflight__prep' }, preset.prep),
      h('ul', { className: 'mobility-preflight__list' },
        (preset.checks || []).map(function (text, idx) {
          return h('li', { key: idx, className: 'mobility-preflight__item' },
            h('span', { className: 'mobility-preflight__check', 'aria-hidden': 'true' }, '✓'),
            h('span', null, text)
          );
        })
      ),
      props.issueCount
        ? h('p', { className: 'mobility-preflight__lead' }, 'В плане есть ' + issueCountLabel(props.issueCount) + ': работайте только без усиления боли.')
        : null
    );
  }

  function showMobilityPreflight(options) {
    const opts = options || {};
    const modal = global.HEYS && global.HEYS.ConfirmModal;
    const start = typeof opts.onStart === 'function' ? opts.onStart : function () {};
    if (!modal || typeof modal.show !== 'function') {
      start();
      return;
    }
    const preset = mobilityPreflightPreset(opts.modeId, opts.selectedMode);
    modal.show({
      icon: preset.icon,
      title: 'Перед началом',
      text: h(MobilityPreflightChecklist, { preset: preset, issueCount: opts.issueCount }),
      confirmStyle: 'success',
      actions: [
        { key: 'cancel', label: 'Отмена', style: 'neutral', variant: 'text', isCancel: true, row: 0 },
        {
          key: 'go',
          label: 'Начать тренировку',
          style: 'success',
          variant: 'fill',
          value: 'go',
          row: 1,
          isDefault: true,
          className: 'fingers-fs-preflight-go',
          onClick: start
        }
      ]
    });
  }

  function completedMobilitySteps(plan, state, remainingSec) {
    const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
    if (!steps.length) return [];
    const index = Math.max(0, Math.min(steps.length - 1, Number(state && state.index) || 0));
    const out = steps.slice(0, index);
    const current = steps[index];
    const duration = stepDurationSec(current);
    const hasCurrentProgress = current && (
      index > 0 ||
      (state && state.status && state.status !== 'idle') ||
      (duration && Number(remainingSec) < duration)
    );
    if (hasCurrentProgress && current) out.push(current);
    return out;
  }

  function partialMobilityResult(built, plan, progress) {
    const session = built && built.session;
    const steps = progress && Array.isArray(progress.steps) ? progress.steps : [];
    if (!session || !steps.length) return null;
    const usedBlocks = {};
    steps.forEach(function (step) {
      if (step && step.blockId) usedBlocks[step.blockId] = true;
    });
    const blocks = (Array.isArray(session.blocks) ? session.blocks : []).filter(function (block) {
      return block && usedBlocks[block.id];
    });
    if (!blocks.length) return null;
    return Object.assign({}, built, {
      ok: built.ok !== false,
      partial: true,
      partialProgress: {
        completedSteps: steps.length,
        totalSteps: plan && plan.totalSteps || steps.length,
        currentIndex: Math.max(0, Number(progress.index) || 0),
        elapsedSec: Math.max(0, Math.round(Number(progress.elapsedSec) || 0))
      },
      session: Object.assign({}, session, {
        partial: true,
        partialProgress: {
          completedSteps: steps.length,
          totalSteps: plan && plan.totalSteps || steps.length,
          currentIndex: Math.max(0, Number(progress.index) || 0),
          elapsedSec: Math.max(0, Math.round(Number(progress.elapsedSec) || 0))
        },
        blocks: blocks
      })
    });
  }
  function snapshotMobilityBuilt(built) {
    if (!built || !built.session) return null;
    return {
      ok: built.ok !== false,
      issues: Array.isArray(built.issues) ? built.issues.slice() : [],
      session: built.session
    };
  }

  function MobilityLiveRoadmap(props) {
    const steps = Array.isArray(props.steps) ? props.steps : [];
    const currentIndex = Math.max(0, Number(props.currentIndex) || 0);
    const denseClass = steps.length > 8 ? ' is-ultra-dense' : steps.length > 4 ? ' is-dense' : '';
    return h('div', { className: 'mobility-live-roadmap' + denseClass, 'aria-label': 'План занятия' },
      h('div', { className: 'mobility-live-roadmap__head' },
        h('span', null, 'План занятия'),
        h('span', null, Math.min(currentIndex + 1, steps.length || 1), '/', steps.length || 1)
      ),
      h('div', { className: 'mobility-live-roadmap__list' },
        steps.map(function (s, idx) {
          return h('div', {
            key: idx + ':' + (s.atomId || s.label || ''),
            className: 'mobility-guided-step' + (idx === currentIndex ? ' is-current' : '') + (idx < currentIndex ? ' is-done' : '')
          },
            h('span', { className: 'mobility-guided-step__index' }, idx + 1),
            h('span', { className: 'mobility-guided-step__body' },
              h('span', { className: 'mobility-guided-step__title' }, liveStepTitle(s)),
              h('span', { className: 'mobility-guided-step__meta' }, liveStepMeta(s))
            )
          );
        })
      )
    );
  }

  function ExecutionPanel(props) {
    const runner = deps().routineRunner;
    const plan = props.plan;
    const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
    // Lifecycle/таймер ведёт общее kernel-ядро (Этап 2 унификации запуска):
    // тик, pause/resume с remaining, wakeLock, visibility-warning. Линейный
    // раннер (transition/createState) для live-панели больше не нужен — core
    // единственная машина; индекс шага храним отдельно, а UI-state деривлю в
    // форме линейного раннера (status/index/totalSteps).
    const kt = global.HEYS && global.HEYS.TrainingKernel && global.HEYS.TrainingKernel.timer;
    if (!kt || typeof kt.useTimerCore !== 'function') return null;
    const RUN = 'run', RUN_MANUAL = 'run_manual';
    const [index, setIndex] = useState(0);
    const indexRef = useRef(0); indexRef.current = index;
    const autoStartedRef = useRef(false);
    const enterPhaseRef = useRef(null);
    const lastVoiceKeyRef = useRef('');

    // Шаг истёк (тик дошёл до 0) или пропуск → следующий шаг или завершение.
    // Таймерные шаги — фаза RUN (тикает); шаги без длительности (reps/cars) —
    // RUN_MANUAL (без тика, юзер жмёт «→»).
    const handleAdvance = useCallback(function () {
      const enterPhase = enterPhaseRef.current;
      if (!enterPhase) return;
      const cur = indexRef.current;
      if (cur >= steps.length - 1) { enterPhase('complete', 0, {}); return; }
      const next = cur + 1;
      setIndex(next); indexRef.current = next;
      const dur = stepDurationSec(steps[next]);
      enterPhase(dur ? RUN : RUN_MANUAL, dur || 0, {});
    }, [steps]);

    const core = kt.useTimerCore({
      states: { idle: 'idle', paused: 'paused', done: 'complete', aborted: 'aborted', expired: 'aborted' },
      manualPhases: [RUN_MANUAL],
      wakeLockPhases: [RUN, RUN_MANUAL],
      activePhases: [RUN],
      visibilityWarning: true,
      onAdvance: handleAdvance,
      lock: {
        acquire: function (reason) { return _acquireMobilityTimerLock(reason); },
        touch: function () { return _touchMobilityTimerLock(); },
        release: function () { return _releaseMobilityTimerLock(); },
        onDenied: function () { _warnMobilityTimerLockDenied(); },
        heartbeatMs: MOBILITY_TIMER_LOCK_HEARTBEAT_MS
      },
      onActiveLockChange: function (held) { Mobility.activeTimerLock = !!held; }
    });
    enterPhaseRef.current = core.enterPhase;

    const status = core.state === 'idle' ? 'idle'
      : core.state === 'paused' ? 'paused'
      : core.state === 'complete' ? 'complete'
      : core.state === 'aborted' ? 'aborted'
      : 'running';
    const state = { status: status, index: index, totalSteps: steps.length, aborted: core.state === 'aborted' };
    const current = steps[Math.min(index, steps.length - 1)] || steps[0] || null;
    const currentAtom = atomForStep(current);
    const currentDurationSec = stepDurationSec(current);
    const remainingSec = core.secondsLeft;
    const progress = steps.length ? Math.round(((index + 1) / steps.length) * 100) : 0;

    function startSession() {
      if (core.markSessionStart() === false) return;
      sayMobilityCue('cue.start_session');
      // Resume: старт с сохранённого шага и (для таймерных) с остатка времени.
      const startIdx = Math.max(0, Math.min(Number(props.initialIndex) || 0, steps.length - 1));
      setIndex(startIdx); indexRef.current = startIdx;
      const full = stepDurationSec(steps[startIdx]);
      const resumeSec = Number(props.initialRemainingSec);
      const sec = full ? ((isFinite(resumeSec) && resumeSec > 0) ? Math.min(resumeSec, full) : full) : 0;
      core.enterPhase(full ? RUN : RUN_MANUAL, sec, {});
    }
    function send(event) {
      if (event === 'start') startSession();
      else if (event === 'pause') { core.pause(); sayMobilityCue('cue.paused'); }
      else if (event === 'resume') { core.resume(); sayMobilityCue('cue.resumed'); }
      else if (event === 'next') core.skipPhase();
      else if (event === 'abort') core.abort();
    }
    function finalizeAbort(saved) {
      send('abort');
      props.onAbortComplete && props.onAbortComplete({ saved: !!saved });
    }
    function requestAbort() {
      const modal = global.HEYS && global.HEYS.ConfirmModal;
      const completedSteps = completedMobilitySteps(plan, state, remainingSec);
      const progress = {
        steps: completedSteps,
        index: state.index,
        elapsedSec: currentDurationSec ? Math.max(0, currentDurationSec - (Number(remainingSec) || 0)) : 0
      };
      const hasProgress = completedSteps.length > 0;
      const doAbort = function () {
        if (!hasProgress) { finalizeAbort(false); return; }
        if (!modal || typeof modal.show !== 'function') {
          props.onAbortSave && props.onAbortSave(progress);
          finalizeAbort(true);
          return;
        }
        modal.show({
          icon: '💾',
          title: 'Сохранить то, что уже сделали?',
          text: 'Готово ' + completedSteps.length + ' из ' + steps.length + '. Отметим тренировку как частично выполненную.',
          confirmText: 'Сохранить результат',
          cancelText: 'Не сохранять',
          confirmStyle: 'success',
          onConfirm: function () {
            props.onAbortSave && props.onAbortSave(progress);
            finalizeAbort(true);
          },
          onCancel: function () {
            finalizeAbort(false);
          }
        });
      };
      if (!modal || typeof modal.show !== 'function') {
        doAbort();
        return;
      }
      modal.show({
        icon: '⚠',
        title: 'Остановить тренировку?',
        text: 'Таймер остановится. Если вы уже что-то сделали, это можно сохранить следующим шагом.',
        confirmText: 'Остановить',
        cancelText: 'Продолжить тренировку',
        confirmStyle: 'warning',
        onConfirm: doAbort
      });
    }
    useEffect(function () {
      if (!props.autoStart || autoStartedRef.current || status !== 'idle') return;
      autoStartedRef.current = true;
      startSession();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.autoStart, status]);

    // Snapshot активной сессии в общий kernel-persistence — переживает reload.
    // Храним материализованный план + индекс/остаток; на терминале чистим.
    useEffect(function () {
      const store = Mobility.persistence;
      if (!store) return;
      if (status === 'complete' || status === 'aborted') { store.clear(); return; }
      if (status === 'running' || status === 'paused') {
        store.save({
          planSteps: steps,
          sessionMode: plan && plan.sessionMode,
          estimatedDurationSec: plan && plan.estimatedDurationSec,
          built: snapshotMobilityBuilt(props.built),
          index: index,
          remainingSec: remainingSec,
          status: status
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, index, remainingSec]);
    useEffect(function () {
      if (status !== 'running' && status !== 'complete' && status !== 'aborted') return;
      const key = status + ':' + index + ':' + (current && current.kind || '');
      if (lastVoiceKeyRef.current === key) return;
      lastVoiceKeyRef.current = key;
      if (status === 'complete') {
        sayMobilityCue('cue.session_done');
        return;
      }
      if (status === 'aborted') {
        sayMobilityCue('cue.session_aborted');
        return;
      }
      sayMobilityCue(cueForMobilityStep(current));
    }, [status, index, current && current.kind]);
    if (!runner || !steps.length || !current) return null;
    const ratio = currentDurationSec ? Math.max(0, Math.min(1, (Number(remainingSec) || 0) / currentDurationSec)) : 1;
    const digit = liveDigit(current, remainingSec);
    const Focus = global.HEYS && global.HEYS.TrainingFocus;
    if (!Focus || typeof Focus.LiveCountdownDisplay !== 'function') return null;
    const afterRing = h(React.Fragment, null,
      current.breath && current.breath.phases
        ? h('ol', { className: 'mobility-breath-phases', 'aria-label': 'Фазы дыхания' },
            current.breath.phases.map(function (p, idx) {
              return h('li', { key: p.type + idx, 'data-phase': p.type }, p.label, ' ', p.durationSec, ' сек');
            }))
        : null,
      h(TechniqueCuePanel, { atom: currentAtom, compact: true }),
      props.onFeedback ? h('div', { className: 'mobility-step-feedback', 'aria-label': 'Ощущения после упражнения' },
        [
          { id: 'easy', label: 'Легко' },
          { id: 'ok', label: 'В самый раз' },
          { id: 'hard', label: 'Слишком тяжело' },
          { id: 'unstable', label: 'Потерял технику', technique: 'unstable' }
        ].map(function (item) {
          return h('button', {
            key: item.id,
            type: 'button',
            onClick: function () {
              props.onFeedback(current, item.technique ? { effort: 'hard', technique: item.technique } : { effort: item.id });
            }
          }, item.label);
        })
      ) : null
    );
    const controls = [
      state.status === 'idle' ? { id: 'start', label: 'Старт', onClick: function () { send('start'); } } : null,
      state.status === 'running' ? { id: 'pause', label: '⏸ Пауза', ariaLabel: 'Пауза', onClick: function () { send('pause'); } } : null,
      state.status === 'paused' ? { id: 'resume', label: '▶ Продолжить', onClick: function () { send('resume'); } } : null,
      { id: 'next', label: '→', ariaLabel: 'Пропустить часть', title: 'Пропустить часть', onClick: function () { send('next'); } },
      props.onPain ? { id: 'pain', label: 'Есть боль', ariaLabel: 'Отметить боль', onClick: function () { props.onPain(current); } } : null,
      { id: 'abort', label: 'Завершить', ariaLabel: 'Завершить тренировку', abort: true, onClick: requestAbort }
    ].filter(Boolean);
    const runnerNode = h(React.Fragment, null,
      Mobility.VoiceMiniControls ? h(Mobility.VoiceMiniControls, { inline: true }) : null,
      h('div', { className: 'mobility-guided__visual', 'aria-hidden': 'true' },
        currentAtom && currentAtom.visualAsset
          ? h('img', {
              src: currentAtom.visualAsset,
              alt: 'Фото упражнения: ' + (currentAtom ? atomTitle(currentAtom) : current.label),
              loading: 'lazy',
              decoding: 'async'
            })
          : h('div', { className: 'mobility-guided__fallback', 'aria-hidden': 'true' }, 'M')
      ),
      h(Focus.LiveCountdownDisplay, {
        baseClass: 'mobility-countdown',
        continuousClass: 'mobility-continuous',
        continuous: true,
        phaseKey: livePhase(state.status, current),
        phaseLabel: livePhaseLabel(state.status, current),
        counter: 'Упражнение ' + (state.index + 1) + '/' + steps.length,
        title: liveStepTitle(current),
        image: currentAtom && currentAtom.visualAsset,
        imageAlt: 'Фото упражнения: ' + (currentAtom ? atomTitle(currentAtom) : (current.label || 'упражнение')),
        digit: digit,
        ratio: ratio,
        chips: [
          {
            id: 'duration',
            label: currentDurationSec ? 'Длительность' : 'Объём',
            value: currentDurationSec ? Math.round(currentDurationSec / 60) + ' мин' : stepMetric(current)
          }
        ],
        afterRing: afterRing,
        controls: controls
      }),
      h('div', { className: 'mobility-execution__status', 'data-status': state.status, style: { display: 'none' } })
    );
    const roadmapItems = steps.map(function (s, idx) {
      return {
        id: idx + ':' + (s.atomId || s.label || ''),
        title: liveStepTitle(s),
        meta: liveStepMeta(s)
      };
    });
    if (Focus && typeof Focus.LiveRunnerShell === 'function') {
      return h(Focus.LiveRunnerShell, {
        baseClass: 'fingers-fs-live',
        className: 'mobility-panel mobility-execution mobility-guided mobility-guided-live',
        ariaLabel: 'Тренировка с сопровождением',
        runner: runnerNode,
        items: roadmapItems,
        currentIndex: state.index,
        roadmapBaseClass: 'fingers-fs-live-roadmap',
        roadmapClassName: 'mobility-live-roadmap',
        roadmapItemClassName: 'mobility-guided-step',
        roadmapTitle: 'План занятия',
        roadmapLabel: 'План занятия'
      });
    }
    return h('section', { className: 'mobility-panel mobility-execution mobility-guided mobility-guided-live', 'data-training-runner': 'guided', 'aria-label': 'Тренировка с сопровождением' },
      runnerNode,
      h(MobilityLiveRoadmap, { steps: steps, currentIndex: state.index })
    );
  }

  function ProtocolsPanel(props) {
    const protocols = deps().protocolCatalog;
    if (!protocols || typeof protocols.listProtocols !== 'function') return null;
    const items = protocols.listProtocols({});
    const selectedPlan = items.find(function (p) { return p.id === props.value; }) || items[0] || null;
    return h('section', { className: 'mobility-panel mobility-protocols', 'aria-label': 'Готовые тренировки' },
      h('h3', null, 'Готовые тренировки'),
      h('div', { className: 'mobility-protocols__intro' },
        h('strong', null, 'Выберите сценарий'),
        h('span', null, 'Подойдёт, если хотите понятную тренировку без ручной настройки. Сегодняшний выбор запускается во вкладке «Сегодня».')
      ),
      selectedPlan ? h('div', { className: 'mobility-protocols__current' },
        h('span', null, 'Сегодня выбран'),
        h('strong', null, protocolTitle(selectedPlan)),
        h('p', null, protocolIntent(selectedPlan))
      ) : null,
      h('div', { className: 'mobility-protocol-grid' },
        items.map(function (p) {
          const selected = props.value === p.id;
          const duration = Array.isArray(p.durationMin) ? p.durationMin[0] + '-' + p.durationMin[1] + ' мин' : '';
          return h('button', {
            key: p.id,
            type: 'button',
            className: 'mobility-protocol-card' + (selected ? ' is-selected' : ''),
            onClick: function () { props.onChange && props.onChange(p); }
          },
            h('div', { className: 'mobility-protocol-card__top' },
              h('h4', null, protocolTitle(p)),
              chip(selected ? 'ok' : 'duration', selected ? 'выбран' : duration)
            ),
            h('p', null, protocolIntent(p)),
            h('div', { className: 'mobility-protocol-card__tags' },
              (p.tags || []).slice(0, 3).map(function (tag) { return chip('tag', protocolTagLabel(tag), p.id + ':' + tag); })
            )
          );
        })
      )
    );
  }

  function GoalStepPanel(props) {
    const profile = normalizeProfile(props.profile);
    const goals = ['morning', 'pre_workout', 'recover', 'develop', 'posture', 'relax', 'desk'];
    const protocolItems = Mobility.protocolCatalog && Array.isArray(Mobility.protocolCatalog.PROTOCOLS)
      ? Mobility.protocolCatalog.PROTOCOLS
      : [];
    function countForGoal(goal) {
      const mode = GOAL_TO_MODE[goal];
      return protocolItems.filter(function (p) { return p && p.modeId === mode; }).length;
    }
    return h('section', { className: 'mobility-fs-goalsel', 'aria-label': 'Цель тренировки' },
      h('div', { className: 'mobility-fs-goalsel__label' }, 'Цель тренировки'),
      h('div', { className: 'mobility-fs-goalsel__grid', role: 'tablist', 'aria-label': 'Цель тренировки' },
        goals.map(function (goal) {
          const selected = profile.goal === goal;
          const cnt = countForGoal(goal);
          return h('button', {
            key: goal,
            type: 'button',
            role: 'tab',
            'aria-selected': selected,
            className: 'mobility-fs-goalsel__btn' + (selected ? ' is-active' : '') + (cnt === 0 ? ' is-empty' : ''),
            'data-goal': goal,
            onClick: function () {
              props.onChange && props.onChange(Object.assign({}, profile, { goal: goal }));
            }
          },
            h('span', { className: 'mobility-fs-goalsel__icon', 'aria-hidden': 'true' },
              h('span', { className: 'mobility-fs-goalsel__emoji' }, GOAL_EMOJI[goal] || '🎯')
            ),
            h('span', { className: 'mobility-fs-goalsel__text' }, GOAL_SHORT_LABEL[goal] || GOAL_LABEL[goal] || goal),
            h('span', { className: 'mobility-fs-goalsel__count', 'aria-label': cnt + ' планов' }, cnt)
          );
        })
      )
    );
  }

  function LoadLevelSlider(props) {
    const scale = deps().loadScale;
    const levels = scale && Array.isArray(scale.LEVELS) ? scale.LEVELS : [
      { value: 1, label: 'Восстановление', shortLabel: 'Очень легко', description: 'минимальная нагрузка' },
      { value: 2, label: 'Лёгкая', shortLabel: 'Легко', description: 'спокойная нагрузка' },
      { value: 3, label: 'База', shortLabel: 'База', description: 'стандартная нагрузка' },
      { value: 4, label: 'Сильная', shortLabel: 'Сложно', description: 'плотнее и сложнее' },
      { value: 5, label: 'Атлет', shortLabel: 'Тяжело', description: 'верхняя нагрузка' }
    ];
    const value = scale && scale.normalize ? scale.normalize(props.value) : Math.min(5, Math.max(1, Math.round(Number(props.value) || 3)));
    const current = levels.find(function (item) { return item.value === value; }) || levels[2];
    const progress = ((value - 1) / 4) * 100;
    function setLevel(next) {
      const normalized = scale && scale.normalize ? scale.normalize(next) : Math.min(5, Math.max(1, Math.round(Number(next) || 3)));
      props.onChange && props.onChange(normalized);
    }
    return h('section', {
      className: 'mobility-fs-load mobility-fs-load--level-' + value,
      'aria-label': 'Сложность и тяжесть тренировки',
      style: { '--load-progress': progress + '%' }
    },
      h('div', { className: 'mobility-fs-load__top' },
        h('div', { className: 'mobility-fs-load__label' },
          h('span', { className: 'mobility-fs-load__eyebrow' }, 'Нагрузка'),
          h('span', { className: 'mobility-fs-load__title' }, current.label),
          h('span', { className: 'mobility-fs-load__caption' }, current.description)
        ),
        h('span', { className: 'mobility-fs-load__badge' }, value, '/5')
      ),
      h('div', { className: 'mobility-fs-load__track' },
        h('input', {
          className: 'mobility-fs-load__range',
          type: 'range',
          min: 1,
          max: 5,
          step: 1,
          value: value,
          'aria-label': 'Сложность и тяжесть тренировки',
          onChange: function (e) { setLevel(e.target.value); }
        }),
        h('div', { className: 'mobility-fs-load__ticks' },
          levels.map(function (item) {
            return h('button', {
              key: item.value,
              type: 'button',
              className: 'mobility-fs-load__tick' + (item.value === value ? ' is-active' : ''),
              onClick: function () { setLevel(item.value); },
              title: item.label
            }, item.shortLabel || item.label);
          })
        )
      )
    );
  }

  function EquipmentStepPanel(props) {
    const onboarding = deps().onboarding;
    const profile = normalizeProfile(props.profile);
    const equipment = onboarding && onboarding.EQUIPMENT ? onboarding.EQUIPMENT : [];
    function toggle(id) {
      const current = Array.isArray(profile.equipment) ? profile.equipment : [];
      const next = current.indexOf(id) >= 0
        ? current.filter(function (x) { return x !== id; })
        : current.concat([id]);
      props.onChange && props.onChange(Object.assign({}, profile, { equipment: next }));
    }
    return h('section', { className: 'mobility-fs-equipment', 'aria-label': 'Выбор оборудования' },
      h('div', { className: 'mobility-fs-equipment__row' },
        equipment.map(function (id) {
          const selected = (profile.equipment || []).indexOf(id) >= 0;
          return h('button', {
            key: id,
            type: 'button',
            className: 'mobility-fs-equipment-chip' + (selected ? ' is-available' : ''),
            'data-equipment': id,
            onClick: function () { toggle(id); }
          },
            h('span', null, EQUIPMENT_LABEL[id] || id)
          );
        })
      )
    );
  }

  function ActionStepPanel(props) {
    return h('section', { className: 'mobility-step mobility-action-step', 'aria-label': 'Выбор формата тренировки' },
      h('div', { className: 'mobility-step__head' },
        h('div', { className: 'mobility-step__title' }, h('span', { className: 'mobility-step__num' }, '3'), 'Формат'),
        h('span', { className: 'mobility-step__hint' }, 'один выбор')
      ),
      h('div', { className: 'mobility-action-grid' },
        h('button', {
          type: 'button',
          className: 'mobility-action-card' + (props.value === 'mix' ? ' is-selected' : ''),
          onClick: props.onStartMix
        },
          h('span', { className: 'mobility-action-card__icon', 'aria-hidden': 'true' }, '↯'),
          h('strong', null, 'Быстрая тренировка'),
          h('span', null, 'подходит, если хотите начать сразу')
        ),
        h('button', {
          type: 'button',
          className: 'mobility-action-card' + (props.value === 'protocol' ? ' is-selected' : ''),
          onClick: props.onOpenProtocols
        },
          h('span', { className: 'mobility-action-card__icon', 'aria-hidden': 'true' }, '▦'),
          h('strong', null, 'Готовый план'),
          h('span', null, 'готовая структура: утро, нагрузка, восстановление')
        ),
        h('button', {
          type: 'button',
          className: 'mobility-action-card' + (props.value === 'custom' ? ' is-selected' : ''),
          onClick: props.onOpenConstructor
        },
          h('span', { className: 'mobility-action-card__icon', 'aria-hidden': 'true' }, '+'),
          h('strong', null, 'Свой план'),
          h('span', null, 'выбрать упражнения и начать с сопровождением')
        )
      )
    );
  }

  function ConstructorPanel(props) {
    const catalog = Mobility.atomCatalog;
    const atoms = catalog && Array.isArray(catalog.ATOMS) ? catalog.ATOMS : [];
    const selected = Array.isArray(props.selectedAtomIds) ? props.selectedAtomIds : [];
    const byId = atoms.reduce(function (acc, atom) {
      if (atom && atom.id) acc[atom.id] = atom;
      return acc;
    }, {});
    const selectedAtoms = selected.map(function (id) { return byId[id]; }).filter(Boolean);
    const quickIds = CONSTRUCTOR_QUICK_ATOM_IDS.concat(selected).filter(function (id, idx, arr) {
      return id && arr.indexOf(id) === idx;
    });
    const quickAtoms = quickIds.map(function (id) { return byId[id]; }).filter(Boolean);
    function toggle(id) {
      const next = selected.indexOf(id) >= 0
        ? selected.filter(function (x) { return x !== id; })
        : selected.concat([id]);
      props.onChange && props.onChange(next);
    }
    return h('section', { className: 'mobility-panel mobility-constructor', 'aria-label': 'Свой план' },
      h('h3', null, 'Свой план'),
      h('div', { className: 'mobility-constructor__summary' },
        h('strong', null, selected.length ? 'Почти готово' : 'Соберите короткую тренировку'),
        h('span', null, selected.length
          ? 'Запускайте сопровождение, когда состав подходит. Ограничения и безопасность останутся включены.'
          : 'Начните с вариантов ниже или откройте список через кнопку «Упражнения».'),
        selectedAtoms.length
          ? h('div', { className: 'mobility-constructor__selected', 'aria-label': 'Выбранные упражнения' },
              selectedAtoms.map(function (atom) {
                return chip('selected', atomTitle(atom), atom.id);
              })
            )
          : null
      ),
      h('div', { className: 'mobility-constructor__section-title' }, 'Подойдут сейчас'),
      h('div', { className: 'mobility-constructor-grid' },
        quickAtoms.map(function (atom) {
          const isSelected = selected.indexOf(atom.id) >= 0;
          return h('button', {
            key: atom.id,
            type: 'button',
            className: 'mobility-exercise-card' + (isSelected ? ' is-selected' : ''),
            onClick: function () { toggle(atom.id); }
          },
            h('div', { className: 'mobility-exercise-card__top' },
              h('strong', null, atomTitle(atom)),
              chip('axis', AXIS_LABEL[atom.axis] || atom.axis)
            ),
            h('span', null, formatDose(atom), ' · ', PURPOSE_LABEL[atom.purpose] || atom.purpose, atomTypeLabel(atom) ? ' · ' + atomTypeLabel(atom) : '')
          );
        })
      ),
      h('div', { className: 'mobility-constructor-actions' },
        h('button', {
          type: 'button',
          onClick: function () { props.onStart && props.onStart(selected.slice()); },
          disabled: selected.length === 0
        }, 'Начать свой план'),
        selected.length ? h('button', { type: 'button', onClick: function () { props.onChange && props.onChange([]); } }, 'Сбросить') : null,
        selected.length ? chip('ok', selected.length + ' в плане') : chip('warn', 'план пуст')
      )
    );
  }

  function ExerciseRegistryOverlay(props) {
    const catalog = Mobility.atomCatalog;
    const atoms = catalog && Array.isArray(catalog.ATOMS) ? catalog.ATOMS : [];
    const selected = Array.isArray(props.selectedAtomIds) ? props.selectedAtomIds : [];
    const Focus = global.HEYS && global.HEYS.TrainingFocus;
    function toggle(id) {
      const next = selected.indexOf(id) >= 0
        ? selected.filter(function (x) { return x !== id; })
        : selected.concat([id]);
      props.onChange && props.onChange(next);
    }
    if (Focus && Focus.Registry) {
      return h(Focus.Registry, {
        classPrefix: 'mobility-fs',
        title: 'Упражнения',
        subtitle: atoms.length + ' упражнений · фото, как выполнять и зачем',
        items: atoms.map(function (atom) {
          const cues = atom.techniqueCues || {};
          return {
            id: atom.id,
            title: atomTitle(atom),
            image: atom.visualAsset || '',
            imageAlt: 'Фото упражнения: ' + atomTitle(atom),
            icon: '↕',
            meta: formatDose(atom) + ' · ' + (PURPOSE_LABEL[atom.purpose] || atom.purpose),
            chips: [
              AXIS_LABEL[atom.axis] || atom.axis,
              atomTypeLabel(atom)
            ].filter(Boolean),
            actionHint: cues.selfCheck || cues.keyCue || ''
          };
        }),
        selectedIds: selected,
        addLabel: 'В план',
        removeLabel: 'Убрать',
        footerText: selected.length ? selected.length + ' в плане' : 'план пуст',
        footerAction: {
          label: selected.length ? 'Открыть свой план' : 'К своему плану',
          onClick: function () {
            props.onOpenConstructor && props.onOpenConstructor();
            props.onClose && props.onClose();
          }
        },
        onToggle: toggle,
        onClose: props.onClose
      });
    }
    return h('div', {
      className: 'mobility-registry-backdrop',
      role: 'presentation',
      onMouseDown: function (e) {
        if (e.target === e.currentTarget) props.onClose && props.onClose();
      }
    },
      h('section', {
        className: 'mobility-registry-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Упражнения'
      },
        h('div', { className: 'mobility-registry-head' },
          h('div', null,
            h('h3', null, 'Упражнения'),
            h('p', null, atoms.length, ' упражнений · можно добавить в свой план')
          ),
          h('button', {
            type: 'button',
            className: 'mobility-registry-close',
            onClick: props.onClose,
            'aria-label': 'Закрыть список упражнений'
          }, '×')
        ),
        h('div', { className: 'mobility-registry-grid' },
          atoms.map(function (atom) {
            const isSelected = selected.indexOf(atom.id) >= 0;
            return h('article', {
              key: atom.id,
              className: 'mobility-registry-card' + (isSelected ? ' is-selected' : '')
            },
              h('div', { className: 'mobility-registry-card__top' },
                h('strong', null, atomTitle(atom)),
                chip('axis', AXIS_LABEL[atom.axis] || atom.axis)
              ),
              h('span', null, formatDose(atom), ' · ', PURPOSE_LABEL[atom.purpose] || atom.purpose, atomTypeLabel(atom) ? ' · ' + atomTypeLabel(atom) : ''),
              h(TechniqueCuePanel, { atom: atom }),
              h('button', {
                type: 'button',
                onClick: function () { toggle(atom.id); }
              }, isSelected ? 'Убрать из плана' : 'В свой план')
            );
          })
        ),
        h('div', { className: 'mobility-registry-actions' },
          h('button', {
            type: 'button',
            onClick: function () {
              props.onOpenConstructor && props.onOpenConstructor();
              props.onClose && props.onClose();
            }
          }, selected.length ? 'Открыть свой план' : 'К своему плану'),
          selected.length ? chip('ok', selected.length + ' в плане') : chip('warn', 'план пуст')
        )
      )
    );
  }

  function buildCustomBuilt(atomIds, modeId, profile, options) {
    const d = deps();
    if (!d.modeEngine || !d.validators || !Mobility.atomCatalog) return null;
    const mode = d.modeEngine.getMode(modeId) || { id: modeId, purpose: 'prep', autonomic: 'neutral' };
    const context = d.modeEngine.buildContext(mode, options || {});
    const loadLevel = d.loadScale && d.loadScale.fromProfile ? d.loadScale.fromProfile(profile, options || {}) : Math.min(5, Math.max(1, Math.round(Number(profile && profile.loadLevel) || 3)));
    const loadPolicy = d.loadScale && d.loadScale.getLevel ? d.loadScale.getLevel(loadLevel) : { value: loadLevel };
    const atoms = (atomIds || []).map(function (id) { return Mobility.atomCatalog.getAtom(id); }).filter(Boolean);
    if (!atoms.length) return null;
    const blocks = atoms.map(function (atom, idx) {
      return {
        id: 'custom_' + idx,
        name: atomTitle(atom),
        axis: atom.axis,
        purpose: atom.purpose,
        autonomic: atom.autonomic,
        fatigueCost: atom.fatigueCost || 'low',
        tissueLoad: atom.tissueLoad || 'low',
        atoms: [Object.assign({}, atom, { loadLevel: loadLevel })]
      };
    });
    const session = {
      date: options && options.date || null,
      mode: mode.id,
      purpose: mode.purpose,
      autonomic: mode.autonomic,
      timeOfDay: context && context.timeOfDay,
      beforePower: context && context.beforePower,
      warmupCompleted: context && context.warmupCompleted,
      loadLevel: loadLevel,
      loadPolicy: {
        key: loadPolicy.key || null,
        label: loadPolicy.label || null,
        shortLabel: loadPolicy.shortLabel || null,
        tone: loadPolicy.tone || null,
        description: loadPolicy.description || null
      },
      blocks: blocks,
      painFlags: context && context.painFlags || [],
      reasons: ['custom_selection', 'load_level_' + loadLevel],
      advisories: [context && context.coldWater].filter(Boolean),
      periodization: context && context.periodization,
      assessment: null
    };
    const issues = d.validators.runSession(session, profile, context).concat(
      atoms.flatMap(function (atom) { return d.validators.runAtom(atom, profile, context); })
    );
    return {
      ok: !issues.some(function (i) { return i && i.level === 'error'; }),
      session: session,
      issues: issues,
      trace: [{ slot: 'custom', picked: atomIds.slice(), reason: 'manual_constructor' }],
      context: context
    };
  }

  function sessionAtoms(built) {
    const blocks = built && built.session && Array.isArray(built.session.blocks) ? built.session.blocks : [];
    const atoms = [];
    blocks.forEach(function (block) {
      (Array.isArray(block.atoms) ? block.atoms : []).forEach(function (atom) {
        if (atom) atoms.push(atom);
      });
    });
    return atoms;
  }

  function ReadinessHero(props) {
    const score = props.readinessScore;
    const selectedMode = props.selectedMode || {};
    const issueCount = Number(props.issueCount) || 0;
    const numeric = score && Number.isFinite(Number(score.score)) ? Number(score.score) : null;
    const color = issueCount ? '#ef4444' : numeric != null && numeric < 55 ? '#f59e0b' : '#16a66a';
    const title = issueCount
      ? 'Сегодня — с ограничениями'
      : numeric != null && numeric < 55
        ? 'Сегодня — мягко'
        : 'Сегодня — можно работать';
    const sub = (PURPOSE_LABEL[selectedMode.purpose] || 'Рекомендация') + ' · ' + (AUTONOMIC_LABEL[selectedMode.autonomic] || 'спокойный режим');
    return h('section', {
      className: 'mobility-fs-today__hero',
      style: {
        background: 'linear-gradient(135deg, ' + color + '1f 0%, ' + color + '08 100%)',
        borderColor: color + '33'
      }
    },
      h('div', { className: 'mobility-fs-today__score', style: { color: color, borderColor: color, background: color + '1f' } },
        h('span', null, numeric == null ? '—' : numeric),
        numeric == null ? null : h('small', null, '/100')
      ),
      h('div', { className: 'mobility-fs-today__hero-body' },
        h('h2', { style: { color: color } }, title),
        h('p', null, sub),
        issueCount ? h('div', { className: 'mobility-fs-today__reason' }, issueCountLabel(issueCount) + ': правила безопасности учтены') : null
      )
    );
  }

  function ExercisePreviewList(props) {
    const allAtoms = props.atoms || [];
    const atoms = props.limit ? allAtoms.slice(0, props.limit) : allAtoms;
    if (!atoms.length) return null;
    return h('div', { className: 'mobility-fs-mixcard__exlist', 'aria-label': 'Состав тренировки' },
      h('div', { className: 'mobility-fs-mixcard__exlist-title' }, 'Состав тренировки'),
      atoms.map(function (atom) {
        return h('div', { key: atom.id, className: 'mobility-fs-mixcard__exrow' },
          h('div', { className: 'mobility-fs-mixcard__exthumb' },
            atom.visualAsset
              ? h('img', { src: atom.visualAsset, alt: '', loading: 'lazy', decoding: 'async' })
              : h('span', { className: 'mobility-fs-mixcard__exemoji', 'aria-hidden': 'true' }, 'M')
          ),
          h('div', { className: 'mobility-fs-mixcard__exinfo' },
            h('span', { className: 'mobility-fs-mixcard__exname' }, atomTitle(atom)),
            h('span', { className: 'mobility-fs-mixcard__exsub' }, formatDose(atom), ' · ', PURPOSE_LABEL[atom.purpose] || atom.purpose)
          )
        );
      })
    );
  }

  function GuidedLaunchCard(props) {
    const built = props.built;
    const plan = props.plan;
    const atoms = sessionAtoms(built);
    const durationMin = plan && plan.estimatedDurationSec ? Math.round(plan.estimatedDurationSec / 60) : null;
    const blockCount = built && built.session && Array.isArray(built.session.blocks) ? built.session.blocks.length : atoms.length;
    return h('section', { className: 'mobility-fs-mixcard mobility-fs-guided-launch', 'aria-label': 'Запуск тренировки с сопровождением' },
      h('div', { className: 'mobility-fs-mixcard__inner' },
        h('div', { className: 'mobility-fs-mixcard__head-row' },
          h('div', { className: 'mobility-fs-mixcard__badge' },
            h('span', { 'aria-hidden': 'true' }, '▶'),
            ' С подсказками'
          ),
          durationMin ? h('div', { className: 'mobility-fs-mixcard__goalhint' }, durationMin + ' мин') : null
        ),
        h('h3', { className: 'mobility-fs-mixcard__title' }, props.title || 'Тренировка с сопровождением'),
        h('p', { className: 'mobility-fs-mixcard__desc' }, props.text || 'План готов: фото, темп и подсказки будут перед глазами во время выполнения.'),
        h('div', { className: 'mobility-fs-mixcard__chips' },
          chip('steps', (plan ? plan.totalSteps : 0) + ' частей'),
          chip('blocks', blockCount + ' упр.'),
          props.issueCount ? chip('warn', issueCountLabel(props.issueCount)) : chip('ok', 'без ограничений')
        ),
        h(SessionNoticeList, { built: built, limit: 3 }),
        h(ExercisePreviewList, { atoms: atoms }),
        h('div', { className: 'mobility-constructor-actions' },
          h('button', {
            type: 'button',
            className: 'mobility-fs-cta',
            onClick: props.onStart
          }, 'Начать с подсказками'),
          h('button', {
            type: 'button',
            className: 'mobility-fs-ghost',
            onClick: props.onSavePlan
          }, 'Оставить на потом')
        )
      )
    );
  }

  function MixTodayCard(props) {
    const built = props.built;
    const plan = props.plan;
    const atoms = sessionAtoms(built);
    const goalLabel = GOAL_LABEL[props.goal] || 'цель';
    const durationMin = plan && plan.estimatedDurationSec ? Math.round(plan.estimatedDurationSec / 60) : null;
    const blockCount = built && built.session && Array.isArray(built.session.blocks) ? built.session.blocks.length : atoms.length;
    return h('section', { className: 'mobility-fs-mixcard' },
      h('div', { className: 'mobility-fs-mixcard__inner' },
        h('div', { className: 'mobility-fs-mixcard__head-row' },
          h('div', { className: 'mobility-fs-mixcard__badge' },
            h('span', { 'aria-hidden': 'true' }, '▦'),
            ' На сегодня'
          ),
          h('div', { className: 'mobility-fs-mixcard__goalhint' }, 'под цель «' + goalLabel + '»')
        ),
        h('h3', { className: 'mobility-fs-mixcard__title' }, 'Сегодняшняя тренировка'),
        h('p', { className: 'mobility-fs-mixcard__desc' },
          'Учли цель, самочувствие, инвентарь и ограничения.'
        ),
        h('div', { className: 'mobility-fs-mixcard__chips' },
          chip('purpose', built && built.session ? PURPOSE_LABEL[built.session.purpose] || built.session.purpose : 'рекомендация'),
          durationMin ? chip('duration', durationMin + ' мин') : null,
          chip('steps', blockCount + ' упр')
        ),
        h(ExercisePreviewList, { atoms: atoms }),
        h('div', { className: 'mobility-fs-mixcard__actions' },
          h('button', {
            type: 'button',
            className: 'mobility-fs-mixcard__btn mobility-fs-mixcard__btn--reroll',
            onClick: props.onReroll,
            'aria-label': 'Другой равноценный набор',
            title: 'Другой равноценный набор под ту же цель'
          }, '↻'),
          h('button', {
            type: 'button',
            className: 'mobility-fs-mixcard__btn mobility-fs-mixcard__btn--launch',
            onClick: props.onLaunch
          }, 'Начать тренировку')
        )
      )
    );
  }

  function RecommendedProtocolCard(props) {
    const protocol = props.protocol;
    if (!protocol) return null;
    const duration = Array.isArray(protocol.durationMin) ? protocol.durationMin[0] + '-' + protocol.durationMin[1] + ' мин' : '';
    return h('section', { className: 'mobility-fs-program-card mobility-fs-program-card--recommended' },
      h('div', { className: 'mobility-fs-program-card__rec-badge' },
        h('span', { 'aria-hidden': 'true' }, '★'),
        h('span', null, 'на сегодня')
      ),
      h('h3', { className: 'mobility-fs-program-card__title' }, protocolTitle(protocol)),
      h('p', { className: 'mobility-fs-program-card__desc' }, protocolIntent(protocol)),
      h('div', { className: 'mobility-fs-mixcard__chips' },
        chip('purpose', MODE_LABEL[protocol.modeId] || protocol.modeId),
        duration ? chip('duration', duration) : null
      ),
      h('div', { className: 'mobility-fs-mixcard__actions' },
        h('button', {
          type: 'button',
          className: 'mobility-fs-mixcard__btn mobility-fs-mixcard__btn--secondary',
          onClick: props.onOpenProtocols
        }, 'Все планы'),
        h('button', {
          type: 'button',
          className: 'mobility-fs-mixcard__btn mobility-fs-mixcard__btn--launch',
          onClick: function () { props.onLaunch && props.onLaunch(protocol); }
        }, 'Начать план')
      )
    );
  }

  function MobilityApp(props) {
    const d = deps();
    const initialProfile = normalizeProfile(props.profile);
    const [profile, setProfile] = useState(initialProfile);
    const [assessmentScreens, setAssessmentScreens] = useState(function () {
      return initialAssessmentRows(d.assessment, props.screens);
    });
    const initialProtocol = d.protocolCatalog
      ? (props.protocolId && d.protocolCatalog.getProtocol(props.protocolId))
        || (props.modeId && d.protocolCatalog.defaultForMode(props.modeId))
        || d.protocolCatalog.recommend(initialProfile, props)
      : null;
    const [protocolId, setProtocolId] = useState(initialProtocol && initialProtocol.id || null);
    const [modeId, setModeId] = useState(props.modeId || (initialProtocol && initialProtocol.modeId) || (d.onboarding && d.onboarding.recommendMode(initialProfile, { timeOfDay: props.timeOfDay })) || 'morning_tonify');
    const [readinessInput, setReadinessInput] = useState(props.readiness || {});
    const [recordsView, setRecordsView] = useState(function () {
      if (props.records) return props.records;
      return d.recordsStore && typeof d.recordsStore.load === 'function'
        ? d.recordsStore.load(props.clientId, props.storage)
        : {};
    });
    const [saveStatus, setSaveStatus] = useState(null);
    const [pendingSessionSave, setPendingSessionSave] = useState(null);
    const [activeTab, setActiveTab] = useState('today');
    const [flowMode, setFlowMode] = useState('choose');
    const [runnerStarted, setRunnerStarted] = useState(false);
    const [mixSeed, setMixSeed] = useState(0);
    const [customAtomIds, setCustomAtomIds] = useState([]);
    const [customRunAtomIds, setCustomRunAtomIds] = useState([]);
    const [showRegistry, setShowRegistry] = useState(false);
    const [showSources, setShowSources] = useState(false);
    const [activeCourse, setActiveCourse] = useState(function () {
      return d.recordsStore && d.recordsStore.latestCourse
        ? d.recordsStore.latestCourse(props.clientId, props.storage)
        : null;
    });
    function refreshRecordsView() {
      const next = d.recordsStore && typeof d.recordsStore.load === 'function'
        ? d.recordsStore.load(props.clientId, props.storage)
        : props.records;
      if (next) setRecordsView(next);
      return next || null;
    }
    // Адаптивный масштаб под ширину контейнера: меряем при маунте и на resize,
    // прокидываем --mob-w (px) в CSS, который масштабирует заголовок/иконки/отступы
    // через clamp(). Так нет горизонтального скролла и заголовок ужимается на узких.
    const rootRef = useRef(null);
    useEffect(function () {
      const el = rootRef.current;
      if (!el) return;
      let raf = 0;
      function apply() {
        raf = 0;
        const w = el.clientWidth || (el.parentNode && el.parentNode.clientWidth) || 0;
        if (w) el.style.setProperty('--mob-w', w + 'px');
      }
      function onResize() {
        if (raf) return;
        raf = (global.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); })(apply);
      }
      apply();
      global.addEventListener('resize', onResize);
      let ro = null;
      if (global.ResizeObserver) { ro = new global.ResizeObserver(onResize); ro.observe(el); }
      return function () {
        global.removeEventListener('resize', onResize);
        if (ro) ro.disconnect();
        if (raf && global.cancelAnimationFrame) global.cancelAnimationFrame(raf);
      };
    }, []);
    // Resume прерванной сессии (kernel-persistence, Этап 3): на boot ищем свежий
    // snapshot материализованного плана и предлагаем продолжить с того же шага.
    const [resumeSnap, setResumeSnap] = useState(null);
    const [resuming, setResuming] = useState(false);
    const resumeDetectedRef = useRef(false);
    useEffect(function () {
      if (resumeDetectedRef.current) return;
      resumeDetectedRef.current = true;
      const store = Mobility.persistence;
      if (!store || typeof store.detectOnBoot !== 'function') return;
      store.detectOnBoot(function (result) {
        if (result && !result.stale && result.snapshot
            && Array.isArray(result.snapshot.planSteps) && result.snapshot.planSteps.length) {
          setResumeSnap(result.snapshot);
        }
      });
    }, []);
    function resumeGuidedSession() {
      setResuming(true);
      setActiveTab('today');
      setFlowMode('resume');
      setRunnerStarted(true);
    }
    function dismissResume() {
      if (Mobility.persistence) Mobility.persistence.clear();
      setResumeSnap(null);
      setResuming(false);
    }
    const selectedProtocol = d.protocolCatalog && protocolId ? d.protocolCatalog.getProtocol(protocolId) : null;
    const profileForBuild = selectedProtocol && selectedProtocol.profilePatch && Array.isArray(selectedProtocol.profilePatch.populations)
      ? Object.assign({}, profile, {
          populations: Array.from(new Set((profile.populations || []).concat(selectedProtocol.profilePatch.populations)))
        })
      : profile;
    const profileValidation = useMemo(function () {
      return d.onboarding && typeof d.onboarding.validateProfile === 'function'
        ? d.onboarding.validateProfile(profileForBuild)
        : { ok: false, profile: profileForBuild, issues: [{ level: 'error', code: 'mobility.onboarding_not_loaded', msg: 'проверка обязательных данных не загружена' }] };
    }, [d.onboarding, profileForBuild]);

    function applyMode(nextModeId) {
      setModeId(nextModeId);
      setFlowMode('choose');
      setRunnerStarted(false);
      if (d.protocolCatalog && typeof d.protocolCatalog.defaultForMode === 'function') {
        const p = d.protocolCatalog.defaultForMode(nextModeId);
        if (p && p.id) setProtocolId(p.id);
      }
    }
    function applyProtocol(protocol) {
      if (!protocol || !protocol.id) return;
      setProtocolId(protocol.id);
      setModeId(protocol.modeId);
      setFlowMode('protocol');
      setRunnerStarted(false);
      setActiveTab('today');
    }
    function handleProfileChange(nextProfile) {
      setProfile(nextProfile);
      if (d.onboarding && nextProfile && nextProfile.goal !== profile.goal) {
        if (d.protocolCatalog && typeof d.protocolCatalog.recommend === 'function') {
          const p = d.protocolCatalog.recommend(nextProfile, props);
          if (p && p.id) applyProtocol(p);
        } else {
          setModeId(d.onboarding.recommendMode(nextProfile, { timeOfDay: props.timeOfDay }));
        }
        setFlowMode('choose');
        setRunnerStarted(false);
      }
    }
    function handleLoadLevelChange(loadLevel) {
      setProfile(Object.assign({}, profile, { loadLevel: loadLevel }));
      setFlowMode('choose');
      setRunnerStarted(false);
    }

    const built = useMemo(function () {
      if (!d.routineBuilder) return null;
      if (!profileValidation.ok) return { ok: false, errors: profileValidation.issues, issues: profileValidation.issues, session: null };
      const protocolOptions = d.protocolCatalog && selectedProtocol
        ? d.protocolCatalog.buildOptions(selectedProtocol)
        : {};
      const options = Object.assign({}, protocolOptions, {
        timeOfDay: props.timeOfDay,
        screens: assessmentScreens,
        readinessInput: readinessInput,
        coldWaterPlanned: props.coldWaterPlanned,
        afterAdaptiveStrength: props.afterAdaptiveStrength,
        trainingPhase: props.trainingPhase,
        phase: props.phase,
        keyLoadWithinHours: props.keyLoadWithinHours,
        randomSeed: mixSeed || null,
        painFlags: props.painFlags || [],
        contraindications: props.contraindications || [],
        records: recordsView
      });
      if (activeCourse && profileForBuild.goal === 'posture' && flowMode !== 'protocol' && d.coursePlanner && d.coursePlanner.buildDailySession) {
        return d.coursePlanner.buildDailySession(activeCourse, profileForBuild, Object.assign({}, options, {
          todayKey: props.nowDate,
          modeId: activeCourse.modeId || modeId
        }));
      }
      return d.routineBuilder.buildSession(modeId, profileForBuild, options);
    }, [
      modeId,
      profileForBuild,
      selectedProtocol,
      activeCourse,
      flowMode,
      props.timeOfDay,
      assessmentScreens,
      readinessInput,
      props.coldWaterPlanned,
      props.afterAdaptiveStrength,
      props.trainingPhase,
      props.phase,
      props.keyLoadWithinHours,
      mixSeed,
      props.painFlags,
      props.contraindications,
      recordsView,
      props.clientId,
      props.storage,
      profileValidation
    ]);

    const customSourceAtomIds = customRunAtomIds.length ? customRunAtomIds : customAtomIds;
    const customBuilt = useMemo(function () {
      if (!profileValidation.ok) return { ok: false, errors: profileValidation.issues, issues: profileValidation.issues, session: null };
      return buildCustomBuilt(customSourceAtomIds, modeId, profileForBuild, {
        timeOfDay: props.timeOfDay,
        readinessInput: readinessInput,
        coldWaterPlanned: props.coldWaterPlanned,
        afterAdaptiveStrength: props.afterAdaptiveStrength,
        trainingPhase: props.trainingPhase,
        phase: props.phase,
        keyLoadWithinHours: props.keyLoadWithinHours,
        painFlags: props.painFlags || [],
        contraindications: props.contraindications || []
      });
    }, [
      customSourceAtomIds,
      modeId,
      profileForBuild,
      props.timeOfDay,
      readinessInput,
      props.coldWaterPlanned,
      props.afterAdaptiveStrength,
      props.trainingPhase,
      props.phase,
      props.keyLoadWithinHours,
      props.painFlags,
      props.contraindications,
      profileValidation
    ]);

    const activeBuilt = flowMode === 'custom' ? customBuilt : built;
    const plan = useMemo(function () {
      if (!d.routineRunner || !activeBuilt || !activeBuilt.session) return null;
      return d.routineRunner.buildRunPlan(activeBuilt.session);
    }, [activeBuilt]);
    const resumePlan = useMemo(function () {
      if (!resumeSnap || !Array.isArray(resumeSnap.planSteps) || !resumeSnap.planSteps.length) return null;
      return {
        steps: resumeSnap.planSteps,
        totalSteps: resumeSnap.planSteps.length,
        sessionMode: resumeSnap.sessionMode,
        estimatedDurationSec: Number(resumeSnap.estimatedDurationSec) || 0
      };
    }, [resumeSnap]);
    const resumeBuilt = resumeSnap && resumeSnap.built && resumeSnap.built.session
      ? resumeSnap.built
      : null;
    const executionPlan = resuming && resumePlan ? resumePlan : plan;
    const executionBuilt = resuming && resumeBuilt ? resumeBuilt : activeBuilt;
    const executionDurationMin = executionPlan && executionPlan.estimatedDurationSec
      ? Math.round(executionPlan.estimatedDurationSec / 60)
      : null;
    const executionIssueCount = executionBuilt && Array.isArray(executionBuilt.issues)
      ? executionBuilt.issues.length
      : 0;
    const executionBlockCount = executionBuilt && executionBuilt.session && Array.isArray(executionBuilt.session.blocks)
      ? executionBuilt.session.blocks.length
      : 0;

    function persistMobilitySession(result, planOverride, flags) {
      const target = result || activeBuilt;
      const p = planOverride || plan;
      if (!d.recordsStore || !target) return { status: 'failed', reason: 'records_unavailable' };
      const context = props.dateKey ? {
        dateKey: props.dateKey,
        trainingIndex: props.trainingIndex
      } : null;
      const mobilityLog = {
        version: 1,
        mode: target.session && target.session.mode,
        purpose: target.session && target.session.purpose,
        autonomic: target.session && target.session.autonomic,
        ok: target.ok !== false,
        partial: !!(flags && flags.partial || target.partial),
        partialProgress: target.partialProgress || target.session && target.session.partialProgress || null,
        totalDurationMinutes: p && p.estimatedDurationSec ? Math.round(p.estimatedDurationSec / 60) : null,
        plan: p,
        issues: target.issues || [],
        savedAt: new Date().toISOString()
      };
      return persistMobilitySessionPair({
        recordsStore: d.recordsStore,
        clientId: props.clientId,
        target: target,
        storage: props.storage,
        idempotencyKey: mobilitySessionIdempotencyKey(context, target, flags),
        diaryRequired: !!context,
        trainingStep: global.HEYS && global.HEYS.TrainingStep,
        context: context,
        mobilityLog: mobilityLog,
        meta: {
          activityLabel: 'Мобильность' + (mobilityLog.partial ? ' (частично)' : '')
        }
      });
    }
    function applySessionSaveResult(result, target, targetPlan, flags) {
      const status = result && result.status || 'failed';
      setSaveStatus(status);
      if (result && result.record) refreshRecordsView();
      if (status === 'saved_both') setPendingSessionSave(null);
      else setPendingSessionSave({ target: target, plan: targetPlan, flags: flags || {} });
      return result;
    }
    function saveSession() {
      const result = persistMobilitySession(executionBuilt, executionPlan, {});
      return applySessionSaveResult(result, executionBuilt, executionPlan, {});
    }
    function savePartialSession(progress, resultOverride, planOverride) {
      const targetBuilt = resultOverride || activeBuilt;
      const targetPlan = planOverride || plan;
      if (!targetBuilt || !targetPlan) return;
      const partial = partialMobilityResult(targetBuilt, targetPlan, progress);
      if (!partial) return;
      const partialPlan = d.routineRunner && partial.session ? d.routineRunner.buildRunPlan(partial.session) : targetPlan;
      const flags = { partial: true };
      const result = persistMobilitySession(partial, partialPlan, flags);
      return applySessionSaveResult(result, partial, partialPlan, flags);
    }
    function retryPendingSessionSave() {
      if (!pendingSessionSave) return null;
      const result = persistMobilitySession(
        pendingSessionSave.target,
        pendingSessionSave.plan,
        pendingSessionSave.flags
      );
      return applySessionSaveResult(
        result,
        pendingSessionSave.target,
        pendingSessionSave.plan,
        pendingSessionSave.flags
      );
    }
    function saveAssessment(audit) {
      if (!d.recordsStore || !audit) return;
      d.recordsStore.addAssessment(props.clientId, audit, props.storage);
      refreshRecordsView();
      setSaveStatus('assessment');
    }
    function savePainFlag(step) {
      if (!d.recordsStore) return;
      d.recordsStore.addPainFlag(props.clientId, {
        level: 'pain',
        atomId: step && step.atomId,
        zone: step && step.jointRegion || null
      }, props.storage);
      refreshRecordsView();
      setSaveStatus('pain');
    }
    function saveStepFeedback(step, feedback) {
      if (!d.recordsStore || !step) return;
      const courseMeta = executionBuilt && executionBuilt.session && executionBuilt.session.course;
      d.recordsStore.addStepFeedback(props.clientId, Object.assign({
        courseId: courseMeta && courseMeta.id || null,
        week: courseMeta && courseMeta.week || null,
        phase: courseMeta && courseMeta.phase || null,
        slotId: step.slotId || step.blockId || null,
        atomId: step.atomId || null
      }, feedback || {}), props.storage);
      refreshRecordsView();
      setSaveStatus('feedback');
    }
    function startPostureCourse() {
      if (!d.coursePlanner || !d.coursePlanner.buildCourse) return;
      const audit = d.assessment && d.assessment.postureAudit
        ? d.assessment.postureAudit(assessmentScreens)
        : (d.assessment && d.assessment.limiterAudit ? d.assessment.limiterAudit(assessmentScreens) : null);
      const course = d.coursePlanner.buildCourse({
        goal: 'posture',
        modeId: 'posture',
        startedAt: props.nowDate,
        weeks: 4,
        loadLevel: profile.loadLevel,
        equipment: profile.equipment,
        assessment: audit
      });
      const saved = d.recordsStore && d.recordsStore.saveCourse
        ? d.recordsStore.saveCourse(props.clientId, course, props.storage)
        : course;
      setActiveCourse(saved);
      handleProfileChange(Object.assign({}, profile, { goal: 'posture' }));
      setModeId('posture');
      setFlowMode('choose');
      setRunnerStarted(false);
      setSaveStatus('course');
    }
    function replaceCourseSlot(block) {
      if (!activeCourse || !d.coursePlanner || !d.coursePlanner.replaceWithinSlot || !block) return;
      const atom = block.atoms && block.atoms[0];
      const buildContext = d.modeEngine && d.modeEngine.buildContext
        ? d.modeEngine.buildContext(activeCourse.modeId || modeId, {
          painFlags: props.painFlags || [],
          contraindications: props.contraindications || []
        })
        : {};
      const result = d.coursePlanner.replaceWithinSlot(activeCourse, block.slotId || block.id, atom && atom.id, {
        profile: profileForBuild,
        buildContext: buildContext,
        reason: 'manual_replace'
      });
      if (!result || !result.ok) return;
      const saved = d.recordsStore && d.recordsStore.saveCourse
        ? d.recordsStore.saveCourse(props.clientId, result.course, props.storage)
        : result.course;
      if (d.recordsStore && d.recordsStore.addSlotHistory) {
        d.recordsStore.addSlotHistory(props.clientId, {
          courseId: saved.id,
          slotId: block.slotId || block.id,
          fromAtomId: atom && atom.id || null,
          toAtomId: result.replacementAtomId,
          reason: 'manual_replace'
        }, props.storage);
      }
      setActiveCourse(saved);
      setMixSeed(Date.now());
      setSaveStatus('course');
    }

    const readinessScore = d.readiness ? d.readiness.score(readinessInput || {}) : null;
    const modes = d.modeEngine && typeof d.modeEngine.listModes === 'function' ? d.modeEngine.listModes() : [];
    const selectedMode = modes.find(function (m) { return m.id === modeId; }) || { id: modeId, purpose: activeBuilt && activeBuilt.session && activeBuilt.session.purpose, autonomic: activeBuilt && activeBuilt.session && activeBuilt.session.autonomic };
    const durationMin = plan && plan.estimatedDurationSec ? Math.round(plan.estimatedDurationSec / 60) : null;
    const issueCount = activeBuilt && Array.isArray(activeBuilt.issues) ? activeBuilt.issues.length : 0;
    const blockCount = activeBuilt && activeBuilt.session && Array.isArray(activeBuilt.session.blocks) ? activeBuilt.session.blocks.length : 0;
    const activeCourseWeek = activeCourse && d.coursePlanner && d.coursePlanner.currentWeek
      ? d.coursePlanner.currentWeek(activeCourse, props.nowDate)
      : null;
    const activeCourseView = activeCourse
      ? Object.assign({}, activeCourse, {
          currentWeekLabel: activeCourseWeek ? activeCourseWeek.week + ' / ' + activeCourse.weeksTotal : '',
          currentPhaseLabel: activeCourseWeek ? COURSE_PHASE_LABEL[activeCourseWeek.phase] || '' : ''
        })
      : null;
    const Focus = global.HEYS && global.HEYS.TrainingFocus;
    const tabs = [
      { id: 'today', label: 'Сегодня', icon: '✓' },
      { id: 'protocols', label: 'Планы', icon: '▦' },
      { id: 'constructor', label: 'Свой план', icon: '+' },
      { id: 'progress', label: 'Прогресс', icon: '↗' },
      { id: 'calendar', label: 'Календарь', icon: '□' }
    ];

    function startGuidedSession() {
      if (!profileValidation.ok) return;
      if (!activeBuilt || !activeBuilt.session || !plan) return;
      showMobilityPreflight({
        modeId: modeId,
        selectedMode: selectedMode,
        issueCount: issueCount,
        onStart: function () { setResuming(false); setResumeSnap(null); setRunnerStarted(true); }
      });
    }

    function renderTabs() {
      if (Focus && Focus.Tabs) {
        return h(Focus.Tabs, {
          classPrefix: 'mobility-fs',
          items: tabs,
          value: activeTab,
          onChange: setActiveTab,
          ariaLabel: 'Разделы мобильности'
        });
      }
      return h('div', { className: 'mobility-fs-tabs', role: 'tablist', 'aria-label': 'Разделы мобильности' },
        tabs.map(function (t) {
          const active = activeTab === t.id;
          return h('button', {
            key: t.id,
            type: 'button',
            role: 'tab',
            'aria-selected': active,
            className: 'mobility-fs-tab' + (active ? ' is-active' : ''),
            onClick: function () { setActiveTab(t.id); }
          },
            h('span', { className: 'mobility-fs-tab__icon', 'aria-hidden': 'true' }, t.icon),
            h('span', { className: 'mobility-fs-tab__label' }, t.label)
          );
        })
      );
    }

    function renderTrainingHeader() {
      if (Focus && Focus.Header) {
        return h(Focus.Header, {
          classPrefix: 'mobility-fs',
          title: 'Мобильность',
          actions: [
            { id: 'tests', icon: '◎', label: 'Самочувствие и замеры', title: 'Самочувствие и замеры', onClick: function () { setActiveTab('tests'); } },
            { id: 'registry', icon: '▦', label: 'Упражнения', title: 'Упражнения', onClick: function () { setShowRegistry(true); } },
            { id: 'sources', icon: '▤', label: 'Обоснование плана', title: 'Обоснование плана', onClick: function () { setShowSources(true); } },
            props.onClose ? { id: 'close', kind: 'close', icon: '×', label: 'Закрыть', title: 'Закрыть', onClick: props.onClose } : null
          ].filter(Boolean)
        });
      }
      return h('header', { className: 'mobility-fs__header' },
        h('div', null,
          h('h2', { className: 'mobility-fs__title' }, 'Мобильность')
        ),
        props.onClose ? h('button', { type: 'button', className: 'mobility-fs__icon-btn mobility-fs__icon-btn--close', onClick: props.onClose, 'aria-label': 'Закрыть' }, '×') : null
      );
    }

    function protocolCountForGoal(goal) {
      const list = d.protocolCatalog && Array.isArray(d.protocolCatalog.PROTOCOLS) ? d.protocolCatalog.PROTOCOLS : [];
      const mode = GOAL_TO_MODE[goal];
      return list.filter(function (p) { return p && p.modeId === mode; }).length;
    }

    function renderTrainingContext() {
      const equipmentIds = d.onboarding && d.onboarding.EQUIPMENT ? d.onboarding.EQUIPMENT : [];
      const currentEquipment = Array.isArray(profile.equipment) ? profile.equipment : [];
      function toggleEquipment(id) {
        const next = currentEquipment.indexOf(id) >= 0
          ? currentEquipment.filter(function (x) { return x !== id; })
          : currentEquipment.concat([id]);
        setProfile(Object.assign({}, profile, { equipment: next }));
      }
      const goalIds = ['morning', 'pre_workout', 'recover', 'develop', 'posture', 'relax', 'desk'];
      if (Focus && Focus.EquipmentBar && Focus.GoalSelector) {
        return h(React.Fragment, null,
          h(Focus.EquipmentBar, {
            classPrefix: 'mobility-fs',
            items: equipmentIds.map(function (id) {
              return { id: id, label: EQUIPMENT_LABEL[id] || id };
            }),
            value: currentEquipment,
            onToggle: toggleEquipment,
            ariaLabel: 'Инвентарь'
          }),
          h(Focus.GoalSelector, {
            classPrefix: 'mobility-fs',
            label: 'Цель тренировки',
            value: profile.goal,
            items: goalIds.map(function (goal) {
              const count = protocolCountForGoal(goal);
              return {
                id: goal,
                label: GOAL_SHORT_LABEL[goal] || GOAL_LABEL[goal] || goal,
                icon: GOAL_EMOJI[goal] || '🎯',
                count: count
              };
            }),
            onChange: function (goal) {
              handleProfileChange(Object.assign({}, profile, { goal: goal }));
            }
          }),
          h(LoadLevelSlider, {
            value: profile.loadLevel,
            onChange: handleLoadLevelChange
          })
        );
      }
      return h(React.Fragment, null,
        h(EquipmentStepPanel, { profile: profile, onChange: setProfile }),
        h(GoalStepPanel, { profile: profile, onChange: handleProfileChange }),
        h(LoadLevelSlider, {
          value: profile.loadLevel,
          onChange: handleLoadLevelChange
        })
      );
    }

    function renderModeRail() {
      return h('div', { className: 'mobility-mode-rail', 'aria-label': 'Выбор режима' },
        modes.map(function (m) {
          const selected = m.id === modeId;
          return h('button', {
            key: m.id,
            type: 'button',
            className: 'mobility-mode-card' + (selected ? ' is-selected' : ''),
            onClick: function () { applyMode(m.id); }
          },
            h('strong', null, MODE_LABEL[m.id] || m.label),
            h('span', null, PURPOSE_LABEL[m.purpose] || m.purpose, ' · ', AUTONOMIC_LABEL[m.autonomic] || m.autonomic)
          );
        })
      );
    }

    function renderToday() {
      if (!profileValidation.ok) {
        return h('div', { className: 'mobility-fs-today' },
          h(SafetyOnboardingGate, {
            profile: profile,
            validation: profileValidation,
            onChange: handleProfileChange
          })
        );
      }
      const title = flowMode === 'custom'
        ? 'Свой план'
        : flowMode === 'resume'
          ? 'Пауза в тренировке'
        : flowMode === 'protocol' && selectedProtocol
          ? protocolTitle(selectedProtocol)
          : 'Быстрая тренировка';
      const text = flowMode === 'custom'
        ? 'Ваши упражнения готовы к выполнению.'
        : flowMode === 'resume'
          ? 'Продолжение с того места, где вы остановились.'
        : flowMode === 'protocol' && selectedProtocol
          ? protocolIntent(selectedProtocol)
          : 'Учли цель, самочувствие, инвентарь и ограничения.';
      const renderResumeBanner = function () {
        return (resumeSnap && !runnerStarted)
          ? h('div', { className: 'mobility-compact-plan', 'data-resume-banner': '1' },
              h('div', null,
                h('strong', null, 'Пауза в тренировке'),
                h('span', null, 'Продолжить с этапа ' + ((Number(resumeSnap.index) || 0) + 1) + ' из ' + resumeSnap.planSteps.length)
              ),
              h('div', { style: { display: 'flex', gap: '8px' } },
                h('button', { type: 'button', className: 'mobility-primary-btn', onClick: resumeGuidedSession }, 'Продолжить'),
                h('button', { type: 'button', onClick: dismissResume }, 'Отменить')
              )
            )
          : null;
      };
      if (flowMode === 'choose') {
        return h('div', { className: 'mobility-fs-today' },
          renderResumeBanner(),
          Focus && Focus.ReadinessCard
            ? h(Focus.ReadinessCard, {
                classPrefix: 'mobility-fs',
                score: readinessScore && readinessScore.score,
                color: issueCount ? '#ef4444' : '#16a66a',
                title: issueCount ? 'Сегодня — с ограничениями' : 'Сегодня — можно работать',
                subtitle: (PURPOSE_LABEL[selectedMode.purpose] || 'Рекомендация') + ' · ' + (AUTONOMIC_LABEL[selectedMode.autonomic] || 'спокойный режим'),
                reasons: activeBuilt && activeBuilt.session && Array.isArray(activeBuilt.session.reasons)
                  ? activeBuilt.session.reasons.slice(0, 3).map(reasonText)
                  : []
              })
            : null,
          h(MixTodayCard, {
            built: built,
            plan: d.routineRunner && built && built.session ? d.routineRunner.buildRunPlan(built.session) : null,
            goal: profile.goal,
            onReroll: function () { setMixSeed(Date.now()); setRunnerStarted(false); },
            onLaunch: function () { setFlowMode('mix'); setRunnerStarted(false); }
          }),
          profile.goal === 'posture'
            ? h(CourseStatusCard, {
                variant: 'summary',
                course: activeCourseView,
                built: built,
                onOpenProgress: function () { setActiveTab('progress'); }
              })
            : null,
          h(RecommendedProtocolCard, {
            protocol: selectedProtocol,
            onOpenProtocols: function () { setActiveTab('protocols'); },
            onLaunch: function (protocol) { applyProtocol(protocol); setRunnerStarted(false); }
          })
        );
      }
      return h('div', null,
        h('div', { className: 'mobility-run-shell' },
          h('section', { className: 'mobility-today-hero', 'aria-label': 'Текущая тренировка' },
            h('div', { className: 'mobility-today-hero__content' },
              h('div', { className: 'mobility-today-hero__top' },
                h('div', null,
                  h('h3', null, title),
                  h('p', null, executionBuilt && executionBuilt.ok === false
                    ? 'Есть ограничения: проверьте подсказки перед выполнением.'
                    : text)
                ),
                readinessScore ? h('div', { className: 'mobility-fs__score' },
                  String(readinessScore.score),
                  h('small', null, 'самочувствие')
                ) : null
              ),
              h('div', { className: 'mobility-today-hero__meta' },
                chip('purpose', PURPOSE_LABEL[selectedMode.purpose] || selectedMode.purpose || 'режим'),
                executionDurationMin
                  ? chip('duration', executionDurationMin + ' мин')
                  : durationMin ? chip('duration', durationMin + ' мин') : null,
                chip('steps', executionPlan ? executionPlan.totalSteps + ' частей' : 'план подбирается'),
                chip(executionIssueCount ? 'warn' : 'ok', executionIssueCount ? issueCountLabel(executionIssueCount) : 'без ограничений')
              )
            )
          ),
          h('div', { className: 'mobility-compact-plan' },
            h('div', null,
              h('strong', null, executionBlockCount || blockCount || 0, ' упражн.'),
              h('span', null, executionDurationMin
                ? executionDurationMin + ' мин · ' + (executionPlan ? executionPlan.totalSteps : 0) + ' частей'
                : durationMin ? durationMin + ' мин · ' + (plan ? plan.totalSteps : 0) + ' частей' : 'план подбирается')
            ),
            h('button', { type: 'button', onClick: function () { setFlowMode('choose'); setRunnerStarted(false); setResuming(false); } }, 'Назад')
          ),
          renderResumeBanner(),
          runnerStarted
            ? h(ExecutionPanel, {
                key: (resuming ? 'resume:' : '') + flowMode + ':' + modeId + ':' + protocolId + ':' + customRunAtomIds.join(',') + ':' + mixSeed + ':' + (executionPlan ? executionPlan.totalSteps : 0),
                plan: executionPlan,
                built: executionBuilt,
                initialIndex: (resuming && resumeSnap) ? (Number(resumeSnap.index) || 0) : 0,
                initialRemainingSec: (resuming && resumeSnap) ? resumeSnap.remainingSec : null,
                autoStart: true,
                onPain: savePainFlag,
                onFeedback: saveStepFeedback,
                onAbortSave: function (progress) { savePartialSession(progress, executionBuilt, executionPlan); },
                onAbortComplete: function () { setRunnerStarted(false); setResuming(false); setResumeSnap(null); }
              })
            : h(GuidedLaunchCard, {
                built: activeBuilt,
                plan: plan,
                title: title,
                text: text,
                issueCount: issueCount,
                onStart: startGuidedSession,
                onSavePlan: saveSession
              }),
          h('div', { className: 'mobility-today-hero__actions' },
            h('button', { type: 'button', className: 'mobility-primary-btn', onClick: saveSession }, props.dateKey ? 'Сохранить в тренировку' : 'Сохранить тренировку')
          )
        )
      );
    }

    function renderTabContent() {
      if (activeTab === 'today') return renderToday();
      if (activeTab === 'protocols') {
        return h('div', null,
          h(ProtocolsPanel, { value: protocolId, onChange: applyProtocol })
        );
      }
      if (activeTab === 'constructor') {
        return h('div', null,
          h(ConstructorPanel, {
            selectedAtomIds: customAtomIds,
            onChange: setCustomAtomIds,
            onStart: function (ids) {
              const nextIds = Array.isArray(ids) ? ids : customAtomIds;
	              setCustomAtomIds(nextIds);
	              setCustomRunAtomIds(nextIds);
	              setFlowMode('custom');
	              setRunnerStarted(false);
	              setActiveTab('today');
	            }
          })
        );
      }
      if (activeTab === 'tests') {
        return h(TestsPanel, {
          profile: profile,
          onProfileChange: handleProfileChange,
          readinessInput: readinessInput,
          onReadinessChange: setReadinessInput,
          assessmentScreens: assessmentScreens,
          onAssessmentChange: setAssessmentScreens,
          onSaveAssessment: saveAssessment
        });
      }
      if (activeTab === 'progress') {
        return h('div', null,
          h(ProgressPanel, {
            records: recordsView,
            nowDate: props.nowDate,
            built: activeBuilt,
            readinessInput: readinessInput,
            progressionHistory: props.progressionHistory,
            profile: profile,
            course: activeCourseView,
            onStartCourse: startPostureCourse,
            onReplaceCourseSlot: replaceCourseSlot,
            onOpenToday: function () { setActiveTab('today'); setFlowMode('choose'); setRunnerStarted(false); },
            onOpenTests: function () { setActiveTab('tests'); }
          })
        );
      }
      if (activeTab === 'calendar') {
        return h(CalendarPanel, {
          profile: profile,
          records: recordsView,
          course: activeCourseView,
          onStartCourse: startPostureCourse,
          phase: props.phase,
          keyLoadWithinHours: props.keyLoadWithinHours,
          startDate: props.startDate,
          nowDate: props.nowDate,
          onOpenProgress: function () { setActiveTab('progress'); }
        });
      }
      return renderToday();
    }

    const showTrainingContext = activeTab === 'today' && flowMode === 'choose' && profileValidation.ok;

    return h('main', { className: 'mobility-app mobility-fs-session', 'data-mode': modeId, ref: rootRef },
      renderTrainingHeader(),
      renderTabs(),
      showTrainingContext ? renderTrainingContext() : null,
      saveStatus ? h('div', { className: 'mobility-save-status', 'data-status': saveStatus },
        saveStatus === 'saved_both' ? 'Тренировка сохранена'
          : saveStatus === 'diary_pending' ? h(React.Fragment, null,
            h('span', null, 'Не удалось сохранить тренировку в дневник.'),
            h('button', { type: 'button', onClick: retryPendingSessionSave }, 'Повторить сохранение')
          )
          : saveStatus === 'failed' ? h(React.Fragment, null,
            h('span', null, 'Не удалось сохранить тренировку.'),
            h('button', { type: 'button', onClick: retryPendingSessionSave }, 'Повторить сохранение')
          )
          : saveStatus === 'assessment' ? 'Замеры сохранены'
          : saveStatus === 'course' ? 'Курс обновлён'
          : saveStatus === 'feedback' ? 'Ощущения сохранены'
          : 'Боль отмечена'
      ) : null,
      h('div', { className: 'mobility-fs-tab-content' }, renderTabContent()),
      showRegistry ? h(ExerciseRegistryOverlay, {
        selectedAtomIds: customAtomIds,
        onChange: setCustomAtomIds,
        onClose: function () { setShowRegistry(false); },
        onOpenConstructor: function () { setActiveTab('constructor'); }
      }) : null,
      showSources && deps().bibliography && deps().bibliography.BibliographyModal
        ? h(deps().bibliography.BibliographyModal, { onClose: function () { setShowSources(false); } })
        : null
    );
  }

  Mobility.UI = {
    __registered: true,
    MobilityApp: MobilityApp,
    ModePicker: ModePicker,
    ProfilePanel: ProfilePanel,
    SafetyOnboardingGate: SafetyOnboardingGate,
    ReadinessPanel: ReadinessPanel,
    AssessmentPanel: AssessmentPanel,
    ProgressPanel: ProgressPanel,
    CalendarPanel: CalendarPanel,
    SessionPanel: SessionPanel,
    GoalStepPanel: GoalStepPanel,
    EquipmentStepPanel: EquipmentStepPanel,
    ActionStepPanel: ActionStepPanel,
    ConstructorPanel: ConstructorPanel,
    AtomVisual: AtomVisual,
    ExecutionPanel: ExecutionPanel,
    mobilitySessionIdempotencyKey: mobilitySessionIdempotencyKey,
    persistMobilitySessionPair: persistMobilitySessionPair,
    RunnerPlanPanel: RunnerPlanPanel,
    EffectMapPanel: EffectMapPanel,
    SourceBadge: SourceBadge,
    _buildCustomBuilt: buildCustomBuilt
  };
})(typeof window !== 'undefined' ? window : globalThis);
