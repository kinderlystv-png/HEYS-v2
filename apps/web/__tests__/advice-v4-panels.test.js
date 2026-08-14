import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const adviceUiSource = fs.readFileSync(
  path.join(process.cwd(), 'day/_advice.js'),
  'utf8'
);

describe('advice v4 panels from canvas', () => {
  it('exposes read/hide/sync/service surfaces', () => {
    expect(adviceUiSource).toContain('renderAdviceReadFeedbackPanel');
    expect(adviceUiSource).toContain('renderAdviceHideUndoPanel');
    expect(adviceUiSource).toContain('renderAdviceSyncBanner');
    expect(adviceUiSource).toContain('renderAdviceServiceScreen');
    expect(adviceUiSource).toContain('AdviceRulesPoolModal');
    expect(adviceUiSource).toContain('advice-list-container--v4');
    expect(adviceUiSource).toContain('advice-v4-detail');
    expect(adviceUiSource).toContain('renderAdviceV4Icon');
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'thumb-up')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'thumb-down')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'cloud-off')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'chevron-left')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'chevron-right')");
    expect(adviceUiSource).toContain('advice-v4-icon--check');
    expect(adviceUiSource).toContain('advice-v4-sync-head');
    expect(adviceUiSource).toContain('formatAdviceSyncCountLabel');
    expect(adviceUiSource).toContain('Два совета отмечены');
    expect(adviceUiSource).toContain('Совет скрыт до завтра');
    expect(adviceUiSource).toContain('Отметки не сохранились');
    expect(adviceUiSource).toContain('advice-v4-hide-ring');
    expect(adviceUiSource).toContain('viewBox: \'0 0 36 36\'');
    expect(adviceUiSource).toContain('Понятно');
  });

  it('drawer title matches canvas without inline toggles', () => {
    expect(adviceUiSource).toMatch(/advice-list-title' \}, 'Советы'/);
    expect(adviceUiSource).not.toMatch(/💡 Советы/);
    expect(adviceUiSource).toContain('тап — открыть');
  });

  it('moves curator tools behind service entry', () => {
    expect(adviceUiSource).toMatch(/_isCurator && \(adviceTraceAvailable \|\| adviceDiagnostics\)/);
    expect(adviceUiSource).not.toMatch(/title: 'Скопировать технический лог принятия решений по советам'/);
  });

  it('detail screen tokens match ad2a canvas', () => {
    const cssSource = fs.readFileSync(
      path.join(process.cwd(), 'styles/modules/400-water-and-hydration.css'),
      'utf8'
    );
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'close')");
    expect(adviceUiSource).toMatch(/Технические детали',\s*renderAdviceV4Icon\(React,\s*'chevron-right'\)/);
    expect(cssSource).toMatch(/\.advice-v4-detail-overlay[\s\S]*?background:\s*var\(--v4-bg,\s*#fffaf1\)/);
    expect(cssSource).toMatch(/\.advice-v4-detail__close[\s\S]*?background:\s*#f7efe2/);
    expect(cssSource).toMatch(/\.advice-v4-detail__science-box[\s\S]*?background:\s*#f7efe2/);
    expect(cssSource).toMatch(/\.advice-v4-detail__hero[\s\S]*?background:\s*#efe3cf/);
  });

  it('exposes canvas overlays: disclaimer, settings, toast, empty, science', () => {
    expect(adviceUiSource).toContain('renderAdviceSharedOverlays');
    expect(adviceUiSource).toContain('AdviceMedicalDisclaimerGate');
    expect(adviceUiSource).toContain('renderAdviceSettingsScreen');
    expect(adviceUiSource).toContain('advice-v4-disclaimer-overlay');
    expect(adviceUiSource).toContain('advice-v4-settings');
    expect(adviceUiSource).toContain('advice-v4-toast-card');
    expect(adviceUiSource).toContain('Пока всё по плану — советов нет');
    expect(adviceUiSource).toContain('Первый совет');
    expect(adviceUiSource).toContain('Научное описание');
    expect(adviceUiSource).toContain('heys:open-advice-settings');
    expect(adviceUiSource).toMatch(/renderMedicalDisclaimer\(\) \{\s*return null;/);
  });
});
