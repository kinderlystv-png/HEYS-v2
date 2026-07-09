const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
});
