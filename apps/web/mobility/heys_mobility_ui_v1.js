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

  const DEFAULT_PROFILE = {
    age: 30,
    level: 'beginner',
    populations: [],
    equipment: ['band', 'strap'],
    goal: 'morning',
    acceptedDisclaimer: true
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
    anti_sedentary: 'Пауза'
  };
  const GOAL_LABEL = {
    morning: 'Утренний тонус',
    pre_workout: 'Перед нагрузкой',
    recover: 'После нагрузки',
    develop: 'Развитие диапазона',
    relax: 'Вечернее расслабление',
    rehab: 'Дозированное восстановление',
    desk: 'Пауза от сидения'
  };
  const GOAL_SHORT_LABEL = {
    morning: 'Утро',
    pre_workout: 'Нагрузка',
    recover: 'Восстановление',
    develop: 'Диапазон',
    relax: 'Вечер',
    rehab: 'Реабилитация',
    desk: 'Пауза'
  };
  const GOAL_EMOJI = {
    morning: '🌤',
    pre_workout: '⚡',
    recover: '🌿',
    develop: '📈',
    relax: '🌙',
    rehab: '🧩',
    desk: '🪑'
  };
  const GOAL_TO_MODE = {
    morning: 'morning_tonify',
    pre_workout: 'pre_workout_ramp',
    recover: 'post_workout',
    develop: 'develop_mobility',
    relax: 'evening_relax',
    rehab: 'rehab',
    desk: 'anti_sedentary'
  };
  const EQUIPMENT_LABEL = {
    band: 'Резинка',
    strap: 'Ремень',
    foam_roll: 'Ролл',
    ball: 'Мяч',
    percussion: 'Массажёр',
    bolster: 'Болстер'
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
    regulate: 'Регуляция'
  };
  const AUTONOMIC_LABEL = {
    tonify: 'Тонус',
    neutral: 'Нейтрально',
    relax: 'Расслабление'
  };
  const AXIS_LABEL = {
    passive_flex: 'Пассивная гибкость',
    active_rom: 'Активный ROM',
    motor_control: 'Контроль',
    tissue_prep: 'Разогрев ткани',
    autonomic: 'Автономика',
    recovery: 'Восстановление',
    joint_stability: 'Стабильность',
    strength_endrange: 'Сила в диапазоне',
    habit_break: 'Пауза от сидения'
  };
  const PROGRESSION_REASON_LABEL = {
    no_atom: 'Нет атома для подсказки',
    pain_or_low_readiness: 'Боль или низкая готовность: снизить интенсивность',
    plateau_detected: 'Прогресс остановился: смените ось нагрузки',
    low_dose_confidence: 'Доза с низкой уверенностью: не наращивайте объём автоматически',
    minimum_effective_dose_first: 'Сначала держите минимально достаточную дозу'
  };
  const REASON_LABEL = {
    morning_fuller_warmup: 'Утром нужен более полный разогрев',
    autonomic_tonify: 'Сессия собрана под тонус',
    ramp_raise_activate_mobilise: 'Перед нагрузкой: разогреть, активировать, мобилизовать',
    no_long_static_pre_power: 'Долгая статика не ставится перед мощной работой',
    comfort_not_supercompensation: 'После нагрузки цель — комфорт, не дополнительный стресс',
    recovery_relax: 'Восстановительный режим снижает возбуждение',
    develop_separate_from_warmup: 'Развитие диапазона отделено от разминки',
    full_warmup_before_endrange: 'Перед конечным диапазоном нужен разогрев',
    active_rom_over_passive: 'Приоритет активного контроля, не только пассивной амплитуды',
    autonomic_relax: 'Сессия собрана под расслабление',
    sleep_downshift: 'Темп и дыхание помогают снизить возбуждение',
    rehab_strict_gates: 'Реабилитационная рамка использует строгие ограничения',
    pain_free_progression: 'Прогрессия только без боли',
    micro_over_episode: 'Короткие регулярные паузы важнее редкой длинной сессии',
    desk_stiffness: 'Учтена скованность от сидения',
    population_desk_thoracic_hip: 'Акцент на грудной отдел и тазобедренные',
    population_hypermobile_stability: 'Приоритет контролю и стабильности',
    population_pregnancy_low_load: 'Беременность: низкая нагрузка и мягкий объём',
    population_older_low_load: 'Возрастной профиль: низкая нагрузка и мягкий объём',
    morning_more_warmup: 'Утром разогрев длиннее, конечный диапазон осторожнее',
    day_neutral: 'Дневной режим без циркадного ограничения',
    evening_relax_bias: 'Вечером приоритет расслабления'
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
.mobility-app{width:100%;max-width:720px;margin:0 auto;padding:calc(env(safe-area-inset-top,16px) + 48px) 24px calc(28px + env(safe-area-inset-bottom))}
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
.mobility-save-status{margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#dcfce7;color:#166534;font-size:13px;font-weight:800}
.mobility-fs-session{min-height:100%;display:flex;flex-direction:column;gap:0}
.mobility-fs__header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.mobility-fs__header-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-left:auto}
.mobility-fs__header h1,.mobility-fs__title{font-size:23px!important;font-weight:800!important;margin:0!important;line-height:1.15!important;color:#172033!important;letter-spacing:0!important;white-space:nowrap}
.mobility-fs__icon-btn{appearance:none;width:48px;height:48px;border:1px solid rgba(15,23,42,.08);border-radius:12px;background:#fff;color:#172033;font:900 18px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 6px 18px rgba(15,23,42,.07);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.mobility-fs__icon-btn--close{color:#ec4899;background:#fff5f8;border-color:#fecdd3}
.mobility-fs__eyebrow{margin:0 0 4px;color:#16a66a;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.mobility-fs__sub{max-width:620px;margin:6px 0 0;color:#667085;font-size:14px;line-height:1.35}
.mobility-fs__score{min-width:84px;border-radius:8px;padding:9px 10px;background:#e7f4ee;color:#0f6b43;text-align:center;font-weight:900;box-shadow:0 8px 20px rgba(15,107,67,.1)}
.mobility-fs__score small{display:block;color:#47745d;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.mobility-fs-tabs{display:flex;justify-content:space-between;gap:2px;padding:4px;background:rgba(120,120,128,.10);border:.5px solid rgba(0,0,0,.04);border-radius:14px;margin-bottom:18px;box-shadow:inset 0 1px 2px rgba(0,0,0,.03);overflow-x:auto;scrollbar-width:none}
.mobility-fs-tabs::-webkit-scrollbar{display:none}
.mobility-fs-tab{appearance:none;flex:1 1 auto;min-width:62px;padding:9px 4px 8px;border:0;border-radius:10px;background:transparent;color:rgba(60,60,67,.78);font:600 11.5px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;cursor:pointer;white-space:normal;word-break:keep-all;display:flex;flex-direction:column;align-items:center;gap:2px}
.mobility-fs-tab__icon{font-size:18px;line-height:1}
.mobility-fs-tab__label{font-size:11.5px;line-height:1.15}
.mobility-fs-tab--active,.mobility-fs-tab.is-active{background:linear-gradient(180deg,#fff 0%,#f7f8fb 100%);color:#0f172a;font-weight:800;box-shadow:0 1px 1px rgba(0,0,0,.04),0 4px 10px rgba(15,23,42,.10),inset 0 .5px 0 rgba(255,255,255,.9)}
.mobility-fs-equipment{margin:0 0 16px}
.mobility-fs-equipment,.mobility-fs-equipment__row{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.mobility-fs-equipment::-webkit-scrollbar,.mobility-fs-equipment__row::-webkit-scrollbar{display:none}
.mobility-fs-equipment-chip{appearance:none;min-height:58px;min-width:74px;border:1px solid rgba(15,23,42,.08);border-radius:12px;background:#fff;color:#334155;font:800 12px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;box-shadow:0 6px 18px rgba(15,23,42,.05);cursor:pointer}
.mobility-fs-equipment-chip.is-available{border-color:#16a66a;background:#e9f8f1;color:#0f6b43;box-shadow:0 0 0 2px rgba(22,166,106,.12)}
.mobility-fs-goalsel{margin:0 0 18px}
.mobility-fs-goalsel__label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#667085;margin:0 0 8px}
.mobility-fs-goalsel__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.mobility-fs-goalsel__btn{appearance:none;position:relative;min-height:62px;border:1px solid rgba(15,23,42,.08);border-radius:12px;background:#fff;color:#172033;font:800 12px/1.15 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 6px 18px rgba(15,23,42,.05);cursor:pointer}
.mobility-fs-goalsel__btn.is-active{background:linear-gradient(135deg,#16a66a,#0f6b43);color:#fff;border-color:#16a66a;box-shadow:0 10px 24px rgba(15,107,67,.22)}
.mobility-fs-goalsel__emoji{font-size:17px;line-height:1}
.mobility-fs-goalsel__text{font-size:12px;line-height:1.15}
.mobility-fs-goalsel__count{position:absolute;top:7px;right:7px;min-width:19px;height:19px;border-radius:999px;background:rgba(15,23,42,.08);color:inherit;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center}
.mobility-fs-goalsel__btn.is-active .mobility-fs-goalsel__count{background:rgba(255,255,255,.25)}
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
.mobility-fs-mixcard__exrow{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;background:#f8fbfa;border:1px solid rgba(15,23,42,.06)}
.mobility-fs-mixcard__exthumb{width:46px;height:46px;border-radius:10px;overflow:hidden;background:#e7f4ee;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.mobility-fs-mixcard__exthumb img{width:46px;height:46px;object-fit:cover;display:block}
.mobility-fs-mixcard__exinfo{min-width:0;display:flex;flex-direction:column;gap:2px}
.mobility-fs-mixcard__exname{color:#172033;font-size:13px;font-weight:900;line-height:1.2}
.mobility-fs-mixcard__exsub{color:#667085;font-size:12px;font-weight:700;line-height:1.2}
.mobility-fs-mixcard__actions{display:flex;gap:8px;margin-top:12px}
.mobility-fs-mixcard__btn{appearance:none;border:0;border-radius:12px;padding:12px 14px;font:900 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
.mobility-fs-mixcard__btn--reroll{width:48px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
.mobility-fs-mixcard__btn--secondary{background:#f8fafc;color:#334155;border:1px solid rgba(15,23,42,.08)}
.mobility-fs-mixcard__btn--launch{flex:1;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;box-shadow:0 10px 24px rgba(249,115,22,.22)}
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
.mobility-fs-registry__footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(15,23,42,.07)}
.mobility-fs-registry__footer-text{color:#667085;font-size:12px;font-weight:850}
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
@media (max-width:760px){
  .mobility-overlay-root{background:#f6faf8;backdrop-filter:none;-webkit-backdrop-filter:none}
  .mobility-app{padding:calc(env(safe-area-inset-top,16px) + 48px) 10px calc(28px + env(safe-area-inset-bottom))}
  .mobility-app__layout{display:block}
  .mobility-panel{padding:12px;margin-bottom:10px}
  .mobility-mode-grid,.mobility-blocks,.mobility-effects__grid{grid-template-columns:1fr}
  .mobility-checks{grid-template-columns:1fr}
  .mobility-assessment-row{grid-template-columns:1fr 1fr;align-items:start}
  .mobility-assessment-row>span{grid-column:1/-1}
  .mobility-fs__header{align-items:flex-start}
  .mobility-fs__title{font-size:24px}
  .mobility-fs-tabs{top:58px;margin-left:-10px;margin-right:-10px;padding-left:10px;padding-right:10px}
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
}
`;
    doc.head.appendChild(style);
  }
  ensureMobilityStyles();

  function cx() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
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
      protocolCatalog: Mobility.protocolCatalog,
      recordsStore: Mobility.recordsStore,
      validators: Mobility.validators
    };
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
  function reasonText(reason) {
    return REASON_LABEL[reason] || reason;
  }
  function formatDose(atom) {
    const d = (atom && atom.dose) || {};
    if (atom.doseShape === 'hold') return (d.holdSec || 0) + ' сек';
    if (atom.doseShape === 'pnf') return (d.reps || 1) + ' цикла';
    if (atom.doseShape === 'breath') return Math.round((d.durationSec || 0) / 60) + ' мин';
    if (atom.doseShape === 'dynamic' || atom.doseShape === 'activation' || atom.doseShape === 'cars') {
      return Array.isArray(d.reps) ? d.reps[0] + '-' + d.reps[1] + ' повт.' : (d.reps || 1) + ' повт.';
    }
    if (d.durationSec) return Math.round(d.durationSec / 60) + ' мин';
    return atom.doseShape;
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
            h('p', null, e.msg)
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
        alt: 'Фото упражнения: ' + (atom.title || atom.id),
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

    return h('section', { className: 'mobility-panel mobility-profile', 'aria-label': 'Профиль' },
      h('h3', null, 'Профиль'),
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
      h('div', { className: 'mobility-checks', 'aria-label': 'Флаги популяции' },
        onboarding.POPULATIONS.map(function (id) {
          return h('label', { key: id },
            h('input', {
              type: 'checkbox',
              checked: profile.populations.indexOf(id) >= 0,
              onChange: function () { toggle('populations', id); }
            }),
            id
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
            id
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
            return h('li', { key: i.code, 'data-level': i.level }, i.msg);
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
      ['soreness', 'Болезненность'],
      ['sleepQuality', 'Сон'],
      ['stress', 'Стресс'],
      ['hrvToday', 'HRV сегодня'],
      ['hrvBaseline', 'HRV база'],
      ['hrvMad', 'HRV MAD']
    ];
    function update(name, value) {
      props.onChange && props.onChange(Object.assign({}, input, { [name]: numberOrNull(value) }));
    }
    return h('section', { className: 'mobility-panel mobility-readiness', 'data-band': score.band },
      h('h3', null, 'Готовность'),
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
    return h('section', { className: 'mobility-panel mobility-assessment', 'aria-label': 'Аудит подвижности' },
      h('h3', null, 'Аудит подвижности'),
      audit && audit.leadingLimiter
        ? h('div', { className: 'mobility-limiter' },
            chip('limiter', audit.leadingLimiter.jointRegion),
            chip('type', audit.leadingLimiter.type),
            h('p', null, audit.leadingLimiter.reason)
          )
        : h('p', null, 'Лимитер не выбран'),
      h('div', { className: 'mobility-assessment__rows' },
        screens.map(function (row, idx) {
          const test = assessment && assessment.TESTS ? assessment.TESTS[row.testId] : null;
          const scored = audit && audit.rows ? audit.rows.find(function (r) { return r.testId === row.testId; }) : null;
          return h('div', { key: row.testId || idx, className: 'mobility-assessment-row' },
            h('span', null, row.testId, test ? ' · норма ' + test.norm + test.unit : ''),
            h('label', null,
              h('span', null, 'Замер'),
              h('input', {
                'aria-label': row.testId + ' замер',
                type: 'number',
                value: row.measure == null ? '' : row.measure,
                onChange: function (e) { updateRow(idx, { measure: numberOrNull(e.target.value) }); }
              })
            ),
            h('label', null,
              h('span', null, 'Активно'),
              h('input', {
                'aria-label': row.testId + ' активно',
                type: 'number',
                value: row.activeROM == null ? '' : row.activeROM,
                onChange: function (e) { updateRow(idx, { activeROM: numberOrNull(e.target.value) }); }
              })
            ),
            h('label', null,
              h('span', null, 'Пассивно'),
              h('input', {
                'aria-label': row.testId + ' пассивно',
                type: 'number',
                value: row.passiveROM == null ? '' : row.passiveROM,
                onChange: function (e) { updateRow(idx, { passiveROM: numberOrNull(e.target.value) }); }
              })
            ),
            scored && scored.ok ? h('strong', null, Math.round(scored.deficit * 100), '%') : h('small', null, 'нет замера')
          );
        })
      ),
      props.onSaveAssessment
        ? h('button', { type: 'button', onClick: function () { props.onSaveAssessment(audit); } }, 'Сохранить аудит')
        : null
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
    const firstAtom = props.built && props.built.session && props.built.session.blocks && props.built.session.blocks[0]
      ? props.built.session.blocks[0].atoms[0]
      : null;
    const readinessScore = d.readiness ? d.readiness.score(props.readinessInput || {}) : null;
    const suggestion = progression && firstAtom ? progression.suggest(firstAtom, props.progressionHistory || {}, readinessScore) : null;
    const [manualAxis, setManualAxis] = useState(suggestion && suggestion.axis || 'amplitude');

    return h('section', { className: 'mobility-panel mobility-progress', 'aria-label': 'Прогресс ROM' },
      h('h3', null, 'Прогресс ROM'),
      h('div', { className: 'mobility-progress__meta' },
        chip(retestDue ? 'warn' : 'ok', retestDue ? 'нужен ретест' : 'ретест не нужен'),
        latestDate ? chip('date', latestDate.slice(0, 10)) : chip('empty', 'нет истории')
      ),
      trends.length
        ? h('div', { className: 'mobility-progress__rows' },
            trends.map(function (t) {
              return h('div', { key: t.testId, className: 'mobility-progress-row', 'data-direction': t.direction },
                h('span', null, t.testId),
                h('strong', null, (t.delta > 0 ? '+' : '') + Math.round(t.delta * 10) / 10, t.unit),
                h('small', null, Math.round(t.latest * 10) / 10, t.unit)
              );
            }))
        : h('p', null, 'После двух замеров появится динамика по тестам'),
      suggestion
        ? h('div', { className: 'mobility-progression-advice', 'data-action': suggestion.action },
            h('h4', null, 'Подсказка прогрессии'),
            h('p', null, PROGRESSION_REASON_LABEL[suggestion.reason] || suggestion.reason),
            h('label', null,
              h('span', null, 'Ось прогрессии'),
              h('select', {
                'aria-label': 'Ось прогрессии',
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
    return h('section', { className: 'mobility-panel mobility-calendar', 'aria-label': 'План недели' },
      h('h3', null, 'План недели'),
      h('div', { className: 'mobility-calendar__meta' },
        chip('focus', plan.focus),
        plan.retest && plan.retest.due ? chip('warn', 'ретест') : chip('ok', 'ретест позже')
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
      return h('section', { className: 'mobility-panel mobility-session' }, h('p', null, 'Сессия не собрана'));
    }
    const session = built.session;
    return h('section', { className: 'mobility-panel mobility-session', 'aria-label': 'Сессия' },
      h('div', { className: 'mobility-session__head' },
        h('h3', null, MODE_LABEL[session.mode] || session.mode),
        h('div', { className: 'mobility-session__chips' },
          chip('purpose', PURPOSE_LABEL[session.purpose] || session.purpose),
          chip('autonomic', AUTONOMIC_LABEL[session.autonomic] || session.autonomic),
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
            built.issues.map(function (i, idx) { return h('li', { key: i.code + idx, 'data-level': i.level }, i.code, ': ', i.msg); }))
        : null,
      session.advisories && session.advisories.length
        ? h('ul', { className: 'mobility-advisories', 'aria-label': 'Подсказки' },
            session.advisories.map(function (a, idx) {
              return h('li', { key: a.code + idx, 'data-level': a.level || 'info' }, a.code, ': ', a.msg);
            }))
        : null,
      props.onSaveSession
        ? h('button', { type: 'button', onClick: props.onSaveSession }, 'Сохранить сессию')
        : null,
      h('div', { className: 'mobility-blocks' },
        session.blocks.map(function (b) {
          const atom = b.atoms[0];
          return h('article', { key: b.id, className: 'mobility-block' },
            h(AtomVisual, { atom: atom }),
            h('div', { className: 'mobility-block__top' },
              h('strong', null, atom.title || atom.id),
              chip('axis', AXIS_LABEL[atom.axis] || atom.axis)
            ),
            h('p', { className: 'mobility-block__instruction' }, atom.instruction || ''),
            atom.cues && atom.cues.length
              ? h('ul', { className: 'mobility-block__cues' },
                  atom.cues.slice(0, 3).map(function (cue) { return h('li', { key: cue }, cue); }))
              : null,
            h('div', { className: 'mobility-block__dose' },
              formatDose(atom),
              atom.doseConfidence ? chip('confidence', 'Доза ' + atom.doseConfidence) : null
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
        chip('steps', plan.totalSteps + ' шагов'),
        chip('duration', Math.round((plan.estimatedDurationSec || 0) / 60) + ' мин')
      ),
      h('ol', null,
        plan.steps.slice(0, 12).map(function (s, idx) {
          return h('li', { key: idx },
            h('strong', null, s.label),
            s.durationSec ? h('span', null, ' · ', s.durationSec, ' сек') : null,
            s.reps ? h('span', null, ' · ', Array.isArray(s.reps) ? s.reps.join('-') : s.reps, ' повт.') : null
          );
        })
      )
    );
  }

  function stepMetric(step) {
    if (!step) return '—';
    if (step.durationSec) return step.durationSec + ' сек';
    if (step.reps) return Array.isArray(step.reps) ? step.reps.join('-') + ' повт.' : step.reps + ' повт.';
    return step.kind || 'шаг';
  }

  function ExecutionPanel(props) {
    const runner = deps().routineRunner;
    const plan = props.plan;
    const [state, setState] = useState(function () {
      return runner && plan ? runner.createState(plan) : { status: 'idle', index: 0, totalSteps: 0, aborted: false };
    });
    if (!runner || !plan || !plan.steps || !plan.steps.length) return null;
    const current = plan.steps[Math.min(state.index, plan.steps.length - 1)] || plan.steps[0];
    const currentAtom = atomForStep(current);
    const progress = plan.steps.length ? Math.round(((state.index + 1) / plan.steps.length) * 100) : 0;
    function send(event) {
      setState(function (s) { return runner.transition(s, event); });
    }
    return h('section', { className: 'mobility-panel mobility-execution mobility-guided', 'aria-label': 'Ведомая тренировка' },
      h('div', { className: 'mobility-guided__hero' },
        h('div', { className: 'mobility-guided__visual' },
          currentAtom && currentAtom.visualAsset
            ? h('img', {
                src: currentAtom.visualAsset,
                alt: 'Фото упражнения: ' + (currentAtom.title || current.label),
                loading: 'lazy',
                decoding: 'async'
              })
            : h('div', { className: 'mobility-guided__fallback', 'aria-hidden': 'true' }, 'M')
        ),
        h('div', { className: 'mobility-guided__body' },
          h('div', { className: 'mobility-guided__kicker' }, 'Ведомая тренировка'),
          h('h3', { className: 'mobility-guided__title' }, currentAtom && currentAtom.title || current.label),
          h('p', { className: 'mobility-guided__instruction' }, current.instruction || currentAtom && currentAtom.instruction || ''),
          h('div', { className: 'mobility-guided__metric' },
            h('div', null, h('strong', null, stepMetric(current)), h('span', null, 'доза')),
            h('div', null, h('strong', null, (state.index + 1) + '/' + plan.steps.length), h('span', null, 'шаг')),
            h('div', null, h('strong', null, state.status), h('span', null, 'статус'))
          ),
          h('div', { className: 'mobility-guided__progress', 'aria-label': 'Прогресс тренировки' },
            h('span', { style: { width: progress + '%' } })
          ),
          current.breath && current.breath.phases
            ? h('ol', { className: 'mobility-breath-phases', 'aria-label': 'Фазы дыхания' },
                current.breath.phases.map(function (p, idx) {
                  return h('li', { key: p.type + idx, 'data-phase': p.type }, p.label, ' ', p.durationSec, ' сек');
                }))
            : null,
          h('div', { className: 'mobility-guided__controls' },
            state.status === 'idle' ? h('button', { type: 'button', onClick: function () { send('start'); } }, 'Старт') : null,
            state.status === 'running' ? h('button', { type: 'button', onClick: function () { send('pause'); } }, 'Пауза') : null,
            state.status === 'paused' ? h('button', { type: 'button', onClick: function () { send('resume'); } }, 'Продолжить') : null,
            h('button', { type: 'button', onClick: function () { send('next'); } }, 'Дальше'),
            props.onPain ? h('button', { type: 'button', onClick: function () { props.onPain(current); } }, 'Отметить боль') : null,
            h('button', { type: 'button', onClick: function () { send('abort'); } }, 'Стоп')
          )
        )
      ),
      h('div', { className: 'mobility-execution__status', 'data-status': state.status, style: { display: 'none' } }),
      h('div', { className: 'mobility-guided__list', 'aria-label': 'Шаги тренировки' },
        plan.steps.slice(0, 8).map(function (s, idx) {
          const atom = atomForStep(s);
          return h('div', {
            key: idx,
            className: 'mobility-guided-step' + (idx === state.index ? ' is-current' : '') + (idx < state.index ? ' is-done' : '')
          },
            h('span', null, idx + 1, '. ', atom && atom.title || s.label),
            h('strong', null, stepMetric(s))
          );
        })
      )
    );
  }

  function ProtocolsPanel(props) {
    const protocols = deps().protocolCatalog;
    if (!protocols || typeof protocols.listProtocols !== 'function') return null;
    const items = protocols.listProtocols({});
    return h('section', { className: 'mobility-panel mobility-protocols', 'aria-label': 'Протоколы' },
      h('h3', null, 'Протоколы'),
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
              h('h4', null, p.name),
              chip('duration', duration)
            ),
            h('p', null, p.intent),
            h('div', { className: 'mobility-protocol-card__tags' },
              (p.tags || []).slice(0, 3).map(function (tag) { return chip('tag', tag, p.id + ':' + tag); })
            )
          );
        })
      )
    );
  }

  function GoalStepPanel(props) {
    const profile = normalizeProfile(props.profile);
    const goals = ['morning', 'pre_workout', 'recover', 'develop', 'relax', 'desk'];
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
            h('span', { className: 'mobility-fs-goalsel__emoji', 'aria-hidden': 'true' }, GOAL_EMOJI[goal] || '🎯'),
            h('span', { className: 'mobility-fs-goalsel__text' }, GOAL_SHORT_LABEL[goal] || GOAL_LABEL[goal] || goal),
            h('span', { className: 'mobility-fs-goalsel__count', 'aria-label': cnt + ' протоколов' }, cnt)
          );
        })
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
            h('span', { 'aria-hidden': 'true' }, selected ? '✓' : '+'),
            h('span', { 'aria-hidden': 'true' }, EQUIPMENT_ICON[id] || '·'),
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
          h('strong', null, 'Быстрый микс'),
          h('span', null, '5-12 подходящих шагов под цель и ограничения')
        ),
        h('button', {
          type: 'button',
          className: 'mobility-action-card' + (props.value === 'protocol' ? ' is-selected' : ''),
          onClick: props.onOpenProtocols
        },
          h('span', { className: 'mobility-action-card__icon', 'aria-hidden': 'true' }, '▦'),
          h('strong', null, 'По протоколу'),
          h('span', null, 'готовая структура: утро, RAMP, восстановление')
        ),
        h('button', {
          type: 'button',
          className: 'mobility-action-card' + (props.value === 'custom' ? ' is-selected' : ''),
          onClick: props.onOpenConstructor
        },
          h('span', { className: 'mobility-action-card__icon', 'aria-hidden': 'true' }, '+'),
          h('strong', null, 'Своя сборка'),
          h('span', null, 'выбрать упражнения руками и запустить сопровождение')
        )
      )
    );
  }

  function ConstructorPanel(props) {
    const catalog = Mobility.atomCatalog;
    const atoms = catalog && Array.isArray(catalog.ATOMS) ? catalog.ATOMS : [];
    const selected = Array.isArray(props.selectedAtomIds) ? props.selectedAtomIds : [];
    function toggle(id) {
      const next = selected.indexOf(id) >= 0
        ? selected.filter(function (x) { return x !== id; })
        : selected.concat([id]);
      props.onChange && props.onChange(next);
    }
    return h('section', { className: 'mobility-panel mobility-constructor', 'aria-label': 'Конструктор упражнений' },
      h('h3', null, 'Конструктор'),
      h('p', null, 'Выберите упражнения, затем запустите сопровождение. Safety-гейты всё равно применяются.'),
      h('div', { className: 'mobility-constructor-grid' },
        atoms.map(function (atom) {
          const isSelected = selected.indexOf(atom.id) >= 0;
          return h('button', {
            key: atom.id,
            type: 'button',
            className: 'mobility-exercise-card' + (isSelected ? ' is-selected' : ''),
            onClick: function () { toggle(atom.id); }
          },
            h('div', { className: 'mobility-exercise-card__top' },
              h('strong', null, atom.title || atom.id),
              chip('axis', AXIS_LABEL[atom.axis] || atom.axis)
            ),
            h('span', null, formatDose(atom), ' · ', PURPOSE_LABEL[atom.purpose] || atom.purpose)
          );
        })
      ),
      h('div', { className: 'mobility-constructor-actions' },
        h('button', {
          type: 'button',
          onClick: function () { props.onStart && props.onStart(selected.slice()); },
          disabled: selected.length === 0
        }, 'Запустить свою'),
        selected.length ? h('button', { type: 'button', onClick: function () { props.onChange && props.onChange([]); } }, 'Очистить') : null,
        selected.length ? chip('ok', selected.length + ' выбрано') : chip('warn', 'ничего не выбрано')
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
        title: 'Все упражнения',
        subtitle: atoms.length + ' атомов · фото, доза и назначение',
        items: atoms.map(function (atom) {
          return {
            id: atom.id,
            title: atom.title || atom.id,
            image: atom.visualAsset || '',
            imageAlt: 'Фото упражнения: ' + (atom.title || atom.id),
            icon: '↕',
            meta: formatDose(atom) + ' · ' + (PURPOSE_LABEL[atom.purpose] || atom.purpose),
            chips: [
              AXIS_LABEL[atom.axis] || atom.axis,
              atom.modality || atom.block || atom.doseShape
            ].filter(Boolean)
          };
        }),
        selectedIds: selected,
        addLabel: 'Добавить',
        removeLabel: 'Убрать',
        footerText: selected.length ? selected.length + ' выбрано' : 'ничего не выбрано',
        footerAction: {
          label: selected.length ? 'Открыть свою сборку' : 'Перейти в свою сборку',
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
        'aria-label': 'Все упражнения'
      },
        h('div', { className: 'mobility-registry-head' },
          h('div', null,
            h('h3', null, 'Все упражнения'),
            h('p', null, atoms.length, ' атомов · можно добавить в свою сборку')
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
                h('strong', null, atom.title || atom.id),
                chip('axis', AXIS_LABEL[atom.axis] || atom.axis)
              ),
              h('span', null, formatDose(atom), ' · ', PURPOSE_LABEL[atom.purpose] || atom.purpose),
              h('button', {
                type: 'button',
                onClick: function () { toggle(atom.id); }
              }, isSelected ? 'Убрать из своей' : 'Добавить в свою')
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
          }, selected.length ? 'Открыть свою сборку' : 'Перейти в свою сборку'),
          selected.length ? chip('ok', selected.length + ' выбрано') : chip('warn', 'ничего не выбрано')
        )
      )
    );
  }

  function buildCustomBuilt(atomIds, modeId, profile, options) {
    const d = deps();
    if (!d.modeEngine || !d.validators || !Mobility.atomCatalog) return null;
    const mode = d.modeEngine.getMode(modeId) || { id: modeId, purpose: 'prep', autonomic: 'neutral' };
    const context = d.modeEngine.buildContext(mode, options || {});
    const atoms = (atomIds || []).map(function (id) { return Mobility.atomCatalog.getAtom(id); }).filter(Boolean);
    if (!atoms.length) return null;
    const blocks = atoms.map(function (atom, idx) {
      return {
        id: 'custom_' + idx,
        name: atom.title || atom.id,
        axis: atom.axis,
        purpose: atom.purpose,
        autonomic: atom.autonomic,
        fatigueCost: atom.fatigueCost || 'low',
        tissueLoad: atom.tissueLoad || 'low',
        atoms: [atom]
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
      blocks: blocks,
      painFlags: context && context.painFlags || [],
      reasons: ['custom_selection'],
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
    const sub = (PURPOSE_LABEL[selectedMode.purpose] || 'Подбор') + ' · ' + (AUTONOMIC_LABEL[selectedMode.autonomic] || 'нейтрально');
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
        issueCount ? h('div', { className: 'mobility-fs-today__reason' }, issueCount + ' огранич. — safety-гейты учтены') : null
      )
    );
  }

  function ExercisePreviewList(props) {
    const atoms = (props.atoms || []).slice(0, props.limit || 4);
    if (!atoms.length) return null;
    return h('div', { className: 'mobility-fs-mixcard__exlist', 'aria-label': 'Упражнения в сессии' },
      h('div', { className: 'mobility-fs-mixcard__exlist-title' }, 'Что внутри'),
      atoms.map(function (atom) {
        return h('div', { key: atom.id, className: 'mobility-fs-mixcard__exrow' },
          h('div', { className: 'mobility-fs-mixcard__exthumb' },
            atom.visualAsset
              ? h('img', { src: atom.visualAsset, alt: '', loading: 'lazy', decoding: 'async' })
              : h('span', { className: 'mobility-fs-mixcard__exemoji', 'aria-hidden': 'true' }, 'M')
          ),
          h('div', { className: 'mobility-fs-mixcard__exinfo' },
            h('span', { className: 'mobility-fs-mixcard__exname' }, atom.title || atom.id),
            h('span', { className: 'mobility-fs-mixcard__exsub' }, formatDose(atom), ' · ', PURPOSE_LABEL[atom.purpose] || atom.purpose)
          )
        );
      })
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
      h('div', { className: 'mobility-fs-mixcard__hint' },
        h('span', { 'aria-hidden': 'true' }, '🧬 '),
        'Сессия по методологии под цель и готовность. Кнопка ↻ даст другой равноценный набор.'
      ),
      h('div', { className: 'mobility-fs-mixcard__inner' },
        h('div', { className: 'mobility-fs-mixcard__head-row' },
          h('div', { className: 'mobility-fs-mixcard__badge' },
            h('span', { 'aria-hidden': 'true' }, '🎲'),
            ' Микс'
          ),
          h('div', { className: 'mobility-fs-mixcard__goalhint' }, 'под цель «' + goalLabel + '»')
        ),
        h('h3', { className: 'mobility-fs-mixcard__title' }, 'Сессия по методологии'),
        h('p', { className: 'mobility-fs-mixcard__desc' },
          'Подобрана из безопасных упражнений с учётом цели, инвентаря и ограничений.'
        ),
        h('div', { className: 'mobility-fs-mixcard__chips' },
          chip('purpose', built && built.session ? PURPOSE_LABEL[built.session.purpose] || built.session.purpose : 'подбор'),
          durationMin ? chip('duration', durationMin + ' мин') : null,
          chip('steps', blockCount + ' упр')
        ),
        h(ExercisePreviewList, { atoms: atoms, limit: 4 }),
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
          }, 'Запустить микс')
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
      h('h3', { className: 'mobility-fs-program-card__title' }, protocol.name),
      h('p', { className: 'mobility-fs-program-card__desc' }, protocol.intent),
      h('div', { className: 'mobility-fs-mixcard__chips' },
        chip('purpose', MODE_LABEL[protocol.modeId] || protocol.modeId),
        duration ? chip('duration', duration) : null
      ),
      h('div', { className: 'mobility-fs-mixcard__actions' },
        h('button', {
          type: 'button',
          className: 'mobility-fs-mixcard__btn mobility-fs-mixcard__btn--secondary',
          onClick: props.onOpenProtocols
        }, 'Все протоколы'),
        h('button', {
          type: 'button',
          className: 'mobility-fs-mixcard__btn mobility-fs-mixcard__btn--launch',
          onClick: function () { props.onLaunch && props.onLaunch(protocol); }
        }, 'Запустить протокол')
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
    const [saveStatus, setSaveStatus] = useState(null);
    const [activeTab, setActiveTab] = useState('today');
    const [flowMode, setFlowMode] = useState('choose');
    const [mixSeed, setMixSeed] = useState(0);
    const [customAtomIds, setCustomAtomIds] = useState([]);
    const [customRunAtomIds, setCustomRunAtomIds] = useState([]);
    const [showRegistry, setShowRegistry] = useState(false);
    const [showSources, setShowSources] = useState(false);
    const selectedProtocol = d.protocolCatalog && protocolId ? d.protocolCatalog.getProtocol(protocolId) : null;
    const profileForBuild = selectedProtocol && selectedProtocol.profilePatch && Array.isArray(selectedProtocol.profilePatch.populations)
      ? Object.assign({}, profile, {
          populations: Array.from(new Set((profile.populations || []).concat(selectedProtocol.profilePatch.populations)))
        })
      : profile;

    function applyMode(nextModeId) {
      setModeId(nextModeId);
      setFlowMode('choose');
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
      }
    }

    const built = useMemo(function () {
      if (!d.routineBuilder) return null;
      const protocolOptions = d.protocolCatalog && selectedProtocol
        ? d.protocolCatalog.buildOptions(selectedProtocol)
        : {};
      return d.routineBuilder.buildSession(modeId, profileForBuild, Object.assign({}, protocolOptions, {
        timeOfDay: props.timeOfDay,
        screens: assessmentScreens,
        coldWaterPlanned: props.coldWaterPlanned,
        afterAdaptiveStrength: props.afterAdaptiveStrength,
        trainingPhase: props.trainingPhase,
        phase: props.phase,
        keyLoadWithinHours: props.keyLoadWithinHours,
        randomSeed: mixSeed || null,
        painFlags: props.painFlags || [],
        contraindications: props.contraindications || []
      }));
    }, [
      modeId,
      profileForBuild,
      selectedProtocol,
      props.timeOfDay,
      assessmentScreens,
      props.coldWaterPlanned,
      props.afterAdaptiveStrength,
      props.trainingPhase,
      props.phase,
      props.keyLoadWithinHours,
      mixSeed,
      props.painFlags,
      props.contraindications
    ]);

    const customSourceAtomIds = customRunAtomIds.length ? customRunAtomIds : customAtomIds;
    const customBuilt = useMemo(function () {
      return buildCustomBuilt(customSourceAtomIds, modeId, profileForBuild, {
        timeOfDay: props.timeOfDay,
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
      props.coldWaterPlanned,
      props.afterAdaptiveStrength,
      props.trainingPhase,
      props.phase,
      props.keyLoadWithinHours,
      props.painFlags,
      props.contraindications
    ]);

    const activeBuilt = flowMode === 'custom' ? customBuilt : built;
    const plan = useMemo(function () {
      if (!d.routineRunner || !activeBuilt || !activeBuilt.session) return null;
      return d.routineRunner.buildRunPlan(activeBuilt.session);
    }, [activeBuilt]);

    function saveSession() {
      if (!d.recordsStore || !activeBuilt) return;
      d.recordsStore.addSession(props.clientId || 'default', activeBuilt, props.storage);
      if (props.dateKey && global.HEYS && global.HEYS.TrainingStep && typeof global.HEYS.TrainingStep.saveMobility === 'function') {
        const mobilityLog = {
          version: 1,
          mode: activeBuilt.session && activeBuilt.session.mode,
          purpose: activeBuilt.session && activeBuilt.session.purpose,
          autonomic: activeBuilt.session && activeBuilt.session.autonomic,
          ok: activeBuilt.ok !== false,
          totalDurationMinutes: plan && plan.estimatedDurationSec ? Math.round(plan.estimatedDurationSec / 60) : null,
          plan: plan,
          issues: activeBuilt.issues || [],
          savedAt: new Date().toISOString()
        };
        global.HEYS.TrainingStep.saveMobility({
          dateKey: props.dateKey,
          trainingIndex: props.trainingIndex
        }, mobilityLog, {
          activityLabel: 'Мобильность'
        });
      }
      setSaveStatus('session');
    }
    function saveAssessment(audit) {
      if (!d.recordsStore || !audit) return;
      d.recordsStore.addAssessment(props.clientId || 'default', audit, props.storage);
      setSaveStatus('assessment');
    }
    function savePainFlag(step) {
      if (!d.recordsStore) return;
      d.recordsStore.addPainFlag(props.clientId || 'default', {
        level: 'pain',
        atomId: step && step.atomId,
        zone: step && step.jointRegion || null
      }, props.storage);
      setSaveStatus('pain');
    }

    const readinessScore = d.readiness ? d.readiness.score(readinessInput || {}) : null;
    const modes = d.modeEngine && typeof d.modeEngine.listModes === 'function' ? d.modeEngine.listModes() : [];
    const selectedMode = modes.find(function (m) { return m.id === modeId; }) || { id: modeId, purpose: activeBuilt && activeBuilt.session && activeBuilt.session.purpose, autonomic: activeBuilt && activeBuilt.session && activeBuilt.session.autonomic };
    const durationMin = plan && plan.estimatedDurationSec ? Math.round(plan.estimatedDurationSec / 60) : null;
    const issueCount = activeBuilt && Array.isArray(activeBuilt.issues) ? activeBuilt.issues.length : 0;
    const blockCount = activeBuilt && activeBuilt.session && Array.isArray(activeBuilt.session.blocks) ? activeBuilt.session.blocks.length : 0;
    const Focus = global.HEYS && global.HEYS.TrainingFocus;
    const tabs = [
      { id: 'today', label: 'Сегодня', icon: '✓' },
      { id: 'protocols', label: 'Протоколы', icon: '▦' },
      { id: 'constructor', label: 'Своя', icon: '+' },
      { id: 'tests', label: 'Тесты', icon: '◎' },
      { id: 'progress', label: 'Прогресс', icon: '↗' },
      { id: 'calendar', label: 'Календарь', icon: '□' }
    ];

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
            { id: 'settings', icon: '⚙', label: 'Настройки', title: 'Тесты и профиль', onClick: function () { setActiveTab('tests'); } },
            { id: 'registry', icon: '▦', label: 'Все упражнения', title: 'Все упражнения', onClick: function () { setShowRegistry(true); } },
            { id: 'sources', icon: '📚', label: 'Источники', title: 'Источники и методология', onClick: function () { setShowSources(true); } },
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
      const goalIds = ['morning', 'pre_workout', 'recover', 'develop', 'relax', 'desk'];
      if (Focus && Focus.EquipmentBar && Focus.GoalSelector) {
        return h(React.Fragment, null,
          h(Focus.EquipmentBar, {
            classPrefix: 'mobility-fs',
            items: equipmentIds.map(function (id) {
              return { id: id, label: EQUIPMENT_LABEL[id] || id, icon: EQUIPMENT_ICON[id] || '·' };
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
              return {
                id: goal,
                label: GOAL_SHORT_LABEL[goal] || GOAL_LABEL[goal] || goal,
                icon: GOAL_EMOJI[goal] || '🎯',
                count: protocolCountForGoal(goal)
              };
            }),
            onChange: function (goal) {
              handleProfileChange(Object.assign({}, profile, { goal: goal }));
            }
          })
        );
      }
      return h(React.Fragment, null,
        h(EquipmentStepPanel, { profile: profile, onChange: setProfile }),
        h(GoalStepPanel, { profile: profile, onChange: handleProfileChange })
      );
    }

    function renderModeRail() {
      return h('div', { className: 'mobility-mode-rail', 'aria-label': 'Быстрый выбор режима' },
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
      const title = flowMode === 'custom'
        ? 'Своя сборка'
        : flowMode === 'protocol' && selectedProtocol
          ? selectedProtocol.name
          : 'Быстрый микс';
      const text = flowMode === 'custom'
        ? 'Сопровождение по выбранным упражнениям.'
        : flowMode === 'protocol' && selectedProtocol
          ? selectedProtocol.intent
          : 'Автосборка из подходящих упражнений под цель, инвентарь и ограничения.';
      if (flowMode === 'choose') {
        return h('div', { className: 'mobility-fs-today' },
          Focus && Focus.ReadinessCard
            ? h(Focus.ReadinessCard, {
                classPrefix: 'mobility-fs',
                score: readinessScore && readinessScore.score,
                color: issueCount ? '#ef4444' : '#16a66a',
                title: issueCount ? 'Сегодня — с ограничениями' : 'Сегодня — можно работать',
                subtitle: (PURPOSE_LABEL[selectedMode.purpose] || selectedMode.purpose || 'Подбор') + ' · ' + (AUTONOMIC_LABEL[selectedMode.autonomic] || selectedMode.autonomic || 'нейтрально'),
                reasons: activeBuilt && activeBuilt.session && Array.isArray(activeBuilt.session.reasons)
                  ? activeBuilt.session.reasons.slice(0, 3).map(reasonText)
                  : []
              })
            : null,
          h(MixTodayCard, {
            built: built,
            plan: d.routineRunner && built && built.session ? d.routineRunner.buildRunPlan(built.session) : null,
            goal: profile.goal,
            onReroll: function () { setMixSeed(Date.now()); },
            onLaunch: function () { setFlowMode('mix'); }
          }),
          h(RecommendedProtocolCard, {
            protocol: selectedProtocol,
            onOpenProtocols: function () { setActiveTab('protocols'); },
            onLaunch: applyProtocol
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
                  h('p', null, activeBuilt && activeBuilt.ok === false
                    ? 'Есть ограничения: проверьте подсказки перед выполнением.'
                    : text)
                ),
                readinessScore ? h('div', { className: 'mobility-fs__score' },
                  String(readinessScore.score),
                  h('small', null, 'готовность')
                ) : null
              ),
              h('div', { className: 'mobility-today-hero__meta' },
                chip('purpose', PURPOSE_LABEL[selectedMode.purpose] || selectedMode.purpose || 'режим'),
                durationMin ? chip('duration', durationMin + ' мин') : null,
                chip('steps', plan ? plan.totalSteps + ' шагов' : 'нет плана'),
                chip(issueCount ? 'warn' : 'ok', issueCount ? issueCount + ' огранич.' : 'без блокировок')
              )
            )
          ),
          h('div', { className: 'mobility-compact-plan' },
            h('div', null,
              h('strong', null, blockCount || 0, ' упражн.'),
              h('span', null, durationMin ? durationMin + ' мин · ' + (plan ? plan.totalSteps : 0) + ' шагов' : 'план собирается')
            ),
            h('button', { type: 'button', onClick: function () { setFlowMode('choose'); } }, 'Назад')
          ),
          h(ExecutionPanel, { key: flowMode + ':' + modeId + ':' + protocolId + ':' + customRunAtomIds.join(',') + ':' + mixSeed + ':' + (plan ? plan.totalSteps : 0), plan: plan, onPain: savePainFlag }),
          h('div', { className: 'mobility-today-hero__actions' },
            h('button', { type: 'button', className: 'mobility-primary-btn', onClick: saveSession }, props.dateKey ? 'Сохранить в тренировку' : 'Сохранить сессию')
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
              setActiveTab('today');
            }
          })
        );
      }
      if (activeTab === 'tests') {
        return h('div', null,
          h(ProfilePanel, { profile: profile, onChange: handleProfileChange }),
          h(ReadinessPanel, { input: readinessInput, onChange: setReadinessInput }),
          h(AssessmentPanel, { screens: assessmentScreens, onChange: setAssessmentScreens, onSaveAssessment: saveAssessment })
        );
      }
      if (activeTab === 'progress') {
        return h('div', null,
          h(ProgressPanel, { records: props.records, nowDate: props.nowDate, built: activeBuilt, readinessInput: readinessInput, progressionHistory: props.progressionHistory }),
          h(SessionPanel, { built: activeBuilt }),
          h(EffectMapPanel),
          h(RunnerPlanPanel, { plan: plan })
        );
      }
      if (activeTab === 'calendar') {
        return h(CalendarPanel, {
          profile: profile,
          records: props.records,
          phase: props.phase,
          keyLoadWithinHours: props.keyLoadWithinHours,
          startDate: props.startDate,
          nowDate: props.nowDate
        });
      }
      return renderToday();
    }

    return h('main', { className: 'mobility-app mobility-fs-session', 'data-mode': modeId },
      renderTrainingHeader(),
      renderTabs(),
      renderTrainingContext(),
      saveStatus ? h('div', { className: 'mobility-save-status', 'data-status': saveStatus }, saveStatus === 'session' ? 'Сессия сохранена' : saveStatus === 'assessment' ? 'Аудит сохранён' : 'Боль отмечена') : null,
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
    RunnerPlanPanel: RunnerPlanPanel,
    EffectMapPanel: EffectMapPanel,
    SourceBadge: SourceBadge,
    _buildCustomBuilt: buildCustomBuilt
  };
})(typeof window !== 'undefined' ? window : globalThis);
