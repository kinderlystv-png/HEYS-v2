// heys_planning_quick_target_v1.js — shared «Проект / подпроект» dropdown (quick-add target)
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const Planning = HEYS.Planning || {};
    if (!React || !Planning.Utils) return;

    const h = React.createElement;
    const { useState, useMemo, useRef, useEffect } = React;
    const { sortByOrder } = Planning.Utils;

    function normalizePaletteHex(value) {
        const input = String(value || '').trim().toLowerCase();
        if (!input) return null;
        if (/^#[0-9a-f]{6}$/.test(input)) return input;
        if (/^#[0-9a-f]{3}$/.test(input)) {
            return '#' + input.slice(1).split('').map((char) => char + char).join('');
        }
        return null;
    }

    function buildTaskLookup(tasks) {
        return new Map((Array.isArray(tasks) ? tasks : [])
            .filter(Boolean)
            .map((task) => [task.id, task]));
    }

    function resolveTaskProjectScope(taskId, taskLookup, validProjectIds, cache, trail) {
        if (!taskId || !taskLookup.has(taskId)) return undefined;
        if (cache.has(taskId)) return cache.get(taskId);
        if (trail.has(taskId)) return undefined;

        trail.add(taskId);
        const task = taskLookup.get(taskId);
        let resolvedProjectId;

        if (task?.parentTaskId && taskLookup.has(task.parentTaskId)) {
            resolvedProjectId = resolveTaskProjectScope(task.parentTaskId, taskLookup, validProjectIds, cache, trail);
        } else {
            const rawProjectId = task?.projectId || undefined;
            resolvedProjectId = rawProjectId && validProjectIds.has(rawProjectId)
                ? rawProjectId
                : undefined;
        }

        trail.delete(taskId);
        cache.set(taskId, resolvedProjectId);
        return resolvedProjectId;
    }

    function buildResolvedTaskProjectMap(tasks, projects) {
        const taskLookup = buildTaskLookup(tasks);
        const validProjectIds = new Set((Array.isArray(projects) ? projects : [])
            .map((project) => project?.id)
            .filter(Boolean));
        const cache = new Map();

        taskLookup.forEach((task, taskId) => {
            resolveTaskProjectScope(taskId, taskLookup, validProjectIds, cache, new Set());
        });

        return cache;
    }

    function getResolvedTaskProjectId(taskId, resolvedTaskProjectIds) {
        if (!taskId || !resolvedTaskProjectIds?.has(taskId)) return undefined;
        return resolvedTaskProjectIds.get(taskId) || undefined;
    }

    function createQuickTargetValue(kind, id) {
        if (kind === 'project' && id) return 'project:' + id;
        if (kind === 'task' && id) return 'task:' + id;
        return '';
    }

    function parseQuickTargetValue(value) {
        const rawValue = String(value || '');
        if (!rawValue) return { kind: 'root' };
        if (rawValue.indexOf('project:') === 0) return { kind: 'project', id: rawValue.slice(8) };
        if (rawValue.indexOf('task:') === 0) return { kind: 'task', id: rawValue.slice(5) };
        return { kind: 'root' };
    }

    function buildQuickTargetTaskLabel(title, depth) {
        const safeTitle = String(title || '').trim() || 'Без названия';
        const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(Math.max(depth + 1, 1));
        return indent + '↳ ' + safeTitle;
    }

    function appendQuickTargetTaskOptions(options, tasks, resolvedTaskProjectIds, projectId, parentTaskId, depth) {
        const siblings = sortByOrder((tasks || []).filter((task) => (
            (task.parentTaskId || '') === (parentTaskId || '')
            && (
                parentTaskId
                    ? true
                    : (getResolvedTaskProjectId(task.id, resolvedTaskProjectIds) || '') === (projectId || '')
            )
        )));

        siblings.forEach((task) => {
            const hasChildren = (tasks || []).some((entry) => (entry.parentTaskId || '') === task.id);
            const safeTitle = String(task.title || '').trim() || 'Без названия';
            options.push({
                value: createQuickTargetValue('task', task.id),
                label: buildQuickTargetTaskLabel(safeTitle, depth),
                shortLabel: '↳ ' + safeTitle,
                kind: hasChildren ? 'subproject' : 'task',
                depth,
            });
            appendQuickTargetTaskOptions(options, tasks, resolvedTaskProjectIds, projectId, task.id, depth + 1);
        });
    }

    function buildQuickTargetOptions(projects, tasks, resolvedTaskProjectIds) {
        const options = [{
            value: '',
            label: '📁 Без проекта',
            shortLabel: '📁 Без проекта',
            kind: 'project',
            depth: 0,
            projectColor: '#94a3b8',
            isRoot: true,
        }];
        appendQuickTargetTaskOptions(options, tasks, resolvedTaskProjectIds, '', undefined, 0);

        (projects || []).forEach((project) => {
            const safeProjectName = String(project.name || '').trim() || 'Без названия';
            options.push({
                value: createQuickTargetValue('project', project.id),
                label: '📁 ' + safeProjectName,
                shortLabel: '📁 ' + safeProjectName,
                kind: 'project',
                depth: 0,
                projectColor: normalizePaletteHex(project.color) || '#94a3b8',
            });
            appendQuickTargetTaskOptions(options, tasks, resolvedTaskProjectIds, project.id, undefined, 0);
        });

        return options;
    }

    function resolveQuickTargetValue(targetValue, tasks, resolvedTaskProjectIds) {
        const parsed = parseQuickTargetValue(targetValue);
        if (parsed.kind === 'project') {
            return { projectId: parsed.id || undefined, parentTaskId: undefined };
        }
        if (parsed.kind === 'task') {
            const parentTask = (tasks || []).find((task) => task.id === parsed.id);
            if (!parentTask) return { projectId: undefined, parentTaskId: undefined };
            return {
                projectId: getResolvedTaskProjectId(parentTask.id, resolvedTaskProjectIds),
                parentTaskId: parentTask.id,
            };
        }
        return { projectId: undefined, parentTaskId: undefined };
    }

    function findProjectName(projectId, projects) {
        if (!projectId) return 'Без проекта';
        const project = (projects || []).find((entry) => entry.id === projectId);
        return project?.name || 'Без проекта';
    }

    function buildTaskLineage(taskId, tasks) {
        const taskMap = new Map((tasks || []).map((task) => [task.id, task]));
        const lineage = [];
        let currentTask = taskMap.get(taskId);
        let guard = 0;

        while (currentTask && guard < 120) {
            lineage.unshift(currentTask);
            currentTask = currentTask.parentTaskId ? taskMap.get(currentTask.parentTaskId) : null;
            guard += 1;
        }

        return lineage;
    }

    function buildQuickTargetPreview(targetValue, projects, tasks, resolvedTaskProjectIds) {
        const parsed = parseQuickTargetValue(targetValue);
        if (parsed.kind !== 'task' || !parsed.id) return null;

        const lineage = buildTaskLineage(parsed.id, tasks);
        if (lineage.length === 0) return null;

        const leafTask = lineage[lineage.length - 1];
        const parentPath = lineage.slice(0, -1).map((task) => String(task.title || '').trim()).filter(Boolean);
        const projectName = findProjectName(getResolvedTaskProjectId(leafTask.id, resolvedTaskProjectIds), projects);
        const contextParts = [projectName].concat(parentPath).filter(Boolean);

        return {
            context: contextParts.join(' / '),
            primary: String(leafTask.title || '').trim() || 'Подзадача',
        };
    }

    function encodePlanningFieldsToQuickValue(projectId, parentTaskId) {
        if (parentTaskId) return createQuickTargetValue('task', parentTaskId);
        if (projectId) return createQuickTargetValue('project', projectId);
        return '';
    }

    function resolveQuickTargetToFormFields(quickValue, tasks, resolvedTaskProjectIds) {
        const r = resolveQuickTargetValue(quickValue, tasks, resolvedTaskProjectIds);
        return {
            taskProjectId: r.projectId || '',
            taskParentTaskId: r.parentTaskId || '',
        };
    }

    /**
     * Тот же UI, что у quick-add на экране задач: trigger + listbox + preview.
     */
    function PlanningQuickTargetField({
        value,
        onChange,
        projects,
        tasks,
        resolvedTaskProjectIds,
        tabsSelector = '.tabs',
        fieldClassName,
        modalMenuMode = false,
    }) {
        const fieldRef = useRef(null);
        const [menuOpen, setMenuOpen] = useState(false);
        const [menuMaxHeight, setMenuMaxHeight] = useState(null);
        const isModalMenuMode = Boolean(modalMenuMode);

        const options = useMemo(
            () => buildQuickTargetOptions(projects, tasks, resolvedTaskProjectIds),
            [projects, resolvedTaskProjectIds, tasks],
        );

        const preview = useMemo(
            () => buildQuickTargetPreview(value, projects, tasks, resolvedTaskProjectIds),
            [value, projects, resolvedTaskProjectIds, tasks],
        );

        const selectedOption = useMemo(() => {
            const selected = options.find((option) => option.value === value);
            if (selected) return selected;
            return options[0] || null;
        }, [options, value]);

        useEffect(() => {
            const parsed = parseQuickTargetValue(value);
            if (parsed.kind !== 'task' || !parsed.id) return;
            const exists = options.some((option) => option.value === value);
            if (exists) return;

            const originalTask = (tasks || []).find((task) => task.id === parsed.id);
            const originalProjectId = originalTask
                ? getResolvedTaskProjectId(originalTask.id, resolvedTaskProjectIds)
                : undefined;
            if (originalProjectId) {
                onChange(createQuickTargetValue('project', originalProjectId));
                return;
            }
            onChange('');
        }, [onChange, options, resolvedTaskProjectIds, tasks, value]);

        useEffect(() => {
            if (!menuOpen) return undefined;
            const handlePointerDown = (event) => {
                const rootNode = fieldRef.current;
                if (!rootNode || rootNode.contains(event.target)) return;
                setMenuOpen(false);
            };
            window.addEventListener('pointerdown', handlePointerDown);
            return () => window.removeEventListener('pointerdown', handlePointerDown);
        }, [menuOpen]);

        useEffect(() => {
            if (!menuOpen || isModalMenuMode) return undefined;

            const recalculateMenuMaxHeight = () => {
                if (typeof window === 'undefined') return;
                const rootNode = fieldRef.current;
                if (!rootNode) return;

                const triggerRect = rootNode.getBoundingClientRect();
                const tabsEl = tabsSelector ? document.querySelector(tabsSelector) : null;
                const tabsHeight = Math.round(tabsEl?.getBoundingClientRect?.().height || 76);
                const spaceBelowTrigger = window.innerHeight - tabsHeight - triggerRect.bottom - 8;
                const nextMaxHeight = Math.max(140, Math.round(spaceBelowTrigger));
                setMenuMaxHeight(nextMaxHeight);
            };

            recalculateMenuMaxHeight();
            window.addEventListener('resize', recalculateMenuMaxHeight);
            window.addEventListener('scroll', recalculateMenuMaxHeight, true);
            return () => {
                window.removeEventListener('resize', recalculateMenuMaxHeight);
                window.removeEventListener('scroll', recalculateMenuMaxHeight, true);
            };
        }, [isModalMenuMode, menuOpen, tabsSelector]);

        const activeMenuValue = value;

        return h('div', {
            className: 'planning-quick-target-field'
                + (preview ? ' has-preview' : '')
                + (isModalMenuMode ? ' planning-quick-target-field--modal-menu' : '')
                + (isModalMenuMode && menuOpen ? ' is-menu-open' : '')
                + (fieldClassName ? (' ' + fieldClassName) : ''),
        },
            h('div', {
                className: 'planning-quick-target-select' + (menuOpen ? ' is-open' : ''),
                ref: fieldRef,
            },
                h('button', {
                    type: 'button',
                    className: 'planning-quick-target-trigger',
                    'aria-expanded': menuOpen ? 'true' : 'false',
                    'aria-haspopup': 'listbox',
                    onClick: () => setMenuOpen((open) => !open),
                },
                    h('span', {
                        className: 'planning-quick-target-trigger__label'
                            + (selectedOption?.kind === 'project' ? ' is-project' : ''),
                        style: selectedOption?.kind === 'project' && selectedOption?.projectColor
                            ? { '--planning-quick-target-color': selectedOption.projectColor }
                            : undefined,
                    }, selectedOption?.shortLabel || '📁 Без проекта'),
                    h('span', { className: 'planning-quick-target-trigger__chevron', 'aria-hidden': 'true' }, '▾'),
                ),
                isModalMenuMode && menuOpen && h('div', {
                    className: 'planning-quick-target-menu__backdrop',
                    onClick: (event) => { event.stopPropagation(); setMenuOpen(false); },
                    onPointerDown: (event) => { event.stopPropagation(); },
                }),
                menuOpen && h('div', {
                    className: 'planning-quick-target-menu'
                        + (isModalMenuMode ? ' planning-quick-target-menu--modal' : ''),
                    role: 'listbox',
                    style: isModalMenuMode
                        ? undefined
                        : (menuMaxHeight ? { maxHeight: menuMaxHeight + 'px' } : undefined),
                },
                    isModalMenuMode
                        ? h('div', { className: 'planning-quick-target-menu__options' },
                            options.map((option) => h('button', {
                                key: option.value || '__root__',
                                type: 'button',
                                className: 'planning-quick-target-option'
                                    + (option.kind ? (' planning-quick-target-option--' + option.kind) : '')
                                    + (option.value === activeMenuValue ? ' active' : ''),
                                style: option.kind === 'project' && option.projectColor
                                    ? { '--planning-quick-target-color': option.projectColor }
                                    : (option.depth > 0 ? { '--planning-quick-target-depth': String(option.depth) } : undefined),
                                role: 'option',
                                'aria-selected': option.value === activeMenuValue ? 'true' : 'false',
                                onClick: () => {
                                    onChange(option.value);
                                    setMenuOpen(false);
                                },
                            }, option.label)),
                        )
                        : options.map((option) => h('button', {
                            key: option.value || '__root__',
                            type: 'button',
                            className: 'planning-quick-target-option'
                                + (option.kind ? (' planning-quick-target-option--' + option.kind) : '')
                                + (option.value === activeMenuValue ? ' active' : ''),
                            style: option.kind === 'project' && option.projectColor
                                ? { '--planning-quick-target-color': option.projectColor }
                                : (option.depth > 0 ? { '--planning-quick-target-depth': String(option.depth) } : undefined),
                            role: 'option',
                            'aria-selected': option.value === activeMenuValue ? 'true' : 'false',
                            onClick: () => {
                                onChange(option.value);
                                setMenuOpen(false);
                            },
                        }, option.label)),
                    isModalMenuMode && h('div', { className: 'planning-quick-target-menu__footer' },
                        h('button', {
                            type: 'button',
                            className: 'planning-quick-target-menu__cancel',
                            onClick: () => {
                                onChange('');
                                setMenuOpen(false);
                            },
                        }, 'Отменить выбор'),
                    ),
                ),
            ),
            preview && h('div', { className: 'planning-quick-target-preview' },
                preview.context && h('span', { className: 'planning-quick-target-preview__context' }, preview.context),
                h('span', { className: 'planning-quick-target-preview__primary' }, preview.primary),
            ),
        );
    }

    HEYS.PlanningQuickTarget = {
        buildTaskLookup,
        createQuickTargetValue,
        parseQuickTargetValue,
        resolveQuickTargetValue,
        buildQuickTargetOptions,
        buildQuickTargetPreview,
        buildResolvedTaskProjectMap,
        getResolvedTaskProjectId,
        encodePlanningFieldsToQuickValue,
        resolveQuickTargetToFormFields,
        PlanningQuickTargetField,
    };
}());

