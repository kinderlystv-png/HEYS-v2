// heys_app_shell_v1.js — App header + navigation shell

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    function AppHeader(props) {
        const {
            clientId,
            tab,
            selectedDate,
            setSelectedDate,
            todayISO,
            datePickerActiveDays,
            products,
            cachedProfile,
            currentClientName,
            getAvatarColor,
            getClientInitials,
            getClientStats,
            formatLastActive,
            clients,
            clientIdValue,
            setClientId,
            showClientDropdown,
            setShowClientDropdown,
            isRpcMode,
            cloudUser,
            handleSignOut,
            U,
            cloudStatus,
            syncProgress,
            pendingCount,
            retryCountdown,
            GamificationBar,
            setTab,
            setActiveTab,
        } = props;

        if (!clientId) return null;

        return React.createElement(
            'div',
            { className: 'hdr' },
            // === ВЕРХНЯЯ ЛИНИЯ: Gamification Bar ===
            React.createElement(
                'div',
                { className: 'hdr-top hdr-gamification' },
                React.createElement(GamificationBar)
            ),
            // === НИЖНЯЯ ЛИНИЯ: Клиент + Действия ===
            React.createElement(
                'div',
                { className: 'hdr-bottom' },
                // Информация о клиенте + DatePicker
                React.createElement(
                    'div',
                    { className: 'hdr-client', style: { position: 'relative' } },
                    // Кликабельный блок для dropdown
                    React.createElement(
                        'div',
                        {
                            className: 'hdr-client-clickable',
                            onClick: () => setShowClientDropdown(!showClientDropdown),
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                padding: '4px 8px 4px 4px',
                                borderRadius: 12,
                                transition: 'background 0.2s'
                            }
                        },
                        React.createElement(
                            'div',
                            {
                                className: 'hdr-client-avatar',
                                style: { background: getAvatarColor(currentClientName) }
                            },
                            getClientInitials(currentClientName)
                        ),
                        React.createElement(
                            'div',
                            { className: 'hdr-client-info' },
                            // Единый источник имени: currentClientName
                            (() => {
                                const fullName = (currentClientName || '').trim();
                                const parts = fullName.split(' ').filter(Boolean);
                                return [
                                    React.createElement('span', { key: 'fn', className: 'hdr-client-firstname' }, parts[0] || ''),
                                    parts.length > 1 && React.createElement('span', { key: 'ln', className: 'hdr-client-lastname' }, parts.slice(1).join(' '))
                                ];
                            })()
                        ),
                        // Стрелка dropdown
                        React.createElement('span', {
                            style: {
                                fontSize: 10,
                                color: 'var(--muted)',
                                transition: 'transform 0.2s',
                                transform: showClientDropdown ? 'rotate(180deg)' : 'rotate(0)'
                            }
                        }, '▼')
                    ),
                    // Dropdown список клиентов
                    showClientDropdown && React.createElement(
                        'div',
                        {
                            className: 'client-dropdown',
                            style: {
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: 8,
                                background: 'var(--card)',
                                borderRadius: 16,
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                border: '1px solid var(--border)',
                                minWidth: 260,
                                maxHeight: 320,
                                overflow: 'auto',
                                zIndex: 1000,
                                animation: 'fadeSlideIn 0.2s ease'
                            }
                        },
                        // Проверяем режим: клиент (RPC) или куратор
                        isRpcMode
                            // === КЛИЕНТСКИЙ РЕЖИМ: только имя + кнопка выхода ===
                            ? [
                                // Заголовок "Мой аккаунт"
                                React.createElement('div', {
                                    key: 'header',
                                    style: {
                                        padding: '16px 16px 12px',
                                        textAlign: 'center',
                                        borderBottom: '1px solid var(--border)'
                                    }
                                },
                                    React.createElement('div', {
                                        style: {
                                            width: 48,
                                            height: 48,
                                            borderRadius: '50%',
                                            background: getAvatarColor(currentClientName),
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            fontWeight: 600,
                                            fontSize: 18,
                                            margin: '0 auto 8px'
                                        }
                                    }, getClientInitials(currentClientName)),
                                    React.createElement('div', {
                                        style: { fontSize: 16, fontWeight: 600, color: 'var(--text)' }
                                    }, currentClientName)
                                ),
                                // Кнопка настроек
                                React.createElement('div', {
                                    key: 'settings',
                                    style: {
                                        padding: '12px 16px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        borderBottom: '1px solid var(--border)'
                                    },
                                    onClick: () => {
                                        setShowClientDropdown(false);
                                        if (setActiveTab) {
                                            setActiveTab('profile');
                                        }
                                    }
                                },
                                    React.createElement('span', {
                                        style: { color: 'var(--text)' }
                                    }, '⚙️ Перейти в настройки')
                                ),
                                // Кнопка выхода
                                React.createElement('div', {
                                    key: 'logout',
                                    style: {
                                        padding: '12px 16px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        fontSize: 14
                                    },
                                    onClick: () => {
                                        setShowClientDropdown(false);
                                        handleSignOut();
                                    }
                                },
                                    React.createElement('span', {
                                        style: { color: '#ef4444' }
                                    }, '🚪 Выйти из аккаунта')
                                )
                            ]
                            // === РЕЖИМ КУРАТОРА: полный список клиентов ===
                            : [
                                // Заголовок
                                React.createElement('div', {
                                    key: 'header',
                                    style: {
                                        padding: '12px 16px 8px',
                                        fontSize: 12,
                                        color: 'var(--muted)',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }
                                }, `Быстрый выбор (${clients.length})`),
                                // Список клиентов (сортировка: последний использованный сверху)
                                [...clients]
                                    .sort((a, b) => {
                                        const lastA = localStorage.getItem('heys_last_client_id') === a.id ? 1 : 0;
                                        const lastB = localStorage.getItem('heys_last_client_id') === b.id ? 1 : 0;
                                        if (lastA !== lastB) return lastB - lastA;
                                        // Затем по активности (streak)
                                        const statsA = getClientStats(a.id);
                                        const statsB = getClientStats(b.id);
                                        return (statsB.streak || 0) - (statsA.streak || 0);
                                    })
                                    .map((c) =>
                                        React.createElement(
                                            'div',
                                            {
                                                key: c.id,
                                                className: 'client-dropdown-item' + (c.id === clientIdValue ? ' active' : ''),
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '10px 16px',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                    background: c.id === clientIdValue ? 'rgba(102, 126, 234, 0.1)' : 'transparent'
                                                },
                                                onClick: async () => {
                                                    if (c.id !== clientIdValue) {
                                                        if (HEYS.cloud && HEYS.cloud.switchClient) {
                                                            await HEYS.cloud.switchClient(c.id);
                                                        } else {
                                                            U.lsSet('heys_client_current', c.id);
                                                        }
                                                        localStorage.setItem('heys_last_client_id', c.id);
                                                        setClientId(c.id);
                                                        window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId: c.id } }));
                                                    }
                                                    setShowClientDropdown(false);
                                                }
                                            },
                                            // Мини-аватар
                                            React.createElement('div', {
                                                style: {
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: '50%',
                                                    background: getAvatarColor(c.name),
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#fff',
                                                    fontWeight: 600,
                                                    fontSize: 12,
                                                    flexShrink: 0
                                                }
                                            }, getClientInitials(c.name)),
                                            // Имя
                                            React.createElement('span', {
                                                style: {
                                                    flex: 1,
                                                    fontWeight: c.id === clientIdValue ? 600 : 400,
                                                    color: c.id === clientIdValue ? '#4285f4' : 'var(--text)'
                                                }
                                            }, c.name),
                                            // Галочка для выбранного
                                            c.id === clientIdValue && React.createElement('span', {
                                                style: { color: '#4285f4' }
                                            }, '✓')
                                        )
                                    ),
                                // Разделитель
                                React.createElement('div', {
                                    key: 'divider',
                                    style: { height: 1, background: 'var(--border)', margin: '8px 0' }
                                }),
                                // Кнопка "Все клиенты"
                                React.createElement(
                                    'div',
                                    {
                                        key: 'all-clients',
                                        style: {
                                            padding: '10px 16px 12px',
                                            textAlign: 'center',
                                            color: '#4285f4',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            fontSize: 14
                                        },
                                        onClick: () => {
                                            localStorage.removeItem('heys_client_current');
                                            window.HEYS.currentClientId = null;
                                            setClientId('');
                                            window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId: null } }));
                                            setShowClientDropdown(false);
                                        }
                                    },
                                    '👥 Все клиенты'
                                ),
                                // Кнопка Выход с email
                                React.createElement(
                                    'div',
                                    {
                                        key: 'logout',
                                        style: {
                                            padding: '8px 16px 12px',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            fontSize: 13
                                        },
                                        onClick: () => {
                                            setShowClientDropdown(false);
                                            handleSignOut();
                                        }
                                    },
                                    React.createElement('div', {
                                        style: { color: 'var(--muted)', fontSize: 11, marginBottom: 4 }
                                    }, cloudUser?.email || ''),
                                    React.createElement('span', {
                                        style: { color: '#ef4444' }
                                    }, '🚪 Выйти')
                                )
                            ]
                    ),
                    // Overlay для закрытия dropdown при клике вне
                    showClientDropdown && React.createElement('div', {
                        style: {
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 999
                        },
                        onClick: () => setShowClientDropdown(false)
                    }),
                    // Cloud sync indicator
                    React.createElement('div', {
                        key: 'cloud-' + cloudStatus, // Force re-render on status change
                        className: 'cloud-sync-indicator ' + cloudStatus,
                        title: (() => {
                            const routingMode = HEYS?.cloud?.getRoutingStatus?.()?.mode || 'unknown';
                            const modeLabel = routingMode === 'direct' ? '🔗 Direct' : routingMode === 'proxy' ? '🔀 Proxy' : '';
                            const baseTitle = cloudStatus === 'syncing'
                                ? (syncProgress.total > 1
                                    ? `Синхронизация... ${syncProgress.synced}/${syncProgress.total}`
                                    : 'Синхронизация...')
                                : cloudStatus === 'synced' ? 'Сохранено в облако'
                                    : cloudStatus === 'offline'
                                        ? (pendingCount > 0
                                            ? `Офлайн — ${pendingCount} изменений ожидают синхронизации`
                                            : 'Офлайн — данные сохраняются локально')
                                        : cloudStatus === 'error'
                                            ? (retryCountdown > 0 ? `Ошибка. Повтор через ${retryCountdown}с` : 'Ошибка синхронизации')
                                            : 'Подключено к облаку';
                            return modeLabel ? `${baseTitle} (${modeLabel})` : baseTitle;
                        })(),
                        // Синее облако — сеть есть, зелёная галочка — синхронизировано
                        dangerouslySetInnerHTML: {
                            __html: cloudStatus === 'syncing'
                                ? '<div class="sync-spinner"></div>' + (syncProgress.total > 1 ? '<span class="sync-progress">' + syncProgress.synced + '/' + syncProgress.total + '</span>' : '')
                                : cloudStatus === 'synced'
                                    ? '<span class="cloud-icon synced">✓</span>'
                                    : cloudStatus === 'offline'
                                        ? '<svg class="cloud-icon offline" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"/></svg>' + (pendingCount > 0 ? '<span class="pending-badge">' + pendingCount + '</span>' : '')
                                        : cloudStatus === 'error'
                                            ? '<span class="cloud-icon error">⚠</span>' + (retryCountdown > 0 ? '<span class="retry-countdown">' + retryCountdown + '</span>' : '')
                                            : '<svg class="cloud-icon idle" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>'
                        }
                    }),
                    // Кнопки "Вчера" + "Сегодня" + DatePicker
                    (tab === 'stats' || tab === 'diary' || tab === 'insights' || tab === 'month' || tab === 'widgets') && window.HEYS.DatePicker
                        ? React.createElement('div', { className: 'hdr-date-group' },
                            // Кнопка быстрого перехода на вчера
                            React.createElement('button', {
                                className: 'yesterday-quick-btn' + (selectedDate === (() => {
                                    const d = new Date();
                                    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                    d.setDate(d.getDate() - 1);
                                    // Локальное форматирование (не UTC!)
                                    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                })() ? ' active' : ''),
                                onClick: () => {
                                    const d = new Date();
                                    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                    d.setDate(d.getDate() - 1);
                                    // Локальное форматирование (не UTC!)
                                    setSelectedDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                                },
                                title: 'Перейти на вчера'
                            }, (() => {
                                // До 3:00 — вчера = позавчера реально
                                const d = new Date();
                                if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                d.setDate(d.getDate() - 1);
                                return d.getDate();
                            })()),
                            // Кнопка быстрого перехода на сегодня (учитываем ночной порог)
                            React.createElement('button', {
                                className: 'today-quick-btn' + (selectedDate === todayISO() ? ' active' : ''),
                                onClick: () => setSelectedDate(todayISO()),
                                title: 'Перейти на сегодня'
                            }, (() => {
                                // До 3:00 — показываем вчерашнее число
                                const d = new Date();
                                if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                return d.getDate();
                            })()),
                            // DatePicker
                            React.createElement(window.HEYS.DatePicker, {
                                valueISO: selectedDate,
                                onSelect: setSelectedDate,
                                onRemove: () => {
                                    setSelectedDate(todayISO());
                                },
                                activeDays: datePickerActiveDays,
                                // Функция для загрузки данных при смене месяца
                                getActiveDaysForMonth: (year, month) => {
                                    const getActiveDaysForMonthFn = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
                                    // Fallback chain для products
                                    const effectiveProducts = (products && products.length > 0) ? products
                                        : (window.HEYS.products?.getAll?.() || [])
                                            .length > 0 ? window.HEYS.products.getAll()
                                            : (U.lsGet?.('heys_products', []) || []);
                                    // Fallback chain для profile
                                    const effectiveProfile = cachedProfile || (U && U.lsGet ? U.lsGet('heys_profile', {}) : {});
                                    if (!getActiveDaysForMonthFn || !clientId || effectiveProducts.length === 0) {
                                        return new Map();
                                    }
                                    try {
                                        return getActiveDaysForMonthFn(year, month, effectiveProfile, effectiveProducts);
                                    } catch (e) {
                                        return new Map();
                                    }
                                }
                            }),
                        )
                        : null,
                ),
            )
        );
    }

    function AppTabsNav(props) {
        const {
            tab,
            setTab,
            widgetsEditMode,
            defaultTab,
            setDefaultTab,
        } = props;

        return React.createElement(
            'div',
            { className: 'tabs' + (widgetsEditMode ? ' tabs--edit-mode' : '') },
            // Подсказка в режиме редактирования (внутри tabs для абсолютного позиционирования)
            widgetsEditMode && React.createElement(
                'div',
                { className: 'default-tab-hint' },
                React.createElement('span', { className: 'default-tab-hint__icon' }, '🏠'),
                React.createElement('span', { className: 'default-tab-hint__text' }, 'Нажми на вкладку, чтобы сделать её домашней'),
            ),
            // Рацион — доступен на всех устройствах (не домашняя)
            React.createElement(
                'div',
                {
                    className: 'tab ' + (tab === 'ration' ? 'active' : '') + (widgetsEditMode ? ' tab--disabled-home' : ''),
                    onClick: () => !widgetsEditMode && setTab('ration'),
                },
                React.createElement('span', { className: 'tab-icon' }, '📦'),
                React.createElement('span', { className: 'tab-text' }, 'База'),
            ),
            // Виджеты — слева (тройной тап = debug panel)
            React.createElement(
                'div',
                {
                    className: 'tab ' + (tab === 'widgets' ? 'active' : '') + (widgetsEditMode ? ' tab--home-candidate' : '') + (widgetsEditMode && defaultTab === 'widgets' ? ' default-tab-indicator' : ''),
                    id: 'tour-widgets-tab',
                    onClick: () => {
                        if (widgetsEditMode) {
                            setDefaultTab('widgets');
                        } else {
                            window.HEYS?.debugPanel?.handleTap();
                        }
                        setTab('widgets');
                    },
                },
                widgetsEditMode && defaultTab === 'widgets' && React.createElement('span', { className: 'default-home-badge', title: 'Эта вкладка открывается по умолчанию' }, '🏠'),
                React.createElement('span', { className: 'tab-icon' }, '🎛️'),
                React.createElement('span', { className: 'tab-text' }, 'Виджеты'),
            ),
            // iOS Switch группа для stats/diary — ПО ЦЕНТРУ + подписи
            React.createElement(
                'div',
                { className: 'tab-switch-wrapper tab-switch-wrapper--quad' },
                React.createElement(
                    'div',
                    { className: 'tab-switch-group tab-switch-group--quad' },
                    React.createElement(
                        'div',
                        {
                            className: 'tab tab-switch ' + (tab === 'stats' ? 'active' : '') + (widgetsEditMode && defaultTab === 'stats' ? ' default-tab-indicator' : '') + (widgetsEditMode ? ' tab--home-candidate' : ''),
                            id: 'tour-stats-tab',
                            onClick: () => {
                                if (widgetsEditMode) setDefaultTab('stats');
                                setTab('stats');
                            },
                        },
                        // Индикатор домика в режиме редактирования виджетов
                        widgetsEditMode && defaultTab === 'stats' && React.createElement('span', { className: 'default-home-badge', title: 'Эта вкладка открывается по умолчанию' }, '🏠'),
                        React.createElement('span', { className: 'tab-icon' }, '📊'),
                        React.createElement('span', { className: 'tab-text' }, 'Итоги'),
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab tab-switch ' + (tab === 'diary' ? 'active' : '') + (widgetsEditMode && defaultTab === 'diary' ? ' default-tab-indicator' : '') + (widgetsEditMode ? ' tab--home-candidate' : ''),
                            id: 'tour-diary-tab',
                            onClick: () => {
                                if (widgetsEditMode) setDefaultTab('diary');
                                setTab('diary');
                            },
                        },
                        widgetsEditMode && defaultTab === 'diary' && React.createElement('span', { className: 'default-home-badge', title: 'Эта вкладка открывается по умолчанию' }, '🏠'),
                        React.createElement('span', { className: 'tab-icon' }, '🍴'),
                        React.createElement('span', { className: 'tab-text' }, 'Еда'),
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab tab-switch ' + (tab === 'insights' ? 'active' : '') + (widgetsEditMode && defaultTab === 'insights' ? ' default-tab-indicator' : '') + (widgetsEditMode ? ' tab--home-candidate' : ''),
                            id: 'tour-insights-tab',
                            onClick: () => {
                                if (widgetsEditMode) setDefaultTab('insights');
                                setTab('insights');
                            },
                        },
                        widgetsEditMode && defaultTab === 'insights' && React.createElement('span', { className: 'default-home-badge', title: 'Эта вкладка открывается по умолчанию' }, '🏠'),
                        React.createElement('span', { className: 'tab-icon' }, '🔮'),
                        React.createElement('span', { className: 'tab-text' }, 'Инсайты'),
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab tab-switch ' + (tab === 'month' ? 'active' : '') + (widgetsEditMode && defaultTab === 'month' ? ' default-tab-indicator' : '') + (widgetsEditMode ? ' tab--home-candidate' : ''),
                            id: 'tour-month-tab',
                            onClick: () => {
                                if (widgetsEditMode) setDefaultTab('month');
                                setTab('month');
                            },
                        },
                        widgetsEditMode && defaultTab === 'month' && React.createElement('span', { className: 'default-home-badge', title: 'Эта вкладка открывается по умолчанию' }, '🏠'),
                        React.createElement('span', { className: 'tab-icon' }, '📅'),
                        React.createElement('span', { className: 'tab-text' }, 'Месяц'),
                    ),
                ),
                // Подписи под переключателем
                React.createElement(
                    'div',
                    { className: 'tab-switch-labels tab-switch-labels--quad' },
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'stats' ? ' active' : ''), onClick: () => setTab('stats') }, 'Отчёты'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'diary' ? ' active' : ''), onClick: () => setTab('diary') }, 'Дневник'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'insights' ? ' active' : ''), onClick: () => setTab('insights') }, 'Инсайты'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'month' ? ' active' : ''), onClick: () => setTab('month') }, 'Месяц'),
                ),
            ),
            // Советы — кнопка между переключателем и настройками
            React.createElement(
                'div',
                {
                    className: 'tab tab-advice' + (widgetsEditMode ? ' tab--disabled-home' : ''),
                    onClick: () => {
                        // Переключаемся на stats если не там, и показываем советы
                        if (tab !== 'stats' && tab !== 'diary') {
                            setTab('stats');
                        }
                        // Триггерим показ советов через глобальный event
                        window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                    },
                },
                React.createElement('span', { className: 'tab-icon' }, '💡'),
                React.createElement('span', { className: 'tab-advice-badge', id: 'nav-advice-badge' }),
            ),
            // Настройки — справа
            React.createElement(
                'div',
                {
                    className: 'tab ' + (tab === 'user' ? 'active' : '') + (widgetsEditMode ? ' tab--disabled-home' : ''),
                    onClick: () => setTab('user'),
                },
                React.createElement('span', { className: 'tab-icon' }, '⚙️'),
                React.createElement('span', { className: 'tab-text' }, 'Настройки'),
            ),
        );
    }

    function AppTabContent(props) {
        const {
            tab,
            slideDirection,
            edgeBounce,
            onTouchStart,
            onTouchEnd,
            syncVer,
            clientId,
            setTab,
            products,
            setProducts,
            selectedDate,
            setSelectedDate,
            DayTabWithCloudSync,
            RationTabWithCloudSync,
            UserTabWithCloudSync,
        } = props;

        return React.createElement(
            'div',
            {
                className: 'tab-content-swipeable' +
                    (slideDirection === 'out-left' ? ' slide-out-left' : '') +
                    (slideDirection === 'out-right' ? ' slide-out-right' : '') +
                    (slideDirection === 'in-left' ? ' slide-in-left' : '') +
                    (slideDirection === 'in-right' ? ' slide-in-right' : '') +
                    (edgeBounce === 'left' ? ' edge-bounce-left' : '') +
                    (edgeBounce === 'right' ? ' edge-bounce-right' : ''),
                onTouchStart: onTouchStart,
                onTouchEnd: onTouchEnd,
            },
            // Edge indicators
            edgeBounce && React.createElement('div', {
                className: 'edge-indicator ' + edgeBounce
            }),
            tab === 'ration'
                ? React.createElement(RationTabWithCloudSync, {
                    key: 'ration' + syncVer + '_' + String(clientId || ''),
                    products,
                    setProducts,
                    clientId,
                })
                : tab === 'insights'
                    ? (window.HEYS?.PredictiveInsights?.components?.InsightsTab
                        ? React.createElement(window.HEYS.PredictiveInsights.components.InsightsTab, {
                            key: 'insights' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                            lsGet: window.HEYS?.utils?.lsGet,
                            profile: null,
                            pIndex: null,
                            optimum: null,
                            selectedDate: selectedDate,
                        })
                        : React.createElement('div', { style: { padding: 16 } },
                            React.createElement('div', { className: 'skeleton-sparkline', style: { height: 160, marginBottom: 16 } }),
                            React.createElement('div', { className: 'skeleton-block', style: { height: 100 } })
                        ))
                    : tab === 'month'
                        ? (window.HEYS?.ReportsTab
                            ? React.createElement(window.HEYS.ReportsTab, {
                                key: 'month' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                                selectedDate,
                                setSelectedDate,
                                clientId,
                            })
                            : React.createElement('div', { style: { padding: 16 } },
                                React.createElement('div', { className: 'skeleton-sparkline', style: { height: 160, marginBottom: 16 } }),
                                React.createElement('div', { className: 'skeleton-block', style: { height: 100 } })
                            ))
                        : (tab === 'stats' || tab === 'diary')
                            ? React.createElement(DayTabWithCloudSync, {
                                key: 'day' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                                products,
                                clientId,
                                selectedDate,
                                setSelectedDate,
                                subTab: tab,
                            })
                            : tab === 'user'
                                ? React.createElement(UserTabWithCloudSync, {
                                    key: 'user' + syncVer + '_' + String(clientId || ''),
                                    clientId,
                                })
                                : tab === 'overview'
                                    ? (window.HEYS && window.HEYS.DataOverviewTab
                                        ? React.createElement(window.HEYS.DataOverviewTab, {
                                            key: 'overview' + syncVer + '_' + String(clientId || ''),
                                            clientId,
                                            setTab,
                                            setSelectedDate,
                                        })
                                        : React.createElement('div', { style: { padding: 16 } },
                                            React.createElement('div', { className: 'skeleton-sparkline', style: { height: 80, marginBottom: 16 } }),
                                            React.createElement('div', { className: 'skeleton-block', style: { height: 100 } })
                                        ))
                                    : tab === 'widgets'
                                        ? (window.HEYS && window.HEYS.Widgets && window.HEYS.Widgets.WidgetsTab
                                            ? React.createElement(window.HEYS.Widgets.WidgetsTab, {
                                                key: 'widgets' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                                                clientId,
                                                selectedDate,
                                                setTab,
                                                setSelectedDate,
                                            })
                                            : React.createElement('div', { style: { padding: 16 } },
                                                React.createElement('div', { className: 'skeleton-sparkline', style: { height: 80, marginBottom: 16 } }),
                                                React.createElement('div', { className: 'skeleton-block', style: { height: 100 } })
                                            ))
                                        : React.createElement('div', { style: { padding: 16 } },
                                            React.createElement('div', { className: 'skeleton-header', style: { width: 150, marginBottom: 16 } }),
                                            React.createElement('div', { className: 'skeleton-block', style: { height: 200 } })
                                        )
        );
    }

    function AppShell(props) {
        const { hideContent } = props;

        return React.createElement(
            'div',
            {
                className: 'wrap',
                style: hideContent ? { display: 'none' } : undefined
            },
            React.createElement(AppHeader, props),
            React.createElement(AppTabsNav, props),
            React.createElement(AppTabContent, props)
        );
    }

    HEYS.AppShell = {
        AppShell,
        AppHeader,
        AppTabsNav,
        AppTabContent,
    };
})();
