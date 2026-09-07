import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

const WEB_DIR = path.resolve(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

function sourceOf(relPath) {
  return fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
}

beforeAll(() => {
  window.React = React;
  window.HEYS = window.HEYS || {};
  window.HEYS.exerciseMeta = {
    list: () => [],
    get: () => null,
    groupLabel: () => '',
  };
  loadScript('strength/heys_strength_catalog_ui_v1.js');
});

describe('силовой · звезда Lucide, не текстовый глиф', () => {
  it('каталог и день не содержат литералов ★/☆ в исходниках', () => {
    const catalog = sourceOf('strength/heys_strength_catalog_ui_v1.js');
    const day = sourceOf('heys_day_trainings_v1.js');
    expect(catalog).not.toMatch(/['']★['']|['']☆['']/);
    expect(day).not.toMatch(/['']★['']|['']☆['']/);
    expect(catalog).toContain('LucideStarIcon');
    expect(day).toContain('LucideStarIcon');
  });

  it('LucideStarIcon рендерит svg, а не текстовую звезду', () => {
    const Icon = window.HEYS.StrengthCatalogUI.LucideStarIcon;
    const { container } = render(React.createElement(Icon, { filled: true, size: 16 }));
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.textContent).not.toContain('★');
    expect(container.textContent).not.toContain('☆');
  });
});
