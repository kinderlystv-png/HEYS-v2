// heys_app_gate_flow_v1.js — Gate flow UI (login, client select, desktop/consents)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const U = HEYS.utils || {};
    const CLIENT_ACTION_MODAL_Z = 12050;

    function useFallbackPinFieldState() {
        const [value, setValue] = React.useState('');
        return {
            pinValue: value,
            isComplete: value.length >= 4,
            resetDigits: () => setValue(''),
            applyPinDigits: (arr) => setValue((arr || []).slice(0, 4).join('')),
        };
    }

    function getPinKeypadKit() {
        return HEYS.AuthPinKeypad?.createKit?.(React) || null;
    }

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
        if (statusRaw === 'trial_pending') return 'trial_pending';
        if (trialStartsAt && trialStartsAt > now) return 'trial_pending';
        if (trialEndsAt && trialEndsAt > now) return 'trial';

        return statusRaw || 'none';
    };

    // Тип тренировки словом — тот же словарь, что в пикере клиента
    // (heys_day_picker_modals.js): куратор и клиент называют её одинаково.
    const TRAINING_TYPE = {
        cardio: 'кардио',
        strength: 'силовая',
        hobby: 'хобби',
        fingers: 'пальцы'
    };

    function pluralMeals(n) {
        const abs = Math.abs(n) % 100;
        const last = abs % 10;
        if (abs > 10 && abs < 20) return 'приёмов';
        if (last === 1) return 'приём';
        if (last > 1 && last < 5) return 'приёма';
        return 'приёмов';
    }

    // Вход сегодня называется часом, вход раньше — днями: «04:05» на позавчера
    // читается как сегодняшняя ночь и врёт о свежести.
    function visitAgo(iso) {
        const at = new Date(iso);
        if (Number.isNaN(at.getTime())) return '';
        const now = new Date();
        if (at.toDateString() === now.toDateString()) {
            return at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        const days = Math.max(1, Math.round((now - at) / 86400000));
        if (days === 1) return 'вчера';
        const abs = days % 100;
        const last = abs % 10;
        const word = (abs > 10 && abs < 20) ? 'дней'
            : last === 1 ? 'день' : (last > 1 && last < 5) ? 'дня' : 'дней';
        return days + ' ' + word + ' назад';
    }

    // Дата пилюли в списке — день и месяц; год дописывается, только когда он
    // не этот. «до 23.09.2026» в карточке значит ровно то же, что «до 23.09»,
    // но занимает вдвое больше строки, которую делит с именем клиента.
    const shortDate = (d) => {
        const opts = d.getFullYear() === new Date().getFullYear()
            ? { day: '2-digit', month: '2-digit' }
            : { day: '2-digit', month: '2-digit', year: 'numeric' };
        return d.toLocaleDateString('ru-RU', opts);
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

        if (status === 'trial_pending') {
            const startDate = client.trial_started_at ? new Date(client.trial_started_at) : null;
            const startText = startDate && !Number.isNaN(startDate.getTime())
                ? startDate.toLocaleDateString('ru-RU')
                : '?';
            return { emoji: '🕐', color: '#3b82f6', bg: '#dbeafe', text: `Начнётся ${startText}`, urgent: false };
        }

        if (daysLeft !== null && daysLeft < 0) {
            return { emoji: '🔴', color: '#dc2626', bg: '#fee2e2', text: `Просрочена ${Math.abs(daysLeft)} дн.`, urgent: true };
        }

        if (daysLeft !== null && daysLeft <= 3) {
            return {
                emoji: '🟡', color: '#d97706', bg: '#fef3c7',
                text: `Истекает через ${daysLeft} дн.`,
                short: `ещё ${daysLeft} дн.`,
                urgent: true
            };
        }

        if (daysLeft !== null && daysLeft <= 7) {
            return {
                emoji: '🟡', color: '#ca8a04', bg: '#fef9c3',
                text: `До ${endDate.toLocaleDateString('ru-RU')}`,
                short: `до ${shortDate(endDate)}`,
                urgent: false
            };
        }

        if (status === 'trial') {
            return {
                emoji: '⏳', color: '#6366f1', bg: '#e0e7ff',
                text: `Триал до ${endDate.toLocaleDateString('ru-RU')}`,
                short: `триал до ${shortDate(endDate)}`,
                urgent: false
            };
        }

        if (status === 'active') {
            return {
                emoji: '🟢', color: '#16a34a', bg: '#dcfce7',
                text: `Активна до ${endDate.toLocaleDateString('ru-RU')}`,
                // Короткая форма — для пилюли в карточке списка: полная
                // («Активна до 23.09.2026») занимала треть строки и выдавливала
                // имя клиента в многоточие. В листе подписки остаётся полная:
                // там дата — предмет разговора, а не метка.
                short: `до ${shortDate(endDate)}`,
                urgent: false
            };
        }

        if (status === 'read_only') {
            return { emoji: '🔒', color: '#dc2626', bg: '#fee2e2', text: 'Доступ ограничен', urgent: true };
        }

        return { emoji: '⚪', color: '#6b7280', bg: '#f3f4f6', text: status, urgent: false };
    };

    // ⚙️ Компонент управления подпиской клиента (портал + enterprise UI)
    // renderTrigger — необязательный: контракт «меню клиента вместо пяти
    // кружков» собирает безымянные круглые кнопки в лист со строками, а вся
    // модальная логика остаётся здесь. Без него компонент рисует прежнюю
    // кнопку, поэтому старые места вызова не трогаются.
    function ClientSubscriptionButton({ client, curatorId, onUpdate, renderTrigger }) {
        const [open, setOpen] = React.useState(false);
        const [view, setView] = React.useState('main'); // main | trial | extend
        // Остальные действия свёрнуты: лист открывают ради продления.
        const [restOpen, setRestOpen] = React.useState(false);
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
                    client.trial_started_at = res.trial_started_at || null;
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
                    client.trial_started_at = null;
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

        // Строка «ключ — значение» того же вида, что в карточке анкеты: пилюли
        // с рамкой и три плитки со статусом рассказывали одно и то же тремя
        // приёмами, а лист про подписку отвечает всего на четыре вопроса.
        const kv = (key, value, tone) => h('div', { key, className: 'cur-kv' },
            h('span', { className: 'cur-kv__key' }, key),
            h('span', { className: 'cur-kv__val' + (tone ? ' is-' + tone : '') }, value)
        );

        // Строка списка действий: имя слева, что произойдёт — справа. Прежде
        // семь кнопок стояли в столбик равного веса, и «Сбросить подписку»
        // выглядела так же, как «Продлить».
        const actionRow = (label, hint, onClick, tone) => h('button', {
            key: label,
            type: 'button',
            className: 'cur-cab__menu-row' + (tone ? ' is-' + tone : ''),
            onClick,
            disabled: loading
        },
            h('span', { className: 'cur-cab__menu-label' }, label),
            h('span', { className: 'cur-cab__menu-hint' }, hint)
        );

        // Внутренние виды листа — та же форма, что у главного: заголовок,
        // выбор, ряд действий. Прежде здесь стояли зелёный и синий градиенты
        // с галочками и песочными часами: три градиента на весь кабинет жили
        // ровно в этих двух экранах.
        const trialView = () => h('div', { className: 'cur-cab__sheet-body' },
            h('div', null,
                h('div', { className: 'cur-cab__tab-title' }, 'Активация триала'),
                h('div', { className: 'cur-cab__tab-note' }, 'Доступ на 7 дней с выбранной даты')
            ),
            h('label', { className: 'cur-field' },
                h('span', { className: 'cur-field__label' }, 'Дата начала'),
                h('input', {
                    className: 'cur-field__input',
                    type: 'date',
                    value: trialDate,
                    onChange: (e) => setTrialDate(e.target.value)
                })
            ),
            h('div', { className: 'cur-cab__tab-note' },
                trialDate === new Date().toISOString().split('T')[0]
                    ? 'Триал начнётся сегодня, доступ на 7 дней'
                    : 'Триал начнётся ' + formatDate(trialDate) + ', доступ на 7 дней'),
            h('div', { className: 'cur-cab__actions' },
                h('button', {
                    type: 'button',
                    className: 'cur-cab__open is-soft',
                    onClick: () => setView('main')
                }, 'Назад'),
                h('button', {
                    type: 'button',
                    className: 'cur-cab__open',
                    onClick: handleActivateTrial,
                    disabled: loading
                }, loading ? 'Активируем…' : 'Активировать')
            )
        );

        const extendView = () => h('div', { className: 'cur-cab__sheet-body' },
            h('div', null,
                h('div', { className: 'cur-cab__tab-title' }, 'Продление подписки'),
                h('div', { className: 'cur-cab__tab-note' }, 'От текущей даты окончания')
            ),
            // Выбор длительности — чипы набора, а не плитки с синей рамкой:
            // это тот же выбор одного из нескольких, что и фильтр панели.
            h('div', { className: 'cur-panel__chips' },
                [1, 2, 3, 6].map((m) => h('button', {
                    key: m,
                    type: 'button',
                    className: 'cur-chip' + (months === m ? ' is-on' : ''),
                    onClick: () => setMonths(m)
                }, m + ' мес'))
            ),
            h('div', { className: 'cur-cab__tab-note' },
                'Подписка будет продлена на ' + months + ' мес. от текущей даты окончания'),
            h('div', { className: 'cur-cab__actions' },
                h('button', {
                    type: 'button',
                    className: 'cur-cab__open is-soft',
                    onClick: () => setView('main')
                }, 'Назад'),
                h('button', {
                    type: 'button',
                    className: 'cur-cab__open',
                    onClick: handleExtend,
                    disabled: loading
                }, loading ? 'Продлеваем…' : 'Продлить на ' + months + ' мес')
            )
        );

        // Карточка выданного доступа: PIN, ссылка и сообщение клиенту. Вынесена
        // из тела листа отдельной функцией — она появляется только после
        // действия и не должна мешать читать состав подписки.
        // Карточка выданного доступа: PIN, ссылка и сообщение клиенту.
        // Вынесена из тела листа отдельной функцией — она появляется только
        // после действия и не должна мешать читать состав подписки.
        const accessCard = () => h('div', {
            className: 'cur-cab__access' + (accessResult.unavailable ? ' is-warn' : '')
        },
            h('div', { className: 'cur-cab__access-title' },
                accessResult.title || 'Ссылка для клиента'),
            accessResult.message
                ? h('div', { className: 'cur-cab__tab-note' }, accessResult.message)
                : null,
            // PIN крупно и моноширинно: его диктуют вслух или переписывают.
            accessResult.pin
                ? h('div', { className: 'cur-cab__access-pin' }, accessResult.pin)
                : null,
            accessResult.deepLink
                ? h('div', { className: 'cur-cab__access-link' }, accessResult.deepLink)
                : null,
            accessResult.welcomeMessage
                ? h('div', { className: 'cur-cab__access-msg' }, accessResult.welcomeMessage)
                : null,
            accessResult.deepLink && !accessResult.pin && !accessResult.unavailable
                ? h('div', { className: 'cur-cab__tab-note' },
                    'Для полного сообщения с PIN перевыпустите PIN и ссылку.')
                : null,
            h('div', { className: 'cur-cab__actions' },
                accessResult.welcomeMessage ? h('button', {
                    type: 'button',
                    className: 'cur-cab__open',
                    onClick: () => copyText(accessResult.welcomeMessage, 'Сообщение клиенту скопировано')
                }, 'Скопировать сообщение') : null,
                accessResult.pin ? h('button', {
                    type: 'button',
                    className: 'cur-cab__open is-soft',
                    onClick: () => copyText(accessResult.pin, 'PIN скопирован')
                }, 'Копировать PIN') : null,
                h('button', {
                    type: 'button',
                    className: 'cur-cab__open is-soft',
                    onClick: () => copyText(accessResult.deepLink, 'Ссылка скопирована'),
                    disabled: !accessResult.deepLink
                }, 'Копировать ссылку')
            )
        );

        // «Ещё пять действий» — счёт словом склоняется вместе с числом.
        const pluralActions = (n) => {
            const abs = Math.abs(n) % 100;
            const last = abs % 10;
            if (abs > 10 && abs < 20) return 'действий';
            if (last === 1) return 'действие';
            if (last > 1 && last < 5) return 'действия';
            return 'действий';
        };

        const mainView = () => {
            // Кадр «Подписка клиента»: шапка с именем и сроком, список из
            // четырёх строк, одно главное действие и остальные под кнопкой.
            const rest = [
                (status === 'none' || status === 'read_only') && ['Активировать триал', 'открыть', () => {
                    setTrialDate(new Date().toISOString().split('T')[0]);
                    setView('trial');
                }, null],
                status === 'active' && ['Вернуть деньги за последний платёж', 'вернуть', handleRefund, 'bad'],
                client.has_telegram_binding !== true && HEYS.TrialQueue?.admin?.getClientAccessLink
                    && ['Скопировать ссылку для входа', 'скопировать', handleGetClientAccessLink, null],
                HEYS.TrialQueue?.admin?.regeneratePin
                    && ['Перевыпустить PIN и приглашение', 'выпустить', handleRegeneratePin, null],
                HEYS.TrialQueue?.admin?.clearTelegramBinding
                    && ['Сбросить Telegram-привязку', 'сбросить', handleClearTelegramBinding, null],
                status !== 'none' && ['Сбросить подписку', 'сбросить', handleCancel, 'bad'],
            ].filter(Boolean);
            // Разрушающие — последними: в прежнем столбике «Сбросить подписку»
            // стояла между «Скопировать ссылку» и «Перевыпустить PIN».
            rest.sort((x, y) => (x[3] === 'bad' ? 1 : 0) - (y[3] === 'bad' ? 1 : 0));

            return h('div', { className: 'cur-cab__sheet-body' },
                h('div', { className: 'cur-cab__client-head' },
                    h('span', { className: 'cur-row__avatar' }, getClientInitials(client.name)),
                    h('span', { className: 'cur-cab__client-copy' },
                        h('span', { className: 'cur-row__name' }, client.name),
                        h('span', {
                            className: 'cur-cab__sheet-term' + (badge.urgent ? ' is-warn' : '')
                        }, badge.text)
                    )
                ),

                h('div', { className: 'cur-group__card cur-cab__kvs' },
                    kv('Тариф', status === 'active' ? 'Pro · активен'
                        : status === 'trial' ? 'Триал'
                            : status === 'trial_pending' ? 'Триал ещё не начался'
                                : status === 'read_only' ? 'Доступ ограничен' : 'Нет подписки',
                        status === 'active' ? 'ok' : null),
                    kv('Триал', client.trial_ends_at ? 'до ' + formatDate(client.trial_ends_at) : 'не было'),
                    kv('Telegram', client.has_telegram_binding === true ? 'привязан'
                        : client.has_telegram_binding === false ? 'не привязан' : 'неизвестно'),
                    kv('ID клиента', (client.id || '').slice(0, 8) + '…')
                ),

                accessResult ? accessCard() : null,

                h('button', {
                    type: 'button',
                    className: 'cur-cab__open',
                    onClick: () => { setMonths(1); setView('extend'); },
                    disabled: loading
                }, 'Продлить подписку'),

                rest.length ? h('div', { className: 'cur-cab__rest' },
                    h('button', {
                        type: 'button',
                        className: 'cur-cab__create',
                        onClick: () => setRestOpen((v) => !v)
                    }, restOpen ? 'Скрыть остальные действия'
                        : 'Ещё ' + rest.length + ' ' + pluralActions(rest.length)),
                    restOpen ? h('div', { className: 'cur-group__card' },
                        rest.map(([label, hint, onClick, tone]) => actionRow(label, hint, onClick, tone))
                    ) : null
                ) : null
            );
        };

        // Контракт «вид · служебные листы»: модалка с тёмной шапкой заменена
        // листом снизу. Геометрия, скрим и закрытие — общие с листом поправки
        // и меню клиента: один приём на весь кабинет, а не третий вид окна.
        const modalContent = h('div', { className: 'cur-cab__sheet' },
            h('div', { className: 'cur-cab__sheet-head' },
                h('div', { className: 'cur-cab__sheet-title' }, 'Подписка и тариф'),
                // Закрытие — круглая кнопка 40 px, как у всех уводящих кнопок
                // набора: квадрат 28 px на тёмной шапке был мал для пальца.
                h('button', {
                    type: 'button',
                    className: 'cur-cab__sheet-close',
                    onClick: closeModal,
                    'aria-label': 'Закрыть'
                }, '✕')
            ),
            view === 'main' ? mainView() : view === 'trial' ? trialView() : extendView()
        );

        // Скрим набора: те же размытие и затемнение, что у листа поправки и
        // меню клиента. Лист прижат к низу — рука дотягивается.
        const modalOverlay = open && h('div', {
            className: 'cur-cab__sheet-scrim',
            style: { zIndex: CLIENT_ACTION_MODAL_Z },
            onClick: (e) => { if (e.target === e.currentTarget) closeModal(); }
        }, modalContent);

        const portal = open && ReactDOM?.createPortal
            ? ReactDOM.createPortal(modalOverlay, document.body)
            : modalOverlay;

        const openSubs = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            console.info('[HEYS.subs] ⚙️ Открыта панель управления подпиской', { clientId: client.id });
            setOpen(true);
            setView('main');
        };
        if (renderTrigger) {
            return h(React.Fragment, null, renderTrigger({ open: openSubs, badge }), open ? portal : null);
        }

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
    /**
     * Меню клиента: пять безымянных круглых кнопок собраны в один лист.
     *
     * Контракт «меню клиента вместо пяти кружков». Действий не убавилось и не
     * прибавилось — у каждого появилось имя. Удаление стоит последним и своим
     * тоном: в прежнем ряду оно было рядом с «посмотреть» и такого же вида,
     * так что промах стоил клиента.
     *
     * Состав отличается от кадра. В кадре пункты «Подписка и тариф», «Анкета и
     * цели», «Настройки»; в кабинете настроек клиента нет, а есть диагностика
     * загрузок и копирование id — их и называем. Выдумывать пункт, ведущий в
     * никуда, нельзя, а прятать существующее действие запрещает строка «что
     * менялось».
     */
    function ClientActionsMenu({ client, curatorId, editClient, copyClientId, removeClient }) {
        const [open, setOpen] = React.useState(false);
        const close = () => setOpen(false);

        const row = (label, onClick, tone) => React.createElement('button', {
            key: label,
            type: 'button',
            className: 'cur-cab__menu-row' + (tone ? ' is-' + tone : ''),
            onClick: (e) => {
                e.stopPropagation();
                close();
                onClick(e);
            }
        },
            React.createElement('span', { className: 'cur-cab__menu-label' }, label),
            React.createElement('span', { className: 'cur-cab__menu-hint' },
                tone === 'bad' ? 'запросить' : 'открыть')
        );

        return React.createElement(React.Fragment, null,
            React.createElement('button', {
                type: 'button',
                className: 'cur-cab__more',
                title: 'Ещё действия',
                'aria-label': 'Ещё действия: ' + (client.name || 'клиент'),
                onClick: (e) => { e.stopPropagation(); setOpen(true); }
            }, '⋯'),

            open ? React.createElement('div', {
                className: 'cur-cab__menu-scrim',
                onClick: (e) => { e.stopPropagation(); close(); }
            },
                React.createElement('div', {
                    className: 'cur-cab__menu',
                    role: 'dialog',
                    'aria-modal': 'true',
                    onClick: (e) => e.stopPropagation()
                },
                    React.createElement('div', { className: 'cur-cab__menu-head' },
                        React.createElement('span', { className: 'cur-row__avatar' },
                            // Инициалы берём у общего модуля: внутри карточки они
                            // приходят пропом, а меню живёт своей функцией.
                            HEYS.AppClientHelpers?.getClientInitials?.(client.name)
                              || (client.name || '—').slice(0, 1).toUpperCase()),
                        React.createElement('span', { className: 'cur-sheet__copy' },
                            React.createElement('span', { className: 'cur-row__name' }, client.name),
                            React.createElement('span', { className: 'cur-sheet__meta' },
                                getSubscriptionBadge(client).text)
                        )
                    ),
                    React.createElement('div', { className: 'cur-group__card' },
                        // «Анкета и цели» и «Подписка и тариф» — те же компоненты,
                        // что раньше рисовали кружки: наружу вынесен только вид
                        // кнопки, вся модальная логика осталась внутри них.
                        React.createElement(EditClientButton, {
                            client, editClient,
                            renderTrigger: ({ open: openEdit }) => row('Анкета и цели', openEdit)
                        }),
                        React.createElement(ClientSubscriptionButton, {
                            client, curatorId,
                            onUpdate: () => window.dispatchEvent(new CustomEvent('heys:clients-updated')),
                            renderTrigger: ({ open: openSubs }) => row('Подписка и тариф', openSubs)
                        }),
                        row('Диагностика загрузок', () => {
                            HEYS.ClientDiagnostics?.show?.({ clientId: client.id, clientName: client.name });
                        }),
                        row('Скопировать id', (e) => {
                            console.info('[HEYS.gate] 🆔 Копирование ID', { clientId: client.id });
                            copyClientId(e);
                        }),
                        row('Удалить клиента', () => {
                            const confirmed = confirm('Удалить клиента "' + client.name
                                + '"?\n\nПосле удаления появится кнопка отмены.');
                            if (!confirmed) return;
                            removeClient(client.id, { enableUndo: true, name: client.name });
                        }, 'bad')
                    )
                )
            ) : null
        );
    }

    // renderTrigger — то же, что у подписки: строка листа вместо кружка.
    function EditClientButton({ client, editClient, renderTrigger }) {
        const [open, setOpen] = React.useState(false);
        const [loading, setLoading] = React.useState(false);
        const [name, setName] = React.useState(client.name || '');
        const [phone, setPhone] = React.useState(client.phone_normalized || client.phone || '');
        const pinKeypadKit = getPinKeypadKit();
        const useEditPinField = pinKeypadKit ? pinKeypadKit.usePinKeypad : useFallbackPinFieldState;
        const editPinField = useEditPinField({
            disabled: loading,
            idPrefix: 'edit-client-pin',
            autoFocus: false,
        });
        const editPinKeypadRef = React.useRef(null);
        const pin = editPinField.pinValue;

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
            editPinField.resetDigits();
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

        const openEdit = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            setName(client.name || '');
            setPhone(client.phone_normalized || client.phone || '');
            editPinField.resetDigits();
            setOpen(true);
        };
        const triggerBtn = renderTrigger
            ? renderTrigger({ open: openEdit })
            : React.createElement('button', {
            className: 'btn-icon',
            title: 'Редактировать профиль',
            onClick: (e) => {
                e.stopPropagation();
                setName(client.name || '');
                setPhone(client.phone_normalized || client.phone || '');
                editPinField.resetDigits();
                setOpen(true);
            },
            style: { width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }, '✏️');

        const modalContent = React.createElement('div', {
            className: 'cur-cab__sheet',
            onClick: (e) => e.stopPropagation()
        },
                        // Тот же лист, что у подписки и меню клиента: одна форма
                        // окна на весь кабинет, а не третий вид.
                        React.createElement('div', { className: 'cur-cab__sheet-head' },
                            React.createElement('div', { className: 'cur-cab__sheet-title' }, 'Анкета и цели'),
                            React.createElement('button', {
                                type: 'button',
                                className: 'cur-cab__sheet-close',
                                onClick: closeModal,
                                'aria-label': 'Закрыть'
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
                    React.createElement('div', { className: 'muted', style: { fontSize: 12, marginBottom: 8 } }, 'Оставьте пустым, если PIN не меняется'),
                    pinKeypadKit
                        ? pinKeypadKit.renderPinKeypadSection({
                            pin: editPinField,
                            sectionClassName: 'heys-auth-pin-section space-y-3 is-active',
                            keypadRef: editPinKeypadRef,
                        })
                        : React.createElement('input', {
                            placeholder: 'Оставьте пустым, если не меняется',
                            value: pin,
                            type: 'text',
                            maxLength: 6,
                            onChange: (e) => editPinField.applyPinDigits((e.target.value || '').replace(/\D/g, '').slice(0, 4).split('').concat(['', '', '', '']).slice(0, 4)),
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
                className: 'cur-cab__sheet-scrim',
                style: { zIndex: CLIENT_ACTION_MODAL_Z },
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
        const pinKeypadKit = getPinKeypadKit();
        const useCreatePinField = pinKeypadKit ? pinKeypadKit.usePinKeypad : useFallbackPinFieldState;
        const createPinField = useCreatePinField({
            disabled: loading || !!accessResult,
            idPrefix: 'create-client-pin',
            autoFocus: false,
        });
        const createPinKeypadRef = React.useRef(null);

        React.useEffect(() => {
            setNewPin(createPinField.pinValue);
        }, [createPinField.pinValue, setNewPin]);

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
            createPinField.resetDigits();
            setNewPin('');
            setAccessResult(null);
        };

        const handleCreate = async () => {
            const auth = HEYS.auth;
            const phoneNorm = auth?.normalizePhone ? auth.normalizePhone(newPhone) : newPhone;
            const canCreate = newName.trim()
                && auth?.isValidPhone?.(phoneNorm)
                && createPinField.isComplete;
            if (!canCreate || loading) {
                if (newName.trim() && newPhone.trim() && !auth?.isValidPhone?.(phoneNorm)) {
                    HEYS.Toast?.error?.('Введите корректный номер: 11 цифр, начинается с 7');
                }
                return;
            }
            setLoading(true);
            try {
                const created = await addClientToCloud({ name: newName, phone: newPhone, pin: createPinField.pinValue });
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
                    const msg = created.message || created.error;
                    HEYS.Toast?.error?.('Ошибка создания: ' + msg);
                } else if (created?.id && !created?.clientId) {
                    HEYS.Toast?.success?.('Клиент создан');
                    closeModal();
                } else if (!created?.ok) {
                    HEYS.Toast?.error?.('Не удалось создать клиента. Проверьте номер и попробуйте снова.');
                }
            } finally {
                setLoading(false);
            }
        };

        // Кадр «Кабинет · Клиенты»: вторичная кнопка набора внизу списка.
        // Прежде она была голубой пунктирной плашкой с ➕ и синим текстом —
        // единственное синее место кабинета, и весила больше, чем «Открыть
        // дневник» в карточках над ней, хотя создание клиента редкое действие.
        const triggerBtn = React.createElement('button', {
            type: 'button',
            className: 'cur-cab__create',
            onClick: () => setOpen(true)
        }, 'Создать клиента');

        const modalContent = React.createElement('div', {
            className: 'cur-cab__sheet',
            onClick: (e) => e.stopPropagation()
        },
            // Тот же лист, что у подписки и анкеты: одна форма окна на кабинет.
            React.createElement('div', { className: 'cur-cab__sheet-head' },
                React.createElement('div', { className: 'cur-cab__sheet-title' }, 'Новый клиент'),
                React.createElement('button', {
                    type: 'button',
                    className: 'cur-cab__sheet-close',
                    onClick: closeModal,
                    'aria-label': 'Закрыть'
                }, '✕')
            ),
            // Кадр «Новый клиент»: подпись над полем 10,5 px, поле 44 радиусом
            // 14 на грунте набора. Обязательные поля не помечаются звёздочкой —
            // необязательных в форме нет.
            React.createElement('div', { className: 'cur-cab__sheet-body' },
                React.createElement('label', { className: 'cur-field' },
                    React.createElement('span', { className: 'cur-field__label' }, 'Имя'),
                    React.createElement('input', {
                        className: 'cur-field__input',
                        placeholder: 'Иван Иванов',
                        value: newName,
                        onChange: (e) => setNewName(e.target.value)
                    })
                ),
                React.createElement('label', { className: 'cur-field' },
                    React.createElement('span', { className: 'cur-field__label' }, 'Телефон'),
                    React.createElement('input', {
                        className: 'cur-field__input',
                        placeholder: '+7 (999) 000-00-00',
                        // Форма записи та же, что во «Входе»: куратор диктует
                        // клиенту номер в том же виде, в каком клиент его потом
                        // вводит сам.
                        type: 'tel',
                        inputMode: 'tel',
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
                        onChange: (e) => setNewPhone((e.target.value || '').replace(/\D/g, '').slice(0, 11))
                    })
                ),
                React.createElement('div', { className: 'cur-field' },
                    React.createElement('span', { className: 'cur-field__label' }, 'PIN — 4 цифры'),
                    pinKeypadKit
                        ? pinKeypadKit.renderPinKeypadSection({
                            pin: createPinField,
                            sectionClassName: 'heys-auth-pin-section space-y-3 is-active',
                            keypadRef: createPinKeypadRef,
                        })
                        : React.createElement('input', {
                            className: 'cur-field__input is-pin',
                            placeholder: '1234',
                            value: createPinField.pinValue,
                            maxLength: 4,
                            onChange: (e) => createPinField.applyPinDigits((e.target.value || '').replace(/\D/g, '').slice(0, 4).split('').concat(['', '', '', '']).slice(0, 4)),
                            onKeyDown: (e) => { if (e.key === 'Enter') handleCreate(); },
                            type: 'tel'
                        })
                ),
                // Подпись формы, а не предупреждение: замок 🔒 на холодной
                // плашке читался тревогой там, где просто объясняют вход.
                React.createElement('div', { className: 'cur-cab__tab-note' },
                    'Клиент войдёт по этому телефону и PIN-коду. '
                    + 'Сохраните их — второй раз показать не сможем.'),
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
                // Кнопка листа — пилюля набора: синий градиент с тенью был
                // единственным градиентом кабинета, а недоступное состояние
                // держал серым #e2e8f0 из прежней системы.
                React.createElement('button', {
                    type: 'button',
                    className: 'cur-cab__open',
                    onClick: accessResult ? closeModal : handleCreate,
                    disabled: loading || (!accessResult && !(newName.trim() && newPhone.trim() && createPinField.isComplete))
                }, accessResult ? 'Готово' : loading ? 'Создание...' : 'Создать клиента')
            )
        );

        const modalOverlay = open && ReactDOM.createPortal(
            React.createElement('div', {
                className: 'cur-cab__sheet-scrim',
                style: { zIndex: CLIENT_ACTION_MODAL_Z },
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
    function ModerationTab({ clients, setCuratorTab }) {
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
            // Кадр «Заявки · пусто». Иллюстраций во весь экран — зелёной
            // галочки — нет: она сообщала «молодец», хотя сообщать надо
            // состояние. Пустота залита тоном «идёт хорошо» и ведёт туда,
            // где работа есть: пустой экран обязан отвечать на «куда дальше».
            //
            // Кадр обещает «придёт уведомлением» — этого в продукте нет:
            // пуша о новой заявке не существует ни в одной функции. Обещание
            // из текста снято, расхождение записано в UI_V4_FINDINGS.
            return React.createElement('div', { className: 'cur-panel' },
                React.createElement('div', { className: 'cur-cab__tab-head' },
                    React.createElement('div', { className: 'cur-cab__tab-title' }, 'Заявки'),
                    React.createElement('div', { className: 'cur-cab__tab-note' },
                        'правки клиентов, требующие подтверждения')
                ),
                React.createElement('div', { className: 'cur-panel__empty cur-panel__empty--ok' },
                    React.createElement('div', { className: 'cur-panel__empty-title' },
                        'Подтверждать нечего'),
                    React.createElement('div', { className: 'cur-panel__empty-note' },
                        'Клиенты не присылали правок, которые нужно смотреть. '
                        + 'Новая заявка появится здесь.')
                ),
                // Ярус ведёт в соседние вкладки. Чисел у него нет: счёт очереди
                // и панели живёт внутри их модулей, и тянуть его сюда значило бы
                // завести третий запрос ради двух строк. Отступление от кадра.
                setCuratorTab ? React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'cur-group__title' },
                        'Где ещё есть работа'),
                    React.createElement('div', { className: 'cur-group__card' },
                        [['queue', 'Очередь · анкеты'], ['panel', 'Панель · ждут решения']]
                            .map(([key, label]) => React.createElement('button', {
                                key,
                                type: 'button',
                                className: 'cur-row cur-row--line',
                                onClick: () => setCuratorTab(key)
                            }, React.createElement('span', { className: 'cur-row__line' }, label)))
                    )
                ) : null
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

    function OpsDashboardButton({ renderTrigger } = {}) {
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

	        // renderTrigger — контракт «вид · шапка кабинета»: счёт клиентов и
	        // состояние системы идут одной подписью, а не кнопкой в 118 px рядом
	        // с заголовком: она съедала ширину, и «Кабинет куратора» ломался на
	        // две строки. Оверлей дашборда остаётся общим.
	        return h(React.Fragment, null,
	            renderTrigger ? renderTrigger({ open: openDashboard, health: systemHealth }) : h('button', {
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
            daySummary,
            normContext,
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

        // «2 клиента · система в норме» из кадра: число склоняется, иначе
        // подпись читается как машинный вывод.
        const pluralClientsRu = (n) => {
            const abs = Math.abs(n) % 100;
            const last = abs % 10;
            if (abs > 10 && abs < 20) return 'клиентов';
            if (last > 1 && last < 5) return 'клиента';
            if (last === 1) return 'клиент';
            return 'клиентов';
        };

        const curatorPanelClients = HEYS.E2EFixtures?.filterCuratorPanelClients
            ? HEYS.E2EFixtures.filterCuratorPanelClients(clients)
            : (Array.isArray(clients) ? clients : []);

        const gate = !clientId
            ? (isInitializing
                ? null
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
                        async function finalizeClientSessionAfterLogin(targetClientId, phone) {
                            const phoneNorm = (HEYS.auth?.normalizePhone?.(phone) || phone);
                            let resolved = false;
                            let resolveCriticalReady;
                            const criticalReadyPromise = new Promise((resolve) => {
                                resolveCriticalReady = resolve;
                            });
                            const finalize = () => {
                                if (resolved) return;
                                resolved = true;
                                writeGlobalValue('heys_last_client_id', targetClientId);
                                try { writeGlobalValue('heys_client_phone', phoneNorm); } catch (_) { }
                                try {
                                    window.HEYS = window.HEYS || {};
                                    window.HEYS.currentClientId = targetClientId;
                                } catch (_) { }
                                setClientId(targetClientId);
                                try {
                                    window.dispatchEvent(new CustomEvent('heys:client-changed', {
                                        detail: { clientId: targetClientId, source: 'pin-login', startVisit: true }
                                    }));
                                } catch (_) { }
                                resolveCriticalReady();
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
                                HEYS.cloud.switchClient(targetClientId)
                                    .catch(() => { })
                                    .finally(() => {
                                        window.removeEventListener('heysSyncCompleted', phaseAHandler);
                                        finalize();
                                    });
                            } else {
                                try { U.lsSet('heys_client_current', targetClientId); } catch (_) { }
                                window.removeEventListener('heysSyncCompleted', phaseAHandler);
                                finalize();
                            }
                            await criticalReadyPromise;
                        }
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
                                    if (HEYS.TrialIntake?.shouldOpen?.() && HEYS.YandexAPI?.candidateLogin) {
                                        const candidateResult = await HEYS.YandexAPI.candidateLogin(phone, pin);
                                        if (candidateResult?.ok) {
                                            window.location.reload();
                                            return candidateResult;
                                        }
                                    }
                                    const auth = HEYS && HEYS.auth;
                                    const fn = auth && auth.loginClient;
                                    const res = fn ? await fn({ phone, pin }) : { ok: false, error: 'cloud_not_ready' };
                                    if (res && res.ok && res.clientId) {
                                        await finalizeClientSessionAfterLogin(res.clientId, phone);
                                    }
                                    return res;
                                },
                                onClientSessionReady: async ({ clientId, phone }) => {
                                    if (clientId) {
                                        await finalizeClientSessionAfterLogin(clientId, phone);
                                    }
                                    return { ok: true, clientId };
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
                                // Контракт «вид · шапка кабинета»: без тёмного блока и без
                                // фиолетового, заголовок на грунте набора, подпись одной
                                // строкой — счёт клиентов и состояние системы. Эмодзи ушли
                                // вместе с тёмной заливкой: строка «что менялось» называет
                                // их поимённо.
                                React.createElement(
                                    'div',
                                    { className: 'cur-cab__head' },
                                    React.createElement(
                                        'div',
                                        { className: 'cur-cab__head-row' },
                                        React.createElement('span', { className: 'cur-cab__title-box' },
                                            React.createElement('span', { className: 'cur-cab__title' }, 'Кабинет куратора'),
                                            // Счёт клиентов и состояние системы одной подписью, и она
                                            // же ведёт в Ops dashboard: отдельная кнопка статуса в
                                            // 118 px съедала ширину, и заголовок ломался на две строки.
                                            React.createElement(OpsDashboardButton, {
                                                renderTrigger: ({ open: openOps, health }) => React.createElement('button', {
                                                    type: 'button',
                                                    className: 'cur-cab__subtitle',
                                                    onClick: openOps,
                                                    title: 'Открыть Ops dashboard'
                                                },
                                                    (clientsSource === 'loading' ? 'Загружаем клиентов'
                                                        : clientsSource === 'error' ? 'Клиенты не загрузились'
                                                            : curatorPanelClients.length
                                                                ? curatorPanelClients.length + ' '
                                                                  + pluralClientsRu(curatorPanelClients.length)
                                                                : 'Клиентов пока нет'),
                                                    ' · ',
                                                    React.createElement('span', {
                                                        className: 'cur-cab__health is-' + (health && health.tone || 'unknown')
                                                    }, clientsSource === 'cache' ? 'показываем сохранённое'
                                                        : health && health.tone === 'ok' ? 'система в норме'
                                                            : (health && health.label || 'система'))
                                                )
                                            })
                                        ),
                                        React.createElement(
                                            'button',
                                            {
                                                type: 'button',
                                                className: 'cur-cab__back',
                                                onClick: () => {
                                                    console.info('[HEYS.gate] 🚪 Выход куратора');
                                                    handleSignOut();
                                                },
                                                title: 'Выйти',
                                                'aria-label': 'Выйти из кабинета'
                                            },
                                            '←'
                                        )
                                    ),

                                    // Контракт «вид · ряд вкладок кабинета»: пять вкладок в
                                    // одном ряду и один порядок на весь кабинет. Сетка стояла
                                    // на четыре колонки при пяти вкладках, и «Диагн.»
                                    // переносилась на вторую строку — ряд, который контракт
                                    // требует не переносить вовсе.
                                    React.createElement(
                                        'div',
                                        { className: 'cur-cab__tabs' },
                                        [
                                            { key: 'clients', label: 'Клиенты' },
                                            { key: 'queue', label: 'Очередь' },
                                            { key: 'panel', label: 'Панель' },
                                            { key: 'moderation', label: 'Заявки' },
                                            // «Диагностика» пишется сокращённо: полное слово
                                            // не оставляет ряду места в 330 px.
                                            { key: 'diagnostics', label: 'Диагн.' }
                                        ].map((tab) => React.createElement(
                                            'button',
                                            {
                                                key: tab.key,
                                                type: 'button',
                                                className: 'cur-cab__tab' + (curatorTab === tab.key ? ' is-on' : ''),
                                                onClick: () => {
                                                    console.info('[HEYS.gate] 🔘 Переключение на таб ' + tab.label);
                                                    setCuratorTab(tab.key);
                                                }
                                            },
                                            // Счётчик новых лидов остаётся на «Очереди»: он
                                            // сообщает о работе, а не украшает вкладку.
                                            tab.key === 'queue' && HEYS.TrialQueue?.NewLeadsBadge
                                                ? React.createElement(
                                                    HEYS.TrialQueue.NewLeadsBadge,
                                                    { curatorId: cloudUser?.id },
                                                    tab.label
                                                )
                                                : tab.label
                                        ))
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
                                        // Поля экрана 16 по бокам и грунт набора: 20 и
                                        // холодный #f8fafc остались от прежней системы.
                                        className: 'cur-cab__content'
                                    },
                                    // === TAB: CLIENTS ===
                                    curatorTab === 'clients' && React.createElement(React.Fragment, null,
                                        // Поиск клиентов (если > 3)
                                        curatorPanelClients.length > 3 && React.createElement('div', {
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
                                                    // Зазор между карточками 10 — тот же, что у клиента.
                                                    gap: 10
                                                }
                                            },
                                            curatorPanelClients.length
                                                ? curatorPanelClients
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
                                                        return (() => {
                                                            // Кадр «Кабинет · Клиенты»: карточка читается одним взглядом —
                                                            // строка «кто», строка «что в дне», ряд «что делать». Прежде
                                                            // аватар стоял отдельным столбцом слева, имя обрезалось до
                                                            // «Алексан…», а единственная кнопка «⋯» лежала под карточкой:
                                                            // главного действия у карточки не было вовсе, открывался
                                                            // дневник нажатием в пустое место.
                                                            const openDiary = () => {
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
                                                                    window.dispatchEvent(new CustomEvent('heys:client-changed', {
                                                                        detail: { clientId: c.id, source: 'curator-client-open', startVisit: true }
                                                                    }));
                                                                }, 0);
                                                            };
                                                            return React.createElement('div', {
                                                                key: c.id,
                                                                className: 'cur-cab__card' + (isLast ? ' is-last' : '')
                                                            },
                                                                // Шапка: аватар, имя с телефоном, срок подписки.
                                                                React.createElement('div', { className: 'cur-cab__client-head' },
                                                                    React.createElement('span', { className: 'cur-row__avatar' },
                                                                        getClientInitials(c.name)),
                                                                    React.createElement('span', { className: 'cur-cab__client-copy' },
                                                                        React.createElement('span', { className: 'cur-row__name' }, c.name),
                                                                        c.phone_normalized && React.createElement('span', {
                                                                            className: 'cur-cab__client-phone'
                                                                        }, HEYS.auth?.formatPhone?.(c.phone_normalized) || c.phone_normalized)
                                                                    ),
                                                                    (() => {
                                                                        const badge = getSubscriptionBadge(c);
                                                                        // Пилюля подписки — метка данных того же набора, что метки
                                                                        // дня: своя рамка и эмодзи ей не нужны.
                                                                        return React.createElement('span', {
                                                                            className: 'cur-cab__mch' + (badge.urgent ? ' is-warn' : ' is-ok')
                                                                        }, badge.short || badge.text);
                                                                    })()
                                                                ),

                                                                // Контракт «вид · карточка клиента»: метки дня одним набором и
                                                                // одним порядком — ккал, вода, шаги, вес, сон, тренировка.
                                                                // Так карточки сравниваются глазом по столбцу, а не читаются
                                                                // каждая заново. Метка данных не нажимается и потому не
                                                                // выглядит кнопкой.
                                                                (() => {
                                                                    const day = daySummary && daySummary[c.id];
                                                                    if (!day) return null;
                                                                    const mch = (text, tone) => React.createElement('span', {
                                                                        key: text,
                                                                        className: 'cur-cab__mch' + (tone ? ' is-' + tone : '')
                                                                    }, text);
                                                                    const num = (v) => Number(v) || 0;
                                                                    const meals = num(day.meals_count);
                                                                    const water = num(day.water_ml);
                                                                    const steps = num(day.steps);
                                                                    const trainings = num(day.trainings_count);
                                                                    const weight = num(day.weight_morning);
                                                                    const sleep = num(day.sleep_hours);
                                                                    // Цели клиента: вода считается от веса тем же правилом, что
                                                                    // у него на экране (30 мл на кг), шаги и сон он задаёт сам.
                                                                    // Нет цели — метка остаётся «есть запись», а не объявляет
                                                                    // отклонение от выдуманного числа.
                                                                    const goal = (normContext && normContext[c.id]) || null;
                                                                    const waterGoal = goal && Number(goal.weight) ? Number(goal.weight) * 30 : null;
                                                                    const stepsGoal = goal && Number(goal.steps_goal) ? Number(goal.steps_goal) : null;
                                                                    const sleepGoal = goal && Number(goal.sleep_norm_hours)
                                                                        ? Number(goal.sleep_norm_hours) : null;
                                                                    // Отклонение — только вниз от цели: перевыполненная норма воды
                                                                    // или шагов не то, о чём куратор идёт разговаривать.
                                                                    const tone = (value, target) => {
                                                                        if (!value) return 'none';
                                                                        if (!target) return 'ok';
                                                                        return value < target * 0.8 ? 'off' : 'ok';
                                                                    };
                                                                    const hhmm = (h) => Math.floor(h) + ':'
                                                                        + String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0');
                                                                    return React.createElement('div', {
                                                                        className: 'cur-cab__mchs'
                                                                    },
                                                                        // У калорий цели здесь нет: норма дня выходит из TDEE,
                                                                        // дефицита и поправки на факт — её считает движок, и
                                                                        // второй его экземпляр в карточке разошёлся бы с панелью.
                                                                        mch(meals ? Math.round(num(day.kcal)) + ' ккал' : 'еды нет',
                                                                            meals ? 'ok' : 'none'),
                                                                        mch(water ? (water / 1000).toFixed(1).replace('.', ',') + ' л' : 'воды нет',
                                                                            tone(water, waterGoal)),
                                                                        mch(steps ? steps.toLocaleString('ru-RU') : 'шагов нет',
                                                                            tone(steps, stepsGoal)),
                                                                        // Вес — величина без нормы: у него нет «хорошо» и
                                                                        // «плохо», поэтому он остаётся нейтральным.
                                                                        mch(weight ? String(Math.round(weight * 10) / 10).replace('.', ',') + ' кг' : 'веса нет',
                                                                            weight ? null : 'none'),
                                                                        // Час без слова читается как время суток, а не как длительность сна:
                                                                    // «6:00» в ряду с «892 ккал» и «1,0 л» ничего не называет.
                                                                    mch(sleep ? 'сон ' + hhmm(sleep) : 'сна нет', tone(sleep, sleepGoal)),
                                                                        // Тип тренировки словом: «силовая 55 мин» говорит, о чём
                                                                        // спрашивать, а «55 мин» — только что она была.
                                                                        mch(trainings
                                                                            ? (TRAINING_TYPE[day.training_type] || 'тренировка')
                                                                                + ' ' + num(day.training_min) + ' мин'
                                                                            : 'без тренировки',
                                                                            trainings ? 'ok' : 'none')
                                                                    );
                                                                })(),

                                                                // Контракт «карточка клиента · нижний ярус»: серия слева,
                                                                // превью последнего сообщения справа. Обе строки называют,
                                                                // о чём говорить с человеком, а метки выше — что у него в
                                                                // дне. Нет одного — остаётся другое.

                                                                // Кадр «Кабинет · Клиенты»: последняя строка карточки — самое
                                                                // свежее событие. Приём дня старше входа: он говорит, что человек
                                                                // вёл дневник, а вход — лишь что открывал приложение.
                                                                (() => {
                                                                    const d = daySummary && daySummary[c.id];
                                                                    if (!d) return null;
                                                                    const eaten = Number(d.meals_count) || 0;
                                                                    if (eaten && d.last_meal_time) {
                                                                        return React.createElement('div', { className: 'cur-cab__event' },
                                                                            eaten + ' ' + pluralMeals(eaten) + ' · последний в ' + d.last_meal_time);
                                                                    }
                                                                    if (d.last_visit_at) {
                                                                        return React.createElement('div', { className: 'cur-cab__event' },
                                                                            'Последний вход ' + visitAgo(d.last_visit_at));
                                                                    }
                                                                    return null;
                                                                })(),

                                                                // Нижний ярус: серия слева, последнее сообщение справа. Обе
                                                                // строки говорят, о чём беседовать с человеком, а метки выше —
                                                                // что у него в дне. Непрочитанные названы словом: красный
                                                                // кружок поверх аватара кричал тревогой о том, что тревогой не
                                                                // является, а красный в наборе значит разрушающее действие.
                                                                (stats.streak > 0 || lastPreview || unreadCount > 0)
                                                                    && React.createElement('div', { className: 'cur-cab__foot' },
                                                                        React.createElement('span', { className: 'cur-cab__streak' },
                                                                            unreadCount > 0
                                                                                ? unreadCount + ' непрочитанных'
                                                                                : stats.streak > 0
                                                                                    ? stats.streak + ' ' + (stats.streak === 1 ? 'день'
                                                                                        : stats.streak < 5 ? 'дня' : 'дней') + ' подряд'
                                                                                    : ''),
                                                                        lastPreview
                                                                            ? React.createElement('span', {
                                                                                className: 'cur-cab__preview'
                                                                                    + (unreadCount > 0 ? ' is-unread' : '')
                                                                            },
                                                                                (lastPreview.sender_role === 'curator' ? 'Вы: ' : '')
                                                                                + (lastPreview.body
                                                                                    || (lastPreview.intent_type === 'meal' ? 'приём пищи'
                                                                                        : lastPreview.intent_type === 'training' ? 'тренировка'
                                                                                            : lastPreview.intent_type === 'weight' ? 'вес' : '')))
                                                                            : null
                                                                    ),
                                                        
                                                                // Ряд действий: главное названо словом и залито, «⋯» рядом.
                                                                // Прежде главного действия у карточки не было — дневник
                                                                // открывался нажатием в пустое место, и об этом надо было знать.
                                                                React.createElement('div', { className: 'cur-cab__actions' },
                                                                    React.createElement('button', {
                                                                        type: 'button',
                                                                        className: 'cur-cab__open',
                                                                        onClick: openDiary
                                                                    }, 'Открыть дневник'),
                                                                    React.createElement(ClientActionsMenu, {
                                                                        client: c,
                                                                        curatorId: cloudUser?.id,
                                                                        editClient,
                                                                        copyClientId,
                                                                        removeClient
                                                                    })
                                                                )
                                                            );
                                                        })();
                                                    })
                                                // Пустота — та же карточка, что у остальных пустот
                                                // кабинета. Эмодзи 📋 в полэкрана сообщало настроение,
                                                // а не состояние, и в наборе эмодзи нет нигде.
                                                : React.createElement('div', { className: 'cur-panel__empty' },
                                                    React.createElement('div', { className: 'cur-panel__empty-title' },
                                                        'Клиентов пока нет'),
                                                    React.createElement('div', { className: 'cur-panel__empty-note' },
                                                        'Здесь появится список людей, чьи дневники вы ведёте: '
                                                        + 'состояние дня, срок подписки и вход в дневник. '
                                                        + 'Первого создайте кнопкой внизу.')
                                                ),
                                        ),
                                    ),

                                    // === TAB: QUEUE (Очередь на триал) ===
                                    curatorTab === 'queue' && React.createElement(HEYS.TrialQueue.TrialQueueAdmin, {
                                        curatorId: cloudUser?.id
                                    }),

                                    // === TAB: MODERATION (Заявки на продукты) ===
                                    // Панель отвечает на «кем заняться сегодня» и живёт своим
                                    // модулем: файл кабинета и так огромный, а вкладка — своя зона
                                    // контракта со своими правилами.
                                    curatorTab === 'panel' && HEYS.CuratorPanel
                                        && React.createElement(HEYS.CuratorPanel.Component, {
                                            // Тот же список, что у шапки и вкладки «Клиенты»:
                                            // dev-фикстуры кабинет скрывает, и панель обязана
                                            // скрывать их тоже — иначе её счёт спорит с числом
                                            // клиентов в шапке над ней.
                                            clients: curatorPanelClients,
                                            // Вход в дневник у панели тот же, что у списка
                                            // клиентов: переключаем кабинет на «Клиенты», а сам
                                            // вход остаётся одной механикой на весь кабинет —
                                            // второй копии switchClient здесь заводить нельзя.
                                            onOpenClient: () => setCuratorTab('clients')
                                        }),
                                    curatorTab === 'moderation' && React.createElement(ModerationTab, { clients, setCuratorTab }),

                                    // === TAB: DIAGNOSTICS (client launches and sync) ===
                                    curatorTab === 'diagnostics' && HEYS.ClientDiagnostics?.Overview
                                        && React.createElement(HEYS.ClientDiagnostics.Overview, { clients })
                                ),

                                // FOOTER: Кнопка создания (прибита к низу)
                                curatorTab === 'clients' && React.createElement('div', {
                                    className: 'cur-cab__create-bar'
                                }, React.createElement(CreateClientModal, props))
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
            showMorningCheckin = false,
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
            subscriptionState = { status: 'none', details: null, isLoading: true },
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
        // READONLY_MODE (stable.heyslab.ru): живая БД + отозванные/устаревшие
        // согласия иначе тупят вход — log_consents* заблокирован. Экран согласий
        // остаётся открываемым вручную для эталонных скринов, но не гейтит вход.
        const isReadonlyHost = !!(typeof window !== 'undefined'
            && window.__HEYS_READONLY_MODE__
            && window.__HEYS_READONLY_MODE__.enabled);
        const shouldBlockForConsents = !isReadonlyHost
            && (needsConsent || mustBlockReconsent || hasOutdatedRequiredConsents);

        if (baseEligible && shouldBlockForConsents && !HEYS.Consents?.ConsentScreen) {
            console.debug('[CONSENTS GATE] ConsentScreen компонент ещё не загружен');
        }

        const renderGateMessage = ({ key = null, title, text, tone = 'loading', icon = null, actions = [], visibleFrame = null }) => {
            const isError = tone === 'error';
            return React.createElement('div', {
                key,
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
                'data-heys-visible-frame': visibleFrame || undefined,
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
                }, icon || (isError ? '!' : '...')),
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

        if (consentEligible && checkingConsent && !isReadonlyHost) {
            return null;
        }

        if (baseEligible && consentCheckError && !isReadonlyHost) {
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
                outdatedTypes: outdatedTypes,
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
                            const status = HEYS.Subscription?.getCachedStatus?.()
                                || HEYS.Subscription?.getLocalStatus?.()
                                || 'none';
                            if (HEYS.Subscription?.canWriteStatus?.(status) === true) {
                                console.log('[CONSENTS] 🎓 Triggering onboarding tour after consents');
                                window.HEYS?._tour?.tryStart?.();
                            }
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

        // Уже вошедшие: один раз предложить замеры и добавки без повторной оферты.
        // Не между согласиями и регистрацией: оферта только после заполненного профиля.
        if (baseEligible && !shouldBlockForConsents && !consentCheckError && isPinSessionActive
            && HEYS.Consents?.OptionalFeatureOfferScreen
            && HEYS.Consents?.shouldOfferOptionalFeatures?.()) {
            const offerProfile = HEYS.utils?.lsGet ? HEYS.utils.lsGet('heys_profile', {}) : {};
            const offerProfileIncomplete = HEYS.ProfileSteps?.isProfileIncomplete
                ? HEYS.ProfileSteps.isProfileIncomplete(offerProfile)
                : offerProfile?.profileCompleted !== true;
            if (!offerProfileIncomplete) {
                return React.createElement(HEYS.Consents.OptionalFeatureOfferScreen, {
                    key: 'optional-feature-offer',
                    clientId,
                    onComplete: () => {
                        try {
                            window.dispatchEvent(new CustomEvent('heys:profile-updated', {
                                detail: { source: 'optional-feature-offer' },
                            }));
                        } catch (_) { /* noop */ }
                    },
                });
            }
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

        // Protected trial intake opens only after authenticated session and all
        // required consents. The URL is a universal route marker: it contains
        // no client id, phone, health data or bearer token.
        if (((baseEligible && !shouldBlockForConsents)
            || (!clientId && HEYS.YandexAPI?.hasCandidateSessionHint?.()))
            && HEYS.TrialIntake?.shouldOpen?.()
            && HEYS.TrialIntake?.ClientScreen) {
            return React.createElement(HEYS.TrialIntake.ClientScreen, {
                key: 'trial-intake',
            });
        }

        const hasValidConsents = baseEligible && !shouldBlockForConsents && !consentCheckError;
        if (hasValidConsents && isPinSessionActive) {
            const profile = HEYS.utils?.lsGet ? HEYS.utils.lsGet('heys_profile', {}) : {};
            const profileIncomplete = HEYS.ProfileSteps?.isProfileIncomplete
                ? HEYS.ProfileSteps.isProfileIncomplete(profile)
                : profile?.profileCompleted !== true;

            // Профиль остаётся доступен до триала. Как только он подтверждён в
            // облаке, основной интерфейс заменяется отдельным экраном ожидания.
            //
            // Пока статус подписки едет — пустой кадр под boot-знаком.
            // Прежний скелетон вкладки обещал чужой экран; карточка
            // «Проверяем доступ» обещала пробную неделю даже клиенту
            // с давним активным доступом. Метка остаётся: защита от
            // белого экрана считает кадр без неё зависанием, но
            // subscription-loading — transient и overlay не снимает.
            if (!profileIncomplete && subscriptionState.isLoading) {
                return React.createElement('div', {
                    key: 'subscription-loading',
                    'data-heys-visible-frame': 'subscription-loading',
                });
            }

            const status = subscriptionState.status || 'none';
            // Пока открыт итог регистрации (MorningCheckin mode=registration),
            // ending и есть waiting — не дублируем route-level заглушку сверху.
            if (!profileIncomplete && (status === 'none' || status === 'trial_pending')
                && !showMorningCheckin) {
                const startRaw = subscriptionState.details?.trial_started_at;
                const startDate = startRaw ? new Date(startRaw) : null;
                const hasValidStartDate = startDate && !Number.isNaN(startDate.getTime());
                const startText = hasValidStartDate
                    ? startDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                    : null;
                return renderGateMessage({
                    key: 'subscription-waiting',
                    title: 'Аккаунт готов',
                    text: status === 'trial_pending' && startText
                        ? `Пробная неделя начнётся ${startText}. В этот день откроются чек-ин и дневник.`
                        : 'Куратор ещё не назначил дату начала пробной недели. Мы сообщим, когда доступ откроется.',
                    icon: '✓',
                    actions: [{
                        key: 'refresh-subscription',
                        label: 'Проверить доступ',
                        onClick: () => HEYS.Subscription?.getStatusDetails?.(true),
                    }],
                });
            }
        }

        return null;
    }

    HEYS.AppGateFlow = {
        buildGate,
        buildDesktopGate,
        buildConsentGate,
    };
})();
