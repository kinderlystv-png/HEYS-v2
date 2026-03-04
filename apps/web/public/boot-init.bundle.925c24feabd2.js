
/* ===== heys_app_root_v1.js ===== */
// heys_app_root_v1.js — App component extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRoot = HEYS.AppRoot || {};

    HEYS.AppRoot.createApp = function createApp({ React }) {
        const AppRootComponent = HEYS.AppRootComponent || {};
        const createComponent = AppRootComponent.createApp;

        // 🆕 Если AppRootComponent отсутствует — используем RecoveryScreen
        if (!createComponent) {
            // Уведомляем SW о boot failure
            if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
            }
            window.__heysLog && window.__heysLog('[CRITICAL] AppRootComponent missing!');

            // Пробуем использовать RecoveryScreen если он уже доступен
            const RecoveryScreen = AppRootComponent.RecoveryScreen;
            if (RecoveryScreen) {
                return function AppWithRecovery() {
                    return React.createElement(RecoveryScreen, { React, moduleName: 'AppRootComponent' });
                };
            }

            // Минимальный fallback если RecoveryScreen тоже недоступен
            return function AppFallback() {
                return React.createElement('div', {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100vh',
                        fontFamily: 'system-ui',
                        textAlign: 'center',
                        padding: '20px'
                    }
                }, [
                    React.createElement('div', { key: 'content' }, [
                        React.createElement('div', { key: 'icon', style: { fontSize: '48px', marginBottom: '16px' } }, '⚠️'),
                        React.createElement('h2', { key: 'title', style: { margin: '0 0 16px' } }, 'Ошибка загрузки'),
                        React.createElement('button', {
                            key: 'reload',
                            onClick: () => window.location.reload(),
                            style: {
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#10b981',
                                color: 'white',
                                cursor: 'pointer'
                            }
                        }, '🔄 Обновить')
                    ])
                ]);
            };
        }

        return createComponent({ React });
    };
})();



/* ===== heys_app_dependency_loader_v1.js ===== */
// heys_app_dependency_loader_v1.js — dependency wait & init loader extracted from heys_app_v12.js

// 🆕 PERF v9.2: Метка момента когда boot-init начал исполняться (не скачиваться)
window.__heysPerfMark && window.__heysPerfMark('boot-init: execute start');

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppDependencyLoader = HEYS.AppDependencyLoader || {};

    HEYS.AppDependencyLoader.start = function ({ initializeApp, isReactReady, isHeysReady }) {
        const bootLog = (msg) => window.__heysLog && window.__heysLog('[DEPS] ' + msg);
        bootLog('dependency loader start');
        window.__heysPerfMark && window.__heysPerfMark('boot-init: AppDependencyLoader.start');
        const INIT_RETRY_DELAY = 100;
        const INIT_LOADER_DELAY_MS = 420;
        const depsWaitStartedAt = Date.now();
        let reactCheckCount = 0;
        let _reactReadyLogged = false;
        let _heysReadyLogged = false;

        const defaultIsReactReady = () => Boolean(window.React && window.ReactDOM);

        // 🆕 Расширенная проверка HEYS модулей (включая критические для рендеринга)
        const defaultIsHeysReady = () => Boolean(
            HEYS &&
            HEYS.DayTab &&
            HEYS.Ration &&
            HEYS.UserTab &&
            // 🆕 Добавлены критические модули для рендеринга App
            HEYS.AppRootImpl &&
            HEYS.AppRootImpl.createApp &&
            HEYS.AppRootComponent &&
            HEYS.AppRootComponent.createApp
        );

        const checkReactReady = isReactReady || defaultIsReactReady;
        const checkHeysReady = isHeysReady || defaultIsHeysReady;

        const retryInit = () => {
            reactCheckCount++;
            setTimeout(initializeApp, INIT_RETRY_DELAY);
        };

        // 🆕 Recovery UI с кнопками
        const showRecoveryUI = (reason) => {
            bootLog('showing recovery UI: ' + reason);

            // Уведомляем SW о boot failure
            if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
            }

            document.getElementById('heys-init-loader')?.remove();
            document.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;padding:20px;background:#f3f4f6">
                    <div style="background:white;padding:32px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px;text-align:center">
                        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
                        <h2 style="margin:0 0 8px;font-size:20px">Ошибка загрузки</h2>
                        <p style="margin:0 0 24px;color:#6b7280;font-size:14px">${reason}</p>
                        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                            <button onclick="location.reload()" style="padding:12px 24px;border-radius:8px;border:none;background:#10b981;color:white;font-weight:500;cursor:pointer">🔄 Обновить</button>
                            <button id="clear-cache-btn" style="padding:12px 24px;border-radius:8px;border:1px solid #d1d5db;background:white;color:#374151;font-weight:500;cursor:pointer">🗑️ Сбросить кэш</button>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
                const btn = document.getElementById('clear-cache-btn');
                if (btn) {
                    btn.textContent = '⏳ Очистка...';
                    btn.disabled = true;
                }
                try {
                    if ('caches' in window) {
                        const names = await caches.keys();
                        await Promise.all(names.map(n => caches.delete(n)));
                    }
                    if ('serviceWorker' in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map(r => r.unregister()));
                    }
                    sessionStorage.clear();
                } catch (e) { console.error(e); }
                location.reload();
            });
        };

        const waitForDependencies = (onReady) => {
            // 🔍 PWA Boot logging

            // Показываем минимальный loader только если реально подождали достаточно,
            // чтобы исключить micro-flash на быстрых сетях.
            // 🆕 Heartbeat для watchdog — скрипты ещё грузятся
            if (typeof window !== 'undefined') {
                window.__heysLoadingHeartbeat = Date.now();
            }

            const depsElapsedMs = Date.now() - depsWaitStartedAt;
            if (!document.getElementById('heys-init-loader') && depsElapsedMs < INIT_LOADER_DELAY_MS) {
                if (window.__heysInitLoaderState !== 'wait_delay') {
                    console.info('[HEYS.sceleton] ⏱️ init_wait_delay', {
                        elapsedMs: depsElapsedMs,
                        delayMs: INIT_LOADER_DELAY_MS
                    });
                    window.__heysInitLoaderState = 'wait_delay';
                }
            }

            if (!document.getElementById('heys-init-loader') && depsElapsedMs >= INIT_LOADER_DELAY_MS) {
                bootLog('showing loader (waiting for deps)');
                if (window.__heysInitLoaderState !== 'show_loader') {
                    console.info('[HEYS.sceleton] 🦴 init_show_loader', {
                        elapsedMs: depsElapsedMs,
                        delayMs: INIT_LOADER_DELAY_MS
                    });
                    window.__heysInitLoaderState = 'show_loader';
                }
                const loader = document.createElement('div');
                loader.id = 'heys-init-loader';
                loader.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;z-index:99999';
                loader.innerHTML = '<div style="width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#10b981;border-radius:50%;animation:spin 0.8s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
                document.body.appendChild(loader);
            }

            // 🆕 PERF v9.2: логируем первый момент готовности React и HEYS независимо
            if (!_reactReadyLogged && checkReactReady()) {
                _reactReadyLogged = true;
                window.__heysPerfMark && window.__heysPerfMark('React ready (retries=' + reactCheckCount + ')');
            }
            if (!_heysReadyLogged && checkHeysReady()) {
                _heysReadyLogged = true;
                window.__heysPerfMark && window.__heysPerfMark('HEYS deps ready (retries=' + reactCheckCount + ')');
            }

            if (checkReactReady() && checkHeysReady()) {
                bootLog('deps ready, init app');
                // Убираем loader если показывали
                document.getElementById('heys-init-loader')?.remove();
                if (window.__heysInitLoaderState !== 'ready') {
                    console.info('[HEYS.sceleton] ✅ init_ready', {
                        elapsedMs: depsElapsedMs,
                        retries: reactCheckCount
                    });
                    window.__heysInitLoaderState = 'ready';
                }
                onReady();
                // 🆕 Держим watchdog heartbeat живым пока app не готов (sync/bootstrap могут занять >10s)
                // Без этого watchdog через 10s показывает recovery UI несмотря на активную загрузку
                (function keepHeartbeat() {
                    if (window.__heysAppReady) return;
                    window.__heysLoadingHeartbeat = Date.now();
                    setTimeout(keepHeartbeat, 2000);
                })();
                return;
            }

            reactCheckCount++;
            // Логируем каждые 50 проверок чтобы не спамить консоль
            if (reactCheckCount % 50 === 0) {
                bootLog('waiting #' + reactCheckCount + ' React:' + checkReactReady() + ' HEYS:' + checkHeysReady());
            }

            // 🆕 Защита от зависания — макс 300 попыток (30 секунд)
            // На throttled сетях скрипты грузятся долго, 5s недостаточно
            if (reactCheckCount > 300) {
                console.error('[HEYS] ❌ Timeout waiting for dependencies!');
                console.error('React ready:', checkReactReady());
                console.error('HEYS ready:', checkHeysReady());

                // Детальная диагностика отсутствующих модулей
                const missing = [];
                if (!HEYS.DayTab) missing.push('DayTab');
                if (!HEYS.Ration) missing.push('Ration');
                if (!HEYS.UserTab) missing.push('UserTab');
                if (!HEYS.AppRootImpl) missing.push('AppRootImpl');
                if (!HEYS.AppRootComponent) missing.push('AppRootComponent');
                console.error('Missing modules:', missing.join(', ') || 'none');

                bootLog('TIMEOUT! Missing: ' + (missing.join(', ') || 'unknown'));

                showRecoveryUI(missing.length
                    ? `Не загружены модули: ${missing.join(', ')}`
                    : 'Превышено время ожидания загрузки'
                );
                return;
            }

            setTimeout(() => waitForDependencies(onReady), INIT_RETRY_DELAY);
        };

        if (!checkReactReady()) {
            retryInit();
            return;
        }
        if (!checkHeysReady()) {
            retryInit();
            return;
        }

        waitForDependencies(initializeApp);
    };
})();


/* ===== heys_app_ui_state_v1.js ===== */
// heys_app_ui_state_v1.js — consolidated UI state (auth + dropdown + shortcuts)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppUIState = HEYS.AppUIState || {};

    const U = HEYS.utils || {};

    const readGlobalValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) return stored;
            }
            const raw = localStorage.getItem(key);
            if (raw !== null && raw !== undefined) return raw;
            if (U.lsGet) return U.lsGet(key, fallback);
            return fallback;
        } catch {
            return fallback;
        }
    };

    const getModule = HEYS._getModule || function (name, fallback) {
        return HEYS[name] || fallback || {};
    };

    HEYS.AppUIState.useAppUIState = function ({
        React,
        cloudSignIn,
        cloudSignOut,
        setTab,
        setNotification,
        skipTabSwitchRef,
    }) {
        const { useState, useEffect, useCallback } = React;
        const shortcutsModule = getModule('AppShortcuts');

        // Login form state (нужно до gate!)
        const [email, setEmail] = useState('');
        const [pwd, setPwd] = useState('');
        const [rememberMe, setRememberMe] = useState(() => {
            // Восстанавливаем checkbox из localStorage
            return readGlobalValue('heys_remember_me', 'false') === 'true';
        });

        const handleSignIn = useCallback(() => {
            return cloudSignIn(email, pwd, { rememberMe });
        }, [cloudSignIn, email, pwd, rememberMe]);

        const handleSignOut = useCallback(async () => {
            try {
                if (window.HEYS) {
                    window.HEYS._isLoggingOut = true;
                }
                if (window.HEYS?.cloud?.isPinAuthClient?.() && window.HEYS?.auth?.logout) {
                    await window.HEYS.auth.logout();
                }
            } catch (e) {
                console.warn('[HEYS] Logout failed:', e);
            } finally {
                try {
                    await cloudSignOut();
                } catch (e) {
                    console.warn('[HEYS] Cloud signOut failed:', e);
                }
                if (window.HEYS) {
                    window.HEYS._isLoggingOut = false;
                }
            }
        }, [cloudSignOut]);

        const [clientSearch, setClientSearch] = useState(''); // Поиск клиентов
        const [showClientDropdown, setShowClientDropdown] = useState(false); // Dropdown в шапке
        const [newPhone, setNewPhone] = useState('');
        const [newPin, setNewPin] = useState('');

        // Закрытие dropdown по Escape
        useEffect(() => {
            const handleEscape = (e) => {
                if (e.key === 'Escape' && showClientDropdown) {
                    setShowClientDropdown(false);
                }
            };
            if (showClientDropdown) {
                document.addEventListener('keydown', handleEscape);
                return () => document.removeEventListener('keydown', handleEscape);
            }
        }, [showClientDropdown]);

        useEffect(() => {
            if (!shortcutsModule.handleShortcuts) return;
            return shortcutsModule.handleShortcuts({
                setTab,
                setNotification,
                skipTabSwitchRef,
            });
        }, [setTab, setNotification, skipTabSwitchRef, shortcutsModule]);

        const uiState = {
            email,
            setEmail,
            pwd,
            setPwd,
            rememberMe,
            setRememberMe,
            handleSignIn,
            handleSignOut,
            clientSearch,
            setClientSearch,
            showClientDropdown,
            setShowClientDropdown,
            newPhone,
            setNewPhone,
            newPin,
            setNewPin,
        };

        return uiState;
    };
})();


