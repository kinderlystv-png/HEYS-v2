// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

      // Service Worker отключен для dev режима
      // if ('serviceWorker' in navigator) {
      //   window.addEventListener('load', () => {
      //     navigator.serviceWorker.register('/sw.js')
      //       .then((registration) => {
      //         console.log('✅ SW: Registered successfully', registration.scope);
      //       })
      //       .catch((error) => {
      //         console.log('❌ SW: Registration failed', error);
      //       });
      //   });
      // }

      (function () {
        window.HEYS = window.HEYS || {};
        // Wait for React and HEYS components to load
        let reactCheckCount = 0;
        function initializeApp() {
          // Проверяем загрузку React
          if (!window.React || !window.ReactDOM) {
            reactCheckCount++;
            if (reactCheckCount === 1 || reactCheckCount % 10 === 0) {
              console.log('⏳ Waiting for React to load...');
            }
            setTimeout(initializeApp, 100);
            return;
          }

          // Проверяем загрузку критичных HEYS компонентов
          const heysReady =
            window.HEYS &&
            window.HEYS.DayTab &&
            window.HEYS.Ration &&
            window.HEYS.UserTab &&
            window.HEYS.ReportsTab;

          if (!heysReady) {
            reactCheckCount++;
            if (reactCheckCount === 1 || reactCheckCount % 10 === 0) {
              console.log('⏳ Waiting for HEYS components to load...');
            }
            setTimeout(initializeApp, 100);
            return;
          }

          console.log('✅ React and HEYS components loaded, initializing app...');
          const React = window.React,
            ReactDOM = window.ReactDOM;
          const { useState, useEffect } = React;

          // init cloud (safe if no cloud module)
          if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
            HEYS.cloud.init({
              url: 'https://ukqolcziqcuplqfgrmsh.supabase.co',
              anonKey:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTE1NDUsImV4cCI6MjA3MDgyNzU0NX0.Nzd8--PyGMJvIHqFoCQKNUOwpxnrAZuslQHtAjcE1Ds',
            });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 📅 КОМПОНЕНТ: DayTabWithCloudSync (строки 142-181)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_day_v12.js с синхронизацией из облака
           * Props: { clientId, products, selectedDate, setSelectedDate }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.DayTab
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function DayTabWithCloudSync(props) {
            const { clientId, products, selectedDate, setSelectedDate } = props;
            const [loading, setLoading] = React.useState(true);
            React.useEffect(() => {
              let cancelled = false;
              const cloud = window.HEYS && window.HEYS.cloud;
              const finish = () => {
                if (!cancelled) setLoading(false);
              };
              if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                const need =
                  typeof cloud.shouldSyncClient === 'function'
                    ? cloud.shouldSyncClient(clientId, 4000)
                    : true;
                if (need) {
                  setLoading(true);
                  cloud.bootstrapClientSync(clientId).then(finish);
                } else finish();
              } else {
                finish();
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading)
              return React.createElement(
                'div',
                { className: 'muted', style: { padding: 24 } },
                'Загрузка данных клиента...',
              );
            // Проверяем что DayTab загружен
            if (!window.HEYS || !window.HEYS.DayTab) {
              return React.createElement(
                'div',
                { className: 'muted', style: { padding: 24 } },
                '⏳ Загрузка компонента...',
              );
            }
            return React.createElement(window.HEYS.DayTab, { products, selectedDate, setSelectedDate });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🍽️ КОМПОНЕНТ: RationTabWithCloudSync (строки 185-227)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_core_v12.js (Ration) с синхронизацией продуктов
           * Props: { clientId, setProducts, products }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.Ration
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function RationTabWithCloudSync(props) {
            const { clientId, setProducts, products } = props;
            const [loading, setLoading] = React.useState(true);
            React.useEffect(() => {
              let cancelled = false;
              if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.bootstrapClientSync === 'function'
              ) {
                setLoading(true);
                window.HEYS.cloud.bootstrapClientSync(clientId).then(() => {
                  if (!cancelled) {
                    const loadedProducts = Array.isArray(
                      window.HEYS.utils.lsGet('heys_products', []),
                    )
                      ? window.HEYS.utils.lsGet('heys_products', [])
                      : [];
                    setProducts(loadedProducts);
                    setLoading(false);
                  }
                });
              } else {
                setLoading(false);
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading)
              return React.createElement(
                'div',
                { className: 'muted', style: { padding: 24 } },
                'Загрузка продуктов клиента...',
              );
            // Проверяем что Ration загружен
            if (!window.HEYS || !window.HEYS.Ration) {
              return React.createElement(
                'div',
                { className: 'muted', style: { padding: 24 } },
                '⏳ Загрузка компонента...',
              );
            }
            return React.createElement(window.HEYS.Ration, { products, setProducts });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 👤 КОМПОНЕНТ: UserTabWithCloudSync (строки 230-266)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_user_v12.js с синхронизацией профиля и зон
           * Props: { clientId }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.UserTab
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function UserTabWithCloudSync(props) {
            const { clientId } = props;
            const [loading, setLoading] = React.useState(true);
            React.useEffect(() => {
              let cancelled = false;
              if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.bootstrapClientSync === 'function'
              ) {
                setLoading(true);
                window.HEYS.cloud.bootstrapClientSync(clientId).then(() => {
                  if (!cancelled) setLoading(false);
                });
              } else {
                setLoading(false);
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading)
              return React.createElement(
                'div',
                { className: 'muted', style: { padding: 24 } },
                'Загрузка профиля клиента...',
              );
            // Проверяем что UserTab загружен
            if (!window.HEYS || !window.HEYS.UserTab) {
              return React.createElement(
                'div',
                { className: 'muted', style: { padding: 24 } },
                '⏳ Загрузка компонента...',
              );
            }
            return React.createElement(window.HEYS.UserTab, {});
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 📊 КОМПОНЕНТ: AnalyticsTab (строки 269-450)
           * ───────────────────────────────────────────────────────────────────────────────
           * Вкладка аналитики производительности (heys_simple_analytics.js)
           * Props: none
           * Dependencies: window.HEYS.analytics, window.HEYS.analyticsUI
           * Features: Auto-refresh каждые 30 сек, экспорт данных, очистка истории
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function AnalyticsTab() {
            const [stats, setStats] = useState(null);
            const [autoRefresh, setAutoRefresh] = useState(true);

            const loadStats = () => {
              if (window.HEYS && window.HEYS.analytics) {
                const data = window.HEYS.analytics.getStats();
                setStats(data);
              }
            };

            useEffect(() => {
              loadStats();
              if (autoRefresh) {
                const interval = setInterval(loadStats, 5000); // Обновление каждые 5 сек
                return () => clearInterval(interval);
              }
            }, [autoRefresh]);

            if (!stats) {
              return React.createElement(
                'div',
                { style: { padding: 24 } },
                'Загрузка статистики...',
              );
            }

            return React.createElement(
              'div',
              { style: { padding: 24, maxWidth: 900 } },
              // Заголовок
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                  },
                },
                React.createElement('h2', { style: { margin: 0 } }, '📊 Аналитика сессии'),
                React.createElement(
                  'div',
                  { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                  React.createElement(
                    'label',
                    null,
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: autoRefresh,
                      onChange: (e) => setAutoRefresh(e.target.checked),
                      style: { marginRight: 4 },
                    }),
                    'Автообновление',
                  ),
                  React.createElement(
                    'button',
                    { className: 'btn', onClick: loadStats },
                    '🔄 Обновить',
                  ),
                ),
              ),

              // Время сессии
              React.createElement(
                'div',
                {
                  style: { marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 },
                },
                React.createElement(
                  'div',
                  { style: { fontSize: 14, color: '#666', marginBottom: 4 } },
                  'Время сессии',
                ),
                React.createElement(
                  'div',
                  { style: { fontSize: 24, fontWeight: 600 } },
                  stats.session.duration,
                ),
              ),

              // Поисковые запросы
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🔍 Поисковые запросы'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.total,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Медленных (>1s)',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.slow,
                    ),
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        padding: 16,
                        background: stats.searches.slowRate === '0%' ? '#e8f5e9' : '#ffebee',
                        borderRadius: 8,
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Slow Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.slowRate,
                    ),
                  ),
                ),
              ),

              // API вызовы
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🌐 API вызовы'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.total,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Медленных (>2s)',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.slow,
                    ),
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        padding: 16,
                        background: stats.apiCalls.failed > 0 ? '#ffebee' : '#e8f5e9',
                        borderRadius: 8,
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Ошибок',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.failed,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#f3e5f5', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Slow Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.slowRate,
                    ),
                  ),
                ),
              ),

              // Cache эффективность
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '💾 Cache эффективность'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e8f5e9', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Hits'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.hits,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#ffebee', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Misses',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.misses,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e1f5fe', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Hit Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.hitRate,
                    ),
                  ),
                ),
              ),

              // Ошибки
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🐛 Ошибки'),
                React.createElement(
                  'div',
                  {
                    style: {
                      padding: 16,
                      background: stats.errors.total > 0 ? '#ffebee' : '#e8f5e9',
                      borderRadius: 8,
                    },
                  },
                  React.createElement(
                    'div',
                    { style: { fontSize: 12, color: '#666' } },
                    'Всего ошибок в сессии',
                  ),
                  React.createElement(
                    'div',
                    { style: { fontSize: 24, fontWeight: 600 } },
                    stats.errors.total,
                  ),
                ),
              ),

              // Кнопка сброса
              React.createElement(
                'div',
                { style: { marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' } },
                React.createElement(
                  'button',
                  {
                    className: 'btn secondary',
                    onClick: () => {
                      if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.reset) {
                        if (confirm('Сбросить всю статистику сессии?')) {
                          window.HEYS.analytics.reset();
                          loadStats();
                        }
                      }
                    },
                  },
                  '🗑️ Сбросить статистику',
                ),
              ),
            );
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🚀 ГЛАВНЫЙ КОМПОНЕНТ: App (строки 482-1140)
           * ───────────────────────────────────────────────────────────────────────────────
           * Корневой компонент приложения с управлением состоянием
           *
           * STATE MANAGEMENT:
           *   - tab: текущая активная вкладка ('day'|'ration'|'reports'|'user'|'analytics')
           *   - products: массив продуктов для текущего клиента
           *   - clients: список клиентов куратора
           *   - clientId: ID выбранного клиента
           *   - cloudUser: авторизованный пользователь Supabase
           *   - status: состояние подключения ('online'|'offline')
           *
           * MAIN FEATURES:
           *   - Автологин в Supabase (ONE_CURATOR_MODE)
           *   - Модальное окно выбора клиента
           *   - Синхронизация данных с облаком
           *   - Локальный режим (localStorage fallback)
           *
           * DEPENDENCIES: window.HEYS.cloud, window.HEYS.utils
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          const CORE_BACKUP_KEYS = [
            'heys_products',
            'heys_profile',
            'heys_hr_zones',
            'heys_norms',
            'heys_dayv2_date',
          ];

          function App() {
            const ONE_CURATOR_MODE = true; // Включаем автовход для работы с Supabase
            const [tab, setTab] = useState('day');
            // ...все остальные useState...
            // useEffect автосмены клиента — ниже всех useState!
            const U = window.HEYS.utils || { lsGet: (k, d) => d, lsSet: () => {} };
            const [products, setProducts] = useState([]);
            const [reportsRefresh, setReportsRefresh] = useState(0);
            
            // Дата для DayTab (поднятый state для DatePicker в шапке)
            const todayISO = () => {
              const d = new Date();
              return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            };
            const [selectedDate, setSelectedDate] = useState(todayISO());

            const cloud = window.HEYS.cloud || {};
            const [status, setStatus] = useState(
              typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'offline',
            );
            const [syncVer, setSyncVer] = useState(0);
            // === Clients (selector + persistence) ===
            const [clients, setClients] = useState([]);
            const [clientId, setClientId] = useState('');
            const [newName, setNewName] = useState('');
            const [cloudUser, setCloudUser] = useState(null);
            const [isInitializing, setIsInitializing] = useState(true); // Флаг начальной загрузки
            const [backupMeta, setBackupMeta] = useState(() => {
              if (U && typeof U.lsGet === 'function') {
                try {
                  return U.lsGet('heys_backup_meta', null);
                } catch (error) {
                  console.warn('[HEYS] Не удалось загрузить backup метаданные при инициализации:', error);
                }
              }
              return null;
            });
            const [backupBusy, setBackupBusy] = useState(false);

            // Получить клиентов куратора из Supabase
            async function fetchClientsFromCloud(curatorId) {
              if (!cloud.client || !curatorId) return [];
              const { data, error } = await cloud.client
                .from('clients')
                .select('id, name')
                .eq('curator_id', curatorId)
                .order('updated_at', { ascending: true });
              if (error) {
                console.error('Ошибка загрузки клиентов:', error);
                return [];
              }
              return data || [];
            }

            // Добавить клиента в Supabase или локально
            async function addClientToCloud(name) {
              const clientName = (name || '').trim() || `Клиент ${clients.length + 1}`;

              // Локальный режим
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                console.log('addClientToCloud: создание локального клиента');
                const newClient = {
                  id: `local-user-${Date.now()}`,
                  name: clientName,
                };
                const updatedClients = [...clients, newClient];
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                setClientId(newClient.id);
                U.lsSet('heys_client_current', newClient.id);
                return;
              }

              // Облачный режим
              const userId = cloudUser.id;
              const { data, error } = await cloud.client
                .from('clients')
                .insert([{ name: clientName, curator_id: userId }])
                .select('id, name')
                .single();
              if (error) {
                console.error('Ошибка создания клиента:', error);
                alert('Ошибка создания клиента: ' + error.message);
                return;
              }
              // После создания — обновить список
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
              setClientId(data.id);
              U.lsSet('heys_client_current', data.id);
            }

            // Переименовать клиента (локально или Supabase)
            async function renameClient(id, name) {
              // Локальный режим
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const updatedClients = clients.map((c) => (c.id === id ? { ...c, name } : c));
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                return;
              }

              // Облачный режим
              const userId = cloudUser.id;
              await cloud.client.from('clients').update({ name }).eq('id', id);
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
            }

            // Удалить клиента (локально или Supabase)
            async function removeClient(id) {
              // Локальный режим
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const updatedClients = clients.filter((c) => c.id !== id);
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                if (clientId === id) {
                  setClientId('');
                  U.lsSet('heys_client_current', '');
                }
                return;
              }

              // Облачный режим
              const userId = cloudUser.id;
              await cloud.client.from('clients').delete().eq('id', id);
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
              if (clientId === id) {
                setClientId('');
                U.lsSet('heys_client_current', '');
              }
            }

            const downloadBackupFile = React.useCallback((payload, activeClientId, timestamp) => {
              try {
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeTs = (timestamp || '').replace(/[:]/g, '-');
                a.download = `heys-backup-${activeClientId || 'client'}-${safeTs || Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 0);
              } catch (error) {
                console.error('Не удалось выгрузить файл резервной копии:', error);
              }
            }, []);

            const listDayKeysForClient = React.useCallback(() => {
              if (!clientId) return [];
              const normalized = new Set();
              try {
                const heysPrefix = `heys_${clientId}_`;
                const legacyDayPrefix = `day_${clientId}_`;
                for (let i = 0; i < localStorage.length; i++) {
                  const rawKey = localStorage.key(i);
                  if (!rawKey) continue;
                  if (rawKey.startsWith(`${heysPrefix}dayv2_`)) {
                    normalized.add('heys_' + rawKey.slice(heysPrefix.length));
                  } else if (rawKey.startsWith(legacyDayPrefix)) {
                    normalized.add('day_' + rawKey.slice(legacyDayPrefix.length));
                  }
                }
              } catch (error) {
                console.warn('[HEYS] Не удалось перечислить дневные ключи для бэкапа:', error);
              }
              return Array.from(normalized);
            }, [clientId]);

            const backupAllKeys = React.useCallback(
              (options = {}) => {
                if (!clientId) {
                  if (!options.silent) alert('Сначала выберите клиента');
                  return { ok: false, reason: 'no-client' };
                }
                const timestamp = new Date().toISOString();
                const reason = options.reason || 'manual';
                const includeDays = options.includeDays !== false;
                const baseKeys = Array.isArray(options.keys) && options.keys.length
                  ? options.keys
                  : CORE_BACKUP_KEYS;
                const keysToProcess = new Set(baseKeys);
                if (includeDays) {
                  listDayKeysForClient().forEach((key) => keysToProcess.add(key));
                }
                const shouldDownload = Boolean(options.triggerDownload);
                const filePayload = shouldDownload
                  ? { version: 1, clientId, generatedAt: timestamp, reason, items: [] }
                  : null;
                let processed = 0;
                keysToProcess.forEach((key) => {
                  let data = null;
                  try {
                    data = U && typeof U.lsGet === 'function' ? U.lsGet(key, null) : null;
                  } catch (error) {
                    console.warn('[HEYS] Ошибка чтения ключа для бэкапа:', key, error);
                    data = null;
                  }
                  if (data === null || data === undefined) return;
                  if (key === 'heys_products' && Array.isArray(data) && data.length === 0) {
                    if (window.DEV) {
                      window.DEV.log(
                        '[BACKUP] SKIP heys_products_backup: source array is empty, keep previous snapshot',
                      );
                    }
                    return;
                  }
                  const snapshot = {
                    key,
                    clientId,
                    backupAt: timestamp,
                    reason,
                    data,
                    itemsCount: Array.isArray(data)
                      ? data.length
                      : data && typeof data === 'object'
                        ? Object.keys(data).length
                        : 1,
                  };
                  if (window.DEV && key === 'heys_products') {
                    window.DEV.log('[BACKUP] heys_products_backup items:', snapshot.itemsCount);
                  }
                  if (U && typeof U.lsSet === 'function') {
                    U.lsSet(`${key}_backup`, snapshot);
                  } else {
                    try {
                      localStorage.setItem(`${key}_backup`, JSON.stringify(snapshot));
                    } catch (error) {
                      console.warn('[HEYS] Ошибка сохранения бэкапа в localStorage:', error);
                    }
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                      try {
                        window.HEYS.saveClientKey(`${key}_backup`, snapshot);
                      } catch (error) {
                        console.warn('[HEYS] Ошибка отправки бэкапа в облако:', error);
                      }
                    }
                  }
                  if (filePayload) {
                    filePayload.items.push(snapshot);
                  }
                  processed++;
                });
                const meta = {
                  timestamp,
                  clientId,
                  reason,
                  processed,
                  keys: Array.from(keysToProcess),
                };
                if (U && typeof U.lsSet === 'function') {
                  U.lsSet('heys_backup_meta', meta);
                } else {
                  try {
                    localStorage.setItem('heys_backup_meta', JSON.stringify(meta));
                  } catch (error) {}
                  if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                    try {
                      window.HEYS.saveClientKey('heys_backup_meta', meta);
                    } catch (error) {
                      console.warn('[HEYS] Ошибка синхронизации метаданных бэкапа:', error);
                    }
                  }
                }
                setBackupMeta(meta);
                if (shouldDownload && filePayload && filePayload.items.length) {
                  downloadBackupFile(filePayload, clientId, timestamp);
                }
                if (!options.silent) {
                  alert(
                    processed
                      ? `Бэкап готов: ${processed} разделов`
                      : 'Нет данных для резервного копирования',
                  );
                }
                if (window.HEYS && window.HEYS.analytics) {
                  window.HEYS.analytics.trackDataOperation('backup-save', processed);
                }
                return { ok: processed > 0, meta, processed };
              },
              [clientId, downloadBackupFile, listDayKeysForClient, setBackupMeta],
            );

            const restoreFromBackup = React.useCallback(
              (target = 'heys_products', options = {}) => {
                if (!clientId) {
                  if (!options.silent) alert('Сначала выберите клиента');
                  return { ok: false, reason: 'no-client' };
                }
                const keysList =
                  target === 'all'
                    ? Array.from(
                        new Set([
                          ...CORE_BACKUP_KEYS,
                          ...(options.includeDays === false
                            ? []
                            : listDayKeysForClient()),
                        ]),
                      )
                    : Array.isArray(target)
                      ? target
                      : [target];
                let restored = 0;
                keysList.forEach((key) => {
                  let snapshot = null;
                  try {
                    snapshot = U && typeof U.lsGet === 'function' ? U.lsGet(`${key}_backup`, null) : null;
                  } catch (error) {
                    console.warn('[HEYS] Ошибка чтения бэкапа перед восстановлением:', key, error);
                    snapshot = null;
                  }
                  if (!snapshot || typeof snapshot !== 'object' || !('data' in snapshot)) {
                    return;
                  }
                  if (key === 'heys_products' && Array.isArray(snapshot.data) && snapshot.data.length === 0) {
                    if (window.DEV) {
                      window.DEV.log('[RESTORE] Empty heys_products_backup, treating as no backup');
                    }
                    return;
                  }
                  if (key === 'heys_products') {
                    setProducts(Array.isArray(snapshot.data) ? snapshot.data : []);
                  } else if (U && typeof U.lsSet === 'function') {
                    U.lsSet(key, snapshot.data);
                  } else {
                    try {
                      localStorage.setItem(key, JSON.stringify(snapshot.data));
                    } catch (error) {}
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                      try {
                        window.HEYS.saveClientKey(key, snapshot.data);
                      } catch (error) {
                        console.warn('[HEYS] Ошибка синхронизации восстановленных данных:', error);
                      }
                    }
                  }
                  restored++;
                });
                if (restored) {
                  setSyncVer((v) => v + 1);
                  if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('backup-restore', restored);
                  }
                }
                if (!options.silent) {
                  alert(
                    restored
                      ? `Восстановлено разделов: ${restored}`
                      : 'Не удалось найти подходящий бэкап',
                  );
                }
                return { ok: restored > 0, restored };
              },
              [clientId, listDayKeysForClient, setProducts, setSyncVer],
            );

            // Автопереключение на вкладку статистики дня при выборе клиента
            useEffect(() => {
              if (clientId) setTab('day');
            }, [clientId]);

            // Fallback: если после входа продукты пустые, пробуем взять из localStorage через utils
            useEffect(() => {
              if (products.length === 0) {
                try {
                  const stored =
                    (window.HEYS &&
                      window.HEYS.utils &&
                      window.HEYS.utils.lsGet &&
                      window.HEYS.utils.lsGet('heys_products', [])) ||
                    [];
                  if (Array.isArray(stored) && stored.length) setProducts(stored);
                } catch (e) {}
              }
            }, [products.length]);

            // При смене клиента сохраняем в localStorage (для совместимости)
            useEffect(() => {
              if (clientId) {
                U.lsSet('heys_client_current', clientId);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = clientId;
                // Подгружаем данные клиента из Supabase и обновляем продукты
                if (cloud && typeof cloud.bootstrapClientSync === 'function') {
                  console.log(`🔄 [CLIENT CHANGE] Starting bootstrap for client: ${clientId}`);
                  // КРИТИЧНО: Сохраняем текущие продукты перед синхронизацией
                  const productsBeforeSync = products.length > 0 ? products : window.HEYS.utils.lsGet('heys_products', []);
                  console.log(`📦 [CLIENT CHANGE] Products before sync: ${Array.isArray(productsBeforeSync) ? productsBeforeSync.length : 0} items`);
                  
                  cloud.bootstrapClientSync(clientId).then(() => {
                    console.log(`🔄 [CLIENT CHANGE] Bootstrap completed, loading products...`);
                    // всегда используем HEYS.utils.lsGet для clientId-специфичного ключа
                    const loadedProducts = Array.isArray(
                      window.HEYS.utils.lsGet('heys_products', []),
                    )
                      ? window.HEYS.utils.lsGet('heys_products', [])
                      : [];
                    console.log(`📦 [CLIENT CHANGE] Loaded products from localStorage: ${loadedProducts.length} items`);
                    
                    // ЗАЩИТА: если синхронизация вернула пустой массив, а у нас были продукты - не затираем
                    if (loadedProducts.length === 0 && Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                      console.warn(`⚠️ [CLIENT CHANGE] PROTECTION: Sync returned empty, keeping ${productsBeforeSync.length} products`);
                      setProducts(productsBeforeSync);
                      // Восстанавливаем в localStorage
                      window.HEYS.utils.lsSet('heys_products', productsBeforeSync);
                    } else {
                      setProducts(loadedProducts);
                    }
                    setSyncVer((v) => v + 1);
                  });
                } else {
                  setSyncVer((v) => v + 1);
                }
              }
            }, [clientId]);

            useEffect(() => {
              if (!clientId) {
                setBackupMeta(null);
                return;
              }
              try {
                const meta = U && typeof U.lsGet === 'function' ? U.lsGet('heys_backup_meta', null) : null;
                setBackupMeta(meta || null);
              } catch (error) {
                console.warn('[HEYS] Ошибка обновления метаданных бэкапа при смене клиента:', error);
              }
            }, [clientId]);

            // Слушаем событие обновления продуктов из облака
            useEffect(() => {
              const handleProductsUpdate = (event) => {
                const { products } = event.detail;
                setProducts(products);
                setSyncVer((v) => v + 1);
              };

              window.addEventListener('heysProductsUpdated', handleProductsUpdate);
              return () => window.removeEventListener('heysProductsUpdated', handleProductsUpdate);
            }, []);

            // Обертка для сохранения данных клиента в облако
            // ВАЖНО: Поддерживает ДВА формата вызова:
            //   - saveClientKey(key, value) — старый формат, 2 аргумента
            //   - saveClientKey(clientId, key, value) — новый формат, 3 аргумента (из Store.set)
            window.HEYS = window.HEYS || {};
            window.HEYS.saveClientKey = function (...args) {
              if (cloud && typeof cloud.saveClientKey === 'function') {
                if (args.length === 3) {
                  // Новый формат: (clientId, key, value)
                  const [cid, k, v] = args;
                  cloud.saveClientKey(cid, k, v);
                } else if (args.length === 2) {
                  // Старый формат: (key, value) — используем clientId из замыкания
                  const [k, v] = args;
                  if (clientId) {
                    cloud.saveClientKey(clientId, k, v);
                  }
                }
              }
            };
            useEffect(() => {
              window.HEYS = window.HEYS || {};
              window.HEYS.backupManager = window.HEYS.backupManager || {};
              window.HEYS.backupManager.backupAll = backupAllKeys;
              window.HEYS.backupManager.restore = restoreFromBackup;
              window.HEYS.backupManager.getLastBackupMeta = () => backupMeta;
            }, [backupAllKeys, restoreFromBackup, backupMeta]);
            // overlay (no early return, to keep hooks order stable)
            // One-time migration of old, namespaced client lists -> global
            // После входа — загрузить клиентов куратора
            useEffect(() => {
              if (cloudUser && cloudUser.id) {
                fetchClientsFromCloud(cloudUser.id).then(setClients);
              }
            }, [cloudUser]);

            // Создать тестовых клиентов
            async function createTestClients() {
              if (!cloud.client || !cloudUser || !cloudUser.id) return;
              const userId = cloudUser.id; // Сохраняем локально
              const testClients = [{ name: 'Иван Петров' }, { name: 'Анна Сидорова' }];

              for (const testClient of testClients) {
                try {
                  await cloud.client
                    .from('clients')
                    .insert([{ name: testClient.name, curator_id: userId }]);
                } catch (error) {
                  console.error('Ошибка создания тестового клиента:', error);
                }
              }

              // Обновить список клиентов
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
            }

            function formatBackupTime(meta) {
              if (!meta || !meta.timestamp) return '—';
              try {
                return new Date(meta.timestamp).toLocaleString('ru-RU', { hour12: false });
              } catch (error) {
                return meta.timestamp;
              }
            }

            async function handleManualBackup() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (backupBusy) return;
              setBackupBusy(true);
              try {
                await backupAllKeys({ reason: 'manual' });
              } finally {
                setBackupBusy(false);
              }
            }

            async function handleExportBackup() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (backupBusy) return;
              setBackupBusy(true);
              try {
                const result = await backupAllKeys({
                  reason: 'manual-export',
                  triggerDownload: true,
                  includeDays: true,
                  silent: true,
                });
                alert(
                  result && result.processed
                    ? `Файл бэкапа скачан (${result.processed} разделов)`
                    : 'Нет данных для экспорта',
                );
              } finally {
                setBackupBusy(false);
              }
            }

            function handleRestoreProducts() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (!confirm('Восстановить список продуктов из последнего бэкапа?')) return;
              const result = restoreFromBackup('heys_products', { silent: true });
              alert(result && result.ok ? 'Продукты восстановлены.' : 'Не найден бэкап продуктов.');
            }

            function handleRestoreAll() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (!confirm('Восстановить все доступные данные из бэкапа?')) return;
              const result = restoreFromBackup('all', { silent: true });
              alert(
                result && result.ok
                  ? `Восстановлено разделов: ${result.restored}`
                  : 'Не найдено подходящих бэкапов.',
              );
            }

            const gate = !clientId
              ? React.createElement(
                  'div',
                  { className: 'modal-backdrop' },
                  React.createElement(
                    'div',
                    { className: 'modal' },
                    isInitializing
                      ? React.createElement(
                          'div',
                          { style: { textAlign: 'center', padding: '40px 20px' } },
                          React.createElement(
                            'div',
                            { style: { fontSize: 18, marginBottom: 12 } },
                            '⏳ Загрузка...',
                          ),
                          React.createElement(
                            'div',
                            { className: 'muted' },
                            'Подключение к серверу',
                          ),
                        )
                      : React.createElement(
                          React.Fragment,
                          null,
                          React.createElement(
                            'div',
                            {
                              className: 'row',
                              style: { justifyContent: 'space-between', marginBottom: '6px' },
                            },
                            React.createElement(
                              'div',
                              { style: { fontWeight: 600 } },
                              'Выберите клиента',
                            ),
                            React.createElement(
                              'span',
                              { className: 'muted' },
                              `Всего: ${clients.length}`,
                            ),
                          ),
                          React.createElement(
                            'div',
                            { style: { maxHeight: 260, overflow: 'auto', marginBottom: 8 } },
                            clients.length
                              ? clients.map((c) =>
                                  React.createElement(
                                    'div',
                                    {
                                      key: c.id,
                                      className: 'row',
                                      style: { justifyContent: 'space-between' },
                                    },
                                    React.createElement(
                                      'div',
                                      null,
                                      React.createElement(
                                        'div',
                                        { style: { fontWeight: 600 } },
                                        c.name,
                                      ),
                                      React.createElement('div', { className: 'muted' }, c.id),
                                    ),
                                    React.createElement(
                                      'div',
                                      { className: 'row' },
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn',
                                          onClick: () => {
                                            setClientId(c.id);
                                            U.lsSet('heys_client_current', c.id); // Сохраняем выбор
                                          },
                                        },
                                        'Выбрать',
                                      ),
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn',
                                          onClick: () => {
                                            const nm = prompt('Новое имя', c.name) || c.name;
                                            renameClient(c.id, nm);
                                          },
                                        },
                                        'Переимен.',
                                      ),
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn',
                                          onClick: () => {
                                            if (confirm('Удалить клиента?')) removeClient(c.id);
                                          },
                                        },
                                        'Удалить',
                                      ),
                                    ),
                                  ),
                                )
                              : React.createElement(
                                  'div',
                                  { className: 'muted' },
                                  'Ещё нет ни одного клиента',
                                ),
                          ),
                          React.createElement(
                            'div',
                            { className: 'row' },
                            React.createElement('input', {
                              placeholder: 'Имя нового клиента',
                              value: newName,
                              onChange: (e) => setNewName(e.target.value),
                            }),
                            React.createElement(
                              'button',
                              { className: 'btn acc', onClick: () => addClientToCloud(newName) },
                              'Создать и выбрать',
                            ),
                          ),
                          React.createElement(
                            'div',
                            { className: 'row', style: { marginTop: 8 } },
                            React.createElement(
                              'button',
                              { className: 'btn secondary', onClick: createTestClients },
                              'Создать тестовых клиентов',
                            ),
                          ),
                        ), // ← Закрываем React.Fragment
                  ),
                )
              : null;

            const [email, setEmail] = useState('poplanton@mail.ru');
            const [pwd, setPwd] = useState('007670');

            useEffect(() => {
              // Инициализация локальных данных (только если нет облака)
              const initLocalData = () => {
                // Загружаем продукты из localStorage или создаём пустой массив
                const storedProducts = U.lsGet('heys_products', []);
                if (Array.isArray(storedProducts)) {
                  setProducts(storedProducts);
                }

                // Загружаем список локальных клиентов
                const storedClients = U.lsGet('heys_clients', []);
                if (Array.isArray(storedClients) && storedClients.length > 0) {
                  setClients(storedClients);
                } else {
                  // Создаём тестовых клиентов только в offline режиме
                  const defaultClients = [
                    { id: 'local-user-001', name: 'Иван Петров' },
                    { id: 'local-user-002', name: 'Анна Сидорова' },
                  ];
                  setClients(defaultClients);
                  U.lsSet('heys_clients', defaultClients);
                }

                // Проверяем есть ли сохраненный клиент
                const currentClient = U.lsGet('heys_client_current');
                const storedClientsArray = U.lsGet('heys_clients', []);
                if (currentClient && storedClientsArray.some((c) => c.id === currentClient)) {
                  setClientId(currentClient);
                  window.HEYS = window.HEYS || {};
                  window.HEYS.currentClientId = currentClient;
                  console.log('[HEYS] 🔄 Restored client in offline mode:', currentClient);
                }

                setStatus('offline');
                setSyncVer((v) => v + 1);
              };

              // Пробуем подключиться к облаку если доступно
              if (cloud && typeof cloud.bootstrapSync === 'function') {
                // ВАЖНО: Сначала нужен signIn, ПОТОМ bootstrapSync!
                console.log('[HEYS] 🚀 Starting auto sign-in...');

                // Пытаемся автоматический вход с сохранёнными credentials
                const savedEmail = 'poplanton@mail.ru'; // TODO: взять из настроек
                const savedPwd = '007670'; // TODO: взять из настроек

                cloud
                  .signIn(savedEmail, savedPwd)
                  .then(async (result) => {
                    console.log('[HEYS] ✅ Auto sign-in completed, user:', result.user?.email);

                    if (result.error) {
                      console.error('[HEYS] ❌ Sign-in failed:', result.error);
                      initLocalData();
                      setIsInitializing(false);
                      return;
                    }

                    // Теперь пользователь залогинен, можно устанавливать cloudUser
                    const user = result.user || (cloud.getUser && cloud.getUser());
                    if (user) {
                      setCloudUser(user);
                      setStatus('online');

                      // Загружаем НАСТОЯЩИХ клиентов из Supabase таблицы clients
                      try {
                        const realClients = await fetchClientsFromCloud(user.id);
                        if (realClients && realClients.length > 0) {
                          setClients(realClients);
                          U.lsSet('heys_clients', realClients); // Сохраняем в localStorage

                          // Восстанавливаем последнего выбранного клиента, если он есть в списке
                          const savedClientId = U.lsGet('heys_client_current');
                          if (savedClientId && realClients.some((c) => c.id === savedClientId)) {
                            console.log('[HEYS] 🔄 Restoring saved client:', savedClientId);
                            setClientId(savedClientId);
                            window.HEYS = window.HEYS || {};
                            window.HEYS.currentClientId = savedClientId;
                          } else {
                            console.log(
                              '[HEYS] ℹ️ No saved client or client not found in list, showing selector',
                            );
                          }

                          console.log(
                            '[HEYS] ✅ Loaded',
                            realClients.length,
                            'clients from Supabase',
                          );
                        } else {
                          // Если нет клиентов в Supabase — fallback на localStorage
                          const localClients = U.lsGet('heys_clients', []).filter(
                            (c) => !c.id?.startsWith('local-user'),
                          );
                          if (localClients.length > 0) {
                            setClients(localClients);
                          } else {
                            initLocalData(); // Создаём тестовые только если совсем ничего нет
                          }
                        }
                      } catch (error) {
                        console.error('[HEYS] Error loading clients:', error);
                        initLocalData();
                      }
                    } else {
                      // Нет пользователя после signIn — используем offline
                      console.warn('[HEYS] ⚠️ No user after signIn, using offline mode');
                      initLocalData();
                    }

                    const initialProducts = Array.isArray(U.lsGet('heys_products', []))
                      ? U.lsGet('heys_products', [])
                      : [];
                    console.log(`📦 [INIT] Loading initial products: ${initialProducts.length} items`);
                    setProducts(initialProducts);
                    setSyncVer((v) => v + 1);
                    console.log(
                      '[HEYS] 🎯 Setting isInitializing = false, clients.length:',
                      clients.length,
                    );
                    setIsInitializing(false); // ✅ Инициализация завершена
                  })
                  .catch((error) => {
                    console.error('[HEYS] ❌ Auto sign-in failed:', error);
                    initLocalData();
                    setIsInitializing(false); // ✅ Инициализация завершена (offline)
                  });
              } else {
                console.log('[HEYS] ⚠️ No cloud available, using offline mode');
                initLocalData();
                setIsInitializing(false); // ✅ Инициализация завершена (no cloud)
              }
            }, []);

            // При полной перезагрузке панели — bootstrap продуктов из облака, если выбран клиент
            useEffect(() => {
              if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                console.log(`🔄 [RELOAD] Starting bootstrap for client: ${clientId}`);
                // ЗАЩИТА: Сохраняем текущие продукты перед reload
                const currentProducts = window.HEYS.utils.lsGet('heys_products', []);
                console.log(`📦 [RELOAD] Current products before bootstrap: ${Array.isArray(currentProducts) ? currentProducts.length : 0} items`);
                
                cloud.bootstrapClientSync(clientId).then(() => {
                  console.log(`🔄 [RELOAD] Bootstrap completed, loading products...`);
                  const loadedProducts = Array.isArray(window.HEYS.utils.lsGet('heys_products', []))
                    ? window.HEYS.utils.lsGet('heys_products', [])
                    : [];
                  console.log(`📦 [RELOAD] Loaded products from localStorage: ${loadedProducts.length} items`);
                  
                  // ЗАЩИТА: не затираем продукты пустым массивом после reload
                  if (loadedProducts.length === 0 && Array.isArray(currentProducts) && currentProducts.length > 0) {
                    console.warn(`⚠️ [RELOAD] PROTECTION: Bootstrap returned empty, keeping ${currentProducts.length} products`);
                    setProducts(currentProducts);
                    window.HEYS.utils.lsSet('heys_products', currentProducts);
                  } else {
                    setProducts(loadedProducts);
                  }
                  setSyncVer((v) => v + 1);
                });
              }
            }, [clientId]);

            // debounced save products
            const saveTimerRef = React.useRef(null);
            useEffect(() => {
              console.log(`💾 [useEffect] Products changed, length: ${products.length}, clientId: ${clientId}`);
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              saveTimerRef.current = setTimeout(() => {
                try {
                  console.log(`💾 [useEffect] Saving products to cloud: ${products.length} items`);
                  window.HEYS.saveClientKey('heys_products', products);
                } catch (e) {
                  console.error('Error saving products:', e);
                }
              }, 300);
              return () => {
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
              };
            }, [products]);

            // auto sign-in in single-curator mode
            useEffect(() => {
              if (ONE_CURATOR_MODE && status !== 'online') {
                doSignIn();
              }
            }, [ONE_CURATOR_MODE, status]);

            async function doSignIn() {
              try {
                if (!email || !pwd) {
                  alert('Введите email и пароль');
                  return;
                }
                setStatus('signin');
                if (cloud && typeof cloud.signIn === 'function') {
                  const result = await cloud.signIn(email, pwd);
                  if (result.error) {
                    alert('Ошибка входа: ' + (result.error.message || result.error));
                    setStatus('offline');
                    return;
                  }
                  setCloudUser(result.user);
                }
                setStatus(typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'online');
                // Загружаем продукты после sign-in
                const loadedProducts = Array.isArray(U.lsGet('heys_products', []))
                  ? U.lsGet('heys_products', [])
                  : [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
              } catch (e) {
                setStatus('offline');
                alert('Ошибка входа: ' + (e && e.message ? e.message : e));
              }
            }
            async function doSignOut() {
              try {
                if (cloud && typeof cloud.signOut === 'function') await cloud.signOut();
              } catch (e) {}
              setStatus(typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'offline');
              setProducts([]);
              setSyncVer((v) => v + 1);
            }

            // Получаем инициалы клиента для аватара
            const getClientInitials = (name) => {
              if (!name) return '?';
              const parts = name.trim().split(' ');
              if (parts.length >= 2) {
                return (parts[0][0] + parts[1][0]).toUpperCase();
              }
              return name.slice(0, 2).toUpperCase();
            };

            const currentClientName = clients.find((c) => c.id === clientId)?.name || 'Выберите клиента';

            return React.createElement(
              React.Fragment,
              null,
              gate,
              React.createElement(
                'div',
                { className: 'wrap' },
                React.createElement(
                  'div',
                  { className: 'hdr' },
                  // === ВЕРХНЯЯ ЛИНИЯ: Логотип + Статус ===
                  React.createElement(
                    'div',
                    { className: 'hdr-top' },
                    React.createElement(
                      'div',
                      { className: 'hdr-logo' },
                      React.createElement('div', { className: 'hdr-logo-icon' }, '🥗'),
                      React.createElement(
                        'div',
                        null,
                        React.createElement('div', { className: 'hdr-logo-text' }, 'HEYS'),
                        React.createElement('div', { className: 'hdr-logo-sub' }, 'Панель куратора'),
                      ),
                    ),
                    React.createElement(
                      'div',
                      { className: 'hdr-status' },
                      React.createElement(
                        'span',
                        { className: 'status ' + (status === 'online' ? 'ok' : 'err') },
                        status === 'online' ? 'Онлайн' : 'Офлайн',
                      ),
                      clientId
                        ? React.createElement(
                            'button',
                            {
                              className: 'hdr-switch-btn',
                              onClick: () => {
                                localStorage.removeItem('heys_client_current');
                                window.HEYS = window.HEYS || {};
                                window.HEYS.currentClientId = null;
                                setClientId('');
                              },
                              title: 'Сменить клиента',
                            },
                            '↻ Сменить',
                          )
                        : null,
                      window.HEYS.analyticsUI
                        ? React.createElement(window.HEYS.analyticsUI.AnalyticsButton)
                        : null,
                    ),
                  ),
                  // === НИЖНЯЯ ЛИНИЯ: Клиент + Действия ===
                  clientId
                    ? React.createElement(
                        'div',
                        { className: 'hdr-bottom' },
                        // Информация о клиенте + DatePicker
                        React.createElement(
                          'div',
                          { className: 'hdr-client' },
                          React.createElement(
                            'div',
                            { className: 'hdr-client-avatar' },
                            getClientInitials(currentClientName),
                          ),
                          React.createElement(
                            'div',
                            { className: 'hdr-client-info' },
                            React.createElement('span', { className: 'hdr-client-label' }, 'Клиент'),
                            React.createElement('span', { className: 'hdr-client-name' }, currentClientName),
                          ),
                          // DatePicker рядом с именем клиента
                          (tab === 'day' || tab === 'reports') && window.HEYS.DatePicker
                            ? React.createElement(window.HEYS.DatePicker, {
                                valueISO: selectedDate,
                                onSelect: setSelectedDate,
                                onRemove: () => {
                                  setSelectedDate(todayISO());
                                }
                              })
                            : null,
                        ),
                      )
                    : null,
                ),
                React.createElement(
                  'div',
                  { className: 'tabs' },
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'ration' ? 'active' : ''),
                      onClick: () => setTab('ration'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '🍽️'),
                    React.createElement('span', { className: 'tab-text' }, 'Рацион'),
                  ),
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'day' ? 'active' : ''),
                      onClick: () => setTab('day'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📊'),
                    React.createElement('span', { className: 'tab-text' }, 'День'),
                  ),
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'reports' ? 'active' : ''),
                      onClick: () => {
                        if (
                          window.HEYS &&
                          window.HEYS.Day &&
                          typeof window.HEYS.Day.requestFlush === 'function'
                        ) {
                          try {
                            window.HEYS.Day.requestFlush();
                          } catch (error) {}
                        }
                        setTab('reports');
                        setReportsRefresh(Date.now());
                      },
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📈'),
                    React.createElement('span', { className: 'tab-text' }, 'Отчёты'),
                  ),
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'user' ? 'active' : ''),
                      onClick: () => setTab('user'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '👤'),
                    React.createElement('span', { className: 'tab-text' }, 'Профиль'),
                  ),
                ),
                tab === 'ration'
                  ? React.createElement(RationTabWithCloudSync, {
                      key: 'ration' + syncVer + '_' + String(clientId || ''),
                      products,
                      setProducts,
                      clientId,
                    })
                  : tab === 'day'
                    ? React.createElement(DayTabWithCloudSync, {
                        key: 'day' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                        products,
                        clientId,
                        selectedDate,
                        setSelectedDate,
                      })
                    : tab === 'user'
                      ? React.createElement(UserTabWithCloudSync, {
                          key: 'user' + syncVer + '_' + String(clientId || ''),
                          clientId,
                        })
                      : window.HEYS && window.HEYS.ReportsTab
                          ? React.createElement(window.HEYS.ReportsTab, {
                              key:
                                'reports' +
                                syncVer +
                                '_' +
                                String(clientId || '') +
                                '_' +
                                reportsRefresh,
                              products,
                            })
                          : React.createElement(
                              'div',
                              { className: 'muted', style: { padding: 24 } },
                              '⏳ Загрузка компонента отчётов...',
                            ),
              ),
            );
          }
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(React.createElement(App));
        }

        // Start initialization
        initializeApp();
      })();
