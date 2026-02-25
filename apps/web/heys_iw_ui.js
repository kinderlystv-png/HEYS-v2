// heys_iw_ui.js — InsulinWave UI Components Module
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль React UI компонентов для визуализации инсулиновой волны.
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.
//
// КОМПОНЕНТЫ:
// - formatLipolysisTime() — форматирование времени липолиза
// - renderActivityContextBadge() — плашка контекста активности
// - MealWaveExpandSection — развёрнутая секция волны приёма
// - ProgressBarComponent — компонент таймера с секундами
// - renderProgressBar() — прогресс бар волны
// - renderWaveHistory() — история волн за день
// - renderExpandedSection() — expandable секция

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // === ИМПОРТ УТИЛИТ ===
  const utils = HEYS.InsulinWave?.utils;

  // === ИМПОРТ ДРУГИХ МОДУЛЕЙ ===
  const Graph = HEYS.InsulinWave?.Graph;
  const renderWaveChart = Graph?.renderWaveChart;
  const NDTE = HEYS.InsulinWave?.NDTE;
  const renderNDTEBadge = NDTE?.renderNDTEBadge;

  const formatLipolysisTime = (minutes) => {
    if (minutes < 60) return `${minutes} мин`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}ч`;
    return `${h}ч ${m}м`;
  };


  // === 🏋️ HELPER: ПЛАШКА ACTIVITY CONTEXT (используется в нескольких местах) ===
  const renderActivityContextBadge = (activityContext, options = {}) => {
    if (!activityContext || activityContext.type === 'none') return null;

    const { compact = false } = options;

    // Цвета по типу контекста (все позитивные — зелёные оттенки)
    const colors = {
      peri: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🔥' },
      post: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '💪' },
      pre: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '⚡' },
      steps: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🚶' },
      morning: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🌅' },
      double: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🏆' },
      fasted: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '⚡' },
      default: { bg: '#22c55e22', border: '#22c55e44', text: '#16a34a', icon: '🏋️' }
    };
    const c = colors[activityContext.type] || colors.default;

    // Человекопонятные заголовки по типу
    const titles = {
      peri: 'Еда ВО ВРЕМЯ тренировки',
      post: 'Тренировка ускорила метаболизм',
      pre: 'Топливо для тренировки',
      steps: 'Активный день (10k+ шагов)',
      morning: 'Утренний буст метаболизма',
      double: 'Двойная нагрузка',
      fasted: 'Тренировка натощак'
    };
    const title = titles[activityContext.type] || 'Эффект тренировки';

    // Форматируем бонус волны
    const waveBonusPct = activityContext.waveBonus
      ? Math.abs(activityContext.waveBonus * 100).toFixed(0) + '% быстрее'
      : null;

    // Детали из контекста (если есть)
    const details = activityContext.details || {};
    let subtitle = '';

    if (activityContext.type === 'post' && details.trainingKcal) {
      // Например: "После 1331 ккал • волна −68%"
      subtitle = `После ${details.trainingKcal} ккал`;
      if (details.gapMin) {
        subtitle += ` • ${details.gapMin} мин назад`;
      }
    } else if (activityContext.type === 'peri') {
      subtitle = 'Глюкоза → сразу в мышцы';
    } else if (activityContext.type === 'pre' && details.gapMin) {
      subtitle = `${details.gapMin} мин до тренировки`;
    }

    return React.createElement('div', {
      className: 'activity-context-badge',
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: compact ? '8px' : '10px',
        padding: compact ? '8px 12px' : '10px 14px',
        marginBottom: '10px',
        borderRadius: '12px',
        background: c.bg,
        border: `1px solid ${c.border}`
      }
    },
      // Иконка
      React.createElement('span', {
        style: {
          fontSize: compact ? '20px' : '24px',
          lineHeight: 1,
          marginTop: '2px'
        }
      }, c.icon),

      // Текст
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        // Заголовок
        React.createElement('div', {
          style: {
            fontSize: compact ? '13px' : '14px',
            fontWeight: '600',
            color: c.text
          }
        }, title),
        // Подзаголовок
        subtitle && React.createElement('div', {
          style: {
            fontSize: '12px',
            color: '#64748b',
            marginTop: '2px'
          }
        }, subtitle)
      ),

      // Бейджи справа (вертикально)
      React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
          flexShrink: 0
        }
      },
        // Бонус волны
        waveBonusPct && React.createElement('div', {
          style: {
            fontSize: '12px',
            fontWeight: '700',
            color: '#22c55e',
            background: '#22c55e22',
            padding: '4px 8px',
            borderRadius: '6px'
          }
        }, waveBonusPct),
        // Снижение вреда
        activityContext.harmMultiplier && activityContext.harmMultiplier < 1 && React.createElement('div', {
          style: {
            fontSize: '11px',
            fontWeight: '600',
            color: '#3b82f6',
            background: '#3b82f622',
            padding: '4px 8px',
            borderRadius: '6px'
          }
        }, '🛡️ −' + Math.round((1 - activityContext.harmMultiplier) * 100) + '% вред')
      )
    );
  };


  // === Meal Wave Expand (для карточки приёма) ===
  function cardChipStyle(color) {
    return {
      background: color + '1A',
      color: '#0f172a',
      padding: '6px 8px',
      borderRadius: '8px',
      fontWeight: 600
    };
  }

  const MealWaveExpandSection = ({ waveData, prevWave, nextWave }) => {
    if (!waveData) return null;
    const normalize = utils.normalizeToHeysDay;

    // 🆕 v3.7.1: State для popup детализации волны
    const [showWaveDetails, setShowWaveDetails] = React.useState(false);

    // 🆕 v3.4.0: Activity Context badge
    const activityContext = waveData.activityContext;

    // === Данные для волн ===
    const waves = [];

    // Текущий приём
    const currentStart = normalize(waveData.startMin);
    let currentEnd = normalize(waveData.endMin);
    if (currentEnd <= currentStart) currentEnd += 24 * 60;
    const currentGI = waveData.gi || 50;
    const currentDuration = waveData.duration || 180;

    waves.push({
      id: 'current',
      label: waveData.mealName || 'Текущий приём',
      color: '#3b82f6',
      start: currentStart,
      end: currentEnd,
      gi: currentGI,
      duration: currentDuration,
      timeLabel: waveData.timeDisplay || waveData.time,
      endLabel: waveData.endTimeDisplay
    });

    // Предыдущий
    if (prevWave) {
      const s = normalize(prevWave.startMin);
      let e = normalize(prevWave.endMin);
      if (e <= s) e += 24 * 60;
      waves.push({
        id: 'prev',
        label: prevWave.mealName || 'Предыдущий',
        color: '#3b82f6',
        start: s,
        end: e,
        gi: prevWave.gi || 50,
        duration: prevWave.duration || 180,
        timeLabel: prevWave.timeDisplay || prevWave.time,
        endLabel: prevWave.endTimeDisplay
      });
    }

    // Следующий
    if (nextWave) {
      const s = normalize(nextWave.startMin);
      let e = normalize(nextWave.endMin);
      if (e <= s) e += 24 * 60;
      waves.push({
        id: 'next',
        label: nextWave.mealName || 'Следующий',
        color: '#f97316',
        start: s,
        end: e,
        gi: nextWave.gi || 50,
        duration: nextWave.duration || 180,
        timeLabel: nextWave.timeDisplay || nextWave.time,
        endLabel: nextWave.endTimeDisplay
      });
    }

    // Сортируем по времени начала
    waves.sort((a, b) => a.start - b.start);

    // === Overlaps ===
    const nextOverlap = nextWave && waveData.endMin > nextWave.startMin
      ? waveData.endMin - nextWave.startMin : 0;
    const prevOverlap = prevWave && prevWave.endMin > waveData.startMin
      ? prevWave.endMin - waveData.startMin : 0;
    const hasOverlap = (nextOverlap > 0) || (prevOverlap > 0);
    const lipolysisGap = nextWave ? Math.max(0, nextWave.startMin - waveData.endMin) : 0;

    // === SVG размеры ===
    const width = 320;
    const height = 120;
    const padding = { left: 20, right: 20, top: 18, bottom: 28 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Масштаб по времени
    const startMin = Math.min(...waves.map(w => w.start));
    const endMax = Math.max(...waves.map(w => w.end));
    const range = Math.max(1, endMax - startMin);
    const scaleX = (v) => padding.left + (v - startMin) / range * chartW;

    // === Генератор формы волны — 3-компонентная Gaussian модель (v4.1.2) ===
    // Компоненты: Fast (простые угл), Slow (основной ответ), Hepatic (печёночный хвост)
    const generateWavePath = (wave, baseY) => {
      const waveWidth = (wave.end - wave.start) / range * chartW;
      const waveStartX = scaleX(wave.start);
      const gi = wave.gi || 50;

      // === Параметры компонентов на основе GI (упрощённая версия calculateComponentParams) ===
      // Base values from WAVE_SHAPE_V2
      const baseFast = { peak: 0.20, sigma: 0.12, amplitude: 0.60 };
      const baseSlow = { peak: 0.45, sigma: 0.25, amplitude: 0.35 };
      const baseHepatic = { peak: 0.70, sigma: 0.35, amplitude: 0.05 };

      // GI-based modifiers (gi > 70 = faster peak, gi < 40 = slower response)
      const giHighMod = gi >= 70 ? 1.3 : 1.0;  // High GI → stronger fast component
      const giLowMod = gi <= 40 ? 1.4 : 1.0;   // Low GI → stronger slow component

      const fastAmp = baseFast.amplitude * giHighMod;
      const slowAmp = baseSlow.amplitude * giLowMod;
      const hepaticAmp = baseHepatic.amplitude;

      // Gaussian component function
      const gaussian = (t, peak, sigma, amplitude) => {
        return amplitude * Math.exp(-Math.pow(t - peak, 2) / (2 * sigma * sigma));
      };

      // Height scaling based on duration
      const peakHeight = Math.min(1, 0.5 + (wave.duration / 300) * 0.4);

      const points = [];
      const steps = 50; // More points for smoother curve

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Sum of 3 Gaussian components
        const fast = gaussian(t, baseFast.peak, baseFast.sigma, fastAmp);
        const slow = gaussian(t, baseSlow.peak, baseSlow.sigma, slowAmp);
        const hepatic = gaussian(t, baseHepatic.peak, baseHepatic.sigma, hepaticAmp);

        // Normalize sum (max ~1.0) and apply height
        const rawSum = fast + slow + hepatic;
        const normalizedSum = rawSum / (fastAmp + slowAmp + hepaticAmp); // Normalize to 0-1
        const y = normalizedSum * peakHeight;

        const x = waveStartX + t * waveWidth;
        const yPx = baseY - y * (chartH * 0.8);
        points.push({ x, y: yPx, t, value: y });
      }
      return points;
    };

    // Базовая линия (нижняя часть графика)
    const baseY = padding.top + chartH;

    // Генерируем пути для всех волн
    const wavePaths = waves.map(wave => {
      const points = generateWavePath(wave, baseY);
      const pathD = points.map((p, i) =>
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      ).join(' ');
      const fillPathD = `${pathD} L ${scaleX(wave.end)} ${baseY} L ${scaleX(wave.start)} ${baseY} Z`;
      return { wave, points, pathD, fillPathD };
    });

    // === Зоны перехлёста (overlap) — красная заливка ===
    const overlapZones = [];
    for (let i = 0; i < waves.length - 1; i++) {
      const w1 = waves[i];
      const w2 = waves[i + 1];
      if (w1.end > w2.start) {
        // Есть перехлёст
        overlapZones.push({
          start: w2.start,
          end: Math.min(w1.end, w2.end),
          minutes: Math.round(w1.end - w2.start)
        });
      }
    }

    // === Зона липолиза (зелёная) ===
    const lipolysisZones = [];
    for (let i = 0; i < waves.length - 1; i++) {
      const w1 = waves[i];
      const w2 = waves[i + 1];
      if (w1.end < w2.start) {
        lipolysisZones.push({
          start: w1.end,
          end: w2.start,
          minutes: Math.round(w2.start - w1.end)
        });
      }
    }

    // Градиент для фона
    const bgGradient = hasOverlap
      ? 'linear-gradient(135deg, rgba(254,226,226,0.5) 0%, rgba(254,202,202,0.3) 100%)'
      : 'linear-gradient(135deg, rgba(236,253,245,0.5) 0%, rgba(209,250,229,0.3) 100%)';

    return React.createElement('div', {
      className: 'meal-wave-content',
      style: {
        padding: '0 12px 12px 12px'
      }
    },
      // 🆕 v3.5.3: Activity Context badge (переиспользуемый helper)
      activityContext && renderActivityContextBadge(activityContext, { compact: false }),
      // === SVG ГРАФИК ===
      React.createElement('svg', {
        width: '100%',
        height,
        viewBox: `0 0 ${width} ${height}`,
        style: { display: 'block' }
      },
        // Градиенты
        React.createElement('defs', null,
          // Градиент для текущей волны
          React.createElement('linearGradient', { id: 'waveGradCurrent', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6', stopOpacity: 0.7 }),
            React.createElement('stop', { offset: '100%', stopColor: '#3b82f6', stopOpacity: 0.1 })
          ),
          // Градиент для предыдущей волны
          React.createElement('linearGradient', { id: 'waveGradPrev', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#3b82f6', stopOpacity: 0.05 })
          ),
          // Градиент для следующей волны
          React.createElement('linearGradient', { id: 'waveGradNext', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#f97316', stopOpacity: 0.6 }),
            React.createElement('stop', { offset: '100%', stopColor: '#f97316', stopOpacity: 0.1 })
          ),
          // Градиент для overlap
          React.createElement('linearGradient', { id: 'overlapGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: 0.2 })
          ),
          // Градиент для липолиза
          React.createElement('linearGradient', { id: 'lipolysisGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: 0.4 }),
            React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: 0.1 })
          )
        ),

        // Базовая линия
        React.createElement('line', {
          x1: padding.left,
          y1: baseY,
          x2: padding.left + chartW,
          y2: baseY,
          stroke: '#cbd5e1',
          strokeWidth: 1.5
        }),

        // === Зоны липолиза (зелёные) ===
        lipolysisZones.map((zone, i) => React.createElement('g', { key: 'lipo-' + i },
          React.createElement('rect', {
            x: scaleX(zone.start),
            y: padding.top,
            width: Math.max(4, (zone.end - zone.start) / range * chartW),
            height: chartH,
            fill: 'url(#lipolysisGrad)'
          }),
          // Иконка огня в центре
          React.createElement('text', {
            x: scaleX(zone.start) + (zone.end - zone.start) / range * chartW / 2,
            y: padding.top + chartH / 2 + 4,
            fontSize: 14,
            textAnchor: 'middle',
            fill: '#22c55e'
          }, '🔥')
        )),

        // === Зоны перехлёста (красные) ===
        overlapZones.map((zone, i) => React.createElement('g', { key: 'ovl-' + i },
          React.createElement('rect', {
            x: scaleX(zone.start),
            y: padding.top,
            width: Math.max(4, (zone.end - zone.start) / range * chartW),
            height: chartH,
            fill: 'url(#overlapGrad)'
          }),
          // Штриховка
          React.createElement('pattern', {
            id: 'hatch-' + i,
            patternUnits: 'userSpaceOnUse',
            width: 6,
            height: 6,
            patternTransform: 'rotate(45)'
          },
            React.createElement('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#ef4444', strokeWidth: 1.5, strokeOpacity: 0.3 })
          ),
          React.createElement('rect', {
            x: scaleX(zone.start),
            y: padding.top,
            width: Math.max(4, (zone.end - zone.start) / range * chartW),
            height: chartH,
            fill: 'url(#hatch-' + i + ')'
          }),
          // Иконка предупреждения
          React.createElement('text', {
            x: scaleX(zone.start) + (zone.end - zone.start) / range * chartW / 2,
            y: padding.top + chartH / 2 + 4,
            fontSize: 14,
            textAnchor: 'middle',
            fill: '#ef4444'
          }, '⚠️')
        )),

        // === Волны (кривые) ===
        wavePaths.map(({ wave, pathD, fillPathD }, idx) => {
          const gradId = wave.id === 'current' ? 'waveGradCurrent' :
            wave.id === 'prev' ? 'waveGradPrev' : 'waveGradNext';
          const zIndex = wave.id === 'current' ? 3 : wave.id === 'next' ? 2 : 1;
          return React.createElement('g', { key: 'wave-' + wave.id, style: { zIndex } },
            // Заливка
            React.createElement('path', {
              d: fillPathD,
              fill: 'url(#' + gradId + ')'
            }),
            // Линия кривой
            React.createElement('path', {
              d: pathD,
              fill: 'none',
              stroke: wave.color,
              strokeWidth: wave.id === 'current' ? 2.5 : 1.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              opacity: wave.id === 'current' ? 1 : 0.7
            })
          );
        }),

        // === Вертикальные пунктирные линии времён приёмов ===
        waves.map(wave => React.createElement('line', {
          key: 'vline-' + wave.id,
          x1: scaleX(wave.start),
          y1: padding.top - 4,
          x2: scaleX(wave.start),
          y2: baseY + 4,
          stroke: wave.color,
          strokeWidth: 1,
          strokeDasharray: '3,2',
          opacity: 0.6
        })),

        // === Метки времени снизу (с детекцией коллизий) ===
        (() => {
          // Собираем все метки: начала волн + конец текущей
          const currentWave = waves.find(w => w.id === 'current');
          const allLabels = [];

          // Метки начала волн
          waves.forEach((wave) => {
            allLabels.push({
              id: 'start-' + wave.id,
              x: scaleX(wave.start),
              time: wave.start,
              text: (wave.id === 'current' ? '🍽️' : '🍽️') + wave.timeLabel,
              color: wave.color,
              weight: wave.id === 'current' ? 600 : 500
            });
          });

          // Метка конца текущей волны
          allLabels.push({
            id: 'end-current',
            x: scaleX(currentWave.end),
            time: currentWave.end,
            text: (lipolysisGap > 0 ? '🔥' : '⚠️') + (waveData.endTimeDisplay || ''),
            color: lipolysisGap > 0 ? '#22c55e' : '#ef4444',
            weight: 600
          });

          // Сортируем по времени
          allLabels.sort((a, b) => a.time - b.time);

          // Вычисляем ширину каждой метки (примерно 7px на символ)
          const charWidth = 6;
          allLabels.forEach(label => {
            label.width = label.text.length * charWidth;
          });

          // Разрешаем коллизии — сдвигаем метки горизонтально
          const minGap = 4; // минимальный зазор между метками
          const adjustedX = allLabels.map(l => l.x);

          for (let i = 1; i < allLabels.length; i++) {
            const prevRight = adjustedX[i - 1] + allLabels[i - 1].width / 2;
            const currLeft = adjustedX[i] - allLabels[i].width / 2;
            const overlap = prevRight + minGap - currLeft;

            if (overlap > 0) {
              // Сдвигаем обе метки в разные стороны
              adjustedX[i - 1] -= overlap / 2;
              adjustedX[i] += overlap / 2;
            }
          }

          // Рендерим метки
          return allLabels.map((label, i) =>
            React.createElement('text', {
              key: label.id,
              x: adjustedX[i],
              y: height - 6,
              fontSize: 10,
              fill: label.color,
              textAnchor: 'middle',
              fontWeight: label.weight
            }, label.text)
          );
        })(),

        // === Легенда (если несколько волн) ===
        waves.length > 1 && React.createElement('g', null,
          waves.map((wave, idx) => {
            const legendX = padding.left + idx * 90;
            const legendY = padding.top - 8;
            return React.createElement('g', { key: 'leg-' + wave.id },
              React.createElement('circle', { cx: legendX, cy: legendY, r: 4, fill: wave.color }),
              React.createElement('text', {
                x: legendX + 8,
                y: legendY + 3,
                fontSize: 9,
                fill: '#64748b'
              }, wave.label)
            );
          })
        )
      ),

      // 🆕 v3.7.1: Popup детализации волны
      showWaveDetails && React.createElement('div', {
        className: 'wave-details-overlay',
        onClick: (e) => { if (e.target === e.currentTarget) setShowWaveDetails(false); },
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }
      },
        React.createElement('div', {
          className: 'wave-details-popup',
          style: {
            background: 'var(--card, #fff)',
            borderRadius: '16px',
            padding: '20px',
            maxWidth: '360px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        },
          // Заголовок
          React.createElement('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }
          },
            React.createElement('h3', {
              style: { margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text, #1f2937)' }
            }, '📊 Расчёт волны'),
            React.createElement('button', {
              onClick: () => setShowWaveDetails(false),
              style: {
                background: 'none', border: 'none', fontSize: '20px',
                cursor: 'pointer', color: '#9ca3af', padding: '4px'
              }
            }, '×')
          ),

          // Итоговая длина волны
          React.createElement('div', {
            style: {
              background: 'linear-gradient(135deg, #3b82f6, #3b82f6)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              textAlign: 'center',
              color: '#fff'
            }
          },
            React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } },
              'Длина волны'
            ),
            React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } },
              (waveData.waveHours || waveData.duration / 60).toFixed(1) + 'ч'
            ),
            React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } },
              waveData.timeDisplay + ' → ' + waveData.endTimeDisplay
            )
          ),

          // Формула
          React.createElement('div', {
            style: {
              background: 'var(--bg-secondary, #f8fafc)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#64748b',
              textAlign: 'center'
            }
          }, 'База × Множитель = ' + (waveData.baseWaveHours || 3).toFixed(1) + 'ч × ' +
          (waveData.finalMultiplier || 1).toFixed(2) + ' = ' +
          (waveData.waveHours || waveData.duration / 60).toFixed(1) + 'ч'
          ),

          // 🆕 v4.1.0: Легенда 3-компонентной Gaussian модели
          React.createElement('div', {
            style: {
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px'
            }
          },
            React.createElement('div', {
              style: { fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }
            }, '🧬 Научная модель волны'),
            React.createElement('div', {
              style: { fontSize: '11px', color: '#78350f', lineHeight: '1.5' }
            },
              'Форма кривой = сумма 3 компонентов инсулинового ответа:'
            ),
            React.createElement('div', { style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } },
              // Fast component
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '14px' } }, '⚡'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '11px', fontWeight: 600, color: '#f97316' } },
                    'Быстрый пик (15-25 мин)'
                  ),
                  React.createElement('div', { style: { fontSize: '10px', color: '#78350f' } },
                    'Простые углеводы, ГИ>70'
                  )
                )
              ),
              // Slow component
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '14px' } }, '🌿'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '11px', fontWeight: 600, color: '#22c55e' } },
                    'Основной ответ (45-60 мин)'
                  ),
                  React.createElement('div', { style: { fontSize: '10px', color: '#78350f' } },
                    'Сложные углеводы, белок, жиры'
                  )
                )
              ),
              // Hepatic component
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '14px' } }, '🫀'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: '11px', fontWeight: 600, color: '#8b5cf6' } },
                    'Печёночный хвост (90-120 мин)'
                  ),
                  React.createElement('div', { style: { fontSize: '10px', color: '#78350f' } },
                    'Клетчатка, медленное высвобождение'
                  )
                )
              )
            ),
            // Научная ссылка
            React.createElement('div', {
              style: {
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(146, 64, 14, 0.2)',
                fontSize: '10px',
                color: '#92400e'
              }
            }, '📚 Brand-Miller 2003, Holt 1997')
          ),

          // Факторы еды
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement('div', {
              style: { fontSize: '12px', fontWeight: 600, color: 'var(--text, #1f2937)', marginBottom: '8px' }
            }, '🍽️ Факторы еды'),

            // GI
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.gi || 0))
            ),
            // GL
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.gl < 10 ? '#22c55e' : waveData.gl > 20 ? '#ef4444' : '#1f2937' } },
                (waveData.gl || 0).toFixed(1) + (waveData.glCategory?.desc ? ' (' + waveData.glCategory.desc + ')' : '')
              )
            ),
            // Белок
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.protein || 0) + 'г')
            ),
            // Клетчатка
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.fiber >= 5 ? '#22c55e' : '#1f2937' } },
                Math.round(waveData.fiber || 0) + 'г'
              )
            ),
            // Жиры
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.fat || 0) + 'г')
            ),
            // Углеводы
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
              React.createElement('span', { style: { fontWeight: 500 } }, Math.round(waveData.carbs || 0) + 'г')
            ),
            // Жидкая еда
            waveData.hasLiquid && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#f97316' } }, '🥤 Жидкая еда'),
              React.createElement('span', { style: { fontWeight: 500, color: '#f97316' } }, '×' + (waveData.liquidMultiplier || 0.75).toFixed(2))
            ),
            // Инсулиногенность
            waveData.insulinogenicType && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, '🥛 Инсулиногенность'),
              React.createElement('span', { style: { fontWeight: 500 } }, waveData.insulinogenicType)
            )
          ),

          // Дневные факторы
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement('div', {
              style: { fontSize: '12px', fontWeight: 600, color: 'var(--text, #1f2937)', marginBottom: '8px' }
            }, '⏰ Дневные факторы'),

            // Циркадный ритм
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } },
                '×' + (waveData.circadianMultiplier || 1).toFixed(2)
              )
            ),
            // Дневные бонусы
            waveData.dayFactorsBonus && Math.abs(waveData.dayFactorsBonus) >= 0.005 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#64748b' } }, 'Сон/стресс/гидратация'),
              React.createElement('span', { style: { fontWeight: 500, color: waveData.dayFactorsBonus > 0 ? '#ef4444' : '#22c55e' } },
                (waveData.dayFactorsBonus > 0 ? '+' : '') + (waveData.dayFactorsBonus * 100).toFixed(0) + '%'
              )
            ),
            // Активность
            waveData.activityBonus && Math.abs(waveData.activityBonus) >= 0.005 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
              React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } },
                (waveData.activityBonus * 100).toFixed(0) + '%'
              )
            ),
            // 🆕 v3.7.1: NDTE (Next-Day Training Effect)
            waveData.ndteData && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { color: '#10b981' } }, '🔥 Вчера тренировка'),
              React.createElement('span', { style: { fontWeight: 500, color: '#10b981' } },
                '-' + Math.round(waveData.ndteData.waveReduction * 100) + '%'
              )
            )
          ),

          // Activity Context (если есть)
          activityContext && activityContext.type !== 'none' && React.createElement('div', {
            style: {
              marginBottom: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '10px',
              padding: '12px'
            }
          },
            React.createElement('div', {
              style: { fontSize: '12px', fontWeight: 600, color: '#10b981', marginBottom: '6px' }
            }, activityContext.badge),
            React.createElement('div', {
              style: { fontSize: '11px', color: '#64748b' }
            }, activityContext.desc),
            activityContext.waveBonus && React.createElement('div', {
              style: { fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: 500 }
            }, 'Волна: ' + (activityContext.waveBonus * 100).toFixed(0) + '%')
          ),

          // GL Scale info
          waveData.dayFactorsScale && waveData.dayFactorsScale < 1 && React.createElement('div', {
            style: {
              background: '#f0fdf4',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '11px',
              color: '#166534',
              marginBottom: '12px'
            }
          },
            '💡 При низкой GL (' + (waveData.gl || 0).toFixed(1) + ') дневные факторы применяются на ' +
            Math.round((waveData.dayFactorsScale || 1) * 100) + '%'
          ),

          // Кнопка закрытия
          React.createElement('button', {
            onClick: () => setShowWaveDetails(false),
            style: {
              width: '100%',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '8px'
            }
          }, 'Закрыть')
        )
      )
    );
  };

  /**
   * Рендер прогресс-бара волны
   * Компонент таймера с секундами
   */
  const ProgressBarComponent = ({ data }) => {
    const isLipolysis = data.status === 'lipolysis';
    const lipolysisMinutes = data.lipolysisMinutes || 0;
    const remainingMinutes = data.remaining || 0;

    // Состояние для секунд (обновляется каждую секунду)
    const [seconds, setSeconds] = React.useState(() => {
      const now = new Date();
      return 60 - now.getSeconds();
    });

    // Обновление секунд каждую секунду
    React.useEffect(() => {
      if (isLipolysis) return; // При липолизе не нужен countdown

      const interval = setInterval(() => {
        const now = new Date();
        setSeconds(60 - now.getSeconds());
      }, 1000);

      return () => clearInterval(interval);
    }, [isLipolysis]);

    // При липолизе — зелёный градиент
    const lipolysisGradient = 'linear-gradient(135deg, #22c55e 0%, #10b981 50%, #059669 100%)';

    // Форматирование времени для таймера
    const formatCountdown = (mins, secs) => {
      if (mins <= 0) return { h: '00', m: '00', s: '00' };
      const totalSecs = Math.max(0, Math.floor(mins * 60) - (60 - secs));
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return {
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0')
      };
    };

    const countdown = formatCountdown(remainingMinutes, seconds);

    // При липолизе: большой зелёный блок с таймером жиросжигания
    if (isLipolysis) {
      return React.createElement('div', {
        style: {
          background: lipolysisGradient,
          borderRadius: '16px',
          padding: '20px',
          textAlign: 'center',
          marginTop: '8px',
          boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
        }
      },
        React.createElement('div', {
          style: { fontSize: '13px', color: 'rgba(255,255,255,0.9)', marginBottom: '8px', fontWeight: '500' }
        }, '🔥 Жиросжигание активно'),
        React.createElement('div', {
          style: {
            fontSize: '36px',
            fontWeight: '800',
            color: '#fff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '2px',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }
        }, formatLipolysisTime(lipolysisMinutes)),
        // Плашка тренировки (если эффект от тренировки ускорил выход в липолиз)
        data.activityContext && React.createElement('div', { style: { marginTop: '12px' } },
          renderActivityContextBadge(data.activityContext, { compact: true, showDesc: false })
        )
      );
    }

    // При активной волне: большой таймер обратного отсчёта
    return React.createElement(React.Fragment, null,
      // Плашка тренировки (если есть) — ПОД таймером
      data.activityContext && data.activityContext.type !== 'none' && renderActivityContextBadge(data.activityContext, { compact: false, showDesc: true }),
      // Синий блок с таймером
      React.createElement('div', {
        style: {
          background: 'linear-gradient(135deg, #3b82f6 0%, #3b82f6 50%, #3b82f6 100%)',
          borderRadius: '16px',
          padding: '20px',
          textAlign: 'center',
          marginTop: '8px',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
        }
      },
        React.createElement('div', {
          style: { fontSize: '13px', color: 'rgba(255,255,255,0.9)', marginBottom: '8px', fontWeight: '500' }
        }, '⏱ Жиросжигание начнётся через'),
        // Большие цифры таймера
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: '4px',
            fontVariantNumeric: 'tabular-nums'
          }
        },
          // Часы
          React.createElement('span', {
            style: { fontSize: '42px', fontWeight: '800', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }
          }, countdown.h),
          React.createElement('span', {
            style: { fontSize: '24px', fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginRight: '8px' }
          }, ':'),
          // Минуты
          React.createElement('span', {
            style: { fontSize: '42px', fontWeight: '800', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }
          }, countdown.m),
          React.createElement('span', {
            style: { fontSize: '24px', fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginRight: '8px' }
          }, ':'),
          // Секунды
          React.createElement('span', {
            style: { fontSize: '42px', fontWeight: '800', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.2)' }
          }, countdown.s)
        ),
        // Подписи
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            marginTop: '4px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: '500'
          }
        },
          React.createElement('span', null, 'часов'),
          React.createElement('span', null, 'минут'),
          React.createElement('span', null, 'секунд')
        ),
        // График волны
        renderWaveChart(data)
      )
    );
  };


  const renderProgressBar = (data) => {
    return React.createElement(ProgressBarComponent, { data, key: 'progress-bar' });
  };

  /**
   * Рендер истории волн (мини-график)
   */
  const renderWaveHistory = (data) => {
    const history = data.waveHistory || [];
    if (history.length === 0) return null;

    const firstMealMin = Math.min(...history.map(w => w.startMin));
    const lastMealEnd = Math.max(...history.map(w => w.endMin));
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const rangeStart = firstMealMin - 15;
    const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
    const totalRange = rangeEnd - rangeStart;

    const w = 320;
    const h = 60;
    const padding = 4;
    const barY = 20;
    const barH = 18;

    const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);

    return React.createElement('div', {
      className: 'insulin-history',
      style: { marginTop: '12px', margin: '12px -8px 0 -8px' }
    },
      React.createElement('div', {
        style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' }
      }, '📊 Волны сегодня'),

      React.createElement('svg', {
        width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' }
      },
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
            React.createElement('stop', { offset: '100%', stopColor: '#3b82f6' })
          )
        ),

        // Фоновая линия
        React.createElement('line', {
          x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2,
          stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round'
        }),

        // Волны
        history.map((wave, i) => {
          const x1 = minToX(wave.startMin);
          const x2 = minToX(wave.endMin);
          const barW = Math.max(8, x2 - x1);
          const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';

          return React.createElement('g', { key: 'wave-' + i },
            React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor,
              opacity: wave.isActive ? 1 : 0.6,
              rx: 4
            }),
            wave.isActive && React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4,
              className: 'wave-active-pulse'
            })
          );
        }),

        // Точки приёмов
        history.map((wave, i) => {
          const x = minToX(wave.startMin);
          return React.createElement('g', { key: 'meal-' + i },
            React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
            React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
            React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' },
              utils.minutesToTime(wave.startMin))
          );
        }),

        // Текущее время
        (() => {
          const x = minToX(nowMin);
          if (x < padding || x > w - padding) return null;
          return React.createElement('g', null,
            React.createElement('line', { x1: x, y1: barY - 5, x2: x, y2: barY + barH + 5, stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
            React.createElement('polygon', { points: `${x - 4},${barY - 5} ${x + 4},${barY - 5} ${x},${barY}`, fill: '#ef4444' }),
            React.createElement('text', { x, y: barY - 8, fontSize: 8, fill: '#ef4444', textAnchor: 'middle', fontWeight: '600' }, 'Сейчас')
          );
        })()
      ),

      // Легенда
      React.createElement('div', {
        className: 'insulin-history-legend',
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #3b82f6', background: '#fff' } }),
          'Приём'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '16px', height: '8px', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #3b82f6)' } }),
          'Активная'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' } }),
          'Низкий ГИ'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#eab308' } }),
          'Средний'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '12px', height: '2px', background: '#ef4444' } }),
          'Сейчас'
        )
      )
    );
  };

  /**
   * Рендер expanded секции с детальной информацией
   */

  // === МИНИМАЛИСТИЧНЫЙ EXPANDED v2 (React Component) ===
  const ExpandedSectionComponent = ({ data }) => {
    const [expandedMetric, setExpandedMetric] = React.useState('wave'); // 'wave' | 'gi' | 'gl' | null — волна раскрыта по умолчанию
    const giCat = data.giCategory;

    // Стили для метрик-карточек
    const metricCardStyle = (isActive) => ({
      flex: '1 1 0',
      minWidth: '80px',
      padding: '12px 8px',
      background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'rgba(248, 250, 252, 0.8)',
      borderRadius: '12px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      border: isActive ? '2px solid #3b82f6' : '2px solid transparent'
    });

    const metricValueStyle = {
      fontSize: '20px',
      fontWeight: '700',
      color: 'var(--text, #1e293b)',
      lineHeight: 1.2
    };

    const metricLabelStyle = {
      fontSize: '11px',
      color: '#64748b',
      marginTop: '4px'
    };

    // Собираем активные модификаторы
    const getModifiers = () => {
      const mods = [];
      if (data.fatBonus > 0) mods.push({ icon: '🧈', name: 'Жиры', value: `+${Math.round(data.fatBonus * 100)}%`, desc: `${data.totalFat}г замедляют усвоение` });
      if (data.proteinBonus > 0) mods.push({ icon: '🥩', name: 'Белок', value: `+${Math.round(data.proteinBonus * 100)}%`, desc: `${data.totalProtein}г продлевают волну` });
      if (data.fiberBonus > 0) mods.push({ icon: '🌾', name: 'Клетчатка', value: `+${Math.round(data.fiberBonus * 100)}%`, desc: `${data.totalFiber}г замедляют` });
      // 🔬 v3.0.1: Показываем правильный label и иконку для insulinogenic
      if (data.insulinogenicBonus > 0) {
        const isProtein = data.insulinogenicType === 'protein';
        mods.push({
          icon: isProtein ? '🍖' : '🥛',
          name: isProtein ? 'Мясо/белок' : 'Молочка',
          value: `+${Math.round(data.insulinogenicBonus * 100)}%`,
          desc: 'повышает инсулин'
        });
      }
      if (data.hasLiquid) mods.push({ icon: '🥤', name: 'Жидкое', value: `×${data.liquidMultiplier}`, desc: 'быстрее усваивается' });
      if (data.hasWorkoutBonus) mods.push({ icon: '🏃', name: 'Тренировка', value: `-${Math.abs(Math.round(data.workoutBonus * 100))}%`, desc: `${data.workoutMinutes} мин ускоряют` });
      // 🆕 v1.5: Постпрандиальная активность
      if (data.hasPostprandialBonus) {
        const gapHours = Math.round(data.postprandialGapMinutes / 60 * 10) / 10;
        mods.push({
          icon: '🏃‍♂️',
          name: 'После еды',
          value: `-${Math.abs(Math.round(data.postprandialBonus * 100))}%`,
          desc: `тренировка через ${gapHours}ч ускоряет утилизацию глюкозы`
        });
      }
      // 🆕 v1.5: NEAT (бытовая активность)
      if (data.hasNeatBonus) {
        mods.push({
          icon: '🏡',
          name: 'Бытовая активность',
          value: `-${Math.abs(Math.round(data.neatBonus * 100))}%`,
          desc: `${data.householdMin} мин улучшают чувствительность к инсулину`
        });
      }
      // 🆕 v1.5: Шаги
      if (data.hasStepsBonus) {
        mods.push({
          icon: '🚶',
          name: 'Шаги',
          value: `-${Math.abs(Math.round(data.stepsBonus * 100))}%`,
          desc: `${Math.round(data.steps / 1000)}k шагов ускоряют метаболизм`
        });
      }
      if (data.circadianMultiplier && data.circadianMultiplier !== 1.0) {
        mods.push({
          icon: data.circadianMultiplier < 1 ? '☀️' : '🌙',
          name: 'Время суток',
          value: `×${data.circadianMultiplier}`,
          desc: data.circadianMultiplier < 1 ? 'днём быстрее' : 'ночью медленнее'
        });
      }
      if (data.hasCaffeineBonus) mods.push({ icon: '☕', name: 'Кофеин', value: `+${Math.round(data.caffeineBonus * 100)}%`, desc: 'повышает инсулин' });
      if (data.hasStressBonus) mods.push({ icon: '😰', name: 'Стресс', value: `+${Math.round(data.stressBonus * 100)}%`, desc: 'кортизол влияет' });
      if (data.hasSleepBonus) mods.push({ icon: '😴', name: 'Недосып', value: `+${Math.round(data.sleepDeprivationBonus * 100)}%`, desc: 'инсулинорезистентность' });
      // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
      if (data.hasNDTE && data.ndteWaveReduction > 0) {
        const ndte = data.ndte || {};
        mods.push({
          icon: '🔥',
          name: 'Вчера тренировка',
          value: `-${Math.round(data.ndteWaveReduction * 100)}%`,
          desc: `${ndte.trainingKcal || '?'} ккал → инсулин.чувств. выше ${Math.round(ndte.hoursSince || 0)}ч`
        });
      }
      return mods;
    };

    const modifiers = getModifiers();

    // Детали для каждой метрики
    const getMetricDetails = (metric) => {
      switch (metric) {
        case 'wave': {
          // Формируем формулу расчёта
          const baseHrs = data.baseWaveHours || 3; // Fallback на 3ч если NaN
          const parts = [`${baseHrs}ч (база)`];
          if (data.giMultiplier && data.giMultiplier !== 1) parts.push(`×${data.giMultiplier} ГИ`);
          if (data.fatBonus > 0) parts.push(`+${Math.round(data.fatBonus * 100)}% жиры`);
          if (data.proteinBonus > 0) parts.push(`+${Math.round(data.proteinBonus * 100)}% белок`);
          if (data.fiberBonus > 0) parts.push(`+${Math.round(data.fiberBonus * 100)}% клетчатка`);
          // 🔬 v3.0.1: Показываем правильный label (молочка/мясо) в зависимости от типа
          if (data.insulinogenicBonus > 0) {
            const insLabel = data.insulinogenicType === 'protein' ? 'мясо' : 'молочка';
            parts.push(`+${Math.round(data.insulinogenicBonus * 100)}% ${insLabel}`);
          }
          if (data.hasLiquid) parts.push(`×${data.liquidMultiplier} жидкое`);
          if (data.hasWorkoutBonus) parts.push(`-${Math.abs(Math.round(data.workoutBonus * 100))}% тренировка`);
          // 🆕 v1.5: Новые бонусы активности
          if (data.hasPostprandialBonus) parts.push(`-${Math.abs(Math.round(data.postprandialBonus * 100))}% активность после еды`);
          if (data.hasNeatBonus) parts.push(`-${Math.abs(Math.round(data.neatBonus * 100))}% бытовая активность`);
          if (data.hasStepsBonus) parts.push(`-${Math.abs(Math.round(data.stepsBonus * 100))}% шаги`);
          if (data.circadianMultiplier && data.circadianMultiplier !== 1.0) parts.push(`×${data.circadianMultiplier} ${data.circadianMultiplier < 1 ? 'день' : 'ночь'}`);
          if (data.hasCaffeineBonus) parts.push(`+${Math.round(data.caffeineBonus * 100)}% кофеин`);
          if (data.hasStressBonus) parts.push(`+${Math.round(data.stressBonus * 100)}% стресс`);
          if (data.hasSleepBonus) parts.push(`+${Math.round(data.sleepDeprivationBonus * 100)}% недосып`);
          // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
          if (data.hasNDTE && data.ndteWaveReduction > 0) parts.push(`-${Math.round(data.ndteWaveReduction * 100)}% NDTE`);

          const formula = parts.join(' ');

          // Защита от NaN
          const waveHours = data.insulinWaveHours && !isNaN(data.insulinWaveHours)
            ? Math.round(data.insulinWaveHours * 10) / 10
            : '?';

          return {
            title: '📊 Расчёт волны',
            formula: formula,
            result: `= ${waveHours}ч`,
            items: modifiers.map(m => ({ label: `${m.icon} ${m.name}`, value: m.value, desc: m.desc })),
            desc: 'Время, пока инсулин высокий и жир не сжигается'
          };
        }
        case 'gi':
          return {
            title: '🍬 Гликемический индекс',
            items: [
              { label: 'Средний ГИ', value: data.avgGI || '—' },
              { label: 'Категория', value: giCat.text },
              { label: 'Усвоение', value: giCat.desc }
            ],
            desc: giCat.id === 'low' ? 'Низкий ГИ = медленный подъём сахара' :
              giCat.id === 'high' ? 'Высокий ГИ = быстрый скачок сахара' :
                'Средний ГИ = умеренный подъём сахара'
          };
        case 'gl':
          return {
            title: '📈 Гликемическая нагрузка',
            items: [
              { label: 'GL', value: data.glycemicLoad || '—' },
              { label: 'Категория', value: data.glCategory?.text || 'Средняя' },
              { label: 'Углеводы', value: `${data.totalCarbs || 0}г` }
            ],
            desc: 'GL = ГИ × углеводы / 100. Показывает реальную нагрузку на поджелудочную'
          };
        default:
          return null;
      }
    };

    const toggleMetric = (metric) => {
      setExpandedMetric(expandedMetric === metric ? null : metric);
    };

    const details = expandedMetric ? getMetricDetails(expandedMetric) : null;

    return React.createElement('div', {
      className: 'insulin-wave-expanded',
      onClick: (e) => e.stopPropagation()
    },

      // === БЛОК 1: Метрики (3 кликабельные карточки) ===
      React.createElement('div', {
        style: { display: 'flex', gap: '8px', marginBottom: details ? '12px' : '16px' }
      },
        // Карточка: Волна
        React.createElement('div', {
          style: metricCardStyle(expandedMetric === 'wave'),
          onClick: () => toggleMetric('wave')
        },
          React.createElement('div', { style: metricValueStyle },
            `${Math.round(data.insulinWaveHours * 10) / 10}ч`
          ),
          React.createElement('div', { style: metricLabelStyle }, 'волна ⓘ')
        ),
        // Карточка: ГИ
        React.createElement('div', {
          style: { ...metricCardStyle(expandedMetric === 'gi'), background: expandedMetric === 'gi' ? `${giCat.color}20` : `${giCat.color}15` },
          onClick: () => toggleMetric('gi')
        },
          React.createElement('div', { style: { ...metricValueStyle, color: giCat.color } },
            data.avgGI || '—'
          ),
          React.createElement('div', { style: metricLabelStyle }, 'ГИ ⓘ')
        ),
        // Карточка: GL
        React.createElement('div', {
          style: metricCardStyle(expandedMetric === 'gl'),
          onClick: () => toggleMetric('gl')
        },
          React.createElement('div', { style: metricValueStyle },
            data.glycemicLoad > 0 ? data.glycemicLoad : '—'
          ),
          React.createElement('div', { style: metricLabelStyle }, 'GL ⓘ')
        )
      ),

      // === Детали выбранной метрики (выпадающий блок) ===
      details && React.createElement('div', {
        style: {
          padding: '12px 16px',
          background: 'var(--bg-secondary, #f8fafc)',
          borderRadius: '12px',
          marginBottom: '16px',
          animation: 'fadeIn 0.2s ease'
        }
      },
        React.createElement('div', {
          style: { fontSize: '14px', fontWeight: '600', color: 'var(--text, #1e293b)', marginBottom: '10px' }
        }, details.title),

        // Для волны — формула расчёта
        details.formula && React.createElement('div', {
          style: {
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.03)',
            borderRadius: '8px',
            marginBottom: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }
        },
          // Формула
          React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', lineHeight: 1.6, wordBreak: 'break-word' }
          }, details.formula),
          // Результат
          React.createElement('div', {
            style: {
              fontSize: '18px',
              fontWeight: '700',
              color: 'var(--text, #1e293b)',
              marginTop: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }
          },
            React.createElement('span', null, details.result),
            React.createElement('span', {
              style: { fontSize: '12px', color: '#64748b', fontWeight: '400' }
            }, 'инсулиновая волна')
          )
        ),

        // Список модификаторов (для волны) или значений (для других)
        details.items?.length > 0 && React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '6px' }
        },
          details.items.map((item, i) =>
            React.createElement('div', {
              key: i,
              style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' }
            },
              React.createElement('span', { style: { color: '#64748b' } }, item.label),
              React.createElement('span', {
                style: {
                  fontWeight: '600',
                  color: item.value?.startsWith?.('-') ? '#16a34a' :
                    item.value?.startsWith?.('+') ? '#f59e0b' : '#1e293b'
                }
              }, item.value)
            )
          )
        ),

        // Описание
        React.createElement('div', {
          style: { marginTop: '10px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }
        }, details.desc)
      ),

      // === БЛОК 2: Паттерны (если есть данные) ===
      data.personalAvgGap > 0 && React.createElement('div', {
        style: {
          padding: '12px 16px',
          background: 'rgba(248, 250, 252, 0.8)',
          borderRadius: '12px',
          marginBottom: '16px'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: '13px',
            fontWeight: '600',
            color: '#475569',
            marginBottom: '8px'
          }
        }, '🎯 Паттерны'),
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px'
          }
        },
          React.createElement('span', { style: { color: '#64748b' } }, 'Средний gap'),
          React.createElement('span', { style: { fontWeight: '600', color: 'var(--text, #1e293b)' } },
            utils.formatDuration(data.personalAvgGap)
          )
        ),
        // Оценка качества
        React.createElement('div', {
          style: {
            marginTop: '10px',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            textAlign: 'center',
            background: data.gapQuality === 'excellent' ? '#dcfce7' :
              data.gapQuality === 'good' ? '#fef9c3' :
                data.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
            color: data.gapQuality === 'excellent' ? '#166534' :
              data.gapQuality === 'good' ? '#854d0e' :
                data.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
          }
        },
          data.gapQuality === 'excellent' ? '✓ Отлично!' :
            data.gapQuality === 'good' ? '👍 Хорошо' :
              data.gapQuality === 'moderate' ? '→ Можно лучше' : '⚠️ Слишком часто'
        )
      ),

      // === БЛОК 3: Текущее состояние ===
      React.createElement('div', {
        style: {
          padding: '12px 16px',
          background: data.status === 'lipolysis'
            ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.12))'
            : 'rgba(248, 250, 252, 0.8)',
          borderRadius: '12px',
          marginBottom: modifiers.length > 0 || data.hasOverlaps ? '12px' : '0'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: '13px',
            fontWeight: '600',
            color: data.status === 'lipolysis' ? '#16a34a' : '#475569',
            marginBottom: '6px'
          }
        }, data.status === 'lipolysis' ? '🔥 Жиросжигание' : '💡 Сейчас'),
        React.createElement('div', {
          style: {
            fontSize: '14px',
            color: '#334155',
            lineHeight: 1.5
          }
        },
          data.status === 'lipolysis'
            ? 'Каждая минута без еды = сжигание жира'
            : 'Инсулин высокий → жир запасается'
        ),
        // Подсказка
        React.createElement('div', {
          style: {
            marginTop: '8px',
            fontSize: '13px',
            color: '#64748b',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }
        },
          React.createElement('span', null, '💧 Вода ок'),
          data.status !== 'lipolysis' && React.createElement('span', null, '🚫 Еда продлит волну')
        )
      ),

      // === Предупреждение о перекрытии ===
      data.hasOverlaps && React.createElement('div', {
        style: {
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.08)',
          borderRadius: '12px',
          marginBottom: '12px',
          border: '1px solid rgba(239,68,68,0.2)'
        }
      },
        React.createElement('div', {
          style: { fontSize: '13px', fontWeight: '600', color: '#dc2626' }
        }, '⚠️ Волны пересеклись'),
        React.createElement('div', {
          style: { fontSize: '13px', color: '#64748b', marginTop: '4px' }
        }, `Совет: подожди ${Math.round(data.baseWaveHours * 60)} мин между приёмами`)
      ),

      // Блок модификаторов убран — формула теперь в деталях волны

      // === История волн ===
      renderWaveHistory(data)
    );
  };

  // Wrapper для вызова как функции (возвращает React element)
  const renderExpandedSection = (data) => {
    return React.createElement(ExpandedSectionComponent, { data, key: 'expanded-section' });
  };

  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.UI = {
    formatLipolysisTime,
    renderActivityContextBadge,
    MealWaveExpandSection,
    ProgressBarComponent,
    renderProgressBar,
    renderWaveHistory,
    renderExpandedSection
  };

})(typeof window !== 'undefined' ? window : global);
