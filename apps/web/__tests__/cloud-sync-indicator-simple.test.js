import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shellSource = readFileSync(
  resolve(__dirname, '../heys_app_shell_v1.js'),
  'utf8',
);

describe('cloud sync indicator (simplified)', () => {
  it('uses only cloud in header badge (shimmer while syncing)', () => {
    expect(shellSource).toContain('cloudIndicatorClass');
    expect(shellSource).toContain("cloudIndicatorClass === 'syncing'");
    expect(shellSource).toContain("return 'problem'");
    expect(shellSource).toContain("'syncing' ? 'syncing'");
    expect(shellSource).not.toContain('sync-spinner');
    expect(shellSource).not.toContain('cloud-icon synced');
    expect(shellSource).not.toContain('sync-spinner');
    expect(shellSource).toContain('hdr-header-icon-btn--theme');
    expect(shellSource).toContain('toggleModePreference');
    expect(shellSource).not.toContain('hdr-theme-toggle-temp');
    expect(shellSource).not.toContain('theme-toggle-temp');
  });

  it('skips checkmark flash after sync', () => {
    expect(shellSource).toContain("if (cloudStatus === 'synced')");
    expect(shellSource).toContain("setDisplayStatus('idle')");
    expect(shellSource).not.toContain("setDisplayStatus('synced')");
  });
});
