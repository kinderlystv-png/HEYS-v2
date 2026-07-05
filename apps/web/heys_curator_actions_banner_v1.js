// heys_curator_actions_banner_v1.js
// Curator-actions review modal for PIN clients.
//
// Flow:
//   1) After full heysSyncCompleted — RPC get_my_curator_changelog_since.
//   2) Initial backlog opens as a centered review modal after app blockers clear.
//   3) Live updates during an active session accumulate for 30 minutes.
//   4) "Ознакомился" acks only entries shown in this modal by entry id.
//   5) "Позже" / close / Esc snoozes for the current session and does not ack.
//   6) ?openCuratorFeed=1 from push opens immediately, except over blocking modals.
//
// Не зависит от React — vanilla DOM. CSS in apps/web/styles/modules/500-pwa-and-offline.css
// (классы ca-modal-backdrop, ca-modal).

(function () {
  'use strict';
  const HEYS = (window.HEYS = window.HEYS || {});

  const ACK_QUEUE_KEY = 'heys_curator_actions_pending_ack_v1';
  const SNOOZE_UNTIL_KEY = 'heys_curator_review_snoozed_until_ts';
  const VERIFY_MARK = '2026-07-05-curator-actions-review-modal-v1';
  const LIVE_ACCUMULATE_MS = 30 * 60 * 1000;
  const SNOOZE_MS = 15 * 60 * 1000;
  const ACK_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_ACK_QUEUE_ITEMS = 20;

  // ─── State ────────────────────────────────────────────────────────

  let _modalEl = null;
  let _entries = [];
  let _reviewEntries = [];
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

  // ─── Utilities ────────────────────────────────────────────────────

  function ymdLabel(iso) {
    try {
      const d = new Date(iso);
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

    if (itemId) target.selectors.push(`[data-item-id="${cssEscape(itemId)}"]`);
    if (firstItemId) target.selectors.push(`[data-item-id="${cssEscape(firstItemId)}"]`);
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
      case 'training_removed':
        target.tab = 'activity';
        target.selectors.push('[data-curator-target="training"]', '.month-trainings-card', '.compact-activity');
        break;
      case 'weight_set':
        target.tab = 'stats';
        target.selectors.push('[data-curator-target="weight"]', '.vio-row.total-kcal');
        break;
      case 'sleep_set':
        target.tab = 'stats';
        target.selectors.push('[data-curator-target="sleep"]', '.sleep-card');
        break;
      case 'profile_changed':
      case 'norms_changed':
        target.tab = 'user';
        break;
      case 'planning_changed':
        target.tab = 'tasks';
        break;
      default:
        target.selectors.push('.meal-card', '#water-card', '.activity-section');
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
    if (a.type === 'meal_card') return true;
    return !!actionText(a);
  }

  function renderShowButtonHtml(targetId) {
    if (!targetId) return '';
    return `<button class="ca-modal__show-btn" type="button" data-ca-target-id="${escapeHtml(targetId)}">Показать</button>`;
  }

  function renderMealCardHtml(a, targetId) {
    const headParts = [];
    headParts.push(a.meal_label || 'Приём пищи');
    if (a.time) headParts.push(`в ${a.time}`);
    let kcalStr = '';
    if (a.kcal != null) kcalStr = ` — ${a.kcal} ккал`;
    const prefix = a.kind === 'items_added' ? '+ ' : '';
    const head = `${prefix}${headParts.join(' ')}${kcalStr}`;
    const itemsArr = Array.isArray(a.items) ? a.items : [];
    const items = itemsArr.map(it => {
      const name = escapeHtml(it.name || '?');
      const grams = (it.grams != null) ? ` <span class="ca-modal__item-grams">${escapeHtml(String(it.grams))} г</span>` : '';
      return `<li class="ca-modal__meal-product">${name}${grams}</li>`;
    }).join('');
    return `
      <li class="ca-modal__meal-card">
        <div class="ca-modal__meal-head">
          <span>${escapeHtml(head)}</span>
          ${renderShowButtonHtml(targetId)}
        </div>
        ${items ? `<ul class="ca-modal__meal-products">${items}</ul>` : ''}
      </li>
    `;
  }

  // Дедуп + агрегация actions за одну дату.
  function dedupAndCollapse(actions) {
    const out = [];
    let weight = null, sleep = null, steps = null, water = null;
    const mealAddedByKey = new Map();
    const mealItemsAddedByKey = new Map();
    const mealRemovedByName = new Set();
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
        case 'meal_removed':    mealRemovedByName.add(a.name || '?'); break;
        case 'training_added': {
          const k = `${a.kind || ''}|${a.duration_min || ''}|${a.time || ''}`;
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
    for (const name of mealRemovedByName) out.push({ type: 'meal_removed', name });
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

  // ─── Local state: pending ack + snooze ────────────────────────────

  function readAckQueue(nowMs = Date.now()) {
    try {
      const raw = localStorage.getItem(ACK_QUEUE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(item => item && Array.isArray(item.entryIds))
        .filter(item => !item.queuedAt || (nowMs - Number(item.queuedAt)) < ACK_QUEUE_TTL_MS)
        .slice(-MAX_ACK_QUEUE_ITEMS);
    } catch (_) {
      return [];
    }
  }

  function writeAckQueue(queue) {
    try {
      const next = (Array.isArray(queue) ? queue : []).slice(-MAX_ACK_QUEUE_ITEMS);
      if (next.length === 0) localStorage.removeItem(ACK_QUEUE_KEY);
      else HEYS.utils?.lsSet?.(ACK_QUEUE_KEY, JSON.stringify(next));
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
        if (!res || res.ok === false) remaining.push(item);
      } catch (_) {
        remaining.push(item);
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
    markSnoozed();
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
        detail: { ...(target || {}), date, tab, source: 'curator-review-modal' },
      }));
    } catch (_) {}
    scrollToTargetWhenReady(target || {});
    scheduleReviewAttempt(SNOOZE_MS);
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
    _hasMore = false;
    _initialCheckDone = false;
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

  function renderModal() {
    removeExistingModal();
    const entries = _reviewEntries.slice();
    const summary = summarizeEntries(entries) || 'Обновлены данные';
    const targetRegistry = Object.create(null);
    let targetSeq = 0;
    const registerTarget = (entry, action) => {
      const id = 'ca_target_' + (++targetSeq);
      targetRegistry[id] = buildActionTarget(entry, action);
      return id;
    };
    const groups = groupByDate(entries);
    const groupsHtml = groups.map(([date, groupEntries]) => {
      const itemsHtml = groupEntries.map((entry) => {
        const raw = (entry.actions && entry.actions.actions) || [];
        const collapsed = dedupAndCollapse(raw);
        return collapsed.map(a => {
          const targetId = registerTarget(entry, a);
          if (a.type === 'meal_card') return renderMealCardHtml(a, targetId);
          const txt = actionText(a);
          return txt ? `<li class="ca-modal__item"><span class="ca-modal__item-text">${escapeHtml(txt)}</span>${renderShowButtonHtml(targetId)}</li>` : '';
        })
        .filter(Boolean)
        .join('');
      }).join('');
      if (!itemsHtml) return '';
      return `
        <div class="ca-modal__group">
          <div class="ca-modal__date">${escapeHtml(ymdLabel(date))}</div>
          <ul class="ca-modal__items">${itemsHtml}</ul>
        </div>
      `;
    }).filter(Boolean).join('');

    const hasMoreHtml = _hasMore
      ? '<div class="ca-modal__more-note">Показаны последние 100 изменений. После ознакомления откроем более ранние.</div>'
      : '';
    const backdrop = document.createElement('div');
    backdrop.className = 'ca-modal-backdrop ca-modal-backdrop--visible';
    backdrop.innerHTML = `
      <div class="ca-modal ca-modal--visible" role="dialog" aria-modal="true" aria-labelledby="ca-modal-title" aria-describedby="ca-modal-summary">
        <div class="ca-modal__header">
          <div class="ca-modal__header-icon">${modalIconSvg()}</div>
          <div class="ca-modal__header-copy">
            <div class="ca-modal__header-title" id="ca-modal-title">Куратор Антон обновил твой дневник</div>
            <div class="ca-modal__header-subtitle">Проверь, что изменилось по твоим данным.</div>
          </div>
          <button class="ca-modal__close" type="button" aria-label="Позже">×</button>
        </div>
        <div class="ca-modal__summary" id="ca-modal-summary">${escapeHtml(summary)}</div>
        <div class="ca-modal__content">
          ${groupsHtml || '<p class="ca-modal__empty">Новых изменений нет</p>'}
          ${hasMoreHtml}
        </div>
        <div class="ca-modal__footer">
          <button class="ca-modal__later-btn" type="button">Позже</button>
          <button class="ca-modal__ack-btn" type="button">Ознакомился</button>
        </div>
      </div>
    `;

    const modal = backdrop.querySelector('.ca-modal');
    const closeAsLater = () => {
      markSnoozed();
      removeExistingModal();
      scheduleReviewAttempt(SNOOZE_MS);
    };
    backdrop.querySelector('.ca-modal__close').addEventListener('click', closeAsLater);
    backdrop.querySelector('.ca-modal__later-btn').addEventListener('click', closeAsLater);
    backdrop.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.ca-modal__show-btn') : null;
      if (!btn) return;
      const target = targetRegistry[btn.getAttribute('data-ca-target-id') || ''];
      if (target) openTargetInDiary(target);
    });
    backdrop.querySelector('.ca-modal__ack-btn').addEventListener('click', () => {
      const shownEntries = _reviewEntries.slice();
      enqueueAckForEntries(shownEntries);
      _entries = _entries.filter(e => !entryIds(shownEntries).includes(e.id));
      _reviewEntries = [];
      removeExistingModal();
      flushPendingAcks().catch((e) => {
        console.warn('[HEYS.curatorReview] ack retry failed:', e?.message);
      });
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAsLater();
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
    document.addEventListener('keydown', _modalKeydownHandler);
    _modalEl = backdrop;
    const primary = backdrop.querySelector('.ca-modal__ack-btn');
    if (primary && typeof primary.focus === 'function') {
      setTimeout(() => {
        try { primary.focus(); } catch (_) {}
      }, 0);
    }
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
    const snoozedUntil = getSnoozedUntilMs();
    if (!force && snoozedUntil > Date.now()) {
      scheduleReviewAttempt(snoozedUntil - Date.now());
      return;
    }
    if (hasBlockingOverlay()) {
      scheduleReviewAttempt(5000);
      return;
    }
    clearReviewTimer();
    renderModal();
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
      const split = splitVisibleEntries(filtered);

      if (split.invisible.length > 0) {
        await autoAckInvisibleEntries(split.invisible);
      }
      if (split.visible.length === 0) {
        if (rawEntries.length === 0) {
          _entries = [];
          _reviewEntries = [];
          _hasMore = false;
          clearReviewTimer();
        }
        return;
      }

      _entries = split.visible;
      _reviewEntries = split.visible;
      _hasMore = res.has_more === true;

      if (_forceOpenOnce) {
        _forceOpenOnce = false;
        attemptOpenReview({ force: true });
        return;
      }

      if (isInitial) {
        attemptOpenReview();
        return;
      }

      const delay = computeLiveDelayMs(split.visible, serverNowMs);
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
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && _reviewEntries.length > 0) attemptOpenReview();
    });
    if (HEYS.cloud && HEYS.cloud._syncLastCompleted) {
      setTimeout(checkAndShow, 800);
    }
  }

  HEYS.CuratorActionsBanner = {
    mount,
    checkAndShow,
    _test: {
      summarizeEntries,
      actionText,
      dedupAndCollapse,
      splitVisibleEntries,
      computeLiveDelayMs,
      targetDateFromEntries,
      filterEntriesAfterPendingAck,
      enqueueAckForEntries,
      flushPendingAcks,
      dismissStorageName: 'sessionStorage',
      constants: {
        LIVE_ACCUMULATE_MS,
        SNOOZE_MS,
        ACK_QUEUE_KEY,
        SNOOZE_UNTIL_KEY,
      },
    },
    _verify: VERIFY_MARK,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  console.info('[HEYS.curatorReview] Module loaded', VERIFY_MARK);
})();
