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
                    }

                    // Level up flash
                    if (newStats.level > prevLevelRef.current) {
                        setIsLevelUpFlash(true);
                        setTimeout(() => setIsLevelUpFlash(false), 1000);
                        prevLevelRef.current = newStats.level;
                    }

                    // 🔒 Оптимизация: не обновляем stats если они идентичны (предотвращает мерцание)
                    setStats(prevStats => {
                        if (prevStats &&
                            prevStats.xp === newStats.xp &&
                            prevStats.level === newStats.level &&
                            prevStats.streak === newStats.streak) {
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
            };

            const handleNotification = (e) => {
                setNotification(e.detail);
                setTimeout(() => setNotification(null), e.detail.type === 'level_up' ? 4000 : 3000);

                // Achievement unlock animation
                if (e.detail.type === 'achievement') {
                    setJustUnlockedAch(e.detail.data.achievement.id);
                    setTimeout(() => setJustUnlockedAch(null), 1000);
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

        // Периодическое обновление streak (каждые 30 сек)
        useEffect(() => {
            const interval = setInterval(() => {
                const newStreak = safeGetStreak();
                setStreak(prev => prev === newStreak ? prev : newStreak);
            }, 30000);
            return () => clearInterval(interval);
        }, []);

        const toggleExpanded = () => setExpanded(!expanded);

        const { title, progress } = stats;
        const progressPercent = Math.max(5, progress.percent); // Minimum 5% для визуального feedback

        // Эффекты по уровню прогресса
        const isShimmering = progress.percent >= 80; // Блик при >80%
        const isPulsing = progress.percent >= 90;    // Пульсация при >90%
        const isGlowing = progress.percent >= 90;

        // Streak класс по уровню
        const getStreakClass = (s) => {
            if (s >= 30) return 'streak-legendary';  // 30+ дней — радужный
            if (s >= 14) return 'streak-epic';       // 14+ дней — золотой
            if (s >= 7) return 'streak-high';        // 7+ дней — яркий
            if (s >= 3) return 'streak-mid';         // 3+ дней — мерцающий
            return 'streak-low';                     // 1-2 дня — статичный
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
                    title: `${streak} дней подряд в норме!`
                }, `🔥${streak}`),

                // Personal Best
                HEYS.game && HEYS.game.isNewStreakRecord() && streak > 0 && React.createElement('span', {
                    className: 'game-personal-best',
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
                    className: `game-xp ${isXPCounting ? 'counting' : ''}`
                }, `${progress.current}/${progress.required}`),

                // Expand button
                React.createElement('button', {
                    className: `game-expand-btn ${expanded ? 'expanded' : ''}`,
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
                                React.createElement('div', { className: 'notif-subtitle' }, `+${notification.data.achievement.xp} XP`)
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
                                        React.createElement('div', { className: 'notif-subtitle' }, `+100 XP бонус!`)
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
                        className: `game-weekly-card ${weeklyChallenge.completed ? 'completed' : ''}`
                    },
                        React.createElement('div', { className: 'weekly-header' },
                            React.createElement('span', { className: 'weekly-icon' }, weeklyChallenge.completed ? '🏆' : '🎯'),
                            React.createElement('div', { className: 'weekly-title-group' },
                                React.createElement('span', { className: 'weekly-title' }, 'Недельный челлендж'),
                                React.createElement('span', { className: 'weekly-subtitle' },
                                    weeklyChallenge.completed
                                        ? '✨ Выполнено! +100 XP бонус'
                                        : `Заработай ${weeklyChallenge.target} XP за неделю`
                                )
                            )
                        ),
                        React.createElement('div', { className: 'weekly-progress-container' },
                            React.createElement('div', { className: 'weekly-progress-bar' },
                                React.createElement('div', {
                                    className: 'weekly-progress-fill',
                                    style: { width: `${weeklyChallenge.percent}%` }
                                }),
                                React.createElement('div', { className: 'weekly-progress-glow' })
                            ),
                            React.createElement('div', { className: 'weekly-progress-labels' },
                                React.createElement('span', { className: 'weekly-earned' }, `${weeklyChallenge.earned} XP`),
                                React.createElement('span', { className: 'weekly-target' }, `${weeklyChallenge.target} XP`)
                            )
                        ),
                        React.createElement('div', { className: 'weekly-percent' },
                            weeklyChallenge.completed
                                ? '100%'
                                : `${weeklyChallenge.percent}%`
                        )
                    ),

                    // XP History — мини-график за 7 дней
                    xpHistory?.length > 0 && React.createElement('div', { className: 'xp-history-section' },
                        React.createElement('div', { className: 'xp-history-title' }, '📊 XP за неделю'),
                        React.createElement('div', { className: 'xp-history-chart' },
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

                    // Title & next level
                    React.createElement('div', { className: 'game-title-section' },
                        React.createElement('div', {
                            className: 'current-title',
                            style: { color: title.color }
                        }, `${title.icon} ${title.title}`),
                        React.createElement('div', { className: 'next-level-hint' },
                            `До уровня ${stats.level + 1}: ${progress.required - progress.current} XP`
                        )
                    ),

                    // Achievements grid
                    React.createElement('div', { className: 'game-achievements-section' },
                        React.createElement('h4', null, '🏆 Достижения'),
                        HEYS.game && HEYS.game.getAchievementCategories().map(cat =>
                            React.createElement('div', { key: cat.id, className: 'achievement-category' },
                                React.createElement('div', { className: 'category-name' }, cat.name),
                                React.createElement('div', { className: 'achievements-row' },
                                    cat.achievements.map(achId => {
                                        const ach = HEYS.game.ACHIEVEMENTS[achId];
                                        const unlocked = HEYS.game.isAchievementUnlocked(achId);
                                        const isJustUnlocked = justUnlockedAch === achId;
                                        const rarityClass = unlocked ? `rarity-${ach.rarity}` : '';
                                        return React.createElement('div', {
                                            key: achId,
                                            className: `achievement-badge ${unlocked ? 'unlocked' : 'locked'} ${rarityClass} ${isJustUnlocked ? 'just-unlocked' : ''}`,
                                            title: `${ach.name}: ${ach.desc}`,
                                            style: unlocked ? { borderColor: HEYS.game.RARITY_COLORS[ach.rarity] } : {}
                                        },
                                            React.createElement('span', { className: 'badge-icon' }, unlocked ? ach.icon : '🔒'),
                                            React.createElement('span', { className: 'badge-xp' }, `+${ach.xp}`)
                                        );
                                    })
                                )
                            )
                        )
                    )
                )
            )
        );
    }

    HEYS.GamificationBar = GamificationBar;
})();
