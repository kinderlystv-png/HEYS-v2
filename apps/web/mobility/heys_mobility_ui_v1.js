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
      recordsStore: Mobility.recordsStore
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
    const src = bib && bib.getSource(props.sourceId);
    if (!src) return h('span', { className: 'mobility-source mobility-source--missing' }, props.sourceId);
    return h('span', {
      className: 'mobility-source',
      title: src.label + ' · ' + src.topic
    }, 'Источник ', src.strength);
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
      className: 'mobility-block__visual',
      style: { width: '100%', aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: 8, background: '#f3f0ea', marginBottom: 10 }
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

  function ExecutionPanel(props) {
    const runner = deps().routineRunner;
    const plan = props.plan;
    const [state, setState] = useState(function () {
      return runner && plan ? runner.createState(plan) : { status: 'idle', index: 0, totalSteps: 0, aborted: false };
    });
    if (!runner || !plan || !plan.steps || !plan.steps.length) return null;
    const current = plan.steps[Math.min(state.index, plan.steps.length - 1)] || plan.steps[0];
    function send(event) {
      setState(function (s) { return runner.transition(s, event); });
    }
    return h('section', { className: 'mobility-panel mobility-execution', 'aria-label': 'Выполнение' },
      h('h3', null, 'Выполнение'),
      h('div', { className: 'mobility-execution__status', 'data-status': state.status },
        chip('status', state.status),
        chip('step', (state.index + 1) + '/' + plan.steps.length)
      ),
      h('article', { className: 'mobility-current-step', 'data-kind': current.kind },
        h('strong', null, current.label),
        current.durationSec ? h('span', null, ' · ', current.durationSec, ' сек') : null,
        current.instruction ? h('p', null, current.instruction) : null,
        current.breath && current.breath.phases
          ? h('ol', { className: 'mobility-breath-phases', 'aria-label': 'Фазы дыхания' },
              current.breath.phases.map(function (p, idx) {
                return h('li', { key: p.type + idx, 'data-phase': p.type }, p.label, ' ', p.durationSec, ' сек');
              }))
          : null
      ),
      h('div', { className: 'mobility-execution__controls' },
        state.status === 'idle' ? h('button', { type: 'button', onClick: function () { send('start'); } }, 'Старт') : null,
        state.status === 'running' ? h('button', { type: 'button', onClick: function () { send('pause'); } }, 'Пауза') : null,
        state.status === 'paused' ? h('button', { type: 'button', onClick: function () { send('resume'); } }, 'Продолжить') : null,
        h('button', { type: 'button', onClick: function () { send('next'); } }, 'Дальше'),
        props.onPain ? h('button', { type: 'button', onClick: function () { props.onPain(current); } }, 'Отметить боль') : null,
        h('button', { type: 'button', onClick: function () { send('abort'); } }, 'Стоп')
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
    const [modeId, setModeId] = useState(props.modeId || (d.onboarding && d.onboarding.recommendMode(initialProfile, { timeOfDay: props.timeOfDay })) || 'morning_tonify');
    const [readinessInput, setReadinessInput] = useState(props.readiness || {});
    const [saveStatus, setSaveStatus] = useState(null);
    function handleProfileChange(nextProfile) {
      setProfile(nextProfile);
      if (d.onboarding && nextProfile && nextProfile.goal !== profile.goal) {
        setModeId(d.onboarding.recommendMode(nextProfile, { timeOfDay: props.timeOfDay }));
      }
    }

    const built = useMemo(function () {
      if (!d.routineBuilder) return null;
      return d.routineBuilder.buildSession(modeId, profile, {
        timeOfDay: props.timeOfDay,
        screens: assessmentScreens,
        coldWaterPlanned: props.coldWaterPlanned,
        afterAdaptiveStrength: props.afterAdaptiveStrength,
        trainingPhase: props.trainingPhase,
        phase: props.phase,
        keyLoadWithinHours: props.keyLoadWithinHours,
        painFlags: props.painFlags || [],
        contraindications: props.contraindications || []
      });
    }, [
      modeId,
      profile,
      props.timeOfDay,
      assessmentScreens,
      props.coldWaterPlanned,
      props.afterAdaptiveStrength,
      props.trainingPhase,
      props.phase,
      props.keyLoadWithinHours,
      props.painFlags,
      props.contraindications
    ]);

    const plan = useMemo(function () {
      if (!d.routineRunner || !built || !built.session) return null;
      return d.routineRunner.buildRunPlan(built.session);
    }, [built]);

    function saveSession() {
      if (!d.recordsStore || !built) return;
      d.recordsStore.addSession(props.clientId || 'default', built, props.storage);
      if (props.dateKey && global.HEYS && global.HEYS.TrainingStep && typeof global.HEYS.TrainingStep.saveMobility === 'function') {
        const mobilityLog = {
          version: 1,
          mode: built.session && built.session.mode,
          purpose: built.session && built.session.purpose,
          autonomic: built.session && built.session.autonomic,
          ok: built.ok !== false,
          totalDurationMinutes: plan && plan.estimatedDurationSec ? Math.round(plan.estimatedDurationSec / 60) : null,
          plan: plan,
          issues: built.issues || [],
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

    return h('main', { className: 'mobility-app', 'data-mode': modeId },
      h('header', { className: 'mobility-app__header' },
        h('h2', null, 'Мобильность'),
        h('p', null, 'Подготовка, развитие диапазона и восстановление с ограничениями безопасности.')
      ),
      h('div', { className: 'mobility-app__layout' },
        h('div', { className: 'mobility-app__left' },
          h(ModePicker, { value: modeId, onChange: setModeId }),
          h(ProfilePanel, { profile: profile, onChange: handleProfileChange }),
          h(ReadinessPanel, { input: readinessInput, onChange: setReadinessInput }),
          h(AssessmentPanel, { screens: assessmentScreens, onChange: setAssessmentScreens, onSaveAssessment: saveAssessment }),
          h(ProgressPanel, { records: props.records, nowDate: props.nowDate, built: built, readinessInput: readinessInput, progressionHistory: props.progressionHistory }),
          h(CalendarPanel, {
            profile: profile,
            records: props.records,
            phase: props.phase,
            keyLoadWithinHours: props.keyLoadWithinHours,
            startDate: props.startDate,
            nowDate: props.nowDate
          })
        ),
        h('div', { className: 'mobility-app__main' },
          saveStatus ? h('div', { className: 'mobility-save-status', 'data-status': saveStatus }, saveStatus === 'session' ? 'Сессия сохранена' : saveStatus === 'assessment' ? 'Аудит сохранён' : 'Боль отмечена') : null,
          h(SessionPanel, { built: built, onSaveSession: saveSession }),
          h(ExecutionPanel, { key: modeId + ':' + (plan ? plan.totalSteps : 0), plan: plan, onPain: savePainFlag }),
          h(RunnerPlanPanel, { plan: plan }),
          h(EffectMapPanel)
        )
      )
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
    AtomVisual: AtomVisual,
    ExecutionPanel: ExecutionPanel,
    RunnerPlanPanel: RunnerPlanPanel,
    EffectMapPanel: EffectMapPanel,
    SourceBadge: SourceBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);
