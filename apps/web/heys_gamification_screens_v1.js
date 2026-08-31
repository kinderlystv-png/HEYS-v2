// heys_gamification_screens_v1.js — v4 gamification sheet (Прогресс / Достижения / Уровни)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    HEYS.GamificationScreens = (function () {
        const React = window.React;
        const { useState, useEffect, useMemo, useCallback, useRef } = React;

        const TAB_PROGRESS = 'progress';
        const TAB_ACHIEVEMENTS = 'achievements';
        const TAB_LEVELS = 'levels';

        const STREAK_CORRIDOR_HINT = 'Держите калории в коридоре — серия продолжится';
        // Строка «строка состояния»: дословный текст контракта.
        const FORGIVEN_HINT = 'Вчера пропуск — серия сохранена, второй её прервёт';
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

        // ===== Новый уровень · «тихая минута» =====
        // Строка «ход по времени» канваса gamification.v4 (блок «Новый уровень ·
        // тихая минута»): 0 мс — всё, кроме карточки уровня, гаснет до 20 % за
        // 200 мс · 200–620 мс — число перекатывается · 300–1200 мс — вокруг
        // карточки рисуется линия от верхнего центра по часовой · 1200–1500 мс —
        // линия гаснет, экран возвращается к полной яркости. Всего 1,5 с.
        // Таблица — единственный источник этих чисел: CSS берёт их же.
        const CEREMONY_TIMELINE = {
            dimMs: 200,
            rollStartMs: 200,
            rollMs: 420,
            lineStartMs: 300,
            lineMs: 900,
            returnStartMs: 1200,
            returnMs: 300,
            totalMs: 1500
        };

        // Строка «вид линии»: обводка карточки героя изнутри — 1,4 px, радиус тот
        // же, что у карточки (26), концы скруглены. Штрих рисуется по центру
        // пути, поэтому путь отступает от края на половину толщины: внешний край
        // обводки ложится ровно на край карточки и не сдвигает её.
        const CEREMONY_LINE_WIDTH = 1.4;
        const CEREMONY_CARD_RADIUS = 26;

        function ceremonyRingBox(width, height) {
            const inset = CEREMONY_LINE_WIDTH / 2;
            const w = Math.max(0, width - inset * 2);
            const h = Math.max(0, height - inset * 2);
            const r = Math.max(0, Math.min(CEREMONY_CARD_RADIUS - inset, w / 2, h / 2));
            return { x: inset, y: inset, w, h, r };
        }

        /**
         * Путь обводки: один проход от верхнего центра по часовой стрелке,
         * второго круга нет. Собственный путь, а не <rect>, именно ради точки
         * старта — у прямоугольника SVG она в левом верхнем углу.
         */
        function buildCeremonyRingPath(width, height) {
            const { x, y, w, h, r } = ceremonyRingBox(width, height);
            const midX = x + w / 2;
            return [
                `M ${midX} ${y}`,
                `L ${x + w - r} ${y}`,
                `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
                `L ${x + w} ${y + h - r}`,
                `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
                `L ${x + r} ${y + h}`,
                `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
                `L ${x} ${y + r}`,
                `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
                `L ${midX} ${y}`
            ].join(' ');
        }

        /** Длина того же пути — она же и штрих, и начальный сдвиг штриха. */
        function ceremonyRingLength(width, height) {
            const { w, h, r } = ceremonyRingBox(width, height);
            return 2 * Math.max(0, w - 2 * r) + 2 * Math.max(0, h - 2 * r) + 2 * Math.PI * r;
        }

        function prefersReducedMotion() {
            try {
                return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            } catch (_) {
                return false;
            }
        }

        /**
         * Состояние тихой минуты.
         *
         * Строка «уменьшенное движение · тихая минута»: настройка снимает именно
         * движение, а не празднование — гашение и линия не проигрываются вовсе,
         * число меняется мгновенно, и момент остаётся в том, что число другое.
         * Поэтому при уменьшенном движении фаз нет ни одной, но экран «Уровни»
         * всё равно открывается — это делает вызывающая сторона.
         *
         * Строка «прерывание»: ушёл с экрана или в фон посреди минуты — она не
         * доигрывается и второй раз не показывается. Второго показа не бывает по
         * построению: движок отдаёт церемонию ровно один раз.
         */
        function useLevelCeremony(pending, onEnd, alive) {
            const [state, setState] = useState(null);
            const timersRef = useRef([]);
            const endRef = useRef(onEnd);
            endRef.current = onEnd;

            const clearTimers = useCallback(() => {
                timersRef.current.forEach((id) => clearTimeout(id));
                timersRef.current = [];
            }, []);

            const stop = useCallback(() => {
                clearTimers();
                setState(null);
                if (endRef.current) endRef.current();
            }, [clearTimers]);

            useEffect(() => {
                if (!pending) return undefined;
                if (prefersReducedMotion()) {
                    const id = setTimeout(() => { if (endRef.current) endRef.current(); }, 0);
                    return () => clearTimeout(id);
                }

                // Первый кадр карточка стоит нетронутой: иначе экран открылся бы
                // уже погасшим и «гаснет за 200 мс» не случилось бы вовсе.
                setState({ ...pending, phase: 'arm', rolled: false });
                let raf1 = 0;
                let raf2 = 0;
                const start = () => {
                    setState({ ...pending, phase: 'play', rolled: false });
                    timersRef.current = [
                        setTimeout(() => setState((s) => (s ? { ...s, rolled: true } : s)), CEREMONY_TIMELINE.rollStartMs),
                        setTimeout(() => setState((s) => (s ? { ...s, phase: 'return' } : s)), CEREMONY_TIMELINE.returnStartMs),
                        setTimeout(stop, CEREMONY_TIMELINE.totalMs)
                    ];
                };
                if (typeof window.requestAnimationFrame === 'function') {
                    raf1 = window.requestAnimationFrame(() => {
                        raf2 = window.requestAnimationFrame(start);
                    });
                } else {
                    start();
                }

                const onVisibility = () => {
                    if (document.hidden) stop();
                };
                document.addEventListener('visibilitychange', onVisibility);
                return () => {
                    document.removeEventListener('visibilitychange', onVisibility);
                    if (raf1 && window.cancelAnimationFrame) window.cancelAnimationFrame(raf1);
                    if (raf2 && window.cancelAnimationFrame) window.cancelAnimationFrame(raf2);
                    clearTimers();
                };
            }, [pending, stop, clearTimers]);

            // Ушёл с экрана (закрыл лист, переключил вкладку) — минута обрывается.
            useEffect(() => {
                if (!alive && state) stop();
            }, [alive, state, stop]);

            return state;
        }

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

        function pluralDays(n) {
            const abs = Math.abs(Number(n) || 0) % 100;
            const tail = abs % 10;
            if (abs > 10 && abs < 20) return 'дней';
            if (tail > 1 && tail < 5) return 'дня';
            if (tail === 1) return 'день';
            return 'дней';
        }

        // Строка «вид ряда дней»: правая подпись — сколько дней до ближайшей
        // награды за серию. Пороги — streak-достижения каталога (1/2/3/5/7).
        const STREAK_REWARD_STEPS = [1, 2, 3, 5, 7];

        function streakRewardCaption(streakCount) {
            const next = STREAK_REWARD_STEPS.find((step) => step > streakCount);
            if (!next) return '';
            return `до награды ${next - streakCount}`;
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
            const unlockedOrder = HEYS.game?.getData?.()?.unlockedAchievements || [];
            const isOpen = (id) => {
                const ach = achievementsById[id];
                return !!(ach && ach.unlocked) || !!HEYS.game?.isAchievementUnlocked?.(id);
            };
            const opened = ids.filter(isOpen).sort((a, b) => {
                const ai = unlockedOrder.indexOf(a);
                const bi = unlockedOrder.indexOf(b);
                if (ai < 0 && bi < 0) return 0;
                if (ai < 0) return 1;
                if (bi < 0) return -1;
                return ai - bi;
            });
            const locked = ids.filter((id) => !isOpen(id))
                .sort((a, b) => remainingOf(achievementsById[a]) - remainingOf(achievementsById[b]));
            return [...opened, ...locked];
        }

        /**
         * Строка «состав группы»: показываются все открытые и два ближайших
         * закрытых; дальние закрытые — по тапу на группу. Порядок уже задан
         * orderAchievements: сначала открытые, потом закрытые по остатку.
         */
        const LOCKED_VISIBLE = 2;

        function selectGroupAchievements(orderedIds, achievementsById, expanded) {
            if (expanded) return orderedIds;
            const out = [];
            let lockedShown = 0;
            orderedIds.forEach((id) => {
                const ach = achievementsById[id];
                const isOpen = !!(ach && ach.unlocked) || !!HEYS.game?.isAchievementUnlocked?.(id);
                if (isOpen) { out.push(id); return; }
                if (lockedShown < LOCKED_VISIBLE) {
                    out.push(id);
                    lockedShown += 1;
                }
            });
            return out;
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

        function formatMult(v) {
            return String(v).replace('.', ',');
        }

        // Ступени множителя серии — зеркало getXPMultiplier в heys_gamification_v1.js.
        const STREAK_MULT_STEPS = [
            { streak: 3, multiplier: 2 },
            { streak: 7, multiplier: 2.5 },
            { streak: 14, multiplier: 3 }
        ];

        function buildStreakMultiplierReason(streak, multiplier) {
            if (multiplier <= 1) return '';
            return `серия ×${formatMult(multiplier)}`;
        }

        function buildDailyMultiplierReason(info) {
            if (!info || info.multiplier <= 1) return '';
            const actions = info.actions || 0;
            return `${actions} действий ×${formatMult(info.multiplier)}`;
        }

        /**
         * Строка «множитель»: кроме значения и причины строка обязана называть,
         * что даст следующая ступень — по обеим осям произведения.
         */
        function buildMultiplierNextHint(streak, info) {
            const parts = [];
            const nextStreak = STREAK_MULT_STEPS.find((s) => s.streak > streak);
            if (nextStreak) {
                const days = nextStreak.streak - streak;
                parts.push(`ещё ${days} ${pluralDays(days)} серии — ×${formatMult(nextStreak.multiplier)}`);
            }
            if (info && info.nextThreshold != null && info.nextMultiplier != null) {
                const left = Math.max(0, info.nextThreshold - (info.actions || 0));
                parts.push(`ещё ${left} действ. за день — ×${formatMult(info.nextMultiplier)}`);
            }
            return parts.join(' · ');
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
                // Строка «доступность»: у каждого из семи сегментов своя подпись словом.
                let label = 'впереди';
                if (i < streakCount) { cls += ' is-earned'; label = 'заработан'; }
                else if (yesterdayForgiven && i === streakCount) { cls += ' is-forgiven'; label = 'прощён'; }
                else if (i === streakCount + (yesterdayForgiven ? 1 : 0)) cls += ' is-today';
                bars.push(React.createElement('span', {
                    key: i,
                    className: cls,
                    role: 'listitem',
                    'aria-label': label
                }));
            }
            const captionLeft = yesterdayForgiven && streakCount > 0
                ? `${streakCount} заработанных · вчера прощено`
                : streakCount > 0
                    ? `${streakCount} заработанных`
                    : '';
            // Строка «вид ряда дней»: слева состав серии, справа — сколько до награды.
            const captionRight = streakRewardCaption(streakCount);
            return React.createElement('div', { className: 'game-v4-sheet__streak-bars' },
                React.createElement('div', {
                    className: 'game-v4-sheet__streak-bar-row',
                    role: 'list',
                    'aria-label': 'Ряд дней серии'
                }, bars),
                (captionLeft || captionRight) && React.createElement('div', { className: 'game-v4-sheet__streak-bar-caption' },
                    React.createElement('span', null, captionLeft),
                    React.createElement('span', null, captionRight)
                )
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
            return React.createElement(React.Fragment, null,
                React.createElement(AchievementGroup, { cat, achievementsById, label: 'Первые шаги' }),
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

            // Строка «правило»: герой зависит от стажа, а не от того, первый это
            // день или сорванная серия давнего. Серия 0 — героем первая миссия дня,
            // серия > 0 — героем серия. Раскладка остального экрана по-прежнему
            // выбирается веткой первого дня (строка «первый день»).
            const heroMission = streakCount > 0 ? null : firstMission;
            const restMissions = heroMission ? missions.slice(1) : missions;
            const showForgiveness = streakDetails.yesterdayForgiven && streakCount > 0;

            let hero;
            if (heroMission) {
                const pct = missionProgressPct(heroMission);
                hero = React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--cream' },
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Первая миссия'),
                    React.createElement('div', { className: 'game-v4-sheet__hero-mission-title' }, heroMission.name || heroMission.id),
                    missionSubtitle(heroMission) && React.createElement('div', { className: 'game-v4-sheet__hero-muted' },
                        `${missionSubtitle(heroMission)} · +${heroMission.xp || 0} XP`
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__bar game-v4-sheet__bar--hero' },
                        React.createElement('div', {
                            className: 'game-v4-sheet__bar-fill',
                            style: { width: `${pct}%` }
                        })
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__card-meta' },
                        heroMission.target > 1 && !heroMission.completed
                            ? `${heroMission.progress || 0} из ${heroMission.target}`
                            : `${pct} %`
                    )
                );
            } else {
                hero = React.createElement('div', { className: 'game-v4-sheet__hero game-v4-sheet__hero--cream' },
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Серия'),
                    // Строка «доступность»: герой озвучивается одной фразой с состоянием словом.
                    React.createElement('div', {
                        className: 'game-v4-sheet__hero-metric',
                        role: 'img',
                        'aria-label': `серия ${streakCount} ${pluralDays(streakCount)}${showForgiveness ? ', вчера прощено' : ''}`
                    },
                        React.createElement('span', { className: 'game-v4-sheet__hero-num' }, streakCount),
                        React.createElement('span', { className: 'game-v4-sheet__hero-unit' }, 'дней')
                    ),
                    // Строка «строка состояния»: в обычном случае «5 дней подряд»,
                    // при израсходованном запасе — текст про прощённый день.
                    (showForgiveness || streakCount > 0) && React.createElement('div', { className: 'game-v4-sheet__hero-accent' },
                        showForgiveness ? FORGIVEN_HINT : `${streakCount} ${pluralDays(streakCount)} подряд`
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__hero-muted' }, STREAK_CORRIDOR_HINT),
                    streakCount > 0 && renderStreakBars(streakCount, streakDetails.yesterdayForgiven)
                );
            }

            if (firstDay) {
                return React.createElement('div', { className: 'game-v4-sheet__panel' },
                    hero,
                    restMissions.length > 0 && React.createElement(React.Fragment, null,
                        React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Ещё сегодня'),
                        restMissions.map((m, i) => renderMissionCard(m, i + 1))
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

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                hero,
                restMissions.length > 0 && React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'game-v4-sheet__tier' }, heroMission ? 'Ещё сегодня' : 'Миссии дня'),
                    restMissions.map((m, i) => renderMissionCard(m, i))
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
                    React.createElement('span', { className: 'game-v4-sheet__card-xp' }, `+${ach.xp} XP`)
                ),
                React.createElement('div', { className: 'game-v4-sheet__card-sub' }, ach.desc),
                target > 0 && React.createElement('div', { className: 'game-v4-sheet__streak-bar-row' }, bars),
                React.createElement('div', { className: 'game-v4-sheet__card-meta game-v4-sheet__card-meta--ok' },
                    target > 1 ? remainText : `${current} из ${target}`
                )
            );
        }

        /**
         * Медальон строки достижения. Достигнутое — галочка 16 px обводкой 3,2
         * на квадрате --gr-bg; недостигнутое — замок 15 px обводкой 2,5 на --c2.
         * Тон обводки берётся с медальона через currentColor, чтобы цвет жил
         * ролью в CSS, а не литералом в разметке.
         */
        function renderAchievementMark(unlockedAch) {
            const size = unlockedAch ? 16 : 15;
            return React.createElement('svg', {
                width: size,
                height: size,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: unlockedAch ? 3.2 : 2.5,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                'aria-hidden': 'true'
            }, unlockedAch
                ? React.createElement('path', { d: 'M5 13l4 4L19 7' })
                : React.createElement(React.Fragment, null,
                    React.createElement('rect', { x: 4, y: 10, width: 16, height: 11, rx: 2.5 }),
                    React.createElement('path', { d: 'M8 10V7a4 4 0 018 0v3' })
                )
            );
        }

        /**
         * Строка «вид строки достижения»: достижения списком — поля 13/0,
         * разделитель 1 px, медальон 34 радиусом 12 слева, название и награда
         * «+N XP» в одной строке, условие под ними.
         *
         * Отступление от кадров (контракт старше кадра): в кадрах у
         * недостигнутого награды нет, а название погашено до 50 %. Строка
         * контракта требует награду «у правого края» без оговорки про
         * достигнутость и прямо запрещает гашение («Гашения текста и дат в
         * строках нет») — иначе два недостигнутых нельзя сравнить по цене.
         */
        function renderAchievementRow(achId, ach, unlockedAch) {
            const progress = ach.progress;
            const progressLine = !unlockedAch && progress && progress.target > 1
                ? ` · ${progress.current} из ${progress.target}`
                : '';
            return React.createElement('div', {
                key: achId,
                className: `game-v4-sheet__ach-row${unlockedAch ? ' is-unlocked' : ' is-locked'}`
            },
                React.createElement('span', {
                    className: 'game-v4-sheet__ach-medal',
                    'aria-hidden': 'true'
                }, renderAchievementMark(unlockedAch)),
                React.createElement('span', { className: 'game-v4-sheet__ach-body' },
                    React.createElement('span', { className: 'game-v4-sheet__ach-head' },
                        React.createElement('span', { className: 'game-v4-sheet__ach-name' }, ach.name),
                        React.createElement('span', { className: 'game-v4-sheet__ach-xp' }, `+${ach.xp || 0} XP`)
                    ),
                    React.createElement('span', { className: 'game-v4-sheet__ach-cond' },
                        `${ach.desc || ''}${progressLine}`
                    )
                )
            );
        }

        /**
         * Группа достижений: заголовок + список строк. Строка «состав группы» —
         * все открытые и два ближайших закрытых, дальние закрытые по тапу на
         * заголовок группы.
         */
        function AchievementGroup({ cat, achievementsById, label }) {
            const [expanded, setExpanded] = useState(false);
            const { unlocked, total } = countCategoryStats(cat, achievementsById);
            // Строка «порядок закрытых»: по остатку до выполнения, не по номеру
            // в каталоге. Открытые идут первыми — они уже свершились.
            const orderedIds = orderAchievements(cat, achievementsById);
            const shownIds = selectGroupAchievements(orderedIds, achievementsById, expanded);
            const restCount = orderedIds.length - shownIds.length;
            const headText = `${label} · ${unlocked} из ${total}`;
            return React.createElement(React.Fragment, null,
                restCount > 0 || expanded
                    ? React.createElement('button', {
                        type: 'button',
                        className: 'game-v4-sheet__tier game-v4-sheet__tier--tap',
                        'aria-expanded': expanded,
                        onClick: () => setExpanded((v) => !v)
                    }, expanded ? headText : `${headText} · ещё ${restCount}`)
                    : React.createElement('div', { className: 'game-v4-sheet__tier' }, headText),
                React.createElement('div', { className: 'game-v4-sheet__ach-list' },
                    shownIds.map((achId) => {
                        const ach = achievementsById[achId] || HEYS.game?.ACHIEVEMENTS?.[achId];
                        if (!ach) return null;
                        const unlockedAch = ach.unlocked || HEYS.game?.isAchievementUnlocked?.(achId);
                        return renderAchievementRow(achId, ach, unlockedAch);
                    })
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
                    // Кадр «Достижения», элемент 06: ключ «Достигнуто». «Открыто»
                    // говорит о доступе, а достижение — о сделанном (строка
                    // «слова на экране»: названы делом человека).
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Достигнуто'),
                    // Строка «доступность»: герой — одна фраза, полоса — progressbar с «20 из 36».
                    React.createElement('div', {
                        className: 'game-v4-sheet__hero-metric',
                        role: 'img',
                        'aria-label': `достигнуто ${stats.unlockedCount} из ${stats.totalAchievements || 36}`
                    },
                        React.createElement('span', { className: 'game-v4-sheet__hero-num game-v4-sheet__hero-num--md' },
                            stats.unlockedCount
                        ),
                        React.createElement('span', { className: 'game-v4-sheet__hero-unit' },
                            `из ${stats.totalAchievements || 36}`
                        )
                    ),
                    React.createElement('div', {
                        className: 'game-v4-sheet__bar game-v4-sheet__bar--thin',
                        role: 'progressbar',
                        'aria-valuemin': 0,
                        'aria-valuemax': stats.totalAchievements || 36,
                        'aria-valuenow': stats.unlockedCount || 0,
                        'aria-valuetext': `${stats.unlockedCount || 0} из ${stats.totalAchievements || 36}`
                    },
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
                shownCategories.map((cat) => React.createElement('div', {
                    key: cat.id,
                    className: 'game-v4-sheet__ach-cat'
                },
                    React.createElement(AchievementGroup, {
                        cat,
                        achievementsById,
                        label: ACH_CAT_LABELS[cat.id] || cat.name
                    })
                )),
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

        function LevelsTab({ ceremony }) {
            const stats = HEYS.game?.getStats?.() || { level: 1, totalXP: 0, title: {} };
            const progress = stats.progress || HEYS.game?.getProgress?.() || {};
            const isMax = progress.isMax === true;
            const streak = safeGetStreak();
            const streakMult = HEYS.game?.getXPMultiplier?.() || 1;
            const dailyMult = HEYS.game?.getDailyMultiplier?.() || { multiplier: 1, actions: 0 };
            const combinedMult = Math.round(streakMult * dailyMult.multiplier * 10) / 10;
            const streakReason = buildStreakMultiplierReason(streak, streakMult);
            const dailyReason = buildDailyMultiplierReason(dailyMult);
            const multNextHint = buildMultiplierNextHint(streak, dailyMult);
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

            // ===== Тихая минута на карточке героя =====
            const heroRef = useRef(null);
            const [ringSize, setRingSize] = useState(null);
            const ceremonyOn = !!ceremony;
            useEffect(() => {
                if (!ceremonyOn) {
                    setRingSize(null);
                    return;
                }
                const el = heroRef.current;
                const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
                if (rect && rect.width > 0 && rect.height > 0) {
                    setRingSize({ w: rect.width, h: rect.height });
                }
            }, [ceremonyOn]);

            // До 200 мс на карточке ещё старый уровень: без этого «старое уходит
            // вверх» было бы нечему. Титул под числом сменяется вместе с ним и
            // без движения — строка «ход по времени».
            const showOld = ceremonyOn && !ceremony.rolled;
            const heroLevel = showOld ? ceremony.from : stats.level;
            const heroTitle = showOld ? (ceremony.fromTitle || '') : (stats.title?.title || '');
            const rolling = ceremonyOn && ceremony.rolled;
            // Строка «чего нет»: полоса прогресса не анимируется отдельно — она
            // просто начинается с новой ступени, когда экран вернулся. Пока
            // минута идёт, полоса стоит на прежней ступени.
            const heroPercent = ceremonyOn
                ? (ceremony.fromPercent || 0)
                : (isMax ? 100 : (progress.percent || 0));

            return React.createElement('div', { className: 'game-v4-sheet__panel' },
                React.createElement('div', {
                    ref: heroRef,
                    className: `game-v4-sheet__hero game-v4-sheet__hero--cream${ceremonyOn ? ' is-quiet-minute' : ''}`
                },
                    ceremonyOn && ringSize && ceremony.phase !== 'arm' && React.createElement('svg', {
                        className: `game-v4-sheet__hero-ring${ceremony.phase === 'return' ? ' is-fading' : ''}`,
                        viewBox: `0 0 ${ringSize.w} ${ringSize.h}`,
                        width: ringSize.w,
                        height: ringSize.h,
                        'aria-hidden': 'true',
                        focusable: 'false'
                    },
                        React.createElement('path', {
                            className: 'game-v4-sheet__hero-ring-path',
                            d: buildCeremonyRingPath(ringSize.w, ringSize.h),
                            style: { '--ring-len': ceremonyRingLength(ringSize.w, ringSize.h) }
                        })
                    ),
                    React.createElement('div', { className: 'game-v4-sheet__eyebrow' }, 'Уровень'),
                    // Строка «доступность»: герой озвучивается одной фразой —
                    // и во время минуты это уже новый уровень, а не старый.
                    React.createElement('div', {
                        className: 'game-v4-sheet__hero-metric',
                        role: 'img',
                        'aria-label': `уровень ${stats.level}${stats.title?.title ? `, ${stats.title.title}` : ''}`
                    },
                        rolling
                            ? React.createElement('span', { className: 'game-v4-sheet__hero-num game-v4-sheet__hero-num--roll' },
                                React.createElement('span', { className: 'game-v4-sheet__hero-num-out' }, ceremony.from),
                                React.createElement('span', { className: 'game-v4-sheet__hero-num-in' }, ceremony.to)
                            )
                            : React.createElement('span', { className: 'game-v4-sheet__hero-num' }, heroLevel),
                        React.createElement('span', { className: 'game-v4-sheet__hero-unit' }, heroTitle)
                    ),
                    React.createElement('div', {
                        className: 'game-v4-sheet__bar game-v4-sheet__bar--thin',
                        role: 'progressbar',
                        'aria-valuemin': 0,
                        'aria-valuemax': 100,
                        'aria-valuenow': isMax ? 100 : Math.round(progress.percent || 0),
                        'aria-valuetext': isMax ? 'максимальный уровень' : `до ${nextLevel}-го ${formatXp(xpToNext)} XP`
                    },
                        React.createElement('div', {
                            className: 'game-v4-sheet__bar-fill',
                            style: { width: `${heroPercent}%` }
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
                        // Строка «вид строки уровня в списке»: гаснут пройденные,
                        // текущий — чернилами с весом 700, будущие в обычном тоне.
                        return React.createElement('div', {
                            key: lvl,
                            className: `game-v4-sheet__ladder-row${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`
                        },
                            React.createElement('span', { className: 'game-v4-sheet__ladder-num' }, lvl),
                            React.createElement('span', { className: 'game-v4-sheet__ladder-title' },
                                `${t.title || ''}${isCurrent ? ' · сейчас' : lvl === 25 ? ' · последний' : ''}`
                            ),
                            React.createElement('span', { className: 'game-v4-sheet__ladder-xp' }, formatXp(threshold))
                        );
                    })
                ),
                React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Множитель'),
                    React.createElement('div', { className: 'game-v4-sheet__card game-v4-sheet__mult-card' },
                        React.createElement('div', { className: 'game-v4-sheet__card-head' },
                            React.createElement('span', { className: 'game-v4-sheet__card-title' },
                                `Сейчас ×${formatMult(combinedMult)}`
                            ),
                            (streakReason || dailyReason) && React.createElement('span', { className: 'game-v4-sheet__card-xp game-v4-sheet__card-xp--ok' },
                                [streakReason, dailyReason].filter(Boolean).join(' · ')
                            )
                        ),
                        React.createElement('div', { className: 'game-v4-sheet__card-sub' },
                            'Множители серии и активности за день перемножаются — итоговая награда может быть выше номинала в таблице.'
                        ),
                        // Строка «множитель»: что даст следующая ступень.
                        multNextHint && React.createElement('div', { className: 'game-v4-sheet__card-meta game-v4-sheet__card-meta--ok' },
                            `Дальше: ${multNextHint}`
                        )
                    )
                ),
                React.createElement('div', { className: 'game-v4-sheet__tier' }, 'Откуда XP'),
                React.createElement('div', { className: 'game-v4-sheet__list-card' },
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

        function GamificationSheet({ onClose, initialTab, levelCeremony, onLevelCeremonyEnd }) {
            const firstDay = isFirstDayBranch();
            const defaultTab = initialTab || TAB_PROGRESS;
            const [tab, setTab] = useState(defaultTab);
            const [, bump] = useState(0);

            // Тихая минута идёт на карточке героя, а она живёт на «Уровнях»:
            // новый уровень открывает лист именно там. Признак не сбрасывается,
            // пока лист открыт: иначе на первом дне человека выкинуло бы с
            // «Уровней» ровно в тот момент, когда число стало новым.
            const [hadCeremony, setHadCeremony] = useState(!!levelCeremony);
            useEffect(() => {
                if (!levelCeremony) return;
                setHadCeremony(true);
                setTab(TAB_LEVELS);
            }, [levelCeremony]);
            const ceremony = useLevelCeremony(levelCeremony, onLevelCeremonyEnd, tab === TAB_LEVELS);

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
                if (firstDay && tab === TAB_LEVELS && !hadCeremony) setTab(TAB_PROGRESS);
            }, [firstDay, tab, hadCeremony]);

            const tabs = [
                { id: TAB_PROGRESS, label: 'Прогресс' },
                { id: TAB_ACHIEVEMENTS, label: 'Достижения' }
            ];
            // Строка «когда играет»: минута положена каждому новому уровню, в том
            // числе второму, который случается ещё в первый день. Поэтому на
            // время церемонии «Уровни» доступны и в первой ветке.
            if (!firstDay || hadCeremony) tabs.push({ id: TAB_LEVELS, label: 'Уровни' });

            // Гашение и возврат — два разных класса: у возврата своя длительность
            // (300 мс против 200 мс), и переход должен быть объявлен на элементе
            // в тот момент, когда яркость уже возвращается.
            const quietClass = ceremony && ceremony.phase === 'play'
                ? ' is-quiet-minute'
                : ceremony && ceremony.phase === 'return'
                    ? ' is-quiet-minute-return'
                    : '';

            return React.createElement('div', { className: `game-v4-sheet${quietClass}` },
                React.createElement('div', { className: 'game-v4-sheet__header' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'game-v4-sheet__back',
                        onClick: onClose,
                        'aria-label': 'Закрыть'
                    },
                        // Все восемь кадров зоны рисуют здесь шеврон 17 px
                        // обводкой 2,75, а не знак «←»: у знака своя форма в
                        // каждой системе, и она не совпадает ни с одним кадром.
                        React.createElement('svg', {
                            width: 17,
                            height: 17,
                            viewBox: '0 0 24 24',
                            fill: 'none',
                            stroke: 'currentColor',
                            strokeWidth: 2.75,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            'aria-hidden': 'true'
                        }, React.createElement('path', { d: 'M15 18l-6-6 6-6' }))
                    ),
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
                tab === TAB_LEVELS && (!firstDay || hadCeremony) && React.createElement(LevelsTab, { ceremony })
            );
        }

        return {
            GamificationSheet,
            TAB_PROGRESS,
            TAB_ACHIEVEMENTS,
            TAB_LEVELS,
            // Открыто для смока: церемонию руками не набрать, а числа хода по
            // времени и геометрия линии должны сверяться с контрактом.
            CEREMONY_TIMELINE,
            CEREMONY_LINE_WIDTH,
            CEREMONY_CARD_RADIUS,
            buildCeremonyRingPath,
            ceremonyRingLength
        };
    })();
})();
