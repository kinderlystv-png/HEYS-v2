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
    expect(source).toContain("details.status === 'trial' && daysLabel");
    expect(source).toContain("`${meta?.shortLabel || 'Триал'} · осталось ${daysLabel}`");
    expect(source).toContain('subtitle: getSubscriptionSettingsSubtitle(window.HEYS?.Subscription)');
  });

  it.each(sources)('$name shows a short trial term without an active-trial CTA', ({ source }) => {
    const { formatSubscriptionDaysLeft, getSubscriptionSettingsSubtitle } = loadSettingsHelpers(source);
    const subscription = {
      getCachedDetails: () => ({ status: 'trial', days_left: 7 }),
      getStatusMeta: () => ({ label: 'Пробный период', shortLabel: 'Триал' }),
    };

    expect(formatSubscriptionDaysLeft(1)).toBe('1 день');
    expect(formatSubscriptionDaysLeft(3)).toBe('3 дня');
    expect(formatSubscriptionDaysLeft(11)).toBe('11 дней');
    expect(getSubscriptionSettingsSubtitle(subscription)).toBe('Триал · осталось 7 дней');
    expect(source).toContain("(status === 'read_only' || status === 'none')");
  });
});
