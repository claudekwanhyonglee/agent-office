import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { outDir: 'dist/client', emptyOutDir: true, chunkSizeWarningLimit: 1000 }, // three.js is one big chunk
  server: { proxy: { '/api': 'http://127.0.0.1:4321' } },
  test: { include: ['test/**/*.test.ts'] },
});