/* ===== heys_cascade_card_v1.js ===== */
// heys_cascade_card_v1.js — Cascade Card — «Ваш позитивный каскад»
// Standalone компонент. Визуализация цепочки здоровых решений в реальном времени.
// v3.6.0 | 2026-02-25 — CRS base+todayBoost, goal-aware calorie penalty, chronotype-adaptive
// Фильтр в консоли: [HEYS.cascade]
if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // ─────────────────────────────────────────────────────
  // КОНСТАНТЫ
  // ─────────────────────────────────────────────────────

  const STATES = {
    EMPTY: 'EMPTY',
    BUILDING: 'BUILDING',
    GROWING: 'GROWING',
    STRONG: 'STRONG',
    BROKEN: 'BROKEN',
    RECOVERY: 'RECOVERY'
  };

  const STATE_CONFIG = {
    EMPTY: { icon: '🌅', color: '#94a3b8', label: 'Начни день' },
    BUILDING: { icon: '🔗', color: '#3b82f6', label: 'Импульс формируется' },
    GROWING: { icon: '⚡', color: '#22c55e', label: 'Каскад набирает силу' },
    STRONG: { icon: '🔥', color: '#eab308', label: 'Устойчивый импульс' },
    BROKEN: { icon: '💪', color: '#f59e0b', label: 'Начни с малого' },
    RECOVERY: { icon: '🌱', color: '#0ea5e9', label: 'Возвращение' }
  };

  const MESSAGES = {
    BUILDING: [
      { short: 'Импульс формируется. Позитивные действия начинают складываться.' },
      { short: 'Первые дни — самые важные. Каждое решение закладывает фундамент.' }
    ],
    GROWING: [
      { short: 'Каскад набирает силу. Позитивные действия накапливаются день за днём.' },
      { short: 'На восходящей. Каждый хороший день поднимает тебя выше.' },
      { short: 'Прогресс виден. Ещё немного — и импульс станет устойчивым.' }
    ],
    STRONG: [
      { short: 'Устойчивый импульс. Ты на пике — каждый день поддерживает привычку.' },
      { short: 'Мощная инерция. Даже небольшой сбой не перечеркнёт твой прогресс.' },
      { short: 'Система работает. Две+ недели позитивных решений — это уже фундамент.' }
    ],
    BROKEN: [
      { short: 'Начни с малого — каждое действие запускает новый каскад.' },
      { short: 'Нулевой импульс — это чистый старт. Первый день строит всё остальное.' },
      { short: 'Не всё или ничего. Даже 70% хороших решений — отличный день.' }
    ],
    RECOVERY: [
      { short: 'Один шаг назад не отменяет неделю прогресса. Ты уже возвращаешься.' },
      { short: 'Импульс снизился, но не обнулился. Один хороший день — и ты на пути.' },
      { short: 'После перерыва каждое решение имеет значение. Ты уже на пути.' }
    ],
    ANTI_LICENSING: [
      { short: 'Тренировка — сама по себе победа. Не «награждай» себя едой.' },
      { short: 'После нагрузки организм лучше всего усвоит белок и овощи.' },
      { short: 'Классная тренировка! Выбери качество, а не количество.' }
    ],
    // v3.1.0: показывается при перебор калорий в режиме дефицита (похудение)
    // Акцент — CRS защитил инерцию, один срыв не перечёркивает прогресс
    DEFICIT_OVERSHOOT: [
      { short: 'Перебор, но накопленный прогресс защищает тебя. Завтра — новый шанс.' },
      { short: 'Один перебор не перечёркивает неделю дисциплины. Импульс сохранён.' },
      { short: 'Перебрал — бывает. Посмотри на свою неделю: ты справляешься.' },
      { short: 'Калории выше цели, но каскад инерции на твоей стороне.' }
    ]
  };

  const EVENT_ICONS = {
    meal: '🥗',
    training: '💪',
    household: '🏠',
    sleep: '😴',
    checkin: '⚖️',
    measurements: '📏',
    steps: '🚶',
    supplements: '💊',
    insulin: '⚡'
  };

  // ─────────────────────────────────────────────────────
  // СИСТЕМА СКОРИНГА v2.1.0 — Continuous Scientific Scoring
  // 10 факторов с непрерывными функциями + 3 метасистемы.
  // Personalized baselines (14-day median), confidence layer,
  // day-type awareness, cross-factor synergies.
  // Хороший день: meals(3.0) + training(2.5) + sleep(1.5) + steps(1.0) + synergies(0.9) ≈ 8.9
  // Отличный: meals(4.5) + training(3.0) + sleep(2.5) + steps(1.3) + synergies(1.3) ≈ 12.6
  // ─────────────────────────────────────────────────────

  // [LEGACY FALLBACK] — v2.0.0 step-function weights, used only in meal quality fallback
  const EVENT_WEIGHTS = {
    // Еда: вес через getMealQualityScore (0–100)
    meal_positive: 1.0,   // Фолбэк при недоступном getMealQualityScore
    meal_negative: -1.0,  // Жёсткое нарушение
    // Бытовая активность (householdMin)
    household_high: 1.0,  // ≥ 60 мин
    household_mid: 0.5,   // 30-59 мин
    household_low: 0.2,   // 10-29 мин
    // Тренировка (по длительности)
    training_60plus: 2.5, // ≥ 60 мин
    training_45: 2.0,     // 45-59 мин
    training_30: 1.5,     // 30-44 мин
    training_15: 1.0,     // 15-29 мин
    training_short: 0.5,  // 1-14 мин
    // Сон (время отбоя)
    sleep_onset_good: 1.0,   // ≤ 22:00
    sleep_onset_ok: 0.5,     // 22:01-23:00
    sleep_onset_neutral: 0.0, // 23:01-00:00
    sleep_onset_bad: -1.0,   // 00:01-01:00
    sleep_onset_worse: -1.5, // 01:01-02:00
    sleep_onset_worst: -2.0, // > 02:00
    // Сон (длительность)
    sleep_dur_ideal: 1.0,  // 7.0-8.5 ч
    sleep_dur_ok: 0.3,     // 6.0-6.9 / 8.6-9.5 ч
    sleep_dur_low: -0.5,   // 5.0-5.9 ч
    sleep_dur_over: -0.3,  // 9.6-10.5 ч
    sleep_dur_very_low: -1.5, // < 5.0 ч
    sleep_dur_too_long: -0.5, // > 10.5 ч
    // Чекин
    checkin: 0.5,
    // Измерения
    measurements_today: 1.0,
    measurements_old: -0.1,       // 8-14 дней назад
    measurements_very_old: -0.3,  // > 14 дней назад
    // Шаги
    steps_great: 1.0,   // ≥ 120%
    steps_full: 0.7,    // 100-119%
    steps_partial: 0.3, // 70-99%
    steps_half: 0.0,    // 50-69%
    steps_low: -0.3,    // < 50% (не 0)
    // Витамины/добавки
    supplements_all: 0.5,
    supplements_half: 0.2,
    supplements_poor: -0.2,
    // Инсулиновые волны
    insulin_gap_great: 1.0,   // avgGap ≥ 240 мин
    insulin_gap_good: 0.5,    // 180-239 мин
    insulin_gap_ok: 0.2,      // 120-179 мин
    insulin_night_long: 0.5,  // ночной пост ≥ 14 ч
    insulin_night_mid: 0.3,   // 12-13 ч
    insulin_night_short: 0.1, // 10-11 ч
    insulin_overlap_high: -0.5,
    insulin_overlap_med: -0.3,
    insulin_overlap_low: -0.1
  };

  // ─────────────────────────────────────────────────────
  // v2.1.0 SCORING CONSTANTS
  // ─────────────────────────────────────────────────────

  const INTENSITY_MULTIPLIERS = {
    hiit: 1.8, strength: 1.5, cardio: 1.2,
    yoga: 0.8, stretching: 0.6, walk: 0.5
  };

  const CIRCADIAN_MEAL_MODIFIERS = [
    { start: 360, end: 600, mult: 1.3 },    // 06:00–10:00 breakfast
    { start: 600, end: 840, mult: 1.0 },    // 10:00–14:00 lunch
    { start: 840, end: 1080, mult: 0.9 },   // 14:00–18:00 snack
    { start: 1080, end: 1260, mult: 0.85 }, // 18:00–21:00 dinner
    { start: 1260, end: 1380, mult: 0.7 }   // 21:00–23:00 late dinner
  ];

  const POPULATION_DEFAULTS = {
    householdMin: 30,
    sleepOnsetMins: 1380, // 23:00
    sleepHours: 7.5,
    steps: 7000,
    weeklyTrainingLoad: 200
  };

  const SCORE_THRESHOLDS = {
    STRONG: 8.0,    // Мощный день
    GROWING: 4.5,   // Каскад растёт
    BUILDING: 1.5   // Начало
  };

  const MOMENTUM_TARGET = 8.5; // score при 100% прогресс-бара (v3.5.0: снижен с 10.0 для реалистичного DCS при 4-5 факторах)

  // v2.2.0: Soft chain — penalty tiers by event severity
  // Minor (weight ≥ -0.5): -1 link, Medium (-1.5 ≤ w < -0.5): -2 links, Severe (w < -1.5): -3 links
  const CHAIN_PENALTY = { MINOR: 1, MEDIUM: 2, SEVERE: 3 };
  const CHAIN_PENALTY_THRESHOLDS = { MEDIUM: -0.5, SEVERE: -1.5 };

  function getChainPenalty(weight) {
    if (weight < CHAIN_PENALTY_THRESHOLDS.SEVERE) return CHAIN_PENALTY.SEVERE;
    if (weight < CHAIN_PENALTY_THRESHOLDS.MEDIUM) return CHAIN_PENALTY.MEDIUM;
    return CHAIN_PENALTY.MINOR;
  }

  // ─────────────────────────────────────────────────────
  // v3.7.0 CRS (Cascade Rate Score) CONSTANTS
  // ─────────────────────────────────────────────────────

  const CRS_DECAY = 0.95;            // EMA decay factor (α) (half-life ~14d)
  const CRS_WINDOW = 30;             // days for EMA computation
  const CRS_DCS_CLAMP_NEG = -0.3;    // inertia protection for normal bad days
  const CRS_TODAY_BOOST = 0.03;      // today's DCS positive contribution (max +3%)
  const CRS_TODAY_PENALTY = 0.10;    // v3.7.0: intraday severe penalty (max -10%)
  const CRS_NEGATIVE_GRAVITY = 2.0;  // v3.7.0: bad days are weighted heavier in EMA
  const CRS_CEILING_BASE = 0.65;     // starting ceiling for all users
  const CRS_KEY_VERSION = 'v8';      // localStorage schema version (v8: asymmetric penalty)
  const CRS_PREV_KEY_VERSION = 'v7'; // for migration detection

  const CRS_THRESHOLDS = {
    STRONG: 0.75,    // Устойчивый импульс
    GROWING: 0.45,   // Каскад набирает силу
    BUILDING: 0.20,  // Импульс формируется
    RECOVERY: 0.05   // Возвращение (> 0.05)
  };

  // ─────────────────────────────────────────────────────
  // УТИЛИТЫ
  // ─────────────────────────────────────────────────────

  function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return null;
    return parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }

  function formatTimeShort(timeStr) {
    if (!timeStr) return '—';
    const parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return '—';
    return `${parts[1].padStart(2, '0')}:${parts[2]}`;
  }

  function pickMessage(pool, poolKey) {
    if (!pool || !pool.length) return { short: '' };
    const hour = new Date().getHours();
    const idx = hour % pool.length;
    const msg = pool[idx];
    console.info('[HEYS.cascade] 💬 Message selected:', {
      pool: poolKey || 'UNKNOWN',
      index: idx,
      poolSize: pool.length,
      message: msg.short
    });
    return msg;
  }

  function isWithinHours(timeStr, hours) {
    const mins = parseTime(timeStr);
    if (mins === null) return false;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const diff = nowMins - mins;
    return diff >= 0 && diff <= hours * 60;
  }

  function getMealLabel(meal, index) {
    const time = parseTime(meal && meal.time);
    if (time !== null) {
      if (time < 600) return 'Ранний приём';
      if (time < 660) return 'Завтрак';
      if (time < 720) return 'Поздний завтрак';
      if (time < 840) return 'Обед';
      if (time < 1020) return 'Перекус';
      if (time < 1200) return 'Ужин';
      return 'Поздний приём';
    }
    const labels = ['Завтрак', 'Обед', 'Перекус', 'Ужин'];
    return labels[index] || ('Приём ' + (index + 1));
  }

  function checkMealHarm(meal, pIndex) {
    if (!meal || !meal.items || !pIndex) return false;
    for (var i = 0; i < meal.items.length; i++) {
      var item = meal.items[i];
      var product = (HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(item, pIndex))
        || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(item, pIndex));
      if (product && (product.harm || 0) >= 7) return true;
    }
    return false;
  }

  // Загружает N предыдущих дней из localStorage (для стрик-штрафов и истории измерений)
  function getPreviousDays(n) {
    var result = [];
    var nullDates = [];
    var U = HEYS.utils;
    var clientId = (U && U.getCurrentClientId && U.getCurrentClientId()) || HEYS.currentClientId || '';
    for (var i = 1; i <= n; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var ds = d.toISOString().slice(0, 10);
      var key = clientId ? 'heys_' + clientId + '_dayv2_' + ds : 'heys_dayv2_' + ds;
      try {
        var raw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(key, null) : localStorage.getItem(key);
        if (raw) {
          result.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } else {
          result.push(null);
          nullDates.push(ds);
        }
      } catch (e) {
        result.push(null);
        nullDates.push(ds + '(err)');
      }
    }
    if (nullDates.length > 0) {
      console.warn('[HEYS.cascade] ⚠️ getPreviousDays: ' + nullDates.length + '/' + n + ' days missing from localStorage:', nullDates.join(', '));
    }
    return result; // array[0] = yesterday, array[n-1] = n days ago
  }

  // ─────────────────────────────────────────────────────
  // HELPER: buildDayEventsSimple — лёгкие события для истории
  // Строит массив событий из любого day-объекта без сложного скоринга
  // ─────────────────────────────────────────────────────

  function buildDayEventsSimple(dayObj, mealBandShift) {
    var evts = [];
    if (!dayObj) return evts;
    var shift = mealBandShift || 0;

    // Checkin (вес)
    if ((dayObj.weightMorning || 0) > 0) {
      evts.push({
        type: 'checkin', icon: EVENT_ICONS.checkin, positive: true, weight: 0.5,
        time: null, sortKey: 0,
        label: 'Вес ' + (+dayObj.weightMorning).toFixed(1) + ' кг'
      });
    }

    // Приёмы пищи
    var hMeals = dayObj.meals || [];
    for (var hmi = 0; hmi < hMeals.length; hmi++) {
      var hm = hMeals[hmi];
      var hmt = parseTime(hm && hm.time);
      var normalizedHmt = hmt;
      if (normalizedHmt !== null && normalizedHmt < 360) normalizedHmt += 1440;
      var isHardViolation = normalizedHmt !== null && normalizedHmt >= (1380 + shift);
      var isLateMeal = normalizedHmt !== null && normalizedHmt >= (1260 + shift) && !isHardViolation;

      var weight = 0.4;
      if (isHardViolation) weight = -1.0;
      else if (isLateMeal) weight = 0.7;

      evts.push({
        type: 'meal', icon: EVENT_ICONS.meal,
        positive: !isHardViolation, weight: weight,
        time: hm && hm.time, sortKey: hmt !== null ? hmt : 500,
        label: (hm && hm.name) || 'Приём пищи',
        breakReason: isHardViolation ? '⏰' : null
      });
    }

    // Тренировки
    var hTrains = dayObj.trainings || [];
    for (var hti = 0; hti < hTrains.length; hti++) {
      var htr = hTrains[hti];
      var htrMin = (htr && htr.durationMin) || 0;
      var htrSort = parseTime(htr && htr.startTime);
      evts.push({
        type: 'training', icon: EVENT_ICONS.training, positive: true, weight: 1.5,
        time: htr && htr.startTime, sortKey: htrSort !== null ? htrSort : 600,
        label: (htr && htr.type || 'Тренировка') + (htrMin ? ' ' + htrMin + ' мин' : '')
      });
    }

    // Сон
    if (dayObj.sleepStart) {
      var hslh = dayObj.sleepHours || 0;
      var hslEnd = dayObj.sleepEnd || null;
      // Fallback: вычислить sleepHours из sleepEnd если не задан
      if (!hslh && hslEnd) {
        var hsdm = parseTime(dayObj.sleepStart); var hedm = parseTime(hslEnd);
        if (hsdm !== null && hedm !== null) {
          if (hsdm < 360) hsdm += 1440;
          if (hedm <= hsdm) hedm += 1440;
          hslh = Math.round((hedm - hsdm) / 60 * 10) / 10;
        }
      }
      var hstRaw = parseTime(dayObj.sleepStart);
      // Нормализация: after-midnight (00:xx–05:xx) → +1440 для корректного isLateSleep
      var hst = hstRaw !== null ? (hstRaw < 360 ? hstRaw + 1440 : hstRaw) : null;
      var goodSleep = hslh >= 6 && hslh <= 9;
      // sortKey: after-midnight → отрицательный (до чекина)
      var hstSort = hstRaw !== null ? (hstRaw < 360 ? hstRaw - 1440 : hstRaw) : 1440;
      // Качественный лейбл + время конца + длительность
      // v3.3.0: labels aligned with v3.2.0 chronotype clamp (01:30)
      var hslOnsetLabel = hst === null ? 'Сон'
        : hst <= 1320 ? 'Ранний сон'
          : hst <= 1380 ? 'Сон до 23:00'
            : hst <= 1440 ? 'Сон до полуночи'
              : hst <= 1530 ? 'Поздний сон'  // 00:00-01:30: within chronotype clamp
                : hst <= 1620 ? 'Очень поздний сон'  // 01:30-03:00
                  : 'Критически поздний сон';  // >03:00 (hard floor zone)
      var hslLabel = hslOnsetLabel;
      if (hslEnd) hslLabel += ' →' + hslEnd;
      if (hslh > 0) hslLabel += ' (' + hslh.toFixed(1) + 'ч)';
      // v3.3.0: graduated sleep weights matching v3.2.0 sigmoid direction
      // instead of hardcoded -1.0 for everything ≥ 23:00
      var hslWeight;
      if (hst === null) { hslWeight = 0; }
      else if (hst <= 1380) { hslWeight = goodSleep ? 0.8 : -0.3; }   // ≤23:00: early
      else if (hst <= 1440) { hslWeight = goodSleep ? 0.3 : -0.1; }   // 23:00–00:00
      else if (hst <= 1530) { hslWeight = goodSleep ? 0.0 : -0.2; }   // 00:00–01:30 (within chronotype clamp)
      else if (hst <= 1620) { hslWeight = goodSleep ? -0.3 : -0.5; }  // 01:30–03:00
      else if (hst <= 1680) { hslWeight = -1.0; }                      // 03:00–04:00 (near hard floor)
      else { hslWeight = -2.0; }                                       // >04:00 catastrophe
      var hslPositive = hslWeight >= 0;
      evts.push({
        type: 'sleep', icon: hslPositive ? EVENT_ICONS.sleep : '🌙',
        positive: hslPositive,
        weight: hslWeight,
        time: dayObj.sleepStart, timeEnd: hslEnd, sleepHours: hslh,
        sortKey: hstSort,
        label: hslLabel,
        breakReason: hslWeight < -0.5 ? '⏰' : null
      });
    }

    // Шаги
    if ((dayObj.steps || 0) > 1000) {
      evts.push({
        type: 'steps', icon: EVENT_ICONS.steps,
        positive: dayObj.steps >= 7500, weight: dayObj.steps >= 7500 ? 0.8 : 0.2,
        time: null, sortKey: 650,
        label: (+dayObj.steps).toLocaleString('ru') + ' шагов'
      });
    }

    // Бытовая активность
    if ((dayObj.householdMin || 0) > 0) {
      evts.push({
        type: 'household', icon: EVENT_ICONS.household, positive: true, weight: 0.4,
        time: null, sortKey: 599,
        label: 'Бытовая ' + dayObj.householdMin + ' мин'
      });
    }

    // Измерения
    if (dayObj.measurements && Object.keys(dayObj.measurements).some(function (k) { return dayObj.measurements[k] > 0; })) {
      evts.push({
        type: 'measurements', icon: EVENT_ICONS.measurements, positive: true, weight: 0.5,
        time: null, sortKey: 1,
        label: 'Замеры тела'
      });
    }

    evts.sort(function (a, b) { return a.sortKey - b.sortKey; });
    return evts;
  }

  function getDateLabel(offsetFromToday) {
    if (offsetFromToday === 1) return 'Вчера';
    var MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    var DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    var d = new Date();
    d.setDate(d.getDate() - offsetFromToday);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  // ─────────────────────────────────────────────────────
  // v2.1.0 MATH UTILITIES
  // ─────────────────────────────────────────────────────

  function clamp(val, lo, hi) {
    return val < lo ? lo : val > hi ? hi : val;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    var variance = arr.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / arr.length;
    return Math.sqrt(variance);
  }

  // ─────────────────────────────────────────────────────
  // v3.1.0: GOAL-AWARE CALORIE PENALTY HELPER
  // Определяет режим цели по deficitPctTarget из профиля.
  // Переиспользует логику getGoalMode из heys_advice_bundle_v1.js
  // с приоритетом на HEYS.advice.getGoalMode при наличии.
  // ─────────────────────────────────────────────────────

  function getGoalMode(deficitPct) {
    // Попробуем взять из advice bundle если доступен
    if (HEYS.advice && typeof HEYS.advice.getGoalMode === 'function') {
      return HEYS.advice.getGoalMode(deficitPct);
    }
    // Локальная копия (зеркало heys_advice_bundle_v1.js)
    var pct = deficitPct || 0;
    if (pct <= -10) {
      return {
        mode: 'deficit', label: 'Похудение', emoji: '🔥',
        targetRange: { min: 0.90, max: 1.05 }, criticalOver: 1.15, criticalUnder: 0.80
      };
    } else if (pct <= -5) {
      return {
        mode: 'deficit', label: 'Лёгкое похудение', emoji: '🎯',
        targetRange: { min: 0.92, max: 1.08 }, criticalOver: 1.20, criticalUnder: 0.75
      };
    } else if (pct >= 10) {
      return {
        mode: 'bulk', label: 'Набор массы', emoji: '💪',
        targetRange: { min: 0.95, max: 1.10 }, criticalOver: 1.25, criticalUnder: 0.85
      };
    } else if (pct >= 5) {
      return {
        mode: 'bulk', label: 'Лёгкий набор', emoji: '💪',
        targetRange: { min: 0.93, max: 1.12 }, criticalOver: 1.20, criticalUnder: 0.80
      };
    } else {
      return {
        mode: 'maintenance', label: 'Поддержание', emoji: '⚖️',
        targetRange: { min: 0.90, max: 1.10 }, criticalOver: 1.25, criticalUnder: 0.70
      };
    }
  }

  function getPersonalBaseline(prevDays, extractor, defaultVal) {
    var values = [];
    for (var i = 0; i < prevDays.length; i++) {
      if (!prevDays[i]) continue;
      var val = extractor(prevDays[i]);
      if (val != null && val > 0) values.push(val);
    }
    return values.length >= 3 ? median(values) : defaultVal;
  }

  function getFactorConfidence(prevDays, extractor) {
    var count = 0;
    for (var i = 0; i < prevDays.length; i++) {
      if (!prevDays[i]) continue;
      var val = extractor(prevDays[i]);
      if (val != null && val > 0) count++;
    }
    if (count >= 10) return 1.0;
    if (count >= 7) return 0.8;
    if (count >= 3) return 0.5;
    if (count >= 1) return 0.3;
    return 0.1;
  }

  function countConsecutive(prevDays, predicate) {
    var count = 0;
    for (var i = 0; i < prevDays.length; i++) {
      if (predicate(prevDays[i])) count++;
      else break;
    }
    return count;
  }

  function getCircadianMultiplier(timeMins, mealBandShift) {
    if (timeMins === null || timeMins === undefined) return 1.0;
    var shift = mealBandShift || 0;
    var normalizedTime = timeMins;
    if (normalizedTime < 360) normalizedTime += 1440;
    for (var i = 0; i < CIRCADIAN_MEAL_MODIFIERS.length; i++) {
      var mod = CIRCADIAN_MEAL_MODIFIERS[i];
      if (normalizedTime >= (mod.start + shift) && normalizedTime < (mod.end + shift)) return mod.mult;
    }
    return 1.0;
  }

  function getTrainingDuration(tr) {
    var dur = 0;
    if (tr && tr.z && Array.isArray(tr.z)) {
      dur = tr.z.reduce(function (a, b) { return a + (b || 0); }, 0);
    }
    if (!dur && tr && tr.duration) dur = tr.duration;
    if (!dur && tr && tr.type) {
      var typeDefaults = { cardio: 40, strength: 50, hiit: 30, yoga: 60, stretching: 30 };
      dur = typeDefaults[tr.type] || 40;
    }
    return dur || 40;
  }

  function getTrainingLoad(tr) {
    var dur = getTrainingDuration(tr);
    var type = (tr && tr.type) || '';
    var mult = INTENSITY_MULTIPLIERS[type] || 1.0;
    return dur * mult;
  }

  function buildInputSignature(day, normAbs, prof) {
    var meals = (day && day.meals) || [];
    var trainings = (day && day.trainings) || [];

    var mealsSig = meals.map(function (m) {
      var items = (m && m.items) || [];
      var gramsSum = items.reduce(function (acc, it) {
        return acc + (it.grams || it.g || 0);
      }, 0);
      // v5.0.2: Включаем kcal100 (× 10, округлённое) чтобы инвалидировать кэш
      // когда cascade batch обновляет нутриенты в localStorage
      var kcal100Sum = items.reduce(function (acc, it) {
        return acc + Math.round((it.kcal100 || 0) * 10);
      }, 0);
      return [m && m.time || '-', items.length, gramsSum, kcal100Sum].join('|');
    }).join(';');

    var trainingsSig = trainings.map(function (t) {
      return [t && t.time || '-', t && t.duration || 0].join('|');
    }).join(';');

    return [
      meals.length,
      mealsSig,
      trainings.length,
      trainingsSig,
      (day && day.water) || 0,
      (day && day.steps) || 0,
      (normAbs && normAbs.kcal) || 0,
      (prof && prof.water_norm) || 2000,
      (prof && (prof.stepsGoal || prof.steps_goal)) || 8000,
      // v2.0.0: новые факторы
      (day && day.householdMin) || 0,
      (day && day.sleepStart) || '',
      (day && day.sleepHours) || 0,
      (day && (day.weightMorning > 0 ? 1 : 0)) || 0,
      (day && day.measurements) ? JSON.stringify(day.measurements) : '',
      (day && day.supplementsTaken) ? day.supplementsTaken.length : 0,
      (day && day.supplementsPlanned) ? (Array.isArray(day.supplementsPlanned) ? day.supplementsPlanned.length : day.supplementsPlanned) : 0,
      (prof && prof.plannedSupplements) ? (Array.isArray(prof.plannedSupplements) ? prof.plannedSupplements.length : prof.plannedSupplements) : 0,
      // v10.0: day-update version — инвалидирует кэш после sync записал исторические дни
      _cascadeDayUpdateVersion
    ].join('::');
  }

  // ─────────────────────────────────────────────────────
  // v3.0.0 CRS (Cascade Rate Score) ENGINE
  // ─────────────────────────────────────────────────────

  function getCrsStorageKey(clientId) {
    return clientId
      ? 'heys_' + clientId + '_cascade_dcs_' + CRS_KEY_VERSION
      : 'heys_cascade_dcs_' + CRS_KEY_VERSION;
  }

  function loadDcsHistory(clientId) {
    var key = getCrsStorageKey(clientId);
    try {
      var raw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(key, null) : localStorage.getItem(key);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.warn('[HEYS.cascade.crs] ⚠️ Failed to load DCS history:', e && e.message);
    }

    // v7 migration: FULL PURGE — v6 used fixed 23:00 meal penalty and MT=10.0.
    // v7: chronotype-adaptive meal bands (optimalOnset shift) and MT=8.5.
    var prevVersions = ['v6', 'v5', 'v4', 'v3', 'v2', 'v1'];
    for (var pvi = 0; pvi < prevVersions.length; pvi++) {
      var oldKey = clientId
        ? 'heys_' + clientId + '_cascade_dcs_' + prevVersions[pvi]
        : 'heys_cascade_dcs_' + prevVersions[pvi];
      try {
        var oldRaw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(oldKey, null) : localStorage.getItem(oldKey);
        if (oldRaw) {
          var oldData = typeof oldRaw === 'string' ? JSON.parse(oldRaw) : oldRaw;
          var oldCount = Object.keys(oldData).length;
          console.info('[HEYS.cascade.crs] 🔄 DCS ' + prevVersions[pvi] + '→v7 migration: purging ' + oldCount + ' entries (v7 chronotype meals + MT=8.5)');
          // Clean up old key
          try {
            if (HEYS.store && HEYS.store.set) {
              HEYS.store.set(oldKey, null);
            } else {
              localStorage.removeItem(oldKey);
            }
          } catch (ignore) { }
          // Return empty — backfill will recalculate all days
          return {};
        }
      } catch (e) {
        console.warn('[HEYS.cascade.crs] ⚠️ ' + prevVersions[pvi] + '→v6 migration failed:', e && e.message);
      }
    }

    return {};
  }

  function saveDcsHistory(clientId, dcsMap) {
    var key = getCrsStorageKey(clientId);
    // Auto-cleanup: remove entries older than 35 days
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 35);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var cleaned = {};
    var dates = Object.keys(dcsMap);
    for (var i = 0; i < dates.length; i++) {
      if (dates[i] >= cutoffStr) {
        cleaned[dates[i]] = dcsMap[dates[i]];
      }
    }
    try {
      var json = JSON.stringify(cleaned);
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(key, json);
      } else {
        localStorage.setItem(key, json);
      }
    } catch (e) {
      console.warn('[HEYS.cascade.crs] ⚠️ Failed to save DCS history:', e && e.message);
    }
    return cleaned;
  }

  /**
   * Retroactive DCS estimation for days without full scoring.
   * v3.4.2: meal weights calibrated to match full algo output —
   *   daytime 1.10 (was 0.95), breakfast 1.25 (was 1.15), evening 0.70 (was 0.50).
   *   Missing-sleep default +0.3, calibrated synergy bonuses.
   *   Uses same daily-score scale (0–10) normalized by MOMENTUM_TARGET.
   *
   * @param {Object} day — day data object from localStorage (dayv2_*)
   * @param {Array}  prevDays — up to 14 preceding days (for chronotype baseline)
   * @returns {number|null} — estimated DCS (−0.3 … 1.0), or null if no data
   */
  function getRetroactiveDcs(day, prevDays) {
    if (!day) return null;
    var estScore = 0; // estimated daily score on 0–10+ scale

    // ── 0. Chronotype Baseline (for sleep and meals) ──
    var retroOnsetValues = [];
    var rpd = prevDays || [];
    for (var roi = 0; roi < rpd.length; roi++) {
      if (!rpd[roi] || !rpd[roi].sleepStart) continue;
      var roVal = parseTime(rpd[roi].sleepStart);
      if (roVal !== null) {
        if (roVal < 360) roVal += 1440;
        retroOnsetValues.push(roVal);
      }
    }
    if (day.sleepStart) {
      var slMins = parseTime(day.sleepStart);
      if (slMins !== null) {
        if (slMins < 360) slMins += 1440;
        retroOnsetValues.push(slMins);
      }
    }
    var retroPersonalOnset = retroOnsetValues.length >= 3
      ? median(retroOnsetValues)
      : POPULATION_DEFAULTS.sleepOnsetMins;
    var retroOptimalOnset = Math.max(1290, Math.min(retroPersonalOnset, 1530)); // clamp 21:30–01:30
    var mealBandShift = Math.max(-30, retroOptimalOnset - 1380); // clamp lower bound to 22:30

    // ── 1. Meals: time-band scoring (v3.5.0 — chronotype-adaptive) ──
    // Full algo uses getMealQualityScore (0–100) → clamp((qs-40)/40) × circadian.
    // Verified: today full algo gives ~1.05–1.20 per quality meal.
    // v3.5.0: chronotype-adaptive bands (shifted by mealBandShift).
    var meals = day.meals || [];
    var retroMealCount = 0; // count positive meals for synergy check
    for (var lmi = 0; lmi < meals.length; lmi++) {
      var lmt = parseTime(meals[lmi] && meals[lmi].time);
      var mealContrib;
      if (lmt !== null) {
        var normalizedLmt = lmt;
        if (normalizedLmt < 360) normalizedLmt += 1440;

        if (normalizedLmt >= 1380 + mealBandShift) {
          // ≥ 23:00 (shifted): hard violation
          mealContrib = -1.0;
        } else if (normalizedLmt >= 1260 + mealBandShift) {
          // 21:00–23:00 (shifted): circadian ×0.7
          mealContrib = 0.70;
          retroMealCount++;
        } else if (normalizedLmt < 600 + mealBandShift) {
          // Breakfast < 10:00 (shifted): circadian ×1.3
          mealContrib = 1.25;
          retroMealCount++;
        } else {
          // Normal daytime meal
          mealContrib = 1.10;
          retroMealCount++;
        }
      } else {
        // No time data: assume decent-quality daytime meal
        mealContrib = 0.90;
        retroMealCount++;
      }
      estScore += mealContrib;
    }

    // ── 2. Training: load-aware scoring (approximate ШАГ 3) ──
    var trains = day.trainings || [];
    var retroHasTraining = trains.length > 0;
    if (trains.length > 0) {
      var firstLoad = getTrainingLoad(trains[0]);
      // sqrt-curve like full algo: clamp(sqrt(load/30)*1.2, 0.3, 3.0)
      estScore += clamp(Math.sqrt(Math.max(firstLoad, 30) / 30) * 1.2, 0.5, 2.5);
      // Diminishing returns for additional sessions (v3.4.1: 3rd+ at ×0.25)
      if (trains.length > 1) {
        var secondLoad = getTrainingLoad(trains[1]);
        estScore += clamp(Math.sqrt(Math.max(secondLoad, 20) / 30) * 0.6, 0.2, 1.0);
      }
      for (var rti = 2; rti < trains.length; rti++) {
        var addLoad = getTrainingLoad(trains[rti]);
        estScore += clamp(Math.sqrt(Math.max(addLoad, 20) / 30) * 0.3, 0.1, 0.5);
      }
    }

    // ── 3. Sleep onset: sigmoid matching full ШАГ 4 ──
    if (day.sleepStart) {
      var slMins = parseTime(day.sleepStart);
      if (slMins !== null) {
        if (slMins < 360) slMins += 1440; // normalize after-midnight

        // v3.5.0: Chronotype baseline pre-calculated at step 0
        // Same sigmoid formula as full algo v3.2.0
        var retroOnsetDev = slMins - retroOptimalOnset;
        var retroOnsetWeight = -Math.tanh(retroOnsetDev / 60) * 1.5 + 0.5;
        retroOnsetWeight = clamp(retroOnsetWeight, -2.0, 1.2);

        // Hard floor: > 04:00 = catastrophe
        if (slMins > 1680) retroOnsetWeight = -2.0;

        estScore += retroOnsetWeight;
      }
    } else {
      // v3.4.2: missing sleep data — user probably slept but data gap.
      // Give small neutral default instead of 0 (data gap ≠ bad behavior).
      estScore += 0.3;
    }

    // ── 4. Sleep duration: bell-curve matching full ШАГ 5 ──
    var slH = day.sleepHours || 0;
    // Fallback: compute from sleepStart + sleepEnd if available
    if (!slH && day.sleepStart && day.sleepEnd) {
      var sFm = parseTime(day.sleepStart);
      var eFm = parseTime(day.sleepEnd);
      if (sFm !== null && eFm !== null) {
        if (eFm < sFm) eFm += 1440;
        slH = (eFm - sFm) / 60;
      }
    }
    if (slH > 0) {
      // Personal optimal from prevDays median (mirrors full algo)
      var retroSleepVals = [];
      var rpds = prevDays || [];
      for (var rsi = 0; rsi < rpds.length; rsi++) {
        if (rpds[rsi] && rpds[rsi].sleepHours > 0) retroSleepVals.push(rpds[rsi].sleepHours);
      }
      var retroSleepOpt = retroSleepVals.length >= 3
        ? clamp(median(retroSleepVals), 6.0, 9.0)
        : POPULATION_DEFAULTS.sleepHours;

      // Bell curve: 1.5 × exp(−dev²/(2×0.8²)) − 0.5
      var slDev = Math.abs(slH - retroSleepOpt);
      var slWeight = 1.5 * Math.exp(-(slDev * slDev) / (2 * 0.8 * 0.8)) - 0.5;
      // Asymmetry: undersleep 1.3× worse
      if (slH < retroSleepOpt) slWeight *= 1.3;
      slWeight = clamp(slWeight, -2.0, 1.5);
      // Hard limits
      if (slH < 4.0) slWeight = -2.0;
      else if (slH > 12.0) slWeight = -0.5;

      estScore += slWeight;
    }

    // ── 5. Steps: tanh matching full ШАГ 6 ──
    var retSteps = day.steps || 0;
    if (retSteps > 0) {
      var retStepsGoal = 8000; // population default
      // Use prevDays rolling avg if available
      var retStepVals = [];
      var rpst = prevDays || [];
      for (var sti = 0; sti < rpst.length; sti++) {
        if (rpst[sti] && rpst[sti].steps > 0) retStepVals.push(rpst[sti].steps);
      }
      if (retStepVals.length >= 5) {
        var retStepAvg = retStepVals.reduce(function (a, b) { return a + b; }, 0) / retStepVals.length;
        retStepsGoal = Math.max(5000, retStepAvg * 1.05);
      }
      var stRatio = retSteps / retStepsGoal;
      var stWeight = clamp(Math.tanh((stRatio - 0.6) * 2.5) * 1.0 + 0.15, -0.5, 1.3);
      estScore += stWeight;
    }

    // ── 6. Checkin: streak-aware scoring (v3.4.1 — matches full ШАГ 7) ──
    if (day.weightMorning > 0) {
      var retroCheckinStreak = 0;
      var rpdCk = prevDays || [];
      for (var cki = 0; cki < rpdCk.length; cki++) {
        if (rpdCk[cki] && rpdCk[cki].weightMorning > 0) retroCheckinStreak++;
        else break;
      }
      var retroStreakBonus = Math.min(0.5, retroCheckinStreak * 0.05);
      estScore += Math.min(0.8, 0.3 + retroStreakBonus);
    }

    // ── 7. Household: log2-relative with adaptive baseline (v3.4.1) ──
    var retHM = day.householdMin || 0;
    if (retHM > 0) {
      // Use prevDays baseline if available (mirrors full algo getPersonalBaseline)
      var retHMbaseline = 30; // population default
      var hmHistVals = [];
      var rpdHM = prevDays || [];
      for (var hmi = 0; hmi < rpdHM.length; hmi++) {
        if (rpdHM[hmi] && rpdHM[hmi].householdMin > 0) hmHistVals.push(rpdHM[hmi].householdMin);
      }
      if (hmHistVals.length >= 3) retHMbaseline = median(hmHistVals);
      var retHMratio = retHM / retHMbaseline;
      var hmWeight = clamp(Math.log2(retHMratio + 0.5) * 0.8, -0.5, 1.2);
      estScore += hmWeight;
    }

    // ── 8. Supplements: simple ratio ──
    var retSuppTaken = day.supplementsTaken || 0;
    var retSuppPlanned = day.supplementsPlanned || 0;
    if (retSuppPlanned > 0) {
      var suppRatio = (typeof retSuppTaken === 'number' ? retSuppTaken : (Array.isArray(retSuppTaken) ? retSuppTaken.length : 0))
        / (typeof retSuppPlanned === 'number' ? retSuppPlanned : (Array.isArray(retSuppPlanned) ? retSuppPlanned.length : 0));
      estScore += clamp(suppRatio * 0.7 - 0.1, -0.3, 0.5);
    }

    // ── 9. Insulin wave approximation (meal gap proxy) ──
    // Can approximate from meal times: good gaps → bonus
    if (meals.length >= 2) {
      var mealTimes = [];
      for (var mti = 0; mti < meals.length; mti++) {
        var mtVal = parseTime(meals[mti] && meals[mti].time);
        if (mtVal !== null) mealTimes.push(mtVal);
      }
      mealTimes.sort(function (a, b) { return a - b; });
      if (mealTimes.length >= 2) {
        var avgGap = 0;
        for (var gi = 1; gi < mealTimes.length; gi++) {
          avgGap += mealTimes[gi] - mealTimes[gi - 1];
        }
        avgGap /= (mealTimes.length - 1);
        // Good gaps (≥ 150 min) → small bonus, poor gaps → small penalty
        var gapWeight = clamp((avgGap - 120) / 180 * 0.5, -0.3, 0.5);
        estScore += gapWeight;
      }
    }

    // ── 10. Measurements: approximate full algo ШАГ 8 ──
    var retMeas = (day && day.measurements) || null;
    var retMeasKeys = retMeas ? Object.keys(retMeas).filter(function (k) { return retMeas[k] > 0; }) : [];
    if (retMeasKeys.length > 0) {
      var retMeasCompleteness = retMeasKeys.length / 4; // 4 measurements: waist, hips, thigh, biceps
      estScore += clamp(0.5 + retMeasCompleteness * 0.7, 0, 1.2);
    }

    // ── 11. Cross-factor synergy approximation (v3.4.2) ──
    // Full algo awards up to +1.3 for specific combos (sleep_recovery, neat_steps,
    // meals_insulin, morning_ritual, full_recovery). Approximate by factor count.
    var retroPositiveFactors = 0;
    if (retroMealCount >= 3) retroPositiveFactors++;
    if (retroHasTraining) retroPositiveFactors++;
    if (slH >= 6.5) retroPositiveFactors++;
    if (retSteps > 0) retroPositiveFactors++;
    if (day.weightMorning > 0) retroPositiveFactors++;
    if (retHM > 0) retroPositiveFactors++;
    var retroSynergyBonus = 0;
    if (retroPositiveFactors >= 6) retroSynergyBonus = 0.80;
    else if (retroPositiveFactors >= 5) retroSynergyBonus = 0.65;
    else if (retroPositiveFactors >= 4) retroSynergyBonus = 0.45;
    else if (retroPositiveFactors >= 3) retroSynergyBonus = 0.25;
    estScore += retroSynergyBonus;

    // Normalize: estScore / MOMENTUM_TARGET → DCS
    // v3.4.2: calibrated meal weights + synergies, retro can reach 9–10+ for excellent days
    var retroDcs = clamp(estScore / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0);

    return retroDcs;
  }

  /**
   * Compute Daily Contribution Score (DCS) from daily score.
   * Normalizes to -1.0..+1.0 with inertia protection.
   * Critical Violation Override bypasses inertia for severe events.
   */
  function computeDailyContribution(dailyScore, day, normAbs, pIndex, prof) {
    var dcs = clamp(dailyScore / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0);
    var hasCriticalViolation = false;
    var violationType = null;

    var meals = (day && day.meals) || [];
    // v3.5.1 fix: fallback 0 → kcal overrides are skipped when normAbs is unavailable
    // (avoids false deficit_overshoot penalty when normKcal falls back to 2000)
    var normKcal = (normAbs && normAbs.kcal) || 0;
    var hasNightHarm = false;
    var hasExcessKcal = false;

    // Night eating with harm ≥ 7 (00:00–06:00)
    for (var i = 0; i < meals.length; i++) {
      var mealTime = parseTime(meals[i] && meals[i].time);
      if (mealTime !== null && mealTime >= 0 && mealTime < 360) {
        if (checkMealHarm(meals[i], pIndex)) {
          hasNightHarm = true;
        }
      }
    }

    // Excess kcal > 150% of norm
    var totalKcal = 0;
    for (var j = 0; j < meals.length; j++) {
      var items = (meals[j] && meals[j].items) || [];
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var g = it.grams || it.g || 100;
        var product = pIndex
          ? ((HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(it, pIndex))
            || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(it, pIndex)))
          : null;
        if (product) {
          totalKcal += ((product.kcal || product.kcal100 || 0) * g / 100);
        } else {
          totalKcal += (it.kcal || 0);
        }
      }
    }
    if (normKcal > 0 && totalKcal > normKcal * 1.5) hasExcessKcal = true;

    // Critical Violation Override — bypasses inertia protection
    if (hasNightHarm && hasExcessKcal) {
      dcs = -1.0; violationType = 'night_harm_excess';
    } else if (hasNightHarm) {
      dcs = -0.8; violationType = 'night_harm';
    } else if (hasExcessKcal) {
      dcs = -0.6; violationType = 'excess_kcal';
    }

    // v3.1.0: Goal-aware DCS override for deficit/bulk users
    // v3.3.0: training-day calorie tolerance — training burns extra, don't penalize normal eating
    var deficitContext = null;
    var totalKcalRatio = normKcal > 0 ? totalKcal / normKcal : 0;
    var dayTrainings = (day && day.trainings) || [];
    var isTrainingDayForDeficit = dayTrainings.length > 0;
    var deficitTolerance = isTrainingDayForDeficit ? 1.2 : 1.0; // +20% kcal allowance on training days
    if (prof) {
      var dcGoalMode = getGoalMode(prof.deficitPctTarget);
      if (dcGoalMode.mode === 'deficit') {
        // v3.3.0: apply training-day tolerance to all deficit thresholds
        var adjCriticalOver = dcGoalMode.criticalOver * deficitTolerance;
        var adjTargetMax = dcGoalMode.targetRange.max * deficitTolerance;
        var adjLevel3 = 1.5 * deficitTolerance;
        if (totalKcalRatio > adjLevel3) {
          // Level 3: >150% (×tolerance) в дефиците — жёстче generic -0.6 (если нет ночного вреда)
          if (!hasNightHarm) {
            dcs = -0.7; violationType = 'deficit_critical_excess';
          }
          deficitContext = { goalMode: 'deficit', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: dcs, level: 3 };
        } else if (totalKcalRatio > adjCriticalOver) {
          // Level 2: e.g. >115%×tolerance — критическое нарушение, не покрытое generic
          if (violationType === null) {
            dcs = -0.5; violationType = 'deficit_overshoot';
          }
          deficitContext = { goalMode: 'deficit', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: dcs, level: 2 };
        } else if (totalKcalRatio > adjTargetMax) {
          // Level 1: e.g. >105%×tolerance — ослабляем инерционную защиту
          if (violationType === null) {
            dcs = Math.min(dcs, -0.4); // vs стандартный clamp -0.3
          }
          deficitContext = { goalMode: 'deficit', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: dcs, level: 1 };
        }
        if (deficitContext) {
          deficitContext.trainingTolerance = deficitTolerance;
          console.info('[HEYS.cascade.deficit] 📊 Goal-aware DCS override:', {
            level: deficitContext.level,
            ratio: deficitContext.ratio,
            criticalOver: +adjCriticalOver.toFixed(2),
            targetMax: +adjTargetMax.toFixed(2),
            rawCriticalOver: dcGoalMode.criticalOver,
            rawTargetMax: dcGoalMode.targetRange.max,
            trainingTolerance: deficitTolerance,
            isTrainingDay: isTrainingDayForDeficit,
            appliedPenalty: deficitContext.appliedPenalty,
            violationType: violationType
          });
        }
      } else if (dcGoalMode.mode === 'bulk' && totalKcalRatio <= 1.8 && violationType === 'excess_kcal') {
        // Bulk: не штрафуем превышение до 180% (фаза набора)
        violationType = null;
        dcs = clamp(dailyScore / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0);
        deficitContext = { goalMode: 'bulk', ratio: +totalKcalRatio.toFixed(2), appliedPenalty: 0, bulkExempt: true };
        console.info('[HEYS.cascade.deficit] 💪 Bulk exemption: kcal overage ' + (totalKcalRatio * 100).toFixed(0) + '% ≤ 180%, penalty removed');
      }
    }

    hasCriticalViolation = violationType !== null;
    return { dcs: dcs, hasCriticalViolation: hasCriticalViolation, violationType: violationType, deficitContext: deficitContext };
  }

  /**
   * Compute individual ceiling — max CRS for this user.
   * Grows with consistency, factor diversity, and data depth.
   * ceiling = min(1.0, base × consistency × diversity + dataDepth)
   */
  function computeIndividualCeiling(dcsByDate, prevDays, rawWeights) {
    var dcsValues = [];
    var dates = Object.keys(dcsByDate);
    for (var i = 0; i < dates.length; i++) {
      dcsValues.push(dcsByDate[dates[i]]);
    }

    // Consistency: 1 + clamp((1 - CV) × 0.3, 0, 0.3)
    var consistency = 1.0;
    if (dcsValues.length >= 5) {
      var meanVal = dcsValues.reduce(function (a, b) { return a + b; }, 0) / dcsValues.length;
      if (meanVal > 0) {
        var cv = stdev(dcsValues) / meanVal;
        consistency = 1 + clamp((1 - cv) * 0.3, 0, 0.3);
      }
    }

    // Diversity: count unique factor types with data in 3+ of 30 days
    var factorCounts = {
      household: 0, sleepOnset: 0, sleepDur: 0, steps: 0,
      checkin: 0, measurements: 0, supplements: 0, insulin: 0, training: 0
    };
    for (var di = 0; di < prevDays.length; di++) {
      var d = prevDays[di];
      if (!d) continue;
      if (d.householdMin > 0) factorCounts.household++;
      if (d.sleepStart) factorCounts.sleepOnset++;
      if (d.sleepHours > 0) factorCounts.sleepDur++;
      if (d.steps > 0) factorCounts.steps++;
      if (d.weightMorning > 0) factorCounts.checkin++;
      if (d.measurements && Object.keys(d.measurements).some(function (k) { return d.measurements[k] > 0; })) factorCounts.measurements++;
      if (d.supplementsTaken && d.supplementsTaken.length > 0) factorCounts.supplements++;
      if (d.meals && d.meals.length >= 2) factorCounts.insulin++;
      if (d.trainings && d.trainings.length > 0) factorCounts.training++;
    }
    var activatedFactors = 0;
    var ftKeys = Object.keys(factorCounts);
    for (var fk = 0; fk < ftKeys.length; fk++) {
      if (factorCounts[ftKeys[fk]] >= 3) activatedFactors++;
    }
    var diversity = 1 + (activatedFactors / 10) * 0.15;

    // Data depth: +0.03 per full week (up to 4 weeks = +0.12)
    var daysWithData = 0;
    for (var dd = 0; dd < prevDays.length; dd++) {
      if (prevDays[dd]) daysWithData++;
    }
    var fullWeeks = Math.min(4, Math.floor(daysWithData / 7));
    var dataDepth = 0.03 * fullWeeks;

    var ceiling = Math.min(1.0, CRS_CEILING_BASE * consistency * diversity + dataDepth);

    return {
      ceiling: +ceiling.toFixed(3),
      consistency: +consistency.toFixed(3),
      diversity: +diversity.toFixed(3),
      dataDepth: +dataDepth.toFixed(3),
      activatedFactors: activatedFactors,
      daysWithData: daysWithData,
      fullWeeks: fullWeeks
    };
  }

  /**
   * Compute CRS base via Exponential Moving Average (EMA).
   * v3.7.0: only completed days (i≥1). Asymmetric gravity applied to bad days.
   * Today's DCS is handled in computeCascadeState.
   */
  function computeCascadeRate(dcsByDate, ceiling, todayDate) {
    var weights = [];
    var values = [];
    var today = todayDate ? new Date(todayDate + 'T12:00:00') : new Date();

    // start from i=1 (yesterday) — today excluded from base EMA
    for (var i = 1; i < CRS_WINDOW; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateKey = d.toISOString().slice(0, 10);
      var dcsVal = dcsByDate[dateKey];

      if (dcsVal !== undefined && dcsVal !== null) {
        var weight = Math.pow(CRS_DECAY, i - 1); // yesterday = α⁰ = 1.0

        // v3.7.0: Asymmetric gravity — critical bad days drop CRS much faster
        if (dcsVal < -0.1) {
          weight *= CRS_NEGATIVE_GRAVITY;
        }

        weights.push(weight);
        values.push(dcsVal * weight);
      }
      // Days without data are skipped (not penalized)
    }

    if (weights.length === 0) return 0;

    var totalWeight = weights.reduce(function (a, b) { return a + b; }, 0);
    var crsRaw = values.reduce(function (a, b) { return a + b; }, 0) / totalWeight;

    return +clamp(crsRaw, 0, ceiling).toFixed(3);
  }

  /**
   * Compute CRS trend over last 7 days (up/down/flat).
   * Compares recent 3-day avg DCS to prior 4-7 day avg DCS.
   */
  function getCrsTrend(dcsByDate, todayDate) {
    var today = todayDate ? new Date(todayDate + 'T12:00:00') : new Date();
    var recent = []; // last 3 days DCS
    var prior = [];  // 4-7 days ago DCS

    for (var i = 0; i < 7; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateKey = d.toISOString().slice(0, 10);
      var val = dcsByDate[dateKey];
      if (val !== undefined && val !== null) {
        if (i < 3) recent.push(val);
        else prior.push(val);
      }
    }

    if (recent.length === 0 || prior.length === 0) return 'flat';

    var recentAvg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
    var priorAvg = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length;
    var diff = recentAvg - priorAvg;

    if (diff > 0.05) return 'up';
    if (diff < -0.05) return 'down';
    return 'flat';
  }

  // ─────────────────────────────────────────────────────
  // ДВИЖОК: computeCascadeState
  // ─────────────────────────────────────────────────────

  function computeCascadeState(day, dayTot, normAbs, prof, pIndex) {
    var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    console.info('[HEYS.cascade] ─── computeCascadeState v3.6.0 START ────────');
    console.info('[HEYS.cascade] 🧬 v3.6.0 features: CRS = base(EMA completed days) + DCS×0.03 | soft chain degradation | continuous scoring | personal baselines | circadian awareness | confidence layer | day-type detection | cross-factor synergies | goal-aware calorie penalty | chronotype-tolerant sleep scoring');
    console.info('[HEYS.cascade] 📥 Input data:', {
      hasMeals: !!(day && day.meals && day.meals.length),
      mealsCount: (day && day.meals && day.meals.length) || 0,
      hasTrainings: !!(day && day.trainings && day.trainings.length),
      trainingsCount: (day && day.trainings && day.trainings.length) || 0,
      water: (day && day.water) || 0,
      steps: (day && day.steps) || 0,
      sleepStart: (day && day.sleepStart) || null,
      sleepHours: (day && day.sleepHours) || 0,
      householdMin: (day && day.householdMin) || 0,
      weightMorning: (day && day.weightMorning) || 0,
      hasMeasurements: !!(day && day.measurements),
      hasSupplements: !!(day && day.supplementsTaken),
      hasNormAbs: !!normAbs,
      kcalNorm: normAbs ? normAbs.kcal : null,
      hasProf: !!prof,
      hasPIndex: !!pIndex
    });

    var events = [];
    var meals = (day && day.meals) || [];
    var trainings = (day && day.trainings) || [];
    var water = (day && day.water) || 0;
    var steps = (day && day.steps) || 0;
    var now = new Date();
    var currentHour = now.getHours();
    var currentMinutes = now.getHours() * 60 + now.getMinutes();

    var score = 0;

    // v3.0.0: Load 30-day history for CRS; first 14 for baseline/confidence/streak
    var prevDays30 = getPreviousDays(CRS_WINDOW);
    var prevDays14 = prevDays30.slice(0, 14);

    // ── 0. Chronotype Baseline (for sleep and meals) ──
    var sleepOnsetValues = [];
    for (var si = 0; si < prevDays14.length; si++) {
      if (!prevDays14[si] || !prevDays14[si].sleepStart) continue;
      var soVal = parseTime(prevDays14[si].sleepStart);
      if (soVal !== null) {
        if (soVal < 360) soVal += 1440;
        sleepOnsetValues.push(soVal);
      }
    }
    var sleepStart = (day && day.sleepStart) || '';
    if (sleepStart) {
      var sleepMins = parseTime(sleepStart);
      if (sleepMins !== null) {
        if (sleepMins < 360) sleepMins += 1440;
        sleepOnsetValues.push(sleepMins);
      }
    }
    var personalOnset = sleepOnsetValues.length >= 3 ? median(sleepOnsetValues) : POPULATION_DEFAULTS.sleepOnsetMins;
    var optimalOnset = Math.max(1290, Math.min(personalOnset, 1530)); // clamp 21:30–01:30
    var mealBandShift = Math.max(-30, optimalOnset - 1380); // clamp lower bound to 22:30

    var confidenceMap = {};
    var rawWeights = {};
    var iwAvgGap = 0; // hoisted for synergy access

    // ── ШАГ 1: Бытовая активность (adaptive baseline + log2) ──
    var householdMin = (day && day.householdMin) || 0;
    var baselineNEAT = getPersonalBaseline(prevDays14, function (d) { return d.householdMin; }, POPULATION_DEFAULTS.householdMin);
    var neatConfidence = getFactorConfidence(prevDays14, function (d) { return d.householdMin; });
    confidenceMap.household = neatConfidence;

    if (householdMin > 0) {
      var neatRatio = householdMin / baselineNEAT;
      var householdWeight = clamp(Math.log2(neatRatio + 0.5) * 0.8, -0.5, 1.2);
      var rawHousehold = householdWeight;
      householdWeight *= neatConfidence;
      rawWeights.household = rawHousehold;
      score += householdWeight;
      events.push({
        type: 'household',
        time: null,
        positive: true,
        icon: EVENT_ICONS.household,
        label: 'Бытовая активность ' + householdMin + ' мин',
        sortKey: 599,
        weight: householdWeight
      });
      console.info('[HEYS.cascade] 🏠 [EVENT] household (model v2.1.0 log2 adaptive):', {
        householdMin: householdMin, baseline: Math.round(baselineNEAT),
        ratio: +neatRatio.toFixed(2), formula: 'log2(' + +neatRatio.toFixed(2) + '+0.5)×0.8',
        rawWeight: +rawHousehold.toFixed(2),
        confidence: neatConfidence, adjustedWeight: +householdWeight.toFixed(2)
      });
    } else {
      var houseStreak = countConsecutive(prevDays14, function (d) { return !d || !(d.householdMin > 9); });
      if (houseStreak > 2) {
        var hPenalty = Math.max(-0.5, -0.08 * Math.pow(houseStreak - 2, 0.7));
        hPenalty *= neatConfidence;
        rawWeights.household = hPenalty / (neatConfidence || 1);
        score += hPenalty;
        console.info('[HEYS.cascade] 🏠 Household streak penalty:', { streakDays: houseStreak, penalty: +hPenalty.toFixed(2), confidence: neatConfidence });
      } else {
        rawWeights.household = 0;
        console.info('[HEYS.cascade] 🏠 No household data today, streak=' + houseStreak + ' (no penalty yet)');
      }
    }

    // ── ШАГ 2: Приёмы пищи ──────────────────────────────
    var cumulativeKcal = 0;

    // v3.1.0: Goal-aware calorie penalty — определяем режим цели один раз до цикла
    var mealGoalMode = getGoalMode(prof && prof.deficitPctTarget);
    var hasDeficitOvershoot = false;
    var deficitOvershootRatio = 0;
    console.info('[HEYS.cascade.deficit] 🎯 Goal mode for meal loop:', {
      mode: mealGoalMode.mode, label: mealGoalMode.label,
      targetRange: mealGoalMode.targetRange, criticalOver: mealGoalMode.criticalOver,
      deficitPctTarget: prof && prof.deficitPctTarget
    });

    console.info('[HEYS.cascade] 🥗 Processing', meals.length, 'meals...');

    meals.forEach(function (meal, i) {
      var items = (meal && meal.items) || [];
      var mealKcal = items.reduce(function (sum, it) {
        var g = it.grams || it.g || 100;
        var p = pIndex
          ? ((HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(it, pIndex))
            || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(it, pIndex)))
          : null;
        if (p) {
          var kcal100 = p.kcal || p.kcal100 || 0;
          return sum + (kcal100 * g / 100);
        }
        return sum + (it.kcal || 0);
      }, 0);

      cumulativeKcal += mealKcal;
      var normKcal = (normAbs && normAbs.kcal) || 0;
      var cumulativeRatio = normKcal ? (cumulativeKcal / normKcal) : 0;
      var overNorm = normKcal ? cumulativeRatio > 1.2 : false;
      var hasHarm = checkMealHarm(meal, pIndex);
      var timeMins = parseTime(meal && meal.time);
      var normalizedTime = timeMins;
      if (normalizedTime !== null && normalizedTime < 360) normalizedTime += 1440;
      var isLate = normalizedTime !== null && normalizedTime >= (1380 + mealBandShift);

      // ─ v2.1.0: Hard violations (harm ≥ 7, late > 23:00) ─
      var hasHardViolation = hasHarm || isLate;
      var positive = !hasHardViolation;
      var breakReason = hasHarm ? 'Вредный продукт' : (isLate ? 'Поздний приём' : null);

      // ─ Quality scoring via getMealQualityScore (0–100) ─
      var mealQS = null;
      var mealScoringFn = (HEYS.mealScoring && typeof HEYS.mealScoring.getMealQualityScore === 'function')
        ? HEYS.mealScoring.getMealQualityScore.bind(HEYS.mealScoring)
        : (typeof HEYS.getMealQualityScore === 'function' ? HEYS.getMealQualityScore : null);

      if (mealScoringFn && pIndex) {
        try {
          mealQS = mealScoringFn(meal, null, normKcal || 2000, pIndex, null);
        } catch (err) {
          // Non-blocking — continue with fallback
        }
      }

      // ─ v2.1.0: Continuous scoring (linear interpolation) ─
      // 0→-1.0, 20→-0.5, 40→0.0, 60→+0.5, 80→+1.0, 100→+1.5
      var mealWeight;
      var qualityGrade = null;

      if (mealQS && mealQS.score != null) {
        var qs = mealQS.score; // 0–100
        mealWeight = clamp((qs - 40) / 40, -1.0, 1.5);
        qualityGrade = qs >= 80 ? 'excellent' : qs >= 60 ? 'good' : qs >= 40 ? 'ok' : qs >= 20 ? 'poor' : 'bad';

        // Poor/bad quality → break chain
        if (qs < 20 && positive) {
          positive = false;
          breakReason = breakReason || 'Низкое качество';
        } else if (qs < 40 && positive) {
          positive = false;
          breakReason = breakReason || 'Слабый приём';
        }
      } else {
        // Fallback binary
        mealWeight = positive ? EVENT_WEIGHTS.meal_positive : EVENT_WEIGHTS.meal_negative;
      }

      // Circadian modifier: breakfast ×1.3, late dinner ×0.7
      if (normalizedTime !== null && normalizedTime < (1380 + mealBandShift) && !hasHardViolation) {
        var circMult = getCircadianMultiplier(timeMins, mealBandShift);
        mealWeight *= circMult;
      }

      // Progressive cumulative penalty (sigmoid) — v3.1.0 goal-aware
      if (normKcal > 0 && !hasHardViolation) {
        var penaltyThreshold, penaltyStrength, penaltyLabel;
        if (mealGoalMode.mode === 'bulk') {
          // При наборе массы: штрафуем только при грубом переедании >130%
          penaltyThreshold = 1.30;
          penaltyStrength = 1.0;
          penaltyLabel = 'Перебор ккал (' + Math.round(cumulativeRatio * 100) + '%)';
        } else if (mealGoalMode.mode === 'deficit') {
          // При дефиците: штраф начинается раньше (выше целевого максимума) и жёсче
          penaltyThreshold = mealGoalMode.targetRange.max; // 1.05 или 1.08
          penaltyStrength = 2.0; // строже стандартных 1.5
          penaltyLabel = 'Перебор при дефиците (' + Math.round(cumulativeRatio * 100) + '%)';
        } else {
          // Maintenance: стандартная логика
          penaltyThreshold = 1.0;
          penaltyStrength = 1.5;
          penaltyLabel = 'Перебор ккал (' + Math.round(cumulativeRatio * 100) + '%)';
        }
        if (cumulativeRatio > penaltyThreshold) {
          var cumulPenalty = -Math.tanh((cumulativeRatio - penaltyThreshold) / 0.2) * penaltyStrength;
          mealWeight = Math.min(mealWeight, cumulPenalty);
          positive = false;
          breakReason = breakReason || penaltyLabel;
        }
      }

      // Hard violations always force -1.0
      if (hasHardViolation) {
        mealWeight = -1.0;
      }

      score += mealWeight;

      events.push({
        type: 'meal',
        time: (meal && meal.time) || null,
        positive: positive,
        icon: EVENT_ICONS.meal,
        label: getMealLabel(meal, i),
        sortKey: timeMins !== null ? timeMins : (500 + i * 120),
        breakReason: breakReason,
        weight: mealWeight,
        qualityScore: mealQS ? mealQS.score : null,
        qualityGrade: qualityGrade,
        qualityColor: mealQS ? mealQS.color : null
      });

      // Явная строка — всегда читается без разворачивания объекта
      if (mealQS && mealQS.score != null) {
        console.info('[HEYS.cascade] 🎯 Meal quality (' + getMealLabel(meal, i) + '): score=' + mealQS.score + ' grade=' + qualityGrade + ' weight=' + (+mealWeight).toFixed(2) + ' color=' + mealQS.color + ' scoringModel=v2.1.0-continuous');
      } else {
        console.warn('[HEYS.cascade] ⚠️ getMealQualityScore недоступен (' + getMealLabel(meal, i) + ') → fallback weight=' + mealWeight + ' | HEYS.mealScoring=' + (typeof (HEYS.mealScoring && HEYS.mealScoring.getMealQualityScore)) + ' pIndex=' + (!!pIndex));
      }

      console.info('[HEYS.cascade] 🍽️ [MEAL ' + (i + 1) + '/' + meals.length + '] ' + getMealLabel(meal, i) + ' (model v2.1.0 continuous + circadian):', {
        time: (meal && meal.time) || null,
        mealKcal: Math.round(mealKcal),
        cumulativeKcal: Math.round(cumulativeKcal),
        normKcal: Math.round(normKcal),
        cumulativeRatio: +cumulativeRatio.toFixed(2),
        circadianModifier: (timeMins !== null && timeMins < 1380 && !hasHardViolation) ? +getCircadianMultiplier(timeMins).toFixed(2) : 'N/A',
        hasHarm: hasHarm,
        isLate: isLate,
        positive: positive,
        breakReason: breakReason,
        quality: mealQS
          ? { score: mealQS.score, grade: qualityGrade, formula: 'clamp((' + mealQS.score + '-40)/40)' }
          : '(getMealQualityScore недоступен)',
        weight: +(mealWeight).toFixed(2)
      });
    });

    // ── ШАГ 2.5: Deficit Overshoot Summary (v3.1.0) ────────────
    // После обработки всех приёмов пищи — итоговый срыв по калориям при цели похудения
    if (mealGoalMode.mode === 'deficit' && normAbs && normAbs.kcal > 0) {
      var finalKcalRatio = cumulativeKcal / normAbs.kcal;
      if (finalKcalRatio > mealGoalMode.criticalOver) {
        // Критический перебор (>115% при активном дефиците, >120% при лёгком)
        var defCritPenalty = -1.5;
        score += defCritPenalty;
        hasDeficitOvershoot = true;
        deficitOvershootRatio = finalKcalRatio;
        events.push({
          type: 'deficit_overshoot',
          positive: false,
          icon: '🔴',
          label: 'Перебор при похудении — ' + Math.round(finalKcalRatio * 100) + '% от нормы',
          sortKey: 1439,
          breakReason: 'Критический перебор: ' + Math.round(finalKcalRatio * 100) + '% (цель: ' + mealGoalMode.label + ')',
          weight: defCritPenalty
        });
        console.info('[HEYS.cascade.deficit] 🔴 Критический перебор при дефиците:', {
          goalMode: mealGoalMode.mode, goalLabel: mealGoalMode.label,
          criticalOver: mealGoalMode.criticalOver, actualRatio: +finalKcalRatio.toFixed(2),
          overshootPct: '+' + Math.round((finalKcalRatio - 1) * 100) + '%',
          penalty: defCritPenalty, crsNote: 'DCS override → -0.7 (через computeDailyContribution)'
        });
      } else if (finalKcalRatio > mealGoalMode.targetRange.max) {
        // Ощутимый перебор (>105%/108%)
        var defWarnPenalty = -0.5;
        score += defWarnPenalty;
        hasDeficitOvershoot = true;
        deficitOvershootRatio = finalKcalRatio;
        events.push({
          type: 'deficit_warning',
          positive: false,
          icon: '⚠️',
          label: 'Калории выше цели (' + Math.round(finalKcalRatio * 100) + '% от нормы)',
          sortKey: 1438,
          breakReason: 'Перебор при ' + mealGoalMode.label + ': ' + Math.round(finalKcalRatio * 100) + '%',
          weight: defWarnPenalty
        });
        console.info('[HEYS.cascade.deficit] ⚠️ Ощутимый перебор при дефиците:', {
          goalMode: mealGoalMode.mode, goalLabel: mealGoalMode.label,
          targetMax: mealGoalMode.targetRange.max, actualRatio: +finalKcalRatio.toFixed(2),
          overshootPct: '+' + Math.round((finalKcalRatio - 1) * 100) + '%',
          penalty: defWarnPenalty, crsNote: 'DCS clamp → -0.4 (через computeDailyContribution)'
        });
      }
    }
    if (mealGoalMode.mode === 'deficit') {
      console.info('[HEYS.cascade.deficit] ✅ Deficit calorie check complete:', {
        hasDeficitOvershoot: hasDeficitOvershoot,
        deficitRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
        cumulativeKcal: Math.round(cumulativeKcal),
        normKcal: (normAbs && normAbs.kcal) || 0,
        goalLabel: mealGoalMode.label
      });
    }

    // ── ШАГ 3: Тренировки (load × intensity, diminishing returns, recovery-aware) ──
    console.info('[HEYS.cascade] 💪 Processing', trainings.length, 'trainings...');
    var todayTotalLoad = 0;
    var trainingConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.trainings && d.trainings.length; });
    confidenceMap.training = trainingConfidence;

    if (trainings.length > 0) {
      var sessionWeights = [];
      trainings.forEach(function (tr, ti) {
        var timeMins = parseTime(tr && tr.time);
        var dur = getTrainingDuration(tr);
        var load = getTrainingLoad(tr);
        todayTotalLoad += load;
        // sqrt-curve: diminishing returns on load
        var sessionWeight = clamp(Math.sqrt(load / 30) * 1.2, 0.3, 3.0);
        sessionWeights.push(sessionWeight);
        var trainingWeight;
        if (ti === 0) {
          trainingWeight = sessionWeight;
        } else if (ti === 1) {
          trainingWeight = sessionWeight * 0.5; // 2nd session: half credit
        } else {
          trainingWeight = sessionWeight * 0.25; // 3rd+: quarter credit
        }
        trainingWeight *= trainingConfidence;
        rawWeights['training_' + ti] = sessionWeight;
        score += trainingWeight;
        var trType = (tr && tr.type) || '';
        events.push({
          type: 'training',
          time: (tr && tr.time) || null,
          positive: true,
          icon: EVENT_ICONS.training,
          label: 'Тренировка ' + dur + ' мин' + (trType ? ' (' + trType + ')' : ''),
          sortKey: timeMins !== null ? timeMins : 700,
          weight: trainingWeight
        });
        console.info('[HEYS.cascade] 💪 [TRAINING ' + (ti + 1) + '/' + trainings.length + '] (model v2.1.0 load×intensity + sqrt curve):', {
          time: (tr && tr.time) || null, duration: dur, type: trType || 'unknown',
          load: Math.round(load), formula: 'sqrt(' + Math.round(load) + '/30)×1.2',
          sessionWeight: +sessionWeight.toFixed(2),
          diminishingFactor: ti === 0 ? '1.0 (full)' : ti === 1 ? '0.5 (2nd session)' : '0.25 (3rd+)',
          confidence: trainingConfidence, adjustedWeight: +trainingWeight.toFixed(2)
        });
      });
    } else {
      // Recovery-aware: check if yesterday had intense training
      var yesterdayLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yesterdayLoad += getTrainingLoad(t); });
      }
      var isPlannedRecovery = yesterdayLoad > 60;
      if (isPlannedRecovery) {
        // Planned recovery after heavy training: small bonus instead of penalty
        var recoveryBonus = 0.2 * trainingConfidence;
        rawWeights.training_recovery = 0.2;
        score += recoveryBonus;
        console.info('[HEYS.cascade] 💪 Planned recovery day (yesterday load=' + Math.round(yesterdayLoad) + '):', { bonus: +recoveryBonus.toFixed(2) });
      } else {
        var trainStreak = countConsecutive(prevDays14, function (d) { return !d || !(d.trainings && d.trainings.length > 0); });
        if (trainStreak > 2) {
          var weeklyLoad = 0;
          for (var wl = 0; wl < Math.min(7, prevDays14.length); wl++) {
            if (prevDays14[wl] && prevDays14[wl].trainings) {
              prevDays14[wl].trainings.forEach(function (t) { weeklyLoad += getTrainingLoad(t); });
            }
          }
          var weeklyTarget = POPULATION_DEFAULTS.weeklyTrainingLoad;
          var weeklyRatio = weeklyTarget > 0 ? weeklyLoad / weeklyTarget : 0;
          if (weeklyRatio < 0.8) {
            var tPenalty = Math.max(-0.5, -0.15 * (trainStreak - 2));
            tPenalty *= trainingConfidence;
            rawWeights.training_penalty = tPenalty / (trainingConfidence || 1);
            score += tPenalty;
            console.info('[HEYS.cascade] 💪 Training streak penalty:', {
              streakDays: trainStreak, weeklyLoad: Math.round(weeklyLoad),
              weeklyTarget: Math.round(weeklyTarget), weeklyRatio: +weeklyRatio.toFixed(2),
              penalty: +tPenalty.toFixed(2), confidence: trainingConfidence
            });
          } else {
            rawWeights.training_penalty = 0;
            console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' but weekly load OK (' + weeklyRatio.toFixed(2) + ')');
          }
        } else {
          rawWeights.training_penalty = 0;
          console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' (no penalty yet)');
        }
      }
    }

    // ── ШАГ 4: Засыпание (chronotype-adaptive sigmoid + consistency) ──
    var sleepStart = (day && day.sleepStart) || '';
    var sleepEndVal = (day && day.sleepEnd) || null;
    // Pre-compute sleepHours для лейбла (ШАГ 5 пересчитает с full logic)
    var sleepHoursForLabel = (day && day.sleepHours) || 0;
    if (!sleepHoursForLabel && sleepStart && sleepEndVal) {
      var slPre = parseTime(sleepStart); var elPre = parseTime(sleepEndVal);
      if (slPre !== null && elPre !== null) {
        if (slPre < 360) slPre += 1440;
        if (elPre <= slPre) elPre += 1440;
        sleepHoursForLabel = Math.round((elPre - slPre) / 60 * 10) / 10;
      }
    }
    var sleepOnsetConfidence = getFactorConfidence(prevDays14, function (d) {
      return d && d.sleepStart ? parseTime(d.sleepStart) : null;
    });
    confidenceMap.sleepOnset = sleepOnsetConfidence;

    if (sleepStart) {
      var sleepMins = parseTime(sleepStart);
      if (sleepMins !== null && sleepMins < 360) sleepMins += 1440; // after midnight
      if (sleepMins !== null) {
        // v3.5.0: Chronotype-adaptive baseline pre-calculated at step 0
        // Sigmoid scoring: deviation from personal optimal
        var onsetDeviation = sleepMins - optimalOnset; // minutes (positive = later)
        // v3.2.0: смягчён sigmoid — длительность сна важнее точного времени засыпания
        var rawSleepOnset = -Math.tanh(onsetDeviation / 60) * 1.5 + 0.5;
        rawSleepOnset = clamp(rawSleepOnset, -2.0, 1.2);

        // Consistency bonus (low variance in sleep onset → stable circadian rhythm)
        var consistencyBonus = 0;
        if (sleepOnsetValues.length >= 5) {
          var onsetVariance = stdev(sleepOnsetValues);
          if (onsetVariance < 30) consistencyBonus = 0.3;
          else if (onsetVariance < 45) consistencyBonus = 0.15;
        }

        // Hard floor: after 04:00 = circadian catastrophe (v3.2.0: сдвинут с 03:00)
        if (sleepMins > 1680) { rawSleepOnset = -2.0; consistencyBonus = 0; }

        var sleepOnsetWeightFinal = (rawSleepOnset + consistencyBonus) * sleepOnsetConfidence;
        rawWeights.sleepOnset = rawSleepOnset + consistencyBonus;
        score += sleepOnsetWeightFinal;

        // v3.3.0: labels aligned with buildDayEventsSimple + v3.2.0 chronotype clamp (01:30)
        var sleepOnsetLabel = sleepMins <= 1320 ? 'Ранний сон' : sleepMins <= 1380 ? 'Сон до 23:00'
          : sleepMins <= 1440 ? 'Сон до полуночи' : sleepMins <= 1530 ? 'Поздний сон'
            : sleepMins <= 1620 ? 'Очень поздний сон' : 'Критически поздний сон';
        // sortKey: after-midnight sleep (sleepMins > 1440) → negative so it sorts
        // before morning checkin (sortKey=0) and meals. Pre-midnight → use raw value.
        var sleepSortKey = sleepMins > 1440 ? sleepMins - 2880 : sleepMins;
        // Полный лейбл: качество + время конца + длительность
        var sleepFullLabel = sleepOnsetLabel;
        if (sleepEndVal) sleepFullLabel += ' →' + sleepEndVal;
        if (sleepHoursForLabel > 0) sleepFullLabel += ' (' + sleepHoursForLabel.toFixed(1) + 'ч)';
        events.push({
          type: 'sleep',
          time: sleepStart,
          timeEnd: sleepEndVal,
          sleepHours: sleepHoursForLabel,
          positive: rawSleepOnset >= 0,
          icon: EVENT_ICONS.sleep,
          label: sleepFullLabel,
          sortKey: sleepSortKey,
          weight: sleepOnsetWeightFinal
        });
        console.info('[HEYS.cascade] 😴 Sleep onset (model v3.2.0 chronotype-tolerant sigmoid):', {
          sleepStart: sleepStart, sleepMins: sleepMins,
          personalOnset: Math.round(personalOnset), optimalOnset: Math.round(optimalOnset),
          deviationMin: Math.round(onsetDeviation),
          formula: '-tanh(' + Math.round(onsetDeviation) + '/60)×1.5+0.5',
          rawWeight: +rawSleepOnset.toFixed(2), consistencyBonus: +consistencyBonus.toFixed(2),
          onsetVariance: sleepOnsetValues.length >= 5 ? Math.round(stdev(sleepOnsetValues)) : 'N/A (need 5+ days)',
          confidence: sleepOnsetConfidence, adjustedWeight: +sleepOnsetWeightFinal.toFixed(2)
        });
      }
    } else {
      console.info('[HEYS.cascade] 😴 No sleepStart data — ШАГ 4 skipped');
    }

    // ── ШАГ 5: Длительность сна (personalized bell-curve + training recovery) ──
    var sleepHours = (day && day.sleepHours) || 0;
    if (!sleepHours && (day && day.sleepStart) && (day && day.sleepEnd)) {
      var sdm = parseTime(day.sleepStart); var edm = parseTime(day.sleepEnd);
      if (sdm !== null && edm !== null) {
        if (edm < sdm) edm += 1440;
        sleepHours = (edm - sdm) / 60;
      }
    }
    var sleepDurConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.sleepHours; });
    confidenceMap.sleepDur = sleepDurConfidence;

    if (sleepHours > 0) {
      // Personal optimal from 14-day median
      var personalSleepOpt = getPersonalBaseline(prevDays14, function (d) { return d.sleepHours; }, POPULATION_DEFAULTS.sleepHours);
      personalSleepOpt = clamp(personalSleepOpt, 6.0, 9.0);

      // Training recovery: need +0.5h after intense training yesterday
      var yesterdayTrainLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yesterdayTrainLoad += getTrainingLoad(t); });
      }
      if (yesterdayTrainLoad > 60) personalSleepOpt += 0.5;

      // Bell-curve scoring: Gaussian around personal optimal
      var sleepDev = Math.abs(sleepHours - personalSleepOpt);
      var rawSleepDur = 1.5 * Math.exp(-(sleepDev * sleepDev) / (2 * 0.8 * 0.8)) - 0.5;

      // Asymmetry: undersleep penalized 1.3x more than oversleep
      if (sleepHours < personalSleepOpt) rawSleepDur *= 1.3;

      // Hard limits
      if (sleepHours < 4.0) rawSleepDur = -2.0;
      else if (sleepHours > 12.0) rawSleepDur = -0.5;

      rawSleepDur = clamp(rawSleepDur, -2.0, 1.5);
      var sleepDurWeight = rawSleepDur * sleepDurConfidence;
      rawWeights.sleepDur = rawSleepDur;
      score += sleepDurWeight;
      console.info('[HEYS.cascade] 😴 Sleep duration (model v2.1.0 Gaussian bell-curve):', {
        sleepHours: +sleepHours.toFixed(1), personalOptimal: +personalSleepOpt.toFixed(1),
        deviation: +sleepDev.toFixed(1), formula: '1.5×exp(-' + sleepDev.toFixed(1) + '²/(2×0.8²))-0.5',
        asymmetry: sleepHours < personalSleepOpt ? '×1.3 (undersleep penalty)' : 'none',
        yesterdayTrainLoad: Math.round(yesterdayTrainLoad),
        trainingRecovery: yesterdayTrainLoad > 60 ? '+0.5h optimal shift' : 'none',
        rawWeight: +rawSleepDur.toFixed(2), confidence: sleepDurConfidence,
        adjustedWeight: +sleepDurWeight.toFixed(2)
      });
    } else {
      console.info('[HEYS.cascade] 😴 No sleepHours data — ШАГ 5 skipped');
    }

    // ── ШАГ 6: Шаги (rolling adaptive goal + tanh continuous) ──
    var stepsConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.steps; });
    confidenceMap.steps = stepsConfidence;
    var stepsWeight = 0;

    if (steps > 0) {
      // Adaptive goal: 14-day median × 1.05 (progressive overload)
      var rollingStepsAvg = getPersonalBaseline(prevDays14, function (d) { return d.steps; },
        (prof && (prof.stepsGoal || prof.steps_goal)) || POPULATION_DEFAULTS.steps);
      var adaptiveGoal = Math.max(5000, rollingStepsAvg * 1.05);
      var stepsRatio = steps / adaptiveGoal;

      // Continuous tanh scoring
      var rawSteps = clamp(Math.tanh((stepsRatio - 0.6) * 2.5) * 1.0 + 0.15, -0.5, 1.3);
      stepsWeight = rawSteps * stepsConfidence;
      rawWeights.steps = rawSteps;
      score += stepsWeight;

      var stepsLabel = stepsRatio >= 1.2
        ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (отлично!)')
        : stepsRatio >= 1.0
          ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (цель)')
          : ('Шаги — ' + Math.round(stepsRatio * 100) + '%');
      events.push({
        type: 'steps',
        time: null,
        positive: rawSteps > 0,
        icon: EVENT_ICONS.steps,
        label: stepsLabel,
        sortKey: 1100,
        weight: stepsWeight
      });
      console.info('[HEYS.cascade] 🚶 Steps (model v2.1.0 rolling adaptive + tanh):', {
        steps: steps, adaptiveGoal: Math.round(adaptiveGoal),
        ratio: +stepsRatio.toFixed(2), formula: 'tanh((' + stepsRatio.toFixed(2) + '-0.6)×2.5)×1.0+0.15',
        rawWeight: +rawSteps.toFixed(2),
        confidence: stepsConfidence, adjustedWeight: +stepsWeight.toFixed(2)
      });
    } else {
      rawWeights.steps = 0;
      console.info('[HEYS.cascade] 🚶 No steps data — ШАГ 6 skipped');
    }

    // ── ШАГ 7: Чекин веса (streak bonus + trend awareness) ──
    var weightMorning = (day && day.weightMorning) || 0;
    var checkinConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.weightMorning; });
    confidenceMap.checkin = checkinConfidence;

    if (weightMorning > 0) {
      var checkinBase = 0.3;
      // Streak bonus: consecutive check-ins (+0.05/day, max +0.5)
      var checkinStreak = countConsecutive(prevDays14, function (d) { return d && d.weightMorning > 0; });
      var streakBonus = Math.min(0.5, checkinStreak * 0.05);

      // Trend awareness: stability bonus if weight is stable ±50g/day
      var trendBonus = 0;
      var recentWeights = [];
      for (var cw = 0; cw < Math.min(7, prevDays14.length); cw++) {
        if (prevDays14[cw] && prevDays14[cw].weightMorning > 0) recentWeights.push(prevDays14[cw].weightMorning);
      }
      if (recentWeights.length >= 3) {
        var wFirst = recentWeights[recentWeights.length - 1];
        var wLast = recentWeights[0];
        var slope = (wLast - wFirst) / recentWeights.length;
        if (Math.abs(slope) < 0.05) trendBonus = 0.05; // stable weight
      }

      var rawCheckin = clamp(checkinBase + streakBonus + trendBonus, 0, 0.8);
      var checkinWeight = rawCheckin * checkinConfidence;
      rawWeights.checkin = rawCheckin;
      score += checkinWeight;
      events.push({
        type: 'checkin',
        time: null,
        positive: true,
        icon: EVENT_ICONS.checkin,
        label: 'Чекин веса: ' + weightMorning + ' кг' + (checkinStreak > 2 ? ' (' + (checkinStreak + 1) + ' д.)' : ''),
        sortKey: 540,
        weight: checkinWeight
      });
      console.info('[HEYS.cascade] ⚖️ Weight checkin (model v2.1.0 streak + trend):', {
        weight: weightMorning, base: checkinBase,
        streak: checkinStreak, streakBonus: +streakBonus.toFixed(2),
        trendBonus: +trendBonus.toFixed(2),
        formula: 'base(' + checkinBase + ') + streak(' + streakBonus.toFixed(2) + ') + trend(' + trendBonus.toFixed(2) + ')',
        rawWeight: +rawCheckin.toFixed(2),
        confidence: checkinConfidence, adjustedWeight: +checkinWeight.toFixed(2)
      });
    } else {
      // Mild habit-break penalty if streak was active
      var brokenStreak = countConsecutive(prevDays14, function (d) { return d && d.weightMorning > 0; });
      if (brokenStreak >= 3) {
        var breakPenalty = -0.1 * checkinConfidence;
        rawWeights.checkin = -0.1;
        score += breakPenalty;
        console.info('[HEYS.cascade] ⚖️ Checkin streak broken (was ' + brokenStreak + ' days):', { penalty: +breakPenalty.toFixed(2) });
      } else {
        rawWeights.checkin = 0;
        console.info('[HEYS.cascade] ⚖️ No weight checkin today — ШАГ 7 skipped');
      }
    }

    // ── ШАГ 8: Замеры (smart cadence + completeness score) ──
    var measurements = (day && day.measurements) || null;
    var measKeys = measurements ? Object.keys(measurements).filter(function (k) { return measurements[k] > 0; }) : [];
    var hasMeasToday = measKeys.length > 0;
    var measConfidence = getFactorConfidence(prevDays14, function (d) {
      return d && d.measurements && Object.keys(d.measurements).some(function (k) { return d.measurements[k] > 0; }) ? 1 : 0;
    });
    confidenceMap.measurements = measConfidence;

    if (hasMeasToday) {
      var totalPossible = 4; // waist, hips, thigh, biceps
      var completeness = measKeys.length / totalPossible;
      var rawMeas = 0.5 + completeness * 0.7; // 1 part → +0.67, all 4 → +1.2

      // Diminishing returns if measured yesterday too (weekly cadence is optimal)
      var lastMeasDayIdx = -1;
      for (var lm = 0; lm < prevDays14.length; lm++) {
        var plm = prevDays14[lm];
        if (plm && plm.measurements && Object.keys(plm.measurements).some(function (k) { return plm.measurements[k] > 0; })) {
          lastMeasDayIdx = lm + 1; break;
        }
      }
      if (lastMeasDayIdx !== -1 && lastMeasDayIdx <= 2) rawMeas *= 0.5;

      rawMeas = clamp(rawMeas, 0, 1.2);
      var measWeight = rawMeas * measConfidence;
      rawWeights.measurements = rawMeas;
      score += measWeight;
      events.push({
        type: 'measurements',
        time: null,
        positive: true,
        icon: EVENT_ICONS.measurements,
        label: 'Замеры тела (' + measKeys.length + '/' + totalPossible + ')',
        sortKey: 545,
        weight: measWeight
      });
      console.info('[HEYS.cascade] 📏 Measurements (model v2.1.0 completeness + cadence):', {
        count: measKeys.length, completeness: +completeness.toFixed(2),
        formula: '0.5 + ' + completeness.toFixed(2) + '×0.7',
        lastMeasDay: lastMeasDayIdx, diminishing: lastMeasDayIdx !== -1 && lastMeasDayIdx <= 2 ? '×0.5 (recent)' : 'none',
        rawWeight: +rawMeas.toFixed(2),
        confidence: measConfidence, adjustedWeight: +measWeight.toFixed(2)
      });
    } else {
      // Penalty if too long since last measurement
      var lastMeasSearch = -1;
      for (var pms = 0; pms < prevDays14.length; pms++) {
        var pds = prevDays14[pms];
        if (pds && pds.measurements && Object.keys(pds.measurements).some(function (k) { return pds.measurements[k] > 0; })) {
          lastMeasSearch = pms + 1; break;
        }
      }
      if (lastMeasSearch > 7) {
        var measPenalty = clamp(-0.05 * (lastMeasSearch - 7), -0.3, 0);
        measPenalty *= measConfidence;
        rawWeights.measurements = measPenalty / (measConfidence || 1);
        score += measPenalty;
        console.info('[HEYS.cascade] 📏 Measurements penalty:', { lastMeasDay: lastMeasSearch, penalty: +measPenalty.toFixed(2) });
      } else {
        rawWeights.measurements = 0;
      }
    }

    // ── ШАГ 9: Витамины (continuous + streak bonus) ─────
    var suppTaken = (day && day.supplementsTaken) ? day.supplementsTaken.length : 0;
    var suppPlannedRaw = (day && day.supplementsPlanned) || (prof && prof.plannedSupplements) || 0;
    var suppPlanned = Array.isArray(suppPlannedRaw) ? suppPlannedRaw.length : (typeof suppPlannedRaw === 'number' ? suppPlannedRaw : 0);

    // Если плана нет, но витамины выпиты — считаем план выполненным на 100%
    if (suppPlanned === 0 && suppTaken > 0) {
      suppPlanned = suppTaken;
    }

    var suppConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.supplementsTaken && d.supplementsTaken.length; });
    confidenceMap.supplements = suppConfidence;

    if (suppPlanned > 0) {
      var suppRatio = suppTaken / suppPlanned;
      // Continuous scoring: ratio × 0.7 - 0.1
      var rawSupp = clamp(suppRatio * 0.7 - 0.1, -0.3, 0.5);

      // Streak bonus
      var suppStreak = countConsecutive(prevDays14, function (d) {
        if (!d || !d.supplementsTaken) return false;
        var st = d.supplementsTaken.length || 0;
        var spRaw = d.supplementsPlanned || d.plannedSupplements || suppPlanned;
        var sp = Array.isArray(spRaw) ? spRaw.length : (typeof spRaw === 'number' ? spRaw : 0);
        if (sp === 0 && st > 0) sp = st;
        return sp > 0 && (st / sp) >= 0.8;
      });
      var suppStreakBonus = suppStreak >= 7 ? 0.2 : suppStreak >= 3 ? 0.1 : 0;

      // Habit break penalty
      if (suppTaken === 0 && suppStreak >= 3) {
        rawSupp = -0.3;
        suppStreakBonus = 0;
      }

      rawSupp = clamp(rawSupp + suppStreakBonus, -0.3, 0.7);
      var suppWeight = rawSupp * suppConfidence;
      rawWeights.supplements = rawSupp;
      score += suppWeight;
      events.push({
        type: 'supplements',
        time: null,
        positive: rawSupp > 0,
        icon: EVENT_ICONS.supplements,
        label: suppRatio >= 1 ? 'Добавки: всё' : ('Добавки: ' + suppTaken + '/' + suppPlanned),
        sortKey: 550,
        weight: suppWeight
      });
      console.info('[HEYS.cascade] 💊 Supplements (model v2.1.0 continuous + streak):', {
        taken: suppTaken, planned: suppPlanned, ratio: +suppRatio.toFixed(2),
        formula: 'clamp(' + suppRatio.toFixed(2) + '×0.7-0.1)',
        streak: suppStreak, streakBonus: +suppStreakBonus.toFixed(2),
        rawWeight: +rawSupp.toFixed(2), confidence: suppConfidence,
        adjustedWeight: +suppWeight.toFixed(2)
      });
    } else {
      rawWeights.supplements = 0;
      console.info('[HEYS.cascade] 💊 No supplement plan configured — ШАГ 9 skipped');
    }

    // ── ШАГ 10: Инсулиновые волны (sigmoid overlap + log2 gap + post-training + night fasting) ──
    var insulinConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.meals && d.meals.length >= 2 ? 1 : 0; });
    confidenceMap.insulin = insulinConfidence;

    if (meals.length >= 2 && HEYS.InsulinWave && typeof HEYS.InsulinWave.calculate === 'function') {
      try {
        var iw = HEYS.InsulinWave.calculate({
          meals: meals, pIndex: pIndex,
          getProductFromItem: (HEYS.getProductFromItem || function () { return {}; }),
          trainings: trainings, dayData: { profile: prof }
        });
        var overlaps = (iw && iw.overlaps) || [];
        var gaps = (iw && iw.gaps) || [];
        iwAvgGap = (iw && iw.avgGapToday) || 0;
        var iwScore = 0;

        // Sigmoid overlap penalty (severity-weighted, continuous)
        overlaps.forEach(function (ov) {
          var overlapMins = ov.overlapMinutes || (ov.severity === 'high' ? 60 : ov.severity === 'medium' ? 40 : 15);
          var ovPenalty = -(1 / (1 + Math.exp(-overlapMins / 30))) * 0.6;
          iwScore += ovPenalty;
        });
        iwScore = Math.max(-2.0, iwScore); // cap overlap penalty

        // Log2 gap scoring (continuous)
        if (gaps.length > 0) {
          gaps.forEach(function (g) {
            var gapMins = g.gapMinutes || g.gap || 0;
            if (gapMins > 120) {
              var gapBonus = clamp(Math.log2(gapMins / 120), 0, 1.0) * 0.4;
              iwScore += gapBonus;
            }
          });
        } else if (iwAvgGap > 0) {
          // Fallback to avgGap if individual gaps not available
          if (iwAvgGap > 120) iwScore += clamp(Math.log2(iwAvgGap / 120), 0, 1.0) * 0.4;
        }

        // Post-training meal timing bonus (anabolic window)
        if (trainings.length > 0) {
          trainings.forEach(function (tr) {
            var trEnd = parseTime(tr && tr.time);
            if (trEnd === null) return;
            var trDur = getTrainingDuration(tr);
            trEnd += trDur; // approximate end time
            meals.forEach(function (m) {
              var mTime = parseTime(m && m.time);
              if (mTime === null) return;
              var diff = mTime - trEnd;
              if (diff >= 30 && diff <= 120) iwScore += 0.3; // anabolic window
              else if (diff >= 0 && diff < 30) iwScore += 0.15; // too soon but ok
            });
          });
        }

        // Night fasting bonus (continuous)
        var longestGap = 0;
        if (gaps.length > 0) {
          gaps.forEach(function (g) { longestGap = Math.max(longestGap, g.gapMinutes || g.gap || 0); });
        }
        if (longestGap > 0) {
          var nightGapHours = longestGap / 60;
          var nightBonus = clamp((nightGapHours - 10) * 0.15, 0, 0.5);
          iwScore += nightBonus;
        }

        iwScore = clamp(iwScore, -2.0, 2.0);
        var iwAdjusted = iwScore * insulinConfidence;
        rawWeights.insulin = iwScore;
        if (iwAdjusted !== 0) {
          score += iwAdjusted;
          events.push({
            type: 'insulin',
            time: null,
            positive: iwScore > 0,
            icon: EVENT_ICONS.insulin,
            label: iwScore > 0 ? 'Инсулиновые промежутки ✓' : 'Наложение инсулиновых волн',
            sortKey: 1200,
            weight: iwAdjusted
          });
          console.info('[HEYS.cascade] ⚡ InsulinWave (model v2.1.0 sigmoid overlap + log2 gap + night fasting):', {
            overlaps: overlaps.length, avgGap: Math.round(iwAvgGap),
            longestGap: Math.round(longestGap),
            nightFasting: longestGap > 0 ? +(longestGap / 60).toFixed(1) + 'h' : 'N/A',
            postTrainingMealBonus: trainings.length > 0 ? 'checked' : 'no training',
            rawScore: +iwScore.toFixed(2), confidence: insulinConfidence,
            adjustedScore: +iwAdjusted.toFixed(2)
          });
        }
      } catch (e) {
        console.warn('[HEYS.cascade] ⚡ InsulinWave error (non-fatal):', e && e.message);
      }
    } else {
      rawWeights.insulin = 0;
      console.info('[HEYS.cascade] ⚡ InsulinWave skipped:', { meals: meals.length, hasModule: !!(HEYS.InsulinWave && HEYS.InsulinWave.calculate) });
    }

    // ── ШАГ 11: Scoring summary + Confidence ────────────
    console.info('[HEYS.cascade] 📊 Scoring summary (model v2.2.0, before synergies):', {
      factorScores: rawWeights,
      totalScore: +score.toFixed(2),
      activeFactors: Object.keys(rawWeights).filter(function (k) { return rawWeights[k] !== 0; }).length,
      skippedFactors: Object.keys(rawWeights).filter(function (k) { return rawWeights[k] === 0; }).length,
      scoringMethod: 'v2.2.0 continuous (sigmoid/bell-curve/log2/tanh)'
    });

    var avgConfidence = 0;
    var confKeys = Object.keys(confidenceMap);
    if (confKeys.length > 0) {
      var confSum = 0;
      confKeys.forEach(function (k) { confSum += confidenceMap[k]; });
      avgConfidence = confSum / confKeys.length;
    }
    console.info('[HEYS.cascade] 🎯 Confidence layer (model v2.2.0):', {
      factors: confidenceMap,
      avgConfidence: +avgConfidence.toFixed(2),
      dataQuality: avgConfidence >= 0.8 ? 'HIGH' : avgConfidence >= 0.5 ? 'MEDIUM' : 'LOW',
      effect: 'weights × confidence = noise reduction with sparse data'
    });

    // ── ШАГ 12: Day-Type detection ──────────────────────
    var dayType = 'normal';
    if (todayTotalLoad > 60) {
      dayType = 'training_day';
    } else if (todayTotalLoad > 0 && todayTotalLoad <= 30) {
      dayType = 'active_rest';
    } else {
      var yLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yLoad += getTrainingLoad(t); });
      }
      if (yLoad > 60 && todayTotalLoad === 0) {
        dayType = 'rest_day';
      }
    }

    // Day-type adjustments to score
    if (dayType === 'training_day') {
      // Training days: meal timing matters more, sleep recovery more important
      // (already handled by per-factor logic, but add small bonus for high-effort days)
      if (score > 0) score *= 1.05;
    } else if (dayType === 'rest_day') {
      // Rest days: no training penalty (already handled), sleep is king
    }

    console.info('[HEYS.cascade] 📅 Day-type (model v2.1.0 context-aware):', {
      dayType: dayType, todayTrainingLoad: Math.round(todayTotalLoad),
      modifier: dayType === 'training_day' ? '×1.05 score bonus' : 'none',
      effect: dayType === 'rest_day' ? 'no training penalty, recovery focus'
        : dayType === 'active_rest' ? 'low-intensity encouraged'
          : dayType === 'training_day' ? 'higher calorie tolerance, sleep importance'
            : 'standard expectations'
    });

    // ── ШАГ 13: Cross-factor synergies ──────────────────
    var synergies = [];

    // 1. Sleep + Training Recovery: good sleep after training day
    if (dayType === 'rest_day' && sleepHours >= 7.5 && rawWeights.sleepDur > 0) {
      synergies.push({ name: 'sleep_training_recovery', bonus: 0.3, reason: 'Восстановительный сон после тренировки' });
    }

    // 2. NEAT + Steps: household activity pairs well with steps
    if (rawWeights.household > 0 && rawWeights.steps > 0) {
      synergies.push({ name: 'neat_steps', bonus: 0.2, reason: 'Высокая бытовая + шаговая активность' });
    }

    // 3. Meals + Insulin: quality meals with good insulin spacing
    if (rawWeights.insulin > 0.2) {
      var avgMealWeight = 0;
      var mealCount = 0;
      events.forEach(function (e) { if (e.type === 'meal') { avgMealWeight += e.weight; mealCount++; } });
      if (mealCount > 0) avgMealWeight /= mealCount;
      if (avgMealWeight > 0.3) {
        synergies.push({ name: 'meals_insulin', bonus: 0.25, reason: 'Качественные приёмы + правильные промежутки' });
      }
    }

    // 4. Morning Ritual: checkin + early meal/training before 10:00
    var hasEarlyAction = events.some(function (e) {
      return (e.type === 'meal' || e.type === 'training') && e.sortKey < 600;
    });
    if (rawWeights.checkin > 0 && hasEarlyAction) {
      synergies.push({ name: 'morning_ritual', bonus: 0.2, reason: 'Утренний ритуал: чекин + ранняя активность' });
    }

    // 5. Full Recovery Day: rest day + good sleep + no overeating
    if (dayType === 'rest_day' && rawWeights.sleepOnset > 0 && rawWeights.sleepDur > 0) {
      var noOvereating = !events.some(function (e) { return e.type === 'meal' && !e.positive; });
      if (noOvereating) {
        synergies.push({ name: 'full_recovery', bonus: 0.35, reason: 'Полный день восстановления' });
      }
    }

    // Apply synergy bonuses (max +1.3 total)
    var totalSynergyBonus = 0;
    synergies.forEach(function (s) { totalSynergyBonus += s.bonus; });
    totalSynergyBonus = Math.min(1.3, totalSynergyBonus);
    score += totalSynergyBonus;

    if (synergies.length > 0) {
      console.info('[HEYS.cascade] 🔗 Cross-factor synergies:', {
        count: synergies.length,
        synergies: synergies.map(function (s) { return s.name + ' (+' + s.bonus + ')'; }),
        totalBonus: +totalSynergyBonus.toFixed(2),
        capped: totalSynergyBonus === 1.3
      });
    }

    // ── ШАГ 14: Сортировка ───────────────────────────────
    events.sort(function (a, b) { return (a.sortKey || 0) - (b.sortKey || 0); });

    console.info('[HEYS.cascade] 📋 Events sorted (' + events.length + ' total):', events.map(function (e) {
      return { type: e.type, time: e.time, positive: e.positive, label: e.label, sortKey: e.sortKey };
    }));

    // ── ШАГ 15: Алгоритм цепочки (v2.2.0 soft chain) ────
    // v2.2.0: негативное событие уменьшает цепочку пропорционально тяжести,
    // а не обнуляет. Одна ошибка не перечёркивает весь прогресс.
    var chain = 0;
    var maxChain = 0;
    var warnings = [];
    var totalPenalty = 0;
    var chainLog = [];

    for (var ei = 0; ei < events.length; ei++) {
      var ev = events[ei];
      var prevChain = chain;
      if (ev.positive) {
        chain++;
        if (chain > maxChain) maxChain = chain;
        chainLog.push({
          type: ev.type, label: ev.label, positive: true,
          chainBefore: prevChain, chainAfter: chain,
          delta: '+1 → ' + chain
        });
      } else {
        var penalty = getChainPenalty(ev.weight || 0);
        var chainBefore = chain;
        chain = Math.max(0, chain - penalty);
        totalPenalty += penalty;
        warnings.push({
          time: ev.time,
          reason: ev.breakReason || 'Отклонение',
          label: ev.label,
          chainBefore: chainBefore,
          chainAfter: chain,
          penalty: penalty,
          weight: +(ev.weight || 0).toFixed(2)
        });
        chainLog.push({
          type: ev.type, label: ev.label, positive: false,
          chainBefore: chainBefore, chainAfter: chain,
          delta: '-' + penalty + ' → ' + chain + ' (weight=' + (ev.weight || 0).toFixed(2) + ', severity=' + (penalty === 3 ? 'SEVERE' : penalty === 2 ? 'MEDIUM' : 'MINOR') + ')'
        });
      }
    }

    console.info('[HEYS.cascade] ⛓️ Chain algorithm (model v2.2.0 soft degradation):', chainLog);
    console.info('[HEYS.cascade] 🔗 Chain result:', {
      finalChainLength: chain,
      maxChainToday: maxChain,
      warningsCount: warnings.length,
      totalPenalty: totalPenalty,
      model: 'v2.2.0 soft chain (penalty 1/2/3 by severity)',
      warnings: warnings.map(function (w) { return { time: w.time, reason: w.reason, penalty: w.penalty, chain: w.chainBefore + '→' + w.chainAfter }; })
    });

    // ── ШАГ 15b: CRS (Cascade Rate Score) v3.1.0 — кумулятивный импульс ──
    console.info('[HEYS.cascade.crs] ─── CRS v3.6.0 computation START ────────');

    // 1. Compute Daily Contribution Score (DCS)
    var dcsResult = computeDailyContribution(score, day, normAbs, pIndex, prof);
    var todayDcs = dcsResult.dcs;

    console.info('[HEYS.cascade.crs] 📊 DCS (Daily Contribution Score):', {
      dailyScore: +score.toFixed(2),
      formula: 'clamp(' + score.toFixed(2) + '/' + MOMENTUM_TARGET + ', ' + CRS_DCS_CLAMP_NEG + ', 1.0)',
      baseDcs: +clamp(score / MOMENTUM_TARGET, CRS_DCS_CLAMP_NEG, 1.0).toFixed(3),
      hasCriticalViolation: dcsResult.hasCriticalViolation,
      violationType: dcsResult.violationType,
      finalDcs: +todayDcs.toFixed(3)
    });

    // 2. Load DCS history and save today's DCS
    var crsClientId = (HEYS.utils && HEYS.utils.getCurrentClientId && HEYS.utils.getCurrentClientId()) || HEYS.currentClientId || '';
    var dcsHistory = loadDcsHistory(crsClientId);
    var todayStr = new Date().toISOString().slice(0, 10);
    dcsHistory[todayStr] = +todayDcs.toFixed(3);

    // 3. Backfill retroactive DCS for days without cached values
    // v3.4.2: pass surrounding days window for chronotype baseline computation
    var backfillCount = 0;
    for (var bi = 0; bi < prevDays30.length; bi++) {
      var bd = new Date();
      bd.setDate(bd.getDate() - (bi + 1));
      var bDateKey = bd.toISOString().slice(0, 10);
      // v3.5.1: also re-evaluate days with exact -0.500 value — these were likely
      // set with the wrong normKcal=2000 fallback (deficit_overshoot false positive).
      // getRetroactiveDcs does NOT use normKcal so it is immune to that bug.
      var isWrongOverride = (dcsHistory[bDateKey] === -0.5);
      if ((dcsHistory[bDateKey] === undefined || isWrongOverride) && prevDays30[bi]) {
        // Build surrounding window for this day's chronotype baseline:
        // use days bi-7..bi+7 from prevDays30 (excluding current day bi)
        var retroWindow = [];
        for (var bwi = Math.max(0, bi - 7); bwi < Math.min(prevDays30.length, bi + 8); bwi++) {
          if (bwi !== bi && prevDays30[bwi]) retroWindow.push(prevDays30[bwi]);
        }
        var retroDcs = getRetroactiveDcs(prevDays30[bi], retroWindow);
        if (retroDcs !== null) {
          dcsHistory[bDateKey] = +retroDcs.toFixed(3);
          backfillCount++;
        }
      }
    }
    if (backfillCount > 0) {
      console.info('[HEYS.cascade.crs] 📋 Retroactive DCS backfill/correction (v3.5.1):', { backfilledDays: backfillCount });
    }

    // Save updated history
    dcsHistory = saveDcsHistory(crsClientId, dcsHistory);

    // 4. Compute individual ceiling
    var ceilingResult = computeIndividualCeiling(dcsHistory, prevDays30, rawWeights);
    var ceiling = ceilingResult.ceiling;

    console.info('[HEYS.cascade.crs] 🏔️ Individual ceiling:', ceilingResult);

    // 5. Compute CRS via EMA (base = completed days only) + today's direct effect
    var crsBase = computeCascadeRate(dcsHistory, ceiling, todayStr);

    // v3.7.0: today's actions give instant visible impact to CRS
    // Positive DCS gives slight boost (up to +3%).
    // Negative DCS (violations) gives heavy penalty (up to -10%).
    var todayBoost = 0;
    if (todayDcs > 0) {
      todayBoost = todayDcs * CRS_TODAY_BOOST;
    } else if (todayDcs < -0.1) {
      // Intraday negative DCS instantly affects CRS to show immediate consequence
      // e.g. DCS -0.7 means -0.07 (-7%) instant drop in addition to EMA.
      todayBoost = todayDcs * CRS_TODAY_PENALTY;
    }

    var crs = +clamp(crsBase + todayBoost, 0, ceiling).toFixed(3);

    console.info('[HEYS.cascade.crs] 📈 CRS (Cascade Rate Score) v3.7.0:', {
      crsBase: +crsBase.toFixed(3),
      todayBoost: +todayBoost.toFixed(4),
      crs: crs,
      formula: 'CRS_base(' + crsBase.toFixed(3) + ') + todayBoost(' + todayBoost.toFixed(3) + ') = ' + crs,
      ceiling: ceiling,
      dcsToday: +todayDcs.toFixed(3),
      dcsHistoryDays: Object.keys(dcsHistory).length,
      emaDecay: CRS_DECAY,
      window: CRS_WINDOW + ' days (completed only)'
    });

    // 6. Compute CRS trend
    var crsTrend = getCrsTrend(dcsHistory, todayStr);

    console.info('[HEYS.cascade.crs] 📊 CRS trend:', {
      trend: crsTrend,
      interpretation: crsTrend === 'up' ? 'Улучшение за 7 дней' : crsTrend === 'down' ? 'Снижение за 7 дней' : 'Стабильно'
    });

    // 7. Compute daysAtPeak — consecutive days starting FROM today with DCS ≥ 0.5
    // If today is weak, streak must be 0 (historical streak is considered broken).
    var daysAtPeak = 0;
    if (todayDcs >= 0.5) {
      daysAtPeak = 1;
      var sortedHistoryDates = Object.keys(dcsHistory)
        .filter(function (d) { return d !== todayStr; })
        .sort()
        .reverse();
      for (var _pi = 0; _pi < sortedHistoryDates.length; _pi++) {
        if (dcsHistory[sortedHistoryDates[_pi]] >= 0.5) {
          daysAtPeak++;
        } else {
          break;
        }
      }
    }

    console.info('[HEYS.cascade.crs] 🔥 Days at peak (DCS ≥ 0.5 consecutively):', {
      daysAtPeak: daysAtPeak,
      todayDcs: +todayDcs.toFixed(3)
    });

    console.info('[HEYS.cascade.crs] ─── CRS v3.6.0 computation DONE ────────');

    // ── ШАГ 16: Определение состояния (v3.1.0 CRS-driven) ───
    // v3.1.0: состояние определяется по CRS (кумулятивный импульс),
    // а не по дневному score. 14 дней хороших решений создают инерцию,
    // которую один плохой день не может разрушить.
    var state = STATES.EMPTY;

    if (events.length === 0) {
      state = STATES.EMPTY;
    } else if (crs >= CRS_THRESHOLDS.STRONG) {
      state = STATES.STRONG;
    } else if (crs >= CRS_THRESHOLDS.GROWING) {
      state = STATES.GROWING;
    } else if (crs >= CRS_THRESHOLDS.BUILDING) {
      state = STATES.BUILDING;
    } else if (crs > CRS_THRESHOLDS.RECOVERY) {
      state = STATES.RECOVERY;
    } else {
      state = STATES.BROKEN;
    }

    console.info('[HEYS.cascade] 🏷️ State determination (v3.1.0 CRS-driven):', {
      eventsLength: events.length,
      crs: +crs.toFixed(3),
      dailyScore: +score.toFixed(2),
      thresholds: CRS_THRESHOLDS,
      model: 'CRS-driven (cumulative momentum)',
      crsTrend: crsTrend,
      detectedState: state
    });

    // ── ШАГ 17: Post-training window ──────────────────────
    var lastTraining = trainings.length > 0 ? trainings[trainings.length - 1] : null;
    var postTrainingWindow = lastTraining && lastTraining.time ? isWithinHours(lastTraining.time, 2) : false;

    console.info('[HEYS.cascade] ⏰ Post-training window:', {
      lastTrainingTime: (lastTraining && lastTraining.time) || null,
      windowActive: postTrainingWindow,
      windowDuration: '2ч после последней тренировки',
      effect: postTrainingWindow ? 'Пул: ANTI_LICENSING' : 'Обычный пул состояния'
    });

    // ── ШАГ 18: Выбор сообщения ──────────────────────────
    var messagePoolKey;
    if (hasDeficitOvershoot && state !== STATES.BROKEN && state !== STATES.EMPTY) {
      // v3.1.0: перебор калорий при дефиците — приоритет выше тренировочного окна
      messagePoolKey = 'DEFICIT_OVERSHOOT';
    } else if (postTrainingWindow && state !== STATES.BROKEN && state !== STATES.EMPTY) {
      messagePoolKey = 'ANTI_LICENSING';
    } else {
      messagePoolKey = state;
    }
    console.info('[HEYS.cascade] 💬 Message pool selected:', {
      pool: messagePoolKey, hasDeficitOvershoot: hasDeficitOvershoot,
      postTrainingWindow: postTrainingWindow, state: state
    });
    var messagePool = MESSAGES[messagePoolKey] || MESSAGES.BUILDING;
    var message = pickMessage(messagePool, messagePoolKey);

    // ── ШАГ 19: Momentum score (v3.1.0 CRS-based) ────────
    // v3.1.0: прогресс-бар = CRS (кумулятивный импульс), не дневной score
    var momentumScore = crs;
    var dailyMomentum = Math.min(1, Math.max(0, score) / MOMENTUM_TARGET);

    console.info('[HEYS.cascade] 📊 Momentum score (v3.1.0 CRS):', {
      formula: 'CRS (cumulative momentum)',
      crs: +crs.toFixed(3),
      dailyScore: +score.toFixed(2),
      dailyProgress: Math.round(dailyMomentum * 100) + '%',
      crsProgress: Math.round(crs * 100) + '%',
      crsTrend: crsTrend
    });

    // ── ШАГ 20: Next step hint ────────────────────────────
    var nextStepHint = null;
    if (hasDeficitOvershoot) {
      // v3.1.0: срыв по калориям при дефиците — специальная подсказка
      nextStepHint = 'Завтра верни калории в норму — один день всегда можно компенсировать';
    } else if (state !== STATES.EMPTY) {
      var hasMeal = events.some(function (e) { return e.type === 'meal'; });
      var hasTraining = events.some(function (e) { return e.type === 'training'; });
      var hasSleepEv = events.some(function (e) { return e.type === 'sleep'; });
      var hasCheckinEv = events.some(function (e) { return e.type === 'checkin'; });
      var hasMeasEv = events.some(function (e) { return e.type === 'measurements'; });

      if (!hasMeal && currentHour < 20) {
        nextStepHint = 'Добавь первый приём пищи';
      } else if (!hasTraining && currentHour >= 6 && currentHour < 20) {
        nextStepHint = 'Тренировка или прогулка добавят звено в цепочку';
      } else if (!hasCheckinEv && currentHour < 11) {
        nextStepHint = 'Взвесься утром — это поможет отслеживать прогресс';
      } else if (!hasMeasEv && currentHour < 11) {
        nextStepHint = 'Сними замеры — это повысит точность анализа';
      } else if (!hasSleepEv) {
        nextStepHint = 'Зафиксируй время засыпания для анализа сна';
      } else if (currentHour < 21 && chain > 0) {
        nextStepHint = 'Продолжай — следующее решение усилит цепочку';
      }

      console.info('[HEYS.cascade] 💡 Next step hint:', {
        hasMeal: hasMeal, hasTraining: hasTraining, hasSleep: hasSleepEv,
        hasCheckin: hasCheckinEv, hasMeasurements: hasMeasEv,
        currentHour: currentHour, hint: nextStepHint
      });
    }

    // ── ИТОГОВЫЙ РЕЗУЛЬТАТ ────────────────────────────────
    var elapsed = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;

    console.info('[HEYS.cascade] ✅ computeCascadeState v3.6.0 DONE:', {
      state: state,
      crs: +crs.toFixed(3),
      crsBase: +crsBase.toFixed(3),
      todayBoost: +todayBoost.toFixed(4),
      crsTrend: crsTrend,
      ceiling: ceiling,
      dailyScore: +score.toFixed(2),
      dailyContribution: +todayDcs.toFixed(3),
      chainLength: chain,
      maxChainToday: maxChain,
      momentumScore: +momentumScore.toFixed(3),
      progressPercent: Math.round(momentumScore * 100) + '%',
      eventsCount: events.length,
      warningsCount: warnings.length,
      totalPenalty: totalPenalty,
      chainModel: 'soft (penalty 1/2/3)',
      stateModel: 'CRS-driven (cumulative momentum)',
      postTrainingWindow: postTrainingWindow,
      // v3.1.0: goal-aware calorie penalty result
      goalMode: mealGoalMode ? mealGoalMode.mode : null,
      hasDeficitOvershoot: hasDeficitOvershoot,
      deficitOvershootRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
      deficitViolationType: dcsResult.violationType,
      message: message.short,
      nextStepHint: nextStepHint,
      elapsed: elapsed.toFixed(2) + 'ms'
    });
    console.info('[HEYS.cascade] 🧬 v3.6.0 subsystems:', {
      crs: {
        value: +crs.toFixed(3),
        base: +crsBase.toFixed(3),
        todayBoost: +todayBoost.toFixed(4),
        formula: 'base + DCS × ' + CRS_TODAY_BOOST,
        ceiling: ceiling,
        dcsToday: +todayDcs.toFixed(3),
        trend: crsTrend,
        emaDecay: CRS_DECAY,
        window: CRS_WINDOW + ' (completed days only)',
        thresholds: CRS_THRESHOLDS,
        hasCriticalViolation: dcsResult.hasCriticalViolation
      },
      dayType: dayType,
      synergies: synergies.length > 0
        ? synergies.map(function (s) { return s.name + ' (+' + s.bonus + ': ' + s.reason + ')'; })
        : '(none)',
      synergiesBonus: +synergies.reduce(function (s, x) { return s + x.bonus; }, 0).toFixed(2),
      confidenceLayer: {
        avg: +avgConfidence.toFixed(2),
        quality: avgConfidence >= 0.8 ? 'HIGH' : avgConfidence >= 0.5 ? 'MEDIUM' : 'LOW',
        perFactor: confidenceMap
      },
      chainModel: {
        type: 'soft degradation',
        penalties: { MINOR: CHAIN_PENALTY.MINOR, MEDIUM: CHAIN_PENALTY.MEDIUM, SEVERE: CHAIN_PENALTY.SEVERE },
        thresholds: CHAIN_PENALTY_THRESHOLDS,
        totalPenalty: totalPenalty,
        warningsCount: warnings.length
      },
      stateModel: 'CRS = base(EMA completed days) + DCS×0.03 (STRONG≥0.75, GROWING≥0.45, BUILDING≥0.20, RECOVERY>0.05, BROKEN≤0.05)',
      scoringMethod: 'continuous (sigmoid/bell-curve/log2/tanh)',
      personalBaselines: '14-day rolling median → 30-day for CRS',
      thresholds: { CRS: CRS_THRESHOLDS, daily: SCORE_THRESHOLDS, MOMENTUM_TARGET: MOMENTUM_TARGET },
      // v3.1.0: goal-aware calorie penalty sub-system
      goalAwarePenalty: {
        goalMode: mealGoalMode ? mealGoalMode.mode : null,
        goalLabel: mealGoalMode ? mealGoalMode.label : null,
        hasDeficitOvershoot: hasDeficitOvershoot,
        deficitOvershootRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
        dcsContext: dcsResult.deficitContext || null,
        messagePool: hasDeficitOvershoot ? 'DEFICIT_OVERSHOOT' : null
      }
    });
    console.info('[HEYS.cascade] ─────────────────────────────────────────────');

    // ── ИСТОРИЧЕСКИЕ СОБЫТИЯ для multi-day timeline ──────
    var historicalDays = [];
    for (var hdi = 0; hdi < prevDays30.length; hdi++) {
      var hDayRef = prevDays30[hdi];
      if (!hDayRef) continue;
      var hEvts = buildDayEventsSimple(hDayRef, mealBandShift);
      if (hEvts.length === 0) continue;
      var hDateD = new Date();
      hDateD.setDate(hDateD.getDate() - (hdi + 1));
      historicalDays.push({
        dateStr: hDateD.toISOString().slice(0, 10),
        label: getDateLabel(hdi + 1),
        events: hEvts
      });
    }
    // 🚀 PERF: Reduced cascade history logging — summary only instead of 30+ individual logs
    if (historicalDays.length > 0) {
      console.info('[HEYS.cascade] 📅 historicalDays built: ' + historicalDays.length + ' days, events: ' + historicalDays.reduce(function (s, d) { return s + d.events.length; }, 0));
    }

    var result = {
      events: events,
      chainLength: chain,
      maxChainToday: maxChain,
      score: +score.toFixed(2),
      warnings: warnings,
      state: state,
      momentumScore: momentumScore,
      postTrainingWindow: postTrainingWindow,
      message: message,
      nextStepHint: nextStepHint,
      dayType: dayType,
      synergies: synergies,
      confidence: confidenceMap,
      avgConfidence: +avgConfidence.toFixed(2),
      rawWeights: rawWeights,
      // v3.1.0 CRS fields
      crs: +crs.toFixed(3),
      crsBase: +crsBase.toFixed(3),        // v3.6.0: EMA of completed days only
      todayBoost: +todayBoost.toFixed(4),   // v3.6.0: DCS × 0.03
      ceiling: ceiling,
      dailyContribution: +todayDcs.toFixed(3),
      dailyMomentum: +dailyMomentum.toFixed(3),
      hasCriticalViolation: dcsResult.hasCriticalViolation,
      crsTrend: crsTrend,
      daysAtPeak: daysAtPeak,
      dcsHistory: dcsHistory,
      historicalDays: historicalDays,
      // v3.1.0: Goal-aware overshoot fields
      hasDeficitOvershoot: hasDeficitOvershoot,
      deficitOvershootRatio: deficitOvershootRatio ? +deficitOvershootRatio.toFixed(2) : null,
      goalMode: mealGoalMode ? mealGoalMode.mode : null
    };

    // Сохраняем глобально для CrsProgressBar и диспатчим событие
    window.HEYS = window.HEYS || {};
    window.HEYS._lastCrs = result;

    console.info('[HEYS.cascade] ⚙️ computeCascadeState finished. New CRS:', result.crs, 'Events:', events.map(function (e) { return e.type + '(' + e.weight.toFixed(2) + ')'; }).join(', '));

    window.dispatchEvent(new CustomEvent('heys:crs-updated', { detail: result }));

    return result;
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: ChainDots
  // ─────────────────────────────────────────────────────

  function getEventColor(w) {
    if (w <= -0.5) return '#dc2626'; // Red (хуже)
    if (w < 0) return '#f97316'; // Orange (негативное)
    if (w === 0) return '#facc15'; // Yellow (нейтральное)
    if (w <= 0.5) return '#84cc16'; // Light Green (хорошее)
    if (w <= 1.5) return '#22c55e'; // Green (очень хорошее)
    return '#10b981'; // Emerald (отличное)
  }

  function ChainDots(props) {
    var events = props.events;
    var [isRevealed, setIsRevealed] = React.useState(false);

    React.useEffect(function () {
      // Reset to hidden first, then double-rAF to reveal (so animation replays on data change)
      setIsRevealed(false);

      var raf = requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setIsRevealed(true);
        });
      });
      return function () { cancelAnimationFrame(raf); };
    }, [events ? events.length : 0]);

    if (!events || events.length === 0) return null;

    var children = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var isLast = i === events.length - 1;
      var dotClass = [
        'cascade-dot',
        (isLast && ev.positive) ? 'cascade-dot--latest' : null
      ].filter(Boolean).join(' ');

      if (i > 0) {
        children.push(React.createElement('div', {
          key: 'conn-' + i,
          className: 'cascade-dot-connector' + (!ev.positive ? ' cascade-dot-connector--warning' : '')
        }));
      }

      var w = ev.weight || 0;
      var wStr = (w > 0 ? '+' : '') + w.toFixed(1);

      children.push(React.createElement('div', {
        key: 'dot-' + i,
        className: dotClass,
        style: { background: getEventColor(w) },
        title: (ev.time ? formatTimeShort(ev.time) + ' · ' : '') + ev.label + ' (' + wStr + ')'
      }));
    }

    return React.createElement('div', {
      className: 'cascade-chain-dots animate-always' + (isRevealed ? ' is-revealed' : '')
    }, children);
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: CascadeTimeline
  // ─────────────────────────────────────────────────────

  function CascadeTimeline(props) {
    var events = props.events;
    var historicalDays = props.historicalDays || [];
    var nextStepHint = props.nextStepHint;

    function renderEventRow(ev, key) {
      var w = ev.weight || 0;
      var wAbs = Math.abs(w);
      var wSign = w >= 0 ? '+' : '−';
      var wLabel = wSign + (wAbs >= 0.05 ? (wAbs >= 10 ? Math.round(wAbs).toString() : wAbs.toFixed(1)) : '<0.1');
      var wClass = w >= 0.05 ? 'cascade-timeline-weight--pos'
        : w <= -0.05 ? 'cascade-timeline-weight--neg'
          : 'cascade-timeline-weight--zero';

      return React.createElement('div', {
        key: key,
        className: 'cascade-timeline-row cascade-timeline-row--' + (ev.positive ? 'positive' : 'warning')
      },
        React.createElement('span', { className: 'cascade-timeline-icon' }, ev.icon),
        React.createElement('span', { className: 'cascade-timeline-time' },
          ev.time ? formatTimeShort(ev.time) : '—'
        ),
        React.createElement('span', { className: 'cascade-timeline-label' }, ev.label),
        React.createElement('span', { className: 'cascade-timeline-weight ' + wClass }, wLabel),
        React.createElement('span', { className: 'cascade-timeline-badge' },
          ev.positive ? '✓' : (ev.breakReason || '⚠')
        )
      );
    }

    function renderSectionHeader(label, isToday, key) {
      return React.createElement('div', {
        key: key,
        className: 'cascade-timeline-section' + (isToday ? ' cascade-timeline-section--today' : '')
      }, label);
    }

    var children = [];

    // Секция «Сегодня»
    children.push(renderSectionHeader('📅 Сегодня', true, 'h-today'));
    for (var ti = events.length - 1; ti >= 0; ti--) {
      children.push(renderEventRow(events[ti], 'today-' + ti));
    }

    // Исторические секции
    for (var hi = 0; hi < historicalDays.length; hi++) {
      var hd = historicalDays[hi];
      children.push(renderSectionHeader(hd.label, false, 'h-sec-' + hi));
      for (var hei = hd.events.length - 1; hei >= 0; hei--) {
        children.push(renderEventRow(hd.events[hei], 'h-' + hi + '-' + hei));
      }
    }

    if (nextStepHint) {
      children.push(React.createElement('div', { key: 'next', className: 'cascade-next-step' },
        React.createElement('span', { className: 'cascade-next-step-icon' }, '💡'),
        React.createElement('span', null, nextStepHint)
      ));
    }

    return React.createElement('div', { className: 'cascade-timeline-scroll' },
      React.createElement('div', { className: 'cascade-timeline' }, children)
    );
  }

  // ─────────────────────────────────────────────────────
  // ГЛАВНЫЙ КОМПОНЕНТ: CascadeCard (standalone, no deps)
  // Полностью независим от HEYS.ExpandableCard.
  // Управляет expanded через React.useState.
  // ─────────────────────────────────────────────────────

  function CascadeCard(props) {
    var events = props.events;
    var chainLength = props.chainLength;
    var maxChainToday = props.maxChainToday;
    var state = props.state;
    var momentumScore = props.momentumScore;
    var postTrainingWindow = props.postTrainingWindow;
    var message = props.message;
    var nextStepHint = props.nextStepHint;
    var warnings = props.warnings;
    var crsTrend = props.crsTrend || 'flat';
    var crs = props.crs || 0;
    var crsBase = props.crsBase || 0;         // v3.6.0
    var todayBoost = props.todayBoost || 0;    // v3.6.0
    var ceiling = props.ceiling || 0;
    var dailyMomentum = props.dailyMomentum || 0;
    var dailyContribution = props.dailyContribution || 0;
    var daysAtPeak = props.daysAtPeak || 0;
    var dcsHistory = props.dcsHistory || {};
    var historicalDays = props.historicalDays || [];

    var expandedState = React.useState(false);
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];

    var config = STATE_CONFIG[state] || STATE_CONFIG.EMPTY;
    // v3.1.0: Badge shows CRS progress with trend arrow
    var trendArrow = crsTrend === 'up' ? ' ↑' : crsTrend === 'down' ? ' ↓' : '';
    var progressPct = Math.round(momentumScore * 100);
    var badgeText = progressPct > 0 ? (progressPct + '%' + trendArrow) : '—';
    var ceilingPct = Math.round(ceiling * 100);
    // Russian plural for дней подряд
    var peakDaysLabel = daysAtPeak === 1 ? '1 день' : (daysAtPeak >= 2 && daysAtPeak <= 4) ? daysAtPeak + ' дня' : daysAtPeak + ' дней';

    // Animate progress bar 0 → progressPct on mount via CSS transition (double-rAF pump)
    var animBarState = React.useState(0);
    var animBarWidth = animBarState[0];
    var setAnimBarWidth = animBarState[1];
    var animBarReadyState = React.useState(false);
    var animBarReady = animBarReadyState[0];
    var setAnimBarReady = animBarReadyState[1];
    var animBarRafRef = React.useRef(null);

    React.useEffect(function () {
      setAnimBarWidth(0);
      setAnimBarReady(false);
      if (animBarRafRef.current) cancelAnimationFrame(animBarRafRef.current);

      // Two rAFs: first paint shows 0%, then enable CSS transition and jump to target
      var raf1 = requestAnimationFrame(function () {
        animBarRafRef.current = requestAnimationFrame(function () {
          setAnimBarReady(true);    // remove no-transition → CSS transition kicks in
          setAnimBarWidth(progressPct); // CSS handles 1.4s ease-out
        });
      });
      return function () {
        cancelAnimationFrame(raf1);
        if (animBarRafRef.current) cancelAnimationFrame(animBarRafRef.current);
      };
    }, [progressPct]);

    var copyCascadeHistory = async function (e) {
      if (e && e.stopPropagation) e.stopPropagation();

      var startedAt = Date.now();
      var dcsDates = Object.keys(dcsHistory || {}).sort().reverse();
      var historicalEventsCount = (historicalDays || []).reduce(function (sum, day) {
        return sum + (((day && day.events) || []).length);
      }, 0);

      console.info('[HEYS.cascade.copy] ✅ Start copy CRS history:', {
        state: state,
        crs: +crs.toFixed(3),
        dcsDays: dcsDates.length,
        todayEvents: (events || []).length,
        historicalDays: (historicalDays || []).length,
        historicalEvents: historicalEventsCount,
        warnings: (warnings || []).length
      });

      try {
        var lines = [
          '═══════════════════════════════════════════════',
          '📈 HEYS — История влияния на каскад (CRS)',
          'Дата выгрузки: ' + new Date().toLocaleString('ru-RU'),
          '═══════════════════════════════════════════════',
          '',
          'Сводка:',
          '  • Состояние: ' + state,
          '  • CRS: ' + progressPct + '% (' + (+crs.toFixed(3)) + ')',
          '  • CRS база: ' + Math.round(crsBase * 100) + '% | бонус дня: +' + (todayBoost * 100).toFixed(1) + '%',
          '  • Потолок (ceiling): ' + ceilingPct + '% (' + (+ceiling.toFixed(3)) + ')',
          '  • Тренд CRS: ' + crsTrend,
          '  • Дней на пике (DCS ≥ 0.5): ' + daysAtPeak,
          '  • Текущий score дня: ' + (+((props && props.score) || 0).toFixed(2)),
          '  • Дневной вклад (DCS): ' + (+dailyContribution.toFixed(3)),
          ''
        ];

        lines.push('DCS история (для расчёта CRS, свежие сверху):');
        if (!dcsDates.length) {
          lines.push('  (нет данных)');
        } else {
          for (var di = 0; di < dcsDates.length; di++) {
            var dDate = dcsDates[di];
            var dVal = dcsHistory[dDate];
            var dSign = dVal >= 0 ? '+' : '';
            lines.push('  ' + (di + 1) + '. ' + dDate + ' → ' + dSign + (+dVal).toFixed(3));
          }
        }

        lines.push('');
        lines.push('События сегодня (влияние на score):');
        if (!events || events.length === 0) {
          lines.push('  (нет событий)');
        } else {
          for (var ei = 0; ei < events.length; ei++) {
            var ev = events[ei];
            var w = typeof ev.weight === 'number' ? ev.weight : 0;
            var wSign = w >= 0 ? '+' : '';
            lines.push(
              '  ' + (ei + 1) + '. ' +
              (ev.time ? (formatTimeShort(ev.time) + ' | ') : '') +
              (ev.type || 'event') +
              ' | ' + (ev.label || '—') +
              ' | вес=' + wSign + w.toFixed(2) +
              ' | ' + (ev.positive ? 'positive' : 'warning') +
              (ev.breakReason ? (' | причина: ' + ev.breakReason) : '')
            );
          }
        }

        lines.push('');
        lines.push('История дней (ретроспектива влияния):');
        if (!historicalDays || historicalDays.length === 0) {
          lines.push('  (нет ретроспективы)');
        } else {
          for (var hi = 0; hi < historicalDays.length; hi++) {
            var hd = historicalDays[hi];
            lines.push('  [' + (hd.dateStr || hd.label || ('day_' + hi)) + '] ' + (hd.label || ''));
            var hdEvents = (hd && hd.events) || [];
            if (!hdEvents.length) {
              lines.push('    • (нет событий)');
              continue;
            }
            for (var hde = 0; hde < hdEvents.length; hde++) {
              var hev = hdEvents[hde];
              var hw = typeof hev.weight === 'number' ? hev.weight : 0;
              var hwSign = hw >= 0 ? '+' : '';
              lines.push(
                '    • ' +
                (hev.time ? (formatTimeShort(hev.time) + ' | ') : '') +
                (hev.type || 'event') +
                ' | ' + (hev.label || '—') +
                ' | вес=' + hwSign + hw.toFixed(2) +
                ' | ' + (hev.positive ? 'positive' : 'warning')
              );
            }
          }
        }

        lines.push('');
        lines.push('Предупреждения / штрафы цепочки:');
        if (!warnings || warnings.length === 0) {
          lines.push('  (нет)');
        } else {
          for (var wi = 0; wi < warnings.length; wi++) {
            var wng = warnings[wi];
            lines.push(
              '  ' + (wi + 1) + '. ' +
              (wng.time ? formatTimeShort(wng.time) + ' | ' : '') +
              (wng.reason || 'Отклонение') +
              ' | penalty=' + (wng.penalty || 0) +
              ' | chain: ' + (wng.chainBefore == null ? '?' : wng.chainBefore) + '→' + (wng.chainAfter == null ? '?' : wng.chainAfter) +
              (typeof wng.weight === 'number' ? (' | weight=' + wng.weight.toFixed(2)) : '')
            );
          }
        }

        lines.push('');
        lines.push('═══════════════════════════════════════════════');

        var text = lines.join('\n');

        try {
          if (!navigator || !navigator.clipboard || !navigator.clipboard.writeText) {
            throw new Error('Clipboard API unavailable');
          }
          await navigator.clipboard.writeText(text);
        } catch (_clipErr) {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }

        console.info('[HEYS.cascade.copy] ✅ CRS history copied:', {
          chars: text.length,
          dcsDays: dcsDates.length,
          todayEvents: (events || []).length,
          historicalDays: (historicalDays || []).length,
          tookMs: Date.now() - startedAt
        });
        if (HEYS.Toast && HEYS.Toast.success) {
          HEYS.Toast.success('История влияния CRS скопирована');
        }
      } catch (err) {
        console.error('[HEYS.cascade.copy] ❌ Copy failed:', {
          message: err && err.message ? err.message : String(err)
        });
        if (HEYS.Toast && HEYS.Toast.error) {
          HEYS.Toast.error('Не удалось скопировать историю CRS');
        }
      }
    };

    // Throttle render log — once per session (same strategy as MealRec P1 fix)
    if (!window.__heysLoggedCascadeRender) {
      window.__heysLoggedCascadeRender = true;
      console.info('[HEYS.cascade] ✅ CascadeCard rendered:', {
        state: state,
        crs: crs,
        crsTrend: crsTrend,
        chainLength: chainLength,
        maxChainToday: maxChainToday,
        progressPct: progressPct + '/' + ceilingPct + '%',
        daysAtPeak: daysAtPeak,
        eventsCount: events.length
      });
    }

    // ── Адаптивный тон карточки v2 — на основе весов, не счётчиков ──
    // Логика: смотрим на долю «негативного веса» относительно суммарного.
    // negativeRatio = |neg| / (pos + |neg|) → 0.0 (всё позитивно) … 1.0 (всё плохо)
    // Пороги: < 0.22 → green, 0.22–0.48 → amber, > 0.48 → red
    // Бонус: при высоком импульсе (progressPct ≥ 55) порог amber поднимается до 0.32
    // Ранний день (< 3 событий): порог amber поднимается до 0.40 — не пугаем раньше времени
    var totalPositiveWeight = events.reduce(function (s, e) {
      return e.positive ? s + (typeof e.weight === 'number' ? Math.abs(e.weight) : 0) : s;
    }, 0);
    var totalNegativeWeight = events.reduce(function (s, e) {
      return !e.positive ? s + (typeof e.weight === 'number' ? Math.abs(e.weight) : 0) : s;
    }, 0);
    var totalWeight = totalPositiveWeight + totalNegativeWeight;
    var negativeRatio = totalWeight > 0.001 ? totalNegativeWeight / totalWeight : 0;

    // Адаптивный порог перехода в amber:
    //   — ранний день (< 3 события) → 0.40 (не реагируем на единичный минус)
    //   — хороший импульс (≥ 55%) → 0.32 (допускаем чуть больше негатива)
    //   — иначе → 0.22
    var amberThreshold = events.length < 3 ? 0.40 : (progressPct >= 55 ? 0.32 : 0.22);
    // Порог перехода в red: > 0.48, и только если прогресс < 65% (иначе amber, ведь день ещё хорош)
    var redThreshold = 0.48;

    var cardTone;
    if (events.length === 0) {
      cardTone = 'neutral';
    } else if (negativeRatio > redThreshold && progressPct < 65) {
      cardTone = 'red';
    } else if (negativeRatio > amberThreshold) {
      cardTone = 'amber';
    } else {
      cardTone = 'green';
    }

    console.info('[HEYS.cascade] 🎨 cardTone:', cardTone, {
      negativeRatio: +negativeRatio.toFixed(3),
      totalPositiveWeight: +totalPositiveWeight.toFixed(2),
      totalNegativeWeight: +totalNegativeWeight.toFixed(2),
      amberThreshold: amberThreshold,
      progressPct: progressPct
    });

    return React.createElement('div', {
      className: 'cascade-card cascade-card--' + state.toLowerCase() + ' cascade-card--tone-' + cardTone,
      style: {}
    },

      // ── Header (кликабельный toggle) ─────────────────
      React.createElement('button', {
        className: 'cascade-card__header',
        onClick: function () {
          var next = !expanded;
          setExpanded(next);
          console.info('[HEYS.cascade] 🔄 Toggle expanded:', next, '| state:', state);
        },
        'aria-expanded': expanded,
        'aria-label': 'Развернуть позитивный каскад'
      },

        // Заголовок
        React.createElement('div', { className: 'cascade-card__title-row' },
          React.createElement('span', { className: 'cascade-card__title' }, (config.icon || '✨') + ' Ваш позитивный каскад'),
          progressPct > 0 && React.createElement('span', {
            className: 'cascade-card__badge',
            style: { background: config.color }
          }, badgeText)
        ),

        // Подзаголовок / сообщение
        React.createElement('div', { className: 'cascade-card__subtitle' },
          (message && message.short) || config.label
        ),

        // Хинт anti-licensing (2ч после тренировки)
        postTrainingWindow && React.createElement('div', {
          className: 'cascade-card__hint cascade-card__hint--training'
        }, '⏰ Окно после тренировки — выбери качество, а не количество'),

        // Цепочка точек (всегда показываем в шапке)
        React.createElement(ChainDots, { events: events }),

        // Прогресс-бар (анимируется от 0 → progressPct за 1.4с)
        React.createElement('div', { className: 'cascade-card__progress-track animate-always' },
          React.createElement('div', {
            className: 'cascade-card__progress-bar animate-always' + (animBarReady ? '' : ' no-transition'),
            style: { width: animBarWidth + '%', background: config.color }
          })
        ),

        // Chevron
        React.createElement('span', {
          className: 'cascade-card__chevron' + (expanded ? ' cascade-card__chevron--open' : '')
        }, '›')
      ),

      // ── Развёрнутый контент ──────────────────────────
      expanded && React.createElement('div', { className: 'cascade-card__body' },
        React.createElement(CascadeTimeline, {
          events: events,
          historicalDays: historicalDays,
          nextStepHint: nextStepHint
        }),
        warnings && warnings.length > 0 && React.createElement('div', { className: 'cascade-card__breaks-info' },
          React.createElement('span', { className: 'cascade-card__breaks-label' },
            '⚠️ Отклонений: ' + warnings.length + ' (−' + warnings.reduce(function (s, w) { return s + w.penalty; }, 0) + ' к цепочке)'
          )
        ),
        React.createElement('div', { className: 'cascade-card__stats' },
          React.createElement('span', { className: 'cascade-card__stat' },
            '📈 Импульс: ', React.createElement('strong', null, progressPct + '/' + ceilingPct + '%'),
            trendArrow ? (' ' + trendArrow) : null
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '🔗 Цепочка: ', React.createElement('strong', null, chainLength)
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '💎 Потолок: ', React.createElement('strong', null, ceilingPct + '%')
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '🔥 На пике: ', React.createElement('strong', null, peakDaysLabel)
          )
        ),
        React.createElement('div', { className: 'cascade-card__copy-wrap' },
          React.createElement('button', {
            type: 'button',
            className: 'cascade-card__copy-btn',
            onClick: copyCascadeHistory,
            title: 'Скопировать всю историю влияния на CRS в буфер обмена'
          }, 'copy CRS log')
        )
      )
    );
  }

  // ─────────────────────────────────────────────────────
  // ТОЧКА ВХОДА: renderCard
  // ─────────────────────────────────────────────────────

  // P2-cascade fix: React.memo to skip re-render when cascade data hasn't changed
  var MemoizedCascadeCard = React.memo(CascadeCard, function (prev, next) {
    return prev.state === next.state &&
      prev.score === next.score &&
      prev.chainLength === next.chainLength &&
      prev.maxChainToday === next.maxChainToday &&
      prev.momentumScore === next.momentumScore &&
      prev.crs === next.crs &&
      prev.crsTrend === next.crsTrend &&
      prev.ceiling === next.ceiling &&
      prev.daysAtPeak === next.daysAtPeak &&
      Object.keys(prev.dcsHistory || {}).length === Object.keys(next.dcsHistory || {}).length &&
      (prev.historicalDays || []).length === (next.historicalDays || []).length &&
      prev.nextStepHint === next.nextStepHint &&
      prev.postTrainingWindow === next.postTrainingWindow &&
      (prev.events && prev.events.length) === (next.events && next.events.length);
  });

  // P1-cascade fix: throttle renderCard log to once per session (mirrors mealRec P1)
  var _cascadeRenderCount = 0;
  // v10.0: day-update version counter — инкрементируется при каждом batch/force-sync invalidation.
  // Включён в buildInputSignature чтобы кэш гарантированно промазывал после записи исторических дней,
  // даже если сегодняшний day-объект не изменился.
  var _cascadeDayUpdateVersion = 0;
  var _cascadeCache = {
    signature: null,
    result: null,
    hits: 0,
    misses: 0
  };

  function renderCard(params) {
    var day = params && params.day;
    var dayTot = params && params.dayTot;
    var normAbs = params && params.normAbs;
    var prof = params && params.prof;
    var pIndex = params && params.pIndex;

    _cascadeRenderCount++;
    // v5.0.2: log on 1st call only; suppress counter capped at 1 summary (at 50).
    // 40-50 calls per sync is architectural (multiple setProducts listeners) — all cache HITs, no DOM updates.
    if (_cascadeRenderCount === 1) {
      console.info('[HEYS.cascade] 📌 renderCard called:', {
        hasDay: !!day,
        hasMeals: !!(day && day.meals && day.meals.length),
        hasTrainings: !!(day && day.trainings && day.trainings.length),
        water: (day && day.water) || null,
        steps: (day && day.steps) || null
      });
    } else if (_cascadeRenderCount === 50) {
      console.info('[HEYS.cascade] 📌 renderCard hot-path: ' + _cascadeRenderCount + ' calls (cache active, no recompute)');
    }

    if (!day) {
      console.warn('[HEYS.cascade] ⚠️ No day data — skipping render');
      return null;
    }

    var hasMeals = day.meals && day.meals.length > 0;
    var hasTrainings = day.trainings && day.trainings.length > 0;
    var hasSteps = (day.steps || 0) > 0;
    var hasHousehold = (day.householdMin || 0) > 0;
    var hasWeightCheckin = (day.weightMorning || 0) > 0;
    var hasSleepData = !!(day.sleepStart);
    var hasMeasData = !!(day.measurements && Object.keys(day.measurements).some(function (k) { return day.measurements[k] > 0; }));
    var hasSupplements = !!(day.supplementsTaken && day.supplementsTaken.length > 0);

    if (!hasMeals && !hasTrainings && !hasSteps && !hasHousehold && !hasWeightCheckin && !hasSleepData && !hasMeasData && !hasSupplements) {
      console.info('[HEYS.cascade] ⏭️ No activity data yet — card not shown');
      return null;
    }

    // v6.2: Pre-compute history guard — prevent _lastCrs contamination before batch-sync arrives.
    // Problem: calling computeCascadeState with 0 historical days sets window.HEYS._lastCrs with
    // historicalDays=[], causing CrsProgressBar.getCrsNumber to return null → permanent pendulum.
    // Fix: suppress entire compute + render until __heysCascadeBatchSyncReceived is true.
    // Flag is set by: heys:day-updated(batch), heysSyncCompleted(full, with clientId, NOT phaseA), or 5s timeout.
    if (!window.__heysCascadeBatchSyncReceived) {
      window.__heysCascadeGuardCount = (window.__heysCascadeGuardCount || 0) + 1;
      if (window.__heysCascadeGuardCount === 1) {
        console.info('[HEYS.cascade] ⏳ Pre-compute guard: waiting for batch-sync (cascade hidden, no _lastCrs contamination)');
      } else if (window.__heysCascadeGuardCount % 50 === 0) {
        console.info('[HEYS.cascade] ⏳ Pre-compute guard: still waiting (' + window.__heysCascadeGuardCount + ' renders suppressed)');
      }
      return null;
    }

    var signature = buildInputSignature(day, normAbs, prof);
    var cascadeState;

    // 🚀 PERF v6.0: Pre-sync guard — до завершения heysSyncCompleted профиль нестабилен
    // (prof.plannedSupplements и др. ещё не пришли из облака), что вызывает cache MISS
    // и двойной computeCascadeState. Если sync не завершён и кеш есть — держимся на нём.
    // 🔧 v9.2 FIX: добавляем cloud._syncCompletedAt как fallback (устанавливается синхронно в supabase,
    //   без ожидания React-useEffect-слушателя который может пропустить событие)
    var _cloud = window.HEYS && window.HEYS.cloud;
    var _cascadeSyncDone = !!(
      (window.HEYS && (window.HEYS.initialSyncDone || window.HEYS.syncCompletedAt)) ||
      (_cloud && _cloud._syncCompletedAt)
    );
    if (!_cascadeSyncDone && _cascadeCache.result) {
      _cascadeCache.hits++;
      cascadeState = _cascadeCache.result;
      // 🔧 v9.2: Логируем только первый раз чтобы не спамить (причина: event пропускается до React mount)
      if (_cascadeCache.hits === 1) {
        console.info('[HEYS.cascade] ⏳ Pre-sync guard: holding cached compute (profile unstable, sync pending)');
      }
    } else if (_cascadeCache.signature === signature && _cascadeCache.result) {
      _cascadeCache.hits++;
      cascadeState = _cascadeCache.result;
      // 🚀 PERF: Log only on significant intervals to reduce console noise
      if (_cascadeCache.hits === 1 || _cascadeCache.hits === 100) {
        console.info('[HEYS.cascade] ⚡ Cache HIT (compute skipped):', {
          hits: _cascadeCache.hits,
          misses: _cascadeCache.misses
        });
      }
    } else {
      _cascadeCache.misses++;
      cascadeState = computeCascadeState(day, dayTot, normAbs, prof, pIndex);
      _cascadeCache.signature = signature;
      _cascadeCache.result = cascadeState;
      console.info('[HEYS.cascade] 🧠 Cache MISS (recompute):', {
        hits: _cascadeCache.hits,
        misses: _cascadeCache.misses,
        state: cascadeState.state,
        chainLength: cascadeState.chainLength
      });
    }

    // v6.2: History guard — suppress render with 0 historical days REGARDLESS of batch flag.
    // This is the safety net: even if __heysCascadeBatchSyncReceived was prematurely set,
    // empty history means we haven't received real data yet → hide cascade card.
    // Bypass via __heysCascadeAllowEmptyHistory (8s timer) for genuinely new users with no cloud data.
    if (cascadeState.historicalDays && cascadeState.historicalDays.length === 0 && !window.__heysCascadeAllowEmptyHistory) {
      window.__heysCascadeGuardCount = (window.__heysCascadeGuardCount || 0) + 1;
      if (window.__heysCascadeGuardCount === 1) {
        console.info('[HEYS.cascade] ⏳ History guard v6.2: 0 historical days — suppressing render (waiting for sync or 8s bypass)');
      } else if (window.__heysCascadeGuardCount % 50 === 0) {
        console.info('[HEYS.cascade] ⏳ History guard v6.2: still waiting (' + window.__heysCascadeGuardCount + ' renders suppressed)');
      }
      return null;
    }

    if (cascadeState.state === STATES.EMPTY) {
      console.info('[HEYS.cascade] ⏭️ State = EMPTY — card not shown');
      return null;
    }

    var renderKey = [cascadeState.state, cascadeState.chainLength, cascadeState.maxChainToday, cascadeState.momentumScore].join('|');
    if (window.__heysCascadeLastRenderKey !== renderKey) {
      window.__heysCascadeLastRenderKey = renderKey;
      console.info('[HEYS.cascade] 🚀 Rendering CascadeCard, state:', cascadeState.state);
    }
    return React.createElement(MemoizedCascadeCard, cascadeState);
  }

  // ─────────────────────────────────────────────────────
  // ЭКСПОРТ
  // ─────────────────────────────────────────────────────

  // v5.0.2: Инвалидировать кэш при cascade batch update (нутриенты изменились)
  if (typeof window !== 'undefined' && !window.__heysCascadeCacheInvalidator) {
    window.__heysCascadeCacheInvalidator = true;
    window.addEventListener('heys:mealitems-cascaded', function () {
      _cascadeCache.signature = null;
      console.info('[HEYS.cascade] 🔄 Cache invalidated by cascade-batch (nutrients updated)');
    });
  }

  // v5.1.0 → v10.0: Инвалидировать кэш при batch-sync ИЛИ force-sync.
  // Проблема v5.1: слушатель проверял detail.batch, но force-sync (pull-to-refresh) шлёт
  // ИНДИВИДУАЛЬНЫЕ события {date, source:'force-sync', forceReload:true} БЕЗ batch:true.
  // Результат: кэш НИКОГДА не инвалидировался при force-sync → historicalDays=[] → CRS null → маятник вечный.
  // Fix v10.0: обрабатываем ОБА формата — batch (cloud-sync) и debounced force-sync.
  if (typeof window !== 'undefined' && !window.__heysCascadeBatchSyncInvalidator) {
    window.__heysCascadeBatchSyncInvalidator = true;
    var _forceSyncDebounce = null;
    var _forceSyncCount = 0;
    window.addEventListener('heys:day-updated', function (e) {
      var detail = (e && e.detail) || {};

      // Path A: cloud-sync batch event (batch:true) — немедленная инвалидация
      if (detail.batch) {
        window.__heysCascadeBatchSyncReceived = true;
        window.__heysCascadeAllowEmptyHistory = true; // v6.2: batch data arrived, allow any state
        _cascadeCache.signature = null;
        _cascadeDayUpdateVersion++;
        console.info('[HEYS.cascade] 🔄 Cache invalidated by batch-sync (' + ((detail.dates && detail.dates.length) || 0) + ' days written → historicalDays will update)');
        return;
      }

      // Path B: force-sync individual events — debounce 500ms чтобы дождаться завершения всех записей
      if (detail.source === 'force-sync' || detail.source === 'cloud-sync') {
        _forceSyncCount++;
        if (_forceSyncDebounce) clearTimeout(_forceSyncDebounce);
        _forceSyncDebounce = setTimeout(function () {
          window.__heysCascadeBatchSyncReceived = true;
          _cascadeCache.signature = null;
          _cascadeDayUpdateVersion++;
          console.info('[HEYS.cascade] 🔄 Cache invalidated by force-sync debounce (' + _forceSyncCount + ' day-updated events → historicalDays will refresh)');
          _forceSyncCount = 0;
          _forceSyncDebounce = null;
          // Trigger re-render: dispatch heys:day-updated for today so DayTab re-reads data
          // → renderCard → cache MISS (signature=null) → computeCascadeState with real history → CRS valid
          try {
            var today = new Date().toISOString().slice(0, 10);
            window.dispatchEvent(new CustomEvent('heys:cascade-recompute', {
              detail: { source: 'force-sync-debounce', date: today }
            }));
          } catch (_) { }
        }, 500);
      }
    });

    // v6.2: Unblock history guard on heysSyncCompleted — ONLY on full sync with clientId.
    // Phase A events carry clientId + phaseA:true but have NO historical days yet → must be rejected.
    // Full sync events carry clientId + phase:'full' (or no phaseA flag) → safe to unblock.
    // Synthetic events (RC v6.3 timeout) have no clientId at all → also rejected.
    window.addEventListener('heysSyncCompleted', function (e) {
      if (!window.__heysCascadeBatchSyncReceived) {
        var detail = e && e.detail;
        if (detail && detail.clientId && !detail.phaseA) {
          window.__heysCascadeBatchSyncReceived = true;
          _cascadeCache.signature = null;
          console.info('[HEYS.cascade] ⚡ heysSyncCompleted: unblocking history guard (full sync, clientId: ' + String(detail.clientId).slice(0, 8) + ')');
        } else if (detail && detail.phaseA) {
          // Phase A has clientId but only 5 critical keys — no historical dayv2 yet.
          console.info('[HEYS.cascade] ⏳ heysSyncCompleted: Phase A (clientId: ' + String((detail.clientId || '').slice(0, 8)) + ') — guard stays locked, waiting for full sync');
        } else {
          // Synthetic event (RC timeout) — no clientId, batch sync not yet done.
          console.info('[HEYS.cascade] ⚠️ heysSyncCompleted: synthetic event (no clientId) — guard stays locked, waiting for batch-sync');
        }
      }
    });

    // v5.3.0: Reset guard on client switch — flag and timer must restart per-client.
    // Without this, the 15s timeout registered at page boot fires too early after client click,
    // causing BROKEN flash before BATCH WRITE arrives.
    window.addEventListener('heys:client-changed', function () {
      window.__heysCascadeBatchSyncReceived = false;
      window.__heysCascadeAllowEmptyHistory = false; // v6.2: reset empty-history bypass
      window.__heysCascadeGuardCount = 0;
      window.__heysCascadeLastRenderKey = null;
      window.__heysGatedRender = false; // v6.0: reset gate flag per client switch
      _cascadeCache.signature = null;
      if (window.__heysCascadeGuardTimer) {
        clearTimeout(window.__heysCascadeGuardTimer);
      }
      if (window.__heysCascadeHistoryBypassTimer) {
        clearTimeout(window.__heysCascadeHistoryBypassTimer);
      }
      // v6.2: Increased 3s → 5s. Full sync on fast internet takes 3-4s, 3s was too close.
      // This is a fallback for edge cases where sync event is missed (new users with no cloud history).
      window.__heysCascadeGuardTimer = setTimeout(function () {
        if (!window.__heysCascadeBatchSyncReceived) {
          window.__heysCascadeBatchSyncReceived = true;
          _cascadeCache.signature = null;
          console.info('[HEYS.cascade] ⏱️ Batch-sync timeout: unblocking history guard (5s after client switch, likely new user)');
          // v10.1: Force parent re-render immediately after guard unlock.
          // Without this, parent waits for next periodic heysSyncCompleted (~15-25s gap).
          // source:'cascade-guard-unlock' is ignored by cascade cache invalidator (not batch/force-sync).
          try {
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
              detail: { source: 'cascade-guard-unlock', date: new Date().toISOString().slice(0, 10) }
            }));
          } catch (_) { }
        }
      }, 5000);
      // v6.2: Empty-history bypass — 8s fallback for genuinely new users with 0 days in cloud.
      // Even if batch guard opens at 5s, empty history guard (v6.2) blocks render until this fires.
      window.__heysCascadeHistoryBypassTimer = setTimeout(function () {
        if (!window.__heysCascadeAllowEmptyHistory) {
          window.__heysCascadeAllowEmptyHistory = true;
          _cascadeCache.signature = null;
          console.info('[HEYS.cascade] ⏱️ Empty-history bypass: allowing render with 0 historical days (8s, genuinely new user)');
          // v10.1: Force parent re-render after empty-history bypass (for genuinely new users).
          try {
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
              detail: { source: 'cascade-guard-unlock', date: new Date().toISOString().slice(0, 10) }
            }));
          } catch (_) { }
        }
      }, 8000);
      console.info('[HEYS.cascade] 🔄 Client changed: guard reset, 5s/8s timeouts restarted');
    });

    // v6.2: Initial timeout fallback for page-boot (first load, no client switch).
    // Increased 3s → 5s — full sync on fast internet takes 3-4s.
    window.__heysCascadeGuardTimer = setTimeout(function () {
      if (!window.__heysCascadeBatchSyncReceived) {
        window.__heysCascadeBatchSyncReceived = true;
        _cascadeCache.signature = null;
        console.info('[HEYS.cascade] ⏱️ Batch-sync timeout: unblocking history guard (5s, likely new user)');
        // v10.1: Force parent re-render immediately after guard unlock (page-boot path).
        try {
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { source: 'cascade-guard-unlock', date: new Date().toISOString().slice(0, 10) }
          }));
        } catch (_) { }
      }
    }, 5000);
    // v6.2: Empty-history bypass — 8s fallback for genuinely new users.
    window.__heysCascadeHistoryBypassTimer = setTimeout(function () {
      if (!window.__heysCascadeAllowEmptyHistory) {
        window.__heysCascadeAllowEmptyHistory = true;
        _cascadeCache.signature = null;
        console.info('[HEYS.cascade] ⏱️ Empty-history bypass: allowing render with 0 historical days (8s, genuinely new user)');
        // v10.1: Force parent re-render after empty-history bypass (page-boot, new user).
        try {
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { source: 'cascade-guard-unlock', date: new Date().toISOString().slice(0, 10) }
          }));
        } catch (_) { }
      }
    }, 8000);
  }

  // v10.0: Listener для heys:cascade-recompute — вызывается после debounce force-sync.
  // Читает сегодняшний day из localStorage и вызывает computeCascadeState напрямую,
  // чтобы обновить _lastCrs с реальной историей и отправить heys:crs-updated → CrsProgressBar settle.
  if (typeof window !== 'undefined' && !window.__heysCascadeRecomputeListener) {
    window.__heysCascadeRecomputeListener = true;
    window.addEventListener('heys:cascade-recompute', function () {
      try {
        var U = HEYS.utils;
        var clientId = (U && U.getCurrentClientId && U.getCurrentClientId()) || HEYS.currentClientId || '';
        var today = new Date().toISOString().slice(0, 10);
        var dayKey = clientId ? 'heys_' + clientId + '_dayv2_' + today : 'heys_dayv2_' + today;
        var raw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(dayKey, null) : localStorage.getItem(dayKey);
        var day = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
        if (!day || !day.meals || !day.meals.length) {
          console.info('[HEYS.cascade] ⚠️ cascade-recompute: no day data for today — skipping');
          return;
        }
        var normAbsRaw = (HEYS.store && HEYS.store.get) ? HEYS.store.get('heys_normAbs', null) : localStorage.getItem('heys_normAbs');
        var normAbs = normAbsRaw ? (typeof normAbsRaw === 'string' ? JSON.parse(normAbsRaw) : normAbsRaw) : {};
        var profRaw = (HEYS.store && HEYS.store.get) ? HEYS.store.get('heys_profile', null) : localStorage.getItem('heys_profile');
        var prof = profRaw ? (typeof profRaw === 'string' ? JSON.parse(profRaw) : profRaw) : {};
        console.info('[HEYS.cascade] 🔄 cascade-recompute: re-running computeCascadeState with fresh historical data');
        // v61: Build pIndex from products so getMealQualityScore is available during recompute
        var productsRaw = (HEYS.store && HEYS.store.get)
          ? HEYS.store.get('heys_products', null)
          : localStorage.getItem('heys_products');
        var products = productsRaw
          ? (typeof productsRaw === 'string' ? JSON.parse(productsRaw) : productsRaw)
          : null;
        var pIndex = (products && HEYS.dayUtils && HEYS.dayUtils.buildProductIndex)
          ? HEYS.dayUtils.buildProductIndex(products)
          : null;
        // computeCascadeState dispatches heys:crs-updated → CrsProgressBar updates automatically
        computeCascadeState(day, null, normAbs, prof, pIndex);
      } catch (err) {
        console.warn('[HEYS.cascade] ⚠️ cascade-recompute error:', err && err.message);
      }
    });
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: CrsProgressBar (для нижнего меню)
  // ─────────────────────────────────────────────────────
  function CrsProgressBar() {
    var [crsData, setCrsData] = React.useState(window.HEYS && window.HEYS._lastCrs ? window.HEYS._lastCrs : null);
    var [isSettled, setIsSettled] = React.useState(false);

    function getCrsNumber(data) {
      if (!data) return null;
      // v3.6.1: Don't trust CRS computed from empty data (no synced days yet).
      // Bar stays in pendulum mode until real data with historicalDays >= 1 arrives.
      if (!data.historicalDays || data.historicalDays < 1) return null;
      var raw = data.crs;
      if (typeof raw === 'number' && isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        var parsed = parseFloat(raw);
        if (isFinite(parsed)) return parsed;
      }
      return null;
    }

    var isSettledRef = React.useRef(false);
    var isSettlingRef = React.useRef(false);
    var hasValidCrsRef = React.useRef(getCrsNumber(crsData) !== null);
    var pendulumTicksRef = React.useRef(0);
    var settleArmedRef = React.useRef(false);
    var lastPendulumOffsetRef = React.useRef(null);
    var currentPercentRef = React.useRef(50);
    var crsTargetRef = React.useRef(getCrsNumber(crsData));
    var debugLastLogTsRef = React.useRef(0);
    var debugLastReasonRef = React.useRef('');
    var introProgressRef = React.useRef(0);
    var instanceIdRef = React.useRef('cb-' + Math.random().toString(36).slice(2, 8));
    var containerRef = React.useRef(null);
    var greenRef = React.useRef(null);
    var orangeRef = React.useRef(null);
    var dividerRef = React.useRef(null);
    var debugEnabledRef = React.useRef(!!(window && window.__HEYS_DEBUG_CASCADEBAR));

    function applyCascadeVisual(percent, introK) {
      var p = Math.max(0, Math.min(100, percent));
      var k = Math.max(0, Math.min(1, introK));
      var gw = p * k;
      var ow = (100 - p) * k;

      if (greenRef.current) {
        greenRef.current.style.setProperty('right', (100 - p) + '%', 'important');
        greenRef.current.style.setProperty('width', gw + '%', 'important');
      }
      if (orangeRef.current) {
        orangeRef.current.style.setProperty('left', p + '%', 'important');
        orangeRef.current.style.setProperty('width', ow + '%', 'important');
      }
      if (dividerRef.current) {
        dividerRef.current.style.setProperty('left', p + '%', 'important');
        dividerRef.current.style.setProperty('transform', 'translate(-50%, -50%) scale(' + k + ')', 'important');
      }
    }

    React.useEffect(function () {
      // Требуемый UX:
      // 1) Точка по центру + линии плавно расходятся >= 1с
      // 2) Потом минимум пару маятников
      // 3) Затем плавный сдвиг в фактический CRS (когда данные готовы)
      var INTRO_DURATION_MS = 1000; // По запросу: разъезд строго ~1 сек
      var PENDULUM_PERIOD_MS = 1800;
      var PENDULUM_AMPLITUDE = 3.5;
      var MIN_PENDULUM_CYCLES = 2; // минимум 2 полных маятника
      var MIN_PENDULUM_TIME_MS = MIN_PENDULUM_CYCLES * PENDULUM_PERIOD_MS;
      var SETTLE_DURATION_MS = 1800;

      var introRafId;
      var settleCheckTimer;
      var domDebugTimer;
      var rafId;
      var settleRafId;
      var pendulumStartTs = 0;

      var ensureSingleBar = function () {
        if (!containerRef.current || !containerRef.current.parentElement) return;
        var bars = containerRef.current.parentElement.querySelectorAll('.crs-bar-container');
        if (bars.length <= 1) return;
        bars.forEach(function (el) {
          if (el !== containerRef.current) {
            el.style.setProperty('display', 'none', 'important');
          }
        });
        if (debugEnabledRef.current) {
          console.info('[cascadebar] duplicate-bars-hidden', { count: bars.length });
        }
      };

      // Инициализируем визуал строго в центре до старта интро.
      applyCascadeVisual(50, 0);
      ensureSingleBar();

      var logCascadeBar = function (stage, payload, force, throttleMs) {
        if (!debugEnabledRef.current && !force) return;
        var now = Date.now();
        var gap = typeof throttleMs === 'number' ? throttleMs : 1000;
        if (!force && (now - debugLastLogTsRef.current) < gap) return;
        debugLastLogTsRef.current = now;
        console.info('[cascadebar] ' + stage, Object.assign({ instanceId: instanceIdRef.current }, payload || {}));
      };

      var getDomSnapshot = function () {
        var c = containerRef.current;
        var g = greenRef.current;
        var o = orangeRef.current;
        var d = dividerRef.current;
        if (!c || !g || !o || !d) return { ready: false };

        var cRect = c.getBoundingClientRect();
        var dRect = d.getBoundingClientRect();
        var gRect = g.getBoundingClientRect();
        var oRect = o.getBoundingClientRect();
        var cw = cRect.width || 0;
        var dividerCenterPx = (dRect.left + dRect.width / 2) - cRect.left;
        var actualPercentFromDom = cw > 0 ? (dividerCenterPx / cw) * 100 : null;

        var gcs = window.getComputedStyle(g);
        var ocs = window.getComputedStyle(o);
        var dcs = window.getComputedStyle(d);

        return {
          ready: true,
          barsInDocument: document.querySelectorAll('.crs-bar-container').length,
          barsInParent: c.parentElement ? c.parentElement.querySelectorAll('.crs-bar-container').length : 0,
          containerWidth: +cw.toFixed(2),
          dividerCenterPx: +dividerCenterPx.toFixed(2),
          actualPercentFromDom: actualPercentFromDom === null ? null : +actualPercentFromDom.toFixed(2),
          currentPercentState: +currentPercentRef.current.toFixed(2),
          targetPercent: crsTargetRef.current === null ? null : +(crsTargetRef.current * 100).toFixed(2),
          introProgress: +introProgressRef.current.toFixed(3),
          isSettled: isSettledRef.current,
          isSettling: isSettlingRef.current,
          computed: {
            greenRight: gcs.right,
            greenWidth: gcs.width,
            orangeLeft: ocs.left,
            orangeWidth: ocs.width,
            dividerLeft: dcs.left,
            dividerTransform: dcs.transform
          },
          rects: {
            containerLeft: +cRect.left.toFixed(2),
            containerRight: +cRect.right.toFixed(2),
            dividerLeft: +dRect.left.toFixed(2),
            dividerRight: +dRect.right.toFixed(2),
            greenLeft: +gRect.left.toFixed(2),
            greenRight: +gRect.right.toFixed(2),
            orangeLeft: +oRect.left.toFixed(2),
            orangeRight: +oRect.right.toFixed(2)
          }
        };
      };

      if (debugEnabledRef.current) {
        window.__cascadebarDump = function () {
          var snap = getDomSnapshot();
          console.info('[cascadebar] manual-dump', Object.assign({ instanceId: instanceIdRef.current }, snap));
          return snap;
        };
      }

      var easeInOutCubic = function (t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      var beginSettleTransition = function (reason) {
        if (isSettlingRef.current || isSettledRef.current) return;

        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }

        isSettlingRef.current = true;
        settleArmedRef.current = false;
        var settleTo = crsTargetRef.current !== null ? (crsTargetRef.current * 100) : currentPercentRef.current;

        logCascadeBar('settle-begin', {
          reason: reason,
          from: +currentPercentRef.current.toFixed(2),
          to: +settleTo.toFixed(2)
        }, true);

        animateToPercent(settleTo, SETTLE_DURATION_MS, function () {
          isSettledRef.current = true;
          isSettlingRef.current = false;
          setIsSettled(true);
        });
      };

      var animateToPercent = function (targetPercent, durationMs, onDone) {
        if (settleRafId) cancelAnimationFrame(settleRafId);
        var from = currentPercentRef.current;
        var to = Math.max(0, Math.min(100, targetPercent));
        var startTs = 0;

        if (Math.abs(to - from) < 0.05) {
          currentPercentRef.current = to;
          applyCascadeVisual(to, 1);
          if (typeof onDone === 'function') onDone();
          return;
        }

        logCascadeBar('settle-start', {
          from: +from.toFixed(2),
          to: +to.toFixed(2),
          durationMs: durationMs,
          hasValidCrs: hasValidCrsRef.current,
          targetCrs: crsTargetRef.current
        }, true);

        var step = function (ts) {
          if (!startTs) startTs = ts;
          var p = Math.max(0, Math.min(1, (ts - startTs) / durationMs));
          var k = easeInOutCubic(p);
          var nextPercent = from + (to - from) * k;
          currentPercentRef.current = nextPercent;
          applyCascadeVisual(nextPercent, 1);

          if (p < 1) {
            logCascadeBar('settle-progress', {
              p: +p.toFixed(3),
              currentPercent: +nextPercent.toFixed(2)
            }, false, 1200);
            settleRafId = requestAnimationFrame(step);
            return;
          }

          logCascadeBar('settle-done', {
            currentPercent: +nextPercent.toFixed(2)
          }, true);

          if (typeof onDone === 'function') onDone();
        };
        settleRafId = requestAnimationFrame(step);
      };

      var startPendulum = function () {
        settleArmedRef.current = false;
        lastPendulumOffsetRef.current = null;

        logCascadeBar('pendulum-start', {
          periodMs: PENDULUM_PERIOD_MS,
          amplitude: PENDULUM_AMPLITUDE
        }, true);

        // После интро запускаем плавный маятник (sin wave), без перескоков.
        var animatePendulum = function (ts) {
          if (!pendulumStartTs) pendulumStartTs = ts;
          var elapsed = ts - pendulumStartTs;
          pendulumTicksRef.current = elapsed;
          var phase = (elapsed / PENDULUM_PERIOD_MS) * Math.PI * 2;
          var next = Math.sin(phase) * PENDULUM_AMPLITUDE;
          var prevOffset = lastPendulumOffsetRef.current;
          lastPendulumOffsetRef.current = next;

          currentPercentRef.current = 50 + next;
          applyCascadeVisual(50 + next, 1);

          logCascadeBar('pendulum-frame', {
            elapsedMs: Math.round(elapsed),
            offset: +next.toFixed(3),
            currentPercent: +(50 + next).toFixed(2),
            hasValidCrs: hasValidCrsRef.current,
            targetCrs: crsTargetRef.current
          }, false, 1200);

          trySettleToActual();

          // Старт settle НЕ в центре, а сразу после последнего качания влево:
          // когда прошли левый экстремум и начали движение вправо.
          if (settleArmedRef.current && prevOffset !== null) {
            var nearLeftExtreme = prevOffset <= (-PENDULUM_AMPLITUDE * 0.88);
            var turnedRight = next > prevOffset;
            if (nearLeftExtreme && turnedRight) {
              beginSettleTransition('left-extremum');
              return;
            }
          }

          if (!isSettledRef.current) {
            rafId = requestAnimationFrame(animatePendulum);
          }
        };
        rafId = requestAnimationFrame(animatePendulum);
      };

      var trySettleToActual = function () {
        if (isSettledRef.current) return;
        if (isSettlingRef.current) return;

        // Если CRS появился в глобальном кеше позже — подхватываем его.
        if (!hasValidCrsRef.current) {
          var globalCrs = window.HEYS && window.HEYS._lastCrs;
          var globalNum = getCrsNumber(globalCrs);
          if (globalNum !== null) {
            setCrsData(globalCrs);
            hasValidCrsRef.current = true;
          }
        }

        var elapsed = pendulumTicksRef.current;
        var hasMinimumPendulum = elapsed >= MIN_PENDULUM_TIME_MS;

        // Критично: не фиксируем центр без валидного CRS,
        // иначе точка может "застрять" на 50%.
        if (!hasValidCrsRef.current) {
          if (debugLastReasonRef.current !== 'waiting-crs') {
            debugLastReasonRef.current = 'waiting-crs';
            logCascadeBar('settle-waiting-crs', {
              elapsedMs: Math.round(elapsed),
              currentPercent: +currentPercentRef.current.toFixed(2),
              targetCrs: crsTargetRef.current
            }, true);
          }
          return;
        }
        if (hasValidCrsRef.current && !hasMinimumPendulum) {
          if (debugLastReasonRef.current !== 'waiting-min-pendulum') {
            debugLastReasonRef.current = 'waiting-min-pendulum';
            logCascadeBar('settle-waiting-pendulum', {
              elapsedMs: Math.round(elapsed),
              requiredMs: MIN_PENDULUM_TIME_MS,
              currentPercent: +currentPercentRef.current.toFixed(2),
              targetCrs: crsTargetRef.current
            }, true);
          }
          return;
        }

        debugLastReasonRef.current = 'ready-to-settle';
        // Вооружаем settle и ждём левый экстремум маятника,
        // чтобы не было замирания в центре.
        if (!settleArmedRef.current) {
          logCascadeBar('settle-ready', {
            elapsedMs: Math.round(elapsed),
            currentPercent: +currentPercentRef.current.toFixed(2),
            targetCrs: crsTargetRef.current
          }, true);
          settleArmedRef.current = true;
          logCascadeBar('settle-armed', {
            strategy: 'start-after-left-swing',
            currentPercent: +currentPercentRef.current.toFixed(2)
          }, true);
        }
      };

      // Жёсткое интро: покадрово раскрываем линии из центра ровно 1 секунду.
      var introStartTs = 0;
      var animateIntro = function (ts) {
        if (!introStartTs) introStartTs = ts;
        var elapsed = ts - introStartTs;
        var p = Math.max(0, Math.min(1, elapsed / INTRO_DURATION_MS));
        introProgressRef.current = p;
        applyCascadeVisual(50, p);

        logCascadeBar('intro-frame', {
          p: +p.toFixed(3),
          elapsedMs: Math.round(elapsed)
        }, false, 1000);

        if (p < 1) {
          introRafId = requestAnimationFrame(animateIntro);
          return;
        }

        logCascadeBar('intro-done', { durationMs: INTRO_DURATION_MS }, true);
        startPendulum();
      };
      introRafId = requestAnimationFrame(animateIntro);

      // Периодическая проверка на случай, если данные пришли без движения маятника.
      settleCheckTimer = setInterval(function () {
        trySettleToActual();
      }, 120);

      if (debugEnabledRef.current) {
        domDebugTimer = setInterval(function () {
          var snap = getDomSnapshot();
          if (!snap.ready) return;

          var stateP = currentPercentRef.current;
          var domP = typeof snap.actualPercentFromDom === 'number' ? snap.actualPercentFromDom : null;
          var targetP = crsTargetRef.current === null ? null : (crsTargetRef.current * 100);

          logCascadeBar('dom-brief', {
            statePercent: +stateP.toFixed(2),
            domPercent: domP === null ? null : +domP.toFixed(2),
            targetPercent: targetP === null ? null : +targetP.toFixed(2),
            intro: +introProgressRef.current.toFixed(3),
            settled: isSettledRef.current,
            settling: isSettlingRef.current,
            barsInDocument: snap.barsInDocument,
            barsInParent: snap.barsInParent
          }, false, 900);

          // Если DOM визуально уехал от расчётного state — принудительно синхронизируем.
          if (domP !== null && Math.abs(domP - stateP) > 2.5) {
            applyCascadeVisual(stateP, 1);
            logCascadeBar('dom-desync-corrected', {
              statePercent: +stateP.toFixed(2),
              domPercentBefore: +domP.toFixed(2),
              delta: +(stateP - domP).toFixed(2)
            }, true);
          }

          // Если после settle DOM застрял возле центра, но target далеко — жёстко дотягиваем к target.
          if (
            isSettledRef.current &&
            !isSettlingRef.current &&
            targetP !== null &&
            domP !== null &&
            Math.abs(domP - 50) <= 2 &&
            Math.abs(targetP - 50) >= 6
          ) {
            animateToPercent(targetP, 1400);
            logCascadeBar('center-stuck-force-target', {
              domPercentBefore: +domP.toFixed(2),
              targetPercent: +targetP.toFixed(2)
            }, true);
          }
        }, 900);
      }

      function handleCrsUpdate(e) {
        if (e.detail) {
          setCrsData(e.detail);
          var nextCrs = getCrsNumber(e.detail);
          hasValidCrsRef.current = nextCrs !== null;
          crsTargetRef.current = nextCrs;

          logCascadeBar('crs-update', {
            nextCrs: nextCrs,
            currentPercent: +currentPercentRef.current.toFixed(2),
            isSettled: isSettledRef.current,
            isSettling: isSettlingRef.current
          }, true);

          // Уже в settled-состоянии: любые новые значения CRS двигаем плавно,
          // а не резким прыжком.
          if (isSettledRef.current && nextCrs !== null) {
            animateToPercent(nextCrs * 100, 1600);
          }

          trySettleToActual();
        }
      }

      function handleSyncCompleted() {
        // Иногда CRS уже в window.HEYS._lastCrs, но событие обновления не прилетело.
        var fallback = window.HEYS && window.HEYS._lastCrs;
        var fallbackCrs = getCrsNumber(fallback);
        if (fallbackCrs !== null) {
          setCrsData(fallback);
          hasValidCrsRef.current = true;
          crsTargetRef.current = fallbackCrs;

          if (isSettledRef.current) {
            animateToPercent(fallbackCrs * 100, 1600);
          }

          logCascadeBar('sync-fallback-crs', {
            fallbackCrs: fallbackCrs,
            currentPercent: +currentPercentRef.current.toFixed(2),
            isSettled: isSettledRef.current
          }, true);

          trySettleToActual();
        } else {
          // 🔧 FIX v65: fallback CRS ещё null — значит heys:day-updated triggered renderCard
          // который обновит HEYS._lastCrs через computeCascadeState. Повторная проверка через 600ms.
          logCascadeBar('sync-fallback-null', {
            willRetryMs: 600,
            currentPercent: +currentPercentRef.current.toFixed(2)
          }, true);
          setTimeout(function () {
            if (isSettledRef.current) return; // уже settled — не нужно
            var retryFallback = window.HEYS && window.HEYS._lastCrs;
            var retryNum = getCrsNumber(retryFallback);
            if (retryNum !== null) {
              setCrsData(retryFallback);
              hasValidCrsRef.current = true;
              crsTargetRef.current = retryNum;
              logCascadeBar('sync-fallback-retry-ok', {
                fallbackCrs: retryNum,
                currentPercent: +currentPercentRef.current.toFixed(2)
              }, true);
              trySettleToActual();
            } else {
              logCascadeBar('sync-fallback-retry-still-null', {
                currentPercent: +currentPercentRef.current.toFixed(2)
              }, true);
            }
          }, 600);
        }
      }

      logCascadeBar('mount', {
        initialCrs: getCrsNumber(crsData),
        initialPercent: +currentPercentRef.current.toFixed(2)
      }, debugEnabledRef.current);

      window.addEventListener('heys:crs-updated', handleCrsUpdate);
      window.addEventListener('heysSyncCompleted', handleSyncCompleted);

      return function () {
        if (introRafId) cancelAnimationFrame(introRafId);
        if (settleCheckTimer) clearInterval(settleCheckTimer);
        if (domDebugTimer) clearInterval(domDebugTimer);
        if (rafId) cancelAnimationFrame(rafId);
        if (settleRafId) cancelAnimationFrame(settleRafId);
        window.removeEventListener('heys:crs-updated', handleCrsUpdate);
        window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        if (window.__cascadebarDump) {
          try { delete window.__cascadebarDump; } catch (_) { window.__cascadebarDump = undefined; }
        }
      };
    }, []);

    React.useEffect(function () {
      var v = getCrsNumber(crsData);
      hasValidCrsRef.current = v !== null;
      crsTargetRef.current = v;
    }, [crsData]);

    // Даже если данных CRS ещё нет, держим линию видимой по центру (50%),
    // чтобы нижний индикатор не пропадал из меню.
    var crsValue = getCrsNumber(crsData);
    var hasValidCrs = crsValue !== null;

    // Если CRS ещё нет — стартуем из 50/50, затем маятник до загрузки данных.
    // Анимация появления из центра работает через isLoaded.
    // --- Цвет левой линии: фиксированный зелёный градиент (светлее у центра → насыщеннее у края) ---
    var goodGrad = 'linear-gradient(90deg, #10b981, #34d399)';
    var goodShadow = '0 0 4px rgba(52, 211, 153, 0.8), 0 0 10px rgba(16, 185, 129, 0.6), 0 0 16px rgba(5, 150, 105, 0.4)';

    // --- Цвет правой линии: фиксированный градиент жёлтый → оранжевый → красный ---
    // Цвет определяется позицией на шкале, а не значением CRS — не меняется при движении точки
    var badGrad = 'linear-gradient(90deg, #dc2626, #f97316, #fde047)';
    var badShadow = '0 0 4px rgba(253, 224, 71, 0.7), 0 0 10px rgba(249, 115, 22, 0.6), 0 0 16px rgba(220, 38, 38, 0.4)';

    return React.createElement(
      'div',
      { className: 'crs-bar-container', ref: containerRef },
      React.createElement('div', {
        className: 'crs-bar-green',
        ref: greenRef,
        style: {
          transition: 'none',
          background: goodGrad,
          boxShadow: goodShadow
        }
      }),
      React.createElement('div', {
        className: 'crs-bar-orange',
        ref: orangeRef,
        style: {
          transition: 'none',
          background: badGrad,
          boxShadow: badShadow
        }
      }),
      React.createElement('div', {
        className: 'crs-bar-divider',
        ref: dividerRef,
        style: {
          transition: 'none',
        }
      })
    );
  }

  HEYS.CascadeCard = {
    computeCascadeState: computeCascadeState,
    renderCard: renderCard,
    CrsProgressBar: CrsProgressBar,
    STATES: STATES,
    STATE_CONFIG: STATE_CONFIG,
    MESSAGES: MESSAGES,
    CRS_THRESHOLDS: CRS_THRESHOLDS,
    VERSION: '3.6.1'
  };

  console.info('[HEYS.cascade] ✅ Module loaded v3.6.1 | CRS = base(EMA completed days) + DCS×0.03 | EMA α=0.95, 30-day window, individual ceiling | Scientific scoring: continuous functions, personal baselines, cross-factor synergies | Goal-aware calorie penalty (deficit/bulk) | Filter: [HEYS.cascade] | Sub-filter: [HEYS.cascade.crs] [HEYS.cascade.deficit]');

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_supplements_v1.js ===== */
// heys_supplements_v1.js — Трекинг витаминов и добавок
// Версия: 2.0.0 | Дата: 2025-12-14
// Каталог витаминов, timing, взаимодействия, интеграция с инсулиновой волной
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // === ВРЕМЯ ПРИЁМА ===
  const TIMING = {
    morning: { name: 'Утром', icon: '🌅', hours: [6, 11] },
    withFood: { name: 'С едой', icon: '🍽️', hours: null },
    withFat: { name: 'С жирной едой', icon: '🥑', hours: null },
    evening: { name: 'Вечером', icon: '🌙', hours: [18, 23] },
    beforeBed: { name: 'Перед сном', icon: '😴', hours: [21, 24] },
    empty: { name: 'Натощак', icon: '⏰', hours: null },
    beforeMeal: { name: 'До еды', icon: '⏳', hours: null },
    afterTrain: { name: 'После трени', icon: '💪', hours: null },
    anytime: { name: 'Любое время', icon: '✨', hours: null },
  };

  // === КАТАЛОГ ВИТАМИНОВ ===
  const SUPPLEMENTS_CATALOG = {
    // === 🛡️ Иммунитет ===
    vitD: { name: 'D3', icon: '☀️', category: 'immune', timing: 'withFat', tip: 'Лучше с жирной едой' },
    vitC: { name: 'C', icon: '🍊', category: 'immune', timing: 'anytime', tip: 'Улучшает усвоение железа' },
    zinc: { name: 'Цинк', icon: '🛡️', category: 'immune', timing: 'withFood', tip: 'Не сочетать с кальцием' },
    selenium: { name: 'Селен', icon: '🔬', category: 'immune', timing: 'withFood' },

    // === 🧠 Мозг и нервы ===
    omega3: { name: 'Омега-3', icon: '🐟', category: 'brain', timing: 'withFood', tip: 'Усиливает D3' },
    magnesium: { name: 'Магний', icon: '💤', category: 'brain', timing: 'evening', tip: 'Расслабляет мышцы' },
    b12: { name: 'B12', icon: '⚡', category: 'brain', timing: 'morning', tip: 'Даёт энергию' },
    b6: { name: 'B6', icon: '🧬', category: 'brain', timing: 'morning' },
    lecithin: { name: 'Лецитин', icon: '🥚', category: 'brain', timing: 'withFood' },

    // === 🦴 Кости и суставы ===
    calcium: { name: 'Кальций', icon: '🦴', category: 'bones', timing: 'withFood', tip: 'Не с железом!' },
    k2: { name: 'K2', icon: '🥬', category: 'bones', timing: 'withFat', tip: 'Синергия с D3' },
    collagen: { name: 'Коллаген', icon: '✨', category: 'bones', timing: 'empty', tip: 'Натощак + витамин C' },
    glucosamine: { name: 'Глюкозамин', icon: '🦵', category: 'bones', timing: 'withFood' },

    // === 💪 Спорт ===
    creatine: { name: 'Креатин', icon: '💪', category: 'sport', timing: 'afterTrain', tip: '5г в день' },
    bcaa: { name: 'BCAA', icon: '🏋️', category: 'sport', timing: 'afterTrain' },
    protein: { name: 'Протеин', icon: '🥛', category: 'sport', timing: 'afterTrain', tip: '30мин после трени' },

    // === 💇 Красота ===
    biotin: { name: 'Биотин', icon: '💇', category: 'beauty', timing: 'withFood', tip: 'Волосы и ногти' },
    vitE: { name: 'E', icon: '🌻', category: 'beauty', timing: 'withFat' },
    hyaluronic: { name: 'Гиалуроновая', icon: '💧', category: 'beauty', timing: 'empty' },

    // === 🌸 Женское здоровье ===
    iron: { name: 'Железо', icon: '🩸', category: 'female', timing: 'empty', tip: 'С витамином C, без кальция' },
    folic: { name: 'Фолиевая', icon: '🌸', category: 'female', timing: 'morning' },

    // === 💤 Сон ===
    melatonin: { name: 'Мелатонин', icon: '🌙', category: 'sleep', timing: 'beforeBed', tip: 'За 30-60мин до сна' },
    glycine: { name: 'Глицин', icon: '😴', category: 'sleep', timing: 'beforeBed' },
    ltheanine: { name: 'L-теанин', icon: '🍵', category: 'sleep', timing: 'evening', tip: 'Расслабляет без сонливости' },

    // === ⚡ Энергия ===
    coq10: { name: 'CoQ10', icon: '❤️', category: 'energy', timing: 'withFat', tip: 'Энергия для сердца' },

    // === 🧪 Метаболизм (влияют на инсулиновую волну!) ===
    berberine: { name: 'Берберин', icon: '🌿', category: 'metabolism', timing: 'beforeMeal', insulinBonus: -0.15, tip: '💡 -15% инсулиновая волна' },
    cinnamon: { name: 'Корица', icon: '🍂', category: 'metabolism', timing: 'withFood', insulinBonus: -0.10, tip: '💡 -10% инсулиновая волна' },
    chromium: { name: 'Хром', icon: '⚙️', category: 'metabolism', timing: 'withFood', tip: 'Стабилизирует сахар' },
    vinegar: { name: 'Уксус', icon: '🍎', category: 'metabolism', timing: 'beforeMeal', insulinBonus: -0.20, tip: '💡 -20% инсулиновая волна' },
  };

  // === КАТЕГОРИИ ===
  const SUPPLEMENT_CATEGORIES = {
    immune: { name: 'Иммунитет', icon: '🛡️', order: 1 },
    brain: { name: 'Мозг', icon: '🧠', order: 2 },
    bones: { name: 'Кости', icon: '🦴', order: 3 },
    sport: { name: 'Спорт', icon: '💪', order: 4 },
    beauty: { name: 'Красота', icon: '💇', order: 5 },
    female: { name: 'Женское', icon: '🌸', order: 6 },
    sleep: { name: 'Сон', icon: '💤', order: 7 },
    energy: { name: 'Энергия', icon: '⚡', order: 8 },
    metabolism: { name: 'Метаболизм', icon: '🧪', order: 9 },
  };

  // === ВЗАИМОДЕЙСТВИЯ v2.0 ===
  const INTERACTIONS = {
    synergies: [
      { pair: ['vitD', 'vitK2'], desc: '✨ D3 + K2 — кальций идёт в кости, а не в сосуды' },
      { pair: ['iron', 'vitC'], desc: '✨ Железо + C — усвоение ×3' },
      { pair: ['calcium', 'vitD'], desc: '✨ Кальций + D3 — максимальное усвоение' },
      { pair: ['magnesium', 'b6'], desc: '✨ Магний + B6 — классическая связка' },
      { pair: ['omega3', 'vitD'], desc: '✨ Omega-3 + D3 — жиры помогают усвоению' },
      { pair: ['omega3', 'vitE'], desc: '✨ Omega-3 + E — защита от окисления' },
      { pair: ['zinc', 'vitC'], desc: '✨ Цинк + C — усиление иммунитета' },
      { pair: ['curcumin', 'omega3'], desc: '✨ Куркумин + Omega-3 — противовоспалительная синергия' },
    ],
    conflicts: [
      { pair: ['iron', 'calcium'], desc: '⚠️ Железо vs Кальций — принимать с интервалом 2-3 часа' },
      { pair: ['zinc', 'calcium'], desc: '⚠️ Цинк vs Кальций — конкурируют за усвоение' },
      { pair: ['zinc', 'iron'], desc: '⚠️ Цинк vs Железо — принимать раздельно' },
      { pair: ['magnesium', 'calcium'], desc: '⚠️ Магний vs Кальций — в больших дозах мешают друг другу' },
      { pair: ['vitE', 'iron'], desc: '⚠️ Витамин E vs Железо — E снижает усвоение железа' },
    ],
  };

  // === КУРСЫ (PRESETS) v3.0 ===
  const COURSES = {
    winter: {
      id: 'winter',
      name: '🧊 Зима',
      desc: 'Иммунитет на холодный сезон',
      supplements: ['vitD', 'vitC', 'zinc'],
      duration: '3 месяца',
      tags: ['иммунитет', 'сезон']
    },
    active: {
      id: 'active',
      name: '🏃 Активный образ',
      desc: 'Для спортсменов и активных людей',
      supplements: ['omega3', 'magnesium', 'coq10'],
      duration: 'постоянно',
      tags: ['спорт', 'энергия']
    },
    women30: {
      id: 'women30',
      name: '👩 30+ Женщина',
      desc: 'Базовый набор для женщин',
      supplements: ['vitD', 'calcium', 'iron', 'b12'],
      duration: 'постоянно',
      tags: ['женское', 'базовый']
    },
    beauty: {
      id: 'beauty',
      name: '✨ Красота',
      desc: 'Кожа, волосы, ногти',
      supplements: ['biotin', 'collagen', 'vitE', 'hyaluronic'],
      duration: '2-3 месяца',
      tags: ['красота']
    },
    sleep: {
      id: 'sleep',
      name: '😴 Здоровый сон',
      desc: 'Улучшение качества сна',
      supplements: ['magnesium', 'melatonin', 'glycine'],
      duration: '1-2 месяца',
      tags: ['сон', 'стресс']
    },
    brain: {
      id: 'brain',
      name: '🧠 Мозг',
      desc: 'Концентрация и память',
      supplements: ['omega3', 'lecithin', 'b12', 'b6'],
      duration: 'постоянно',
      tags: ['мозг', 'работа']
    },
    metabolism: {
      id: 'metabolism',
      name: '🔥 Метаболизм',
      desc: 'Улучшение обмена веществ, снижение инсулина',
      supplements: ['berberine', 'chromium', 'cinnamon'],
      duration: '1-3 месяца',
      tags: ['похудение', 'инсулин']
    },
  };

  // === CSS АНИМАЦИИ ===
  const ANIMATIONS_CSS = `
    @keyframes chip-bounce {
      0% { transform: scale(1); }
      50% { transform: scale(0.92); }
      100% { transform: scale(1); }
    }
    .supp-chip-animate {
      animation: chip-bounce 0.15s ease-out;
    }
  `;

  // Инжектим CSS анимации
  if (typeof document !== 'undefined' && !document.getElementById('heys-supplements-css')) {
    const style = document.createElement('style');
    style.id = 'heys-supplements-css';
    style.textContent = ANIMATIONS_CSS;
    document.head.appendChild(style);
  }

  // === УТИЛИТЫ ===

  function readStoredValue(key, fallback = null) {
    let value;

    if (HEYS.store?.get) {
      value = HEYS.store.get(key, fallback);
    } else if (HEYS.utils?.lsGet) {
      value = HEYS.utils.lsGet(key, fallback);
    } else {
      try {
        value = localStorage.getItem(key);
      } catch {
        return fallback;
      }
    }

    if (value == null) return fallback;

    if (typeof value === 'string') {
      if (value.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try {
          value = HEYS.store.decompress(value.slice(3));
        } catch (_) { }
      }
      try {
        return JSON.parse(value);
      } catch (_) {
        return value;
      }
    }

    return value;
  }

  function readSessionValue(key, fallback = null) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeSessionValue(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // no-op
    }
  }

  function isInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('button, [role="button"], a, input, textarea, select, [data-supp-collapse-ignore="1"]');
  }

  /**
   * Получить витамины сгруппированные по категориям
   */
  function getSupplementsByCategory() {
    const result = {};
    for (const [id, supp] of Object.entries(SUPPLEMENTS_CATALOG)) {
      const cat = supp.category;
      if (!result[cat]) result[cat] = [];
      result[cat].push({ id, ...supp });
    }
    // Сортируем категории по order
    const sorted = {};
    Object.entries(SUPPLEMENT_CATEGORIES)
      .sort((a, b) => a[1].order - b[1].order)
      .forEach(([catId]) => {
        if (result[catId]) sorted[catId] = result[catId];
      });
    return sorted;
  }

  // === КАСТОМНЫЕ ДОБАВКИ ===

  /**
   * Получить кастомные добавки пользователя
   */
  function getCustomSupplements() {
    const profile = getProfileSafe();
    return profile.customSupplements || [];
  }

  /**
   * Добавить кастомную добавку
   * @param {Object} supp - { name, icon, timing }
   */
  function addCustomSupplement(supp) {
    const profile = getProfileSafe();
    const customs = profile.customSupplements || [];

    const newSupp = {
      id: 'custom_' + Date.now(),
      name: supp.name || 'Моя добавка',
      icon: supp.icon || '💊',
      timing: supp.timing || 'anytime',
      category: 'custom',
      isCustom: true,
    };

    customs.push(newSupp);
    profile.customSupplements = customs;
    saveProfileSafe(profile, 'customSupplements');

    // Добавляем в рантайм каталог
    SUPPLEMENTS_CATALOG[newSupp.id] = newSupp;

    window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
    return newSupp;
  }

  /**
   * Удалить кастомную добавку
   */
  function removeCustomSupplement(suppId) {
    if (!suppId.startsWith('custom_')) return false;

    const profile = getProfileSafe();
    const customs = profile.customSupplements || [];

    profile.customSupplements = customs.filter(s => s.id !== suppId);
    saveProfileSafe(profile, 'customSupplements');

    // Удаляем из рантайм каталога
    delete SUPPLEMENTS_CATALOG[suppId];

    window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
    return true;
  }

  /**
   * Загрузить кастомные добавки в каталог при инициализации
   */
  function loadCustomSupplements() {
    const customs = getCustomSupplements();
    for (const supp of customs) {
      SUPPLEMENTS_CATALOG[supp.id] = supp;
    }
  }

  // Загружаем кастомные при старте
  if (typeof window !== 'undefined') {
    setTimeout(loadCustomSupplements, 100);
  }

  // === v3.5: SCAFFOLDING — Настройки, история, batch-операции ===

  /**
   * Безопасное получение профиля
   */
  function getProfileSafe() {
    return readStoredValue('heys_profile', {});
  }

  /**
   * Безопасное сохранение профиля с optional полем для dispatch event
   */
  function saveProfileSafe(profile, field) {
    const U = HEYS.utils || {};
    if (HEYS.store && typeof HEYS.store.set === 'function') {
      HEYS.store.set('heys_profile', profile);
    } else if (U.lsSet) {
      U.lsSet('heys_profile', profile);
    }
    if (field) {
      window.dispatchEvent(new CustomEvent('heys:supplements-updated', { detail: { field } }));
    }
  }

  function saveDaySafe(dateKey, dayData) {
    const U = HEYS.utils || {};
    const key = `heys_dayv2_${dateKey}`;
    if (HEYS.store && typeof HEYS.store.set === 'function') {
      HEYS.store.set(key, dayData);
      return;
    }
    if (U.lsSet) {
      U.lsSet(key, dayData);
    }
  }

  /**
   * Получить все персональные настройки витаминов
   * @returns {Object} map suppId → { form, dose, unit, timing, notes }
   */
  function getSupplementSettings() {
    const profile = getProfileSafe();
    return profile.supplementSettings || {};
  }

  /**
   * Получить настройки конкретного витамина
   * @param {string} suppId - ID витамина
   * @returns {Object|null} { form, dose, unit, timing, notes } или null
   */
  function getSupplementSetting(suppId) {
    const settings = getSupplementSettings();
    return settings[suppId] || null;
  }

  /**
   * Установить/обновить настройки витамина
   * @param {string} suppId - ID витамина
   * @param {Object} patch - { form?, dose?, unit?, timing?, notes? }
   */
  function setSupplementSetting(suppId, patch) {
    const profile = getProfileSafe();
    if (!profile.supplementSettings) profile.supplementSettings = {};
    profile.supplementSettings[suppId] = {
      ...(profile.supplementSettings[suppId] || {}),
      ...patch,
      updatedAt: Date.now()
    };
    saveProfileSafe(profile, 'supplementSettings');
  }

  /**
   * Получить историю приёма витаминов (курсы, дни)
   * @returns {Object} map suppId → { startDate, days, totalTaken, lastTaken }
   */
  function getSupplementHistory() {
    const profile = getProfileSafe();
    return profile.supplementHistory || {};
  }

  /**
   * Обновить историю приёма витамина
   * @param {string} suppId - ID витамина
   * @param {string} dateKey - дата в формате YYYY-MM-DD
   * @param {boolean} taken - принят или снят
   */
  function updateSupplementHistory(suppId, dateKey, taken) {
    const profile = getProfileSafe();
    if (!profile.supplementHistory) profile.supplementHistory = {};
    if (!profile.supplementHistory[suppId]) {
      profile.supplementHistory[suppId] = {
        startDate: dateKey,
        days: 0,
        totalTaken: 0,
        lastTaken: null
      };
    }
    const h = profile.supplementHistory[suppId];
    if (taken) {
      h.totalTaken++;
      h.lastTaken = dateKey;
      // Подсчёт дней курса (уникальные даты)
      if (!h.takenDates) h.takenDates = [];
      if (!h.takenDates.includes(dateKey)) {
        h.takenDates.push(dateKey);
        h.days = h.takenDates.length;
      }
    }
    saveProfileSafe(profile, 'supplementHistory');
  }

  // === v4.1: UX/SAFETY — причины, условия, побочки, курсы, единицы ===

  // Пользовательские условия, влияющие на безопасность/подсказки.
  // Храним в профиле: profile.supplementUserFlags
  const SUPP_USER_FLAGS = {
    pregnant: {
      label: 'Беременность',
      desc: 'Важно для ряда добавок. HEYS не заменяет консультацию врача.',
    },
    breastfeeding: {
      label: 'Грудное вскармливание',
      desc: 'Важно для дозировок и ограничений.',
    },
    anticoagulants: {
      label: 'Принимаю антикоагулянты',
      desc: 'Напр. варфарин — витамин K может быть критичен.',
    },
    kidneyIssues: {
      label: 'Есть проблемы с почками',
      desc: 'Минералы (магний) и некоторые добавки требуют осторожности.',
    },
    thyroidIssues: {
      label: 'Есть проблемы со щитовидкой',
      desc: 'Йод и некоторые добавки могут быть нежелательны.',
    },
    giSensitive: {
      label: 'Чувствительный ЖКТ',
      desc: 'Если тошнит/изжога — лучше переносить/принимать с едой.',
    },
  };

  function getSupplementUserFlags() {
    const profile = getProfileSafe();
    return profile.supplementUserFlags || {};
  }

  function setSupplementUserFlag(flagId, value) {
    const profile = getProfileSafe();
    if (!profile.supplementUserFlags) profile.supplementUserFlags = {};
    profile.supplementUserFlags[flagId] = !!value;
    saveProfileSafe(profile, 'supplementUserFlags');
  }

  // Лог побочек (легковесно, без медицины): profile.supplementHistory[suppId].sideEffects[]
  function logSupplementSideEffect(suppId, dateKey, data) {
    const profile = getProfileSafe();
    if (!profile.supplementHistory) profile.supplementHistory = {};
    if (!profile.supplementHistory[suppId]) {
      profile.supplementHistory[suppId] = {
        startDate: dateKey,
        days: 0,
        totalTaken: 0,
        lastTaken: null,
      };
    }
    const h = profile.supplementHistory[suppId];
    if (!h.sideEffects) h.sideEffects = [];
    const effectText = (data?.note || data?.effect || '').slice(0, 200);
    h.sideEffects.push({
      at: Date.now(),
      dateKey,
      symptom: data?.symptom || 'other',
      note: effectText,
      action: data?.action || null,
    });
    // Ограничиваем историю (чтобы не раздувать profile)
    if (h.sideEffects.length > 30) h.sideEffects = h.sideEffects.slice(-30);
    saveProfileSafe(profile, 'supplementHistory');
  }

  function getSideEffectSummary(suppId) {
    const history = getSupplementHistory();
    const h = history[suppId];
    const list = h?.sideEffects || [];
    if (!list.length) return null;
    const last = list[list.length - 1];
    const uniqueDays = new Set(list.map(x => x?.dateKey).filter(Boolean));
    return {
      total: list.length,
      days: uniqueDays.size,
      lastAt: last.at,
      lastDateKey: last.dateKey,
      lastSymptom: last.symptom,
      lastNote: last.note,
      lastAction: last.action,
    };
  }

  // Курсовость/паузы — мягкие рекомендации (не медицинский совет)
  // weeksMax: после этого показать напоминание о паузе.
  const COURSE_HINTS = {
    melatonin: { weeksMax: 8, breakWeeks: 2, title: 'Мелатонин обычно лучше курсами' },
    berberine: { weeksMax: 12, breakWeeks: 2, title: 'Берберин часто принимают курсом' },
    iron: { weeksMax: 12, breakWeeks: 4, title: 'Железо — лучше по анализам' },
  };

  function parseISODateKey(dateKey) {
    if (!dateKey || typeof dateKey !== 'string') return null;
    const d = new Date(dateKey + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function getWeeksBetween(startDateKey, endDateKey) {
    const s = parseISODateKey(startDateKey);
    const e = parseISODateKey(endDateKey);
    if (!s || !e) return 0;
    const diffDays = Math.floor((e.getTime() - s.getTime()) / 86400000);
    return Math.max(0, Math.floor(diffDays / 7) + 1);
  }

  function getCourseInfo(suppId, dateKey) {
    const history = getSupplementHistory();
    const h = history[suppId];
    if (!h || !h.startDate) {
      return { started: false, weeksOnCourse: 0, weeksOn: 0, startDate: null, hint: null, needsBreak: false };
    }
    const weeksOn = getWeeksBetween(h.startDate, dateKey);
    const hint = COURSE_HINTS[suppId] || null;
    const needsBreak = hint?.weeksMax && weeksOn >= hint.weeksMax;
    return { started: true, weeksOnCourse: weeksOn, weeksOn, startDate: h.startDate, hint, needsBreak };
  }

  // Единицы и конверсия (минимально полезные)
  const UNIT_ALIASES = {
    mcg: 'мкг',
    ug: 'мкг',
    iu: 'МЕ',
  };

  function normalizeUnit(u) {
    const s = String(u || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'µg') return 'мкг';
    if (s === 'мкг' || s === 'mcg' || s === 'ug') return 'мкг';
    if (s === 'iu' || s === 'ме') return 'МЕ';
    if (s === 'mg' || s === 'мг') return 'мг';
    if (s === 'g' || s === 'г') return 'г';
    return UNIT_ALIASES[s] || u;
  }

  // D3: 1 мкг = 40 МЕ
  function convertVitD(dose, fromUnit, toUnit) {
    const n = parseFloat(dose);
    if (!n) return null;
    const f = normalizeUnit(fromUnit);
    const t = normalizeUnit(toUnit);
    if (f === t) return n;
    if (f === 'мкг' && t === 'МЕ') return Math.round(n * 40);
    if (f === 'МЕ' && t === 'мкг') return Math.round((n / 40) * 10) / 10;
    return null;
  }

  function getDoseDisplay(suppId, setting, bio) {
    const dose = setting?.dose;
    const unit = normalizeUnit(setting?.unit || bio?.forms?.[setting?.form]?.unit || 'мг');
    if (!dose) return null;
    // Витамин D: показываем конверсию (если возможно)
    if (suppId === 'vitD') {
      const alt = unit === 'МЕ' ? convertVitD(dose, unit, 'мкг') : convertVitD(dose, unit, 'МЕ');
      const altUnit = unit === 'МЕ' ? 'мкг' : 'МЕ';
      if (alt != null) {
        return `${dose} ${unit} (≈ ${alt} ${altUnit})`;
      }
    }
    return `${dose} ${unit}`;
  }

  // "Почему сейчас" — короткие причины/правила для понятности.
  function getWhyNowBadges(suppId, planned, setting, bio) {
    const supp = SUPPLEMENTS_CATALOG[suppId];
    if (!supp) return [];
    const res = [];

    const timing = setting?.timing || supp.timing;
    if (timing === 'withMeal') res.push({ t: 'С едой', icon: '🍽️' });
    if (timing === 'withFat' || timing === 'withMeal') {
      if (['vitD', 'vitE', 'vitK2'].includes(suppId)) {
        res.push({ t: 'Лучше с жиром', icon: '🥑' });
      }
    }
    if (timing === 'morning') res.push({ t: 'Утром', icon: '🌅' });
    if (timing === 'evening' || timing === 'beforeBed') res.push({ t: 'Вечером', icon: '🌙' });

    // Конфликты: подсказать разнесение
    const conflictPairs = {
      iron: ['calcium', 'zinc', 'magnesium'],
      zinc: ['iron', 'calcium'],
      calcium: ['iron', 'zinc', 'magnesium'],
      magnesium: ['calcium'],
    };
    const conflictsWith = (conflictPairs[suppId] || []).filter(x => planned.includes(x));
    if (conflictsWith.length) {
      const names = conflictsWith.map(id => SUPPLEMENTS_CATALOG[id]?.name || id).join(', ');
      res.push({ t: `Разнести с: ${names}`, icon: '⏱️' });
    }

    // Магний — частая путаница с "элементным".
    if (suppId === 'magnesium') {
      res.push({ t: 'Смотри "элементный Mg" на банке', icon: '⚠️' });
    }

    // Ограничиваем 3 подсказками, чтобы не шумело.
    return res.slice(0, 3);
  }

  function getSafetyWarningsForSupplement(suppId, flags) {
    const out = [];
    if (!flags) return out;

    if (flags.anticoagulants && (suppId === 'vitK2' || suppId === 'vitK')) {
      out.push('Антикоагулянты: витамин K может влиять на терапию — лучше согласовать с врачом.');
    }
    if ((flags.pregnant || flags.breastfeeding) && suppId === 'berberine') {
      out.push('Беременность/ГВ: берберин обычно не рекомендуют без врача.');
    }
    if (flags.kidneyIssues && suppId === 'magnesium') {
      out.push('Почки: магний в высоких дозах требует осторожности.');
    }
    if (flags.giSensitive && (suppId === 'iron' || suppId === 'zinc' || suppId === 'magnesium')) {
      out.push('Чувствительный ЖКТ: если дискомфорт — попробуй с едой/перенести время/уменьшить дозу.');
    }

    return out;
  }

  // Weekly diet suggestions (7 дней) — лёгкая эвристика по названиям продуктов.
  function getWeeklyDietSuggestions(daysBack = 7) {
    const today = new Date();
    const planned = getPlannedSupplements();

    const patterns = {
      fish: /(лосос|семг|скумбр|сардин|тунец|селед|рыб)/i,
      ironFood: /(печень|говядин|чечевиц|фасол|шпинат|гречк)/i,
      dairy: /(творог|молоко|сыр|йогурт|кефир|сметан)/i,
    };

    let fishMeals = 0;
    let ironMeals = 0;
    let dairyMeals = 0;
    let daysWithMeals = 0;

    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readStoredValue(`heys_dayv2_${key}`, {});
      const meals = dayData.meals || [];
      if (!meals.length) continue;
      daysWithMeals++;

      for (const m of meals) {
        const items = m?.items || [];
        const names = items.map(it => (it?.name || '')).join(' ');
        if (patterns.fish.test(names)) fishMeals++;
        if (patterns.ironFood.test(names)) ironMeals++;
        if (patterns.dairy.test(names)) dairyMeals++;
      }
    }

    const suggestions = [];
    // Omega-3: если рыбы мало
    if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG.omega3 && daysWithMeals >= 3 && fishMeals < 2) {
      suggestions.push({
        suppId: 'omega3',
        icon: '🐟',
        title: 'Рыбы мало за неделю',
        reason: 'Если рыба редко — омега‑3 может быть полезна как поддержка.',
      });
    }
    // Железо: если железных продуктов мало (и особенно для женщин — это уже покрывает profile recs, но тут именно "по рациону")
    if (!planned.includes('iron') && SUPPLEMENTS_CATALOG.iron && daysWithMeals >= 3 && ironMeals < 2) {
      suggestions.push({
        suppId: 'iron',
        icon: '🩸',
        title: 'Мало железосодержащих продуктов',
        reason: 'Если часто устаёшь — лучше начать с анализов (ферритин), а не “наугад”.',
      });
    }
    // Пример: если много молочки и есть железо в плане — напомнить разнести (не добавка, но полезный совет)
    if (planned.includes('iron') && dairyMeals >= 4) {
      suggestions.push({
        suppId: null,
        icon: '🥛',
        title: 'Много молочки',
        reason: 'Кальций мешает усвоению железа — разнеси железо и молочку на 2–3 часа.',
      });
    }

    return suggestions;
  }

  /**
   * Batch-отметка витаминов (Smart Schedule — отметить все в группе)
   * @param {string} dateKey - дата
   * @param {string[]} suppIds - массив ID витаминов
   * @param {boolean} taken - принять или снять (default true)
   */
  function markSupplementsTaken(dateKey, suppIds, taken = true) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});

    if (!dayData.supplementsTaken) dayData.supplementsTaken = [];
    if (!dayData.supplementsTakenAt) dayData.supplementsTakenAt = {};
    if (!dayData.supplementsTakenMeta) dayData.supplementsTakenMeta = {};

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5); // HH:MM

    for (const id of suppIds) {
      if (taken) {
        if (!dayData.supplementsTaken.includes(id)) {
          dayData.supplementsTaken.push(id);
        }
        dayData.supplementsTakenAt[id] = timeStr;
        // Сохраняем мета (настройки на момент приёма)
        const setting = getSupplementSetting(id);
        if (setting) {
          dayData.supplementsTakenMeta[id] = {
            form: setting.form,
            dose: setting.dose,
            unit: setting.unit
          };
        }
        // Обновляем историю
        updateSupplementHistory(id, dateKey, true);
      } else {
        dayData.supplementsTaken = dayData.supplementsTaken.filter(x => x !== id);
        delete dayData.supplementsTakenAt[id];
        delete dayData.supplementsTakenMeta[id];
      }
    }

    dayData.updatedAt = Date.now(); // fix: ensure stale-guard passes in heys_day_effects
    saveDaySafe(dateKey, dayData);
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, dateKey, field: 'supplements', forceReload: true }
    }));
    if (taken && suppIds && suppIds.length > 0) {
      window.dispatchEvent(new CustomEvent('heysSupplementsTaken', {
        detail: { date: dateKey, suppIds: [...suppIds] }
      }));
    }
  }

  // === НАПОМИНАНИЯ ПО ВРЕМЕНИ ===

  /**
   * Получить напоминание по текущему времени
   * @param {string[]} planned - запланированные добавки
   * @param {string[]} taken - уже принятые
   * @returns {Object|null} { message, urgency, suppIds }
   */
  function getTimeReminder(planned, taken) {
    const hour = new Date().getHours();
    const notTaken = planned.filter(id => !taken.includes(id));
    if (notTaken.length === 0) return null;

    // Определяем какие добавки нужны сейчас
    const morningSupps = notTaken.filter(id => {
      const s = SUPPLEMENTS_CATALOG[id];
      return s && (s.timing === 'morning' || s.timing === 'empty');
    });

    const eveningSupps = notTaken.filter(id => {
      const s = SUPPLEMENTS_CATALOG[id];
      return s && (s.timing === 'evening' || s.timing === 'beforeBed');
    });

    // Утро (7-10) — напоминание об утренних
    if (hour >= 7 && hour <= 10 && morningSupps.length > 0) {
      return {
        message: '🌅 Утренние витамины ждут!',
        urgency: 'high',
        suppIds: morningSupps,
      };
    }

    // Поздний вечер (21-23) — напоминание о вечерних
    if (hour >= 21 && hour <= 23 && eveningSupps.length > 0) {
      return {
        message: '🌙 Не забудь вечерние!',
        urgency: 'high',
        suppIds: eveningSupps,
      };
    }

    // День — мягкое напоминание если много не принято
    if (hour >= 12 && hour <= 18 && notTaken.length >= 3) {
      return {
        message: `📋 Ещё ${notTaken.length} добавок не принято`,
        urgency: 'low',
        suppIds: notTaken,
      };
    }

    return null;
  }

  // === УМНЫЕ РЕКОМЕНДАЦИИ ПО ПРОФИЛЮ ===

  /**
   * Получить персональные рекомендации по добавкам
   * @param {Object} profile - профиль пользователя
   * @param {Object} dayData - данные дня
   * @returns {Array} массив { id, reason }
   */
  function getSmartRecommendations(profile, dayData) {
    const recs = [];
    const U = HEYS.utils || {};
    const planned = getPlannedSupplements();

    if (!profile) return recs;

    // По полу
    if (profile.gender === 'Женский') {
      if (!planned.includes('iron') && SUPPLEMENTS_CATALOG['iron'])
        recs.push({ id: 'iron', reason: '🌸 Железо важно для женщин (менструация)' });
      if (!planned.includes('folic') && SUPPLEMENTS_CATALOG['folic'])
        recs.push({ id: 'folic', reason: '🌸 Фолиевая кислота — женский базис' });
      if (!planned.includes('calcium') && SUPPLEMENTS_CATALOG['calcium'])
        recs.push({ id: 'calcium', reason: '🦴 Кальций — профилактика остеопороза' });
    }

    // По возрасту
    const age = profile.age || 30;
    if (age >= 40) {
      if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
        recs.push({ id: 'vitD', reason: '☀️ После 40 D3 критичен для костей и иммунитета' });
      if (!planned.includes('coq10') && SUPPLEMENTS_CATALOG['coq10'])
        recs.push({ id: 'coq10', reason: '❤️ CoQ10 поддерживает сердце после 40' });
      if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG['omega3'])
        recs.push({ id: 'omega3', reason: '🐟 Омега-3 для мозга и сердца 40+' });
    }
    if (age >= 50) {
      if (!planned.includes('b12') && SUPPLEMENTS_CATALOG['b12'])
        recs.push({ id: 'b12', reason: '⚡ После 50 B12 усваивается хуже — нужна добавка' });
    }

    // По сезону
    const month = new Date().getMonth();
    if (month >= 10 || month <= 2) { // Ноябрь-Февраль
      if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
        recs.push({ id: 'vitD', reason: '🧊 Зимой D3 обязателен (мало солнца)' });
      if (!planned.includes('vitC') && SUPPLEMENTS_CATALOG['vitC'])
        recs.push({ id: 'vitC', reason: '🍊 Витамин C для иммунитета зимой' });
      if (!planned.includes('zinc') && SUPPLEMENTS_CATALOG['zinc'])
        recs.push({ id: 'zinc', reason: '🛡️ Цинк — защита от простуд' });
    }

    // По данным дня
    if (dayData) {
      // Плохой сон → магний
      if (dayData.sleepQuality && dayData.sleepQuality <= 3) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '😴 Плохой сон → попробуй магний' });
        if (!planned.includes('melatonin') && SUPPLEMENTS_CATALOG['melatonin'])
          recs.push({ id: 'melatonin', reason: '💤 Мелатонин поможет засыпать' });
      }

      // Высокий стресс
      if (dayData.stressAvg && dayData.stressAvg >= 6) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '😰 Высокий стресс → магний успокаивает' });
        if (!planned.includes('b6') && SUPPLEMENTS_CATALOG['b6'])
          recs.push({ id: 'b6', reason: '🧠 B6 снижает тревожность' });
      }

      // Тренировки
      if (dayData.trainings && dayData.trainings.length > 0) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '💪 После трени магний от судорог' });
        if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG['omega3'])
          recs.push({ id: 'omega3', reason: '💪 Омега-3 для восстановления' });
        if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
          recs.push({ id: 'vitD', reason: '💪 D3 помогает мышцам восстанавливаться' });
      }
    }

    // Удаляем дубликаты (по id)
    const seen = new Set();
    return recs.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  // === СВЯЗЬ С ЕДОЙ ===

  /**
   * Получить советы по витаминам на основе еды
   * @param {Array} meals - приёмы пищи
   * @param {string[]} planned - запланированные добавки
   * @param {string[]} taken - принятые добавки
   * @param {Object} pIndex - индекс продуктов
   * @returns {Array} массив советов
   */
  function getMealBasedAdvice(meals, planned, taken, pIndex) {
    const advices = [];
    const notTaken = planned.filter(id => !taken.includes(id));
    if (notTaken.length === 0 || !meals || meals.length === 0) return advices;

    // Анализируем последний приём пищи
    const lastMeal = meals[meals.length - 1];
    if (!lastMeal || !lastMeal.items?.length) return advices;

    // Helper для получения продукта
    const getProduct = (item) => {
      if (!pIndex) return null;
      const nameKey = (item.name || '').trim().toLowerCase();
      if (nameKey && pIndex.byName) {
        const found = pIndex.byName.get(nameKey);
        if (found) return found;
      }
      if (item.product_id != null && pIndex.byId) {
        return pIndex.byId.get(String(item.product_id).toLowerCase());
      }
      return item.fat100 !== undefined ? item : null;
    };

    // 1. Считаем жиры в последнем приёме
    let mealFat = 0;
    for (const item of lastMeal.items) {
      const p = getProduct(item);
      if (p) mealFat += (p.fat100 || 0) * (item.grams || 100) / 100;
    }

    // Жирная еда → жирорастворимые витамины
    if (mealFat >= 10) {
      const fatSoluble = notTaken.filter(id =>
        SUPPLEMENTS_CATALOG[id]?.timing === 'withFat'
      );
      if (fatSoluble.length > 0) {
        const names = fatSoluble.map(id => SUPPLEMENTS_CATALOG[id].name).join(', ');
        advices.push({
          type: 'synergy',
          icon: '🥑',
          message: `Жирный приём! Идеально для: ${names}`,
          details: 'Жирорастворимые витамины (D, E, K, A) усваиваются в 3-4 раза лучше с жирами.',
          suppIds: fatSoluble,
          priority: 'high'
        });
      }
    }

    // 2. Еда с железом + витамин C
    const ironRichFoods = ['печень', 'говядина', 'гречка', 'чечевица', 'шпинат', 'фасоль'];
    const hasIronFood = lastMeal.items.some(item =>
      ironRichFoods.some(f => (item.name || '').toLowerCase().includes(f))
    );
    if (hasIronFood && notTaken.includes('vitC')) {
      advices.push({
        type: 'synergy',
        icon: '🍊',
        message: 'Еда с железом! Добавь витамин C для усвоения ×3',
        details: 'Витамин C превращает негемовое железо в легкоусваиваемую форму.',
        suppIds: ['vitC'],
        priority: 'high'
      });
    }

    // 3. Молочка + НЕ принимать железо
    const dairyFoods = ['творог', 'молоко', 'сыр', 'йогурт', 'кефир', 'сметана'];
    const hasDairy = lastMeal.items.some(item =>
      dairyFoods.some(f => (item.name || '').toLowerCase().includes(f))
    );
    if (hasDairy && notTaken.includes('iron')) {
      advices.push({
        type: 'warning',
        icon: '⚠️',
        message: 'Молочка снижает усвоение железа. Раздели на 2 часа',
        details: 'Кальций конкурирует с железом за усвоение в кишечнике.',
        suppIds: ['iron'],
        priority: 'medium'
      });
    }

    // 4. Кофе + добавки
    const hasCoffee = lastMeal.items.some(item =>
      (item.name || '').toLowerCase().includes('кофе')
    );
    if (hasCoffee) {
      const blockedSupps = notTaken.filter(id =>
        ['iron', 'calcium', 'zinc', 'magnesium'].includes(id)
      );
      if (blockedSupps.length > 0) {
        const names = blockedSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push({
          type: 'warning',
          icon: '☕',
          message: `Кофе мешает: ${names}. Подожди 1-2 часа`,
          details: 'Танины и кофеин снижают усвоение минералов на 40-60%.',
          suppIds: blockedSupps,
          priority: 'medium'
        });
      }
    }

    // 5. Белковая еда + креатин/BCAA
    let mealProtein = 0;
    for (const item of lastMeal.items) {
      const p = getProduct(item);
      if (p) mealProtein += (p.protein100 || 0) * (item.grams || 100) / 100;
    }
    if (mealProtein >= 25) {
      const sportSupps = notTaken.filter(id =>
        ['creatine', 'bcaa', 'protein'].includes(id)
      );
      if (sportSupps.length > 0) {
        const names = sportSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push({
          type: 'synergy',
          icon: '💪',
          message: `Белковый приём! Отлично для: ${names}`,
          details: 'Спортивные добавки лучше усваиваются с белковой едой.',
          suppIds: sportSupps,
          priority: 'low'
        });
      }
    }

    return advices;
  }

  /**
   * Применить курс — добавить его добавки в planned
   */
  function applyCourse(courseId) {
    const course = COURSES[courseId];
    if (!course) return false;

    const current = getPlannedSupplements();
    const newSupps = [...new Set([...current, ...course.supplements])];
    savePlannedSupplements(newSupps);

    return true;
  }

  /**
   * Получить запланированные на сегодня (из профиля — запоминается)
   */
  function getPlannedSupplements() {
    const profile = getProfileSafe();
    return profile.plannedSupplements || [];
  }

  /**
   * Сохранить запланированные (в профиль — запоминается на след. день)
   */
  function savePlannedSupplements(supplements) {
    const profile = getProfileSafe();
    profile.plannedSupplements = supplements;
    saveProfileSafe(profile, 'plannedSupplements');

    // Событие для синхронизации
    window.dispatchEvent(new CustomEvent('heys:profile-updated', {
      detail: { field: 'plannedSupplements' }
    }));
  }

  /**
   * Получить принятые сегодня
   */
  function getTakenSupplements(dateKey) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});
    return dayData.supplementsTaken || [];
  }

  /**
   * Отметить витамин как принятый
   */
  function markSupplementTaken(dateKey, suppId, taken = true) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };

    let takenList = dayData.supplementsTaken || [];
    if (taken && !takenList.includes(suppId)) {
      takenList = [...takenList, suppId];
    } else if (!taken) {
      takenList = takenList.filter(id => id !== suppId);
    }

    dayData.supplementsTaken = takenList;
    dayData.supplementsTakenAt = new Date().toISOString();
    dayData.updatedAt = Date.now();

    saveDaySafe(dateKey, dayData);

    // Событие для обновления UI
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, field: 'supplementsTaken' }
    }));
  }

  /**
   * Отметить все запланированные как принятые
   */
  function markAllSupplementsTaken(dateKey) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
    const planned = dayData.supplementsPlanned || getPlannedSupplements();

    dayData.supplementsTaken = [...planned];
    dayData.supplementsTakenAt = new Date().toISOString();
    dayData.updatedAt = Date.now();

    saveDaySafe(dateKey, dayData);

    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, field: 'supplementsTaken' }
    }));
    if (planned && planned.length > 0) {
      window.dispatchEvent(new CustomEvent('heysSupplementsTaken', {
        detail: { date: dateKey, suppIds: [...planned] }
      }));
    }
  }

  /**
   * Получить статистику соблюдения курса за N дней
   */
  function getComplianceStats(daysBack = 7) {
    const today = new Date();
    let totalPlanned = 0;
    let totalTaken = 0;
    let daysWithData = 0;

    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readStoredValue(`heys_dayv2_${key}`, {});

      const planned = dayData.supplementsPlanned || [];
      const taken = dayData.supplementsTaken || [];

      if (planned.length > 0) {
        daysWithData++;
        totalPlanned += planned.length;
        totalTaken += taken.filter(id => planned.includes(id)).length;
      }
    }

    return {
      daysWithData,
      totalPlanned,
      totalTaken,
      compliancePct: totalPlanned > 0 ? Math.round((totalTaken / totalPlanned) * 100) : 0
    };
  }

  // === v2.0 ФУНКЦИИ ===

  /**
   * Проверить взаимодействия между выбранными добавками
   * @param {string[]} suppIds - массив ID выбранных добавок
   * @returns {{ synergies: string[], conflicts: string[] }}
   */
  function checkInteractions(suppIds) {
    const synergies = [];
    const conflicts = [];

    if (!suppIds || suppIds.length < 2) return { synergies, conflicts };

    for (const interaction of INTERACTIONS.synergies) {
      const [a, b] = interaction.pair;
      if (suppIds.includes(a) && suppIds.includes(b)) {
        synergies.push(interaction.desc);
      }
    }

    for (const interaction of INTERACTIONS.conflicts) {
      const [a, b] = interaction.pair;
      if (suppIds.includes(a) && suppIds.includes(b)) {
        conflicts.push(interaction.desc);
      }
    }

    return { synergies, conflicts };
  }

  /**
   * Рассчитать суммарный бонус к инсулиновой волне от принятых добавок
   * @param {string} dateKey - дата YYYY-MM-DD
   * @returns {number} бонус (отрицательный = волна короче)
   */
  function getInsulinWaveBonus(dateKey) {
    const taken = getTakenSupplements(dateKey);
    if (!taken.length) return 0;

    let totalBonus = 0;
    for (const id of taken) {
      const supp = SUPPLEMENTS_CATALOG[id];
      if (supp && supp.insulinBonus) {
        totalBonus += supp.insulinBonus;
      }
    }

    // Кепаем максимумом -30%
    return Math.max(-0.30, totalBonus);
  }

  /**
   * Получить умные советы по добавкам на основе времени и состояния
   * @param {string} dateKey - дата
   * @returns {string[]} массив советов
   */
  function getSupplementAdvices(dateKey) {
    const advices = [];
    const now = new Date();
    const hour = now.getHours();

    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    const taken = dayData.supplementsTaken || [];
    const notTaken = planned.filter(id => !taken.includes(id));

    if (notTaken.length === 0) return advices;

    // Утренние добавки
    if (hour >= 6 && hour < 12) {
      const morningSupps = notTaken.filter(id => {
        const s = SUPPLEMENTS_CATALOG[id];
        return s && (s.timing === 'morning' || s.timing === 'empty');
      });
      if (morningSupps.length > 0) {
        const names = morningSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push(`🌅 Утро — время для: ${names}`);
      }
    }

    // Вечерние добавки
    if (hour >= 18 && hour < 23) {
      const eveningSupps = notTaken.filter(id => {
        const s = SUPPLEMENTS_CATALOG[id];
        return s && (s.timing === 'evening' || s.timing === 'beforeBed');
      });
      if (eveningSupps.length > 0) {
        const names = eveningSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push(`🌙 Вечер — время для: ${names}`);
      }
    }

    // Напоминание про жирорастворимые с едой
    const fatSoluble = notTaken.filter(id => SUPPLEMENTS_CATALOG[id]?.timing === 'withFat');
    if (fatSoluble.length > 0 && hour >= 12 && hour < 15) {
      const names = fatSoluble.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
      advices.push(`🥑 С обедом (нужны жиры): ${names}`);
    }

    // Метаболизм перед едой
    const beforeMeal = notTaken.filter(id => SUPPLEMENTS_CATALOG[id]?.timing === 'beforeMeal');
    if (beforeMeal.length > 0) {
      const names = beforeMeal.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
      advices.push(`⏰ За 15-30 мин до еды: ${names}`);
    }

    return advices;
  }

  /**
   * Получить подсказку по времени приёма
   * @param {string} timing - код времени
   * @returns {string} человекочитаемая подсказка
   */
  function getTimingHint(timing) {
    const hints = {
      morning: '🌅 утром',
      withFood: '🍽️ с едой',
      withFat: '🥑 с жирной едой',
      evening: '🌆 вечером',
      beforeBed: '🌙 перед сном',
      empty: '💨 натощак',
      beforeMeal: '⏰ до еды',
      afterTrain: '💪 после трени',
      anytime: '🕐 в любое время',
    };
    return hints[timing] || '';
  }

  // === ГРУППИРОВКА ПО ВРЕМЕНИ ПРИЁМА ===
  const TIME_GROUPS = {
    morning: { label: '🌅 Утро', timings: ['morning', 'empty'], order: 1 },
    withMeal: { label: '🍽️ С едой', timings: ['withFood', 'withFat', 'beforeMeal'], order: 2 },
    evening: { label: '🌙 Вечер', timings: ['evening', 'beforeBed'], order: 3 },
    anytime: { label: '🕐 Любое время', timings: ['anytime', 'afterTrain'], order: 4 },
  };

  /**
   * Сгруппировать добавки по времени приёма
   * @param {string[]} suppIds - массив ID добавок
   * @returns {Object} { morning: [...], withMeal: [...], evening: [...], anytime: [...] }
   */
  function groupByTimeOfDay(suppIds) {
    const groups = { morning: [], withMeal: [], evening: [], anytime: [] };

    for (const id of suppIds) {
      const supp = SUPPLEMENTS_CATALOG[id];
      if (!supp) continue;

      let placed = false;
      for (const [groupId, group] of Object.entries(TIME_GROUPS)) {
        if (group.timings.includes(supp.timing)) {
          groups[groupId].push(id);
          placed = true;
          break;
        }
      }
      // Если timing не найден — в anytime
      if (!placed) groups.anytime.push(id);
    }

    // UX: чтобы не путать пользователя лишним бейджем "Любое время",
    // добавки "в любое время" и "после трени" показываем в блоке "Утро".
    if (groups.anytime.length > 0) {
      groups.morning = groups.morning.concat(groups.anytime);
      groups.anytime = [];
    }

    return groups;
  }

  // === v4.0: СВОДНЫЙ ЭКРАН "МОЙ КУРС" ===

  /**
   * Открыть полноценный сводный экран витаминов
   * @param {string} dateKey - дата
   * @param {Function} onClose - callback при закрытии
   */
  function openMyCourseScreen(dateKey, onClose) {
    // Создаём контейнер
    let container = document.getElementById('supp-course-screen');
    if (!container) {
      container = document.createElement('div');
      container.id = 'supp-course-screen';
      document.body.appendChild(container);
    }

    let screenRootInstance = null;

    const U = HEYS.utils || {};
    const hasScience = HEYS.Supplements.SCIENCE?.BIOAVAILABILITY;

    // Визуальные константы (без зависимости от CSS/темы)
    const COURSE_MODAL_MAX_WIDTH = 640;
    const COURSE_MODAL_SIDE_PAD = 12;
    const DEFAULT_BOTTOM_MENU_PX = 72; // fallback (старое значение)
    const COURSE_MODAL_BOTTOM_GAP_PX = 10; // визуальный зазор над нижним меню

    // === Адаптивная высота нижнего меню (.tabs) + safe-area ===
    // Важно: в CSS нижние табы имеют padding-bottom: env(safe-area-inset-bottom)
    // Поэтому корректнее брать реальную высоту через DOM, а не хардкод.
    let _safeAreaInsetBottomPx = null;
    let _rerenderRaf = null;

    function getSafeAreaInsetBottomPxCached() {
      if (_safeAreaInsetBottomPx !== null) return _safeAreaInsetBottomPx;
      try {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom, 0px);pointer-events:none;z-index:-1;';
        document.body.appendChild(el);
        const px = parseFloat(window.getComputedStyle(el).paddingBottom) || 0;
        el.remove();
        _safeAreaInsetBottomPx = Math.max(0, Math.round(px));
        return _safeAreaInsetBottomPx;
      } catch (e) {
        _safeAreaInsetBottomPx = 0;
        return 0;
      }
    }

    function getBottomTabsOccupiedPx() {
      try {
        const tabs = document.querySelector('.tabs');
        if (!tabs) return 0;
        const rect = tabs.getBoundingClientRect();
        if (!rect || rect.height <= 0) return 0;
        // rect.top измеряется относительно layout viewport. Берём window.innerHeight для консистентности.
        const occupied = Math.max(0, Math.round(window.innerHeight - rect.top));
        // Небольшой sanity clamp, чтобы не улетать при странных значениях.
        return Math.min(260, occupied);
      } catch (e) {
        return 0;
      }
    }

    function getBottomOffsetPx() {
      const safePx = getSafeAreaInsetBottomPxCached();
      const tabsEl = document.querySelector('.tabs');
      // Если табы есть — они уже включают safe-area.
      if (tabsEl) {
        const tabsPx = getBottomTabsOccupiedPx();
        return tabsPx > 0 ? Math.max(safePx, tabsPx) : DEFAULT_BOTTOM_MENU_PX;
      }
      // Если табов нет — не добавляем “лишний” отступ, только safe-area.
      return safePx;
    }

    const renderScreenRoot = () => {
      if (!screenRootInstance) {
        screenRootInstance = ReactDOM.createRoot(container);
      }
      screenRootInstance.render(renderScreen());
    };

    const requestRerender = () => {
      if (_rerenderRaf) cancelAnimationFrame(_rerenderRaf);
      _rerenderRaf = requestAnimationFrame(() => {
        _rerenderRaf = null;
        try {
          renderScreenRoot();
        } catch (e) {
          // no-op
        }
      });
    };

    // Локальное UI-состояние модалки (живёт в замыкании)
    const uiState = {
      expandedSupp: {}, // { [suppId]: boolean }
    };

    const closeScreen = () => {
      try {
        if (_rerenderRaf) {
          cancelAnimationFrame(_rerenderRaf);
          _rerenderRaf = null;
        }
        window.removeEventListener('resize', requestRerender);
        window.removeEventListener('orientationchange', requestRerender);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', requestRerender);
          window.visualViewport.removeEventListener('scroll', requestRerender);
        }
      } catch (e) {
        // no-op
      }
      if (screenRootInstance) {
        screenRootInstance.unmount();
        screenRootInstance = null;
      }
      if (onClose) onClose();
    };

    // Рендер экрана
    const renderScreen = () => {
      const bottomOffsetPx = getBottomOffsetPx();
      const planned = getPlannedSupplements();
      const stats = getComplianceStats(14); // 2 недели
      const userFlags = getSupplementUserFlags();

      return React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: `${bottomOffsetPx}px`,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingLeft: `${COURSE_MODAL_SIDE_PAD}px`,
          paddingRight: `${COURSE_MODAL_SIDE_PAD}px`
        },
        onClick: (e) => { if (e.target === e.currentTarget) closeScreen(); }
      },
        React.createElement('div', {
          style: {
            flex: 1,
            marginTop: '40px',
            marginBottom: `${COURSE_MODAL_BOTTOM_GAP_PX}px`,
            background: 'var(--bg-secondary, #f8fafc)',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            borderBottomLeftRadius: '20px',
            borderBottomRightRadius: '20px',
            overflow: 'auto',
            maxHeight: `calc(100vh - 40px - ${bottomOffsetPx}px - ${COURSE_MODAL_BOTTOM_GAP_PX}px)`,
            width: '100%',
            maxWidth: `${COURSE_MODAL_MAX_WIDTH}px`,
            alignSelf: 'center'
          }
        },
          // Шапка
          React.createElement('div', {
            style: {
              position: 'sticky',
              top: 0,
              background: 'var(--card, #fff)',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 1
            }
          },
            React.createElement('span', { style: { fontWeight: '700', fontSize: '18px' } }, '💊 Мой курс витаминов'),
            React.createElement('button', {
              onClick: closeScreen,
              style: {
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px',
                color: '#64748b'
              }
            }, '×')
          ),

          // Контент
          React.createElement('div', { style: { padding: '16px', paddingBottom: '24px' } },
            // === Статистика курса ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '📊 Статистика за 14 дней'),
              React.createElement('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  textAlign: 'center'
                }
              },
                // Соблюдение
                React.createElement('div', {
                  style: {
                    background: stats.compliancePct >= 80 ? '#f0fdf4' : (stats.compliancePct >= 50 ? '#fffbeb' : '#fef2f2'),
                    borderRadius: '12px',
                    padding: '12px 8px'
                  }
                },
                  React.createElement('div', {
                    style: {
                      fontSize: '24px',
                      fontWeight: '700',
                      color: stats.compliancePct >= 80 ? '#16a34a' : (stats.compliancePct >= 50 ? '#d97706' : '#dc2626')
                    }
                  }, `${stats.compliancePct}%`),
                  React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, 'соблюдение')
                ),
                // Дней
                React.createElement('div', {
                  style: { background: 'var(--bg-secondary, #f1f5f9)', borderRadius: '12px', padding: '12px 8px' }
                },
                  React.createElement('div', { style: { fontSize: '24px', fontWeight: '700', color: '#334155' } }, stats.daysWithData),
                  React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, 'дней трекинга')
                ),
                // Принято
                React.createElement('div', {
                  style: { background: 'var(--bg-secondary, #f1f5f9)', borderRadius: '12px', padding: '12px 8px' }
                },
                  React.createElement('div', { style: { fontSize: '24px', fontWeight: '700', color: '#334155' } }, `${stats.totalTaken}/${stats.totalPlanned}`),
                  React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, 'принято')
                )
              )
            ),

            // === Мои витамины (список с настройками) ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }
              },
                React.createElement('span', { style: { fontWeight: '600', fontSize: '15px' } }, `✅ Мои витамины (${planned.length})`),
                React.createElement('button', {
                  onClick: () => {
                    if (HEYS.showCheckin?.supplements) {
                      // Важно: чек-ин модалка должна быть поверх (а у нас оверлей курса на top)
                      // Поэтому закрываем экран курса, открываем чек-ин, затем возвращаем курс.
                      closeScreen();
                      setTimeout(() => {
                        HEYS.showCheckin.supplements(dateKey, () => {
                          openMyCourseScreen(dateKey, onClose);
                        });
                      }, 50);
                    }
                  },
                  style: {
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }
                }, '+ Изменить')
              ),

              // Список витаминов с настройками
              planned.length === 0
                ? React.createElement('div', { style: { color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' } },
                  'Витамины не выбраны. Нажмите "+ Изменить" чтобы добавить.'
                )
                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  planned.map(id => {
                    const supp = SUPPLEMENTS_CATALOG[id];
                    if (!supp) return null;
                    const bio = hasScience && HEYS.Supplements.SCIENCE.BIOAVAILABILITY[id];
                    const setting = getSupplementSetting(id) || {};
                    const history = getSupplementHistory(id);
                    const timingInfo = TIMING[supp.timing];

                    const isExpanded = uiState.expandedSupp[id] === true;
                    const cInfo = getCourseInfo(id, dateKey);
                    const sideSum = getSideEffectSummary(id);
                    const warnings = getSafetyWarningsForSupplement(id, userFlags);

                    return React.createElement('div', {
                      key: id,
                      style: {
                        background: 'var(--bg-secondary, #f8fafc)',
                        borderRadius: '12px',
                        padding: '12px',
                        border: '1px solid #e2e8f0'
                      }
                    },
                      // Название и иконка
                      React.createElement('div', {
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }
                      },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          React.createElement('span', { style: { fontSize: '18px' } }, supp.icon),
                          React.createElement('span', { style: { fontWeight: '600', fontSize: '14px' } }, supp.name)
                        ),
                        // Кнопка научной карточки
                        bio && React.createElement('button', {
                          onClick: () => {
                            openSupplementsSciencePopup(id);
                          },
                          style: {
                            background: '#eff6ff',
                            border: '1px solid #93c5fd',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }
                        }, '🔬 Наука')
                      ),
                      // Мета-информация
                      React.createElement('div', {
                        style: {
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#64748b'
                        }
                      },
                        // Время приёма
                        timingInfo && React.createElement('span', {
                          style: {
                            background: 'var(--card, #fff)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0'
                          }
                        }, `${timingInfo.icon} ${timingInfo.name}`),
                        // Форма (если выбрана)
                        setting.form && React.createElement('span', {
                          style: {
                            background: '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            color: '#1d4ed8'
                          }
                        }, setting.form),
                        // Доза (с конвертацией единиц)
                        setting.dose && React.createElement('span', {
                          style: {
                            background: '#f0fdf4',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            color: '#16a34a'
                          }
                        }, getDoseDisplay(id, setting, bio)),
                        // Курсовость (недели + предупреждение о перерыве)
                        (() => {
                          if (!cInfo || cInfo.weeksOnCourse < 1) return null;
                          const needsBreak = cInfo.needsBreak;
                          return React.createElement('span', {
                            style: {
                              background: needsBreak ? '#fef2f2' : '#fef3c7',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              color: needsBreak ? '#dc2626' : '#92400e'
                            }
                          }, needsBreak ? `⚠️ ${cInfo.weeksOnCourse} нед. (нужен перерыв!)` : `📅 ${cInfo.weeksOnCourse} нед.`);
                        })()
                      ),

                      // Короткий статус + управление деталями (чтобы не было «каши»)
                      (() => {
                        const hasEffects = sideSum && sideSum.total > 0;
                        const needsBreak = cInfo?.needsBreak === true;
                        const w0 = warnings && warnings.length ? warnings[0] : null;

                        let msg = null;
                        let bg = '#ffffff';
                        let color = '#64748b';

                        if (w0) {
                          msg = `⚠️ ${w0}${warnings.length > 1 ? ` (+${warnings.length - 1})` : ''}`;
                          bg = '#fef2f2';
                          color = '#dc2626';
                        } else if (needsBreak) {
                          msg = `⏰ На курсе ${cInfo.weeksOnCourse} нед. — пора перерыв`;
                          bg = '#fffbeb';
                          color = '#92400e';
                        } else if (hasEffects) {
                          msg = `⚡ Побочки: ${sideSum.total} за ${sideSum.days} дн.`;
                          bg = '#fffbeb';
                          color = '#92400e';
                        }

                        return React.createElement('div', {
                          style: {
                            marginTop: '8px',
                            background: bg,
                            borderRadius: '10px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            color,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '10px',
                            alignItems: 'center',
                            border: msg ? 'none' : '1px solid #e2e8f0'
                          }
                        },
                          React.createElement('div', { style: { flex: 1 } }, msg || 'Советы, объяснения и детали'),
                          React.createElement('button', {
                            onClick: () => {
                              uiState.expandedSupp[id] = !isExpanded;
                              renderScreenRoot();
                            },
                            style: {
                              background: 'var(--card, #fff)',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              color: '#334155',
                              fontWeight: '600'
                            }
                          }, isExpanded ? 'Скрыть' : 'Подробнее')
                        );
                      })(),

                      // Детали (по запросу)
                      isExpanded && React.createElement('div', { style: { marginTop: '8px' } },
                        // Why-now badges ("почему именно сейчас")
                        (() => {
                          const badges = getWhyNowBadges(id, planned, setting, bio);
                          if (!badges || badges.length === 0) return null;
                          return React.createElement('div', {
                            style: {
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                              marginBottom: '8px'
                            }
                          }, badges.map((b, bi) => React.createElement('span', {
                            key: bi,
                            style: {
                              fontSize: '11px',
                              background: b.warn ? '#fef2f2' : '#f0fdf4',
                              color: b.warn ? '#dc2626' : '#16a34a',
                              padding: '2px 6px',
                              borderRadius: '6px'
                            }
                          }, `${b.icon} ${b.t}`)));
                        })(),

                        // Все safety warnings
                        warnings && warnings.length > 0 && React.createElement('div', {
                          style: {
                            background: '#fef2f2',
                            borderRadius: '10px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            color: '#dc2626',
                            marginBottom: '8px'
                          }
                        }, warnings.map((w, wi) => React.createElement('div', { key: wi, style: { marginBottom: wi < warnings.length - 1 ? '6px' : 0 } }, `⚠️ ${w}`))),

                        // Побочные эффекты (история + кнопка)
                        (() => {
                          const hasEffects = sideSum && sideSum.total > 0;
                          return React.createElement('div', {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }
                          },
                            hasEffects && React.createElement('span', {
                              style: {
                                fontSize: '12px',
                                color: '#f59e0b'
                              }
                            }, `⚡ ${sideSum.total} эффектов за ${sideSum.days} дн.`),
                            React.createElement('button', {
                              onClick: (e) => {
                                e.stopPropagation();
                                const effect = prompt('Опишите побочный эффект (можно коротко). Отмена — не сохраняем:');
                                if (effect && effect.trim()) {
                                  logSupplementSideEffect(id, dateKey, { note: effect.trim(), symptom: 'other' });
                                  HEYS.Toast?.tip('Записано. Если повторяется — попробуйте сменить время/форму или снизить дозу.') || alert('Записано. Если повторяется — попробуйте сменить время/форму или снизить дозу.');
                                  renderScreenRoot();
                                }
                              },
                              style: {
                                background: '#fef3c7',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '12px',
                                color: '#92400e',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }
                            }, '+ Побочка')
                          );
                        })(),

                        // Совет
                        supp.tip && React.createElement('div', {
                          style: {
                            fontSize: '12px',
                            color: '#64748b',
                            marginTop: '8px',
                            fontStyle: 'italic'
                          }
                        }, `💡 ${supp.tip}`)
                      )
                    );
                  })
                )
            ),

            // === Мои условия (user flags) ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '⚕️ Мои условия'),
              React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '10px' } }, 'Отметьте для персональных предупреждений:'),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                Object.entries(SUPP_USER_FLAGS).map(([flagId, flagData]) => {
                  const currentFlags = getSupplementUserFlags();
                  const isChecked = currentFlags[flagId] === true;
                  return React.createElement('label', {
                    key: flagId,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      background: isChecked ? '#fef3c7' : '#f8fafc',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }
                  },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: isChecked,
                      onChange: () => {
                        setSupplementUserFlag(flagId, !isChecked);
                        renderScreenRoot();
                      },
                      style: { width: '18px', height: '18px' }
                    }),
                    React.createElement('span', { style: { fontSize: '14px' } }, flagData.label)
                  );
                })
              )
            ),

            // === Рекомендации по рациону ===
            (() => {
              const dietSuggestions = getWeeklyDietSuggestions(7);
              if (!dietSuggestions || dietSuggestions.length === 0) return null;
              return React.createElement('div', {
                style: {
                  background: 'var(--card, #fff)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }
              },
                React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '🥗 По вашему рациону'),
                React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '10px' } }, 'Анализ питания за 7 дней:'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  dietSuggestions.map((sug, si) => {
                    const isSupplement = !!sug.suppId;
                    const isPlanned = isSupplement && planned.includes(sug.suppId);
                    return React.createElement('div', {
                      key: si,
                      style: {
                        background: isPlanned ? '#f0fdf4' : '#fffbeb',
                        border: isPlanned ? '1px solid #86efac' : '1px solid #fcd34d',
                        borderRadius: '10px',
                        padding: '10px'
                      }
                    },
                      React.createElement('div', { style: { fontWeight: '600', fontSize: '13px', color: '#334155' } },
                        sug.icon, ' ', isSupplement ? (SUPPLEMENTS_CATALOG[sug.suppId]?.name || sug.suppId) : sug.title,
                        isPlanned && React.createElement('span', { style: { color: '#16a34a', marginLeft: '8px', fontWeight: '400' } }, '✓ уже в курсе')
                      ),
                      React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginTop: '4px' } }, sug.reason),
                      (!isPlanned && isSupplement) && React.createElement('button', {
                        onClick: () => {
                          const current = getPlannedSupplements();
                          if (!current.includes(sug.suppId)) {
                            savePlannedSupplements([...current, sug.suppId]);
                            renderScreenRoot();
                          }
                        },
                        style: {
                          marginTop: '8px',
                          background: '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }
                      }, '+ Добавить в курс')
                    );
                  })
                )
              );
            })(),

            // === Взаимодействия ===
            (() => {
              const { synergies, conflicts } = checkInteractions(planned);
              if (synergies.length === 0 && conflicts.length === 0) return null;

              return React.createElement('div', {
                style: {
                  background: 'var(--card, #fff)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }
              },
                React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '🔗 Взаимодействия'),
                synergies.length > 0 && React.createElement('div', {
                  style: {
                    background: '#f0fdf4',
                    borderRadius: '10px',
                    padding: '10px',
                    marginBottom: synergies.length > 0 && conflicts.length > 0 ? '10px' : 0,
                    fontSize: '12px',
                    color: '#16a34a'
                  }
                }, synergies.map((s, i) => React.createElement('div', { key: i, style: { marginBottom: i < synergies.length - 1 ? '4px' : 0 } }, s))),
                conflicts.length > 0 && React.createElement('div', {
                  style: {
                    background: '#fffbeb',
                    borderRadius: '10px',
                    padding: '10px',
                    fontSize: '12px',
                    color: '#d97706'
                  }
                }, conflicts.map((c, i) => React.createElement('div', { key: i, style: { marginBottom: i < conflicts.length - 1 ? '4px' : 0 } }, c)))
              );
            })(),

            // === Готовые курсы ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '📦 Готовые курсы'),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                Object.entries(COURSES).map(([cid, course]) => {
                  const isActive = course.supplements.every(id => planned.includes(id));
                  return React.createElement('button', {
                    key: cid,
                    onClick: () => {
                      if (!isActive) {
                        applyCourse(cid);
                        renderScreenRoot();
                      }
                    },
                    disabled: isActive,
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isActive ? '#f0fdf4' : '#f8fafc',
                      border: isActive ? '2px solid #86efac' : '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px',
                      cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left'
                    }
                  },
                    React.createElement('div', null,
                      React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#334155' } },
                        course.name,
                        isActive && React.createElement('span', { style: { color: '#16a34a', marginLeft: '8px' } }, '✓ активен')
                      ),
                      React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '2px' } },
                        course.supplements.map(id => SUPPLEMENTS_CATALOG[id]?.name || id).join(', ')
                      )
                    ),
                    !isActive && React.createElement('span', { style: { fontSize: '12px', color: '#3b82f6', fontWeight: '600' } }, 'Добавить →')
                  );
                })
              )
            )
          )
        )
      );
    };

    // Обновляем размеры при изменении viewport (клавиатура/поворот/resize)
    try {
      window.addEventListener('resize', requestRerender);
      window.addEventListener('orientationchange', requestRerender);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', requestRerender);
        window.visualViewport.addEventListener('scroll', requestRerender);
      }
    } catch (e) {
      // no-op
    }

    renderScreenRoot();
  }

  // === КОМПОНЕНТ КАРТОЧКИ В СТАТИСТИКЕ v4.0 ===

  // v3.3: Root для научного popup (React 18 createRoot)
  let sciencePopupRoot = null;
  let sciencePopupRootInstance = null;

  function openSupplementsSciencePopup(suppId) {
    const hasScience = HEYS.Supplements?.SCIENCE?.BIOAVAILABILITY;
    if (!hasScience) return;

    if (!sciencePopupRoot) {
      sciencePopupRoot = document.createElement('div');
      sciencePopupRoot.id = 'supp-science-popup';
      document.body.appendChild(sciencePopupRoot);
    }

    if (!sciencePopupRootInstance) {
      sciencePopupRootInstance = ReactDOM.createRoot(sciencePopupRoot);
    }

    const closePopup = () => {
      if (sciencePopupRootInstance) {
        sciencePopupRootInstance.unmount();
        sciencePopupRootInstance = null;
      }
      if (sciencePopupRoot && sciencePopupRoot.parentNode) {
        sciencePopupRoot.parentNode.removeChild(sciencePopupRoot);
        sciencePopupRoot = null;
      }
    };

    sciencePopupRootInstance.render(renderSciencePopup(suppId, closePopup));
  }

  /**
   * Рендер карточки витаминов для вкладки статистики
   * Переработанная версия — чистая, интуитивная, с кнопкой "Мой курс"
   * @param {Object} props - { dateKey, onForceUpdate }
   * @returns {React.Element|null}
   */
  function renderSupplementsCard(props) {
    const { dateKey, onForceUpdate } = props || {};
    if (!dateKey) return null;

    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});

    // v3.3: Используем planned из дня ИЛИ из профиля (если чек-ин не был)
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    const taken = dayData.supplementsTaken || [];

    // v4.0: Если ничего не запланировано — приглашаем настроить
    if (planned.length === 0) {
      return React.createElement('div', {
        className: 'compact-card supplements-card widget widget--supplements-diary',
        style: {
          display: 'block',
          marginBottom: '12px',
          padding: 'var(--heys-diary-card-padding, 14px 16px)',
          boxSizing: 'border-box'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }
        },
          React.createElement('span', {
            style: {
              fontWeight: 'var(--heys-diary-card-title-weight, 600)',
              fontSize: 'var(--heys-diary-card-title-size, 14px)',
              color: 'var(--heys-diary-card-title-color, var(--text, #1e293b))'
            }
          }, '💊 Витамины')
        ),
        React.createElement('div', {
          style: {
            textAlign: 'center',
            padding: '16px',
            background: 'var(--bg-secondary, #f8fafc)',
            borderRadius: '12px'
          }
        },
          React.createElement('div', {
            style: { fontSize: '32px', marginBottom: '8px' }
          }, '💊'),
          React.createElement('div', {
            style: { fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '4px' }
          }, 'Витамины не настроены'),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }
          }, 'Отслеживайте приём добавок и получайте умные рекомендации'),
          React.createElement('button', {
            onClick: () => openMyCourseScreen(dateKey, onForceUpdate),
            style: {
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }
          }, '⚙️ Настроить курс')
        )
      );
    }

    const allTaken = planned.length > 0 && planned.every(id => taken.includes(id));
    const takenCount = planned.filter(id => taken.includes(id)).length;

    // v3.0: Группируем по времени приёма
    const timeGroups = groupByTimeOfDay(planned);

    // v2.0: Проверяем взаимодействия
    const { synergies, conflicts } = checkInteractions(planned);

    // v2.0: Проверяем бонус к инсулиновой волне
    const insulinBonus = getInsulinWaveBonus(dateKey);

    // v3.3: Проверяем наличие научных данных
    const hasScience = HEYS.Supplements.SCIENCE?.BIOAVAILABILITY;

    const cardStateKey = `heys_supplements_card_${dateKey}`;
    const isExpanded = readSessionValue(cardStateKey, false);

    const setExpanded = (next) => {
      writeSessionValue(cardStateKey, !!next);
      if (onForceUpdate) onForceUpdate();
    };

    const toggleExpanded = (e) => {
      if (e?.stopPropagation) e.stopPropagation();
      setExpanded(!isExpanded);
    };

    const handleCardClick = (e) => {
      if (isInteractiveTarget(e?.target)) return;
      setExpanded(!isExpanded);
    };

    const toggleTaken = (id) => {
      const isTaken = taken.includes(id);
      markSupplementTaken(dateKey, id, !isTaken);
      if (onForceUpdate) onForceUpdate();
    };

    const markAll = () => {
      markAllSupplementsTaken(dateKey);
      if (onForceUpdate) onForceUpdate();
    };

    // v3.3: Открыть научный popup
    const openSciencePopup = (suppId) => {
      if (!hasScience) return;
      openSupplementsSciencePopup(suppId);
    };

    // Рендер группы витаминов с анимацией + Smart Schedule batch-кнопка
    const renderGroup = (groupId, suppIds) => {
      if (suppIds.length === 0) return null;
      const group = TIME_GROUPS[groupId];
      const groupTakenCount = suppIds.filter(id => taken.includes(id)).length;
      const allGroupTaken = groupTakenCount === suppIds.length;
      const notTakenInGroup = suppIds.filter(id => !taken.includes(id));

      // UI: цвета для бейджа времени приёма (чтобы визуально разделить группы)
      const GROUP_THEME = {
        morning: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },   // amber
        withMeal: { bg: '#dbeafe', border: '#60a5fa', fg: '#1d4ed8' },  // blue
        evening: { bg: '#ede9fe', border: '#a78bfa', fg: '#6d28d9' },   // violet
        anytime: { bg: '#f1f5f9', border: '#cbd5e1', fg: '#334155' },   // slate
      };
      const theme = GROUP_THEME[groupId] || GROUP_THEME.anytime;

      // v3.5: Batch mark для группы
      const markGroupTaken = () => {
        if (notTakenInGroup.length > 0) {
          markSupplementsTaken(dateKey, notTakenInGroup, true);
          if (onForceUpdate) onForceUpdate();
        }
      };

      return React.createElement('div', {
        key: groupId,
        style: { marginBottom: '12px' }
      },
        // Заголовок группы с batch-кнопкой
        React.createElement('div', {
          style: {
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }
        },
          // Бейдж времени приёма (слева)
          React.createElement('div', {
            style: {
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.fg,
              borderRadius: '999px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: '800',
              lineHeight: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }
          },
            group.label,
            allGroupTaken && React.createElement('span', { style: { fontWeight: '900' } }, '✓')
          ),

          // Batch-кнопка (справа)
          React.createElement('div', null,
            suppIds.length > 1 && React.createElement('button', {
              onClick: allGroupTaken ? null : markGroupTaken,
              style: {
                background: allGroupTaken ? '#f0fdf4' : '#dbeafe',
                border: allGroupTaken ? '1px solid #86efac' : '1px solid #60a5fa',
                borderRadius: '10px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: '700',
                color: allGroupTaken ? '#16a34a' : '#2563eb',
                cursor: allGroupTaken ? 'default' : 'pointer'
              },
              title: allGroupTaken ? 'Все приняты' : `Отметить все: ${notTakenInGroup.length} шт`
            }, allGroupTaken ? '✓ выпил все' : 'выпить все')
          )
        ),
        // Чипы витаминов
        React.createElement('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '6px' }
        },
          suppIds.map(id => {
            const supp = SUPPLEMENTS_CATALOG[id];
            if (!supp) return null;
            const isTaken = taken.includes(id);
            const hasScienceData = hasScience && HEYS.Supplements.SCIENCE.BIOAVAILABILITY[id];
            const setting = getSupplementSetting(id) || {};
            const whyBadges = getWhyNowBadges(id, planned, setting, hasScienceData);
            const firstBadge = whyBadges && whyBadges.length > 0 ? whyBadges[0] : null;

            // v3.3: Таймер для долгого нажатия
            let longPressTimer = null;
            let isLongPress = false;

            const handleTouchStart = (e) => {
              isLongPress = false;
              longPressTimer = setTimeout(() => {
                isLongPress = true;
                // Вибрация для тактильной обратной связи
                if (navigator.vibrate) navigator.vibrate(50);
                openSciencePopup(id);
              }, 500); // 500ms для долгого нажатия
            };

            const handleTouchEnd = (e) => {
              clearTimeout(longPressTimer);
              // Не делаем toggle здесь — это сделает onClick
              // isLongPress сбросится в handleClick если был long press
            };

            const handleTouchMove = () => {
              clearTimeout(longPressTimer);
            };

            // Обработчик клика (для десктопа и мобильных без hasScienceData)
            const handleClick = (e) => {
              // Если это был long press на touch — не toggle (уже открыт popup)
              if (isLongPress) {
                isLongPress = false;
                return;
              }
              const btn = e.currentTarget;
              btn.style.transform = 'scale(1.15)';
              setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
              toggleTaken(id);
            };

            return React.createElement('button', {
              key: id,
              className: 'supp-chip',
              onTouchStart: hasScienceData ? handleTouchStart : null,
              onTouchEnd: hasScienceData ? handleTouchEnd : null,
              onTouchMove: hasScienceData ? handleTouchMove : null,
              onClick: handleClick,  // Всегда обрабатываем клик
              title: supp.tip + (hasScienceData ? ' (нажми 🔬 для подробностей)' : '') + (firstBadge ? ` | ${firstBadge.icon} ${firstBadge.t}` : ''),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '14px',
                border: firstBadge?.warn ? '1px solid #fca5a5' : 'none',
                background: isTaken ? '#dcfce7' : (firstBadge?.warn ? '#fef2f2' : '#f1f5f9'),
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                color: isTaken ? '#16a34a' : (firstBadge?.warn ? '#dc2626' : '#64748b'),
                transition: 'all 0.15s ease',
                transform: 'scale(1)',
                position: 'relative'
              }
            },
              React.createElement('span', null, isTaken ? '✅' : supp.icon),
              React.createElement('span', null, supp.name),
              // v3.6: Явная кнопка "🔬" для открытия научной карточки (без конфликта с toggle)
              hasScienceData && React.createElement('span', {
                role: 'button',
                tabIndex: 0,
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openSciencePopup(id);
                },
                onKeyDown: (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    openSciencePopup(id);
                  }
                },
                title: '🔬 Открыть научную карточку',
                style: {
                  fontSize: '10px',
                  marginLeft: '4px',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  border: '1px solid #93c5fd',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  lineHeight: '14px',
                  fontWeight: '600',
                  opacity: 0.95
                }
              }, '🔬')
            );
          })
        )
      );
    };

    return React.createElement('div', {
      className: 'compact-card supplements-card widget widget--supplements-diary' + (allTaken ? ' widget--supplements-diary--all-taken' : ''),
      onClick: handleCardClick,
      style: {
        display: 'block',
        marginBottom: '12px',
        padding: 'var(--heys-diary-card-padding, 14px 16px)',
        boxSizing: 'border-box'
      }
    },
      // v4.1: Шапка (1 строка)
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px'
        }
      },
        // Левая часть: название + прогресс
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          React.createElement('span', {
            style: {
              fontWeight: 'var(--heys-diary-card-title-weight, 600)',
              fontSize: 'var(--heys-diary-card-title-size, 14px)',
              color: 'var(--heys-diary-card-title-color, var(--text, #1e293b))'
            }
          }, '💊 Витамины'),
          // Прогресс-бар
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }
          },
            React.createElement('div', {
              style: {
                width: '60px',
                height: '6px',
                background: '#e2e8f0',
                borderRadius: '3px',
                overflow: 'hidden'
              }
            },
              React.createElement('div', {
                style: {
                  width: `${(takenCount / planned.length) * 100}%`,
                  height: '100%',
                  background: allTaken ? '#22c55e' : '#3b82f6',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }
              })
            ),
            React.createElement('span', {
              style: {
                fontSize: '12px',
                color: allTaken ? '#16a34a' : '#64748b',
                fontWeight: '600'
              }
            }, `${takenCount}/${planned.length}`)
          )
        ),
        // Правая часть: бонус волны + кнопка курса + toggle
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          insulinBonus < 0 && React.createElement('span', {
            style: {
              fontSize: '10px',
              background: '#dcfce7',
              color: '#16a34a',
              padding: '2px 6px',
              borderRadius: '6px',
              fontWeight: '600'
            },
            title: 'Бонус к инсулиновой волне от добавок'
          }, `🌊${Math.round(insulinBonus * 100)}%`),
          React.createElement('button', {
            'data-supp-collapse-ignore': '1',
            onClick: (e) => {
              e.stopPropagation();
              openMyCourseScreen(dateKey, onForceUpdate);
            },
            style: {
              background: 'var(--bg-secondary, #f1f5f9)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            },
            title: 'Открыть настройки курса'
          }, '📊'),
          React.createElement('button', {
            'data-supp-collapse-ignore': '1',
            onClick: toggleExpanded,
            style: {
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: 'var(--bg-secondary, #f8fafc)',
              color: '#64748b',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer'
            },
            title: isExpanded ? 'Свернуть' : 'Развернуть'
          }, isExpanded ? '▴' : '▾')
        )
      ),
      // v4.1: Действие (2 строка)
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: isExpanded ? '10px' : 0
        }
      },
        !allTaken && React.createElement('button', {
          onClick: (e) => {
            e.stopPropagation();
            markAll();
          },
          style: {
            flex: 1,
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #60a5fa',
            background: 'var(--bg-secondary, #f8fafc)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            color: '#2563eb',
            boxShadow: '0 1px 2px rgba(59, 130, 246, 0.12)'
          }
        }, 'Выпить все'),
        allTaken && React.createElement('div', {
          style: {
            flex: 1,
            textAlign: 'center',
            padding: '8px 10px',
            background: '#f0fdf4',
            borderRadius: '10px'
          }
        },
          React.createElement('span', { style: { fontSize: '12px', color: '#16a34a', fontWeight: '600' } }, '🎉 Все витамины приняты')
        )
      ),
      isExpanded && React.createElement('div', { className: 'supplements-card__expanded' },
        // v3.1: Напоминание по времени
        (() => {
          const reminder = getTimeReminder(planned, taken);
          if (!reminder) return null;
          return React.createElement('div', {
            style: {
              fontSize: '12px',
              color: reminder.urgency === 'high' ? '#dc2626' : '#d97706',
              background: reminder.urgency === 'high' ? '#fef2f2' : '#fffbeb',
              padding: '8px 10px',
              borderRadius: '8px',
              marginBottom: '10px',
              fontWeight: '500'
            }
          }, reminder.message);
        })(),
        // v3.0: Группы по времени
        // UX: "Любое время" слито с "Утро" (см. groupByTimeOfDay)
        ['morning', 'withMeal', 'evening'].map(gid => renderGroup(gid, timeGroups[gid])),
        // v2.0: Синергии
        synergies.length > 0 && React.createElement('div', {
          style: {
            fontSize: '12px',
            color: '#16a34a',
            background: '#f0fdf4',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '8px'
          }
        }, synergies.map((s, i) => React.createElement('div', { key: i }, s))),
        // v2.0: Конфликты
        conflicts.length > 0 && React.createElement('div', {
          style: {
            fontSize: '12px',
            color: '#d97706',
            background: '#fffbeb',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '8px'
          }
        }, conflicts.map((c, i) => React.createElement('div', { key: i }, c))),
        // v4.0: Подсказка — компактная и понятная
        React.createElement('div', {
          style: {
            fontSize: '11px',
            color: '#94a3b8',
            textAlign: 'center',
            marginTop: '10px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }
        },
          React.createElement('span', null, '👆 Тап = ✅ принял'),
          hasScience && React.createElement('span', null, '🔬 = подробности'),
          React.createElement('span', null, '📊 = мой курс')
        )
      )
    );
  }

  // === v3.5: HELPER-ФУНКЦИИ ДЛЯ POPUP СЕКЦИЙ ===

  /**
   * Секция "Мои настройки" — форма, доза, время
   */
  function renderSettingsSection(suppId, bio, sectionStyle, labelStyle) {
    const setting = getSupplementSetting(suppId) || {};
    const forms = bio?.forms || {};
    const formIds = Object.keys(forms);

    // Если нет форм — минимальная секция
    if (formIds.length === 0) {
      return React.createElement('div', { style: sectionStyle },
        React.createElement('div', { style: labelStyle }, '⚙️ Мои настройки'),
        React.createElement('div', { style: { fontSize: '13px', color: '#64748b' } },
          'Форму и дозу можно указать вручную в профиле'
        )
      );
    }

    // Текущие значения
    const currentForm = setting.form || formIds[0];
    const currentDose = setting.dose || '';
    const currentUnit = setting.unit || forms[currentForm]?.unit || 'мг';

    // Получаем данные текущей формы
    const formData = forms[currentForm] || {};
    const absorption = formData.absorption ? Math.round(formData.absorption * 100) : null;

    return React.createElement('div', { style: sectionStyle },
      React.createElement('div', { style: labelStyle }, '⚙️ Мои настройки'),

      // Выбор формы
      formIds.length > 1 && React.createElement('div', { style: { marginBottom: '10px' } },
        React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px' } }, 'Форма:'),
        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
          formIds.map(fid => {
            const f = forms[fid];
            const isSelected = fid === currentForm;
            return React.createElement('button', {
              key: fid,
              onClick: () => {
                setSupplementSetting(suppId, { form: fid, unit: f.unit || 'мг' });
                // Перерендер popup
                window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
              },
              style: {
                padding: '4px 10px',
                borderRadius: '10px',
                border: isSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: isSelected ? '#eff6ff' : '#fff',
                color: isSelected ? '#1d4ed8' : '#64748b',
                fontSize: '12px',
                fontWeight: isSelected ? '600' : '400',
                cursor: 'pointer'
              }
            }, fid, f.absorption && ` (${Math.round(f.absorption * 100)}%)`);
          })
        )
      ),

      // Биодоступность выбранной формы
      absorption && React.createElement('div', {
        style: {
          fontSize: '12px',
          color: absorption >= 50 ? '#16a34a' : (absorption >= 20 ? '#d97706' : '#dc2626'),
          background: absorption >= 50 ? '#f0fdf4' : (absorption >= 20 ? '#fffbeb' : '#fef2f2'),
          padding: '6px 10px',
          borderRadius: '8px',
          marginBottom: '10px'
        }
      },
        absorption >= 50 ? '✓' : (absorption >= 20 ? '⚠️' : '✗'),
        ` Биодоступность ${currentForm}: ${absorption}%`,
        formData.use && ` — ${formData.use}`
      ),

      // Поле дозы (display only — упрощённо)
      React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } },
        'Доза: ',
        currentDose ? `${currentDose} ${currentUnit}` : 'не указана',
        bio?.optimalDose && ` (рекомендуется: ${bio.optimalDose})`
      )
    );
  }

  /**
   * Секция "Лимиты и безопасность" — UL, предупреждения
   */
  function renderLimitsSection(suppId, sectionStyle, labelStyle) {
    const science = HEYS.Supplements.SCIENCE;
    const limits = science?.LIMITS?.[suppId];

    // v4.0: Safety warnings на основе user flags
    const userFlags = getSupplementUserFlags();
    const safetyWarnings = getSafetyWarningsForSupplement(suppId, userFlags);

    if (!limits && safetyWarnings.length === 0) return null;

    const setting = getSupplementSetting(suppId) || {};
    const currentDose = parseFloat(setting.dose) || 0;
    const ul = limits?.ul;

    // v4.0: Курсовость — проверяем продолжительность
    const cInfo = getCourseInfo(suppId, new Date().toISOString().slice(0, 10));
    const courseWarning = cInfo?.needsBreak ? `⏰ На курсе ${cInfo.weeksOnCourse} недель — рекомендуется перерыв!` : null;

    // Проверяем превышение UL
    let ulWarning = null;
    if (ul && currentDose > 0) {
      const pct = (currentDose / ul) * 100;
      if (pct > 100) {
        ulWarning = { level: 'danger', text: `⚠️ Доза ${currentDose} превышает UL (${ul})!`, pct };
      } else if (pct > 80) {
        ulWarning = { level: 'warning', text: `⚡ Доза близка к верхнему лимиту (${Math.round(pct)}% от UL)`, pct };
      }
    }

    const hasDanger = ulWarning?.level === 'danger' || safetyWarnings.length > 0 || courseWarning;

    return React.createElement('div', {
      style: {
        ...sectionStyle,
        background: hasDanger ? '#fef2f2' : (ulWarning ? '#fffbeb' : sectionStyle.background)
      }
    },
      React.createElement('div', { style: labelStyle }, '⚠️ Лимиты и безопасность'),

      // v4.0: Персональные предупреждения (на основе user flags)
      safetyWarnings.length > 0 && React.createElement('div', {
        style: {
          background: '#fee2e2',
          borderRadius: '8px',
          padding: '8px 10px',
          marginBottom: '10px'
        }
      }, safetyWarnings.map((w, i) => React.createElement('div', {
        key: i,
        style: { fontSize: '12px', color: '#dc2626', fontWeight: '500', marginBottom: i < safetyWarnings.length - 1 ? '4px' : 0 }
      }, `🚨 ${w}`))),

      // v4.0: Предупреждение о длительности курса
      courseWarning && React.createElement('div', {
        style: {
          fontSize: '12px',
          fontWeight: '600',
          color: '#d97706',
          padding: '6px 10px',
          background: '#fef3c7',
          borderRadius: '8px',
          marginBottom: '8px'
        }
      }, courseWarning),

      // UL (верхний лимит)
      ul && React.createElement('div', { style: { fontSize: '13px', marginBottom: '6px' } },
        React.createElement('span', { style: { fontWeight: '600' } }, 'UL (верхний предел): '),
        `${ul} ${limits.unit || 'мг'}/день`
      ),

      // Предупреждение о превышении
      ulWarning && React.createElement('div', {
        style: {
          fontSize: '12px',
          fontWeight: '600',
          color: ulWarning.level === 'danger' ? '#dc2626' : '#d97706',
          padding: '6px 10px',
          background: ulWarning.level === 'danger' ? '#fee2e2' : '#fef3c7',
          borderRadius: '8px',
          marginBottom: '8px'
        }
      }, ulWarning.text),

      // Риски передозировки
      limits.toxicity && React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '6px' } },
        React.createElement('span', { style: { fontWeight: '500' } }, 'Риски: '),
        limits.toxicity
      ),

      // Рекомендуемая длительность курса
      limits.courseDuration && React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } },
        React.createElement('span', { style: { fontWeight: '500' } }, 'Курс: '),
        limits.courseDuration
      )
    );
  }

  /**
   * Секция "История курса" — дни приёма, streak
   */
  function renderHistorySection(suppId, sectionStyle, labelStyle) {
    const history = getSupplementHistory();
    const h = history[suppId];

    if (!h || h.days === 0) return null;

    // Вычисляем streak (последовательные дни)
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const isActiveStreak = h.lastTaken === today || h.lastTaken === yesterday;

    return React.createElement('div', { style: sectionStyle },
      React.createElement('div', { style: labelStyle }, '📊 История курса'),

      React.createElement('div', { style: { display: 'flex', gap: '16px', fontSize: '13px' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600', fontSize: '18px', color: 'var(--text, #1e293b)' } }, h.days),
          React.createElement('div', { style: { color: '#64748b', fontSize: '11px' } }, 'дней приёма')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600', fontSize: '18px', color: 'var(--text, #1e293b)' } }, h.totalTaken || 0),
          React.createElement('div', { style: { color: '#64748b', fontSize: '11px' } }, 'всего принято')
        ),
        isActiveStreak && React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600', fontSize: '18px', color: '#16a34a' } }, '🔥'),
          React.createElement('div', { style: { color: '#16a34a', fontSize: '11px' } }, 'активный курс')
        )
      ),

      h.startDate && React.createElement('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '8px' }
      }, `Начало курса: ${h.startDate}`)
    );
  }

  // === v3.3: НАУЧНЫЕ UI КОМПОНЕНТЫ ===

  /**
   * Рендер научной информации о добавке (popup)
   */
  function renderSciencePopup(suppId, onClose) {
    // Проверяем наличие научного модуля
    const science = HEYS.Supplements.SCIENCE;
    if (!science || !science.BIOAVAILABILITY) {
      return React.createElement('div', {
        style: { padding: '16px', textAlign: 'center', color: '#64748b' }
      }, 'Научный модуль не загружен');
    }

    const supp = SUPPLEMENTS_CATALOG[suppId];
    const bio = science.BIOAVAILABILITY[suppId];

    if (!supp) return null;

    // Получаем расширенные данные
    const synergies = HEYS.Supplements.getSynergies?.(suppId) || [];
    const antagonisms = HEYS.Supplements.getAntagonisms?.(suppId) || [];
    const foodTips = HEYS.Supplements.getFoodTips?.(suppId) || [];
    const optimalTime = HEYS.Supplements.getOptimalTime?.(suppId);

    const sectionStyle = {
      marginBottom: '12px',
      padding: '10px',
      background: 'var(--bg-secondary, #f8fafc)',
      borderRadius: '10px'
    };

    const labelStyle = {
      fontSize: '11px',
      fontWeight: '600',
      color: '#64748b',
      marginBottom: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    };

    const valueStyle = {
      fontSize: '14px',
      color: 'var(--text, #1e293b)'
    };

    return React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      },
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
    },
      React.createElement('div', {
        style: {
          background: 'var(--card, #fff)',
          borderRadius: '20px',
          maxWidth: '400px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: '20px'
        }
      },
        // Заголовок
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { fontSize: '28px' } }, supp.icon),
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: '700', fontSize: '18px' } }, supp.name),
              React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } },
                SUPPLEMENT_CATEGORIES[supp.category]?.name || supp.category
              )
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              color: '#94a3b8'
            }
          }, '×')
        ),

        // Подсказка
        supp.tip && React.createElement('div', {
          style: {
            background: '#f0fdf4',
            color: '#16a34a',
            padding: '10px 12px',
            borderRadius: '10px',
            fontSize: '13px',
            marginBottom: '16px'
          }
        }, '💡 ', supp.tip),

        // Биодоступность (если есть научные данные)
        bio && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🔬 Биодоступность'),
          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' } },
            React.createElement('div', {
              style: {
                background: '#fef3c7',
                color: '#92400e',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '500'
              }
            }, `Базовая: ${Math.round(bio.baseAbsorption * 100)}%`),
            bio.withFat && React.createElement('div', {
              style: {
                background: '#dcfce7',
                color: '#166534',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '500'
              }
            }, `С жирами: ${Math.round(bio.withFat * 100)}%`)
          ),
          bio.mechanism && React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }
          }, bio.mechanism),
          bio.optimalDose && React.createElement('div', {
            style: { fontSize: '13px', marginTop: '8px', fontWeight: '500' }
          }, '💊 Оптимальная доза: ', bio.optimalDose)
        ),

        // Формы (если есть)
        bio?.forms && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🧬 Формы'),
          Object.entries(bio.forms).map(([formId, form]) =>
            React.createElement('div', {
              key: formId,
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '13px'
              }
            },
              React.createElement('span', { style: { fontWeight: '500' } }, formId),
              React.createElement('span', { style: { color: '#64748b' } },
                `${Math.round(form.absorption * 100)}% — ${form.use || form.conversion || ''}`
              )
            )
          )
        ),

        // Оптимальное время
        optimalTime && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '⏰ Оптимальное время'),
          React.createElement('div', { style: valueStyle },
            optimalTime.period === 'any'
              ? optimalTime.reason
              : `${TIMING[optimalTime.period]?.icon || ''} ${TIMING[optimalTime.period]?.name || optimalTime.period} — ${optimalTime.reason}`
          )
        ),

        // Синергии
        synergies.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '✨ Синергии'),
          synergies.map((s, i) =>
            React.createElement('div', {
              key: i,
              style: {
                padding: '8px 0',
                borderBottom: i < synergies.length - 1 ? '1px solid #e2e8f0' : 'none'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#16a34a' } },
                `+ ${SUPPLEMENTS_CATALOG[s.partner]?.name || s.partner}`
              ),
              s.mechanism && React.createElement('div', {
                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
              }, s.mechanism),
              s.ratio && React.createElement('div', {
                style: { fontSize: '12px', color: '#0ea5e9', marginTop: '2px' }
              }, '📐 ', s.ratio)
            )
          )
        ),

        // Антагонизмы
        antagonisms.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '⚠️ Не сочетать'),
          antagonisms.map((a, i) =>
            React.createElement('div', {
              key: i,
              style: {
                padding: '8px 0',
                borderBottom: i < antagonisms.length - 1 ? '1px solid #e2e8f0' : 'none'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#d97706' } },
                `✗ ${SUPPLEMENTS_CATALOG[a.conflict]?.name || a.conflict}`
              ),
              a.mechanism && React.createElement('div', {
                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
              }, a.mechanism),
              a.solution && React.createElement('div', {
                style: { fontSize: '12px', color: '#0ea5e9', marginTop: '2px' }
              }, '💡 ', a.solution)
            )
          )
        ),

        // Советы по еде
        foodTips.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🍽️ С едой'),
          foodTips.map((tip, i) =>
            React.createElement('div', {
              key: i,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 0',
                fontSize: '13px'
              }
            },
              React.createElement('span', {
                style: {
                  background: tip.type === 'enhancer' ? '#dcfce7' : '#fef3c7',
                  color: tip.type === 'enhancer' ? '#166534' : '#92400e',
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '11px'
                }
              }, tip.type === 'enhancer' ? '✓' : '✗'),
              React.createElement('span', null, tip.food),
              React.createElement('span', { style: { color: '#64748b' } }, tip.effect)
            )
          )
        ),

        // Тестирование
        bio?.testMarker && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🧪 Анализы'),
          React.createElement('div', { style: valueStyle }, bio.testMarker),
          bio.optimalLevel && React.createElement('div', {
            style: { fontSize: '12px', color: '#16a34a', marginTop: '4px' }
          }, '✓ Оптимум: ', bio.optimalLevel)
        ),

        // v3.5: Мои настройки (форма, доза)
        renderSettingsSection(suppId, bio, sectionStyle, labelStyle),

        // v3.5: Лимиты и безопасность
        renderLimitsSection(suppId, sectionStyle, labelStyle),

        // v3.5: История курса
        renderHistorySection(suppId, sectionStyle, labelStyle),

        // Кнопка закрыть
        React.createElement('button', {
          onClick: onClose,
          style: {
            width: '100%',
            padding: '12px',
            background: 'var(--bg-secondary, #f1f5f9)',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            marginTop: '8px'
          }
        }, 'Закрыть')
      )
    );
  }

  /**
   * Рендер умных рекомендаций с научным обоснованием
   */
  function renderScientificRecommendations(profile, dayData, meals) {
    const recs = HEYS.Supplements.getScientificRecommendations?.(profile, dayData, meals);
    if (!recs || recs.length === 0) return null;

    const priorityColors = {
      critical: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
      high: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
      medium: { bg: '#fefce8', border: '#fde047', text: '#ca8a04' },
      timing: { bg: '#ecfdf5', border: '#6ee7b7', text: '#059669' },
      low: { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' }
    };

    return React.createElement('div', {
      style: {
        background: 'var(--card, #fff)',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }
    },
      React.createElement('div', {
        style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' }
      }, '🔬 Научные рекомендации'),
      recs.slice(0, 5).map((rec, i) => {
        const colors = priorityColors[rec.priority] || priorityColors.low;
        const supp = SUPPLEMENTS_CATALOG[rec.id];

        return React.createElement('div', {
          key: i,
          style: {
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '10px 12px',
            marginBottom: '8px'
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px'
            }
          },
            React.createElement('span', { style: { fontSize: '18px' } }, supp?.icon || '💊'),
            React.createElement('span', {
              style: { fontWeight: '600', color: colors.text }
            }, supp?.name || rec.id),
            rec.priority === 'critical' && React.createElement('span', {
              style: {
                fontSize: '10px',
                background: colors.text,
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '6px',
                fontWeight: '600'
              }
            }, 'ВАЖНО')
          ),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', lineHeight: '1.4' }
          }, rec.reason)
        );
      })
    );
  }

  // === ЭКСПОРТ v3.5 ===
  HEYS.Supplements = {
    // Каталоги
    CATALOG: SUPPLEMENTS_CATALOG,
    CATEGORIES: SUPPLEMENT_CATEGORIES,
    TIMING,
    INTERACTIONS,
    TIME_GROUPS,
    COURSES,
    // Утилиты
    getByCategory: getSupplementsByCategory,
    getPlanned: getPlannedSupplements,
    savePlanned: savePlannedSupplements,
    getTaken: getTakenSupplements,
    markTaken: markSupplementTaken,
    markAllTaken: markAllSupplementsTaken,
    getComplianceStats: getComplianceStats,
    // v2.0 функции
    checkInteractions,
    getInsulinWaveBonus,
    getSupplementAdvices,
    getTimingHint,
    // v3.0 функции
    groupByTimeOfDay,
    // v3.1 функции — курсы и кастомные добавки
    getCustomSupplements,
    addCustomSupplement,
    removeCustomSupplement,
    loadCustomSupplements,
    getTimeReminder,
    applyCourse,
    // v3.2 функции — интеграция с едой и рекомендации
    getSmartRecommendations,
    getMealBasedAdvice,
    // v3.3 функции — научный UI
    renderSciencePopup,
    renderScientificRecommendations,
    // v3.5 функции — настройки, история, batch
    getSupplementSettings,
    getSupplementSetting,
    setSupplementSetting,
    getSupplementHistory,
    updateSupplementHistory,
    markSupplementsTaken,
    // Рендер
    renderCard: renderSupplementsCard,
  };

  // Загружаем кастомные добавки при инициализации
  loadCustomSupplements();

  // Триггерим перерендер DayTab после инициализации модуля
  // PERF v8.1: Используем lightweight событие вместо heys:day-updated
  // renderSupplementsCard читает из localStorage напрямую — setDay() не нужен
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('heys-deferred-module-loaded', {
        detail: { module: 'supplements' }
      }));
    }
  } catch (e) {
    // no-op
  }

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_app_initialize_v1.js ===== */
// heys_app_initialize_v1.js — initializeApp extracted from heys_app_entry_v1.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppInitializer = HEYS.AppInitializer || {};

    const getModule = HEYS._getModule || function (name, fallback) {
        return HEYS[name] || fallback || {};
    };

    HEYS.AppInitializer.initializeApp = function initializeApp() {
        // Логи инициализации отключены для чистой консоли
        const React = window.React,
            ReactDOM = window.ReactDOM;

        // Централизованная проверка day-модулей (без логов в консоль)
        if (HEYS.moduleLoader?.checkDayDeps) {
            HEYS.moduleLoader.checkDayDeps();
        }
        const { useState, useEffect, useRef, useCallback, useMemo } = React;
        HEYS.Gates?.initReactGates?.(React);
        const ErrorBoundary = window.HEYS.ErrorBoundary;
        const DesktopGateScreen = window.HEYS.DesktopGateScreen;
        const AppLoader = window.HEYS.AppLoader;
        const GamificationBar = window.HEYS.GamificationBar;
        const AppShellModule = getModule('AppShell');
        const AppOverlaysModule = getModule('AppOverlays');
        const AppShell = AppShellModule && AppShellModule.AppShell;
        const AppOverlays = AppOverlaysModule && AppOverlaysModule.AppOverlays;
        const AppGateFlow = getModule('AppGateFlow');
        const AppBackup = getModule('AppBackup');
        const AppShortcuts = getModule('AppShortcuts');
        const AppAuthInit = getModule('AppAuthInit');
        const AppClientHelpers = getModule('AppClientHelpers');
        const AppDesktopGate = getModule('AppDesktopGate');
        const AppMorningCheckin = getModule('AppMorningCheckin');
        const AppSwipeNav = getModule('AppSwipeNav');
        const AppRuntimeEffects = getModule('AppRuntimeEffects');
        const AppSyncEffects = getModule('AppSyncEffects');
        const AppTabState = getModule('AppTabState');
        const AppClientManagement = getModule('AppClientManagement');
        const AppBackupActions = getModule('AppBackupActions');
        const AppUpdateNotifications = getModule('AppUpdateNotifications');
        const AppUIState = getModule('AppUIState');
        const AppCloudInit = getModule('AppCloudInit');
        const AppClientStateManager = getModule('AppClientStateManager');
        const AppDateState = getModule('AppDateState');
        const AppDerivedState = getModule('AppDerivedState');
        const AppShellProps = getModule('AppShellProps');
        const AppOverlaysProps = getModule('AppOverlaysProps');
        const AppGateState = getModule('AppGateState');
        const AppGlobalBindings = getModule('AppGlobalBindings');
        const AppBackupState = getModule('AppBackupState');
        const AppBannerState = getModule('AppBannerState');
        const AppClientInit = getModule('AppClientInit');
        const AppTwemojiEffect = getModule('AppTwemojiEffect');
        const AppRuntimeState = getModule('AppRuntimeState');
        const AppCoreState = getModule('AppCoreState');
        const AppRoot = getModule('AppRoot');

        const AppHooks = getModule('AppHooks');
        const {
            useThemePreference,
            usePwaPrompts,
            useWakeLock,
            useCloudSyncStatus,
            useClientState,
            useCloudClients,
        } = AppHooks;

        // init cloud (safe if no cloud module)
        // 🇷🇺 Основной трафик идёт через Yandex Cloud API (api.heyslab.ru)
        // Legacy cloud модуль оставлен для обратной совместимости
        if (AppCloudInit.initCloud) {
            AppCloudInit.initCloud();
        } else if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
            // 🔥 Warm-up ping — прогреваем Yandex Cloud Functions
            fetch('https://api.heyslab.ru/health', { method: 'GET' })
                .catch(() => { }); // Warm-up ping

            // 🆕 v2025-12-22: На production используем ТОЛЬКО Yandex Cloud API
            // Supabase SDK инициализируется для совместимости cloud.signIn/signOut,
            // но основной трафик идёт через HEYS.YandexAPI
            const supabaseUrl = 'https://api.heyslab.ru';  // Yandex Cloud API для всех сред

            HEYS.cloud.init({
                url: supabaseUrl,
                anonKey:
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTE1NDUsImV4cCI6MjA3MDgyNzU0NX0.Nzd8--PyGMJvIHqFoCQKNUOwpxnrAZuslQHtAjcE1Ds',
                // localhost fallback больше не нужен — используем Yandex API везде
                localhostProxyUrl: undefined
            });
        }

        const AppTabs = getModule('AppTabs');
        const {
            DayTabWithCloudSync,
            RationTabWithCloudSync,
            UserTabWithCloudSync,
            AnalyticsTab,
        } = AppTabs;

        /* ═══════════════════════════════════════════════════════════════════════════════
         * 🚀 ГЛАВНЫЙ КОМПОНЕНТ: App (строки 482-1140)
         * ───────────────────────────────────────────────────────────────────────────────
         * Корневой компонент приложения с управлением состоянием
         *
         * STATE MANAGEMENT:
         *   - tab: текущая активная вкладка ('stats'|'diary'|'insights'|'widgets'|'ration'|'user'|'overview')
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
        // Hooks moved to apps/web/heys_app_hooks_v1.js (HEYS.AppHooks)

        function renderRoot(AppComponent) {
            const getRootElement = () => {
                const existingRoot = document.getElementById('root');
                if (existingRoot && existingRoot.nodeType === 1) {
                    return existingRoot;
                }
                if (!document.body) {
                    console.error('[HEYS.app] ❌ Root element is missing and document.body is not ready.');
                    return null;
                }
                const newRoot = document.createElement('div');
                newRoot.id = 'root';
                document.body.appendChild(newRoot);
                return newRoot;
            };

            const rootElement = getRootElement();
            if (!rootElement) {
                return;
            }

            // v10.1 FOUC fix: delay React mount until main.css loaded
            // HTML skeleton stays visible → clean transition to styled app
            const doRender = () => {
                // 🦴 Log skeleton replacement
                if (window.__heysSkelVisible) {
                    var skelDur = window.__heysSkelStart ? (Date.now() - window.__heysSkelStart) : 0;
                    window.__heysSkelReplacedAt = Date.now();
                    window.__heysSkelVisible = false;
                    window.__heysPerfMark && window.__heysPerfMark('Skeleton: replaced after ' + skelDur + 'ms visible');
                    console.info('[HEYS.skeleton] 🦴 Skeleton was visible for ' + (skelDur / 1000).toFixed(1) + 's → React takes over');
                }
                window.__heysPerfMark && window.__heysPerfMark('ReactDOM.createRoot: begin');
                const root = ReactDOM.createRoot(rootElement);
                root.render(React.createElement(ErrorBoundary, null, React.createElement(AppComponent)));
                window.__heysPerfMark && window.__heysPerfMark('root.render: called → __heysAppReady');

                // 🆕 Уведомляем SW об успешной загрузке (сбрасывает счётчик boot failures)
                if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'BOOT_SUCCESS' });
                    window.__heysLog && window.__heysLog('SW notified: BOOT_SUCCESS');
                }

                // Флаг для watchdog
                window.__heysAppReady = true;
            };

            // CSS gate: wait for main.css before destroying skeleton
            // v9.10: styleSheets fallback — detect CSS even if onload event was missed
            // Also detects Vite production build: main.css → /assets/index-HASH.css
            if (!window.__heysMainCSSLoaded) {
                try {
                    for (var si = 0; si < document.styleSheets.length; si++) {
                        var sheetHref = document.styleSheets[si].href;
                        if (sheetHref && (sheetHref.indexOf('main.css') !== -1 ||
                            (sheetHref.indexOf('/assets/') !== -1 && sheetHref.indexOf('.css') !== -1))) {
                            window.__heysMainCSSLoaded = true;
                            console.info('[HEYS.init] ✅ main.css detected via styleSheets:', sheetHref.split('/').pop());
                            break;
                        }
                    }
                } catch (e) { /* SecurityError on CORS sheets — skip */ }
                // Also check for Vite <link> element directly
                if (!window.__heysMainCSSLoaded && document.querySelector('link[rel="stylesheet"][href*="/assets/"]')) {
                    window.__heysMainCSSLoaded = true;
                    console.info('[HEYS.init] ✅ Vite CSS detected via link element');
                }
            }

            if (window.__heysMainCSSLoaded) {
                console.info('[HEYS.init] ✅ main.css already loaded — mounting React immediately');
                doRender();
            } else {
                console.info('[HEYS.init] ⏳ Waiting for main.css before React mount (skeleton stays visible)');
                var cssTimer = null;
                var onCSS = function () {
                    clearTimeout(cssTimer);
                    console.info('[HEYS.init] ✅ main.css loaded — mounting React');
                    doRender();
                };
                window.addEventListener('heysMainCSSLoaded', onCSS, { once: true });
                // v9.9: Reduced from 10s to 3s — index.html has polling fallback,
                // and CSS Gate #2 in DayTab was removed (no cumulative penalty)
                cssTimer = setTimeout(function () {
                    window.removeEventListener('heysMainCSSLoaded', onCSS);
                    console.warn('[HEYS.init] ⚠️ CSS timeout (3s) — mounting React without main.css');
                    doRender();
                }, 3000);
            }
        }

        const createApp = AppRoot.createApp
            || (({ React: HookReact }) => function AppFallback() {
                return HookReact.createElement('div', null);
            });
        const App = createApp({ React });
        renderRoot(App);
    };
})();


