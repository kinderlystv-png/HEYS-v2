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
  function renderOrphanAlert(params) {
    const { orphanCount, date } = params;
    const listForUi = (date && HEYS.orphanProducts?.getAllForDate)
      ? (HEYS.orphanProducts.getAllForDate(date) || [])
      : (HEYS.orphanProducts?.getAll?.() || []);
    try {
      const listLen = listForUi.length;
      if (orphanCount > 0 || listLen > 0) {
        console.warn('[HEYS.orphan:PIPE] render alert', {
          orphanCount,
          date: date || null,
          listLen,
          sample: listForUi.slice(0, 3).map((o) => o?.name || '(no-name)')
        });
      }
    } catch (_) { /* noop */ }
    
    if (!orphanCount || orphanCount === 0) {
      return false;
    }
    
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
        }, `${orphanCount} продукт${orphanCount === 1 ? '' : orphanCount < 5 ? 'а' : 'ов'} не найден${orphanCount === 1 ? '' : 'о'} в базе`),
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
            listForUi.map((o, i) => 
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
