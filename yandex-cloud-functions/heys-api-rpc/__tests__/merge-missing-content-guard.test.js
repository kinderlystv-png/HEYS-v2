// Regression test for incident 2026-08-06: curator adds a meal server-side,
// a client device pushes its stale (meal-less) day snapshot moments later with
// a freshly re-stamped updatedAt, the merge_save "noConflict" fast path treats
// that as no conflict, and the curator's meal is silently overwritten.
// Запуск: node --test __tests__/merge-missing-content-guard.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { _internal } = require('../index.js');
const { hasCurrentOnlyDayContent, hasIncomingTombstonedDayContent } = _internal;

const curatorDay = {
  date: '2026-08-06',
  updatedAt: 1000,
  meals: [{
    id: 'm_breakfast',
    time: '12:07',
    updatedAt: 1000,
    items: [
      { id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 1000 },
      { id: 'it_2', name: 'Белок яйца', updatedAt: 1000 },
    ],
  }],
};

test('stale client push missing a curator-added meal, no tombstone → flagged', () => {
  const staleClientDay = { date: '2026-08-06', updatedAt: 2000, meals: [] };
  assert.equal(hasCurrentOnlyDayContent(staleClientDay, curatorDay), true);
});

test('identical resend → not flagged', () => {
  assert.equal(hasCurrentOnlyDayContent(curatorDay, curatorDay), false);
});

test('explicit meal tombstone newer than the meal → not flagged (real deletion)', () => {
  const legitDeleteDay = {
    date: '2026-08-06',
    updatedAt: 2000,
    meals: [],
    deletedMealIds: { m_breakfast: 1500 },
  };
  assert.equal(hasCurrentOnlyDayContent(legitDeleteDay, curatorDay), false);
});

test('explicit item tombstone newer than the item → not flagged (real deletion)', () => {
  const itemRemovedDay = {
    date: '2026-08-06',
    updatedAt: 2000,
    meals: [{
      id: 'm_breakfast',
      time: '12:07',
      updatedAt: 2000,
      items: [{ id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 2000 }],
    }],
    deletedItemIds: { it_2: 1500 },
  };
  assert.equal(hasCurrentOnlyDayContent(itemRemovedDay, curatorDay), false);
});

test('item silently missing (no tombstone) → flagged', () => {
  const itemSilentlyDroppedDay = {
    date: '2026-08-06',
    updatedAt: 2000,
    meals: [{
      id: 'm_breakfast',
      time: '12:07',
      updatedAt: 2000,
      items: [{ id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 2000 }],
    }],
  };
  assert.equal(hasCurrentOnlyDayContent(itemSilentlyDroppedDay, curatorDay), true);
});

test('stale tombstone (older than the meal it targets) does not excuse the drop → flagged', () => {
  const staleTombstoneDay = {
    date: '2026-08-06',
    updatedAt: 2000,
    meals: [],
    deletedMealIds: { m_breakfast: 500 }, // older than curatorDay meal's updatedAt (1000)
  };
  assert.equal(hasCurrentOnlyDayContent(staleTombstoneDay, curatorDay), true);
});

test('empty/missing inputs are handled defensively', () => {
  assert.equal(hasCurrentOnlyDayContent(null, curatorDay), false);
  assert.equal(hasCurrentOnlyDayContent(curatorDay, null), false);
  assert.equal(hasCurrentOnlyDayContent({}, curatorDay), true);
  assert.equal(hasCurrentOnlyDayContent({}, {}), false);
});

test('stale client resurrects curator-deleted meal via tombstone → flagged', () => {
  const deletedCloudDay = {
    date: '2026-08-07',
    updatedAt: 1500,
    meals: [],
    deletedMealIds: { m_breakfast: 1500 },
  };
  const staleClientDay = {
    date: '2026-08-07',
    updatedAt: 2000,
    meals: [{
      id: 'm_breakfast',
      time: '12:07',
      updatedAt: 1000,
      items: [{ id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 1000 }],
    }],
  };
  assert.equal(hasIncomingTombstonedDayContent(staleClientDay, deletedCloudDay), true);
});

test('incoming meal newer than cloud tombstone → not flagged (post-tombstone edit)', () => {
  const deletedCloudDay = {
    date: '2026-08-07',
    updatedAt: 1500,
    meals: [],
    deletedMealIds: { m_breakfast: 1000 },
  };
  const editedClientDay = {
    date: '2026-08-07',
    updatedAt: 2000,
    meals: [{
      id: 'm_breakfast',
      time: '12:07',
      updatedAt: 1500,
      items: [{ id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 1500 }],
    }],
  };
  assert.equal(hasIncomingTombstonedDayContent(editedClientDay, deletedCloudDay), false);
});

test('stale client resurrects curator-deleted item via tombstone → flagged', () => {
  const deletedCloudDay = {
    date: '2026-08-07',
    updatedAt: 1500,
    meals: [{
      id: 'm_breakfast',
      time: '12:07',
      updatedAt: 1500,
      items: [{ id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 1500 }],
    }],
    deletedItemIds: { it_2: 1500 },
  };
  const staleClientDay = {
    date: '2026-08-07',
    updatedAt: 2000,
    meals: [{
      id: 'm_breakfast',
      time: '12:07',
      updatedAt: 2000,
      items: [
        { id: 'it_1', name: 'Куриное филе в сливках', updatedAt: 2000 },
        { id: 'it_2', name: 'Белок яйца', updatedAt: 1000 },
      ],
    }],
  };
  assert.equal(hasIncomingTombstonedDayContent(staleClientDay, deletedCloudDay), true);
});

test('incoming tombstone guard handles empty/missing inputs defensively', () => {
  assert.equal(hasIncomingTombstonedDayContent(null, curatorDay), false);
  assert.equal(hasIncomingTombstonedDayContent(curatorDay, null), false);
  assert.equal(hasIncomingTombstonedDayContent({ meals: [] }, curatorDay), false);
});
