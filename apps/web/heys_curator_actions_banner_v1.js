// heys_curator_actions_banner_v1.js
// Curator-actions review sheet for PIN clients (canvas v4).
//
// Flow:
//   1) After full heysSyncCompleted — RPC get_my_curator_changelog_since.
//   2) Initial backlog opens as a bottom sheet after app blockers clear.
//      Morning check-in in progress blocks the sheet; unfinished check-in does not.
//   3) Live meal edits accumulate for 30 minutes; a new training opens immediately.
//   4) «Понятно» acks shown entries and closes without navigation.
//   5) Row tap navigates, hides that action locally for the PIN session, does not
//      ack the changelog row until no visible actions remain.
//   6) «Позже» / × / Esc / backdrop snoozes 15 minutes. After two auto-shows
//      per session the third sheet does not come — a 7px dot on «Питание».
//   7) In-tab day cue appears only while unacked changes remain; after «Понятно»
//      the cue and auto-sheet stop for those entries. Empty sheet never opens.
//   8) ?openCuratorFeed=1 from push queues after blockers, not over check-in.
//
// Не зависит от React — vanilla DOM. CSS in apps/web/styles/modules/500-pwa-and-offline.css.

(function () {
  'use strict';
  const HEYS = (window.HEYS = window.HEYS || {});

  const ACK_QUEUE_KEY = 'heys_curator_actions_pending_ack_v1';
  const SNOOZE_UNTIL_KEY = 'heys_curator_review_snoozed_until_ts';
  const SHOW_COUNT_KEY = 'heys_curator_review_show_count_v1';
  const HIDDEN_ACTIONS_KEY = 'heys_curator_hidden_actions_v1';
  const REVIEWED_BY_DATE_KEY = 'heys_curator_reviewed_by_date_v1';
  const VERIFY_MARK = '2026-08-16-curator-actions-sheet-v4';
  const LIVE_ACCUMULATE_MS = 30 * 60 * 1000;
  const SNOOZE_MS = 15 * 60 * 1000;
  const ACK_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_ACK_QUEUE_ITEMS = 20;
  const MAX_AUTO_SHOWS_PER_SESSION = 2;
  const MEAL_PRODUCTS_PREVIEW = 3;
  const COLLAPSED_DAY_CAP = 2;

  // ─── State ────────────────────────────────────────────────────────

  let _modalEl = null;
  let _entries = [];
  let _reviewEntries = [];
  let _renderedEntries = [];
  let _hasMore = false;
  let _checkInFlight = false;
  let _mounted = false;
  let _forceOpenOnce = false;
  let _initialCheckDone = false;
  let _sessionContextKey = null;
  let _reviewTimer = null;
  let _previousFocus = null;
  let _bodyOverflowBeforeModal = '';
  let _modalKeydownHandler = null;
  let _ackQueueCache = null;
  let _filterDate = null;
  let _expandedDates = new Set();
  let _expandedMeals = new Set();
  let _expandedTail = false;
  let _hiddenActionKeys = null;
  let _reviewedByDate = null;
  let _cuesTimer = null;
  // Диагностика: образец без имени куратора → «Антон» как в canvas.
  let _titleNameOverride = null;

  // ─── Utilities ────────────────────────────────────────────────────

  function ymdLabel(iso) {
    try {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
      const d = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    } catch (_) {
      return iso;
    }
  }

  function pluralRu(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs >= 11 && abs <= 14) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function trimNum(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
    if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
    return n.toFixed(1).replace(/\.0$/, '');
  }

  function parseTsMs(ts) {
    const ms = Date.parse(ts || '');
    return Number.isFinite(ms) ? ms : null;
  }

  function latestEntryTs(entries) {
    let latest = null;
    for (const e of (entries || [])) {
      const ts = e && e.created_at;
      if (ts && (!latest || ts > latest)) latest = ts;
    }
    return latest;
  }

  function entryIds(entries) {
    return (entries || [])
      .map(e => e && e.id)
      .filter(id => typeof id === 'string' && id.length > 0);
  }

  function targetDateFromEntries(entries) {
    for (const entry of (entries || [])) {
      const date = targetDateFromEntry(entry);
      if (date) return date;
    }
    const latest = latestEntryTs(entries);
    return latest ? latest.slice(0, 10) : null;
  }

  function targetDateFromEntry(entry) {
    if (!entry) return null;
    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    for (const key of keys) {
      const match = String(key || '').match(/dayv2_(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    const ts = entry.created_at || '';
    return ts ? ts.slice(0, 10) : null;
  }

  function targetDateForAction(entry, action) {
    return (action && action.date) || targetDateFromEntry(entry);
  }

  function cssEscape(value) {
    const s = String(value == null ? '' : value);
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
    } catch (_) {}
    return s.replace(/["\\]/g, '\\$&');
  }

  function buildActionTarget(entry, action) {
    const a = action || {};
    const date = targetDateForAction(entry, a);
    const target = {
      date,
      tab: 'diary',
      type: a.type || 'unknown',
      selectors: [],
    };

    const mealId = a.meal_id || null;
    const mealTime = a.time || null;
    const itemId = a.item_id || null;
    const firstItem = Array.isArray(a.items) ? a.items.find(Boolean) : null;
    const firstItemId = firstItem?.item_id || null;
    const trainingIndex = Number.isInteger(a.training_index) ? a.training_index : null;

    if (itemId && a.type !== 'meal_item_removed') target.selectors.push(`[data-item-id="${cssEscape(itemId)}"]`);
    if (firstItemId && a.type !== 'meal_item_removed') target.selectors.push(`[data-item-id="${cssEscape(firstItemId)}"]`);
    if (mealId) target.selectors.push(`[data-meal-id="${cssEscape(mealId)}"]`);
    if (mealTime) target.selectors.push(`[data-meal-time="${cssEscape(mealTime)}"]`);

    switch (a.type) {
      case 'water_set':
        target.tab = 'diary';
        target.selectors.push('#water-card');
        break;
      case 'steps_set':
        target.tab = 'activity';
        target.selectors.push('[data-curator-target="steps"]', '.activity-steps-card', '.compact-activity');
        break;
      case 'training_added':
        target.tab = 'activity';
        if (trainingIndex != null) target.selectors.push(`[data-training-index="${trainingIndex}"]`);
        // Activity v4: .month-trainings-card removed from DOM; live markers only.
        target.selectors.push('[data-curator-target="training"]', '.compact-activity', '[data-curator-target="activity"]');
        break;
      case 'training_removed':
        target.tab = 'activity';
        // training-summary / month-trainings-card gone after Activity v4 tiers.
        target.selectors.push('[data-curator-target="activity"]');
        break;
      // Строка «адреса переходов»: еда, вес, вода, сон — дневник нужного дня.
      // Вес и сон живут на странице дня (heys_day_main_block_v1.js,
      // heys_day_side_block_v1.js), а не во вкладке «Статистика»: прежний
      // адрес уводил туда, где помеченного элемента нет, и вспышка не
      // срабатывала вовсе.
      case 'weight_set':
        target.tab = 'diary';
        target.selectors.push('[data-curator-target="weight"]', '.vio-row.total-kcal');
        break;
      case 'sleep_set':
        target.tab = 'diary';
        target.selectors.push('[data-curator-target="sleep"]', '.sleep-card');
        break;
      // Строка «адреса переходов»: нормы, профиль, план — дневник по умолчанию.
      // Дата не назначается: правка не привязана к дню, и переключать день
      // под неё нечем. Подсвечивается сводка дневника — место, где изменение
      // норм и профиля видно человеку числом.
      case 'profile_changed':
        target.date = null;
        target.selectors.push('[data-curator-target="nutrition"]', '#diary-heading');
        break;
      case 'norms_changed':
        target.date = null;
        target.selectors.push('[data-curator-target="nutrition"]', '#diary-heading');
        break;
      case 'planning_changed':
        target.date = null;
        target.selectors.push('[data-curator-target="nutrition"]', '#diary-heading');
        break;
      case 'meal_removed':
        target.tab = 'diary';
        target.selectors.push('#diary-heading');
        break;
      default:
        target.selectors.push('#diary-heading', '.meal-card', '#water-card', '.activity-section');
        break;
    }

    target.selectors = Array.from(new Set(target.selectors.filter(Boolean)));
    return target;
  }

  // Aggregate actions across all entries into a short modal summary.
  // Возвращает null если после дедупа+фильтра нет видимых действий.
  function summarizeEntries(entries) {
    const rawByDate = new Map();
    for (const e of (entries || [])) {
      const d = (e.created_at || '').slice(0, 10);
      const acts = (e && e.actions && Array.isArray(e.actions.actions)) ? e.actions.actions : [];
      if (!rawByDate.has(d)) rawByDate.set(d, []);
      rawByDate.get(d).push(...acts);
    }
    let mealsAdded = 0, productsAdded = 0, productsRemoved = 0, portionsChanged = 0;
    let mealsRemoved = 0, trainAdded = 0, trainRemoved = 0;
    let weight = null, normsTouched = false, profileTouched = false, planningTouched = false;
    let visibleTotal = 0;
    for (const acts of rawByDate.values()) {
      const collapsed = dedupAndCollapse(acts);
      for (const a of collapsed) {
        if (!isVisibleAction(a)) continue;
        visibleTotal++;
        if (a.type === 'meal_card' && a.kind === 'added') mealsAdded++;
        else if (a.type === 'meal_card' && a.kind === 'items_added') productsAdded += a.count || Math.max(1, (a.items || []).length);
        else if (a.type === 'meal_item_added') productsAdded += a.count || 1;
        else if (a.type === 'meal_item_changed') portionsChanged += a.count || 1;
        else if (a.type === 'meal_item_removed') productsRemoved += a.count || 1;
        else if (a.type === 'meal_removed') mealsRemoved++;
        else if (a.type === 'training_added') trainAdded++;
        else if (a.type === 'training_removed') trainRemoved++;
        else if (a.type === 'weight_set') weight = a;
        else if (a.type === 'norms_changed') normsTouched = true;
        else if (a.type === 'profile_changed') profileTouched = true;
        else if (a.type === 'planning_changed') planningTouched = true;
      }
    }
    if (visibleTotal === 0) return null;
    const parts = [];
    if (mealsAdded > 0) parts.push(`+${mealsAdded} ${pluralRu(mealsAdded, 'приём пищи', 'приёма пищи', 'приёмов пищи')}`);
    if (productsAdded > 0) parts.push(`+${productsAdded} ${pluralRu(productsAdded, 'продукт', 'продукта', 'продуктов')}`);
    if (portionsChanged > 0) parts.push('изменены порции');
    if (productsRemoved > 0) parts.push(`−${productsRemoved} ${pluralRu(productsRemoved, 'продукт', 'продукта', 'продуктов')}`);
    if (mealsRemoved > 0) parts.push(`−${mealsRemoved} ${pluralRu(mealsRemoved, 'приём', 'приёма', 'приёмов')}`);
    if (trainAdded > 0) parts.push(`+${trainAdded} ${pluralRu(trainAdded, 'тренировка', 'тренировки', 'тренировок')}`);
    if (trainRemoved > 0) parts.push(`−${trainRemoved} ${pluralRu(trainRemoved, 'тренировка', 'тренировки', 'тренировок')}`);
    if (weight) {
      if (weight.from != null) parts.push(`вес ${trimNum(weight.from)}→${trimNum(weight.to)} кг`);
      else parts.push(`вес ${trimNum(weight.to)} кг`);
    }
    if (normsTouched) parts.push('нормы');
    if (profileTouched) parts.push('профиль');
    if (planningTouched) parts.push('план');
    if (parts.length === 0) parts.push(`${visibleTotal} ${pluralRu(visibleTotal, 'правка', 'правки', 'правок')}`);
    if (parts.length > 3) {
      return `${visibleTotal} ${pluralRu(visibleTotal, 'изменение', 'изменения', 'изменений')} от куратора`;
    }
    return parts.join(', ');
  }

  // Возвращает строку для обычных action'ов; для meal_card — null (его рендерит
  // renderMealCardHtml как мульти-line карточку).
  function actionText(a) {
    if (!a || typeof a !== 'object') return '—';
    switch (a.type) {
      case 'meal_card':        return null;
      case 'meal_added':       return `Приём пищи: ${a.meal_label || a.name || ''}`;
      case 'meal_removed':     return `Удалён приём: ${a.name || ''}`;
      case 'meal_item_added':  return `В «${a.meal_name || a.meal_label || 'приём'}» добавлено ${a.count || 1} ${pluralRu(a.count || 1, 'продукт', 'продукта', 'продуктов')}`;
      case 'meal_item_changed': {
        const mealName = a.meal_name || a.meal_label || 'приём';
        const itemName = a.to_name || a.from_name || a.name || 'продукт';
        const grams = (a.from_grams != null && a.to_grams != null)
          ? `: ${trimNum(a.from_grams)} → ${trimNum(a.to_grams)} г`
          : '';
        return `В «${mealName}» изменён ${itemName}${grams}`;
      }
      case 'meal_item_removed': return `Из «${a.meal_name || a.meal_label || 'приём'}» удалено ${a.count || 1} ${pluralRu(a.count || 1, 'продукт', 'продукта', 'продуктов')}`;
      case 'training_added':   return `Тренировка: ${a.kind || ''}${a.duration_min ? ` · ${a.duration_min} мин` : ''}${a.time ? ` (${a.time})` : ''}`;
      case 'training_removed': return `Удалена тренировка: ${a.kind || ''}`;
      case 'weight_set':       return a.from != null ? `Вес: ${trimNum(a.from)} → ${trimNum(a.to)} кг` : `Вес: ${trimNum(a.to)} кг`;
      case 'sleep_set':        return `Сон: ${trimNum(a.to)} ч`;
      case 'steps_set':        return `Шаги: ${a.to}`;
      case 'water_set':        return `Вода: ${a.to} мл`;
      case 'norms_changed':    return `Обновлены нормы${a.fields && a.fields.length ? ` (${a.fields.join(', ')})` : ''}`;
      case 'profile_changed':  return `Обновлён профиль${a.fields && a.fields.length ? ` (${a.fields.join(', ')})` : ''}`;
      case 'planning_changed': return 'Обновлён план/задачи';
      case 'truncated':        return `…и ещё ${a.count} изменений`;
      default:                 return 'Обновлены данные';
    }
  }

  function isVisibleAction(a) {
    if (!a) return false;
    if (a.type === 'meal_card' || a.type === 'meal_repeat_group' || a.type === 'meal_item_removed_group') return true;
    return !!actionText(a);
  }

  function chevronSvg(down) {
    const d = down ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6';
    return `<span class="ca-modal__chevron" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>`;
  }

  function renderRowCopyHtml(copy) {
    const sub = copy.subtitle
      ? `<span class="ca-modal__item-sub">${escapeHtml(copy.subtitle)}</span>`
      : '';
    return `<span class="ca-modal__item-copy"><b class="ca-modal__item-title">${escapeHtml(copy.title)}</b>${sub}</span>`;
  }

  function renderMealCardHtml(a, targetId, entry) {
    const copy = actionRowCopy(a);
    const itemsArr = Array.isArray(a.items) ? a.items : [];
    const mealKey = actionKey(entry, a);
    const expanded = _expandedMeals.has(mealKey);
    const visibleItems = expanded ? itemsArr : itemsArr.slice(0, MEAL_PRODUCTS_PREVIEW);
    const rest = Math.max(0, itemsArr.length - MEAL_PRODUCTS_PREVIEW);
    const items = visibleItems.map((it) => {
      const name = escapeHtml(it.name || '?');
      const grams = (it.grams != null)
        ? `<span class="ca-modal__item-grams">${escapeHtml(String(it.grams))} г</span>`
        : '';
      return `<li class="ca-modal__meal-product"><span>${name}</span>${grams}</li>`;
    }).join('');
    let extra = '';
    if (!expanded && rest > 0) {
      extra = `<button class="ca-modal__more-products" type="button" data-ca-expand-meal="${escapeHtml(mealKey)}">и ещё ${rest} ${pluralRu(rest, 'продукт', 'продукта', 'продуктов')}</button>`;
    } else if (expanded && itemsArr.length > MEAL_PRODUCTS_PREVIEW) {
      extra = `<button class="ca-modal__more-products" type="button" data-ca-expand-meal="${escapeHtml(mealKey)}">Свернуть</button>`;
    }
    return `
      <li class="ca-modal__meal-card">
        <button class="ca-modal__item" type="button" data-ca-target-id="${escapeHtml(targetId)}" data-ca-action-key="${escapeHtml(mealKey)}">
          ${renderRowCopyHtml(copy)}
          ${chevronSvg(false)}
        </button>
        ${items ? `<div class="ca-modal__meal-divider"></div><ul class="ca-modal__meal-products">${items}</ul>${extra}` : ''}
      </li>
    `;
  }

  function renderActionRowHtml(a, targetId, entry) {
    const copy = actionRowCopy(a);
    const key = actionKey(entry, a);
    return `<li><button class="ca-modal__item" type="button" data-ca-target-id="${escapeHtml(targetId)}" data-ca-action-key="${escapeHtml(key)}">${renderRowCopyHtml(copy)}${chevronSvg(false)}</button></li>`;
  }

  function renderRepeatGroupHtml(action, registerTarget, entry) {
    const key = repeatGroupExpandKey(action);
    const expanded = _expandedMeals.has(key);
    const copy = actionRowCopy(action);
    const badge = `<span class="ca-modal__repeat-badge" aria-hidden="true">×${action.count}</span>`;
    const kcalHtml = isFiniteNumber(action.kcal_total)
      ? `<span class="ca-modal__repeat-kcal">${escapeHtml(formatKcalForAll(action.count, action.kcal_total))}</span>`
      : '';
    const subHtml = copy.subtitle
      ? `<span class="ca-modal__item-sub">${escapeHtml(copy.subtitle)}</span>`
      : '';
    const membersHtml = expanded && Array.isArray(action.members)
      ? action.members.map((member) => {
        const targetId = registerTarget(member.entry, member.action);
        return renderActionRowHtml(member.action, targetId, member.entry)
          .replace('<li>', '<li class="ca-modal__repeat-member">');
      }).join('')
      : '';
    return `
      <li class="ca-modal__repeat-group">
        <button class="ca-modal__item ca-modal__item--repeat" type="button" data-ca-expand-repeat="${escapeHtml(key)}">
          ${badge}
          <span class="ca-modal__item-copy"><b class="ca-modal__item-title">${escapeHtml(copy.title)}</b>${subHtml}${kcalHtml}</span>
          ${chevronSvg(true)}
        </button>
        ${membersHtml ? `<ul class="ca-modal__repeat-members">${membersHtml}</ul>` : ''}
      </li>
    `;
  }

  function renderCollapsedGroupHtml(group, expandAttr, expandLabel) {
    const kcal = aggregateDayKcal(group.date, group.entries);
    const kcalHtml = kcal
      ? `<span class="ca-modal__date-kcal" aria-label="${escapeHtml(kcal.spoken)}">${escapeHtml(kcal.text)}</span>`
      : '';
    return `
      <div class="ca-modal__group">
        <div class="ca-modal__date"><span class="ca-modal__date-label">${escapeHtml(ymdLabel(group.date))}</span>${kcalHtml}</div>
        <button class="ca-modal__item" type="button" ${expandAttr}>
          ${renderRowCopyHtml({ title: collapsedDayCopy(group), subtitle: expandLabel })}
          ${chevronSvg(true)}
        </button>
      </div>
    `;
  }

  function renderExpandedGroupHtml(group, registerTarget) {
    const kcal = aggregateDayKcal(group.date, group.entries);
    const kcalHtml = kcal
      ? `<span class="ca-modal__date-kcal" aria-label="${escapeHtml(kcal.spoken)}">${escapeHtml(kcal.text)}</span>`
      : '';
    const rawPairs = group.pairs || [];
    const displayPairs = groupIdenticalMealPairs(rawPairs);
    const itemsHtml = displayPairs.map(({ entry, action }) => {
      const targetId = registerTarget(entry, action);
      if (action.type === 'meal_repeat_group') return renderRepeatGroupHtml(action, registerTarget, entry);
      if (action.type === 'meal_item_removed_group') return renderRemovalGroupHtml(action, registerTarget);
      if (action.type === 'meal_card' && shouldRenderMealCard(action, rawPairs)) {
        return renderMealCardHtml(action, targetId, entry);
      }
      return renderActionRowHtml(action, targetId, entry);
    }).join('');
    if (!itemsHtml) return '';
    return `
      <div class="ca-modal__group">
        <div class="ca-modal__date"><span class="ca-modal__date-label">${escapeHtml(ymdLabel(group.date))}</span>${kcalHtml}</div>
        <ul class="ca-modal__items">${itemsHtml}</ul>
      </div>
    `;
  }

  // Дедуп + агрегация actions за одну дату.
  function dedupAndCollapse(actions) {
    const out = [];
    let weight = null, sleep = null, steps = null, water = null;
    const mealAddedByKey = new Map();
    const mealItemsAddedByKey = new Map();
    const mealRemovedByName = new Map();
    const trainAddedByKey = new Map();
    const trainRemovedByKind = new Set();
    const normsFields = new Set();
    const profileFields = new Set();
    const passthroughActions = [];
    let planningChanged = false;
    let truncatedCount = 0;

    function mealCompositeKey(a) {
      if (a.meal_id) return `id:${a.meal_id}`;
      return `${a.meal_label || a.name || '?'}|${a.time || ''}`;
    }

    function mergeMealItems(target, items) {
      const arr = Array.isArray(items) ? items : [];
      for (const it of arr) {
        if (!it) continue;
        const k = it.item_id ? `item:${it.item_id}`
          : (it.product_id ? `product:${it.product_id}` : `${it.name || '?'}|${it.grams != null ? it.grams : '?'}`);
        if (!target.has(k)) target.set(k, it);
      }
    }

    for (const a of (actions || [])) {
      if (!a || typeof a !== 'object') continue;
      switch (a.type) {
        case 'weight_set':      weight = a; break;
        case 'sleep_set':       sleep = a; break;
        case 'steps_set':       steps = a; break;
        case 'water_set':       water = a; break;
        case 'meal_added': {
          const key = mealCompositeKey(a);
          if (!mealAddedByKey.has(key)) {
            mealAddedByKey.set(key, {
              meal_id: a.meal_id || null,
              meal_label: a.meal_label || a.name || 'Приём пищи',
              time: a.time || null,
              kcal: a.kcal || null,
              items: new Map(),
            });
          }
          const obj = mealAddedByKey.get(key);
          if (a.kcal != null && (obj.kcal == null || a.kcal > obj.kcal)) obj.kcal = a.kcal;
          if (a.time && !obj.time) obj.time = a.time;
          mergeMealItems(obj.items, a.items);
          break;
        }
        case 'meal_item_added': {
          const key = mealCompositeKey(a);
          if (mealAddedByKey.has(key)) {
            mergeMealItems(mealAddedByKey.get(key).items, a.items);
          } else {
            if (!mealItemsAddedByKey.has(key)) {
              mealItemsAddedByKey.set(key, {
                meal_id: a.meal_id || null,
                meal_label: a.meal_label || a.meal_name || 'Приём',
                time: a.time || null,
                items: new Map(),
                count: 0,
              });
            }
            mealItemsAddedByKey.get(key).count += a.count || (Array.isArray(a.items) ? a.items.length : 1);
            mergeMealItems(mealItemsAddedByKey.get(key).items, a.items);
          }
          break;
        }
        case 'meal_item_changed':
        case 'meal_item_removed':
          passthroughActions.push(a);
          break;
        case 'meal_removed': {
          const label = a.meal_label || a.name || '?';
          mealRemovedByName.set(label, { ...a, name: label, meal_label: label });
          break;
        }
        case 'training_added': {
          const k = `${a.training_index ?? ''}|${a.kind || ''}|${a.duration_min || ''}|${a.time || ''}`;
          if (!trainAddedByKey.has(k)) trainAddedByKey.set(k, a);
          break;
        }
        case 'training_removed': trainRemovedByKind.add(a.kind || '?'); break;
        case 'norms_changed':   (a.fields || []).forEach(f => normsFields.add(f)); break;
        case 'profile_changed': (a.fields || []).forEach(f => profileFields.add(f)); break;
        case 'planning_changed': planningChanged = true; break;
        case 'truncated':       truncatedCount += (a.count || 0); break;
        default:                passthroughActions.push(a); break;
      }
    }

    for (const [key, obj] of mealItemsAddedByKey) {
      if (mealAddedByKey.has(key)) {
        mergeMealItems(mealAddedByKey.get(key).items, Array.from(obj.items.values()));
        mealItemsAddedByKey.delete(key);
      }
    }

    for (const obj of mealAddedByKey.values()) {
      out.push({
        type: 'meal_card',
        kind: 'added',
        meal_id: obj.meal_id,
        meal_label: obj.meal_label,
        time: obj.time,
        kcal: obj.kcal,
        items: Array.from(obj.items.values()),
      });
    }
    for (const obj of mealItemsAddedByKey.values()) {
      out.push({
        type: 'meal_card',
        kind: 'items_added',
        meal_id: obj.meal_id,
        meal_label: obj.meal_label,
        time: obj.time,
        items: Array.from(obj.items.values()),
        count: obj.count || obj.items.size,
      });
    }
    for (const removed of mealRemovedByName.values()) out.push(removed);
    out.push(...passthroughActions);
    for (const a of trainAddedByKey.values()) out.push(a);
    for (const kind of trainRemovedByKind) out.push({ type: 'training_removed', kind });
    if (weight)  out.push(weight);
    if (sleep)   out.push(sleep);
    if (steps)   out.push(steps);
    if (water)   out.push(water);
    if (normsFields.size > 0)   out.push({ type: 'norms_changed', fields: Array.from(normsFields) });
    if (profileFields.size > 0) out.push({ type: 'profile_changed', fields: Array.from(profileFields) });
    if (planningChanged)        out.push({ type: 'planning_changed' });
    if (truncatedCount > 0)     out.push({ type: 'truncated', count: truncatedCount });
    return out;
  }

  function groupByDate(entries) {
    const groups = new Map();
    for (const e of (entries || [])) {
      const actions = (e && e.actions && Array.isArray(e.actions.actions)) ? e.actions.actions : [];
      const d = (actions.find(a => a && a.date)?.date) || targetDateFromEntry(e) || (e.created_at || '').slice(0, 10);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(e);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }

  function entryHasVisibleActions(entry) {
    const raw = entry && entry.actions && Array.isArray(entry.actions.actions)
      ? entry.actions.actions
      : [];
    return dedupAndCollapse(raw).some(isVisibleAction);
  }

  function splitVisibleEntries(entries) {
    const visible = [];
    const invisible = [];
    for (const entry of (entries || [])) {
      if (entryHasVisibleActions(entry)) visible.push(entry);
      else invisible.push(entry);
    }
    return { visible, invisible };
  }

  function isFiniteNumber(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }

  function formatKcal(n) {
    return Math.round(n).toLocaleString('ru-RU');
  }

  function formatSignedKcal(delta) {
    if (!isFiniteNumber(delta) || delta === 0) return null;
    const sign = delta > 0 ? '+' : '−';
    return `${sign} ${Math.abs(Math.round(delta)).toLocaleString('ru-RU')} ккал`;
  }

  const COUNT_WORDS_RU = {
    1: 'Один', 2: 'Два', 3: 'Три', 4: 'Четыре', 5: 'Пять',
    6: 'Шесть', 7: 'Семь', 8: 'Восемь', 9: 'Девять', 10: 'Десять',
    11: 'Одиннадцать', 12: 'Двенадцать', 13: 'Тринадцать', 14: 'Четырнадцать',
    15: 'Пятнадцать', 16: 'Шестнадцать', 17: 'Семнадцать', 18: 'Восемнадцать',
    19: 'Девятнадцать', 20: 'Двадцать',
  };

  const MEAL_REPEAT_LABEL_FORMS = {
    'Кофе-брейк': ['кофе-брейк', 'кофе-брейка', 'кофе-брейков'],
    'Перекус': ['перекус', 'перекуса', 'перекусов'],
    'Завтрак': ['завтрак', 'завтрака', 'завтраков'],
    'Обед': ['обед', 'обеда', 'обедов'],
    'Ужин': ['ужин', 'ужина', 'ужинов'],
  };

  function countRuWord(n) {
    const count = Number(n);
    return COUNT_WORDS_RU[count] || null;
  }

  function mealItemsFingerprint(items) {
    return (items || [])
      .map((it) => `${String(it?.name || '').trim().toLowerCase()}|${it?.grams ?? ''}`)
      .sort()
      .join(';');
  }

  function mealRepeatSignature(action) {
    if (!action || action.type !== 'meal_card') return '';
    const items = Array.isArray(action.items) ? action.items : [];
    return [
      String(action.meal_label || '').trim().toLowerCase(),
      String(items.length),
      mealItemsFingerprint(items),
    ].join('|');
  }

  function mealLabelPluralGenitive(label, count) {
    const forms = MEAL_REPEAT_LABEL_FORMS[label];
    if (forms) return pluralRu(count, forms[0], forms[1], forms[2]);
    return String(label || 'приём').toLowerCase();
  }

  function repeatGroupTitle(count, mealLabel) {
    const word = countRuWord(count) || String(count);
    return `${word} ${mealLabelPluralGenitive(mealLabel, count)}`;
  }

  function formatMealItemLine(item) {
    if (!item) return '';
    const name = item.name || 'продукт';
    if (item.grams != null) return `${name} · ${trimNum(item.grams)} г`;
    return name;
  }

  function formatKcalForAll(count, kcal) {
    if (!isFiniteNumber(kcal) || kcal === 0) return null;
    const sign = kcal > 0 ? '+' : '−';
    return `${sign} ${formatKcal(Math.abs(kcal))} ккал за все ${count}`;
  }

  function isFoodOnlyAction(action) {
    const type = action && action.type;
    return type === 'meal_card' || type === 'meal_repeat_group' || type === 'meal_item_removed_group'
      || type === 'meal_item_added' || type === 'meal_item_changed'
      || type === 'meal_item_removed' || type === 'meal_removed';
  }

  function isFoodOnlyDayPairs(pairs) {
    return (pairs || []).every((pair) => isFoodOnlyAction(pair.action));
  }

  function mealProductCount(action) {
    const items = Array.isArray(action?.items) ? action.items : [];
    return items.length || action?.count || 0;
  }

  function shouldRenderMealCard(action, dayPairs) {
    if (!action || action.type !== 'meal_card') return false;
    if (mealProductCount(action) <= 1) return false;
    return isFoodOnlyDayPairs(dayPairs);
  }

  function repeatGroupExpandKey(action) {
    const members = Array.isArray(action?.members) ? action.members : [];
    return `repeat:${members.map((m) => actionKey(m.entry, m.action)).sort().join('|')}`;
  }

  function buildRepeatGroupPair(members) {
    const first = members[0];
    const action = first.action;
    const times = members.map((m) => m.action.time).filter(Boolean).sort();
    const kcalTotal = members.reduce((sum, m) => (
      sum + (isFiniteNumber(m.action.kcal) ? m.action.kcal : 0)
    ), 0);
    return {
      entry: first.entry,
      action: {
        type: 'meal_repeat_group',
        meal_label: action.meal_label,
        items: action.items,
        count: members.length,
        time_from: times[0] || action.time || null,
        time_to: times[times.length - 1] || action.time || null,
        kcal_total: kcalTotal > 0 ? kcalTotal : null,
        members: members.slice(),
      },
    };
  }

  function itemRemovalSignature(action) {
    if (!action || action.type !== 'meal_item_removed') return '';
    const meal = String(action.meal_label || action.meal_name || '').trim().toLowerCase();
    const items = Array.isArray(action.items) ? action.items : [];
    if (items.length > 0) return `removed|${meal}|${mealItemsFingerprint(items)}`;
    const itemName = String(
      action.item_name || action.name || action.from_name || action.to_name || ''
    ).trim().toLowerCase();
    return `removed|${meal}|${itemName}`;
  }

  function buildRemovalRepeatPair(members) {
    const action = members[0].action;
    const count = members.length;
    let kcalTotal = 0;
    for (const member of members) {
      const delta = member.action?.kcal_delta;
      if (isFiniteNumber(delta)) kcalTotal += delta;
    }
    const items = Array.isArray(action.items) ? action.items : [];
    return {
      entry: members[0].entry,
      action: {
        type: 'meal_item_removed_group',
        meal_label: action.meal_label || action.meal_name,
        meal_name: action.meal_name || action.meal_label,
        item_name: action.item_name || items[0]?.name || action.name,
        items,
        count,
        kcal_total: kcalTotal !== 0 ? kcalTotal : null,
        members: members.slice(),
      },
    };
  }

  function groupIdenticalRemovalPairs(pairs) {
    const list = pairs || [];
    const bySignature = new Map();
    list.forEach((pair, idx) => {
      if (pair?.action?.type !== 'meal_item_removed') return;
      const sig = itemRemovalSignature(pair.action);
      if (!bySignature.has(sig)) bySignature.set(sig, []);
      bySignature.get(sig).push(idx);
    });

    const skip = new Set();
    const replaceAt = new Map();
    for (const indices of bySignature.values()) {
      if (indices.length < 2) continue;
      const members = indices.map((idx) => list[idx]);
      replaceAt.set(indices[0], buildRemovalRepeatPair(members));
      for (let i = 1; i < indices.length; i++) skip.add(indices[i]);
    }

    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (skip.has(i)) continue;
      out.push(replaceAt.get(i) || list[i]);
    }
    return out;
  }

  function groupIdenticalMealPairs(pairs) {
    const list = pairs || [];
    const bySignature = new Map();
    list.forEach((pair, idx) => {
      if (pair?.action?.type !== 'meal_card') return;
      const sig = mealRepeatSignature(pair.action);
      if (!bySignature.has(sig)) bySignature.set(sig, []);
      bySignature.get(sig).push(idx);
    });

    const skip = new Set();
    const replaceAt = new Map();
    for (const indices of bySignature.values()) {
      if (indices.length < 2) continue;
      const members = indices.map((idx) => list[idx]);
      replaceAt.set(indices[0], buildRepeatGroupPair(members));
      for (let i = 1; i < indices.length; i++) skip.add(indices[i]);
    }

    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (skip.has(i)) continue;
      out.push(replaceAt.get(i) || list[i]);
    }
    return groupIdenticalRemovalPairs(out);
  }

  function renderRemovalGroupHtml(action, registerTarget) {
    const copy = actionRowCopy(action);
    const firstMember = Array.isArray(action.members) ? action.members[0] : null;
    const targetId = firstMember
      ? registerTarget(firstMember.entry, firstMember.action)
      : '';
    const badge = `<span class="ca-modal__repeat-badge" aria-hidden="true">×${action.count}</span>`;
    const kcalHtml = isFiniteNumber(action.kcal_total)
      ? `<span class="ca-modal__repeat-kcal">${escapeHtml(formatKcalForAll(action.count, action.kcal_total))}</span>`
      : '';
    const subHtml = copy.subtitle
      ? `<span class="ca-modal__item-sub">${escapeHtml(copy.subtitle)}</span>`
      : '';
    return `
      <li class="ca-modal__repeat-group">
        <button class="ca-modal__item ca-modal__item--repeat" type="button" data-ca-target-id="${escapeHtml(targetId)}">
          ${badge}
          <span class="ca-modal__item-copy"><b class="ca-modal__item-title">${escapeHtml(copy.title)}</b>${subHtml}${kcalHtml}</span>
          ${chevronSvg(false)}
        </button>
      </li>
    `;
  }

  function dayActionCount(group) {
    return group?.rawPairCount ?? (group?.pairs || []).length;
  }

  function capitalizeFirst(s) {
    const t = String(s || '');
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function changesLabel(n) {
    const count = Math.max(0, Number(n) || 0);
    return `${count} ${pluralRu(count, 'изменение', 'изменения', 'изменений')}`;
  }

  function daysWord(n) {
    return pluralRu(n, 'день', 'дня', 'дней');
  }

  function todayYmd() {
    try {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch (_) {
      return '';
    }
  }

  function shiftYmd(ymd, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!match) return '';
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function dateRangeLabel(dates) {
    const list = (dates || []).slice().sort();
    if (list.length === 0) return '';
    if (list.length === 1) return ymdLabel(list[0]);
    const first = ymdLabel(list[0]);
    const last = ymdLabel(list[list.length - 1]);
    const firstDay = first.replace(/\s+\S+$/, '');
    return `${firstDay} — ${last}`;
  }

  function getCuratorFirstName() {
    try {
      const profile = HEYS.utils && typeof HEYS.utils.lsGet === 'function'
        ? (HEYS.utils.lsGet('heys_profile', {}) || {})
        : {};
      // Те же источники, что welcome (`resolveAssignedCuratorName`), плюс config
      // без флага назначения — у PIN-клиента имя часто только в config/display.
      const fromProfile = String(
        profile.curatorName
        || profile.curator_name
        || profile.curatorFirstName
        || profile.curatorDisplayName
        || ''
      ).trim();
      const fromConfig = String(
        (HEYS.config && (HEYS.config.curatorDisplayName || HEYS.config.curatorName))
        || HEYS.curatorDisplayName
        || ''
      ).trim();
      const raw = fromProfile || fromConfig;
      const first = String(raw).trim().split(/\s+/)[0];
      return first || null;
    } catch (_) {
      return null;
    }
  }

  function sheetTitle() {
    const name = _titleNameOverride || getCuratorFirstName();
    return name ? `Куратор ${name} обновил ваш дневник` : 'Ваш куратор обновил дневник';
  }

  function refreshSheetTitleIfMounted() {
    const el = document.querySelector('.ca-modal__header-title');
    if (el) el.textContent = sheetTitle();
  }

  function actionKey(entry, action) {
    const a = action || {};
    const entryId = (entry && entry.id) || '';
    const meal = a.meal_id || a.meal_label || a.meal_name || a.name || '';
    const item = a.item_id || '';
    const extra = a.training_index != null ? String(a.training_index) : (a.kind || a.time || '');
    return [entryId, a.type || '', meal, item, extra].join(':');
  }

  function readSessionJson(key, fallback) {
    try {
      const raw = snoozeStorage()?.getItem?.(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeSessionJson(key, value) {
    try {
      const store = snoozeStorage();
      if (!store) return;
      if (value == null) store.removeItem(key);
      else store.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function hiddenActionKeySet() {
    if (_hiddenActionKeys === null) {
      const raw = readSessionJson(HIDDEN_ACTIONS_KEY, []);
      _hiddenActionKeys = new Set(Array.isArray(raw) ? raw : []);
    }
    return _hiddenActionKeys;
  }

  function persistHiddenActions() {
    writeSessionJson(HIDDEN_ACTIONS_KEY, Array.from(hiddenActionKeySet()));
  }

  function hideActionLocally(entry, action) {
    hiddenActionKeySet().add(actionKey(entry, action));
    persistHiddenActions();
  }

  function isActionHidden(entry, action) {
    if (entry && entry.id && !(_entries || []).some((e) => e && e.id === entry.id)) return false;
    return hiddenActionKeySet().has(actionKey(entry, action));
  }

  function reviewedByDateMap() {
    if (_reviewedByDate === null) {
      const raw = readSessionJson(REVIEWED_BY_DATE_KEY, {});
      _reviewedByDate = raw && typeof raw === 'object' ? raw : {};
    }
    return _reviewedByDate;
  }

  function persistReviewedByDate() {
    writeSessionJson(REVIEWED_BY_DATE_KEY, reviewedByDateMap());
  }

  function getShowCount() {
    try {
      const n = Number(snoozeStorage()?.getItem?.(SHOW_COUNT_KEY) || 0);
      return Number.isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function incrementShowCount() {
    try {
      snoozeStorage()?.setItem?.(SHOW_COUNT_KEY, String(getShowCount() + 1));
    } catch (_) {}
  }

  function emitCueChange() {
    if (_cuesTimer) return;
    _cuesTimer = setTimeout(() => {
      _cuesTimer = null;
      try {
        window.dispatchEvent(new CustomEvent('heys:curator-review-cues'));
      } catch (_) {}
    }, 0);
  }

  function envelopeKcalForDate(entry, date) {
    const env = entry && entry.actions;
    if (!env || typeof env !== 'object') return { before: null, after: null };
    const byDate = env.day_kcal_by_date && env.day_kcal_by_date[date];
    const before = isFiniteNumber(byDate?.before) ? byDate.before
      : isFiniteNumber(env.day_kcal_before) ? env.day_kcal_before : null;
    const after = isFiniteNumber(byDate?.after) ? byDate.after
      : isFiniteNumber(env.day_kcal_after) ? env.day_kcal_after : null;
    return { before, after };
  }

  function aggregateDayKcal(date, entries) {
    const list = (entries || [])
      .slice()
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    let firstBefore = null;
    let lastAfter = null;
    for (const entry of list) {
      const pair = envelopeKcalForDate(entry, date);
      if (firstBefore == null && isFiniteNumber(pair.before)) firstBefore = pair.before;
      if (isFiniteNumber(pair.after)) lastAfter = pair.after;
    }
    if (!isFiniteNumber(firstBefore) || !isFiniteNumber(lastAfter)) return null;
    // Строка «доступность»: глазами стрелка читается, диктором — нет.
    // Возвращаем и знак для экрана, и фразу для озвучивания.
    return {
      text: `${formatKcal(firstBefore)} → ${formatKcal(lastAfter)} ккал`,
      spoken: `было ${formatKcal(firstBefore)}, стало ${formatKcal(lastAfter)} килокалорий`,
    };
  }

  function visibleCollapsedActions(entry) {
    const raw = entry && entry.actions && Array.isArray(entry.actions.actions)
      ? entry.actions.actions
      : [];
    return dedupAndCollapse(raw).filter((action) => {
      if (!isVisibleAction(action)) return false;
      return !isActionHidden(entry, action);
    });
  }

  function findEntryForCollapsedAction(rawPairs, action) {
    const found = (rawPairs || []).find((x) => {
      if (!x || !x.action) return false;
      if (action.type === 'meal_card') {
        return (x.action.type === 'meal_added' || x.action.type === 'meal_item_added')
          && (!action.meal_id || x.action.meal_id === action.meal_id);
      }
      if (action.type === 'meal_repeat_group') {
        return x.action.type === 'meal_added'
          && action.members?.some((member) => member.action === x.action
            || (member.action?.meal_id && member.action.meal_id === x.action.meal_id));
      }
      if (action.type === 'meal_item_removed_group') {
        return action.members?.some((member) => member.entry === x.entry && member.action === x.action);
      }
      return x.action.type === action.type
        && (!action.meal_id || x.action.meal_id === action.meal_id)
        && (!action.item_id || x.action.item_id === action.item_id);
    });
    return (found && found.entry) || (rawPairs[0] && rawPairs[0].entry);
  }

  function groupVisibleByDate(entries) {
    const buckets = new Map();
    for (const entry of (entries || [])) {
      const raw = entry && entry.actions && Array.isArray(entry.actions.actions)
        ? entry.actions.actions
        : [];
      for (const action of raw) {
        if (!action) continue;
        const date = targetDateForAction(entry, action)
          || targetDateFromEntry(entry)
          || (entry.created_at || '').slice(0, 10);
        if (!buckets.has(date)) buckets.set(date, { date, entries: [], raw: [] });
        const bucket = buckets.get(date);
        if (!bucket.entries.includes(entry)) bucket.entries.push(entry);
        bucket.raw.push({ entry, action });
      }
    }
    return Array.from(buckets.values()).map((bucket) => {
      const collapsed = dedupAndCollapse(bucket.raw.map((x) => x.action));
      const pairs = collapsed
        .filter(isVisibleAction)
        .map((action) => {
          const entry = findEntryForCollapsedAction(bucket.raw, action);
          return { entry, action };
        })
        .filter((pair) => pair.entry && !isActionHidden(pair.entry, pair.action));
      return { date: bucket.date, entries: bucket.entries, pairs, rawPairCount: bucket.raw.filter(({ entry, action }) => action && !isActionHidden(entry, action)).length };
    }).filter((group) => group.pairs.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function isMealAction(action) {
    const type = action && action.type;
    return type === 'meal_card' || type === 'meal_repeat_group' || type === 'meal_item_removed_group'
      || type === 'meal_added' || type === 'meal_item_added' || type === 'meal_item_changed'
      || type === 'meal_item_removed' || type === 'meal_removed';
  }

  function sheetSubtitle(groups) {
    const dates = (groups || []).map((g) => g.date);
    const actionCount = (groups || []).reduce((sum, g) => sum + dayActionCount(g), 0);
    if (actionCount === 0) return '';
    const mealTouched = (groups || []).some((g) => (g.pairs || []).some((p) => isMealAction(p.action)));
    if (dates.length > 1) {
      if (dates.length >= 6) return `Пока вас не было — правки за ${dates.length} ${daysWord(dates.length)}`;
      if (dates.length === 2) return 'Изменения за два дня';
      return `Изменения за ${dates.length} ${daysWord(dates.length)}`;
    }
    if (!mealTouched) return 'Еду не трогали — правки по весу и активности';
    if (actionCount > 3) {
      const date = dates[0];
      const today = todayYmd();
      const rel = date === today ? 'сегодня' : date === shiftYmd(today, -1) ? 'вчера' : ymdLabel(date);
      return `${capitalizeFirst(changesLabel(actionCount))} за ${rel}`;
    }
    return 'Проверьте, что изменилось по вашим данным';
  }

  function collapsedDayCopy(group) {
    const n = dayActionCount(group);
    const meal = (group.pairs || []).some((p) => isMealAction(p.action));
    const steps = (group.pairs || []).some((p) => p.action && p.action.type === 'steps_set');
    if (meal && steps) return `${capitalizeFirst(changesLabel(n))} по еде и шагам`;
    if (meal) return `${capitalizeFirst(changesLabel(n))} по еде`;
    return capitalizeFirst(changesLabel(n));
  }

  function planDateLayout(groups) {
    const list = groups || [];
    if (list.length <= 1) return { head: list, collapsed: [], tail: [] };
    const head = list.slice(0, 1);
    const rest = list.slice(1);
    if (rest.length <= COLLAPSED_DAY_CAP) return { head, collapsed: rest, tail: [] };
    return { head, collapsed: rest.slice(0, COLLAPSED_DAY_CAP), tail: rest.slice(COLLAPSED_DAY_CAP) };
  }

  function fieldLabelRu(field) {
    const map = { kcal: 'Калории', calories: 'Калории', prot: 'белок', protein: 'белок', fat: 'жиры', carbs: 'углеводы' };
    return map[field] || field;
  }

  function actionRowCopy(a) {
    if (!a || typeof a !== 'object') return { title: 'Обновлены данные', subtitle: '' };
    switch (a.type) {
      case 'meal_card': {
        const parts = [a.meal_label || 'Приём пищи'];
        if (a.time) parts.push(`в ${a.time}`);
        let title = parts.join(' ');
        if (a.kcal != null) title += ` · ${formatKcal(a.kcal)} ккал`;
        const items = Array.isArray(a.items) ? a.items : [];
        const count = a.count || items.length;
        const added = a.kind === 'items_added' ? 'Продукты добавлены' : 'Приём добавлен';
        if (count === 1 && items.length === 1) {
          const grams = items[0].grams != null ? `, ${trimNum(items[0].grams)} г` : '';
          return { title, subtitle: `${added} · ${items[0].name || 'продукт'}${grams}` };
        }
        return { title, subtitle: count > 0 ? `${added} · ${count} ${pluralRu(count, 'продукт', 'продукта', 'продуктов')}` : added };
      }
      case 'meal_added':
        return actionRowCopy({ ...a, type: 'meal_card', kind: 'added' });
      case 'meal_repeat_group': {
        const timePart = a.time_from && a.time_to && a.time_from !== a.time_to
          ? `${a.time_from} — ${a.time_to}`
          : (a.time_from ? `в ${a.time_from}` : '');
        let title = repeatGroupTitle(a.count, a.meal_label || 'приём');
        if (timePart) title += `, ${timePart}`;
        const items = Array.isArray(a.items) ? a.items : [];
        const eachLine = items.length === 1 ? formatMealItemLine(items[0]) : '';
        const each = eachLine
          ? `В каждом ${eachLine.charAt(0).toLowerCase()}${eachLine.slice(1)}`
          : (items.length > 0 ? `В каждом: ${items.map(formatMealItemLine).join(', ')}` : '');
        return { title, subtitle: each };
      }
      case 'meal_item_removed_group': {
        const meal = a.meal_name || a.meal_label || 'приём';
        const count = a.count || 1;
        const itemName = a.item_name || a.items?.[0]?.name;
        const title = count === 1
          ? (itemName ? `Из «${meal}» убран ${itemName}` : `Из «${meal}» убран продукт`)
          : `Из «${meal}» убран продукт`;
        const subtitle = count > 1 && itemName ? itemName : '';
        return { title, subtitle };
      }
      case 'meal_removed': {
        const label = String(a.meal_label || a.name || '').trim();
        let title = `Удалён приём: ${label ? label.toLowerCase() : ''}`.trim();
        if (a.time) title += ` в ${a.time}`;
        const subtitleParts = [];
        const kcal = isFiniteNumber(a.kcal) ? a.kcal : (isFiniteNumber(a.kcal_delta) ? Math.abs(a.kcal_delta) : null);
        if (isFiniteNumber(kcal) && kcal > 0) subtitleParts.push(`− ${formatKcal(kcal)} ккал`);
        if (a.reason) subtitleParts.push(a.reason);
        return { title, subtitle: subtitleParts.join(' · ') };
      }
      case 'meal_item_added': {
        const count = a.count || 1;
        return {
          title: `В «${a.meal_name || a.meal_label || 'приём'}» добавлено ${count} ${pluralRu(count, 'продукт', 'продукта', 'продуктов')}`,
          subtitle: formatSignedKcal(a.kcal_delta) || '',
        };
      }
      case 'meal_item_changed': {
        const mealName = a.meal_name || a.meal_label || 'приём';
        const itemName = a.to_name || a.from_name || a.name || 'продукт';
        const grams = (a.from_grams != null && a.to_grams != null)
          ? `: ${trimNum(a.from_grams)} → ${trimNum(a.to_grams)} г`
          : '';
        return { title: `${itemName} в ${mealName}${grams}`, subtitle: formatSignedKcal(a.kcal_delta) || '' };
      }
      case 'meal_item_removed': {
        const count = a.count || 1;
        const meal = a.meal_name || a.meal_label || 'приём';
        return {
          title: count === 1 ? `Из «${meal}» убран продукт` : `Из «${meal}» убраны ${count} ${pluralRu(count, 'продукт', 'продукта', 'продуктов')}`,
          subtitle: formatSignedKcal(a.kcal_delta) || '',
        };
      }
      case 'training_added':
        return {
          title: `Тренировка: ${a.kind || ''}${a.duration_min ? `, ${a.duration_min} минут` : ''}`,
          subtitle: a.time ? `${a.time} · вкладка «Актив»` : 'вкладка «Актив»',
        };
      case 'training_removed':
        return { title: `Удалена тренировка: ${a.kind || ''}`, subtitle: 'вкладка «Актив»' };
      case 'weight_set':
        return { title: a.from != null ? `Вес: ${trimNum(a.from)} → ${trimNum(a.to)} кг` : `Вес: ${trimNum(a.to)} кг`, subtitle: '' };
      case 'sleep_set':
        return { title: `Сон: ${trimNum(a.to)} ч`, subtitle: '' };
      case 'steps_set':
        return { title: `Шаги: ${Number(a.to).toLocaleString('ru-RU')}`, subtitle: '' };
      case 'water_set':
        return { title: `Вода: ${Number(a.to).toLocaleString('ru-RU')} мл`, subtitle: '' };
      case 'norms_changed': {
        const fields = (a.fields || []).map(fieldLabelRu);
        return { title: 'Обновлены нормы', subtitle: fields.length ? capitalizeFirst(fields.join(' и ')) : '' };
      }
      case 'profile_changed':
        return { title: 'Обновлён профиль', subtitle: (a.fields || []).join(', ') };
      case 'planning_changed':
        return { title: 'Обновлён план', subtitle: '' };
      case 'truncated':
        return { title: `…и ещё ${a.count} изменений`, subtitle: '' };
      default:
        return { title: actionText(a) || 'Обновлены данные', subtitle: '' };
    }
  }

  function readCurrentDayForAction(entry, action) {
    const date = targetDateForAction(entry, action);
    if (!date) return null;
    try {
      const getter = HEYS.utils && typeof HEYS.utils.lsGet === 'function'
        ? HEYS.utils.lsGet.bind(HEYS.utils)
        : null;
      return getter ? getter(`heys_dayv2_${date}`, null) : null;
    } catch (_) {
      return null;
    }
  }

  function reconcileMealAction(entry, action) {
    if (!action || !['meal_added', 'meal_item_added', 'meal_item_changed'].includes(action.type)) {
      return action;
    }
    if (!action.meal_id) return action;
    const day = readCurrentDayForAction(entry, action);
    if (!day || !Array.isArray(day.meals)) return action;
    const meal = day.meals.find(candidate => candidate && candidate.id === action.meal_id);
    if (!meal) {
      const deletedAt = Number(day.deletedMealIds?.[action.meal_id]);
      // Absence alone is not proof of deletion: the changelog can arrive a few
      // milliseconds before the freshly merged day reaches local storage.
      return Number.isFinite(deletedAt) && deletedAt > 0 ? null : action;
    }

    const currentItems = Array.isArray(meal.items) ? meal.items : [];
    const deletedItemIds = day.deletedItemIds && typeof day.deletedItemIds === 'object'
      ? day.deletedItemIds
      : {};
    if (action.type === 'meal_item_changed') {
      if (!action.item_id) return action;
      const currentItem = currentItems.find(item => item && item.id === action.item_id);
      if (!currentItem) {
        const deletedAt = Number(deletedItemIds[action.item_id]);
        return Number.isFinite(deletedAt) && deletedAt > 0 ? null : action;
      }
      if (action.to_grams != null && Number(currentItem.grams) !== Number(action.to_grams)) return null;
      if (action.to_name && currentItem.name !== action.to_name) return null;
      return action;
    }

    const sourceItems = Array.isArray(action.items) ? action.items : [];
    const currentItemIds = new Set(currentItems.map(item => item && item.id).filter(Boolean));
    const items = sourceItems.filter(item => {
      if (!item?.item_id || currentItemIds.has(item.item_id)) return true;
      const deletedAt = Number(deletedItemIds[item.item_id]);
      return !(Number.isFinite(deletedAt) && deletedAt > 0);
    });
    if (sourceItems.length > 0 && items.length === 0) return null;
    return {
      ...action,
      items,
      ...(action.type === 'meal_item_added' ? { count: items.length || action.count } : {}),
    };
  }

  function reconcileEntriesWithCurrentDays(entries) {
    return (entries || []).map((entry) => {
      const actions = entry?.actions?.actions;
      if (!Array.isArray(actions)) return entry;
      const currentActions = actions
        .map(action => reconcileMealAction(entry, action))
        .filter(Boolean);
      return {
        ...entry,
        actions: { ...entry.actions, actions: currentActions },
      };
    });
  }

  // ─── Local state: pending ack + snooze ────────────────────────────

  function normalizeAckQueue(queue, nowMs = Date.now()) {
    return (Array.isArray(queue) ? queue : [])
      .filter(item => item && Array.isArray(item.entryIds))
      .filter(item => !item.queuedAt || (nowMs - Number(item.queuedAt)) < ACK_QUEUE_TTL_MS)
      .slice(-MAX_ACK_QUEUE_ITEMS);
  }

  function readPersistedAckQueue(storage, nowMs) {
    try {
      const raw = storage?.getItem?.(ACK_QUEUE_KEY);
      return normalizeAckQueue(raw ? JSON.parse(raw) : [], nowMs);
    } catch (_) {
      return [];
    }
  }

  function getBrowserStorage(name) {
    try { return window[name] || null; } catch (_) { return null; }
  }

  function readAckQueue(nowMs = Date.now()) {
    if (_ackQueueCache === null) {
      const localQueue = readPersistedAckQueue(getBrowserStorage('localStorage'), nowMs);
      const sessionQueue = readPersistedAckQueue(getBrowserStorage('sessionStorage'), nowMs);
      _ackQueueCache = localQueue.length > 0 ? localQueue : sessionQueue;
    }
    _ackQueueCache = normalizeAckQueue(_ackQueueCache, nowMs);
    return _ackQueueCache.slice();
  }

  function writeAckQueue(queue) {
    const next = normalizeAckQueue(queue);
    _ackQueueCache = next;
    const serialized = JSON.stringify(next);

    // Browser-global operational state: HEYS.utils.lsSet scopes heys_* keys
    // to a client and JSON-serializes values, while this queue is read globally.
    try {
      const storage = getBrowserStorage('localStorage');
      if (next.length === 0) storage?.removeItem?.(ACK_QUEUE_KEY);
      else storage?.setItem?.(ACK_QUEUE_KEY, serialized);
    } catch (_) {}
    try {
      const storage = getBrowserStorage('sessionStorage');
      if (next.length === 0) storage?.removeItem?.(ACK_QUEUE_KEY);
      else storage?.setItem?.(ACK_QUEUE_KEY, serialized);
    } catch (_) {}
  }

  function pendingAckIdSet() {
    const set = new Set();
    for (const item of readAckQueue()) {
      for (const id of item.entryIds || []) set.add(id);
    }
    return set;
  }

  function filterEntriesAfterPendingAck(entries) {
    const ids = pendingAckIdSet();
    if (ids.size === 0) return entries;
    return (entries || []).filter(e => !e || !e.id || !ids.has(e.id));
  }

  function enqueueAckForEntries(entries) {
    const ids = entryIds(entries);
    const untilTs = latestEntryTs(entries);
    if (ids.length === 0 && !untilTs) return;
    const queue = readAckQueue();
    const existing = new Set();
    for (const item of queue) {
      for (const id of item.entryIds || []) existing.add(id);
    }
    const freshIds = ids.filter(id => !existing.has(id));
    if (freshIds.length === 0 && ids.length > 0) return;
    queue.push({
      entryIds: freshIds,
      untilTs,
      queuedAt: Date.now(),
    });
    writeAckQueue(queue);
  }

  async function flushPendingAcks() {
    if (!HEYS.YandexAPI?.ackCuratorChangelog) return;
    const queue = readAckQueue();
    if (queue.length === 0) return;
    const remaining = [];
    for (const item of queue) {
      try {
        const payload = item.entryIds && item.entryIds.length > 0
          ? { entryIds: item.entryIds, untilTs: item.untilTs }
          : item.untilTs;
        const res = await HEYS.YandexAPI.ackCuratorChangelog(payload);
        if (!res || res.ok === false) {
          remaining.push(item);
          console.warn('[HEYS.curatorReview] ack queued for retry', { entryCount: item.entryIds?.length || 0 });
          HEYS.LogTrace?.event?.('curator_changes_ack_deferred', {
            source: 'curator_changes', status: 'degraded', pending_count: item.entryIds?.length || 0
          }, 'warn');
        } else {
          console.info('[HEYS.curatorReview] ack succeeded', { entryCount: item.entryIds?.length || 0 });
          HEYS.LogTrace?.event?.('curator_changes_acknowledged', {
            source: 'curator_changes', pending_count: item.entryIds?.length || 0
          });
        }
      } catch (e) {
        remaining.push(item);
        console.warn('[HEYS.curatorReview] ack queued for retry', { entryCount: item.entryIds?.length || 0, error: e?.message || 'unknown' });
      }
    }
    writeAckQueue(remaining);
  }

  function snoozeStorage() {
    try { return window.sessionStorage || null; } catch (_) { return null; }
  }

  function getSnoozedUntilMs() {
    try {
      const store = snoozeStorage();
      const raw = store ? store.getItem(SNOOZE_UNTIL_KEY) : null;
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function markSnoozed() {
    try {
      const store = snoozeStorage();
      if (store) store.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
    } catch (_) {}
  }

  function findTargetElement(target) {
    const selectors = Array.isArray(target && target.selectors) ? target.selectors : [];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function highlightTargetElement(el) {
    if (!el || !el.classList) return;
    try {
      el.classList.remove('ca-scroll-highlight');
      // Force reflow so repeated clicks replay the animation.
      void el.offsetWidth;
      el.classList.add('ca-scroll-highlight');
      setTimeout(() => {
        try { el.classList.remove('ca-scroll-highlight'); } catch (_) {}
      }, 2200);
    } catch (_) {}
  }

  function scrollToTargetWhenReady(target) {
    let attempts = 0;
    const tick = () => {
      const el = findTargetElement(target);
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        highlightTargetElement(el);
        return;
      }
      attempts += 1;
      if (attempts < 24) setTimeout(tick, 150);
    };
    setTimeout(tick, 250);
  }

  function openTargetInDiary(target) {
    const date = target && target.date;
    const tab = (target && target.tab) || 'diary';
    _filterDate = null;
    removeExistingModal();
    try {
      if (date) sessionStorage.setItem('heys_curator_review_target_date', date);
      sessionStorage.setItem('heys_curator_review_target', JSON.stringify(target || {}));
    } catch (_) {}
    try {
      if (date && HEYS.ui && typeof HEYS.ui.setSelectedDate === 'function') {
        HEYS.ui.setSelectedDate(date);
      }
    } catch (_) {}
    try {
      if (HEYS.ui && typeof HEYS.ui.switchTab === 'function') {
        HEYS.ui.switchTab(tab);
      }
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('heys:curator-review-open-day', {
        detail: { ...(target || {}), date, tab, source: 'curator-review-sheet' },
      }));
    } catch (_) {}
    scrollToTargetWhenReady(target || {});
    emitCueChange();
  }

  function readLocalStorageValue(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (_) { return raw; }
    } catch (_) {
      return null;
    }
  }

  function getPinSessionContextKey() {
    try {
      if (HEYS.cloud?.isPinAuthClient?.() === true) {
        const clientId = HEYS.currentClientId || readLocalStorageValue('heys_pin_auth_client') || readLocalStorageValue('heys_client_current') || '';
        const token = HEYS.auth?.getSessionToken?.() || readLocalStorageValue('heys_session_token') || '';
        return `pin:${clientId || 'cookie'}:${token ? String(token).slice(0, 12) : 'cookie'}`;
      }
    } catch (_) {}
    try {
      if (HEYS.YandexAPI?.getCuratorToken?.()) return null;
    } catch (_) {}
    const pinClient = readLocalStorageValue('heys_pin_auth_client');
    const token = HEYS.auth?.getSessionToken?.() || readLocalStorageValue('heys_session_token');
    if (pinClient || token) return `pin:${pinClient || HEYS.currentClientId || 'unknown'}:${token ? String(token).slice(0, 12) : 'cookie'}`;
    return null;
  }

  function resetReviewStateForSession(contextKey) {
    if (_sessionContextKey === contextKey) return;
    _sessionContextKey = contextKey;
    _entries = [];
    _reviewEntries = [];
    _renderedEntries = [];
    _hasMore = false;
    _initialCheckDone = false;
    _filterDate = null;
    _expandedDates = new Set();
    _expandedMeals = new Set();
    _expandedTail = false;
    _hiddenActionKeys = null;
    _reviewedByDate = null;
    clearReviewTimer();
    removeExistingModal();
  }

  // ─── DOM rendering ────────────────────────────────────────────────

  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function removeExistingModal() {
    if (_modalKeydownHandler) {
      try { document.removeEventListener('keydown', _modalKeydownHandler); } catch (_) {}
      _modalKeydownHandler = null;
    }
    if (_modalEl && _modalEl.parentNode) {
      _modalEl.parentNode.removeChild(_modalEl);
    }
    _modalEl = null;
    try {
      document.querySelectorAll('.ca-modal-backdrop').forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    } catch (_) { /* noop */ }
    try {
      document.body.style.overflow = _bodyOverflowBeforeModal || '';
    } catch (_) {}
    if (_previousFocus && typeof _previousFocus.focus === 'function') {
      try { _previousFocus.focus(); } catch (_) {}
    }
    _previousFocus = null;
  }

  function closeIconSvg() {
    return `
      <svg class="ca-modal__close-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" aria-hidden="true" focusable="false">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    `;
  }

  function getFocusableElements(root) {
    if (!root || !root.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
  }

  function modalIconSvg() {
    return `
      <svg class="ca-modal__header-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 3.75h7.2L18.25 7.8V20.25H7V3.75Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M14 4v4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M9.5 11.25h5M9.5 14.25h5M9.5 17.25h3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    `;
  }

  function maybeAckFullyHiddenEntries(entries) {
    const toAck = [];
    for (const entry of (entries || [])) {
      if (!entryHasVisibleActions(entry)) continue;
      if (visibleCollapsedActions(entry).length === 0) toAck.push(entry);
    }
    if (toAck.length === 0) return;
    enqueueAckForEntries(toAck);
    const ids = new Set(entryIds(toAck));
    _entries = _entries.filter((e) => !ids.has(e.id));
    _reviewEntries = _reviewEntries.filter((e) => !ids.has(e.id));
    flushPendingAcks().catch((err) => {
      console.warn('[HEYS.curatorReview] ack retry failed:', err?.message);
    });
  }

  function storeReviewedSnapshots(entries) {
    const map = reviewedByDateMap();
    const groups = groupVisibleByDate(entries);
    for (const group of groups) {
      map[group.date] = {
        actionCount: group.pairs.length,
        entries: group.entries,
      };
    }
    persistReviewedByDate();
  }

  function liveGroupsForDate(date) {
    return groupVisibleByDate(_entries).filter((g) => !date || g.date === date);
  }

  function reviewedGroupsForDate(date) {
    const snap = reviewedByDateMap()[date];
    if (!snap || !Array.isArray(snap.entries)) return [];
    return groupVisibleByDate(snap.entries).filter((g) => g.date === date);
  }

  function getDayCue(date) {
    return cueForDate(date, true);
  }

  function listCueDates() {
    const dates = new Set();
    for (const group of groupVisibleByDate(_entries)) dates.add(group.date);
    return Array.from(dates);
  }

  function cueForDate(date, referAsThisDay) {
    if (!date) return null;
    const live = liveGroupsForDate(date);
    if (live.length === 0) return null;
    const count = live.reduce((sum, g) => sum + dayActionCount(g), 0);
    if (count === 0) return null;
    return {
      date,
      title: referAsThisDay ? 'Куратор обновил этот день' : `Куратор обновил ${ymdLabel(date)}`,
      subtitle: `${capitalizeFirst(changesLabel(count))} · посмотреть`,
      actionCount: count,
    };
  }

  function getVisibleCue(visibleDate) {
    const sameDay = cueForDate(visibleDate, true);
    if (sameDay) return sameDay;
    const others = listCueDates().filter((date) => date && date !== visibleDate).sort().reverse();
    if (others.length === 0) return null;
    return cueForDate(others[0], false);
  }

  function hasUnackedVisible() {
    return groupVisibleByDate(_entries).some((g) => (g.pairs || []).length > 0);
  }

  function shouldShowNutritionDot() {
    return hasUnackedVisible() && getShowCount() >= MAX_AUTO_SHOWS_PER_SESSION;
  }

  function renderModal() {
    const sourceEntries = _filterDate
      ? _reviewEntries.filter((entry) => groupVisibleByDate([entry]).some((g) => g.date === _filterDate))
      : _reviewEntries.slice();
    const unique = [];
    const seen = new Set();
    for (const entry of sourceEntries) {
      if (!entry || !entry.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      unique.push(entry);
    }
    let groups = groupVisibleByDate(unique);
    if (_filterDate) groups = groups.filter((g) => g.date === _filterDate);
    if (groups.length === 0) return false;

    removeExistingModal();
    _renderedEntries = unique;
    const targetRegistry = Object.create(null);
    const pairRegistry = Object.create(null);
    let targetSeq = 0;
    const registerTarget = (entry, action) => {
      const id = 'ca_target_' + (++targetSeq);
      targetRegistry[id] = buildActionTarget(entry, action);
      pairRegistry[id] = { entry, action };
      return id;
    };

    if (_filterDate) _expandedDates.add(_filterDate);
    const layout = _filterDate
      ? { head: groups, collapsed: [], tail: [] }
      : planDateLayout(groups);
    const parts = [];
    for (const group of layout.head) {
      parts.push(renderExpandedGroupHtml(group, registerTarget));
    }
    for (const group of layout.collapsed) {
      if (_expandedDates.has(group.date)) parts.push(renderExpandedGroupHtml(group, registerTarget));
      else parts.push(renderCollapsedGroupHtml(group, `data-ca-expand-date="${escapeHtml(group.date)}"`, 'Развернуть'));
    }
    if (layout.tail.length > 0) {
      if (_expandedTail) {
        for (const group of layout.tail) {
          if (_expandedDates.has(group.date)) parts.push(renderExpandedGroupHtml(group, registerTarget));
          else parts.push(renderCollapsedGroupHtml(group, `data-ca-expand-date="${escapeHtml(group.date)}"`, 'Развернуть'));
        }
      } else {
        const tailCount = layout.tail.reduce((sum, g) => sum + g.pairs.length, 0);
        const tailDates = layout.tail.map((g) => g.date);
        parts.push(`
          <div class="ca-modal__group">
            <div class="ca-modal__date"><span class="ca-modal__date-label">${escapeHtml(dateRangeLabel(tailDates))}</span></div>
            <button class="ca-modal__item" type="button" data-ca-expand-tail="1">
              ${renderRowCopyHtml({
                title: `Ещё ${changesLabel(tailCount)} за ${tailDates.length} ${daysWord(tailDates.length)}`,
                subtitle: 'Развернуть по дням',
              })}
              ${chevronSvg(true)}
            </button>
          </div>
        `);
      }
    }
    const groupsHtml = parts.filter(Boolean).join('');
    if (!groupsHtml) return false;

    const subtitle = sheetSubtitle(groups);
    const backdrop = document.createElement('div');
    backdrop.className = 'ca-modal-backdrop ca-modal-backdrop--visible';
    backdrop.innerHTML = `
      <div class="ca-modal ca-modal--visible" role="dialog" aria-modal="true" aria-labelledby="ca-modal-title" aria-describedby="ca-modal-summary">
        <div class="ca-modal__header">
          <div class="ca-modal__header-icon">${modalIconSvg()}</div>
          <div class="ca-modal__header-copy">
            <div class="ca-modal__header-title" id="ca-modal-title">${escapeHtml(sheetTitle())}</div>
            <div class="ca-modal__header-subtitle" id="ca-modal-summary">${escapeHtml(subtitle)}</div>
          </div>
          <button class="ca-modal__close" type="button" aria-label="Позже">${closeIconSvg()}</button>
        </div>
        <div class="ca-modal__content">${groupsHtml}</div>
        <div class="ca-modal__footer">
          <button class="ca-modal__later-btn" type="button">Позже</button>
          <button class="ca-modal__ack-btn" type="button">Понятно</button>
        </div>
      </div>
    `;

    const modal = backdrop.querySelector('.ca-modal');
    const closeAsLater = () => {
      HEYS.LogTrace?.event?.('curator_changes_dismissed', {
        source: 'curator_changes', status: 'degraded', pending_count: unique.length
      }, 'warn');
      markSnoozed();
      _filterDate = null;
      _titleNameOverride = null;
      removeExistingModal();
      emitCueChange();
      if (getShowCount() < MAX_AUTO_SHOWS_PER_SESSION) scheduleReviewAttempt(SNOOZE_MS);
    };
    const ackShown = () => {
      const shownEntries = _renderedEntries.slice();
      console.info('[HEYS.curatorReview] ack requested', { entryCount: shownEntries.length });
      storeReviewedSnapshots(shownEntries);
      enqueueAckForEntries(shownEntries);
      const ids = new Set(entryIds(shownEntries));
      _entries = _entries.filter((e) => !ids.has(e.id));
      _reviewEntries = _reviewEntries.filter((e) => !ids.has(e.id));
      _renderedEntries = [];
      _filterDate = null;
      _titleNameOverride = null;
      removeExistingModal();
      emitCueChange();
      flushPendingAcks().catch((err) => {
        console.warn('[HEYS.curatorReview] ack retry failed:', err?.message);
      });
    };
    backdrop.querySelector('.ca-modal__close').addEventListener('click', closeAsLater);
    backdrop.querySelector('.ca-modal__later-btn').addEventListener('click', closeAsLater);
    backdrop.querySelector('.ca-modal__ack-btn').addEventListener('click', ackShown);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target !== backdrop) return;
      const MD = window.HEYS?.ModalDismiss;
      if (MD?.dismissFromBackdrop) {
        MD.dismissFromBackdrop(e, closeAsLater);
        return;
      }
      closeAsLater();
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (window.HEYS?.ModalDismiss?.stopEvent) {
          window.HEYS.ModalDismiss.stopEvent(e);
        }
        return;
      }
      const expandMeal = e.target && e.target.closest ? e.target.closest('[data-ca-expand-meal]') : null;
      if (expandMeal) {
        e.preventDefault();
        e.stopPropagation();
        const key = expandMeal.getAttribute('data-ca-expand-meal');
        if (_expandedMeals.has(key)) _expandedMeals.delete(key);
        else _expandedMeals.add(key);
        renderModal();
        return;
      }
      const expandRepeat = e.target && e.target.closest ? e.target.closest('[data-ca-expand-repeat]') : null;
      if (expandRepeat) {
        e.preventDefault();
        e.stopPropagation();
        const key = expandRepeat.getAttribute('data-ca-expand-repeat');
        if (_expandedMeals.has(key)) _expandedMeals.delete(key);
        else _expandedMeals.add(key);
        renderModal();
        return;
      }
      const expandDate = e.target && e.target.closest ? e.target.closest('[data-ca-expand-date]') : null;
      if (expandDate) {
        e.preventDefault();
        _expandedDates.add(expandDate.getAttribute('data-ca-expand-date') || '');
        renderModal();
        return;
      }
      const expandTail = e.target && e.target.closest ? e.target.closest('[data-ca-expand-tail]') : null;
      if (expandTail) {
        e.preventDefault();
        _expandedTail = true;
        renderModal();
        return;
      }
      const row = e.target && e.target.closest ? e.target.closest('[data-ca-target-id]') : null;
      if (!row) return;
      e.preventDefault();
      const id = row.getAttribute('data-ca-target-id') || '';
      const pair = pairRegistry[id];
      if (pair) {
        hideActionLocally(pair.entry, pair.action);
        maybeAckFullyHiddenEntries([pair.entry]);
      }
      const target = targetRegistry[id];
      if (target) openTargetInDiary(target);
    });

    _modalKeydownHandler = (e) => {
      if (!_modalEl) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAsLater();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusableElements(modal);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    _previousFocus = document.activeElement;
    try {
      _bodyOverflowBeforeModal = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    } catch (_) {}
    document.body.appendChild(backdrop);
    HEYS.LogTrace?.event?.('curator_changes_shown', {
      source: 'curator_changes', pending_count: unique.length
    });
    document.addEventListener('keydown', _modalKeydownHandler);
    _modalEl = backdrop;
    const primary = backdrop.querySelector('.ca-modal__ack-btn');
    if (primary && typeof primary.focus === 'function') {
      setTimeout(() => {
        try { primary.focus(); } catch (_) {}
      }, 0);
    }
    return true;
  }

  // ─── Scheduling / priority ───────────────────────────────────────

  function clearReviewTimer() {
    if (_reviewTimer) {
      clearTimeout(_reviewTimer);
      _reviewTimer = null;
    }
  }

  function isElementVisiblyBlocking(el) {
    if (!el || el.closest?.('.ca-modal-backdrop')) return false;
    if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
    try {
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    } catch (_) {}
    return true;
  }

  function hasBlockingOverlay() {
    try {
      if (document.hidden) return true;
      const selectors = [
        '.whats-new-modal',
        '.whats-new-backdrop',
        '.tour-welcome-modal',
        '.aps-barcode-modal',
        '.barcode-modal',
        '.photo-confirm-modal',
        '.planning-modal-overlay',
        '#heys-step-modal-root [data-heys-step-modal="true"]',
        '#heys-morning-activation-modal-root',
        '[role="dialog"]',
      ];
      const nodes = document.querySelectorAll(selectors.join(','));
      return Array.from(nodes).some(isElementVisiblyBlocking);
    } catch (_) {
      return false;
    }
  }

  function scheduleReviewAttempt(delayMs) {
    clearReviewTimer();
    const delay = Math.max(0, Math.min(delayMs || 0, LIVE_ACCUMULATE_MS));
    _reviewTimer = setTimeout(() => {
      _reviewTimer = null;
      attemptOpenReview();
    }, delay);
  }

  function attemptOpenReview(opts = {}) {
    if (_reviewEntries.length === 0 || _modalEl) return;
    const force = opts.force === true;
    const manual = opts.manual === true;
    const snoozedUntil = getSnoozedUntilMs();
    if (!manual && !force && snoozedUntil > Date.now()) {
      scheduleReviewAttempt(snoozedUntil - Date.now());
      return;
    }
    if (!manual && !force && getShowCount() >= MAX_AUTO_SHOWS_PER_SESSION) {
      emitCueChange();
      return;
    }
    if (hasBlockingOverlay()) {
      scheduleReviewAttempt(5000);
      return;
    }
    clearReviewTimer();
    const opened = renderModal();
    if (opened && !manual) incrementShowCount();
    emitCueChange();
  }

  function openFromCue(date) {
    _filterDate = date || null;
    _expandedDates = new Set(date ? [date] : []);
    const opened = renderModal();
    if (!opened) _filterDate = null;
    emitCueChange();
    return opened;
  }

  function openFromTab() {
    _filterDate = null;
    return attemptOpenReview({ manual: true, force: true });
  }

  function collectReplayEntries() {
    const byId = new Map();
    const push = (list) => {
      for (const entry of (list || [])) {
        if (!entry || !entry.id || byId.has(entry.id)) continue;
        byId.set(entry.id, entry);
      }
    };
    push(_reviewEntries);
    push(_entries);
    const reviewed = reviewedByDateMap();
    for (const date of Object.keys(reviewed)) {
      const snap = reviewed[date];
      if (snap && Array.isArray(snap.entries)) push(snap.entries);
    }
    return Array.from(byId.values());
  }

  function buildDiagnosticSampleEntries() {
    const today = todayYmd() || '2026-08-16';
    const yesterday = shiftYmd(today, -1) || today;
    return [
      {
        id: 'diag-curator-review-sample-1',
        created_at: `${today}T09:12:00.000Z`,
        keys: [`heys_dayv2_${today}`],
        actions: {
          actions: [
            {
              type: 'training_added',
              date: today,
              kind: 'Активное хобби',
              duration_min: 45,
              time: '10:40',
            },
            {
              type: 'meal_item_changed',
              date: today,
              meal_id: 'diag-lunch',
              meal_name: 'Обед',
              item_name: 'Гречка',
              kcal_before: 420,
              kcal_after: 380,
            },
          ],
          day_kcal_before: 1860,
          day_kcal_after: 1820,
        },
      },
      {
        id: 'diag-curator-review-sample-2',
        created_at: `${yesterday}T18:40:00.000Z`,
        keys: [`heys_dayv2_${yesterday}`],
        actions: {
          actions: [
            {
              type: 'steps_set',
              date: yesterday,
              steps: 9200,
            },
          ],
        },
      },
    ];
  }

  // HEYS_DEBUG_REPLAY_CURATOR_REVIEW — показать шторку даже после «Понятно».
  // Берёт живые записи и session-снимки; скрытые тапом строки снова видны.
  // Если данных нет — образец для локальной диагностики.
  async function forceShowLastReview(opts = {}) {
    const allowSample = opts.allowSample !== false;
    try {
      sessionStorage.removeItem(SNOOZE_UNTIL_KEY);
    } catch (_) { /* ignore */ }
    removeExistingModal();
    _titleNameOverride = null;
    _filterDate = null;
    _expandedTail = false;
    _expandedDates = new Set();
    _expandedMeals = new Set();
    // Иначе после тапов по строкам / «Понятно» groupVisibleByDate даёт 0 пар.
    _hiddenActionKeys = new Set();
    try {
      sessionStorage.removeItem(HIDDEN_ACTIONS_KEY);
    } catch (_) { /* ignore */ }

    let collected = collectReplayEntries();
    if (collected.length === 0) {
      try {
        await checkAndShow();
      } catch (err) {
        console.warn('[HEYS.curatorReview] forceShowLastReview fetch:', err?.message || err);
      }
      collected = collectReplayEntries();
    }

    let usedSample = false;
    if (collected.length === 0 && allowSample) {
      collected = buildDiagnosticSampleEntries();
      usedSample = true;
      console.info('[HEYS.curatorReview] forceShowLastReview: показываю диагностический образец');
    }
    if (collected.length === 0) {
      console.warn('[HEYS.curatorReview] forceShowLastReview: нет правок для показа');
      return false;
    }

    if (usedSample && !getCuratorFirstName()) _titleNameOverride = 'Антон';
    _entries = collected;
    _reviewEntries = collected;
    const opened = renderModal();
    if (!opened) {
      if (!usedSample && allowSample) {
        _entries = buildDiagnosticSampleEntries();
        _reviewEntries = _entries;
        _hiddenActionKeys = new Set();
        if (!getCuratorFirstName()) _titleNameOverride = 'Антон';
        const sampleOpened = renderModal();
        if (sampleOpened) {
          console.info('[HEYS.curatorReview] forceShowLastReview: снимки пусты после фильтра, образец');
          emitCueChange();
          return true;
        }
      }
      console.warn('[HEYS.curatorReview] forceShowLastReview: группы пусты после фильтра');
      return false;
    }
    emitCueChange();
    return true;
  }

  function computeLiveDelayMs(entries, serverNowMs) {
    let firstMs = null;
    for (const e of (entries || [])) {
      const ms = parseTsMs(e && e.created_at);
      if (ms == null) continue;
      if (firstMs == null || ms < firstMs) firstMs = ms;
    }
    if (firstMs == null) return LIVE_ACCUMULATE_MS;
    return Math.max(0, firstMs + LIVE_ACCUMULATE_MS - serverNowMs);
  }

  function hasImmediateReviewAction(entries) {
    return (entries || []).some((entry) => {
      const actions = entry?.actions?.actions;
      return Array.isArray(actions) && actions.some((action) => action?.type === 'training_added');
    });
  }

  async function autoAckInvisibleEntries(entries) {
    if (!entries || entries.length === 0) return;
    enqueueAckForEntries(entries);
    await flushPendingAcks();
  }

  // ─── Public API & boot ────────────────────────────────────────────

  async function checkAndShow() {
    if (_checkInFlight) return;
    _checkInFlight = true;
    try {
      if (!HEYS.YandexAPI?.getMyCuratorChangelogSince) return;
      const contextKey = getPinSessionContextKey();
      if (!contextKey) {
        resetReviewStateForSession(null);
        return;
      }
      resetReviewStateForSession(contextKey);

      await flushPendingAcks();

      const res = await HEYS.YandexAPI.getMyCuratorChangelogSince();
      refreshSheetTitleIfMounted();
      if (!res || res.ok === false) {
        if (res && res.error && res.error !== 'invalid_session' && res.error !== 'No session token') {
          console.warn('[HEYS.curatorReview] check failed:', res.error);
        }
        return;
      }

      const isInitial = !_initialCheckDone;
      _initialCheckDone = true;
      const serverNowMs = parseTsMs(res.server_now) || Date.now();
      const rawEntries = Array.isArray(res.entries) ? res.entries : [];
      const filtered = filterEntriesAfterPendingAck(rawEntries);
      const reconciled = reconcileEntriesWithCurrentDays(filtered);
      const split = splitVisibleEntries(reconciled);

      if (split.invisible.length > 0) {
        await autoAckInvisibleEntries(split.invisible);
      }
      if (split.visible.length === 0) {
        _entries = [];
        _reviewEntries = [];
        _renderedEntries = [];
        _hasMore = false;
        clearReviewTimer();
        removeExistingModal();
        emitCueChange();
        return;
      }

      _entries = split.visible;
      _reviewEntries = split.visible;
      _hasMore = res.has_more === true;
      maybeAckFullyHiddenEntries(split.visible);
      emitCueChange();

      if (_modalEl) {
        const renderedIds = entryIds(_renderedEntries).sort().join(',');
        const nextIds = entryIds(_reviewEntries).sort().join(',');
        if (renderedIds !== nextIds) renderModal();
        return;
      }

      if (_forceOpenOnce) {
        _forceOpenOnce = false;
        attemptOpenReview({ force: true });
        return;
      }

      if (isInitial) {
        attemptOpenReview();
        return;
      }

      // A curator-added workout is a complete, actionable event and must be
      // shown immediately. Meal edits keep the accumulation window so a series
      // of product changes still arrives as one calm review modal.
      const delay = hasImmediateReviewAction(split.visible)
        ? 0
        : computeLiveDelayMs(split.visible, serverNowMs);
      if (delay <= 0) attemptOpenReview();
      else scheduleReviewAttempt(delay);
    } finally {
      _checkInFlight = false;
    }
  }

  function shouldForceOpenFromUrl() {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get('openCuratorFeed') === '1';
    } catch (_) { return false; }
  }

  function cleanupUrlParam() {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('openCuratorFeed')) {
        u.searchParams.delete('openCuratorFeed');
        window.history.replaceState({}, '', u.toString());
      }
    } catch (_) {}
  }

  function mount() {
    if (_mounted) return;
    _mounted = true;
    if (shouldForceOpenFromUrl()) {
      _forceOpenOnce = true;
      cleanupUrlParam();
    }
    window.addEventListener('heysSyncCompleted', (e) => {
      const isPhaseA = !!(e && e.detail && e.detail.phaseA);
      if (isPhaseA) return;
      setTimeout(checkAndShow, 800);
    });
    window.addEventListener('heys:client-changed', (e) => {
      const source = e?.detail?.source;
      if (source !== 'pin-login' && source !== 'pin-auth' && source !== 'pin-session-restored') return;
      _forceOpenOnce = true;
      setTimeout(checkAndShow, 0);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !getPinSessionContextKey()) return;
      if (getShowCount() >= MAX_AUTO_SHOWS_PER_SESSION) {
        emitCueChange();
        checkAndShow();
        return;
      }
      if (_reviewEntries.length > 0) attemptOpenReview({ force: true });
      _forceOpenOnce = true;
      checkAndShow();
    });
    if (HEYS.cloud && HEYS.cloud._syncLastCompleted) {
      setTimeout(checkAndShow, 800);
    }
  }

  HEYS.CuratorActionsBanner = {
    mount,
    checkAndShow,
    getDayCue,
    getVisibleCue,
    shouldShowNutritionDot,
    openFromCue,
    openFromTab,
    forceShowLastReview,
    _test: {
      summarizeEntries,
      actionText,
      actionRowCopy,
      sheetTitle,
      sheetSubtitle,
      aggregateDayKcal,
      groupVisibleByDate,
      planDateLayout,
      getDayCue,
      getVisibleCue,
      shouldShowNutritionDot,
      buildActionTarget,
      dedupAndCollapse,
      groupIdenticalMealPairs,
      groupIdenticalRemovalPairs,
      shouldRenderMealCard,
      isFoodOnlyDayPairs,
      splitVisibleEntries,
      reconcileEntriesWithCurrentDays,
      computeLiveDelayMs,
      hasImmediateReviewAction,
      targetDateFromEntries,
      filterEntriesAfterPendingAck,
      enqueueAckForEntries,
      flushPendingAcks,
      hideActionLocally,
      collectReplayEntries,
      forceShowLastReview,
      dismissStorageName: 'sessionStorage',
      constants: {
        LIVE_ACCUMULATE_MS,
        SNOOZE_MS,
        ACK_QUEUE_KEY,
        SNOOZE_UNTIL_KEY,
        SHOW_COUNT_KEY,
        HIDDEN_ACTIONS_KEY,
        REVIEWED_BY_DATE_KEY,
        MAX_AUTO_SHOWS_PER_SESSION,
      },
    },
    _verify: VERIFY_MARK,
  };

  HEYS.debug = HEYS.debug || {};
  // HEYS_DEBUG_REPLAY_CURATOR_REVIEW
  HEYS.debug.replayCuratorReview = forceShowLastReview;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  console.info('[HEYS.curatorReview] Module loaded', VERIFY_MARK);
})();
