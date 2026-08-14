/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
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
    // A git worktree checked out under the repo (`git worktree add
    // .worktrees/<name>`) is a second, usually stale copy of this whole suite.
    // Vitest globs the filesystem and does not read .gitignore, so without this
    // the local run silently collects both copies: a leftover worktree once put
    // `pnpm test` at 103 files / 889 tests instead of 53 / 456, and a green run
    // could be coming from the wrong tree entirely. CI checks out one tree and
    // was never affected — this is a local-only footgun, which is exactly why
    // it went unnoticed.
    //
    // Spread the defaults rather than replacing them: assigning `exclude`
    // overrides vitest's list wholesale, so a bare array would silently stop
    // excluding node_modules.
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
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
