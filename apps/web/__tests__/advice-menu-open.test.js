import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../day/_advice.js'), 'utf8');

describe('advice menu manual open', () => {
  it('opens the advice drawer synchronously instead of deferring state updates', () => {
    const handlerMatch = source.match(/const handleShowAdvice = \(\) => \{[\s\S]*?window\.addEventListener\('heysShowAdvice', handleShowAdvice\);/);

    expect(handlerMatch).toBeTruthy();
    const handlerSource = handlerMatch[0];

    expect(handlerSource).toContain("setAdviceTrigger('manual')");
    expect(handlerSource).toContain('setAdviceExpanded(true)');
    expect(handlerSource).toContain('setToastVisible(true)');
    expect(handlerSource).toContain('_runUpdate();');
    expect(handlerSource).not.toContain('React.startTransition(_runUpdate)');
  });
});
