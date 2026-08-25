// heys_gamification_bar_v1.js — GamificationBar extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    /**
     * Безопасное получение streak с защитой от race condition.
     * @returns {number} Текущий streak или 0 если недоступен
     */
    function safeGetStreak() {
        try {
            // HEYS.Day.getStreak — замыкание DayTab (heys_day_effects.js), оно
            // удаляется при размонтировании вкладки. Раньше на этом всё и
            // ломалось: на виджетах, в отчётах и в профиле серия становилась
            // нулём, а вместе с ней молча падали XP-множитель, прогресс миссий
            // и запись рекорда bestStreak.
            const fromDayTab = typeof HEYS.Day?.getStreak === 'function' ? HEYS.Day.getStreak() : 0;
            if (fromDayTab > 0) return fromDayTab;
            return HEYS.dayCalendarMetrics?.getCurrentStreak?.() || 0;
        } catch {
            return 0;
        }
    }

    // Экспортируем helper глобально для повторного использования
    HEYS.utils = HEYS.utils || {};
    HEYS.utils.safeGetStreak = safeGetStreak;

    // safeGetStreakDetails — как safeGetStreak, но добавляет yesterdayForgiven:
    // серия рвётся не с первого промаха (решение владельца 2026-08-10), и это
    // обязано быть видно, иначе читается как сбой счётчика. Число серии для
    // экрана всё ещё берём из safeGetStreak (совпадает по расчёту, но у
    // HEYS.Day.getStreak свой приоритет живой вкладки) — здесь нужен только флаг.
    function safeGetStreakDetails() {
        try {
            return HEYS.dayCalendarMetrics?.getStreakDetails?.() || { count: 0, yesterdayForgiven: false };
        } catch {
            return { count: 0, yesterdayForgiven: false };
        }
    }
    HEYS.utils.safeGetStreakDetails = safeGetStreakDetails;

    function formatStreakDayLabel(count) {
        const n = Number(count) || 0;
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'день';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
        return 'дней';
    }

    function renderGameStreakFlameIcon() {
        const React = window.React;
        return React.createElement('svg', {
            className: 'game-streak-chip__icon',
            width: 14,
            height: 14,
            viewBox: '0 0 16 16',
            'aria-hidden': 'true'
        },
            React.createElement('path', {
                d: 'M8 14c2.5-1.8 4-3.8 4-6.2C12 4.8 10.2 3 8 1 5.8 3 4 4.8 4 7.8 4 10.2 5.5 12.2 8 14Z',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.4,
                strokeLinejoin: 'round'
            }),
            React.createElement('path', {
                d: 'M8 11.5c1-0.8 1.6-1.7 1.6-2.8 0-1.2-0.8-2-1.6-2.6-0.8 0.6-1.6 1.4-1.6 2.6 0 1.1 0.6 2 1.6 2.8Z',
                fill: 'currentColor',
                stroke: 'none',
                opacity: 0.72
            })
        );
    }

    /**
     * safe-area · правило продукта (home-widgets.v4.dc.html, строка «safe-area»;
     * gamification.v4.dc.html, строка «safe-area и кнопка назад» — то же правило
     * без местных отличий): лист достижений раньше не оставлял места под
     * системную полосу жестов внизу экрана — панель считала maxHeight от края
     * viewport, а не от врезки. Значение читаем один раз через DOM-пробник
     * (тот же приём, что у heys_supplements_v1.js), а не хардкодим — на устройствах
     * без выреза env() вернёт 0.
     */
    let _gameSafeAreaBottomPxCache = null;
    function readGameSafeAreaInsetBottomPx() {
        if (_gameSafeAreaBottomPxCache !== null) return _gameSafeAreaBottomPxCache;
        try {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom, 0px);pointer-events:none;visibility:hidden;';
            document.body.appendChild(el);
            const px = parseFloat(window.getComputedStyle(el).paddingBottom) || 0;
            el.remove();
            _gameSafeAreaBottomPxCache = Math.max(0, Math.round(px));
        } catch (_e) {
            _gameSafeAreaBottomPxCache = 0;
        }
        return _gameSafeAreaBottomPxCache;
    }

    function GamificationBar(props) {
        const leadingHeaderActions = props?.leadingHeaderActions || null;
        const React = window.React;
        const ReactDOM = window.ReactDOM;
        const { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } = React;
        const portalToBody = (node) => {
            if (ReactDOM && typeof ReactDOM.createPortal === 'function' && globalThis.document?.body) {
                return ReactDOM.createPortal(node, globalThis.document.body);
            }
            return node;
        };
        const AUDIT_LOG_PREFIX = '[HEYS.game.audit]';
        const GAME_SYNC_LOG_PREFIX = '[GAMESYNH]';
        const logAuditInfo = (...args) => console.info(AUDIT_LOG_PREFIX, ...args);
        const logAuditWarn = (...args) => console.warn(AUDIT_LOG_PREFIX, ...args);
        const logAuditError = (...args) => console.error(AUDIT_LOG_PREFIX, ...args);
        const logSyncInfo = (...args) => console.info(GAME_SYNC_LOG_PREFIX, ...args);

        const [stats, setStats] = useState(() => {
            return HEYS.game ? HEYS.game.getStats() : {
                totalXP: 0,
                level: 1,
                title: { icon: '🌱', title: 'Новичок', color: '#94a3b8' },
                progress: { current: 0, required: 100, percent: 0 },
                unlockedCount: 0,
                totalAchievements: 25
            };
        });
        const [streak, setStreak] = useState(() => safeGetStreak());

        // EWS слит со счётчиком лампочки советов (UI v4, 2026-08-10): app_shell
        // публикует ewsData через window.HEYS.ewsSummary + событие
        // heysEWSSummaryUpdated. Счётчик лампочки = советы + предупреждения,
        // цвет — ровно две степени: критично (highSeverityCount > 0) / нейтрально.
        const [ewsSummary, setEwsSummary] = useState(() => window.HEYS?.ewsSummary || null);
        useEffect(() => {
            const onUpdate = (e) => setEwsSummary(e.detail || null);
            window.addEventListener('heysEWSSummaryUpdated', onUpdate);
            return () => window.removeEventListener('heysEWSSummaryUpdated', onUpdate);
        }, []);
        const ewsCritical = (ewsSummary?.highSeverityCount || 0) > 0;
        // Сам счётчик (советы + EWS) считает и пишет в #nav-advice-badge
        // day/_advice.js (единственный владелец DOM этого span) — он же слушает
        // heysEWSSummaryUpdated и суммирует. Здесь только цвет кнопки.
        const prevStreakRef = useRef(streak);
        const [expanded, setExpanded] = useState(false);
        const [notification, setNotification] = useState(null);
        const [dailyBonusAvailable, setDailyBonusAvailable] = useState(() => {
            return HEYS.game ? HEYS.game.canClaimDailyBonus() : false;
        });
        const [dailyBonusLoading, setDailyBonusLoading] = useState(false);
        const [dailyMultiplier, setDailyMultiplier] = useState(() => {
            return HEYS.game ? HEYS.game.getDailyMultiplier() : { multiplier: 1, actions: 0, label: '' };
        });
        const [weeklyChallenge, setWeeklyChallenge] = useState(() => {
            return HEYS.game ? HEYS.game.getWeeklyChallenge() : { earned: 0, target: 500, percent: 0, completed: false };
        });
        const [xpHistory, setXpHistory] = useState(() => {
            return HEYS.game && HEYS.game.getXPHistory ? HEYS.game.getXPHistory() : [];
        });
        const [levelGuardActive, setLevelGuardActive] = useState(() => {
            if (typeof window !== 'undefined'
                && window.__HEYS_READONLY_MODE__
                && window.__HEYS_READONLY_MODE__.enabled) {
                return false;
            }
            return true;
        });
        const levelGuardTimerRef = useRef(null);
        const prevLevelRef = useRef(stats.level);

        // 🔍 DIAGLOG: логируем начальные значения — что было в localStorage при монтировании
        useEffect(() => {
            logSyncInfo('UI mount:initial-stats', {
                totalXP: stats.totalXP,
                level: stats.level,
                guard: levelGuardActive,
                gameReady: !!HEYS.game
            });
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        const [storyAchId, setStoryAchId] = useState(null);
        // Строка «когда играет» канваса gamification.v4: новый уровень открывает
        // экран «Уровни» и там играет тихая минута. Прежняя модалка «Новый
        // уровень!» со значком и кнопкой «Продолжить» снята — она и была тем
        // громким празднованием, которое строка «чего нет» запрещает.
        const [levelCeremony, setLevelCeremony] = useState(null);
        const [streakCelebration, setStreakCelebration] = useState(null);
        const streakMilestoneRef = useRef(0);
        const streakToastTimerRef = useRef(null);
        const gameBarSurfaceRef = useRef(null);
        const expandedPanelRef = useRef(null);
        const expandedRef = useRef(false);
        const pendingOutsideCloseRef = useRef(false);
        const [dailyMissions, setDailyMissions] = useState(() => {
            return HEYS.game?.getDailyMissions ? HEYS.game.getDailyMissions() : null;
        });
        const [isOnboardingTipOpen, setIsOnboardingTipOpen] = useState(false);
        const [auditOpen, setAuditOpen] = useState(false);
        const [auditEvents, setAuditEvents] = useState([]);
        const [auditLoading, setAuditLoading] = useState(false);
        const [auditError, setAuditError] = useState(null);
        const [expandedPanelLayout, setExpandedPanelLayout] = useState({
            top: 120,
            left: 12,
            width: 360,
            maxHeight: 520
        });

        const ONBOARDING_ACHIEVEMENTS = useMemo(() => [
            'first_checkin',
            'first_meal',
            'first_product',
            'first_steps',
            'first_advice',
            'first_supplements',
            'first_water',
            'first_training',
            'first_household'
        ], []);

        const isOnboardingComplete = useCallback(() => {
            if (!HEYS.game) return false;
            return ONBOARDING_ACHIEVEMENTS.every((achId) => HEYS.game.isAchievementUnlocked(achId));
        }, [ONBOARDING_ACHIEVEMENTS]);

        const onboardingDone = isOnboardingComplete();

        useEffect(() => {
            if (HEYS.game) HEYS.game.useReactXPFX = true;
            return () => {
                if (HEYS.game) HEYS.game.useReactXPFX = false;
            };
        }, []);

        // Проверяем daily bonus и streak при монтировании + слушаем инициализацию Day
        useEffect(() => {
            const updateStreak = () => {
                const newStreak = safeGetStreak();
                setStreak(prev => prev === newStreak ? prev : newStreak);
            };

            const handleStreakEvent = (e) => {
                if (e.detail && typeof e.detail.streak === 'number') {
                    setStreak(e.detail.streak);
                }
            };

            if (HEYS.game) {
                setDailyBonusAvailable(HEYS.game.canClaimDailyBonus());
                // 🚀 PERF v7.1: Defer audit RPC 8s — don't compete with initial sync
                setTimeout(() => {
                    if (HEYS.game?.refreshDailyBonusFromAudit) {
                        HEYS.game.refreshDailyBonusFromAudit()
                            .then(() => {
                                setDailyBonusAvailable(HEYS.game.canClaimDailyBonus());
                            })
                            .catch(() => { });
                    }
                }, 8000);
            }

            // Пробуем сразу
            updateStreak();

            // Слушаем событие обновления streak из DayTab
            window.addEventListener('heysDayStreakUpdated', handleStreakEvent);

            return () => {
                window.removeEventListener('heysDayStreakUpdated', handleStreakEvent);
            };
        }, []);

        // Слушаем обновления XP
        useEffect(() => {
            // === ONBOARDING TOUR TRIGGER ===
            // 🔐 v1.7: Тур ТОЛЬКО для PIN-авторизованных клиентов, НЕ для кураторов/гостей
            // Проверяем: если авторизован как клиент, новый (уровень 1, <50 XP) и тур не пройден
            const isClient = window.HEYS._tour?.isClientAuthorized?.();
            if (HEYS.OnboardingTour && HEYS.game && isClient) {
                const stats = HEYS.game.getStats();
                // 🆕 v1.14: Проверяем согласия перед запуском тура
                const consentsReady = HEYS._consentsChecked && HEYS._consentsValid;
                if (stats && stats.level === 1 && stats.totalXP < 50 && consentsReady) {
                    // Небольшая задержка чтобы всё прогрузилось
                    setTimeout(() => {
                        HEYS.OnboardingTour.start();
                    }, 2000);
                }
            }

            // 🔍 DIAGLOG: логируем момент регистрации слушателя
            logSyncInfo('UI heysGameUpdate:listener-registered', { at: new Date().toISOString() });

            const handleUpdate = (e) => {
                // 🔍 DIAGLOG + guard-release работают НЕЗАВИСИМО от HEYS.game
                // RC fix v6.4: если gameReady:false (HEYS.game=null) — всё равно снимаем guard
                // по событию cloud_load_complete, используя e.detail напрямую.
                const _evtReason = typeof e?.detail?.reason === 'string' ? e.detail.reason : '(no reason)';
                const _evtIsInitial = !!e?.detail?.isInitialLoad;
                const _evtXP = typeof e?.detail?.totalXP === 'number' ? e.detail.totalXP : (HEYS.game?.getStats?.()?.totalXP ?? 0);
                const _evtLevel = typeof e?.detail?.level === 'number' ? e.detail.level : (HEYS.game?.getStats?.()?.level ?? 1);
                logSyncInfo('UI heysGameUpdate:received', {
                    reason: _evtReason,
                    totalXP: _evtXP,
                    level: _evtLevel,
                    isInitialLoad: _evtIsInitial,
                    guardActive: levelGuardActive,
                    gameReady: !!HEYS.game
                });

                // 🛡️ Level Guard: снимаем ВСЕГДА при нужных reason — даже если HEYS.game ещё null
                const _hasXpGained = typeof e?.detail?.xpGained === 'number' && e.detail.xpGained > 0;
                if (_evtReason === 'xp_fast_sync' || _evtReason === 'xp_rebuild' ||
                    _evtReason === 'cloud_load_complete' || _evtReason === 'cloud_load_error' ||
                    (_hasXpGained && !_evtIsInitial)) {
                    logSyncInfo('UI guard:OFF', { reason: _evtReason, isInitialLoad: _evtIsInitial, hasXpGained: _hasXpGained });
                    // Отменяем fallback-таймер — guard снят event-driven, таймер больше не нужен
                    if (levelGuardTimerRef.current) {
                        clearTimeout(levelGuardTimerRef.current);
                        levelGuardTimerRef.current = null;
                    }
                    setLevelGuardActive(false);
                }

                if (HEYS.game) {
                    const newStats = HEYS.game.getStats();

                    // Строка «уменьшенное движение»: счётчик XP и полоса меняются
                    // мгновенно — отсчёт и свечение крупного начисления сняты.
                    const prevLevel = prevLevelRef.current;
                    const hasXpGained = typeof e?.detail?.xpGained === 'number' && e.detail.xpGained > 0;
                    const reason = typeof e?.detail?.reason === 'string' ? e.detail.reason : '';
                    const hasReason = reason.length > 0;
                    // 🔒 v4.0: isInitialLoad — полностью подавляем модалки при загрузке/синке/смене клиента
                    const isInitialLoad = !!e?.detail?.isInitialLoad;
                    // 🔒 v4.1: xp_fast_sync — reconciliation при несоответствии XP-кеша, всегда suppress
                    // 🔒 v4.2: cloud_load_complete/cloud_load_error/audit_reconciliation — sync operations, never user-initiated
                    const SYNC_REASONS = ['xp_fast_sync', 'cloud_load_complete', 'cloud_load_error', 'audit_reconciliation', 'client_changed', 'xp_rebuild'];
                    const isSyncUpdate = isInitialLoad || SYNC_REASONS.includes(reason) || (!hasXpGained && !hasReason);

                    if (newStats.level > prevLevel) {
                        if (isSyncUpdate) {
                            console.info('[🎮 GamificationBar] 🔒 Level up SUPPRESSED:', prevLevel, '→', newStats.level,
                                '| reason:', reason, '| isInitialLoad:', isInitialLoad, '| isSyncUpdate:', isSyncUpdate);
                        }
                        prevLevelRef.current = newStats.level;
                    }

                    // 🔒 Оптимизация: не обновляем stats если они идентичны (предотвращает мерцание)
                    setStats(prevStats => {
                        if (prevStats &&
                            prevStats.totalXP === newStats.totalXP &&
                            prevStats.level === newStats.level &&
                            prevStats.unlockedCount === newStats.unlockedCount &&
                            prevStats.progress?.percent === newStats.progress?.percent) {
                            return prevStats; // Без ре-рендера
                        }
                        return newStats;
                    });
                } else if (e?.detail?.totalXP != null && e?.detail?.level != null) {
                    // RC fix v6.4: HEYS.game ещё null (gameReady:false) — обновляем stats из e.detail
                    // чтобы показать правильные данные после снятия guard
                    const detailStats = {
                        totalXP: e.detail.totalXP,
                        level: e.detail.level,
                        title: e.detail.title || { icon: '🌱', title: 'Новичок', color: '#94a3b8' },
                        progress: e.detail.progress || { current: 0, required: 100, percent: 0 },
                        unlockedCount: e.detail.unlockedCount || 0,
                        totalAchievements: e.detail.totalAchievements || 25
                    };
                    // 🔒 v4.2: Sync prevLevelRef so the first event after HEYS.game becomes
                    // available doesn't trigger a false level-up modal
                    prevLevelRef.current = e.detail.level;
                    logSyncInfo('UI stats:from-detail-fallback', { totalXP: detailStats.totalXP, level: detailStats.level });
                    setStats(detailStats);
                }
                setDailyBonusAvailable(prev => {
                    const next = HEYS.game ? HEYS.game.canClaimDailyBonus() : false;
                    return prev === next ? prev : next;
                });
                // Обновляем streak (используем safeGetStreak для защиты от race condition)
                setStreak(prevStreak => {
                    const newStreak = safeGetStreak();
                    // Строка «уменьшенное движение»: число серии растёт мгновенно.
                    prevStreakRef.current = newStreak;
                    return prevStreak === newStreak ? prevStreak : newStreak;
                });

                if (HEYS.game?.getDailyMissions) {
                    setDailyMissions(HEYS.game.getDailyMissions());
                }
            };

            // Строка «когда играет» канваса gamification.v4: единственное
            // празднование уровня — тихая минута на карточке героя, поэтому лист
            // открывается на «Уровнях» и церемония играет там. Событие приходит
            // только с настоящего начисления XP (движок не шлёт его во время
            // загрузки и при пересборке XP), а `consumeLevelCeremony` отдаёт её
            // один раз и не отдаёт протухшую — строка «прерывание».
            const handleLevelCeremony = () => {
                const ceremony = HEYS.game?.consumeLevelCeremony?.();
                if (!ceremony) return;
                setLevelCeremony(ceremony);
                setExpanded(true);
            };

            const handleNotification = (e) => {
                // Строка «уменьшенное движение»: новое достижение появляется мгновенно —
                // пульсации, конфетти и церемония слияния онбординга сняты.
                setNotification(e.detail);
                setTimeout(() => setNotification(null), 3000);
            };

            const handleDailyMultiplierUpdate = (e) => {
                setDailyMultiplier(e.detail);
            };

            const handleWeeklyUpdate = () => {
                if (HEYS.game) {
                    // 🔒 Оптимизация: используем functional updates для предотвращения лишних ре-рендеров
                    const newChallenge = HEYS.game.getWeeklyChallenge();
                    setWeeklyChallenge(prev => {
                        if (prev && newChallenge &&
                            prev.type === newChallenge.type &&
                            prev.progress === newChallenge.progress) {
                            return prev;
                        }
                        return newChallenge;
                    });

                    const newMultiplier = HEYS.game.getDailyMultiplier();
                    setDailyMultiplier(prev => prev === newMultiplier ? prev : newMultiplier);

                    if (HEYS.game.getXPHistory) {
                        const newHistory = HEYS.game.getXPHistory();
                        setXpHistory(prev => {
                            // Сравниваем все дни — не только последний (иначе исторические дни не обновятся)
                            if (prev && newHistory &&
                                prev.length === newHistory.length &&
                                prev.every((d, i) => d.xp === newHistory[i].xp && d.date === newHistory[i].date)) {
                                return prev;
                            }
                            return newHistory;
                        });
                    }
                }
            };

            window.addEventListener('heysGameUpdate', handleUpdate);

            window.addEventListener('heysGameNotification', handleNotification);
            window.addEventListener('heysLevelCeremony', handleLevelCeremony);
            window.addEventListener('heysProductAdded', handleUpdate);
            window.addEventListener('heysWaterAdded', handleUpdate);
            window.addEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
            window.addEventListener('heysGameUpdate', handleWeeklyUpdate);

            return () => {
                window.removeEventListener('heysGameUpdate', handleUpdate);
                window.removeEventListener('heysGameNotification', handleNotification);
                window.removeEventListener('heysLevelCeremony', handleLevelCeremony);
                window.removeEventListener('heysProductAdded', handleUpdate);
                window.removeEventListener('heysWaterAdded', handleUpdate);
                window.removeEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
                window.removeEventListener('heysGameUpdate', handleWeeklyUpdate);
            };
        }, []);

        // 🔒 Guard для первого рендера: не показываем потенциально устаревший уровень,
        // пока не завершится первичная синхронизация.
        // RC-1 fix: убран 1200ms timer из handleSyncCompleted — он снимал guard РАНЬШЕ
        // чем loadFromCloud завершится (~1400-1640ms). Guard теперь снимается event-driven
        // через reason: 'cloud_load_complete' в handleUpdate. Оставлен только 15s safety fallback.
        useEffect(() => {
            const isReadonlyHost = !!(typeof window !== 'undefined'
                && window.__HEYS_READONLY_MODE__
                && window.__HEYS_READONLY_MODE__.enabled);
            const handleSyncCompleted = () => {
                logSyncInfo('UI event:heysSyncCompleted', { action: 'pipeline_started_data_driven_guard' });
                // НЕ устанавливаем таймер здесь — guard снимется через heysGameUpdate(cloud_load_complete)
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);

            if (!isReadonlyHost) {
                // FIX v7.1: Снижен fallback с 45s до 10s — event-driven guard release теперь работает для session path
                if (levelGuardTimerRef.current) clearTimeout(levelGuardTimerRef.current);
                levelGuardTimerRef.current = setTimeout(() => {
                    logSyncInfo('UI guard:OFF', { reason: 'fallback_timeout_10000ms' });
                    setLevelGuardActive(false);
                }, 10000);
            }

            return () => {
                window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
                if (levelGuardTimerRef.current) {
                    clearTimeout(levelGuardTimerRef.current);
                    levelGuardTimerRef.current = null;
                }
            };
        }, []);

        // 🔄 v3.1: Полный сброс UI при смене клиента куратором
        useEffect(() => {
            const handleClientChanged = () => {
                const isReadonlyHost = !!(typeof window !== 'undefined'
                    && window.__HEYS_READONLY_MODE__
                    && window.__HEYS_READONLY_MODE__.enabled);
                if (!isReadonlyHost) {
                    logSyncInfo('UI guard:ON', { reason: 'client_changed' });
                    setLevelGuardActive(true);
                }
                // RC-4 fix: перезапускаем fallback-таймер при смене клиента.
                // Guard включился, но pipeline стартует заново — нужен свежий safety timeout.
                if (!isReadonlyHost) {
                    if (levelGuardTimerRef.current) clearTimeout(levelGuardTimerRef.current);
                    levelGuardTimerRef.current = setTimeout(() => {
                        logSyncInfo('UI guard:OFF', { reason: 'client_changed_fallback_timeout_10000ms' });
                        setLevelGuardActive(false);
                    }, 10000);
                }
                // Немедленно обнуляем все данные до дефолтов, пока грузятся новые
                const freshStats = HEYS.game ? HEYS.game.getStats() : {
                    totalXP: 0, level: 1,
                    title: { icon: '🌱', title: 'Новичок', color: '#94a3b8' },
                    progress: { current: 0, required: 100, percent: 0 },
                    unlockedCount: 0, totalAchievements: 25
                };
                logSyncInfo('UI client_changed:freshStats', { totalXP: freshStats.totalXP, level: freshStats.level, gameReady: !!HEYS.game });
                setStats(freshStats);
                setStreak(safeGetStreak());
                setXpHistory(HEYS.game?.getXPHistory ? HEYS.game.getXPHistory() : []);
                setWeeklyChallenge(HEYS.game ? HEYS.game.getWeeklyChallenge() : { earned: 0, target: 500, percent: 0, completed: false });
                setDailyMultiplier(HEYS.game ? HEYS.game.getDailyMultiplier() : { multiplier: 1, actions: 0, label: '' });
                setDailyBonusAvailable(HEYS.game ? HEYS.game.canClaimDailyBonus() : false);
                // 🚀 PERF v7.0: Defer refreshDailyBonusFromAudit 6s — let sync finish first
                // (fetches 500 audit events via RPC, competing with bootstrapClientSync)
                if (HEYS.game?.refreshDailyBonusFromAudit) {
                    setTimeout(() => {
                        if (!HEYS.game?.refreshDailyBonusFromAudit) return;
                        HEYS.game.refreshDailyBonusFromAudit()
                            .then(() => {
                                setDailyBonusAvailable(HEYS.game.canClaimDailyBonus());
                            })
                            .catch(() => { });
                    }, 6000);
                }
                setDailyMissions(HEYS.game?.getDailyMissions ? HEYS.game.getDailyMissions() : null);
                prevLevelRef.current = freshStats.level;
                prevStreakRef.current = safeGetStreak();
            };

            window.addEventListener('heys:client-changed', handleClientChanged);
            return () => window.removeEventListener('heys:client-changed', handleClientChanged);
        }, []);

        useEffect(() => {
            const handleDailyMissionsUpdate = (e) => {
                setDailyMissions(e?.detail || (HEYS.game?.getDailyMissions ? HEYS.game.getDailyMissions() : null));
            };

            // Слушателя heysXpGained здесь больше нет: его обработчик рисовал
            // летящие XP, а празднования сняты строкой контракта gamification
            // «уменьшенное движение». Ссылки на удалённый обработчик роняли
            // монтирование шапки целиком.
            window.addEventListener('heysDailyMissionsUpdate', handleDailyMissionsUpdate);

            return () => {
                window.removeEventListener('heysDailyMissionsUpdate', handleDailyMissionsUpdate);
            };
        }, []);

        // Периодическое обновление streak (каждые 30 сек; не будим main thread во вкладке в фоне)
        useEffect(() => {
            const tick = () => {
                if (typeof document !== 'undefined' && document.hidden) return;
                const newStreak = safeGetStreak();
                setStreak(prev => (prev === newStreak ? prev : newStreak));
            };
            const interval = setInterval(tick, 30000);
            const onVis = () => {
                if (typeof document !== 'undefined' && !document.hidden) tick();
            };
            document.addEventListener('visibilitychange', onVis);
            return () => {
                clearInterval(interval);
                document.removeEventListener('visibilitychange', onVis);
            };
        }, []);

        // Не празднуем milestone повторно при каждом reload — только рост в сессии
        useEffect(() => {
            streakMilestoneRef.current = safeGetStreak();
        }, []);

        useEffect(() => {
            const milestones = [1, 2, 3, 5, 7];
            if (!milestones.includes(streak)) return;
            if (streak <= streakMilestoneRef.current) return;

            streakMilestoneRef.current = streak;
            setStreakCelebration(streak);
            if (streakToastTimerRef.current) clearTimeout(streakToastTimerRef.current);
            streakToastTimerRef.current = setTimeout(() => setStreakCelebration(null), 2200);

        }, [streak]);

        useEffect(() => {
            expandedRef.current = expanded;
            if (!expanded) {
                pendingOutsideCloseRef.current = false;
            }
        }, [expanded]);

        const updateExpandedPanelLayout = useCallback(() => {
            const hdrEl = document.querySelector('.hdr');
            const hdrRect = hdrEl?.getBoundingClientRect?.();
            const barRect = gameBarSurfaceRef.current?.getBoundingClientRect?.();
            const viewport = window.visualViewport;
            const viewportWidth = Math.max(320, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 390));
            const viewportHeight = Math.max(480, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 844));
            const viewportOffsetLeft = Math.round(viewport?.offsetLeft || 0);
            const viewportOffsetTop = Math.round(viewport?.offsetTop || 0);
            const sideGap = viewportWidth <= 480 ? 12 : 16;
            const width = Math.max(280, Math.min(560, viewportWidth - sideGap * 2));
            const left = viewportOffsetLeft + Math.max(sideGap, Math.round((viewportWidth - width) / 2));
            const anchorTop = Math.max(
                Math.round((hdrRect?.bottom || 0) + 8),
                Math.round((barRect?.bottom || 0) + 12),
                viewportOffsetTop + 72
            );
            // safe-area · правило продукта: панель прижимается к нижней врезке,
            // а не к краю стекла — без вычета выреза нижний край листа
            // достижений уходил под системную полосу жестов.
            const safeBottom = readGameSafeAreaInsetBottomPx();
            const maxHeight = Math.max(220, Math.round(viewportHeight - (anchorTop - viewportOffsetTop) - 24 - safeBottom));

            setExpandedPanelLayout((prev) => {
                if (
                    prev.top === anchorTop
                    && prev.left === left
                    && prev.width === width
                    && prev.maxHeight === maxHeight
                ) {
                    return prev;
                }

                return {
                    top: anchorTop,
                    left,
                    width,
                    maxHeight
                };
            });
        }, []);

        useLayoutEffect(() => {
            if (!expanded) return undefined;

            let rafId = 0;
            const scheduleUpdate = () => {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    updateExpandedPanelLayout();
                });
            };

            scheduleUpdate();

            const visualViewport = window.visualViewport;
            window.addEventListener('resize', scheduleUpdate);
            window.addEventListener('orientationchange', scheduleUpdate);
            visualViewport?.addEventListener('resize', scheduleUpdate);

            return () => {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', scheduleUpdate);
                window.removeEventListener('orientationchange', scheduleUpdate);
                visualViewport?.removeEventListener('resize', scheduleUpdate);
            };
        }, [expanded, updateExpandedPanelLayout]);

        useEffect(() => {
            if (!expanded) return undefined;

            const { body, documentElement } = document;
            const previousBodyOverflow = body.style.overflow;
            const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
            const previousDocumentOverflow = documentElement.style.overflow;
            const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

            body.style.overflow = 'hidden';
            body.style.overscrollBehavior = 'none';
            documentElement.style.overflow = 'hidden';
            documentElement.style.overscrollBehavior = 'none';

            const preventOutsidePanelScroll = (event) => {
                const panel = expandedPanelRef.current;
                if (!panel) return;
                if (panel.contains(event.target)) return;
                if (typeof event.preventDefault === 'function' && event.cancelable) {
                    event.preventDefault();
                }
            };

            document.addEventListener('wheel', preventOutsidePanelScroll, { passive: false, capture: true });
            document.addEventListener('touchmove', preventOutsidePanelScroll, { passive: false, capture: true });

            return () => {
                body.style.overflow = previousBodyOverflow;
                body.style.overscrollBehavior = previousBodyOverscrollBehavior;
                documentElement.style.overflow = previousDocumentOverflow;
                documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
                document.removeEventListener('wheel', preventOutsidePanelScroll, true);
                document.removeEventListener('touchmove', preventOutsidePanelScroll, true);
            };
        }, [expanded]);

        useEffect(() => {
            const isTargetInsideInteractiveGamification = (target) => {
                if (!target || !(target instanceof Element)) return false;
                if (expandedPanelRef.current?.contains(target)) return true;
                if (gameBarSurfaceRef.current?.contains(target)) return true;
                return false;
            };

            const suppressEvent = (event) => {
                if (typeof event.preventDefault === 'function') {
                    event.preventDefault();
                }
                if (typeof event.stopPropagation === 'function') {
                    event.stopPropagation();
                }
                if (typeof event.stopImmediatePropagation === 'function') {
                    event.stopImmediatePropagation();
                }
            };

            const handlePointerDownCapture = (event) => {
                if (!expandedRef.current) return;
                if (isTargetInsideInteractiveGamification(event.target)) {
                    pendingOutsideCloseRef.current = false;
                    return;
                }

                pendingOutsideCloseRef.current = true;
                suppressEvent(event);
            };

            const handlePointerUpCapture = (event) => {
                if (!pendingOutsideCloseRef.current) return;
                suppressEvent(event);
            };

            const handleEscape = (event) => {
                if (!expandedRef.current) return;
                if (event.key === 'Escape') {
                    pendingOutsideCloseRef.current = false;
                    setExpanded(false);
                }
            };

            const handleClickCapture = (event) => {
                if (!pendingOutsideCloseRef.current) return;
                pendingOutsideCloseRef.current = false;
                suppressEvent(event);
                setExpanded(false);
            };

            document.addEventListener('pointerdown', handlePointerDownCapture, true);
            document.addEventListener('pointerup', handlePointerUpCapture, true);
            document.addEventListener('click', handleClickCapture, true);
            document.addEventListener('keydown', handleEscape, true);

            return () => {
                pendingOutsideCloseRef.current = false;
                document.removeEventListener('pointerdown', handlePointerDownCapture, true);
                document.removeEventListener('pointerup', handlePointerUpCapture, true);
                document.removeEventListener('click', handleClickCapture, true);
                document.removeEventListener('keydown', handleEscape, true);
            };
        }, []);

        const loadAuditHistory = useCallback(async () => {
            if (!HEYS.game?.getAuditHistory) {
                logAuditWarn('load:skip', { reason: 'getAuditHistory_missing' });
                return;
            }
            const startedAt = Date.now();
            logAuditInfo('load:start', { limit: 50, offset: 0, expanded, auditOpen });
            setAuditLoading(true);
            setAuditError(null);

            const result = await HEYS.game.getAuditHistory({ limit: 50, offset: 0 });
            if (result?.error) {
                const message = result.error?.message || result.error || 'Не удалось загрузить историю';
                logAuditError('load:error', {
                    message,
                    code: result.error?.code,
                    tookMs: Date.now() - startedAt
                });
                setAuditError(message);
                setAuditEvents([]);
                setAuditLoading(false);
                return;
            }

            const items = Array.isArray(result?.items) ? result.items : [];
            logAuditInfo('load:success', {
                count: items.length,
                total: typeof result?.total === 'number' ? result.total : null,
                tookMs: Date.now() - startedAt
            });
            setAuditEvents(items);
            setAuditLoading(false);
        }, []);

        // 📋 Копирование всей истории в буфер обмена
        const copyFullAuditLog = useCallback(async () => {
            if (!HEYS.game?.getAuditHistory) {
                logAuditWarn('copy:skip', { reason: 'getAuditHistory_missing' });
                HEYS.Toast?.error?.('История недоступна');
                return;
            }

            logAuditInfo('copy:start');
            const startedAt = Date.now();
            const allEvents = [];
            const batchSize = 100;
            let offset = 0;
            let hasMore = true;

            // Показываем toast о процессе
            HEYS.Toast?.info?.('Загружаем полную историю...');

            try {
                // Загружаем все события пачками
                while (hasMore) {
                    const result = await HEYS.game.getAuditHistory({ limit: batchSize, offset });

                    if (result?.error) {
                        throw new Error(result.error?.message || result.error || 'Ошибка загрузки');
                    }

                    const items = Array.isArray(result?.items) ? result.items : [];
                    allEvents.push(...items);

                    logAuditInfo('copy:batch', { offset, loaded: items.length, total: allEvents.length });

                    // Если получили меньше чем batchSize, значит это последняя пачка
                    if (items.length < batchSize) {
                        hasMore = false;
                    } else {
                        offset += batchSize;
                    }

                    // Защита от бесконечного цикла
                    if (offset > 10000) {
                        logAuditWarn('copy:limit', { offset });
                        hasMore = false;
                    }
                }

                logAuditInfo('copy:loaded', { total: allEvents.length, tookMs: Date.now() - startedAt });

                // 🔍 Фильтруем xp_rebuild +0 (спам)
                const filteredEvents = allEvents.filter(e => {
                    if (e.action === 'xp_rebuild' && (e.xp_delta === 0 || !e.xp_delta)) return false;
                    return true;
                });
                const hiddenCount = allEvents.length - filteredEvents.length;

                // 🔍 Счётчик дублей достижений (для пометки в истории)
                const achievementCounts = {};
                filteredEvents.forEach((e) => {
                    if (e.action === 'achievement_unlocked' && e.reason) {
                        achievementCounts[e.reason] = (achievementCounts[e.reason] || 0) + 1;
                    }
                });

                // Форматируем события в текст
                const lines = [
                    '═══════════════════════════════════════════════',
                    '🎮 ИСТОРИЯ ОПЫТА HEYS',
                    `Всего событий: ${filteredEvents.length}${hiddenCount > 0 ? ` (скрыто ${hiddenCount} rebuild +0)` : ''}`,
                    `Дата выгрузки: ${new Date().toLocaleString('ru-RU')}`,
                    '═══════════════════════════════════════════════',
                    ''
                ];

                filteredEvents.forEach((event, idx) => {
                    const meta = event?.metadata || {};
                    const actionLabel = getAuditActionLabel(event.action, meta);
                    const reasonLabel = getAuditReasonLabel(event.reason);
                    const when = event.created_at
                        ? new Date(event.created_at).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })
                        : '';
                    const actorLabel = event.actor_type === 'curator'
                        ? 'Куратор'
                        : event.actor_type === 'pin'
                            ? 'PIN'
                            : 'Система';
                    const xpDelta = typeof event.xp_delta === 'number' ? event.xp_delta : null;
                    const levelBefore = event.level_before;
                    const levelAfter = event.level_after;

                    const isDupAchievement = event.action === 'achievement_unlocked' && event.reason && achievementCounts[event.reason] > 1;
                    const dupMark = isDupAchievement ? ' ⚠️ дубль' : '';

                    lines.push(`${idx + 1}. ${actionLabel}${dupMark}`);
                    if (xpDelta !== null) lines.push(`   XP: +${xpDelta}`);
                    if (levelBefore && levelAfter && levelAfter !== levelBefore) {
                        lines.push(`   Уровень: ${levelBefore} → ${levelAfter}`);
                    }
                    if (reasonLabel) lines.push(`   Причина: ${reasonLabel}`);
                    lines.push(`   Кем: ${actorLabel} | Когда: ${when}`);
                    lines.push('');
                });

                lines.push('═══════════════════════════════════════════════');
                lines.push(`Статистика по типам:`);

                // Подсчёт по типам событий
                const actionCounts = {};
                // FIX: Правильный подсчёт XP — только xp_gain + daily_bonus + уникальные achievement_unlocked
                // level_up дублирует xp_gain delta, xp_rebuild — это корректировки, не новый XP
                let totalXP = 0;
                const seenAchievements = new Set();
                filteredEvents.forEach(e => {
                    const label = getAuditActionLabel(e.action, e.metadata || {});
                    actionCounts[label] = (actionCounts[label] || 0) + 1;
                    const delta = typeof e.xp_delta === 'number' ? e.xp_delta : 0;
                    if ((e.action === 'xp_gain' || e.action === 'daily_bonus') && delta > 0) {
                        totalXP += delta;
                    } else if (e.action === 'achievement_unlocked' && e.reason && delta > 0) {
                        if (!seenAchievements.has(e.reason)) {
                            seenAchievements.add(e.reason);
                            totalXP += delta;
                        }
                    }
                });
                Object.entries(actionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([label, count]) => {
                        lines.push(`  - ${label}: ${count} раз(а)`);
                    });

                // 🔍 Показываем drift если есть
                const currentXP = HEYS.game?.getStats?.()?.totalXP || 0;
                const drift = currentXP - totalXP;
                const driftStr = drift !== 0 ? ` (δ ${drift > 0 ? '+' : ''}${drift})` : '';
                lines.push(`\nЧистый XP (audit): ${totalXP}`);
                lines.push(`UI XP: ${currentXP}${driftStr}`);
                lines.push('═══════════════════════════════════════════════');

                const text = lines.join('\n');

                // RC-7 fix: clipboard API требует фокус документа.
                // Добавлен fallback через execCommand для случая когда фокус потерян (развёрнутая панель).
                try {
                    await navigator.clipboard.writeText(text);
                } catch (_clipErr) {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }

                logAuditInfo('copy:success', {
                    events: allEvents.length,
                    chars: text.length,
                    tookMs: Date.now() - startedAt
                });

                HEYS.Toast?.success?.(`История скопирована (${allEvents.length} событий)`);
            } catch (err) {
                logAuditError('copy:error', { message: err.message });
                HEYS.Toast?.error?.('Не удалось скопировать: ' + err.message);
            }
        }, []);

        useEffect(() => {
            if (expanded && auditOpen) {
                logAuditInfo('auto-load', { expanded, auditOpen });
                loadAuditHistory();
                // 🔍 Auto-debug при открытии истории
                if (HEYS.game?.verifyXP) {
                    setTimeout(() => HEYS.game.verifyXP(), 500);
                }
            }
        }, [expanded, auditOpen, loadAuditHistory]);

        const toggleExpanded = () => {
            if (expanded) {
                setAuditOpen(false);
            }
            setExpanded(!expanded);
        };

        const renderExpandedSheet = () => {
            const Screens = HEYS.GamificationScreens;
            if (Screens && Screens.GamificationSheet) {
                return React.createElement(Screens.GamificationSheet, {
                    onClose: () => {
                        setLevelCeremony(null);
                        setExpanded(false);
                    },
                    initialTab: levelCeremony ? 'levels' : 'progress',
                    levelCeremony,
                    onLevelCeremonyEnd: () => setLevelCeremony(null)
                });
            }
            return React.createElement('div', { className: 'game-v4-sheet-fallback' },
                HEYS.game
                    ? 'Экраны геймификации загружаются…'
                    : 'Геймификация загружается…'
            );
        };

        const { title, progress } = stats;
        const isMaxLevel = progress.isMax === true; // потолок шкалы — следующей ступени нет
        const progressPercent = levelGuardActive ? 0 : Math.max(5, progress.percent); // Minimum 5% для визуального feedback
        const avgDailyXP = xpHistory?.length
            ? Math.round(xpHistory.reduce((sum, d) => sum + (d?.xp || 0), 0) / xpHistory.length)
            : 0;
        const xpToNext = Math.max(0, progress.required - progress.current);
        const daysToNext = !isMaxLevel && avgDailyXP > 0 ? Math.ceil(xpToNext / avgDailyXP) : null;
        const storyAchievement = storyAchId && HEYS.game?.ACHIEVEMENTS
            ? HEYS.game.ACHIEVEMENTS[storyAchId]
            : null;
        const storyUnlocked = storyAchId && HEYS.game?.isAchievementUnlocked
            ? HEYS.game.isAchievementUnlocked(storyAchId)
            : false;

        // Streak класс по уровню
        const getStreakClass = (s) => {
            if (s >= 7) return 'streak-legendary';   // 7+ дней — радужный
            if (s >= 5) return 'streak-epic';        // 5+ дней — золотой
            if (s >= 3) return 'streak-high';        // 3+ дней — яркий
            if (s >= 2) return 'streak-mid';         // 2 дня — мерцающий
            return 'streak-low';                     // 1 день — статичный
        };

        const getStreakFlameClass = (s) => {
            if (s >= 30) return 'flame-legendary';
            if (s >= 14) return 'flame-epic';
            if (s >= 7) return 'flame-hot';
            if (s >= 3) return 'flame-warm';
            return 'flame-mild';
        };

        const handleOnboardingMedalToggle = (e) => {
            e.stopPropagation();
            setIsOnboardingTipOpen((prev) => !prev);
        };

        // Ripple эффект на тапе по progress bar
        const handleProgressClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.left = `${e.clientX - rect.left}px`;
            ripple.style.top = `${e.clientY - rect.top}px`;
            e.currentTarget.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        };

        const getAuditActionLabel = (action, metadata) => {
            const map = {
                xp_gain: 'Начисление XP',
                level_up: 'Новый уровень',
                achievement_unlocked: 'Достижение',
                daily_bonus: 'Ежедневный бонус'
            };
            if (action === 'achievement_unlocked' && metadata?.achievementName) {
                return `Достижение: ${metadata.achievementName}`;
            }
            return map[action] || action || 'Событие';
        };

        const getAuditReasonLabel = (reason) => {
            if (!reason) return '';
            const actionLabel = HEYS.game?.XP_ACTIONS?.[reason]?.label;
            return actionLabel || reason;
        };

        // Динамический золотой градиент — чем ближе к 100%, тем ярче золото
        // v4-intentional: полоса уровня — единственный акцент в шапке (решение
        // владельца 2026-08-10). Раньше цвет считался здесь в JS как градиент
        // darkgoldenrod→gold и ставился инлайном, поэтому перебивал любой CSS и
        // оставался золотым во всех шести наборах. Теперь берёт акцент палитры;
        // ощущение заполнения даёт прозрачность, а не смена оттенка.
        const getProgressGradient = (percent) => {
            const t = Math.max(0, Math.min(100, percent)) / 100;
            const startAlpha = (0.55 + 0.25 * t).toFixed(3);
            return `linear-gradient(90deg,`
                + ` color-mix(in srgb, var(--v4-act, #2563eb) ${Math.round(startAlpha * 100)}%, transparent) 0%,`
                + ` var(--v4-act, #2563eb) 100%)`;
        };

        // Строка «уменьшенное движение»: празднований и вспышек в продукте нет
        // и без настройки — вспышка уровня, конфетти и летящие XP сняты.
        return React.createElement('div', {
            className: 'game-bar-container'
        },
            // Main bar — одна строка
            React.createElement('div', {
                ref: gameBarSurfaceRef,
                className: 'game-bar',
                onClick: toggleExpanded
            },
                // Level number — компактно, без эмодзи звания (v4 mockup)
                React.createElement('span', {
                    className: `game-level-number${levelGuardActive ? ' is-syncing' : ''}${streakCelebration ? ' is-streak-muted' : ''}`,
                }, levelGuardActive ? '· · ·' : String(stats.level)),

                // XP progress ↔ streak milestone (v4: chip в слоте полосы)
                React.createElement('div', {
                    className: `game-progress-slot${streakCelebration ? ' game-progress-slot--streak' : ''}`
                },
                    React.createElement('div', {
                        // Полоса заполняется мгновенно: блик, пульсация и свечение сняты.
                        className: `game-progress ${levelGuardActive ? 'syncing' : ''}`,
                        onClick: handleProgressClick
                    },
                        React.createElement('div', {
                            className: 'game-progress-fill',
                            style: {
                                width: `${progressPercent}%`,
                                background: levelGuardActive ? 'transparent' : getProgressGradient(progress.percent)
                            }
                        }),
                        React.createElement('div', {
                            className: 'game-progress-milestones'
                        },
                            React.createElement('span', {
                                className: 'game-progress-milestone',
                                'data-step': '25'
                            }),
                            React.createElement('span', {
                                className: 'game-progress-milestone',
                                'data-step': '50'
                            }),
                            React.createElement('span', {
                                className: 'game-progress-milestone',
                                'data-step': '75'
                            })
                        ),
                        // Tooltip — скрываем пока guard активен
                        !levelGuardActive && React.createElement('span', { className: 'game-progress-tooltip' },
                            isMaxLevel
                                ? `Максимальный уровень · всего ${stats.totalXP} XP`
                                : `Ещё ${progress.required - progress.current} XP до ур.${stats.level + 1}`
                        )
                    ),
                    streakCelebration != null && React.createElement('div', {
                        className: 'game-streak-chip',
                        role: 'status',
                        'aria-live': 'polite'
                    },
                        renderGameStreakFlameIcon(),
                        React.createElement('span', { className: 'game-streak-chip__text' },
                            `Серия · ${streakCelebration} ${formatStreakDayLabel(streakCelebration)}`
                        )
                    )
                ),

                // Rank title — видимый текст между полосой и иконками
                React.createElement('span', {
                    className: `game-rank-title${levelGuardActive ? ' is-syncing' : ''}${streakCelebration ? ' is-streak-muted' : ''}`,
                    title: title?.title || '',
                }, levelGuardActive ? '' : (title?.title || '')),

                // Правая часть: советы (+ EWS) + настройки (UI v4, 2026-08-10 —
                // push-колокольчик убран из шапки, EWS слит со счётчиком лампочки)
                React.createElement('div', {
                    className: `game-bar-slots game-bar-slots--compact${levelGuardActive ? ' is-loading' : ' is-loaded'}`
                },
                    React.createElement('div', { className: 'hdr-header-actions' },
                        leadingHeaderActions && React.createElement('div', {
                            className: 'hdr-header-actions__debug',
                            onClick: (e) => e.stopPropagation(),
                        }, leadingHeaderActions),
                        React.createElement('button', {
                            className: 'hdr-header-icon-btn hdr-header-icon-btn--advice' + (ewsCritical ? ' hdr-header-icon-btn--advice-critical' : ''),
                            onClick: (e) => {
                                e.stopPropagation();
                                setTimeout(() => {
                                    try {
                                        if (typeof window.__heysShowAdviceHandler === 'function') {
                                            window.__heysShowAdviceHandler();
                                        }
                                        window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                                    } catch (_) { /* noop */ }
                                }, 0);
                            },
                            title: 'Советы',
                            type: 'button',
                            'aria-label': 'Советы',
                        },
                            HEYS.AppNavIcons?.NavIcon
                                ? React.createElement(HEYS.AppNavIcons.NavIcon, { name: 'advice', size: 17 })
                                : React.createElement('span', { 'aria-hidden': 'true' }, '💡'),
                            // Строка «доступность»: бейдж — рисунок, а не узел для
                            // чтения; число входит в имя кнопки («Советы, 5»),
                            // которое ставит владелец счётчика — day/_advice.js.
                            React.createElement('span', {
                                className: 'tab-advice-badge hdr-advice-badge',
                                id: 'nav-advice-badge',
                                'aria-hidden': 'true',
                            })
                        ),

                        React.createElement('button', {
                            className: 'hdr-header-icon-btn hdr-header-icon-btn--settings',
                            onClick: (e) => {
                                e.stopPropagation();
                                setTimeout(() => {
                                    try {
                                        if (typeof window.__heysToggleTabSettingsHandler === 'function') {
                                            window.__heysToggleTabSettingsHandler();
                                        }
                                    } catch (_) { /* noop */ }
                                }, 0);
                            },
                            title: 'Настройки',
                            type: 'button',
                            'aria-label': 'Настройки',
                        },
                            HEYS.AppNavIcons?.NavIcon
                                ? React.createElement(HEYS.AppNavIcons.NavIcon, { name: 'sliders', size: 17 })
                                : React.createElement('span', { 'aria-hidden': 'true' }, '⚙️')
                        ),
                    ),
                ),
            ),

            // Notification (миссии, ежедневный бонус, недельный челлендж, streak_shield)
            notification && React.createElement('div', {
                className: `game-notification ${notification.type}`,
                onClick: () => setNotification(null),
                onTouchStart: (e) => { e.currentTarget._touchStartY = e.touches[0].clientY; },
                onTouchMove: (e) => {
                    const deltaY = e.currentTarget._touchStartY - e.touches[0].clientY;
                    if (deltaY > 50) { setNotification(null); } // swipe up to dismiss
                }
            },
                // Строка «когда играет»: тоста на новый уровень нет — уровень
                // отмечает только тихая минута на карточке героя.
                // Строка «уведомления и точки входа»: тоста на достижение тоже
                // нет — их тридцать шесть, и каждое сообщение обесценивало бы
                // остальные; достижение отмечается галочкой в списке.
                notification.type === 'daily_bonus'
                            ? React.createElement(React.Fragment, null,
                                React.createElement('span', { className: 'notif-icon' }, '🎁'),
                                React.createElement('div', { className: 'notif-content' },
                                    React.createElement('div', { className: 'notif-title' }, 'Ежедневный бонус!'),
                                    React.createElement('div', { className: 'notif-subtitle' },
                                        notification.data.multiplier > 1
                                            ? `+${notification.data.xp} XP (${notification.data.multiplier}x бонус!)`
                                            : `+${notification.data.xp} XP`
                                    )
                                )
                            )
                            : notification.type === 'weekly_complete'
                                ? React.createElement(React.Fragment, null,
                                    React.createElement('span', { className: 'notif-icon' }, '🎯'),
                                    React.createElement('div', { className: 'notif-content' },
                                        React.createElement('div', { className: 'notif-title' }, '🎉 Недельный челлендж!'),
                                        React.createElement('div', { className: 'notif-subtitle' }, `+${notification.data.reward || 100} XP бонус!`)
                                    )
                                )
                                : notification.type === 'streak_shield'
                                    ? React.createElement(React.Fragment, null,
                                        React.createElement('span', { className: 'notif-icon' }, '🛡️'),
                                        React.createElement('div', { className: 'notif-content' },
                                            React.createElement('div', { className: 'notif-title' }, 'Streak спасён!'),
                                            React.createElement('div', { className: 'notif-subtitle' }, notification.data.message || 'Щит защитил твою серию')
                                        )
                                    )
                                    : notification.type === 'mission_complete'
                                        ? React.createElement(React.Fragment, null,
                                            React.createElement('span', { className: 'notif-icon' }, '✅'),
                                            React.createElement('div', { className: 'notif-content' },
                                                React.createElement('div', { className: 'notif-title' }, 'Миссия выполнена!'),
                                                React.createElement('div', { className: 'notif-subtitle' }, `${notification.data.name} — +${notification.data.xp} XP`)
                                            )
                                        )
                                        : notification.type === 'all_missions_complete'
                                            ? React.createElement(React.Fragment, null,
                                                React.createElement('span', { className: 'notif-icon' }, '🎉'),
                                                React.createElement('div', { className: 'notif-content' },
                                                    React.createElement('div', { className: 'notif-title' }, 'Все миссии дня!'),
                                                    React.createElement('div', { className: 'notif-subtitle' }, `Бонус +${notification.data.bonus || 50} XP 🎊`)
                                                )
                                            )
                                            : null
            ),

            // Expanded panel (backdrop + content)
            expanded && portalToBody(React.createElement(React.Fragment, null,
                React.createElement('div', {
                    className: 'game-panel-backdrop',
                    onClick: () => setExpanded(false)
                }),
                React.createElement('div', {
                    ref: expandedPanelRef,
                    className: `game-panel-expanded${HEYS.GamificationScreens?.GamificationSheet ? ' game-panel-expanded--v4' : ''}`,
                    style: {
                        top: `${expandedPanelLayout.top}px`,
                        left: `${expandedPanelLayout.left}px`,
                        width: `${expandedPanelLayout.width}px`,
                        maxHeight: `${expandedPanelLayout.maxHeight}px`
                    }
                },
                    renderExpandedSheet()
                )
            )),

            storyAchievement && portalToBody(
                React.createElement('div', {
                    className: 'achievement-story-modal',
                    onClick: () => setStoryAchId(null)
                },
                    React.createElement('div', {
                        className: `achievement-story-card ${storyUnlocked ? 'unlocked' : 'locked'} rarity-${storyAchievement.rarity}`,
                        onClick: (e) => e.stopPropagation()
                    },
                        React.createElement('div', { className: 'achievement-story-close', onClick: () => setStoryAchId(null) }, '✕'),
                        React.createElement('div', { className: 'achievement-story-rarity' }, storyAchievement.rarity),
                        React.createElement('div', { className: 'achievement-story-icon' }, storyUnlocked ? storyAchievement.icon : '🔒'),
                        React.createElement('div', { className: 'achievement-story-name' }, storyAchievement.name),
                        React.createElement('div', {
                            className: `achievement-story-label ${storyUnlocked ? 'unlocked' : 'locked'}`
                        }, storyUnlocked ? 'Инсайт' : 'Как получить'),
                        React.createElement('div', {
                            className: 'achievement-story-text'
                        }, storyUnlocked ? (storyAchievement.story || storyAchievement.desc) : storyAchievement.desc),
                        React.createElement('div', { className: 'achievement-story-xp' }, `+${storyAchievement.xp} XP`),
                        React.createElement('button', {
                            className: 'achievement-story-btn',
                            onClick: () => setStoryAchId(null)
                        }, 'Понятно')
                    )
                )
            )

            // Строка «уменьшенное движение»: церемонии недельного челленджа и
            // слияния онбординга сняты — о выполнении сообщает обычное уведомление.
            // Строка «чего нет»: модалка нового уровня со значком, вспышкой и
            // кнопкой «Продолжить» снята — уровень отмечает тихая минута на
            // карточке героя в листе «Уровни».
        );
    }

    // PERF (2026-05-27): React.memo wrap. leadingHeaderActions приходит из AppShell
    // leadingHeaderActions — облачко синка слева от «Советы» (UI v4).
    HEYS.GamificationBar = React.memo(GamificationBar);
})();
