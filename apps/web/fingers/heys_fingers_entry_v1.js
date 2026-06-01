// heys_fingers_entry_v1.js — Точка входа модуля «Тренировка пальцев» (climbing fingerboard).
// Wave 3: реальная реализация поверх Fullscreen portal + рендер компактного pill для дневника.
//
// PUBLIC API (стабильный контракт — consumer-код в day_trainings и др. полагается на эти подписи):
//   HEYS.Fingers.openFullscreen(opts)       — открыть fullscreen-overlay
//   HEYS.Fingers.close()                    — закрыть текущий overlay (если открыт)
//   HEYS.Fingers.isReady()                  — true если SessionUI + Fullscreen зарегистрированы
//   HEYS.Fingers.renderPreviewPill(props)   — React-компонент карточки в дневнике
//   HEYS.Fingers.getBodyWeight()            — { kg, source } из heys_profile (см. body_metrics)
//
// SECONDARY API (используется внутри fingers модуля, но safe для external read):
//   HEYS.Fingers.ageGate.{filterPrograms,filterGrips,warnLevel,getRestrictionMessage}
//   HEYS.Fingers.readiness.assess(today, history) → { score, bucket, reasons }
//   HEYS.Fingers.PROGRAMS, HEYS.Fingers.GRIPS, HEYS.Fingers.BOARDS — статические каталоги
//
// NB: всё остальное (Fingers.Fullscreen, Fingers.SessionUI, Fingers.timer и т.п.) —
// internal, может меняться без semver-bump. Не полагаться извне.
//
// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS (JSDoc — даёт IDE autocomplete без TS-конверсии)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @typedef {'new'|'view'|'continue'|'edit'} FingersOpenMode
 *   - 'new':       создать новую тренировку (показать программы/конструктор)
 *   - 'view':      read-only просмотр завершённой записи
 *   - 'continue':  возобновить interrupted session из persistence snapshot
 *   - 'edit':      редактировать существующую запись (изменить добавленный вес и т.п.)
 */

/**
 * @typedef {object} FingersOpenOpts
 * @property {string} [dateKey]              ISO дата 'YYYY-MM-DD' дневника
 * @property {number} [trainingIndex]        индекс в day.trainings[]
 * @property {FingersOpenMode} [mode]        режим открытия (default: 'new')
 */

/**
 * @typedef {object} FingersTraining
 * @property {string} type                   обязательно === 'fingers' чтобы pill отрисовался
 * @property {string} [time]                 'HH:MM' времени тренировки
 * @property {object} [fingersLog]
 * @property {string} [fingersLog.programId] id выбранного протокола ('beastmaker_1000_beginner' и т.п.)
 * @property {number} [fingersLog.totalDurationMinutes]
 * @property {number} [fingersLog.completedAt] timestamp millis (если завершено)
 */

/**
 * @typedef {object} FingersPillProps
 * @property {FingersTraining} training
 * @property {string} dateKey
 * @property {number} trainingIndex
 * @property {Function} [onClick]            override — иначе ведёт в openFullscreen({mode:'edit'})
 */

