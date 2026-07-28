import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_game_color_trail_v1.js'), 'utf8');
const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalResizeObserver = window.ResizeObserver;
const originalCanvasContext = HTMLCanvasElement.prototype.getContext;
const originalPointerCapture = HTMLCanvasElement.prototype.setPointerCapture;
const originalPointerRelease = HTMLCanvasElement.prototype.releasePointerCapture;
const originalPointerHasCapture = HTMLCanvasElement.prototype.hasPointerCapture;
const originalClipboard = navigator.clipboard;

function restoreClipboard() {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
}

function loadModule(withReact = false) {
    window.HEYS = {};
    window.React = withReact ? React : undefined;
    (0, eval)(source);
    return window.HEYS.PlanningGames.modules['color-trail'];
}

function deactivateBots(world) {
    for (let id = 2; id <= 4; id += 1) {
        world.actorById[id].active = false;
        world.actorById[id].respawnUntil = Number.POSITIVE_INFINITY;
    }
}

function emptyWorld(api, seed = 1) {
    const world = api.createWorld({ seed });
    world.owner.fill(0);
    world.trail.fill(0);
    world.territoryCounts.fill(0);
    deactivateBots(world);
    return world;
}

function setExcursion(world, actorId, cells) {
    const actor = world.actorById[actorId];
    actor.excursionLength = cells.length;
    cells.forEach((index, position) => {
        actor.excursion[position] = index;
        world.trail[index] = actorId;
    });
}

function index(x, y) {
    return y * 64 + x;
}

function addRing(world, actorId, left, top, right, bottom, trailSide = false) {
    const trailCells = [];
    for (let x = left; x <= right; x += 1) {
        if (trailSide && x > left && x < right) trailCells.push(index(x, top));
        else world.owner[index(x, top)] = actorId;
        world.owner[index(x, bottom)] = actorId;
    }
    for (let y = top + 1; y < bottom; y += 1) {
        world.owner[index(left, y)] = actorId;
        world.owner[index(right, y)] = actorId;
    }
    return trailCells;
}

function territoryComponentSizes(world, actorId) {
    const visited = new Uint8Array(world.owner.length);
    const sizes = [];
    for (let start = 0; start < world.owner.length; start += 1) {
        if (visited[start] || world.owner[start] !== actorId) continue;
        const queue = [start];
        visited[start] = 1;
        let size = 0;
        for (let head = 0; head < queue.length; head += 1) {
            const cell = queue[head];
            const x = cell % 64;
            const y = Math.floor(cell / 64);
            size += 1;
            for (let oy = -1; oy <= 1; oy += 1) {
                for (let ox = -1; ox <= 1; ox += 1) {
                    const nextX = x + ox;
                    const nextY = y + oy;
                    if ((ox === 0 && oy === 0) || nextX < 0 || nextX >= 64 || nextY < 0 || nextY >= 96) continue;
                    const next = index(nextX, nextY);
                    if (!visited[next] && world.owner[next] === actorId) { visited[next] = 1; queue.push(next); }
                }
            }
        }
        sizes.push(size);
    }
    return sizes.sort((a, b) => b - a);
}

function snapshot(world) {
    return {
        owner: Array.from(world.owner),
        trail: Array.from(world.trail),
        actors: [1, 2, 3, 4].map((id) => {
            const actor = world.actorById[id];
            return [actor.x, actor.y, actor.direction, actor.active, actor.excursionLength, actor.botState];
        }),
        rngState: world.rngState,
    };
}

