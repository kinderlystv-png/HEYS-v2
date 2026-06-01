// heys_app_gates_v1.js — ErrorBoundary, DesktopGate, AppLoader, debug panel, badge API

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.Gates = HEYS.Gates || {};

    HEYS.Gates.initReactGates = function initReactGates(React) {
        if (!React) return;

        if (!HEYS.ErrorBoundary) {
            class ErrorBoundary extends React.Component {
                constructor(props) {
                    super(props);
                    this.state = { hasError: false, error: null };
                }
                static getDerivedStateFromError(error) {
                    return { hasError: true, error };
                }
                componentDidCatch(error, info) {
                    console.error('[HEYS] ErrorBoundary caught:', error, info);
                }
                render() {
                    if (this.state.hasError) {
                        return React.createElement('div', {
                            className: 'error-boundary-fallback',
                            style: {
                                padding: '32px 24px',
                                textAlign: 'center',
                                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                borderRadius: '16px',
                                margin: '16px',
                                border: '1px solid #fecaca'
                            }
                        },
                            React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '😔'),
                            React.createElement('h2', { style: { color: '#dc2626', marginBottom: '8px', fontSize: '18px' } }, 'Что-то пошло не так'),
                            React.createElement('p', { style: { color: '#7f1d1d', marginBottom: '16px', fontSize: '14px' } },
                                'Попробуйте обновить страницу'
                            ),
                            React.createElement('button', {
                                onClick: () => window.location.reload(),
                                style: {
                                    background: '#dc2626',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    fontSize: '15px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }
                            }, '🔄 Обновить')
                        );
                    }
                    return this.props.children;
                }
            }
            HEYS.ErrorBoundary = ErrorBoundary;
        }

        if (!HEYS.DesktopGateScreen) {
            function DesktopGateScreen({ onLogout }) {
                const currentUrl = window.location.origin;

                return React.createElement('div', {
                    className: 'desktop-gate',
                    style: {
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px 20px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff',
                        textAlign: 'center'
                    }
                },
                    // Иконка
                    React.createElement('div', {
                        style: { fontSize: 80, marginBottom: 24 }
                    }, '📱'),

                    // Заголовок
                    React.createElement('h1', {
                        style: {
                            fontSize: 28,
                            fontWeight: 700,
                            marginBottom: 12,
                            lineHeight: 1.3
                        }
                    }, 'Откройте на телефоне'),

                    // Подзаголовок
                    React.createElement('p', {
                        style: {
                            fontSize: 16,
                            opacity: 0.9,
                            marginBottom: 32,
                            maxWidth: 320,
                            lineHeight: 1.5
                        }
                    }, 'HEYS оптимизирован для мобильных устройств. Отсканируйте QR-код или откройте ссылку на телефоне.'),

                    // QR-код (через API)
                    React.createElement('div', {
                        style: {
                            background: 'var(--card, #fff)',
                            padding: 16,
                            borderRadius: 16,
                            marginBottom: 24,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                        }
                    },
                        React.createElement('img', {
                            src: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(currentUrl)}`,
                            alt: 'QR Code',
                            style: { display: 'block', width: 180, height: 180 }
                        })
                    ),

                    // Ссылка
                    React.createElement('div', {
                        style: {
                            background: 'rgba(255,255,255,0.15)',
                            padding: '12px 20px',
                            borderRadius: 12,
                            fontSize: 14,
                            fontFamily: 'monospace',
                            marginBottom: 32,
                            wordBreak: 'break-all',
                            maxWidth: 320
                        }
                    }, currentUrl),

                    // Инструкция PWA
                    React.createElement('div', {
                        style: {
                            background: 'rgba(255,255,255,0.1)',
                            padding: '16px 20px',
                            borderRadius: 12,
                            maxWidth: 320,
                            marginBottom: 32
                        }
                    },
                        React.createElement('div', {
                            style: { fontWeight: 600, marginBottom: 8, fontSize: 15 }
                        }, '💡 Совет'),
                        React.createElement('div', {
                            style: { fontSize: 14, opacity: 0.9, lineHeight: 1.5 }
                        }, 'Для лучшего опыта установите приложение: в браузере телефона нажмите "Добавить на экран"')
                    ),

                    // Кнопка выхода
                    onLogout && React.createElement('button', {
                        onClick: onLogout,
                        style: {
                            background: 'rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            color: '#fff',
                            padding: '12px 24px',
                            borderRadius: 12,
                            fontSize: 15,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }
                    }, '← Выйти из аккаунта')
                );
            }
            HEYS.DesktopGateScreen = DesktopGateScreen;
        }

        if (!HEYS.AppLoader) {
            function AppLoader({ message = 'Загрузка...', subtitle = 'Подключение к серверу' }) {
                return React.createElement('div', { className: 'app-loader' },
                    // Лого и сообщение
                    React.createElement('div', { className: 'app-loader-header' },
                        React.createElement('div', { className: 'app-loader-logo' }, '🥗'),
                        React.createElement('div', { className: 'app-loader-title' }, message),
                        React.createElement('div', { className: 'app-loader-subtitle' }, subtitle)
                    ),
                    // Скелетон UI
                    React.createElement('div', { className: 'app-loader-skeleton' },
                        // Header skeleton
                        React.createElement('div', { className: 'skeleton-header' },
                            React.createElement('div', { className: 'skeleton-bar skeleton-bar-xp' }),
                            React.createElement('div', { className: 'skeleton-nav' },
                                React.createElement('div', { className: 'skeleton-circle' }),
                                React.createElement('div', { className: 'skeleton-rect skeleton-client' }),
                                React.createElement('div', { className: 'skeleton-circle' })
                            )
                        ),
                        // Content skeleton - sparkline
                        React.createElement('div', { className: 'skeleton-content' },
                            React.createElement('div', { className: 'skeleton-sparkline' },
                                // Имитация точек графика
                                ...Array.from({ length: 14 }, (_, i) =>
                                    React.createElement('div', {
                                        key: i,
                                        className: 'skeleton-dot',
                                        style: {
                                            height: `${20 + Math.random() * 60}%`,
                                            animationDelay: `${i * 0.05}s`
                                        }
                                    })
                                )
                            ),
                            // Cards skeleton
                            React.createElement('div', { className: 'skeleton-cards' },
                                React.createElement('div', { className: 'skeleton-card' }),
                                React.createElement('div', { className: 'skeleton-card' }),
                                React.createElement('div', { className: 'skeleton-card skeleton-card-wide' })
                            )
                        ),
                        // Bottom nav skeleton
                        React.createElement('div', { className: 'skeleton-tabs' },
                            ...Array.from({ length: 5 }, (_, i) =>
                                React.createElement('div', {
                                    key: i,
                                    className: `skeleton-tab ${i === 1 ? 'skeleton-tab-active' : ''}`
                                })
                            )
                        )
                    ),
                    // Spinner
                    React.createElement('div', { className: 'app-loader-spinner' })
                );
            }
            HEYS.AppLoader = AppLoader;
        }
    };

    // === Mobile Debug Panel ===
    // Тройной тап на заголовок покажет дебаг-панель (для отладки на телефоне)
    function bootstrapGlobals() {
        HEYS.debugPanel = createDebugPanel();
        HEYS.badge = createBadgeApi();
    }
    bootstrapGlobals();

    function createDebugPanel() {
        return {
            _tapCount: 0,
            _tapTimer: null,
            _visible: false,
            _el: null,

            handleTap() {
                this._tapCount++;
                clearTimeout(this._tapTimer);

                if (this._tapCount >= 3) {
                    this._tapCount = 0;
                    this.toggle();
                } else {
                    this._tapTimer = setTimeout(() => { this._tapCount = 0; }, 500);
                }
            },

            toggle() {
                this._visible ? this.hide() : this.show();
            },

            show() {
                if (this._el) this.hide();

                const syncLog = HEYS?.cloud?.getSyncLog?.() || [];
                const pending = HEYS?.cloud?.getPendingCount?.() || 0;
                const status = HEYS?.cloud?.getStatus?.() || 'unknown';
                const cloudClientId = HEYS?.cloud?.getClientId?.() || '';

                // Получаем clientId из разных источников
                const lsClientId = localStorage.getItem('heys_client_current') || '';
                const clientId = cloudClientId || lsClientId || 'none';

                // Данные текущего дня — ищем с clientId prefix
                const today = new Date().toISOString().slice(0, 10);
                let dayData = null;
                let dayKey = '';

                // Пробуем разные варианты ключей
                const possibleKeys = [
                    `heys_${clientId}_dayv2_${today}`,
                    `heys_dayv2_${today}`,
                ];

                // Также ищем по паттерну в localStorage
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.includes(`dayv2_${today}`) && !k.includes('backup')) {
                        possibleKeys.unshift(k);
                        break;
                    }
                }

                for (const key of possibleKeys) {
                    try {
                        const raw = localStorage.getItem(key);
                        if (raw) {
                            dayData = JSON.parse(raw);
                            dayKey = key;
                            break;
                        }
                    } catch (e) {
                        // Скан-цикл: corrupt JSON в одном ключе не должен ломать сканирование.
                        // debug потому что таких ключей может быть много (стартовый scan).
                        console.debug('[gates] dayv2 scan parse failed for', key, ':', e?.message || e);
                    }
                }

                // Считаем все ключи в localStorage
                const allKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('heys_')) allKeys.push(k);
                }

                const html = `
              <div id="heys-debug-panel" style="
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.95); color: #0f0; font-family: monospace;
                font-size: 11px; padding: 16px; overflow: auto; z-index: 99999;
              ">
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                  <b style="color:#fff;font-size:14px;">🔧 HEYS Debug Panel <span style="color:#888;font-size:11px;">v${window.HEYS?.version || '?'}</span></b>
                  <button onclick="HEYS.debugPanel.hide()" style="background:#f00;color:#fff;border:none;padding:4px 12px;border-radius:4px;">✕ Close</button>
                </div>
                
                <div style="background:#111;padding:8px;border-radius:4px;margin-bottom:8px;">
                  <b style="color:#0ff;">📡 Sync Status</b><br>
                  Status: <span style="color:${status === 'online' ? '#0f0' : '#f00'}">${status}</span><br>
                  Pending: ${pending}<br>
                  Cloud Client: ${cloudClientId ? cloudClientId.slice(0, 8) + '...' : '<span style="color:#f00">NOT SET</span>'}<br>
                  LS Client: ${lsClientId ? lsClientId.slice(0, 8) + '...' : '<span style="color:#f00">NOT SET</span>'}<br>
                  Total LS keys: ${allKeys.length}
                </div>
                
                <div style="background:#111;padding:8px;border-radius:4px;margin-bottom:8px;">
                  <b style="color:#0ff;">📅 Today (${today})</b><br>
                  Key: <span style="color:#888;font-size:9px;">${dayKey || 'NOT FOUND'}</span><br>
                  ${dayData ? `
                    Weight: ${dayData.weightMorning || '—'}<br>
                    Meals: ${dayData.meals?.length || 0}<br>
                    Steps: ${dayData.steps || 0}<br>
                    Water: ${dayData.waterMl || 0}ml<br>
                    Updated: ${dayData.updatedAt ? new Date(dayData.updatedAt).toLocaleTimeString() : '—'}
                  ` : '<span style="color:#f00">No data in localStorage!</span>'}
                </div>
                
                <div style="background:#111;padding:8px;border-radius:4px;margin-bottom:8px;">
                  <b style="color:#0ff;">📜 Sync Log (last 10)</b><br>
                  ${syncLog.slice(0, 10).map(e =>
                    `<div style="border-bottom:1px solid #333;padding:2px 0;">
                      ${e.time ? new Date(e.time).toLocaleTimeString() : '?'} | <b>${e.type}</b> | ${JSON.stringify(e.details || {}).slice(0, 50)}
                    </div>`
                ).join('') || '<span style="color:#888">Empty</span>'}
                </div>
                
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button onclick="HEYS.cloud?.forceSync?.();HEYS.debugPanel.refresh();" 
                    style="background:#00f;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    🔄 Force Sync
                  </button>
                  <button onclick="navigator.clipboard?.writeText(JSON.stringify(HEYS.cloud?.getSyncLog?.(),null,2));HEYS.Toast?.success('Скопировано в буфер!');" 
                    style="background:#555;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    📋 Copy Log
                  </button>
                  <button onclick="HEYS.debugPanel.showDayData();" 
                    style="background:#555;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    📅 Show Day JSON
                  </button>
                  <button onclick="HEYS.debugPanel.showAllKeys();" 
                    style="background:#555;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    🗂️ All LS Keys
                  </button>
                </div>
              </div>
            `;

                document.body.insertAdjacentHTML('beforeend', html);
                this._el = document.getElementById('heys-debug-panel');
                this._visible = true;
            },

            hide() {
                if (this._el) {
                    this._el.remove();
                    this._el = null;
                }
                this._visible = false;
            },

            refresh() {
                if (this._visible) {
                    this.hide();
                    setTimeout(() => this.show(), 100);
                }
            },

            showDayData() {
                const today = new Date().toISOString().slice(0, 10);
                // Ищем день с любым clientId
                let dayData = null;
                let dayKey = '';
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.includes(`dayv2_${today}`) && !k.includes('backup')) {
                        dayKey = k;
                        try {
                            dayData = localStorage.getItem(k);
                        } catch (e) {
                            console.warn('[gates] localStorage.getItem failed for', k, ':', e?.message || e);
                        }
                        break;
                    }
                }
                // Debug: показываем JSON в alert (большой объём данных)
                const msg = dayData ? `Key: ${dayKey}\n\n${JSON.stringify(JSON.parse(dayData), null, 2).slice(0, 1500)}` : `No day data found for ${today}`;
                console.log('[DEBUG] Day data:', msg);
                alert(msg);
            },

            showAllKeys() {
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('heys_')) {
                        const size = (localStorage.getItem(k) || '').length;
                        keys.push(`${k} (${size}b)`);
                    }
                }
                // Debug: показываем список ключей в alert (большой объём данных)
                const msg = `HEYS keys (${keys.length}):\n\n${keys.slice(0, 30).join('\n')}${keys.length > 30 ? '\n...' : ''}`;
                console.log('[DEBUG] All keys:', keys);
                alert(msg);
            }
        };
    }

    // === Badge API Module ===
    // Показывает streak на иконке приложения (Android Chrome PWA)
    function createBadgeApi() {
        return {
            update(count) {
                if (!('setAppBadge' in navigator)) return;

                try {
                    if (count > 0) {
                        navigator.setAppBadge(count);
                    } else {
                        navigator.clearAppBadge();
                    }
                } catch (e) {
                    // Silently fail — badge не критичен
                }
            },

            updateFromStreak() {
                const streak = HEYS?.Day?.getStreak?.() || 0;
                this.update(streak);
            },

            clear() {
                if ('clearAppBadge' in navigator) {
                    navigator.clearAppBadge().catch(() => { });
                }
            }
        };
    }
})();
