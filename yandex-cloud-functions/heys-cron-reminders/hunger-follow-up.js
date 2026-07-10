'use strict';

const HUNGER_EVENTS_KEY = 'heys_hunger_energy_status_events_v1';
const SHOWN_GRACE_MS = 30 * 60 * 1000;

function parseEventRows(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function isDuePlan(plan, nowMs) {
  if (!plan || plan.userReported || !['pending', 'shown'].includes(plan.status)) return false;
  if (Number(plan.snoozeCount) >= 2) return false;
  const dueAt = Date.parse(plan.dueAt || '');
  const expiresAt = Date.parse(plan.expiresAt || '');
  if (!Number.isFinite(dueAt) || dueAt > nowMs) return false;
  if (Number.isFinite(expiresAt) && expiresAt < nowMs) return false;
  if (plan.status === 'shown') {
    const shownAt = Date.parse(plan.shownAt || '');
    if (Number.isFinite(shownAt) && nowMs - shownAt < SHOWN_GRACE_MS) return false;
  }
  return plan.family === 'delay' || plan.family === 'food';
}

function findDueHungerFollowUps(value, now = Date.now()) {
  const nowMs = Number(now);
  return parseEventRows(value)
    .filter((row) => row?.id && isDuePlan(row.outcomePlan, nowMs))
    .sort((a, b) => Date.parse(a.outcomePlan.dueAt) - Date.parse(b.outcomePlan.dueAt));
}

function buildHungerFollowUpPayload(row) {
  return {
    title: 'HEYS — короткая проверка',
    body: 'Пора проверить, как сработала рекомендация. Ответ займёт несколько секунд.',
    tag: `hunger-follow-up-${row.id}`,
    url: '/?openHungerFollowUp=1',
    renotify: false
  };
}

function buildHungerFollowUpIdempotencyKey(clientId, row) {
  return `hunger_follow_up:${clientId}:${row?.id || 'unknown'}`;
}

module.exports = {
  HUNGER_EVENTS_KEY,
  parseEventRows,
  isDuePlan,
  findDueHungerFollowUps,
  buildHungerFollowUpPayload,
  buildHungerFollowUpIdempotencyKey
};