describe('Color Trail pure engine', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ResizeObserver = originalResizeObserver;
        HTMLCanvasElement.prototype.getContext = originalCanvasContext;
        HTMLCanvasElement.prototype.setPointerCapture = originalPointerCapture;
        HTMLCanvasElement.prototype.releasePointerCapture = originalPointerRelease;
        HTMLCanvasElement.prototype.hasPointerCapture = originalPointerHasCapture;
        restoreClipboard();
    });

    it('registers the frozen runtime API without starting browser work', () => {
        const raf = vi.spyOn(window, 'requestAnimationFrame');
        const listener = vi.spyOn(document, 'addEventListener');
        const { api, Component } = loadModule(false);

        expect(Component).toBeTypeOf('function');
        expect(api.version).toBe(1);
        expect(Object.keys(api)).toEqual(['version', 'createWorld', 'stepWorld', 'closeTrail', 'getTerritoryPercent', 'validateWorld']);
        expect(raf).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
        expect(source).not.toMatch(/localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|setInterval/);
    });

    it('creates deterministic typed-array worlds with four non-overlapping spawn cores', () => {
        const { api } = loadModule();
        const first = api.createWorld({ seed: 73 });
        const second = api.createWorld({ seed: 73 });

        expect(api.validateWorld(first)).toEqual({ valid: true, errors: [] });
        expect(first.owner).toBeInstanceOf(Uint8Array);
        expect(first.trail).toBeInstanceOf(Uint8Array);
        expect(first.visited).toBeInstanceOf(Uint8Array);
        expect(first.newTrailMask).toBeInstanceOf(Uint8Array);
        expect(first.queue).toBeInstanceOf(Int32Array);
        expect(first.resetReasons).toBeInstanceOf(Uint8Array);
        expect(first.resetBy).toBeInstanceOf(Uint8Array);
        expect(first.debugEvents[0]).toMatchObject({ type: 'round_start', seed: 73 });
        expect(first.owner).toHaveLength(6144);
        expect(first.actors).toHaveLength(4);
        expect(first.actors.slice(1)).toHaveLength(3);
        first.actors.slice(1).forEach((bot) => {
            expect(bot.speed).toBeGreaterThanOrEqual(8 * 0.85);
            expect(bot.speed).toBeLessThanOrEqual(8 * 0.95);
        });
        first.actors.forEach((actor) => {
            expect(actor.excursion).toBeInstanceOf(Int32Array);
            expect(actor.excursion).toHaveLength(6144);
            expect(actor.tickCells).toBeInstanceOf(Int32Array);
        });
        expect(Array.from(first.owner)).toEqual(Array.from(second.owner));
        expect(first.actors.map((actor) => actor.speed)).toEqual(second.actors.map((actor) => actor.speed));
        expect([1, 2, 3, 4].map((id) => first.owner.filter((value) => value === id).length)).toEqual([25, 25, 25, 25]);
    });

    it('uses swept cells and makes a foreign-trail cut pending until the attacker closes at home', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        const player = world.actorById[1];
        player.x = 10.2;
        player.y = 20.2;
        player.direction = 0;
        player.desiredDirection = 0;
        player.speed = 30;
        api.stepWorld(world, { directionX: 1, directionY: 0 }, 0.2);

        for (let x = 11; x <= 16; x += 1) expect(world.trail[index(x, 20)]).toBe(1);

        const attackWorld = emptyWorld(api);
        const attacker = attackWorld.actorById[1];
        attacker.x = 10.2;
        attacker.y = 20.2;
        attacker.direction = 0;
        attacker.desiredDirection = 0;
        attacker.speed = 30;
        attackWorld.actorById[2].active = true;
        attackWorld.actorById[2].respawnUntil = 0;
        attackWorld.actorById[2].speed = 0;
        attackWorld.owner[index(7, 7)] = 2;
        attackWorld.territoryCounts[2] = 1;
        attackWorld.trail[index(13, 20)] = 2;
        attackWorld.actorById[2].excursion[0] = index(13, 20);
        attackWorld.actorById[2].excursionLength = 1;
        api.stepWorld(attackWorld, { directionX: 1, directionY: 0 }, 0.2);

        expect(attackWorld.lastReset[2]).toBe(0);
        expect(attackWorld.actorById[2].active).toBe(true);
        expect(attackWorld.actorById[1].pendingCutMask & (1 << 2)).toBeTruthy();
        expect(attackWorld.actorById[1].active).toBe(true);
        expect(attackWorld.actorById[1].x).toBeGreaterThan(15);

        attackWorld.trail.fill(0);
        attackWorld.actorById[1].excursionLength = 0;
        attackWorld.trail[index(13, 20)] = 2;
        const closingTrail = addRing(attackWorld, 1, 20, 20, 24, 24, true);
        setExcursion(attackWorld, 1, closingTrail);
        expect(api.closeTrail(attackWorld, 1).valid).toBe(true);
        expect(attackWorld.actorById[2].active).toBe(false);
        expect(attackWorld.owner[index(7, 7)]).toBe(0);
        expect(attackWorld.debugEvents).toContainEqual(expect.objectContaining({
            type: 'reset', actorId: 2, reason: 'cut_closed', byActorId: 1,
        }));
    });

    it('rejects a short non-enclosing return and captures only a newly enclosed component', () => {
        const { api } = loadModule();
        const invalid = emptyWorld(api);
        invalid.owner[index(10, 10)] = 1;
        setExcursion(invalid, 1, [index(11, 10), index(12, 10)]);
        const before = Array.from(invalid.owner);
        expect(api.closeTrail(invalid, 1)).toEqual({ captured: 0, valid: false });
        expect(Array.from(invalid.owner)).toEqual(before);
        expect(invalid.trail[index(11, 10)]).toBe(0);

        const valid = emptyWorld(api);
        const activeTrail = addRing(valid, 1, 20, 20, 24, 24, true);
        setExcursion(valid, 1, activeTrail);
        const result = api.closeTrail(valid, 1);
        expect(result.valid).toBe(true);
        expect(result.captured).toBe(9);
        expect(valid.owner[index(22, 22)]).toBe(1);
        expect(activeTrail.every((cell) => valid.owner[cell] === 1 && valid.trail[cell] === 0)).toBe(true);
    });

    it('does not capture an unrelated old hole and protects a component containing a live rival', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        addRing(world, 1, 4, 4, 8, 8, false);
        const activeTrail = addRing(world, 1, 20, 20, 24, 24, true);
        setExcursion(world, 1, activeTrail);
        api.closeTrail(world, 1);
        expect(world.owner[index(6, 6)]).toBe(0);
        expect(world.owner[index(22, 22)]).toBe(1);

        const protectedWorld = emptyWorld(api);
        const protectedTrail = addRing(protectedWorld, 1, 20, 20, 24, 24, true);
        setExcursion(protectedWorld, 1, protectedTrail);
        const rival = protectedWorld.actorById[2];
        rival.active = true;
        rival.x = 22.5;
        rival.y = 22.5;
        rival.respawnUntil = 0;
        expect(api.closeTrail(protectedWorld, 1)).toEqual({ captured: 0, valid: false });
        expect(protectedWorld.owner[index(22, 22)]).toBe(0);
    });

    it('treats foreign territory as traversable and can recolor a truly enclosed piece', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        const activeTrail = addRing(world, 1, 20, 20, 24, 24, true);
        world.owner[index(22, 22)] = 2;
        setExcursion(world, 1, activeTrail);

        const result = api.closeTrail(world, 1);
        expect(result.valid).toBe(true);
        expect(world.owner[index(22, 22)]).toBe(1);
    });

    it('removes the rival territory island detached from its last home anchor', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        const rival = world.actorById[2];
        rival.active = true;
        rival.respawnUntil = 0;
        rival.x = 14.5;
        rival.y = 22.5;
        rival.territoryAnchorCell = index(14, 22);
        for (let y = 21; y <= 23; y += 1) {
            for (let x = 10; x <= 30; x += 1) world.owner[index(x, y)] = 2;
        }
        const cuttingLoop = addRing(world, 1, 18, 19, 22, 25, true);
        setExcursion(world, 1, cuttingLoop);

        expect(api.closeTrail(world, 1).valid).toBe(true);
        expect(world.owner[index(14, 22)]).toBe(2);
        expect(world.owner[index(26, 22)]).toBe(0);
        expect(territoryComponentSizes(world, 2)).toHaveLength(1);
        expect(world.debugEvents).toContainEqual(expect.objectContaining({
            type: 'trail_closed',
            actorId: 1,
            detachedTerritoryRemoved: expect.arrayContaining([expect.any(Number)]),
        }));
        const closure = world.debugEvents.findLast((event) => event.type === 'trail_closed');
        expect(closure.detachedTerritoryRemoved[2]).toBeGreaterThan(0);
    });

    it('keeps every territory as at most one connected component during a full seeded round', () => {
        const { api } = loadModule();
        const world = api.createWorld({ seed: 1 });
        for (let tick = 0; tick < 2700; tick += 1) {
            const angle = tick / 180;
            api.stepWorld(world, { directionX: Math.cos(angle), directionY: Math.sin(angle) }, 1 / 30);
        }
        for (let actorId = 1; actorId <= 4; actorId += 1) {
            expect(territoryComponentSizes(world, actorId).length).toBeLessThanOrEqual(1);
        }
    });

    it('does not defeat a cut rival that returns home first and allows crossing your own trail', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        const attacker = world.actorById[2];
        attacker.active = true;
        attacker.x = 10.2;
        attacker.y = 20.2;
        attacker.direction = 0;
        attacker.desiredDirection = 0;
        attacker.speed = 30;
        world.owner[index(7, 7)] = 1;
        world.territoryCounts[1] = 1;
        world.trail[index(13, 20)] = 1;
        world.actorById[1].excursion[0] = index(13, 20);
        world.actorById[1].excursionLength = 1;
        api.stepWorld(world, null, 0.05);
        api.stepWorld(world, null, 0.2);
        expect(world.lastReset[1]).toBe(0);
        expect(attacker.active).toBe(true);
        expect(world.owner[index(7, 7)]).toBe(1);
        expect(attacker.pendingCutMask & (1 << 1)).toBeTruthy();

        world.owner[index(12, 20)] = 1;
        const safeTrail = [index(11, 20)];
        world.trail.fill(0);
        setExcursion(world, 1, safeTrail);
        expect(api.closeTrail(world, 1).valid).toBe(false);
        expect(attacker.pendingCutMask & (1 << 1)).toBeFalsy();

        const selfWorld = emptyWorld(api);
        const player = selfWorld.actorById[1];
        player.x = 10.2;
        player.y = 20.2;
        player.direction = 0;
        player.desiredDirection = 0;
        player.speed = 30;
        selfWorld.trail[index(13, 20)] = 1;
        player.excursion[0] = index(13, 20);
        player.excursionLength = 1;
        api.stepWorld(selfWorld, { directionX: 1, directionY: 0 }, 0.2);
        expect(selfWorld.lastReset[1]).toBe(0);
        expect(player.active).toBe(true);
        expect(selfWorld.debugEvents.some((event) => event.type === 'reset')).toBe(false);
    });

    it('lets heads pass through without a hidden reset and is independent of actors array order', () => {
        const { api } = loadModule();
        const headWorld = emptyWorld(api);
        const first = headWorld.actorById[1];
        const second = headWorld.actorById[2];
        second.active = true;
        first.x = 20.5;
        first.y = 30.5;
        first.direction = 0;
        first.desiredDirection = 0;
        first.speed = 20;
        second.x = 22.5;
        second.y = 30.5;
        second.direction = Math.PI;
        second.desiredDirection = Math.PI;
        second.speed = 20;
        api.stepWorld(headWorld, { directionX: 1, directionY: 0 }, 0.05);
        expect(Array.from(headWorld.lastReset.slice(1, 3))).toEqual([0, 0]);
        expect(first.active).toBe(true);
        expect(second.active).toBe(true);

        const normal = api.createWorld({ seed: 181 });
        const reversed = api.createWorld({ seed: 181 });
        reversed.actors.reverse();
        for (let tick = 0; tick < 80; tick += 1) {
            api.stepWorld(normal, { directionX: 1, directionY: 0 }, 1 / 30);
            api.stepWorld(reversed, { directionX: 1, directionY: 0 }, 1 / 30);
        }
        expect(snapshot(reversed)).toEqual(snapshot(normal));
    });

    it('commits simultaneous closures in stable actor-id order without ambiguous ownership', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        const firstTrail = addRing(world, 1, 20, 20, 24, 24, true);
        const secondTrail = addRing(world, 2, 40, 20, 44, 24, true);
        setExcursion(world, 1, firstTrail);
        setExcursion(world, 2, secondTrail);
        const first = world.actorById[1];
        const second = world.actorById[2];
        second.active = true;
        first.x = 23.5;
        first.y = 20.5;
        first.direction = 0;
        first.desiredDirection = 0;
        first.speed = 20;
        second.x = 43.5;
        second.y = 20.5;
        second.direction = 0;
        second.desiredDirection = 0;
        second.speed = 20;

        api.stepWorld(world, { directionX: 1, directionY: 0 }, 0.05);

        expect(world.owner[index(22, 22)]).toBe(1);
        expect(world.owner[index(42, 22)]).toBe(2);
        expect(world.owner.every((ownerId) => ownerId >= 0 && ownerId <= 4)).toBe(true);
    });

    it('turns defeated territory neutral and respawns the same snake with a new core elsewhere', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        world.owner[index(7, 7)] = 1;
        world.territoryCounts[1] = 1;
        const actor = world.actorById[1];
        const attacker = world.actorById[2];
        attacker.active = true;
        attacker.respawnUntil = 0;
        attacker.pendingCutMask = 1 << 1;
        const closingTrail = addRing(world, 2, 20, 20, 24, 24, true);
        setExcursion(world, 2, closingTrail);
        actor.excursion[0] = index(12, 12);
        actor.excursionLength = 1;
        world.trail[index(12, 12)] = 1;
        const deathX = actor.x;
        const deathY = actor.y;
        expect(api.closeTrail(world, 2).valid).toBe(true);
        expect(world.owner[index(7, 7)]).toBe(0);
        expect(world.territoryCounts[1]).toBe(0);
        expect(actor.active).toBe(false);
        expect(api.getTerritoryPercent(world, 1)).toBeGreaterThanOrEqual(0);
        expect(api.getTerritoryPercent(world, 1)).toBeLessThanOrEqual(100);

        api.stepWorld(world, null, 0.8);
        expect(world.owner.some((value) => value === 1)).toBe(true);
        expect(actor.active).toBe(true);
        expect((actor.x - deathX) ** 2 + (actor.y - deathY) ** 2).toBeGreaterThanOrEqual(100);
        expect(world.actors.filter((candidate) => candidate.active)).toHaveLength(2);
    });
});

