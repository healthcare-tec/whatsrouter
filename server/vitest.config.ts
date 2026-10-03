import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    },
    testTimeout: 20000
  }
});