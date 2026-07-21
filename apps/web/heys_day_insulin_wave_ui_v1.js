// heys_day_insulin_wave_ui_v1.js — premium DayTab response card
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const MOD = {};

  const toneForConfidence = (level) => {
    if (level === 'high') return { bg: 'rgba(31,157,125,.10)', color: '#167D61', label: 'данных достаточно' };
    if (level === 'medium') return { bg: 'rgba(245,183,49,.13)', color: '#8A6200', label: 'есть допущения' };
    return { bg: 'rgba(218,112,74,.12)', color: '#9A492E', label: 'мало данных' };
  };

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
    const complete = data.status === 'complete';
    const confidence = toneForConfidence(data.confidence?.level);
    const range = data.estimatedWindow?.rangeLabel || data.endTimeRange || data.endTimeDisplay || '—';
    const shapeReason = data.responseShape?.drivers?.[0]
      ? `Главный фактор: ${data.responseShape.drivers[0]}.`
      : 'Выраженного доминирующего фактора нет.';

    const toggle = (event) => {
      event?.stopPropagation?.();
      if (typeof setInsulinExpanded === 'function') setInsulinExpanded(!insulinExpanded);
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
      h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, position: 'relative' } },
        h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: {
              display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 12,
              background: 'linear-gradient(145deg,#EAF0FF,#DDE8FF)', color: '#2F6BFF', fontSize: 18,
            } }, '◷'),
            h('div', null,
              h('div', { style: { fontWeight: 760, fontSize: 15, letterSpacing: '-.01em' } }, 'Расчётное окно после еды'),
              h('div', { style: { marginTop: 2, fontSize: 11, color: '#7A8BA3' } }, isLoading ? 'модель загружается' : `эвристическая модель · v${data.modelVersion}`)
            )
          )
        ),
        !isLoading && h('span', { style: {
          padding: '5px 8px', borderRadius: 999, background: confidence.bg, color: confidence.color,
          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
        } }, confidence.label)
      ),

      isLoading
        ? h('div', { style: { marginTop: 14, fontSize: 13, color: '#6B7C93' } }, 'Уточняем состав приёма и диапазон времени…')
        : h(React.Fragment, null,
          h('div', { style: { marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 7, position: 'relative' } },
            h('span', { style: { fontSize: 12, color: '#6B7C93' } }, complete ? 'Оценка завершена' : 'Ориентир завершения'),
            h('strong', { style: { fontSize: 20, lineHeight: 1, color: complete ? '#167D61' : '#2F6BFF', fontVariantNumeric: 'tabular-nums' } }, complete ? 'сейчас' : range)
          ),
          h('div', { style: { marginTop: 9, fontSize: 13, lineHeight: 1.5, color: '#52657D' } },
            complete
              ? 'Расчётный период прошёл. Решение о следующем приёме зависит от голода, самочувствия и плана питания.'
              : `${data.responseShape?.label || 'Смешанный профиль'}. ${shapeReason}`
          ),
          IW?.renderProgressBar?.(data),
          IW?.renderWaveChart?.(data),
          h('div', { style: {
            marginTop: 12, padding: '10px 12px', borderRadius: 13, background: 'rgba(47,107,255,.055)',
            fontSize: 12, lineHeight: 1.5, color: '#405572',
          } },
            h('strong', { style: { color: '#2F6BFF' } }, 'Что делать: '),
            'ориентируйся на свежую оценку голода и дневной план. Этот диапазон не запрещает есть.'
          ),
          h('button', {
            type: 'button',
            onClick: toggle,
            'aria-expanded': insulinExpanded ? 'true' : 'false',
            style: {
              width: '100%', minHeight: 44, marginTop: 10, border: 0, borderRadius: 13,
              background: insulinExpanded ? 'rgba(47,107,255,.10)' : 'transparent', color: '#2F6BFF',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            },
          }, insulinExpanded ? 'Скрыть детали' : 'Почему такой диапазон'),
          insulinExpanded && h('div', { onClick: (event) => event.stopPropagation() },
            IW?.renderExpandedSection?.(data)
          )
        )
    );
  };

  HEYS.dayInsulinWaveUI = MOD;
})(typeof window !== 'undefined' ? window : globalThis);
