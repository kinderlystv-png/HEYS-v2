// heys_fingers_safety_v1.js — Pre-flight checklist перед max-протоколами.
// Wave 2-A: React-компонент с inline checklist + готовый rampWarmupSteps.
//
// Public API:
//   HEYS.Fingers.SafetyGate({protocol, onProceed, onCancel}) — React-компонент
//   HEYS.Fingers.SafetyGate.rampWarmupSteps — массив 4 шагов RAMP
//
// RAMP = Raise / Activate / Mobilize / Potentiate (Jeffreys 2007).
// Чек-листа 5 пунктов: разогрев / нет боли / нет swelling / >48ч с прошлой max / нет lumbrical pain.
// Если все галочки → onProceed; иначе блокируем с рекомендацией.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__safetyRegistered) return; // idempotent
  Fingers.__safetyRegistered = true;

  const React = global.React;

  /** RAMP warmup протокол — 4 фазы, ~15-20 минут до max-сессии. */
  const rampWarmupSteps = [
    {
      id: 'raise',
      label: 'R — Raise (поднять температуру)',
      durationMin: 5,
      description: 'Лёгкое кардио (скакалка, jumping jacks, бег на месте) до лёгкого пота. Температура мышц поднимается на 1-2°C — снижает риск разрыва.'
    },
    {
      id: 'activate',
      label: 'A — Activate (активировать)',
      durationMin: 4,
      description: 'Pull-aparts с резиной, scapular pulls, лёгкие отжимания. Включает стабилизаторы плеча и лопатки — критично для безопасных висов.'
    },
    {
      id: 'mobilize',
      label: 'M — Mobilize (мобилизация)',
      durationMin: 4,
      description: 'Wrist circles, finger flexion/extension, локоть и плечо. Каждый сустав по 8-10 повторов в обе стороны.'
    },
    {
      id: 'potentiate',
      label: 'P — Potentiate (потенциация)',
      durationMin: 5,
      description: 'Прогрессивные висы на больших краях: 5 с на 25 мм open hand → 7 с на 20 мм half crimp → 5 с с лёгким весом (если max-протокол). Не до отказа.'
    }
  ];

  /** @type {Array<{id:string,label:string,critical:boolean,hint?:string}>} */
  const CHECKLIST_ITEMS = [
    {
      id: 'warmup_done',
      label: 'Разогрев RAMP завершён (15-20 минут)',
      critical: true,
      hint: 'Без разогрева риск разрыва pulley A2 многократно выше — Schöffl 2021.'
    },
    {
      id: 'no_acute_pain',
      label: 'Нет острой боли в пальцах',
      critical: true,
      hint: 'Любая острая боль — стоп. Записать в дневник и сделать только No-Hangs или отдыхать.'
    },
    {
      id: 'no_pip_swelling',
      label: 'Нет утренней припухлости PIP-суставов',
      critical: true,
      hint: 'Припухлость PIP — ранний признак capsulitis или микротравмы блока.'
    },
    {
      id: 'rest_48h',
      label: 'Прошло > 48 часов с прошлой max-сессии',
      critical: true,
      hint: 'Синтез коллагена в сухожилиях — 48-72 часа (Shaw 2017, Magnusson 2010).'
    },
    {
      id: 'no_lumbrical_pain',
      label: 'Нет боли в lumbrical (между пальцами в ладони)',
      critical: false,
      hint: 'Lumbrical strain — частая травма при back-3 и mono. При боли — пропусти эти хваты.'
    }
  ];

  /**
   * SafetyGate — pre-flight модалка перед max-протоколом.
   * @param {{protocol:object,onProceed:Function,onCancel:Function}} props
   */
  function SafetyGate(props) {
    if (!React) {
      console.warn('[Fingers.SafetyGate] React not loaded');
      return null;
    }
    const protocol = (props && props.protocol) || {};
    const onProceed = (props && props.onProceed) || function () {};
    const onCancel = (props && props.onCancel) || function () {};

    const checkedState = React.useState({});
    const checked = checkedState[0];
    const setChecked = checkedState[1];

    const toggle = React.useCallback(function (id) {
      setChecked(function (prev) {
        const next = Object.assign({}, prev);
        next[id] = !prev[id];
        return next;
      });
    }, []);

    const allCriticalChecked = React.useMemo(function () {
      return CHECKLIST_ITEMS.every(function (item) {
        if (!item.critical) return true;
        return checked[item.id] === true;
      });
    }, [checked]);

    const handleProceed = React.useCallback(function () {
      if (!allCriticalChecked) return;
      try { onProceed(checked); } catch (e) { console.warn('[Fingers.SafetyGate] onProceed failed', e); }
    }, [allCriticalChecked, checked, onProceed]);

    return React.createElement('div', {
      className: 'fingers-safety-gate-backdrop',
      onClick: function (e) { if (e.target === e.currentTarget) onCancel(); },
      style: {
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(15,23,42,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16
      }
    },
      React.createElement('div', {
        className: 'fingers-safety-gate',
        style: {
          background: 'var(--card,#fff)', borderRadius: 16,
          maxWidth: 480, width: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }
      },
        // Header
        React.createElement('div', {
          style: {
            padding: '16px 20px', borderBottom: '1px solid var(--border,#e5e7eb)',
            display: 'flex', alignItems: 'center', gap: 10
          }
        },
          React.createElement('span', { style: { fontSize: 22 } }, '⚠️'),
          React.createElement('div', { style: { fontWeight: 700, fontSize: 16 } },
            'Проверь перед стартом'
          )
        ),
        // Subtitle про protocol
        protocol && protocol.name
          ? React.createElement('div', {
              style: { padding: '8px 20px 0', fontSize: 13, color: 'var(--text-muted,#64748b)' }
            }, 'Программа: ', React.createElement('strong', null, protocol.name))
          : null,
        // Checklist
        React.createElement('div', {
          style: { padding: '12px 20px', overflowY: 'auto', flex: 1 }
        },
          CHECKLIST_ITEMS.map(function (item) {
            const isChecked = checked[item.id] === true;
            return React.createElement('label', {
              key: item.id,
              style: {
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 0', cursor: 'pointer',
                borderBottom: '1px solid var(--border-soft,rgba(148,163,184,0.15))'
              }
            },
              React.createElement('input', {
                type: 'checkbox',
                checked: isChecked,
                onChange: function () { toggle(item.id); },
                style: { marginTop: 3, flexShrink: 0, width: 18, height: 18, cursor: 'pointer' }
              }),
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', {
                  style: { fontSize: 14, fontWeight: 500, lineHeight: 1.3 }
                },
                  item.label,
                  item.critical
                    ? React.createElement('span', {
                        style: { color: '#ef4444', marginLeft: 4, fontSize: 12 }
                      }, '*')
                    : null
                ),
                item.hint
                  ? React.createElement('div', {
                      style: { fontSize: 12, color: 'var(--text-muted,#64748b)', marginTop: 2, lineHeight: 1.4 }
                    }, item.hint)
                  : null
              )
            );
          })
        ),
        // Footer
        React.createElement('div', {
          style: {
            padding: '12px 20px', borderTop: '1px solid var(--border,#e5e7eb)',
            display: 'flex', gap: 10, justifyContent: 'flex-end'
          }
        },
          React.createElement('button', {
            type: 'button',
            onClick: onCancel,
            style: {
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-muted,#64748b)', fontWeight: 600
            }
          }, 'Отмена'),
          React.createElement('button', {
            type: 'button',
            disabled: !allCriticalChecked,
            onClick: handleProceed,
            style: {
              padding: '8px 16px', borderRadius: 8, border: 'none',
              cursor: allCriticalChecked ? 'pointer' : 'not-allowed',
              background: allCriticalChecked ? '#16a34a' : 'var(--bg-soft,rgba(148,163,184,0.3))',
              color: allCriticalChecked ? '#fff' : 'var(--text-muted,#94a3b8)',
              fontWeight: 700
            }
          }, 'Начать')
        )
      )
    );
  }

  SafetyGate.rampWarmupSteps = rampWarmupSteps;
  SafetyGate.checklistItems = CHECKLIST_ITEMS;
  SafetyGate.sourceIds = ['horst_podcast10', 'schoffl2021', 'uiaa_medcom'];

  // === Экспорт ===
  Fingers.SafetyGate = SafetyGate;
})(typeof window !== 'undefined' ? window : globalThis);
