// heys_mobility_mode_engine_v1.js — режимы мобильности + контекст сборки.
//
// Данные режима: 7 режимов из METHODOLOGY ч.6 / CONSTRUCTOR_SPEC §4.
// Движок не хранит каталог упражнений; он задаёт purpose/autonomic/слоты и
// контекст валидаторов. Сборку атомов делает HEYS.Mobility.routineBuilder.
//
// Периодизация: мобильность НЕ строит макроцикл (как пальцы через
// kernel.periodization.buildWeeks/current). Используется только phase→load policy
// (periodizationAdvice → kernel.periodization.loadPolicy). Причина: мобильность —
// поддерживающая работа без мезоциклов peak/taper; недельный план сейчас плоский.
// Когда появится макроцикл — переходить на kernel.periodization целиком, не дублируя.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__modeEngineRegistered) return;
  Mobility.__modeEngineRegistered = true;

  const MODE_DEFS = {
    morning_tonify: {
      id: 'morning_tonify',
      label: 'Утро: тонус',
      purpose: 'prep',
      autonomic: 'tonify',
      timeOfDay: 'morning',
      warmupCompleted: true,
      slots: [
        { id: 'raise', block: 'A', atomIds: ['wu_locomotor', 'wu_pulse_raise'] },
        { id: 'mobilise', block: 'B' },
        { id: 'cars', block: 'G' },
        { id: 'breath_tonify', block: 'I', atomIds: ['breath_box_tonify'] }
      ],
      reasons: ['morning_fuller_warmup', 'autonomic_tonify']
    },
    pre_workout_ramp: {
      id: 'pre_workout_ramp',
      label: 'Перед тренировкой: RAMP',
      purpose: 'prep',
      autonomic: 'tonify',
      timeOfDay: 'day',
      beforePower: true,
      warmupCompleted: true,
      slots: [
        { id: 'raise', block: 'A' },
        { id: 'activate', block: 'C' },
        { id: 'mobilise', block: 'B' }
      ],
      reasons: ['ramp_raise_activate_mobilise', 'no_long_static_pre_power']
    },
    post_workout: {
      id: 'post_workout',
      label: 'После тренировки: восстановление',
      purpose: 'recover',
      autonomic: 'relax',
      timeOfDay: 'day',
      warmupCompleted: true,
      slots: [
        { id: 'smr', block: 'H' },
        { id: 'active_recovery', block: 'J', atomIds: ['recov_active_walk'] },
        { id: 'light_hold', block: 'D', atomIds: ['flex_relax_supine_comfort'] }
      ],
      reasons: ['comfort_not_supercompensation', 'recovery_relax']
    },
    develop_mobility: {
      id: 'develop_mobility',
      label: 'Развитие мобильности',
      purpose: 'develop',
      autonomic: 'neutral',
      timeOfDay: 'day',
      warmupCompleted: true,
      slots: [
        { id: 'static_develop', block: 'D', atomIds: ['flex_static_hamstring', 'flex_static_hipflexor', 'flex_static_calf'] },
        { id: 'pnf', block: 'E', atomIds: ['flex_pnf_hamstring_hr', 'flex_pnf_hipflexor_crac'] },
        { id: 'loaded_mobility', block: 'F', atomIds: ['loadmob_nordic_eccentric', 'loadmob_cossack_loaded_hold', 'loadmob_pails_rails_hip'] }
      ],
      reasons: ['develop_separate_from_warmup', 'full_warmup_before_endrange', 'active_rom_over_passive']
    },
    evening_relax: {
      id: 'evening_relax',
      label: 'Вечер: релакс',
      purpose: 'regulate',
      autonomic: 'relax',
      timeOfDay: 'evening',
      warmupCompleted: true,
      slots: [
        { id: 'breath_relax', block: 'I', atomIds: ['breath_cyclic_sigh', 'breath_resonant'] },
        { id: 'light_hold', block: 'D', atomIds: ['flex_relax_supine_comfort'] },
        { id: 'slow_smr', block: 'H', optional: true }
      ],
      reasons: ['autonomic_relax', 'sleep_downshift']
    },
    rehab: {
      id: 'rehab',
      label: 'Реабилитационная рамка',
      purpose: 'recover',
      autonomic: 'neutral',
      timeOfDay: 'day',
      strict: true,
      warmupCompleted: true,
      slots: [
        { id: 'cars', block: 'G' },
        { id: 'active_recovery', block: 'J', atomIds: ['recov_active_walk'] },
        { id: 'smr_safe', block: 'H', optional: true }
      ],
      reasons: ['rehab_strict_gates', 'pain_free_progression']
    },
    anti_sedentary: {
      id: 'anti_sedentary',
      label: 'Анти-седентарная пауза',
      purpose: 'prep',
      autonomic: 'tonify',
      timeOfDay: 'day',
      micro: true,
      warmupCompleted: true,
      slots: [
        { id: 'movement_snack', block: 'J', atomIds: ['recov_movement_snack'] },
        { id: 'mobilise', block: 'B' },
        { id: 'cars', block: 'G' }
      ],
      reasons: ['micro_over_episode', 'desk_stiffness']
    }
  };

  const MODE_IDS = Object.keys(MODE_DEFS);

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  function getMode(modeId) {
    return MODE_DEFS[modeId] ? clone(MODE_DEFS[modeId]) : null;
  }
  function listModes() {
    return MODE_IDS.map(function (id) { return getMode(id); });
  }
  function circadianAdjust(timeOfDay) {
    if (timeOfDay === 'morning') {
      return {
        timeOfDay: 'morning',
        warmupMultiplier: 1.25,
        endRangePolicy: 'warn_without_full_warmup',
        reason: 'утром ткани жёстче — глубокий end-range только после полной разминки'
      };
    }
    if (timeOfDay === 'evening') {
      return {
        timeOfDay: 'evening',
        warmupMultiplier: 1,
        endRangePolicy: 'prefer_develop_or_relax',
        reason: 'вечером податливость выше; развивающую работу удобнее ставить отдельно от силовой'
      };
    }
    return { timeOfDay: timeOfDay || 'day', warmupMultiplier: 1, endRangePolicy: 'neutral', reason: 'нейтральное время суток' };
  }
  function coldWaterAdvisory(input) {
    const ctx = input || {};
    if (ctx.coldWaterPlanned !== true) return null;
    if (ctx.afterAdaptiveStrength === true || ctx.trainingPhase === 'build') {
      return {
        level: 'warn',
        code: 'CWI.after_adaptive_strength',
        msg: 'холод после адаптивной силовой в фазу набора может глушить адаптацию'
      };
    }
    return {
      level: 'ok',
      code: 'CWI.freshness',
      msg: 'холод допустим, если приоритет — свежесть завтра, а не адаптация'
    };
  }
  function periodizationAdvice(input) {
    const ctx = input || {};
    const kp = HEYS.TrainingKernel && HEYS.TrainingKernel.periodization;
    if (kp && typeof kp.loadPolicy === 'function') {
      return kp.loadPolicy(ctx, {
        maintain: 'в пик/перед ключевой нагрузкой держим поддержание, без тяжёлой F-нагрузки',
        deload: 'deload: лёгкая мобильность, CARs, дыхание',
        develop: 'базовая фаза: можно развивать ROM отдельной сессией'
      });
    }
    const keyLoadSoon = typeof ctx.keyLoadWithinHours === 'number' &&
      isFinite(ctx.keyLoadWithinHours) &&
      ctx.keyLoadWithinHours <= 48;
    if (ctx.phase === 'peak' || keyLoadSoon) {
      return {
        focus: 'maintain',
        avoidHighTissueLoad: true,
        msg: 'в пик/перед ключевой нагрузкой держим поддержание, без тяжёлой F-нагрузки'
      };
    }
    if (ctx.phase === 'deload') {
      return {
        focus: 'deload',
        avoidHighTissueLoad: true,
        msg: 'deload: лёгкая мобильность, CARs, дыхание'
      };
    }
    return {
      focus: 'develop',
      avoidHighTissueLoad: false,
      msg: 'базовая фаза: можно развивать ROM отдельной сессией'
    };
  }
  function buildContext(mode, options) {
    const opts = options || {};
    const m = typeof mode === 'string' ? getMode(mode) : clone(mode || {});
    if (!m || !m.id) return null;
    const timeOfDay = opts.timeOfDay || m.timeOfDay || 'day';
    const period = periodizationAdvice(opts);
    return {
      mode: m.id,
      purpose: m.purpose,
      autonomic: m.autonomic,
      timeOfDay: timeOfDay,
      beforePower: opts.beforePower != null ? opts.beforePower : !!m.beforePower,
      warmupCompleted: opts.warmupCompleted != null ? opts.warmupCompleted : !!m.warmupCompleted,
      strict: !!m.strict,
      painFlags: opts.painFlags || [],
      contraindications: opts.contraindications || [],
      acuteInjuryZone: opts.acuteInjuryZone || null,
      activePain: opts.activePain === true,
      periodization: period,
      avoidHighTissueLoad: opts.avoidHighTissueLoad != null ? !!opts.avoidHighTissueLoad : !!period.avoidHighTissueLoad,
      circadian: circadianAdjust(timeOfDay),
      coldWater: coldWaterAdvisory(opts)
    };
  }
  function buildSession(modeId, profile, options) {
    if (!Mobility.routineBuilder || typeof Mobility.routineBuilder.buildSession !== 'function') {
      throw new Error('HEYS.Mobility.routineBuilder не загружен');
    }
    return Mobility.routineBuilder.buildSession(modeId, profile, options || {});
  }

  Mobility.modeEngine = {
    __registered: true,
    MODE_DEFS: MODE_DEFS,
    MODE_IDS: MODE_IDS,
    getMode: getMode,
    listModes: listModes,
    buildContext: buildContext,
    buildSession: buildSession,
    circadianAdjust: circadianAdjust,
    coldWaterAdvisory: coldWaterAdvisory,
    periodizationAdvice: periodizationAdvice
  };
})(typeof window !== 'undefined' ? window : globalThis);
