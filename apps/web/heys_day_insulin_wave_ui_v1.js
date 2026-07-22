// heys_day_insulin_wave_ui_v1.js — premium DayTab response card
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const MOD = {};

  function TimerDigits({ React, minutes, countUp = false }) {
    const initial = Math.max(0, Math.round((Number(minutes) || 0) * 60));
    const [elapsedSeconds, setElapsedSeconds] = React.useState(initial);

    React.useEffect(() => {
      setElapsedSeconds(initial);
      const interval = setInterval(() => {
        setElapsedSeconds((value) => countUp ? value + 1 : Math.max(0, value - 1));
      }, 1000);
      return () => clearInterval(interval);
    }, [initial, countUp]);

    const hours = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    return React.createElement('div', { style: {
      fontSize: 40, lineHeight: 1, fontWeight: 800, color: '#fff', letterSpacing: 1.5,
      fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 8px rgba(0,0,0,.20)',
    } }, `${hours}:${mins}:${seconds}`);
  }

  MOD.renderInsulinWaveIndicator = function renderInsulinWaveIndicator({
    React,
    insulinWaveData: data,
    insulinExpanded,
    setInsulinExpanded,
    mobileSubTab,
    isMobile,
    HEYS: providedHEYS,
  }) {
    if (!React || !data) return null;
    if (isMobile && mobileSubTab !== 'diary') return null;

    const h = React.createElement;
    const root = providedHEYS || global.HEYS || {};
    const IW = root.InsulinWave;
    const isLoading = data.status === 'loading';
    const rangeStatus = data.rangeStatus || data.status;
    const complete = rangeStatus === 'complete';
    const scheduled = rangeStatus === 'scheduled';
    const timerValue = complete
      ? (data.minutesAfterWindow ?? 0)
      : (data.rangeRemaining ?? data.remaining);

    const toggle = (event) => {
      event?.stopPropagation?.();
      if (typeof setInsulinExpanded === 'function') setInsulinExpanded(!insulinExpanded);
    };

    const renderPrimaryState = () => {
      if (scheduled) {
        return h('div', { style: { marginTop: 14, fontSize: 13, color: '#6B7C93' } }, 'Приём ещё впереди');
      }
      if (complete) {
        return h(React.Fragment, null,
          h('div', { style: {
            marginTop: 14, padding: '15px 12px 13px', borderRadius: 16, textAlign: 'center',
            background: 'linear-gradient(135deg,#15936D,#19B584)',
            boxShadow: '0 8px 20px rgba(21,147,109,.22)',
          } },
            h('div', { style: { marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,.88)', fontWeight: 600 } }, 'После расчётного восстановления условий для липолиза'),
            h(TimerDigits, { React, minutes: timerValue, countUp: true })
          ),
          h('div', { style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8,
            minHeight: 38, padding: '8px 12px', borderRadius: 12,
            background: 'rgba(16,185,129,.11)', border: '1px solid rgba(16,185,129,.24)',
            color: '#167D61', fontSize: 13, fontWeight: 750,
          } }, h('span', null, '🌿'), h('span', null, 'Расчётные условия для липолиза восстановлены'))
        );
      }
      return h(React.Fragment, null,
        h('div', { style: {
          marginTop: 14, padding: '15px 12px 13px', borderRadius: 16, textAlign: 'center',
          background: 'linear-gradient(135deg,#1D70B7,#52A0D8)',
          boxShadow: '0 8px 20px rgba(29,112,183,.22)',
        } },
          h('div', { style: { marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,.88)', fontWeight: 600 } }, 'До расчётного восстановления условий для липолиза'),
          h(TimerDigits, { React, minutes: timerValue })
        ),
        IW?.renderWaveChart?.({ ...data, status: rangeStatus }),
        h('div', { style: { marginTop: 7, fontSize: 10, color: '#7A8BA3', textAlign: 'center' } }, 'Ориентир не запрещает есть.')
      );
    };

    return h('section', {
      className: `insulin-wave-indicator iw-response-card${insulinExpanded ? ' expanded' : ''}`,
      id: 'tour-insulin-wave',
      'aria-label': 'Расчётное окно после еды',
      style: {
        margin: '10px 0',
        padding: 16,
        borderRadius: 20,
        border: '1px solid rgba(47,107,255,.13)',
        background: 'linear-gradient(145deg,rgba(255,255,255,.98),rgba(245,249,255,.96))',
        boxShadow: '0 12px 34px rgba(36,67,115,.10), inset 0 1px 0 rgba(255,255,255,.85)',
        color: '#24334B',
        position: 'relative',
        overflow: 'hidden',
      },
    },
      h('div', { style: {
        position: 'absolute', width: 150, height: 150, borderRadius: '50%', right: -72, top: -88,
        background: 'radial-gradient(circle,rgba(109,142,255,.18),rgba(109,142,255,0) 70%)', pointerEvents: 'none',
      } }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, position: 'relative' } },
        h('span', { style: {
          display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 11,
          background: 'linear-gradient(145deg,#EAF0FF,#DDE8FF)', color: '#2F6BFF', fontSize: 17,
        } }, '◷'),
        h('div', { style: { fontWeight: 760, fontSize: 15, letterSpacing: '-.01em' } }, 'Отклик после еды')
      ),

      isLoading
        ? h('div', { style: { marginTop: 14, fontSize: 13, color: '#6B7C93' } }, 'Рассчитываем ориентир…')
        : h(React.Fragment, null,
          renderPrimaryState(),
          h('button', {
            type: 'button',
            onClick: toggle,
            'aria-expanded': insulinExpanded ? 'true' : 'false',
            style: {
              width: '100%', minHeight: 44, marginTop: 10, border: 0, borderRadius: 13,
              background: insulinExpanded ? 'rgba(47,107,255,.10)' : 'transparent', color: '#2F6BFF',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            },
          }, insulinExpanded ? 'Скрыть' : 'Подробнее'),
          insulinExpanded && h('div', { onClick: (event) => event.stopPropagation() },
            IW?.renderExpandedSection?.(data)
          )
        )
    );
  };

  HEYS.dayInsulinWaveUI = MOD;
})(typeof window !== 'undefined' ? window : globalThis);
