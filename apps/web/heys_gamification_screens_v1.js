// heys_gamification_screens_v1.js — v4 gamification sheet (Прогресс / Достижения / Уровни)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    HEYS.GamificationScreens = (function () {
        const React = window.React;
        const { useState, useEffect, useMemo, useCallback } = React;

        const TAB_PROGRESS = 'progress';
        const TAB_ACHIEVEMENTS = 'achievements';
        const TAB_LEVELS = 'levels';

        const STREAK_CORRIDOR_HINT = 'Держите калории в коридоре — серия продолжится';
        const FORGIVEN_HINT = 'Вчера пропуск — серия сохранена, второй пропуск её прервёт';
        const XP_FOOTNOTE = 'работают 17 из 17';

        const XP_TABLE_ORDER = [
            'day_completed',
            'perfect_day',
            'sleep_logged',
            'weight_logged',
            'checkin_complete',
            'meal_added',
            'product_added',
            'water_added',
            'training_added',
            'advice_read',
            'steps_updated',
            'supplements_taken',
            'household_added',
            'morning_activation_done',
            'morning_activation_streak_3',
            'morning_activation_streak_7',
            'morning_activation_streak_14'
        ];

        function safeGetStreak() {
            return HEYS.utils?.safeGetStreak?.() || 0;
        }

        function safeGetStreakDetails() {
            return HEYS.utils?.safeGetStreakDetails?.() || { count: 0, yesterdayForgiven: false };
        }

        function isFirstDayBranch() {
            const details = safeGetStreakDetails();
            const streak = safeGetStreak();
            return details.count === 0 || streak === 0;
        }

        function titleForLevel(level) {
            const titles = HEYS.game?.LEVEL_TITLES || [];
            for (let i = 0; i < titles.length; i++) {
                const t = titles[i];
                if (level >= t.min && level <= t.max) return t;
            }
            return titles[titles.length - 1] || { title: '', icon: '', color: '' };
        }

        function buildStreakMultiplierReason(streak, multiplier) {
            if (multiplier <= 1) return '';
            if (streak >= 14) return `×${multiplier} за серию ${streak} дней`;
            if (streak >= 7) return `×${multiplier} за серию от 7 дней`;
            if (streak >= 3) return `×${multiplier} за серию от 3 дней`;
            return `×${multiplier} за серию`;
        }

        function buildDailyMultiplierReason(info) {
            if (!info || info.multiplier <= 1) return '';
            const actions = info.actions || 0;
            return `×${info.multiplier} за ${actions} действий сегодня`;
        }

        function missionProgressPct(m) {
            if (!m || m.completed) return 100;
            if (m.target > 0) return Math.min(100, Math.round((m.progress / m.target) * 100));
            return 0;
        }

        function missionProgressText(m) {
            if (!m || m.completed) return '';
            if (m.target > 1) {
                if (m.type === 'water' || m.type === 'kcal' || m.type === 'fiber' ||
                    m.type === 'protein' || m.type === 'complex_carbs' || m.type === 'harm') {
                    return `${m.progress || 0}%`;
                }
                return `${m.progress || 0}/${m.target}`;
            }
            return '';
        }

        function categoryActivityScore(cat, achievementsById) {
            let unlocked = 0;
            let inProgress = 0;
            (cat.achievements || []).forEach((achId) => {
                const ach = achievementsById[achId];
                if (!ach) return;
                if (ach.unlocked) unlocked += 1;
                else if (ach.progress && ach.progress.current > 0) inProgress += 1;
            });
            if (unlocked === 0 && inProgress === 0) return -1;
            return unlocked * 10 + inProgress * 5 + unlocked + inProgress;
        }

        function ProgressTab({ firstDay }) {
            const stats = HEYS.game?.getStats?.() || { level: 1, totalXP: 0, title: {}, progress: { percent: 0, current: 0, required: 0, isMax: false } };
            const progress = stats.progress || {};
            const isMax = progress.isMax === true;
            const streakDetails = safeGetStreakDetails();
            const streak = safeGetStreak();
            const dailyMissions = HEYS.game?.getDailyMissions?.() || null;
            const missions = dailyMissions?.missions || [];
            const firstMission = missions[0];

            const streakLine = streakDetails.yesterdayForgiven
                ? FORGIVEN_HINT
                : (streak > 0 ? `${streak} дней подряд` : STREAK_CORRIDOR_HINT);

            if (firstDay && firstMission) {
                const pct = missionProgressPct(firstMission);
                return React.createElement('div', { className: 'game-v4-sheet__panel' },
                    React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--mission' },
                        React.createElement('div', { className: 'game-v4-sheet__hero-icon' }, firstMission.completed ? '✅' : (firstMission.icon || '🎯')),
                        React.createElement('div', { className: 'game-v4-sheet__hero-body' },
                            React.createElement('div', { className: 'game-v4-sheet__hero-title' }, firstMission.name || firstMission.id),
                            React.createElement('div', { className: 'game-v4-sheet__hero-sub' }, firstMission.desc || ''),
                            !firstMission.completed && React.createElement('div', { className: 'game-v4-sheet__mission-bar' },
                                React.createElement('div', {
                                    className: 'game-v4-sheet__mission-bar-fill',
                                    style: { width: `${pct}%` }
                                })
                            ),
                            React.createElement('div', { className: 'game-v4-sheet__hero-meta' },
                                `${pct}% · +${firstMission.xp || 0} XP`
                            )
                        )
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__level-line' },
                        `${stats.title?.icon || ''} Уровень ${stats.level} · ${stats.title?.title || ''}`
                    ),
                    missions.length > 1 && React.createElement('div', { className: 'game-v4-sheet__section' },
                        React.createElement('div', { className: 'game-v4-sheet__section-title' }, 'Миссии дня'),
                        React.createElement('div', { className: 'game-v4-sheet__missions' },
                            missions.slice(1).map((m, i) => {
                                const pctM = missionProgressPct(m);
                                return React.createElement('div', {
                                    key: m.id || i,
                                    className: `game-v4-sheet__mission-row${m.completed ? ' is-done' : ''}`
                                },
                                    React.createElement('span', { className: 'game-v4-sheet__mission-icon' }, m.completed ? '✅' : (m.icon || '⚪')),
                                    React.createElement('div', { className: 'game-v4-sheet__mission-text' },
                                        React.createElement('div', { className: 'game-v4-sheet__mission-name' }, m.name || m.id),
                                        React.createElement('div', { className: 'game-v4-sheet__mission-sub' },
                                            `${pctM}% · +${m.xp || 0} XP`
                                        )
                                    )
                                );
                            })
                        )
                    )
                );
            }

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--streak' },
                    React.createElement('div', { className: 'game-v4-sheet__streak-num' }, streak),
                    React.createElement('div', { className: 'game-v4-sheet__hero-body' },
                        React.createElement('div', { className: 'game-v4-sheet__hero-title' }, 'Серия дней'),
                        React.createElement('div', { className: 'game-v4-sheet__hero-sub' }, streakLine)
                    )
                ),
                missions.length > 0 && React.createElement('div', { className: 'game-v4-sheet__section' },
                    React.createElement('div', { className: 'game-v4-sheet__section-title' }, 'Миссии дня'),
                    React.createElement('div', { className: 'game-v4-sheet__missions' },
                        missions.map((m, i) => {
                            const pctM = missionProgressPct(m);
                            const progressText = missionProgressText(m);
                            return React.createElement('div', {
                                key: m.id || i,
                                className: `game-v4-sheet__mission-row${m.completed ? ' is-done' : ''}`
                            },
                                React.createElement('span', { className: 'game-v4-sheet__mission-icon' }, m.completed ? '✅' : (m.icon || '⚪')),
                                React.createElement('div', { className: 'game-v4-sheet__mission-text' },
                                    React.createElement('div', { className: 'game-v4-sheet__mission-name' }, m.name || m.id),
                                    !m.completed && React.createElement('div', { className: 'game-v4-sheet__mission-bar' },
                                        React.createElement('div', {
                                            className: 'game-v4-sheet__mission-bar-fill',
                                            style: { width: `${pctM}%` }
                                        })
                                    ),
                                    React.createElement('div', { className: 'game-v4-sheet__mission-sub' },
                                        progressText ? `${progressText} · ` : '',
                                        `+${m.xp || 0} XP`
                                    )
                                )
                            );
                        })
                    )
                ),
                React.createElement('div', { className: 'game-v4-sheet__level-block' },
                    React.createElement('div', { className: 'game-v4-sheet__level-head' },
                        React.createElement('span', { className: 'game-v4-sheet__level-title' },
                            `${stats.title?.icon || ''} ${stats.title?.title || ''} · ур. ${stats.level}`
                        ),
                        isMax
                            ? React.createElement('span', { className: 'game-v4-sheet__level-hint' },
                                `максимальный уровень · ${stats.totalXP} XP`
                            )
                            : React.createElement('span', { className: 'game-v4-sheet__level-hint' },
                                `${progress.required - progress.current} XP до ур. ${stats.level + 1}`
                            )
                    ),
                    !isMax && React.createElement('div', { className: 'game-v4-sheet__level-bar' },
                        React.createElement('div', {
                            className: 'game-v4-sheet__level-bar-fill',
                            style: { width: `${progress.percent || 0}%` }
                        })
                    )
                )
            );
        }

        function AchievementsTab({ firstDay }) {
            const [expandedAll, setExpandedAll] = useState(false);
            const achievements = HEYS.game?.getAchievements?.() || [];
            const categories = HEYS.game?.getAchievementCategories?.() || [];
            const achievementsById = useMemo(() => {
                const map = {};
                achievements.forEach((a) => { map[a.id] = a; });
                return map;
            }, [achievements]);

            const visibleCategories = useMemo(() => {
                let cats = categories;
                if (firstDay) {
                    cats = cats.filter((c) => c.id === 'onboarding');
                }
                return cats
                    .map((cat) => ({ cat, score: categoryActivityScore(cat, achievementsById) }))
                    .filter((row) => row.score >= 0)
                    .sort((a, b) => b.score - a.score)
                    .map((row) => row.cat);
            }, [categories, achievementsById, firstDay]);

            const VISIBLE_INITIAL = 2;
            const hiddenCount = expandedAll ? 0 : Math.max(0, visibleCategories.length - VISIBLE_INITIAL);
            const shownCategories = expandedAll
                ? visibleCategories
                : visibleCategories.slice(0, VISIBLE_INITIAL);

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                shownCategories.map((cat) =>
                    React.createElement('div', { key: cat.id, className: 'game-v4-sheet__ach-cat' },
                        React.createElement('div', { className: 'game-v4-sheet__ach-cat-title' }, cat.name),
                        React.createElement('div', { className: 'game-v4-sheet__ach-list' },
                            (cat.achievements || []).map((achId) => {
                                const ach = achievementsById[achId] || HEYS.game?.ACHIEVEMENTS?.[achId];
                                if (!ach) return null;
                                const unlocked = ach.unlocked || HEYS.game?.isAchievementUnlocked?.(achId);
                                const progress = ach.progress;
                                const progressPct = progress && progress.target
                                    ? Math.min(100, Math.round((progress.current / progress.target) * 100))
                                    : 0;
                                return React.createElement('div', {
                                    key: achId,
                                    className: `game-v4-sheet__ach-row${unlocked ? ' is-unlocked' : ''}`
                                },
                                    React.createElement('span', { className: 'game-v4-sheet__ach-icon' }, unlocked ? ach.icon : '🔒'),
                                    React.createElement('div', { className: 'game-v4-sheet__ach-body' },
                                        React.createElement('div', { className: 'game-v4-sheet__ach-name' }, ach.name),
                                        React.createElement('div', { className: 'game-v4-sheet__ach-desc' }, ach.desc),
                                        !unlocked && progressPct > 0 && React.createElement('div', { className: 'game-v4-sheet__ach-progress' },
                                            `${progressPct}% (${progress.current}/${progress.target})`
                                        ),
                                        React.createElement('div', { className: 'game-v4-sheet__ach-meta' },
                                            `+${ach.xp} XP · ${ach.rarity}`
                                        )
                                    )
                                );
                            })
                        )
                    )
                ),
                hiddenCount > 0 && React.createElement('button', {
                    type: 'button',
                    className: 'game-v4-sheet__more-groups',
                    onClick: () => setExpandedAll(true)
                }, `ещё ${hiddenCount} групп`)
            );
        }

        function LevelsTab() {
            const stats = HEYS.game?.getStats?.() || { level: 1, totalXP: 0, title: {} };
            const progress = stats.progress || HEYS.game?.getProgress?.() || {};
            const isMax = progress.isMax === true;
            const streak = safeGetStreak();
            const streakMult = HEYS.game?.getXPMultiplier?.() || 1;
            const dailyMult = HEYS.game?.getDailyMultiplier?.() || { multiplier: 1, actions: 0 };
            const streakReason = buildStreakMultiplierReason(streak, streakMult);
            const dailyReason = buildDailyMultiplierReason(dailyMult);

            const neighborLevels = useMemo(() => {
                const level = stats.level || 1;
                const levels = [];
                if (level > 1) levels.push(level - 1);
                levels.push(level);
                if (!isMax && level < 25) levels.push(level + 1);
                return levels;
            }, [stats.level, isMax]);

            const xpActions = HEYS.game?.XP_ACTIONS || {};
            const breakdownItems = HEYS.game?.getXPBreakdown?.()?.items || [];
            const countMap = {};
            breakdownItems.forEach((item) => { countMap[item.reason] = item.count; });

            const xpRows = XP_TABLE_ORDER.filter((key) => xpActions[key]);

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                React.createElement('div', { className: 'game-v4-sheet__section' },
                    React.createElement('div', { className: 'game-v4-sheet__section-title' }, 'Ступени уровня'),
                    React.createElement('div', { className: 'game-v4-sheet__level-steps' },
                        neighborLevels.map((lvl) => {
                            const t = titleForLevel(lvl);
                            const isCurrent = lvl === stats.level;
                            return React.createElement('div', {
                                key: lvl,
                                className: `game-v4-sheet__level-step${isCurrent ? ' is-current' : ''}`
                            },
                                React.createElement('span', { className: 'game-v4-sheet__level-step-num' }, `ур. ${lvl}`),
                                React.createElement('span', { className: 'game-v4-sheet__level-step-title' },
                                    `${t.icon || ''} ${t.title || ''}`
                                )
                            );
                        })
                    )
                ),
                (streakReason || dailyReason) && React.createElement('div', { className: 'game-v4-sheet__multipliers' },
                    streakReason && React.createElement('div', { className: 'game-v4-sheet__mult-row' },
                        'Множитель серии: ', streakReason
                    ),
                    dailyReason && React.createElement('div', { className: 'game-v4-sheet__mult-row' },
                        'Множитель дня: ', dailyReason
                    )
                ),
                React.createElement('div', { className: 'game-v4-sheet__section' },
                    React.createElement('div', { className: 'game-v4-sheet__section-title' }, 'Источники XP сегодня'),
                    React.createElement('table', { className: 'game-v4-sheet__xp-table' },
                        React.createElement('tbody', null,
                            xpRows.map((key) => {
                                const action = xpActions[key];
                                const used = countMap[key] || 0;
                                const max = action.maxPerDay || 0;
                                return React.createElement('tr', { key: key },
                                    React.createElement('td', { className: 'game-v4-sheet__xp-label' }, action.label),
                                    React.createElement('td', { className: 'game-v4-sheet__xp-value' }, `+${action.xp}`),
                                    React.createElement('td', { className: 'game-v4-sheet__xp-limit' },
                                        max ? `${used} из ${max}` : '—'
                                    )
                                );
                            })
                        )
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__xp-footnote' }, XP_FOOTNOTE)
                )
            );
        }

        function GamificationSheet({ onClose, initialTab }) {
            const firstDay = isFirstDayBranch();
            const defaultTab = initialTab || TAB_PROGRESS;
            const [tab, setTab] = useState(defaultTab);
            const [, bump] = useState(0);

            const refresh = useCallback(() => bump((n) => n + 1), []);

            useEffect(() => {
                const handlers = [
                    ['heysGameUpdate', refresh],
                    ['heysDailyMissionsUpdate', refresh],
                    ['heysDayStreakUpdated', refresh],
                    ['heysDailyMultiplierUpdate', refresh]
                ];
                handlers.forEach(([name, fn]) => window.addEventListener(name, fn));
                return () => handlers.forEach(([name, fn]) => window.removeEventListener(name, fn));
            }, [refresh]);

            useEffect(() => {
                if (firstDay && tab === TAB_LEVELS) setTab(TAB_PROGRESS);
            }, [firstDay, tab]);

            const tabs = [
                { id: TAB_PROGRESS, label: 'Прогресс' },
                { id: TAB_ACHIEVEMENTS, label: 'Достижения' }
            ];
            if (!firstDay) tabs.push({ id: TAB_LEVELS, label: 'Уровни' });

            return React.createElement('div', { className: 'game-v4-sheet' },
                React.createElement('div', { className: 'game-v4-sheet__header' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'game-v4-sheet__back',
                        onClick: onClose,
                        'aria-label': 'Закрыть'
                    }, '←'),
                    React.createElement('div', { className: 'game-v4-sheet__header-title' }, 'Прогресс')
                ),
                React.createElement('div', { className: 'game-v4-sheet__tabs', role: 'tablist' },
                    tabs.map((t) =>
                        React.createElement('button', {
                            key: t.id,
                            type: 'button',
                            role: 'tab',
                            className: `game-v4-sheet__tab${tab === t.id ? ' is-active' : ''}`,
                            'aria-selected': tab === t.id,
                            onClick: () => setTab(t.id)
                        }, t.label)
                    )
                ),
                tab === TAB_PROGRESS && React.createElement(ProgressTab, { firstDay }),
                tab === TAB_ACHIEVEMENTS && React.createElement(AchievementsTab, { firstDay }),
                tab === TAB_LEVELS && !firstDay && React.createElement(LevelsTab)
            );
        }

        return { GamificationSheet, TAB_PROGRESS, TAB_ACHIEVEMENTS, TAB_LEVELS };
    })();
})();
