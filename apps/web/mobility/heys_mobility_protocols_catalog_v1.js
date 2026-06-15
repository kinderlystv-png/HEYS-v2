// heys_mobility_protocols_catalog_v1.js — ready-to-run Mobility protocols.
//
// This is the Mobility equivalent of Fingers.PROGRAMS: product-facing programs
// over the lower-level mode_engine/routine_builder contracts.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__protocolsCatalogRegistered) return;
  Mobility.__protocolsCatalogRegistered = true;

  const PROTOCOLS = [
    {
      id: 'morning_reset_6',
      name: 'Утренний запуск',
      modeId: 'morning_tonify',
      durationMin: [5, 8],
      level: 'beginner',
      intent: 'Разбудить суставы и мягко поднять тонус без глубокой растяжки.',
      focus: ['warmup', 'active_rom', 'breath'],
      equipment: [],
      preferredAtomIds: ['wu_locomotor', 'mob_dynamic_legswing_hip', 'joint_cars_hip', 'breath_box_tonify'],
      tags: ['утро', 'тонус', 'без инвентаря']
    },
    {
      id: 'pre_workout_ramp_10',
      name: 'RAMP перед нагрузкой',
      modeId: 'pre_workout_ramp',
      durationMin: [8, 12],
      level: 'beginner',
      intent: 'Разогреть, активировать и мобилизовать без долгой статики перед силовой работой.',
      focus: ['raise', 'activation', 'dynamic_rom'],
      equipment: ['band'],
      preferredAtomIds: ['wu_pulse_raise', 'act_band_pullapart', 'act_glute_bridge', 'mob_dynamic_thoracic_openbook'],
      tags: ['перед тренировкой', 'ramp', 'без статики']
    },
    {
      id: 'post_workout_restore_12',
      name: 'Восстановление после тренировки',
      modeId: 'post_workout',
      durationMin: [10, 14],
      level: 'beginner',
      intent: 'Снизить возбуждение и вернуть комфорт движения после основной нагрузки.',
      focus: ['recovery', 'smr', 'light_hold'],
      equipment: ['foam_roll', 'ball'],
      preferredAtomIds: ['smr_foamroll_quad', 'smr_ball_glute', 'recov_active_walk', 'flex_relax_supine_comfort'],
      tags: ['после тренировки', 'восстановление', 'мягко']
    },
    {
      id: 'develop_posterior_chain_18',
      name: 'Развитие задней линии',
      modeId: 'develop_mobility',
      durationMin: [14, 20],
      level: 'intermediate',
      intent: 'Отдельная развивающая сессия для задней поверхности бедра и контроля в конце диапазона.',
      focus: ['static', 'pnf', 'endrange_strength'],
      equipment: ['strap'],
      preferredAtomIds: ['flex_static_hamstring', 'flex_pnf_hamstring_hr', 'loadmob_nordic_eccentric'],
      tags: ['развитие', 'hamstring', 'end-range']
    },
    {
      id: 'develop_hip_control_15',
      name: 'Тазобедренный контроль',
      modeId: 'develop_mobility',
      durationMin: [12, 18],
      level: 'intermediate',
      intent: 'Развивать диапазон тазобедренных через контроль, PNF и умеренную нагрузку.',
      focus: ['hip', 'control', 'loaded_mobility'],
      equipment: ['strap', 'band'],
      preferredAtomIds: ['flex_static_hipflexor', 'flex_pnf_hipflexor_crac', 'loadmob_pails_rails_hip'],
      tags: ['тазобедренные', 'контроль', 'развитие']
    },
    {
      id: 'evening_downshift_8',
      name: 'Вечернее снижение оборотов',
      modeId: 'evening_relax',
      durationMin: [7, 10],
      level: 'beginner',
      intent: 'Дыхание, мягкие удержания и спокойный тон перед сном.',
      focus: ['breath', 'relax', 'comfort'],
      equipment: ['bolster'],
      preferredAtomIds: ['breath_cyclic_sigh', 'breath_resonant', 'flex_relax_supine_comfort', 'restorative_supported_bolster'],
      tags: ['вечер', 'сон', 'расслабление']
    },
    {
      id: 'desk_reset_4',
      name: 'Пауза от сидения',
      modeId: 'anti_sedentary',
      durationMin: [3, 6],
      level: 'beginner',
      intent: 'Короткий сброс скованности для грудного отдела, бедра и шеи в рабочий день.',
      focus: ['desk', 'thoracic', 'hip'],
      equipment: [],
      preferredAtomIds: ['recov_movement_snack', 'mob_dynamic_thoracic_openbook', 'joint_cars_spine', 'joint_cars_hip'],
      profilePatch: { populations: ['desk'] },
      tags: ['офис', 'коротко', 'без инвентаря']
    },
    {
      id: 'rehab_control_8',
      name: 'Контроль без боли',
      modeId: 'rehab',
      durationMin: [6, 10],
      level: 'beginner',
      intent: 'Строгая pain-free рамка: CARs, лёгкое движение и безопасное восстановление.',
      focus: ['pain_free', 'cars', 'low_load'],
      equipment: [],
      preferredAtomIds: ['joint_cars_hip', 'joint_cars_shoulder', 'recov_active_walk'],
      tags: ['реабилитационная рамка', 'без боли', 'низкая нагрузка']
    },
    {
      id: 'deload_maintain_10',
      name: 'Deload-поддержание',
      modeId: 'post_workout',
      durationMin: [8, 12],
      level: 'beginner',
      intent: 'Поддержать диапазон в разгрузочную неделю без тяжёлой тканевой нагрузки.',
      focus: ['deload', 'maintain', 'low_load'],
      equipment: ['foam_roll'],
      buildOptions: { phase: 'deload' },
      preferredAtomIds: ['recov_active_walk', 'smr_foamroll_quad', 'flex_relax_supine_comfort'],
      tags: ['deload', 'поддержание', 'лёгко']
    },
    {
      id: 'peak_maintenance_6',
      name: 'Поддержание перед стартом',
      modeId: 'pre_workout_ramp',
      durationMin: [5, 8],
      level: 'beginner',
      intent: 'Короткое поддержание перед ключевой нагрузкой: без тяжёлой F-нагрузки и долгой статики.',
      focus: ['peak', 'maintain', 'safe_prep'],
      equipment: [],
      buildOptions: { phase: 'peak', keyLoadWithinHours: 24 },
      preferredAtomIds: ['wu_locomotor', 'mob_dynamic_thoracic_openbook', 'joint_cars_hip'],
      tags: ['пик', 'старт', 'поддержание']
    }
  ];

  const BY_ID = PROTOCOLS.reduce(function (acc, p) {
    acc[p.id] = p;
    return acc;
  }, {});

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  function getProtocol(id) {
    return BY_ID[id] ? clone(BY_ID[id]) : null;
  }
  function listProtocols(filter) {
    const f = filter || {};
    return PROTOCOLS.filter(function (p) {
      if (f.modeId && p.modeId !== f.modeId) return false;
      if (f.level && p.level !== 'beginner' && p.level !== f.level) return false;
      if (f.equipment && p.equipment && p.equipment.length) {
        const eq = Array.isArray(f.equipment) ? f.equipment : [];
        if (p.equipment.some(function (id) { return eq.indexOf(id) < 0; })) return false;
      }
      if (f.tag && (!p.tags || p.tags.indexOf(f.tag) < 0)) return false;
      return true;
    }).map(clone);
  }
  function defaultForMode(modeId) {
    return clone(PROTOCOLS.find(function (p) { return p.modeId === modeId; }) || PROTOCOLS[0]);
  }
  function recommend(profile, options) {
    const p = profile || {};
    const goal = p.goal || (options && options.goal);
    const pops = Array.isArray(p.populations) ? p.populations : [];
    const keyLoadSoon = options &&
      typeof options.keyLoadWithinHours === 'number' &&
      isFinite(options.keyLoadWithinHours) &&
      options.keyLoadWithinHours <= 48;
    if (pops.indexOf('desk') >= 0 || goal === 'desk') return getProtocol('desk_reset_4');
    if (goal === 'relax') return getProtocol('evening_downshift_8');
    if (goal === 'recover') return getProtocol('post_workout_restore_12');
    if (goal === 'develop') return getProtocol('develop_posterior_chain_18');
    if (goal === 'pre_workout') return getProtocol('pre_workout_ramp_10');
    if (options && (options.phase === 'peak' || keyLoadSoon)) return getProtocol('peak_maintenance_6');
    return getProtocol('morning_reset_6');
  }
  function buildOptions(protocol) {
    const p = typeof protocol === 'string' ? getProtocol(protocol) : clone(protocol || {});
    if (!p || !p.id) return {};
    return Object.assign({}, p.buildOptions || {}, {
      preferredAtomIds: p.preferredAtomIds || [],
      protocolId: p.id
    });
  }

  Mobility.PROTOCOLS = PROTOCOLS;
  Mobility.PROTOCOLS_BY_ID = BY_ID;
  Mobility.protocolCatalog = {
    __registered: true,
    PROTOCOLS: PROTOCOLS,
    getProtocol: getProtocol,
    listProtocols: listProtocols,
    defaultForMode: defaultForMode,
    recommend: recommend,
    buildOptions: buildOptions
  };
})(typeof window !== 'undefined' ? window : globalThis);
