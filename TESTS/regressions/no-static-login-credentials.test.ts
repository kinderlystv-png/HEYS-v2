import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const indexSource = readFileSync(path.resolve(process.cwd(), 'apps/web/index.html'), 'utf8');

describe('static login credential guard', () => {
  it('keeps the legacy autologin config free of embedded credentials', () => {
    const config = indexSource.match(/var TEMP_CURATOR_AUTOLOGIN = \{([\s\S]*?)\n\s*\};/)?.[1];

    expect(config).toBeTruthy();
    expect(config).not.toMatch(/\bemail\s*:/);
    expect(config).not.toMatch(/\bpassword\s*:/);
  });
});
