// heys_planning_game_color_trail_v1.js — lightweight offline territory arcade
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const PlanningGames = HEYS.PlanningGames = HEYS.PlanningGames || {};
    PlanningGames.modules = PlanningGames.modules || {};

    const WIDTH = 64;
    const HEIGHT = 96;
    const SIZE = WIDTH * HEIGHT;
    const ACTOR_COUNT = 4;
    const MAX_TICK_CELLS = 256;
    const PLAYER_SPEED = 8;
    const FIXED_STEP = 1 / 30;
    const BOT_DECISION_STEP = 0.1;
    const ROUND_SECONDS = 90;
    const TERRITORY_RENDER_SCALE = 6;
    const DEBUG_SNAPSHOT_INTERVAL = 0.5;
    const MAX_DEBUG_EVENTS = 640;
    const TAU = Math.PI * 2;
    const COLORS = ['#D7DBE0', '#434587', '#52A0D8', '#D68A98', '#5D9B76'];
    const RGB_COLORS = [[215, 219, 224], [67, 69, 135], [82, 160, 216], [214, 138, 152], [93, 155, 118]];
    const STARTS = [[8, 12], [55, 12], [8, 83], [55, 83]];
    const BOT_HOME = 0;
    const BOT_EXIT = 1;
    const BOT_SIDE = 2;
    const BOT_RETURN = 3;
    const BOT_ATTACK = 4;
    const RESET_PATH_OVERFLOW = 3;
    const RESET_TRAIL_BUFFER = 4;
    const RESET_CUT_CLOSED = 5;
    const RESET_REASON_NAMES = ['unknown', 'unused', 'unused', 'path_overflow', 'trail_buffer', 'cut_closed'];

    function seedValue(value) {
        const number = Number(value);
        return (Number.isFinite(number) ? number : 1) >>> 0 || 1;
    }

    function random(world) {
        world.rngState = (Math.imul(world.rngState, 1664525) + 1013904223) >>> 0;
        return world.rngState / 4294967296;
    }

    function cellIndex(x, y) {
        return y * WIDTH + x;
    }

    function clamp(value, min, max) {
        return value < min ? min : value > max ? max : value;
    }

    function angleDelta(from, to) {
        let delta = (to - from) % TAU;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        return delta;
    }

    function debugNumber(value) {
        return Math.round(Number(value) * 1000) / 1000;
    }

    function debugActor(world, actor) {
        const index = cellIndex(clamp(Math.floor(actor.x), 0, WIDTH - 1), clamp(Math.floor(actor.y), 0, HEIGHT - 1));
        return {
            id: actor.id,
            active: actor.active,
            x: debugNumber(actor.x),
            y: debugNumber(actor.y),
            cell: index,
            direction: debugNumber(actor.direction),
            desiredDirection: debugNumber(actor.desiredDirection),
            speed: debugNumber(actor.speed),
            ownerHere: world.owner[index],
            trailHere: world.trail[index],
            excursionLength: actor.excursionLength,
            pendingCutMask: actor.pendingCutMask,
            botState: actor.botState,
            botSteps: actor.botSteps,
            homeX: debugNumber(actor.homeX),
            homeY: debugNumber(actor.homeY),
            territoryAnchorCell: actor.territoryAnchorCell,
            respawnIn: actor.active ? 0 : debugNumber(Math.max(0, actor.respawnUntil - world.time)),
        };
    }

    function recordDebug(world, type, details) {
        if (!world || !Array.isArray(world.debugEvents)) return;
        const event = Object.assign({
            sequence: world.debugSequence++,
            time: debugNumber(world.time),
            type,
        }, details || {});
        if (world.debugEvents.length >= MAX_DEBUG_EVENTS) world.debugEvents.splice(1, 1);
        world.debugEvents.push(event);
    }

    function recordDebugSnapshot(world) {
        recordDebug(world, 'frame', {
            rngState: world.rngState,
            territory: Array.from(world.territoryCounts),
            actors: world.actors.map((actor) => debugActor(world, actor)),
        });
        world.nextDebugSnapshot = world.time + DEBUG_SNAPSHOT_INTERVAL;
    }

    function createActor(id, x, y, world) {
        const angle = id === 1 ? -Math.PI / 2 : random(world) * TAU;
        return {
            id,
            x: x + 0.5,
            y: y + 0.5,
            previousCell: cellIndex(x, y),
            intendedX: x + 0.5,
            intendedY: y + 0.5,
            intendedCell: cellIndex(x, y),
            direction: angle,
            desiredDirection: angle,
            speed: id === 1 ? PLAYER_SPEED : PLAYER_SPEED * (0.85 + random(world) * 0.1),
            active: true,
            respawnUntil: 0,
            excursion: new Int32Array(SIZE),
            excursionLength: 0,
            tickCells: new Int32Array(MAX_TICK_CELLS),
            tickCount: 0,
            closurePending: false,
            pendingCutMask: 0,
            overflowed: false,
            botState: BOT_HOME,
            botSteps: 0,
            homeX: x + 0.5,
            homeY: y + 0.5,
            territoryAnchorCell: cellIndex(x, y),
            deathX: x + 0.5,
            deathY: y + 0.5,
        };
    }

    function paintCore(world, actorId, centerX, centerY) {
        for (let y = centerY - 2; y <= centerY + 2; y += 1) {
            for (let x = centerX - 2; x <= centerX + 2; x += 1) {
                if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
                    world.owner[cellIndex(x, y)] = actorId;
                }
            }
        }
        world.territoryRevision += 1;
    }

    function recountTerritory(world) {
        world.territoryCounts.fill(0);
        for (let i = 0; i < SIZE; i += 1) {
            const ownerId = world.owner[i];
            if (ownerId <= ACTOR_COUNT) world.territoryCounts[ownerId] += 1;
        }
    }

    function createWorld(options) {
        const settings = options || {};
        const world = {
            width: WIDTH,
            height: HEIGHT,
            size: SIZE,
            time: 0,
            seed: seedValue(settings.seed),
            rngState: seedValue(settings.seed),
            owner: new Uint8Array(SIZE),
            trail: new Uint8Array(SIZE),
            visited: new Uint8Array(SIZE),
            newTrailMask: new Uint8Array(SIZE),
            queue: new Int32Array(SIZE),
            actors: new Array(ACTOR_COUNT),
            actorById: new Array(ACTOR_COUNT + 1),
            resetMarks: new Uint8Array(ACTOR_COUNT + 1),
            resetReasons: new Uint8Array(ACTOR_COUNT + 1),
            resetBy: new Uint8Array(ACTOR_COUNT + 1),
            lastReset: new Uint8Array(ACTOR_COUNT + 1),
            territoryCounts: new Uint16Array(ACTOR_COUNT + 1),
            territoryRevision: 0,
            botDecisionAccumulator: 0,
            debugEvents: [],
            debugSequence: 0,
            nextDebugSnapshot: DEBUG_SNAPSHOT_INTERVAL,
        };

        for (let i = 0; i < ACTOR_COUNT; i += 1) {
            paintCore(world, i + 1, STARTS[i][0], STARTS[i][1]);
        }
        for (let i = 0; i < ACTOR_COUNT; i += 1) {
            const actor = createActor(i + 1, STARTS[i][0], STARTS[i][1], world);
            world.actors[i] = actor;
            world.actorById[actor.id] = actor;
        }
        recountTerritory(world);
        recordDebug(world, 'round_start', {
            seed: world.seed,
            width: WIDTH,
            height: HEIGHT,
            fixedStep: FIXED_STEP,
            actors: world.actors.map((actor) => debugActor(world, actor)),
        });
        return world;
    }

    function appendTickCell(actor, index) {
        if (actor.tickCount > 0 && actor.tickCells[actor.tickCount - 1] === index) return true;
        if (actor.tickCount >= actor.tickCells.length) {
            actor.overflowed = true;
            return false;
        }
        actor.tickCells[actor.tickCount] = index;
        actor.tickCount += 1;
        return true;
    }

    // Supercover traversal: a corner crossing records both adjacent cells, so a
    // fast diagonal cannot leave a flood-fill gap or skip a vulnerable trail.
    function buildSweptPath(actor, nextX, nextY) {
        actor.tickCount = 0;
        actor.overflowed = false;
        let x = clamp(Math.floor(actor.x), 0, WIDTH - 1);
        let y = clamp(Math.floor(actor.y), 0, HEIGHT - 1);
        const endX = clamp(Math.floor(nextX), 0, WIDTH - 1);
        const endY = clamp(Math.floor(nextY), 0, HEIGHT - 1);
        const dx = nextX - actor.x;
        const dy = nextY - actor.y;
        const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity;
        const tDeltaY = stepY ? Math.abs(1 / dy) : Infinity;
        let tMaxX = stepX > 0 ? ((x + 1) - actor.x) / dx : stepX < 0 ? (x - actor.x) / dx : Infinity;
        let tMaxY = stepY > 0 ? ((y + 1) - actor.y) / dy : stepY < 0 ? (y - actor.y) / dy : Infinity;
        let guard = 0;

        while ((x !== endX || y !== endY) && guard < MAX_TICK_CELLS) {
            guard += 1;
            if (Math.abs(tMaxX - tMaxY) < 1e-9) {
                if (x !== endX) {
                    x += stepX;
                    if (!appendTickCell(actor, cellIndex(x, y))) break;
                }
                if (y !== endY) {
                    y += stepY;
                    if (!appendTickCell(actor, cellIndex(x, y))) break;
                }
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
            } else if (tMaxX < tMaxY) {
                x += stepX;
                tMaxX += tDeltaX;
                if (!appendTickCell(actor, cellIndex(x, y))) break;
            } else {
                y += stepY;
                tMaxY += tDeltaY;
                if (!appendTickCell(actor, cellIndex(x, y))) break;
            }
        }
    }

    function findOwnedCell(world, actorId) {
        const start = STARTS[actorId - 1];
        const preferred = cellIndex(start[0], start[1]);
        if (world.owner[preferred] === actorId && world.trail[preferred] === 0) return preferred;
        for (let i = 0; i < SIZE; i += 1) {
            if (world.owner[i] === actorId && world.trail[i] === 0) return i;
        }
        return -1;
    }

    function findNearestOwnedCell(world, actor) {
        let nearest = -1;
        let bestDistance = Infinity;
        for (let index = 0; index < SIZE; index += 1) {
            if (world.owner[index] !== actor.id) continue;
            const dx = ((index % WIDTH) + 0.5) - actor.x;
            const dy = (Math.floor(index / WIDTH) + 0.5) - actor.y;
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                nearest = index;
                bestDistance = distance;
            }
        }
        return nearest;
    }

    function hasHeadAt(world, index) {
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const actor = world.actorById[id];
            if (actor.active && cellIndex(Math.floor(actor.x), Math.floor(actor.y)) === index) return true;
        }
        return false;
    }

    function isSafeCore(world, actor, x, y, requireNeutral, keepAwayFromDeath) {
        if (keepAwayFromDeath) {
            const dx = (x + 0.5) - actor.deathX;
            const dy = (y + 0.5) - actor.deathY;
            if (dx * dx + dy * dy < 144) return false;
        }
        for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
                const index = cellIndex(x + ox, y + oy);
                if (world.trail[index] || hasHeadAt(world, index) || (requireNeutral && world.owner[index])) return false;
            }
        }
        return true;
    }

    function placeCore(world, actorId, x, y) {
        for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) world.owner[cellIndex(x + ox, y + oy)] = actorId;
        }
        world.territoryRevision += 1;
        recountTerritory(world);
        return cellIndex(x, y);
    }

    function recreateCore(world, actorId) {
        const actor = world.actorById[actorId];
        for (let attempt = 0; attempt < 96; attempt += 1) {
            const x = 3 + Math.floor(random(world) * (WIDTH - 6));
            const y = 3 + Math.floor(random(world) * (HEIGHT - 6));
            if (isSafeCore(world, actor, x, y, true, true)) return placeCore(world, actorId, x, y);
        }
        const start = Math.floor(random(world) * SIZE);
        for (let pass = 0; pass < 3; pass += 1) {
            for (let offset = 0; offset < SIZE; offset += 1) {
                const index = (start + offset) % SIZE;
                const x = index % WIDTH;
                const y = Math.floor(index / WIDTH);
                if (x < 3 || x >= WIDTH - 3 || y < 3 || y >= HEIGHT - 3) continue;
                if (isSafeCore(world, actor, x, y, pass < 2, pass === 0)) return placeCore(world, actorId, x, y);
            }
        }
        return cellIndex(STARTS[actorId - 1][0], STARTS[actorId - 1][1]);
    }

    function clearActorTrail(world, actor) {
        for (let i = 0; i < actor.excursionLength; i += 1) {
            const index = actor.excursion[i];
            if (world.trail[index] === actor.id) world.trail[index] = 0;
        }
        actor.excursionLength = 0;
        actor.closurePending = false;
    }

    function neutralizeTerritory(world, actorId) {
        let changed = false;
        for (let index = 0; index < SIZE; index += 1) {
            if (world.owner[index] !== actorId) continue;
            world.owner[index] = 0;
            changed = true;
        }
        if (!changed) return;
        world.territoryRevision += 1;
        recountTerritory(world);
    }

    function pruneDetachedTerritory(world, actorId) {
        const actor = world.actorById[actorId];
        let anchor = actor.territoryAnchorCell;
        if (anchor < 0 || anchor >= SIZE || world.owner[anchor] !== actorId) {
            const headCell = cellIndex(clamp(Math.floor(actor.x), 0, WIDTH - 1), clamp(Math.floor(actor.y), 0, HEIGHT - 1));
            anchor = world.owner[headCell] === actorId ? headCell : findNearestOwnedCell(world, actor);
        }
        if (anchor < 0) return 0;

        world.visited.fill(0);
        let head = 0;
        let tail = 0;
        world.visited[anchor] = 1;
        world.queue[tail++] = anchor;
        while (head < tail) {
            const index = world.queue[head++];
            const x = index % WIDTH;
            const y = Math.floor(index / WIDTH);
            for (let oy = -1; oy <= 1; oy += 1) {
                for (let ox = -1; ox <= 1; ox += 1) {
                    if (ox === 0 && oy === 0) continue;
                    const nextX = x + ox;
                    const nextY = y + oy;
                    if (nextX < 0 || nextX >= WIDTH || nextY < 0 || nextY >= HEIGHT) continue;
                    const next = cellIndex(nextX, nextY);
                    if (!world.visited[next] && world.owner[next] === actorId) {
                        world.visited[next] = 1;
                        world.queue[tail++] = next;
                    }
                }
            }
        }

        let removed = 0;
        for (let index = 0; index < SIZE; index += 1) {
            if (world.owner[index] === actorId && !world.visited[index]) {
                world.owner[index] = 0;
                removed += 1;
            }
        }
        actor.territoryAnchorCell = anchor;
        return removed;
    }

    function clearPendingTarget(world, actorId, reason) {
        const targetMask = ~(1 << actorId);
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const attacker = world.actorById[id];
            if (attacker.pendingCutMask & (1 << actorId)) {
                attacker.pendingCutMask &= targetMask;
                recordDebug(world, 'cut_cancelled', { attackerId: id, victimId: actorId, reason: reason || 'target_safe' });
            }
        }
    }

    function markReset(world, actorId, reasonCode, byActorId) {
        world.resetMarks[actorId] = 1;
        if (!world.resetReasons[actorId]) {
            world.resetReasons[actorId] = reasonCode;
            world.resetBy[actorId] = byActorId || 0;
        }
    }

    function resetActor(world, actorId, reasonCode, byActorId) {
        const actor = world.actorById[actorId];
        if (!actor) return;
        const resolvedReason = reasonCode || world.resetReasons[actorId] || 0;
        const resolvedBy = byActorId || world.resetBy[actorId] || 0;
        recordDebug(world, 'reset', {
            actorId,
            reason: RESET_REASON_NAMES[resolvedReason] || RESET_REASON_NAMES[0],
            byActorId: resolvedBy,
            x: debugNumber(actor.x),
            y: debugNumber(actor.y),
            cell: cellIndex(clamp(Math.floor(actor.x), 0, WIDTH - 1), clamp(Math.floor(actor.y), 0, HEIGHT - 1)),
            ownerHere: world.owner[cellIndex(clamp(Math.floor(actor.x), 0, WIDTH - 1), clamp(Math.floor(actor.y), 0, HEIGHT - 1))],
            trailLength: actor.excursionLength,
            pendingCutMask: actor.pendingCutMask,
            territoryLost: world.territoryCounts[actorId],
        });
        actor.deathX = actor.x;
        actor.deathY = actor.y;
        clearActorTrail(world, actor);
        actor.pendingCutMask = 0;
        clearPendingTarget(world, actorId, 'target_reset');
        neutralizeTerritory(world, actorId);
        actor.active = false;
        actor.respawnUntil = world.time + 0.75;
        actor.botState = BOT_HOME;
        actor.botSteps = 0;
        world.lastReset[actorId] = 1;
    }

    function respawnActor(world, actor) {
        let index = findOwnedCell(world, actor.id);
        if (index < 0) index = recreateCore(world, actor.id);
        actor.x = (index % WIDTH) + 0.5;
        actor.y = Math.floor(index / WIDTH) + 0.5;
        actor.previousCell = index;
        actor.intendedCell = index;
        actor.direction = actor.id === 1 ? -Math.PI / 2 : random(world) * TAU;
        actor.desiredDirection = actor.direction;
        actor.homeX = actor.x;
        actor.homeY = actor.y;
        actor.territoryAnchorCell = index;
        actor.active = true;
        recordDebug(world, 'respawn', {
            actorId: actor.id,
            x: debugNumber(actor.x),
            y: debugNumber(actor.y),
            cell: index,
            deathX: debugNumber(actor.deathX),
            deathY: debugNumber(actor.deathY),
        });
    }

    function seedReachable(world, capturingId, index, tail) {
        if (index < 0 || index >= SIZE || world.visited[index]) return tail;
        if (world.owner[index] === capturingId || world.newTrailMask[index]) return tail;
        world.visited[index] = 1;
        world.queue[tail] = index;
        return tail + 1;
    }

    function floodSeededOutside(world, actorId) {
        let head = 0;
        let tail = 0;
        for (let x = 0; x < WIDTH; x += 1) {
            tail = seedReachable(world, actorId, cellIndex(x, 0), tail);
            tail = seedReachable(world, actorId, cellIndex(x, HEIGHT - 1), tail);
        }
        for (let y = 1; y < HEIGHT - 1; y += 1) {
            tail = seedReachable(world, actorId, cellIndex(0, y), tail);
            tail = seedReachable(world, actorId, cellIndex(WIDTH - 1, y), tail);
        }
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            if (id === actorId) continue;
            const rival = world.actorById[id];
            if (rival && rival.active) {
                tail = seedReachable(world, actorId, cellIndex(Math.floor(rival.x), Math.floor(rival.y)), tail);
            }
        }
        while (head < tail) {
            const index = world.queue[head++];
            const x = index % WIDTH;
            const y = Math.floor(index / WIDTH);
            if (x > 0) tail = seedReachable(world, actorId, index - 1, tail);
            if (x + 1 < WIDTH) tail = seedReachable(world, actorId, index + 1, tail);
            if (y > 0) tail = seedReachable(world, actorId, index - WIDTH, tail);
            if (y + 1 < HEIGHT) tail = seedReachable(world, actorId, index + WIDTH, tail);
        }
    }

    function componentTouchesTrail(world, head, tail) {
        for (let i = head; i < tail; i += 1) {
            const index = world.queue[i];
            const x = index % WIDTH;
            const y = Math.floor(index / WIDTH);
            if ((x > 0 && world.newTrailMask[index - 1])
                || (x + 1 < WIDTH && world.newTrailMask[index + 1])
                || (y > 0 && world.newTrailMask[index - WIDTH])
                || (y + 1 < HEIGHT && world.newTrailMask[index + WIDTH])) return true;
        }
        return false;
    }

    function closeTrail(world, actorId) {
        const actor = world && world.actorById && world.actorById[actorId];
        if (!actor || actor.excursionLength === 0) return { captured: 0, valid: false };
        clearPendingTarget(world, actorId, 'target_returned_home');
        world.newTrailMask.fill(0);
        world.visited.fill(0);
        for (let i = 0; i < actor.excursionLength; i += 1) {
            const index = actor.excursion[i];
            if (world.trail[index] === actorId) world.newTrailMask[index] = 1;
        }
        floodSeededOutside(world, actorId);

        let captured = 0;
        for (let start = 0; start < SIZE; start += 1) {
            if (world.visited[start] || world.owner[start] === actorId || world.newTrailMask[start]) continue;
            let head = 0;
            let tail = 0;
            world.visited[start] = 2;
            world.queue[tail++] = start;
            while (head < tail) {
                const index = world.queue[head++];
                const x = index % WIDTH;
                const y = Math.floor(index / WIDTH);
                const left = index - 1;
                const right = index + 1;
                const up = index - WIDTH;
                const down = index + WIDTH;
                if (x > 0 && !world.visited[left] && world.owner[left] !== actorId && !world.newTrailMask[left]) { world.visited[left] = 2; world.queue[tail++] = left; }
                if (x + 1 < WIDTH && !world.visited[right] && world.owner[right] !== actorId && !world.newTrailMask[right]) { world.visited[right] = 2; world.queue[tail++] = right; }
                if (y > 0 && !world.visited[up] && world.owner[up] !== actorId && !world.newTrailMask[up]) { world.visited[up] = 2; world.queue[tail++] = up; }
                if (y + 1 < HEIGHT && !world.visited[down] && world.owner[down] !== actorId && !world.newTrailMask[down]) { world.visited[down] = 2; world.queue[tail++] = down; }
            }
            if (componentTouchesTrail(world, 0, tail)) {
                for (let i = 0; i < tail; i += 1) world.owner[world.queue[i]] = actorId;
                captured += tail;
            }
        }

        const detachedTerritoryRemoved = new Array(ACTOR_COUNT + 1).fill(0);
        if (captured > 0) {
            let closureAnchor = -1;
            for (let i = 0; i < actor.excursionLength; i += 1) {
                const index = actor.excursion[i];
                if (world.newTrailMask[index]) {
                    world.owner[index] = actorId;
                    if (closureAnchor < 0) closureAnchor = index;
                }
            }
            if (closureAnchor >= 0) actor.territoryAnchorCell = closureAnchor;
            for (let rivalId = 1; rivalId <= ACTOR_COUNT; rivalId += 1) {
                detachedTerritoryRemoved[rivalId] = pruneDetachedTerritory(world, rivalId);
            }
            world.territoryRevision += 1;
            recountTerritory(world);
        }
        const pendingCutMask = actor.pendingCutMask;
        actor.pendingCutMask = 0;
        clearActorTrail(world, actor);
        const defeated = [];
        if (captured > 0 && pendingCutMask) {
            for (let rivalId = 1; rivalId <= ACTOR_COUNT; rivalId += 1) {
                const rival = world.actorById[rivalId];
                if ((pendingCutMask & (1 << rivalId)) && rival.active && rival.excursionLength > 0) {
                    defeated.push(rivalId);
                    resetActor(world, rivalId, RESET_CUT_CLOSED, actorId);
                }
            }
        }
        recordDebug(world, 'trail_closed', {
            actorId,
            captured,
            valid: captured > 0,
            pendingCutMask,
            defeated,
            detachedTerritoryRemoved,
        });
        world.newTrailMask.fill(0);
        return { captured, valid: captured > 0 };
    }

    function nearestForeignTrailDirection(world, actor, radius) {
        const cx = Math.floor(actor.x);
        const cy = Math.floor(actor.y);
        let bestDistance = radius + 1;
        let bestX = 0;
        let bestY = 0;
        for (let y = Math.max(0, cy - radius); y <= Math.min(HEIGHT - 1, cy + radius); y += 1) {
            for (let x = Math.max(0, cx - radius); x <= Math.min(WIDTH - 1, cx + radius); x += 1) {
                const trailId = world.trail[cellIndex(x, y)];
                const distance = Math.abs(x - cx) + Math.abs(y - cy);
                if (trailId && trailId !== actor.id && distance < bestDistance) {
                    bestDistance = distance;
                    bestX = x + 0.5;
                    bestY = y + 0.5;
                }
            }
        }
        if (bestDistance > radius) return false;
        actor.desiredDirection = Math.atan2(bestY - actor.y, bestX - actor.x);
        return true;
    }

    function decideBot(world, actor) {
        const previousState = actor.botState;
        const previousDirection = actor.desiredDirection;
        const current = cellIndex(Math.floor(actor.x), Math.floor(actor.y));
        const inHome = world.owner[current] === actor.id;
        if (actor.excursionLength > 18) actor.botState = BOT_RETURN;
        if (actor.botState !== BOT_RETURN && random(world) < 0.035 && nearestForeignTrailDirection(world, actor, 6)) {
            actor.botState = BOT_ATTACK;
            actor.botSteps = 4;
        }
        if (actor.botState === BOT_HOME && inHome) {
            const outwardX = actor.homeX < WIDTH / 2 ? 1 : -1;
            const outwardY = actor.homeY < HEIGHT / 2 ? 1 : -1;
            actor.desiredDirection = Math.atan2(outwardY, outwardX) + (random(world) - 0.5) * 0.5;
            actor.botState = BOT_EXIT;
            actor.botSteps = 40 + Math.floor(random(world) * 60);
        } else if (actor.botState === BOT_EXIT) {
            actor.botSteps -= 1;
            if (actor.botSteps <= 0 || actor.excursionLength >= 10) {
                actor.desiredDirection += random(world) < 0.5 ? Math.PI / 2 : -Math.PI / 2;
                actor.botState = BOT_SIDE;
                actor.botSteps = 30 + Math.floor(random(world) * 50);
            }
        } else if (actor.botState === BOT_SIDE) {
            actor.botSteps -= 1;
            if (actor.botSteps <= 0 || actor.excursionLength >= 18) actor.botState = BOT_RETURN;
        } else if (actor.botState === BOT_RETURN) {
            actor.desiredDirection = Math.atan2(actor.homeY - actor.y, actor.homeX - actor.x);
            if (inHome && actor.excursionLength === 0) actor.botState = BOT_HOME;
        } else if (actor.botState === BOT_ATTACK) {
            actor.botSteps -= 1;
            if (actor.botSteps <= 0 || !nearestForeignTrailDirection(world, actor, 6)) actor.botState = BOT_RETURN;
        }
        if (actor.botState !== previousState || Math.abs(angleDelta(previousDirection, actor.desiredDirection)) > 0.15) {
            recordDebug(world, 'bot_decision', {
                actorId: actor.id,
                fromState: previousState,
                toState: actor.botState,
                desiredDirection: debugNumber(actor.desiredDirection),
                excursionLength: actor.excursionLength,
            });
        }
    }

    function applyPlayerInput(actor, input) {
        if (!input) return;
        const directionX = Number(input.directionX);
        const directionY = Number(input.directionY);
        if (Number.isFinite(directionX) && Number.isFinite(directionY) && (directionX || directionY)) {
            actor.desiredDirection = Math.atan2(directionY, directionX);
            return;
        }
        const targetX = Number(input.targetX);
        const targetY = Number(input.targetY);
        if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
            const dx = targetX - actor.x;
            const dy = targetY - actor.y;
            if (dx * dx + dy * dy > 1.2) actor.desiredDirection = Math.atan2(dy, dx);
        }
    }

    function markIntentCollisions(world) {
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const actor = world.actorById[id];
            if (!actor.active || actor.overflowed) { if (actor.overflowed) markReset(world, id, RESET_PATH_OVERFLOW, 0); continue; }
            for (let i = 0; i < actor.tickCount; i += 1) {
                const trailOwner = world.trail[actor.tickCells[i]];
                if (trailOwner && trailOwner !== id) {
                    const targetMask = 1 << trailOwner;
                    if (!(actor.pendingCutMask & targetMask)) {
                        recordDebug(world, 'open_trail_cut', { attackerId: id, victimId: trailOwner, cell: actor.tickCells[i] });
                    }
                    actor.pendingCutMask |= targetMask;
                }
            }
        }
    }

    function commitActor(world, actor) {
        actor.closurePending = false;
        for (let i = 0; i < actor.tickCount; i += 1) {
            const index = actor.tickCells[i];
            if (world.owner[index] === actor.id) {
                actor.territoryAnchorCell = index;
                if (actor.excursionLength > 0) actor.closurePending = true;
                continue;
            }
            if (actor.closurePending || world.trail[index] === actor.id) continue;
            if (actor.excursionLength >= actor.excursion.length) {
                markReset(world, actor.id, RESET_TRAIL_BUFFER, 0);
                return;
            }
            world.trail[index] = actor.id;
            actor.excursion[actor.excursionLength++] = index;
        }
        actor.x = actor.intendedX;
        actor.y = actor.intendedY;
        actor.previousCell = actor.intendedCell;
    }

    function stepWorld(world, input, fixedDelta) {
        if (!world || world.width !== WIDTH || world.height !== HEIGHT) return world;
        const delta = clamp(Number(fixedDelta) || FIXED_STEP, 0, 2);
        world.time += delta;
        world.lastReset.fill(0);
        world.resetMarks.fill(0);
        world.resetReasons.fill(0);
        world.resetBy.fill(0);
        world.botDecisionAccumulator += delta;
        const decideBotsNow = world.botDecisionAccumulator >= BOT_DECISION_STEP;
        if (decideBotsNow) world.botDecisionAccumulator %= BOT_DECISION_STEP;

        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const actor = world.actorById[id];
            if (!actor.active) {
                actor.tickCount = 0;
                if (world.time >= actor.respawnUntil) respawnActor(world, actor);
                else continue;
            }
            actor.previousCell = cellIndex(Math.floor(actor.x), Math.floor(actor.y));
            if (id === 1) applyPlayerInput(actor, input);
            else if (decideBotsNow) decideBot(world, actor);
            const maxTurn = (id === 1 ? 3.4 : 2.6) * delta;
            actor.direction += clamp(angleDelta(actor.direction, actor.desiredDirection), -maxTurn, maxTurn);
            let nextX = actor.x + Math.cos(actor.direction) * actor.speed * delta;
            let nextY = actor.y + Math.sin(actor.direction) * actor.speed * delta;
            if (nextX < 0.05 || nextX > WIDTH - 0.05) {
                actor.direction = Math.PI - actor.direction;
                actor.desiredDirection = actor.direction;
                nextX = clamp(nextX, 0.05, WIDTH - 0.05);
            }
            if (nextY < 0.05 || nextY > HEIGHT - 0.05) {
                actor.direction = -actor.direction;
                actor.desiredDirection = actor.direction;
                nextY = clamp(nextY, 0.05, HEIGHT - 0.05);
            }
            actor.intendedX = nextX;
            actor.intendedY = nextY;
            actor.intendedCell = cellIndex(clamp(Math.floor(nextX), 0, WIDTH - 1), clamp(Math.floor(nextY), 0, HEIGHT - 1));
            buildSweptPath(actor, nextX, nextY);
        }

        markIntentCollisions(world);
        for (let id = 1; id <= ACTOR_COUNT; id += 1) if (world.resetMarks[id]) resetActor(world, id);
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const actor = world.actorById[id];
            if (actor.active && !world.resetMarks[id]) commitActor(world, actor);
        }
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const actor = world.actorById[id];
            if (actor.active && !world.resetMarks[id] && actor.closurePending) clearPendingTarget(world, id, 'target_returned_home');
        }
        for (let id = 1; id <= ACTOR_COUNT; id += 1) {
            const actor = world.actorById[id];
            if (actor.active && !world.resetMarks[id] && actor.closurePending) closeTrail(world, id);
        }
        for (let id = 1; id <= ACTOR_COUNT; id += 1) if (world.resetMarks[id] && world.actorById[id].active) resetActor(world, id);
        if (world.time >= world.nextDebugSnapshot) recordDebugSnapshot(world);
        return world;
    }

    function getTerritoryPercent(world, actorId) {
        if (!world || !world.owner || actorId < 1 || actorId > ACTOR_COUNT) return 0;
        let count = 0;
        for (let i = 0; i < world.owner.length; i += 1) if (world.owner[i] === actorId) count += 1;
        return clamp((count / SIZE) * 100, 0, 100);
    }

    function validateWorld(world) {
        const errors = [];
        if (!world || world.width !== WIDTH || world.height !== HEIGHT || world.size !== SIZE) errors.push('E_WORLD_SIZE');
        if (!(world && world.owner instanceof Uint8Array) || world.owner.length !== SIZE) errors.push('E_OWNER');
        if (!(world && world.trail instanceof Uint8Array) || world.trail.length !== SIZE) errors.push('E_TRAIL');
        if (!(world && world.visited instanceof Uint8Array) || world.visited.length !== SIZE) errors.push('E_VISITED');
        if (!(world && world.newTrailMask instanceof Uint8Array) || world.newTrailMask.length !== SIZE) errors.push('E_NEW_TRAIL_MASK');
        if (!(world && world.queue instanceof Int32Array) || world.queue.length !== SIZE) errors.push('E_QUEUE');
        if (!(world && world.resetReasons instanceof Uint8Array) || world.resetReasons.length !== ACTOR_COUNT + 1) errors.push('E_RESET_REASONS');
        if (!(world && world.resetBy instanceof Uint8Array) || world.resetBy.length !== ACTOR_COUNT + 1) errors.push('E_RESET_BY');
        if (!(world && Array.isArray(world.debugEvents))) errors.push('E_DEBUG_EVENTS');
        if (!world || !Array.isArray(world.actors) || world.actors.length !== ACTOR_COUNT) errors.push('E_ACTORS');
        else {
            for (let i = 0; i < world.actors.length; i += 1) {
                const actor = world.actors[i];
                if (!(actor.excursion instanceof Int32Array) || actor.excursion.length !== SIZE) errors.push('E_EXCURSION_' + actor.id);
                if (!(actor.tickCells instanceof Int32Array) || actor.tickCells.length !== MAX_TICK_CELLS) errors.push('E_TICK_BUFFER_' + actor.id);
            }
        }
        if (world && world.owner) {
            for (let i = 0; i < world.owner.length; i += 1) if (world.owner[i] > ACTOR_COUNT) { errors.push('E_OWNER_RANGE'); break; }
        }
        return { valid: errors.length === 0, errors };
    }

    function encodeRuns(values) {
        const runs = [];
        if (!values || values.length === 0) return runs;
        let value = values[0];
        let count = 1;
        for (let index = 1; index < values.length; index += 1) {
            if (values[index] === value) {
                count += 1;
            } else {
                runs.push([value, count]);
                value = values[index];
                count = 1;
            }
        }
        runs.push([value, count]);
        return runs;
    }

    function buildDebugReport(world, phase) {
        return {
            format: 'heys-color-trail-debug-v1',
            generatedAt: new Date().toISOString(),
            phase,
            algorithm: {
                width: WIDTH,
                height: HEIGHT,
                actorCount: ACTOR_COUNT,
                fixedStep: FIXED_STEP,
                botDecisionStep: BOT_DECISION_STEP,
                roundSeconds: ROUND_SECONDS,
                resetReasons: RESET_REASON_NAMES.slice(),
                cutRule: 'open_trail_cut_then_valid_home_closure_while_victim_exposed',
                selfTrailRule: 'allowed',
                headContactRule: 'pass_through',
            },
            finalState: {
                seed: world.seed,
                rngState: world.rngState,
                time: debugNumber(world.time),
                territoryRevision: world.territoryRevision,
                territory: Array.from(world.territoryCounts),
                actors: world.actors.map((actor) => debugActor(world, actor)),
                ownerRuns: encodeRuns(world.owner),
                trailRuns: encodeRuns(world.trail),
            },
            events: world.debugEvents.slice(),
        };
    }

    function createSmoothTerritorySurface(world) {
        const renderScale = TERRITORY_RENDER_SCALE;
        const surface = document.createElement('canvas');
        surface.width = WIDTH * renderScale;
        surface.height = HEIGHT * renderScale;
        const context = surface.getContext('2d', { alpha: false });
        if (!context) return surface;

        const mask = document.createElement('canvas');
        mask.width = surface.width;
        mask.height = surface.height;
        const maskContext = mask.getContext('2d');
        const smoothed = document.createElement('canvas');
        smoothed.width = surface.width;
        smoothed.height = surface.height;
        const smoothedContext = smoothed.getContext('2d', { willReadFrequently: true });
        if (!maskContext || !smoothedContext) return surface;

        const output = context.createImageData(surface.width, surface.height);
        const background = RGB_COLORS[0];
        for (let offset = 0; offset < output.data.length; offset += 4) {
            output.data[offset] = background[0];
            output.data[offset + 1] = background[1];
            output.data[offset + 2] = background[2];
            output.data[offset + 3] = 255;
        }

        for (let actorId = 1; actorId <= ACTOR_COUNT; actorId += 1) {
            maskContext.clearRect(0, 0, mask.width, mask.height);
            maskContext.fillStyle = '#FFFFFF';
            for (let index = 0; index < SIZE; index += 1) {
                if (world.owner[index] !== actorId) continue;
                const x = index % WIDTH;
                const y = Math.floor(index / WIDTH);
                maskContext.fillRect(x * renderScale, y * renderScale, renderScale, renderScale);
            }
            smoothedContext.clearRect(0, 0, smoothed.width, smoothed.height);
            smoothedContext.filter = 'blur(' + Math.round(renderScale * 0.72) + 'px)';
            smoothedContext.drawImage(mask, 0, 0);
            smoothedContext.filter = 'none';
            const maskPixels = smoothedContext.getImageData(0, 0, smoothed.width, smoothed.height).data;
            const color = RGB_COLORS[actorId];
            for (let offset = 3; offset < maskPixels.length; offset += 4) {
                if (maskPixels[offset] < 128) continue;
                const outputOffset = offset - 3;
                output.data[outputOffset] = color[0];
                output.data[outputOffset + 1] = color[1];
                output.data[outputOffset + 2] = color[2];
            }
        }
        context.putImageData(output, 0, 0);
        return surface;
    }

    function drawSmoothTrail(context, actor, scaleX, scaleY) {
        if (actor.excursionLength <= 0) return;
        const start = Math.max(0, actor.excursionLength - 80);
        const first = actor.excursion[start];
        const firstX = ((first % WIDTH) + 0.5) * scaleX;
        const firstY = (Math.floor(first / WIDTH) + 0.5) * scaleY;
        context.save();
        context.beginPath();
        context.moveTo(firstX, firstY);
        for (let index = start + 1; index < actor.excursionLength; index += 1) {
            const cell = actor.excursion[index];
            const pointX = ((cell % WIDTH) + 0.5) * scaleX;
            const pointY = (Math.floor(cell / WIDTH) + 0.5) * scaleY;
            if (index + 1 < actor.excursionLength) {
                const next = actor.excursion[index + 1];
                const nextX = ((next % WIDTH) + 0.5) * scaleX;
                const nextY = (Math.floor(next / WIDTH) + 0.5) * scaleY;
                context.quadraticCurveTo(pointX, pointY, (pointX + nextX) / 2, (pointY + nextY) / 2);
            } else if (actor.active) {
                context.quadraticCurveTo(pointX, pointY, actor.x * scaleX, actor.y * scaleY);
            } else {
                context.lineTo(pointX, pointY);
            }
        }
        if (actor.active && actor.excursionLength === 1) context.lineTo(actor.x * scaleX, actor.y * scaleY);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
        context.lineWidth = Math.max(4, Math.min(scaleX, scaleY) * 1.18);
        context.stroke();
        context.strokeStyle = COLORS[actor.id];
        context.lineWidth = Math.max(3, Math.min(scaleX, scaleY) * 0.86);
        context.stroke();
        context.restore();
    }

    function drawSnake(context, actor, scaleX, scaleY, time, reducedMotion) {
        if (!actor.active) return;
        const unit = Math.min(scaleX, scaleY);
        const headRadius = Math.max(4, unit * 0.92);
        const headX = actor.x * scaleX;
        const headY = actor.y * scaleY;
        const directionX = Math.cos(actor.direction);
        const directionY = Math.sin(actor.direction);
        const normalX = -directionY;
        const normalY = directionX;
        const motion = clamp(actor.speed / 8, 0, 1);
        const wagPhase = time * (5.4 + motion * 2.2) + actor.id * TAU / ACTOR_COUNT;
        const wag = reducedMotion ? 0 : Math.sin(wagPhase) * motion * (0.28 + motion * 0.42);
        const tailDistance = 3.15 + motion * 0.35;
        const tailX = (actor.x - directionX * tailDistance + normalX * wag) * scaleX;
        const tailY = (actor.y - directionY * tailDistance + normalY * wag) * scaleY;
        const farControlX = (actor.x - directionX * 2.45 + normalX * wag * 0.88) * scaleX;
        const farControlY = (actor.y - directionY * 2.45 + normalY * wag * 0.88) * scaleY;
        const nearControlX = (actor.x - directionX * 0.92 - normalX * wag * 0.1) * scaleX;
        const nearControlY = (actor.y - directionY * 0.92 - normalY * wag * 0.1) * scaleY;

        context.save();
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.bezierCurveTo(farControlX, farControlY, nearControlX, nearControlY, headX, headY);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = Math.max(5, unit * 1.28);
        context.stroke();
        context.strokeStyle = COLORS[actor.id];
        context.lineWidth = Math.max(4, unit * 0.94);
        context.stroke();

        context.translate(headX, headY);
        context.rotate(actor.direction);
        context.fillStyle = COLORS[actor.id];
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = Math.max(1.25, unit * 0.22);
        context.beginPath();
        context.ellipse(0, 0, headRadius * 1.22, headRadius, 0, 0, TAU);
        context.fill();
        context.stroke();

        const eyeRadius = Math.max(1.35, headRadius * 0.22);
        const pupilRadius = Math.max(0.7, eyeRadius * 0.45);
        for (let side = -1; side <= 1; side += 2) {
            const eyeX = headRadius * 0.38;
            const eyeY = side * headRadius * 0.4;
            context.fillStyle = '#FFFFFF';
            context.beginPath();
            context.arc(eyeX, eyeY, eyeRadius, 0, TAU);
            context.fill();
            context.fillStyle = '#252535';
            context.beginPath();
            context.arc(eyeX + eyeRadius * 0.22, eyeY, pupilRadius, 0, TAU);
            context.fill();
        }
        context.restore();
    }

    const api = Object.freeze({
        version: 1,
        createWorld,
        stepWorld,
        closeTrail,
        getTerritoryPercent,
        validateWorld,
    });

    const React = window.React;
    if (!React) {
        PlanningGames.modules['color-trail'] = { Component: function ColorTrailUnavailable() { return null; }, api };
        return;
    }

    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    async function copyText(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand && document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard unavailable');
    }

    function ColorTrailGame(props) {
        const onExit = typeof props?.onExit === 'function' ? props.onExit : function () {};
        const reducedMotion = Boolean(props?.reducedMotion);
        const seedRef = useRef(seedValue(props?.seed));
        const hasStartedRef = useRef(false);
        const worldRef = useRef(createWorld({ seed: seedRef.current }));
        const canvasRef = useRef(null);
        const offscreenRef = useRef(null);
        const observerRef = useRef(null);
        const rafRef = useRef(0);
        const lastFrameRef = useRef(0);
        const accumulatorRef = useRef(0);
        const elapsedRef = useRef(0);
        const lastHudRef = useRef(0);
        const mountedRef = useRef(true);
        const phaseRef = useRef('ready');
        const pointerRef = useRef({ targetX: NaN, targetY: NaN, pointerId: null });
        const [phase, setPhaseState] = useState('ready');
        const [hud, setHud] = useState({ seconds: ROUND_SECONDS, percent: getTerritoryPercent(worldRef.current, 1), notice: '' });
        const [copyStatus, setCopyStatus] = useState('');

        const setPhase = useCallback((next) => {
            phaseRef.current = next;
            setPhaseState(next);
        }, []);

        const resizeCanvas = useCallback(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const width = Math.max(1, Math.round(rect.width * dpr));
            const height = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                offscreenRef.current = null;
            }
        }, []);

        const renderWorld = useCallback(() => {
            const canvas = canvasRef.current;
            const world = worldRef.current;
            if (!canvas) return;
            resizeCanvas();
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) return;
            let cache = offscreenRef.current;
            if (!cache || cache.revision !== world.territoryRevision) {
                const surface = createSmoothTerritorySurface(world);
                cache = { surface, revision: world.territoryRevision };
                offscreenRef.current = cache;
            }
            context.imageSmoothingEnabled = true;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(cache.surface, 0, 0, canvas.width, canvas.height);
            const scaleX = canvas.width / WIDTH;
            const scaleY = canvas.height / HEIGHT;
            for (let id = 1; id <= ACTOR_COUNT; id += 1) {
                const actor = world.actorById[id];
                drawSmoothTrail(context, actor, scaleX, scaleY);
            }
            for (let id = 1; id <= ACTOR_COUNT; id += 1) {
                const actor = world.actorById[id];
                drawSnake(context, actor, scaleX, scaleY, world.time, reducedMotion);
            }
        }, [reducedMotion, resizeCanvas]);

        useEffect(() => {
            mountedRef.current = true;
            const canvas = canvasRef.current;
            if (typeof ResizeObserver === 'function' && canvas) {
                observerRef.current = new ResizeObserver(() => {
                    if (!mountedRef.current) return;
                    resizeCanvas();
                    renderWorld();
                });
                observerRef.current.observe(canvas);
            }
            const onVisibility = () => {
                if (document.hidden && phaseRef.current === 'running') setPhase('paused');
            };
            document.addEventListener('visibilitychange', onVisibility);
            renderWorld();
            return () => {
                mountedRef.current = false;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
                document.removeEventListener('visibilitychange', onVisibility);
                observerRef.current?.disconnect();
                observerRef.current = null;
                const activeCanvas = canvasRef.current;
                const pointerId = pointerRef.current.pointerId;
                if (activeCanvas && pointerId !== null && activeCanvas.hasPointerCapture?.(pointerId)) activeCanvas.releasePointerCapture(pointerId);
                offscreenRef.current = null;
            };
        }, [renderWorld, resizeCanvas, setPhase]);

        useEffect(() => {
            if (phase !== 'running') {
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
                lastFrameRef.current = 0;
                accumulatorRef.current = 0;
                return undefined;
            }
            canvasRef.current?.focus();
            let cancelled = false;
            const frame = (time) => {
                if (cancelled || !mountedRef.current || phaseRef.current !== 'running') return;
                if (!lastFrameRef.current) lastFrameRef.current = time;
                const delta = Math.min((time - lastFrameRef.current) / 1000, 0.1);
                lastFrameRef.current = time;
                accumulatorRef.current += delta;
                let steps = 0;
                while (accumulatorRef.current >= FIXED_STEP && steps < 3) {
                    stepWorld(worldRef.current, pointerRef.current, FIXED_STEP);
                    accumulatorRef.current -= FIXED_STEP;
                    elapsedRef.current += FIXED_STEP;
                    steps += 1;
                }
                if (steps === 3 && accumulatorRef.current >= FIXED_STEP) accumulatorRef.current = 0;
                renderWorld();
                if (elapsedRef.current >= ROUND_SECONDS) {
                    setHud({ seconds: 0, percent: getTerritoryPercent(worldRef.current, 1), notice: '' });
                    setPhase('result');
                    return;
                }
                if (time - lastHudRef.current >= 250) {
                    lastHudRef.current = time;
                    setHud({
                        seconds: Math.max(0, Math.ceil(ROUND_SECONDS - elapsedRef.current)),
                        percent: getTerritoryPercent(worldRef.current, 1),
                        notice: worldRef.current.lastReset[1] ? 'След прерван' : '',
                    });
                }
                rafRef.current = requestAnimationFrame(frame);
            };
            rafRef.current = requestAnimationFrame(frame);
            return () => {
                cancelled = true;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            };
        }, [phase, renderWorld, setPhase]);

        const startRound = useCallback(() => {
            if (hasStartedRef.current) seedRef.current = (seedRef.current + 1) >>> 0 || 1;
            hasStartedRef.current = true;
            worldRef.current = createWorld({ seed: seedRef.current });
            elapsedRef.current = 0;
            lastFrameRef.current = 0;
            accumulatorRef.current = 0;
            offscreenRef.current = null;
            pointerRef.current.targetX = NaN;
            pointerRef.current.targetY = NaN;
            pointerRef.current.directionX = NaN;
            pointerRef.current.directionY = NaN;
            setCopyStatus('');
            setHud({ seconds: ROUND_SECONDS, percent: getTerritoryPercent(worldRef.current, 1), notice: '' });
            setPhase('running');
        }, [setPhase]);

        const copyDebugLog = useCallback(async () => {
            const report = buildDebugReport(worldRef.current, phaseRef.current);
            try {
                await copyText(JSON.stringify(report, null, 2));
                if (mountedRef.current) setCopyStatus('copied');
            } catch (error) {
                recordDebug(worldRef.current, 'copy_failed', { message: String(error?.message || error) });
                if (mountedRef.current) setCopyStatus('error');
            }
        }, []);

        const continueRound = useCallback(() => {
            lastFrameRef.current = 0;
            accumulatorRef.current = 0;
            setPhase('running');
        }, [setPhase]);

        const pointerTarget = useCallback((event) => {
            const canvas = canvasRef.current;
            if (!canvas || phaseRef.current !== 'running') return;
            const rect = canvas.getBoundingClientRect();
            pointerRef.current.targetX = ((event.clientX - rect.left) / rect.width) * WIDTH;
            pointerRef.current.targetY = ((event.clientY - rect.top) / rect.height) * HEIGHT;
            pointerRef.current.directionX = NaN;
            pointerRef.current.directionY = NaN;
        }, []);

        const onPointerDown = useCallback((event) => {
            if (phaseRef.current !== 'running') return;
            pointerRef.current.pointerId = event.pointerId;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            pointerTarget(event);
            event.currentTarget.focus();
        }, [pointerTarget]);

        const releasePointer = useCallback((event) => {
            const canvas = event.currentTarget;
            if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            if (pointerRef.current.pointerId === event.pointerId) pointerRef.current.pointerId = null;
        }, []);

        const onKeyDown = useCallback((event) => {
            if (phaseRef.current !== 'running') return;
            const directions = {
                ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
                ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
                ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
                ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
            };
            const direction = directions[event.key];
            if (!direction) return;
            event.preventDefault();
            pointerRef.current.directionX = direction[0];
            pointerRef.current.directionY = direction[1];
            pointerRef.current.targetX = NaN;
            pointerRef.current.targetY = NaN;
        }, []);

        const overlay = phase === 'ready'
            ? h('div', { className: 'planning-color-trail__overlay' },
                h('p', null, 'Веди цветной след и возвращайся на свою территорию, чтобы замкнуть контур.'),
                h('button', { type: 'button', className: 'planning-color-trail__primary', onClick: startRound }, 'Начать'))
            : phase === 'paused'
                ? h('div', { className: 'planning-color-trail__overlay' },
                    h('p', null, 'Игра на паузе.'),
                    h('button', { type: 'button', className: 'planning-color-trail__primary', onClick: continueRound }, 'Продолжить'))
                : phase === 'result'
                    ? h('div', { className: 'planning-color-trail__overlay' },
                        h('p', null, 'Твоя территория'),
                        h('strong', { className: 'planning-color-trail__result' }, hud.percent.toFixed(1) + '%'),
                        h('button', { type: 'button', className: 'planning-color-trail__primary', onClick: startRound }, 'Сыграть ещё'),
                        h('button', { type: 'button', className: 'planning-color-trail__quiet', onClick: onExit }, 'Выйти'))
                    : null;

        return h('section', {
            className: 'planning-color-trail' + (reducedMotion ? ' planning-color-trail--reduced-motion' : ''),
            'data-game-phase': phase,
        },
        h('header', { className: 'planning-color-trail__header' },
            h('div', null,
                h('span', { className: 'planning-color-trail__eyebrow' }, 'Аркада'),
                h('h2', null, 'Цветной след')),
            h('div', { className: 'planning-color-trail__hud', 'aria-live': 'polite' },
                h('span', null, hud.seconds + ' сек'),
                h('span', null, hud.percent.toFixed(1) + '%')),
            phase === 'running' && h('button', { type: 'button', className: 'planning-color-trail__pause', onClick: () => setPhase('paused') }, 'Пауза')),
        h('div', { className: 'planning-color-trail__stage' },
            h('canvas', {
                ref: canvasRef,
                className: 'planning-color-trail__canvas',
                tabIndex: 0,
                'aria-label': 'Поле игры «Цветной след». Управляй стрелками, WASD, мышью или пальцем.',
                onPointerDown,
                onPointerMove: pointerTarget,
                onPointerUp: releasePointer,
                onPointerCancel: releasePointer,
                onLostPointerCapture: releasePointer,
                onKeyDown,
            }),
            overlay),
        h('div', { className: 'planning-color-trail__diagnostics' },
            h('button', {
                type: 'button',
                className: 'planning-color-trail__copy',
                onClick: copyDebugLog,
            }, copyStatus === 'copied' ? 'Лог скопирован' : 'Скопировать лог'),
            h('span', { role: 'status', 'aria-live': 'polite' }, copyStatus === 'error' ? 'Не удалось скопировать лог' : '')),
        hud.notice && h('p', { className: 'planning-color-trail__notice', role: 'status' }, hud.notice));
    }

    PlanningGames.modules['color-trail'] = { Component: ColorTrailGame, api };
})();
