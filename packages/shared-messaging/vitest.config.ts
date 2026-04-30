import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: false,
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
