// heys_mobility_boot_stub_v1.js — lazy-load gateway for mobility mode.
//
// Keeps the diary API stable while the full generated bundle is loaded on demand.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__bootStubRegistered) return;
  Mobility.__bootStubRegistered = true;

  const React = global.React;
  const h = React && React.createElement;
  let loadPromise = null;
  const BUNDLE_FILE = 'heys_mobility_bundle_v1.js';
  const READY_EVENT = 'mobility-bundle-ready';

  function buildBundleUrl() {
    try {
      const v = HEYS && HEYS.version;
      return v ? BUNDLE_FILE + '?v=' + encodeURIComponent(String(v)) : BUNDLE_FILE;
    } catch (_) {
      return BUNDLE_FILE;
    }
  }

  function lazyLoad() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      try {
        if (!global.document || !global.document.createElement) throw new Error('document unavailable');
        const script = global.document.createElement('script');
        script.src = buildBundleUrl();
        script.async = false;
        script.defer = true;
        script.onload = function () {
          try { global.dispatchEvent(new CustomEvent(READY_EVENT)); } catch (_) { /* noop */ }
          resolve();
        };
        script.onerror = function (e) {
          loadPromise = null;
          console.warn('[Mobility.stub] bundle load failed:', e);
          reject(e);
        };
        global.document.head.appendChild(script);
      } catch (e) {
        loadPromise = null;
        reject(e);
      }
    });
    return loadPromise;
  }

  Mobility.__lazyLoad = lazyLoad;

  const stubOpenFullscreen = function openFullscreen(opts) {
    lazyLoad().then(function () {
      if (Mobility.openFullscreen !== stubOpenFullscreen) Mobility.openFullscreen(opts);
    }).catch(function () {
      try {
        const msg = 'Не удалось загрузить модуль мобильности.';
        if (HEYS.Toast && typeof HEYS.Toast.error === 'function') HEYS.Toast.error(msg);
        else if (HEYS.Toast && typeof HEYS.Toast.show === 'function') HEYS.Toast.show(msg);
      } catch (_) { /* noop */ }
    });
  };

  Mobility.openFullscreen = stubOpenFullscreen;
  Mobility.close = function close() {};
  Mobility.isReady = function isReady() { return false; };

  let LazyPill = null;
  if (h && React.useState && React.useEffect) {
    LazyPill = function LazyPill(props) {
      const setState = React.useState(0)[1];
      React.useEffect(function () {
        lazyLoad().catch(function () { /* silent; pill stays as skeleton */ });
        if (Mobility.renderPreviewPill !== stubRenderPreviewPill) {
          setState(function (n) { return n + 1; });
          return undefined;
        }
        const onReady = function () { setState(function (n) { return n + 1; }); };
        global.addEventListener(READY_EVENT, onReady);
        return function () { global.removeEventListener(READY_EVENT, onReady); };
      }, []);
      if (Mobility.renderPreviewPill !== stubRenderPreviewPill) return Mobility.renderPreviewPill(props);
      const T = (props && props.training) || {};
      const log = T.mobilityLog || {};
      return h('div', {
        className: 'mobility-pill-skeleton',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          minHeight: 60,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(0,0,0,0.02)',
          opacity: 0.75,
          cursor: 'wait'
        },
        'aria-label': 'Мобильность загружается'
      },
        h('span', { style: { fontWeight: 700, width: 28, textAlign: 'center' } }, 'M'),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontWeight: 600, fontSize: 14 } }, log.mode || log.modeId || 'Мобильность'),
          h('div', { style: { fontSize: 12, opacity: 0.6 } }, 'Загрузка')
        )
      );
    };
  }

  const stubRenderPreviewPill = function renderPreviewPill(props) {
    if (!h || !LazyPill) return null;
    return h(LazyPill, props);
  };

  Mobility.renderPreviewPill = stubRenderPreviewPill;
})(typeof window !== 'undefined' ? window : globalThis);
