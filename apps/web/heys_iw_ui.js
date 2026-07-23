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

  const missingInputLabel = (field) => field === 'foodForm' ? 'форма продуктов' : field;

  const signedMinutes = (minutes) => {
    const value = Math.round((Number(minutes) || 0) * 10) / 10;
    if (value === 0) return '0 мин';
    return `${value > 0 ? '+' : '−'}${Math.abs(value)} мин`;
  };

  function CalculationTrace({ data }) {
    const calculation = data?.estimatedWindow?.calculation;
    if (!calculation) return null;
    const contributions = Array.isArray(calculation.contributions) ? calculation.contributions : [];
    const rangeWasCapped = calculation.centralWasCapped || calculation.lowerWasCapped || calculation.upperWasCapped;
    return h('div', { style: {
      marginTop: 10, padding: '11px 12px', borderRadius: 12,
      background: 'rgba(67,69,135,.055)', border: '1px solid rgba(67,69,135,.10)',
    } },
      h('div', { style: { fontSize: 11, fontWeight: 750, color: '#434587', marginBottom: 7 } }, 'Диагностика расчёта'),
      h('div', { style: { display: 'grid', gap: 5 } },
        contributions.map((item) => h('div', {
          key: item.code,
          style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, fontSize: 10.5, lineHeight: 1.35 },
        },
          h('span', { style: { color: '#63738A' } }, `${item.label}: ${item.formula}`),
          h('span', { style: { color: '#33435A', fontWeight: 650, fontVariantNumeric: 'tabular-nums' } }, signedMinutes(item.minutes))
        ))
      ),
      calculation.fallbackApplied && h('div', { style: { marginTop: 7, fontSize: 10.5, color: '#9A6700' } },
        `Недостаточно входных данных: применена резервная оценка ${calculation.fallbackMinutes} мин.`
      ),
      h('div', { style: { marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(67,69,135,.10)', fontSize: 10.5, lineHeight: 1.5, color: '#52657D' } },
        calculation.centralWasCapped && h(React.Fragment, null,
          `Расчёт до ограничения: ${formatMinutes(calculation.rawCentralMinutes)}`,
          h('br'),
          `Применён предел модели: ${formatMinutes(calculation.centralMinutes)}`,
          h('br')
        ),
        rangeWasCapped
          ? `Исходная неопределённость модели: ${calculation.uncertaintyPercent}%; границы ограничены пределами.`
          : `Центр: ${formatMinutes(calculation.centralMinutes)} · неопределённость ±${calculation.uncertaintyPercent}%`,
        h('br'),
        `${rangeWasCapped ? 'Диапазон после ограничений' : 'Диапазон'}: ${formatMinutes(calculation.lowerMinutes)}–${formatMinutes(calculation.upperMinutes)} · таймер до верхней границы ${formatMinutes(calculation.upperMinutes)}`
      )
    );
  }

  const renderCalculationTrace = (data) => h(CalculationTrace, { data });

  function renderProgressBar(data) {
    if (!React || !data) return null;
    const completed = (data.rangeStatus || data.status) === 'complete';
    const progress = Math.max(0, Math.min(100, Number(data.rangeProgress ?? data.progress) || 0));
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
    const isCuratorSession = HEYS.auth?.isCuratorSession?.() === true;
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
        missing.length > 0 && h('div', { style: { marginTop: 4, fontSize: 11, lineHeight: 1.45 } }, `Не хватает: ${missing.map(missingInputLabel).join(', ')}.`)
      ),
      assumptions.length > 0 && h('div', { style: { marginTop: 10, fontSize: 11, lineHeight: 1.5, color: '#6B7C93' } },
        assumptions.map((text, index) => h('div', { key: index }, `• ${text}`))
      ),
      renderCalculationTrace(data),
      h('div', { style: { marginTop: 12, fontSize: 11, lineHeight: 1.5, color: '#7A8BA3' } },
        `Версия модели ${data.modelVersion}. Это эвристическая неперсонализированная оценка по составу еды, а не измерение гормонов или глюкозы.`
      ),
      h('div', { style: {
        marginTop: 12, padding: '11px 12px', borderRadius: 12,
        background: 'rgba(47,107,255,.07)', color: '#33435A', fontSize: 11, lineHeight: 1.5,
      } },
        h('div', { style: { marginBottom: 4, color: '#2F6BFF', fontWeight: 750 } }, 'Как использовать'),
        h('div', null,
          'Если голода нет и следующий приём не запланирован, таймер помогает выдержать паузу. При голоде, слабости или по плану можно есть раньше. Для снижения жировой массы важнее средний энергетический баланс, тренд веса, достаточное количество белка и силовые тренировки.'
        )
      ),
      isCuratorSession && h('div', { style: {
        marginTop: 10, padding: '11px 12px', borderRadius: 12,
        background: 'rgba(67,69,135,.055)', border: '1px solid rgba(67,69,135,.10)',
        color: '#52657D', fontSize: 11, lineHeight: 1.5,
      } },
        h('div', { style: { marginBottom: 4, color: '#434587', fontWeight: 750 } }, 'Для куратора'),
        h('div', null,
          'Для разбора с клиентом сначала оцените тренд веса и энергетического баланса, белок, силовые тренировки, голод и соблюдаемость плана. Расчёт окна используйте как вторичный контекст состава и времени приёма.'
        )
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
        h('strong', null, waveData.responseShape?.label || 'Окно для сжигания жира'),
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
    renderCalculationTrace,
    renderExpandedSection,
  };
})(typeof window !== 'undefined' ? window : globalThis);
