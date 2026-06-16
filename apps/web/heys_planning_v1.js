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
        { id: 'calendar', label: 'Календарь', shortLabel: 'Кален.', icon: '📅' },
        { id: 'gantt', label: 'Гант', shortLabel: 'Гант', icon: '📊' },
        { id: 'chrono', label: 'Хронометраж', shortLabel: 'Хроно', icon: '⏱️' },
        { id: 'checklists', label: 'Чеклисты', shortLabel: 'Чеклисты', icon: '📋' },
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
        CHECKLIST_PRESETS,
        clampCount,
        clampDayTemp,
        clampNightTemp,
        formatTemp,
        getDayTempBand,
        getNightTempBand,
        formatChildAgeInline,
        normalizeChildAges,
        buildPresetToggleOptions,
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
        const [toggleState, setToggleState] = useState({});
        const [selectedPresetId, setSelectedPresetId] = useState(CHECKLIST_PRESETS[0].id);
        const [addItemTarget, setAddItemTarget] = useState(null);
        const [newItemText, setNewItemText] = useState('');
        const [newItemQty, setNewItemQty] = useState('');
        const [collapsedById, setCollapsedById] = useState({});
        const selectedPresetDef = useMemo(
            () => CHECKLIST_PRESETS.find((preset) => preset.id === selectedPresetId) || CHECKLIST_PRESETS[0],
            [selectedPresetId],
        );
        const presetToggleOptions = useMemo(
            () => buildPresetToggleOptions(selectedPresetDef, toggleState),
            [selectedPresetDef, toggleState],
        );
        const builtPreset = useMemo(
            () => selectedPresetDef.build(adults, children, childAges, dayTemp, nightTemp, presetToggleOptions),
            [selectedPresetDef, adults, children, childAges, dayTemp, nightTemp, presetToggleOptions],
        );
        const previewItems = useMemo(
            () => builtPreset.items.map((entry) => ({ ...entry, done: false })),
            [builtPreset],
        );

        const anyModalOpen = createOpen || archiveOpen || addItemTarget != null;
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
                toggleFields[toggle.key] = presetToggleOptions[toggle.key] === true;
            });
            state.addChecklist({
                title: builtPreset.title,
                presetId: builtPreset.id,
                adults,
                children,
                childAges: builtPreset.childAges,
                dayTemp: builtPreset.dayTemp,
                nightTemp: builtPreset.nightTemp,
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

        const editSavedItem = (checklist, itemId) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
            const items = Array.isArray(checklist.items) ? checklist.items : [];
            const current = items.find((entry) => entry.id === itemId);
            if (!current) return;
            const nextTextRaw = window.prompt('Название пункта', String(current.text || ''));
            if (nextTextRaw == null) return;
            const nextText = String(nextTextRaw || '').trim();
            if (!nextText) return;
            const nextQtyRaw = window.prompt('Количество', String(current.quantity || ''));
            if (nextQtyRaw == null) return;
            const nextQuantity = String(nextQtyRaw || '').trim();
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

        const addSavedSection = (checklist) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
            const nextName = window.prompt('Название раздела', '');
            if (nextName == null) return;
            const group = normalizeChecklistGroupName(nextName);
            const groups = getChecklistCustomGroups(checklist);
            const existingNames = groupChecklistItems(checklist.items, groups)
                .map((section) => section.group.toLocaleLowerCase('ru-RU'));
            if (existingNames.includes(group.toLocaleLowerCase('ru-RU'))) return;
            state.updateChecklist(checklist.id, { customGroups: groups.concat(group) });
        };

        const renameSavedSection = (checklist, groupName) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
            const currentGroup = normalizeChecklistGroupName(groupName);
            const nextRaw = window.prompt('Название раздела', currentGroup);
            if (nextRaw == null) return;
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

        const closeAddItemModal = () => {
            setAddItemTarget(null);
            setNewItemText('');
            setNewItemQty('');
        };

        const toggleChecklistCollapsed = (checklistId) => {
            setCollapsedById((current) => ({ ...current, [checklistId]: current[checklistId] !== true }));
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
            const shouldArchive = typeof window === 'undefined' || typeof window.confirm !== 'function'
                ? true
                : window.confirm('Переместить «' + title + '» в архив?');
            if (!shouldArchive) return;
            state.updateChecklist(checklist.id, {
                status: 'archived',
                archivedAt: new Date().toISOString(),
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
            const shouldDelete = typeof window === 'undefined' || typeof window.confirm !== 'function'
                ? true
                : window.confirm('Удалить «' + title + '» навсегда?');
            if (!shouldDelete) return;
            state.deleteChecklist(checklist.id);
            if (archivedChecklists.length <= 1) closeArchiveModal();
        };

        const renameSavedChecklist = (checklist) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
            const currentTitle = String(checklist.title || '').trim() || 'Чек-лист';
            const nextTitle = window.prompt('Название чек-листа', currentTitle);
            if (nextTitle == null) return;
            const title = String(nextTitle || '').trim();
            if (!title || title === currentTitle) return;
            state.updateChecklist(checklist.id, { title });
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
            const toggleOptions = {};
            preset.toggles.forEach((toggle) => {
                toggleOptions[toggle.key] = Object.prototype.hasOwnProperty.call(patch || {}, toggle.key)
                    ? patch[toggle.key] === true
                    : current[toggle.key] === true;
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
                toggleFields[toggle.key] = toggleOptions[toggle.key] === true;
            });
            state.updateChecklist(checklist.id, {
                presetId: preset.id,
                adults: nextAdults,
                children: nextChildren,
                childAges: nextPreset.childAges,
                dayTemp: nextPreset.dayTemp,
                nightTemp: nextPreset.nightTemp,
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

        const toggleSavedFacility = (checklist, key) => {
            const params = getPresetChecklistParams(checklist, getChecklistPreset(checklist));
            updatePresetChecklistParams(checklist, { [key]: !(params[key] === true) });
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

        const renderTempControls = (currentDayTemp, currentNightTemp, onDayDelta, onNightDelta) => h(
            'div',
            { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--temps' },
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

        // Тумблеры пресета (розетка/душ, приют/палатка, снег…) рисуются из дескриптора.
        const renderUtilityControls = (preset, values, onToggle) => h(
            'div',
            { className: 'planning-checklists-screen__facility-toggles' },
            (preset?.toggles || []).map((toggle) => {
                const active = values[toggle.key] === true;
                return h('button', {
                    key: toggle.key,
                    type: 'button',
                    className: 'planning-checklists-screen__facility-toggle' + (active ? ' is-active' : ''),
                    onClick: () => onToggle(toggle.key),
                    'aria-pressed': active ? 'true' : 'false',
                }, active ? toggle.onLabel : toggle.offLabel);
            }),
        );

        const renderChecklistMeta = (checklist) => {
            const count = Array.isArray(checklist.items) ? checklist.items.length : 0;
            const preset = getChecklistPreset(checklist);
            if (!preset) return count + ' пунктов';
            const params = getPresetChecklistParams(checklist, preset);
            const toggleOptions = buildPresetToggleOptions(preset, params);
            const built = preset.build(
                params.adults,
                params.children,
                params.childAges,
                params.dayTemp,
                params.nightTemp,
                toggleOptions,
            );
            return count + ' пунктов · ' + built.audienceLabel + ' · ' + built.tempLabel + ' · ' + built.utilityLabel;
        };

        const renderChecklistProgress = (checklist) => {
            const items = Array.isArray(checklist?.items) ? checklist.items : [];
            const done = items.filter((entry) => entry?.done === true).length;
            return done + '/' + items.length + ' собрано';
        };

        const renderItem = (entry, onToggle, keyPrefix, onDelete, onEdit) => h('div', {
            key: keyPrefix + entry.id,
            className: 'planning-checklists-screen__item-row',
        },
            h('label', {
                className: 'planning-checklists-screen__item' + (entry.done ? ' is-done' : ''),
            },
                h('input', {
                    type: 'checkbox',
                    checked: entry.done === true,
                    onChange: () => onToggle(entry.id),
                }),
                h('span', { className: 'planning-checklists-screen__item-text' },
                    entry.quantity && h('span', { className: 'planning-checklists-screen__item-qty' }, entry.quantity),
                    h('span', null, entry.text),
                    entry.note && h('span', { className: 'planning-checklists-screen__item-note' }, entry.note),
                ),
            ),
            onEdit && h('button', {
                type: 'button',
                className: 'planning-checklists-screen__item-edit',
                onClick: () => onEdit(entry.id),
                'aria-label': 'Редактировать пункт',
                title: 'Редактировать пункт',
            }, '✎'),
            onDelete && h('button', {
                type: 'button',
                className: 'planning-checklists-screen__item-delete',
                onClick: () => onDelete(entry.id),
                'aria-label': 'Удалить пункт',
                title: 'Удалить пункт',
            }, '×'),
        );

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
                        section.items.map((entry) => renderItem(entry, onToggle, keyPrefix, opts.onDelete, opts.onEditItem)),
                    ),
                )),
            );
        };

        const renderSavedPresetControls = (checklist) => {
            const preset = getChecklistPreset(checklist);
            if (!preset) return null;
            const params = getPresetChecklistParams(checklist, preset);
            return h('div', { className: 'planning-checklists-screen__preset-controls planning-checklists-screen__saved-controls' },
                h('div', { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--saved' },
                    h('div', { className: 'planning-checklists-screen__counter' },
                        h('span', null, 'Взрослые'),
                        h('div', { className: 'planning-checklists-screen__stepper' },
                            h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'adults', -1), 'aria-label': 'Уменьшить количество взрослых' }, '−'),
                            h('strong', null, params.adults),
                            h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'adults', 1), 'aria-label': 'Увеличить количество взрослых' }, '+'),
                        ),
                    ),
                    h('div', {
                        className: 'planning-checklists-screen__counter planning-checklists-screen__counter--children'
                            + (params.children > 0 ? ' has-ages' : ''),
                    },
                        h('span', null, 'Дети'),
                        h('div', { className: 'planning-checklists-screen__children-tools' },
                            h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--count' },
                                h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'children', -1), 'aria-label': 'Уменьшить количество детей' }, '−'),
                                h('strong', null, params.children),
                                h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'children', 1), 'aria-label': 'Увеличить количество детей' }, '+'),
                            ),
                            params.children > 0 && renderAgeInlineControls(
                                params.childAges,
                                (index, delta) => updateSavedChildAge(checklist, index, delta),
                                checklist.id + '-child-age-',
                            ),
                        ),
                    ),
                ),
                renderTempControls(
                    params.dayTemp,
                    params.nightTemp,
                    (delta) => updateSavedTemp(checklist, 'day', delta),
                    (delta) => updateSavedTemp(checklist, 'night', delta),
                ),
                renderUtilityControls(
                    preset,
                    params,
                    (key) => toggleSavedFacility(checklist, key),
                ),
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
                                        h('span', null, preset.title),
                                    );
                                }),
                            ),
                            h('div', { className: 'planning-checklists-screen__preset-controls planning-checklists-screen__preset-controls--modal' },
                                h('div', { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--modal' },
                                    h('div', { className: 'planning-checklists-screen__counter' },
                                        h('span', null, 'Взрослые'),
                                        h('div', { className: 'planning-checklists-screen__stepper' },
                                            h('button', { type: 'button', onClick: () => setCount('adults', -1), 'aria-label': 'Уменьшить количество взрослых' }, '−'),
                                            h('strong', null, adults),
                                            h('button', { type: 'button', onClick: () => setCount('adults', 1), 'aria-label': 'Увеличить количество взрослых' }, '+'),
                                        ),
                                    ),
                                    h('div', {
                                        className: 'planning-checklists-screen__counter planning-checklists-screen__counter--children'
                                            + (children > 0 ? ' has-ages' : ''),
                                    },
                                        h('span', null, 'Дети'),
                                        h('div', { className: 'planning-checklists-screen__children-tools' },
                                            h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--count' },
                                                h('button', { type: 'button', onClick: () => setCount('children', -1), 'aria-label': 'Уменьшить количество детей' }, '−'),
                                                h('strong', null, children),
                                                h('button', { type: 'button', onClick: () => setCount('children', 1), 'aria-label': 'Увеличить количество детей' }, '+'),
                                            ),
                                            children > 0 && renderAgeInlineControls(
                                                normalizeChildAges(children, childAges),
                                                setPreviewChildAge,
                                                'preview-child-age-',
                                            ),
                                        ),
                                    ),
                                ),
                                renderTempControls(
                                    dayTemp,
                                    nightTemp,
                                    (delta) => setTemp('day', delta),
                                    (delta) => setTemp('night', delta),
                                ),
                                renderUtilityControls(
                                    selectedPresetDef,
                                    presetToggleOptions,
                                    (key) => setToggleState((current) => ({ ...current, [key]: current[key] !== true })),
                                ),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__primary',
                                onClick: handleCreatePreset,
                                disabled: !canCreate,
                            }, 'Создать из пресета'),
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
                        const isCollapsed = collapsedById[checklist.id] === true;
                        return h('div', {
                            key: checklist.id,
                            className: 'planning-checklists-screen__card widget-shadow-diary-glass widget-outline-diary-glass' + (isCollapsed ? ' is-collapsed' : ''),
                        },
                            h('div', { className: 'planning-checklists-screen__card-head' },
                                h('button', {
                                    type: 'button',
                                    className: 'planning-checklists-screen__card-toggle',
                                    onClick: () => toggleChecklistCollapsed(checklist.id),
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
                                onClick: () => addSavedSection(checklist),
                                disabled: typeof state?.updateChecklist !== 'function',
                            }, '+ Добавить раздел'),
                            !isCollapsed && renderGroups(
                                checklist.items || [],
                                (itemId) => toggleSavedItem(checklist, itemId),
                                'saved-' + checklist.id + '-',
                                {
                                    customGroups: getChecklistCustomGroups(checklist),
                                    groupOrder: getChecklistPreset(checklist)?.groups,
                                    onDelete: (itemId) => deleteSavedItem(checklist, itemId),
                                    onEditItem: (itemId) => editSavedItem(checklist, itemId),
                                    onAddToGroup: (group) => openAddItemModal(checklist, group),
                                    onEditGroup: (group) => renameSavedSection(checklist, group),
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
        );
    }

    function resolvePlanningRuntime() {
        const TasksScreen = HEYS.PlanningTasks && HEYS.PlanningTasks.TasksScreen;
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
            usePlanningState,
            store: Planning.Store || {},
        };
    }

    function PlanningTab(props = {}) {
        const requestedHomeScreen = getInitialPlanningHomeScreen(props.defaultHomeScreen);
        const [activeScreen, setActiveScreen] = useState(() => requestedHomeScreen);
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
            return runtime.TasksScreen;
        }, [activeScreen, runtime.CalendarScreen, runtime.GanttScreen, runtime.ChronoScreen, runtime.TasksScreen]);

        if (!planState || !runtime.TasksScreen || !runtime.CalendarScreen || !runtime.GanttScreen || !runtime.ChronoScreen) {
            console.warn('[HEYS.planning] Planning split modules are not ready yet');
            return h(PlanningFallback);
        }

        const subnavNode = h('div', { className: 'planning-subnav planning-subnav--docked', ref: subnavRef },
            h('div', { className: 'planning-subnav__inner' },
                SUBNAV_ITEMS.map((item) => h('button', {
                    key: item.id,
                    type: 'button',
                    title: item.label,
                    'aria-label': item.label,
                    'data-screen': item.id,
                    className: 'planning-subnav__item' + (activeScreen === item.id ? ' active' : ''),
                    onClick: () => {
                        hasUserNavigatedRef.current = true;
                        setActiveScreen(item.id);
                    },
                },
                    h('span', { className: 'planning-subnav__icon', 'aria-hidden': 'true' }, item.icon),
                    h('span', {
                        className: 'planning-subnav__label',
                        'data-short-label': item.shortLabel || item.label,
                        'aria-hidden': 'true',
                    }, item.label),
                )),
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
                CurrentScreen ? h(CurrentScreen, { state: planState }) : h(PlanningFallback),
            ),
            h('div', { className: 'planning-subnav-shell', 'aria-hidden': 'true' }),
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
    Planning.materializeSeaTentItems = materializeSeaTentItems;
    Planning.materializePresetItems = materializeSeaTentItems;
    Planning.getChecklistPreset = getChecklistPreset;
    Planning.getPresetChecklistParams = getPresetChecklistParams;
    Planning.CHECKLIST_PRESETS = CHECKLIST_PRESETS.slice();
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
