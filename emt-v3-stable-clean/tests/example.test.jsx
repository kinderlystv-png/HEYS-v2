import { describe, it, expect } from 'vitest';

import { userFactory } from './fixtures/factories';

describe('ЭМТ v3.0-stable Example Tests', () => {
  it('should pass basic assertion', () => {
    expect(true).toBe(true);
  });

  it('should use data factory', () => {
    const user = userFactory({ name: 'John Doe' });
    expect(user.name).toBe('John Doe');
    expect(user.email).toBe('test@example.com');
    expect(user.id).toBeDefined();
  });

  

  it('should handle async operations', async () => {
    const promise = Promise.resolve('async result');
    const result = await promise;
    expect(result).toBe('async result');
  });
});