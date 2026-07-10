// heys_planning_goal_map_v1.js — immersive goal map editor for HEYS planning
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const GoalMap = HEYS.PlanningGoalMap = HEYS.PlanningGoalMap || {};

    const NODE_META = {
        goal: { label: 'Цель', entityType: 'goal' },
        result: { label: 'Результат', entityType: 'keyResult' },
        task: { label: 'Задача', entityType: 'task' },
        milestone: { label: 'Контрольная точка', entityType: 'task' },
        decision: { label: 'Решение', entityType: 'map' },
        obstacle: { label: 'Препятствие', entityType: 'map' },
        note: { label: 'Заметка', entityType: 'map' },
        date: { label: 'Дата', entityType: 'date' },
    };
    const RELATION_META = {
        precedes: 'предшествует',
        contributes: 'ведёт к результату',
        blocks: 'мешает',
        option: 'вариант',
        related: 'связано',
        hierarchy: 'часть цели',
    };
    const PALETTE_KINDS = ['task', 'result', 'milestone', 'decision', 'obstacle', 'note', 'date'];
    const DRAG_THRESHOLD = 6;
    const MIN_SCALE = 0.35;
    const MAX_SCALE = 2;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value) || 0));
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function nodeIdFor(entityType, entityId) {
        return `${entityType}:${String(entityId || '')}`;
    }

    function getNodeSize(kind) {
        if (kind === 'goal') return { width: 240, height: 136 };
        if (kind === 'milestone') return { width: 132, height: 132 };
        if (kind === 'decision') return { width: 176, height: 142 };
        if (kind === 'obstacle') return { width: 194, height: 126 };
        if (kind === 'result') return { width: 210, height: 116 };
        return { width: 194, height: 112 };
    }

    function radialPositions(groupSizes) {
        const output = { goal: { x: 0, y: 0 }, results: [], tasks: [], obstacles: [], custom: [] };
        const resultCount = Math.max(0, Number(groupSizes?.results) || 0);
        const taskCount = Math.max(0, Number(groupSizes?.tasks) || 0);
        const obstacleCount = Math.max(0, Number(groupSizes?.obstacles) || 0);
        const customCount = Math.max(0, Number(groupSizes?.custom) || 0);
        for (let index = 0; index < resultCount; index += 1) {
            output.results.push({ x: (index - (resultCount - 1) / 2) * 250, y: -260 });
        }
        for (let index = 0; index < taskCount; index += 1) {
            const column = Math.floor(index / 5);
            const row = index % 5;
            output.tasks.push({ x: 360 + column * 230, y: (row - Math.min(taskCount, 5) / 2) * 148 + 74 });
        }
        for (let index = 0; index < obstacleCount; index += 1) {
            output.obstacles.push({ x: -350 - Math.floor(index / 4) * 220, y: (index % 4 - 1.5) * 154 });
        }
        for (let index = 0; index < customCount; index += 1) {
            const angle = Math.PI / 2 + (Math.PI * 2 * index / Math.max(customCount, 1));
            output.custom.push({ x: Math.cos(angle) * 520, y: Math.sin(angle) * 360 });
        }
        return output;
    }

    function deterministicRadialLayout(goal, tasks, records) {
        const keyResults = Array.isArray(goal?.keyResults) ? goal.keyResults : [];
        const mapNodes = (Array.isArray(records) ? records : []).filter((record) => record?.recordType === 'node' && record.entityType === 'map');
        const obstacleCount = (goal?.obstacle ? 1 : 0) + mapNodes.filter((record) => record.nodeKind === 'obstacle').length;
        const customCount = mapNodes.filter((record) => record.nodeKind !== 'obstacle').length;
        const positions = radialPositions({ results: keyResults.length, tasks: tasks.length, obstacles: obstacleCount, custom: customCount });
        const layout = new Map([[nodeIdFor('goal', goal?.id), positions.goal]]);
        keyResults.forEach((result, index) => layout.set(nodeIdFor('keyResult', result.id), positions.results[index]));
        tasks.forEach((task, index) => layout.set(nodeIdFor('task', task.id), positions.tasks[index]));
        let obstacleIndex = 0;
        if (goal?.obstacle) {
            layout.set(nodeIdFor('goalObstacle', goal.id), positions.obstacles[obstacleIndex]);
            obstacleIndex += 1;
        }
        let customIndex = 0;
        mapNodes.forEach((record) => {
            if (record.nodeKind === 'obstacle') {
                layout.set(record.id, positions.obstacles[obstacleIndex]);
                obstacleIndex += 1;
            } else {
                layout.set(record.id, positions.custom[customIndex]);
                customIndex += 1;
            }
        });
        return layout;
    }

    function getTaskGraph(tasks) {
        const graph = new Map();
        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
            const taskId = String(task?.id || '');
            if (!taskId) return;
            if (!graph.has(taskId)) graph.set(taskId, new Set());
            (Array.isArray(task.blockedByTaskIds) ? task.blockedByTaskIds : []).forEach((blockerId) => {
                const blocker = String(blockerId || '');
                if (!blocker) return;
                if (!graph.has(blocker)) graph.set(blocker, new Set());
                graph.get(blocker).add(taskId);
            });
        });
        return graph;
    }

    function wouldCreateTaskCycle(tasks, fromTaskId, toTaskId) {
        const from = String(fromTaskId || '');
        const to = String(toTaskId || '');
        if (!from || !to || from === to) return true;
        const graph = getTaskGraph(tasks);
        const queue = [to];
        const visited = new Set();
        while (queue.length) {
            const current = queue.shift();
            if (current === from) return true;
            if (visited.has(current)) continue;
            visited.add(current);
            (graph.get(current) || []).forEach((next) => queue.push(next));
        }
        return false;
    }

    function defaultRelation(fromKind, toKind) {
        if ((fromKind === 'task' || fromKind === 'milestone') && (toKind === 'task' || toKind === 'milestone')) return 'precedes';
        if ((fromKind === 'task' || fromKind === 'milestone') && toKind === 'result') return 'contributes';
        if (fromKind === 'obstacle' && ['task', 'milestone', 'result'].includes(toKind)) return 'blocks';
        if (fromKind === 'decision') return 'option';
        return 'related';
    }

    function validateConnection(fromNode, toNode, edges, tasks) {
        if (!fromNode || !toNode) return { ok: false, reason: 'Выберите два элемента.' };
        if (fromNode.id === toNode.id) return { ok: false, reason: 'Элемент нельзя связать с самим собой.' };
        const duplicate = (Array.isArray(edges) ? edges : []).some((edge) => edge.fromNodeId === fromNode.id && edge.toNodeId === toNode.id);
        if (duplicate) return { ok: false, reason: 'Такая связь уже есть.' };
        const taskKinds = new Set(['task', 'milestone']);
        if (taskKinds.has(fromNode.kind) && taskKinds.has(toNode.kind)
            && wouldCreateTaskCycle(tasks, fromNode.entityId, toNode.entityId)) {
            return { ok: false, reason: 'Эта зависимость создаст цикл.' };
        }
        return { ok: true, relation: defaultRelation(fromNode.kind, toNode.kind) };
    }

    function lineToRectBoundary(center, target, size) {
        const dx = target.x - center.x;
        const dy = target.y - center.y;
        if (!dx && !dy) return { ...center };
        const scale = Math.min((size.width / 2) / Math.max(Math.abs(dx), 0.001), (size.height / 2) / Math.max(Math.abs(dy), 0.001));
        return { x: center.x + dx * scale, y: center.y + dy * scale };
    }

    function calculateEdgeEndpoints(fromNode, toNode) {
        const from = { x: Number(fromNode?.x) || 0, y: Number(fromNode?.y) || 0 };
        const to = { x: Number(toNode?.x) || 0, y: Number(toNode?.y) || 0 };
        return {
            from: lineToRectBoundary(from, to, getNodeSize(fromNode?.kind)),
            to: lineToRectBoundary(to, from, getNodeSize(toNode?.kind)),
        };
    }

    function buildGoalMapModel(input) {
        const goal = input?.goal || {};
        const allTasks = Array.isArray(input?.tasks) ? input.tasks : [];
        const records = Array.isArray(input?.records) ? input.records : [];
        const goalTasks = allTasks.filter((task) => String(task?.projectId || '') === String(goal.projectId || '')
            || String(task?.id || '') === String(goal.nextTaskId || ''));
        const layout = deterministicRadialLayout(goal, goalTasks, records);
        const positionRecords = new Map(records
            .filter((record) => record?.recordType === 'node')
            .map((record) => [record.id, record]));
        const nodes = [];
        const addNode = (node) => {
            const persisted = positionRecords.get(node.id);
            const fallback = layout.get(node.id) || { x: 0, y: 0 };
            nodes.push({ ...node, x: persisted?.x ?? fallback.x, y: persisted?.y ?? fallback.y, persisted: !!persisted });
        };
        addNode({
            id: nodeIdFor('goal', goal.id), kind: 'goal', entityType: 'goal', entityId: goal.id,
            title: goal.title || 'Цель', status: goal.status, dueDate: goal.dueDate,
        });
        (Array.isArray(goal.keyResults) ? goal.keyResults : []).forEach((result) => addNode({
            id: nodeIdFor('keyResult', result.id), kind: 'result', entityType: 'keyResult', entityId: result.id,
            title: result.text || 'Результат', status: result.done ? 'done' : 'active',
        }));
        goalTasks.forEach((task) => addNode({
            id: nodeIdFor('task', task.id), kind: task.isMilestone ? 'milestone' : 'task', entityType: 'task', entityId: task.id,
            title: task.title || 'Задача', status: task.status, dueDate: task.dueDate,
            blocked: Array.isArray(task.blockedByTaskIds) && task.blockedByTaskIds.length > 0,
        }));
        if (goal.obstacle) addNode({
            id: nodeIdFor('goalObstacle', goal.id), kind: 'obstacle', entityType: 'goalObstacle', entityId: goal.id,
            title: goal.obstacle, status: 'active',
        });
        records.filter((record) => record?.recordType === 'node' && record.entityType === 'map').forEach((record) => addNode({
            id: record.id, kind: record.nodeKind, entityType: 'map', entityId: record.id,
            title: record.title || NODE_META[record.nodeKind]?.label || 'Элемент', status: record.status || 'active', response: record.response,
        }));

        const nodeIds = new Set(nodes.map((node) => node.id));
        const edges = [];
        const rootId = nodeIdFor('goal', goal.id);
        (Array.isArray(goal.keyResults) ? goal.keyResults : []).forEach((result) => edges.push({
            id: `derived:goal-result:${result.id}`, fromNodeId: rootId, toNodeId: nodeIdFor('keyResult', result.id), relation: 'hierarchy', derived: true,
        }));
        goalTasks.forEach((task) => {
            const parentId = task.parentTaskId && nodeIds.has(nodeIdFor('task', task.parentTaskId))
                ? nodeIdFor('task', task.parentTaskId)
                : rootId;
            edges.push({ id: `derived:hierarchy:${task.id}`, fromNodeId: parentId, toNodeId: nodeIdFor('task', task.id), relation: 'hierarchy', derived: true });
            (Array.isArray(task.blockedByTaskIds) ? task.blockedByTaskIds : []).forEach((blockerId) => {
                if (!nodeIds.has(nodeIdFor('task', blockerId))) return;
                edges.push({
                    id: `derived:dependency:${blockerId}:${task.id}`,
                    fromNodeId: nodeIdFor('task', blockerId), toNodeId: nodeIdFor('task', task.id),
                    relation: 'precedes', derived: true, dependency: true,
                });
            });
        });
        records.filter((record) => record?.recordType === 'edge')
            .filter((record) => nodeIds.has(record.fromNodeId) && nodeIds.has(record.toNodeId))
            .forEach((record) => edges.push({ ...record, derived: false }));
        return { nodes, edges, goalTasks };
    }

    function MapIcon({ kind } = {}) {
        const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
        let children;
        if (kind === 'task') children = [h('rect', { key: 'a', x: 4, y: 5, width: 16, height: 14, rx: 2, ...common }), h('path', { key: 'b', d: 'm8 12 2.2 2.2L16 9', ...common })];
        else if (kind === 'result') children = [h('path', { key: 'a', d: 'M7 5h14l-4 14H3L7 5Z', ...common }), h('path', { key: 'b', d: 'm8 12 2 2 5-5', ...common })];
        else if (kind === 'milestone') children = [h('circle', { key: 'a', cx: 12, cy: 12, r: 8, ...common }), h('path', { key: 'b', d: 'm8 12 2.5 2.5L16 9', ...common })];
        else if (kind === 'decision') children = [h('path', { key: 'a', d: 'm12 3 9 9-9 9-9-9 9-9Z', ...common }), h('path', { key: 'b', d: 'M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3.9-1.3 1.9M12 17h.01', ...common })];
        else if (kind === 'obstacle') children = [h('path', { key: 'a', d: 'M7 4h10l5 8-5 8H7l-5-8 5-8Z', ...common }), h('path', { key: 'b', d: 'M12 8v5M12 16h.01', ...common })];
        else if (kind === 'note') children = [h('path', { key: 'a', d: 'M5 3h10l4 4v14H5V3Z M15 3v5h4', ...common }), h('path', { key: 'b', d: 'M8 12h8M8 16h6', ...common })];
        else if (kind === 'date') children = [h('rect', { key: 'a', x: 3, y: 5, width: 18, height: 16, rx: 2, ...common }), h('path', { key: 'b', d: 'M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01', ...common })];
        else children = [h('circle', { key: 'a', cx: 12, cy: 12, r: 9, ...common }), h('path', { key: 'b', d: 'M8 12h8M12 8v8', ...common })];
        return h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, children);
    }

    function GoalMapScreen(props = {}) {
        const { goal, state, readModel } = props;
        const rootRef = useRef(null);
        const canvasRef = useRef(null);
        const interactionRef = useRef(null);
        const frameRef = useRef(0);
        const pointerRef = useRef(new Map());
        const undoRef = useRef([]);
        const [viewport, setViewport] = useState({ x: Math.round((window.innerWidth || 390) / 2), y: Math.round((window.innerHeight || 844) / 2), scale: 0.78 });
        const [dragPositions, setDragPositions] = useState({});
        const [selectedId, setSelectedId] = useState(null);
        const [selectedEdgeId, setSelectedEdgeId] = useState(null);
        const [mode, setMode] = useState('map');
        const [showCompleted, setShowCompleted] = useState(false);
        const [search, setSearch] = useState('');
        const [quickCreate, setQuickCreate] = useState(null);
        const [quickTitle, setQuickTitle] = useState('');
        const [connectionDraft, setConnectionDraft] = useState(null);
        const [pendingConnection, setPendingConnection] = useState(null);
        const [relationDraft, setRelationDraft] = useState('related');
        const [relationLabel, setRelationLabel] = useState('');
        const [notice, setNotice] = useState(null);
        const [confirmDelete, setConfirmDelete] = useState(null);
        const [panel, setPanel] = useState(null);
        const [formDraft, setFormDraft] = useState({});
        const [online, setOnline] = useState(() => navigator.onLine !== false);

        const records = useMemo(() => (Array.isArray(state?.goalMapRecords) ? state.goalMapRecords : [])
            .filter((record) => record?.goalId === goal?.id), [goal?.id, state?.goalMapRecords]);
        const model = useMemo(() => buildGoalMapModel({ goal, tasks: state?.tasks, records }), [goal, records, state?.tasks]);
        const visibleNodes = useMemo(() => model.nodes.filter((node) => {
            if (!showCompleted && (node.status === 'done' || node.status === 'cancelled')) return false;
            return !search || String(node.title || '').toLowerCase().includes(search.toLowerCase());
        }).map((node) => dragPositions[node.id] ? { ...node, ...dragPositions[node.id] } : node), [model.nodes, showCompleted, search, dragPositions]);
        const visibleNodeMap = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node])), [visibleNodes]);
        const visibleEdges = useMemo(() => model.edges.filter((edge) => visibleNodeMap.has(edge.fromNodeId) && visibleNodeMap.has(edge.toNodeId)), [model.edges, visibleNodeMap]);
        const selectedNode = visibleNodeMap.get(selectedId) || model.nodes.find((node) => node.id === selectedId) || null;
        const selectedEdge = model.edges.find((edge) => edge.id === selectedEdgeId) || null;
        const readOnly = goal?.status === 'done' || goal?.status === 'archived';
        const syncStatus = (() => {
            if (!online) return 'Без сети — изменения сохраняются на устройстве';
            try {
                const status = HEYS.cloud?.getSyncStatus?.('heys_planning_goal_map_records_v1');
                if (status === 'pending') return 'Сохраняем изменения…';
            } catch (_) { /* noop */ }
            return 'Изменения сохранены';
        })();

        const announce = useCallback((message, undo) => {
            if (undo) undoRef.current.push(undo);
            setNotice({ message, undo: !!undo });
        }, []);

        const persistNodePosition = useCallback((node, position) => {
            if (!node || readOnly || typeof state?.upsertGoalMapRecord !== 'function') return null;
            return state.upsertGoalMapRecord({
                id: node.id,
                schemaVersion: 1,
                recordType: 'node',
                goalId: goal.id,
                nodeKind: node.kind,
                entityType: node.entityType,
                entityId: node.entityId,
                title: node.entityType === 'map' ? node.title : undefined,
                response: node.entityType === 'map' ? node.response : undefined,
                status: node.entityType === 'map' ? node.status : undefined,
                x: position.x,
                y: position.y,
                createdAt: node.createdAt,
            });
        }, [goal?.id, readOnly, state]);

        const screenToWorld = useCallback((clientX, clientY) => {
            const rect = canvasRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 };
            return {
                x: (clientX - rect.left - viewport.x) / viewport.scale,
                y: (clientY - rect.top - viewport.y) / viewport.scale,
            };
        }, [viewport]);

        const fitAll = useCallback(() => {
            const nodes = visibleNodes.length ? visibleNodes : model.nodes;
            if (!nodes.length || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const xs = nodes.map((node) => node.x);
            const ys = nodes.map((node) => node.y);
            const minX = Math.min(...xs) - 180;
            const maxX = Math.max(...xs) + 180;
            const minY = Math.min(...ys) - 150;
            const maxY = Math.max(...ys) + 150;
            const scale = clamp(Math.min(rect.width / Math.max(1, maxX - minX), rect.height / Math.max(1, maxY - minY)) * 0.9, MIN_SCALE, 1.2);
            setViewport({ x: rect.width / 2 - ((minX + maxX) / 2) * scale, y: rect.height / 2 - ((minY + maxY) / 2) * scale, scale });
        }, [model.nodes, visibleNodes]);

        const autoArrange = useCallback(() => {
            if (readOnly) return;
            const before = model.nodes.map((node) => ({ node, position: { x: node.x, y: node.y } }));
            const layout = deterministicRadialLayout(goal, model.goalTasks, records);
            const nextRecords = model.nodes.map((node) => {
                const position = layout.get(node.id) || { x: node.x, y: node.y };
                return {
                    id: node.id, schemaVersion: 1, recordType: 'node', goalId: goal.id,
                    nodeKind: node.kind, entityType: node.entityType, entityId: node.entityId,
                    title: node.entityType === 'map' ? node.title : undefined,
                    response: node.entityType === 'map' ? node.response : undefined,
                    status: node.entityType === 'map' ? node.status : undefined,
                    x: position.x, y: position.y, createdAt: node.createdAt,
                };
            });
            state.saveGoalMapRecords?.(nextRecords, { reason: 'goal-map-auto-arrange' });
            announce('Карта упорядочена', () => before.forEach((entry) => persistNodePosition(entry.node, entry.position)));
            window.requestAnimationFrame(fitAll);
        }, [announce, fitAll, goal, model.goalTasks, model.nodes, persistNodePosition, readOnly, records, state]);

        const ensureProject = useCallback(() => {
            if (goal?.projectId) return goal.projectId;
            const project = state?.addProject?.(goal?.title || 'Цель');
            if (project?.id) state?.updateGoal?.(goal.id, { projectId: project.id });
            return project?.id;
        }, [goal, state]);

        const openCreate = useCallback((kind, position) => {
            if (readOnly) return;
            if (kind === 'date') {
                const target = selectedNode && ['goal', 'task', 'milestone'].includes(selectedNode.kind)
                    ? selectedNode : model.nodes.find((node) => node.kind === 'goal');
                setSelectedId(target?.id || null);
                const task = target?.entityType === 'task' ? model.goalTasks.find((item) => item.id === target.entityId) : null;
                setFormDraft({
                    nodeId: target?.id,
                    date: target?.entityType === 'goal' ? goal?.dueDate || '' : task?.dueDate || '',
                    startTime: '09:00',
                    plannedMinutes: task?.plannedMinutes || 30,
                });
                setPanel('date');
                return;
            }
            setQuickTitle('');
            setQuickCreate({ kind, position: position || screenToWorld((window.innerWidth || 390) / 2, (window.innerHeight || 844) / 2) });
        }, [model.nodes, readOnly, screenToWorld, selectedNode]);

        const submitCreate = useCallback(() => {
            const title = String(quickTitle || '').trim();
            if (!title || !quickCreate) return;
            const { kind, position } = quickCreate;
            if (kind === 'task' || kind === 'milestone') {
                const task = state?.addTask?.(title, { projectId: ensureProject(), status: 'in_progress', priority: 'p2', isMilestone: kind === 'milestone' });
                if (task?.id) {
                    const node = { id: nodeIdFor('task', task.id), kind, entityType: 'task', entityId: task.id, title };
                    persistNodePosition(node, position);
                    setSelectedId(node.id);
                }
            } else if (kind === 'result') {
                const before = new Set((goal.keyResults || []).map((item) => item.id));
                const updated = state?.updateGoal?.(goal.id, { keyResults: (goal.keyResults || []).concat({ text: title }) });
                const result = (updated?.keyResults || []).find((item) => !before.has(item.id));
                if (result?.id) persistNodePosition({ id: nodeIdFor('keyResult', result.id), kind, entityType: 'keyResult', entityId: result.id, title }, position);
            } else {
                const id = `map:${uid()}`;
                state?.upsertGoalMapRecord?.({
                    id, schemaVersion: 1, recordType: 'node', goalId: goal.id, nodeKind: kind,
                    entityType: 'map', title, status: 'active', x: position.x, y: position.y,
                });
                setSelectedId(id);
            }
            setQuickCreate(null);
            setQuickTitle('');
        }, [ensureProject, goal, persistNodePosition, quickCreate, quickTitle, state]);

        const beginPaletteDrag = useCallback((event, kind) => {
            if (readOnly) return;
            const startX = event.clientX;
            const startY = event.clientY;
            let moved = false;
            const move = (moveEvent) => {
                if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= DRAG_THRESHOLD) moved = true;
            };
            const end = (upEvent) => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', end);
                if (moved) openCreate(kind, screenToWorld(upEvent.clientX, upEvent.clientY));
                else openCreate(kind);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end, { once: true });
        }, [openCreate, readOnly, screenToWorld]);

        const beginNodeDrag = useCallback((event, node) => {
            if (readOnly || event.button !== 0) return;
            event.stopPropagation();
            const startWorld = screenToWorld(event.clientX, event.clientY);
            interactionRef.current = { type: 'node', node, startWorld, origin: { x: node.x, y: node.y }, moved: false, last: { x: node.x, y: node.y } };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setSelectedId(node.id);
            setSelectedEdgeId(null);
        }, [readOnly, screenToWorld]);

        const beginConnection = useCallback((event, node) => {
            if (readOnly) return;
            event.stopPropagation();
            const world = screenToWorld(event.clientX, event.clientY);
            setConnectionDraft({ fromNodeId: node.id, x: world.x, y: world.y });
            interactionRef.current = { type: 'connection', fromNode: node };
        }, [readOnly, screenToWorld]);

        const onCanvasPointerDown = useCallback((event) => {
            pointerRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (event.target.closest?.('[data-goal-map-node],button,input,select,textarea')) return;
            if (pointerRef.current.size === 2) {
                const points = Array.from(pointerRef.current.values());
                const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
                const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
                const rect = canvasRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 };
                interactionRef.current = {
                    type: 'pinch',
                    startDistance: Math.max(distance, 1),
                    startScale: viewport.scale,
                    world: { x: (center.x - rect.left - viewport.x) / viewport.scale, y: (center.y - rect.top - viewport.y) / viewport.scale },
                    rect,
                };
                return;
            }
            setSelectedId(null);
            setSelectedEdgeId(null);
            interactionRef.current = { type: 'pan', start: { x: event.clientX, y: event.clientY }, origin: viewport, moved: false };
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }, [viewport]);

        const onCanvasPointerMove = useCallback((event) => {
            pointerRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const interaction = interactionRef.current;
            if (!interaction) return;
            if (interaction.type === 'pinch' && pointerRef.current.size >= 2) {
                const points = Array.from(pointerRef.current.values()).slice(0, 2);
                const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
                const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
                const scale = clamp(interaction.startScale * distance / interaction.startDistance, MIN_SCALE, MAX_SCALE);
                setViewport({
                    x: center.x - interaction.rect.left - interaction.world.x * scale,
                    y: center.y - interaction.rect.top - interaction.world.y * scale,
                    scale,
                });
            } else if (interaction.type === 'node') {
                const world = screenToWorld(event.clientX, event.clientY);
                const dx = world.x - interaction.startWorld.x;
                const dy = world.y - interaction.startWorld.y;
                if (!interaction.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD / viewport.scale) return;
                interaction.moved = true;
                interaction.last = { x: interaction.origin.x + dx, y: interaction.origin.y + dy };
                cancelAnimationFrame(frameRef.current);
                frameRef.current = requestAnimationFrame(() => setDragPositions((current) => ({ ...current, [interaction.node.id]: interaction.last })));
            } else if (interaction.type === 'pan') {
                const dx = event.clientX - interaction.start.x;
                const dy = event.clientY - interaction.start.y;
                if (!interaction.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                interaction.moved = true;
                setViewport({ ...interaction.origin, x: interaction.origin.x + dx, y: interaction.origin.y + dy });
            } else if (interaction.type === 'connection') {
                const world = screenToWorld(event.clientX, event.clientY);
                setConnectionDraft((current) => current ? { ...current, x: world.x, y: world.y } : current);
            }
        }, [screenToWorld, viewport.scale]);

        const finishConnection = useCallback((event, interaction) => {
            const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-node-id]');
            const target = model.nodes.find((node) => node.id === targetElement?.dataset?.nodeId);
            const validation = validateConnection(interaction.fromNode, target, model.edges, model.goalTasks);
            setConnectionDraft(null);
            if (!validation.ok) {
                if (target) announce(validation.reason);
                return;
            }
            setRelationDraft(validation.relation);
            setRelationLabel('');
            setPendingConnection({ fromNode: interaction.fromNode, toNode: target });
        }, [announce, model.edges, model.goalTasks, model.nodes]);

        const onCanvasPointerUp = useCallback((event) => {
            pointerRef.current.delete(event.pointerId);
            const interaction = interactionRef.current;
            interactionRef.current = null;
            if (!interaction) return;
            if (interaction.type === 'node' && interaction.moved) {
                const before = interaction.origin;
                const after = interaction.last;
                persistNodePosition(interaction.node, after);
                setDragPositions((current) => {
                    const next = { ...current };
                    delete next[interaction.node.id];
                    return next;
                });
                announce('Положение сохранено', () => persistNodePosition(interaction.node, before));
            } else if (interaction.type === 'connection') {
                finishConnection(event, interaction);
            }
        }, [announce, finishConnection, persistNodePosition]);

        const applyConnection = useCallback(() => {
            if (!pendingConnection || (relationDraft === 'option' && !String(relationLabel || '').trim())) return;
            const { fromNode, toNode } = pendingConnection;
            const isTaskDependency = relationDraft === 'precedes'
                && ['task', 'milestone'].includes(fromNode.kind) && ['task', 'milestone'].includes(toNode.kind);
            if (isTaskDependency) {
                const targetTask = model.goalTasks.find((task) => task.id === toNode.entityId);
                const previous = Array.isArray(targetTask?.blockedByTaskIds) ? targetTask.blockedByTaskIds.slice() : [];
                state?.updateTask?.(toNode.entityId, { blockedByTaskIds: Array.from(new Set(previous.concat(fromNode.entityId))) });
                announce('Зависимость добавлена', () => state?.updateTask?.(toNode.entityId, { blockedByTaskIds: previous }));
            } else {
                const id = `edge:${uid()}`;
                state?.upsertGoalMapRecord?.({
                    id, schemaVersion: 1, recordType: 'edge', goalId: goal.id,
                    fromNodeId: fromNode.id, toNodeId: toNode.id, relation: relationDraft,
                    label: String(relationLabel || '').trim() || undefined,
                });
                announce('Связь добавлена', () => state?.deleteGoalMapRecord?.(id, goal.id));
            }
            setPendingConnection(null);
            setRelationLabel('');
        }, [announce, goal?.id, model.goalTasks, pendingConnection, relationDraft, relationLabel, state]);

        const updateSelectedNode = useCallback((patch) => {
            const node = selectedNode;
            if (!node || readOnly) return;
            if (node.entityType === 'goal') state?.updateGoal?.(goal.id, patch);
            else if (node.entityType === 'task') state?.updateTask?.(node.entityId, patch);
            else if (node.entityType === 'keyResult') {
                state?.updateGoal?.(goal.id, { keyResults: (goal.keyResults || []).map((item) => item.id === node.entityId ? { ...item, ...patch } : item) });
            } else if (node.entityType === 'goalObstacle') state?.updateGoal?.(goal.id, { obstacle: patch.title || '' });
            else if (node.entityType === 'map') state?.upsertGoalMapRecord?.({
                id: node.id, schemaVersion: 1, recordType: 'node', goalId: goal.id, nodeKind: node.kind,
                entityType: 'map', title: patch.title ?? node.title, response: patch.response ?? node.response,
                status: patch.status ?? node.status, x: node.x, y: node.y, createdAt: node.createdAt,
            });
        }, [goal, readOnly, selectedNode, state]);

        const removeSelectedFromGoal = useCallback(() => {
            if (selectedNode?.entityType !== 'task') return;
            const task = model.goalTasks.find((item) => item.id === selectedNode.entityId);
            if (!task) return;
            state?.updateTask?.(task.id, { projectId: undefined, parentTaskId: undefined });
            announce('Задача убрана из цели', () => state?.updateTask?.(task.id, { projectId: task.projectId, parentTaskId: task.parentTaskId }));
            setSelectedId(null);
        }, [announce, model.goalTasks, selectedNode, state]);

        const deleteSelectedNode = useCallback(() => {
            const node = selectedNode;
            if (!node || node.kind === 'goal') return;
            const connectedMapEdges = records.filter((record) => record.recordType === 'edge'
                && (record.fromNodeId === node.id || record.toNodeId === node.id));
            connectedMapEdges.forEach((edge) => state?.deleteGoalMapRecord?.(edge.id, goal.id));
            const restoreMapEdges = () => connectedMapEdges.forEach((edge) => state?.upsertGoalMapRecord?.(edge));
            if (node.entityType === 'task') {
                const task = model.goalTasks.find((item) => item.id === node.entityId);
                const slots = (state.slots || []).filter((slot) => slot.taskId === node.entityId);
                const links = (state.links || []).filter((link) => link.fromId === node.entityId || link.toId === node.entityId);
                state?.deleteTask?.(node.entityId);
                announce('Задача удалена', () => {
                    state?.restorePlanningEntity?.('task', task);
                    slots.forEach((slot) => state?.restorePlanningEntity?.('slot', slot));
                    links.forEach((link) => state?.restorePlanningEntity?.('link', link));
                    restoreMapEdges();
                });
            } else if (node.entityType === 'keyResult') {
                const previous = goal.keyResults || [];
                state?.updateGoal?.(goal.id, { keyResults: previous.filter((item) => item.id !== node.entityId) });
                announce('Результат удалён', () => { state?.updateGoal?.(goal.id, { keyResults: previous }); restoreMapEdges(); });
            } else if (node.entityType === 'goalObstacle') {
                const previous = goal.obstacle;
                state?.updateGoal?.(goal.id, { obstacle: '' });
                announce('Препятствие удалено', () => { state?.updateGoal?.(goal.id, { obstacle: previous }); restoreMapEdges(); });
            } else if (node.entityType === 'map') {
                const previous = records.find((record) => record.id === node.id);
                state?.deleteGoalMapRecord?.(node.id, goal.id);
                announce('Элемент удалён', () => { state?.upsertGoalMapRecord?.(previous); restoreMapEdges(); });
            }
            setSelectedId(null);
            setConfirmDelete(null);
        }, [announce, goal, model.goalTasks, records, selectedNode, state]);

        const deleteSelectedEdge = useCallback(() => {
            const edge = selectedEdge;
            if (!edge || edge.relation === 'hierarchy') return;
            if (edge.dependency) {
                const fromTaskId = edge.fromNodeId.replace(/^task:/, '');
                const toTaskId = edge.toNodeId.replace(/^task:/, '');
                const target = model.goalTasks.find((task) => task.id === toTaskId);
                const previous = target?.blockedByTaskIds || [];
                state?.updateTask?.(toTaskId, { blockedByTaskIds: previous.filter((id) => id !== fromTaskId) });
                announce('Зависимость удалена', () => state?.updateTask?.(toTaskId, { blockedByTaskIds: previous }));
            } else {
                state?.deleteGoalMapRecord?.(edge.id, goal.id);
                announce('Связь удалена', () => state?.upsertGoalMapRecord?.(edge));
            }
            setSelectedEdgeId(null);
        }, [announce, goal?.id, model.goalTasks, selectedEdge, state]);

        const reverseSelectedEdge = useCallback(() => {
            const edge = selectedEdge;
            if (!edge || edge.relation === 'hierarchy') return;
            if (edge.dependency) {
                const fromId = edge.fromNodeId.replace(/^task:/, '');
                const toId = edge.toNodeId.replace(/^task:/, '');
                if (wouldCreateTaskCycle(model.goalTasks, toId, fromId)) {
                    announce('Разворот создаст цикл.');
                    return;
                }
                const fromTask = model.goalTasks.find((task) => task.id === fromId);
                const toTask = model.goalTasks.find((task) => task.id === toId);
                state?.updateTask?.(toId, { blockedByTaskIds: (toTask?.blockedByTaskIds || []).filter((id) => id !== fromId) });
                state?.updateTask?.(fromId, { blockedByTaskIds: Array.from(new Set((fromTask?.blockedByTaskIds || []).concat(toId))) });
            } else {
                state?.upsertGoalMapRecord?.({ ...edge, fromNodeId: edge.toNodeId, toNodeId: edge.fromNodeId });
            }
            announce('Связь развёрнута');
        }, [announce, model.goalTasks, selectedEdge, state]);

        const undo = useCallback(() => {
            const action = undoRef.current.pop();
            if (typeof action === 'function') action();
            setNotice(action ? { message: 'Изменение отменено', undo: undoRef.current.length > 0 } : null);
        }, []);

        const closeMap = useCallback(() => {
            if (history.state?.heysGoalMap === goal?.id) history.back();
            else props.onBack?.();
        }, [goal?.id, props]);

        useEffect(() => {
            document.body?.classList.add('planning-goal-map-open');
            const marker = { ...(history.state || {}), heysGoalMap: goal?.id };
            history.pushState(marker, '');
            const onPop = () => props.onBack?.();
            const onOnline = () => setOnline(true);
            const onOffline = () => setOnline(false);
            window.addEventListener('popstate', onPop);
            window.addEventListener('online', onOnline);
            window.addEventListener('offline', onOffline);
            return () => {
                document.body?.classList.remove('planning-goal-map-open');
                window.removeEventListener('popstate', onPop);
                window.removeEventListener('online', onOnline);
                window.removeEventListener('offline', onOffline);
            };
        }, [goal?.id, props.onBack]);

        useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

        const onNodeKeyDown = (event, node) => {
            if (readOnly) return;
            const delta = event.shiftKey ? 48 : 16;
            const movement = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }[event.key];
            if (!movement) return;
            event.preventDefault();
            persistNodePosition(node, { x: node.x + movement[0], y: node.y + movement[1] });
        };

        const renderEdge = (edge) => {
            const fromNode = visibleNodeMap.get(edge.fromNodeId);
            const toNode = visibleNodeMap.get(edge.toNodeId);
            if (!fromNode || !toNode) return null;
            const points = calculateEdgeEndpoints(fromNode, toNode);
            const label = edge.label || RELATION_META[edge.relation] || 'связано';
            const middle = { x: (points.from.x + points.to.x) / 2, y: (points.from.y + points.to.y) / 2 };
            return h('g', { key: edge.id, className: 'goal-map-edge' + (selectedEdgeId === edge.id ? ' is-selected' : '') },
                h('line', { className: 'goal-map-edge__line', x1: points.from.x, y1: points.from.y, x2: points.to.x, y2: points.to.y, markerEnd: 'url(#goal-map-arrow)' }),
                h('line', {
                    className: 'goal-map-edge__hit', x1: points.from.x, y1: points.from.y, x2: points.to.x, y2: points.to.y,
                    tabIndex: edge.relation === 'hierarchy' ? -1 : 0,
                    role: edge.relation === 'hierarchy' ? undefined : 'button',
                    'aria-label': `Связь: ${label}`,
                    onClick: (event) => {
                        event.stopPropagation();
                        if (edge.relation === 'hierarchy') return;
                        setSelectedEdgeId(edge.id);
                        setSelectedId(null);
                    },
                }),
                edge.relation !== 'hierarchy' && h('text', { className: 'goal-map-edge__label', x: middle.x, y: middle.y - 8, textAnchor: 'middle' }, label),
            );
        };

        const renderNode = (node) => {
            const size = getNodeSize(node.kind);
            const isDone = node.status === 'done' || node.status === 'cancelled';
            const isOverdue = node.dueDate && node.dueDate < new Date().toISOString().slice(0, 10) && !isDone;
            return h('div', {
                key: node.id,
                className: `goal-map-node goal-map-node--${node.kind}`
                    + (selectedId === node.id ? ' is-selected' : '')
                    + (isDone ? ' is-done' : '')
                    + (node.blocked ? ' is-blocked' : ''),
                style: { width: size.width, minHeight: size.height, transform: `translate(${node.x - size.width / 2}px, ${node.y - size.height / 2}px)` },
                'data-goal-map-node': 'true',
                'data-node-id': node.id,
                role: 'button',
                tabIndex: 0,
                'aria-label': `${NODE_META[node.kind]?.label || 'Элемент'}: ${node.title}`,
                onPointerDown: (event) => beginNodeDrag(event, node),
                onKeyDown: (event) => onNodeKeyDown(event, node),
                onClick: (event) => {
                    event.stopPropagation();
                    setSelectedId(node.id);
                    setSelectedEdgeId(null);
                },
            },
                h('span', { className: 'goal-map-node__type' }, h(MapIcon, { kind: node.kind }), NODE_META[node.kind]?.label),
                h('strong', { className: 'goal-map-node__title' }, node.title),
                h('span', { className: 'goal-map-node__badges' },
                    node.id === nodeIdFor('task', goal.nextTaskId) && h('span', { className: 'goal-map-badge' }, 'Текущий фокус'),
                    isOverdue && h('span', { className: 'goal-map-badge goal-map-badge--danger' }, 'Просрочено'),
                    node.blocked && h('span', { className: 'goal-map-badge goal-map-badge--warning' }, 'Заблокировано'),
                    isDone && h('span', { className: 'goal-map-badge goal-map-badge--done' }, 'Выполнено'),
                    node.dueDate && h('span', { className: 'goal-map-badge' }, new Date(node.dueDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })),
                ),
                !readOnly && h('button', {
                    type: 'button', className: 'goal-map-node__connector',
                    onPointerDown: (event) => beginConnection(event, node),
                    'aria-label': `Начать связь от элемента «${node.title}»`,
                }),
            );
        };

        const renderInspector = () => {
            if (!selectedNode && !selectedEdge && panel !== 'review') return null;
            if (panel === 'review') return h('aside', { className: 'goal-map-inspector', 'aria-label': 'Проверка результата' },
                h('div', { className: 'goal-map-inspector__head' }, h('strong', null, formDraft.complete ? 'Завершить цель' : 'Проверить результат'), h('button', { type: 'button', onClick: () => setPanel(null), 'aria-label': 'Закрыть панель' }, '×')),
                h('label', null, h('span', null, 'Текущий результат'), h('input', { value: formDraft.current || '', onChange: (event) => setFormDraft((value) => ({ ...value, current: event.target.value })) })),
                h('label', null, h('span', null, 'Что изменилось'), h('textarea', { value: formDraft.change || '', onChange: (event) => setFormDraft((value) => ({ ...value, change: event.target.value })) })),
                h('label', null, h('span', null, 'Следующий шаг'), h('input', { value: formDraft.nextStep || '', onChange: (event) => setFormDraft((value) => ({ ...value, nextStep: event.target.value })) })),
                h('button', { type: 'button', className: 'goal-map-button goal-map-button--primary', disabled: !String(formDraft.current || '').trim(), onClick: () => { props.onSaveReview?.(formDraft); setPanel(null); } }, formDraft.complete ? 'Завершить цель' : 'Сохранить проверку'),
            );
            if (selectedEdge) return h('aside', { className: 'goal-map-inspector', 'aria-label': 'Связь' },
                h('div', { className: 'goal-map-inspector__head' }, h('strong', null, 'Связь'), h('button', { type: 'button', onClick: () => setSelectedEdgeId(null), 'aria-label': 'Закрыть панель' }, '×')),
                selectedEdge.derived
                    ? h('p', null, RELATION_META[selectedEdge.relation] || 'связано')
                    : h(React.Fragment, null,
                        h('label', null, h('span', null, 'Тип связи'), h('select', {
                            value: selectedEdge.relation || 'related',
                            disabled: readOnly,
                            onChange: (event) => state?.upsertGoalMapRecord?.({ ...selectedEdge, relation: event.target.value }),
                        }, Object.entries(RELATION_META).filter(([key]) => key !== 'hierarchy').map(([key, label]) => h('option', { key, value: key }, label)))),
                        h('label', null, h('span', null, selectedEdge.relation === 'option' ? 'Подпись ветки' : 'Подпись'), h('input', {
                            defaultValue: selectedEdge.label || '',
                            readOnly,
                            required: selectedEdge.relation === 'option',
                            onBlur: (event) => {
                                const label = String(event.target.value || '').trim();
                                if (selectedEdge.relation === 'option' && !label) { announce('Для варианта нужна подпись ветки.'); return; }
                                state?.upsertGoalMapRecord?.({ ...selectedEdge, label: label || undefined });
                            },
                        })),
                    ),
                selectedEdge.relation !== 'hierarchy' && h('div', { className: 'goal-map-inspector__actions' },
                    h('button', { type: 'button', onClick: reverseSelectedEdge, disabled: readOnly }, 'Развернуть'),
                    h('button', { type: 'button', className: 'is-danger', onClick: deleteSelectedEdge, disabled: readOnly }, 'Удалить связь'),
                ),
            );
            const meta = NODE_META[selectedNode.kind] || NODE_META.note;
            const task = selectedNode.entityType === 'task' ? model.goalTasks.find((item) => item.id === selectedNode.entityId) : null;
            const dateValue = selectedNode.entityType === 'goal' ? goal.dueDate : task?.dueDate;
            return h('aside', { className: 'goal-map-inspector', 'aria-label': `Параметры: ${selectedNode.title}` },
                h('div', { className: 'goal-map-inspector__head' },
                    h('span', null, h(MapIcon, { kind: selectedNode.kind }), h('strong', null, meta.label)),
                    h('button', { type: 'button', onClick: () => { setSelectedId(null); setPanel(null); }, 'aria-label': 'Закрыть панель' }, '×'),
                ),
                h('label', null,
                    h('span', null, 'Название'),
                    h('textarea', {
                        value: formDraft.nodeId === selectedNode.id ? formDraft.title : selectedNode.title,
                        readOnly,
                        onFocus: () => setFormDraft({ nodeId: selectedNode.id, title: selectedNode.title }),
                        onChange: (event) => setFormDraft((value) => ({ ...value, nodeId: selectedNode.id, title: event.target.value })),
                        onBlur: (event) => updateSelectedNode(selectedNode.entityType === 'keyResult' ? { text: event.target.value } : { title: event.target.value }),
                    }),
                ),
                ['goal', 'task', 'milestone'].includes(selectedNode.kind) && h('label', null,
                    h('span', null, 'Срок'),
                    h('input', {
                        type: 'date',
                        value: panel === 'date' && formDraft.nodeId === selectedNode.id ? formDraft.date || '' : dateValue || '',
                        readOnly,
                        onChange: (event) => {
                            const date = event.target.value;
                            setFormDraft((value) => ({ ...value, nodeId: selectedNode.id, date }));
                            updateSelectedNode({ dueDate: date || undefined });
                        },
                    }),
                ),
                task && panel === 'date' && h('div', { className: 'goal-map-inspector__schedule' },
                    h('label', null, h('span', null, 'Время'), h('input', { type: 'time', value: formDraft.startTime || '09:00', onChange: (event) => setFormDraft((value) => ({ ...value, startTime: event.target.value })) })),
                    h('label', null, h('span', null, 'Минут'), h('input', { type: 'number', min: 5, step: 5, value: formDraft.plannedMinutes || 30, onChange: (event) => setFormDraft((value) => ({ ...value, plannedMinutes: Number(event.target.value) || 30 })) })),
                    h('button', {
                        type: 'button',
                        className: 'goal-map-button goal-map-button--primary',
                        disabled: !formDraft.date || !formDraft.startTime,
                        onClick: () => { props.onScheduleFocus?.(formDraft); setPanel(null); announce('Задача добавлена в календарь'); },
                    }, 'Поставить в календарь'),
                ),
                task && h('label', { className: 'goal-map-check' },
                    h('input', { type: 'checkbox', checked: task.isMilestone === true, disabled: readOnly, onChange: (event) => updateSelectedNode({ isMilestone: event.target.checked }) }),
                    h('span', null, 'Контрольная точка'),
                ),
                task && h('label', null, h('span', null, 'Состояние'), h('select', { value: task.status || 'in_progress', disabled: readOnly, onChange: (event) => updateSelectedNode({ status: event.target.value, progress: event.target.value === 'done' ? 100 : task.progress }) },
                    h('option', { value: 'todo' }, 'Ожидает начала'),
                    h('option', { value: 'in_progress' }, 'В работе'),
                    h('option', { value: 'done' }, 'Выполнено'),
                    h('option', { value: 'cancelled' }, 'Отменено'),
                )),
                task && !readOnly && h('div', { className: 'goal-map-inspector__actions' },
                    h('button', { type: 'button', onClick: () => state?.updateGoal?.(goal.id, { nextTaskId: task.id }) }, 'Сделать фокусом'),
                    h('button', { type: 'button', onClick: removeSelectedFromGoal }, 'Убрать из цели'),
                    h('button', { type: 'button', className: 'is-danger', onClick: () => setConfirmDelete(selectedNode) }, 'Удалить задачу'),
                ),
                selectedNode.kind === 'goal' && h('div', { className: 'goal-map-inspector__actions' },
                    h('button', { type: 'button', className: 'goal-map-button', onClick: props.onOpenSettings }, 'Параметры цели'),
                    goal?.status === 'done'
                        ? h('button', { type: 'button', className: 'goal-map-button', onClick: props.onRestore }, 'Вернуть в активные')
                        : goal?.status === 'active' && h('button', { type: 'button', className: 'goal-map-button', onClick: () => { setFormDraft({ current: '', change: '', nextStep: '', complete: true }); setPanel('review'); } }, 'Завершить цель'),
                ),
                selectedNode.kind !== 'goal' && selectedNode.entityType !== 'task' && !readOnly && h('button', { type: 'button', className: 'goal-map-button is-danger', onClick: () => setConfirmDelete(selectedNode) }, 'Удалить элемент'),
                !readOnly && selectedNode.kind !== 'goal' && h('label', null,
                    h('span', null, 'Связать с…'),
                    h('select', { value: '', onChange: (event) => {
                        const target = model.nodes.find((node) => node.id === event.target.value);
                        const validation = validateConnection(selectedNode, target, model.edges, model.goalTasks);
                        if (!validation.ok) { announce(validation.reason); return; }
                        setRelationDraft(validation.relation);
                        setRelationLabel('');
                        setPendingConnection({ fromNode: selectedNode, toNode: target });
                    } },
                        h('option', { value: '' }, 'Выберите элемент'),
                        model.nodes.filter((node) => node.id !== selectedNode.id).map((node) => h('option', { key: node.id, value: node.id }, `${NODE_META[node.kind]?.label}: ${node.title}`)),
                    ),
                ),
            );
        };

        const primary = (() => {
            if (goal?.status === 'done') return { label: 'Вернуть в активные', action: () => props.onRestore?.() };
            if (readModel?.course?.kind === 'review') return { label: 'Проверить результат', action: () => { setFormDraft({ current: '', change: '', nextStep: '', complete: false }); setPanel('review'); } };
            if (readModel?.course?.kind === 'schedule') return { label: 'Запланировать', action: () => {
                const focusTask = readModel?.focusTask;
                setSelectedId(nodeIdFor('task', focusTask?.id));
                setFormDraft({ nodeId: nodeIdFor('task', focusTask?.id), date: focusTask?.dueDate || new Date().toISOString().slice(0, 10), startTime: '09:00', plannedMinutes: focusTask?.plannedMinutes || 30 });
                setPanel('date');
            } };
            if (readModel?.course?.kind === 'moving' && readModel?.focusTask) return { label: 'Начать', action: props.onStartFocus };
            if (readModel?.course?.kind === 'blocked') return { label: 'Разобрать препятствие', action: () => setSelectedId(model.nodes.find((node) => node.kind === 'obstacle')?.id || nodeIdFor('goal', goal.id)) };
            return { label: 'Добавить задачу', action: () => openCreate('task') };
        })();

        const mapContent = h('div', { className: 'goal-map-screen', ref: rootRef, 'data-testid': 'goal-map-screen' },
            h('header', { className: 'goal-map-header' },
                h('button', { type: 'button', className: 'goal-map-header__back', onClick: closeMap, 'aria-label': 'Назад к целям' }, h('span', { 'aria-hidden': 'true' }, '←'), h('span', null, 'Назад')),
                h('div', { className: 'goal-map-header__summary' },
                    h('strong', null, goal?.title || 'Цель'),
                    h('span', null, readModel?.hasResultProgress ? `${readModel.resultProgress}%` : readModel?.course?.label || 'Карта цели'),
                ),
                h('div', { className: 'goal-map-header__signals' },
                    readModel?.dueState?.isOverdue && h('span', { className: 'goal-map-header__alert' }, readModel.dueState.label),
                    readModel?.course?.kind === 'blocked' && h('span', { className: 'goal-map-header__alert' }, 'Есть препятствие'),
                    h('span', { className: 'goal-map-header__sync', role: 'status' }, syncStatus),
                ),
                h('button', { type: 'button', className: 'goal-map-button goal-map-button--primary goal-map-header__primary', onClick: primary.action }, primary.label),
            ),
            h('div', { className: 'goal-map-toolbar' },
                h('div', { className: 'goal-map-segment', role: 'group', 'aria-label': 'Режим просмотра' },
                    h('button', { type: 'button', className: mode === 'map' ? 'is-active' : '', onClick: () => setMode('map'), 'aria-pressed': mode === 'map' }, 'Карта'),
                    h('button', { type: 'button', className: mode === 'structure' ? 'is-active' : '', onClick: () => setMode('structure'), 'aria-pressed': mode === 'structure' }, 'Структура'),
                ),
                h('label', { className: 'goal-map-search' }, h('span', { className: 'sr-only' }, 'Поиск по карте'), h('input', { type: 'search', value: search, placeholder: 'Поиск', onChange: (event) => setSearch(event.target.value) })),
                h('button', { type: 'button', onClick: fitAll }, 'Показать всё'),
                h('button', { type: 'button', onClick: autoArrange, disabled: readOnly }, 'Упорядочить'),
                h('label', { className: 'goal-map-check goal-map-check--toolbar' }, h('input', { type: 'checkbox', checked: showCompleted, onChange: (event) => setShowCompleted(event.target.checked) }), h('span', null, 'Выполненные')),
            ),
            mode === 'map' ? h('main', {
                className: 'goal-map-canvas', ref: canvasRef,
                onPointerDown: onCanvasPointerDown,
                onPointerMove: onCanvasPointerMove,
                onPointerUp: onCanvasPointerUp,
                onPointerCancel: onCanvasPointerUp,
                onWheel: (event) => {
                    event.preventDefault();
                    const nextScale = clamp(viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
                    const rect = canvasRef.current.getBoundingClientRect();
                    const px = event.clientX - rect.left;
                    const py = event.clientY - rect.top;
                    const worldX = (px - viewport.x) / viewport.scale;
                    const worldY = (py - viewport.y) / viewport.scale;
                    setViewport({ x: px - worldX * nextScale, y: py - worldY * nextScale, scale: nextScale });
                },
            },
                h('div', { className: 'goal-map-world', style: { transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` } },
                    h('svg', { className: 'goal-map-edges', 'aria-hidden': 'true' },
                        h('defs', null, h('marker', { id: 'goal-map-arrow', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto', markerUnits: 'strokeWidth' }, h('path', { d: 'M0,0 L8,4 L0,8 z' }))),
                        visibleEdges.map(renderEdge),
                        connectionDraft && (() => {
                            const from = visibleNodeMap.get(connectionDraft.fromNodeId);
                            if (!from) return null;
                            const points = calculateEdgeEndpoints(from, { x: connectionDraft.x, y: connectionDraft.y, kind: 'note' });
                            return h('line', { className: 'goal-map-edge__preview', x1: points.from.x, y1: points.from.y, x2: connectionDraft.x, y2: connectionDraft.y });
                        })(),
                    ),
                    visibleNodes.map(renderNode),
                ),
                h('div', { className: 'goal-map-zoom', role: 'group', 'aria-label': 'Масштаб карты' },
                    h('button', { type: 'button', onClick: () => setViewport((value) => ({ ...value, scale: clamp(value.scale / 1.15, MIN_SCALE, MAX_SCALE) })), 'aria-label': 'Уменьшить масштаб' }, '−'),
                    h('span', null, Math.round(viewport.scale * 100) + '%'),
                    h('button', { type: 'button', onClick: () => setViewport((value) => ({ ...value, scale: clamp(value.scale * 1.15, MIN_SCALE, MAX_SCALE) })), 'aria-label': 'Увеличить масштаб' }, '+'),
                ),
            ) : h('main', { className: 'goal-map-structure', ref: canvasRef },
                h('h2', null, 'Структура цели'),
                h('p', null, 'Все действия доступны с клавиатуры. Выберите элемент, чтобы изменить его или создать связь.'),
                h('ul', null, visibleNodes.map((node) => h('li', { key: node.id },
                    h('button', { type: 'button', 'aria-label': `${NODE_META[node.kind]?.label}: ${node.title}`, onClick: () => { setSelectedId(node.id); setSelectedEdgeId(null); } },
                        h(MapIcon, { kind: node.kind }), h('span', null, h('strong', null, NODE_META[node.kind]?.label), ' — ', node.title),
                    ),
                ))),
                h('h3', null, 'Связи'),
                h('ul', null, visibleEdges.map((edge) => {
                    const from = visibleNodeMap.get(edge.fromNodeId);
                    const to = visibleNodeMap.get(edge.toNodeId);
                    return h('li', { key: edge.id }, `${from?.title || ''} — ${edge.label || RELATION_META[edge.relation] || 'связано'} — ${to?.title || ''}`);
                })),
            ),
            !readOnly && h('nav', { className: 'goal-map-palette', 'aria-label': 'Добавить элемент' },
                PALETTE_KINDS.map((kind) => h('button', {
                    key: kind, type: 'button', className: `goal-map-palette__item goal-map-palette__item--${kind}`,
                    onPointerDown: (event) => beginPaletteDrag(event, kind),
                    'aria-label': `Добавить: ${NODE_META[kind].label}`,
                }, h(MapIcon, { kind }), h('span', null, NODE_META[kind].label))),
            ),
            renderInspector(),
            quickCreate && h('div', { className: 'goal-map-dialog-backdrop', onClick: (event) => { if (event.target === event.currentTarget) setQuickCreate(null); } },
                h('form', { className: 'goal-map-dialog', role: 'dialog', 'aria-modal': 'true', onSubmit: (event) => { event.preventDefault(); submitCreate(); } },
                    h('h2', null, `Новый элемент: ${NODE_META[quickCreate.kind]?.label}`),
                    h('label', null, h('span', null, 'Название'), h('input', { autoFocus: true, value: quickTitle, onChange: (event) => setQuickTitle(event.target.value) })),
                    h('div', { className: 'goal-map-dialog__actions' },
                        h('button', { type: 'button', onClick: () => setQuickCreate(null) }, 'Отмена'),
                        h('button', { type: 'submit', className: 'goal-map-button--primary', disabled: !String(quickTitle || '').trim() }, 'Добавить'),
                    ),
                ),
            ),
            pendingConnection && h('div', { className: 'goal-map-dialog-backdrop' },
                h('form', { className: 'goal-map-dialog', role: 'dialog', 'aria-modal': 'true', onSubmit: (event) => { event.preventDefault(); applyConnection(); } },
                    h('h2', null, 'Новая связь'),
                    h('p', null, `«${pendingConnection.fromNode.title}» → «${pendingConnection.toNode.title}»`),
                    h('label', null, h('span', null, 'Тип связи'), h('select', { value: relationDraft, onChange: (event) => setRelationDraft(event.target.value) },
                        Object.entries(RELATION_META).filter(([key]) => key !== 'hierarchy').map(([key, label]) => h('option', { key, value: key }, label)),
                    )),
                    (relationDraft === 'option' || relationLabel) && h('label', null, h('span', null, relationDraft === 'option' ? 'Подпись ветки' : 'Подпись'), h('input', { value: relationLabel, required: relationDraft === 'option', onChange: (event) => setRelationLabel(event.target.value) })),
                    h('div', { className: 'goal-map-dialog__actions' },
                        h('button', { type: 'button', onClick: () => setPendingConnection(null) }, 'Отмена'),
                        h('button', { type: 'submit', className: 'goal-map-button--primary', disabled: relationDraft === 'option' && !String(relationLabel || '').trim() }, 'Создать связь'),
                    ),
                ),
            ),
            confirmDelete && h('div', { className: 'goal-map-dialog-backdrop' },
                h('div', { className: 'goal-map-dialog', role: 'alertdialog', 'aria-modal': 'true' },
                    h('h2', null, confirmDelete.entityType === 'task' ? 'Удалить задачу?' : 'Удалить элемент?'),
                    h('p', null, confirmDelete.entityType === 'task' ? 'Календарные записи и зависимости этой задачи тоже будут удалены.' : 'Элемент и его собственные связи будут удалены.'),
                    h('div', { className: 'goal-map-dialog__actions' },
                        h('button', { type: 'button', onClick: () => setConfirmDelete(null) }, 'Отмена'),
                        h('button', { type: 'button', className: 'is-danger', onClick: deleteSelectedNode }, 'Удалить'),
                    ),
                ),
            ),
            notice && h('div', { className: 'goal-map-toast', role: 'status', 'aria-live': 'polite' },
                h('span', null, notice.message),
                notice.undo && h('button', { type: 'button', onClick: undo }, 'Отменить'),
                h('button', { type: 'button', onClick: () => setNotice(null), 'aria-label': 'Закрыть сообщение' }, '×'),
            ),
        );

        return ReactDOM?.createPortal ? ReactDOM.createPortal(mapContent, document.body) : mapContent;
    }

    GoalMap.NODE_META = NODE_META;
    GoalMap.RELATION_META = RELATION_META;
    GoalMap.nodeIdFor = nodeIdFor;
    GoalMap.getNodeSize = getNodeSize;
    GoalMap.radialPositions = radialPositions;
    GoalMap.deterministicRadialLayout = deterministicRadialLayout;
    GoalMap.buildGoalMapModel = buildGoalMapModel;
    GoalMap.defaultRelation = defaultRelation;
    GoalMap.validateConnection = validateConnection;
    GoalMap.wouldCreateTaskCycle = wouldCreateTaskCycle;
    GoalMap.calculateEdgeEndpoints = calculateEdgeEndpoints;
    GoalMap.GoalMapScreen = GoalMapScreen;
})();
