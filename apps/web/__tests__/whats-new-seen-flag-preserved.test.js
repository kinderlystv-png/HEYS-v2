/**
 * @fileoverview Regression guard: the whats-new seen/acknowledged flag must
 * survive logout and the update-session reset.
 *
 * The modal stores the acknowledged release in browser-global localStorage keys
 * (`heys_whats_new_last_acknowledged` / `heys_whats_new_last_seen`). Updates used
 * to reset the session through two paths, and both removed those keys:
 * `cloud.signOut()` -> `clearNamespace()` and the extra requires_logout wipe in
 * `heys_platform_apis_v1.js`. After that, the same release looked unread again.
 *
 * Legacy IIFEs do not expose these internals for direct assertions, so this test
 * combines source-level contract checks with a small behavioural replica.
 */

import { describe, expect, it } from 'vitest';

const fs = require('node:fs');
const path = require('node:path');

const storageSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_storage_supabase_v1.js'),
  'utf8',
);
const platformSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_platform_apis_v1.js'),
  'utf8',
);

describe('whats-new seen flag is a browser-global key', () => {
  it('NON_CLIENT_DATA_BLACKLIST contains both whats-new keys', () => {
    const start = storageSrc.indexOf('const NON_CLIENT_DATA_BLACKLIST = [');
    if (start < 0) {
      throw new Error('Test setup: `const NON_CLIENT_DATA_BLACKLIST = [` not found');
    }
    const area = storageSrc.slice(start, start + 2000);
    expect(area).toContain("'heys_whats_new_last_seen'");
    expect(area).toContain("'heys_whats_new_last_acknowledged'");
  });
});

describe('clearNamespace() full-wipe preserves browser-global UI keys', () => {
  it('full-wipe branch guards removal with !isNonClientDataKey(k)', () => {
    const marker = 'Full wipe removes our client/session keys';
    const start = storageSrc.indexOf(marker);
    if (start < 0) {
      throw new Error('Test setup: clearNamespace full-wipe marker not found');
    }
    // The removeItem guard lives directly after the marker comment.
    const area = storageSrc.slice(start, start + 600);
    expect(area).toContain('!isNonClientDataKey(k)');
    expect(area).toContain('ls.removeItem(k)');
  });
});

describe('update-session reset (platform_apis) preserves browser-global UI keys', () => {
  it('requires_logout wipe loop skips isNonClientDataKey keys', () => {
    const start = platformSrc.indexOf('const keysToKeep =');
    if (start < 0) {
      throw new Error('Test setup: keysToKeep marker not found in heys_platform_apis_v1.js');
    }
    const area = platformSrc.slice(start, start + 900);
    // The wipe uses cloud.isNonClientDataKey as the single source of truth.
    expect(area).toContain('isNonClientDataKey');
    expect(area).toContain('keysToRemove.push(key)');
  });
});

describe('behavioural: combined wipe rule keeps whats-new, drops client data', () => {
  // Replica of the combined reset rule: remove our keys except browser-global UI
  // keys and dayv2 entries.
  const NON_CLIENT_DATA_BLACKLIST = [
    'heys_theme',
    'heys_whats_new_last_seen',
    'heys_whats_new_last_acknowledged',
    'heys_push_onboarded',
    'heys_widget_layout_v1',
  ];
  const isOurKey = (k) => typeof k === 'string' && k.indexOf('heys_') === 0;
  const isNonClientDataKey = (k) => NON_CLIENT_DATA_BLACKLIST.includes(k);

  function wipeKeepingGlobals(store) {
    const survivors = {};
    for (const k of Object.keys(store)) {
      const removed = isOurKey(k) && !isNonClientDataKey(k) && !k.startsWith('heys_dayv2_');
      if (!removed) survivors[k] = store[k];
    }
    return survivors;
  }

  it('keeps whats-new acknowledged flag and theme across a session reset', () => {
    const before = {
      heys_whats_new_last_acknowledged: '2026.06.06.2edf2ac1',
      heys_whats_new_last_seen: '2026.06.06.2edf2ac1',
      heys_theme: 'dark',
      'heys_dayv2_2026-06-06': '{}',
      'heys_3f2a...client_scoped_meals': '[]',
      heys_curator_session: 'jwt',
    };
    const after = wipeKeepingGlobals(before);

    expect(after.heys_whats_new_last_acknowledged).toBe('2026.06.06.2edf2ac1');
    expect(after.heys_whats_new_last_seen).toBe('2026.06.06.2edf2ac1');
    expect(after.heys_theme).toBe('dark');
    expect(after['heys_dayv2_2026-06-06']).toBe('{}');
    // Client-scoped data is still wiped by the reset (regression: only globals kept).
    expect(after['heys_3f2a...client_scoped_meals']).toBeUndefined();
  });
});
