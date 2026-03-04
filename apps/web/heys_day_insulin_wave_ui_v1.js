// heys_day_insulin_wave_ui_v1.js — insulin wave indicator UI
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.renderInsulinWaveIndicator = function renderInsulinWaveIndicator({
    React,
    insulinWaveData,
    insulinExpanded,
    setInsulinExpanded,
    mobileSubTab,
    isMobile,
    openExclusivePopup,
    HEYS
  }) {
    if (!insulinWaveData) return null;
    if (isMobile && mobileSubTab !== 'diary') return null;

    const heys = HEYS || window.HEYS || {};
    const IW = heys.InsulinWave;

    // Мягкий shake когда осталось ≤30 мин до липолиза (almost или soon)
    const shouldShake = insulinWaveData.status === 'almost' || insulinWaveData.status === 'soon';

    // GI info — из модуля или fallback
    const giInfo = insulinWaveData.giCategory?.text
      ? insulinWaveData.giCategory // модуль возвращает объект
      : { // fallback для старого формата
        low: { text: 'Низкий ГИ', color: '#22c55e', desc: 'медленное усвоение' },
        medium: { text: 'Средний ГИ', color: '#eab308', desc: 'нормальное' },
        high: { text: 'Высокий ГИ', color: '#f97316', desc: 'быстрое' },
        'very-high': { text: 'Очень высокий ГИ', color: '#ef4444', desc: 'очень быстрое' }
      }[insulinWaveData.giCategory] || { text: 'Средний ГИ', color: '#eab308', desc: 'нормальное' };

    // Форматирование времени липолиза
    const formatLipolysisTime = (minutes) => {
      if (minutes < 60) return `${minutes} мин`;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    };

    // Прогресс-бар (из модуля или inline)
    const renderProgressBar = () => {
      if (IW && IW.renderProgressBar) {
        return IW.renderProgressBar(insulinWaveData);
      }

      const progress = insulinWaveData.progress;
      const isLipolysis = insulinWaveData.status === 'lipolysis';
      const lipolysisMinutes = insulinWaveData.lipolysisMinutes || 0;
      const remainingMinutes = insulinWaveData.remaining || 0;

      // Форматирование оставшегося времени
      const formatRemaining = (mins) => {
        if (mins <= 0) return 'скоро';
        if (mins < 60) return `${Math.round(mins)} мин`;
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
      };

      const gradientBg = isLipolysis
        ? 'linear-gradient(90deg, #22c55e, #10b981, #059669)'
        : insulinWaveData.status === 'almost'
          ? 'linear-gradient(90deg, #f97316, #fb923c, #fdba74)'
          : insulinWaveData.status === 'soon'
            ? 'linear-gradient(90deg, #eab308, #facc15, #fde047)'
            : 'linear-gradient(90deg, #0284c7, #0ea5e9, #38bdf8)';

      return React.createElement('div', { className: 'insulin-wave-progress' },
        React.createElement('div', {
          className: isLipolysis ? 'insulin-wave-bar lipolysis-progress-fill' : 'insulin-wave-bar',
          style: {
            width: '100%',
            background: gradientBg,
            height: '28px',
            borderRadius: '8px',
            transition: 'all 0.3s ease'
          }
        }),
        !isLipolysis && React.createElement('div', { className: 'insulin-wave-animation' }),
        // При липолизе: крупный таймер 🔥
        isLipolysis ? React.createElement('div', {
          className: 'lipolysis-timer-display',
          style: {
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '14px', fontWeight: '800', color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2
          }
        },
          React.createElement('span', null, formatLipolysisTime(lipolysisMinutes)),
          React.createElement('span', { style: { fontSize: '11px', opacity: 0.9, fontWeight: '600' } }, 'жиросжигание')
        )
          // При активной волне: время до липолиза
          : React.createElement('div', {
            style: {
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '14px', fontWeight: '700', color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2
            }
          },
            React.createElement('span', { style: { fontSize: '12px' } }, '⏱'),
            React.createElement('span', null, 'до липолиза: ' + formatRemaining(remainingMinutes))
          )
      );
    };

    // История волн (из модуля или inline)
    const renderWaveHistory = () => {
      if (IW && IW.renderWaveHistory) {
        return IW.renderWaveHistory(insulinWaveData);
      }

      const history = insulinWaveData.waveHistory || [];
      if (history.length === 0) return null;

      const firstMealMin = Math.min(...history.map(w => w.startMin));
      const lastMealEnd = Math.max(...history.map(w => w.endMin));
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const rangeStart = firstMealMin - 15;
      const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
      const totalRange = rangeEnd - rangeStart;

      const w = 320, h = 60, padding = 4, barY = 20, barH = 18;
      const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);
      const formatTime = (min) => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

      return React.createElement('div', { className: 'insulin-history', style: { marginTop: '12px', margin: '12px -8px 0 -8px' } },
        React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' } }, '📊 Волны сегодня'),
        React.createElement('svg', { width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' } },
          React.createElement('defs', null,
            React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
              React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
              React.createElement('stop', { offset: '100%', stopColor: '#3b82f6' })
            )
          ),
          React.createElement('line', { x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2, stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round' }),
          history.map((wave, i) => {
            const x1 = minToX(wave.startMin), x2 = minToX(wave.endMin), barW = Math.max(8, x2 - x1);
            const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';
            return React.createElement('g', { key: 'wave-' + i },
              React.createElement('rect', { x: x1, y: barY, width: barW, height: barH, fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor, opacity: wave.isActive ? 1 : 0.6, rx: 4 }),
              wave.isActive && React.createElement('rect', { x: x1, y: barY, width: barW, height: barH, fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4, className: 'wave-active-pulse' })
            );
          }),
          history.map((wave, i) => {
            const x = minToX(wave.startMin);
            return React.createElement('g', { key: 'meal-' + i },
              React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
              React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
              React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' }, formatTime(wave.startMin))
            );
          }),
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
        React.createElement('div', { className: 'insulin-history-legend', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' } },
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

    // Expanded секция (полная версия из модуля или inline)
    const renderExpandedSection = () => {
      if (IW && IW.renderExpandedSection) {
        return IW.renderExpandedSection(insulinWaveData);
      }

      // Inline fallback с расширенными данными
      const formatDuration = (min) => {
        if (min <= 0) return '0 мин';
        const h = Math.floor(min / 60), m = Math.round(min % 60);
        return h > 0 ? (m > 0 ? `${h}ч ${m}м` : `${h}ч`) : `${m} мин`;
      };

      return React.createElement('div', { className: 'insulin-wave-expanded', onClick: e => e.stopPropagation() },
        // ГИ информация
        React.createElement('div', { className: 'insulin-gi-info' },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: giInfo.color } }),
            React.createElement('span', { style: { fontWeight: '600' } }, giInfo.text),
            React.createElement('span', { style: { color: '#64748b', fontSize: '12px' } }, '— ' + (giInfo.desc || ''))
          ),
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
            `Базовая волна: ${insulinWaveData.baseWaveHours}ч → Скорректированная: ${Math.round(insulinWaveData.insulinWaveHours * 10) / 10}ч`
          ),
          // Модификаторы белок/клетчатка
          (insulinWaveData.proteinBonus > 0 || insulinWaveData.fiberBonus > 0) &&
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' } },
            insulinWaveData.totalProtein > 0 && React.createElement('span', null,
              `🥩 Белок: ${insulinWaveData.totalProtein}г${insulinWaveData.proteinBonus > 0 ? ` (+${Math.round(insulinWaveData.proteinBonus * 100)}%)` : ''}`
            ),
            insulinWaveData.totalFiber > 0 && React.createElement('span', null,
              `🌾 Клетчатка: ${insulinWaveData.totalFiber}г${insulinWaveData.fiberBonus > 0 ? ` (+${Math.round(insulinWaveData.fiberBonus * 100)}%)` : ''}`
            )
          ),
          // 🏃 Workout бонус
          insulinWaveData.hasWorkoutBonus &&
          React.createElement('div', { style: { fontSize: '11px', color: '#22c55e', marginTop: '4px' } },
            `🏃 Тренировка ${insulinWaveData.workoutMinutes} мин → волна ${Math.abs(Math.round(insulinWaveData.workoutBonus * 100))}% короче`
          ),
          // 🌅 Circadian rhythm
          insulinWaveData.circadianMultiplier && insulinWaveData.circadianMultiplier !== 1.0 &&
          React.createElement('div', { style: { fontSize: '11px', color: insulinWaveData.circadianMultiplier < 1 ? '#22c55e' : '#f97316', marginTop: '4px' } },
            insulinWaveData.circadianDesc || `⏰ Время суток: ${insulinWaveData.circadianMultiplier < 1 ? 'быстрее' : 'медленнее'}`
          )
        ),

        // 🧪 v3.2.0: Шкала липолиза — уровень инсулина
        (() => {
          const IW = heys.InsulinWave;
          if (!IW || !IW.estimateInsulinLevel) return null;
          const insulinLevel = IW.estimateInsulinLevel(insulinWaveData.progress || 0);

          return React.createElement('div', {
            className: 'insulin-lipolysis-scale',
            style: { marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }
          },
            // Заголовок
            React.createElement('div', {
              style: { fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }
            }, '🧪 Уровень инсулина (оценка)'),

            // Шкала — градиент
            React.createElement('div', {
              style: {
                height: '8px',
                borderRadius: '4px',
                background: 'linear-gradient(to right, #22c55e 0%, #22c55e 5%, #eab308 15%, #f97316 50%, #ef4444 100%)',
                position: 'relative'
              }
            },
              // Маркер текущего уровня
              React.createElement('div', {
                style: {
                  position: 'absolute',
                  left: `${Math.min(100, Math.max(0, insulinLevel.level))}%`,
                  top: '-4px',
                  width: '4px',
                  height: '16px',
                  background: 'var(--card, #fff)',
                  borderRadius: '2px',
                  boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                  transform: 'translateX(-50%)',
                  transition: 'left 0.3s ease'
                }
              })
            ),

            // Метки под шкалой
            React.createElement('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: '#94a3b8',
                marginTop: '4px'
              }
            },
              React.createElement('span', null, '🟢 <5'),
              React.createElement('span', null, '🟡 15'),
              React.createElement('span', null, '🟠 50'),
              React.createElement('span', null, '🔴 100+')
            ),

            // Текущий уровень и описание
            React.createElement('div', {
              style: {
                textAlign: 'center',
                fontSize: '13px',
                color: insulinLevel.color,
                marginTop: '8px',
                fontWeight: '600'
              }
            }, `~${insulinLevel.level} µЕд/мл • ${insulinLevel.desc}`),

            // Подсказка о жиросжигании
            insulinLevel.lipolysisPct < 100 && React.createElement('div', {
              style: {
                fontSize: '11px',
                color: '#64748b',
                textAlign: 'center',
                marginTop: '4px'
              }
            }, `Жиросжигание: ~${insulinLevel.lipolysisPct}%`)
          );
        })(),

        // Предупреждение о перекрытии волн
        insulinWaveData.hasOverlaps && React.createElement('div', {
          className: 'insulin-overlap-warning',
          style: {
            marginTop: '8px', padding: '8px',
            background: insulinWaveData.worstOverlap?.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
            borderRadius: '8px', fontSize: '12px',
            border: `1px solid ${insulinWaveData.worstOverlap?.severity === 'high' ? '#fca5a5' : '#fcd34d'}`
          }
        },
          React.createElement('div', { style: { fontWeight: '600', color: insulinWaveData.worstOverlap?.severity === 'high' ? '#dc2626' : '#d97706' } },
            '⚠️ Волны пересеклись!'
          ),
          React.createElement('div', { style: { marginTop: '2px', color: '#64748b' } },
            (insulinWaveData.overlaps || []).map((o, i) =>
              React.createElement('div', { key: i }, `${o.from} → ${o.to}: перекрытие ${o.overlapMinutes} мин`)
            )
          ),
          React.createElement('div', { style: { marginTop: '4px', fontSize: '11px', fontStyle: 'italic' } },
            `💡 Совет: подожди минимум ${Math.round(insulinWaveData.baseWaveHours * 60)} мин между приёмами`
          )
        ),

        // Персональная статистика
        insulinWaveData.personalAvgGap > 0 && React.createElement('div', {
          className: 'insulin-personal-stats',
          style: { marginTop: '8px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '12px' }
        },
          React.createElement('div', { style: { fontWeight: '600', color: '#3b82f6', marginBottom: '4px' } }, '📊 Твои паттерны'),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b' } },
            React.createElement('span', null, 'Сегодня между приёмами:'),
            React.createElement('span', { style: { fontWeight: '600' } }, insulinWaveData.avgGapToday > 0 ? formatDuration(insulinWaveData.avgGapToday) : '—')
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
            React.createElement('span', null, 'Твой средний gap:'),
            React.createElement('span', { style: { fontWeight: '600' } }, formatDuration(insulinWaveData.personalAvgGap))
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
            React.createElement('span', null, 'Рекомендуемый:'),
            React.createElement('span', { style: { fontWeight: '600' } }, formatDuration(insulinWaveData.recommendedGap || insulinWaveData.baseWaveHours * 60))
          ),
          React.createElement('div', {
            style: {
              marginTop: '6px', padding: '4px 8px', borderRadius: '4px', textAlign: 'center', fontWeight: '600',
              background: insulinWaveData.gapQuality === 'excellent' ? '#dcfce7' : insulinWaveData.gapQuality === 'good' ? '#fef9c3' : insulinWaveData.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
              color: insulinWaveData.gapQuality === 'excellent' ? '#166534' : insulinWaveData.gapQuality === 'good' ? '#854d0e' : insulinWaveData.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
            }
          },
            insulinWaveData.gapQuality === 'excellent' ? '🌟 Отлично! Выдерживаешь оптимальные промежутки' :
              insulinWaveData.gapQuality === 'good' ? '👍 Хорошо! Почти идеальные промежутки' :
                insulinWaveData.gapQuality === 'moderate' ? '😐 Можно лучше. Попробуй увеличить gap' :
                  insulinWaveData.gapQuality === 'needs-work' ? '⚠️ Ешь слишком часто. Дай организму переварить' :
                    '📈 Продолжай вести дневник для статистики'
          )
        ),

        // История волн
        renderWaveHistory()
      );
    };

    // Overlay вынесен отдельно через Fragment
    return React.createElement(React.Fragment, null,
      // Focus overlay (blur фон когда раскрыто) — ВНЕ карточки!
      insulinExpanded && React.createElement('div', {
        className: 'insulin-focus-overlay',
        onClick: () => setInsulinExpanded(false)
      }),
      // Сама карточка с мягким shake при приближении липолиза
      React.createElement('div', {
        className: 'insulin-wave-indicator widget-shadow-diary-glass widget-outline-diary-glass insulin-' + insulinWaveData.status + (shouldShake ? ' shake-subtle' : '') + (insulinExpanded ? ' expanded' : ''),
        id: 'tour-insulin-wave',
        style: {
          margin: '8px 0',
          cursor: 'pointer',
          position: insulinExpanded ? 'relative' : undefined,
          zIndex: insulinExpanded ? 100 : undefined
        },
        onClick: () => setInsulinExpanded(!insulinExpanded)
      },

        // Анимированный фон волны
        React.createElement('div', { className: 'insulin-wave-bg' }),

        // Контент
        React.createElement('div', { className: 'insulin-wave-content' },
          // Header: иконка + label + статус
          React.createElement('div', { className: 'insulin-wave-header' },
            React.createElement('div', { className: 'insulin-wave-left' },
              React.createElement('span', { className: 'insulin-wave-icon' }, insulinWaveData.emoji),
              React.createElement('span', { className: 'insulin-wave-label' },
                insulinWaveData.status === 'lipolysis' ? 'Липолиз активен!' : 'Инсулиновая волна'
              ),
              // Expand indicator
              React.createElement('span', {
                style: { fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }
              }, insulinExpanded ? '▲' : '▼')
            )
          ),

          // Прогресс-бар
          renderProgressBar(),

          // 🆕 v4.1.4: Мини-легенда компонентов + научный popup
          insulinWaveData.wavePhases && React.createElement('div', {
            style: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px',
              marginTop: '8px',
              marginBottom: '4px',
              fontSize: '10px',
              opacity: 0.9,
              paddingLeft: '4px'
            }
          },
            React.createElement('span', { style: { color: '#f97316' } }, '⚡ Быстрые'),
            React.createElement('span', { style: { color: '#22c55e' } }, '🌿 Основной'),
            React.createElement('span', { style: { color: '#8b5cf6' } }, '🫀 Печёночный'),
            // "?" сноска с научным обоснованием
            React.createElement('span', {
              style: {
                marginLeft: '4px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: 'rgba(107, 114, 128, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: '#6b7280',
                cursor: 'pointer',
                fontWeight: 600
              },
              onClick: (e) => {
                e.stopPropagation();
                const popupData = {
                  title: '🧬 3-компонентная модель инсулиновой волны',
                  content: [
                    { label: '⚡ Быстрые (Fast Peak)', value: 'Простые углеводы → быстрый пик глюкозы (15-25 мин). GI>70: сахар, белый хлеб, мёд.' },
                    { label: '🌿 Основной (Main Peak)', value: 'Главный инсулиновый ответ на смешанный приём (45-60 мин). Зависит от общей GL.' },
                    { label: '🫀 Печёночный (Hepatic Tail)', value: 'Жиры, белок, клетчатка замедляют всасывание (90-120 мин). Печень процессит нутриенты.' }
                  ],
                  links: [
                    { text: 'Brand-Miller 2003', url: 'https://pubmed.ncbi.nlm.nih.gov/12828192/' },
                    { text: 'Holt 1997', url: 'https://pubmed.ncbi.nlm.nih.gov/9356547/' }
                  ]
                };
                // Если на вкладке Отчёты — сначала переключаемся на Дневник
                if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
                  window.HEYS.App.setTab('diary');
                  setTimeout(() => openExclusivePopup('debt-science', popupData), 200);
                } else {
                  openExclusivePopup('debt-science', popupData);
                }
              }
            }, '?')
          ),

          // Подсказка
          insulinWaveData.subtext && React.createElement('div', { className: 'insulin-wave-suggestion' }, insulinWaveData.subtext),

          // 🏆 При липолизе: рекорд + streak + ккал
          insulinWaveData.status === 'lipolysis' && React.createElement('div', {
            className: 'lipolysis-stats',
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.5)',
              borderRadius: '8px',
              fontSize: '12px',
              gap: '8px'
            }
          },
            // Рекорд
            React.createElement('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: insulinWaveData.isNewRecord ? '#f59e0b' : '#64748b'
              }
            },
              React.createElement('span', null, insulinWaveData.isNewRecord ? '🏆' : '🎯'),
              React.createElement('span', { style: { fontWeight: insulinWaveData.isNewRecord ? '700' : '500' } },
                insulinWaveData.isNewRecord
                  ? 'Новый рекорд!'
                  : 'Рекорд: ' + formatLipolysisTime(insulinWaveData.lipolysisRecord?.minutes || 0)
              )
            ),
            // Streak
            insulinWaveData.lipolysisStreak?.current > 0 && React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e' }
            },
              React.createElement('span', null, '🔥'),
              React.createElement('span', { style: { fontWeight: '600' } },
                insulinWaveData.lipolysisStreak.current + ' ' +
                (insulinWaveData.lipolysisStreak.current === 1 ? 'день' :
                  insulinWaveData.lipolysisStreak.current < 5 ? 'дня' : 'дней')
              )
            ),
            // Примерно сожжённые ккал
            insulinWaveData.lipolysisKcal > 0 && React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }
            },
              React.createElement('span', null, '💪'),
              React.createElement('span', { style: { fontWeight: '600' } },
                '~' + insulinWaveData.lipolysisKcal + ' ккал'
              )
            )
          ),

          // 🆕 v3.2.1: Аутофагия — показываем при активной фазе
          insulinWaveData.autophagy && insulinWaveData.isAutophagyActive && React.createElement('div', {
            className: 'autophagy-status',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              padding: '8px 12px',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.15))',
              borderRadius: '8px',
              border: '1px solid rgba(34, 197, 94, 0.3)'
            }
          },
            React.createElement('span', { style: { fontSize: '18px' } }, insulinWaveData.autophagy.icon),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', {
                style: { fontWeight: '600', fontSize: '13px', color: insulinWaveData.autophagy.color }
              }, insulinWaveData.autophagy.label),
              React.createElement('div', {
                style: { fontSize: '11px', color: '#64748b' }
              }, 'Клеточное очищение • ' + Math.round(insulinWaveData.currentFastingHours || 0) + 'ч голода')
            ),
            // Прогресс-бар внутри фазы
            React.createElement('div', {
              style: {
                width: '40px',
                height: '4px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '2px',
                overflow: 'hidden'
              }
            },
              React.createElement('div', {
                style: {
                  width: insulinWaveData.autophagy.progress + '%',
                  height: '100%',
                  background: insulinWaveData.autophagy.color,
                  transition: 'width 0.3s'
                }
              })
            )
          ),

          // 🆕 v3.2.1: Холодовое воздействие — если активно
          insulinWaveData.hasColdExposure && React.createElement('div', {
            className: 'cold-exposure-badge',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '8px',
              padding: '6px 10px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.15))',
              borderRadius: '6px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              fontSize: '12px'
            }
          },
            React.createElement('span', null, '🧊'),
            React.createElement('span', { style: { color: '#3b82f6', fontWeight: '500' } },
              insulinWaveData.coldExposure.desc
            )
          ),

          // 🆕 v3.2.1: Добавки — если есть
          insulinWaveData.hasSupplements && React.createElement('div', {
            className: 'supplements-badge',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '8px',
              padding: '6px 10px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(192, 132, 252, 0.15))',
              borderRadius: '6px',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              fontSize: '12px'
            }
          },
            React.createElement('span', null, '🧪'),
            React.createElement('span', { style: { color: '#a855f7', fontWeight: '500' } },
              insulinWaveData.supplements.supplements.map(function (s) {
                if (s === 'vinegar') return 'Уксус';
                if (s === 'cinnamon') return 'Корица';
                if (s === 'berberine') return 'Берберин';
                return s;
              }).join(', ') + ' → ' + Math.abs(Math.round(insulinWaveData.supplementsBonus * 100)) + '% короче'
            )
          ),

          // === Expanded секция ===
          insulinExpanded && renderExpandedSection()
        )
      )  // закрываем Fragment
    );
  };

  window.HEYS.dayInsulinWaveUI = MOD;
})();
