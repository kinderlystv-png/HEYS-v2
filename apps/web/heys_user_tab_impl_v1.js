// heys_user_tab_impl_v1.js — User profile, BMI/BMR calculations, HR zones (extracted)
// 🆕 PERF v9.2: Метка момента когда boot-app начал исполняться
window.__heysPerfMark && window.__heysPerfMark('boot-app: execute start');
(function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // 🔍 DEBUG: Проверяем что HEYS.utils загружен
    if (!HEYS.utils || !HEYS.utils.lsGet) {
        console.error('[heys_user_v12] ❌ HEYS.utils.lsGet не определён! Это приведёт к сбросу профиля');
    }
    // else { console.log('[heys_user_v12] ✅ HEYS.utils.lsGet определён, __clientScoped:', HEYS.utils.__clientScoped); }

    const { lsGet, lsSet, toNum, round1, getEmojiStyle, setEmojiStyle } = HEYS.utils || {
        lsGet: (k, d) => d, lsSet: () => { }, toNum: (x) => Number(x) || 0, round1: (v) => Math.round(v * 10) / 10,
        getEmojiStyle: () => 'android', setEmojiStyle: () => { }
    };

    function useFallbackCuratorPinField() {
        const [value, setValue] = React.useState('');
        return {
            pinValue: value,
            isComplete: value.length >= 4,
            resetDigits: () => setValue(''),
            applyPinDigits: (arr) => setValue((arr || []).slice(0, 4).join('')),
        };
    }

    // Дефолтный профиль (единый источник)
    const DEFAULT_PROFILE = {
        firstName: '', lastName: '', gender: 'Мужской',
        weight: 70, height: 175, age: 30,
        birthDate: '', // YYYY-MM-DD, если заполнено — возраст считается авто
        weightGoal: 0, // целевой вес (кг)
        sleepHours: 8, insulinWaveHours: 3,
        deficitPctTarget: 0,
        stepsGoal: 10000, // целевая дневная активность по шагам
        cycleTrackingEnabled: false, // ручное включение трекинга цикла (для любого пола)
        measurementsTrackingEnabled: false, // опциональные замеры тела (выключено по умолчанию)
        supplementsTrackingEnabled: false, // опциональный трекинг добавок (выключено по умолчанию)
        profileCompleted: false, // флаг заполненности профиля (для wizard первого входа)
        desktopAllowed: false, // 🖥️ Разрешён ли доступ с десктопа (куратор может включить)

        // 💊 Витамины / добавки
        // plannedSupplements остаётся string[] — критично для совместимости текущего UI
        plannedSupplements: [],
        // supplementSettings — карта настроек по ID добавки (форма, дозировка, override тайминга)
        supplementSettings: {},
        // supplementHistory — лёгкая история приёма (например, список дат) для предупреждений по курсу/лимитам
        supplementHistory: {}
    };

    // Валидация полей профиля — мягкая (разрешаем ввод, не форсируем fallback)
    // Fallback применяется только при чтении/использовании, не при вводе
    const PROFILE_VALIDATORS = {
        weight: v => {
            if (v === '' || v === null || v === undefined) return v; // Разрешаем пустое при вводе
            const n = Number(v);
            return isNaN(n) ? v : Math.max(0, Math.min(500, n));
        },
        weightGoal: v => {
            if (v === '' || v === null || v === undefined) return 0;
            const n = Number(v);
            return isNaN(n) ? 0 : Math.max(0, Math.min(500, n));
        },
        height: v => {
            if (v === '' || v === null || v === undefined) return v;
            const n = Number(v);
            return isNaN(n) ? v : Math.max(0, Math.min(300, n));
        },
        age: v => {
            if (v === '' || v === null || v === undefined) return v;
            const n = Number(v);
            return isNaN(n) ? v : Math.max(0, Math.min(150, n));
        },
        sleepHours: v => {
            if (v === '' || v === null || v === undefined) return v;
            const n = Number(v);
            return isNaN(n) ? v : Math.max(0, Math.min(24, n));
        },
        insulinWaveHours: v => {
            if (v === '' || v === null || v === undefined) return v;
            const n = Number(v);
            return isNaN(n) ? v : Math.max(0.5, Math.min(12, n));
        },
        deficitPctTarget: v => {
            if (v === '' || v === null || v === undefined) return 0;
            const n = Number(v);
            return isNaN(n) ? 0 : Math.max(-50, Math.min(50, n));
        },
        stepsGoal: v => {
            if (v === '' || v === null || v === undefined) return 10000;
            const n = Number(v);
            return isNaN(n) ? 10000 : Math.max(0, Math.min(50000, n));
        }
    };

    // Расчёт возраста из даты рождения
    function calcAgeFromBirthDate(birthDate) {
        if (!birthDate) return 0;
        const birth = new Date(birthDate);
        if (isNaN(birth.getTime())) return 0;
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return Math.max(0, age);
    }

    // Расчёт нормы сна по возрасту и полу (Sleep Foundation + NSF)
    // Возвращает { hours, range, explanation }
    function calcSleepNorm(age, gender) {
        let baseMin, baseMax, explanation;

        // Рекомендации по возрасту (Sleep Foundation / AASM)
        if (age < 13) {
            baseMin = 9; baseMax = 12;
            explanation = 'дети 6-12 лет: 9-12ч';
        } else if (age < 18) {
            baseMin = 8; baseMax = 10;
            explanation = 'подростки 13-17: 8-10ч';
        } else if (age < 26) {
            baseMin = 7; baseMax = 9;
            explanation = 'молодые 18-25: 7-9ч';
        } else if (age < 65) {
            baseMin = 7; baseMax = 9;
            explanation = 'взрослые 26-64: 7-9ч';
        } else {
            baseMin = 7; baseMax = 8;
            explanation = 'пожилые 65+: 7-8ч';
        }

        // Женщины в среднем нуждаются на ~20 мин больше (Duke University)
        const genderBonus = gender === 'Женский' ? 0.3 : 0;

        const recommended = Math.round(((baseMin + baseMax) / 2 + genderBonus) * 2) / 2; // округляем до 0.5

        return {
            hours: recommended,
            range: `${baseMin}-${baseMax}`,
            explanation: explanation + (genderBonus > 0 ? ' +20мин жен.' : '')
        };
    }

    // Emoji Style Selector Component
    function EmojiStyleSelector() {
        const [style, setStyle] = React.useState(() => getEmojiStyle());

        // Определяем платформу
        const platformInfo = React.useMemo(() => {
            if (typeof window === 'undefined') return { needsTwemoji: false, name: 'Unknown' };
            const ua = navigator.userAgent || '';
            const isWindows = /Windows/i.test(ua);
            const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);
            const isMac = /Macintosh|Mac OS/i.test(ua);
            const isIOS = /iPhone|iPad|iPod/i.test(ua);
            const isAndroid = /Android/i.test(ua);

            let name = 'Устройство';
            if (isWindows) name = 'Windows';
            else if (isMac) name = 'Mac';
            else if (isIOS) name = 'iPhone/iPad';
            else if (isAndroid) name = 'Android';
            else if (isLinux) name = 'Linux';

            return {
                needsTwemoji: isWindows || isLinux,
                name: name,
                twemojiAvailable: !!window.twemoji
            };
        }, []);

        const handleChange = (e) => {
            const newStyle = e.target.value;
            setStyle(newStyle);
            setEmojiStyle(newStyle);
        };

        // Если Twemoji не загружен (Mac/iOS/Android), показываем инфо-блок
        if (!platformInfo.twemojiAvailable) {
            return React.createElement('div', { className: 'inline-field' },
                React.createElement('label', null, 'Стиль эмодзи 😀'),
                React.createElement('span', { className: 'sep' }, '-'),
                React.createElement('span', { style: { color: 'var(--gray-500)', fontSize: '0.875rem' } },
                    `Используются эмодзи ${platformInfo.name}`
                )
            );
        }

        return React.createElement('div', { className: 'inline-field' },
            React.createElement('label', null, 'Стиль эмодзи 😀'),
            React.createElement('span', { className: 'sep' }, '-'),
            React.createElement('select', { value: style, onChange: handleChange },
                React.createElement('option', { value: 'twemoji' }, '🐦 Twitter/Android'),
                React.createElement('option', { value: 'system' }, `💻 ${platformInfo.name}`)
            )
        );
    }

    function formatSubscriptionDaysLeft(daysLeft) {
        const days = Number(daysLeft);
        if (!Number.isFinite(days) || days <= 0) return '';
        const mod10 = days % 10;
        const mod100 = days % 100;
        const unit = mod10 === 1 && mod100 !== 11
            ? 'день'
            : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней');
        return `${days} ${unit}`;
    }

    function getSubscriptionSettingsSubtitle(subscription) {
        const details = subscription?.getCachedDetails?.();
        if (!details?.status) return 'Загрузка...';
        const meta = subscription.getStatusMeta(details.status);
        const daysLabel = formatSubscriptionDaysLeft(details.days_left);
        if (details.status === 'trial' && daysLabel) {
            return `${meta?.shortLabel || 'Триал'} · осталось ${daysLabel}`;
        }
        return meta?.label || 'Тариф и оплата';
    }

    // === SubscriptionStatusSection — отображение статуса подписки ===
    function SubscriptionStatusSection() {
        const [statusData, setStatusData] = React.useState(null);
        const [loading, setLoading] = React.useState(true);

        React.useEffect(() => {
            if (!window.HEYS?.Subscription) {
                setLoading(false);
                return;
            }

            window.HEYS.Subscription.getStatusDetails(true).then(data => {
                setStatusData(data);
                setLoading(false);
            }).catch(() => setLoading(false));
        }, []);

        if (loading) {
            return React.createElement('div', { className: 'profile-section__fields' },
                React.createElement('div', { className: 'profile-loading' }, 'Загрузка...')
            );
        }

        if (!window.HEYS?.Subscription) {
            return React.createElement('div', { className: 'profile-section__fields' },
                React.createElement('div', { className: 'profile-loading' }, 'Модуль подписок не загружен')
            );
        }

        const status = statusData?.status || 'none';
        const meta = window.HEYS.Subscription.getStatusMeta(status);
        const daysLeft = statusData?.days_left || 0;

        return React.createElement('div', { className: 'profile-section__fields' },
            React.createElement('div', { className: 'profile-field-group profile-subscription-card' },
                React.createElement('div', { className: 'profile-subscription-card__head' },
                    React.createElement('span', { className: 'profile-subscription-card__icon' }, profileSvg('gem', 22)),
                    React.createElement('div', null,
                        React.createElement('div', { className: 'profile-subscription-card__title' },
                            meta?.label || 'Подписка'
                        ),
                        React.createElement('div', { className: 'muted' },
                            meta?.desc || ''
                        )
                    )
                ),

                (status === 'trial' || status === 'active') && daysLeft > 0 &&
                React.createElement('div', { className: 'profile-subscription-card__days' },
                    React.createElement('div', { className: 'profile-subscription-card__days-num' }, daysLeft),
                    React.createElement('div', { className: 'muted', style: { fontSize: '12px' } },
                        daysLeft === 1 ? 'день осталось' : (daysLeft < 5 ? 'дня осталось' : 'дней осталось')
                    )
                ),

                (status === 'read_only' || status === 'none') &&
                React.createElement('button', {
                    className: 'btn btn-primary',
                    style: { width: '100%', marginTop: '8px' },
                    onClick: () => {
                        if (window.HEYS?.Paywall?.show) {
                            window.HEYS.Paywall.show();
                        } else {
                            alert('Оплата скоро будет доступна');
                        }
                    }
                }, status === 'read_only' ? 'Продлить подписку' : 'Начать пробный период')
            )
        );
    }

    function profileSvg(name, size) {
        const NavIcon = HEYS.AppNavIcons && HEYS.AppNavIcons.NavIcon;
        if (!NavIcon) return null;
        return React.createElement(NavIcon, {
            name: name,
            size: size || 18,
            strokeWidth: 2,
            className: 'profile-icon-svg'
        });
    }

    function profileHint(kind, text) {
        const mark = window.HEYS?.WaitMark?.button;
        if (mark && (kind === 'pending' || kind === 'saved')) {
            return mark(React, {
                busy: kind === 'pending',
                ok: kind === 'saved',
                idle: text,
                busyLabel: text,
                okLabel: text,
            });
        }
        return React.createElement('span', { className: `profile-hint profile-hint--${kind}` }, text);
    }

    function profileMessageClass(text) {
        if (!text) return 'profile-message';
        if (text.startsWith('✅') || text.startsWith('✓')) return 'profile-message profile-message--ok';
        if (text.startsWith('❌') || text.startsWith('⚠')) return 'profile-message profile-message--err';
        return 'profile-message';
    }

    // === ProfileSection — FAQ-style collapsible section ===
    function ProfileSection({
        id,
        icon,
        title,
        subtitle,
        badge,
        tone = 'blue',
        expanded,
        onToggle,
        children
    }) {
        const handleClick = () => {
            if (onToggle) onToggle(id);
        };

        const sectionClass = [
            'profile-section',
            `tone-${tone}`,
            expanded ? 'profile-section--expanded' : 'profile-section--collapsed'
        ].join(' ');

        return React.createElement('div', { className: sectionClass, id: id ? `profile-section-${id}` : undefined },
            // Header (always visible)
            React.createElement('div', {
                className: 'profile-section__header',
                onClick: handleClick
            },
                React.createElement('div', { className: 'profile-section__header-left' },
                    React.createElement('div', { className: 'profile-section__icon' }, icon),
                    React.createElement('div', null,
                        React.createElement('div', { className: 'profile-section__title' }, title),
                        subtitle && React.createElement('div', { className: 'profile-section__subtitle' }, subtitle)
                    )
                ),
                React.createElement('div', { className: 'profile-section__header-right' },
                    badge && React.createElement('span', { className: 'profile-section__badge' }, badge),
                    React.createElement('span', { className: 'profile-section__chevron' }, '▼')
                )
            ),
            // Content (only when expanded)
            expanded && React.createElement('div', { className: 'profile-section__content' }, children)
        );
    }

    // === Компонент группы полей (плашка внутри секции) ===
    function ProfileFieldGroup({ icon, title, children }) {
        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, icon),
                React.createElement('span', { className: 'profile-field-group__title' }, title)
            ),
            children
        );
    }

    function UserTabBase() {
        const isCuratorSession = (() => {
            try {
                if (HEYS.auth?.isCuratorSession?.() === true) return true;
            } catch { /* noop */ }
            return false;
        })();

        // Twemoji: reparse emoji after render
        React.useEffect(() => {
            if (window.scheduleTwemojiParse) window.scheduleTwemojiParse();
        });

        const [profile, setProfile] = React.useState(() => {
            return lsGet('heys_profile', DEFAULT_PROFILE);
        });
        const [profileSaved, setProfileSaved] = React.useState(false);

        // Строка «Уведомления» листа настроек: текст состояния до раскрытия
        // (UI v4, 2026-08-10 — колокольчик убран из шапки, единый вход сюда).
        const [pushRowStatus, setPushRowStatus] = React.useState(null);
        React.useEffect(() => {
            if (!HEYS.push) return;
            let cancelled = false;
            const refresh = () => HEYS.push.getStatus().then((s) => { if (!cancelled) setPushRowStatus(s); }).catch(() => {});
            refresh();
            window.addEventListener('focus', refresh);
            return () => { cancelled = true; window.removeEventListener('focus', refresh); };
        }, []);
        const pushRowStatusLabel = !pushRowStatus ? 'Напоминания, итог дня, стрики'
            : pushRowStatus.subscribed ? 'Включены'
                : pushRowStatus.needsInstall ? 'Нужно добавить HEYS на главный экран'
                    : pushRowStatus.permission === 'denied' ? 'Запрещены в браузере'
                        : 'Выключены';

        // Смена PIN
        const [pinStatus, setPinStatus] = React.useState('idle'); // idle | pending | success | error
        const [pinMessage, setPinMessage] = React.useState('');
        const pinKeypadKit = HEYS.AuthPinKeypad?.createKit?.(React);
        const useCuratorPinField = pinKeypadKit ? pinKeypadKit.usePinKeypad : useFallbackCuratorPinField;
        const newPinField = useCuratorPinField({
            disabled: pinStatus === 'pending',
            idPrefix: 'curator-new-pin',
            autoFocus: false,
        });
        const confirmPinField = useCuratorPinField({
            disabled: pinStatus === 'pending',
            idPrefix: 'curator-confirm-pin',
            autoFocus: false,
        });
        const newPinKeypadRef = React.useRef(null);
        const confirmPinKeypadRef = React.useRef(null);

        // === Accordion state (с сохранением в localStorage) ===
        const SECTIONS_KEY = 'heys_profile_sections';
        const normalizeExclusiveSections = (saved, fallbackId) => {
            if (!saved || typeof saved !== 'object') {
                return fallbackId ? { [fallbackId]: true } : {};
            }
            const openId = Object.keys(saved).find((key) => saved[key]);
            return openId ? { [openId]: true } : (fallbackId ? { [fallbackId]: true } : {});
        };
        const persistExpandedSections = (next) => {
            try {
                if (HEYS.store?.set) HEYS.store.set(SECTIONS_KEY, next);
                else if (lsSet) lsSet(SECTIONS_KEY, next);
                else localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
            } catch { /* noop */ }
        };
        const [expandedSections, setExpandedSections] = React.useState(() => {
            try {
                if (HEYS.store?.get) {
                    const saved = HEYS.store.get(SECTIONS_KEY, null);
                    if (saved) return normalizeExclusiveSections(typeof saved === 'string' ? JSON.parse(saved) : saved, 'basic');
                }
                const saved = lsGet ? lsGet(SECTIONS_KEY, null) : null;
                if (saved) return normalizeExclusiveSections(saved, 'basic');
                const raw = localStorage.getItem(SECTIONS_KEY);
                return raw ? normalizeExclusiveSections(JSON.parse(raw), 'basic') : { basic: true };
            } catch { return { basic: true }; }
        });
        const toggleSection = (id) => {
            setExpandedSections(prev => {
                const isOpen = !!prev[id];
                const next = isOpen ? {} : { [id]: true };
                persistExpandedSections(next);
                return next;
            });
        };

        const openProfileSection = (sectionId) => {
            if (!sectionId) return;
            setExpandedSections(prev => {
                if (prev[sectionId] && Object.keys(prev).filter((key) => prev[key]).length === 1) return prev;
                const next = { [sectionId]: true };
                persistExpandedSections(next);
                return next;
            });
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = document.getElementById('profile-section-' + sectionId);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });
        };

        React.useEffect(() => {
            const handler = (event) => {
                const fromLegacyPush = event?.type === 'heys:scroll-to-push-settings';
                const sectionId = fromLegacyPush ? 'notifications' : (event?.detail?.id || '');
                if (sectionId) window.__heysPendingUserSection = null;
                openProfileSection(sectionId);
            };
            window.addEventListener('heys:open-user-section', handler);
            window.addEventListener('heys:scroll-to-push-settings', handler);
            const pending = window.__heysPendingUserSection;
            if (pending) {
                window.__heysPendingUserSection = null;
                openProfileSection(pending);
            }
            return () => {
                window.removeEventListener('heys:open-user-section', handler);
                window.removeEventListener('heys:scroll-to-push-settings', handler);
            };
        }, []);

        const getCurrentClientId = () => {
            let cid = (window.HEYS && window.HEYS.currentClientId) || localStorage.getItem('heys_client_current') || '';
            if (cid && typeof cid === 'string' && cid.startsWith('"')) {
                try { cid = JSON.parse(cid); } catch (_) { }
            }
            return cid || '';
        };

        const getShortClientId = (id) => id ? String(id).slice(0, 8) : '—';

        const handlePinUpdate = async () => {
            const auth = window.HEYS && window.HEYS.auth;
            const clientId = getCurrentClientId();
            setPinMessage('');

            if (!clientId) {
                setPinStatus('error');
                setPinMessage('Клиент не выбран. Выберите клиента в шапке.');
                return;
            }

            if (!auth || typeof auth.resetClientPin !== 'function' || typeof auth.validatePin !== 'function') {
                setPinStatus('error');
                setPinMessage('Модуль авторизации не загружен.');
                return;
            }

            // Сначала проверка формата (ровно 4 цифры), отдельным сообщением.
            if (!/^\d{4}$/.test(String(newPinField.pinValue)) || !/^\d{4}$/.test(String(confirmPinField.pinValue))) {
                setPinStatus('error');
                setPinMessage('PIN должен состоять из 4 цифр.');
                return;
            }

            // Затем проверка на «слабый» PIN — отдельным сообщением, чтобы
            // куратор понимал почему отказ.
            if (typeof auth.isWeakPin === 'function' && (auth.isWeakPin(newPinField.pinValue) || auth.isWeakPin(confirmPinField.pinValue))) {
                setPinStatus('error');
                setPinMessage('Слишком простой PIN. Не используйте 0000, 1234, повторяющиеся цифры или клавиатурные паттерны.');
                return;
            }

            // Финальная валидация (комбинированная — на случай если правила расширены).
            if (!auth.validatePin(newPinField.pinValue) || !auth.validatePin(confirmPinField.pinValue)) {
                setPinStatus('error');
                setPinMessage('PIN не прошёл проверку. Выберите другой.');
                return;
            }

            if (newPinField.pinValue !== confirmPinField.pinValue) {
                setPinStatus('error');
                setPinMessage('PIN и подтверждение не совпадают.');
                return;
            }

            setPinStatus('pending');
            try {
                const res = await auth.resetClientPin({ clientId, newPin: newPinField.pinValue });
                if (!res || !res.ok) {
                    const msg = res && res.message ? res.message : 'Не удалось обновить PIN';
                    setPinStatus('error');
                    setPinMessage(msg);
                    if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.trackError) {
                        window.HEYS.analytics.trackError('pin_change_failed', { clientId: getShortClientId(clientId), message: msg });
                    }
                    return;
                }
                setPinStatus('success');
                setPinMessage('PIN обновлён. Не забудьте сообщить его клиенту.');
                newPinField.resetDigits();
                confirmPinField.resetDigits();
                setTimeout(() => { setPinStatus('idle'); setPinMessage(''); }, 2000);
            } catch (e) {
                setPinStatus('error');
                setPinMessage(e?.message || 'Ошибка при обновлении PIN');
                if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.trackError) {
                    window.HEYS.analytics.trackError('pin_change_exception', { clientId: getShortClientId(clientId), message: e?.message });
                }
            }
        };

        // Дефолтные пульсовые зоны (фиксированные диапазоны, MET рассчитывается)
        const defaultZones = React.useMemo(() => {
            return [
                { name: 'Бытовая активность (ходьба)', hrFrom: 85, hrTo: 99, MET: 2 },
                { name: 'Умеренная активность (медленный бег)', hrFrom: 100, hrTo: 119, MET: 3 },
                { name: 'Аэробная (кардио)', hrFrom: 120, hrTo: 139, MET: 5 },
                { name: 'Анаэробная (активная нагрузка, когда тяжело)', hrFrom: 140, hrTo: 181, MET: 8 }
            ];
        }, []);

        const [zones, setZones] = React.useState(lsGet('heys_hr_zones', defaultZones));
        const [zonesSaved, setZonesSaved] = React.useState(false);

        // Перезагрузка данных при смене клиента (как в данных дня)
        React.useEffect(() => {
            let cancelled = false;
            const clientId = window.HEYS && window.HEYS.currentClientId;
            const cloud = window.HEYS && window.HEYS.cloud;

            const reloadData = () => {
                if (cancelled) return;

                const newProfile = lsGet('heys_profile', DEFAULT_PROFILE);
                newProfile.revision = newProfile.revision || 0;
                newProfile.updatedAt = newProfile.updatedAt || 0;

                // 🔍 DEBUG: Логируем загрузку профиля
                const isDefault = newProfile.weight === 70 && newProfile.height === 175 && newProfile.age === 30;
                console.log('[Profile Load] clientId:', (window.HEYS?.currentClientId || '').substring(0, 8),
                    '| isDefault:', isDefault,
                    '| weight:', newProfile.weight, '| height:', newProfile.height, '| age:', newProfile.age,
                    '| updatedAt:', newProfile.updatedAt, '| revision:', newProfile.revision);

                // Умный reload: не перезаписываем если текущее состояние новее
                setProfile(prev => {
                    const prevUpdatedAt = prev.updatedAt || 0;
                    const newUpdatedAt = newProfile.updatedAt || 0;
                    if (prevUpdatedAt > newUpdatedAt) {
                        return prev; // Текущее состояние новее — не перезаписываем
                    }
                    return newProfile;
                });

                const newZones = lsGet('heys_hr_zones', defaultZones);
                newZones.revision = newZones.revision || 0;
                newZones.updatedAt = newZones.updatedAt || 0;

                setZones(prev => {
                    const prevUpdatedAt = prev.updatedAt || 0;
                    const newUpdatedAt = newZones.updatedAt || 0;
                    if (prevUpdatedAt > newUpdatedAt) {
                        return prev;
                    }
                    return newZones;
                });
            };

            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
                    cloud.bootstrapClientSync(clientId)
                        .then(() => {
                            setTimeout(reloadData, 150); // Как в данных дня
                        })
                        .catch((err) => {
                            console.warn('[HEYS] Profile sync failed, using local cache:', err?.message || err);
                            reloadData(); // Загружаем из localStorage при ошибке
                        });
                } else {
                    reloadData();
                }
            } else {
                reloadData();
            }

            return () => { cancelled = true; };
        }, [window.HEYS && window.HEYS.currentClientId]);

        // Подписка на обновления профиля из wizard'а
        React.useEffect(() => {
            const handleProfileUpdate = (e) => {
                console.log('[Profile] Received profile-updated event from:', e?.detail?.source);
                const newProfile = lsGet('heys_profile', DEFAULT_PROFILE);
                setProfile(newProfile);
            };

            window.addEventListener('heys:profile-updated', handleProfileUpdate);
            return () => window.removeEventListener('heys:profile-updated', handleProfileUpdate);
        }, []);

        // Подписка на пульсовые зоны: внешний writer (cloud HOT-sync) меняет LS,
        // рефрешим React state. Без этого 1000мс debounced auto-save затрёт
        // внешние изменения старым стейтом (тот же класс бага, что был у
        // supplements profile clobber). Норми обрабатываются в HEYS_NormsCard.
        React.useEffect(() => {
            const handleZonesUpdate = () => {
                const incoming = lsGet('heys_hr_zones', null);
                if (!incoming) return;
                setZones(prev => {
                    const prevTs = (prev && prev.updatedAt) || 0;
                    const newTs = (incoming && incoming.updatedAt) || 0;
                    return prevTs > newTs ? prev : incoming;
                });
            };
            window.addEventListener('heys:hr-zones-updated', handleZonesUpdate);
            return () => window.removeEventListener('heys:hr-zones-updated', handleZonesUpdate);
        }, []);

        // Состояние "идёт ввод" для индикации
        const [profilePending, setProfilePending] = React.useState(false);
        const [zonesPending, setZonesPending] = React.useState(false);
        const profileInitRef = React.useRef(true);
        const zonesInitRef = React.useRef(true);

        React.useEffect(() => {
            // Пропускаем первый рендер (начальная загрузка)
            if (profileInitRef.current) {
                profileInitRef.current = false;
                return;
            }
            // Debounced сохранение профиля (1000ms — чтобы успеть ввести число)
            setProfilePending(true);
            setProfileSaved(false);
            setFieldStatus('pending');
            const timer = setTimeout(() => {
                // 🔍 DEBUG: Логируем сохранение профиля
                const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
                console.log('[Profile Save] clientId:', clientId?.substring(0, 8), '| weight:', profile.weight, '| height:', profile.height, '| age:', profile.age, '| updatedAt:', profile.updatedAt);
                lsSet('heys_profile', profile);

                // Синхронизация имени с списком клиентов
                let currentClientId = localStorage.getItem('heys_client_current');
                // Убираем кавычки если значение было сохранено как JSON string
                if (currentClientId && currentClientId.startsWith('"')) {
                    try { currentClientId = JSON.parse(currentClientId); } catch (e) { }
                }
                const fullName = HEYS.utils.buildFullName(profile.firstName, profile.lastName) || String(profile.name || '').trim();
                if (currentClientId && fullName) {
                    try {
                        const clientsRaw = localStorage.getItem('heys_clients');
                        const clients = clientsRaw ? JSON.parse(clientsRaw) : [];
                        const updatedClients = clients.map(c =>
                            c.id === currentClientId ? { ...c, name: fullName } : c
                        );
                        localStorage.setItem('heys_clients', JSON.stringify(updatedClients));

                        if (window.HEYS?.AppClientManagement?.notifyClientsUpdated) {
                            window.HEYS.AppClientManagement.notifyClientsUpdated(updatedClients, 'profile-settings');
                        } else {
                            window.dispatchEvent(new CustomEvent('heys:clients-updated', {
                                detail: { clients: updatedClients, source: 'profile-settings' }
                            }));
                        }

                        // ⚠️ Cloud sync имени отключён:
                        // - REST API read-only (PATCH блокируется CORS)
                        // - clients.name устанавливается куратором при создании клиента
                        // - Локальные изменения сохраняются в localStorage
                    } catch (e) {
                        console.warn('[Profile] Failed to sync client name:', e);
                    }
                }

                setProfilePending(false);
                setProfileSaved(true);
                setFieldStatus('saved');
                setTimeout(() => {
                    setProfileSaved(false);
                    setFieldStatus('idle');
                    setLastEditedField(null);
                }, 2000);
            }, 1000);
            return () => clearTimeout(timer);
        }, [profile]);
        React.useEffect(() => {
            // Пропускаем первый рендер
            if (zonesInitRef.current) {
                zonesInitRef.current = false;
                return;
            }
            // Debounced сохранение зон (1000ms)
            setZonesPending(true);
            setZonesSaved(false);
            const timer = setTimeout(() => {
                lsSet('heys_hr_zones', zones);
                setZonesPending(false);
                setZonesSaved(true);
                setTimeout(() => setZonesSaved(false), 2000);
            }, 1000);
            return () => clearTimeout(timer);
        }, [zones]);

        const maxHR = Math.max(0, 220 - toNum(profile.age || 0));
        const calPerMinPerMET = round1(toNum(profile.weight || 0) * 0.0175); // кал/мин на 1 MET

        // Отслеживание последнего изменённого поля для индикации
        const [lastEditedField, setLastEditedField] = React.useState(null);
        const [fieldStatus, setFieldStatus] = React.useState('idle'); // 'idle' | 'pending' | 'saved'

        // Индикатор статуса поля — показывается рядом с полем
        const FieldStatus = ({ fieldKey }) => {
            if (lastEditedField !== fieldKey) return null;
            if (fieldStatus === 'pending') {
                return profileHint('pending', 'Сохраняется...');
            }
            if (fieldStatus === 'saved') {
                return profileHint('saved', 'Сохранено');
            }
            return null;
        };

        function updateProfileField(key, value) {
            // Валидация числовых полей
            const validator = PROFILE_VALIDATORS[key];
            let validatedValue = validator ? validator(value) : value;

            // prompt-cycle-removal: cycleTrackingEnabled cannot be enabled in this release.
            if (key === 'cycleTrackingEnabled') {
                const hf = HEYS.healthFeatures;
                const available = hf && typeof hf.isCycleFeatureAvailable === 'function'
                  ? hf.isCycleFeatureAvailable(profile)
                  : false;
                if (!available && validatedValue) return;
                if (!available) validatedValue = false;
            }

            // Устанавливаем статус "pending" для этого поля
            setLastEditedField(key);
            setFieldStatus('pending');

            const newProfile = {
                ...profile,
                [key]: validatedValue,
                revision: (profile.revision || 0) + 1,
                updatedAt: Date.now()
            };
            setProfile(newProfile);
        }
        function updateZone(i, patch) {
            setZones(prev => {
                const updated = prev.map((z, idx) => idx === i ? { ...z, ...patch } : z);
                // Добавляем revision/updatedAt к массиву (нестандартно, но работает для JSON)
                updated.revision = (prev.revision || 0) + 1;
                updated.updatedAt = Date.now();
                return updated;
            });
        }
        function resetZones() { if (confirm('Сбросить пульсовые зоны к шаблону?')) setZones(defaultZones); }

        // Пресеты дефицита/профицита калорий
        const DEFICIT_PRESETS = [
            { value: -20, label: 'Агрессивное похудение', emoji: '🔥🔥', color: '#ef4444' },
            { value: -15, label: 'Активное похудение', emoji: '🔥', color: '#f97316' },
            { value: -10, label: 'Умеренное похудение', emoji: '🎯', color: '#eab308' },
            { value: 0, label: 'Поддержание веса', emoji: '⚖️', color: '#22c55e' },
            { value: 10, label: 'Умеренный набор', emoji: '💪', color: '#3b82f6' },
            { value: 15, label: 'Активный набор', emoji: '💪💪', color: '#3b82f6' }
        ];

        const getDeficitInfo = (val) => {
            const preset = DEFICIT_PRESETS.find(p => p.value === val);
            if (preset) return preset;
            // Для кастомных значений
            if (val < -10) return { emoji: '🔥🔥', color: '#ef4444', label: 'Агрессивный дефицит' };
            if (val < 0) return { emoji: '🔥', color: '#f97316', label: 'Дефицит' };
            if (val === 0) return { emoji: '⚖️', color: '#22c55e', label: 'Поддержание' };
            if (val <= 10) return { emoji: '💪', color: '#3b82f6', label: 'Профицит' };
            return { emoji: '💪💪', color: '#3b82f6', label: 'Агрессивный набор' };
        };

        return React.createElement('div', { className: 'page page-user', 'data-curator-target': 'profile' },
            React.createElement('div', { className: 'profile-accordion' },

                // === СЕКЦИЯ 1: Базовые параметры ===
                React.createElement(ProfileSection, {
                    id: 'basic',
                    icon: profileSvg('person'),
                    title: 'Базовые параметры',
                    subtitle: 'Рост, вес, возраст, цели',
                    tone: 'blue',
                    expanded: expandedSections.basic,
                    onToggle: () => toggleSection('basic')
                },
                    React.createElement('div', { className: 'profile-section__fields' },

                        // === ГРУППА 1: Личные данные ===
                        React.createElement(ProfileFieldGroup, { icon: profileSvg('person', 16), title: 'Личные данные' },
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Имя'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { value: profile.firstName, onChange: e => updateProfileField('firstName', e.target.value) }), React.createElement(FieldStatus, { fieldKey: 'firstName' })),
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Фамилия'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { value: profile.lastName, onChange: e => updateProfileField('lastName', e.target.value) }), React.createElement(FieldStatus, { fieldKey: 'lastName' })),
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Пол'), React.createElement('span', { className: 'sep' }, '-'),
                                React.createElement('select', { value: profile.gender, onChange: e => updateProfileField('gender', e.target.value) },
                                    React.createElement('option', { value: 'Мужской' }, 'Мужской'),
                                    React.createElement('option', { value: 'Женский' }, 'Женский'),
                                    React.createElement('option', { value: 'Другое' }, 'Другое')
                                ),
                                React.createElement(FieldStatus, { fieldKey: 'gender' })
                            ),
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Дата рождения'), React.createElement('span', { className: 'sep' }, '-'),
                                React.createElement('input', { type: 'date', value: profile.birthDate || '', onChange: e => updateProfileField('birthDate', e.target.value), style: { width: '140px' } }),
                                React.createElement(FieldStatus, { fieldKey: 'birthDate' }),
                                profile.birthDate && React.createElement('span', { style: { marginLeft: '8px', color: 'var(--gray-600)' } }, `(${calcAgeFromBirthDate(profile.birthDate)} лет)`)
                            ),
                            !profile.birthDate && React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Возраст (лет)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', value: profile.age, onChange: e => updateProfileField('age', Number(e.target.value) || 0), onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'age' })),
                            // Трекинг цикла снят с релиза (prompt-cycle-removal): экран включения отсутствует.
                        ),

                        // === ГРУППА 2: Параметры тела ===
                        React.createElement(ProfileFieldGroup, { icon: profileSvg('ruler', 16), title: 'Параметры тела' },
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Рост (см)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', value: profile.height, onChange: e => updateProfileField('height', Number(e.target.value) || 0), onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'height' })),
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Базовый вес (кг)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', step: '1', value: profile.baseWeight || profile.weight, onChange: e => updateProfileField('baseWeight', Number(e.target.value) || 0), onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'baseWeight' })),
                            // Текущий вес (из последнего чек-ина)
                            (() => {
                                // Ищем последний день с весом за последние 30 дней
                                let currentWeight = null;
                                let weightDate = null;
                                const today = new Date();
                                for (let i = 0; i < 30; i++) {
                                    const d = new Date(today);
                                    d.setDate(d.getDate() - i);
                                    const key = 'heys_dayv2_' + d.toISOString().slice(0, 10);
                                    const dayData = lsGet(key, null);
                                    if (dayData && dayData.weightMorning > 0) {
                                        currentWeight = dayData.weightMorning;
                                        weightDate = d.toISOString().slice(0, 10);
                                        break;
                                    }
                                }
                                const baseWeight = profile.baseWeight || profile.weight;
                                const diff = currentWeight && baseWeight ? round1(currentWeight - baseWeight) : null;
                                return React.createElement('div', { className: 'inline-field' },
                                    React.createElement('label', null, 'Текущий вес'),
                                    React.createElement('span', { className: 'sep' }, '-'),
                                    currentWeight
                                        ? React.createElement('span', { style: { fontWeight: 600 } },
                                            `${currentWeight} кг`,
                                            diff !== null && diff !== 0 && React.createElement('span', {
                                                className: diff < 0 ? 'profile-weight-diff--down' : 'profile-weight-diff--up'
                                            },
                                                diff > 0 ? `+${diff}` : diff, ' от базы'
                                            )
                                        )
                                        : React.createElement('span', { style: { color: 'var(--gray-400)', fontStyle: 'italic' } }, 'нет данных'),
                                    weightDate && React.createElement('span', { style: { marginLeft: '8px', fontSize: '12px', color: 'var(--gray-400)' } },
                                        `(${new Date(weightDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})`
                                    )
                                );
                            })(),
                            React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Целевой вес (кг)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', step: '1', value: profile.weightGoal || 0, onChange: e => updateProfileField('weightGoal', Number(e.target.value) || 0), placeholder: '0 = не задан', onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'weightGoal' })),

                            // === ПРОДВИНУТЫЙ РАСЧЁТ ДОСТИЖЕНИЯ ЦЕЛИ ===
                            (() => {
                                const startWeight = toNum(profile.baseWeight || profile.weight || 70);
                                const goalWeight = toNum(profile.weightGoal);
                                const deficitPct = toNum(profile.deficitPctTarget) || 0;
                                const height = toNum(profile.height || 175) / 100;
                                const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
                                const gender = profile.gender;

                                // Если нет цели или уже достигнута — не показываем
                                if (!goalWeight || goalWeight <= 0) return null;

                                // Получаем текущий вес из последнего чек-ина
                                let currentWeight = startWeight;
                                for (let i = 0; i < 30; i++) {
                                    const d = new Date();
                                    d.setDate(d.getDate() - i);
                                    const key = 'heys_dayv2_' + d.toISOString().slice(0, 10);
                                    const dayData = lsGet(key, null);
                                    if (dayData && dayData.weightMorning > 0) {
                                        currentWeight = dayData.weightMorning;
                                        break;
                                    }
                                }

                                const weightToLose = round1(currentWeight - goalWeight);
                                if (weightToLose <= 0) {
                                    return React.createElement('div', { className: 'profile-goal-panel profile-goal-panel--success' },
                                        React.createElement('div', { className: 'profile-goal-panel__title' },
                                            'Цель достигнута!',
                                            React.createElement('span', { className: 'muted', style: { marginLeft: '6px', fontWeight: 400, fontSize: '13px' } },
                                                weightToLose < 0 ? `Вы на ${Math.abs(weightToLose)} кг ниже цели` : 'Поздравляем!'
                                            )
                                        )
                                    );
                                }

                                // === НАУЧНЫЙ РАСЧЁТ ===
                                // BMR по Mifflin-St Jeor (Mifflin MD et al., Am J Clin Nutr 1990)
                                // Рекомендован ADA как наиболее точный для здоровых людей
                                // Единый источник BMR — HEYS.TDEE.calcBMR (Mifflin). height тут в метрах → ×100 в см.
                                const bmr = (HEYS.TDEE && HEYS.TDEE.calcBMR)
                                    ? HEYS.TDEE.calcBMR(currentWeight, { gender, height: height * 100, age })
                                    : round1(10 * currentWeight + 6.25 * (height * 100) - 5 * age + (gender === 'Женский' ? -161 : 5));

                                // === АДАПТИВНЫЙ TDEE ===
                                // Сначала ищем реальные данные активности за последние 7 дней
                                // Если достаточно данных (≥3 дней) — используем реальный TDEE
                                // Иначе — теоретический по множителю активности

                                // Собираем данные активности за 7 дней
                                const activityDays = [];
                                for (let i = 0; i < 7; i++) {
                                    const d = new Date();
                                    d.setDate(d.getDate() - i);
                                    const dateKey = d.toISOString().split('T')[0];
                                    const dayData = lsGet(`heys_dayv2_${dateKey}`, null);
                                    if (dayData) {
                                        // Калории от тренировок (упрощённый расчёт без MET)
                                        const trainings = dayData.trainings || [];
                                        let trainKcal = 0;
                                        trainings.forEach(t => {
                                            const zones = t.z || [0, 0, 0, 0];
                                            const mets = [2.5, 6, 8, 10]; // Дефолтные MET по зонам
                                            zones.forEach((min, zi) => {
                                                trainKcal += (min || 0) * ((mets[zi] * currentWeight * 0.0175) - 1);
                                            });
                                        });

                                        // Калории от шагов
                                        const stepsKcal = (dayData.steps || 0) * 0.7 / 1000 * currentWeight * (gender === 'Женский' ? 0.5 : 0.57);

                                        // Калории от бытовой активности
                                        const householdMin = (dayData.householdActivities || []).reduce((s, h) => s + (+h.minutes || 0), dayData.householdMin || 0);
                                        const householdKcal = householdMin * ((2.5 * currentWeight * 0.0175) - 1);

                                        const totalActivityKcal = Math.round(trainKcal + stepsKcal + householdKcal);

                                        // Считаем только дни с хоть какой-то активностью или данными
                                        if (dayData.steps > 0 || trainings.length > 0 || householdMin > 0) {
                                            activityDays.push({
                                                date: dateKey,
                                                activityKcal: totalActivityKcal,
                                                tdee: bmr + totalActivityKcal
                                            });
                                        }
                                    }
                                }

                                // Определяем TDEE
                                let tdee, tdeeSource;
                                const MIN_DAYS_FOR_REAL_TDEE = 3;

                                if (activityDays.length >= MIN_DAYS_FOR_REAL_TDEE) {
                                    // Используем реальные данные — средний TDEE за доступные дни
                                    const avgTdee = activityDays.reduce((s, d) => s + d.tdee, 0) / activityDays.length;
                                    tdee = round1(avgTdee);
                                    tdeeSource = 'real';
                                } else {
                                    // Теоретический TDEE по множителю активности (FAO/WHO/UNU 2001)
                                    const activityMultipliers = {
                                        'sedentary': 1.2,       // Сидячий (офис, нет тренировок)
                                        'light': 1.375,         // Лёгкая (1-3 трен/нед)
                                        'moderate': 1.55,       // Умеренная (3-5 трен/нед)
                                        'active': 1.725,        // Высокая (6-7 трен/нед)
                                        'very_active': 1.9      // Очень высокая (атлеты)
                                    };
                                    const profileActivity = profile?.activityLevel || 'moderate';
                                    const activityMultiplier = activityMultipliers[profileActivity] || 1.55;
                                    tdee = round1(bmr * activityMultiplier);
                                    tdeeSource = 'theoretical';
                                }

                                // Дневной дефицит калорий
                                const dailyDeficit = Math.abs(deficitPct) > 0 ? round1(tdee * Math.abs(deficitPct) / 100) : 0;

                                // === СОСТАВ ПОТЕРИ ВЕСА ===
                                // Forbes GB (1987, 2000): состав потери зависит от дефицита и тренировок
                                // Lean mass = мышцы + гликоген + связанная вода
                                // При умеренном дефиците + силовые: до 90% жира возможно
                                // Без силовых: 75-80% жир, 20-25% lean mass (из которых ~50% вода гликогена)
                                const isAggressive = Math.abs(deficitPct) > 20; // Порог снижен до 20% (научно обоснован)
                                const isVeryAggressive = Math.abs(deficitPct) > 30;

                                // Корректировка: разделяем на жир, гликоген+воду, и чистые мышцы
                                // При потере веса сначала уходит гликоген (с 3-4г воды на 1г гликогена)
                                let fatPercent, glycogenWaterPercent, leanMusclePercent;
                                if (isVeryAggressive) {
                                    fatPercent = 0.55;           // Сильный дефицит: больше мышц теряется
                                    glycogenWaterPercent = 0.25; // Гликоген + связанная вода
                                    leanMusclePercent = 0.20;    // Чистая мышечная ткань
                                } else if (isAggressive) {
                                    fatPercent = 0.65;
                                    glycogenWaterPercent = 0.22;
                                    leanMusclePercent = 0.13;
                                } else {
                                    fatPercent = 0.77;           // Hall KD (2008): ~77% при умеренном дефиците
                                    glycogenWaterPercent = 0.18; // ~400г гликогена + 1.2-1.6кг воды
                                    leanMusclePercent = 0.05;    // Минимум при правильном питании + тренировках
                                }

                                // Калорийность компонентов (ккал/кг) — научные данные
                                const KCAL_PER_KG_FAT = 7700;           // Hall KD (2008): жировая ткань ~7700 ккал/кг
                                const KCAL_PER_KG_LEAN_MUSCLE = 1100;   // Forbes GB (2000): ~20% белок, ~75% вода
                                const KCAL_PER_KG_GLYCOGEN_WATER = 700; // Гликоген 4ккал/г, но 1г гликогена связывает 3-4г воды

                                // Сколько каждого компонента нужно потерять
                                const fatToLose = round1(weightToLose * fatPercent);
                                const glycogenWaterToLose = round1(weightToLose * glycogenWaterPercent);
                                const leanMuscleToLose = round1(weightToLose * leanMusclePercent);

                                // Общий дефицит калорий нужный (Hall KD, 2011)
                                // Жир: 7700 ккал/кг, мышцы: 1100 ккал/кг, гликоген+вода: ~700 ккал/кг
                                const totalKcalDeficit = Math.round(
                                    fatToLose * KCAL_PER_KG_FAT +
                                    leanMuscleToLose * KCAL_PER_KG_LEAN_MUSCLE +
                                    glycogenWaterToLose * KCAL_PER_KG_GLYCOGEN_WATER
                                );

                                // Дней до цели
                                const daysToGoal = dailyDeficit > 0 ? Math.ceil(totalKcalDeficit / dailyDeficit) : null;
                                const weeksToGoal = daysToGoal ? Math.ceil(daysToGoal / 7) : null;
                                const monthsToGoal = daysToGoal ? round1(daysToGoal / 30) : null;

                                // Скорость потери веса (комбинированная формула)
                                // Учитываем, что не вся потеря = жир
                                const effectiveKcalPerKg = fatPercent * KCAL_PER_KG_FAT +
                                    glycogenWaterPercent * KCAL_PER_KG_GLYCOGEN_WATER +
                                    leanMusclePercent * KCAL_PER_KG_LEAN_MUSCLE;
                                const kgPerWeek = dailyDeficit > 0 ? round1((dailyDeficit * 7) / effectiveKcalPerKg) : 0;

                                // Предупреждения (ACSM Position Stand 2009)
                                const warnings = [];
                                if (isVeryAggressive) {
                                    warnings.push({ level: 'high', text: 'Дефицит >30% — высокий риск потери мышц и метаболической адаптации' });
                                } else if (isAggressive) {
                                    warnings.push({ level: 'high', text: 'Дефицит >20% — добавьте силовые тренировки для сохранения мышц' });
                                }
                                if (kgPerWeek > 1) {
                                    warnings.push({ text: `${kgPerWeek} кг/нед — рекомендация ACSM: 0.5-0.9 кг/нед` });
                                }
                                if (kgPerWeek > 1.5) {
                                    warnings.push({ level: 'high', text: 'Потеря >1.5 кг/нед увеличивает потерю мышц на 20-30%' });
                                }
                                if (deficitPct === 0) {
                                    warnings.push({ text: 'Установите дефицит в «Цели и метаболизм» для расчёта' });
                                }

                                // Дата достижения цели
                                const targetDate = daysToGoal ? new Date(Date.now() + daysToGoal * 24 * 60 * 60 * 1000) : null;

                                return React.createElement('div', { className: 'profile-goal-panel' },
                                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
                                        React.createElement('span', {
                                            className: 'profile-goal-panel__title',
                                            title: 'Источники: Mifflin (1990), Hall KD (2008), Forbes GB (2000), ACSM (2009). Колебания веса на весах частично вода и гликоген — ориентир на недельный тренд; подробнее в инсайте «Прогноз веса».'
                                        }, 'Расчёт достижения цели'),
                                        daysToGoal && React.createElement('span', { className: 'profile-goal-panel__badge' },
                                            weeksToGoal <= 4 ? `~${weeksToGoal} нед.` :
                                                monthsToGoal <= 12 ? `~${monthsToGoal} мес.` :
                                                    `~${round1(monthsToGoal / 12)} г.`
                                        )
                                    ),

                                    React.createElement('div', {
                                        className: 'profile-goal-panel__source' + (tdeeSource === 'real' ? ' profile-goal-panel__source--real' : '')
                                    },
                                        React.createElement('span', null,
                                            tdeeSource === 'real'
                                                ? `TDEE ${tdee} ккал — по вашим данным (${activityDays.length} дней)`
                                                : `TDEE ${tdee} ккал — теория (нужно ≥3 дня активности)`
                                        )
                                    ),

                                    React.createElement('div', { className: 'profile-goal-metrics' },
                                        React.createElement('div', { className: 'profile-goal-metric' },
                                            React.createElement('div', { className: 'profile-goal-metric__val' }, `${fatToLose} кг`),
                                            React.createElement('div', { className: 'profile-goal-metric__lbl' }, `Жир (${Math.round(fatPercent * 100)}%)`)
                                        ),
                                        React.createElement('div', { className: 'profile-goal-metric' },
                                            React.createElement('div', { className: 'profile-goal-metric__val' }, `${glycogenWaterToLose} кг`),
                                            React.createElement('div', { className: 'profile-goal-metric__lbl' }, 'Гликоген+вода')
                                        ),
                                        React.createElement('div', { className: 'profile-goal-metric' },
                                            React.createElement('div', { className: 'profile-goal-metric__val' }, `${leanMuscleToLose} кг`),
                                            React.createElement('div', { className: 'profile-goal-metric__lbl' }, `Мышцы (${Math.round(leanMusclePercent * 100)}%)`)
                                        )
                                    ),

                                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
                                        React.createElement('span', { className: 'pill profile-section__pill', style: { fontSize: '12px' } },
                                            `Нужно сжечь: ${(totalKcalDeficit / 1000).toFixed(0)}к ккал`
                                        ),
                                        dailyDeficit > 0 && React.createElement('span', { className: 'pill profile-section__pill', style: { fontSize: '12px' } },
                                            `Дефицит: ${dailyDeficit} ккал/день`
                                        ),
                                        kgPerWeek > 0 && React.createElement('span', { className: 'pill profile-section__pill', style: { fontSize: '12px' } },
                                            `~${kgPerWeek} кг/нед`
                                        ),
                                        targetDate && React.createElement('span', { className: 'pill profile-section__pill', style: { fontSize: '12px' } },
                                            targetDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
                                        )
                                    ),

                                    warnings.length > 0 && React.createElement('div', { style: { marginTop: '8px' } },
                                        warnings.map((w, i) =>
                                            React.createElement('div', {
                                                key: i,
                                                className: 'profile-goal-warn' + (w.level === 'high' ? ' profile-goal-warn--high' : '')
                                            }, w.text)
                                        )
                                    ),

                                    React.createElement('div', { className: 'muted', style: { marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(138, 74, 32, 0.08)', fontSize: '11px' } },
                                        `Формула: TDEE ${tdee} ккал × ${Math.abs(deficitPct)}% дефицит = ${dailyDeficit} ккал/день. `,
                                        `Жир 7700 ккал/кг, мышцы 1100 ккал/кг.`
                                    )
                                );
                            })()
                        ),

                        // === ГРУППА 3: Цели и метаболизм ===
                        React.createElement(ProfileFieldGroup, { icon: profileSvg('target', 16), title: 'Цели и метаболизм' },
                            // Целевой дефицит: пресеты + своё значение
                            (() => {
                                const currentVal = toNum(profile.deficitPctTarget || 0);
                                const isCustom = !DEFICIT_PRESETS.some(p => p.value === currentVal);
                                const info = getDeficitInfo(currentVal);

                                return React.createElement('div', { className: 'inline-field', style: { flexWrap: 'wrap', gap: '8px' } },
                                    React.createElement('label', { style: { fontWeight: 600 } }, 'Цель по калориям'),
                                    React.createElement('span', { className: 'sep' }, '-'),
                                    React.createElement('select', {
                                        value: isCustom ? 'custom' : String(currentVal),
                                        onChange: e => {
                                            if (e.target.value !== 'custom') {
                                                updateProfileField('deficitPctTarget', Number(e.target.value));
                                            }
                                        },
                                        style: { width: '200px', fontWeight: 600 }
                                    },
                                        ...DEFICIT_PRESETS.map(p =>
                                            React.createElement('option', { key: p.value, value: String(p.value) },
                                                `${p.emoji} ${p.value > 0 ? '+' : ''}${p.value}% — ${p.label}`
                                            )
                                        ),
                                        React.createElement('option', { value: 'custom' }, '✏️ Своё значение...')
                                    ),
                                    isCustom && React.createElement('input', {
                                        type: 'number',
                                        step: '1',
                                        min: '-50',
                                        max: '50',
                                        value: currentVal,
                                        onChange: e => updateProfileField('deficitPctTarget', Number(e.target.value) || 0),
                                        style: { width: '60px', marginLeft: '4px', fontWeight: 700, textAlign: 'center' }
                                    }),
                                    React.createElement('span', { style: { color: info.color, fontWeight: 600, marginLeft: '6px' } },
                                        isCustom ? `${info.emoji} ${currentVal > 0 ? '+' : ''}${currentVal}%` : ''
                                    ),
                                    React.createElement(FieldStatus, { fieldKey: 'deficitPctTarget' })
                                );
                            })(),
                            // Инсулиновая волна: предустановки + своё значение
                            (() => {
                                const INSULIN_PRESETS = [
                                    { value: 2.5, label: 'Быстрый метаболизм', desc: 'спортсмены, низкоуглеводка' },
                                    { value: 3, label: 'Нормальный', desc: 'большинство людей' },
                                    { value: 4, label: 'Медленный', desc: 'склонность к полноте' },
                                    { value: 4.5, label: 'Инсулинорезистентность', desc: 'преддиабет, СПКЯ' }
                                ];
                                const currentVal = toNum(profile.insulinWaveHours || 3);
                                const isCustom = !INSULIN_PRESETS.some(p => p.value === currentVal);
                                const currentPreset = INSULIN_PRESETS.find(p => p.value === currentVal);

                                return React.createElement('div', { className: 'inline-field', style: { flexWrap: 'wrap', gap: '8px' } },
                                    React.createElement('label', null, 'Инсулиновая волна'),
                                    React.createElement('span', { className: 'sep' }, '-'),
                                    React.createElement('select', {
                                        value: isCustom ? 'custom' : String(currentVal),
                                        onChange: e => {
                                            if (e.target.value === 'custom') {
                                                // Оставляем текущее значение, просто переключаем на custom
                                            } else {
                                                updateProfileField('insulinWaveHours', Number(e.target.value));
                                            }
                                        },
                                        style: { width: '180px' }
                                    },
                                        ...INSULIN_PRESETS.map(p =>
                                            React.createElement('option', { key: p.value, value: String(p.value) }, `${p.value} ч — ${p.label}`)
                                        ),
                                        React.createElement('option', { value: 'custom' }, 'Своё значение...')
                                    ),
                                    isCustom && React.createElement('input', {
                                        type: 'number',
                                        step: '0.5',
                                        min: '1',
                                        max: '8',
                                        value: currentVal,
                                        onChange: e => updateProfileField('insulinWaveHours', Number(e.target.value) || 3),
                                        style: { width: '60px', marginLeft: '4px' }
                                    }),
                                    React.createElement('span', { style: { color: 'var(--gray-500)', fontSize: '12px', marginLeft: '4px' } },
                                        currentPreset ? `(${currentPreset.desc})` : `(${currentVal} ч — своё)`
                                    ),
                                    React.createElement(FieldStatus, { fieldKey: 'insulinWaveHours' })
                                );
                            })(),
                            // Норма сна: авторасчёт с расшифровкой
                            (() => {
                                const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
                                const sleepNorm = calcSleepNorm(age, profile.gender);
                                return React.createElement('div', { className: 'inline-field' },
                                    React.createElement('label', null, 'Норма сна'),
                                    React.createElement('span', { className: 'sep' }, '-'),
                                    React.createElement('span', { style: { fontWeight: 600, minWidth: '50px' } }, `${sleepNorm.hours} ч`),
                                    React.createElement('span', { style: { marginLeft: '8px', color: 'var(--gray-500)', fontSize: '13px' } },
                                        `(${sleepNorm.explanation})`
                                    )
                                );
                            })(),
                            React.createElement(EmojiStyleSelector, null)
                        ),
                        // BMI/BMR расчёт + норма воды + прогресс к цели
                        (() => {
                            const w = toNum(profile.weight || 70);
                            const h = toNum(profile.height || 175) / 100; // в метрах
                            // Возраст: из даты рождения или вручную
                            const a = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
                            const bmi = h > 0 ? round1(w / (h * h)) : 0;
                            const bmr = (HEYS.TDEE && HEYS.TDEE.calcBMR)
                                ? HEYS.TDEE.calcBMR(w, { gender: profile.gender, height: h * 100, age: a })
                                : round1(10 * w + 6.25 * (h * 100) - 5 * a + (profile.gender === 'Женский' ? -161 : 5));
                            // BMI категория
                            let bmiCat = '', bmiColor = '#6b7280';
                            if (bmi < 18.5) { bmiCat = 'недовес'; bmiColor = '#eab308'; }
                            else if (bmi < 25) { bmiCat = 'норма'; bmiColor = '#22c55e'; }
                            else if (bmi < 30) { bmiCat = 'избыток'; bmiColor = '#f97316'; }
                            else { bmiCat = 'ожирение'; bmiColor = '#ef4444'; }

                            // Норма воды: 30 мл на кг веса
                            const waterNorm = round1(w * 30 / 1000); // в литрах

                            // Прогресс к целевому весу
                            const wGoal = toNum(profile.weightGoal);
                            const weightDiff = wGoal > 0 ? round1(w - wGoal) : 0;
                            const deficitPct = toNum(profile.deficitPctTarget) || 0;

                            // Расчёт времени достижения цели (если есть дефицит и цель)
                            // 1 кг жира ≈ 7700 ккал, дефицит/день = BMR * deficitPct%
                            let weeksToGoal = null;
                            if (wGoal > 0 && weightDiff !== 0 && deficitPct !== 0) {
                                const dailyDeficit = bmr * Math.abs(deficitPct) / 100;
                                const kgPerWeek = (dailyDeficit * 7) / 7700;
                                if (kgPerWeek > 0) {
                                    weeksToGoal = Math.ceil(Math.abs(weightDiff) / kgPerWeek);
                                }
                            }

                            return React.createElement('div', { style: { marginTop: '10px' } },
                                React.createElement('div', { className: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
                                    React.createElement('div', { className: 'pill profile-section__pill' }, `Макс. пульс: ${maxHR} уд/мин`),
                                    React.createElement('div', { className: 'pill profile-section__pill' }, `Кал/мин на 1 MET: ${calPerMinPerMET}`),
                                    React.createElement('div', { className: 'pill profile-section__pill' }, `BMR: ${bmr} ккал/сут`),
                                    React.createElement('div', { className: 'pill profile-section__pill' },
                                        `BMI: ${bmi}`,
                                        React.createElement('span', { className: 'muted', style: { marginLeft: '4px', fontSize: '12px' } }, `(${bmiCat})`)
                                    ),
                                    React.createElement('div', { className: 'pill profile-section__pill' }, `Норма воды: ${waterNorm} л/сут`)
                                ),
                                wGoal > 0 && React.createElement('div', { className: 'profile-goal-progress' },
                                    React.createElement('div', { className: 'profile-goal-progress__head' },
                                        React.createElement('span', { className: 'profile-goal-progress__label' }, `Цель: ${wGoal} кг`),
                                        React.createElement('span', {
                                            className: 'profile-goal-progress__status' + (weightDiff === 0 ? ' profile-goal-progress__status--ok' : '')
                                        },
                                            weightDiff === 0 ? 'Достигнуто' :
                                                weightDiff > 0 ? `Осталось сбросить: ${weightDiff} кг` :
                                                    `Осталось набрать: ${Math.abs(weightDiff)} кг`
                                        )
                                    ),
                                    React.createElement('div', { className: 'profile-progress-bar' },
                                        React.createElement('div', {
                                            className: 'profile-progress-bar__fill' + (weightDiff === 0 ? ' profile-progress-bar__fill--ok' : ''),
                                            style: { width: (weightDiff === 0 ? 100 : 50) + '%' }
                                        })
                                    ),
                                    weeksToGoal && deficitPct !== 0 && React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                                        `При дефиците ${Math.abs(deficitPct)}%: ~${weeksToGoal} нед.`
                                    )
                                )
                            );
                        })(),
                        React.createElement('div', { className: 'muted', style: { marginTop: '6px' } },
                            'Все значения сохраняются автоматически.'
                        )
                    ) // end profile-section__fields
                ), // end ProfileSection basic

                // === СЕКЦИЯ 2: Пульсовые зоны ===
                React.createElement(ProfileSection, {
                    id: 'hrZones',
                    icon: profileSvg('heart'),
                    title: 'Пульсовые зоны',
                    subtitle: 'Настройка зон для тренировок',
                    badge: `${zones.length} зон`,
                    tone: 'rose',
                    expanded: expandedSections.hrZones,
                    onToggle: () => toggleSection('hrZones')
                },
                    React.createElement('div', { className: 'profile-section__fields' },
                        React.createElement('div', { className: 'row', style: { justifyContent: 'flex-end', marginBottom: '8px' } },
                            React.createElement('button', { className: 'btn btn-sm', onClick: resetZones }, 'Сбросить')
                        ),
                        // Карточки пульсовых зон
                        React.createElement('div', { className: 'hr-zones-list' },
                            zones.map((z, i) => {
                                const calPerMin = round1((toNum(z.MET || 0) * calPerMinPerMET) - 1);
                                return React.createElement('div', { key: i, className: 'profile-hr-zone' },
                                    React.createElement('input', {
                                        className: 'profile-hr-zone__name',
                                        value: z.name,
                                        onChange: e => updateZone(i, { name: e.target.value }),
                                        onFocus: e => e.target.select()
                                    }),
                                    React.createElement('div', { className: 'profile-hr-zone__params' },
                                        React.createElement('div', { className: 'profile-hr-zone__chip' },
                                            React.createElement('span', { className: 'profile-hr-zone__chip-label' }, 'Пульс'),
                                            React.createElement('input', {
                                                type: 'number', value: z.hrFrom, onChange: e => updateZone(i, { hrFrom: Number(e.target.value) || 0 }), onFocus: e => e.target.select()
                                            }),
                                            React.createElement('span', { className: 'muted' }, '—'),
                                            React.createElement('input', {
                                                type: 'number', value: z.hrTo, onChange: e => updateZone(i, { hrTo: Number(e.target.value) || 0 }), onFocus: e => e.target.select()
                                            }),
                                            React.createElement('span', { className: 'muted', style: { fontSize: '11px' } }, 'уд/мин')
                                        ),
                                        React.createElement('div', { className: 'profile-hr-zone__chip' },
                                            React.createElement('span', { className: 'profile-hr-zone__chip-label' }, 'MET'),
                                            React.createElement('input', {
                                                type: 'number', step: '0.1', value: z.MET, onChange: e => updateZone(i, { MET: Number(e.target.value) || 0 }), onFocus: e => e.target.select()
                                            })
                                        ),
                                        React.createElement('div', { className: 'profile-hr-zone__kcal' },
                                            `${calPerMin} кал/мин`
                                        )
                                    )
                                );
                            })
                        ),
                        React.createElement('div', { className: 'muted', style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
                            'Макс пульс = 220 − возраст. Кал/мин = MET × (вес × 0.0175) − 1.',
                            zonesPending && profileHint('pending', 'Сохраняется...'),
                            zonesSaved && profileHint('saved', 'Сохранено')
                        )
                    ) // end profile-section__fields
                ), // end ProfileSection hrZones

                // === СЕКЦИЯ 3: Нормы и зоны ===
                React.createElement(ProfileSection, {
                    id: 'norms',
                    icon: profileSvg('stats'),
                    title: 'Нормы питания',
                    subtitle: 'Зоны калорийности и распределение БЖУ',
                    tone: 'violet',
                    expanded: expandedSections.norms,
                    onToggle: () => toggleSection('norms')
                },
                    React.createElement('div', { className: 'profile-section__fields' },
                        // Зоны калорийности (ratio zones)
                        React.createElement(HEYS_RatioZonesCard, null),
                        React.createElement(HEYS_NormsCard, null)
                    )
                ), // end ProfileSection norms

                // === СЕКЦИЯ: Уведомления (push) ===
                React.createElement(ProfileSection, {
                    id: 'notifications',
                    icon: profileSvg('bell'),
                    title: 'Уведомления и звук',
                    subtitle: pushRowStatusLabel,
                    tone: 'cyan',
                    expanded: expandedSections.notifications,
                    onToggle: () => toggleSection('notifications')
                },
                    React.createElement('div', { className: 'profile-section__fields' },
                        React.createElement(HEYS_PushSettingsCard, null),
                        React.createElement(SoundSettingsCard, null)
                    )
                ),

                // === СЕКЦИЯ 4: Безопасность (PIN) — только куратор ===
                isCuratorSession && React.createElement(ProfileSection, {
                    id: 'security',
                    icon: profileSvg('lock'),
                    title: 'Безопасность',
                    subtitle: 'Смена PIN для входа',
                    tone: 'amber',
                    expanded: expandedSections.security,
                    onToggle: () => toggleSection('security')
                },
                    React.createElement('div', { className: 'profile-section__fields' },
                        React.createElement('div', { className: 'profile-field-group' },
                            React.createElement('div', { className: 'profile-field-group__header', style: { alignItems: 'center', gap: '8px' } },
                                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('phone', 16)),
                                React.createElement('span', { className: 'profile-field-group__title' }, 'PIN клиента'),
                                React.createElement('span', { className: 'profile-field-group__badge' }, `Client ID: ${getShortClientId(getCurrentClientId())}`)
                            ),
                            React.createElement('div', { className: 'muted', style: { marginBottom: '8px' } }, 'Новый PIN должен состоять из 4 цифр. Старый PIN не требуется — изменение доступно только куратору.'),
                            pinKeypadKit
                                ? React.createElement('div', { className: 'space-y-4' },
                                    pinKeypadKit.renderPinKeypadSection({
                                        pin: newPinField,
                                        label: 'Новый PIN',
                                        sectionClassName: 'heys-auth-pin-section space-y-3 is-active',
                                        keypadRef: newPinKeypadRef,
                                    }),
                                    pinKeypadKit.renderPinKeypadSection({
                                        pin: confirmPinField,
                                        label: 'Подтверждение',
                                        sectionClassName: 'heys-auth-pin-section space-y-3 is-active',
                                        keypadRef: confirmPinKeypadRef,
                                    })
                                )
                                : React.createElement('div', { className: 'field-list' },
                                    React.createElement('div', { className: 'inline-field' },
                                        React.createElement('label', null, 'Новый PIN'),
                                        React.createElement('span', { className: 'sep' }, '-'),
                                        React.createElement('input', {
                                            type: 'password',
                                            inputMode: 'numeric',
                                            pattern: '\\d*',
                                            maxLength: 4,
                                            value: newPinField.pinValue,
                                            onChange: e => newPinField.applyPinDigits?.((e.target.value || '').replace(/[^0-9]/g, '').slice(0, 4).split('').concat(['', '', '', '']).slice(0, 4)),
                                            placeholder: '4 цифры',
                                            style: { width: '120px' }
                                        })
                                    ),
                                    React.createElement('div', { className: 'inline-field' },
                                        React.createElement('label', null, 'Подтверждение'),
                                        React.createElement('span', { className: 'sep' }, '-'),
                                        React.createElement('input', {
                                            type: 'password',
                                            inputMode: 'numeric',
                                            pattern: '\\d*',
                                            maxLength: 4,
                                            value: confirmPinField.pinValue,
                                            onChange: e => confirmPinField.applyPinDigits?.((e.target.value || '').replace(/[^0-9]/g, '').slice(0, 4).split('').concat(['', '', '', '']).slice(0, 4)),
                                            placeholder: 'Ещё раз',
                                            style: { width: '120px' }
                                        })
                                    )
                                ),
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' } },
                                React.createElement('button', {
                                    className: 'btn',
                                    onClick: handlePinUpdate,
                                    disabled: pinStatus === 'pending',
                                    style: { minWidth: '140px' }
                                }, window.HEYS?.WaitMark?.button?.(React, {
                                    busy: pinStatus === 'pending',
                                    ok: pinStatus === 'success',
                                    fail: pinStatus === 'error',
                                    idle: 'Обновить PIN',
                                    busyLabel: 'Сохраняем',
                                    okLabel: 'Сохранено',
                                    failLabel: 'Не удалось',
                                }) || (pinStatus === 'pending' ? 'Сохраняем…' : 'Обновить PIN')),
                            ),
                            pinMessage && React.createElement('div', {
                                className: 'muted',
                                style: { marginTop: '6px', color: pinStatus === 'error' ? '#a1471c' : undefined }
                            }, pinMessage)
                        )
                    )
                ), // end ProfileSection security

                // === СЕКЦИЯ 4.5: Мои согласия и данные (152-ФЗ ст.14/21, GDPR Art.15-18) ===
                React.createElement(ProfileSection, {
                    id: 'consents',
                    icon: profileSvg('document'),
                    title: 'Мои согласия и данные',
                    subtitle: 'Просмотр, отзыв, экспорт по 152-ФЗ',
                    tone: 'blue',
                    expanded: !!expandedSections.consents,
                    onToggle: () => toggleSection('consents')
                },
                    React.createElement('div', { className: 'profile-section__fields' },
                        React.createElement(MyConsentsAndDataCard, null)
                    )
                ),

                // === СЕКЦИЯ 5: Подписка (новый модуль HEYS.Subscription) ===
                React.createElement(ProfileSection, {
                    id: 'subscription',
                    icon: profileSvg('gem'),
                    title: 'Подписка',
                    subtitle: getSubscriptionSettingsSubtitle(window.HEYS?.Subscription),
                    tone: 'emerald',
                    expanded: expandedSections.subscription,
                    onToggle: () => toggleSection('subscription')
                },
                    // Простой компонент статуса подписки
                    React.createElement(SubscriptionStatusSection)
                ),

                // === СЕКЦИЯ 6: Система и аналитика ===
                React.createElement(ProfileSection, {
                    id: 'system',
                    icon: profileSvg('settings'),
                    title: 'Система',
                    subtitle: 'Советы, достижения и аналитика',
                    tone: 'slate',
                    expanded: expandedSections.system,
                    onToggle: () => toggleSection('system')
                },
                    React.createElement('div', { className: 'profile-section__fields' },
                        isCuratorSession && React.createElement('div', { className: 'profile-field-group' },
                            React.createElement('div', { className: 'profile-field-group__header' },
                                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('desktop', 16)),
                                React.createElement('span', { className: 'profile-field-group__title' }, 'Доступ с компьютера')
                            ),
                            React.createElement('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                                React.createElement('span', { style: { color: 'var(--gray-600)' } },
                                    'Разрешить вход с десктопа'
                                ),
                                React.createElement('label', { className: 'toggle-switch' },
                                    React.createElement('input', {
                                        type: 'checkbox',
                                        checked: !!profile.desktopAllowed,
                                        onChange: e => updateProfileField('desktopAllowed', e.target.checked)
                                    }),
                                    React.createElement('span', { className: 'toggle-slider' })
                                )
                            ),
                            React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                                profile.desktopAllowed
                                    ? 'Можно открывать на компьютере'
                                    : 'Приложение работает только на телефоне'
                            )
                        ),
                        React.createElement(LeaderboardSharingCard, null),
                        // Обучение временно выключено до актуализации тура.
                        React.createElement('div', { className: 'profile-field-group' },
                            React.createElement('div', { className: 'profile-field-group__header' },
                                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('cap', 16)),
                                React.createElement('span', { className: 'profile-field-group__title' }, 'Обучение')
                            ),
                            React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                                'Обучение временно выключено'
                            )
                        ),

                        // Статистика советов
                        React.createElement(HEYS_AdviceStatsCard, null),
                        // Настройки советов
                        React.createElement(HEYS_AdviceSettingsCard, null),
                        // Аналитика (перенесено из hdr-top)
                        window.HEYS.analyticsUI
                            ? React.createElement('div', { className: 'profile-field-group' },
                                React.createElement('div', { className: 'profile-field-group__header' },
                                    React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('stats', 16)),
                                    React.createElement('span', { className: 'profile-field-group__title' }, 'Аналитика')
                                ),
                                React.createElement('div', { style: { marginTop: '8px' } },
                                    React.createElement(window.HEYS.analyticsUI.AnalyticsButton)
                                )
                            )
                            : null,

                        // 🔒 Конфиденциальность (152-ФЗ ст. 21): отзыв согласия + удаление аккаунта
                        React.createElement(PrivacySettingsCard, null)
                    ) // end profile-section__fields
                ) // end ProfileSection system

            ) // end profile-accordion
        );
    }

    function LeaderboardSharingCard() {
        const lb = window.HEYS?.leaderboard;
        const [enabled, setEnabled] = React.useState(() => lb?.isSharingEnabled?.() || false);
        const [busy, setBusy] = React.useState(false);

        const handleToggle = (e) => {
            const next = e.target.checked;
            setEnabled(next);
            if (!lb?.toggleSharing) {
                console.warn('[HEYS.leaderboard] ⚠️ Module not loaded');
                return;
            }
            setBusy(true);
            lb.toggleSharing(next)
                .then(() => setBusy(false))
                .catch(() => setBusy(false));
        };

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('trophy', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Рейтинг баланса дня')
            ),
            React.createElement('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                React.createElement('span', { style: { color: 'var(--gray-600)' } },
                    'Участвовать в рейтинге'
                ),
                React.createElement('label', { className: 'toggle-switch' },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: enabled,
                        disabled: busy,
                        onChange: handleToggle
                    }),
                    React.createElement('span', { className: 'toggle-slider' })
                )
            ),
            React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                enabled
                    ? '✓ Ваш баланс дня виден другим участникам'
                    : 'Другие участники не видят ваш результат'
            )
        );
    }

    function SoundSettingsCard() {
        const [settings, setSettings] = React.useState(() => {
            return window.HEYS?.audio?.getSettings?.() || {
                masterEnabled: true,
                volume: 0.12,
                hapticEnabled: true,
                quietHoursEnabled: false
            };
        });

        const handleMasterToggle = (e) => {
            const newSettings = { ...settings, masterEnabled: e.target.checked };
            setSettings(newSettings);
            window.HEYS?.audio?.saveSettings?.({ masterEnabled: e.target.checked });
        };

        const handleHapticToggle = (e) => {
            const newSettings = { ...settings, hapticEnabled: e.target.checked };
            setSettings(newSettings);
            window.HEYS?.audio?.saveSettings?.({ hapticEnabled: e.target.checked });
        };

        const handleQuietToggle = (e) => {
            const newSettings = { ...settings, quietHoursEnabled: e.target.checked };
            setSettings(newSettings);
            window.HEYS?.audio?.saveSettings?.({ quietHoursEnabled: e.target.checked });
        };

        const handleVolumeChange = (e) => {
            const volume = parseFloat(e.target.value);
            const newSettings = { ...settings, volume };
            setSettings(newSettings);
            window.HEYS?.audio?.saveSettings?.({ volume });
        };

        const previewReward = () => {
            window.HEYS?.audio?.preview?.('reward');
        };

        const previewSuccess = () => {
            window.HEYS?.audio?.preview?.('success');
        };

        const previewTriumph = () => {
            window.HEYS?.audio?.preview?.('triumph');
        };

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('speaker', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Звук и вибрация')
            ),
            React.createElement('div', { className: 'sound-settings-card' },
                React.createElement('div', { className: 'sound-settings-card__row' },
                    React.createElement('span', { className: 'sound-settings-card__label sound-settings-card__label--strong' }, 'Звуки включены'),
                    React.createElement('label', { className: 'toggle-switch' },
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: settings.masterEnabled !== false,
                            onChange: handleMasterToggle
                        }),
                        React.createElement('span', { className: 'toggle-slider' })
                    )
                ),

                settings.masterEnabled !== false && React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'sound-settings-card__slider-row' },
                        React.createElement('span', { className: 'sound-settings-card__slider-label' }, 'Громкость'),
                        React.createElement('input', {
                            type: 'range',
                            min: '0.04',
                            max: '0.3',
                            step: '0.02',
                            value: settings.volume ?? 0.12,
                            onChange: handleVolumeChange,
                            className: 'sound-settings-card__slider-input'
                        }),
                        React.createElement('span', { className: 'sound-settings-card__slider-value' },
                            `${Math.round((settings.volume ?? 0.12) * 100)}%`
                        )
                    ),

                    React.createElement('div', { className: 'sound-settings-card__row' },
                        React.createElement('span', { className: 'sound-settings-card__label' }, 'Вибрация'),
                        React.createElement('label', { className: 'toggle-switch' },
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: settings.hapticEnabled !== false,
                                onChange: handleHapticToggle
                            }),
                            React.createElement('span', { className: 'toggle-slider' })
                        )
                    ),

                    React.createElement('div', { className: 'sound-settings-card__row' },
                        React.createElement('div', { className: 'sound-settings-card__hint-group' },
                            React.createElement('div', { className: 'sound-settings-card__label' }, 'Тихие часы'),
                            React.createElement('div', { className: 'sound-settings-card__hint-subtitle' }, '23:00 – 07:00')
                        ),
                        React.createElement('label', { className: 'toggle-switch' },
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: settings.quietHoursEnabled !== false,
                                onChange: handleQuietToggle
                            }),
                            React.createElement('span', { className: 'toggle-slider' })
                        )
                    ),

                    React.createElement('div', null,
                        React.createElement('div', { className: 'sound-settings-card__preview-title' }, 'Предпрослушивание'),
                        React.createElement('div', { className: 'sound-settings-card__preview-actions' },
                            React.createElement('button', {
                                className: 'btn-secondary sound-settings-card__preview-button',
                                onClick: previewReward
                            }, 'Награда'),
                            React.createElement('button', {
                                className: 'btn-secondary sound-settings-card__preview-button',
                                onClick: previewSuccess
                            }, 'Цель'),
                            React.createElement('button', {
                                className: 'btn-secondary sound-settings-card__preview-button',
                                onClick: previewTriumph
                            }, 'Уровень')
                        )
                    )
                )
            ),
            React.createElement('div', { className: 'muted sound-settings-card__status' },
                'Тихие часы сейчас отключены по умолчанию, но их можно включить обратно здесь.'
            )
        );
    }

    // === Статистика советов ===
    function HEYS_AdviceStatsCard() {
        const [stats, setStats] = React.useState({ totalAdvicesRead: 0 });

        React.useEffect(() => {
            // Получаем статистику из геймификации
            if (window.HEYS?.game?.getStats) {
                const gameStats = window.HEYS.game.getStats();
                setStats(gameStats.stats || { totalAdvicesRead: 0 });
            }

            // Подписываемся на обновления
            const handleUpdate = () => {
                if (window.HEYS?.game?.getStats) {
                    const gameStats = window.HEYS.game.getStats();
                    setStats(gameStats.stats || { totalAdvicesRead: 0 });
                }
            };
            window.addEventListener('heysGameUpdate', handleUpdate);
            return () => window.removeEventListener('heysGameUpdate', handleUpdate);
        }, []);

        const total = stats.totalAdvicesRead || 0;

        // Прогресс к следующему достижению
        let nextMilestone, progress, remaining;
        if (total < 50) {
            nextMilestone = 50;
            progress = (total / 50) * 100;
            remaining = 50 - total;
        } else if (total < 200) {
            nextMilestone = 200;
            progress = (total / 200) * 100;
            remaining = 200 - total;
        } else {
            nextMilestone = null;
            progress = 100;
            remaining = 0;
        }

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('advice', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Советы')
            ),
            React.createElement('div', { className: 'profile-advice-stats' },
                React.createElement('div', { className: 'profile-advice-stats__row' },
                    React.createElement('span', { className: 'muted' }, 'Прочитано советов:'),
                    React.createElement('span', { className: 'profile-advice-stats__count' }, total)
                ),
                nextMilestone && React.createElement('div', null,
                    React.createElement('div', { className: 'profile-advice-stats__meta' },
                        React.createElement('span', null, `До достижения «${nextMilestone === 50 ? 'Внимательный' : 'Мудрец'}»`),
                        React.createElement('span', null, `${remaining} осталось`)
                    ),
                    React.createElement('div', { className: 'profile-progress-bar' },
                        React.createElement('div', {
                            className: 'profile-progress-bar__fill',
                            style: { width: progress + '%' }
                        })
                    )
                ),
                !nextMilestone && React.createElement('div', { className: 'profile-advice-stats__done' },
                    'Все достижения за советы получены'
                )
            )
        );
    }

    // === Настройки советов ===
    function HEYS_AdviceSettingsCard() {
        const advice = window.HEYS?.advice;
        if (!advice?.getAdviceSettings) return null;

        const [settings, setSettings] = React.useState(function () { return advice.getAdviceSettings(); });
        const [saved, setSaved] = React.useState(false);

        const categories = advice.CATEGORY_LABELS || {};

        var toggleCategory = function (cat, enabled) {
            var newSettings = {
                ...settings,
                categories: { ...settings.categories, [cat]: enabled }
            };
            setSettings(newSettings);
            advice.setAdviceSettings(newSettings);
            setSaved(true);
            setTimeout(function () { setSaved(false); }, 1500);
        };

        var updateSetting = function (key, value) {
            var newSettings = { ...settings, [key]: value };
            setSettings(newSettings);
            advice.setAdviceSettings(newSettings);
            setSaved(true);
            setTimeout(function () { setSaved(false); }, 1500);
        };

        var catEntries = Object.entries(categories);

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('settings', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Настройки советов')
            ),

            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' } },
                catEntries.map(function (entry) {
                    var cat = entry[0];
                    var info = entry[1];
                    var isEnabled = settings.categories?.[cat] !== false;

                    return React.createElement('div', {
                        key: cat,
                        title: info.desc,
                        onClick: function () { toggleCategory(cat, !isEnabled); },
                        className: 'profile-advice-chip' + (isEnabled ? ' is-on' : '')
                    },
                        React.createElement('span', { className: 'profile-advice-chip__icon' }, info.icon),
                        React.createElement('span', null, info.name)
                    );
                })
            ),

            React.createElement('div', { className: 'profile-inline-checks' },
                React.createElement('label', { className: 'profile-inline-check' },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: settings.hapticEnabled !== false,
                        onChange: function (e) { updateSetting('hapticEnabled', e.target.checked); }
                    }),
                    React.createElement('span', null, 'Вибрация')
                ),

                React.createElement('label', { className: 'profile-inline-check' },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: settings.soundEnabled !== false,
                        onChange: function (e) { updateSetting('soundEnabled', e.target.checked); }
                    }),
                    React.createElement('span', null, 'Звук')
                ),

                React.createElement('label', { className: 'profile-inline-check' },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: settings.showDetails !== false,
                        onChange: function (e) { updateSetting('showDetails', e.target.checked); }
                    }),
                    React.createElement('span', null, 'Детали')
                ),

                React.createElement('label', { className: 'profile-inline-check' },
                    React.createElement('span', null, 'Макс:'),
                    React.createElement('input', {
                        type: 'number',
                        min: 5,
                        max: 50,
                        value: settings.maxPerDay || 20,
                        onChange: function (e) { updateSetting('maxPerDay', parseInt(e.target.value) || 20); },
                        style: {
                            width: '50px',
                            padding: '4px 6px',
                            borderRadius: '6px',
                            border: '1px solid rgba(138, 74, 32, 0.12)',
                            textAlign: 'center',
                            fontSize: '13px',
                            background: 'var(--v4-bg, #fffaf1)'
                        }
                    })
                )
            ),

            saved && profileHint('saved', 'Сохранено')
        );
    }

    // === Зоны калорийности (ratio zones) ===
    function HEYS_RatioZonesCard() {
        const rz = HEYS.ratioZones;
        const [zones, setZones] = React.useState(() => rz ? rz.getZones() : []);
        const [saved, setSaved] = React.useState(false);

        // Синхронизация с модулем
        React.useEffect(() => {
            if (rz) setZones(rz.getZones());
        }, []);

        const updateZone = (i, field, value) => {
            const newZones = zones.map((z, idx) => {
                if (idx !== i) return z;
                const updated = { ...z, [field]: value };
                return updated;
            });

            // Автокорректировка границ соседних зон
            if (field === 'to' && i < newZones.length - 1) {
                newZones[i + 1] = { ...newZones[i + 1], from: value };
            }
            if (field === 'from' && i > 0) {
                newZones[i - 1] = { ...newZones[i - 1], to: value };
            }

            setZones(newZones);
            if (rz) {
                rz.setZones(newZones);
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
            }
        };

        const resetZones = () => {
            if (confirm('Сбросить зоны калорийности к значениям по умолчанию?')) {
                if (rz) {
                    const def = rz.resetZones();
                    setZones(def);
                }
            }
        };

        // Формат для отображения
        const fmtPct = (v) => {
            if (v === 0) return '0%';
            if (v === Infinity || v > 100) return '∞';
            return Math.round(v * 100) + '%';
        };

        if (!rz) {
            return React.createElement('div', { className: 'profile-field-group' },
                React.createElement('div', { className: 'muted' }, 'Модуль ratioZones не загружен')
            );
        }

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header', style: { justifyContent: 'space-between' } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('palette', 16)),
                    React.createElement('span', { className: 'profile-field-group__title' }, 'Зоны калорийности')
                ),
                React.createElement('button', { className: 'btn btn-sm', onClick: resetZones, style: { marginLeft: 'auto' } }, 'Сбросить')
            ),
            React.createElement('div', { className: 'muted', style: { marginBottom: '12px' } },
                'Определяют цвета в календаре, графиках и советах. Ratio = съедено / норма.'
            ),
            React.createElement('div', { className: 'ratio-zones-list' },
                zones.map((z, i) => {
                    const demoRatio = z.to === Infinity ? z.from + 0.2 : (z.from + z.to) / 2;
                    const bgColor = rz.getGradientColor(demoRatio, 0.5);
                    const fromVal = i === 0 ? null : z.from;
                    const toVal = i === zones.length - 1 ? null : z.to;

                    return React.createElement('div', {
                        key: z.id,
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 12px',
                            marginBottom: '6px',
                            background: 'rgba(255,255,255,0.6)',
                            borderRadius: '10px',
                            border: '1px solid rgba(0,0,0,0.05)'
                        }
                    },
                        React.createElement('div', {
                            style: {
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                background: z.color,
                                flexShrink: 0,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }
                        }),
                        React.createElement('input', {
                            value: z.name,
                            onChange: function (e) { updateZone(i, 'name', e.target.value); },
                            style: {
                                flex: 1,
                                minWidth: 0,
                                padding: '6px 10px',
                                fontSize: '13px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                borderRadius: '6px',
                                background: 'rgba(255,255,255,0.8)',
                                fontWeight: 500
                            }
                        }),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                flexShrink: 0
                            }
                        },
                            fromVal === null
                                ? React.createElement('span', { style: { width: '45px', textAlign: 'center', fontSize: '12px', color: 'var(--gray-400)' } }, '0%')
                                : React.createElement('input', {
                                    type: 'number',
                                    step: '0.05',
                                    min: '0',
                                    max: '2',
                                    value: fromVal,
                                    onChange: function (e) { updateZone(i, 'from', parseFloat(e.target.value) || 0); },
                                    style: { width: '45px', padding: '5px', fontSize: '12px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '5px' }
                                }),
                            React.createElement('span', { style: { color: 'var(--gray-400)', fontSize: '11px' } }, '→'),
                            toVal === null
                                ? React.createElement('span', { style: { width: '45px', textAlign: 'center', fontSize: '12px', color: 'var(--gray-400)' } }, '∞')
                                : React.createElement('input', {
                                    type: 'number',
                                    step: '0.05',
                                    min: '0',
                                    max: '2',
                                    value: toVal,
                                    onChange: function (e) { updateZone(i, 'to', parseFloat(e.target.value) || 0); },
                                    style: { width: '45px', padding: '5px', fontSize: '12px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '5px' }
                                })
                        ),
                        React.createElement('div', {
                            style: {
                                padding: '4px 10px',
                                borderRadius: '6px',
                                background: bgColor,
                                textAlign: 'center',
                                fontSize: '11px',
                                fontWeight: 600,
                                flexShrink: 0,
                                minWidth: '45px'
                            }
                        }, fmtPct(demoRatio))
                    );
                })
            ),
            React.createElement('div', { className: 'muted', style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
                'Зоны применяются везде: календарь, sparkline, heatmap, советы.',
                saved && profileHint('saved', 'Сохранено')
            )
        );
    }


    // === Push-уведомления (новая секция) ===
    function HEYS_PushSettingsCard() {
        const isCurator = (() => {
            try {
                if (HEYS.auth?.isCuratorSession?.() === true) return true;
            } catch { /* noop */ }
            try {
                if (HEYS.cloud?.getUser?.()) return true;
            } catch { /* noop */ }
            try { return !!localStorage.getItem('heys_curator_cookie_session_hint'); } catch { return false; }
        })();

        const defaults = isCurator
            ? { enabled: true, quiet_start: '22:00', quiet_end: '08:00', inactive_client_enabled: true }
            : {
                enabled: true,
                quiet_start: '23:00', quiet_end: '09:00',
                // существующие 3:
                meal_reminder_enabled: true, meal_reminder_gap_hours: 4,
                evening_summary_enabled: true, evening_summary_time: '21:00',
                streak_celebration_enabled: true,
                // 11 новых (по умолчанию все включены):
                morning_breakfast_enabled: true,
                morning_checkin_enabled: true,
                morning_vitamins_enabled: true,
                water_hint_enabled: true,
                cal_90_enabled: true,
                macro_over_enabled: true,
                overeat_3d_enabled: true,
                late_meal_enabled: true,
                ews_client_hint_enabled: true,
            };

        const [prefs, setPrefs] = React.useState(() => {
            const stored = lsGet('heys_push_prefs', null) || {};
            return { ...defaults, ...stored };
        });
        const [status, setStatus] = React.useState(null);
        const [busy, setBusy] = React.useState(false);
        const [testResult, setTestResult] = React.useState(null);
        const [accessSignOpen, setAccessSignOpen] = React.useState(false);
        const [accessSignError, setAccessSignError] = React.useState('');
        const pushPinKeypadKit = HEYS.AuthPinKeypad?.createKit?.(React);
        const usePushAccessPin = pushPinKeypadKit ? pushPinKeypadKit.usePinKeypad : useFallbackCuratorPinField;
        const pushAccessPin = usePushAccessPin({
            disabled: busy,
            idPrefix: 'push-consent-pin',
            autoFocus: accessSignOpen,
        });
        const pushAccessKeypadRef = React.useRef(null);

        // Refresh статуса при монтировании и когда рубильник сработал в другом месте.
        React.useEffect(() => {
            if (!HEYS.push) return;
            HEYS.push.getStatus().then(setStatus).catch(() => {});
            const onChanged = () => {
                HEYS.push.getStatus().then(setStatus).catch(() => {});
            };
            window.addEventListener('heys:push-enabled-changed', onChanged);
            return () => window.removeEventListener('heys:push-enabled-changed', onChanged);
        }, []);

        const refreshStatus = async () => {
            if (!HEYS.push) return;
            try { setStatus(await HEYS.push.getStatus()); } catch {}
        };

        const [savedHint, setSavedHint] = React.useState(null);
        const savedTimerRef = React.useRef(null);

        const update = (patch) => {
            const next = { ...prefs, ...patch };
            setPrefs(next);
            // Локально сразу — синк с бэком debounced ниже.
            lsSet('heys_push_prefs', next);
            // Шлём на бэк (если есть подписка).
            if (HEYS.push && status?.subscribed) {
                HEYS.push.savePrefs(patch).catch((err) =>
                    console.warn('[push.prefs] save failed:', err?.message)
                );
            }
            // Маленький подтверждающий toast «✓ сохранено» в углу карточки.
            setSavedHint('✓ Сохранено');
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
            savedTimerRef.current = setTimeout(() => setSavedHint(null), 1500);
        };

        const handleEnableClick = async (accessCode) => {
            if (!HEYS.push) return;
            setBusy(true);
            setAccessSignError('');
            try {
                const opts = accessCode ? { accessCode } : {};
                const r = await (HEYS.push.setEnabled
                    ? HEYS.push.setEnabled(true, opts)
                    : HEYS.push.subscribe());
                if (!r.ok) {
                    if (r.reason === 'consent_needs_access_code') {
                        setAccessSignOpen(true);
                        pushAccessPin.resetDigits?.();
                        return;
                    }
                    if (!HEYS.push?.explainEnableFailure?.(r.reason)) {
                        if (r.reason === 'consent_failed') {
                            try { alert('Не удалось записать согласие на уведомления. Попробуй ещё раз.'); } catch (_) { /* ignore */ }
                        }
                    }
                } else {
                    setAccessSignOpen(false);
                }
            } finally {
                setBusy(false);
                await refreshStatus();
            }
        };

        const handlePushAccessCodeSign = async () => {
            if (!HEYS.auth?.validatePinStrict?.(pushAccessPin.pinValue)) {
                setAccessSignError('Введите код доступа из 4 цифр');
                return;
            }
            setBusy(true);
            setAccessSignError('');
            try {
                const opts = { accessCode: pushAccessPin.pinValue };
                const r = await HEYS.push.setEnabled(true, opts);
                if (!r.ok) {
                    if (r.reason === 'consent_failed' || r.reason === 'consent_needs_access_code') {
                        setAccessSignError('Код не подошёл или не удалось подписать согласие');
                        pushAccessPin.resetDigits?.();
                        return;
                    }
                    setAccessSignOpen(false);
                    HEYS.push?.explainEnableFailure?.(r.reason);
                    return;
                }
                setAccessSignOpen(false);
            } finally {
                setBusy(false);
                await refreshStatus();
            }
        };

        const handleDisableClick = async () => {
            if (!HEYS.push) return;
            if (!confirm('Отключить уведомления полностью?')) return;
            setBusy(true);
            try {
                // Пользовательский тумблер, а не отзыв согласия: выключение
                // снимает подписку устройства и оставляет подписанное согласие
                // действующим — иначе следующее включение снова просило бы
                // подпись кодом. Кнопка отзыва на экране согласий ниже зовёт
                // setEnabled(false) без опции и отзывает по-настоящему.
                if (HEYS.push.setEnabled) await HEYS.push.setEnabled(false, { revokeConsent: false });
                else await HEYS.push.unsubscribe();
            } finally {
                setBusy(false);
                await refreshStatus();
            }
        };

        const handleTest = async () => {
            if (!HEYS.push) return;
            setTestResult(null);
            setBusy(true);
            try {
                const r = await HEYS.push.sendTest();
                if (r?.success && r.sent > 0) setTestResult(`✓ Отправлено на ${r.sent} устройств(а). Должен прилететь через пару секунд.`);
                else if (r?.error === 'no_subscriptions') setTestResult('⚠ Нет активных подписок. Включи уведомления.');
                else setTestResult(`⚠ ${r?.error || 'не отправлено'}`);
            } catch (e) {
                setTestResult(`❌ ${e.message}`);
            } finally { setBusy(false); }
        };

        // Не-capable браузер.
        if (status && !status.capable) {
            return React.createElement('div', { style: { padding: '12px', color: '#71717a' } },
                'Этот браузер не поддерживает push-уведомления (нужен Chrome/Edge/Firefox/Safari 16.4+).'
            );
        }

        // iOS не-standalone — баннер про установку.
        if (status?.needsInstall) {
            return React.createElement('div', { className: 'profile-ios-install' },
                React.createElement('div', { className: 'profile-ios-install__title' },
                    'Сначала установите HEYS на домашний экран'),
                React.createElement('div', { className: 'profile-ios-install__text' },
                    'На iPhone уведомления работают только из установленного приложения. Нажми ' +
                    'Поделиться → «На экран Домой», запусти HEYS с домашнего экрана и вернись сюда.')
            );
        }

        const Toggle = ({ value, onChange }) =>
            React.createElement('label', { className: 'toggle-switch' },
                React.createElement('input', {
                    type: 'checkbox', checked: !!value, onChange: (e) => onChange(e.target.checked)
                }),
                React.createElement('span', { className: 'toggle-slider' })
            );

        const TimeInput = ({ value, onChange }) =>
            React.createElement('input', {
                type: 'time', value: value || '', onChange: (e) => onChange(e.target.value),
                className: 'profile-push-input'
            });

        const NumberInput = ({ value, min, max, onChange }) =>
            React.createElement('input', {
                type: 'number', value: value || '', min, max,
                onChange: (e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min))),
                className: 'profile-push-input profile-push-input--num'
            });

        const Row = (label, control) =>
            React.createElement('div', { className: 'profile-push-row' },
                React.createElement('span', { className: 'profile-push-row__label' }, label),
                control
            );

        return React.createElement('div', { className: 'profile-push-card' },
            // Статус + главная кнопка
            React.createElement('div', {
                className: 'profile-push-status' + (status?.subscribed ? ' profile-push-status--on' : '')
            },
                React.createElement('div', { className: 'profile-push-status__row' },
                    React.createElement('div', null,
                        React.createElement('div', { className: 'profile-push-status__title' },
                            status?.subscribed ? 'Уведомления включены' : 'Уведомления выключены'),
                        React.createElement('div', { className: 'profile-push-status__meta' },
                            'Разрешение: ', status?.permission || '—')
                    ),
                    status?.subscribed
                        ? React.createElement('button', {
                            onClick: handleDisableClick, disabled: busy,
                            className: 'profile-push-status__btn'
                        }, 'Отключить')
                        : React.createElement('button', {
                            onClick: () => handleEnableClick(), disabled: busy,
                            className: 'profile-push-status__btn profile-push-status__btn--act'
                        }, busy ? '…' : 'Включить')
                )
            ),

            // Тонкие настройки (только если подписан и включён общий тумблер).
            status?.subscribed && Row(
                isCurator
                    ? 'Алерт о пропавших клиентах (2+ дня)'
                    : 'Напоминание о записи еды',
                React.createElement(Toggle, {
                    value: isCurator ? prefs.inactive_client_enabled : prefs.meal_reminder_enabled,
                    onChange: (v) => update(isCurator
                        ? { inactive_client_enabled: v }
                        : { meal_reminder_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && prefs.meal_reminder_enabled && Row(
                'Через сколько часов без записи',
                React.createElement(NumberInput, {
                    value: prefs.meal_reminder_gap_hours, min: 3, max: 6,
                    onChange: (v) => update({ meal_reminder_gap_hours: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Вечерний итог дня',
                React.createElement(Toggle, {
                    value: prefs.evening_summary_enabled,
                    onChange: (v) => update({ evening_summary_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && prefs.evening_summary_enabled && Row(
                'Время итога',
                React.createElement(TimeInput, {
                    value: prefs.evening_summary_time,
                    onChange: (v) => update({ evening_summary_time: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Похвала за 7 дней без пропусков',
                React.createElement(Toggle, {
                    value: prefs.streak_celebration_enabled,
                    onChange: (v) => update({ streak_celebration_enabled: v })
                })
            ),

            // ── Группа: Утро ────────────────────────────────────
            !isCurator && status?.subscribed && React.createElement('div', {
                className: 'profile-push-group'
            }, 'Утро'),
            !isCurator && status?.subscribed && Row(
                'Напоминание про завтрак (если нет к 12:00)',
                React.createElement(Toggle, {
                    value: prefs.morning_breakfast_enabled !== false,
                    onChange: (v) => update({ morning_breakfast_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Утренний чек-ин (взвесься + сон)',
                React.createElement(Toggle, {
                    value: prefs.morning_checkin_enabled !== false,
                    onChange: (v) => update({ morning_checkin_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Напоминание про витамины',
                React.createElement(Toggle, {
                    value: prefs.morning_vitamins_enabled !== false,
                    onChange: (v) => update({ morning_vitamins_enabled: v })
                })
            ),

            // ── Группа: В течение дня ──────────────────────────
            !isCurator && status?.subscribed && React.createElement('div', {
                className: 'profile-push-group'
            }, 'В течение дня'),
            !isCurator && status?.subscribed && Row(
                'Напоминание про воду',
                React.createElement(Toggle, {
                    value: prefs.water_hint_enabled !== false,
                    onChange: (v) => update({ water_hint_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Когда осталось 10% до нормы калорий',
                React.createElement(Toggle, {
                    value: prefs.cal_90_enabled !== false,
                    onChange: (v) => update({ cal_90_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Превышение нормы Б/Ж/У',
                React.createElement(Toggle, {
                    value: prefs.macro_over_enabled !== false,
                    onChange: (v) => update({ macro_over_enabled: v })
                })
            ),

            // ── Группа: Тренды ─────────────────────────────────
            !isCurator && status?.subscribed && React.createElement('div', {
                className: 'profile-push-group'
            }, 'Тренды'),
            !isCurator && status?.subscribed && Row(
                '3 дня переедания → разгрузка',
                React.createElement(Toggle, {
                    value: prefs.overeat_3d_enabled !== false,
                    onChange: (v) => update({ overeat_3d_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Поздний ужин (позже обычного)',
                React.createElement(Toggle, {
                    value: prefs.late_meal_enabled !== false,
                    onChange: (v) => update({ late_meal_enabled: v })
                })
            ),
            !isCurator && status?.subscribed && Row(
                'Мягкие алёрты по здоровью (EWS)',
                React.createElement(Toggle, {
                    value: prefs.ews_client_hint_enabled !== false,
                    onChange: (v) => update({ ews_client_hint_enabled: v })
                })
            ),

            // ── Quiet hours ────────────────────────────────────
            status?.subscribed && React.createElement('div', {
                className: 'profile-push-group'
            }, 'Тихие часы'),
            status?.subscribed && Row(
                'Тишина с',
                React.createElement(TimeInput, {
                    value: prefs.quiet_start,
                    onChange: (v) => update({ quiet_start: v })
                })
            ),
            status?.subscribed && Row(
                'до',
                React.createElement(TimeInput, {
                    value: prefs.quiet_end,
                    onChange: (v) => update({ quiet_end: v })
                })
            ),

            // Toast «✓ Сохранено» — мягкое подтверждение для тогглов
            savedHint && React.createElement('div', { className: 'profile-push-toast' }, savedHint),

            // Тестовая кнопка
            status?.subscribed && React.createElement('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e4e4e7' } },
                React.createElement('button', {
                    onClick: handleTest, disabled: busy,
                    className: 'profile-push-status__btn profile-push-status__btn--act'
                }, 'Отправить тестовый пуш'),
                testResult && React.createElement('div', { style: { marginTop: '8px', fontSize: '13px', color: '#3f3f46' } }, testResult)
            ),

            accessSignOpen && React.createElement('div', {
                style: {
                    position: 'fixed', inset: 0, zIndex: 12000,
                    background: 'rgba(0,0,0,0.45)', display: 'flex',
                    alignItems: 'flex-end', justifyContent: 'center'
                }
            },
                React.createElement('div', {
                    style: {
                        width: '100%', maxWidth: '480px', background: '#fff',
                        borderRadius: '16px 16px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))'
                    }
                },
                    React.createElement('div', { style: { fontSize: '18px', fontWeight: 600, marginBottom: '8px' } },
                        'Подпись согласия на push'),
                    React.createElement('div', { style: { fontSize: '14px', color: '#71717a', marginBottom: '12px' } },
                        'Введите код доступа из 4 цифр, чтобы подписать обновлённое согласие на уведомления.'),
                    pushPinKeypadKit
                        ? pushPinKeypadKit.renderPinKeypadSection({
                            pin: pushAccessPin,
                            keypadRef: pushAccessKeypadRef,
                            title: 'Код доступа',
                        })
                        : null,
                    accessSignError && React.createElement('div', {
                        style: { color: '#dc2626', fontSize: '13px', marginTop: '8px' }
                    }, accessSignError),
                    React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
                        React.createElement('button', {
                            type: 'button',
                            onClick: () => { setAccessSignOpen(false); setAccessSignError(''); },
                            style: { flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e4e4e7', background: '#fff' }
                        }, 'Отмена'),
                        React.createElement('button', {
                            type: 'button',
                            onClick: handlePushAccessCodeSign,
                            disabled: busy || !pushAccessPin.isComplete,
                            style: {
                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                                background: pushAccessPin.isComplete && !busy ? '#22c55e' : '#d4d4d8',
                                color: '#fff', fontWeight: 600
                            }
                        }, busy ? '…' : 'Подписать')
                    )
                )
            )
        );
    }

    // === Нормы (встроенный блок) ===
    function HEYS_NormsCard() {
        const U = HEYS.utils || {};
        const clamp = (v) => Math.max(0, Math.min(100, (U.toNum ? U.toNum(v) : Number(v) || 0)));
        // Используем глобальные lsGet/lsSet из начала модуля
        const [norms, setNorms] = React.useState(() => {
            const val = lsGet('heys_norms', {
                carbsPct: 0, proteinPct: 0, badFatPct: 0, superbadFatPct: 0, simpleCarbPct: 0, giPct: 0, harmPct: 0, fiberPct: 0
            });
            // Служебные поля для сравнения версий с облаком
            return { revision: 0, updatedAt: 0, ...val };
        });
        // Debounced сохранение норм (1000ms)
        const [normsSaved, setNormsSaved] = React.useState(false);
        const [normsPending, setNormsPending] = React.useState(false);
        const [lastEditedNorm, setLastEditedNorm] = React.useState(null);
        const normsInitRef = React.useRef(true);

        React.useEffect(() => {
            if (normsInitRef.current) {
                normsInitRef.current = false;
                return;
            }
            setNormsPending(true);
            setNormsSaved(false);
            const timer = setTimeout(() => {
                lsSet('heys_norms', { ...norms, updatedAt: Date.now() });
                setNormsPending(false);
                setNormsSaved(true);
                setTimeout(() => {
                    setNormsSaved(false);
                    setLastEditedNorm(null);
                }, 2000);
            }, 300);
            return () => clearTimeout(timer);
        }, [norms]);

        // Подписка на heys:norms-updated: внешний writer (wizard / cloud HOT-sync /
        // platform-apis import) меняет LS, рефрешим React state. Без этого 300мс
        // debounced auto-save затрёт внешние изменения старым стейтом.
        React.useEffect(() => {
            const handleNormsUpdate = () => {
                const incoming = lsGet('heys_norms', null);
                if (!incoming) return;
                setNorms(prev => {
                    const prevTs = (prev && prev.updatedAt) || 0;
                    const newTs = (incoming && incoming.updatedAt) || 0;
                    return prevTs > newTs ? prev : incoming;
                });
            };
            window.addEventListener('heys:norms-updated', handleNormsUpdate);
            return () => window.removeEventListener('heys:norms-updated', handleNormsUpdate);
        }, []);

        // Перезагрузка норм при смене клиента (как в данных дня)
        React.useEffect(() => {
            let cancelled = false;
            const clientId = window.HEYS && window.HEYS.currentClientId;
            const cloud = window.HEYS && window.HEYS.cloud;

            const reloadNorms = () => {
                if (cancelled) return;

                const newNorms = lsGet('heys_norms', {
                    carbsPct: 0, proteinPct: 0, badFatPct: 0, superbadFatPct: 0, simpleCarbPct: 0, giPct: 0, harmPct: 0, fiberPct: 0
                });
                newNorms.revision = newNorms.revision || 0;
                newNorms.updatedAt = newNorms.updatedAt || 0;

                // Умный reload: не перезаписываем если текущее состояние новее
                setNorms(prev => {
                    const prevUpdatedAt = prev.updatedAt || 0;
                    const newUpdatedAt = newNorms.updatedAt || 0;
                    if (prevUpdatedAt > newUpdatedAt) {
                        return prev; // Текущее состояние новее — не перезаписываем
                    }
                    return newNorms;
                });
            };

            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
                    cloud.bootstrapClientSync(clientId)
                        .then(() => {
                            setTimeout(reloadNorms, 150); // Как в данных дня
                        })
                        .catch((err) => {
                            console.warn('[HEYS] Norms sync failed, using local cache:', err?.message || err);
                            reloadNorms(); // Загружаем из localStorage при ошибке
                        });
                } else {
                    reloadNorms();
                }
            } else {
                reloadNorms();
            }

            return () => { cancelled = true; };
        }, [window.HEYS && window.HEYS.currentClientId]);

        const carb = clamp(norms.carbsPct);
        const prot = clamp(norms.proteinPct);
        const fatAuto = clamp(100 - carb - prot);

        const badF = clamp(norms.badFatPct);
        const superBadF = clamp(norms.superbadFatPct);
        const goodFAuto = clamp(100 - badF - superBadF);

        const simpleC = clamp(norms.simpleCarbPct);
        const complexCAuto = clamp(100 - simpleC);

        // Индикатор статуса для норм
        const NormFieldStatus = ({ fieldKey }) => {
            if (lastEditedNorm !== fieldKey) return null;
            if (normsPending) return profileHint('pending', 'Сохраняется...');
            if (normsSaved) return profileHint('saved', 'Сохранено');
            return null;
        };

        const update = (k, v) => {
            const clamped = clamp(v);
            setLastEditedNorm(k);
            setNormsPending(true);
            setNorms(prev => ({
                ...prev,
                [k]: clamped,
                revision: (prev.revision || 0) + 1,
                updatedAt: Date.now()
            }));
        };

        const overMacro = (carb + prot) > 100;
        const overFatSplit = (badF + superBadF) > 100;
        const overCarbSplit = simpleC > 100;

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('stats', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Нормы')
            ),
            React.createElement('div', { className: 'field-list' },
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Углеводы (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: carb, onChange: e => update('carbsPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'carbsPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Белки (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: prot, onChange: e => update('proteinPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'proteinPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Жиры (%) — авто = 100 − У − Б'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { className: 'readOnly', readOnly: true, value: fatAuto })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Вредные жиры (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: badF, onChange: e => update('badFatPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'badFatPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Супервредные жиры (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: superBadF, onChange: e => update('superbadFatPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'superbadFatPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Полезные жиры (%) — авто = 100 − вредные − супервредные'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { className: 'readOnly', readOnly: true, value: goodFAuto })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Простые углеводы (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: simpleC, onChange: e => update('simpleCarbPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'simpleCarbPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Сложные углеводы (%) — авто = 100 − простые'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { className: 'readOnly', readOnly: true, value: complexCAuto })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'ГИ (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: clamp(norms.giPct), onChange: e => update('giPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'giPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Вредность (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: clamp(norms.harmPct), onChange: e => update('harmPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'harmPct' })),
                React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Клетчатка (г/1000 ккал) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: clamp(norms.fiberPct), onChange: e => update('fiberPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'fiberPct' }))
            ),
            (overMacro || overFatSplit || overCarbSplit) ?
                React.createElement('div', { className: 'profile-message profile-message--err', style: { marginTop: '6px' } },
                    (overMacro ? 'Предупреждение: У% + Б% превышают 100. Жиры будут обнулены. ' : ''),
                    (overFatSplit ? 'Предупреждение: Вредные% + Супервредные% > 100. Полезные будут обнулены. ' : ''),
                    (overCarbSplit ? 'Предупреждение: Простые% > 100. Сложные будут обнулены.' : '')
                )
                : null,
            React.createElement('div', { className: 'muted', style: { marginTop: '6px' } },
                'Все значения сохраняются автоматически. Жиры считаются из 9 ккал/г, клетчатка — в граммах на 1000 ккал.'
            )
        );
    }

    // === МОИ СОГЛАСИЯ И ДАННЫЕ (152-ФЗ ст.14/21, GDPR Art.15-18) ===
    // Compliance overhaul 2026-05-20: страница для просмотра согласий, скачивания
    // proof-of-consent, DSAR-экспорта, restriction обработки, отзыва куратора.
    function MyConsentsAndDataCard() {
        const Consents = window.HEYS?.Consents;
        const [consentsList, setConsentsList] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        const [busy, setBusy] = React.useState(null);
        const [message, setMessage] = React.useState('');
        const [restrictionActive, setRestrictionActive] = React.useState(false);

        const refresh = React.useCallback(async function () {
            if (!Consents?.api?.getMyConsents) return;
            setLoading(true);
            const res = await Consents.api.getMyConsents();
            if (res.success) {
                // Группируем по типу — показываем только последнюю запись каждого типа
                const byType = {};
                (res.consents || []).forEach(function (c) {
                    if (!byType[c.type] || new Date(c.created_at) > new Date(byType[c.type].created_at)) {
                        byType[c.type] = c;
                    }
                });
                setConsentsList(Object.values(byType));
            }
            setLoading(false);
        }, [Consents]);

        React.useEffect(function () { refresh(); }, [refresh]);

        if (!Consents?.api?.getMyConsents) {
            return React.createElement('div', { className: 'muted' },
                'Модуль согласий не загружен');
        }

        const labels = Consents.TEXTS?.checkboxes || {};
        const versionLabels = (window.HEYS?.LegalVersions?.labels) || {};
        const REQUIRED = ['user_agreement', 'personal_data'];

        const handleRevoke = async function (consentType, isRequired) {
            const docName = versionLabels[consentType] || consentType;
            let msg;
            if (consentType === 'health_data') {
                msg = 'Отозвать согласие "' + docName + '"?\n\n' +
                      'После отзыва будут удалены данные, отнесённые к категории «здоровье» ' +
                      '(пульсовые зоны, анкета пробного периода при её наличии).\n\n' +
                      'Дневник питания, переписка и фото удаляются отдельно — ' +
                      'кнопкой отзыва согласия на персональные данные.\n\n' +
                      'Доступ к HEYS сохранится.';
            } else if (consentType === 'personal_data') {
                msg = 'Отозвать согласие "' + docName + '"?\n\n' +
                      'После отзыва будут удалены:\n' +
                      '• дневник питания и профиль\n' +
                      '• переписка с куратором и расшифровки голосовых\n' +
                      '• фото и голосовые (поставлены в очередь удаления)\n' +
                      '• локальные копии на этом устройстве\n\n' +
                      'Запись о факте согласия сохранится. Аккаунт останется, ' +
                      'но войти снова можно будет только после повторного согласия.';
            } else if (isRequired) {
                msg = 'Отозвать обязательное согласие "' + docName + '"?\n\n' +
                      'Это равнозначно удалению аккаунта — без этого согласия пользоваться сервисом нельзя.';
            } else {
                msg = 'Отозвать согласие "' + docName + '"?';
            }
            if (!window.confirm(msg)) return;

            setBusy(consentType);
            setMessage('');
            try {
                let res;
                if (consentType === 'health_data') {
                    res = await Consents.api.revokeHealthDataAndPurge();
                } else if (consentType === 'personal_data') {
                    res = await Consents.api.revokePersonalDataAndPurge();
                } else if (consentType === 'push_notifications' && HEYS.push?.setEnabled) {
                    const r = await HEYS.push.setEnabled(false);
                    res = { success: r?.ok !== false, error: r?.error || r?.reason };
                } else {
                    res = await Consents.api.revokeConsentBySession(consentType);
                }
                if (res?.success) {
                    let okMsg = '✅ Согласие отозвано';
                    if (consentType === 'personal_data') {
                        const queued = res.personal_data_purge?.queued_media;
                        okMsg = '✅ Согласие на персональные данные отозвано' +
                            (res.deleted_keys ? ' (записей: ' + res.deleted_keys + ')' : '') +
                            (queued ? ', фото в очереди удаления: ' + queued : '');
                    } else if (consentType === 'health_data' && res.deleted_keys) {
                        okMsg += ' (записей: ' + res.deleted_keys + ')';
                    }
                    setMessage(okMsg + '. Обновите страницу.');
                    await refresh();
                } else {
                    setMessage('❌ ' + (res?.error || 'Не удалось отозвать'));
                }
            } catch (e) {
                setMessage('❌ ' + e.message);
            } finally {
                setBusy(null);
            }
        };

        const handleDownloadProof = async function (consentType) {
            setBusy('proof_' + consentType);
            const r = await Consents.api.downloadConsentProofAsFile(consentType);
            setBusy(null);
            if (!r.success) setMessage('❌ ' + (r.error || 'Ошибка'));
        };

        const handleDownloadData = async function () {
            setBusy('dsar');
            setMessage('');
            const r = await Consents.api.downloadMyDataAsFile();
            setBusy(null);
            if (r.success) {
                setMessage('✅ Файл с вашими данными скачан');
            } else {
                setMessage('❌ ' + (r.error || 'Ошибка экспорта'));
            }
        };

        const handleRestriction = async function () {
            const next = !restrictionActive;
            const msg = next
                ? 'Запросить ограничение обработки данных?\n\n' +
                  'Пока ограничение активно, новые данные не будут записываться (дневник, веса, активность). ' +
                  'Существующие данные сохранятся. Куратор не сможет вносить изменения. ' +
                  'Можно отключить в любой момент.'
                : 'Возобновить обработку данных?';
            if (!window.confirm(msg)) return;
            setBusy('restriction');
            setMessage('');
            const r = await Consents.api.requestRestriction(next);
            setBusy(null);
            if (r?.success) {
                setRestrictionActive(next);
                setMessage(next ? '✅ Ограничение обработки активировано' : '✅ Обработка возобновлена');
            } else {
                setMessage('❌ ' + (r?.error || 'Не удалось'));
            }
        };

        const handleRevokeCurator = async function () {
            if (!window.confirm(
                'Убрать куратора?\n\n' +
                'Куратор больше не сможет видеть и редактировать ваш дневник. ' +
                'Сервис останется доступен в режиме self-service. ' +
                'Это действие можно отменить только обратившись в поддержку.'
            )) return;
            setBusy('curator');
            setMessage('');
            const r = await Consents.api.revokeCuratorAccess();
            setBusy(null);
            if (r?.success) {
                setMessage('✅ Куратор отключён');
            } else {
                setMessage('❌ ' + (r?.error || 'Не удалось'));
            }
        };

        const marketingConsent = consentsList.find(function (c) { return c.type === 'marketing'; });

        const handleToggleMarketing = async function () {
            const next = !(marketingConsent && marketingConsent.granted);
            setBusy('marketing');
            setMessage('');
            const r = await Consents.api.setMarketingConsent(next);
            setBusy(null);
            if (r?.success) { await refresh(); setMessage(next ? '✅ Подписаны на рассылку' : '✅ Отписаны от рассылки'); }
            else setMessage('❌ ' + (r?.error || 'Не удалось'));
        };

        const formatDate = function (iso) {
            if (!iso) return '—';
            try { return new Date(iso).toLocaleDateString('ru-RU'); } catch (e) { return iso; }
        };

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('document', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Мои согласия')
            ),
            React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                'Какие согласия я подписал, когда и какой версии. Здесь же — отзыв, экспорт данных и право на ограничение обработки (152-ФЗ ст.14/21).'),

            // ── Список согласий ─────────────────────────────────────────
            loading
                ? React.createElement('div', { className: 'profile-loading', style: { marginTop: 12 } }, 'Загрузка...')
                : (consentsList.length === 0
                    ? React.createElement('div', { className: 'muted', style: { marginTop: 12 } },
                        'Согласий пока нет. Они появятся после первого входа.')
                    : React.createElement('div', { style: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
                        consentsList.map(function (c) {
                            const isRequired = REQUIRED.indexOf(c.type) >= 0;
                            const label = versionLabels[c.type] || (labels[c.type]?.label) || c.type;
                            const statusText = c.granted ? 'Активно' : 'Отозвано';
                            return React.createElement('div', {
                                key: c.id,
                                className: 'profile-consent-row' + (c.granted ? ' is-granted' : '')
                            },
                                React.createElement('div', { style: { fontWeight: 500, fontSize: 14 } }, label),
                                React.createElement('div', { className: 'muted', style: { fontSize: 12, marginTop: 4 } },
                                    'Версия ', c.version || '—',
                                    ' • Подписано ', formatDate(c.created_at),
                                    ' • Способ: ', c.signature_method || 'checkbox',
                                    ' • ', React.createElement('span', {
                                        style: { fontWeight: 500, color: c.granted ? 'var(--v4-sand-ok-text, #5c6a45)' : undefined }
                                    }, statusText)),
                                React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } },
                                    React.createElement('button', {
                                        className: 'btn btn--secondary',
                                        disabled: busy === ('proof_' + c.type),
                                        onClick: function () { return handleDownloadProof(c.type); },
                                        style: { fontSize: 12, padding: '4px 10px' }
                                    }, busy === ('proof_' + c.type) ? 'Готовим…' : 'Скачать подтверждение'),
                                    c.granted && React.createElement('button', {
                                        className: 'btn' + (isRequired ? '' : ' btn--secondary'),
                                        disabled: busy === c.type,
                                        onClick: function () { return handleRevoke(c.type, isRequired); },
                                        style: {
                                            fontSize: 12, padding: '4px 10px',
                                            ...(isRequired ? {
                                                background: '#f7efe2',
                                                color: '#a1471c',
                                                border: '1px solid rgba(161, 71, 28, 0.22)'
                                            } : {})
                                        }
                                    }, busy === c.type ? 'Отзываю…' : ('Отозвать' + (c.type === 'user_agreement' ? ' (= удалить аккаунт)' : '')))
                                )
                            );
                        })
                    )),

            // ── Toggle: marketing ───────────────────────────────────────
            React.createElement('div', {
                style: { marginTop: 16, padding: '12px 0 0', borderTop: '1px solid rgba(138, 74, 32, 0.1)' }
            },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    React.createElement('div', null,
                        React.createElement('div', { style: { fontSize: 14, fontWeight: 500 } }, 'Маркетинговая рассылка'),
                        React.createElement('div', { className: 'muted', style: { fontSize: 12 } },
                            'Полезные советы и информация об акциях. Не чаще 1-2 раз в неделю.')),
                    React.createElement('label', { className: 'toggle-switch' },
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: !!(marketingConsent && marketingConsent.granted),
                            onChange: handleToggleMarketing,
                            disabled: busy === 'marketing'
                        }),
                        React.createElement('span', { className: 'toggle-slider' })
                    )
                )
            ),

            // ── Actions: DSAR / restriction / revoke curator ────────────
            React.createElement('div', {
                style: { marginTop: 16, padding: '12px 0 0', borderTop: '1px solid rgba(138, 74, 32, 0.1)', display: 'flex', flexDirection: 'column', gap: 8 }
            },
                React.createElement('button', {
                    className: 'btn btn--secondary btn--full',
                    onClick: handleDownloadData,
                    disabled: busy === 'dsar',
                    style: { justifyContent: 'center' }
                }, busy === 'dsar' ? 'Готовим…' : 'Скачать мои данные (DSAR, 152-ФЗ ст.14)'),
                React.createElement('button', {
                    className: 'btn btn--secondary btn--full',
                    onClick: handleRestriction,
                    disabled: busy === 'restriction',
                    style: { justifyContent: 'center' }
                }, busy === 'restriction' ? '…' : (restrictionActive ? 'Возобновить обработку' : 'Запросить ограничение обработки')),
                React.createElement('button', {
                    className: 'btn btn--secondary btn--full',
                    onClick: handleRevokeCurator,
                    disabled: busy === 'curator',
                    style: { justifyContent: 'center' }
                }, busy === 'curator' ? '…' : 'Убрать куратора (остаться в self-service)')
            ),

            message && React.createElement('div', {
                className: profileMessageClass(message),
                style: { marginTop: 10, fontSize: 13 }
            }, message)
        );
    }

    // === Приватность (152-ФЗ ст. 21) ===
    // Отзыв согласий и удаление аккаунта. health_data больше не обязателен.
    function PrivacySettingsCard() {
        const Consents = window.HEYS?.Consents;
        if (!Consents) return null;

        const [revokeBusy, setRevokeBusy] = React.useState(false);
        const [deleteStage, setDeleteStage] = React.useState('idle'); // idle → confirming → busy
        const [message, setMessage] = React.useState('');

        // Состояние push-разрешения. Если denied — показываем мини-инструкцию
        // как разблокировать в настройках браузера (юзер сам отказал или
        // нажал «Block» в нативном попапе).
        const [pushPermission, setPushPermission] = React.useState(() => {
            try { return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'; }
            catch (_) { return 'unsupported'; }
        });
        React.useEffect(function () {
            const tick = setInterval(function () {
                try {
                    const p = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
                    setPushPermission(function (prev) { return prev === p ? prev : p; });
                } catch (_) { /* noop */ }
            }, 5000);
            return function () { clearInterval(tick); };
        }, []);

        const handleRevokeHealth = async function () {
            const confirmed = window.confirm(
                'Отозвать согласие на обработку данных о здоровье?\n\n' +
                'После отзыва будут удалены данные, отнесённые к категории «здоровье» ' +
                '(пульсовые зоны, анкета пробного периода при её наличии).\n\n' +
                'Дневник питания, переписка и фото удаляются отдельно — ' +
                'кнопкой отзыва согласия на персональные данные.\n\n' +
                'Доступ к HEYS сохранится.'
            );
            if (!confirmed) return;
            setRevokeBusy(true);
            setMessage('');
            try {
                const res = await Consents.api.revokeHealthDataAndPurge();
                if (res.success) {
                    setMessage('✅ Согласие на данные о здоровье отозвано' +
                        (res.deleted_keys ? ' (записей: ' + res.deleted_keys + ')' : '') +
                        '. Перезагрузите страницу для применения изменений.');
                } else {
                    setMessage('❌ Ошибка: ' + (res.error || 'не удалось отозвать согласие'));
                }
            } catch (e) {
                setMessage('❌ Ошибка: ' + e.message);
            } finally {
                setRevokeBusy(false);
            }
        };

        const handleRevokePersonal = async function () {
            const confirmed = window.confirm(
                'Отозвать согласие на обработку персональных данных?\n\n' +
                'После отзыва будут удалены:\n' +
                '• дневник питания и профиль\n' +
                '• переписка с куратором и расшифровки голосовых\n' +
                '• фото и голосовые (поставлены в очередь удаления)\n' +
                '• локальные копии на этом устройстве\n\n' +
                'Запись о факте согласия сохранится. Аккаунт останется, ' +
                'но войти снова можно будет только после повторного согласия.'
            );
            if (!confirmed) return;
            setRevokeBusy(true);
            setMessage('');
            try {
                const res = await Consents.api.revokePersonalDataAndPurge();
                if (res.success) {
                    const queued = res.personal_data_purge?.queued_media;
                    setMessage('✅ Согласие на персональные данные отозвано' +
                        (res.deleted_keys ? ' (записей: ' + res.deleted_keys + ')' : '') +
                        (queued ? ', фото в очереди удаления: ' + queued : '') +
                        '. Перезагрузите страницу для применения изменений.');
                } else {
                    setMessage('❌ Ошибка: ' + (res.error || 'не удалось отозвать согласие'));
                }
            } catch (e) {
                setMessage('❌ Ошибка: ' + e.message);
            } finally {
                setRevokeBusy(false);
            }
        };

        const handleDeleteAccount = async function () {
            if (deleteStage === 'idle') {
                setDeleteStage('confirming');
                setMessage('');
                return;
            }
            if (deleteStage === 'confirming') {
                const typed = window.prompt(
                    'Это удалит ваш аккаунт и ВСЕ связанные данные навсегда.\n' +
                    'Действие необратимо.\n\n' +
                    'Для подтверждения введите слово: УДАЛИТЬ'
                );
                if ((typed || '').trim().toUpperCase() !== 'УДАЛИТЬ') {
                    setDeleteStage('idle');
                    setMessage('Удаление отменено.');
                    return;
                }
                setDeleteStage('busy');
                setMessage('');
                try {
                    const res = await Consents.deleteAccount();
                    if (res.success) {
                        setMessage('✅ Аккаунт удалён. Перенаправление...');
                        setTimeout(function () { window.location.href = '/'; }, 1200);
                    } else {
                        setDeleteStage('idle');
                        setMessage('❌ Ошибка: ' + (res.error || 'не удалось удалить аккаунт'));
                    }
                } catch (e) {
                    setDeleteStage('idle');
                    setMessage('❌ Ошибка: ' + e.message);
                }
                return;
            }
        };

        return React.createElement('div', { className: 'profile-field-group' },
            React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, profileSvg('shield', 16)),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Конфиденциальность')
            ),
            React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                'Управление согласиями на обработку персональных данных (152-ФЗ).'
            ),
            // Если пользователь заблокировал push в браузере — мини-инструкция
            // как разблокировать. Чтобы не «пропадать» из-за разового отказа.
            pushPermission === 'denied'
                ? React.createElement('div', { className: 'profile-message', style: { marginTop: '10px', lineHeight: '1.5' } },
                    React.createElement('div', { style: { fontWeight: 600, marginBottom: '4px' } },
                        'Уведомления отключены'),
                    React.createElement('div', null,
                        'Чтобы получать напоминания и сообщения куратора — разрешите уведомления ' +
                        'в настройках сайта (значок замка рядом с адресом → «Уведомления» → «Разрешить»).')
                )
                : null,
            React.createElement('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
                React.createElement('button', {
                    type: 'button',
                    onClick: handleRevokeHealth,
                    disabled: revokeBusy || deleteStage === 'busy',
                    style: {
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid #f59e0b',
                        background: '#fffbeb',
                        color: '#92400e',
                        cursor: revokeBusy ? 'wait' : 'pointer',
                        fontWeight: 500,
                        opacity: revokeBusy ? 0.7 : 1
                    }
                }, revokeBusy ? 'Отзываю...' : 'Отозвать согласие на данные о здоровье'),
                React.createElement('button', {
                    type: 'button',
                    onClick: handleRevokePersonal,
                    disabled: revokeBusy || deleteStage === 'busy',
                    style: {
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid #dc2626',
                        background: '#fef2f2',
                        color: '#991b1b',
                        cursor: revokeBusy ? 'wait' : 'pointer',
                        fontWeight: 500,
                        opacity: revokeBusy ? 0.7 : 1
                    }
                }, revokeBusy ? 'Отзываю...' : 'Отозвать согласие на персональные данные'),
                React.createElement('button', {
                    type: 'button',
                    onClick: handleDeleteAccount,
                    disabled: revokeBusy || deleteStage === 'busy',
                    style: {
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid #dc2626',
                        background: deleteStage === 'confirming' ? '#dc2626' : '#fef2f2',
                        color: deleteStage === 'confirming' ? '#fff' : '#991b1b',
                        cursor: deleteStage === 'busy' ? 'wait' : 'pointer',
                        fontWeight: 500,
                        opacity: deleteStage === 'busy' ? 0.7 : 1
                    }
                },
                    deleteStage === 'busy' ? 'Удаляю аккаунт...' :
                    deleteStage === 'confirming' ? 'Точно удалить? Нажмите ещё раз' :
                    'Удалить аккаунт'
                )
            ),
            message
                ? React.createElement('div', {
                    className: profileMessageClass(message),
                    style: { marginTop: '10px', fontSize: '13px', whiteSpace: 'pre-line' }
                }, message)
                : null
        );
    }

    function UserTab(props) {
        return React.createElement(UserTabBase, props);
    }

    HEYS.UserTab = UserTab;
    HEYS.UserTabImpl = HEYS.UserTabImpl || {};
    HEYS.UserTabImpl.createUserTab = function createUserTab() {
        if (!HEYS.UserTab._memoized && window.React?.memo) {
            const MemoTab = React.memo(HEYS.UserTab);
            MemoTab.displayName = 'UserTab';
            HEYS.UserTab._memoized = MemoTab;
        }
        return HEYS.UserTab._memoized || HEYS.UserTab;
    };
    HEYS.UserTabImpl.calcSleepNorm = calcSleepNorm;
    HEYS.UserTabImpl.calcAgeFromBirthDate = calcAgeFromBirthDate;

    // Экспорт функций для использования в других модулях
    HEYS.calcSleepNorm = calcSleepNorm;
    HEYS.calcAgeFromBirthDate = calcAgeFromBirthDate;

})(window);
