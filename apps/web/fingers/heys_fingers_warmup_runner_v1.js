// heys_fingers_warmup_runner_v1.js — Ведомая сессия RAMP-разминки.
// Phase timer + voice cues; данные берутся из Fingers.SafetyGate.rampWarmupSteps.
//
// Public API:
//   HEYS.Fingers.WarmupRunner({steps?, onDone, onCancel}) — React-компонент.
//
// onDone({completed:bool, skippedCount:number}) — вызывается по завершении
// последней фазы ИЛИ когда юзер нажал «Готово, дальше» на ней.
// onCancel() — юзер прервал разминку.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__warmupRunnerRegistered) return;
  Fingers.__warmupRunnerRegistered = true;

  const React = global.React;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function fmtMS(sec) {
    const s = Math.max(0, Math.floor(sec));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  function getDefaultSteps() {
    const sg = Fingers.SafetyGate;
    if (sg && Array.isArray(sg.rampWarmupSteps) && sg.rampWarmupSteps.length > 0) {
      return sg.rampWarmupSteps;
    }
    // Fallback на случай если SafetyGate не загружен (defensive — порядок в bundle loader должен исключать).
    return [];
  }

  function WarmupRunner(props) {
    if (!React) return null;
    const p = props || {};
    const steps = (Array.isArray(p.steps) && p.steps.length > 0) ? p.steps : getDefaultSteps();
    const onDone = typeof p.onDone === 'function' ? p.onDone : function () {};
    const onCancel = typeof p.onCancel === 'function' ? p.onCancel : function () {};

    const [phaseIdx, setPhaseIdx] = React.useState(0);
    const [secLeft, setSecLeft] = React.useState(function () {
      const s = steps[0];
      return s ? Math.max(1, Math.round((s.durationMin || 1) * 60)) : 0;
    });
    const [paused, setPaused] = React.useState(false);
    const skippedRef = React.useRef(0);

    const totalPhases = steps.length;
    const phase = steps[phaseIdx] || null;

    // Голос: цитируем описание фазы при старте каждой фазы.
    // voice.say падает в TTS-fallback для произвольного текста (cueId без точного совпадения).
    React.useEffect(function () {
      if (!phase) return;
      const text = phase.label + '. ' + phase.description;
      try { Fingers.voice && Fingers.voice.say && Fingers.voice.say(text); } catch (_) {}
    }, [phaseIdx]);

    // Таймер: каждую секунду decrement; при достижении 0 — авто-переход.
    React.useEffect(function () {
      if (paused || !phase) return undefined;
      const id = setInterval(function () {
        setSecLeft(function (prev) {
          if (prev <= 1) {
            // авто-переход к следующей фазе или финал.
            queueNext('auto');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return function () { clearInterval(id); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paused, phaseIdx]);

    // Escape — abort.
    React.useEffect(function () {
      function onKey(e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          handleAbort();
        }
      }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function queueNext(reason) {
      if (reason === 'skip') skippedRef.current += 1;
      const next = phaseIdx + 1;
      if (next >= totalPhases) {
        try { Fingers.voice && Fingers.voice.say && Fingers.voice.say('cue.warmup_ok'); } catch (_) {}
        onDone({ completed: true, skippedCount: skippedRef.current });
        return;
      }
      const nextStep = steps[next];
      setPhaseIdx(next);
      setSecLeft(Math.max(1, Math.round((nextStep.durationMin || 1) * 60)));
    }

    function handleEarlyDone() { queueNext('early'); }
    function handleSkip() { queueNext('skip'); }
    function handleAbort() {
      try { Fingers.voice && Fingers.voice.say && Fingers.voice.say('cue.warmup_skipped'); } catch (_) {}
      onCancel();
    }
    function togglePause() { setPaused(function (v) { return !v; }); }

    if (!phase) {
      return React.createElement('div', {
        className: 'fingers-warmup-runner',
        style: ST_BACKDROP
      },
        React.createElement('div', { style: ST_CARD },
          React.createElement('div', { style: { padding: 24, textAlign: 'center' } },
            'Шаги разминки недоступны (SafetyGate не загружен).'),
          React.createElement('button', {
            style: ST_BTN_GHOST,
            onClick: onCancel
          }, 'Закрыть')
        )
      );
    }

    const progressPct = Math.round(((phaseIdx) / totalPhases) * 100);

    return React.createElement('div', {
      className: 'fingers-warmup-runner',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Разминка перед тренировкой',
      style: ST_BACKDROP
    },
      React.createElement('div', { className: 'fingers-warmup-runner__card', style: ST_CARD },
        // Header: phase counter + abort
        React.createElement('div', { style: ST_HEADER },
          React.createElement('span', { style: ST_PHASE_COUNTER },
            'Фаза ' + (phaseIdx + 1) + ' из ' + totalPhases),
          React.createElement('button', {
            type: 'button',
            onClick: handleAbort,
            'aria-label': 'Прервать разминку',
            style: ST_CLOSE_BTN
          }, '✕')
        ),

        // Progress bar
        React.createElement('div', { style: ST_PROGRESS_TRACK },
          React.createElement('div', { style: Object.assign({}, ST_PROGRESS_FILL, { width: progressPct + '%' }) })
        ),

        // Hero image (graceful fallback: при 404 wrapper скрывается onError).
        React.createElement('div', { style: ST_HERO_WRAP, className: 'fingers-warmup-hero' },
          React.createElement('img', {
            src: '/exercises/warmup_' + phase.id + '.webp',
            alt: 'Иллюстрация: ' + phase.label,
            loading: 'eager',
            decoding: 'async',
            style: ST_HERO_IMG,
            onError: function (e) {
              try { e.target.parentNode.style.display = 'none'; } catch (_) {}
            }
          })
        ),

        // Phase title
        React.createElement('div', { style: ST_PHASE_TITLE }, phase.label),

        // Big timer
        React.createElement('div', { style: ST_TIMER }, fmtMS(secLeft)),

        // Description
        React.createElement('div', { style: ST_DESC }, phase.description),

        // Controls
        React.createElement('div', { style: ST_CONTROLS },
          React.createElement('button', {
            type: 'button',
            onClick: togglePause,
            style: ST_BTN_GHOST
          }, paused ? '▶ Продолжить' : '⏸ Пауза'),
          React.createElement('button', {
            type: 'button',
            onClick: handleSkip,
            style: ST_BTN_GHOST
          }, 'Пропустить фазу'),
          React.createElement('button', {
            type: 'button',
            onClick: handleEarlyDone,
            style: ST_BTN_PRIMARY
          }, phaseIdx + 1 === totalPhases ? 'Завершить разминку' : 'Готово, дальше')
        )
      )
    );
  }

  // ===== inline стили (минимум, чтобы не плодить CSS-файл) =====
  const ST_BACKDROP = {
    position: 'fixed', inset: 0, zIndex: 9200,
    background: 'rgba(15, 23, 42, 0.78)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16
  };
  const ST_CARD = {
    background: 'var(--card, #fff)',
    color: 'var(--fingers-text, #1a1a1f)',
    borderRadius: 16,
    width: '100%', maxWidth: 480,
    maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
  };
  const ST_HEADER = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px 10px'
  };
  const ST_PHASE_COUNTER = {
    fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-muted, #64748b)'
  };
  const ST_CLOSE_BTN = {
    width: 32, height: 32, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer',
    fontSize: 16, lineHeight: 1, color: 'inherit'
  };
  const ST_PROGRESS_TRACK = {
    height: 4, background: 'rgba(0,0,0,0.06)',
    borderRadius: 4, margin: '0 16px',
    overflow: 'hidden'
  };
  const ST_PROGRESS_FILL = {
    height: '100%',
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
    transition: 'width 280ms ease'
  };
  const ST_HERO_WRAP = {
    width: '100%',
    aspectRatio: '1 / 1',
    maxHeight: 280,
    overflow: 'hidden',
    background: 'rgba(120, 120, 128, 0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  };
  const ST_HERO_IMG = {
    width: '100%', height: '100%',
    objectFit: 'cover',
    display: 'block'
  };
  const ST_PHASE_TITLE = {
    padding: '14px 20px 4px',
    fontSize: 18, fontWeight: 700, lineHeight: 1.3,
    textAlign: 'center'
  };
  const ST_TIMER = {
    padding: '4px 20px 8px',
    fontSize: 56, fontWeight: 700, letterSpacing: '0.02em',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums'
  };
  const ST_DESC = {
    padding: '0 20px 16px',
    fontSize: 14, lineHeight: 1.5,
    color: 'var(--text-muted, #475569)',
    textAlign: 'center'
  };
  const ST_CONTROLS = {
    padding: '12px 16px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
    borderTop: '1px solid rgba(0,0,0,0.06)'
  };
  const ST_BTN_GHOST = {
    padding: '12px 16px', borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.08)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 14, fontWeight: 500,
    cursor: 'pointer'
  };
  const ST_BTN_PRIMARY = {
    padding: '14px 16px', borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(180deg, #6366f1, #4f46e5)',
    color: '#fff',
    fontSize: 15, fontWeight: 700,
    cursor: 'pointer'
  };

  // === Экспорт ===
  Fingers.WarmupRunner = WarmupRunner;
})(typeof window !== 'undefined' ? window : globalThis);
