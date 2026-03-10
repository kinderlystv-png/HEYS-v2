// heys_day_side_block_v1.js — extracted side block (compact sleep/day + measurements)

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.daySideBlock = HEYS.daySideBlock || {};

  HEYS.daySideBlock.renderSideBlock = function renderSideBlock(ctx) {
    const {
      React,
      day,
      date,
      sleepH,
      getYesterdayData,
      getCompareArrow,
      getScoreEmoji,
      getScoreGradient,
      getScoreTextColor,
      setDay,
      calculateDayAverages,
      measurementsNeedUpdate,
      openMeasurementsEditor,
      measurementsByField,
      measurementsHistory,
      measurementsMonthlyProgress,
      measurementsLastDateFormatted,
      renderMeasurementSpark
    } = ctx || {};

    const openSleepCheckin = () => {
      if (HEYS.showCheckin?.sleep) {
        HEYS.showCheckin.sleep(date, (stepData) => {
          if (stepData) {
            const timeData = stepData.sleepTime || {};
            const qualityData = stepData.sleepQuality || {};
            setDay(prev => ({
              ...prev,
              sleepStart: timeData.sleepStart ?? prev.sleepStart,
              sleepEnd: timeData.sleepEnd ?? prev.sleepEnd,
              sleepHours: timeData.sleepHours ?? prev.sleepHours,
              sleepQuality: qualityData.sleepQuality ?? prev.sleepQuality,
              sleepNote: qualityData.sleepNote || prev.sleepNote,
              updatedAt: Date.now()
            }));
          }
        });
      }
    };

    const openDaySleepCheckin = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      const dateKey = date || new Date().toISOString().slice(0, 10);
      const refreshDayFromStorage = () => {
        const storedDay = HEYS.utils?.lsGet ? HEYS.utils.lsGet(`heys_dayv2_${dateKey}`, {}) : null;

        if (storedDay) {
          console.info('[HEYS.daySideBlock] daySleep updated from storage', { dateKey });
          setDay(prev => ({
            ...prev,
            ...storedDay,
            updatedAt: Date.now()
          }));
        }
      };

      if (HEYS.showCheckin?.daySleep) {
        console.info('[HEYS.daySideBlock] opening daySleep via showCheckin', { dateKey });
        HEYS.showCheckin.daySleep(dateKey, refreshDayFromStorage);
        return;
      }

      if (HEYS.StepModal?.show) {
        console.info('[HEYS.daySideBlock] opening daySleep via StepModal fallback', { dateKey });
        HEYS.StepModal.show({
          steps: ['daySleep'],
          title: 'Дневной сон',
          showProgress: false,
          context: { dateKey },
          onComplete: refreshDayFromStorage
        });
        return;
      }

      console.warn('[HEYS.daySideBlock] daySleep modal unavailable');
    };

    const openMorningMoodCheckin = () => {
      if (HEYS.showCheckin?.morningMood) {
        HEYS.showCheckin.morningMood(date, () => {
          const dateKey = date || new Date().toISOString().slice(0, 10);
          const storedDay = HEYS.utils?.lsGet ? HEYS.utils.lsGet(`heys_dayv2_${dateKey}`, {}) : null;

          setDay(prev => {
            const merged = { ...prev, ...(storedDay || {}) };
            const averages = typeof calculateDayAverages === 'function'
              ? calculateDayAverages(merged.meals, merged.trainings, merged)
              : {};
            const nextDayScore = merged.dayScoreManual ? merged.dayScore : averages.dayScore;

            return {
              ...merged,
              ...averages,
              dayScore: nextDayScore,
              dayScoreManual: merged.dayScoreManual,
              updatedAt: Date.now()
            };
          });
        });
      }
    };

    return React.createElement('div', { className: 'area-side right-col' },
      React.createElement('div', { className: 'compact-sleep compact-card widget-shadow-diary-glass widget-outline-diary-glass' },
        React.createElement('div', { className: 'compact-card-header' }, '😴 СОН И САМОЧУВСТВИЕ'),

        // Ряд с двумя плашками
        React.createElement('div', { className: 'sleep-cards-row' },
          // Плашка СОН
          (() => {
            const yData = getYesterdayData();
            const sleepCompare = getCompareArrow(day.sleepQuality, yData?.sleepQuality);
            const sleepEmoji = getScoreEmoji(day.sleepQuality);
            const isPulse = (day.sleepQuality || 0) >= 9;
            const napMinutes = HEYS.dayUtils?.normalizeDaySleepMinutes
              ? HEYS.dayUtils.normalizeDaySleepMinutes(day.daySleepMinutes)
              : Math.max(0, Math.round(Number(day.daySleepMinutes) || 0));
            const totalSleepHours = HEYS.dayUtils?.getTotalSleepHours
              ? HEYS.dayUtils.getTotalSleepHours(day)
              : (sleepH || day.sleepHours || 0);
            const nightSleepHours = Math.max(0, Math.round((totalSleepHours - napMinutes / 60) * 10) / 10);
            const isNapRecommended = totalSleepHours > 0 && totalSleepHours < 6;
            const napLabel = napMinutes >= 60
              ? `${Math.floor(napMinutes / 60)} ч${napMinutes % 60 ? ` ${napMinutes % 60} мин` : ''}`
              : `${napMinutes} мин`;
            const napButtonLabel = napMinutes > 0
              ? `😴 Доп. сон: ${napLabel}`
              : (isNapRecommended ? '⚡ Рекомендуем доспать в обед' : '➕ Добавить доп. сон');

            // Умная подсказка при низкой оценке сна
            const sleepTip = (day.sleepQuality > 0 && day.sleepQuality <= 4)
              ? '💡 Попробуй: без экранов за час, прохладная комната'
              : null;

            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '🌙'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Сон')
              ),
              React.createElement('div', { className: 'sleep-card-times' },
                React.createElement('span', {
                  className: 'sleep-time-display clickable',
                  onClick: openSleepCheckin
                }, day.sleepStart || '—:—'),
                React.createElement('span', { className: 'sleep-arrow' }, '→'),
                React.createElement('span', {
                  className: 'sleep-time-display clickable',
                  onClick: openSleepCheckin
                }, day.sleepEnd || '—:—')
              ),
              // Качество сна — большой блок как у оценки дня
              React.createElement('div', {
                className: 'sleep-quality-display clickable' + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.sleepQuality) },
                onClick: openSleepCheckin
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  sleepEmoji && React.createElement('span', { className: 'score-emoji' }, sleepEmoji),
                  React.createElement('span', {
                    className: 'sleep-quality-value-big',
                    style: { color: getScoreTextColor(day.sleepQuality) }
                  }, day.sleepQuality || '—'),
                  React.createElement('span', { className: 'sleep-quality-max' }, '/ 10')
                ),
                // Compare with yesterday
                sleepCompare && React.createElement('span', {
                  className: 'score-compare',
                  style: { color: sleepCompare.color }
                }, sleepCompare.icon + ' vs вчера'),
                totalSleepHours > 0 && React.createElement('span', { className: 'sleep-duration-hint' }, totalSleepHours + ' ч сна')
              ),
              React.createElement('div', { className: 'sleep-breakdown-row' },
                React.createElement('div', { className: 'sleep-breakdown-main' },
                  React.createElement('span', { className: 'sleep-breakdown-item' }, `🌙 Ночь: ${nightSleepHours > 0 ? `${nightSleepHours} ч` : '—'}`),
                  React.createElement('button', {
                    type: 'button',
                    className: `sleep-breakdown-cta clickable${napMinutes > 0 ? ' has-value' : ''}${isNapRecommended ? ' recommended' : ' subtle'}`,
                    onClick: openDaySleepCheckin
                  }, napButtonLabel),
                  isNapRecommended && React.createElement('div', { className: 'sleep-breakdown-reason' }, 'Если ночью вышло меньше 6 часов, короткий дневной сон может поддержать восстановление')
                )
              ),
              // Умная подсказка
              sleepTip && React.createElement('div', { className: 'smart-tip' }, sleepTip),
              React.createElement('textarea', {
                className: 'sleep-note',
                placeholder: 'Заметка...',
                value: day.sleepNote || '',
                rows: day.sleepNote && day.sleepNote.includes('\n') ? Math.min(day.sleepNote.split('\n').length, 4) : 1,
                onChange: e => setDay(prev => ({ ...prev, sleepNote: e.target.value, updatedAt: Date.now() }))
              })
            );
          })(),

          // Плашка ОЦЕНКА ДНЯ
          (() => {
            const yData = getYesterdayData();
            const scoreCompare = getCompareArrow(day.dayScore, yData?.dayScore);
            const scoreEmoji = getScoreEmoji(day.dayScore);
            const isPulse = (day.dayScore || 0) >= 9;

            // Время последнего приёма
            const meals = day.meals || [];
            const lastMeal = meals.length > 0 ? meals[meals.length - 1] : null;
            const lastMealTime = lastMeal?.time || null;

            // Корреляция сон→самочувствие (без dayTot, который ещё не объявлен)
            const sleepH = HEYS.dayUtils?.getTotalSleepHours
              ? HEYS.dayUtils.getTotalSleepHours(day)
              : (day.sleepHours || 0);
            const sleepCorrelation = sleepH > 0 && sleepH < 6
              ? '😴 Мало сна — будь внимателен к аппетиту'
              : sleepH >= 8
                ? '😴✓ Отличный сон!'
                : null;

            // Умная подсказка при низкой оценке дня
            const dayTip = (day.dayScore > 0 && day.dayScore <= 4)
              ? '💡 Маленькие шаги: прогулка 10 мин, стакан воды'
              : (day.stressAvg >= 4)
                ? '💡 Высокий стресс. Попробуй 5 мин дыхания'
                : null;

            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '📊'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Оценка дня')
              ),
              // dayScore: авто из mood/wellbeing/stress, но можно поправить вручную
              React.createElement('div', {
                className: 'day-score-display' + (day.dayScore ? ' clickable' : '') + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.dayScore) },
                onClick: openMorningMoodCheckin
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  scoreEmoji && React.createElement('span', { className: 'score-emoji' }, scoreEmoji),
                  React.createElement('span', {
                    className: 'day-score-value-big',
                    style: { color: getScoreTextColor(day.dayScore) }
                  }, day.dayScore || '—'),
                  React.createElement('span', { className: 'day-score-max' }, '/ 10')
                ),
                // Compare with yesterday
                scoreCompare && React.createElement('span', {
                  className: 'score-compare',
                  style: { color: scoreCompare.color }
                }, scoreCompare.icon + ' vs вчера'),
                // Показываем "✨ авто" или "✏️ ручная" в зависимости от источника
                day.dayScoreManual
                  ? React.createElement('span', {
                    className: 'day-score-manual-hint',
                    onClick: (e) => {
                      e.stopPropagation();
                      // Сброс на авто
                      setDay(prev => {
                        const averages = calculateDayAverages(prev.meals, prev.trainings, prev);
                        return { ...prev, dayScore: averages.dayScore, dayScoreManual: false };
                      });
                    }
                  }, '✏️ сбросить')
                  : (day.moodAvg || day.wellbeingAvg || day.stressAvg) &&
                  React.createElement('span', { className: 'day-score-auto-hint' }, '✨ авто')
              ),
              React.createElement('div', {
                className: 'day-mood-row clickable',
                onClick: openMorningMoodCheckin
              },
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '😊'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Настроение'),
                  React.createElement('span', { className: 'mood-card-value' }, day.moodAvg || '—')
                ),
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '💪'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Самочувствие'),
                  React.createElement('span', { className: 'mood-card-value' }, day.wellbeingAvg || '—')
                ),
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '😰'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Стресс'),
                  React.createElement('span', { className: 'mood-card-value' }, day.stressAvg || '—')
                )
              ),
              // Время последнего приёма и корреляция
              (lastMealTime || sleepCorrelation) && React.createElement('div', { className: 'day-insights-row' },
                lastMealTime && React.createElement('span', { className: 'day-insight' }, '🍽️ ' + lastMealTime),
                sleepCorrelation && React.createElement('span', { className: 'day-insight correlation' }, sleepCorrelation)
              ),
              // Умная подсказка
              dayTip && React.createElement('div', { className: 'smart-tip' }, dayTip),
              React.createElement('textarea', {
                className: 'sleep-note',
                placeholder: 'Заметка...',
                value: day.dayComment || '',
                rows: day.dayComment && day.dayComment.includes('\n') ? Math.min(day.dayComment.split('\n').length, 4) : 1,
                onChange: e => setDay(prev => ({ ...prev, dayComment: e.target.value, updatedAt: Date.now() }))
              })
            );
          })()
        )
      ),

      // Карточка замеров тела
      React.createElement('div', {
        className: 'measurements-card compact-card widget-shadow-diary-glass widget-outline-diary-glass' + (measurementsNeedUpdate ? ' measurements-card--needs-update' : ''),
        onClick: (e) => {
          // Клик по карточке открывает редактор (если не по кнопке)
          if (!e.target.closest('button')) {
            openMeasurementsEditor();
          }
        },
        style: { cursor: 'pointer' }
      },
        React.createElement('div', { className: 'measurements-card__header' },
          React.createElement('div', { className: 'measurements-card__title' },
            React.createElement('span', { className: 'measurements-card__icon' }, '📐'),
            React.createElement('span', null, 'ЗАМЕРЫ ТЕЛА'),
            measurementsNeedUpdate && React.createElement('span', { className: 'measurements-card__badge' }, '📏 Пора обновить')
          ),
          React.createElement('div', { className: 'measurements-card__header-right' },
            React.createElement('button', { className: 'measurements-card__edit', onClick: openMeasurementsEditor }, 'Изменить')
          )
        ),

        // Содержимое
        (measurementsByField.some(f => f.value !== null) || measurementsHistory.length > 0)
          ? React.createElement('div', { className: 'measurements-card__list' },
            measurementsByField.map((f) => React.createElement('div', {
              key: f.key,
              className: 'measurements-card__row' + (f.warn ? ' measurements-card__row--warn' : '')
            },
              // Верхняя строка: иконка, название, значение, дельта, предупреждение
              React.createElement('div', { className: 'measurements-card__main' },
                React.createElement('div', { className: 'measurements-card__label' },
                  React.createElement('span', { className: 'measurements-card__label-icon' }, f.icon),
                  React.createElement('span', null, f.label)
                ),
                React.createElement('div', { className: 'measurements-card__values' },
                  React.createElement('span', { className: 'measurements-card__value' }, f.value !== null ? (Math.round(f.value * 10) / 10) + ' см' : '—'),
                  f.delta !== null && React.createElement('span', {
                    className: 'measurements-card__delta ' + (f.delta > 0 ? 'up' : f.delta < 0 ? 'down' : '')
                  }, (f.delta > 0 ? '↑ +' : f.delta < 0 ? '↓ ' : '') + (Math.round(f.delta * 10) / 10) + ' см'),
                  f.warn && React.createElement('span', { className: 'measurements-card__warn' }, '⚠️')
                )
              ),
              // Sparkline на отдельной строке с датами
              f.points && f.points.length >= 2 && React.createElement('div', { className: 'measurements-card__spark-row' },
                renderMeasurementSpark(f.points)
              )
            )),
            // Прогресс за месяц
            measurementsMonthlyProgress && React.createElement('div', { className: 'measurements-card__monthly' },
              '📊 За период: ',
              measurementsMonthlyProgress.map((p, i) =>
                React.createElement('span', {
                  key: p.label,
                  className: 'measurements-card__monthly-item' + (p.diff < 0 ? ' down' : p.diff > 0 ? ' up' : '')
                },
                  (i > 0 ? ', ' : '') + p.label + ' ' + (p.diff > 0 ? '+' : '') + p.diff + ' см'
                )
              )
            )
          )
          : React.createElement('div', { className: 'measurements-card__empty' },
            React.createElement('div', { className: 'measurements-card__empty-icon' }, '📏'),
            React.createElement('div', { className: 'measurements-card__empty-text' }, 'Добавьте замеры раз в неделю'),
            React.createElement('button', { className: 'measurements-card__button', onClick: openMeasurementsEditor }, 'Заполнить замеры')
          ),

        React.createElement('div', { className: 'measurements-card__footer' },
          measurementsLastDateFormatted && React.createElement('span', { className: 'measurements-card__footer-date' }, 'Последний замер: ' + measurementsLastDateFormatted)
        )
      )
    );
  };
})();