describe('Color Trail component lifecycle', () => {
    let rafCallbacks;
    let observerDisconnect;
    let snakeBezierCurveTo;

    beforeEach(() => {
        rafCallbacks = new Map();
        let rafId = 0;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
            rafId += 1;
            rafCallbacks.set(rafId, callback);
            return rafId;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => rafCallbacks.delete(id)));
        observerDisconnect = vi.fn();
        snakeBezierCurveTo = vi.fn();
        window.ResizeObserver = class ResizeObserver {
            observe() {}
            disconnect() { observerDisconnect(); }
        };
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
            createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
            getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
            putImageData: vi.fn(),
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            quadraticCurveTo: vi.fn(),
            bezierCurveTo: snakeBezierCurveTo,
            rect: vi.fn(),
            arc: vi.fn(),
            ellipse: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            rotate: vi.fn(),
        }));
        HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
        HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
        HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ResizeObserver = originalResizeObserver;
        HTMLCanvasElement.prototype.getContext = originalCanvasContext;
        HTMLCanvasElement.prototype.setPointerCapture = originalPointerCapture;
        HTMLCanvasElement.prototype.releasePointerCapture = originalPointerRelease;
        HTMLCanvasElement.prototype.hasPointerCapture = originalPointerHasCapture;
        restoreClipboard();
    });

    it('does not run before Start, pauses visibly, keeps pointer course and scopes keyboard to canvas', () => {
        const { Component } = loadModule(true);
        render(React.createElement(Component, { onExit: vi.fn(), reducedMotion: true, seed: 9 }));
        expect(screen.getByRole('button', { name: 'Начать' })).toBeTruthy();
        expect(requestAnimationFrame).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
        expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
        expect(requestAnimationFrame).toHaveBeenCalled();
        const canvas = screen.getByLabelText(/Поле игры/);
        fireEvent.pointerDown(canvas, { pointerId: 4, clientX: 20, clientY: 30 });
        fireEvent.pointerUp(canvas, { pointerId: 4, clientX: 20, clientY: 30 });
        fireEvent.keyDown(canvas, { key: 'ArrowRight' });

        fireEvent.click(screen.getByRole('button', { name: 'Пауза' }));
        expect(screen.getByRole('button', { name: 'Продолжить' })).toBeTruthy();
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('uses a smooth cached territory layer and snake-shaped heads without changing the engine', () => {
        const { Component } = loadModule(true);
        render(React.createElement(Component, { onExit: vi.fn(), reducedMotion: true, seed: 15 }));

        expect(source).toContain('TERRITORY_RENDER_SCALE = 6');
        expect(source).toContain('context.imageSmoothingEnabled = true');
        expect(source).toContain("smoothedContext.filter = 'blur('");
        expect(source).toContain('smoothedContext.getImageData');
        expect(source).toContain('context.quadraticCurveTo');
        expect(source).toContain('context.bezierCurveTo');
        expect(source).toContain('context.ellipse');
        expect(source).toContain("context.lineCap = 'round'");
        expect(source).toContain('actor.id * TAU / ACTOR_COUNT');
        expect(source).toContain('const wag = reducedMotion ? 0 : Math.sin(wagPhase)');
        expect(source).toContain('drawSnake(context, actor, scaleX, scaleY, world.time, reducedMotion)');
    });

    it('renders phased tail wagging and removes the bend for reduced motion', () => {
        const { Component } = loadModule(true);
        const animated = render(React.createElement(Component, { onExit: vi.fn(), reducedMotion: false, seed: 15 }));
        expect(snakeBezierCurveTo).toHaveBeenCalledTimes(4);
        const animatedTail = snakeBezierCurveTo.mock.calls[0].slice();

        animated.unmount();
        snakeBezierCurveTo.mockClear();
        render(React.createElement(Component, { onExit: vi.fn(), reducedMotion: true, seed: 15 }));
        expect(snakeBezierCurveTo).toHaveBeenCalledTimes(4);
        const reducedTail = snakeBezierCurveTo.mock.calls[0];

        expect(animatedTail.slice(4)).toEqual(reducedTail.slice(4));
        expect(animatedTail.slice(0, 4)).not.toEqual(reducedTail.slice(0, 4));
    });

    it('copies a self-contained in-memory physics log without storage or network', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        const { Component } = loadModule(true);
        render(React.createElement(Component, { onExit: vi.fn(), reducedMotion: true, seed: 91 }));

        fireEvent.click(screen.getByRole('button', { name: 'Скопировать лог' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const report = JSON.parse(writeText.mock.calls[0][0]);
        expect(report).toMatchObject({
            format: 'heys-color-trail-debug-v1',
            phase: 'ready',
            algorithm: { actorCount: 4, cutRule: 'open_trail_cut_then_valid_home_closure_while_victim_exposed' },
            finalState: { seed: 91 },
        });
        expect(report.events[0]).toMatchObject({ type: 'round_start', seed: 91 });
        expect(report.finalState.ownerRuns.length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Лог скопирован' })).toBeTruthy();
    });

    it('pauses on hidden without auto-resume and cleans RAF, visibility listener and observer on unmount', () => {
        const add = vi.spyOn(document, 'addEventListener');
        const remove = vi.spyOn(document, 'removeEventListener');
        const { Component } = loadModule(true);
        const view = render(React.createElement(Component, { onExit: vi.fn(), reducedMotion: false, seed: 11 }));
        fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

        const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        fireEvent(document, new Event('visibilitychange'));
        expect(screen.getByRole('button', { name: 'Продолжить' })).toBeTruthy();
        Object.defineProperty(document, 'hidden', hiddenDescriptor || { configurable: true, value: false });

        view.unmount();
        expect(cancelAnimationFrame).toHaveBeenCalled();
        expect(observerDisconnect).toHaveBeenCalledTimes(1);
        expect(add).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
});
