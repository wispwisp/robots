import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    setupFiles: ['src/test/setupSkulpt.ts'],
    include: ['src/**/*.test.ts'],
  },
});
