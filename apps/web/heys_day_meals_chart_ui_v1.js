// heys_day_meals_chart_ui_v1.js — legacy shim (moved to day/_meals.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meals chart moved to day/_meals.js'), {
      source: 'heys_day_meals_chart_ui_v1.js',
      type: 'legacy_shim',
    });
  }
  return;
  /*
  
    MOD.renderMealsChart = function renderMealsChart({
      React,
      mealsChartData,
      statsVm,
      mealChartHintShown,
      setMealChartHintShown,
      setShowConfetti,
      setMealQualityPopup,
      newMealAnimatingIndex,
      showFirstPerfectAchievement,
      U
    }) {
      if (!mealsChartData || !mealsChartData.meals || mealsChartData.meals.length === 0) return null;
  
      const utils = U || HEYS.utils || {};
  
      return React.createElement('div', {
        className: 'meals-chart-container',
        style: {
          margin: '12px 0',
          padding: '12px 16px',
          background: 'var(--surface, #fff)',
          borderRadius: '12px',
          border: '1px solid var(--border, #e5e7eb)'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '4px'
          }
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', {
              style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #6b7280)' }
            }, '📊 Распределение'),
            // Средний score
            mealsChartData.avgQualityScore > 0 && React.createElement('span', {
              className: 'meal-avg-score-badge',
              style: {
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '10px',
                background: mealsChartData.avgQualityScore >= 80 ? '#dcfce7' : mealsChartData.avgQualityScore >= 50 ? '#fef3c7' : '#fee2e2',
                color: mealsChartData.avgQualityScore >= 80 ? '#166534' : mealsChartData.avgQualityScore >= 50 ? '#92400e' : '#991b1b',
                fontWeight: '600'
              }
            }, 'средняя оценка ' + mealsChartData.avgQualityScore),
            // Comparison с вчера
            mealsChartData.yesterdayAvgScore > 0 && (() => {
              const diff = mealsChartData.avgQualityScore - mealsChartData.yesterdayAvgScore;
              if (Math.abs(diff) < 3) return null;
              return React.createElement('span', {
                style: {
                  fontSize: '10px',
                  color: diff > 0 ? '#16a34a' : '#dc2626',
                  fontWeight: '500'
                }
              }, diff > 0 ? '↑+' + diff : '↓' + diff);
            })()
          )
        ),
        // Подсказка нажми для деталей (скрывается после первого клика)
        !mealChartHintShown && React.createElement('div', {
          className: 'meal-chart-hint'
        },
          React.createElement('span', null, '👆'),
          'Нажми на полоску для деталей'
        ),
        // Мини-спарклайн калорий за день (линия с точками и временной шкалой)
        mealsChartData.meals.length > 1 && React.createElement('div', {
          className: 'meals-day-sparkline',
          style: {
            position: 'relative',
            height: '60px',
            marginBottom: '12px',
            padding: '8px 0 16px 0'
          }
        },
          (() => {
            const meals = mealsChartData.meals;
            const maxKcal = Math.max(...meals.map(m => m.kcal), 200);
            const svgW = 280;
            const svgH = 40;
            const padding = 10;
  
            // Парсим время в минуты от начала дня
            const parseTime = (t) => {
              if (!t) return 0;
              const [h, m] = t.split(':').map(Number);
              return (h || 0) * 60 + (m || 0);
            };
  
            // Находим диапазон времени — минимальные отступы для максимального использования ширины
            const times = meals.map(m => parseTime(m.time)).filter(t => t > 0);
            const dataMinTime = times.length > 0 ? Math.min(...times) : 12 * 60;
            const dataMaxTime = times.length > 0 ? Math.max(...times) : 20 * 60;
            // Маленькие отступы 30 мин с каждой стороны — точки занимают почти всю ширину
            const minTime = dataMinTime - 30;
            const maxTime = dataMaxTime + 30;
            // Минимальный диапазон 1 час если все приёмы в одно время
            const timeRange = Math.max(maxTime - minTime, 60);
  
            // Находим лучший приём (по quality score)
            const bestIdx = mealsChartData.bestMealIndex;
  
            // Вычисляем точки с размером по калориям
            const points = meals.map((m, idx) => {
              const t = parseTime(m.time);
              const x = padding + ((t - minTime) / timeRange) * (svgW - 2 * padding);
              const y = svgH - padding - ((m.kcal / maxKcal) * (svgH - 2 * padding));
              // Размер точки: 3-7px в зависимости от калорий (100-800+ ккал)
              const r = 3 + Math.min(4, (m.kcal / 200));
              const isBest = idx === bestIdx && m.quality && m.quality.score >= 70;
              return { x, y, meal: m, idx, r, isBest };
            }).sort((a, b) => a.x - b.x);
  
            // Строим path для линии
            const linePath = points.length > 1
              ? 'M ' + points.map(p => `${p.x},${p.y}`).join(' L ')
              : '';
  
            // Строим path для заливки под линией
            const areaPath = points.length > 1
              ? `M ${points[0].x},${svgH - padding} ` +
                points.map(p => `L ${p.x},${p.y}`).join(' ') +
                ` L ${points[points.length - 1].x},${svgH - padding} Z`
              : '';
  
            // === Данные за вчера для сравнения (из VM) ===
            const yesterdayMeals = statsVm?.computed?.mealsChartMeta?.yesterdayMeals || [];
            const yesterdayPath = (() => {
              if (yesterdayMeals.length < 2) return '';
              const yMaxKcal = Math.max(maxKcal, ...yesterdayMeals.map(p => p.kcal));
              const pts = yesterdayMeals.map(p => {
                const x = padding + ((p.t - minTime) / timeRange) * (svgW - 2 * padding);
                const y = svgH - padding - ((p.kcal / yMaxKcal) * (svgH - 2 * padding));
                return { x: Math.max(padding, Math.min(svgW - padding, x)), y };
              }).sort((a, b) => a.x - b.x);
              return 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ');
            })();
  
            return React.createElement('svg', {
              viewBox: `0 0 ${svgW} ${svgH + 12}`,
              style: { width: '100%', height: '100%' },
              preserveAspectRatio: 'xMidYMid meet'
            },
              // Градиенты
              React.createElement('defs', null,
                // Градиент для заливки под линией
                React.createElement('linearGradient', { id: 'mealSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#10b981', stopOpacity: '0.3' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#10b981', stopOpacity: '0.05' })
                ),
                // Градиент для зелёных зон (основные приёмы)
                React.createElement('linearGradient', { id: 'goodZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.12' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.02' })
                ),
                // Градиент для жёлтых зон (перекусы)
                React.createElement('linearGradient', { id: 'snackZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#eab308', stopOpacity: '0.08' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#eab308', stopOpacity: '0.01' })
                ),
                // Градиент для красной зоны (ночь)
                React.createElement('linearGradient', { id: 'badZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: '0.12' }),
                  React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: '0.02' })
                )
              ),
              // Динамические временные зоны (на основе первого приёма)
              (() => {
                // Находим время первого приёма (завтрак)
                const firstMealTime = times.length > 0 ? Math.min(...times) : 8 * 60;
                // Конец дня = 03:00 = 27:00 (в минутах от полуночи)
                const endOfDayMinutes = 27 * 60;
                // Делим оставшееся время на 6 слотов
                const slotDuration = (endOfDayMinutes - firstMealTime) / 6;
  
                // Слоты: завтрак, перекус1, обед, перекус2, ужин, ночь
                const zones = [
                  { start: firstMealTime - 30, end: firstMealTime + slotDuration * 0.3, gradient: 'url(#goodZoneGrad)', label: 'Завтрак' },
                  { start: firstMealTime + slotDuration * 0.8, end: firstMealTime + slotDuration * 1.5, gradient: 'url(#goodZoneGrad)', label: 'Обед' },
                  { start: firstMealTime + slotDuration * 2.8, end: firstMealTime + slotDuration * 3.5, gradient: 'url(#goodZoneGrad)', label: 'Ужин' },
                  { start: firstMealTime + slotDuration * 4.5, end: endOfDayMinutes, gradient: 'url(#badZoneGrad)', label: 'Ночь' }
                ];
  
                return zones.map((zone, i) => {
                  const x1 = padding + ((zone.start - minTime) / timeRange) * (svgW - 2 * padding);
                  const x2 = padding + ((zone.end - minTime) / timeRange) * (svgW - 2 * padding);
                  // Проверяем, что зона хотя бы частично видима
                  if (x2 < padding || x1 > svgW - padding) return null;
                  const clampedX1 = Math.max(padding, x1);
                  const clampedX2 = Math.min(svgW - padding, x2);
                  if (clampedX2 <= clampedX1) return null;
                  return React.createElement('rect', {
                    key: 'zone-' + i,
                    x: clampedX1,
                    y: 0,
                    width: clampedX2 - clampedX1,
                    height: svgH,
                    fill: zone.gradient,
                    rx: 3
                  });
                });
              })(),
              // Линия вчерашнего дня (для сравнения)
              yesterdayPath && React.createElement('path', {
                d: yesterdayPath,
                fill: 'none',
                stroke: '#9ca3af',
                strokeWidth: '1.5',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                className: 'meal-sparkline-yesterday'
              }),
              // Заливка под линией (с анимацией появления)
              areaPath && React.createElement('path', {
                d: areaPath,
                fill: 'url(#mealSparkGrad)',
                className: 'meal-sparkline-area'
              }),
              // Линия (с анимацией рисования)
              linePath && React.createElement('path', {
                d: linePath,
                fill: 'none',
                stroke: '#10b981',
                strokeWidth: '2',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                className: 'meal-sparkline-line',
                style: {
                  strokeDasharray: 500,
                  strokeDashoffset: 500
                }
              }),
              // Точки (с размером по калориям, пульсацией лучшего, кликом для popup, анимацией появления)
              points.map((p, i) =>
                React.createElement('g', {
                  key: i,
                  className: 'meal-sparkline-dot',
                  style: { '--dot-delay': (1 + i * 0.4) + 's' }
                },
                  // Пульсирующий ореол для лучшего приёма
                  p.isBest && React.createElement('circle', {
                    cx: p.x,
                    cy: p.y,
                    r: p.r + 4,
                    fill: 'none',
                    stroke: '#22c55e',
                    strokeWidth: '2',
                    opacity: 0.6,
                    className: 'sparkline-pulse'
                  }),
                  // Основная точка
                  React.createElement('circle', {
                    cx: p.x,
                    cy: p.y,
                    r: p.r,
                    fill: p.meal.quality ? p.meal.quality.color : '#10b981',
                    stroke: p.isBest ? '#22c55e' : '#fff',
                    strokeWidth: p.isBest ? 2 : 1.5,
                    style: { cursor: 'pointer' },
                    onClick: (e) => {
                      e.stopPropagation();
                      const quality = p.meal.quality;
                      if (!quality) return;
                      const svg = e.target.closest('svg');
                      const svgRect = svg.getBoundingClientRect();
                      // Конвертируем SVG координаты в экранные
                      const viewBox = svg.viewBox.baseVal;
                      const scaleX = svgRect.width / viewBox.width;
                      const scaleY = svgRect.height / viewBox.height;
                      const screenX = svgRect.left + p.x * scaleX;
                      const screenY = svgRect.top + p.y * scaleY;
                      // Скрываем подсказку
                      if (!mealChartHintShown) {
                        setMealChartHintShown(true);
                        try {
                          utils.lsSet ? utils.lsSet('heys_meal_hint_shown', '1') : localStorage.setItem('heys_meal_hint_shown', '1');
                        } catch {}
                      }
                      // Confetti при идеальном score
                      if (quality.score >= 95) {
                        setShowConfetti(true);
                        setTimeout(() => setShowConfetti(false), 2000);
                      }
                      setMealQualityPopup({
                        meal: p.meal,
                        quality,
                        mealTypeInfo: { label: p.meal.name, icon: p.meal.icon },
                        x: screenX,
                        y: screenY + 15
                      });
                    }
                  })
                )
              ),
              // Временные метки под каждой точкой
              points.map((p, i) =>
                React.createElement('text', {
                  key: 'time-' + i,
                  x: p.x,
                  y: svgH + 10,
                  fontSize: '8',
                  fill: '#9ca3af',
                  textAnchor: 'middle'
                }, p.meal.time || '')
              )
            );
          })()
        ),
        // Горизонтальные полоски для каждого приёма (реверс — ближайшие сверху, как карточки)
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }
        },
          // Вертикальная линия цели 100%
          React.createElement('div', {
            className: 'meals-target-line',
            style: {
              position: 'absolute',
              left: 'calc(100px + 100%)',
              top: 0,
              bottom: 0,
              width: '0',
              borderLeft: '2px dashed rgba(16, 185, 129, 0.4)',
              pointerEvents: 'none',
              zIndex: 1
            }
          }),
          // Сортировка: ранние внизу, поздние вверху (без reverse)
          mealsChartData.meals.map((meal, i) => {
            const originalIndex = i; // Индекс соответствует порядку в массиве
            const widthPct = mealsChartData.targetKcal > 0
              ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
              : 0;
            const barWidthPct = widthPct > 0 && widthPct < 12 ? 12 : widthPct; // минимальная видимость полоски
            const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
            const quality = meal.quality;
            const isBest = mealsChartData.bestMealIndex === originalIndex && quality && quality.score >= 70;
            const barFill = quality
              ? `linear-gradient(90deg, ${quality.color} 0%, ${quality.color}cc 100%)`
              : (isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)');
            const problemBadges = quality?.badges?.filter(b => !b.ok).slice(0, 3) || [];
            const openQualityModal = (e) => {
              if (!quality) return;
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              if (!mealChartHintShown) {
                setMealChartHintShown(true);
                try { utils.lsSet ? utils.lsSet('heys_meal_hint_shown', '1') : localStorage.setItem('heys_meal_hint_shown', '1'); } catch {}
              }
              // 🎉 Confetti при идеальном score!
              if (quality.score >= 95) {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 2000);
              }
              setMealQualityPopup({
                meal,
                quality,
                mealTypeInfo: { label: meal.name, icon: meal.icon },
                x: rect.left + rect.width / 2,
                y: rect.bottom
              });
            };
            const isLowScore = quality && quality.score < 50;
            const isNewMeal = newMealAnimatingIndex === originalIndex;
            return React.createElement('div', {
              key: i,
              className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 6px',
                marginLeft: '-6px',
                marginRight: '-6px',
                borderRadius: '6px',
                background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                transition: 'background 0.2s ease'
              }
            },
              // Время слева — крупнее
              meal.time && React.createElement('span', {
                style: {
                  width: '50px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text-primary, #374151)',
                  textAlign: 'left',
                  flexShrink: 0
                }
              }, utils.formatMealTime ? utils.formatMealTime(meal.time) : meal.time),
              // Название типа приёма — по центру, крупнее
              React.createElement('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  minWidth: '90px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'var(--text-primary, #1e293b)',
                  flexShrink: 0
                }
              },
                React.createElement('span', { style: { fontSize: '16px' } }, meal.icon),
                React.createElement('span', null, meal.name)
              ),
              // Полоска прогресса с бейджами внутри
              React.createElement('div', {
                className: 'meal-bar-container' + (isBest ? ' meal-bar-best' : '') + (quality && quality.score >= 80 ? ' meal-bar-excellent' : ''),
                role: quality ? 'button' : undefined,
                tabIndex: quality ? 0 : undefined,
                onClick: openQualityModal,
                onKeyDown: quality ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualityModal(); } } : undefined,
                style: {
                  flex: 1,
                  minWidth: 0,
                  height: '22px',
                  background: 'var(--meal-bar-track, rgba(148,163,184,0.24))',
                  borderRadius: '4px',
                  overflow: 'visible',
                  position: 'relative',
                  cursor: quality ? 'pointer' : 'default',
                  boxShadow: isBest ? '0 0 0 2px #fbbf24, 0 2px 8px rgba(251,191,36,0.3)' : undefined
                }
              },
                // Заливка
                React.createElement('div', {
                  style: {
                    width: barWidthPct + '%',
                    height: '100%',
                    background: barFill,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }
                }),
                // Калории справа от заливки + процент от нормы
                meal.kcal > 0 && React.createElement('span', {
                  style: {
                    position: 'absolute',
                    left: `calc(${barWidthPct}% + 6px)`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '10px',
                    fontWeight: '600',
                    color: 'var(--text-primary, #1f2937)',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }
                },
                  meal.kcal + ' ккал',
                  React.createElement('span', {
                    style: {
                      fontSize: '9px',
                      color: 'var(--text-tertiary, #9ca3af)',
                      fontWeight: '500'
                    }
                  }, '(' + Math.round(widthPct) + '%)')
                ),
                // Бейджи внутри полоски справа
                problemBadges.length > 0 && React.createElement('div', {
                  style: {
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    gap: '2px'
                  }
                },
                  problemBadges.map((b, idx) =>
                    React.createElement('span', {
                      key: idx,
                      style: {
                        fontSize: '8px',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        background: 'rgba(239,68,68,0.9)',
                        color: '#fff',
                        fontWeight: '600'
                      }
                    }, '!' + b.type)
                  )
                )
              ),
              // Score справа
              quality && React.createElement('span', {
                className: 'meal-quality-score',
                style: { color: quality.color, flexShrink: 0 }
              }, '⭐' + quality.score)
            );
          }),
          // Streak banner с улучшенной анимацией
          mealsChartData.qualityStreak >= 3 && React.createElement('div', {
            className: 'meal-quality-streak-banner'
          },
            React.createElement('span', { className: 'streak-fire' }, '🔥'),
            React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } },
              mealsChartData.qualityStreak + ' отличных приёмов подряд!'
            ),
            React.createElement('span', { style: { fontSize: '16px' } }, '🏆')
          ),
          // Ачивка первого идеального приёма
          showFirstPerfectAchievement && React.createElement('div', {
            className: 'first-perfect-meal-badge',
            style: { marginTop: '8px' }
          },
            React.createElement('span', { className: 'trophy' }, '🏆'),
            'Первый идеальный приём!',
            React.createElement('span', null, '✨')
          )
        )
      );
    };
  
    HEYS.dayMealsChartUI = MOD;
  */
})(window);
