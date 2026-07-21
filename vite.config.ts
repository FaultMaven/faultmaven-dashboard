/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
      '~lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 3333,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      // Ratchet floors set just below current coverage so it can't silently sink.
      // Raise these as coverage improves; never lower them to make a PR pass.
      thresholds: {
        statements: 30,
        branches: 24,
        functions: 22,
        lines: 32,
      },
    },
  },
});
