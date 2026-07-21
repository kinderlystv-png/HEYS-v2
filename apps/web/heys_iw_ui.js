// heys_iw_ui.js — premium progressive-disclosure UI for post-meal estimates
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  const h = (...args) => React?.createElement?.(...args) || null;
  const formatMinutes = (minutes) => {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (value < 60) return `${value} мин`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  };

  function confidenceTone(level) {
    if (level === 'high') return { color: '#167D61', bg: 'rgba(22,125,97,.09)', label: 'Данных достаточно' };
    if (level === 'medium') return { color: '#9A6700', bg: 'rgba(245,183,49,.12)', label: 'Есть допущения' };
    return { color: '#A64B2A', bg: 'rgba(218,112,74,.11)', label: 'Мало данных' };
  }

  function renderProgressBar(data) {
    if (!React || !data) return null;
    const completed = data.status === 'complete';
    const progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
    return h('div', { style: { marginTop: 12 } },
      h('div', { style: { height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(47,107,255,.10)' } },
        h('div', { style: {
          width: `${completed ? 100 : progress}%`,
          height: '100%',
          borderRadius: 999,
          background: completed ? 'linear-gradient(90deg,#46B89C,#167D61)' : 'linear-gradient(90deg,#6D8EFF,#2F6BFF)',
          transition: 'width .3s ease',
        } })
      ),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#7A8BA3' } },
        h('span', null, data.lastMealTimeDisplay || 'приём'),
        h('span', null, completed ? 'ориентир завершён' : data.endTimeRange || data.endTimeDisplay)
      )
    );
  }

  function renderWaveHistory(data) {
    if (!React || !Array.isArray(data?.waveHistory) || data.waveHistory.length === 0) return null;
    return h('div', { style: { marginTop: 16 } },
      h('div', { style: { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A98AD', fontWeight: 700, marginBottom: 8 } }, 'Приёмы за день'),
      h('div', { style: { display: 'grid', gap: 7 } },
        data.waveHistory.map((entry) => h('div', {
          key: entry.id,
          style: { display: 'grid', gridTemplateColumns: '48px 1fr auto', alignItems: 'center', gap: 8, fontSize: 12 },
        },
          h('span', { style: { color: '#6B7C93', fontVariantNumeric: 'tabular-nums' } }, entry.timeDisplay),
          h('div', { style: { height: 6, borderRadius: 999, background: 'rgba(47,107,255,.08)', overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.max(12, entry.responseLoad.score)}%`, borderRadius: 999, background: '#6D8EFF' } })
          ),
          h('span', { style: { color: '#3D4B63' } }, entry.endTimeDisplay)
        ))
      )
    );
  }

  function Details({ data }) {
    if (!data) return null;
    const quality = data.confidence?.dataQuality || {};
    const missing = quality.missingFields || [];
    const assumptions = quality.assumptions || [];
    const tone = confidenceTone(data.confidence?.level);
    return h('div', { style: { marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(43,64,91,.09)' } },
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
        h('div', { style: { padding: '10px 11px', borderRadius: 12, background: '#F6F8FC' } },
          h('div', { style: { fontSize: 10, color: '#8A98AD', textTransform: 'uppercase', letterSpacing: '.06em' } }, 'Нагрузка'),
          h('div', { style: { marginTop: 4, color: '#24334B', fontWeight: 700 } }, `${data.responseLoad?.score ?? '—'} / 100`),
          h('div', { style: { marginTop: 2, fontSize: 11, color: '#6B7C93' } }, `GL: ${data.responseLoad?.estimatedGlycemicLoad?.central ?? '—'}`)
        ),
        h('div', { style: { padding: '10px 11px', borderRadius: 12, background: '#F6F8FC' } },
          h('div', { style: { fontSize: 10, color: '#8A98AD', textTransform: 'uppercase', letterSpacing: '.06em' } }, 'Форма'),
          h('div', { style: { marginTop: 4, color: '#24334B', fontWeight: 700 } }, data.responseShape?.label || '—'),
          h('div', { style: { marginTop: 2, fontSize: 11, color: '#6B7C93' } }, (data.responseShape?.drivers || []).join(', ') || 'без доминирующего фактора')
        )
      ),
      h('div', { style: { marginTop: 10, padding: '10px 12px', borderRadius: 12, background: tone.bg, color: tone.color } },
        h('div', { style: { fontSize: 12, fontWeight: 700 } }, `${tone.label} · ${data.confidence?.score ?? 0}%`),
        missing.length > 0 && h('div', { style: { marginTop: 4, fontSize: 11, lineHeight: 1.45 } }, `Не хватает: ${missing.join(', ')}.`)
      ),
      assumptions.length > 0 && h('div', { style: { marginTop: 10, fontSize: 11, lineHeight: 1.5, color: '#6B7C93' } },
        assumptions.map((text, index) => h('div', { key: index }, `• ${text}`))
      ),
      h('div', { style: { marginTop: 12, fontSize: 11, lineHeight: 1.5, color: '#7A8BA3' } },
        `Версия модели ${data.modelVersion}. Это эвристическая оценка по составу еды, а не измерение гормонов или глюкозы.`
      ),
      data.hasOverlaps && h('div', { style: { marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,183,49,.10)', color: '#795500', fontSize: 11, lineHeight: 1.45 } },
        `Составы соседних приёмов частично накладываются по времени (${formatMinutes(data.worstOverlap?.overlapMinutes)}). Это контекст, а не запрет на следующий приём.`
      ),
      renderWaveHistory(data)
    );
  }

  function MealWaveExpandSection({ waveData, prevWave, nextWave }) {
    if (!React || !waveData) return null;
    const gap = nextWave ? nextWave.startMin - waveData.endMin : null;
    return h('div', { style: { margin: '8px 12px 12px', padding: 12, borderRadius: 14, background: '#F6F8FC', color: '#3D4B63' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 } },
        h('strong', null, waveData.responseShape?.label || 'Расчётное окно после еды'),
        h('span', { style: { color: '#2F6BFF', fontVariantNumeric: 'tabular-nums' } }, `${waveData.timeDisplay}–${waveData.endTimeDisplay}`)
      ),
      h('div', { style: { marginTop: 6, fontSize: 11, lineHeight: 1.45, color: '#6B7C93' } },
        `Диапазон длительности: ${formatMinutes(waveData.estimatedWindow?.lowerMinutes)}–${formatMinutes(waveData.estimatedWindow?.upperMinutes)}.`,
        gap !== null && h('span', null, ` Интервал до следующего приёма: ${formatMinutes(Math.max(0, gap))}.`)
      ),
      h('div', { style: { marginTop: 6, fontSize: 10, color: '#8A98AD' } }, 'Оценка не заменяет показатели CGM или лабораторные данные.')
    );
  }

  function ExpandedSectionComponent({ data }) {
    return h(Details, { data });
  }

  const renderExpandedSection = (data) => h(ExpandedSectionComponent, { data });
  const renderActivityContextBadge = (context) => context?.type && context.type !== 'none'
    ? h('span', { style: { fontSize: 11, color: '#52657D' } }, 'Учтена близкая по времени активность')
    : null;

  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.UI = {
    formatPostMealTime: formatMinutes,
    renderActivityContextBadge,
    MealWaveExpandSection,
    ProgressBarComponent: ({ data }) => renderProgressBar(data),
    renderProgressBar,
    renderWaveHistory,
    renderExpandedSection,
  };
})(typeof window !== 'undefined' ? window : globalThis);
