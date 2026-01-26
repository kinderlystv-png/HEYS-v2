// heys_app_gate_flow_v1.js — Gate flow UI (login, client select, desktop/consents)

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

    function buildGate(props) {
        const {
            clientId,
            isInitializing,
            cloudUser,
            clients,
            clientsSource,
            clientSearch,
            setClientSearch,
            setClientId,
            cloudSignIn,
            handleSignOut,
            U,
            getClientStats,
            formatLastActive,
            getAvatarColor,
            getClientInitials,
            renameClient,
            removeClient,
            addClientToCloud,
            newName,
            setNewName,
            newPhone,
            setNewPhone,
            newPin,
            setNewPin,
            curatorTab,
            setCuratorTab,
        } = props;

        const gate = !clientId
            ? (isInitializing
                ? React.createElement(HEYS.AppLoader, {
                    message: 'Загрузка...',
                    subtitle: 'Подключение к серверу'
                })
                : !cloudUser
                    ? React.createElement(
                        HEYS.LoginScreen,
                        {
                            initialMode: 'client',
                            onCuratorLogin: async ({ email, password }) => {
                                const res = await cloudSignIn(email, password, { rememberMe: true });
                                return res && res.error ? { error: res.error } : { ok: true };
                            },
                            onClientLogin: async ({ phone, pin }) => {
                                const auth = HEYS && HEYS.auth;
                                const fn = auth && auth.loginClient;
                                const res = fn ? await fn({ phone, pin }) : { ok: false, error: 'cloud_not_ready' };
                                if (res && res.ok && res.clientId) {
                                    try {
                                        if (HEYS.cloud && HEYS.cloud.switchClient) {
                                            await HEYS.cloud.switchClient(res.clientId);
                                        } else {
                                            U.lsSet('heys_client_current', res.clientId);
                                        }
                                        writeGlobalValue('heys_last_client_id', res.clientId);
                                        // 📱 Сохраняем телефон для ПЭП (SMS-верификация согласий)
                                        try {
                                            const phoneNorm = HEYS.auth?.normalizePhone?.(phone) || phone;
                                            writeGlobalValue('heys_client_phone', phoneNorm);
                                        } catch (_) { }
                                        setClientId(res.clientId);
                                    } catch (_) { }
                                }
                                return res;
                            },
                        }
                    )
                    : React.createElement(
                        'div',
                        { className: 'modal-backdrop', style: { background: 'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)' } },
                        React.createElement(
                            'div',
                            {
                                className: 'modal client-select-modal',
                                style: {
                                    maxWidth: 420,
                                    padding: '28px 24px',
                                    borderRadius: 20,
                                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                                }
                            },
                            React.createElement(
                                React.Fragment,
                                null,
                                // Заголовок
                                React.createElement(
                                    'div',
                                    { style: { textAlign: 'center', marginBottom: 20 } },
                                    React.createElement('div', {
                                        style: { fontSize: 32, marginBottom: 8 }
                                    }, '👥'),
                                    React.createElement(
                                        'div',
                                        { style: { fontSize: 20, fontWeight: 700, color: 'var(--text)' } },
                                        'Выберите клиента'
                                    ),
                                    React.createElement(
                                        'div',
                                        { style: { fontSize: 14, color: 'var(--muted)', marginTop: 4 } },
                                        clientsSource === 'loading'
                                            ? '⏳ Загрузка...'
                                            : clientsSource === 'error'
                                                ? '⚠️ Ошибка загрузки'
                                                : clientsSource === 'cache'
                                                    ? `${clients.length} клиентов (из кэша)`
                                                    : clients.length
                                                        ? `${clients.length} клиентов`
                                                        : 'Пока нет клиентов'
                                    ),
                                    // Предупреждение если из кэша
                                    clientsSource === 'cache' && React.createElement(
                                        'div',
                                        {
                                            style: {
                                                fontSize: 12,
                                                color: '#f59e0b',
                                                marginTop: 8,
                                                padding: '6px 12px',
                                                background: 'rgba(245, 158, 11, 0.1)',
                                                borderRadius: 8
                                            }
                                        },
                                        '☁️ Синхронизация с облаком...'
                                    ),
                                    clientsSource === 'error' && React.createElement(
                                        'div',
                                        {
                                            style: {
                                                fontSize: 12,
                                                color: '#ef4444',
                                                marginTop: 8,
                                                padding: '6px 12px',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                borderRadius: 8
                                            }
                                        },
                                        '❌ Не удалось загрузить клиентов из облака'
                                    ),
                                    // 🆕 Табы: Клиенты / Очередь триалов
                                    React.createElement(
                                        'div',
                                        {
                                            style: {
                                                display: 'flex',
                                                gap: 8,
                                                marginTop: 16,
                                                padding: 4,
                                                background: 'var(--surface)',
                                                borderRadius: 12
                                            }
                                        },
                                        React.createElement(
                                            'button',
                                            {
                                                onClick: () => setCuratorTab('clients'),
                                                style: {
                                                    flex: 1,
                                                    padding: '10px 16px',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    fontSize: 14,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: curatorTab === 'clients' ? 'var(--accent)' : 'transparent',
                                                    color: curatorTab === 'clients' ? '#fff' : 'var(--text)'
                                                }
                                            },
                                            '👥 Клиенты'
                                        ),
                                        React.createElement(
                                            'button',
                                            {
                                                onClick: () => setCuratorTab('queue'),
                                                style: {
                                                    flex: 1,
                                                    padding: '10px 16px',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    fontSize: 14,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: curatorTab === 'queue' ? 'var(--accent)' : 'transparent',
                                                    color: curatorTab === 'queue' ? '#fff' : 'var(--text)'
                                                }
                                            },
                                            '📋 Очередь'
                                        )
                                    )
                                ),
                                // === TAB: CLIENTS ===
                                curatorTab === 'clients' && React.createElement(React.Fragment, null,
                                    // Поиск клиентов (если > 3)
                                    clients.length > 3 && React.createElement('div', {
                                        style: { position: 'relative', marginBottom: 16 }
                                    },
                                        React.createElement('span', {
                                            style: {
                                                position: 'absolute',
                                                left: 14,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                fontSize: 16,
                                                opacity: 0.5
                                            }
                                        }, '🔍'),
                                        React.createElement('input', {
                                            type: 'text',
                                            placeholder: 'Поиск клиента...',
                                            value: clientSearch || '',
                                            onChange: (e) => setClientSearch(e.target.value),
                                            style: {
                                                width: '100%',
                                                padding: '12px 12px 12px 42px',
                                                borderRadius: 12,
                                                border: '2px solid var(--border)',
                                                fontSize: 15,
                                                outline: 'none'
                                            }
                                        })
                                    ),
                                    // Список клиентов
                                    React.createElement(
                                        'div',
                                        {
                                            style: {
                                                maxHeight: 320,
                                                overflow: 'auto',
                                                marginBottom: 16,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8
                                            }
                                        },
                                        clients.length
                                            ? clients
                                                .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                                .map((c, idx) => {
                                                    const stats = getClientStats(c.id);
                                                    const isLast = readGlobalValue('heys_last_client_id', '') === c.id;
                                                    const copyClientId = async (e) => {
                                                        if (e && e.stopPropagation) e.stopPropagation();
                                                        try {
                                                            if (navigator?.clipboard?.writeText) {
                                                                await navigator.clipboard.writeText(c.id);
                                                                HEYS.Toast?.success?.('ID скопирован');
                                                                return;
                                                            }
                                                        } catch (err) {
                                                            HEYS.analytics?.trackError?.(err, { context: 'copy_client_id', clientId: c.id });
                                                        }

                                                        try {
                                                            const temp = document.createElement('textarea');
                                                            temp.value = c.id;
                                                            temp.setAttribute('readonly', '');
                                                            temp.style.position = 'absolute';
                                                            temp.style.left = '-9999px';
                                                            document.body.appendChild(temp);
                                                            temp.select();
                                                            document.execCommand('copy');
                                                            document.body.removeChild(temp);
                                                            HEYS.Toast?.success?.('ID скопирован');
                                                        } catch (err) {
                                                            HEYS.analytics?.trackError?.(err, { context: 'copy_client_id_fallback', clientId: c.id });
                                                            HEYS.Toast?.warning?.('Не удалось скопировать ID') || alert('Не удалось скопировать ID');
                                                        }
                                                    };
                                                    return React.createElement(
                                                        'div',
                                                        {
                                                            key: c.id,
                                                            className: 'client-card',
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 12,
                                                                padding: '12px 14px',
                                                                borderRadius: 14,
                                                                background: 'var(--card)',
                                                                border: isLast ? '2px solid #4285f4' : '2px solid var(--border)',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                animation: `fadeSlideIn 0.3s ease ${idx * 0.05}s both`
                                                            },
                                                            onClick: async () => {
                                                                // Безопасное переключение с синхронизацией
                                                                if (HEYS.cloud && HEYS.cloud.switchClient) {
                                                                    await HEYS.cloud.switchClient(c.id);
                                                                } else {
                                                                    U.lsSet('heys_client_current', c.id);
                                                                }
                                                                // Сохраняем как последнего выбранного
                                                                writeGlobalValue('heys_last_client_id', c.id);
                                                                setClientId(c.id);
                                                                window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId: c.id } }));
                                                            }
                                                        },
                                                        // Аватар с цветом по букве
                                                        React.createElement(
                                                            'div',
                                                            {
                                                                style: {
                                                                    width: 48,
                                                                    height: 48,
                                                                    borderRadius: '50%',
                                                                    background: getAvatarColor(c.name),
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: '#fff',
                                                                    fontWeight: 700,
                                                                    fontSize: 18,
                                                                    flexShrink: 0,
                                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                                                }
                                                            },
                                                            getClientInitials(c.name)
                                                        ),
                                                        // Инфо + статистика
                                                        React.createElement(
                                                            'div',
                                                            { style: { flex: 1, minWidth: 0 } },
                                                            React.createElement(
                                                                'div',
                                                                { style: { fontWeight: 600, fontSize: 15, color: 'var(--text)' } },
                                                                c.name
                                                            ),
                                                            // Телефон (если есть)
                                                            c.phone_normalized && React.createElement(
                                                                'div',
                                                                { style: { fontSize: 13, color: 'var(--muted)', marginTop: 2 } },
                                                                '📱 ' + c.phone_normalized
                                                            ),
                                                            React.createElement(
                                                                'div',
                                                                { style: { fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' } },
                                                                // Последний визит
                                                                stats.lastActiveDate && React.createElement('span', null,
                                                                    '📅 ' + formatLastActive(stats.lastActiveDate)
                                                                ),
                                                                // Streak
                                                                stats.streak > 0 && React.createElement('span', {
                                                                    style: { color: stats.streak >= 3 ? '#22c55e' : 'var(--muted)' }
                                                                },
                                                                    '🔥 ' + stats.streak + ' дн.'
                                                                ),
                                                                // Метка "Последний"
                                                                isLast && React.createElement('span', {
                                                                    style: { color: '#4285f4', fontWeight: 500 }
                                                                }, '✓')
                                                            )
                                                        ),
                                                        // Кнопки действий
                                                        React.createElement(
                                                            'div',
                                                            {
                                                                style: { display: 'flex', gap: 4 },
                                                                onClick: (e) => e.stopPropagation() // Не срабатывать на родителе
                                                            },
                                                            React.createElement(
                                                                'button',
                                                                {
                                                                    className: 'btn-icon',
                                                                    title: 'Скопировать ID',
                                                                    onClick: copyClientId,
                                                                    style: {
                                                                        width: 32,
                                                                        height: 32,
                                                                        borderRadius: 8,
                                                                        border: 'none',
                                                                        background: 'var(--border)',
                                                                        cursor: 'pointer',
                                                                        fontSize: 14,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }
                                                                },
                                                                '🆔'
                                                            ),
                                                            React.createElement(
                                                                'button',
                                                                {
                                                                    className: 'btn-icon',
                                                                    title: 'Переименовать',
                                                                    onClick: () => {
                                                                        const nm = prompt('Новое имя', c.name) || c.name;
                                                                        renameClient(c.id, nm);
                                                                    },
                                                                    style: {
                                                                        width: 32,
                                                                        height: 32,
                                                                        borderRadius: 8,
                                                                        border: 'none',
                                                                        background: 'var(--border)',
                                                                        cursor: 'pointer',
                                                                        fontSize: 14,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }
                                                                },
                                                                '✏️'
                                                            ),
                                                            React.createElement(
                                                                'button',
                                                                {
                                                                    className: 'btn-icon',
                                                                    title: 'Удалить',
                                                                    onClick: () => {
                                                                        if (confirm(`Удалить клиента "${c.name}"?`)) removeClient(c.id);
                                                                    },
                                                                    style: {
                                                                        width: 32,
                                                                        height: 32,
                                                                        borderRadius: 8,
                                                                        border: 'none',
                                                                        background: '#fee2e2',
                                                                        cursor: 'pointer',
                                                                        fontSize: 14,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }
                                                                },
                                                                '🗑️'
                                                            )
                                                        )
                                                    );
                                                })
                                            : React.createElement(
                                                'div',
                                                {
                                                    style: {
                                                        textAlign: 'center',
                                                        padding: '40px 20px',
                                                        color: 'var(--muted)'
                                                    }
                                                },
                                                React.createElement('div', { style: { fontSize: 48, marginBottom: 12 } }, '📋'),
                                                React.createElement('div', { style: { fontSize: 15 } }, 'Пока нет клиентов'),
                                                React.createElement('div', { style: { fontSize: 13, marginTop: 4 } }, 'Создайте первого клиента ниже')
                                            ),
                                    ),
                                    // Разделитель
                                    React.createElement('div', {
                                        style: {
                                            height: 1,
                                            background: 'var(--border)',
                                            margin: '16px 0'
                                        }
                                    }),
                                    // Создание нового клиента (куратор выдаёт телефон+PIN)
                                    React.createElement(
                                        'div',
                                        { style: { display: 'grid', gap: 10 } },
                                        React.createElement('input', {
                                            placeholder: '+ Имя клиента',
                                            value: newName,
                                            onChange: (e) => setNewName(e.target.value),
                                            style: {
                                                width: '100%',
                                                padding: '12px 14px',
                                                borderRadius: 12,
                                                border: '2px solid var(--border)',
                                                fontSize: 15,
                                                outline: 'none'
                                            }
                                        }),
                                        React.createElement('input', {
                                            placeholder: 'Телефон',
                                            value: (() => {
                                                // Форматируем как +7 (XXX) XXX-XX-XX
                                                const d = (newPhone || '').replace(/\D/g, '').slice(0, 11);
                                                if (!d) return '';
                                                let result = '+7';
                                                const body = d.startsWith('7') ? d.slice(1) : d.startsWith('8') ? d.slice(1) : d;
                                                if (body.length > 0) result += ' (' + body.slice(0, 3);
                                                if (body.length >= 3) result += ') ';
                                                if (body.length > 3) result += body.slice(3, 6);
                                                if (body.length >= 6) result += '-';
                                                if (body.length > 6) result += body.slice(6, 8);
                                                if (body.length >= 8) result += '-';
                                                if (body.length > 8) result += body.slice(8, 10);
                                                return result;
                                            })(),
                                            onChange: (e) => {
                                                const digits = (e.target.value || '').replace(/\D/g, '').slice(0, 11);
                                                setNewPhone(digits);
                                            },
                                            inputMode: 'tel',
                                            style: {
                                                width: '100%',
                                                padding: '12px 14px',
                                                borderRadius: 12,
                                                border: '2px solid var(--border)',
                                                fontSize: 15,
                                                outline: 'none'
                                            }
                                        }),
                                        React.createElement('input', {
                                            placeholder: 'PIN (4 цифры)',
                                            value: newPin,
                                            onChange: (e) => setNewPin(e.target.value),
                                            onKeyDown: (e) => {
                                                const canCreate = newName.trim() && newPhone.trim() && newPin.trim();
                                                if (e.key === 'Enter' && canCreate) {
                                                    addClientToCloud({ name: newName, phone: newPhone, pin: newPin }).then(() => {
                                                        setNewName('');
                                                        setNewPhone('');
                                                        setNewPin('');
                                                    });
                                                }
                                            },
                                            inputMode: 'numeric',
                                            type: 'password',
                                            style: {
                                                width: '100%',
                                                padding: '12px 14px',
                                                borderRadius: 12,
                                                border: '2px solid var(--border)',
                                                fontSize: 15,
                                                outline: 'none'
                                            }
                                        }),
                                        React.createElement(
                                            'button',
                                            {
                                                className: 'btn acc',
                                                onClick: () => {
                                                    const canCreate = newName.trim() && newPhone.trim() && newPin.trim();
                                                    if (!canCreate) return;
                                                    addClientToCloud({ name: newName, phone: newPhone, pin: newPin }).then(() => {
                                                        setNewName('');
                                                        setNewPhone('');
                                                        setNewPin('');
                                                    });
                                                },
                                                disabled: !(newName.trim() && newPhone.trim() && newPin.trim()),
                                                style: {
                                                    padding: '12px 20px',
                                                    borderRadius: 12,
                                                    background: (newName.trim() && newPhone.trim() && newPin.trim())
                                                        ? 'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)'
                                                        : 'var(--border)',
                                                    border: 'none',
                                                    color: (newName.trim() && newPhone.trim() && newPin.trim()) ? '#fff' : 'var(--muted)',
                                                    fontWeight: 600,
                                                    cursor: (newName.trim() && newPhone.trim() && newPin.trim()) ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.2s'
                                                }
                                            },
                                            'Создать клиента'
                                        ),
                                        React.createElement(
                                            'div',
                                            { style: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 } },
                                            'Клиент входит по телефону + PIN. Сохраните и передайте эти данные клиенту.'
                                        )
                                    )
                                ),

                                // === TAB: QUEUE (Очередь на триал) ===
                                curatorTab === 'queue' && React.createElement(HEYS.TrialQueue.TrialQueueAdmin),

                                // Кнопка выхода (всегда видна внизу модала)
                                React.createElement(
                                    'button',
                                    {
                                        onClick: handleSignOut,
                                        style: {
                                            width: '100%',
                                            marginTop: 16,
                                            padding: '10px',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--muted)',
                                            fontSize: 14,
                                            cursor: 'pointer'
                                        }
                                    },
                                    '← Выйти из аккаунта'
                                )
                            )
                        )
                    ))
            : null;

        return gate;
    }

    function buildDesktopGate(props) {
        const {
            gate,
            isDesktop,
            isCurator,
            desktopAllowed,
            DesktopGateScreen,
            setClientId,
        } = props;

        return !gate && isDesktop && !isCurator && !desktopAllowed
            ? React.createElement(DesktopGateScreen, {
                onLogout: () => {
                    // Выход из PIN auth
                    removeGlobalValue('heys_pin_auth_client');
                    window.HEYS?.cloud?._setPinAuthMode?.(false, null);
                    if (window.HEYS) {
                        window.HEYS.currentClientId = null;
                        if (window.HEYS.store?.flushMemory) {
                            window.HEYS.store.flushMemory();
                        }
                    }
                    setClientId(null);
                    window.location.reload();
                }
            })
            : null;
    }

    function buildConsentGate(props) {
        const {
            gate,
            desktopGate,
            cloudUser,
            clientId,
            needsConsent,
            checkingConsent,
            setNeedsConsent,
            setShowMorningCheckin,
        } = props;

        const clientPhone = typeof localStorage !== 'undefined' ? readGlobalValue('heys_client_phone', null) : null;

        return !gate && !desktopGate && !cloudUser && clientId && needsConsent && !checkingConsent && HEYS.Consents?.ConsentScreen
            ? React.createElement(HEYS.Consents.ConsentScreen, {
                clientId: clientId,
                phone: clientPhone,
                onComplete: () => {
                    console.log('[CONSENTS] ✅ Согласия приняты');
                    setNeedsConsent(false);
                    // 🔄 v1.14c: Обновляем глобальный флаг для tryStartOnboardingTour
                    HEYS._consentsValid = true;
                    // 🎓 v1.10: После принятия согласий — проверяем профиль и запускаем нужный флоу
                    setTimeout(() => {
                        const U = HEYS.utils || {};
                        const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
                        const isProfileIncomplete = HEYS.ProfileSteps?.isProfileIncomplete?.(profile);
                        const hasMorningCheckin = typeof HEYS.MorningCheckin === 'function';

                        console.log('[CONSENTS] 🎓 После согласий:', {
                            isProfileIncomplete,
                            hasName: !!(profile.firstName || profile.name),
                            profileCompleted: profile.profileCompleted,
                            hasMorningCheckin
                        });

                        // Если профиль неполный — показываем утренний чек-ин для регистрации
                        if (isProfileIncomplete) {
                            if (hasMorningCheckin) {
                                console.log('[CONSENTS] 📋 Показываем утренний чек-ин для регистрации профиля');
                                setShowMorningCheckin(true);
                            } else {
                                console.warn('[CONSENTS] ⚠️ Профиль неполный, но MorningCheckin не загружен');
                            }
                        } else {
                            // Если профиль заполнен — запускаем onboarding tour
                            console.log('[CONSENTS] 🎓 Triggering onboarding tour after consents');
                            window.HEYS?._tour?.tryStart?.();
                        }
                    }, 500);
                },
                onCancel: () => {
                    // Отмена = выход (нельзя использовать приложение без согласий)
                    console.log('[CONSENTS] ❌ Отказ от согласий — выход');
                    removeGlobalValue('heys_pin_auth_client');
                    removeGlobalValue('heys_client_phone');
                    window.HEYS?.cloud?._setPinAuthMode?.(false, null);
                    setClientId(null);
                    window.location.reload();
                }
            })
            : null;
    }

    HEYS.AppGateFlow = {
        buildGate,
        buildDesktopGate,
        buildConsentGate,
    };
})();
