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

        // Display-only mirror of LEVEL_THRESHOLDS in heys_gamification_v1.js (ladder labels)
        const LEVEL_XP_THRESHOLDS = [
            0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200, 6500, 8000,
            10000, 12500, 15500, 19000, 23000, 27500, 32500, 38000, 44000,
            51000, 59000, 68000, 78000
        ];

        const ACH_CAT_LABELS = {
            streak: 'Серия',
            onboarding: 'Первые шаги',
            advice: 'Советы',
            quality: 'Качество дня',
            activity: 'Вода и активность',
            levels: 'Уровни',
            habits: 'Привычки',
            metabolic: 'Метаболизм'
        };

        const RARITY_LABELS = {
            common: 'обычное',
            rare: 'редкое',
            epic: 'эпическое',
            legendary: 'легендарное',
            mythic: 'мифическое'
        };

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

        function formatXp(n) {
            const v = Number(n) || 0;
            return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
        }

        function isFirstDayBranch() {
            const details = safeGetStreakDetails();
            const streak = details.count || safeGetStreak();
            if (streak > 0) return false;
            const stats = HEYS.game?.getStats?.() || {};
            const level = stats.level || 1;
            const unlocked = stats.unlockedCount || 0;
            return level <= 2 && unlocked < 3;
        }

        function titleForLevel(level) {
            const titles = HEYS.game?.LEVEL_TITLES || [];
            for (let i = 0; i < titles.length; i++) {
                const t = titles[i];
                if (level >= t.min && level <= t.max) return t;
            }
            return titles[titles.length - 1] || { title: '', icon: '', color: '' };
        }

        function missionCategoryLabel(mission) {
            const meta = HEYS.missions?.CATEGORY_META?.[mission?.category];
            return meta?.label || mission?.category || '';
        }

        function missionProgressPct(m) {
            if (!m || m.completed) return 100;
            if (m.target > 0) return Math.min(100, Math.round((m.progress / m.target) * 100));
            return 0;
        }

        function missionProgressText(m) {
            const pct = missionProgressPct(m);
            if (!m || m.completed) return `${pct} %`;
            if (m.target > 1) {
                if (m.type === 'water' || m.type === 'kcal' || m.type === 'fiber' ||
                    m.type === 'protein' || m.type === 'complex_carbs' || m.type === 'harm') {
                    return `${pct} %`;
                }
                return `${m.progress || 0}/${m.target}`;
            }
            return `${pct} %`;
        }

        function missionSubtitle(m) {
            const parts = [];
            if (m.desc) parts.push(m.desc);
            const cat = missionCategoryLabel(m);
            if (cat) parts.push(cat);
            return parts.join(' · ');
        }

        /** Остаток до выполнения: по нему контракт упорядочивает закрытые. */
        function remainingOf(ach) {
            const p = ach && ach.progress;
            if (!p || !(p.target > 0)) return Number.POSITIVE_INFINITY;
            return Math.max(0, p.target - (p.current || 0));
        }

        /**
         * Порядок внутри группы: сначала открытые в порядке каталога, затем
         * закрытые по остатку до выполнения (строка «порядок закрытых»).
         */
        function orderAchievements(cat, achievementsById) {
            const ids = cat.achievements || [];
            const isOpen = (id) => {
                const ach = achievementsById[id];
                return !!(ach && ach.unlocked) || !!HEYS.game?.isAchievementUnlocked?.(id);
            };
            const opened = ids.filter(isOpen);
            const locked = ids.filter((id) => !isOpen(id))
                .sort((a, b) => remainingOf(achievementsById[a]) - remainingOf(achievementsById[b]));
            return [...opened, ...locked];
        }

        function remainingSort(list) {
            return [...list].sort((a, b) => remainingOf(a) - remainingOf(b));
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
            // Строка «пустых групп нет»: группа появляется при первом открытом в
            // ней — не «0 из 5» серым, а отсутствие. Один только прогресс её не
            // показывает.
            if (unlocked === 0) return -1;
            // Строка «порядок групп»: наверх та, где сейчас идёт продвижение.
            // Поэтому вес несёт незакрытое в работе, а не число закрытых —
            // иначе полностью пройденная группа встаёт первой, чего контракт
            // прямо не хочет.
            return inProgress * 10 + unlocked;
        }

        function countCategoryStats(cat, achievementsById) {
            let unlocked = 0;
            const total = (cat.achievements || []).length;
            (cat.achievements || []).forEach((achId) => {
                const ach = achievementsById[achId];
                if (ach?.unlocked || HEYS.game?.isAchievementUnlocked?.(achId)) unlocked += 1;
            });
            return { unlocked, total };
        }

        function buildStreakMultiplierReason(streak, multiplier) {
            if (multiplier <= 1) return '';
            if (streak >= 14) return `серия ×${multiplier}`;
            if (streak >= 7) return `серия ×${multiplier}`;
            if (streak >= 3) return `серия ×${multiplier}`;
            return `серия ×${multiplier}`;
        }

        function buildDailyMultiplierReason(info) {
            if (!info || info.multiplier <= 1) return '';
            const actions = info.actions || 0;
            const next = info.nextThreshold != null && info.nextMultiplier != null
                ? ` через ${Math.max(0, info.nextThreshold - actions)} действ.`
                : '';
            return `${actions} действий ×${info.multiplier}${next}`;
        }

        function xpRowStatus(used, max) {
            if (!max) return '—';
            if (used >= max) {
                return max === 1 ? 'сделано' : `${used} из ${max}, лимит исчерпан`;
            }
            if (used === 0) return 'ещё нет';
            return `${used} из ${max} за сегодня`;
        }

        function renderMissionCard(m, i) {
            const pct = missionProgressPct(m);
            const done = !!m.completed;
            return React.createElement('div', {
                key: m.id || i,
                className: `game-v4-sheet__card game-v4-sheet__mission-card${done ? ' is-done' : ''}`
            },
                React.createElement('div', { className: 'game-v4-sheet__card-head' },
                    React.createElement('span', { className: 'game-v4-sheet__card-title' }, m.name || m.id),
                    React.createElement('span', { className: 'game-v4-sheet__card-xp' }, `+${m.xp || 0} XP`)
                ),
                missionSubtitle(m) && React.createElement('div', { className: 'game-v4-sheet__card-sub' }, missionSubtitle(m)),
                React.createElement('div', { className: 'game-v4-sheet__bar' },
                    React.createElement('div', {
                        className: `game-v4-sheet__bar-fill${done ? ' is-complete' : ''}`,
                        style: { width: `${pct}%` }
                    })
                ),
                React.createElement('div', { className: 'game-v4-sheet__card-meta' }, missionProgressText(m))
            );
        }

        function renderStreakBars(streakCount, yesterdayForgiven) {
            const barCount = 7;
            const bars = [];
            for (let i = 0; i < barCount; i++) {
                let cls = 'game-v4-sheet__streak-bar';
                if (i < streakCount) cls += ' is-earned';
                else if (yesterdayForgiven && i === streakCount) cls += ' is-forgiven';
                else if (i === streakCount + (yesterdayForgiven ? 1 : 0)) cls += ' is-today';
                bars.push(React.createElement('span', { key: i, className: cls }));
            }
            const captionLeft = yesterdayForgiven && streakCount > 0
                ? `${streakCount} заработанных · вчера прощено`
                : streakCount > 0
                    ? `${streakCount} заработанных`
                    : '';
            return React.createElement('div', { className: 'game-v4-sheet__streak-bars' },
                React.createElement('div', { className: 'game-v4-sheet__streak-bar-row' }, bars),
                captionLeft && React.createElement('div', { className: 'game-v4-sheet__streak-bar-caption' }, captionLeft)
            );
        }

        function renderLevelFloor(stats, progress, isMax) {
            const nextLevel = stats.level + 1;
            const xpToNext = isMax ? 0 : Math.max(0, progress.required - progress.current);
            return React.createElement('div', { className: 'game-v4-sheet__level-floor' },
                React.createElement('div', { className: 'game-v4-sheet__level-floor-head' },
                    React.createElement('span', null,
                        `${stats.level} · ${stats.title?.title || ''}`
                    ),
                    isMax
                        ? React.createElement('span', { className: 'game-v4-sheet__level-floor-hint' },
                            `максимальный уровень · ${formatXp(stats.totalXP)} XP`
                        )
                        : React.createElement('span', { className: 'game-v4-sheet__level-floor-hint' },
                            `до ${nextLevel}-го ${formatXp(xpToNext)}`
                        )
                ),
                !isMax && React.createElement('div', { className: 'game-v4-sheet__bar game-v4-sheet__bar--thin' },
                    React.createElement('div', {
                        className: 'game-v4-sheet__bar-fill',
                        style: { width: `${progress.percent || 0}%` }
                    })
                ),
                !isMax && React.createElement('div', { className: 'game-v4-sheet__level-floor-xp' },
                    `${formatXp(stats.totalXP)} из ${formatXp(progress.required + (stats.totalXP - progress.current))} XP`
                )
            );
        }

        function renderOnboardingAchievements(achievementsById) {
            const cat = (HEYS.game?.getAchievementCategories?.() || []).find((c) => c.id === 'onboarding');
            if (!cat) return null;
            const { unlocked, total } = countCategoryStats(cat, achievementsById);
            return React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'game-v4-sheet__tier' },
                    `Первые шаги · ${unlocked} из ${total}`
                ),
                React.createElement('div', { className: 'game-v4-sheet__list-card' },
                    (cat.achievements || []).map((achId) => {
                        const ach = achievementsById[achId] || HEYS.game?.ACHIEVEMENTS?.[achId];
                        if (!ach) return null;
                        const unlockedAch = ach.unlocked || HEYS.game?.isAchievementUnlocked?.(achId);
                        return React.createElement('div', {
                            key: achId,
                            className: `game-v4-sheet__list-row${unlockedAch ? ' is-unlocked' : ' is-locked'}`
                        },
                            React.createElement('span', { className: 'game-v4-sheet__list-icon' }, unlockedAch ? '✓' : '🔒'),
                            React.createElement('div', { className: 'game-v4-sheet__list-body' },
                                React.createElement('div', { className: 'game-v4-sheet__list-title' }, ach.name),
                                React.createElement('div', { className: 'game-v4-sheet__list-sub' }, ach.desc)
                            )
                        );
                    })
                ),
                React.createElement('div', { className: 'game-v4-sheet__footnote' },
                    'Остальные группы появятся, когда в них будет что показать.'
                )
            );
        }

        function ProgressTab({ firstDay }) {
            const stats = HEYS.game?.getStats?.() || {
                level: 1, totalXP: 0, title: {},
                progress: { percent: 0, current: 0, required: 0, isMax: false }
            };
            const progress = stats.progress || {};
            const isMax = progress.isMax === true;
            const streakDetails = safeGetStreakDetails();
            const streakCount = streakDetails.count ?? safeGetStreak();
            const dailyMissions = HEYS.game?.getDailyMissions?.() || null;
            const missions = dailyMissions?.missions || [];
            const firstMission = missions[0];
            const achievements = HEYS.game?.getAchievements?.() || [];
            const achievementsById = useMemo(() => {
                const map = {};
                achievements.forEach((a) => { map[a.id] = a; });
                return map;
            }, [achievements]);

            if (firstDay && firstMission) {
                const pct = missionProgressPct(firstMission);
                return React.createElement('div', { className: 'game-v4-sheet__panel' },
                    React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--cream' },
                        React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Первая миссия'),
                        React.createElement('div', { className: 'game-v4-sheet__hero-mission-title' }, firstMission.name || firstMission.id),
                        missionSubtitle(firstMission) && React.createElement('div', { className: 'game-v4-sheet__hero-muted' },
                            `${missionSubtitle(firstMission)} · +${firstMission.xp || 0} XP`
                        ),
                        React.createElement('div', { className: 'game-v4-sheet__bar game-v4-sheet__bar--hero' },
                            React.createElement('div', {
                                className: 'game-v4-sheet__bar-fill',
                                style: { width: `${pct}%` }
                            })
                        ),
                        React.createElement('div', { className: 'game-v4-sheet__card-meta' },
                            firstMission.target > 1 && !firstMission.completed
                                ? `${firstMission.progress || 0} из ${firstMission.target}`
                                : `${pct} %`
                        )
                    ),
                    missions.length > 1 && React.createElement(React.Fragment, null,
                        React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Ещё сегодня'),
                        missions.slice(1).map((m, i) => renderMissionCard(m, i + 1))
                    ),
                    renderOnboardingAchievements(achievementsById),
                    React.createElement('div', { className: 'game-v4-sheet__level-line' },
                        React.createElement('span', null, `Уровень ${stats.level} · ${formatXp(stats.totalXP)} XP`),
                        !isMax && React.createElement('span', { className: 'game-v4-sheet__level-line-hint' },
                            `до ${stats.level + 1}-го ${formatXp(Math.max(0, progress.required - progress.current))}`
                        )
                    )
                );
            }

            const showForgiveness = streakDetails.yesterdayForgiven && streakCount > 0;

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--cream' },
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Серия'),
                    React.createElement('div', { className: 'game-v4-sheet__hero-metric' },
                        React.createElement('span', { className: 'game-v4-sheet__hero-num' }, streakCount),
                        React.createElement('span', { className: 'game-v4-sheet__hero-unit' }, 'дней')
                    ),
                    showForgiveness && React.createElement('div', { className: 'game-v4-sheet__hero-accent' }, FORGIVEN_HINT),
                    React.createElement('div', { className: 'game-v4-sheet__hero-muted' }, STREAK_CORRIDOR_HINT),
                    streakCount > 0 && renderStreakBars(streakCount, streakDetails.yesterdayForgiven)
                ),
                missions.length > 0 && React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Миссии дня'),
                    missions.map((m, i) => renderMissionCard(m, i))
                ),
                React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Уровень'),
                renderLevelFloor(stats, progress, isMax)
            );
        }

        function renderNearAchievement(ach) {
            const progress = ach.progress;
            const target = progress?.target || 0;
            const current = progress?.current || 0;
            const slots = Math.min(7, target || 7);
            const bars = [];
            for (let i = 0; i < slots; i++) {
                bars.push(React.createElement('span', {
                    key: i,
                    className: `game-v4-sheet__streak-bar${i < current ? ' is-earned is-ok' : ''}`
                }));
            }
            const remain = target > current ? target - current : 0;
            const remainText = remain === 1 ? 'Остался один день' : remain === 2 ? 'Осталось два дня' : `${current} из ${target} дней`;
            return React.createElement('div', { className: 'game-v4-sheet__card game-v4-sheet__near-card' },
                React.createElement('div', { className: 'game-v4-sheet__card-head' },
                    React.createElement('span', { className: 'game-v4-sheet__card-title' }, ach.name),
                    React.createElement('span', { className: 'game-v4-sheet__card-xp game-v4-sheet__card-xp--ok' }, `+${ach.xp} XP`)
                ),
                React.createElement('div', { className: 'game-v4-sheet__card-sub' }, ach.desc),
                target > 0 && React.createElement('div', { className: 'game-v4-sheet__streak-bar-row' }, bars),
                React.createElement('div', { className: 'game-v4-sheet__card-meta game-v4-sheet__card-meta--ok' },
                    target > 1 ? remainText : `${current} из ${target}`
                )
            );
        }

        function AchievementsTab({ firstDay }) {
            const [expandedAll, setExpandedAll] = useState(false);
            const stats = HEYS.game?.getStats?.() || { unlockedCount: 0, totalAchievements: 36 };
            const achievements = HEYS.game?.getAchievements?.() || [];
            const categories = HEYS.game?.getAchievementCategories?.() || [];
            // Строка «Ближе всего»: одно достижение с наименьшим остатком до
            // выполнения. Движок отдаёт список по проценту — процент и остаток
            // расходятся, когда цели разного размера: 9 из 10 ближе, чем 90 из 100.
            const nearList = remainingSort(HEYS.game?.getInProgressAchievements?.() || []).slice(0, 1);
            const achievementsById = useMemo(() => {
                const map = {};
                achievements.forEach((a) => { map[a.id] = a; });
                return map;
            }, [achievements]);

            const visibleCategories = useMemo(() => {
                let cats = categories;
                if (firstDay) {
                    cats = cats.filter((c) => c.id === 'onboarding');
                    return cats;
                }
                return cats
                    .map((cat) => ({ cat, score: categoryActivityScore(cat, achievementsById) }))
                    .filter((row) => row.score >= 0)
                    .sort((a, b) => b.score - a.score)
                    .map((row) => row.cat);
            }, [categories, achievementsById, firstDay]);

            // Строка «на экране»: три группы, остальные за строкой «ещё N групп».
            const VISIBLE_INITIAL = 3;
            const hiddenCount = expandedAll ? 0 : Math.max(0, visibleCategories.length - VISIBLE_INITIAL);
            const shownCategories = expandedAll
                ? visibleCategories
                : visibleCategories.slice(0, VISIBLE_INITIAL);

            const openedPct = stats.totalAchievements
                ? Math.round((stats.unlockedCount / stats.totalAchievements) * 100)
                : 0;

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                !firstDay && React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--cream' },
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Открыто'),
                    React.createElement('div', { className: 'game-v4-sheet__hero-metric' },
                        React.createElement('span', { className: 'game-v4-sheet__hero-num game-v4-sheet__hero-num--md' },
                            stats.unlockedCount
                        ),
                        React.createElement('span', { className: 'game-v4-sheet__hero-unit' },
                            `из ${stats.totalAchievements || 36}`
                        )
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__bar game-v4-sheet__bar--thin' },
                        React.createElement('div', {
                            className: 'game-v4-sheet__bar-fill',
                            style: { width: `${openedPct}%` }
                        })
                    )
                ),
                !firstDay && nearList.length > 0 && React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Ближе всего'),
                    nearList.map((ach) => React.createElement('div', { key: ach.id }, renderNearAchievement(ach)))
                ),
                shownCategories.map((cat) => {
                    const { unlocked, total } = countCategoryStats(cat, achievementsById);
                    const catLabel = ACH_CAT_LABELS[cat.id] || cat.name;
                    return React.createElement('div', { key: cat.id, className: 'game-v4-sheet__ach-cat' },
                        React.createElement('div', { className: 'game-v4-sheet__tier' },
                            `${catLabel} · ${unlocked} из ${total}`
                        ),
                        React.createElement('div', { className: 'game-v4-sheet__list-card' },
                            // Строка «порядок закрытых»: по остатку до выполнения, не по
                            // номеру в каталоге. Открытые идут первыми — они уже свершились.
                            orderAchievements(cat, achievementsById).map((achId) => {
                                const ach = achievementsById[achId] || HEYS.game?.ACHIEVEMENTS?.[achId];
                                if (!ach) return null;
                                const unlockedAch = ach.unlocked || HEYS.game?.isAchievementUnlocked?.(achId);
                                const progress = ach.progress;
                                const progressLine = !unlockedAch && progress && progress.target > 1
                                    ? ` · ${progress.current} из ${progress.target}`
                                    : '';
                                return React.createElement('div', {
                                    key: achId,
                                    className: `game-v4-sheet__list-row${unlockedAch ? ' is-unlocked' : ' is-locked'}`
                                },
                                    React.createElement('span', { className: 'game-v4-sheet__list-icon' }, unlockedAch ? '✓' : '🔒'),
                                    React.createElement('div', { className: 'game-v4-sheet__list-body' },
                                        React.createElement('div', { className: 'game-v4-sheet__list-title' }, ach.name),
                                        React.createElement('div', { className: 'game-v4-sheet__list-sub' },
                                            `${ach.desc || ''}${progressLine}`
                                        ),
                                        React.createElement('div', { className: 'game-v4-sheet__ach-rarity' },
                                            RARITY_LABELS[ach.rarity] || ach.rarity || ''
                                        )
                                    )
                                );
                            })
                        )
                    );
                }),
                hiddenCount > 0 && React.createElement('button', {
                    type: 'button',
                    className: 'game-v4-sheet__more-groups',
                    onClick: () => setExpandedAll(true)
                }, `Ещё ${hiddenCount} групп`)
            );
        }

        function buildLevelLadder(currentLevel, isMax) {
            const levels = new Set();
            for (let l = Math.max(1, currentLevel - 3); l <= Math.min(25, currentLevel + 2); l++) {
                levels.add(l);
            }
            if (currentLevel < 24) levels.add(25);
            levels.add(currentLevel);
            return Array.from(levels).sort((a, b) => a - b);
        }

        function LevelsTab() {
            const stats = HEYS.game?.getStats?.() || { level: 1, totalXP: 0, title: {} };
            const progress = stats.progress || HEYS.game?.getProgress?.() || {};
            const isMax = progress.isMax === true;
            const streak = safeGetStreak();
            const streakMult = HEYS.game?.getXPMultiplier?.() || 1;
            const dailyMult = HEYS.game?.getDailyMultiplier?.() || { multiplier: 1, actions: 0 };
            const combinedMult = Math.round(streakMult * dailyMult.multiplier * 10) / 10;
            const streakReason = buildStreakMultiplierReason(streak, streakMult);
            const dailyReason = buildDailyMultiplierReason(dailyMult);
            const nextLevel = stats.level + 1;
            const xpToNext = isMax ? 0 : Math.max(0, progress.required - progress.current);

            const ladderLevels = useMemo(
                () => buildLevelLadder(stats.level || 1, isMax),
                [stats.level, isMax]
            );

            const [xpTableExpanded, setXpTableExpanded] = useState(false);
            const xpActions = HEYS.game?.XP_ACTIONS || {};
            const breakdownItems = HEYS.game?.getXPBreakdown?.()?.items || [];
            const countMap = {};
            breakdownItems.forEach((item) => { countMap[item.reason] = item.count; });
            // Строка «длина таблицы»: восемь строк по убыванию номинала, остальные
            // раскрытием. Порядок берётся из номинала, а не из порядка каталога —
            // иначе сон и вес по 5 стоят выше чек-ина на 10.
            const xpRowsAll = XP_TABLE_ORDER
                .filter((key) => xpActions[key])
                .sort((a, b) => (xpActions[b].xp || 0) - (xpActions[a].xp || 0));
            const XP_ROWS_VISIBLE = 8;
            const xpHidden = Math.max(0, xpRowsAll.length - XP_ROWS_VISIBLE);
            const xpRows = xpTableExpanded ? xpRowsAll : xpRowsAll.slice(0, XP_ROWS_VISIBLE);

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--cream' },
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Уровень'),
                    React.createElement('div', { className: 'game-v4-sheet__hero-metric' },
                        React.createElement('span', { className: 'game-v4-sheet__hero-num' }, stats.level),
                        React.createElement('span', { className: 'game-v4-sheet__hero-unit' }, stats.title?.title || '')
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__bar game-v4-sheet__bar--thin' },
                        React.createElement('div', {
                            className: 'game-v4-sheet__bar-fill',
                            style: { width: `${isMax ? 100 : (progress.percent || 0)}%` }
                        })
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__level-hero-meta' },
                        React.createElement('span', null, `${formatXp(stats.totalXP)} XP`),
                        !isMax && React.createElement('span', null, `до ${nextLevel}-го ${formatXp(xpToNext)}`)
                    )
                ),
                React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Лестница'),
                React.createElement('div', { className: 'game-v4-sheet__list-card' },
                    ladderLevels.map((lvl) => {
                        const t = titleForLevel(lvl);
                        const isCurrent = lvl === stats.level;
                        const isPast = lvl < stats.level;
                        const threshold = LEVEL_XP_THRESHOLDS[lvl - 1] ?? 0;
                        return React.createElement('div', {
                            key: lvl,
                            className: `game-v4-sheet__ladder-row${isCurrent ? ' is-current' : ''}${!isPast && !isCurrent ? ' is-future' : ''}`
                        },
                            React.createElement('span', { className: 'game-v4-sheet__ladder-num' }, lvl),
                            React.createElement('span', { className: 'game-v4-sheet__ladder-title' },
                                `${t.title || ''}${isCurrent ? ' · сейчас' : lvl === 25 ? ' · последний' : ''}`
                            ),
                            React.createElement('span', { className: 'game-v4-sheet__ladder-xp' }, formatXp(threshold))
                        );
                    })
                ),
                (streakReason || dailyReason || combinedMult > 1) && React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Множитель'),
                    React.createElement('div', { className: 'game-v4-sheet__card game-v4-sheet__mult-card' },
                        React.createElement('div', { className: 'game-v4-sheet__card-head' },
                            React.createElement('span', { className: 'game-v4-sheet__card-title' },
                                combinedMult > 1 ? `Сейчас ×${combinedMult}` : 'Сейчас ×1'
                            ),
                            (streakReason || dailyReason) && React.createElement('span', { className: 'game-v4-sheet__card-xp game-v4-sheet__card-xp--ok' },
                                [streakReason, dailyReason].filter(Boolean).join(' · ')
                            )
                        ),
                        React.createElement('div', { className: 'game-v4-sheet__card-sub' },
                            'Множители серии и активности за день перемножаются — итоговая награда может быть выше номинала в таблице.'
                        )
                    )
                ),
                React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Откуда XP'),
                React.createElement('div', { className: 'game-v4-sheet__list-card game-v4-sheet__xp-card' },
                    xpRows.map((key) => {
                        const action = xpActions[key];
                        const used = countMap[key] || 0;
                        const max = action.maxPerDay || 0;
                        return React.createElement('div', { key: key, className: 'game-v4-sheet__xp-row' },
                            React.createElement('span', { className: 'game-v4-sheet__xp-label' }, action.label),
                            React.createElement('span', { className: 'game-v4-sheet__xp-value' },
                                `+${action.xp} · ${xpRowStatus(used, max)}`
                            )
                        );
                    })
                ),
                xpHidden > 0 && !xpTableExpanded && React.createElement('button', {
                    type: 'button',
                    className: 'game-v4-sheet__more-groups',
                    onClick: () => setXpTableExpanded(true)
                }, `Ещё ${xpHidden}`),
                React.createElement('div', { className: 'game-v4-sheet__footnote' }, XP_FOOTNOTE)
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
                    React.createElement('div', { className: 'game-v4-sheet__header-title' },
                        (tabs.find((t) => t.id === tab) || tabs[0]).label
                    )
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
