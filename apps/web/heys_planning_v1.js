// heys_planning_v1.js — coordinator for HEYS planning runtime
// PIN-only access: renders only when !cloudUser && clientId

(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const h = React.createElement;
    const { useMemo, useState, useEffect, useRef } = React;
    const Planning = HEYS.Planning = HEYS.Planning || {};

    const SUBNAV_ITEMS = [
        { id: 'tasks', label: 'Список', shortLabel: 'Список', icon: '☑️' },
        { id: 'goals', label: 'Целеполагание', shortLabel: 'Цели', icon: '🎯' },
        { id: 'calendar', label: 'Календарь', shortLabel: 'Кален.', icon: '📅' },
        { id: 'chrono', label: 'Хронометраж', shortLabel: 'Хроно', icon: '⏱️' },
        { id: 'checklists', label: 'Чеклисты', shortLabel: 'Чеклисты', icon: '📋' },
    ];
    const SUBNAV_RENDER_ITEMS = [
        SUBNAV_ITEMS[0],
        { id: 'matrix', label: 'Матрица Эйзенхауэра', shortLabel: 'Матрица', action: 'taskMatrix' },
        ...SUBNAV_ITEMS.slice(1),
    ];
    const DEFAULT_HOME_SCREEN = 'calendar';

    function resolvePlanningHomeScreen(candidate) {
        return SUBNAV_ITEMS.some((item) => item.id === candidate) ? candidate : DEFAULT_HOME_SCREEN;
    }

    function getInitialPlanningHomeScreen(candidate) {
        if (typeof candidate === 'string' && candidate.length > 0) {
            return resolvePlanningHomeScreen(candidate);
        }

        const appPreferredScreen = typeof HEYS?.App?.getDefaultTasksSubtab === 'function'
            ? HEYS.App.getDefaultTasksSubtab()
            : null;

        return resolvePlanningHomeScreen(appPreferredScreen);
    }

    function resolveNextPlanningHomeScreen(currentScreen, requestedScreen, hasUserNavigated) {
        const safeCurrentScreen = resolvePlanningHomeScreen(currentScreen);
        const safeRequestedScreen = resolvePlanningHomeScreen(requestedScreen);

        if (hasUserNavigated) return safeCurrentScreen;

        // Only auto-apply when still at the initial default fallback screen.
        // This prevents jumps caused by profile-updated / client-changed events
        // when the parent's defaultTasksSubtab changes while PlanningTab is
        // already showing a real subtab (meaning the profile loaded correctly).
        if (safeCurrentScreen !== DEFAULT_HOME_SCREEN) return safeCurrentScreen;

        return safeRequestedScreen;
    }

    function PlanningFallback() {
        return h('div', { className: 'planning-tab' },
            h('div', { className: 'planning-content' },
                h('div', { className: 'planning-empty' },
                    'Planning modules ещё загружаются. Обнови экран, если состояние зависло.',
                ),
            ),
        );
    }

    const Checklists = Planning.Checklists || {};
    const {
        DEFAULT_CHILD_AGE,
        DEFAULT_DAY_TEMP,
        DEFAULT_NIGHT_TEMP,
        DEFAULT_NIGHTS,
        NIGHTS_MIN,
        NIGHTS_MAX,
        CHECKLIST_PRESETS,
        clampCount,
        clampDayTemp,
        clampNightTemp,
        clampNights,
        formatNightsLabel,
        formatTemp,
        getDayTempBand,
        getNightTempBand,
        formatChildAgeInline,
        normalizeChildAges,
        buildPresetToggleOptions,
        resolveToggleValue,
        getChecklistCustomGroups,
        normalizeChecklistGroupName,
        groupChecklistItems,
        getChecklistPreset,
        getPresetChecklistParams,
        isCustomChecklistItemId,
        normalizeChecklistItemOverrides,
        normalizeChecklistGroupOverrides,
        buildSeaTentChecklistPreset,
        buildMountainChecklistPreset,
        buildSeaHotelChecklistPreset,
        buildCityRentChecklistPreset,
        buildCityHotelChecklistPreset,
        buildSkiChecklistPreset,
        buildBusinessChecklistPreset,
        buildDachaChecklistPreset,
        buildAbroadChecklistPreset,
        materializeSeaTentItems,
    } = Checklists;

    function ChecklistsScreen({ state } = {}) {
        const allChecklists = Array.isArray(state?.checklists) ? state.checklists : [];
        const archivedChecklists = allChecklists.filter((checklist) => checklist?.status === 'archived');
        const checklists = allChecklists.filter((checklist) => checklist?.status !== 'archived');
        const [createOpen, setCreateOpen] = useState(false);
        const [archiveOpen, setArchiveOpen] = useState(false);
        const [createMode, setCreateMode] = useState('custom');
        const [customTitle, setCustomTitle] = useState('');
        const [adults, setAdults] = useState(2);
        const [children, setChildren] = useState(0);
        const [childAges, setChildAges] = useState([]);
        const [dayTemp, setDayTemp] = useState(DEFAULT_DAY_TEMP);
        const [nightTemp, setNightTemp] = useState(DEFAULT_NIGHT_TEMP);
        const [nights, setNights] = useState(DEFAULT_NIGHTS);
        const [toggleState, setToggleState] = useState({});
        const [selectedPresetId, setSelectedPresetId] = useState(CHECKLIST_PRESETS[0].id);
        const [addItemTarget, setAddItemTarget] = useState(null);
        const [newItemText, setNewItemText] = useState('');
        const [newItemQty, setNewItemQty] = useState('');
        const [addSectionTarget, setAddSectionTarget] = useState(null);
        const [newSectionName, setNewSectionName] = useState('');
        const [confirmState, setConfirmState] = useState(null);
        const [promptState, setPromptState] = useState(null);
        const [promptValues, setPromptValues] = useState({});
        const [collapsedById, setCollapsedById] = useState({});
        const [paramsCollapsedById, setParamsCollapsedById] = useState({});
        const [deleteModeChecklistId, setDeleteModeChecklistId] = useState(null);
        const [selectedDeleteIds, setSelectedDeleteIds] = useState({});
        const selectedPresetDef = useMemo(
            () => CHECKLIST_PRESETS.find((preset) => preset.id === selectedPresetId) || CHECKLIST_PRESETS[0],
            [selectedPresetId],
        );
        const presetToggleOptions = useMemo(
            () => buildPresetToggleOptions(selectedPresetDef, toggleState),
            [selectedPresetDef, toggleState],
        );
        const presetBuildOptions = useMemo(
            () => ({ ...presetToggleOptions, nights }),
            [presetToggleOptions, nights],
        );
        const builtPreset = useMemo(
            () => selectedPresetDef.build(adults, children, childAges, dayTemp, nightTemp, presetBuildOptions),
            [selectedPresetDef, adults, children, childAges, dayTemp, nightTemp, presetBuildOptions],
        );
        const previewItems = useMemo(
            () => builtPreset.items.map((entry) => ({ ...entry, done: false })),
            [builtPreset],
        );

        const anyModalOpen = createOpen || archiveOpen || addItemTarget != null
            || addSectionTarget != null || confirmState != null || promptState != null;
        useEffect(() => {
            if (typeof document === 'undefined' || !document.body || !anyModalOpen) return undefined;
            document.body.classList.add('planning-checklist-modal-open');
            return () => {
                document.body.classList.remove('planning-checklist-modal-open');
            };
        }, [anyModalOpen]);

        const setCount = (kind, delta) => {
            if (kind === 'adults') {
                setAdults((value) => clampCount(value + delta, 1, 12));
            } else {
                setChildren((value) => {
                    const next = clampCount(value + delta, 0, 12);
                    setChildAges((ages) => normalizeChildAges(next, ages));
                    return next;
                });
            }
        };

        const setTemp = (kind, delta) => {
            if (kind === 'day') {
                setDayTemp((value) => clampDayTemp(value + delta));
            } else {
                setNightTemp((value) => clampNightTemp(value + delta));
            }
        };

        const setNightsDelta = (delta) => {
            setNights((value) => clampNights(value + delta));
        };

        const setPreviewChildAge = (index, delta) => {
            setChildAges((ages) => {
                const normalized = normalizeChildAges(children, ages);
                normalized[index] = clampCount((normalized[index] ?? DEFAULT_CHILD_AGE) + delta, 0, 17);
                return normalized;
            });
        };

        const openCreateModal = (mode) => {
            setCreateMode(mode === 'preset' ? 'preset' : 'custom');
            setCreateOpen(true);
        };

        const closeCreateModal = () => {
            setCreateOpen(false);
        };

        const openArchiveModal = () => {
            setArchiveOpen(true);
        };

        const closeArchiveModal = () => {
            setArchiveOpen(false);
        };

        const handleCreateCustom = () => {
            if (typeof state?.addChecklist !== 'function') return;
            const title = String(customTitle || '').trim() || 'Новый чек-лист';
            state.addChecklist({ title, items: [] });
            setCustomTitle('');
            closeCreateModal();
        };

        const handleCreatePreset = () => {
            if (typeof state?.addChecklist !== 'function') return;
            const toggleFields = {};
            selectedPresetDef.toggles.forEach((toggle) => {
                toggleFields[toggle.key] = presetToggleOptions[toggle.key];
            });
            state.addChecklist({
                title: builtPreset.title,
                presetId: builtPreset.id,
                adults,
                children,
                childAges: builtPreset.childAges,
                dayTemp: builtPreset.dayTemp,
                nightTemp: builtPreset.nightTemp,
                nights: builtPreset.nights,
                ...toggleFields,
                items: previewItems,
            });
            closeCreateModal();
        };

        const toggleSavedItem = (checklist, itemId) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const items = (Array.isArray(checklist.items) ? checklist.items : []).map((entry) => (
                entry.id === itemId ? { ...entry, done: entry.done !== true } : entry
            ));
            state.updateChecklist(checklist.id, { items });
        };

        // Удаление пункта только в этом чеклисте. Для пресет-пунктов пишем тумбстон
        // (removedPresetIds), чтобы пересборка по взрослым/детям/t не вернула пункт.
        // Ручные пункты (custom-…) просто убираются из items. Шаблон пресета не меняется.
        const deleteSavedItem = (checklist, itemId) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const items = (Array.isArray(checklist.items) ? checklist.items : [])
                .filter((entry) => entry.id !== itemId);
            const patch = { items };
            if (getChecklistPreset(checklist) && !isCustomChecklistItemId(itemId)) {
                const removed = Array.isArray(checklist.removedPresetIds)
                    ? checklist.removedPresetIds.map(String)
                    : [];
                if (!removed.includes(String(itemId))) removed.push(String(itemId));
                patch.removedPresetIds = removed;
            }
            state.updateChecklist(checklist.id, patch);
        };

        const deleteSavedItems = (checklist, itemIds, options = {}) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const ids = Array.from(new Set((Array.isArray(itemIds) ? itemIds : [itemIds])
                .filter((id) => id != null)
                .map(String)));
            const removeGroups = Array.isArray(options.removeGroups) && options.removeGroups.length > 0
                ? new Set(options.removeGroups.map((group) => (
                    normalizeChecklistGroupName(group).toLocaleLowerCase('ru-RU')
                )))
                : null;
            if (ids.length === 0 && !removeGroups) return;
            const removeSet = new Set(ids);
            const currentItems = Array.isArray(checklist.items) ? checklist.items : [];
            const items = currentItems.filter((entry) => !removeSet.has(String(entry?.id)));
            const patch = { items };
            if (removeGroups) {
                patch.customGroups = getChecklistCustomGroups(checklist)
                    .filter((group) => !removeGroups.has(group.toLocaleLowerCase('ru-RU')));
            }
            if (getChecklistPreset(checklist)) {
                const removed = Array.isArray(checklist.removedPresetIds)
                    ? checklist.removedPresetIds.map(String)
                    : [];
                ids.forEach((id) => {
                    if (!isCustomChecklistItemId(id) && !removed.includes(id)) removed.push(id);
                });
                patch.removedPresetIds = removed;
            }
            state.updateChecklist(checklist.id, patch);
            setSelectedDeleteIds((current) => {
                if (deleteModeChecklistId !== checklist.id) return current;
                const next = { ...current };
                ids.forEach((id) => { delete next[id]; });
                return next;
            });
        };

        const deleteSavedSection = (checklist, groupName) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const groupKey = normalizeChecklistGroupName(groupName).toLocaleLowerCase('ru-RU');
            const ids = (Array.isArray(checklist.items) ? checklist.items : [])
                .filter((entry) => normalizeChecklistGroupName(entry?.group).toLocaleLowerCase('ru-RU') === groupKey)
                .map((entry) => entry.id);
            deleteSavedItems(checklist, ids, { removeGroups: [groupName] });
        };

        const editSavedItem = (checklist, itemId) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const items = Array.isArray(checklist.items) ? checklist.items : [];
            const current = items.find((entry) => entry.id === itemId);
            if (!current) return;
            requestPrompt({
                title: 'Редактировать пункт',
                confirmLabel: 'Сохранить',
                fields: [
                    { key: 'text', label: 'Название', placeholder: 'Название пункта', value: current.text || '' },
                    { key: 'quantity', label: 'Количество', placeholder: 'Количество (необязательно)', value: current.quantity || '' },
                ],
                onSubmit: (values) => {
                    const nextText = values.text;
                    if (!nextText) return;
                    const nextQuantity = values.quantity;
                    const nextItems = items.map((entry) => (
                        entry.id === itemId
                            ? { ...entry, text: nextText, quantity: nextQuantity || undefined }
                            : entry
                    ));
                    const patch = { items: nextItems };
                    if (getChecklistPreset(checklist) && !isCustomChecklistItemId(itemId)) {
                        const overrides = normalizeChecklistItemOverrides(checklist.itemOverrides);
                        overrides[String(itemId)] = {
                            ...(overrides[String(itemId)] || {}),
                            text: nextText,
                            quantity: nextQuantity,
                        };
                        patch.itemOverrides = overrides;
                    }
                    state.updateChecklist(checklist.id, patch);
                },
            });
        };

        // Добавление ручного пункта в группу — только этот чеклист. Кастомный id
        // (custom-…) переживает пересборку пресета через materializeSeaTentItems.
        const addSavedItem = (checklist, group, details) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return false;
            const text = String(details?.text || '').trim();
            if (!text) return false;
            const targetGroup = normalizeChecklistGroupName(group);
            const quantity = String(details?.quantity || '').trim();
            const existing = Array.isArray(checklist.items) ? checklist.items : [];
            const suffix = Math.random().toString(36).slice(2, 8);
            const newItem = {
                id: 'custom-' + String(Date.now()) + '-' + suffix,
                group: targetGroup,
                text,
                quantity: quantity || undefined,
                done: false,
                order: 9000 + existing.length,
            };
            state.updateChecklist(checklist.id, { items: existing.concat(newItem) });
            return true;
        };

        const openAddItemModal = (checklist, group) => {
            setAddItemTarget({ checklistId: checklist.id, group });
            setNewItemText('');
            setNewItemQty('');
        };

        const addSavedSection = (checklist, name) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return false;
            const group = normalizeChecklistGroupName(name);
            if (!String(name || '').trim()) return false;
            const groups = getChecklistCustomGroups(checklist);
            const existingNames = groupChecklistItems(checklist.items, groups)
                .map((section) => section.group.toLocaleLowerCase('ru-RU'));
            if (existingNames.includes(group.toLocaleLowerCase('ru-RU'))) return false;
            state.updateChecklist(checklist.id, { customGroups: groups.concat(group) });
            return true;
        };

        const openAddSectionModal = (checklist) => {
            setAddSectionTarget({ checklistId: checklist.id });
            setNewSectionName('');
        };

        const closeAddSectionModal = () => {
            setAddSectionTarget(null);
            setNewSectionName('');
        };

        const handleAddSectionSubmit = () => {
            if (!addSectionTarget) return;
            const checklist = checklists.find((entry) => entry.id === addSectionTarget.checklistId);
            if (!checklist) {
                closeAddSectionModal();
                return;
            }
            if (addSavedSection(checklist, newSectionName)) closeAddSectionModal();
        };

        // Общая модалка подтверждения (удаление пунктов, разделов и т.п.).
        const requestConfirm = (config) => {
            setConfirmState(config && typeof config === 'object' ? config : null);
        };

        const closeConfirm = () => setConfirmState(null);

        const handleConfirm = () => {
            const action = confirmState && typeof confirmState.onConfirm === 'function' ? confirmState.onConfirm : null;
            setConfirmState(null);
            if (action) action();
        };

        // Общая модалка ввода (редактирование пункта, переименование раздела/чек-листа).
        // config: { title, fields:[{key,label,placeholder,value}], confirmLabel, onSubmit(values) }.
        const requestPrompt = (config) => {
            if (!config || !Array.isArray(config.fields)) return;
            const initial = {};
            config.fields.forEach((field) => { initial[field.key] = String(field.value || ''); });
            setPromptValues(initial);
            setPromptState(config);
        };

        const closePrompt = () => {
            setPromptState(null);
            setPromptValues({});
        };

        const handlePromptSubmit = () => {
            if (!promptState) return;
            const fields = Array.isArray(promptState.fields) ? promptState.fields : [];
            const values = {};
            fields.forEach((field) => { values[field.key] = String(promptValues[field.key] || '').trim(); });
            const first = fields[0];
            if (first && !values[first.key]) return; // первое поле обязательно
            const action = typeof promptState.onSubmit === 'function' ? promptState.onSubmit : null;
            setPromptState(null);
            setPromptValues({});
            if (action) action(values);
        };

        const applySectionRename = (checklist, currentGroup, nextRaw) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const nextGroup = normalizeChecklistGroupName(nextRaw);
            if (!nextGroup || nextGroup.toLocaleLowerCase('ru-RU') === currentGroup.toLocaleLowerCase('ru-RU')) return;
            const items = Array.isArray(checklist.items) ? checklist.items : [];
            const nextItems = items.map((entry) => (
                normalizeChecklistGroupName(entry?.group).toLocaleLowerCase('ru-RU') === currentGroup.toLocaleLowerCase('ru-RU')
                    ? { ...entry, group: nextGroup }
                    : entry
            ));
            const groups = getChecklistCustomGroups(checklist).map((group) => (
                group.toLocaleLowerCase('ru-RU') === currentGroup.toLocaleLowerCase('ru-RU') ? nextGroup : group
            ));
            const patch = {
                items: nextItems,
                customGroups: getChecklistCustomGroups({ customGroups: groups }),
            };
            const preset = getChecklistPreset(checklist);
            if (preset) {
                const overrides = normalizeChecklistItemOverrides(checklist.itemOverrides);
                const groupOverrides = normalizeChecklistGroupOverrides(checklist.groupOverrides);
                let hasExistingGroupOverride = false;
                Object.keys(groupOverrides).forEach((key) => {
                    if (String(groupOverrides[key]).toLocaleLowerCase('ru-RU') === currentGroup.toLocaleLowerCase('ru-RU')) {
                        groupOverrides[key] = nextGroup;
                        hasExistingGroupOverride = true;
                    }
                });
                if (!hasExistingGroupOverride) {
                    groupOverrides[currentGroup.toLocaleLowerCase('ru-RU')] = nextGroup;
                }
                items.forEach((entry) => {
                    if (!entry || isCustomChecklistItemId(entry.id)) return;
                    if (normalizeChecklistGroupName(entry.group).toLocaleLowerCase('ru-RU') !== currentGroup.toLocaleLowerCase('ru-RU')) return;
                    overrides[String(entry.id)] = {
                        ...(overrides[String(entry.id)] || {}),
                        group: nextGroup,
                    };
                });
                patch.itemOverrides = overrides;
                patch.groupOverrides = groupOverrides;
            }
            state.updateChecklist(checklist.id, patch);
        };

        const renameSavedSection = (checklist, groupName) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const currentGroup = normalizeChecklistGroupName(groupName);
            requestPrompt({
                title: 'Переименовать раздел',
                confirmLabel: 'Сохранить',
                fields: [{ key: 'group', placeholder: 'Название раздела', value: currentGroup }],
                onSubmit: (values) => applySectionRename(checklist, currentGroup, values.group),
            });
        };

        const isBulkDeleteMode = (checklist) => deleteModeChecklistId === checklist?.id;

        const toggleBulkDeleteMode = (checklist) => {
            const checklistId = checklist?.id;
            if (!checklistId) return;
            if (deleteModeChecklistId === checklistId) {
                setDeleteModeChecklistId(null);
                setSelectedDeleteIds({});
                return;
            }
            setDeleteModeChecklistId(checklistId);
            setSelectedDeleteIds({});
        };

        const toggleBulkDeleteItem = (itemId) => {
            const id = String(itemId);
            setSelectedDeleteIds((current) => {
                const next = { ...current };
                if (next[id]) delete next[id];
                else next[id] = true;
                return next;
            });
        };

        const selectedBulkDeleteIds = () => Object.keys(selectedDeleteIds).filter((id) => selectedDeleteIds[id]);

        const confirmBulkDelete = (checklist) => {
            const ids = selectedBulkDeleteIds();
            if (!checklist || ids.length === 0) return;
            requestConfirm({
                title: 'Удалить выбранное',
                message: ids.length + ' ' + (ids.length === 1 ? 'пункт будет удалён' : ids.length <= 4 ? 'пункта будут удалены' : 'пунктов будут удалены') + ' из этого чек-листа.',
                confirmLabel: 'Удалить',
                danger: true,
                onConfirm: () => {
                    deleteSavedItems(checklist, ids);
                    setDeleteModeChecklistId(null);
                    setSelectedDeleteIds({});
                },
            });
        };

        const closeAddItemModal = () => {
            setAddItemTarget(null);
            setNewItemText('');
            setNewItemQty('');
        };

        // Состояние «свёрнут/развёрнут» храним на самом чеклисте → переживает
        // перезагрузку и едет в облако. Локальный collapsedById — лишь сессионный
        // оверрайд (если стора нет / для немедленного отклика до синка).
        const toggleChecklistCollapsed = (checklist) => {
            const checklistId = typeof checklist === 'object' ? checklist?.id : checklist;
            if (!checklistId) return;
            const target = typeof checklist === 'object'
                ? checklist
                : checklists.find((entry) => entry.id === checklistId);
            const wasCollapsed = collapsedById[checklistId] != null
                ? collapsedById[checklistId] === true
                : target?.collapsed === true;
            const next = !wasCollapsed;
            setCollapsedById((current) => ({ ...current, [checklistId]: next }));
            if (typeof state?.updateChecklist === 'function') {
                state.updateChecklist(checklistId, { collapsed: next });
            }
        };

        // Свернуть только блок параметров (люди/t°/тумблеры), оставив пункты видимыми.
        // Состояние храним на чеклисте (paramsCollapsed) → переживает reload и едет в облако.
        const toggleParamsCollapsed = (checklist) => {
            const checklistId = checklist?.id;
            if (!checklistId) return;
            const wasCollapsed = paramsCollapsedById[checklistId] != null
                ? paramsCollapsedById[checklistId] === true
                : checklist?.paramsCollapsed === true;
            const next = !wasCollapsed;
            setParamsCollapsedById((current) => ({ ...current, [checklistId]: next }));
            if (typeof state?.updateChecklist === 'function') {
                state.updateChecklist(checklistId, { paramsCollapsed: next });
            }
        };

        const handleAddItemSubmit = () => {
            if (!addItemTarget) return;
            const checklist = checklists.find((entry) => entry.id === addItemTarget.checklistId);
            if (!checklist) {
                closeAddItemModal();
                return;
            }
            const added = addSavedItem(checklist, addItemTarget.group, { text: newItemText, quantity: newItemQty });
            if (added) closeAddItemModal();
        };

        const archiveSavedChecklist = (checklist) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const title = String(checklist.title || 'чек-лист');
            requestConfirm({
                title: 'В архив',
                message: '«' + title + '» переместится в архив. Его можно вернуть оттуда в любой момент.',
                confirmLabel: 'В архив',
                onConfirm: () => state.updateChecklist(checklist.id, {
                    status: 'archived',
                    archivedAt: new Date().toISOString(),
                }),
            });
        };

        const restoreArchivedChecklist = (checklist) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            state.updateChecklist(checklist.id, {
                status: 'active',
                archivedAt: undefined,
            });
        };

        const deleteArchivedChecklist = (checklist) => {
            if (!checklist || typeof state?.deleteChecklist !== 'function') return;
            const title = String(checklist.title || 'чек-лист');
            requestConfirm({
                title: 'Удалить навсегда',
                message: '«' + title + '» будет удалён без возможности восстановления.',
                confirmLabel: 'Удалить',
                danger: true,
                onConfirm: () => {
                    state.deleteChecklist(checklist.id);
                    if (archivedChecklists.length <= 1) closeArchiveModal();
                },
            });
        };

        const renameSavedChecklist = (checklist) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const currentTitle = String(checklist.title || '').trim() || 'Чек-лист';
            requestPrompt({
                title: 'Переименовать чек-лист',
                confirmLabel: 'Сохранить',
                fields: [{ key: 'title', placeholder: 'Название чек-листа', value: currentTitle }],
                onSubmit: (values) => {
                    const title = values.title;
                    if (!title || title === currentTitle) return;
                    state.updateChecklist(checklist.id, { title });
                },
            });
        };

        const updatePresetChecklistParams = (checklist, patch) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const preset = getChecklistPreset(checklist);
            if (!preset) return;
            const current = getPresetChecklistParams(checklist, preset);
            const nextAdults = clampCount(
                Object.prototype.hasOwnProperty.call(patch || {}, 'adults') ? patch.adults : current.adults,
                1,
                12,
            );
            const nextChildren = clampCount(
                Object.prototype.hasOwnProperty.call(patch || {}, 'children') ? patch.children : current.children,
                0,
                12,
            );
            const nextChildAges = normalizeChildAges(
                nextChildren,
                Object.prototype.hasOwnProperty.call(patch || {}, 'childAges') ? patch.childAges : current.childAges,
            );
            const nextDayTemp = clampDayTemp(
                Object.prototype.hasOwnProperty.call(patch || {}, 'dayTemp') ? patch.dayTemp : current.dayTemp,
            );
            const nextNightTemp = clampNightTemp(
                Object.prototype.hasOwnProperty.call(patch || {}, 'nightTemp') ? patch.nightTemp : current.nightTemp,
            );
            const nextNights = clampNights(
                Object.prototype.hasOwnProperty.call(patch || {}, 'nights') ? patch.nights : current.nights,
            );
            const toggleOptions = { nights: nextNights };
            preset.toggles.forEach((toggle) => {
                const raw = Object.prototype.hasOwnProperty.call(patch || {}, toggle.key)
                    ? patch[toggle.key]
                    : current[toggle.key];
                toggleOptions[toggle.key] = resolveToggleValue(toggle, raw);
            });
            const nextPreset = preset.build(
                nextAdults,
                nextChildren,
                nextChildAges,
                nextDayTemp,
                nextNightTemp,
                toggleOptions,
            );
            const removedPresetIds = Array.isArray(checklist.removedPresetIds) ? checklist.removedPresetIds : [];
            const toggleFields = {};
            preset.toggles.forEach((toggle) => {
                toggleFields[toggle.key] = toggleOptions[toggle.key];
            });
            state.updateChecklist(checklist.id, {
                presetId: preset.id,
                adults: nextAdults,
                children: nextChildren,
                childAges: nextPreset.childAges,
                dayTemp: nextPreset.dayTemp,
                nightTemp: nextPreset.nightTemp,
                nights: nextPreset.nights,
                ...toggleFields,
                removedPresetIds,
                itemOverrides: normalizeChecklistItemOverrides(checklist.itemOverrides),
                groupOverrides: normalizeChecklistGroupOverrides(checklist.groupOverrides),
                items: materializeSeaTentItems(
                    nextPreset.items,
                    checklist.items,
                    removedPresetIds,
                    checklist.itemOverrides,
                    checklist.groupOverrides,
                ),
            });
        };

        const updateSavedCount = (checklist, kind, delta) => {
            const params = getPresetChecklistParams(checklist, getChecklistPreset(checklist));
            if (kind === 'adults') {
                updatePresetChecklistParams(checklist, { adults: params.adults + delta });
            } else {
                updatePresetChecklistParams(checklist, { children: params.children + delta });
            }
        };

        const updateSavedChildAge = (checklist, index, delta) => {
            const params = getPresetChecklistParams(checklist, getChecklistPreset(checklist));
            const nextAges = params.childAges.slice();
            nextAges[index] = clampCount((nextAges[index] ?? DEFAULT_CHILD_AGE) + delta, 0, 17);
            updatePresetChecklistParams(checklist, { childAges: nextAges });
        };

        const updateSavedTemp = (checklist, kind, delta) => {
            const params = getPresetChecklistParams(checklist, getChecklistPreset(checklist));
            if (kind === 'day') {
                updatePresetChecklistParams(checklist, { dayTemp: params.dayTemp + delta });
            } else {
                updatePresetChecklistParams(checklist, { nightTemp: params.nightTemp + delta });
            }
        };

        const updateSavedNights = (checklist, delta) => {
            const params = getPresetChecklistParams(checklist, getChecklistPreset(checklist));
            updatePresetChecklistParams(checklist, { nights: params.nights + delta });
        };

        const setSavedFacility = (checklist, key, value) => {
            updatePresetChecklistParams(checklist, { [key]: value });
        };

        const renderAgeInlineControls = (ages, onAgeDelta, keyPrefix) => {
            const safeAges = Array.isArray(ages) ? ages : [];
            if (!safeAges.length) return null;
            return h('div', { className: 'planning-checklists-screen__age-inline' },
                safeAges.map((age, index) => h('div', {
                    key: keyPrefix + index,
                    className: 'planning-checklists-screen__age-inline-control',
                },
                    h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--age planning-checklists-screen__stepper--age-inline' },
                        h('button', { type: 'button', onClick: () => onAgeDelta(index, -1), 'aria-label': 'Уменьшить возраст ребёнка ' + (index + 1) }, '−'),
                        h('strong', null, formatChildAgeInline(age)),
                        h('button', { type: 'button', onClick: () => onAgeDelta(index, 1), 'aria-label': 'Увеличить возраст ребёнка ' + (index + 1) }, '+'),
                    ),
                )),
            );
        };

        const renderTempControls = (currentNights, currentDayTemp, currentNightTemp, onNightsDelta, onDayDelta, onNightDelta) => h(
            'div',
            { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--temps' },
            h('div', { className: 'planning-checklists-screen__counter' },
                h('span', null, 'Ночей'),
                h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--temp' },
                    h('button', { type: 'button', onClick: () => onNightsDelta(-1), 'aria-label': 'Меньше ночей' }, '−'),
                    h('strong', null, currentNights),
                    h('button', { type: 'button', onClick: () => onNightsDelta(1), 'aria-label': 'Больше ночей' }, '+'),
                ),
            ),
            h('div', { className: 'planning-checklists-screen__counter' },
                h('span', null, 'Днём'),
                h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--temp' },
                    h('button', { type: 'button', onClick: () => onDayDelta(-1), 'aria-label': 'Понизить дневную температуру' }, '−'),
                    h('strong', null, formatTemp(currentDayTemp)),
                    h('button', { type: 'button', onClick: () => onDayDelta(1), 'aria-label': 'Повысить дневную температуру' }, '+'),
                ),
            ),
            h('div', { className: 'planning-checklists-screen__counter' },
                h('span', null, 'Ночью'),
                h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--temp' },
                    h('button', { type: 'button', onClick: () => onNightDelta(-1), 'aria-label': 'Понизить ночную температуру' }, '−'),
                    h('strong', null, formatTemp(currentNightTemp)),
                    h('button', { type: 'button', onClick: () => onNightDelta(1), 'aria-label': 'Повысить ночную температуру' }, '+'),
                ),
            ),
        );

        // Тумблеры пресета (розетка/душ, приют/палатка, транспорт…) — взаимозаменяемые
        // альтернативы друг под другом: активная подсвечена, остальные серые, между ними ⇅.
        // Бинарный тумблер = 2 варианта; choice-тумблер = N вариантов.
        const renderUtilityControls = (preset, values, onSet) => h(
            'div',
            { className: 'planning-checklists-screen__facility-toggles' },
            (preset?.toggles || []).map((toggle) => {
                const optionList = Array.isArray(toggle.choices)
                    ? toggle.choices
                    : [{ value: true, label: toggle.onLabel }, { value: false, label: toggle.offLabel }];
                const current = values[toggle.key];
                const isWide = optionList.length > 2;
                return h('div', {
                    key: toggle.key,
                    className: 'planning-checklists-screen__facility-switch'
                        + (isWide ? ' planning-checklists-screen__facility-switch--wide' : ''),
                }, optionList.reduce((nodes, option, index) => {
                    if (index > 0) {
                        nodes.push(h('span', {
                            key: 'arr-' + index,
                            className: 'planning-checklists-screen__facility-arrow',
                            'aria-hidden': 'true',
                        }, '⇅'));
                    }
                    const active = current === option.value;
                    nodes.push(h('button', {
                        key: String(option.value),
                        type: 'button',
                        className: 'planning-checklists-screen__facility-option' + (active ? ' is-active' : ''),
                        onClick: () => onSet(toggle.key, option.value),
                        'aria-pressed': active ? 'true' : 'false',
                    }, option.label));
                    return nodes;
                }, []));
            }),
        );

        const renderPeopleControls = (values) => h('div', { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--saved' },
            h('div', { className: 'planning-checklists-screen__counter' },
                h('span', null, 'Взрослые'),
                h('div', { className: 'planning-checklists-screen__stepper' },
                    h('button', { type: 'button', onClick: () => values.onAdultsDelta(-1), 'aria-label': 'Уменьшить количество взрослых' }, '−'),
                    h('strong', null, values.adults),
                    h('button', { type: 'button', onClick: () => values.onAdultsDelta(1), 'aria-label': 'Увеличить количество взрослых' }, '+'),
                ),
            ),
            h('div', {
                className: 'planning-checklists-screen__counter planning-checklists-screen__counter--children'
                    + (values.children > 0 ? ' has-ages' : ''),
            },
                h('span', null, 'Дети'),
                h('div', { className: 'planning-checklists-screen__children-tools' },
                    h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--count' },
                        h('button', { type: 'button', onClick: () => values.onChildrenDelta(-1), 'aria-label': 'Уменьшить количество детей' }, '−'),
                        h('strong', null, values.children),
                        h('button', { type: 'button', onClick: () => values.onChildrenDelta(1), 'aria-label': 'Увеличить количество детей' }, '+'),
                    ),
                    values.children > 0 && renderAgeInlineControls(
                        normalizeChildAges(values.children, values.childAges),
                        values.onChildAgeDelta,
                        values.keyPrefix,
                    ),
                ),
            ),
        );

        const renderChecklistMeta = (checklist) => {
            const count = Array.isArray(checklist.items) ? checklist.items.length : 0;
            const preset = getChecklistPreset(checklist);
            if (!preset) return count + ' пунктов';
            const params = getPresetChecklistParams(checklist, preset);
            const toggleOptions = { ...buildPresetToggleOptions(preset, params), nights: params.nights };
            const built = preset.build(
                params.adults,
                params.children,
                params.childAges,
                params.dayTemp,
                params.nightTemp,
                toggleOptions,
            );
            return count + ' пунктов · ' + built.audienceLabel + ' · ' + built.nightsLabel + ' · ' + built.tempLabel + ' · ' + built.utilityLabel;
        };

        // Краткая сводка параметров (без счётчика пунктов) — для свёрнутого блока параметров.
        const buildParamsSummary = (checklist, preset) => {
            const params = getPresetChecklistParams(checklist, preset);
            const built = preset.build(
                params.adults,
                params.children,
                params.childAges,
                params.dayTemp,
                params.nightTemp,
                { ...buildPresetToggleOptions(preset, params), nights: params.nights },
            );
            return built.audienceLabel + ' · ' + built.nightsLabel + ' · ' + built.tempLabel + ' · ' + built.utilityLabel;
        };

        const renderChecklistProgress = (checklist) => {
            const items = Array.isArray(checklist?.items) ? checklist.items : [];
            const done = items.filter((entry) => entry?.done === true).length;
            return done + '/' + items.length + ' собрано';
        };

        const renderItem = (entry, onToggle, keyPrefix, options) => {
            const opts = options || {};
            return h('div', {
            key: keyPrefix + entry.id,
            className: 'planning-checklists-screen__item-row' + (opts.bulkDeleteMode ? ' is-bulk-delete-mode' : ''),
        },
            h('label', {
                className: 'planning-checklists-screen__item'
                    + (entry.done ? ' is-done' : '')
                    + (opts.bulkDeleteMode ? ' is-bulk-delete-item' : ''),
            },
                h('input', {
                    type: 'checkbox',
                    checked: opts.bulkDeleteMode ? opts.isSelected === true : entry.done === true,
                    onChange: () => {
                        if (opts.bulkDeleteMode) opts.onSelect?.(entry.id);
                        else onToggle(entry.id);
                    },
                }),
                h('span', { className: 'planning-checklists-screen__item-text' },
                    entry.quantity && h('span', { className: 'planning-checklists-screen__item-qty' }, entry.quantity),
                    h('span', null, entry.text),
                    entry.note && h('span', { className: 'planning-checklists-screen__item-note' }, entry.note),
                ),
            ),
            !opts.bulkDeleteMode && opts.onEdit && h('button', {
                type: 'button',
                className: 'planning-checklists-screen__item-edit',
                onClick: () => opts.onEdit(entry.id),
                'aria-label': 'Редактировать пункт',
                title: 'Редактировать пункт',
            }, '✎'),
            !opts.bulkDeleteMode && opts.onDelete && h('button', {
                type: 'button',
                className: 'planning-checklists-screen__item-delete',
                onClick: () => opts.onDelete(entry.id),
                'aria-label': 'Удалить пункт',
                title: 'Удалить пункт',
            }, '×'),
        );
        };

        const renderGroups = (items, onToggle, keyPrefix, options) => {
            const opts = options || {};
            return h('div', { className: 'planning-checklists-screen__groups' },
                groupChecklistItems(items, opts.customGroups, opts.groupOrder).map((section) => h('section', {
                    key: keyPrefix + section.group,
                    className: 'planning-checklists-screen__group',
                },
                    h('div', { className: 'planning-checklists-screen__group-head' },
                        h('h3', { className: 'planning-checklists-screen__group-title' }, section.group),
                        h('span', { className: 'planning-checklists-screen__group-actions' },
                            typeof opts.onEditGroup === 'function' && h('button', {
                                type: 'button',
                                className: 'planning-checklists-screen__group-edit',
                                onClick: () => opts.onEditGroup(section.group),
                                'aria-label': 'Редактировать раздел «' + section.group + '»',
                                title: 'Редактировать раздел',
                            }, '✎'),
                            typeof opts.onDeleteGroup === 'function' && h('button', {
                                type: 'button',
                                className: 'planning-checklists-screen__group-delete',
                                onClick: () => opts.onDeleteGroup(section.group, section.items),
                                'aria-label': 'Удалить раздел «' + section.group + '»',
                                title: 'Удалить раздел',
                            }, '×'),
                            typeof opts.onAddToGroup === 'function' && h('button', {
                                type: 'button',
                                className: 'planning-checklists-screen__group-add',
                                onClick: () => opts.onAddToGroup(section.group),
                                'aria-label': 'Добавить пункт в группу «' + section.group + '»',
                                title: 'Добавить пункт',
                            }, '+'),
                        ),
                    ),
                    h('div', { className: 'planning-checklists-screen__group-list' },
                        section.items.map((entry) => renderItem(entry, onToggle, keyPrefix, {
                            onDelete: opts.onDelete,
                            onEdit: opts.onEditItem,
                            bulkDeleteMode: opts.bulkDeleteMode === true,
                            isSelected: !!opts.selectedIds?.[String(entry.id)],
                            onSelect: opts.onSelectItem,
                        })),
                    ),
                )),
            );
        };

        const renderSavedPresetControls = (checklist) => {
            const preset = getChecklistPreset(checklist);
            if (!preset) return null;
            const params = getPresetChecklistParams(checklist, preset);
            const paramsCollapsed = paramsCollapsedById[checklist.id] != null
                ? paramsCollapsedById[checklist.id] === true
                : checklist.paramsCollapsed === true;

            // Свёрнуто: параметры показаны сводкой, клик разворачивает обратно.
            if (paramsCollapsed) {
                return h('button', {
                    type: 'button',
                    className: 'planning-checklists-screen__params-summary planning-checklists-screen__saved-controls',
                    onClick: () => toggleParamsCollapsed(checklist),
                    'aria-expanded': 'false',
                    title: 'Развернуть параметры',
                },
                    h('span', { className: 'planning-checklists-screen__params-summary-text' }, buildParamsSummary(checklist, preset)),
                    h('span', { className: 'planning-checklists-screen__params-summary-hint' }, 'изменить'),
                );
            }

            return h('div', { className: 'planning-checklists-screen__preset-controls planning-checklists-screen__saved-controls' },
                renderPeopleControls({
                    adults: params.adults,
                    children: params.children,
                    childAges: params.childAges,
                    keyPrefix: checklist.id + '-child-age-',
                    onAdultsDelta: (delta) => updateSavedCount(checklist, 'adults', delta),
                    onChildrenDelta: (delta) => updateSavedCount(checklist, 'children', delta),
                    onChildAgeDelta: (index, delta) => updateSavedChildAge(checklist, index, delta),
                }),
                renderTempControls(
                    params.nights,
                    params.dayTemp,
                    params.nightTemp,
                    (delta) => updateSavedNights(checklist, delta),
                    (delta) => updateSavedTemp(checklist, 'day', delta),
                    (delta) => updateSavedTemp(checklist, 'night', delta),
                ),
                renderUtilityControls(
                    preset,
                    params,
                    (key, value) => setSavedFacility(checklist, key, value),
                ),
                h('button', {
                    type: 'button',
                    className: 'planning-checklists-screen__params-collapse',
                    onClick: () => toggleParamsCollapsed(checklist),
                    'aria-expanded': 'true',
                }, '▴ Свернуть параметры'),
            );
        };

        const renderCreateModal = () => {
            if (!createOpen) return null;
            const canCreate = typeof state?.addChecklist === 'function';
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeCreateModal();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Новый чек-лист',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, 'Новый чек-лист'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeCreateModal,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    h('div', { className: 'planning-checklists-modal__tabs' },
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__tab' + (createMode === 'custom' ? ' is-active' : ''),
                            onClick: () => setCreateMode('custom'),
                        }, 'Свой'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__tab' + (createMode === 'preset' ? ' is-active' : ''),
                            onClick: () => setCreateMode('preset'),
                        }, 'Пресет'),
                    ),
                    createMode === 'custom'
                        ? h('div', { className: 'planning-checklists-modal__body' },
                            h('input', {
                                className: 'planning-checklists-modal__input',
                                value: customTitle,
                                onChange: (event) => setCustomTitle(event.target.value),
                                onKeyDown: (event) => {
                                    if (event.key === 'Enter') handleCreateCustom();
                                },
                                placeholder: 'Название чек-листа',
                            }),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__primary',
                                onClick: handleCreateCustom,
                                disabled: !canCreate,
                            }, 'Создать'),
                        )
                        : h('div', { className: 'planning-checklists-modal__body' },
                            h('div', { className: 'planning-checklists-modal__preset-list' },
                                CHECKLIST_PRESETS.map((preset) => {
                                    const isActive = preset.id === selectedPresetDef.id;
                                    return h('button', {
                                        key: preset.id,
                                        type: 'button',
                                        className: 'planning-checklists-modal__preset-option' + (isActive ? ' is-active' : ''),
                                        onClick: () => setSelectedPresetId(preset.id),
                                        'aria-pressed': isActive ? 'true' : 'false',
                                    },
                                        h('span', { className: 'planning-checklists-modal__preset-title' }, preset.title),
                                        h('span', {
                                            className: 'planning-checklists-modal__preset-emoji',
                                            'aria-hidden': 'true',
                                        }, preset.emoji || '🧳'),
                                    );
                                }),
                            ),
                            h('div', { className: 'planning-checklists-screen__preset-controls planning-checklists-screen__preset-controls--modal' },
                                renderPeopleControls({
                                    adults,
                                    children,
                                    childAges,
                                    keyPrefix: 'preview-child-age-',
                                    onAdultsDelta: (delta) => setCount('adults', delta),
                                    onChildrenDelta: (delta) => setCount('children', delta),
                                    onChildAgeDelta: setPreviewChildAge,
                                }),
                                renderTempControls(
                                    nights,
                                    dayTemp,
                                    nightTemp,
                                    setNightsDelta,
                                    (delta) => setTemp('day', delta),
                                    (delta) => setTemp('night', delta),
                                ),
                                renderUtilityControls(
                                    selectedPresetDef,
                                    presetToggleOptions,
                                    (key, value) => setToggleState((current) => ({ ...current, [key]: value === true })),
                                ),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__primary',
                                onClick: handleCreatePreset,
                                disabled: !canCreate,
                            }, 'Добавить чеклист'),
                        ),
                ),
            );
        };

        const renderAddItemModal = () => {
            if (!addItemTarget) return null;
            const checklist = checklists.find((entry) => entry.id === addItemTarget.checklistId);
            if (!checklist) return null;
            const canAdd = String(newItemText || '').trim().length > 0;
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeAddItemModal();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal planning-checklists-modal--compact',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Новый пункт',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, 'Новый пункт'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeAddItemModal,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    h('div', { className: 'planning-checklists-modal__group-hint' }, addItemTarget.group),
                    h('div', { className: 'planning-checklists-modal__body' },
                        h('input', {
                            className: 'planning-checklists-modal__input',
                            value: newItemText,
                            autoFocus: true,
                            onChange: (event) => setNewItemText(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handleAddItemSubmit();
                            },
                            placeholder: 'Название пункта',
                        }),
                        h('input', {
                            className: 'planning-checklists-modal__input',
                            value: newItemQty,
                            onChange: (event) => setNewItemQty(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handleAddItemSubmit();
                            },
                            placeholder: 'Количество (необязательно)',
                        }),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__primary',
                            onClick: handleAddItemSubmit,
                            disabled: !canAdd,
                        }, 'Добавить'),
                    ),
                ),
            );
        };

        const renderAddSectionModal = () => {
            if (!addSectionTarget) return null;
            const checklist = checklists.find((entry) => entry.id === addSectionTarget.checklistId);
            if (!checklist) return null;
            const canAdd = String(newSectionName || '').trim().length > 0;
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeAddSectionModal();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal planning-checklists-modal--compact',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Новый раздел',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, 'Новый раздел'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeAddSectionModal,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    h('div', { className: 'planning-checklists-modal__body' },
                        h('input', {
                            className: 'planning-checklists-modal__input',
                            value: newSectionName,
                            autoFocus: true,
                            onChange: (event) => setNewSectionName(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handleAddSectionSubmit();
                            },
                            placeholder: 'Название раздела',
                        }),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__primary',
                            onClick: handleAddSectionSubmit,
                            disabled: !canAdd,
                        }, 'Создать раздел'),
                    ),
                ),
            );
        };

        const renderConfirmModal = () => {
            if (!confirmState) return null;
            const danger = confirmState.danger === true;
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeConfirm();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal planning-checklists-modal--compact planning-checklists-modal--confirm',
                    role: 'alertdialog',
                    'aria-modal': 'true',
                    'aria-label': confirmState.title || 'Подтверждение',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, confirmState.title || 'Подтвердите действие'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeConfirm,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    confirmState.message && h('div', { className: 'planning-checklists-modal__confirm-text' }, confirmState.message),
                    h('div', { className: 'planning-checklists-modal__confirm-actions' },
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__secondary',
                            onClick: closeConfirm,
                        }, 'Отмена'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__primary'
                                + (danger ? ' planning-checklists-modal__primary--danger' : ''),
                            onClick: handleConfirm,
                        }, confirmState.confirmLabel || 'Подтвердить'),
                    ),
                ),
            );
        };

        const renderPromptModal = () => {
            if (!promptState) return null;
            const fields = Array.isArray(promptState.fields) ? promptState.fields : [];
            const firstKey = fields[0] && fields[0].key;
            const canSubmit = !firstKey || String(promptValues[firstKey] || '').trim().length > 0;
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closePrompt();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal planning-checklists-modal--compact',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': promptState.title || 'Изменить',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, promptState.title || 'Изменить'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closePrompt,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    h('div', { className: 'planning-checklists-modal__body' },
                        fields.map((field, index) => h('input', {
                            key: field.key,
                            className: 'planning-checklists-modal__input',
                            value: promptValues[field.key] || '',
                            autoFocus: index === 0,
                            onChange: (event) => {
                                const next = event.target.value;
                                setPromptValues((current) => ({ ...current, [field.key]: next }));
                            },
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handlePromptSubmit();
                            },
                            placeholder: field.placeholder || field.label || '',
                        })),
                        h('div', { className: 'planning-checklists-modal__confirm-actions' },
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__secondary',
                                onClick: closePrompt,
                            }, 'Отмена'),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__primary',
                                onClick: handlePromptSubmit,
                                disabled: !canSubmit,
                            }, promptState.confirmLabel || 'Сохранить'),
                        ),
                    ),
                ),
            );
        };

        const renderArchiveModal = () => {
            if (!archiveOpen) return null;
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeArchiveModal();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal planning-checklists-modal--compact planning-checklists-modal--archive',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Архив чеклистов',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, 'Архив чеклистов'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeArchiveModal,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    archivedChecklists.length === 0
                        ? h('div', { className: 'planning-checklists-modal__empty' }, 'В архиве пока пусто.')
                        : h('div', { className: 'planning-checklists-archive-list' },
                            archivedChecklists.map((checklist) => h('div', {
                                key: checklist.id,
                                className: 'planning-checklists-archive-row',
                            },
                                h('div', { className: 'planning-checklists-archive-row__copy' },
                                    h('strong', null, checklist.title || 'Чек-лист'),
                                    h('span', null, renderChecklistMeta(checklist)),
                                ),
                                h('div', { className: 'planning-checklists-archive-row__actions' },
                                    h('button', {
                                        type: 'button',
                                        className: 'planning-checklists-archive-row__restore',
                                        onClick: () => restoreArchivedChecklist(checklist),
                                        disabled: typeof state?.updateChecklist !== 'function',
                                    }, 'Вернуть'),
                                    h('button', {
                                        type: 'button',
                                        className: 'planning-checklists-archive-row__delete',
                                        onClick: () => deleteArchivedChecklist(checklist),
                                        disabled: typeof state?.deleteChecklist !== 'function',
                                    }, 'Удалить'),
                                ),
                            )),
                        ),
                ),
            );
        };

        return h('div', { className: 'planning-checklists-screen' },
            h('div', { className: 'planning-checklists-screen__header' },
                h('h2', { className: 'planning-checklists-screen__title' }, 'Ваши чеклисты'),
                h('div', { className: 'planning-checklists-screen__header-actions' },
                    h('button', {
                        type: 'button',
                        className: 'planning-checklists-screen__create planning-checklists-screen__create--add',
                        onClick: () => openCreateModal('custom'),
                        disabled: typeof state?.addChecklist !== 'function',
                    }, 'Добавить'),
                    h('button', {
                        type: 'button',
                        className: 'planning-checklists-screen__create planning-checklists-screen__create--presets',
                        onClick: () => openCreateModal('preset'),
                        disabled: typeof state?.addChecklist !== 'function',
                    }, 'Пресеты'),
                ),
            ),
            checklists.length === 0
                ? h('div', { className: 'planning-empty planning-empty--inline' }, 'Пока нет чеклистов.')
                : h('div', { className: 'planning-checklists-screen__list' },
                    checklists.map((checklist) => {
                        const isCollapsed = collapsedById[checklist.id] != null
                            ? collapsedById[checklist.id] === true
                            : checklist.collapsed === true;
                        const bulkDeleteMode = isBulkDeleteMode(checklist);
                        const bulkSelectedCount = bulkDeleteMode ? selectedBulkDeleteIds().length : 0;
                        return h('div', {
                            key: checklist.id,
                            className: 'planning-checklists-screen__card widget-shadow-diary-glass widget-outline-diary-glass' + (isCollapsed ? ' is-collapsed' : ''),
                        },
                            h('div', { className: 'planning-checklists-screen__card-head' },
                                h('button', {
                                    type: 'button',
                                    className: 'planning-checklists-screen__card-toggle',
                                    onClick: () => toggleChecklistCollapsed(checklist),
                                    'aria-expanded': isCollapsed ? 'false' : 'true',
                                    'aria-label': isCollapsed ? 'Развернуть чек-лист' : 'Свернуть чек-лист',
                                },
                                    h('span', { className: 'planning-checklists-screen__card-copy' },
                                        h('span', { className: 'planning-checklists-screen__card-title-row' },
                                            h('span', { className: 'planning-checklists-screen__card-title' }, checklist.title || 'Чек-лист'),
                                            !isCollapsed && h('span', { className: 'planning-checklists-screen__card-progress' }, renderChecklistProgress(checklist)),
                                        ),
                                        isCollapsed && h('span', { className: 'planning-checklists-screen__card-meta' },
                                            renderChecklistMeta(checklist),
                                        ),
                                    ),
                                    h('span', { className: 'planning-checklists-screen__collapse-icon', 'aria-hidden': 'true' }, isCollapsed ? '▾' : '▴'),
                                ),
                                h('button', {
                                    type: 'button',
                                    className: 'planning-checklists-screen__edit',
                                    onClick: () => renameSavedChecklist(checklist),
                                    disabled: typeof state?.updateChecklist !== 'function',
                                    'aria-label': 'Переименовать чек-лист',
                                    title: 'Переименовать',
                                }, '✎'),
                                h('button', {
                                    type: 'button',
                                    className: 'planning-checklists-screen__delete',
                                    onClick: () => archiveSavedChecklist(checklist),
                                    disabled: typeof state?.updateChecklist !== 'function',
                                    'aria-label': 'Переместить чек-лист в архив',
                                    title: 'В архив',
                                }, '×'),
                            ),
                            !isCollapsed && renderSavedPresetControls(checklist),
                            !isCollapsed && h('button', {
                                type: 'button',
                                className: 'planning-checklists-screen__empty-add',
                                onClick: () => openAddSectionModal(checklist),
                                disabled: typeof state?.updateChecklist !== 'function',
                            }, '+ Добавить раздел'),
                            !isCollapsed && h('div', { className: 'planning-checklists-screen__bulk-delete' },
                                h('button', {
                                    type: 'button',
                                    className: 'planning-checklists-screen__bulk-toggle' + (bulkDeleteMode ? ' is-active' : ''),
                                    onClick: () => toggleBulkDeleteMode(checklist),
                                    disabled: typeof state?.updateChecklist !== 'function' || !Array.isArray(checklist.items) || checklist.items.length === 0,
                                    'aria-pressed': bulkDeleteMode ? 'true' : 'false',
                                }, bulkDeleteMode ? 'Отмена' : 'Удалить несколько'),
                                bulkDeleteMode && h('button', {
                                    type: 'button',
                                    className: 'planning-checklists-screen__bulk-confirm',
                                    onClick: () => confirmBulkDelete(checklist),
                                    disabled: bulkSelectedCount === 0,
                                }, bulkSelectedCount > 0 ? 'Удалить ' + bulkSelectedCount : 'Удалить выбранное'),
                            ),
                            !isCollapsed && renderGroups(
                                checklist.items || [],
                                (itemId) => toggleSavedItem(checklist, itemId),
                                'saved-' + checklist.id + '-',
                                {
                                    customGroups: getChecklistCustomGroups(checklist),
                                    groupOrder: getChecklistPreset(checklist)?.groups,
                                    onDelete: (itemId) => {
                                        const target = (checklist.items || []).find((entry) => entry.id === itemId);
                                        requestConfirm({
                                            title: 'Удалить пункт',
                                            message: target
                                                ? '«' + (target.text || 'пункт') + '» будет удалён из этого чек-листа.'
                                                : 'Удалить этот пункт?',
                                            confirmLabel: 'Удалить',
                                            danger: true,
                                            onConfirm: () => deleteSavedItem(checklist, itemId),
                                        });
                                    },
                                    onEditItem: (itemId) => editSavedItem(checklist, itemId),
                                    onAddToGroup: (group) => openAddItemModal(checklist, group),
                                    onEditGroup: (group) => renameSavedSection(checklist, group),
                                    onDeleteGroup: (group, groupItems) => {
                                        const count = Array.isArray(groupItems) ? groupItems.length : 0;
                                        requestConfirm({
                                            title: 'Удалить раздел',
                                            message: 'Раздел «' + group + '» и ' + count + ' ' + (count === 1 ? 'пункт' : count <= 4 ? 'пункта' : 'пунктов') + ' будут удалены из этого чек-листа.',
                                            confirmLabel: 'Удалить',
                                            danger: true,
                                            onConfirm: () => deleteSavedSection(checklist, group),
                                        });
                                    },
                                    bulkDeleteMode,
                                    selectedIds: bulkDeleteMode ? selectedDeleteIds : {},
                                    onSelectItem: toggleBulkDeleteItem,
                                },
                            ),
                        );
                    }),
                ),
            archivedChecklists.length > 0 && h('button', {
                type: 'button',
                className: 'planning-checklists-archive-badge',
                onClick: openArchiveModal,
                'aria-label': 'Открыть архив чеклистов',
            },
                h('span', { className: 'planning-checklists-archive-badge__icon', 'aria-hidden': 'true' }, '▦'),
                h('span', null, 'Архив'),
                h('strong', null, archivedChecklists.length),
            ),
            renderCreateModal(),
            renderArchiveModal(),
            renderAddItemModal(),
            renderAddSectionModal(),
            renderConfirmModal(),
            renderPromptModal(),
        );
    }

    function goalNumber(value) {
        const text = String(value ?? '').trim();
        if (!text) return null;
        const n = Number(text.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }

    function getGoalProgress(goal) {
        if (goal?.status === 'done') return 100;
        const target = goalNumber(goal?.targetValue);
        const current = goalNumber(goal?.currentValue);
        const baseline = goalNumber(goal?.baselineValue);
        if (target !== null && current !== null) {
            if (current === target) return 100;
            if (baseline !== null && baseline !== target) {
                const ratio = (current - baseline) / (target - baseline);
                return Math.max(0, Math.min(100, Math.round(ratio * 100)));
            }
            return 0;
        }
        const keyResults = Array.isArray(goal?.keyResults) ? goal.keyResults : [];
        if (keyResults.length > 0) {
            const done = keyResults.filter((item) => item?.done).length;
            return Math.round((done / keyResults.length) * 100);
        }
        return 0;
    }

    function hasGoalProgressIndicator(goal) {
        if (goal?.status === 'done') return true;
        if (goalNumber(goal?.targetValue) !== null) return true;
        if (Array.isArray(goal?.keyResults) && goal.keyResults.length > 0) return true;
        return false;
    }

    function goalDateSerial(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
        if (!match) return null;
        return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
    }

    function getGoalDueState(goal, todayValue) {
        if (!goal?.dueDate) return { isOverdue: false, label: '' };
        if (goal?.status === 'done') return { isOverdue: false, label: 'до ' + formatGoalDate(goal.dueDate) };
        const dueSerial = goalDateSerial(goal.dueDate);
        const todaySerial = goalDateSerial(todayValue || new Date().toISOString().slice(0, 10));
        if (dueSerial === null || todaySerial === null || dueSerial >= todaySerial) {
            return { isOverdue: false, label: 'до ' + formatGoalDate(goal.dueDate) };
        }
        const days = todaySerial - dueSerial;
        return {
            isOverdue: true,
            days,
            label: 'Просрочена на ' + days + ' ' + (days === 1 ? 'день' : 'дн.'),
        };
    }

    function isGoalTaskActive(task) {
        return !!task && task.status !== 'done' && task.status !== 'cancelled';
    }

    function getGoalProjectTasks(goal, tasks) {
        const allTasks = Array.isArray(tasks) ? tasks : [];
        const projectId = String(goal?.projectId || '');
        const result = projectId
            ? allTasks.filter((task) => String(task?.projectId || '') === projectId)
            : [];
        const legacyFocus = goal?.nextTaskId
            ? allTasks.find((task) => String(task?.id || '') === String(goal.nextTaskId))
            : null;
        if (legacyFocus && !result.some((task) => task.id === legacyFocus.id)) result.push(legacyFocus);
        return result;
    }

    function getGoalTaskSlots(goalTasks, slots) {
        const taskIds = new Set((goalTasks || []).map((task) => String(task.id || '')));
        return (Array.isArray(slots) ? slots : []).filter((slot) => taskIds.has(String(slot?.taskId || '')));
    }

    function compareGoalTasks(left, right, slotByTaskId) {
        const leftSlot = slotByTaskId.get(String(left?.id || ''));
        const rightSlot = slotByTaskId.get(String(right?.id || ''));
        if (!!leftSlot !== !!rightSlot) return leftSlot ? -1 : 1;
        if (leftSlot && rightSlot) {
            const slotDelta = String(leftSlot.date || '').localeCompare(String(rightSlot.date || ''))
                || String(leftSlot.startTime || '').localeCompare(String(rightSlot.startTime || ''));
            if (slotDelta) return slotDelta;
        }
        const dueDelta = String(left?.dueDate || '9999-12-31').localeCompare(String(right?.dueDate || '9999-12-31'));
        if (dueDelta) return dueDelta;
        return Number(left?.order || 0) - Number(right?.order || 0);
    }

    function getGoalFocusTask(goal, goalTasks, taskSlots, todayValue) {
        const activeTasks = (goalTasks || []).filter(isGoalTaskActive);
        const explicit = activeTasks.find((task) => String(task.id) === String(goal?.nextTaskId || ''));
        if (explicit) return { task: explicit, suggested: false };
        const today = String(todayValue || '').slice(0, 10);
        const futureSlots = (taskSlots || [])
            .filter((slot) => String(slot?.date || '') >= today)
            .sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))
                || String(left.startTime || '').localeCompare(String(right.startTime || '')));
        const slotByTaskId = new Map();
        futureSlots.forEach((slot) => {
            const taskId = String(slot?.taskId || '');
            if (taskId && !slotByTaskId.has(taskId)) slotByTaskId.set(taskId, slot);
        });
        const suggested = activeTasks.slice().sort((left, right) => compareGoalTasks(left, right, slotByTaskId))[0] || null;
        return { task: suggested, suggested: !!suggested };
    }

    function getGoalNearestSlot(task, taskSlots, todayValue) {
        if (!task) return null;
        const today = String(todayValue || '').slice(0, 10);
        return (taskSlots || [])
            .filter((slot) => String(slot?.taskId || '') === String(task.id)
                && String(slot?.date || '') >= today)
            .sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))
                || String(left.startTime || '').localeCompare(String(right.startTime || '')))[0] || null;
    }

    function getGoalActivityIds(goal, goalTasks, activities) {
        const taskIds = new Set((goalTasks || []).map((task) => String(task.id || '')));
        const projectId = String(goal?.projectId || '');
        return new Set((Array.isArray(activities) ? activities : [])
            .filter((activity) => !activity?.archived && (
                taskIds.has(String(activity?.taskId || ''))
                || projectId && String(activity?.projectId || '') === projectId
            ))
            .map((activity) => String(activity.id || '')));
    }

    function getGoalEffortMinutes(goal, goalTasks, state, todayValue) {
        const activityIds = getGoalActivityIds(goal, goalTasks, state?.chronoActivities);
        if (!activityIds.size) return { week: 0, total: 0 };
        const todaySerial = goalDateSerial(todayValue);
        const mondaySerial = todaySerial === null
            ? null
            : todaySerial - ((new Date(todaySerial * 86400000).getUTCDay() + 6) % 7);
        let week = 0;
        let total = 0;
        const add = (item, minutesField) => {
            if (!item || !activityIds.has(String(item.activityId || ''))) return;
            const minutes = Math.max(0, Number(item[minutesField]) || 0);
            total += minutes;
            const serial = goalDateSerial(item.date);
            if (serial !== null && mondaySerial !== null && serial >= mondaySerial && serial <= todaySerial) week += minutes;
        };
        (Array.isArray(state?.chronoEntries) ? state.chronoEntries : []).forEach((entry) => add(entry, 'minutes'));
        (Array.isArray(state?.chronoSnapshots) ? state.chronoSnapshots : []).forEach((snapshot) => add(snapshot, 'totalMinutes'));
        return { week: Math.round(week), total: Math.round(total) };
    }

    function getGoalBlockedState(task, tasks) {
        const blockerIds = Array.isArray(task?.blockedByTaskIds) ? task.blockedByTaskIds : [];
        if (!blockerIds.length) return null;
        const taskById = new Map((tasks || []).map((entry) => [String(entry.id || ''), entry]));
        return blockerIds.map((id) => taskById.get(String(id)))
            .find((blocker) => blocker && blocker.status !== 'done' && blocker.status !== 'cancelled') || null;
    }

    function formatGoalMinutes(minutes) {
        const value = Math.max(0, Math.round(Number(minutes) || 0));
        if (value < 60) return value + ' мин';
        const hours = Math.floor(value / 60);
        const rest = value % 60;
        return hours + ' ч' + (rest ? ' ' + rest + ' мин' : '');
    }

    function formatGoalSlot(slot, todayValue) {
        if (!slot) return '';
        const dateLabel = String(slot.date || '') === String(todayValue || '')
            ? 'сегодня'
            : formatGoalDate(slot.date);
        return dateLabel + (slot.startTime ? ', ' + slot.startTime : '');
    }

    function getGoalSlotMinutes(slot) {
        const parse = (value) => {
            const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
            return match ? Number(match[1]) * 60 + Number(match[2]) : null;
        };
        const start = parse(slot?.startTime);
        const end = parse(slot?.endTime);
        if (start === null || end === null) return 30;
        return Math.max(5, end > start ? end - start : end + 1440 - start);
    }

    function getGoalReviewState(goal, todayValue) {
        const reviewedSerial = goalDateSerial(String(goal?.reviewedAt || goal?.createdAt || '').slice(0, 10));
        const todaySerial = goalDateSerial(todayValue);
        if (reviewedSerial === null || todaySerial === null) return { stale: false, days: 0 };
        const days = Math.max(0, todaySerial - reviewedSerial);
        return { stale: days >= 7, days };
    }

    function buildGoalReadModel(goal, state, todayValue) {
        const goalTasks = getGoalProjectTasks(goal, state?.tasks);
        const taskSlots = getGoalTaskSlots(goalTasks, state?.slots);
        const focus = getGoalFocusTask(goal, goalTasks, taskSlots, todayValue);
        const focusSlot = getGoalNearestSlot(focus.task, taskSlots, todayValue);
        const blocker = getGoalBlockedState(focus.task, state?.tasks);
        const mapObstacle = (Array.isArray(state?.goalMapRecords) ? state.goalMapRecords : []).find((record) => (
            record?.goalId === goal?.id
            && record.recordType === 'node'
            && record.nodeKind === 'obstacle'
            && record.status !== 'done'
            && record.status !== 'cancelled'
        )) || null;
        const dueState = getGoalDueState(goal, todayValue);
        const reviewState = getGoalReviewState(goal, todayValue);
        const effort = getGoalEffortMinutes(goal, goalTasks, state, todayValue);
        const completedTasks = goalTasks.filter((task) => task?.status === 'done').length;
        const resultProgress = getGoalProgress(goal);
        const hasResultProgress = hasGoalProgressIndicator(goal);
        let course = { kind: 'moving', label: 'Движение есть', reason: 'Следующее действие определено' };
        if (goal?.status === 'done') {
            course = { kind: 'done', label: 'Цель завершена', reason: 'Итоговый результат зафиксирован' };
        } else if (!isUsefulGoalMetric(goal?.metricLabel) && !(goal?.keyResults || []).length) {
            course = { kind: 'criterion', label: 'Нужен критерий результата', reason: 'Иначе прогресс нельзя проверить' };
        } else if (dueState.isOverdue) {
            course = { kind: 'review', label: 'Срок прошёл', reason: 'Нужно проверить результат' };
        } else if (blocker || mapObstacle) {
            course = { kind: 'blocked', label: 'Есть препятствие', reason: blocker?.title || mapObstacle?.title || 'Сначала нужно снять препятствие' };
        } else if (!focus.task) {
            course = { kind: 'action', label: 'Нет следующего действия', reason: 'Цель не двигается без конкретного шага' };
        } else if (!focusSlot) {
            course = { kind: 'schedule', label: 'Нужно запланировать', reason: 'Для текущего действия нет времени в календаре' };
        } else if (reviewState.stale) {
            course = { kind: 'review', label: 'Результат не проверен', reason: 'Последняя проверка была ' + reviewState.days + ' дн. назад' };
        }
        return {
            goalTasks,
            taskSlots,
            focusTask: focus.task,
            focusSuggested: focus.suggested,
            focusSlot,
            blocker,
            mapObstacle,
            dueState,
            reviewState,
            effort,
            completedTasks,
            resultProgress,
            hasResultProgress,
            course,
        };
    }

    function formatGoalDate(value) {
        if (!value) return '';
        try {
            return new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
            });
        } catch (_) {
            return String(value).slice(0, 10);
        }
    }

    function formatGoalReviewDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return formatGoalDate(value);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    const GOAL_TYPE_PRESETS = [
        {
            id: 'sleep',
            label: 'Сон',
            summaryHeading: 'Режим сна',
            keywords: ['сон', 'спать', 'ложиться', 'просыпаться', 'отбой'],
            metrics: [
                { id: 'sleep-window', label: 'В нужном окне', metricLabel: 'отход ко сну и подъём в нужных рамках', summaryLabel: 'в нужном окне' },
                { id: 'sleep-phone', label: 'Без телефона', metricLabel: 'вечера без телефона перед сном', summaryLabel: 'без телефона перед сном' },
                { id: 'sleep-hours', label: '7+ часов', metricLabel: 'сон не меньше 7 часов', summaryLabel: '7+ часов сна' },
            ],
            steps: ['лечь без телефона', 'поставить вечерний будильник', 'подготовить комнату'],
        },
        {
            id: 'nutrition',
            label: 'Питание',
            keywords: ['питание', 'еда', 'рацион', 'калории', 'белок', 'клетчатка', 'ужин'],
            metrics: [
                { id: 'nutrition-plan', label: 'По плану', metricLabel: 'дни в плане питания', summaryLabel: 'дни в плане питания', targetMode: 'number', targetLabel: 'Дней в неделю', unit: 'дн/нед' },
                { id: 'nutrition-protein', label: 'Белок/клетчатка', metricLabel: 'белок и клетчатка в норме', summaryLabel: 'белок и клетчатка в норме' },
                { id: 'nutrition-evening', label: 'Вечер спокойно', metricLabel: 'вечера без поздних перекусов', summaryLabel: 'вечера без поздних перекусов', targetMode: 'number', targetLabel: 'Дней в неделю', unit: 'дн/нед' },
            ],
            steps: ['запланировать ужины', 'добавить белок к завтраку', 'подготовить продукты'],
        },
        {
            id: 'weight',
            label: 'Вес',
            keywords: ['вес', 'кг', 'похудеть', 'набрать', 'талия'],
            metrics: [
                { id: 'weight-kg', label: 'Вес', metricLabel: 'вес', summaryLabel: 'целевой вес', targetMode: 'number', targetLabel: 'Цель', unit: 'кг' },
                { id: 'weight-waist', label: 'Талия', metricLabel: 'обхват талии', summaryLabel: 'обхват талии', targetMode: 'number', targetLabel: 'Цель', unit: 'см' },
                { id: 'weight-trend', label: 'Тренд', metricLabel: 'стабильный недельный тренд', summaryLabel: 'стабильный недельный тренд' },
            ],
            steps: ['внести вес утром', 'проверить среднюю неделю', 'собрать план питания'],
        },
        {
            id: 'training',
            label: 'Тренировки',
            keywords: ['трен', 'спорт', 'зал', 'бег', 'зарядка', 'актив'],
            metrics: [
                { id: 'training-count', label: 'Раз в неделю', metricLabel: 'тренировки в неделю', summaryLabel: 'тренировки в неделю', targetMode: 'number', targetLabel: 'Раз в неделю', unit: 'раз/нед' },
                { id: 'training-minutes', label: 'Минуты', metricLabel: 'минуты активности в неделю', summaryLabel: 'минуты активности в неделю', targetMode: 'number', targetLabel: 'Минут в неделю', unit: 'мин' },
                { id: 'training-regularity', label: 'Регулярность', metricLabel: 'регулярность тренировок без срывов', summaryLabel: 'регулярность без срывов' },
            ],
            steps: ['поставить тренировку в календарь', 'выбрать короткую тренировку', 'подготовить форму'],
        },
        {
            id: 'habit',
            label: 'Привычка',
            keywords: ['привыч', 'каждый', 'регулярно', 'режим'],
            metrics: [
                { id: 'habit-days', label: 'Дней в неделю', metricLabel: 'дни выполнения в неделю', summaryLabel: 'дни выполнения', targetMode: 'number', targetLabel: 'Дней в неделю', unit: 'дн/нед' },
                { id: 'habit-check', label: 'Выполняю', metricLabel: 'стабильное выполнение без паузы', summaryLabel: 'стабильное выполнение' },
                { id: 'habit-quality', label: 'Качество', metricLabel: 'качество выполнения в нужных рамках', summaryLabel: 'качество в нужных рамках' },
            ],
            steps: ['поставить напоминание', 'сделать первый короткий подход', 'убрать главное препятствие'],
        },
    ];

    function getGoalDateAfter(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
        ].join('-');
    }

    function createGoalDraft() {
        return {
            title: '',
            metricKey: '',
            targetValue: '',
            dueDate: getGoalDateAfter(30),
            nextTaskTitle: '',
            slotDate: getGoalDateAfter(0),
            slotStartTime: '09:00',
            plannedMinutes: 30,
        };
    }

    function addMinutesToGoalTime(value, minutes) {
        const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
        if (!match) return '10:00';
        const total = (Number(match[1]) * 60 + Number(match[2]) + Math.max(1, Number(minutes) || 30)) % 1440;
        return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    }

    function getGoalTypePreset(typeId) {
        return GOAL_TYPE_PRESETS.find((item) => item.id === typeId) || GOAL_TYPE_PRESETS[GOAL_TYPE_PRESETS.length - 1];
    }

    function inferGoalTypeId(title) {
        const text = String(title || '').toLowerCase();
        if (!text) return 'habit';
        const match = GOAL_TYPE_PRESETS.find((preset) => (preset.keywords || []).some((keyword) => text.includes(keyword)));
        return match ? match.id : 'habit';
    }

    function getEffectiveGoalType(draft) {
        return getGoalTypePreset(inferGoalTypeId(draft?.title));
    }

    function getEffectiveMetricPreset(draft, typePreset) {
        const options = Array.isArray(typePreset?.metrics) && typePreset.metrics.length > 0
            ? typePreset.metrics
            : getGoalTypePreset('habit').metrics;
        return options.find((metric) => metric.id === draft?.metricKey) || options[0];
    }

    function getGoalDraftReadiness(draft) {
        const type = getEffectiveGoalType(draft);
        const metric = getEffectiveMetricPreset(draft, type);
        const target = goalNumber(draft?.targetValue);
        return {
            title: String(draft?.title || '').trim().length > 0,
            metric: metric?.targetMode !== 'number' || target !== null && target > 0,
            dueDate: !!String(draft?.dueDate || '').trim(),
            step: !!String(draft?.nextTaskTitle || '').trim(),
            schedule: !!String(draft?.slotDate || '').trim() && !!String(draft?.slotStartTime || '').trim(),
        };
    }

    function isUsefulGoalMetric(value) {
        const text = String(value || '').trim();
        return text.length > 0 && text !== '?';
    }

    function getGoalSummaryHeading(goal) {
        const preset = getGoalTypePreset(goal?.goalType || inferGoalTypeId(goal?.title));
        return preset.summaryHeading || preset.label;
    }

    function buildGoalMetricSummary(goal) {
        const metricLabel = String(goal?.metricLabel || '').trim();
        if (!isUsefulGoalMetric(metricLabel)) return '';
        const summaryLabel = String(goal?.summaryLabel || '').trim() || metricLabel;
        const unit = String(goal?.metricUnit || '').trim();
        const hasTarget = goal?.targetValue !== undefined
            && goal?.targetValue !== null
            && String(goal.targetValue).trim() !== '';
        const hasCurrent = goal?.currentValue !== undefined
            && goal?.currentValue !== null
            && String(goal.currentValue).trim() !== '';
        if (hasTarget && hasCurrent) {
            return summaryLabel + ': ' + String(goal.currentValue).trim() + ' / ' + String(goal.targetValue).trim() + (unit ? ' ' + unit : '');
        }
        if (hasTarget) {
            return summaryLabel + ': цель ' + String(goal.targetValue).trim() + (unit ? ' ' + unit : '');
        }
        return summaryLabel;
    }

    function GoalSettingScreen({ state, onNavigate } = {}) {
        const goals = Array.isArray(state?.goals) ? state.goals : [];
        const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
        const projects = Array.isArray(state?.projects) ? state.projects : [];
        const activeGoals = goals.filter((goal) => goal?.status !== 'archived');
        const archivedGoals = goals.filter((goal) => goal?.status === 'archived');
        const [draft, setDraft] = useState(createGoalDraft);
        const [isWizardOpen, setIsWizardOpen] = useState(false);
        const [wizardStep, setWizardStep] = useState(0);
        const [createdNotice, setCreatedNotice] = useState(null);
        const [archivedNotice, setArchivedNotice] = useState(null);
        const [isArchiveOpen, setIsArchiveOpen] = useState(false);
        const [keyResultDrafts, setKeyResultDrafts] = useState({});
        const [nextTaskDrafts, setNextTaskDrafts] = useState({});
        const [reviewDrafts, setReviewDrafts] = useState({});
        const [reviewGoalIds, setReviewGoalIds] = useState({});
        const [completionGoalIds, setCompletionGoalIds] = useState({});
        const [reviewDetailsGoalIds, setReviewDetailsGoalIds] = useState({});
        const [expandedGoalIds, setExpandedGoalIds] = useState({});
        const [advancedGoalIds, setAdvancedGoalIds] = useState({});
        const [scheduleGoalIds, setScheduleGoalIds] = useState({});
        const [scheduleDrafts, setScheduleDrafts] = useState({});
        const [mapGoalId, setMapGoalId] = useState(null);

        const draftReadiness = getGoalDraftReadiness(draft);
        const canAddGoal = draftReadiness.title && typeof state?.addGoal === 'function';
        const canCompleteGoal = canAddGoal
            && typeof state?.addProject === 'function'
            && typeof state?.addTask === 'function'
            && typeof state?.addSlot === 'function'
            && Object.values(draftReadiness).every(Boolean);
        const commitGoalPatch = (goal, patch) => {
            if (!goal?.id || typeof state?.updateGoal !== 'function') return null;
            return state.updateGoal(goal.id, patch);
        };
        const ensureGoalProject = (goal) => {
            if (goal?.projectId) return projects.find((project) => project.id === goal.projectId) || { id: goal.projectId };
            if (!goal?.id || typeof state?.addProject !== 'function') return null;
            const project = state.addProject(goal.title || 'Цель');
            if (project?.id) commitGoalPatch(goal, { projectId: project.id });
            return project;
        };
        const commitGoalCurrent = (goal, value) => {
            const currentValue = goalNumber(value);
            const patch = { currentValue: currentValue === null ? undefined : currentValue };
            if (currentValue !== null && goalNumber(goal?.baselineValue) === null) {
                const previousValue = goalNumber(goal?.currentValue);
                patch.baselineValue = previousValue === null ? currentValue : previousValue;
            }
            return commitGoalPatch(goal, patch);
        };
        const getGoalReviewDraft = (goal) => reviewDrafts[goal.id] || {
            change: '',
            current: '',
            nextStep: '',
        };
        const updateGoalReviewDraft = (goal, patch) => {
            if (!goal?.id) return;
            setReviewDrafts((current) => ({
                ...current,
                [goal.id]: {
                    ...getGoalReviewDraft(goal),
                    ...(patch || {}),
                },
            }));
        };
        const resetWizard = (options) => {
            setDraft(createGoalDraft());
            setWizardStep(0);
            setIsWizardOpen(false);
            if (!options?.keepNotice) setCreatedNotice(null);
        };
        const handleAddGoal = () => {
            if (!canCompleteGoal) return;
            const goalType = getEffectiveGoalType(draft);
            const metric = getEffectiveMetricPreset(draft, goalType);
            const targetValue = metric.targetMode === 'number' && String(draft.targetValue || '').trim()
                ? draft.targetValue
                : undefined;
            const project = state.addProject(String(draft.title || '').trim());
            if (!project?.id) return;
            const goal = state.addGoal({
                title: draft.title,
                outcome: draft.title,
                projectId: project.id,
                goalType: goalType.id,
                metricKey: metric.id,
                metricLabel: metric.metricLabel,
                summaryLabel: metric.summaryLabel || metric.metricLabel,
                metricUnit: metric.unit || '',
                targetValue,
                dueDate: draft.dueDate || undefined,
            });
            const nextTaskTitle = String(draft.nextTaskTitle || '').trim();
            if (goal?.id && nextTaskTitle && typeof state?.addTask === 'function') {
                const task = state.addTask(nextTaskTitle, {
                    projectId: project.id,
                    dueDate: draft.slotDate || goal.dueDate || undefined,
                    plannedMinutes: draft.plannedMinutes,
                    priority: 'p2',
                    status: 'in_progress',
                });
                if (task?.id) {
                    state.addSlot({
                        taskId: task.id,
                        title: task.title,
                        date: draft.slotDate,
                        startTime: draft.slotStartTime,
                        endTime: addMinutesToGoalTime(draft.slotStartTime, draft.plannedMinutes),
                        source: 'goal',
                    });
                    commitGoalPatch(goal, { nextTaskId: task.id });
                }
            }
            if (goal?.id) {
                setCreatedNotice({ id: goal.id, title: goal.title || draft.title });
                setMapGoalId(goal.id);
            }
            resetWizard({ keepNotice: true });
        };
        const goToNextWizardStep = () => {
            if (wizardStep >= 2) {
                handleAddGoal();
                return;
            }
            if (wizardStep === 0 && (!draftReadiness.title || !draftReadiness.dueDate)) return;
            if (wizardStep === 1 && !draftReadiness.metric) return;
            if (wizardStep === 1 && !draftReadiness.step) {
                setDraft((current) => {
                    const type = getEffectiveGoalType(current);
                    return { ...current, nextTaskTitle: type.steps?.[0] || 'Сделать первый шаг' };
                });
            }
            setWizardStep((current) => Math.min(2, current + 1));
        };
        const goToPreviousWizardStep = () => {
            setWizardStep((current) => Math.max(0, current - 1));
        };
        const addKeyResult = (goal) => {
            const text = String(keyResultDrafts[goal.id] || '').trim();
            if (!text) return;
            commitGoalPatch(goal, {
                keyResults: (goal.keyResults || []).concat({ text }),
            });
            setKeyResultDrafts((current) => ({ ...current, [goal.id]: '' }));
        };
        const toggleKeyResult = (goal, item) => {
            commitGoalPatch(goal, {
                keyResults: (goal.keyResults || []).map((entry) => entry.id === item.id
                    ? { ...entry, done: !entry.done }
                    : entry),
            });
        };
        const removeKeyResult = (goal, item) => {
            commitGoalPatch(goal, {
                keyResults: (goal.keyResults || []).filter((entry) => entry.id !== item.id),
            });
        };
        const createNextTask = (goal) => {
            const title = String(nextTaskDrafts[goal.id] || '').trim();
            if (!title || typeof state?.addTask !== 'function') return;
            const project = ensureGoalProject(goal);
            if (!project?.id) return;
            const task = state.addTask(title, {
                projectId: project.id,
                plannedMinutes: 30,
                priority: 'p2',
                status: 'in_progress',
            });
            if (task?.id) commitGoalPatch(goal, { nextTaskId: task.id });
            setNextTaskDrafts((current) => ({ ...current, [goal.id]: '' }));
        };
        const getGoalScheduleDraft = (goal) => scheduleDrafts[goal.id] || {
            date: getGoalDateAfter(0),
            startTime: '09:00',
            plannedMinutes: 30,
        };
        const updateGoalScheduleDraft = (goal, patch) => {
            setScheduleDrafts((current) => ({
                ...current,
                [goal.id]: { ...getGoalScheduleDraft(goal), ...(patch || {}) },
            }));
        };
        const toggleGoalSchedule = (goal) => {
            if (!goal?.id) return;
            setScheduleGoalIds((current) => ({ ...current, [goal.id]: current[goal.id] !== true }));
        };
        const scheduleGoalFocus = (goal, focusTask, overrideSchedule) => {
            if (!focusTask?.id || typeof state?.addSlot !== 'function') return;
            const schedule = overrideSchedule || getGoalScheduleDraft(goal);
            if (!schedule.date || !schedule.startTime) return;
            state.addSlot({
                taskId: focusTask.id,
                title: focusTask.title || goal.title,
                date: schedule.date,
                startTime: schedule.startTime,
                endTime: addMinutesToGoalTime(schedule.startTime, schedule.plannedMinutes),
                source: 'goal',
            });
            if (typeof state?.updateTask === 'function') {
                state.updateTask(focusTask.id, {
                    dueDate: schedule.date,
                    plannedMinutes: schedule.plannedMinutes,
                });
            }
            setScheduleGoalIds((current) => ({ ...current, [goal.id]: false }));
        };
        const selectGoalFocus = (goal, taskId) => {
            if (!goal?.id) return;
            commitGoalPatch(goal, { nextTaskId: taskId || undefined });
        };
        const completeGoalFocus = (goal, readModel) => {
            const focusTask = readModel?.focusTask;
            if (!focusTask?.id || typeof state?.updateTask !== 'function') return;
            state.updateTask(focusTask.id, { status: 'done', progress: 100 });
            const nextTask = (readModel.goalTasks || []).find((task) => task.id !== focusTask.id && isGoalTaskActive(task));
            commitGoalPatch(goal, { nextTaskId: nextTask?.id });
        };
        const startGoalFocus = (goal, readModel) => {
            const focusTask = readModel?.focusTask;
            if (!focusTask?.id || typeof state?.startChronoTimer !== 'function') return;
            let activity = (state.chronoActivities || []).find((item) => !item?.archived && item.taskId === focusTask.id);
            if (!activity && typeof state?.addChronoActivity === 'function') {
                const project = ensureGoalProject(goal);
                activity = state.addChronoActivity({
                    name: focusTask.title || goal.title,
                    taskId: focusTask.id,
                    projectId: project?.id,
                    category: 'goal',
                });
            }
            if (!activity?.id) return;
            state.startChronoTimer({
                activityId: activity.id,
                plannedMinutes: focusTask.plannedMinutes || getGoalSlotMinutes(readModel.focusSlot) || 30,
            });
            if (typeof onNavigate === 'function') onNavigate('chrono');
        };
        const openGoalDetails = (goal) => {
            if (!goal?.id) return;
            setReviewGoalIds((current) => ({ ...current, [goal.id]: false }));
            setExpandedGoalIds({ [goal.id]: true });
        };
        const closeGoalDetails = (goal) => {
            if (!goal?.id) return;
            setExpandedGoalIds((current) => ({ ...current, [goal.id]: false }));
            setAdvancedGoalIds((current) => ({ ...current, [goal.id]: false }));
        };
        const toggleGoalReview = (goal, options) => {
            if (!goal?.id) return;
            setReviewDrafts((current) => current[goal.id] ? current : {
                ...current,
                [goal.id]: getGoalReviewDraft(goal),
            });
            if (!options?.keepDetails) {
                setExpandedGoalIds((current) => ({ ...current, [goal.id]: false }));
            }
            setReviewGoalIds((current) => ({ ...current, [goal.id]: current[goal.id] !== true }));
        };
        const closeGoalReview = (goal) => {
            if (!goal?.id) return;
            setReviewGoalIds((current) => ({ ...current, [goal.id]: false }));
            setCompletionGoalIds((current) => ({ ...current, [goal.id]: false }));
            setReviewDetailsGoalIds((current) => ({ ...current, [goal.id]: false }));
        };
        const startGoalCompletion = (goal) => {
            if (!goal?.id) return;
            setCompletionGoalIds((current) => ({ ...current, [goal.id]: true }));
            setReviewDrafts((current) => current[goal.id] ? current : {
                ...current,
                [goal.id]: getGoalReviewDraft(goal),
            });
            setReviewGoalIds((current) => ({ ...current, [goal.id]: true }));
        };
        const toggleGoalReviewDetails = (goal) => {
            if (!goal?.id) return;
            setReviewDetailsGoalIds((current) => ({ ...current, [goal.id]: current[goal.id] !== true }));
        };
        const toggleGoalAdvanced = (goal) => {
            if (!goal?.id) return;
            setAdvancedGoalIds((current) => ({ ...current, [goal.id]: current[goal.id] !== true }));
        };
        const saveGoalReview = (goal, nextTask, overrideDraft) => {
            const reviewDraft = overrideDraft || getGoalReviewDraft(goal);
            const isCompletion = overrideDraft?.complete === true || completionGoalIds[goal.id] === true;
            const change = String(reviewDraft.change || '').trim();
            const current = String(reviewDraft.current ?? '').trim();
            const nextStep = String(reviewDraft.nextStep || '').trim();
            if (!current) return;
            const reviewedAt = new Date().toISOString();
            const reviewHistory = Array.isArray(goal?.reviewHistory) ? goal.reviewHistory : [];
            const patch = {
                reviewChange: change,
                reviewCurrent: current,
                reviewNextStep: nextStep,
                reviewNote: change,
                reviewedAt,
                reviewHistory: reviewHistory.concat({
                    id: 'review-' + reviewedAt + '-' + Math.random().toString(36).slice(2, 7),
                    at: reviewedAt,
                    current,
                    change,
                    nextStep,
                }),
            };
            if (isCompletion) patch.status = 'done';
            const currentValue = goalNumber(current);
            if (currentValue !== null && goalNumber(goal?.targetValue) !== null) {
                patch.currentValue = currentValue;
                if (goalNumber(goal?.baselineValue) === null) {
                    const previousValue = goalNumber(goal?.currentValue);
                    patch.baselineValue = previousValue === null ? currentValue : previousValue;
                }
            }
            if (!isCompletion && nextStep && typeof state?.addTask === 'function' && (!nextTask || nextTask.status === 'done' || nextTask.status === 'cancelled')) {
                const project = ensureGoalProject(goal);
                const task = state.addTask(nextStep, {
                    projectId: project?.id,
                    dueDate: goal.dueDate || undefined,
                    plannedMinutes: 30,
                    priority: 'p2',
                    status: 'in_progress',
                });
                if (task?.id) patch.nextTaskId = task.id;
            }
            commitGoalPatch(goal, patch);
            setReviewDrafts((currentDrafts) => {
                const nextDrafts = { ...currentDrafts };
                delete nextDrafts[goal.id];
                return nextDrafts;
            });
            closeGoalReview(goal);
        };
        const archiveGoalWithUndo = (goal) => {
            if (!goal?.id || typeof state?.archiveGoal !== 'function') return;
            const archived = state.archiveGoal(goal.id);
            if (!archived) return;
            setArchivedNotice({ id: goal.id, title: goal.title || 'Цель' });
            setCreatedNotice(null);
            setExpandedGoalIds((current) => ({ ...current, [goal.id]: false }));
            setAdvancedGoalIds((current) => ({ ...current, [goal.id]: false }));
        };
        const restoreArchivedGoal = (goalId) => {
            const id = goalId || archivedNotice?.id;
            if (!id || typeof state?.updateGoal !== 'function') return;
            const restored = state.updateGoal(id, { status: 'active' });
            if (restored && archivedNotice?.id === id) setArchivedNotice(null);
        };
        const openGoalMap = (goal) => {
            if (!goal?.id) return;
            setCreatedNotice(null);
            setMapGoalId(goal.id);
        };
        const clearGoalMapHistoryMarker = () => {
            try {
                if (!history.state?.heysGoalMap) return;
                const nextState = { ...(history.state || {}) };
                delete nextState.heysGoalMap;
                history.replaceState(nextState, '');
            } catch (_) { /* noop */ }
        };
        const openGoalSettingsFromMap = (goal) => {
            if (!goal?.id) return;
            clearGoalMapHistoryMarker();
            setMapGoalId(null);
            openGoalDetails(goal);
        };
        const renderGoalWizard = () => {
            if (!isWizardOpen) return null;
            const goalType = getEffectiveGoalType(draft);
            const metric = getEffectiveMetricPreset(draft, goalType);
            const metricUnit = String(metric?.unit || '');
            const targetNumberProps = metricUnit === 'дн/нед' || metricUnit === 'раз/нед'
                ? { min: 1, max: 7, step: 1 }
                : metricUnit === 'мин'
                    ? { min: 1, max: 10080, step: 5 }
                    : { min: 0.1, max: 10000, step: 0.1 };
            const selectMetric = (metricId) => {
                setDraft((current) => ({
                    ...current,
                    metricKey: metricId,
                    targetValue: '',
                }));
            };
            const steps = [
                {
                    label: 'Результат',
                    title: 'Что должно стать иначе?',
                    body: h('div', { className: 'planning-goals-wizard__stack' },
                        h('input', {
                            name: 'planning-goal-wizard-title',
                            value: draft.title,
                            onChange: (event) => setDraft((current) => ({ ...current, title: event.target.value })),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') goToNextWizardStep();
                            },
                            placeholder: 'Например: ложиться до полуночи',
                            'aria-label': 'Название новой цели',
                        }),
                        h('input', {
                            type: 'date',
                            name: 'planning-goal-wizard-due-date',
                            value: draft.dueDate,
                            onChange: (event) => setDraft((current) => ({ ...current, dueDate: event.target.value })),
                            'aria-label': 'Срок цели',
                        }),
                        h('div', { className: 'planning-goals-wizard__chips' },
                            h('button', { type: 'button', onClick: () => setDraft((current) => ({ ...current, dueDate: getGoalDateAfter(7) })) }, 'Неделя'),
                            h('button', { type: 'button', onClick: () => setDraft((current) => ({ ...current, dueDate: getGoalDateAfter(30) })) }, 'Месяц'),
                        ),
                    ),
                },
                {
                    label: 'Метрика',
                    title: 'Как поймём, что получилось?',
                    body: h('div', { className: 'planning-goals-wizard__stack' },
                        h('div', { className: 'planning-goals-wizard__choices', 'aria-label': 'Метрика цели' },
                            (goalType.metrics || []).map((item) => h('button', {
                                key: item.id,
                                type: 'button',
                                className: item.id === metric.id ? 'is-active' : '',
                                onClick: () => selectMetric(item.id),
                            }, item.label)),
                        ),
                        metric.targetMode === 'number'
                            ? h('label', { className: 'planning-goals-wizard__number' },
                                h('span', null, metric.targetLabel || 'Цель'),
                                h('div', null,
                                    h('input', {
                                        type: 'number',
                                        inputMode: 'decimal',
                                        ...targetNumberProps,
                                        name: 'planning-goal-wizard-target',
                                        value: draft.targetValue,
                                        onChange: (event) => setDraft((current) => ({ ...current, targetValue: event.target.value })),
                                        placeholder: metric.unit || 'значение',
                                        'aria-label': 'Целевое значение',
                                    }),
                                    metric.unit && h('strong', null, metric.unit),
                                ),
                            )
                            : h('p', { className: 'planning-goals-wizard__hint' }, metric.metricLabel),
                    ),
                },
                {
                    label: 'Действие',
                    title: 'Что и когда сделать первым?',
                    body: h('div', { className: 'planning-goals-wizard__stack' },
                        h('input', {
                            name: 'planning-goal-wizard-next-task',
                            value: draft.nextTaskTitle,
                            onChange: (event) => setDraft((current) => ({ ...current, nextTaskTitle: event.target.value })),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handleAddGoal();
                            },
                            placeholder: goalType.steps?.[0] || 'Первое действие',
                            'aria-label': 'Первый шаг по цели',
                        }),
                        h('div', { className: 'planning-goals-wizard__chips' },
                            (goalType.steps || []).map((item) => h('button', {
                                key: item,
                                type: 'button',
                                onClick: () => setDraft((current) => ({ ...current, nextTaskTitle: item })),
                            }, item)),
                        ),
                        h('div', { className: 'planning-goals-wizard__schedule' },
                            h('input', {
                                type: 'date',
                                value: draft.slotDate,
                                onChange: (event) => setDraft((current) => ({ ...current, slotDate: event.target.value })),
                                'aria-label': 'Дата первого действия',
                            }),
                            h('input', {
                                type: 'time',
                                value: draft.slotStartTime,
                                onChange: (event) => setDraft((current) => ({ ...current, slotStartTime: event.target.value })),
                                'aria-label': 'Время первого действия',
                            }),
                        ),
                    ),
                },
            ];
            const currentStep = steps[wizardStep] || steps[0];
            const canContinue = [
                draftReadiness.title && draftReadiness.dueDate,
                draftReadiness.metric,
                draftReadiness.step && draftReadiness.schedule,
            ][wizardStep] === true;
            return h('div', { className: 'planning-goals-wizard', 'aria-label': 'Мастер цели' },
                h('div', { className: 'planning-goals-wizard__top' },
                    h('span', null, (wizardStep + 1) + '/3'),
                    h('strong', null, currentStep.label),
                ),
                h('h3', null, currentStep.title),
                h('div', { className: 'planning-goals-wizard__body' }, currentStep.body),
                h('div', { className: 'planning-goals-wizard__dots', 'aria-hidden': 'true' },
                    steps.map((step, index) => h('span', {
                        key: step.label,
                        className: index === wizardStep ? 'is-active' : '',
                    })),
                ),
                h('div', { className: 'planning-goals-wizard__actions' },
                    h('button', { type: 'button', className: 'is-quiet', onClick: resetWizard }, 'Отмена'),
                    wizardStep > 0 && h('button', { type: 'button', className: 'is-quiet', onClick: goToPreviousWizardStep }, 'Назад'),
                    h('button', {
                        type: 'button',
                        className: 'is-primary',
                        onClick: goToNextWizardStep,
                        disabled: !canContinue,
                    }, wizardStep >= 2 ? 'Создать и запланировать' : 'Далее'),
                ),
            );
        };
        const renderGoalCard = (goal, options) => {
            const isSettingsView = options?.settingsView === true;
            const keyResults = Array.isArray(goal.keyResults) ? goal.keyResults : [];
            const keyResultsDone = keyResults.filter((item) => item?.done).length;
            const reviewHistory = Array.isArray(goal.reviewHistory) ? goal.reviewHistory : [];
            const isExpanded = isSettingsView || expandedGoalIds[goal.id] === true;
            const isReviewOpen = reviewGoalIds[goal.id] === true;
            const isCompletion = completionGoalIds[goal.id] === true;
            const isReviewDetailsOpen = reviewDetailsGoalIds[goal.id] === true;
            const isAdvancedOpen = advancedGoalIds[goal.id] === true;
            const today = Planning.Utils?.dateStr ? Planning.Utils.dateStr() : new Date().toISOString().slice(0, 10);
            const readModel = buildGoalReadModel(goal, state, today);
            const project = projects.find((item) => item.id === goal.projectId) || null;
            const nextTask = readModel.focusTask;
            const progress = readModel.resultProgress;
            const showProgress = readModel.hasResultProgress;
            const dueState = readModel.dueState;
            const isScheduleOpen = scheduleGoalIds[goal.id] === true;
            const scheduleDraft = getGoalScheduleDraft(goal);
            const outcome = String(goal.outcome || '').trim();
            const metricSummary = buildGoalMetricSummary(goal);
            const hasNumericMetric = goalNumber(goal?.currentValue) !== null
                || goalNumber(goal?.targetValue) !== null
                || !!String(goal?.metricUnit || '').trim();
            const showMetricSummary = metricSummary && (!outcome || hasNumericMetric);
            const reviewDraft = getGoalReviewDraft(goal);
            const canSaveReview = String(reviewDraft.current ?? '').trim().length > 0;
            const reviewPlaceholder = goalNumber(goal?.targetValue) !== null
                ? 'Новое значение' + (goal.metricUnit ? ', ' + goal.metricUnit : '')
                : 'Коротко: что получилось';
            const finalResult = goal?.status === 'done'
                ? String(goal.reviewCurrent || reviewHistory[reviewHistory.length - 1]?.current || '').trim()
                : '';
            return h('article', {
                key: goal.id,
                className: 'planning-goals-card' + (isSettingsView ? ' planning-goals-card--settings' : ''),
            },
                !isSettingsView && h('div', { className: 'planning-goals-card__top' },
                    h('div', { className: 'planning-goals-card__title-wrap' },
                        h('h3', { className: 'planning-goals-card__title' }, goal.title || 'Цель'),
                        h('div', { className: 'planning-goals-card__meta' },
                            h('span', {
                                className: 'planning-goals-card__course planning-goals-card__course--' + readModel.course.kind,
                            }, readModel.course.label),
                            goal.dueDate && goal?.status !== 'done' && h('span', {
                                className: dueState.isOverdue ? 'planning-goals-card__due--overdue' : '',
                            }, dueState.label),
                            goal?.status === 'done' && goal.completedAt
                                ? h('span', null, 'завершена ', formatGoalDate(goal.completedAt))
                                : goal.reviewedAt && h('span', null, 'обзор ', formatGoalDate(goal.reviewedAt)),
                        ),
                    ),
                    h('div', { className: 'planning-goals-card__tools' },
                        h('button', {
                            type: 'button',
                            className: 'planning-goals-card__settings',
                            onClick: () => openGoalDetails(goal),
                            'aria-label': 'Параметры цели',
                            title: 'Параметры цели',
                        }, 'Параметры'),
                    ),
                ),
                !isSettingsView && showProgress && h('div', { className: 'planning-goals-progress', 'aria-label': 'Прогресс цели ' + progress + '%' },
                    h('div', { className: 'planning-goals-progress__bar', style: { width: progress + '%' } }),
                    h('strong', null, progress + '%'),
                ),
                !isSettingsView && h('p', { className: 'planning-goals-card__reason' }, readModel.course.reason),
                !isSettingsView && (outcome || showMetricSummary || finalResult || nextTask) && h('div', { className: 'planning-goals-card__summary' },
                    outcome && h('div', null, h('strong', null, 'Результат'), h('span', null, outcome)),
                    showMetricSummary && h('div', null, h('strong', null, getGoalSummaryHeading(goal)), h('span', null, metricSummary)),
                    finalResult && h('div', null, h('strong', null, 'Итог'), h('span', null, finalResult)),
                    nextTask && h('div', null, h('strong', null, 'Сейчас'), h('span', null, nextTask.title || 'Задача')),
                    readModel.focusSlot && h('div', null, h('strong', null, 'Когда'), h('span', null, formatGoalSlot(readModel.focusSlot, today))),
                ),
                !isSettingsView && h('div', { className: 'planning-goals-card__signals' },
                    h('span', null, h('strong', null, readModel.completedTasks + '/' + readModel.goalTasks.length), ' задач'),
                    readModel.effort.week > 0 && h('span', null, h('strong', null, formatGoalMinutes(readModel.effort.week)), ' за неделю'),
                    keyResults.length > 0 && h('span', null, h('strong', null, keyResultsDone + '/' + keyResults.length), ' результатов'),
                ),
                !isSettingsView && !isExpanded && !isReviewOpen && h('div', { className: 'planning-goals-card__actions' },
                    h('button', {
                        type: 'button',
                        className: 'planning-goals-card__progress-action',
                        onClick: () => openGoalMap(goal),
                    }, 'Открыть карту'),
                ),
                !isSettingsView && isScheduleOpen && h('div', { className: 'planning-goals-schedule-panel' },
                    h('strong', null, nextTask?.title || 'Текущее действие'),
                    h('div', { className: 'planning-goals-wizard__schedule' },
                        h('input', {
                            type: 'date',
                            value: scheduleDraft.date,
                            onChange: (event) => updateGoalScheduleDraft(goal, { date: event.target.value }),
                            'aria-label': 'Дата действия',
                        }),
                        h('input', {
                            type: 'time',
                            value: scheduleDraft.startTime,
                            onChange: (event) => updateGoalScheduleDraft(goal, { startTime: event.target.value }),
                            'aria-label': 'Время действия',
                        }),
                    ),
                    h('div', { className: 'planning-goals-review-panel__actions' },
                        h('button', { type: 'button', onClick: () => toggleGoalSchedule(goal) }, 'Отмена'),
                        h('button', { type: 'button', className: 'is-primary', onClick: () => scheduleGoalFocus(goal, nextTask) }, 'Поставить в календарь'),
                    ),
                ),
                isReviewOpen && h('div', { className: 'planning-goals-review-panel' },
                    h('label', null,
                        h('span', null, isCompletion ? 'Итоговый результат' : 'Текущий результат'),
                        h('input', {
                            name: 'planning-goal-review-current',
                            value: reviewDraft.current,
                            onChange: (event) => updateGoalReviewDraft(goal, { current: event.target.value }),
                            placeholder: reviewPlaceholder,
                            autoFocus: true,
                        }),
                    ),
                    h('button', {
                        type: 'button',
                        className: 'planning-goals-review-panel__more',
                        onClick: () => toggleGoalReviewDetails(goal),
                        'aria-expanded': isReviewDetailsOpen,
                    }, isReviewDetailsOpen ? 'Скрыть детали' : 'Добавить детали'),
                    isReviewDetailsOpen && h('div', { className: 'planning-goals-review-panel__details' },
                        h('label', null,
                            h('span', null, 'Что изменилось'),
                            h('input', {
                                name: 'planning-goal-review-change',
                                value: reviewDraft.change,
                                onChange: (event) => updateGoalReviewDraft(goal, { change: event.target.value }),
                                placeholder: 'Короткий итог',
                            }),
                        ),
                        !isCompletion && h('label', null,
                            h('span', null, 'Следующий шаг'),
                            h('input', {
                                name: 'planning-goal-review-next-step',
                                value: reviewDraft.nextStep,
                                onChange: (event) => updateGoalReviewDraft(goal, { nextStep: event.target.value }),
                                placeholder: 'Что сделать дальше',
                            }),
                        ),
                    ),
                    h('div', { className: 'planning-goals-review-panel__actions' },
                        h('button', { type: 'button', onClick: () => closeGoalReview(goal) }, 'Отмена'),
                        h('button', {
                            type: 'button',
                            className: 'is-primary',
                            onClick: () => saveGoalReview(goal, nextTask),
                            disabled: !canSaveReview,
                        }, isCompletion ? 'Завершить цель' : 'Сохранить'),
                    ),
                ),
                isExpanded && h('div', { className: 'planning-goals-card__details' },
                    isSettingsView && h('label', { className: 'planning-goals-settings__title' },
                        h('span', null, 'Название'),
                        h('input', {
                            defaultValue: goal.title || '',
                            name: 'planning-goal-title',
                            onBlur: (event) => commitGoalPatch(goal, { title: event.target.value }),
                            'aria-label': 'Название цели',
                        }),
                    ),
                    isSettingsView && h('section', { className: 'planning-goals-workspace' },
                        h('div', { className: 'planning-goals-workspace__course planning-goals-workspace__course--' + readModel.course.kind },
                            h('strong', null, readModel.course.label),
                            h('span', null, readModel.course.reason),
                        ),
                        h('div', { className: 'planning-goals-workspace__signals' },
                            h('div', null,
                                h('span', null, 'Результат'),
                                h('strong', null, readModel.hasResultProgress ? readModel.resultProgress + '%' : 'не проверен'),
                            ),
                            h('div', null,
                                h('span', null, 'План'),
                                h('strong', null, readModel.completedTasks + '/' + readModel.goalTasks.length),
                            ),
                            h('div', null,
                                h('span', null, 'Усилие'),
                                h('strong', null, formatGoalMinutes(readModel.effort.week)),
                            ),
                        ),
                        project && h('p', { className: 'planning-goals-workspace__project' }, 'Проект: ', h('strong', null, project.name || goal.title)),
                        h('div', { className: 'planning-goals-workspace__focus' },
                            h('span', null, 'Текущий фокус'),
                            h('strong', null, nextTask?.title || 'Действие не выбрано'),
                            readModel.blocker && h('small', { className: 'is-critical' }, 'Блокирует: ', readModel.blocker.title),
                            readModel.focusSlot && h('small', null, 'В календаре: ', formatGoalSlot(readModel.focusSlot, today)),
                        ),
                        readModel.goalTasks.length > 0 && h('div', { className: 'planning-goals-workspace__section' },
                            h('div', { className: 'planning-goals-block__head' }, 'Действия проекта'),
                            h('div', { className: 'planning-goals-workspace__tasks' },
                                readModel.goalTasks.map((task) => h('div', {
                                    key: task.id,
                                    className: 'planning-goals-workspace__task' + (task.id === nextTask?.id ? ' is-focus' : ''),
                                },
                                    h('input', {
                                        type: 'checkbox',
                                        checked: task.status === 'done',
                                        onChange: () => state.updateTask?.(task.id, {
                                            status: task.status === 'done' ? 'in_progress' : 'done',
                                        }),
                                        'aria-label': (task.status === 'done' ? 'Вернуть задачу: ' : 'Выполнить задачу: ') + task.title,
                                    }),
                                    h('button', { type: 'button', onClick: () => selectGoalFocus(goal, task.id) }, task.title || 'Задача'),
                                    task.id === nextTask?.id && h('small', null, 'фокус'),
                                )),
                            ),
                        ),
                        readModel.taskSlots.length > 0 && h('div', { className: 'planning-goals-workspace__section' },
                            h('div', { className: 'planning-goals-block__head' }, 'Календарный план'),
                            h('div', { className: 'planning-goals-workspace__slots' },
                                readModel.taskSlots.slice().sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))
                                    || String(left.startTime || '').localeCompare(String(right.startTime || ''))).map((slot) => {
                                    const task = readModel.goalTasks.find((item) => item.id === slot.taskId);
                                    return h('div', { key: slot.id },
                                        h('strong', null, formatGoalSlot(slot, today)),
                                        h('span', null, task?.title || slot.title || 'Действие'),
                                    );
                                }),
                            ),
                        ),
                    ),
                    h('div', { className: 'planning-goals-grid' },
                        h('label', null,
                            h('span', null, 'Результат'),
                            h('input', {
                                name: 'planning-goal-outcome',
                                defaultValue: goal.outcome || '',
                                onBlur: (event) => commitGoalPatch(goal, { outcome: event.target.value }),
                                placeholder: 'Что должно измениться',
                            }),
                        ),
                        h('label', null,
                            h('span', null, 'Метрика'),
                            h('input', {
                                name: 'planning-goal-metric',
                                defaultValue: goal.metricLabel || '',
                                onBlur: (event) => commitGoalPatch(goal, { metricLabel: event.target.value }),
                                placeholder: 'Например: вес, тренировки, шаги',
                            }),
                        ),
                        hasNumericMetric && h('label', null,
                            h('span', null, 'Сейчас'),
                            h('input', {
                                type: 'number',
                                inputMode: 'decimal',
                                name: 'planning-goal-current-value',
                                defaultValue: goal.currentValue ?? '',
                                onBlur: (event) => commitGoalCurrent(goal, event.target.value),
                            }),
                        ),
                        hasNumericMetric && h('label', null,
                            h('span', null, 'Цель'),
                            h('input', {
                                type: 'number',
                                inputMode: 'decimal',
                                name: 'planning-goal-target-value',
                                defaultValue: goal.targetValue ?? '',
                                onBlur: (event) => commitGoalPatch(goal, { targetValue: event.target.value }),
                            }),
                        ),
                        h('label', null,
                            h('span', null, 'Срок'),
                            h('input', {
                                type: 'date',
                                name: 'planning-goal-due-date',
                                defaultValue: goal.dueDate || '',
                                onChange: (event) => commitGoalPatch(goal, { dueDate: event.target.value || undefined }),
                            }),
                        ),
                    ),
                    h('div', { className: 'planning-goals-block planning-goals-block--next' },
                        h('div', { className: 'planning-goals-block__head' }, 'Добавить действие'),
                        h('div', { className: 'planning-goals-inline-add' },
                            h('input', {
                                name: 'planning-goal-next-task-title',
                                value: nextTaskDrafts[goal.id] || '',
                                onChange: (event) => setNextTaskDrafts((current) => ({ ...current, [goal.id]: event.target.value })),
                                onKeyDown: (event) => {
                                    if (event.key === 'Enter') createNextTask(goal);
                                },
                                placeholder: 'Создать задачу',
                            }),
                            h('button', { type: 'button', onClick: () => createNextTask(goal) }, '+'),
                        ),
                        readModel.goalTasks.some(isGoalTaskActive) && h('select', {
                            className: 'planning-goals-task-select',
                            name: 'planning-goal-next-task-id',
                            value: nextTask?.id || '',
                            onChange: (event) => selectGoalFocus(goal, event.target.value),
                            'aria-label': 'Выбрать текущий фокус',
                        },
                            h('option', { value: '' }, 'Выбрать текущий фокус'),
                            readModel.goalTasks.filter(isGoalTaskActive).map((task) => h('option', { key: task.id, value: task.id }, task.title || 'Задача')),
                        ),
                    ),
                    h('button', {
                        type: 'button',
                        className: 'planning-goals-advanced-toggle',
                        onClick: () => toggleGoalAdvanced(goal),
                        'aria-expanded': isAdvancedOpen,
                    }, isAdvancedOpen ? 'Скрыть дополнительно' : 'Дополнительно'),
                    isAdvancedOpen && h('div', { className: 'planning-goals-advanced' },
                        reviewHistory.length > 0 && h('div', { className: 'planning-goals-block' },
                            h('div', { className: 'planning-goals-block__head' }, 'История прогресса'),
                            h('div', { className: 'planning-goals-history' },
                                reviewHistory.slice().reverse().map((review) => h('div', {
                                    key: review.id,
                                    className: 'planning-goals-history__item',
                                },
                                    h('div', { className: 'planning-goals-history__top' },
                                        h('strong', null, formatGoalReviewDate(review.at)),
                                        h('span', null, review.current),
                                    ),
                                    review.change && h('p', null, review.change),
                                    review.nextStep && h('small', null, 'Дальше: ', review.nextStep),
                                )),
                            ),
                        ),
                        h('div', { className: 'planning-goals-block' },
                            h('div', { className: 'planning-goals-block__head' }, 'Ключевые результаты'),
                            keyResults.length > 0 && h('div', { className: 'planning-goals-kr-list' },
                                keyResults.map((item) => h('label', {
                                    key: item.id,
                                    className: 'planning-goals-kr' + (item.done ? ' is-done' : ''),
                                },
                                    h('input', {
                                        type: 'checkbox',
                                        checked: item.done === true,
                                        onChange: () => toggleKeyResult(goal, item),
                                    }),
                                    h('span', null, item.text),
                                    h('button', {
                                        type: 'button',
                                        onClick: (event) => {
                                            event.preventDefault();
                                            removeKeyResult(goal, item);
                                        },
                                        'aria-label': 'Удалить результат',
                                    }, '×'),
                                )),
                            ),
                            h('div', { className: 'planning-goals-inline-add' },
                                h('input', {
                                    name: 'planning-goal-key-result',
                                    value: keyResultDrafts[goal.id] || '',
                                    onChange: (event) => setKeyResultDrafts((current) => ({ ...current, [goal.id]: event.target.value })),
                                    onKeyDown: (event) => {
                                        if (event.key === 'Enter') addKeyResult(goal);
                                    },
                                    placeholder: 'Добавить измеримый результат',
                                }),
                                h('button', { type: 'button', onClick: () => addKeyResult(goal) }, '+'),
                            ),
                        ),
                        h('div', { className: 'planning-goals-grid planning-goals-grid--wide' },
                            h('label', null,
                                h('span', null, 'Препятствие'),
                                h('input', {
                                    name: 'planning-goal-obstacle',
                                    defaultValue: goal.obstacle || '',
                                    onBlur: (event) => commitGoalPatch(goal, { obstacle: event.target.value }),
                                    placeholder: 'Что обычно мешает',
                                }),
                            ),
                            h('label', null,
                                h('span', null, 'Если мешает'),
                                h('input', {
                                    name: 'planning-goal-if-then-plan',
                                    defaultValue: goal.ifThenPlan || '',
                                    onBlur: (event) => commitGoalPatch(goal, { ifThenPlan: event.target.value }),
                                    placeholder: 'Что делаю вместо паузы',
                                }),
                            ),
                        ),
                    ),
                    !isReviewOpen && h('div', { className: 'planning-goals-card__footer' },
                        h('button', {
                            type: 'button',
                            className: goal?.status === 'done'
                                ? 'planning-goals-card__restore-action'
                                : 'planning-goals-card__done',
                            onClick: () => goal?.status === 'done'
                                ? commitGoalPatch(goal, { status: 'active' })
                                : startGoalCompletion(goal),
                        }, goal?.status === 'done' ? 'Вернуть в активные' : 'Завершить цель'),
                        h('button', {
                            type: 'button',
                            className: 'planning-goals-card__archive-action',
                            onClick: () => archiveGoalWithUndo(goal),
                        }, 'Перенести в архив'),
                    ),
                ),
            );
        };

        const selectedMapGoal = goals.find((goal) => goal.id === mapGoalId);
        if (selectedMapGoal) {
            const GoalMapScreen = HEYS.PlanningGoalMap?.GoalMapScreen;
            if (GoalMapScreen) {
                const today = Planning.Utils?.dateStr ? Planning.Utils.dateStr() : new Date().toISOString().slice(0, 10);
                const mapReadModel = buildGoalReadModel(selectedMapGoal, state, today);
                return h(GoalMapScreen, {
                    goal: selectedMapGoal,
                    state,
                    readModel: mapReadModel,
                    onBack: () => setMapGoalId(null),
                    onOpenSettings: () => openGoalSettingsFromMap(selectedMapGoal),
                    onStartFocus: () => {
                        clearGoalMapHistoryMarker();
                        setMapGoalId(null);
                        startGoalFocus(selectedMapGoal, mapReadModel);
                    },
                    onScheduleFocus: (schedule) => scheduleGoalFocus(selectedMapGoal, mapReadModel.focusTask, schedule),
                    onSaveReview: (reviewDraft) => saveGoalReview(selectedMapGoal, mapReadModel.focusTask, reviewDraft),
                    onRestore: () => commitGoalPatch(selectedMapGoal, { status: 'active' }),
                });
            }
        }

        const selectedGoal = activeGoals.find((goal) => expandedGoalIds[goal.id] === true);
        if (selectedGoal) {
            return h('div', {
                className: 'planning-goals-screen planning-goals-screen--settings',
                'aria-label': 'Настройка цели',
            },
                h('div', { className: 'planning-goals-settings__header' },
                    h('button', {
                        type: 'button',
                        className: 'planning-goals-settings__back',
                        onClick: () => closeGoalDetails(selectedGoal),
                    }, '← Назад'),
                    h('div', null,
                        h('span', null, 'Цель'),
                        h('h2', null, selectedGoal.title || 'Настройка'),
                    ),
                ),
                renderGoalCard(selectedGoal, { settingsView: true }),
            );
        }

        return h('div', { className: 'planning-goals-screen', 'aria-label': 'Целеполагание' },
            h('div', { className: 'planning-goals-header' },
                h('div', { className: 'planning-goals-header__row' },
                    h('h2', null, 'Цели'),
                    !isWizardOpen && h('button', {
                        type: 'button',
                        className: 'planning-goals-new-button',
                        onClick: () => {
                            setCreatedNotice(null);
                            setArchivedNotice(null);
                            setWizardStep(0);
                            setIsWizardOpen(true);
                        },
                    }, '+ Цель'),
                ),
                renderGoalWizard(),
                !isWizardOpen && createdNotice && h('div', { className: 'planning-goals-created' },
                    h('strong', null, 'Цель создана'),
                    h('span', null, createdNotice.title || 'Новая цель'),
                ),
                !isWizardOpen && archivedNotice && h('div', { className: 'planning-goals-archived-notice' },
                    h('span', null, '«', archivedNotice.title, '» в архиве'),
                    h('button', { type: 'button', onClick: () => restoreArchivedGoal() }, 'Вернуть'),
                ),
            ),
            activeGoals.length === 0
                ? h('div', { className: 'planning-empty planning-empty--inline' }, isWizardOpen ? 'После мастера цель появится здесь.' : 'Нажмите + Цель, чтобы создать первую.')
                : h('div', { className: 'planning-goals-list' }, activeGoals.map(renderGoalCard)),
            archivedGoals.length > 0 && h('div', { className: 'planning-goals-archive' },
                h('button', {
                    type: 'button',
                    className: 'planning-goals-archive__toggle',
                    onClick: () => setIsArchiveOpen((current) => !current),
                    'aria-expanded': isArchiveOpen,
                }, isArchiveOpen ? 'Скрыть архив' : 'Архив (' + archivedGoals.length + ')'),
                isArchiveOpen && h('div', { className: 'planning-goals-archive__list' },
                    archivedGoals.map((goal) => h('div', { key: goal.id, className: 'planning-goals-archive__item' },
                        h('span', null, goal.title || 'Цель'),
                        h('button', { type: 'button', onClick: () => openGoalMap(goal) }, 'Открыть карту'),
                        h('button', { type: 'button', onClick: () => restoreArchivedGoal(goal.id) }, 'Вернуть'),
                    )),
                ),
            ),
        );
    }

    function resolvePlanningRuntime() {
        const TasksScreen = HEYS.PlanningTasks && HEYS.PlanningTasks.TasksScreen;
        const TaskMatrixModal = HEYS.PlanningTasks && HEYS.PlanningTasks.TaskMatrixModal;
        const MatrixIcon = HEYS.PlanningTasks && HEYS.PlanningTasks.MatrixIcon;
        const buildResolvedTaskProjectMap = HEYS.PlanningTasks && HEYS.PlanningTasks.buildResolvedTaskProjectMap;
        const CalendarScreen = HEYS.PlanningSchedule && HEYS.PlanningSchedule.CalendarScreen;
        const useGanttV2 = !!(HEYS.featureFlags && typeof HEYS.featureFlags.isEnabled === 'function'
            && HEYS.featureFlags.isEnabled('gantt_v2'));
        const GanttScreen = useGanttV2 && HEYS.PlanningGantt && HEYS.PlanningGantt.GanttScreen
            ? HEYS.PlanningGantt.GanttScreen
            : (HEYS.PlanningSchedule && HEYS.PlanningSchedule.GanttScreen);
        const ChronoScreen = HEYS.PlanningChrono && HEYS.PlanningChrono.ChronoScreen;
        const usePlanningState = Planning.Hooks && Planning.Hooks.usePlanningState;

        return {
            TasksScreen,
            CalendarScreen,
            GanttScreen,
            ChronoScreen,
            TaskMatrixModal,
            MatrixIcon,
            buildResolvedTaskProjectMap,
            usePlanningState,
            store: Planning.Store || {},
        };
    }

    function PlanningTab(props = {}) {
        const requestedHomeScreen = getInitialPlanningHomeScreen(props.defaultHomeScreen);
        const [activeScreen, setActiveScreen] = useState(() => requestedHomeScreen);
        const [showTaskMatrix, setShowTaskMatrix] = useState(false);
        const [layoutMetrics, setLayoutMetrics] = useState({ mainTabsHeight: 0, subnavHeight: 0 });
        const runtime = resolvePlanningRuntime();
        const planState = runtime.usePlanningState ? runtime.usePlanningState() : null;
        const subnavRef = useRef(null);
        const hasUserNavigatedRef = useRef(false);

        useEffect(() => {
            setActiveScreen((currentScreen) => {
                const nextScreen = resolveNextPlanningHomeScreen(
                    currentScreen,
                    requestedHomeScreen,
                    hasUserNavigatedRef.current,
                );

                return currentScreen === nextScreen ? currentScreen : nextScreen;
            });
        }, [requestedHomeScreen]);

        useEffect(() => {
            if (typeof document === 'undefined' || !document.body) return undefined;
            document.body.classList.add('planning-tab-active');
            return () => {
                document.body.classList.remove('planning-tab-active');
            };
        }, []);

        useEffect(() => {
            const pull = HEYS.Planning && typeof HEYS.Planning.refreshPlanningFromCloud === 'function'
                ? HEYS.Planning.refreshPlanningFromCloud
                : null;
            if (!pull) return undefined;
            pull().catch(function () { /* offline / RPC optional */ });
            return undefined;
        }, []);

        useEffect(() => {
            if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

            let frameId = 0;
            const measureLayout = () => {
                const nextMainTabsHeight = Math.round(document.querySelector('.tabs')?.getBoundingClientRect?.().height || 0);
                const nextSubnavHeight = Math.round(subnavRef.current?.getBoundingClientRect?.().height || 0);

                setLayoutMetrics((current) => {
                    if (current.mainTabsHeight === nextMainTabsHeight && current.subnavHeight === nextSubnavHeight) {
                        return current;
                    }

                    return {
                        mainTabsHeight: nextMainTabsHeight,
                        subnavHeight: nextSubnavHeight,
                    };
                });
            };

            frameId = window.requestAnimationFrame(measureLayout);

            const resizeObserver = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => measureLayout())
                : null;
            const tabsElement = document.querySelector('.tabs');

            if (resizeObserver) {
                if (tabsElement) resizeObserver.observe(tabsElement);
                if (subnavRef.current) resizeObserver.observe(subnavRef.current);
            }

            window.addEventListener('resize', measureLayout);
            return () => {
                window.cancelAnimationFrame(frameId);
                window.removeEventListener('resize', measureLayout);
                if (resizeObserver) resizeObserver.disconnect();
            };
        }, []);

        const planningLayoutStyle = useMemo(() => {
            const style = {};

            if (layoutMetrics.mainTabsHeight > 0) {
                style['--planning-main-tabs-height'] = layoutMetrics.mainTabsHeight + 'px';
            }

            if (layoutMetrics.subnavHeight > 0) {
                style['--planning-subnav-height'] = layoutMetrics.subnavHeight + 'px';
            }

            return style;
        }, [layoutMetrics.mainTabsHeight, layoutMetrics.subnavHeight]);

        const CurrentScreen = useMemo(() => {
            if (activeScreen === 'calendar') return runtime.CalendarScreen;
            if (activeScreen === 'gantt') return runtime.GanttScreen;
            if (activeScreen === 'chrono') return runtime.ChronoScreen;
            if (activeScreen === 'checklists') return ChecklistsScreen;
            if (activeScreen === 'goals') return GoalSettingScreen;
            return runtime.TasksScreen;
        }, [activeScreen, runtime.CalendarScreen, runtime.GanttScreen, runtime.ChronoScreen, runtime.TasksScreen]);

        const activeProjects = useMemo(() => (
            Array.isArray(planState?.projects)
                ? planState.projects.filter((project) => project?.status !== 'archived')
                : []
        ), [planState?.projects]);
        const taskLookup = useMemo(() => (
            new Map((Array.isArray(planState?.tasks) ? planState.tasks : []).map((task) => [task.id, task]))
        ), [planState?.tasks]);
        const resolvedTaskProjectIds = useMemo(() => {
            if (typeof runtime.buildResolvedTaskProjectMap !== 'function') return new Map();
            return runtime.buildResolvedTaskProjectMap(Array.isArray(planState?.tasks) ? planState.tasks : [], activeProjects);
        }, [activeProjects, planState?.tasks, runtime.buildResolvedTaskProjectMap]);

        if (!planState || !runtime.TasksScreen || !runtime.CalendarScreen || !runtime.GanttScreen || !runtime.ChronoScreen) {
            console.warn('[HEYS.planning] Planning split modules are not ready yet');
            return h(PlanningFallback);
        }

        const subnavNode = h('div', { className: 'planning-subnav planning-subnav--docked', ref: subnavRef },
            h('div', { className: 'planning-subnav__inner' },
                SUBNAV_RENDER_ITEMS.map((item) => {
                    const isAction = item.action === 'taskMatrix';
                    return h('button', {
                    key: item.id,
                    type: 'button',
                    title: item.label,
                    'aria-label': item.label,
                    'data-screen': item.id,
                    className: 'planning-subnav__item' + (activeScreen === item.id && !isAction ? ' active' : '') + (isAction ? ' planning-subnav__item--action planning-subnav__item--matrix' : ''),
                    onClick: () => {
                        if (isAction) {
                            setShowTaskMatrix(true);
                            return;
                        }
                        hasUserNavigatedRef.current = true;
                        setActiveScreen(item.id);
                    },
                },
                    h('span', { className: 'planning-subnav__icon', 'aria-hidden': 'true' },
                        isAction && runtime.MatrixIcon ? h(runtime.MatrixIcon) : item.icon,
                    ),
                    h('span', {
                        className: 'planning-subnav__label',
                        'data-short-label': item.shortLabel || item.label,
                        'aria-hidden': 'true',
                    }, item.label),
                );
                }),
            ),
        );

        return h('div', {
            className: 'planning-tab',
            style: planningLayoutStyle,
            'data-no-pull-refresh': 'true',
        },
            h('div', {
                className: 'planning-content'
                    + (activeScreen === 'calendar' ? ' planning-content--calendar-lock-scroll' : ''),
            },
                CurrentScreen ? h(CurrentScreen, {
                    state: planState,
                    onNavigate: (screen) => {
                        hasUserNavigatedRef.current = true;
                        setActiveScreen(screen);
                    },
                }) : h(PlanningFallback),
            ),
            h('div', { className: 'planning-subnav-shell', 'aria-hidden': 'true' }),
            showTaskMatrix && runtime.TaskMatrixModal && h(runtime.TaskMatrixModal, {
                tasks: Array.isArray(planState?.tasks) ? planState.tasks : [],
                projects: activeProjects,
                taskLookup,
                resolvedTaskProjectIds,
                todayIso: Planning.Utils && typeof Planning.Utils.dateStr === 'function'
                    ? Planning.Utils.dateStr()
                    : new Date().toISOString().slice(0, 10),
                onUpdateTask: planState.updateTask,
                onClose: () => setShowTaskMatrix(false),
            }),
            ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined'
                ? ReactDOM.createPortal(subnavNode, document.body)
                : subnavNode,
        );
    }

    HEYS.PlanningTab = PlanningTab;
    Planning.buildSeaTentChecklistPreset = buildSeaTentChecklistPreset;
    Planning.buildMountainChecklistPreset = buildMountainChecklistPreset;
    Planning.buildSeaHotelChecklistPreset = buildSeaHotelChecklistPreset;
    Planning.buildCityRentChecklistPreset = buildCityRentChecklistPreset;
    Planning.buildCityHotelChecklistPreset = buildCityHotelChecklistPreset;
    Planning.buildSkiChecklistPreset = buildSkiChecklistPreset;
    Planning.buildBusinessChecklistPreset = buildBusinessChecklistPreset;
    Planning.buildDachaChecklistPreset = buildDachaChecklistPreset;
    Planning.buildAbroadChecklistPreset = buildAbroadChecklistPreset;
    Planning.materializeSeaTentItems = materializeSeaTentItems;
    Planning.materializePresetItems = materializeSeaTentItems;
    Planning.getChecklistPreset = getChecklistPreset;
    Planning.getPresetChecklistParams = getPresetChecklistParams;
    Planning.CHECKLIST_PRESETS = Array.isArray(CHECKLIST_PRESETS) ? CHECKLIST_PRESETS.slice() : [];
    Planning.getDayTempBand = getDayTempBand;
    Planning.getNightTempBand = getNightTempBand;
    Planning.SUBNAV_ITEMS = SUBNAV_ITEMS.slice();
    Planning.DEFAULT_HOME_SCREEN = DEFAULT_HOME_SCREEN;
    Planning.resolveHomeScreen = resolvePlanningHomeScreen;
    Planning.getInitialHomeScreen = getInitialPlanningHomeScreen;
    Planning.resolveNextHomeScreen = resolveNextPlanningHomeScreen;
    HEYS.PlanningData = Planning.Store || {};
    console.info('[HEYS.planning] ✅ PlanningTab coordinator registered');
})();
