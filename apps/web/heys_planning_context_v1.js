// heys_planning_context_v1.js — Context screen for HEYS planning
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const Planning = HEYS.Planning || {};
    if (!React || !Planning.Store || !Planning.Utils) return;

    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;
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

    function getSessionTokenForPlanningRpc() {
        try {
            if (HEYS.auth && typeof HEYS.auth.getSessionToken === 'function') {
                var t = HEYS.auth.getSessionToken();
                if (t) return typeof t === 'string' ? t : String(t);
            }
        } catch (e) { /* noop */ }
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem('heys_session_token') || '';
            }
        } catch (e2) { /* noop */ }
        return '';
    }

    function getTargetClientIdForPrompt() {
        var id = '';
        try {
            if (HEYS.cloud && typeof HEYS.cloud.getClientId === 'function') {
                id = String(HEYS.cloud.getClientId() || '');
            }
        } catch (e) { /* noop */ }
        if (!id && typeof localStorage !== 'undefined') {
            id = localStorage.getItem('heys_pin_auth_client') || localStorage.getItem('heys_client_current') || '';
        }
        return id;
    }

    function refreshPlanningFromCloud() {
        var YandexAPI = HEYS.YandexAPI;
        var Store = HEYS.Planning && HEYS.Planning.Store;
        if (!YandexAPI || !Store || typeof YandexAPI.getKVBatch !== 'function') {
            return Promise.resolve({ ok: false, reason: 'no_api' });
        }
        var clientId = getTargetClientIdForPrompt();
        var keys = [
            'heys_planning_projects',
            'heys_planning_tasks',
            'heys_planning_slots',
            'heys_planning_inbox_v1',
            'heys_planning_links_v1',
        ];
        return YandexAPI.getKVBatch(clientId, keys).then(function (res) {
            if (res.error || !Array.isArray(res.data)) {
                return { ok: false, reason: res.error || 'batch_failed' };
            }
            res.data.forEach(function (item) {
                if (!item || item.k == null || item.v == null) return;
                if (item.k === 'heys_planning_projects' && typeof Store.saveProjects === 'function') {
                    Store.saveProjects(item.v);
                } else if (item.k === 'heys_planning_tasks' && typeof Store.saveTasks === 'function') {
                    Store.saveTasks(item.v);
                } else if (item.k === 'heys_planning_slots' && typeof Store.saveSlots === 'function') {
                    Store.saveSlots(item.v);
                } else if (item.k === 'heys_planning_inbox_v1' && typeof Store.saveContextInboxItems === 'function') {
                    Store.saveContextInboxItems(item.v);
                } else if (item.k === 'heys_planning_links_v1' && typeof Store.saveLinks === 'function') {
                    Store.saveLinks(item.v);
                }
            });
            // Same-tab localStorage writes do not emit "storage"; Planning usePlanningState listens for this.
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('heys:planning-updated'));
                }
            } catch (e) { /* noop */ }
            return { ok: true };
        });
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
        var CAPTURE_DRAFT_KEY = 'heys_planning_context_capture_draft_v1';
        const [draft, setDraft] = useState('');
        const [selectedType, setSelectedType] = useState('capture');
        const [error, setError] = useState('');

        useEffect(function () {
            try {
                var raw = null;
                if (window.U && typeof window.U.lsGet === 'function') {
                    raw = window.U.lsGet(CAPTURE_DRAFT_KEY, null);
                } else if (HEYS.store && typeof HEYS.store.get === 'function') {
                    raw = HEYS.store.get(CAPTURE_DRAFT_KEY, null);
                } else if (typeof window !== 'undefined' && window.localStorage) {
                    raw = window.localStorage.getItem(CAPTURE_DRAFT_KEY);
                    if (raw) raw = JSON.parse(raw);
                }
                if (!raw || typeof raw !== 'object') return;
                var savedText = String(raw.text || '');
                var savedType = String(raw.type || 'capture');
                if (savedText) setDraft(savedText);
                if (CONTEXT_TYPES.some(function (ct) { return ct.id === savedType; })) setSelectedType(savedType);
            } catch (error) {
                console.warn('[HEYS.planning.context] capture draft restore failed', error);
            }
        }, []);

        useEffect(function () {
            try {
                var payload = { text: String(draft || ''), type: String(selectedType || 'capture') };
                if (!payload.text.trim()) {
                    if (window.U && typeof window.U.lsDel === 'function') {
                        window.U.lsDel(CAPTURE_DRAFT_KEY);
                    } else if (HEYS.store && typeof HEYS.store.del === 'function') {
                        HEYS.store.del(CAPTURE_DRAFT_KEY);
                    } else if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.removeItem(CAPTURE_DRAFT_KEY);
                    }
                    return;
                }
                if (window.U && typeof window.U.lsSet === 'function') {
                    window.U.lsSet(CAPTURE_DRAFT_KEY, payload);
                } else if (HEYS.store && typeof HEYS.store.set === 'function') {
                    HEYS.store.set(CAPTURE_DRAFT_KEY, payload);
                } else if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem(CAPTURE_DRAFT_KEY, JSON.stringify(payload));
                }
            } catch (error) {
                console.warn('[HEYS.planning.context] capture draft save failed', error);
            }
        }, [draft, selectedType]);

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
            try {
                if (window.U && typeof window.U.lsDel === 'function') {
                    window.U.lsDel(CAPTURE_DRAFT_KEY);
                } else if (HEYS.store && typeof HEYS.store.del === 'function') {
                    HEYS.store.del(CAPTURE_DRAFT_KEY);
                } else if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.removeItem(CAPTURE_DRAFT_KEY);
                }
            } catch (error) {
                console.warn('[HEYS.planning.context] capture draft clear failed', error);
            }
        }

        return h('section', { className: 'planning-card planning-context-capture' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, 'Быстрый capture'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Сохрани мысль в inbox: это быстрый сбор контекста. Разбор по категориям и приоритетам делает агент на шаге «🧠 Всё».'),
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
                    selectedType === 'task'
                        ? 'Сразу создастся задача в списке.'
                        : 'Сохраняется в inbox и синхронизируется между устройствами. Авто-разбор включается через «🧠 Всё».'
                ),
                h('div', { key: 'actions', className: 'planning-context-capture__actions' }, [
                    h('button', {
                        key: 'agent',
                        type: 'button',
                        className: 'planning-btn planning-btn--secondary',
                        onClick: function () {
                            if (typeof props.onOpenAgentHandoff === 'function') props.onOpenAgentHandoff();
                        },
                    }, 'Разобрать через агента'),
                    h('button', {
                        key: 'save',
                        type: 'button',
                        className: 'planning-btn planning-btn--primary',
                        onClick: handleSave,
                    }, selectedType === 'task' ? 'Создать задачу' : 'Сохранить'),
                ]),
            ]),
            error ? h('div', { key: 'error', className: 'planning-context-inline-error' }, error) : null,
        ]);
    }

    function InboxEntry(props) {
        const item = props.item;
        const linkedCount = Array.isArray(item?.linkedTaskIds) ? item.linkedTaskIds.length : 0;
        const typeMeta = getTypeMeta(item?.type);
        const manualMode = !!props.manualMode;
        const resolutionMeta = (function () {
            if (item?.type === 'decision' || item?.status === 'archived') {
                return { label: 'Решено', className: 'planning-context-resolution-badge--done' };
            }
            if (item?.type === 'question') {
                return { label: 'Ждёт решения', className: 'planning-context-resolution-badge--waiting' };
            }
            return { label: 'В контексте', className: 'planning-context-resolution-badge--context' };
        })();
        const [showTypeMenu, setShowTypeMenu] = useState(false);
        const [showActions, setShowActions] = useState(false);
        const bodyText = String(item?.body || item?.preview || '');
        const compactBody = bodyText.length > 190 ? bodyText.slice(0, 190) + '…' : bodyText;

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
            h('div', { key: 'body', className: 'planning-context-entry__body' }, manualMode ? bodyText : compactBody),
            h(
                'div',
                { key: 'linked', className: 'planning-context-entry__linked' },
                [
                    h('span', {
                        key: 'resolution',
                        className: 'planning-context-resolution-badge ' + resolutionMeta.className,
                    }, resolutionMeta.label),
                    h('span', { key: 'links' },
                        linkedCount > 0
                            ? '🔗 Связи: ' + linkedCount + ' ' + pluralize(linkedCount, 'связь', 'связи', 'связей')
                            : '🔗 Связи: пока без связей'
                    ),
                ]
            ),
            manualMode ? h('div', { key: 'footer', className: 'planning-context-entry__footer' }, [
                h('div', { key: 'actions', className: 'planning-context-entry__actions' }, [
                    h('button', {
                        key: 'toggle-actions',
                        type: 'button',
                        className: 'planning-btn planning-btn--ghost planning-btn--sm',
                        onClick: function () { setShowActions(!showActions); },
                    }, showActions ? 'Скрыть действия' : '⋯ Действия'),
                    showActions ? h('div', { key: 'actions-expanded', className: 'planning-context-entry__actions-expanded' }, [
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
                    ]) : null,
                ]),
            ]) : null,
        ]);
    }

    function ContextInboxSection(props) {
        const items = Array.isArray(props.items) ? props.items : [];
        const [manualMode, setManualMode] = useState(false);
        return h('section', { className: 'planning-card planning-context-inbox' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('div', { key: 'head-row', className: 'planning-context-inbox__header-row' }, [
                    h('h3', { key: 'title', className: 'planning-section__title' }, 'Inbox контекста'),
                    h('button', {
                        key: 'manual-mode',
                        type: 'button',
                        className: 'planning-btn planning-btn--ghost planning-btn--sm',
                        onClick: function () { setManualMode(!manualMode); },
                    }, manualMode ? 'Авто-режим' : 'Ручное редактирование'),
                ]),
                h('p', { key: 'desc', className: 'planning-section__desc' }, manualMode
                    ? 'Ручной режим: можно промоутить в задачи, менять тип и удалять записи.'
                    : 'Журнал контекста. Основной поток: «🧠 Всё» → агент сам применяет изменения.'),
            ]),
            items.length
                ? h('div', { key: 'list', className: 'planning-context-entry-list' }, items.map(function (item) {
                    return h(InboxEntry, {
                        key: item.id,
                        item: item,
                        manualMode: manualMode,
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
        const [applyBusy, setApplyBusy] = useState(false);
        const [applyNotice, setApplyNotice] = useState('');
        const [agentPromptExtra, setAgentPromptExtra] = useState('');

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

        function getRecentDayEntries(limit) {
            var entries = [];
            var safeLimit = Math.max(1, Number(limit) || 5);
            try {
                if (typeof window === 'undefined' || !window.localStorage) return entries;
                var storage = window.localStorage;
                for (var i = 0; i < storage.length; i += 1) {
                    var key = String(storage.key(i) || '');
                    if (key.indexOf('heys_dayv2_') !== 0) continue;
                    var iso = key.slice('heys_dayv2_'.length);
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
                    entries.push({ iso: iso, record: readDayRecord(iso) || {} });
                }
            } catch (error) {
                console.warn('[HEYS.planning.context] recent day records read failed', error);
            }

            entries.sort(function (a, b) {
                return a.iso < b.iso ? 1 : -1;
            });
            return entries.slice(0, safeLimit);
        }

        function normalizeInlineText(value) {
            return String(value || '').replace(/\s+/g, ' ').trim();
        }

        function buildRecentDaysContext() {
            var entries = getRecentDayEntries(5);
            if (!entries.length) return 'Нет данных за последние дни.';

            return entries.map(function (entry) {
                var record = entry.record || {};
                var sleepHours = Number(
                    record?.sleepHours
                    || record?.sleep_hours
                    || record?.sleep?.hours
                    || record?.sleep?.totalHours
                    || 0
                );
                var stressScore = Number(
                    record?.stress
                    || record?.stressLevel
                    || record?.mood?.stress
                    || record?.body?.stress
                    || 0
                );
                var protein = Number(
                    record?.dayTot?.prot
                    || record?.dayTot?.protein
                    || record?.nutrition?.prot
                    || 0
                );
                var note = normalizeInlineText(
                    record?.note
                    || record?.notes
                    || record?.comment
                    || record?.dayComment
                    || record?.summary
                    || ''
                );

                var parts = [
                    '- ' + entry.iso,
                    'sleep=' + formatHours(sleepHours),
                    'stress=' + (stressScore > 0 ? String(stressScore).replace('.', ',') + '/10' : 'нет данных'),
                    'protein=' + (protein > 0 ? Math.round(protein) + ' г' : 'нет данных'),
                ];
                if (note) parts.push('note=' + note.slice(0, 220));
                return parts.join(' | ');
            }).join('\n');
        }

        function buildSnapshotTextForIngest() {
            return '== HEYS Context Snapshot ==\n\n--- Контекст дня ---\n' + buildDayContext() + '\n\n--- Inbox ---\n' + buildInboxText();
        }

        function buildFullContext() {
            var snapshot = buildSnapshotTextForIngest();
            var targetClientId = getTargetClientIdForPrompt();
            return [
                'Ты — context copilot HEYS-v2. Не переспрашивай, кроме unresolved.',
                'Сразу делай anti-duplicate-first и APPLY_NOW=true.',
                '',
                'APPLY:',
                '- api_first: POST /planning/context-ingest (fn=planning_context_ingest)',
                '- fallback: browser_if_api_unavailable',
                '- idempotency_key: <stable-key-per-message>',
                '- dedupe_order: exact_match > semantic_match > safe_skip > created_new',
                '- apply_required: true (разбор без попытки apply считается неполным ответом)',
                '- если apply не выполнен: явно укажи причину и статус apply_failed/analyzed_only',
                '- если нужен follow-up по unresolved: после ответа пользователя сразу повтори ingest с parentIngestId',
                '',
                '[APPLY_IDENTITY]',
                '- actorId: текущий PIN-клиент HEYS',
                '- targetClientId: ' + (targetClientId || '<войди по PIN — id подставится из сессии>'),
                '- targetScope: planning_only',
                '- if targetClientId missing/invalid => apply_failed (do not write)',
                '',
                'Если есть unresolved (Ждёт решения / question):',
                '1) задай короткие вопросы',
                '2) после моих ответов сразу follow-up ingest (parentIngestId)',
                '',
                'Ответ строго:',
                '- Факт → Что сделал → Почему',
                '- PLAN: now / next / later',
                '- AUDIT: ingestId, parentIngestId, idempotencyKey, applyStatus, fallbackUsed',
                '',
                '═══ КОНТЕКСТ ═══',
                '',
                '[SNAPSHOT]',
                snapshot,
                '',
                '[HEYS_DAYS_LAST_5]',
                buildRecentDaysContext(),
                '',
                '[ДОП.КОНТЕКСТ]',
                '<опционально>',
            ].join('\n');
        }

        function handleApplyInHeys() {
            var token = getSessionTokenForPlanningRpc();
            if (!token) {
                setApplyNotice('Нужна PIN-сессия: не найден session token.');
                return;
            }
            if (!HEYS.YandexAPI || typeof HEYS.YandexAPI.rpc !== 'function') {
                setApplyNotice('API клиента недоступен.');
                return;
            }
            setApplyBusy(true);
            setApplyNotice('');
            var idem = 'ctx-ingest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            var extra = String(agentPromptExtra || '').trim();
            var rawPromptText = '';
            if (extra) {
                if (extra.indexOf('--- Inbox ---') >= 0) {
                    rawPromptText = '[ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ]\n' + extra;
                } else {
                    var lines = extra.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
                    var titleLine = lines[0] || extra;
                    var bodyOneLine = lines.slice(1).join(' ').trim() || titleLine;
                    rawPromptText = '[ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ]\n--- Inbox ---\n1. ☑️ [Задача] ' + titleLine + '\n   ' + bodyOneLine;
                }
            }
            var payload = {
                source: 'heys_context_apply_button',
                applyNow: true,
                dryRun: false,
                idempotencyKey: idem,
                policy: { antiDuplicateFirst: true, maxNowTasks: 3 },
                input: {
                    sessionToken: token,
                    snapshotText: buildSnapshotTextForIngest(),
                    daysLast5Text: buildRecentDaysContext(),
                    rawPromptText: rawPromptText,
                    clientTs: new Date().toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                },
            };
            HEYS.YandexAPI.rpc('planning_context_ingest', payload).then(function (res) {
                if (res.error) {
                    setApplyNotice(String(res.error.message || 'Ошибка RPC'));
                    setApplyBusy(false);
                    return;
                }
                var data = res.data;
                if (!data || data.ok === false) {
                    var em = data && data.error && data.error.message ? data.error.message : 'ingest отклонён';
                    setApplyNotice(em);
                    setApplyBusy(false);
                    return;
                }
                return refreshPlanningFromCloud().then(function (pull) {
                    if (!pull.ok) {
                        setApplyNotice('Сервер применил изменения, но локальное обновление с облака не удалось — перезайди в «Задачи».');
                    } else {
                        var m = data.metrics || {};
                        var s = data.summary || {};
                        setApplyNotice('Готово: новых сущностей ' + (s.created || 0) + ', слотов ' + (m.ingestSlotsAdded || 0) + ', полей сроков ' + (m.scheduleFieldsApplied || 0) + '.');
                    }
                    setApplyBusy(false);
                });
            }).catch(function (err) {
                setApplyNotice(err && err.message ? err.message : 'Сеть');
                setApplyBusy(false);
            });
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

        return h('section', { id: 'planning-agent-handoff', className: 'planning-card planning-context-handoff' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, '🤖 Передать агенту'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Скопируй в чат или примени сразу в HEYS: задачи, inbox, связи, сроки и слоты календаря (из текста строк вида «до 2026-04-20», «2ч», «10:00»).'),
            ]),
            h('label', { key: 'extraLabel', className: 'planning-context-handoff__extra-label', htmlFor: 'planning-context-agent-extra' }, 'Доп. текст к применению (планы, сроки — попадёт в ingest как rawPrompt):'),
            h('textarea', {
                key: 'extra',
                id: 'planning-context-agent-extra',
                className: 'planning-context-handoff__extra',
                placeholder: 'Например: сегодня вайбкодить приложения 3ч с 14:00, дедлайн по прототипу 2026-04-18',
                value: agentPromptExtra,
                onChange: function (e) { setAgentPromptExtra(e.target.value); },
                rows: 3,
            }),
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
                h('button', {
                    key: 'apply',
                    type: 'button',
                    className: 'planning-btn planning-btn--secondary planning-context-handoff__btn',
                    disabled: applyBusy,
                    onClick: handleApplyInHeys,
                }, [
                    h('span', { key: 'icon', className: 'planning-context-handoff__icon' }, '⚡'),
                    h('span', { key: 'label' }, applyBusy ? 'Применяю…' : 'Применить в HEYS'),
                ]),
            ]),
            applyNotice
                ? h('div', { key: 'applyNote', className: 'planning-context-handoff__notice', role: 'status' }, applyNotice)
                : null,
            copied === 'error' ? h('div', { key: 'err', className: 'planning-context-inline-error' }, 'Не удалось скопировать.') : null,
        ]);
    }

    function GraphSection(props) {
        var tasks = Array.isArray(props.tasks) ? props.tasks : [];
        var projects = Array.isArray(props.projects) ? props.projects : [];
        var items = Array.isArray(props.items) ? props.items : [];
        var links = Array.isArray(props.links) ? props.links : [];
        var totalNodes = tasks.length + projects.length + items.length;
        var canvasRef = useRef(null);
        var dragStateRef = useRef({ active: false, lastX: 0, lastY: 0, vx: 0.004, vy: 0.002 });
        var animationRef = useRef(null);
        var projectedRef = useRef([]);
        var selectedIndexRef = useRef(-1);
        var pointerTravelRef = useRef(0);
        var zoomRef = useRef(1);
        var pointersRef = useRef({});
        var pinchRef = useRef({ active: false, startDistance: 0, startZoom: 1 });
        var [selectedLabel, setSelectedLabel] = useState('');
        var [zoomUi, setZoomUi] = useState(1);

        var graphData = useMemo(function () {
            var nodes = [];
            var indexById = Object.create(null);

            function pushNode(entity, type) {
                if (!entity || !entity.id || indexById[entity.id] != null) return;
                indexById[entity.id] = nodes.length;
                nodes.push({
                    id: entity.id,
                    type: type,
                    label: entity.title || entity.name || entity.preview || 'Узел',
                });
            }

            tasks.forEach(function (task) { pushNode(task, 'task'); });
            projects.forEach(function (project) { pushNode(project, 'project'); });
            items.forEach(function (item) { pushNode(item, item?.type || 'capture'); });

            var graphLinks = links
                .filter(function (link) { return link && indexById[link.fromId] != null && indexById[link.toId] != null; })
                .map(function (link) {
                    return {
                        source: indexById[link.fromId],
                        target: indexById[link.toId],
                        relation: link.relation || 'related',
                    };
                });

            return { nodes: nodes, links: graphLinks };
        }, [tasks, projects, items, links]);

        useEffect(function () {
            var canvas = canvasRef.current;
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            if (!ctx) return;

            var dpr = Math.max(1, window.devicePixelRatio || 1);
            var cssWidth = canvas.clientWidth || 320;
            var cssHeight = canvas.clientHeight || 220;
            canvas.width = Math.round(cssWidth * dpr);
            canvas.height = Math.round(cssHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var nodes = graphData.nodes;
            var graphLinks = graphData.links;
            if (!nodes.length) {
                ctx.clearRect(0, 0, cssWidth, cssHeight);
                return;
            }

            var centerX = cssWidth / 2;
            var centerY = cssHeight / 2;
            var radius = Math.min(cssWidth, cssHeight) * 0.32;
            var perspective = radius * 2.4;
            var state = dragStateRef.current;

            var points = nodes.map(function (_, idx) {
                var t = nodes.length <= 1 ? 0.5 : idx / (nodes.length - 1);
                var phi = Math.acos(1 - 2 * t);
                var theta = Math.PI * (1 + Math.sqrt(5)) * idx;
                return {
                    x: radius * Math.sin(phi) * Math.cos(theta),
                    y: radius * Math.cos(phi),
                    z: radius * Math.sin(phi) * Math.sin(theta),
                };
            });

            function rotateY(point, angle) {
                var cosA = Math.cos(angle);
                var sinA = Math.sin(angle);
                var x = point.x * cosA + point.z * sinA;
                var z = -point.x * sinA + point.z * cosA;
                point.x = x;
                point.z = z;
            }

            function rotateX(point, angle) {
                var cosA = Math.cos(angle);
                var sinA = Math.sin(angle);
                var y = point.y * cosA - point.z * sinA;
                var z = point.y * sinA + point.z * cosA;
                point.y = y;
                point.z = z;
            }

            function project(point) {
                var zoom = Math.max(0.65, Math.min(2.4, zoomRef.current || 1));
                var scale = (perspective / (perspective + point.z + radius)) * zoom;
                return {
                    x: centerX + point.x * scale,
                    y: centerY + point.y * scale,
                    z: point.z,
                    scale: scale,
                };
            }

            function draw() {
                ctx.clearRect(0, 0, cssWidth, cssHeight);

                points.forEach(function (point) {
                    rotateY(point, state.vx);
                    rotateX(point, state.vy);
                });
                if (!state.active) {
                    state.vx *= 0.988;
                    state.vy *= 0.988;
                    if (Math.abs(state.vx) < 0.00015) state.vx = 0;
                    if (Math.abs(state.vy) < 0.00015) state.vy = 0;
                }

                var projected = points.map(project);
                projectedRef.current = projected;
                var selectedIndex = selectedIndexRef.current;

                graphLinks.forEach(function (link) {
                    var a = projected[link.source];
                    var b = projected[link.target];
                    if (!a || !b) return;
                    var isSelected = selectedIndex >= 0 && (link.source === selectedIndex || link.target === selectedIndex);
                    ctx.strokeStyle = isSelected ? 'rgba(37, 99, 235, 0.72)' : 'rgba(59, 130, 246, 0.22)';
                    ctx.lineWidth = isSelected ? 1.8 : 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                });

                var drawOrder = projected
                    .map(function (p, idx) { return { idx: idx, p: p }; })
                    .sort(function (a, b) { return a.p.z - b.p.z; });

                drawOrder.forEach(function (entry) {
                    var p = entry.p;
                    var node = nodes[entry.idx];
                    var isSelected = entry.idx === selectedIndex;
                    var zoom = Math.max(0.65, Math.min(2.4, zoomRef.current || 1));
                    var size = Math.max(2.8, 4.2 * p.scale + 1.8);
                    var color = node.type === 'task'
                        ? '#16a34a'
                        : node.type === 'project'
                            ? '#7c3aed'
                            : '#2563eb';
                    if (isSelected) {
                        ctx.beginPath();
                        ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
                        ctx.arc(p.x, p.y, size * 2.4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.beginPath();
                    ctx.fillStyle = color;
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fill();

                });

                if (Math.max(0.65, Math.min(2.4, zoomRef.current || 1)) >= 1.35 || selectedIndex >= 0) {
                    var occupied = [];
                    var labelCandidates = drawOrder.slice().reverse();
                    labelCandidates.forEach(function (entry) {
                        var p = entry.p;
                        var node = nodes[entry.idx];
                        var zoom = Math.max(0.65, Math.min(2.4, zoomRef.current || 1));
                        var isSelected = entry.idx === selectedIndex;
                        if (!isSelected && zoom < 1.35) return;

                        var shortLabel = String(node.label || 'Узел').slice(0, 24);
                        if (shortLabel.length < String(node.label || '').length) shortLabel += '…';
                        var fontSize = isSelected ? 11 : 10;
                        ctx.font = fontSize + 'px system-ui, -apple-system, Segoe UI, sans-serif';
                        var textWidth = ctx.measureText(shortLabel).width;
                        var x = p.x + 8;
                        var y = p.y - 8;
                        var box = {
                            x1: x - 2,
                            y1: y - fontSize - 1,
                            x2: x + textWidth + 2,
                            y2: y + 3,
                        };

                        var overlaps = occupied.some(function (o) {
                            return !(box.x2 < o.x1 || box.x1 > o.x2 || box.y2 < o.y1 || box.y1 > o.y2);
                        });
                        if (overlaps && !isSelected) return;

                        var alpha = isSelected ? 0.95 : Math.max(0.45, Math.min(0.9, 0.35 + p.scale));
                        ctx.fillStyle = 'rgba(15, 23, 42, ' + alpha.toFixed(2) + ')';
                        ctx.fillText(shortLabel, x, y);
                        occupied.push(box);
                    });
                }

                animationRef.current = window.requestAnimationFrame(draw);
            }

            animationRef.current = window.requestAnimationFrame(draw);
            return function () {
                if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
            };
        }, [graphData]);

        function handlePointerDown(event) {
            var state = dragStateRef.current;
            state.active = true;
            state.lastX = event.clientX || 0;
            state.lastY = event.clientY || 0;
            pointerTravelRef.current = 0;
            pointersRef.current[event.pointerId] = { x: event.clientX || 0, y: event.clientY || 0 };
            var pointerIds = Object.keys(pointersRef.current);
            if (pointerIds.length === 2) {
                var p1 = pointersRef.current[pointerIds[0]];
                var p2 = pointersRef.current[pointerIds[1]];
                var dist = Math.hypot((p2.x - p1.x), (p2.y - p1.y));
                pinchRef.current = { active: true, startDistance: dist || 1, startZoom: zoomRef.current || 1 };
            }
        }

        function handlePointerMove(event) {
            var state = dragStateRef.current;
            if (pointersRef.current[event.pointerId]) {
                pointersRef.current[event.pointerId].x = event.clientX || 0;
                pointersRef.current[event.pointerId].y = event.clientY || 0;
            }
            var pointerIds = Object.keys(pointersRef.current);
            if (pointerIds.length === 2 && pinchRef.current.active) {
                var p1 = pointersRef.current[pointerIds[0]];
                var p2 = pointersRef.current[pointerIds[1]];
                var dist = Math.hypot((p2.x - p1.x), (p2.y - p1.y));
                var nextZoom = pinchRef.current.startZoom * (dist / (pinchRef.current.startDistance || 1));
                zoomRef.current = Math.max(0.65, Math.min(2.4, nextZoom));
                setZoomUi(zoomRef.current);
                return;
            }
            if (!state.active) return;
            var x = event.clientX || 0;
            var y = event.clientY || 0;
            var dx = x - state.lastX;
            var dy = y - state.lastY;
            state.lastX = x;
            state.lastY = y;
            pointerTravelRef.current += Math.abs(dx) + Math.abs(dy);
            state.vx = dx * 0.0009;
            state.vy = dy * 0.0009;
        }

        function handlePointerUp(event) {
            var state = dragStateRef.current;
            state.active = false;
            delete pointersRef.current[event.pointerId];
            if (Object.keys(pointersRef.current).length < 2) {
                pinchRef.current.active = false;
            }
            if (pointerTravelRef.current < 10 && graphData.nodes.length) {
                var canvas = canvasRef.current;
                var projected = projectedRef.current || [];
                if (canvas && event) {
                    var rect = canvas.getBoundingClientRect();
                    var localX = (event.clientX || 0) - rect.left;
                    var localY = (event.clientY || 0) - rect.top;
                    var nearestIndex = -1;
                    var nearestDist = Infinity;
                    projected.forEach(function (p, idx) {
                        var dx = p.x - localX;
                        var dy = p.y - localY;
                        var dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearestIndex = idx;
                        }
                    });
                    if (nearestIndex >= 0 && nearestDist <= 22) {
                        selectedIndexRef.current = nearestIndex;
                        setSelectedLabel(graphData.nodes[nearestIndex].label || 'Узел');
                    } else {
                        selectedIndexRef.current = -1;
                        setSelectedLabel('');
                    }
                }
            }
        }

        function handleWheel(event) {
            if (!event) return;
            event.preventDefault();
            var delta = event.deltaY > 0 ? -0.08 : 0.08;
            zoomRef.current = Math.max(0.65, Math.min(2.4, (zoomRef.current || 1) + delta));
            setZoomUi(zoomRef.current);
        }

        function handleResetView() {
            zoomRef.current = 1;
            setZoomUi(1);
            selectedIndexRef.current = -1;
            setSelectedLabel('');
            dragStateRef.current.vx = 0.004;
            dragStateRef.current.vy = 0.002;
        }

        return h('section', { className: 'planning-card planning-context-graph' }, [
            h('div', { key: 'header', className: 'planning-context-section-head' }, [
                h('h3', { key: 'title', className: 'planning-section__title' }, 'Карта связей'),
                h('p', { key: 'desc', className: 'planning-section__desc' }, 'Узлы — это задачи, проекты и inbox-записи. Связи создаются автоматически при промоуте, а также вручную агентом.'),
            ]),
            h('div', { key: 'canvasWrap', className: 'planning-context-graph-canvas-wrap' }, [
                h('canvas', {
                    key: 'canvas',
                    ref: canvasRef,
                    className: 'planning-context-graph-canvas',
                    onWheel: handleWheel,
                    onPointerDown: handlePointerDown,
                    onPointerMove: handlePointerMove,
                    onPointerUp: handlePointerUp,
                    onPointerCancel: handlePointerUp,
                    onPointerLeave: handlePointerUp,
                }),
                h('div', { key: 'hint', className: 'planning-context-graph-canvas-hint' }, 'Крути пальцем: 3D-карта узлов и связей'),
                h('button', {
                    key: 'reset',
                    type: 'button',
                    className: 'planning-btn planning-btn--ghost planning-btn--sm planning-context-graph-reset',
                    onClick: handleResetView,
                }, 'Reset view'),
            ]),
            h('div', { key: 'legend', className: 'planning-context-graph-legend' }, [
                h('span', { key: 'l-task', className: 'planning-context-graph-legend__item planning-context-graph-legend__item--task' }, 'task'),
                h('span', { key: 'l-project', className: 'planning-context-graph-legend__item planning-context-graph-legend__item--project' }, 'project'),
                h('span', { key: 'l-context', className: 'planning-context-graph-legend__item planning-context-graph-legend__item--context' }, 'context'),
                h('span', { key: 'l-zoom', className: 'planning-context-graph-legend__item' }, 'zoom x' + Number(zoomUi || 1).toFixed(2)),
                selectedLabel ? h('span', { key: 'l-selected', className: 'planning-context-graph-legend__selected' }, 'Выбрано: ' + selectedLabel) : null,
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

        function handleOpenAgentHandoff() {
            if (typeof document === 'undefined') return;
            var handoffSection = document.getElementById('planning-agent-handoff');
            if (!handoffSection || typeof handoffSection.scrollIntoView !== 'function') return;
            handoffSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            h(QuickCaptureSection, {
                key: 'capture',
                onCapture: handleCapture,
                onCaptureAsTask: handleCaptureAsTask,
                onOpenAgentHandoff: handleOpenAgentHandoff,
            }),
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

    Planning.refreshPlanningFromCloud = refreshPlanningFromCloud;

    HEYS.PlanningContext = {
        ContextScreen,
    };
})();
