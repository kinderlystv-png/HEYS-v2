const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { mergeDayData } = require('../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');

function sameDayContent(left, right) {
  const stripMeta = (value) => JSON.parse(JSON.stringify(value || {}, (key, item) => {
    if (key === 'updatedAt' || key === '_mergedAt' || key === '_sourceId') return undefined;
    return item;
  }));
  return JSON.stringify(stripMeta(left)) === JSON.stringify(stripMeta(right));
}

function resolve(guard, current, incoming) {
  return guard.resolveExternalReplacement(current, incoming, {
    mergeDayData: (local, remote) => mergeDayData(local, remote, { forceKeepAll: true }),
    isSameContent: sameDayContent,
  });
}

function loadGuard() {
  const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_mutation_guard_v1.js'), 'utf8');
  const storage = {};
  const context = {
    console: { ...console, info: () => {} },
    Date,
    JSON,
    Set,
    globalThis: null,
    window: null,
    sessionStorage: {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key, value) => { storage[key] = String(value); },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'heys_day_mutation_guard_v1.js' });
  return context.HEYS.dayMutationGuard;
}

function loadDayEffects(heys, registeredEffects, storage, eventListeners = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_effects.js'), 'utf8');
  const context = {
    console: { ...console, info: () => {}, warn: () => {} },
    Date,
    JSON,
    Map,
    Set,
    CustomEvent,
    document: { visibilityState: 'visible' },
    localStorage: {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key, value) => { storage[key] = String(value); },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    addEventListener: (type, listener) => { eventListeners[type] = listener; },
    removeEventListener: (type, listener) => {
      if (eventListeners[type] === listener) delete eventListeners[type];
    },
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    HEYS: heys,
    React: {
      useEffect: (effect) => { registeredEffects.push(effect); },
      useRef: (value) => ({ current: value }),
      startTransition: (callback) => callback(),
    },
    globalThis: null,
    window: null,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'heys_day_effects.js' });
  return context.HEYS.dayEffects;
}

