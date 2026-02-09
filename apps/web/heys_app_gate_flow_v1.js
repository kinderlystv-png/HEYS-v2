// heys_app_gate_flow_v1.js — Gate flow UI (login, client select, desktop/consents)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
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

    // ⚙️ Компонент управления подпиской клиента (портал + enterprise UI)
    function ClientSubscriptionButton({ client, curatorId, onUpdate }) {
        const [open, setOpen] = React.useState(false);
        const [view, setView] = React.useState('main'); // main | trial | extend
        const [loading, setLoading] = React.useState(false);
        const [trialDate, setTrialDate] = React.useState(() => new Date().toISOString().split('T')[0]);
        const [months, setMonths] = React.useState(1);

        const status = client.subscription_status || 'none';
        const badge = getSubscriptionBadge(client);
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';
        const h = React.createElement;

        const closeModal = () => { setOpen(false); setView('main'); };

        // Активировать триал
        const handleActivateTrial = async () => {
            console.info('[HEYS.subs] 🎫 Активация триала', { clientId: client.id, clientName: client.name, trialDate });
            setLoading(true);
            try {
                const res = await HEYS.TrialQueue?.admin?.activateTrial?.(client.id, trialDate);
                if (res && res.success) {
                    const isToday = trialDate === new Date().toISOString().split('T')[0];
                    console.info('[HEYS.subs] ✅ Триал активирован успешно', { clientId: client.id, status: res.status, trialEndsAt: res.trial_ends_at });
                    HEYS.Toast?.success?.(isToday
                        ? '✅ Триал активирован! 7 дней доступа.'
                        : `✅ Триал запланирован на ${trialDate}`
                    );
                    client.subscription_status = res.status || (isToday ? 'trial' : 'trial_pending');
                    client.trial_ends_at = res.trial_ends_at;
                    onUpdate?.();
                    closeModal();
                } else {
                    console.warn('[HEYS.subs] ⚠️ Ошибка активации триала', { message: res?.message });
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
            console.info('[HEYS.subs] ➕ Продление подписки', { clientId: client.id, clientName: client.name, months });
            setLoading(true);
            try {
                const { data: res, error } = await HEYS.YandexAPI?.rpc?.('admin_extend_subscription', {
                    p_curator_id: curatorId,
                    p_client_id: client.id,
                    p_months: months
                }) || {};
                if (error) {
                    console.error('[HEYS.subs] ❌ RPC error при продлении', { error: error.message, clientId: client.id });
                    HEYS.Toast?.error?.(error.message || 'Ошибка продления');
                } else if (res && res.success) {
                    console.info('[HEYS.subs] ✅ Подписка продлена успешно', { clientId: client.id, newEndDate: res.new_end_date, newStatus: res.new_status });
                    HEYS.Toast?.success?.(`✅ Подписка продлена до ${formatDate(res.new_end_date)}`);
                    client.active_until = res.new_end_date;
                    client.subscription_status = res.new_status || 'active';
                    onUpdate?.();
                    closeModal();
                } else {
                    console.warn('[HEYS.subs] ⚠️ Продление не удалось', { message: res?.message, clientId: client.id });
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
            console.info('[HEYS.subs] 🚫 Запрос на сброс подписки', { clientId: client.id, clientName: client.name });
            if (!confirm(`Сбросить подписку для "${client.name}"?\nСтатус станет «Нет подписки».`)) {
                console.info('[HEYS.subs] ⏹️ Сброс отменён пользователем');
                return;
            }
            setLoading(true);
            try {
                const { data: res, error } = await HEYS.YandexAPI?.rpc?.('admin_cancel_subscription', {
                    p_curator_id: curatorId,
                    p_client_id: client.id
                }) || {};
                if (error) {
                    console.error('[HEYS.subs] ❌ RPC error при сбросе', { error: error.message, clientId: client.id });
                    HEYS.Toast?.error?.(error.message || 'Ошибка сброса');
                } else if (res && res.success) {
                    console.info('[HEYS.subs] ✅ Подписка сброшена успешно', { clientId: client.id });
                    HEYS.Toast?.success?.('🚫 Подписка сброшена');
                    client.subscription_status = 'none';
                    client.active_until = null;
                    client.trial_ends_at = null;
                    onUpdate?.();
                    closeModal();
                } else {
                    console.warn('[HEYS.subs] ⚠️ Сброс не удался', { message: res?.message, clientId: client.id });
                    HEYS.Toast?.error?.(res?.message || 'Ошибка сброса');
                }
            } catch (e) {
                console.error('[HEYS.sub] ❌ cancel error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось сбросить'));
            }
            setLoading(false);
        };

        const btnBase = {
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--card, #fff)'
        };

        const pill = (label, value) => h('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'var(--bg-secondary, #f9fafb)',
                border: '1px solid var(--border, #e5e7eb)'
            }
        },
            h('span', { style: { fontSize: 12, color: '#6b7280' } }, label),
            h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text, #111827)' } }, value)
        );

        const statCard = (label, value, tone) => h('div', {
            style: {
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border, #e5e7eb)',
                background: tone?.bg || 'var(--card, #fff)'
            }
        },
            h('div', { style: { fontSize: 11, color: '#6b7280', marginBottom: 4 } }, label),
            h('div', { style: { fontSize: 13, fontWeight: 700, color: tone?.color || 'var(--text, #111827)' } }, value)
        );

        const trialView = () => h('div', { style: { display: 'grid', gap: 16 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                h('div', { style: { width: 34, height: 34, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '🎫'),
                h('div', null,
                    h('div', { style: { fontSize: 16, fontWeight: 700, color: 'var(--text, #111827)' } }, 'Активация триала'),
                    h('div', { style: { fontSize: 12, color: '#6b7280' } }, 'Назначьте дату старта')
                )
            ),
            h('div', null,
                h('label', { style: { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 } }, 'Дата начала'),
                h('input', {
                    type: 'date', value: trialDate,
                    onChange: (e) => {
                        console.info('[HEYS.subs] 📅 Изменение даты триала', { clientId: client.id, oldDate: trialDate, newDate: e.target.value });
                        setTrialDate(e.target.value);
                    },
                    min: new Date().toISOString().split('T')[0],
                    style: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }
                })
            ),
            h('div', { style: { fontSize: 12, color: '#6b7280' } },
                trialDate === new Date().toISOString().split('T')[0]
                    ? '⚡ Триал начнётся сразу (7 дней)'
                    : `📅 Триал начнётся ${trialDate}, доступ на 7 дней`
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
                h('button', {
                    onClick: () => {
                        console.info('[HEYS.subs] ← Возврат из trial view');
                        setView('main');
                    },
                    style: { ...btnBase, justifyContent: 'center', background: 'var(--border, #eef2f7)' }
                }, '← Назад'),
                h('button', {
                    onClick: handleActivateTrial, disabled: loading,
                    style: { ...btnBase, justifyContent: 'center', background: loading ? '#9ca3af' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none' }
                }, loading ? '⏳...' : '✅ Активировать')
            )
        );

        const extendView = () => h('div', { style: { display: 'grid', gap: 16 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                h('div', { style: { width: 34, height: 34, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '➕'),
                h('div', null,
                    h('div', { style: { fontSize: 16, fontWeight: 700, color: 'var(--text, #111827)' } }, 'Продление подписки'),
                    h('div', { style: { fontSize: 12, color: '#6b7280' } }, 'Выберите длительность')
                )
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } },
                [1, 2, 3, 6].map(m => h('button', {
                    key: m,
                    onClick: () => {
                        console.info('[HEYS.subs] 📆 Выбор периода продления', { clientId: client.id, months: m });
                        setMonths(m);
                    },
                    style: {
                        padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: months === m ? '2px solid #2563eb' : '2px solid #e5e7eb',
                        background: months === m ? '#eff6ff' : 'var(--card, #fff)',
                        color: months === m ? '#1d4ed8' : 'var(--text, #374151)'
                    }
                }, `${m} мес`))
            ),
            h('div', { style: { fontSize: 12, color: '#6b7280' } },
                `Подписка будет продлена на ${months} мес. от текущей даты окончания`
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
                h('button', {
                    onClick: () => {
                        console.info('[HEYS.subs] ← Возврат из extend view');
                        setView('main');
                    },
                    style: { ...btnBase, justifyContent: 'center', background: 'var(--border, #eef2f7)' }
                }, '← Назад'),
                h('button', {
                    onClick: handleExtend, disabled: loading,
                    style: { ...btnBase, justifyContent: 'center', background: loading ? '#9ca3af' : 'linear-gradient(135deg, #4285f4, #2563eb)', color: '#fff', border: 'none' }
                }, loading ? '⏳...' : `✅ +${months} мес`)
            )
        );

        const mainView = () => h('div', { style: { display: 'grid', gap: 16 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
                h('div', { style: { width: 44, height: 44, borderRadius: 14, background: badge.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 } }, badge.emoji),
                h('div', null,
                    h('div', { style: { fontSize: 16, fontWeight: 700, color: 'var(--text, #111827)' } }, client.name),
                    h('div', { style: { fontSize: 12, color: badge.color, fontWeight: 700 } }, badge.text)
                )
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } },
                statCard('Статус', status, { color: badge.color, bg: badge.bg }),
                statCard('Триал до', formatDate(client.trial_ends_at)),
                statCard('Подписка до', formatDate(client.active_until))
            ),
            h('div', { style: { display: 'grid', gap: 8 } },
                pill('ID клиента', (client.id || '').slice(0, 8) + '…'),
                pill('Тариф', status === 'active' ? 'Активен' : status === 'trial' ? 'Триал' : status === 'trial_pending' ? 'Ожидание' : status === 'read_only' ? 'Ограничен' : 'Нет')
            ),
            h('div', { style: { display: 'grid', gap: 8 } },
                (status === 'none' || status === 'read_only' || status === 'trial_pending') && h('button', {
                    onClick: () => {
                        console.info('[HEYS.subs] 🎫 Открытие trial view', { clientId: client.id, status });
                        setTrialDate(new Date().toISOString().split('T')[0]);
                        setView('trial');
                    },
                    style: { ...btnBase, background: '#ecfdf5', color: '#059669', border: '1px solid #bbf7d0' }
                }, status === 'trial_pending' ? '⚡ Запустить триал сейчас' : '🎫 Активировать триал'),
                h('button', {
                    onClick: () => {
                        console.info('[HEYS.subs] ➕ Открытие extend view', { clientId: client.id, status });
                        setMonths(1);
                        setView('extend');
                    },
                    style: { ...btnBase, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }
                }, '➕ Продлить подписку'),
                status !== 'none' && h('button', {
                    onClick: handleCancel, disabled: loading,
                    style: { ...btnBase, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
                }, loading ? '⏳ Сброс...' : '🚫 Сбросить подписку')
            )
        );

        const modalContent = h('div', {
            style: {
                width: 480,
                maxWidth: '92vw',
                maxHeight: '86vh',
                background: 'var(--card, #fff)',
                borderRadius: 18,
                boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
                border: '1px solid rgba(148,163,184,0.25)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }
        },
            h('div', {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                    color: '#fff'
                }
            },
                h('div', { style: { fontSize: 13, fontWeight: 700, letterSpacing: 0.2 } }, 'Панель управления подпиской'),
                h('button', {
                    onClick: closeModal,
                    style: {
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.3)',
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        cursor: 'pointer'
                    }
                }, '✕')
            ),
            h('div', {
                style: {
                    padding: 18,
                    overflow: 'auto',
                    background: 'var(--surface, #f8fafc)'
                }
            },
                view === 'main' ? mainView() : view === 'trial' ? trialView() : extendView()
            )
        );

        const modalOverlay = open && h('div', {
            style: {
                position: 'fixed',
                inset: 0,
                background: 'rgba(2,6,23,0.55)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                padding: '24px'
            },
            onClick: (e) => { if (e.target === e.currentTarget) closeModal(); }
        }, modalContent);

        const portal = open && ReactDOM?.createPortal
            ? ReactDOM.createPortal(modalOverlay, document.body)
            : modalOverlay;

        return h(React.Fragment, null,
            h('button', {
                className: 'btn-icon',
                title: 'Управление подпиской',
                onClick: (e) => {
                    e.stopPropagation();
                    console.info('[HEYS.subs] ⚙️ Открыта панель управления подпиской', { clientId: client.id, clientName: client.name });
                    setOpen(true);
                    setView('main');
                },
                style: {
                    width: 32, height: 32, borderRadius: 8, border: 'none',
                    background: '#e0e7ff', cursor: 'pointer', fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }
            }, '⚙️'),
            portal
        );
    }

    // 🆕 Модалка создания клиента
    function CreateClientModal(props) {
        const {
            newName, setNewName,
            newPhone, setNewPhone,
            newPin, setNewPin,
            addClientToCloud
        } = props;
        const [open, setOpen] = React.useState(false);

        const closeModal = () => {
            setOpen(false);
            setNewName('');
            setNewPhone('');
            setNewPin('');
        };

        const handleCreate = () => {
            const canCreate = newName.trim() && newPhone.trim() && newPin.trim();
            if (!canCreate) return;
            addClientToCloud({ name: newName, phone: newPhone, pin: newPin }).then(() => {
                closeModal();
                HEYS.Toast?.success?.('✅ Клиент создан');
            });
        };

        // Кнопка открытия
        const triggerBtn = React.createElement(
            'button',
            {
                onClick: () => setOpen(true),
                style: {
                    width: '100%',
                    padding: '16px',
                    borderRadius: 14,
                    background: '#eff6ff',
                    border: '1px dashed #60a5fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                },
                onMouseEnter: (e) => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.borderColor = '#3b82f6'; },
                onMouseLeave: (e) => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#60a5fa'; }
            },
            React.createElement('span', { style: { fontSize: 20, lineHeight: 1 } }, '➕'),
            React.createElement('span', { style: { fontSize: 15, fontWeight: 600, color: '#2563eb' } }, 'Создать нового клиента')
        );

        const modalContent = React.createElement('div', {
            style: {
                width: 440,
                maxWidth: '92vw',
                background: '#fff',
                borderRadius: 20,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'scaleIn 0.2s ease-out'
            },
            onClick: (e) => e.stopPropagation()
        },
            // Header
            React.createElement('div', {
                style: {
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #0f172a, #334155)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }
            },
                React.createElement('div', { style: { fontWeight: 700, fontSize: 16 } }, 'Новый клиент'),
                React.createElement('button', {
                    onClick: closeModal,
                    style: { width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
                }, '✕')
            ),
            // Body
            React.createElement('div', { style: { padding: 20, display: 'grid', gap: 16 } },
                // Name
                React.createElement('div', null,
                    React.createElement('label', { style: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 } }, 'Имя клиента'),
                    React.createElement('input', {
                        placeholder: 'Иван Иванов',
                        value: newName,
                        onChange: (e) => setNewName(e.target.value),
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none' }
                    })
                ),
                // Phone
                React.createElement('div', null,
                    React.createElement('label', { style: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 } }, 'Номер телефона'),
                    React.createElement('input', {
                        placeholder: '+7 (999) 000-00-00',
                        value: (() => {
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
                        onChange: (e) => setNewPhone((e.target.value || '').replace(/\D/g, '').slice(0, 11)),
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none' }
                    })
                ),
                // PIN
                React.createElement('div', null,
                    React.createElement('label', { style: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 } }, 'PIN код (4 цифры)'),
                    React.createElement('input', {
                        placeholder: '1234',
                        value: newPin,
                        maxLength: 4,
                        onChange: (e) => setNewPin(e.target.value),
                        onKeyDown: (e) => { if (e.key === 'Enter') handleCreate(); },
                        type: 'tel', /* numeric keyboard */
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none', letterSpacing: 4, textAlign: 'center', fontWeight: 700 }
                    })
                ),
                // Info
                React.createElement('div', { style: { padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', lineHeight: 1.4 } },
                    '🔒 Клиент будет входить по этому телефону и PIN-коду. Обязательно сохраните эти данные.'
                ),
                // Button
                React.createElement('button', {
                    onClick: handleCreate,
                    disabled: !(newName.trim() && newPhone.trim() && newPin.trim().length >= 4),
                    style: {
                        marginTop: 8,
                        width: '100%',
                        padding: '14px',
                        borderRadius: 12,
                        background: (newName.trim() && newPhone.trim() && newPin.trim().length >= 4) ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#e2e8f0',
                        color: (newName.trim() && newPhone.trim() && newPin.trim().length >= 4) ? '#fff' : '#94a3b8',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 16,
                        cursor: (newName.trim() && newPhone.trim() && newPin.trim().length >= 4) ? 'pointer' : 'not-allowed',
                        boxShadow: (newName.trim() && newPhone.trim() && newPin.trim().length >= 4) ? '0 4px 6px -1px rgba(37,99,235,0.2)' : 'none'
                    }
                }, 'Создать клиента')
            )
        );

        const modalOverlay = open && ReactDOM.createPortal(
            React.createElement('div', {
                style: {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 9999,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 20
                },
                onClick: closeModal
            }, modalContent),
            document.body
        );

        return React.createElement(React.Fragment, null, triggerBtn, modalOverlay);
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
                        {
                            className: 'modal-backdrop',
                            style: {
                                background: 'rgba(2,6,23,0.55)',
                                backdropFilter: 'blur(6px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '10px' // minimal padding
                            }
                        },
                        React.createElement(
                            'div',
                            {
                                className: 'modal client-select-modal',
                                style: {
                                    width: 520,
                                    maxWidth: '96vw',
                                    height: '92vh', // Fixed high height to maximize space
                                    maxHeight: '1000px', // Reasonable cap on huge screens
                                    background: 'var(--card, #fff)',
                                    borderRadius: 18,
                                    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
                                    border: '1px solid rgba(148,163,184,0.25)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden'
                                }
                            },
                            React.createElement(
                                React.Fragment,
                                null,
                                // HEADER: Тёмный enterprise хедер с табами
                                React.createElement(
                                    'div',
                                    {
                                        style: {
                                            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                                            color: '#fff',
                                            padding: '18px 20px 14px'
                                        }
                                    },
                                    // Title + status + logout
                                    React.createElement(
                                        'div',
                                        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                                        React.createElement(
                                            'div',
                                            { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                                            React.createElement('div', { style: { fontSize: 24 } }, '👥'),
                                            React.createElement('div', null,
                                                React.createElement('div', { style: { fontSize: 16, fontWeight: 700, letterSpacing: 0.2 } }, 'Панель куратора'),
                                                React.createElement('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 } },
                                                    clientsSource === 'loading' ? '⏳ Загрузка...'
                                                        : clientsSource === 'error' ? '⚠️ Ошибка загрузки'
                                                            : clientsSource === 'cache' ? `${clients.length} клиентов (кэш)`
                                                                : clients.length ? `${clients.length} клиентов`
                                                                    : 'Нет клиентов'
                                                )
                                            )
                                        ),
                                        React.createElement(
                                            'button',
                                            {
                                                onClick: () => {
                                                    console.info('[HEYS.gate] 🚪 Выход куратора');
                                                    handleSignOut();
                                                },
                                                title: 'Выйти',
                                                style: {
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 8,
                                                    border: '1px solid rgba(255,255,255,0.25)',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    color: '#fff',
                                                    cursor: 'pointer',
                                                    fontSize: 16,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }
                                            },
                                            '←'
                                        )
                                    ),
                                    // Tabs в хедере
                                    React.createElement(
                                        'div',
                                        {
                                            style: {
                                                display: 'flex',
                                                gap: 6,
                                                background: 'rgba(0,0,0,0.25)',
                                                borderRadius: 10,
                                                padding: 4
                                            }
                                        },
                                        React.createElement(
                                            'button',
                                            {
                                                onClick: () => {
                                                    console.info('[HEYS.gate] 🔘 Переключение на таб Клиенты');
                                                    setCuratorTab('clients');
                                                },
                                                style: {
                                                    flex: 1,
                                                    padding: '8px 14px',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: curatorTab === 'clients' ? 'rgba(255,255,255,0.95)' : 'transparent',
                                                    color: curatorTab === 'clients' ? '#0f172a' : 'rgba(255,255,255,0.8)'
                                                }
                                            },
                                            '👥 Клиенты'
                                        ),
                                        React.createElement(
                                            'button',
                                            {
                                                onClick: () => {
                                                    console.info('[HEYS.gate] 🔘 Переключение на таб Очередь');
                                                    setCuratorTab('queue');
                                                },
                                                style: {
                                                    flex: 1,
                                                    padding: '8px 14px',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: curatorTab === 'queue' ? 'rgba(255,255,255,0.95)' : 'transparent',
                                                    color: curatorTab === 'queue' ? '#0f172a' : 'rgba(255,255,255,0.8)'
                                                }
                                            },
                                            '📋 Очередь'
                                        )
                                    ),
                                    // Warnings (cache/error) в хедере
                                    clientsSource === 'cache' && React.createElement(
                                        'div',
                                        {
                                            style: {
                                                fontSize: 11,
                                                color: '#fbbf24',
                                                marginTop: 10,
                                                padding: '6px 10px',
                                                background: 'rgba(251, 191, 36, 0.15)',
                                                borderRadius: 8,
                                                border: '1px solid rgba(251, 191, 36, 0.3)'
                                            }
                                        },
                                        '☁️ Синхронизация с облаком...'
                                    ),
                                    clientsSource === 'error' && React.createElement(
                                        'div',
                                        {
                                            style: {
                                                fontSize: 11,
                                                color: '#f87171',
                                                marginTop: 10,
                                                padding: '6px 10px',
                                                background: 'rgba(239, 68, 68, 0.15)',
                                                borderRadius: 8,
                                                border: '1px solid rgba(239, 68, 68, 0.3)'
                                            }
                                        },
                                        '❌ Не удалось загрузить клиентов'
                                    )
                                ),
                                // CONTENT: Прокручиваемая область
                                React.createElement(
                                    'div',
                                    {
                                        style: {
                                            flex: 1,
                                            overflow: 'auto',
                                            background: 'var(--surface, #f8fafc)',
                                            padding: '18px 20px'
                                        }
                                    },
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
                                                    // maxHeight removed
                                                    minHeight: 100,
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
                                                                onMouseEnter: (e) => {
                                                                    if (!isLast) e.currentTarget.style.transform = 'translateY(-2px)';
                                                                    e.currentTarget.style.boxShadow = '0 10px 25px -10px rgba(0,0,0,0.2)';
                                                                },
                                                                onMouseLeave: (e) => {
                                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                                    e.currentTarget.style.boxShadow = 'none';
                                                                },
                                                                style: {
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 12,
                                                                    padding: '14px 16px',
                                                                    borderRadius: 14,
                                                                    background: '#fff',
                                                                    border: isLast ? '2px solid #4285f4' : '1px solid var(--border, #e5e7eb)',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    animation: `fadeSlideIn 0.3s ease ${idx * 0.05}s both`
                                                                },
                                                                onClick: async () => {
                                                                    console.info('[HEYS.gate] 👤 Выбор клиента', { clientId: c.id, clientName: c.name });
                                                                    // Безопасное переключение с синхронизацией
                                                                    if (HEYS.cloud && HEYS.cloud.switchClient) {
                                                                        await HEYS.cloud.switchClient(c.id);
                                                                    } else {
                                                                        U.lsSet('heys_client_current', c.id);
                                                                    }
                                                                    // Сохраняем как последнего выбранного
                                                                    writeGlobalValue('heys_last_client_id', c.id);
                                                                    setClientId(c.id);
                                                                    console.info('[HEYS.gate] ✅ Клиент переключён', { clientId: c.id });
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
                                                            // Контент карточки (Инфо + Кнопки)
                                                            React.createElement(
                                                                'div',
                                                                { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 } },

                                                                // 1. Верхний ряд: Имя + Телефон
                                                                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 } },
                                                                    React.createElement('div', { style: { fontWeight: 700, fontSize: 16, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, c.name),
                                                                    c.phone_normalized && React.createElement('div', { style: { fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap', marginTop: 1, fontFamily: 'monospace' } }, c.phone_normalized)
                                                                ),

                                                                // 2. Средний ряд: Бейдж + Статистика
                                                                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 24 } },
                                                                    (() => {
                                                                        const badge = getSubscriptionBadge(c);
                                                                        return React.createElement('div', {
                                                                            style: {
                                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                                padding: '4px 8px', borderRadius: 6,
                                                                                background: badge.bg, color: badge.color,
                                                                                fontSize: 12, fontWeight: 600,
                                                                                border: `1px solid ${badge.bg === '#fef2f2' ? '#fecaca' : badge.bg === '#eff6ff' ? '#bfdbfe' : '#bbf7d0'}`,
                                                                                animation: badge.urgent ? 'pulse 2s infinite' : 'none'
                                                                            }
                                                                        }, badge.emoji + ' ' + badge.text);
                                                                    })(),
                                                                    // Streak
                                                                    stats.streak > 0 && React.createElement('span', {
                                                                        style: { color: stats.streak >= 3 ? '#16a34a' : 'var(--muted)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }
                                                                    }, '🔥 ' + stats.streak + ' дн.'),
                                                                    // Last Active
                                                                    stats.lastActiveDate && React.createElement('span', { style: { fontSize: 12, color: 'var(--muted)' } },
                                                                        '📅 ' + formatLastActive(stats.lastActiveDate)
                                                                    ),
                                                                    // Метка "Последний"
                                                                    isLast && React.createElement('span', { style: { color: '#4285f4', fontWeight: 500, fontSize: 12 } }, '✓')
                                                                ),

                                                                // 3. Нижний ряд: Кнопки (выровнены вправо)
                                                                React.createElement(
                                                                    'div',
                                                                    {
                                                                        style: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
                                                                        onClick: (e) => e.stopPropagation()
                                                                    },
                                                                    React.createElement('button', {
                                                                        className: 'btn-icon',
                                                                        title: 'Скопировать ID',
                                                                        onClick: (e) => {
                                                                            console.info('[HEYS.gate] 🆔 Копирование ID', { clientId: c.id });
                                                                            copyClientId(e);
                                                                        },
                                                                        style: { width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
                                                                    }, '🆔'),
                                                                    React.createElement('button', {
                                                                        className: 'btn-icon',
                                                                        title: 'Переименовать',
                                                                        onClick: () => {
                                                                            const nm = prompt('Новое имя', c.name) || c.name;
                                                                            if (nm !== c.name) renameClient(c.id, nm);
                                                                        },
                                                                        style: { width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
                                                                    }, '✏️'),
                                                                    // Settings
                                                                    React.createElement(ClientSubscriptionButton, {
                                                                        client: c,
                                                                        curatorId: cloudUser?.id,
                                                                        onUpdate: () => window.dispatchEvent(new CustomEvent('heys:clients-updated'))
                                                                    }),
                                                                    React.createElement('button', {
                                                                        className: 'btn-icon',
                                                                        title: 'Удалить',
                                                                        onClick: () => {
                                                                            if (confirm(`Удалить клиента "${c.name}"?`)) removeClient(c.id);
                                                                        },
                                                                        style: { width: 30, height: 30, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
                                                                    }, '🗑️')
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
                                    ),

                                    // === TAB: QUEUE (Очередь на триал) ===
                                    curatorTab === 'queue' && React.createElement(HEYS.TrialQueue.TrialQueueAdmin)
                                ),

                                // FOOTER: Кнопка создания (прибита к низу)
                                curatorTab === 'clients' && React.createElement(
                                    'div',
                                    {
                                        style: {
                                            padding: '16px 20px',
                                            background: '#fff',
                                            borderTop: '1px solid var(--border, #e2e8f0)',
                                            flexShrink: 0
                                        }
                                    },
                                    React.createElement(CreateClientModal, props)
                                )
                            )
                        )
                    )
            )
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
