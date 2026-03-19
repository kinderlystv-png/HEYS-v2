// heys_gamification_bar_v1.js — GamificationBar extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    /**
     * Безопасное получение streak с защитой от race condition.
     * @returns {number} Текущий streak или 0 если недоступен
     */
    function safeGetStreak() {
        try {
            return typeof HEYS.Day?.getStreak === 'function' ? HEYS.Day.getStreak() : 0;
        } catch {
            return 0;
        }
    }

    // Экспортируем helper глобально для повторного использования
    HEYS.utils = HEYS.utils || {};
    HEYS.utils.safeGetStreak = safeGetStreak;

    function GamificationBar() {
        const React = window.React;
        const { useState, useEffect, useRef, useCallback, useMemo } = React;
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
        const [streakJustGrew, setStreakJustGrew] = useState(false);
        const prevStreakRef = useRef(streak);
        const [expanded, setExpanded] = useState(false);
        const [notification, setNotification] = useState(null);
        const [isXPCounting, setIsXPCounting] = useState(false);
        const [isLevelUpFlash, setIsLevelUpFlash] = useState(false);
        const [dailyBonusAvailable, setDailyBonusAvailable] = useState(() => {
            return HEYS.game ? HEYS.game.canClaimDailyBonus() : false;
        });
        const [dailyBonusLoading, setDailyBonusLoading] = useState(false);
        const [justUnlockedAch, setJustUnlockedAch] = useState(null);
        const [dailyMultiplier, setDailyMultiplier] = useState(() => {
            return HEYS.game ? HEYS.game.getDailyMultiplier() : { multiplier: 1, actions: 0, label: '' };
        });
        const [weeklyChallenge, setWeeklyChallenge] = useState(() => {
            return HEYS.game ? HEYS.game.getWeeklyChallenge() : { earned: 0, target: 500, percent: 0, completed: false };
        });
        const [xpHistory, setXpHistory] = useState(() => {
            return HEYS.game && HEYS.game.getXPHistory ? HEYS.game.getXPHistory() : [];
        });
        const [levelGuardActive, setLevelGuardActive] = useState(true);
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
        const [levelUpModal, setLevelUpModal] = useState(null);
        const levelUpTimerRef = useRef(null);
        const [xpBursts, setXpBursts] = useState([]);
        const xpBurstIdRef = useRef(0);
        const [notifPulse, setNotifPulse] = useState(false);
        const [confettiBurst, setConfettiBurst] = useState(null);
        const [weeklyCeremony, setWeeklyCeremony] = useState(null);
        const [progressMilestone, setProgressMilestone] = useState(null);
        const progressMilestoneTimerRef = useRef(null);
        const [bigXpGlow, setBigXpGlow] = useState(false);
        const [personalBestPulse, setPersonalBestPulse] = useState(false);
        const [xpHistoryAnimate, setXpHistoryAnimate] = useState(false);
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

        // === Onboarding Fusion Ceremony ===
        const [fusionPhase, setFusionPhase] = useState(null); // null | 'gather' | 'merge' | 'medal' | 'fly' | 'done'
        const fusionMedalRef = useRef(null);
        const targetMedalRef = useRef(null);
        const fusionTimerRef = useRef(null);

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

        // Track previous onboarding state to detect the moment it completes
        const prevOnboardingDoneRef = useRef(false);
        const fusionShownRef = useRef(false);

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

                    // XP counting animation
                    if (e.detail && e.detail.xpGained > 0) {
                        setIsXPCounting(true);
                        setTimeout(() => setIsXPCounting(false), 400);
                        if (e.detail.xpGained >= 50) {
                            setBigXpGlow(true);
                            setTimeout(() => setBigXpGlow(false), 900);
                        }
                    }

                    // Level up flash
                    const prevLevel = prevLevelRef.current;
                    const hasXpGained = typeof e?.detail?.xpGained === 'number' && e.detail.xpGained > 0;
                    const reason = typeof e?.detail?.reason === 'string' ? e.detail.reason : '';
                    const hasReason = reason.length > 0;
                    // 🔒 v4.0: isInitialLoad — полностью подавляем модалки при загрузке/синке/смене клиента
                    const isInitialLoad = !!e?.detail?.isInitialLoad;
                    // 🔒 v4.1: xp_fast_sync — reconciliation при несоответствии XP-кеша, всегда suppress
                    const isSyncUpdate = isInitialLoad || reason === 'xp_fast_sync' || (!hasXpGained && (!hasReason || reason === 'client_changed' || reason === 'xp_rebuild'));

                    if (newStats.level > prevLevel) {
                        if (!isSyncUpdate) {
                            console.info('[🎮 GamificationBar] 🎉 LEVEL UP modal! level:', prevLevel, '→', newStats.level,
                                '| xpGained:', e?.detail?.xpGained, '| reason:', reason, '| isInitialLoad:', isInitialLoad,
                                '| isSyncUpdate:', isSyncUpdate);
                            setIsLevelUpFlash(true);
                            setTimeout(() => setIsLevelUpFlash(false), 1000);

                            setLevelUpModal({
                                level: newStats.level,
                                title: newStats.title?.title || 'Новый уровень',
                                icon: newStats.title?.icon || '🎉',
                                color: newStats.title?.color || '#22c55e'
                            });

                            if (levelUpTimerRef.current) clearTimeout(levelUpTimerRef.current);
                            levelUpTimerRef.current = setTimeout(() => {
                                setLevelUpModal(null);
                            }, 2600);
                        } else {
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
                    // Pulse анимация при росте streak
                    if (newStreak > prevStreakRef.current) {
                        setStreakJustGrew(true);
                        setTimeout(() => setStreakJustGrew(false), 700);
                    }
                    prevStreakRef.current = newStreak;
                    return prevStreak === newStreak ? prevStreak : newStreak;
                });

                if (HEYS.game?.getDailyMissions) {
                    setDailyMissions(HEYS.game.getDailyMissions());
                }
            };

            const handleNotification = (e) => {
                setNotification(e.detail);
                setNotifPulse(true);
                setTimeout(() => setNotifPulse(false), 1200);
                setTimeout(() => setNotification(null), e.detail.type === 'level_up' ? 4000 : 3000);

                // Achievement unlock animation
                if (e.detail.type === 'achievement') {
                    setJustUnlockedAch(e.detail.data.achievement.id);
                    setTimeout(() => setJustUnlockedAch(null), 1000);

                    const rarity = e.detail.data.achievement?.rarity;
                    if (['rare', 'epic', 'legendary', 'mythic'].includes(rarity)) {
                        setConfettiBurst({ rarity });
                        setTimeout(() => setConfettiBurst(null), 1800);
                    }

                    // === Detect onboarding completion → trigger fusion ceremony ===
                    const achId = e.detail.data.achievement?.id;
                    if (achId && ONBOARDING_ACHIEVEMENTS.includes(achId) && !fusionShownRef.current) {
                        // Check if this was the LAST onboarding achievement
                        setTimeout(() => {
                            if (isOnboardingComplete() && !prevOnboardingDoneRef.current && !fusionShownRef.current) {
                                fusionShownRef.current = true;
                                prevOnboardingDoneRef.current = true;
                                startFusionCeremony();
                            }
                        }, 1200); // Wait for single-achievement notification to finish
                    }
                }
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
            window.addEventListener('heysProductAdded', handleUpdate);
            window.addEventListener('heysWaterAdded', handleUpdate);
            window.addEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
            window.addEventListener('heysGameUpdate', handleWeeklyUpdate);

            return () => {
                window.removeEventListener('heysGameUpdate', handleUpdate);
                window.removeEventListener('heysGameNotification', handleNotification);
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
            const handleSyncCompleted = () => {
                logSyncInfo('UI event:heysSyncCompleted', { action: 'pipeline_started_data_driven_guard' });
                // НЕ устанавливаем таймер здесь — guard снимется через heysGameUpdate(cloud_load_complete)
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);

            // RC-4 fix: Fallback поднят с 8s до 15s — на случай сетевых задержек или зависшего pipeline.
            if (levelGuardTimerRef.current) clearTimeout(levelGuardTimerRef.current);
            levelGuardTimerRef.current = setTimeout(() => {
                logSyncInfo('UI guard:OFF', { reason: 'fallback_timeout_45000ms' });
                setLevelGuardActive(false);
            }, 45000);

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
                logSyncInfo('UI guard:ON', { reason: 'client_changed' });
                setLevelGuardActive(true);
                // RC-4 fix: перезапускаем fallback-таймер при смене клиента.
                // Guard включился, но pipeline стартует заново — нужен свежий safety timeout.
                if (levelGuardTimerRef.current) clearTimeout(levelGuardTimerRef.current);
                levelGuardTimerRef.current = setTimeout(() => {
                    logSyncInfo('UI guard:OFF', { reason: 'client_changed_fallback_timeout_45000ms' });
                    setLevelGuardActive(false);
                }, 45000);
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
            const handleWeeklyComplete = (e) => {
                const detail = e?.detail || {};
                if (!detail.challenge) return;
                setWeeklyCeremony({
                    title: detail.challenge.title || detail.challenge.name || 'Недельный челлендж',
                    reward: detail.reward || detail.challenge.reward || 100,
                    icon: detail.challenge.icon || '🏆'
                });
            };

            const handleMilestone = (e) => {
                const milestone = e?.detail?.milestone;
                if (!milestone) return;
                setProgressMilestone(milestone);
                if (progressMilestoneTimerRef.current) clearTimeout(progressMilestoneTimerRef.current);
                progressMilestoneTimerRef.current = setTimeout(() => setProgressMilestone(null), 900);
            };

            window.addEventListener('heysWeeklyChallengeComplete', handleWeeklyComplete);
            window.addEventListener('heysProgressMilestone', handleMilestone);

            return () => {
                window.removeEventListener('heysWeeklyChallengeComplete', handleWeeklyComplete);
                window.removeEventListener('heysProgressMilestone', handleMilestone);
            };
        }, []);

        useEffect(() => {
            const handleXpGained = (e) => {
                const detail = e?.detail || {};
                if (!detail.xp) return;

                const id = xpBurstIdRef.current++;
                setXpBursts(prev => ([
                    ...prev,
                    { id, xp: detail.xp, x: detail.x, y: detail.y }
                ]));

                setTimeout(() => {
                    setXpBursts(prev => prev.filter(item => item.id !== id));
                }, 900);
            };

            const handleDailyMissionsUpdate = (e) => {
                setDailyMissions(e?.detail || (HEYS.game?.getDailyMissions ? HEYS.game.getDailyMissions() : null));
            };

            window.addEventListener('heysXpGained', handleXpGained);
            window.addEventListener('heysDailyMissionsUpdate', handleDailyMissionsUpdate);

            return () => {
                window.removeEventListener('heysXpGained', handleXpGained);
                window.removeEventListener('heysDailyMissionsUpdate', handleDailyMissionsUpdate);
            };
        }, []);

        // Периодическое обновление streak (каждые 30 сек)
        useEffect(() => {
            const interval = setInterval(() => {
                const newStreak = safeGetStreak();
                setStreak(prev => prev === newStreak ? prev : newStreak);
            }, 30000);
            return () => clearInterval(interval);
        }, []);

        useEffect(() => {
            const milestones = [1, 2, 3, 5, 7];
            if (!milestones.includes(streak)) return;
            if (streak <= streakMilestoneRef.current) return;

            streakMilestoneRef.current = streak;
            setStreakCelebration(streak);
            if (streakToastTimerRef.current) clearTimeout(streakToastTimerRef.current);
            streakToastTimerRef.current = setTimeout(() => setStreakCelebration(null), 2200);

            if (HEYS.game?.isNewStreakRecord?.()) {
                setPersonalBestPulse(true);
                setTimeout(() => setPersonalBestPulse(false), 1000);
            }
        }, [streak]);

        useEffect(() => {
            if (!expanded) return;
            setXpHistoryAnimate(true);
            const timer = setTimeout(() => setXpHistoryAnimate(false), 900);
            return () => clearTimeout(timer);
        }, [expanded]);

        useEffect(() => {
            expandedRef.current = expanded;
            if (!expanded) {
                pendingOutsideCloseRef.current = false;
            }
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

        const { title, progress } = stats;
        const progressPercent = levelGuardActive ? 0 : Math.max(5, progress.percent); // Minimum 5% для визуального feedback
        const avgDailyXP = xpHistory?.length
            ? Math.round(xpHistory.reduce((sum, d) => sum + (d?.xp || 0), 0) / xpHistory.length)
            : 0;
        const xpToNext = Math.max(0, progress.required - progress.current);
        const daysToNext = avgDailyXP > 0 ? Math.ceil(xpToNext / avgDailyXP) : null;
        const storyAchievement = storyAchId && HEYS.game?.ACHIEVEMENTS
            ? HEYS.game.ACHIEVEMENTS[storyAchId]
            : null;
        const storyUnlocked = storyAchId && HEYS.game?.isAchievementUnlocked
            ? HEYS.game.isAchievementUnlocked(storyAchId)
            : false;

        // Эффекты по уровню прогресса
        const isShimmering = progress.percent >= 80; // Блик при >80%
        const isPulsing = progress.percent >= 90;    // Пульсация при >90%
        const isGlowing = progress.percent >= 90;

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

        // === Onboarding Fusion Ceremony ===
        const ONBOARDING_ICONS = ['☀️', '🍽️', '🥗', '👟', '💡', '💊', '💧', '🏃', '🏠'];

        const startFusionCeremony = useCallback(() => {
            console.info('[🎮 GamificationBar] 🏅 Starting onboarding fusion ceremony!');
            setFusionPhase('gather');

            // Timeline: gather (icons appear) → merge (icons fly to center) → medal (medal appears) → subtitle/btn
            if (fusionTimerRef.current) clearTimeout(fusionTimerRef.current);

            // After icons have appeared (~1.5s) → start merge
            fusionTimerRef.current = setTimeout(() => setFusionPhase('merge'), 2000);
        }, []);

        // Phase transitions via useEffect
        useEffect(() => {
            if (!fusionPhase) return;
            let t;
            if (fusionPhase === 'merge') {
                // After merge animation (~0.8s) → show medal
                t = setTimeout(() => setFusionPhase('medal'), 800);
            } else if (fusionPhase === 'medal') {
                // Medal visible for 1.5s, then show button/text
                t = setTimeout(() => setFusionPhase('ready'), 600);
            }
            return () => { if (t) clearTimeout(t); };
        }, [fusionPhase]);

        // Init prevOnboardingDoneRef on mount (to avoid triggering on already-complete)
        useEffect(() => {
            if (isOnboardingComplete()) {
                prevOnboardingDoneRef.current = true;
                fusionShownRef.current = true;
            }
        }, []); // eslint-disable-line react-hooks/exhaustive-deps

        const handleFusionDismiss = useCallback(() => {
            // Expand gamification panel so the medal target is visible
            setExpanded(true);

            // Small delay to let DOM render the medal target
            setTimeout(() => {
                const targetEl = targetMedalRef.current || document.querySelector('.onboarding-medal');
                const medalEl = fusionMedalRef.current;

                const startFly = () => {
                    if (targetEl && medalEl) {
                        const targetRect = targetEl.getBoundingClientRect();
                        const medalRect = medalEl.getBoundingClientRect();

                        // Set initial position as fixed
                        setFusionPhase('fly');
                        medalEl.style.position = 'fixed';
                        medalEl.style.left = `${medalRect.left}px`;
                        medalEl.style.top = `${medalRect.top}px`;
                        medalEl.style.width = `${medalRect.width}px`;
                        medalEl.style.height = `${medalRect.height}px`;
                        medalEl.style.transform = 'none';
                        medalEl.style.transition = 'all 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
                        medalEl.style.zIndex = '10080';

                        // Force reflow
                        medalEl.offsetHeight; // eslint-disable-line no-unused-expressions

                        // Fly to target
                        requestAnimationFrame(() => {
                            medalEl.style.left = `${targetRect.left}px`;
                            medalEl.style.top = `${targetRect.top}px`;
                            medalEl.style.width = `${targetRect.width}px`;
                            medalEl.style.height = `${targetRect.height}px`;
                            medalEl.style.fontSize = '26px';
                            medalEl.style.borderRadius = '14px';
                            medalEl.style.opacity = '0.8';
                        });

                        setTimeout(() => {
                            setFusionPhase(null);
                            // Add landing glow to the real medal
                            if (targetEl) {
                                targetEl.classList.add('fusion-landing');
                                setTimeout(() => targetEl.classList.remove('fusion-landing'), 800);
                            }
                        }, 750);
                    } else {
                        // No target element visible — just close
                        setFusionPhase(null);
                    }

                    // Haptic feedback
                    if (HEYS.haptic) HEYS.haptic('success');
                };

                if (targetEl && typeof window !== 'undefined') {
                    const targetRect = targetEl.getBoundingClientRect();
                    const currentY = window.scrollY || window.pageYOffset || 0;
                    const targetY = Math.max(
                        0,
                        targetRect.top + currentY - (window.innerHeight / 2) + (targetRect.height / 2)
                    );
                    const distance = Math.abs(targetY - currentY);
                    const scrollDelay = Math.min(900, Math.max(300, Math.round(distance * 0.6)));

                    if (distance > 6) {
                        window.scrollTo({ top: targetY, behavior: 'smooth' });
                        setTimeout(startFly, scrollDelay);
                        return;
                    }
                }

                startFly();
            }, 100);
        }, []);

        // Generate confetti particles data
        const fusionConfetti = useMemo(() => {
            return Array.from({ length: 20 }, (_, i) => {
                const angle = (Math.PI * 2 * i) / 20 + Math.random() * 0.3;
                const distance = 80 + Math.random() * 60;
                const colors = ['#fbbf24', '#f59e0b', '#eab308', '#fcd34d', '#fef3c7', '#f97316', '#ef4444', '#22c55e', '#3b82f6'];
                return {
                    cx: `${Math.cos(angle) * distance}px`,
                    cy: `${Math.sin(angle) * distance}px`,
                    color: colors[i % colors.length],
                    delay: `${Math.random() * 0.3}s`,
                    size: 5 + Math.random() * 5
                };
            });
        }, []);

        // Calculate icon positions in a circle
        const fusionIconPositions = useMemo(() => {
            return ONBOARDING_ICONS.map((_, i) => {
                const angle = ((Math.PI * 2) / 9) * i - Math.PI / 2; // Start from top
                const radius = 90;
                return {
                    left: `${50 + (Math.cos(angle) * radius / 120) * 50}%`,
                    top: `${50 + (Math.sin(angle) * radius / 120) * 50}%`
                };
            });
        }, [ONBOARDING_ICONS]);

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
        const getProgressGradient = (percent) => {
            // От приглушённого (#b8860b / darkgoldenrod) до яркого (#ffd700 / gold)
            const t = percent / 100; // 0..1
            // Интерполяция RGB: darkgoldenrod(184,134,11) → gold(255,215,0)
            const r = Math.round(184 + (255 - 184) * t);
            const g = Math.round(134 + (215 - 134) * t);
            const b = Math.round(11 + (0 - 11) * t);
            const brightColor = `rgb(${r}, ${g}, ${b})`;
            // Начальный цвет ещё темнее
            const startR = Math.round(140 + (184 - 140) * t);
            const startG = Math.round(100 + (134 - 100) * t);
            const startB = Math.round(20 + (11 - 20) * t);
            const startColor = `rgb(${startR}, ${startG}, ${startB})`;
            return `linear-gradient(90deg, ${startColor} 0%, ${brightColor} 100%)`;
        };

        return React.createElement('div', {
            className: `game-bar-container ${isLevelUpFlash ? 'level-up-flash' : ''}`
        },
            confettiBurst && React.createElement('div', {
                className: `game-confetti game-confetti--${confettiBurst.rarity}`
            },
                Array.from({ length: 24 }).map((_, i) =>
                    React.createElement('span', { key: i, className: 'game-confetti__piece' })
                )
            ),
            xpBursts.length > 0 && React.createElement('div', { className: 'flying-xp-layer' },
                xpBursts.map((item) => React.createElement('div', {
                    key: item.id,
                    className: 'flying-xp-item',
                    style: { '--x': `${item.x}px`, '--y': `${item.y}px` }
                }, `+${item.xp}`))
            ),
            // Main bar — одна строка
            React.createElement('div', {
                ref: gameBarSurfaceRef,
                className: 'game-bar',
                onClick: toggleExpanded
            },
                // Level + Rank Badge (горизонтально, компактно)
                // Всегда рендерим text + badge — только меняем opacity/visibility, без layout shift
                React.createElement('div', {
                    className: `game-level-group${levelGuardActive ? ' is-syncing' : ''}`,
                    style: { color: levelGuardActive ? 'rgba(255,255,255,0.5)' : title.color }
                },
                    // Маленький dot-индикатор (absolute, не меняет размер group)
                    React.createElement('span', { className: 'game-level-sync-dot' }),
                    // Level text — всегда в DOM; skeleton-текст во время guard
                    React.createElement('span', { className: 'game-level-text' },
                        levelGuardActive ? '· · ·' : `${title.icon} ${stats.level}`
                    ),
                    // Rank badge — всегда в DOM; opacity:0 во время guard → нет скачка
                    React.createElement('span', {
                        className: `game-rank-badge${levelGuardActive ? ' guard-hidden' : ''}`,
                        style: !levelGuardActive && HEYS.game ? {
                            background: `linear-gradient(135deg, ${HEYS.game.getRankBadge(stats.level).color}66 0%, ${HEYS.game.getRankBadge(stats.level).color} 100%)`,
                            color: stats.level >= 10 ? '#000' : '#fff'
                        } : undefined
                    }, !levelGuardActive && HEYS.game ? HEYS.game.getRankBadge(stats.level).rank : '···'),
                    // Level Roadmap Tooltip — все звания
                    HEYS.game && HEYS.game.getAllTitles && !levelGuardActive && React.createElement('div', {
                        className: 'game-level-roadmap'
                    },
                        React.createElement('div', { className: 'roadmap-title' }, '🎮 Путь развития'),
                        HEYS.game.getAllTitles().map((t, i) => {
                            const isCurrent = stats.level >= t.min && stats.level <= t.max;
                            const isAchieved = stats.level > t.max;
                            const isFuture = stats.level < t.min;
                            return React.createElement('div', {
                                key: i,
                                className: `roadmap-item ${isCurrent ? 'current' : ''} ${isAchieved ? 'achieved' : ''} ${isFuture ? 'future' : ''}`
                            },
                                React.createElement('span', { className: 'roadmap-icon' }, t.icon),
                                React.createElement('span', { className: 'roadmap-name' }, t.title),
                                React.createElement('span', {
                                    className: 'roadmap-levels',
                                    style: { color: t.color }
                                }, `ур.${t.min}-${t.max}`),
                                isCurrent && React.createElement('span', { className: 'roadmap-you' }, '← ты'),
                                isAchieved && React.createElement('span', { className: 'roadmap-check' }, '✓')
                            );
                        })
                    )
                ),

                // Progress bar
                React.createElement('div', {
                    className: `game-progress ${levelGuardActive ? 'syncing' : ''} ${isGlowing ? 'glowing' : ''} ${isShimmering ? 'shimmer' : ''} ${isPulsing ? 'pulse' : ''} ${!levelGuardActive && progress.percent >= 85 && progress.percent < 100 ? 'near-goal' : ''}`,
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
                            className: `game-progress-milestone ${progressMilestone === 25 ? 'hit' : ''}`,
                            'data-step': '25'
                        }),
                        React.createElement('span', {
                            className: `game-progress-milestone ${progressMilestone === 50 ? 'hit' : ''}`,
                            'data-step': '50'
                        }),
                        React.createElement('span', {
                            className: `game-progress-milestone ${progressMilestone === 75 ? 'hit' : ''}`,
                            'data-step': '75'
                        })
                    ),
                    // Tooltip — скрываем пока guard активен
                    !levelGuardActive && React.createElement('span', { className: 'game-progress-tooltip' },
                        `Ещё ${progress.required - progress.current} XP до ур.${stats.level + 1}`
                    )
                ),

                // ═══ Правая часть бара: слоты ВСЕГДА в DOM, плавная анимация при загрузке ═══
                // Обёрнуты в game-bar-slots — резервирует место, opacity 0→1 через CSS transition
                React.createElement('div', {
                    className: `game-bar-slots${levelGuardActive ? ' is-loading' : ' is-loaded'}`
                },
                    // Daily Multiplier
                    dailyMultiplier.actions > 0 && React.createElement('span', {
                        className: `game-daily-mult ${dailyMultiplier.multiplier >= 2 ? 'high' : dailyMultiplier.multiplier > 1 ? 'active' : ''}`,
                        title: dailyMultiplier.nextThreshold
                            ? `${dailyMultiplier.actions} действий сегодня. Ещё ${dailyMultiplier.nextThreshold - dailyMultiplier.actions} до ${dailyMultiplier.nextMultiplier}x!`
                            : `${dailyMultiplier.actions} действий сегодня. Максимальный бонус!`
                    },
                        dailyMultiplier.multiplier > 1
                            ? React.createElement('span', { className: 'game-daily-mult-value' }, `${dailyMultiplier.multiplier}x`)
                            : `⚡${dailyMultiplier.actions}`
                    ),

                    // Streak
                    streak > 0 && React.createElement('span', {
                        className: `game-streak ${getStreakClass(streak)}${streakJustGrew ? ' just-grew' : ''}`,
                        title: `${streak} дней подряд в норме (считаем только завершённые дни)`
                    },
                        React.createElement('span', {
                            className: `game-streak__flame ${getStreakFlameClass(streak)}`
                        }, '🔥'),
                        React.createElement('span', { className: 'game-streak__count' }, streak)
                    ),

                    // Personal Best
                    HEYS.game && HEYS.game.isNewStreakRecord() && streak > 0 && React.createElement('span', {
                        className: `game-personal-best${personalBestPulse ? ' pulse' : ''}`,
                        title: 'Новый рекорд streak!'
                    }, '🏆'),

                    // Daily Bonus
                    dailyBonusAvailable && React.createElement('button', {
                        className: 'game-daily-bonus',
                        onClick: async (e) => {
                            e.stopPropagation();
                            if (!HEYS.game || dailyBonusLoading) return;
                            setDailyBonusLoading(true);
                            try {
                                const claimed = await HEYS.game.claimDailyBonus();
                                if (claimed) {
                                    setDailyBonusAvailable(false);
                                    return;
                                }
                                setDailyBonusAvailable(HEYS.game.canClaimDailyBonus());
                            } finally {
                                setDailyBonusLoading(false);
                            }
                        },
                        title: 'Забрать ежедневный бонус!'
                    }, '🎁'),

                    // XP counter
                    React.createElement('span', {
                        className: `game-xp ${!levelGuardActive && isXPCounting ? 'counting' : ''} ${!levelGuardActive && bigXpGlow ? 'big-gain' : ''}`
                    }, levelGuardActive
                        ? React.createElement('span', { className: 'game-xp__skeleton' }, '?/?')
                        : `${progress.current}/${progress.required}`
                    )
                ),

                // Expand button — всегда виден
                React.createElement('button', {
                    className: `game-expand-btn ${expanded ? 'expanded' : ''} ${notifPulse ? 'has-notif' : ''}`,
                    title: expanded ? 'Свернуть' : 'Подробнее'
                }, expanded ? '▲' : '▼'),

                // Theme toggle button — всегда виден
                React.createElement('button', {
                    className: 'hdr-theme-btn',
                    onClick: (e) => {
                        e.stopPropagation();
                        if (HEYS.cycleTheme) {
                            HEYS.cycleTheme();
                            return;
                        }
                        const html = document.documentElement;
                        const current = html.getAttribute('data-theme') || 'light';
                        const next = current === 'dark' ? 'light' : 'dark';
                        html.setAttribute('data-theme', next);
                        const U = window.HEYS?.utils || {};
                        U.lsSet ? U.lsSet('heys_theme', next) : localStorage.setItem('heys_theme', next);
                    },
                    title: 'Сменить тему'
                }, document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙')
            ),

            // Notification (level up / achievement / streak_shield)
            notification && React.createElement('div', {
                className: `game-notification ${notification.type}${notification.type === 'achievement' && notification.data.achievement?.rarity ? ' rarity-' + notification.data.achievement.rarity : ''}`,
                onClick: () => setNotification(null),
                onTouchStart: (e) => { e.currentTarget._touchStartY = e.touches[0].clientY; },
                onTouchMove: (e) => {
                    const deltaY = e.currentTarget._touchStartY - e.touches[0].clientY;
                    if (deltaY > 50) { setNotification(null); } // swipe up to dismiss
                }
            },
                notification.type === 'level_up'
                    ? React.createElement(React.Fragment, null,
                        React.createElement('span', { className: 'notif-icon' }, notification.data.icon),
                        React.createElement('div', { className: 'notif-content' },
                            React.createElement('div', { className: 'notif-title' }, `🎉 Уровень ${notification.data.newLevel}!`),
                            React.createElement('div', { className: 'notif-subtitle' }, `Ты теперь ${notification.data.title}`)
                        )
                    )
                    : notification.type === 'achievement'
                        ? React.createElement(React.Fragment, null,
                            React.createElement('span', { className: 'notif-icon' }, notification.data.achievement.icon),
                            React.createElement('div', { className: 'notif-content' },
                                React.createElement('div', { className: 'notif-title' }, notification.data.achievement.name),
                                React.createElement('div', { className: 'notif-subtitle' }, `+${notification.data.achievement.xp} XP`),
                                notification.data.firstInCategory && React.createElement('div', { className: 'notif-first-category' }, '🆕 Новая категория')
                            )
                        )
                        : notification.type === 'daily_bonus'
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
            expanded && React.createElement(React.Fragment, null,
                // Backdrop
                React.createElement('div', {
                    className: 'game-panel-backdrop',
                    onClick: () => setExpanded(false)
                }),
                // Panel content
                React.createElement('div', {
                    ref: expandedPanelRef,
                    className: 'game-panel-expanded'
                },
                    // Weekly Challenge Section (красивая карточка)
                    React.createElement('div', {
                        className: `game-weekly-card ${weeklyChallenge.completed ? 'completed' : ''} ${weeklyChallenge.percent >= 80 && !weeklyChallenge.completed ? 'almost-done' : ''}`
                    },
                        React.createElement('div', { className: 'weekly-header' },
                            React.createElement('span', {
                                className: `weekly-icon ${weeklyChallenge.completed ? 'pulse-glow' : ''}`
                            }, weeklyChallenge.completed ? '🏆' : (weeklyChallenge.icon || '🎯')),
                            React.createElement('div', { className: 'weekly-title-group' },
                                React.createElement('span', { className: 'weekly-title' },
                                    weeklyChallenge.title || 'Недельный челлендж'
                                ),
                                React.createElement('span', { className: 'weekly-subtitle' },
                                    weeklyChallenge.completed
                                        ? '✨ Выполнено! +100 XP бонус'
                                        : weeklyChallenge.description || `${weeklyChallenge.target} за неделю`
                                )
                            ),
                            // Days remaining badge
                            !weeklyChallenge.completed && React.createElement('div', {
                                className: 'weekly-days-left',
                                title: 'Дней до конца недели'
                            }, `${7 - new Date().getDay() || 7}д`)
                        ),
                        React.createElement('div', { className: 'weekly-progress-container' },
                            React.createElement('div', { className: 'weekly-progress-bar' },
                                React.createElement('div', {
                                    className: `weekly-progress-fill ${weeklyChallenge.percent >= 80 ? 'near-complete' : ''}`,
                                    style: {
                                        width: `${weeklyChallenge.percent}%`,
                                        transition: 'width 0.5s ease-out'
                                    }
                                }),
                                // Milestone markers
                                React.createElement('div', {
                                    className: 'weekly-milestone',
                                    style: { left: '25%' },
                                    'data-reached': weeklyChallenge.percent >= 25
                                }),
                                React.createElement('div', {
                                    className: 'weekly-milestone',
                                    style: { left: '50%' },
                                    'data-reached': weeklyChallenge.percent >= 50
                                }),
                                React.createElement('div', {
                                    className: 'weekly-milestone',
                                    style: { left: '75%' },
                                    'data-reached': weeklyChallenge.percent >= 75
                                }),
                                weeklyChallenge.completed && React.createElement('div', { className: 'weekly-progress-glow' })
                            ),
                            React.createElement('div', { className: 'weekly-progress-labels' },
                                React.createElement('span', { className: 'weekly-earned' },
                                    `${weeklyChallenge.current || weeklyChallenge.earned || 0}${weeklyChallenge.unit || ''}`
                                ),
                                React.createElement('span', { className: 'weekly-target' },
                                    `${weeklyChallenge.target}${weeklyChallenge.unit || ''}`
                                )
                            )
                        ),
                        React.createElement('div', {
                            className: `weekly-percent ${weeklyChallenge.completed ? 'completed' : weeklyChallenge.percent >= 80 ? 'almost' : ''}`
                        },
                            weeklyChallenge.completed
                                ? '🎉 100%'
                                : weeklyChallenge.percent >= 80
                                    ? `🔥 ${weeklyChallenge.percent}%`
                                    : `${weeklyChallenge.percent}%`
                        ),
                        // Reward preview
                        !weeklyChallenge.completed && React.createElement('div', { className: 'weekly-reward-preview' },
                            React.createElement('span', null, '🎁 Награда: '),
                            React.createElement('span', { className: 'reward-xp' }, `+${weeklyChallenge.reward || 100} XP`)
                        )
                    ),

                    // XP History — мини-график за 7 дней
                    xpHistory?.length > 0 && React.createElement('div', { className: 'xp-history-section' },
                        React.createElement('div', { className: 'xp-history-title' }, '📊 XP за неделю'),
                        React.createElement('div', { className: `xp-history-chart${xpHistoryAnimate ? ' animate' : ''}` },
                            (() => {
                                const maxXP = Math.max(...xpHistory.map(d => d.xp), 1);
                                return xpHistory.map((day, i) =>
                                    React.createElement('div', {
                                        key: i,
                                        className: `xp-history-bar ${i === 6 ? 'today' : ''}`,
                                        title: `${day.date}: ${day.xp} XP`
                                    },
                                        React.createElement('div', {
                                            className: 'xp-bar-fill',
                                            style: { height: `${(day.xp / maxXP) * 100}%` }
                                        }),
                                        React.createElement('span', { className: 'xp-bar-day' }, day.day),
                                        day.xp > 0 && React.createElement('span', { className: 'xp-bar-value' }, day.xp)
                                    )
                                );
                            })()
                        )
                    ),

                    // Stats section
                    React.createElement('div', { className: 'game-stats-section' },
                        React.createElement('div', { className: 'game-stat' },
                            // 🛡️ levelGuard: скрываем протухший XP из localStorage пока pipeline не завершился
                            React.createElement('span', { className: 'stat-value' },
                                levelGuardActive
                                    ? React.createElement('span', { className: 'stat-value--syncing', title: 'Синхронизация…' }, '…')
                                    : stats.totalXP
                            ),
                            React.createElement('span', { className: 'stat-label' }, 'Всего XP')
                        ),
                        React.createElement('div', { className: 'game-stat' },
                            React.createElement('span', { className: 'stat-value' },
                                levelGuardActive
                                    ? React.createElement('span', { className: 'stat-value--syncing', title: 'Синхронизация…' }, '…')
                                    : `${stats.level}`
                            ),
                            React.createElement('span', { className: 'stat-label' }, 'Уровень')
                        ),
                        React.createElement('div', { className: 'game-stat' },
                            React.createElement('span', { className: 'stat-value' }, streak || 0),
                            React.createElement('span', { className: 'stat-label' }, 'Streak')
                        ),
                        React.createElement('div', { className: 'game-stat' },
                            React.createElement('span', { className: 'stat-value' }, `${stats.unlockedCount}/${stats.totalAchievements}`),
                            React.createElement('span', { className: 'stat-label' }, 'Достижения')
                        )
                    ),

                    // Daily missions (expanded) — full card UI
                    dailyMissions && React.createElement('div', {
                        className: 'game-missions-panel'
                    },
                        React.createElement('div', { className: 'game-missions-panel__title' }, '🧭 Миссии дня'),
                        React.createElement('div', { className: 'game-missions-list' },
                            (dailyMissions.missions || []).map((m, i) => {
                                const progressPct = m.target > 0 ? Math.min(100, Math.round((m.progress / m.target) * 100)) : 0;
                                const CATEGORY_META = HEYS.missions?.CATEGORY_META || {};
                                const categoryMeta = CATEGORY_META[m.category] || {};

                                // Progress text for missions with target > 1
                                let progressText = '';
                                if (!m.completed && m.target > 1) {
                                    if (m.type === 'water' || m.type === 'kcal' || m.type === 'fiber' ||
                                        m.type === 'protein' || m.type === 'complex_carbs' || m.type === 'harm') {
                                        progressText = `${m.progress || 0}%`;
                                    } else {
                                        progressText = `${m.progress || 0}/${m.target}`;
                                    }
                                }

                                return React.createElement('div', {
                                    key: m.id || i,
                                    className: `game-mission-card ${m.completed ? 'is-complete' : ''}`
                                },
                                    React.createElement('div', { className: 'game-mission-card__icon' }, m.completed ? '✅' : (m.icon || '⚪')),
                                    React.createElement('div', { className: 'game-mission-card__body' },
                                        React.createElement('div', { className: 'game-mission-card__header' },
                                            React.createElement('div', { className: 'game-mission-card__name' }, m.name || m.id),
                                            categoryMeta.label && React.createElement('div', {
                                                className: 'game-mission-card__category',
                                                style: {
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: 'rgba(255,255,255,0.15)',
                                                    color: 'rgba(255,255,255,0.85)',
                                                    whiteSpace: 'nowrap'
                                                }
                                            }, `${categoryMeta.icon || ''} ${categoryMeta.label}`.trim())
                                        ),
                                        React.createElement('div', { className: 'game-mission-card__desc' }, m.desc || ''),
                                        !m.completed && React.createElement('div', { className: 'game-mission-card__bar-wrapper' },
                                            React.createElement('div', { className: 'game-mission-card__bar' },
                                                React.createElement('div', {
                                                    className: 'game-mission-card__bar-fill',
                                                    style: { width: progressPct + '%' }
                                                })
                                            ),
                                            progressText && React.createElement('div', {
                                                className: 'game-mission-card__progress-text',
                                                style: {
                                                    fontSize: '11px',
                                                    color: 'rgba(255,255,255,0.7)',
                                                    marginTop: '4px'
                                                }
                                            }, progressText)
                                        )
                                    ),
                                    React.createElement('div', { className: 'game-mission-card__xp' },
                                        m.completed ? `+${m.xp}` : `${m.xp} XP`
                                    )
                                );
                            })
                        ),
                        // Бонус счётчик
                        React.createElement('div', { className: 'game-missions-panel__footer' },
                            dailyMissions.completedCount >= 3 && dailyMissions.bonusClaimed
                                ? React.createElement('span', { className: 'game-missions-bonus-done' }, '🎉 Бонус +50 XP получен!')
                                : React.createElement('span', { className: 'game-missions-bonus-hint' },
                                    `${dailyMissions.completedCount || 0}/3 — выполни все для +50 XP 🎁`
                                )
                        )
                    ),

                    // Title & next level
                    React.createElement('div', { className: 'game-title-section' },
                        React.createElement('div', { className: 'game-title-row' },
                            React.createElement('div', {
                                className: 'current-title',
                                style: { color: title.color }
                            }, `${title.icon} ${title.title}`),
                            React.createElement('div', { className: 'next-level-hint' },
                                `До уровня ${stats.level + 1}: ${progress.required - progress.current} XP`
                            ),
                            onboardingDone && React.createElement('div', {
                                ref: targetMedalRef,
                                className: `onboarding-medal${isOnboardingTipOpen ? ' is-open' : ''}`,
                                role: 'button',
                                tabIndex: 0,
                                onClick: handleOnboardingMedalToggle,
                                onMouseEnter: () => setIsOnboardingTipOpen(true),
                                onMouseLeave: () => setIsOnboardingTipOpen(false),
                                onBlur: () => setIsOnboardingTipOpen(false),
                                onKeyDown: (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleOnboardingMedalToggle(e);
                                    }
                                }
                            },
                                '🏅',
                                React.createElement('span', { className: 'onboarding-medal__tooltip' },
                                    'Первые шаги: все базовые достижения выполнены'
                                )
                            )
                        ),
                        daysToNext && React.createElement('div', { className: 'game-forecast' },
                            `Прогноз: ур.${stats.level + 1} примерно через ${daysToNext} дн. (~${avgDailyXP} XP/день)`
                        )
                    ),

                    // Achievements grid
                    React.createElement('div', { className: 'game-achievements-section' },
                        React.createElement('h4', null, '🏆 Достижения'),
                        HEYS.game && HEYS.game.getAchievementCategories()
                            .filter((cat) => !(cat.id === 'onboarding' && onboardingDone))
                            .map(cat =>
                                React.createElement('div', { key: cat.id, className: 'achievement-category' },
                                    React.createElement('div', { className: 'category-name' }, cat.name),
                                    cat.id === 'streak' && React.createElement('div', {
                                        className: 'achievement-category-hint'
                                    }, '⚡ Суперредко → максимум XP'),
                                    React.createElement('div', { className: 'achievements-row' },
                                        cat.achievements.map(achId => {
                                            const ach = HEYS.game.ACHIEVEMENTS[achId];
                                            const unlocked = HEYS.game.isAchievementUnlocked(achId);
                                            const isJustUnlocked = justUnlockedAch === achId;
                                            const rarityClass = unlocked ? `rarity-${ach.rarity}` : '';

                                            // 🆕 Get progress for locked achievements
                                            const progress = !unlocked && HEYS.game.getAchievementProgress
                                                ? HEYS.game.getAchievementProgress(achId)
                                                : null;
                                            const progressPct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;
                                            const isAlmostThere = progressPct >= 70 && progressPct < 100;

                                            return React.createElement('div', {
                                                key: achId,
                                                className: `achievement-badge ${unlocked ? 'unlocked' : 'locked'} ${rarityClass} ${isJustUnlocked ? 'just-unlocked' : ''} ${isAlmostThere ? 'almost-there' : ''}`,
                                                title: `${ach.name}: ${ach.desc}${progress ? ` (${progress.current}/${progress.target})` : ''}`,
                                                style: unlocked ? { borderColor: HEYS.game.RARITY_COLORS[ach.rarity] } : {},
                                                onClick: (e) => {
                                                    e.stopPropagation();
                                                    setStoryAchId(achId);
                                                }
                                            },
                                                React.createElement('span', { className: 'badge-icon' }, unlocked ? ach.icon : '🔒'),
                                                unlocked
                                                    ? React.createElement('span', { className: 'badge-xp' }, `+${ach.xp}`)
                                                    : progress && progressPct > 0 && React.createElement('span', {
                                                        className: `badge-progress ${isAlmostThere ? 'almost' : ''}`
                                                    }, `${progressPct}%`),
                                                // 🆕 Progress bar for locked achievements
                                                !unlocked && progress && progressPct > 0 && React.createElement('div', {
                                                    className: 'badge-progress-bar',
                                                    style: { width: `${progressPct}%` }
                                                })
                                            );
                                        })
                                    )
                                )
                            )
                    )
                    ,

                    React.createElement('div', { className: 'game-audit-section' },
                        React.createElement('div', { className: 'game-audit-title' }, '🧾 История геймификации'),
                        React.createElement('div', { className: 'game-audit-subtitle' }, 'Лента изменений XP, уровней и наград. Доступна клиенту и куратору.'),
                        React.createElement('div', { className: 'game-audit-buttons' },
                            React.createElement('button', {
                                className: 'game-audit-btn',
                                onClick: (e) => {
                                    e.stopPropagation();
                                    const nextState = !auditOpen;
                                    logAuditInfo('toggle:click', { nextState, expanded, auditOpen });
                                    setAuditOpen(nextState);
                                    if (nextState) {
                                        loadAuditHistory();
                                    }
                                }
                            }, auditOpen ? 'Скрыть историю' : 'Показать историю'),
                            React.createElement('button', {
                                className: 'game-audit-btn game-audit-btn--copy',
                                onClick: (e) => {
                                    e.stopPropagation();
                                    copyFullAuditLog();
                                },
                                title: 'Скопировать весь лог в буфер обмена'
                            }, '📋 Копировать лог')
                        ),
                        auditOpen && React.createElement('div', { className: 'game-audit-list' },
                            auditLoading && React.createElement('div', { className: 'game-audit-loading' }, 'Загружаем историю...'),
                            !auditLoading && auditError && React.createElement('div', { className: 'game-audit-error' }, auditError),
                            !auditLoading && !auditError && auditEvents.length === 0 && React.createElement('div', { className: 'game-audit-empty' }, 'Пока нет событий'),
                            !auditLoading && !auditError && auditEvents.map((event) => {
                                const meta = event?.metadata || {};
                                const actionLabel = getAuditActionLabel(event.action, meta);
                                const reasonLabel = getAuditReasonLabel(event.reason);
                                const when = event.created_at
                                    ? new Date(event.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                    : '';
                                const actorLabel = event.actor_type === 'curator'
                                    ? 'Куратор'
                                    : event.actor_type === 'pin'
                                        ? 'PIN'
                                        : 'Система';
                                const xpDelta = typeof event.xp_delta === 'number' ? event.xp_delta : null;
                                const levelBefore = event.level_before;
                                const levelAfter = event.level_after;
                                const levelChange = levelBefore && levelAfter && levelAfter !== levelBefore
                                    ? `ур.${levelBefore} → ур.${levelAfter}`
                                    : null;

                                return React.createElement('div', { key: event.id, className: 'game-audit-item' },
                                    React.createElement('div', { className: 'game-audit-item__row' },
                                        React.createElement('div', { className: 'game-audit-item__title' }, actionLabel),
                                        xpDelta !== null && React.createElement('div', { className: 'game-audit-item__delta' }, `+${xpDelta} XP`)
                                    ),
                                    React.createElement('div', { className: 'game-audit-item__meta' },
                                        React.createElement('span', { className: `game-audit-badge game-audit-badge--${event.actor_type || 'system'}` }, actorLabel),
                                        reasonLabel && React.createElement('span', { className: 'game-audit-meta' }, reasonLabel),
                                        levelChange && React.createElement('span', { className: 'game-audit-meta' }, levelChange),
                                        when && React.createElement('span', { className: 'game-audit-meta' }, when)
                                    )
                                );
                            })
                        )
                    )
                )
            ),

            storyAchievement && React.createElement('div', {
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
            ),

            levelUpModal && React.createElement('div', {
                className: 'level-up-modal',
                onClick: () => setLevelUpModal(null)
            },
                React.createElement('div', { className: 'level-up-modal__backdrop' }),
                React.createElement('div', {
                    className: 'level-up-modal__card',
                    style: { '--level-color': levelUpModal.color },
                    onClick: (e) => e.stopPropagation()
                },
                    React.createElement('div', { className: 'level-up-modal__badge' }, levelUpModal.icon),
                    React.createElement('div', { className: 'level-up-modal__title' }, 'Новый уровень!'),
                    React.createElement('div', { className: 'level-up-modal__level' }, `Уровень ${levelUpModal.level}`),
                    React.createElement('div', { className: 'level-up-modal__subtitle' }, levelUpModal.title),
                    React.createElement('button', {
                        className: 'level-up-modal__btn',
                        onClick: () => setLevelUpModal(null)
                    }, 'Продолжить')
                )
            ),

            weeklyCeremony && React.createElement('div', {
                className: 'weekly-ceremony-modal',
                onClick: () => setWeeklyCeremony(null)
            },
                React.createElement('div', { className: 'weekly-ceremony-modal__backdrop' }),
                React.createElement('div', {
                    className: 'weekly-ceremony-modal__card',
                    onClick: (e) => e.stopPropagation()
                },
                    React.createElement('div', { className: 'weekly-ceremony-modal__icon' }, weeklyCeremony.icon || '🏆'),
                    React.createElement('div', { className: 'weekly-ceremony-modal__title' }, 'Недельный челлендж выполнен!'),
                    React.createElement('div', { className: 'weekly-ceremony-modal__subtitle' }, weeklyCeremony.title),
                    React.createElement('div', { className: 'weekly-ceremony-modal__reward' }, `+${weeklyCeremony.reward} XP`),
                    React.createElement('button', {
                        className: 'weekly-ceremony-modal__btn',
                        onClick: () => setWeeklyCeremony(null)
                    }, 'Отлично!')
                )
            ),

            streakCelebration && React.createElement('div', {
                className: 'streak-milestone-toast'
            }, `🔥 Streak ${streakCelebration} дней!`),

            // === Onboarding Fusion Ceremony ===
            fusionPhase && React.createElement('div', {
                className: 'onboarding-fusion',
                onClick: (e) => { if (fusionPhase === 'ready') handleFusionDismiss(); }
            },
                React.createElement('div', { className: 'onboarding-fusion__backdrop' }),
                React.createElement('div', {
                    className: 'onboarding-fusion__stage',
                    onClick: (e) => e.stopPropagation()
                },
                    // Title
                    React.createElement('div', {
                        className: 'onboarding-fusion__title'
                    }, '✨ Все первые шаги пройдены!'),

                    // Ring with achievement icons
                    React.createElement('div', { className: 'onboarding-fusion__ring' },
                        // Achievement icons positioned in a circle
                        ONBOARDING_ICONS.map((icon, i) => {
                            const isMerging = fusionPhase === 'merge' || fusionPhase === 'medal' || fusionPhase === 'ready' || fusionPhase === 'fly';
                            return React.createElement('div', {
                                key: i,
                                className: 'onboarding-fusion__icon',
                                style: {
                                    left: isMerging ? 'calc(50% - 22px)' : `calc(${fusionIconPositions[i].left} - 22px)`,
                                    top: isMerging ? 'calc(50% - 22px)' : `calc(${fusionIconPositions[i].top} - 22px)`,
                                    opacity: isMerging ? 0 : 1,
                                    transform: isMerging ? 'scale(0)' : 'scale(1)',
                                    transition: isMerging ? `all 0.6s cubic-bezier(0.55, 0, 0.1, 1) ${i * 0.05}s` : 'none',
                                    animation: fusionPhase === 'gather' ? `fusionIconAppear 0.4s ease-out ${0.4 + i * 0.1}s forwards` : 'none'
                                }
                            }, icon);
                        }),

                        // Starburst rays
                        (fusionPhase === 'medal' || fusionPhase === 'ready') && React.createElement('div', {
                            className: 'onboarding-fusion__rays is-visible'
                        },
                            Array.from({ length: 12 }).map((_, i) =>
                                React.createElement('div', { key: i, className: 'onboarding-fusion__ray' })
                            )
                        ),

                        // Medal
                        React.createElement('div', {
                            ref: fusionMedalRef,
                            className: `onboarding-fusion__medal${(fusionPhase === 'medal' || fusionPhase === 'ready') ? ' is-visible' : ''}`,
                            style: fusionPhase === 'fly' ? {} : {}
                        }, '🏅'),

                        // Confetti particles
                        (fusionPhase === 'medal' || fusionPhase === 'ready') && React.createElement('div', {
                            className: 'onboarding-fusion__confetti'
                        },
                            fusionConfetti.map((p, i) =>
                                React.createElement('div', {
                                    key: i,
                                    className: 'onboarding-fusion__confetti-piece is-active',
                                    style: {
                                        '--cx': p.cx,
                                        '--cy': p.cy,
                                        background: p.color,
                                        width: `${p.size}px`,
                                        height: `${p.size}px`,
                                        left: '50%',
                                        top: '50%',
                                        animationDelay: p.delay
                                    }
                                })
                            )
                        )
                    ),

                    // Subtitle
                    fusionPhase === 'ready' && React.createElement('div', {
                        className: 'onboarding-fusion__subtitle is-visible'
                    }, 'Все базовые достижения собраны и объединены'),

                    // XP total
                    fusionPhase === 'ready' && React.createElement('div', {
                        className: 'onboarding-fusion__xp is-visible'
                    }, `+${ONBOARDING_ACHIEVEMENTS.reduce((sum, id) => sum + (HEYS.game?.ACHIEVEMENTS?.[id]?.xp || 0), 0)} XP заработано`),

                    // Button
                    fusionPhase === 'ready' && React.createElement('button', {
                        className: 'onboarding-fusion__btn is-visible',
                        onClick: handleFusionDismiss
                    }, '🏅 Отлично!')
                )
            )
        );
    }

    HEYS.GamificationBar = GamificationBar;
})();