describe('day mutation guard', () => {
  it('detects stale snapshots that miss protected added ids', () => {
    const guard = loadGuard();
    const payload = guard.write('2026-07-09', {
      action: 'copy_to_new_cross_day',
      expectedMealIds: ['m_new'],
      expectedItemIds: ['it_new'],
      expectedMinMeals: 2,
      expectedMinItems: 2,
    });

    const stale = { date: '2026-07-09', meals: [{ id: 'm_old', items: [{ id: 'it_old' }] }] };
    const fresh = {
      date: '2026-07-09',
      meals: [
        { id: 'm_old', items: [{ id: 'it_old' }] },
        { id: 'm_new', items: [{ id: 'it_new' }] },
      ],
    };

    expect(guard.breaksGuard(stale, payload)).toBe(true);
    expect(guard.breaksGuard(fresh, payload)).toBe(false);
  });

  it('merges scalar side fields into fresh protected day instead of replacing meals', () => {
    const guard = loadGuard();
    guard.write('2026-07-09', {
      action: 'copy_to_new_cross_day',
      expectedMealIds: ['m_new'],
      expectedItemIds: ['it_new'],
      expectedMinMeals: 2,
      expectedMinItems: 2,
    });

    const candidate = {
      date: '2026-07-09',
      meals: [{ id: 'm_old', items: [{ id: 'it_old' }] }],
      supplementsTaken: ['d3'],
      updatedAt: 20,
    };
    const current = {
      date: '2026-07-09',
      meals: [
        { id: 'm_old', items: [{ id: 'it_old' }] },
        { id: 'm_new', items: [{ id: 'it_new' }] },
      ],
      updatedAt: 10,
    };

    const result = guard.mergeProtectedFields('2026-07-09', candidate, current, ['supplementsTaken'], {
      action: 'supplement-mark-taken',
    });

    expect(result.merged).toBe(true);
    expect(result.day.meals).toHaveLength(2);
    expect(result.day.supplementsTaken).toEqual(['d3']);
    expect(result.day.updatedAt).toBe(20);
  });

  it('tracks removed ids as expected absent ids for move operations', () => {
    const guard = loadGuard();
    const before = {
      meals: [{ id: 'm_old', items: [{ id: 'it_old' }, { id: 'it_move' }] }],
    };
    const after = {
      meals: [{ id: 'm_old', items: [{ id: 'it_old' }] }],
    };

    expect(guard.delta(before, after)).toMatchObject({
      expectedMealIds: [],
      expectedItemIds: [],
      expectedAbsentMealIds: [],
      expectedAbsentItemIds: ['it_move'],
    });
  });

  it('preserves local meals/items when a delayed newer snapshot drops them without tombstones', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 2000,
      meals: [
        { id: 'meal-dinner', updatedAt: 1900, items: [
          { id: 'funchoza', updatedAt: 1950 },
          { id: 'chicken', updatedAt: 1960 },
        ] },
        { id: 'meal-coffee', updatedAt: 1800, items: [{ id: 'coffee', updatedAt: 1810 }] },
      ],
    };
    const delayed = {
      date: '2026-07-20',
      updatedAt: 3000,
      meals: [{ id: 'meal-dinner', updatedAt: 3000, items: [] }],
    };

    const assessment = guard.assessExternalReplacement(current, delayed);
    expect(assessment.safe).toBe(false);
    expect(assessment.missingMealIds).toEqual(['meal-coffee']);
    expect(assessment.missingItemIds.sort()).toEqual(['chicken', 'coffee', 'funchoza']);

    const result = resolve(guard, current, delayed);
    expect(result.ok).toBe(true);
    expect(result.status).toBe('merged');
    expect(result.value.meals.map((meal) => meal.id).sort()).toEqual(['meal-coffee', 'meal-dinner']);
    expect(result.value.meals.flatMap((meal) => meal.items.map((item) => item.id)).sort())
      .toEqual(['chicken', 'coffee', 'funchoza']);
  });

  it('detects same-count item replacement by id and unions concurrent additions', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 2000,
      meals: [{ id: 'meal-1', items: [
        { id: 'shared', updatedAt: 1000 },
        { id: 'local-only', updatedAt: 1900 },
      ] }],
    };
    const incoming = {
      date: '2026-07-20',
      updatedAt: 3000,
      meals: [{ id: 'meal-1', items: [
        { id: 'shared', updatedAt: 1000 },
        { id: 'remote-only', updatedAt: 2900 },
      ] }],
    };

    const assessment = guard.assessExternalReplacement(current, incoming);
    expect(assessment.safe).toBe(false);
    expect(assessment.missingItemIds).toEqual(['local-only']);

    const result = resolve(guard, current, incoming);
    expect(result.value.meals[0].items.map((item) => item.id).sort())
      .toEqual(['local-only', 'remote-only', 'shared']);
  });

  it('keeps a newer local item edit even when the remote day timestamp is newer', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 5500,
      meals: [{ id: 'meal-1', updatedAt: 5500, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
    };
    const incoming = {
      date: '2026-07-20',
      updatedAt: 6000,
      meals: [{ id: 'meal-1', updatedAt: 6000, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
    };

    const result = resolve(guard, current, incoming);
    expect(result.status).toBe('merged');
    expect(result.value.meals[0].items[0]).toMatchObject({ id: 'item-1', grams: 250, updatedAt: 5000 });
  });

  it('accepts a newer remote edit for the same item id', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 5500,
      meals: [{ id: 'meal-1', updatedAt: 5500, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
    };
    const incoming = {
      date: '2026-07-20',
      updatedAt: 6000,
      meals: [{ id: 'meal-1', updatedAt: 6000, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
    };

    const result = resolve(guard, current, incoming);
    expect(result.status).toBe('merged');
    expect(result.value.meals[0].items[0].grams).toBe(250);
  });

  it('blocks unexplained legacy shrink and fails closed when repair throws', () => {
    const guard = loadGuard();
    const current = { meals: [{ id: 'meal-1', items: [{ grams: 100 }, { grams: 200 }] }] };
    const incoming = { meals: [{ id: 'meal-1', items: [{ grams: 100 }] }] };

    const assessment = guard.assessExternalReplacement(current, incoming);
    expect(assessment.safe).toBe(false);
    expect(assessment.legacyItemsDropped).toBe(1);
    expect(guard.resolveExternalReplacement(current, incoming).status).toBe('blocked');
    expect(guard.resolveExternalReplacement(current, incoming, {
      mergeDayData: () => { throw new Error('merge unavailable'); },
    }).status).toBe('blocked');
  });

  it('allows a fresh explicit item tombstone to remove the covered item', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 2000,
      meals: [{ id: 'meal-1', items: [
        { id: 'keep', updatedAt: 1500 },
        { id: 'delete-me', updatedAt: 1900 },
      ] }],
    };
    const incoming = {
      date: '2026-07-20',
      updatedAt: 3000,
      deletedItemIds: { 'delete-me': 2500 },
      meals: [{ id: 'meal-1', items: [{ id: 'keep', updatedAt: 1500 }] }],
    };

    expect(guard.assessExternalReplacement(current, incoming).safe).toBe(true);
    const result = resolve(guard, current, incoming);
    expect(result.value.meals[0].items.map((item) => item.id)).toEqual(['keep']);
  });

  it('rejects a tombstone older than the local item edit', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 3000,
      meals: [{ id: 'meal-1', items: [{ id: 'edited-after-delete', updatedAt: 2800 }] }],
    };
    const incoming = {
      date: '2026-07-20',
      updatedAt: 4000,
      deletedItemIds: { 'edited-after-delete': 2500 },
      meals: [{ id: 'meal-1', items: [] }],
    };

    const assessment = guard.assessExternalReplacement(current, incoming);
    expect(assessment.safe).toBe(false);
    expect(assessment.staleItemTombstoneIds).toEqual(['edited-after-delete']);
    const result = resolve(guard, current, incoming);
    expect(result.value.meals[0].items.map((item) => item.id)).toEqual(['edited-after-delete']);
  });

  it('allows a fresh meal tombstone and rejects a stale one', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 3000,
      meals: [{ id: 'meal-delete', updatedAt: 2800, items: [{ id: 'inside', updatedAt: 2700 }] }],
    };
    const fresh = {
      date: '2026-07-20',
      updatedAt: 4000,
      deletedMealIds: { 'meal-delete': 2900 },
      meals: [],
    };
    const stale = {
      ...fresh,
      deletedMealIds: { 'meal-delete': 2500 },
    };

    expect(guard.assessExternalReplacement(current, fresh).safe).toBe(true);
    expect(resolve(guard, current, fresh).value.meals).toEqual([]);

    const staleAssessment = guard.assessExternalReplacement(current, stale);
    expect(staleAssessment.safe).toBe(false);
    expect(staleAssessment.staleMealTombstoneIds).toEqual(['meal-delete']);
    expect(resolve(guard, current, stale).value.meals.map((meal) => meal.id)).toEqual(['meal-delete']);
  });

  it('converges to a no-op after the repaired merged day is applied', () => {
    const guard = loadGuard();
    const current = {
      date: '2026-07-20',
      updatedAt: 2000,
      meals: [{ id: 'meal-1', items: [{ id: 'local-only', updatedAt: 1900 }] }],
    };
    const incoming = {
      date: '2026-07-20',
      updatedAt: 3000,
      meals: [{ id: 'meal-1', items: [] }],
    };

    const repaired = resolve(guard, current, incoming);
    expect(repaired.status).toBe('merged');
    const secondPass = resolve(guard, repaired.value, repaired.value);
    expect(secondPass.status).toBe('noop');
    expect(secondPass.value).toBe(repaired.value);
  });

  it('merges same-id item timestamps before an external day-updated event reaches React', async () => {
    vi.useFakeTimers();
    try {
      const guard = loadGuard();
      const date = '2026-07-20';
      const key = 'heys_dayv2_' + date;
      let reactDay = {
        date,
        updatedAt: 5500,
        meals: [{ id: 'meal-1', updatedAt: 5500, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
      };
      const storageDay = {
        date,
        updatedAt: 6000,
        meals: [{ id: 'meal-1', updatedAt: 6000, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
      };
      const storage = { [key]: JSON.stringify(storageDay) };
      const registeredEffects = [];
      const eventListeners = {};
      const setDay = vi.fn((updater) => {
        reactDay = typeof updater === 'function' ? updater(reactDay) : updater;
      });
      const heys = {
        dayMutationGuard: guard,
        sync: { mergeDayData },
        dayUtils: {
          isSameDayHydratedContent: sameDayContent,
          isSameDayStorageMergeContent: sameDayContent,
        },
        Day: { getDay: () => reactDay, hasPendingMutation: () => false },
        store: { invalidate: () => {} },
      };
      const dayEffects = loadDayEffects(heys, registeredEffects, storage, eventListeners);
      dayEffects.useDaySyncEffects({
        date,
        setIsHydrated: () => {},
        setDay,
        getProfile: () => ({}),
        ensureDay: (day) => day,
        loadMealsForDate: () => {},
        lsGet: (lsKey, fallback) => storage[lsKey] ? JSON.parse(storage[lsKey]) : fallback,
        lsSet: () => { throw new Error('external event must not write LS'); },
        normalizeTrainings: (value) => value || [],
        cleanEmptyTrainings: (value) => value || [],
        prevDateRef: { current: date },
        lastLoadedUpdatedAtRef: { current: reactDay.updatedAt },
        blockCloudUpdatesUntilRef: { current: 0 },
        isSyncingRef: { current: false },
      });
      const eventEffect = registeredEffects.find((effect) => String(effect).includes("addEventListener('heys:day-updated'"));
      expect(eventEffect).toBeTypeOf('function');
      const cleanup = eventEffect();

      eventListeners['heys:day-updated']({ detail: { date, source: 'fetchDays', forceReload: true } });
      await vi.advanceTimersByTimeAsync(400);

      expect(reactDay.meals[0].items[0]).toMatchObject({ grams: 250, updatedAt: 5000 });
      expect(setDay).toHaveBeenCalledTimes(1);
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed in the external React event path when the common guard is unavailable or throws', async () => {
    vi.useFakeTimers();
    try {
      const date = '2026-07-20';
      const key = 'heys_dayv2_' + date;
      for (const dayMutationGuard of [
        undefined,
        { resolveExternalReplacement: () => { throw new Error('resolver unavailable'); } },
      ]) {
        let reactDay = {
          date,
          updatedAt: 5000,
          meals: [{ id: 'meal-1', items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
        };
        const storage = { [key]: JSON.stringify({
          date,
          updatedAt: 6000,
          meals: [{ id: 'meal-1', items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
        }) };
        const registeredEffects = [];
        const eventListeners = {};
        const setDay = vi.fn((updater) => {
          reactDay = typeof updater === 'function' ? updater(reactDay) : updater;
        });
        const heys = {
          dayMutationGuard,
          sync: { mergeDayData },
          dayUtils: {
            isSameDayHydratedContent: sameDayContent,
            isSameDayStorageMergeContent: sameDayContent,
          },
          Day: { getDay: () => reactDay, hasPendingMutation: () => false },
          store: { invalidate: () => {} },
        };
        const dayEffects = loadDayEffects(heys, registeredEffects, storage, eventListeners);
        dayEffects.useDaySyncEffects({
          date,
          setIsHydrated: () => {},
          setDay,
          getProfile: () => ({}),
          ensureDay: (day) => day,
          loadMealsForDate: () => {},
          lsGet: (lsKey, fallback) => storage[lsKey] ? JSON.parse(storage[lsKey]) : fallback,
          lsSet: () => {},
          normalizeTrainings: (value) => value || [],
          cleanEmptyTrainings: (value) => value || [],
          prevDateRef: { current: date },
          lastLoadedUpdatedAtRef: { current: reactDay.updatedAt },
          blockCloudUpdatesUntilRef: { current: 0 },
          isSyncingRef: { current: false },
        });
        const eventEffect = registeredEffects.find((effect) => String(effect).includes("addEventListener('heys:day-updated'"));
        const cleanup = eventEffect();

        eventListeners['heys:day-updated']({ detail: { date, source: 'fetchDays', forceReload: true } });
        await vi.advanceTimersByTimeAsync(400);

        expect(reactDay.meals[0].items[0].grams).toBe(250);
        expect(setDay).toHaveBeenCalledTimes(1);
        cleanup();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps fetchDays repair in LS and React after the 3s reconciler tick without queue churn', async () => {
    vi.useFakeTimers();
    try {
      const guard = loadGuard();
      const date = '2026-07-20';
      const key = 'heys_dayv2_' + date;
      const localDay = {
        date,
        updatedAt: 2000,
        meals: [
          { id: 'meal-dinner', updatedAt: 1900, items: [
            { id: 'funchoza', updatedAt: 1950 },
            { id: 'chicken', updatedAt: 1960 },
          ] },
          { id: 'meal-coffee', updatedAt: 1800, items: [{ id: 'coffee', updatedAt: 1810 }] },
        ],
      };
      const delayedFetch = {
        date,
        updatedAt: 3000,
        meals: [{ id: 'meal-dinner', updatedAt: 3000, items: [] }],
      };
      const storage = { [key]: JSON.stringify(localDay) };
      const uploadQueue = [];

      // fetchDays is muted from upload mirroring; production wiring below is
      // asserted separately, while the same common resolver repairs its value.
      const fetched = resolve(guard, JSON.parse(storage[key]), delayedFetch);
      expect(fetched.status).toBe('merged');
      storage[key] = JSON.stringify(fetched.value);

      let reactDay = localDay;
      const setDay = vi.fn((updater) => {
        reactDay = typeof updater === 'function' ? updater(reactDay) : updater;
      });
      const registeredEffects = [];
      const heys = {
        dayMutationGuard: guard,
        sync: { mergeDayData },
        dayUtils: { isSameDayHydratedContent: sameDayContent },
        Day: { getDay: () => reactDay, hasPendingMutation: () => false },
        store: { invalidate: () => {} },
      };
      const dayEffects = loadDayEffects(heys, registeredEffects, storage);
      dayEffects.useDaySyncEffects({
        date,
        setIsHydrated: () => {},
        setDay,
        getProfile: () => ({}),
        ensureDay: (day) => day,
        loadMealsForDate: () => {},
        lsGet: (lsKey, fallback) => storage[lsKey] ? JSON.parse(storage[lsKey]) : fallback,
        lsSet: (lsKey, value) => {
          storage[lsKey] = JSON.stringify(value);
          uploadQueue.push(value);
        },
        normalizeTrainings: (value) => value,
        cleanEmptyTrainings: (value) => value,
        prevDateRef: { current: date },
        lastLoadedUpdatedAtRef: { current: localDay.updatedAt },
        blockCloudUpdatesUntilRef: { current: 0 },
        isSyncingRef: { current: false },
      });
      const reconcileEffect = registeredEffects.find((effect) => String(effect).includes('setInterval(reconcile, 3000)'));
      expect(reconcileEffect).toBeTypeOf('function');
      const cleanup = reconcileEffect();

      await vi.advanceTimersByTimeAsync(3000);
      const expectedItemIds = ['chicken', 'coffee', 'funchoza'];
      expect(JSON.parse(storage[key]).meals.flatMap((meal) => meal.items.map((item) => item.id)).sort())
        .toEqual(expectedItemIds);
      expect(reactDay.meals.flatMap((meal) => meal.items.map((item) => item.id)).sort())
        .toEqual(expectedItemIds);
      expect(uploadQueue).toEqual([]);

      await vi.advanceTimersByTimeAsync(3000);
      expect(uploadQueue).toEqual([]);
      expect(setDay).toHaveBeenCalledTimes(1);
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('repairs a same-id stale LS edit once and converges on the second periodic tick', async () => {
    vi.useFakeTimers();
    try {
      const guard = loadGuard();
      const date = '2026-07-20';
      const key = 'heys_dayv2_' + date;
      let reactDay = {
        date,
        updatedAt: 5500,
        meals: [{ id: 'meal-1', updatedAt: 5500, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
      };
      const staleLsDay = {
        date,
        updatedAt: 6000,
        meals: [{ id: 'meal-1', updatedAt: 6000, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
      };
      const storage = { [key]: JSON.stringify(staleLsDay) };
      const uploadQueue = [];
      const registeredEffects = [];
      const setDay = vi.fn((updater) => {
        reactDay = typeof updater === 'function' ? updater(reactDay) : updater;
      });
      const heys = {
        dayMutationGuard: guard,
        sync: { mergeDayData },
        dayUtils: { isSameDayHydratedContent: sameDayContent },
        Day: { getDay: () => reactDay, hasPendingMutation: () => false },
        store: { invalidate: () => {} },
      };
      const dayEffects = loadDayEffects(heys, registeredEffects, storage);
      dayEffects.useDaySyncEffects({
        date,
        setIsHydrated: () => {},
        setDay,
        getProfile: () => ({}),
        ensureDay: (day) => day,
        loadMealsForDate: () => {},
        lsGet: (lsKey, fallback) => storage[lsKey] ? JSON.parse(storage[lsKey]) : fallback,
        lsSet: (lsKey, value) => {
          storage[lsKey] = JSON.stringify(value);
          uploadQueue.push(value);
        },
        normalizeTrainings: (value) => value,
        cleanEmptyTrainings: (value) => value,
        prevDateRef: { current: date },
        lastLoadedUpdatedAtRef: { current: reactDay.updatedAt },
        blockCloudUpdatesUntilRef: { current: 0 },
        isSyncingRef: { current: false },
      });
      const reconcileEffect = registeredEffects.find((effect) => String(effect).includes('setInterval(reconcile, 3000)'));
      const cleanup = reconcileEffect();

      await vi.advanceTimersByTimeAsync(3000);
      expect(reactDay.meals[0].items[0].grams).toBe(250);
      expect(JSON.parse(storage[key]).meals[0].items[0].grams).toBe(250);
      expect(uploadQueue).toHaveLength(1);
      expect(uploadQueue[0].meals[0].items[0].grams).toBe(250);

      await vi.advanceTimersByTimeAsync(3000);
      expect(uploadQueue).toHaveLength(1);
      expect(setDay).toHaveBeenCalledTimes(1);
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs the real cloud.fetchDays path through entity-level merge without queueing the stale grams', async () => {
    const originalHEYS = window.HEYS;
    const originalYandexAPI = window.YandexAPI;
    const originalSetItem = window.localStorage.setItem;
    const originalDispatchEvent = window.dispatchEvent;
    const date = '2026-07-20';
    const clientId = '11111111-1111-4111-8111-111111111111';
    const scopedKey = `heys_${clientId}_dayv2_${date}`;
    const baseTs = Date.now();
    const localDay = {
      date,
      updatedAt: baseTs - 500,
      meals: [{ id: 'meal-1', updatedAt: baseTs - 500, items: [{ id: 'item-1', grams: 250, updatedAt: baseTs - 100 }] }],
    };
    const remoteDay = {
      date,
      updatedAt: baseTs + 1000,
      meals: [{ id: 'meal-1', updatedAt: baseTs + 1000, items: [{ id: 'item-1', grams: 100, updatedAt: baseTs - 1000 }] }],
    };
    let responseDay = remoteDay;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({
        data: [{ k: `heys_dayv2_${date}`, v: responseDay, updated_at: new Date(responseDay.updatedAt).toISOString() }],
        error: null,
      })),
    };
    const yandexApi = { from: vi.fn(() => query) };

    try {
      localStorage.clear();
      localStorage.setItem('heys_client_current', JSON.stringify(clientId));
      localStorage.setItem(scopedKey, JSON.stringify(localDay));
      window.HEYS = {
        YandexAPI: yandexApi,
        cloud: {},
        sync: { mergeDayData },
        dayMutationGuard: loadGuard(),
        dayUtils: {
          isSameDayHydratedContent: sameDayContent,
          isSameDayStorageMergeContent: sameDayContent,
        },
        store: { invalidate: vi.fn() },
      };
      window.YandexAPI = yandexApi;
      for (const file of [
        '../heys_pending_queue_pure_v1.js',
        '../heys_sync_queue_runtime_pure_v1.js',
        '../heys_write_context_health_v1.js',
        '../heys_storage_key_contract_v1.js',
      ]) {
        eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
      }
      eval(fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8'));

      const pendingBefore = window.HEYS.cloud.getPendingCount();
      await window.HEYS.cloud.fetchDays([date]);
      const stored = JSON.parse(localStorage.getItem(scopedKey));

      expect(stored.meals[0].items[0]).toMatchObject({ grams: 250, updatedAt: baseTs - 100 });
      expect(window.HEYS.cloud.getPendingCount()).toBe(pendingBefore);
      expect(query.in).toHaveBeenCalledTimes(1);

      const protectedDay = {
        ...stored,
        updatedAt: baseTs + 3000,
        meals: [{ id: 'meal-1', updatedAt: baseTs + 3000, items: [{ id: 'item-1', grams: 333, updatedAt: baseTs + 3000 }] }],
      };
      responseDay = {
        date,
        updatedAt: baseTs + 4000,
        meals: [{ id: 'meal-1', updatedAt: baseTs + 4000, items: [{ id: 'item-1', grams: 100, updatedAt: baseTs - 1000 }] }],
      };
      originalSetItem.call(localStorage, scopedKey, JSON.stringify(protectedDay));
      delete window.HEYS.dayMutationGuard;

      await window.HEYS.cloud.fetchDays([date]);

      expect(JSON.parse(localStorage.getItem(scopedKey)).meals[0].items[0].grams).toBe(333);
      expect(window.HEYS.cloud.getPendingCount()).toBe(pendingBefore);
      expect(query.in).toHaveBeenCalledTimes(2);

      const resolverProtectedDay = {
        ...protectedDay,
        updatedAt: baseTs + 5000,
        meals: [{ id: 'meal-1', updatedAt: baseTs + 5000, items: [{ id: 'item-1', grams: 444, updatedAt: baseTs + 5000 }] }],
      };
      responseDay = {
        date,
        updatedAt: baseTs + 6000,
        meals: [{ id: 'meal-1', updatedAt: baseTs + 6000, items: [{ id: 'item-1', grams: 100, updatedAt: baseTs - 1000 }] }],
      };
      originalSetItem.call(localStorage, scopedKey, JSON.stringify(resolverProtectedDay));
      window.HEYS.dayMutationGuard = {
        resolveExternalReplacement: () => { throw new Error('resolver failed'); },
      };

      await window.HEYS.cloud.fetchDays([date]);

      expect(JSON.parse(localStorage.getItem(scopedKey)).meals[0].items[0].grams).toBe(444);
      expect(window.HEYS.cloud.getPendingCount()).toBe(pendingBefore);
      expect(query.in).toHaveBeenCalledTimes(3);
    } finally {
      window.localStorage.setItem = originalSetItem;
      window.dispatchEvent = originalDispatchEvent;
      delete window.__heysDispatchPatched;
      window.HEYS = originalHEYS;
      window.YandexAPI = originalYandexAPI;
      localStorage.clear();
    }
  });

  it('rehydrates a stale same-id day item from LS before the real saveClientViaRPC call', async () => {
    const originalHEYS = window.HEYS;
    const originalYandexAPI = window.YandexAPI;
    const originalSetItem = window.localStorage.setItem;
    const originalDispatchEvent = window.dispatchEvent;
    const date = '2026-07-20';
    const clientId = '22222222-2222-4222-8222-222222222222';
    const dayKey = `heys_dayv2_${date}`;
    const scopedKey = `heys_${clientId}_dayv2_${date}`;
    const fixedUpdatedAt = '2026-07-20T18:00:00.000Z';
    const queuedDay = {
      date,
      updatedAt: 6000,
      meals: [{ id: 'meal-1', updatedAt: 6000, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
    };
    const localDay = {
      date,
      updatedAt: 5500,
      meals: [{ id: 'meal-1', updatedAt: 5500, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
    };
    const yandexApi = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          context_id: 'ctx-outbound-test',
          client_id: clientId,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        error: null,
      }),
      mergeSaveKV: vi.fn(async (_clientId, _key, value) => ({
        success: true,
        v: value,
        outcome: 'day_merged',
      })),
    };

    try {
      localStorage.clear();
      localStorage.setItem('heys_client_current', JSON.stringify(clientId));
      localStorage.setItem('heys_pin_auth_client', clientId);
      localStorage.setItem(scopedKey, JSON.stringify(localDay));
      window.HEYS = {
        YandexAPI: yandexApi,
        cloud: {},
        sync: { mergeDayData },
        dayMutationGuard: loadGuard(),
        dayUtils: {
          isSameDayHydratedContent: sameDayContent,
          isSameDayStorageMergeContent: sameDayContent,
        },
        store: { invalidate: vi.fn() },
      };
      window.YandexAPI = yandexApi;
      for (const file of [
        '../heys_pending_queue_pure_v1.js',
        '../heys_sync_queue_runtime_pure_v1.js',
        '../heys_write_context_health_v1.js',
        '../heys_storage_key_contract_v1.js',
      ]) {
        eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
      }
      eval(fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8'));
      window.HEYS.cloud.setPinAuthClient(clientId);

      const result = await window.HEYS.cloud.saveClientViaRPC(clientId, [{
        k: dayKey,
        v: queuedDay,
        updated_at: fixedUpdatedAt,
      }]);

      expect(result).toEqual(expect.objectContaining({ success: true, saved: 1 }));
      expect(yandexApi.mergeSaveKV).toHaveBeenCalledWith(
        clientId,
        dayKey,
        expect.objectContaining({
          meals: [expect.objectContaining({
            items: [expect.objectContaining({ id: 'item-1', grams: 250, updatedAt: 5000 })],
          })],
        }),
        expect.any(Number),
        'ctx-outbound-test',
      );

      const guard = window.HEYS.dayMutationGuard;
      const saveWithLocal = async (nextLocal, nextQueued) => {
        originalSetItem.call(localStorage, scopedKey, JSON.stringify(nextLocal));
        const callIndex = yandexApi.mergeSaveKV.mock.calls.length;
        const saveResult = await window.HEYS.cloud.saveClientViaRPC(clientId, [{
          k: dayKey,
          v: nextQueued,
          updated_at: fixedUpdatedAt,
        }]);
        return {
          result: saveResult,
          sent: yandexApi.mergeSaveKV.mock.calls[callIndex]?.[2],
        };
      };

      const firstSent = yandexApi.mergeSaveKV.mock.calls[0][2];
      const sameRetry = await saveWithLocal(localDay, queuedDay);
      expect(sameRetry.sent).toEqual(firstSent);
      expect(sameRetry.sent.updatedAt).toBe(6000);
      expect(sameRetry.sent).not.toHaveProperty('_mergedAt');

      const staleLocal = {
        date,
        updatedAt: 7000,
        meals: [{ id: 'meal-1', updatedAt: 7000, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
      };
      const freshQueued = {
        date,
        updatedAt: 6500,
        meals: [{ id: 'meal-1', updatedAt: 6500, items: [{ id: 'item-1', grams: 275, updatedAt: 6000 }] }],
      };
      const queuedWins = await saveWithLocal(staleLocal, freshQueued);
      expect(queuedWins.result.success).toBe(true);
      expect(queuedWins.sent.meals[0].items[0]).toMatchObject({ grams: 275, updatedAt: 6000 });

      const itemBaseline = {
        date,
        updatedAt: 7000,
        meals: [{ id: 'meal-1', updatedAt: 7000, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
      };
      const freshItemDelete = await saveWithLocal(itemBaseline, {
        date,
        updatedAt: 8000,
        deletedItemIds: { 'item-1': 6000 },
        meals: [{ id: 'meal-1', updatedAt: 8000, items: [] }],
      });
      expect(freshItemDelete.sent.meals[0].items).toEqual([]);

      const staleItemDelete = await saveWithLocal(itemBaseline, {
        date,
        updatedAt: 9000,
        deletedItemIds: { 'item-1': 4500 },
        meals: [{ id: 'meal-1', updatedAt: 9000, items: [] }],
      });
      expect(staleItemDelete.sent.meals[0].items[0]).toMatchObject({ id: 'item-1', grams: 250 });

      const mealBaseline = {
        date,
        updatedAt: 7000,
        meals: [{ id: 'meal-delete', updatedAt: 5000, items: [{ id: 'inside', grams: 50, updatedAt: 5000 }] }],
      };
      const freshMealDelete = await saveWithLocal(mealBaseline, {
        date,
        updatedAt: 8000,
        deletedMealIds: { 'meal-delete': 6000 },
        meals: [],
      });
      expect(freshMealDelete.sent.meals).toEqual([]);

      const staleMealDelete = await saveWithLocal(mealBaseline, {
        date,
        updatedAt: 9000,
        deletedMealIds: { 'meal-delete': 4500 },
        meals: [],
      });
      expect(staleMealDelete.sent.meals[0]).toMatchObject({ id: 'meal-delete' });

      const expandedLocal = {
        date,
        updatedAt: 8000,
        meals: [{ id: 'meal-1', updatedAt: 8000, items: [
          { id: 'item-1', grams: 250, updatedAt: 5000 },
          { id: 'item-2', grams: 50, updatedAt: 7000 },
        ] }],
      };
      const reducedQueued = await saveWithLocal(expandedLocal, {
        date,
        updatedAt: 9000,
        meals: [{ id: 'meal-1', updatedAt: 9000, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
      });
      expect(reducedQueued.sent.meals[0].items.map((entry) => entry.id).sort()).toEqual(['item-1', 'item-2']);

      const equalQueued = JSON.parse(JSON.stringify(expandedLocal));
      const equalResult = await saveWithLocal(expandedLocal, equalQueued);
      expect(equalResult.result.success).toBe(true);
      expect(equalResult.sent).toBe(equalQueued);
      const noopTrace = window.HEYS.debug.getSyncTraceBuffer().at(-1);
      expect(noopTrace).toMatchObject({
        event: 'DAYV2_OUTGOING_NOOP',
        outcome: 'outgoing_noop',
        reason: 'content_equal',
      });
      expect(noopTrace).not.toHaveProperty('key');
      expect(noopTrace).not.toHaveProperty('clientId');

      for (const failingGuard of [
        undefined,
        { resolveExternalReplacement: () => { throw new Error('resolver failed'); } },
      ]) {
        window.HEYS.dayMutationGuard = failingGuard;
        const callsBefore = yandexApi.mergeSaveKV.mock.calls.length;
        const blocked = await saveWithLocal(expandedLocal, reducedQueued.sent);
        expect(blocked.result).toMatchObject({ success: false, saved: 0 });
        expect(blocked.result.error).toMatch(/^dayv2_outgoing_blocked:/);
        expect(yandexApi.mergeSaveKV).toHaveBeenCalledTimes(callsBefore);
      }

      window.HEYS.dayMutationGuard = guard;
      window.HEYS.sync = {};
      const callsBeforeMissingMerge = yandexApi.mergeSaveKV.mock.calls.length;
      const missingMerge = await saveWithLocal(expandedLocal, reducedQueued.sent);
      expect(missingMerge.result).toMatchObject({ success: false, saved: 0 });
      expect(missingMerge.result.error).toMatch(/^dayv2_outgoing_blocked:/);
      expect(yandexApi.mergeSaveKV).toHaveBeenCalledTimes(callsBeforeMissingMerge);
      expect(window.HEYS.debug.getSyncTraceBuffer().at(-1)).toMatchObject({
        event: 'DAYV2_OUTGOING_BLOCKED',
        outcome: 'outgoing_blocked',
        source: 'saveClientViaRPC',
      });
      window.HEYS.sync = { mergeDayData };
    } finally {
      window.localStorage.setItem = originalSetItem;
      window.dispatchEvent = originalDispatchEvent;
      delete window.__heysDispatchPatched;
      window.HEYS = originalHEYS;
      window.YandexAPI = originalYandexAPI;
      localStorage.clear();
    }
  });

  it('keeps a newer queued day while an older upload is in flight and drains it after the old ack', async () => {
    const originalHEYS = window.HEYS;
    const originalYandexAPI = window.YandexAPI;
    const originalSetItem = window.localStorage.setItem;
    const originalDispatchEvent = window.dispatchEvent;
    const date = '2026-07-20';
    const clientId = '33333333-3333-4333-8333-333333333333';
    const dayKey = `heys_dayv2_${date}`;
    const scopedKey = `heys_${clientId}_dayv2_${date}`;
    const staleDay = {
      date,
      updatedAt: 4000,
      meals: [{ id: 'meal-1', updatedAt: 4000, items: [{ id: 'item-1', grams: 100, updatedAt: 4000 }] }],
    };
    const freshDay = {
      date,
      updatedAt: 5000,
      meals: [{ id: 'meal-1', updatedAt: 5000, items: [{ id: 'item-1', grams: 250, updatedAt: 5000 }] }],
    };
    let resolveFirstUpload;
    let fakeTimersActive = false;
    const yandexApi = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          context_id: 'ctx-inflight-test',
          client_id: clientId,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        error: null,
      }),
      mergeSaveKV: vi.fn()
        .mockImplementationOnce((_clientId, _key, value) => new Promise((resolve) => {
          resolveFirstUpload = () => resolve({ success: true, v: value, outcome: 'day_merged' });
        }))
        .mockImplementation(async (_clientId, _key, value) => ({
          success: true,
          v: value,
          outcome: 'day_merged',
        })),
    };

    try {
      localStorage.clear();
      localStorage.setItem('heys_client_current', JSON.stringify(clientId));
      localStorage.setItem('heys_pin_auth_client', clientId);
      localStorage.setItem(scopedKey, JSON.stringify(staleDay));
      window.HEYS = {
        YandexAPI: yandexApi,
        cloud: {},
        sync: { mergeDayData },
        dayMutationGuard: loadGuard(),
        dayUtils: {
          isSameDayHydratedContent: sameDayContent,
          isSameDayStorageMergeContent: sameDayContent,
        },
        store: { invalidate: vi.fn() },
      };
      window.YandexAPI = yandexApi;
      for (const file of [
        '../heys_pending_queue_pure_v1.js',
        '../heys_sync_queue_runtime_pure_v1.js',
        '../heys_write_context_health_v1.js',
        '../heys_storage_key_contract_v1.js',
      ]) {
        eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
      }
      eval(fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8'));
      window.HEYS.cloud.setPinAuthClient(clientId);
      await window.HEYS.cloud._issueWriteContext(clientId);

      window.HEYS.cloud.saveClientKey(clientId, dayKey, staleDay);
      const flushPromise = window.HEYS.cloud.flushPendingQueue(4000);
      await vi.waitFor(() => expect(yandexApi.mergeSaveKV).toHaveBeenCalledTimes(1));
      expect(window.HEYS.cloud.getPendingQueuesSnapshot()).toMatchObject({
        clientQueueLen: 0,
        clientInFlightLen: 1,
        uploadInProgress: true,
      });

      originalSetItem.call(localStorage, scopedKey, JSON.stringify(freshDay));
      window.HEYS.cloud.saveClientKey(clientId, dayKey, freshDay);
      expect(window.HEYS.cloud.getPendingQueuesSnapshot()).toMatchObject({
        clientQueueLen: 1,
        clientInFlightLen: 1,
        uploadInProgress: true,
      });

      resolveFirstUpload();
      await vi.waitFor(() => expect(yandexApi.mergeSaveKV).toHaveBeenCalledTimes(2), { timeout: 2500 });
      const drained = await flushPromise;

      expect(drained).toBe(true);
      expect(yandexApi.mergeSaveKV.mock.calls[1][2].meals[0].items[0]).toMatchObject({
        grams: 250,
        updatedAt: 5000,
      });
      expect(JSON.parse(localStorage.getItem(scopedKey)).meals[0].items[0].grams).toBe(250);
      expect(window.HEYS.cloud.getPendingQueuesSnapshot()).toMatchObject({
        clientQueueLen: 0,
        clientInFlightLen: 0,
        uploadInProgress: false,
        totalCount: 0,
      });

      vi.useFakeTimers();
      fakeTimersActive = true;
      delete window.HEYS.dayMutationGuard;
      originalSetItem.call(localStorage, scopedKey, JSON.stringify(freshDay));
      const callsBeforeBlockedFlush = yandexApi.mergeSaveKV.mock.calls.length;
      window.HEYS.cloud.saveClientKey(clientId, dayKey, staleDay);
      const blockedFlushPromise = window.HEYS.cloud.flushPendingQueue(100);
      await vi.advanceTimersByTimeAsync(150);

      expect(await blockedFlushPromise).toBe(false);
      expect(yandexApi.mergeSaveKV).toHaveBeenCalledTimes(callsBeforeBlockedFlush);
      expect(window.HEYS.cloud.getPendingQueuesSnapshot()).toMatchObject({
        clientQueueLen: 1,
        clientInFlightLen: 0,
        uploadInProgress: false,
        totalCount: 1,
      });
      vi.clearAllTimers();
      vi.useRealTimers();
      fakeTimersActive = false;
    } finally {
      if (fakeTimersActive) {
        vi.clearAllTimers();
        vi.useRealTimers();
      }
      window.localStorage.setItem = originalSetItem;
      window.dispatchEvent = originalDispatchEvent;
      delete window.__heysDispatchPatched;
      window.HEYS = originalHEYS;
      window.YandexAPI = originalYandexAPI;
      localStorage.clear();
    }
  });

  it('is wired into automatic fetchDays writes and periodic reconcile', () => {
    const storageSource = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');
    const effectsSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_effects.js'), 'utf8');
    const liveRefreshSource = fs.readFileSync(path.resolve(__dirname, '../heys_day_live_refresh_v1.js'), 'utf8');

    expect(storageSource).toContain("writeAutomaticInboundDayKey(targetKey, valueToStore");
    expect(storageSource).toContain("source: 'fetchDays'");
    expect(storageSource).toContain("resolveAutomaticInboundDayValue(it.originalKey, localWriteValue, 'server-merge')");
    expect(effectsSource).toContain('resolveExternalReplacement(reactDay, lsDay');
    expect(effectsSource).toContain('SKIP_RECONCILE_EXTERNAL');
    expect(effectsSource).toContain('RECONCILE_MERGED_EXTERNAL');
    expect(liveRefreshSource).toContain('resolveExternalReplacement(local, cloudBlob');
    expect(liveRefreshSource).not.toContain('preferRemote: true');
  });
});
