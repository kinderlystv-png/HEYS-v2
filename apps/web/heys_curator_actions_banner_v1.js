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
  const VERIFY_MARK = '2026-05-18-curator-actions-feed-v1';

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
  function summarizeEntries(entries) {
    let mealsAdded = 0, mealsRemoved = 0, trainAdded = 0, trainRemoved = 0;
    let weight = null, normsTouched = false, profileTouched = false;
    let totalActions = 0;
    for (const e of entries) {
      const acts = (e && e.actions && Array.isArray(e.actions.actions)) ? e.actions.actions : [];
      totalActions += acts.length;
      for (const a of acts) {
        if (!a) continue;
        if (a.type === 'meal_added') mealsAdded++;
        else if (a.type === 'meal_removed') mealsRemoved++;
        else if (a.type === 'training_added') trainAdded++;
        else if (a.type === 'training_removed') trainRemoved++;
        else if (a.type === 'weight_set') weight = a;
        else if (a.type === 'norms_changed') normsTouched = true;
        else if (a.type === 'profile_changed') profileTouched = true;
      }
    }
    const parts = [];
    if (mealsAdded > 0) parts.push(`+${mealsAdded} ${pluralRu(mealsAdded, 'приём пищи', 'приёма пищи', 'приёмов пищи')}`);
    if (mealsRemoved > 0) parts.push(`−${mealsRemoved} ${pluralRu(mealsRemoved, 'приём', 'приёма', 'приёмов')}`);
    if (trainAdded > 0) parts.push(`+${trainAdded} ${pluralRu(trainAdded, 'тренировка', 'тренировки', 'тренировок')}`);
    if (weight) {
      if (weight.from != null) parts.push(`вес ${trimNum(weight.from)}→${trimNum(weight.to)}`);
      else parts.push(`вес ${trimNum(weight.to)}`);
    }
    if (normsTouched) parts.push('нормы');
    if (profileTouched) parts.push('профиль');
    if (parts.length === 0) parts.push(`${totalActions} ${pluralRu(totalActions, 'правка', 'правки', 'правок')}`);
    if (parts.length > 3) {
      return `${entries.length} ${pluralRu(entries.length, 'изменение', 'изменения', 'изменений')} от куратора`;
    }
    return parts.join(', ');
  }

  function actionText(a) {
    if (!a || typeof a !== 'object') return '—';
    switch (a.type) {
      case 'meal_added':       return `Приём пищи: ${a.name || ''}${a.kcal ? ` (${a.kcal} ккал)` : ''}`;
      case 'meal_removed':     return `Удалён приём: ${a.name || ''}`;
      case 'meal_item_added':  return `Добавлено в «${a.meal_name || 'приём'}»: ${a.count || 1} ${pluralRu(a.count || 1, 'продукт', 'продукта', 'продуктов')}`;
      case 'training_added':   return `Тренировка: ${a.kind || ''}${a.duration_min ? ` (${a.duration_min} мин)` : ''}`;
      case 'training_removed': return `Удалена тренировка: ${a.kind || ''}`;
      case 'weight_set':       return a.from != null ? `Вес: ${trimNum(a.from)} → ${trimNum(a.to)}` : `Вес: ${trimNum(a.to)}`;
      case 'sleep_set':        return `Сон: ${trimNum(a.to)} ч`;
      case 'steps_set':        return `Шаги: ${a.to}`;
      case 'water_set':        return `Вода: ${a.to} мл`;
      case 'norms_changed':    return `Обновлены нормы (${(a.fields || []).join(', ')})`;
      case 'profile_changed':  return `Обновлён профиль (${(a.fields || []).join(', ')})`;
      case 'other_changed':    return `Изменения: ${a.key}`;
      case 'truncated':        return `…и ещё ${a.count} изменений`;
      default:                 return `${a.type}`;
    }
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

  function renderBanner() {
    removeExistingBanner();
    if (_entries.length === 0) return;
    if (isDismissed() && !_forceOpenOnce) return;

    const summary = summarizeEntries(_entries);
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
      const allActions = entries.flatMap(e => (e.actions && e.actions.actions) || []);
      const items = allActions.map(a => `<li class="ca-modal__item">${escapeHtml(actionText(a))}</li>`).join('');
      return `
        <div class="ca-modal__group">
          <div class="ca-modal__date">${escapeHtml(ymdLabel(date))}</div>
          <ul class="ca-modal__items">${items}</ul>
        </div>
      `;
    }).join('');

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
    backdrop.querySelector('.ca-modal__ack-btn').addEventListener('click', async () => {
      const btn = backdrop.querySelector('.ca-modal__ack-btn');
      btn.disabled = true;
      btn.textContent = 'Сохраняю…';
      try {
        const latestTs = getLatestEntryTs();
        await HEYS.YandexAPI?.ackCuratorChangelog?.(latestTs);
      } catch (e) {
        console.warn('[HEYS.curatorBanner] ack failed:', e?.message);
      }
      _entries = [];
      removeExistingModal();
      removeExistingBanner();
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
      _entries = Array.isArray(res.entries) ? res.entries : [];
      if (_entries.length === 0) {
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
