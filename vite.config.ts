import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:4321' } },
  test: { include: ['test/**/*.test.ts'] },
});
