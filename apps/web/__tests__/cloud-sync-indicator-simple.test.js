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
    // Проверка «тумблер свет/тьма живёт в шапке постоянной иконкой, а не
    // временной» устарела 2026-08-24: строка «что в шапке» (tips.v4.dc.html —
    // владелец группы иконок) оставляет ровно два адреса, лампочку и ползунки,
    // а строка «шторка в приложении» (login.v4.dc.html) отдаёт смену оформления
    // шторке настроек. Тумблер в шапке снят целиком, поэтому проверка
    // перевёрнута: сторожим отсутствие, а не форму.
    expect(shellSource).not.toContain('hdr-header-icon-btn--theme');
    expect(shellSource).not.toContain('toggleModePreference');
    expect(shellSource).not.toContain('hdr-theme-toggle-temp');
    expect(shellSource).not.toContain('theme-toggle-temp');
    // Возможность не потеряна: обе оси остались в строке «Оформление» шторки.
    expect(shellSource).toContain("label: 'Оформление'");
    expect(shellSource).toContain('setModePreference');
    expect(shellSource).toContain('setPalette');
  });

  it('skips checkmark flash after sync', () => {
    expect(shellSource).toContain("if (cloudStatus === 'synced')");
    expect(shellSource).toContain("setDisplayStatus('idle')");
    expect(shellSource).not.toContain("setDisplayStatus('synced')");
  });
});
