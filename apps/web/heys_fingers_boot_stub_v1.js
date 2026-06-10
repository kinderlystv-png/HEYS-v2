// heys_fingers_boot_stub_v1.js — lazy-load шлюз для Fingers модуля (Wave 6 P2).
//
// Идея: вместо eager-загрузки 404 KB бандла при каждом открытии дневника,
// в boot грузится только этот ~5 KB stub. Он:
//   1. Регистрирует public-API stubs (renderPreviewPill, openFullscreen, isReady)
//      которые при первом обращении лениво подтягивают полный бандл и
//      делегируют вызов реальной реализации.
//   2. Проверяет LS на наличие snapshot прерванной сессии — если есть, лениво
//      грузит бандл чтобы показать resume-баннер. Если нет (типичный случай) —
//      бандл вообще не грузится до явного user-action.
//
// Внешние консьюмеры (heys_day_trainings_v1.js:2821, heys_training_step_v1.js:412)
// продолжают использовать `HEYS.Fingers.renderPreviewPill(...)` и
// `HEYS.Fingers.openFullscreen(...)` без изменений — stub прозрачно проксирует.
//
// Bundle URL: 'heys_fingers_bundle_v1.js' (загружается через <script> injection).
// Когда entry внутри бандла перезаписывает stub-функции своими реальными,
// мы сравниваем по reference чтобы безопасно делегировать без рекурсии.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__bootStubRegistered) return; // idempotent
  Fingers.__bootStubRegistered = true;

  const React = global.React;
  const h = React && React.createElement;

  // ─── Lazy-load infrastructure ──────────────────────────────────────────────

  let _loadPromise = null;
  const BUNDLE_FILE = 'heys_fingers_bundle_v1.js';
  const READY_EVENT = 'fingers-bundle-ready';

  // Cache-bust: filename фиксированный (не content-hashed как boot-bundles),
  // поэтому SW + browser-cache могут отдать stale bundle если CACHE_VERSION
  // SW не обновился. APP_VERSION (через HEYS.version) синхронизируется с
  // build-meta.json в prebuild — гарантия что новый build → новый URL → cache miss.
  // Fallback на голое имя если version ещё не установлен (boot ordering).
  function buildBundleUrl() {
    try {
      const v = HEYS && HEYS.version;
      return v ? BUNDLE_FILE + '?v=' + encodeURIComponent(String(v)) : BUNDLE_FILE;
    } catch (_) { return BUNDLE_FILE; }
  }

  function lazyLoad() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise(function (resolve, reject) {
      try {
        const script = document.createElement('script');
        script.src = buildBundleUrl();
        script.async = false;
        script.defer = true;
        script.onload = function () {
          try { global.dispatchEvent(new CustomEvent(READY_EVENT)); } catch (_) { /* noop */ }
          resolve();
        };
        script.onerror = function (e) {
          _loadPromise = null; // allow retry
          console.warn('[Fingers.stub] bundle load failed:', e);
          reject(e);
        };
        document.head.appendChild(script);
      } catch (e) {
        _loadPromise = null;
        reject(e);
      }
    });
    return _loadPromise;
  }
  Fingers.__lazyLoad = lazyLoad;

  // ─── Stub: openFullscreen ──────────────────────────────────────────────────
  // При первом вызове грузим бандл, потом делегируем настоящему openFullscreen
  // который entry-модуль перезапишет поверх этого stub'а.

  const stubOpenFullscreen = function openFullscreen(opts) {
    lazyLoad().then(function () {
      if (Fingers.openFullscreen !== stubOpenFullscreen) {
        Fingers.openFullscreen(opts);
      }
    }).catch(function () {
      try {
        const msg = '🤚 Не удалось загрузить модуль тренировки пальцев.';
        if (HEYS.Toast?.error) HEYS.Toast.error(msg);
        else if (HEYS.Toast?.show) HEYS.Toast.show(msg);
      } catch (_) { /* noop */ }
    });
  };
  Fingers.openFullscreen = stubOpenFullscreen;

  // ─── Stub: close (noop пока bundle не загружен) ────────────────────────────

  Fingers.close = function close() {
    // До загрузки бандла открыть fullscreen нельзя — значит и закрывать нечего.
    // Реальный close() перезапишется entry-модулем после загрузки.
  };

  // ─── Stub: isReady ─────────────────────────────────────────────────────────

  Fingers.isReady = function isReady() {
    // Перезапишется bundle entry на реальную проверку Fullscreen+SessionUI.
    return false;
  };

  // ─── Stub: renderPreviewPill ───────────────────────────────────────────────
  // Возвращает плейсхолдер-React-компонент. При mount триггерит lazy-load и
  // подписывается на ready-event. После загрузки re-rendering через setState
  // и проверка ссылки Fingers.renderPreviewPill — если уже реальная, делегируем.

  let LazyPill = null;
  if (h && React.useState && React.useEffect) {
    LazyPill = function LazyPill(props) {
      const setState = React.useState(0)[1];
      React.useEffect(function () {
        lazyLoad();
        // Race-guard: между render и этим useEffect bundle мог догрузиться
        // (script.onload fires async). В этом окне READY_EVENT уже прозвенел —
        // addEventListener ниже его не поймает. Проверяем ссылку и форс-обновляем.
        if (Fingers.renderPreviewPill !== stubRenderPreviewPill) {
          setState(function (n) { return n + 1; });
          return undefined;
        }
        const onReady = function () { setState(function (n) { return n + 1; }); };
        global.addEventListener(READY_EVENT, onReady);
        return function () { global.removeEventListener(READY_EVENT, onReady); };
      }, []);
      // Если ссылка изменилась — bundle entry перезаписал stub на реальную.
      if (Fingers.renderPreviewPill !== stubRenderPreviewPill) {
        return Fingers.renderPreviewPill(props);
      }
      // Скелетон в стиле обычного pill'а. Дневник продолжает работать,
      // пользователь видит «загрузка» вместо пропавшей строки.
      const T = (props && props.training) || {};
      const fl = T.fingersLog || {};
      const programName = fl.programId
        ? String(fl.programId).replace(/_/g, ' ')
        : 'Тренировка пальцев';
      return h('div', {
        className: 'fingers-fs-pill-skeleton',
        style: {
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', minHeight: 60,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(0,0,0,0.02)',
          opacity: 0.7,
          cursor: 'wait'
        },
        'aria-label': 'Тренировка пальцев — загружается'
      },
        h('span', { style: { fontSize: 28, lineHeight: 1 } }, '🤚'),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontWeight: 600, fontSize: 14 } }, programName),
          h('div', { style: { fontSize: 12, opacity: 0.6 } }, 'Загрузка…')
        )
      );
    };
  }

  const stubRenderPreviewPill = function renderPreviewPill(props) {
    if (!h || !LazyPill) return null;
    return h(LazyPill, props);
  };
  Fingers.renderPreviewPill = stubRenderPreviewPill;

  // ─── Detect-on-boot: проверяем LS на snapshot БЕЗ загрузки бандла ──────────
  // Если snapshot есть — лениво грузим бандл, entry внутри бандла сам подхватит
  // detect-on-boot flow и покажет ConfirmModal. Если snapshot нет — бандл
  // не грузится вообще.

  function hasInterruptedSession() {
    try {
      const ls = global.localStorage;
      if (!ls) return false;
      const cid = (HEYS && HEYS.currentClientId) ? String(HEYS.currentClientId) : '';
      const currentKey = cid
        ? `heys_${cid}_finger_active_session`
        : 'heys_finger_active_session';
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (!key) continue;
        // _getKey() pattern в session_persistence_v1.js:
        //   heys_<cid>_finger_active_session или heys_finger_active_session
        if (key === currentKey) return true;
      }
    } catch (_) { /* noop */ }
    return false;
  }

  function maybeTriggerLazyForResume() {
    if (hasInterruptedSession()) {
      lazyLoad().catch(function () { /* silent */ });
    }
  }

  if (typeof global !== 'undefined' && global.addEventListener) {
    if (global.__heysSyncCompletedFired) {
      maybeTriggerLazyForResume();
    } else {
      global.addEventListener('heysSyncCompleted', maybeTriggerLazyForResume, { once: true });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
