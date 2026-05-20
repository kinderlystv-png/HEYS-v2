// heys_curator_actions_banner_v1.js
// Top banner + раскрывающаяся модалка со списком curator-actions.
//
// Flow:
//   1) После heysSyncCompleted (full sync, не phaseA) — RPC get_my_curator_changelog_since.
//   2) Если entries.length > 0 → mount top-banner с агрегированной строкой.
//   3) Клик по banner → раскрытие модалки.
//   4) Кнопка "Понял" в модалке → ackCuratorChangelog → banner и модалка скрываются.
//   5) Кнопка ✕ на banner → скрывает banner на текущую сессию (LS флаг) БЕЗ ack.
//   6) ?openCuratorFeed=1 в URL (после клика по push) → форс-открывает модалку даже
//      если last_seen покрывает (юзер явно нажал).
//
// Не зависит от React — vanilla DOM. CSS in apps/web/styles/modules/500-pwa-and-offline.css
// (классы ca-banner, ca-modal-backdrop, ca-modal).

(function () {
  'use strict';
  const HEYS = (window.HEYS = window.HEYS || {});

  const LS_DISMISS_PREFIX = 'heys_curator_banner_dismissed_';
  const LS_LOCAL_ACKED_KEY = 'heys_curator_actions_local_acked_until_ts';
  const VERIFY_MARK = '2026-05-19-curator-actions-feed-v3';

  // ─── State ────────────────────────────────────────────────────────

  let _bannerEl = null;
  let _modalEl = null;
  let _entries = [];
  let _checkInFlight = false;
  let _mounted = false;
  let _forceOpenOnce = false;

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

  // Aggregate actions across all entries into a short banner-summary.
  // Возвращает null если после дедупа+фильтра нет видимых действий.
  function summarizeEntries(entries) {
    const rawByDate = new Map();
    for (const e of entries) {
      const d = (e.created_at || '').slice(0, 10);
      const acts = (e && e.actions && Array.isArray(e.actions.actions)) ? e.actions.actions : [];
      if (!rawByDate.has(d)) rawByDate.set(d, []);
      rawByDate.get(d).push(...acts);
    }
    let mealsAdded = 0, mealsRemoved = 0, trainAdded = 0, trainRemoved = 0;
    let weight = null, normsTouched = false, profileTouched = false, planningTouched = false;
    let visibleTotal = 0;
    for (const acts of rawByDate.values()) {
      const collapsed = dedupAndCollapse(acts);
      for (const a of collapsed) {
        if (!isVisibleAction(a)) continue;
        visibleTotal++;
        if (a.type === 'meal_card' && a.kind === 'added') mealsAdded++;
        else if (a.type === 'meal_card' && a.kind === 'items_added') mealsAdded++;
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
    if (mealsRemoved > 0) parts.push(`−${mealsRemoved} ${pluralRu(mealsRemoved, 'приём', 'приёма', 'приёмов')}`);
    if (trainAdded > 0) parts.push(`+${trainAdded} ${pluralRu(trainAdded, 'тренировка', 'тренировки', 'тренировок')}`);
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
  // renderMealCard как мульти-line карточку).
  function actionText(a) {
    if (!a || typeof a !== 'object') return '—';
    switch (a.type) {
      case 'meal_card':        return null; // спец-рендеринг
      case 'meal_added':       return `Приём пищи: ${a.meal_label || a.name || ''}`; // legacy / fallback
      case 'meal_removed':     return `Удалён приём: ${a.name || ''}`;
      case 'meal_item_added':  return `В «${a.meal_name || a.meal_label || 'приём'}» добавлено ${a.count || 1} ${pluralRu(a.count || 1, 'продукт', 'продукта', 'продуктов')}`;
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
      default:                 return null;
    }
  }

  function isVisibleAction(a) {
    if (!a) return false;
    if (a.type === 'meal_card') return true; // отдельный рендер
    return !!actionText(a);
  }

  function renderMealCardHtml(a) {
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
        <div class="ca-modal__meal-head">${escapeHtml(head)}</div>
        ${items ? `<ul class="ca-modal__meal-products">${items}</ul>` : ''}
      </li>
    `;
  }

  // Дедуп + агрегация actions за одну дату.
  // Meal'ы группируются по `meal_label + time`: последний add побеждает (берём
  // последний time/kcal), items объединяются с дедупом по name+grams.
  // Скаляры (weight/water/sleep/steps) — оставляем последнее установленное значение.
  function dedupAndCollapse(actions) {
    const out = [];
    let weight = null, sleep = null, steps = null, water = null;
    // mealByKey: key = meal_label+time, value = {meal_label, time, items: Map(name|grams → item), kcal_max}
    const mealAddedByKey = new Map();
    const mealItemsAddedByKey = new Map(); // те же ключи — append items с дедупом
    const mealRemovedByName = new Set();
    const trainAddedByKey = new Map();
    const trainRemovedByKind = new Set();
    const normsFields = new Set();
    const profileFields = new Set();
    let planningChanged = false;
    let truncatedCount = 0;

    function mealCompositeKey(a) {
      return `${a.meal_label || a.name || '?'}|${a.time || ''}`;
    }

    function mergeMealItems(target, items) {
      const arr = Array.isArray(items) ? items : [];
      for (const it of arr) {
        if (!it) continue;
        const k = `${it.name || '?'}|${it.grams != null ? it.grams : '?'}`;
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
          const prev = mealAddedByKey.get(key);
          if (!prev) {
            mealAddedByKey.set(key, {
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
          // Если этот meal уже учтён в meal_added — приклеим items туда (один блок).
          if (mealAddedByKey.has(key)) {
            mergeMealItems(mealAddedByKey.get(key).items, a.items);
          } else {
            if (!mealItemsAddedByKey.has(key)) {
              mealItemsAddedByKey.set(key, {
                meal_label: a.meal_label || a.meal_name || 'Приём',
                time: a.time || null,
                items: new Map(),
              });
            }
            mergeMealItems(mealItemsAddedByKey.get(key).items, a.items);
          }
          break;
        }
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
      }
    }

    // Если для одного key пришли и meal_added, и meal_item_added (в любом
    // порядке) — items из items_added сливаем в added-карточку, чтобы не
    // рендерились две одинаковые "Ночной приём в 23:05" подряд.
    for (const [key, obj] of mealItemsAddedByKey) {
      if (mealAddedByKey.has(key)) {
        mergeMealItems(mealAddedByKey.get(key).items, Array.from(obj.items.values()));
        mealItemsAddedByKey.delete(key);
      }
    }

    // Reconstruct.
    for (const obj of mealAddedByKey.values()) {
      out.push({
        type: 'meal_card',
        kind: 'added',
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
        meal_label: obj.meal_label,
        time: obj.time,
        items: Array.from(obj.items.values()),
      });
    }
    for (const name of mealRemovedByName) out.push({ type: 'meal_removed', name });
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
    for (const e of entries) {
      const d = (e.created_at || '').slice(0, 10); // YYYY-MM-DD
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(e);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }

  // ─── DOM rendering ────────────────────────────────────────────────

  function removeExistingBanner() {
    if (_bannerEl && _bannerEl.parentNode) {
      _bannerEl.parentNode.removeChild(_bannerEl);
    }
    _bannerEl = null;
  }

  function removeExistingModal() {
    if (_modalEl && _modalEl.parentNode) {
      _modalEl.parentNode.removeChild(_modalEl);
    }
    _modalEl = null;
  }

  function getLatestEntryTs() {
    if (_entries.length === 0) return null;
    return _entries[0].created_at || null;
  }

  function dismissKey() {
    return LS_DISMISS_PREFIX + (getLatestEntryTs() || 'unknown');
  }

  function isDismissed() {
    try { return localStorage.getItem(dismissKey()) === '1'; } catch (_) { return false; }
  }

  function markDismissed() {
    try { localStorage.setItem(dismissKey(), '1'); } catch (_) {}
  }

  // 🛡️ Local-ack guard (2026-05-19): после клика "Понял" сохраняем latestTs
  // СРАЗУ в LS. Если ack-RPC ещё в полёте или вернул стейл-данные при
  // следующем heysSyncCompleted (race), мы фильтруем entries по этому TS
  // и не показываем banner повторно. После того как сервер реально закоммитит
  // last_seen_at и пришлёт пустой entries — флаг можно сбросить.
  function getLocalAckedTs() {
    try {
      const raw = localStorage.getItem(LS_LOCAL_ACKED_KEY);
      return raw || null;
    } catch (_) { return null; }
  }

  function setLocalAckedTs(ts) {
    if (!ts) return;
    try {
      const current = getLocalAckedTs();
      if (!current || ts > current) {
        localStorage.setItem(LS_LOCAL_ACKED_KEY, ts);
      }
    } catch (_) {}
  }

  function clearLocalAckedTs() {
    try { localStorage.removeItem(LS_LOCAL_ACKED_KEY); } catch (_) {}
  }

  function filterEntriesAfterLocalAck(entries) {
    const localTs = getLocalAckedTs();
    if (!localTs) return entries;
    return entries.filter(e => (e.created_at || '') > localTs);
  }

  function renderBanner() {
    removeExistingBanner();
    if (_entries.length === 0) return;
    if (isDismissed() && !_forceOpenOnce) return;

    const summary = summarizeEntries(_entries);
    if (!summary) {
      // Все видимые actions отфильтрованы (только служебные ключи) — auto-ack
      // чтобы не дёргать пользователя зря на каждом boot.
      autoAckSilent();
      return;
    }
    const el = document.createElement('div');
    el.className = 'ca-banner';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Куратор внёс изменения — нажмите чтобы посмотреть детали');
    el.innerHTML = `
      <div class="ca-banner__icon" aria-hidden="true">📝</div>
      <div class="ca-banner__content">
        <div class="ca-banner__title">Куратор внёс изменения</div>
        <div class="ca-banner__summary"></div>
        <div class="ca-banner__hint">Нажми, чтобы посмотреть подробнее →</div>
      </div>
      <button class="ca-banner__dismiss" type="button" aria-label="Скрыть">✕</button>
    `;
    el.querySelector('.ca-banner__summary').textContent = summary;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.ca-banner__dismiss')) return;
      openModal();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
    });
    el.querySelector('.ca-banner__dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      markDismissed();
      removeExistingBanner();
    });

    document.body.appendChild(el);
    _bannerEl = el;
  }

  function renderModal() {
    removeExistingModal();
    const groups = groupByDate(_entries);
    const groupsHtml = groups.map(([date, entries]) => {
      const raw = entries.flatMap(e => (e.actions && e.actions.actions) || []);
      const collapsed = dedupAndCollapse(raw);
      const itemsHtml = collapsed
        .map(a => {
          if (a.type === 'meal_card') return renderMealCardHtml(a);
          const txt = actionText(a);
          return txt ? `<li class="ca-modal__item">${escapeHtml(txt)}</li>` : '';
        })
        .filter(Boolean)
        .join('');
      if (!itemsHtml) return '';
      return `
        <div class="ca-modal__group">
          <div class="ca-modal__date">${escapeHtml(ymdLabel(date))}</div>
          <ul class="ca-modal__items">${itemsHtml}</ul>
        </div>
      `;
    }).filter(Boolean).join('');

    const backdrop = document.createElement('div');
    backdrop.className = 'ca-modal-backdrop ca-modal-backdrop--visible';
    backdrop.innerHTML = `
      <div class="ca-modal ca-modal--visible" role="dialog" aria-modal="true" aria-labelledby="ca-modal-title">
        <div class="ca-modal__header">
          <div class="ca-modal__header-icon" aria-hidden="true">📝</div>
          <div class="ca-modal__header-title" id="ca-modal-title">Что изменил куратор</div>
          <button class="ca-modal__close" type="button" aria-label="Закрыть">✕</button>
        </div>
        <div class="ca-modal__content">${groupsHtml || '<p style="opacity:0.7">Новых изменений нет</p>'}</div>
        <div class="ca-modal__footer">
          <button class="ca-modal__ack-btn" type="button">Понял, спасибо</button>
        </div>
      </div>
    `;

    backdrop.querySelector('.ca-modal__close').addEventListener('click', () => {
      removeExistingModal();
    });
    backdrop.querySelector('.ca-modal__ack-btn').addEventListener('click', () => {
      const latestTs = getLatestEntryTs();
      // 🛡️ Сначала — local-LS гард, мгновенно блокирует повторный показ
      // даже если RPC заглохнет или вернёт стейл при следующем heysSyncCompleted.
      if (latestTs) setLocalAckedTs(latestTs);
      _entries = [];
      removeExistingModal();
      removeExistingBanner();
      // RPC fire-and-forget — UI не блокируем, сервер обновит last_seen_at в фоне.
      if (latestTs && HEYS.YandexAPI?.ackCuratorChangelog) {
        HEYS.YandexAPI.ackCuratorChangelog(latestTs).then((res) => {
          if (res && res.ok === false) {
            console.warn('[HEYS.curatorBanner] ack rpc returned error:', res.error);
          }
        }).catch((e) => {
          console.warn('[HEYS.curatorBanner] ack rpc failed:', e?.message);
        });
      }
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        removeExistingModal();
      }
    });

    document.body.appendChild(backdrop);
    _modalEl = backdrop;
  }

  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function openModal() {
    if (_entries.length === 0) return;
    renderModal();
  }

  async function autoAckSilent() {
    const latestTs = getLatestEntryTs();
    // Local guard первым делом — даже если RPC упадёт, повторный boot не покажет.
    if (latestTs) setLocalAckedTs(latestTs);
    try {
      if (HEYS.YandexAPI?.ackCuratorChangelog && latestTs) {
        await HEYS.YandexAPI.ackCuratorChangelog(latestTs);
      }
    } catch (_) {}
    _entries = [];
  }

  // ─── Public API & boot ────────────────────────────────────────────

  async function checkAndShow() {
    if (_checkInFlight) return;
    _checkInFlight = true;
    try {
      if (!HEYS.YandexAPI?.getMyCuratorChangelogSince) return;
      const res = await HEYS.YandexAPI.getMyCuratorChangelogSince();
      if (!res || res.ok === false) {
        if (res && res.error && res.error !== 'invalid_session') {
          console.warn('[HEYS.curatorBanner] check failed:', res.error);
        }
        return;
      }
      const rawEntries = Array.isArray(res.entries) ? res.entries : [];
      _entries = filterEntriesAfterLocalAck(rawEntries);

      // Если сервер сам отдал пустой массив (server-side last_seen уже
      // покрывает) — local-LS гард больше не нужен, чистим его.
      if (rawEntries.length === 0) {
        clearLocalAckedTs();
        removeExistingBanner();
        return;
      }
      if (_entries.length === 0) {
        // local-LS гард отсёк всё — banner не показываем, но local флаг
        // оставляем (сервер ещё может присылать стейл).
        removeExistingBanner();
        return;
      }
      renderBanner();
      if (_forceOpenOnce) {
        _forceOpenOnce = false;
        openModal();
      }
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
    // Listen for full sync completion (not phaseA partial).
    window.addEventListener('heysSyncCompleted', (e) => {
      const isPhaseA = !!(e && e.detail && e.detail.phaseA);
      if (isPhaseA) return;
      // Debounce: дать рендеру AppShell завершиться.
      setTimeout(checkAndShow, 800);
    });
    // Если sync уже завершился до mount — попробуем сразу.
    if (HEYS.cloud && HEYS.cloud._syncLastCompleted) {
      setTimeout(checkAndShow, 800);
    }
  }

  HEYS.CuratorActionsBanner = {
    mount,
    checkAndShow,
    _verify: VERIFY_MARK,
  };

  // Auto-mount после загрузки DOM.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  console.info('[HEYS.curatorBanner] Module loaded', VERIFY_MARK);
})();
