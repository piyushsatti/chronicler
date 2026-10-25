import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    // Vitest defaults to CPU count minus one workers, which is one worker on the
    // 2-vCPU CI runner. Two workers cut the suite from about 284 s to 172 s there.
    // minWorkers too, or it defaults above 2 on bigger machines and conflicts.
    maxWorkers: process.env.CI ? 2 : undefined,
    minWorkers: process.env.CI ? 2 : undefined,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
