// heys_app_gate_flow_v1.js — Gate flow UI (login, client select, desktop/consents)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const U = HEYS.utils || {};
    const CLIENT_ACTION_MODAL_Z = 12050;

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
    const getEffectiveSubscriptionStatus = (client) => {
        const statusRaw = client.subscription_status || 'none';
        const now = Date.now();
        const activeUntil = client.active_until ? new Date(client.active_until).getTime() : null;
        const trialEndsAt = client.trial_ends_at ? new Date(client.trial_ends_at).getTime() : null;
        const trialStartsAt = client.trial_started_at ? new Date(client.trial_started_at).getTime() : null;

        if (activeUntil && activeUntil > now) return 'active';
        if (trialStartsAt && trialStartsAt > now) return 'trial_pending';
        if (trialEndsAt && trialEndsAt > now) return 'trial';

        return statusRaw || 'none';
    };

    const getSubscriptionBadge = (client) => {
        const status = getEffectiveSubscriptionStatus(client);
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
        const [accessResult, setAccessResult] = React.useState(null);

        const status = getEffectiveSubscriptionStatus(client);
        const badge = getSubscriptionBadge(client);
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';
        const unwrapRpcResult = (res, fnName) => {
            if (res && typeof res === 'object' && res[fnName] && typeof res[fnName] === 'object') {
                return res[fnName];
            }
            return res;
        };
        const h = React.createElement;

        const closeModal = () => { setOpen(false); setView('main'); setAccessResult(null); };
        const buildClientBotLink = (pinToken) => {
            if (!pinToken) return null;
            const botUsername = HEYS.config?.clientBotUsername || 'heyslab_bot';
            return `https://t.me/${botUsername}?start=${pinToken}`;
        };
        const normalizeAccessLinkResult = (res, fallbackTitle) => {
            if (!res || !res.success) {
                return {
                    title: fallbackTitle || 'Ссылка недоступна',
                    message: res?.message || res?.error || 'Не удалось получить Telegram-ссылку',
                    unavailable: true
                };
            }
            if (res.link_available === false) {
                return {
                    title: 'Ссылка недоступна',
                    message: res.message || 'Перевыпустите PIN и ссылку.',
                    unavailable: true,
                    reason: res.reason
                };
            }
            const deepLink = res.deep_link || res.deepLink || buildClientBotLink(res.pin_token);
            return {
                title: fallbackTitle || 'Ссылка для клиента',
                message: 'Клиент открывает ссылку в Telegram, бот привяжет его аккаунт.',
                deepLink,
                pinTokenExpiresAt: res.pin_token_expires_at
            };
        };

        const copyText = async (text, successMessage) => {
            if (!text) return false;
            try {
                if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
                await navigator.clipboard.writeText(text);
                HEYS.Toast?.success?.(successMessage || 'Скопировано');
                return true;
            } catch (e) {
                console.warn('[HEYS.subs] Clipboard copy failed:', e);
                return false;
            }
        };

        const buildWelcomeMessage = (access = {}) => {
            if (!access.pin || !access.deepLink) return '';
            return HEYS.TrialQueue?.buildClientWelcomeMessage?.({
                clientName: client.name,
                phone: client.phone_normalized || client.phone,
                pin: access.pin,
                deepLink: access.deepLink,
                pinTokenExpiresAt: access.pinTokenExpiresAt,
                trialEndsAt: client.trial_ends_at,
            }) || '';
        };

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
                    const errorMessage = res?.message || res?.error?.message || res?.error || 'Ошибка активации триала';
                    console.warn('[HEYS.subs] ⚠️ Ошибка активации триала', { message: errorMessage, response: res });
                    HEYS.Toast?.error?.(errorMessage);
                }
            } catch (e) {
                console.error('[HEYS.sub] ❌ activateTrial error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось активировать'));
            }
            setLoading(false);
        };

        const handleClearTelegramBinding = async () => {
            if (!confirm('Сбросить Telegram-привязку клиента? После этого клиент сможет заново открыть свою Telegram-ссылку и привязаться к правильному аккаунту.')) return;
            setLoading(true);
            try {
                const res = await HEYS.TrialQueue?.admin?.clearTelegramBinding?.(client.id);
                if (res && res.success) {
                    HEYS.Toast?.success?.(res.cleared ? 'Telegram-привязка сброшена' : 'Telegram-привязки не было');
                    const linkRes = await HEYS.TrialQueue?.admin?.getClientAccessLink?.(client.id);
                    if (linkRes) {
                        const access = normalizeAccessLinkResult(linkRes, 'Ссылка для повторной привязки');
                        setAccessResult(access);
                        if (access.unavailable) {
                            HEYS.Toast?.warning?.(access.message || 'Перевыпустите PIN и ссылку');
                        }
                    }
                    onUpdate?.();
                } else {
                    const errorMessage = res?.message || res?.error?.message || res?.error || 'Не удалось сбросить Telegram-привязку';
                    HEYS.Toast?.error?.(errorMessage);
                }
            } catch (e) {
                console.error('[HEYS.subs] ❌ clearTelegramBinding error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось сбросить Telegram-привязку'));
            }
            setLoading(false);
        };

        const handleGetClientAccessLink = async () => {
            setLoading(true);
            try {
                const res = await HEYS.TrialQueue?.admin?.getClientAccessLink?.(client.id);
                const access = normalizeAccessLinkResult(res, 'Ссылка для клиента');
                setAccessResult(access);
                if (access.unavailable) {
                    HEYS.Toast?.warning?.(access.message || 'Перевыпустите PIN и ссылку');
                } else {
                    const copied = await copyText(access.deepLink, 'Ссылка скопирована');
                    if (!copied) HEYS.Toast?.info?.('Ссылка показана ниже');
                }
            } catch (e) {
                console.error('[HEYS.subs] ❌ getClientAccessLink error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось получить ссылку'));
            }
            setLoading(false);
        };

        const handleRegeneratePin = async () => {
            if (!confirm('Перевыпустить PIN и Telegram-ссылку? Старые PIN-сессии будут завершены, Telegram-привязка сброшена.')) return;
            setLoading(true);
            try {
                const res = await HEYS.TrialQueue?.admin?.regeneratePin?.(client.id);
                if (res && res.success) {
                    const deepLink = buildClientBotLink(res.pin_token);
                    const nextAccess = {
                        pin: res.pin,
                        deepLink,
                        pinTokenExpiresAt: res.pin_token_expires_at
                    };
                    const welcomeMessage = buildWelcomeMessage(nextAccess);
                    setAccessResult({
                        title: 'Новый доступ для клиента',
                        message: 'Скопируйте готовое сообщение и отправьте клиенту в его мессенджере.',
                        ...nextAccess,
                        welcomeMessage
                    });
                    HEYS.Toast?.success?.('PIN и ссылка перевыпущены');
                    onUpdate?.();
                } else {
                    const errorMessage = res?.message || res?.error?.message || res?.error || 'Не удалось перевыпустить PIN';
                    HEYS.Toast?.error?.(errorMessage);
                }
            } catch (e) {
                console.error('[HEYS.subs] ❌ regeneratePin error:', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'Не удалось перевыпустить PIN'));
            }
            setLoading(false);
        };

        // Продлить подписку
        const handleExtend = async () => {
            console.info('[HEYS.subs] ➕ Продление подписки', { clientId: client.id, clientName: client.name, months });
            setLoading(true);
            try {
                const { data: rawRes, error } = await HEYS.YandexAPI?.rpc?.('admin_extend_subscription', {
                    p_curator_id: curatorId,
                    p_client_id: client.id,
                    p_months: months
                }) || {};
                const res = unwrapRpcResult(rawRes, 'admin_extend_subscription');
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

        // Вернуть деньги (P0.5) — refund последнего completed платежа в ЮKassa.
        const handleRefund = async () => {
            console.info('[HEYS.subs] 💰 Запрос refund', { clientId: client.id, clientName: client.name });
            try {
                // Получаем последний completed платёж клиента
                const { data: payments, error: payErr } = await HEYS.YandexAPI
                    .from('payments')
                    .select('id, amount, plan, created_at, status')
                    .eq('client_id', client.id)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (payErr) {
                    HEYS.Toast?.error?.('Не удалось получить платёж: ' + payErr.message);
                    return;
                }
                const lastPayment = (payments || [])[0];
                if (!lastPayment) {
                    HEYS.Toast?.warning?.('У клиента нет завершённых платежей для возврата.');
                    return;
                }

                const ok = confirm(
                    `Вернуть ${lastPayment.amount}₽ за тариф ${lastPayment.plan}?\n\n` +
                    `Платёж от ${new Date(lastPayment.created_at).toLocaleString('ru-RU')}.\n` +
                    `Клиент сразу потеряет доступ (статус → read_only).`
                );
                if (!ok) return;

                setLoading(true);
                const { data: res, error } = await HEYS.YandexAPI.refundPayment(lastPayment.id);
                setLoading(false);

                if (error) {
                    console.error('[HEYS.subs] ❌ refund error', error);
                    HEYS.Toast?.error?.('Ошибка возврата: ' + (error.message || 'неизвестная'));
                    return;
                }

                console.info('[HEYS.subs] ✅ Refund initiated', res);
                HEYS.Toast?.success?.(
                    `✅ Возврат инициирован (${res.amount}₽). Деньги вернутся в течение нескольких минут.`
                );
                onUpdate?.();
                closeModal();
            } catch (e) {
                setLoading(false);
                console.error('[HEYS.subs] ❌ refund exception', e);
                HEYS.Toast?.error?.('Ошибка: ' + (e.message || 'не удалось вернуть деньги'));
            }
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
                const { data: rawRes, error } = await HEYS.YandexAPI?.rpc?.('admin_cancel_subscription', {
                    p_curator_id: curatorId,
                    p_client_id: client.id
                }) || {};
                const res = unwrapRpcResult(rawRes, 'admin_cancel_subscription');
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
                pill('Тариф', status === 'active' ? 'Активен' : status === 'trial' ? 'Триал' : status === 'trial_pending' ? 'Ожидание' : status === 'read_only' ? 'Ограничен' : 'Нет'),
                pill('Telegram', client.has_telegram_binding === true ? 'Привязан' : client.has_telegram_binding === false ? 'Не привязан' : 'Неизвестно')
            ),
            accessResult && h('div', { style: { display: 'grid', gap: 8, padding: 12, borderRadius: 10, background: accessResult.unavailable ? '#fff7ed' : '#f8fafc', border: `1px solid ${accessResult.unavailable ? '#fed7aa' : '#e2e8f0'}` } },
                h('div', { style: { fontSize: 12, fontWeight: 700, color: accessResult.unavailable ? '#c2410c' : '#475569' } }, accessResult.title || 'Ссылка для клиента'),
                accessResult.message && h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.4 } }, accessResult.message),
                accessResult.welcomeMessage && h('div', { style: { display: 'grid', gap: 8 } },
                    h('div', { style: { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0 } }, 'Сообщение клиенту'),
                    h('div', {
                        style: {
                            fontSize: 12,
                            color: '#334155',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.45,
                            maxHeight: 180,
                            overflowY: 'auto',
                            padding: 10,
                            borderRadius: 8,
                            background: '#fff',
                            border: '1px solid #cbd5e1'
                        }
                    }, accessResult.welcomeMessage),
                    h('button', {
                        onClick: () => copyText(accessResult.welcomeMessage, 'Сообщение клиенту скопировано'),
                        style: { ...btnBase, justifyContent: 'center', background: '#0f172a', color: '#fff', border: 'none' }
                    }, 'Скопировать сообщение клиенту')
                ),
                accessResult.pin && h('div', { style: { fontSize: 24, fontWeight: 800, letterSpacing: 8, fontFamily: 'monospace', color: '#111827' } }, accessResult.pin),
                accessResult.deepLink && h('div', { style: { fontSize: 11, color: '#475569', wordBreak: 'break-all', fontFamily: 'monospace' } }, accessResult.deepLink),
                accessResult.deepLink && !accessResult.pin && !accessResult.unavailable && h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.4 } },
                    'Для полного сообщения с PIN перевыпустите PIN и ссылку.'
                ),
                h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 } },
                    accessResult.pin && h('button', {
                        onClick: () => copyText(accessResult.pin, 'PIN скопирован'),
                        style: { ...btnBase, justifyContent: 'center', background: '#fff', color: '#334155', border: '1px solid #cbd5e1' }
                    }, 'Копировать PIN'),
                    h('button', {
                        onClick: () => copyText(accessResult.deepLink, 'Ссылка скопирована'),
                        disabled: !accessResult.deepLink,
                        style: { ...btnBase, justifyContent: 'center', background: '#fff', color: '#334155', border: '1px solid #cbd5e1' }
                    }, 'Копировать ссылку')
                )
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
                status === 'active' && h('button', {
                    onClick: handleRefund, disabled: loading,
                    style: { ...btnBase, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }
                }, loading ? '⏳ Возврат...' : '💰 Вернуть деньги (последний платёж)'),
                client.has_telegram_binding !== true && h('button', {
                    onClick: handleGetClientAccessLink,
                    disabled: loading || !HEYS.TrialQueue?.admin?.getClientAccessLink,
                    style: { ...btnBase, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }
                }, loading ? '⏳ Получение...' : '🔗 Скопировать ссылку'),
                h('button', {
                    onClick: handleClearTelegramBinding,
                    disabled: loading || !HEYS.TrialQueue?.admin?.clearTelegramBinding,
                    style: { ...btnBase, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }
                }, loading ? '⏳ Сброс...' : '📱 Сбросить Telegram-привязку'),
                h('button', {
                    onClick: handleRegeneratePin,
                    disabled: loading || !HEYS.TrialQueue?.admin?.regeneratePin,
                    style: { ...btnBase, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }
                }, loading ? '⏳ Выпуск...' : '🔐 Перевыпустить PIN и приглашение'),
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
                zIndex: CLIENT_ACTION_MODAL_Z,
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

    // ✏️ Модалка редактирования клиента (имя, телефон, PIN)
    function EditClientButton({ client, editClient }) {
        const [open, setOpen] = React.useState(false);
        const [loading, setLoading] = React.useState(false);
        const [name, setName] = React.useState(client.name || '');
        const [phone, setPhone] = React.useState(client.phone_normalized || client.phone || '');
        const [pin, setPin] = React.useState('');

        const formatPhone = (val) => {
            const d = (val || '').replace(/\D/g, '').slice(0, 11);
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
        };

        const closeModal = () => {
            setOpen(false);
            setName(client.name || '');
            setPhone(client.phone_normalized || client.phone || '');
            setPin('');
        };

        const handleSave = async () => {
            if (!name.trim()) return HEYS.Toast?.error?.('Имя не может быть пустым');

            // Если телефон меняют — нужна проверка
            const phoneDigits = (phone || '').replace(/\D/g, '');
            let finalPhone = phone;
            if (phoneDigits && phoneDigits !== (client.phone_normalized || '').replace(/\D/g, '')) {
                if (phoneDigits.length < 10) {
                    return HEYS.Toast?.error?.('Некорректный номер телефона');
                }
                const bodyLength = phoneDigits.startsWith('7') || phoneDigits.startsWith('8') ? phoneDigits.slice(1) : phoneDigits;
                if (bodyLength.length !== 10) {
                    return HEYS.Toast?.error?.('Телефон должен содержать 10 цифр (не считая код страны)');
                }
                finalPhone = '+7' + bodyLength;
            } else {
                finalPhone = undefined; // Не менялся
            }

            if (pin && !/^\d{4,6}$/.test(pin)) {
                return HEYS.Toast?.error?.('PIN должен быть 4-6 цифр');
            }

            setLoading(true);
            try {
                const updates = {};
                if (name.trim() !== client.name) updates.name = name.trim();
                if (finalPhone) updates.phone = finalPhone;
                if (pin) updates.newPin = pin;

                if (Object.keys(updates).length > 0) {
                    await editClient(client.id, updates);
                    HEYS.Toast?.success?.('Данные клиента обновлены');
                }
                closeModal();
            } catch (err) {
                HEYS.Toast?.error?.(err.message || 'Ошибка обновления клиента');
            } finally {
                setLoading(false);
            }
        };

        const triggerBtn = React.createElement('button', {
            className: 'btn-icon',
            title: 'Редактировать профиль',
            onClick: (e) => {
                e.stopPropagation();
                setName(client.name || '');
                setPhone(client.phone_normalized || client.phone || '');
                setPin('');
                setOpen(true);
            },
            style: { width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }, '✏️');

        const modalContent = React.createElement('div', {
            style: {
                width: 440, maxWidth: '92vw', background: '#fff',
                borderRadius: 20, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'scaleIn 0.2s ease-out'
            },
            onClick: (e) => e.stopPropagation()
        },
            // Header
            React.createElement('div', {
                style: {
                    padding: '16px 20px', background: 'linear-gradient(135deg, #0f172a, #334155)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }
            },
                React.createElement('div', { style: { fontWeight: 700, fontSize: 16 } }, 'Редактировать профиль'),
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
                        value: name,
                        onChange: (e) => setName(e.target.value),
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none' }
                    })
                ),
                // Phone
                React.createElement('div', null,
                    React.createElement('label', { style: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 } }, 'Номер телефона'),
                    React.createElement('input', {
                        placeholder: '+7 (999) 000-00-00',
                        value: formatPhone(phone),
                        onChange: (e) => setPhone((e.target.value || '').replace(/\D/g, '').slice(0, 11)),
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none', fontFamily: 'monospace' }
                    })
                ),
                // PIN
                React.createElement('div', null,
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
                        React.createElement('label', { style: { fontSize: 13, fontWeight: 600, color: '#374151' } }, 'Новый PIN'),
                        client.has_pin
                            ? React.createElement('span', { style: { fontSize: 12, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '2px 8px', letterSpacing: '2px' } }, 'Текущий: ••••')
                            : React.createElement('span', { style: { fontSize: 12, color: '#ef4444', background: '#fef2f2', borderRadius: 6, padding: '2px 8px' } }, 'PIN не установлен')
                    ),
                    React.createElement('input', {
                        placeholder: 'Оставьте пустым, если не меняется',
                        value: pin,
                        type: 'text',
                        maxLength: 6,
                        onChange: (e) => setPin(e.target.value.replace(/\D/g, '')),
                        onKeyDown: (e) => { if (e.key === 'Enter') handleSave(); },
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none', letterSpacing: pin ? '2px' : 'normal' }
                    })
                ),
                // Buttons
                React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 10 } },
                    React.createElement('button', {
                        onClick: closeModal,
                        style: { flex: 1, padding: '12px', borderRadius: 10, background: '#f3f4f6', color: '#4b5563', fontWeight: 600, border: 'none', cursor: 'pointer' }
                    }, 'Отмена'),
                    React.createElement('button', {
                        onClick: handleSave,
                        disabled: loading || (!name.trim()),
                        style: {
                            flex: 2, padding: '12px', borderRadius: 10,
                            background: name.trim() && !loading ? '#3b82f6' : '#9ca3af',
                            color: '#fff', fontWeight: 600, border: 'none',
                            cursor: name.trim() && !loading ? 'pointer' : 'default',
                            transition: 'background 0.2s', opacity: loading ? 0.7 : 1
                        }
                    }, loading ? 'Сохранение...' : 'Сохранить изменения')
                )
            )
        );

        const modalOverlay = open && ReactDOM.createPortal(
            React.createElement('div', {
                style: {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: CLIENT_ACTION_MODAL_Z, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
                },
                onClick: closeModal
            }, modalContent),
            document.body
        );

        return React.createElement(React.Fragment, null, triggerBtn, modalOverlay);
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
        const [loading, setLoading] = React.useState(false);
        const [accessResult, setAccessResult] = React.useState(null);

        const copyText = async (text, successMessage) => {
            if (!text) return false;
            try {
                if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
                await navigator.clipboard.writeText(text);
                HEYS.Toast?.success?.(successMessage || 'Скопировано');
                return true;
            } catch (e) {
                console.warn('[HEYS.clients] Clipboard copy failed:', e);
                HEYS.Toast?.error?.('Не удалось скопировать автоматически');
                return false;
            }
        };

        const buildWelcomeMessage = (access = {}) => {
            if (!access.pin || !access.deepLink) return '';
            return HEYS.TrialQueue?.buildClientWelcomeMessage?.({
                clientName: newName,
                phone: access.phone,
                pin: access.pin,
                deepLink: access.deepLink,
            }) || '';
        };

        const closeModal = () => {
            setOpen(false);
            setNewName('');
            setNewPhone('');
            setNewPin('');
            setAccessResult(null);
        };

        const handleCreate = async () => {
            const canCreate = newName.trim() && newPhone.trim() && /^\d{4}$/.test(newPin);
            if (!canCreate || loading) return;
            setLoading(true);
            try {
                const created = await addClientToCloud({ name: newName, phone: newPhone, pin: newPin });
                if (created?.ok && created.clientId) {
                    const nextAccess = {
                        phone: created.phone,
                        pin: created.pin,
                        deepLink: created.deepLink
                    };
                    setAccessResult({
                        ...nextAccess,
                        welcomeMessage: buildWelcomeMessage(nextAccess)
                    });
                    HEYS.Toast?.success?.('Клиент создан');
                } else if (created?.error) {
                    HEYS.Toast?.error?.('Ошибка создания: ' + (created.message || created.error));
                } else {
                    closeModal();
                }
            } finally {
                setLoading(false);
            }
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
                maxHeight: '90vh',
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
            React.createElement('div', { style: { padding: 20, display: 'grid', gap: 16, overflowY: 'auto' } },
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
	                        onChange: (e) => setNewPin((e.target.value || '').replace(/\D/g, '').slice(0, 4)),
                        onKeyDown: (e) => { if (e.key === 'Enter') handleCreate(); },
                        type: 'tel', /* numeric keyboard */
                        style: { width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15, outline: 'none', letterSpacing: 4, textAlign: 'center', fontWeight: 700 }
                    })
                ),
                // Info
                React.createElement('div', { style: { padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', lineHeight: 1.4 } },
                    '🔒 Клиент будет входить по этому телефону и PIN-коду. Обязательно сохраните эти данные.'
                ),
                accessResult && React.createElement('div', {
                    style: { display: 'grid', gap: 8, padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }
                },
                    React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: '#475569' } }, 'Доступ для клиента'),
                    accessResult.welcomeMessage && React.createElement(React.Fragment, null,
                        React.createElement('div', { style: { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0 } }, 'Сообщение клиенту'),
                        React.createElement('div', {
                            style: {
                                fontSize: 12,
                                color: '#334155',
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.45,
                                maxHeight: 180,
                                overflowY: 'auto',
                                padding: 10,
                                borderRadius: 8,
                                background: '#fff',
                                border: '1px solid #cbd5e1'
                            }
                        }, accessResult.welcomeMessage),
                        React.createElement('button', {
                            onClick: () => copyText(accessResult.welcomeMessage, 'Сообщение клиенту скопировано'),
                            style: { padding: '11px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
                        }, 'Скопировать сообщение клиенту')
                    ),
                    React.createElement('div', { style: { fontSize: 12, color: '#475569' } }, accessResult.phone || ''),
                    React.createElement('div', { style: { fontSize: 24, fontWeight: 800, letterSpacing: 8, fontFamily: 'monospace', color: '#111827', textAlign: 'center' } }, accessResult.pin || '—'),
                    accessResult.deepLink && React.createElement('div', { style: { fontSize: 11, color: '#475569', wordBreak: 'break-all', fontFamily: 'monospace' } }, accessResult.deepLink),
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 } },
                        React.createElement('button', {
                            onClick: () => copyText(accessResult.pin || '', 'PIN скопирован'),
                            style: { padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
                        }, 'Копировать PIN'),
                        React.createElement('button', {
                            onClick: () => copyText(accessResult.deepLink || '', 'Ссылка скопирована'),
                            disabled: !accessResult.deepLink,
                            style: { padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: accessResult.deepLink ? 'pointer' : 'default', fontSize: 13, fontWeight: 600 }
                        }, 'Копировать ссылку')
                    )
                ),
                // Button
                React.createElement('button', {
                    onClick: accessResult ? closeModal : handleCreate,
                    disabled: loading || (!accessResult && !(newName.trim() && newPhone.trim() && /^\d{4}$/.test(newPin))),
                    style: {
                        marginTop: 8,
                        width: '100%',
                        padding: '14px',
                        borderRadius: 12,
                        background: (!loading && (accessResult || (newName.trim() && newPhone.trim() && /^\d{4}$/.test(newPin)))) ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#e2e8f0',
                        color: (!loading && (accessResult || (newName.trim() && newPhone.trim() && /^\d{4}$/.test(newPin)))) ? '#fff' : '#94a3b8',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 16,
                        cursor: (!loading && (accessResult || (newName.trim() && newPhone.trim() && /^\d{4}$/.test(newPin)))) ? 'pointer' : 'not-allowed',
                        boxShadow: (!loading && (accessResult || (newName.trim() && newPhone.trim() && /^\d{4}$/.test(newPin)))) ? '0 4px 6px -1px rgba(37,99,235,0.2)' : 'none'
                    }
                }, accessResult ? 'Готово' : loading ? 'Создание...' : 'Создать клиента')
            )
        );

        const modalOverlay = open && ReactDOM.createPortal(
            React.createElement('div', {
                style: {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: CLIENT_ACTION_MODAL_Z,
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

    // Бейдж для таба «Заявки» — подгружает количество pending при монтировании
    // и обновляется по событию heys:pending-products-updated
    function PendingProductsBadge({ children }) {
        const [count, setCount] = React.useState(0);
        React.useEffect(() => {
            const load = async () => {
                try {
                    const res = await window.HEYS?.cloud?.getPendingProducts?.();
                    setCount(res?.data?.length || 0);
                } catch (_) {}
            };
            load();
            window.addEventListener('heys:pending-products-updated', load);
            return () => window.removeEventListener('heys:pending-products-updated', load);
        }, []);
        return React.createElement(React.Fragment, null,
            children,
            count > 0 && React.createElement('span', {
                style: {
                    marginLeft: 6,
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 6px',
                    fontSize: 11,
                    fontWeight: 700,
                    verticalAlign: 'middle',
                    lineHeight: 1
                }
            }, count)
        );
    }

    // Таб модерации — загружает полный список, показывает имя клиента, approve/reject
    function ModerationTab({ clients }) {
        const [pending, setPending] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        // Bulk approve: null когда idle, объект { total, done } во время обработки.
        const [bulkProgress, setBulkProgress] = React.useState(null);

        const load = React.useCallback(async () => {
            setLoading(true);
            try {
                const res = await window.HEYS?.cloud?.getPendingProducts?.();
                setPending(res?.data || []);
            } catch (_) {}
            setLoading(false);
        }, []);

        React.useEffect(() => {
            load();
        }, [load]);

        const clientMap = React.useMemo(() => {
            const m = {};
            (clients || []).forEach(c => {
                m[c.id] = c.name || c.phone_normalized || c.id.slice(0, 8);
            });
            return m;
        }, [clients]);

        const notifyUpdated = () => {
            try { window.dispatchEvent(new CustomEvent('heys:pending-products-updated')); } catch (_) {}
        };

        const getPendingRequest = (item) => {
            const request = item?.product_data?._pendingRequest || item?.product_data?._sharedChange || null;
            if (!request || typeof request !== 'object') return null;
            const type = request.type || request.request_type;
            return type ? { ...request, type } : null;
        };

        const getPendingLabel = (item) => {
            const request = getPendingRequest(item);
            if (!request) return 'Новый продукт';
            if (request.type === 'variant_create') return 'Новый вариант';
            if (request.type === 'barcode_update') return 'Штрихкоды';
            if (request.type === 'product_update') return 'Исправление';
            return 'Правка';
        };

        const approvePending = async (item) => {
            try {
                const result = await window.HEYS?.cloud?.approvePendingProduct?.(item.id, item.product_data);
                if (result?.status === 'race') {
                    window.HEYS?.Toast?.warning?.(result.message || 'Заявка уже обработана другим куратором');
                    setPending(prev => prev.filter(p => p.id !== item.id));
                    notifyUpdated();
                    return;
                }
                if (result?.error) {
                    const msg = result.error?.message || (typeof result.error === 'string' ? result.error : 'неизвестная ошибка');
                    window.HEYS?.Toast?.error?.('Ошибка: ' + msg) || alert('Ошибка: ' + msg);
                    return;
                }
                setPending(prev => prev.filter(p => p.id !== item.id));
                const name = item.product_data?.name || item.name_norm;
                if (result?.existing) {
                    window.HEYS?.Toast?.info?.(`Продукт "${name}" уже существует в общей базе`);
                } else if (result?.variant) {
                    window.HEYS?.Toast?.success?.(`Вариант "${name}" добавлен в общую базу`);
                } else {
                    window.HEYS?.Toast?.success?.(`Заявка "${name}" одобрена`);
                }
                notifyUpdated();
            } catch (err) {
                window.HEYS?.Toast?.error?.('Ошибка при подтверждении: ' + err.message) || alert('Ошибка: ' + err.message);
            }
        };

        // Bulk approve: батчами по 10, чтобы был визуальный прогресс
        // (BATCH=10 чтобы 30 заявок → 3 шага ≈ 600-900мс, юзер видит counter).
        const approveAllPending = async () => {
            const bulkItems = pending.filter(item => !getPendingRequest(item));
            if (bulkItems.length === 0 || bulkProgress) return;
            const confirmed = window.confirm(`Одобрить ${bulkItems.length} заявок на новые продукты? Дубликаты по fingerprint будут помечены approved без повторного INSERT.`);
            if (!confirmed) return;

            const BATCH_SIZE = 10;
            const all = bulkItems.slice();
            let totalApproved = 0, totalExisting = 0, totalRace = 0, totalFailed = 0;
            const allErrors = [];
            setBulkProgress({ total: all.length, done: 0 });
            try {
                for (let i = 0; i < all.length; i += BATCH_SIZE) {
                    const chunk = all.slice(i, i + BATCH_SIZE);
                    const res = await window.HEYS?.cloud?.approvePendingProductsBulk?.(chunk);
                    if (!res || res.success === false) {
                        const msg = res?.error?.message || res?.error || 'неизвестная ошибка';
                        window.HEYS?.Toast?.error?.('Bulk-approve ошибка: ' + msg);
                        break;
                    }
                    totalApproved += res.approved || 0;
                    totalExisting += res.existing || 0;
                    totalRace += res.already_moderated || 0;
                    totalFailed += res.failed || 0;
                    if (Array.isArray(res.errors)) allErrors.push(...res.errors);

                    // Удаляем из UI обработанные ids (всё кроме failed)
                    const failedIds = new Set((res.errors || []).map(e => e?.id).filter(Boolean));
                    const processedIds = new Set(chunk.map(c => c.id).filter(id => !failedIds.has(id)));
                    setPending(prev => prev.filter(p => !processedIds.has(p.id)));
                    setBulkProgress({ total: all.length, done: Math.min(i + BATCH_SIZE, all.length) });
                }
            } catch (e) {
                window.HEYS?.Toast?.error?.('Bulk-approve упал: ' + (e?.message || e));
            } finally {
                setBulkProgress(null);
                notifyUpdated();
            }

            // Итоговый toast
            const parts = [];
            if (totalApproved > 0) parts.push(`✅ одобрено ${totalApproved}`);
            if (totalExisting > 0) parts.push(`ℹ️ уже в базе ${totalExisting}`);
            if (totalRace > 0) parts.push(`⚠️ обработано другим куратором ${totalRace}`);
            if (totalFailed > 0) parts.push(`❌ ошибок ${totalFailed}`);
            const summary = parts.length > 0 ? parts.join(', ') : 'нечего обрабатывать';
            if (totalFailed === 0) {
                window.HEYS?.Toast?.success?.(`Готово: ${summary}`);
            } else {
                window.HEYS?.Toast?.warning?.(`С ошибками: ${summary}`);
                console.warn('[ModerationTab] bulk approve errors:', allErrors);
            }
        };

        const rejectPending = async (item) => {
            const reason = prompt('Причина отклонения (опционально):');
            if (reason === null) return;
            try {
                const result = await window.HEYS?.cloud?.rejectPendingProduct?.(item.id, reason);
                if (result?.status === 'race') {
                    window.HEYS?.Toast?.warning?.(result.message || 'Заявка уже обработана другим куратором');
                    setPending(prev => prev.filter(p => p.id !== item.id));
                    notifyUpdated();
                    return;
                }
                if (result?.error) {
                    const msg = result.error?.message || (typeof result.error === 'string' ? result.error : 'неизвестная ошибка');
                    window.HEYS?.Toast?.error?.('Ошибка: ' + msg) || alert('Ошибка: ' + msg);
                    return;
                }
                setPending(prev => prev.filter(p => p.id !== item.id));
                window.HEYS?.Toast?.info?.(`Заявка "${item.product_data?.name || item.name_norm}" отклонена`);
                notifyUpdated();
            } catch (err) {
                window.HEYS?.Toast?.error?.('Ошибка при отклонении: ' + err.message) || alert('Ошибка: ' + err.message);
            }
        };

        const calcKcal = (p) => {
            const prot = p.protein100 || 0;
            const carb = (p.simple100 || 0) + (p.complex100 || 0);
            const fat = (p.badFat100 || 0) + (p.goodFat100 || 0) + (p.trans100 || 0);
            return Math.round(prot * 4 + carb * 4 + fat * 9);
        };

        if (loading) {
            return React.createElement('div', {
                style: { padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 }
            }, '⏳ Загрузка заявок...');
        }

        if (pending.length === 0) {
            return React.createElement('div', {
                style: { padding: '48px 24px', textAlign: 'center' }
            },
                React.createElement('div', { style: { fontSize: 48, marginBottom: 12 } }, '✅'),
                React.createElement('div', { style: { fontSize: 15, color: 'rgba(15,23,42,0.6)' } }, 'Нет заявок на модерацию')
            );
        }

        const bulkEligibleCount = pending.filter(item => !getPendingRequest(item)).length;

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            // Bulk-approve панель: счётчик заявок + кнопка «Одобрить все».
            React.createElement('div', {
                style: {
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#f1f5f9', borderRadius: 10, padding: '10px 14px', gap: 12,
                    border: '1px solid rgba(148,163,184,0.25)'
                }
            },
                React.createElement('div', { style: { fontSize: 13, color: '#475569' } },
                    bulkProgress
                        ? `Обрабатываю ${bulkProgress.done}/${bulkProgress.total}...`
                        : `Заявок на модерацию: ${pending.length}${bulkEligibleCount !== pending.length ? ` · новых продуктов для массового approve: ${bulkEligibleCount}` : ''}`
                ),
                React.createElement('button', {
                    onClick: approveAllPending,
                    disabled: !!bulkProgress || bulkEligibleCount === 0,
                    title: bulkEligibleCount === 0 ? 'Массовое одобрение доступно только для новых продуктов' : 'Одобрить новые продукты сразу',
                    style: {
                        padding: '8px 14px', borderRadius: 8, border: 'none',
                        background: bulkProgress || bulkEligibleCount === 0 ? '#cbd5e1' : '#16a34a',
                        color: '#fff', fontWeight: 600, fontSize: 13,
                        cursor: bulkProgress ? 'wait' : 'pointer',
                        opacity: bulkEligibleCount === 0 ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 6
                    }
                }, bulkProgress ? '⏳ Обрабатываю...' : `✅ Одобрить новые (${bulkEligibleCount})`)
            ),
            pending.map(item => {
                const p = item.product_data || {};
                const clientName = clientMap[item.client_id] || item.client_id?.slice(0, 8) || '—';
                const pendingLabel = getPendingLabel(item);
                return React.createElement('div', {
                    key: item.id,
                    style: {
                        background: '#fff',
                        borderRadius: 12,
                        padding: '14px 16px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                        border: '1px solid rgba(148,163,184,0.2)'
                    }
                },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 } },
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            React.createElement('div', {
                                style: {
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: pendingLabel === 'Новый вариант' ? '#e0e7ff' : pendingLabel === 'Штрихкоды' ? '#dbeafe' : '#f1f5f9',
                                    color: '#334155',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    marginBottom: 6
                                }
                            }, pendingLabel),
                            React.createElement('div', {
                                style: { fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                            }, p.name || item.name_norm),
                            React.createElement('div', {
                                style: { fontSize: 12, color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }
                            },
                                React.createElement('span', null, `${calcKcal(p)} ккал`),
                                React.createElement('span', null, `Б:${p.protein100 || 0}`),
                                React.createElement('span', null, `У:${(p.simple100 || 0) + (p.complex100 || 0)}`),
                                React.createElement('span', null, `Ж:${(p.badFat100 || 0) + (p.goodFat100 || 0) + (p.trans100 || 0)}`),
                                p.gi && React.createElement('span', null, `ГИ:${p.gi}`),
                                (p.barcode || item.barcode) && React.createElement('span', {
                                    title: 'Штрихкод упаковки'
                                }, `▦ ${p.barcode || item.barcode}${Array.isArray(p.barcodes) && p.barcodes.length > 1 ? ` +${p.barcodes.length - 1}` : ''}`)
                            ),
                            React.createElement('div', { style: { fontSize: 11, color: '#94a3b8', display: 'flex', gap: 10 } },
                                React.createElement('span', null, `👤 ${clientName}`),
                                React.createElement('span', null, `📅 ${new Date(item.created_at).toLocaleDateString('ru-RU')}`)
                            )
                        ),
                        React.createElement('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                            React.createElement('button', {
                                onClick: () => approvePending(item),
                                disabled: !!bulkProgress,
                                title: bulkProgress ? 'Идёт массовое одобрение' : 'Одобрить',
                                style: {
                                    width: 36, height: 36, borderRadius: 8, border: 'none',
                                    background: '#dcfce7', cursor: bulkProgress ? 'wait' : 'pointer', fontSize: 16,
                                    opacity: bulkProgress ? 0.5 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }
                            }, '✅'),
                            React.createElement('button', {
                                onClick: () => rejectPending(item),
                                disabled: !!bulkProgress,
                                title: bulkProgress ? 'Идёт массовое одобрение' : 'Отклонить',
                                style: {
                                    width: 36, height: 36, borderRadius: 8, border: 'none',
                                    background: '#fee2e2', cursor: bulkProgress ? 'wait' : 'pointer', fontSize: 16,
                                    opacity: bulkProgress ? 0.5 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }
                            }, '❌')
                        )
                    )
                );
            })
        );
    }

    function OpsDashboardButton() {
        const [open, setOpen] = React.useState(false);
        const [loading, setLoading] = React.useState(false);
        const [error, setError] = React.useState('');
        const [status, setStatus] = React.useState(null);
        const [lastCheck, setLastCheck] = React.useState(null);
        const [checkMessage, setCheckMessage] = React.useState('');
        const autoCheckStartedRef = React.useRef(false);
        const h = React.createElement;

        const load = React.useCallback(async (refresh) => {
            if (!HEYS.YandexAPI?.rpc) {
                setError('Ops API недоступен');
                return;
            }
            setLoading(true);
            setError('');
            setCheckMessage(refresh ? 'Запускаем серверную проверку...' : 'Загружаем текущий статус...');
            const startedAt = Date.now();
            const fnName = refresh ? 'admin_refresh_ops_status' : 'admin_get_ops_status';
            try {
                console.info('[HEYS.ops.dashboard] request:start', { fn: fnName, refresh: Boolean(refresh) });
            } catch (_) { }
            try {
                const res = await HEYS.YandexAPI.rpc(fnName, {});
                if (res?.error && refresh && /not allowed/i.test(res.error.message || '')) {
                    const fallback = await HEYS.YandexAPI.rpc('admin_get_ops_status', {});
                    if (fallback?.error) throw new Error(fallback.error.message || 'Ops API error');
                    const fallbackData = fallback?.data?.admin_get_ops_status || fallback?.data || null;
                    const tookMs = Date.now() - startedAt;
                    setStatus(fallbackData);
                    setLastCheck({ at: Date.now(), fn: 'admin_get_ops_status', tookMs, ok: fallbackData?.ok === true, fallback: true });
                    setCheckMessage(`Показан текущий статус за ${tookMs} ms`);
                    setError('Refresh ещё не задеплоен на API; показан текущий статус');
                    try {
                        console.info('[HEYS.ops.dashboard] request:fallback', { tookMs, open: fallbackData?.counts?.open_incidents, backup: fallbackData?.backup?.status || null });
                    } catch (_) { }
                    return;
                }
                if (res?.error) throw new Error(res.error.message || 'Ops API error');
                const data = res?.data?.[fnName] || res?.data || null;
                const tookMs = Date.now() - startedAt;
                setStatus(data);
                setLastCheck({ at: Date.now(), fn: fnName, tookMs, ok: data?.ok === true, fallback: false });
                setCheckMessage(refresh ? `Проверка завершена за ${tookMs} ms` : `Статус загружен за ${tookMs} ms`);
                try {
                    console.info('[HEYS.ops.dashboard] request:success', { fn: fnName, tookMs, ok: data?.ok === true, open: data?.counts?.open_incidents, backup: data?.backup?.status || null });
                } catch (_) { }
            } catch (e) {
                const tookMs = Date.now() - startedAt;
                setError(e?.message || 'Не удалось загрузить Ops');
                setLastCheck({ at: Date.now(), fn: fnName, tookMs, ok: false, error: true });
                setCheckMessage(`Проверка не завершилась: ${e?.message || 'ошибка'}`);
                try {
                    console.error('[HEYS.ops.dashboard] request:error', { fn: fnName, tookMs, message: e?.message || String(e) });
                } catch (_) { }
            } finally {
                setLoading(false);
            }
        }, []);

        React.useEffect(() => {
            if (autoCheckStartedRef.current) return;
            autoCheckStartedRef.current = true;
            const timer = setTimeout(() => { void load(true); }, 150);
            return () => clearTimeout(timer);
        }, [load]);

        const openDashboard = () => {
            setOpen(true);
            if (!status && !loading) void load(false);
        };

        const backup = status?.backup || null;
        const heartbeats = Array.isArray(status?.heartbeats) ? status.heartbeats : [];
        const incidents = Array.isArray(status?.incidents) ? status.incidents : [];
        const deploys = Array.isArray(status?.deploys) ? status.deploys : [];
        const openIncidents = incidents.filter((item) => item.status === 'open');
        const staleHeartbeats = heartbeats.filter((item) => item.stale);
        const ok = status?.ok === true;
        const lastCheckTime = lastCheck?.at ? new Date(lastCheck.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        const openCount = Number(status?.counts?.open_incidents ?? openIncidents.length ?? 0);
        const criticalCount = Number(status?.counts?.critical_open ?? openIncidents.filter((item) => item.severity === 'critical').length ?? 0);
        const staleCount = Number(status?.counts?.stale_heartbeats ?? staleHeartbeats.length ?? 0);
        const backupBad = Boolean(status && (!backup || backup.status !== 'ok' || Number(backup.hours_ago || 999) > 30));
        const issueScore = openCount + staleCount + (backupBad ? 1 : 0);
        const systemHealth = (() => {
            if (loading && !status) return { tone: 'checking', label: 'Проверяем', hint: 'Идёт автопроверка', dot: '#60a5fa', bg: 'rgba(239,246,255,0.16)', border: 'rgba(147,197,253,0.42)', color: '#dbeafe' };
            if (error && !status) return { tone: 'critical', label: 'Ошибка', hint: error, dot: '#f87171', bg: 'rgba(254,242,242,0.16)', border: 'rgba(248,113,113,0.42)', color: '#fee2e2' };
            if (!status) return { tone: 'unknown', label: 'Система', hint: 'Статус ещё не загружен', dot: '#cbd5e1', bg: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.28)', color: '#fff' };
            if (ok) return { tone: 'ok', label: 'OK', hint: 'Все проверки зелёные', dot: '#4ade80', bg: 'rgba(240,253,244,0.16)', border: 'rgba(134,239,172,0.48)', color: '#dcfce7' };
            if (issueScore >= 3 || (backupBad && staleCount > 0)) return { tone: 'critical', label: 'Критично', hint: `${openCount} open`, dot: '#f87171', bg: 'rgba(254,242,242,0.16)', border: 'rgba(248,113,113,0.46)', color: '#fee2e2' };
            return { tone: 'warning', label: 'Внимание', hint: `${openCount || criticalCount || issueScore} open`, dot: '#facc15', bg: 'rgba(254,249,195,0.16)', border: 'rgba(250,204,21,0.48)', color: '#fef9c3' };
        })();
        const card = (good) => ({
            padding: 12,
            borderRadius: 10,
            border: good ? '1px solid #bbf7d0' : '1px solid #fecdd3',
            background: good ? '#f0fdf4' : '#fff1f2',
            color: good ? '#14532d' : '#991b1b'
        });
        const renderRunbook = (item) => {
            const details = item?.details || {};
            if (!details.runbook_title && !details.runbook_command) return null;
            return h('div', { style: { marginTop: 8, display: 'grid', gap: 4, color: '#64748b', fontSize: 12 } },
                details.runbook_title && h('span', null, details.runbook_title),
                details.runbook_command && h('code', {
                    style: {
                        padding: '4px 6px',
                        borderRadius: 6,
                        background: '#f1f5f9',
                        color: '#0f172a',
                        overflowWrap: 'anywhere'
                    }
                }, details.runbook_command)
            );
        };

	        return h(React.Fragment, null,
	            h('button', {
	                type: 'button',
	                title: `Статус системы: ${systemHealth.label}`,
	                'aria-label': `Статус системы: ${systemHealth.label}. Открыть Ops dashboard`,
	                onClick: openDashboard,
	                style: {
	                    minHeight: 34,
	                    minWidth: 118,
	                    padding: '5px 9px',
	                    borderRadius: 8,
	                    border: `1px solid ${systemHealth.border}`,
	                    background: systemHealth.bg,
	                    color: systemHealth.color,
	                    cursor: 'pointer',
	                    fontSize: 11,
	                    fontWeight: 700,
	                    display: 'inline-flex',
	                    alignItems: 'center',
	                    justifyContent: 'center',
                        gap: 7,
                        lineHeight: 1.1
	                }
	            },
                    h('span', {
                        'aria-hidden': 'true',
                        style: {
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: systemHealth.dot,
                            boxShadow: `0 0 0 3px ${systemHealth.dot}24`,
                            flex: '0 0 auto'
                        }
                    }),
                    h('span', { style: { display: 'grid', gap: 1, textAlign: 'left' } },
                        h('span', { style: { opacity: 0.82, fontSize: 10 } }, 'Система'),
                        h('span', null, systemHealth.label)
                    )
                ),
            open && h('div', {
                role: 'presentation',
                onClick: () => setOpen(false),
                style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 13000,
                    background: 'rgba(15, 23, 42, 0.48)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 14
                }
            },
                h('div', {
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Ops dashboard',
                    onClick: (e) => e.stopPropagation(),
                    style: {
                        width: 'min(560px, calc(100vw - 28px))',
                        maxHeight: 'min(760px, calc(100vh - 28px))',
                        overflow: 'auto',
                        borderRadius: 16,
                        background: '#fff',
                        color: '#0f172a',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 24px 80px rgba(15,23,42,0.34)'
                    }
                },
                    h('div', {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '16px 18px',
                            borderBottom: '1px solid #e2e8f0'
                        }
                    },
                        h('div', null,
                            h('div', { style: { fontWeight: 800, fontSize: 17 } }, 'Ops dashboard'),
                            h('div', { style: { color: '#64748b', fontSize: 12, marginTop: 2 } },
                                ok ? 'Серверные проверки без активных инцидентов' : 'Есть пункты, требующие внимания'
                            )
                        ),
                        h('div', { style: { display: 'flex', gap: 8 } },
                            h('button', {
                                type: 'button',
                                onClick: () => load(true),
                                disabled: loading,
                                style: {
                                    minHeight: 34,
                                    padding: '7px 10px',
                                    borderRadius: 8,
	                                    border: '1px solid #86efac',
	                                    background: '#f0fdf4',
	                                    color: '#14532d',
	                                    cursor: loading ? 'default' : 'pointer',
                                        opacity: loading ? 0.72 : 1,
	                                    fontWeight: 700
	                                }
	                            }, loading ? 'Проверяем...' : 'Проверить сейчас'),
                            h('button', {
                                type: 'button',
                                'aria-label': 'Закрыть Ops dashboard',
                                onClick: () => setOpen(false),
                                style: {
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    border: '1px solid #e2e8f0',
                                    background: '#fff',
                                    color: '#0f172a',
                                    cursor: 'pointer',
                                    fontSize: 18
                                }
                            }, '×')
                        )
	                    ),
	                    h('div', { style: { padding: 18, display: 'grid', gap: 12 } },
	                        error && h('div', { style: { ...card(false), fontSize: 13 } }, error),
                            (loading || checkMessage || lastCheckTime) && h('div', {
                                role: 'status',
                                'aria-live': 'polite',
                                style: {
                                    padding: '9px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #e2e8f0',
                                    background: loading ? '#f8fafc' : '#f1f5f9',
                                    color: '#334155',
                                    fontSize: 12,
                                    display: 'grid',
                                    gap: 2
                                }
	                            },
	                                h('div', { style: { fontWeight: 700 } }, loading ? 'Проверка выполняется' : (lastCheck?.error ? 'Последняя проверка завершилась ошибкой' : 'Последняя проверка завершена')),
	                                h('div', null, checkMessage || (lastCheckTime ? `Обновлено в ${lastCheckTime}` : '')),
                                    lastCheck && h('div', { style: { color: '#64748b', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' } },
                                        `${lastCheck.fn || 'ops'} · ${lastCheckTime || '—'} · ${lastCheck.tookMs || 0} ms`
                                    )
	                            ),
	                        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 } },
                            h('div', { style: card(ok) },
                                h('div', { style: { fontSize: 12, opacity: 0.8 } }, 'Status'),
                                h('div', { style: { fontSize: 18, fontWeight: 800 } }, ok ? 'OK' : `${openIncidents.length} open`)
                            ),
                            h('div', { style: card(backup && backup.status === 'ok' && Number(backup.hours_ago || 999) <= 30) },
                                h('div', { style: { fontSize: 12, opacity: 0.8 } }, 'Backup'),
                                h('div', { style: { fontSize: 18, fontWeight: 800 } }, backup ? `${backup.status} · ${backup.hours_ago}h` : 'нет данных')
                            ),
                            h('div', { style: card(staleHeartbeats.length === 0) },
                                h('div', { style: { fontSize: 12, opacity: 0.8 } }, 'Heartbeats'),
                                h('div', { style: { fontSize: 18, fontWeight: 800 } }, staleHeartbeats.length ? `${staleHeartbeats.length} stale` : 'fresh')
                            )
                        ),
                        h('div', { style: { display: 'grid', gap: 8 } },
                            h('div', { style: { fontWeight: 800 } }, 'Активные инциденты'),
                            openIncidents.length === 0
                                ? h('div', { style: { color: '#64748b', fontSize: 13 } }, loading ? 'Загружаем...' : 'Активных инцидентов нет')
                                : openIncidents.slice(0, 6).map((item) => h('div', {
                                    key: `${item.source}:${item.event_key}`,
                                    style: {
                                        padding: 10,
                                        borderRadius: 10,
                                        border: '1px solid #e2e8f0',
                                        background: '#f8fafc'
                                    }
                                },
                                    h('div', { style: { fontWeight: 700, marginBottom: 3 } }, item.title),
                                    h('div', { style: { color: '#64748b', fontSize: 12 } }, `${item.source} · ${item.severity} · ${item.occurrence_count || 1} раз`),
                                    renderRunbook(item)
                                ))
                        ),
                        h('div', { style: { display: 'grid', gap: 8 } },
                            h('div', { style: { fontWeight: 800 } }, 'Deploy receipts'),
                            deploys.length === 0
                                ? h('div', { style: { color: '#64748b', fontSize: 13 } }, 'Пока нет записей о deploy')
                                : deploys.slice(0, 4).map((item, index) => h('div', {
                                    key: `${item.deployed_at || index}:${item.deploy_group}`,
                                    style: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '7px 0', borderBottom: '1px solid #e2e8f0' }
                                },
                                    h('span', null, `${item.deploy_group || 'unknown'} · ${String(item.deploy_commit || 'unknown').slice(0, 8)}`),
                                    h('span', { style: { color: item.status === 'ok' ? '#166534' : '#991b1b' } }, item.status || 'unknown')
                                ))
                        )
                    )
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
            editClient,
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

        const GATE_SKELETON_DELAY_MS = 280;
        const gateLoaderSinceKey = '__heysGateLoaderSince';

        const gate = !clientId
            ? (isInitializing
                ? (() => {
                    const now = Date.now();
                    if (!window[gateLoaderSinceKey]) {
                        window[gateLoaderSinceKey] = now;
                    }
                    const elapsedMs = now - window[gateLoaderSinceKey];

                    if (elapsedMs < GATE_SKELETON_DELAY_MS) {
                        if (window.__heysGateSkeletonState !== 'wait_delay') {
                            console.info('[HEYS.sceleton] ⏱️ gate_wait_delay', {
                                elapsedMs,
                                delayMs: GATE_SKELETON_DELAY_MS,
                            });
                            window.__heysGateSkeletonState = 'wait_delay';
                        }
                        return null;
                    }

                    if (window.__heysGateSkeletonState !== 'show_loader') {
                        console.info('[HEYS.sceleton] 🦴 gate_show_loader', {
                            elapsedMs,
                            delayMs: GATE_SKELETON_DELAY_MS,
                        });
                        window.__heysGateSkeletonState = 'show_loader';
                    }

                    return React.createElement(HEYS.AppLoader, {
                        message: 'Загрузка...',
                        subtitle: 'Подключение к серверу'
                    });
                })()
                : !cloudUser
                    ? (() => {
                        // v9.11: Remove HTML login gate before mounting React LoginScreen
                        // to prevent two overlapping login UIs (HTML gate shows PIN form,
                        // React LoginScreen would overlay it and reset user's curator choice).
                        var _htmlGate = document.getElementById('heys-login-gate');
                        if (_htmlGate) {
                            // Preserve curator email if user was typing in HTML gate
                            try {
                                var _curEmail = document.getElementById('hlg-curator-email');
                                if (_curEmail && _curEmail.value) {
                                    window.__hlgCuratorEmail = _curEmail.value;
                                }
                                var _curPass = document.getElementById('hlg-curator-pass');
                                if (_curPass && _curPass.value) {
                                    window.__hlgCuratorPassword = _curPass.value;
                                }
                            } catch (_e) { }
                            _htmlGate.remove();
                            console.info('[HEYS.gate] ✅ HTML login gate removed — React LoginScreen takes over');
                        }
                        // Inherit screen choice from HTML gate (curator/client)
                        var _inheritedMode = window.__hlgCurrentScreen === 'curator' ? 'curator' : 'client';
                        return React.createElement(
                            HEYS.LoginScreen,
                            {
                                initialMode: _inheritedMode,
                                onCuratorLogin: async ({ email, password }) => {
                                    const res = await cloudSignIn(email, password, { rememberMe: true });
                                    return res && res.error ? { error: res.error } : { ok: true };
                                },
                                initialEmail: window.__hlgCuratorEmail || '',
                                initialPassword: window.__hlgCuratorPassword || '',
                                autoCuratorLogin: window.__hlgTempCuratorAutoLogin === true,
                                curatorAutologinConfig: window.__hlgTempCuratorAutologinConfig || null,
                                onClientLogin: async ({ phone, pin }) => {
                                    const auth = HEYS && HEYS.auth;
                                    const fn = auth && auth.loginClient;
                                    const res = fn ? await fn({ phone, pin }) : { ok: false, error: 'cloud_not_ready' };
                                    if (res && res.ok && res.clientId) {
                                        const targetClientId = res.clientId;
                                        const phoneNorm = (HEYS.auth?.normalizePhone?.(phone) || phone);

                                        // 🚀 Stage 2: вместо `await switchClient` (5–10с под VPN) — резолвим
                                        // setClientId по эвенту heysSyncCompleted{phaseA:true} (~300-800мс).
                                        // Полный sync продолжается в фоне. Caller получает res сразу
                                        // после loginClient и закрывает форму, AppShell монтируется
                                        // как только Phase A отгрузит 5 критичных ключей.
                                        let resolved = false;
                                        const finalize = () => {
                                            if (resolved) return;
                                            resolved = true;
                                            writeGlobalValue('heys_last_client_id', targetClientId);
                                            try { writeGlobalValue('heys_client_phone', phoneNorm); } catch (_) { }
                                            // Sync HEYS.currentClientId до setClientId, чтобы lsGet
                                            // (с auto-scope для clientSpecificKeys) корректно подхватил
                                            // scoped профиль до того как стартует wizard-проверка.
                                            try {
                                                window.HEYS = window.HEYS || {};
                                                window.HEYS.currentClientId = targetClientId;
                                            } catch (_) { }
                                            setClientId(targetClientId);
                                        };
                                        const phaseAHandler = (e) => {
                                            if (resolved) return;
                                            if (e && e.detail && e.detail.phaseA && e.detail.clientId === targetClientId) {
                                                window.removeEventListener('heysSyncCompleted', phaseAHandler);
                                                finalize();
                                            }
                                        };
                                        window.addEventListener('heysSyncCompleted', phaseAHandler);

                                        if (HEYS.cloud && HEYS.cloud.switchClient) {
                                            // Fire-and-forget: фон ведёт полный sync, мы ждём только Phase A
                                            HEYS.cloud.switchClient(targetClientId)
                                                .catch(() => { /* sync ошибки обрабатываются нижестоящими слоями */ })
                                                .finally(() => {
                                                    window.removeEventListener('heysSyncCompleted', phaseAHandler);
                                                    // Fallback: если Phase A не запускалась (delta fast-path
                                                    // на повторном входе) — финализируем сейчас.
                                                    finalize();
                                                });
                                        } else {
                                            try { U.lsSet('heys_client_current', targetClientId); } catch (_) { }
                                            window.removeEventListener('heysSyncCompleted', phaseAHandler);
                                            finalize();
                                        }
                                    }
                                    return res;
                                },
                            }
                        );
                    })()
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
                                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                                            React.createElement(OpsDashboardButton),
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
                                            // P0.11: бейдж "+N" если есть новые лиды
                                            HEYS.TrialQueue?.NewLeadsBadge
                                                ? React.createElement(HEYS.TrialQueue.NewLeadsBadge, null, '📋 Очередь')
                                                : '📋 Очередь'
                                        ),
                                        React.createElement(
                                            'button',
                                            {
                                                onClick: () => {
                                                    console.info('[HEYS.gate] 🔘 Переключение на таб Заявки');
                                                    setCuratorTab('moderation');
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
                                                    background: curatorTab === 'moderation' ? 'rgba(255,255,255,0.95)' : 'transparent',
                                                    color: curatorTab === 'moderation' ? '#0f172a' : 'rgba(255,255,255,0.8)'
                                                }
                                            },
                                            React.createElement(PendingProductsBadge, null, '✅ Заявки')
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
                                                    .slice()
                                                    .sort((a, b) => {
                                                        // 💬 Сначала клиенты с непрочитанными сообщениями
                                                        const inbox = window.HEYS?.MessengerAPI?.getInboxCache?.() || {};
                                                        const ua = inbox[a.id]?.unread_count || 0;
                                                        const ub = inbox[b.id]?.unread_count || 0;
                                                        return ub - ua;
                                                    })
                                                    .map((c, idx) => {
                                                        const stats = getClientStats(c.id);
                                                        const isLast = readGlobalValue('heys_last_client_id', '') === c.id;
                                                        const messengerInbox = window.HEYS?.MessengerAPI?.getInboxCache?.() || {};
                                                        const msgEntry = messengerInbox[c.id];
                                                        const unreadCount = msgEntry?.unread_count || 0;
                                                        const lastPreview = msgEntry?.last_message_preview;
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
                                                                onClick: () => {
                                                                    setTimeout(async () => {
                                                                        console.info('[HEYS.gate] 👤 Выбор клиента', { clientId: c.id, clientName: c.name });

                                                                        // 🔧 v69 FIX: Запоминаем старый clientId ДО обновления
                                                                        const _prevClientId_gate = (window.HEYS?.currentClientId) || '';

                                                                        // 🔧 v69 CRITICAL: НЕ меняем currentClientId до завершения switchClient!
                                                                        // Иначе React видит нового клиента, а данные в state ещё от старого →
                                                                        // debounced flush сохраняет старые данные под нового клиента = контаминация.
                                                                        // Вместо этого: ставим флаг switching, ждём switchClient, потом обновляем ID.
                                                                        if (HEYS.cloud) {
                                                                            HEYS.cloud._switchClientInProgress = true;
                                                                        }

                                                                        // Уведомляем UI, показываем skeleton (без смены currentClientId)
                                                                        window.dispatchEvent(new CustomEvent('heys:client-switching', { detail: { clientId: c.id } }));

                                                                        if (HEYS.cloud && HEYS.cloud.switchClient) {
                                                                            try {
                                                                                await HEYS.cloud.switchClient(c.id, _prevClientId_gate);
                                                                            } catch (err) {
                                                                                console.error('[HEYS.gate] ❌ Ошибка sync, retry через 3с:', err);
                                                                                try {
                                                                                    await new Promise(r => setTimeout(r, 3000));
                                                                                    await HEYS.cloud.switchClient(c.id, _prevClientId_gate);
                                                                                } catch (err2) {
                                                                                    console.error('[HEYS.gate] ❌ Retry failed:', err2);
                                                                                    window.dispatchEvent(new CustomEvent('heys:sync-error', {
                                                                                        detail: { clientId: c.id, error: err2?.message || String(err2) }
                                                                                    }));
                                                                                }
                                                                            }
                                                                        }

                                                                        // 🔧 v69: Теперь switchClient завершился, данные нового клиента загружены.
                                                                        // Безопасно обновляем currentClientId и уведомляем React.
                                                                        writeGlobalValue('heys_last_client_id', c.id);
                                                                        writeGlobalValue('heys_client_current', c.id);
                                                                        window.HEYS = window.HEYS || {};
                                                                        window.HEYS.currentClientId = c.id;
                                                                        setClientId(c.id);
                                                                        console.info('[HEYS.gate] ✅ Клиент переключён (после sync)', { clientId: c.id });
                                                                        window.__heysLastDispatchedClientId = c.id;
                                                                        window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId: c.id } }));
                                                                    }, 0);
                                                                }
                                                            },
                                                            // Аватар с цветом по букве + 💬 badge непрочитанных
                                                            React.createElement(
                                                                'div',
                                                                { style: { position: 'relative', flexShrink: 0 } },
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
                                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                                                        }
                                                                    },
                                                                    getClientInitials(c.name)
                                                                ),
                                                                unreadCount > 0 && React.createElement('div', {
                                                                    className: 'curator-card-unread-badge',
                                                                    style: {
                                                                        position: 'absolute',
                                                                        top: -4,
                                                                        right: -4,
                                                                        minWidth: 20,
                                                                        height: 20,
                                                                        padding: '0 5px',
                                                                        borderRadius: 10,
                                                                        background: '#dc2626',
                                                                        color: '#fff',
                                                                        fontSize: 11,
                                                                        fontWeight: 700,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        border: '2px solid #fff',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                                                    }
                                                                }, String(unreadCount))
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

                                                                // 💬 Preview последнего сообщения (если есть)
                                                                lastPreview && React.createElement('div', {
                                                                    className: 'curator-card-msg-preview',
                                                                    style: {
                                                                        fontSize: 12,
                                                                        color: unreadCount > 0 ? 'var(--text, #111)' : 'var(--muted, #888)',
                                                                        fontWeight: unreadCount > 0 ? 600 : 400,
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        maxWidth: '100%',
                                                                        marginTop: 2
                                                                    }
                                                                },
                                                                    '💬 ' +
                                                                    (lastPreview.sender_role === 'curator' ? 'Ты: ' : '') +
                                                                    (lastPreview.body ||
                                                                     (lastPreview.intent_type === 'meal' ? 'съел...' :
                                                                      lastPreview.intent_type === 'training' ? 'тренировался' :
                                                                      lastPreview.intent_type === 'weight' ? 'вес' : ''))
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
                                                                    React.createElement(EditClientButton, {
                                                                        client: c,
                                                                        editClient
                                                                    }),
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
                                                                            const confirmed = confirm(`Удалить клиента "${c.name}"?\n\nПосле удаления появится кнопка отмены.`);
                                                                            if (!confirmed) return;
                                                                            removeClient(c.id, {
                                                                                enableUndo: true,
                                                                                name: c.name
                                                                            });
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
                                    curatorTab === 'queue' && React.createElement(HEYS.TrialQueue.TrialQueueAdmin),

                                    // === TAB: MODERATION (Заявки на продукты) ===
                                    curatorTab === 'moderation' && React.createElement(ModerationTab, { clients })
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

        if (!isInitializing && window[gateLoaderSinceKey]) {
            delete window[gateLoaderSinceKey];
            if (window.__heysGateSkeletonState !== 'ready') {
                console.info('[HEYS.sceleton] ✅ gate_ready');
                window.__heysGateSkeletonState = 'ready';
            }
        }

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
            tab,
        } = props;

        // Planning tab bypasses desktop gate
        if (tab === 'tasks') return null;

        return !gate && isDesktop && !isCurator && !desktopAllowed
            ? React.createElement(DesktopGateScreen, {
                onLogout: () => {
                    // Выход из PIN auth
                    removeGlobalValue('heys_pin_auth_client');
                    removeGlobalValue('heys_session_token');
                    removeGlobalValue('heys_last_client_id');
                    removeGlobalValue('heys_client_current');
                    removeGlobalValue('heys_client_phone');
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
            setCheckingConsent,
            setShowMorningCheckin,
            // Compliance overhaul 2026-05-20
            outdatedTypes = [],
            graceExpiresAt = null,
            mustBlockReconsent = false,
            needsAgeGate = false,
            consentCheckError = null,
            setOutdatedTypes,
            setMustBlockReconsent,
            setNeedsAgeGate,
            setConsentCheckError,
        } = props;

        const clientPhone = typeof localStorage !== 'undefined' ? readGlobalValue('heys_client_phone', null) : null;
        const isPinSessionActive = (() => {
            try {
                return !!HEYS.cloud?.isPinAuthClient?.()
                    || !!HEYS.auth?.getSessionToken?.()
                    || !!readGlobalValue('heys_session_token', null)
                    || !!readGlobalValue('heys_pin_auth_client', null)
                    || !!readGlobalValue('heys_pin_cookie_session_hint', null);
            } catch (_) {
                return false;
            }
        })();
        const consentEligible = !gate && !desktopGate && (!cloudUser || isPinSessionActive) && clientId;
        const baseEligible = consentEligible && !checkingConsent;

        // Diagnostic (debug-only, не засоряет prod console)
        if (needsConsent && !baseEligible) {
            console.debug('[CONSENTS GATE] needsConsent=true но baseEligible=false:',
                { hasGate: !!gate, hasDesktopGate: !!desktopGate, cloudUser: !!cloudUser, isPinSessionActive, clientId: !!clientId, checkingConsent });
        }
        const hasOutdatedRequiredConsents = (outdatedTypes || []).length > 0;
        const shouldBlockForConsents = needsConsent || mustBlockReconsent || hasOutdatedRequiredConsents;

        if (baseEligible && shouldBlockForConsents && !HEYS.Consents?.ConsentScreen) {
            console.debug('[CONSENTS GATE] ConsentScreen компонент ещё не загружен');
        }

        const renderGateMessage = ({ title, text, tone = 'loading', actions = [] }) => {
            const isError = tone === 'error';
            return React.createElement('div', {
                className: 'heys-consent-status-gate',
                style: {
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '28px',
                    background: '#f7f8f6',
                    boxSizing: 'border-box',
                },
                role: isError ? 'alert' : 'status',
                'aria-live': isError ? 'assertive' : 'polite',
            }, React.createElement('div', {
                className: 'heys-consent-status-panel',
                style: {
                    width: '100%',
                    maxWidth: '420px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '18px',
                    boxShadow: '0 18px 45px rgba(31, 41, 55, 0.08)',
                    padding: '24px',
                    boxSizing: 'border-box',
                },
            },
                React.createElement('div', {
                    style: {
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: isError ? '#fff4e5' : '#eef7f0',
                        color: isError ? '#9a5b00' : '#256f3f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        marginBottom: '16px',
                    },
                }, isError ? '!' : '...'),
                React.createElement('h1', {
                    style: {
                        margin: '0 0 10px',
                        color: '#1f2937',
                        fontSize: '24px',
                        lineHeight: 1.22,
                        fontWeight: 700,
                    },
                }, title),
                React.createElement('p', {
                    style: {
                        margin: '0',
                        color: '#4b5563',
                        fontSize: '16px',
                        lineHeight: 1.5,
                    },
                }, text),
                actions.length ? React.createElement('div', {
                    style: {
                        display: 'grid',
                        gap: '10px',
                        marginTop: '22px',
                    },
                }, actions.map((action, idx) => React.createElement('button', {
                    key: action.key || idx,
                    type: 'button',
                    onClick: action.onClick,
                    style: {
                        minHeight: '46px',
                        borderRadius: '12px',
                        border: idx === 0 ? '0' : '1px solid #d1d5db',
                        background: idx === 0 ? '#256f3f' : '#ffffff',
                        color: idx === 0 ? '#ffffff' : '#374151',
                        fontSize: '16px',
                        fontWeight: 600,
                    },
                }, action.label))) : null
            ));
        };

        if (consentEligible && checkingConsent) {
            return null;
        }

        if (baseEligible && consentCheckError) {
            const retryConsentCheck = () => {
                setConsentCheckError && setConsentCheckError(null);
                setNeedsConsent(false);
                setCheckingConsent && setCheckingConsent(true);
                try {
                    window.dispatchEvent(new CustomEvent('heys:consents-ready'));
                } catch (_) { /* noop */ }
            };
            return renderGateMessage({
                title: 'Не удалось загрузить данные',
                text: 'Мы не смогли проверить уже принятые согласия. Форма согласий не открыта, чтобы не просить подписывать документы заново.',
                tone: 'error',
                actions: [
                    { key: 'retry', label: 'Повторить загрузку', onClick: retryConsentCheck },
                    { key: 'reload', label: 'Обновить страницу', onClick: () => window.location.reload() },
                ],
            });
        }

        // ── Сценарий A: блокирующий ConsentScreen (отсутствуют согласия ИЛИ
        // устарели обязательные документы — re-consent обязателен до приложения).
        if (baseEligible && shouldBlockForConsents && HEYS.Consents?.ConsentScreen) {
            return React.createElement(HEYS.Consents.ConsentScreen, {
                clientId: clientId,
                phone: clientPhone,
                onComplete: () => {
                    console.log('[CONSENTS] ✅ Согласия приняты');
                    setNeedsConsent(false);
                    setMustBlockReconsent && setMustBlockReconsent(false);
                    setOutdatedTypes && setOutdatedTypes([]);
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
                    removeGlobalValue('heys_session_token');
                    removeGlobalValue('heys_last_client_id');
                    removeGlobalValue('heys_client_current');
                    removeGlobalValue('heys_client_phone');
                    window.HEYS?.cloud?._setPinAuthMode?.(false, null);
                    setClientId(null);
                    window.location.reload();
                }
            });
        }

        // ── Сценарий B: AgeGateModal (старый клиент без birth_year, но
        // основные согласия в порядке). Показываем поверх приложения.
        if (baseEligible && needsAgeGate && HEYS.Consents?.AgeGateModal) {
            return React.createElement(HEYS.Consents.AgeGateModal, {
                key: 'age-gate',
                onConfirm: () => {
                    console.log('[CONSENTS] ✅ Возраст подтверждён (18+)');
                    setNeedsAgeGate && setNeedsAgeGate(false);
                },
                onDismiss: () => {
                    setNeedsAgeGate && setNeedsAgeGate(false);
                },
            });
        }

        // ── Сценарий C: fallback-баннер для старого bundle, если ConsentScreen
        // ещё не загрузился. Нормальный PIN-flow блокируется сценарием A.
        if (baseEligible && (outdatedTypes || []).length > 0 && HEYS.Consents?.ConsentOutdatedBanner) {
            return React.createElement(HEYS.Consents.ConsentOutdatedBanner, {
                key: 'outdated-banner',
                outdatedTypes: outdatedTypes,
                graceExpiresAt: graceExpiresAt,
                onClick: () => {
                    // Открываем re-consent блокирующий экран по требованию пользователя
                    setMustBlockReconsent && setMustBlockReconsent(true);
                },
            });
        }

        return null;
    }

    HEYS.AppGateFlow = {
        buildGate,
        buildDesktopGate,
        buildConsentGate,
    };
})();
