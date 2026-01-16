// heys_day_goal_progress_v1.js — Goal progress bar renderer
;(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function renderGoalProgressBar(params) {
    const {
      React,
      day,
      displayOptimum,
      optimum,
      eatenKcal,
      animatedKcal,
      animatedProgress,
      animatedRatioPct,
      animatedMarkerPos,
      isAnimating,
      caloricDebt,
      setDay,
      r0,
      HEYS: HEYSContext
    } = params || {};

    const ctx = HEYSContext || HEYS;
    const Refeed = ctx.Refeed;

    return React.createElement('div', { className: 'goal-progress-card' },
      React.createElement('div', {
        className: 'goal-progress-bar' +
          (eatenKcal / (displayOptimum || optimum || 1) >= 0.9 && eatenKcal / (displayOptimum || optimum || 1) <= 1.1 ? ' pulse-perfect' : '')
      },
        // Вычисляем цвета на основе ratio (с учётом калорийного долга!)
        (() => {
          // 🔧 FIX: Используем displayOptimum (с учётом долга) для определения статуса
          const effectiveOptimum = displayOptimum || optimum || 1;
          const ratio = eatenKcal / effectiveOptimum;

          // === ДИНАМИЧЕСКИЙ ГРАДИЕНТ ПО ВСЕЙ ПОЛОСЕ ===
          // Зоны: 0-80% жёлтый → 80-100% зелёный → 100-105% зелёный → 105-110% жёлтый → 110%+ красный

          const buildDynamicGradient = (currentRatio) => {
            if (currentRatio <= 0) return '#e5e7eb';

            const yellow = '#eab308';
            const yellowLight = '#fbbf24';
            const green = '#22c55e';
            const greenDark = '#16a34a';
            const red = '#ef4444';
            const redDark = '#dc2626';

            // Ключевые точки (в % от нормы)
            const zone80 = 0.80;
            const zone100 = 1.0;
            const zone105 = 1.05;
            const zone110 = 1.10;

            // Преобразуем точки зон в % от текущего заполнения
            const toFillPct = (zoneRatio) => Math.min((zoneRatio / currentRatio) * 100, 100);

            if (currentRatio <= zone80) {
              // Весь бар жёлтый (недобор)
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} 100%)`;
            } else if (currentRatio <= zone100) {
              // 0→80% жёлтый, 80%→100% зелёный
              const p80 = toFillPct(zone80);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 5}%, ${green} ${p80 + 5}%, ${greenDark} 100%)`;
            } else if (currentRatio <= zone105) {
              // 0→80% жёлтый, 80%→105% зелёный (всё ОК)
              const p80 = toFillPct(zone80);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 3}%, ${green} ${p80 + 3}%, ${greenDark} 100%)`;
            } else if (currentRatio <= zone110) {
              // 0→80% жёлтый, 80%→105% зелёный, 105%→110% жёлтый
              const p80 = toFillPct(zone80);
              const p105 = toFillPct(zone105);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 3}%, ${green} ${p80 + 3}%, ${green} ${p105 - 3}%, ${yellow} ${p105 + 3}%, ${yellow} 100%)`;
            } else {
              // > 110%: жёлтый → зелёный → жёлтый → красный
              const p80 = toFillPct(zone80);
              const p105 = toFillPct(zone105);
              const p110 = toFillPct(zone110);
              return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 2}%, ${green} ${p80 + 2}%, ${green} ${p105 - 2}%, ${yellow} ${p105 + 2}%, ${yellow} ${p110 - 2}%, ${red} ${p110 + 2}%, ${redDark} 100%)`;
            }
          };

          const fillGradient = buildDynamicGradient(ratio);

          // Цвет части ПОСЛЕ НОРМЫ (goal-progress-over) — зависит от степени превышения
          let overColor, overGradient;
          if (ratio <= 1.05) {
            // 100-105% — зелёный (всё ОК)
            overColor = '#22c55e';
            overGradient = 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)';
          } else if (ratio <= 1.10) {
            // 105-110% — жёлтый (лёгкий перебор)
            overColor = '#eab308';
            overGradient = 'linear-gradient(90deg, #fbbf24 0%, #eab308 100%)';
          } else {
            // > 110% — красный (перебор)
            overColor = '#ef4444';
            overGradient = 'linear-gradient(90deg, #f87171 0%, #dc2626 100%)';
          }

          // Цвет заголовка — общий статус дня
          let titleColor, titleIcon, titleText;

          // === REFEED DAY — особый статус ===
          if (day.isRefeedDay && Refeed) {
            const refeedZone = Refeed.getRefeedZone(ratio, true);
            if (refeedZone) {
              titleColor = refeedZone.color;
              titleIcon = refeedZone.icon;
              titleText = refeedZone.name;
            }
          } else if (ratio < 0.80) {
            titleColor = '#eab308';
            titleIcon = '📉';
            titleText = 'Маловато';
          } else if (ratio <= 1.0) {
            titleColor = '#22c55e';
            titleIcon = '🎯';
            titleText = 'До цели';
          } else if (ratio <= 1.05) {
            titleColor = '#22c55e';
            titleIcon = '✅';
            titleText = 'Отлично';
          } else if (ratio <= 1.10) {
            titleColor = '#eab308';
            titleIcon = '⚠️';
            titleText = 'Чуть больше';
          } else {
            titleColor = '#ef4444';
            titleIcon = '🚨';
            titleText = 'Перебор';
          }

          return React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'goal-progress-header' },
              React.createElement('span', {
                className: 'goal-progress-title',
                style: { color: titleColor }
              }, titleIcon + ' ' + titleText),
              React.createElement('span', { className: 'goal-progress-stats' },
                React.createElement('span', {
                  className: 'goal-eaten',
                  style: { color: titleColor }
                }, r0(animatedKcal)),
                React.createElement('span', { className: 'goal-divider' }, '/'),
                React.createElement('span', { className: 'goal-target' }, displayOptimum),
                displayOptimum > optimum && React.createElement('span', {
                  className: 'goal-bonus-badge',
                  style: { marginLeft: '4px', fontSize: '10px', color: '#10b981' }
                }, '+' + (displayOptimum - optimum)),
                React.createElement('span', { className: 'goal-unit' }, 'ккал')
              )
            ),
            React.createElement('div', { className: 'goal-progress-track' + (eatenKcal > displayOptimum ? ' has-over' : '') + (displayOptimum > optimum ? ' has-debt' : '') + (day.isRefeedDay ? ' has-refeed' : '') },
              // Refeed Toggle — слева от прогресс-бара
              Refeed && React.createElement('div', { className: 'goal-refeed-toggle-wrapper' },
                Refeed.renderRefeedToggle({
                  isRefeedDay: day.isRefeedDay,
                  refeedReason: day.refeedReason,
                  caloricDebt: caloricDebt,
                  optimum: optimum,
                  onToggle: (isActive, reason) => {
                    setDay(prev => ({
                      ...prev,
                      isRefeedDay: isActive ? true : false,
                      refeedReason: isActive ? reason : null,
                      updatedAt: Date.now()
                    }));
                  }
                })
              ),
              // Контейнер для самого прогресс-бара
              React.createElement('div', { className: 'goal-progress-track-inner' },
                // Бонусная зона калорийного долга (справа от 100%, показывает расширенную зелёную зону)
                // Позиционируется от 100% до 100% + bonus% (где bonus = (displayOptimum - optimum) / optimum)
                displayOptimum > optimum && eatenKcal <= optimum && React.createElement('div', {
                  className: 'goal-bonus-zone',
                  style: {
                    // Бонусная зона начинается с правого края (100%) и расширяется вправо
                    // Но мы не можем показать >100%, поэтому показываем масштабированно:
                    // Если displayOptimum = 1.17 * optimum, то зона занимает последние 14.5% бара
                    // Формула: left = optimum / displayOptimum, width = (displayOptimum - optimum) / displayOptimum
                    left: (optimum / displayOptimum * 100) + '%',
                    width: ((displayOptimum - optimum) / displayOptimum * 100) + '%'
                  },
                  title: '💰 Бонусная зона: +' + (displayOptimum - optimum) + ' ккал из калорийного долга'
                }),
                // Маркер базовой нормы (пунктир) если есть долг и не переедание
                displayOptimum > optimum && eatenKcal <= displayOptimum && React.createElement('div', {
                  className: 'goal-base-marker',
                  style: { left: (optimum / displayOptimum * 100) + '%' },
                  title: 'Базовая норма: ' + optimum + ' ккал'
                }),
                React.createElement('div', {
                  className: 'goal-progress-fill' + (isAnimating ? ' no-transition' : ''),
                  style: {
                    // При наличии долга масштабируем прогресс относительно displayOptimum
                    width: displayOptimum > optimum
                      ? Math.min((eatenKcal / displayOptimum * 100), 100) + '%'
                      : Math.min(animatedProgress, 100) + '%',
                    background: fillGradient
                  }
                }),
                // Красная часть перебора (только если съели больше displayOptimum)
                eatenKcal > displayOptimum && React.createElement('div', {
                  className: 'goal-progress-over',
                  style: {
                    left: (displayOptimum / eatenKcal * 100) + '%',
                    width: ((eatenKcal - displayOptimum) / eatenKcal * 100) + '%',
                    background: overGradient
                  }
                }),
                // Маркер текущего % (на конце всей заполненной полосы, анимируется вместе с ней)
                React.createElement('div', {
                  className: 'goal-current-marker' + (isAnimating ? ' no-transition' : ''),
                  style: {
                    // Позиция бейджа анимируется от 0 до 100% (независимо от ratio)
                    left: displayOptimum > optimum
                      ? Math.min((eatenKcal / displayOptimum * 100), 100) + '%'
                      : animatedMarkerPos + '%'
                  }
                },
                  React.createElement('span', { className: 'goal-current-pct' },
                    // При долге показываем % от displayOptimum
                    displayOptimum > optimum
                      ? Math.round((eatenKcal / displayOptimum) * 100) + '%'
                      : animatedRatioPct + '%'
                  )
                ),
                React.createElement('div', {
                  className: 'goal-marker' + (eatenKcal > displayOptimum ? ' over' : ''),
                  style: eatenKcal > displayOptimum ? { left: (displayOptimum / eatenKcal * 100) + '%' } : {}
                }),
                // Показываем остаток калорий на пустой части полосы ИЛИ внутри бара когда мало места ИЛИ перебор
                (() => {
                  // Используем displayOptimum для debt-aware расчётов
                  const effectiveTarget = displayOptimum || optimum;

                  if (eatenKcal > effectiveTarget) {
                    // Перебор — показываем слева от маркера (перед чёрной линией)
                    const overKcal = Math.round(eatenKcal - effectiveTarget);
                    const markerPos = (effectiveTarget / eatenKcal * 100); // позиция маркера в %
                    return React.createElement('div', {
                      className: 'goal-remaining-inside goal-over-inside pulse-glow',
                      style: {
                        position: 'absolute',
                        right: (100 - markerPos + 2) + '%',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.95)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        zIndex: 10
                      }
                    },
                      React.createElement('span', { style: { fontSize: '10px', fontWeight: '500', color: '#dc2626' } }, 'Перебор'),
                      React.createElement('span', { style: { fontSize: '13px', fontWeight: '800', color: '#dc2626' } }, '+' + overKcal)
                    );
                  }

                  if (eatenKcal >= effectiveTarget) return null;

                  // Округляем остаток (от displayOptimum)
                  const effectiveRemaining = Math.round(effectiveTarget - eatenKcal);

                  // Цвет зависит от того сколько осталось: много = зелёный, мало = красный, средне = жёлтый
                  const effectiveRatio = eatenKcal / effectiveTarget;
                  const remainingRatio = 1 - effectiveRatio; // 1 = много осталось, 0 = мало
                  let remainingColor;
                  if (remainingRatio > 0.5) {
                    remainingColor = '#16a34a';
                  } else if (remainingRatio > 0.2) {
                    remainingColor = '#ca8a04';
                  } else {
                    remainingColor = '#dc2626';
                  }

                  // Когда прогресс > 80%, перемещаем внутрь бара
                  const effectiveProgress = displayOptimum > optimum
                    ? (eatenKcal / effectiveTarget * 100)
                    : animatedProgress;
                  const isInsideBar = effectiveProgress >= 80;

                  if (isInsideBar) {
                    // Внутри заполненной части — справа, с пульсацией
                    return React.createElement('div', {
                      className: 'goal-remaining-inside pulse-glow',
                      style: {
                        position: 'absolute',
                        right: (100 - Math.min(effectiveProgress, 100) + 2) + '%',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.95)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        zIndex: 10
                      }
                    },
                      React.createElement('span', { style: { fontSize: '10px', fontWeight: '500', color: '#6b7280' } }, 'Осталось всего'),
                      React.createElement('span', { style: { fontSize: '13px', fontWeight: '800', color: remainingColor } }, effectiveRemaining)
                    );
                  } else {
                    // На пустой части полосы
                    return React.createElement('div', {
                      className: 'goal-remaining-inline',
                      style: {
                        position: 'absolute',
                        left: Math.max(effectiveProgress + 2, 5) + '%',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        fontSize: '14px',
                        fontWeight: '700',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }
                    },
                      React.createElement('span', { style: { fontSize: '12px', fontWeight: '500', color: '#6b7280' } }, 'Ещё'),
                      React.createElement('span', { style: { fontSize: '15px', fontWeight: '800', color: remainingColor } }, effectiveRemaining)
                    );
                  }
                })()
              ),
              // Метки зон под полосой
              React.createElement('div', { className: 'goal-zone-labels' },
                React.createElement('span', {
                  className: 'goal-zone-label goal-zone-label-100',
                  style: { left: (ratio > 1 ? (1.0 / ratio) * 100 : 100) + '%' }
                }, '100%')
              )
            )
          );
        })()
      )
    );
  }

  HEYS.dayGoalProgress = {
    renderGoalProgressBar
  };
})(window);
