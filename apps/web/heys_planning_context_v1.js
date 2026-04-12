// heys_planning_context_v1.js — Context screen for HEYS planning
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const Planning = HEYS.Planning || {};
    if (!React || !Planning.Store || !Planning.Utils) return;

    const h = React.createElement;
    const { useMemo, useState } = React;
    const { dateStr, getTaskDurationMinutes } = Planning.Utils;

    function readDayRecord(isoDate) {
        const key = 'heys_dayv2_' + String(isoDate || '');
        try {
            if (window.U && typeof window.U.lsGet === 'function') {
                return window.U.lsGet(key, null) || null;
            }
            if (HEYS.store && typeof HEYS.store.get === 'function') {
                return HEYS.store.get(key, null) || null;
            }
        } catch (error) {
            console.warn('[HEYS.planning.context] day record read failed', error);
        }
        return null;
    }

    function formatTimestamp(isoString) {
        if (!isoString) return 'только что';
        const parsed = new Date(isoString);
        if (Number.isNaN(parsed.getTime())) return 'только что';
        return parsed.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function pluralize(count, one, few, many) {
        const safeCount = Math.abs(Number(count) || 0);
        const mod10 = safeCount % 10;
        const mod100 = safeCount % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }

    function formatHours(value) {
        const safeValue = Number(value);
        if (!Number.isFinite(safeValue) || safeValue <= 0) return 'нет данных';
        if (Math.abs(safeValue - Math.round(safeValue)) < 0.05) return Math.round(safeValue) + ' ч';
        return safeValue.toFixed(1).replace('.', ',') + ' ч';
    }

    function formatMinutes(value) {
        const safeValue = Math.max(0, Math.round(Number(value) || 0));
        if (!safeValue) return '0 мин';
        if (safeValue % 60 === 0) return (safeValue / 60) + ' ч';
        const hours = Math.floor(safeValue / 60);
        const minutes = safeValue % 60;
        if (hours > 0) return hours + 'ч ' + minutes + 'м';
        return minutes + ' мин';
    }

    function getCapturePlaceholder() {
        return 'Например: «нужно вернуться к офферу, Даша устала после репетиции, лучше не ставить тяжёлые задачи на вечер»';
    }

    var CONTEXT_TYPES = [
        { id: 'capture', label: 'Мысль', icon: '💭' },
        { id: 'task', label: 'Задача', icon: '☑️' },
        { id: 'thread', label: 'Тема', icon: '🧵' },
        { id: 'decision', label: 'Решение', icon: '✅' },
        { id: 'question', label: 'Вопрос', icon: '❓' },
        { id: 'constraint', label: 'Ограничение', icon: '🚧' },
        { id: 'value', label: 'Ценность', icon: '💎' },
    ];

    function getTypeMeta(typeId) {
        return CONTEXT_TYPES.find(function (t) { return t.id === typeId; }) || CONTEXT_TYPES[0];
    }

    function buildContextCapsule(state, todayIso) {
        const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
        const slots = Array.isArray(state?.slots) ? state.slots : [];
        const inboxItems = Array.isArray(state?.contextInboxItems) ? state.contextInboxItems : [];
        const dayRecord = readDayRecord(todayIso) || {};

        const activeTasks = tasks.filter((task) => task && task.status !== 'done');
        const todayDueCount = activeTasks.filter((task) => task.dueDate === todayIso).length;
        const overdueCount = activeTasks.filter((task) => task.dueDate && task.dueDate < todayIso).length;
        const todaySlots = slots.filter((slot) => slot && slot.date === todayIso);
        const scheduledMinutes = todaySlots.reduce((total, slot) => total + getTaskDurationMinutes(slot), 0);
        const inboxFreshCount = inboxItems.filter((item) => item && item.status !== 'archived').length;

        const sleepHours = Number(
            dayRecord?.sleepHours
            || dayRecord?.sleep_hours
            || dayRecord?.sleep?.hours
            || dayRecord?.sleep?.totalHours
            || 0
        );

        const stressScore = Number(
            dayRecord?.stress
            || dayRecord?.stressLevel
            || dayRecord?.mood?.stress
            || dayRecord?.body?.stress
            || 0
        );

        const protein = Number(
            dayRecord?.dayTot?.prot
            || dayRecord?.dayTot?.protein
            || dayRecord?.nutrition?.prot
            || 0
        );

        let modeKey = 'steady';
        let modeLabel = 'Ровный режим';
        let advice = 'Можно смело переводить мысли в конкретные шаги и раскладывать их по проектам.';

        if ((sleepHours > 0 && sleepHours < 6.5) || stressScore >= 7) {
            modeKey = 'careful';
            modeLabel = 'Бережный режим';
            advice = 'Сегодня лучше собирать контекст и резать задачи на короткие шаги, а не тащить тяжёлый фронт.';
        } else if (overdueCount >= 3 || todayDueCount >= 3 || scheduledMinutes >= (4 * 60) || inboxFreshCount >= 6) {
            modeKey = 'focus';
            modeLabel = 'Режим фокуса';
            advice = 'Контекста уже много — стоит быстро превращать заметки во 2–3 приоритетные задачи, чтобы не утонуть в облаке мыслей.';
        }

        return {
            todayIso,
            sleepHours,
            stressScore,
            protein,
            overdueCount,
            todayDueCount,
            scheduledMinutes,
            inboxFreshCount,
            modeKey,
            modeLabel,
            advice,
        };
    }

    function ContextMetricCard(props) {
        return h('div', { className: 'planning-context-metric-card' }, [
            h('div', { key: 'label', className: 'planning-context-metric-card__label' }, props.label),
            h('div', { key: 'value', className: 'planning-context-metric-card__value' }, props.value),
            props.hint ? h('div', { key: 'hint', className: 'planning-context-metric-card__hint' }, props.hint) : null,
        ]);
    }

    function ContextCapsuleSection(props) {
        const capsule = props.capsule;
        const dueHint = capsule.todayDueCount > 0
            ? capsule.todayDueCount + ' ' + pluralize(capsule.todayDueCount, 'дедлайн', 'дедлайна', 'дедлайнов') + ' сегодня'
            : 'сегодня без жёстких дедлайнов';

        return h('section', { className: 'planning-card planning-context-hero' }, [
            h('div', { key: 'header', className: 'planning-context-hero__header' }, [
                h('div', { key: 'eyebrow', className: 'planning-context-hero__eyebrow' }, 'Context capsule · сегодня'),
                h('div', { key: 'titleRow', className: 'planning-context-hero__title-row' }, [
                    h('h3', { key: 'title', className: 'planning-section__title' }, 'Контекст дня'),
                    h('span', {
                        key: 'mode',
                        className: 'planning-context-badge planning-context-badge--' + capsule.modeKey,
                    }, capsule.modeLabel),
                ]),
                h('p', { key: 'desc', className: 'planning-section__desc' }, capsule.advice),
            ]),
            h('div', { key: 'metrics', className: 'planning-context-metrics-grid' }, [
                h(ContextMetricCard, {
                    key: 'sleep',
                    label: 'Сон',
                    value: formatHours(capsule.sleepHours),
                    hint: capsule.sleepHours > 0 ? 'ориентир на восстановление' : 'данные появятся из дневного слота',
                }),
                h(ContextMetricCard, {
                    key: 'stress',
                    label: 'Стресс',
                    value: capsule.stressScore > 0 ? String(capsule.stressScore).replace('.', ',') + '/10' : 'нет данных',
                    hint: dueHint,
                }),
                h(ContextMetricCard, {
                    key: 'plan',
                    label: 'План на сегодня',
                    value: formatMinutes(capsule.scheduledMinutes),
                    hint: capsule.overdueCount > 0
                        ? capsule.overdueCount + ' ' + pluralize(capsule.overdueCount, 'хвост', 'хвоста', 'хвостов')
                        : 'без просроченных хвостов',
                }),
                h(ContextMetricCard, {
                    key: 'captures',
                    label: 'Во входящих',
                    value: capsule.inboxFreshCount + ' ' + pluralize(capsule.inboxFreshCount, 'запись', 'записи', 'записей'),
                    hint: capsule.protein > 0 ? 'белок: ' + Math.round(capsule.protein) + ' г' : 'контекст ждёт разборки',
                }),
            ]),
        ]);
    }

    function QuickCaptureSection(props) {
        const [draft, setDraft] = useState('');
        const [selectedType, setSelectedType] = useState('capture');
        const [error, setError] = useState('');

        function handleSave() {
            const text = String(draft || '').trim();
            if (!text) {
                setError('Нужен хотя бы один факт, мысль или сигнал — пустоту даже ИИ не распакует.');
                return;
            }
            if (selectedType === 'task') {
                var item = props.onCaptureAsTask(text);
                if (!item) { setError('Не получилось создать задачу.'); return; }
            } else {
                var item = props.onCapture(text, { type: selectedType });
                if (!item) { setError('Не получилось сохранить запись.'); return; }
            }
            setDraft('');
            setError('');
        }

        return h('section', { className: 'planning-card planning-context-capture' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, 'Быстрый capture'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Мысль, задача, тема, решение, вопрос, ограничение или ценность — выбери тип и запиши.'),
            ]),
            h('div', { key: 'types', className: 'planning-context-type-chips' },
                CONTEXT_TYPES.map(function (ct) {
                    return h('button', {
                        key: ct.id,
                        type: 'button',
                        className: 'planning-context-type-chip' + (selectedType === ct.id ? ' planning-context-type-chip--active' : '') + ' planning-context-type-chip--' + ct.id,
                        onClick: function () { setSelectedType(ct.id); },
                    }, ct.icon + ' ' + ct.label);
                })
            ),
            h('textarea', {
                key: 'input',
                className: 'planning-context-capture__input',
                value: draft,
                placeholder: getCapturePlaceholder(),
                rows: 3,
                onChange: (event) => {
                    setDraft(event?.target?.value || '');
                    if (error) setError('');
                },
            }),
            h('div', { key: 'footer', className: 'planning-context-capture__footer' }, [
                h('div', { key: 'meta', className: 'planning-context-capture__meta' },
                    selectedType === 'task' ? 'Сразу создастся задача в списке.' : 'Сохраняется в inbox и синхронизируется между устройствами.'
                ),
                h('button', {
                    key: 'save',
                    type: 'button',
                    className: 'planning-btn planning-btn--primary',
                    onClick: handleSave,
                }, selectedType === 'task' ? 'Создать задачу' : 'Сохранить'),
            ]),
            error ? h('div', { key: 'error', className: 'planning-context-inline-error' }, error) : null,
        ]);
    }

    function InboxEntry(props) {
        const item = props.item;
        const linkedCount = Array.isArray(item?.linkedTaskIds) ? item.linkedTaskIds.length : 0;
        const typeMeta = getTypeMeta(item?.type);
        const [showTypeMenu, setShowTypeMenu] = useState(false);

        return h('article', { className: 'planning-context-entry planning-context-entry--type-' + (item?.type || 'capture') }, [
            h('div', { key: 'head', className: 'planning-context-entry__head' }, [
                h('div', { key: 'titleWrap', className: 'planning-context-entry__title-wrap' }, [
                    h('span', { key: 'icon', className: 'planning-context-entry__type-icon' }, typeMeta.icon),
                    h('div', { key: 'title', className: 'planning-context-entry__title' }, item?.title || 'Без названия'),
                ]),
                h('div', { key: 'meta', className: 'planning-context-entry__meta' }, [
                    h('span', {
                        key: 'type',
                        className: 'planning-context-type-badge planning-context-type-badge--' + (item?.type || 'capture'),
                    }, typeMeta.label),
                    h('span', { key: 'time', className: 'planning-context-entry__time' }, formatTimestamp(item?.updatedAt || item?.createdAt)),
                ]),
            ]),
            h('div', { key: 'body', className: 'planning-context-entry__body' }, item?.body || item?.preview || ''),
            linkedCount > 0
                ? h('div', { key: 'linked', className: 'planning-context-entry__linked' }, '🔗 ' + linkedCount + ' ' + pluralize(linkedCount, 'задача', 'задачи', 'задач'))
                : null,
            h('div', { key: 'footer', className: 'planning-context-entry__footer' }, [
                h('div', { key: 'actions', className: 'planning-context-entry__actions' }, [
                    h('button', {
                        key: 'promote',
                        type: 'button',
                        className: 'planning-btn planning-btn--ghost planning-btn--sm',
                        onClick: function () { props.onPromote(item); },
                    }, linkedCount > 0 ? '+ задача' : '→ В задачу'),
                    h('div', { key: 'retype-wrap', className: 'planning-context-retype-wrap' }, [
                        h('button', {
                            key: 'retype',
                            type: 'button',
                            className: 'planning-btn planning-btn--ghost planning-btn--sm',
                            onClick: function () { setShowTypeMenu(!showTypeMenu); },
                        }, '🏷 Тип'),
                        showTypeMenu ? h('div', { key: 'menu', className: 'planning-context-retype-menu' },
                            CONTEXT_TYPES.filter(function (ct) { return ct.id !== 'task' && ct.id !== item?.type; }).map(function (ct) {
                                return h('button', {
                                    key: ct.id,
                                    type: 'button',
                                    className: 'planning-context-retype-menu__item',
                                    onClick: function () {
                                        props.onRetype(item.id, ct.id);
                                        setShowTypeMenu(false);
                                    },
                                }, ct.icon + ' ' + ct.label);
                            })
                        ) : null,
                    ]),
                    h('button', {
                        key: 'delete',
                        type: 'button',
                        className: 'planning-btn planning-btn--ghost planning-btn--sm planning-btn--danger',
                        onClick: function () { props.onDelete(item.id); },
                    }, '✕'),
                ]),
            ]),
        ]);
    }

    function ContextInboxSection(props) {
        const items = Array.isArray(props.items) ? props.items : [];
        return h('section', { className: 'planning-card planning-context-inbox' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, 'Inbox контекста'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Сырые заметки и сигналы. Превращай нужное в задачи или меняй тип.'),
            ]),
            items.length
                ? h('div', { key: 'list', className: 'planning-context-entry-list' }, items.map(function (item) {
                    return h(InboxEntry, {
                        key: item.id,
                        item: item,
                        onDelete: props.onDelete,
                        onPromote: props.onPromote,
                        onRetype: props.onRetype,
                    });
                }))
                : h('div', { key: 'empty', className: 'planning-empty planning-empty--subtle' }, [
                    h('div', { key: 'title', className: 'planning-empty__title' }, 'Пока пусто'),
                    h('div', { key: 'desc', className: 'planning-empty__desc' }, 'Добавь первую заметку выше — и начнём собирать твой жизненный контекст прямо внутри HEYS.'),
                ]),
        ]);
    }

    function AgentHandoffSection(props) {
        const [copied, setCopied] = useState('');

        function buildInboxText() {
            var items = Array.isArray(props.items) ? props.items : [];
            if (!items.length) return 'Inbox пуст.';
            return items.map(function (item, idx) {
                var meta = getTypeMeta(item?.type);
                return (idx + 1) + '. ' + meta.icon + ' [' + meta.label + '] ' + (item?.title || '') + '\n   ' + (item?.body || item?.preview || '');
            }).join('\n\n');
        }

        function buildDayContext() {
            var capsule = props.capsule;
            if (!capsule) return 'Нет данных о дне.';
            var lines = [
                'Дата: ' + capsule.todayIso,
                'Режим: ' + capsule.modeLabel,
                'Сон: ' + formatHours(capsule.sleepHours),
                'Стресс: ' + (capsule.stressScore > 0 ? capsule.stressScore + '/10' : 'нет данных'),
                'Дедлайны сегодня: ' + capsule.todayDueCount,
                'Просроченные: ' + capsule.overdueCount,
                'Забронировано: ' + formatMinutes(capsule.scheduledMinutes),
                'Inbox: ' + capsule.inboxFreshCount + ' записей',
                '',
                'Совет: ' + capsule.advice,
            ];
            return lines.join('\n');
        }

        function buildFullContext() {
            var snapshot = '== HEYS Context Snapshot ==\n\n--- Контекст дня ---\n' + buildDayContext() + '\n\n--- Inbox ---\n' + buildInboxText();
            return [
                'Ты — мой context copilot для HEYS-v2.',
                'Это жизненный контекст. Не переспрашивай. Сразу разбирай.',
                '',
                '═══ HEYS В ДВУХ СЛОВАХ ═══',
                '',
                'HEYS — мобильное PWA (питание + жизненное планирование).',
                'Раздел Planning → 4 экрана: Список, Календарь, Гант, Контекст (🧠).',
                'PIN-only доступ. AI внутри нет — ты единственный мозг.',
                '',
                '═══ СУЩНОСТИ ═══',
                '',
                'InboxItem.type — 7 типов:',
                '  💭 capture     — сырая мысль, наблюдение',
                '  ☑️ task        — конкретное действие',
                '  🧵 thread      — длинная тема (клиент, проект, здоровье)',
                '  ✅ decision    — что решено или договорено',
                '  ❓ question    — что неясно, требует ответа',
                '  🚧 constraint  — ограничение, правило',
                '  💎 value       — ценность, приоритет, смысл',
                '',
                'Task: { priority: p1|p2|p3, status: todo|in_progress|done, projectId, dueDate }',
                'Link.relation: promoted_to | causes | blocks | related | supports | contradicts',
                '',
                '═══ РЕЖИМ ДНЯ ═══',
                '',
                '🟡 careful  — сон < 6.5ч ИЛИ стресс ≥ 7',
                '🔴 focus    — overdue ≥ 3, ИЛИ todayDue ≥ 3, ИЛИ scheduled ≥ 4ч, ИЛИ inbox ≥ 6',
                '🟢 steady   — всё остальное',
                '',
                '═══ ЧТО ДЕЛАТЬ ═══',
                '',
                '1. Пойми суть — 3–5 ключевых смыслов.',
                '2. Определи режим — careful / steady / focus + почему.',
                '3. Не дублируй — если это update existing → обнови.',
                '4. Раздроби на полный спектр типов.',
                '5. Построй связи — [node A] —relation→ [node B].',
                '6. Приоритизируй — now / next / later с учётом жизненного ресурса.',
                '7. Если есть браузер VS Code + localhost:3001 — запиши через:',
                '   const S = HEYS.Planning.Store;',
                '   S.addTask(title, { priority, projectId, dueDate })',
                '   S.addContextInboxItem(text, { type })',
                '   S.addLink(fromId, toId, { relation, label })',
                '   S.updateContextInboxItem(id, { type, status })',
                '',
                '═══ ПРАВИЛА ═══',
                '',
                '- Часть контекста ДОЛЖНА остаться контекстом, а не задачей.',
                '- Values и Constraints — полноценные узлы, не комментарии.',
                '- Не давай общие советы вроде "будь внимательнее".',
                '- Отвечай по-русски. Ключи полей — на английском.',
                '',
                '═══ ФОРМАТ ОТВЕТА ═══',
                '',
                '## 1. Суть контекста',
                '## 2. Режим дня — mode / why / давление / чего не делать',
                '## 3. Декомпозиция',
                '| # | type | icon | Что | projectId | priority | связь с |',
                '## 4. Нейро-карта — Nodes + Links',
                '## 5. Приоритет — now / next / later',
                '## 6. API-команды (если есть браузер)',
                '',
                '═══ КОНТЕКСТ ═══',
                '',
                '[SNAPSHOT]',
                snapshot,
                '',
                '[ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ]',
                '<допиши что есть в голове>',
                '',
                '[ЧТО УЖЕ ЕСТЬ В HEYS]',
                '<если помнишь проекты/задачи — перечисли; если нет — "агент, проверь">',
                '',
                '[НЕ ДУБЛИРОВАТЬ]',
                '<что точно не надо создавать повторно>',
            ].join('\n');
        }

        function copyToClipboard(text, label) {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(text).then(function () {
                    setCopied(label);
                    setTimeout(function () { setCopied(''); }, 2000);
                }).catch(function () {
                    setCopied('error');
                    setTimeout(function () { setCopied(''); }, 2000);
                });
            }
        }

        return h('section', { className: 'planning-card planning-context-handoff' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, '🤖 Передать агенту'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Скопируй контекст и вставь в чат с агентом (Copilot, Claude, ChatGPT). Агент разложит мысли в задачи, треды и решения.'),
            ]),
            h('div', { key: 'buttons', className: 'planning-context-handoff__buttons' }, [
                h('button', {
                    key: 'inbox',
                    type: 'button',
                    className: 'planning-btn planning-btn--secondary planning-context-handoff__btn',
                    onClick: function () { copyToClipboard(buildInboxText(), 'inbox'); },
                }, [
                    h('span', { key: 'icon', className: 'planning-context-handoff__icon' }, '📋'),
                    h('span', { key: 'label' }, copied === 'inbox' ? 'Скопировано!' : 'Inbox'),
                ]),
                h('button', {
                    key: 'day',
                    type: 'button',
                    className: 'planning-btn planning-btn--secondary planning-context-handoff__btn',
                    onClick: function () { copyToClipboard(buildDayContext(), 'day'); },
                }, [
                    h('span', { key: 'icon', className: 'planning-context-handoff__icon' }, '📊'),
                    h('span', { key: 'label' }, copied === 'day' ? 'Скопировано!' : 'Контекст дня'),
                ]),
                h('button', {
                    key: 'full',
                    type: 'button',
                    className: 'planning-btn planning-btn--primary planning-context-handoff__btn',
                    onClick: function () { copyToClipboard(buildFullContext(), 'full'); },
                }, [
                    h('span', { key: 'icon', className: 'planning-context-handoff__icon' }, '🧠'),
                    h('span', { key: 'label' }, copied === 'full' ? 'Скопировано!' : 'Всё'),
                ]),
            ]),
            copied === 'error' ? h('div', { key: 'err', className: 'planning-context-inline-error' }, 'Не удалось скопировать.') : null,
        ]);
    }

    function GraphSection(props) {
        var tasks = Array.isArray(props.tasks) ? props.tasks : [];
        var projects = Array.isArray(props.projects) ? props.projects : [];
        var items = Array.isArray(props.items) ? props.items : [];
        var links = Array.isArray(props.links) ? props.links : [];
        var totalNodes = tasks.length + projects.length + items.length;

        return h('section', { className: 'planning-card planning-context-graph' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, 'Карта связей'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Узлы — это задачи, проекты и inbox-записи. Связи создаются автоматически при промоуте, а также вручную агентом.'),
            ]),
            h('div', { key: 'stats', className: 'planning-context-graph__stats' }, [
                h('div', { key: 'nodes', className: 'planning-context-graph__stat' }, [
                    h('span', { key: 'val', className: 'planning-context-graph__val' }, String(totalNodes)),
                    h('span', { key: 'label', className: 'planning-context-graph__label' }, pluralize(totalNodes, 'узел', 'узла', 'узлов')),
                ]),
                h('div', { key: 'edges', className: 'planning-context-graph__stat' }, [
                    h('span', { key: 'val', className: 'planning-context-graph__val' }, String(links.length)),
                    h('span', { key: 'label', className: 'planning-context-graph__label' }, pluralize(links.length, 'связь', 'связи', 'связей')),
                ]),
            ]),
            links.length > 0
                ? h('div', { key: 'list', className: 'planning-context-graph__links' },
                    links.slice(0, 10).map(function (link) {
                        return h('div', { key: link.id, className: 'planning-context-graph__link' }, [
                            h('span', { key: 'rel', className: 'planning-context-graph__rel' }, link.label || link.relation || '→'),
                            h('span', { key: 'ids', className: 'planning-context-graph__ids' },
                                (link.fromId || '?').substring(0, 8) + ' → ' + (link.toId || '?').substring(0, 8)
                            ),
                        ]);
                    })
                )
                : h('div', { key: 'empty', className: 'planning-context-graph__empty' }, 'Связи появятся по мере промоутов и работы с агентом.'),
        ]);
    }

    function ContextScreen(props) {
        const state = props.state;
        const todayIso = useMemo(function () { return dateStr(new Date()); }, []);
        const capsule = useMemo(function () { return buildContextCapsule(state, todayIso); }, [state, todayIso]);
        const inboxItems = Array.isArray(state?.contextInboxItems) ? state.contextInboxItems : [];
        const links = Array.isArray(state?.links) ? state.links : [];

        function handleCapture(text, opts) {
            if (!state || typeof state.addContextInboxItem !== 'function') return null;
            return state.addContextInboxItem(text, {
                source: 'manual',
                type: opts?.type || 'capture',
            });
        }

        function handleCaptureAsTask(text) {
            if (!state || typeof state.addTask !== 'function') return null;
            return state.addTask(text, { priority: 'p2', status: 'todo' });
        }

        function handleDelete(itemId) {
            if (!state || typeof state.deleteContextInboxItem !== 'function') return;
            state.deleteContextInboxItem(itemId);
        }

        function handleRetype(itemId, newType) {
            if (!state || typeof state.updateContextInboxItem !== 'function') return;
            state.updateContextInboxItem(itemId, { type: newType });
        }

        function handlePromote(item) {
            if (!state || typeof state.addTask !== 'function' || typeof state.updateContextInboxItem !== 'function') return;
            var title = String(item?.title || item?.preview || '').trim() || 'Контекстная задача';
            var task = state.addTask(title, { priority: 'p2', status: 'todo' });
            if (!task || !task.id) return;

            var linkedTaskIds = Array.isArray(item?.linkedTaskIds) ? item.linkedTaskIds.slice() : [];
            if (linkedTaskIds.indexOf(task.id) === -1) linkedTaskIds.push(task.id);
            state.updateContextInboxItem(item.id, {
                status: 'linked',
                linkedTaskIds: linkedTaskIds,
            });

            if (typeof state.addLink === 'function') {
                state.addLink(item.id, task.id, {
                    fromType: 'inbox',
                    toType: 'task',
                    relation: 'promoted_to',
                    label: 'Промоут',
                });
            }
        }

        return h('div', { className: 'planning-context-screen' }, [
            h(ContextCapsuleSection, { key: 'capsule', capsule: capsule }),
            h(QuickCaptureSection, { key: 'capture', onCapture: handleCapture, onCaptureAsTask: handleCaptureAsTask }),
            h(ContextInboxSection, {
                key: 'inbox',
                items: inboxItems,
                onDelete: handleDelete,
                onPromote: handlePromote,
                onRetype: handleRetype,
            }),
            h(AgentHandoffSection, { key: 'handoff', items: inboxItems, capsule: capsule }),
            h(GraphSection, {
                key: 'graph',
                items: inboxItems,
                projects: state?.projects,
                tasks: state?.tasks,
                links: links,
            }),
        ]);
    }

    HEYS.PlanningContext = {
        ContextScreen,
    };
})();
