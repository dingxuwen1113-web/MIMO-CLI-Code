import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/dispatch.test.ts', 'src/__tests__/permissions.test.ts'],
    testTimeout: 30000,
    hookTimeout: 15000,
    reporters: ['verbose'],
  },
});