/**
 * @typedef {object} BodyWeightResult
 * @property {number} kg
 * @property {'profile'|'baseWeight'|'fallback'} source
 *   - 'profile':    взят из heys_profile.weight (canonical)
 *   - 'baseWeight': взят из heys_profile.baseWeight (legacy alias)
 *   - 'fallback':   ничего не указано, возвращён FALLBACK_KG=70 (caller должен показать warning)
 */

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__entryRegistered) return; // idempotent
  Fingers.__entryRegistered = true;

  const React = global.React;
  const h = React && React.createElement;

  /**
   * Открывает fullscreen-overlay тренировки пальцев. Граефул-fallback на toast
   * если модуль ещё не загружен (race с lazy-load).
   * @param {FingersOpenOpts} opts
   * @returns {void}
   */
  Fingers.openFullscreen = function openFullscreen(opts) {
    const o = opts || {};
    if (Fingers.Fullscreen && typeof Fingers.Fullscreen.mount === 'function') {
      Fingers.Fullscreen.mount(o);
      return;
    }
    const msg = '🤚 Тренировка пальцев — модуль ещё не загружен.';
    try {
      if (HEYS.Toast?.info) HEYS.Toast.info(msg);
      else if (HEYS.Toast?.show) HEYS.Toast.show(msg);
      else console.info('[Fingers]', msg, o);
    } catch (_) {
      console.info('[Fingers]', msg, o);
    }
  };

  /**
   * Закрывает текущий fullscreen-overlay если открыт. No-op если не открыт.
   * @returns {void}
   */
  Fingers.close = function close() {
    if (Fingers.Fullscreen && typeof Fingers.Fullscreen.unmount === 'function') {
      Fingers.Fullscreen.unmount();
    }
  };

  /**
   * @returns {boolean} true если SessionUI и Fullscreen-portal зарегистрированы
   *   и openFullscreen() гарантированно сработает. Используется consumer-кодом
   *   для skip-render fallback'а когда модуль ещё не догружен (lazy scenario).
   */
  Fingers.isReady = function isReady() {
    return !!(Fingers.Fullscreen && Fingers.SessionUI);
  };

  // --- Pill для дневника ---
  // Компактная 60px карточка: иконка 🤚 + program name + duration + chevron.
  // Click → открывает fullscreen. Используется из heys_day_trainings_v1.js
  // когда training.type === 'fingers'.
  /**
   * @param {FingersPillProps} props
   * @returns {object|null} React element или null если React недоступен
   */
  Fingers.renderPreviewPill = function renderPreviewPill(props) {
    if (!h) return null;
    const T = (props && props.training) || {};
    const dateKey = props && props.dateKey;
    const trainingIndex = props && props.trainingIndex;
    const onClick = (props && props.onClick) || function () {
      Fingers.openFullscreen({ dateKey: dateKey, trainingIndex: trainingIndex, mode: 'edit' });
    };

    const fl = T.fingersLog || {};
    const programId = fl.programId || 'custom';
    const program = (typeof Fingers.getProgramById === 'function')
      ? Fingers.getProgramById(programId) : null;
    const programName = program?.name || (programId === 'custom' ? 'Свой конструктор' : programId);
    const duration = fl.totalDurationMinutes;
    const completed = !!fl.completedAt;
    const intensity = (typeof Fingers.getProgramIntensity === 'function')
      ? Fingers.getProgramIntensity(programId) : 'moderate';

    const intensityColor = intensity === 'max' ? '#dc2626'
      : intensity === 'moderate' ? '#f59e0b'
      : intensity === 'recovery' ? '#10b981' : '#6b7280';

    return h('div', {
      className: 'fingers-fs-pill compact-card',
      role: 'button',
      tabIndex: 0,
      onClick: onClick,
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') onClick(); },
      style: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', minHeight: 60,
        cursor: 'pointer', borderRadius: 12,
        border: '1px solid var(--fingers-card-border, rgba(0,0,0,0.06))',
        background: 'var(--bg-secondary, #fff)',
        transition: 'background 0.15s'
      },
      'aria-label': 'Тренировка пальцев: ' + programName + '. Открыть детали.'
    },
      h('span', { style: { fontSize: 28, lineHeight: 1 } }, '🤚'),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontWeight: 600, fontSize: 14, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, programName),
        h('div', { style: { fontSize: 12, opacity: 0.65, display: 'flex', gap: 8, alignItems: 'center' } },
          completed && h('span', { style: { color: '#10b981' } }, '✓ выполнено'),
          duration && h('span', null, '⏱ ' + duration + ' мин'),
          h('span', {
            style: {
              padding: '1px 6px', borderRadius: 4, fontSize: 10,
              background: intensityColor + '22', color: intensityColor
            }
          }, intensity)
        )
      ),
      T.time && h('span', { style: { fontSize: 12, opacity: 0.6 } }, T.time),
      h('span', { style: { fontSize: 18, opacity: 0.4 } }, '›')
    );
  };

  // Auto-detect interrupted session at boot — show resume prompt.
  // Listens for heysSyncCompleted then probes persistence module.
  // Snooze: «Позже» сохраняет timestamp в LS, модалка не появится до его
  // истечения. In-component баннер (SessionUI) — постоянный, snooze игнорирует.
  const SNOOZE_LS_KEY = 'fingers.resume.snoozedUntil';
  const SNOOZE_HOURS = 6;
  if (typeof window !== 'undefined') {
    const tryDetect = function () {
      try {
        if (!Fingers.persistence || typeof Fingers.persistence.detectOnBoot !== 'function') return;
        Fingers.persistence.detectOnBoot(function (result) {
          if (!result || !result.snapshot) return;
          const snap = result.snapshot;
          if (result.stale) {
            // Auto-save as aborted (handled by persistence module itself)
            return;
          }
          // Snooze check: если юзер недавно нажал «Позже» — не показываем модалку.
          try {
            const raw = window.localStorage && window.localStorage.getItem(SNOOZE_LS_KEY);
            const until = raw ? parseInt(raw, 10) : 0;
            if (until && until > Date.now()) return;
            if (until && until <= Date.now()) {
              window.localStorage.removeItem(SNOOZE_LS_KEY);
            }
          } catch (_) { /* LS недоступен — продолжаем */ }
          // Форматируем относительное время с момента последнего тика.
          // Это даёт юзеру понять — это «5 мин назад» (стоит продолжить) или
          // «50 мин назад» (близко к stale, возможно лучше удалить).
          const ageText = (function () {
            const lastTick = Number(snap.lastTickAt) || 0;
            if (!lastTick) return '';
            const mins = Math.max(1, Math.round((Date.now() - lastTick) / 60000));
            if (mins < 60) return ' Прервана ' + mins + ' мин назад.';
            const hrs = Math.floor(mins / 60);
            const rem = mins % 60;
            return ' Прервана ' + hrs + 'ч ' + rem + 'мин назад.';
          })();
          if (HEYS.ConfirmModal?.show) {
            HEYS.ConfirmModal.show({
              icon: '⏸',
              title: 'Прерванная тренировка',
              text: 'Найдена незавершённая fingerboard сессия.' + ageText,
              actions: [
                { key: 'discard', label: 'Удалить', style: 'danger',
                  variant: 'text', row: 0, isCancel: true,
                  onClick: function () {
                    try { Fingers.persistence.clear(); } catch (_) {}
                  } },
                { key: 'snooze', label: 'Позже', style: 'neutral',
                  variant: 'text', row: 1,
                  onClick: function () {
                    try {
                      window.localStorage.setItem(SNOOZE_LS_KEY,
                        String(Date.now() + SNOOZE_HOURS * 60 * 60 * 1000));
                    } catch (_) {}
                  } },
                { key: 'continue', label: 'Продолжить', style: 'primary',
                  variant: 'fill', row: 2, isDefault: true,
                  onClick: function () {
                    Fingers.openFullscreen({
                      dateKey: snap.dateKey,
                      trainingIndex: snap.trainingIndex,
                      mode: 'continue'
                    });
                  } }
              ]
            });
          }
        });
      } catch (e) {
        console.warn('[Fingers.entry] detectOnBoot failed:', e);
      }
    };
    if (window.__heysSyncCompletedFired) {
      tryDetect();
    } else {
      window.addEventListener('heysSyncCompleted', tryDetect, { once: true });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
