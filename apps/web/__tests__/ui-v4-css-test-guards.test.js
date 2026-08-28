import { describe, expect, it } from 'vitest';

import { classifyCssGuard } from '../../../scripts/ui-v4-check-css-test-guards.mjs';

describe('UI v4 — CSS-страж не ищет свойство в соседнем правиле', () => {
  it('различает совпадение внутри правила и переход через закрывающую скобку', () => {
    const guard = { source: '\\.target \\{[\\s\\S]*?height: 10px', flags: '' };
    expect(classifyCssGuard(guard, '.scope .target { color: red; height: 10px; }')).toMatchObject({
      kind: 'bounded-now',
    });
    expect(
      classifyCssGuard(guard, '.scope .target { color: red; }\n.other { height: 10px; }'),
    ).toMatchObject({ kind: 'crosses-rule' });
  });

  it('не выдаёт вложенный @media scope за проверку одного правила', () => {
    const guard = {
      source: '@media \\(max-width: 480px\\) \\{[\\s\\S]*?--widget-row-height: 64px',
      flags: '',
    };
    expect(classifyCssGuard(guard, '@media (max-width: 480px) { .x { --widget-row-height: 64px; } }'))
      .toMatchObject({ kind: 'nested-scope' });
  });
});