/* ===== heys_app_entry_v1.js ===== */
// heys_app_entry_v1.js — App entry orchestration extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppEntry = HEYS.AppEntry || {};

    HEYS.AppEntry.start = function start() {
        console.info('[HEYS] 🚀 Приложение запущено');

        // Feature flags (local defaults)
        HEYS.features = HEYS.features || {
            unifiedTables: true,
            extendedNutrients: true
        };

        // 🔍 PWA Boot logging
        const bootLog = (msg) => window.__heysLog && window.__heysLog('[APP] ' + msg);
        bootLog('heys_app_entry_v1.js started');

        // 🔍 EARLY DEBUG: Проверяем auth token ДО любого кода
        try {
            const _earlyToken = localStorage.getItem('heys_supabase_auth_token');
            bootLog('auth token: ' + (_earlyToken ? 'YES' : 'NO'));
        } catch (e) {
            bootLog('auth check error: ' + e.message);
        }

        // Onboarding tour helpers moved to heys_app_onboarding_v1.js
        // Update checks moved to heys_app_update_checks_v1.js
        // Full backup export moved to heys_app_backup_export_v1.js
        // Debug panel + badge API moved to heys_app_gates_v1.js

        const AppInitializer = HEYS.AppInitializer;
        const initializeApp = AppInitializer?.initializeApp || (() => {
            window.__heysLog && window.__heysLog('[APP] AppInitializer missing, init skipped');
        });

        // Start initialization
        const startDependencyLoader = HEYS.AppDependencyLoader?.start;
        if (startDependencyLoader) {
            startDependencyLoader({ initializeApp });
        } else {
            setTimeout(() => {
                const retryStart = HEYS.AppDependencyLoader?.start;
                if (retryStart) {
                    retryStart({ initializeApp });
                    return;
                }
                window.__heysLog && window.__heysLog('[DEPS] dependency loader missing, fallback start');
                initializeApp();
            }, 100);
        }
    };
})();


