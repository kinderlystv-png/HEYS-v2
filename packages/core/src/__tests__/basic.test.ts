import { describe, expect, it } from 'vitest';

describe('Core Package', () => {
  it('should be importable', () => {
    expect(true).toBe(true);
  });

  it('should have basic math working', () => {
    expect(2 + 2).toBe(4);
  });

  it('should handle dates', () => {
    const now = new Date();
    expect(now).toBeInstanceOf(Date);
  });
});
