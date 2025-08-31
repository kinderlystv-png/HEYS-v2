import { describe, it, expect } from 'vitest';

describe('Мой первый тест', () => {
  it('должен проверить, что 2 + 2 = 4', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
  });

  it('должен проверить, что строки работают', () => {
    const greeting = 'Привет, мир!';
    expect(greeting).toContain('мир');
  });

  it('должен проверить массивы', () => {
    const fruits = ['яблоко', 'банан', 'апельсин'];
    expect(fruits).toHaveLength(3);
    expect(fruits).toContain('банан');
  });
});
