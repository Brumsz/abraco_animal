import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/domain/**', 'src/modules/**/application/**'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
