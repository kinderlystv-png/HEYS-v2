// heys_fingers_entry_v1.js — Точка входа модуля «Тренировка пальцев» (climbing fingerboard).
// Wave 3: реальная реализация поверх Fullscreen portal + рендер компактного pill для дневника.
//
// Public API:
//   HEYS.Fingers.openFullscreen({ dateKey, trainingIndex, mode })
//     dateKey:        ISO 'YYYY-MM-DD' дата дневника
//     trainingIndex:  индекс тренировки в day.trainings[]
//     mode:           'new' | 'view' | 'continue' | 'edit'
//   HEYS.Fingers.close()
//   HEYS.Fingers.isReady()
//   HEYS.Fingers.renderPreviewPill({ training, dateKey, trainingIndex, onClick })
//     React component — компактная 60px карточка fingers тренировки для дневника.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__entryRegistered) return; // idempotent
  Fingers.__entryRegistered = true;

  const React = global.React;
  const h = React && React.createElement;

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

  Fingers.close = function close() {
    if (Fingers.Fullscreen && typeof Fingers.Fullscreen.unmount === 'function') {
      Fingers.Fullscreen.unmount();
    }
  };

  Fingers.isReady = function isReady() {
    return !!(Fingers.Fullscreen && Fingers.SessionUI);
  };

  // --- Pill для дневника ---
  // Компактная 60px карточка: иконка 🤚 + program name + duration + chevron.
  // Click → открывает fullscreen. Используется из heys_day_trainings_v1.js
  // когда training.type === 'fingers'.
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
          if (HEYS.ConfirmModal?.show) {
            HEYS.ConfirmModal.show({
              icon: '⏸',
              title: 'Прерванная тренировка',
              text: 'Найдена незавершённая fingerboard сессия. Продолжить?',
              confirmText: 'Продолжить',
              cancelText: 'Удалить',
              onConfirm: function () {
                Fingers.openFullscreen({
                  dateKey: snap.dateKey,
                  trainingIndex: snap.trainingIndex,
                  mode: 'continue'
                });
              },
              onCancel: function () {
                try { Fingers.persistence.clear(); } catch (_) { /* noop */ }
              }
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
