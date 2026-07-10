import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

describe('StepModal render-loop contract', () => {
  it('keeps the same stepData object when no visible step needs initialization', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
    const initEffect = source.slice(
      source.indexOf('// Инициализация данных шагов'),
      source.indexOf('const getStepSaveSignature')
    );

    expect(initEffect).toContain('let changed = false;');
    expect(initEffect).toContain('changed = true;');
    expect(initEffect).toContain('return changed ? next : prev;');
    expect(initEffect).not.toContain('return next;');
  });
});
