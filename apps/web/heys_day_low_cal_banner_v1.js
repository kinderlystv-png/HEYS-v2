// heys_day_low_cal_banner_v1.js — Banner for days with kcal ratio < 50%
// that haven't been verified (fasting/incomplete). Lets user decide retroactively
// so the day starts being counted in stats (or stays excluded explicitly).

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  if (!React) return;

  const THRESHOLD = 0.5;

  function applyAndPersist(date, mutator) {
    const U = HEYS.utils || {};
    if (!U.lsSet || !U.lsGet) {
      console.warn('[low-cal-banner] HEYS.utils not ready, skipping write');
      return;
    }
    const key = 'heys_dayv2_' + date;
    const day = U.lsGet(key, null) || {};
    mutator(day);
    day.updatedAt = Date.now();
    U.lsSet(key, day);
    try {
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date, source: 'low-cal-banner', data: day }
      }));
    } catch (_) { }
  }

  function markFasting(date) {
    applyAndPersist(date, (d) => {
      d.isFastingDay = true;
      d.isIncomplete = false;
      d.yesterdayVerifyAction = 'confirm_real_data';
      d.yesterdayVerifyAt = Date.now();
    });
    HEYS.Toast?.success?.('День учтён как голодание');
  }

  function markIncomplete(date) {
    applyAndPersist(date, (d) => {
      d.isIncomplete = true;
      d.isFastingDay = false;
      d.yesterdayVerifyAction = 'fill_later';
      d.yesterdayVerifyAt = Date.now();
    });
    HEYS.Toast?.info?.('День помечен как пропуск');
  }

  function resetDecision(date) {
    applyAndPersist(date, (d) => {
      d.isFastingDay = false;
      d.isIncomplete = false;
      delete d.yesterdayVerifyAction;
      delete d.yesterdayVerifyAt;
      delete d.yesterdayVerifyVersion;
    });
  }

  function scrollToDiary() {
    const el = document.querySelector('[data-day-meals], .day-meals, .meals-section, #tour-meals');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const FULL_BANNER_STYLE = {
    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    border: '1px solid #f59e0b',
    borderRadius: 12,
    padding: '12px 14px',
    margin: '8px 0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
  };

  const COMPACT_BANNER_STYLE = {
    background: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: 10,
    padding: '8px 12px',
    margin: '8px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 13,
    color: '#475569'
  };

  const ACTION_BTN_STYLE = {
    flex: '1 1 calc(50% - 4px)',
    minWidth: 140,
    padding: '8px 10px',
    border: '1px solid rgba(15,23,42,0.12)',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#1f2937',
    textAlign: 'left',
    transition: 'all 0.15s'
  };

  const CHANGE_BTN_STYLE = {
    padding: '4px 10px',
    border: '1px solid rgba(15,23,42,0.15)',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    color: '#1f2937'
  };

  function renderLowCalBanner(params) {
    const { date, day, eatenKcal, displayOptimum, isToday } = params || {};
    if (!day || isToday) return null;

    const hasMeals = Array.isArray(day.meals)
      && day.meals.some((m) => Array.isArray(m && m.items) && m.items.length > 0);
    if (!hasMeals) return null;

    const target = displayOptimum || day.savedDisplayOptimum || 0;
    const kcal = eatenKcal || day.savedEatenKcal || 0;
    if (target <= 0 || kcal <= 0) return null;

    const ratio = kcal / target;
    if (ratio >= THRESHOLD) return null;

    // State B — отмечен как голодание
    if (day.isFastingDay === true) {
      return React.createElement('div', { className: 'low-cal-banner low-cal-banner-compact', style: COMPACT_BANNER_STYLE },
        React.createElement('span', null, '🍽 День отмечен как осознанное голодание'),
        React.createElement('button', {
          type: 'button',
          onClick: () => resetDecision(date),
          style: CHANGE_BTN_STYLE,
          title: 'Сбросить решение и показать варианты заново'
        }, 'Изменить')
      );
    }

    // State C — помечен как пропуск
    if (day.isIncomplete === true) {
      return React.createElement('div', { className: 'low-cal-banner low-cal-banner-compact', style: COMPACT_BANNER_STYLE },
        React.createElement('span', null, '🚫 День помечен как пропуск (не учитывается)'),
        React.createElement('button', {
          type: 'button',
          onClick: () => resetDecision(date),
          style: CHANGE_BTN_STYLE,
          title: 'Сбросить решение и показать варианты заново'
        }, 'Изменить')
      );
    }

    // State A — решение не принято
    const pct = Math.round(ratio * 100);
    return React.createElement('div', { className: 'low-cal-banner low-cal-banner-full', style: FULL_BANNER_STYLE },
      React.createElement('div', {
        style: { fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }
      }, '⚠️ Этот день не учитывается в статистике'),
      React.createElement('div', {
        style: { fontSize: 12, color: '#78350f', marginBottom: 10 }
      }, `Съедено ${Math.round(kcal)} ккал из ${Math.round(target)} (${pct}%) — ниже порога 50%. Выбери что делать:`),
      React.createElement('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: 8 }
      },
        React.createElement('button', {
          type: 'button',
          onClick: () => markFasting(date),
          style: ACTION_BTN_STYLE,
          title: 'Засчитать день как осознанное голодание'
        }, '🍽 Это было голодание'),
        React.createElement('button', {
          type: 'button',
          onClick: scrollToDiary,
          style: ACTION_BTN_STYLE,
          title: 'Прокрутить к дневнику еды чтобы дописать'
        }, '✏️ Дописать пропущенное'),
        React.createElement('button', {
          type: 'button',
          onClick: () => markIncomplete(date),
          style: ACTION_BTN_STYLE,
          title: 'Явно исключить день из статистики'
        }, '🚫 Не учитывать день')
      )
    );
  }

  HEYS.dayLowCalBanner = {
    renderLowCalBanner,
    markFasting,
    markIncomplete,
    resetDecision
  };
})(typeof window !== 'undefined' ? window : globalThis);
