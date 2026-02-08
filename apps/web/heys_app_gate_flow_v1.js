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

    // 🆕 Хелперы для статуса подписки
    const getSubscriptionBadge = (client) => {
        const status = client.subscription_status || 'none';
        // active_until приоритетнее trial_ends_at для вычисления end date
        const rawEndDate = client.active_until || client.trial_ends_at;
        const endDate = rawEndDate ? new Date(rawEndDate) : null;
        const now = new Date();
        const daysLeft = endDate ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : null;
        const debugSet = (HEYS._subBadgeDebug = HEYS._subBadgeDebug || new Set());
        const clientId = client && client.id ? String(client.id) : '';
        const clientShortId = clientId ? clientId.slice(0, 8) : 'unknown';
        const debugKey = `${clientShortId}:${status}:${endDate ? endDate.toISOString().slice(0, 10) : 'no_end'}`;

        if (!debugSet.has(debugKey)) {
            debugSet.add(debugKey);
            console.info('[HEYS.subs] ℹ️ Badge reason', {
                clientId: clientShortId,
                status,
                hasEndDate: !!endDate,
                daysLeft
            });
        }

        if (!endDate || status === 'none') {
            return { emoji: '⚪', color: '#6b7280', bg: '#f3f4f6', text: 'Нет подписки', urgent: false };
        }

        if (daysLeft !== null && daysLeft < 0) {
            return { emoji: '🔴', color: '#dc2626', bg: '#fee2e2', text: `Просрочена ${Math.abs(daysLeft)} дн.`, urgent: true };
        }

        if (daysLeft !== null && daysLeft <= 3) {
            return { emoji: '🟡', color: '#d97706', bg: '#fef3c7', text: `Истекает через ${daysLeft} дн.`, urgent: true };
        }

        if (daysLeft !== null && daysLeft <= 7) {
            return { emoji: '🟡', color: '#ca8a04', bg: '#fef9c3', text: `До ${endDate.toLocaleDateString('ru-RU')}`, urgent: false };
        }

        if (status === 'trial') {
            return { emoji: '⏳', color: '#6366f1', bg: '#e0e7ff', text: `Триал до ${endDate.toLocaleDateString('ru-RU')}`, urgent: false };
        }

        if (status === 'trial_pending') {
            const startDate = client.trial_ends_at ? new Date(new Date(client.trial_ends_at).getTime() - 7 * 24 * 60 * 60 * 1000) : null;
            const startText = startDate ? startDate.toLocaleDateString('ru-RU') : '?';
            return { emoji: '🕐', color: '#3b82f6', bg: '#dbeafe', text: `Ожидает с ${startText}`, urgent: false };
        }

        if (status === 'active') {
            return { emoji: '🟢', color: '#16a34a', bg: '#dcfce7', text: `Активна до ${endDate.toLocaleDateString('ru-RU')}`, urgent: false };
        }

        if (status === 'read_only') {
            return { emoji: '🔒', color: '#dc2626', bg: '#fee2e2', text: 'Доступ ограничен', urgent: true };
        }

        return { emoji: '⚪', color: '#6b7280', bg: '#f3f4f6', text: status, urgent: false };
    };

    // ⚙️ Компонент управления подпиской клиента (с собственным state для модала)
    function ClientSubscriptionButton({ client, curatorId, onUpdate }) {
        const [open, setOpen] = React.useState(false);
        const [view, setView] = React.useState('main'); // main | trial | extend
        const [loading, setLoading] = React.useState(false);
        const [trialDate, setTrialDate] = React.useState(() => new Date().toISOString().split('T')[0]);
        const [months, setMonths] = React.useState(1);

        const status = client.subscription_status || 'none';
        const badge = getSubscriptionBadge(client);

        const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';

        // Активировать триал
        const handleActivateTrial = async () => {
            setLoading(true);
            try {
                const res = await HEYS.TrialQueue?.admin?.activateTrial?.(client.id, trialDate);
                if (res && res.success) {
                    const isToday = trialDate === new Date().toISOString().split('T')[0];
                    HEYS.Toast?.success?.(isToday
                        ? '✅ Триал активирован! 7 дней доступа.'
                        : `✅ Триал запланирован на ${trialDate}`
                    );
                    client.subscription_status = res.status || (isToday ? 'trial' : 'trial_pending');
                    client.trial_ends_at = res.trial_ends_at;
                    onUpdate?.();
                    setOpen(false);
                    setView('main');
                } else {
                    HEYS.Toast?.error?.(res?.message || 'Ошибка активации триала');
                }
            } catch (e) {
                console.error('[HEYS.sub] ❌ activateTrial error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось активировать'));
            }
            setLoading(false);
        };

        // Продлить подписку
        const handleExtend = async () => {
            setLoading(true);
            try {
                const { data: res, error } = await HEYS.YandexAPI?.rpc?.('admin_extend_subscription', {
                    p_curator_id: curatorId,
                    p_client_id: client.id,
                    p_months: months
                }) || {};
                if (error) {
                    HEYS.Toast?.error?.(error.message || 'Ошибка продления');
                } else if (res && res.success) {
                    HEYS.Toast?.success?.(`✅ Подписка продлена до ${formatDate(res.new_end_date)}`);
                    client.active_until = res.new_end_date;
                    client.subscription_status = res.new_status || 'active';
                    onUpdate?.();
                    setOpen(false);
                    setView('main');
                } else {
                    HEYS.Toast?.error?.(res?.message || 'Ошибка продления');
                }
            } catch (e) {
                console.error('[HEYS.sub] ❌ extend error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось продлить'));
            }
            setLoading(false);
        };

        // Сбросить подписку
        const handleCancel = async () => {
            if (!confirm(`Сбросить подписку для "${client.name}"?\nСтатус станет «Нет подписки».`)) return;
            setLoading(true);
            try {
                const { data: res, error } = await HEYS.YandexAPI?.rpc?.('admin_cancel_subscription', {
                    p_curator_id: curatorId,
                    p_client_id: client.id
                }) || {};
                if (error) {
                    HEYS.Toast?.error?.(error.message || 'Ошибка сброса');
                } else if (res && res.success) {
                    HEYS.Toast?.success?.('🚫 Подписка сброшена');
                    client.subscription_status = 'none';
                    client.active_until = null;
                    client.trial_ends_at = null;
                    onUpdate?.();
                    setOpen(false);
                    setView('main');
                } else {
                    HEYS.Toast?.error?.(res?.message || 'Ошибка сброса');
                }
            } catch (e) {
                console.error('[HEYS.sub] ❌ cancel error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось сбросить'));
            }
            setLoading(false);
        };

        const h = React.createElement;
        const btnBase = { border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 };

        // === Подвид: Активация триала ===
        const trialView = () => h('div', null,
            h('div', { style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text, #1f2937)' } }, '🎫 Активировать триал'),
            h('label', { style: { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text, #374151)', marginBottom: 6 } }, 'Дата начала:'),
            h('input', {
                type: 'date', value: trialDate,
                onChange: (e) => setTrialDate(e.target.value),
                min: new Date().toISOString().split('T')[0],
                style: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 8, boxSizing: 'border-box' }
            }),
            h('div', { style: { fontSize: 12, color: '#9ca3af', marginBottom: 16 } },
                trialDate === new Date().toISOString().split('T')[0]
                    ? '⚡ Триал начнётся сразу (7 дней)'
                    : `📅 Триал начнётся ${trialDate}, доступ на 7 дней`
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
                h('button', { onClick: () => setView('main'), style: { ...btnBase, background: 'var(--border, #e5e7eb)', color: 'var(--text, #374151)', flex: 1, justifyContent: 'center' } }, '← Назад'),
                h('button', {
                    onClick: handleActivateTrial, disabled: loading,
                    style: { ...btnBase, background: loading ? '#9ca3af' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', flex: 1, justifyContent: 'center' }
                }, loading ? '⏳...' : '✅ Активировать')
            )
        );

        // === Подвид: Продление подписки ===
        const extendView = () => h('div', null,
            h('div', { style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text, #1f2937)' } }, '➕ Продлить подписку'),
            h('label', { style: { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text, #374151)', marginBottom: 6 } }, 'Количество месяцев:'),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 } },
                [1, 2, 3, 6].map(m => h('button', {
                    key: m, onClick: () => setMonths(m),
                    style: {
                        padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        border: months === m ? '2px solid #4285f4' : '2px solid #e5e7eb',
                        background: months === m ? '#eff6ff' : 'var(--card, #fff)',
                        color: months === m ? '#2563eb' : 'var(--text, #374151)'
                    }
                }, `${m} мес`))
            ),
            h('div', { style: { fontSize: 12, color: '#9ca3af', marginBottom: 16 } },
                `Подписка будет продлена на ${months} мес. от текущей даты окончания`
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
                h('button', { onClick: () => setView('main'), style: { ...btnBase, background: 'var(--border, #e5e7eb)', color: 'var(--text, #374151)', flex: 1, justifyContent: 'center' } }, '← Назад'),
                h('button', {
                    onClick: handleExtend, disabled: loading,
                    style: { ...btnBase, background: loading ? '#9ca3af' : 'linear-gradient(135deg, #4285f4, #2563eb)', color: '#fff', flex: 1, justifyContent: 'center' }
                }, loading ? '⏳...' : `✅ +${months} мес`)
            )
        );

        // === Главный вид модала ===
        const mainView = () => h('div', null,
            // Заголовок
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
                h('div', { style: { width: 40, height: 40, borderRadius: '50%', background: badge.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 } }, badge.emoji),
                h('div', null,
                    h('div', { style: { fontSize: 16, fontWeight: 700, color: 'var(--text, #1f2937)' } }, client.name),
                    h('div', { style: { fontSize: 13, color: badge.color, fontWeight: 600 } }, badge.text)
                )
            ),
            // Информация
            h('div', { style: { background: 'var(--bg-secondary, #f9fafb)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13 } },
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' } },
                    h('span', { style: { color: '#6b7280' } }, 'Статус:'),
                    h('span', { style: { fontWeight: 600, color: badge.color } }, status),
                    h('span', { style: { color: '#6b7280' } }, 'Триал до:'),
                    h('span', { style: { fontWeight: 500 } }, formatDate(client.trial_ends_at)),
                    h('span', { style: { color: '#6b7280' } }, 'Подписка до:'),
                    h('span', { style: { fontWeight: 500 } }, formatDate(client.active_until))
                )
            ),
            // Действия
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                // Активировать триал (для none, read_only, trial_pending)
                (status === 'none' || status === 'read_only' || status === 'trial_pending') && h('button', {
                    onClick: () => { setTrialDate(new Date().toISOString().split('T')[0]); setView('trial'); },
                    style: { ...btnBase, background: '#ecfdf5', color: '#059669' }
                }, status === 'trial_pending' ? '⚡ Запустить триал сейчас' : '🎫 Активировать триал'),
                // Продлить подписку (всегда доступно)
                h('button', {
                    onClick: () => { setMonths(1); setView('extend'); },
                    style: { ...btnBase, background: '#eff6ff', color: '#2563eb' }
                }, '➕ Продлить подписку'),
                // Сбросить (если есть что сбрасывать)
                status !== 'none' && h('button', {
                    onClick: handleCancel, disabled: loading,
                    style: { ...btnBase, background: '#fef2f2', color: '#dc2626', marginTop: 4 }
                }, loading ? '⏳ Сброс...' : '🚫 Сбросить подписку')
            )
        );

        return h(React.Fragment, null,
            // Кнопка ⚙️
            h('button', {
                className: 'btn-icon',
                title: 'Управление подпиской',
                onClick: (e) => { e.stopPropagation(); setOpen(true); setView('main'); },
                style: {
                    width: 32, height: 32, borderRadius: 8, border: 'none',
                    background: '#e0e7ff', cursor: 'pointer', fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }
            }, '⚙️'),
            // Модальное окно
            open && h('div', {
                style: {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 10000
                },
                onClick: (e) => { if (e.target === e.currentTarget) { setOpen(false); setView('main'); } }
            },
                h('div', {
                    style: {
                        background: 'var(--card, #fff)', borderRadius: 16, padding: 24,
                        width: 360, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        maxHeight: '80vh', overflow: 'auto'
                    },
                    onClick: (e) => e.stopPropagation()
                },
                    // Кнопка закрытия
                    h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 } },
                        h('button', {
                            onClick: () => { setOpen(false); setView('main'); },
                            style: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', padding: '0 4px' }
                        }, '✕')
                    ),
                    view === 'main' ? mainView() : view === 'trial' ? trialView() : extendView()
                )
            )
        );
    }

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
                                                            // 🆕 Статус подписки
                                                            (() => {
                                                                const badge = getSubscriptionBadge(c);
                                                                return React.createElement(
                                                                    'div',
                                                                    {
                                                                        style: {
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: 4,
                                                                            padding: '3px 8px',
                                                                            borderRadius: 6,
                                                                            background: badge.bg,
                                                                            color: badge.color,
                                                                            fontSize: 11,
                                                                            fontWeight: 600,
                                                                            marginTop: 4,
                                                                            animation: badge.urgent ? 'pulse 2s infinite' : 'none'
                                                                        }
                                                                    },
                                                                    badge.emoji + ' ' + badge.text
                                                                );
                                                            })(),
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
                                                            // ⚙️ Управление подпиской клиента
                                                            React.createElement(ClientSubscriptionButton, {
                                                                client: c,
                                                                curatorId: cloudUser?.id,
                                                                onUpdate: () => window.dispatchEvent(new CustomEvent('heys:clients-updated'))
                                                            }),
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