/* ===== heys_app_v12.js ===== */
// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

(function () {
  const HEYS = window.HEYS = window.HEYS || {};
  const startEntry = HEYS.AppEntry && HEYS.AppEntry.start;

  if (typeof startEntry === 'function') {
    startEntry();
    return;
  }

  // 🆕 AppEntry отсутствует — критическая ошибка загрузки
  window.__heysLog && window.__heysLog('[CRITICAL] AppEntry missing!');

  // Уведомляем SW о boot failure
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
  }

  // Показываем Recovery UI если React доступен
  const rootEl = document.getElementById('root');
  if (rootEl && window.React && window.ReactDOM) {
    const React = window.React;

    // Используем RecoveryScreen если доступен, иначе минимальный fallback
    const RecoveryScreen = HEYS.AppRootComponent?.RecoveryScreen;

    if (RecoveryScreen) {
      const root = window.ReactDOM.createRoot(rootEl);
      root.render(React.createElement(RecoveryScreen, { React, moduleName: 'AppEntry' }));
    } else {
      // Минимальный inline fallback
      rootEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;text-align:center;padding:20px;background:#f3f4f6">
          <div style="background:white;padding:32px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px">
            <div style="font-size:48px;margin-bottom:16px">⚠️</div>
            <h2 style="margin:0 0 8px;font-size:20px">Ошибка загрузки</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Модуль "AppEntry" недоступен</p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
              <button onclick="location.reload()" style="padding:12px 24px;border-radius:8px;border:none;background:#10b981;color:white;font-weight:500;cursor:pointer">🔄 Обновить</button>
              <button onclick="caches.keys().then(n=>Promise.all(n.map(k=>caches.delete(k)))).then(()=>navigator.serviceWorker?.getRegistrations()).then(r=>r&&Promise.all(r.map(x=>x.unregister()))).then(()=>location.reload())" style="padding:12px 24px;border-radius:8px;border:1px solid #d1d5db;background:white;color:#374151;font-weight:500;cursor:pointer">🗑️ Сбросить кэш</button>
            </div>
          </div>
        </div>
      `;
    }
  } else {
    // React недоступен — самый базовый fallback
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;text-align:center;padding:20px">
        <div>
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2>Ошибка загрузки</h2>
          <p style="color:#6b7280">Попробуйте обновить страницу</p>
          <button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;border-radius:8px;border:none;background:#10b981;color:white;cursor:pointer">🔄 Обновить</button>
        </div>
      </div>
    `;
  }
})();

