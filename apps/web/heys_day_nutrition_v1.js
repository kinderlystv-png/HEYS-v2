// heys_day_nutrition_v1.js — Nutrition (diary) tab v4 layout, stage 4

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  function timeToMinutes(time) {
    if (!time || typeof time !== 'string') return null;
    const m = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function formatShortDate(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!match) return String(dateKey || '');
    const dateValue = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(dateValue.getTime())) return String(dateKey || '');
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dateValue).replace(/\.$/, '');
    const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(dateValue).replace(/\.$/, '');
    return weekday + ', ' + dayMonth;
  }

  function countFilledMeals(day) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    return meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0).length;
  }

  function formatMealCountLabel(count) {
    const n = Number(count) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;
    let word = 'приёмов';
    if (mod10 === 1 && mod100 !== 11) word = 'приём';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'приёма';
    return n + ' ' + word;
  }

  function formatTabMetaLine(dateKey, day) {
    const syncLabel = syncMetaLabel();
    const text = formatShortDate(dateKey || day?.date) + ' · ' + formatMealCountLabel(countFilledMeals(day));
    return { text, syncLabel };
  }

  function syncMetaLabel() {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
      if (HEYS.cloud?.isInitialSyncCompleted?.()) return 'синхронизировано';
    } catch (_) { /* noop */ }
    return null;
  }

  function mealTotals(meal, pIndex) {
    if (HEYS.models?.mealTotals) {
      return HEYS.models.mealTotals(meal, pIndex) || {};
    }
    return {};
  }

  function productName(item, pIndex) {
    if (!item) return '';
    const id = String(item.product_id || item.id || '').toLowerCase();
    const fromIndex = pIndex?.byId?.get?.(id);
    if (fromIndex?.name) return fromIndex.name;
    if (item.name) return item.name;
    return 'продукт';
  }

  function mealItemSummary(meal, pIndex, maxNames) {
    const items = Array.isArray(meal?.items) ? meal.items : [];
    if (!items.length) return 'без продуктов';
    const names = items.map((item) => productName(item, pIndex)).filter(Boolean);
    const limit = maxNames || 3;
    if (names.length <= limit) return names.join(' · ');
    const visible = names.slice(0, limit).join(' · ');
    const rest = names.length - limit;
    return visible + ' · ещё ' + rest;
  }

  function mealTypeLabel(meal) {
    const info = HEYS.getMealType?.(meal);
    const raw = info?.name || info?.label || meal?.name || info?.type;
    const localize = HEYS.dayUtils?.localizeMealName;
    if (typeof localize === 'function') return localize(raw, 'Приём');
    return raw || 'Приём';
  }

  function sortMealsAscending(meals) {
    const list = Array.isArray(meals) ? meals.slice() : [];
    return list.sort((a, b) => {
      const ta = timeToMinutes(a?.time);
      const tb = timeToMinutes(b?.time);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
  }

  function findMealIndexInDay(dayData, meal) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    if (meal?.id) {
      const byId = meals.findIndex((entry) => entry && entry.id === meal.id);
      if (byId >= 0) return byId;
    }
    return meals.indexOf(meal);
  }

  function formatDurationShort(totalMinutes) {
    const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0');
    return String(m) + ' мин';
  }

  function formatClockFromNow(minutesAhead) {
    const mins = Math.max(0, Math.round(Number(minutesAhead) || 0));
    const now = new Date();
    const target = new Date(now.getTime() + mins * 60000);
    return String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
  }

  function buildWindowLabel(insulinWaveData) {
    if (!insulinWaveData) return 'добавьте приём для расчёта';
    const rangeStatus = insulinWaveData.rangeStatus || insulinWaveData.status;
    if (rangeStatus === 'scheduled') return 'приём ещё впереди';
    if (rangeStatus === 'complete') return 'окно открыто';
    if (insulinWaveData.isOvernightEstimate) return 'оценка по вчерашнему дню';
    const remaining = Number(insulinWaveData.rangeRemaining ?? insulinWaveData.remaining);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return insulinWaveData.text || insulinWaveData.subtext || 'следите по голоду';
    }
    return 'закроется в ' + formatClockFromNow(remaining) + ' · через ' + formatDurationShort(remaining);
  }

  function deviationPct(fact, norm) {
    const n = Number(norm) || 0;
    const f = Number(fact) || 0;
    if (!n) return null;
    return Math.round(((f - n) / n) * 100);
  }

  function formatDeviation(pct, higherBetter) {
    if (pct === null || pct === 0) return '0 %';
    const sign = pct > 0 ? '+' : '\u2212';
    return sign + Math.abs(pct) + ' %';
  }

  function harmIsGood(harm, norm) {
    const h = Number(harm) || 0;
    const n = Number(norm) || 10;
    return h <= n;
  }

  function NutritionTabV4(props) {
    const { React, ctx, actions } = props;
    const {
      day,
      prof,
      pIndex,
      date,
      eatenKcal,
      displayOptimum,
      displayRemainingKcal,
      dayTot,
      normAbs,
      insulinWaveData,
      dailyWaveOverview,
      legacyMealsUI,
      waterMl,
      waterGoal,
      waterGoalBreakdown,
      waterLastDrink
    } = ctx;

    const { addMeal, addWater, removeWater, openAddProductForMeal, haptic, openExclusivePopup } = actions || {};
    const [curatorCue, setCuratorCue] = React.useState(null);
    React.useEffect(() => {
      const sync = () => {
        const api = window.HEYS && window.HEYS.CuratorActionsBanner;
        if (!api) {
          setCuratorCue(null);
          return;
        }
        if (typeof api.getVisibleCue === 'function') {
          setCuratorCue(api.getVisibleCue(date));
          return;
        }
        setCuratorCue(typeof api.getDayCue === 'function' ? api.getDayCue(date) : null);
      };
      window.addEventListener('heys:curator-review-cues', sync);
      sync();
      return () => window.removeEventListener('heys:curator-review-cues', sync);
    }, [date]);

    const budget = Math.round(Number(displayOptimum) || 0);
    const eaten = Math.round(Number(eatenKcal) || 0);
    const remaining = Math.max(0, Math.round(Number(displayRemainingKcal) || 0));
    const progressPct = budget > 0 ? Math.min(100, Math.round((eaten / budget) * 100)) : 0;

    const meals = sortMealsAscending(day?.meals || []);

    const fiberEaten = Math.round(Number(dayTot?.fiber) || 0);
    const fiberNorm = Math.round(Number(normAbs?.fiber) || 0);
    const harmValue = Number(dayTot?.harm) || 0;
    const harmNorm = Number(normAbs?.harm) || 10;
    const harmGood = harmIsGood(harmValue, harmNorm);

    const waterCurrent = Math.round(Number(waterMl ?? day?.water) || 0);
    const waterTarget = Math.round(Number(waterGoal) || 0);

    const macroRows = [
      { key: 'kcal', label: 'ккал', higherBetter: false },
      { key: 'prot', label: 'Б', higherBetter: true },
      { key: 'fat', label: 'Ж', higherBetter: false },
      { key: 'carbs', label: 'У', higherBetter: false }
    ];

    return React.createElement('div', {
      className: 'compact-nutrition nutrition-section nutrition-v4',
      'data-curator-target': 'nutrition'
    },
      curatorCue && React.createElement('button', {
        type: 'button',
        className: 'ca-day-entry',
        onClick: () => {
          const api = window.HEYS && window.HEYS.CuratorActionsBanner;
          const cueDate = (curatorCue && curatorCue.date) || date;
          if (api && typeof api.openFromCue === 'function') api.openFromCue(cueDate);
          const ui = window.HEYS && window.HEYS.ui;
          if (cueDate && cueDate !== date && ui && typeof ui.setSelectedDate === 'function') {
            ui.setSelectedDate(cueDate);
          }
          haptic?.('light');
        }
      },
        React.createElement('span', { className: 'ca-day-entry__copy' },
          React.createElement('b', { className: 'ca-day-entry__title' }, curatorCue.title),
          React.createElement('span', { className: 'ca-day-entry__sub' }, curatorCue.subtitle)
        ),
        React.createElement('span', { className: 'ca-modal__chevron', 'aria-hidden': 'true' },
          React.createElement('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('path', { d: 'M9 6l6 6-6 6' })
          )
        )
      ),
      React.createElement('div', { className: 'nutrition-v4-hero' },
        React.createElement('div', { className: 'nutrition-v4-hero__label' }, 'Осталось на сегодня'),
        React.createElement('div', { className: 'nutrition-v4-hero__value-row' },
          React.createElement('span', { className: 'nutrition-v4-hero__value' }, remaining),
          React.createElement('span', { className: 'nutrition-v4-hero__unit' }, 'ккал')
        ),
        React.createElement('div', { className: 'nutrition-v4-hero__track' },
          React.createElement('div', {
            className: 'nutrition-v4-hero__fill',
            style: { width: progressPct + '%' }
          })
        ),
        React.createElement('div', { className: 'nutrition-v4-hero__budget' },
          React.createElement('span', null, 'съедено ' + eaten.toLocaleString('ru-RU')),
          React.createElement('span', null, 'бюджет ' + budget.toLocaleString('ru-RU'))
        )
      ),

      React.createElement('div', { className: 'nutrition-v4-tier' }, 'Сейчас'),
      React.createElement('div', { className: 'nutrition-v4-window' },
        React.createElement('span', { className: 'nutrition-v4-window__label' }, 'Окно приёмов'),
        React.createElement('span', { className: 'nutrition-v4-window__value' }, buildWindowLabel(insulinWaveData))
      ),

      React.createElement('div', { className: 'nutrition-v4-tier' }, 'Дневник'),
      React.createElement('div', { className: 'nutrition-v4-diary' },
        meals.length === 0
          ? React.createElement('div', { className: 'nutrition-v4-diary__empty' }, 'Пока нет приёмов — добавьте первый')
          : meals.map((meal, idx) => {
            const totals = mealTotals(meal, pIndex);
            const kcal = Math.round(Number(totals.kcal) || 0);
            const time = meal?.time || '--:--';
            const title = mealTypeLabel(meal);
            const mealIndex = findMealIndexInDay(day, meal);
            const isEmpty = !Array.isArray(meal?.items) || meal.items.length === 0;
            const summary = mealItemSummary(meal, pIndex, 3);
            const openAddProduct = () => {
              if (typeof openAddProductForMeal !== 'function') return;
              openAddProductForMeal({
                mealIndex,
                mealId: meal?.id || null,
                source: 'nutrition-v4-meal-row',
              });
              haptic?.('light');
            };
            return React.createElement('div', {
              key: 'meal-row-' + idx + '-' + (meal.id || meal.time || idx),
              className: 'nutrition-v4-meal-row' + (isEmpty ? ' nutrition-v4-meal-row--empty' : ''),
              'data-meal-id': meal?.id || undefined,
            },
              React.createElement('div', { className: 'nutrition-v4-meal-row__head' },
                React.createElement('span', { className: 'nutrition-v4-meal-row__title' }, time + ' · ' + title),
                React.createElement('span', { className: 'nutrition-v4-meal-row__kcal' }, kcal)
              ),
              React.createElement('div', { className: 'nutrition-v4-meal-row__body' },
                React.createElement('div', { className: 'nutrition-v4-meal-row__items' }, summary),
                React.createElement('button', {
                  type: 'button',
                  className: 'nutrition-v4-meal-row__add',
                  'aria-label': (isEmpty ? 'Добавить продукт в ' : 'Добавить ещё продукт в ') + title,
                  'data-add-product': 'single',
                  onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openAddProduct();
                  }
                }, isEmpty ? '+ продукт' : '+ ещё')
              )
            );
          })
      ),

      React.createElement('button', {
        type: 'button',
        className: 'nutrition-v4-cta',
        id: 'nutrition-v4-cta',
        onClick: () => {
          addMeal?.();
          haptic?.('light');
        }
      },
        React.createElement('span', null, 'Добавить приём пищи'),
        React.createElement('span', { className: 'nutrition-v4-cta__icon', 'aria-hidden': 'true' }, '+')
      ),

      React.createElement('div', { className: 'nutrition-v4-tier' }, 'Разбор дня'),
      React.createElement('div', { className: 'nutrition-v4-breakdown' },
        React.createElement('div', { className: 'nutrition-v4-breakdown__title' }, 'Суточные итоги'),
        React.createElement('div', { className: 'nutrition-v4-breakdown__grid' },
          React.createElement('span', null),
          macroRows.map((col) => React.createElement('span', { key: 'h-' + col.key, className: 'nutrition-v4-breakdown__head' }, col.label)),
          React.createElement('span', { className: 'nutrition-v4-breakdown__row-label' }, 'Факт'),
          macroRows.map((col) => React.createElement('span', {
            key: 'f-' + col.key,
            className: 'nutrition-v4-breakdown__cell nutrition-v4-breakdown__cell--fact'
          }, Math.round(Number(dayTot?.[col.key]) || 0))),
          React.createElement('span', { className: 'nutrition-v4-breakdown__row-label' }, 'Норма'),
          macroRows.map((col) => React.createElement('span', {
            key: 'n-' + col.key,
            className: 'nutrition-v4-breakdown__cell'
          }, Math.round(Number(normAbs?.[col.key]) || 0) || '—')),
          React.createElement('span', { className: 'nutrition-v4-breakdown__row-label nutrition-v4-breakdown__row-label--muted' }, 'Откл.'),
          macroRows.map((col) => {
            const dev = deviationPct(dayTot?.[col.key], normAbs?.[col.key]);
            const isGood = dev === null ? true : col.higherBetter ? dev >= 0 : dev <= 0;
            return React.createElement('span', {
              key: 'd-' + col.key,
              className: 'nutrition-v4-breakdown__cell nutrition-v4-breakdown__cell--dev' + (isGood ? ' is-good' : ' is-warn')
            }, dev === null ? '—' : formatDeviation(dev, col.higherBetter));
          })
        )
      ),

      React.createElement('div', { className: 'nutrition-v4-mini-cards' },
        React.createElement('div', { className: 'nutrition-v4-mini-card nutrition-v4-mini-card--fiber' },
          React.createElement('div', { className: 'nutrition-v4-mini-card__label' }, 'Клетчатка'),
          React.createElement('div', { className: 'nutrition-v4-mini-card__value' },
            fiberEaten,
            React.createElement('span', { className: 'nutrition-v4-mini-card__suffix' }, ' / ' + (fiberNorm || '—') + ' г')
          )
        ),
        React.createElement('div', { className: 'nutrition-v4-mini-card nutrition-v4-mini-card--harm' },
          React.createElement('div', { className: 'nutrition-v4-mini-card__label' }, 'Вредность'),
          React.createElement('div', { className: 'nutrition-v4-mini-card__value-row' },
            React.createElement('span', { className: 'nutrition-v4-mini-card__value' }, harmValue.toFixed(1).replace('.', ',')),
            harmGood && React.createElement('span', { className: 'nutrition-v4-mini-card__ok', 'aria-hidden': 'true' }, '✓')
          ),
          React.createElement('div', { className: 'nutrition-v4-mini-card__hint' },
            'порог ' + harmNorm + ' · ' + (harmGood ? 'идеально' : 'выше нормы')
          )
        )
      ),

      dailyWaveOverview && React.createElement('div', { className: 'nutrition-v4-waves' }, dailyWaveOverview),

      // Полный вид воды — карточка из канваса water-add (контракт 42: живёт в
      // «Разборе дня» на вкладке «Питание» и показывается всегда).
      window.HEYS?.dayWaterCard?.buildWaterCard?.({
        React,
        day: { ...(day || {}), waterMl: waterCurrent },
        waterGoal: waterTarget,
        waterGoalBreakdown,
        waterLastDrink,
        haptic,
        openExclusivePopup,
        addWater,
        removeWater
      }),

      legacyMealsUI && React.createElement('div', {
        id: 'diary-heading',
        className: 'nutrition-v4-legacy-meals',
        'aria-hidden': 'true'
      }, legacyMealsUI)
    );
  }

  function renderNutritionCard(params) {
    return React.createElement(NutritionTabV4, params);
  }

  HEYS.dayNutrition = {
    render: renderNutritionCard,
    NutritionTabV4
  };

  HEYS.NutritionV4 = {
    formatShortDate,
    countFilledMeals,
    formatMealCountLabel,
    formatTabMetaLine,
    mealTypeLabel
  };

})(window);
