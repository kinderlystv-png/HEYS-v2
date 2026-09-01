import { describe, expect, it } from 'vitest';
import { countShorthandAddresses } from '../../../scripts/lib/ui-v4-addresses.mjs';

describe('ui-v4 verdict address shorthand metric', () => {
  it('counts only unresolved aliases', () => {
    expect(countShorthandAddresses('ui:2513; css:10741')).toBe(2);
    expect(countShorthandAddresses('source ui:2513 and apps/web/file.js:42')).toBe(1);
  });

  it('does not count suffixes of complete file addresses', () => {
    expect(countShorthandAddresses([
      'apps/web/file.js:42',
      'apps/web/file.test.mjs:7',
      'apps/web/view.tsx:19',
      'apps/web/styles/main.css:3',
      'database/change.sql:88',
    ].join('; '))).toBe(0);
  });
});
