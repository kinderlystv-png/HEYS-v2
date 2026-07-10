'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseEventRows,
  findDueHungerFollowUps,
  buildHungerFollowUpPayload,
} = require('../hunger-follow-up');

const NOW = Date.parse('2026-07-10T12:00:00Z');

function event(overrides = {}) {
  return {
    id: 'event-1',
    outcomePlan: {
      family: 'delay',
      status: 'pending',
      dueAt: '2026-07-10T11:30:00Z',
      expiresAt: '2026-07-10T18:00:00Z',
      userReported: null,
      ...overrides,
    },
  };
}

test('parses JSONB arrays and JSON strings', () => {
  assert.equal(parseEventRows([event()]).length, 1);
  assert.equal(parseEventRows(JSON.stringify([event()])).length, 1);
  assert.deepEqual(parseEventRows('{bad'), []);
});

test('returns only unanswered due follow-ups inside their validity window', () => {
  const rows = [
    event(),
    { ...event({ dueAt: '2026-07-10T12:30:00Z' }), id: 'future' },
    { ...event({ userReported: 'hunger_passed' }), id: 'answered' },
    { ...event({ expiresAt: '2026-07-10T11:59:00Z' }), id: 'expired' },
  ];

  assert.deepEqual(findDueHungerFollowUps(rows, NOW).map((row) => row.id), ['event-1']);
});

test('suppresses a follow-up that was just shown in the open app', () => {
  const recent = event({ status: 'shown', shownAt: '2026-07-10T11:45:00Z' });
  const stale = { ...event({ status: 'shown', shownAt: '2026-07-10T11:20:00Z' }), id: 'stale' };

  assert.deepEqual(findDueHungerFollowUps([recent, stale], NOW).map((row) => row.id), ['stale']);
});

test('builds a push that opens the outcome question', () => {
  const payload = buildHungerFollowUpPayload(event({ family: 'food' }));

  assert.equal(payload.url, '/?openHungerFollowUp=1');
  assert.match(payload.body, /сработала рекомендация/);
  assert.doesNotMatch(payload.body, /еда|голод/i);
  assert.equal(payload.renotify, false);
});
