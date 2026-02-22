// heys_app_shell_v1.js — App header + navigation shell

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;
    const U = HEYS.utils || {};

    const tryParseStoredValue = (raw, fallback) => {
        if (raw === null || raw === undefined) return fallback;
        if (typeof raw === 'string') {
            let str = raw;
            if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
                try { str = HEYS.store.decompress(str); } catch (_) { }
            }
            try { return JSON.parse(str); } catch (_) { return str; }
        }
        return raw;
    };

    const readGlobalValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) {
                    return tryParseStoredValue(stored, fallback);
                }
            }
            const raw = localStorage.getItem(key);
            if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
            if (U.lsGet) return U.lsGet(key, fallback);
            return fallback;
        } catch {
            return fallback;
        }
    };

    const writeGlobalValue = (key, value) => {
        try {
            if (HEYS.store?.set) {
                HEYS.store.set(key, value);
                return;
            }
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, serialized);
        } catch { }
    };

    const removeGlobalValue = (key) => {
        try {
            if (HEYS.store?.set) HEYS.store.set(key, null);
        } catch { }
        try { localStorage.removeItem(key); } catch { }
    };

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

        // 🚨 EWS Badge State (v1.0)
        const [ewsData, setEWSData] = React.useState(null);
        const clientDropdownAnchorRef = React.useRef(null);
        const [clientDropdownMaxHeight, setClientDropdownMaxHeight] = React.useState(320);

        React.useEffect(() => {
            if (!showClientDropdown) return;

            const updateClientDropdownHeight = () => {
                try {
                    const anchorRect = clientDropdownAnchorRef.current?.getBoundingClientRect?.();
                    const tabsRect = document.querySelector('.tabs')?.getBoundingClientRect?.();
                    const viewportHeight = window.visualViewport?.height || window.innerHeight || 800;

                    const dropdownTop = (anchorRect?.bottom || 120) + 8;
                    const tabsHeight = Math.max(56, Math.ceil(tabsRect?.height || 0));
                    const bottomGapAboveMenu = tabsHeight + 12;
                    const calculatedMaxHeight = Math.floor(viewportHeight - dropdownTop - bottomGapAboveMenu);
                    const clampedMaxHeight = Math.max(220, calculatedMaxHeight);

                    setClientDropdownMaxHeight(clampedMaxHeight);

                    console.info('[HEYS.header.clientDropdown] ✅ Calculated dropdown max height:', {
                        viewportHeight,
                        dropdownTop,
                        tabsHeight,
                        bottomGapAboveMenu,
                        maxHeight: clampedMaxHeight,
                        scrollAreaMaxHeight: Math.max(120, clampedMaxHeight - 128),
                        clientsCount: Array.isArray(clients) ? clients.length : 0,
                    });
                } catch (err) {
                    console.warn('[HEYS.header.clientDropdown] ⚠️ Failed to calculate dropdown max height:', err?.message);
                    setClientDropdownMaxHeight(320);
                }
            };

            updateClientDropdownHeight();
            window.addEventListener('resize', updateClientDropdownHeight);
            window.visualViewport?.addEventListener?.('resize', updateClientDropdownHeight);

            return () => {
                window.removeEventListener('resize', updateClientDropdownHeight);
                window.visualViewport?.removeEventListener?.('resize', updateClientDropdownHeight);
            };
        }, [showClientDropdown, clients]);

        // Load EWS data on mount and when date changes
        React.useEffect(() => {
            console.info('ews / badge 🔄 useEffect triggered');

            const loadEWSData = async (retryCount = 0) => {
                try {
                    console.info('ews / badge 🚀 loadEWSData started', { attempt: retryCount + 1 });

                    // Debug: проверка структуры HEYS объекта
                    console.info('ews / badge 🔍 HEYS state:', {
                        hasHEYS: typeof HEYS !== 'undefined',
                        hasInsightsPI: typeof HEYS?.InsightsPI !== 'undefined',
                        hasEarlyWarning: typeof HEYS?.InsightsPI?.earlyWarning !== 'undefined',
                        hasDetect: typeof HEYS?.InsightsPI?.earlyWarning?.detect === 'function',
                        version: HEYS?.InsightsPI?.earlyWarning?.version || 'unknown'
                    });

                    if (!HEYS?.InsightsPI?.earlyWarning?.detect) {
                        // Retry with exponential backoff (max 3 attempts)
                        if (retryCount < 3) {
                            const delay = Math.min(1000 * Math.pow(2, retryCount), 4000);
                            console.warn(`ews / badge ⏳ EWS module not ready, retry in ${delay}ms (attempt ${retryCount + 1}/3)`);
                            setTimeout(() => loadEWSData(retryCount + 1), delay);
                            return;
                        }
                        console.error('ews / badge ❌ EWS module not available after 3 attempts');
                        setEWSData(null);
                        return;
                    }

                    console.info('ews / badge ✅ EWS module detected');

                    // Load 7 days of data (ACUTE mode: current state alerts only)
                    const days = [];
                    for (let i = 0; i < 7; i++) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const dateStr = formatLocalISO(d);
                        const U = HEYS.utils || {};
                        const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateStr}`) : null;
                        if (dayData) days.push({ ...dayData, date: dateStr });
                    }

                    console.info('ews / badge 📦 Days loaded:', days.length);

                    if (days.length < 3) {
                        console.info('ews / badge ⏸️ Insufficient data:', days.length, 'days (need 3+)');
                        setEWSData(null);
                        return;
                    }

                    const profile = cachedProfile || HEYS.store?.get?.('heys_profile') || null;
                    const pIndex = products || HEYS.products?.getAll?.() || [];

                    console.info('ews / badge 📤 calling detect:', {
                        mode: 'acute',
                        daysCount: days.length,
                        hasProfile: !!profile,
                        pIndexCount: pIndex?.length || 0,
                        checksExpected: 10
                    });

                    const result = await HEYS.InsightsPI.earlyWarning.detect(days, profile, pIndex, {
                        mode: 'acute',
                        includeDetails: true
                    });

                    if (result.available) {
                        setEWSData(result);
                        if (result.count > 0) {
                            console.info('ews / badge ✅ Badge data loaded:', {
                                count: result.count,
                                high: result.highSeverityCount,
                                medium: result.count - result.highSeverityCount,
                                daysAnalyzed: days.length,
                                hasWarnings: Array.isArray(result.warnings) && result.warnings.length > 0,
                            });
                        } else {
                            console.info('ews / badge ✅ All OK (no warnings):', {
                                daysAnalyzed: days.length,
                                status: 'healthy'
                            });
                        }
                    } else {
                        setEWSData(null);
                        console.info('ews / badge ℹ️ EWS unavailable:', {
                            reason: result.reason || 'insufficient_data',
                            daysAnalyzed: days.length,
                        });
                    }
                } catch (err) {
                    console.warn('ews / badge ⚠️ Failed to load EWS data:', err.message);
                    setEWSData(null);
                }
            };

            // Listen for EWS module ready event (fired by pi_early_warning.js on load)
            const handleEWSReady = (event) => {
                console.info('ews / badge 📡 heys-ews-ready event received:', event.detail);
                loadEWSData(); // Immediately load data when module becomes available
            };
            window.addEventListener('heys-ews-ready', handleEWSReady);

            loadEWSData();

            // Reload on day-data-changed event
            const handleDayDataChanged = () => loadEWSData();
            window.addEventListener('day-data-changed', handleDayDataChanged);

            // Reload after sync complete
            const handleSyncComplete = () => {
                setTimeout(loadEWSData, 500); // Small delay to ensure data is written
            };
            window.addEventListener('heys-sync-complete', handleSyncComplete);

            // Reload every 5 minutes
            const interval = setInterval(loadEWSData, 5 * 60 * 1000);

            return () => {
                window.removeEventListener('heys-ews-ready', handleEWSReady);
                window.removeEventListener('day-data-changed', handleDayDataChanged);
                window.removeEventListener('heys-sync-complete', handleSyncComplete);
                clearInterval(interval);
            };
        }, [selectedDate, clientId]);

        const haptic = HEYS?.haptic || (() => { });
        const pad2 = (n) => String(n).padStart(2, '0');
        const formatLocalISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const shiftISO = (iso, delta) => {
            if (!iso) return null;
            const d = new Date(iso + 'T12:00:00');
            d.setDate(d.getDate() + delta);
            return formatLocalISO(d);
        };
        const getDefaultPrefetchDates = (nextDate) => {
            const dates = [nextDate, shiftISO(nextDate, -1), shiftISO(nextDate, 1)];
            return Array.from(new Set(dates.filter(Boolean)));
        };

        const selectDateWithPrefetch = (nextDate, options = {}) => {
            if (!nextDate) return;
            const prefetchDates = Array.isArray(options.prefetchDates) && options.prefetchDates.length
                ? options.prefetchDates
                : getDefaultPrefetchDates(nextDate);

            try {
                if (HEYS?.Day?.requestFlush) HEYS.Day.requestFlush({ force: true });
            } catch (e) { }

            const applyDate = () => {
                setSelectedDate(nextDate);
                haptic('light');
            };

            if (HEYS?.cloud?.fetchDays && prefetchDates.length > 0) {
                HEYS.cloud.fetchDays(prefetchDates)
                    .then(() => applyDate())
                    .catch(() => applyDate());
                return;
            }

            applyDate();
        };

        const clientListMaxHeight = Math.max(120, clientDropdownMaxHeight - 128);

        if (!clientId) return null;

        // 🆕 v2.0: Network Status Indicator
        const renderNetworkStatus = () => {
            if (cloudStatus === 'offline') {
                return React.createElement('div', { className: 'network-status network-status--offline', title: 'Офлайн (данные сохранены локально)' },
                    React.createElement('span', { className: 'network-status__dot' }),
                    React.createElement('span', { className: 'network-status__text' }, 'Офлайн')
                );
            }
            if (syncProgress || pendingCount > 0) {
                return React.createElement('div', { className: 'network-status network-status--syncing', title: `Синхронизация... Осталось: ${pendingCount}` },
                    React.createElement('span', { className: 'network-status__dot network-status__dot--pulse' }),
                    React.createElement('span', { className: 'network-status__text' }, 'Синхронизация')
                );
            }
            return React.createElement('div', { className: 'network-status network-status--online', title: 'Синхронизировано' },
                React.createElement('span', { className: 'network-status__icon' }, '✓')
            );
        };

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
                    { className: 'hdr-client', style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }, ref: clientDropdownAnchorRef },
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
                    // Индикатор сети
                    renderNetworkStatus(),
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
                                maxHeight: clientDropdownMaxHeight,
                                overflow: 'hidden',
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
                                // Список клиентов (скролл только для списка)
                                React.createElement(
                                    'div',
                                    {
                                        key: 'client-list-scroll',
                                        className: 'client-dropdown-scroll-list',
                                        style: {
                                            maxHeight: clientListMaxHeight,
                                            overflowY: 'auto',
                                            overflowX: 'hidden',
                                            overscrollBehavior: 'contain'
                                        }
                                    },
                                    [...clients]
                                        .sort((a, b) => {
                                            const lastA = readGlobalValue('heys_last_client_id', '') === a.id ? 1 : 0;
                                            const lastB = readGlobalValue('heys_last_client_id', '') === b.id ? 1 : 0;
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
                                                            console.info(`[HEYS.store] 🔄 Выбор клиента: ${c.name} (${c.id.slice(0, 8)}...)`);
                                                            if (HEYS.cloud && HEYS.cloud.switchClient) {
                                                                await HEYS.cloud.switchClient(c.id);
                                                            } else {
                                                                U.lsSet('heys_client_current', c.id);
                                                            }
                                                            writeGlobalValue('heys_last_client_id', c.id);
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
                                        )
                                ),
                                // Нижний блок действий (визуально закреплённый)
                                React.createElement(
                                    'div',
                                    {
                                        key: 'sticky-actions',
                                        className: 'client-dropdown-sticky-actions'
                                    },
                                    // Кнопка "Все клиенты"
                                    React.createElement(
                                        'div',
                                        {
                                            key: 'all-clients',
                                            className: 'client-dropdown-sticky-btn client-dropdown-sticky-btn--all',
                                            style: {
                                                padding: '10px 16px 12px',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                fontSize: 14
                                            },
                                            onClick: () => {
                                                if (window.HEYS) {
                                                    window.HEYS.currentClientId = null;
                                                    if (window.HEYS.store?.flushMemory) {
                                                        window.HEYS.store.flushMemory();
                                                    }
                                                }
                                                removeGlobalValue('heys_client_current');
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
                                            className: 'client-dropdown-sticky-btn client-dropdown-sticky-btn--logout',
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
                                            className: 'client-dropdown-sticky-email',
                                            style: { fontSize: 11, marginBottom: 4 }
                                        }, cloudUser?.email || ''),
                                        React.createElement('span', {
                                            className: 'client-dropdown-sticky-logout-label'
                                        }, '🚪 Выйти')
                                    )
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
                    })
                ),
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
                }),                    // 🚨 EWS Badge (v1.3 - показывает актуальные предупреждения без ручного скрытия)
                ewsData && React.createElement('div', {
                    className: 'ews-badge' + (
                        ewsData.count === 0 ? ' ews-badge--ok' :
                            ewsData.highSeverityCount > 0 ? ' ews-badge--high' : ' ews-badge--medium'
                    ),
                    title: (() => {
                        if (ewsData.count === 0) {
                            return '✅ Early Warning System: все показатели в норме';
                        }
                        const high = ewsData.highSeverityCount || 0;
                        const medium = ewsData.count - high;
                        const parts = [];
                        if (high > 0) parts.push(`${high} критич.`);
                        if (medium > 0) parts.push(`${medium} предупр.`);
                        return `⚠️ Early Warning System: ${parts.join(', ')}`;
                    })(),
                    onClick: () => {
                        haptic('medium');
                        if (ewsData.count === 0) {
                            console.info('ews / badge ✅ Badge clicked (all ok) → opening panel globally');
                        } else {
                            console.info('ews / badge 🚨 Badge clicked → opening panel globally (acute mode)');
                        }
                        // Отправляем событие с warnings для глобального менеджера панели
                        window.dispatchEvent(new CustomEvent('heysShowEWSPanel', {
                            detail: {
                                warnings: ewsData.warnings || [],
                                mode: 'acute'
                            }
                        }));
                    }
                }, [
                    React.createElement('span', { className: 'ews-badge__icon' }, ewsData.count === 0 ? '✅' : '⚠️'),
                    ewsData.count > 0 && React.createElement('span', { className: 'ews-badge__count' }, ewsData.count)
                ]),                    // Кнопки "Вчера" + "Сегодня" + DatePicker
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
                                const nextDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                selectDateWithPrefetch(nextDate, { reason: 'quick-yesterday' });
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
                            onClick: () => selectDateWithPrefetch(todayISO(), { reason: 'quick-today' }),
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
                            onSelect: (nextDate) => selectDateWithPrefetch(nextDate, { reason: 'date-picker' }),
                            onRemove: () => {
                                selectDateWithPrefetch(todayISO(), { reason: 'date-picker-clear' });
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
                    : null
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
            clientId,
            selectedDate,
        } = props;

        const [settingsMenuOpen, setSettingsMenuOpen] = React.useState(false);

        React.useEffect(() => {
            if (settingsMenuOpen) setSettingsMenuOpen(false);
        }, [tab]);

        // Инициализация CRS для прогресс-бара, если он еще не был вычислен
        React.useEffect(() => {
            if (!window.HEYS?._lastCrs && window.HEYS?.CascadeCard?.computeCascadeState && clientId) {
                try {
                    const dateStr = selectedDate || window.HEYS.utils.getTodayStr();
                    const day = window.HEYS.utils.lsGet('heys_dayv2_' + dateStr, {});
                    const dayTot = window.HEYS.utils.lsGet('heys_dayTot_' + dateStr, {});
                    const normAbs = window.HEYS.utils.lsGet('heys_normAbs', {});
                    const prof = window.HEYS.utils.lsGet('heys_profile', {});
                    const pIndex = window.HEYS.products?.getIndex ? window.HEYS.products.getIndex() : {};
                    window.HEYS.CascadeCard.computeCascadeState(day, dayTot, normAbs, prof, pIndex);
                } catch (e) {
                    console.warn('[HEYS.AppTabsNav] Failed to init CRS:', e);
                }
            }
        }, [clientId, selectedDate]);

        return React.createElement(
            'div',
            { className: 'tabs' + (widgetsEditMode ? ' tabs--edit-mode' : '') + (settingsMenuOpen ? ' tabs--settings-open' : '') },
            // Подсказка в режиме редактирования (внутри tabs для абсолютного позиционирования)
            widgetsEditMode && React.createElement(
                'div',
                { className: 'default-tab-hint' },
                React.createElement('span', { className: 'default-tab-hint__icon' }, '🏠'),
                React.createElement('span', { className: 'default-tab-hint__text' }, 'Нажми на вкладку, чтобы сделать её домашней'),
            ),
            // Советы — первая кнопка в меню
            React.createElement(
                'div',
                {
                    className: 'tab tab-advice' + (widgetsEditMode ? ' tab--disabled-home' : ''),
                    onClick: () => {
                        if (tab !== 'stats' && tab !== 'diary') {
                            setTab('stats');
                        }
                        window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                    },
                },
                React.createElement('span', { className: 'tab-icon' }, '💡'),
                React.createElement('span', { className: 'tab-advice-badge', id: 'nav-advice-badge' }),
            ),
            // iOS Switch группа для stats/diary/widgets/insights/month — ПО ЦЕНТРУ + подписи
            React.createElement(
                'div',
                { className: 'tab-switch-wrapper tab-switch-wrapper--quint' },
                React.createElement(
                    'div',
                    { className: 'tab-switch-group tab-switch-group--quint' },
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
                            className: 'tab tab-switch ' + (tab === 'widgets' ? 'active' : '') + (widgetsEditMode && defaultTab === 'widgets' ? ' default-tab-indicator' : '') + (widgetsEditMode ? ' tab--home-candidate' : ''),
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
                    { className: 'tab-switch-labels tab-switch-labels--quint' },
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'stats' ? ' active' : ''), onClick: () => setTab('stats') }, 'Отчёты'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'diary' ? ' active' : ''), onClick: () => setTab('diary') }, 'Дневник'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'widgets' ? ' active' : ''), onClick: () => setTab('widgets') }, 'Виджеты'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'insights' ? ' active' : ''), onClick: () => setTab('insights') }, 'Инсайты'),
                    React.createElement('span', { className: 'tab-switch-label' + (tab === 'month' ? ' active' : ''), onClick: () => setTab('month') }, 'Месяц'),
                ),
            ),
            // Настройки — раскрывающееся меню вверх
            React.createElement(
                'div',
                { className: 'tab-settings-wrap' },
                settingsMenuOpen && React.createElement('div', {
                    className: 'tab-settings-backdrop',
                    onClick: () => setSettingsMenuOpen(false)
                }),
                React.createElement(
                    'div',
                    {
                        className: 'tab ' + (tab === 'user' ? 'active' : '') + (widgetsEditMode ? ' tab--disabled-home' : ''),
                        onClick: () => {
                            if (widgetsEditMode) return;
                            setSettingsMenuOpen(!settingsMenuOpen);
                        },
                    },
                    React.createElement('span', { className: 'tab-icon' }, '⚙️'),
                    React.createElement('span', { className: 'tab-text' }, 'Настройки'),
                ),
                settingsMenuOpen && React.createElement(
                    'div',
                    { className: 'tab-settings-menu' },
                    React.createElement(
                        'div',
                        {
                            className: 'tab-settings-item',
                            onClick: () => {
                                setSettingsMenuOpen(false);
                                setTab('user');
                            }
                        },
                        React.createElement('span', { className: 'tab-settings-icon' }, '⚙️'),
                        React.createElement('span', null, 'Настройки')
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab-settings-item',
                            onClick: () => {
                                setSettingsMenuOpen(false);
                                setTab('ration');
                            }
                        },
                        React.createElement('span', { className: 'tab-settings-icon' }, '📦'),
                        React.createElement('span', null, 'Список продуктов')
                    )
                )
            ),
            // CRS Progress Bar (v3.1.0)
            window.HEYS?.CascadeCard?.CrsProgressBar && React.createElement(window.HEYS.CascadeCard.CrsProgressBar)
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

    // Memoize sub-components before AppShell uses them
    const MemoAppHeader = React.memo(AppHeader);
    MemoAppHeader.displayName = 'AppHeader';

    const MemoAppTabsNav = React.memo(AppTabsNav);
    MemoAppTabsNav.displayName = 'AppTabsNav';

    const MemoAppTabContent = React.memo(AppTabContent);
    MemoAppTabContent.displayName = 'AppTabContent';

    function AppShell(props) {
        const { hideContent, clientId } = props;
        const shouldRenderContent = !!clientId;

        return React.createElement(
            'div',
            {
                className: 'wrap',
                style: hideContent ? { display: 'none' } : undefined
            },
            shouldRenderContent && React.createElement(MemoAppHeader, props),
            shouldRenderContent && React.createElement(MemoAppTabsNav, props),
            shouldRenderContent && React.createElement(MemoAppTabContent, props),
            shouldRenderContent && React.createElement(
                'div',
                { className: 'text-center text-[11px] text-slate-400 pb-6 pt-2' },
                'Версия ' + (HEYS.version || window.APP_VERSION || 'dev')
            )
        );
    }

    const MemoAppShell = React.memo(AppShell);
    MemoAppShell.displayName = 'AppShell';

    HEYS.AppShell = {
        AppShell: MemoAppShell,
        AppHeader: MemoAppHeader,
        AppTabsNav: MemoAppTabsNav,
        AppTabContent: MemoAppTabContent,
    };
})();
