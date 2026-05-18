// heys_app_hooks_v1.js — App hooks extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
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

    const readStoredValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) {
                    return tryParseStoredValue(stored, fallback);
                }
            }
            if (U.lsGet) {
                const legacy = U.lsGet(key, fallback);
                if (legacy !== null && legacy !== undefined) return legacy;
            }
            const raw = localStorage.getItem(key);
            return tryParseStoredValue(raw, fallback);
        } catch {
            return fallback;
        }
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

    const writeStoredValue = (key, value) => {
        try {
            if (HEYS.store?.set) { HEYS.store.set(key, value); return; }
            const utils = HEYS.utils || {};
            if (utils.lsSet) { utils.lsSet(key, value); return; }
        } catch { }
    };

    const writeGlobalValue = (key, value) => {
        try {
            if (HEYS.store?.set) { HEYS.store.set(key, value); return; }
            const utils = HEYS.utils || {};
            if (utils.lsSet) { utils.lsSet(key, value); return; }
        } catch { }
    };

    const removeGlobalValue = (key) => {
        try {
            if (HEYS.store?.set) HEYS.store.set(key, null);
        } catch { }
        try { localStorage.removeItem(key); } catch { }
    };

    // NET Atwater migration: recompute kcal100 = 3×Б + 4×У + 9×Ж
    // Fixes product list saved with old protein×4 formula (v3.9.0 regression)
    const migrateProductsKcalNetAtwater = (list) => {
        if (!Array.isArray(list) || list.length === 0) return list;
        const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        const round1 = (v) => Math.round(v * 10) / 10;
        let changed = 0;
        const result = list.map((p) => {
            if (!p || p._kcalNetAtwater) return p;
            const carbs = p.carbs100 != null
                ? toNum(p.carbs100)
                : toNum(p.simple100) + toNum(p.complex100);
            const fat = p.fat100 != null
                ? toNum(p.fat100)
                : toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100);
            const newKcal = round1(3 * toNum(p.protein100) + 4 * carbs + 9 * fat);
            if (newKcal !== toNum(p.kcal100)) changed++;
            return { ...p, kcal100: newKcal, _kcalNetAtwater: true };
        });
        if (changed > 0) {
            console.info('[HEYS.migration] ✅ NET Atwater kcal migration:', { changed, total: list.length });
        }
        return result;
    };

    const getSystemTheme = () => {
        try {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch {
            return 'light';
        }
    };

    const THEME_PREF_KEY = 'heys_theme_pref';
    const THEME_EXPLICIT_KEY = 'heys_theme_explicit';
    const LEGACY_THEME_KEY = 'heys_theme';

    const isThemePreference = (value) => value === 'light' || value === 'dark' || value === 'auto';

    const isExplicitThemeFlag = (value) => (
        value === '1' || value === 1 || value === true || value === 'true'
    );

    const getStoredThemePreference = () => {
        let pref = null;
        let explicit = null;
        let legacyTheme = null;

        try {
            pref = tryParseStoredValue(localStorage.getItem(THEME_PREF_KEY), null);
            explicit = tryParseStoredValue(localStorage.getItem(THEME_EXPLICIT_KEY), null);
            legacyTheme = tryParseStoredValue(localStorage.getItem(LEGACY_THEME_KEY), null);
        } catch { }

        if (explicit === null || explicit === undefined) explicit = readGlobalValue(THEME_EXPLICIT_KEY, null);
        if (!isExplicitThemeFlag(explicit)) return 'light';

        if (pref === null || pref === undefined) pref = readGlobalValue(THEME_PREF_KEY, null);
        if (pref === 'dark' || pref === 'light') return pref;
        if (pref === 'auto') return 'light';

        if (legacyTheme === null || legacyTheme === undefined) legacyTheme = readGlobalValue(LEGACY_THEME_KEY, null);
        if (legacyTheme === 'light' || legacyTheme === 'dark') {
            return legacyTheme;
        }

        return 'light';
    };

    const normalizeThemePreference = (value) => {
        if (value === 'light' || value === 'dark') return value;
        if (value === 'auto') return 'light';
        return 'light';
    };

    function useThemePreference() {
        const React = window.React;
        const { useState, useEffect, useMemo, useCallback } = React;
        const [theme, setTheme] = useState(() => {
            try {
                return getStoredThemePreference();
            } catch {
                return 'light';
            }
        });

        const [systemTheme, setSystemTheme] = useState(getSystemTheme);

        useEffect(() => {
            let media;
            try {
                media = window.matchMedia('(prefers-color-scheme: dark)');
            } catch {
                return undefined;
            }

            const updateSystemTheme = (event) => {
                const nextMatches = typeof event?.matches === 'boolean' ? event.matches : media.matches;
                setSystemTheme(nextMatches ? 'dark' : 'light');
            };

            updateSystemTheme();

            if (typeof media.addEventListener === 'function') {
                media.addEventListener('change', updateSystemTheme);
                return () => media.removeEventListener('change', updateSystemTheme);
            }

            if (typeof media.addListener === 'function') {
                media.addListener(updateSystemTheme);
                return () => media.removeListener(updateSystemTheme);
            }

            return undefined;
        }, []);

        const resolvedTheme = useMemo(
            () => (theme === 'auto' ? systemTheme : normalizeThemePreference(theme)),
            [systemTheme, theme],
        );

        useEffect(() => {
            document.documentElement.setAttribute('data-theme', resolvedTheme);
            try {
                localStorage.setItem(THEME_PREF_KEY, theme);
                localStorage.setItem(THEME_EXPLICIT_KEY, theme === 'auto' ? '0' : '1');
                localStorage.setItem(LEGACY_THEME_KEY, resolvedTheme);
                writeGlobalValue(THEME_PREF_KEY, theme);
                writeGlobalValue(THEME_EXPLICIT_KEY, theme === 'auto' ? '0' : '1');
                writeGlobalValue(LEGACY_THEME_KEY, resolvedTheme);
            } catch { }
        }, [resolvedTheme, theme]);

        const cycleTheme = useCallback(() => {
            setTheme((prev) => {
                const currentResolvedTheme = prev === 'auto' ? systemTheme : normalizeThemePreference(prev);
                return currentResolvedTheme === 'dark' ? 'light' : 'dark';
            });
        }, [systemTheme]);

        return { theme, resolvedTheme, cycleTheme };
    }

    function usePwaPrompts() {
        const React = window.React;
        const { useState, useEffect, useMemo, useCallback } = React;
        const [pwaInstallPrompt, setPwaInstallPrompt] = useState(null);
        const [showPwaBanner, setShowPwaBanner] = useState(false);
        const [showIosPwaBanner, setShowIosPwaBanner] = useState(false);

        // Определяем iOS Safari
        const isIosSafari = useMemo(() => {
            const ua = navigator.userAgent || '';
            const isIos = /iPhone|iPad|iPod/.test(ua);
            const isWebkit = /WebKit/.test(ua);
            const isChrome = /CriOS/.test(ua);
            const isFirefox = /FxiOS/.test(ua);
            // iOS Safari = iOS + WebKit + не Chrome + не Firefox
            return isIos && isWebkit && !isChrome && !isFirefox;
        }, []);

        // Слушаем beforeinstallprompt событие (Android/Desktop)
        useEffect(() => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;
            if (isStandalone) return;

            const dismissed = readGlobalValue('heys_pwa_banner_dismissed', null);
            if (dismissed) {
                const dismissedTime = parseInt(dismissed, 10);
                if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) return;
            }

            if (isIosSafari) {
                setTimeout(() => setShowIosPwaBanner(true), 3000);
                return;
            }

            const handler = (e) => {
                e.preventDefault();
                setPwaInstallPrompt(e);
                setTimeout(() => setShowPwaBanner(true), 3000);
            };

            window.addEventListener('beforeinstallprompt', handler);
            return () => window.removeEventListener('beforeinstallprompt', handler);
        }, [isIosSafari]);

        const handlePwaInstall = useCallback(async () => {
            if (!pwaInstallPrompt) return;
            pwaInstallPrompt.prompt();
            const { outcome } = await pwaInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                setShowPwaBanner(false);
                writeGlobalValue('heys_pwa_installed', 'true');
            }
            setPwaInstallPrompt(null);
        }, [pwaInstallPrompt]);

        const dismissPwaBanner = useCallback(() => {
            setShowPwaBanner(false);
            writeGlobalValue('heys_pwa_banner_dismissed', Date.now().toString());
        }, []);

        const dismissIosPwaBanner = useCallback(() => {
            setShowIosPwaBanner(false);
            writeGlobalValue('heys_pwa_banner_dismissed', Date.now().toString());
        }, []);

        return { showPwaBanner, showIosPwaBanner, handlePwaInstall, dismissPwaBanner, dismissIosPwaBanner };
    }

    // === 📱 Screen Wake Lock API — предотвращение выключения экрана ===
    // Используется когда пользователь активно работает (таймер инсулиновой волны, готовка)
    function useWakeLock() {
        const React = window.React;
        const wakeLockRef = React.useRef(null);
        const [isWakeLockActive, setIsWakeLockActive] = React.useState(false);

        // Проверка поддержки
        const isSupported = React.useMemo(() => {
            return 'wakeLock' in navigator;
        }, []);

        // Запрос Wake Lock
        const requestWakeLock = React.useCallback(async () => {
            if (!isSupported) {
                console.warn('[WakeLock] Not supported in this browser');
                return false;
            }

            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                setIsWakeLockActive(true);
                console.log('[WakeLock] 🔆 Screen wake lock acquired');

                // Слушаем release (например, при сворачивании приложения)
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('[WakeLock] Wake lock released');
                    setIsWakeLockActive(false);
                });

                // Haptic feedback
                if (navigator.vibrate) navigator.vibrate(10);

                return true;
            } catch (err) {
                console.warn('[WakeLock] Failed to acquire:', err.message);
                setIsWakeLockActive(false);
                return false;
            }
        }, [isSupported]);

        // Освобождение Wake Lock
        const releaseWakeLock = React.useCallback(async () => {
            if (wakeLockRef.current) {
                try {
                    await wakeLockRef.current.release();
                    wakeLockRef.current = null;
                    setIsWakeLockActive(false);
                    console.log('[WakeLock] 🔅 Screen wake lock released manually');
                } catch (err) {
                    console.warn('[WakeLock] Failed to release:', err.message);
                }
            }
        }, []);

        // Автоматическое перезапрашивание при возвращении на вкладку
        React.useEffect(() => {
            if (!isSupported || !isWakeLockActive) return;

            const handleVisibilityChange = async () => {
                if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                    // Перезапрашиваем wake lock после возвращения на вкладку
                    await requestWakeLock();
                }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }, [isSupported, isWakeLockActive, requestWakeLock]);

        // Cleanup при unmount
        React.useEffect(() => {
            return () => {
                if (wakeLockRef.current) {
                    wakeLockRef.current.release().catch(() => { });
                }
            };
        }, []);

        return {
            isSupported,
            isWakeLockActive,
            requestWakeLock,
            releaseWakeLock
        };
    }

    const PENDING_SYNC_UI_QUEUE_KEY = 'heys_pending_sync_ui_queue';
    const MAX_PENDING_SYNC_UI_ITEMS = 5;
    const PENDING_SYNC_UI_TTL_MS = 3 * 24 * 60 * 60 * 1000;
    const PENDING_SYNC_UI_SKIPPED_SOURCES = new Set([
        'merge', 'cloud-sync', 'force-sync', 'cascade-guard-unlock', 'foreground-hot-sync',
        'cascade-batch'
    ]);

    const createEmptyPendingDetails = () => ({ days: 0, products: 0, profile: 0, other: 0 });

    const parsePendingActionDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parsed = new Date(`${dateStr}T12:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const extractPendingActionDate = (key) => {
        const safeKey = String(key || '');
        if (!safeKey) return '';
        if (safeKey.startsWith('day:')) return safeKey.slice(4);
        const match = safeKey.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    };

    const formatPendingActionScope = (dateStr) => {
        const parsed = parsePendingActionDate(dateStr);
        if (!parsed) return '';

        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        if (dateStr === todayKey) return 'Сегодня';
        if (dateStr === yesterdayKey) return 'Вчера';

        try {
            return new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'short',
            }).format(parsed).replace('.', '');
        } catch {
            return dateStr;
        }
    };

    const getPendingActionMeta = ({ key, type, field }) => {
        const normalizedKey = String(key || '').toLowerCase();
        const normalizedType = String(type || '').toLowerCase();
        const normalizedField = String(field || '').toLowerCase();
        const isDayKey = normalizedKey.includes('dayv2_') || normalizedKey.startsWith('day:');

        if (normalizedType === 'water' || normalizedField === 'waterml') {
            return { title: 'Вода', icon: '💧', id: 'water', kind: isDayKey ? 'day-specific' : 'generic' };
        }
        if (normalizedType === 'steps' || normalizedField === 'steps') {
            return { title: 'Шаги', icon: '👣', id: 'steps', kind: isDayKey ? 'day-specific' : 'generic' };
        }
        if (normalizedField === 'weightmorning') {
            return { title: 'Вес', icon: '⚖️', id: 'weightMorning', kind: 'day-specific' };
        }
        if (
            normalizedField === 'sleep'
            || normalizedField === 'sleepstart'
            || normalizedField === 'sleepend'
            || normalizedField === 'sleepquality'
            || normalizedField === 'daysleepminutes'
            || normalizedField === 'sleepnote'
        ) {
            return { title: 'Сон', icon: '😴', id: 'sleep', kind: 'day-specific' };
        }
        if (normalizedType === 'cycle' || normalizedField === 'cycleday') {
            return { title: 'Цикл', icon: '🌸', id: 'cycle', kind: 'day-specific' };
        }
        if (normalizedType === 'measurements' || normalizedField === 'measurements') {
            return { title: 'Замеры', icon: '📏', id: 'measurements', kind: 'day-specific' };
        }
        if (normalizedType === 'coldexposure' || normalizedField === 'coldexposure') {
            return { title: 'Холод', icon: '🧊', id: 'coldExposure', kind: 'day-specific' };
        }
        if (
            normalizedType === 'morningmood'
            || normalizedField === 'morningmood'
            || normalizedField === 'moodmorning'
            || normalizedField === 'wellbeingmorning'
            || normalizedField === 'stressmorning'
        ) {
            return { title: 'Утреннее состояние', icon: '🌅', id: 'morningMood', kind: 'day-specific' };
        }
        if (normalizedType === 'supplements' || normalizedField === 'supplementstaken' || normalizedField === 'supplements') {
            return { title: 'Добавки', icon: '💊', id: 'supplements', kind: isDayKey ? 'day-specific' : 'generic' };
        }
        if (normalizedField === 'supplementsplanned' || normalizedField === 'plannedsupplements') {
            return { title: 'План добавок', icon: '🗓️', id: 'supplementsPlanned', kind: isDayKey ? 'day-specific' : 'generic' };
        }
        if (normalizedField === 'supplementsettings') {
            return { title: 'Схема добавок', icon: '💊', id: 'supplementSettings', kind: 'generic' };
        }
        if (normalizedField === 'supplementhistory') {
            return { title: 'История добавок', icon: '📚', id: 'supplementHistory', kind: 'generic' };
        }
        if (normalizedType === 'training' || normalizedField === 'training' || normalizedField === 'trainings') {
            return { title: 'Тренировка', icon: '🏋️', id: 'training', kind: 'day-specific' };
        }
        if (normalizedField === 'deficitpct') {
            return { title: 'Дефицит', icon: '🎯', id: 'deficitPct', kind: 'day-specific' };
        }
        if (
            normalizedField === 'householdmin'
            || normalizedField === 'householdtime'
            || normalizedField === 'householdactivities'
        ) {
            return { title: 'Бытовая активность', icon: '🧹', id: 'household', kind: 'day-specific' };
        }
        if (normalizedType === 'meal') {
            return { title: 'Еда', icon: '🍽️', id: 'meal', kind: isDayKey ? 'day-specific' : 'generic' };
        }
        if (normalizedType === 'product' || normalizedKey.includes('products')) {
            return { title: 'Продукты', icon: '📦', id: 'products', kind: 'generic' };
        }
        if (normalizedType === 'profile' || normalizedKey.includes('profile')) {
            return { title: 'Профиль', icon: '👤', id: normalizedField || 'profile', kind: 'generic' };
        }
        if (normalizedKey.includes('norms')) {
            return { title: 'Нормы', icon: '📐', id: 'norms', kind: 'generic' };
        }
        if (normalizedKey.includes('hr_zones')) {
            return { title: 'Пульсовые зоны', icon: '❤️', id: 'hrZones', kind: 'generic' };
        }
        if (normalizedKey.includes('widget_layout')) {
            return { title: 'Виджеты', icon: '🧩', id: 'widgets', kind: 'generic' };
        }
        if (isDayKey) {
            return { title: 'Дневник дня', icon: '📅', id: 'dayJournal', kind: 'day-generic' };
        }

        return { title: 'Изменения', icon: '💾', id: 'changes', kind: 'generic' };
    };

    const trimPendingActionQueue = (items) => {
        const now = Date.now();
        const uniqueItems = [];
        const seen = new Set();

        (Array.isArray(items) ? items : []).forEach((item) => {
            if (!item || typeof item !== 'object' || !item.id) return;
            if (item.updatedAt && (now - item.updatedAt) > PENDING_SYNC_UI_TTL_MS) return;
            if (seen.has(item.id)) return;
            seen.add(item.id);
            uniqueItems.push(item);
        });

        return uniqueItems.slice(0, MAX_PENDING_SYNC_UI_ITEMS);
    };

    const readPendingActionQueue = () => {
        try {
            const raw = localStorage.getItem(PENDING_SYNC_UI_QUEUE_KEY);
            if (!raw) return [];
            return trimPendingActionQueue(JSON.parse(raw));
        } catch {
            return [];
        }
    };

    const persistPendingActionQueue = (items) => {
        try {
            const safeItems = trimPendingActionQueue(items);
            if (!safeItems.length) {
                localStorage.removeItem(PENDING_SYNC_UI_QUEUE_KEY);
                return;
            }
            localStorage.setItem(PENDING_SYNC_UI_QUEUE_KEY, JSON.stringify(safeItems));
        } catch { }
    };

    const buildFallbackPendingActionQueue = (details) => {
        const safeDetails = details || createEmptyPendingDetails();
        const timestamp = Date.now();
        const items = [];

        if (safeDetails.days > 0) {
            items.push({
                id: 'fallback:days',
                title: safeDetails.days > 1 ? `Дневник дня ×${safeDetails.days}` : 'Дневник дня',
                icon: '📅',
                scopeLabel: '',
                updatedAt: timestamp,
                kind: 'fallback',
            });
        }
        if (safeDetails.products > 0) {
            items.push({
                id: 'fallback:products',
                title: safeDetails.products > 1 ? `Продукты ×${safeDetails.products}` : 'Продукты',
                icon: '📦',
                scopeLabel: '',
                updatedAt: timestamp,
                kind: 'fallback',
            });
        }
        if (safeDetails.profile > 0) {
            items.push({
                id: 'fallback:profile',
                title: safeDetails.profile > 1 ? `Профиль ×${safeDetails.profile}` : 'Профиль',
                icon: '👤',
                scopeLabel: '',
                updatedAt: timestamp,
                kind: 'fallback',
            });
        }
        if (safeDetails.other > 0) {
            items.push({
                id: 'fallback:other',
                title: safeDetails.other > 1 ? `Прочее ×${safeDetails.other}` : 'Прочее',
                icon: '💾',
                scopeLabel: '',
                updatedAt: timestamp,
                kind: 'fallback',
            });
        }

        return items.slice(0, MAX_PENDING_SYNC_UI_ITEMS);
    };

    const normalizePendingActionDescriptor = (detail) => {
        const safeDetail = detail && typeof detail === 'object' ? detail : null;
        if (!safeDetail) return null;

        const source = String(safeDetail.source || '').trim();
        if (safeDetail.batch || PENDING_SYNC_UI_SKIPPED_SOURCES.has(source) || source.startsWith('cloud')) {
            return null;
        }

        const key = String(safeDetail.baseKey || safeDetail.key || '');
        const date = String(safeDetail.date || safeDetail.dateKey || extractPendingActionDate(key) || '');
        const meta = getPendingActionMeta({
            key,
            type: safeDetail.type,
            field: safeDetail.field,
        });

        const itemId = date ? `${date}:${meta.id}` : meta.id;
        return {
            id: itemId,
            title: meta.title,
            icon: meta.icon,
            scopeLabel: date ? formatPendingActionScope(date) : '',
            updatedAt: Date.now(),
            key,
            type: String(safeDetail.type || ''),
            field: String(safeDetail.field || ''),
            source,
            date,
            kind: meta.kind,
        };
    };

    const mergePendingActionQueue = (currentItems, detail) => {
        const nextItem = normalizePendingActionDescriptor(detail);
        if (!nextItem) return trimPendingActionQueue(currentItems);

        const safeItems = trimPendingActionQueue(currentItems);
        if (nextItem.kind === 'day-generic' && nextItem.date) {
            const hasSpecificActionForDay = safeItems.some((item) => item.date === nextItem.date && item.kind === 'day-specific');
            if (hasSpecificActionForDay) return safeItems;
        }

        const nextQueue = safeItems.filter((item) => {
            if (!item || item.id === nextItem.id) return false;
            if (nextItem.kind === 'day-specific' && nextItem.date && item.date === nextItem.date && item.kind === 'day-generic') {
                return false;
            }
            return true;
        });

        nextQueue.unshift(nextItem);
        return trimPendingActionQueue(nextQueue);
    };

    /** PIN + API proxy: later full-screen lock and "slow internet" hint (extra hop, dev-friendly).
     *
     * 🔧 (2026-05-18): bumped thresholds. 3с было слишком агрессивно для фоновых
     * sync-тиков (live-refresh polling каждые 30с делает merge → upload даже на
     * чистом скролле без правок). Модалка всплывала при базовом скроллинге,
     * блокируя UI на секунду. 6с даёт обычному upload (<2с на хорошей сети)
     * комфортный запас, а реально зависшие save'ы всё равно ловятся. */
    const getPinProxySyncOverlayDelaysMs = () => {
        const DEFAULT_LOCK_MS = 6000;   // было 3000
        const DEFAULT_HINT_MS = 8000;   // было 5000 — поднял пропорционально
        const PIN_PROXY_LOCK_MS = 7500; // было 4500
        const PIN_PROXY_HINT_MS = 12000; // было 10000
        try {
            const cloud = HEYS.cloud;
            if (cloud?.isPinAuthClient?.() === true && cloud?.isUsingDirectConnection?.() === false) {
                return { longSyncLockMs: PIN_PROXY_LOCK_MS, slowInternetHintMs: PIN_PROXY_HINT_MS };
            }
        } catch (_) { /* noop */ }
        return { longSyncLockMs: DEFAULT_LOCK_MS, slowInternetHintMs: DEFAULT_HINT_MS };
    };

    function useCloudSyncStatus() {
        const React = window.React;
        const { useState, useRef, useCallback, useEffect } = React;
        const [cloudStatus, setCloudStatus] = useState(() => navigator.onLine ? 'idle' : 'offline');
        const [pendingCount, setPendingCount] = useState(0);
        const [pendingDetails, setPendingDetails] = useState(createEmptyPendingDetails);
        const [pendingActionItems, setPendingActionItems] = useState(() => {
            // 🛡️ Проверяем runtime-состояние ДО чтения localStorage. Если в runtime
            // ничего не ждёт отправки и upload не идёт — сразу чистим persisted
            // очередь, чтобы фантомные записи прошлой сессии не вводили в заблуждение.
            try {
                const runtimePendingCount = window.HEYS?.cloud?.getPendingCount?.() || 0;
                const runtimePendingDetails = window.HEYS?.cloud?.getPendingDetails?.() || createEmptyPendingDetails();
                const uploadInProgress = !!window.HEYS?.cloud?.isUploadInProgress?.();
                const onLine = typeof navigator !== 'undefined' ? !!navigator.onLine : true;

                if (runtimePendingCount > 0) {
                    const persistedItems = readPendingActionQueue();
                    if (persistedItems.length > 0) return persistedItems;
                    return buildFallbackPendingActionQueue(runtimePendingDetails);
                }

                if (onLine && !uploadInProgress) {
                    // Реально ничего не ждёт — выкидываем застрявший persisted state
                    try { localStorage.removeItem(PENDING_SYNC_UI_QUEUE_KEY); } catch { }
                    return [];
                }

                return readPendingActionQueue();
            } catch {
                return readPendingActionQueue();
            }
        });
        const [showOfflineBanner, setShowOfflineBanner] = useState(false);
        const [showOnlineBanner, setShowOnlineBanner] = useState(false);
        const [showSyncLockOverlay, setShowSyncLockOverlay] = useState(false);
        const [showSlowInternetHint, setShowSlowInternetHint] = useState(false);
        const [showPendingSyncBanner, setShowPendingSyncBanner] = useState(false);
        const [syncProgress, setSyncProgress] = useState({ synced: 0, total: 0 });
        const [retryCountdown, setRetryCountdown] = useState(0);
        // 🆕 Время офлайн для улучшенного UX
        const [offlineDuration, setOfflineDuration] = useState(0);
        const offlineStartRef = useRef(null);
        const offlineDurationIntervalRef = useRef(null);
        const syncLockTimeoutRef = useRef(null);
        const slowInternetHintTimeoutRef = useRef(null);
        const longSyncFallbackTimeoutRef = useRef(null);
        const longSyncFallbackActiveRef = useRef(false);
        const syncLockShownForCurrentSyncRef = useRef(false);
        const slowInternetShownForCurrentSyncRef = useRef(false);

        const cloudSyncTimeoutRef = useRef(null);
        const queueDrainedFallbackRef = useRef(null);
        const pendingChangesRef = useRef(false);
        const syncingStartRef = useRef(null);
        const syncedTimeoutRef = useRef(null);
        const syncingDelayTimeoutRef = useRef(null);
        const initialCheckDoneRef = useRef(false);
        const retryIntervalRef = useRef(null);
        // � Debounce для auth_required toast
        const authErrorShownRef = useRef(false);
        const authErrorTimeoutRef = useRef(null);
        /** Схлопывание парного heysSyncCompleted + heys:data-uploaded в один проход UI */
        const syncCompleteDedupeAtRef = useRef(0);
        // �🔒 Cooldown после первого sync — не показываем "syncing" сразу после загрузки
        /** Давит спам [IND] data-saved: skip при одном и том же reason+key (dayv2 во время sync). */
        const indDataSavedSkipLogRef = useRef({ sig: '', at: 0 });
        /** Давит спам [IND] pending-change при одинаковом снимке очереди (notifyPendingChange дёргается пачкой). */
        const indPendingChangeLogRef = useRef({ sig: '', at: 0 });
        /** rAF-схлопывание pending-change → меньше синхронных setState под пачку enqueue */
        const pendingChangeRafRef = useRef(null);
        /** rAF-схлопывание тяжёлого UI-пути data-saved (startSyncingState + таймеры) */
        const dataSavedUiRafRef = useRef(null);
        /** Дедupe sync-progress: одинаковые (completed,total) подряд гоняют React и логи */
        const syncProgressDedupeRef = useRef({ completed: -1, total: -1, at: 0 });
        const initialSyncCompletedAtRef = useRef(0);
        const INITIAL_SYNC_COOLDOWN_MS = 3000; // 3 секунды после первого sync не показываем syncing
        // 🔕 Timestamp когда последний раз индикатор ушёл в idle (пост-синк cooldown)
        const lastIdleAtRef = useRef(0);
        // Refs для state-значений, читаемых из event handlers — стабилизирует deps эффекта
        const cloudStatusRef = useRef(cloudStatus);
        const pendingCountRef = useRef(pendingCount);
        const pendingActionItemsRef = useRef(pendingActionItems);
        const syncProgressTotalRef = useRef(0);
        /** Снимок UI синка для tick (async — state из замыкания устаревает) */
        const showSyncLockOverlayRef = useRef(false);
        const showSlowInternetHintRef = useRef(false);
        const showPendingSyncBannerRef = useRef(false);
        const indSyncModalHeartbeatRef = useRef(0);
        const prevSyncLockOverlayRef = useRef(false);
        const prevCloudStatusSampleRef = useRef(cloudStatus);
        cloudStatusRef.current = cloudStatus;
        pendingCountRef.current = pendingCount;
        pendingActionItemsRef.current = pendingActionItems;
        syncProgressTotalRef.current = syncProgress.total;
        showSyncLockOverlayRef.current = showSyncLockOverlay;
        showSlowInternetHintRef.current = showSlowInternetHint;
        showPendingSyncBannerRef.current = showPendingSyncBanner;

        const MIN_SYNCING_DURATION = 1500;
        const SYNCING_DELAY = 400;
        const NON_BLOCKING_SYNC_DELAY = 15000;
        const SYNC_STATUS_POLL_ACTIVE_MS = 1200;
        const SYNC_STATUS_POLL_IDLE_MS = 2200;
        const SYNC_STATUS_POLL_HIDDEN_MS = 4000;
        const SYNC_STATUS_DETAILS_REFRESH_EVERY = 3;
        const isIndDebugEnabled = () => {
            try {
                return global.localStorage?.getItem('heys_debug_sync') === 'true'
                    || global.localStorage?.getItem('heys_debug_ind') === 'true';
            } catch (_) {
                return false;
            }
        };
        const indLog = (...args) => {
            if (!isIndDebugEnabled()) return;
            try { console.info(...args); } catch (_) { /* noop */ }
        };

        // 🔍 Маркер монтирования — только при реальном mount, не на каждом рендере
        useEffect(() => {
            indLog('[HEYS.sync] [IND] useCloudSyncStatus MOUNTED (bundle c4bd)');
            return () => {
                indLog('[HEYS.sync] [IND] useCloudSyncStatus UNMOUNTED');
            };
        }, []);

        // Sampled perf: sync badge state transitions (localStorage heys_perf_smoothness_sample = "1")
        useEffect(() => {
            try {
                if (prevCloudStatusSampleRef.current === cloudStatus) return;
                prevCloudStatusSampleRef.current = cloudStatus;
                if (typeof global.localStorage === 'undefined' || global.localStorage.getItem('heys_perf_smoothness_sample') !== '1') return;
                const bump = global.HEYS?.debug?.bumpSmoothnessCounter;
                if (typeof bump !== 'function') return;
                bump('sync_ui_transition');
                bump('sync_ui_to_' + String(cloudStatus || 'unknown').replace(/[^a-z0-9_]/gi, '_').slice(0, 24));
            } catch (_) { /* noop */ }
        }, [cloudStatus]);

        useEffect(() => {
            if (showSyncLockOverlay && !prevSyncLockOverlayRef.current) {
                let rp = 0;
                let up = false;
                let cid = '';
                let snapStr = '';
                let detStr = '';
                try {
                    rp = window.HEYS?.cloud?.getPendingCount?.() || 0;
                    up = !!window.HEYS?.cloud?.isUploadInProgress?.();
                    cid = (window.HEYS?.cloud?.getCurrentClientId?.() || '').slice(0, 8);
                    const snap = window.HEYS?.cloud?.getPendingQueuesSnapshot?.();
                    if (snap) {
                        snapStr = ' clientQ=' + snap.clientQueueLen + '+' + snap.clientInFlightLen
                            + ' userQ=' + snap.userQueueLen + '+' + snap.userInFlightLen
                            + ' uploadIP=' + !!snap.uploadInProgress;
                    }
                    const det = window.HEYS?.cloud?.getPendingDetails?.();
                    if (det && typeof det === 'object') {
                        detStr = ' breakdown day=' + det.days + ' prod=' + det.products + ' prof=' + det.profile + ' other=' + det.other;
                    }
                } catch (_) { /* noop */ }
                const hint = !cid ? ' | БЕЗ client: user-queue не уйдёт в RPC до выбора клиента (heys_client_current)' : '';
                indLog('[HEYS.sync] [IND] sync-lock-overlay: OPEN status=' + cloudStatusRef.current + ' pending=' + rp + ' upload=' + up + ' client~=' + (cid || '(none)') + snapStr + detStr + hint);
                try {
                    if (typeof global.localStorage !== 'undefined' && global.localStorage.getItem('heys_perf_smoothness_sample') === '1' && typeof global.HEYS?.debug?.bumpSmoothnessCounter === 'function') {
                        global.HEYS.debug.bumpSmoothnessCounter('sync_lock_overlay_open');
                    }
                } catch (_) { /* noop */ }
            }
            if (!showSyncLockOverlay && prevSyncLockOverlayRef.current) {
                indLog('[HEYS.sync] [IND] sync-lock-overlay: CLOSE');
                try {
                    if (typeof global.localStorage !== 'undefined' && global.localStorage.getItem('heys_perf_smoothness_sample') === '1' && typeof global.HEYS?.debug?.bumpSmoothnessCounter === 'function') {
                        global.HEYS.debug.bumpSmoothnessCounter('sync_lock_overlay_close');
                    }
                } catch (_) { /* noop */ }
                indSyncModalHeartbeatRef.current = 0;
            }
            prevSyncLockOverlayRef.current = showSyncLockOverlay;
        }, [showSyncLockOverlay]);

        const getRuntimePendingCount = useCallback(() => {
            try {
                return window.HEYS?.cloud?.getPendingCount?.() || 0;
            } catch (e) {
                return 0;
            }
        }, []);

        const getRuntimePendingDetails = useCallback(() => {
            try {
                return window.HEYS?.cloud?.getPendingDetails?.() || { days: 0, products: 0, profile: 0, other: 0 };
            } catch (e) {
                return { days: 0, products: 0, profile: 0, other: 0 };
            }
        }, []);

        const isRuntimeUploadInProgress = useCallback(() => {
            try {
                return !!window.HEYS?.cloud?.isUploadInProgress?.();
            } catch (e) {
                return false;
            }
        }, []);

        /** User-queue ждёт RPC, но нет heys_client_current — syncProgress «висячий» не должен включать lock/syncing */
        const isUserQueueBlockedWithoutClient = () => {
            try {
                const cid = window.HEYS?.cloud?.getCurrentClientId?.();
                if (cid) return false;
                const snap = window.HEYS?.cloud?.getPendingQueuesSnapshot?.();
                if (!snap) return false;
                const userQ = (snap.userQueueLen || 0) + (snap.userInFlightLen || 0);
                const clientQ = (snap.clientQueueLen || 0) + (snap.clientInFlightLen || 0);
                return userQ > 0 && clientQ === 0 && !snap.uploadInProgress;
            } catch (_) {
                return false;
            }
        };

        const commitPendingActionItems = useCallback((items) => {
            const safeItems = trimPendingActionQueue(items);
            pendingActionItemsRef.current = safeItems;
            persistPendingActionQueue(safeItems);
            setPendingActionItems(safeItems);
        }, []);

        const pushPendingActionItem = useCallback((detail) => {
            // 🛡️ Race-condition guard: не добавляем UI-плашку, если runtime-очередь пуста
            // и upload не идёт — это значит данные уже синхронизированы (типично для
            // PIN/RPC режима, где запись в облако завершается мгновенно). Иначе фантомные
            // записи накапливаются в localStorage и показывают "Локальные изменения ждут
            // отправки" даже когда всё успешно синхронизировано.
            try {
                const runtimePending = (typeof window !== 'undefined' && window.HEYS?.cloud?.getPendingCount)
                    ? (window.HEYS.cloud.getPendingCount() || 0)
                    : 0;
                const uploadInProgress = (typeof window !== 'undefined' && window.HEYS?.cloud?.isUploadInProgress)
                    ? !!window.HEYS.cloud.isUploadInProgress()
                    : false;
                const onLine = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
                if (onLine && runtimePending === 0 && !uploadInProgress) {
                    return;
                }
            } catch { /* noop — на ошибках всё равно пушим */ }
            commitPendingActionItems(mergePendingActionQueue(pendingActionItemsRef.current, detail));
        }, [commitPendingActionItems]);

        const clearPendingActionItems = useCallback(() => {
            commitPendingActionItems([]);
        }, [commitPendingActionItems]);

        const ensureFallbackPendingActionItems = useCallback((details) => {
            if (pendingActionItemsRef.current.length > 0) return;
            const fallbackItems = buildFallbackPendingActionQueue(details);
            if (!fallbackItems.length) return;
            commitPendingActionItems(fallbackItems);
        }, [commitPendingActionItems]);

        const clearSyncLockOverlay = useCallback(() => {
            if (syncLockTimeoutRef.current) {
                clearTimeout(syncLockTimeoutRef.current);
                syncLockTimeoutRef.current = null;
            }
            setShowSyncLockOverlay(false);
        }, []);

        const clearSlowInternetHint = useCallback(() => {
            if (slowInternetHintTimeoutRef.current) {
                clearTimeout(slowInternetHintTimeoutRef.current);
                slowInternetHintTimeoutRef.current = null;
            }
            setShowSlowInternetHint(false);
        }, []);

        const ensureSyncingStart = useCallback(() => {
            if (!syncingStartRef.current) {
                syncingStartRef.current = Date.now();
            }
            return syncingStartRef.current;
        }, []);

        const resetLongSyncFallback = useCallback(() => {
            if (longSyncFallbackTimeoutRef.current) {
                clearTimeout(longSyncFallbackTimeoutRef.current);
                longSyncFallbackTimeoutRef.current = null;
            }
            longSyncFallbackActiveRef.current = false;
            setShowPendingSyncBanner(false);
        }, []);

        const enterBackgroundPendingSync = useCallback(() => {
            longSyncFallbackActiveRef.current = true;
            clearSyncLockOverlay();
            clearSlowInternetHint();
            setShowPendingSyncBanner(true);
            if (navigator.onLine) {
                setCloudStatus('queued');
            }
        }, [clearSlowInternetHint, clearSyncLockOverlay]);

        const armSyncLockOverlay = useCallback(() => {
            if (syncLockTimeoutRef.current || showSyncLockOverlay) return;

            syncLockTimeoutRef.current = setTimeout(() => {
                syncLockTimeoutRef.current = null;

                if (!navigator.onLine) return;

                const uploadInProgress = isRuntimeUploadInProgress();
                const deadlock = isUserQueueBlockedWithoutClient();
                const runtimePending = getRuntimePendingCount();
                const syncActive = cloudStatusRef.current === 'syncing'
                    || uploadInProgress
                    || (syncProgressTotalRef.current > 0 && !deadlock);

                if (syncingStartRef.current && syncActive && (uploadInProgress || runtimePending > 0)) {
                    syncLockShownForCurrentSyncRef.current = true;
                    setShowSyncLockOverlay(true);
                }
            }, getPinProxySyncOverlayDelaysMs().longSyncLockMs);
        }, [getRuntimePendingCount, isRuntimeUploadInProgress, showSyncLockOverlay]);

        const armSlowInternetHint = useCallback(() => {
            if (slowInternetHintTimeoutRef.current || showSlowInternetHint) return;

            const elapsed = syncingStartRef.current ? Date.now() - syncingStartRef.current : 0;
            const { slowInternetHintMs } = getPinProxySyncOverlayDelaysMs();
            const remaining = Math.max(0, slowInternetHintMs - elapsed);

            slowInternetHintTimeoutRef.current = setTimeout(() => {
                slowInternetHintTimeoutRef.current = null;

                if (!navigator.onLine) return;

                const uploadInProgress = isRuntimeUploadInProgress();
                const deadlock = isUserQueueBlockedWithoutClient();
                const syncActive = cloudStatusRef.current === 'syncing'
                    || uploadInProgress
                    || (syncProgressTotalRef.current > 0 && !deadlock);

                if (syncingStartRef.current && syncActive) {
                    slowInternetShownForCurrentSyncRef.current = true;
                    setShowSlowInternetHint(true);
                }
            }, remaining);
        }, [isRuntimeUploadInProgress, showSlowInternetHint]);

        const armLongSyncFallback = useCallback(() => {
            if (longSyncFallbackTimeoutRef.current || longSyncFallbackActiveRef.current) return;

            const elapsed = syncingStartRef.current ? Date.now() - syncingStartRef.current : 0;
            const remaining = Math.max(0, NON_BLOCKING_SYNC_DELAY - elapsed);

            longSyncFallbackTimeoutRef.current = setTimeout(() => {
                longSyncFallbackTimeoutRef.current = null;

                if (!navigator.onLine) return;

                const runtimePending = getRuntimePendingCount();
                const uploadInProgress = isRuntimeUploadInProgress();
                const deadlock = isUserQueueBlockedWithoutClient();
                const syncActive = cloudStatusRef.current === 'syncing'
                    || uploadInProgress
                    || (syncProgressTotalRef.current > 0 && !deadlock)
                    || (runtimePending > 0 && !deadlock);

                if (syncingStartRef.current && syncActive) {
                    enterBackgroundPendingSync();
                }
            }, remaining);
        }, [enterBackgroundPendingSync, getRuntimePendingCount, isRuntimeUploadInProgress]);

        const startSyncingState = useCallback(() => {
            if (!navigator.onLine) {
                setCloudStatus('offline');
                return;
            }

            if (longSyncFallbackActiveRef.current) {
                setShowPendingSyncBanner(true);
                setCloudStatus('queued');
                return;
            }

            indLog('[HEYS.sync] [IND] startSyncingState called, current=' + cloudStatusRef.current + ' syncingStart=' + !!syncingStartRef.current);

            if (!syncingStartRef.current) {
                syncLockShownForCurrentSyncRef.current = false;
                slowInternetShownForCurrentSyncRef.current = false;
                ensureSyncingStart();
                armSyncLockOverlay();
                armSlowInternetHint();
                armLongSyncFallback();
            }

            if (syncedTimeoutRef.current) {
                clearTimeout(syncedTimeoutRef.current);
                syncedTimeoutRef.current = null;
            }

            // FIX: сбрасываем 2s idle-timeout (cloudSyncTimeoutRef) — иначе он сработает
            // в середине нового синка и поставит status='idle', создавая idle→syncing→idle цикл.
            if (cloudSyncTimeoutRef.current) {
                indLog('[HEYS.sync] [IND] startSyncingState: cleared cloudSyncTimeout (prevents idle during re-sync)');
                clearTimeout(cloudSyncTimeoutRef.current);
                cloudSyncTimeoutRef.current = null;
            }

            if (!syncingDelayTimeoutRef.current) {
                syncingDelayTimeoutRef.current = setTimeout(() => {
                    syncingDelayTimeoutRef.current = null;
                    if (syncingStartRef.current && !syncedTimeoutRef.current) {
                        if (isUserQueueBlockedWithoutClient()) {
                            const snap = window.HEYS?.cloud?.getPendingQueuesSnapshot?.();
                            const uq = snap ? ((snap.userQueueLen || 0) + (snap.userInFlightLen || 0)) : 0;
                            indLog('[HEYS.sync] [IND] syncing-delay: остаёмся queued (нет heys_client_current, только user-queue pending=' + uq + ') — полноэкранный «синк» не показываем');
                            setCloudStatus('queued');
                            return;
                        }
                        setCloudStatus('syncing');
                    }
                }, SYNCING_DELAY);
            }
        }, [armLongSyncFallback, armSlowInternetHint, armSyncLockOverlay, ensureSyncingStart]);

        const showSyncedWithMinDuration = useCallback(() => {
            if (syncedTimeoutRef.current) return;

            clearSyncLockOverlay();
            clearSlowInternetHint();

            const elapsed = syncingStartRef.current ? Date.now() - syncingStartRef.current : 0;
            const remaining = Math.max(0, MIN_SYNCING_DURATION - elapsed);

            syncedTimeoutRef.current = setTimeout(() => {
                const runtimePending = getRuntimePendingCount();
                const uploadInProgress = isRuntimeUploadInProgress();

                syncedTimeoutRef.current = null;

                if (!navigator.onLine) {
                    syncingStartRef.current = null;
                    setCloudStatus('offline');
                    return;
                }

                if (uploadInProgress) {
                    startSyncingState();
                    return;
                }

                if (runtimePending > 0) {
                    syncingStartRef.current = null;
                    setCloudStatus('queued');
                    return;
                }

                resetLongSyncFallback();
                clearPendingActionItems();
                syncingStartRef.current = null;
                setCloudStatus('synced');
                // Звук синхронизации убран — теперь звуки только в геймификации
                setSyncProgress({ synced: 0, total: 0 });
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                cloudSyncTimeoutRef.current = setTimeout(() => {
                    const runtimePending = getRuntimePendingCount();
                    const uploadInProgress = isRuntimeUploadInProgress();
                    indLog('[HEYS.sync] [IND] cloudSyncTimeout fired → idle (pendingChanges=' + pendingChangesRef.current + ' runtimePending=' + runtimePending + ' uploadInProgress=' + uploadInProgress + ')');
                    if (pendingChangesRef.current && (runtimePending > 0 || uploadInProgress)) return;
                    pendingChangesRef.current = false;
                    lastIdleAtRef.current = Date.now();
                    setCloudStatus('idle');
                }, 2000);
            }, remaining);
        }, [clearPendingActionItems, clearSlowInternetHint, clearSyncLockOverlay, getRuntimePendingCount, isRuntimeUploadInProgress, resetLongSyncFallback, startSyncingState]);

        useEffect(() => {
            const runtimeDeadlock = isUserQueueBlockedWithoutClient();
            const runtimeSyncActive = !!syncingStartRef.current && (
                cloudStatus === 'syncing'
                || isRuntimeUploadInProgress()
                || (syncProgressTotalRef.current > 0 && !runtimeDeadlock)
            );

            if (runtimeSyncActive) {
                ensureSyncingStart();
                armSyncLockOverlay();
                armSlowInternetHint();
                armLongSyncFallback();
                return;
            }

            clearSyncLockOverlay();
            clearSlowInternetHint();
        }, [armLongSyncFallback, armSlowInternetHint, armSyncLockOverlay, clearSlowInternetHint, clearSyncLockOverlay, cloudStatus, ensureSyncingStart, isRuntimeUploadInProgress]);

        useEffect(() => {
            const handleSyncComplete = (e) => {
                if (e?.type === 'heysSyncCompleted' && e?.detail?.phaseA) {
                    return;
                }

                const nowDedupe = Date.now();
                if (nowDedupe - syncCompleteDedupeAtRef.current < 380) {
                    return;
                }
                syncCompleteDedupeAtRef.current = nowDedupe;

                // ⚡️ Первый heysSyncCompleted после инициализации не должен триггерить UI
                // если не было фактических локальных изменений/отложенных синков — иначе мерцание
                const hadPendingWork =
                    syncingStartRef.current ||
                    pendingChangesRef.current ||
                    (syncProgressTotalRef.current > 0) ||
                    (pendingCountRef.current > 0);
                if (!hadPendingWork) {
                    // 🔒 Запоминаем время первого sync для cooldown
                    if (!initialSyncCompletedAtRef.current) {
                        initialSyncCompletedAtRef.current = Date.now();
                    }
                    indLog('[HEYS.sync] [IND] sync-complete: skip (no pending work)');
                    return;
                }

                const runtimePending = getRuntimePendingCount();
                const uploadInProgress = isRuntimeUploadInProgress();

                indLog('[HEYS.sync] [IND] sync-complete: pending=' + runtimePending + ' upload=' + uploadInProgress + ' hadWork=' + !!hadPendingWork + ' status=' + cloudStatusRef.current);

                if (syncingDelayTimeoutRef.current) {
                    clearTimeout(syncingDelayTimeoutRef.current);
                    syncingDelayTimeoutRef.current = null;
                }
                if (cloudSyncTimeoutRef.current) {
                    clearTimeout(cloudSyncTimeoutRef.current);
                    cloudSyncTimeoutRef.current = null;
                }

                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    return;
                }

                if (uploadInProgress) {
                    startSyncingState();
                    return;
                }

                if (runtimePending > 0) {
                    pendingChangesRef.current = true;
                    // Не сбрасываем syncingStartRef: иначе handleDataSaved снова вызывает
                    // startSyncingState на каждом heys:data-saved (например пачка dayv2).
                    setCloudStatus('queued');
                    return;
                }

                pendingChangesRef.current = false;
                // Сбрасываем старый syncedTimeout чтобы гард не заблокировал переход в synced
                if (syncedTimeoutRef.current) {
                    clearTimeout(syncedTimeoutRef.current);
                    syncedTimeoutRef.current = null;
                }
                showSyncedWithMinDuration();
            };

            const IND_DATA_SAVED_SKIP_LOG_MS = 4000;
            const logDataSavedSkipOnce = (reasonKey, detailSuffix, e) => {
                const key = String(e?.detail?.key ?? '?');
                const sig = reasonKey + '|' + key;
                const now = Date.now();
                const r = indDataSavedSkipLogRef.current;
                if (r.sig === sig && now - r.at < IND_DATA_SAVED_SKIP_LOG_MS) return;
                r.sig = sig;
                r.at = now;
                indLog('[HEYS.sync] [IND] data-saved: skip (' + reasonKey + (detailSuffix || '') + '), key=' + key);
            };

            const handleDataSaved = (e) => {
                if (e?.detail) {
                    pushPendingActionItem(e.detail);
                }
                pendingChangesRef.current = true;

                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    return;
                }

                if (syncedTimeoutRef.current) {
                    logDataSavedSkipOnce('syncedTimeout active', '', e);
                    return;
                }

                // 🔒 Cooldown: не показываем "syncing" сразу после первого sync
                // Это предотвращает мерцание когда merged данные сохраняются обратно в облако
                const timeSinceInitialSync = initialSyncCompletedAtRef.current
                    ? Date.now() - initialSyncCompletedAtRef.current
                    : Infinity;
                if (timeSinceInitialSync < INITIAL_SYNC_COOLDOWN_MS) {
                    logDataSavedSkipOnce('initial-cooldown', ' ' + Math.round(timeSinceInitialSync) + 'ms', e);
                    return;
                }

                // 🔕 Не показываем индикатор для сохранений в течение 3с после hot-sync
                // (advice, debug, presets, usage_stats и любые другие реактивные ключи)
                const _hotAt = window.__heysHotSyncLastWriteAt;
                const sinceHotSync = (typeof _hotAt === 'number' && _hotAt > 0)
                    ? (Date.now() - _hotAt)
                    : Infinity;
                if (sinceHotSync < 3000) {
                    logDataSavedSkipOnce('hot-sync cooldown', ' ' + Math.round(sinceHotSync) + 'ms', e);
                    return;
                }

                // 🔕 Не прерываем фазу synced→idle (иначе 2с таймер на idle отменяется и цикл не завершается)
                if (cloudStatusRef.current === 'synced') {
                    logDataSavedSkipOnce('synced-phase', '', e);
                    return;
                }

                // 🔕 После перехода в idle даём 5с покоя (cascade DCS пишет data каждые ~1с)
                const sinceIdle = Date.now() - lastIdleAtRef.current;
                if (lastIdleAtRef.current > 0 && sinceIdle < 5000) {
                    logDataSavedSkipOnce('post-idle cooldown', ' ' + Math.round(sinceIdle) + 'ms', e);
                    return;
                }

                // 🔕 Если syncingStart уже активен — повторный вызов не нужен
                // (предотвращает flood startSyncingState при rapid writes каждые ~35ms)
                if (syncingStartRef.current) {
                    logDataSavedSkipOnce('syncingStart active', '', e);
                    return;
                }

                indLog('[HEYS.sync] [IND] data-saved: → startSyncingState, key=' + (e?.detail?.key || '?') + ' sinceHotSync=' + (sinceHotSync === Infinity ? 'n/a' : Math.round(sinceHotSync) + 'ms'));

                const armDataSavedHeavyUi = () => {
                    if (dataSavedUiRafRef.current != null) return;
                    dataSavedUiRafRef.current = window.requestAnimationFrame(() => {
                        dataSavedUiRafRef.current = null;
                        if (cloudSyncTimeoutRef.current) {
                            clearTimeout(cloudSyncTimeoutRef.current);
                            cloudSyncTimeoutRef.current = null;
                        }

                        startSyncingState();

                        if (!cloudSyncTimeoutRef.current) {
                            cloudSyncTimeoutRef.current = setTimeout(() => {
                                const runtimePending = getRuntimePendingCount();
                                const uploadInProgress = isRuntimeUploadInProgress();

                                if (!navigator.onLine) {
                                    setCloudStatus('offline');
                                    return;
                                }

                                if (uploadInProgress) {
                                    startSyncingState();
                                    return;
                                }

                                if (runtimePending > 0) {
                                    setCloudStatus('queued');
                                    return;
                                }

                                pendingChangesRef.current = false;
                                if (syncedTimeoutRef.current) {
                                    clearTimeout(syncedTimeoutRef.current);
                                    syncedTimeoutRef.current = null;
                                }
                                showSyncedWithMinDuration();
                            }, 5000);
                        }
                    });
                };
                armDataSavedHeavyUi();
            };

            const handleDayUpdated = (e) => {
                const detail = e?.detail || {};
                if (detail.batch) return;
                const source = String(detail.source || '');
                if (PENDING_SYNC_UI_SKIPPED_SOURCES.has(source) || source.startsWith('cloud')) return;

                pushPendingActionItem({
                    ...detail,
                    type: detail.type || 'day',
                    key: detail.key || (detail.date ? `day:${detail.date}` : 'day'),
                });
            };

            const handlePendingChange = (e) => {
                if (pendingChangeRafRef.current != null) return;
                pendingChangeRafRef.current = window.requestAnimationFrame(() => {
                    pendingChangeRafRef.current = null;
                    const eventCount = e.detail?.count || 0;
                    const runtimeCount = getRuntimePendingCount();
                    const count = typeof runtimeCount === 'number' ? runtimeCount : eventCount;
                    const details = count > 0
                        ? getRuntimePendingDetails()
                        : createEmptyPendingDetails();
                    const uploadInProgress = isRuntimeUploadInProgress();

                    const _pcSig = `${count}|${uploadInProgress}|${!!syncingStartRef.current}|${cloudStatusRef.current}`;
                    const _pcNow = Date.now();
                    const _pcR = indPendingChangeLogRef.current;
                    if (!(_pcR.sig === _pcSig && _pcNow - _pcR.at < 2500)) {
                        _pcR.sig = _pcSig;
                        _pcR.at = _pcNow;
                        indLog('[HEYS.sync] [IND] pending-change: count=' + count + ' upload=' + uploadInProgress + ' syncingStart=' + !!syncingStartRef.current + ' status=' + cloudStatusRef.current);
                    }

                    // Batch all setState calls into a single React render pass (React 17 doesn't
                    // auto-batch outside event handlers — RAF is an external context).
                    const _batchFn = window.ReactDOM?.unstable_batchedUpdates || ((fn) => fn());
                    _batchFn(() => {
                        setPendingCount(count);
                        setPendingDetails(details);

                        if (count > 0) {
                            ensureFallbackPendingActionItems(details);
                            if (longSyncFallbackActiveRef.current) {
                                setShowPendingSyncBanner(true);
                            }
                        } else {
                            clearPendingActionItems();
                            resetLongSyncFallback();
                        }

                        if (syncProgressTotalRef.current > 0 && count < syncProgressTotalRef.current) {
                            setSyncProgress(prev => ({ ...prev, synced: prev.total - count }));
                        }

                        if (count > 0 && !navigator.onLine) {
                            pendingChangesRef.current = true;
                            setCloudStatus('offline');
                        } else if (count > 0 && navigator.onLine) {
                            pendingChangesRef.current = true;
                            if (syncingStartRef.current) {
                                // syncingStart уже активен — ничего делать не нужно, цикл уже запущен
                            } else if (uploadInProgress || syncProgressTotalRef.current > 0) {
                                if (cloudStatusRef.current !== 'syncing') {
                                    startSyncingState();
                                }
                            } else {
                                setCloudStatus('queued');
                            }
                        } else if (count === 0 && !uploadInProgress && !syncingStartRef.current && navigator.onLine && cloudStatusRef.current !== 'synced') {
                            setCloudStatus('idle');
                        }
                    });
                });
            };

            const handleSyncProgress = (e) => {
                const { synced, done, total } = e.detail || {};
                const completed = typeof done === 'number' ? done : synced;
                if (typeof completed === 'number' && typeof total === 'number') {
                    const now = Date.now();
                    const r = syncProgressDedupeRef.current;
                    if (completed === r.completed && total === r.total && (now - r.at) < 70) {
                        return;
                    }
                    r.completed = completed;
                    r.total = total;
                    r.at = now;
                    indLog('[HEYS.sync] [IND] sync-progress: completed=' + completed + ' total=' + total);
                    setSyncProgress({ synced: completed, total });
                    if (navigator.onLine && total > 0 && !syncingStartRef.current) {
                        startSyncingState();
                    }
                }
            };

            const handleSyncError = (e) => {
                const code = e.detail?.error;
                const isPersistent = e.detail?.persistent || false;

                if (code === 'auth_required') {
                    setCloudStatus('session');
                    setRetryCountdown(0);

                    // 🔥 Debounce: показываем toast и делаем logout только если не делали в последние 10 сек
                    if (!authErrorShownRef.current) {
                        authErrorShownRef.current = true;
                        try { HEYS.Toast?.error('Сессия истекла. Требуется повторный вход'); } catch (_) { }

                        // 🚪 FORCE LOGOUT: Dispatch события для автоматического выхода на экран логина
                        window.dispatchEvent(new CustomEvent('heys:force-logout', {
                            detail: { reason: 'auth_required' }
                        }));

                        // Сбрасываем флаг через 10 секунд
                        if (authErrorTimeoutRef.current) clearTimeout(authErrorTimeoutRef.current);
                        authErrorTimeoutRef.current = setTimeout(() => {
                            authErrorShownRef.current = false;
                        }, 10000);
                    }
                    return;
                }

                // 🔥 Если ошибка критическая (persistent), показываем тост
                if (isPersistent) {
                    try { HEYS.Toast?.error(`Ошибка синхронизации: ${code}`) || console.error(`Sync error: ${code}`); } catch (_) { }
                }

                const retryIn = e.detail?.retryIn || 5;
                setCloudStatus('error');
                setRetryCountdown(retryIn);

                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = setInterval(() => {
                    setRetryCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(retryIntervalRef.current);
                            retryIntervalRef.current = null;
                            if (navigator.onLine && window.HEYS?.cloud?.retrySync) {
                                window.HEYS.cloud.retrySync();
                                startSyncingState();
                            }
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            };

            const handleNetworkRestored = (e) => {
                const count = e.detail?.pendingCount || 0;
                if (count > 0) {
                    pendingChangesRef.current = true;
                    startSyncingState();
                }
            };

            const handleQueueDrained = () => {
                setPendingCount(0);
                setPendingDetails(createEmptyPendingDetails());
                pendingChangesRef.current = false;
                clearPendingActionItems();
                resetLongSyncFallback();

                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    return;
                }

                // Не показываем галочку если анимация синка не запускалась
                // (данные синкались тихо, в фоне, без уведомления пользователя)
                if (!syncingStartRef.current && cloudStatusRef.current === 'idle') {
                    indLog('[HEYS.sync] [IND] queue-drained: skip (syncingStart=null, status=idle)');
                    return;
                }

                // Не показываем галочку если дрейн произошёл в 3с после hot-sync write
                const _hotAtQd = window.__heysHotSyncLastWriteAt;
                const sinceHotSyncQd = (typeof _hotAtQd === 'number' && _hotAtQd > 0)
                    ? (Date.now() - _hotAtQd)
                    : Infinity;
                if (sinceHotSyncQd < 3000) {
                    indLog('[HEYS.sync] [IND] queue-drained: skip (hot-sync cooldown ' + Math.round(sinceHotSyncQd) + 'ms)');
                    // Если уже был запущен синк — планируем отложенный showSynced после окончания cooldown
                    if (syncingStartRef.current || cloudStatusRef.current === 'syncing' || cloudStatusRef.current === 'queued') {
                        if (queueDrainedFallbackRef.current) clearTimeout(queueDrainedFallbackRef.current);
                        queueDrainedFallbackRef.current = setTimeout(() => {
                            queueDrainedFallbackRef.current = null;
                            const stillPending = getRuntimePendingCount();
                            const stillUploading = isRuntimeUploadInProgress();
                            const st = cloudStatusRef.current;
                            if (navigator.onLine && !stillPending && !stillUploading && (st === 'queued' || st === 'syncing')) {
                                indLog('[HEYS.sync] [IND] queue-drained: fallback showSynced (post hot-sync cooldown) status=' + st);
                                showSyncedWithMinDuration();
                            }
                        }, Math.max(0, 3000 - sinceHotSyncQd + 150));
                    }
                    return;
                }

                indLog('[HEYS.sync] [IND] queue-drained: → showSynced, sinceHotSync=' + (sinceHotSyncQd === Infinity ? 'n/a' : Math.round(sinceHotSyncQd) + 'ms') + ' status=' + cloudStatusRef.current);
                showSyncedWithMinDuration();
            };

            const handleSyncRestored = () => {
                const runtimePending = getRuntimePendingCount();
                const uploadInProgress = isRuntimeUploadInProgress();

                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    return;
                }

                if (uploadInProgress || runtimePending > 0) {
                    startSyncingState();
                    return;
                }

                showSyncedWithMinDuration();
            };

            const handleOnline = () => {
                // 🆕 Остановить таймер офлайн
                if (offlineDurationIntervalRef.current) {
                    clearInterval(offlineDurationIntervalRef.current);
                    offlineDurationIntervalRef.current = null;
                }
                const wasOfflineFor = offlineStartRef.current ? Math.floor((Date.now() - offlineStartRef.current) / 1000) : 0;
                offlineStartRef.current = null;
                setOfflineDuration(0);

                setShowOfflineBanner(false);
                setShowOnlineBanner(true);

                if (cloudStatusRef.current === 'session') {
                    setTimeout(() => setShowOnlineBanner(false), 2000);
                    return;
                }

                // 🆕 Haptic feedback при восстановлении связи
                if ('vibrate' in navigator) {
                    navigator.vibrate([50, 30, 50]); // Два коротких вибро — "всё ок"
                }

                setTimeout(() => setShowOnlineBanner(false), 2000);

                const runtimePending = getRuntimePendingCount();
                const uploadInProgress = isRuntimeUploadInProgress();

                if (pendingChangesRef.current || pendingCountRef.current > 0 || runtimePending > 0 || uploadInProgress) {
                    pendingChangesRef.current = true;
                    if (uploadInProgress || syncProgressTotalRef.current > 0) {
                        startSyncingState();
                    } else {
                        setCloudStatus('queued');
                    }
                } else {
                    clearPendingActionItems();
                    resetLongSyncFallback();
                    setCloudStatus('idle');
                }

                // 🆕 Логируем время офлайн для аналитики
                if (wasOfflineFor > 5 && window.HEYS?.analytics?.trackDataOperation) {
                    window.HEYS.analytics.trackDataOperation('offline_session', 1, wasOfflineFor * 1000);
                }
            };

            const handleOffline = () => {
                // 🆕 Запустить таймер офлайн
                offlineStartRef.current = Date.now();
                setOfflineDuration(0);

                // Обновлять время каждую секунду
                if (offlineDurationIntervalRef.current) {
                    clearInterval(offlineDurationIntervalRef.current);
                }
                offlineDurationIntervalRef.current = setInterval(() => {
                    if (typeof document !== 'undefined' && document.hidden) return;
                    if (offlineStartRef.current) {
                        setOfflineDuration(Math.floor((Date.now() - offlineStartRef.current) / 1000));
                    }
                }, 1000);

                setShowOfflineBanner(true);
                setCloudStatus('offline');

                // 🆕 Haptic feedback при потере связи
                if ('vibrate' in navigator) {
                    navigator.vibrate(100); // Одна длинная вибрация — внимание
                }

                // Не скрываем баннер автоматически — он исчезнет когда связь вернётся
                resetLongSyncFallback();
            };

            window.addEventListener('heysSyncCompleted', handleSyncComplete);
            window.addEventListener('heys:data-uploaded', handleSyncComplete);
            window.addEventListener('heys:data-saved', handleDataSaved);
            window.addEventListener('heys:day-updated', handleDayUpdated);
            window.addEventListener('heys:pending-change', handlePendingChange);
            window.addEventListener('heys:network-restored', handleNetworkRestored);
            window.addEventListener('heys:sync-progress', handleSyncProgress);
            window.addEventListener('heys:sync-error', handleSyncError);
            window.addEventListener('heys:queue-drained', handleQueueDrained);
            window.addEventListener('heys:sync-restored', handleSyncRestored);
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            const syncOfflineDurationOnVisible = () => {
                if (typeof document !== 'undefined' && document.hidden) return;
                if (offlineStartRef.current) {
                    setOfflineDuration(Math.floor((Date.now() - offlineStartRef.current) / 1000));
                }
            };
            document.addEventListener('visibilitychange', syncOfflineDurationOnVisible);

            if (!initialCheckDoneRef.current) {
                initialCheckDoneRef.current = true;
                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    setShowOfflineBanner(true);
                    // Баннер остаётся видимым пока нет сети — скроется через handleOnline()
                } else {
                    const initialPending = getRuntimePendingCount();
                    const uploadInProgress = isRuntimeUploadInProgress();

                    if (uploadInProgress) {
                        pendingChangesRef.current = initialPending > 0;
                        startSyncingState();
                    } else if (initialPending > 0) {
                        pendingChangesRef.current = true;
                        setCloudStatus('queued');
                    } else {
                        setCloudStatus('idle');
                    }
                }
            }

            if (window.HEYS?.cloud?.getPendingCount) {
                const initialPending = window.HEYS.cloud.getPendingCount();
                setPendingCount(initialPending);
                if (initialPending === 0) {
                    clearPendingActionItems();
                }
            }
            if (window.HEYS?.cloud?.getPendingDetails) {
                const initialDetails = window.HEYS.cloud.getPendingDetails();
                setPendingDetails(initialDetails);
                if ((window.HEYS?.cloud?.getPendingCount?.() || 0) > 0) {
                    ensureFallbackPendingActionItems(initialDetails);
                }
            }

            return () => {
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                window.removeEventListener('heys:data-uploaded', handleSyncComplete);
                window.removeEventListener('heys:data-saved', handleDataSaved);
                window.removeEventListener('heys:day-updated', handleDayUpdated);
                window.removeEventListener('heys:pending-change', handlePendingChange);
                window.removeEventListener('heys:network-restored', handleNetworkRestored);
                window.removeEventListener('heys:sync-progress', handleSyncProgress);
                window.removeEventListener('heys:sync-error', handleSyncError);
                window.removeEventListener('heys:queue-drained', handleQueueDrained);
                window.removeEventListener('heys:sync-restored', handleSyncRestored);
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                document.removeEventListener('visibilitychange', syncOfflineDurationOnVisible);
                if (pendingChangeRafRef.current != null) {
                    window.cancelAnimationFrame(pendingChangeRafRef.current);
                    pendingChangeRafRef.current = null;
                }
                if (dataSavedUiRafRef.current != null) {
                    window.cancelAnimationFrame(dataSavedUiRafRef.current);
                    dataSavedUiRafRef.current = null;
                }
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current);
                if (syncingDelayTimeoutRef.current) clearTimeout(syncingDelayTimeoutRef.current);
                if (syncLockTimeoutRef.current) clearTimeout(syncLockTimeoutRef.current);
                if (slowInternetHintTimeoutRef.current) clearTimeout(slowInternetHintTimeoutRef.current);
                if (longSyncFallbackTimeoutRef.current) clearTimeout(longSyncFallbackTimeoutRef.current);
                if (queueDrainedFallbackRef.current) clearTimeout(queueDrainedFallbackRef.current);
                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
                // 🆕 Очистка таймера офлайн
                if (offlineDurationIntervalRef.current) clearInterval(offlineDurationIntervalRef.current);
                // 🔥 Очистка таймера auth error debounce
                if (authErrorTimeoutRef.current) clearTimeout(authErrorTimeoutRef.current);
            };
        }, [clearPendingActionItems, ensureFallbackPendingActionItems, getRuntimePendingCount, getRuntimePendingDetails, isRuntimeUploadInProgress, pushPendingActionItem, resetLongSyncFallback, showSyncedWithMinDuration, startSyncingState]);

        useEffect(() => {
            if (cloudStatus !== 'syncing' && !showSyncLockOverlay && !showPendingSyncBanner && !syncingStartRef.current) return;

            let timerId = null;
            let detailsTick = 0;
            let cancelled = false;

            const getPollIntervalMs = (isActive) => {
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                    return SYNC_STATUS_POLL_HIDDEN_MS;
                }
                return isActive ? SYNC_STATUS_POLL_ACTIVE_MS : SYNC_STATUS_POLL_IDLE_MS;
            };

            const clearTimer = () => {
                if (timerId) {
                    clearTimeout(timerId);
                    timerId = null;
                }
            };

            const schedule = (isActive) => {
                if (cancelled) return;
                const delay = getPollIntervalMs(isActive);
                timerId = setTimeout(tick, delay);
            };

            const tick = () => {
                if (cancelled) return;

                const SYNC_UI_HEARTBEAT_MS = 5000;
                const _hbNow = Date.now();
                const _blockingModal = showSyncLockOverlayRef.current || showSlowInternetHintRef.current || showPendingSyncBannerRef.current;
                if (_blockingModal && (_hbNow - indSyncModalHeartbeatRef.current >= SYNC_UI_HEARTBEAT_MS)) {
                    indSyncModalHeartbeatRef.current = _hbNow;
                    let rpHb = 0;
                    let upHb = false;
                    let cidHb = '';
                    try {
                        rpHb = window.HEYS?.cloud?.getPendingCount?.() || 0;
                        upHb = !!window.HEYS?.cloud?.isUploadInProgress?.();
                        cidHb = (window.HEYS?.cloud?.getCurrentClientId?.() || '').slice(0, 8);
                    } catch (_) { /* noop */ }
                    const elapsedHb = syncingStartRef.current ? (_hbNow - syncingStartRef.current) : 0;
                    const deadlockHb = isUserQueueBlockedWithoutClient();
                    const syncVisHb = !!syncingStartRef.current && (
                        cloudStatusRef.current === 'syncing'
                        || upHb
                        || (syncProgressTotalRef.current > 0 && !deadlockHb)
                    );
                    let snapHb = '';
                    try {
                        const s = window.HEYS?.cloud?.getPendingQueuesSnapshot?.();
                        if (s) {
                            snapHb = ' cq=' + s.clientQueueLen + '+' + s.clientInFlightLen + ' uq=' + s.userQueueLen + '+' + s.userInFlightLen;
                        }
                    } catch (_) { /* noop */ }
                    indLog('[HEYS.sync] [IND] sync-ui heartbeat: elapsedMs=' + Math.round(elapsedHb)
                        + ' status=' + cloudStatusRef.current
                        + ' runtimePending=' + rpHb
                        + ' upload=' + upHb
                        + ' syncProgTotal=' + syncProgressTotalRef.current
                        + ' syncVisualActive=' + syncVisHb
                        + ' lockOverlay=' + showSyncLockOverlayRef.current
                        + ' slowHint=' + showSlowInternetHintRef.current
                        + ' pendBanner=' + showPendingSyncBannerRef.current
                        + ' longFallback=' + !!longSyncFallbackActiveRef.current
                        + ' syncedTimeout=' + !!syncedTimeoutRef.current
                        + ' client~=' + (cidHb || '(none)')
                        + snapHb);
                }

                const runtimePending = getRuntimePendingCount();
                const uploadInProgress = isRuntimeUploadInProgress();
                const hasPendingDelta = runtimePending !== pendingCountRef.current;
                const shouldRefreshDetails = runtimePending > 0
                    && (hasPendingDelta || detailsTick % SYNC_STATUS_DETAILS_REFRESH_EVERY === 0);

                detailsTick += 1;
                const _tickBatch = window.ReactDOM?.unstable_batchedUpdates || ((fn) => fn());
                if (!navigator.onLine) {
                    clearSyncLockOverlay();
                    clearSlowInternetHint();
                    _tickBatch(() => {
                        if (hasPendingDelta) setPendingCount(runtimePending);
                        setCloudStatus('offline');
                    });
                    schedule(false);
                    return;
                }

                _tickBatch(() => {
                    if (hasPendingDelta) setPendingCount(runtimePending);
                    if (shouldRefreshDetails || (runtimePending === 0 && pendingCountRef.current > 0)) {
                        const nextDetails = runtimePending > 0
                            ? getRuntimePendingDetails()
                            : createEmptyPendingDetails();
                        setPendingDetails(nextDetails);
                    }
                });

                if (runtimePending > 0 && !uploadInProgress && syncProgressTotalRef.current === 0) {
                    // Between RPC batches pending>0 while upload=false is normal — do not clear
                    // the full-screen lock here or it flickers open/closed (curator jank).
                    clearSlowInternetHint();
                    if (!syncingStartRef.current) {
                        clearSyncLockOverlay();
                    }
                    indLog('[HEYS.sync] [IND] tick: → queued, pending=' + runtimePending);
                    setCloudStatus('queued');
                    schedule(true);
                    return;
                }

                const syncElapsedMs = syncingStartRef.current
                    ? Date.now() - syncingStartRef.current
                    : 0;
                const userQueueDeadlock = isUserQueueBlockedWithoutClient();
                const syncVisualActive = !!syncingStartRef.current && (
                    cloudStatusRef.current === 'syncing'
                    || uploadInProgress
                    || (syncProgressTotalRef.current > 0 && !userQueueDeadlock)
                );

                if (syncVisualActive && !longSyncFallbackActiveRef.current) {
                    const { slowInternetHintMs } = getPinProxySyncOverlayDelaysMs();
                    if (cloudStatusRef.current !== 'syncing') {
                        setCloudStatus('syncing');
                    }

                    // Full-screen lock: only via armSyncLockOverlay (startSyncingState) — avoids
                    // duplicate open paths racing with the poll tick.

                    if (syncElapsedMs >= slowInternetHintMs && !slowInternetShownForCurrentSyncRef.current && !userQueueDeadlock) {
                        slowInternetShownForCurrentSyncRef.current = true;
                        setShowSlowInternetHint(true);
                    }

                    if (syncElapsedMs >= NON_BLOCKING_SYNC_DELAY && !showPendingSyncBanner) {
                        enterBackgroundPendingSync();
                        schedule(true);
                        return;
                    }
                }

                if (runtimePending === 0 && !uploadInProgress && (
                    syncingStartRef.current
                    || cloudStatusRef.current === 'syncing'
                    || syncProgressTotalRef.current > 0
                )) {
                    // showSyncedWithMinDuration уже выставляет syncedTimeoutRef — без гарда каждый poll пишет лог
                    if (!syncedTimeoutRef.current) {
                        indLog('[HEYS.sync] [IND] tick: → showSynced, syncingStart=' + !!syncingStartRef.current + ' status=' + cloudStatusRef.current);
                        pendingChangesRef.current = false;
                        showSyncedWithMinDuration();
                    }
                }

                schedule(syncVisualActive || runtimePending > 0 || uploadInProgress);
            };

            schedule(true);

            return () => {
                cancelled = true;
                clearTimer();
            };
        }, [
            clearSlowInternetHint,
            clearSyncLockOverlay,
            cloudStatus,
            enterBackgroundPendingSync,
            getRuntimePendingCount,
            getRuntimePendingDetails,
            isRuntimeUploadInProgress,
            showPendingSyncBanner,
            showSlowInternetHint,
            showSyncLockOverlay,
            showSyncedWithMinDuration,
        ]);

        const handleRetrySync = useCallback(() => {
            if (window.HEYS?.cloud?.retrySync) {
                window.HEYS.cloud.retrySync();
                startSyncingState();
            }
        }, [startSyncingState]);

        return {
            cloudStatus,
            pendingCount,
            pendingDetails,
            pendingActionItems,
            showOfflineBanner,
            showOnlineBanner,
            showSyncLockOverlay,
            showSlowInternetHint,
            showPendingSyncBanner,
            syncProgress,
            retryCountdown,
            handleRetrySync,
            offlineDuration, // 🆕 Время офлайн в секундах
        };
    }

    function useClientState(cloud, U) {
        const React = window.React;
        const { useState } = React;
        const [status, setStatus] = useState(
            typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'offline',
        );
        const [syncVer, setSyncVer] = useState(0);
        const [calendarVer, setCalendarVer] = useState(0); // 🗓️ Отдельный state для инвалидации календаря
        const [clients, setClients] = useState([]);
        const [clientsSource, setClientsSource] = useState(''); // 'cloud' | 'cache' | 'loading'
        const [clientId, setClientId] = useState('');
        const [newName, setNewName] = useState('');
        const [cloudUser, setCloudUser] = useState(null);
        const [isInitializing, setIsInitializing] = useState(true);
        const [products, setProducts] = useState([]);
        const [curatorTab, setCuratorTab] = useState('clients'); // 🆕 Tab: 'clients' | 'queue'
        const [needsConsent, setNeedsConsent] = useState(false); // 📋 Требуются ли согласия
        const [checkingConsent, setCheckingConsent] = useState(false); // 📋 Проверка согласий
        const [backupMeta, setBackupMeta] = useState(() => {
            return readStoredValue('heys_backup_meta', null);
        });
        const [backupBusy, setBackupBusy] = useState(false);

        return {
            status, setStatus,
            syncVer, setSyncVer,
            calendarVer, setCalendarVer,
            clients, setClients,
            clientsSource, setClientsSource,
            clientId, setClientId,
            needsConsent, setNeedsConsent,
            checkingConsent, setCheckingConsent,
            newName, setNewName,
            cloudUser, setCloudUser,
            isInitializing, setIsInitializing,
            products, setProducts,
            backupMeta, setBackupMeta,
            backupBusy, setBackupBusy,
            curatorTab, setCuratorTab, // 🆕
        };
    }

    function useCloudClients(cloud, U, {
        clients, setClients,
        clientsSource, setClientsSource,
        clientId, setClientId,
        cloudUser, setCloudUser,
        setProducts,
        setStatus,
        setSyncVer,
        setLoginError,
    }) {
        const React = window.React;
        const { useRef, useCallback, useEffect } = React;
        const ONE_CURATOR_MODE = false;
        const signInCooldownUntilRef = useRef(0);
        const fetchingClientsRef = useRef(false); // 🔧 FIX: Защита от дублирования запросов

        // Fallback если cloud.fetchWithRetry не доступен
        const defaultFetchWithRetry = async (fn, opts) => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), opts.timeoutMs || 8000)
            );
            try {
                return await Promise.race([fn(), timeoutPromise]);
            } catch (e) {
                return { data: null, error: { message: e.message } };
            }
        };

        const fetchClientsFromCloud = useCallback(async (curatorId) => {
            if (!curatorId) {
                return { data: [], source: 'error' };
            }

            const curatorShortId = String(curatorId).slice(0, 8);
            const summarizeClients = (list) => {
                const now = Date.now();
                const statusCounts = {};
                let missingStatus = 0;
                let missingEndDate = 0;
                let expired = 0;
                const sample = [];

                (list || []).forEach((c, idx) => {
                    const status = c?.subscription_status || 'none';
                    statusCounts[status] = (statusCounts[status] || 0) + 1;
                    if (!c?.subscription_status) missingStatus += 1;
                    if (!c?.trial_ends_at) missingEndDate += 1;

                    if (c?.trial_ends_at) {
                        const endTs = new Date(c.trial_ends_at).getTime();
                        if (!Number.isNaN(endTs) && endTs < now) expired += 1;
                    }

                    if (idx < 5 && c?.id) {
                        sample.push({
                            clientId: String(c.id).slice(0, 8),
                            status,
                            hasEndDate: !!c?.trial_ends_at,
                        });
                    }
                });

                return {
                    total: (list || []).length,
                    statusCounts,
                    missingStatus,
                    missingEndDate,
                    expired,
                    sample,
                };
            };

            // 🔧 FIX: Пропускаем если уже загружаем
            if (fetchingClientsRef.current) {
                console.info('[HEYS.clients] ⏭️ Skip fetch (already in progress)', { curatorId: curatorShortId });
                return { data: [], source: 'skip' };
            }
            fetchingClientsRef.current = true;

            setClientsSource('loading');

            console.info('[HEYS.clients] 🔄 Fetch clients start', { curatorId: curatorShortId });

            try {
                // 🔄 Используем YandexAPI вместо Supabase
                const result = await HEYS.YandexAPI.getClients(curatorId);

                fetchingClientsRef.current = false;

                if (result.error) {
                    // 🏠 При ошибке — используем localStorage кэш
                    console.warn('[HEYS.clients] ⚠️ fetchClients error, using localStorage cache', {
                        curatorId: curatorShortId,
                        message: result.error?.message || 'unknown_error'
                    });
                    const cached = readGlobalValue('heys_clients', null);
                    if (cached) {
                        const data = Array.isArray(cached) ? cached : JSON.parse(cached);
                        const summary = summarizeClients(data);
                        console.info('[HEYS.clients] 📦 Loaded clients from cache', {
                            curatorId: curatorShortId,
                            source: 'local',
                            ...summary
                        });
                        setClientsSource('local');
                        return { data, source: 'local' };
                    }
                    setClientsSource('error');
                    return { data: [], source: 'error' };
                }

                const data = result.data;
                // Сохраняем в localStorage для кэширования
                if (data && data.length > 0) writeGlobalValue('heys_clients', data);
                const summary = summarizeClients(data);
                console.info('[HEYS.clients] ✅ Loaded clients from cloud', {
                    curatorId: curatorShortId,
                    source: 'cloud',
                    ...summary
                });
                setClientsSource('cloud');
                return { data: data || [], source: 'cloud' };
            } catch (e) {
                fetchingClientsRef.current = false;
                console.error('[HEYS.clients] ❌ fetchClientsFromCloud failed', {
                    curatorId: curatorShortId,
                    message: e.message || 'unknown_error'
                });
                // 🏠 При exception — тоже используем localStorage
                const cached = readGlobalValue('heys_clients', null);
                if (cached) {
                    try {
                        const data = Array.isArray(cached) ? cached : JSON.parse(cached);
                        const summary = summarizeClients(data);
                        console.info('[HEYS.clients] 📦 Loaded clients from cache after error', {
                            curatorId: curatorShortId,
                            source: 'local',
                            ...summary
                        });
                        setClientsSource('local');
                        return { data, source: 'local' };
                    } catch { }
                }
                setClientsSource('error');
                return { data: [], source: 'error' };
            }
        }, [cloud]);

        // 🔄 Hot-sync: слушаем heys:clients-updated и пере-загружаем список клиентов.
        // Диспатчится из TrialQueueAdmin после approve/activate/reject и из
        // ClientSubscriptionButton после действий куратора. Без этого новые
        // клиенты / сменённый статус видны только после refresh страницы.
        useEffect(() => {
            if (!cloudUser?.id) return;
            const handler = async (ev) => {
                try {
                    const result = await fetchClientsFromCloud(cloudUser.id);
                    if (result?.data) setClients(result.data);
                    console.info('[HEYS.clients] 🔄 hot-sync via heys:clients-updated', ev?.detail || {});
                } catch (e) {
                    console.warn('[HEYS.clients] hot-sync error:', e.message);
                }
            };
            window.addEventListener('heys:clients-updated', handler);
            return () => window.removeEventListener('heys:clients-updated', handler);
        }, [cloudUser, fetchClientsFromCloud, setClients]);

        const addClientToCloud = useCallback(async (arg) => {
            const payload = typeof arg === 'string' ? { name: arg } : (arg || {});
            const clientName = (payload.name || '').trim() || `Клиент ${clients.length + 1}`;
            const clientPhone = (payload.phone || '').trim();
            const clientPin = (payload.pin || '').trim();

            if (!cloudUser || !cloudUser.id) {
                const newClient = {
                    id: `local-user-${Date.now()}`,
                    name: clientName,
                };
                const updatedClients = [...clients, newClient];
                setClients(updatedClients);
                writeGlobalValue('heys_clients', updatedClients);
                setClientId(newClient.id);
                writeGlobalValue('heys_client_current', newClient.id);
                return;
            }

            const userId = cloudUser.id;

            // 🧩 Если доступны RPC для phone+PIN — создаём клиента через них (кураторский флоу)
            // (Телефон/PIN опциональны: если не заполнены — fallback на старый insert)
            try {
                const auth = window.HEYS && window.HEYS.auth;
                const createWithPin = auth && auth.createClientWithPin;
                if (createWithPin && clientPhone && clientPin) {
                    const created = await createWithPin({ name: clientName, phone: clientPhone, pin: clientPin });
                    if (created && created.ok && created.clientId) {
                        const result = await fetchClientsFromCloud(userId);
                        setClients(result.data);
                        setClientId(created.clientId);
                        writeGlobalValue('heys_client_current', created.clientId);
                        // 🆕 Сохраняем имя для pre-fill в профиле (без namespace — напрямую в localStorage)
                        try {
                            writeGlobalValue('heys_pending_client_name', clientName);
                        } catch (_) { }
                        try {
                            HEYS.Toast?.success('Клиент создан! Телефон: ' + created.phone + ', PIN: ' + created.pin) || alert('✅ Клиент создан\n\nТелефон: ' + created.phone + '\nPIN: ' + created.pin);
                        } catch (_) { }
                        return;
                    }
                    if (created && created.error) {
                        HEYS.Toast?.error('Ошибка создания клиента: ' + created.error) || alert('Ошибка создания клиента: ' + created.error);
                        return;
                    }
                }
            } catch (e) {
                // Падаем в fallback insert ниже
            }

            // 🔄 Используем YandexAPI вместо Supabase
            try {
                const data = await HEYS.YandexAPI.createClient(clientName, userId);
                if (!data || !data.id) {
                    console.error('Ошибка создания клиента');
                    HEYS.Toast?.error('Ошибка создания клиента') || alert('Ошибка создания клиента');
                    return;
                }
                const result = await fetchClientsFromCloud(userId);
                setClients(result.data);
                setClientId(data.id);
                writeGlobalValue('heys_client_current', data.id);
            } catch (error) {
                console.error('Ошибка создания клиента:', error);
                HEYS.Toast?.error('Ошибка создания клиента: ' + error.message) || alert('Ошибка создания клиента: ' + error.message);
            }
        }, [clients, cloudUser, fetchClientsFromCloud, setClientId, setClients, U]);

        const renameClient = useCallback(async (id, name) => {
            if (!cloudUser || !cloudUser.id) {
                const updatedClients = clients.map((c) => (c.id === id ? { ...c, name } : c));
                setClients(updatedClients);
                writeGlobalValue('heys_clients', updatedClients);
                return;
            }

            const userId = cloudUser.id;
            // 🔄 Используем YandexAPI вместо Supabase
            await HEYS.YandexAPI.updateClient(id, { name });
            const result = await fetchClientsFromCloud(userId);
            setClients(result.data);
        }, [clients, cloudUser, fetchClientsFromCloud, setClients, U]);

        // Редактирование клиента: имя, телефон и/или PIN
        const editClient = useCallback(async (id, { name, phone, newPin } = {}) => {
            console.info('[HEYS.clients] ✅ editClient start:', { id, hasName: !!name, hasPhone: !!phone, hasPin: !!newPin });

            const updates = {};
            if (name) updates.name = name;
            if (phone) updates.phone = phone;

            if (!cloudUser || !cloudUser.id) {
                // Оффлайн — обновляем только имя локально
                if (updates.name) {
                    const updatedClients = clients.map((c) => (c.id === id ? { ...c, ...updates } : c));
                    setClients(updatedClients);
                    writeGlobalValue('heys_clients', updatedClients);
                }
                return;
            }

            try {
                // Обновляем имя и/или телефон через API
                if (Object.keys(updates).length > 0) {
                    await HEYS.YandexAPI.updateClient(id, updates);
                }

                // Обновляем PIN — отдельный RPC
                if (newPin) {
                    const pinResult = await HEYS.auth.resetClientPin({ clientId: id, newPin });
                    if (!pinResult.ok) {
                        throw new Error(pinResult.message || 'PIN update failed');
                    }
                }

                const result = await fetchClientsFromCloud(cloudUser.id);
                setClients(result.data);

                console.info('[HEYS.clients] ✅ editClient done:', { id, changedFields: Object.keys(updates), pinChanged: !!newPin });
            } catch (err) {
                console.error('[HEYS.clients] ❌ editClient error:', { id, error: err.message });
                throw err;
            }
        }, [clients, cloudUser, fetchClientsFromCloud, setClients, U]);

        const removeClient = useCallback(async (id, options = {}) => {
            const targetId = String(id || '');
            if (!targetId) return false;

            const targetClient = clients.find((c) => String(c?.id || '') === targetId) || null;
            const clientName = options.name || targetClient?.name || 'клиент';
            const shouldUseUndo = options.enableUndo === true && !!HEYS.Undo?.runAction;

            const syncClientCache = (nextClients) => {
                if (typeof window !== 'undefined') {
                    window.HEYS = window.HEYS || {};
                    window.HEYS.curatorClients = Array.isArray(nextClients) ? nextClients : [];
                }
            };

            const applyLocalRemoval = (snapshotClients, previousCurrentClientId) => {
                const updatedClients = snapshotClients.filter((c) => String(c?.id || '') !== targetId);
                setClients(updatedClients);
                syncClientCache(updatedClients);
                writeGlobalValue('heys_clients', updatedClients);

                if (previousCurrentClientId === targetId) {
                    setClientId('');
                    writeGlobalValue('heys_client_current', '');
                    writeGlobalValue('heys_last_client_id', '');
                }

                return updatedClients;
            };

            const restoreLocalRemoval = (snapshotClients, previousCurrentClientId) => {
                setClients(snapshotClients);
                syncClientCache(snapshotClients);
                writeGlobalValue('heys_clients', snapshotClients);

                if (previousCurrentClientId === targetId) {
                    setClientId(previousCurrentClientId);
                    writeGlobalValue('heys_client_current', previousCurrentClientId);
                    writeGlobalValue('heys_last_client_id', previousCurrentClientId);
                }
            };

            const commitRemoval = async (snapshotClients, previousCurrentClientId) => {
                if (!cloudUser || !cloudUser.id) {
                    return true;
                }

                const userId = cloudUser.id;
                const deleteResult = await HEYS.YandexAPI.deleteClient(targetId);
                if (deleteResult?.error) {
                    throw new Error(deleteResult.error.message || 'Не удалось удалить клиента');
                }

                const result = await fetchClientsFromCloud(userId);
                const refreshedClients = Array.isArray(result?.data)
                    ? result.data
                    : snapshotClients.filter((c) => String(c?.id || '') !== targetId);
                setClients(refreshedClients);
                syncClientCache(refreshedClients);

                if (previousCurrentClientId === targetId) {
                    setClientId('');
                    writeGlobalValue('heys_client_current', '');
                    writeGlobalValue('heys_last_client_id', '');
                }

                return true;
            };

            if (!shouldUseUndo) {
                const snapshotClients = Array.isArray(clients) ? clients.slice() : [];
                const previousCurrentClientId = clientId;

                applyLocalRemoval(snapshotClients, previousCurrentClientId);

                try {
                    await commitRemoval(snapshotClients, previousCurrentClientId);
                } catch (error) {
                    restoreLocalRemoval(snapshotClients, previousCurrentClientId);
                    throw error;
                }

                return true;
            }

            return HEYS.Undo.runAction({
                label: `Клиент «${clientName}» удалён`,
                errorMessage: 'Не удалось подготовить удаление клиента',
                apply: () => {
                    const snapshotClients = Array.isArray(clients) ? clients.slice() : [];
                    const previousCurrentClientId = clientId;
                    applyLocalRemoval(snapshotClients, previousCurrentClientId);
                    return {
                        snapshotClients,
                        previousCurrentClientId,
                        clientId: targetId,
                    };
                },
                undo: (undoContext) => {
                    restoreLocalRemoval(undoContext.snapshotClients, undoContext.previousCurrentClientId);
                },
                onExpire: async (_reason, undoContext) => {
                    try {
                        await commitRemoval(undoContext.snapshotClients, undoContext.previousCurrentClientId);
                    } catch (error) {
                        restoreLocalRemoval(undoContext.snapshotClients, undoContext.previousCurrentClientId);
                        console.error('[HEYS.clients] ❌ removeClient commit error:', { id: targetId, error: error.message });
                        HEYS.Toast?.error?.(error.message || 'Не удалось удалить клиента');
                    }
                },
            });
        }, [clientId, clients, cloudUser, fetchClientsFromCloud, setClientId, setClients, U]);

        const cloudSignIn = useCallback(async (email, password, opts = {}) => {
            if (!email || !password) {
                setLoginError('Введите email и пароль');
                setStatus('offline');
                return { error: 'missing_credentials' };
            }

            const now = Date.now();
            if (now < signInCooldownUntilRef.current) {
                setLoginError('Слишком много попыток. Подождите 30 сек и попробуйте снова.');
                setStatus('offline');
                return { error: 'cooldown' };
            }

            const rememberMe = opts.rememberMe === true;
            if (!cloud || typeof cloud.signIn !== 'function') {
                HEYS.Toast?.warning('Облачный модуль не загружен') || alert('Облачный модуль не загружен');
                return;
            }

            try {
                setStatus('signin');
                setLoginError(null);

                if (rememberMe) {
                    writeGlobalValue('heys_remember_me', 'true');
                    writeGlobalValue('heys_remember_email', email || '');
                } else {
                    removeGlobalValue('heys_remember_me');
                    removeGlobalValue('heys_remember_email');
                }

                const res = await cloud.signIn(email, password);
                if (!res || res.error) {
                    const message = res?.error?.message || 'Ошибка подключения к серверу';
                    setLoginError(message);

                    // Примитивный backoff для 429
                    if (/Too Many Requests/i.test(message)) {
                        signInCooldownUntilRef.current = Date.now() + 30_000;
                    }
                    setStatus('offline');
                    return { error: message };
                }

                setCloudUser(res.user);
                setStatus(typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'online');
                const loadedResult = await fetchClientsFromCloud(res.user.id);
                setClients(loadedResult.data);

                // Не автовыбираем клиента — куратор должен выбрать сам через модалку
                // clientId остаётся null → показывается модалка выбора клиента

                const rawProducts = window.HEYS?.products?.getAll?.() || [];
                const loadedProducts = migrateProductsKcalNetAtwater(rawProducts);
                if (loadedProducts !== rawProducts) {
                    window.HEYS?.products?.setAll?.(loadedProducts, { source: 'atwater-migration' });
                }
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
            } catch (e) {
                setStatus('offline');
                setLoginError(e && e.message ? e.message : 'Ошибка подключения');
            }
        }, [cloud, fetchClientsFromCloud, setClientId, setClients, setCloudUser, setProducts, setStatus, setSyncVer, U]);

        const cloudSignOut = useCallback(async () => {
            try {
                if (cloud && typeof cloud.signOut === 'function') await cloud.signOut();
            } catch (_) { }
            if (window.HEYS) {
                window.HEYS.currentClientId = null;
                if (window.HEYS.store?.flushMemory) {
                    window.HEYS.store.flushMemory();
                }
            }
            // Важно: при выходе из аккаунта куратора сбрасываем “client mode”,
            // иначе на следующем запуске может открыться ConsentGate по старому clientId.
            removeGlobalValue('heys_client_current');
            removeGlobalValue('heys_pin_auth_client');
            removeGlobalValue('heys_client_phone');
            removeGlobalValue('heys_supabase_auth_token');
            // 🔧 v53 FIX: Очистка session_token для PIN auth
            removeGlobalValue('heys_session_token');
            setCloudUser(null);
            setClientId('');
            setClients([]);
            setProducts([]);
            setStatus('offline');
            setSyncVer((v) => v + 1);
            removeGlobalValue('heys_last_client_id');
        }, [cloud, setClientId, setClients, setCloudUser, setProducts, setStatus, setSyncVer]);

        // 🚪 FORCE LOGOUT: Слушаем событие и автоматически выходим на экран логина
        useEffect(() => {
            const handleForceLogout = (e) => {
                console.info('[HEYS] 🚪 Force logout triggered:', e.detail?.reason);
                // Полный logout — сбросит все состояния и покажет LoginScreen
                cloudSignOut();
            };

            window.addEventListener('heys:force-logout', handleForceLogout);
            return () => {
                window.removeEventListener('heys:force-logout', handleForceLogout);
            };
        }, [cloudSignOut]);

        return {
            ONE_CURATOR_MODE,
            fetchClientsFromCloud,
            addClientToCloud,
            renameClient,
            editClient,
            removeClient,
            cloudSignIn,
            cloudSignOut,
        };
    }

    HEYS.AppHooks = {
        useThemePreference,
        usePwaPrompts,
        useWakeLock,
        useCloudSyncStatus,
        useClientState,
        useCloudClients,
    };
})();
