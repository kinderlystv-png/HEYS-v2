import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Годовые кампании CPU-heavy. Один fork не даёт пакетному прогону
    // одновременно забивать ноутбук несколькими симуляциями.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
