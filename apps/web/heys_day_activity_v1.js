// heys_day_activity_v1.js — Activity tracking card component
// Extracted from heys_day_v12.js (PR-2: Step 2/2)
// Renders steps slider, household activities, and training blocks

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
  /**
   * Render activity card
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.ctx - Context data (day, prof, steps, trainings, etc.)
   * @param {Object} params.actions - Action handlers
   * @returns {ReactElement} Activity card element
   */
  function renderActivityCard({ React, ctx, actions }) {
    const { 
      day,
      prof,
      stepsValue,
      stepsGoal,
      stepsPercent,
      stepsColor,
      stepsK,
      bmr,
      householdK,
      totalHouseholdMin,
      householdActivities,
      train1k,
      train2k,
      r0,
      visibleTrainings,
      trainingsBlock,
      ndteData,
      ndteBoostKcal,
      tefData,
      tefKcal,
      dayTargetDef,
      displayOptimum,
      tdee,
      caloricDebt
    } = ctx;
    const safeR0 = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    const { 
      setDay,
      haptic,
      setMetricPopup,
      setTefInfoPopup,
      openStepsGoalPicker,
      handleStepsDrag,
      openHouseholdPicker,
      openTrainingPicker
    } = actions;
    
    return React.createElement('div', { className: 'compact-activity compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '📏 АКТИВНОСТЬ'),
      
      // Слайдер шагов с зоной защиты от свайпа
      React.createElement('div', { className: 'steps-slider-container no-swipe-zone' },
        React.createElement('div', { className: 'steps-slider-header' },
          React.createElement('span', { className: 'steps-label' }, '👟 Шаги'),
          React.createElement('span', { className: 'steps-value' }, 
            // Фактические шаги — кликабельные с подсказкой
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMetricPopup({
                  type: 'steps',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: stepsValue,
                    goal: stepsGoal,
                    ratio: stepsValue / stepsGoal,
                    kcal: stepsK,
                    color: stepsColor
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' },
              title: 'Нажмите для подробностей'
            },
              React.createElement('b', { style: { color: stepsColor } }, stepsValue.toLocaleString())
            ),
            ' / ',
            // Цель шагов — с кнопкой редактирования
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                openStepsGoalPicker();
                haptic('light');
              },
              style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' },
              title: 'Изменить цель'
            },
              React.createElement('b', { className: 'steps-goal' }, stepsGoal.toLocaleString()),
              React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, '✏️')
            ),
            React.createElement('span', { className: 'steps-kcal-hint' }, ' / ' + stepsK + ' ккал')
          )
        ),
        React.createElement('div', { 
          className: 'steps-slider'
        },
          React.createElement('div', { className: 'steps-slider-track' }),
          React.createElement('div', { className: 'steps-slider-goal-mark', style: { left: '80%' } },
            React.createElement('span', { className: 'steps-goal-label' }, String(stepsGoal))
          ),
          React.createElement('div', { 
            className: 'steps-slider-fill',
            style: { width: stepsPercent + '%', background: stepsColor }
          }),
          React.createElement('div', { 
            className: 'steps-slider-thumb',
            style: { left: stepsPercent + '%', borderColor: stepsColor },
            onMouseDown: handleStepsDrag,
            onTouchStart: handleStepsDrag
          })
        )
      ),
      
      // Ряд: Формула расчёта + Бытовая активность
      React.createElement('div', { className: 'activity-cards-row' },
        // Плашка с формулой расчёта
        React.createElement('div', { className: 'formula-card' },
          React.createElement('div', { className: 'formula-card-header' },
            React.createElement('span', { className: 'formula-card-icon' }, '📊'),
            React.createElement('span', { className: 'formula-card-title' }, 'Расчёт калорий')
          ),
          React.createElement('div', { className: 'formula-card-rows' },
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, 'BMR'),
              React.createElement('span', { className: 'formula-value' }, bmr)
            ),
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Шаги'),
              React.createElement('span', { className: 'formula-value' }, stepsK)
            ),
            householdK > 0 && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Быт'),
              React.createElement('span', { className: 'formula-value' }, householdK)
            ),
            (train1k + train2k > 0) && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Тренировки'),
              React.createElement('span', { className: 'formula-value' }, safeR0(train1k + train2k))
            ),
            // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
            ndteData.active && ndteBoostKcal > 0 && React.createElement('div', { className: 'formula-row ndte-row' },
              React.createElement('span', { className: 'formula-label' }, 
                React.createElement('span', { style: { marginRight: '4px' } }, '🔥'),
                'Тренировка вчера'
              ),
              React.createElement('span', { className: 'formula-value ndte-value' }, '+' + ndteBoostKcal)
            ),
            // 🔬 TEF v1.0.0: Затраты на переваривание пищи
            tefKcal > 0 && React.createElement('div', { className: 'formula-row tef-row' },
              React.createElement('span', { className: 'formula-label', title: tefData.breakdown ? `Б: ${tefData.breakdown.protein} | У: ${tefData.breakdown.carbs} | Ж: ${tefData.breakdown.fat}` : '' }, 
                React.createElement('span', { style: { marginRight: '4px' } }, '🔥'),
                '+ TEF',
                // Иконка "?" для открытия popup с научной информацией
                React.createElement('span', { 
                  className: 'tef-help-icon',
                  onClick: (e) => {
                    e.stopPropagation();
                    const rect = e.target.getBoundingClientRect();
                    setTefInfoPopup({ x: rect.left + rect.width / 2, y: rect.bottom });
                  },
                  style: {
                    marginLeft: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'rgba(100, 116, 139, 0.15)',
                    color: '#64748b',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }
                }, '?')
              ),
              React.createElement('span', { className: 'formula-value tef-value' }, tefKcal)
            ),
            React.createElement('div', { className: 'formula-row formula-subtotal' },
              React.createElement('span', { className: 'formula-label' }, '= Затраты'),
              React.createElement('span', { className: 'formula-value' }, tdee)
            ),
            dayTargetDef !== 0 && React.createElement('div', { className: 'formula-row' + (dayTargetDef < 0 ? ' deficit' : ' surplus') },
              React.createElement('span', { className: 'formula-label' }, dayTargetDef < 0 ? 'Дефицит' : 'Профицит'),
              React.createElement('span', { className: 'formula-value' }, (dayTargetDef > 0 ? '+' : '') + dayTargetDef + '%')
            ),
            // 💰 Калорийный долг (если есть) — показываем всегда для информации
            caloricDebt?.dailyBoost > 0 && React.createElement('div', { className: 'formula-row debt-row' },
              React.createElement('span', { className: 'formula-label' }, 
                React.createElement('span', { style: { marginRight: '4px' } }, '💰'),
                'Долг'
              ),
              // При refeed долг показываем серым (не добавляется к цели)
              React.createElement('span', { className: 'formula-value', style: { color: day.isRefeedDay ? '#9ca3af' : '#22c55e' } }, 
                (day.isRefeedDay ? '(' : '+') + caloricDebt.dailyBoost + (day.isRefeedDay ? ')' : '')
              )
            ),
            // 🍕 Refeed day boost (Загрузка)
            day.isRefeedDay && React.createElement('div', { className: 'formula-row refeed-row' },
              React.createElement('span', { className: 'formula-label' }, 
                React.createElement('span', { style: { marginRight: '4px' } }, '🍕'),
                'Загрузка'
              ),
              React.createElement('span', { className: 'formula-value', style: { color: '#f97316' } }, '+35%')
            ),
            React.createElement('div', { className: 'formula-row formula-total' },
              React.createElement('span', { className: 'formula-label' }, 'Цель'),
              React.createElement('span', { className: 'formula-value' }, displayOptimum)
            )
          )
        ),
        // Правая колонка: бытовая активность + кнопка тренировки
        React.createElement('div', { className: 'activity-right-col' },
          // Бытовая активность - клик открывает статистику
          React.createElement('div', { 
            className: 'household-activity-card clickable',
            onClick: () => openHouseholdPicker('stats') // Открывает статистику
          },
            React.createElement('div', { className: 'household-activity-header' },
              React.createElement('span', { className: 'household-activity-icon' }, '🏠'),
              React.createElement('span', { className: 'household-activity-title' }, 'Бытовая активность'),
              householdActivities.length > 0 && React.createElement('span', { className: 'household-count-badge' }, householdActivities.length)
            ),
            React.createElement('div', { className: 'household-activity-value' },
              React.createElement('span', { className: 'household-value-number' }, totalHouseholdMin),
              React.createElement('span', { className: 'household-value-unit' }, 'мин')
            ),
            React.createElement('span', { className: 'household-stats-link' }, 
              React.createElement('span', { className: 'household-help-icon' }, '?'),
              ' подробнее'
            ),
            householdK > 0 && React.createElement('div', { className: 'household-value-kcal' }, '→ ' + householdK + ' ккал'),
            // Кнопка добавления внутри карточки
            React.createElement('button', { 
              className: 'household-add-btn',
              onClick: (e) => { 
                e.stopPropagation(); // Не открывать stats
                openHouseholdPicker('add'); // Только ввод
              }
            }, '+ Добавить')
          ),
          // Кнопка добавления тренировки
          visibleTrainings < 3 && React.createElement('button', {
            className: 'add-training-btn',
            onClick: () => {
              const newIndex = visibleTrainings;
              // НЕ увеличиваем visibleTrainings сразу — 
              // он обновится автоматически когда тренировка сохранится
              openTrainingPicker(newIndex);
            }
          }, '+ Тренировка')
        )
      ),
      
      // Тренировки — компактные
      trainingsBlock
    );
  }
  
  // Export
  HEYS.dayActivity = {
    render: renderActivityCard
  };
  
})(window);
