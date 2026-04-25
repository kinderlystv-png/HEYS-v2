// heys_day_orphan_alert.js — Orphan products alert component
// Phase 13A of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js lines 11,923-12,012
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  /**
   * Render orphan products alert (products not found in database)
   * @param {Object} params - Parameters
   * @returns {React.Element|boolean} Alert element or false if no orphans
   */
  // Throttle suppression logs: a render-heavy DayTab can hit them dozens of times
  // per second otherwise. We only need the first SUPPRESSED to confirm the gate works.
  let _lastSuppressedAt = 0;
  function _shouldLogSuppress() {
    const now = Date.now();
    if (now - _lastSuppressedAt < 2000) return false;
    _lastSuppressedAt = now;
    return true;
  }

  function renderOrphanAlert(params) {
    const { orphanCount, date } = params;
    const listForUi = (date && HEYS.orphanProducts?.getAllForDate)
      ? (HEYS.orphanProducts.getAllForDate(date) || [])
      : (HEYS.orphanProducts?.getAll?.() || []);

    if (!orphanCount || orphanCount === 0) {
      return false;
    }

    // Suppress during the brief recovery window (~100-500ms after boot).
    if (HEYS.orphanProducts && HEYS.orphanProducts._recoveryInProgress === true) {
      if (_shouldLogSuppress()) {
        console.info('[HEYS.products] orphan-warning SUPPRESSED (recovery in progress)', {
          orphanCount,
          listLen: listForUi.length,
        });
      }
      return false;
    }

    // Re-validate: orphanProductsMap can carry stale entries from early renders
    // that ran before overlay was hydrated. Filter listForUi by what's actually
    // unresolvable now via getById + stamp cache. If everything resolves, the
    // tracker is stale — silently clean it and skip the warning.
    const trulyUnresolved = [];
    for (const o of listForUi) {
      const id = o?.product_id ?? o?.productId ?? null;
      let resolved = null;
      if (id != null && HEYS.products && typeof HEYS.products.getById === 'function') {
        try { resolved = HEYS.products.getById(id); } catch (_) { resolved = null; }
      }
      if (resolved) {
        if (typeof HEYS.orphanProducts?.remove === 'function') {
          try { HEYS.orphanProducts.remove(o.name); } catch (_) { /* noop */ }
        }
        continue;
      }
      trulyUnresolved.push(o);
    }
    if (trulyUnresolved.length === 0) {
      if (_shouldLogSuppress()) {
        console.info('[HEYS.products] orphan-warning SUPPRESSED (all entries resolvable)', {
          cleanedFromTracker: listForUi.length,
        });
      }
      return false;
    }

    // Warning IS rendering in DOM — log once with the unresolved sample so we know
    // exactly which products show up and why suppression couldn't catch them.
    try {
      console.warn('[HEYS.products] orphan-warning RENDERED IN DOM', {
        date: date || null,
        unresolvedCount: trulyUnresolved.length,
        unresolvedSample: trulyUnresolved.slice(0, 3).map(o => ({
          name: o?.name,
          productId: o?.product_id ?? o?.productId,
          hasInlineData: !!o?.hasInlineData,
        })),
      });
    } catch (_) { /* noop */ }
    
    return React.createElement('div', {
      className: 'orphan-alert compact-card',
      style: {
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        border: '1px solid #f59e0b',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }
    },
      React.createElement('span', { style: { fontSize: '20px' } }, '⚠️'),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { 
          style: { 
            fontWeight: 600, 
            color: '#92400e', 
            marginBottom: '4px',
            fontSize: '14px'
          } 
        }, (function () {
          const n = trulyUnresolved.length;
          return `${n} продукт${n === 1 ? '' : n < 5 ? 'а' : 'ов'} не найден${n === 1 ? '' : 'о'} в базе`;
        })()),
        React.createElement('div', { 
          style: { 
            color: '#a16207', 
            fontSize: '12px',
            lineHeight: '1.4'
          } 
        }, date
          ? `Калории считаются по сохранённым данным за выбранный день (${date}). Нажми чтобы увидеть список.`
          : 'Калории считаются по сохранённым данным. Нажми чтобы увидеть список.'),
        // Список orphan-продуктов
        React.createElement('details', { 
          style: { marginTop: '8px' }
        },
          React.createElement('summary', { 
            style: { 
              cursor: 'pointer', 
              color: '#92400e',
              fontSize: '12px',
              fontWeight: 500
            } 
          }, 'Показать продукты'),
          React.createElement('ul', { 
            style: { 
              margin: '8px 0 0 0', 
              padding: '0 0 0 20px',
              fontSize: '12px',
              color: '#78350f'
            } 
          },
            trulyUnresolved.map((o, i) =>
              React.createElement('li', { key: o.name || i, style: { marginBottom: '4px' } },
                React.createElement('strong', null, o.name),
                ` — ${o.hasInlineData ? '✓ можно восстановить' : '⚠️ нет данных'}`,
                // Показываем даты использования
                o.usedInDays && o.usedInDays.length > 0 && React.createElement('div', {
                  style: { fontSize: '11px', color: '#92400e', marginTop: '2px' }
                }, `📅 ${o.usedInDays.slice(0, 5).join(', ')}${o.usedInDays.length > 5 ? ` и ещё ${o.usedInDays.length - 5}...` : ''}`)
              )
            )
          ),
          // Кнопка восстановления
          React.createElement('button', {
            style: {
              marginTop: '10px',
              padding: '8px 16px',
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            },
            onClick: async () => {
              const result = await HEYS.orphanProducts?.restore?.();
              if (result?.success) {
                HEYS.Toast?.success(`Восстановлено ${result.count} продуктов! Обновите страницу для применения.`) || alert(`✅ Восстановлено ${result.count} продуктов!\nОбновите страницу для применения.`);
                window.location.reload();
              } else {
                HEYS.Toast?.warning('Не удалось восстановить — нет данных в штампах.') || alert('⚠️ Не удалось восстановить — нет данных в штампах.');
              }
            }
          }, '🔧 Восстановить в базу')
        )
      )
    );
  }
  
  // Export module
  HEYS.dayOrphanAlert = {
    renderOrphanAlert
  };
  
})(window);
