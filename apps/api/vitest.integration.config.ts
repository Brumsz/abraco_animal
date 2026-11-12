import { defineConfig } from 'vitest/config';

/** Testes de integração: Postgres e Redis reais via Testcontainers (exigem Docker). */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // Um arquivo por vez: cada um sobe os próprios containers.
    fileParallelism: false,
  },
});
