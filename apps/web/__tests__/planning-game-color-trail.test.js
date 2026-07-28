import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_game_color_trail_v1.js'), 'utf8');
const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalResizeObserver = window.ResizeObserver;
const originalCanvasContext = HTMLCanvasElement.prototype.getContext;
const originalPointerCapture = HTMLCanvasElement.prototype.setPointerCapture;
const originalPointerRelease = HTMLCanvasElement.prototype.releasePointerCapture;
const originalPointerHasCapture = HTMLCanvasElement.prototype.hasPointerCapture;

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

    it('uses swept cells to create a continuous trail and cannot jump across a foreign trail', () => {
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
        attackWorld.actorById[2].active = false;
        attackWorld.actorById[2].respawnUntil = Number.POSITIVE_INFINITY;
        attackWorld.trail[index(13, 20)] = 2;
        attackWorld.actorById[2].excursion[0] = index(13, 20);
        attackWorld.actorById[2].excursionLength = 1;
        api.stepWorld(attackWorld, { directionX: 1, directionY: 0 }, 0.2);

        expect(attackWorld.lastReset[2]).toBe(1);
        expect(attackWorld.actorById[1].active).toBe(true);
        expect(attackWorld.actorById[1].x).toBeGreaterThan(15);
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

    it('resets the vulnerable trail owner while the attacker keeps moving, and self-crossing resets itself', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        const attacker = world.actorById[2];
        attacker.active = true;
        attacker.x = 10.2;
        attacker.y = 20.2;
        attacker.direction = 0;
        attacker.desiredDirection = 0;
        attacker.speed = 30;
        world.trail[index(13, 20)] = 1;
        world.actorById[1].excursion[0] = index(13, 20);
        world.actorById[1].excursionLength = 1;
        api.stepWorld(world, null, 0.05);
        api.stepWorld(world, null, 0.2);
        expect(world.lastReset[1]).toBe(1);
        expect(attacker.active).toBe(true);

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
        expect(selfWorld.lastReset[1]).toBe(1);
        expect(player.active).toBe(false);
    });

    it('resets both actors on simultaneous head-to-head and is independent of actors array order', () => {
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
        expect(Array.from(headWorld.lastReset.slice(1, 3))).toEqual([1, 1]);

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

    it('keeps territory after reset, recreates a core when none remains and clamps percent to 0–100', () => {
        const { api } = loadModule();
        const world = emptyWorld(api);
        world.owner[index(7, 7)] = 1;
        world.trail[index(12, 12)] = 1;
        const actor = world.actorById[1];
        actor.excursion[0] = index(12, 12);
        actor.excursionLength = 1;
        actor.x = 11.2;
        actor.y = 12.2;
        actor.direction = 0;
        actor.desiredDirection = 0;
        actor.speed = 30;
        api.stepWorld(world, { directionX: 1, directionY: 0 }, 0.1);
        expect(world.owner[index(7, 7)]).toBe(1);
        expect(api.getTerritoryPercent(world, 1)).toBeGreaterThanOrEqual(0);
        expect(api.getTerritoryPercent(world, 1)).toBeLessThanOrEqual(100);

        world.owner.fill(0);
        actor.active = false;
        actor.respawnUntil = world.time;
        api.stepWorld(world, null, 1 / 30);
        expect(world.owner.some((value) => value === 1)).toBe(true);
        expect(actor.active).toBe(true);
    });
});

describe('Color Trail component lifecycle', () => {
    let rafCallbacks;
    let observerDisconnect;

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
        window.ResizeObserver = class ResizeObserver {
            observe() {}
            disconnect() { observerDisconnect(); }
        };
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
            createImageData: () => ({ data: new Uint8ClampedArray(64 * 96 * 4) }),
            putImageData: vi.fn(),
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
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
