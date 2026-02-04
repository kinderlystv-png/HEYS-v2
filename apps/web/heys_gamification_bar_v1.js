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
        const { useState, useEffect, useRef, useCallback } = React;

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
        const prevLevelRef = useRef(stats.level);
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
        const [dailyMissions, setDailyMissions] = useState(() => {
            return HEYS.game?.getDailyMissions ? HEYS.game.getDailyMissions() : null;
        });
        const [isOnboardingTipOpen, setIsOnboardingTipOpen] = useState(false);
        const [auditOpen, setAuditOpen] = useState(false);
        const [auditEvents, setAuditEvents] = useState([]);
        const [auditLoading, setAuditLoading] = useState(false);
        const [auditError, setAuditError] = useState(null);

        const isOnboardingComplete = useCallback(() => {
            if (!HEYS.game) return false;
            const onboardingAchievements = [
                'first_checkin',
                'first_meal',
                'first_product',
                'first_steps',
                'first_advice',
                'first_supplements',
                'first_water',
                'first_training',
                'first_household'
            ];
            return onboardingAchievements.every((achId) => HEYS.game.isAchievementUnlocked(achId));
        }, []);

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

            const handleUpdate = (e) => {
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
                    if (newStats.level > prevLevel) {
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
                }
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
                            // Сравниваем по длине и последнему элементу
                            if (prev && newHistory &&
                                prev.length === newHistory.length &&
                                JSON.stringify(prev[prev.length - 1]) === JSON.stringify(newHistory[newHistory.length - 1])) {
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

        const loadAuditHistory = useCallback(async () => {
            if (!HEYS.game?.getAuditHistory) return;
            setAuditLoading(true);
            setAuditError(null);

            const result = await HEYS.game.getAuditHistory({ limit: 50, offset: 0 });
            if (result?.error) {
                const message = result.error?.message || result.error || 'Не удалось загрузить историю';
                setAuditError(message);
                setAuditEvents([]);
                setAuditLoading(false);
                return;
            }

            const items = Array.isArray(result?.items) ? result.items : [];
            setAuditEvents(items);
            setAuditLoading(false);
        }, []);

        useEffect(() => {
            if (expanded && auditOpen) {
                loadAuditHistory();
            }
        }, [expanded, auditOpen, loadAuditHistory]);

        const toggleExpanded = () => {
            if (expanded) {
                setAuditOpen(false);
            }
            setExpanded(!expanded);
        };

        const { title, progress } = stats;
        const progressPercent = Math.max(5, progress.percent); // Minimum 5% для визуального feedback
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
                className: 'game-bar',
                onClick: toggleExpanded
            },
                // Level + Rank Badge (горизонтально, компактно)
                React.createElement('div', {
                    className: 'game-level-group',
                    style: { color: title.color }
                },
                    React.createElement('span', { className: 'game-level-text' }, `${title.icon} ${stats.level}`),
                    HEYS.game && React.createElement('span', {
                        className: 'game-rank-badge',
                        style: {
                            background: `linear-gradient(135deg, ${HEYS.game.getRankBadge(stats.level).color}66 0%, ${HEYS.game.getRankBadge(stats.level).color} 100%)`,
                            color: stats.level >= 10 ? '#000' : '#fff'
                        }
                    }, HEYS.game.getRankBadge(stats.level).rank),
                    // Level Roadmap Tooltip — все звания
                    HEYS.game && HEYS.game.getAllTitles && React.createElement('div', {
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
                    className: `game-progress ${isGlowing ? 'glowing' : ''} ${isShimmering ? 'shimmer' : ''} ${isPulsing ? 'pulse' : ''} ${progress.percent >= 85 && progress.percent < 100 ? 'near-goal' : ''}`,
                    onClick: handleProgressClick
                },
                    React.createElement('div', {
                        className: 'game-progress-fill',
                        style: {
                            width: `${progressPercent}%`,
                            background: getProgressGradient(progress.percent)
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
                    // Tooltip
                    React.createElement('span', { className: 'game-progress-tooltip' },
                        `Ещё ${progress.required - progress.current} XP до ур.${stats.level + 1}`
                    )
                ),

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
                    onClick: (e) => {
                        e.stopPropagation();
                        if (HEYS.game && HEYS.game.claimDailyBonus()) {
                            setDailyBonusAvailable(false);
                        }
                    },
                    title: 'Забрать ежедневный бонус!'
                }, '🎁'),

                // XP counter
                React.createElement('span', {
                    className: `game-xp ${isXPCounting ? 'counting' : ''} ${bigXpGlow ? 'big-gain' : ''}`
                }, `${progress.current}/${progress.required}`),

                // Expand button
                React.createElement('button', {
                    className: `game-expand-btn ${expanded ? 'expanded' : ''} ${notifPulse ? 'has-notif' : ''}`,
                    title: expanded ? 'Свернуть' : 'Подробнее'
                }, expanded ? '▲' : '▼'),

                // Theme toggle button
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
                React.createElement('div', { className: 'game-panel-expanded' },
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
                            React.createElement('span', { className: 'stat-value' }, stats.totalXP),
                            React.createElement('span', { className: 'stat-label' }, 'Всего XP')
                        ),
                        React.createElement('div', { className: 'game-stat' },
                            React.createElement('span', { className: 'stat-value' }, `${stats.level}`),
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

                    // Daily missions (expanded)
                    dailyMissions && React.createElement('div', {
                        className: 'game-missions-panel'
                    },
                        React.createElement('div', { className: 'game-missions-panel__title' }, '🧭 Миссии дня'),
                        React.createElement('div', { className: 'game-missions-panel__row' },
                            React.createElement('div', { className: 'game-missions-dots' },
                                [0, 1, 2].map((i) => React.createElement('span', {
                                    key: i,
                                    className: `game-missions-dot ${i < (dailyMissions.completedCount || 0) ? 'is-complete' : ''}`
                                }))
                            ),
                            React.createElement('span', { className: 'game-missions-count' }, `${dailyMissions.completedCount || 0}/3`)
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
                        React.createElement('button', {
                            className: 'game-audit-btn',
                            onClick: (e) => {
                                e.stopPropagation();
                                const nextState = !auditOpen;
                                setAuditOpen(nextState);
                                if (nextState) {
                                    loadAuditHistory();
                                }
                            }
                        }, auditOpen ? 'Скрыть историю' : 'Показать историю'),
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
            }, `🔥 Streak ${streakCelebration} дней!`)
        );
    }

    HEYS.GamificationBar = GamificationBar;
})();
