// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

(function () {
  const HEYS = window.HEYS = window.HEYS || {};
  const startEntry = HEYS.AppEntry && HEYS.AppEntry.start;

  if (typeof startEntry === 'function') {
    startEntry();
    return;
  }

  // 🆕 AppEntry отсутствует — критическая ошибка загрузки
  window.__heysLog && window.__heysLog('[CRITICAL] AppEntry missing!');

  // Уведомляем SW о boot failure
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
  }

  // Показываем Recovery UI если React доступен
  const rootEl = document.getElementById('root');
  if (rootEl && window.React && window.ReactDOM) {
    const React = window.React;

    // Используем RecoveryScreen если доступен, иначе минимальный fallback
    const RecoveryScreen = HEYS.AppRootComponent?.RecoveryScreen;

    if (RecoveryScreen) {
      const root = window.ReactDOM.createRoot(rootEl);
      root.render(React.createElement(RecoveryScreen, { React, moduleName: 'AppEntry' }));
    } else {
      // Минимальный inline fallback
      rootEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;text-align:center;padding:20px;background:#f3f4f6">
          <div style="background:white;padding:32px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px">
            <div style="font-size:48px;margin-bottom:16px">⚠️</div>
            <h2 style="margin:0 0 8px;font-size:20px">Ошибка загрузки</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Модуль "AppEntry" недоступен</p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
              <button onclick="location.reload()" style="padding:12px 24px;border-radius:8px;border:none;background:#10b981;color:white;font-weight:500;cursor:pointer">🔄 Обновить</button>
              <button onclick="caches.keys().then(n=>Promise.all(n.map(k=>caches.delete(k)))).then(()=>navigator.serviceWorker?.getRegistrations()).then(r=>r&&Promise.all(r.map(x=>x.unregister()))).then(()=>location.reload())" style="padding:12px 24px;border-radius:8px;border:1px solid #d1d5db;background:white;color:#374151;font-weight:500;cursor:pointer">🗑️ Сбросить кэш</button>
            </div>
          </div>
        </div>
      `;
    }
  } else {
    // React недоступен — самый базовый fallback
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;text-align:center;padding:20px">
        <div>
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2>Ошибка загрузки</h2>
          <p style="color:#6b7280">Попробуйте обновить страницу</p>
          <button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;border-radius:8px;border:none;background:#10b981;color:white;cursor:pointer">🔄 Обновить</button>
        </div>
      </div>
    `;
  }
})();

