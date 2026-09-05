import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const sources = [
  'heys_user_tab_impl_v1.js',
  'heys_user_v12.js',
].map((name) => ({
  name,
  source: fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8'),
}));

function normalizedSettingsHelpers(source) {
  const start = source.indexOf('function formatSubscriptionDaysLeft');
  const end = source.indexOf('// === SubscriptionStatusSection', start);
  if (start < 0 || end < 0) return '';
  return source.slice(start, end).replace(/\s+/g, ' ').trim();
}

function loadSettingsHelpers(source) {
  const start = source.indexOf('function formatSubscriptionDaysLeft');
  const end = source.indexOf('// === SubscriptionStatusSection', start);
  const helperSource = source.slice(start, end);
  return Function(`${helperSource}; return { formatSubscriptionDaysLeft, getSubscriptionSettingsSubtitle };`)();
}

describe('subscription settings status contract', () => {
  it('keeps the duplicated settings implementations in sync', () => {
    expect(normalizedSettingsHelpers(sources[0].source)).toBe(normalizedSettingsHelpers(sources[1].source));
  });

  it.each(sources)('$name uses subscription details for the collapsed and expanded views', ({ source }) => {
    expect(source).toContain('subscription?.getCachedDetails?.()');
    expect(source).toContain('window.HEYS.Subscription.getStatusDetails(true)');
    expect(source).toContain('window.HEYS?.Subscriptions?.getSettingsRowMeta');
    expect(source).toContain('subtitle: getSubscriptionSettingsSubtitle(window.HEYS?.Subscription)');
  });

  it.each(sources)('$name shows trial meta by end date', ({ source }) => {
    const { getSubscriptionSettingsSubtitle } = loadSettingsHelpers(source);
    const subscription = {
      getCachedDetails: () => ({ status: 'trial', trial_ends_at: '2026-09-10' }),
      getStatusMeta: () => ({ label: 'Пробный период', shortLabel: 'Триал' }),
    };

    const getSettingsRowMeta = (details) => {
      const d = new Date(details.trial_ends_at);
      const short = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
      return `Триал · до ${short}`;
    };
    const prev = globalThis.HEYS;
    globalThis.HEYS = { Subscriptions: { getSettingsRowMeta } };
    expect(getSubscriptionSettingsSubtitle(subscription)).toBe('Триал · до 10 сент');
    globalThis.HEYS = prev;
    expect(source).toContain("(status === 'read_only' || status === 'none')");
  });
});
