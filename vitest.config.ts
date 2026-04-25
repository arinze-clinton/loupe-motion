import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}', 'cli/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
