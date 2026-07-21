import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const SUPPLEMENTS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_supplements_v1.js'), 'utf8');

describe('supplements diary card visibility', () => {
  it('hides the empty card through the same profile toggle used by settings', () => {
    expect(SUPPLEMENTS_SRC).toContain("profile.showDiarySupplementsPanel = enabled !== false");
    expect(SUPPLEMENTS_SRC).toContain("saveProfileSafe(profile, 'showDiarySupplementsPanel')");
    expect(SUPPLEMENTS_SRC).toContain("new CustomEvent('heys:diary-optional-panels-visibility-changed'");
    expect(SUPPLEMENTS_SRC).toContain("onClick: () => setDiarySupplementsPanelEnabled(false)");
    expect(SUPPLEMENTS_SRC).toContain("}, 'Скрыть карточку')");
  });
});
