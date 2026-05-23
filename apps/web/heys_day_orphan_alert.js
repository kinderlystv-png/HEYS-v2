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
    // 🪦 F6 (plan 2026-05-24): дополнительно резолвим через shared cache —
    // без этого баннер показывал orphan'ов, чьё имя точно матчится в общей базе
    // (race с подгрузкой shared-кеша на boot).
    const sharedForFilter = (HEYS.cloud && typeof HEYS.cloud.getCachedSharedProducts === 'function')
      ? (HEYS.cloud.getCachedSharedProducts() || [])
      : [];
    const trulyUnresolved = [];
    for (const o of listForUi) {
      // ⚡ Defense in depth: разовые продукты by design не в БД, не показываем алерт.
      if (o && (o._oneTime === true ||
                (typeof o.product_id === 'string' && o.product_id.indexOf('oneoff_') === 0) ||
                (typeof o.productId === 'string' && o.productId.indexOf('oneoff_') === 0))) {
        if (typeof HEYS.orphanProducts?.remove === 'function') {
          try { HEYS.orphanProducts.remove(o.name); } catch (_) { /* noop */ }
        }
        continue;
      }
      const id = o?.product_id ?? o?.productId ?? null;
      let resolved = null;
      if (id != null && HEYS.products && typeof HEYS.products.getById === 'function') {
        try { resolved = HEYS.products.getById(id); } catch (_) { resolved = null; }
      }
      // 🪦 КРИТИЧНО: getById имеет fallback на _stampResolutionCache (heys_core_v12.js:5060),
      // который возвращает продукт даже если его НЕТ в реальной базе (overlay/personal).
      // Маркер _recoveredFrom='stamp' ставится в heys_day_utils.js:1240 для stamp-cache записей.
      // Такой «найденный» продукт — это и есть orphan, который мы хотим показать в баннере
      // с выбором «восстановить» / «сделать разовыми». Без этой проверки banner молчит.
      const isStampOnlyFallback = resolved && resolved._recoveredFrom === 'stamp';
      if (resolved && !isStampOnlyFallback) {
        if (typeof HEYS.orphanProducts?.remove === 'function') {
          try { HEYS.orphanProducts.remove(o.name); } catch (_) { /* noop */ }
        }
        continue;
      }
      // F6: фолбэк в shared cache. Если name/fingerprint/id matchится с общей базой —
      // продукт резолвим, не показываем в баннере. Tracker чистим (recalculate может
      // быть не запущен на этот render).
      if (sharedForFilter.length > 0 && typeof HEYS.orphanProducts?._resolveByItem === 'function') {
        let foundInShared = null;
        try { foundInShared = HEYS.orphanProducts._resolveByItem(o, sharedForFilter); } catch (_) { foundInShared = null; }
        if (foundInShared) {
          if (typeof HEYS.orphanProducts.remove === 'function') {
            try { HEYS.orphanProducts.remove(o.name); } catch (_) { /* noop */ }
          }
          continue;
        }
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
          // Контейнер с двумя кнопками: «Восстановить в базу» + «Сделать разовыми»
          React.createElement('div', {
            style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }
          },
            // Кнопка восстановления (исходное поведение — продукт возвращается в личную базу)
            React.createElement('button', {
              style: {
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
              title: 'Вернуть продукты в личную базу (как обычные)',
              onClick: async () => {
                const result = await HEYS.orphanProducts?.restore?.();
                if (result?.success) {
                  HEYS.Toast?.success(`Восстановлено ${result.count} продуктов! Обновите страницу для применения.`) || alert(`✅ Восстановлено ${result.count} продуктов!\nОбновите страницу для применения.`);
                  window.location.reload();
                } else {
                  HEYS.Toast?.warning('Не удалось восстановить — нет данных в штампах.') || alert('⚠️ Не удалось восстановить — нет данных в штампах.');
                }
              }
            }, '🔧 Восстановить в базу'),

            // ⚡ Новая кнопка «Сделать разовыми» — конвертирует meal-items в _oneTime,
            // данные остаются в истории приёмов, личная база не засоряется.
            // Доступна только если есть orphans с inline-stamp (kcal100 != null).
            (function () {
              const eligible = trulyUnresolved.filter(function (o) { return o && o.hasInlineData === true; });
              if (eligible.length === 0) return null;
              return React.createElement('button', {
                style: {
                  padding: '8px 16px',
                  background: '#8b5cf6',
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
                title: 'Оставить продукты только в истории приёмов, не возвращая в личную базу',
                onClick: function () {
                  try {
                    const r = HEYS.orphanProducts && typeof HEYS.orphanProducts.markAllAsOneTime === 'function'
                      ? HEYS.orphanProducts.markAllAsOneTime(eligible)
                      : null;
                    if (r && r.success) {
                      const n = r.convertedItems;
                      const word = n === 1 ? 'запись' : (n < 5 ? 'записи' : 'записей');
                      HEYS.Toast?.success(`${n} ${word} помечен${n === 1 ? 'а' : 'ы'} разовыми. Обновляем...`)
                        || alert(`⚡ ${n} ${word} помечен${n === 1 ? 'а' : 'ы'} разовыми.`);
                      setTimeout(function () { try { window.location.reload(); } catch (_) { /* noop */ } }, 600);
                    } else {
                      HEYS.Toast?.warning('Нет продуктов с данными в штампах для конвертации.')
                        || alert('⚠️ Нет продуктов с данными в штампах для конвертации.');
                    }
                  } catch (e) {
                    console.error('[orphan-alert] markAllAsOneTime failed:', e);
                    HEYS.Toast?.error('Ошибка: ' + (e?.message || e)) || alert('❌ Ошибка: ' + (e?.message || e));
                  }
                }
              }, '⚡ Сделать разовыми (' + eligible.length + ')');
            })()
          )
        )
      )
    );
  }
  
  // Export module
  HEYS.dayOrphanAlert = {
    renderOrphanAlert
  };
  
})(window);
